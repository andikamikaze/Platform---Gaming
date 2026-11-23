#!/usr/bin/env node
/**
 * Seed sekali untuk data awal komunitas.
 *
 * Tidak memakai service-account: script mendaftar Anonymous lewat REST API,
 * lalu menulis komunitas & event dengan createdBy = uid tersebut. Aturan
 * database mengizinkan penulisan oleh pembuatnya sendiri.
 *
 *   npm run seed:community
 */
import { firebaseConfig } from "../JS/firebase-config.js";

const apiKey = firebaseConfig.apiKey;
const databaseURL = String(firebaseConfig.databaseURL || "").replace(/\/+$/, "");

if (!apiKey || !databaseURL) {
  console.error("Firebase config belum lengkap di JS/firebase-config.js");
  process.exit(1);
}

async function anonymousToken() {
  const response = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ returnSecureToken: true }),
    }
  );
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body.idToken) {
    throw new Error(`Anonymous sign-in gagal: ${body.error?.message || response.status}`);
  }
  return { idToken: body.idToken, uid: body.localId };
}

async function put(path, value, token) {
  const url = `${databaseURL}/${path}.json?auth=${encodeURIComponent(token)}`;
  const response = await fetch(url, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(value),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`${path}: ${body.error || response.status}`);
}

const { idToken, uid } = await anonymousToken();
const now = Date.now();
const day = 24 * 60 * 60 * 1000;
const iso = (offsetDays, hour = 20) => {
  const value = new Date(now + offsetDays * day);
  value.setHours(hour, 0, 0, 0);
  return value.toISOString();
};

const communities = [
  {
    id: "valorant-hub", name: "Valorant Hub", description: "Ranked sessions, scrims & team finding",
    category: "competitive", badge: "V", badgeTone: "blue",
  },
  {
    id: "co-op-corner", name: "Co-op Corner", description: "Good teamwork, no pressure, all welcome",
    category: "co-op", badge: "DRG", badgeTone: "orange",
  },
  {
    id: "minecraft-builders", name: "Minecraft Builders", description: "Share builds and create worlds together",
    category: "creative", badge: "MC", badgeTone: "green",
  },
  {
    id: "rocket-league-garage", name: "Rocket League Garage", description: "Climb ranks and learn new mechanics",
    category: "competitive", badge: "RL", badgeTone: "purp",
  },
];

const events = [
  {
    id: "unrated-squad-night", title: "Unrated Squad Night", communityId: "valorant-hub",
    description: "Valorant Hub · squad night", startsAt: iso(2, 20),
  },
  {
    id: "deep-rock-full-crew", title: "Deep Rock: Full Crew", communityId: "co-op-corner",
    description: "Co-op Corner · full mining crew", startsAt: iso(4, 19),
  },
  {
    id: "community-build-jam", title: "Community Build Jam", communityId: "minecraft-builders",
    description: "Minecraft Builders · build together", startsAt: iso(6, 16),
  },
];

for (const community of communities) {
  const { id, ...data } = community;
  await put(`community/communities/${id}`, { ...data, createdBy: uid, createdAt: now }, idToken);
  console.log(`komunitas: ${community.name}`);
}

for (const event of events) {
  const { id, ...data } = event;
  await put(`community/events/${id}`, { ...data, createdBy: uid, createdAt: now }, idToken);
  console.log(`event: ${event.title}`);
}

console.log("\nSeed komunitas selesai. Data awal sekarang tersimpan di Firebase.");
