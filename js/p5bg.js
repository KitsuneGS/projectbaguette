// Project Baguette - p5 background for menu (behind Tailwind UI)
(() => {
  if (typeof p5 === "undefined") return;

  new p5((p) => {
    let t = 0;

    p.setup = () => {
      const holder = document.getElementById("bg-canvas-holder");
      const cnv = p.createCanvas(holder.clientWidth, holder.clientHeight);
      cnv.parent(holder);
      p.noStroke();
    };

    p.windowResized = () => {
      const holder = document.getElementById("bg-canvas-holder");
      p.resizeCanvas(holder.clientWidth, holder.clientHeight);
    };

    p.draw = () => {
      t += 0.01;

      const st = window.PB_MENU_STATE || { bpm: 120, diffIndex: 0 };
      const bpm = st.bpm || 120;
      const pulse = (p.sin((p.millis() / 1000) * (bpm / 60) * p.TWO_PI) + 1) * 0.5;

      p.background(10, 12, 20);

      const w = p.width, h = p.height;
      const layers = 18;

      for (let i = 0; i < layers; i++) {
        const k = i / layers;
        const x = w * (0.5 + 0.35 * p.sin(t * (0.7 + k) + i));
        const y = h * (0.5 + 0.25 * p.cos(t * (0.9 + k) - i * 0.7));
        const r = (120 + 280 * k) * (0.8 + 0.35 * pulse);

        p.fill(255, 255, 255, 10 + 25 * (1 - k));
        p.circle(x, y, r);
      }

      const bandY = h * (0.15 + 0.12 * (st.diffIndex || 0));
      p.fill(255, 255, 255, 18);
      p.rect(0, bandY, w, h * 0.06);
    };
  }, document.getElementById("bg-canvas-holder"));
})();
