/*
 * Copy this file when adding a game.
 * 1. Isi META di bawah (id harus sama dengan nama file tanpa .js).
 * 2. Tulis logika game di mount().
 * 3. Jalankan: node tools/build-games-manifest.mjs
 */

/*
 * Metadata wajib: dibaca oleh tools/build-games-manifest.mjs saat regenerate
 * JS/games-manifest.js. Tanpa ini, build akan gagal dengan error
 * "tambahkan \"export const META = {...}\"".
 *   - name, category, catLabel, desc : wajib terisi
 *   - art  : SVG string kartu (opsional — kosong = pakai inisial nama)
 *   - bg   : 2 warna hex kartu (opsional — kosong = pakai warna default)
 *   - bestKey: (opsional) localStorage key untuk skor terbaik
 */
export const META = {
  id: "new-game",              // harus sama dengan nama file (tanpa .js)
  name: "New Game",
  category: "arcade",          // id kategori, mis. arcade / sports / puzzle
  catLabel: "Arcade",          // label tampil di kartu
  desc: "Replace this text with the game instructions.",
  art: "",                     // mis. '<svg viewBox="0 0 48 48" ...>...</svg>'
  bg: [],                      // mis. ["#fdba74", "#f97316"]
  // bestKey: "newGameBest",
};

export function mount(root, context = {}) {
  const { mode = "ai", room = null, playerName = "Player", onExit = () => {} } = context;
  const online = mode === "room" && Boolean(room);
  const playerIndex = online && !room.isHost ? 1 : 0;
  let roomData = room?.room || null;
  let state = null;

  root.innerHTML = `
    <div class="game-app">
      <div class="game-intro">
        <div><h2>New Game</h2><p>Replace this text with the game instructions.</p></div>
        <span class="game-status"><i class="game-status-dot"></i><span data-status>Ready</span></span>
      </div>
      <section class="game-panel" data-board></section>
      <div class="game-actions"><button class="game-action-button" type="button" data-exit>Exit game</button></div>
    </div>`;

  function render() {
    // Render the current state into root.querySelector('[data-board]').
  }

  function publish() {
    render();
    // Only the host writes canonical state to Firebase.
    if (online && room.isHost) room.publishState(state).catch(console.warn);
  }

  function applyAction(action, actor) {
    // Validate actor + action before mutating state.
    // Then call publish().
  }

  function submitAction(action) {
    if (online && !room.isHost) {
      room.sendAction(action).catch(console.warn);
      return;
    }
    applyAction(action, playerIndex);
  }

  function handleClick(event) {
    if (event.target.closest('[data-exit]')) onExit();
    // Add your game-specific controls here and call submitAction(...).
  }

  root.addEventListener('click', handleClick);
  if (online) {
    room.onRoom((nextRoom) => { roomData = nextRoom; render(); });
    if (room.isHost) {
      state = {/* initial serializable state */};
      publish();
      room.onAction((action) => applyAction(action, 1));
    } else {
      room.onState((nextState) => { state = nextState; render(); });
    }
  } else {
    state = {/* initial serializable state */};
    render();
    // Implement your local AI here. No room/database is needed in AI mode.
  }

  return {
    destroy() {
      root.removeEventListener('click', handleClick);
      // Clear timers and any document-level listeners created by this game.
    }
  };
}
