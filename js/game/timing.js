// Global timing data
export let bpmChanges = []; // array of { time, bpm, beatLength }

export function addBpmChange(time, bpm) {
  bpmChanges.push({
    time,
    bpm,
    beatLength: 60 / bpm
  });
  bpmChanges.sort((a, b) => a.time - b.time);
}

export function resetChartTiming() {
  bpmChanges = [];
}

// Return BPM at a given song time
export function getBpmAt(t) {
  if (bpmChanges.length === 0) return null;
  let curr = bpmChanges[0];
  for (let b of bpmChanges) {
    if (b.time <= t) curr = b;
    else break;
  }
  return curr;
}
