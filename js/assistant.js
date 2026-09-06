/* =========================================================
   HealthEthics — assistant.js

   IMPORTANT — read before wiring up a real key:
   This site is static front-end code with no server of its own,
   so there is nowhere "safe" to hide a secret API key inside it —
   anything shipped in the JS is visible to anyone who opens
   dev tools. That's why this module does NOT ship a key.

   Instead, each visitor can optionally paste their *own* key,
   which is kept only in that browser's localStorage and sent
   directly from that browser to OpenAI. That's fine for personal
   or demo use. For a real public product, put this call behind
   your own backend endpoint instead, so the key lives on your
   server and never touches the browser at all.

   If a key was ever pasted into a chat, email, ticket, or shared
   publicly, treat it as compromised and revoke/rotate it in the
   OpenAI dashboard immediately — anyone who saw it can use it on
   your account's bill.
   ========================================================= */
(function(){
  "use strict";
  const $ = window.HE.$;
  const KEY_STORAGE = "he_openai_key_v1";

  function getKey(){ return localStorage.getItem(KEY_STORAGE) || ""; }
  function setKey(k){ if (k) localStorage.setItem(KEY_STORAGE, k); }
  function clearKey(){ localStorage.removeItem(KEY_STORAGE); }

  async function getAssistantReply(userText){
    const key = getKey();
    if (!key){
      return window.HE.matchIntent(userText);
    }
    try {
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": "Bearer " + key
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [
            { role:"system", content:"You are the HealthEthics wellness assistant. Give brief, general fitness/nutrition/wellness guidance for a lay audience in India. You are not a doctor — for anything specific to someone's medical situation, tell them to see one. Keep answers under 80 words." },
            { role:"user", content: userText }
          ],
          max_tokens: 200
        })
      });
      if (!res.ok){
        const errBody = await res.json().catch(()=>({}));
        console.error("OpenAI error", res.status, errBody);
        if (res.status === 401){
          $("#api-key-status").textContent = "That key was rejected (401) — check it's correct and active, or remove it below.";
        }
        return window.HE.matchIntent(userText) + " (Live assistant call failed — showing a built-in answer instead.)";
      }
      const data = await res.json();
      return data.choices?.[0]?.message?.content?.trim() || window.HE.matchIntent(userText);
    } catch (err){
      console.error(err);
      return window.HE.matchIntent(userText) + " (Couldn't reach the live assistant — showing a built-in answer instead.)";
    }
  }
  window.HE.getAssistantReply = getAssistantReply;

  document.addEventListener("DOMContentLoaded", () => {
    const statusEl = $("#api-key-status");
    function refreshStatus(){
      statusEl.textContent = getKey() ? "A key is saved in this browser. Live replies are on." : "No key saved — using built-in rule-based replies.";
    }
    refreshStatus();

    $("#form-api-key").addEventListener("submit", (e) => {
      e.preventDefault();
      const val = $("#api-key-input").value.trim();
      if (!val) return;
      setKey(val);
      $("#api-key-input").value = "";
      refreshStatus();
    });
    $("#clear-api-key").addEventListener("click", () => {
      clearKey();
      refreshStatus();
    });
  });
})();
