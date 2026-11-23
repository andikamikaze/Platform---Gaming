/*
 * Identitas bersama dashboard (index.html) dan halaman komunitas.
 * Sumber kebenaran: localStorage[gamespace_player_name] — sama seperti
 * alur onboarding Game Space yang sudah ada. Tidak ada akun/login baru.
 */
export const PLAYER_NAME_KEY = "gamespace_player_name";

const AVATAR_TONES = ["primary", "orange", "green", "purple"];
let sessionName = "";

function storageGet() {
  try { return localStorage.getItem(PLAYER_NAME_KEY) || ""; } catch (_) { return ""; }
}
function storageSet(value) {
  try { localStorage.setItem(PLAYER_NAME_KEY, value); } catch (_) { }
}

export function rawPlayerName() {
  return (storageGet() || sessionName).trim().slice(0, 20);
}

export function getDisplayName() {
  return rawPlayerName() || "Guest";
}

export function hasDisplayName() {
  return Boolean(rawPlayerName());
}

export function saveDisplayName(value) {
  const name = String(value || "").trim().slice(0, 20);
  if (!name) return false;
  sessionName = name;
  storageSet(name);
  return true;
}

export function playerInitials(name = getDisplayName()) {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "G";
  return (parts[0][0] + (parts[1]?.[0] || "")).toUpperCase();
}

export function playerAvatarTone(name = getDisplayName()) {
  const text = String(name || "");
  let hash = 0;
  for (let index = 0; index < text.length; index += 1) {
    hash = (hash * 31 + text.charCodeAt(index)) >>> 0;
  }
  return AVATAR_TONES[hash % AVATAR_TONES.length];
}

export function clearSessionName() {
  sessionName = "";
}
