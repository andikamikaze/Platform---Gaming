/*
 * Klien data komunitas. Semua data nyata ada di Firebase Realtime Database
 * di bawah node `community/`. Tidak ada data mock/seed di dalam halaman.
 *
 * Identitas memakai uid Anonymous Auth yang sama dengan room multiplayer,
 * sehingga nama dan keanggotaan konsisten lintas halaman & perangkat.
 */
import { getFirebaseServices, getSignedInUser } from "./firebase.js";

let communityPromise = null;

export function snapshotMap(snapshot) {
  const value = snapshot?.val?.() ?? null;
  if (!value || typeof value !== "object") return {};
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, { ...(item || {}), id: key }]));
}

export async function connectCommunity({ name, initials, color }) {
  if (communityPromise) return communityPromise;
  communityPromise = (async () => {
    const services = await getFirebaseServices();
    const user = await getSignedInUser(services);
    const { db, dbSdk } = services;
    const uid = user.uid;
    const ref = (...segments) => dbSdk.ref(db, ["community", ...segments].join("/"));
    const refs = {
      users: ref("users"),
      communities: ref("communities"),
      members: ref("members"),
      posts: ref("posts"),
      likes: ref("likes"),
      comments: ref("comments"),
      events: ref("events"),
      rsvps: ref("rsvps"),
    };
    const userRef = ref("users", uid);

    const client = {
      uid,
      dbSdk,
      refs,
      ref,

      subscribe(handlers = {}) {
        const listen = (key, target) => {
          if (typeof handlers[key] !== "function") return () => {};
          return dbSdk.onValue(target, (snapshot) => handlers[key](snapshotMap(snapshot)), (error) => {
            handlers.error?.(error, key);
          });
        };
        const stop = [
          listen("onUsers", refs.users),
          listen("onCommunities", refs.communities),
          listen("onMembers", refs.members),
          listen("onPosts", refs.posts),
          listen("onLikes", refs.likes),
          listen("onComments", refs.comments),
          listen("onEvents", refs.events),
          listen("onRsvps", refs.rsvps),
        ];
        return () => stop.forEach((unsubscribe) => {
          try { unsubscribe(); } catch (_) { }
        });
      },

      async publishProfile() {
        const snapshot = await dbSdk.get(userRef);
        const patch = {
          name,
          initials,
          color,
          online: true,
          lastSeen: dbSdk.serverTimestamp(),
        };
        if (!snapshot.exists()) patch.joinedAt = dbSdk.serverTimestamp();
        await dbSdk.update(userRef, patch);
        await dbSdk.onDisconnect(userRef).update({
          online: false,
          lastSeen: dbSdk.serverTimestamp(),
        });
      },

      async setOnline(online) {
        await dbSdk.update(userRef, { online: Boolean(online), lastSeen: dbSdk.serverTimestamp() });
      },

      async disconnect() {
        try { await dbSdk.onDisconnect(userRef).cancel(); } catch (_) { }
        await client.setOnline(false);
      },

      async setMember(communityId, joined) {
        const target = ref("members", communityId, uid);
        if (joined) await dbSdk.set(target, true);
        else await dbSdk.remove(target);
      },

      async createPost({ communityId, title, body, tags = [] }) {
        const newRef = dbSdk.push(refs.posts, {
          communityId,
          authorUid: uid,
          authorName: name,
          authorInitials: initials,
          title,
          body,
          tags,
          createdAt: dbSdk.serverTimestamp(),
        });
        await newRef;
        return newRef.key;
      },

      async toggleLike(postId) {
        const target = ref("likes", postId, uid);
        const snapshot = await dbSdk.get(target);
        if (snapshot.exists()) await dbSdk.remove(target);
        else await dbSdk.set(target, true);
      },

      async addComment(postId, { body }) {
        await dbSdk.push(ref("comments", postId), {
          authorUid: uid,
          authorName: name,
          authorInitials: initials,
          body,
          createdAt: dbSdk.serverTimestamp(),
        });
      },

      async toggleRsvp(eventId) {
        const target = ref("rsvps", eventId, uid);
        const snapshot = await dbSdk.get(target);
        if (snapshot.exists()) await dbSdk.remove(target);
        else await dbSdk.set(target, true);
      },
    };

    await client.publishProfile();
    return client;
  })().catch((error) => {
    communityPromise = null;
    throw error;
  });
  return communityPromise;
}
