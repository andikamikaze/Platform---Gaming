/*
 * Isi konfigurasi dari Firebase Console > Project settings > Your apps.
 * Buat juga Realtime Database, lalu aktifkan Anonymous sign-in di Authentication.
 * Firebase web config boleh berada di frontend; jangan pernah menaruh service-account key di sini.
 */
export const firebaseConfig = {
  apiKey: "AIzaSyBd4SDf1giFrGhBKNRTM8ANRw8UrTyDXqs",
  authDomain: "platform---gaming.firebaseapp.com",
  databaseURL: "https://platform---gaming-default-rtdb.asia-southeast1.firebasedatabase.app/",
  projectId: "platform---gaming",
  storageBucket: "platform---gaming.firebasestorage.app",
  messagingSenderId: "193333356861",
  appId: "1:193333356861:web:c4931b16912384727ebd54",
  measurementId: "G-8QPCCGNGBM"
};

export const firebaseSdkVersion = "11.10.0";