/**
 * Room tiruan sesuai JS/GAME_MODULE_CONTRACT.md.
 *
 * Dipakai oleh mount smoke test agar kode multiplayer ikut tereksekusi tanpa
 * koneksi Firebase. Host dan guest berbagi state/action di memori, sehingga
 * publishState → onState dan sendAction → onAction benar-benar berjalan.
 */

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

export function createRoomPair({ gameId = "mock-game", code = "TEST42", hostName = "Host", guestName = "Guest" } = {}) {
  const shared = {
    code,
    gameId,
    roomData: {
      code,
      gameId,
      status: "playing",
      players: [
        { id: "host", name: hostName, connected: true, isHost: true },
        { id: "guest", name: guestName, connected: true, isHost: false },
      ],
      names: [hostName, guestName],
      createdAt: Date.now(),
    },
    state: null,
    listeners: { room: new Set(), state: new Set(), action: new Set() },
    pendingActions: [],
    destroyed: false,
  };

  function flushActions() {
    if (!shared.pendingActions.length) return;
    const queue = shared.pendingActions.splice(0);
    for (const { action } of queue) {
      for (const handler of [...shared.listeners.action]) handler(action);
    }
  }

  function client(isHost, playerName) {
    const room = {
      isHost,
      code,
      gameId,
      playerName,
      get room() { return shared.roomData; },
      onRoom(handler) {
        if (typeof handler !== "function") return () => {};
        shared.listeners.room.add(handler);
        handler(clone(shared.roomData));
        return () => shared.listeners.room.delete(handler);
      },
      onState(handler) {
        if (typeof handler !== "function") return () => {};
        shared.listeners.state.add(handler);
        if (shared.state !== null) handler(clone(shared.state));
        return () => shared.listeners.state.delete(handler);
      },
      onAction(handler) {
        if (!isHost || typeof handler !== "function") return () => {};
        shared.listeners.action.add(handler);
        flushActions();
        return () => shared.listeners.action.delete(handler);
      },
      publishState(state) {
        if (!isHost) return Promise.reject(new Error("Guest tidak boleh publishState."));
        if (state === undefined) return Promise.reject(new Error("publishState(undefined) — state wajib diisi."));
        try {
          shared.state = clone(state);
        } catch (error) {
          return Promise.reject(new Error(`State tidak JSON-serializable: ${error.message}`));
        }
        for (const handler of [...shared.listeners.state]) handler(clone(shared.state));
        return Promise.resolve();
      },
      sendAction(action) {
        if (isHost) return Promise.reject(new Error("Host tidak boleh sendAction."));
        try {
          clone(action);
        } catch (error) {
          return Promise.reject(new Error(`Action tidak JSON-serializable: ${error.message}`));
        }
        shared.pendingActions.push({ action });
        flushActions();
        return Promise.resolve();
      },
      leave() {
        const player = shared.roomData.players[isHost ? 0 : 1];
        if (player) player.connected = false;
        for (const set of Object.values(shared.listeners)) set.clear();
        return Promise.resolve();
      },
      markDisconnected() {
        return this.leave();
      },
    };
    return room;
  }

  return {
    host: client(true, hostName),
    guest: client(false, guestName),
    shared,
    /** Kirim action dari guest setelah kedua game ter-mount. */
    guestAction(action) { shared.pendingActions.push({ action }); flushActions(); },
    /** Simulasikan host mengubah state. */
    hostPublish(state) { return this.host.publishState(state); },
  };
}

/** Context untuk mode solo/AI. */
export function aiContext(playerName = "Tester", onExit = () => {}) {
  return { mode: "ai", room: null, playerName, onExit };
}
