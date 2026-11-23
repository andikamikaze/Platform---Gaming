/*
 * Satu-satunya tempat inisialisasi Firebase SDK dan Anonymous Authentication.
 * Dipakai oleh room-client.js (room multiplayer) dan community-client.js
 * (komunitas) supaya keduanya memakai services & uid yang sama.
 */
import { firebaseConfig, firebaseSdkVersion } from "./firebase-config.js";

let firebaseServicesPromise;

export function isFirebaseConfigured() {
  const required = ["apiKey", "authDomain", "databaseURL", "projectId", "appId"];
  return required.every((key) => {
    const value = firebaseConfig?.[key];
    return typeof value === "string" && value.trim() && !value.includes("YOUR_");
  });
}

export async function getFirebaseServices() {
  if (!isFirebaseConfigured()) {
    throw new Error("Firebase belum dikonfigurasi. Isi JS/firebase-config.js terlebih dahulu.");
  }
  if (!firebaseServicesPromise) {
    firebaseServicesPromise = (async () => {
      const base = `https://www.gstatic.com/firebasejs/${firebaseSdkVersion}`;
      // firebase-app harus dievaluasi lebih dulu supaya auth/database memakai
      // registry aplikasi yang sama.
      const appSdk = await import(`${base}/firebase-app.js`);
      const authSdk = await import(`${base}/firebase-auth.js`);
      const dbSdk = await import(`${base}/firebase-database.js`);
      const app = appSdk.initializeApp(firebaseConfig);
      const auth = authSdk.getAuth(app);
      const db = dbSdk.getDatabase(app);
      return { app, auth, db, authSdk, dbSdk };
    })().catch((error) => {
      firebaseServicesPromise = null;
      throw new Error(`Tidak dapat memuat Firebase SDK: ${error.message}`);
    });
  }
  return firebaseServicesPromise;
}

export async function getSignedInUser(services) {
  const { auth, authSdk } = services;
  if (auth.currentUser) return auth.currentUser;
  await authSdk.signInAnonymously(auth);
  if (!auth.currentUser) throw new Error("Anonymous sign-in belum berhasil.");
  return auth.currentUser;
}
