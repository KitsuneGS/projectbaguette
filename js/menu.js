// Project Baguette - Menu (osu!-ish left list)
// Loads songs from songs.json if present; falls back to demo.
// Displays real metadata + difficulty buttons (PD-style labels).

(() => {
  function assetUrl(relPath) {
    const clean = String(relPath).replace(/^\/+/,""); // strip accidental leading '/'
    const base = new URL(".", location.href);          // folder containing index.html
    return new URL(clean, base).toString();
  }

  const FALLBACK_SONGS = [
    {
      id: "demo",
      title: "Demo Song",
      artist: "Project Baguette",
      bpm: 120,
      audio: "assets/defaults/song-demo.mp3",
      mv: "assets/defaults/mv-default.mp4",
      charts: { Easy: 2, Normal: 5, Hard: 8, Extreme: 10 }
    },
  ];

  let songs = [...FALLBACK_SONGS];
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

  function getDiffList(song) {
    if (song?.charts && typeof song.charts === "object") return Object.keys(song.charts);
    if (Array.isArray(song?.diffs) && song.diffs.length) return song.diffs;
    return ["Normal"];
  }

  function diffLabel(song, d) {
    const v = song?.charts?.[d];
    return (typeof v === "number") ? `${d} • ${v}` : d;
  }

  async function loadSongsJson() {
    try {
      const res = await fetch(assetUrl("songs.json"), { cache: "no-store" });
      if (!res.ok) throw new Error("songs.json HTTP " + res.status);
      const data = await res.json();
      if (Array.isArray(data) && data.length) {
        songs = data;
      } else {
        console.warn("songs.json empty/invalid → using fallback");
      }
    } catch (e) {
      console.warn("songs.json missing → using fallback", e);
    }
  }

  function applyFilter() {
    const q = filterText.trim().toLowerCase();
    filtered = songs.filter(s =>
      String(s.title || "").toLowerCase().includes(q) ||
      String(s.artist || "").toLowerCase().includes(q)
    );
    songIndex = clamp(songIndex, 0, Math.max(0, filtered.length - 1));
    diffIndex = 0;
  }

  function getSong(){ return filtered[songIndex] || null; }

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
        "w-full text-left rounded-xl px-3 py-2 mb-2 border transition " +
        (isSel ? "bg-white/10 border-white/25" : "bg-white/0 border-white/10 hover:bg-white/5 hover:border-white/20");

      btn.innerHTML = `
        <div class="flex items-center justify-between gap-2">
          <div class="min-w-0">
            <div class="font-semibold truncate">${escapeHtml(s.title ?? "Untitled")}</div>
            <div class="text-xs text-white/60 truncate">${escapeHtml(s.artist ?? "Unknown Artist")}</div>
          </div>
          <div class="text-xs text-white/50 shrink-0">${s.bpm ? escapeHtml(String(s.bpm)+" BPM") : ""}</div>
        </div>
      `;

      btn.addEventListener("click", () => {
        songIndex = idx;
        diffIndex = 0;
        sync(true);
      });

      elList.appendChild(btn);
    });

    elList.children[songIndex]?.scrollIntoView?.({ block: "nearest" });
  }

  function renderDiffs(song) {
    elDiffButtons.innerHTML = "";
    if (!song) return;
    const diffs = getDiffList(song);
    diffIndex = clamp(diffIndex, 0, diffs.length - 1);

    diffs.forEach((d, idx) => {
      const isSel = idx === diffIndex;
      const b = document.createElement("button");
      b.className =
        "px-3 py-2 rounded-xl border text-sm transition " +
        (isSel
          ? "bg-emerald-500/90 border-emerald-300 text-slate-950 font-bold"
          : "bg-white/5 border-white/10 hover:bg-white/10 hover:border-white/20 text-white");
      b.textContent = diffLabel(song, d);
      b.addEventListener("click", () => { diffIndex = idx; sync(false); });
      elDiffButtons.appendChild(b);
    });
  }

  function sync(rerenderList) {
    const song = getSong();
    if (!song) return;

    const diffs = getDiffList(song);
    const diffName = diffs[diffIndex] || diffs[0] || "Normal";

    elTitle.textContent = song.title ?? "Untitled";
    elArtist.textContent = song.artist ?? "Unknown Artist";
    elBpm.textContent = song.bpm ? String(song.bpm) : "—";
    elDiff.textContent = diffLabel(song, diffName);

    renderDiffs(song);
    if (rerenderList) renderList();

    window.PB_MENU_STATE = { bpm: song.bpm || 120, diffIndex };

    if (window.PBEngine?.setSong) {
      window.PBEngine.setSong(assetUrl(song.audio), assetUrl(song.mv));
    }
    if (window.PBEngine?.setDifficulty) {
      window.PBEngine.setDifficulty(diffName);
    }
  }

  function start() {
    elRoot.style.display = "none";
    document.getElementById("game-root").style.display = "block";
    window.PB_BG_STOP?.();

    window.PBEngine?.start?.().catch?.((e) => {
      console.warn("Start blocked:", e);
      elRoot.style.display = "flex";
      document.getElementById("game-root").style.display = "none";
      window.PB_BG_START?.();
      alert("Click Start again — browser blocked audio.");
    });
  }

  function escapeHtml(s){
    return String(s).replace(/[&<>"']/g, (c) => ({
      "&":"&amp;", "<":"&lt;", ">":"&gt;", """:"&quot;", "'":"&#39;"
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
    else if (key === "ArrowRight") { diffIndex = clamp(diffIndex + 1, 0, getDiffList(getSong()).length - 1); sync(false); e.preventDefault(); }
    else if (key === "ArrowLeft") { diffIndex = clamp(diffIndex - 1, 0, getDiffList(getSong()).length - 1); sync(false); e.preventDefault(); }
    else if (key === "Enter") { start(); e.preventDefault(); }
    else if (key === "Escape") { elSearch.focus(); e.preventDefault(); }
  });

  btnStart.addEventListener("click", start);

  (async () => {
    await loadSongsJson();
    applyFilter();
    sync(true);
    window.PB_BG_START?.();
  })();
})();