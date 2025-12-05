////////////////////////////////////////////////////////////
// AUDIO + MV LOADER (GitHub Pages Safe)
////////////////////////////////////////////////////////////

// Expose DOM elements to the rest of the engine
export const audio = document.getElementById("song");
export const mv    = document.getElementById("mv");

// Remove any hard-coded <source> paths (if the HTML had them)
audio.removeAttribute("src");
mv.removeAttribute("src");

// Base path — GitHub Pages vs local dev
const BASE = location.hostname.includes("github.io") ? "/projectbaguette" : "";

// Assign real media paths
audio.src = `${BASE}/assets/defaults/song-demo.mp3`;
mv.src    = `${BASE}/assets/defaults/mv-default.mp4`;

// Global audio context (shared)
export let audioCtx = null;
export let analyser = null;

// Will be filled by auto-chart
export let beatTimes = [];
export let autoChartReady = false;


////////////////////////////////////////////////////////////
// SAFARI / MOBILE AUDIO UNLOCK
////////////////////////////////////////////////////////////

export async function unlockAudioContext() {
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!audioCtx) audioCtx = new AC();

  if (audioCtx.state === "suspended") {
    try { await audioCtx.resume(); }
    catch (e) { console.warn("AudioContext resume failed:", e); }
  }
}


////////////////////////////////////////////////////////////
// AUTO-CHART (MP3 Safe Beat Detection)
////////////////////////////////////////////////////////////

export async function prepareAutoChart() {
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!audioCtx) audioCtx = new AC();

  // Create analyser chain
  const src = audioCtx.createMediaElementSource(audio);
  analyser = audioCtx.createAnalyser();
  analyser.fftSize = 2048;

  src.connect(analyser);
  analyser.connect(audioCtx.destination);

  try {
    // Fetch MP3 as array buffer
    const resp = await fetch(audio.src);
    const buf = await resp.arrayBuffer();

    // Decode audio
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
