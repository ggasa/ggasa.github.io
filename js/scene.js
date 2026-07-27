// scene.js — a scroll-driven journey through a neural network.
//
// The whole site is one 3D world. One project-neuron per entry in
// data/projects.js sits along a corridor in depth; scroll flies the camera
// neuron to neuron (damped scrub). At the end, every particle flies out of
// the depth and converges into Dan's face. Hub count (NH) is however many
// projects there are — see HUB_MODE/HUB_POL for how each keeps its own
// signature glyph/polarity independent of array position.
//
// All heavy motion lives in the vertex shader driven by a handful of uniforms
// (uChapter reveals neurons, uMorph converges the face, uPointer repels
// particles around the cursor), so per-frame CPU cost stays tiny — phones ok.

import {
  Scene, PerspectiveCamera, WebGLRenderer, Group,
  BufferGeometry, BufferAttribute, ShaderMaterial,
  Points, LineSegments, AdditiveBlending, Color, Vector2, Vector3, MathUtils,
} from "three";

import { sampleFacePoints } from "./portrait.js?v=19";

// ---- world layout ------------------------------------------------------
// Hub (soma) world positions — a winding corridor into depth. One entry per
// project in data/projects.js (index-aligned) — resize both together.
const HUBS = [
  [ 0.0,  0.0,   0.0],
  [ 2.6,  0.9,  -7.5],
  [-2.6, -1.1, -15.0],
  [ 2.4,  1.2, -22.5],
  [-0.4, -0.3, -30.0],
];
// Which side of the screen the active neuron should sit on (camera offset sign).
const SIDE = [1, -1, 1, -1, 1];

// Synapse backbone: consecutive hops + two long skips for richness.
const BACKBONE = [[0,1],[1,2],[2,3],[3,4],[0,2],[2,4]];

const V = new Vector3();
const LOOK = new Vector3();
const HV = new Vector3();   // scratch for helix-glyph proximity projection

function pickCount() {
  const override = parseInt(new URLSearchParams(location.search).get("n"), 10);
  if (Number.isFinite(override) && override > 6) return override;
  const coarse = matchMedia("(pointer: coarse)").matches;
  const isMobile = coarse || Math.min(window.innerWidth, window.innerHeight) < 620;
  const c = Math.round((window.innerWidth * window.innerHeight) / 340);
  return Math.max(1500, Math.min(c, isMobile ? 2600 : 6500));
}

// ---- per-project lightning geometry ---------------------------------------
// Each neuron is an electric glyph, not a particle swarm. Six possible modes
// exist — yang (discharging outward: storm 0 / burst 2 / path 4) and yin
// (absorbing inward: cycle 1 / wave 3 / halo 5) — a project's `mode` field
// picks one; not every mode has to be in use. Returns a list of polylines in
// hub-local space; points and bolt lines are both built from them.
const TAU = Math.PI * 2;
const rnd = (a, b) => a + Math.random() * (b - a);

function buildBranches(mode) {
  const B = [];
  if (mode === 0) {
    // STORM (yang) — jagged radial bolts with forks
    const nb = 9;
    for (let b = 0; b < nb; b++) {
      const th = (b / nb) * TAU + rnd(-0.25, 0.25);
      const pts = [[0, 0, 0]];
      for (let s = 1; s <= 6; s++) {
        const r = 1.3 * s / 6;
        const a = th + rnd(-0.42, 0.42);
        pts.push([Math.cos(a) * r, Math.sin(a) * r, rnd(-0.22, 0.22)]);
      }
      B.push(pts);
      if (Math.random() < 0.55) {            // fork off the midpoint
        const m = pts[3], fa = th + rnd(-1.1, 1.1);
        const f = [m];
        for (let s = 1; s <= 3; s++) {
          const fr = 0.5 * s / 3;
          f.push([m[0] + Math.cos(fa) * fr, m[1] + Math.sin(fa) * fr, m[2] + rnd(-0.14, 0.14)]);
        }
        B.push(f);
      }
    }
  } else if (mode === 1) {
    // CYCLE (yin) — closed ring + spokes feeding the soma (a 24/7 loop)
    const R = 0.9, n = 28, ring = [];
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * TAU;
      ring.push([Math.cos(a) * R, Math.sin(a) * R, rnd(-0.07, 0.07)]);
    }
    B.push(ring);
    for (let s = 0; s < 5; s++) {
      const a = (s / 5) * TAU + 0.35;
      B.push([[Math.cos(a) * R, Math.sin(a) * R, 0],
              [Math.cos(a) * R * 0.5, Math.sin(a) * R * 0.52, rnd(-0.1, 0.1)],
              [0, 0, 0]]);
    }
  } else if (mode === 2) {
    // BURST (yang) — evenly spaced rays; the flash travels all of them at once
    const nb = 14;
    for (let b = 0; b < nb; b++) {
      const th = (b / nb) * TAU;
      const pts = [[0, 0, 0]];
      for (let s = 1; s <= 3; s++) {
        const r = 1.22 * s / 3;
        pts.push([Math.cos(th) * r, Math.sin(th) * r, rnd(-0.1, 0.1)]);
      }
      B.push(pts);
    }
    // aperture iris: an octagon around the soma, like camera blades
    const ir = [];
    for (let i = 0; i <= 8; i++) {
      const a = (i / 8) * TAU + TAU / 16;
      ir.push([Math.cos(a) * 0.42, Math.sin(a) * 0.42, rnd(-0.04, 0.04)]);
    }
    B.push(ir);
  } else if (mode === 3) {
    // WAVE (yin) — stacked physiological traces, glow drifts along them
    for (let tr = 0; tr < 5; tr++) {
      const y0 = -0.62 + tr * 0.31;
      const amp = rnd(0.09, 0.17), f = rnd(1.6, 3.0), ph = rnd(0, TAU), n = 12;
      const pts = [];
      for (let i = 0; i <= n; i++) {
        const x = -1.18 + 2.36 * i / n;
        let y = y0 + Math.sin(x * f * 2 + ph) * amp + rnd(-0.02, 0.02);
        // the middle trace carries a heartbeat: Q-R-S around the centerline
        if (tr === 2) {
          if (i === 5) y = y0 - 0.09;
          else if (i === 6) y = y0 + 0.38;
          else if (i === 7) y = y0 - 0.16;
          else y = y0 + Math.sin(x * f * 2 + ph) * amp * 0.35;
        }
        pts.push([x, y, rnd(-0.09, 0.09)]);
      }
      B.push(pts);
    }
  } else if (mode === 4) {
    // PATH (yang) — Manhattan corridors, pulses race the right angles
    for (let b = 0; b < 7; b++) {
      let x = 0, y = 0, horiz = Math.random() < 0.5;
      const z = rnd(-0.16, 0.16);
      const pts = [[0, 0, z]];
      for (let s = 0; s < 5; s++) {
        const len = rnd(0.24, 0.5) * (Math.random() < 0.5 ? -1 : 1);
        if (horiz) x += len; else y += len;
        x = MathUtils.clamp(x, -1.25, 1.25);
        y = MathUtils.clamp(y, -0.9, 0.9);
        pts.push([x, y, z]);
        horiz = !horiz;
      }
      B.push(pts);
    }
  } else {
    // HALO (yin) — concentric rings, breathing softly
    for (const R of [0.5, 0.85, 1.2]) {
      const n = 30, pts = [];
      for (let i = 0; i <= n; i++) {
        const a = (i / n) * TAU;
        pts.push([Math.cos(a) * R, Math.sin(a) * R * 0.92, rnd(-0.06, 0.06)]);
      }
      B.push(pts);
    }
  }
  return B;
}

// random point on a random branch (for pinning member particles to filaments)
function pointOnBranches(branches, jitter) {
  const br = branches[(Math.random() * branches.length) | 0];
  const si = (Math.random() * (br.length - 1)) | 0;
  const t = Math.random();
  const a = br[si], b = br[si + 1];
  return [
    a[0] + (b[0] - a[0]) * t + rnd(-jitter, jitter),
    a[1] + (b[1] - a[1]) * t + rnd(-jitter, jitter),
    a[2] + (b[2] - a[2]) * t + rnd(-jitter, jitter),
  ];
}

// ---- shaders -------------------------------------------------------------
const POINT_VERT = /* glsl */`
  uniform float uTime, uChapter, uMorph, uSize, uPixelRatio, uFocus, uAspect, uPush, uHelixAngle;
  uniform vec2 uPointer;
  attribute vec3 aNetwork, aPortrait, aYin, aColor, aHubPos, aSeedPos;
  attribute float aSeed, aSize, aHub, aPol, aPLum, aSeedT;
  varying vec3 vColor;
  varying float vAlpha, vGlow, vIsHub;

  void main() {
    // 1) birth: particle grows out of its soma as its chapter approaches
    float reveal = clamp(uChapter - aHub, 0.0, 1.0);
    reveal = reveal * reveal * (3.0 - 2.0 * reveal);
    vec3 npos = mix(aHubPos, aNetwork, reveal);

    // 0) genesis: a DNA double helix — fire strand and water strand braided
    //    around one axis, turning slowly as a rigid body. On scroll it
    //    unwinds from the bottom and DIVERGES down the corridor.
    vec3 sp = aSeedPos;
    float hAng = uHelixAngle;
    float hc = cos(hAng), hs = sin(hAng);
    sp.xz = mat2(hc, -hs, hs, hc) * sp.xz;
    // lean + roll the axis into a diagonal so the coils read fully 3D
    float lc = cos(0.35), ls = sin(0.35);
    sp.yz = mat2(lc, -ls, ls, lc) * sp.yz;
    float rc = cos(0.15), rs = sin(0.15);
    sp.xy = mat2(rc, -rs, rs, rc) * sp.xy;
    // perspective shading: near side of the coil glows, far side recedes
    float helixShade = 0.35 + 0.65 * smoothstep(-0.62, 0.62, sp.z);

    float div = clamp(uChapter - 1.0, 0.0, 1.0);
    div = div * div * (3.0 - 2.0 * div);
    // bottom rungs unwind first; each hub's stream departs slightly staggered
    float lag = clamp(div * 2.0 - aSeedT * 0.55 - aHub * 0.07, 0.0, 1.0);
    npos = mix(sp, npos, lag);

    // single-stage morph: network → face
    float m = clamp(uMorph, 0.0, 1.0);
    m = m * m * (3.0 - 2.0 * m);

    // 2) no positional drift — network particles hold still and twinkle
    //    (luminance-only motion is far easier on the eyes). While in the
    //    helix, the twinkle becomes a pulse climbing the strands.
    float tw = 0.68 + 0.32 * sin(uTime * 1.6 + aSeed * 6.283);
    float strandPulse = 0.60 + 0.40 * sin(aSeedT * 22.0 - uTime * 2.1 + aPol * 1.5708);
    tw = mix(strandPulse, tw, lag);

    // 3) the taijitu lives on as motion, not as a destination: mid-flight the
    //    particles bow toward their spot in a turning yin-yang field, so the
    //    convergence swirls like a vortex — but the symbol never forms
    vec3 yy = aYin;
    float ang = uTime * 0.42;
    float ca = cos(ang), sa = sin(ang);
    yy.xy = mat2(ca, -sa, sa, ca) * yy.xy;
    float tilt = sin(uTime * 0.19) * 0.55;
    float ct = cos(tilt), st = sin(tilt);
    yy.xz = mat2(ct, -st, st, ct) * yy.xz;

    vec3 straight = mix(npos, aPortrait, m);
    float bow = m * (1.0 - m) * 2.2;            // peaks 0.55 mid-flight
    vec3 pos = mix(straight, yy, bow);

    vec4 mv = modelViewMatrix * vec4(pos, 1.0);
    vec4 clip = projectionMatrix * mv;

    // 4) cursor probe with polarity: light flees the cursor, shadow is drawn
    //    to it (yin-yang under your fingertip). The face repels uniformly.
    vec2 ndc = clip.xy / max(clip.w, 0.0001);
    vec2 toP = (ndc - uPointer) * vec2(uAspect, 1.0);
    float pd = length(toP);
    float push = smoothstep(0.42, 0.0, pd) * uPush;
    float pol = mix(aPol, 1.0, m);
    mv.xy += normalize(toP + 1e-5) * push * 0.36 * pol;
    clip = projectionMatrix * mv;
    gl_Position = clip;

    float dist = -mv.z;
    float depthFade = smoothstep(17.0, 5.5, dist) * smoothstep(0.45, 1.4, dist);
    depthFade = mix(depthFade, smoothstep(30.0, 4.0, dist), m);

    bool focused = uFocus > -0.5 && abs(aHub - uFocus) < 0.5;
    float focusDim = (uFocus > -0.5 && !focused) ? 0.25 : 1.0;

    // portrait: silver pointillism — photo luminance drives brightness
    vec3 faceCol = vec3(0.88, 0.91, 0.96) * (0.22 + 0.88 * aPLum);
    vColor = mix(aColor, faceCol, m);
    vGlow = push;
    vIsHub = step(2.5, aSize);
    // twinkle only in network mode; the face holds steady
    float steady = max(m, vIsHub);
    // visible while inside the seed (lag→0) OR once its neuron reveals;
    // streams dim as they arrive at their still-sleeping somas
    float vis = max(reveal, 1.0 - lag);
    vAlpha = vis * depthFade * focusDim * mix(tw, 1.0, steady)
           * mix(helixShade, 1.0, lag);

    // luminance also drives size in the portrait (bright = bigger)
    float lumSize = mix(1.0, 0.50 + 0.85 * aPLum, m);
    float s = aSize * lumSize * uSize * uPixelRatio * (focused ? 1.5 : 1.0) / max(dist, 0.001);
    gl_PointSize = clamp(s, 1.0, 44.0 * uPixelRatio);
  }
`;

const POINT_FRAG = /* glsl */`
  uniform float uMorph;
  varying vec3 vColor;
  varying float vAlpha, vGlow, vIsHub;
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float d = length(c);
    if (d > 0.5) discard;
    float core = smoothstep(0.5, 0.04, d);
    float a = core;
    if (vIsHub > 0.5) {
      // soma: hot core + wide halo
      a = smoothstep(0.5, 0.0, d) * 0.5 + smoothstep(0.16, 0.02, d);
    }
    float base = mix(0.74, 0.95, clamp(uMorph, 0.0, 1.0));
    vec3 col = vColor * (1.0 + vGlow * 2.2) + vec3(vGlow * 0.35);
    gl_FragColor = vec4(col, a * base * vAlpha);
  }
`;

const LINE_VERT = /* glsl */`
  uniform float uTime, uChapter, uMorph;
  attribute vec3 aNetwork, aYin, aColor, aHubPos;
  attribute float aSeed, aHub, aEdgeT, aPhase, aHubB;
  varying vec3 vColor;
  varying float vEdgeT, vPhase, vM, vReveal;
  void main() {
    float reveal = clamp(uChapter - aHub, 0.0, 1.0);
    reveal = reveal * reveal * (3.0 - 2.0 * reveal);
    vec3 npos = mix(aHubPos, aNetwork, reveal);

    float m1 = clamp(uMorph, 0.0, 1.0);
    m1 = m1 * m1 * (3.0 - 2.0 * m1);

    // endpoints follow their particles into the taijitu while fading out
    vec3 yy = aYin;
    float ang = uTime * 0.42;
    float ca = cos(ang), sa = sin(ang);
    yy.xy = mat2(ca, -sa, sa, ca) * yy.xy;
    float tilt = sin(uTime * 0.19) * 0.55;
    float ct = cos(tilt), st = sin(tilt);
    yy.xz = mat2(ct, -st, st, ct) * yy.xz;

    vec3 pos = mix(npos, yy, m1);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);

    // a line lights only when BOTH endpoints' neurons exist,
    // and never before the intro seed has dispersed
    float rB = clamp(uChapter - aHubB, 0.0, 1.0);
    float div = smoothstep(0.7, 1.0, clamp(uChapter - 1.0, 0.0, 1.0));
    vReveal = min(reveal, rB) * div;
    vColor = aColor; vEdgeT = aEdgeT; vPhase = aPhase; vM = m1;
  }
`;

const LINE_FRAG = /* glsl */`
  uniform float uTime;
  varying vec3 vColor;
  varying float vEdgeT, vPhase, vM, vReveal;
  void main() {
    float p = fract(uTime * 0.30 + vPhase);
    float pulse = smoothstep(0.10, 0.0, abs(vEdgeT - p));
    vec3 col = vColor * 0.45 + vColor * pulse * 2.2;
    float a = (0.05 + pulse * 0.95) * (1.0 - vM) * vReveal;
    gl_FragColor = vec4(col, a);
  }
`;

// ---- lightning bolts: one electric signature per project -------------------
const BOLT_VERT = /* glsl */`
  uniform float uTime, uChapter, uMorph, uFocus, uAspect, uPush, uHelixAngle;
  uniform vec2 uPointer;
  attribute vec3 aNetwork, aYin, aColor, aHubPos, aMini;
  attribute float aHub, aSegT, aPhase, aMiniT, aGlyphMode, aPolB;
  varying vec3 vColor;
  varying float vSegT, vPhase, vMode, vM1, vReveal, vFocus;
  void main() {
    float reveal = clamp(uChapter - aHub, 0.0, 1.0);
    reveal = reveal * reveal * (3.0 - 2.0 * reveal);
    vec3 npos = mix(aHubPos, aNetwork, reveal);   // bolts grow out of the soma

    float m1 = clamp(uMorph, 0.0, 1.0);
    m1 = m1 * m1 * (3.0 - 2.0 * m1);

    vec3 yy = aYin;
    float ang = uTime * 0.42;
    float ca = cos(ang), sa = sin(ang);
    yy.xy = mat2(ca, -sa, sa, ca) * yy.xy;
    float tilt = sin(uTime * 0.19) * 0.55;
    float ct = cos(tilt), st = sin(tilt);
    yy.xz = mat2(ct, -st, st, ct) * yy.xz;

    vec3 posN = mix(npos, yy, m1);

    // intro: the glyph rides the helix as a small gene-marker satellite,
    // running its signature animation in miniature (same transform chain
    // as the strands so it stays welded to the turning structure)
    vec3 anchor = aMini;
    float hAng = uHelixAngle;
    float hc = cos(hAng), hs = sin(hAng);
    anchor.xz = mat2(hc, -hs, hs, hc) * anchor.xz;
    float lc = cos(0.35), ls = sin(0.35);
    anchor.yz = mat2(lc, -ls, ls, lc) * anchor.yz;
    float rc = cos(0.15), rs = sin(0.15);
    anchor.xy = mat2(rc, -rs, rs, rc) * anchor.xy;
    float aShade = 0.62 + 0.38 * smoothstep(-0.9, 0.9, anchor.z);
    vec3 miniPos = anchor + (aNetwork - aHubPos) * 0.13;  // MINI_SCALE

    float divR = clamp(uChapter - 1.0, 0.0, 1.0);
    float div = divR * divR * (3.0 - 2.0 * divR);
    float hubLag = clamp(div * 2.0 - aMiniT * 0.55 - aHub * 0.07, 0.0, 1.0);
    hubLag = hubLag * hubLag * (3.0 - 2.0 * hubLag);

    vec3 pos = mix(miniPos, posN, hubLag);

    vec4 mv = modelViewMatrix * vec4(pos, 1.0);
    vec4 clip = projectionMatrix * mv;
    // the mini constellation reacts to the cursor with the same yin-yang
    // physics as the particles: yang glyphs flee, yin glyphs lean in
    vec2 ndc = clip.xy / max(clip.w, 0.0001);
    vec2 toP = (ndc - uPointer) * vec2(uAspect, 1.0);
    float push = smoothstep(0.30, 0.0, length(toP)) * uPush * (1.0 - hubLag);
    mv.xy += normalize(toP + 1e-5) * push * 0.22 * aPolB;
    gl_Position = projectionMatrix * mv;

    vColor = aColor; vSegT = aSegT; vPhase = aPhase; vMode = aGlyphMode;
    vM1 = m1;
    // visible as a mini on the helix, then as the full glyph once arrived.
    // minis read brighter (1.8x) since they're tiny — colors must pop.
    float crystall = smoothstep(0.7, 1.0, divR);
    vReveal = max((1.0 - hubLag) * aShade * 1.8, reveal * crystall);
    vFocus = uFocus < -0.5 ? 0.0 : (abs(aHub - uFocus) < 0.5 ? 1.0 : -1.0);
  }
`;

const BOLT_FRAG = /* glsl */`
  uniform float uTime;
  varying vec3 vColor;
  varying float vSegT, vPhase, vMode, vM1, vReveal, vFocus;

  void main() {
    float t = uTime;
    float base, pulse;

    if (vMode < 0.5) {
      // 0 STORM (yang): bolts strike outward, gated — dark, then CRACK
      float head = fract(t * 1.15 + vPhase);
      float gate = smoothstep(0.45, 0.9, sin(t * 2.6 + vPhase * 40.0) * 0.5 + 0.5);
      pulse = exp(-16.0 * abs(vSegT - head)) * (0.15 + 0.85 * gate);
      base = 0.09;
    } else if (vMode < 1.5) {
      // 1 CYCLE (yin): one luminous wave endlessly circling the loop, inward spokes
      pulse = pow(0.5 + 0.5 * sin((vSegT + vPhase) * 6.283 - t * 1.1), 3.0) * 0.9;
      base = 0.20;
    } else if (vMode < 2.5) {
      // 2 BURST (yang): all rays flash together — an expanding ring of light
      float head = fract(t * 0.5);
      pulse = exp(-11.0 * abs(vSegT - head)) * smoothstep(1.0, 0.75, head);
      base = 0.10;
    } else if (vMode < 3.5) {
      // 3 WAVE (yin): slow glow drifting along the traces, right to left
      pulse = pow(0.5 + 0.5 * sin(vSegT * 9.0 + t * 0.9 + vPhase * 6.283), 2.0) * 0.75;
      base = 0.21;
    } else if (vMode < 4.5) {
      // 4 PATH (yang): sharp pulses racing the corridors at staggered times
      float head = fract(t * 0.85 + vPhase);
      pulse = exp(-14.0 * abs(vSegT - head));
      base = 0.11;
    } else {
      // 5 HALO (yin): rings breathe in slow counter-phase
      pulse = pow(0.5 + 0.5 * sin(t * 0.55 + vPhase * 6.283 - vSegT * 3.14), 2.0) * 0.65;
      base = 0.24;
    }

    // hover: yang signatures spike brighter, yin signatures swell their glow
    if (vFocus > 0.5) { pulse *= 1.7; base *= 1.9; }
    else if (vFocus < -0.5) { pulse *= 0.35; base *= 0.35; }

    vec3 col = vColor * (base * 1.5 + pulse * 2.3);
    float a = (base + pulse) * vReveal * (1.0 - vM1);
    gl_FragColor = vec4(col, a);
  }
`;

// ---- helix rungs: base pairs bridging the fire and water strands ----------
const RUNG_VERT = /* glsl */`
  uniform float uTime, uChapter, uHelixAngle;
  attribute float aT;
  varying float vT, vDiv, vShade;
  void main() {
    vec3 pos = position;
    float hAng = uHelixAngle;
    float hc = cos(hAng), hs = sin(hAng);
    pos.xz = mat2(hc, -hs, hs, hc) * pos.xz;
    float lc = cos(0.35), ls = sin(0.35);
    pos.yz = mat2(lc, -ls, ls, lc) * pos.yz;
    float rc = cos(0.15), rs = sin(0.15);
    pos.xy = mat2(rc, -rs, rs, rc) * pos.xy;
    vShade = 0.35 + 0.65 * smoothstep(-0.62, 0.62, pos.z);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
    vT = aT;
    vDiv = clamp(uChapter - 1.0, 0.0, 1.0);
  }
`;

const RUNG_FRAG = /* glsl */`
  uniform float uTime;
  varying float vT, vDiv, vShade;
  void main() {
    float pulse = 0.5 + 0.5 * sin(vT * 22.0 - uTime * 2.1);
    // rungs snap as the helix unwinds (bottom first, following the strands)
    float gone = smoothstep(vT * 0.35 + 0.04, vT * 0.35 + 0.16, vDiv);
    vec3 col = vec3(0.82, 0.87, 0.94) * (0.35 + 0.65 * pulse);
    gl_FragColor = vec4(col, (0.16 + 0.30 * pulse) * (1.0 - gone) * vShade);
  }
`;

const DUST_VERT = /* glsl */`
  uniform float uTime, uSize, uPixelRatio;
  attribute float aSeed;
  varying float vA;
  void main() {
    vec3 pos = position;
    pos.y += sin(uTime * 0.25 + aSeed * 6.283) * 0.3;
    vec4 mv = modelViewMatrix * vec4(pos, 1.0);
    gl_Position = projectionMatrix * mv;
    float dist = -mv.z;
    vA = smoothstep(30.0, 4.0, dist) * smoothstep(0.4, 2.0, dist) * 0.35;
    gl_PointSize = clamp(0.9 * uSize * uPixelRatio / max(dist, 0.001), 1.0, 5.0 * uPixelRatio);
  }
`;

const DUST_FRAG = /* glsl */`
  varying float vA;
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float d = length(c);
    if (d > 0.5) discard;
    gl_FragColor = vec4(vec3(0.72, 0.76, 0.82), smoothstep(0.5, 0.1, d) * vA);
  }
`;

// ---- experience ----------------------------------------------------------
export async function createExperience({ canvas, projects, onReady, onFrame, onHubScreen }) {
  const DEBUG = new URLSearchParams(location.search).has("debug");
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;

  const renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true,
    powerPreference: "high-performance", preserveDrawingBuffer: DEBUG });
  const dpr = Math.min(window.devicePixelRatio || 1, 1.8);
  renderer.setPixelRatio(dpr);

  const scene = new Scene();
  const camera = new PerspectiveCamera(52, 1, 0.1, 120);

  const group = new Group();
  scene.add(group);

  const count = pickCount();
  const NH = HUBS.length;
  // Glyph mode (which signature animation) and yin-yang polarity are explicit
  // per-project fields, NOT derived from array position — so removing or
  // reordering a project never reshuffles another project's identity.
  const HUB_MODE = projects.map((p) => p.mode);
  const HUB_POL = projects.map((p) => p.pol);

  // ---- chapter timeline --------------------------------------------------
  // 0 intro · 1..NH projects · NH+1 me (vortex → face) · NH+2 contact
  const WEIGHTS = [0.7, ...Array(NH).fill(1), 1.6, 1.1];
  const TOTAL_W = WEIGHTS.reduce((a, b) => a + b, 0);
  const NCH = WEIGHTS.length;
  // progress p (0..1) → continuous chapter coordinate c (0..NCH)
  function chapterOf(p) {
    let acc = 0;
    const t = p * TOTAL_W;
    for (let i = 0; i < NCH; i++) {
      if (t <= acc + WEIGHTS[i] || i === NCH - 1) return i + (t - acc) / WEIGHTS[i];
      acc += WEIGHTS[i];
    }
    return NCH;
  }

  // camera keyframes at each chapter start (+ final resting key).
  // Rebuilt on resize: on narrow screens the lateral offset shrinks (neuron
  // stays centered) and the look-target drops (neuron rides above the card).
  const KEYS = [];
  function buildKeys() {
    const aspect = window.innerWidth / Math.max(1, window.innerHeight);
    const f = MathUtils.clamp((aspect - 0.65) / (1.5 - 0.65), 0, 1); // 0 = phone, 1 = wide
    const lat = 0.25 + 1.3 * f;          // lateral camera offset
    const lookDrop = 0.55 * (1 - f);     // aim lower → subject rises in frame
    const h = (i) => new Vector3(...HUBS[i]);
    KEYS[0] = { pos: h(0).clone().add(new Vector3(0.0, 0.12, 2.95 + 0.9 * (1 - f))),
                look: h(0).clone().add(new Vector3(0, 0.1 - lookDrop * 0.6, 0)) };  // intro: the genesis helix
    for (let i = 0; i < NH; i++) {
      KEYS[i + 1] = {
        pos: h(i).clone().add(new Vector3(-SIDE[i] * lat, 0.5, 4.3 + 1.1 * (1 - f))),
        look: h(i).clone().add(new Vector3(0, -lookDrop, 0)),
      };
    }
    KEYS[NH + 1] = { pos: new Vector3(0, 0.4, 9.2 + 1.2 * (1 - f)), look: new Vector3(0, 0.15, 0) };  // me: watch the vortex, dolly in
    KEYS[NH + 2] = { pos: new Vector3(0, 0.15, 5.7 + 1.4 * (1 - f)), look: new Vector3(0, 0.15, 0) }; // contact
    KEYS[NH + 3] = { pos: new Vector3(0, 0.10, 5.3 + 1.4 * (1 - f)), look: new Vector3(0, 0.15, 0) };  // resting
  }
  buildKeys();

  // ---- particle attributes ------------------------------------------------
  const aNetwork = new Float32Array(count * 3);
  const aPortrait = new Float32Array(count * 3);
  const aYin = new Float32Array(count * 3);
  const aColor = new Float32Array(count * 3);
  const aHubPos = new Float32Array(count * 3);
  const aSeedPos = new Float32Array(count * 3);
  const aSeedT = new Float32Array(count);
  const aSeed = new Float32Array(count);
  const aSize = new Float32Array(count);
  const aHub = new Float32Array(count);
  const aPol = new Float32Array(count);
  const aPLum = new Float32Array(count);

  // genesis helix dimensions (shared with the rung builder below)
  const H_TURNS = 2.6, H_R = 0.5, H_H = 2.7, H_Y = 0.12;

  // mini project-glyphs that ride the helix as gene loci. Small (~helix
  // thickness) and sitting right on the strand. MINI_R/MINI_LOCI are shared
  // by the bolt geometry (aMini) AND the DOM hotspot projection so the
  // clickable center always tracks the glyph as the helix turns.
  const MINI_LOCI = Array.from({ length: NH }, (_, i) => 0.10 + i * (0.80 / Math.max(1, NH - 1)));
  const MINI_R = 0.66;     // just off the strand (H_R=0.5) so each glyph reads
  const MINI_SCALE = 0.13; // small — a charm on the coil, but structure visible
  // world-space center of glyph h at helix angle `ang` (mirrors BOLT_VERT)
  function miniAnchor(h, ang, out) {
    const tt = MINI_LOCI[h];
    const th = tt * H_TURNS * TAU + (HUB_POL[h] > 0 ? 0 : Math.PI);
    let x = Math.cos(th) * MINI_R, y = (tt - 0.5) * H_H + H_Y, z = Math.sin(th) * MINI_R;
    const hc = Math.cos(ang), hs = Math.sin(ang);
    [x, z] = [hc * x + hs * z, -hs * x + hc * z];      // xz by helix spin
    const lc = Math.cos(0.35), ls = Math.sin(0.35);
    [y, z] = [lc * y + ls * z, -ls * y + lc * z];       // yz lean
    const rc = Math.cos(0.15), rs = Math.sin(0.15);
    [x, y] = [rc * x + rs * y, -rs * x + rc * y];       // xy roll
    out.set(x, y, z);
  }

  const accents = projects.map((p) => new Color(p.accent));
  const imgOverride = new URLSearchParams(location.search).get("img");
  const { positions: portrait, lums, ok } =
    await sampleFacePoints(imgOverride || "assets/dan.png", count);
  // portrait sits at the origin area, slightly lifted
  for (let i = 0; i < count; i++) portrait[i * 3 + 1] += 0.15;

  // taijitu sampler: uniform point in the disk whose region matches `pol`.
  // Halves split along the classic S-curve; each half holds an opposite-
  // polarity eye. pol +1 = light, -1 = dark.
  const YR = 1.5;                       // taijitu radius
  function yinYangPoint(pol, out, o) {
    for (let tries = 0; tries < 60; tries++) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.sqrt(Math.random()) * YR;
      const x = Math.cos(a) * r, y = Math.sin(a) * r;
      const dTop = Math.hypot(x, y - YR / 2);
      const dBot = Math.hypot(x, y + YR / 2);
      let region; // +1 light, -1 dark
      if (dTop < YR / 6) region = -1;        // dark eye in the light lobe
      else if (dBot < YR / 6) region = 1;    // light eye in the dark lobe
      else if (dTop < YR / 2) region = 1;    // light lobe (top)
      else if (dBot < YR / 2) region = -1;   // dark lobe (bottom)
      else region = x >= 0 ? 1 : -1;         // S-split halves
      if (region === pol) {
        out[o] = x;
        out[o + 1] = y + 0.15;
        out[o + 2] = (Math.random() - 0.5) * 0.22;
        return;
      }
    }
    out[o] = 0; out[o + 1] = 0.15; out[o + 2] = 0;
  }

  // one lightning glyph per hub; particles sit ON the filaments
  const HUB_BRANCHES = Array.from({ length: NH }, (_, h) => buildBranches(HUB_MODE[h]));

  for (let i = 0; i < count; i++) {
    const isHub = i < NH;
    const h = isHub ? i : (i % NH);
    const hp = HUBS[h];
    const pol = HUB_POL[h];   // this project's own fire(+1)/water(-1) identity

    let nx = hp[0], ny = hp[1], nz = hp[2];
    if (!isHub) {
      const off = pointOnBranches(HUB_BRANCHES[h], 0.035);
      nx += off[0]; ny += off[1]; nz += off[2];
    }
    aNetwork[i*3] = nx; aNetwork[i*3+1] = ny; aNetwork[i*3+2] = nz;
    aHubPos[i*3] = hp[0]; aHubPos[i*3+1] = hp[1]; aHubPos[i*3+2] = hp[2];
    aPortrait[i*3] = portrait[i*3]; aPortrait[i*3+1] = portrait[i*3+1]; aPortrait[i*3+2] = portrait[i*3+2];
    yinYangPoint(pol, aYin, i * 3);

    // genesis helix: fire hubs ride one strand, water hubs the other
    {
      const t = Math.random();
      const th = t * H_TURNS * TAU + (pol > 0 ? 0 : Math.PI);
      const jr = 0.055 * Math.sqrt(Math.random()), ja = Math.random() * TAU;
      aSeedPos[i*3]   = Math.cos(th) * H_R + Math.cos(ja) * jr;
      aSeedPos[i*3+1] = (t - 0.5) * H_H + H_Y + (Math.random() - 0.5) * 0.03;
      aSeedPos[i*3+2] = Math.sin(th) * H_R + Math.sin(ja) * jr;
      aSeedT[i] = t;
    }

    const c = accents[h];
    aColor[i*3] = c.r; aColor[i*3+1] = c.g; aColor[i*3+2] = c.b;
    aSeed[i] = Math.random();
    aSize[i] = isHub ? 7.0 : 0.85 + Math.random() * 1.25;
    aHub[i] = h;
    aPol[i] = pol;
    aPLum[i] = lums[i];
  }

  const geo = new BufferGeometry();
  geo.setAttribute("position", new BufferAttribute(aNetwork, 3));
  geo.setAttribute("aNetwork", new BufferAttribute(aNetwork, 3));
  geo.setAttribute("aPortrait", new BufferAttribute(aPortrait, 3));
  geo.setAttribute("aYin", new BufferAttribute(aYin, 3));
  geo.setAttribute("aColor", new BufferAttribute(aColor, 3));
  geo.setAttribute("aHubPos", new BufferAttribute(aHubPos, 3));
  geo.setAttribute("aSeedPos", new BufferAttribute(aSeedPos, 3));
  geo.setAttribute("aSeedT", new BufferAttribute(aSeedT, 1));
  geo.setAttribute("aSeed", new BufferAttribute(aSeed, 1));
  geo.setAttribute("aSize", new BufferAttribute(aSize, 1));
  geo.setAttribute("aHub", new BufferAttribute(aHub, 1));
  geo.setAttribute("aPol", new BufferAttribute(aPol, 1));
  geo.setAttribute("aPLum", new BufferAttribute(aPLum, 1));

  const uniforms = {
    uTime: { value: 0 },
    uChapter: { value: 1 },     // hub 0 alive from the first frame
    uMorph: { value: 0 },
    uSize: { value: 34 * (window.innerHeight / 900) },
    uPixelRatio: { value: dpr },
    uFocus: { value: -1 },
    uAspect: { value: 1 },
    uPush: { value: 0 },                    // armed on first real pointer move
    uPointer: { value: new Vector2(0, 0) },
    uHelixAngle: { value: 0 },              // CPU-accumulated so it can ease
  };

  const pointMat = new ShaderMaterial({
    uniforms, vertexShader: POINT_VERT, fragmentShader: POINT_FRAG,
    transparent: true, depthWrite: false, blending: AdditiveBlending,
  });
  const points = new Points(geo, pointMat);
  points.frustumCulled = false;
  group.add(points);

  // ---- synapse lines (inter-hub backbone only; bolts handle intra-hub) -----
  const edges = [];
  for (const [a, b] of BACKBONE) edges.push([a, b]);

  const nE = edges.length * 2;
  const eN = new Float32Array(nE * 3), eY = new Float32Array(nE * 3),
        eC = new Float32Array(nE * 3), eHP = new Float32Array(nE * 3);
  const eSeed = new Float32Array(nE), eHub = new Float32Array(nE),
        eHubB = new Float32Array(nE), eT = new Float32Array(nE), ePh = new Float32Array(nE);

  edges.forEach((e, ei) => {
    const phase = Math.random();
    const hubA = aHub[e[0]], hubB = aHub[e[1]];
    e.forEach((pi, side) => {
      const v = ei * 2 + side;
      for (let k = 0; k < 3; k++) {
        eN[v*3+k] = aNetwork[pi*3+k];
        eY[v*3+k] = aYin[pi*3+k];
        eC[v*3+k] = aColor[pi*3+k];
        eHP[v*3+k] = aHubPos[pi*3+k];
      }
      eSeed[v] = aSeed[pi];
      eHub[v] = aHub[pi];
      eHubB[v] = side === 0 ? hubB : hubA;  // the OTHER endpoint's hub
      eT[v] = side;
      ePh[v] = phase;
    });
  });

  const lineGeo = new BufferGeometry();
  lineGeo.setAttribute("position", new BufferAttribute(eN, 3));
  lineGeo.setAttribute("aNetwork", new BufferAttribute(eN, 3));
  lineGeo.setAttribute("aYin", new BufferAttribute(eY, 3));
  lineGeo.setAttribute("aColor", new BufferAttribute(eC, 3));
  lineGeo.setAttribute("aHubPos", new BufferAttribute(eHP, 3));
  lineGeo.setAttribute("aSeed", new BufferAttribute(eSeed, 1));
  lineGeo.setAttribute("aHub", new BufferAttribute(eHub, 1));
  lineGeo.setAttribute("aHubB", new BufferAttribute(eHubB, 1));
  lineGeo.setAttribute("aEdgeT", new BufferAttribute(eT, 1));
  lineGeo.setAttribute("aPhase", new BufferAttribute(ePh, 1));

  const lineMat = new ShaderMaterial({
    uniforms, vertexShader: LINE_VERT, fragmentShader: LINE_FRAG,
    transparent: true, depthWrite: false, blending: AdditiveBlending,
  });
  const lines = new LineSegments(lineGeo, lineMat);
  lines.frustumCulled = false;
  group.add(lines);

  // ---- lightning bolts ------------------------------------------------------
  // Flatten each hub's branch polylines into line segments. Every vertex knows
  // its param along the branch (aSegT) so the shader can run light along it.
  {
    const segs = [];   // {hub, ax..bz, ta, tb, phase}
    for (let h = 0; h < NH; h++) {
      const hp = HUBS[h];
      for (const br of HUB_BRANCHES[h]) {
        const phase = Math.random();
        // approximate param by cumulative segment index
        for (let s = 0; s < br.length - 1; s++) {
          segs.push({
            h, phase,
            a: br[s], b: br[s + 1],
            ta: s / (br.length - 1), tb: (s + 1) / (br.length - 1),
            hp,
          });
        }
      }
    }
    const nB = segs.length * 2;
    const bN = new Float32Array(nB * 3), bY = new Float32Array(nB * 3),
          bC = new Float32Array(nB * 3), bHP = new Float32Array(nB * 3),
          bMini = new Float32Array(nB * 3);
    const bHub = new Float32Array(nB), bT = new Float32Array(nB),
          bPh = new Float32Array(nB), bMiniT = new Float32Array(nB),
          bGlyphMode = new Float32Array(nB), bPolB = new Float32Array(nB);

    // gene loci: where each project's mini-glyph sits on the helix strand
    const LOCI = MINI_LOCI;
    const ANCHORS = LOCI.map((t, h) => {
      const th = t * H_TURNS * TAU + (HUB_POL[h] > 0 ? 0 : Math.PI);
      return [Math.cos(th) * MINI_R, (t - 0.5) * H_H + H_Y, Math.sin(th) * MINI_R];
    });

    const yyTmp = new Float32Array(3);
    segs.forEach((sg, si) => {
      const pol = HUB_POL[sg.h];
      // per-segment taijitu target: a short streak so bolts dissolve cleanly
      yinYangPoint(pol, yyTmp, 0);
      const dx = rnd(-0.15, 0.15), dy = rnd(-0.15, 0.15);
      const c = accents[sg.h];
      const an = ANCHORS[sg.h];
      [[sg.a, sg.ta, 0], [sg.b, sg.tb, 1]].forEach(([pt, tp, side]) => {
        const v = si * 2 + side;
        bN[v*3]   = sg.hp[0] + pt[0];
        bN[v*3+1] = sg.hp[1] + pt[1];
        bN[v*3+2] = sg.hp[2] + pt[2];
        bY[v*3]   = yyTmp[0] + dx * side;
        bY[v*3+1] = yyTmp[1] + dy * side;
        bY[v*3+2] = yyTmp[2];
        bC[v*3] = c.r; bC[v*3+1] = c.g; bC[v*3+2] = c.b;
        bHP[v*3] = sg.hp[0]; bHP[v*3+1] = sg.hp[1]; bHP[v*3+2] = sg.hp[2];
        bMini[v*3] = an[0]; bMini[v*3+1] = an[1]; bMini[v*3+2] = an[2];
        bHub[v] = sg.h; bT[v] = tp; bPh[v] = sg.phase;
        bMiniT[v] = LOCI[sg.h];
        bGlyphMode[v] = HUB_MODE[sg.h];
        bPolB[v] = pol;
      });
    });

    const boltGeo = new BufferGeometry();
    boltGeo.setAttribute("position", new BufferAttribute(bN, 3));
    boltGeo.setAttribute("aNetwork", new BufferAttribute(bN, 3));
    boltGeo.setAttribute("aYin", new BufferAttribute(bY, 3));
    boltGeo.setAttribute("aColor", new BufferAttribute(bC, 3));
    boltGeo.setAttribute("aHubPos", new BufferAttribute(bHP, 3));
    boltGeo.setAttribute("aMini", new BufferAttribute(bMini, 3));
    boltGeo.setAttribute("aHub", new BufferAttribute(bHub, 1));
    boltGeo.setAttribute("aSegT", new BufferAttribute(bT, 1));
    boltGeo.setAttribute("aPhase", new BufferAttribute(bPh, 1));
    boltGeo.setAttribute("aMiniT", new BufferAttribute(bMiniT, 1));
    boltGeo.setAttribute("aGlyphMode", new BufferAttribute(bGlyphMode, 1));
    boltGeo.setAttribute("aPolB", new BufferAttribute(bPolB, 1));

    var boltMat = new ShaderMaterial({
      uniforms, vertexShader: BOLT_VERT, fragmentShader: BOLT_FRAG,
      transparent: true, depthWrite: false, blending: AdditiveBlending,
    });
    const bolts = new LineSegments(boltGeo, boltMat);
    bolts.frustumCulled = false;
    group.add(bolts);
    var boltGeoRef = boltGeo;
  }

  // ---- helix rungs ----------------------------------------------------------
  const N_RUNGS = 26;
  const rPos = new Float32Array(N_RUNGS * 2 * 3);
  const rT = new Float32Array(N_RUNGS * 2);
  for (let k = 0; k < N_RUNGS; k++) {
    const t = (k + 0.5) / N_RUNGS;
    const th = t * H_TURNS * TAU;
    const y = (t - 0.5) * H_H + H_Y;
    const x = Math.cos(th) * H_R, z = Math.sin(th) * H_R;
    rPos.set([x, y, z, -x, y, -z], k * 6);
    rT[k * 2] = t; rT[k * 2 + 1] = t;
  }
  const rungGeo = new BufferGeometry();
  rungGeo.setAttribute("position", new BufferAttribute(rPos, 3));
  rungGeo.setAttribute("aT", new BufferAttribute(rT, 1));
  const rungMat = new ShaderMaterial({
    uniforms, vertexShader: RUNG_VERT, fragmentShader: RUNG_FRAG,
    transparent: true, depthWrite: false, blending: AdditiveBlending,
  });
  const rungs = new LineSegments(rungGeo, rungMat);
  rungs.frustumCulled = false;
  group.add(rungs);

  // ---- ambient dust --------------------------------------------------------
  const dustCount = matchMedia("(pointer: coarse)").matches ? 260 : 520;
  const dPos = new Float32Array(dustCount * 3);
  const dSeed = new Float32Array(dustCount);
  for (let i = 0; i < dustCount; i++) {
    dPos[i*3]   = (Math.random() * 2 - 1) * 7;
    dPos[i*3+1] = (Math.random() * 2 - 1) * 4.5;
    dPos[i*3+2] = 5 - Math.random() * 50;
    dSeed[i] = Math.random();
  }
  const dustGeo = new BufferGeometry();
  dustGeo.setAttribute("position", new BufferAttribute(dPos, 3));
  dustGeo.setAttribute("aSeed", new BufferAttribute(dSeed, 1));
  const dustMat = new ShaderMaterial({
    uniforms, vertexShader: DUST_VERT, fragmentShader: DUST_FRAG,
    transparent: true, depthWrite: false, blending: AdditiveBlending,
  });
  const dust = new Points(dustGeo, dustMat);
  dust.frustumCulled = false;
  scene.add(dust);

  // ---- pointer -------------------------------------------------------------
  const pointer = { x: 0, y: 0, tx: 0, ty: 0 }; // NDC
  function onPointerMove(e) {
    const x = (e.touches ? e.touches[0].clientX : e.clientX);
    const y = (e.touches ? e.touches[0].clientY : e.clientY);
    pointer.tx = (x / window.innerWidth) * 2 - 1;
    pointer.ty = -((y / window.innerHeight) * 2 - 1);
    if (!reduced) uniforms.uPush.value = 1;   // arm the cursor probe
  }
  window.addEventListener("pointermove", onPointerMove, { passive: true });
  window.addEventListener("touchmove", onPointerMove, { passive: true });

  // ---- resize ---------------------------------------------------------------
  function resize() {
    const w = window.innerWidth, h = window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    uniforms.uAspect.value = w / h;
    uniforms.uSize.value = 34 * (h / 900);
    buildKeys();
  }
  window.addEventListener("resize", resize);
  resize();

  // ---- progress + camera scrub ----------------------------------------------
  let targetP = 0;   // set by scroll
  let curC = 0;      // damped chapter coordinate
  let helixAngle = 0, helixSpeed = 0.28;  // eased helix spin (slows on hover)
  const camPos = KEYS[0].pos.clone();
  const camLook = KEYS[0].look.clone();
  camera.position.copy(camPos);
  camera.lookAt(camLook);

  // Each chapter is dwell-then-fly: the camera PARKS at its keyframe for the
  // first 38% (card readable, neuron framed, colors matched), then travels.
  const DWELL = 0.38;
  function cameraAt(c) {
    const i = Math.min(Math.floor(c), KEYS.length - 2);
    let t = c - i;
    t = t < DWELL ? 0 : (t - DWELL) / (1 - DWELL);
    t = t * t * (3 - 2 * t); // smooth within segment
    V.lerpVectors(KEYS[i].pos, KEYS[i + 1].pos, t);
    LOOK.lerpVectors(KEYS[i].look, KEYS[i + 1].look, t);
  }

  // ---- hub screen projection (for DOM hotspots) ------------------------------
  const HUB_V = new Vector3();
  function projectHubs() {
    if (!onHubScreen) return;
    const w = window.innerWidth, h = window.innerHeight;
    const m = uniforms.uMorph.value;
    const ha = uniforms.uHelixAngle.value;
    // intro: the mini-glyphs orbit the helix. Their clickable centers
    // track the live anchor (only while the helix is still assembled).
    const introMode = curC < 0.55;
    const out = [];
    for (let i = 0; i < NH; i++) {
      if (introMode) {
        miniAnchor(i, ha, HUB_V);
        HUB_V.project(camera);
        // all are clickable; back-side ones still project to a valid spot
        const visible = HUB_V.z < 1 &&
                        Math.abs(HUB_V.x) < 1.05 && Math.abs(HUB_V.y) < 1.05;
        out.push({ i, x: (HUB_V.x * 0.5 + 0.5) * w, y: (-HUB_V.y * 0.5 + 0.5) * h, z: HUB_V.z, visible, mini: true });
        continue;
      }
      HUB_V.set(HUBS[i][0], HUBS[i][1], HUBS[i][2]);
      HUB_V.project(camera);
      const revealed = uniforms.uChapter.value - i > 0.6;
      const visible = m < 0.4 && revealed && HUB_V.z < 1 &&
                      Math.abs(HUB_V.x) < 1.1 && Math.abs(HUB_V.y) < 1.1;
      out.push({ i, x: (HUB_V.x * 0.5 + 0.5) * w, y: (-HUB_V.y * 0.5 + 0.5) * h, z: HUB_V.z, visible, mini: false });
    }
    onHubScreen(out);
  }

  // ---- render loop ------------------------------------------------------------
  let running = true, raf = 0;
  const clock = { t: 0, last: performance.now() };
  const diag = window.__diag = { frames: 0, c: 0, morph: 0, count };

  function step(dt) {
    dt = Math.min(dt, 0.05);
    clock.t += dt;

    // damped scrub toward scroll target
    const targetC = chapterOf(targetP);
    const k = reduced ? 1 : Math.min(1, dt * 3.4);
    curC += (targetC - curC) * k;

    // uniforms from chapter coordinate.
    // uChapter = curC + 1 → hub i grows in during the chapter before its own,
    // and hub 0 is alive from the very first frame.
    uniforms.uTime.value = clock.t;
    uniforms.uChapter.value = curC + 1;
    // morph ramps across the "me" chapter; the shader adds the vortex bow
    uniforms.uMorph.value = MathUtils.clamp((curC - (NH + 1)) / 0.9, 0, 1);

    // pointer easing
    pointer.x += (pointer.tx - pointer.x) * Math.min(1, dt * 6);
    pointer.y += (pointer.ty - pointer.y) * Math.min(1, dt * 6);
    uniforms.uPointer.value.set(pointer.x, pointer.y);

    // camera: keyframe path + mouse parallax + breath
    cameraAt(MathUtils.clamp(curC, 0, KEYS.length - 1.0001));
    const par = reduced ? 0 : 1;
    camPos.set(
      V.x + pointer.x * 0.30 * par + Math.sin(clock.t * 0.23) * 0.05,
      V.y + pointer.y * 0.22 * par + Math.cos(clock.t * 0.19) * 0.04,
      V.z
    );
    camera.position.copy(camPos);
    camLook.lerp(LOOK, Math.min(1, dt * 5));
    camera.lookAt(camLook);

    // helix spin eases to a near-stop when the cursor is near a project glyph,
    // so the orbiting markers are easy to click; resumes when the cursor leaves
    let nearGlyph = 0;
    if (!reduced && curC < 0.55 && uniforms.uPush.value > 0.01) {
      const asp = camera.aspect;
      for (let i = 0; i < NH; i++) {
        miniAnchor(i, helixAngle, HV);
        HV.project(camera);
        if (HV.z >= 1) continue;
        const dx = (HV.x - pointer.x) * asp, dy = HV.y - pointer.y;
        const prox = 1 - MathUtils.smoothstep(Math.hypot(dx, dy), 0.05, 0.26);
        if (prox > nearGlyph) nearGlyph = prox;
      }
    }
    const targetSpeed = 0.28 * (1 - 0.94 * nearGlyph);
    helixSpeed += (targetSpeed - helixSpeed) * Math.min(1, dt * 4);
    helixAngle += helixSpeed * dt;
    uniforms.uHelixAngle.value = helixAngle;

    // the face gently tracks the cursor once formed
    const m = uniforms.uMorph.value;
    group.rotation.y = pointer.x * 0.14 * m * par;
    group.rotation.x = -pointer.y * 0.10 * m * par;

    renderer.render(scene, camera);
    projectHubs();
    onFrame && onFrame({ c: curC, morph: m, chapter: Math.floor(MathUtils.clamp(curC, 0, NCH - 0.001)), localT: curC % 1 });

    diag.frames++; diag.c = curC; diag.morph = m;
    diag.helixAngle = helixAngle; diag.helixSpeed = helixSpeed;
  }

  function frame(now) {
    if (!running) return;
    raf = requestAnimationFrame(frame);
    step((now - clock.last) / 1000);
    clock.last = now;
  }

  // Driver: rAF normally; `?loop=interval` for hidden-tab verification only.
  const useInterval = new URLSearchParams(location.search).get("loop") === "interval";
  let timer = 0;
  if (useInterval) {
    timer = setInterval(() => { if (running) step(0.033); }, 33);
  } else {
    raf = requestAnimationFrame(frame);
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) { running = false; cancelAnimationFrame(raf); }
      else if (!running) { running = true; clock.last = performance.now(); raf = requestAnimationFrame(frame); }
    });
  }

  if (DEBUG) window.__debugScene = { scene, camera, group, uniforms, HUBS, NH, HUB_MODE, HUB_POL, MINI_LOCI, geo, points, renderer, pointMat };
  onReady && onReady({ count, portraitOk: ok });

  return {
    count,
    chapters: NCH,
    weights: WEIGHTS,
    setProgress(p) { targetP = MathUtils.clamp(p, 0, 1); },
    focusHub(i) { uniforms.uFocus.value = i; },
    clearFocus() { uniforms.uFocus.value = -1; },
    step,
    pause() { running = false; cancelAnimationFrame(raf); clearInterval(timer); },
    destroy() {
      running = false; cancelAnimationFrame(raf); clearInterval(timer);
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("touchmove", onPointerMove);
      geo.dispose(); lineGeo.dispose(); dustGeo.dispose(); boltGeoRef.dispose(); rungGeo.dispose();
      pointMat.dispose(); lineMat.dispose(); boltMat.dispose(); dustMat.dispose(); rungMat.dispose(); renderer.dispose();
    },
  };
}
