import { getFirebaseServices, getSignedInUser } from "./firebase.js";

function makeRoomCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");
}

function makePlayerId() {
  const storageKey = "gamespace_room_player_id";
  try {
    const stored = sessionStorage.getItem(storageKey);
    if (stored) return stored;
  } catch (_) {}
  const id = typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `p_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
  try { sessionStorage.setItem(storageKey, id); } catch (_) {}
  return id;
}

class FirebaseRoomClient {
  constructor(services, code, uid, isHost, gameId) {
    this.services = services;
    this.db = services.db;
    this.dbSdk = services.dbSdk;
    this.code = code;
    this.playerId = uid;
    this.isHost = isHost;
    this.gameId = gameId;
    this.room = null;
    this.state = null;
    this.actionHandler = null;
    this.stateHandler = null;
    this.roomHandler = null;
    this.pendingActions = [];
    this.processedActionIds = new Set();
    this.unsubscribers = [];
    this.closed = false;
    this.roomRef = this.dbSdk.ref(this.db, `rooms/${code}`);
    this.playerRef = this.dbSdk.ref(this.db, `rooms/${code}/players/${uid}`);
    this.stateRef = this.dbSdk.ref(this.db, `rooms/${code}/state`);
    this.actionsRef = this.dbSdk.ref(this.db, `rooms/${code}/actions`);
  }

  async connect() {
    const { onValue, onChildAdded, onDisconnect } = this.dbSdk;
    const stopRoom = onValue(this.roomRef, (snapshot) => {
      this.room = snapshot.val();
      if (this.roomHandler) this.roomHandler(this.room);
    }, (error) => console.error("Room listener:", error));
    const stopState = onValue(this.stateRef, (snapshot) => {
      this.state = snapshot.val();
      if (this.state && this.stateHandler) this.stateHandler(this.state);
    }, (error) => console.error("State listener:", error));
    this.unsubscribers.push(stopRoom, stopState);

    if (this.isHost) {
      const stopActions = onChildAdded(this.actionsRef, (snapshot) => {
        const event = snapshot.val();
        if (!event || event.playerId === this.playerId || this.processedActionIds.has(snapshot.key)) return;
        this.processedActionIds.add(snapshot.key);
        this.pendingActions.push({ key: snapshot.key, action: event.action });
        this.flushPendingActions();
      }, (error) => console.error("Action listener:", error));
      this.unsubscribers.push(stopActions);
    }

    try {
      await onDisconnect(this.playerRef).update({ connected: false, disconnectedAt: Date.now() });
    } catch (error) {
      console.warn("Presence disconnect handler could not be registered:", error);
    }
    return this;
  }

  flushPendingActions() {
    if (!this.actionHandler || !this.pendingActions.length) return;
    const queue = this.pendingActions.splice(0);
    queue.forEach(({ key, action }) => {
      try {
        this.actionHandler(action);
      } finally {
        this.dbSdk.remove(this.dbSdk.ref(this.db, `rooms/${this.code}/actions/${key}`)).catch(() => {});
      }
    });
  }

  onAction(handler) {
    this.actionHandler = handler;
    this.flushPendingActions();
  }

  onState(handler) {
    this.stateHandler = handler;
    if (this.state) handler(this.state);
  }

  onRoom(handler) {
    this.roomHandler = handler;
    if (this.room) handler(this.room);
  }

  async publishState(state) {
    if (!this.isHost || this.closed) return;
    await this.dbSdk.set(this.stateRef, state);
  }

  async sendAction(action) {
    if (this.isHost || this.closed) return;
    await this.dbSdk.push(this.actionsRef, {
      playerId: this.playerId,
      action,
      sentAt: Date.now()
    });
  }

  async leave() {
    if (this.closed) return;
    this.closed = true;
    this.unsubscribers.forEach((unsubscribe) => {
      try { unsubscribe(); } catch (_) {}
    });
    try { await this.dbSdk.onDisconnect(this.playerRef).cancel(); } catch (_) {}
    try {
      if (this.isHost) {
        await this.dbSdk.remove(this.roomRef);
      } else {
        await this.dbSdk.remove(this.playerRef);
        await this.dbSdk.update(this.roomRef, { status: "waiting" });
      }
    } catch (error) {
      console.warn("Room cleanup failed:", error);
    }
  }
}

export async function createRoom(gameId, playerName = "Player") {
  const services = await getFirebaseServices();
  await getSignedInUser(services);
  const playerId = makePlayerId();
  const { dbSdk, db } = services;
  let code = "";
  let committed = false;
  for (let attempt = 0; attempt < 6 && !committed; attempt += 1) {
    code = makeRoomCode();
    const roomRef = dbSdk.ref(db, `rooms/${code}`);
    const result = await dbSdk.runTransaction(roomRef, (current) => {
      if (current !== null) return;
      return {
        gameId,
        hostId: playerId,
        status: "waiting",
        createdAt: Date.now(),
        players: {
          [playerId]: { name: playerName, role: "host", connected: true, joinedAt: Date.now() }
        }
      };
    });
    committed = result.committed;
  }
  if (!committed) throw new Error("Tidak berhasil membuat room. Coba sekali lagi.");
  const client = new FirebaseRoomClient(services, code, playerId, true, gameId);
  await client.connect();
  return client;
}

export async function joinRoom(roomCode, playerName = "Player") {
  const code = String(roomCode || "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!/^[A-Z0-9]{6}$/.test(code)) throw new Error("Kode room harus terdiri dari 6 karakter.");
  const services = await getFirebaseServices();
  await getSignedInUser(services);
  const playerId = makePlayerId();
  const { dbSdk, db } = services;
  const roomRef = dbSdk.ref(db, `rooms/${code}`);
  const result = await dbSdk.runTransaction(roomRef, (current) => {
    /*
     * Firebase menjalankan transaction update terhadap local cache dulu.
     * Pada kunjungan pertama ke path ini, `current` bisa null meskipun room
     * ada di server. Mengembalikan undefined di situ akan meng-abort transaksi
     * secara permanen, sehingga join selalu gagal bagi pemain yang belum
     * punya cache room tersebut.
     *
     * Solusinya: kembalikan nilai penanda agar server menolak (conflict) dan
     * SDK mengulang dengan data server yang sebenarnya. Penanda ini hanya
     * akan tersimpan bila room memang tidak ada — kasus itu ditangani setelah
     * transaksi selesai di bawah.
     */
    if (!current) return { __mgpProbe: true };
    if (current.__mgpProbe || current.status === "closed") return;
    const players = current.players || {};
    const activePlayers = Object.entries(players).filter(([id, player]) => id === playerId || player?.connected !== false);
    const alreadyInRoom = Boolean(players[playerId]);
    if (!alreadyInRoom && activePlayers.length >= 2) return;
    const nextPlayerCount = activePlayers.length + (alreadyInRoom ? 0 : 1);
    current.players = players;
    current.players[playerId] = {
      name: playerName,
      role: playerId === current.hostId ? "host" : "guest",
      connected: true,
      joinedAt: Date.now()
    };
    current.status = nextPlayerCount >= 2 ? "playing" : "waiting";
    return current;
  });
  if (!result.committed) throw new Error("Room tidak ditemukan, sudah penuh, atau tidak lagi tersedia.");
  const roomData = result.snapshot.val();
  if (roomData?.__mgpProbe) {
    // Room benar-benar tidak ada: hapus penanda agar tidak menyisakan node sampah.
    await dbSdk.remove(roomRef);
    throw new Error("Room tidak ditemukan, sudah penuh, atau tidak lagi tersedia.");
  }
  const client = new FirebaseRoomClient(services, code, playerId, playerId === roomData.hostId, roomData.gameId);
  await client.connect();
  return client;
}
