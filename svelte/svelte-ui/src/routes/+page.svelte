<script lang="ts">
  // High-level UI state
  type Phase = "splash" | "player-select" | "main-menu" | "song-select";

  let phase: Phase = "splash";

  // Very simple local profile system for now.
  type Profile = {
    id: string;
    name: string;
    avatarColor: string;
  };

  let profiles: Profile[] = [
    { id: "guest", name: "Guest", avatarColor: "#ff9fbf" },
    { id: "player1", name: "Player 1", avatarColor: "#9fdfff" }
  ];

  let selectedProfile: Profile | null = null;
  let showAddProfileModal = false;

  // Song list for the Rhythm Game screen
  type Song = {
    id: string;
    title: string;
    artist: string;
    duration: string;
    isImported: boolean;
  };

  let songs: Song[] = [
    {
      id: "demo-1",
      title: "Overclocked",
      artist: "DryftIN",
      duration: "2:58",
      isImported: false
    },
    {
      id: "demo-2",
      title: "Demo Track B",
      artist: "Project Baguette",
      duration: "2:30",
      isImported: false
    }
  ];

  let selectedSongId: string | null = null;

  function handleSplashTap() {
    phase = "player-select";
  }

  function selectProfile(profile: Profile) {
    selectedProfile = profile;
    phase = "main-menu";
  }

  function openAddProfile() {
    showAddProfileModal = true;
  }

  function closeAddProfile() {
    showAddProfileModal = false;
  }

  function fakeGoogleSignIn() {
    // Placeholder: here you'd trigger "Sign in with Google".
    const newProfile: Profile = {
      id: `google-${Date.now()}`,
      name: "Google Player",
      avatarColor: "#c0a8ff"
    };
    profiles = [...profiles, newProfile];
    selectedProfile = newProfile;
    showAddProfileModal = false;
    phase = "main-menu";
  }

  function goToRhythmGameMenu() {
    phase = "song-select";
  }

  function backToMainMenu() {
    phase = "main-menu";
  }

  function handleSongClick(song: Song) {
    selectedSongId = song.id;
    // Later: transition into canvas rhythm engine with this song
    console.log("Selected song:", song);
  }

  function handleSongImport(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    if (!input.files) return;

    const files = Array.from(input.files);
    files.forEach((file) => {
      const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
      const allowed = ["mp3", "ogg", "wav", "flac"];

      if (!allowed.includes(ext)) {
        console.warn("Skipped unsupported file:", file.name);
        return;
      }

      const id = `import-${Date.now()}-${file.name}`;
      const newSong: Song = {
        id,
        title: file.name.replace(/\.[^.]+$/, ""),
        artist: "Imported",
        duration: "--:--",
        isImported: true
      };

      songs = [...songs, newSong];

      // You can stash URL.createObjectURL(file) somewhere later
      console.log("Imported song file:", file);
    });

    // Reset input so re-uploading same file works
    input.value = "";
  }
</script>

<!-- ROOT CONTAINER -->
<div class="app-root">
  <div class="bg-orbit"></div>
  <div class="bg-orbit orbit-2"></div>
  <div class="bg-noise"></div>

  {#if phase === "splash"}
    <!-- SPLASH / TAP TO START -->
    <section class="screen screen-center">
      <div class="logo-lockup" on:click={handleSplashTap}>
        <div class="logo-pill">
          <span class="logo-dot" />
          <span class="logo-text-main">Project Baguette</span>
        </div>
        <p class="logo-sub">rhythm / mv / vibes</p>
        <button class="tap-button">
          <span>Tap to Start</span>
        </button>
      </div>
      <p class="hint">(WASD · Mouse · Touch · Controller later)</p>
    </section>

  {:else if phase === "player-select"}
    <!-- PLAYER SELECT -->
    <section class="screen">
      <header class="top-bar">
        <div class="top-left">
          <h1 class="title">Who’s playing today?</h1>
          <p class="subtitle">Pick a profile or add a new one.</p>
        </div>
      </header>

      <div class="grid profiles-grid">
        {#each profiles as profile}
          <button class="card profile-card" on:click={() => selectProfile(profile)}>
            <div class="avatar" style={`background:${profile.avatarColor}`}>
              {profile.name.charAt(0).toUpperCase()}
            </div>
            <div class="profile-info">
              <div class="profile-name">{profile.name}</div>
              <div class="profile-meta">Local save · Rhythm level 1</div>
            </div>
          </button>
        {/each}

        <!-- Add profile -->
        <button class="card profile-card add-card" on:click={openAddProfile}>
          <div class="avatar avatar-add">+</div>
          <div class="profile-info">
            <div class="profile-name">Add player</div>
            <div class="profile-meta">Sign in with Google</div>
          </div>
        </button>
      </div>

      {#if showAddProfileModal}
        <div class="modal-backdrop" on:click={closeAddProfile}>
          <div class="modal" on:click|stopPropagation>
            <h2>Connect an account</h2>
            <p class="modal-text">
              For now this is a mock. Later this button will use real Google Sign-In.
            </p>
            <button class="google-btn" on:click={fakeGoogleSignIn}>
              <span class="g-logo">G</span>
              <span>Sign in with Google</span>
            </button>
            <button class="ghost-btn" on:click={closeAddProfile}>Cancel</button>
          </div>
        </div>
      {/if}
    </section>

  {:else if phase === "main-menu"}
    <!-- MAIN MENU -->
    <section class="screen">
      <header class="top-bar">
        <div class="top-left">
          <h1 class="title">Hi, {selectedProfile?.name ?? "Player"}.</h1>
          <p class="subtitle">What do you want to do?</p>
        </div>
        <div class="top-right">
          <div
            class="mini-avatar"
            style={`background:${selectedProfile?.avatarColor ?? "#ff9fbf"}`}
          >
            {selectedProfile?.name.charAt(0).toUpperCase() ?? "P"}
          </div>
        </div>
      </header>

      <div class="menu-list">
        <button class="menu-item primary" on:click={goToRhythmGameMenu}>
          <div class="menu-label">
            <span class="menu-title">Rhythm Game</span>
            <span class="menu-sub">Tap notes · auto charts · MV background</span>
          </div>
          <span class="menu-arrow">›</span>
        </button>

        <button class="menu-item">
          <div class="menu-label">
            <span class="menu-title">My Songs</span>
            <span class="menu-sub">Manage imports, favorites, and charts</span>
          </div>
          <span class="menu-arrow">›</span>
        </button>

        <button class="menu-item">
          <div class="menu-label">
            <span class="menu-title">Customization</span>
            <span class="menu-sub">Layouts, skins, pastel chaos</span>
          </div>
          <span class="menu-arrow">›</span>
        </button>

        <button class="menu-item">
          <div class="menu-label">
            <span class="menu-title">Idle RPG</span>
            <span class="menu-sub">Coming soon: tap to grind baguette XP</span>
          </div>
          <span class="menu-arrow">›</span>
        </button>

        <button class="menu-item">
          <div class="menu-label">
            <span class="menu-title">Gallery</span>
            <span class="menu-sub">Replays, screenshots, MV shots</span>
          </div>
          <span class="menu-arrow">›</span>
        </button>

        <button class="menu-item">
          <div class="menu-label">
            <span class="menu-title">Settings</span>
            <span class="menu-sub">Controls · latency · account</span>
          </div>
          <span class="menu-arrow">›</span>
        </button>
      </div>
    </section>

  {:else if phase === "song-select"}
    <!-- RHYTHM GAME → SONG SELECT -->
    <section class="screen">
      <header class="top-bar">
        <div class="top-left">
          <button class="ghost-btn small" on:click={backToMainMenu}>‹ Back</button>
          <h1 class="title">Rhythm Game</h1>
          <p class="subtitle">Pick a song or import your own.</p>
        </div>
      </header>

      <div class="song-layout">
        <div class="song-list">
          {#each songs as song}
            <button
              class="song-row"
              class:selected={song.id === selectedSongId}
              on:click={() => handleSongClick(song)}
            >
              <div class="song-main">
                <div class="song-title">{song.title}</div>
                <div class="song-meta">
                  <span>{song.artist}</span>
                  {#if song.isImported}
                    <span class="pill pill-imported">Imported</span>
                  {/if}
                </div>
              </div>
              <div class="song-right">
                <span class="song-duration">{song.duration}</span>
                <span class="menu-arrow">›</span>
              </div>
            </button>
          {/each}
        </div>

        <div class="song-import">
          <h2>Import song</h2>
          <p class="subtitle small">
            Drop in <code>.mp3</code>, <code>.ogg</code>, <code>.wav</code>, or <code>.flac</code>.
            The game will auto-chart from the audio.
          </p>

          <label class="import-drop">
            <input
              type="file"
              accept=".mp3,.ogg,.wav,.flac,audio/mpeg,audio/ogg,audio/wav,audio/flac,audio/x-flac"
              multiple
              on:change={handleSongImport}
            />
            <div class="import-inner">
              <div class="import-icon">＋</div>
              <div class="import-text">
                <div>Tap to choose files</div>
                <div class="import-sub">or drop them here (desktop)</div>
              </div>
            </div>
          </label>
        </div>
      </div>
    </section>
  {/if}
</div>

<style>
  :global(body) {
    margin: 0;
    font-family: system-ui, -apple-system, BlinkMacSystemFont, "Comfortaa",
      "SF Pro Text", sans-serif;
    background: radial-gradient(circle at top, #1b1826 0, #05030b 60%, #020104 100%);
    color: #fefbff;
    -webkit-font-smoothing: antialiased;
  }

  .app-root {
    position: relative;
    min-height: 100vh;
    overflow: hidden;
  }

  .bg-orbit {
    position: fixed;
    width: 80vmax;
    height: 80vmax;
    border-radius: 50%;
    background: radial-gradient(circle at 30% 20%, #ff9fbf 0, transparent 60%),
      radial-gradient(circle at 70% 80%, #9fdfff 0, transparent 60%);
    opacity: 0.16;
    filter: blur(12px);
    top: -30vmax;
    left: -20vmax;
    pointer-events: none;
    z-index: -2;
  }

  .bg-orbit.orbit-2 {
    top: auto;
    bottom: -40vmax;
    left: auto;
    right: -20vmax;
    transform: rotate(12deg);
    opacity: 0.12;
  }

  .bg-noise {
    position: fixed;
    inset: 0;
    background-image: linear-gradient(
        135deg,
        rgba(255, 255, 255, 0.03),
        transparent 60%
      );
    mix-blend-mode: soft-light;
    opacity: 0.4;
    pointer-events: none;
    z-index: -1;
  }

  .screen {
    position: relative;
    padding: 24px clamp(16px, 4vw, 40px) 32px;
    max-width: 1120px;
    margin: 0 auto;
  }

  .screen-center {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    min-height: 100vh;
    text-align: center;
  }

  .logo-lockup {
    cursor: pointer;
    padding: 24px 32px;
    border-radius: 24px;
    background: linear-gradient(135deg, #1b141f 0, #0c0711 60%);
    box-shadow: 0 18px 50px rgba(0, 0, 0, 0.5);
    border: 1px solid rgba(255, 255, 255, 0.12);
  }

  .logo-pill {
    display: inline-flex;
    align-items: center;
    padding: 8px 16px;
    border-radius: 999px;
    background: rgba(12, 7, 17, 0.85);
    border: 1px solid rgba(255, 255, 255, 0.12);
    margin-bottom: 8px;
  }

  .logo-dot {
    width: 14px;
    height: 14px;
    border-radius: 50%;
    margin-right: 8px;
    background: #bf2424;
    box-shadow: 0 0 18px rgba(191, 36, 36, 0.9);
  }

  .logo-text-main {
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    font-size: 0.85rem;
    color: #ffe4ec;
  }

  .logo-sub {
    margin: 4px 0 16px;
    color: #bcb2ff;
    font-size: 0.9rem;
  }

  .tap-button {
    margin-top: 8px;
    padding: 12px 24px;
    border-radius: 999px;
    border: none;
    background: #bf2424;
    color: #fff;
    font-weight: 600;
    font-size: 0.95rem;
    cursor: pointer;
    position: relative;
    overflow: hidden;
    box-shadow: 0 12px 30px rgba(191, 36, 36, 0.75);
    animation: pulse 1.3s ease-in-out infinite;
  }

  .tap-button span {
    position: relative;
    z-index: 1;
  }

  .tap-button::before {
    content: "";
    position: absolute;
    inset: 0;
    background: linear-gradient(135deg, #ff7c7c, #bf2424);
    opacity: 0;
    transition: opacity 0.2s;
  }

  .tap-button:hover::before {
    opacity: 0.16;
  }

  .hint {
    margin-top: 16px;
    color: #c8c1ff;
    font-size: 0.85rem;
    opacity: 0.8;
  }

  .top-bar {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 16px;
    margin-bottom: 24px;
  }

  .title {
    margin: 0;
    font-size: clamp(1.4rem, 2.2vw, 1.9rem);
  }

  .subtitle {
    margin: 4px 0 0;
    color: #c8c1ff;
    font-size: 0.9rem;
  }

  .subtitle.small {
    font-size: 0.8rem;
  }

  .mini-avatar {
    width: 36px;
    height: 36px;
    border-radius: 999px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: 700;
    color: #08040c;
    box-shadow: 0 0 12px rgba(255, 255, 255, 0.35);
  }

  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    gap: 16px;
  }

  .profiles-grid {
    margin-top: 12px;
  }

  .card {
    position: relative;
    border-radius: 20px;
    border: 1px solid rgba(255, 255, 255, 0.12);
    background: radial-gradient(circle at top left, rgba(255, 255, 255, 0.04), transparent 55%),
      rgba(8, 4, 14, 0.95);
    padding: 14px 16px;
    text-align: left;
    display: flex;
    gap: 10px;
    align-items: center;
    cursor: pointer;
    transition: transform 0.15s ease, box-shadow 0.15s ease, border-color 0.15s ease,
      background 0.15s ease;
  }

  .card:hover {
    transform: translateY(-2px);
    border-color: rgba(255, 255, 255, 0.2);
    box-shadow: 0 10px 28px rgba(0, 0, 0, 0.7);
    background: radial-gradient(circle at top left, rgba(255, 255, 255, 0.08), transparent 55%),
      rgba(8, 4, 14, 0.98);
  }

  .profile-card {
    border-radius: 18px;
  }

  .avatar {
    width: 44px;
    height: 44px;
    border-radius: 50%;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: 700;
    color: #08040c;
    box-shadow: 0 0 16px rgba(255, 255, 255, 0.4);
  }

  .avatar-add {
    background: rgba(255, 255, 255, 0.08);
    color: #ffe4ec;
    box-shadow: none;
    border: 1px dashed rgba(255, 255, 255, 0.3);
  }

  .profile-info {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .profile-name {
    font-weight: 600;
  }

  .profile-meta {
    font-size: 0.8rem;
    color: #c8c1ff;
  }

  .add-card {
    border-style: dashed;
    border-color: rgba(255, 255, 255, 0.22);
  }

  .modal-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(5, 3, 15, 0.82);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 9999;
  }

  .modal {
    width: min(360px, 90vw);
    padding: 20px 22px 18px;
    border-radius: 18px;
    background: rgba(8, 4, 14, 0.98);
    border: 1px solid rgba(255, 255, 255, 0.16);
    box-shadow: 0 18px 40px rgba(0, 0, 0, 0.7);
  }

  .modal h2 {
    margin: 0 0 6px;
    font-size: 1.1rem;
  }

  .modal-text {
    margin: 0 0 14px;
    font-size: 0.9rem;
    color: #d7d0ff;
  }

  .google-btn {
    width: 100%;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 10px 14px;
    border-radius: 999px;
    border: none;
    background: #ffffff;
    color: #202124;
    font-size: 0.9rem;
    font-weight: 600;
    cursor: pointer;
    margin-bottom: 8px;
  }

  .g-logo {
    width: 20px;
    height: 20px;
    border-radius: 4px;
    background: conic-gradient(
      from 0deg,
      #4285f4 0 90deg,
      #34a853 90deg 180deg,
      #fbbc05 180deg 270deg,
      #ea4335 270deg 360deg
    );
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 0.7rem;
    color: #fff;
  }

  .ghost-btn {
    border-radius: 999px;
    border: 1px solid rgba(255, 255, 255, 0.32);
    background: transparent;
    padding: 6px 14px;
    color: #fefbff;
    font-size: 0.85rem;
    cursor: pointer;
  }

  .ghost-btn.small {
    padding: 4px 10px;
    font-size: 0.75rem;
    margin-bottom: 8px;
  }

  .menu-list {
    margin-top: 8px;
    display: flex;
    flex-direction: column;
    gap: 14px;
  }

  .menu-item {
    position: relative;
    border: none;
    cursor: pointer;
    padding: 14px 18px;
    border-radius: 18px;
    background: linear-gradient(135deg, rgba(13, 7, 19, 0.96), rgba(6, 2, 12, 0.98));
    color: #fefbff;
    display: flex;
    align-items: center;
    justify-content: space-between;
    overflow: hidden;
    transform: skewX(-12deg);
    border: 1px solid rgba(255, 255, 255, 0.12);
    box-shadow: 0 14px 32px rgba(0, 0, 0, 0.7);
    transition: transform 0.15s ease, box-shadow 0.15s ease, border-color 0.15s ease,
      background 0.15s ease;
  }

  .menu-item > * {
    transform: skewX(12deg);
  }

  .menu-item.primary {
    background: linear-gradient(135deg, rgba(191, 36, 36, 0.95), rgba(133, 32, 79, 0.95));
    border-color: rgba(255, 220, 230, 0.5);
  }

  .menu-item:hover {
    transform: translateY(-2px) skewX(-12deg);
    box-shadow: 0 18px 40px rgba(0, 0, 0, 0.85);
    border-color: rgba(255, 255, 255, 0.22);
  }

  .menu-label {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
  }

  .menu-title {
    font-weight: 600;
    font-size: 1rem;
  }

  .menu-sub {
    font-size: 0.8rem;
    color: #f4eaff;
    opacity: 0.9;
  }

  .menu-arrow {
    font-size: 1.3rem;
    opacity: 0.8;
  }

  .song-layout {
    margin-top: 8px;
    display: grid;
    grid-template-columns: minmax(0, 3fr) minmax(0, 2fr);
    gap: 18px;
  }

  .song-list {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .song-row {
    border-radius: 16px;
    border: 1px solid rgba(255, 255, 255, 0.12);
    background: rgba(8, 4, 14, 0.96);
    padding: 10px 14px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    cursor: pointer;
    transition: border-color 0.15s, background 0.15s, transform 0.1s;
  }

  .song-row:hover {
    border-color: rgba(255, 255, 255, 0.22);
    transform: translateY(-1px);
  }

  .song-row.selected {
    border-color: #bf2424;
    box-shadow: 0 0 0 1px rgba(191, 36, 36, 0.4);
  }

  .song-main {
    display: flex;
    flex-direction: column;
  }

  .song-title {
    font-weight: 600;
  }

  .song-meta {
    margin-top: 2px;
    font-size: 0.82rem;
    color: #c8c1ff;
    display: flex;
    gap: 8px;
    align-items: center;
  }

  .song-right {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 0.8rem;
  }

  .song-duration {
    color: #f3ebff;
  }

  .pill {
    border-radius: 999px;
    padding: 2px 8px;
    font-size: 0.7rem;
    border: 1px solid rgba(255, 255, 255, 0.3);
  }

  .pill-imported {
    background: rgba(159, 223, 255, 0.2);
    border-color: rgba(159, 223, 255, 0.5);
  }

  .song-import {
    border-radius: 18px;
    padding: 14px 16px;
    background: radial-gradient(circle at top, rgba(255, 255, 255, 0.04), transparent 60%),
      rgba(6, 2, 12, 0.98);
    border: 1px solid rgba(255, 255, 255, 0.15);
  }

  .song-import h2 {
    margin: 0 0 4px;
    font-size: 1rem;
  }

  .song-import .subtitle {
    margin-top: 2px;
  }

  .import-drop {
    margin-top: 10px;
    border-radius: 16px;
    border: 1px dashed rgba(255, 255, 255, 0.4);
    padding: 10px;
    display: block;
    cursor: pointer;
    background: rgba(10, 4, 18, 0.95);
  }

  .import-drop input[type="file"] {
    display: none;
  }

  .import-inner {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .import-icon {
    width: 32px;
    height: 32px;
    border-radius: 999px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: #bf2424;
    box-shadow: 0 0 12px rgba(191, 36, 36, 0.7);
    font-weight: 700;
  }

  .import-text {
    font-size: 0.85rem;
  }

  .import-sub {
    font-size: 0.75rem;
    color: #c8c1ff;
  }

  @keyframes pulse {
    0% {
      transform: translateY(0) scale(1);
      box-shadow: 0 12px 30px rgba(191, 36, 36, 0.75);
    }
    50% {
      transform: translateY(-1px) scale(1.03);
      box-shadow: 0 18px 40px rgba(191, 36, 36, 0.9);
    }
    100% {
      transform: translateY(0) scale(1);
      box-shadow: 0 12px 30px rgba(191, 36, 36, 0.75);
    }
  }

  @media (max-width: 800px) {
    .song-layout {
      grid-template-columns: 1fr;
    }
  }
</style>
