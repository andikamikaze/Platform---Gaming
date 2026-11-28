# Game Platform — Design Document

> **Dokumen:** `design.md`  
> **Status:** Baseline desain awal  
> **Jenis produk:** Static browser-game hub  
> **Target perangkat:** Desktop, tablet, dan mobile  
> **Hosting dashboard:** GitHub Pages  
> **Multiplayer:** Firebase Realtime Database (private two-player rooms)

---

## 1. Ringkasan Produk

**Game Platform** adalah portal permainan berbasis browser yang mengumpulkan game-game sederhana dalam satu dashboard. Pengguna dapat menemukan game, membuka halaman detail, lalu langsung bermain tanpa memasang aplikasi.

Dashboard dan aset inti disajikan sebagai situs statis melalui GitHub Pages. Setiap game dimuat sesuai kebutuhan (*on demand*) agar halaman awal tetap ringan. Pertandingan solo berjalan sepenuhnya di browser. Game yang mendukung dua pemain dapat memakai private room melalui Firebase Realtime Database untuk menemukan room berdasarkan kode undangan, mengelola presence pemain, meneruskan aksi, dan menyinkronkan state pertandingan.

### 1.1 Prinsip utama

1. **Game first:** akses ke daftar game dan tombol bermain harus menjadi fokus utama.
2. **Minimalis:** antarmuka bersih, konten tidak padat, dekorasi seperlunya, dan hierarki visual yang jelas.
3. **Responsive by default:** seluruh alur utama dapat digunakan dengan nyaman memakai mouse, keyboard, maupun sentuhan.
4. **Load on demand:** kode game tidak dimuat sebelum pengguna memilih game tersebut.
5. **Local-first:** mode solo tidak membutuhkan akun, database, atau koneksi backend.
6. **Multiplayer terisolasi:** komunikasi multiplayer hanya aktif pada game dan room yang membutuhkannya.
7. **Modular:** setiap game mengikuti kontrak integrasi yang sama agar dapat ditambahkan tanpa mengubah dashboard secara besar-besaran.
8. **Ikon terpusat:** seluruh ikon UI dan cover art berasal dari `JS/icons.js` (satu sumber path SVG, `viewBox 0 0 24 24`, `stroke currentColor`, tanpa fill). Dilarang memakai glyph Unicode sebagai ikon atau menulis SVG inline baru di komponen.
9. **UI game terpusat:** seluruh chrome game (HUD, panel info, tombol kontrol, overlay, touch pad) dibuat oleh satu UI kit (`JS/game-ui.js` + `CSS/game-ui.css`). Modul game hanya mengirim data dan logika gameplay.

### 1.2 Sistem ikon

- `JS/icons.js` menyimpan `paths`, `iconPaths()`, `iconSVG()`, `hydrateIcons()`, dan `setIcon()`.
- `JS/game-icons.js` memetakan tiap id game ke nama ikon; generator manifest memakai pemetaan ini untuk seluruh cover art.
- Placeholder HTML: `<span class="icon" data-icon="nama"></span>`; diisi saat boot oleh `hydrateIcons()`.
- Ikon dinamis (tema, favorit) memakai `setIcon()` / `iconSVG()` langsung.

---

## 2. Sasaran dan Batasan

### 2.1 Sasaran produk

- Menyediakan katalog game sederhana dalam satu website.
- Membuat pengguna dapat memulai permainan dalam sesedikit mungkin langkah.
- Menampilkan informasi penting setiap game: nama, kategori, deskripsi singkat, jumlah pemain, dan dukungan perangkat.
- Menyediakan pengalaman solo yang berjalan di browser.
- Mendukung private room untuk game dua pemain yang kompatibel.
- Memastikan layout dan kontrol dapat digunakan pada layar kecil maupun besar.
- Mempermudah penambahan game baru melalui metadata dan modul mandiri.

### 2.2 Di luar cakupan versi awal

- Akun pengguna permanen, profil publik, dan sistem pertemanan.
- Chat publik, voice chat, atau matchmaking global.
- Leaderboard lintas perangkat yang membutuhkan backend tepercaya.
- Pembelian dalam aplikasi, iklan, atau sistem mata uang virtual.
- Game 3D berat atau game yang membutuhkan server simulasi khusus.
- Jaminan anti-cheat penuh untuk pertandingan yang hanya memakai client dan Firebase.

### 2.3 Asumsi desain

- Dashboard tidak menyimpan data permainan penting di server.
- Game solo menyimpan pengaturan atau progres lokal melalui browser storage bila diperlukan.
- Firebase hanya digunakan oleh modul multiplayer, bukan sebagai ketergantungan global untuk semua game.
- Identitas tamu menggunakan Firebase Anonymous Authentication atau mekanisme autentikasi setara agar akses database dapat dibatasi per pengguna.
- Game yang membutuhkan sinkronisasi real-time harus mendefinisikan aturan siapa yang berwenang menentukan state, misalnya host-authoritative atau turn-based.

---

## 3. Pengguna dan Skenario Penggunaan

### 3.1 Pengguna utama

- **Casual player:** ingin membuka game sederhana dan langsung bermain.
- **Returning player:** ingin menemukan kembali game yang pernah dimainkan.
- **Two-player user:** ingin bermain dengan satu teman melalui kode room pribadi.
- **Mobile player:** ingin bermain dengan kontrol sentuh tanpa harus memperbesar atau menggeser halaman secara tidak perlu.

### 3.2 Skenario utama

**A. Memulai game solo**

1. Pengguna membuka dashboard.
2. Pengguna memilih game dari katalog atau pencarian.
3. Pengguna membuka detail game dan memilih **Play Solo**.
4. Modul game dimuat ke area permainan.
5. Pengguna bermain; hasil dan pengaturan lokal ditangani oleh game.
6. Pengguna memilih **Back to Games** untuk kembali ke katalog.

**B. Membuat private room**

1. Pengguna membuka game yang mendukung dua pemain.
2. Pengguna memilih **Create Room**.
3. Aplikasi membuat identitas tamu bila belum tersedia, lalu membuat room di Firebase.
4. Aplikasi menampilkan kode atau tautan undangan.
5. Pemain kedua membuka game yang sama dan memasukkan kode undangan.
6. Kedua pemain melihat status koneksi dan kesiapan.
7. Host memulai pertandingan setelah kedua pemain siap.

**C. Bergabung ke private room**

1. Pengguna memilih **Join Room**.
2. Pengguna memasukkan kode undangan.
3. Aplikasi memeriksa room, kapasitas, versi game, dan status room.
4. Pengguna masuk sebagai pemain kedua.
5. UI menampilkan status **Waiting**, **Ready**, atau pesan kesalahan yang relevan.

---

## 4. Arsitektur Informasi

### 4.1 Struktur navigasi

Navigasi utama dibuat sesingkat mungkin:

- **Home / Games:** katalog seluruh game.
- **Game Detail:** ringkasan game, informasi pemain, dan pilihan mode.
- **Game Screen:** area permainan, kontrol, status, dan menu jeda.
- **Room Lobby:** membuat atau bergabung ke private room, status pemain, dan tombol siap.
- **Settings:** preferensi tampilan dan audio sederhana.

Halaman informasi tambahan seperti About dan Privacy dapat diletakkan di footer.

### 4.2 Struktur dashboard

Urutan konten dashboard:

1. **Header:** logo/nama platform, tautan Games, dan Settings.
2. **Hero ringkas:** satu kalimat penjelasan dan akses cepat ke katalog; hindari banner besar yang mendorong game ke bawah.
3. **Search and filters:** pencarian berdasarkan nama serta filter kategori dan jumlah pemain.
4. **Game catalog:** grid kartu game.
5. **Recently played (opsional):** hanya ditampilkan jika browser memiliki riwayat lokal.
6. **Footer:** versi aplikasi, About, dan Privacy.

### 4.3 Kategori awal

Kategori berikut merupakan label katalog, bukan batasan teknis:

- Puzzle
- Arcade
- Strategy
- Board & Card
- Reflex
- Word & Trivia

Setiap game dapat memiliki lebih dari satu tag.

---

## 5. Desain Visual dan Design System

### 5.1 Arah visual

Gunakan **minimalist game utility**: tampilan modern, ringan, dan fungsional. UI berperan sebagai tempat memilih dan memainkan game, bukan sebagai elemen yang bersaing dengan isi game.

Karakter visual:

- Latar netral dengan permukaan konten yang jelas.
- Tipografi sederhana dan mudah dibaca.
- Kartu game ringkas dengan gambar/ilustrasi yang konsisten.
- Garis batas tipis lebih diutamakan daripada bayangan tebal.
- Warna aksen dipakai untuk tindakan utama dan status penting saja.
- Hindari gradien dekoratif, efek kaca, animasi berlebihan, dan ornamen yang tidak membantu navigasi.

### 5.2 Palet warna awal

| Token | Nilai | Penggunaan |
|---|---|---|
| `--color-bg` | `#F7F8FA` | Latar halaman |
| `--color-surface` | `#FFFFFF` | Kartu, modal, panel |
| `--color-surface-muted` | `#F1F3F5` | Area sekunder dan hover |
| `--color-text` | `#17191C` | Teks utama |
| `--color-text-muted` | `#667085` | Deskripsi dan metadata |
| `--color-border` | `#E4E7EC` | Garis pembatas |
| `--color-primary` | `#2563EB` | Tombol utama dan elemen aktif |
| `--color-primary-hover` | `#1D4ED8` | Hover/focus tombol utama |
| `--color-success` | `#16803C` | Siap, berhasil, online |
| `--color-warning` | `#B7791F` | Menunggu atau perhatian |
| `--color-danger` | `#DC2626` | Kesalahan dan tindakan destruktif |

Warna status tidak boleh menjadi satu-satunya pembeda informasi. Sertakan teks atau ikon yang sesuai. Kontras teks dan kontrol harus memenuhi WCAG 2.2 AA sebagai target aksesibilitas.

### 5.3 Dark mode

Dark mode dapat disediakan sebagai opsi setelah versi dasar stabil. Gunakan token semantik yang sama dengan nilai berbeda, bukan menambahkan warna khusus pada setiap komponen. Default awal adalah mengikuti preferensi sistem operasi; pengaturan manual, bila tersedia, disimpan secara lokal.

### 5.4 Tipografi

- Gunakan font system UI atau font web ringan seperti Inter.
- Body text: sekitar 14–16 px.
- Label dan metadata: 12–13 px, tetap terbaca.
- Heading halaman: 28–36 px pada desktop dan 24–30 px pada mobile.
- Gunakan maksimal 2–3 tingkat ukuran heading yang terlihat dalam satu layar.
- Batasi lebar paragraf agar deskripsi tidak menjadi baris yang terlalu panjang.

### 5.5 Spacing, radius, dan elevation

- Gunakan grid spacing berbasis 4 px: 4, 8, 12, 16, 24, 32, 48.
- Radius panel/kartu: 10–14 px.
- Radius tombol/input: 8–10 px.
- Border default: 1 px.
- Shadow hanya untuk elemen yang mengambang seperti dropdown atau modal.
- Pastikan area sentuh utama minimal 44 × 44 px.

### 5.6 Ikon dan ilustrasi

- Gunakan satu keluarga ikon dengan gaya garis yang konsisten.
- Ikon harus memiliki label teks bila maknanya tidak universal.
- Thumbnail game menggunakan rasio yang konsisten, disarankan 16:9 atau 4:3 sesuai kebutuhan artwork.
- Gunakan fallback visual sederhana ketika thumbnail tidak tersedia.

---

## 6. Layout Responsive

Desain dimulai dari mobile, kemudian diperluas untuk tablet dan desktop.

### 6.1 Breakpoint acuan

| Rentang | Perilaku layout |
|---|---|
| `< 640 px` | Mobile: satu kolom, navigasi ringkas, filter dapat digeser atau dibuka dalam drawer |
| `640–899 px` | Tablet kecil: dua kolom katalog bila ruang cukup |
| `900–1199 px` | Tablet besar/laptop: dua atau tiga kolom katalog |
| `≥ 1200 px` | Desktop: tiga atau empat kolom katalog, konten dibatasi lebar maksimal |

Breakpoint dapat disesuaikan berdasarkan konten aktual, bukan dipakai sebagai aturan kaku.

### 6.2 Dashboard

**Desktop**

- Header horizontal.
- Search bar dapat mengambil lebar utama.
- Filter tampil inline.
- Grid katalog tiga atau empat kolom.
- Konten memiliki lebar maksimal sekitar 1200 px dan rata tengah.

**Mobile**

- Header ringkas dengan logo dan tombol menu/settings.
- Search bar penuh satu baris.
- Filter memakai chips yang dapat digeser horizontal atau panel filter.
- Grid satu atau dua kolom sesuai lebar layar dan ukuran kartu.
- Hindari sidebar permanen.

### 6.3 Game screen

- Area game menjadi fokus utama dan berada di tengah.
- Game canvas atau board mempertahankan rasio yang ditentukan game.
- Panel status dan kontrol ditempatkan di sekitar game, bukan menutupi area interaksi.
- Pada mobile, kontrol dapat dipindahkan ke bawah area game.
- Gunakan `100dvh` sebagai pertimbangan untuk viewport mobile, dengan fallback yang aman.
- Hormati safe area perangkat, terutama pada iPhone dengan area notch/home indicator.
- Jangan memaksa halaman melakukan horizontal scroll.
- Urutan tetap: bar HUD → panel info/kontrol (bila ada) → board → touch pad (bila ada). Panel info dan kontrol berada di luar board agar tidak tertutup canvas saat overlay dibuka.
- Overlay selalu terpusat di dalam board dengan kartu seluas maksimal 600 px.

### 6.4 Orientasi layar

Game harus menentukan apakah dapat dimainkan dalam portrait, landscape, atau keduanya. Jika orientasi tertentu lebih nyaman, tampilkan saran rotasi yang dapat ditutup. Jangan mengunci orientasi melalui UI situs sebagai perilaku default.

---

## 7. Spesifikasi Halaman dan Komponen

### 7.1 Game Catalog Card

Setiap kartu game menampilkan:

- Thumbnail atau ilustrasi.
- Nama game.
- Deskripsi satu atau dua baris.
- Kategori.
- Label jumlah pemain, misalnya `1 Player` atau `1–2 Players`.
- Indikator `Solo` dan/atau `Online Room` bila relevan.
- Tombol atau area klik **View Game**.

Seluruh kartu dapat diklik, tetapi tombol utama dan keadaan hover/focus tetap harus jelas. Pada layar sentuh, jangan mengandalkan hover.

### 7.2 Game Detail

Konten minimal:

- Nama dan thumbnail game.
- Deskripsi singkat.
- Cara bermain ringkas.
- Jumlah pemain dan mode yang didukung.
- Informasi kontrol: keyboard, mouse, atau touch.
- Tombol **Play Solo**.
- Tombol **Create Room** dan **Join Room** hanya jika game memiliki dukungan multiplayer.

### 7.3 Game Shell

Game Shell adalah pembungkus umum untuk modul game. Tanggung jawabnya:

- Menyediakan area mount untuk modul.
- Menampilkan judul game dan tombol kembali.
- Menampilkan status loading/error.
- Menyediakan kontrol mute atau pengaturan umum bila disepakati.
- Menangani konfirmasi keluar saat pertandingan berlangsung.
- Membersihkan modul ketika pengguna keluar atau berpindah game.

Game Shell tidak boleh mengambil alih aturan permainan atau memodifikasi state internal game.

### 7.4 Room Lobby

Room Lobby menampilkan:

- Kode undangan dan tombol salin.
- Slot pemain 1 dan pemain 2.
- Status koneksi masing-masing pemain.
- Status Ready/Not Ready.
- Indikator menunggu pemain kedua.
- Tombol Start untuk host setelah syarat terpenuhi.
- Tombol Leave Room.
- Error state yang dapat dipahami, seperti room tidak ditemukan, penuh, kedaluwarsa, atau versi game tidak cocok.

Jangan tampilkan daftar room publik. Private room hanya dapat ditemukan melalui kode/tautan undangan.

### 7.5 Empty, loading, dan error states

Semua halaman penting harus memiliki state yang dirancang:

- **Loading:** skeleton atau spinner sederhana disertai label bila proses memakan waktu.
- **Empty search:** teks bahwa tidak ada game yang cocok dan tombol hapus filter.
- **Game load failed:** pesan singkat, tombol Retry, dan tombol kembali.
- **Network disconnected:** indikator offline dan mekanisme reconnect.
- **Room unavailable:** alasan yang spesifik tanpa mengungkap data room kepada pengguna yang tidak berhak.
- **Opponent disconnected:** tampilkan status reconnect dan kebijakan timeout yang jelas.

### 7.6 Game UI Kit (shared game chrome)

Seluruh elemen UI di dalam game dibuat oleh satu kit bersama:

- `JS/game-ui.js` — `createGameShell(root, config)` membangun HUD, panel info, panel kontrol, board, overlay, dan touch pad. Modul game hanya mengirim data; dilarang menulis `root.innerHTML` atau `<style>` sendiri.
- `CSS/game-ui.css` — satu-satunya stylesheet untuk chrome UI. Warna memakai namespace `--gui-*` yang diturunkan dari token di §5, dengan override dark mode terpusat. Aturan mobile juga ada di sini, bukan per game.
- `CSS/games.css` — kumpulan blok CSS **gameplay** per game dengan prefix masing-masing (board, canvas, karakter, partikel). Tidak boleh berisi aturan HUD/overlay/pad.

HUD terdiri dari chip sesuai preset kategori dan tepat lima tombol ikon: **Help · Cheats · Pause · Restart · Exit**. Tombol aksi khusus game (Undo, Roll, Shoot, Hint, dll) dipindah ke panel kontrol di atas board atau ke dalam overlay; fungsinya tetap ada. Stat yang tidak masuk preset tidak ditampilkan sebagai placeholder kosong.

Overlay mengikuti kontrak yang sama di semua game:

| Overlay | Struktur wajib |
| --- | --- |
| Help | Kartu 600 px, judul, `sections` berisi konten game, satu tombol Close, satu tombol primary (`Got it`), tanpa emoji/duplikat tombol |
| Cheats | Kartu 600 px, toggle `OFF/ON` dan aksi `RUN` dalam grid 3 kolom, satu tombol Close, tanpa emoji/duplikat tombol |
| Pause | Kartu 600 px, judul `Paused`, isi kosong, satu tombol `Resume` — identik di semua game |

Overlay adalah anak board dan diposisikan absolut di dalamnya; board wajib memiliki `position:relative` agar overlay tidak menutupi HUD. Ikon memakai `JS/icons.js`; glyph Unicode tidak dipakai sebagai ikon maupun dekorasi chrome.

Dengan kontrak ini, perbedaan antar game hanya boleh berada pada area gameplay dan aturan mainnya.

---

## 8. Katalog dan Metadata Game

Dashboard membaca daftar game dari satu registry statis. Registry tidak perlu mengimpor kode game secara langsung.

Contoh struktur metadata:

```ts
export type GameMeta = {
  id: string;
  title: string;
  description: string;
  category: string[];
  thumbnail: string;
  players: {
    min: number;
    max: number;
  };
  modes: Array<"solo" | "private-room">;
  controls: Array<"keyboard" | "mouse" | "touch">;
  load: () => Promise<GameModule>;
};

export type GameModule = {
  mount: (container: HTMLElement, context: GameContext) => Promise<GameInstance> | GameInstance;
};
```

Contoh registry:

```ts
export const games: GameMeta[] = [
  {
    id: "tic-tac-toe",
    title: "Tic-Tac-Toe",
    description: "A quick strategy game for two players.",
    category: ["Board & Card", "Strategy"],
    thumbnail: "/assets/games/tic-tac-toe.webp",
    players: { min: 1, max: 2 },
    modes: ["solo", "private-room"],
    controls: ["mouse", "touch"],
    load: () => import("./games/tic-tac-toe/index.js"),
  },
];
```

Catatan:

- `load()` harus memakai dynamic import agar game dimuat hanya ketika dibutuhkan.
- Registry hanya menyimpan metadata ringan dan loader.
- Validasi ID game harus dilakukan sebelum memuat modul.
- Jangan mengandalkan teks metadata sebagai sumber otorisasi multiplayer.
- Penambahan game baru tidak boleh mengharuskan dashboard mengetahui detail aturan game.

---

## 9. Kontrak Modul Game `mount()`

Setiap game diekspor sebagai modul ES module (ESM) dan menyediakan fungsi `mount()`. Kontrak ini menjadi batas integrasi antara Game Shell dan game.

### 9.1 Bentuk kontrak yang disarankan

```ts
export type GameContext = {
  mode: "solo" | "private-room";
  player: {
    id: string;
    displayName: string;
    role: "host" | "guest" | "solo";
  };
  room?: {
    id: string;
    code: string;
  };
  transport?: MultiplayerTransport;
  onExit: () => void;
};

export type GameInstance = {
  destroy: () => void;
  pause?: () => void;
  resume?: () => void;
};

export type MultiplayerTransport = {
  sendAction: (action: unknown) => Promise<void>;
  subscribeActions: (callback: (action: unknown) => void) => () => void;
  publishState?: (state: unknown, revision: number) => Promise<void>;
  subscribeState?: (callback: (state: unknown, revision: number) => void) => () => void;
};

export async function mount(
  container: HTMLElement,
  context: GameContext
): Promise<GameInstance> {
  // Initialize UI, input handlers, and game state inside container.
  return {
    destroy() {
      // Remove listeners, subscriptions, timers, and generated DOM.
    },
  };
}
```

Tipe tersebut merupakan kontrak konseptual. Implementasi final boleh menyesuaikan detail transport, tetapi bentuk lifecycle dan pemisahan tanggung jawab harus dipertahankan.

### 9.2 Tanggung jawab modul game

- Membuat dan mengelola UI hanya di dalam `container` yang diberikan.
- Menjalankan aturan permainan dan state lokal.
- Mengelola input keyboard, mouse, dan touch.
- Menggunakan `transport` hanya jika mode multiplayer aktif.
- Menyediakan fungsi `destroy()` yang membersihkan seluruh listener, subscription, timer, dan resource.
- Tidak menginisialisasi Firebase app secara terpisah jika platform sudah menyediakan transport.
- Tidak mengubah DOM di luar container game.
- Tidak mengasumsikan ukuran layar tertentu.

### 9.3 Lifecycle

1. Dashboard memanggil loader game.
2. Game Shell menampilkan loading state.
3. Game Shell menyediakan container dan context.
4. `mount(container, context)` dijalankan.
5. Modul mengembalikan instance.
6. Saat keluar, Game Shell memanggil `instance.destroy()`.
7. Subscription dan resource room dibersihkan sesuai tanggung jawabnya.

Jika `mount()` gagal, Game Shell menangkap error dan menampilkan UI retry. `destroy()` sebaiknya idempotent agar aman dipanggil lebih dari sekali.

---

## 10. Desain Multiplayer dengan Firebase Realtime Database

### 10.1 Batas penggunaan

Firebase Realtime Database digunakan hanya untuk private two-player rooms:

- Resolusi kode undangan.
- Kehadiran dan koneksi pemain (*presence*).
- Status lobby dan kesiapan pemain.
- Pengiriman aksi pemain.
- Sinkronisasi state pertandingan.

Mode solo tidak membuat koneksi Firebase. Modul game berbicara melalui interface transport; adapter Firebase berada di lapisan platform.

### 10.2 Identitas dan autentikasi

Gunakan Firebase Anonymous Authentication untuk membuat UID tamu sebelum operasi room. UID digunakan sebagai identitas teknis, bukan sebagai akun profil permanen.

Nama tampilan pemain boleh dipilih secara lokal dan harus dibatasi panjang serta karakternya. Jangan memakai nama tampilan sebagai identitas atau dasar otorisasi.

Konfigurasi Firebase yang dikirim ke browser bukan rahasia. Keamanan harus ditegakkan melalui Authentication, Realtime Database Security Rules, validasi input, dan desain data yang membatasi akses.

### 10.3 Struktur data konseptual

Struktur berikut adalah rancangan awal dan dapat disesuaikan saat implementasi:

```text
/roomInvites/{inviteCode}
  roomId: "..."
  gameId: "..."
  expiresAt: 0

/rooms/{roomId}
  meta
    gameId: "..."
    schemaVersion: 1
    status: "waiting | playing | finished | closed"
    hostUid: "..."
    createdAt: 0
    expiresAt: 0

  members
    {uid}
      displayName: "Player"
      role: "host | guest"
      ready: false
      joinedAt: 0

  presence
    {uid}
      connected: true
      lastSeen: 0

  match
    revision: 0
    state: {}
    updatedAt: 0

  actions
    {actionId}
      actorUid: "..."
      sequence: 0
      type: "..."
      payload: {}
      createdAt: 0
```

Jangan menyimpan riwayat aksi tanpa batas. Terapkan retensi terbatas atau hapus aksi lama setelah state snapshot terbaru cukup untuk melanjutkan pertandingan.

### 10.4 Siklus room

Status room:

- `waiting`: host membuat room; menunggu pemain kedua.
- `ready`: dua pemain sudah bergabung dan kondisi mulai terpenuhi.
- `playing`: pertandingan berjalan.
- `finished`: hasil akhir sudah ditetapkan.
- `closed`: room ditutup atau kedaluwarsa.

Transisi status harus divalidasi. Contohnya, room tidak boleh kembali ke `waiting` setelah pertandingan dimulai tanpa mekanisme rematch yang eksplisit.

### 10.5 Presence dan disconnect

- Daftarkan presence untuk UID pemain setelah bergabung.
- Gunakan mekanisme disconnect handling Firebase seperti `onDisconnect()` untuk menandai koneksi terputus.
- Bedakan status **disconnected** dari **left room**.
- Sediakan masa toleransi reconnect sebelum pertandingan dianggap ditinggalkan.
- Jangan mengandalkan satu event disconnect sebagai bukti bahwa pemain tidak akan kembali.
- Saat keluar secara normal, hapus atau perbarui membership/presence secara teratur.

### 10.6 Sinkronisasi aksi dan state

Untuk game sederhana, pilih salah satu model berikut per game:

**A. Turn-based**

- Pemain mengirim aksi yang merepresentasikan langkah, bukan seluruh state.
- Validasi giliran dan aksi dilakukan oleh pemilik otoritas yang ditentukan.
- Gunakan nomor urut/revision agar aksi ganda atau terlambat dapat dideteksi.

**B. Host-authoritative**

- Host memvalidasi aksi dari kedua pemain dan menerbitkan state terbaru.
- Guest mengirim intent/aksi, bukan menimpa keseluruhan state.
- Guest menerapkan state dari host sebagai sumber sinkronisasi utama.

Hindari pola dua client menulis keseluruhan state secara bebas karena dapat menyebabkan race condition dan konflik.

Setiap aksi idealnya mempunyai:

- `actionId` unik untuk deduplikasi.
- `actorUid` untuk identifikasi pengirim.
- `sequence` atau `revision` untuk urutan.
- `type` yang dibatasi oleh game.
- `payload` yang divalidasi ukuran dan bentuknya.

### 10.7 Keamanan room

- Terapkan Security Rules yang membatasi read/write hanya kepada anggota room yang sah.
- Validasi UID pemain, role, status room, dan bentuk field yang boleh ditulis.
- Batasi room maksimal dua pemain.
- Batasi ukuran payload dan jenis aksi yang diterima.
- Jangan menyimpan secret atau private key di source code frontend.
- Jangan membuka seluruh `/rooms` agar dapat dibaca publik.
- Kode undangan harus sulit ditebak dan diperlakukan sebagai bearer token. Hindari kode pendek berurutan.
- Batasi masa berlaku room dan bersihkan room kedaluwarsa melalui mekanisme yang sesuai.
- Uji rules menggunakan Firebase Emulator sebelum deployment.

**Batasan penting:** karena dashboard dan game berjalan di client tanpa server game tepercaya, Firebase Rules tidak dapat menjamin bahwa client host menjalankan aturan permainan dengan jujur. Model host-authoritative cocok untuk game kasual, tetapi bukan perlindungan anti-cheat untuk kompetisi bernilai tinggi. Game yang membutuhkan hasil tepercaya memerlukan backend/server authority.

### 10.8 Failure handling

Rancang penanganan untuk kondisi berikut:

- Kode undangan tidak ditemukan atau sudah kedaluwarsa.
- Room sudah penuh.
- Game ID atau schema version tidak cocok.
- Pemain kedua gagal bergabung.
- Koneksi terputus saat lobby atau pertandingan.
- Reconnect berhasil dengan state terbaru.
- Reconnect gagal setelah timeout.
- Host keluar sebelum atau selama pertandingan.
- Aksi duplikat, terlambat, atau tidak valid.

Pesan kesalahan harus memberi tindakan berikutnya, misalnya Retry, Copy New Invite, atau Return to Games.

---

## 11. Navigasi dan URL pada GitHub Pages

Karena GitHub Pages menyajikan file statis, routing harus kompatibel dengan refresh langsung dan konfigurasi project subpath.

Rekomendasi:

- Gunakan hash routing (`/#/games`, `/#/games/tic-tac-toe`) untuk menghindari kebutuhan rewrite server; atau
- Gunakan static route dengan fallback `404.html` bila router dan deployment sudah menyiapkannya.

Semua asset dan route harus memperhitungkan `base path` repository GitHub Pages. Hindari URL absolut yang menganggap aplikasi selalu berada di root domain.

URL konseptual:

```text
/#/games
/#/games/{gameId}
/#/play/{gameId}?mode=solo
/#/room/{gameId}/create
/#/room/{gameId}/join
/#/settings
```

Jangan menaruh UID, data state pertandingan, atau informasi sensitif di query string.

---

## 12. Struktur Project yang Disarankan

Struktur berikut dapat dijadikan titik awal. Nama folder bisa menyesuaikan stack frontend yang dipilih.

```text
/
├── public/
│   ├── assets/
│   │   ├── brand/
│   │   └── games/
│   └── 404.html                 # bila diperlukan oleh strategi routing
├── src/
│   ├── app/
│   │   ├── App.ts
│   │   ├── router.ts
│   │   └── routes/
│   ├── components/
│   │   ├── Header/
│   │   ├── GameCard/
│   │   ├── SearchBar/
│   │   ├── FilterChips/
│   │   ├── Modal/
│   │   └── StatusMessage/
│   ├── pages/
│   │   ├── GamesPage/
│   │   ├── GameDetailPage/
│   │   ├── GamePage/
│   │   ├── RoomLobbyPage/
│   │   └── SettingsPage/
│   ├── games/
│   │   ├── registry.ts
│   │   └── tic-tac-toe/
│   │       ├── index.ts
│   │       ├── game.ts
│   │       ├── ui.ts
│   │       └── styles.css
│   ├── services/
│   │   ├── firebase/
│   │   │   ├── app.ts
│   │   │   ├── auth.ts
│   │   │   ├── database.ts
│   │   │   └── roomRepository.ts
│   │   └── multiplayer/
│   │       ├── transport.ts
│   │       └── roomManager.ts
│   ├── styles/
│   │   ├── tokens.css
│   │   ├── global.css
│   │   └── utilities.css
│   └── types/
│       ├── game.ts
│       └── room.ts
├── tests/
│   ├── unit/
│   └── e2e/
├── firebase.json                # bila Firebase Emulator/Rules dipakai
├── database.rules.json
├── package.json
└── README.md
```

**Batas modul:** UI dashboard tidak mengimpor Firebase SDK secara langsung. Dashboard berinteraksi dengan `roomManager` atau service interface; hanya adapter multiplayer yang mengetahui detail Firebase.

---

## 13. Interaksi, Motion, dan Feedback

Animasi harus singkat dan membantu pengguna memahami perubahan.

- Hover kartu: perubahan border atau surface yang halus.
- Button press: perubahan warna/posisi yang ringan.
- Modal/drawer: transisi singkat sekitar 150–220 ms.
- Loading: spinner atau skeleton sederhana.
- Perubahan status room: label dan indikator yang diperbarui tanpa animasi berlebihan.
- Hasil game: feedback visual singkat, tidak menghambat tombol bermain ulang.

Hormati `prefers-reduced-motion`. Jangan mengandalkan animasi untuk menyampaikan informasi penting.

### 13.1 Input

- Tombol harus dapat dioperasikan dengan keyboard.
- Elemen interaktif menampilkan focus ring yang terlihat.
- Game dengan kontrol keyboard harus menyediakan petunjuk tombol.
- Game touch harus memiliki target sentuh yang cukup besar dan jarak antar kontrol yang aman.
- Jangan menjadikan gesture kompleks sebagai satu-satunya cara melakukan aksi penting.

---

## 14. Accessibility dan Usability

Target minimal:

- Struktur heading berurutan dan landmark semantik.
- Label yang jelas untuk input pencarian, kode room, dan pengaturan.
- Contrast ratio sesuai WCAG 2.2 AA.
- Focus order logis dan focus state terlihat.
- Status room dan error penting dapat dibaca screen reader melalui live region.
- Jangan menyampaikan status hanya dengan warna.
- Tombol memiliki nama aksesibel, termasuk tombol ikon.
- Perbesar teks tanpa merusak layout.
- Sediakan cara keluar dari game yang dapat dijangkau keyboard dan touch.

Game individual bertanggung jawab atas aksesibilitas interaksi internalnya. Platform tetap menyediakan shell, label, dan navigasi yang aksesibel.

---

## 15. Performance dan Reliability

- Dashboard harus memuat metadata katalog tanpa mengunduh seluruh bundle game.
- Setiap game dipisah menjadi chunk dynamic import.
- Thumbnail menggunakan ukuran yang sesuai, format modern, dan lazy loading.
- Hindari library besar untuk kebutuhan kecil.
- Bersihkan event listener, timer, subscription, dan canvas resource setelah game ditutup.
- Gunakan batas ukuran untuk payload multiplayer.
- Tampilkan feedback saat proses load atau koneksi memerlukan waktu.
- Pastikan game solo tetap berjalan ketika Firebase tidak tersedia.
- Tangani kondisi Firebase offline dan reconnect tanpa membuat UI freeze.

### 15.1 Target kualitas awal

Target ini merupakan sasaran pengembangan, bukan klaim performa yang sudah diukur:

- Dashboard interaktif dengan cepat pada koneksi mobile normal.
- Bundle awal hanya berisi shell, katalog, dan komponen umum.
- Bundle tiap game dimuat secara terpisah.
- Tidak ada error JavaScript yang tidak tertangani saat berpindah halaman atau game.
- Tidak ada listener multiplayer aktif setelah room ditinggalkan.

---

## 16. Privacy dan Data Handling

- Tidak meminta nama asli, email, atau data pribadi untuk bermain solo.
- UID anonim hanya digunakan untuk operasi room.
- Nama tampilan sebaiknya disimpan pada room selama diperlukan dan tidak digunakan untuk tujuan lain.
- Jangan mengirim isi state game ke layanan analytics pihak ketiga secara default.
- Berikan penjelasan singkat bahwa multiplayer membutuhkan koneksi internet.
- Tetapkan kebijakan retensi room dan data pertandingan.
- Jangan menampilkan kode undangan private room di halaman publik atau log yang dapat diakses umum.

---

## 17. Testing Strategy

### 17.1 Unit test

- Filter dan pencarian katalog.
- Validasi metadata game.
- Lifecycle `mount()` dan `destroy()`.
- Aturan permainan solo.
- Validasi aksi dan perubahan revision.
- Transisi status room.

### 17.2 Integration test

- Dashboard memuat modul game secara lazy.
- Game Shell menampilkan loading, error, dan retry dengan benar.
- Membuat room dan mengundang pemain kedua.
- Bergabung ke room yang valid dan menolak room penuh/kedaluwarsa.
- Presence berubah saat pemain disconnect dan reconnect.
- Aksi terkirim sekali dan state kedua client konsisten.
- Keluar dari room membersihkan subscription.
- Security Rules menolak operasi dari UID yang bukan anggota.

### 17.3 Responsive dan accessibility test

Uji setidaknya pada:

- Mobile kecil sekitar 320–360 px.
- Mobile umum sekitar 390–430 px.
- Tablet sekitar 768 px.
- Laptop sekitar 1366 px.
- Desktop lebar sekitar 1440 px atau lebih.

Periksa keyboard navigation, focus ring, zoom, reduced motion, dan screen reader untuk navigasi utama serta Room Lobby.

### 17.4 Browser test

Minimal: Chrome/Edge, Firefox, Safari desktop, Chrome Android, dan Safari iOS versi yang masih didukung oleh target project.

---

## 18. Deployment dan Environment

### 18.1 GitHub Pages

- Build dashboard menjadi static assets.
- Deploy hasil build melalui GitHub Actions atau mekanisme GitHub Pages yang dipilih.
- Atur `base path` agar asset tetap ditemukan pada URL repository.
- Simpan konfigurasi Firebase sebagai environment/build configuration publik; jangan menaruh service account atau private key pada frontend.
- Verifikasi route, refresh, asset path, dan dynamic import pada URL deployment sebenarnya.

### 18.2 Firebase

- Pisahkan project Firebase development dan production.
- Aktifkan Anonymous Authentication bila memakai UID anonim.
- Terapkan dan version-control Realtime Database Security Rules.
- Gunakan Firebase Emulator untuk menguji rules dan alur room.
- Aktifkan monitoring penggunaan dan batas biaya yang sesuai.
- Siapkan strategi cleanup room yang kedaluwarsa; jangan mengasumsikan static hosting akan menjalankan scheduled cleanup.

---

## 19. Prioritas Implementasi

### Phase 1 — Platform dasar

- Setup static frontend dan deployment GitHub Pages.
- Buat design tokens, header, katalog, pencarian, dan filter.
- Buat registry game dan dynamic loader.
- Buat Game Shell dengan loading, error, exit, dan cleanup.
- Tambahkan satu game solo sebagai referensi integrasi.

### Phase 2 — Game collection

- Tambahkan beberapa game sederhana dengan kontrak `mount()` yang sama.
- Pastikan tiap game mendukung layout mobile.
- Tambahkan recently played dan preferensi lokal bila diperlukan.

### Phase 3 — Multiplayer foundation

- Setup Firebase project, Anonymous Authentication, dan Emulator.
- Definisikan room repository dan transport adapter.
- Terapkan invite code, room lifecycle, presence, ready state, dan reconnect.
- Tambahkan satu game turn-based dua pemain sebagai proof of concept.
- Uji Security Rules dan race condition.

### Phase 4 — Quality and polish

- Lengkapi accessibility, responsive QA, error states, dan performance checks.
- Tambahkan dark mode bila dibutuhkan.
- Dokumentasikan cara membuat game baru.

---

## 20. Definition of Done

Sebuah fitur atau game dianggap selesai bila:

- Berfungsi pada desktop dan mobile.
- Memiliki loading, empty, error, dan exit state yang relevan.
- Tidak memuat kode game sebelum game dipilih.
- Mengikuti kontrak `mount()` dan membersihkan resource melalui `destroy()`.
- Tidak merusak navigasi browser maupun route GitHub Pages.
- Dapat digunakan dengan keyboard untuk kontrol platform.
- Tidak memiliki error console yang diketahui pada alur normal.
- Untuk multiplayer: membatasi akses berdasarkan autentikasi dan membership, menangani disconnect/reconnect, serta lulus pengujian Security Rules.
- Memiliki pengujian untuk aturan atau alur kritis.

---

## 21. Keputusan yang Perlu Ditetapkan Saat Implementasi

Hal-hal berikut sengaja dibiarkan fleksibel sampai stack dan daftar game final dipilih:

1. Framework UI dan build tool (misalnya Vanilla TypeScript, React, atau framework ringan lain).
2. Strategi routing final: hash routing atau static fallback.
3. Daftar game pada rilis pertama.
4. Apakah dark mode masuk versi pertama atau iterasi berikutnya.
5. Format kode undangan dan masa berlaku room.
6. Kebijakan saat host disconnect: menunggu reconnect, mengakhiri room, atau menunjuk host baru.
7. Untuk setiap game multiplayer: turn-based atau host-authoritative, format aksi, dan aturan validasi.
8. Apakah perlu PWA/offline caching untuk dashboard dan game solo.

---

## 22. Ringkasan Arah Desain

Game Platform harus terasa seperti **katalog game yang ringan dan langsung digunakan**. Dashboard dibuat sederhana, game dimuat sesuai kebutuhan, dan setiap game berdiri sebagai modul independen dengan lifecycle yang jelas. Pengalaman solo tetap lokal dan tidak bergantung pada Firebase. Multiplayer dibatasi pada private room dua pemain dengan autentikasi tamu, presence, action relay, sinkronisasi revision, serta Security Rules yang ketat.

Prioritas desain adalah kejelasan, kecepatan, kompatibilitas desktop/mobile, dan kemudahan menambah game baru—bukan kompleksitas visual atau fitur sosial yang belum diperlukan.
