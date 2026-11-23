import { createRoom, joinRoom } from "./room-client.js";
import { GAMES as GENERATED_GAMES } from "./games-manifest.js";
import {
  rawPlayerName as sharedRawPlayerName,
  getDisplayName,
  hasDisplayName,
  saveDisplayName,
} from "./identity.js";
import {
  applyTheme,
  getThemePreference,
  initThemeButtons,
  setThemePreference,
} from "./theme.js";

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

/* =============================================================
 * GAME LIBRARY
 * GAMES dibaca dari JS/games-manifest.js yang di-generate dari
 * seluruh file di Gaming/ oleh tools/build-games-manifest.mjs.
 * Regenerate: node tools/build-games-manifest.mjs
 * ============================================================= */
const GAMES = Object.freeze(GENERATED_GAMES);
const GAME_TOTAL = GAMES.length;
const GAMES_BY_ID = new Map(GAMES.map((game) => [game.id, game]));
const CATEGORY_LABELS = new Map(
  GAMES.map((game) => [game.category, game.catLabel || game.category])
);

const STORAGE = {
  name: "gamespace_player_name",
  favorites: "gamespace_favorites",
  stats: "gamespace_stats",
  rooms: "gamespace_rooms",
  recent: "gamespace_recent",
  compact: "gamespace_compact_layout",
  motion: "gamespace_reduce_motion",
  theme: "gamespace_theme",
  legacyPlays: "gamespace_plays"
};

let activeFilter = "all";
let selectedGameId = "";
let currentGame = null;
let currentGameKind = "";
let currentGameModule = null;
let activeWatcher = null;
let currentRoom = null;
let launchBusy = false;
let currentPage = "overview";
let searchDebounce = 0;

/* =============================================================
 * LOCAL STORAGE
 * Semua data user disimpan di localStorage device ini.
 * Tidak ada data mock / seed: user pertama mulai dari nol.
 * ============================================================= */
function readJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (raw == null) return fallback;
    return JSON.parse(raw) ?? fallback;
  } catch (_) {
    return fallback;
  }
}
function writeJSON(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch (_) { }
}
function readRaw(key) {
  try { return localStorage.getItem(key) || ""; } catch (_) { return ""; }
}
function writeRaw(key, value) {
  try { localStorage.setItem(key, value); } catch (_) { }
}
function removeRaw(key) {
  try { localStorage.removeItem(key); } catch (_) { }
}

/* ---------- player name (sumber sama dengan halaman komunitas) ---------- */
function rawPlayerName() {
  return sharedRawPlayerName();
}
function playerName() {
  return getDisplayName();
}
function hasPlayerName() {
  return hasDisplayName();
}
function savePlayerName(value) {
  return saveDisplayName(value);
}

/* ---------- stats per game (sessions / best / win / loss) ---------- */
function emptyStatsEntry() {
  return { sessions: 0, best: 0, wins: 0, losses: 0, lastPlayed: 0 };
}
function loadStats() {
  const stored = readJSON(STORAGE.stats, null);
  if (stored && typeof stored === "object" && !Array.isArray(stored)) return stored;
  const migrated = {};
  const legacyPlays = readJSON(STORAGE.legacyPlays, {});
  for (const [id, count] of Object.entries(legacyPlays)) {
    if (GAMES_BY_ID.has(id)) {
      migrated[id] = { ...emptyStatsEntry(), sessions: Number(count) || 0 };
    }
  }
  writeJSON(STORAGE.stats, migrated);
  return migrated;
}
let stats = loadStats();
function statsFor(id) {
  return stats[id] || emptyStatsEntry();
}
function saveStats() {
  writeJSON(STORAGE.stats, stats);
}
function recordSession(gameId) {
  const entry = stats[gameId] || (stats[gameId] = emptyStatsEntry());
  entry.sessions += 1;
  entry.lastPlayed = Date.now();
  saveStats();
  const recent = readJSON(STORAGE.recent, []).filter((id) => id !== gameId);
  recent.unshift(gameId);
  writeJSON(STORAGE.recent, recent.slice(0, 6));
  renderOverviewStats();
}
function recordResult(gameId, { bestScore = 0, result = "" }) {
  const entry = stats[gameId] || (stats[gameId] = emptyStatsEntry());
  if (bestScore > entry.best) entry.best = Math.round(bestScore);
  if (result === "win") entry.wins += 1;
  else if (result === "loss") entry.losses += 1;
  entry.lastPlayed = Date.now();
  saveStats();
  updateBestBadge();
  renderOverviewStats();
  refreshActiveDynamicPage();
}
function totalSessions() {
  return Object.values(stats).reduce((sum, entry) => sum + Number(entry?.sessions || 0), 0);
}
function uniqueGamesPlayed() {
  return Object.values(stats).filter((entry) => Number(entry?.sessions || 0) > 0).length;
}
function totalRooms() {
  return Number(readRaw(STORAGE.rooms) || 0);
}
function totalWins() {
  return Object.values(stats).reduce((sum, entry) => sum + Number(entry?.wins || 0), 0);
}
function bestOverall() {
  return Object.values(stats).reduce((best, entry) => Math.max(best, Number(entry?.best || 0)), 0);
}

/* ---------- favorites ---------- */
function favoriteSet() {
  return new Set(readJSON(STORAGE.favorites, []));
}
function toggleFavorite(gameId) {
  const favorites = favoriteSet();
  if (favorites.has(gameId)) favorites.delete(gameId);
  else favorites.add(gameId);
  writeJSON(STORAGE.favorites, [...favorites]);
  if (currentPage === "library") renderLibrary();
  else if (currentPage === "play") renderDynamicPage("play");
  if (currentPage === "library") renderFilterChips();
}

/* =============================================================
 * HELPERS
 * ============================================================= */
function escapeHTML(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
}
function gameById(id) {
  return GAMES_BY_ID.get(id);
}
function gameIndex(game) {
  return String(GAMES.indexOf(game) + 1).padStart(2, "0");
}
function safeColor(value, fallback) {
  return typeof value === "string" && /^#[0-9a-fA-F]{3,8}$/.test(value) ? value : fallback;
}
function fallbackArt(game) {
  const initial = escapeHTML((game.name || "?").charAt(0).toUpperCase());
  return `<svg viewBox="0 0 48 48" width="54" height="54" aria-hidden="true"><text x="24" y="24" dy=".35em" font-size="24" font-weight="800" text-anchor="middle" fill="currentColor" font-family="inherit">${initial}</text></svg>`;
}
function gameArt(game) {
  return typeof game.art === "string" && game.art.includes("<svg") ? game.art : fallbackArt(game);
}
function bestTag(game) {
  const best = Number(statsFor(game.id).best || 0);
  return best > 0 ? `Best ${best.toLocaleString("en-US")}` : "Solo · 1P";
}
function toast(message, kind = "") {
  const node = document.createElement("div");
  node.className = `toast-message ${kind}`.trim();
  node.textContent = message;
  $("#toastRegion").append(node);
  window.setTimeout(() => node.remove(), 3400);
}
function openDialog(id) {
  const dialog = document.getElementById(id);
  if (dialog) dialog.hidden = false;
}
function closeDialog(id) {
  const dialog = document.getElementById(id);
  if (dialog) dialog.hidden = true;
}

/* =============================================================
 * GAME LOADER
 * Dua format modul:
 *  - "mgp": IIFE klasik yang memanggil global MGP_REGISTER(meta).
 *  - "esm": ES module dengan mount(root, context) -> { destroy }.
 * ============================================================= */
const registeredGames = new Map();   // id -> metadata lengkap (termasuk build)
const scriptPromises = new Map();    // id -> Promise<meta>
const pendingRegistration = new Map(); // id -> resolve fn
const builtGames = new Map();        // id -> { wrapper, instance }

globalThis.MGP_REGISTER = (meta) => {
  if (!meta || typeof meta !== "object" || !meta.id || typeof meta.build !== "function") return;
  registeredGames.set(meta.id, meta);
  const resolve = pendingRegistration.get(meta.id);
  if (resolve) {
    pendingRegistration.delete(meta.id);
    resolve(meta);
  }
};

function gameModuleURL(game) {
  return new URL(game.module, import.meta.url).href;
}

function loadClassicGame(game) {
  const cached = registeredGames.get(game.id);
  if (cached) return Promise.resolve(cached);
  let promise = scriptPromises.get(game.id);
  if (!promise) {
    promise = new Promise((resolve, reject) => {
      pendingRegistration.set(game.id, resolve);
      const script = document.createElement("script");
      script.src = gameModuleURL(game);
      script.async = false;
      script.onload = () => {
        const meta = registeredGames.get(game.id);
        if (meta) resolve(meta);
        else {
          pendingRegistration.delete(game.id);
          scriptPromises.delete(game.id);
          reject(new Error(`Game "${game.name}" tidak mendaftarkan metadata.`));
        }
      };
      script.onerror = () => {
        pendingRegistration.delete(game.id);
        scriptPromises.delete(game.id);
        reject(new Error(`File game tidak dapat dimuat: ${game.module}`));
      };
      document.head.append(script);
    });
    scriptPromises.set(game.id, promise);
  }
  return promise;
}

/* ---------- deteksi hasil & skor terbaik dari HUD game ---------- */
const SCORE_HUD_KEYS = ["score", "points", "pts"];
function parseScore(text) {
  const numeric = String(text ?? "").replace(/,/g, "").replace(/[^0-9.\-]/g, "");
  const value = Number.parseFloat(numeric);
  return Number.isFinite(value) ? value : 0;
}
function attachResultWatcher(container, gameId) {
  const overOverlay = container.querySelector('[data-ov="over"]');
  if (!overOverlay) return () => { };
  const isVisible = (element) => Boolean(element && !element.hasAttribute("hidden"));
  let wasVisible = isVisible(overOverlay);
  const observer = new MutationObserver(() => {
    const visible = isVisible(overOverlay);
    if (visible && !wasVisible) {
      const scoreElement = SCORE_HUD_KEYS
        .map((key) => container.querySelector(`[data-hud="${key}"]`))
        .find(Boolean);
      const score = parseScore(scoreElement?.textContent);
      const title = container.querySelector('[data-ov="title"]');
      const result = title?.classList.contains("mgp-win") ? "win"
        : title?.classList.contains("mgp-lose") ? "loss"
          : "";
      recordResult(gameId, { bestScore: score, result });
    }
    wasVisible = visible;
  });
  observer.observe(overOverlay, { attributes: true, attributeFilter: ["hidden"] });
  const title = container.querySelector('[data-ov="title"]');
  if (title) observer.observe(title, { attributes: true, attributeFilter: ["class"] });
  return () => observer.disconnect();
}

/* =============================================================
 * LAUNCH / CLOSE GAME
 * ============================================================= */
function updateBestBadge() {
  const badge = $("#gameBestBadge");
  if (!badge || !currentGame) return;
  const game = gameById($("#gameDialogTitle").dataset.gameId || "");
  const best = game ? Number(statsFor(game.id).best || 0) : 0;
  badge.hidden = !(best > 0);
  badge.textContent = best > 0 ? `Best ${best.toLocaleString("en-US")}` : "";
}

async function launchGame(gameId, mode, room = null) {
  const game = gameById(gameId);
  if (!game) throw new Error("Game tidak ditemukan di library.");
  closeDialog("launchDialog");
  closeDialog("joinDialog");
  $("#gameDialog").hidden = false;
  $("#gameDialogTitle").textContent = game.name;
  $("#gameDialogTitle").dataset.gameId = game.id;
  $("#gameDialogMeta").textContent = mode === "room"
    ? (room?.isHost ? "Room host · 2 players" : "Room guest · 2 players")
    : "Solo session · vs AI";
  $("#shareRoomButton").hidden = mode !== "room";
  $("#shareRoomButton").textContent = room ? `Room ${room.code} · Copy` : "Copy room code";
  $("#gameHost").innerHTML = '<div class="game-loading"><span class="loading-spinner"></span><p>Loading game…</p></div>';
  currentRoom = room;
  recordSession(gameId);
  updateBestBadge();
  try {
    if (game.kind === "esm") {
      const module = await import(gameModuleURL(game));
      const node = document.createElement("div");
      node.className = "mgp-app";
      $("#gameHost").innerHTML = "";
      $("#gameHost").append(node);
      currentGame = module.mount(node, {
        mode,
        room,
        playerName: playerName(),
        onExit: closeGame
      });
      currentGameKind = "esm";
      currentGameModule = game;
    } else {
      const meta = await loadClassicGame(game);
      let built = builtGames.get(game.id);
      $("#gameHost").innerHTML = "";
      if (!built) {
        const wrapper = document.createElement("div");
        wrapper.id = `${game.id}-app`;
        wrapper.className = "mgp-app";
        $("#gameHost").append(wrapper);
        const instance = meta.build(wrapper);
        built = { wrapper, instance };
        builtGames.set(game.id, built);
      } else {
        $("#gameHost").append(built.wrapper);
      }
      currentGame = {
        destroy() {
          try { built.instance.close?.(); } catch (error) { console.warn(error); }
        }
      };
      currentGameKind = "mgp";
      currentGameModule = game;
      built.instance.open?.();
    }
    activeWatcher?.();
    activeWatcher = attachResultWatcher($("#gameHost"), game.id);
    updateBestBadge();
  } catch (error) {
    console.error(error);
    activeWatcher?.();
    activeWatcher = null;
    $("#gameHost").innerHTML = `<div class="game-loading"><strong>Game could not be started</strong><p>${escapeHTML(error.message || "Unknown error")}</p></div>`;
    throw error;
  }
}

async function startSelectedMode(mode) {
  if (launchBusy) return;
  launchBusy = true;
  const gameId = $("#launchGameSelect").value;
  selectedGameId = gameId;
  try {
    if (mode === "ai") {
      await launchGame(gameId, "ai", null);
      return;
    }
    toast("Creating a private room…");
    const room = await createRoom(gameId, playerName());
    writeRaw(STORAGE.rooms, String(totalRooms() + 1));
    renderOverviewStats();
    toast(`Room ${room.code} created. Share the code with your friend.`);
    await launchGame(gameId, "room", room);
  } catch (error) {
    console.error(error);
    toast(error.message || "Could not start the session.", "error");
  } finally {
    launchBusy = false;
  }
}

async function submitJoinRoom() {
  if (launchBusy) return;
  launchBusy = true;
  const code = $("#joinRoomCode").value.trim().toUpperCase();
  $("#joinError").hidden = true;
  try {
    const room = await joinRoom(code, playerName());
    const game = gameById(room.gameId);
    if (!game) {
      await room.leave();
      throw new Error("Game dari room ini belum tersedia di versi library ini.");
    }
    toast(`Joined room ${room.code}.`);
    await launchGame(room.gameId, "room", room);
  } catch (error) {
    $("#joinError").textContent = error.message || "Unable to join this room.";
    $("#joinError").hidden = false;
  } finally {
    launchBusy = false;
  }
}

async function closeGame() {
  activeWatcher?.();
  activeWatcher = null;
  if (currentGame?.destroy) {
    try { currentGame.destroy(); } catch (error) { console.warn(error); }
  }
  /* Mirror skor terbaik milik modul ESM ke statistik lokal */
  const esmGame = currentGameKind === "esm" ? currentGameModule : null;
  const bestKey = esmGame?.bestKey;
  currentGame = null;
  currentGameKind = "";
  currentGameModule = null;
  if (esmGame && bestKey) {
    try {
      const best = Number(localStorage.getItem(bestKey) || 0) || 0;
      if (best > 0) recordResult(esmGame.id, { bestScore: best, result: "" });
    } catch (_) { }
  }
  if (currentRoom) {
    const room = currentRoom;
    currentRoom = null;
    await room.leave();
  }
  $("#gameHost").innerHTML = "";
  $("#gameDialog").hidden = true;
  $("#shareRoomButton").hidden = true;
  $("#gameBestBadge").hidden = true;
  if (currentPage === "play") refreshActiveDynamicPage();
}

async function copyRoomCode() {
  if (!currentRoom?.code) return;
  try {
    await navigator.clipboard.writeText(currentRoom.code);
    toast(`Room code ${currentRoom.code} copied.`);
  } catch (_) {
    toast(`Room code: ${currentRoom.code}`);
  }
}

function selectGame(gameId) {
  const game = gameById(gameId);
  selectedGameId = game ? gameId : (GAMES[0]?.id || "");
  renderGameOptions();
  const selected = gameById(selectedGameId);
  if (!selected) return;
  $("#launchTitle").textContent = `Play ${selected.name}`;
  $("#launchSubtitle").textContent = selected.kind === "esm"
    ? "Choose an opponent or create a private room."
    : "Play solo, or open this game in a room on another device (this title runs locally per player).";
  openDialog("launchDialog");
}

/* =============================================================
 * RENDER: PROFILE / STATS / OPTIONS / LIBRARY
 * ============================================================= */
function renderProfile() {
  const name = playerName();
  const initial = (name.charAt(0) || "G").toUpperCase();
  const profileName = $("#profileName");
  const profileAvatar = $("#profileAvatar");
  const topAvatar = $("#topAvatar");
  if (profileName) profileName.textContent = name;
  if (profileAvatar) profileAvatar.textContent = initial;
  if (topAvatar) topAvatar.textContent = initial;
  $("#playerNameInput").value = rawPlayerName();
}

function renderOverviewStats() {
  $("#playCount").textContent = String(totalSessions()).padStart(2, "0");
  $("#roomCount").textContent = String(totalRooms()).padStart(2, "0");
  $("#gameCount").textContent = String(GAME_TOTAL).padStart(2, "0");
}

function renderGameOptions() {
  const select = $("#launchGameSelect");
  const groups = new Map();
  for (const game of GAMES) {
    if (!groups.has(game.category)) groups.set(game.category, []);
    groups.get(game.category).push(game);
  }
  select.innerHTML = [...groups.entries()].map(([category, list]) => {
    const label = CATEGORY_LABELS.get(category) || category;
    return `<optgroup label="${escapeHTML(label)}">${list
      .map((game) => `<option value="${game.id}">${escapeHTML(game.name)}</option>`)
      .join("")}</optgroup>`;
  }).join("");
  select.value = selectedGameId;
}

function gameCardHTML(game, favorites) {
  const isFavorite = favorites.has(game.id);
  const artA = safeColor(game.bg?.[0], "#253a50");
  const artB = safeColor(game.bg?.[1], "#536f91");
  const index = gameIndex(game);
  return `
    <article class="game-card" data-game-card="${game.id}">
      <div class="game-art" style="--art-a:${artA};--art-b:${artB}">
        <span class="game-art-label">${escapeHTML(game.catLabel || game.category)}</span>
        <span class="art-orbit" aria-hidden="true"></span>
        <span class="art-glyph" aria-hidden="true">${gameArt(game)}</span>
        <span class="art-index">${index} / ${GAME_TOTAL}</span>
      </div>
      <div class="game-body">
        <div class="game-title-row"><h3>${escapeHTML(game.name)}</h3>
          <button class="favorite-button" type="button" data-favorite="${game.id}" aria-label="${isFavorite ? "Remove" : "Add"} ${escapeHTML(game.name)} ${isFavorite ? "from" : "to"} favorites" aria-pressed="${isFavorite}">${isFavorite ? "♥" : "♡"}</button>
        </div>
        <p class="game-description">${escapeHTML(game.description)}</p>
        <div class="game-card-footer"><div class="game-tags"><span class="game-tag">${escapeHTML(game.catLabel || game.category)}</span><span class="game-tag">${escapeHTML(bestTag(game))}</span></div>
          <button class="play-button" type="button" data-play="${game.id}">Play <span>↗</span></button>
        </div>
      </div>
    </article>`;
}

function pickerCardHTML(game) {
  const artA = safeColor(game.bg?.[0], "#253a50");
  const artB = safeColor(game.bg?.[1], "#536f91");
  return `
    <button class="picker-card" type="button" data-play="${game.id}">
      <span class="picker-glyph" style="--art-a:${artA};--art-b:${artB}">${gameArt(game)}</span>
      <span>
        <strong>${escapeHTML(game.name)}</strong>
        <small>${escapeHTML(game.catLabel || game.category)}</small>
      </span>
      <span class="picker-arrow"> ↗ </span>
    </button>`;
}

function filterGames(query) {
  const favorites = favoriteSet();
  return GAMES.filter((game) => {
    const haystack = `${game.name} ${game.description} ${game.catLabel} ${game.category}`.toLowerCase();
    const textMatch = !query || haystack.includes(query);
    const filterMatch = activeFilter === "all"
      || (activeFilter === "favorites" ? favorites.has(game.id) : game.category === activeFilter);
    return textMatch && filterMatch;
  });
}

function renderFilterChips() {
  const favorites = favoriteSet();
  const categories = [...CATEGORY_LABELS.entries()]
    .sort((a, b) => a[1].localeCompare(b[1], "en", { sensitivity: "base" }));
  const chips = [
    { value: "all", label: "All games", count: GAME_TOTAL },
    ...categories.map(([category, label]) => ({
      value: category,
      label,
      count: GAMES.filter((game) => game.category === category).length
    })),
    { value: "favorites", label: "♡ Favorites", count: favorites.size }
  ];
  $("#filterList").innerHTML = chips.map((chip) => {
    const active = chip.value === activeFilter;
    return `<button class="filter-chip${active ? " active" : ""}" type="button" data-filter="${chip.value}" aria-pressed="${active}">${escapeHTML(chip.label)} <span>${chip.count}</span></button>`;
  }).join("");
}

function renderLibrary() {
  const favorites = favoriteSet();
  const query = $("#gameSearch").value.trim().toLowerCase();
  const filtered = filterGames(query);
  $("#gameGrid").innerHTML = filtered.map((game) => gameCardHTML(game, favorites)).join("");
  $("#shownCount").textContent = `${filtered.length} ${filtered.length === 1 ? "game" : "games"}`;
  $("#emptyState").hidden = filtered.length > 0;
}

function renderPickerPage(gridId, searchId, emptyId) {
  const grid = document.getElementById(gridId);
  if (!grid) return;
  const query = (document.getElementById(searchId)?.value || "").trim().toLowerCase();
  const filtered = GAMES.filter((game) => {
    if (!query) return true;
    return `${game.name} ${game.description} ${game.catLabel}`.toLowerCase().includes(query);
  });
  grid.innerHTML = filtered.map(pickerCardHTML).join("");
  const empty = document.getElementById(emptyId);
  if (empty) empty.hidden = filtered.length > 0;
}

/** Compact recent list used by the combined Play page. */
function renderCompactCollection(gridId, ids, emptyId) {
  const grid = document.getElementById(gridId);
  if (!grid) return;
  const games = ids.map((id) => gameById(id)).filter(Boolean);
  grid.innerHTML = games.map(pickerCardHTML).join("");
  const empty = document.getElementById(emptyId);
  if (empty) empty.hidden = games.length > 0;
}

/* =============================================================
 * RENDER: PROGRESS / SETTINGS
 * ============================================================= */
function activeEntries() {
  return Object.entries(stats)
    .map(([id, entry]) => ({ game: gameById(id), ...entry }))
    .filter((row) => row.game && Number(row.sessions || 0) > 0)
    .sort((a, b) => Number(b.sessions) - Number(a.sessions) || a.game.name.localeCompare(b.game.name, "en", { sensitivity: "base" }));
}

/* ---- Combined Progress page renderers (same local data, compact layout) ---- */
function renderCompactHistory() {
  const list = $("#progressHistoryList");
  if (!list) return;
  const rows = activeEntries();
  list.innerHTML = rows.map((row) => {
    const sessions = Number(row.sessions);
    const best = Number(row.best) > 0 ? Number(row.best).toLocaleString("en-US") : "—";
    return `<article class="history-list-row">
      <div class="history-list-top">
        <strong>${escapeHTML(row.game.name)}</strong>
        <span class="history-sessions">${sessions} ${sessions === 1 ? "session" : "sessions"}</span>
      </div>
      <div class="history-list-meta">
        <span>Best ${best}</span>
        <span>${Number(row.wins)}W / ${Number(row.losses)}L</span>
      </div>
    </article>`;
  }).join("");
  const empty = $("#progressHistoryEmpty");
  if (empty) empty.hidden = rows.length > 0;
}

function renderProgressStats() {
  const total = totalSessions();
  const unique = uniqueGamesPlayed();
  const totalEl = $("#progressTotalPlays");
  const uniqueEl = $("#progressUniqueGames");
  const roomsEl = $("#progressRooms");
  if (totalEl) totalEl.textContent = String(total).padStart(2, "0");
  if (uniqueEl) uniqueEl.textContent = `${unique}/${GAME_TOTAL}`;
  if (roomsEl) roomsEl.textContent = String(totalRooms()).padStart(2, "0");
  const usage = $("#progressUsageList");
  if (!usage) return;
  usage.innerHTML = activeEntries().length
    ? activeEntries().map((row) => {
      const amount = Number(row.sessions);
      const percent = total ? Math.round((amount / total) * 100) : 0;
      const bestPart = Number(row.best) > 0 ? ` · Best ${Number(row.best).toLocaleString("en-US")}` : "";
      return `<div class="usage-row"><div class="usage-meta"><strong>${escapeHTML(row.game.name)}</strong><span>${amount} ${amount === 1 ? "session" : "sessions"}${bestPart}</span></div><div class="usage-track"><span style="width:${percent}%"></span></div></div>`;
    }).join("")
    : '<p class="usage-empty">No sessions recorded yet on this device. Start a game to build your statistics.</p>';
}

function renderProgressAchievements() {
  const grid = $("#progressAchievementsGrid");
  if (!grid) return;
  const total = totalSessions();
  const unique = uniqueGamesPlayed();
  const rooms = totalRooms();
  const wins = totalWins();
  const best = bestOverall();
  const explorerTarget = Math.min(10, GAME_TOTAL);
  const achievements = [
    { title: "First Session", desc: "Start your first game.", current: Math.min(total, 1), target: 1, reward: "1 session" },
    { title: "Curious Explorer", desc: `Try ${explorerTarget} different games.`, current: Math.min(unique, explorerTarget), target: explorerTarget, reward: `${explorerTarget} games` },
    { title: "Regular Player", desc: "Start ten game sessions.", current: Math.min(total, 10), target: 10, reward: "10 sessions" },
    { title: "Room Host", desc: "Create your first private room.", current: Math.min(rooms, 1), target: 1, reward: "1 room" },
    { title: "First Victory", desc: "Win any game once.", current: Math.min(wins, 1), target: 1, reward: "1 win" },
    { title: "High Scorer", desc: "Set a best score in any game.", current: best > 0 ? 1 : 0, target: 1, reward: "1 record" }
  ];
  grid.innerHTML = achievements.map((item) => {
    const complete = item.current >= item.target;
    const progress = Math.min(100, Math.round((item.current / item.target) * 100));
    return `<article class="page-card achievement-card ${complete ? "is-earned" : ""}"><div class="achievement-top"><span class="achievement-symbol">${complete ? "✓" : "☆"}</span><span class="achievement-state">${complete ? "UNLOCKED" : "IN PROGRESS"}</span></div><h2>${item.title}</h2><p>${item.desc}</p><div class="achievement-progress"><span style="width:${progress}%"></span></div><small>${item.current}/${item.target} ${item.reward}</small></article>`;
  }).join("");
}

function renderSettings() {
  const compact = readRaw(STORAGE.compact) === "true";
  const reduce = readRaw(STORAGE.motion) === "true";
  const theme = getThemePreference();
  const compactInput = $("#compactLayoutToggle");
  const motionInput = $("#reduceMotionToggle");
  if (compactInput) compactInput.checked = compact;
  if (motionInput) motionInput.checked = reduce;
  $$('input[name="themeMode"]').forEach((input) => {
    input.checked = input.value === theme;
  });
  $("#settingsPlayerName").textContent = playerName();
}

function applyAppearance() {
  document.body.classList.toggle("compact-ui", readRaw(STORAGE.compact) === "true");
  document.body.classList.toggle("reduce-motion", readRaw(STORAGE.motion) === "true");
  applyTheme();
}

/* =============================================================
 * NAVIGATION
 * ============================================================= */
const PAGE_META = {
  overview: { group: "Workspace", title: "Overview" },
  library: { group: "Workspace", title: "Game Library" },
  play: { group: "Workspace", title: "Play" },
  rooms: { group: "Workspace", title: "Rooms" },
  progress: { group: "Your Space", title: "Progress" },
  settings: { group: "Preferences", title: "Settings" },
  help: { group: "Preferences", title: "Help & Support" }
};

function renderDynamicPage(page) {
  if (page === "library") { renderFilterChips(); renderLibrary(); }
  else if (page === "play") {
    renderPickerPage("playGrid", "playSearch", "playEmpty");
    renderCompactCollection("playRecentGrid", readJSON(STORAGE.recent, []), "playRecentEmpty");
    renderCompactCollection("playFavoritesGrid", readJSON(STORAGE.favorites, []), "playFavoritesEmpty");
  }
  else if (page === "progress") {
    renderCompactHistory();
    renderProgressStats();
    renderProgressAchievements();
  }
  else if (page === "settings") renderSettings();
}

function refreshActiveDynamicPage() {
  renderDynamicPage(currentPage);
}

function navigate(page, updateHash = true) {
  if (!PAGE_META[page]) page = "overview";
  currentPage = page;
  $$("[data-page-view]").forEach((view) => {
    view.hidden = view.dataset.pageView !== page;
  });
  $$("[data-page-link]").forEach((link) => {
    const active = link.dataset.pageLink === page;
    link.classList.toggle("active", active);
    if (active) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  });
  closeMoreMenu();
  const meta = PAGE_META[page];
  $("#breadcrumbGroup").textContent = meta.group;
  $("#breadcrumbCurrent").textContent = meta.title;
  if (updateHash && location.hash !== `#${page}`) {
    history.pushState({ page }, "", `#${page}`);
  }
  window.scrollTo(0, 0);
  renderDynamicPage(page);
}

/* "More" is a static group in the desktop rail and a bottom sheet on mobile. */
function toggleMoreMenu(force) {
  const moreNav = $("#moreNav");
  if (!moreNav) return;
  const open = typeof force === "boolean" ? force : !moreNav.classList.contains("is-open");
  moreNav.classList.toggle("is-open", open);
  const backdrop = $(".more-backdrop");
  if (backdrop) backdrop.hidden = !open;
  const moreToggle = $(".more-toggle");
  if (moreToggle) moreToggle.setAttribute("aria-expanded", String(open));
}

function closeMoreMenu() {
  toggleMoreMenu(false);
}

/* =============================================================
 * INFO / ACTIONS
 * ============================================================= */
function showInfo(title, html) {
  $("#infoTitle").textContent = title;
  $("#infoCopy").innerHTML = html;
  openDialog("infoDialog");
}

function handleAction(action) {
  switch (action) {
    case "create-room": closeMoreMenu(); selectGame(selectedGameId); break;
    case "browse-games": navigate("library"); break;
    case "toggle-menu": toggleMoreMenu(); break;
    case "profile": renderProfile(); openDialog("profileDialog"); break;
    case "about": showInfo(
      "About Game Space",
      "<p>Game Space is a lightweight browser-game hub. Pick a game from the catalog and play immediately, or create a private room for two players.</p><p>Solo play runs entirely in your browser. Favorites, history, best scores, and preferences are stored locally on this device.</p>"
    ); break;
    case "privacy": showInfo(
      "Privacy",
      "<p>No account is required to play. Your display name, favorites, history, and settings are saved only in this browser's local storage.</p><p>Private rooms use an anonymous guest identity to connect two players. Room codes are shared only by invitation and are not published on this site.</p>"
    ); break;
    case "help": showInfo(
      "How rooms work",
      "<p>Choose <strong>Play Solo</strong> for an offline match. To play with a friend, create a room and share its six-character code. Your friend opens this same site and joins with that code.</p><p>Online play requires a Firebase project configured in <code>JS/firebase-config.js</code>. The database only relays room membership, actions, and game state; the game itself still runs in the browser.</p><p><strong>Note:</strong> titles marked Solo run the same game locally for each player without live sync. Favorites, history, best scores, and preferences are saved in this browser's local storage only.</p>"
    ); break;
  }
}

/* =============================================================
 * WELCOME (user pertama)
 * ============================================================= */
/* Hanya izinkan path relatif/local — jangan sampai jadi open redirect. */
function safeNextUrl() {
  const value = (new URLSearchParams(location.search).get("next") || "").trim();
  if (!value || value.startsWith("//") || /[\\\r\n]/.test(value)) return "";
  if (/^[a-zA-Z][a-zA-Z\d+.-]*:/.test(value)) return "";
  return value;
}

function maybeShowWelcome() {
  if (hasPlayerName()) return;
  openDialog("welcomeDialog");
  $("#welcomeNameInput").focus();
}
function submitWelcome() {
  const input = $("#welcomeNameInput");
  const error = $("#welcomeError");
  if (!savePlayerName(input.value)) {
    error.textContent = "Please enter a display name (1–20 characters).";
    error.hidden = false;
    input.focus();
    return;
  }
  error.hidden = true;
  renderProfile();
  closeDialog("welcomeDialog");
  toast(`Welcome, ${playerName()}! Your name is saved on this device.`);
  const next = safeNextUrl();
  if (next) location.assign(next);
}

/* =============================================================
 * EVENT WIRING
 * ============================================================= */
document.addEventListener("click", (event) => {
  const pageLink = event.target.closest("[data-page-link]");
  if (pageLink) {
    event.preventDefault();
    navigate(pageLink.dataset.pageLink);
    return;
  }

  const actionButton = event.target.closest("[data-action]");
  if (actionButton) {
    handleAction(actionButton.dataset.action);
    return;
  }

  const playButton = event.target.closest("[data-play]");
  if (playButton) {
    selectGame(playButton.dataset.play);
    return;
  }

  const favoriteButton = event.target.closest("[data-favorite]");
  if (favoriteButton) {
    toggleFavorite(favoriteButton.dataset.favorite);
    return;
  }

  const filterButton = event.target.closest("[data-filter]");
  if (filterButton) {
    activeFilter = filterButton.dataset.filter;
    $$("#filterList .filter-chip").forEach((chip) => {
      const active = chip === filterButton;
      chip.classList.toggle("active", active);
      chip.setAttribute("aria-pressed", String(active));
    });
    renderLibrary();
    return;
  }

  const modeButton = event.target.closest("[data-launch-mode]");
  if (modeButton) {
    startSelectedMode(modeButton.dataset.launchMode);
    return;
  }

  const closeButton = event.target.closest("[data-close]");
  if (closeButton) closeDialog(closeButton.dataset.close);
});

$("#gameSearch").addEventListener("input", () => {
  window.clearTimeout(searchDebounce);
  searchDebounce = window.setTimeout(renderLibrary, 120);
});
$("#playSearch")?.addEventListener("input", () => renderPickerPage("playGrid", "playSearch", "playEmpty"));
$("#launchGameSelect").addEventListener("change", (event) => {
  selectedGameId = event.target.value;
});
$("#joinRoomSubmit").addEventListener("click", submitJoinRoom);
$("#joinRoomCode").addEventListener("keydown", (event) => {
  if (event.key === "Enter") submitJoinRoom();
});
function submitJoinFromPage(inputId) {
  const value = $(inputId).value.trim().toUpperCase();
  $("#joinRoomCode").value = value;
  $("#joinError").hidden = true;
  openDialog("joinDialog");
  submitJoinRoom();
}
$("#roomsJoinSubmit")?.addEventListener("click", () => submitJoinFromPage("#roomsJoinCode"));
$("#roomsJoinCode")?.addEventListener("keydown", (event) => {
  if (event.key === "Enter") submitJoinFromPage("#roomsJoinCode");
});
$("#welcomeSubmit").addEventListener("click", submitWelcome);
$("#welcomeNameInput").addEventListener("keydown", (event) => {
  if (event.key === "Enter") submitWelcome();
});
$("#saveProfile").addEventListener("click", () => {
  const error = $("#profileError");
  if (!savePlayerName($("#playerNameInput").value)) {
    if (error) {
      error.textContent = "Name cannot be empty (1–20 characters).";
      error.hidden = false;
    }
    return;
  }
  if (error) error.hidden = true;
  renderProfile();
  closeDialog("profileDialog");
  toast("Player name saved on this device.");
});
$("#closeGameButton").addEventListener("click", closeGame);
$("#shareRoomButton").addEventListener("click", copyRoomCode);
["compactLayoutToggle", "reduceMotionToggle"].forEach((id) => {
  const input = document.getElementById(id);
  if (!input) return;
  input.addEventListener("change", () => {
    const key = id === "compactLayoutToggle" ? STORAGE.compact : STORAGE.motion;
    const className = id === "compactLayoutToggle" ? "compact-ui" : "reduce-motion";
    writeRaw(key, String(input.checked));
    document.body.classList.toggle(className, input.checked);
  });
});
$$('input[name="themeMode"]').forEach((input) => {
  input.addEventListener("change", () => {
    if (!input.checked) return;
    setThemePreference(input.value);
  });
});
initThemeButtons();
$("#resetDataButton")?.addEventListener("click", () => {
  if (!window.confirm("Reset all local data? This clears your name, favorites, history, best scores, room counter, and preferences on this device.")) return;
  [...Object.values(STORAGE)].forEach(removeRaw);
  location.reload();
});

$$(".dialog-backdrop").forEach((backdrop) => backdrop.addEventListener("click", (event) => {
  if (event.target === backdrop && !backdrop.hasAttribute("data-persistent")) backdrop.hidden = true;
}));
document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  closeMoreMenu();
  const openDialogEl = $$(".dialog-backdrop")
    .filter((element) => !element.hidden && !element.hasAttribute("data-persistent"))
    .find(Boolean);
  if (openDialogEl) openDialogEl.hidden = true;
});
window.addEventListener("popstate", () => navigate(location.hash.slice(1), false));
window.addEventListener("hashchange", () => {
  const next = location.hash.slice(1);
  if (PAGE_META[next] && next !== currentPage) navigate(next, false);
});

/* =============================================================
 * BOOT
 * ============================================================= */
selectedGameId = readJSON(STORAGE.recent, []).map((id) => gameById(id)).find(Boolean)?.id || GAMES[0]?.id || "";
applyAppearance();
renderProfile();
renderOverviewStats();
renderGameOptions();
$("#currentYear").textContent = new Date().getFullYear();
navigate(location.hash.slice(1) || "overview", false);
maybeShowWelcome();

const roomFromUrl = new URLSearchParams(location.search).get("room");
if (roomFromUrl) {
  $("#joinRoomCode").value = roomFromUrl.toUpperCase();
  openDialog("joinDialog");
}

/* Hook hanya untuk automated checks (?test=1). Tidak diekspos di produksi. */
if (new URLSearchParams(location.search).has("test")) {
  globalThis.__MGP_TEST__ = {
    GAMES,
    launchGame,
    closeGame,
    gameById,
    navigate,
    createRoom,
    joinRoom,
    startSelectedMode,
    getRoom: () => currentRoom,
    getCurrentGame: () => currentGame,
    getStats: () => ({ ...stats }),
  };
  globalThis.__MGP_TEST_READY__ = true;
}
