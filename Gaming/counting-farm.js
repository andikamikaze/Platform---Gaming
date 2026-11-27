/* ==== GAME: counting-farm.js ==== */
/* Counting Farm — duel berhitung hewan (solo vs Bot / online 2 pemain).
   10 ronde bergilir: hitung hewan di padang, pilih angka yang benar.
   Jawaban benar = 1 bintang. Bintang terbanyak menang.
   Setelah mengubah file ini, jalankan: node tools/build-games-manifest.mjs */
import { iconSVG } from "../JS/icons.js";

export const META = {
    id: "counting-farm", // harus sama dengan nama file (tanpa .js)
    name: "Counting Farm",
    category: "kids",
    catLabel: "Kids",
    desc: "Hitung hewan di padang dan pilih angka yang tepat. Kalahkan Bot atau temanmu!",
    art: '<svg viewBox="0 0 48 48" width="54" height="54" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 13 L13 6"/><path d="M30 13 L35 6"/><ellipse cx="8" cy="18" rx="4.5" ry="2.5" transform="rotate(-20 8 18)"/><ellipse cx="40" cy="18" rx="4.5" ry="2.5" transform="rotate(20 40 18)"/><ellipse cx="24" cy="24" rx="13" ry="11.5"/><circle cx="24" cy="14" r="2.5"/><ellipse cx="24" cy="34" rx="8" ry="5.5"/><circle cx="20.5" cy="34" r="1.3" fill="currentColor" stroke="none"/><circle cx="27.5" cy="34" r="1.3" fill="currentColor" stroke="none"/><circle cx="19.5" cy="21" r="1.5" fill="currentColor" stroke="none"/><circle cx="28.5" cy="21" r="1.5" fill="currentColor" stroke="none"/></svg>',
    bg: ["#bbf7d0", "#86efac"],
};

/* ================================================================ */
/* PURE CORE — deterministik (host & guest menghasilkan ronde sama) */
/* ================================================================ */
const ROUNDS = 10;
const KINDS = ["cow", "pig", "sheep", "duck", "chicken", "horse", "goat", "rabbit"];
const KIND_LABEL = {
    cow: "sapi", pig: "babi", sheep: "domba", duck: "bebek",
    chicken: "ayam", horse: "kuda", goat: "kambing", rabbit: "kelinci",
};
const PRAISE = ["Hebat!", "Tepat sekali!", "Keren!", "Benar!", "Mantap!"];

function mulberry32(a) {
    let s = a >>> 0;
    return function () {
        s = (s + 0x6d2b79f5) >>> 0;
        let t = s;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/* Satu ronde: 3–9 hewan, 2–4 jenis. ~55% pertanyaan menghitung jenis
   tertentu ("berapa banyak sapi?"), sisanya menghitung semua hewan. */
function buildRound(r, seed) {
    const rng = mulberry32(((r + 1) * 2654435761 + (seed + 1) * 40503 + 0x1f123bb5) >>> 0);
    const total = 3 + Math.floor(rng() * 7);
    const kindCount = Math.min(total, 2 + Math.floor(rng() * 3));
    const bag = KINDS.slice();
    const kinds = [];
    for (let i = 0; i < kindCount; i++) kinds.push(bag.splice(Math.floor(rng() * bag.length), 1)[0]);
    const counts = kinds.map(() => 1);
    for (let i = kindCount; i < total; i++) counts[Math.floor(rng() * kindCount)]++;
    const animals = [];
    kinds.forEach((k, i) => { for (let c = 0; c < counts[i]; c++) animals.push(k); });

    let target = null;
    const eligible = kinds.filter((k, i) => counts[i] <= 6);
    if (rng() < 0.55 && eligible.length) target = eligible[Math.floor(rng() * eligible.length)];
    const correct = target ? counts[kinds.indexOf(target)] : total;

    const pool = [];
    for (let d = 1; d <= 9; d++) if (d !== correct && Math.abs(d - correct) <= 2) pool.push(d);
    const dis = [];
    while (dis.length < 2) dis.push(pool.splice(Math.floor(rng() * pool.length), 1)[0]);
    const options = [correct, dis[0], dis[1]];
    for (let i = options.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [options[i], options[j]] = [options[j], options[i]];
    }
    for (let i = animals.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [animals[i], animals[j]] = [animals[j], animals[i]];
    }

    /* Penempatan dari seed (bukan Math.random) → identik di semua klien */
    const scale = total <= 3 ? 1.22 : total <= 6 ? 1.1 : 1.0;
    const jx = total <= 3 ? 12 : total <= 6 ? 14 : 16;
    const jy = total <= 3 ? 8 : total <= 6 ? 10 : 12;
    const cells = [];
    [112, 250, 388, 526].forEach((x) => [100, 212, 324].forEach((y) => cells.push({ x, y })));
    for (let i = cells.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [cells[i], cells[j]] = [cells[j], cells[i]];
    }
    const placed = animals.map((kind, i) => ({
        kind,
        x: cells[i].x + (rng() * 2 - 1) * jx,
        y: cells[i].y + (rng() * 2 - 1) * jy,
        flip: rng() < 0.5 ? -1 : 1,
        delay: i * 70,
        bob: -Math.floor(rng() * 2800),
    }));
    return { total, target, correct, options, animals: placed, scale };
}

/* Jaminan ronde selalu bisa diselesaikan: jawaban benar ada tepat sekali
   di opsi, opsi unik, hewan target pasti ada, tidak ada tumpang tindih. */
function validRound(rd) {
    const o = rd.options;
    if (o.length !== 3 || new Set(o).size !== 3) return false;
    if (o.filter((v) => v === rd.correct).length !== 1) return false;
    if (rd.correct < 1 || rd.correct > 9) return false;
    if (rd.animals.length !== rd.total || rd.total > 12) return false;
    if (rd.target && rd.animals.filter((a) => a.kind === rd.target).length !== rd.correct) return false;
    if (!rd.target && rd.total !== rd.correct) return false;
    return rd.animals.every((a) => a.x >= 60 && a.x <= 580 && a.y >= 60 && a.y <= 360);
}

function makeRound(r, seed) {
    for (let g = 0; g < 8; g++) {
        const rd = buildRound(r, (seed + g * 0x9e3779b9) >>> 0);
        if (validRound(rd)) return rd;
    }
    /* Fallback deterministik — mustahil gagal */
    return {
        total: 3, target: null, correct: 3, options: [2, 3, 4], scale: 1.22,
        animals: [
            { kind: "cow", x: 112, y: 212, flip: 1, delay: 0, bob: 0 },
            { kind: "sheep", x: 250, y: 212, flip: -1, delay: 70, bob: -900 },
            { kind: "duck", x: 388, y: 212, flip: 1, delay: 140, bob: -1800 },
        ],
    };
}

/* ================================================================ */
/* ART — hewan flat minimalis (pusat di 0,0)                        */
/* ================================================================ */
const SHADOW = '<ellipse cx="0" cy="31" rx="30" ry="6" fill="#1f2937" opacity=".12"/>';

const ART = {
    cow: () => `${SHADOW}
    <rect x="-21" y="16" width="8" height="16" rx="3.5" fill="#e2e8f0" stroke="#64748b" stroke-width="2"/>
    <rect x="-7" y="16" width="8" height="16" rx="3.5" fill="#e2e8f0" stroke="#64748b" stroke-width="2"/>
    <rect x="7" y="16" width="8" height="16" rx="3.5" fill="#e2e8f0" stroke="#64748b" stroke-width="2"/>
    <path d="M-27 0 q-9 5 -7 17" fill="none" stroke="#94a3b8" stroke-width="2.5" stroke-linecap="round"/>
    <ellipse cx="-2" cy="4" rx="27" ry="18" fill="#f8fafc" stroke="#64748b" stroke-width="2.5"/>
    <ellipse cx="-11" cy="-2" rx="9" ry="6.5" fill="#334155"/>
    <ellipse cx="8" cy="11" rx="7" ry="5" fill="#334155"/>
    <circle cx="27" cy="-10" r="12.5" fill="#f8fafc" stroke="#64748b" stroke-width="2.5"/>
    <path d="M19 -20 q-3 -7 -10 -6" fill="none" stroke="#d97706" stroke-width="3.5" stroke-linecap="round"/>
    <path d="M33 -21 q3 -7 10 -5" fill="none" stroke="#d97706" stroke-width="3.5" stroke-linecap="round"/>
    <ellipse cx="15" cy="-16" rx="6" ry="3.2" fill="#e2e8f0" stroke="#64748b" stroke-width="2" transform="rotate(-30 15 -16)"/>
    <ellipse cx="33" cy="-3" rx="8" ry="6" fill="#f9a8d4" stroke="#db2777" stroke-width="2"/>
    <circle cx="30" cy="-3.5" r="1.4" fill="#9d174d"/><circle cx="36" cy="-3.5" r="1.4" fill="#9d174d"/>
    <circle cx="23" cy="-13" r="1.8" fill="#1e293b"/><circle cx="32.5" cy="-14" r="1.8" fill="#1e293b"/>`,

    pig: () => `${SHADOW}
    <rect x="-20" y="16" width="8" height="15" rx="3.5" fill="#f9a8d4" stroke="#be185d" stroke-width="2"/>
    <rect x="-6" y="16" width="8" height="15" rx="3.5" fill="#f9a8d4" stroke="#be185d" stroke-width="2"/>
    <rect x="8" y="16" width="8" height="15" rx="3.5" fill="#f9a8d4" stroke="#be185d" stroke-width="2"/>
    <path d="M-26 -2 q-10 -3 -8 5 q2 7 -6 5" fill="none" stroke="#ec4899" stroke-width="3" stroke-linecap="round"/>
    <ellipse cx="-2" cy="4" rx="26" ry="17" fill="#f9a8d4" stroke="#be185d" stroke-width="2.5"/>
    <circle cx="25" cy="-8" r="12" fill="#f9a8d4" stroke="#be185d" stroke-width="2.5"/>
    <path d="M16 -17 l-4 -8 l9 3 z" fill="#ec4899" stroke="#be185d" stroke-width="2" stroke-linejoin="round"/>
    <path d="M30 -18 l6 -8 l2 9 z" fill="#ec4899" stroke="#be185d" stroke-width="2" stroke-linejoin="round"/>
    <ellipse cx="29" cy="-2" rx="7" ry="5.5" fill="#f472b6" stroke="#be185d" stroke-width="2"/>
    <circle cx="26.5" cy="-2" r="1.3" fill="#831843"/><circle cx="32" cy="-2" r="1.3" fill="#831843"/>
    <circle cx="21" cy="-11" r="1.8" fill="#831843"/><circle cx="30" cy="-12" r="1.8" fill="#831843"/>`,

    sheep: () => `${SHADOW}
    <rect x="-19" y="16" width="8" height="15" rx="3.5" fill="#78716c" stroke="#44403c" stroke-width="2"/>
    <rect x="-5" y="16" width="8" height="15" rx="3.5" fill="#78716c" stroke="#44403c" stroke-width="2"/>
    <rect x="9" y="16" width="8" height="15" rx="3.5" fill="#78716c" stroke="#44403c" stroke-width="2"/>
    <g fill="#fef3c7" stroke="#d97706" stroke-width="2.5">
      <circle cx="-16" cy="-4" r="10"/><circle cx="0" cy="-9" r="11"/><circle cx="14" cy="-3" r="10"/>
      <circle cx="-8" cy="6" r="10"/><circle cx="7" cy="7" r="10"/>
    </g>
    <ellipse cx="17.5" cy="-14" rx="5.5" ry="3" fill="#78716c" stroke="#44403c" stroke-width="2" transform="rotate(-30 17.5 -14)"/>
    <circle cx="26" cy="-10" r="10" fill="#78716c" stroke="#44403c" stroke-width="2.5"/>
    <circle cx="24" cy="-12" r="1.7" fill="#f8fafc"/><circle cx="30" cy="-12.5" r="1.7" fill="#f8fafc"/>
    <path d="M25 -5.5 q3 2.5 6 0" fill="none" stroke="#f8fafc" stroke-width="1.6" stroke-linecap="round"/>`,

    duck: () => `${SHADOW}
    <path d="M-6 24 v8 M6 24 v8" fill="none" stroke="#f97316" stroke-width="3" stroke-linecap="round"/>
    <path d="M-11 32 h9 M2 32 h9" fill="none" stroke="#f97316" stroke-width="3" stroke-linecap="round"/>
    <ellipse cx="0" cy="10" rx="23" ry="15" fill="#fde047" stroke="#ca8a04" stroke-width="2.5"/>
    <path d="M-21 5 q-10 -3 -9 6 q4 5 10 -1 z" fill="#fde047" stroke="#ca8a04" stroke-width="2" stroke-linejoin="round"/>
    <ellipse cx="-3" cy="11" rx="10" ry="6.5" fill="#facc15" stroke="#ca8a04" stroke-width="2" transform="rotate(-12 -3 11)"/>
    <circle cx="17" cy="-11" r="10.5" fill="#fde047" stroke="#ca8a04" stroke-width="2.5"/>
    <path d="M26.5 -13.5 q11 -2.5 11 2.5 q0 5 -11 2.5 z" fill="#fb923c" stroke="#ea580c" stroke-width="1.8" stroke-linejoin="round"/>
    <circle cx="19.5" cy="-14" r="1.8" fill="#1e293b"/>`,

    chicken: () => `${SHADOW}
    <path d="M-6 22 v9 M6 22 v9" fill="none" stroke="#f97316" stroke-width="3" stroke-linecap="round"/>
    <path d="M-10 31 h8 M2 31 h8" fill="none" stroke="#f97316" stroke-width="3" stroke-linecap="round"/>
    <ellipse cx="0" cy="8" rx="21" ry="15" fill="#fafaf9" stroke="#a8a29e" stroke-width="2.5"/>
    <path d="M-19 3 q-9 -2 -8 6 q4 5 9 -1 z" fill="#e7e5e4" stroke="#a8a29e" stroke-width="2" stroke-linejoin="round"/>
    <ellipse cx="-3" cy="9" rx="9" ry="6" fill="#e7e5e4" stroke="#a8a29e" stroke-width="2" transform="rotate(-12 -3 9)"/>
    <circle cx="15" cy="-12" r="10" fill="#fafaf9" stroke="#a8a29e" stroke-width="2.5"/>
    <path d="M10 -21 q1 -6 5 -4 q1 -4 5 -2 q3 2 1 6 z" fill="#ef4444" stroke="#b91c1c" stroke-width="1.6" stroke-linejoin="round"/>
    <path d="M24 -13 q9 -1 8 3 q-1 4 -8 1 z" fill="#fb923c" stroke="#ea580c" stroke-width="1.6" stroke-linejoin="round"/>
    <ellipse cx="20" cy="-3" rx="2.5" ry="3.5" fill="#ef4444"/>
    <circle cx="17.5" cy="-14" r="1.7" fill="#1e293b"/>`,

    horse: () => `${SHADOW}
    <rect x="-20" y="14" width="8" height="17" rx="3.5" fill="#c68a53" stroke="#8a5a2b" stroke-width="2"/>
    <rect x="-6" y="14" width="8" height="17" rx="3.5" fill="#c68a53" stroke="#8a5a2b" stroke-width="2"/>
    <rect x="8" y="14" width="8" height="17" rx="3.5" fill="#c68a53" stroke="#8a5a2b" stroke-width="2"/>
    <path d="M-27 -2 q-9 4 -7 16" fill="none" stroke="#7c4a21" stroke-width="4" stroke-linecap="round"/>
    <ellipse cx="-2" cy="4" rx="26" ry="17" fill="#c68a53" stroke="#8a5a2b" stroke-width="2.5"/>
    <path d="M12 -10 q5 -13 15 -13" fill="none" stroke="#7c4a21" stroke-width="5" stroke-linecap="round"/>
    <circle cx="26" cy="-14" r="10" fill="#c68a53" stroke="#8a5a2b" stroke-width="2.5"/>
    <path d="M20 -23 l3 -7 l4 6 z" fill="#c68a53" stroke="#8a5a2b" stroke-width="2" stroke-linejoin="round"/>
    <ellipse cx="33" cy="-10" rx="6" ry="5" fill="#e7c9a1" stroke="#8a5a2b" stroke-width="2"/>
    <circle cx="34" cy="-9" r="1.2" fill="#7c4a21"/>
    <circle cx="23" cy="-16" r="1.8" fill="#1e293b"/>`,

    goat: () => `${SHADOW}
    <rect x="-19" y="15" width="8" height="16" rx="3.5" fill="#d6d3d1" stroke="#78716c" stroke-width="2"/>
    <rect x="-5" y="15" width="8" height="16" rx="3.5" fill="#d6d3d1" stroke="#78716c" stroke-width="2"/>
    <rect x="9" y="15" width="8" height="16" rx="3.5" fill="#d6d3d1" stroke="#78716c" stroke-width="2"/>
    <path d="M-26 -2 q-7 2 -6 10" fill="none" stroke="#78716c" stroke-width="3" stroke-linecap="round"/>
    <ellipse cx="-2" cy="4" rx="25" ry="16" fill="#e7e5e4" stroke="#78716c" stroke-width="2.5"/>
    <circle cx="25" cy="-10" r="10" fill="#d6d3d1" stroke="#78716c" stroke-width="2.5"/>
    <path d="M20 -19 q-2 -8 -8 -9" fill="none" stroke="#a8a29e" stroke-width="3.5" stroke-linecap="round"/>
    <path d="M27 -20 q2 -8 8 -8" fill="none" stroke="#a8a29e" stroke-width="3.5" stroke-linecap="round"/>
    <ellipse cx="15" cy="-13" rx="5" ry="2.8" fill="#d6d3d1" stroke="#78716c" stroke-width="2" transform="rotate(-25 15 -13)"/>
    <path d="M27 0 q0 6 -3 8" fill="none" stroke="#78716c" stroke-width="3" stroke-linecap="round"/>
    <ellipse cx="30" cy="-5" rx="5.5" ry="4" fill="#f5f5f4" stroke="#78716c" stroke-width="1.8"/>
    <circle cx="28.5" cy="-5" r="1.1" fill="#57534e"/><circle cx="32" cy="-5" r="1.1" fill="#57534e"/>
    <circle cx="22" cy="-13" r="1.7" fill="#1e293b"/><circle cx="29" cy="-13" r="1.7" fill="#1e293b"/>`,

    rabbit: () => `${SHADOW}
    <ellipse cx="-8" cy="22" rx="7" ry="3.5" fill="#f5f5f4" stroke="#a8a29e" stroke-width="2"/>
    <ellipse cx="6" cy="22" rx="7" ry="3.5" fill="#f5f5f4" stroke="#a8a29e" stroke-width="2"/>
    <circle cx="-21" cy="8" r="5" fill="#ffffff" stroke="#a8a29e" stroke-width="2"/>
    <ellipse cx="-2" cy="8" rx="20" ry="14" fill="#f5f5f4" stroke="#a8a29e" stroke-width="2.5"/>
    <ellipse cx="10" cy="-26" rx="4" ry="12" fill="#f5f5f4" stroke="#a8a29e" stroke-width="2" transform="rotate(-12 10 -26)"/>
    <ellipse cx="10" cy="-26" rx="1.8" ry="8" fill="#f9a8d4" transform="rotate(-12 10 -26)"/>
    <ellipse cx="19" cy="-27" rx="4" ry="12" fill="#f5f5f4" stroke="#a8a29e" stroke-width="2" transform="rotate(8 19 -27)"/>
    <ellipse cx="19" cy="-27" rx="1.8" ry="8" fill="#f9a8d4" transform="rotate(8 19 -27)"/>
    <circle cx="16" cy="-8" r="10" fill="#f5f5f4" stroke="#a8a29e" stroke-width="2.5"/>
    <circle cx="19" cy="-10" r="1.7" fill="#1e293b"/>
    <path d="M24 -6 l3.5 1.5 l-3.5 1.5 z" fill="#f472b6"/>`,
};

/* ---------------- pemandangan & pagar minimalis ---------------- */
function scenerySvg() {
    let s = '<rect x="0" y="0" width="640" height="420" rx="16" fill="#eef6e7"/>';
    s += '<ellipse cx="160" cy="130" rx="150" ry="70" fill="#e4f1d9"/>';
    s += '<ellipse cx="470" cy="300" rx="170" ry="80" fill="#e4f1d9"/>';
    [[80, 90], [300, 70], [560, 95], [600, 250], [70, 240], [340, 380], [180, 380], [500, 380]]
        .forEach(([x, y]) => {
            s += `<path d="M${x} ${y} q2 -7 4 0 M${x + 6} ${y} q2 -5 4 0 M${x - 6} ${y} q2 -5 4 0" fill="none" stroke="#c9e2b4" stroke-width="2" stroke-linecap="round"/>`;
        });
    [[240, 120], [440, 250], [130, 200], [560, 330], [300, 330]].forEach(([x, y]) => {
        s += `<circle cx="${x}" cy="${y}" r="3" fill="#ffffff"/><circle cx="${x}" cy="${y}" r="1.4" fill="#f59e0b"/>`;
    });
    return s;
}

function fenceSvg() {
    let s = '<g fill="#e0cfa8">';
    s += '<rect x="14" y="18" width="612" height="5" rx="2.5"/>';
    s += '<rect x="14" y="397" width="612" height="5" rx="2.5"/>';
    s += '<rect x="14" y="18" width="5" height="384" rx="2.5"/>';
    s += '<rect x="621" y="18" width="5" height="384" rx="2.5"/>';
    s += '</g><g fill="#d4bc8b">';
    for (let i = 0; i < 8; i++) {
        const x = 30 + i * 83;
        s += `<rect x="${x - 3}" y="8" width="6" height="26" rx="3"/>`;
        s += `<rect x="${x - 3}" y="386" width="6" height="26" rx="3"/>`;
    }
    [130, 210, 290].forEach((y) => {
        s += `<rect x="8" y="${y - 13}" width="6" height="26" rx="3"/>`;
        s += `<rect x="626" y="${y - 13}" width="6" height="26" rx="3"/>`;
    });
    return s + "</g>";
}

function animalsSvg(rd) {
    return rd.animals.map((a) =>
        `<g class="cf-animal" transform="translate(${a.x.toFixed(1)},${a.y.toFixed(1)}) scale(${(a.flip * rd.scale).toFixed(2)},${rd.scale.toFixed(2)})">` +
        `<g class="cf-in" style="animation-delay:${a.delay}ms">` +
        `<g class="cf-body" style="animation-delay:${a.bob}ms">${ART[a.kind]()}</g></g></g>`
    ).join("");
}

/* ================================================================ */
/* MOUNT                                                            */
/* ================================================================ */
export function mount(root, context = {}) {
    const { mode = "ai", room = null, playerName = "Player", onExit = () => { } } = context;
    const online = mode === "room" && Boolean(room);
    let roomData = room?.room || null;
    let state = null;
    let destroyed = false;
    const subs = [];
    const track = (u) => { if (typeof u === "function") subs.push(u); };

    /* ---- UI lokal (tidak disinkronkan) ---- */
    let sel = 0;
    let uiKey = "";
    let cachedRound = null;
    let cheatOpen = false;
    let helpOpen = false;
    let paused = false;
    let pauseStart = 0;
    let pauseOffset = 0;
    let fiftyHidden = null; // nilai opsi yang dibuang cheat 50:50 (ronde ini)
    const cheats = { reveal: false, auto: false, weakBot: false };
    const timers = { bot: null, advance: null, auto: null };

    /* ---- panduan internal: tampil sekali per instalasi ---- */
    let seenHelp = true;
    try { seenHelp = localStorage.getItem("countingFarmHelpSeen") === "1"; } catch (_) { seenHelp = true; }
    if (!seenHelp) {
        helpOpen = true;
        try { localStorage.setItem("countingFarmHelpSeen", "1"); } catch (_) { /* storage blocked */ }
    }

    /* Jam permainan tidak menghitung waktu pause, agar bot/timer tidak loncat. */
    const clockNow = () => Date.now() - pauseOffset;
    const perfNow = () => (typeof performance !== "undefined" ? performance.now() : Date.now()) - pauseOffset;
    const blocked = () => destroyed || paused || helpOpen || cheatOpen;

    const esc = (s) => String(s).replace(/[&<>"']/g, (c) =>
        ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

    /* ---- kursi pemain: di multiplayer posisi diacak oleh host ---- */
    const mySeat = () => (online ? (room.isHost ? state.hostSeat : 1 - state.hostSeat) : 0);
    const seatLabel = (s) => {
        if (!online) return s === 0 ? (playerName || "Kamu") : "Bot";
        return s === mySeat() ? (playerName || "Kamu") : "Lawan";
    };

    /* ---- state awal: acak posisi (online) & siapa jalan duluan ---- */
    function freshState() {
        return {
            phase: "playing", roundNo: 1,
            seed: (Math.random() * 0x7fffffff) | 0,
            hostSeat: Math.random() < 0.5 ? 0 : 1,   // posisi pemain diacak
            starting: Math.random() < 0.5 ? 0 : 1,   // giliran pertama diacak
            turn: 0, stars: [0, 0], lastPick: null, winner: null,
        };
    }

    function currentRound() {
        const key = state.roundNo + ":" + state.seed;
        if (key !== uiKey || !cachedRound) cachedRound = makeRound(state.roundNo, state.seed);
        return cachedRound;
    }

    /* ---------------- shell: HUD bar + board penuh + overlay modal ---------------- */
    root.innerHTML = `
<style>
.cf-app{--cf-line:#e5e7eb;--cf-soft:#fafafa;--cf-ink:#1f2937;--cf-mut:#6b7280;--cf-acc:#16a34a;--cf-acc-soft:#f0fdf4;--cf-warn:#f59e0b;--cf-bad:#dc2626;
  position:relative;width:100%;height:100%;min-height:0;margin:0 auto;padding:2px;
  display:flex;flex-direction:column;gap:10px;color:var(--cf-ink);
  font:14px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
.cf-app *{box-sizing:border-box}
.cf-app [hidden]{display:none!important}
.cf-app :is(button):focus-visible{outline:2px solid var(--cf-acc);outline-offset:2px}
.cf-hud{display:flex;align-items:center;gap:7px;flex-wrap:wrap;min-width:0;font:600 11px/1 ui-monospace,SFMono-Regular,Menlo,monospace}
.cf-chip{display:inline-flex;align-items:center;gap:6px;min-height:30px;max-width:100%;padding:5px 10px;border:1px solid var(--cf-line);border-radius:999px;background:#fff;color:var(--cf-mut);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.cf-chip b{color:var(--cf-ink);font-variant-numeric:tabular-nums}
.cf-chip.cf-active{border-color:var(--cf-acc);background:var(--cf-acc-soft);color:#166534}
.cf-chip.cf-active b{color:#166534}
.cf-dot{width:8px;height:8px;flex:none;border-radius:50%;background:#9ca3af}
.cf-star{color:var(--cf-warn)}
.cf-spacer{flex:1 1 auto;min-width:6px}
.cf-btn{border:1px solid var(--cf-line);background:#fff;color:var(--cf-ink);border-radius:9px;padding:6px 10px;min-height:32px;
  font:inherit;font-size:11px;font-weight:700;cursor:pointer;transition:border-color .15s,color .15s,background .15s}
.cf-btn:hover:not(:disabled){border-color:var(--cf-acc);color:var(--cf-acc)}
.cf-btn:disabled{opacity:.4;cursor:default}
.cf-btn.on,.cf-btn.cf-on{border-color:var(--cf-acc);background:var(--cf-acc-soft);color:#166534}
.cf-btn.primary{background:var(--cf-acc);border-color:var(--cf-acc);color:#fff}
.cf-btn.primary:hover:not(:disabled){color:#fff;opacity:.92}
.cf-icon-btn{display:inline-flex;align-items:center;gap:5px}
.cf-icon-btn svg{flex:none;display:block}
.cf-btn-label{white-space:nowrap}
.cf-app.game-fill>.cf-board{flex:1 1 auto;min-height:0;aspect-ratio:auto;position:relative;display:flex;flex-direction:column;gap:8px;min-width:0;padding:10px;border:1px solid var(--cf-line);border-radius:14px;background:#fff;overflow:hidden}
.cf-paddock{flex:1 1 auto;min-height:0;display:flex;align-items:center;justify-content:center}
.cf-paddock svg{display:block;width:100%;height:100%;max-width:100%;max-height:100%;border-radius:12px}
.cf-question{flex:none;display:flex;align-items:center;justify-content:center;gap:8px;flex-wrap:wrap;min-height:40px;font-size:18px;font-weight:700;color:var(--cf-ink);text-align:center;line-height:1.35}
.cf-qicon{width:36px;height:36px;flex:none}
.cf-opts{flex:none;display:flex;gap:12px;justify-content:center;flex-wrap:wrap}
.cf-opt{min-width:92px;min-height:56px;padding:8px 16px;font:inherit;font-size:36px;font-weight:800;line-height:1.2;color:var(--cf-ink);background:#fff;border:1px solid var(--cf-line);border-radius:12px;cursor:pointer;touch-action:manipulation;transition:border-color .16s,transform .16s,background .16s,opacity .16s;animation:cf-pop .3s cubic-bezier(.34,1.56,.64,1) backwards}
.cf-opt:hover:not(:disabled){border-color:var(--cf-acc);transform:translateY(-2px)}
.cf-opt:focus-visible{outline:2px solid var(--cf-acc);outline-offset:2px}
.cf-opt.cf-sel:not(:disabled){border-color:var(--cf-acc);box-shadow:0 0 0 3px rgba(22,163,74,.15)}
.cf-opt:disabled{cursor:default;opacity:.6}
.cf-opt.cf-right{background:var(--cf-acc-soft);border-color:var(--cf-acc);color:#166534;opacity:1}
.cf-opt.cf-wrong{background:#fef2f2;border-color:var(--cf-bad);color:#991b1b;opacity:1;animation:cf-shake .4s ease}
.cf-opt.cf-reveal{border-color:var(--cf-warn);box-shadow:0 0 0 3px rgba(245,158,11,.2)}
.cf-opt.cf-hidden{opacity:.15;pointer-events:none}
.cf-fb{flex:none;min-height:22px;text-align:center;font-size:13px;font-weight:600;color:var(--cf-mut);line-height:1.4}
.cf-fb.cf-good{color:var(--cf-acc);animation:cf-pop .35s cubic-bezier(.34,1.56,.64,1)}
.cf-fb.cf-bad{color:var(--cf-bad)}
.cf-touch{display:none;gap:12px;justify-content:center;flex:none}
.cf-tbtn{width:52px;height:52px;border-radius:50%;border:1px solid var(--cf-line);background:#fff;font-size:20px;color:var(--cf-ink);cursor:pointer;touch-action:manipulation}
.cf-tbtn:active{transform:scale(.94)}
.cf-tbtn.cf-tok{background:var(--cf-acc);border-color:var(--cf-acc);color:#fff}
.cf-over{position:absolute;inset:0;z-index:5;display:flex;align-items:center;justify-content:center;padding:16px;background:rgba(255,255,255,.88);backdrop-filter:blur(2px);border-radius:14px}
.cf-over-card{display:flex;flex-direction:column;gap:8px;align-items:center;text-align:center;width:min(360px,100%);max-height:100%;overflow:hidden;padding:20px 24px;background:#fff;border:1px solid var(--cf-line);border-radius:14px;box-shadow:0 8px 24px rgba(17,24,39,.1)}
.cf-over-help .cf-over-card{width:min(560px,100%);text-align:left}
.cf-over-emoji{font-size:40px;line-height:1}
.cf-over-card h3{margin:0;font-size:19px;color:var(--cf-ink)}
.cf-over-card p{margin:0;font-size:13px;color:var(--cf-mut);line-height:1.5}
.cf-head{display:flex;align-items:center;justify-content:space-between;gap:10px;flex:none;width:100%}
.cf-head h3{margin:0;font-size:16px;font-weight:800;color:var(--cf-ink)}
.cf-body{flex:1 1 auto;min-height:0;overflow:auto;width:100%;font-size:13px;color:var(--cf-mut)}
.cf-cheats{flex:1 1 auto;min-height:0;overflow:auto;display:flex;flex-direction:column;gap:8px;width:100%}
.cf-help{flex:1 1 auto;min-height:0;overflow:auto;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;width:100%}
.cf-help b{display:block;margin-bottom:5px;font:700 10px/1 ui-monospace,monospace;letter-spacing:.08em;color:var(--cf-mut);text-transform:uppercase}
.cf-help ul{margin:0 0 10px;padding-left:16px;font-size:12px;line-height:1.6;color:#4b5563}
.cf-kbd{display:inline-block;padding:1px 5px;border:1px solid var(--cf-line);border-bottom-width:2px;border-radius:5px;background:var(--cf-soft);color:var(--cf-ink);font:inherit}
.cf-foot{display:flex;align-items:center;justify-content:space-between;gap:10px;flex:none;flex-wrap:wrap;width:100%}
.cf-note{font-size:11px;color:var(--cf-mut)}
.cf-cheat-row{display:flex;justify-content:space-between;align-items:center;gap:8px;min-height:40px;font-size:12.5px;color:var(--cf-ink)}
.cf-cheat-row .cf-btn{font-size:11.5px}
.cf-animal .cf-in{animation:cf-pop .4s cubic-bezier(.34,1.56,.64,1) backwards}
.cf-animal .cf-body{animation:cf-bob 3s ease-in-out infinite}
@keyframes cf-pop{from{transform:scale(.6);opacity:0}to{transform:scale(1);opacity:1}}
@keyframes cf-bob{0%,100%{transform:translateY(0)}50%{transform:translateY(-4px)}}
@keyframes cf-shake{0%,100%{transform:translateX(0)}25%{transform:translateX(-6px)}50%{transform:translateX(5px)}75%{transform:translateX(-3px)}}
@media (pointer:coarse),(max-width:640px){
  .cf-app .cf-touch{display:flex}
  .cf-app .cf-opt{font-size:30px;min-width:76px;padding:8px 12px}
  .cf-app .cf-question{font-size:16px}
}
@media (prefers-reduced-motion:reduce){.cf-app *{animation:none!important;transition-duration:.01ms!important}}

/* --- layout redesign: override terakhir (spesifisitas tinggi) --- */
@media (max-width:640px){
  .cf-app.game-fill>.cf-board:not(:has(.cf-over:not([hidden]))){flex:0 0 auto;min-height:0;aspect-ratio:auto}
  .cf-app.game-fill>.cf-board:has(.cf-over:not([hidden])){flex:0 0 auto;min-height:min(70dvh,620px);aspect-ratio:auto}
  .cf-app .cf-paddock{flex:0 0 auto}
  .cf-app .cf-paddock svg{height:auto;aspect-ratio:640/420}
  .cf-app .cf-hud{gap:5px;margin-bottom:0}
  .cf-app .cf-hud .cf-chip{padding:4px 6px;font-size:9px;min-height:0}
  .cf-app .cf-hud .cf-chip[data-hud="first"]{display:none}
  .cf-app .cf-hud .cf-btn{min-height:32px;padding:5px 9px;font-size:9px}
  .cf-app .cf-hud .cf-btn-label,.cf-app .cf-hud .cf-spacer{display:none}
  .cf-app .cf-over{padding:8px}
  .cf-app .cf-over-card{width:100%;height:100%;max-height:100%;padding:12px;border-radius:12px}
  .cf-app .cf-help{grid-template-columns:1fr;gap:8px}
  .cf-app .cf-cheats,.cf-app .cf-help,.cf-app .cf-body{scrollbar-width:none}
  .cf-app .cf-cheats::-webkit-scrollbar,.cf-app .cf-help::-webkit-scrollbar,.cf-app .cf-body::-webkit-scrollbar{display:none}
  .cf-app .cf-foot{padding-top:8px;border-top:1px solid var(--cf-line)}
  .cf-app .cf-note{display:none}
}
@media (pointer:coarse){
  .cf-app .cf-hud .cf-btn{min-height:32px;padding:5px 9px;font-size:9px}
  .cf-app .cf-over-card .cf-btn{min-height:44px}
}
</style>
<div class="game-app cf-app game-fill" data-cf>
  <div class="cf-hud">
    <span class="cf-chip"><i class="cf-dot" data-dot></i><b data-status>Memuat…</b></span>
    <span class="cf-chip">Ronde <b data-hud="round">1/${ROUNDS}</b></span>
    <span class="cf-chip" data-seat="0"></span>
    <span class="cf-chip" data-seat="1"></span>
    <span class="cf-chip" data-hud="first">Mulai: <b data-hud="first-val">—</b></span>
    <span class="cf-spacer"></span>
    <button class="cf-btn cf-icon-btn" type="button" data-help aria-label="How to play" title="How to play (H)">${iconSVG("helpCircle", { size: 14 })}<span class="cf-btn-label">Help</span></button>
    <button class="cf-btn cf-icon-btn" type="button" data-cheats aria-label="Cheats" title="Cheats (C)">${iconSVG("wrench", { size: 14 })}<span class="cf-btn-label">Cheats</span></button>
    <button class="cf-btn cf-icon-btn" type="button" data-pause aria-label="Pause" title="Pause (P)">${iconSVG("pause", { size: 14 })}<span class="cf-btn-label">Pause</span></button>
    <button class="cf-btn cf-icon-btn" type="button" data-restart aria-label="Restart" title="Restart (R)">${iconSVG("refresh", { size: 14 })}<span class="cf-btn-label">Restart</span></button>
    <button class="cf-btn cf-icon-btn" type="button" data-exit aria-label="Exit game" title="Exit game">${iconSVG("logOut", { size: 14 })}<span class="cf-btn-label">Exit game</span></button>
  </div>
  <section class="game-panel cf-board" data-board>
    <div class="cf-paddock"><svg data-paddock viewBox="0 0 640 420" preserveAspectRatio="xMidYMid meet" aria-hidden="true"></svg></div>
    <div class="cf-question" data-question></div>
    <div class="cf-opts" data-opts title="Keyboard: 1–3, panah + Enter"></div>
    <div class="cf-fb" data-fb></div>
    <div class="cf-over" data-over hidden>
      <div class="cf-over-card">
        <div class="cf-over-emoji" data-res-emoji>🏆</div>
        <h3 data-res-title></h3>
        <p data-res-sub></p>
        <div class="cf-foot"><span class="cf-note">Press R to restart</span><button class="cf-btn primary" type="button" data-restart>Main lagi</button></div>
      </div>
    </div>
    <div class="cf-over" data-ov="pause" hidden>
      <div class="cf-over-card">
        <div class="cf-head"><h3>Paused</h3></div>
        <div class="cf-body"><p>Papan, bot dan timer sedang dibekukan.</p></div>
        <div class="cf-foot"><span class="cf-note">Press P or Esc to resume</span><button class="cf-btn primary" type="button" data-resume>Resume</button></div>
      </div>
    </div>
    <div class="cf-over" data-ov="cheat" hidden>
      <div class="cf-over-card">
        <div class="cf-head"><h3>Cheats</h3><button class="cf-btn" type="button" data-cheat-close aria-label="Close cheats">${iconSVG("x", { size: 14 })}</button></div>
        <div class="cf-cheats" data-cheat-body></div>
        <div class="cf-foot"><span class="cf-note">Press C to close</span><button class="cf-btn primary" type="button" data-cheat-close>Done</button></div>
      </div>
    </div>
    <div class="cf-over cf-over-help" data-ov="help" hidden>
      <div class="cf-over-card">
        <div class="cf-head"><h3>How to play</h3><button class="cf-btn" type="button" data-help-close aria-label="Close help">${iconSVG("x", { size: 14 })}</button></div>
        <div class="cf-help">
          <div>
            <b>Desktop</b>
            <ul>
              <li>Hitung hewan di padang, lalu klik angka yang benar atau tekan <span class="cf-kbd">1</span>–<span class="cf-kbd">3</span> / panah + <span class="cf-kbd">Enter</span>.</li>
              <li><span class="cf-kbd">H</span> help · <span class="cf-kbd">C</span> cheats · <span class="cf-kbd">P</span> pause · <span class="cf-kbd">R</span> restart</li>
            </ul>
            <b>Mobile</b>
            <ul>
              <li>Tap angka jawaban, atau pakai tombol ◀ ✔ ▶ di bawah papan.</li>
              <li>Gunakan tombol di bar HUD untuk Help, Cheats, Pause, Restart dan Exit.</li>
            </ul>
          </div>
          <div>
            <b>Rules</b>
            <ul>
              <li>10 ronde bergilir. Pertanyaan bisa menanyakan jenis hewan tertentu atau jumlah semua hewan.</li>
              <li>Jawaban benar mendapat 1 bintang. Pemain dengan bintang terbanyak menang; seri jika sama.</li>
              <li>Siapa yang jalan duluan dan posisi pemain (mode online) ditentukan secara acak.</li>
              <li>Cheat: lihat jawaban, 50:50, jawab otomatis, bot lemah, tambah bintang, lewati giliran (solo).</li>
            </ul>
            <div class="cf-foot"><span class="cf-note">Press H to reopen this guide</span><button class="cf-btn primary" type="button" data-help-close>Got it</button></div>
          </div>
        </div>
      </div>
    </div>
  </section>
  <div class="cf-touch">
    <button type="button" class="cf-tbtn" data-nav="prev" aria-label="Pilihan sebelumnya">◀</button>
    <button type="button" class="cf-tbtn cf-tok" data-nav="ok" aria-label="Pilih jawaban">✔</button>
    <button type="button" class="cf-tbtn" data-nav="next" aria-label="Pilihan berikutnya">▶</button>
  </div>
</div>`;

    const $ = (s) => root.querySelector(s);
    const boardEl = $("[data-board]");
    const paddockEl = $("[data-paddock]");
    const questionEl = $("[data-question]");
    const optsEl = $("[data-opts]");
    const fbEl = $("[data-fb]");
    const hudSeat = [$('[data-seat="0"]'), $('[data-seat="1"]')];
    const roundEl = $('[data-hud="round"]');
    const firstEl = $('[data-hud="first-val"]');
    const statusEl = $("[data-status]");
    const dotEl = $("[data-dot]");
    const cheatBtnEl = $("[data-cheats]");
    const pauseBtn = $("[data-pause]");
    const cheatBodyEl = $("[data-cheat-body]");
    const ov = {
        over: $("[data-over]"),
        pause: $('[data-ov="pause"]'),
        cheat: $('[data-ov="cheat"]'),
        help: $('[data-ov="help"]'),
    };
    const res = {
        emoji: $("[data-res-emoji]"),
        title: $("[data-res-title]"),
        sub: $("[data-res-sub]"),
    };

    /* ---------------- render ---------------- */
    function buildBoard() {
        const rd = currentRound();
        paddockEl.innerHTML = `${scenerySvg()}${animalsSvg(rd)}${fenceSvg()}`;
        questionEl.innerHTML = rd.target
            ? `<svg class="cf-qicon" viewBox="-44 -42 88 82" aria-hidden="true">${ART[rd.target]()}</svg><span>Berapa banyak ${KIND_LABEL[rd.target]}?</span>`
            : "<span>Berapa jumlah semua hewan?</span>";
        optsEl.innerHTML = rd.options.map((v, i) =>
            `<button type="button" class="cf-opt" data-v="${v}" data-i="${i}" style="animation-delay:${i * 70}ms">${v}</button>`).join("");
    }

    function updateSel() {
        if (!optsEl || !state) return;
        const rd = currentRound();
        const myTurn = state.phase === "playing" && state.turn === mySeat();
        optsEl.querySelectorAll(".cf-opt").forEach((b, i) => {
            b.classList.toggle("cf-sel", myTurn && i === sel && rd.options[i] !== fiftyHidden);
        });
    }

    function updateRoundUi() {
        if (!state) return;
        const rd = currentRound();
        const mine = mySeat();
        const myTurn = state.phase === "playing" && state.turn === mine;

        hudSeat.forEach((chip, s) => {
            chip.className = `cf-chip${state.turn === s && state.phase !== "over" ? " cf-active" : ""}`;
            chip.innerHTML = `<span class="cf-star">★</span><b>${state.stars[s]}</b>&nbsp;${esc(seatLabel(s))} (P${s + 1})`;
        });
        roundEl.textContent = `${Math.min(state.roundNo, ROUNDS)}/${ROUNDS}`;
        firstEl.textContent = seatLabel(state.starting);

        optsEl.querySelectorAll(".cf-opt").forEach((b, i) => {
            const v = rd.options[i];
            b.disabled = !myTurn || v === fiftyHidden;
            b.classList.toggle("cf-right", !!state.lastPick && v === rd.correct);
            b.classList.toggle("cf-wrong", !!state.lastPick && !state.lastPick.correct && state.lastPick.value === v);
            b.classList.toggle("cf-reveal", cheats.reveal && state.phase === "playing" && v === rd.correct);
            b.classList.toggle("cf-hidden", v === fiftyHidden);
        });
        updateSel();

        let fb = "", fbCls = "cf-fb";
        if (state.phase === "reveal" && state.lastPick) {
            const p = state.lastPick;
            if (p.skipped) fb = "Giliran dilewati.";
            else if (p.correct) {
                fb = p.seat === mine ? PRAISE[state.roundNo % PRAISE.length] + " +1 ★" : seatLabel(p.seat) + " menjawab benar. +1 ★";
                if (p.seat === mine) fbCls += " cf-good";
            } else {
                fb = (p.seat === mine ? "Belum tepat. " : seatLabel(p.seat) + " salah. ") + "Jawaban: " + rd.correct + ".";
                if (p.seat === mine) fbCls += " cf-bad";
            }
        }
        fbEl.textContent = fb;
        fbEl.className = fbCls;

        if (state.phase === "over") {
            const draw = state.winner === -1;
            const win = state.winner === mine;
            res.emoji.textContent = draw ? "🤝" : win ? "🏆" : "🌱";
            res.title.textContent = draw ? "Seri!" : win ? "Kamu menang!" : seatLabel(state.winner) + " menang";
            res.sub.textContent = `${seatLabel(0)} ${state.stars[0]} ★  ·  ${state.stars[1]} ★ ${seatLabel(1)}`;
        }

        let st, dot;
        if (state.phase === "over") {
            st = state.winner === -1 ? "Seri!" : state.winner === mine ? "Kamu menang!" : "Kamu kalah";
            dot = "#9ca3af";
        } else if (state.phase === "reveal") {
            st = state.lastPick && state.lastPick.correct ? "Benar! +1 ★" : "Belum tepat";
            dot = state.lastPick && state.lastPick.correct ? "#16a34a" : "#ef4444";
        } else {
            st = myTurn ? "Giliranmu — pilih angka" : online ? "Giliran lawan…" : "Bot berpikir…";
            dot = myTurn ? "#16a34a" : "#f59e0b";
        }
        statusEl.textContent = st;
        dotEl.style.background = dot;
        renderCheats();
        syncUI();
    }

    function render() {
        if (!state || destroyed) return;
        const key = state.roundNo + ":" + state.seed;
        if (key !== uiKey) { uiKey = key; sel = 0; fiftyHidden = null; buildBoard(); }
        updateRoundUi();
    }

    function renderCheats() {
        const anyOn = cheats.reveal || cheats.auto || cheats.weakBot;
        cheatBtnEl.classList.toggle("on", cheatOpen || anyOn);
        if (!cheatOpen) return;
        const rd = state ? currentRound() : null;
        const fiftyOk = state && state.phase === "playing" && state.turn === mySeat() && !fiftyHidden && !blocked();
        const tog = (key, label) =>
            `<div class="cf-cheat-row"><span>${label}</span><button type="button" class="cf-btn" data-cheat="${key}" ${online ? "disabled" : ""}>${cheats[key === "weak" ? "weakBot" : key] ? "ON" : "OFF"}</button></div>`;
        cheatBodyEl.innerHTML = `
<div class="cf-cheat-row"><span>Lihat jawaban</span><button type="button" class="cf-btn" data-cheat="reveal">${cheats.reveal ? "ON" : "OFF"}</button></div>
<div class="cf-cheat-row"><span>50:50 (buang 1 salah)</span><button type="button" class="cf-btn" data-cheat="fifty" ${fiftyOk ? "" : "disabled"}>Pakai</button></div>
${tog("auto", "Jawab otomatis")}
${tog("weak", "Bot lemah")}
<div class="cf-cheat-row"><span>+1 bintang (kamu)</span><button type="button" class="cf-btn" data-cheat="star" ${online ? "disabled" : ""}>Tambah</button></div>
<div class="cf-cheat-row"><span>Lewati giliran</span><button type="button" class="cf-btn" data-cheat="skip" ${online ? "disabled" : ""}>Lewati</button></div>
<p class="cf-note">${online ? "Mode online: hanya cheat tampilan (lihat jawaban & 50:50)." : "Semua cheat tersedia di mode solo vs Bot."}</p>`;
    }

    /* Overlays saling menekan: help > cheats > pause > result. Label tombol
       HUD update lewat span agar ikon tidak ikut tertimpa. */
    function syncUI() {
        const resultOpen = Boolean(state && state.phase === "over");
        ov.over.hidden = !resultOpen || helpOpen || cheatOpen || paused;
        ov.pause.hidden = !paused || helpOpen || cheatOpen;
        ov.cheat.hidden = !cheatOpen || helpOpen;
        ov.help.hidden = !helpOpen;
        cheatBtnEl.classList.toggle("on", cheatOpen);
        cheatBtnEl.setAttribute("aria-pressed", String(cheatOpen));
        const label = pauseBtn.querySelector(".cf-btn-label");
        if (label) label.textContent = paused ? "Resume" : "Pause";
        pauseBtn.setAttribute("aria-label", paused ? "Resume" : "Pause");
        pauseBtn.setAttribute("title", paused ? "Resume (P)" : "Pause (P)");
        pauseBtn.disabled = online;
    }

    /* ---------------- timer yang bisa dibekukan ---------------- */
    function cancelTimer(kind) {
        const t = timers[kind];
        if (!t) return;
        if (t.id) clearTimeout(t.id);
        timers[kind] = null;
    }

    function clearTimers() { Object.keys(timers).forEach(cancelTimer); }

    function scheduleTimer(kind, fn, ms) {
        cancelTimer(kind);
        const due = clockNow() + ms;
        const id = setTimeout(() => {
            if (timers[kind]?.id !== id) return;
            timers[kind] = null;
            if (destroyed || blocked()) return;
            fn();
        }, Math.max(0, ms));
        timers[kind] = { id, due, fn };
    }

    function freezeTimers() {
        Object.keys(timers).forEach((kind) => {
            const t = timers[kind];
            if (!t || !t.id) return;
            clearTimeout(t.id);
            t.remaining = Math.max(0, t.due - clockNow());
            t.id = null;
        });
    }

    function thawTimers() {
        Object.keys(timers).forEach((kind) => {
            const t = timers[kind];
            if (!t || t.id) return;
            const ms = typeof t.remaining === "number" ? t.remaining : Math.max(0, t.due - clockNow());
            const id = setTimeout(() => {
                if (timers[kind]?.id !== id) return;
                timers[kind] = null;
                if (destroyed || blocked()) return;
                t.fn();
            }, ms);
            t.id = id;
            delete t.remaining;
        });
    }

    /* ---------------- overlay toggles ---------------- */
    function toggleHelp(on) {
        const next = typeof on === "boolean" ? on : !helpOpen;
        if (next === helpOpen) return;
        helpOpen = next;
        if (helpOpen) {
            cheatOpen = false;
            if (paused) togglePause(false);
            freezeTimers();
        } else {
            thawTimers();
            scheduleActors();
        }
        syncUI();
    }

    function toggleCheats(on) {
        const next = typeof on === "boolean" ? on : !cheatOpen;
        if (next === cheatOpen) return;
        cheatOpen = next;
        if (cheatOpen) {
            helpOpen = false;
            if (paused) togglePause(false);
            freezeTimers();
        } else {
            thawTimers();
            scheduleActors();
        }
        renderCheats();
        syncUI();
    }

    function togglePause(on) {
        if (online || destroyed) return;
        const next = typeof on === "boolean" ? on : !paused;
        if (next === paused) return;
        if (next) {
            paused = true;
            pauseStart = Date.now();
            cheatOpen = false;
            helpOpen = false;
            freezeTimers();
        } else {
            if (pauseStart) pauseOffset += Date.now() - pauseStart;
            pauseStart = 0;
            paused = false;
            thawTimers();
            scheduleActors();
        }
        syncUI();
    }

    /* ---------------- alur permainan (otoritas: host / lokal) ---------------- */
    function publish() {
        render();
        if (online && room.isHost) room.publishState(state).catch(console.warn);
    }

    function scheduleActors() {
        cancelTimer("bot");
        cancelTimer("auto");
        if (blocked() || online || !state || state.phase !== "playing") return;
        if (state.turn === 1) {
            const delay = (cheats.weakBot ? 2600 : 1100) + Math.random() * 1400;
            scheduleTimer("bot", () => {
                if (blocked() || !state || state.phase !== "playing" || state.turn !== 1) return;
                const rd = currentRound();
                const acc = cheats.weakBot ? 0.15 : 0.65;
                let v;
                if (Math.random() < acc) v = rd.correct;
                else {
                    const wrong = rd.options.filter((o) => o !== rd.correct);
                    v = wrong[Math.floor(Math.random() * wrong.length)];
                }
                applyAction({ type: "answer", value: v }, 1);
            }, delay);
        } else if (cheats.auto) {
            scheduleTimer("auto", () => {
                if (blocked() || !state || state.phase !== "playing" || state.turn !== 0) return;
                applyAction({ type: "answer", value: currentRound().correct }, 0);
            }, 700);
        }
    }

    function afterStateChange() { publish(); scheduleActors(); }

    function advance() {
        if (destroyed) return;
        if (state.roundNo >= ROUNDS) {
            state.phase = "over";
            const [a, b] = state.stars;
            state.winner = a === b ? -1 : a > b ? 0 : 1;
        } else {
            state.roundNo++;
            state.turn = 1 - state.turn;
            state.seed = (Math.random() * 0x7fffffff) | 0;
            state.lastPick = null;
            state.phase = "playing";
        }
        afterStateChange();
    }

    function applyAction(action, actor) {
        if (!state || destroyed || !action) return;
        if (action.type === "restart") {
            clearTimers();
            state = freshState();
            state.turn = state.starting;
            afterStateChange();
            return;
        }
        if (action.type === "answer") {
            if (state.phase !== "playing" || actor !== state.turn) return;
            const rd = currentRound();
            const v = Number(action.value);
            if (!rd.options.includes(v)) return;
            const correct = v === rd.correct;
            if (correct) state.stars[actor]++;
            state.lastPick = { seat: actor, value: v, correct };
            state.phase = "reveal";
            afterStateChange();
            scheduleTimer("advance", advance, 1500);
            return;
        }
        /* Cheat yang mengubah state hanya boleh di mode solo (divalidasi di sini) */
        if (!online && action.type === "cheat-star") { state.stars[0]++; afterStateChange(); return; }
        if (!online && action.type === "cheat-skip" && state.phase === "playing") {
            clearTimers();
            state.lastPick = { seat: state.turn, value: null, correct: false, skipped: true };
            state.phase = "reveal";
            afterStateChange();
            scheduleTimer("advance", advance, 900);
        }
    }

    function submitAction(action) {
        if (online && !room.isHost) { room.sendAction(action).catch(console.warn); return; }
        applyAction(action, mySeat());
    }

    /* ---------------- input: mouse / keyboard / virtual button ---------------- */
    function pick(v) {
        if (blocked() || !state || state.phase !== "playing" || state.turn !== mySeat()) return;
        if (v === fiftyHidden) return;
        const rd = currentRound();
        if (!rd.options.includes(v)) return;
        sel = rd.options.indexOf(v);
        updateSel();
        submitAction({ type: "answer", value: v });
    }

    function moveSel(d) {
        if (blocked() || !state) return;
        const rd = currentRound();
        for (let k = 0; k < 3; k++) {
            sel = (sel + d + 3) % 3;
            if (rd.options[sel] !== fiftyHidden) break;
        }
        updateSel();
    }

    function doCheat(name) {
        if (name === "close") { toggleCheats(false); return; }
        if (paused || helpOpen) return;
        if (name === "reveal") { cheats.reveal = !cheats.reveal; updateRoundUi(); return; }
        if (name === "fifty") {
            if (state && state.phase === "playing" && state.turn === mySeat() && !fiftyHidden) {
                const rd = currentRound();
                const wrong = rd.options.filter((v) => v !== rd.correct);
                fiftyHidden = wrong[Math.floor(Math.random() * wrong.length)];
                if (rd.options[sel] === fiftyHidden) moveSel(1);
                updateRoundUi();
            }
            return;
        }
        if (online) return; // cheat state-changing ditolak di multiplayer
        if (name === "auto") { cheats.auto = !cheats.auto; scheduleActors(); updateRoundUi(); }
        else if (name === "weak") { cheats.weakBot = !cheats.weakBot; scheduleActors(); updateRoundUi(); }
        else if (name === "star") submitAction({ type: "cheat-star" });
        else if (name === "skip") submitAction({ type: "cheat-skip" });
    }

    function handleClick(event) {
        const t = event.target.closest("[data-help],[data-help-close],[data-cheats],[data-cheat-close],[data-pause],[data-resume],[data-restart],[data-exit],[data-act],[data-cheat],[data-v],[data-nav]");
        if (!t) return;
        if (t.hasAttribute("data-help")) { toggleHelp(); return; }
        if (t.hasAttribute("data-help-close")) { toggleHelp(false); return; }
        if (t.hasAttribute("data-cheats")) { toggleCheats(); return; }
        if (t.hasAttribute("data-cheat-close")) { toggleCheats(false); return; }
        if (t.hasAttribute("data-pause")) { togglePause(); return; }
        if (t.hasAttribute("data-resume")) { togglePause(false); return; }
        if (t.hasAttribute("data-exit")) { onExit(); return; }
        if (t.hasAttribute("data-restart") || t.dataset.act === "restart") {
            if (!blocked()) submitAction({ type: "restart" });
            return;
        }
        if (t.dataset.cheat) { if (!paused && !helpOpen) doCheat(t.dataset.cheat); return; }
        if (blocked()) return;
        if (t.dataset.nav) {
            if (t.dataset.nav === "prev") moveSel(-1);
            else if (t.dataset.nav === "next") moveSel(1);
            else if (state && state.phase === "over") submitAction({ type: "restart" });
            else if (state) pick(currentRound().options[sel]);
            return;
        }
        if (t.dataset.v !== undefined) pick(parseInt(t.dataset.v, 10));
    }

    function handleHover(event) {
        const b = event.target.closest(".cf-opt");
        if (!b || b.disabled || blocked() || !state || state.phase !== "playing" || state.turn !== mySeat()) return;
        sel = parseInt(b.dataset.i, 10);
        updateSel();
    }

    function handleKey(event) {
        if (destroyed || event.ctrlKey || event.metaKey || event.altKey) return;
        const tag = event.target && event.target.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
        const code = event.code || "";
        const key = String(event.key || "").toLowerCase();
        const is = (c, k) => code === c || key === k;
        /* Prioritas: help → cheats → pause → Escape → restart → aksi game */
        if (is("KeyH", "h") || key === "?") {
            event.preventDefault();
            if (!event.repeat) toggleHelp();
            return;
        }
        if (is("KeyC", "c")) {
            event.preventDefault();
            if (!event.repeat && !helpOpen) toggleCheats();
            return;
        }
        if (is("KeyP", "p")) {
            event.preventDefault();
            if (!event.repeat && !helpOpen && !cheatOpen) togglePause();
            return;
        }
        if (is("Escape", "escape")) {
            event.preventDefault();
            if (helpOpen) toggleHelp(false);
            else if (cheatOpen) toggleCheats(false);
            else if (paused) togglePause(false);
            return;
        }
        if (is("KeyR", "r")) {
            event.preventDefault();
            if (!event.repeat && !blocked()) submitAction({ type: "restart" });
            return;
        }
        if (tag === "BUTTON") return; // biarkan Enter/Space native pada tombol HUD
        if (!state || blocked()) { event.preventDefault(); return; }
        if (key >= "1" && key <= "3") { pick(currentRound().options[Number(key) - 1]); event.preventDefault(); return; }
        if (is("ArrowLeft", "arrowleft")) { moveSel(-1); event.preventDefault(); return; }
        if (is("ArrowRight", "arrowright")) { moveSel(1); event.preventDefault(); return; }
        if (is("Enter", "enter") || key === " ") {
            if (state.phase === "over") submitAction({ type: "restart" });
            else pick(currentRound().options[sel]);
            event.preventDefault();
        }
    }

    root.addEventListener("click", handleClick);
    root.addEventListener("mouseover", handleHover);
    document.addEventListener("keydown", handleKey);
    syncUI();

    /* ---------------- boot: langsung main, panduan internal sekali ---------------- */
    if (online) {
        track(room.onRoom((nextRoom) => { roomData = nextRoom; if (state && !destroyed) updateRoundUi(); }));
        if (room.isHost) {
            state = freshState();
            state.turn = state.starting;
            afterStateChange();
            track(room.onAction((action) => applyAction(action, 1 - state.hostSeat)));
        } else {
            track(room.onState((nextState) => {
                if (destroyed || !nextState) return;
                state = nextState;
                render();
            }));
        }
    } else {
        state = freshState();
        state.turn = state.starting; // acak: kamu atau bot yang jalan duluan
        afterStateChange();
    }

    return {
        destroy() {
            destroyed = true;
            clearTimers();
            root.removeEventListener("click", handleClick);
            root.removeEventListener("mouseover", handleHover);
            document.removeEventListener("keydown", handleKey);
            subs.forEach((u) => { try { u(); } catch (_) { } });
        },
    };
}