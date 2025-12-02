// -------------------- CONFIG ----------------------
// Created by Mira Studios and ChatGPT <3
const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

let width = window.innerWidth;
let height = window.innerHeight;
canvas.width = width;
canvas.height = height;

// 4 lanes: W, A, S, D
const LANES = [
  { key: "w", name: "Drums",  color: "#ff5555", dirChar: "↑" },
  { key: "a", name: "Bass",   color: "#55ff55", dirChar: "←" },
  { key: "s", name: "Lead",   color: "#ffaa00", dirChar: "↓" },
  { key: "d", name: "Keys",   color: "#5555ff", dirChar: "→" },
];

// time for a note to travel from spawn → target
const APPROACH_TIME = 2.0;
const HIT_WINDOW_PERFECT = 0.05; // 50 ms
const HIT_WINDOW_GOOD    = 0.12; // 120 ms

// target/spawn positions per lane (computed from screen size)
let TARGETS = [];
let SPAWNS = [];

function updateLayout() {
  width = window.innerWidth;
  height = window.innerHeight;
  canvas.width = width;
  canvas.height = height;

  const cx = width / 2;
  const cy = height / 2;
  const radius = Math.min(width, height) * 0.25;

  // targets arranged around the center like Project Diva
  TARGETS = [
    { x: cx,        y: cy - radius }, // Up (W)
    { x: cx - radius, y: cy },        // Left (A)
    { x: cx,        y: cy + radius }, // Down (S)
    { x: cx + radius, y: cy },        // Right (D)
  ];

  // spawns a bit further out in the same direction
  const spawnOffset = radius * 1.2;
  SPAWNS = [
    { x: cx,        y: cy - radius - spawnOffset }, // from above
    { x: cx - radius - spawnOffset, y: cy },        // from left
    { x: cx,        y: cy + radius + spawnOffset }, // from below
    { x: cx + radius + spawnOffset, y: cy },        // from right
  ];
}

window.addEventListener("resize", updateLayout);
updateLayout();

// For now we fake song timing with a clock.
// Later: tie to Web Audio.
let startTime = 0;
let running = false;

// -------------------- DATA ------------------------
// Example notes: time in seconds, lane index 0-3
// Replace this with your real chart later.
let notes = [
  { time: 1.0, lane: 0, hit: false, judged: false },
  { time: 1.5, lane: 1, hit: false, judged: false },
  { time: 2.0, lane: 2, hit: false, judged: false },
  { time: 2.5, lane: 3, hit: false, judged: false },
  { time: 3.0, lane: 0, hit: false, judged: false },
  { time: 3.5, lane: 1, hit: false, judged: false },
];

let score = 0;
let combo = 0;
let lastHitText = "";
let lastHitTime = 0;

// -------------------- INIT ------------------------
function init() {
  startTime = performance.now() / 1000;
  running = true;
  requestAnimationFrame(loop);
}

init();

// -------------------- TIMING ----------------------
function getSongTime() {
  if (!running) return 0;
  return performance.now() / 1000 - startTime;
}

// -------------------- INPUT -----------------------
const keysDown = new Set();

window.addEventListener("keydown", (e) => {
  const key = e.key.toLowerCase();
  if (!keysDown.has(key)) {
    keysDown.add(key);
    handleKeyPress(key);
  }
});

window.addEventListener("keyup", (e) => {
  keysDown.delete(e.key.toLowerCase());
});

function handleKeyPress(key) {
  const laneIndex = LANES.findIndex(l => l.key === key);
  if (laneIndex === -1) return;

  const songTime = getSongTime();
  // find closest unjudged note in that lane
  let bestNote = null;
  let bestDiff = Infinity;

  for (const note of notes) {
    if (note.judged || note.lane !== laneIndex) continue;
    const diff = Math.abs(note.time - songTime);
    if (diff < bestDiff) {
      bestDiff = diff;
      bestNote = note;
    }
  }

  if (!bestNote) return;

  if (bestDiff <= HIT_WINDOW_PERFECT) {
    registerHit(bestNote, "PERFECT", 300);
  } else if (bestDiff <= HIT_WINDOW_GOOD) {
    registerHit(bestNote, "GOOD", 100);
  } else {
    // optional: strict miss if you want PD-style harshness
    // registerMiss(bestNote);
  }
}

function registerHit(note, label, baseScore) {
  note.hit = true;
  note.judged = true;
  combo += 1;
  const multiplier = 1 + combo * 0.05;
  score += Math.floor(baseScore * multiplier);

  lastHitText = label;
  lastHitTime = getSongTime();
}

function registerMiss(note) {
  note.hit = false;
  note.judged = true;
  combo = 0;
  lastHitText = "MISS";
  lastHitTime = getSongTime();
}

// -------------------- GAME LOOP -------------------
function loop() {
  if (!running) return;
  const songTime = getSongTime();

  // auto-judge misses after passing hit window
  for (const note of notes) {
    if (!note.judged && songTime > note.time + HIT_WINDOW_GOOD) {
      registerMiss(note);
    }
  }

  draw(songTime);
  requestAnimationFrame(loop);
}

// -------------------- RENDERING -------------------
function lerp(a, b, t) {
  return a + (b - a) * t;
}

function draw(songTime) {
  ctx.clearRect(0, 0, width, height);

  // slight vignette / background
  const grd = ctx.createRadialGradient(
    width / 2, height / 2, Math.min(width, height) * 0.1,
    width / 2, height / 2, Math.min(width, height) * 0.7
  );
  grd.addColorStop(0, "#111");
  grd.addColorStop(1, "#000");
  ctx.fillStyle = grd;
  ctx.fillRect(0, 0, width, height);

  // Draw targets (fixed PD-style buttons)
  const targetRadius = Math.min(width, height) * 0.06;

  for (let i = 0; i < LANES.length; i++) {
    const lane = LANES[i];
    const tpos = TARGETS[i];

    // outer ring
    ctx.lineWidth = 4;
    ctx.strokeStyle = lane.color;
    ctx.beginPath();
    ctx.arc(tpos.x, tpos.y, targetRadius, 0, Math.PI * 2);
    ctx.stroke();

    // inner fill
    ctx.fillStyle = "rgba(0,0,0,0.6)";
    ctx.beginPath();
    ctx.arc(tpos.x, tpos.y, targetRadius * 0.7, 0, Math.PI * 2);
    ctx.fill();

    // direction / WASD label
    ctx.fillStyle = lane.color;
    ctx.font = `${Math.floor(targetRadius * 0.7)}px Arial`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(lane.dirChar, tpos.x, tpos.y);
  }

  // Draw flying notes
  const noteRadius = targetRadius * 0.6;

  for (const note of notes) {
    const dt = note.time - songTime; // seconds until hit
    const t = 1 - dt / APPROACH_TIME; // 0 (spawn) → 1 (at target)

    if (t < 0 || t > 1.5) continue; // not visible yet or far past

    const laneIndex = note.lane;
    const spawn = SPAWNS[laneIndex];
    const target = TARGETS[laneIndex];

    const x = lerp(spawn.x, target.x, t);
    const y = lerp(spawn.y, target.y, t);

    // fade after hit/miss
    let alpha = 1.0;
    if (note.judged && !note.hit) alpha = 0.2;
    if (note.hit) alpha = 0.5; // after you hit it, it fades

    ctx.globalAlpha = alpha;
    ctx.fillStyle = LANES[laneIndex].color;
    ctx.beginPath();
    ctx.arc(x, y, noteRadius, 0, Math.PI * 2);
    ctx.fill();

    // small icon inside
    ctx.fillStyle = "#000";
    ctx.font = `${Math.floor(noteRadius)}px Arial`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(LANES[laneIndex].dirChar, x, y);
    ctx.globalAlpha = 1.0;
  }

  // HUD: score + combo
  ctx.fillStyle = "#fff";
  ctx.font = "20px Arial";
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillText("Score: " + score, 20, 30);
  ctx.fillText("Combo: " + combo, 20, 60);

  // last hit feedback in center
  const timeSinceHit = songTime - lastHitTime;
  if (timeSinceHit < 0.5 && lastHitText) {
    ctx.fillStyle = "#fff";
    ctx.font = "32px Arial";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(lastHitText, width / 2, height * 0.2);
  }
}