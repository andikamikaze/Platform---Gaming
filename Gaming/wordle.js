/* ==== GAME: wordle.js ==== */

import { iconSVG } from "../JS/icons.js";

/* =============================================================
WORDLE RACE - tebak kata 5 huruf, adu cepat vs bot / pemain lain.
Kompatibel template baru: export META + mount(root, context).
Setelah mengubah file ini, jalankan: node tools/build-games-manifest.mjs
============================================================= */

export const META = {
    id: "wordle", // harus sama dengan nama file: wordle.js
    name: "Wordle",
    category: "words",
    catLabel: "Kata",
    desc: "Tebak kata 5 huruf dalam 6 kesempatan. Hijau = tepat, kuning = ada di posisi lain, abu = tidak ada. Adu cepat melawan bot atau teman.",
    art: '<svg viewBox="0 0 48 48" width="54" height="54" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="6" y="6" width="10" height="10" rx="2.5" fill="#16a34a" stroke="none"/><rect x="19" y="6" width="10" height="10" rx="2.5" fill="#d97706" stroke="none"/><rect x="32" y="6" width="10" height="10" rx="2.5" fill="#a8a29e" stroke="none"/><rect x="6" y="19" width="10" height="10" rx="2.5"/><rect x="19" y="19" width="10" height="10" rx="2.5" fill="#16a34a" stroke="none"/><rect x="32" y="19" width="10" height="10" rx="2.5"/><rect x="6" y="32" width="10" height="10" rx="2.5"/><rect x="19" y="32" width="10" height="10" rx="2.5"/><rect x="32" y="32" width="10" height="10" rx="2.5" fill="#d97706" stroke="none"/></svg>',
    bg: ["#d1fae5", "#6ee7b7"],
    bestKey: "wordleBest",
};

/* ---------- kamus: semua tebakan valid harus ada di sini ---------- */
const WORDS = `about above actor adopt after again agent agree alarm album
alert alike alive allow alone along angel anger angle ankle apple apply arena
argue arise array aside asset audio avoid awake award aware badge baker basic
basin batch beach beard beast begin being belly below bench berry birth black
blade blame blank blast blend bless blind block blood board boost booth bound
brain brake brand brass brave bread break breed brick bride brief bring brisk
broad brown brush build bunch burst cabin cable candy cargo carry catch cause
chain chair chalk charm chart chase cheap check cheek cheer chess chest chief
child chill choir chord civic civil claim clash clean clear clerk click cliff
climb cloak clock close cloth cloud coach coast color comet coral couch count
court cover crack craft crane crash cream creek crest crime crisp cross crowd
crown crush curve cycle daily dairy dance diary dirty drift drive eager eagle
earth eight enjoy equal error event every fancy feast fence field first flame
flash fleet floor fluid focus force forge fresh fruit funny ghost giant glass
globe grace grade grain grand grape grass great green greet group guard guess
guide happy heart heavy honey horse hotel house human humor index inner input
joint juice kneel label large laser later laugh layer learn lemon light limit
local lucky lunch magic major mango maple march match medal metal meter might
minor model money month moral motor mount mouse mouth music night noble north
novel nurse ocean offer often olive onion orbit order otter ounce outer paint
panda party peach pearl piano pizza place plain plant plate plaza point polar
pound power press price pride prime prize proud prove queen quick quiet radar
radio raise ranch range rapid reach ready refer relax reply rider right rival
river roast robot rocky`
    .split(/\s+/)
    .filter((w) => /^[a-z]{5}$/.test(w));

const LEN = 5;
const BASE_TRIES = 6;
const MAX_TRIES = 10; // batas atas setelah cheat tambah kesempatan

/* ---------- util murni (mudah diuji) ---------- */
function rng(seed) {
    let a = seed >>> 0;
    return function () {
        a |= 0;
        a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/* Skor tebakan: "ok" hijau, "near" kuning, "no" abu.
   Dua lintasan agar huruf duplikat ditangani benar. */
function scoreGuess(g, answer) {
    const res = new Array(LEN).fill("no");
    const rest = {};
    for (let i = 0; i < LEN; i++) {
        if (g[i] === answer[i]) res[i] = "ok";
        else rest[answer[i]] = (rest[answer[i]] || 0) + 1;
    }
    for (let i = 0; i < LEN; i++) {
        if (res[i] !== "ok" && rest[g[i]] > 0) {
            res[i] = "near";
            rest[g[i]]--;
        }
    }
    return res;
}

function sameScore(a, b) {
    for (let i = 0; i < LEN; i++) if (a[i] !== b[i]) return false;
    return true;
}

/* Semua kata yang masih konsisten dengan riwayat tebakan + skornya.
   Jawaban asli dijamin selalu ada di daftar ini. */
function candidatesFor(rows) {
    return WORDS.filter((w) =>
        rows.every((r) => sameScore(scoreGuess(r.word, w), r.score)),
    );
}

/* Bot bermain adil: hanya memakai umpan warna dari tebakannya sendiri. */
function botPick(rows, rnd) {
    const c = candidatesFor(rows);
    if (!c.length) return WORDS[Math.floor(rnd() * WORDS.length)];
    return c[Math.floor(rnd() * c.length)];
}

/* Jaminan level bisa diselesaikan: simulasikan solver acak-konsisten;
   level diterima hanya jika ada jalur penyelesaian <= BASE_TRIES tebakan. */
function solvableIn(answer, rnd, tries) {
    const rows = [];
    for (let i = 0; i < tries; i++) {
        const w = botPick(rows, rnd);
        if (w === answer) return true;
        rows.push({ word: w, score: scoreGuess(w, answer) });
    }
    return false;
}

/* Generator level acak: kata baru (tidak sama dengan ronde sebelumnya),
   lolos uji solvable, posisi Pemain 1/2 diacak, giliran pertama diacak. */
function makeLevel(prevAnswer, rand) {
    const r = rand || Math.random;
    for (let attempt = 0; attempt < 40; attempt++) {
        const seed = (r() * 4294967296) >>> 0;
        const rr = rng(seed);
        const answer = WORDS[Math.floor(rr() * WORDS.length)];
        if (answer === prevAnswer) continue;
        if (!solvableIn(answer, rng((seed ^ 0x9e3779b9) >>> 0), BASE_TRIES)) continue;
        return {
            seed,
            answer,
            seats: rr() < 0.5 ? [0, 1] : [1, 0],
            first: rr() < 0.5 ? 0 : 1,
        };
    }
    // fallback sangat jarang: tetap ambil kata valid dari kamus
    const seed = (r() * 4294967296) >>> 0;
    const rr = rng(seed);
    return {
        seed,
        answer: WORDS[Math.floor(rr() * WORDS.length)],
        seats: [0, 1],
        first: 0,
    };
}

function countVowels(w) {
    return (w.match(/[aeiou]/g) || []).length;
}

/* Petunjuk bertahap setelah tebakan salah: 2x = huruf awal + jumlah vokal,
   4x = tambahan huruf akhir. */
function hintText(answer, wrong) {
    const parts = [];
    if (wrong >= 2) {
        parts.push('Diawali huruf "' + answer[0].toUpperCase() + '"');
        parts.push(countVowels(answer) + " huruf vokal");
    }
    if (wrong >= 4) parts.push('Diakhiri huruf "' + answer[LEN - 1].toUpperCase() + '"');
    return parts.join(" - ");
}

/* =============================================================
   MOUNT - sesuai template (mode "ai" = vs bot, mode "room" = online)
   Indeks transport: 0 = host / manusia, 1 = guest / bot.
   state.seats memetakan indeks transport -> label Pemain 1 / Pemain 2
   (diacak tiap ronde). state.turn / state.first = indeks transport.
   ============================================================= */
export function mount(root, context = {}) {
    const { mode = "ai", room = null, playerName = "Player", onExit = () => { } } = context;
    const online = mode === "room" && Boolean(room);
    const me = online && !room.isHost ? 1 : 0;
    const opp = 1 - me;
    let roomData = room?.room || null;
    let state = null;

    /* state lokal (tidak perlu disinkronkan) */
    let cur = "";
    let lastLevel = -1;
    let resultClosed = -1;
    let bestSaved = -1;
    let peeked = false;
    let deadMarked = false;
    let showHelp = false, showCheats = false, paused = false;
    const unsubs = [];

    /* Timer virtual: help/cheat/pause/result membekukan bot + pesan, lalu
       semua due time digeser sepanjang masa jeda agar tidak ada loncatan. */
    let timers = [], timerTick = null, frozenAt = 0;
    const virtualNow = () => frozenAt || Date.now();
    const uiLocked = () => showHelp || showCheats || paused || !resultOv.hidden;
    const frozen = () => !online && uiLocked();

    function ensureTimer() {
        if (timerTick || frozen() || !timers.length) return;
        const next = Math.min.apply(null, timers.map((t) => t.due));
        timerTick = setTimeout(() => {
            timerTick = null;
            if (frozen()) return;
            const now = Date.now();
            const due = timers.filter((t) => t.due <= now);
            timers = timers.filter((t) => t.due > now);
            due.forEach((t) => t.fn());
            ensureTimer();
        }, Math.max(0, next - Date.now()));
    }
    function later(fn, ms) {
        const t = { fn, due: virtualNow() + ms };
        timers.push(t);
        ensureTimer();
        return t;
    }
    function cancelLater(t) {
        if (!t) return;
        timers = timers.filter((x) => x !== t);
        if (!timers.length && timerTick) { clearTimeout(timerTick); timerTick = null; }
    }
    function clearTimers() {
        if (timerTick) { clearTimeout(timerTick); timerTick = null; }
        timers = [];
    }
    function freezeTimers() {
        if (frozenAt) return;
        frozenAt = Date.now();
        if (timerTick) { clearTimeout(timerTick); timerTick = null; }
    }
    function thawTimers() {
        if (!frozenAt) return;
        const shift = Date.now() - frozenAt;
        frozenAt = 0;
        timers.forEach((t) => { t.due += shift; });
        ensureTimer();
    }
    function syncFreeze() { if (frozen()) freezeTimers(); else thawTimers(); }

    function readBest() {
        try {
            const v = parseInt(localStorage.getItem(META.bestKey), 10);
            return Number.isFinite(v) && v > 0 ? v : null;
        } catch (err) {
            return null;
        }
    }
    function saveBest(v) {
        try {
            localStorage.setItem(META.bestKey, String(v));
        } catch (err) {
            /* abaikan: storage mungkin diblokir */
        }
    }
    let best = readBest();

    /* ---------- internal How to play (sekali per perangkat) ---------- */
    let seenHelp = true;
    try { seenHelp = localStorage.getItem("wordleHelpSeen") === "1"; } catch (err) { seenHelp = true; }
    if (!seenHelp) {
        showHelp = true;
        try { localStorage.setItem("wordleHelpSeen", "1"); } catch (err) { /* storage blocked */ }
    }

    /* ---------- shell UI minimalis ---------- */
    root.innerHTML = `
<style>
.wl-scope{--wl-bg:#fafaf9;--wl-panel:#ffffff;--wl-ink:#1c1917;--wl-mut:#78716c;--wl-line:#e7e5e4;--wl-key:#f5f5f4;--wl-ok:#16a34a;--wl-near:#d97706;--wl-no:#a8a29e;--wl-bad:#dc2626;color:var(--wl-ink);font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;-webkit-tap-highlight-color:transparent}
.wl-scope *{box-sizing:border-box}
@media (prefers-color-scheme: dark){.wl-scope{--wl-bg:#1c1917;--wl-panel:#292524;--wl-ink:#fafaf9;--wl-mut:#a8a29e;--wl-line:#44403c;--wl-key:#44403c;--wl-no:#57534e}}
.wl-scope [hidden]{display:none!important}

/* --- HUD: semua info + kontrol, satu baris di atas board --- */
.wl-hud{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin:0 0 10px;font:600 11px/1 ui-monospace,SFMono-Regular,Menlo,monospace}
.wl-hud .wl-btn{min-height:32px;padding:6px 10px;font-size:10px}
.wl-chip{display:inline-flex;align-items:center;gap:6px;padding:5px 9px;border:1px solid var(--wl-line);border-radius:999px;background:var(--wl-panel);color:var(--wl-mut);white-space:nowrap}
.wl-chip b{color:var(--wl-ink);font-weight:700;font-variant-numeric:tabular-nums}
.wl-spacer{flex:1 1 auto}
.wl-status-dot{width:8px;height:8px;border-radius:50%;background:var(--wl-ok);display:inline-block}
.wl-scope[data-thinking="1"] .wl-status-dot{animation:wl-pulse 1s ease-in-out infinite}
@keyframes wl-pulse{50%{opacity:.25}}

/* --- tombol --- */
.wl-btn{border:1px solid var(--wl-line);background:var(--wl-panel);color:var(--wl-ink);border-radius:8px;padding:8px 14px;min-height:44px;font-size:12.5px;font-weight:600;cursor:pointer;touch-action:manipulation;user-select:none;transition:background .15s}
.wl-btn:hover{background:var(--wl-key)}
.wl-btn:focus-visible,.wl-key:focus-visible{outline:2px solid var(--wl-ok);outline-offset:2px}
.wl-btn.primary{background:var(--wl-ink);color:var(--wl-panel);border-color:var(--wl-ink)}
.wl-btn.on{border-color:var(--wl-near);color:var(--wl-near)}
.wl-btn.wide{display:block;width:100%;text-align:left;margin:8px 0}
.wl-icon-btn{display:inline-flex;align-items:center;gap:6px}
.wl-icon-btn svg{flex:none;display:block}

/* --- board: arena + konten utama, tinggi tersisa --- */
.wl-board{position:relative;display:flex;flex-direction:column;width:100%;min-height:0;padding:12px;border:1px solid var(--wl-line);background:var(--wl-bg);border-radius:14px;overflow:hidden}
.wl-play{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;flex:1 1 auto;min-height:0;overflow:auto;padding:2px}
.wl-main{display:grid;gap:12px;justify-items:center;align-items:start;flex:0 0 auto;width:100%;max-width:960px}
@media(min-width:760px){.wl-main{grid-template-columns:minmax(0,1fr) 240px;align-items:center}}
.wl-left{display:flex;flex-direction:column;align-items:center;width:min(100%,330px);min-width:0}
.wl-grid{display:grid;gap:8px;width:100%}
.wl-row{display:grid;grid-template-columns:repeat(5,1fr);gap:8px}
.wl-tile{aspect-ratio:1;display:grid;place-items:center;border:1px solid var(--wl-line);border-radius:8px;background:var(--wl-panel);font-weight:800;font-size:clamp(18px,4.5vw,25px);text-transform:uppercase;transition:background .15s,border-color .15s,color .15s}
.wl-tile.fill{border-color:var(--wl-mut)}
.wl-tile.ok{background:var(--wl-ok);border-color:var(--wl-ok);color:#fff}
.wl-tile.near{background:var(--wl-near);border-color:var(--wl-near);color:#fff}
.wl-tile.no{background:var(--wl-no);border-color:var(--wl-no);color:#fff}
.wl-msg{min-height:20px;margin:8px auto 0;font-size:12.5px;font-weight:600;color:var(--wl-near);text-align:center;max-width:360px}
.wl-side{display:grid;gap:8px}
.wl-mini{border:1px solid var(--wl-line);background:var(--wl-panel);border-radius:12px;padding:12px}
.wl-card-t{display:flex;justify-content:space-between;align-items:center;font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--wl-mut);margin:0 0 8px}
.wl-tag{border:1px solid var(--wl-line);border-radius:999px;padding:2px 8px;font-size:10px}
.wl-mini-grid{display:grid;gap:4px}
.wl-mrow{display:flex;gap:4px}
.wl-mt{width:24px;height:24px;display:grid;place-items:center;border-radius:6px;font-size:12px;font-weight:800;text-transform:uppercase;border:1px solid var(--wl-line)}
.wl-mt.ok{background:var(--wl-ok);border-color:var(--wl-ok);color:#fff}
.wl-mt.near{background:var(--wl-near);border-color:var(--wl-near);color:#fff}
.wl-mt.no{background:var(--wl-no);border-color:var(--wl-no);color:#fff}
.wl-mempty{font-size:12px;color:var(--wl-mut)}
.wl-hintcard{border:1px solid var(--wl-line);background:var(--wl-panel);border-radius:12px;padding:12px}
.wl-hint{margin:0;font-size:13px;line-height:1.5}
.wl-pattern{display:flex;gap:8px;margin-top:8px}
.wl-pc{width:26px;height:26px;border:1px dashed var(--wl-mut);border-radius:8px;display:grid;place-items:center;font-weight:800;font-size:13px;text-transform:uppercase;color:var(--wl-mut)}
.wl-pc.on{border-style:solid;border-color:var(--wl-ok);color:var(--wl-ok)}
.wl-leg{border:1px solid var(--wl-line);background:var(--wl-panel);border-radius:12px;padding:12px}
.wl-leg .wl-card-t{margin-bottom:4px}
.wl-legrow{display:flex;align-items:center;gap:8px;font-size:12px;color:var(--wl-mut);margin:4px 0}
.wl-dot{width:12px;height:12px;border-radius:4px;display:inline-block}
.wl-dot.ok{background:var(--wl-ok)}
.wl-dot.near{background:var(--wl-near)}
.wl-dot.no{background:var(--wl-no)}
.wl-kb{display:grid;gap:8px;width:min(100%,520px);flex:0 0 auto}
.wl-krow{display:flex;justify-content:center;gap:8px}
.wl-key{flex:1;max-width:46px;height:48px;border:1px solid var(--wl-line);border-radius:8px;background:var(--wl-key);color:var(--wl-ink);font-weight:700;font-size:13px;text-transform:uppercase;cursor:pointer;touch-action:manipulation;user-select:none;transition:background .12s,transform .05s}
.wl-key:hover:not(:disabled){background:var(--wl-line)}
.wl-key:active:not(:disabled){transform:scale(.94)}
.wl-key:disabled{opacity:.5;cursor:default}
.wl-key.wide{flex:1.7;max-width:74px;font-size:10.5px}
.wl-key.ok{background:var(--wl-ok);border-color:var(--wl-ok);color:#fff}
.wl-key.near{background:var(--wl-near);border-color:var(--wl-near);color:#fff}
.wl-key.no{background:var(--wl-no);border-color:var(--wl-no);color:#fff;opacity:.75}
@media(pointer:coarse){.wl-key{height:52px;font-size:14px}.wl-key.wide{font-size:11px}}

/* --- overlay modal: head/foot tetap, body scroll --- */
.wl-ov{position:absolute;inset:0;z-index:6;display:grid;place-items:center;padding:12px;background:rgba(250,250,249,.9);backdrop-filter:blur(5px);border-radius:14px;overflow:auto}
.wl-ov[data-ov="help"]{z-index:50}
@media (prefers-color-scheme: dark){.wl-ov{background:rgba(28,25,23,.9)}}
.wl-card{display:flex;flex-direction:column;width:min(100%,460px);max-height:100%;overflow:hidden;background:var(--wl-panel);border:1px solid var(--wl-line);border-radius:12px;padding:16px 20px;box-shadow:0 4px 16px rgba(0,0,0,.06)}
.wl-head{display:flex;align-items:center;justify-content:space-between;gap:10px;flex:none;margin:0 0 8px}
.wl-head h3{margin:0;font-size:18px}
.wl-body{flex:1 1 auto;min-height:0;overflow:auto}
.wl-body p,.wl-body li{font-size:13px;line-height:1.55;color:var(--wl-mut)}
.wl-body ol{margin:8px 0;padding-left:18px}
.wl-foot{flex:none;display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:12px}
.wl-foot .wl-btn{min-height:38px;padding:8px 14px;font-size:12px}
.wl-exrow{display:flex;gap:8px;margin:12px 0 4px}
.wl-ex{width:34px;height:34px;display:grid;place-items:center;border-radius:8px;font-weight:800;border:1px solid var(--wl-line);text-transform:uppercase}
.wl-ex.ok{background:var(--wl-ok);border-color:var(--wl-ok);color:#fff}
.wl-ex.near{background:var(--wl-near);border-color:var(--wl-near);color:#fff}
.wl-ex.no{background:var(--wl-no);border-color:var(--wl-no);color:#fff}
.wl-note{font-size:11px;color:var(--wl-mut)}
.wl-warn{font-size:12px;color:var(--wl-near);margin:8px 0 12px}
.wl-peek{font-size:22px;font-weight:800;letter-spacing:.35em;text-transform:uppercase;text-align:center;margin:8px 0;color:var(--wl-ok)}
.wl-rowbtns{display:flex;gap:8px;flex-wrap:wrap}
.wl-res-title.win{color:var(--wl-ok)}
.wl-res-title.lose{color:var(--wl-bad)}
.wl-shake{animation:wl-shake .32s ease}
@keyframes wl-shake{25%{transform:translateX(-6px)}75%{transform:translateX(6px)}}
.wl-pop{animation:wl-pop .16s ease}
@keyframes wl-pop{from{transform:scale(.85)}}
@media (prefers-reduced-motion:reduce){.wl-scope *{animation:none!important;transition:none!important}}

/* --- fill height + mobile refinements (PALING AKHIR) --- */
.wl-app.game-fill > .wl-board{flex:1 1 auto;min-height:0}
.wl-app .wl-hud .wl-btn{min-height:32px;padding:5px 9px;font-size:9px}
@media (pointer:coarse){.wl-app .wl-hud .wl-btn{min-height:32px}}
@media (max-width:640px){
.wl-app.game-fill > .wl-board:not(:has(.wl-ov:not([hidden]))){flex:1 1 auto;min-height:0}
.wl-app.game-fill > .wl-board:has(.wl-ov:not([hidden])){flex:0 0 auto;min-height:min(70dvh,620px);aspect-ratio:auto}
.wl-app .wl-hud{gap:5px;margin-bottom:8px}
.wl-app .wl-hud .wl-chip{padding:4px 6px;font-size:9px;min-height:0}
.wl-app .wl-hud .wl-chip[data-hud="bestwrap"]{display:none}
.wl-app .wl-hud .wl-btn{min-height:32px;padding:5px 8px;font-size:9px}
.wl-app .wl-hud .wl-btn-label,
.wl-app .wl-hud .wl-spacer{display:none}
.wl-app .wl-board{padding:8px}
.wl-app .wl-ov{padding:8px}
.wl-app .wl-card{width:100%;height:100%;max-height:100%;padding:12px;border-radius:12px}
.wl-app .wl-body{scrollbar-width:none}
.wl-app .wl-body::-webkit-scrollbar{display:none}
.wl-app .wl-foot{position:static;margin:0;padding-top:10px;border-top:1px solid var(--wl-line)}
.wl-app .wl-note{display:none}
}
</style>
<div class="game-app wl-scope wl-app game-fill" data-scope data-thinking="0">
  <div class="wl-hud">
    <span class="wl-chip"><i class="wl-status-dot"></i><b data-hud="status">Siap</b></span>
    <span class="wl-chip">LV <b data-hud="level">1</b></span>
    <span class="wl-chip">COBA <b data-hud="try">1/6</b></span>
    <span class="wl-chip">POSISI <b data-hud="seat">P1</b></span>
    <span class="wl-chip" data-hud="modechip">MODE <b data-hud="mode">Solo</b></span>
    <span class="wl-chip" data-bestwrap data-hud="bestwrap">TERBAIK <b data-hud="best">-</b></span>
    <span class="wl-spacer"></span>
    <button class="wl-btn wl-icon-btn" type="button" data-help aria-label="Cara bermain" title="Cara bermain (H)">${iconSVG("helpCircle", { size: 14 })}<span class="wl-btn-label">Help</span></button>
    <button class="wl-btn wl-icon-btn" type="button" data-cheats data-cheatbtn aria-label="Cheat" title="Cheat (C)">${iconSVG("wrench", { size: 14 })}<span class="wl-btn-label">Cheat</span></button>
    <button class="wl-btn wl-icon-btn" type="button" data-pause data-pausebtn aria-label="Jeda" title="Jeda (P)">${iconSVG("pause", { size: 14 })}<span class="wl-btn-label">Jeda</span></button>
    <button class="wl-btn wl-icon-btn" type="button" data-restart aria-label="Ronde baru" title="Ronde baru (R)">${iconSVG("refresh", { size: 14 })}<span class="wl-btn-label">Ronde baru</span></button>
    <button class="wl-btn wl-icon-btn" type="button" data-exit aria-label="Keluar game" title="Keluar game">${iconSVG("logOut", { size: 14 })}<span class="wl-btn-label">Keluar</span></button>
  </div>
  <section class="game-panel wl-board" data-board>
    <div class="wl-play">
      <div class="wl-main">
        <div class="wl-left">
          <div class="wl-grid" data-grid></div>
          <div class="wl-msg" data-msg role="status" aria-live="polite"></div>
        </div>
        <aside class="wl-side">
          <div class="wl-mini">
            <div class="wl-card-t"><span data-oppname>Lawan</span><span class="wl-tag" data-opptag>P2</span></div>
            <div class="wl-mini-grid" data-mini></div>
          </div>
          <div class="wl-hintcard" data-hintcard hidden>
            <div class="wl-card-t">Petunjuk</div>
            <p class="wl-hint" data-hinttext></p>
            <div class="wl-pattern" data-hintpattern hidden></div>
          </div>
          <div class="wl-leg">
            <div class="wl-card-t">Legenda</div>
            <div class="wl-legrow"><i class="wl-dot ok"></i> huruf dan posisi benar</div>
            <div class="wl-legrow"><i class="wl-dot near"></i> ada, posisi salah</div>
            <div class="wl-legrow"><i class="wl-dot no"></i> tidak ada di kata</div>
          </div>
        </aside>
      </div>
      <div class="wl-kb" data-kb>
        <div class="wl-krow" data-krow="0"></div>
        <div class="wl-krow" data-krow="1"></div>
        <div class="wl-krow" data-krow="2"></div>
      </div>
    </div>

    <div class="wl-ov" data-ov="help" hidden>
      <div class="wl-card" role="dialog" aria-label="Cara bermain">
        <div class="wl-head"><h3>Cara bermain</h3></div>
        <div class="wl-body">
          <ol>
            <li>Tebak kata bahasa Inggris 5 huruf yang tersembunyi. Kamu punya 6 kesempatan.</li>
            <li>Hijau = huruf dan posisi benar. Kuning = huruf ada tapi posisinya salah. Abu = huruf tidak ada di kata.</li>
            <li>Kamu bermain bergantian dengan lawan (bot atau pemain lain). Yang menebak benar lebih dulu menang. Giliran pertama dan posisi Pemain 1 / Pemain 2 diacak setiap ronde.</li>
            <li>Setelah 2 tebakan salah, petunjuk tentang kata muncul otomatis (huruf awal dan jumlah vokal; huruf akhir setelah 4 salah).</li>
            <li>Tombol Cheat membuka bantuan ekstra. Ronde yang memakai cheat tidak dicatat sebagai rekor.</li>
          </ol>
          <div class="wl-exrow"><span class="wl-ex ok">C</span><span class="wl-ex no">R</span><span class="wl-ex near">A</span><span class="wl-ex near">N</span><span class="wl-ex no">E</span></div>
          <p>Contoh: jawaban CABIN, tebakan CRANE. C hijau (tepat), A dan N kuning (ada tapi pindah posisi), R dan E abu (tidak ada).</p>
          <p>Kontrol: ketik huruf di keyboard fisik atau tap keyboard virtual. Enter = kirim, Backspace = hapus. Tombol ? atau H membuka panduan ini; Shift+H / Shift+C / Shift+P / Shift+R membuka pintasan HUD saat giliranmu.</p>
        </div>
        <div class="wl-foot"><span class="wl-note">Tekan H untuk membuka panduan</span><button class="wl-btn primary" type="button" data-act="close-help">Mulai bermain</button></div>
      </div>
    </div>

    <div class="wl-ov" data-ov="cheats" hidden>
      <div class="wl-card" role="dialog" aria-label="Cheat">
        <div class="wl-head"><h3>Cheat</h3><button class="wl-btn" type="button" data-act="close-cheats">Tutup</button></div>
        <div class="wl-body">
          <p class="wl-warn">Memakai cheat membuat ronde ini tidak dihitung untuk skor terbaik.</p>
          <button class="wl-btn wide" type="button" data-cheat="peek">Intip jawaban</button>
          <div class="wl-peek" data-peek hidden></div>
          <button class="wl-btn wide" type="button" data-cheat="reveal">Bocorkan 1 huruf pada posisinya</button>
          <div class="wl-pattern" data-cheatpattern></div>
          <button class="wl-btn wide" type="button" data-cheat="dead">Tandai huruf yang tidak ada di keyboard</button>
          <button class="wl-btn wide" type="button" data-cheat="fill">Isi jawaban ke baris aktif (tetap tekan Enter)</button>
          <button class="wl-btn wide" type="button" data-cheat="tries">Tambah 2 kesempatan</button>
        </div>
        <div class="wl-foot"><span class="wl-note">Cheat bisa dipakai anytime selama ronde berjalan</span><button class="wl-btn primary" type="button" data-act="close-cheats">Selesai</button></div>
      </div>
    </div>

    <div class="wl-ov" data-ov="pause" hidden>
      <div class="wl-card" role="dialog" aria-label="Jeda">
        <div class="wl-head"><h3>Dijeda</h3></div>
        <div class="wl-body"><p>Bot dan semua penanda waktu dibekukan. Waktu tidak akan loncat saat dilanjutkan.</p></div>
        <div class="wl-foot"><span class="wl-note">Tekan P atau Esc untuk melanjutkan</span><button class="wl-btn primary" type="button" data-act="resume">Lanjut</button></div>
      </div>
    </div>

    <div class="wl-ov" data-ov="result" hidden>
      <div class="wl-card" role="dialog" aria-label="Hasil ronde">
        <div class="wl-head"><h3 class="wl-res-title" data-res-title>Hasil</h3></div>
        <div class="wl-body"><p data-res-sub></p></div>
        <div class="wl-foot">
          <span class="wl-note">Rekor disimpan di perangkat ini</span>
          <div class="wl-rowbtns">
            <button class="wl-btn primary" type="button" data-act="restart">Ronde berikutnya</button>
            <button class="wl-btn" type="button" data-act="close-result">Lihat papan</button>
          </div>
        </div>
      </div>
    </div>
  </section>
</div>`;

    const $ = (s, r) => (r || root).querySelector(s);
    const scopeEl = $("[data-scope]");
    const statusEl = $('[data-hud="status"]');
    const gridEl = $("[data-grid]");
    const msgEl = $("[data-msg]");
    const miniEl = $("[data-mini]");
    const oppNameEl = $("[data-oppname]");
    const oppTagEl = $("[data-opptag]");
    const hudLevel = $('[data-hud="level"]');
    const hudTry = $('[data-hud="try"]');
    const hudSeat = $('[data-hud="seat"]');
    const hudMode = $('[data-hud="mode"]');
    const hudBest = $('[data-hud="best"]');
    const bestWrap = $("[data-bestwrap]");
    const hintCard = $("[data-hintcard]");
    const hintTextEl = $("[data-hinttext]");
    const hintPattern = $("[data-hintpattern]");
    const cheatPattern = $("[data-cheatpattern]");
    const peekEl = $("[data-peek]");
    const cheatBtn = $("[data-cheatbtn]");
    const pauseBtn = $("[data-pausebtn]");
    const helpOv = $('[data-ov="help"]');
    const cheatOv = $('[data-ov="cheats"]');
    const pauseOv = $('[data-ov="pause"]');
    const resultOv = $('[data-ov="result"]');
    const resTitle = $("[data-res-title]");
    const resSub = $("[data-res-sub]");

    /* ---------- keyboard virtual (mobile + klik mouse) ---------- */
    const KEYS = [
        "qwertyuiop".split(""),
        "asdfghjkl".split(""),
        ["enter"].concat("zxcvbnm".split("")).concat(["back"]),
    ];
    const keyEls = {};
    let tileEls = [];

    function buildKb() {
        KEYS.forEach((row, i) => {
            const rowEl = $('[data-krow="' + i + '"]');
            rowEl.innerHTML = "";
            row.forEach((k) => {
                const b = document.createElement("button");
                b.type = "button";
                b.className = "wl-key" + (k === "enter" || k === "back" ? " wide" : "");
                b.dataset.key = k;
                b.textContent = k === "enter" ? "ENTER" : k === "back" ? "HAPUS" : k.toUpperCase();
                b.setAttribute("aria-label", k === "back" ? "Hapus huruf" : k === "enter" ? "Kirim tebakan" : "Huruf " + k.toUpperCase());
                keyEls[k] = b;
                rowEl.appendChild(b);
            });
        });
    }

    function ensureBoard(n) {
        if (tileEls.length === n) return;
        gridEl.innerHTML = "";
        tileEls = [];
        for (let r = 0; r < n; r++) {
            const row = document.createElement("div");
            row.className = "wl-row";
            const tiles = [];
            for (let c = 0; c < LEN; c++) {
                const t = document.createElement("div");
                t.className = "wl-tile";
                row.appendChild(t);
                tiles.push(t);
            }
            gridEl.appendChild(row);
            tileEls.push(tiles);
        }
    }

    /* ---------- util UI ---------- */
    let msgTimer = null;
    function setMsg(text) {
        msgEl.textContent = text;
        cancelLater(msgTimer);
        msgTimer = text ? later(() => { msgEl.textContent = ""; }, 2600) : null;
    }

    function setStatus(text, thinking) {
        statusEl.textContent = text;
        scopeEl.dataset.thinking = thinking ? "1" : "0";
    }

    /* Overlay saling menekan; semua melewati render() + syncFreeze(). */
    function toggleHelp(on) {
        showHelp = typeof on === "boolean" ? on : !showHelp;
        if (showHelp) { showCheats = false; paused = false; }
        syncFreeze(); render();
    }
    function toggleCheats(on) {
        showCheats = typeof on === "boolean" ? on : !showCheats;
        if (showCheats) { showHelp = false; paused = false; }
        syncFreeze(); render();
    }
    function setPaused(on) {
        if (online) return;
        paused = typeof on === "boolean" ? on : !paused;
        if (paused) { showHelp = false; showCheats = false; }
        syncFreeze(); render();
    }
    function doRestart() {
        resultClosed = -1;
        showCheats = false;
        paused = false;
        cur = "";
        submitAction({ type: "restart" });
        render();
    }

    function shake() {
        const row = tileEls[state.rows[me].length];
        if (!row) return;
        row.forEach((t) => {
            t.classList.remove("wl-shake");
            void t.offsetWidth;
            t.classList.add("wl-shake");
        });
    }

    function patternHtml(reveals, answer) {
        let h = "";
        for (let i = 0; i < LEN; i++) {
            const on = reveals.indexOf(i) >= 0;
            h += '<span class="wl-pc' + (on ? " on" : "") + '">' + (on ? answer[i].toUpperCase() : "-") + "</span>";
        }
        return h;
    }

    /* ---------- state & aksi (pola template) ---------- */
    function createRound(level, names, prevAnswer) {
        const lv = makeLevel(prevAnswer);
        return {
            level,
            seed: lv.seed,
            answer: lv.answer,
            seats: lv.seats,
            names: names.slice(),
            first: lv.first,
            turn: lv.first,
            rows: [[], []],
            tries: [BASE_TRIES, BASE_TRIES],
            reveals: [[], []],
            cheated: [false, false],
            status: "playing",
            winner: null,
        };
    }

    function render() {
        if (!state) {
            setStatus("Menunggu host...", false);
            renderOverlays();
            return;
        }
        const playing = state.status === "playing";
        const uiFrozen = uiLocked();
        const myRows = state.rows[me];
        const opRows = state.rows[opp];
        const myTries = state.tries[me];

        /* ronde baru: reset tampilan lokal + umumkan hasil acak */
        if (state.level !== lastLevel) {
            lastLevel = state.level;
            cur = "";
            peeked = false;
            deadMarked = false;
            const firstName = state.names[state.first] || "Lawan";
            setMsg("Ronde " + state.level + ": kamu " + (state.seats[me] === 0 ? "Pemain 1" : "Pemain 2") + ", " + firstName + " jalan duluan.");
        }

        /* papan sendiri */
        ensureBoard(myTries);
        for (let r = 0; r < myTries; r++) {
            const done = r < myRows.length;
            const word = done ? myRows[r].word : r === myRows.length ? cur : "";
            for (let c = 0; c < LEN; c++) {
                const t = tileEls[r][c];
                t.textContent = word[c] ? word[c].toUpperCase() : "";
                t.className = "wl-tile" + (word[c] ? " fill" : "") + (done ? " " + myRows[r].score[c] : "");
            }
        }

        /* warna keyboard: ok > near > no, lalu overlay cheat huruf mati */
        const keyState = {};
        myRows.forEach((row) => {
            row.word.split("").forEach((ch, i) => {
                const s = row.score[i];
                const prev = keyState[ch];
                if (s === "ok" || (s === "near" && prev !== "ok") || (s === "no" && !prev)) keyState[ch] = s;
            });
        });
        Object.keys(keyEls).forEach((k) => {
            keyEls[k].disabled = Boolean(uiFrozen || !playing);
            if (k === "enter" || k === "back") return;
            let cls = "wl-key";
            const s = keyState[k];
            if (s) cls += " " + s;
            else if (deadMarked && state.answer.indexOf(k) < 0) cls += " no";
            keyEls[k].className = cls;
        });

        /* papan mini lawan */
        oppNameEl.textContent = state.names[opp] || (online ? "Pemain lain" : "Bot");
        oppTagEl.textContent = "P" + (state.seats[opp] + 1);
        miniEl.innerHTML = opRows.length
            ? opRows.map((row) =>
                '<div class="wl-mrow">' + row.word.split("").map((ch, i) =>
                    '<span class="wl-mt ' + row.score[i] + '">' + ch + "</span>").join("") + "</div>").join("")
            : '<span class="wl-mempty">Belum menebak.</span>';

        /* HUD */
        hudLevel.textContent = state.level;
        hudTry.textContent = (playing ? Math.min(myRows.length + 1, myTries) : myRows.length) + "/" + myTries;
        hudSeat.textContent = "P" + (state.seats[me] + 1);
        hudMode.textContent = online ? "Online" : "Solo";
        bestWrap.hidden = online;
        hudBest.textContent = best ? best + " tebakan" : "-";
        /* Label di-update lewat span, ikon tidak boleh ditimpa textContent. */
        cheatBtn.classList.toggle("on", state.cheated[me]);
        const cheatLabel = cheatBtn.querySelector(".wl-btn-label");
        if (cheatLabel) cheatLabel.textContent = state.cheated[me] ? "Cheat aktif" : "Cheat";
        cheatBtn.setAttribute("aria-label", state.cheated[me] ? "Cheat aktif" : "Cheat");
        const pauseLabel = pauseBtn && pauseBtn.querySelector(".wl-btn-label");
        if (pauseLabel) pauseLabel.textContent = paused ? "Lanjut" : "Jeda";
        if (pauseBtn) {
            pauseBtn.setAttribute("aria-label", paused ? "Lanjut" : "Jeda");
            pauseBtn.disabled = online; // ronde online tidak bisa dijeda
        }

        /* petunjuk setelah 2 salah + pola huruf hasil cheat */
        const wrong = myRows.length;
        const showHint = playing && wrong >= 2;
        const hasReveal = state.reveals[me].length > 0;
        hintCard.hidden = !showHint && !hasReveal;
        hintTextEl.hidden = !showHint;
        hintTextEl.textContent = showHint ? hintText(state.answer, wrong) : "";
        hintPattern.hidden = !hasReveal;
        hintPattern.innerHTML = patternHtml(state.reveals[me], state.answer);
        cheatPattern.innerHTML = patternHtml(state.reveals[me], state.answer);
        peekEl.hidden = !peeked;
        peekEl.textContent = peeked ? state.answer.toUpperCase() : "";

        /* status giliran / hasil akhir */
        if (!playing) {
            setStatus("Ronde selesai", false);
            if (!online && state.winner === me && !state.cheated[me] && bestSaved !== state.level) {
                bestSaved = state.level;
                const used = myRows.length;
                if (!best || used < best) {
                    best = used;
                    saveBest(best);
                    hudBest.textContent = best + " tebakan";
                }
            }
            if (resultClosed !== state.level) {
                const ans = state.answer.toUpperCase();
                if (state.winner === -1) {
                    resTitle.textContent = "Seri";
                    resTitle.className = "wl-res-title";
                    resSub.textContent = "Keduanya kehabisan kesempatan. Jawabannya: " + ans + ".";
                } else if (state.winner === me) {
                    resTitle.textContent = "Kamu menang!";
                    resTitle.className = "wl-res-title win";
                    resSub.textContent = "Kata " + ans + " ditemukan dalam " + myRows.length + " tebakan." + (state.cheated[me] ? " Ronde ini memakai cheat, jadi tidak dicatat sebagai rekor." : "");
                } else {
                    resTitle.textContent = (state.names[state.winner] || "Lawan") + " menang";
                    resTitle.className = "wl-res-title lose";
                    resSub.textContent = "Lawan menemukan " + ans + " dalam " + state.rows[state.winner].length + " tebakan. Coba lagi di ronde berikutnya.";
                }
            }
        } else if (state.turn === me) {
            const exhausted = myRows.length >= myTries;
            setStatus(exhausted ? "Kesempatan habis - menunggu lawan" : "Giliranmu", exhausted);
        } else {
            setStatus(online ? "Giliran " + (state.names[opp] || "lawan") : "Bot berpikir...", true);
        }

        renderOverlays();
        scheduleBot();
    }

    /* Overlay saling menimpa: help > pause > cheats > result. Semua panel
       membekukan bot & timer, dan help selalu menang jika dibuka. */
    function renderOverlays() {
        const resultVisible = Boolean(state && state.status !== "playing" && resultClosed !== state.level);
        resultOv.hidden = !resultVisible || showHelp || showCheats || paused;
        helpOv.hidden = !showHelp;
        pauseOv.hidden = !paused || showHelp || showCheats;
        cheatOv.hidden = !showCheats || showHelp || paused;
        syncFreeze();
    }

    function publish() {
        render();
        // Hanya host yang menulis state kanonik ke Firebase.
        if (online && room.isHost) room.publishState(state).catch(console.warn);
    }

    function applyAction(action, actor) {
        if (!state || !action || typeof action !== "object") return;
        if (actor !== 0 && actor !== 1) return;

        if (action.type === "hello") {
            if (!online) return;
            const n = String(action.name || "").trim().slice(0, 16);
            if (n && n !== state.names[actor]) {
                state.names[actor] = n;
                publish();
            }
            return;
        }

        if (action.type === "guess") {
            if (state.status !== "playing" || state.turn !== actor) return;
            const w = String(action.word || "").toLowerCase();
            if (!/^[a-z]{5}$/.test(w) || WORDS.indexOf(w) < 0) return;
            if (state.rows[actor].length >= state.tries[actor]) return;
            state.rows[actor].push({ word: w, score: scoreGuess(w, state.answer) });
            if (w === state.answer) {
                state.status = "over";
                state.winner = actor;
            } else {
                const other = 1 - actor;
                const otherLeft = state.rows[other].length < state.tries[other];
                const actorLeft = state.rows[actor].length < state.tries[actor];
                if (!otherLeft && !actorLeft) {
                    state.status = "over";
                    state.winner = -1; // seri
                } else {
                    state.turn = otherLeft ? other : actor;
                }
            }
            publish();
            return;
        }

        if (action.type === "restart") {
            state = createRound(state.level + 1, state.names, state.answer);
            publish();
            return;
        }

        if (action.type === "cheat") {
            if (state.status !== "playing") return;
            state.cheated[actor] = true;
            if (action.kind === "reveal") {
                const left = [];
                for (let i = 0; i < LEN; i++) if (state.reveals[actor].indexOf(i) < 0) left.push(i);
                if (left.length) {
                    const rr = rng((state.seed + state.level * 101 + state.reveals[actor].length * 7) >>> 0);
                    state.reveals[actor].push(left[Math.floor(rr() * left.length)]);
                }
            } else if (action.kind === "tries") {
                state.tries[actor] = Math.min(MAX_TRIES, state.tries[actor] + 2);
            }
            publish();
            return;
        }
    }

    function submitAction(action) {
        if (online && !room.isHost) {
            room.sendAction(action).catch(console.warn);
            return;
        }
        applyAction(action, me);
    }

    /* ---------- bot lokal (mode ai) ---------- */
    function scheduleBot() {
        if (online || !state || state.status !== "playing" || state.turn !== 1) return;
        if (frozen() || timers.some((t) => t.bot)) return;
        const lv = state.level;
        const t = later(() => {
            if (!state || state.level !== lv || state.status !== "playing" || state.turn !== 1) return;
            if (frozen()) { scheduleBot(); return; } // tunda selama panel terbuka
            const w = botPick(state.rows[1], Math.random);
            applyAction({ type: "guess", word: w }, 1);
        }, 1000 + Math.random() * 900);
        t.bot = true;
    }

    /* ---------- input ---------- */
    function press(k) {
        if (!state || state.status !== "playing" || uiLocked()) return;
        if (k === "enter") {
            if (state.turn !== me) { setMsg("Tunggu giliranmu."); return; }
            if (state.rows[me].length >= state.tries[me]) { setMsg("Kesempatanmu sudah habis."); return; }
            if (cur.length < LEN) { setMsg("Kurang " + (LEN - cur.length) + " huruf lagi."); shake(); return; }
            if (WORDS.indexOf(cur) < 0) { setMsg("Kata tidak ada di kamus."); shake(); return; }
            const w = cur;
            cur = "";
            setMsg("");
            submitAction({ type: "guess", word: w });
            render();
            return;
        }
        if (state.turn !== me) { setMsg("Tunggu giliranmu."); return; }
        if (state.rows[me].length >= state.tries[me]) { setMsg("Kesempatanmu sudah habis - tunggu lawan."); return; }
        if (k === "back") {
            cur = cur.slice(0, -1);
            render();
            return;
        }
        if (/^[a-z]$/.test(k) && cur.length < LEN) {
            cur += k;
            render();
            const row = tileEls[state.rows[me].length];
            const t = row && row[cur.length - 1];
            if (t) {
                t.classList.remove("wl-pop");
                void t.offsetWidth;
                t.classList.add("wl-pop");
            }
        }
    }

    function doCheat(kind) {
        if (!state) return;
        const playing = state.status === "playing";
        if (kind === "peek") {
            peeked = !peeked;
            if (peeked && playing) submitAction({ type: "cheat", kind: "flag" });
            render();
            return;
        }
        if (!playing) { setMsg("Cheat hanya aktif selama ronde berjalan."); return; }
        if (kind === "dead") {
            deadMarked = true;
            submitAction({ type: "cheat", kind: "flag" });
            render();
            setMsg("Huruf yang tidak ada ditandai di keyboard.");
            return;
        }
        if (kind === "fill") {
            if (state.turn !== me || state.rows[me].length >= state.tries[me]) {
                setMsg("Isi otomatis hanya bisa saat giliranmu.");
                return;
            }
            cur = state.answer;
            submitAction({ type: "cheat", kind: "flag" });
            render();
            setMsg("Jawaban diisi ke baris aktif - tekan ENTER.");
            return;
        }
        if (kind === "reveal" || kind === "tries") {
            submitAction({ type: "cheat", kind });
            render();
        }
    }

    /* ---------- event: mouse / touch (delegasi klik) ---------- */
    function handleClick(event) {
        const t = event.target;
        if (!t || !t.closest) return;
        if (t.closest("[data-exit]")) { onExit(); return; }
        if (t.closest("[data-help]") || t.closest("[data-act='help']")) { toggleHelp(); return; }
        if (t.closest("[data-help-close]")) { toggleHelp(false); return; }
        if (t.closest("[data-cheats]") || t.closest("[data-act='cheats']")) { toggleCheats(); return; }
        if (t.closest("[data-pause]")) { setPaused(); return; }
        if (t.closest("[data-restart]")) { doRestart(); return; }
        const key = t.closest("[data-key]");
        if (key) { press(key.dataset.key); return; }
        const cheat = t.closest("[data-cheat]");
        if (cheat) { doCheat(cheat.dataset.cheat); return; }
        const act = t.closest("[data-act]");
        if (act) {
            const a = act.dataset.act;
            if (a === "close-help") toggleHelp(false);
            else if (a === "close-cheats") toggleCheats(false);
            else if (a === "resume") setPaused(false);
            else if (a === "close-result") { resultClosed = state ? state.level : -1; render(); }
            else if (a === "restart") doRestart();
            return;
        }
        if (t === helpOv) { toggleHelp(false); return; } // klik area luar kartu
        if (t === cheatOv) { toggleCheats(false); return; }
        if (t === pauseOv) { setPaused(false); return; }
    }

    /* ---------- event: keyboard fisik (desktop) ---------- */
    function onKey(e) {
        if (!root.isConnected) return;
        const tgt = e.target;
        if (tgt && tgt.closest && tgt.closest("input, textarea, select, [contenteditable]")) return;
        if (e.ctrlKey || e.metaKey || e.altKey) return;
        if ((e.key === "Enter" || e.key === " ") && tgt && tgt.closest && tgt.closest("button")) return;
        const k = e.key, c = e.code;
        /* Huruf adalah input tebakan saat giliranmu; Shift mengubah H/C/P/R
           jadi pintasan HUD. Di luar giliran, pintasan langsung aktif. */
        const typing = Boolean(state && state.status === "playing" && state.turn === me && !uiLocked());
        const shortcut = () => e.shiftKey || !typing;

        /* prioritas: help → cheats → pause/Escape → restart → aksi game */
        if (c === "KeyH" && shortcut()) { toggleHelp(); e.preventDefault(); return; }
        if (k === "?") { toggleHelp(); e.preventDefault(); return; }
        if (c === "KeyC" && shortcut()) { toggleCheats(); e.preventDefault(); return; }
        if (c === "KeyP" || k === "Escape") {
            if (showHelp) toggleHelp(false);
            else if (showCheats) toggleCheats(false);
            else if (paused) setPaused(false);
            else if (c === "KeyP") setPaused(true);
            else if (!resultOv.hidden) { resultClosed = state ? state.level : -1; render(); }
            e.preventDefault(); return;
        }
        if (c === "KeyR" && shortcut()) { doRestart(); e.preventDefault(); return; }
        if (uiLocked()) {
            if (k === "Enter") {
                if (showHelp) toggleHelp(false);
                else if (showCheats) toggleCheats(false);
                else if (paused) setPaused(false);
                else if (!resultOv.hidden) doRestart();
                e.preventDefault();
            }
            return;
        }
        if (!state) return;
        if (k === "Enter") { e.preventDefault(); press("enter"); }
        else if (k === "Backspace") { e.preventDefault(); press("back"); }
        else if (/^[a-zA-Z]$/.test(k)) press(k.toLowerCase());
    }

    /* ---------- init sesuai template ---------- */
    buildKb();
    root.addEventListener("click", handleClick);
    document.addEventListener("keydown", onKey);

    if (online) {
        const offRoom = room.onRoom && room.onRoom((nextRoom) => { roomData = nextRoom; render(); });
        if (typeof offRoom === "function") unsubs.push(offRoom);
        if (room.isHost) {
            state = createRound(1, [String(playerName || "Pemain 1").slice(0, 16), "Pemain 2"], null);
            publish();
            const offAct = room.onAction && room.onAction((action) => applyAction(action, 1));
            if (typeof offAct === "function") unsubs.push(offAct);
        } else {
            const offState = room.onState && room.onState((nextState) => { state = nextState; render(); });
            if (typeof offState === "function") unsubs.push(offState);
            if (room.sendAction) room.sendAction({ type: "hello", name: String(playerName || "Pemain 2").slice(0, 16) }).catch(console.warn);
            render(); // tampilan menunggu sampai state host tiba
        }
    } else {
        state = createRound(1, ["Kamu", "Bot"], null);
        render();
    }
    /* render() di atas sudah membuka panduan otomatis pada run pertama;
       bot ikut menunggu karena semua overlay membekukan timer virtual. */

    return {
        destroy() {
            root.removeEventListener("click", handleClick);
            document.removeEventListener("keydown", onKey);
            clearTimers();
            msgTimer = null;
            unsubs.forEach((off) => { try { off(); } catch (err) { console.warn(err); } });
            unsubs.length = 0;
        },
    };
}