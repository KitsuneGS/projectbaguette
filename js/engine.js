/* Project Baguette – Rhythm Engine
   Notes:
   - Single moving "target cluster" (like an arcade target group) driven by snap-to patterns.
   - One note per beat (subject to per-lane caps) with strong visual pulses.
   - Sprites are drawn as a white base with a colored tint overlay (tune in RENDER section).
*/

////////////////////////////////////////////////////////////
// DEBUG FLAG (?debug=1)
////////////////////////////////////////////////////////////
const DEBUG = new URLSearchParams(location.search).get("debug") === "1";

////////////////////////////////////////////////////////////
// ELEMENTS + CANVAS
////////////////////////////////////////////////////////////
const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

const mv = document.getElementById("mv");
const audio = document.getElementById("song");

// Hide MV until playback confirmed
if (mv) {
  mv.style.opacity = "0";
  mv.style.display = "none";
  mv.style.transition = "opacity 1s ease";
}

let width = window.innerWidth;
let height = window.innerHeight;
let dpr = window.devicePixelRatio || 1;

function fitCanvasToScreen() {
  dpr = window.devicePixelRatio || 1;
  width = window.innerWidth;
  height = window.innerHeight;

  canvas.width = Math.floor(width * dpr);
  canvas.height = Math.floor(height * dpr);
  canvas.style.width = "100%";
  canvas.style.height = "100%";

  // Draw in CSS pixels
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
window.addEventListener("resize", fitCanvasToScreen);
fitCanvasToScreen();
canvas.style.touchAction = "none";

const isMobile = /iPhone|iPad|Android/i.test(navigator.userAgent);

////////////////////////////////////////////////////////////
// UI SCALE (requested: reduce UI size ~15%)
////////////////////////////////////////////////////////////
const UI_SCALE = 0.85;

////////////////////////////////////////////////////////////
// TAP-TO-START OVERLAY (not used in menu mode)
////////////////////////////////////////////////////////////
const startOverlay = document.createElement("div");
startOverlay.style.cssText = `
  position:fixed; top:0; left:0;
  width:100vw; height:100vh;
  background:black;
  display:flex;
  flex-direction:column;
  align-items:center;
  justify-content:center;
  color:white;
  font-family:Arial Black, sans-serif;
  font-size:32px;
  z-index:99999;
`;
startOverlay.innerHTML = `
  <div style="opacity:0.9">PROJECT BAGUETTE</div>
  <div id="tapText" style="margin-top:20px; font-size:20px; opacity:0.7;">Tap to Start</div>
`;
if (!window.__PB_MENU_MODE__) document.body.appendChild(startOverlay);

let blink = true;
setInterval(() => {
  blink = !blink;
  const el = document.getElementById("tapText");
  if (el) el.style.opacity = blink ? "0.9" : "0.4";
}, 600);

////////////////////////////////////////////////////////////
// CONSTANTS
////////////////////////////////////////////////////////////
let BPM = 120;
let BEAT = 60 / BPM;

let DIFF = "Normal";
const APPROACH_BY_DIFF = { Easy: 3.2, Normal: 2.8, Hard: 2.4, Extreme: 2.0 };
const MAX_ALIVE_BY_DIFF = { Easy: 6, Normal: 8, Hard: 10, Extreme: 12 };
const MAX_ALIVE_PER_LANE_BY_DIFF = { Easy: 1, Normal: 1, Hard: 2, Extreme: 3 };

// Timing windows in seconds
const HIT_WINDOWS_BY_DIFF = {
  Easy:    { perfect: 0.11, good: 0.25, safe: 0.34, sad: 0.42, miss: 0.50 },
  Normal:  { perfect: 0.08, good: 0.18, safe: 0.26, sad: 0.33, miss: 0.40 },
  Hard:    { perfect: 0.065, good: 0.15, safe: 0.22, sad: 0.28, miss: 0.34 },
  Extreme: { perfect: 0.055, good: 0.13, safe: 0.19, sad: 0.25, miss: 0.30 }
};
function getHitWindows() {
  return HIT_WINDOWS_BY_DIFF[DIFF] || HIT_WINDOWS_BY_DIFF.Normal;
}

// One note per beat, but keep tiny spacing to avoid duplicate times
const MIN_NOTE_GAP_BY_DIFF = { Easy: 0.28, Normal: 0.22, Hard: 0.18, Extreme: 0.14 };
function getMinNoteGap() {
  return MIN_NOTE_GAP_BY_DIFF[DIFF] ?? 0.22;
}

const SPAWN_LOOKAHEAD = 8.0;

const HIT_FADE_TIME = 0.55;
const MISS_FADE_TIME = 0.85;

let APPROACH_TIME = APPROACH_BY_DIFF[DIFF] ?? 2.8;

function setBpm(v) {
  BPM = Number(v) || 120;
  BEAT = 60 / BPM;
}
function applyDifficulty() {
  APPROACH_TIME = APPROACH_BY_DIFF[DIFF] ?? 2.8;
}

////////////////////////////////////////////////////////////
// LANES (keys) + SPRITES
////////////////////////////////////////////////////////////
const LANES = [
  { key: "w", label: "W", color: "#2a7bff", icon: "assets/sprites/triangle.png" },
  { key: "a", label: "A", color: "#2a7bff", icon: "assets/sprites/square.png"   },
  { key: "s", label: "S", color: "#2a7bff", icon: "assets/sprites/x.png"        },
  { key: "d", label: "D", color: "#2a7bff", icon: "assets/sprites/circle.png"   }
];

// Load images once. If any are missing, we fallback to text.
const laneIcons = LANES.map((l) => {
  const img = new Image();
  img.src = l.icon;
  return img;
});

// Pre-tinted canvases: white silhouette + blue tint
const spriteCacheWhite = new Array(LANES.length).fill(null);
const spriteCacheTint  = new Array(LANES.length).fill(null);

function makeTintCanvas(img, color) {
  const c = document.createElement("canvas");
  c.width = img.naturalWidth || img.width;
  c.height = img.naturalHeight || img.height;
  const cctx = c.getContext("2d");
  cctx.clearRect(0, 0, c.width, c.height);
  cctx.drawImage(img, 0, 0);
  cctx.globalCompositeOperation = "source-in";
  cctx.fillStyle = color;
  cctx.fillRect(0, 0, c.width, c.height);
  cctx.globalCompositeOperation = "source-over";
  return c;
}

function getWhiteSprite(lane) {
  const img = laneIcons[lane];
  if (!img || !img.complete || !img.naturalWidth) return null;
  if (!spriteCacheWhite[lane]) spriteCacheWhite[lane] = makeTintCanvas(img, "#ffffff");
  return spriteCacheWhite[lane];
}
function getTintSprite(lane) {
  const img = laneIcons[lane];
  if (!img || !img.complete || !img.naturalWidth) return null;
  if (!spriteCacheTint[lane]) spriteCacheTint[lane] = makeTintCanvas(img, LANES[lane].color);
  return spriteCacheTint[lane];
}

////////////////////////////////////////////////////////////
// SONG TIME
////////////////////////////////////////////////////////////
function getSongTime() {
  if (audio && !isNaN(audio.currentTime)) return audio.currentTime;
  return 0;
}

////////////////////////////////////////////////////////////
// AUTO-CHART (MP3-safe)
////////////////////////////////////////////////////////////
let audioCtx = null;
let analyser = null;
let mediaSrc = null;

let beatTimes = [];
let autoChartReady = false;
let nextBeatIndex = 0;
let lastSpawnedBeatTime = -Infinity;

async function prepareAutoChart() {
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!audioCtx) audioCtx = new AC();

  if (!analyser) {
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 2048;
  }
  if (!mediaSrc) {
    mediaSrc = audioCtx.createMediaElementSource(audio);
    mediaSrc.connect(analyser);
    analyser.connect(audioCtx.destination);
  }

  beatTimes = [];

  try {
    const resp = await fetch(audio.src);
    const buf = await resp.arrayBuffer();
    const dec = await audioCtx.decodeAudioData(buf);

    const ch = dec.getChannelData(0);
    const sr = dec.sampleRate;
    const frame = 1024;
    const hop = 512;

    const energies = [];
    for (let i = 0; i + frame < ch.length; i += hop) {
      let sum = 0;
      for (let j = 0; j < frame; j++) sum += ch[i + j] ** 2;
      energies.push(Math.sqrt(sum / frame));
    }

    const mean = energies.reduce((a, b) => a + b, 0) / energies.length;
    const threshold = mean * 1.25;
    let lastBeat = -999;
    const minGap = 0.23;

    for (let i = 1; i < energies.length - 1; i++) {
      const e = energies[i];
      if (e > threshold && e > energies[i - 1] && e > energies[i + 1]) {
        const t = (i * hop) / sr;
        if (t - lastBeat >= minGap) {
          beatTimes.push(t);
          lastBeat = t;
        }
      }
    }

    if (beatTimes.length < 8) {
      // Fallback: steady beat grid
      for (let t = 0; t < dec.duration; t += BEAT) beatTimes.push(t);
    }

    beatTimes.sort((a, b) => a - b);
    autoChartReady = true;
  } catch (e) {
    // Safe fallback
    for (let t = 0; t < 120; t += BEAT) beatTimes.push(t);
    autoChartReady = true;
  }
}

////////////////////////////////////////////////////////////
// PATTERNS (snap-to target cluster positions)
////////////////////////////////////////////////////////////

// Each pattern is 8 steps (1 "measure" = 8 notes).
// dx/dy are offsets from the screen center, in fractions of min(width,height).
// ang controls the direction notes fly in from (radians).
const SPAWN_PATTERNS = [
  [
    { dx:  0.00, dy: -0.06, ang: -Math.PI / 2 },
    { dx:  0.06, dy:  0.00, ang:  0.00 },
    { dx:  0.00, dy:  0.06, ang:  Math.PI / 2 },
    { dx: -0.06, dy:  0.00, ang:  Math.PI },
    { dx:  0.04, dy: -0.04, ang: -Math.PI / 4 },
    { dx:  0.04, dy:  0.04, ang:  Math.PI / 4 },
    { dx: -0.04, dy:  0.04, ang:  3 * Math.PI / 4 },
    { dx: -0.04, dy: -0.04, ang: -3 * Math.PI / 4 }
  ],
  [
    { dx: -0.07, dy: -0.02, ang: -3 * Math.PI / 4 },
    { dx:  0.07, dy: -0.02, ang: -Math.PI / 4 },
    { dx: -0.07, dy:  0.02, ang:  3 * Math.PI / 4 },
    { dx:  0.07, dy:  0.02, ang:  Math.PI / 4 },
    { dx:  0.00, dy: -0.07, ang: -Math.PI / 2 },
    { dx:  0.07, dy:  0.00, ang:  0.00 },
    { dx:  0.00, dy:  0.07, ang:  Math.PI / 2 },
    { dx: -0.07, dy:  0.00, ang:  Math.PI }
  ],
  [
    { dx: -0.06, dy:  0.00, ang:  Math.PI },
    { dx: -0.03, dy: -0.05, ang: -2.3 },
    { dx:  0.03, dy: -0.05, ang: -0.8 },
    { dx:  0.06, dy:  0.00, ang:  0.00 },
    { dx:  0.03, dy:  0.05, ang:  0.8 },
    { dx: -0.03, dy:  0.05, ang:  2.3 },
    { dx:  0.00, dy: -0.07, ang: -Math.PI / 2 },
    { dx:  0.00, dy:  0.07, ang:  Math.PI / 2 }
  ],
  [
    { dx:  0.00, dy:  0.00, ang:  0.00 },
    { dx:  0.06, dy: -0.03, ang: -0.2 },
    { dx:  0.03, dy:  0.06, ang:  1.6 },
    { dx: -0.06, dy:  0.03, ang:  2.9 },
    { dx: -0.03, dy: -0.06, ang: -1.6 },
    { dx:  0.06, dy:  0.03, ang:  0.2 },
    { dx: -0.06, dy: -0.03, ang: -2.9 },
    { dx:  0.03, dy: -0.06, ang: -1.6 }
  ],
  [
    { dx: -0.07, dy: -0.04, ang: -2.6 },
    { dx: -0.07, dy:  0.04, ang:  2.6 },
    { dx:  0.07, dy: -0.04, ang: -0.5 },
    { dx:  0.07, dy:  0.04, ang:  0.5 },
    { dx:  0.00, dy: -0.07, ang: -Math.PI / 2 },
    { dx: -0.04, dy:  0.00, ang:  Math.PI },
    { dx:  0.04, dy:  0.00, ang:  0.00 },
    { dx:  0.00, dy:  0.07, ang:  Math.PI / 2 }
  ],
  [
    { dx:  0.00, dy: -0.07, ang: -Math.PI / 2 },
    { dx:  0.00, dy: -0.02, ang: -Math.PI / 2 },
    { dx:  0.00, dy:  0.02, ang:  Math.PI / 2 },
    { dx:  0.00, dy:  0.07, ang:  Math.PI / 2 },
    { dx: -0.07, dy:  0.00, ang:  Math.PI },
    { dx: -0.02, dy:  0.00, ang:  Math.PI },
    { dx:  0.02, dy:  0.00, ang:  0.00 },
    { dx:  0.07, dy:  0.00, ang:  0.00 }
  ],
  [
    { dx: -0.05, dy: -0.05, ang: -2.4 },
    { dx:  0.05, dy: -0.05, ang: -0.7 },
    { dx:  0.05, dy:  0.05, ang:  0.7 },
    { dx: -0.05, dy:  0.05, ang:  2.4 },
    { dx: -0.02, dy: -0.02, ang: -2.4 },
    { dx:  0.02, dy: -0.02, ang: -0.7 },
    { dx:  0.02, dy:  0.02, ang:  0.7 },
    { dx: -0.02, dy:  0.02, ang:  2.4 }
  ],
  [
    { dx: -0.06, dy:  0.00, ang:  Math.PI },
    { dx: -0.02, dy:  0.00, ang:  Math.PI },
    { dx:  0.02, dy:  0.00, ang:  0.00 },
    { dx:  0.06, dy:  0.00, ang:  0.00 },
    { dx:  0.00, dy: -0.06, ang: -Math.PI / 2 },
    { dx:  0.00, dy: -0.02, ang: -Math.PI / 2 },
    { dx:  0.00, dy:  0.02, ang:  Math.PI / 2 },
    { dx:  0.00, dy:  0.06, ang:  Math.PI / 2 }
  ],
  [
    { dx:  0.00, dy: -0.06, ang: -Math.PI / 2 },
    { dx:  0.05, dy: -0.02, ang: -0.3 },
    { dx:  0.07, dy:  0.03, ang:  0.4 },
    { dx:  0.03, dy:  0.07, ang:  1.2 },
    { dx: -0.02, dy:  0.05, ang:  2.2 },
    { dx: -0.07, dy:  0.02, ang:  2.9 },
    { dx: -0.05, dy: -0.03, ang: -2.8 },
    { dx: -0.02, dy: -0.07, ang: -1.8 }
  ],
  [
    { dx: -0.03, dy: -0.07, ang: -2.0 },
    { dx:  0.03, dy: -0.07, ang: -1.1 },
    { dx:  0.07, dy: -0.03, ang: -0.3 },
    { dx:  0.07, dy:  0.03, ang:  0.3 },
    { dx:  0.03, dy:  0.07, ang:  1.1 },
    { dx: -0.03, dy:  0.07, ang:  2.0 },
    { dx: -0.07, dy:  0.03, ang:  2.8 },
    { dx: -0.07, dy: -0.03, ang: -2.8 }
  ]
];

const PATTERN_MEASURE_LEN = 8;
const PATTERN_BLEND_STEPS = 2;
let measureStep = 0;

let patternPrevId = Math.floor(Math.random() * SPAWN_PATTERNS.length);
let patternNextId = Math.floor(Math.random() * SPAWN_PATTERNS.length);

function lerp(a, b, t) { return a + (b - a) * t; }
function clamp01(v) { return Math.max(0, Math.min(1, v)); }
function smoothstep(t) { return t * t * (3 - 2 * t); }

function lerpAngle(a, b, t) {
  let d = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
  return a + d * t;
}

function nextPatternEntry() {
  // Start of measure: roll pattern
  if (measureStep === 0) {
    patternPrevId = patternNextId;
    patternNextId = Math.floor(Math.random() * SPAWN_PATTERNS.length);
  }

  const a = SPAWN_PATTERNS[patternPrevId][measureStep];
  const b = SPAWN_PATTERNS[patternNextId][measureStep];
  const blend = measureStep >= PATTERN_BLEND_STEPS ? 1 : (measureStep / PATTERN_BLEND_STEPS);

  const entry = {
    dx: lerp(a.dx, b.dx, blend),
    dy: lerp(a.dy, b.dy, blend),
    ang: lerpAngle(a.ang, b.ang, blend)
  };

  measureStep = (measureStep + 1) % PATTERN_MEASURE_LEN;
  return entry;
}

////////////////////////////////////////////////////////////
// MOVING TARGET CLUSTER (receptors move across the screen)
////////////////////////////////////////////////////////////

// The cluster is a center point. Each lane is a fixed offset around that center.
function getLaneOffsetsPx() {
  const minDim = Math.min(width, height);
  const spread = minDim * 0.115 * UI_SCALE;
  return [
    { ox: 0,      oy: -spread }, // W
    { ox: -spread, oy: 0 },      // A
    { ox: 0,      oy: spread },  // S
    { ox: spread, oy: 0 }        // D
  ];
}

// A timeline of "where the cluster should be" per beat.
// We fill this as we spawn notes ahead of time.
const centerMoves = []; // {t, x, y, ang}
function resetCenterMoves() {
  centerMoves.length = 0;
}

// Default cluster position: slightly above center (requested)
function defaultCenter() {
  return { x: width * 0.5, y: height * 0.44, ang: -Math.PI / 2 };
}

function scheduleCenterMove(bt) {
  const minDim = Math.min(width, height);
  const entry = nextPatternEntry();

  // Position is snapped (no drifting), but patterns mix every measure.
  const cx = width * 0.5 + entry.dx * minDim;
  const cy = height * 0.44 + entry.dy * minDim;

  centerMoves.push({ t: bt, x: cx, y: cy, ang: entry.ang });

  // Keep list from growing forever (drop very old items)
  const cutoff = bt - 20;
  while (centerMoves.length && centerMoves[0].t < cutoff) centerMoves.shift();
}

// Smoothly interpolate between the last and next scheduled center points.
function getCenterAt(t) {
  if (!centerMoves.length) return defaultCenter();

  // Find the last move <= t
  let i = 0;
  while (i + 1 < centerMoves.length && centerMoves[i + 1].t <= t) i++;

  const a = centerMoves[i];
  const b = centerMoves[Math.min(i + 1, centerMoves.length - 1)];

  if (a === b) return { x: a.x, y: a.y, ang: a.ang };

  // Interp across one beat interval (or time delta between scheduled points)
  const span = Math.max(0.0001, b.t - a.t);
  const u = clamp01((t - a.t) / span);
  const e = smoothstep(u);

  return {
    x: lerp(a.x, b.x, e),
    y: lerp(a.y, b.y, e),
    ang: lerpAngle(a.ang, b.ang, e)
  };
}

////////////////////////////////////////////////////////////
// NOTES + PARTICLES
////////////////////////////////////////////////////////////
let notes = [];
let noteSeq = 0;

let particles = [];
let score = 0;
let combo = 0;

// Judgement stack (max 5 entries, 3.5s lifetime)
const judgeStack = []; // {t, label, lane, combo}
const JUDGE_STACK_MAX = 5;
const JUDGE_STACK_LIFE = 3.5;

function pushJudge(label, lane) {
  judgeStack.unshift({ t: getSongTime(), label, lane, combo });
  if (judgeStack.length > JUDGE_STACK_MAX) judgeStack.length = JUDGE_STACK_MAX;
}

function addParticles(x, y, color, count = 18) {
  for (let i = 0; i < count; i++) {
    particles.push({
      x, y,
      vx: (Math.random() - 0.5) * 520,
      vy: (Math.random() - 0.5) * 520,
      life: 0.55,
      color
    });
  }
}

function aliveCountInLane(lane) {
  let c = 0;
  for (const n of notes) if (!n.judged && n.lane === lane) c++;
  return c;
}

////////////////////////////////////////////////////////////
// NOTE SPAWN
////////////////////////////////////////////////////////////
function createNote(lane, time) {
  const approach = APPROACH_TIME;
  const spawnTime = time - approach;

  // Target = moving cluster center + fixed lane offset
  const offsets = getLaneOffsetsPx();
  const center = getCenterAt(time);
  const tx = center.x + offsets[lane].ox;
  const ty = center.y + offsets[lane].oy;

  // Spawn from outside the screen, along "ang"
  const spawnDist = Math.max(width, height) * 0.70;
  const nx = Math.cos(center.ang);
  const ny = Math.sin(center.ang);

  const sx = tx - nx * spawnDist;
  const sy = ty - ny * spawnDist;

  notes.push({
    seq: noteSeq++,
    lane,
    time,
    approach,
    spawnTime,
    spawnX: sx,
    spawnY: sy,
    targetX: tx,
    targetY: ty,
    ang: center.ang,
    judged: false,
    effect: "none",
    effectTime: 0,
    rotSeed: (Math.random() * Math.PI * 2)
  });
}

function generateNotes(t) {
  if (!autoChartReady) return;

  const maxAlive = MAX_ALIVE_BY_DIFF[DIFF] ?? 8;

  let active = 0;
  for (const n of notes) if (!n.judged) active++;

  while (nextBeatIndex < beatTimes.length && beatTimes[nextBeatIndex] < t + SPAWN_LOOKAHEAD) {
    if (active >= maxAlive) break;

    const bt = beatTimes[nextBeatIndex];

    // avoid spamming nearly-equal beatTimes
    if (bt - lastSpawnedBeatTime < getMinNoteGap()) {
      nextBeatIndex++;
      continue;
    }

    // One note per beat: schedule the cluster position for that beat.
    scheduleCenterMove(bt);

    // Choose lane, respecting per-lane cap
    const lane = Math.floor(Math.random() * LANES.length);
    const maxPerLane = MAX_ALIVE_PER_LANE_BY_DIFF[DIFF] ?? 1;

    if (aliveCountInLane(lane) >= maxPerLane) {
      // Still advance (we don't want timing to stall).
      nextBeatIndex++;
      lastSpawnedBeatTime = bt;
      continue;
    }

    createNote(lane, bt);

    // Strong "spawn pop" at the target position
    const offsets = getLaneOffsetsPx();
    const center = getCenterAt(bt);
    addParticles(center.x + offsets[lane].ox, center.y + offsets[lane].oy, LANES[lane].color, 26);

    nextBeatIndex++;
    lastSpawnedBeatTime = bt;
    active++;
  }
}

////////////////////////////////////////////////////////////
// INPUT + LANE PICKING
////////////////////////////////////////////////////////////
const keysDown = new Set();
window.addEventListener("keydown", (e) => {
  const k = e.key.toLowerCase();
  if (!keysDown.has(k)) {
    keysDown.add(k);
    handleKey(k);
  }
});
window.addEventListener("keyup", (e) => keysDown.delete(e.key.toLowerCase()));

function findEarliestLaneNote(lane) {
  let best = null;
  for (const n of notes) {
    if (n.judged) continue;
    if (n.lane !== lane) continue;
    if (!best) best = n;
    else if (n.time < best.time) best = n;
    else if (n.time === best.time && (n.seq ?? 0) < (best.seq ?? 0)) best = n;
  }
  return best;
}

function laneIsHittable(note, t) {
  if (!note) return false;
  const w = getHitWindows();
  if (t < note.time - w.sad) return false;
  if (t > note.time + w.miss) return false;
  return true;
}

function handleKey(key) {
  const lane = LANES.findIndex((l) => l.key === key);
  if (lane === -1) return;

  const t = getSongTime();
  const earliest = findEarliestLaneNote(lane);
  if (!laneIsHittable(earliest, t)) return;

  judge(earliest, t);
}

canvas.addEventListener("mousedown", (e) => {
  const r = canvas.getBoundingClientRect();
  hitAt(e.clientX - r.left, e.clientY - r.top);
});
canvas.addEventListener("touchstart", (e) => {
  const r = canvas.getBoundingClientRect();
  const t0 = e.touches[0];
  hitAt(t0.clientX - r.left, t0.clientY - r.top);
  e.preventDefault();
}, { passive: false });

function hitAt(x, y) {
  const t = getSongTime();
  const r = Math.min(width, height) * (isMobile ? 0.095 : 0.045) * UI_SCALE;

  let best = null;
  let bestDist = Infinity;

  for (const n of notes) {
    if (n.judged) continue;
    if (t < n.spawnTime) continue;

    const w = getHitWindows();
    if (t > n.time + w.miss) continue;

    const prog = clamp01((t - n.spawnTime) / n.approach);
    const eprog = smoothstep(prog);
    const nx = lerp(n.spawnX, n.targetX, eprog);
    const ny = lerp(n.spawnY, n.targetY, eprog);

    const d = Math.hypot(x - nx, y - ny);
    if (d < bestDist) { bestDist = d; best = n; }
  }

  if (!best) return;
  if (bestDist > r * 1.5) return;
  if (!laneIsHittable(best, t)) return;

  judge(best, t);
}

////////////////////////////////////////////////////////////
// JUDGEMENT
////////////////////////////////////////////////////////////
function judge(n, t) {
  const d = Math.abs(n.time - t);
  const w = getHitWindows();

  if (d <= w.perfect) return registerHit(n, "PERFECT", 500);
  if (d <= w.good)    return registerHit(n, "COOL",    300);
  if (d <= w.safe)    return registerHit(n, "FINE",    150);
  if (d <= w.sad)     return registerHit(n, "SAD",      50);
  return registerMiss(n);
}

function registerHit(n, label, baseScore) {
  n.judged = true;
  n.effect = "hit";
  n.effectTime = getSongTime();

  combo++;
  score += Math.floor(baseScore * (1 + combo * 0.03));

  pushJudge(label, n.lane);

  // Big lightshow hit burst
  addParticles(n.targetX, n.targetY, LANES[n.lane].color, 42);
  lanePulse[n.lane] = Math.min(1.8, lanePulse[n.lane] + 1.0);
  laneGlow[n.lane] = Math.min(1.2, laneGlow[n.lane] + 0.9);
}

function registerMiss(n) {
  n.judged = true;
  n.effect = "miss";
  n.effectTime = getSongTime();

  combo = 0;
  pushJudge("MISS", n.lane);

  laneGlow[n.lane] = Math.min(1.2, laneGlow[n.lane] + 0.4);
}

////////////////////////////////////////////////////////////
// RENDER HELPERS
////////////////////////////////////////////////////////////
let beatPulse = 0;
let lastFrame = performance.now();
let fps = 0;

// "lightshow" state per lane
const lanePulse = new Array(LANES.length).fill(0);
const laneGlow  = new Array(LANES.length).fill(0);

function decayLaneFX() {
  for (let i = 0; i < LANES.length; i++) {
    lanePulse[i] = Math.max(0, lanePulse[i] - 0.085);
    laneGlow[i]  = Math.max(0, laneGlow[i] - 0.050);
  }
}

function drawSprite(lane, x, y, size, rot, glowAmt, tintAmt) {
  const base = getWhiteSprite(lane);
  const tint = getTintSprite(lane);

  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);

  // Glow layer (tinted, bigger)
  if (tint && glowAmt > 0) {
    ctx.globalAlpha = 0.20 * glowAmt;
    const g = size * (1.25 + glowAmt * 0.35);
    ctx.drawImage(tint, -g / 2, -g / 2, g, g);
  }

  // Base white sprite (less "washed out")
  if (base) {
    ctx.globalAlpha = 0.92;
    ctx.drawImage(base, -size / 2, -size / 2, size, size);

    // Tint overlay (so it reads as blue, not just white)
    if (tint) {
      ctx.globalCompositeOperation = "source-atop";
      ctx.globalAlpha = tintAmt;
      ctx.drawImage(tint, -size / 2, -size / 2, size, size);
    }
  } else {
    // Fallback: letter (consistent sizing)
    ctx.globalAlpha = 0.95;
    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `${Math.floor(size * 0.70)}px Arial Black`;
    ctx.fillText(LANES[lane].label, 0, 0);
  }

  ctx.restore();
}

////////////////////////////////////////////////////////////
// RENDER
////////////////////////////////////////////////////////////
function renderFrame(t) {
  decayLaneFX();

  ctx.clearRect(0, 0, width, height);

  const bp = (t % BEAT) / BEAT;
  beatPulse = 0.5 + 0.5 * Math.sin(bp * Math.PI * 2);

  // Background: darker base + reactive vignette
  const bgA = 0.24 + beatPulse * 0.10;
  ctx.fillStyle = `rgba(0,0,0,${bgA})`;
  ctx.fillRect(0, 0, width, height);

  // Receptors (target circles) – cluster moves smoothly
  const minDim = Math.min(width, height);
  const r = minDim * (isMobile ? 0.095 : 0.045) * UI_SCALE;

  const center = getCenterAt(t);
  const offsets = getLaneOffsetsPx();

  for (let i = 0; i < LANES.length; i++) {
    const tx = center.x + offsets[i].ox;
    const ty = center.y + offsets[i].oy;

    const pulse = lanePulse[i];
    const glow = laneGlow[i];

    ctx.save();
    ctx.translate(tx, ty);

    ctx.shadowColor = LANES[i].color;
    ctx.shadowBlur = 18 + glow * 44 + beatPulse * 22;

    // Base ring (white)
    ctx.globalAlpha = 0.45 + beatPulse * 0.22;
    ctx.strokeStyle = "rgba(255,255,255,0.9)";
    ctx.lineWidth = 2.2 + beatPulse * 2.2 + pulse * 1.8;
    ctx.beginPath();
    ctx.arc(0, 0, r * (1.12 + pulse * 0.10), 0, Math.PI * 2);
    ctx.stroke();

    // Color ring (blue)
    ctx.globalAlpha = 0.30 + glow * 0.45;
    ctx.strokeStyle = LANES[i].color;
    ctx.lineWidth = 2.0 + pulse * 4.0;
    ctx.setLineDash([10, 7]);
    ctx.lineDashOffset = -performance.now() * 0.05;
    ctx.beginPath();
    ctx.arc(0, 0, r * (1.38 + beatPulse * 0.20 + pulse * 0.22), 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);

    // Small flash dot
    if (pulse > 0.01) {
      ctx.globalAlpha = Math.min(1, pulse * 0.9);
      ctx.fillStyle = LANES[i].color;
      ctx.beginPath();
      ctx.arc(0, 0, r * (0.12 + pulse * 0.10), 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }

  // Notes
  const SPIN_TURNS = 0.75; // requested: spinning
  for (const n of notes) {
    if (n.judged) continue;
    if (t < n.spawnTime) continue;

    const prog = clamp01((t - n.spawnTime) / n.approach);
    const eprog = smoothstep(prog);

    const x = lerp(n.spawnX, n.targetX, eprog);
    const y = lerp(n.spawnY, n.targetY, eprog);

    // Strong approach pulse
    const approachScale = 1.35 - 0.35 * eprog;
    const glowAmt = 0.9 + beatPulse * 0.9 + laneGlow[n.lane] * 0.7;
    const tintAmt = 0.45 + beatPulse * 0.30; // reduce "too white"

    // Spin: faster early, slows near hit
    const spin = (1 - eprog) * (SPIN_TURNS * Math.PI * 2) + n.rotSeed;

    drawSprite(n.lane, x, y, r * 2.25 * approachScale, spin, glowAmt, tintAmt);

    // Approach ring (extra readability + flash)
    ctx.save();
    ctx.globalAlpha = 0.14 + beatPulse * 0.08;
    ctx.strokeStyle = LANES[n.lane].color;
    ctx.lineWidth = 2.0 + beatPulse * 2.0;
    ctx.beginPath();
    ctx.arc(n.targetX, n.targetY, r * (2.10 - eprog * 0.85), 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  // Hit/miss effects (fade sprites)
  for (const n of notes) {
    if (!n.judged) continue;
    const age = t - n.effectTime;
    if (n.effect === "hit" && age <= HIT_FADE_TIME) {
      const p = age / HIT_FADE_TIME;
      const size = r * 2.8 * (1 + p * 0.9);
      drawSprite(n.lane, n.targetX, n.targetY, size, 0, 1.2, 0.55);
    } else if (n.effect === "miss" && age <= MISS_FADE_TIME) {
      const p = age / MISS_FADE_TIME;
      const size = r * 2.2 * (1 - p * 0.10);
      drawSprite(n.lane, n.targetX, n.targetY + p * (r * 2.4), size, 0, 0.6, 0.25);
    }
  }

  // Particles
  for (const p of particles) {
    p.life -= 1 / 60;
    p.x += p.vx / 60;
    p.y += p.vy / 60;

    ctx.globalAlpha = Math.max(0, p.life / 0.55) * (0.45 + 0.55 * beatPulse);
    ctx.fillStyle = p.color;
    ctx.fillRect(p.x, p.y, 3.2, 3.2);
  }
  particles = particles.filter((p) => p.life > 0);
  ctx.globalAlpha = 1;

  // HUD (scaled down)
  ctx.save();
  ctx.globalAlpha = 0.92;
  ctx.fillStyle = "#fff";
  ctx.textAlign = "left";
  ctx.font = `${Math.floor(18 * UI_SCALE)}px Arial`;
  ctx.fillText("Project Baguette", 20, 28);
  ctx.fillText("Score: " + score, 20, 28 + 24 * UI_SCALE);
  ctx.fillText("Combo: " + combo, 20, 28 + 48 * UI_SCALE);
  ctx.restore();

  // Judgement stack (slightly above center)
  const stackX = width * 0.5;
  const stackY = height * 0.23;
  const fontPx = Math.floor((26 + 6 * beatPulse) * UI_SCALE);

  // Best-effort pixel font; if it's loaded in CSS, it'll be used.
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `${fontPx}px "Pixel Game Font Family", ui-monospace, monospace`;

  for (let i = 0; i < judgeStack.length; i++) {
    const j = judgeStack[i];
    const age = t - j.t;
    if (age > JUDGE_STACK_LIFE) continue;

    const p = age / JUDGE_STACK_LIFE;
    const a = 1 - p;
    const y = stackY + i * (fontPx * 0.85);

    ctx.save();
    ctx.globalAlpha = 0.95 * a;
    ctx.shadowColor = LANES[j.lane]?.color || "#2a7bff";
    ctx.shadowBlur = 14 + beatPulse * 10;

    const text = `${j.label}  x${j.combo}`;
    ctx.fillStyle = "#ffffff";
    ctx.fillText(text, stackX, y);
    ctx.restore();
  }
  // cleanup old entries
  while (judgeStack.length && (t - judgeStack[judgeStack.length - 1].t) > JUDGE_STACK_LIFE) {
    judgeStack.pop();
  }

  if (DEBUG) {
    ctx.save();
    ctx.globalAlpha = 1;
    ctx.fillStyle = "rgba(255,0,0,0.85)";
    ctx.fillRect(16, 16, 260, 100);
    ctx.fillStyle = "white";
    ctx.font = "14px ui-monospace, SFMono-Regular, Menlo, monospace";
    ctx.fillText("canvas OK", 28, 44);
    ctx.fillText("t=" + t.toFixed(3), 28, 64);
    const active = notes.filter((n) => !n.judged).length;
    ctx.fillText("activeNotes=" + active, 28, 84);
    ctx.restore();
  }
}

////////////////////////////////////////////////////////////
// MAIN LOOP
////////////////////////////////////////////////////////////
function loop() {
  const now = performance.now();
  fps = 1000 / (now - lastFrame);
  lastFrame = now;

  const t = getSongTime();

  generateNotes(t);
  renderFrame(t);

  // Miss cleanup
  const w = getHitWindows();
  for (const n of notes) {
    if (!n.judged && t > n.time + w.miss) {
      n.judged = true;
      n.effect = "miss";
      n.effectTime = t;
      combo = 0;
      pushJudge("MISS", n.lane);
    }
  }

  // Remove old judged notes
  notes = notes.filter((n) => {
    if (!n.judged) return true;
    const age = t - n.effectTime;
    if (n.effect === "hit") return age <= HIT_FADE_TIME;
    if (n.effect === "miss") return age <= MISS_FADE_TIME;
    return false;
  });

  requestAnimationFrame(loop);
}

////////////////////////////////////////////////////////////
// START FLOW
////////////////////////////////////////////////////////////
async function startGame() {
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!audioCtx) audioCtx = new AC();
  if (audioCtx.state === "suspended") {
    try { await audioCtx.resume(); } catch (e) {}
  }

  applyDifficulty();

  await prepareAutoChart();
  nextBeatIndex = 0;
  lastSpawnedBeatTime = -Infinity;
  resetCenterMoves();

  // seed an initial center move so receptors aren't "undefined" at t=0
  scheduleCenterMove(0);

  try { audio.currentTime = 0; } catch (e) {}
  await audio.play();

  if (mv) {
    const startMV = () => {
      mv.style.display = "block";
      requestAnimationFrame(() => { mv.style.opacity = "1"; });
      try {
        mv.currentTime = 0;
        const p = mv.play();
        if (p && p.catch) p.catch(() => {});
      } catch (e) {}
    };
    if (mv.readyState >= 2) startMV();
    else mv.addEventListener("loadeddata", startMV, { once: true });
  }

  requestAnimationFrame(loop);
}

////////////////////////////////////////////////////////////
// MENU API
////////////////////////////////////////////////////////////
window.PBEngine = {
  start: startGame,

  setSong: (audioSrc, mvSrc) => {
    if (audioSrc) audio.src = audioSrc;
    if (mv && mvSrc) mv.src = mvSrc;

    beatTimes = [];
    autoChartReady = false;
    nextBeatIndex = 0;
    lastSpawnedBeatTime = -Infinity;
    resetCenterMoves();

    notes = [];
    noteSeq = 0;
    particles = [];
    score = 0;
    combo = 0;
    judgeStack.length = 0;

    if (mv) {
      mv.style.opacity = "0";
      mv.style.display = "none";
    }
  },

  setDifficulty: (name) => {
    DIFF = name || "Normal";
    applyDifficulty();
  },

  setBpm: (v) => setBpm(v),

  getState: () => ({ score, combo })
};

if (!window.__PB_MENU_MODE__) {
  startOverlay.addEventListener("click", async () => {
    startOverlay.style.transition = "opacity 0.4s ease";
    startOverlay.style.opacity = "0";
    setTimeout(() => startOverlay.remove(), 450);

    try {
      await startGame();
    } catch (e) {
      alert("Tap again — browser blocked audio.");
      document.body.appendChild(startOverlay);
      startOverlay.style.opacity = "1";
    }
  });
} else {
  startOverlay.remove();
}
