/* =========================================================================
   SAKUKU — Firebase Setup (Web Modular SDK v12)
   -------------------------------------------------------------------------
   File ini adalah SATU-SATUNYA tempat Anda menempel konfigurasi Firebase.

   CARA MENEMPEL KONFIGURASI (dari Firebase Console):
   1. Buka https://console.firebase.google.com -> buka project Anda.
   2. Ikon gerigi (Project Settings) -> tab General -> bagian "Your apps".
   3. Klik ikon Web </> (atau "Add app" lalu pilih Web).
      Jika belum ada aplikasi web, daftarkan dulu dengan nama bebas.
   4. Firebase akan menampilkan objek firebaseConfig, contoh:
        const firebaseConfig = {
          apiKey: "AIzaSy...",
          authDomain: "proyek-anda.firebaseapp.com",
          databaseURL: "https://proyek-anda-default-rtdb.firebaseio.com",
          projectId: "proyek-anda",
          storageBucket: "proyek-anda.appspot.com",
          messagingSenderId: "123456789012",
          appId: "1:123456789012:web:abcdef..."
        };
   5. Salin masing-masing nilainya ke objek FIREBASE_CONFIG di bawah,
      mengganti semua nilai yang bertuliskan "PASTE_DI_SINI".
   6. Simpan file, lalu muat ulang halaman.
   ========================================================================= */

// >>>>>>>>>>>>>>>>>>>>>>>>>> TEMPAT TEMPEL KONFIGURASI <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
export const FIREBASE_CONFIG = {
  apiKey: "AIzaSyCZ1ZYd49fMaSHovLIvS_wwtJjF48jGXis",
  authDomain: "iksan-tracking-financial.firebaseapp.com",
  databaseURL: "https://iksan-tracking-financial-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "iksan-tracking-financial",
  storageBucket: "iksan-tracking-financial.firebasestorage.app",
  messagingSenderId: "459725559148",
  appId: "1:459725559148:web:ebb146cf119997dbb2cf49",
  measurementId: "G-JDSWGVB93G"
};
// >>>>>>>>>>>>>>>>>>>>>>>>>> TEMPAT TEMPEL KONFIGURASI <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<

/* =========================================================================
   FIREBASE WEB MODULAR SDK v12 — dimuat langsung dari CDN Google.
   ========================================================================= */
import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.3.0/firebase-app.js';
import {
  getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged
} from 'https://www.gstatic.com/firebasejs/12.3.0/firebase-auth.js';
import {
  getDatabase, ref, onValue, off, set, push, update, remove
} from 'https://www.gstatic.com/firebasejs/12.3.0/firebase-database.js';

let app = null;
let auth = null;
let db = null;

// Cek apakah konfigurasi sudah diisi di file ini (belum berisi "PASTE_DI_SINI")
export function isConfigured() {
  const c = FIREBASE_CONFIG;
  const required = [c.apiKey, c.authDomain, c.databaseURL, c.projectId, c.appId];
  return required.every(v => typeof v === 'string' && v.length > 5 && v !== 'PASTE_DI_SINI');
}

// Inisialisasi Firebase (App + Auth + Database). Dipanggil sekali.
export function initFirebase() {
  if (app) return app;
  if (!isConfigured()) throw new Error('Konfigurasi Firebase belum diisi di firebase.js');
  app = initializeApp(FIREBASE_CONFIG);
  auth = getAuth(app);
  db = getDatabase(app);
  return app;
}

export function getAuthService() { return auth; }
export function getDb() { return db; }

// Listener perubahan status login; mengembalikan fungsi un-subscribe
export function onAuthChanged(cb) {
  return onAuthStateChanged(auth, cb);
}

export function signInWithGoogle() {
  return signInWithPopup(auth, new GoogleAuthProvider());
}

export function signOutUser() {
  return signOut(auth);
}

/* =========================================================================
   DATABASE — struktur per akun:
       users
        └── UID
             └── transactions
                    └── <autoId>   (dibuat otomatis oleh push)
   ========================================================================= */
function txRef(uid) {
  return ref(db, 'users/' + uid + '/transactions');
}
function txItemRef(uid, id) {
  return ref(db, 'users/' + uid + '/transactions/' + id);
}

// Berlangganan perubahan data transaksi milik satu akun (realtime).
// cb menerima snapshot (objek map autoId -> transaksi) atau null jika kosong.
export function subscribeTransactions(uid, cb) {
  const r = txRef(uid);
  onValue(r, snap => cb(snap.val()));
  return () => off(r, 'value');
}

// Tambah transaksi baru -> key (autoId) dibuat otomatis oleh Firebase
export function addTransactionToDb(uid, tx) {
  return push(txRef(uid), tx);
}

// Edit transaksi berdasarkan autoId
export function updateTransactionInDb(uid, id, patch) {
  return update(txItemRef(uid, id), patch);
}

// Hapus transaksi berdasarkan autoId
export function deleteTransactionFromDb(uid, id) {
  return remove(txItemRef(uid, id));
}

// Unggah seluruh map transaksi sekaligus (dipakai untuk migrasi data lama)
export function replaceTransactions(uid, map) {
  return set(txRef(uid), map);
}

// Pantau status koneksi ke server Firebase (.info/connected)
export function watchConnection(cb) {
  const r = ref(db, '.info/connected');
  onValue(r, snap => cb(snap.val() === true));
  return () => off(r, 'value');
}
