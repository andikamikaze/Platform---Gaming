/* ==== games/alphabet-learning.js ====
   ES-module template: export mount(root, context).
   Daftarkan metadata + path modul ini di GAMES pada app.js.

   Modes: Learn (26 huruf), Challenge (20 benar / 60 dtk),
   VS Bot & Multiplayer race (first to 7, giliran & seat acak).
   11 tipe soal, semuanya dijamin punya tepat satu jawaban benar.
*/

import { iconSVG } from "../JS/icons.js";

export const META = {
    id: "alphabet-learning",
    name: "Alphabet Learning",
    category: "educational",
    catLabel: "Educational",
    desc: "Learn every letter: match shapes, upper and lower case, A-Z order.",
    art: `<svg viewBox="0 0 48 48" width="54" height="54" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="8" width="40" height="32" rx="6" fill="#10b981"/><text x="15" y="32" font-size="19" font-family="inherit" font-weight="800" text-anchor="middle" fill="#fff" stroke="none">A</text><text x="31" y="32" font-size="19" font-family="inherit" font-weight="800" text-anchor="middle" fill="#d1fae5" stroke="none">a</text><path d="M36 6l4 4-4 4" stroke="#fff" stroke-width="3" fill="none"/><path d="M40 10H28" stroke="#fff" stroke-width="3" fill="none"/></svg>`,
    bg: ["#a7f3d0", "#6ee7b7"],
};

/* ---------------- data ---------------- */
const LETTER_NAMES = ["ay", "bee", "see", "dee", "ee", "eff", "gee", "aitch", "eye", "jay", "kay", "ell", "em", "en", "oh", "pee", "cue", "ar", "ess", "tee", "you", "vee", "double-you", "ex", "why", "zee"];
const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("").map((ch, i) => ({ ch, lower: ch.toLowerCase(), name: LETTER_NAMES[i] }));
const VOWELS = "AEIOU";
const CONSONANTS = "BCDFGHJKLMNPQRSTVWXYZ";

/* buah / sayur / hewan / benda — setiap huruf A-Z punya minimal 1 kata */
const WORDS = [
    ["Apple", "fruit"], ["Ant", "animal"], ["Axe", "object"],
    ["Banana", "fruit"], ["Bear", "animal"], ["Bag", "object"],
    ["Carrot", "vegetable"], ["Cat", "animal"], ["Cup", "object"],
    ["Date", "fruit"], ["Dog", "animal"], ["Door", "object"],
    ["Eggplant", "vegetable"], ["Elephant", "animal"], ["Eraser", "object"],
    ["Fig", "fruit"], ["Fox", "animal"], ["Fan", "object"],
    ["Grape", "fruit"], ["Goat", "animal"], ["Glass", "object"],
    ["Hen", "animal"], ["Hammer", "object"], ["Hat", "object"],
    ["Igloo", "object"], ["Iguana", "animal"],
    ["Jacket", "object"], ["Jaguar", "animal"],
    ["Kiwi", "fruit"], ["Koala", "animal"], ["Kite", "object"],
    ["Lemon", "fruit"], ["Lion", "animal"], ["Lamp", "object"],
    ["Mango", "fruit"], ["Monkey", "animal"], ["Mug", "object"],
    ["Nail", "object"], ["Newt", "animal"],
    ["Orange", "fruit"], ["Owl", "animal"], ["Onion", "vegetable"],
    ["Pear", "fruit"], ["Pig", "animal"], ["Pen", "object"],
    ["Quail", "animal"], ["Quilt", "object"],
    ["Rabbit", "animal"], ["Radish", "vegetable"], ["Ring", "object"],
    ["Spinach", "vegetable"], ["Snake", "animal"], ["Spoon", "object"],
    ["Tomato", "fruit"], ["Tiger", "animal"], ["Table", "object"],
    ["Umbrella", "object"], ["Uniform", "object"],
    ["Van", "object"], ["Vulture", "animal"],
    ["Watermelon", "fruit"], ["Whale", "animal"], ["Watch", "object"],
    ["Xylophone", "object"],
    ["Yak", "animal"], ["Yo-yo", "object"],
    ["Zebra", "animal"], ["Zucchini", "vegetable"],
];
const WORDS_BY_LETTER = {};
for (const [w, tag] of WORDS) {
    const k = w[0].toUpperCase();
    (WORDS_BY_LETTER[k] = WORDS_BY_LETTER[k] || []).push({ w, tag });
}

/* urutan goresan huruf kapital (viewBox 0 0 100 145) */
const O_PATH = "M50 15 C22 15 15 40 15 72 C15 105 22 130 50 130 C78 130 85 105 85 72 C85 40 78 15 50 15";
const STROKES = {
    A: ["M15 130 L50 15", "M50 15 L85 130", "M30 88 L70 88"],
    B: ["M25 15 L25 130", "M25 15 H58 Q82 15 82 43 Q82 70 58 70 H25", "M25 70 H62 Q88 70 88 100 Q88 130 62 130 H25"],
    C: ["M82 36 Q70 15 50 15 Q18 15 18 72 Q18 130 50 130 Q70 130 82 109"],
    D: ["M25 15 L25 130", "M25 15 H45 Q85 15 85 72 Q85 130 45 130 H25"],
    E: ["M25 15 L25 130", "M25 15 H76", "M25 72 H66", "M25 130 H76"],
    F: ["M25 15 L25 130", "M25 15 H76", "M25 72 H66"],
    G: ["M82 36 Q70 15 50 15 Q18 15 18 72 Q18 130 50 130 Q80 130 82 106 V86", "M82 86 H56"],
    H: ["M22 15 L22 130", "M78 15 L78 130", "M22 72 H78"],
    I: ["M50 15 L50 130", "M30 15 H70", "M30 130 H70"],
    J: ["M65 15 V104 Q65 130 42 130 Q20 130 20 106"],
    K: ["M25 15 L25 130", "M76 15 L25 76", "M40 62 L78 130"],
    L: ["M25 15 L25 130 H78"],
    M: ["M18 130 L18 15", "M18 15 L50 92", "M50 92 L82 15", "M82 15 L82 130"],
    N: ["M22 130 L22 15", "M22 15 L78 130", "M78 130 L78 15"],
    O: [O_PATH],
    P: ["M25 130 L25 15", "M25 15 H60 Q85 15 85 45 Q85 75 60 75 H25"],
    Q: [O_PATH, "M60 96 L88 132"],
    R: ["M25 130 L25 15", "M25 15 H60 Q85 15 85 45 Q85 75 60 75 H25", "M52 75 L82 130"],
    S: ["M78 32 Q68 15 48 15 Q22 15 22 40 Q22 62 50 70 Q78 78 78 102 Q78 130 50 130 Q28 130 20 112"],
    T: ["M20 15 H80", "M50 15 L50 130"],
    U: ["M22 15 V95 Q22 130 50 130 Q78 130 78 95 V15"],
    V: ["M18 15 L50 130", "M50 130 L82 15"],
    W: ["M12 15 L30 130", "M30 130 L50 42", "M50 42 L70 130", "M70 130 L88 15"],
    X: ["M22 15 L78 130", "M78 15 L22 130"],
    Y: ["M20 15 L50 70", "M80 15 L50 70", "M50 70 L50 130"],
    Z: ["M22 15 H78", "M78 15 L22 130", "M22 130 H78"],
};

/* ---------------- konstanta permainan ---------------- */
const LEARN_TARGET = 26;
const CHALLENGE_TIME = 60;
const CHALLENGE_TARGET = 20;
const RACE_TARGET = 7;
const WRITE_PASS = 0.7;
const TYPES_ALL = ["match", "case", "case2", "next", "prev", "gap", "name", "word", "wordpick", "vowel", "write"];
const TYPES_FAST = TYPES_ALL.filter((t) => t !== "write");

/* ---------------- pure helpers ---------------- */
function rng(seed) {
    let a = seed >>> 0;
    return function () {
        a |= 0; a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
const idx = (ch) => ch.charCodeAt(0) - 65;
const pickOne = (arr, rnd) => arr[Math.floor(rnd() * arr.length)];
function shuffle(arr, rnd) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(rnd() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}
const sample = (arr, n, rnd) => shuffle(arr, rnd).slice(0, n);

function distractors(target, rnd) {
    const SIM = { B: "PR", P: "BR", R: "PB", M: "WN", W: "MN", N: "MW", C: "GO", G: "CO", O: "CQ", Q: "OG", E: "F", F: "E", I: "LT", L: "IT", T: "IL", U: "VY", V: "UY", Y: "UV", D: "O", Z: "S", S: "Z" };
    const pool = new Set(SIM[target] || "");
    for (let d = -3; d <= 3; d++) {
        const k = idx(target) + d;
        if (k >= 0 && k < 26) pool.add(ALPHABET[k].ch);
    }
    pool.delete(target);
    const arr = Array.from(pool);
    const out = [];
    while (out.length < 3 && arr.length) out.push(arr.splice(Math.floor(rnd() * arr.length), 1)[0]);
    while (out.length < 3) {
        const c = ALPHABET[Math.floor(rnd() * 26)].ch;
        if (c !== target && out.indexOf(c) < 0) out.push(c);
    }
    return out;
}

/* Generator soal: target di-clamp per tipe agar SELALU bisa diselesaikan
   (next tak pernah A, prev tak pernah Z, gap selalu B..Y),
   opsi dijamin unik dengan tepat satu jawaban benar. */
function makeQuestion(rnd, type, forceTarget) {
    let ti = Number.isInteger(forceTarget) && forceTarget >= 0 && forceTarget < 26
        ? forceTarget : Math.floor(rnd() * 26);
    if (type === "next") ti = Math.max(1, ti);
    if (type === "prev") ti = Math.min(24, ti);
    if (type === "gap") ti = Math.min(24, Math.max(1, ti));
    const t = ALPHABET[ti];
    let display = t.ch, prompt = "", tag = null, kind = null, options = [], answerIndex = 0;
    const letterOptions = () => {
        const opts = distractors(t.ch, rnd);
        answerIndex = Math.floor(rnd() * 4);
        opts.splice(answerIndex, 0, t.ch);
        return opts;
    };
    switch (type) {
        case "match": prompt = "Tap the same letter"; options = letterOptions(); break;
        case "case": prompt = "Tap the small letter"; options = letterOptions().map((c) => c.toLowerCase()); break;
        case "case2": display = t.lower; prompt = "Tap the capital letter"; options = letterOptions(); break;
        case "next": display = ALPHABET[ti - 1].ch + " ?"; prompt = "Tap the next letter"; options = letterOptions(); break;
        case "prev": display = "? " + ALPHABET[ti + 1].ch; prompt = "Tap the letter before"; options = letterOptions(); break;
        case "gap": display = ALPHABET[ti - 1].ch + " _ " + ALPHABET[ti + 1].ch; prompt = "Tap the missing letter"; options = letterOptions(); break;
        case "name": display = t.name; prompt = "Which letter has this name?"; options = letterOptions(); break;
        case "word": {
            const e = pickOne(WORDS_BY_LETTER[t.ch], rnd);
            display = e.w; tag = e.tag; prompt = "Tap the first letter"; options = letterOptions(); break;
        }
        case "wordpick": {
            prompt = "Tap the word that starts here";
            const e = pickOne(WORDS_BY_LETTER[t.ch], rnd);
            const pool = shuffle(WORDS.filter((x) => x[0][0].toUpperCase() !== t.ch), rnd);
            const seen = new Set(); const others = [];
            for (const x of pool) {
                const k = x[0][0].toUpperCase();
                if (seen.has(k)) continue;
                seen.add(k); others.push(x[0]);
                if (others.length === 3) break;
            }
            answerIndex = Math.floor(rnd() * 4);
            options = others; options.splice(answerIndex, 0, e.w); break;
        }
        case "vowel": {
            kind = rnd() < 0.5 ? "vowel" : "consonant";
            display = "?"; prompt = "Tap the " + kind;
            const good = pickOne((kind === "vowel" ? VOWELS : CONSONANTS).split(""), rnd);
            options = sample((kind === "vowel" ? CONSONANTS : VOWELS).split(""), 3, rnd);
            answerIndex = Math.floor(rnd() * 4);
            options.splice(answerIndex, 0, good); break;
        }
        case "write": prompt = "Trace this letter"; options = []; answerIndex = -1; break;
        default: return makeQuestion(rnd, "match", ti);
    }
    return { type, target: t.ch, display, prompt, options, answerIndex, tag, kind };
}

function nextUnlearned(learned, rnd) {
    const open = [];
    for (let i = 0; i < 26; i++) if (!learned[i]) open.push(i);
    if (!open.length) return -1;
    const cut = Math.max(1, Math.ceil(open.length / 3));
    return open[Math.floor(rnd() * cut)];
}

function buildQuestion(mode, learned, rnd) {
    let target = -1;
    if (mode === "learn" && rnd() < 0.75) target = nextUnlearned(learned, rnd);
    if (target < 0) target = Math.floor(rnd() * 26);
    const pool = (mode === "challenge" ? TYPES_FAST : TYPES_ALL).filter((t) => {
        if (t === "next") return target > 0;
        if (t === "prev") return target < 25;
        if (t === "gap") return target > 0 && target < 25;
        return true;
    });
    return makeQuestion(rnd, pool[Math.floor(rnd() * pool.length)], target);
}

function isCorrect(q, choice) { return choice === q.options[q.answerIndex]; }

/* ---------------- mount ---------------- */

export function mount(root, context = {}) {
    const { mode = "ai", room = null, playerName = "Player", onExit = () => { } } = context;
    const online = mode === "room" && Boolean(room);
    const playerIndex = online && !room.isHost ? 1 : 0; /* seat dasar; posisi final diacak via state.seatSwap */
    let roomData = room?.room || null;
    let state = null;

    const unsubs = [];
    let tickTimer = null, advanceTimer = null, botTimer = null, autoTimer = null;
    let renderKey = "", menuKey = "", overKey = "", focusIdx = 0;
    let cheatOpen = false, writeOpen = false, soundOn = true, guideLetter = "A";
    let helpOpen = false, paused = false;
    let seenHelp = true;
    try { seenHelp = localStorage.getItem("alphabetLearningHelpSeen") === "1"; } catch (err) { seenHelp = true; }
    if (!seenHelp) {
        helpOpen = true;
        try { localStorage.setItem("alphabetLearningHelpSeen", "1"); } catch (err) { /* storage blocked */ }
    }
    const cheats = { reveal: false, auto: false, freeze: false, botweak: false };

    const seatOf = (base) => (state && state.seatSwap ? 1 - base : base);
    const mySeat = () => seatOf(playerIndex);
    const botSeat = () => 1 - mySeat();
    const isRace = () => state && (state.mode === "bot" || state.mode === "versus");

    function initialState(m) {
        return {
            phase: "menu", mode: m, seatSwap: false, first: 0, turn: 0,
            scores: [0, 0], learned: new Array(26).fill(false), wrong: 0,
            timeLeft: CHALLENGE_TIME, seq: 0, q: null, locked: false, last: null,
            winner: null, reason: "",
        };
    }

    /* ---------- shell (minimalist) ---------- */
    root.innerHTML = `
<style>
.alx{--ink:#171a20;--mut:#8a919e;--line:#e7e9ee;--bg:#f7f8fa;--card:#fff;--acc:#10b981;--bad:#ef4444;--r:12px;color:var(--ink);font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
.alx *{box-sizing:border-box}
.alx button{font:inherit;color:inherit;cursor:pointer;touch-action:manipulation}
.alx :focus-visible{outline:2px solid var(--acc);outline-offset:2px}
.alx-app{--ink:#171a20;--mut:#8a919e;--line:#e7e9ee;--bg:#f7f8fa;--card:#fff;--acc:#10b981;--bad:#ef4444;--r:12px;color:var(--ink);font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
.alx-board{position:relative;padding:0;overflow:hidden}
.alx-hud{display:flex;flex-wrap:wrap;align-items:center;gap:8px 12px;margin-bottom:8px;padding:8px 12px;background:var(--card);border:1px solid var(--line);border-radius:var(--r)}
.alx-app .alx-status{display:inline-flex;align-items:center;gap:8px;border:1px solid var(--line);border-radius:999px;padding:6px 12px;font-size:12px;font-weight:600;white-space:nowrap;background:var(--card)}
.alx-app .alx-status i{width:8px;height:8px;border-radius:50%;background:var(--mut)}
.alx-app .alx-status.live i{background:var(--acc);animation:alxPulse 1.2s ease infinite}
.alx-app .alx-btn{display:inline-flex;align-items:center;gap:6px;padding:6px 10px;min-height:32px;border:1px solid var(--line);border-radius:8px;background:var(--card);color:var(--ink);font:inherit;font-size:11px;font-weight:700;cursor:pointer;touch-action:manipulation}
.alx-app .alx-btn svg{flex:none;display:block}
.alx-app .alx-btn.on{border-color:var(--acc);color:var(--acc)}
.alx-app .alx-btn:disabled{opacity:.4;cursor:default}
.alx-spacer{flex:1 1 auto}
.alx-subchip{font-size:12px;color:var(--mut)}
.alx-panel{position:relative;padding:16px;background:var(--card);border:1px solid var(--line);border-radius:var(--r);display:flex;flex-direction:column;gap:12px}
.alx .alx-chips{display:flex;flex-wrap:wrap;gap:8px;justify-content:center}
.alx .alx-chip{border:1px solid var(--line);border-radius:999px;padding:4px 12px;font-size:12px;color:var(--mut);background:var(--card)}
.alx .alx-chip b{color:var(--ink);font-weight:700}
.alx .alx-chip.turn{border-color:var(--acc);color:var(--acc)}
.alx .alx-chip.turn b{color:var(--acc)}
.alx .alx-card{text-align:center;padding:12px 8px 4px}
.alx .alx-tag{display:inline-block;border:1px solid var(--line);border-radius:999px;padding:4px 12px;font-size:10px;letter-spacing:1.5px;text-transform:uppercase;color:var(--mut);margin-bottom:8px}
.alx .alx-display{font-size:clamp(56px,16vw,88px);font-weight:800;line-height:1.05;letter-spacing:1px}
.alx .alx-display.word{font-size:clamp(28px,7vw,42px)}
.alx .alx-display.name{font-size:clamp(30px,8vw,46px);letter-spacing:.5px}
.alx .alx-prompt{margin-top:8px;font-size:13px;color:var(--mut);font-weight:600;line-height:1.4}
.alx .alx-opts{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}
.alx .alx-opt{position:relative;border:1px solid var(--line);border-radius:10px;background:var(--card);padding:12px 8px;min-height:64px;font-size:26px;font-weight:700;transition:border-color .16s,background .16s,opacity .16s;-webkit-tap-highlight-color:transparent;touch-action:manipulation}
.alx .alx-opt:hover:not(:disabled){border-color:var(--ink)}
.alx .alx-opt .num{position:absolute;top:8px;left:9px;font-size:10px;font-weight:600;color:var(--mut)}
.alx .alx-opt .val.sm{font-size:18px}
.alx .alx-opt.good{border-color:var(--acc);background:#ecfdf5;color:#065f46}
.alx .alx-opt.bad{border-color:var(--bad);background:#fef2f2;color:#7f1d1d}
.alx .alx-opt.hint{outline:2px dashed var(--acc);outline-offset:2px}
.alx .alx-opt.dim{opacity:.55}
.alx .alx-fb{min-height:24px;text-align:center;font-size:13px;font-weight:600;color:var(--mut);line-height:1.4}
.alx .alx-fb.good{color:var(--acc)}
.alx .alx-fb.bad{color:var(--bad)}
.alx .alx-trace{display:flex;flex-direction:column;align-items:center;gap:12px}
.alx .alx-tsvg{width:min(230px,62vw);height:auto;touch-action:none;border:1px solid var(--line);border-radius:10px;background:var(--bg);max-width:100%}
.alx .alx-tsvg.dim{opacity:.5}
.alx .alx-guide{stroke:#e2e5ea;stroke-width:9;fill:none;stroke-linecap:round;stroke-linejoin:round}
.alx .alx-ink{stroke:var(--ink);stroke-width:9;fill:none;stroke-linecap:round;stroke-linejoin:round}
.alx .alx-tsvg.done .alx-ink{stroke:var(--acc)}
.alx .alx-trow{display:flex;align-items:center;gap:12px;width:min(260px,70vw);max-width:100%}
.alx .alx-tbar{flex:1;height:6px;border-radius:999px;background:var(--line);overflow:hidden}
.alx .alx-tbar i{display:block;height:100%;width:0;background:var(--acc);transition:width .16s}
.alx .alx-tpct{font-size:12px;color:var(--mut);min-width:42px;text-align:right;font-weight:600}
.alx .alx-vpad{display:none;grid-template-columns:1fr;justify-items:center;gap:8px}
.alx .alx-vpad button{border:1px solid var(--line);border-radius:8px;background:var(--card);min-height:44px;padding:8px 0;font-size:16px;font-weight:700}
.alx .alx-vpad button small{display:block;font-size:10px;color:var(--mut);font-weight:600;margin-top:2px}
@media (pointer:coarse),(max-width:560px){.alx .alx-vpad{display:grid}}
.alx .alx-ov{position:absolute;inset:0;z-index:5;display:grid;place-items:center;overflow:auto;padding:12px;background:rgba(247,248,250,.94);border-radius:inherit}
.alx .alx-dialog{width:min(92%,340px);max-height:100%;overflow:auto;background:var(--card);border:1px solid var(--line);border-radius:12px;padding:16px;display:flex;flex-direction:column;gap:12px;text-align:center}
.alx .alx-dialog h3{margin:0;font-size:18px;font-weight:700}
.alx .alx-dialog p{margin:0;font-size:13px;color:var(--mut);line-height:1.5}
.alx .alx-help{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px;text-align:left}
.alx .alx-help b{display:block;margin-bottom:4px;font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:var(--mut)}
.alx .alx-help ul{margin:0 0 10px;padding-left:16px;font-size:12px;line-height:1.6;color:var(--mut)}
.alx .alx-btn{border:1px solid var(--line);border-radius:8px;background:var(--card);min-height:44px;padding:8px 16px;font-size:14px;font-weight:600;transition:border-color .16s}
.alx .alx-btn:hover{border-color:var(--ink)}
.alx .alx-btn.primary{background:var(--ink);border-color:var(--ink);color:var(--card)}
.alx .alx-btn:disabled{opacity:.4;cursor:default}
.alx .alx-cheats .alx-crow{display:flex;justify-content:space-between;align-items:center;gap:12px;font-size:13px;font-weight:600;min-height:44px;padding:8px 0;border-bottom:1px solid var(--line)}
.alx .alx-cheats .alx-crow:last-of-type{border-bottom:0}
.alx .alx-toggle{min-width:64px;min-height:44px;border:1px solid var(--line);border-radius:8px;background:var(--card);padding:8px 12px;font-size:12px;font-weight:700}
.alx .alx-toggle.on{background:var(--acc);border-color:var(--acc);color:#fff}
.alx .alx-mini{min-height:44px;border:1px solid var(--line);border-radius:8px;background:var(--card);padding:8px 12px;font-size:12px;font-weight:700}
.alx .alx-dlg-head{display:flex;justify-content:space-between;align-items:center;gap:8px}
.alx .alx-write{width:min(94%,360px)}
.alx .alx-gsvg{width:min(200px,56vw);height:auto;border:1px solid var(--line);border-radius:10px;background:var(--bg);margin:0 auto;max-width:100%}
.alx .alx-gstroke{stroke:var(--ink);stroke-width:8;fill:none;stroke-linecap:round;stroke-linejoin:round}
.alx .alx-gnum circle{fill:var(--acc)}
.alx .alx-gnum text{fill:#fff;font-size:9px;font-weight:700;text-anchor:middle;dominant-baseline:central}
.alx .alx-gnum{opacity:0}
.alx .alx-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:8px}
.alx .alx-actions .game-action-button{border:1px solid var(--line);border-radius:8px;background:var(--card);min-height:44px;padding:8px 12px;font-size:13px;font-weight:600}
.alx .alx-actions .game-action-button:hover{border-color:var(--ink)}
@keyframes alxDraw{to{stroke-dashoffset:0}}
@keyframes alxFade{to{opacity:1}}
@keyframes alxPulse{50%{opacity:.35}}
@media (max-width:640px){
.alx-app .alx-hud{gap:5px 8px;padding:6px 8px;margin-bottom:6px}
.alx-app .alx-hud .alx-btn{min-width:28px;min-height:28px;padding:4px 6px;font-size:10px}
.alx-app .alx-hud .alx-btn-label,.alx-app .alx-spacer,.alx-app .alx-subchip{display:none}
.alx-panel{flex:0 0 auto;min-height:min(70dvh,620px);padding:12px}
.alx .alx-vpad button{max-width:160px}
.alx .alx-ov{padding:8px}
}
@media (max-width:480px){
.alx .alx-display{font-size:clamp(52px,15vw,72px)}
.alx .alx-opts{gap:8px}
.alx .alx-opt{min-height:56px;font-size:24px}
.alx .alx-dialog{width:min(96%,360px);padding:12px}
.alx .alx-tsvg{width:min(210px,60vw)}
.alx .alx-vpad{gap:6px}
}
@media (prefers-reduced-motion:reduce){.alx *{animation-duration:.01ms!important;animation-delay:0s!important;transition-duration:.01ms!important}}
</style>
<div class="game-app alx alx-app game-fill">
  <div class="alx-hud">
    <span class="alx-status" data-statuswrap><i></i><span data-status>Ready</span></span>
    <span class="alx-subchip" data-sub></span>
    <div class="alx-chips" data-chips></div>
    <span class="alx-spacer"></span>
    <button class="alx-btn" type="button" data-help aria-label="How to play" title="How to play (H)">${iconSVG("helpCircle", { size: 14 })}<span class="alx-btn-label">Help</span></button>
    <button class="alx-btn" type="button" data-act="cheat" aria-label="Cheats" title="Cheats (C)">${iconSVG("wrench", { size: 14 })}<span class="alx-btn-label">Cheats</span></button>
    <button class="alx-btn" type="button" data-act="menu" data-menu-btn aria-label="Menu" title="Menu (M)">${iconSVG("menu", { size: 14 })}<span class="alx-btn-label">Menu</span></button>
    <button class="alx-btn" type="button" data-act="write" aria-label="Write" title="Write (W)">${iconSVG("pencil", { size: 14 })}<span class="alx-btn-label">Write</span></button>
    <button class="alx-btn" type="button" data-act="sound" data-sound-btn aria-label="Sound" title="Sound (S)">${iconSVG("volume", { size: 14 })}<span class="alx-btn-label">Sound</span></button>
    <button class="alx-btn" type="button" data-act="pause" data-pause-btn aria-label="Pause" title="Pause (P)">${iconSVG("pause", { size: 14 })}<span class="alx-btn-label">Pause</span></button>
    <button class="alx-btn" type="button" data-act="restart" aria-label="Restart" title="Restart">${iconSVG("refresh", { size: 14 })}<span class="alx-btn-label">Restart</span></button>
    <button class="alx-btn" type="button" data-exit aria-label="Exit game" title="Exit game">${iconSVG("logOut", { size: 14 })}<span class="alx-btn-label">Exit</span></button>
  </div>
  <section class="game-panel alx-panel alx-board" data-board>
    <div class="alx-card">
      <span class="alx-tag" data-tag hidden></span>
      <div class="alx-display" data-display>A</div>
      <div class="alx-prompt" data-prompt></div>
    </div>
    <div class="alx-opts" data-opts></div>
    <div class="alx-trace" data-trace hidden></div>
    <div class="alx-fb" data-fb aria-live="polite"></div>
    <div class="alx-vpad" data-vpad>
      <button type="button" data-act="cheat-skip">Skip</button>
    </div>
    <div class="alx-ov" data-ov="menu" hidden><div class="alx-dialog" data-menu></div></div>
    <div class="alx-ov" data-ov="over" hidden><div class="alx-dialog" data-over></div></div>
    <div class="alx-ov" data-ov="cheat" hidden>
      <div class="alx-dialog alx-cheats">
        <div class="alx-dlg-head"><h3>Cheats</h3><button type="button" class="alx-mini" data-act="cheat-close">Close</button></div>
        <div class="alx-crow"><span>Reveal answer</span><button type="button" class="alx-toggle" data-cheat="reveal" aria-pressed="false">Off</button></div>
        <div class="alx-crow"><span>Auto answer</span><button type="button" class="alx-toggle" data-cheat="auto" aria-pressed="false">Off</button></div>
        <div class="alx-crow"><span>Freeze time</span><button type="button" class="alx-toggle" data-cheat="freeze" aria-pressed="false">Off</button></div>
        <div class="alx-crow"><span>Bot blunders</span><button type="button" class="alx-toggle" data-cheat="botweak" aria-pressed="false">Off</button></div>
        <div class="alx-crow"><span>Time +15s</span><button type="button" class="alx-mini" data-act="cheat-time">Add</button></div>
        <div class="alx-crow"><span>Skip question</span><button type="button" class="alx-mini" data-act="cheat-skip">Skip</button></div>
        <div class="alx-crow"><span>Learn 5 letters</span><button type="button" class="alx-mini" data-act="cheat-learn">Learn</button></div>
        <div class="alx-crow"><span>Win now</span><button type="button" class="alx-mini" data-act="cheat-win">Win</button></div>
      </div>
    </div>
    <div class="alx-ov" data-ov="write" hidden>
      <div class="alx-dialog alx-write">
        <div class="alx-dlg-head">
          <button type="button" class="alx-mini" data-act="write-prev" aria-label="Previous letter">&lt;</button>
          <h3 data-wletter>Write · A</h3>
          <button type="button" class="alx-mini" data-act="write-next" aria-label="Next letter">&gt;</button>
        </div>
        <div data-guide></div>
        <button type="button" class="alx-btn" data-act="write-replay">Replay strokes</button>
        <div data-practice></div>
        <button type="button" class="alx-btn primary" data-act="write-close">Done</button>
      </div>
    </div>
    <div class="alx-ov" data-ov="help" hidden>
      <div class="alx-dialog">
        <div class="alx-dlg-head"><h3>How to play</h3><button type="button" class="alx-mini" data-act="help-close">Close</button></div>
        <div class="alx-help">
          <div>
            <b>Goal</b>
            <ul>
              <li>Learn all 26 letters, or score 20 correct answers in 60 seconds.</li>
              <li>Race mode: first player to 7 correct answers wins.</li>
              <li>Every question has exactly one correct answer.</li>
            </ul>
            <b>Desktop</b>
            <ul>
              <li><kbd>1</kbd>–<kbd>4</kbd> pick an answer; arrow keys move focus.</li>
              <li><kbd>M</kbd> menu · <kbd>W</kbd> write · <kbd>C</kbd> cheats · <kbd>S</kbd> sound · <kbd>P</kbd> pause · <kbd>H</kbd> help.</li>
            </ul>
          </div>
          <div>
            <b>Mobile</b>
            <ul>
              <li>Tap an answer card directly; use <b>Skip</b> to pass a question.</li>
              <li>The writing pad traces letters with a finger or mouse.</li>
            </ul>
            <b>Tips</b>
            <ul>
              <li>There are 11 question types: matching, case, order, names, words, vowels and tracing.</li>
              <li>Cheats are client-side helpers and can be toggled from the HUD.</li>
            </ul>
            <button type="button" class="alx-btn primary" data-act="help-close">Got it</button>
          </div>
        </div>
      </div>
    </div>
    <div class="alx-ov" data-ov="pause" hidden>
      <div class="alx-dialog">
        <div class="alx-dlg-head"><h3>Paused</h3></div>
        <p>The question timer and turns are stopped.</p>
        <button type="button" class="alx-btn primary" data-act="resume">Resume <kbd>P</kbd></button>
      </div>
    </div>
  </section>
</div>`;

    const $ = (s, r) => (r || root).querySelector(s);
    const subEl = $("[data-sub]"), statusEl = $("[data-status]"), statusWrap = $("[data-statuswrap]");
    const chipsEl = $("[data-chips]"), displayEl = $("[data-display]"), tagEl = $("[data-tag]");
    const promptEl = $("[data-prompt]"), optsEl = $("[data-opts]"), traceEl = $("[data-trace]");
    const fbEl = $("[data-fb]"), vpadEl = $("[data-vpad]");
    const ovMenu = $('[data-ov="menu"]'), ovOver = $('[data-ov="over"]');
    const ovCheat = $('[data-ov="cheat"]'), ovWrite = $('[data-ov="write"]');
    const ovHelp = $('[data-ov="help"]'), ovPause = $('[data-ov="pause"]');
    const menuBox = $("[data-menu]"), overBox = $("[data-over]");
    const guideBox = $("[data-guide]"), practiceBox = $("[data-practice]"), wLetterEl = $("[data-wletter]");
    const soundBtn = $("[data-sound-btn]"), menuBtn = $("[data-menu-btn]");

    function toggleHelp(on) {
        helpOpen = typeof on === "boolean" ? on : !helpOpen;
        if (helpOpen) { cheatOpen = false; writeOpen = false; paused = false; }
        render();
    }
    function togglePause(on) {
        paused = typeof on === "boolean" ? on : !paused;
        if (paused) {
            clearTimeout(advanceTimer); advanceTimer = null;
            clearTimeout(botTimer); botTimer = null;
            clearTimeout(autoTimer); autoTimer = null;
        } else if (state && state.phase === "play") {
            scheduleBot(); scheduleAuto();
            if (state.locked) scheduleAdvance(300);
        }
        render();
    }

    /* ---------- suara (ucapkan nama huruf / kata) ---------- */
    function say(text) {
        if (!soundOn || typeof speechSynthesis === "undefined") return;
        try {
            const u = new SpeechSynthesisUtterance(text);
            u.lang = "en-US"; u.rate = 0.95;
            speechSynthesis.cancel(); speechSynthesis.speak(u);
        } catch (_) { /* abaikan */ }
    }

    /* ---------- tracing widget (mouse + jari via pointer events) ---------- */
    function makeTrace(host, letter, opts = {}) {
        host.innerHTML = "";
        const NS = "http://www.w3.org/2000/svg";
        const svg = document.createElementNS(NS, "svg");
        svg.setAttribute("viewBox", "0 0 100 145");
        svg.setAttribute("class", "alx-tsvg" + (opts.enabled === false ? " dim" : ""));
        const inkG = document.createElementNS(NS, "g");
        const guidePaths = (STROKES[letter] || STROKES.A).map((d) => {
            const p = document.createElementNS(NS, "path");
            p.setAttribute("d", d); p.setAttribute("class", "alx-guide");
            svg.appendChild(p); return p;
        });
        svg.appendChild(inkG);
        const row = document.createElement("div"); row.className = "alx-trow";
        const bar = document.createElement("div"); bar.className = "alx-tbar";
        const fill = document.createElement("i"); bar.appendChild(fill);
        const pct = document.createElement("span"); pct.className = "alx-tpct"; pct.textContent = "0%";
        const clear = document.createElement("button");
        clear.type = "button"; clear.className = "alx-mini"; clear.textContent = "Clear";
        row.append(bar, pct, clear);
        host.append(svg, row);

        let samples = [], covered = [], cur = null, lastPt = null, passed = false;
        requestAnimationFrame(() => {
            for (const p of guidePaths) {
                const L = p.getTotalLength();
                for (let s = 0; s <= L; s += 6) {
                    const pt = p.getPointAtLength(s);
                    samples.push([pt.x, pt.y]);
                }
            }
            covered = new Array(samples.length).fill(false);
        });
        const toXY = (e) => {
            const m = svg.getScreenCTM(); if (!m) return null;
            const pt = svg.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY;
            const q = pt.matrixTransform(m.inverse()); return [q.x, q.y];
        };
        const mark = (x, y) => {
            for (let i = 0; i < samples.length; i++) {
                if (covered[i]) continue;
                const dx = samples[i][0] - x, dy = samples[i][1] - y;
                if (dx * dx + dy * dy < 196) covered[i] = true;
            }
        };
        const update = () => {
            const n = covered.filter(Boolean).length;
            const ratio = samples.length ? n / samples.length : 0;
            fill.style.width = Math.round(ratio * 100) + "%";
            pct.textContent = Math.round(ratio * 100) + "%";
            if (!passed && ratio >= (opts.pass || WRITE_PASS)) {
                passed = true; svg.classList.add("done"); pct.textContent = "Done";
                if (opts.onPass) opts.onPass(ratio);
            }
        };
        svg.addEventListener("pointerdown", (e) => {
            if (opts.enabled === false) return;
            e.preventDefault();
            try { svg.setPointerCapture(e.pointerId); } catch (_) { }
            const p = toXY(e); if (!p) return;
            cur = document.createElementNS(NS, "path");
            cur.setAttribute("class", "alx-ink");
            cur.setAttribute("d", "M" + p[0].toFixed(1) + " " + p[1].toFixed(1));
            inkG.appendChild(cur); lastPt = p; mark(p[0], p[1]); update();
        });
        svg.addEventListener("pointermove", (e) => {
            if (!cur) return;
            const p = toXY(e); if (!p) return;
            const dx = p[0] - lastPt[0], dy = p[1] - lastPt[1];
            if (dx * dx + dy * dy < 4) return;
            lastPt = p;
            cur.setAttribute("d", cur.getAttribute("d") + " L" + p[0].toFixed(1) + " " + p[1].toFixed(1));
            mark(p[0], p[1]); update();
        });
        const up = () => { cur = null; };
        svg.addEventListener("pointerup", up);
        svg.addEventListener("pointercancel", up);
        clear.addEventListener("click", () => {
            inkG.innerHTML = ""; covered.fill(false); passed = false;
            svg.classList.remove("done"); update();
        });
    }

    /* ---------- panduan menulis: animasi urutan goresan ---------- */
    function buildGuide() {
        wLetterEl.textContent = "Write · " + guideLetter;
        guideBox.innerHTML = "";
        const NS = "http://www.w3.org/2000/svg";
        const svg = document.createElementNS(NS, "svg");
        svg.setAttribute("viewBox", "0 0 100 145");
        svg.setAttribute("class", "alx-gsvg");
        const paths = (STROKES[guideLetter] || STROKES.A).map((d) => {
            const p = document.createElementNS(NS, "path");
            p.setAttribute("d", d); p.setAttribute("class", "alx-gstroke");
            svg.appendChild(p); return p;
        });
        guideBox.appendChild(svg);
        requestAnimationFrame(() => {
            let delay = 0.15;
            paths.forEach((p, i) => {
                const L = p.getTotalLength();
                const dur = Math.max(0.35, L / 150);
                p.style.strokeDasharray = L;
                p.style.strokeDashoffset = L;
                p.style.animation = "alxDraw " + dur + "s linear " + delay + "s forwards";
                const s = p.getPointAtLength(0);
                const g = document.createElementNS(NS, "g");
                g.setAttribute("class", "alx-gnum");
                const cx = Math.min(93, Math.max(7, s.x - 8));
                const cy = Math.min(138, Math.max(7, s.y - 8));
                const c = document.createElementNS(NS, "circle");
                c.setAttribute("cx", cx); c.setAttribute("cy", cy); c.setAttribute("r", 7);
                const tx = document.createElementNS(NS, "text");
                tx.setAttribute("x", cx); tx.setAttribute("y", cy);
                tx.textContent = i + 1;
                g.append(c, tx);
                g.style.animation = "alxFade .3s ease " + delay + "s forwards";
                svg.appendChild(g);
                delay += dur + 0.15;
            });
        });
        makeTrace(practiceBox, guideLetter, { onPass: () => say(guideLetter) });
    }
    function openWrite() {
        guideLetter = state && state.q ? state.q.target : "A";
        writeOpen = true; buildGuide(); render();
    }

    /* ---------- render ---------- */
    const pill = (html, cls) => '<span class="alx-chip' + (cls ? " " + cls : "") + '">' + html + "</span>";
    const seatTag = (s) => "P" + (s + 1) + (s === mySeat() ? " · you" : state.mode === "bot" ? " · bot" : "");

    function buildMenu() {
        const key = (online ? "o" : "l") + (room && room.isHost ? "h" : "g");
        if (menuKey === key) return;
        menuKey = key;
        menuBox.innerHTML = "";
        const h = document.createElement("h3"); h.textContent = "Alphabet Learning"; menuBox.appendChild(h);
        const add = (label, m, primary) => {
            const b = document.createElement("button");
            b.type = "button"; b.className = "alx-btn" + (primary ? " primary" : "");
            b.dataset.mode = m; b.textContent = label;
            menuBox.appendChild(b);
        };
        if (online && !room.isHost) {
            const p = document.createElement("p"); p.textContent = "Waiting for host to start…"; menuBox.appendChild(p);
        } else if (online) {
            add("Start versus", "versus", true);
        } else {
            add("Learn mode", "learn", true);
            add("Challenge mode", "challenge");
            add("VS Bot", "bot");
        }
    }

    function buildOver() {
        const key = state.winner + "|" + state.reason + "|" + state.mode;
        if (overKey === key) return;
        overKey = key;
        overBox.innerHTML = "";
        const h = document.createElement("h3");
        h.textContent = state.winner === null ? "Time is up"
            : state.mode === "learn" ? "Alphabet master"
                : state.winner === mySeat() ? "You win"
                    : state.mode === "bot" ? "Bot wins" : "P" + (state.winner + 1) + " wins";
        const p = document.createElement("p"); p.textContent = state.reason;
        overBox.append(h, p);
        if (!online || room.isHost) {
            const again = document.createElement("button");
            again.type = "button"; again.className = "alx-btn primary";
            again.dataset.act = "again"; again.textContent = "Play again";
            const menu = document.createElement("button");
            menu.type = "button"; menu.className = "alx-btn";
            menu.dataset.act = "menu"; menu.textContent = "Menu";
            overBox.append(again, menu);
        } else {
            const w = document.createElement("p"); w.textContent = "Waiting for host…"; overBox.appendChild(w);
        }
    }

    function buildBoard() {
        focusIdx = 0;
        const q = state && state.q;
        if (!q) {
            displayEl.textContent = "A"; displayEl.className = "alx-display";
            tagEl.hidden = true; promptEl.textContent = "";
            optsEl.innerHTML = ""; traceEl.hidden = true; traceEl.innerHTML = "";
            return;
        }
        displayEl.textContent = q.display;
        displayEl.className = "alx-display" + (q.type === "word" ? " word" : q.type === "name" ? " name" : "");
        tagEl.hidden = !q.tag;
        if (q.tag) tagEl.textContent = q.tag;
        promptEl.textContent = q.prompt;
        if (q.type === "write") {
            optsEl.innerHTML = ""; optsEl.hidden = true;
            traceEl.hidden = false;
            const seq = state.seq;
            makeTrace(traceEl, q.target, {
                enabled: !isRace() || state.turn === mySeat(),
                onPass: (cov) => submitAction({ type: "write", seq, coverage: cov }),
            });
        } else {
            traceEl.hidden = true; traceEl.innerHTML = "";
            optsEl.hidden = false; optsEl.innerHTML = "";
            q.options.forEach((opt, i) => {
                const b = document.createElement("button");
                b.type = "button"; b.className = "alx-opt"; b.dataset.pick = i;
                const num = document.createElement("span"); num.className = "num"; num.textContent = i + 1;
                const val = document.createElement("span"); val.className = "val" + (q.type === "wordpick" ? " sm" : ""); val.textContent = opt;
                b.append(num, val);
                optsEl.appendChild(b);
            });
            if (q.type === "word") say(q.display);
            else if (q.type === "name") say(q.display);
        }
        vpadEl.querySelectorAll("[data-vpick]").forEach((b, i) => {
            const small = b.querySelector("small");
            const hide = q.type === "write";
            b.hidden = hide;
            if (small) small.textContent = hide ? "" : (q.options[i] || "");
        });
    }

    function updateDynamic() {
        const s = state;
        let chips = "", status = "Ready", sub = "", live = false;
        if (!s) {
            status = "Connecting…";
        } else if (s.phase === "menu") {
            chips = pill(online ? "Multiplayer" : "Solo");
        } else {
            const n = s.learned.filter(Boolean).length;
            if (isRace()) {
                chips = pill("Race to " + RACE_TARGET);
                for (let i = 0; i < 2; i++)
                    chips += pill(seatTag(i) + " <b>" + s.scores[i] + "</b>", s.phase === "play" && s.turn === i ? "turn" : "");
                sub = "You are P" + (mySeat() + 1) + " · " + (s.first === mySeat() ? "you move" : "P" + (s.first + 1) + " moves") + " first";
                if (s.phase === "play") {
                    live = s.turn === mySeat() && !s.locked;
                    status = s.locked ? "…" : live ? "Your turn" : s.mode === "bot" ? "Bot thinking" : "P" + (s.turn + 1) + " turn";
                }
            } else if (s.mode === "learn") {
                chips = pill("Learn") + pill("Learned <b>" + n + "</b>/26");
                sub = "Learn mode"; status = "Learned " + n + "/26"; live = s.phase === "play";
            } else {
                chips = pill("Challenge") + pill("Score <b>" + s.scores[0] + "</b>/" + CHALLENGE_TARGET) + pill("Time <b>" + Math.max(0, Math.ceil(s.timeLeft)) + "</b>");
                sub = "Challenge mode"; status = "Time " + Math.max(0, Math.ceil(s.timeLeft)) + "s"; live = s.phase === "play";
            }
            if (s.phase === "over")
                status = s.winner === null ? "Time is up" : s.winner === mySeat() ? "You win" : isRace() ? (s.mode === "bot" ? "Bot wins" : "P" + (s.winner + 1) + " wins") : "Done";
        }
        chipsEl.innerHTML = chips;
        statusEl.textContent = status;
        statusWrap.classList.toggle("live", live);
        subEl.textContent = sub;

        /* opsi: feedback, hint cheat, dim saat terkunci / bukan giliran */
        if (s && s.q && s.q.type !== "write") {
            const last = s.last && s.last.seq === s.seq ? s.last : null;
            Array.from(optsEl.children).forEach((b, i) => {
                let cls = "alx-opt";
                if (last) {
                    if (i === last.index) cls += last.good ? " good" : " bad";
                    if (last.good && i === s.q.answerIndex) cls += " good";
                }
                if (cheats.reveal && s.phase === "play" && !s.locked && (!isRace() || s.turn === mySeat()) && i === s.q.answerIndex) cls += " hint";
                if (s.phase !== "play" || s.locked || (isRace() && s.turn !== mySeat())) cls += " dim";
                b.className = cls;
            });
        }
        const last = s && s.last && s.last.seq === s.seq ? s.last : null;
        if (last && last.skip) { fbEl.textContent = "Skipped"; fbEl.className = "alx-fb"; }
        else if (last && last.good) {
            fbEl.textContent = "Yes · " + s.q.target + " — " + ALPHABET[idx(s.q.target)].name;
            fbEl.className = "alx-fb good";
        } else if (last) {
            fbEl.textContent = s.mode === "learn" ? "Not quite — try again" : "Not quite";
            fbEl.className = "alx-fb bad";
        } else { fbEl.textContent = ""; fbEl.className = "alx-fb"; }

        const panelHidden = helpOpen || paused;
        ovMenu.hidden = panelHidden || !(!s || s.phase === "menu");
        ovOver.hidden = panelHidden || !(s && s.phase === "over");
        ovCheat.hidden = panelHidden || !cheatOpen;
        ovWrite.hidden = panelHidden || !writeOpen;
        ovHelp.hidden = !helpOpen;
        ovPause.hidden = !paused;
        if (!ovMenu.hidden) buildMenu();
        if (!ovOver.hidden) buildOver();

        if (soundBtn.dataset.iconState !== String(soundOn)) {
            soundBtn.dataset.iconState = String(soundOn);
            const label = soundBtn.querySelector(".alx-btn-label");
            if (label) label.textContent = soundOn ? "Sound" : "Muted";
            const ico = soundBtn.querySelector("svg");
            if (ico) ico.outerHTML = iconSVG(soundOn ? "volume" : "volumeX", { size: 14 });
        }
        soundBtn.classList.toggle("on", soundOn);
        const pauseBtn = $("[data-pause-btn]");
        if (pauseBtn) {
            const want = paused ? "play" : "pause";
            if (pauseBtn.dataset.iconState !== want) {
                pauseBtn.dataset.iconState = want;
                const ico = pauseBtn.querySelector("svg");
                if (ico) ico.outerHTML = iconSVG(want, { size: 14 });
                const label = pauseBtn.querySelector(".alx-btn-label");
                if (label) label.textContent = paused ? "Resume" : "Pause";
            }
        }
        menuBtn.hidden = online && !room.isHost;
        root.querySelectorAll("[data-cheat]").forEach((b) => {
            const on = cheats[b.dataset.cheat];
            b.textContent = on ? "On" : "Off";
            b.classList.toggle("on", on);
            b.setAttribute("aria-pressed", String(on));
            if (b.dataset.cheat === "freeze") b.disabled = !s || s.mode !== "challenge";
            if (b.dataset.cheat === "botweak") b.disabled = !s || s.mode !== "bot";
        });
        const dis = (sel, cond) => { const b = root.querySelector(sel); if (b) b.disabled = cond; };
        dis('[data-act="cheat-time"]', !s || s.mode !== "challenge" || s.phase !== "play");
        dis('[data-act="cheat-learn"]', !s || s.mode !== "learn" || s.phase !== "play");
        dis('[data-act="cheat-win"]', !s || s.phase !== "play");
        root.querySelectorAll('[data-act="cheat-skip"]').forEach((b) => {
            b.disabled = !s || s.phase !== "play" || s.locked || (isRace() && s.turn !== mySeat());
        });
    }

    function render() {
        const s = state;
        const key = s ? [s.phase, s.mode, s.seq, s.seatSwap, s.q ? s.q.type : "-"].join("|") : "null";
        if (key !== renderKey) { renderKey = key; buildBoard(); }
        updateDynamic();
    }

    function publish() {
        render();
        if (online && room.isHost) room.publishState(state).catch(console.warn);
    }

    /* ---------- timers & bot ---------- */
    function stopAllTimers() {
        if (tickTimer) { clearInterval(tickTimer); tickTimer = null; }
        if (advanceTimer) { clearTimeout(advanceTimer); advanceTimer = null; }
        if (botTimer) { clearTimeout(botTimer); botTimer = null; }
        if (autoTimer) { clearTimeout(autoTimer); autoTimer = null; }
    }
    function startTick() {
        if (tickTimer) clearInterval(tickTimer);
        tickTimer = setInterval(() => {
            if (!state || state.phase !== "play" || state.mode !== "challenge" || cheats.freeze || paused) return;
            state.timeLeft = Math.max(0, state.timeLeft - 0.25);
            if (state.timeLeft <= 0) finish(null);
            else render();
        }, 250);
    }
    function scheduleAdvance(ms) {
        if (advanceTimer) clearTimeout(advanceTimer);
        advanceTimer = setTimeout(() => {
            if (!state || state.phase !== "play") return;
            if (isRace()) state.turn = 1 - state.turn;
            state.seq++;
            state.q = buildQuestion(state.mode, state.learned, Math.random);
            state.locked = false; state.last = null;
            publish(); scheduleBot(); scheduleAuto();
        }, ms);
    }
    function scheduleBot() {
        if (botTimer) { clearTimeout(botTimer); botTimer = null; }
        if (!state || state.mode !== "bot" || state.phase !== "play" || state.locked || state.turn !== botSeat()) return;
        const acc = cheats.botweak ? 0.06 : 0.72;
        const delay = cheats.botweak ? 2600 + Math.random() * 1800 : 1100 + Math.random() * 1500;
        const seq = state.seq;
        botTimer = setTimeout(() => {
            if (!state || state.phase !== "play" || state.seq !== seq || state.locked || state.turn !== botSeat()) return;
            const good = Math.random() < acc;
            if (state.q.type === "write") {
                applyAction({ type: "write", seq, coverage: good ? 1 : 0.2 }, botSeat());
            } else {
                let i = state.q.answerIndex;
                if (!good) {
                    const wrongs = [0, 1, 2, 3].filter((x) => x !== state.q.answerIndex);
                    i = wrongs[Math.floor(Math.random() * wrongs.length)];
                }
                applyAction({ type: "pick", seq, index: i }, botSeat());
            }
        }, delay);
    }
    function scheduleAuto() {
        if (autoTimer) { clearTimeout(autoTimer); autoTimer = null; }
        if (!cheats.auto || !state || state.phase !== "play" || state.locked || state.turn !== mySeat()) return;
        const seq = state.seq;
        autoTimer = setTimeout(() => {
            if (!state || state.phase !== "play" || state.seq !== seq || state.locked || state.turn !== mySeat()) return;
            if (state.q.type === "write") submitAction({ type: "write", seq, coverage: 1 });
            else submitAction({ type: "pick", seq, index: state.q.answerIndex });
        }, 800);
    }

    /* ---------- alur permainan ---------- */
    function doStart(m) {
        stopAllTimers();
        const race = m === "bot" || m === "versus";
        state = initialState(m);
        state.phase = "play";
        state.seatSwap = race && Math.random() < 0.5;   /* acak posisi P1/P2 */
        state.first = race ? (Math.random() < 0.5 ? 0 : 1) : 0; /* acak giliran pertama */
        state.turn = state.first;
        state.seq = 1;
        state.q = buildQuestion(m, state.learned, Math.random);
        publish();
        if (m === "challenge") startTick();
        scheduleBot(); scheduleAuto();
    }
    function finish(winnerSeat) {
        stopAllTimers();
        state.phase = "over"; state.winner = winnerSeat; state.locked = true;
        const n = state.learned.filter(Boolean).length;
        if (state.mode === "learn") state.reason = "All 26 letters learned · " + state.wrong + " slip" + (state.wrong === 1 ? "" : "s");
        else if (state.mode === "challenge")
            state.reason = winnerSeat === null
                ? state.scores[0] + "/" + CHALLENGE_TARGET + " correct. Time is up."
                : CHALLENGE_TARGET + " correct · " + Math.ceil(state.timeLeft) + "s left";
        else state.reason = "P1 " + state.scores[0] + " — " + state.scores[1] + " P2" + (winnerSeat === mySeat() ? " · you win" : "");
        overKey = "";
        publish();
    }
    function resolve(good, actor, index) {
        state.last = { seq: state.seq, seat: actor, index, good };
        if (good) {
            if (state.mode === "learn") state.learned[idx(state.q.target)] = true;
            else state.scores[actor]++;
            say(ALPHABET[idx(state.q.target)].name);
            state.locked = true;
            const won = state.mode === "learn" ? state.learned.every(Boolean)
                : state.mode === "challenge" ? state.scores[actor] >= CHALLENGE_TARGET
                    : state.scores[actor] >= RACE_TARGET;
            publish();
            if (won) {
                if (advanceTimer) clearTimeout(advanceTimer);
                advanceTimer = setTimeout(() => finish(actor), 650);
            } else scheduleAdvance(750);
        } else {
            state.wrong++;
            if (state.mode === "learn") { publish(); } /* boleh coba lagi */
            else if (state.mode === "challenge") {
                state.timeLeft = Math.max(0, state.timeLeft - 4);
                state.locked = true; publish();
                if (state.timeLeft <= 0) {
                    if (advanceTimer) clearTimeout(advanceTimer);
                    advanceTimer = setTimeout(() => finish(null), 400);
                } else scheduleAdvance(650);
            } else { state.locked = true; publish(); scheduleAdvance(750); }
        }
    }

    function applyAction(action, actor) {
        if (!state || !action) return;
        const hostOnly = online && actor !== seatOf(0);
        switch (action.type) {
            case "start": {
                if (hostOnly) return;
                const m = online ? "versus" : action.mode;
                if (!["learn", "challenge", "bot", "versus"].includes(m)) return;
                doStart(m); return;
            }
            case "again": if (!hostOnly) doStart(state.mode); return;
            case "menu":
                if (hostOnly) return;
                stopAllTimers(); state = initialState(online ? "versus" : "learn");
                menuKey = ""; publish(); return;
            case "pick": {
                if (state.phase !== "play" || state.locked || actor !== state.turn) return;
                if (action.seq !== state.seq || !state.q || state.q.type === "write") return;
                const i = action.index;
                if (!Number.isInteger(i) || i < 0 || i > 3) return;
                resolve(isCorrect(state.q, state.q.options[i]), actor, i); break;
            }
            case "write": {
                if (state.phase !== "play" || state.locked || actor !== state.turn) return;
                if (action.seq !== state.seq || !state.q || state.q.type !== "write") return;
                resolve(Number(action.coverage) >= WRITE_PASS, actor, -1); break;
            }
            case "skip": {
                if (state.phase !== "play" || state.locked || actor !== state.turn || action.seq !== state.seq) return;
                state.last = { seq: state.seq, seat: actor, index: -1, good: false, skip: true };
                state.locked = true; publish(); scheduleAdvance(400); break;
            }
            case "cheat-time":
                if (state.mode === "challenge" && state.phase === "play") { state.timeLeft += 15; publish(); }
                return;
            case "cheat-learn": {
                if (state.mode !== "learn" || state.phase !== "play") return;
                let added = 0;
                for (let i = 0; i < 26 && added < 5; i++) if (!state.learned[i]) { state.learned[i] = true; added++; }
                if (state.learned.every(Boolean)) finish(actor); else publish();
                return;
            }
            case "cheat-win": {
                if (state.phase !== "play") return;
                if (state.mode === "learn") state.learned.fill(true);
                else state.scores[actor] = state.mode === "challenge" ? CHALLENGE_TARGET : RACE_TARGET;
                finish(actor); return;
            }
            default: return;
        }
        scheduleBot(); scheduleAuto();
    }

    function submitAction(action) {
        if (online && !room.isHost) { room.sendAction(action).catch(console.warn); return; }
        applyAction(action, mySeat());
    }

    function pickByIndex(i) {
        if (!state || state.phase !== "play" || state.locked || state.turn !== mySeat()) return;
        if (!state.q || state.q.type === "write") return;
        submitAction({ type: "pick", seq: state.seq, index: i });
    }
    function toggleCheat(name) {
        if (!(name in cheats)) return;
        if (name === "freeze" && (!state || state.mode !== "challenge")) return;
        if (name === "botweak" && (!state || state.mode !== "bot")) return;
        cheats[name] = !cheats[name];
        scheduleAuto(); scheduleBot(); render();
    }

    /* ---------- input: mouse / touch ---------- */
    function handleClick(event) {
        if (event.target.closest("[data-help]")) { toggleHelp(); return; }
        if (event.target.closest("[data-exit]")) { stopAllTimers(); onExit(); return; }
        const pick = event.target.closest("[data-pick],[data-vpick]");
        if (pick) { pickByIndex(Number(pick.dataset.pick ?? pick.dataset.vpick)); return; }
        const md = event.target.closest("[data-mode]");
        if (md) { submitAction({ type: "start", mode: md.dataset.mode }); return; }
        const ch = event.target.closest("[data-cheat]");
        if (ch) { toggleCheat(ch.dataset.cheat); return; }
        const act = event.target.closest("[data-act]");
        if (!act) return;
        switch (act.dataset.act) {
            case "menu": if (!online || room.isHost) submitAction({ type: "menu" }); break;
            case "again": submitAction({ type: "again" }); break;
            case "restart": submitAction({ type: "again" }); break;
            case "help-close": toggleHelp(false); break;
            case "pause": togglePause(); break;
            case "resume": togglePause(false); break;
            case "write": openWrite(); break;
            case "sound": soundOn = !soundOn; if (!soundOn && typeof speechSynthesis !== "undefined") speechSynthesis.cancel(); render(); break;
            case "cheat": cheatOpen = !cheatOpen; render(); break;
            case "cheat-close": cheatOpen = false; render(); break;
            case "cheat-time": submitAction({ type: "cheat-time" }); break;
            case "cheat-skip": if (state && state.phase === "play") submitAction({ type: "skip", seq: state.seq }); break;
            case "cheat-learn": submitAction({ type: "cheat-learn" }); break;
            case "cheat-win": submitAction({ type: "cheat-win" }); break;
            case "write-close": writeOpen = false; render(); break;
            case "write-replay": buildGuide(); break;
            case "write-prev": guideLetter = ALPHABET[(idx(guideLetter) + 25) % 26].ch; buildGuide(); break;
            case "write-next": guideLetter = ALPHABET[(idx(guideLetter) + 1) % 26].ch; buildGuide(); break;
        }
    }

    /* ---------- input: keyboard desktop ---------- */
    function handleKey(e) {
        if (!state || e.metaKey || e.ctrlKey || e.altKey) return;
        const k = e.key;
        if (helpOpen) {
            if (k === "Escape" || k === "h" || k === "H" || k === "Enter") toggleHelp(false);
            return;
        }
        if (paused) {
            if (k === "p" || k === "P" || k === "Escape" || k === "Enter") togglePause(false);
            return;
        }
        if (writeOpen) {
            if (k === "Escape") { writeOpen = false; render(); }
            else if (k === "r" || k === "R") buildGuide();
            else if (k === "ArrowLeft") { e.preventDefault(); guideLetter = ALPHABET[(idx(guideLetter) + 25) % 26].ch; buildGuide(); }
            else if (k === "ArrowRight") { e.preventDefault(); guideLetter = ALPHABET[(idx(guideLetter) + 1) % 26].ch; buildGuide(); }
            return;
        }
        if (cheatOpen) {
            if (k === "Escape" || k === "c" || k === "C") { cheatOpen = false; render(); }
            return;
        }
        if (k >= "1" && k <= "4") { pickByIndex(Number(k) - 1); return; }
        if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(k) && optsEl.children.length) {
            e.preventDefault();
            const step = k === "ArrowLeft" ? -1 : k === "ArrowRight" ? 1 : k === "ArrowUp" ? -2 : 2;
            focusIdx = (focusIdx + step + optsEl.children.length) % optsEl.children.length;
            optsEl.children[focusIdx].focus();
            return;
        }
        if (e.repeat) return;
        if (k === "m" || k === "M" || k === "Escape") { if (!online || room.isHost) submitAction({ type: "menu" }); }
        else if (k === "c" || k === "C") { cheatOpen = true; render(); }
        else if (k === "w" || k === "W") openWrite();
        else if (k === "s" || k === "S") { soundOn = !soundOn; render(); }
        else if (k === "h" || k === "H") { toggleHelp(); }
        else if (k === "p" || k === "P") { togglePause(); }
    }

    root.addEventListener("click", handleClick);
    document.addEventListener("keydown", handleKey);

    /* ---------- wiring room / lokal ---------- */
    if (online) {
        const offRoom = room.onRoom((nextRoom) => { roomData = nextRoom; render(); });
        unsubs.push(offRoom);
        if (room.isHost) {
            state = initialState("versus");
            publish();
            unsubs.push(room.onAction((action) => applyAction(action, seatOf(1))));
        } else {
            unsubs.push(room.onState((nextState) => { state = nextState; render(); scheduleAuto(); }));
        }
    } else {
        state = initialState("learn");
        render();
    }

    return {
        destroy() {
            stopAllTimers();
            root.removeEventListener("click", handleClick);
            document.removeEventListener("keydown", handleKey);
            unsubs.forEach((fn) => { if (typeof fn === "function") fn(); });
            if (typeof speechSynthesis !== "undefined") speechSynthesis.cancel();
            root.innerHTML = "";
        },
    };
}

/* untuk unit test */
export const __test = { ALPHABET, WORDS, STROKES, rng, distractors, makeQuestion, buildQuestion, isCorrect, nextUnlearned, TYPES_ALL };