/*
  ==== GAME: number-learning.js ====
  Number Learning - duel angka 12 soal (hitung benda, kata angka, tulis angka,
  hitung uang Rupiah, dll). Mode AI = lawan Bot, mode room = multiplayer.

  Cara pakai:
  1. Simpan file ini sebagai games/number-learning.js (id META = nama file).
  2. Jalankan: node tools/build-games-manifest.mjs
*/

import { iconSVG } from "../JS/icons.js";

export const META = {
    id: "number-learning", // harus sama dengan nama file (tanpa .js)
    name: "Number Learning",
    category: "educational",
    catLabel: "Educational",
    desc: "Duel 12 soal: hitung benda, baca & tulis angka, sampai menghitung uang Rupiah. Lawan Bot atau teman.",
    art: '<svg viewBox="0 0 48 48" width="54" height="54" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="8" width="40" height="32" rx="6" fill="#8b5cf6"/><text x="18" y="33" font-size="21" font-family="inherit" font-weight="800" text-anchor="middle" fill="#fff" stroke="none">7</text><circle cx="33" cy="18" r="3.4" fill="#fbbf24" stroke="none"/><circle cx="40" cy="18" r="3.4" fill="#fbbf24" stroke="none"/><circle cx="33" cy="25" r="3.4" fill="#fbbf24" stroke="none"/><circle cx="40" cy="25" r="3.4" fill="#fbbf24" stroke="none"/><circle cx="33" cy="32" r="3.4" fill="#fbbf24" stroke="none"/><circle cx="40" cy="32" r="3.4" fill="#fbbf24" stroke="none"/></svg>',
    bg: ["#ddd6fe", "#c4b5fd"],
    bestKey: "numberLearningBest",
};

/* ================= konstanta & data ================= */

const QUESTIONS = 12;
const LIVES = 3;
const MAX_N = 15;

/* Ganti array ini ke bahasa Inggris jika ingin konten bilingual. */
const NUM_WORDS = [
    "nol", "satu", "dua", "tiga", "empat", "lima", "enam", "tujuh",
    "delapan", "sembilan", "sepuluh", "sebelas", "dua belas", "tiga belas",
    "empat belas", "lima belas", "enam belas", "tujuh belas", "delapan belas",
    "sembilan belas", "dua puluh",
];

const SHAPE_KINDS = ["star", "circle", "triangle", "square", "heart"];
const SHAPE_NAMES = { star: "bintang", circle: "lingkaran", triangle: "segitiga", square: "kotak", heart: "hati" };
const TYPE_LABELS = {
    count: "Hitung Benda", word: "Kata ke Angka", spell: "Angka ke Kata",
    group: "Grup Titik", missing: "Angka Hilang", compare: "Bandingkan",
    add: "Penjumlahan", money: "Hitung Uang", write: "Tulis Angka",
};
const ALL_TYPES = ["count", "word", "spell", "group", "missing", "compare", "add", "money", "write"];
const COIN_TIERS = [[100, 200, 500], [100, 200, 500, 1000], [500, 1000, 2000, 5000]];
const COIN_COLORS = { 100: "#e4e4e7", 200: "#d4d4d8", 500: "#fde68a", 1000: "#fcd34d" };
const BILL_COLORS = { 2000: "#9ca3af", 5000: "#b45309", 10000: "#7c3aed" };
const CHEAT_DEFS = [
    ["reveal", "Bocorkan Jawaban", "Opsi yang benar ditandai garis putus-putus."],
    ["lives", "Nyawa Tak Terbatas", "Jawaban salah tidak mengurangi nyawamu."],
    ["botMiss", "Bot Selalu Salah", "Bot tidak pernah menjawab dengan benar."],
    ["auto", "Auto-Jawab", "Giliranmu dijawab otomatis dengan benar."],
];

/* ================= util murni (deterministik) ================= */

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

/* Difficulty ramp: soal 1-4 -> 1-5, 5-8 -> 1-10, 9-12 -> 1-15 */
function rangeFor(qi) {
    if (qi < 4) return 5;
    if (qi < 8) return 10;
    return 15;
}

function pick(rnd, arr) { return arr[Math.floor(rnd() * arr.length)]; }

function shuffle(arr, rnd) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(rnd() * (i + 1));
        const tmp = a[i]; a[i] = a[j]; a[j] = tmp;
    }
    return a;
}

/* 3 pengecoh unik, dekat dengan n, selalu >= 1 dan <= cap+4. Dijamin selesai. */
function distractors(n, rnd, cap) {
    const out = [];
    let guard = 0;
    while (out.length < 3 && guard++ < 120) {
        const d = n + Math.floor(rnd() * 9) - 4;
        if (d >= 1 && d <= cap + 4 && d !== n && out.indexOf(d) < 0) out.push(d);
    }
    let pool = [];
    for (let v = 1; v <= cap + 4; v++) if (v !== n && out.indexOf(v) < 0) pool.push(v);
    while (out.length < 3) {
        const v = pool[Math.floor(rnd() * pool.length)];
        out.push(v);
        pool = pool.filter((x) => x !== v);
    }
    return out;
}

function numOptions(n, rnd, cap) {
    const options = distractors(n, rnd, cap);
    const answerIndex = Math.floor(rnd() * 4);
    options.splice(answerIndex, 0, n);
    return { options, answerIndex };
}

function wordOptions(n, rnd, cap) {
    const ds = distractors(n, rnd, cap);
    const options = ds.map((d) => NUM_WORDS[d]);
    const answerIndex = Math.floor(rnd() * 4);
    options.splice(answerIndex, 0, NUM_WORDS[n]);
    return { options, answerIndex };
}

function moneyOptions(total, rnd, denoms) {
    const out = [];
    let guard = 0;
    while (out.length < 3 && guard++ < 80) {
        const step = pick(rnd, denoms);
        const d = total + (rnd() < 0.5 ? -step : step);
        if (d > 0 && d !== total && out.indexOf(d) < 0) out.push(d);
    }
    let k = 100;
    while (out.length < 3) {
        const d = total + k;
        if (d !== total && out.indexOf(d) < 0) out.push(d);
        k += 100;
    }
    const answerIndex = Math.floor(rnd() * 4);
    out.splice(answerIndex, 0, total);
    return { options: out, answerIndex };
}

function rupiah(n) {
    return "Rp" + String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

/* ================= generator soal (level acak yang pasti bisa diselesaikan) ================= */

function buildQuestion(type, qi, rnd) {
    const cap = rangeFor(qi);
    const n = 1 + Math.floor(rnd() * cap);
    if (type === "count") {
        const shape = pick(rnd, SHAPE_KINDS);
        const o = numOptions(n, rnd, cap);
        return { type, n, cap, shape, options: o.options, answerIndex: o.answerIndex, prompt: "Ada berapa " + SHAPE_NAMES[shape] + "?" };
    }
    if (type === "word") {
        const o = numOptions(n, rnd, cap);
        return { type, n, cap, options: o.options, answerIndex: o.answerIndex, prompt: "Angka berapakah \u201c" + NUM_WORDS[n] + "\u201d?" };
    }
    if (type === "spell") {
        const o = wordOptions(n, rnd, cap);
        return { type, n, cap, options: o.options, answerIndex: o.answerIndex, prompt: "Pilih kata yang tepat untuk angka ini." };
    }
    if (type === "group") {
        const ds = distractors(n, rnd, cap).slice(0, 2);
        const groups = shuffle([n, ds[0], ds[1]], rnd);
        return { type, n, cap, options: groups, answerIndex: groups.indexOf(n), prompt: "Kelompok mana yang berisi " + n + " titik?" };
    }
    if (type === "missing") {
        const start = 1 + Math.floor(rnd() * Math.max(1, cap - 3));
        const seq = [start, start + 1, start + 2, start + 3];
        const hide = Math.floor(rnd() * 4);
        const nn = seq[hide];
        const disp = seq.map((v, i) => (i === hide ? null : v));
        const o = numOptions(nn, rnd, cap);
        return { type, n: nn, cap, seq: disp, options: o.options, answerIndex: o.answerIndex, prompt: "Angka berapa yang hilang dari urutan?" };
    }
    if (type === "compare") {
        const left = 1 + Math.floor(rnd() * cap);
        let right = 1 + Math.floor(rnd() * cap);
        let g = 0;
        while (right === left && g++ < 40) right = 1 + Math.floor(rnd() * cap);
        if (right === left) right = (left % cap) + 1;
        return { type, cap, left, right, options: ["Kiri", "Kanan"], answerIndex: left > right ? 0 : 1, prompt: "Sisi mana yang titiknya lebih banyak?" };
    }
    if (type === "add") {
        const a = 1 + Math.floor(rnd() * (cap - 1));
        const b = 1 + Math.floor(rnd() * (cap - a));
        const nn = a + b;
        const o = numOptions(nn, rnd, cap);
        return { type, n: nn, cap, a, b, options: o.options, answerIndex: o.answerIndex, prompt: "Berapa hasil penjumlahannya?" };
    }
    if (type === "money") {
        const tier = qi < 4 ? 0 : qi < 8 ? 1 : 2;
        const denoms = COIN_TIERS[tier];
        const cnt = 2 + Math.floor(rnd() * (tier === 1 ? 3 : 2));
        const coins = [];
        for (let i = 0; i < cnt; i++) coins.push(pick(rnd, denoms));
        const total = coins.reduce((s, v) => s + v, 0);
        const o = moneyOptions(total, rnd, denoms);
        return { type, n: total, cap, coins, options: o.options, answerIndex: o.answerIndex, prompt: "Hitung uangnya \u2014 berapa jumlah totalnya?" };
    }
    /* write */
    const mode = rnd() < 0.5 ? "word" : "dots";
    return {
        type: "write", n, cap, mode,
        prompt: mode === "word" ? "Tulis angka untuk kata \u201c" + NUM_WORDS[n] + "\u201d." : "Hitung titiknya, lalu tulis angkanya.",
    };
}

/* Validasi: setiap soal punya tepat satu jawaban benar di antara opsinya. */
function validateQuestion(q) {
    if (!q || !q.type) return false;
    if (q.type === "write") return Number.isInteger(q.n) && q.n >= 1 && q.n <= MAX_N;
    if (q.type === "compare") return q.left !== q.right && q.options.length === 2 && q.answerIndex === (q.left > q.right ? 0 : 1);
    if (!Array.isArray(q.options) || q.options.length < 2) return false;
    if (q.answerIndex < 0 || q.answerIndex >= q.options.length) return false;
    if (new Set(q.options.map(String)).size !== q.options.length) return false;
    if (q.type === "spell") return q.options[q.answerIndex] === NUM_WORDS[q.n];
    if (q.type === "money") return q.options[q.answerIndex] === q.coins.reduce((s, v) => s + v, 0) && q.n === q.options[q.answerIndex];
    if (q.type === "group") return q.options[q.answerIndex] === q.n && q.options.every((v) => v >= 1 && v <= 20);
    return q.options[q.answerIndex] === q.n && q.n >= 1 && q.n <= 20;
}

/* Level = 12 soal. Semua 9 tipe dijamin muncul, tipe berurutan tidak kembar,
   dan setiap soal divalidasi (fallback ke soal hitung yang pasti valid). */
function makeLevel(seed) {
    const rnd = rng(seed);
    const pool = ALL_TYPES.slice();
    while (pool.length < QUESTIONS) pool.push(pick(rnd, ALL_TYPES));
    let sched = shuffle(pool, rnd);
    for (let t = 0; t < 40; t++) {
        if (!sched.some((v, i) => i > 0 && v === sched[i - 1])) break;
        sched = shuffle(pool, rnd);
    }
    return sched.map((type, i) => {
        const q = buildQuestion(type, i, rnd);
        return validateQuestion(q) ? q : buildQuestion("count", i, rnd);
    });
}

function isCorrect(q, value) {
    return q.type === "write" ? value === q.n : value === q.answerIndex;
}
function correctValue(q) { return q.type === "write" ? q.n : q.answerIndex; }
function wrongValue(q) {
    if (q.type === "write") {
        let d = q.n + (Math.random() < 0.5 ? -1 : 1) * (1 + Math.floor(Math.random() * 3));
        if (d < 0 || d === q.n) d = q.n + 2;
        return Math.min(99, d);
    }
    return (q.answerIndex + 1 + Math.floor(Math.random() * (q.options.length - 1))) % q.options.length;
}
function answerText(q) {
    if (q.type === "spell") return NUM_WORDS[q.n];
    if (q.type === "money") return rupiah(q.n);
    if (q.type === "compare") return q.options[q.answerIndex] + " (" + q.left + " vs " + q.right + ")";
    if (q.type === "write") return String(q.n);
    return q.n + " (" + NUM_WORDS[q.n] + ")";
}

/* ================= SVG & HTML helper ================= */

function esc(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function shapeSVG(kind) {
    if (kind === "circle") return '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="#8b5cf6" stroke="#6d28d9" stroke-width="1"/></svg>';
    if (kind === "triangle") return '<svg viewBox="0 0 24 24" aria-hidden="true"><polygon points="12,3 22,21 2,21" fill="#14b8a6" stroke="#0f766e" stroke-width="1"/></svg>';
    if (kind === "square") return '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="3" fill="#0ea5e9" stroke="#0369a1" stroke-width="1"/></svg>';
    if (kind === "heart") return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" fill="#f43f5e"/></svg>';
    return '<svg viewBox="0 0 24 24" aria-hidden="true"><polygon points="12,2 15,9 22,9.5 17,14.5 18.5,22 12,18 5.5,22 7,14.5 2,9.5 9,9" fill="#fbbf24" stroke="#b45309" stroke-width="1"/></svg>';
}

function dots(n, kind, sm) {
    let s = '<div class="nl-dots' + (sm ? " sm" : "") + '">';
    const one = shapeSVG(kind);
    for (let i = 0; i < n; i++) s += one;
    return s + "</div>";
}

function coinSVG(v) {
    const label = String(v).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
    if (v >= 2000) {
        const col = BILL_COLORS[v] || "#9ca3af";
        return '<svg viewBox="0 0 52 52" role="img" aria-label="uang ' + rupiah(v) + '"><rect x="3" y="12" width="46" height="28" rx="4" fill="' + col + '"/><rect x="7" y="16" width="38" height="20" rx="3" fill="none" stroke="#ffffff88" stroke-width="1.5"/><text x="26" y="21" text-anchor="middle" font-size="5.5" font-weight="700" fill="#ffffffcc" font-family="inherit">RUPIAH</text><text x="26" y="31" text-anchor="middle" font-size="' + (label.length > 5 ? 8 : 10) + '" font-weight="800" fill="#fff" font-family="inherit">' + label + "</text></svg>";
    }
    const col = COIN_COLORS[v] || "#e4e4e7";
    return '<svg viewBox="0 0 52 52" role="img" aria-label="koin ' + rupiah(v) + '"><circle cx="26" cy="26" r="21" fill="' + col + '" stroke="#00000022" stroke-width="1.5"/><circle cx="26" cy="26" r="16.5" fill="none" stroke="#ffffff99" stroke-width="1.5" stroke-dasharray="2.5 2"/><text x="26" y="19" text-anchor="middle" font-size="5.5" font-weight="700" fill="#52525b" font-family="inherit">RP</text><text x="26" y="31" text-anchor="middle" font-size="' + (v >= 1000 ? 9 : 11) + '" font-weight="800" fill="#3f3f46" font-family="inherit">' + label + "</text></svg>";
}

function heartSVG(full) {
    return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" fill="' + (full ? "#ef4444" : "#e2e8f0") + '"/></svg>';
}

function traceDigit(d) {
    return '<svg viewBox="0 0 30 36" aria-hidden="true"><text x="15" y="27" text-anchor="middle" font-size="26" font-weight="800" font-family="inherit" fill="none" stroke="#a78bfa" stroke-width="1.3" stroke-dasharray="3 2.4">' + d + "</text></svg>";
}

const BACK_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 5H9L3 12l6 7h12a1 1 0 0 0 1-1V6a1 1 0 0 0-1-1z"/><path d="M12 9l6 6M18 9l-6 6"/></svg>';

/* ================= CSS (minimalis, ter-scope .nlx) ================= */

const CSS = `
.nlx{--nl-bg:#f8fafc;--nl-card:#fff;--nl-ink:#0f172a;--nl-mut:#64748b;--nl-line:#e2e8f0;--nl-acc:#7c3aed;--nl-accsoft:#f5f3ff;--nl-good:#059669;--nl-goodsoft:#ecfdf5;--nl-bad:#dc2626;--nl-badsoft:#fef2f2;color:var(--nl-ink);font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
.nlx .game-panel{padding:0;background:transparent;border:0;box-shadow:none}
.nlx button{font-family:inherit;touch-action:manipulation;cursor:pointer}
.nlx kbd{background:var(--nl-bg);border:1px solid var(--nl-line);border-bottom-width:2px;border-radius:5px;padding:0 5px;font-family:inherit;font-size:10px;color:var(--nl-ink)}
.nlx .nl-shell{width:min(100%,640px);margin:0 auto;padding:8px;display:flex;flex-direction:column;gap:12px;flex:1 1 auto;min-height:0;justify-content:center;overflow:auto}
.nlx .nl-top{display:flex;align-items:stretch;gap:8px;min-width:0}
.nlx .nl-pcard{flex:1;background:var(--nl-card);border:1px solid var(--nl-line);border-radius:12px;padding:12px;display:flex;flex-direction:column;gap:4px;align-items:center;transition:border-color .18s,box-shadow .18s;min-width:0}
.nlx .nl-pcard.on{border-color:var(--nl-acc);box-shadow:0 0 0 3px var(--nl-accsoft)}
.nlx .nl-pname{font-size:12px;font-weight:600;color:var(--nl-mut);display:flex;gap:5px;align-items:center;max-width:100%}
.nlx .nl-pname b{color:var(--nl-ink);font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:110px}
.nlx .nl-tag{font-size:10px;background:var(--nl-accsoft);color:var(--nl-acc);border-radius:999px;padding:2px 8px;font-weight:700;flex:none}
.nlx .nl-pscore{font-size:26px;font-weight:800;line-height:1}
.nlx .nl-hearts{display:flex;gap:4px}
.nlx .nl-hearts svg{width:14px;height:14px}
.nlx .nl-vs{align-self:center;font-size:11px;font-weight:800;color:var(--nl-mut)}
.nlx .nl-meta{display:flex;align-items:center;gap:8px;font-size:12px;color:var(--nl-mut);flex-wrap:wrap}
.nlx .nl-badge{background:var(--nl-accsoft);color:var(--nl-acc);font-weight:700;border-radius:999px;padding:4px 12px;font-size:11px}
.nlx .nl-meta .nl-grow{flex:1}
.nlx .nl-progress{height:4px;border-radius:999px;background:var(--nl-line);overflow:hidden}
.nlx .nl-progress i{display:block;height:100%;background:var(--nl-acc);border-radius:999px;transition:width .2s}
.nlx .nl-stage{position:relative;min-width:0}
.nlx .nl-qcard{background:var(--nl-card);border:1px solid var(--nl-line);border-radius:14px;padding:16px;display:flex;flex-direction:column;gap:12px;min-width:0}
.nlx .nl-prompt{font-size:15px;font-weight:700;text-align:center;line-height:1.4}
.nlx .nl-display{background:var(--nl-bg);border:1px solid var(--nl-line);border-radius:12px;min-height:104px;padding:12px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;max-width:100%}
.nlx .nl-dots{display:flex;flex-wrap:wrap;justify-content:center;gap:8px;max-width:300px}
.nlx .nl-dots svg{width:22px;height:22px}
.nlx .nl-dots.sm{max-width:150px;gap:4px}
.nlx .nl-dots.sm svg{width:14px;height:14px}
.nlx .nl-word{font-size:30px;font-weight:800;color:var(--nl-acc)}
.nlx .nl-num{font-size:44px;font-weight:800}
.nlx .nl-eq{font-size:30px;font-weight:800}
.nlx .nl-eqdots{display:flex;align-items:center;gap:8px;flex-wrap:wrap;justify-content:center}
.nlx .nl-eqdots span{font-weight:800;color:var(--nl-mut)}
.nlx .nl-seq{display:flex;gap:8px;flex-wrap:wrap;justify-content:center}
.nlx .nl-seq b{width:44px;height:44px;display:grid;place-items:center;background:var(--nl-card);border:1px solid var(--nl-line);border-radius:10px;font-size:20px}
.nlx .nl-seq b.miss{border:2px dashed var(--nl-acc);color:var(--nl-acc);background:var(--nl-accsoft)}
.nlx .nl-cmp{display:flex;align-items:stretch;gap:8px;width:100%}
.nlx .nl-cmp>div{flex:1;display:flex;flex-direction:column;align-items:center;gap:8px;background:var(--nl-card);border:1px solid var(--nl-line);border-radius:10px;padding:12px 8px;min-width:0}
.nlx .nl-cmp label{font-size:11px;font-weight:700;color:var(--nl-mut)}
.nlx .nl-money{display:flex;flex-wrap:wrap;justify-content:center;gap:8px}
.nlx .nl-money svg{width:52px;height:52px}
.nlx .nl-buffer{font-size:38px;font-weight:800;letter-spacing:6px;min-height:44px;display:flex;align-items:center;flex-wrap:wrap;justify-content:center}
.nlx .nl-buffer i{width:3px;height:32px;background:var(--nl-acc);margin-left:2px;animation:nlblink 1s steps(1) infinite}
@keyframes nlblink{50%{opacity:0}}
.nlx .nl-opts{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}
.nlx .nl-opts.c2{grid-template-columns:repeat(2,minmax(0,1fr))}
.nlx .nl-opts.c3{grid-template-columns:repeat(3,minmax(0,1fr))}
.nlx .nl-opt{position:relative;border:1px solid var(--nl-line);background:var(--nl-card);color:var(--nl-ink);border-radius:10px;min-height:60px;padding:8px;font-size:22px;font-weight:800;cursor:pointer;touch-action:manipulation;-webkit-tap-highlight-color:transparent;transition:transform .12s,border-color .16s,background .16s}
.nlx .nl-opt::after{content:attr(data-key);position:absolute;top:4px;right:7px;font-size:9px;color:var(--nl-mut);font-weight:700}
.nlx .nl-opt.txt{font-size:15px}
.nlx .nl-opt:hover:not(:disabled){border-color:var(--nl-acc)}
.nlx .nl-opt:active:not(:disabled){transform:scale(.97)}
.nlx .nl-opt:disabled{cursor:default;opacity:.75}
.nlx .nl-opt.good{background:var(--nl-goodsoft);border-color:var(--nl-good);color:var(--nl-good);opacity:1}
.nlx .nl-opt.bad{background:var(--nl-badsoft);border-color:var(--nl-bad);color:var(--nl-bad);opacity:1}
.nlx .nl-opt.hint{border-style:dashed;border-color:var(--nl-acc);box-shadow:0 0 0 3px var(--nl-accsoft)}
.nlx .nl-opt:focus-visible,.nlx button:focus-visible{outline:2px solid var(--nl-acc);outline-offset:2px}
.nlx .nl-pad{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;max-width:300px;margin:0 auto;width:100%}
.nlx .nl-key{min-height:56px;font-size:20px;font-weight:800;border-radius:8px;border:1px solid var(--nl-line);background:var(--nl-card);color:var(--nl-ink);cursor:pointer;touch-action:manipulation;transition:transform .12s,border-color .16s;display:grid;place-items:center}
.nlx .nl-key:hover:not(:disabled){border-color:var(--nl-acc)}
.nlx .nl-key:active:not(:disabled){transform:scale(.96)}
.nlx .nl-key.ok{background:var(--nl-acc);border-color:var(--nl-acc);color:#fff;font-size:15px}
.nlx .nl-key:disabled{opacity:.5;cursor:default}
.nlx .nl-key svg{width:22px;height:22px}
.nlx .nl-fb{min-height:24px;text-align:center;font-size:14px;font-weight:700;line-height:1.4}
.nlx .nl-fb.good{color:var(--nl-good)}
.nlx .nl-fb.bad{color:var(--nl-bad)}
.nlx .nl-fb.mut{color:var(--nl-mut);font-weight:600}
.nlx .nl-kbd{display:flex;justify-content:center;gap:12px;font-size:11px;color:var(--nl-mut);flex-wrap:wrap}
@media (pointer:coarse){.nlx .nl-kbd{display:none}.nlx .nl-opt::after{content:none}}
.nlx .nl-ov{position:absolute;inset:0;background:rgba(248,250,252,.96);display:grid;place-items:center;z-index:30;border-radius:14px;padding:12px;overflow:auto}
.nlx .nl-ovcard{background:var(--nl-card);border:1px solid var(--nl-line);border-radius:14px;box-shadow:0 8px 24px rgba(15,23,42,.1);padding:20px;width:min(100%,430px);max-height:100%;overflow:auto;text-align:center}
.nlx .nl-ovcard.left{text-align:left}
.nlx .nl-ovcard h3{margin:0 0 8px;font-size:20px}
.nlx .nl-ovcard h4{margin:16px 0 8px;font-size:12px;text-transform:uppercase;letter-spacing:.06em;color:var(--nl-acc)}
.nlx .nl-ovcard p{margin:8px 0;font-size:13.5px;color:var(--nl-mut);line-height:1.55}
.nlx .nl-ovhead{display:flex;justify-content:space-between;align-items:center;gap:8px}
.nlx .nl-x{border:1px solid var(--nl-line);background:var(--nl-bg);border-radius:8px;width:36px;height:36px;min-width:36px;cursor:pointer;font-size:13px;color:var(--nl-mut);flex:none}
.nlx .nl-x:hover{color:var(--nl-ink);border-color:var(--nl-acc)}
.nlx .nl-btn{border:1px solid var(--nl-acc);background:var(--nl-acc);color:#fff;border-radius:8px;min-height:44px;padding:8px 16px;font-size:14px;font-weight:700;cursor:pointer;transition:filter .16s,transform .12s}
.nlx .nl-btn:hover:not(:disabled){filter:brightness(1.08)}
.nlx .nl-btn:active:not(:disabled){transform:scale(.97)}
.nlx .nl-btn.ghost{background:var(--nl-card);color:var(--nl-ink);border:1px solid var(--nl-line)}
.nlx .nl-btn:disabled{opacity:.5;cursor:default}
.nlx .nl-btnrow{display:flex;gap:8px;justify-content:center;margin-top:12px;flex-wrap:wrap}
.nlx .nl-list{margin:8px 0;padding-left:18px;font-size:13px;color:var(--nl-mut);line-height:1.6}
.nlx .nl-list b{color:var(--nl-ink)}
.nlx .nl-chart{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:8px;margin-top:8px}
.nlx .nl-cell{background:var(--nl-bg);border:1px solid var(--nl-line);border-radius:8px;padding:8px 2px;display:flex;flex-direction:column;align-items:center;gap:4px}
.nlx .nl-cell svg{width:30px;height:36px}
.nlx .nl-cell span{font-size:10px;color:var(--nl-mut);font-weight:600}
.nlx .nl-teen{font-size:11.5px;color:var(--nl-mut);margin-top:8px;line-height:1.7}
.nlx .nl-teen b{color:var(--nl-ink)}
.nlx .nl-ref{display:flex;flex-wrap:wrap;gap:8px}
.nlx .nl-ref figure{margin:0;display:flex;flex-direction:column;align-items:center;gap:4px}
.nlx .nl-ref svg{width:44px;height:44px}
.nlx .nl-ref figcaption{font-size:10px;color:var(--nl-mut);font-weight:600}
.nlx .nl-keys{width:100%;border-collapse:collapse;font-size:12.5px}
.nlx .nl-keys td{padding:8px;border-bottom:1px solid var(--nl-line);color:var(--nl-mut)}
.nlx .nl-keys td:first-child{white-space:nowrap}
.nlx .nl-cheatrow{display:flex;align-items:center;justify-content:space-between;gap:12px;min-height:48px;padding:8px 0;border:0;border-bottom:1px solid var(--nl-line);cursor:pointer;background:none;width:100%;text-align:left;color:var(--nl-ink)}
.nlx .nl-cheatrow b{font-size:13.5px;display:block}
.nlx .nl-cheatrow small{font-size:11.5px;color:var(--nl-mut);display:block}
.nlx .nl-sw{width:40px;height:24px;border:1px solid var(--nl-line);border-radius:999px;background:var(--nl-line);position:relative;flex:none;transition:background .18s}
.nlx .nl-sw::after{content:"";position:absolute;top:3px;left:3px;width:16px;height:16px;border-radius:50%;background:#fff;transition:left .18s}
.nlx .nl-sw.on{background:var(--nl-acc);border-color:var(--nl-acc)}
.nlx .nl-sw.on::after{left:19px}
.nlx .nl-stats{display:flex;gap:8px;justify-content:center;margin-top:12px;flex-wrap:wrap}
.nlx .nl-stat{background:var(--nl-bg);border:1px solid var(--nl-line);border-radius:10px;padding:8px 12px;min-width:86px}
.nlx .nl-stat b{font-size:20px;display:block}
.nlx .nl-stat span{font-size:11px;color:var(--nl-mut)}
.nlx .nl-win{color:var(--nl-good)}
.nlx .nl-lose{color:var(--nl-bad)}
/* ---- shell: HUD + board penuh + overlay sebagai modal ---- */
.nlx .nlx-hud{display:flex;align-items:center;gap:6px 8px;flex-wrap:wrap;padding:8px 10px;background:var(--nl-card);border:1px solid var(--nl-line);border-radius:12px;font:700 11px/1.3 ui-monospace,SFMono-Regular,Menlo,monospace}
.nlx .nlx-chip{display:inline-flex;align-items:center;gap:5px;padding:5px 9px;border:1px solid var(--nl-line);border-radius:999px;background:var(--nl-bg);color:var(--nl-mut);white-space:nowrap}
.nlx .nlx-chip b{color:var(--nl-ink)}
.nlx .nlx-pchip{gap:6px}
.nlx .nlx-pchip.on{border-color:var(--nl-acc);background:var(--nl-accsoft);color:var(--nl-acc)}
.nlx .nlx-pchip.on b{color:var(--nl-acc)}
.nlx .nlx-pname{max-width:92px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:700}
.nlx .nlx-hearts{display:inline-flex;gap:2px}
.nlx .nlx-hearts svg{width:12px;height:12px}
.nlx .nlx-lives{display:none}
.nlx .nlx-status i{width:7px;height:7px;border-radius:50%;background:var(--nl-mut);flex:none}
.nlx .nlx-status.live i{background:var(--nl-good)}
.nlx .nlx-spacer{flex:1 1 auto}
.nlx .nlx-btn{display:inline-flex;align-items:center;gap:5px;padding:5px 9px;min-height:30px;border:1px solid var(--nl-line);border-radius:8px;background:var(--nl-card);color:var(--nl-ink);font-family:inherit;font-size:11px;font-weight:700;line-height:1.3;cursor:pointer;touch-action:manipulation}
.nlx .nlx-btn svg{flex:none;display:block}
.nlx .nlx-btn:hover:not(:disabled){border-color:var(--nl-acc);color:var(--nl-acc)}
.nlx .nlx-btn.on{border-color:var(--nl-acc);color:var(--nl-acc)}
.nlx .nlx-btn:disabled{opacity:.4;cursor:default}
.nlx .nlx-board{position:relative;display:flex;flex-direction:column;min-height:0;overflow:hidden}
.nlx .nl-ovcard{display:flex;flex-direction:column;overflow:hidden}
.nlx .nl-ovbody{flex:1 1 auto;min-height:0;overflow:auto}
.nlx .nl-ovfoot{flex:none}
@media (max-width:520px){
.nlx .nl-opts{grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}
.nlx .nl-opts.c3{grid-template-columns:repeat(3,minmax(0,1fr))}
.nlx .nl-opt{min-height:56px;font-size:20px}
.nlx .nl-key{min-height:56px}
.nlx .nl-word{font-size:26px}
.nlx .nl-pname b{max-width:72px}
.nlx .nl-shell{gap:8px}
.nlx .nl-qcard{padding:12px;gap:8px}
.nlx .nl-display{min-height:88px}
.nlx .nl-ovcard{padding:16px}
.nlx .nl-buffer{font-size:32px;letter-spacing:4px}
}
@media (pointer:coarse){
.nlx .nl-x{width:44px;height:44px;min-width:44px}
.nlx .nl-sw{width:52px;height:44px}
.nlx .nl-sw::after{top:12px;width:20px;height:20px}
.nlx .nl-sw.on::after{left:29px}
}
@media (prefers-reduced-motion:reduce){.nlx *{animation-duration:.01ms!important;animation-delay:0s!important;transition-duration:.01ms!important}}
/* ---- final overrides: spesifisitas tinggi, urutan paling akhir ---- */
@media (max-width:640px){
.nlx.game-fill > .nlx-board{min-height:min(70dvh,620px)}
.nlx .nlx-hud{gap:5px;padding:6px 8px}
.nlx .nlx-hud .nlx-chip{padding:4px 6px;font-size:9px}
.nlx .nlx-hud .nlx-chip[data-hud="typewrap"],
.nlx .nlx-hud .nlx-chip[data-hud="rangewrap"],
.nlx .nlx-hud .nlx-chip[data-hud="bestwrap"]{display:none}
.nlx .nlx-hud .nlx-hearts{display:none}
.nlx .nlx-hud .nlx-lives{display:inline-flex}
.nlx .nlx-hud .nlx-btn{min-height:32px;padding:5px 8px;font-size:9px}
.nlx .nlx-hud .nlx-btn-label,
.nlx .nlx-hud .nlx-spacer{display:none}
.nlx .nl-ov{padding:8px}
.nlx .nl-ovcard{width:100%;height:100%;max-height:100%;padding:12px}
.nlx .nl-ovbody{scrollbar-width:none}
.nlx .nl-ovbody::-webkit-scrollbar{display:none}
}
@media (pointer:coarse){
.nlx .nlx-hud .nlx-btn{min-height:32px;padding:5px 8px}
}
`;

/* ================= mount ================= */

export function mount(root, context = {}) {
    const { mode = "ai", room = null, playerName = "Player", onExit = () => { } } = context;
    const online = mode === "room" && Boolean(room);
    const playerIndex = online && !room.isHost ? 1 : 0;
    let roomData = room?.room || null;
    let state = null;
    let destroyed = false;
    let timers = [];
    const offs = [];
    let seenHelp = true;
    try { seenHelp = localStorage.getItem("numberLearningHelpSeen") === "1"; } catch (e) { seenHelp = true; }
    if (!seenHelp) {
        try { localStorage.setItem("numberLearningHelpSeen", "1"); } catch (e) { /* storage blocked */ }
    }
    const ui = {
        help: !seenHelp, cheat: false, paused: false, buffer: "", cheatUsed: false,
        schedKey: null, lastQi: -1, lastRound: -1,
        cheats: { reveal: false, lives: false, botMiss: false, auto: false },
    };

    root.innerHTML = `
<style>${CSS}</style>
<div class="game-app nlx game-fill">
  <div class="nlx-hud" role="toolbar" aria-label="Kontrol permainan">
    <span class="nlx-chip nlx-pchip" data-pchip="0"><span class="nlx-pname" data-pname="0">Kamu</span><b data-pscore="0">0</b><span class="nlx-hearts" data-phearts="0"></span></span>
    <span class="nlx-chip nlx-pchip" data-pchip="1"><span class="nlx-pname" data-pname="1">Bot</span><b data-pscore="1">0</b><span class="nlx-hearts" data-phearts="1"></span></span>
    <span class="nlx-chip">SOAL <b data-hud="qi">1/${QUESTIONS}</b></span>
    <span class="nlx-chip" data-hud="typewrap">TIPE <b data-hud="type">—</b></span>
    <span class="nlx-chip" data-hud="rangewrap">ANGKA <b data-hud="range">1–5</b></span>
    <span class="nlx-chip" data-hud="bestwrap" ${online ? "hidden" : ""}>REKOR <b data-hud="best">0</b></span>
    <span class="nlx-chip nlx-lives">NYAWA <b data-hud="lives">${LIVES}–${LIVES}</b></span>
    <span class="nlx-chip nlx-status" data-statuswrap><i></i><span data-status>Siap</span></span>
    <span class="nlx-spacer"></span>
    <button class="nlx-btn" type="button" data-help aria-label="How to play" title="How to play (H)">${iconSVG("helpCircle", { size: 14 })}<span class="nlx-btn-label">Help</span></button>
    <button class="nlx-btn" type="button" data-act="cheat" aria-label="Cheats" ${online ? 'disabled title="Cheat hanya untuk mode vs Bot"' : 'title="Cheats (C)"'}>${iconSVG("wrench", { size: 14 })}<span class="nlx-btn-label">Cheats</span></button>
    <button class="nlx-btn" type="button" data-act="pause" data-pause-btn aria-label="Pause" title="Pause (P)">${iconSVG("pause", { size: 14 })}<span class="nlx-btn-label">Pause</span></button>
    <button class="nlx-btn" type="button" data-act="restart" aria-label="Restart" title="Restart (R)">${iconSVG("refresh", { size: 14 })}<span class="nlx-btn-label">Restart</span></button>
    <button class="nlx-btn" type="button" data-exit aria-label="Exit game" title="Exit game">${iconSVG("logOut", { size: 14 })}<span class="nlx-btn-label">Exit</span></button>
  </div>
  <section class="game-panel nlx-board" data-board>
    <div class="nl-shell" data-content></div>
    <div class="nl-ov" data-ov="ready" hidden><div class="nl-ovcard" data-ready></div></div>
    <div class="nl-ov" data-ov="over" hidden><div class="nl-ovcard" data-over></div></div>
    <div class="nl-ov" data-ov="cheat" hidden><div class="nl-ovcard left" data-cheatbox></div></div>
    <div class="nl-ov" data-ov="help" hidden><div class="nl-ovcard left" data-helpbox></div></div>
    <div class="nl-ov" data-ov="pause" hidden>
      <div class="nl-ovcard">
        <h3>Dijeda</h3><p>Timer dan giliran bot dihentikan sementara.</p>
        <div class="nl-btnrow nl-ovfoot"><button type="button" class="nl-btn" data-act="resume">Lanjutkan <kbd>P</kbd></button></div>
      </div>
    </div>
  </section>
</div>`;

    const $ = (sel) => root.querySelector(sel);
    const board = $("[data-board]");
    const contentEl = $("[data-content]");
    const statusWrap = $("[data-statuswrap]");
    const pauseBtn = $("[data-pause-btn]");
    const ovReady = $('[data-ov="ready"]'), ovOver = $('[data-ov="over"]');
    const ovCheat = $('[data-ov="cheat"]'), ovHelp = $('[data-ov="help"]'), ovPause = $('[data-ov="pause"]');
    const readyBox = $("[data-ready]"), overBox = $("[data-over]");
    const cheatBox = $("[data-cheatbox]"), helpBox = $("[data-helpbox]");

    /* ---------- overlay toggle ---------- */
    function toggleHelp(on) {
        ui.help = typeof on === "boolean" ? on : !ui.help;
        if (ui.help) {
            ui.cheat = false;
            if (ui.paused) { ui.paused = false; thawTimers(); }
        }
        render();
    }
    function toggleCheat(on) {
        if (online) return;
        ui.cheat = typeof on === "boolean" ? on : !ui.cheat;
        if (ui.cheat) {
            ui.help = false;
            if (ui.paused) { ui.paused = false; thawTimers(); }
        }
        render();
    }
    function togglePause(on) {
        ui.paused = typeof on === "boolean" ? on : !ui.paused;
        if (ui.paused) {
            ui.help = false;
            ui.cheat = false;
            freezeTimers();
        } else {
            thawTimers();
        }
        render();
    }

    /* ---------- timer aman: bisa dijeda & dilanjutkan tanpa loncat ---------- */
    function armTimer(t) {
        t.due = Date.now() + t.remaining;
        t.id = setTimeout(() => {
            timers = timers.filter((x) => x !== t);
            if (!destroyed && !ui.paused) t.fn();
        }, t.remaining);
    }
    function schedule(fn, ms) {
        const t = { fn, remaining: Math.max(0, ms), due: 0, id: null };
        timers.push(t);
        armTimer(t);
    }
    function clearTimers() { timers.forEach((t) => clearTimeout(t.id)); timers = []; }
    function freezeTimers() {
        const now = Date.now();
        timers.forEach((t) => { clearTimeout(t.id); t.remaining = Math.max(0, t.due - now); t.id = null; });
    }
    function thawTimers() { timers.forEach((t) => { if (t.id == null) armTimer(t); }); }

    /* ---------- state & skor ---------- */
    function best() {
        try { return Number(localStorage.getItem(META.bestKey)) || 0; } catch (e) { return 0; }
    }
    function saveBest() {
        if (online || ui.cheatUsed) return;
        try {
            if (state.scores[0] > best()) localStorage.setItem(META.bestKey, String(state.scores[0]));
        } catch (e) { /* storage tidak tersedia */ }
    }
    function mySeat() { return state ? (online ? state.seats[playerIndex] : 0) : 0; }
    function seatName(s) {
        if (!state) return "";
        if (!online) return s === 0 ? "Kamu" : "Bot";
        return state.seats[s] === playerIndex ? (playerName || "Kamu") : "Lawan";
    }
    function cur() { return state.questions[Math.min(state.qi, QUESTIONS - 1)]; }
    function canAnswer() {
        return Boolean(state) && state.phase === "playing" && !state.answered && state.turn === mySeat() && !ui.paused;
    }
    function statusText() {
        if (!state) return "Menunggu";
        if (state.phase === "ready") return "Siap";
        if (state.phase === "over") return "Selesai";
        return canAnswer() ? "Giliranmu" : "Giliran " + seatName(state.turn);
    }

    /* ---------- render ---------- */
    function hearts(n) {
        let s = "";
        for (let i = 0; i < LIVES; i++) s += heartSVG(i < n);
        return s;
    }
    function displayHTML(q) {
        if (q.type === "count") return dots(q.n, q.shape, false);
        if (q.type === "word") return '<div class="nl-word">\u201c' + NUM_WORDS[q.n] + '\u201d</div>';
        if (q.type === "spell" || q.type === "group") return '<div class="nl-num">' + q.n + "</div>";
        if (q.type === "missing") {
            return '<div class="nl-seq">' + q.seq.map((v) => v === null ? '<b class="miss">?</b>' : "<b>" + v + "</b>").join("") + "</div>";
        }
        if (q.type === "compare") {
            return '<div class="nl-cmp"><div><label>KIRI</label>' + dots(q.left, "circle", false) + "</div>" +
                "<div><label>KANAN</label>" + dots(q.right, "circle", false) + "</div></div>";
        }
        if (q.type === "add") {
            return '<div class="nl-eq">' + q.a + " + " + q.b + ' = ?</div><div class="nl-eqdots">' +
                dots(q.a, "circle", true) + "<span>+</span>" + dots(q.b, "circle", true) + "</div>";
        }
        if (q.type === "money") return '<div class="nl-money">' + q.coins.map(coinSVG).join("") + "</div>";
        /* write */
        const a = state.answered;
        const shown = a ? String(a.skipped ? q.n : a.value) : ui.buffer;
        const top = q.mode === "word" ? '<div class="nl-word">\u201c' + NUM_WORDS[q.n] + '\u201d</div>' : dots(q.n, "circle", false);
        return top + '<div class="nl-buffer" aria-label="angka yang ditulis">' + esc(shown) + (canAnswer() ? "<i></i>" : "") + "</div>";
    }
    function padHTML() {
        const dis = !canAnswer();
        const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "back", "0", "ok"];
        return '<div class="nl-pad">' + keys.map((k) => {
            if (k === "back") return '<button type="button" class="nl-key" data-act="key" data-k="back" aria-label="Hapus digit"' + (dis || !ui.buffer ? " disabled" : "") + ">" + BACK_SVG + "</button>";
            if (k === "ok") return '<button type="button" class="nl-key ok" data-act="key" data-k="ok"' + (dis || !ui.buffer ? " disabled" : "") + ">Jawab</button>";
            return '<button type="button" class="nl-key" data-act="key" data-k="' + k + '"' + (dis ? " disabled" : "") + ">" + k + "</button>";
        }).join("") + "</div>";
    }
    function optsHTML(q) {
        if (q.type === "write") return padHTML();
        const dis = !canAnswer();
        const a = state.answered;
        const cls = q.type === "group" ? "c3" : (q.type === "spell" || q.type === "money" || q.type === "compare") ? "c2" : "";
        return '<div class="nl-opts ' + cls + '">' + q.options.map((o, i) => {
            let c = "nl-opt";
            let inner;
            if (q.type === "group") inner = dots(o, "circle", true);
            else if (q.type === "money") { c += " txt"; inner = rupiah(o); }
            else if (q.type === "spell" || q.type === "compare") { c += " txt"; inner = esc(o); }
            else inner = o;
            if (a) {
                if (i === q.answerIndex) c += " good";
                else if (a.value === i && !a.correct) c += " bad";
            } else if (!online && ui.cheats.reveal && canAnswer() && i === q.answerIndex) c += " hint";
            return '<button type="button" class="' + c + '" data-act="opt" data-i="' + i + '" data-key="' + (i + 1) + '"' + (dis ? " disabled" : "") + ">" + inner + "</button>";
        }).join("") + "</div>";
    }
    function fbHTML() {
        const a = state.answered;
        if (state.phase === "ready") return '<div class="nl-fb mut">Tekan Mulai untuk bermain.</div>';
        if (state.phase === "over") return '<div class="nl-fb mut">Permainan selesai.</div>';
        if (!a) {
            const t = canAnswer()
                ? (cur().type === "write" ? "Ketik angkanya, lalu tekan Jawab." : "Pilih jawaban yang benar.")
                : "Menunggu giliran " + esc(seatName(state.turn)) + "\u2026";
            return '<div class="nl-fb mut">' + t + "</div>";
        }
        if (a.skipped) return '<div class="nl-fb mut">Soal dilewati (cheat).</div>';
        if (a.correct) return '<div class="nl-fb good" role="status">Benar! ' + esc(answerText(cur())) + "</div>";
        return '<div class="nl-fb bad" role="status">Belum tepat' + (a.protected ? " (nyawa dilindungi cheat)" : "") + ". Jawaban: " + esc(answerText(cur())) + "</div>";
    }
    function readyHTML() {
        return "<h3>Number Learning</h3>" +
            "<p>Duel 12 soal bergantian (masing-masing 6 soal). Benar +1 poin, salah \u22121 nyawa. Skor tertinggi menang!</p>" +
            "<p>Undian koin: <b>" + esc(seatName(state.first)) + "</b> jalan duluan." +
            (online ? "<br>Kamu bermain sebagai <b>Pemain " + (mySeat() + 1) + "</b> (posisi diundi acak)." : "") + "</p>" +
            '<div class="nl-btnrow"><button type="button" class="nl-btn" data-act="start">Mulai Bermain</button>' +
            '<button type="button" class="nl-btn ghost" data-act="help">Cara Bermain</button></div>';
    }
    function overHTML() {
        const w = state.winner;
        const title = w === -1 ? "Seri!" : online ? seatName(w) + " Menang!" : w === 0 ? "Kamu Menang!" : "Bot Menang";
        const cls = w === -1 ? "" : w === mySeat() ? "nl-win" : "nl-lose";
        return '<h3 class="' + cls + '">' + esc(title) + "</h3><p>" + esc(state.reason) + "</p>" +
            '<div class="nl-stats"><div class="nl-stat"><b>' + state.scores[0] + "\u2013" + state.scores[1] + "</b><span>Skor " + esc(seatName(0)) + " vs " + esc(seatName(1)) + "</span></div>" +
            '<div class="nl-stat"><b>' + state.lives[0] + "\u2013" + state.lives[1] + "</b><span>Nyawa tersisa</span></div></div>" +
            (!online ? "<p>" + (ui.cheatUsed ? "Cheat digunakan \u2014 rekor tidak dicatat." : "Rekor terbaik: " + best() + "/6 soal benar.") + "</p>" : "") +
            '<div class="nl-btnrow"><button type="button" class="nl-btn" data-act="restart">Main Lagi</button>' +
            '<button type="button" class="nl-btn ghost" data-act="help">Cara Bermain</button></div>';
    }
    function helpHTML() {
        const chart = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((d) => '<div class="nl-cell">' + traceDigit(d) + "<span>" + NUM_WORDS[d] + "</span></div>").join("");
        const teens = [10, 11, 12, 13, 14, 15].map((n) => "<b>" + n + "</b> " + NUM_WORDS[n]).join(" \u00b7 ");
        const money = [100, 200, 500, 1000, 2000, 5000, 10000].map((v) => "<figure>" + coinSVG(v) + "<figcaption>" + rupiah(v) + "</figcaption></figure>").join("");
        return '<div class="nl-ovhead"><h3>Cara Bermain</h3><button type="button" class="nl-x" data-act="close" aria-label="Tutup">' + iconSVG("x", { size: 14 }) + "</button></div>" +
            '<div class="nl-ovbody"><h4>Aturan Duel</h4><ul class="nl-list">' +
            "<li>12 soal dijawab <b>bergantian</b> \u2014 undian koin menentukan siapa jalan duluan.</li>" +
            "<li>Jawaban benar <b>+1 poin</b>; salah <b>\u22121 nyawa</b> (masing-masing 3 nyawa).</li>" +
            "<li>Menang jika skor lebih tinggi setelah 12 soal, atau lawan kehabisan nyawa. Skor seri? Sisa nyawa menentukan.</li>" +
            "<li>Level naik otomatis: soal 1\u20134 angka 1\u20135, soal 5\u20138 angka 1\u201310, soal 9\u201312 angka 1\u201315.</li>" +
            (online ? "<li>Multiplayer: posisi Pemain 1/2 diundi acak setiap permainan.</li>" : "<li>Mode solo: kamu melawan Bot. Tombol Cheat tersedia untuk berlatih.</li>") +
            "</ul><h4>Jenis Soal</h4><ul class=\"nl-list\">" +
            "<li><b>Hitung Benda</b> \u2014 hitung bintang/lingkaran/dll, pilih angkanya.</li>" +
            "<li><b>Kata ke Angka</b> \u2014 baca kata seperti \u201ctujuh\u201d, pilih simbolnya.</li>" +
            "<li><b>Angka ke Kata</b> \u2014 lihat angka, pilih kata yang tepat.</li>" +
            "<li><b>Grup Titik</b> \u2014 pilih kelompok dengan jumlah titik yang diminta.</li>" +
            "<li><b>Angka Hilang</b> \u2014 lengkapi urutan, mis. 3, 4, ?, 6.</li>" +
            "<li><b>Bandingkan</b> \u2014 pilih sisi dengan titik lebih banyak.</li>" +
            "<li><b>Penjumlahan</b> \u2014 jumlahkan dua kelompok benda.</li>" +
            "<li><b>Tulis Angka</b> \u2014 ketik sendiri angkanya (latihan menulis!).</li>" +
            "<li><b>Hitung Uang</b> \u2014 jumlahkan koin &amp; uang kertas Rupiah.</li>" +
            "</ul><h4>Cara Menulis Angka</h4>" +
            "<p>Ingat bentuk tiap angka: mulai dari atas, ikuti garisnya, tulis dari kiri ke kanan. Tiru garis putus-putus di bawah ini, lalu latih lewat soal <b>Tulis Angka</b>.</p>" +
            '<div class="nl-chart">' + chart + '</div><p class="nl-teen">' + teens + "</p>" +
            "<h4>Mengenal Uang Rupiah</h4><div class=\"nl-ref\">" + money + "</div>" +
            "<p>Jumlahkan semua nilai yang terlihat. Contoh: 500 + 200 + 100 = <b>Rp800</b>.</p>" +
            "<h4>Kontrol</h4><table class=\"nl-keys\">" +
            "<tr><td><kbd>1</kbd>\u2013<kbd>4</kbd></td><td>Pilih jawaban</td></tr>" +
            "<tr><td><kbd>0</kbd>\u2013<kbd>9</kbd> / keypad</td><td>Menulis angka (soal Tulis Angka)</td></tr>" +
            "<tr><td><kbd>Enter</kbd></td><td>Kirim jawaban / mulai / main lagi</td></tr>" +
            "<tr><td><kbd>Backspace</kbd></td><td>Hapus digit</td></tr>" +
            "<tr><td><kbd>\u2190</kbd><kbd>\u2192</kbd> + <kbd>Enter</kbd></td><td>Pindah fokus &amp; pilih (mouse juga bisa)</td></tr>" +
            "<tr><td><kbd>H</kbd> / <kbd>C</kbd> / <kbd>R</kbd></td><td>Bantuan / Cheat / Main ulang</td></tr>" +
            "<tr><td><kbd>P</kbd> / <kbd>Esc</kbd></td><td>Jeda (hentikan timer &amp; bot) / tutup overlay</td></tr></table>" +
            "<p>Di HP: semua tombol besar &amp; ramah sentuh \u2014 cukup ketuk. Keypad virtual muncul otomatis untuk soal menulis.</p></div>" +
            '<div class="nl-btnrow nl-ovfoot"><button type="button" class="nl-btn" data-act="close">Mengerti!</button></div>';
    }
    function cheatHTML() {
        const rows = CHEAT_DEFS.map((c) =>
            '<button type="button" class="nl-cheatrow" data-act="toggle" data-c="' + c[0] + '"><span><b>' + c[1] + "</b><small>" + c[2] + '</small></span><span class="nl-sw' + (ui.cheats[c[0]] ? " on" : "") + '"></span></button>'
        ).join("");
        const can = canAnswer();
        return '<div class="nl-ovhead"><h3>Cheat</h3><button type="button" class="nl-x" data-act="close" aria-label="Tutup">' + iconSVG("x", { size: 14 }) + "</button></div>" +
            '<div class="nl-ovbody"><p>Mode latihan vs Bot. Jika cheat dipakai, rekor terbaik tidak disimpan.</p>' + rows + "</div>" +
            '<div class="nl-btnrow nl-ovfoot"><button type="button" class="nl-btn" data-act="solve"' + (can ? "" : " disabled") + ">Jawab Benar Sekarang</button>" +
            '<button type="button" class="nl-btn ghost" data-act="skip"' + (can ? "" : " disabled") + ">Lewati Soal</button></div>" +
            '<div class="nl-btnrow nl-ovfoot"><button type="button" class="nl-btn ghost" data-act="close">Tutup</button></div>';
    }

    function render() {
        if (!board || !contentEl) return;
        if (!state) {
            contentEl.innerHTML = '<div class="nl-qcard"><div class="nl-fb mut">Menunggu host menyiapkan permainan\u2026</div></div>';
        } else {
            const q = cur();
            const kbd = q.type === "write"
                ? "<span><kbd>0\u20139</kbd> tulis</span><span><kbd>Backspace</kbd> hapus</span><span><kbd>Enter</kbd> jawab</span>"
                : "<span><kbd>1\u20134</kbd> pilih</span><span><kbd>\u2190\u2192</kbd> fokus</span>";
            contentEl.innerHTML =
                '<div class="nl-qcard">' +
                '<div class="nl-progress" data-progress><i style="width:0%"></i></div>' +
                '<div class="nl-prompt">' + esc(q.prompt) + "</div>" +
                '<div class="nl-display">' + displayHTML(q) + "</div>" +
                optsHTML(q) + fbHTML() +
                '<div class="nl-kbd">' + kbd + "<span><kbd>H</kbd> bantuan</span>" +
                (!online ? "<span><kbd>C</kbd> cheat</span><span><kbd>P</kbd> jeda</span>" : "<span><kbd>P</kbd> jeda</span>") +
                "<span><kbd>R</kbd> ulang</span></div>" +
                "</div>";
        }
        if (helpBox && !helpBox.dataset.ready) {
            helpBox.innerHTML = helpHTML();
            helpBox.dataset.ready = "1";
        }
        syncUI();
    }

    /* Semua info hidup di HUD; papan hanya konten soal + overlay. */
    function syncUI() {
        const s = state;
        const set = (sel, text) => { const el = $(sel); if (el) el.textContent = text; };
        for (let i = 0; i < 2; i++) {
            const chip = $('[data-pchip="' + i + '"]');
            if (chip) chip.classList.toggle("on", Boolean(s && s.phase === "playing" && s.turn === i));
            const you = Boolean(s && online && s.seats[i] === playerIndex);
            set('[data-pname="' + i + '"]', (s ? seatName(i) : i === 0 ? "Kamu" : "Bot") +
                (online ? " P" + (i + 1) : "") + (you ? " (kamu)" : ""));
            set('[data-pscore="' + i + '"]', s ? String(s.scores[i]) : "0");
            const hp = $('[data-phearts="' + i + '"]');
            if (hp) hp.innerHTML = hearts(s ? s.lives[i] : LIVES);
        }
        set('[data-hud="qi"]', s ? Math.min(s.qi + 1, QUESTIONS) + "/" + QUESTIONS : "—/" + QUESTIONS);
        set('[data-hud="type"]', s ? TYPE_LABELS[cur().type] : "—");
        set('[data-hud="range"]', s ? "1–" + rangeFor(Math.min(s.qi, QUESTIONS - 1)) : "—");
        set('[data-hud="best"]', online ? "—" : String(best()));
        set('[data-hud="lives"]', s ? s.lives[0] + "–" + s.lives[1] : LIVES + "–" + LIVES);
        set("[data-status]", statusText());
        if (statusWrap) statusWrap.classList.toggle("live", Boolean(s && s.phase === "playing" && !ui.paused));
        const progress = $("[data-progress] i");
        if (progress) progress.style.width = (s && s.phase === "over" ? 100 : s ? Math.round((s.qi / QUESTIONS) * 100) : 0) + "%";

        const lock = ui.help || ui.paused;
        if (ovReady) {
            ovReady.hidden = lock || ui.cheat || !s || s.phase !== "ready";
            if (!ovReady.hidden && readyBox) readyBox.innerHTML = readyHTML();
        }
        if (ovOver) {
            ovOver.hidden = lock || ui.cheat || !s || s.phase !== "over";
            if (!ovOver.hidden && overBox) overBox.innerHTML = overHTML();
        }
        if (ovCheat) {
            ovCheat.hidden = lock || !ui.cheat || online;
            if (!ovCheat.hidden && cheatBox) cheatBox.innerHTML = cheatHTML();
        }
        if (ovHelp) ovHelp.hidden = !ui.help;
        if (ovPause) ovPause.hidden = !ui.paused;

        if (pauseBtn) {
            const want = ui.paused ? "play" : "pause";
            if (pauseBtn.dataset.iconState !== want) {
                pauseBtn.dataset.iconState = want;
                const ico = pauseBtn.querySelector("svg");
                if (ico) ico.outerHTML = iconSVG(want, { size: 14 });
                const label = pauseBtn.querySelector(".nlx-btn-label");
                if (label) label.textContent = ui.paused ? "Resume" : "Pause";
            }
            pauseBtn.setAttribute("aria-label", ui.paused ? "Resume" : "Pause");
        }
        const cheatBtn = $('[data-act="cheat"]');
        if (cheatBtn) {
            cheatBtn.classList.toggle("on", ui.cheat);
            cheatBtn.setAttribute("aria-pressed", String(ui.cheat));
        }
    }

    function publish() {
        render();
        ensureSchedules();
        if (online && room.isHost) room.publishState(state).catch(console.warn);
    }

    /* ---------- giliran bot & auto-jawab (hanya mode AI, hanya otoritas) ---------- */
    function ensureSchedules() {
        if (online || ui.paused || !state || state.phase !== "playing" || state.answered) return;
        const key = state.roundId + ":" + state.qi + ":" + state.turn;
        if (ui.schedKey === key) return;
        const rid = state.roundId, qiSnap = state.qi;
        if (state.turn === 1) {
            ui.schedKey = key;
            schedule(() => {
                if (state && state.roundId === rid && state.qi === qiSnap) botMove();
            }, 1100 + Math.random() * 1500);
        } else if (state.turn === 0 && ui.cheats.auto) {
            ui.schedKey = key;
            ui.cheatUsed = true;
            schedule(() => {
                if (state && state.roundId === rid && state.qi === qiSnap && state.phase === "playing" && !state.answered && state.turn === 0) {
                    applyAction({ type: "answer", value: correctValue(cur()) }, 0);
                }
            }, 700);
        }
    }
    function botMove() {
        if (ui.paused || !state || state.phase !== "playing" || state.answered || state.turn !== 1) return;
        const q = cur();
        const p = Math.max(0.5, 0.82 - state.qi * 0.03);
        const smart = !ui.cheats.botMiss && Math.random() < p;
        applyAction({ type: "answer", value: smart ? correctValue(q) : wrongValue(q) }, 1);
    }
    function scheduleAdvance(ms) {
        const rid = state.roundId, qiSnap = state.qi;
        schedule(() => {
            if (!ui.paused && state && state.roundId === rid && state.qi === qiSnap && state.phase === "playing" && state.answered) advance();
        }, ms);
    }

    /* ---------- alur permainan ---------- */
    function advance() {
        const loser = state.lives[0] <= 0 ? 0 : state.lives[1] <= 0 ? 1 : -1;
        if (loser >= 0) {
            finish(1 - loser, seatName(loser) + " kehabisan nyawa di soal " + (state.qi + 1) + ".");
            return;
        }
        state.qi++;
        if (state.qi >= QUESTIONS) { finishByScore(); return; }
        state.turn = 1 - state.turn;
        state.answered = null;
        ui.buffer = "";
        publish();
    }
    function finishByScore() {
        const s0 = state.scores[0], s1 = state.scores[1];
        const l0 = state.lives[0], l1 = state.lives[1];
        if (s0 !== s1) finish(s0 > s1 ? 0 : 1, "Skor akhir " + s0 + "\u2013" + s1 + ".");
        else if (l0 !== l1) finish(l0 > l1 ? 0 : 1, "Skor seri " + s0 + "\u2013" + s1 + " \u2014 sisa nyawa menentukan (" + l0 + " vs " + l1 + ").");
        else finish(-1, "Skor " + s0 + "\u2013" + s1 + " dan nyawa sama \u2014 hasil seri!");
    }
    function finish(winner, reason) {
        state.phase = "over";
        state.winner = winner;
        state.reason = reason;
        saveBest();
        publish();
    }
    function newGame() {
        clearTimers();
        ui.buffer = "";
        ui.schedKey = null;
        ui.cheat = false;
        ui.paused = false;
        const seed = (Math.random() * 0x7fffffff) >>> 0;
        /* Multiplayer: posisi pemain diundi acak. Semua mode: yang jalan duluan diundi. */
        const seats = online ? (Math.random() < 0.5 ? [0, 1] : [1, 0]) : [0, 1];
        const first = Math.floor(Math.random() * 2);
        state = {
            v: 1,
            roundId: Date.now() + Math.floor(Math.random() * 10000),
            seed,
            phase: "ready",
            seats,
            first,
            turn: first,
            qi: 0,
            scores: [0, 0],
            lives: [LIVES, LIVES],
            answered: null,
            questions: makeLevel(seed),
            winner: null,
            reason: "",
        };
        publish();
    }

    /* ---------- aksi (divalidasi di otoritas: host / lokal) ---------- */
    function applyAction(action, actor) {
        if (!state || !action || typeof action.type !== "string") return;
        const seat = state.seats[actor];
        if (action.type === "start") {
            if (state.phase === "ready") { state.phase = "playing"; publish(); }
            return;
        }
        if (action.type === "restart") { newGame(); return; }
        if (action.type === "skip") {
            if (!online && state.phase === "playing" && !state.answered && seat === state.turn && seat === 0) {
                state.answered = { seat, value: null, correct: false, skipped: true, protected: false };
                publish();
                scheduleAdvance(800);
            }
            return;
        }
        if (action.type === "answer") {
            if (state.phase !== "playing" || state.answered || seat !== state.turn) return;
            const q = cur();
            const value = Number.parseInt(action.value, 10);
            if (!Number.isInteger(value)) return;
            if (q.type === "write") { if (value < 0 || value > 99) return; }
            else if (value < 0 || value >= q.options.length) return;
            const ok = isCorrect(q, value);
            const prot = !online && seat === 0 && ui.cheats.lives && !ok;
            if (ok) state.scores[seat]++;
            else if (!prot) state.lives[seat]--;
            state.answered = { seat, value, correct: ok, skipped: false, protected: prot };
            publish();
            scheduleAdvance(ok ? 1100 : 1700);
        }
    }
    function submitAction(action) {
        if (online && !room.isHost) { room.sendAction(action).catch(console.warn); return; }
        applyAction(action, playerIndex);
    }

    /* ---------- input: mouse / sentuh ---------- */
    function handleClick(event) {
        if (event.target.closest("[data-help]")) { toggleHelp(); return; }
        if (event.target.closest("[data-exit]")) { clearTimers(); onExit(); return; }
        const el = event.target.closest("[data-act]");
        if (!el || el.disabled) return;
        const act = el.dataset.act;
        if (act === "start" || act === "restart") { submitAction({ type: act }); return; }
        if (act === "help" || act === "help-close") { toggleHelp(); return; }
        if (act === "cheat") { toggleCheat(); return; }
        if (act === "pause") { togglePause(); return; }
        if (act === "resume") { togglePause(false); return; }
        if (act === "close") { ui.help = false; ui.cheat = false; render(); return; }
        if (ui.paused || ui.help) return;
        if (act === "opt") { if (canAnswer()) submitAction({ type: "answer", value: Number(el.dataset.i) }); return; }
        if (act === "key") {
            if (!canAnswer() || cur().type !== "write") return;
            const key = el.dataset.k;
            if (key === "back") ui.buffer = ui.buffer.slice(0, -1);
            else if (key === "ok") {
                if (ui.buffer) { submitAction({ type: "answer", value: Number(ui.buffer) }); ui.buffer = ""; render(); }
                return;
            } else if (ui.buffer.length < 2) ui.buffer += key;
            render();
            return;
        }
        if (act === "toggle") {
            if (online || !ui.cheat) return;
            const c = el.dataset.c;
            ui.cheats[c] = !ui.cheats[c];
            if (ui.cheats[c]) ui.cheatUsed = true;
            render();
            ensureSchedules();
            return;
        }
        if (act === "skip") {
            if (!online && ui.cheat && canAnswer()) { ui.cheatUsed = true; ui.cheat = false; submitAction({ type: "skip" }); }
            return;
        }
        if (act === "solve") {
            if (!online && ui.cheat && canAnswer()) { ui.cheatUsed = true; ui.cheat = false; submitAction({ type: "answer", value: correctValue(cur()) }); }
        }
    }

    /* ---------- input: keyboard desktop ---------- */
    function onKey(e) {
        if (destroyed || !root.isConnected) return;
        if (e.ctrlKey || e.metaKey || e.altKey) return;
        const t = e.target;
        if (t && t.closest && t.closest("input,textarea,select,[contenteditable=true]")) return;
        const k = e.key;
        /* Prioritas: help → cheats → pause → Escape → aksi game. */
        if (k === "h" || k === "H") { toggleHelp(); e.preventDefault(); return; }
        if (ui.help) {
            if (k === "Escape" || k === "Enter") { toggleHelp(false); e.preventDefault(); }
            return;
        }
        if (k === "c" || k === "C") { if (!online) { toggleCheat(); e.preventDefault(); } return; }
        if (ui.cheat) {
            if (k === "Escape" || k === "Enter") { toggleCheat(false); e.preventDefault(); }
            return;
        }
        if (k === "p" || k === "P") { togglePause(); e.preventDefault(); return; }
        if (ui.paused) {
            if (k === "Escape" || k === "Enter") { togglePause(false); e.preventDefault(); }
            return;
        }
        if (k === "Escape") return;
        if (k === "r" || k === "R") { submitAction({ type: "restart" }); e.preventDefault(); return; }
        if (!state) return;
        if (state.phase === "ready" && k === "Enter") { submitAction({ type: "start" }); e.preventDefault(); return; }
        if (state.phase === "over" && k === "Enter") { submitAction({ type: "restart" }); e.preventDefault(); return; }
        if (!canAnswer()) return;
        const q = cur();
        if (q.type === "write") {
            if (/^[0-9]$/.test(k)) {
                if (ui.buffer.length < 2) { ui.buffer += k; render(); }
                e.preventDefault();
            } else if (k === "Backspace") {
                ui.buffer = ui.buffer.slice(0, -1); render(); e.preventDefault();
            } else if (k === "Enter") {
                if (ui.buffer) { submitAction({ type: "answer", value: Number(ui.buffer) }); ui.buffer = ""; render(); }
                e.preventDefault();
            }
            return;
        }
        if (/^[1-4]$/.test(k)) {
            const i = Number(k) - 1;
            if (i < q.options.length) { submitAction({ type: "answer", value: i }); e.preventDefault(); }
            return;
        }
        if (k === "ArrowLeft" || k === "ArrowRight") {
            const btns = Array.from(board.querySelectorAll('[data-act="opt"]')).filter((b) => !b.disabled);
            if (btns.length) {
                const idx = btns.indexOf(document.activeElement);
                const next = k === "ArrowRight" ? (idx + 1) % btns.length : (idx - 1 + btns.length) % btns.length;
                btns[next].focus();
                e.preventDefault();
            }
        }
    }

    root.addEventListener("click", handleClick);
    document.addEventListener("keydown", onKey);

    /* ---------- init: mode AI (vs Bot) atau room (multiplayer) ---------- */
    if (online) {
        const offRoom = room.onRoom((nextRoom) => { roomData = nextRoom; render(); });
        if (typeof offRoom === "function") offs.push(offRoom);
        if (room.isHost) {
            const offAct = room.onAction((action) => applyAction(action, 1));
            if (typeof offAct === "function") offs.push(offAct);
            newGame();
        } else {
            const offState = room.onState((nextState) => {
                if (!nextState) return;
                state = nextState;
                if (ui.lastRound !== state.roundId || ui.lastQi !== state.qi) {
                    ui.buffer = "";
                    ui.lastRound = state.roundId;
                    ui.lastQi = state.qi;
                }
                render();
            });
            if (typeof offState === "function") offs.push(offState);
            render();
        }
    } else {
        newGame();
    }

    return {
        destroy() {
            destroyed = true;
            clearTimers();
            root.removeEventListener("click", handleClick);
            document.removeEventListener("keydown", onKey);
            offs.forEach((off) => { try { off(); } catch (e) { /* abaikan */ } });
        },
    };
}