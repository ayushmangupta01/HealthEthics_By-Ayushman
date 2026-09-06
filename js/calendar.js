/* =========================================================
   HealthEthics — calendar.js
   Monthly calendar of the user's plan cycle + logged activity.
   Tapping a date shows that day's diet/workout (derived from
   the 7-day plan cycle) and lets the user mark it done.
   ========================================================= */
(function(){
  "use strict";
  const $ = window.HE.$, $$ = window.HE.$$;
  let viewYear, viewMonth; // 0-indexed month
  let selectedDateKey = null;

  function ensureDailyLog(user, key){
    user.dailyLogs = user.dailyLogs || {};
    if (!user.dailyLogs[key]) user.dailyLogs[key] = { workoutDone:false, dietDone:false, exercisesDone:{} };
    return user.dailyLogs[key];
  }
  window.HE.ensureDailyLog = ensureDailyLog;

  function renderCalendar(){
    const user = window.HE.currentUser();
    if (!user) return;
    const today = new Date();
    if (viewYear === undefined){ viewYear = today.getFullYear(); viewMonth = today.getMonth(); }

    $("#calendar-stats").innerHTML = `
      <div class="stat-card"><div class="stat-label">CURRENT STREAK</div><div class="stat-value">${window.HE.computeStreak(user)} days</div><div class="stat-meta">Consecutive active days</div></div>
      <div class="stat-card"><div class="stat-label">DAYS LOGGED THIS MONTH</div><div class="stat-value">${countLoggedThisMonth(user)}</div><div class="stat-meta">${new Date(viewYear,viewMonth).toLocaleDateString(undefined,{month:"long"})}</div></div>
      <div class="stat-card"><div class="stat-label">PLAN CYCLE</div><div class="stat-value">${user.plan ? "Active" : "None yet"}</div><div class="stat-meta">${user.plan ? "Repeats every 7 days" : "Generate one in AI Plans"}</div></div>
    `;

    $("#cal-month-label").textContent = new Date(viewYear, viewMonth).toLocaleDateString(undefined, { month:"long", year:"numeric" });

    const grid = $("#calendar-grid");
    const firstOfMonth = new Date(viewYear, viewMonth, 1);
    const startOffset = firstOfMonth.getDay(); // 0=Sun
    const daysInMonth = new Date(viewYear, viewMonth+1, 0).getDate();

    let cells = "";
    ["S","M","T","W","T","F","S"].forEach(d => cells += `<div class="cal-dow">${d}</div>`);
    for (let i=0;i<startOffset;i++) cells += `<div class="cal-cell empty"></div>`;

    for (let day=1; day<=daysInMonth; day++){
      const d = new Date(viewYear, viewMonth, day);
      const key = window.HE.dateKey(d);
      const isToday = d.toDateString() === today.toDateString();
      const active = window.HE.isActiveDate(user, d);
      const hasPlan = window.HE.getPlanDayForDate && window.HE.getPlanDayForDate(user, d);
      cells += `<button class="cal-cell ${isToday?"is-today":""} ${active?"is-active":""} ${!hasPlan?"no-plan":""}" data-key="${key}">
        <span class="cal-day-num">${day}</span>
        ${active ? '<span class="cal-dot"></span>' : ""}
      </button>`;
    }
    grid.innerHTML = cells;

    $$(".cal-cell:not(.empty)", grid).forEach(cell => {
      cell.addEventListener("click", () => showDayDetail(cell.dataset.key));
    });

    if (selectedDateKey) showDayDetail(selectedDateKey);
  }
  window.HE.renderCalendar = renderCalendar;

  function countLoggedThisMonth(user){
    let n = 0;
    const daysInMonth = new Date(viewYear, viewMonth+1, 0).getDate();
    for (let day=1; day<=daysInMonth; day++){
      if (window.HE.isActiveDate(user, new Date(viewYear, viewMonth, day))) n++;
    }
    return n;
  }

  function parseDateKey(key){
    const [y,m,d] = key.split("-").map(Number);
    return new Date(y, m-1, d);
  }

  function showDayDetail(key){
    selectedDateKey = key;
    const user = window.HE.currentUser();
    const d = parseDateKey(key);
    const panel = $("#day-detail-panel");
    panel.classList.remove("hidden");
    $("#day-detail-title").textContent = d.toLocaleDateString(undefined, { weekday:"long", month:"long", day:"numeric" });

    const planDay = window.HE.getPlanDayForDate(user, d);
    const log = ensureDailyLog(user, key);

    if (!planDay){
      $("#day-detail-body").innerHTML = `<p>No plan covers this date yet. Generate a plan under AI Plans to fill this in.</p>`;
      return;
    }

    $("#day-detail-body").innerHTML = `
      <div class="day-detail-grid">
        <div>
          <h4>${planDay.focus}</h4>
          <table class="plan-mini-table">
            ${planDay.exercises.map(ex => `
              <tr>
                <td><label><input type="checkbox" class="ex-done-cb" data-key="${ex.key}" ${log.exercisesDone[ex.key] ? "checked":""}> ${ex.name}</label></td>
                <td>${ex.durationSec ? Math.round(ex.durationSec/60*10)/10 + " min" : ex.sets + " × " + ex.reps}</td>
              </tr>`).join("")}
          </table>
          <button class="btn btn-solid btn-sm" id="day-start-session">Start this in Guided Session</button>
        </div>
        <div>
          <h4>Diet target</h4>
          ${user.plan ? `<p>${user.plan.diet.targetCalories} kcal · ${user.plan.diet.macros.protein}g protein</p>
          <ul class="diet-mini-list">
            <li><strong>Breakfast:</strong> ${user.plan.diet.meals.breakfast}</li>
            <li><strong>Lunch:</strong> ${user.plan.diet.meals.lunch}</li>
            <li><strong>Snack:</strong> ${user.plan.diet.meals.snack}</li>
            <li><strong>Dinner:</strong> ${user.plan.diet.meals.dinner}</li>
          </ul>
          <label><input type="checkbox" id="diet-done-cb" ${log.dietDone ? "checked":""}> Followed the diet today</label>` : "<p>No diet plan yet.</p>"}
        </div>
      </div>
    `;

    $$(".ex-done-cb").forEach(cb => cb.addEventListener("change", () => {
      log.exercisesDone[cb.dataset.key] = cb.checked ? 1 : 0;
      log.workoutDone = Object.values(log.exercisesDone).some(v => v);
      window.HE.persist(user);
      renderCalendar();
      window.HE.renderDashboard && window.HE.renderDashboard();
    }));
    const dietCb = $("#diet-done-cb");
    if (dietCb) dietCb.addEventListener("change", () => {
      log.dietDone = dietCb.checked;
      window.HE.persist(user);
      renderCalendar();
      window.HE.renderDashboard && window.HE.renderDashboard();
    });
    $("#day-start-session").addEventListener("click", () => {
      window.HE.sessionDateOverride = key;
      window.HE.goToView("workouts");
    });
  }

  document.addEventListener("DOMContentLoaded", () => {
    $("#cal-prev").addEventListener("click", () => {
      viewMonth--; if (viewMonth < 0){ viewMonth = 11; viewYear--; }
      renderCalendar();
    });
    $("#cal-next").addEventListener("click", () => {
      viewMonth++; if (viewMonth > 11){ viewMonth = 0; viewYear++; }
      renderCalendar();
    });
  });

})();
