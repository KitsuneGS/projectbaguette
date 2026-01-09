/* Project Baguette – Engine (menu-ready wrapper)
   Adapted from your uploaded main.js (v1.7/v8-P).
   Changes:
   - startGame() exported as window.PBEngine.start()
   - overlay optional via window.__PB_MENU_MODE__
*/

/* Project Baguette – Rhythm Engine v8-P (Fixed+MV)
   • ONE tap-to-start overlay (Safari-safe)
   • MP3-compatible auto-chart
   • MV only appears after audio begins playing (with play() call)
   • Debug enabled via ?debug=1
   • Mobile circles +50% larger
*/

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
canvas.width = width;
canvas.height = height;

window.addEventListener("resize", () => {
  width = window.innerWidth;
  height = window.innerHeight;
  canvas.width = width;
  canvas.height = height;
});

const isMobile = /iPhone|iPad|Android/i.test(navigator.userAgent);
// 50% bigger circles on mobile (0.067 * 1.5 ≈ 0.10)
const BASE_R_SCALE = isMobile ? 0.10 : 0.045;

// Scale the whole UI down a bit (requested: -15%)
const UI_SCALE = 0.85;

// Lightshow timing
const BEAT_FLASH_TIME = 0.12;
const SPAWN_FLASH_TIME = 0.18;
let lastBeatFlashAt = -Infinity;

// 10 fixed spawn patterns. The game cycles them randomly.
// Each step decides (lane + small offset around that lane's anchor).
const SPAWN_PATTERNS = [
  [{ lane: 0, ox: -0.06, oy: -0.06 }, { lane: 1, ox:  0.06, oy: -0.06 }, { lane: 2, ox:  0.06, oy:  0.06 }, { lane: 3, ox: -0.06, oy:  0.06 }],
  [{ lane: 0, ox:  0.06, oy: -0.06 }, { lane: 3, ox:  0.06, oy:  0.06 }, { lane: 2, ox: -0.06, oy:  0.06 }, { lane: 1, ox: -0.06, oy: -0.06 }],
  [{ lane: 0, ox:  0.00, oy: -0.08 }, { lane: 2, ox:  0.00, oy:  0.08 }, { lane: 0, ox:  0.02, oy: -0.06 }, { lane: 2, ox: -0.02, oy:  0.06 }],
  [{ lane: 1, ox: -0.08, oy:  0.00 }, { lane: 3, ox:  0.08, oy:  0.00 }, { lane: 1, ox: -0.06, oy:  0.02 }, { lane: 3, ox:  0.06, oy: -0.02 }],
  [{ lane: 0, ox:  0.00, oy: -0.07 }, { lane: 3, ox:  0.07, oy:  0.00 }, { lane: 2, ox:  0.00, oy:  0.07 }, { lane: 1, ox: -0.07, oy:  0.00 }],
  [{ lane: 0, ox:  0.00, oy: -0.07 }, { lane: 1, ox: -0.07, oy:  0.00 }, { lane: 2, ox:  0.00, oy:  0.07 }, { lane: 3, ox:  0.07, oy:  0.00 }],
  [{ lane: 0, ox: -0.05, oy: -0.03 }, { lane: 3, ox:  0.05, oy: -0.03 }, { lane: 2, ox:  0.05, oy:  0.03 }, { lane: 1, ox: -0.05, oy:  0.03 }],
  [{ lane: 0, ox:  0.05, oy: -0.03 }, { lane: 1, ox: -0.05, oy: -0.03 }, { lane: 2, ox: -0.05, oy:  0.03 }, { lane: 3, ox:  0.05, oy:  0.03 }],
  [{ lane: 0, ox:  0.00, oy: -0.02 }, { lane: 1, ox: -0.02, oy:  0.00 }, { lane: 2, ox:  0.00, oy:  0.02 }, { lane: 3, ox:  0.02, oy:  0.00 }],
  [{ lane: 0, ox:  0.00, oy: -0.10 }, { lane: 1, ox: -0.10, oy:  0.00 }, { lane: 2, ox:  0.00, oy:  0.10 }, { lane: 3, ox:  0.10, oy:  0.00 }]
];

let patternId = 0;
let patternStep = 0;
function pickNextPattern() {
  const next = Math.floor(Math.random() * SPAWN_PATTERNS.length);
  patternId = (next === patternId) ? ((next + 1) % SPAWN_PATTERNS.length) : next;
  patternStep = 0;
}


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
  font-size:32px;
  z-index:99999;
`;
startOverlay.innerHTML = `
  <div style="opacity:0.9">PROJECT BAGUETTE</div>
  <div id="tapText" style="margin-top:20px; font-size:20px; opacity:0.7;">Tap to Start</div>
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
const BEAT = 60 / BPM;

let APPROACH_TIME = 1.4 + (240 / BPM);
let smoothedApproach = APPROACH_TIME;

const HIT_WINDOW_PERFECT = 0.08;
const HIT_WINDOW_GOOD = 0.18;

const SPAWN_LOOKAHEAD = 8.0;
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
    pickNextPattern();


////////////////////////////////////////////////////////////
// INPUT MAPPING
////////////////////////////////////////////////////////////
const LANES = [
  // x/y are anchor points for each lane's target position (0..1 of screen).
  // icon paths are where your sprites live.
  { key: "w", label: "W", color: "#FFD447", icon: "assets/sprites/triangle.png", x: 0.50, y: 0.35 },
  { key: "a", label: "A", color: "#47FFA3", icon: "assets/sprites/square.png",   x: 0.38, y: 0.50 },
  { key: "s", label: "S", color: "#FF69B4", icon: "assets/sprites/x.png",        x: 0.50, y: 0.65 },
  { key: "d", label: "D", color: "#6AB4FF", icon: "assets/sprites/circle.png",   x: 0.62, y: 0.50 }
];

////////////////////////////////////////////////////////////
// SPRITES (notes + receptors)
////////////////////////////////////////////////////////////
// Notes are drawn as sprites (no filled circles behind them).
// We tint the sprites at draw time by using cached canvases:
//  - blue silhouette (main note body, so it isn't "washed out" white)
//  - lane-color tint (used for glows / lightshow)
const NOTE_BASE_BLUE = "#3B82F6";

const laneIcons = LANES.map((l) => {
  const img = new Image();
  img.src = l.icon;
  return img;
});

const spriteCacheBlue = new Array(LANES.length).fill(null);
const spriteCacheTint = new Array(LANES.length).fill(null);

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

function getBlueSprite(lane) {
  const img = laneIcons[lane];
  if (!img || !img.complete || !img.naturalWidth) return null;
  if (!spriteCacheBlue[lane]) spriteCacheBlue[lane] = makeTintCanvas(img, NOTE_BASE_BLUE);
  return spriteCacheBlue[lane];
}
function getTintSprite(lane) {
  const img = laneIcons[lane];
  if (!img || !img.complete || !img.naturalWidth) return null;
  if (!spriteCacheTint[lane]) spriteCacheTint[lane] = makeTintCanvas(img, LANES[lane].color);
  return spriteCacheTint[lane];
}

// Consistent letter rendering (so "D" doesn't look bigger than the other letters).
function drawLaneLabel(x, y, sizePx, text) {
  ctx.save();
  ctx.translate(x, y);

  const base = sizePx * 0.78;
  ctx.font = `900 ${base}px Arial Black`;
  const m = ctx.measureText(text);

  const box = sizePx * 0.95;
  const w = Math.max(1, m.width);
  const h = Math.max(1, (m.actualBoundingBoxAscent || base) + (m.actualBoundingBoxDescent || base * 0.2));
  const s = Math.min(box / w, box / h);

  ctx.scale(s, s);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, 0, 0);
  ctx.restore();
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

  if (!mediaSrc) mediaSrc = audioCtx.createMediaElementSource(audio);
  analyser = audioCtx.createAnalyser();
  analyser.fftSize = 2048;

  mediaSrc.connect(analyser);
  analyser.connect(audioCtx.destination);

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

    autoChartReady = true;
  } catch (e) {
    console.error("Auto-chart decode fail:", e);
    for (let t = 0; t < 120; t += 0.5) beatTimes.push(t);
    autoChartReady = true;
  }
}


////////////////////////////////////////////////////////////
// NOTE + PARTICLES
////////////////////////////////////////////////////////////
let notes = [];
let particles = [];
let score = 0;
let combo = 0;
let lastHitText = "";
let lastHitTime = 0;

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

function createNote(lane, time, ox = 0, oy = 0) {
  const approach = APPROACH_TIME;
  const spawnTime = time - approach;

  const minDim = Math.min(width, height);

  // Fixed anchor per lane + small pattern offset (no drifting).
  const ax = LANES[lane].x * width;
  const ay = LANES[lane].y * height;

  // Tiny jitter so repeats don't look copy-pasted (stable-ish per seq).
  const jx = (Math.random() - 0.5) * 2 * (minDim * 0.010);
  const jy = (Math.random() - 0.5) * 2 * (minDim * 0.010);

  const marginX = width * 0.16;
  const marginY = height * 0.16;

  const tx = Math.max(marginX, Math.min(width - marginX, ax + ox * minDim + jx));
  const ty = Math.max(marginY, Math.min(height - marginY, ay + oy * minDim + jy));

  const cx = width / 2;
  const cy = height / 2;

  const dx = tx - cx;
  const dy = ty - cy;
  const len = Math.hypot(dx, dy) || 1;
  const nx = dx / len;
  const ny = dy / len;

  const spawnDist = Math.max(width, height) * 0.52;

  notes.push({
    seq: noteSeq++,
    lane,
    time,
    approach,
    spawnTime,
    spawnX: tx - nx * spawnDist,
    spawnY: ty - ny * spawnDist,
    targetX: tx,
    targetY: ty,
    judged: false,
    effect: "none",
    effectTime: 0,
    spawnFxTime: spawnTime,
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

    // Choose lane + offset from the current pattern step.
    const pat = SPAWN_PATTERNS[patternId];
    const step = pat[patternStep % pat.length];

    let lane = step.lane;
    let ox = step.ox;
    let oy = step.oy;

    const maxPerLane = MAX_ALIVE_PER_LANE_BY_DIFF[DIFF] ?? 1;

    // If intended lane is full, try other lanes quickly before skipping this beat.
    if (aliveCountInLane(lane) >= maxPerLane) {
      let found = false;
      for (let tries = 1; tries < 4; tries++) {
        const alt = pat[(patternStep + tries) % pat.length];
        if (aliveCountInLane(alt.lane) < maxPerLane) {
          lane = alt.lane; ox = alt.ox; oy = alt.oy;
          found = true;
          break;
        }
      }
      if (!found) {
        nextBeatIndex++;
        patternStep++;
        continue;
      }
    }

    createNote(lane, bt, ox, oy);

    // Beat flash for the lightshow
    lastBeatFlashAt = bt;

    lastSpawnedBeatTime = bt;
    nextBeatIndex++;
    patternStep++;
    active++;

    // Every few beats, swap to a new pattern so it feels fresh.
    if (patternStep % 8 === 0) pickNextPattern();
  }
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
  let best = null;
  let diff = Infinity;

  for (const n of notes) {
    if (!n.judged && n.lane === lane) {
      const d = Math.abs(n.time - t);
      if (d < diff) { diff = d; best = n; }
    }
  }

  if (best) judge(best, t);
}

canvas.addEventListener("mousedown", e => {
  const r = canvas.getBoundingClientRect();
  hitAt((e.clientX - r.left) * (canvas.width / r.width),
        (e.clientY - r.top) * (canvas.height / r.height));
});

canvas.addEventListener("touchstart", e => {
  const r = canvas.getBoundingClientRect();
  const t = e.touches[0];
  hitAt((t.clientX - r.left) * (canvas.width / r.width),
        (t.clientY - r.top) * (canvas.height / r.height));
  e.preventDefault();
}, { passive:false });

function hitAt(x, y) {
  const t = getSongTime();

  const r = Math.min(width, height) * BASE_R_SCALE * UI_SCALE;

  // Whole-screen beat flash (happens when we spawn a note for a beat)
  const beatFlashAge = t - lastBeatFlashAt;
  if (beatFlashAge >= 0 && beatFlashAge <= BEAT_FLASH_TIME) {
    const p = beatFlashAge / BEAT_FLASH_TIME;
    ctx.save();
    ctx.globalAlpha = (1 - p) * (0.35 + beatPulse * 0.25);
    ctx.fillStyle = "rgba(59,130,246,1)";
    ctx.fillRect(0, 0, width, height);
    ctx.restore();
  }

  // Receptors (target circles): keep them, but make them feel alive.
  for (let i = 0; i < LANES.length; i++) {
    const tx = LANES[i].x * width;
    const ty = LANES[i].y * height;

    const lanePulse = (LANES[i].pulse || 0);
    const beat = beatPulse;

    const baseR = r * 1.15;
    const beatR = baseR * (1.12 + beat * 0.26);
    const hitR  = baseR * (1.15 + lanePulse * 1.10);

    // glow halo
    ctx.save();
    ctx.translate(tx, ty);
    ctx.globalAlpha = 0.70;
    ctx.shadowColor = LANES[i].color;
    ctx.shadowBlur = 28 + beat * 22 + lanePulse * 60;

    // base ring
    ctx.strokeStyle = "rgba(255,255,255,0.70)";
    ctx.lineWidth = 3.5 + beat * 2.0;
    ctx.beginPath();
    ctx.arc(0, 0, baseR, 0, Math.PI * 2);
    ctx.stroke();

    // beat ring
    ctx.globalAlpha = 0.30 + beat * 0.22;
    ctx.strokeStyle = "rgba(255,255,255,0.85)";
    ctx.lineWidth = 2.0 + beat * 2.6;
    ctx.beginPath();
    ctx.arc(0, 0, beatR, 0, Math.PI * 2);
    ctx.stroke();

    // hit ring (dashed + rotating)
    if (lanePulse > 0.001) {
      ctx.globalAlpha = Math.min(1, 0.92 * lanePulse + 0.10);
      ctx.strokeStyle = LANES[i].color;
      ctx.lineWidth = 4.0 + lanePulse * 7.0;
      ctx.setLineDash([10, 8]);
      ctx.lineDashOffset = -performance.now() * 0.02;
      ctx.beginPath();
      ctx.arc(0, 0, hitR, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.restore();

    // receptor sprite (blue base + tiny lane tint)
    const base = getBlueSprite(i);
    const tint = getTintSprite(i);
    const size = r * 2.35 * (1 + lanePulse * 0.22);
    if (base) {
      ctx.save();
      ctx.globalAlpha = 1.0;
      ctx.drawImage(base, tx - size / 2, ty - size / 2, size, size);
      if (tint) {
        ctx.globalCompositeOperation = "source-atop";
        ctx.globalAlpha = 0.12 + beat * 0.08;
        ctx.drawImage(tint, tx - size / 2, ty - size / 2, size, size);
      }
      ctx.restore();
    }

    // lane label overlay (consistent sizing)
    ctx.save();
    ctx.fillStyle = "#fff";
    ctx.globalAlpha = 0.92;
    drawLaneLabel(tx, ty, r * 2.0, LANES[i].label);
    ctx.restore();
  }


  let best = null;
  let scoreVal = Infinity;

  for (const n of notes) {
    if (n.judged) continue;

    const dx = x - n.targetX;
    const dy = y - n.targetY;
    const dist = Math.hypot(dx, dy);

    if (dist > r * 1.2) continue;

    const td = Math.abs(n.time - t);
    const val = td + dist / 1000;

    if (val < scoreVal) {
      scoreVal = val;
      best = n;
    }
  }

  if (best) judge(best, t);
}


////////////////////////////////////////////////////////////
// JUDGE
////////////////////////////////////////////////////////////
function judge(n, t) {
  const d = Math.abs(n.time - t);

  if (d <= HIT_WINDOW_PERFECT) registerHit(n, "COOL", 300);
  else if (d <= HIT_WINDOW_GOOD) registerHit(n, "FINE", 100);
  else if (d <= 0.35) registerMiss(n);
}

function registerHit(n, label, baseScore) {
  n.judged = true;
  n.effect = "hit";
  n.effectTime = getSongTime();

  combo++;
  score += Math.floor(baseScore * (1 + combo * 0.05));

  lastHitText = label;
  lastHitTime = getSongTime();

  addParticles(n.targetX, n.targetY, LANES[n.lane].color);
}

function registerMiss(n) {
  n.judged = true;
  n.effect = "miss";
  n.effectTime = getSongTime();

  combo = 0;
  lastHitText = "MISS";
  lastHitTime = getSongTime();
}


////////////////////////////////////////////////////////////
// RENDER
////////////////////////////////////////////////////////////
let fps = 0;
let lastFrame = performance.now();

function draw(t) {
  ctx.clearRect(0,0,width,height);

  const bp = (t % BEAT) / BEAT;
  beatPulse = 0.5 + 0.5 * Math.sin(bp * Math.PI * 2);

  ctx.fillStyle = "rgba(0,0,0,0.22)";
  ctx.fillRect(0,0,width,height);

  const r = Math.min(width, height) * BASE_R_SCALE * UI_SCALE;

  // Notes
  for (const n of notes) {
    const dt = n.time - t;
    const prog = 1 - dt / smoothedApproach;

    if (!n.judged) {
      if (prog < 0 || prog > 1.5) continue;

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

      // Body (sprite-only)
      const base = getBlueSprite(n.lane);
      const tint = getTintSprite(n.lane);

      const lanePulse = (LANES[n.lane].pulse || 0);
      const beat = beatPulse;

      const approachScale = 1.35 - 0.35 * prog;
      const size = r * 2.35 * approachScale * (1 + beat * 0.12 + lanePulse * 0.25);

      // Spawn pop
      const spawnAge = t - n.spawnFxTime;
      if (spawnAge >= 0 && spawnAge <= SPAWN_FLASH_TIME) {
        const p = spawnAge / SPAWN_FLASH_TIME;
        ctx.save();
        ctx.globalAlpha = (1 - p) * 0.95;
        ctx.strokeStyle = LANES[n.lane].color;
        ctx.lineWidth = 4 + (1 - p) * 10;
        ctx.shadowColor = LANES[n.lane].color;
        ctx.shadowBlur = 40 + (1 - p) * 60;
        ctx.beginPath();
        ctx.arc(x, y, (size * 0.65) * (1 + p * 0.9), 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }

      // Glow behind
      if (tint) {
        ctx.save();
        ctx.globalAlpha = 0.22 + beat * 0.12 + lanePulse * 0.28;
        ctx.shadowColor = LANES[n.lane].color;
        ctx.shadowBlur = 30 + beat * 25 + lanePulse * 55;
        ctx.drawImage(tint, x - (size * 1.18) / 2, y - (size * 1.18) / 2, size * 1.18, size * 1.18);
        ctx.restore();
      }

      // Main sprite
      if (base) {
        ctx.save();
        ctx.globalAlpha = 1.0;
        ctx.shadowColor = "rgba(255,255,255,0.35)";
        ctx.shadowBlur = 8 + beat * 10;
        ctx.drawImage(base, x - size / 2, y - size / 2, size, size);
        ctx.restore();

        // Tiny lane tint so lanes still feel distinct
        if (tint) {
          ctx.save();
          ctx.globalCompositeOperation = "source-atop";
          ctx.globalAlpha = 0.10 + beat * 0.06;
          ctx.drawImage(tint, x - size / 2, y - size / 2, size, size);
          ctx.restore();
        }
      } else {
        // Sprite missing fallback: blue dot
        ctx.save();
        ctx.globalAlpha = 0.95;
        ctx.fillStyle = NOTE_BASE_BLUE;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      // Label overlay (consistent sizing)
      ctx.save();
      ctx.fillStyle = "#fff";
      ctx.globalAlpha = 0.92;
      drawLaneLabel(x, y, r * 2.0, LANES[n.lane].label);
      ctx.restore();
    }

    else {
      const age = t - n.effectTime;

      if (n.effect === "hit" && age <= HIT_FADE_TIME) {
        ctx.save();
        const p = age / HIT_FADE_TIME;
        ctx.globalAlpha = 1 - p;
        ctx.fillStyle = LANES[n.lane].color;
        ctx.beginPath();
        ctx.arc(n.targetX, n.targetY, r * (1 + p * 2.2), 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      else if (n.effect === "miss" && age <= MISS_FADE_TIME) {
        const shake = Math.sin(age * MISS_SHAKE_FREQ * Math.PI * 2 + n.shakeSeed) * MISS_SHAKE_AMT;

        ctx.globalAlpha = 1 - age / MISS_FADE_TIME;
        ctx.save();
        ctx.fillStyle = "rgba(255,255,255,0.9)";
        ctx.strokeStyle = LANES[n.lane].color;
        ctx.lineWidth = 6;
        ctx.beginPath();
        ctx.arc(n.targetX + shake, n.targetY + age * MISS_FALL_SPEED, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
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

  if (t - lastHitTime < 0.5 && lastHitText) {
    ctx.font = `${32 * UI_SCALE}px Arial Black`;
    ctx.textAlign = "center";
    ctx.fillText(lastHitText, width/2, height * 0.2);
  }

  if (DEBUG) {
    ctx.fillStyle = "rgba(0,0,0,0.6)";
    ctx.fillRect(width - 200, 10, 180, 100);

    ctx.fillStyle = "#0f0";
    ctx.font = "14px monospace";
    ctx.textAlign = "left";
    ctx.fillText(`FPS: ${fps.toFixed(1)}`, width - 190, 30);
    ctx.fillText(`Time: ${t.toFixed(3)}s`, width - 190, 50);
    ctx.fillText(`Beats: ${beatTimes.length}`, width - 190, 70);
    ctx.fillText(`Idx: ${nextBeatIndex}`, width - 190, 90);
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

  const active = notes.filter(n => !n.judged).length;
  smoothedApproach = lerp(smoothedApproach, APPROACH_TIME + active * 0.12, 0.18);

  generateNotes(t);
  draw(t);

  for (const n of notes) {
    if (!n.judged && t > n.time + HIT_WINDOW_GOOD + MISS_EXTRA) {
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
  try { await prepareAutoChart(); }
  catch (e) { console.warn("Auto-chart early fail:", e); }

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

    // reset run state
    beatTimes = [];
    autoChartReady = false;
    nextBeatIndex = 0;
    notes = [];
    particles = [];
    score = 0;
    combo = 0;
    lastHitText = "";
    lastHitTime = 0;

    // hide MV until playback confirmed
    mv.style.opacity = "0";
    mv.style.display = "none";
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
