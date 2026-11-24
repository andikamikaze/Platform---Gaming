# Game Platform

A static browser-game hub. The dashboard is served by GitHub Pages; individual games are loaded on demand. Solo matches run entirely in the browser. Private two-player rooms use Firebase Realtime Database for room discovery, presence, action relay, and state synchronization (supported by ESM `mount()` modules).

## Project structure

```text
index.html                    # Dashboard entrypoint (GitHub Pages)
community.html       # Community page (linked from the dashboard)
CSS/
  style.css                   # Dashboard + shared game styles
  community.css               # Community page styles
Gaming/                       # All game modules (one .js file per game)
JS/
  app.js                      # Dashboard logic: library, loader, stats, routing
  icons.js                    # SUMBER TUNGGAL path SVG (290 ikon) + helper render
  game-icons.js               # Mapping 155 game id -> nama ikon (fallback per kategori)
  games-manifest.js           # AUTO-GENERATED list of every game in Gaming/
  firebase.js                 # Shared Firebase SDK init + Anonymous Auth
  identity.js                 # Shared display name (gamespace_player_name)
  room-client.js              # Firebase room client (create/join, actions, state)
  community-client.js         # Firebase client for the community/ node
  community.js                # Community page rendering + interactions
  firebase-config.js          # Firebase web config
  game-template.js            # Reference template for new ESM game modules
tools/
  build-games-manifest.mjs    # Regenerates JS/games-manifest.js from Gaming/
  capture-pages.mjs           # Screenshots every page at 390/768/1440px for visual QA
  check-bot-play.mjs          # Interactive vs-AI smoke test on representative games
  seed-community.mjs          # One-time seed for initial communities/events
```

## How the game list works

### Icon system (single source of truth)

All SVG icons come from `JS/icons.js` (`paths`, 290 icons, `viewBox 0 0 24 24`, `stroke="currentColor"`, no fill). It is framework-agnostic ESM; `JS/icons.d.ts` provides the `IconName` type for TypeScript consumers.

- UI icons in HTML use `<span class="icon" data-icon="nama"></span>`; `hydrateIcons()` fills them at boot (including `<template>` content). Dynamic icons use `iconSVG(name)` / `setIcon(el, name)` directly.
- Every game cover art is generated from `JS/game-icons.js` (`GAME_ICON` maps each game id to an icon name, with a category fallback). The old `META.art` / `art` field is ignored by the manifest generator.
- Never inline a new SVG or use Unicode glyphs for UI icons. Add a path to `JS/icons.js` and a mapping to `JS/game-icons.js` instead.
- Run `npm run check:icons` to validate names, cover-art generation, placeholders, and absence of legacy glyphs.

The browser cannot list files in a folder on static hosting, so the library is generated ahead of time:

```bash
node tools/build-games-manifest.mjs
```

Run this after **adding or removing any file in `Gaming/`**. The script scans every `.js` file and extracts its metadata into `JS/games-manifest.js` (`const GAMES` in `app.js` reads from there — no manual registration).

Two module formats are supported:

1. **MGP classic module** (most games) — an IIFE that calls the global `MGP_REGISTER({ id, name, category, catLabel, desc, bg, build })`. `build(app)` renders into a wrapper `<div id="<id>-app">` and returns `{ open, close }`. The script is injected lazily the first time the game is launched.
2. **ESM module** (`maze-escape.js`, `airplane-combat.js`) — exports `mount(root, context) -> { destroy }` plus `export const META = { id, name, category, catLabel, desc, bg, bestKey? }`. Loaded with a dynamic `import()`; supports the room context API.

The legacy `art` metadata field is still accepted but ignored: cover art always comes from `JS/game-icons.js` + `JS/icons.js`.

## Community page (real users)

`community.html` is a second page linked from the dashboard sidebar, Overview quick actions, and Help. It is not a mock:

- **Identity is shared.** Both pages read `localStorage.gamespace_player_name` through `JS/identity.js`. If you open Community before setting a name, you are sent to `index.html?next=community.html` for the existing onboarding, then returned automatically.
- **Data lives in Firebase Realtime Database** under `community/` (see `JS/community-client.js`): `users` (presence), `communities` + `members`, `posts` + `likes` + `comments`, `events` + `rsvps`. All lists are live subscriptions, so another browser sees changes without a reload.
- **User ID** is the Firebase Anonymous Auth `uid`, the same sign-in used by private rooms. No new login flow was added.
- Run `npm run seed:community` once to create the first communities/events. It signs in anonymously over REST and writes records owned by that account, then the data is shared by everyone.

The sample `community` rules allow each signed-in user to manage only their own name/membership/likes/RSVPs and only their own posts/comments/events. They are prototype-grade (the same caveat as `rooms` below), not production authorization.

## Local data (no accounts, no cloud profile)

Everything a user generates is saved in that browser's `localStorage`:

| Key | Contents |
| --- | --- |
| `gamespace_player_name` | Display name (asked on first visit) |
| `gamespace_favorites` | Favorited game ids |
| `gamespace_stats` | Per game: sessions, best score, wins, losses, last played |
| `gamespace_recent` | Recently played game ids |
| `gamespace_rooms` | Rooms created counter |
| `gamespace_compact_layout`, `gamespace_reduce_motion` | Interface preferences |

A first-time visitor starts completely empty; a **Reset data** button in Settings clears everything.

## Local preview

ES modules and remote Firebase SDK imports must be served over HTTP(S), not opened with `file://`. From the project root run a static server, for example:

```bash
python -m http.server 8000
```

Then open `http://localhost:8000/`.

## GitHub Pages

1. Put `index.html`, `README.md`, `CSS/`, `JS/`, `Gaming/`, and `tools/` at the published repository root (or configure Pages to publish the folder containing them).
2. Commit and push. GitHub Pages serves the static files; there is no Node server or runtime build step — the manifest only needs regenerating when the game folder changes.

## Configure online rooms (one-time setup)

Solo vs AI works without Firebase. Room multiplayer needs a small Firebase project because GitHub Pages cannot host a shared room database or signaling endpoint by itself.

1. Create a Firebase project and register a Web app.
2. In **Authentication → Sign-in method**, enable **Anonymous**.
3. Create a **Realtime Database** and copy its database URL.
4. Copy the Web app config into `JS/firebase-config.js`.
5. In Realtime Database → Rules, start with the rules in `firebase.database.rules.json` for a private, small-group prototype using anonymous sign-in. `firebase.json` points the Firebase CLI at that file, so `firebase deploy --only database` publishes both the `rooms` and `community` rules.
6. Deploy the rules and test with two different browsers/devices. One browser creates a room from **Create Room**; the other opens **Rooms** (`#rooms`) and joins with the six-character code. Then run `npm run seed:community` once and open Community from the dashboard.

> The dashboard has a single **Rooms** page (`#rooms`) that combines invite-code joining and the private-room information panel. The old `#join-room` and `#browse-rooms` pages were removed; there is no public room list.

### Security note

The sample rules allow any signed-in anonymous client to read and write room records. This is convenient for a small trusted group but is **not production-grade authorization**. For public release, add per-room host/player authorization, stricter `.validate` rules, App Check, rate limiting, and server-side validation. Do not put service-account credentials in frontend files.

## Extending the library

1. Add a new `.js` file in `Gaming/` following one of the two module formats above (`JS/game-template.js` is the ESM reference).
2. Run `node tools/build-games-manifest.mjs`.
3. Commit both the new game and the regenerated `JS/games-manifest.js`.

Keep game styles self-contained inside the module (or in `CSS/style.css` for shared primitives) so the dashboard and games stay in one design system.

## Pre-publish checks

Satu perintah untuk mengecek seluruh project sebelum publish:

```bash
npm install
npm run setup:browser     # sekali saja: unduh Chromium untuk Playwright
npm run check
```

Fase yang dijalankan berurutan:

| Fase | Script | Yang dicek |
| --- | --- | --- |
| Static | `npm run check:static` | Syntax semua `.js`, integritas + freshness `JS/games-manifest.js`, kontrak modul tiap game |
| Icons | `npm run check:icons` | NAMA ikon valid, 155 cover art persis dari `iconSVG()`, placeholder HTML valid, tidak ada glyph lama atau workaround CSS |
| Mount | `npm run check:mount` | `mount()`/`build()` + `destroy()`/`close()` untuk semua game dalam mode `ai`, `room-host`, `room-guest` (tiap skenario di proses terisolasi) |
| Browser | `npm run check:browser` | Fungsi dashboard (search, filter, favorit, navigasi, pengaturan, reset data) + buka/tutup 154 game di Chromium dengan penangkapan `pageerror`/`console.error` |
| Community | `npm run check:community` | Dua browser: nama terbawa dari dashboard, presence, join, post, like, komentar, RSVP tersinkron; data uji dibersihkan |
| Room | `npm run check:rooms` | Room Firebase live dengan dua browser: host membuat room, guest join, tukar action, lalu room uji dihapus |

Hasil ditulis ke `reports/check-report.json` dan `reports/check-report.md`. Screenshot kegagalan ada di `reports/screenshots/`. Exit code `1` jika ada kegagalan, sehingga bisa dipakai sebagai gate sebelum publish/CI.

Opsi:

```bash
npm run check -- --filter snake            # hanya game tertentu
npm run check -- --skip-rooms              # lewati tes Firebase (offline)
npm run check -- --skip-community          # lewati tes komunitas
npm run check:browser -- --skip-dashboard  # hanya cek game
npm run check -- --jobs 4                  # atur paralelisme mount test
```

> Catatan: `npm run check:rooms` memakai proyek Firebase yang terkonfigurasi di `JS/firebase-config.js`, memerlukan internet, Anonymous sign-in aktif, dan rules terdeploy. Room uji dibuat dengan kode acak lalu dihapus otomatis di akhir tes. Untuk menjalankan seluruh pengecekan tanpa tes online: `SKIP_ROOM_TEST=1 npm run check`.

### Visual QA dan bot interaktif

```bash
npm run capture:pages -- --label=final     # screenshot semua halaman ke reports/screenshots/final/
npm run check:bot                          # main vs AI pada 6 game representatif
```

`capture-pages` menghasilkan screenshot desktop/tablet/mobile sekaligus ringkasan error console. `check:bot` memakai hook `__MGP_TEST__` yang sama dengan `check:browser`, melakukan klik/langkah nyata pada game representatif, lalu menulis `reports/bot-play-report.md`. Keduanya hanya alat verifikasi dan tidak mengubah logika game atau kode backend.
