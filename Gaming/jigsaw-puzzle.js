/* ==== GAME: jigsaw-puzzle.js ==== */
/*
  - Port dari MGP_REGISTER ke template META + mount(root, context).
  - id META harus sama dengan nama file tanpa .js (jigsaw-puzzle).
  - Setelah menyalin file ini, jalankan: node tools/build-games-manifest.mjs
  - Fitur: UI minimalis, popup referensi tiap level, generator level acak yang
    dijamin bisa diselesaikan, 5 variasi gambar, mode Solo / VS Bot / multiplayer,
    giliran & posisi pemain diacak, cheat overlay, tombol virtual untuk mobile,
    keyboard + mouse untuk desktop. Tanpa teks tutorial. ASCII only.
*/

import { iconSVG } from "../JS/icons.js";

/* ---------- artwork: 5 gambar, tanpa defs/id sehingga string yang sama
   bisa ditanam di setiap keping; viewBox per keping memotong gambar ---------- */
const ART_W = 480, ART_H = 360;

const ARTS = [
    {
        name: "Green Valley", svg: `
<g>
  <rect x="0" y="0" width="480" height="360" fill="#dff2fc"/>
  <rect x="0" y="0" width="480" height="150" fill="#c2e4f7"/>
  <rect x="0" y="0" width="480" height="92" fill="#a3d6f1"/>
  <rect x="0" y="0" width="480" height="42" fill="#8bcaec"/>
  <circle cx="376" cy="78" r="66" fill="#fde68a" opacity="0.22"/>
  <circle cx="376" cy="78" r="46" fill="#fde68a" opacity="0.3"/>
  <circle cx="376" cy="78" r="30" fill="#fbbf24"/>
  <circle cx="376" cy="78" r="21" fill="#fcd34d"/>
  <g fill="#ffffff" opacity="0.92">
    <ellipse cx="96" cy="66" rx="34" ry="15"/>
    <ellipse cx="120" cy="55" rx="22" ry="13"/>
    <ellipse cx="73" cy="58" rx="18" ry="11"/>
    <ellipse cx="240" cy="40" rx="27" ry="11"/>
    <ellipse cx="258" cy="31" rx="16" ry="9"/>
  </g>
  <path d="M296 64 q8 -9 16 0 q8 -9 16 0" fill="none" stroke="#64748b" stroke-width="2.4" stroke-linecap="round"/>
  <path d="M180 96 q6 -7 12 0 q6 -7 12 0" fill="none" stroke="#64748b" stroke-width="2" stroke-linecap="round"/>
  <polygon points="0,214 96,96 200,214" fill="#94afd6"/>
  <polygon points="96,96 116,118 106,111 96,122 87,111 78,118" fill="#f8fafc"/>
  <polygon points="140,214 252,64 366,214" fill="#7c9cd0"/>
  <polygon points="252,64 273,92 263,85 253,97 243,85 231,92" fill="#f8fafc"/>
  <polygon points="300,214 404,104 480,214" fill="#94afd6"/>
  <polygon points="404,104 420,127 411,120 403,131 394,120 382,127" fill="#f8fafc"/>
  <rect x="0" y="212" width="480" height="148" fill="#83c17b"/>
  <ellipse cx="118" cy="228" rx="170" ry="50" fill="#8fcf8b"/>
  <ellipse cx="392" cy="234" rx="190" ry="56" fill="#7cc47c"/>
  <path d="M86 268 L68 360 L122 360 L102 268 Z" fill="#e2cb95"/>
  <rect x="52" y="216" width="78" height="52" fill="#f6e2bb"/>
  <rect x="114" y="186" width="11" height="22" fill="#a1452f"/>
  <polygon points="46,218 91,182 136,218" fill="#d1495b"/>
  <rect x="84" y="236" width="18" height="32" rx="2" fill="#8a5a2b"/>
  <rect x="62" y="226" width="16" height="16" fill="#fff3bf" stroke="#a1452f" stroke-width="2"/>
  <rect x="106" y="226" width="16" height="16" fill="#fff3bf" stroke="#a1452f" stroke-width="2"/>
  <path d="M70 226v16M62 234h16M114 226v16M106 234h16" stroke="#a1452f" stroke-width="1.5" fill="none"/>
  <rect x="27" y="230" width="7" height="28" fill="#8a5a2b"/>
  <circle cx="30" cy="216" r="18" fill="#4f9d5a"/>
  <circle cx="22" cy="225" r="12" fill="#57a862"/>
  <circle cx="39" cy="225" r="12" fill="#478f52"/>
  <rect x="438" y="254" width="9" height="18" fill="#8a5a2b"/>
  <polygon points="443,194 464,236 422,236" fill="#2f7a46"/>
  <polygon points="443,214 468,260 418,260" fill="#38874f"/>
  <circle cx="404" cy="232" r="16" fill="#4f9d5a"/>
  <rect x="401" y="246" width="6" height="20" fill="#8a5a2b"/>
  <ellipse cx="250" cy="318" rx="152" ry="34" fill="#48a4dc"/>
  <ellipse cx="250" cy="315" rx="112" ry="23" fill="#74c3e8"/>
  <path d="M172 314 q12 -7 24 0 q12 7 24 0" fill="none" stroke="#e8f7ff" stroke-width="3" stroke-linecap="round"/>
  <path d="M292 324 q10 -6 20 0 q10 6 20 0" fill="none" stroke="#e8f7ff" stroke-width="3" stroke-linecap="round"/>
  <ellipse cx="472" cy="350" rx="32" ry="15" fill="#5aa661"/>
  <ellipse cx="472" cy="344" rx="20" ry="10" fill="#63b36b"/>
  <ellipse cx="14" cy="352" rx="28" ry="14" fill="#5aa661"/>
</g>` },
    {
        name: "Night City", svg: `
<g>
  <rect x="0" y="0" width="480" height="360" fill="#0f172a"/>
  <rect x="0" y="150" width="480" height="210" fill="#1e293b"/>
  <g fill="#e2e8f0">
    <circle cx="40" cy="36" r="1.6"/><circle cx="96" cy="70" r="1.3"/><circle cx="150" cy="30" r="1.8"/>
    <circle cx="210" cy="58" r="1.3"/><circle cx="262" cy="26" r="1.6"/><circle cx="310" cy="66" r="1.3"/>
    <circle cx="452" cy="34" r="1.6"/><circle cx="430" cy="96" r="1.2"/><circle cx="60" cy="110" r="1.2"/>
    <circle cx="188" cy="104" r="1.4"/>
  </g>
  <circle cx="392" cy="64" r="24" fill="#e2e8f0"/>
  <circle cx="384" cy="58" r="6" fill="#cbd5e1"/>
  <circle cx="400" cy="72" r="4" fill="#cbd5e1"/>
  <g fill="#283548">
    <rect x="20" y="150" width="54" height="160"/><rect x="90" y="120" width="40" height="190"/>
    <rect x="150" y="170" width="60" height="140"/><rect x="230" y="132" width="46" height="178"/>
    <rect x="300" y="158" width="58" height="152"/><rect x="370" y="110" width="44" height="200"/>
    <rect x="430" y="150" width="40" height="160"/>
  </g>
  <g fill="#3b4a63">
    <rect x="0" y="210" width="70" height="100"/><rect x="110" y="196" width="76" height="114"/>
    <rect x="250" y="206" width="80" height="104"/><rect x="396" y="192" width="84" height="118"/>
  </g>
  <g fill="#fcd34d">
    <rect x="12" y="224" width="9" height="11"/><rect x="34" y="224" width="9" height="11"/>
    <rect x="12" y="248" width="9" height="11"/><rect x="56" y="248" width="9" height="11"/>
    <rect x="122" y="210" width="9" height="11"/><rect x="144" y="210" width="9" height="11"/>
    <rect x="166" y="234" width="9" height="11"/><rect x="122" y="258" width="9" height="11"/>
    <rect x="262" y="220" width="9" height="11"/><rect x="284" y="220" width="9" height="11"/>
    <rect x="306" y="244" width="9" height="11"/><rect x="262" y="268" width="9" height="11"/>
    <rect x="408" y="206" width="9" height="11"/><rect x="430" y="206" width="9" height="11"/>
    <rect x="452" y="230" width="9" height="11"/><rect x="408" y="254" width="9" height="11"/>
  </g>
  <g fill="#f8fafc" opacity="0.22">
    <rect x="34" y="248" width="9" height="11"/><rect x="144" y="234" width="9" height="11"/>
    <rect x="284" y="244" width="9" height="11"/><rect x="430" y="230" width="9" height="11"/>
    <rect x="452" y="254" width="9" height="11"/>
  </g>
  <rect x="86" y="252" width="4" height="58" fill="#475569"/>
  <circle cx="88" cy="248" r="10" fill="#fde68a" opacity="0.25"/>
  <circle cx="88" cy="248" r="5" fill="#fde68a"/>
  <rect x="348" y="252" width="4" height="58" fill="#475569"/>
  <circle cx="350" cy="248" r="10" fill="#fde68a" opacity="0.25"/>
  <circle cx="350" cy="248" r="5" fill="#fde68a"/>
  <rect x="0" y="306" width="480" height="54" fill="#111a2e"/>
  <g fill="#64748b">
    <rect x="14" y="330" width="26" height="4"/><rect x="70" y="330" width="26" height="4"/>
    <rect x="126" y="330" width="26" height="4"/><rect x="182" y="330" width="26" height="4"/>
    <rect x="238" y="330" width="26" height="4"/><rect x="294" y="330" width="26" height="4"/>
    <rect x="350" y="330" width="26" height="4"/><rect x="406" y="330" width="26" height="4"/>
    <rect x="462" y="330" width="18" height="4"/>
  </g>
</g>` },
    {
        name: "Sunny Coast", svg: `
<g>
  <rect x="0" y="0" width="480" height="360" fill="#d8f0fb"/>
  <rect x="0" y="0" width="480" height="110" fill="#c3e7f8"/>
  <circle cx="84" cy="72" r="42" fill="#fbbf24" opacity="0.25"/>
  <circle cx="84" cy="72" r="28" fill="#fbbf24"/>
  <circle cx="84" cy="72" r="19" fill="#fcd34d"/>
  <g fill="#ffffff" opacity="0.92">
    <ellipse cx="250" cy="52" rx="34" ry="13"/><ellipse cx="274" cy="42" rx="20" ry="10"/>
    <ellipse cx="392" cy="86" rx="30" ry="12"/><ellipse cx="414" cy="76" rx="18" ry="9"/>
  </g>
  <path d="M330 60 q7 -8 14 0 q7 -8 14 0" fill="none" stroke="#64748b" stroke-width="2.2" stroke-linecap="round"/>
  <rect x="0" y="190" width="480" height="112" fill="#3aa7d9"/>
  <rect x="0" y="244" width="480" height="58" fill="#2f8fc0"/>
  <path d="M40 214 q12 -7 24 0 q12 7 24 0" fill="none" stroke="#e8f7ff" stroke-width="3" stroke-linecap="round"/>
  <path d="M396 226 q10 -6 20 0 q10 6 20 0" fill="none" stroke="#e8f7ff" stroke-width="3" stroke-linecap="round"/>
  <path d="M120 262 q10 -6 20 0 q10 6 20 0" fill="none" stroke="#bfe6f5" stroke-width="3" stroke-linecap="round"/>
  <rect x="318" y="186" width="3" height="46" fill="#57534e"/>
  <polygon points="324,190 324,228 352,228" fill="#f8fafc"/>
  <polygon points="315,196 315,228 294,228" fill="#fde68a"/>
  <path d="M296 232 L348 232 L336 250 L308 250 Z" fill="#8a5a2b"/>
  <rect x="0" y="292" width="480" height="68" fill="#f2dfae"/>
  <ellipse cx="130" cy="296" rx="210" ry="24" fill="#f6e7bd"/>
  <rect x="150" y="256" width="4" height="58" fill="#8a5a2b"/>
  <path d="M114 262 Q152 228 190 262 Z" fill="#ef4444"/>
  <path d="M152 232 Q172 242 190 262 L152 262 Z" fill="#fca5a5"/>
  <rect x="196" y="302" width="46" height="20" rx="3" fill="#60a5fa"/>
  <rect x="196" y="308" width="46" height="3" fill="#dbeafe"/>
  <circle cx="268" cy="308" r="10" fill="#f472b6"/>
  <path d="M258 308 a10 10 0 0 1 20 0" fill="#f8fafc"/>
  <polygon points="84,326 88,334 97,334 90,340 93,349 84,344 75,349 78,340 71,334 80,334" fill="#fb923c"/>
  <ellipse cx="452" cy="344" rx="34" ry="12" fill="#e8cf9a"/>
</g>` },
    {
        name: "Desert Dusk", svg: `
<g>
  <rect x="0" y="0" width="480" height="360" fill="#fbd9b4"/>
  <rect x="0" y="0" width="480" height="150" fill="#f7b98a"/>
  <rect x="0" y="0" width="480" height="80" fill="#f29e6d"/>
  <circle cx="240" cy="152" r="58" fill="#fde68a" opacity="0.35"/>
  <circle cx="240" cy="152" r="42" fill="#fde68a"/>
  <circle cx="240" cy="152" r="30" fill="#fef3c7"/>
  <path d="M96 84 q7 -8 14 0 q7 -8 14 0" fill="none" stroke="#7c2d12" stroke-width="2.2" stroke-linecap="round"/>
  <path d="M356 64 q6 -7 12 0 q6 -7 12 0" fill="none" stroke="#7c2d12" stroke-width="2" stroke-linecap="round"/>
  <path d="M0 262 Q120 212 240 258 Q360 302 480 250 L480 360 L0 360 Z" fill="#e2aa6b"/>
  <path d="M0 306 Q160 254 320 306 Q400 330 480 312 L480 360 L0 360 Z" fill="#cf9250"/>
  <rect x="96" y="226" width="14" height="70" rx="6" fill="#3f8f5a"/>
  <rect x="76" y="240" width="10" height="24" rx="5" fill="#3f8f5a"/>
  <rect x="82" y="256" width="18" height="8" rx="4" fill="#3f8f5a"/>
  <rect x="118" y="232" width="10" height="22" rx="5" fill="#47a066"/>
  <rect x="106" y="246" width="18" height="8" rx="4" fill="#47a066"/>
  <rect x="388" y="252" width="10" height="48" rx="5" fill="#3f8f5a"/>
  <rect x="374" y="262" width="8" height="16" rx="4" fill="#47a066"/>
  <rect x="378" y="272" width="14" height="6" rx="3" fill="#47a066"/>
  <ellipse cx="296" cy="330" rx="28" ry="11" fill="#b07a3e"/>
  <ellipse cx="326" cy="338" rx="15" ry="7" fill="#a06c33"/>
  <ellipse cx="52" cy="342" rx="24" ry="9" fill="#b07a3e"/>
  <path d="M210 322 q10 -6 20 0" fill="none" stroke="#b07a3e" stroke-width="3" stroke-linecap="round"/>
  <path d="M420 330 q9 -5 18 0" fill="none" stroke="#a06c33" stroke-width="3" stroke-linecap="round"/>
</g>` },
    {
        name: "Deep Space", svg: `
<g>
  <rect x="0" y="0" width="480" height="360" fill="#0b1020"/>
  <ellipse cx="120" cy="90" rx="130" ry="60" fill="#7c3aed" opacity="0.14"/>
  <ellipse cx="380" cy="260" rx="150" ry="70" fill="#2563eb" opacity="0.14"/>
  <g fill="#e2e8f0">
    <circle cx="36" cy="40" r="1.6"/><circle cx="90" cy="150" r="1.3"/><circle cx="160" cy="60" r="1.8"/>
    <circle cx="220" cy="120" r="1.2"/><circle cx="280" cy="40" r="1.6"/><circle cx="330" cy="200" r="1.3"/>
    <circle cx="452" cy="60" r="1.6"/><circle cx="430" cy="180" r="1.2"/><circle cx="60" cy="250" r="1.4"/>
    <circle cx="200" cy="300" r="1.4"/><circle cx="460" cy="320" r="1.3"/><circle cx="140" cy="330" r="1.2"/>
  </g>
  <circle cx="360" cy="120" r="40" fill="#f59e0b"/>
  <circle cx="348" cy="108" r="9" fill="#d97706"/>
  <circle cx="374" cy="132" r="6" fill="#d97706"/>
  <circle cx="368" cy="102" r="4" fill="#fbbf24"/>
  <ellipse cx="360" cy="120" rx="64" ry="14" fill="none" stroke="#fcd34d" stroke-width="5" opacity="0.8" transform="rotate(-18 360 120)"/>
  <circle cx="80" cy="80" r="16" fill="#cbd5e1"/>
  <circle cx="74" cy="76" r="4" fill="#94a3b8"/>
  <circle cx="88" cy="86" r="3" fill="#94a3b8"/>
  <polygon points="120,196 138,232 102,232" fill="#e2e8f0"/>
  <rect x="102" y="232" width="36" height="58" rx="8" fill="#f8fafc"/>
  <circle cx="120" cy="252" r="9" fill="#38bdf8"/>
  <circle cx="120" cy="252" r="9" fill="none" stroke="#64748b" stroke-width="3"/>
  <polygon points="102,268 84,298 102,290" fill="#ef4444"/>
  <polygon points="138,268 156,298 138,290" fill="#ef4444"/>
  <rect x="108" y="290" width="24" height="8" rx="3" fill="#94a3b8"/>
  <polygon points="112,298 120,326 128,298" fill="#fbbf24"/>
  <polygon points="116,298 120,314 124,298" fill="#fef3c7"/>
  <circle cx="250" cy="240" r="3" fill="#f472b6"/>
  <circle cx="250" cy="240" r="7" fill="none" stroke="#f472b6" stroke-width="1.5" opacity="0.5"/>
</g>` },
];

/* ---------- ikon UI (inline SVG, stroke currentColor) ---------- */
const ICONS = {
    rotate: '<polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>',
    eye: '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>',
    x: '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>',
    flask: '<path d="M9 3h6"/><path d="M10 3v5.5L4.8 18a2 2 0 0 0 1.8 3h10.8a2 2 0 0 0 1.8-3L14 8.5V3"/><line x1="7.5" y1="14" x2="16.5" y2="14"/>',
    refresh: '<polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/>',
    play: '<polygon points="6 4 20 12 6 20 6 4"/>',
    shuffle: '<polyline points="16 3 21 3 21 8"/><line x1="4" y1="20" x2="21" y2="3"/><polyline points="21 16 21 21 16 21"/><line x1="15" y1="15" x2="21" y2="21"/><line x1="4" y1="4" x2="9" y2="9"/>',
};
const icon = (n) =>
    '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    ICONS[n] + "</svg>";

/* ---------- helper murni ---------- */
const randInt = (n) => Math.floor(Math.random() * n);
const normRot = (r) => ((Number(r) % 360) + 360) % 360;
const shuffle = (arr) => {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
        const j = randInt(i + 1);
        const t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
};
/* Penempatan valid hanya jika sel rumah cocok DAN rotasi kembali ke 0 (mod 360). */
const isAccepted = (p, c, r) =>
    !!p && c === p.homeCol && r === p.homeRow && normRot(p.rot) === 0;

function levelConfig(level) {
    if (level === 1) return { cols: 3, rows: 3, rotation: false };
    if (level === 2) return { cols: 4, rows: 4, rotation: true };
    if (level === 3) return { cols: 5, rows: 4, rotation: true };
    const pool = [
        { cols: 4, rows: 4 }, { cols: 5, rows: 4 },
        { cols: 6, rows: 4 }, { cols: 6, rows: 5 },
    ];
    const p = pool[randInt(pool.length)];
    return { cols: p.cols, rows: p.rows, rotation: true };
}

/* Generator level acak yang DIJAMIN bisa diselesaikan:
   - setiap keping punya sel rumah unik (pemotongan grid), jadi tidak ada
     konfigurasi yang buntu;
   - rotasi selalu kelipatan 90 dan tombol Rotate selalu tersedia pada level
     rotasi, sehingga sudut apa pun bisa dinormalkan kembali ke 0;
   - level rotasi dipaksa punya minimal satu keping berotasi agar menantang. */
function generateLevel(level, prevArt, gen) {
    const cfg = levelConfig(level);
    let artIdx = randInt(ARTS.length);
    if (ARTS.length > 1 && artIdx === prevArt)
        artIdx = (artIdx + 1 + randInt(ARTS.length - 1)) % ARTS.length;
    const pieces = [];
    for (let r = 0; r < cfg.rows; r++)
        for (let c = 0; c < cfg.cols; c++)
            pieces.push({
                id: "p" + (r * cfg.cols + c),
                homeCol: c, homeRow: r,
                rot: cfg.rotation ? 90 * randInt(4) : 0,
                placed: false, by: null,
            });
    if (cfg.rotation && pieces.every((p) => p.rot === 0))
        pieces[randInt(pieces.length)].rot = 90 * (1 + randInt(3));
    const first = randInt(2); /* acak siapa jalan duluan */
    return {
        level, cols: cfg.cols, rows: cfg.rows, rotation: cfg.rotation,
        artIdx, pieces, order: shuffle(pieces.map((p) => p.id)),
        first,
        seats: Math.random() < 0.5 ? [0, 1] : [1, 0], /* acak posisi player */
        turn: first,
        scores: [0, 0], misses: [0, 0],
        phase: "reference", startedAt: 0, doneIn: 0,
        winner: null, lastEvent: null, gen,
    };
}

const BOT_ACCURACY = 0.78;
const CHEAT_LABEL = {
    straighten: "Straighten all", placeOne: "Place one", finish: "Finish level",
    clearMisses: "Clear misses", skip: "Skip level",
};

export const META = {
    id: "jigsaw-puzzle",
    name: "Jigsaw Puzzle",
    category: "puzzle",
    catLabel: "Puzzle",
    desc: "Rebuild the picture piece by piece - solo, against the bot, or a friend.",
    art: '<svg viewBox="0 0 48 48" width="54" height="54" aria-hidden="true"><path fill="currentColor" d="M12 16h8a4.5 4.5 0 1 1 9 0h7v8a4.5 4.5 0 1 0 0 9v7H12z"/></svg>',
    bg: ["#e0e7ff", "#c7d2fe"],
    bestKey: "jigsawPuzzleBestLevel",
};

export function mount(root, context = {}) {
    const { mode = "ai", room = null, playerName = "Player", onExit = () => { } } = context;
    const online = mode === "room" && Boolean(room);
    const playerIndex = online && !room.isHost ? 1 : 0;
    let roomData = room?.room || null;
    let state = null;
    let destroyed = false;

    /* UI lokal (tidak diserialisasi ke room) */
    const ui = {
        selectedId: null, cursor: { c: 0, r: 0 },
        peek: false,
        gen: -1, prevPlaced: new Set(), lastEventSeq: 0,
        toastTimer: null, shakeTimer: null,
    };
    let cheatOpen = false, helpOpen = false, paused = false, pauseAt = 0;
    let botTimer = null, tickTimer = null;
    const offs = [];
    let best = 0;
    try { best = Number(localStorage.getItem(META.bestKey)) || 0; } catch (err) { }

    /* First-run internal guide, once per browser (global help stays closed). */
    let seenHelp = true;
    try { seenHelp = localStorage.getItem("jigsaw-puzzle-help-seen") === "1"; } catch (_) { seenHelp = true; }
    if (!seenHelp) {
        helpOpen = true;
        try { localStorage.setItem("jigsaw-puzzle-help-seen", "1"); } catch (_) { /* storage blocked */ }
    }

    /* ---------- shell + gaya minimalis (scoped .jp-app) ---------- */
    root.innerHTML = `
<style>
.jp-app{--jp-bg:#f6f7f9;--jp-panel:#fff;--jp-line:#e4e7ec;--jp-ink:#16181d;--jp-mut:#69707d;--jp-acc:#4f46e5;--jp-acc-soft:#eef2ff;--jp-s0:#4f46e5;--jp-s1:#d97706;color:var(--jp-ink);font:14px/1.45 ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif}
.jp-app *{box-sizing:border-box}
.jp-app :focus-visible{outline:2px solid var(--jp-acc);outline-offset:2px}
.jp-app .jp-hud{display:flex;align-items:center;flex-wrap:wrap;gap:5px;margin:0 0 10px;font:600 10px/1 ui-monospace,SFMono-Regular,Menlo,monospace}
.jp-app .jp-chip{display:flex;flex-direction:column;gap:2px;padding:4px 6px;background:var(--jp-panel);border:1px solid var(--jp-line);border-radius:8px;min-width:42px}
.jp-app .jp-chip small{font-size:8px;letter-spacing:.06em;text-transform:uppercase;color:var(--jp-mut)}
.jp-app .jp-chip b{font-size:11px;font-weight:600}
.jp-app .jp-chip.status{justify-content:center;min-width:62px}
.jp-app .jp-chip.s0 b{color:var(--jp-s0)}
.jp-app .jp-chip.s1 b{color:var(--jp-s1)}
.jp-app .jp-chip.turn{border-color:var(--jp-acc);background:var(--jp-acc-soft)}
.jp-app .jp-seg{display:flex;border:1px solid var(--jp-line);border-radius:9px;overflow:hidden;background:var(--jp-panel)}
.jp-app .jp-seg button{border:0;background:transparent;padding:4px 7px;font-size:10px;color:var(--jp-mut);cursor:pointer}
.jp-app .jp-seg button.on{background:var(--jp-acc);color:#fff}
.jp-app .jp-sp{flex:1 1 auto}
.jp-app .jp-icon-btn{display:inline-flex;align-items:center;gap:6px}
.jp-app .jp-icon-btn svg{flex:none;display:block}
.jp-app .jp-stage{position:relative;display:flex;flex-direction:column;background:var(--jp-bg);border:1px solid var(--jp-line);border-radius:14px;padding:12px;min-height:0}
.jp-app.game-fill > .jp-stage{flex:1 1 auto;min-height:0;aspect-ratio:auto}
.jp-app .jp-layout{display:flex;gap:14px;flex-wrap:wrap;align-items:center;justify-content:center;flex:1 1 auto;min-height:0}
.jp-app .jp-board-col{flex:0 1 min(430px,calc((100dvh - 230px) * 4 / 3));min-width:250px;height:100%;display:flex;flex-direction:column;justify-content:center}
.jp-app .jp-board{position:relative;width:100%;aspect-ratio:4/3;display:grid;background:#eceef2;border:1px solid var(--jp-line);border-radius:10px;overflow:hidden}
.jp-app .jp-ghost{position:absolute;inset:0;opacity:0;transition:opacity .2s;pointer-events:none}
.jp-app .jp-ghost.on{opacity:.2}
.jp-app .jp-ghost svg{width:100%;height:100%;display:block}
.jp-app .jp-cell{position:relative;border:0;padding:0;margin:0;background:transparent;cursor:pointer;min-width:0;min-height:0}
.jp-app .jp-cell::after{content:"";position:absolute;inset:0;border:1px dashed #cfd4dc;pointer-events:none}
.jp-app .jp-cell:hover:not(:disabled)::after{background:rgba(79,70,229,.06)}
.jp-app .jp-cell.cur::after{border:2px solid var(--jp-acc)}
.jp-app .jp-cell.locked{cursor:default}
.jp-app .jp-cell.locked::after{border:0}
.jp-app .jp-cell svg{position:absolute;inset:0;width:100%;height:100%;display:block;pointer-events:none}
.jp-app .jp-own{position:absolute;top:4px;right:4px;width:7px;height:7px;border-radius:50%;pointer-events:none}
.jp-app .jp-own.s0{background:var(--jp-s0)}
.jp-app .jp-own.s1{background:var(--jp-s1)}
.jp-app .jp-cell.pop svg{animation:jp-pop .3s ease}
.jp-app .jp-btn{display:inline-flex;align-items:center;justify-content:center;gap:4px;padding:5px 7px;border:1px solid var(--jp-line);border-radius:9px;background:var(--jp-panel);color:var(--jp-ink);font-size:10.5px;font-weight:550;cursor:pointer;transition:border-color .15s,background .15s;-webkit-tap-highlight-color:transparent}
.jp-app .jp-btn:hover:not(:disabled){border-color:var(--jp-acc)}
.jp-app .jp-btn:disabled{opacity:.45;cursor:default}
.jp-app .jp-btn.primary{background:var(--jp-acc);border-color:var(--jp-acc);color:#fff}
.jp-app .jp-btn.primary:hover:not(:disabled){background:#4338ca}
.jp-app .jp-btn.on{background:var(--jp-acc-soft);border-color:var(--jp-acc);color:var(--jp-acc)}
.jp-app .jp-btn svg{flex:none}
.jp-app .jp-kbd{font:10px/1 ui-monospace,SFMono-Regular,Menlo,monospace;border:1px solid var(--jp-line);border-bottom-width:2px;border-radius:4px;padding:2px 4px;color:var(--jp-mut);background:#fafafa}
.jp-app .jp-side{flex:1 1 230px;min-width:220px;max-width:360px;display:flex;flex-direction:column;gap:8px}
.jp-app .jp-tray-head{display:flex;justify-content:space-between;font-size:10.5px;letter-spacing:.08em;text-transform:uppercase;color:var(--jp-mut)}
.jp-app .jp-tray{display:flex;flex-wrap:wrap;gap:8px;align-content:flex-start;justify-content:center;padding:10px;background:var(--jp-panel);border:1px solid var(--jp-line);border-radius:12px;min-height:120px;max-height:340px;overflow-y:auto}
.jp-app .jp-tray.wait{opacity:.65}
.jp-app .jp-piece{position:relative;width:70px;height:70px;padding:6px;border:1px solid var(--jp-line);border-radius:10px;background:#fbfbfc;cursor:pointer;overflow:hidden;transition:border-color .15s,box-shadow .15s;-webkit-tap-highlight-color:transparent}
.jp-app .jp-piece:hover{border-color:#b9bfd0}
.jp-app .jp-piece.sel{border-color:var(--jp-acc);box-shadow:0 0 0 2px var(--jp-acc-soft),0 0 0 3.5px var(--jp-acc)}
.jp-app .jp-piece svg{width:100%;height:100%;display:block;transform:rotate(var(--rot,0deg));transition:transform .16s ease;pointer-events:none}
.jp-app .jp-piece.shake{animation:jp-shake .3s}
.jp-app .jp-empty{color:var(--jp-mut);font-size:12px;padding:16px;text-align:center;width:100%}
.jp-app .jp-overlay{position:absolute;inset:0;z-index:20;display:flex;align-items:center;justify-content:center;background:rgba(246,247,249,.92);backdrop-filter:blur(3px);border-radius:14px;padding:16px}
.jp-app .jp-overlay[hidden]{display:none}
.jp-app .jp-card{width:min(440px,100%);background:var(--jp-panel);border:1px solid var(--jp-line);border-radius:14px;padding:18px;text-align:center;display:flex;flex-direction:column;gap:10px;max-height:100%;overflow:hidden}
.jp-app .jp-head,.jp-app .jp-foot{flex:none;display:flex;align-items:center;justify-content:center;gap:8px;flex-wrap:wrap}
.jp-app .jp-head{justify-content:space-between}
.jp-app .jp-body{flex:1 1 auto;min-height:0;overflow:auto}
.jp-app .jp-card h3{margin:0;font-size:16px;font-weight:650}
.jp-app .jp-art{border:1px solid var(--jp-line);border-radius:10px;overflow:hidden}
.jp-app .jp-art svg{display:block;width:100%;height:auto}
.jp-app .jp-meta{display:flex;gap:6px;justify-content:center;flex-wrap:wrap;color:var(--jp-mut);font-size:12px}
.jp-app .jp-meta span{border:1px solid var(--jp-line);border-radius:999px;padding:3px 9px}
.jp-app .jp-seats{font-size:12.5px;color:var(--jp-mut);display:flex;flex-direction:column;gap:3px}
.jp-app .dot{display:inline-block;width:8px;height:8px;border-radius:50%;margin:0 5px;vertical-align:middle}
.jp-app .dot.s0{background:var(--jp-s0)}
.jp-app .dot.s1{background:var(--jp-s1)}
.jp-app .jp-row{display:flex;gap:8px;justify-content:center;flex-wrap:wrap}
.jp-app .jp-score{font-size:26px;font-weight:700;letter-spacing:.02em}
.jp-app .jp-cheats{z-index:30}
.jp-app .jp-cheat-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.jp-app .jp-help{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:14px;text-align:left}
.jp-app .jp-help b{display:block;margin-bottom:6px;font:700 10px/1 ui-monospace,monospace;letter-spacing:.1em;text-transform:uppercase;color:var(--jp-mut)}
.jp-app .jp-help ul{margin:0 0 12px;padding-left:16px;font-size:12px;line-height:1.7;color:var(--jp-mut)}
.jp-app .jp-note{font-size:11px;color:var(--jp-mut);margin:0}
.jp-app .jp-toast{position:absolute;left:50%;bottom:14px;transform:translateX(-50%);z-index:40;background:#16181d;color:#fff;font-size:12px;padding:7px 12px;border-radius:999px;opacity:0;transition:opacity .2s;pointer-events:none;white-space:nowrap}
.jp-app .jp-toast.show{opacity:.95}
@keyframes jp-pop{0%{transform:scale(.6)}60%{transform:scale(1.08)}100%{transform:scale(1)}}
@keyframes jp-shake{0%,100%{transform:translateX(0)}25%{transform:translateX(-5px)}50%{transform:translateX(5px)}75%{transform:translateX(-3px)}}
@media (max-width:720px){
.jp-app .jp-layout{flex-direction:column;align-items:stretch}
.jp-app .jp-side{max-width:none;width:100%}
.jp-app .jp-tray{max-height:220px}
.jp-app .jp-board-col{flex:0 0 auto;width:100%;min-width:0;height:auto}
.jp-app .jp-piece{width:62px;height:62px}
}
@media (pointer:coarse){
.jp-app .jp-kbd{display:none}
.jp-app .jp-btn{min-height:42px}
.jp-app .jp-piece{width:64px;height:64px}
}
/* ==== FRONTEND REDESIGN · design.md — minimalist game utility ==== */
.jp-app{min-width:0;max-width:100%;overflow-x:clip;-webkit-tap-highlight-color:transparent}
.jp-app *,.jp-app *::before,.jp-app *::after{box-sizing:border-box}
.jp-app :where(svg,canvas,img){max-width:100%;height:auto}
.jp-app :where(button,[role="button"],select,input){touch-action:manipulation}
.jp-app :where(button,[role="button"],select,input):focus-visible{outline:2px solid var(--jp-acc);outline-offset:2px}
.jp-app :where([class*="hud"],[class*="bar"],[class*="chips"],[class*="actions"],[class*="tools"],[class*="seg"],[class*="row"]){flex-wrap:wrap;min-width:0;gap:8px}
.jp-app :is([class*="card"],[class*="panel"],[class*="sheet"],[class*="boardwrap"],[class*="board-wrap"],[class*="wrap"]){border-radius:12px;box-shadow:none}
.jp-app :where(h2,h3,h4){line-height:1.25;letter-spacing:-.01em}
.jp-app :where([class*="chip"],[class*="label"],[class*="meta"],[class*="hint"],[class*="note"],[class*="sub"]){font-size:12px;line-height:1.45}
@media (max-width:768px){
  .jp-app :where([class*="stage"],[class*="boardwrap"],[class*="board-wrap"],[class*="sheet"]){padding:12px}
  .jp-app :where([class*="hud"],[class*="bar"],[class*="chips"],[class*="actions"],[class*="tools"],[class*="seg"],[class*="row"]){gap:8px}
}
@media (max-width:480px){.jp-app :where(kbd,[class*="kbd"]){display:none}}
@media (pointer:coarse){
  .jp-app :where(button:not([aria-checked]):not([class*="switch"]),[role="button"],select){min-height:44px;min-width:44px}
}
@media (prefers-reduced-motion:reduce){
  .jp-app *,.jp-app *::before,.jp-app *::after{animation-duration:.01ms!important;animation-iteration-count:1!important;transition-duration:.01ms!important}
}
/* ==== fill height + mobile refinements (LAST: beats pointer:coarse 44px) ==== */
@media (max-width:640px){
.jp-app.game-fill > .jp-stage:not(:has(.jp-overlay:not([hidden]))){aspect-ratio:auto;min-height:0}
.jp-app.game-fill > .jp-stage:has(.jp-overlay:not([hidden])){flex:0 0 auto;min-height:min(70dvh,620px);aspect-ratio:auto}
.jp-app .jp-hud{gap:5px;margin-bottom:8px}
.jp-app .jp-hud .jp-chip{padding:4px 6px;font-size:9px;min-width:0}
.jp-app .jp-hud .jp-chip[data-hud="grid"],.jp-app .jp-hud .jp-chip[data-hud="best"]{display:none}
.jp-app .jp-hud .jp-btn,.jp-app .jp-hud .jp-seg button{min-height:32px;min-width:0;padding:5px 9px;font-size:9px}
.jp-app .jp-hud .jp-btn-label,.jp-app .jp-hud .jp-sp{display:none}
.jp-app .jp-overlay{padding:8px}
.jp-app .jp-card{width:100%;height:100%;max-height:100%;padding:12px;border-radius:12px}
.jp-app .jp-body,.jp-app .jp-cheat-grid,.jp-app .jp-help{scrollbar-width:none}
.jp-app .jp-body::-webkit-scrollbar,.jp-app .jp-cheat-grid::-webkit-scrollbar,.jp-app .jp-help::-webkit-scrollbar{display:none}
.jp-app .jp-foot{position:static;margin:0;padding:10px 0 0;border-top:1px solid var(--jp-line)}
.jp-app .jp-note{display:none}
}
</style>
<div class="jp-app game-app game-fill" data-jp>
  <div class="jp-hud" data-hud>
    <span class="jp-chip status" data-status aria-live="polite"><span data-hudval="status">Ready</span></span>
    <span class="jp-chip"><small>Mode</small><b data-hudval="mode">Solo</b></span>
    <span class="jp-chip"><small>Level</small><b data-hudval="level">1</b></span>
    <span class="jp-chip" data-hud="grid"><small>Grid</small><b data-hudval="grid">3 x 3</b></span>
    <span class="jp-chip"><small>Placed</small><b data-hudval="placed">0/9</b></span>
    <span class="jp-chip"><small>Time</small><b data-hudval="time">0:00</b></span>
    <span class="jp-chip"><small>Score</small><b data-hudval="score">0 pts</b></span>
    <span class="jp-chip" data-hud="turn" hidden><small>Turn</small><b data-hudval="turn">You</b></span>
    <span class="jp-chip" data-hud="best"><small>Best</small><b data-hudval="best">Lv 0</b></span>
    <span class="jp-seg" data-seg>
      <button type="button" data-mode="solo">Solo</button>
      <button type="button" data-mode="bot">VS Bot</button>
    </span>
    <span class="jp-sp"></span>
    <button class="jp-btn jp-icon-btn" type="button" data-act="rotate" aria-label="Rotate piece" title="Rotate piece (X)">${icon("rotate")}<span class="jp-btn-label">Rotate</span></button>
    <button class="jp-btn jp-icon-btn" type="button" data-act="peek" aria-label="Peek at picture" title="Peek at picture (V)">${icon("eye")}<span class="jp-btn-label">Peek</span></button>
    <button class="jp-btn jp-icon-btn" type="button" data-act="deselect" aria-label="Clear selection" title="Clear selection (Esc)">${icon("x")}<span class="jp-btn-label">Clear</span></button>
    <button class="jp-btn jp-icon-btn" type="button" data-help aria-label="How to play" title="How to play (H)">${iconSVG("helpCircle", { size: 14 })}<span class="jp-btn-label">Help</span></button>
    <button class="jp-btn jp-icon-btn" type="button" data-cheats aria-label="Cheats" title="Cheats (C)">${iconSVG("wrench", { size: 14 })}<span class="jp-btn-label">Cheats</span></button>
    <button class="jp-btn jp-icon-btn" type="button" data-pause aria-label="Pause" title="Pause (P)">${iconSVG("pause", { size: 14 })}<span class="jp-btn-label">Pause</span></button>
    <button class="jp-btn jp-icon-btn" type="button" data-restart aria-label="Restart" title="Restart (R)">${iconSVG("refresh", { size: 14 })}<span class="jp-btn-label">Restart</span></button>
    <button class="jp-btn jp-icon-btn" type="button" data-exit aria-label="Exit game" title="Exit game">${iconSVG("logOut", { size: 14 })}<span class="jp-btn-label">Exit game</span></button>
  </div>
  <section class="game-panel jp-stage" data-board>
    <div class="jp-layout">
      <div class="jp-board-col"><div class="jp-board" data-grid></div></div>
      <div class="jp-side">
        <div class="jp-tray-head"><span>Pieces</span><span data-traycount></span></div>
        <div class="jp-tray" data-tray></div>
      </div>
    </div>
    <div class="jp-overlay" data-ov="ref" hidden><div class="jp-card" data-ref></div></div>
    <div class="jp-overlay" data-ov="done" hidden><div class="jp-card" data-done></div></div>
    <div class="jp-overlay jp-cheats" data-ov="cheats" hidden>
      <div class="jp-card">
        <div class="jp-head"><h3>Cheats</h3><button class="jp-btn" type="button" data-act="close-cheats" aria-label="Close cheats">Close</button></div>
        <div class="jp-body jp-cheat-grid">
          <button type="button" class="jp-btn" data-cheat="reveal"><span data-reveal-label>Reveal picture</span></button>
          <button type="button" class="jp-btn" data-cheat="straighten">Straighten all</button>
          <button type="button" class="jp-btn" data-cheat="placeOne">Place one</button>
          <button type="button" class="jp-btn" data-cheat="finish">Finish level</button>
          <button type="button" class="jp-btn" data-cheat="clearMisses">Clear misses</button>
          <button type="button" class="jp-btn" data-cheat="skip">Skip level</button>
        </div>
        <div class="jp-foot"><p class="jp-note" data-cheatnote></p></div>
      </div>
    </div>
    <div class="jp-overlay" data-ov="pause" hidden>
      <div class="jp-card">
        <div class="jp-head"><h3>Paused</h3></div>
        <div class="jp-body"><p>Timer and bot are frozen. Press P or Esc to resume.</p></div>
        <div class="jp-foot"><button class="jp-btn primary" type="button" data-resume>Resume</button></div>
      </div>
    </div>
    <div class="jp-overlay" data-ov="help" hidden>
      <div class="jp-card">
        <div class="jp-head"><h3>How to play</h3><button class="jp-btn" type="button" data-help-close aria-label="Close help">Close</button></div>
        <div class="jp-body jp-help">
          <div>
            <b>Desktop</b>
            <ul>
              <li>Pick a piece from the tray, then click a grid cell to place it.</li>
              <li><span class="jp-kbd">X</span> / right-click piece — rotate 90 degrees</li>
              <li><span class="jp-kbd">V</span> — peek at the full picture</li>
              <li>Arrows — move cursor · <span class="jp-kbd">Enter</span> — place · <span class="jp-kbd">Esc</span> — clear selection</li>
              <li><span class="jp-kbd">H</span> help · <span class="jp-kbd">C</span> cheats · <span class="jp-kbd">P</span> pause · <span class="jp-kbd">R</span> restart</li>
            </ul>
            <b>Mobile</b>
            <ul>
              <li>Tap a piece, then tap a cell. Tap the selected piece again to deselect.</li>
              <li>Use the Rotate and Peek buttons in the HUD.</li>
            </ul>
          </div>
          <div>
            <b>Rules</b>
            <ul>
              <li>A piece fits only in its home cell and only when its rotation is 0.</li>
              <li>Wrong cell or angle counts as a miss; a wrong placement toggles the turn in races.</li>
              <li>Solo: finish the picture. VS Bot / multiplayer: most correctly placed pieces wins.</li>
              <li>A reference picture appears at the start of every level.</li>
            </ul>
            <div class="jp-foot"><span class="jp-note">Press H to reopen this guide</span><button class="jp-btn primary" type="button" data-help-close>Got it</button></div>
          </div>
        </div>
      </div>
    </div>
    <div class="jp-toast" data-toast aria-live="polite"></div>
  </section>
</div>`;

    const $ = (s) => root.querySelector(s);
    const segEl = $("[data-seg]");
    const grid = $("[data-grid]");
    const trayEl = $("[data-tray]");
    const trayCount = $("[data-traycount]");
    const ov = {
        ref: $('[data-ov="ref"]'),
        done: $('[data-ov="done"]'),
        cheats: $('[data-ov="cheats"]'),
        pause: $('[data-ov="pause"]'),
        help: $('[data-ov="help"]'),
    };
    const refCard = $("[data-ref]");
    const doneCard = $("[data-done]");
    const toastEl = $("[data-toast]");
    const hud = {
        status: $('[data-hudval="status"]'),
        mode: $('[data-hudval="mode"]'),
        level: $('[data-hudval="level"]'),
        grid: $('[data-hudval="grid"]'),
        placed: $('[data-hudval="placed"]'),
        time: $('[data-hudval="time"]'),
        score: $('[data-hudval="score"]'),
        turn: $('[data-hudval="turn"]'),
        best: $('[data-hudval="best"]'),
        turnChip: $('[data-hud="turn"]'),
    };
    const rotateBtn = $('[data-act="rotate"]');
    const peekBtn = $('[data-act="peek"]');
    const deselectBtn = $('[data-act="deselect"]');
    const cheatsBtn = $("[data-cheats]");
    const pauseBtn = $("[data-pause]");
    const restartBtn = $("[data-restart]");
    const revealLabel = $("[data-reveal-label]");
    const cheatNote = $("[data-cheatnote]");

    /* ---------- util ---------- */
    const fmt = (s) => Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0");
    const byId = (id) => (state ? state.pieces.find((p) => p.id === id) : null);
    const placedAt = (c, r) =>
        state.pieces.find((p) => p.placed && p.homeCol === c && p.homeRow === r);
    const mySeat = () => (state ? state.seats[playerIndex] : 0);
    const oppName = () => (online ? (playerIndex === 0 ? "Guest" : "Host") : "Bot");
    const seatLabel = (seat) =>
        seat === mySeat() ? "You" : online ? (state.seats[0] === seat ? "Host" : "Guest") : "Bot";
    const elapsed = () =>
        state && state.phase === "playing"
            ? Math.max(0, Math.floor((Date.now() - state.startedAt) / 1000))
            : 0;

    function toast(msg) {
        toastEl.textContent = msg;
        toastEl.classList.add("show");
        clearTimeout(ui.toastTimer);
        ui.toastTimer = setTimeout(() => toastEl.classList.remove("show"), 1500);
    }

    /* SVG keping: string ART yang sama, dipotong lewat viewBox (tanpa defs/id).
       preserveAspectRatio meet + wadah kotak membuat rotasi 90 derajat tidak
       pernah meluber keluar tombol (perbaikan bug klik di level 2). */
    function pieceSvg(p) {
        const w = ART_W / state.cols, h = ART_H / state.rows;
        const x = p.homeCol * w, y = p.homeRow * h;
        return (
            '<svg viewBox="' + x + " " + y + " " + w + " " + h +
            '" preserveAspectRatio="xMidYMid meet" aria-hidden="true">' +
            ARTS[state.artIdx].svg +
            '<rect x="' + (x + 1) + '" y="' + (y + 1) + '" width="' + (w - 2) +
            '" height="' + (h - 2) + '" rx="2" fill="none" stroke="rgba(17,24,39,.28)" stroke-width="1.5"/>' +
            "</svg>"
        );
    }
    const fullArt = (idx) =>
        '<svg viewBox="0 0 480 360" aria-hidden="true">' + ARTS[idx].svg + "</svg>";

    /* ---------- render ---------- */
    function syncHud() {
        const set = (node, val) => { if (node) node.textContent = String(val); };
        if (!state) {
            set(hud.status, "Waiting for host");
            set(hud.mode, online ? "Multiplayer" : "Solo");
            set(hud.level, "—");
            set(hud.grid, "—");
            set(hud.placed, "—");
            set(hud.time, "0:00");
            set(hud.score, "—");
            set(hud.best, "Lv " + best);
            hud.turnChip.hidden = true;
            return;
        }
        const race = state.mode !== "solo";
        const ms = mySeat(), os = 1 - ms;
        const playing = state.phase === "playing";
        const total = state.pieces.length;
        const done = state.pieces.filter((p) => p.placed).length;
        set(hud.status,
            state.phase === "reference" ? "Ready" :
                state.phase === "complete" ? "Finished" :
                    race ? (state.turn === ms ? "Your turn" : state.mode === "bot" ? "Bot is thinking" : "Opponent's turn") :
                        "In progress");
        set(hud.mode, state.mode === "solo" ? "Solo" : state.mode === "bot" ? "VS Bot" : "Multiplayer");
        set(hud.level, state.level);
        set(hud.grid, state.cols + " x " + state.rows);
        set(hud.placed, done + "/" + total);
        set(hud.time, playing ? fmt(elapsed()) : state.phase === "complete" ? fmt(state.doneIn) : "0:00");
        set(hud.score, race
            ? "You " + state.scores[ms] + " / " + oppName() + " " + state.scores[os]
            : state.misses[ms] + " miss");
        set(hud.best, "Lv " + best);
        hud.turnChip.hidden = !(race && playing);
        if (race && playing) set(hud.turn, seatLabel(state.turn));
    }

    function syncPauseButton() {
        const label = pauseBtn.querySelector(".jp-btn-label");
        if (label) label.textContent = paused ? "Resume" : "Pause";
        pauseBtn.setAttribute("aria-label", paused ? "Resume" : "Pause");
        pauseBtn.setAttribute("title", paused ? "Resume (P)" : "Pause (P)");
        const ico = pauseBtn.querySelector("svg");
        if (ico) ico.outerHTML = iconSVG(paused ? "play" : "pause", { size: 14 });
    }

    /* Pause freezes the clock and the bot; the Date.now() anchor is shifted on
       resume so elapsed time does not jump forward. */
    function setPaused(on) {
        if (!state) return;
        on = typeof on === "boolean" ? on : !paused;
        if (paused === on) return;
        if (on) {
            paused = true;
            pauseAt = Date.now();
            if (botTimer) { clearTimeout(botTimer); botTimer = null; }
            clearTimeout(ui.toastTimer);
            toastEl.classList.remove("show");
        } else {
            const held = Math.max(0, Date.now() - pauseAt);
            if (state.phase === "playing" && typeof state.startedAt === "number")
                state.startedAt += held;
            paused = false;
            pauseAt = 0;
            if (online && room.isHost) room.publishState(state).catch(console.warn);
            scheduleBot();
        }
        render();
    }

    function toggleHelp(on) {
        helpOpen = typeof on === "boolean" ? on : !helpOpen;
        if (helpOpen) cheatOpen = false;
        render();
    }

    function toggleCheats(on) {
        if (!state || helpOpen || paused) return;
        cheatOpen = typeof on === "boolean" ? on : !cheatOpen;
        render();
    }

    function setControls() {
        const playing = !!state && state.phase === "playing";
        const race = !!state && state.mode !== "solo";
        const myTurn = !state || !race || state.turn === mySeat();
        const blocked = helpOpen || cheatOpen || paused;
        rotateBtn.disabled = !playing || !state.rotation || !ui.selectedId || !myTurn || blocked;
        deselectBtn.disabled = !ui.selectedId || blocked;
        restartBtn.disabled = !state;
        cheatsBtn.disabled = !state;
        pauseBtn.disabled = !state;
        peekBtn.disabled = blocked;
        peekBtn.classList.toggle("on", ui.peek);
        peekBtn.setAttribute("aria-pressed", String(ui.peek));
        revealLabel.textContent = ui.peek ? "Hide picture" : "Reveal picture";
        cheatNote.textContent = online ? "Cheats affect both players." : "";
        syncPauseButton();
    }

    function paintCursor() {
        grid.querySelectorAll(".jp-cell.cur").forEach((n) => n.classList.remove("cur"));
        if (!ui.selectedId || !state) return;
        const t = grid.querySelector('[data-cell="' + ui.cursor.c + "," + ui.cursor.r + '"]');
        if (t && !t.disabled) t.classList.add("cur");
    }

    function render() {
        if (destroyed) return;
        if (!state) {
            grid.innerHTML = "";
            trayEl.innerHTML = '<div class="jp-empty">Loading room...</div>';
            trayCount.textContent = "";
            ov.ref.hidden = true; ov.done.hidden = true; ov.cheats.hidden = true;
            ov.pause.hidden = true; ov.help.hidden = !helpOpen;
            segEl.style.display = "none";
            syncHud();
            setControls();
            return;
        }

        /* level baru -> reset UI lokal */
        if (state.gen !== ui.gen) {
            ui.gen = state.gen;
            ui.selectedId = null;
            ui.cursor = { c: 0, r: 0 };
            ui.prevPlaced = new Set();
        }
        const sel = byId(ui.selectedId);
        if (!sel || sel.placed) ui.selectedId = null;

        const race = state.mode !== "solo";
        const ms = mySeat(), os = 1 - ms;
        const opp = oppName();
        const playing = state.phase === "playing";
        const myTurn = !race || state.turn === ms;
        const total = state.pieces.length;
        const done = state.pieces.filter((p) => p.placed).length;

        /* keping yang baru terpasang -> animasi pop */
        const popIds = new Set();
        state.pieces.forEach((p) => {
            if (p.placed && !ui.prevPlaced.has(p.id)) { popIds.add(p.id); ui.prevPlaced.add(p.id); }
        });

        /* skor terbaik = level tertinggi yang selesai */
        if (state.phase === "complete" && state.level > best) {
            best = state.level;
            try { localStorage.setItem(META.bestKey, String(best)); } catch (err) { }
        }

        /* satu bar HUD: semuainfo + kontrol, papan tetap fokus pada puzzle */
        segEl.style.display = online ? "none" : "flex";
        segEl.querySelectorAll("button").forEach((b) =>
            b.classList.toggle("on", b.dataset.mode === state.mode));
        syncHud();

        /* papan */
        grid.style.gridTemplateColumns = "repeat(" + state.cols + ",1fr)";
        grid.style.gridTemplateRows = "repeat(" + state.rows + ",1fr)";
        let html = '<div class="jp-ghost' + (ui.peek ? " on" : "") + '">' + fullArt(state.artIdx) + "</div>";
        for (let r = 0; r < state.rows; r++) {
            for (let c = 0; c < state.cols; c++) {
                const p = placedAt(c, r);
                const cur = !!ui.selectedId && !p && ui.cursor.c === c && ui.cursor.r === r;
                const pop = p && popIds.has(p.id);
                html +=
                    '<button type="button" class="jp-cell' + (p ? " locked" : "") + (cur ? " cur" : "") + (pop ? " pop" : "") +
                    '" data-cell="' + c + "," + r + '"' + (p ? " disabled" : "") +
                    ' aria-label="Cell ' + (c + 1) + "," + (r + 1) + '">' +
                    (p ? pieceSvg(p) + '<span class="jp-own s' + p.by + '"></span>' : "") +
                    "</button>";
            }
        }
        grid.innerHTML = html;

        /* tray (fokus keyboard dipertahankan setelah rebuild) */
        const active = document.activeElement;
        const hadTrayFocus = !!(active && active.getAttribute && root.contains(active) && active.getAttribute("data-piece"));
        const focusId = hadTrayFocus ? active.getAttribute("data-piece") : null;
        const rest = state.order.map(byId).filter((p) => p && !p.placed);
        trayCount.textContent = rest.length + " left";
        trayEl.classList.toggle("wait", race && playing && !myTurn);
        trayEl.innerHTML = rest.length
            ? rest.map((p) =>
                '<button type="button" class="jp-piece' + (p.id === ui.selectedId ? " sel" : "") +
                '" data-piece="' + p.id + '" style="--rot:' + p.rot + 'deg" aria-pressed="' +
                (p.id === ui.selectedId) + '" aria-label="Piece ' + p.id.slice(1) + '">' + pieceSvg(p) + "</button>"
            ).join("")
            : '<div class="jp-empty">' + (done === total && total > 0 ? "All pieces placed" : "No pieces") + "</div>";
        if (hadTrayFocus) {
            const t = trayEl.querySelector('[data-piece="' + focusId + '"]') || trayEl.querySelector("[data-piece]");
            if (t && t.focus) t.focus();
        }

        setControls();

        /* popup referensi gambar final di awal SETIAP level (tanpa tutorial) */
        ov.ref.hidden = state.phase !== "reference" || cheatOpen || helpOpen || paused;
        if (!ov.ref.hidden) {
            const oppSeat = 1 - ms;
            refCard.innerHTML =
                '<div class="jp-head"><h3>Level ' + state.level + "</h3></div>" +
                '<div class="jp-body">' +
                '<div class="jp-art">' + fullArt(state.artIdx) + "</div>" +
                '<div class="jp-meta"><span>' + state.cols + " x " + state.rows + "</span><span>" +
                (state.rotation ? "Rotation on" : "No rotation") + "</span><span>" + ARTS[state.artIdx].name + "</span></div>" +
                (race
                    ? '<div class="jp-seats">' +
                    '<span><i class="dot s' + ms + '"></i>You (' + playerName + ") are Player " + (ms + 1) + "</span>" +
                    '<span><i class="dot s' + oppSeat + '"></i>' + opp + " is Player " + (oppSeat + 1) + "</span>" +
                    "<span>First move: " + seatLabel(state.first) + "</span></div>"
                    : "") +
                "</div>" +
                '<div class="jp-foot"><div class="jp-row"><button type="button" class="jp-btn primary" data-act="start">' + icon("play") +
                'Start</button><button type="button" class="jp-btn" data-act="reroll">' + icon("shuffle") + "New picture</button></div></div>";
        }

        /* popup hasil level */
        ov.done.hidden = state.phase !== "complete" || cheatOpen || helpOpen || paused;
        if (!ov.done.hidden) {
            const title = !race ? "Picture complete" :
                state.winner === "draw" ? "Draw" :
                    state.winner === ms ? "You win" : opp + " wins";
            doneCard.innerHTML =
                '<div class="jp-head"><h3>' + title + "</h3></div>" +
                '<div class="jp-body">' +
                (race
                    ? '<div class="jp-score"><i class="dot s' + ms + '"></i>' + state.scores[ms] + " : " + state.scores[os] +
                    '<i class="dot s' + os + '"></i></div><div class="jp-meta"><span>You</span><span>' + opp + "</span><span>Time " + fmt(state.doneIn) + "</span></div>"
                    : '<div class="jp-meta"><span>Time ' + fmt(state.doneIn) + "</span><span>" + state.misses[ms] + " misses</span></div>") +
                '<div class="jp-art">' + fullArt(state.artIdx) + "</div>" +
                "</div>" +
                '<div class="jp-foot"><div class="jp-row"><button type="button" class="jp-btn primary" data-act="next">Next level</button>' +
                '<button type="button" class="jp-btn" data-act="replay">Replay</button></div></div>';
        }

        /* satu modal aktif: help > cheats > pause > hasil/referensi */
        ov.cheats.hidden = !cheatOpen || helpOpen;
        ov.pause.hidden = !paused || helpOpen || cheatOpen;
        ov.help.hidden = !helpOpen;

        /* umpan balik event terakhir (miss / cheat) untuk kedua sisi */
        const ev = state.lastEvent;
        if (ev && ev.seq > ui.lastEventSeq) {
            ui.lastEventSeq = ev.seq;
            if (ev.t === "miss") {
                if (ev.seat === ms) {
                    toast("Miss - wrong cell or angle");
                    const tile = trayEl.querySelector('[data-piece="' + ev.id + '"]');
                    if (tile) {
                        tile.classList.add("shake");
                        clearTimeout(ui.shakeTimer);
                        ui.shakeTimer = setTimeout(() => tile.classList.remove("shake"), 350);
                    }
                } else {
                    toast(opp + " missed");
                }
            } else if (ev.t === "cheat") {
                toast("Cheat: " + (CHEAT_LABEL[ev.kind] || ev.kind));
            }
        }
    }

    /* ---------- mesin state (serializable; host = sumber kebenaran) ---------- */
    function createMatch(m) {
        return { mode: m, wins: [0, 0], evSeq: 0, ...generateLevel(1, -1, 1) };
    }
    function regen(level) {
        Object.assign(state, generateLevel(level, state.artIdx, state.gen + 1));
    }
    function pushEvent(e) {
        state.evSeq = (state.evSeq || 0) + 1;
        e.seq = state.evSeq;
        e.at = Date.now();
        state.lastEvent = e;
    }
    function attemptPlace(p, c, r, seat) {
        if (isAccepted(p, c, r)) {
            p.placed = true; p.by = seat; state.scores[seat]++;
            pushEvent({ t: "place", seat, id: p.id });
        } else {
            state.misses[seat]++;
            pushEvent({ t: "miss", seat, id: p.id });
        }
        if (state.mode !== "solo") state.turn = 1 - state.turn;
        if (state.pieces.every((q) => q.placed)) finishLevel();
    }
    function finishLevel() {
        state.phase = "complete";
        state.doneIn = Math.max(0, Math.floor((Date.now() - state.startedAt) / 1000));
        if (state.mode !== "solo") {
            state.winner =
                state.scores[0] === state.scores[1] ? "draw" :
                    state.scores[0] > state.scores[1] ? 0 : 1;
            if (state.winner !== "draw") state.wins[state.winner]++;
        } else {
            state.winner = null;
        }
    }
    function botMove(seat) {
        const rest = state.pieces.filter((p) => !p.placed);
        if (!rest.length) return;
        const p = rest[randInt(rest.length)];
        if (Math.random() < BOT_ACCURACY) {
            p.rot = 0;
            attemptPlace(p, p.homeCol, p.homeRow, seat);
            return;
        }
        const wrong = [];
        for (let r = 0; r < state.rows; r++)
            for (let c = 0; c < state.cols; c++)
                if (!placedAt(c, r) && !(c === p.homeCol && r === p.homeRow)) wrong.push({ c, r });
        if (!wrong.length) {
            p.rot = 0;
            attemptPlace(p, p.homeCol, p.homeRow, seat);
            return;
        }
        const t = wrong[randInt(wrong.length)];
        attemptPlace(p, t.c, t.r, seat);
    }
    function scheduleBot() {
        const want = !online && !paused && !!state && state.mode === "bot" &&
            state.phase === "playing" && state.turn === state.seats[1];
        if (!want) {
            if (botTimer) { clearTimeout(botTimer); botTimer = null; }
            return;
        }
        if (botTimer) return;
        botTimer = setTimeout(() => {
            botTimer = null;
            if (!destroyed) applyAction({ type: "botMove" }, 1);
        }, 900 + randInt(900));
    }
    function publish() {
        render();
        if (online && room.isHost) room.publishState(state).catch(console.warn);
        scheduleBot();
    }
    function submitAction(action) {
        if (online && !room.isHost) {
            room.sendAction(action).catch(console.warn);
            return;
        }
        applyAction(action, playerIndex);
    }
    function applyAction(action, actor) {
        if (destroyed || !state || !action) return;
        if ((paused || helpOpen) && actor === playerIndex) return;
        if (actor !== 0 && actor !== 1) return;
        const seat = state.seats[actor];
        const race = state.mode !== "solo";
        const myTurn = !race || state.turn === seat;
        const playing = state.phase === "playing";
        switch (action.type) {
            case "mode":
                if (online) return;
                if (action.mode !== "solo" && action.mode !== "bot") return;
                if (action.mode === state.mode) return;
                state = createMatch(action.mode);
                break;
            case "start":
                if (state.phase !== "reference") return;
                state.phase = "playing";
                state.startedAt = Date.now();
                state.turn = state.first;
                break;
            case "reroll":
                if (state.phase !== "reference") return;
                regen(state.level);
                break;
            case "restart":
                regen(state.level);
                break;
            case "next":
                if (state.phase !== "complete") return;
                regen(state.level + 1);
                break;
            case "rotate": {
                if (!playing || !myTurn || !state.rotation) return;
                const p = byId(action.id);
                if (!p || p.placed) return;
                p.rot = normRot(p.rot + 90);
                break;
            }
            case "place": {
                if (!playing || !myTurn) return;
                const p = byId(action.id);
                if (!p || p.placed) return;
                const c = Number(action.col), r = Number(action.row);
                if (!Number.isInteger(c) || !Number.isInteger(r) ||
                    c < 0 || r < 0 || c >= state.cols || r >= state.rows) return;
                if (placedAt(c, r)) return;
                attemptPlace(p, c, r, seat);
                break;
            }
            case "botMove":
                if (state.mode !== "bot" || actor !== 1 || !playing ||
                    state.turn !== state.seats[1]) return;
                botMove(seat);
                break;
            case "cheat": {
                const k = action.kind;
                if (k === "straighten") {
                    if (!playing) return;
                    state.pieces.forEach((p) => { if (!p.placed) p.rot = 0; });
                } else if (k === "placeOne") {
                    if (!playing) return;
                    const rest = state.pieces.filter((p) => !p.placed);
                    if (!rest.length) return;
                    const p = rest[randInt(rest.length)];
                    p.rot = 0;
                    attemptPlace(p, p.homeCol, p.homeRow, seat);
                } else if (k === "finish") {
                    if (!playing) return;
                    state.pieces.forEach((p) => {
                        if (!p.placed) { p.rot = 0; p.placed = true; p.by = seat; state.scores[seat]++; }
                    });
                    finishLevel();
                } else if (k === "clearMisses") {
                    state.misses[seat] = 0;
                } else if (k === "skip") {
                    if (state.phase === "reference") return;
                    regen(state.level + 1);
                } else {
                    return;
                }
                pushEvent({ t: "cheat", seat, kind: k });
                break;
            }
            default:
                return;
        }
        publish();
    }

    /* ---------- interaksi: mouse / touch (delegasi event) ---------- */
    function tryRotate(id) {
        if (!state || state.phase !== "playing") return;
        if (!state.rotation) { toast("Rotation is off this level"); return; }
        if (state.mode !== "solo" && state.turn !== mySeat()) { toast("Wait for your turn"); return; }
        submitAction({ type: "rotate", id });
    }
    function rotateSelected() {
        if (!ui.selectedId) { toast("Select a piece first"); return; }
        tryRotate(ui.selectedId);
    }
    function handleClick(event) {
        const el = event.target.closest(
            "[data-exit],[data-help],[data-help-close],[data-cheats],[data-pause],[data-resume],[data-act],[data-piece],[data-cell],[data-cheat],[data-mode]");
        if (!el || !root.contains(el)) return;
        if (el.hasAttribute("data-exit")) { onExit(); return; }
        if (el.disabled) return;
        if (el.closest("[data-help]")) { toggleHelp(); return; }
        if (el.closest("[data-help-close]")) { toggleHelp(false); return; }
        if (el.closest("[data-cheats]")) { toggleCheats(); return; }
        if (el.closest('[data-act="close-cheats"]')) { toggleCheats(false); return; }
        if (el.closest("[data-pause]")) { if (!helpOpen) setPaused(); return; }
        if (el.closest("[data-resume]")) { setPaused(false); return; }
        if (helpOpen || cheatOpen || paused) return;
        if (el.dataset.mode) { submitAction({ type: "mode", mode: el.dataset.mode }); return; }
        const act = el.dataset.act;
        if (act) {
            if (act === "start") submitAction({ type: "start" });
            else if (act === "reroll") submitAction({ type: "reroll" });
            else if (act === "next") submitAction({ type: "next" });
            else if (act === "replay" || act === "restart") submitAction({ type: "restart" });
            else if (act === "rotate") rotateSelected();
            else if (act === "peek") { ui.peek = !ui.peek; render(); }
            else if (act === "deselect") { ui.selectedId = null; render(); }
            return;
        }
        if (el.dataset.cheat) {
            const kind = el.dataset.cheat;
            if (kind === "reveal") { ui.peek = !ui.peek; render(); }
            else submitAction({ type: "cheat", kind });
            return;
        }
        if (el.dataset.piece) {
            const id = el.dataset.piece;
            ui.selectedId = ui.selectedId === id ? null : id;
            render();
            return;
        }
        if (el.dataset.cell) {
            if (!state || !ui.selectedId) return;
            const parts = el.dataset.cell.split(",");
            const c = Number(parts[0]), r = Number(parts[1]);
            ui.cursor = { c, r };
            if (state.phase !== "playing") return;
            if (state.mode !== "solo" && state.turn !== mySeat()) { toast("Wait for your turn"); return; }
            submitAction({ type: "place", id: ui.selectedId, col: c, row: r });
        }
    }
    /* klik kanan pada keping = putar (desktop) */
    function handleContext(event) {
        const b = event.target.closest("[data-piece]");
        if (!b || helpOpen || cheatOpen || paused) return;
        event.preventDefault();
        ui.selectedId = b.dataset.piece;
        render();
        tryRotate(ui.selectedId);
    }
    /* hover sel = arahkan kursor keyboard */
    function handleHover(event) {
        const cell = event.target.closest("[data-cell]");
        if (!cell || cell.disabled || !state) return;
        const parts = cell.dataset.cell.split(",");
        ui.cursor = { c: Number(parts[0]), r: Number(parts[1]) };
        paintCursor();
    }

    /* ---------- keyboard (desktop) ---------- */
    function moveCursor(k) {
        const d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[k];
        ui.cursor.c = Math.min(state.cols - 1, Math.max(0, ui.cursor.c + d[0]));
        ui.cursor.r = Math.min(state.rows - 1, Math.max(0, ui.cursor.r + d[1]));
        paintCursor();
    }
    function trayMove(dir) {
        const list = Array.from(trayEl.querySelectorAll("[data-piece]"));
        if (!list.length) return;
        let i = list.indexOf(document.activeElement);
        i = i < 0 ? 0 : (i + dir + list.length) % list.length;
        list[i].focus();
    }
    function selectFocused() {
        const a = document.activeElement;
        const id = a && a.getAttribute ? a.getAttribute("data-piece") : null;
        if (id) { ui.selectedId = ui.selectedId === id ? null : id; render(); }
        else { const first = trayEl.querySelector("[data-piece]"); if (first) first.focus(); }
    }
    function placeAtCursor() {
        if (!ui.selectedId) return;
        if (state.mode !== "solo" && state.turn !== mySeat()) { toast("Wait for your turn"); return; }
        submitAction({ type: "place", id: ui.selectedId, col: ui.cursor.c, row: ui.cursor.r });
    }
    function handleKey(e) {
        if (destroyed || !state) return;
        const t = e.target;
        if (t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName || "")) return;
        if (e.ctrlKey || e.metaKey || e.altKey) return;
        const k = e.key;
        const hit = (code, lower) => e.code === code || k === lower || k === lower.toUpperCase();
        const isPieceBtn = !!(t && t.getAttribute && t.getAttribute("data-piece"));
        /* biarkan Enter/Space mengaktifkan tombol non-keping secara native */
        if ((k === "Enter" || k === " ") && t && t.tagName === "BUTTON" &&
            root.contains(t) && !isPieceBtn) return;

        /* Prioritas: help -> cheats -> pause/Escape -> aksi game. */
        if (hit("KeyH", "h")) { e.preventDefault(); toggleHelp(); return; }
        if (hit("KeyC", "c")) { e.preventDefault(); if (!helpOpen) toggleCheats(); return; }
        if (hit("KeyP", "p")) { e.preventDefault(); if (!helpOpen) setPaused(); return; }
        if (k === "Escape") {
            e.preventDefault();
            if (helpOpen) toggleHelp(false);
            else if (cheatOpen) toggleCheats(false);
            else if (paused) setPaused(false);
            else if (ui.selectedId) { ui.selectedId = null; render(); }
            return;
        }
        if (helpOpen || cheatOpen || paused) return;
        if (hit("KeyR", "r")) { e.preventDefault(); submitAction({ type: "restart" }); return; }

        if (state.phase === "reference") {
            if (k === "Enter" || k === " " || hit("KeyS", "s")) { e.preventDefault(); submitAction({ type: "start" }); }
            else if (hit("KeyN", "n")) { e.preventDefault(); submitAction({ type: "reroll" }); }
            return;
        }
        if (state.phase === "complete") {
            if (k === "Enter" || k === " " || hit("KeyN", "n")) { e.preventDefault(); submitAction({ type: "next" }); }
            return;
        }
        if (k === "ArrowLeft" || k === "ArrowRight" || k === "ArrowUp" || k === "ArrowDown") {
            e.preventDefault();
            if (ui.selectedId) moveCursor(k);
            else trayMove(k === "ArrowLeft" || k === "ArrowUp" ? -1 : 1);
        } else if (k === "Enter" || k === " ") {
            e.preventDefault();
            if (ui.selectedId) placeAtCursor(); else selectFocused();
        } else if (hit("KeyX", "x")) { e.preventDefault(); rotateSelected(); }
        else if (hit("KeyV", "v")) { e.preventDefault(); ui.peek = !ui.peek; render(); }
    }

    /* ---------- init ---------- */
    root.addEventListener("click", handleClick);
    root.addEventListener("contextmenu", handleContext);
    root.addEventListener("pointerover", handleHover);
    document.addEventListener("keydown", handleKey);
    tickTimer = setInterval(() => {
        if (destroyed || !state || paused || helpOpen || cheatOpen) return;
        if (state.phase === "playing") hud.time.textContent = fmt(elapsed());
    }, 500);

    if (online) {
        const offRoom = room.onRoom((nextRoom) => { roomData = nextRoom; if (!destroyed) render(); });
        if (typeof offRoom === "function") offs.push(offRoom);
        if (room.isHost) {
            state = createMatch("versus");
            publish();
            const offAct = room.onAction((action) => applyAction(action, 1));
            if (typeof offAct === "function") offs.push(offAct);
        } else {
            const offState = room.onState((nextState) => {
                if (destroyed) return;
                state = nextState;
                render();
            });
            if (typeof offState === "function") offs.push(offState);
            render();
        }
    } else {
        state = createMatch("solo");
        render();
    }

    return {
        destroy() {
            destroyed = true;
            root.removeEventListener("click", handleClick);
            root.removeEventListener("contextmenu", handleContext);
            root.removeEventListener("pointerover", handleHover);
            document.removeEventListener("keydown", handleKey);
            clearInterval(tickTimer);
            clearTimeout(botTimer);
            clearTimeout(ui.toastTimer);
            clearTimeout(ui.shakeTimer);
            offs.forEach((f) => { try { f(); } catch (err) { } });
        },
    };
}