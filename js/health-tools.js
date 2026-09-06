/* =========================================================
   HealthEthics — health-tools.js
   BMI, body-fat %, calorie needs, blood-pressure calculators,
   and the GAD-7 / PHQ-9 mental wellness screeners.
   ========================================================= */
(function(){
  "use strict";
  const $ = window.HE.$, $$ = window.HE.$$;

  function logHealthResult(type, data){
    const user = window.HE.currentUser();
    if (!user) return;
    user.healthLogs = user.healthLogs || [];
    user.healthLogs.push({ type, data, date: Date.now() });
    window.HE.persist(user);
  }
  window.HE.logHealthResult = logHealthResult;
  window.HE.bmiCategory = bmiCategory;
  window.HE.bpCategory = bpCategory;

  /* ---------------- BMI ---------------- */
  function bmiCategory(bmi){
    if (bmi < 18.5) return "Underweight";
    if (bmi < 25) return "Normal range";
    if (bmi < 30) return "Overweight";
    return "Obese";
  }

  function initBMI(){
    $("#form-bmi").addEventListener("submit", (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const h = Number(fd.get("height"))/100, w = Number(fd.get("weight"));
      const bmi = +(w/(h*h)).toFixed(1);
      const cat = bmiCategory(bmi);
      $("#result-bmi").innerHTML = `
        <div class="result-card ${cat==="Obese"||cat==="Underweight" ? "warn":""}">
          <h4>Your BMI</h4>
          <div class="big">${bmi}</div>
          <p style="margin:0">${cat}. BMI is a quick screening number, not a diagnosis — it doesn't account for muscle mass or build.</p>
        </div>`;
      logHealthResult("bmi", { bmi, category: cat, height:Number(fd.get("height")), weight:w });
    });
  }

  /* ---------------- Body fat % (US Navy method) ---------------- */
  function initBodyFat(){
    const genderSel = $("#form-bodyfat [name=gender]");
    const hipField = $(".only-female");
    function toggleHip(){ hipField.style.display = genderSel.value === "female" ? "flex" : "none"; }
    genderSel.addEventListener("change", toggleHip);
    toggleHip();

    $("#form-bodyfat").addEventListener("submit", (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const gender = fd.get("gender");
      const height = Number(fd.get("height"));
      const neck = Number(fd.get("neck"));
      const waist = Number(fd.get("waist"));
      const hip = Number(fd.get("hip")) || 0;

      let bf;
      if (gender === "male"){
        bf = 495 / (1.0324 - 0.19077*Math.log10(waist-neck) + 0.15456*Math.log10(height)) - 450;
      } else {
        bf = 495 / (1.29579 - 0.35004*Math.log10(waist+hip-neck) + 0.22100*Math.log10(height)) - 450;
      }
      bf = Math.max(2, Math.min(60, +bf.toFixed(1)));
      const bands = gender === "male"
        ? [[6,"Essential fat"],[14,"Athletic"],[18,"Fit"],[25,"Average"],[100,"Above average"]]
        : [[14,"Essential fat"],[21,"Athletic"],[25,"Fit"],[32,"Average"],[100,"Above average"]];
      const band = bands.find(b => bf <= b[0])[1];

      $("#result-bodyfat").innerHTML = `
        <div class="result-card">
          <h4>Estimated body fat</h4>
          <div class="big">${bf}%</div>
          <p style="margin:0">${band} range (U.S. Navy circumference formula). Skinfold calipers or a DEXA scan will be more precise if you need exact numbers.</p>
        </div>`;
      logHealthResult("bodyfat", { bodyFat: bf, band, gender });
    });
  }

  /* ---------------- Calorie needs (Mifflin-St Jeor) ---------------- */
  function initCalories(){
    $("#form-calories").addEventListener("submit", (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const gender = fd.get("gender");
      const age = Number(fd.get("age"));
      const height = Number(fd.get("height"));
      const weight = Number(fd.get("weight"));
      const activity = Number(fd.get("activity"));

      const bmr = gender === "male"
        ? 10*weight + 6.25*height - 5*age + 5
        : 10*weight + 6.25*height - 5*age - 161;
      const tdee = Math.round(bmr * activity);

      $("#result-calories").innerHTML = `
        <div class="result-card">
          <h4>Estimated daily needs</h4>
          <div class="big">${tdee} kcal</div>
          <p style="margin:0">Basal metabolic rate: ${Math.round(bmr)} kcal. This is your maintenance level — eat around this to hold your current weight, roughly 300–500 kcal below it for gradual weight loss, and 250–350 kcal above it to gain, alongside training.</p>
        </div>`;
      logHealthResult("calories", { bmr: Math.round(bmr), tdee, activity, goalNote: "Maintenance" });
    });
  }

  /* ---------------- Blood pressure category ---------------- */
  function bpCategory(sys, dia){
    if (sys > 180 || dia > 120) return { label:"Hypertensive crisis", warn:true, note:"Seek medical care promptly — this range needs a clinician's attention, not a calculator." };
    if (sys >= 140 || dia >= 90) return { label:"High blood pressure (Stage 2)", warn:true, note:"Consistently in this range calls for a conversation with a doctor." };
    if (sys >= 130 || dia >= 80) return { label:"High blood pressure (Stage 1)", warn:true, note:"Lifestyle changes help here — and it's worth mentioning to a doctor at your next visit." };
    if (sys >= 120 && dia < 80) return { label:"Elevated", warn:false, note:"Not yet high, but worth watching — this is often where prevention has the most leverage." };
    return { label:"Normal", warn:false, note:"Within a healthy range for a resting reading." };
  }
  function initBP(){
    $("#form-bp").addEventListener("submit", (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const sys = Number(fd.get("systolic")), dia = Number(fd.get("diastolic"));
      const cat = bpCategory(sys, dia);
      $("#result-bp").innerHTML = `
        <div class="result-card ${cat.warn ? "warn":""}">
          <h4>${sys}/${dia} mmHg</h4>
          <div class="big">${cat.label}</div>
          <p style="margin:0">${cat.note}</p>
        </div>`;
      logHealthResult("bp", { systolic: sys, diastolic: dia, category: cat.label });
    });
  }

  /* ---------------- calculator tab switching ---------------- */
  function initCalcTabs(){
    $$("#calc-tabs .tab").forEach(tab => {
      tab.addEventListener("click", () => {
        $$("#calc-tabs .tab").forEach(t => t.classList.remove("active"));
        tab.classList.add("active");
        $$(".calc-panel").forEach(p => p.classList.remove("active"));
        $("#calc-" + tab.dataset.calc).classList.add("active");
      });
    });
  }

  /* ==========================================================
     MENTAL WELLNESS — GAD-7 (anxiety) and PHQ-9 (depression)
     Standard, publicly published self-report screening scales.
     Response options score 0–3: Not at all / Several days /
     More than half the days / Nearly every day.
     ========================================================== */
  const OPTIONS = [
    {v:0,label:"Not at all"},
    {v:1,label:"Several days"},
    {v:2,label:"More than half the days"},
    {v:3,label:"Nearly every day"}
  ];

  const GAD7_ITEMS = [
    "Feeling nervous, anxious or on edge",
    "Not being able to stop or control worrying",
    "Worrying too much about different things",
    "Trouble relaxing",
    "Being so restless that it's hard to sit still",
    "Becoming easily annoyed or irritable",
    "Feeling afraid as if something awful might happen"
  ];

  const PHQ9_ITEMS = [
    "Little interest or pleasure in doing things",
    "Feeling down, depressed or hopeless",
    "Trouble falling/staying asleep, or sleeping too much",
    "Feeling tired or having little energy",
    "Poor appetite or overeating",
    "Feeling bad about yourself — or that you're a failure",
    "Trouble concentrating on things",
    "Moving or speaking slowly, or the opposite — being fidgety/restless",
    "Thoughts that you would be better off dead, or of hurting yourself"
  ];

  function buildQuestionnaire(formEl, items){
    formEl.innerHTML = items.map((q, i) => `
      <div class="wq">
        <p>${i+1}. ${q}</p>
        <div class="wq-options">
          ${OPTIONS.map(o => `
            <label><input type="radio" name="q${i}" value="${o.v}" required>${o.label}</label>
          `).join("")}
        </div>
      </div>
    `).join("");
  }

  function gad7Band(score){
    if (score <= 4) return "Minimal anxiety";
    if (score <= 9) return "Mild anxiety";
    if (score <= 14) return "Moderate anxiety";
    return "Severe anxiety";
  }
  function phq9Band(score){
    if (score <= 4) return "Minimal depression symptoms";
    if (score <= 9) return "Mild depression symptoms";
    if (score <= 14) return "Moderate depression symptoms";
    if (score <= 19) return "Moderately severe depression symptoms";
    return "Severe depression symptoms";
  }

  function scoreForm(formEl, count){
    const fd = new FormData(formEl);
    let total = 0;
    const values = [];
    for (let i=0;i<count;i++){
      const v = Number(fd.get("q"+i));
      values.push(v);
      total += v;
    }
    return { total, values };
  }

  function logWellness(type, score, band){
    const user = window.HE.currentUser();
    if (!user) return;
    user.wellnessLogs = user.wellnessLogs || [];
    user.wellnessLogs.push({ type, score, band, date: Date.now() });
    window.HE.persist(user);
  }

  function initWellness(){
    buildQuestionnaire($("#form-gad7"), GAD7_ITEMS);
    buildQuestionnaire($("#form-phq9"), PHQ9_ITEMS);

    $$("#wellness-tabs .tab").forEach(tab => {
      tab.addEventListener("click", () => {
        $$("#wellness-tabs .tab").forEach(t => t.classList.remove("active"));
        tab.classList.add("active");
        $$(".wellness-panel").forEach(p => p.classList.remove("active"));
        $("#wellness-" + tab.dataset.w).classList.add("active");
      });
    });

    $("#submit-gad7").addEventListener("click", () => {
      const form = $("#form-gad7");
      if (!form.reportValidity()) return;
      const { total } = scoreForm(form, GAD7_ITEMS.length);
      const band = gad7Band(total);
      $("#result-gad7").innerHTML = `
        <div class="result-card ${total>=15 ? "warn":""}">
          <h4>Your GAD-7 score</h4>
          <div class="big">${total} / 21</div>
          <p style="margin:0">${band}. This is a screening result, not a diagnosis — a doctor or counsellor can help interpret it alongside how you're actually feeling.</p>
        </div>`;
      logWellness("gad7", total, band);
      window.HE.renderDashboard && window.HE.renderDashboard();
    });

    $("#submit-phq9").addEventListener("click", () => {
      const form = $("#form-phq9");
      if (!form.reportValidity()) return;
      const { total, values } = scoreForm(form, PHQ9_ITEMS.length);
      const band = phq9Band(total);
      $("#result-phq9").innerHTML = `
        <div class="result-card ${total>=15 ? "warn":""}">
          <h4>Your PHQ-9 score</h4>
          <div class="big">${total} / 27</div>
          <p style="margin:0">${band}. This is a screening result, not a diagnosis — a doctor or counsellor can help interpret it alongside how you're actually feeling.</p>
        </div>`;
      logWellness("phq9", total, band);

      // item 9 (index 8) asks about self-harm / suicidal ideation
      const crisisBox = $("#crisis-box");
      if (values[8] > 0){
        crisisBox.classList.remove("hidden");
        crisisBox.scrollIntoView({ behavior:"smooth", block:"nearest" });
      } else {
        crisisBox.classList.add("hidden");
      }
      window.HE.renderDashboard && window.HE.renderDashboard();
    });
  }

  window.HE.renderWellness = function(){ /* forms are static once built; nothing to refresh */ };

  document.addEventListener("DOMContentLoaded", () => {
    initBMI();
    initBodyFat();
    initCalories();
    initBP();
    initCalcTabs();
    initWellness();
  });

})();
