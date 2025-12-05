// js/main.js
import { BASE } from "/js/base.js";

// Load modules relative to BASE
await import(`${BASE}/js/game/core.js`);
await import(`${BASE}/js/game/time.js`);
await import(`${BASE}/js/game/audio.js`);
await import(`${BASE}/js/game/notes.js`);
await import(`${BASE}/js/game/input.js`);
await import(`${BASE}/js/game/judge.js`);
await import(`${BASE}/js/game/particles.js`);
await import(`${BASE}/js/game/render.js`);
await import(`${BASE}/js/game/loop.js`);
await import(`${BASE}/js/game/start.js`);
