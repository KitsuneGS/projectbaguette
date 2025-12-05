// js/game/audio.js
import { setBPM } from "./timing.js";
import { beatTimes } from "./notes.js";

export let audioCtx = null;
export let analyser = null;

async function inferBPM() {
  if (beatTimes.length < 2) return;

  const intervals = [];
  for (let i = 1; i < Math.min(beatTimes.length, 16); i++) {
    intervals.push(beatTimes[i] - beatTimes[i - 1]);
  }

  const avg = intervals.reduce((a, b) => a + b, 0) / intervals.length;
  const bpm = Math.round(60 / avg);

  if (!isFinite(bpm)) return;

  setBPM(bpm);
  console.log(`🔢 Auto BPM detected: ${bpm}`);
}

export async function prepareAutoChart() {
  const audio = document.getElementById("song");
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!audioCtx) audioCtx = new AC();

  const src = audioCtx.createMediaElementSource(audio);
  analyser = audioCtx.createAnalyser();
  analyser.fftSize = 2048;
  src.connect(analyser);
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

    const minGap = 0.23;
    let lastBeat = -999;

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

    // Fallback if chart is empty
    if (beatTimes.length < 4) {
      console.warn("Sparse auto-chart → fallback");
      for (let t = 0; t < dec.duration; t += 0.5) beatTimes.push(t);
    }

    await inferBPM();

  } catch (e) {
    console.error("Auto-chart decode fail:", e);
    for (let t = 0; t < 120; t += 0.5) beatTimes.push(t);
  }
}
