// main.js — orchestration for the journey.
// Scroll position → progress → scene. Scene frames → overlay states.
import { PROFILE, PROJECTS } from "../data/projects.js?v=12";
import { createExperience } from "./scene.js?v=12";

const $ = (s, r = document) => r.querySelector(s);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// ---------- static injections ----------
const L = PROFILE.links;
$("#contact-links").innerHTML = [
  ["Email", "rlanewzeal@gmail.com", "mailto:rlanewzeal@gmail.com"],
  ["LinkedIn", "in/dongyeunkim", L.linkedin],
  ["GitHub", "@ggasa", L.github],
  ["Résumé", "PDF ↗", L.resume],
].map(([k, v, href]) => `
  <a class="c-link" href="${href}" target="_blank" rel="noopener"><b>${k}</b><span>${v}</span></a>
`).join("");

$("#fallback-list").innerHTML = PROJECTS.map((p) =>
  `<li><a href="${p.link}">${p.title}</a> — ${p.kicker} (${p.period})</li>`).join("");

// hotspots
const hotspotLayer = $("#hotspots");
hotspotLayer.innerHTML = PROJECTS.map((p, i) => `
  <button class="hotspot" data-i="${i}" style="--accent:${p.accent}" aria-label="${p.title}">
    <span class="hs-label">${p.title}</span>
  </button>`).join("");
const hotspotEls = [...hotspotLayer.querySelectorAll(".hotspot")];
hotspotLayer.addEventListener("click", (e) => {
  const btn = e.target.closest(".hotspot");
  if (btn) window.open(PROJECTS[btn.dataset.i].link, "_blank", "noopener");
});

// chapter rail: intro + 6 projects + me + contact
const RAIL_ITEMS = ["Intro", ...PROJECTS.map((p) => p.short), "Me", "Contact"];
const rail = $("#rail");
rail.innerHTML = RAIL_ITEMS.map((label, i) => {
  const accent = i >= 1 && i <= PROJECTS.length ? PROJECTS[i - 1].accent : "var(--signal)";
  return `<button data-ch="${i}" style="--c:${accent}" aria-label="${label}"><span class="rl">${label}</span></button>`;
}).join("");
const railBtns = [...rail.querySelectorAll("button")];

// ---------- overlays ----------
const ovIntro = $("#ov-intro");
const ovCard = $("#ov-card");
const ovConverge = $("#ov-converge");
const ovContact = $("#ov-contact");

let cardIdx = -1;
function fillCard(i) {
  if (i === cardIdx) return;
  cardIdx = i;
  const p = PROJECTS[i];
  ovCard.style.setProperty("--accent", p.accent);
  $("#card-num").textContent = String(i + 1).padStart(2, "0");
  $("#card-motif").textContent = p.motif;
  $("#card-kicker").textContent = p.kicker;
  $("#card-title").textContent = p.title;
  $("#card-blurb").textContent = p.blurb;
  $("#card-period").textContent = p.period;
  $("#card-link").href = p.link;
  $("#card-tags").innerHTML = p.tags.map((t) => `<span>${t}</span>`).join("");
}

// ---------- boot ----------
let api = null;
const canvas = $("#scene");

function showFallback(err) {
  console.error("experience failed:", err);
  $("#loader").classList.add("hidden");
  $("#fallback").hidden = false;
  canvas.style.display = "none";
  $("#track").style.height = "0";
}

createExperience({
  canvas,
  projects: PROJECTS,
  onReady: ({ count, portraitOk }) => {
    $("#loader").classList.add("hidden");
    $("#pt-count").textContent = count.toLocaleString();
    if (!portraitOk) console.info("[portfolio] Silhouette fallback active — drop your photo at assets/dan.png.");
  },
  onFrame: handleFrame,
  onHubScreen: (list) => {
    for (const h of list) {
      const el = hotspotEls[h.i];
      el.style.display = h.visible ? "grid" : "none";
      if (h.visible) { el.style.left = h.x + "px"; el.style.top = h.y + "px"; }
    }
  },
}).then((exp) => {
  api = exp;
  window.__api = exp; // debug handle
  // size the scroll track: ~92vh per chapter-weight unit
  const totalW = exp.weights.reduce((a, b) => a + b, 0);
  $("#track").style.height = `${Math.round(totalW * 92)}vh`;
  onScroll();
}).catch(showFallback);

// ---------- scroll → progress ----------
let ticking = false;
function onScroll() {
  if (!api || ticking) return;
  ticking = true;
  requestAnimationFrame(() => {
    const max = document.documentElement.scrollHeight - window.innerHeight;
    api.setProgress(max > 0 ? window.scrollY / max : 0);
    ticking = false;
  });
}
window.addEventListener("scroll", onScroll, { passive: true });
window.addEventListener("resize", onScroll);

// ---------- frame → overlay states ----------
const NP = PROJECTS.length; // 6
let lastStates = "";
function handleFrame({ c, morph, chapter, localT }) {
  // chapters: 0 intro · 1..6 projects · 7 me (vortex→face) · 8 contact
  // Cards show only during a chapter's DWELL (camera parked at the neuron),
  // so the framed glyph and the card accent always belong to the same project.
  const introOn = c < 0.6;
  const projIdx = clamp(Math.floor(c - 1), 0, NP - 1);
  const local = c - Math.floor(c);
  const inProject = c >= 1.02 && c < NP + 1 && local >= 0.02 && local < 0.58;
  const convergeOn = c >= NP + 1.1 && c < NP + 1.92 && morph > 0.45;
  const contactOn = c >= NP + 1.97;

  if (inProject) fillCard(projIdx);

  const state = `${introOn}|${inProject ? projIdx : -1}|${convergeOn}|${contactOn}`;
  if (state !== lastStates) {
    lastStates = state;
    ovIntro.classList.toggle("on", introOn);
    ovCard.classList.toggle("on", inProject);
    ovConverge.classList.toggle("on", convergeOn);
    ovContact.classList.toggle("on", contactOn);

    // rail active dot: 0 intro, 1..6 projects, 7 me, 8 contact
    const railIdx = contactOn ? 8
      : c >= NP + 1 ? 7
      : c >= 1 ? projIdx + 1 : 0;
    railBtns.forEach((b, i) => b.classList.toggle("active", i === railIdx));
  }
}

// ---------- rail + home navigation ----------
function scrollToChapter(ch) {
  if (!api) return;
  const w = api.weights;
  const total = w.reduce((a, b) => a + b, 0);
  let acc = 0;
  for (let i = 0; i < ch; i++) acc += w[i];
  // land inside the chapter's DWELL (camera parked, card + glyph matched);
  // "Me" lands late so the face is already formed, contact mid-chapter
  const frac =
    ch === 0 ? 0.02 :
    ch <= NP ? 0.18 :
    ch === NP + 1 ? 0.85 : 0.5;
  const p = (acc + (w[ch] || 1) * frac) / total;
  const max = document.documentElement.scrollHeight - window.innerHeight;
  window.scrollTo({ top: p * max, behavior: "smooth" });
}
rail.addEventListener("click", (e) => {
  const b = e.target.closest("button");
  if (b) scrollToChapter(+b.dataset.ch);
});
$("#home-link").addEventListener("click", (e) => {
  e.preventDefault();
  window.scrollTo({ top: 0, behavior: "smooth" });
});

// ---------- hub hover focus ----------
hotspotLayer.addEventListener("pointerover", (e) => {
  const btn = e.target.closest(".hotspot");
  if (btn && api) api.focusHub(+btn.dataset.i);
});
hotspotLayer.addEventListener("pointerout", (e) => {
  if (e.target.closest(".hotspot") && api) api.clearFocus();
});
