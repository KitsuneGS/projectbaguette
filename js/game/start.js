// js/game/start.js
import { startOverlay, mv, audio } from "./core.js";
import { ensureAudioContextRunning, prepareAutoChart } from "./audio.js";
import { startLoop } from "./loop.js";

// Handle user tap to begin
startOverlay.addEventListener("click", async () => {
  startOverlay.style.transition = "opacity 0.4s ease";
  startOverlay.style.opacity = "0";
  setTimeout(() => startOverlay.remove(), 450);

  await ensureAudioContextRunning();

  try {
    await prepareAutoChart();
  } catch (e) {
    console.warn("Auto-chart early fail:", e);
  }

  try {
    await audio.play();
  } catch {
    alert("Tap again — Safari blocked audio.");
    return;
  }

  // MV sync + fade in
  const showMV = () => {
    mv.style.display = "block";
    requestAnimationFrame(() => (mv.style.opacity = "1"));

    try {
      mv.currentTime = 0;
      mv.play().catch(err => console.warn("MV blocked:", err));
    } catch (err) {}
  };

  if (mv.readyState >= 2) showMV();
  else mv.addEventListener("loadeddata", showMV, { once: true });

  startLoop();
});
