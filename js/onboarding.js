/* =========================================================
   HealthEthics — onboarding.js
   Runs once, right after registration: walks the new user
   through BMI -> body fat (optional) -> calories -> goal, then
   builds their first AI plan automatically.
   ========================================================= */
(function(){
  "use strict";
  const $ = window.HE.$, $$ = window.HE.$$;

  function showStep(n){
    $$(".ob-step").forEach(s => s.classList.toggle("active", s.dataset.step === String(n)));
    if (n !== "done"){
      $("#ob-progress-label").textContent = `Step ${n} of 4`;
      $("#ob-progress-fill").style.width = (n/4*100) + "%";
    } else {
      $("#ob-progress-label").textContent = "All set";
      $("#ob-progress-fill").style.width = "100%";
    }
  }

  function startOnboarding(){
    $("#onboarding-overlay").classList.remove("hidden");
    showStep(1);
  }
  window.HE.startOnboarding = startOnboarding;

  function initOnboarding(){
    // step 1: BMI
    $("#ob-form-bmi").addEventListener("submit", (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const h = Number(fd.get("height"))/100, w = Number(fd.get("weight"));
      const bmi = +(w/(h*h)).toFixed(1);
      const cat = window.HE.bmiCategory(bmi);
      $("#ob-result-bmi").innerHTML = `<div class="result-card"><h4>Your BMI</h4><div class="big">${bmi}</div><p style="margin:0">${cat}</p></div>`;
      window.HE.logHealthResult("bmi", { bmi, category: cat, height:Number(fd.get("height")), weight:w });
      setTimeout(() => showStep(2), 700);
    });

    // step 2: body fat (optional)
    $("#ob-form-bodyfat").addEventListener("submit", (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const neck = Number(fd.get("neck")), waist = Number(fd.get("waist")), hip = Number(fd.get("hip"))||0;
      const gender = fd.get("gender");
      const latestBMI = [...(window.HE.currentUser().healthLogs||[])].reverse().find(l => l.type==="bmi");
      const height = latestBMI ? latestBMI.data.height : 170;
      if (neck && waist){
        let bf = gender === "male"
          ? 495 / (1.0324 - 0.19077*Math.log10(waist-neck) + 0.15456*Math.log10(height)) - 450
          : 495 / (1.29579 - 0.35004*Math.log10(waist+hip-neck) + 0.22100*Math.log10(height)) - 450;
        bf = Math.max(2, Math.min(60, +bf.toFixed(1)));
        $("#ob-result-bodyfat").innerHTML = `<div class="result-card"><h4>Estimated body fat</h4><div class="big">${bf}%</div></div>`;
        window.HE.logHealthResult("bodyfat", { bodyFat: bf, gender });
      }
      setTimeout(() => showStep(3), 500);
    });
    $("#ob-skip-2").addEventListener("click", () => showStep(3));
    $$("#ob-form-bodyfat [name=gender]")[0].addEventListener("change", (e) => {
      $(".ob-hip-field").style.display = e.target.value === "female" ? "flex" : "none";
    });

    // step 3: calories
    $("#ob-form-calories").addEventListener("submit", (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const user = window.HE.currentUser();
      const latestBMI = [...(user.healthLogs||[])].reverse().find(l => l.type==="bmi");
      const latestBF = [...(user.healthLogs||[])].reverse().find(l => l.type==="bodyfat");
      const gender = latestBF ? latestBF.data.gender : (user.profile.gender === "female" ? "female" : "male");
      const age = Number(fd.get("age"));
      const height = latestBMI ? latestBMI.data.height : 170;
      const weight = latestBMI ? latestBMI.data.weight : 65;
      const activity = Number(fd.get("activity"));
      const bmr = gender === "male" ? 10*weight+6.25*height-5*age+5 : 10*weight+6.25*height-5*age-161;
      const tdee = Math.round(bmr*activity);
      $("#ob-result-calories").innerHTML = `<div class="result-card"><h4>Estimated daily needs</h4><div class="big">${tdee} kcal</div></div>`;
      window.HE.logHealthResult("calories", { bmr: Math.round(bmr), tdee, activity, goalNote:"Maintenance" });
      setTimeout(() => showStep(4), 700);
    });

    // step 4: goal -> build first plan
    $("#ob-form-goal").addEventListener("submit", (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const user = window.HE.currentUser();
      const inputs = { profession: fd.get("profession"), diet: fd.get("diet"), goal: fd.get("goal"), days: fd.get("days") };
      const latestBMI = [...(user.healthLogs||[])].reverse().find(l => l.type==="bmi");
      const latestCalories = [...(user.healthLogs||[])].reverse().find(l => l.type==="calories");
      const plan = window.HE.generatePlan(inputs, latestBMI, latestCalories);
      user.plan = plan;
      user.onboarded = true;
      window.HE.persist(user);
      showStep("done");
    });

    $("#ob-finish-btn").addEventListener("click", () => {
      $("#onboarding-overlay").classList.add("hidden");
      window.HE.renderDashboard && window.HE.renderDashboard();
      window.HE.goToView("dashboard");
    });
  }

  document.addEventListener("DOMContentLoaded", initOnboarding);
})();
