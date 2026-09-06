/* =========================================================
   HealthEthics — pose-coach.js

   Two independent halves that meet in one session:
   1) An animated SVG "coach" that paces each exercise visually
      (no motion-capture data — a lightweight looping figure).
   2) A real, on-device pose-detection pipeline (TensorFlow.js +
      MoveNet, lazy-loaded from a CDN only when a session starts)
      that reads the user's own webcam locally, counts reps for
      squats / push-ups / jumping jacks, times plank holds, flags
      common posture mistakes, and notices when the user has
      paused moving so it can suggest a rest.

   Nothing from the camera is ever uploaded — estimation runs
   entirely in the browser tab.
   ========================================================= */
(function(){
  "use strict";
  const $ = window.HE.$, $$ = window.HE.$$;

  const QUOTES = {
    shallow: ["A little lower gets you the full rep — try that one again.", "Depth over speed — dip a bit further next time."],
    sag: ["Brace your core — keep the hips from sagging.", "Squeeze your stomach tight and try again — straight line, head to heel."],
    valgus: ["Push your knees out over your toes, not in.", "Watch the knees — keep them tracking over your feet."],
    encourage: ["Good rep — that's the tempo.", "Nice and controlled — keep going.", "That's the one — form's looking solid."],
    rest: ["Looks like you've paused — grab some water, catch your breath.", "Take a moment. Sip some water. I'll be right here when you're ready."],
    resume: ["Good to see you moving again — let's pick it back up.", "Welcome back — let's finish this set."]
  };
  function q(key){ const arr = QUOTES[key]; return arr[Math.floor(Math.random()*arr.length)]; }

  /* ==========================================================
     SESSION STATE
     ========================================================== */
  const state = {
    queue: [],          // [{key,name,poseType,sets,reps,durationSec}]
    exIndex: 0,
    setIndex: 0,        // which set (1-based display) of current exercise
    repCount: 0,
    holdSeconds: 0,
    phase: "up",
    minAngleThisRep: 999,
    resting: false,
    restSince: null,
    movementBuffer: [], // {t, mag}
    lastKeypoints: null,
    cameraOn: false,
    detector: null,
    rafId: null,
    lastFrameTime: null,
    day: null
  };

  /* ==========================================================
     SETUP SCREEN — choose coach + which plan day to follow
     ========================================================== */
  function initSessionSetup(){
    const user = window.HE.currentUser();
    if (!user) return;
    const select = $("#session-day-select");
    if (user.plan){
      select.innerHTML = user.plan.workout.days.map((d,i) => `<option value="${i}">${d.name} — ${d.focus}</option>`).join("");
      if (window.HE.sessionDateOverride){
        const d = window.HE.getPlanDayForDate(user, parseKey(window.HE.sessionDateOverride));
        if (d){ const idx = user.plan.workout.days.indexOf(d); if (idx>=0) select.value = idx; }
        window.HE.sessionDateOverride = null;
      } else {
        const today = window.HE.getPlanDayForDate(user, new Date());
        if (today){ const idx = user.plan.workout.days.indexOf(today); if (idx>=0) select.value = idx; }
      }
    } else {
      select.innerHTML = `<option value="">No plan yet — build one under AI Plans</option>`;
    }
    $("#session-stage").classList.add("hidden");
    $("#session-setup").classList.remove("hidden");
  }
  window.HE.initSessionSetup = initSessionSetup;
  function parseKey(key){ const [y,m,d] = key.split("-").map(Number); return new Date(y,m-1,d); }

  /* ==========================================================
     AVATAR — a small looping SVG figure, not a rigged 3D model.
     Honest about what it is: a pacing guide, gender-styleable.
     ========================================================== */
  function buildAvatar(){
    const svg = $("#avatar-svg");
    svg.innerHTML = `
      <g id="av-rig">
        <ellipse id="av-head" cx="100" cy="40" rx="16" ry="18"/>
        <line id="av-spine" x1="100" y1="58" x2="100" y2="130" />
        <line id="av-armL" x1="100" y1="72" x2="60" y2="110" />
        <line id="av-armR" x1="100" y1="72" x2="140" y2="110" />
        <line id="av-legL" x1="100" y1="130" x2="80" y2="200" />
        <line id="av-legR" x1="100" y1="130" x2="120" y2="200" />
      </g>`;
  }

  function setAvatarStyle(gender){
    const svg = $("#avatar-svg");
    svg.classList.toggle("gender-male", gender === "male");
    svg.classList.toggle("gender-female", gender === "female");
  }

  function setAvatarExercise(poseType){
    const svg = $("#avatar-svg");
    Array.from(svg.classList).filter(c => c.startsWith("pose-")).forEach(c => svg.classList.remove(c));
    svg.classList.add("pose-" + poseType);
  }

  /* ==========================================================
     QUEUE / EXERCISE FLOW
     ========================================================== */
  function startSession(){
    const user = window.HE.currentUser();
    const dayIdx = Number($("#session-day-select").value);
    if (!user.plan || isNaN(dayIdx)) return;
    state.day = user.plan.workout.days[dayIdx];
    state.queue = state.day.exercises.map(ex => Object.assign({}, ex));
    state.exIndex = 0;
    buildAvatar();
    setAvatarStyle($("#avatar-gender").value);
    $("#session-setup").classList.add("hidden");
    $("#session-stage").classList.remove("hidden");
    renderQueue();
    loadExercise(0);
  }

  function renderQueue(){
    $("#exercise-queue").innerHTML = state.queue.map((ex,i) => `
      <li class="${i===state.exIndex ? "current":""} ${i<state.exIndex ? "done":""}">
        ${ex.name} — ${ex.durationSec ? Math.round(ex.durationSec/60*10)/10+" min" : ex.sets+" × "+ex.reps}
      </li>`).join("");
  }

  function loadExercise(i){
    if (i >= state.queue.length){
      showBanner("Session complete — nicely done. Log any final progress on the Progress tab.", "good");
      markDailyWorkoutDone();
      return;
    }
    state.exIndex = i;
    state.setIndex = 1;
    resetRepState();
    const ex = state.queue[i];
    setAvatarExercise(ex.poseType);
    $("#current-exercise-name").textContent = ex.name + (ex.sets ? ` — set ${state.setIndex} of ${ex.sets}` : "");
    $("#current-exercise-target").textContent = ex.durationSec
      ? (ex.durationSec >= 90
          ? `Keep going for about ${Math.round(ex.durationSec/60)} minutes, then mark it done`
          : `Hold for ${Math.round(ex.durationSec)} seconds${ex.poseType==="plank" ? " — camera will time this" : ""}`)
      : `Target: ${ex.reps} reps${autoDetected(ex.poseType) ? " — camera will count these" : " — tap Log a rep, or check them off yourself"}`;
    $("#rep-target-label").textContent = ex.durationSec ? "sec" : "/ " + ex.reps + " reps";
    $("#rep-count").textContent = "0";
    $("#log-rep-btn").classList.toggle("hidden", autoDetected(ex.poseType) || !!ex.durationSec);
    renderQueue();
  }

  function autoDetected(poseType){
    return ["squat","pushup","jumpingjack","plank"].includes(poseType);
  }

  function resetRepState(){
    state.repCount = 0;
    state.holdSeconds = 0;
    state.phase = "up";
    state.minAngleThisRep = 999;
    state.resting = false;
    state.movementBuffer = [];
  }

  function currentExercise(){ return state.queue[state.exIndex]; }

  function completeSet(){
    const ex = currentExercise();
    const key = ex.key;
    const user = window.HE.currentUser();
    const dayLog = window.HE.ensureDailyLog(user, window.HE.dateKey(new Date()));
    dayLog.exercisesDone[key] = (dayLog.exercisesDone[key] || 0) + 1;
    dayLog.workoutDone = true;
    window.HE.persist(user);

    if (ex.sets && state.setIndex < ex.sets){
      state.setIndex++;
      resetRepState();
      $("#current-exercise-name").textContent = ex.name + ` — set ${state.setIndex} of ${ex.sets}`;
      $("#rep-count").textContent = "0";
      showBanner(`Set logged. Rest a moment, then start set ${state.setIndex} whenever you're ready.`, "good");
    } else {
      showBanner("Exercise complete — moving on.", "good");
      loadExercise(state.exIndex + 1);
    }
  }

  function markDailyWorkoutDone(){
    const user = window.HE.currentUser();
    const dayLog = window.HE.ensureDailyLog(user, window.HE.dateKey(new Date()));
    dayLog.workoutDone = true;
    window.HE.persist(user);
    window.HE.renderDashboard && window.HE.renderDashboard();
  }

  function showBanner(text, kind){
    const el = $("#session-banner");
    el.textContent = text;
    el.className = "session-banner show " + (kind || "");
    clearTimeout(showBanner._t);
    showBanner._t = setTimeout(() => el.classList.remove("show"), 5000);
  }

  /* ==========================================================
     CAMERA + POSE DETECTION (lazy-loaded)
     ========================================================== */
  let libsLoaded = false;
  function loadScript(src){
    return new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = src; s.onload = resolve; s.onerror = reject;
      document.head.appendChild(s);
    });
  }
  async function ensurePoseLibs(){
    if (libsLoaded) return true;
    try {
      await loadScript("https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.20.0/dist/tf.min.js");
      await loadScript("https://cdn.jsdelivr.net/npm/@tensorflow-models/pose-detection@2.1.3/dist/pose-detection.min.js");
      libsLoaded = true;
      return true;
    } catch (err){
      console.error("Pose detection libraries failed to load", err);
      return false;
    }
  }

  async function toggleCamera(){
    if (state.cameraOn){ stopCamera(); return; }
    const btn = $("#camera-toggle-btn");
    btn.disabled = true; btn.textContent = "Starting…";
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { width:480, height:360 }, audio:false });
      const video = $("#user-video");
      video.srcObject = stream;
      await video.play();
      const ok = await ensurePoseLibs();
      if (!ok){
        showBanner("Couldn't load the on-device detection model — you can still log reps manually.", "warn");
        btn.textContent = "Camera on (manual mode)";
        state.cameraOn = true;
        btn.disabled = false;
        return;
      }
      await tf.setBackend("webgl");
      state.detector = await poseDetection.createDetector(
        poseDetection.SupportedModels.MoveNet,
        { modelType: poseDetection.movenet.modelType.SINGLEPOSE_LIGHTNING }
      );
      state.cameraOn = true;
      btn.textContent = "Stop camera";
      btn.disabled = false;
      sizeCanvas();
      state.lastFrameTime = performance.now();
      detectLoop();
    } catch (err){
      console.error(err);
      showBanner("Camera permission was denied or unavailable — you can still follow along and log reps manually.", "warn");
      btn.textContent = "Enable camera";
      btn.disabled = false;
    }
  }

  function stopCamera(){
    state.cameraOn = false;
    if (state.rafId) cancelAnimationFrame(state.rafId);
    const video = $("#user-video");
    if (video.srcObject) video.srcObject.getTracks().forEach(t => t.stop());
    video.srcObject = null;
    $("#camera-toggle-btn").textContent = "Enable camera";
    const ctx = $("#pose-canvas").getContext("2d");
    ctx.clearRect(0,0,ctx.canvas.width, ctx.canvas.height);
  }

  function sizeCanvas(){
    const video = $("#user-video");
    const canvas = $("#pose-canvas");
    canvas.width = video.videoWidth || 480;
    canvas.height = video.videoHeight || 360;
  }

  async function detectLoop(){
    if (!state.cameraOn) return;
    try {
      const video = $("#user-video");
      const poses = await state.detector.estimatePoses(video);
      const now = performance.now();
      const dt = (now - state.lastFrameTime) / 1000;
      state.lastFrameTime = now;
      if (poses && poses[0]){
        drawSkeleton(poses[0].keypoints);
        processPose(poses[0].keypoints, dt);
      }
    } catch (err){
      console.error("pose detection frame error", err);
    }
    state.rafId = requestAnimationFrame(detectLoop);
  }

  function drawSkeleton(keypoints){
    const canvas = $("#pose-canvas");
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0,0,canvas.width,canvas.height);
    const pairs = [
      ["left_shoulder","right_shoulder"],["left_shoulder","left_elbow"],["left_elbow","left_wrist"],
      ["right_shoulder","right_elbow"],["right_elbow","right_wrist"],["left_shoulder","left_hip"],
      ["right_shoulder","right_hip"],["left_hip","right_hip"],["left_hip","left_knee"],["left_knee","left_ankle"],
      ["right_hip","right_knee"],["right_knee","right_ankle"]
    ];
    const kp = {}; keypoints.forEach(k => kp[k.name] = k);
    ctx.strokeStyle = "#E2A63B"; ctx.lineWidth = 3;
    pairs.forEach(([a,b]) => {
      if (kp[a] && kp[b] && kp[a].score>0.3 && kp[b].score>0.3){
        ctx.beginPath(); ctx.moveTo(kp[a].x, kp[a].y); ctx.lineTo(kp[b].x, kp[b].y); ctx.stroke();
      }
    });
    ctx.fillStyle = "#163832";
    keypoints.forEach(k => { if (k.score>0.3){ ctx.beginPath(); ctx.arc(k.x,k.y,4,0,Math.PI*2); ctx.fill(); } });
  }

  function angleAt(A,B,C){
    const v1 = {x:A.x-B.x, y:A.y-B.y}, v2 = {x:C.x-B.x, y:C.y-B.y};
    const dot = v1.x*v2.x + v1.y*v2.y;
    const mag = Math.hypot(v1.x,v1.y)*Math.hypot(v2.x,v2.y);
    if (!mag) return 180;
    return Math.acos(Math.max(-1,Math.min(1,dot/mag))) * 180/Math.PI;
  }
  function kp(map,name){ const k = map[name]; return (k && k.score>0.3) ? k : null; }

  function processPose(keypoints, dt){
    const map = {}; keypoints.forEach(k => map[k.name] = k);

    // --- fatigue / rest detection: overall movement magnitude ---
    let mag = 0, n = 0;
    if (state.lastKeypoints){
      keypoints.forEach(k => {
        const prev = state.lastKeypoints[k.name];
        if (prev && k.score>0.3 && prev.score>0.3){ mag += Math.hypot(k.x-prev.x, k.y-prev.y); n++; }
      });
    }
    state.lastKeypoints = map;
    const avgMag = n ? mag/n : 0;
    const t = performance.now();
    state.movementBuffer.push({t, mag: avgMag});
    state.movementBuffer = state.movementBuffer.filter(m => t - m.t < 8000);
    const windowAvg = state.movementBuffer.reduce((s,m)=>s+m.mag,0) / (state.movementBuffer.length||1);

    const exercising = state.movementBuffer.length > 30; // enough samples collected
    if (exercising && windowAvg < 0.6 && t - state.movementBuffer[0].t > 7500){
      if (!state.resting){
        state.resting = true;
        showBanner(q("rest"), "warn");
      }
      return; // don't evaluate reps while treated as resting
    } else if (state.resting && windowAvg > 1.5){
      state.resting = false;
      showBanner(q("resume"), "good");
      state.movementBuffer = [];
    }
    if (state.resting) return;

    const ex = currentExercise();
    if (!ex) return;

    if (ex.poseType === "squat") return processSquat(map);
    if (ex.poseType === "pushup") return processPushup(map);
    if (ex.poseType === "jumpingjack") return processJumpingJack(map);
    if (ex.poseType === "plank") return processPlank(map, dt);
  }

  function bothOr(a,b){ return a!==null && b!==null ? (a+b)/2 : (a!==null?a:b); }

  function processSquat(map){
    const lh=kp(map,"left_hip"), lk=kp(map,"left_knee"), la=kp(map,"left_ankle");
    const rh=kp(map,"right_hip"), rk=kp(map,"right_knee"), ra=kp(map,"right_ankle");
    const leftAngle = (lh&&lk&&la) ? angleAt(lh,lk,la) : null;
    const rightAngle = (rh&&rk&&ra) ? angleAt(rh,rk,ra) : null;
    const angle = bothOr(leftAngle, rightAngle);
    if (angle === null) return;

    state.minAngleThisRep = Math.min(state.minAngleThisRep, angle);

    if (state.phase === "up" && angle < 100){
      state.phase = "down";
    } else if (state.phase === "down" && angle > 160){
      if (state.minAngleThisRep < 115){
        // posture: knee-over-ankle check
        let valgusFlag = false;
        if (lk && la && Math.abs(lk.x-la.x) > 55) valgusFlag = true;
        if (rk && ra && Math.abs(rk.x-ra.x) > 55) valgusFlag = true;
        incrementRep();
        showBanner(valgusFlag ? q("valgus") : q("encourage"), valgusFlag ? "warn" : "good");
      } else {
        showBanner(q("shallow"), "warn");
      }
      state.phase = "up";
      state.minAngleThisRep = 999;
    }
  }

  function processPushup(map){
    const ls=kp(map,"left_shoulder"), le=kp(map,"left_elbow"), lw=kp(map,"left_wrist");
    const rs=kp(map,"right_shoulder"), re=kp(map,"right_elbow"), rw=kp(map,"right_wrist");
    const leftAngle = (ls&&le&&lw) ? angleAt(ls,le,lw) : null;
    const rightAngle = (rs&&re&&rw) ? angleAt(rs,re,rw) : null;
    const angle = bothOr(leftAngle, rightAngle);
    if (angle === null) return;
    state.minAngleThisRep = Math.min(state.minAngleThisRep, angle);

    if (state.phase === "up" && angle < 95){
      state.phase = "down";
    } else if (state.phase === "down" && angle > 155){
      const sag = hipSag(map);
      if (state.minAngleThisRep < 110){
        incrementRep();
        showBanner(sag ? q("sag") : q("encourage"), sag ? "warn" : "good");
      } else {
        showBanner(q("shallow"), "warn");
      }
      state.phase = "up";
      state.minAngleThisRep = 999;
    }
  }

  function hipSag(map){
    const sh = kp(map,"left_shoulder") || kp(map,"right_shoulder");
    const hip = kp(map,"left_hip") || kp(map,"right_hip");
    const ank = kp(map,"left_ankle") || kp(map,"right_ankle");
    if (!sh || !hip || !ank) return false;
    // expected hip y if body were a straight line from shoulder to ankle
    const t = (hip.x - sh.x) / ((ank.x - sh.x) || 1);
    const expectedY = sh.y + t*(ank.y - sh.y);
    return Math.abs(hip.y - expectedY) > 40;
  }

  function processJumpingJack(map){
    const lw=kp(map,"left_wrist"), rw=kp(map,"right_wrist");
    const ls=kp(map,"left_shoulder"), rs=kp(map,"right_shoulder");
    const la=kp(map,"left_ankle"), ra=kp(map,"right_ankle");
    const lh=kp(map,"left_hip"), rh=kp(map,"right_hip");
    if (!lw||!rw||!ls||!rs||!la||!ra||!lh||!rh) return;
    const armsUp = lw.y < ls.y && rw.y < rs.y;
    const hipWidth = Math.hypot(lh.x-rh.x, lh.y-rh.y) || 1;
    const legsOpen = Math.hypot(la.x-ra.x, la.y-ra.y) > hipWidth*1.6;
    const open = armsUp && legsOpen;

    if (state.phase !== "open" && open){
      state.phase = "open";
    } else if (state.phase === "open" && !open){
      incrementRep();
      showBanner(q("encourage"), "good");
      state.phase = "closed";
    }
  }

  function processPlank(map, dt){
    const sag = hipSag(map);
    if (!sag){
      state.holdSeconds += dt;
      $("#rep-count").textContent = Math.round(state.holdSeconds);
      const ex = currentExercise();
      if (ex.durationSec && state.holdSeconds >= ex.durationSec){
        showBanner("Hold complete — great control.", "good");
        completeSet();
      }
    } else {
      showBanner(q("sag"), "warn");
    }
  }

  function incrementRep(){
    state.repCount++;
    $("#rep-count").textContent = state.repCount;
    const ex = currentExercise();
    if (ex.reps && state.repCount >= ex.reps){
      completeSet();
    }
  }

  /* ==========================================================
     WIRE UP
     ========================================================== */
  document.addEventListener("DOMContentLoaded", () => {
    $("#session-start-btn").addEventListener("click", startSession);
    $("#camera-toggle-btn").addEventListener("click", toggleCamera);
    $("#log-rep-btn").addEventListener("click", incrementRep);
    $("#mark-done-btn").addEventListener("click", completeSet);
    $("#repeat-set-btn").addEventListener("click", () => { resetRepState(); $("#rep-count").textContent="0"; showBanner("Set reset — go again whenever you're ready.", "good"); });
    $("#end-session-btn").addEventListener("click", () => {
      stopCamera();
      $("#session-stage").classList.add("hidden");
      $("#session-setup").classList.remove("hidden");
    });
    $("#avatar-gender").addEventListener("change", (e) => setAvatarStyle(e.target.value));
  });

})();
