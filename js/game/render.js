/* Project Baguette — render.js (full, patched)
   Provides:
   • Ghost rings
   • Trails + notes
   • Hit & miss effects
   • Particle rendering
   • Floating lane labels on notes
   • Floating hit text above circles (COOL/FINE/MISS)
*/

////////////////////////////////////////////////////////////
// IMPORTS (game shared vars)
////////////////////////////////////////////////////////////


export let width = window.innerWidth;
export let height = window.innerHeight;
export const canvas = document.getElementById("game");
export const ctx = canvas.getContext("2d");

canvas.width = width;
canvas.height = height;
window.addEventListener("resize", () => {
  width = window.innerWidth;
  height = window.innerHeight;
  canvas.width = width;
  canvas.height = height;
});

const isMobile = /iPhone|iPad|Android/i.test(navigator.userAgent);
export const BASE_R_SCALE = isMobile ? 0.10 : 0.045;


////////////////////////////////////////////////////////////
// ANIMATION METRICS
////////////////////////////////////////////////////////////
let fps = 0;
let lastFrame = performance.now();
let beatPulse = 1;


// === NEW: floating hit text location/color ===
let lastHitX = 0;
let lastHitY = 0;
let lastHitColor = "#fff";

export function setHitDisplay(x, y, color) {
  lastHitX = x;
  lastHitY = y;
  lastHitColor = color;
}


////////////////////////////////////////////////////////////
// RENDER MAIN LOOP
////////////////////////////////////////////////////////////
export function draw(t, beat, DEBUG = false) {
  ctx.clearRect(0, 0, width, height);

  // background pulse haze
  ctx.fillStyle = "rgba(0,0,0,0.22)";
  ctx.fillRect(0,0,width,height);

  const r = Math.min(width, height) * BASE_R_SCALE;

  ////////////////////////////////////////////////////////////
  // 1) GHOST TARGETS
  ////////////////////////////////////////////////////////////
  for (const n of notes) {
    ctx.save();

    ctx.globalAlpha = 0.18 + beat * 0.22;
    ctx.strokeStyle = LANES[n.lane].color;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(n.targetX, n.targetY, r * 0.9, 0, Math.PI * 2);
    ctx.stroke();

    ctx.globalAlpha = 0.05 + 0.10 * beat;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(n.targetX, n.targetY, r * (0.7 + 0.3 * beat), 0, Math.PI * 2);
    ctx.stroke();

    ctx.restore();
  }

  ////////////////////////////////////////////////////////////
  // 2) NOTES & HIT/MISS EFFECTS
  ////////////////////////////////////////////////////////////
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
      ctx.globalAlpha = 0.25 + 0.15 * beat;
      ctx.strokeStyle = LANES[n.lane].color;
      ctx.lineWidth = 10;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(x - nx * 130, y - ny * 130);
      ctx.lineTo(x, y);
      ctx.stroke();
      ctx.restore();

      // Body + key label
      ctx.save();
      ctx.fillStyle = "rgba(255,255,255,0.9)";
      ctx.strokeStyle = LANES[n.lane].color;
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = LANES[n.lane].color;
      ctx.font = `${r * 1.2}px Arial Black`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(LANES[n.lane].label, x, y + r * 0.05);
      ctx.restore();
    }

    else {
      const age = t - n.effectTime;

      if (n.effect === "hit" && age <= 0.4) {
        ctx.save();
        const p = age / 0.4;
        ctx.globalAlpha = 1 - p;
        ctx.fillStyle = LANES[n.lane].color;
        ctx.beginPath();
        ctx.arc(n.targetX, n.targetY, r * (1 + p * 2.2), 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      else if (n.effect === "miss" && age <= 0.6) {
        const shake = Math.sin(age * 14 * Math.PI * 2 + n.shakeSeed) * 10;
        ctx.globalAlpha = 1 - age / 0.6;
        ctx.save();
        ctx.fillStyle = "rgba(255,255,255,0.9)";
        ctx.strokeStyle = LANES[n.lane].color;
        ctx.lineWidth = 6;
        ctx.beginPath();
        ctx.arc(n.targetX + shake, n.targetY + age * 220, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.restore();
        ctx.globalAlpha = 1;
      }
    }
  }

  ////////////////////////////////////////////////////////////
  // 3) PARTICLES
  ////////////////////////////////////////////////////////////
  for (let p of particles) {
    p.life -= 1/60;
    p.x += p.vx / 60;
    p.y += p.vy / 60;

    ctx.globalAlpha = Math.max(0, p.life / 0.4) * (0.5 + 0.5 * beat);
    ctx.fillStyle = p.color;
    ctx.fillRect(p.x, p.y, 4, 4);
  }
  particles = particles.filter(p => p.life > 0);
  ctx.globalAlpha = 1;

  ////////////////////////////////////////////////////////////
  // 4) HUD NUMBERS
  ////////////////////////////////////////////////////////////
  ctx.fillStyle = "#fff";
  ctx.font = "18px Arial";
  ctx.textAlign = "left";
  ctx.fillText("Project Baguette", 20, 30);
  ctx.fillText("Score: " + score, 20, 55);
  ctx.fillText("Combo: " + combo, 20, 80);

  ////////////////////////////////////////////////////////////
  // 5) FLOATING HIT TEXT ABOVE CIRCLE (NEW)
  ////////////////////////////////////////////////////////////
  if (t - lastHitTime < 0.55 && lastHitText && lastHitX !== undefined) {
    const age = t - lastHitTime;
    const p = age / 0.55;
    const yOffset = -40 * p;

    ctx.save();
    ctx.globalAlpha = 1 - p;

    ctx.fillStyle = lastHitColor || "#fff";
    ctx.font = `bold ${Math.min(width,height) * 0.045}px Arial Black`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(lastHitText, lastHitX, lastHitY + yOffset);

    ctx.restore();
  }

  ////////////////////////////////////////////////////////////
  // 6) DEBUG
  ////////////////////////////////////////////////////////////
  if (DEBUG) {
    ctx.fillStyle = "rgba(0,0,0,0.6)";
    ctx.fillRect(width - 200, 10, 180, 100);

    ctx.fillStyle = "#0f0";
    ctx.font = "14px monospace";
    ctx.textAlign = "left";
    ctx.fillText(`FPS: ${fps.toFixed(1)}`, width - 190, 30);
    ctx.fillText(`Time: ${t.toFixed(3)}s`, width - 190, 50);
    ctx.fillText(`Notes: ${notes.length}`, width - 190, 70);
  }
}


////////////////////////////////////////////////////////////
// LERP (shared)
////////////////////////////////////////////////////////////
function lerp(a, b, t) { return a + (b - a) * t; }


////////////////////////////////////////////////////////////
// FPS LOOP HELPER
////////////////////////////////////////////////////////////
export function trackFPS() {
  const now = performance.now();
  fps = 1000 / (now - lastFrame);
  lastFrame = now;
}
