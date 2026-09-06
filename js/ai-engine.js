/* =========================================================
   HealthEthics — ai-engine.js
   Rule-based "AI" plan generator (diet + workout) and the
   wellness assistant chatbot. Both are deterministic rule
   engines today — see README.md for how to point either one
   at a real model via the Anthropic/OpenAI API later.
   ========================================================= */
(function(){
  "use strict";
  const $ = window.HE.$, $$ = window.HE.$$;

  /* ==========================================================
     DIET & WORKOUT PLAN GENERATOR
     Inputs: latest BMI + calorie calculator results (if any),
     profession, diet preference, goal, training days/week.
     ========================================================== */

  const MEAL_LIBRARY = {
    veg: {
      breakfast: ["Vegetable poha with peanuts", "Moong dal chilla with mint chutney", "Oats upma with vegetables", "Besan cheela with curd"],
      lunch: ["Dal, brown rice, mixed vegetable sabzi, salad", "Rajma with roti and cucumber raita", "Chole with roti and salad", "Paneer bhurji with roti and sabzi"],
      dinner: ["Vegetable khichdi with curd", "Grilled paneer with sautéed vegetables", "Dal soup with multigrain roti", "Sprouts salad with roti"],
      snack: ["Roasted chana", "A bowl of fruit with peanuts", "Sprouts chaat", "Curd with flaxseed"]
    },
    nonveg: {
      breakfast: ["Egg bhurji with multigrain toast", "Boiled eggs with vegetable poha", "Chicken sandwich (grilled)", "Oats with a boiled egg on the side"],
      lunch: ["Grilled chicken breast, brown rice, sabzi", "Fish curry with rice and salad", "Egg curry with roti and salad", "Chicken with roti and dal"],
      dinner: ["Grilled fish with sautéed vegetables", "Chicken soup with multigrain roti", "Egg white omelette with salad", "Light chicken stew with vegetables"],
      snack: ["Boiled eggs", "Roasted chana", "Greek yoghurt with fruit", "A handful of nuts"]
    },
    vegan: {
      breakfast: ["Vegetable poha (no ghee)", "Oats with soy milk and fruit", "Besan cheela with chutney", "Tofu bhurji with toast"],
      lunch: ["Dal, brown rice, mixed vegetable sabzi", "Chickpea curry with roti", "Tofu stir-fry with rice", "Rajma with roti and salad"],
      dinner: ["Vegetable khichdi", "Tofu and vegetable stir-fry", "Lentil soup with multigrain roti", "Sprouts and vegetable salad"],
      snack: ["Roasted chana", "Fruit with almond butter", "Sprouts chaat", "A handful of nuts"]
    }
  };

  // Each named exercise carries a "poseType" — the guided-session camera
  // coach (js/pose-coach.js) only has automatic rep/posture detection for
  // squat / pushup / jumpingjack / plank; anything else is paced by the
  // avatar with manual "log a rep" tapping, and is tagged "generic".
  const EXERCISES = {
    squat:        { name:"Bodyweight squats",   poseType:"squat" },
    pushup:       { name:"Push-ups",             poseType:"pushup" },
    jumpingjack:  { name:"Jumping jacks",        poseType:"jumpingjack" },
    plank:        { name:"Plank hold",           poseType:"plank", isHold:true },
    lunge:        { name:"Alternating lunges",   poseType:"generic" },
    row:          { name:"Bent-over rows (band/bottle)", poseType:"generic" },
    curl:         { name:"Bicep curls",          poseType:"generic" },
    shoulder:     { name:"Shoulder presses",     poseType:"generic" },
    walk:         { name:"Brisk walk / cycling", poseType:"generic", isCardio:true },
    stretch:      { name:"Full-body stretch",    poseType:"generic", isHold:true },
    mobility:     { name:"Mobility flow",        poseType:"generic", isHold:true }
  };

  // Weekly focus -> which exercises make up that day, with sets/reps.
  // `sets` is omitted for holds/cardio, which use a target duration instead.
  const WORKOUT_LIBRARY = {
    lose: { cardioEmphasis:true, days: [
      { focus:"Full body strength + cardio", items:[["squat",3,15],["pushup",3,10],["jumpingjack",3,30],["walk",1,600]] },
      { focus:"Brisk walk / cycling",         items:[["walk",1,1200]] },
      { focus:"Full body strength + core",    items:[["squat",3,15],["lunge",3,12],["plank",3,30]] },
      { focus:"Active recovery — mobility",   items:[["stretch",1,600],["mobility",1,300]] },
      { focus:"Cardio intervals",             items:[["jumpingjack",4,40],["walk",1,600]] },
      { focus:"Full body strength",           items:[["squat",3,15],["pushup",3,10],["row",3,12]] },
      { focus:"Rest or a gentle walk",        items:[["walk",1,900]] }
    ]},
    maintain: { cardioEmphasis:false, days: [
      { focus:"Upper body strength",   items:[["pushup",3,12],["row",3,12],["shoulder",3,12]] },
      { focus:"Cardio or sport of choice", items:[["walk",1,900]] },
      { focus:"Lower body strength",   items:[["squat",4,15],["lunge",3,12]] },
      { focus:"Mobility & core",       items:[["plank",3,30],["mobility",1,300]] },
      { focus:"Full body strength",    items:[["squat",3,15],["pushup",3,12],["row",3,12]] },
      { focus:"Light cardio",          items:[["jumpingjack",3,30],["walk",1,600]] },
      { focus:"Rest",                  items:[["stretch",1,600]] }
    ]},
    gain: { cardioEmphasis:false, days: [
      { focus:"Push (chest, shoulders, triceps)", items:[["pushup",4,12],["shoulder",4,10]] },
      { focus:"Pull (back, biceps)",              items:[["row",4,12],["curl",4,12]] },
      { focus:"Legs",                             items:[["squat",4,15],["lunge",4,12]] },
      { focus:"Rest or light mobility",           items:[["mobility",1,300]] },
      { focus:"Push",                             items:[["pushup",4,12],["shoulder",4,10]] },
      { focus:"Pull + legs",                      items:[["row",3,12],["squat",3,15]] },
      { focus:"Rest",                             items:[["stretch",1,600]] }
    ]}
  };

  function buildExercises(items){
    return items.map(([key, sets, repsOrSecs]) => {
      const base = EXERCISES[key];
      const isTimeBased = base.isHold || base.isCardio;
      return {
        key, name: base.name, poseType: base.poseType,
        sets, reps: isTimeBased ? null : repsOrSecs,
        durationSec: isTimeBased ? repsOrSecs : null
      };
    });
  }

  function pick(arr, seed){ return arr[seed % arr.length]; }

  function generatePlan(inputs, latestBMI, latestCalories, adjustment){
    const bmiCategory = latestBMI ? latestBMI.data.category : "Normal range";
    const tdee = latestCalories ? latestCalories.data.tdee : 2000;

    let targetCalories = tdee;
    let goalNote = "Maintenance";
    if (inputs.goal === "lose"){ targetCalories = Math.max(1400, tdee - 400); goalNote = "Moderate deficit for gradual, sustainable loss"; }
    if (inputs.goal === "gain"){ targetCalories = tdee + 300; goalNote = "Modest surplus to support muscle gain"; }

    // Weekly self-check nudges the deficit/surplus slightly, always staying
    // inside a safe band — see maybeRegeneratePlan() for how this is decided.
    if (adjustment && adjustment.calorieShift){
      targetCalories = Math.max(1300, Math.min(tdee + 500, targetCalories + adjustment.calorieShift));
      goalNote += ` (${adjustment.reason})`;
    }

    // macro split (grams): protein ~1.6-2g/kg bodyweight proxy via calories, simple % based split instead
    const proteinPct = inputs.goal === "gain" ? 0.30 : 0.28;
    const fatPct = 0.27;
    const carbPct = 1 - proteinPct - fatPct;
    const macros = {
      protein: Math.round((targetCalories*proteinPct)/4),
      carbs: Math.round((targetCalories*carbPct)/4),
      fat: Math.round((targetCalories*fatPct)/9)
    };

    const lib = MEAL_LIBRARY[inputs.diet] || MEAL_LIBRARY.veg;
    const seedBase = new Date().getDate();
    const meals = {
      breakfast: pick(lib.breakfast, seedBase),
      lunch: pick(lib.lunch, seedBase+1),
      snack: pick(lib.snack, seedBase+2),
      dinner: pick(lib.dinner, seedBase+3)
    };

    const workoutLib = WORKOUT_LIBRARY[inputs.goal] || WORKOUT_LIBRARY.maintain;
    const days = Number(inputs.days);
    const weekPlan = workoutLib.days.map((d, i) => ({
      name: `Day ${i+1}`,
      focus: d.focus,
      isTrainingDay: i < days,
      exercises: buildExercises(d.items)
    }));

    let professionNote = "";
    if (inputs.profession === "desk") professionNote = "Since most of your day is seated, prioritise a 5–10 minute walk every couple of hours, on top of the sessions below.";
    if (inputs.profession === "manual") professionNote = "Your work already involves real physical load — keep training sessions shorter and focus on mobility and recovery rather than adding more volume.";
    if (inputs.profession === "mixed") professionNote = "A mix of sitting and moving during the day — the plan below assumes moderate baseline activity.";

    return {
      generatedAt: Date.now(),
      inputs,
      bmiCategory,
      diet: { targetCalories, goalNote, macros, meals },
      workout: { days: weekPlan, professionNote, trainingDaysPerWeek: days }
    };
  }
  window.HE.generatePlan = generatePlan;

  /* ----------------------------------------------------------
     Map any calendar date onto a day of the current plan's
     7-day cycle, anchored at the date the plan was generated.
     ---------------------------------------------------------- */
  function getPlanDayForDate(user, dateObj){
    if (!user.plan) return null;
    const start = new Date(user.plan.generatedAt);
    start.setHours(0,0,0,0);
    const d = new Date(dateObj); d.setHours(0,0,0,0);
    const diffDays = Math.floor((d - start) / 86400000);
    if (diffDays < 0) return null; // date is before this plan existed
    const idx = ((diffDays % 7) + 7) % 7;
    return user.plan.workout.days[idx];
  }
  window.HE.getPlanDayForDate = getPlanDayForDate;

  /* ----------------------------------------------------------
     Weekly auto-regeneration: once 7+ days have passed since the
     plan was generated, look at logged weight/mood since then and
     nudge the calorie target — always inside a safe band — then
     build a fresh plan from the latest calculator results.
     ---------------------------------------------------------- */
  function maybeRegeneratePlan(user){
    if (!user.plan) return false;
    const msSince = Date.now() - user.plan.generatedAt;
    if (msSince < 7*24*60*60*1000) return false;

    const since = user.plan.generatedAt;
    const recentLogs = (user.progressLogs||[]).filter(l => l.date >= since && l.weight);
    let adjustment = { calorieShift: 0, reason: "steady as she goes" };

    if (recentLogs.length >= 2){
      const first = recentLogs[0].weight, last = recentLogs[recentLogs.length-1].weight;
      const change = last - first;
      const goal = user.plan.inputs.goal;
      if (goal === "lose" && change > -0.2){ adjustment = { calorieShift:-150, reason:"tightened slightly — weight held steady last week" }; }
      else if (goal === "gain" && change < 0.2){ adjustment = { calorieShift:150, reason:"raised slightly — weight held steady last week" }; }
      else if (goal === "lose" && change < -1.5){ adjustment = { calorieShift:150, reason:"eased off — the pace was faster than ideal" }; }
    }

    const latestBMI = [...(user.healthLogs||[])].reverse().find(l => l.type === "bmi");
    const latestCalories = [...(user.healthLogs||[])].reverse().find(l => l.type === "calories");
    const newPlan = generatePlan(user.plan.inputs, latestBMI, latestCalories, adjustment);

    user.planHistory = user.planHistory || [];
    user.planHistory.push(user.plan);
    user.plan = newPlan;
    window.HE.persist(user);
    return true;
  }
  window.HE.maybeRegeneratePlan = maybeRegeneratePlan;

  function renderPlan(plan){
    const out = $("#plan-output");
    out.innerHTML = `
      <div class="plan-output-grid">
        <div class="plan-card diet">
          <h4>Diet structure — ${plan.diet.targetCalories} kcal/day</h4>
          <p style="margin-bottom:.5rem">${plan.diet.goalNote}. Based on a ${plan.bmiCategory.toLowerCase()} BMI.</p>
          <div class="macro-row">
            <span class="macro-chip">Protein ${plan.diet.macros.protein} g</span>
            <span class="macro-chip">Carbs ${plan.diet.macros.carbs} g</span>
            <span class="macro-chip">Fat ${plan.diet.macros.fat} g</span>
          </div>
          <table>
            <tr><th>Breakfast</th><td>${plan.diet.meals.breakfast}</td></tr>
            <tr><th>Lunch</th><td>${plan.diet.meals.lunch}</td></tr>
            <tr><th>Snack</th><td>${plan.diet.meals.snack}</td></tr>
            <tr><th>Dinner</th><td>${plan.diet.meals.dinner}</td></tr>
          </table>
        </div>
        <div class="plan-card workout">
          <h4>Weekly training split — ${plan.workout.trainingDaysPerWeek} days</h4>
          <p style="margin-bottom:.5rem">${plan.workout.professionNote}</p>
          ${plan.workout.days.map(d => `
            <div class="plan-day-block">
              <strong>${d.name} — ${d.focus}</strong>
              <table>
                ${d.exercises.map(ex => `<tr><td>${ex.name}</td><td>${ex.durationSec ? Math.round(ex.durationSec/60*10)/10 + " min" : ex.sets + " × " + ex.reps}</td></tr>`).join("")}
              </table>
            </div>
          `).join("")}
        </div>
      </div>
      <p class="calc-hint" style="margin-top:1rem">Generated by rule-based logic from your latest calculator results. Not a substitute for a registered dietician or physiotherapist, especially if you have an existing medical condition. Follow any day live under <a href="#" data-goto="workouts">Guided Session</a>.</p>
    `;
    window.HE.$$("[data-goto]").forEach(b => {
      if (b._bound) return; b._bound = true;
      b.addEventListener("click", (e) => { e.preventDefault(); window.HE.goToView(b.dataset.goto); });
    });
  }

  function initPlanForm(){
    $("#form-plan").addEventListener("submit", (e) => {
      e.preventDefault();
      const user = window.HE.currentUser();
      if (!user) return;
      const fd = new FormData(e.target);
      const inputs = {
        profession: fd.get("profession"),
        diet: fd.get("diet"),
        goal: fd.get("goal"),
        days: fd.get("days")
      };
      const latestBMI = [...(user.healthLogs||[])].reverse().find(l => l.type === "bmi");
      const latestCalories = [...(user.healthLogs||[])].reverse().find(l => l.type === "calories");
      const plan = generatePlan(inputs, latestBMI, latestCalories);
      user.plan = plan;
      window.HE.persist(user);
      showCurrentPlan();
      window.HE.renderDashboard && window.HE.renderDashboard();
    });

    $("#regen-plan-btn").addEventListener("click", () => {
      const u = window.HE.currentUser();
      if (!u || !u.plan) return;
      u.plan.generatedAt = 0; // force due
      window.HE.persist(u);
      maybeRegeneratePlan(u);
      showCurrentPlan();
    });

    showCurrentPlan();
  }

  function showCurrentPlan(){
    const user = window.HE.currentUser();
    if (!user || !user.plan){ $("#plan-meta-row").classList.add("hidden"); return; }
    const regenerated = maybeRegeneratePlan(user);
    renderPlan(user.plan);
    $("#plan-meta-row").classList.remove("hidden");
    $("#plan-generated-note").textContent = regenerated
      ? "Just refreshed based on last week's logs."
      : `Generated ${new Date(user.plan.generatedAt).toLocaleDateString()}. Next auto-check in ${7 - Math.floor((Date.now()-user.plan.generatedAt)/86400000)} day(s).`;
    if (regenerated) window.HE.renderDashboard && window.HE.renderDashboard();
  }
  window.HE.showCurrentPlan = showCurrentPlan;

  /* ==========================================================
     WELLNESS ASSISTANT CHATBOT (rule-based intent matching)
     ========================================================== */
  const INTENTS = [
    { keys:["protein"], reply:"Most active adults do well with roughly 1.2–1.6 g of protein per kg of body weight per day, a bit higher if you're strength training. Dal, paneer, eggs, curd, chicken and soy are all solid everyday sources." },
    { keys:["water","hydration","hydrate"], reply:"A common starting point is 2.5–3 litres a day, more if it's hot or you're training hard. Your urine being pale yellow is a simpler everyday check than counting glasses." },
    { keys:["sleep"], reply:"Most adults need 7–9 hours. Consistent sleep and wake times matter almost as much as total hours — try keeping both within a 30-minute window daily." },
    { keys:["stress","anxious","anxiety"], reply:"Short walks, slow breathing (try 4 seconds in, 6 out, for a few minutes) and cutting back on caffeine can help day-to-day stress. If it's persistent, the Mental Wellness check-in on this site is a good next step." },
    { keys:["bmi"], reply:"BMI is weight divided by height squared — a quick screening number, not a full picture of health. You can calculate yours under Calculators → BMI." },
    { keys:["weight loss","lose weight","fat loss"], reply:"Sustainable weight loss usually comes from a modest calorie deficit (300–500 kcal/day below maintenance), enough protein to protect muscle, and consistent movement — not extreme restriction. Try the AI Plans tab for a structure based on your numbers." },
    { keys:["muscle","gain weight","bulk"], reply:"Building muscle needs a small calorie surplus, enough protein (see the protein question), and progressive resistance training — gradually adding weight or reps over time." },
    { keys:["blood pressure","bp"], reply:"A normal reading is under 120/80 mmHg. If you're consistently at 130/80 or higher, it's worth discussing with a doctor. You can check your category under Calculators → Blood pressure." },
    { keys:["diet plan","meal plan"], reply:"Head to the AI Plans tab — it drafts a diet structure and macro split from your latest BMI and calorie numbers." },
    { keys:["workout","exercise plan","training"], reply:"The AI Plans tab also builds a weekly training split based on your goal and how many days you can train. For guided sessions, check Live Workouts." },
    { keys:["hello","hi","hey"], reply:"Hi! Ask me about protein, sleep, water, stress, BMI, weight loss, muscle gain, blood pressure, or your diet/workout plan." },
    { keys:["thank"], reply:"Happy to help — take care of yourself out there." }
  ];
  const FALLBACK = "I don't have a canned answer for that one yet. Try asking about protein, sleep, hydration, stress, BMI, blood pressure, or your diet/workout plan — or check in with a doctor for anything specific to you.";

  function matchIntent(text){
    const lower = text.toLowerCase();
    for (const intent of INTENTS){
      if (intent.keys.some(k => lower.includes(k))) return intent.reply;
    }
    return FALLBACK;
  }

  function appendChatMsg(role, text){
    const win = $("#chat-window");
    const div = document.createElement("div");
    div.className = "chat-msg " + role;
    div.textContent = text;
    win.appendChild(div);
    win.scrollTop = win.scrollHeight;
  }

  function renderChatSuggestions(){
    const sugg = $("#chat-suggestions");
    const chips = ["How much protein do I need?", "How much water should I drink?", "Tips for better sleep", "Help with stress"];
    sugg.innerHTML = chips.map(c => `<button type="button">${c}</button>`).join("");
    $$("#chat-suggestions button").forEach(btn => {
      btn.addEventListener("click", () => {
        appendChatMsg("user", btn.textContent);
        appendChatMsg("bot", matchIntent(btn.textContent));
      });
    });
  }

  window.HE.matchIntent = matchIntent;
  window.HE.appendChatMsg = appendChatMsg;

  function initChatbot(){
    $("#form-chat").addEventListener("submit", async (e) => {
      e.preventDefault();
      const input = $("#chat-input");
      const text = input.value.trim();
      if (!text) return;
      appendChatMsg("user", text);
      input.value = "";
      if (window.HE.getAssistantReply){
        appendChatMsg("bot", "…");
        const win = $("#chat-window");
        const placeholder = win.lastElementChild;
        const reply = await window.HE.getAssistantReply(text);
        placeholder.textContent = reply;
      } else {
        appendChatMsg("bot", matchIntent(text));
      }
    });
    renderChatSuggestions();
  }
  window.HE.renderChatbotWelcome = function(){
    const win = $("#chat-window");
    if (win.children.length === 0){
      appendChatMsg("bot", "Hi, I'm the HealthEthics assistant. Ask me a quick wellness question — I'll do my best with a rule-based answer.");
    }
  };

  document.addEventListener("DOMContentLoaded", () => {
    initPlanForm();
    initChatbot();
  });

})();
