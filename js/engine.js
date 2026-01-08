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
let BEAT = 60 / BPM;

let DIFF = "Normal";
const APPROACH_BY_DIFF = { Easy: 3.2, Normal: 2.8, Hard: 2.4, Extreme: 2.0 };

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

const HIT_WINDOW_PERFECT = 0.08;
const HIT_WINDOW_GOOD = 0.18;
const HIT_WINDOW_MISS = 0.35;
const SPAWN_LOOKAHEAD = 8.0;
const MIN_NOTE_GAP = 0.20; // seconds: keep auto-chart from spawning notes too close together

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
  { key: "w", label: "W", color: "#FFD447", icon: "assets/sprites/triangle.png" },
  { key: "a", label: "A", color: "#47FFA3", icon: "assets/sprites/square.png" },
  { key: "s", label: "S", color: "#FF69B4", icon: "assets/sprites/x.png" },
  { key: "d", label: "D", color: "#6AB4FF", icon: "assets/sprites/circle.png" }
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

function createNote(lane, time) {
  // Each note "locks in" its own approach timing at spawn.
  // This keeps visuals stable even if difficulty changes later.
  const approach = APPROACH_TIME;
  const spawnTime = time - approach;

  // Pick a target somewhere in the "middle" region of the screen.
  // The button you press (lane) is still decided by the chart.
  const mX = width * 0.22;
  const mY = height * 0.22;
  const tx = mX + Math.random() * (width - mX * 2);
  const ty = mY + Math.random() * (height - mY * 2);

  const cx = width / 2;
  const cy = height / 2;

  // Spawn from outside the screen, traveling toward the target.
  const dx = tx - cx;
  const dy = ty - cy;
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

  // Count active notes once so we don't repeatedly scan the array in the loop.
  let active = 0;
  for (const n of notes) if (!n.judged) active++;

  while (nextBeatIndex < beatTimes.length &&
         beatTimes[nextBeatIndex] < t + SPAWN_LOOKAHEAD) {

    if (active >= 4) break;

    // Enforce a small spacing between generated notes so they don't "machine-gun" spawn.
    const bt = beatTimes[nextBeatIndex];
    if (bt - lastSpawnedBeatTime >= MIN_NOTE_GAP) {
      createNote(Math.floor(Math.random() * LANES.length), bt);
      lastSpawnedBeatTime = bt;
      active++;
    }
    nextBeatIndex++;
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
  if (t < note.time - HIT_WINDOW_GOOD) return false;
  // Too late (still allow a bit beyond GOOD so late presses don't pick future notes)
  if (t > note.time + HIT_WINDOW_MISS) return false;
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
  const r = Math.min(width, height) * BASE_R_SCALE;

  // Touch/mouse input: pick the closest on-screen note to where you tapped/clicked.
  // (Keyboard input still uses "earliest note in that lane".)
  let best = null;
  let bestDist = Infinity;

  for (const n of notes) {
    if (n.judged) continue;
    if (t < n.spawnTime) continue;
    if (t > n.time + HIT_WINDOW_MISS) continue;

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
if (d <= HIT_WINDOW_PERFECT) registerHit(n, "COOL", 300);
  else if (d <= HIT_WINDOW_GOOD) registerHit(n, "FINE", 100);
  else if (d <= HIT_WINDOW_MISS) registerMiss(n);
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

function renderFrame(t) {
  ctx.clearRect(0,0,width,height);

  const bp = (t % BEAT) / BEAT;
  beatPulse = 0.5 + 0.5 * Math.sin(bp * Math.PI * 2);

  ctx.fillStyle = "rgba(0,0,0,0.22)";
  ctx.fillRect(0,0,width,height);

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


  const r = Math.min(width, height) * BASE_R_SCALE;

  // Ghosts
  for (const n of notes) {
    ctx.save();
    ctx.globalAlpha = 0.18 + beatPulse * 0.22;
    ctx.strokeStyle = LANES[n.lane].color;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(n.targetX, n.targetY, r * 0.9, 0, Math.PI * 2);
    ctx.stroke();

    ctx.globalAlpha = 0.05 + 0.10 * beatPulse;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(n.targetX, n.targetY, r * (0.7 + 0.3 * beatPulse), 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
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

    // Body (ring + optional sprite)
    ctx.save();
    ctx.fillStyle = "rgba(255,255,255,0.9)";
    ctx.strokeStyle = LANES[n.lane].color;
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // If the sprite is available, draw it centered on the note.
    // Otherwise, fall back to the old letter-in-circle look.
    const img = laneIcons[n.lane];
    const size = r * 2.1;
    if (img && img.complete && img.naturalWidth) {
      ctx.drawImage(img, x - size / 2, y - size / 2, size, size);
    } else {
      ctx.fillStyle = LANES[n.lane].color;
      ctx.font = `${r * 1.2}px Arial Black`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(LANES[n.lane].label, x, y + r * 0.05);
    }
    ctx.restore();
  } else {
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
    } else if (n.effect === "miss" && age <= MISS_FADE_TIME) {
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
  ctx.font = "18px Arial";
  ctx.textAlign = "left";
  ctx.fillText("Project Baguette", 20, 30);
  ctx.fillText("Score: " + score, 20, 55);
  ctx.fillText("Combo: " + combo, 20, 80);

  if (t - lastHitTime < 0.5 && lastHitText) {
    ctx.font = "32px Arial Black";
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
    if (!n.judged && t > n.time + HIT_WINDOW_MISS) {
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