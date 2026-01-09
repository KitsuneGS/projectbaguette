// shut yo bitch ass up clanker
////////////////////////////////////////////////////////////
// QUERY DEBUG FLAG
////////////////////////////////////////////////////////////
const DEBUG = new URLSearchParams(location.search).get("debug") === "1";


////////////////////////////////////////////////////////////
// ELEMENTS + CANVAS SETUP
////////////////////////////////////////////////////////////
const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

const mv = document.getElementById("mv");
const audio = document.getElementById("song");

// iOS-safe hide MV until playback confirmed
mv.style.opacity = "0";
mv.style.display = "none";
mv.style.transition = "opacity 1s ease";

let width = window.innerWidth;
let height = window.innerHeight;
let dpr = window.devicePixelRatio || 1;

// Make canvas resolution match the screen (prevents "drawing off-screen" / invisible notes)
function fitCanvasToScreen() {
  dpr = window.devicePixelRatio || 1;
  width = window.innerWidth;
  height = window.innerHeight;

  canvas.width = Math.floor(width * dpr);
  canvas.height = Math.floor(height * dpr);

  // Keep CSS size in CSS pixels
  canvas.style.width = "100%";
  canvas.style.height = "100%";

  // Draw using CSS pixels (so all your math can stay in width/height)
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

window.addEventListener("resize", fitCanvasToScreen);
fitCanvasToScreen();

// iOS: prevent scrolling/gesture interference on the game canvas
canvas.style.touchAction = "none";

const isMobile = /iPhone|iPad|Android/i.test(navigator.userAgent);
// 50% bigger circles on mobile (0.067 * 1.5 ≈ 0.10)
const UI_SCALE = 0.85; // shrink UI ~15%
const BASE_R_SCALE = (isMobile ? 0.10 : 0.045) * UI_SCALE;



////////////////////////////////////////////////////////////
// CREATE A SINGLE TAP-TO-START OVERLAY
////////////////////////////////////////////////////////////
const startOverlay = document.createElement("div");
startOverlay.style.cssText = `
  position:fixed;
  top:0; left:0;
  width:100vw; height:100vh;
  background:black;
  display:flex;
  flex-direction:column;
  align-items:center;
  justify-content:center;
  color:white;
  font-family:Arial Black, sans-serif;
  font-size:27px;
  z-index:99999;
`;
startOverlay.innerHTML = `
  <div style="opacity:0.9">PROJECT BAGUETTE</div>
  <div id="tapText" style="margin-top:20px; font-size:17px; opacity:0.7;">Tap to Start</div>
`;
if (!window.__PB_MENU_MODE__) {
  document.body.appendChild(startOverlay);
}


// Blink effect
let blink = true;
setInterval(() => {
  blink = !blink;
  const el = document.getElementById("tapText");
  if (el) el.style.opacity = blink ? "0.9" : "0.4";
}, 600);


////////////////////////////////////////////////////////////
// GAME CONSTANTS
////////////////////////////////////////////////////////////
let BPM = 120;
let BEAT = 60 / BPM;

let DIFF = "Normal";
const APPROACH_BY_DIFF = { Easy: 3.2, Normal: 2.8, Hard: 2.4, Extreme: 2.0 };
const MAX_ALIVE_PER_LANE_BY_DIFF = {
  Easy: 1,
  Normal: 1,
  Hard: 2,
  Extreme: 3
};

let APPROACH_TIME = APPROACH_BY_DIFF[DIFF] ?? 2.8;
// Smooth global approach for pacing (notes themselves store their own approach when spawned)
let smoothedApproach = APPROACH_TIME;

function setBpm(v) {
  BPM = Number(v) || 120;
  BEAT = 60 / BPM;
}
function applyDifficulty() {
  APPROACH_TIME = APPROACH_BY_DIFF[DIFF] ?? 2.8;
  smoothedApproach = APPROACH_TIME;
}

const MAX_ALIVE_BY_DIFF = { Easy: 4, Normal: 6, Hard: 8, Extreme: 10 };

// Timing windows in seconds (bigger = more forgiving).
const HIT_WINDOWS_BY_DIFF = {
  Easy:    { perfect: 0.11, good: 0.25, miss: 0.45 },
  Normal:  { perfect: 0.08, good: 0.18, miss: 0.35 },
  Hard:    { perfect: 0.065, good: 0.15, miss: 0.30 },
  Extreme: { perfect: 0.055, good: 0.13, miss: 0.27 }
};
function getHitWindows() {
  return HIT_WINDOWS_BY_DIFF[DIFF] || HIT_WINDOWS_BY_DIFF.Normal;
}

// Auto-chart spacing (seconds) per difficulty.
const MIN_NOTE_GAP_BY_DIFF = { Easy: 0.28, Normal: 0.22, Hard: 0.18, Extreme: 0.14 };
function getMinNoteGap() {
  return MIN_NOTE_GAP_BY_DIFF[DIFF] ?? 0.22;
}

const SPAWN_LOOKAHEAD = 8.0;

// Spawn patterns: each pattern is a short repeating "lane sequence" plus fixed offsets.
// Offsets are in fractions of the shorter screen dimension (min(width,height)).
// This avoids nausea (no continuous drifting) but keeps variety.
const SPAWN_PATTERNS = [
  // 10 snap-to patterns. Each pattern is exactly 8 steps (1 "measure" = 8 notes).
  // Positions are normalized offsets from center. Keep them small so reading stays easy.
  // ang controls the direction notes fly in from (radians).
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

// Pattern selection:
// - We always spawn 8 notes per "measure" (8 beats).
// - A new random pattern is chosen each measure.
// - The first couple steps of a new measure blend from the previous pattern into the new one,
//   so it feels like a transition instead of a hard snap.
let measureStep = 0; // 0..7
let patternPrevId = Math.floor(Math.random() * SPAWN_PATTERNS.length);
let patternNextId = Math.floor(Math.random() * SPAWN_PATTERNS.length);
const PATTERN_MEASURE_LEN = 8;
const PATTERN_BLEND_STEPS = 2;

function lerpAngle(a, b, t) {
  // Lerp on the shortest arc so angles don't "spin the long way".
  let d = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
  return a + d * t;
}

function nextPatternEntry() {
  // If we're at the start of a measure, pick a new pattern for the next 8 notes.
  if (measureStep === 0) {
    patternPrevId = patternNextId;
    patternNextId = Math.floor(Math.random() * SPAWN_PATTERNS.length);
  }

  const a = SPAWN_PATTERNS[patternPrevId][measureStep];
  const b = SPAWN_PATTERNS[patternNextId][measureStep];

  // Blend only for the first few steps of the measure.
  const blend = measureStep >= PATTERN_BLEND_STEPS ? 1 : (measureStep / PATTERN_BLEND_STEPS);

  const entry = {
    dx: lerp(a.dx, b.dx, blend),
    dy: lerp(a.dy, b.dy, blend),
    ang: lerpAngle(a.ang, b.ang, blend)
  };

  measureStep = (measureStep + 1) % PATTERN_MEASURE_LEN;
  return entry;
}

let spawnFlashTime = -999;
let spawnFlashLane = 0;

function triggerSpawnFlash(lane) {
  spawnFlashTime = getSongTime();
  spawnFlashLane = lane;
  const tx = LANES[lane].x * width;
  const ty = LANES[lane].y * height;
  addParticles(tx, ty, LANES[lane].color);
  LANES[lane].pulse = Math.max(LANES[lane].pulse || 0, 1);
}


// Turn off receptor/target markers for a cleaner PDiva-ish look.
const SHOW_RECEPTORS = true; // show target markers (receptors)
const MISS_EXTRA = 0.20;

const HIT_FADE_TIME = 0.4;
const MISS_FADE_TIME = 0.6;
const MISS_FALL_SPEED = 220;
const MISS_SHAKE_AMT = 10;
const MISS_SHAKE_FREQ = 14;

let beatPulse = 1;

let audioCtx = null;
let analyser = null;
let mediaSrc = null;
let beatTimes = [];
let autoChartReady = false;
let nextBeatIndex = 0;
let lastSpawnedBeatTime = -Infinity; // last note time we spawned (for spacing)
////////////////////////////////////////////////////////////
// INPUT MAPPING
////////////////////////////////////////////////////////////
const LANES = [
  { key: "w", label: "W", color: "#FFD447", icon: "assets/sprites/triangle.png", x: 0.50, y: 0.35 },
  { key: "a", label: "A", color: "#47FFA3", icon: "assets/sprites/square.png",   x: 0.38, y: 0.50 },
  { key: "s", label: "S", color: "#FF69B4", icon: "assets/sprites/x.png",        x: 0.50, y: 0.65 },
  { key: "d", label: "D", color: "#6AB4FF", icon: "assets/sprites/circle.png",   x: 0.62, y: 0.50 }
];

////////////////////////////////////////////////////////////
// NOTE ICONS (SPRITES)
////////////////////////////////////////////////////////////
// If you add images at these paths, notes will render using them.
// If an image is missing, the game falls back to drawing a circle + letter.
const laneIcons = LANES.map((l) => {
  const img = new Image();
  img.src = l.icon;
  return img;
});

// Sprite render helpers
// We cache two versions per lane:
//  - "white": the sprite turned into a white silhouette (keeps alpha, removes original color)
//  - "tint": the sprite filled with the lane color (used for glow/overlay)
const NOTE_TINT_COLOR = "#4AA3FF"; // blue tint for all note sprites
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
  if (!spriteCacheTint[lane]) spriteCacheTint[lane] = makeTintCanvas(img, NOTE_TINT_COLOR);
  return spriteCacheTint[lane];
}




////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////
// SONG TIME (audio clock)
////////////////////////////////////////////////////////////
function getSongTime() {
  if (audio && !isNaN(audio.currentTime)) return audio.currentTime;
  return 0;
}


////////////////////////////////////////////////////////////
// AUTO-CHART ENGINE (MP3 SAFE)
////////////////////////////////////////////////////////////
async function prepareAutoChart() {
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!audioCtx) audioCtx = new AC();
  // Create & wire the audio graph ONCE (browsers forbid multiple MediaElementSources for one <audio>)
  if (!analyser) {
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 2048;
  }
  if (!mediaSrc) {
    mediaSrc = audioCtx.createMediaElementSource(audio);
    mediaSrc.connect(analyser);
    analyser.connect(audioCtx.destination);
  }
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

    let mean = energies.reduce((a, b) => a + b, 0) / energies.length;
    let threshold = mean * 1.25;
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

    if (beatTimes.length < 4) {
      console.warn("Sparse auto-chart → fallback");
      for (let t = 0; t < dec.duration; t += 0.5) beatTimes.push(t);
    }

    beatTimes.sort((a,b) => a - b);
    autoChartReady = true;
    console.log("AUTOGEN DONE:", beatTimes.length, "beats");
  } catch (e) {
    console.error("Auto-chart decode fail:", e);
    for (let t = 0; t < 120; t += 0.5) beatTimes.push(t);
    autoChartReady = true;
    console.log("AUTOGEN FALLBACK:", beatTimes.length, "beats");
  }
}


////////////////////////////////////////////////////////////
// NOTE + PARTICLES
////////////////////////////////////////////////////////////
let notes = [];
let noteSeq = 0;
let particles = [];
let score = 0;
let combo = 0;
let lastHitText = "";
let lastHitTime = 0;

// Arcade-style judgement stack (newest first).
const JUDGE_STACK_MAX = 5;
const JUDGE_STACK_LIFE = 3.5; // seconds on screen before it fades out
let judgeStack = [];

function pushJudge(label, lane, comboValue, t) {
  judgeStack.unshift({
    label,
    lane,
    combo: comboValue,
    t
  });
  if (judgeStack.length > JUDGE_STACK_MAX) judgeStack.length = JUDGE_STACK_MAX;

  // Keep legacy single-line vars in sync (used by a few HUD bits).
  lastHitText = label;
  lastHitTime = t;
}

function addParticles(x, y, color) {
  for (let i = 0; i < 14; i++) {
    particles.push({
      x, y,
      vx: (Math.random() - 0.5) * 240,
      vy: (Math.random() - 0.5) * 240,
      life: 0.4,
      color
    });
  }
}


////////////////////////////////////////////////////////////
// NOTE GENERATION
////////////////////////////////////////////////////////////
function lerp(a, b, t) { return a + (b - a) * t; }

function aliveCountInLane(lane) {
  let c = 0;
  for (const n of notes) {
    if (!n.judged && n.lane === lane) c++;
  }
  return c;
}


// Deterministic tiny random: given the same seed, you get the same "random" number.
// We use this so note jitter is stable (refreshing the page won't reshuffle note positions).
function mulberry32(seed) {
  let t = seed >>> 0;
  return function () {
    t += 0x6D2B79F5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

// Notes aim toward a lane "anchor" point, with a small jitter so it feels less rigid.
// Anchor is decided by lane; jitter is decided by note seq (so it's stable).
function laneTargetWithJitter(lane, seq) {
  // "Lane home" position with a tiny stable jitter.
  // We keep this for fallback, but the main gameplay uses snap-to patterns now.
  const minDim = Math.min(width, height);
  const jitterPx = minDim * 0.008; // tiny (keeps it from feeling nauseating)

  const rng = mulberry32((seq + 1) * 1337 + lane * 97);
  const jx = (rng() - 0.5) * 2 * jitterPx;
  const jy = (rng() - 0.5) * 2 * jitterPx;

  const ax = LANES[lane].x * width;
  const ay = LANES[lane].y * height;

  const marginX = width * 0.18;
  const marginY = height * 0.18;

  const tx = Math.max(marginX, Math.min(width - marginX, ax + jx));
  const ty = Math.max(marginY, Math.min(height - marginY, ay + jy));
  return { tx, ty };
}
function createNote(lane, time, patternEntry) {
  // Each note stores its own approach time at spawn.
  const approach = APPROACH_TIME;
  const spawnTime = time - approach;

  // Snap-to pattern target (same positions for all lanes).
  // patternEntry is normalized offsets from center.
  let tx, ty, ang;

  if (patternEntry) {
    const minDim = Math.min(width, height);
    const centerX = width / 2;
    const centerY = height / 2;

    tx = centerX + patternEntry.dx * minDim;
    ty = centerY + patternEntry.dy * minDim;
    ang = patternEntry.ang;
  } else {
    // Fallback: lane home (should rarely happen).
    const tgt = laneTargetWithJitter(lane, noteSeq);
    tx = tgt.tx;
    ty = tgt.ty;
    ang = -Math.PI / 2;
  }

  // Spawn from off-screen toward the snapped target.
  const spawnDist = Math.max(width, height) * 0.55;

  const nx = Math.cos(ang);
  const ny = Math.sin(ang);

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
    judged: false,
    effect: "none",
    effectTime: 0,
    shakeSeed: Math.random() * Math.PI * 2
  });
}

function generateNotes(t) {
  if (!autoChartReady) return;

  const maxAlive = MAX_ALIVE_BY_DIFF[DIFF] ?? 1;

  // Count active notes once so we don't repeatedly scan the array in the loop.
  let active = 0;
  for (const n of notes) if (!n.judged) active++;

  while (nextBeatIndex < beatTimes.length && beatTimes[nextBeatIndex] < t + SPAWN_LOOKAHEAD) {
    if (active >= maxAlive) break;

    const bt = beatTimes[nextBeatIndex];

    // Keep a minimum gap so auto-charts don't "machine-gun" even if detection is noisy.
    if (bt - lastSpawnedBeatTime < getMinNoteGap()) {
      nextBeatIndex++;
      continue;
    }

    // Pick a lane that isn't "full" for this difficulty.
    const maxPerLane = MAX_ALIVE_PER_LANE_BY_DIFF[DIFF] ?? 1;
    let lane = -1;

    // Try a few random lanes first (fast path).
    for (let tries = 0; tries < 4; tries++) {
      const cand = Math.floor(Math.random() * LANES.length);
      if (aliveCountInLane(cand) < maxPerLane) { lane = cand; break; }
    }

    // If random didn't find a lane, scan for any available.
    if (lane === -1) {
      for (let cand = 0; cand < LANES.length; cand++) {
        if (aliveCountInLane(cand) < maxPerLane) { lane = cand; break; }
      }
    }

    // If every lane is full, stop spawning for now.
    if (lane === -1) break;

    // Only advance the pattern when we actually spawn a note.
    const entry = nextPatternEntry();
    createNote(lane, bt, entry);
    triggerSpawnFlash(lane);

    lastSpawnedBeatTime = bt;
    nextBeatIndex++;
    active++;
  }
}

// PD-style lane resolution: always judge the earliest pending note for that lane.
// Prevents skipping older stacked notes (e.g., A A A A B) by accidentally selecting a newer one.
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
  // Too early
  { const w = getHitWindows(); if (t < note.time - w.good) return false; }
  // Too late (still allow a bit beyond GOOD so late presses don't pick future notes)
  { const w = getHitWindows(); if (t > note.time + w.miss) return false; }
  return true;
}

////////////////////////////////////////////////////////////
// INPUT
////////////////////////////////////////////////////////////
const keysDown = new Set();

window.addEventListener("keydown", e => {
  const k = e.key.toLowerCase();
  if (!keysDown.has(k)) {
    keysDown.add(k);
    handleKey(k);
  }
});
window.addEventListener("keyup", e => keysDown.delete(e.key.toLowerCase()));

function handleKey(key) {
  const lane = LANES.findIndex(l => l.key === key);
  if (lane === -1) return;

  const t = getSongTime();
  const earliest = findEarliestLaneNote(lane);
  if (!laneIsHittable(earliest, t)) return;

  judge(earliest, t);
}

canvas.addEventListener("mousedown", (e) => {
  // Browser events report positions in CSS pixels.
  // Our draw math also uses CSS pixels (we scale internally using DPR).
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
  const r = Math.min(width, height) * BASE_R_SCALE * UI_SCALE;

  // Touch/mouse input: pick the closest on-screen note to where you tapped/clicked.
  // (Keyboard input still uses "earliest note in that lane".)
  let best = null;
  let bestDist = Infinity;

  for (const n of notes) {
    if (n.judged) continue;
    if (t < n.spawnTime) continue;
    if (t > n.time + getHitWindows().miss) continue;

    // Current drawn position of the note right now.
    let prog = (t - n.spawnTime) / n.approach;
    prog = Math.max(0, Math.min(1, prog));

    const nx = lerp(n.spawnX, n.targetX, prog);
    const ny = lerp(n.spawnY, n.targetY, prog);

    const d = Math.hypot(x - nx, y - ny);
    if (d < bestDist) { bestDist = d; best = n; }
  }

  if (!best) return;
  if (bestDist > r * 1.35) return;
  if (!laneIsHittable(best, t)) return;

  judge(best, t);
}

////////////////////////////////////////////////////////////
// JUDGE
////////////////////////////////////////////////////////////
function judge(n, t) {
  const d = Math.abs(n.time - t);
  const w = getHitWindows();

  // PDiva-ish labels, derived from our 3 windows.
  const perfectT = w.perfect * 0.55;              // very tight
  const coolT    = w.perfect;                     // tight
  const fineT    = w.good;                        // medium
  const safeT    = w.good + (w.miss - w.good) * 0.55; // early/late but still "saved"
  const sadT     = w.miss;                        // barely in window

  if (d <= perfectT) registerHit(n, "PERFECT", 400);
  else if (d <= coolT) registerHit(n, "COOL", 300);
  else if (d <= fineT) registerHit(n, "FINE", 150);
  else if (d <= safeT) registerHit(n, "SAFE", 50);
  else if (d <= sadT) registerHit(n, "SAD", 10);
  else registerMiss(n);
}

function registerHit(n, label, baseScore) {
  const now = getSongTime();

  n.judged = true;
  n.effect = "hit";
  n.effectTime = now;

  combo++;
  score += Math.floor(baseScore * (1 + combo * 0.05));

  pushJudge(label, n.lane, combo, now);

  addParticles(n.targetX, n.targetY, LANES[n.lane].color);
  LANES[n.lane].pulse = 1;

  // Extra "lightshow" kick on hits.
  spawnFlash = Math.max(spawnFlash, 0.65);
}

function registerMiss(n) {
  const now = getSongTime();

  n.judged = true;
  n.effect = "miss";
  n.effectTime = now;

  combo = 0;
  pushJudge("MISS", n.lane, combo, now);
}


////////////////////////////////////////////////////////////
// RENDER
////////////////////////////////////////////////////////////
let fps = 0;
let lastFrame = performance.now();

function renderFrame(t) {
for (let i = 0; i < LANES.length; i++) {
  LANES[i].pulse = Math.max(0, (LANES[i].pulse || 0) - 0.05);
}
   ctx.clearRect(0,0,width,height);

  const bp = (t % BEAT) / BEAT;
  beatPulse = 0.5 + 0.5 * Math.sin(bp * Math.PI * 2);

  ctx.fillStyle = `rgba(0,0,0,${0.18 + beatPulse * 0.06})`;
  ctx.fillRect(0, 0, width, height);
const flashAge = t - spawnFlashTime;
if (flashAge >= 0 && flashAge < 0.10) {
  const p = 1 - flashAge / 0.10;
  ctx.save();
  ctx.globalAlpha = 0.22 * p;
  ctx.fillStyle = LANES[spawnFlashLane].color;
  ctx.fillRect(0, 0, width, height);
  ctx.restore();
}

   

  // DEBUG BOX (makes it obvious the canvas is visible + notes exist)
  if (DEBUG) {
    ctx.save();
    ctx.globalAlpha = 1;
    ctx.fillStyle = "rgba(255,0,0,0.85)";
    ctx.fillRect(16, 16, 240, 90);
    ctx.fillStyle = "white";
    ctx.font = "14px ui-monospace, SFMono-Regular, Menlo, monospace";
    ctx.fillText("canvas OK", 28, 44);
    ctx.fillText("t=" + t.toFixed(3), 28, 64);
    ctx.fillText("activeNotes=" + notes.filter(n => !n.judged).length, 28, 84);
    ctx.restore();
  }


  const r = Math.min(width, height) * BASE_R_SCALE * UI_SCALE;

  if (SHOW_RECEPTORS) {
    // Target markers ("receptors"): these show where the notes are meant to end up.
    // We draw:
    //  - a base ring (always there)
    //  - a beat ring (breathes with the music)
    //  - a hit ring (pops when you hit that lane)
    for (let i = 0; i < LANES.length; i++) {
      // Lane anchors drift a bit so the playfield feels less rigid.
      const minDim = Math.min(width, height);
      const swayX = 0;
      const swayY = 0;
      const tx = LANES[i].x * width + swayX;
      const ty = LANES[i].y * height + swayY;

      const lanePulse = (LANES[i].pulse || 0); // set in registerHit()
      const beat = beatPulse; // 0..1-ish

      const baseR = r * 1.15;
      const beatR = baseR * (1.10 + beat * 0.22);
      const hitR  = baseR * (1.10 + lanePulse * 0.95);

      // Soft glow halo (stronger than before so it feels "alive")
      ctx.save();
      ctx.translate(tx, ty);
      ctx.globalAlpha = 0.55;
      ctx.shadowColor = LANES[i].color;
      ctx.shadowBlur = 40 + beat * 28 + lanePulse * 50;

      // Base ring
      ctx.strokeStyle = "rgba(255,255,255,0.65)";
      ctx.lineWidth = 5.0 + beat * 2.5;
      ctx.beginPath();
      ctx.arc(0, 0, baseR, 0, Math.PI * 2);
      ctx.stroke();

      // Beat ring (slightly larger + fainter)
      ctx.globalAlpha = 0.38 + beat * 0.25;
      ctx.strokeStyle = "rgba(255,255,255,0.75)";
      ctx.lineWidth = 3.0 + beat * 3.0;
      ctx.beginPath();
      ctx.arc(0, 0, beatR, 0, Math.PI * 2);
      ctx.stroke();

      // Hit ring (pops out then decays via LANES[i].pulse)
      if (lanePulse > 0.001) {
        ctx.globalAlpha = Math.min(1, 1.15 * lanePulse + 0.20);
        ctx.strokeStyle = LANES[i].color;
        ctx.lineWidth = 6.0 + lanePulse * 10.0;
        ctx.setLineDash([14, 8]); // dotted ring feels more "game-y"
        ctx.lineDashOffset = -performance.now() * 0.02;
        ctx.beginPath();
        ctx.arc(0, 0, hitR, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      ctx.restore();

      // Receptor sprite (white + a tiny tint overlay)
      const base = getWhiteSprite(i);
      const tint = getTintSprite(i);
      const size = r * 2.35 * (1 + lanePulse * 0.20);

      if (base) {
        ctx.save();
        ctx.globalAlpha = 0.82;
        ctx.drawImage(base, tx - size / 2, ty - size / 2, size, size);

        // Slight color hint so lanes still feel distinct.
        if (tint) {
          ctx.globalCompositeOperation = "source-atop";
          ctx.globalAlpha = 0.20 + beat * 0.10;
          ctx.drawImage(tint, tx - size / 2, ty - size / 2, size, size);
        }
        ctx.restore();
      }
    }
  }
// Notes
for (const n of notes) {
  // Cull notes until their approach window begins
  const spawnTime = n.spawnTime;
  if (!n.judged && t < spawnTime) continue;

  if (!n.judged && !n.spawned && t >= n.spawnTime) {
    n.spawned = true;
    triggerSpawnFlash(n.lane);
  }

  if (!n.judged) {
    // progress 0..1 from spawn -> hit time
    let prog = (t - spawnTime) / n.approach;
    prog = Math.max(0, Math.min(1, prog));

    const x = lerp(n.spawnX, n.targetX, prog);
    const y = lerp(n.spawnY, n.targetY, prog);

    // Trail
    const dx = n.targetX - n.spawnX;
    const dy = n.targetY - n.spawnY;
    const len = Math.hypot(dx, dy) || 1;
    const nx = dx / len;
    const ny = dy / len;

    ctx.save();
    ctx.globalAlpha = 0.25 + 0.15 * beatPulse;
    ctx.strokeStyle = LANES[n.lane].color;
    ctx.lineWidth = 10;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(x - nx * 130, y - ny * 130);
    ctx.lineTo(x, y);
    ctx.stroke();
    ctx.restore();

    // Sprite-only note: white base + colored overlay glow.
    const base = getWhiteSprite(n.lane);
    const tint = getTintSprite(n.lane);

    // "Approach" feel: start slightly larger, settle to 1.0 at hit time.
    const approachScale = 1.28 - 0.28 * prog;

    // Per-lane pulse from hits, plus a tiny per-note wobble so it doesn't feel static.
    const lanePulse = (LANES[n.lane].pulse || 0);
    const wobble = 1 + Math.sin(t * 8 + n.seq * 0.35) * 0.03;
    const pulse = (1 + lanePulse * 0.22) * wobble;

    const size = r * 2.2 * approachScale * pulse;

    // Extra readability: an approach ring that shrinks toward the note.
    ctx.save();
    const ring = r * (2.2 - prog * 1.1);
    ctx.globalAlpha = 0.22 + 0.10 * beatPulse;
    ctx.strokeStyle = "rgba(255,255,255,0.75)";
    ctx.lineWidth = 2.2 + beatPulse * 1.8;
    ctx.beginPath();
    ctx.arc(x, y, ring, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    // Softer glow (the old one was washing the sprite out).
    if (tint) {
      ctx.save();
      ctx.globalAlpha = 0.10 + 0.06 * beatPulse;
      const glowSize = size * 1.08;
      ctx.drawImage(tint, x - glowSize / 2, y - glowSize / 2, glowSize, glowSize);
      ctx.restore();
    }

    if (base) {
      // Small rotation makes motion feel "alive" without being distracting.
      const rot = Math.sin((1 - prog) * 3.2 + n.seq * 0.18) * 0.10;

      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(rot);
      ctx.globalAlpha = 0.92;
      ctx.drawImage(base, -size / 2, -size / 2, size, size);

      // Light color hint so lanes still feel distinct (kept subtle for clarity).
      ctx.globalCompositeOperation = "source-atop";
      ctx.globalAlpha = 0.10;
      ctx.fillStyle = LANES[n.lane].color;
      ctx.fillRect(-size / 2, -size / 2, size, size);

      ctx.restore();
    } else {
      // Sprite missing: minimal fallback (text only).
      ctx.save();
      ctx.globalAlpha = 0.82;
      ctx.fillStyle = "#fff";
      ctx.font = `${r * 1.1}px Arial Black`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(LANES[n.lane].label, x, y);
      ctx.restore();
    }

    
  } else {
    const age = t - n.effectTime;

    if (n.effect === "hit" && age <= HIT_FADE_TIME) {
      // PDiva-ish hit pop: sprite scales up and fades out.
      const p = age / HIT_FADE_TIME;
      const size = r * 2.5 * (1 + p * 0.9);
      const base = getWhiteSprite(n.lane);
      const tint = getTintSprite(n.lane);

      ctx.save();
      ctx.globalAlpha = 1 - p;
      if (tint) {
        ctx.globalAlpha *= 0.45;
        ctx.drawImage(tint, n.targetX - size / 2, n.targetY - size / 2, size, size);
        ctx.globalAlpha = (1 - p);
      }
      if (base) {
        ctx.drawImage(base, n.targetX - size / 2, n.targetY - size / 2, size, size);
      }
      ctx.restore();
    } else if (n.effect === "miss" && age <= MISS_FADE_TIME) {
      // Miss: sprite shakes a bit and falls down while fading out.
      const shake = Math.sin(age * MISS_SHAKE_FREQ * Math.PI * 2 + n.shakeSeed) * MISS_SHAKE_AMT;
      const p = age / MISS_FADE_TIME;
      const size = r * 2.2;
      const base = getWhiteSprite(n.lane);
      const tint = getTintSprite(n.lane);

      ctx.save();
      ctx.globalAlpha = 1 - p;
      if (tint) {
        ctx.globalAlpha *= 0.35;
        ctx.drawImage(tint, (n.targetX + shake) - (size * 1.15) / 2, (n.targetY + age * MISS_FALL_SPEED) - (size * 1.15) / 2, size * 1.15, size * 1.15);
        ctx.globalAlpha = 1 - p;
      }
      if (base) {
        ctx.drawImage(base, (n.targetX + shake) - size / 2, (n.targetY + age * MISS_FALL_SPEED) - size / 2, size, size);
      }
      ctx.restore();
      ctx.globalAlpha = 1;
    }
  }
}

  // Particles
  for (let p of particles) {
    p.life -= 1/60;
    p.x += p.vx / 60;
    p.y += p.vy / 60;

    ctx.globalAlpha = Math.max(0, p.life / 0.4) * (0.5 + 0.5 * beatPulse);
    ctx.fillStyle = p.color;
    ctx.fillRect(p.x, p.y, 4, 4);
  }
  particles = particles.filter(p => p.life > 0);

  ctx.globalAlpha = 1;

  // HUD
  ctx.fillStyle = "#fff";
  ctx.font = `${18 * UI_SCALE}px Arial`;
  ctx.textAlign = "left";
  ctx.fillText("Project Baguette", 20 * UI_SCALE, 30 * UI_SCALE);
  ctx.fillText("Score: " + score, 20 * UI_SCALE, 55 * UI_SCALE);
  ctx.fillText("Combo: " + combo, 20 * UI_SCALE, 80 * UI_SCALE);

    // Judgement stack (newest at the top). Stays for a while, then fades out.
  const stackX = width / 2;
  const stackY = height * 0.18;
  const lineH = 38 * UI_SCALE;

  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  for (let i = 0; i < judgeStack.length; i++) {
    const it = judgeStack[i];
    const age = t - it.t;
    if (age > JUDGE_STACK_LIFE) continue;

    // Fade during the last ~25% of the lifetime.
    const fadeStart = JUDGE_STACK_LIFE * 0.75;
    const a = age <= fadeStart ? 1 : Math.max(0, 1 - (age - fadeStart) / (JUDGE_STACK_LIFE - fadeStart));

    const y = stackY + i * lineH;

    ctx.save();
    ctx.globalAlpha = a;

    // Pixel-ish arcade font if available; falls back safely.
    ctx.font = `${Math.floor(40 * UI_SCALE)}px "Pixel Game Font Family", "Pixel Game Font", "Press Start 2P", Arial Black, sans-serif`;
    ctx.lineWidth = 6 * UI_SCALE;
    ctx.strokeStyle = "rgba(0,0,0,0.70)";
    ctx.fillStyle = "#ffffff";

    ctx.strokeText(it.label, stackX, y);
    ctx.fillText(it.label, stackX, y);

    // Combo (only show on the newest entry, and only if combo > 0)
    if (i === 0 && it.combo > 0) {
      ctx.font = `${Math.floor(18 * UI_SCALE)}px "Pixel Game Font Family", "Pixel Game Font", "Press Start 2P", Arial Black, sans-serif`;
      ctx.lineWidth = 5 * UI_SCALE;
      ctx.strokeStyle = "rgba(0,0,0,0.70)";
      ctx.fillStyle = "#ffffff";
      const comboText = `${it.combo} COMBO`;
      ctx.strokeText(comboText, stackX, y + 30 * UI_SCALE);
      ctx.fillText(comboText, stackX, y + 30 * UI_SCALE);
    }

    ctx.restore();
  }
  ctx.restore();


}
////////////////////////////////////////////////////////////
// MAIN LOOP
////////////////////////////////////////////////////////////
function loop() {
  const now = performance.now();
  fps = 1000 / (now - lastFrame);
  lastFrame = now;

  const t = getSongTime();

  const active = notes.filter(n => !n.judged).length;
  smoothedApproach = lerp(smoothedApproach, APPROACH_TIME + active * 0.12, 0.18);

  generateNotes(t);
  renderFrame(t);

  for (const n of notes) {
    // If a note is past the miss window, mark it missed so it doesn't block future hits.
    if (!n.judged && t > n.time + getHitWindows().miss) {
      registerMiss(n);
    }
  }

  notes = notes.filter(n => {
    if (!n.judged) return true;
    const age = t - n.effectTime;
    if (n.effect === "hit") return age <= HIT_FADE_TIME;
    if (n.effect === "miss") return age <= MISS_FADE_TIME;
    return false;
  });

  // Drop expired judgement lines so the stack stays clean.
  judgeStack = judgeStack.filter(it => (t - it.t) <= JUDGE_STACK_LIFE);

  requestAnimationFrame(loop);
}


////////////////////////////////////////////////////////////
// MENU / OVERLAY START FLOW
////////////////////////////////////////////////////////////
async function startGame() {
  // AudioContext unlock
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!audioCtx) audioCtx = new AC();
  if (audioCtx.state === "suspended") {
    try { await audioCtx.resume(); } catch(e) {}
  }

  // Build auto-chart BEFORE playing audio
  try {
    await prepareAutoChart();
    nextBeatIndex = 0;
    lastSpawnedBeatTime = -Infinity;
    try { audio.currentTime = 0; } catch(e) {}
    console.log("START t=", getSongTime());
  } catch (e) {
    console.warn("Auto-chart early fail:", e);
  }
  // Try to start audio
  try { await audio.play(); }
  catch(e) { throw e; }

  // MV playback helper
  const startMV = () => {
    mv.style.display = "block";
    requestAnimationFrame(() => { mv.style.opacity = "1"; });

    try {
      mv.currentTime = 0;
      const p = mv.play();
      if (p && p.catch) p.catch(err => console.warn("MV play blocked:", err));
    } catch (err) {
      console.warn("MV play() error:", err);
    }
  };

  if (mv.readyState >= 2) startMV();
  else mv.addEventListener("loadeddata", startMV, { once: true });

  // Begin game
  requestAnimationFrame(loop);
}

// Expose a tiny API for the menu
window.PBEngine = {
  start: startGame,

  setSong: (audioSrc, mvSrc) => {
    if (audioSrc) audio.src = audioSrc;
    if (mvSrc) mv.src = mvSrc;
    if (window.PB_MENU_STATE?.bpm) setBpm(window.PB_MENU_STATE.bpm);

    // reset run state
    beatTimes = [];
    autoChartReady = false;
    nextBeatIndex = 0;
    lastSpawnedBeatTime = -Infinity;
    notes = [];
    noteSeq = 0;
    particles = [];
    score = 0;
    combo = 0;
    lastHitText = "";
    lastHitTime = 0;

    // hide MV until playback confirmed
    mv.style.opacity = "0";
    mv.style.display = "none";
  },

  setDifficulty: (name) => {
    DIFF = name || "Normal";
    applyDifficulty();
  },

  getState: () => ({ score, combo })
};

// If we're not in menu mode, keep the classic tap-to-start overlay.
if (!window.__PB_MENU_MODE__) {
  startOverlay.addEventListener("click", async () => {
    startOverlay.style.transition = "opacity 0.4s ease";
    startOverlay.style.opacity = "0";
    setTimeout(() => startOverlay.remove(), 450);

    try {
      await startGame();
    } catch (e) {
      alert("Tap again — Safari blocked audio.");
      // restore overlay
      if (!window.__PB_MENU_MODE__) {
  document.body.appendChild(startOverlay);
}

      startOverlay.style.opacity = "1";
      return;
    }
  });
} else {
  // In menu mode, don't show overlay at all.
  startOverlay.remove();
}
