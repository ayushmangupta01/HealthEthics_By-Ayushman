/* =========================================================
   HealthEthics — core.js
   Storage layer (localStorage-backed "database"), auth,
   view router and dashboard rendering.

   NOTE ON ARCHITECTURE:
   This build stores everything in the browser's localStorage
   so the whole app works with zero server setup. Every place
   that touches "the database" goes through the DB object below
   — swap its methods for real fetch() calls to Firebase/Node
   and nothing else in the app needs to change. See README.md.
   ========================================================= */

(function(){
  "use strict";

  /* ---------------- tiny "database" ---------------- */
  const DB_KEY = "he_users_v1";
  const SESSION_KEY = "he_session_v1";

  function loadUsers(){
    try { return JSON.parse(localStorage.getItem(DB_KEY)) || {}; }
    catch(e){ return {}; }
  }
  function saveUsers(users){
    localStorage.setItem(DB_KEY, JSON.stringify(users));
  }

  // Simple non-cryptographic hash — fine for a client-only demo,
  // NOT a substitute for real password hashing (bcrypt/argon2) on a server.
  function simpleHash(str){
    let h = 0;
    for (let i=0;i<str.length;i++){
      h = (Math.imul(31,h) + str.charCodeAt(i)) | 0;
    }
    return "h" + Math.abs(h).toString(36) + str.length;
  }

  const DB = {
    register(email, password, profile){
      const users = loadUsers();
      const key = email.trim().toLowerCase();
      if (users[key]) return { ok:false, error:"An account with this email already exists." };
      users[key] = {
        email:key,
        passwordHash: simpleHash(password),
        profile: Object.assign({ name:"", age:null, gender:"other" }, profile),
        healthLogs: [],       // calculator results over time
        progressLogs: [],     // weight/mood/water entries
        wellnessLogs: [],     // GAD-7 / PHQ-9 results
        reminders: [],
        plan: null,
        planHistory: [],
        dailyLogs: {},
        onboarded: false,
        createdAt: Date.now()
      };
      saveUsers(users);
      return { ok:true, user: users[key] };
    },
    login(email, password){
      const users = loadUsers();
      const key = email.trim().toLowerCase();
      const user = users[key];
      if (!user || user.passwordHash !== simpleHash(password)){
        return { ok:false, error:"Email or password is incorrect." };
      }
      return { ok:true, user };
    },
    get(email){
      const users = loadUsers();
      return users[email.trim().toLowerCase()];
    },
    save(user){
      const users = loadUsers();
      users[user.email] = user;
      saveUsers(users);
    }
  };

  /* ---------------- session ---------------- */
  const Session = {
    current(){
      const email = localStorage.getItem(SESSION_KEY);
      if (!email) return null;
      return DB.get(email) || null;
    },
    start(email){ localStorage.setItem(SESSION_KEY, email); },
    end(){ localStorage.removeItem(SESSION_KEY); }
  };

  // Expose globally for the other modules (health-tools.js, ai-engine.js, tracking.js)
  window.HE = window.HE || {};
  window.HE.DB = DB;
  window.HE.Session = Session;

  window.HE.currentUser = function(){ return Session.current(); };
  window.HE.persist = function(user){ DB.save(user); };

  /* ---------------- DOM helpers ---------------- */
  const $ = (sel, ctx) => (ctx||document).querySelector(sel);
  const $$ = (sel, ctx) => Array.from((ctx||document).querySelectorAll(sel));
  window.HE.$ = $; window.HE.$$ = $$;

  /* ---------------- landing hero decoration ---------------- */
  function drawSealTicks(){
    const g = document.getElementById("seal-ticks");
    if (!g) return;
    const cx=160, cy=160, r1=136, r2=146;
    let html = "";
    for (let i=0;i<24;i++){
      const angle = (i/24) * Math.PI * 2;
      const x1 = cx + r1*Math.cos(angle), y1 = cy + r1*Math.sin(angle);
      const x2 = cx + r2*Math.cos(angle), y2 = cy + r2*Math.sin(angle);
      html += `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}"/>`;
    }
    g.innerHTML = html;
  }

  /* ---------------- auth modal ---------------- */
  function openAuth(tab){
    $("#auth-overlay").classList.remove("hidden");
    setAuthTab(tab || "login");
  }
  function closeAuth(){
    $("#auth-overlay").classList.add("hidden");
    $("#login-error").textContent = "";
    $("#register-error").textContent = "";
  }
  function setAuthTab(tab){
    $$(".auth-tab").forEach(b => b.classList.toggle("active", b.dataset.auth === tab));
    $("#form-login").classList.toggle("active", tab === "login");
    $("#form-register").classList.toggle("active", tab === "register");
  }

  function refreshTopbarForSession(){
    const user = Session.current();
    const loggedIn = !!user;
    $("#nav-login-btn").classList.toggle("hidden", loggedIn);
    $("#nav-signup-btn").classList.toggle("hidden", loggedIn);
    $("#user-menu").classList.toggle("hidden", !loggedIn);
    $("#streak-pill").classList.toggle("hidden", !loggedIn);
    $("#landing-links").classList.toggle("hidden", loggedIn);
    if (loggedIn){
      const initial = (user.profile.name || user.email || "?").trim().charAt(0).toUpperCase();
      $("#user-initial").textContent = initial;
      $("#user-dropdown-name").textContent = user.profile.name || user.email;
      $("#streak-count").textContent = computeStreak(user);
    }
  }

  function dateKey(d){
    return d.getFullYear() + "-" + String(d.getMonth()+1).padStart(2,"0") + "-" + String(d.getDate()).padStart(2,"0");
  }
  window.HE.dateKey = dateKey;

  function isActiveDate(user, d){
    const key = dateKey(d);
    const hasProgress = (user.progressLogs||[]).some(l => new Date(l.date).toDateString() === d.toDateString());
    const day = (user.dailyLogs||{})[key];
    const hasDailyActivity = day && (day.workoutDone || day.dietDone || (day.exercisesDone && Object.keys(day.exercisesDone).length));
    return hasProgress || !!hasDailyActivity;
  }
  window.HE.isActiveDate = isActiveDate;

  function computeStreak(user){
    let streak = 0;
    let d = new Date();
    while (isActiveDate(user, d)){
      streak++;
      d.setDate(d.getDate()-1);
    }
    return streak;
  }
  window.HE.computeStreak = computeStreak;

  /* ---------------- app shell / view router ---------------- */
  function showApp(){
    $("#landing-page").classList.add("hidden");
    $("#app-shell").classList.remove("hidden");
    refreshTopbarForSession();
    window.HE.renderDashboard && window.HE.renderDashboard();
  }
  window.HE.showApp = showApp;

  function enterApp(){
    showApp();
    const user = Session.current();
    if (user && !user.onboarded && window.HE.startOnboarding){
      window.HE.startOnboarding();
    }
  }
  window.HE.enterApp = enterApp;
  function showLanding(){
    $("#app-shell").classList.add("hidden");
    $("#landing-page").classList.remove("hidden");
    refreshTopbarForSession();
  }
  function goToView(view){
    $$(".side-link").forEach(b => b.classList.toggle("active", b.dataset.view === view));
    $$(".view").forEach(v => v.classList.toggle("active", v.id === "view-" + view));
    if (view === "dashboard" && window.HE.renderDashboard) window.HE.renderDashboard();
    if (view === "progress" && window.HE.renderProgress) window.HE.renderProgress();
    if (view === "reminders" && window.HE.renderReminders) window.HE.renderReminders();
    if (view === "wellness" && window.HE.renderWellness) window.HE.renderWellness();
    if (view === "chatbot" && window.HE.renderChatbotWelcome) window.HE.renderChatbotWelcome();
    if (view === "calendar" && window.HE.renderCalendar) window.HE.renderCalendar();
    if (view === "workouts" && window.HE.initSessionSetup) window.HE.initSessionSetup();
  }
  window.HE.goToView = goToView;

  /* ---------------- dashboard ---------------- */
  function renderDashboard(){
    const user = Session.current();
    if (!user) return;
    $("#dash-greeting").textContent = `Welcome back, ${user.profile.name || "there"}`;
    $("#streak-count").textContent = computeStreak(user);

    if (window.HE.maybeRegeneratePlan) window.HE.maybeRegeneratePlan(user);

    const latestBMI = [...(user.healthLogs||[])].reverse().find(l => l.type === "bmi");
    const latestCal = [...(user.healthLogs||[])].reverse().find(l => l.type === "calories");
    const latestBP  = [...(user.healthLogs||[])].reverse().find(l => l.type === "bp");
    const latestMood = [...(user.progressLogs||[])].reverse()[0];

    const stats = [
      { label:"BMI", value: latestBMI ? latestBMI.data.bmi : "—", meta: latestBMI ? latestBMI.data.category : "Run the BMI calculator" },
      { label:"Daily calorie target", value: latestCal ? latestCal.data.tdee + " kcal" : "—", meta: latestCal ? latestCal.data.goalNote || "Maintenance" : "Run the calorie calculator" },
      { label:"Blood pressure", value: latestBP ? `${latestBP.data.systolic}/${latestBP.data.diastolic}` : "—", meta: latestBP ? latestBP.data.category : "Not checked yet" },
      { label:"Latest mood", value: latestMood ? moodLabel(latestMood.mood) : "—", meta: latestMood ? new Date(latestMood.date).toLocaleDateString() : "Log today's mood" }
    ];
    $("#dash-stats").innerHTML = stats.map(s => `
      <div class="stat-card">
        <div class="stat-label">${s.label.toUpperCase()}</div>
        <div class="stat-value">${s.value}</div>
        <div class="stat-meta">${s.meta}</div>
      </div>`).join("");

    // today's focus
    const focusEl = $("#dash-today");
    if (user.plan){
      const today = window.HE.getPlanDayForDate ? window.HE.getPlanDayForDate(user, new Date()) : user.plan.workout.days[0];
      focusEl.innerHTML = `<p><strong>${today.name}</strong> — ${today.focus}<br>
      Aim for ${user.plan.diet.targetCalories} kcal today, roughly ${user.plan.diet.macros.protein}g protein.</p>`;
    } else {
      focusEl.innerHTML = `<p>No plan yet. Generate one from your calculator results to see a daily focus here.</p>`;
    }

    // mental wellness snapshot
    const latestW = [...(user.wellnessLogs||[])].reverse()[0];
    $("#dash-wellness").innerHTML = latestW
      ? `<p><strong>${latestW.type.toUpperCase()}</strong> — ${latestW.band} (score ${latestW.score})<br><span style="font-size:.82rem;color:var(--ink-soft)">Checked ${new Date(latestW.date).toLocaleDateString()}</span></p>`
      : `<p>You haven't done a check-in yet. It takes about two minutes.</p>`;

    // 7-day chart
    if (window.HE.renderDashChart) window.HE.renderDashChart(user);
  }
  function moodLabel(m){
    return {5:"Great",4:"Good",3:"Okay",2:"Low",1:"Struggling"}[m] || "—";
  }
  window.HE.renderDashboard = renderDashboard;
  window.HE.moodLabel = moodLabel;

  /* ---------------- wire up events on load ---------------- */
  document.addEventListener("DOMContentLoaded", () => {
    drawSealTicks();
    $("#footer-year").textContent = new Date().getFullYear();

    // landing CTAs
    $("#nav-login-btn").addEventListener("click", () => openAuth("login"));
    $("#nav-signup-btn").addEventListener("click", () => openAuth("register"));
    $("#hero-signup-btn").addEventListener("click", () => openAuth("register"));
    $("#hero-demo-btn").addEventListener("click", () => document.getElementById("features").scrollIntoView({behavior:"smooth"}));
    $("#brand-home").addEventListener("click", () => {
      if (Session.current()) goToView("dashboard"); else showLanding();
    });
    $("#auth-close").addEventListener("click", closeAuth);
    $("#auth-overlay").addEventListener("click", (e) => { if (e.target.id === "auth-overlay") closeAuth(); });
    $$(".auth-tab").forEach(b => b.addEventListener("click", () => setAuthTab(b.dataset.auth)));

    // user menu dropdown
    $("#user-chip-btn").addEventListener("click", () => $("#user-dropdown").classList.toggle("open"));
    document.addEventListener("click", (e) => {
      if (!e.target.closest(".user-menu")) $("#user-dropdown").classList.remove("open");
    });
    $("#logout-btn").addEventListener("click", () => {
      Session.end();
      showLanding();
    });

    // sidebar nav
    $$(".side-link").forEach(b => b.addEventListener("click", () => goToView(b.dataset.view)));
    $$("[data-goto]").forEach(b => b.addEventListener("click", (e) => { e.preventDefault(); goToView(b.dataset.goto); }));

    // login form
    $("#form-login").addEventListener("submit", (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const res = DB.login(fd.get("email"), fd.get("password"));
      if (!res.ok){ $("#login-error").textContent = res.error; return; }
      Session.start(res.user.email);
      closeAuth();
      enterApp();
    });

    // register form
    $("#form-register").addEventListener("submit", (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const password = fd.get("password");
      if (password.length < 6){ $("#register-error").textContent = "Password needs at least 6 characters."; return; }
      const res = DB.register(fd.get("email"), password, {
        name: fd.get("name"),
        age: Number(fd.get("age")),
        gender: fd.get("gender")
      });
      if (!res.ok){ $("#register-error").textContent = res.error; return; }
      Session.start(res.user.email);
      closeAuth();
      enterApp();
    });

    // resume session if one exists
    if (Session.current()) showApp(); else showLanding();
  });

})();
