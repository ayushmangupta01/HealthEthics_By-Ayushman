/* =========================================================
   HealthEthics — tracking.js
   Progress logging + Chart.js visualisations, the live-workout
   library with an in-page session timer, and browser-notification
   based reminders.
   ========================================================= */
(function(){
  "use strict";
  const $ = window.HE.$, $$ = window.HE.$$;
  let dashChart, weightChart, moodChart;

  /* ==========================================================
     PROGRESS LOGGING
     ========================================================== */
  function initProgressForm(){
    $("#form-log").addEventListener("submit", (e) => {
      e.preventDefault();
      const user = window.HE.currentUser();
      if (!user) return;
      const fd = new FormData(e.target);
      const entry = {
        date: Date.now(),
        weight: fd.get("weight") ? Number(fd.get("weight")) : null,
        mood: Number(fd.get("mood")),
        water: fd.get("water") ? Number(fd.get("water")) : null
      };
      user.progressLogs = user.progressLogs || [];
      user.progressLogs.push(entry);
      window.HE.persist(user);
      e.target.reset();
      renderProgress();
      window.HE.renderDashboard && window.HE.renderDashboard();
    });
  }

  function deleteLog(index){
    const user = window.HE.currentUser();
    user.progressLogs.splice(index,1);
    window.HE.persist(user);
    renderProgress();
    window.HE.renderDashboard && window.HE.renderDashboard();
  }
  window.HE._deleteLog = deleteLog;

  function renderProgress(){
    const user = window.HE.currentUser();
    if (!user) return;
    const logs = user.progressLogs || [];

    // table
    const tbody = $("#log-table tbody");
    tbody.innerHTML = [...logs].reverse().map((l, i) => {
      const realIndex = logs.length - 1 - i;
      return `<tr>
        <td>${new Date(l.date).toLocaleDateString()}</td>
        <td>${l.weight ?? "—"}</td>
        <td>${window.HE.moodLabel(l.mood)}</td>
        <td>${l.water ?? "—"}</td>
        <td><button data-i="${realIndex}" class="del-log">Remove</button></td>
      </tr>`;
    }).join("") || `<tr><td colspan="5" style="color:var(--ink-soft)">No entries yet — add today's above.</td></tr>`;

    $$(".del-log").forEach(btn => btn.addEventListener("click", () => deleteLog(Number(btn.dataset.i))));

    // charts
    const labels = logs.map(l => new Date(l.date).toLocaleDateString(undefined, {month:"short", day:"numeric"}));
    const weights = logs.map(l => l.weight);
    const moods = logs.map(l => l.mood);

    if (weightChart) weightChart.destroy();
    weightChart = new Chart($("#progress-weight-chart"), {
      type: "line",
      data: { labels, datasets: [{ label:"Weight (kg)", data: weights, borderColor:"#163832", backgroundColor:"rgba(22,56,50,.1)", tension:.3, spanGaps:true }] },
      options: chartOpts()
    });
    if (moodChart) moodChart.destroy();
    moodChart = new Chart($("#progress-mood-chart"), {
      type: "line",
      data: { labels, datasets: [{ label:"Mood (1–5)", data: moods, borderColor:"#B5493A", backgroundColor:"rgba(181,73,58,.1)", tension:.3 }] },
      options: Object.assign(chartOpts(), { scales:{ y:{ min:1, max:5, ticks:{ stepSize:1 } } } })
    });
  }
  function chartOpts(){
    return { responsive:true, plugins:{ legend:{ display:false } }, scales:{ y:{ beginAtZero:false } } };
  }
  window.HE.renderProgress = renderProgress;

  function renderDashChart(user){
    const logs = (user.progressLogs || []).slice(-7);
    const labels = logs.map(l => new Date(l.date).toLocaleDateString(undefined, {month:"short", day:"numeric"}));
    const weights = logs.map(l => l.weight);
    if (dashChart) dashChart.destroy();
    const canvas = $("#dash-chart");
    if (!canvas) return;
    dashChart = new Chart(canvas, {
      type:"line",
      data:{ labels, datasets:[{ label:"Weight", data:weights, borderColor:"#E2A63B", backgroundColor:"rgba(226,166,59,.15)", tension:.3, spanGaps:true }] },
      options: chartOpts()
    });
  }
  window.HE.renderDashChart = renderDashChart;

  /* ==========================================================
     REMINDERS (browser Notification API, runs while tab is open)
     Live/guided workouts now live in js/pose-coach.js (the
     avatar coach + camera session), triggered from the sidebar's
     "Guided Session" link.
     ========================================================== */
  function notify(title, body){
    if (window.Notification && Notification.permission === "granted"){
      new Notification(title, { body });
    } else {
      // fallback: quick in-page toast via chat-style alert
      console.log("[reminder]", title, body);
    }
  }

  const activeTimers = {};

  function scheduleReminder(reminder){
    if (activeTimers[reminder.id]) clearInterval(activeTimers[reminder.id]);
    activeTimers[reminder.id] = setInterval(() => {
      notify(reminder.label || reminder.type, "Time for your reminder.");
    }, reminder.interval * 60 * 1000);
  }

  function initReminders(){
    $("#notif-permission-btn").addEventListener("click", async () => {
      if (!window.Notification){ $("#notif-status").textContent = "Not supported in this browser."; return; }
      const perm = await Notification.requestPermission();
      $("#notif-status").textContent = perm === "granted" ? "Enabled ✓" : "Permission not granted";
    });
    if (window.Notification){
      $("#notif-status").textContent = Notification.permission === "granted" ? "Enabled ✓" : "";
    }

    $("#form-reminder").addEventListener("submit", (e) => {
      e.preventDefault();
      const user = window.HE.currentUser();
      if (!user) return;
      const fd = new FormData(e.target);
      const reminder = {
        id: "r" + Date.now(),
        type: fd.get("type"),
        label: fd.get("label") || fd.get("type"),
        interval: Number(fd.get("interval"))
      };
      user.reminders = user.reminders || [];
      user.reminders.push(reminder);
      window.HE.persist(user);
      e.target.reset();
      renderReminders();
    });
  }

  function removeReminder(id){
    const user = window.HE.currentUser();
    user.reminders = (user.reminders||[]).filter(r => r.id !== id);
    window.HE.persist(user);
    if (activeTimers[id]) clearInterval(activeTimers[id]);
    renderReminders();
  }
  window.HE._removeReminder = removeReminder;

  function renderReminders(){
    const user = window.HE.currentUser();
    if (!user) return;
    const list = $("#reminder-list");
    const reminders = user.reminders || [];
    list.innerHTML = reminders.map(r => `
      <div class="reminder-item">
        <div class="reminder-meta"><strong>${r.label}</strong><span>Every ${r.interval} minutes · ${r.type}</span></div>
        <div class="reminder-actions"><button data-id="${r.id}" class="rm-reminder">Remove</button></div>
      </div>
    `).join("") || `<p style="color:var(--ink-soft)">No reminders yet — add one above.</p>`;

    $$(".rm-reminder").forEach(btn => btn.addEventListener("click", () => removeReminder(btn.dataset.id)));
    reminders.forEach(scheduleReminder);
  }
  window.HE.renderReminders = renderReminders;

  document.addEventListener("DOMContentLoaded", () => {
    initProgressForm();
    initReminders();
  });

})();
