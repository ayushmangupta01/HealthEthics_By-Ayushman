HealthEthics — Fitness and Wellness using AI
A working build of the platform described in your Invention Disclosure Form:
health calculators, mental wellness screening, an AI-style plan generator,
live/guided workouts with reminders, progress tracking, and a wellness
chatbot — all in one site, running from a browser with no server setup.
Run it
No build step. Open `index.html` in any modern browser, or serve the folder
so relative paths and fonts behave the same way they will once hosted:
```bash
cd healthethics
python3 -m http.server 8080
# visit http://localhost:8080
```
Or drag the folder onto Netlify/Vercel, or push it to GitHub Pages — it's
static front-end code, so any static host works.
What's implemented, mapped to your disclosure form
Disclosure form feature	Where it lives	Notes
User Registration & Login	`js/core.js` (`DB`, `Session`)	Client-side only for now — see "Upgrade path" below.
BMI Calculator	`js/health-tools.js`	Standard `weight / height²` formula.
Body Fat %	`js/health-tools.js`	U.S. Navy circumference method.
Caloric Needs (BMR/TDEE)	`js/health-tools.js`	Mifflin–St Jeor equation × activity multiplier.
Blood Pressure Category	`js/health-tools.js`	Standard AHA-style categories (Normal → Hypertensive crisis).
Anxiety & Depression screening	`js/health-tools.js`	The standard GAD-7 and PHQ-9 questionnaires, self-scored, with a crisis-resources panel that appears if the self-harm item (PHQ-9 #9) is answered above zero.
AI-based diet & workout plans	`js/ai-engine.js` (`generatePlan`, `maybeRegeneratePlan`)	Reads your latest BMI/calorie results, profession and goal; drafts a meal structure + a structured weekly split (named exercises with sets/reps or hold time). Re-checks itself weekly against logged progress and regenerates automatically.
Onboarding after registration	`js/onboarding.js`	BMI → body fat → calories → goal wizard, ending in an auto-generated first plan.
Calendar with streaks	`js/calendar.js`	Monthly grid off the plan's 7-day cycle; tap a date for that day's diet/workout and to mark it done.
Live workouts (virtual coach)	`js/pose-coach.js`	Animated pacing avatar + real on-device MoveNet pose detection for rep/posture/rest tracking. See the README section below for exactly what is and isn't ML-driven here.
Reminders	`js/tracking.js` (`initReminders`)	Uses the browser Notification API; fires while the tab is open.
Progress tracking	`js/tracking.js` (`renderProgress`)	Weight/mood/water log + Chart.js line charts, both on the Progress page and as a dashboard snapshot; feeds the weekly plan regeneration.
AI chatbot / live assistant	`js/ai-engine.js` (`INTENTS`) + `js/assistant.js`	Rule-based by default; optionally calls a real model if the visitor saves their own API key — read the security note below before using this.
About the "AI" today
Both the plan generator and the chatbot are rule-based decision logic,
exactly as your disclosure form describes for this stage ("rules are
hard-coded... AI logic can be scaled later to use machine learning models").
They're deliberately deterministic so the whole site works offline, for
free, with no API keys — but they're written as isolated functions
(`generatePlan()`, `matchIntent()`) so replacing the internals with a real
model call is a contained change, not a rewrite.
Adding real workout videos
Each entry in `WORKOUTS` (top of `js/tracking.js`) has `videoId: null`. Set
it to a real YouTube video ID (the part after `v=` in a YouTube URL) once
you've chosen and verified specific routines/creators you have the right to
embed — the card will switch from a placeholder to a live embedded player
automatically.
Design
Palette: deep forest teal (`#163832`) for trust and structure,
marigold (`#E2A63B`) for the "AI/energy" moments, warm paper background,
clay-red reserved for anything that needs attention (BP warnings, crisis
resources) — colour is used to encode which kind of feature you're in
(body / mind / AI), not just decoration.
Type: Fraunces (a warm, editorial serif) for headings, IBM Plex Sans
for everything functional — chosen partly because Plex's Indic-script
support fits a platform built for India, even though only the Latin
weights are used here.
Fully responsive down to a phone-width sidebar; keyboard focus states and
`prefers-reduced-motion` are respected.
Upgrade path to a real backend
Everything reads/writes through two objects in `js/core.js`:
```js
window.HE.DB       // register(), login(), get(), save()
window.HE.Session   // current(), start(), end()
```
To move to Firebase or a Node/Express + MongoDB backend as your disclosure
form describes:
Replace the bodies of `DB.register`, `DB.login`, `DB.get`, `DB.save`
with calls to Firebase Auth/Firestore or your own REST endpoints.
Replace the `simpleHash()` placeholder with real server-side password
hashing (bcrypt/argon2) — it exists only so the demo works without a
server, and is not secure enough for production.
Everything else (calculators, wellness screening, plan generator,
charts, reminders, chatbot) already treats "the user object" as an
opaque record and doesn't care where it came from.
What's new in this pass
Onboarding wizard (`js/onboarding.js`): fires automatically right
after registration. Walks BMI → body fat (skippable) → calorie needs →
profession/diet/goal, then builds the user's first AI plan and drops
them on the dashboard.
Calendar (`js/calendar.js`): a monthly grid built from the plan's
7-day cycle. Filled dots mark active days (feeds the streak counter);
tapping any date shows that day's diet target and exercises, with
checkboxes that write straight into `user.dailyLogs`.
Weekly auto-regeneration (`generatePlan`/`maybeRegeneratePlan` in
`js/ai-engine.js`): every time the dashboard or AI Plans page loads,
it checks whether 7+ days have passed since the current plan was
generated. If so, it looks at logged weight since then and nudges the
calorie target a bounded amount, then rebuilds the plan from the latest
calculator results. A "Regenerate now" button forces the same check.
Guided Session (`js/pose-coach.js`) replaces the old YouTube-embed
library entirely, per your request. It's built from two honestly-scoped
pieces:
An animated SVG coach (male/female toggle) that loops through a
pacing animation per exercise. This is a lightweight illustrative
figure, not a rigged 3D character or motion-captured trainer — see
"About the virtual coach" below for why, and what a real one would take.
Real, on-device pose detection using TensorFlow.js + MoveNet
(loaded from a CDN only when a session starts). It reads the
browser's own camera locally — nothing is uploaded — draws a
skeleton over a mirrored self-view, and:
counts reps automatically for squats, push-ups and jumping
jacks, and times plank holds, using joint-angle thresholds;
flags common posture mistakes (knees caving in on squats, hips
sagging on push-ups/planks) and won't count a rep that doesn't
reach full depth — it asks for it again instead, with a short
corrective message;
watches overall body-movement across an 8-second rolling window; if
it drops off mid-set, it shows a rest/hydration prompt and pauses
counting until movement picks back up again, exactly as you asked
for point 3.
Exercises outside that list (lunges, rows, curls, etc.) still get the
coach's pacing and a manual "log a rep" / "mark set done" button —
the README is explicit about this rather than pretending the ML
covers everything.
Live assistant (`js/assistant.js`): the chat now optionally calls a
real model instead of the rule-based one — see the security note below,
because this is the part that needs your attention before you use it.
About the virtual coach
A fully rigged, photoreal 3D human that performs any generated
workout with motion-capture-quality reps is a genuinely large project —
it needs a 3D character rig, an animation/motion library per exercise,
and (usually) a game-engine-grade renderer (Three.js + a bone-animated
GLTF model, or an Unreal/Unity build). That's beyond what can be spun up
reliably as static site code, so this build makes an honest trade: the
avatar is a simple, styleable looping figure for pacing and
demonstration, while the actual "does the rep count, is the form okay"
judgment comes from the real pose-detection ML running on the user's own
camera — which is the harder, more valuable half, and is genuinely
working code. If you want the fully rigged 3D coach later, the natural
next step is a Three.js scene with a free rigged humanoid model (e.g. a
Mixamo character) and per-exercise animation clips — `pose-coach.js` is
structured so that swapping `buildAvatar()`/`setAvatarExercise()` for a
Three.js version wouldn't touch the pose-detection logic at all.
⚠️ About the API key you pasted in chat
You shared a live OpenAI project key (`sk-proj-…`) directly in our
conversation. Please revoke or rotate that key right now in your
OpenAI dashboard (platform.openai.com → API keys) — once a secret key has
been typed into a chat, you should treat it as compromised, regardless of
what happens to it afterwards, since it may be logged or seen by others.
I have not put that key into any file in this project, and you shouldn't
either: this site is static front-end code, so any key placed in its JS
is visible to anyone who opens their browser's dev tools — there's no
way to keep a key secret inside a client-only site. Instead:
`js/assistant.js` lets each visitor optionally paste their own key
into a field on the Assistant page. It's saved only in that browser's
`localStorage` and sent straight from that browser to OpenAI — fine for
your own personal use or a demo, not for a public product.
For a real deployment, add a small backend endpoint (a single
serverless function is enough) that holds the key server-side, and
point `getAssistantReply()` at that endpoint instead of
`api.openai.com` directly. That way the key never reaches the browser
at all.
Safety notes carried over into the build
The mental wellness section is explicitly framed as screening, not
diagnosis, in the UI copy itself, and surfaces crisis helpline numbers
(KIRAN 1800-599-0019, Tele-MANAS 1-800-891-4416, Vandrevala Foundation
1860-2662-345) if the self-harm question is answered positively.
The AI plan generator keeps calorie targets within commonly accepted
healthy ranges rather than aggressive deficits.
Every AI-generated section carries a line pointing back to a real
doctor/dietician/counsellor for anything specific to the individual.
