// js/game/audio.js
import { BASE } from "/js/base.js";

export let audioCtx = null;
export let analyser = null;
export let beatTimes = [];
export let autoChartReady = false;

// Target elements
export const audio = document.getElementById("song");
export const mv = document.getElementById("mv");

// Force correct sources in both localhost and GitHub Pages
audio.src = `${BASE}/assets/defaults/song-demo.mp3`;
mv.src       = `${BASE}/assets/defaults/mv-default.mp4`;

// Auto-beat extractor + MV rules
export async function prepareAutoChart() {
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!audioCtx) audioCtx = new AC();

  const src = audioCtx.createMediaElementSource(audio);
  analyser = audioCtx.createAnalyser();
  analyser.fftSize = 2048;

  // Ensure audio plays to speakers
  src.connect(analyser);
  analyser.connect(audioCtx.destination);

  try {
    const resp = await fetch(audio.src);
    const buf = await resp.arrayBuffer();
    const dec = await audioCtx.decodeAudioData(buf);

    const ch = dec.getChannelData(0);
    const sr = dec.sampleRate;

    const frame = 1024;
    const hop   = 512;

    const energies = [];
    for (let i = 0; i + frame < ch.length; i += hop) {
      let sum = 0;
      for (let j = 0; j < frame; j++) sum += ch[i + j] ** 2;
      energies.push(Math.sqrt(sum / frame));
    }

    let avg = energies.reduce((a,b)=>a+b,0) / energies.length;
    let threshold = avg * 1.25;
    let last = -999;
    const minGap = 0.23;

    beatTimes.length = 0; // clear
    for (let i = 1; i < energies.length - 1; i++) {
      const e = energies[i];
      if (e > threshold && e > energies[i-1] && e > energies[i+1]) {
        const t = (i * hop) / sr;
        if (t - last >= minGap) {
          beatTimes.push(t);
          last = t;
        }
      }
    }

    if (beatTimes.length < 4) {
      console.warn("Auto-chart weak → fallback beats");
      for (let t = 0; t < dec.duration; t += 0.5) beatTimes.push(t);
    }

    autoChartReady = true;
  } catch (err) {
    console.error("Auto-chart decode FAILURE:", err);
    for (let t = 0; t < 120; t += 0.5) beatTimes.push(t);
    autoChartReady = true;
  }
}
