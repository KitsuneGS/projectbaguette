// js/game/audio.js
//
// Handles: AudioContext, decoding, BPM estimation, auto-chart beat detection
//

export let audio = document.getElementById("song");
export let mv = document.getElementById("mv");

export let audioCtx = null;
export let analyser = null;

export let BPM = 120;          // default fallback (will update)
export let BEAT = 60 / BPM;    // derived — do not edit manually

export let beatTimes = [];     // generated chart times (seconds)
export let autoChartReady = false;

// allow other modules to update BPM cleanly
export function setBPM(value) {
  BPM = value;
  BEAT = 60 / BPM;
}

// -------------------------------------------------------------------
// 🎵 AUTO-CHART GENERATOR (no node, no ffmpeg)
// -------------------------------------------------------------------
export async function prepareAutoChart() {
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
    const decoded = await audioCtx.decodeAudioData(buf);

    const channel = decoded.getChannelData(0);
    const sr = decoded.sampleRate;
    const frame = 1024;
    const hop = 512;

    const energies = [];
    for (let i = 0; i + frame < channel.length; i += hop) {
      let sum = 0;
      for (let j = 0; j < frame; j++) sum += channel[i + j] ** 2;
      energies.push(Math.sqrt(sum / frame));
    }

    // detect peaks
    const mean = energies.reduce((a, b) => a + b, 0) / energies.length;
    const threshold = mean * 1.25;
    const minGap = 0.23;
    let lastBeat = -999;

    beatTimes = []; // reset
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

    // fallback
    if (beatTimes.length < 4) {
      for (let t = 0; t < decoded.duration; t += 0.5) beatTimes.push(t);
    }

    // auto-BPM estimation (use average delta)
    const deltas = [];
    for (let i = 1; i < beatTimes.length; i++) deltas.push(beatTimes[i] - beatTimes[i - 1]);
    const avg = deltas.reduce((a, b) => a + b, 0) / deltas.length;
    if (avg > 0) setBPM(60 / avg);

    autoChartReady = true;
    return true;
  } catch (err) {
    console.warn("Auto-chart failed, using fallback:", err);
    autoChartReady = true;
    return false;
  }
}
