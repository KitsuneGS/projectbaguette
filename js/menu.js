// Project Baguette - Menu (osu!-ish left list)
// UI is dumb: selection + calling PBEngine.setSong / start.

(() => {
  const songs = [
    {
      id: "demo",
      title: "Demo Song",
      artist: "Project Baguette",
      bpm: 120,
      audio: "assets/defaults/song-demo.mp3",
      mv: "assets/defaults/mv-default.mp4",
      diffs: ["Normal"]
    },
  ];

  let filterText = "";
  let filtered = [...songs];
  let songIndex = 0;
  let diffIndex = 0;

  const elRoot = document.getElementById("menu-root");
  const elList = document.getElementById("songList");
  const elSearch = document.getElementById("search");
  const elTitle = document.getElementById("songTitle");
  const elArtist = document.getElementById("songArtist");
  const elBpm = document.getElementById("songBpm");
  const elDiff = document.getElementById("songDiff");
  const elDiffButtons = document.getElementById("diffButtons");
  const btnStart = document.getElementById("btnStart");

  function clamp(n,a,b){ return Math.max(a, Math.min(b,n)); }

  function applyFilter() {
    const q = filterText.trim().toLowerCase();
    filtered = songs.filter(s =>
      s.title.toLowerCase().includes(q) || s.artist.toLowerCase().includes(q)
    );
    songIndex = clamp(songIndex, 0, Math.max(0, filtered.length - 1));
    diffIndex = 0;
  }

  function getSong() { return filtered[songIndex] || null; }

  function renderList() {
    elList.innerHTML = "";
    if (filtered.length === 0) {
      elList.innerHTML = `<div class="p-4 text-sm text-white/60">No matches.</div>`;
      return;
    }

    filtered.forEach((s, idx) => {
      const isSel = idx === songIndex;
      const btn = document.createElement("button");
      btn.className =
        "w-full text-left rounded-xl px-3 py-3 mb-2 border transition " +
        (isSel ? "bg-white/10 border-white/30" : "bg-white/0 border-white/10 hover:bg-white/5 hover:border-white/20");

      btn.innerHTML = `
        <div class="flex items-center justify-between gap-2">
          <div class="min-w-0">
            <div class="font-semibold truncate">${escapeHtml(s.title)}</div>
            <div class="text-xs text-white/60 truncate">${escapeHtml(s.artist)}</div>
          </div>
          <div class="text-xs text-white/50 shrink-0">${s.bpm ? s.bpm + " BPM" : ""}</div>
        </div>
      `;
      btn.addEventListener("click", () => { songIndex = idx; diffIndex = 0; sync(true); });
      elList.appendChild(btn);
    });

    const selEl = elList.children[songIndex];
    if (selEl?.scrollIntoView) selEl.scrollIntoView({ block: "nearest" });
  }

  function renderDiffs(song) {
    elDiffButtons.innerHTML = "";
    if (!song) return;
    const diffs = song.diffs || ["Normal"];
    diffIndex = clamp(diffIndex, 0, diffs.length - 1);

    diffs.forEach((d, idx) => {
      const isSel = idx === diffIndex;
      const b = document.createElement("button");
      b.className =
        "px-3 py-2 rounded-xl border text-sm transition " +
        (isSel
          ? "bg-emerald-500/90 border-emerald-300 text-slate-950 font-bold"
          : "bg-white/5 border-white/10 hover:bg-white/10 hover:border-white/20 text-white");
      b.textContent = d;
      b.addEventListener("click", () => { diffIndex = idx; sync(false); });
      elDiffButtons.appendChild(b);
    });
  }

  function sync(rerenderList) {
    const song = getSong();
    if (!song) return;

    const diffs = song.diffs || ["Normal"];
    const diff = diffs[diffIndex] || diffs[0] || "Normal";

    elTitle.textContent = song.title;
    elArtist.textContent = song.artist;
    elBpm.textContent = song.bpm ? String(song.bpm) : "—";
    elDiff.textContent = diff;

    renderDiffs(song);
    if (rerenderList) renderList();

    window.PB_MENU_STATE = { bpm: song.bpm || 120, diffIndex };

    if (window.PBEngine?.setSong) window.const base = new URL(".", location.href); PBEngine.setSong(   new URL(song.audio, base).toString(),   new URL(song.mv, base).toString() );
  }

  function start() {
    elRoot.style.display = "none";
    document.getElementById("game-root").style.display = "block";

    window.PBEngine?.start?.().catch?.((e) => {
      console.warn("Start blocked:", e);
      elRoot.style.display = "flex";
      alert("Click Start again — browser blocked audio.");
    });
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[c]));
  }

  elSearch.addEventListener("input", () => {
    filterText = elSearch.value;
    applyFilter();
    sync(true);
  });

  document.addEventListener("keydown", (e) => {
    const key = e.key;
    if (document.activeElement === elSearch && key !== "Escape") return;

    if (key === "ArrowDown") { songIndex = clamp(songIndex + 1, 0, Math.max(0, filtered.length - 1)); diffIndex = 0; sync(true); e.preventDefault(); }
    else if (key === "ArrowUp") { songIndex = clamp(songIndex - 1, 0, Math.max(0, filtered.length - 1)); diffIndex = 0; sync(true); e.preventDefault(); }
    else if (key === "ArrowRight") { diffIndex = clamp(diffIndex + 1, 0, Math.max(0, (getSong()?.diffs?.length || 1) - 1)); sync(false); e.preventDefault(); }
    else if (key === "ArrowLeft") { diffIndex = clamp(diffIndex - 1, 0, Math.max(0, (getSong()?.diffs?.length || 1) - 1)); sync(false); e.preventDefault(); }
    else if (key === "Enter") { start(); e.preventDefault(); }
    else if (key === "Escape") { elSearch.focus(); e.preventDefault(); }
  });

  btnStart.addEventListener("click", start);

  applyFilter();
  sync(true);
})();
