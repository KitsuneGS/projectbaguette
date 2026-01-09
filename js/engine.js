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
const BASE_R_SCALE = isMobile ? 0.10 : 0.045;



// Scales the whole UI down a bit (HUD + sprites + receptors)
const UI_SCALE = 0.85;
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
function laneTargetWithJitter(lane, seq, timeSec) {
  const minDim = Math.min(width, height);

  // How far a lane target is allowed to wander around its anchor.
  // Bigger = less "fixed lanes".
  const jitterPx = minDim * 0.10;

  // Tiny deterministic random so the same note always gets the same offset.
  const rng = mulberry32((seq + 1) * 1337 + lane * 97);
  const jx = (rng() - 0.5) * 2 * jitterPx;
  const jy = (rng() - 0.5) * 2 * jitterPx;

  // Slow "lane drift" so targets don't feel glued in place.
  // This is based on timeSec, so different notes (different times) naturally vary.
  const driftPx = minDim * 0.03;
  const dx = Math.sin(timeSec * 0.9 + lane * 1.7) * driftPx;
  const dy = Math.cos(timeSec * 0.7 + lane * 1.1) * driftPx;

  const marginX = width * 0.18;
  const marginY = height * 0.18;

  const ax = LANES[lane].x * width;
  const ay = LANES[lane].y * height;

  // Keep targets in a "middle" band so they don't drift into UI/HUD edges.
  const tx = Math.max(marginX, Math.min(width - marginX, ax + jx + dx));
  const ty = Math.max(marginY, Math.min(height - marginY, ay + jy + dy));
  return { tx, ty };
}
function createNote(lane, time) {
  // Each note "locks in" its own approach timing at spawn.
  // This keeps visuals stable even if difficulty changes later.

  // The button you press (lane) is still decided by the chart.
  // Each note "locks in" its own approach timing at spawn.
  // This keeps visuals stable even if difficulty changes later.
  const approach = APPROACH_TIME;
  const spawnTime = time - approach;

  // Lane anchor + small jitter (stable per note seq).
  const { tx, ty } = laneTargetWithJitter(lane, noteSeq, time);

  const centerX = width / 2;
  const centerY = height / 2;



  // Spawn from outside the screen, traveling toward the target.
  const dx = tx - centerX;
  const dy = ty - centerY;
  const len = Math.hypot(dx, dy) || 1;
  const nx = dx / len;
  const ny = dy / len;

  const spawnDist = Math.max(width, height) * 0.45;

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

    // Enforce a small spacing between generated notes so they don't "machine-gun" spawn.
    const bt = beatTimes[nextBeatIndex];
    if (bt - lastSpawnedBeatTime < getMinNoteGap()) {
      nextBeatIndex++;
      continue;
    }

    const lane = Math.floor(Math.random() * LANES.length);
    const maxPerLane = MAX_ALIVE_PER_LANE_BY_DIFF[DIFF] ?? 1;

    // If this lane already has too many notes, skip this beat.
    if (aliveCountInLane(lane) >= maxPerLane) {
      nextBeatIndex++;
      continue;
    }

    createNote(lane, bt);
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
  if (d <= w.perfect) registerHit(n, "COOL", 300);
  else if (d <= w.good) registerHit(n, "FINE", 100);
  else if (d <= w.miss) registerMiss(n);
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
  LANES[n.lane].pulse = 1;
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

function renderFrame(t) {
for (let i = 0; i < LANES.length; i++) {
  LANES[i].pulse = Math.max(0, (LANES[i].pulse || 0) - 0.05);
}
   ctx.clearRect(0,0,width,height);

  const bp = (t % BEAT) / BEAT;
  beatPulse = 0.5 + 0.5 * Math.sin(bp * Math.PI * 2);

  ctx.fillStyle = `rgba(0,0,0,${0.18 + beatPulse * 0.06})`;
  ctx.fillRect(0, 0, width, height);
   

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
      const swayX = Math.sin(t * 0.9 + i * 1.7) * (minDim * 0.025);
      const swayY = Math.cos(t * 0.7 + i * 1.1) * (minDim * 0.020);

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
      ctx.shadowBlur = 26 + beat * 16 + lanePulse * 30;

      // Base ring
      ctx.strokeStyle = "rgba(255,255,255,0.65)";
      ctx.lineWidth = 3.5 + beat * 1.5;
      ctx.beginPath();
      ctx.arc(0, 0, baseR, 0, Math.PI * 2);
      ctx.stroke();

      // Beat ring (slightly larger + fainter)
      ctx.globalAlpha = 0.28 + beat * 0.18;
      ctx.strokeStyle = "rgba(255,255,255,0.75)";
      ctx.lineWidth = 2.0 + beat * 2.0;
      ctx.beginPath();
      ctx.arc(0, 0, beatR, 0, Math.PI * 2);
      ctx.stroke();

      // Hit ring (pops out then decays via LANES[i].pulse)
      if (lanePulse > 0.001) {
        ctx.globalAlpha = Math.min(1, 0.85 * lanePulse + 0.15);
        ctx.strokeStyle = LANES[i].color;
        ctx.lineWidth = 4.0 + lanePulse * 6.0;
        ctx.setLineDash([10, 8]); // dotted ring feels more "game-y"
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
        ctx.globalAlpha = 0.95;
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
      ctx.globalAlpha = 0.95;
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