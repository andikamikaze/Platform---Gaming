/* ================================================================== */
/* GAME: odd-one-out.js  —  new template (export META + mount)         */
/* 1. Save as games/odd-one-out.js (META.id must match the file name). */
/* 2. Regenerate the manifest: node tools/build-games-manifest.mjs     */
/*                                                                    */
/* Odd One Out — minimalist kids duel. 10 turns, 2x3 grid, exactly one */
/* odd picture per turn (color / size / mirror / shape / tilt /        */
/* missing detail). Seeded, validated, always-solvable generator.      */
/* Modes: "ai" = vs bot (local), "room" = 2 players (host-authoritative*/
/* Firebase sync via room.publishState / sendAction). Coin toss picks  */
/* the first player; multiplayer seats are re-randomized every match.  */
/* ================================================================== */

import { iconSVG } from "../JS/icons.js";

export const META = {
    id: "odd-one-out",
    name: "Odd One Out",
    category: "kids",
    catLabel: "Kids",
    desc: "Spot the one picture that is different before the timer runs out. Take turns vs the bot or a friend!",
    art: '<svg viewBox="0 0 48 48" width="54" height="54" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="5" width="15" height="15" rx="3"/><rect x="28" y="5" width="15" height="15" rx="3"/><rect x="5" y="28" width="15" height="15" rx="3"/><circle cx="35.5" cy="35.5" r="7.5"/><path d="M41 41l6 6"/></svg>',
    bg: ["#fed7aa", "#fdba74"],
    bestKey: "oddOneOutBest",
};

/* ---------------- constants ---------------- */

const TURNS = 10;          /* turns per match (5 each) */
const TURN_MS = 15000;     /* ms per turn */
const CELLS = 6;           /* grid: 2 rows x 3 columns */
const BASES = ["fish", "flower", "bug", "star", "rocket"];
const COLORS = ["#f97316", "#22c55e", "#38bdf8", "#ec4899", "#a78bfa", "#facc15"];
const ATTRS = ["color", "size", "flip", "shape", "tilt", "detail"];
const ATTR_FIELD = { color: "color", size: "size", flip: "flip", shape: "shape", tilt: "rot", detail: "detail" };
const FIELDS = ["shape", "color", "size", "flip", "rot", "detail"];

/* bot difficulty: accuracy multiplier + reaction window (ms) */
const DIFF = {
    easy: { acc: 0.62, react: [5200, 10800] },
    normal: { acc: 1.00, react: [2800, 7200] },
    hard: { acc: 1.12, react: [1500, 4200] },
};
const BOT_ACC = { color: 0.85, size: 0.85, flip: 0.66, shape: 0.90, tilt: 0.62, detail: 0.60 };

/* ---------------- seeded RNG + pure, always-solvable round logic ---------------- */

/* mulberry32 - tiny deterministic seeded PRNG */
function mulberry32(seed) {
    let a = seed >>> 0;
    if (!a) a = 0x9e3779b9;
    return function () {
        a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function shuffleArr(arr, rnd) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(rnd() * (i + 1)) % (i + 1);
        const tmp = a[i]; a[i] = a[j]; a[j] = tmp;
    }
    return a;
}

/* Attribute schedule per match: all 6 kinds guaranteed + 4 random extras,
   shuffled from the shared gameSeed so every client builds the same list. */
function scheduleFor(gameSeed) {
    const rnd = mulberry32(gameSeed ^ 0x51ed);
    const extra = shuffleArr(ATTRS, rnd).slice(0, TURNS - ATTRS.length);
    return shuffleArr(ATTRS.concat(extra), rnd);
}

function buildRound(seed, attr) {
    const rnd = mulberry32(seed);
    const baseIdx = Math.floor(rnd() * BASES.length) % BASES.length;
    const base = BASES[baseIdx];
    const oddIdx = Math.floor(rnd() * CELLS) % CELLS;
    const colorIdx = Math.floor(rnd() * COLORS.length) % COLORS.length;
    const items = [];
    for (let i = 0; i < CELLS; i++) {
        items.push({ shape: base, color: COLORS[colorIdx], size: 1, flip: false, rot: 0, detail: 0 });
    }
    const odd = items[oddIdx];
    if (attr === "color") {
        const shift = 1 + (Math.floor(rnd() * (COLORS.length - 1)) % (COLORS.length - 1));
        odd.color = COLORS[(colorIdx + shift) % COLORS.length];
    } else if (attr === "size") {
        odd.size = Math.round((0.6 + rnd() * 0.15) * 100) / 100;   /* 25-40% smaller */
    } else if (attr === "flip") {
        odd.flip = true;
    } else if (attr === "shape") {
        const s = 1 + (Math.floor(rnd() * (BASES.length - 1)) % (BASES.length - 1));
        odd.shape = BASES[(baseIdx + s) % BASES.length];
    } else if (attr === "tilt") {
        const deg = Math.round(22 + rnd() * 18);
        odd.rot = rnd() < 0.5 ? -deg : deg;
    } else {
        odd.detail = 1;                                          /* missing detail */
    }
    return { base, attr, items, oddIdx };
}

/* Solvable = the five non-odd items are identical AND the odd item differs
   from them in exactly the round's attribute (and is visibly different). */
function isSolvable(r) {
    if (!r || !Array.isArray(r.items) || r.items.length !== CELLS) return false;
    const idx = r.oddIdx;
    if (!Number.isInteger(idx) || idx < 0 || idx >= CELLS) return false;
    const f = ATTR_FIELD[r.attr];
    if (!f) return false;
    const others = r.items.filter(function (_, i) { return i !== idx; });
    const a = others[0], odd = r.items[idx];
    if (!a || !odd) return false;
    if (!others.every(function (b) { return FIELDS.every(function (k) { return b[k] === a[k]; }); })) return false;
    if (odd[f] === a[f]) return false;
    if (!FIELDS.every(function (k) { return k === f || odd[k] === a[k]; })) return false;
    if (r.attr === "size" && !(odd.size < a.size)) return false;
    if (r.attr === "tilt" && Math.abs(odd.rot) < 15) return false;
    return true;
}

/* Deterministic generator with validation + retry, so every published
   seed reproduces the exact same solvable puzzle on all clients. */
function makeRound(seed, attr) {
    for (let k = 0; k < 8; k++) {
        const r = buildRound((seed + k * 0x9e3779b9) >>> 0, attr);
        if (isSolvable(r)) return r;
    }
    /* guaranteed-solvable fallback (practically unreachable) */
    const items = [];
    for (let i = 0; i < CELLS; i++) {
        items.push({ shape: "fish", color: COLORS[0], size: 1, flip: false, rot: 0, detail: 0 });
    }
    const odd = items[2];
    if (attr === "color") odd.color = COLORS[2];
    else if (attr === "size") odd.size = 0.65;
    else if (attr === "flip") odd.flip = true;
    else if (attr === "shape") odd.shape = "star";
    else if (attr === "tilt") odd.rot = 30;
    else odd.detail = 1;
    return { base: "fish", attr, items, oddIdx: 2 };
}

function randSeed() { return (Math.random() * 0xffffffff) >>> 0; }
function coin() { return Math.random() < 0.5 ? 0 : 1; }

/* ---------------- cute stroke shapes (100x100 box, all left-right
   asymmetric so mirroring is always visible). d=1 removes one detail. ---------------- */

function pen(c, w) {
    return 'fill="none" stroke="' + c + '" stroke-width="' + w + '" stroke-linecap="round" stroke-linejoin="round"';
}
function blob(c, w, op) {
    return 'fill="' + c + '" fill-opacity="' + op + '" stroke="' + c + '" stroke-width="' + w + '" stroke-linecap="round" stroke-linejoin="round"';
}

const SHAPES = {
    /* fish: tail left, eye right; detail variant loses the eye */
    fish: function (c, d) {
        return (
            "<path " + blob(c, 5, 0.18) + ' d="M34 40 L10 32 L17 50 L10 68 L34 60 Z"/>' +
            "<ellipse " + blob(c, 5, 0.12) + ' cx="58" cy="50" rx="26" ry="18"/>' +
            (d ? "" : '<circle cx="70" cy="45" r="4.2" fill="' + c + '"/>')
        );
    },
    /* flower: one leaf on the right; detail variant loses the leaf */
    flower: function (c, d) {
        return (
            "<path " + pen(c, 5) + ' d="M50 47 C47 62 53 76 50 93"/>' +
            (d ? "" : "<path " + blob(c, 4, 0.2) + ' d="M52 74 C62 63 77 65 81 77 C72 87 58 84 52 74 Z"/>') +
            "<circle " + blob(c, 4.5, 0.18) + ' cx="50" cy="19" r="9.5"/>' +
            "<circle " + blob(c, 4.5, 0.18) + ' cx="65.2" cy="30.1" r="9.5"/>' +
            "<circle " + blob(c, 4.5, 0.18) + ' cx="59.4" cy="47.9" r="9.5"/>' +
            "<circle " + blob(c, 4.5, 0.18) + ' cx="40.6" cy="47.9" r="9.5"/>' +
            "<circle " + blob(c, 4.5, 0.18) + ' cx="34.8" cy="30.1" r="9.5"/>' +
            "<circle " + blob(c, 4.5, 0.55) + ' cx="50" cy="35" r="8"/>'
        );
    },
    /* bug: asymmetric spots; detail variant loses the two right spots */
    bug: function (c, d) {
        return (
            "<path " + pen(c, 4) + ' d="M43 18 C40 10 34 7 29 9"/>' +
            "<path " + pen(c, 4) + ' d="M57 18 C60 10 66 7 71 9"/>' +
            "<circle " + blob(c, 5, 0.3) + ' cx="50" cy="26" r="10"/>' +
            "<ellipse " + blob(c, 5, 0.12) + ' cx="50" cy="58" rx="23" ry="27"/>' +
            "<path " + pen(c, 3) + ' d="M50 33 L50 84" opacity=".55"/>' +
            '<circle cx="41" cy="50" r="4.6" fill="' + c + '"/>' +
            '<circle cx="44" cy="68" r="3.6" fill="' + c + '"/>' +
            (d ? "" :
                '<circle cx="60" cy="60" r="5.4" fill="' + c + '"/>' +
                '<circle cx="58" cy="43" r="3.4" fill="' + c + '"/>') +
            "<path " + pen(c, 4) + ' d="M27 48 L17 44 M27 60 L16 60 M28 71 L19 76 M73 48 L83 44 M73 60 L84 60 M72 71 L81 76"/>'
        );
    },
    /* star: tilted + sparkles upper right; detail variant loses sparkles */
    star: function (c, d) {
        return (
            (d ? "" : "<path " + pen(c, 4.5) + ' d="M86 22 L93 15 M78 10 L83 4"/>') +
            "<polygon " + blob(c, 5, 0.15) +
            ' transform="rotate(16 52 48)" points="52,18 59.4,37.9 80.5,38.7 63.9,51.9 69.6,72.3 52,60.5 34.4,72.3 40.1,51.9 23.5,38.7 44.7,37.9"/>'
        );
    },
    /* rocket: tilted, asymmetric flames; detail variant loses the window */
    rocket: function (c, d) {
        return (
            '<g transform="rotate(20 50 52)">' +
            "<path " + pen(c, 4) + ' d="M44 76 C41 87 46 93 44 98"/>' +
            "<path " + pen(c, 4) + ' d="M56 76 C59 84 55 89 57 93"/>' +
            "<path " + blob(c, 4, 0.25) + ' d="M37 54 L24 73 L37 69 Z"/>' +
            "<path " + blob(c, 4, 0.25) + ' d="M63 54 L76 73 L63 69 Z"/>' +
            "<path " + blob(c, 5, 0.12) + ' d="M50 6 C58 18 63 33 63 47 L63 60 C63 69 57 73 50 73 C43 73 37 69 37 60 L37 47 C37 33 42 18 50 6 Z"/>' +
            (d ? "" : "<circle " + pen(c, 4) + ' cx="50" cy="40" r="7.5"/>') +
            "</g>"
        );
    },
};

function cellSvg(it) {
    const sx = (it.flip ? -1 : 1) * it.size;
    const sy = it.size;
    const t = "translate(50 50) rotate(" + (it.rot || 0) + ") scale(" + sx.toFixed(3) + " " + sy.toFixed(3) + ") translate(-50 -50)";
    return '<svg viewBox="0 0 100 100" aria-hidden="true"><g transform="' + t + '">' + SHAPES[it.shape](it.color, it.detail) + "</g></svg>";
}

function promptFor(attr) {
    if (attr === "color") return "🎨 One picture has a different color — tap it!";
    if (attr === "size") return "📏 One picture is smaller — tap it!";
    if (attr === "flip") return "🪞 One picture is mirrored — tap it!";
    if (attr === "shape") return "🔷 One picture is a different shape — tap it!";
    if (attr === "tilt") return "🌀 One picture is tilted — tap it!";
    return "🔍 One picture is missing a detail — tap it!";
}

/* ================================================================== */
/* mount                                                              */
/* ================================================================== */

export function mount(root, context = {}) {
    const { mode = "ai", room = null, playerName = "Player", onExit = () => { } } = context;
    const online = mode === "room" && Boolean(room);
    const vsBot = !online;
    let roomData = room?.room || null;
    let state = null;
    let destroyed = false;

    root.innerHTML = `
<style>
.ooo-root{--ooo-ink:#26313f;--ooo-muted:#7b8494;--ooo-line:#e7e3da;--ooo-paper:#ffffff;--ooo-soft:#faf8f4;--ooo-accent:#f97316;--ooo-accent-soft:#fff3e8;--ooo-good:#16a34a;--ooo-good-soft:#f0fdf4;--ooo-bad:#dc2626;--ooo-bad-soft:#fef2f2;--ooo-warn:#d97706;--ooo-warn-soft:#fffbeb;color:var(--ooo-ink);width:100%;min-width:0}
.ooo-root *{box-sizing:border-box}
.ooo-root [hidden]{display:none!important}
.ooo-root.ooo-game{min-height:0}
.ooo-root .ooo-hud{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:8px;padding:8px 10px;background:var(--ooo-paper);border:1px solid var(--ooo-line);border-radius:10px;font:600 11px/1.3 ui-monospace,SFMono-Regular,Menlo,monospace}
.ooo-root .ooo-chip{display:inline-flex;align-items:center;gap:5px;padding:5px 9px;min-height:32px;background:var(--ooo-soft);border:1px solid var(--ooo-line);border-radius:999px;white-space:nowrap;color:var(--ooo-muted);font-size:11px;font-weight:700}
.ooo-root .ooo-chip b{color:var(--ooo-ink);font-size:13px;font-variant-numeric:tabular-nums}
.ooo-root .ooo-hud .game-status{gap:5px}
.ooo-root .ooo-seat{flex:0 0 auto;gap:5px}
.ooo-root .ooo-seat.ooo-active{border-color:var(--ooo-accent);background:var(--ooo-accent-soft)}
.ooo-root .ooo-seat-name{max-width:88px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ooo-root .ooo-seat-score{font-size:14px}
.ooo-root .ooo-seat-tag{font-size:9px;letter-spacing:.04em;color:var(--ooo-muted)}
.ooo-root .ooo-seat.ooo-active .ooo-seat-tag{color:var(--ooo-accent)}
.ooo-root .ooo-vs{font-size:10px;font-weight:800;color:var(--ooo-muted)}
.ooo-root .ooo-meta{max-width:260px;overflow:hidden;text-overflow:ellipsis}
.ooo-root .ooo-timer-row{gap:6px}
.ooo-root .ooo-timer{width:76px;height:6px;border-radius:999px;background:var(--ooo-line);overflow:hidden}
.ooo-root .ooo-timer-fill{display:block;height:100%;width:100%;border-radius:999px;background:var(--ooo-accent)}
.ooo-root .ooo-timer-row.ooo-low .ooo-timer-fill{background:var(--ooo-bad)}
.ooo-root .ooo-timer-row.ooo-frozen .ooo-timer-fill{background:#38bdf8}
.ooo-root .ooo-timer-num{min-width:22px;text-align:center;font-size:12px;font-weight:800;font-variant-numeric:tabular-nums;color:var(--ooo-ink)}
.ooo-root .ooo-timer-row.ooo-low .ooo-timer-num{color:var(--ooo-bad)}
.ooo-root .ooo-spacer{flex:1 1 auto}
.ooo-root .ooo-hud .ooo-btn{display:inline-flex;align-items:center;gap:6px;min-height:32px;padding:5px 9px;border:1px solid var(--ooo-line);border-radius:8px;background:var(--ooo-paper);color:var(--ooo-ink);font:700 11px/1 ui-monospace,SFMono-Regular,Menlo,monospace;cursor:pointer;touch-action:manipulation;transition:border-color .16s,background .16s}
.ooo-root .ooo-hud .ooo-btn svg{flex:none;display:block}
.ooo-root .ooo-hud .ooo-btn:hover{border-color:var(--ooo-accent)}
.ooo-root .ooo-hud .ooo-btn.ooo-on{border-color:var(--ooo-accent);background:var(--ooo-accent-soft)}
.ooo-root .ooo-hud .ooo-btn:disabled{opacity:.45;cursor:default}
.ooo-root .ooo-hud .ooo-btn:focus-visible,.ooo-root .ooo-vbtn:focus-visible,.ooo-root .ooo-cell:focus-visible{outline:2px solid var(--ooo-accent);outline-offset:2px}
.ooo-root .ooo-game>.ooo-panel{flex:1 1 auto;min-height:0;position:relative;display:flex;align-items:center;justify-content:center;overflow:hidden;border-radius:12px}
.ooo-root .ooo-play{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;width:100%;max-width:620px;margin:0 auto;padding:8px 4px}
.ooo-root .ooo-prompt{font-size:14px;font-weight:700;text-align:center;min-height:20px;line-height:1.4}
.ooo-root .ooo-grid{display:grid;grid-template-columns:repeat(3,minmax(0,150px));gap:8px;justify-content:center;width:100%}
.ooo-root .ooo-cell{position:relative;aspect-ratio:1/1;appearance:none;background:var(--ooo-paper);border:1px solid var(--ooo-line);border-radius:12px;padding:8px;cursor:default;transition:transform .16s,border-color .16s,background .16s,box-shadow .16s;-webkit-tap-highlight-color:transparent}
.ooo-root .ooo-cell svg{width:100%;height:100%;display:block;pointer-events:none}
.ooo-root .ooo-num{position:absolute;top:5px;left:8px;font-size:10px;font-weight:700;color:var(--ooo-muted);pointer-events:none}
.ooo-root .ooo-grid.ooo-mine .ooo-cell{cursor:pointer}
.ooo-root .ooo-grid.ooo-mine .ooo-cell:hover{border-color:#f3c9a8;transform:translateY(-2px)}
.ooo-root .ooo-grid.ooo-mine .ooo-cell:active{transform:scale(.96)}
.ooo-root .ooo-cell.ooo-cursor{box-shadow:0 0 0 3px rgba(249,115,22,.35);border-color:var(--ooo-accent)}
.ooo-root .ooo-cell.ooo-xray{outline:2px dashed var(--ooo-accent);outline-offset:3px}
.ooo-root .ooo-cell.ooo-look{border-color:#93c5fd;background:#eff6ff}
.ooo-root .ooo-cell.ooo-good{border-color:var(--ooo-good);background:var(--ooo-good-soft);animation:ooo-pop .5s ease}
.ooo-root .ooo-cell.ooo-bad{border-color:var(--ooo-bad);background:var(--ooo-bad-soft);animation:ooo-shake .45s ease}
.ooo-root .ooo-cell.ooo-reveal{border-color:var(--ooo-warn);background:var(--ooo-warn-soft);animation:ooo-pulse .8s ease infinite}
.ooo-root .ooo-msg{min-height:20px;font-size:13px;font-weight:600;color:var(--ooo-muted);text-align:center;line-height:1.4}
.ooo-root .ooo-pad{display:flex;flex-direction:column;gap:8px;margin-top:8px}
.ooo-root .ooo-nums{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:4px}
.ooo-root .ooo-dpad{display:grid;grid-template-columns:repeat(4,44px) minmax(0,1fr);gap:4px;justify-content:center}
.ooo-root .ooo-vbtn{min-height:44px;background:var(--ooo-paper);border:1px solid var(--ooo-line);border-radius:10px;font-size:15px;font-weight:800;color:var(--ooo-ink);cursor:pointer;touch-action:manipulation}
.ooo-root .ooo-vbtn:active{transform:scale(.95);border-color:var(--ooo-accent)}
.ooo-root .ooo-vbtn.ooo-pick{background:var(--ooo-accent);border-color:var(--ooo-accent);color:#fff;letter-spacing:.08em}
.ooo-root .ooo-ov{position:absolute;inset:0;z-index:6;display:flex;align-items:center;justify-content:center;padding:12px;background:rgba(250,248,244,.88);backdrop-filter:blur(3px);border-radius:12px}
.ooo-root .ooo-card{display:flex;flex-direction:column;width:100%;max-width:430px;max-height:100%;overflow:hidden;background:var(--ooo-paper);border:1px solid var(--ooo-line);border-radius:12px;padding:14px;text-align:center}
.ooo-root .ooo-head{flex:none;display:flex;align-items:center;justify-content:center;gap:8px}
.ooo-root .ooo-foot{flex:none;padding-top:10px;margin-top:10px;border-top:1px solid var(--ooo-line)}
.ooo-root .ooo-scroll{flex:1 1 auto;min-height:0;overflow:auto;text-align:left;scrollbar-width:none}
.ooo-root .ooo-scroll::-webkit-scrollbar{display:none}
.ooo-root .ooo-ov-title{margin:0;font-size:19px;font-weight:800}
.ooo-root .ooo-ov-sub{margin:0 0 8px;font-size:13px;line-height:1.5;color:var(--ooo-muted);text-align:center}
.ooo-root .ooo-ov-note{margin:0 0 10px;font-size:12px;font-weight:700;color:var(--ooo-accent);text-align:center}
.ooo-root .ooo-ov-badge{margin:0 0 8px;font-size:12px;font-weight:800;color:var(--ooo-warn);text-align:center}
.ooo-root .ooo-ov-wait{margin:8px 0 0;font-size:12px;font-weight:700;color:var(--ooo-muted);text-align:center}
.ooo-root .ooo-ov-btns{display:flex;gap:8px;justify-content:center;flex-wrap:wrap}
.ooo-root .ooo-btn{appearance:none;border:1px solid var(--ooo-accent);background:var(--ooo-accent);color:#fff;font-weight:800;font-size:14px;padding:8px 16px;min-height:44px;border-radius:10px;cursor:pointer;transition:filter .16s}
.ooo-root .ooo-btn:hover{filter:brightness(1.05)}
.ooo-root .ooo-btn:focus-visible{outline:2px solid var(--ooo-accent);outline-offset:2px}
.ooo-root .ooo-btn.ghost{background:var(--ooo-paper);color:var(--ooo-ink);border-color:var(--ooo-line)}
.ooo-root .ooo-btn.ooo-mini{padding:6px 12px;min-height:36px;font-size:12px}
.ooo-root .ooo-btn:disabled{opacity:.45;cursor:default}
.ooo-root .ooo-diffrow{display:flex;align-items:center;justify-content:center;gap:6px;flex-wrap:wrap;margin-bottom:4px}
.ooo-root .ooo-difflabel{font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.05em;color:var(--ooo-muted)}
.ooo-root .ooo-diffchip{border:1px solid var(--ooo-line);background:var(--ooo-paper);border-radius:999px;padding:6px 12px;min-height:36px;font-size:12px;font-weight:700;cursor:pointer;color:var(--ooo-ink);transition:border-color .16s,background .16s}
.ooo-root .ooo-diffchip.ooo-sel{border-color:var(--ooo-accent);background:var(--ooo-accent-soft);color:var(--ooo-accent)}
.ooo-root .ooo-help ul{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:8px}
.ooo-root .ooo-help li{font-size:12.5px;line-height:1.5;color:var(--ooo-ink)}
.ooo-root .ooo-cheat-row{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:8px 0;min-height:44px;border-bottom:1px dashed var(--ooo-line);text-align:left}
.ooo-root .ooo-cheat-row b{display:block;font-size:13px}
.ooo-root .ooo-cheat-row small{display:block;font-size:11px;color:var(--ooo-muted);line-height:1.35}
.ooo-root .ooo-switch{position:relative;flex:none;width:44px;height:24px;border-radius:999px;border:1px solid var(--ooo-line);background:#e8e4db;cursor:pointer;transition:background .16s,border-color .16s;padding:0}
.ooo-root .ooo-switch::after{content:"";position:absolute;top:2px;left:2px;width:18px;height:18px;border-radius:50%;background:#fff;transition:transform .16s}
.ooo-root .ooo-switch[aria-checked="true"]{background:var(--ooo-accent);border-color:var(--ooo-accent)}
.ooo-root .ooo-switch[aria-checked="true"]::after{transform:translateX(20px)}
.ooo-root .ooo-cheat-note{margin:8px 0 0;font-size:11px;color:var(--ooo-muted);line-height:1.45;text-align:left}
.ooo-root .game-status-dot{background:#9ca3af}
.ooo-root .game-status[data-tone="you"] .game-status-dot{background:var(--ooo-good)}
.ooo-root .game-status[data-tone="bot"] .game-status-dot{background:#38bdf8}
.ooo-root .game-status[data-tone="wait"] .game-status-dot{background:var(--ooo-warn)}
.ooo-root .game-status[data-tone="bad"] .game-status-dot{background:var(--ooo-bad)}
@keyframes ooo-pop{0%{transform:scale(1)}45%{transform:scale(1.08)}100%{transform:scale(1)}}
@keyframes ooo-shake{0%,100%{transform:translateX(0)}25%{transform:translateX(-6px)}65%{transform:translateX(6px)}}
@keyframes ooo-pulse{0%,100%{box-shadow:0 0 0 0 rgba(217,119,6,.5)}55%{box-shadow:0 0 0 10px rgba(217,119,6,0)}}
@media (max-width:640px){
.ooo-root.ooo-game>.ooo-panel{flex:0 0 auto;min-height:0}
.ooo-root.ooo-game>.ooo-panel:has(.ooo-ov:not([hidden])){min-height:min(70dvh,620px)}
.ooo-root .ooo-grid{grid-template-columns:repeat(3,minmax(0,1fr));gap:4px}
.ooo-root .ooo-cell{padding:7px;border-radius:10px}
.ooo-root .ooo-prompt{font-size:12px}
.ooo-root .ooo-msg{font-size:11px}
.ooo-root .ooo-hud{gap:5px;padding:6px 8px;margin-bottom:6px}
.ooo-root .ooo-hud .ooo-chip{padding:4px 7px;min-height:28px;font-size:9px}
.ooo-root .ooo-hud .ooo-seat-name{max-width:56px}
.ooo-root .ooo-hud .ooo-seat-tag,.ooo-root .ooo-hud .ooo-meta,.ooo-root .ooo-hud .ooo-vs,.ooo-root .ooo-hud .ooo-btn-label,.ooo-root .ooo-hud .ooo-spacer{display:none}
.ooo-root .ooo-hud .ooo-timer{width:54px}
.ooo-root .ooo-hud .ooo-btn{min-width:32px;min-height:32px;padding:5px 7px;font-size:9px}
.ooo-root .ooo-card{width:100%;height:100%;max-height:100%;padding:12px;border-radius:12px}
.ooo-root .ooo-dpad{grid-template-columns:repeat(4,minmax(0,1fr)) minmax(72px,1.4fr)}
.ooo-root .ooo-vbtn{min-height:44px}
}
@media (prefers-reduced-motion:reduce){.ooo-root *{animation:none!important;transition-duration:.01ms!important}}
</style>
<div class="game-app ooo-root ooo-game game-fill">
  <div class="ooo-hud">
    <span class="game-status ooo-chip" data-statuswrap><i class="game-status-dot"></i><span data-status aria-live="polite">Ready</span></span>
    <span class="ooo-chip ooo-seat" data-seat="0">
      <span class="ooo-seat-name" data-name>Player 1</span><b class="ooo-seat-score" data-score>0</b><span class="ooo-seat-tag" data-tag></span>
    </span>
    <span class="ooo-vs">vs</span>
    <span class="ooo-chip ooo-seat" data-seat="1">
      <span class="ooo-seat-name" data-name>Player 2</span><b class="ooo-seat-score" data-score>0</b><span class="ooo-seat-tag" data-tag></span>
    </span>
    <span class="ooo-chip ooo-meta" data-meta></span>
    <span class="ooo-chip ooo-timer-row" data-timer-row>
      <span class="ooo-timer" role="progressbar" aria-label="Time left" aria-valuemin="0" aria-valuemax="${TURN_MS / 1000}" data-timerbar>
        <i class="ooo-timer-fill" data-timer></i>
      </span>
      <span class="ooo-timer-num" data-tnum>${TURN_MS / 1000}</span>
    </span>
    <span class="ooo-spacer"></span>
    <button class="ooo-btn" type="button" data-help aria-label="How to play" title="How to play (H)">${iconSVG("helpCircle", { size: 14 })}<span class="ooo-btn-label">Help</span></button>
    <button class="ooo-btn" type="button" data-cheats aria-label="Cheats" title="Cheats (C)">${iconSVG("wrench", { size: 14 })}<span class="ooo-btn-label">Cheats</span></button>
    <button class="ooo-btn" type="button" data-act="pad" data-pad-btn aria-label="On-screen buttons" title="On-screen buttons">${iconSVG("gamepad2", { size: 14 })}<span class="ooo-btn-label">Buttons</span></button>
    <button class="ooo-btn" type="button" data-pause data-pause-btn aria-label="Pause" title="Pause (P)">${iconSVG("pause", { size: 14 })}<span class="ooo-btn-label">Pause</span></button>
    <button class="ooo-btn" type="button" data-restart data-restart-btn aria-label="Restart" title="Restart (R)">${iconSVG("refresh", { size: 14 })}<span class="ooo-btn-label">Restart</span></button>
    <button class="ooo-btn" type="button" data-exit aria-label="Exit game" title="Exit game">${iconSVG("logOut", { size: 14 })}<span class="ooo-btn-label">Exit</span></button>
  </div>

  <section class="game-panel ooo-panel" data-board>
    <div class="ooo-play">
      <div class="ooo-prompt" data-prompt></div>
      <div class="ooo-grid" data-grid role="group" aria-label="Six pictures — find the odd one"></div>
      <div class="ooo-msg" data-msg aria-live="polite"></div>
    </div>

    <div class="ooo-ov" data-ov="intro">
      <div class="ooo-card">
        <div class="ooo-head"><h3 class="ooo-ov-title">Odd One Out</h3></div>
        <div class="ooo-scroll">
          <p class="ooo-ov-sub">Each turn shows six pictures and exactly one is different — another color, smaller, mirrored, another shape, tilted, or missing a detail. Tap it before the ${TURN_MS / 1000}-second bar empties!</p>
          <p class="ooo-ov-note" data-intro-note>🪙 A coin toss decides who starts.</p>
          <div class="ooo-diffrow" data-diffrow>
            <span class="ooo-difflabel">Bot level</span>
            <button type="button" class="ooo-diffchip" data-act="difficulty" data-val="easy">Easy</button>
            <button type="button" class="ooo-diffchip" data-act="difficulty" data-val="normal">Normal</button>
            <button type="button" class="ooo-diffchip" data-act="difficulty" data-val="hard">Hard</button>
          </div>
          <p class="ooo-ov-wait" data-intro-wait hidden>Waiting for the host to start…</p>
        </div>
        <div class="ooo-foot">
          <div class="ooo-ov-btns">
            <button type="button" class="ooo-btn" data-restart data-startbtn>Start game</button>
            <button type="button" class="ooo-btn ghost" data-help>How to play</button>
          </div>
        </div>
      </div>
    </div>

    <div class="ooo-ov" data-ov="help" hidden>
      <div class="ooo-card ooo-help">
        <div class="ooo-head">
          <h3 class="ooo-ov-title">How to play</h3>
          <button class="ooo-btn ghost ooo-mini" type="button" data-act="close-help" aria-label="Close help" title="Close help">${iconSVG("x", { size: 14 })}</button>
        </div>
        <div class="ooo-scroll">
          <ul>
            <li>🎯 <b>Goal</b> — six pictures appear; exactly one is different. Pick it before the timer empties to score 1 point.</li>
            <li>🔀 <b>Turns</b> — you and your opponent alternate for ${TURNS} turns (${TURNS / 2} each). A coin toss picks who goes first; in multiplayer your Player 1 / Player 2 seat is also random every match.</li>
            <li>🏆 <b>Winning</b> — most points after ${TURNS} turns wins. Equal scores = draw.</li>
            <li>🧩 <b>What can differ</b> — 🎨 color · 📏 size · 🪞 mirror · 🔷 shape · 🌀 tilt · 🔍 missing detail. The prompt above the grid always tells you what to look for.</li>
            <li>🖱 <b>Mouse</b> — hover to aim, click to pick.</li>
            <li>⌨ <b>Keyboard</b> — 1–6 pick directly, arrows or WASD move the ring, Enter/Space picks, H help, C cheats, P pause, R restart.</li>
            <li>📱 <b>Touch</b> — tap a picture, or use the number row and D-pad from the Buttons control in the HUD.</li>
            <li>🛠 <b>Cheats</b> — press C for X-ray vision, timer freeze, +10s, auto-answer and a clumsy bot. Cheated matches are marked “assisted”.</li>
          </ul>
        </div>
        <div class="ooo-foot"><div class="ooo-ov-btns"><button type="button" class="ooo-btn" data-act="close-help">Got it</button></div></div>
      </div>
    </div>

    <div class="ooo-ov" data-ov="cheats" hidden>
      <div class="ooo-card">
        <div class="ooo-head">
          <h3 class="ooo-ov-title">🛠 Cheat menu</h3>
          <button class="ooo-btn ghost ooo-mini" type="button" data-act="close-cheats" aria-label="Close cheats" title="Close cheats">${iconSVG("x", { size: 14 })}</button>
        </div>
        <div class="ooo-scroll">
          <div class="ooo-cheat-row">
            <div><b>👁 X-ray vision</b><small>Outline the odd picture (only you see it).</small></div>
            <button type="button" class="ooo-switch" role="switch" aria-checked="false" data-cheat="xray" aria-label="X-ray vision"></button>
          </div>
          <div class="ooo-cheat-row">
            <div><b>❄️ Freeze timer</b><small>Stop the countdown for everyone.</small></div>
            <button type="button" class="ooo-switch" role="switch" aria-checked="false" data-cheat="freeze" aria-label="Freeze timer"></button>
          </div>
          <div class="ooo-cheat-row" data-weakrow>
            <div><b>🤖 Clumsy bot</b><small>The bot gets slow and forgetful.</small></div>
            <button type="button" class="ooo-switch" role="switch" aria-checked="false" data-cheat="weak" aria-label="Clumsy bot"></button>
          </div>
          <div class="ooo-cheat-row">
            <div><b>⏱ +10 seconds</b><small>Add time to the current turn.</small></div>
            <button type="button" class="ooo-btn ghost ooo-mini" data-cheat="time">+10s</button>
          </div>
          <div class="ooo-cheat-row">
            <div><b>🎯 Auto-answer</b><small>Instantly pick the odd one (your turn only).</small></div>
            <button type="button" class="ooo-btn ghost ooo-mini" data-cheat="auto">Solve</button>
          </div>
          <p class="ooo-cheat-note">Using cheats marks this match as “assisted”. The game keeps running while this menu is open — freeze the timer first if you need a pause.</p>
        </div>
        <div class="ooo-foot"><div class="ooo-ov-btns"><button type="button" class="ooo-btn" data-act="close-cheats">Close</button></div></div>
      </div>
    </div>

    <div class="ooo-ov" data-ov="pause" hidden>
      <div class="ooo-card">
        <div class="ooo-head"><h3 class="ooo-ov-title">Paused</h3></div>
        <div class="ooo-scroll"><p class="ooo-ov-sub">The timer and the bot are stopped. Take your time — nothing will count down.</p></div>
        <div class="ooo-foot"><div class="ooo-ov-btns"><button type="button" class="ooo-btn" data-act="resume">Resume</button></div></div>
      </div>
    </div>

    <div class="ooo-ov" data-ov="over" hidden>
      <div class="ooo-card">
        <div class="ooo-head"><h3 class="ooo-ov-title" data-ov-title>Game over</h3></div>
        <div class="ooo-scroll">
          <p class="ooo-ov-sub" data-ov-reason></p>
          <p class="ooo-ov-badge" data-ov-badge hidden>🛠 assisted match</p>
          <p class="ooo-ov-wait" data-over-wait hidden>Waiting for the host to start a rematch…</p>
        </div>
        <div class="ooo-foot">
          <div class="ooo-ov-btns">
            <button type="button" class="ooo-btn" data-restart data-againbtn>Play again</button>
            <button type="button" class="ooo-btn ghost" data-help>How to play</button>
          </div>
        </div>
      </div>
    </div>
  </section>

  <div class="ooo-pad" data-padwrap hidden>
    <div class="ooo-nums">
      <button type="button" class="ooo-vbtn" data-num="0">1</button>
      <button type="button" class="ooo-vbtn" data-num="1">2</button>
      <button type="button" class="ooo-vbtn" data-num="2">3</button>
      <button type="button" class="ooo-vbtn" data-num="3">4</button>
      <button type="button" class="ooo-vbtn" data-num="4">5</button>
      <button type="button" class="ooo-vbtn" data-num="5">6</button>
    </div>
    <div class="ooo-dpad">
      <button type="button" class="ooo-vbtn" data-pad="left" aria-label="Move left">◀</button>
      <button type="button" class="ooo-vbtn" data-pad="up" aria-label="Move up">▲</button>
      <button type="button" class="ooo-vbtn" data-pad="down" aria-label="Move down">▼</button>
      <button type="button" class="ooo-vbtn" data-pad="right" aria-label="Move right">▶</button>
      <button type="button" class="ooo-vbtn ooo-pick" data-pad="pick">PICK</button>
    </div>
  </div>
</div>`;

    /* ---------------- refs ---------------- */
    const $ = (s) => root.querySelector(s);
    const $$ = (s) => Array.from(root.querySelectorAll(s));
    const gridEl = $("[data-grid]");
    const msgEl = $("[data-msg]");
    const promptEl = $("[data-prompt]");
    const metaEl = $("[data-meta]");
    const timerRow = $("[data-timer-row]");
    const timerBar = $("[data-timerbar]");
    const timerFill = $("[data-timer]");
    const tnumEl = $("[data-tnum]");
    const statusEl = $("[data-status]");
    const statusWrap = $("[data-statuswrap]");
    const seatEls = $$("[data-seat]");
    const padWrap = $("[data-padwrap]");
    const ovIntro = $('[data-ov="intro"]');
    const ovHelp = $('[data-ov="help"]');
    const ovCheats = $('[data-ov="cheats"]');
    const ovPause = $('[data-ov="pause"]');
    const ovOver = $('[data-ov="over"]');
    const introNote = $("[data-intro-note]");
    const introWait = $("[data-intro-wait]");
    const diffRow = $("[data-diffrow]");
    const diffChips = $$('[data-act="difficulty"]');
    const startBtn = $("[data-startbtn]");
    const againBtn = $("[data-againbtn]");
    const overWait = $("[data-over-wait]");
    const ovTitle = $("[data-ov-title]");
    const ovReason = $("[data-ov-reason]");
    const ovBadge = $("[data-ov-badge]");
    const weakRow = $("[data-weakrow]");
    const restartBtn = $('[data-restart-btn]');
    const pauseBtn = $('[data-pause-btn]');
    const padBtn = $('[data-pad-btn]');
    const cheatBtns = {
        xray: $('[data-cheat="xray"]'),
        freeze: $('[data-cheat="freeze"]'),
        weak: $('[data-cheat="weak"]'),
        time: $('[data-cheat="time"]'),
        auto: $('[data-cheat="auto"]'),
    };

    /* ---------------- local UI state (never synced) ---------------- */
    function readBest() {
        try { return Math.max(0, Number(localStorage.getItem(META.bestKey)) || 0); } catch (e) { return 0; }
    }
    function saveBest(v) {
        try { localStorage.setItem(META.bestKey, String(v)); } catch (e) { /* private mode */ }
    }
    const coarse = typeof matchMedia === "function" &&
        (matchMedia("(pointer:coarse)").matches || matchMedia("(max-width:720px)").matches);
    const ui = {
        cursor: 0, xray: false, botWeak: false,
        pad: coarse, botLook: -1, nextLookAt: 0, botPlan: null,
        roundKey: "", gridKey: "", round: null, sched: null, schedKey: "",
        localAssisted: false, best: readBest(), bestSaved: false,
    };

    /* Overlay flags are local UI only — never published to the room. */
    let helpOpen = false, cheatsOpen = false, paused = false;
    let timeHoldAt = 0;   /* Date.now() when pause/help suspended the clock */

    let seenHelp = true;
    try { seenHelp = localStorage.getItem("oddOneOutHelpSeen") === "1"; } catch (e) { seenHelp = true; }
    if (!seenHelp) {
        helpOpen = true;
        timeHoldAt = Date.now();
        try { localStorage.setItem("oddOneOutHelpSeen", "1"); } catch (e) { /* storage blocked */ }
    }

    /* Shift every absolute time anchor by the time spent paused / in help,
       so resuming never burns a chunk of the turn or fires the bot at once. */
    function shiftTime(delta) {
        if (!delta || !state) return;
        if (!state.frozen && state.phase === "playing") state.deadline += delta;
        if (state.reveal) state.reveal.until += delta;
        if (ui.botPlan) ui.botPlan.at += delta;
        if (ui.nextLookAt) ui.nextLookAt += delta;
    }
    function updateTimeHold() {
        const held = paused || helpOpen;
        if (held && !timeHoldAt) timeHoldAt = Date.now();
        else if (!held && timeHoldAt) {
            const delta = Date.now() - timeHoldAt;
            timeHoldAt = 0;
            shiftTime(delta);
            lastNow = Date.now();
            if (online && room.isHost) room.publishState(state).catch(console.warn);
        }
    }
    function setPaused(on) {
        if (online && !room.isHost) return;
        paused = typeof on === "boolean" ? on : !paused;
        updateTimeHold();
        render();
    }
    function toggleHelp(on) {
        helpOpen = typeof on === "boolean" ? on : !helpOpen;
        if (helpOpen) cheatsOpen = false;
        updateTimeHold();
        render();
    }
    function toggleCheats(on) {
        cheatsOpen = typeof on === "boolean" ? on : !cheatsOpen;
        if (cheatsOpen) helpOpen = false;
        updateTimeHold();
        render();
    }
    function restartMatch() {
        paused = false; helpOpen = false; cheatsOpen = false;
        updateTimeHold();
        submitAction({ type: "restart" });
    }

    /* ---------------- seats / names ---------------- */
    /* Multiplayer seats are randomized: the host rolls hostSeat every match,
       so "who is Player 1" changes each game. The guest's seat is derived. */
    function mySeat() {
        if (!online) return 0;
        if (!state) return null;
        return room.isHost ? state.hostSeat : 1 - state.hostSeat;
    }
    function guestSeat() { return state ? 1 - state.hostSeat : 1; }
    function isMyTurn() { return !!state && state.phase === "playing" && mySeat() === state.activeSeat; }
    function seatLabel(s) { return "Player " + (s + 1); }
    function displayName(s) {
        if (!state) return seatLabel(s);
        if (vsBot) return s === 0 ? (playerName || "You") : "Bot";
        if (s === mySeat()) return playerName || "You";
        return state.names[s] || seatLabel(s);
    }

    /* ---------------- deterministic round cache ---------------- */
    function currentRound() {
        if (!state) return null;
        const t = Math.min(state.turn, TURNS - 1);
        const key = state.gameSeed + ":" + t + ":" + state.seed;
        if (ui.roundKey !== key) {
            if (ui.schedKey !== state.gameSeed) {
                ui.sched = scheduleFor(state.gameSeed);
                ui.schedKey = state.gameSeed;
            }
            ui.round = makeRound(state.seed, ui.sched[t] || "color");
            ui.roundKey = key;
        }
        return ui.round;
    }

    /* ---------------- canonical state (serializable) ---------------- */
    function buildNames(hostSeat) {
        const names = ["Player 1", "Player 2"];
        if (vsBot) { names[0] = playerName || "You"; names[1] = "Bot"; }
        else { names[hostSeat] = playerName || "Host"; names[1 - hostSeat] = "Guest"; }
        return names;
    }
    function initialState() {
        const hostSeat = online ? coin() : 0;
        return {
            v: 1, phase: "intro", turn: 0, gameSeed: randSeed(), seed: randSeed(),
            firstSeat: coin(), hostSeat, activeSeat: 0, scores: [0, 0],
            names: buildNames(hostSeat), difficulty: "normal",
            deadline: 0, frozen: false, frozenLeft: TURN_MS,
            reveal: null, winner: null, cheated: false,
        };
    }
    function newMatch() {
        const keepDiff = state ? state.difficulty : "normal";
        const hostSeat = online ? coin() : 0;   /* random seats every match */
        const first = coin();                   /* random first player every match */
        state = {
            v: 1, phase: "playing", turn: 0, gameSeed: randSeed(), seed: randSeed(),
            firstSeat: first, hostSeat, activeSeat: first, scores: [0, 0],
            names: buildNames(hostSeat), difficulty: keepDiff,
            deadline: Date.now() + TURN_MS, frozen: false, frozenLeft: TURN_MS,
            reveal: null, winner: null, cheated: false,
        };
        publish();
    }
    function resolve(picked) {
        const rd = currentRound();
        const correct = picked === rd.oddIdx;
        if (correct) state.scores[state.activeSeat] += 1;
        state.phase = "reveal";
        state.reveal = {
            picked, correct, oddIdx: rd.oddIdx, seat: state.activeSeat,
            until: Date.now() + (correct ? 900 : 1600),
        };
        publish();
    }
    function advanceTurn() {
        state.turn += 1;
        state.reveal = null;
        if (state.turn >= TURNS) {
            state.phase = "over";
            state.winner = state.scores[0] === state.scores[1] ? -1 : (state.scores[0] > state.scores[1] ? 0 : 1);
            publish();
            return;
        }
        state.seed = randSeed();
        state.activeSeat = (state.firstSeat + state.turn) % 2;
        state.phase = "playing";
        if (state.frozen) state.frozenLeft = TURN_MS;
        else state.deadline = Date.now() + TURN_MS;
        publish();
    }

    /* ---------------- actions: validate -> mutate -> publish ---------------- */
    function publish() {
        if (destroyed) return;
        render();
        if (online && room.isHost) room.publishState(state).catch(console.warn);
    }
    function submitAction(action) {
        if (destroyed) return;
        if (online && !room.isHost) { room.sendAction(action).catch(console.warn); return; }
        applyAction(action, online ? state.hostSeat : 0);
    }
    function applyAction(action, actor) {
        if (destroyed || !state || !action) return;
        const now = Date.now();
        const t = action.type;
        if (t === "restart") {
            if (online && actor !== state.hostSeat) return;   /* host controls restarts */
            newMatch();
            return;
        }
        if (t === "difficulty") {
            if (online || actor !== 0) return;
            if (["easy", "normal", "hard"].indexOf(action.val) < 0) return;
            state.difficulty = action.val;
            publish();
            return;
        }
        if (t === "pick") {
            if (state.phase !== "playing") return;
            if (actor !== state.activeSeat) return;
            if (action.turn !== state.turn) return;           /* ignore stale clicks */
            const idx = action.idx;
            if (!Number.isInteger(idx) || idx < 0 || idx >= CELLS) return;
            if (!state.frozen && now > state.deadline + 300) return; /* small network grace */
            resolve(idx);
            return;
        }
        if (t === "timeout") {
            if (state.phase !== "playing" || state.frozen) return;
            if (actor !== state.activeSeat || action.turn !== state.turn) return;
            if (now < state.deadline - 80) return;
            resolve(-1);
            return;
        }
        if (t === "cheat") {
            const op = action.op;
            if (op === "freeze") {
                if (state.phase !== "playing") return;
                if (state.frozen) { state.deadline = now + state.frozenLeft; state.frozen = false; }
                else { state.frozenLeft = Math.min(60000, Math.max(0, state.deadline - now)); state.frozen = true; }
                state.cheated = true;
                publish();
                return;
            }
            if (op === "time") {
                if (state.phase !== "playing") return;
                if (state.frozen) state.frozenLeft = Math.min(60000, state.frozenLeft + 10000);
                else state.deadline = Math.min(now + 60000, state.deadline + 10000);
                state.cheated = true;
                publish();
                return;
            }
            if (op === "auto") {
                if (state.phase !== "playing" || actor !== state.activeSeat) return;
                state.cheated = true;
                resolve(currentRound().oddIdx);
                return;
            }
        }
    }
    function submitPick(idx) {
        if (!isMyTurn()) return;
        ui.cursor = idx;
        submitAction({ type: "pick", idx, turn: state.turn });
    }
    function moveCursor(dir) {
        let c = ui.cursor;
        if (dir === "left") c = (c + CELLS - 1) % CELLS;
        else if (dir === "right") c = (c + 1) % CELLS;
        else c = (c + 3) % CELLS;   /* up/down: jump rows (2 rows) */
        ui.cursor = c;
        paintCells();
    }

    /* ---------------- bot (AI mode only, fully local) ---------------- */
    function makeBotPlan() {
        const d = DIFF[state.difficulty] || DIFF.normal;
        const rd = currentRound();
        let p = Math.min(0.95, (BOT_ACC[rd.attr] || 0.7) * d.acc);
        let lo = d.react[0], hi = d.react[1];
        if (ui.botWeak) { p = 0.15; lo = 9000; hi = 13500; }
        const odd = rd.oddIdx;
        let pick = odd;
        if (Math.random() >= p) {
            const others = [];
            for (let i = 0; i < CELLS; i++) if (i !== odd) others.push(i);
            pick = others[Math.floor(Math.random() * others.length)];
        }
        return { at: Date.now() + lo + Math.random() * (hi - lo), pick };
    }

    /* ---------------- rendering ---------------- */
    function renderGrid() {
        const rd = currentRound();
        if (!rd) return;
        gridEl.innerHTML = rd.items.map(function (it, i) {
            return '<button type="button" class="ooo-cell" data-idx="' + i +
                '" aria-label="Picture ' + (i + 1) + ' of 6"><span class="ooo-num">' + (i + 1) + "</span>" +
                cellSvg(it) + "</button>";
        }).join("");
    }
    function paintCells() {
        if (!state) return;
        const mine = isMyTurn();
        const playing = state.phase === "playing";
        gridEl.classList.toggle("ooo-mine", mine);
        const rd = ui.round;
        const cells = gridEl.children;
        for (let i = 0; i < cells.length; i++) {
            const el = cells[i];
            el.classList.toggle("ooo-cursor", playing && mine && ui.cursor === i);
            el.classList.toggle("ooo-xray", playing && ui.xray && !!rd && i === rd.oddIdx);
            el.classList.toggle("ooo-look", playing && ui.botLook === i);
            let good = false, bad = false, rev = false;
            if (state.phase === "reveal" && state.reveal) {
                if (i === state.reveal.oddIdx) { good = state.reveal.correct; rev = !state.reveal.correct; }
                if (!state.reveal.correct && i === state.reveal.picked) bad = true;
            }
            el.classList.toggle("ooo-good", good);
            el.classList.toggle("ooo-bad", bad);
            el.classList.toggle("ooo-reveal", rev);
            el.setAttribute("aria-disabled", mine ? "false" : "true");
        }
    }
    function renderTimer(now) {
        if (!state) return;
        if (state.phase !== "playing") {
            if (state.phase === "intro") {
                timerFill.style.width = "100%";
                tnumEl.textContent = String(TURN_MS / 1000);
                timerRow.classList.remove("ooo-low", "ooo-frozen");
            }
            return;   /* reveal/over: leave the bar as it was */
        }
        const left = state.frozen ? state.frozenLeft : Math.max(0, state.deadline - now);
        const frac = Math.max(0, Math.min(1, left / TURN_MS));
        const secs = Math.ceil(left / 1000);
        timerFill.style.width = (frac * 100).toFixed(1) + "%";
        timerRow.classList.toggle("ooo-low", !state.frozen && left <= 5000);
        timerRow.classList.toggle("ooo-frozen", state.frozen);
        tnumEl.textContent = state.frozen ? "❄" : String(secs);
        timerBar.setAttribute("aria-valuenow", String(secs));
        timerBar.setAttribute("aria-valuemax", String(Math.max(TURN_MS / 1000, secs)));
    }
    function render() {
        if (destroyed) return;
        const seat = mySeat();
        const guest = online && !room.isHost;

        /* status chip */
        let tone = "wait", status = "Ready";
        if (!state) status = online ? "Syncing…" : "Ready";
        else if (state.phase === "intro") status = guest ? "Waiting for host" : "Ready";
        else if (state.phase === "playing") {
            if (isMyTurn()) { tone = "you"; status = "Your turn"; }
            else if (vsBot) { tone = "bot"; status = "Bot is thinking…"; }
            else { tone = "wait"; status = displayName(state.activeSeat) + "'s turn"; }
        } else if (state.phase === "reveal") {
            const ok = state.reveal && state.reveal.correct;
            tone = ok ? "you" : "bad";
            status = ok ? "Point!" : "Missed";
        } else if (state.phase === "over") { tone = "wait"; status = "Match over"; }
        statusEl.textContent = status;
        statusWrap.dataset.tone = tone;

        /* scoreboard */
        for (let s = 0; s < 2; s++) {
            const el = seatEls[s];
            el.querySelector("[data-name]").textContent = displayName(s) + (s === seat ? " (you)" : "");
            el.querySelector("[data-score]").textContent = String(state ? state.scores[s] : 0);
            const active = !!state && (state.phase === "playing" || state.phase === "reveal") && state.activeSeat === s;
            el.classList.toggle("ooo-active", active);
            el.querySelector("[data-tag]").textContent = active
                ? (s === seat ? "YOUR TURN" : (vsBot && s === 1 ? "BOT'S TURN" : "THEIR TURN"))
                : (s === seat ? "YOU" : (vsBot && s === 1 ? "BOT" : ""));
        }

        /* meta line */
        if (state) {
            const bits = ["Turn " + Math.min(state.turn + 1, TURNS) + "/" + TURNS];
            if (state.phase !== "intro") bits.push("🪙 " + displayName(state.firstSeat) + " started");
            if (online && seat !== null) bits.push("You are " + seatLabel(seat));
            bits.push("Best " + ui.best + "/" + TURNS);
            if (state.cheated || ui.localAssisted) bits.push("🛠 assisted");
            metaEl.textContent = bits.join(" · ");
        } else metaEl.textContent = "";

        /* rebuild the grid only when the round identity changes */
        const rd = currentRound();
        if (rd && ui.gridKey !== ui.roundKey) {
            const freshMatch = state.turn === 0 && state.phase === "playing";
            ui.gridKey = ui.roundKey;
            ui.cursor = 0;
            ui.botPlan = null;
            ui.botLook = -1;
            if (freshMatch) ui.localAssisted = ui.xray || (vsBot && ui.botWeak);
            renderGrid();
            if (state.phase === "playing") {
                msgEl.textContent = (isMyTurn() ? "Your turn — " : displayName(state.activeSeat) + "'s turn — ") + "find the odd one!";
            }
        }

        /* prompt + messages */
        if (!state) promptEl.textContent = "";
        else if (state.phase === "intro") promptEl.textContent = "Six pictures, one odd one out.";
        else if (state.phase === "playing") promptEl.textContent = promptFor(rd.attr);
        else if (state.phase === "reveal" && state.reveal) {
            promptEl.textContent = promptFor(rd.attr);
            const rv = state.reveal, who = displayName(rv.seat), me = rv.seat === seat;
            msgEl.textContent = rv.correct
                ? (me ? "Yes! Great spot — +1 point! 🎉" : who + " spotted it — +1 point.")
                : (rv.picked < 0
                    ? (me ? "Time is up! It was the glowing one." : "Time ran out for " + who + ".")
                    : (me ? "Not that one — it was the glowing one." : who + " missed it."));
        } else if (state.phase === "over") { promptEl.textContent = "Match finished."; msgEl.textContent = ""; }

        paintCells();
        renderTimer(Date.now());
        if (paused || helpOpen) timerRow.classList.add("ooo-frozen");

        /* best score, saved once per finished match */
        if (state && state.phase === "over") {
            if (!ui.bestSaved) {
                const my = state.scores[seat === null ? 0 : seat];
                if (my > ui.best) { ui.best = my; saveBest(my); }
                ui.bestSaved = true;
            }
        } else ui.bestSaved = false;

        /* overlays — help > cheats > pause > phase card */
        ovIntro.toggleAttribute("hidden", !(!state || state.phase === "intro") || helpOpen || cheatsOpen || paused);
        ovOver.toggleAttribute("hidden", !(state && state.phase === "over") || helpOpen || cheatsOpen || paused);
        ovHelp.toggleAttribute("hidden", !helpOpen);
        ovCheats.toggleAttribute("hidden", !cheatsOpen || helpOpen);
        ovPause.toggleAttribute("hidden", !paused || helpOpen || cheatsOpen);

        /* intro card */
        diffRow.toggleAttribute("hidden", !vsBot);
        diffChips.forEach(function (ch) { ch.classList.toggle("ooo-sel", !!state && ch.dataset.val === state.difficulty); });
        startBtn.toggleAttribute("hidden", guest);
        introWait.toggleAttribute("hidden", !guest);
        introNote.textContent = online
            ? "🪙 Coin toss decides who starts, and your Player 1 / Player 2 seat is random every match."
            : "🪙 A coin toss decides whether you or the bot starts.";
        if (state && online && seat !== null && state.phase === "intro") {
            introNote.textContent += " You are " + seatLabel(seat) + ".";
        }

        /* over card */
        if (state && state.phase === "over") {
            const w = state.winner;
            ovTitle.textContent = w === -1 ? "It's a draw! 🤝" : (w === seat ? "You win! 🎉" : displayName(w) + " wins!");
            ovReason.textContent = displayName(0) + " " + state.scores[0] + " — " + state.scores[1] + " " + displayName(1) +
                ". Your best: " + ui.best + "/" + TURNS + ".";
            ovBadge.toggleAttribute("hidden", !(state.cheated || ui.localAssisted));
            againBtn.toggleAttribute("hidden", guest);
            overWait.toggleAttribute("hidden", !guest);
        }

        /* HUD tools, pad, cheat panel */
        restartBtn.disabled = guest;
        pauseBtn.disabled = online && !room.isHost;
        const wantIcon = paused ? "play" : "pause";
        if (pauseBtn.dataset.iconState !== wantIcon) {
            pauseBtn.dataset.iconState = wantIcon;
            const ico = pauseBtn.querySelector("svg");
            if (ico) ico.outerHTML = iconSVG(wantIcon, { size: 14 });
            const label = pauseBtn.querySelector(".ooo-btn-label");
            if (label) label.textContent = paused ? "Resume" : "Pause";
        }
        pauseBtn.setAttribute("aria-label", paused ? "Resume" : "Pause");
        padBtn.classList.toggle("ooo-on", ui.pad);
        padWrap.toggleAttribute("hidden", !(ui.pad && state && state.phase === "playing"));
        weakRow.toggleAttribute("hidden", !vsBot);
        cheatBtns.xray.setAttribute("aria-checked", ui.xray ? "true" : "false");
        cheatBtns.weak.setAttribute("aria-checked", ui.botWeak ? "true" : "false");
        cheatBtns.freeze.setAttribute("aria-checked", state && state.frozen ? "true" : "false");
        cheatBtns.freeze.disabled = !(state && state.phase === "playing");
        cheatBtns.time.disabled = !(state && state.phase === "playing");
        cheatBtns.auto.disabled = !isMyTurn();
    }

    /* ---------------- single rAF loop: timer, reveal, bot ---------------- */
    let rafId = 0;
    let lastNow = Date.now();
    function loop() {
        if (destroyed) return;
        rafId = requestAnimationFrame(loop);
        const now = Date.now();
        const dt = Math.max(0, now - lastNow);
        lastNow = now;
        if (!state || paused || helpOpen) return;   /* pause + help freeze the whole clock */
        const authority = !online || room.isHost;   /* only the host resolves time */
        if (state.phase === "playing") {
            renderTimer(now);
            if (authority && !state.frozen && now >= state.deadline) {
                applyAction({ type: "timeout", turn: state.turn }, state.activeSeat);
                return;
            }
            if (vsBot && state.activeSeat === 1) {
                if (!ui.botPlan) ui.botPlan = makeBotPlan();
                if (state.frozen) ui.botPlan.at += dt;  /* freeze pauses the bot too */
                if (now >= ui.nextLookAt) {
                    ui.botLook = Math.floor(Math.random() * CELLS);
                    ui.nextLookAt = now + 550 + Math.random() * 450;
                    paintCells();
                }
                if (now >= ui.botPlan.at) {
                    const pick = ui.botPlan.pick;
                    ui.botPlan = null;
                    ui.botLook = -1;
                    applyAction({ type: "pick", idx: pick, turn: state.turn }, 1);
                    return;
                }
            }
        } else if (state.phase === "reveal") {
            if (authority && state.reveal && now >= state.reveal.until) {
                advanceTurn();
                return;
            }
        }
    }

    /* ---------------- input: mouse + touch + virtual pad ---------------- */
    function handleClick(event) {
        const t = event.target;
        if (!t || !t.closest) return;
        if (t.closest("[data-exit]")) { onExit(); return; }
        if (t.closest("[data-help]")) { toggleHelp(true); return; }
        if (t.closest("[data-cheats]")) { toggleCheats(); return; }
        if (t.closest("[data-pause]")) { setPaused(); return; }
        if (t.closest("[data-restart]")) { restartMatch(); return; }
        const act = t.closest("[data-act]");
        if (act) {
            const a = act.dataset.act;
            if (a === "difficulty") submitAction({ type: "difficulty", val: act.dataset.val });
            else if (a === "close-help") toggleHelp(false);
            else if (a === "close-cheats") toggleCheats(false);
            else if (a === "resume") setPaused(false);
            else if (a === "pad") { ui.pad = !ui.pad; render(); }
            return;
        }
        const ch = t.closest("[data-cheat]");
        if (ch) {
            const c = ch.dataset.cheat;
            if (c === "xray") { ui.xray = !ui.xray; if (ui.xray) ui.localAssisted = true; render(); }
            else if (c === "weak") { ui.botWeak = !ui.botWeak; if (ui.botWeak) ui.localAssisted = true; ui.botPlan = null; render(); }
            else if (c === "freeze") submitAction({ type: "cheat", op: "freeze" });
            else if (c === "time") submitAction({ type: "cheat", op: "time" });
            else if (c === "auto") submitAction({ type: "cheat", op: "auto" });
            return;
        }
        if (paused || helpOpen || cheatsOpen) return;
        const pad = t.closest("[data-pad]");
        if (pad) {
            if (!isMyTurn()) return;
            if (pad.dataset.pad === "pick") submitPick(ui.cursor);
            else moveCursor(pad.dataset.pad);
            return;
        }
        const num = t.closest("[data-num]");
        if (num) { submitPick(Number(num.dataset.num)); return; }
        const cell = t.closest(".ooo-cell");
        if (cell) { submitPick(Number(cell.dataset.idx)); return; }
    }
    function handleHover(e) {
        if (paused || helpOpen || cheatsOpen || !isMyTurn()) return;
        const cell = e.target && e.target.closest ? e.target.closest(".ooo-cell") : null;
        if (cell) { ui.cursor = Number(cell.dataset.idx); paintCells(); }
    }

    /* ---------------- input: keyboard ---------------- */
    function handleKey(e) {
        if (destroyed || !root.isConnected) return;
        const tgt = e.target;
        if (tgt && (tgt.tagName === "INPUT" || tgt.tagName === "TEXTAREA" || tgt.isContentEditable)) return;
        const k = e.key;
        const lower = typeof k === "string" ? k.toLowerCase() : "";
        /* priority: help → cheats → pause / Escape → restart → game actions */
        if (lower === "h" || k === "?") { toggleHelp(); e.preventDefault(); return; }
        if (helpOpen) {
            if (k === "Escape" || k === "Enter" || k === " ") { toggleHelp(false); e.preventDefault(); }
            return;
        }
        if (lower === "c") { toggleCheats(); e.preventDefault(); return; }
        if (cheatsOpen) {
            if (k === "Escape") { toggleCheats(false); e.preventDefault(); }
            return;
        }
        if (lower === "p") { setPaused(); e.preventDefault(); return; }
        if (k === "Escape") { if (paused) { setPaused(false); e.preventDefault(); } return; }
        if (paused) { if (k === "Enter") { setPaused(false); e.preventDefault(); } return; }
        if (lower === "r") {
            if (!online || room.isHost) { restartMatch(); e.preventDefault(); }
            return;
        }
        const phase = state ? state.phase : "intro";
        if ((k === "Enter" || k === " ") && (phase === "intro" || phase === "over")) {
            if (!online || room.isHost) { restartMatch(); e.preventDefault(); }
            return;
        }
        if (phase !== "playing" || !isMyTurn()) return;
        if (k >= "1" && k <= "6") { submitPick(Number(k) - 1); e.preventDefault(); return; }
        const dirs = { ArrowLeft: "left", a: "left", ArrowRight: "right", d: "right", ArrowUp: "up", w: "up", ArrowDown: "down", s: "down" };
        const dir = dirs[k] || dirs[lower];
        if (dir) { moveCursor(dir); e.preventDefault(); return; }
        if (k === "Enter" || k === " ") { submitPick(ui.cursor); e.preventDefault(); }
    }

    /* ---------------- wiring + boot ---------------- */
    root.addEventListener("click", handleClick);
    root.addEventListener("mouseover", handleHover);
    root.addEventListener("focusin", handleHover);
    document.addEventListener("keydown", handleKey);

    let offRoom = null, offState = null, offAction = null;
    if (online) {
        offRoom = room.onRoom((nextRoom) => { if (destroyed) return; roomData = nextRoom; render(); });
        if (room.isHost) {
            state = initialState();
            publish();
            /* NOTE: the template hardcodes actor 1 for guest actions. With random
               seats the guest's seat is 1 - hostSeat, so we map it dynamically. */
            offAction = room.onAction((action) => applyAction(action, guestSeat()));
        } else {
            offState = room.onState((nextState) => { if (destroyed || !nextState) return; state = nextState; render(); });
        }
    } else {
        state = initialState();   /* local vs-bot mode: no room/database needed */
    }
    render();
    rafId = requestAnimationFrame(loop);

    return {
        destroy() {
            destroyed = true;
            if (rafId) cancelAnimationFrame(rafId);
            root.removeEventListener("click", handleClick);
            root.removeEventListener("mouseover", handleHover);
            root.removeEventListener("focusin", handleHover);
            document.removeEventListener("keydown", handleKey);
            [offRoom, offState, offAction].forEach(function (off) { if (typeof off === "function") off(); });
        },
    };
}