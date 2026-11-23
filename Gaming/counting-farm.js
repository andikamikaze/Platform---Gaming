/* ==== GAME: counting-farm.js ==== */
/* Counting Farm — duel berhitung hewan (solo vs Bot / online 2 pemain).
   10 ronde bergilir: hitung hewan di padang, pilih angka yang benar.
   Jawaban benar = 1 bintang. Bintang terbanyak menang.
   Setelah mengubah file ini, jalankan: node tools/build-games-manifest.mjs */

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
    let fiftyHidden = null; // nilai opsi yang dibuang cheat 50:50 (ronde ini)
    const cheats = { reveal: false, auto: false, weakBot: false };
    let botTimer = null, advanceTimer = null, autoTimer = null;

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

    /* ---------------- shell (tanpa tutorial / how-to-play) ---------------- */
    root.innerHTML = `
<div class="game-app cf-app">
<style>
.cf-app{position:relative;max-width:720px;margin:0 auto}
.cf-app [hidden]{display:none!important}
.cf-app .cf-panel{position:relative;display:flex;flex-direction:column;gap:12px;padding:14px}
.cf-app .cf-hud{display:flex;flex-wrap:wrap;gap:8px;justify-content:center}
.cf-app .cf-chip{display:inline-flex;align-items:center;gap:6px;padding:5px 12px;border:1px solid #e5e7eb;border-radius:999px;background:#fafafa;font-size:12.5px;font-weight:600;color:#6b7280;max-width:220px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.cf-app .cf-chip b{color:#1f2937}
.cf-app .cf-chip.cf-active{border-color:#16a34a;background:#f0fdf4;color:#166534}
.cf-app .cf-chip.cf-active b{color:#166534}
.cf-app .cf-star{color:#f59e0b}
.cf-app .cf-stage{position:relative;display:flex;flex-direction:column;gap:12px}
.cf-app .cf-paddock svg{display:block;width:100%;height:auto;max-height:52vh;border-radius:14px}
.cf-app .cf-question{display:flex;align-items:center;justify-content:center;gap:8px;min-height:36px;font-size:19px;font-weight:700;color:#1f2937;text-align:center}
.cf-app .cf-qicon{width:36px;height:36px;flex:none}
.cf-app .cf-opts{display:flex;gap:14px;justify-content:center;flex-wrap:wrap}
.cf-app .cf-opt{min-width:92px;padding:8px 22px;font:inherit;font-size:38px;font-weight:800;line-height:1.2;color:#1f2937;background:#fff;border:2px solid #e5e7eb;border-radius:14px;cursor:pointer;transition:border-color .12s,transform .12s,background .12s,opacity .12s;animation:cf-pop .3s cubic-bezier(.34,1.56,.64,1) backwards}
.cf-app .cf-opt:hover:not(:disabled){border-color:#16a34a;transform:translateY(-2px)}
.cf-app .cf-opt.cf-sel:not(:disabled){border-color:#16a34a;box-shadow:0 0 0 3px rgba(22,163,74,.15)}
.cf-app .cf-opt:disabled{cursor:default;opacity:.6}
.cf-app .cf-opt.cf-right{background:#f0fdf4;border-color:#16a34a;color:#166534;opacity:1}
.cf-app .cf-opt.cf-wrong{background:#fef2f2;border-color:#ef4444;color:#991b1b;opacity:1;animation:cf-shake .4s ease}
.cf-app .cf-opt.cf-reveal{border-color:#f59e0b;box-shadow:0 0 0 3px rgba(245,158,11,.2)}
.cf-app .cf-opt.cf-hidden{opacity:.15;pointer-events:none}
.cf-app .cf-fb{min-height:22px;text-align:center;font-size:14px;font-weight:600;color:#6b7280}
.cf-app .cf-fb.cf-good{color:#16a34a;animation:cf-pop .35s cubic-bezier(.34,1.56,.64,1)}
.cf-app .cf-fb.cf-bad{color:#dc2626}
.cf-app .cf-touch{display:none;gap:12px;justify-content:center}
.cf-app .cf-tbtn{width:52px;height:52px;border-radius:50%;border:2px solid #e5e7eb;background:#fff;font-size:20px;color:#1f2937;cursor:pointer}
.cf-app .cf-tbtn:active{transform:scale(.94)}
.cf-app .cf-tbtn.cf-tok{background:#16a34a;border-color:#16a34a;color:#fff}
.cf-app .cf-over{position:absolute;inset:0;z-index:5;display:flex;align-items:center;justify-content:center;background:rgba(255,255,255,.85);backdrop-filter:blur(2px);border-radius:14px}
.cf-app .cf-over-card{display:flex;flex-direction:column;gap:8px;align-items:center;text-align:center;padding:22px 28px;background:#fff;border:1px solid #e5e7eb;border-radius:16px;box-shadow:0 8px 24px rgba(0,0,0,.08)}
.cf-app .cf-over-emoji{font-size:40px;line-height:1}
.cf-app .cf-over-card h3{margin:0;font-size:20px;color:#1f2937}
.cf-app .cf-over-card p{margin:0;font-size:13.5px;color:#6b7280}
.cf-app .cf-cheats{position:absolute;top:10px;right:10px;z-index:20;width:240px;display:flex;flex-direction:column;gap:8px;padding:12px;background:#fff;border:1px solid #e5e7eb;border-radius:14px;box-shadow:0 10px 28px rgba(0,0,0,.12)}
.cf-app .cf-cheats h4{margin:0;display:flex;justify-content:space-between;align-items:center;font-size:13px;color:#1f2937}
.cf-app .cf-cheats h4 button{border:none;background:none;font-size:14px;color:#9ca3af;cursor:pointer}
.cf-app .cf-cheat-row{display:flex;justify-content:space-between;align-items:center;gap:8px;font-size:12.5px;color:#374151}
.cf-app .cf-cheat-row button{font:inherit;font-size:11.5px;font-weight:700;padding:4px 10px;border-radius:8px;border:1px solid #e5e7eb;background:#fafafa;color:#374151;cursor:pointer}
.cf-app .cf-cheat-row button.cf-on{background:#16a34a;border-color:#16a34a;color:#fff}
.cf-app .cf-cheat-row button:disabled{opacity:.4;cursor:not-allowed}
.cf-app .cf-note{margin:0;font-size:10.5px;color:#9ca3af}
.cf-app .game-action-button.cf-on{border-color:#16a34a;color:#16a34a;background:#f0fdf4}
.cf-app .cf-animal .cf-in{animation:cf-pop .4s cubic-bezier(.34,1.56,.64,1) backwards}
.cf-app .cf-animal .cf-body{animation:cf-bob 3s ease-in-out infinite}
@keyframes cf-pop{from{transform:scale(.6);opacity:0}to{transform:scale(1);opacity:1}}
@keyframes cf-bob{0%,100%{transform:translateY(0)}50%{transform:translateY(-4px)}}
@keyframes cf-shake{0%,100%{transform:translateX(0)}25%{transform:translateX(-6px)}50%{transform:translateX(5px)}75%{transform:translateX(-3px)}}
@media (pointer:coarse),(max-width:640px){
  .cf-app .cf-touch{display:flex}
  .cf-app .cf-opt{font-size:30px;min-width:76px;padding:6px 16px}
  .cf-app .cf-question{font-size:16px}
}
</style>
  <div class="game-intro">
    <div><h2>Counting Farm</h2></div>
    <span class="game-status"><i class="game-status-dot" data-dot></i><span data-status>Memuat…</span></span>
  </div>
  <section class="game-panel cf-panel" data-board></section>
  <div class="game-actions">
    <button class="game-action-button" type="button" data-cheat-toggle>Cheat</button>
    <button class="game-action-button" type="button" data-act="restart">Ulang</button>
    <button class="game-action-button" type="button" data-exit>Keluar</button>
  </div>
  <div class="cf-cheats" data-cheats hidden></div>
</div>`;

    const boardEl = root.querySelector("[data-board]");
    const statusEl = root.querySelector("[data-status]");
    const dotEl = root.querySelector("[data-dot]");
    const cheatsEl = root.querySelector("[data-cheats]");
    const cheatBtnEl = root.querySelector("[data-cheat-toggle]");
    let hudEl = null, optsEl = null, fbEl = null, overEl = null;

    /* ---------------- render ---------------- */
    function buildBoard() {
        const rd = currentRound();
        boardEl.innerHTML = `
<div class="cf-hud" data-hud></div>
<div class="cf-stage">
  <div class="cf-paddock"><svg viewBox="0 0 640 420" aria-hidden="true">${scenerySvg()}${animalsSvg(rd)}${fenceSvg()}</svg></div>
  <div class="cf-question">${rd.target
                ? `<svg class="cf-qicon" viewBox="-44 -42 88 82" aria-hidden="true">${ART[rd.target]()}</svg><span>Berapa banyak ${KIND_LABEL[rd.target]}?</span>`
                : "<span>Berapa jumlah semua hewan?</span>"}</div>
  <div class="cf-opts" data-opts title="Keyboard: 1–3, panah + Enter">${rd.options.map((v, i) =>
                    `<button type="button" class="cf-opt" data-v="${v}" data-i="${i}" style="animation-delay:${i * 70}ms">${v}</button>`).join("")}</div>
  <div class="cf-fb" data-fb></div>
  <div class="cf-touch">
    <button type="button" class="cf-tbtn" data-nav="prev" aria-label="Pilihan sebelumnya">◀</button>
    <button type="button" class="cf-tbtn cf-tok" data-nav="ok" aria-label="Pilih jawaban">✔</button>
    <button type="button" class="cf-tbtn" data-nav="next" aria-label="Pilihan berikutnya">▶</button>
  </div>
  <div class="cf-over" data-over hidden></div>
</div>`;
        hudEl = boardEl.querySelector("[data-hud]");
        optsEl = boardEl.querySelector("[data-opts]");
        fbEl = boardEl.querySelector("[data-fb]");
        overEl = boardEl.querySelector("[data-over]");
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
        if (!state || !hudEl) return;
        const rd = currentRound();
        const mine = mySeat();
        const myTurn = state.phase === "playing" && state.turn === mine;

        const seatChip = (s) =>
            `<span class="cf-chip${state.turn === s && state.phase !== "over" ? " cf-active" : ""}">` +
            `<span class="cf-star">★</span><b>${state.stars[s]}</b>&nbsp;${esc(seatLabel(s))} (P${s + 1})</span>`;
        hudEl.innerHTML =
            `<span class="cf-chip">Ronde <b>${Math.min(state.roundNo, ROUNDS)}/${ROUNDS}</b></span>` +
            seatChip(0) + seatChip(1) +
            `<span class="cf-chip">Mulai: <b>${esc(seatLabel(state.starting))}</b></span>`;

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
            overEl.innerHTML = `
<div class="cf-over-card">
  <div class="cf-over-emoji">${draw ? "🤝" : win ? "🏆" : "🌱"}</div>
  <h3>${draw ? "Seri!" : win ? "Kamu menang!" : esc(seatLabel(state.winner)) + " menang"}</h3>
  <p>${esc(seatLabel(0))} ${state.stars[0]} ★ &nbsp;·&nbsp; ${state.stars[1]} ★ ${esc(seatLabel(1))}</p>
  <button class="game-action-button" type="button" data-act="restart">Main lagi</button>
</div>`;
            overEl.hidden = false;
        } else overEl.hidden = true;

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
    }

    function render() {
        if (!state || destroyed) return;
        const key = state.roundNo + ":" + state.seed;
        if (key !== uiKey) { uiKey = key; sel = 0; fiftyHidden = null; buildBoard(); }
        updateRoundUi();
    }

    function renderCheats() {
        const anyOn = cheats.reveal || cheats.auto || cheats.weakBot;
        cheatBtnEl.classList.toggle("cf-on", cheatOpen || anyOn);
        cheatsEl.hidden = !cheatOpen;
        if (!cheatOpen) return;
        const rd = state ? currentRound() : null;
        const fiftyOk = state && state.phase === "playing" && state.turn === mySeat() && !fiftyHidden;
        const tog = (key, label) =>
            `<div class="cf-cheat-row"><span>${label}</span><button type="button" data-cheat="${key}" class="${cheats[key === "weak" ? "weakBot" : key] ? "cf-on" : ""}" ${online ? "disabled" : ""}>${cheats[key === "weak" ? "weakBot" : key] ? "ON" : "OFF"}</button></div>`;
        cheatsEl.innerHTML = `
<h4>Cheat <button type="button" data-cheat="close" aria-label="Tutup cheat">✕</button></h4>
<div class="cf-cheat-row"><span>Lihat jawaban</span><button type="button" data-cheat="reveal" class="${cheats.reveal ? "cf-on" : ""}">${cheats.reveal ? "ON" : "OFF"}</button></div>
<div class="cf-cheat-row"><span>50:50 (buang 1 salah)</span><button type="button" data-cheat="fifty" ${fiftyOk ? "" : "disabled"}>Pakai</button></div>
${tog("auto", "Jawab otomatis")}
${tog("weak", "Bot lemah")}
<div class="cf-cheat-row"><span>+1 bintang (kamu)</span><button type="button" data-cheat="star" ${online ? "disabled" : ""}>Tambah</button></div>
<div class="cf-cheat-row"><span>Lewati giliran</span><button type="button" data-cheat="skip" ${online ? "disabled" : ""}>Lewati</button></div>
<p class="cf-note">${online ? "Mode online: hanya cheat tampilan (lihat jawaban & 50:50)." : "Semua cheat tersedia di mode solo vs Bot."}</p>`;
    }

    /* ---------------- alur permainan (otoritas: host / lokal) ---------------- */
    function clearTimers() {
        if (botTimer) { clearTimeout(botTimer); botTimer = null; }
        if (advanceTimer) { clearTimeout(advanceTimer); advanceTimer = null; }
        if (autoTimer) { clearTimeout(autoTimer); autoTimer = null; }
    }

    function publish() {
        render();
        if (online && room.isHost) room.publishState(state).catch(console.warn);
    }

    function scheduleActors() {
        if (botTimer) { clearTimeout(botTimer); botTimer = null; }
        if (autoTimer) { clearTimeout(autoTimer); autoTimer = null; }
        if (online || !state || state.phase !== "playing") return;
        if (state.turn === 1) {
            const delay = (cheats.weakBot ? 2600 : 1100) + Math.random() * 1400;
            botTimer = setTimeout(() => {
                botTimer = null;
                if (destroyed || !state || state.phase !== "playing" || state.turn !== 1) return;
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
            autoTimer = setTimeout(() => {
                autoTimer = null;
                if (destroyed || !state || state.phase !== "playing" || state.turn !== 0) return;
                applyAction({ type: "answer", value: currentRound().correct }, 0);
            }, 700);
        }
    }

    function afterStateChange() { publish(); scheduleActors(); }

    function advance() {
        advanceTimer = null;
        if (destroyed || !state) return;
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
            advanceTimer = setTimeout(advance, 1500);
            return;
        }
        /* Cheat yang mengubah state hanya boleh di mode solo (divalidasi di sini) */
        if (!online && action.type === "cheat-star") { state.stars[0]++; afterStateChange(); return; }
        if (!online && action.type === "cheat-skip" && state.phase === "playing") {
            clearTimers();
            state.lastPick = { seat: state.turn, value: null, correct: false, skipped: true };
            state.phase = "reveal";
            afterStateChange();
            advanceTimer = setTimeout(advance, 900);
        }
    }

    function submitAction(action) {
        if (online && !room.isHost) { room.sendAction(action).catch(console.warn); return; }
        applyAction(action, mySeat());
    }

    /* ---------------- input: mouse / keyboard / virtual button ---------------- */
    function pick(v) {
        if (!state || state.phase !== "playing" || state.turn !== mySeat()) return;
        if (v === fiftyHidden) return;
        const rd = currentRound();
        if (!rd.options.includes(v)) return;
        sel = rd.options.indexOf(v);
        updateSel();
        submitAction({ type: "answer", value: v });
    }

    function moveSel(d) {
        if (!state) return;
        const rd = currentRound();
        for (let k = 0; k < 3; k++) {
            sel = (sel + d + 3) % 3;
            if (rd.options[sel] !== fiftyHidden) break;
        }
        updateSel();
    }

    function doCheat(name) {
        if (name === "close") { cheatOpen = false; renderCheats(); return; }
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
        const t = event.target.closest("[data-exit],[data-act],[data-v],[data-cheat-toggle],[data-cheat],[data-nav]");
        if (!t) return;
        if (t.hasAttribute("data-exit")) { onExit(); return; }
        if (t.hasAttribute("data-cheat-toggle")) { cheatOpen = !cheatOpen; renderCheats(); return; }
        if (t.dataset.cheat) { doCheat(t.dataset.cheat); return; }
        if (t.dataset.act === "restart") { submitAction({ type: "restart" }); return; }
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
        if (!b || b.disabled || !state || state.phase !== "playing" || state.turn !== mySeat()) return;
        sel = parseInt(b.dataset.i, 10);
        updateSel();
    }

    function handleKey(event) {
        if (destroyed || event.ctrlKey || event.metaKey || event.altKey) return;
        const tag = event.target && event.target.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA") return;
        const k = event.key;
        if (k === "Escape") { if (cheatOpen) { cheatOpen = false; renderCheats(); event.preventDefault(); } return; }
        if ((k === "c" || k === "C") && !event.repeat) { cheatOpen = !cheatOpen; renderCheats(); return; }
        if ((k === "r" || k === "R") && !event.repeat) { submitAction({ type: "restart" }); return; }
        if (!state) return;
        if (k >= "1" && k <= "3") { pick(currentRound().options[Number(k) - 1]); event.preventDefault(); return; }
        if (k === "ArrowLeft") { moveSel(-1); event.preventDefault(); return; }
        if (k === "ArrowRight") { moveSel(1); event.preventDefault(); return; }
        if (k === "Enter" || k === " ") {
            if (state.phase === "over") submitAction({ type: "restart" });
            else pick(currentRound().options[sel]);
            event.preventDefault();
        }
    }

    root.addEventListener("click", handleClick);
    root.addEventListener("mouseover", handleHover);
    document.addEventListener("keydown", handleKey);

    /* ---------------- boot: langsung main, tanpa layar tutorial ---------------- */
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