// NOVA — assistant personnel autonome : reconnaissance faciale, déclencheur « Bonjour »,
// briefing du matin (heure, météo, agenda), voix neuronale fluide et conversation.
// Tout tourne dans le navigateur. Le visage n'est jamais envoyé : il reste dans localStorage.
"use strict";

const $ = (s) => document.querySelector(s);
const MODELS = "https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.15/model/";

/* ---------------------------------------------------------------- stockage */
const store = {
  get(k, d) { try { const v = localStorage.getItem("nova." + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem("nova." + k, JSON.stringify(v)); } catch { /* navigation privée */ } },
  del(k) { try { localStorage.removeItem("nova." + k); } catch { /* */ } },
};
const settings = Object.assign(
  { name: "", hon: "", city: "", key: "", voice: "onyx", autoBrief: false, private: true },
  store.get("settings", {})
);
const saveSettings = () => store.set("settings", settings);

/* ---------------------------------------------------------------- utilitaires */
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const norm = (s) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[’]/g, "'");
const isoDay = (d = new Date()) => d.toLocaleDateString("en-CA");
const addDays = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return d; };
const num = (x) => Number(x).toLocaleString("fr-FR", { maximumFractionDigits: 1 });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const hasKey = () => settings.key.trim().startsWith("sk-");
const who = () => settings.name.trim();
const hon = () => settings.hon.trim() || settings.name.trim();

function spokenTime(d = new Date()) {
  const h = d.getHours(), m = d.getMinutes();
  if (h === 12 && m === 0) return "midi";
  if (h === 0 && m === 0) return "minuit";
  return `${h} h ${m ? String(m).padStart(2, "0") : ""}`.trim();
}
function spokenHHMM(hhmm) {
  const [h, m] = hhmm.split(":").map(Number);
  const d = new Date(); d.setHours(h, m, 0, 0);
  return spokenTime(d);
}
function longDate(d = new Date()) {
  return d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
}
function greeting() {
  const h = new Date().getHours();
  if (h >= 5 && h < 12) return "Bonjour";
  if (h >= 12 && h < 18) return "Bon après-midi";
  return "Bonsoir";
}

let toastTimer;
function toast(text, ms = 3500) {
  const t = $("#toast");
  t.textContent = text; t.classList.add("show");
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove("show"), ms);
}

/* ---------------------------------------------------------------- état */
let state = "idle";
let busy = false;
let convoUntil = 0;
const LABELS = { idle: "EN VEILLE", listening: "À L'ÉCOUTE", thinking: "RÉFLEXION", speaking: "PARLE" };
function setState(s) {
  state = s;
  $("#status").textContent = LABELS[s] || s.toUpperCase();
}
function refreshIdle() {
  if (busy) return;
  setState(Date.now() < convoUntil ? "listening" : "idle");
}
function openConvo(ms = 25000) { convoUntil = Date.now() + ms; refreshIdle(); }
setInterval(refreshIdle, 1000);

/* ---------------------------------------------------------------- orbe */
const cv = $("#orb"), g = cv.getContext("2d");
let W = 0, H = 0, DPR = 1, level = 0, kick = 0;
function resize() {
  DPR = Math.min(2, window.devicePixelRatio || 1);
  W = cv.clientWidth; H = cv.clientHeight;
  cv.width = W * DPR; cv.height = H * DPR;
}
addEventListener("resize", resize);
resize();

const rings = Array.from({ length: 9 }, (_, i) => ({
  ph: Math.random() * 6.28, sp: 0.25 + Math.random() * 0.5,
  f1: 2 + (i % 3), f2: 3 + Math.floor(Math.random() * 4),
  a1: 0.03 + Math.random() * 0.04, a2: 0.02 + Math.random() * 0.03,
  tilt: Math.random() * 6.28, spin: (Math.random() - 0.5) * 0.3, hue: 192 + Math.random() * 22,
}));
const sparks = Array.from({ length: 50 }, () => ({ a: Math.random() * 6.28, r: 0.85 + Math.random() * 0.35, s: (Math.random() - 0.5) * 0.6, z: Math.random() }));

let analyser = null, anaBuf = null;
function audioLevel() {
  if (!analyser || !playing) return 0;
  analyser.getByteTimeDomainData(anaBuf);
  let sum = 0;
  for (let i = 0; i < anaBuf.length; i++) { const v = (anaBuf[i] - 128) / 128; sum += v * v; }
  return Math.min(1, Math.sqrt(sum / anaBuf.length) * 4);
}

function frame(ms) {
  const t = ms / 1000;
  let target = 0.04 + Math.sin(t * 1.3) * 0.015;
  if (state === "listening") target = 0.13 + Math.sin(t * 3) * 0.04;
  if (state === "thinking") target = 0.2 + Math.sin(t * 7) * 0.05;
  if (state === "speaking") target = playing ? 0.12 + audioLevel() * 0.9 : 0.25 + Math.abs(Math.sin(t * 8.5)) * 0.25 + kick * 0.3;
  kick *= 0.9;
  level += (target - level) * 0.18;

  const R = Math.min(W, H) * 0.27 > 250 ? 250 : Math.min(W, H) * 0.27;
  const cx = W / 2, cy = H / 2;
  const spinBoost = state === "thinking" ? 4 : 1;
  g.setTransform(DPR, 0, 0, DPR, 0, 0);
  g.clearRect(0, 0, W, H);
  g.globalCompositeOperation = "lighter";

  const glow = g.createRadialGradient(cx, cy, R * 0.2, cx, cy, R * 1.6);
  glow.addColorStop(0, `rgba(42,123,255,${0.10 + level * 0.25})`);
  glow.addColorStop(0.6, `rgba(42,123,255,${0.04 + level * 0.08})`);
  glow.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = glow; g.fillRect(0, 0, W, H);

  for (const ring of rings) {
    const rot = ring.tilt + t * ring.spin * spinBoost;
    const squash = 0.82 + 0.18 * Math.sin(t * 0.4 + ring.ph);
    const amp = 1 + level * 3.2;
    g.beginPath();
    for (let k = 0; k <= 128; k++) {
      const a = (k / 128) * Math.PI * 2;
      const wob = Math.sin(a * ring.f1 + t * ring.sp * 2 + ring.ph) * ring.a1 * amp
                + Math.sin(a * ring.f2 - t * ring.sp * 3 + ring.ph * 2) * ring.a2 * amp;
      const r = R * (1 + wob);
      const x0 = Math.cos(a) * r, y0 = Math.sin(a) * r * squash;
      const x = cx + x0 * Math.cos(rot) - y0 * Math.sin(rot);
      const y = cy + x0 * Math.sin(rot) + y0 * Math.cos(rot);
      k ? g.lineTo(x, y) : g.moveTo(x, y);
    }
    g.strokeStyle = `hsla(${ring.hue},100%,60%,${0.10 + level * 0.15})`;
    g.lineWidth = 6 + level * 8; g.stroke();
    g.strokeStyle = `hsla(${ring.hue},100%,75%,${0.45 + level * 0.4})`;
    g.lineWidth = 1.1 + level * 1.4; g.stroke();
  }

  for (const p of sparks) {
    p.a += p.s * 0.01 * (1 + level * 4) * spinBoost;
    const r = R * p.r * (1 + level * 0.25);
    const x = cx + Math.cos(p.a) * r, y = cy + Math.sin(p.a) * r * 0.9;
    const s = 0.8 + p.z * 1.6 + level * 2;
    g.fillStyle = `rgba(160,230,255,${0.25 + p.z * 0.5})`;
    g.beginPath(); g.arc(x, y, s, 0, 6.28); g.fill();
  }
  g.globalCompositeOperation = "source-over";
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

/* ---------------------------------------------------------------- cartes */
let cardTimer;
function showCard(html, cls = "") {
  const box = $("#cards");
  clearTimeout(cardTimer);
  [...box.children].forEach((c, i) => { if (i > 0) c.remove(); else c.classList.add("back"); });
  const el = document.createElement("div");
  el.className = "card " + cls;
  el.innerHTML = html;
  box.prepend(el);
  $("#avatar").classList.remove("show");
}
function clearCards(delay = 0) {
  clearTimeout(cardTimer);
  cardTimer = setTimeout(() => {
    [...$("#cards").children].forEach((c) => { c.classList.add("out"); setTimeout(() => c.remove(), 400); });
    if (face.identity === "owner" && face.avatar) setTimeout(() => $("#avatar").classList.add("show"), 450);
  }, delay);
}
function cardIdentity() {
  const now = new Date();
  if (face.identity === "owner") {
    return `<div class="id">${face.avatar ? `<img src="${face.avatar}" alt="">` : ""}<div><div class="k">Identité confirmée</div><div class="t">${esc(who() || "Propriétaire")}</div></div></div><div class="scan"></div>`;
  }
  if (face.identity === "unknown") {
    return `<div class="k">Analyse faciale</div><div class="t">Visage non reconnu</div><div class="scan"></div>`;
  }
  return `<div class="k">Briefing · ${esc(spokenTime(now))}</div><div class="t" style="text-transform:capitalize">${esc(longDate(now))}</div>`;
}
function cardWeather(w) {
  return `<div class="k">Météo · ${esc(w.place)}</div>
  <div class="row"><div><div class="big">${w.icon} ${num(w.temp)}°</div><div class="k" style="letter-spacing:.1em;text-transform:none">${esc(w.desc)}</div></div>
  <div class="meta"><span>min <b>${num(w.min)}°</b> · max <b>${num(w.max)}°</b></span><span>pluie <b>${w.rain}%</b></span><span>vent <b>${num(w.wind)} km/h</b></span><span>humidité <b>${w.hum}%</b></span></div></div>`;
}
function cardAgenda(events, label = "Aujourd'hui") {
  if (events === null) return `<div class="k">Agenda · ${esc(label)}</div><div class="t">Confidentiel</div>`;
  if (!events.length) return `<div class="k">Agenda · ${esc(label)}</div><div class="t">Agenda libre</div>`;
  return `<div class="k">Agenda · ${esc(label)}</div><div class="t">${events.length} rendez-vous</div><ul>${events.map((e) => `<li><b>${esc(e.time || "--:--")}</b>${esc(e.title)}</li>`).join("")}</ul>`;
}

/* ---------------------------------------------------------------- voix */
let actx = null, playing = false, currentSrc = null, speakToken = 0;
function ensureAudio() {
  if (!actx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (AC) {
      actx = new AC();
      analyser = actx.createAnalyser(); analyser.fftSize = 512;
      anaBuf = new Uint8Array(analyser.fftSize);
      analyser.connect(actx.destination);
    }
  }
  if (actx && actx.state === "suspended") actx.resume();
}
function unlockSynth() {
  if (!("speechSynthesis" in window)) return;
  try { const u = new SpeechSynthesisUtterance(" "); u.volume = 0; speechSynthesis.speak(u); } catch { /* */ }
}

async function ttsFetch(text) {
  const r = await fetch("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: { Authorization: "Bearer " + settings.key.trim(), "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "gpt-4o-mini-tts",
      voice: settings.voice,
      input: text,
      response_format: "mp3",
      instructions: "Parle en français, d'une voix calme, posée, chaleureuse et assurée, comme un majordome attentionné. Rythme naturel et fluide, avec de légères pauses réfléchies entre les idées.",
    }),
  });
  if (!r.ok) throw new Error("Voix neuronale : erreur " + r.status);
  return r.arrayBuffer();
}
async function playBuffer(ab, token) {
  ensureAudio();
  const buf = await actx.decodeAudioData(ab.slice(0));
  if (token !== speakToken) return;
  return new Promise((res) => {
    const src = actx.createBufferSource();
    src.buffer = buf; src.connect(analyser);
    src.onended = () => { playing = false; currentSrc = null; res(); };
    currentSrc = src; playing = true; src.start();
  });
}

function pickVoice() {
  if (!("speechSynthesis" in window)) return null;
  const vs = speechSynthesis.getVoices().filter((v) => /^fr/i.test(v.lang));
  const prefs = [/premium|enhanced|amélior|natural|neural|online/i, /google/i, /thomas|daniel|audrey|amélie|aurélie|marie|denise|henri|eloise/i];
  for (const p of prefs) { const v = vs.find((x) => p.test(x.name) && /fr[-_]FR/i.test(x.lang)) || vs.find((x) => p.test(x.name)); if (v) return v; }
  return vs.find((v) => /fr[-_]FR/i.test(v.lang)) || vs[0] || null;
}
if ("speechSynthesis" in window) speechSynthesis.onvoiceschanged = () => speechSynthesis.getVoices();
function speakBrowser(text, token) {
  return new Promise((res) => {
    if (!("speechSynthesis" in window) || token !== speakToken) return res();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "fr-FR"; u.voice = pickVoice(); u.rate = 1.0; u.pitch = 0.95;
    u.onboundary = () => { kick = 1; };
    let done = false;
    const end = () => { if (!done) { done = true; res(); } };
    u.onend = end; u.onerror = end;
    // Sécurité : certains navigateurs n'envoient jamais onend.
    setTimeout(end, 2500 + text.length * 110);
    speechSynthesis.speak(u);
  });
}

function stopSpeaking() {
  speakToken++;
  try { currentSrc && currentSrc.stop(); } catch { /* */ }
  playing = false;
  if ("speechSynthesis" in window) speechSynthesis.cancel();
  $("#subtitle").classList.remove("show");
}

let neuralFailed = false;
/** Lit une suite de segments {text, card}. Pré-charge le segment suivant pendant la lecture. */
async function speakSegments(segs) {
  const token = ++speakToken;
  segs = segs.filter((s) => s && s.text && s.text.trim());
  pauseListening();
  setState("speaking");
  const neural = hasKey() && !neuralFailed;
  const cache = [];
  const get = (i) => {
    if (!neural || i >= segs.length) return null;
    if (!cache[i]) { cache[i] = ttsFetch(segs[i].text); cache[i].catch(() => {}); }
    return cache[i];
  };
  get(0);
  for (let i = 0; i < segs.length; i++) {
    if (token !== speakToken) break;
    const s = segs[i];
    get(i + 1);
    if (s.card) showCard(s.card, s.cardClass);
    $("#subtitle").textContent = s.text;
    $("#subtitle").classList.add("show");
    let ok = false;
    if (neural && !neuralFailed) {
      try { await playBuffer(await get(i), token); ok = true; }
      catch (e) { neuralFailed = true; toast(e.message + " — voix du navigateur utilisée."); }
    }
    if (!ok && token === speakToken) await speakBrowser(s.text, token);
    if (token === speakToken) await sleep(180);
  }
  if (token === speakToken) {
    $("#subtitle").classList.remove("show");
    setState("idle");
    resumeListening();
  }
}

/** Découpe une réponse en segments courts : la première phrase seule pour démarrer vite. */
function toSegments(text) {
  const parts = (text.match(/[^.!?…]+[.!?…]*\s*/g) || [text]).map((s) => s.trim()).filter(Boolean);
  const out = [];
  if (parts.length) out.push(parts.shift());
  while (parts.length) out.push(parts.splice(0, 2).join(" "));
  return out.map((t) => ({ text: t }));
}

/* ---------------------------------------------------------------- écoute */
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
let rec = null, recWanted = false, recRunning = false;
function startListening() {
  if (!SR) return;
  recWanted = true;
  if (recRunning) return;
  rec = new SR();
  rec.lang = "fr-FR"; rec.continuous = true; rec.interimResults = true;
  rec.onresult = (e) => {
    let interim = "";
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const r = e.results[i];
      if (r.isFinal) { $("#heard").textContent = "« " + r[0].transcript.trim() + " »"; onHeard(r[0].transcript); }
      else interim += r[0].transcript;
    }
    if (interim) $("#heard").textContent = "… " + interim.trim();
  };
  rec.onerror = (e) => {
    if (e.error === "not-allowed" || e.error === "service-not-allowed") {
      recWanted = false; $("#mic").classList.remove("on");
      toast("Micro refusé. Autorisez-le dans les réglages du navigateur, ou écrivez à NOVA.");
    }
  };
  rec.onend = () => { recRunning = false; if (recWanted) setTimeout(startListening, 250); else $("#mic").classList.remove("on"); };
  try { rec.start(); recRunning = true; $("#mic").classList.add("on"); }
  catch { recRunning = false; setTimeout(() => recWanted && startListening(), 500); }
}
function pauseListening() { recWanted = false; try { rec && rec.abort(); } catch { /* */ } }
function resumeListening() { if (micEnabled) startListening(); }
let micEnabled = false;

const AGENDA_ADD = /ajout\w*\s+(?:(?:[aà]|dans)\s+(?:mon\s+|l'|l’)?agenda\s*:?\s*(.+)|(.+?)\s+(?:[aà]|dans|sur)\s+(?:mon\s+|l'|l’)?agenda)/i;

function onHeard(raw) {
  const text = raw.trim();
  if (!text || busy) return;
  const n = norm(text);
  const named = /\bnova\b/.test(n);
  const rest = n.replace(/^(?:ok |hey |dis )?nova[\s,!.]*/, "");
  const greet = /^(bonjour|bon matin|salut|hello|coucou|bonsoir|hey)\b/.test(rest) && rest.split(/\s+/).length <= 4;
  if (greet) return briefing();
  if (named || Date.now() < convoUntil) return answer(text.replace(/^\s*(?:ok |hey |dis )?nova[\s,!.]*/i, ""));
}

/* ---------------------------------------------------------------- météo */
const WMO = {
  0: ["ciel dégagé", "☀"], 1: ["plutôt dégagé", "🌤"], 2: ["partiellement nuageux", "⛅"], 3: ["couvert", "☁"],
  45: ["brouillard", "🌫"], 48: ["brouillard givrant", "🌫"], 51: ["bruine légère", "🌦"], 53: ["bruine", "🌦"], 55: ["bruine forte", "🌧"],
  61: ["pluie faible", "🌦"], 63: ["pluie", "🌧"], 65: ["forte pluie", "🌧"], 66: ["pluie verglaçante", "🌧"], 67: ["pluie verglaçante", "🌧"],
  71: ["neige faible", "🌨"], 73: ["neige", "🌨"], 75: ["forte neige", "❄"], 77: ["grésil", "🌨"],
  80: ["averses", "🌦"], 81: ["averses", "🌧"], 82: ["violentes averses", "⛈"], 85: ["averses de neige", "🌨"], 86: ["averses de neige", "🌨"],
  95: ["orages", "⛈"], 96: ["orages et grêle", "⛈"], 99: ["orages et grêle", "⛈"],
};
async function getJSON(url, ms = 8000) {
  const ctl = new AbortController(); const id = setTimeout(() => ctl.abort(), ms);
  try { const r = await fetch(url, { signal: ctl.signal }); if (!r.ok) throw new Error(r.status); return await r.json(); }
  finally { clearTimeout(id); }
}
async function getPlace() {
  const city = settings.city.trim();
  const cached = store.get("place", null);
  if (cached && cached.query === city && (city || Date.now() - cached.at < 6 * 3600e3)) return cached;
  let place;
  if (city) {
    const j = await getJSON(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=fr`);
    if (!j.results || !j.results.length) throw new Error("Ville introuvable");
    const r = j.results[0];
    place = { lat: r.latitude, lon: r.longitude, name: r.name };
  } else {
    const pos = await new Promise((res, rej) => {
      if (!navigator.geolocation) return rej(new Error("Pas de géolocalisation"));
      navigator.geolocation.getCurrentPosition(res, rej, { timeout: 9000, maximumAge: 3600e3 });
    });
    place = { lat: pos.coords.latitude, lon: pos.coords.longitude, name: "votre position" };
    try {
      const j = await getJSON(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${place.lat}&longitude=${place.lon}&localityLanguage=fr`, 5000);
      place.name = j.city || j.locality || place.name;
    } catch { /* nom facultatif */ }
  }
  Object.assign(place, { query: city, at: Date.now() });
  store.set("place", place);
  return place;
}
let wxCache = null;
async function getWeather() {
  if (wxCache && Date.now() - wxCache.at < 15 * 60e3) return wxCache;
  const p = await getPlace();
  const j = await getJSON(`https://api.open-meteo.com/v1/forecast?latitude=${p.lat}&longitude=${p.lon}&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=auto&forecast_days=1`);
  const [desc, icon] = WMO[j.current.weather_code] || ["temps variable", "🌡"];
  wxCache = {
    at: Date.now(), place: p.name, temp: j.current.temperature_2m, hum: j.current.relative_humidity_2m,
    wind: j.current.wind_speed_10m, desc, icon,
    min: j.daily.temperature_2m_min[0], max: j.daily.temperature_2m_max[0], rain: j.daily.precipitation_probability_max[0] ?? 0,
  };
  return wxCache;
}
function weatherText(w) {
  let s = `À ${w.place}, il fait actuellement ${num(w.temp)} degrés, ${w.desc}. La minimale sera de ${num(w.min)} et la maximale de ${num(w.max)} degrés, avec ${w.rain} % de risque de pluie.`;
  if (w.rain >= 50) s += " Pensez à prendre un parapluie.";
  else if (w.max >= 30) s += " Il fera chaud, pensez à bien vous hydrater.";
  else if (w.min <= 3) s += " Il fera froid, couvrez-vous bien.";
  return s;
}

/* ---------------------------------------------------------------- agenda */
let events = store.get("events", []);
const saveEvents = () => { events.sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time)); store.set("events", events); renderEvents(); };
const eventsFor = (day) => events.filter((e) => e.date === day);
function agendaText(list, when = "aujourd'hui") {
  const h = hon();
  if (list === null) return "Je ne vous reconnais pas, je garde donc l'agenda confidentiel.";
  if (!list.length) return `L'agenda ${when === "aujourd'hui" ? "de la journée" : "de " + when} est libre${h ? ", " + h : ""}.`;
  const items = list.map((e) => (e.time ? `à ${spokenHHMM(e.time)}, ${e.title}` : e.title));
  return `Vous avez ${list.length} rendez-vous ${when} : ${items.join(" ; ")}.`;
}
const DAYS = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];
function parseAgenda(text) {
  const m = text.match(AGENDA_ADD);
  if (!m) return null;
  let t = (m[1] || m[2] || "").trim();
  let date = isoDay();
  const dm = t.match(/\b(aujourd'hui|aujourd’hui|apr[eè]s[- ]demain|demain|lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)\b/i);
  if (dm) {
    const w = norm(dm[1]);
    if (w.startsWith("apres")) date = isoDay(addDays(2));
    else if (w === "demain") date = isoDay(addDays(1));
    else if (DAYS.includes(w)) { let d = (DAYS.indexOf(w) - new Date().getDay() + 7) % 7; if (d === 0) d = 7; date = isoDay(addDays(d)); }
    t = t.replace(dm[0], " ");
  }
  let time = "";
  const tm = t.match(/(?:\b[aà]\s+)?\b(\d{1,2})\s*(?:h|heures?|:)\s*(\d{1,2})?\b/i) || t.match(/(?:\b[aà]\s+)?\bmidi\b/i);
  if (tm) {
    const h = tm[1] ? Number(tm[1]) : 12, mi = tm[2] ? Number(tm[2]) : 0;
    if (h < 24 && mi < 60) time = `${String(h).padStart(2, "0")}:${String(mi).padStart(2, "0")}`;
    t = t.replace(tm[0], " ");
  }
  t = t.replace(/\s+/g, " ").replace(/^(?:le|la|un|une|rendez-vous)\s+/i, (x) => (/rendez/i.test(x) ? x : "")).replace(/\s+(?:le|à|a|pour)\s*$/i, "").replace(/[.,;!?]+$/, "").trim();
  if (!t) return null;
  return { id: Date.now().toString(36), date, time, title: t.charAt(0).toUpperCase() + t.slice(1) };
}

/* ---------------------------------------------------------------- IA (optionnelle) */
async function openai(body, ms = 15000) {
  const ctl = new AbortController(); const id = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST", signal: ctl.signal,
      headers: { Authorization: "Bearer " + settings.key.trim(), "Content-Type": "application/json" },
      body: JSON.stringify(Object.assign({ model: "gpt-4o-mini", temperature: 0.8 }, body)),
    });
    if (r.status === 401) throw new Error("Clé OpenAI refusée");
    if (!r.ok) throw new Error("OpenAI : erreur " + r.status);
    const j = await r.json();
    return j.choices[0].message.content;
  } finally { clearTimeout(id); }
}
const PERSONA = "Tu es NOVA, l'assistant personnel vocal de l'utilisateur : raffiné, calme, réfléchi et attentionné, à la manière d'un majordome moderne, avec une pointe d'humour discret. Tes réponses sont LUES À VOIX HAUTE en français : phrases naturelles et fluides, sans emoji, sans markdown, sans liste à puces, sans URL. Sois bref (1 à 4 phrases) sauf si on te demande des détails. N'invente jamais de données personnelles (rendez-vous, e-mails).";

async function aiBriefing(data) {
  const out = await openai({
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: PERSONA + " Tu rédiges le briefing du matin. Réponds uniquement en JSON : {\"intro\":\"…\",\"meteo\":\"…\",\"agenda\":\"…\",\"conclusion\":\"…\"}. Chaque champ fait 1 à 2 phrases courtes. 'intro' salue la personne par son nom et donne le jour et l'heure. 'meteo' reste vide s'il n'y a pas de météo ; sinon donne la température actuelle, la minimale, la maximale et le risque de pluie (nombres en chiffres, ex. 23,5 degrés) et un conseil seulement s'il est utile. 'agenda' résume fidèlement les rendez-vous, ou dit que la journée est libre en s'adressant à la personne avec son appellation. 'conclusion' est une courte phrase chaleureuse et variée." },
      { role: "user", content: JSON.stringify(data) },
    ],
  }, 10000);
  return JSON.parse(out);
}

const history = [];
async function aiAnswer(q) {
  let ctx = `Contexte : nous sommes le ${longDate()} et il est ${spokenTime()}.`;
  if (who()) ctx += ` L'utilisateur s'appelle ${who()}${settings.hon.trim() ? ` et tu l'appelles « ${settings.hon.trim()} »` : ""}.`;
  if (face.identity === "unknown") ctx += " ATTENTION : la caméra voit un visage inconnu, ne révèle aucune information personnelle.";
  else {
    const up = events.filter((e) => e.date >= isoDay()).slice(0, 12);
    ctx += up.length ? ` Agenda à venir : ${up.map((e) => `${e.date} ${e.time || ""} ${e.title}`).join(" ; ")}.` : " Agenda à venir : vide.";
  }
  if (wxCache) ctx += ` Météo à ${wxCache.place} : ${num(wxCache.temp)} °C, ${wxCache.desc}, min ${num(wxCache.min)}, max ${num(wxCache.max)}, pluie ${wxCache.rain} %.`;
  history.push({ role: "user", content: q });
  while (history.length > 14) history.shift();
  const reply = await openai({ max_tokens: 350, messages: [{ role: "system", content: PERSONA + "\n" + ctx }, ...history] });
  history.push({ role: "assistant", content: reply });
  return reply.replace(/[*#_`]/g, "");
}

/* ---------------------------------------------------------------- briefing */
async function briefing() {
  if (busy) return;
  busy = true;
  stopSpeaking();
  setState("thinking");
  try {
    const wx = await getWeather().catch((e) => { console.warn(e); return null; });
    const hide = settings.private && face.identity === "unknown";
    const today = hide ? null : eventsFor(isoDay());
    const name = face.identity === "unknown" ? "" : who();
    let txt = {
      intro: `${greeting()}${name ? " " + name : ""}. Nous sommes ${longDate()}, et il est ${spokenTime()}.`,
      meteo: wx ? weatherText(wx) : "",
      agenda: agendaText(today),
      conclusion: ["Je vous souhaite une excellente journée.", "Je reste à votre disposition.", "Belle journée à vous.", "Tout est prêt, la journée vous appartient."][Math.floor(Math.random() * 4)],
    };
    if (hasKey()) {
      try {
        const ai = await aiBriefing({
          nom: name || null, appellation: face.identity === "unknown" ? null : (settings.hon.trim() || null),
          maintenant: `${greeting()} — ${longDate()}, ${spokenTime()}`,
          meteo: wx ? { lieu: wx.place, actuelle: wx.temp, ciel: wx.desc, min: wx.min, max: wx.max, risque_pluie_pct: wx.rain, vent_kmh: wx.wind } : null,
          agenda_du_jour: today === null ? "confidentiel : visage inconnu devant la caméra" : today.map((e) => ({ heure: e.time || null, titre: e.title })),
        });
        txt = Object.assign(txt, Object.fromEntries(Object.entries(ai).filter(([, v]) => typeof v === "string")));
        if (!wx) txt.meteo = "";
      } catch (e) { console.warn(e); toast(e.message || "IA indisponible — briefing standard."); }
    }
    store.set("lastBrief", isoDay());
    await speakSegments([
      { text: txt.intro, card: cardIdentity() },
      wx && { text: txt.meteo, card: cardWeather(wx) },
      { text: txt.agenda, card: cardAgenda(today) },
      { text: txt.conclusion },
    ]);
  } finally {
    busy = false;
    clearCards(6000);
    openConvo(20000);
  }
}

/* ---------------------------------------------------------------- réponses */
async function answer(q) {
  if (busy) return;
  busy = true;
  stopSpeaking();
  try {
    const n = norm(q);
    const h = hon();
    if (!n.trim()) { await speakSegments([{ text: `Oui${h ? ", " + h : ""} ?` }]); return; }

    if (/^(stop|silence|tais[- ]toi|chut|merci c'est tout|c'est tout)\b/.test(n)) { convoUntil = 0; return; }

    const add = parseAgenda(q);
    if (add) {
      events.push(add); saveEvents();
      const when = add.date === isoDay() ? "aujourd'hui" : add.date === isoDay(addDays(1)) ? "demain" : longDate(new Date(add.date + "T12:00"));
      await speakSegments([{ text: `C'est noté : ${add.title}, ${when}${add.time ? " à " + spokenHHMM(add.time) : ""}.`, card: cardAgenda(eventsFor(add.date), when) }]);
      return;
    }
    if (/meteo|quel temps|il fait (chaud|froid|beau)|temperature|pleuvoir|pluie|parapluie/.test(n)) {
      setState("thinking");
      const wx = await getWeather().catch(() => null);
      await speakSegments([wx ? { text: weatherText(wx), card: cardWeather(wx) } : { text: "Je n'arrive pas à obtenir la météo pour le moment. Vérifiez la ville dans les réglages, ou autorisez la localisation." }]);
      return;
    }
    if (/agenda|rendez-vous|rendez vous|mon programme|qu'est-ce que j'ai|qu'est ce que j'ai/.test(n)) {
      const tomorrow = /demain/.test(n);
      const day = isoDay(tomorrow ? addDays(1) : new Date());
      const list = settings.private && face.identity === "unknown" ? null : eventsFor(day);
      const label = tomorrow ? "demain" : "aujourd'hui";
      await speakSegments([{ text: agendaText(list, label), card: cardAgenda(list, label) }]);
      return;
    }
    if (hasKey()) {
      setState("thinking");
      try {
        const reply = await aiAnswer(q);
        const segs = toSegments(reply);
        if (reply.length > 160) { segs[0].card = `<div class="k">NOVA</div><div class="t">${esc(reply)}</div>`; segs[0].cardClass = "answer"; }
        await speakSegments(segs);
      } catch (e) {
        await speakSegments([{ text: "Je n'arrive pas à joindre mon intelligence en ligne. " + (e.message || "") }]);
      }
      return;
    }
    // Sans clé : quelques réponses locales.
    let text;
    if (/quelle heure|l'heure/.test(n)) text = `Il est ${spokenTime()}.`;
    else if (/quel jour|quelle date|on est quel|date d'aujourd'hui/.test(n)) text = `Nous sommes ${longDate()}.`;
    else if (/^merci/.test(n)) text = `Avec plaisir${h ? ", " + h : ""}.`;
    else if (/qui es[- ]tu|tu es qui|presente[- ]toi/.test(n)) text = "Je suis NOVA, votre assistant personnel. Dites bonjour pour votre briefing, ou demandez-moi la météo, l'heure ou votre agenda.";
    else text = "Pour converser librement, ajoutez une clé OpenAI dans mes réglages. En attendant, je peux vous donner l'heure, la météo et votre agenda.";
    await speakSegments([{ text }]);
  } finally {
    busy = false;
    clearCards(7000);
    openConvo(20000);
  }
}

/* ---------------------------------------------------------------- visage */
const face = {
  ready: false, descriptors: store.get("face", []).map((d) => new Float32Array(d)), avatar: store.get("avatar", null),
  identity: "none", lastSeen: 0, okStreak: 0, badStreak: 0, enrolling: false, stream: null,
};
function setFaceStat(text, cls = "") { const el = $("#facestat"); el.textContent = text; el.className = cls; }
$("#avatar").src = face.avatar || "";

async function startCamera() {
  if (!navigator.mediaDevices?.getUserMedia) { setFaceStat("CAMÉRA INDISPONIBLE", "warn"); return false; }
  try {
    face.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } }, audio: false });
    const v = $("#cam"); v.srcObject = face.stream; await v.play().catch(() => {});
    v.classList.add("live");
    return true;
  } catch {
    setFaceStat("CAMÉRA REFUSÉE", "warn");
    return false;
  }
}
async function loadFaceModels() {
  if (!window.faceapi) { setFaceStat("MODULE VISAGE INDISPONIBLE", "warn"); return; }
  setFaceStat("CHARGEMENT IA VISAGE…");
  try {
    if (faceapi.tf && faceapi.tf.ready) await faceapi.tf.ready();
    await Promise.all([
      faceapi.nets.tinyFaceDetector.loadFromUri(MODELS),
      faceapi.nets.faceLandmark68Net.loadFromUri(MODELS),
      faceapi.nets.faceRecognitionNet.loadFromUri(MODELS),
    ]);
    face.ready = true;
    setFaceStat(face.descriptors.length ? "RECHERCHE…" : "VISAGE NON ENREGISTRÉ");
    faceLoop();
  } catch (e) {
    console.warn(e); setFaceStat("IA VISAGE : ÉCHEC", "warn");
  }
}
const detectOpts = () => new faceapi.TinyFaceDetectorOptions({ inputSize: 256, scoreThreshold: 0.45 });
async function detect(video) {
  return faceapi.detectSingleFace(video, detectOpts()).withFaceLandmarks().withFaceDescriptor();
}
function bestDistance(desc) {
  let best = 9;
  for (const d of face.descriptors) best = Math.min(best, faceapi.euclideanDistance(desc, d));
  return best;
}
async function faceLoop() {
  const v = $("#cam");
  try {
    if (!face.enrolling && !document.hidden && v.readyState >= 2) {
      const det = await detect(v);
      const now = Date.now();
      if (det) {
        face.lastSeen = now;
        if (!face.descriptors.length) {
          face.identity = "face"; setFaceStat("VISAGE DÉTECTÉ · NON ENREGISTRÉ");
        } else if (bestDistance(det.descriptor) < 0.5) {
          face.okStreak++; face.badStreak = 0;
          if (face.okStreak >= 2 && face.identity !== "owner") onOwner();
        } else {
          face.badStreak++; face.okStreak = 0;
          if (face.badStreak >= 3 && face.identity !== "unknown") {
            face.identity = "unknown"; setFaceStat("VISAGE INCONNU", "warn");
            $("#cam").classList.remove("ok"); $("#avatar").classList.remove("show");
          }
        }
      } else if (face.identity !== "none" && now - face.lastSeen > 8000) {
        face.identity = "none"; face.okStreak = face.badStreak = 0;
        setFaceStat(face.descriptors.length ? "RECHERCHE…" : "VISAGE NON ENREGISTRÉ");
        $("#cam").classList.remove("ok"); $("#avatar").classList.remove("show");
      }
    }
  } catch (e) { console.warn(e); }
  setTimeout(faceLoop, 700);
}
function onOwner() {
  face.identity = "owner";
  setFaceStat("IDENTIFIÉ · " + (who() || "PROPRIÉTAIRE").toUpperCase(), "ok");
  $("#cam").classList.add("ok");
  if (busy) return;
  if (!$("#cards").children.length && face.avatar) $("#avatar").classList.add("show");
  if (settings.autoBrief && store.get("lastBrief", "") !== isoDay()) briefing();
}
function cropAvatar(video, box) {
  const c = document.createElement("canvas"); c.width = c.height = 160;
  const s = Math.max(box.width, box.height) * 1.5;
  const x = box.x + box.width / 2 - s / 2, y = box.y + box.height / 2 - s / 2;
  const cx = c.getContext("2d");
  cx.translate(160, 0); cx.scale(-1, 1); // miroir, comme à l'écran
  cx.drawImage(video, x, y, s, s, 0, 0, 160, 160);
  return c.toDataURL("image/jpeg", 0.82);
}
async function enroll() {
  if (!face.ready || !face.stream) { toast("Activez d'abord NOVA et autorisez la caméra (le module visage doit être chargé)."); return; }
  $("#panel").classList.add("hidden");
  const ov = $("#enroll"), v = $("#enrollcam"), msg = $("#enrollmsg"), bar = $("#enrollbar");
  ov.classList.remove("hidden"); v.srcObject = face.stream; await v.play().catch(() => {});
  face.enrolling = true;
  const samples = []; let avatar = null; const t0 = Date.now(); let cancelled = false;
  $("#enrollcancel").onclick = () => { cancelled = true; };
  const tips = ["Regardez la caméra…", "Tournez légèrement la tête à gauche…", "…puis à droite…", "Souriez un peu…", "Encore un instant…", "Parfait."];
  while (samples.length < 6 && !cancelled && Date.now() - t0 < 25000) {
    const det = await detect(v).catch(() => null);
    if (det && det.detection.score > 0.6) {
      samples.push(det.descriptor);
      if (!avatar) avatar = cropAvatar(v, det.detection.box);
      bar.style.width = (samples.length / 6) * 100 + "%";
      msg.textContent = tips[Math.min(samples.length, tips.length - 1)];
      await sleep(450);
    } else { msg.textContent = "Je ne vois pas bien votre visage : approchez-vous, avec de la lumière."; await sleep(250); }
  }
  face.enrolling = false; ov.classList.add("hidden"); bar.style.width = "0";
  if (samples.length < 6) { toast(cancelled ? "Enregistrement annulé." : "Enregistrement incomplet, réessayez avec plus de lumière."); return; }
  face.descriptors = samples; face.avatar = avatar;
  store.set("face", samples.map((d) => Array.from(d))); store.set("avatar", avatar);
  $("#avatar").src = avatar; renderFaceInfo();
  face.okStreak = 2; onOwner();
  speakSegments([{ text: `Enchanté${who() ? ", " + who() : ""}. Je vous reconnaîtrai désormais.`, card: cardIdentity() }]).then(() => clearCards(4000));
}

/* ---------------------------------------------------------------- réglages */
function renderFaceInfo() {
  $("#face-info").textContent = face.descriptors.length
    ? "Visage enregistré sur cet appareil (6 empreintes). Il n'est envoyé nulle part."
    : "Aucun visage enregistré.";
}
function renderEvents() {
  const ul = $("#ev-list"); ul.innerHTML = "";
  const from = isoDay(addDays(-1));
  events = events.filter((e) => e.date >= from);
  for (const e of events) {
    const li = document.createElement("li");
    const d = new Date(e.date + "T12:00").toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" });
    li.innerHTML = `<span><b>${esc(d)} ${esc(e.time)}</b> — ${esc(e.title)}</span>`;
    const del = document.createElement("button"); del.textContent = "✕"; del.title = "Supprimer";
    del.onclick = () => { events = events.filter((x) => x.id !== e.id); saveEvents(); };
    li.append(del); ul.append(li);
  }
  if (!events.length) ul.innerHTML = `<li><span>Aucun rendez-vous.</span></li>`;
}
function bindSettings() {
  const bind = (id, key, prop = "value", after) => {
    const el = $(id); el[prop] = settings[key];
    el.addEventListener("change", () => { settings[key] = prop === "checked" ? el.checked : el.value; saveSettings(); after && after(); });
  };
  bind("#s-name", "name"); bind("#s-hon", "hon");
  bind("#s-city", "city", "value", () => { wxCache = null; store.del("place"); });
  bind("#s-key", "key", "value", () => { neuralFailed = false; });
  bind("#s-voice", "voice", "value", () => { neuralFailed = false; });
  bind("#s-auto", "autoBrief", "checked"); bind("#s-private", "private", "checked");
  $("#ev-date").value = isoDay();
  $("#ev-add").onclick = () => {
    const title = $("#ev-title").value.trim(); if (!title) return;
    events.push({ id: Date.now().toString(36), date: $("#ev-date").value || isoDay(), time: $("#ev-time").value, title });
    saveEvents(); $("#ev-title").value = ""; $("#ev-time").value = "";
  };
  $("#enrollbtn").onclick = enroll;
  $("#forget").onclick = () => {
    face.descriptors = []; face.avatar = null; face.identity = "none";
    store.del("face"); store.del("avatar"); $("#avatar").classList.remove("show"); renderFaceInfo();
    setFaceStat("VISAGE NON ENREGISTRÉ"); toast("Visage oublié.");
  };
  $("#testvoice").onclick = () => { ensureAudio(); unlockSynth(); speakSegments([{ text: `Bonjour${who() ? " " + who() : ""}. Je suis NOVA. Voici ma voix.` }]); };
  $("#gear").onclick = () => $("#panel").classList.toggle("hidden");
  $("#close").onclick = () => $("#panel").classList.add("hidden");
  renderFaceInfo(); renderEvents();
}

/* ---------------------------------------------------------------- démarrage */
function tick() { $("#clock").textContent = new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }); }
setInterval(tick, 10000); tick();

function talkNow() {
  ensureAudio(); unlockSynth();
  if (state === "speaking") { stopSpeaking(); busy = false; setState("idle"); resumeListening(); return; }
  if (!SR) { $("#ask").focus(); toast("Reconnaissance vocale indisponible ici (essayez Chrome, Edge ou Safari). Vous pouvez écrire."); return; }
  micEnabled = true; startListening(); openConvo(15000);
}
$("#mic").onclick = talkNow;
$("#orb").onclick = talkNow;
$("#askform").onsubmit = (e) => {
  e.preventDefault();
  const q = $("#ask").value.trim(); if (!q) return;
  $("#ask").value = ""; $("#ask").blur(); ensureAudio(); unlockSynth();
  $("#heard").textContent = "« " + q + " »";
  const n = norm(q).replace(/^nova[\s,!.]*/, "");
  if (/^(bonjour|bon matin|salut|hello|coucou|bonsoir|hey)\b/.test(n) && n.split(/\s+/).length <= 4) briefing(); else answer(q);
};

$("#start").onclick = async () => {
  ensureAudio(); unlockSynth();
  $("#boot").classList.add("hidden");
  if (SR) { micEnabled = true; startListening(); }
  else toast("Reconnaissance vocale indisponible dans ce navigateur : écrivez à NOVA en bas de l'écran.", 6000);
  if (await startCamera()) loadFaceModels();
  getWeather().catch(() => {}); // pré-charge (et demande la localisation tôt)
  if (!who()) setTimeout(() => toast("Astuce : ouvrez ⚙ pour indiquer votre prénom et enregistrer votre visage.", 6000), 1500);
};
document.addEventListener("visibilitychange", () => { if (!document.hidden && micEnabled && !busy) startListening(); });

bindSettings();
