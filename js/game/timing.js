export let BPM = 120;
export let BEAT = 60 / BPM;
export const beatTimes = [];
let autoChartReady = false;

export function getSongTime() {
  return document.getElementById("song").currentTime || 0;
}

export function setAutoChartReady(v) {
  autoChartReady = v;
}

export function isAutoChartReady() {
  return autoChartReady;
}

export function setBPM(v) {
  BPM = v;
  BEAT = 60 / BPM;
}
