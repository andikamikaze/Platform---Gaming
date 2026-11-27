/*
 * pattern-party.js — Pattern Party (kids)
 * ---------------------------------------------------------------
 * Mengikuti template game baru:
 *   1. META di bawah (id harus sama dengan nama file tanpa .js).
 *   2. Logika game ada di mount().
 *   3. Setelah edit, jalankan: node tools/build-games-manifest.mjs
 *
 * Mode:
 *   - "ai"   : lokal, pilih Solo practice atau vs Bot (bot jalan lokal).
 *   - "room" : duel online 2 pemain, host = authoritative.
 * Random per match (di-generate host lalu di-publish ke semua klien):
 *   - seed level  -> soal acak tapi DIJAMIN bisa diselesaikan.
 *   - giliran pertama (siapa jalan duluan).
 *   - kursi pemain (multiplayer: host/guest bisa duduk di seat 0/1 acak).
 */

import { iconSVG } from "../JS/icons.js";

export const META = {
    id: "pattern-party", // harus sama dengan nama file (tanpa .js)
    name: "Pattern Party",
    category: "kids",
    catLabel: "Kids",
    desc: "Spot the rule and tap the tile that comes next. Solo, vs bot, or an online duel.",
    art: '<svg viewBox="0 0 48 48" width="54" height="54" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="17" width="12" height="14" rx="3"/><circle cx="9" cy="24" r="4.5"/><rect x="18" y="17" width="12" height="14" rx="3"/><rect x="21.5" y="21.5" width="5" height="5" rx="1"/><rect x="33" y="17" width="12" height="14" rx="3" stroke-dasharray="4 3"/><path d="M36.5 21.2c0-2.7 5-3.3 5 .3 0 2-2.4 2-2.4 4.2"/><path d="M39.1 28.9v.01"/></svg>',
    bg: ["#c4b5fd", "#a78bfa"],
    bestKey: "patternPartyBest",
};

/* ================================================================
 * PURE LOGIC — deterministik & bisa di-unit-test (lihat _test).
 * Semua soal dibentuk dari aturan yang valid, jadi jawaban selalu
 * ada dan unik di antara 3 opsi (random tapi pasti bisa diselesaikan).
 * ================================================================ */
const ROUNDS = 10;
const NEED = 8; // target menang solo
const SHAPES = ["circle", "square", "triangle", "diamond", "star"];
const COLORS = ["red", "blue", "yellow", "green", "purple"];

const LABELS = {
    ab: "Alternating shapes",
    abColor: "Alternating colors",
    abc: "Three-shape cycle",
    aab: "Two-and-one rhythm",
    aabb: "Pair rhythm",
    abb: "One-and-two rhythm",
    abcColor: "Three-color cycle",
    abSync: "Shapes + colors together",
    wave: "Bouncing pattern",
    abcd: "Four-shape cycle",
    mix23: "Mixed cycles: 2 shapes x 3 colors",
    mix32: "Mixed cycles: 3 shapes x 2 colors",
};

/* xorshift32 + avalanche mix, seed dari (seedMatch ^ round). */
function makeRng(seed) {
    let s = (Math.imul(seed >>> 0, 2654435761) + 2) >>> 0;
    s = Math.imul(s ^ (s >>> 15), 0x2c1b3c6d) >>> 0;
    s = Math.imul(s ^ (s >>> 12), 0x297a2d39) >>> 0;
    s = (s ^ (s >>> 15)) >>> 0;
    if (s === 0) s = 0x9e3779b9;
    return function () {
        s ^= s << 13;
        s >>>= 0;
        s ^= s >>> 17;
        s ^= s << 5;
        s >>>= 0;
        return s / 4294967296;
    };
}

/* Fisher-Yates ber-seed; tidak memutasi input. */
function shuffle(arr, r) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(r() * (i + 1));
        const t = a[i];
        a[i] = a[j];
        a[j] = t;
    }
    return a;
}

/* Generator soal. 12 jenis pola, tier kesulitan naik per ronde:
 *   ronde 1-3 : ab / abColor / abc
 *   ronde 4-6 : aab / aabb / abb / abcColor
 *   ronde 7-8 : abSync / wave / abcd
 *   ronde 9-10: mix23 / mix32 / abSync / wave
 * Return { seq, options, answerIdx, kind, label }:
 *   seq[4] = jawaban benar; options = 3 tile unik, tepat 1 benar. */
function makePattern(round, seed = 1) {
    const rd = Math.max(1, Math.min(ROUNDS, Math.floor(Number(round)) || 1));
    const r = makeRng((seed ^ Math.imul(rd, 0x9e3779b9)) >>> 0);
    const pick = (a) => a[Math.floor(r() * a.length) % a.length];
    const other = (a, not) => pick(a.filter((x) => x !== not));
    const sample = (a, k) => shuffle(a, r).slice(0, k);
    const tile = (shape, color) => ({ shape, color });
    const tkey = (t) => t.shape + ":" + t.color;

    const pool =
        rd <= 3 ? ["ab", "abColor", "abc"]
            : rd <= 6 ? ["aab", "aabb", "abb", "abcColor"]
                : rd <= 8 ? ["abSync", "wave", "abcd"]
                    : ["mix23", "mix32", "abSync", "wave"];
    const kind = pick(pool);
    const col = pick(COLORS);

    let seq, answer, focus;
    if (kind === "ab") {
        const a = pick(SHAPES), b = other(SHAPES, a);
        const A = tile(a, col), B = tile(b, col);
        seq = [A, B, A, B]; answer = A; focus = "shape";
    } else if (kind === "abColor") {
        const s = pick(SHAPES), ca = pick(COLORS), cb = other(COLORS, ca);
        const A = tile(s, ca), B = tile(s, cb);
        seq = [A, B, A, B]; answer = A; focus = "color";
    } else if (kind === "abc") {
        const [a, b, c] = sample(SHAPES, 3);
        const T = [tile(a, col), tile(b, col), tile(c, col)];
        seq = [T[0], T[1], T[2], T[0]]; answer = T[1]; focus = "shape";
    } else if (kind === "aab") {
        const a = pick(SHAPES), b = other(SHAPES, a);
        const A = tile(a, col), B = tile(b, col);
        seq = [A, A, B, A]; answer = A; focus = "shape";
    } else if (kind === "aabb") {
        const a = pick(SHAPES), b = other(SHAPES, a);
        const A = tile(a, col), B = tile(b, col);
        seq = [A, A, B, B]; answer = A; focus = "shape";
    } else if (kind === "abb") {
        const a = pick(SHAPES), b = other(SHAPES, a);
        const A = tile(a, col), B = tile(b, col);
        seq = [A, B, B, A]; answer = B; focus = "shape";
    } else if (kind === "abcColor") {
        const s = pick(SHAPES);
        const [c0, c1, c2] = sample(COLORS, 3);
        const T = [tile(s, c0), tile(s, c1), tile(s, c2)];
        seq = [T[0], T[1], T[2], T[0]]; answer = T[1]; focus = "color";
    } else if (kind === "abSync") {
        const a = pick(SHAPES), b = other(SHAPES, a);
        const ca = pick(COLORS), cb = other(COLORS, ca);
        const A = tile(a, ca), B = tile(b, cb);
        seq = [A, B, A, B]; answer = A; focus = "both";
    } else if (kind === "wave") {
        const [a, b, c] = sample(SHAPES, 3);
        const A = tile(a, col), B = tile(b, col), C = tile(c, col);
        seq = [A, B, C, B]; answer = A; focus = "shape";
    } else if (kind === "abcd") {
        const [a, b, c, d] = sample(SHAPES, 4);
        const T = [tile(a, col), tile(b, col), tile(c, col), tile(d, col)];
        seq = [T[0], T[1], T[2], T[3]]; answer = T[0]; focus = "shape";
    } else if (kind === "mix23") {
        const [a, b] = sample(SHAPES, 2);
        const [c0, c1, c2] = sample(COLORS, 3);
        seq = [tile(a, c0), tile(b, c1), tile(a, c2), tile(b, c0)];
        answer = tile(a, c1); focus = "both";
    } else {
        /* mix32 */
        const [a, b, c] = sample(SHAPES, 3);
        const [c0, c1] = sample(COLORS, 2);
        seq = [tile(a, c0), tile(b, c1), tile(c, c0), tile(a, c1)];
        answer = tile(b, c0); focus = "both";
    }

    /* Distraktor: fokus pada atribut yang diuji; untuk pola campuran,
     * distraktor berbagi TEPAT SATU atribut dengan jawaban (menjebak). */
    let ds;
    if (focus === "shape") {
        ds = shuffle(SHAPES.filter((s) => s !== answer.shape).map((s) => tile(s, answer.color)), r).slice(0, 2);
    } else if (focus === "color") {
        ds = shuffle(COLORS.filter((c) => c !== answer.color).map((c) => tile(answer.shape, c)), r).slice(0, 2);
    } else {
        const one = [];
        for (const s of SHAPES) for (const c of COLORS) {
            const shared = (s === answer.shape ? 1 : 0) + (c === answer.color ? 1 : 0);
            if (shared === 1) one.push(tile(s, c));
        }
        ds = shuffle(one, r).slice(0, 2);
    }
    /* Pengaman: jamin 2 distraktor unik dan bukan jawaban. */
    if (ds.length < 2) {
        outer: for (const s of SHAPES) for (const c of COLORS) {
            const t = tile(s, c);
            if (tkey(t) !== tkey(answer) && !ds.some((d) => tkey(d) === tkey(t))) {
                ds.push(t);
                if (ds.length === 2) break outer;
            }
        }
    }

    seq = [...seq, answer];
    const options = shuffle([answer, ds[0], ds[1]], r);
    const answerIdx = options.indexOf(answer);
    return { seq, options, answerIdx, kind, label: LABELS[kind] };
}

function check(pattern, i) {
    return i === pattern.answerIdx;
}

export const _test = { ROUNDS, NEED, SHAPES, COLORS, LABELS, makeRng, shuffle, makePattern, check };

/* ================================================================
 * RENDER HELPERS (pure string builders)
 * ================================================================ */
const PALETTE = {
    red: { f: "#ef4444", e: "#b91c1c" },
    blue: { f: "#3b82f6", e: "#1d4ed8" },
    yellow: { f: "#facc15", e: "#a16207" },
    green: { f: "#22c55e", e: "#15803d" },
    purple: { f: "#a855f7", e: "#7e22ce" },
};

function shapeSvg(shape, color) {
    const p = PALETTE[color] || PALETTE.red;
    const a = 'fill="' + p.f + '" stroke="' + p.e + '" stroke-width="2.5" stroke-linejoin="round"';
    let inner;
    if (shape === "circle") inner = '<circle cx="24" cy="24" r="13.5" ' + a + "/>";
    else if (shape === "square") inner = '<rect x="10.5" y="10.5" width="27" height="27" rx="6" ' + a + "/>";
    else if (shape === "triangle") inner = '<polygon points="24,8.5 40.5,40 7.5,40" ' + a + "/>";
    else if (shape === "diamond") inner = '<polygon points="24,6.5 41.5,24 24,41.5 6.5,24" ' + a + "/>";
    else inner = '<polygon points="24,7 28.7,17.6 40.2,18.4 31.4,25.9 34.2,37.1 24,30.9 13.8,37.1 16.6,25.9 7.8,18.4 19.3,17.6" ' + a + "/>";
    return '<svg viewBox="0 0 48 48" preserveAspectRatio="xMidYMid meet" aria-hidden="true">' + inner + "</svg>";
}

const STAR_SVG = '<svg viewBox="0 0 48 48" aria-hidden="true"><polygon points="24,10 27.5,19.2 37.3,19.7 29.7,25.9 32.2,35.3 24,30 15.8,35.3 18.3,25.9 10.7,19.7 20.5,19.2" fill="currentColor"/></svg>';
const PRAISE = ["Great job!", "Nice one!", "You got it!", "Super!", "Perfect!", "Awesome!", "Well done!", "Brilliant!", "Fantastic!", "Party star!"];

/* ================================================================
 * MOUNT
 * ================================================================ */
export function mount(root, context = {}) {
    const { mode = "ai", room = null, playerName = "Player", onExit = () => { } } = context;
    const online = mode === "room" && Boolean(room);
    const playerIndex = online && !room.isHost ? 1 : 0; // 0 = host, 1 = guest (koneksi)
    let roomData = room?.room || null;
    let state = null;

    const $ = (s) => root.querySelector(s);
    const $$ = (s) => Array.from(root.querySelectorAll(s));
    const isAuthority = () => !online || room.isHost;
    const mySeat = () => (online && state ? state.seats[playerIndex] : 0);
    const seatOf = (actor) => (online && state ? state.seats[actor] : actor);
    const myTurn = () => Boolean(state && state.phase === "playing" && (state.mode === "solo" || state.turn === mySeat()));
    const patNow = () => (state && state.phase !== "lobby" ? makePattern(state.round, state.seed) : makePattern(1, 20261118));
    const cutIdx = () => (myTurn() && cheats.fifty ? (patNow().answerIdx + 1) % 3 : -1);
    const nameOf = (seat, st = state) => {
        if (!st) return seat === 0 ? "You" : "Rival";
        if (st.mode === "solo") return seat === 0 ? playerName || "You" : "Target";
        if (seat === mySeat()) return playerName || "You";
        return st.mode === "bot" ? "Bot" : "Rival";
    };

    const demoRow =
        [["circle", "blue"], ["square", "blue"], ["circle", "blue"], ["square", "blue"]]
            .map(([s, c]) => '<div class="pp-tile">' + shapeSvg(s, c) + "</div>")
            .join("") +
        '<div class="pp-tile pp-hole filled">' + shapeSvg("circle", "blue") + "</div>";

    root.innerHTML = `
<style>
.pp-app{--pp-accent:#6d28d9;--pp-soft:#ede9fe;--pp-paper:#ffffff;--pp-ink:#0f172a;--pp-muted:#64748b;--pp-line:#e2e8f0;--pp-ok:#10b981;--pp-bad:#ef4444;--pp-tile:clamp(52px,11vw,84px);color:var(--pp-ink);width:100%}
.pp-app *{box-sizing:border-box}
.pp-app [hidden]{display:none!important}
.pp-app .game-intro{flex-wrap:wrap;gap:8px;align-items:center;padding:8px 12px;background:var(--pp-paper);border:1px solid var(--pp-line);border-radius:10px}
.pp-app .game-intro>div{min-width:0;flex:1 1 240px}
.pp-app .game-intro p{font-size:12px;line-height:1.5;color:var(--pp-muted)}
.pp-app .pp-panel{position:relative;background:#fff;border:1px solid var(--pp-line);border-radius:12px;padding:clamp(12px,3vw,20px);display:flex;flex-direction:column;gap:12px}
.pp-app .pp-top{display:flex;align-items:stretch;gap:8px}
.pp-app .pp-card{flex:1;min-width:0;border:1px solid var(--pp-line);border-radius:12px;padding:8px 12px;display:flex;flex-direction:column;gap:4px;background:#fff;transition:border-color .16s,box-shadow .16s}
.pp-app .pp-card.is-turn{border-color:var(--pp-accent);box-shadow:0 0 0 3px var(--pp-soft)}
.pp-app .pp-card.is-turn .pp-name{color:var(--pp-accent)}
.pp-app .pp-name{font-size:11px;font-weight:700;letter-spacing:.07em;text-transform:uppercase;color:var(--pp-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.pp-app .pp-score{font-size:24px;font-weight:800;line-height:1.1}
.pp-app .pp-mid{flex:1.2;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;min-width:0}
.pp-app .pp-round{font-size:11px;font-weight:700;color:var(--pp-muted);letter-spacing:.08em;text-transform:uppercase;white-space:nowrap}
.pp-app .pp-dots{display:flex;gap:4px;flex-wrap:wrap;justify-content:center;max-width:100%}
.pp-app .pp-dot{width:9px;height:9px;border-radius:50%;background:var(--pp-line);box-sizing:border-box}
.pp-app .pp-dot.ok{background:var(--pp-ok)}
.pp-app .pp-dot.bad{background:var(--pp-bad)}
.pp-app .pp-dot.now{background:#fff;border:2px solid var(--pp-accent)}
.pp-app .pp-stage{position:relative;display:flex;flex-direction:column;align-items:center;gap:12px;padding:8px 0 4px;min-height:340px}
.pp-app .pp-tag{font-size:11px;font-weight:700;letter-spacing:.09em;text-transform:uppercase;color:var(--pp-accent);background:var(--pp-soft);padding:6px 12px;border-radius:999px;text-align:center;max-width:100%;line-height:1.4}
.pp-app .pp-row{display:flex;gap:clamp(6px,1.6vw,12px);justify-content:center;max-width:100%}
.pp-app .pp-tile{width:var(--pp-tile);height:var(--pp-tile);border-radius:12px;background:#f8fafc;border:1px solid var(--pp-line);display:flex;align-items:center;justify-content:center;position:relative;flex:0 0 auto;box-sizing:border-box}
.pp-app .pp-tile svg{width:66%;height:66%;display:block}
.pp-app .pp-hole{background:#fff;border:1px dashed #94a3b8}
.pp-app .pp-q{font-size:calc(var(--pp-tile)*.42);font-weight:800;color:#94a3b8;line-height:1}
.pp-app .pp-hole.filled{border-style:solid;border-color:var(--pp-ok);background:#ecfdf5}
.pp-app .pp-pop{animation:pp-pop .45s cubic-bezier(.34,1.56,.64,1)}
.pp-app .pp-prompt{font-size:13px;font-weight:600;color:var(--pp-muted);text-align:center}
.pp-app .pp-opt{cursor:pointer;padding:0;font:inherit;color:inherit;-webkit-tap-highlight-color:transparent;transition:transform .16s ease,border-color .16s,box-shadow .16s,opacity .16s}
.pp-app .pp-opt:not(:disabled):hover{transform:translateY(-2px);border-color:#cbd5e1}
.pp-app .pp-opt:focus-visible{outline:3px solid var(--pp-accent);outline-offset:2px}
.pp-app .pp-opt.sel,.pp-app .pp-opt.hint{border-color:var(--pp-accent);box-shadow:0 0 0 3px var(--pp-soft)}
.pp-app .pp-opt.cut{opacity:.28;filter:grayscale(1)}
.pp-app .pp-opt.right{border-color:var(--pp-ok);background:#ecfdf5;box-shadow:0 0 0 3px #10b98133}
.pp-app .pp-opt.wrong{border-color:var(--pp-bad);background:#fef2f2;box-shadow:0 0 0 3px #ef444433;animation:pp-shake .5s ease}
.pp-app .pp-opt.dim{opacity:.4}
.pp-app .pp-opt:disabled{cursor:default}
.pp-app .pp-kbd{position:absolute;top:5px;left:7px;font-size:10px;font-weight:700;color:var(--pp-muted);border:1px solid var(--pp-line);border-radius:5px;padding:1px 4px;background:#fff;line-height:1.2}
.pp-app .pp-fb{min-height:24px;font-size:14px;font-weight:700;text-align:center;line-height:1.4}
.pp-app .pp-fb.ok{color:var(--pp-ok)}
.pp-app .pp-fb.bad{color:var(--pp-bad)}
.pp-app .pp-fb.wait{color:var(--pp-muted);font-weight:600}
.pp-app .pp-burst{position:absolute;inset:0;pointer-events:none;overflow:visible}
.pp-app .pp-star{position:absolute;width:26px;height:26px;animation:pp-fly .9s ease-out forwards}
.pp-app .pp-star svg{width:100%;height:100%;display:block}
.pp-app .pp-toast{position:absolute;top:4px;left:50%;transform:translateX(-50%);background:var(--pp-ink);color:#fff;font-size:12.5px;font-weight:700;padding:6px 12px;border-radius:9px;opacity:0;pointer-events:none;white-space:nowrap;max-width:calc(100% - 16px);overflow:hidden;text-overflow:ellipsis;z-index:5}
.pp-app .pp-toast.show{animation:pp-toast 2.4s ease forwards}
.pp-app .pp-pad{display:none;justify-content:center;align-items:center;gap:12px;flex-wrap:wrap}
.pp-app .pp-pad-btn{width:54px;height:54px;border-radius:50%;border:1px solid var(--pp-line);background:#fff;font-size:18px;display:flex;align-items:center;justify-content:center;cursor:pointer;color:var(--pp-ink);-webkit-tap-highlight-color:transparent;touch-action:manipulation}
.pp-app .pp-pad-btn:active{transform:scale(.94)}
.pp-app .pp-pad-btn:disabled{opacity:.4;cursor:default}
.pp-app .pp-pad-ok{width:auto;min-width:104px;min-height:48px;border-radius:999px;background:var(--pp-accent);border-color:var(--pp-accent);color:#fff;font-weight:800;font-size:14px;letter-spacing:.08em}
.pp-app .pp-toolbar{display:flex;justify-content:center;gap:8px;flex-wrap:wrap}
.pp-app .pp-btn{font:inherit;font-size:13.5px;font-weight:600;color:var(--pp-ink);background:#fff;border:1px solid var(--pp-line);border-radius:9px;padding:8px 12px;min-height:40px;cursor:pointer;transition:background .16s,transform .16s;-webkit-tap-highlight-color:transparent}
.pp-app .pp-btn:hover{background:#f8fafc}
.pp-app .pp-btn:focus-visible{outline:3px solid var(--pp-accent);outline-offset:2px}
.pp-app .pp-btn.primary{background:var(--pp-accent);border-color:var(--pp-accent);color:#fff;font-weight:700}
.pp-app .pp-btn.primary:hover{background:#5b21b6}
.pp-app .pp-btn.tiny{font-size:12.5px;padding:6px 12px}
.pp-app .pp-cheat-dot{width:7px;height:7px;border-radius:50%;background:var(--pp-bad);display:inline-block;margin-left:6px;vertical-align:middle}
.pp-app .pp-ov{position:absolute;inset:0;background:rgba(255,255,255,.93);backdrop-filter:blur(4px);display:flex;align-items:center;justify-content:center;z-index:10;border-radius:12px;padding:12px}
.pp-app .pp-ov-card{max-width:460px;width:100%;max-height:100%;overflow:auto;background:#fff;border:1px solid var(--pp-line);border-radius:12px;padding:16px;display:flex;flex-direction:column;gap:10px;text-align:center}
.pp-app .pp-ov-card h3{margin:0;font-size:20px;font-weight:800}
.pp-app .pp-ov-card p{margin:0;color:var(--pp-muted);font-size:13px;line-height:1.55}
.pp-app .pp-ov-actions{display:flex;flex-direction:column;gap:8px}
.pp-app .pp-howto{display:flex;flex-direction:column;gap:8px;text-align:left}
.pp-app .pp-step{display:flex;gap:10px;align-items:flex-start;font-size:12.5px;line-height:1.5;color:var(--pp-ink)}
.pp-app .pp-step .num{flex:0 0 auto;width:22px;height:22px;border-radius:50%;background:var(--pp-soft);color:var(--pp-accent);display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:800}
.pp-app .pp-demo{display:flex;gap:6px;justify-content:center;flex-wrap:wrap;padding:4px 0}
.pp-app .pp-demo .pp-tile{width:44px;height:44px;border-radius:10px}
.pp-app .pp-keys{display:grid;grid-template-columns:auto 1fr;gap:6px 12px;font-size:12.5px;color:var(--pp-ink);text-align:left;align-items:center}
.pp-app kbd{border:1px solid var(--pp-line);border-bottom-width:2px;border-radius:6px;padding:1px 6px;background:#f8fafc;font:inherit;font-weight:700;font-size:11px;white-space:nowrap;justify-self:start}
.pp-app .pp-cheats{display:flex;flex-direction:column;gap:8px;text-align:left}
.pp-app .pp-cheat{display:flex;gap:10px;align-items:flex-start;border:1px solid var(--pp-line);border-radius:10px;padding:8px 12px;cursor:pointer;min-height:44px}
.pp-app .pp-cheat input{margin-top:3px;accent-color:var(--pp-accent);width:16px;height:16px;flex:0 0 auto}
.pp-app .pp-cheat .t{display:block;font-size:13px;font-weight:700}
.pp-app .pp-cheat .d{display:block;font-size:12px;color:var(--pp-muted);line-height:1.4}
.pp-app .pp-cheat.off{opacity:.45;cursor:not-allowed}
.pp-app .pp-note{font-size:11.5px;color:var(--pp-muted);line-height:1.5}
@media (pointer:coarse),(max-width:720px){.pp-app .pp-pad{display:flex}.pp-app .pp-kbd{display:none}}
@media (max-width:560px){
  .pp-app .pp-top{flex-wrap:wrap}
  .pp-app .pp-mid{order:-1;flex-basis:100%}
  .pp-app .pp-score{font-size:22px}
  .pp-app .pp-stage{min-height:320px}
  .pp-app{--pp-tile:clamp(48px,12vw,64px)}
}
@media (pointer:coarse){.pp-app .pp-btn,.pp-app .pp-pad-btn{min-height:44px}}
@keyframes pp-pop{0%{transform:scale(.2);opacity:0}60%{transform:scale(1.2)}100%{transform:scale(1);opacity:1}}
@keyframes pp-shake{0%,100%{transform:translateX(0)}20%{transform:translateX(-8px)}40%{transform:translateX(8px)}60%{transform:translateX(-5px)}80%{transform:translateX(5px)}}
@keyframes pp-fly{0%{transform:translate(-50%,-50%) scale(.3) rotate(0deg);opacity:1}100%{transform:translate(calc(-50% + var(--pp-dx,0px)),calc(-50% + var(--pp-dy,0px))) scale(1.2) rotate(210deg);opacity:0}}
@keyframes pp-toast{0%{opacity:0;transform:translate(-50%,-6px)}12%{opacity:1;transform:translate(-50%,0)}80%{opacity:1}100%{opacity:0;transform:translate(-50%,0)}}
@media (prefers-reduced-motion:reduce){.pp-app *{animation:none!important;transition-duration:.01ms!important}}

/* --- layout redesign: HUD + fill board + modal overlays (keep last) --- */
.pp-app .pp-hud{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:10px;font:600 11px/1 ui-monospace,SFMono-Regular,Menlo,monospace}
.pp-app .pp-hud .pp-chip{display:inline-flex;align-items:center;gap:6px;padding:5px 9px;border:1px solid var(--pp-line);border-radius:999px;background:var(--pp-paper);color:var(--pp-muted);white-space:nowrap}
.pp-app .pp-hud .pp-chip b{color:var(--pp-ink);font-weight:700;font-variant-numeric:tabular-nums}
.pp-app .pp-hud .pp-chip.is-turn{border-color:var(--pp-accent);box-shadow:0 0 0 3px var(--pp-soft)}
.pp-app .pp-hud .pp-chip.is-turn b{color:var(--pp-accent)}
.pp-app .pp-hud .pp-dots{gap:4px;padding:6px 9px;flex-wrap:nowrap}
.pp-app .pp-hud .pp-spacer{flex:1 1 auto}
.pp-app .pp-icon-btn{display:inline-flex;align-items:center;gap:6px}
.pp-app .pp-icon-btn svg{flex:none;display:block}
.pp-app .pp-hud .pp-icon-btn.on{border-color:var(--pp-accent);color:var(--pp-accent)}
.pp-app.game-fill > .pp-panel{flex:1 1 auto;min-height:0;aspect-ratio:auto;overflow:hidden}
.pp-app .pp-stage{flex:1 1 auto;min-height:0;justify-content:center;padding:8px 0 4px}
.pp-app .pp-ov-card{display:flex;flex-direction:column;overflow:hidden;max-height:100%;width:min(480px,100%);text-align:center;padding:14px 16px}
.pp-app .pp-head,.pp-app .pp-foot{flex:none}
.pp-app .pp-head{display:flex;align-items:center;justify-content:space-between;gap:10px;text-align:left}
.pp-app .pp-head h3{margin:0}
.pp-app .pp-foot{display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;margin-top:4px;padding-top:10px;border-top:1px solid var(--pp-line)}
.pp-app .pp-body,.pp-app .pp-howto,.pp-app .pp-cheats,.pp-app .pp-keys{flex:1 1 auto;min-height:0;overflow:auto}
.pp-app .pp-howto,.pp-app .pp-cheats,.pp-app .pp-keys{text-align:left}
.pp-app .pp-keys{grid-template-columns:auto 1fr}
@media (max-width:640px){
 .pp-app.game-fill > .pp-panel:not(:has(.pp-ov:not([hidden]))){flex:1 1 auto;min-height:0;aspect-ratio:auto}
 .pp-app.game-fill > .pp-panel:has(.pp-ov:not([hidden])){flex:0 0 auto;min-height:min(70dvh,620px);aspect-ratio:auto}
 .pp-app .pp-hud{gap:5px;margin-bottom:8px}
 .pp-app .pp-hud .pp-chip{padding:4px 6px;font-size:9px;min-height:24px}
 .pp-app .pp-hud .pp-chip[data-hud="rulewrap"],.pp-app .pp-hud .pp-chip[data-hud="roundwrap"]{display:none}
 .pp-app .pp-hud .pp-btn{min-height:32px;padding:5px 9px;font-size:9px}
 .pp-app .pp-hud .pp-btn-label,.pp-app .pp-hud .pp-spacer{display:none}
 .pp-app .pp-stage{min-height:0}
 .pp-app .pp-ov{padding:8px}
 .pp-app .pp-ov-card{width:100%;height:100%;max-height:100%;padding:12px;border-radius:12px}
 .pp-app .pp-body,.pp-app .pp-howto,.pp-app .pp-cheats,.pp-app .pp-keys{scrollbar-width:none}
 .pp-app .pp-body::-webkit-scrollbar,.pp-app .pp-howto::-webkit-scrollbar,.pp-app .pp-cheats::-webkit-scrollbar,.pp-app .pp-keys::-webkit-scrollbar{display:none}
 .pp-app .pp-foot{position:static;margin:0;padding:10px 0 0;border-top:1px solid var(--pp-line)}
 .pp-app .pp-note{display:none}
}
</style>
<div class="game-app pp-app game-fill" data-pp>
  <div class="pp-hud">
    <span class="pp-chip pp-status"><i class="game-status-dot"></i><span data-status aria-live="polite">Ready</span></span>
    <span class="pp-chip" data-hud="roundwrap">ROUND <b data-round>1 / ${ROUNDS}</b></span>
    <span class="pp-chip" data-card="0"><b data-name="0">You</b> <b data-score="0">0</b></span>
    <span class="pp-chip" data-card="1"><b data-name="1">Bot</b> <b data-score="1">0</b></span>
    <span class="pp-chip pp-dots" data-dots></span>
    <span class="pp-chip" data-hud="rulewrap">RULE <b data-tag></b></span>
    <span class="pp-spacer"></span>
    <button class="pp-btn pp-icon-btn" type="button" data-help aria-label="How to play" title="How to play (H)">${iconSVG("helpCircle", { size: 14 })}<span class="pp-btn-label">Help</span></button>
    <button class="pp-btn pp-icon-btn" type="button" data-cheats aria-label="Cheats" title="Cheats (C)">${iconSVG("wrench", { size: 14 })}<span class="pp-btn-label">Cheats</span><span class="pp-cheat-dot" data-cheat-dot hidden></span></button>
    <button class="pp-btn pp-icon-btn" type="button" data-pause aria-label="Pause" title="Pause (P)">${iconSVG("pause", { size: 14 })}<span class="pp-btn-label">Pause</span></button>
    <button class="pp-btn pp-icon-btn" type="button" data-restart aria-label="Restart" title="Restart (R)">${iconSVG("refresh", { size: 14 })}<span class="pp-btn-label">Restart</span></button>
    <button class="pp-btn pp-icon-btn" type="button" data-exit aria-label="Exit game" title="Exit game">${iconSVG("logOut", { size: 14 })}<span class="pp-btn-label">Exit game</span></button>
  </div>
  <section class="game-panel pp-panel" data-board>
    <div class="pp-stage" data-stage>
      <div class="pp-row" data-seq></div>
      <div class="pp-prompt">Which tile comes next?</div>
      <div class="pp-row pp-opts" data-opts role="group" aria-label="Answer tiles"></div>
      <div class="pp-fb" data-fb aria-live="polite"></div>
      <div class="pp-burst" data-burst></div>
      <div class="pp-toast" data-toast></div>
    </div>

    <div class="pp-ov" data-ov="start">
      <div class="pp-ov-card">
        <div class="pp-head"><h3>Pattern Party</h3></div>
        <div class="pp-body">
          <p>Look at the row of tiles, find the repeating rule, and pick the tile that finishes it. ${ROUNDS} rounds, one pick each — choose carefully!</p>
          <div class="pp-ov-actions" data-start-local>
            <button type="button" class="pp-btn primary" data-act="start" data-opp="bot">Play vs Bot</button>
            <button type="button" class="pp-btn" data-act="start" data-opp="solo">Solo practice (score ${NEED}+)</button>
          </div>
          <div class="pp-ov-actions" data-start-host hidden>
            <button type="button" class="pp-btn primary" data-act="start" data-opp="duel">Start match</button>
            <p class="pp-note">Seats and the first turn are randomized every match.</p>
          </div>
          <div data-start-wait hidden>
            <p><b>Waiting for the host to start…</b></p>
            <p class="pp-note">Seats and the first turn are random — you might go first!</p>
          </div>
        </div>
        <div class="pp-foot"><span class="pp-note" data-best-line hidden></span><button type="button" class="pp-btn tiny" data-act="help">How to play</button></div>
      </div>
    </div>

    <div class="pp-ov" data-ov="help" hidden>
      <div class="pp-ov-card">
        <div class="pp-head"><h3>How to play</h3><button type="button" class="pp-btn tiny" data-help-close aria-label="Close help">Close</button></div>
        <div class="pp-body pp-howto">
          <div class="pp-step"><b class="num">1</b><span>Four tiles follow a secret rule — shapes, colors, or both. The dashed box is the missing tile.</span></div>
          <div class="pp-step"><b class="num">2</b><span>Find the rule. Example: circle, square, circle, square… the next tile is a <b>circle</b>.</span></div>
          <div class="pp-demo">${demoRow}</div>
          <div class="pp-step"><b class="num">3</b><span>Tap the matching tile below, or press <b>1–3</b>. One pick per round — no second try!</span></div>
          <div class="pp-step"><b class="num">4</b><span>${ROUNDS} rounds. Solo: score ${NEED}+ to win. Vs Bot / online duel: turns alternate (who starts is random) — most points wins.</span></div>
          <div class="pp-keys">
            <kbd>1 · 2 · 3</kbd><span>Pick a tile</span>
            <kbd>← →</kbd><span>Move the selection</span>
            <kbd>Enter / Space</kbd><span>Confirm selection</span>
            <kbd>R</kbd><span>Restart match</span>
            <kbd>H</kbd><span>Toggle this help</span>
            <kbd>C</kbd><span>Toggle the cheat lab</span>
            <kbd>P / Esc</kbd><span>Pause / close overlays</span>
          </div>
          <p class="pp-note">On touch screens, tap tiles directly or use the ◀ PICK ▶ pad under the board.</p>
        </div>
        <div class="pp-foot"><span class="pp-note">Press H to reopen this guide</span><button type="button" class="pp-btn primary" data-help-close>Got it</button></div>
      </div>
    </div>

    <div class="pp-ov" data-ov="cheat" hidden>
      <div class="pp-ov-card">
        <div class="pp-head"><h3>Cheat lab</h3><button type="button" class="pp-btn tiny" data-cheats-close aria-label="Close cheats">Close</button></div>
        <div class="pp-body pp-cheats">
          <p>Little helpers to make the party easier. Toggle anytime with <kbd>C</kbd>.</p>
          <label class="pp-cheat"><input type="checkbox" data-cheat="hint"><span><span class="t">Answer hint</span><span class="d">A soft violet ring marks the correct tile on your turn.</span></span></label>
          <label class="pp-cheat"><input type="checkbox" data-cheat="fifty"><span><span class="t">50 / 50</span><span class="d">Fades out one wrong tile every round.</span></span></label>
          <label class="pp-cheat"><input type="checkbox" data-cheat="auto"><span><span class="t">Auto answer</span><span class="d">Plays the correct tile for you after a short pause.</span></span></label>
          <label class="pp-cheat" data-weak-row><input type="checkbox" data-cheat="weak"><span><span class="t">Clumsy bot</span><span class="d">The bot always misses (vs Bot mode only).</span></span></label>
          <p class="pp-note">Hint, 50/50 and Auto only change your own screen. “+1 point” changes the real score — your rival will see it in an online duel. Play fair-ish!</p>
        </div>
        <div class="pp-foot"><button type="button" class="pp-btn" data-act="cheat-point">+1 point for me</button><button type="button" class="pp-btn primary" data-cheats-close>Back to the game</button></div>
      </div>
    </div>

    <div class="pp-ov" data-ov="pause" hidden>
      <div class="pp-ov-card">
        <div class="pp-head"><h3>Paused</h3></div>
        <div class="pp-body"><p>The board, bot and all timers are frozen. Resume when you are ready — nothing jumps ahead.</p></div>
        <div class="pp-foot"><span class="pp-note">P or Esc to resume</span><button type="button" class="pp-btn primary" data-resume>Resume</button></div>
      </div>
    </div>

    <div class="pp-ov" data-ov="over" hidden>
      <div class="pp-ov-card">
        <div class="pp-head"><h3 data-over-title>Party time!</h3></div>
        <div class="pp-body">
          <p data-over-scores></p>
          <p data-over-sub></p>
          <p class="pp-note" data-over-best hidden></p>
          <p class="pp-note">Seats and the first turn are re-randomized every match.</p>
        </div>
        <div class="pp-foot">
          <button type="button" class="pp-btn" data-act="lobby" data-lobby-btn>Change mode</button>
          <button type="button" class="pp-btn primary" data-act="restart">Rematch</button>
        </div>
      </div>
    </div>
  </section>
  <div class="pp-pad" aria-label="Touch controls">
    <button type="button" class="pp-pad-btn" data-pad="left" aria-label="Select previous tile">◀</button>
    <button type="button" class="pp-pad-btn pp-pad-ok" data-pad="ok" aria-label="Pick selected tile">PICK</button>
    <button type="button" class="pp-pad-btn" data-pad="right" aria-label="Select next tile">▶</button>
  </div>
</div>`;

    /* ---------------- refs ---------------- */
    const statusEl = $("[data-status]");
    const cards = [$('[data-card="0"]'), $('[data-card="1"]')];
    const names = [$('[data-name="0"]'), $('[data-name="1"]')];
    const scores = [$('[data-score="0"]'), $('[data-score="1"]')];
    const roundEl = $("[data-round]");
    const dotsEl = $("[data-dots]");
    const tagEl = $("[data-tag]");
    const seqEl = $("[data-seq]");
    const optsEl = $("[data-opts]");
    const fbEl = $("[data-fb]");
    const stageEl = $("[data-stage]");
    const burstEl = $("[data-burst]");
    const toastEl = $("[data-toast]");
    const ovStart = $('[data-ov="start"]');
    const ovHelp = $('[data-ov="help"]');
    const ovCheat = $('[data-ov="cheat"]');
    const ovPause = $('[data-ov="pause"]');
    const ovOver = $('[data-ov="over"]');
    const helpBtn = $("[data-help]");
    const cheatsBtn = $("[data-cheats]");
    const pauseBtn = $("[data-pause]");
    const startLocal = $("[data-start-local]");
    const startHost = $("[data-start-host]");
    const startWait = $("[data-start-wait]");
    const overTitle = $("[data-over-title]");
    const overScores = $("[data-over-scores]");
    const overSub = $("[data-over-sub]");
    const overBest = $("[data-over-best]");
    const bestLine = $("[data-best-line]");
    const restartBtn = $("[data-restart]");
    const cheatDot = $("[data-cheat-dot]");
    const lobbyBtn = $("[data-lobby-btn]");
    const padBtns = $$("[data-pad]");
    const cheatInputs = $$("[data-cheat]");

    /* ---------------- local (tidak di-sync) ---------------- */
    let destroyed = false;
    let helpOpen = false, cheatOpen = false, paused = false;
    let clockShift = 0, perfShift = 0, pauseAt = 0, perfPauseAt = 0;
    const shiftedNow = () => Date.now() - clockShift;
    const shiftedPerf = () => performance.now() - perfShift;
    let seenHelp = true;
    try { seenHelp = localStorage.getItem("patternPartyHelpSeen") === "1"; } catch (e) { seenHelp = true; }
    if (!seenHelp) {
        helpOpen = true;
        try { localStorage.setItem("patternPartyHelpSeen", "1"); } catch (e) { /* storage blocked */ }
    }
    let sel = 0, selVisible = false;
    const cheats = { hint: false, fifty: false, auto: false, weak: false };
    let nextTimer = null, actorTimer = null, burstTimer = null, actorKey = "";
    let lastFx = "", lastGid = 0, lastRoundKey = "";
    let best = 0;
    try { best = Number(localStorage.getItem(META.bestKey)) || 0; } catch (e) { /* private mode */ }
    function saveBest() { try { localStorage.setItem(META.bestKey, String(best)); } catch (e) { /* ignore */ } }

    /* Semua timer game lewat wrapper ini: saat pause/help/cheat timer dibekukan,
     * lalu dipasang ulang dengan sisa durasi saat lanjut (anchor waktu digeser). */
    let frozenNow = helpOpen || cheatOpen || paused;
    const pending = new Map();
    let timerSeq = 0;
    function armTimer(rec, delay) {
        rec.left = Math.max(0, Number(delay) || 0);
        rec.due = shiftedNow() + rec.left;
        rec.handle = setTimeout(() => {
            pending.delete(rec.id);
            if (!destroyed) rec.fn();
        }, rec.left);
    }
    function setGameTimer(fn, delay) {
        const id = ++timerSeq;
        const rec = { id, fn, handle: null, left: Math.max(0, Number(delay) || 0), due: 0 };
        pending.set(id, rec);
        if (!frozenNow) armTimer(rec, rec.left);
        return id;
    }
    function clearGameTimer(id) {
        const rec = pending.get(id);
        if (!rec) return;
        if (rec.handle !== null) clearTimeout(rec.handle);
        pending.delete(id);
    }
    function freezeGameTimers() {
        for (const rec of pending.values()) {
            if (rec.handle !== null) {
                clearTimeout(rec.handle);
                rec.handle = null;
                rec.left = Math.max(0, rec.due - shiftedNow());
            }
        }
    }
    function thawGameTimers() {
        for (const rec of pending.values()) if (rec.handle === null) armTimer(rec, rec.left);
    }
    function syncFreeze() {
        const f = paused || helpOpen || cheatOpen;
        if (f === frozenNow) return;
        frozenNow = f;
        if (f) freezeGameTimers(); else thawGameTimers();
    }

    function clearRoundTimers() {
        clearGameTimer(nextTimer); nextTimer = null;
        clearGameTimer(actorTimer); actorTimer = null; actorKey = "";
    }

    /* ---------------- state factory ---------------- */
    function lobbyState() {
        return { v: 1, gid: 0, phase: "lobby", mode: online ? "duel" : "bot", seed: 0, first: 0, turn: 0, seats: [0, 1], round: 1, scores: [0, 0], log: [], picked: null, ok: null };
    }

    /* Match baru: seed soal, giliran pertama, dan kursi pemain diacak.
     * Hanya authority (host / lokal) yang memanggil ini; hasilnya di-publish. */
    function newGame(opp) {
        clearRoundTimers();
        const seed = (Math.random() * 4294967296) >>> 0;
        const first = Math.random() < 0.5 ? 0 : 1;
        const seats = online && Math.random() < 0.5 ? [1, 0] : [0, 1]; // seats[koneksi] = kursi
        state = {
            v: 1,
            gid: (Math.random() * 0x7fffffff) | 0,
            phase: "playing",
            mode: opp,
            seed,
            first,
            turn: opp === "solo" ? 0 : first,
            seats,
            round: 1,
            scores: [0, 0],
            log: [],
            picked: null,
            ok: null,
        };
        publish();
    }

    /* ---------------- render ---------------- */
    function render() {
        if (destroyed) return;
        const st = state;
        const pat = patNow();
        const my = st ? mySeat() : 0;
        const solo = Boolean(st && st.mode === "solo");
        const playing = Boolean(st && st.phase === "playing");
        const reveal = Boolean(st && (st.phase === "reveal" || st.phase === "over"));
        const mine = myTurn();
        const cut = mine && cheats.fifty ? (pat.answerIdx + 1) % 3 : -1;

        const rk = st ? st.gid + ":" + st.round : "";
        if (rk !== lastRoundKey) { lastRoundKey = rk; sel = 0; selVisible = false; }

        /* Weak-bot hanya berlaku lokal vs bot. */
        if (cheats.weak && (online || !st || st.mode !== "bot")) cheats.weak = false;

        /* status chip */
        let status = "Ready";
        if (!st) status = "Waiting for host…";
        else if (st.phase === "lobby") status = online && !room.isHost ? "Waiting for host…" : "Ready";
        else if (playing) status = solo || mine ? "Your turn" : st.mode === "bot" ? "Bot is thinking…" : "Rival's turn";
        else if (st.phase === "reveal") status = st.ok ? "Correct!" : "Not quite";
        else status = "Match over";
        if (paused) status = "Paused";
        statusEl.textContent = status;

        /* scoreboard */
        names[0].textContent = nameOf(0, st);
        scores[0].textContent = st ? String(st.scores[0]) : "0";
        if (solo) { names[1].textContent = "Target"; scores[1].textContent = String(NEED); }
        else { names[1].textContent = nameOf(1, st); scores[1].textContent = st ? String(st.scores[1]) : "0"; }
        cards[0].classList.toggle("is-turn", Boolean(playing && (solo || st.turn === 0)));
        cards[1].classList.toggle("is-turn", Boolean(playing && !solo && st.turn === 1));

        /* round + progress dots */
        roundEl.textContent = st && st.phase !== "lobby" ? "Round " + st.round + " / " + ROUNDS : ROUNDS + " rounds";
        dotsEl.innerHTML = Array.from({ length: ROUNDS }, (_, i) => {
            let c = "pp-dot";
            if (st && st.phase !== "lobby") {
                if (i < st.log.length) c += st.log[i] ? " ok" : " bad";
                else if (i === st.round - 1 && st.phase !== "over") c += " now";
            }
            return '<span class="' + c + '"></span>';
        }).join("");

        tagEl.textContent = pat.label;

        const fxKey = st ? st.gid + ":" + st.round : "";
        const fresh = Boolean(st && st.phase === "reveal" && fxKey !== lastFx);

        /* baris soal + lubang */
        seqEl.innerHTML = pat.seq.map((t, i) => {
            if (i < 4) return '<div class="pp-tile">' + shapeSvg(t.shape, t.color) + "</div>";
            const ans = pat.seq[4];
            return reveal
                ? '<div class="pp-tile pp-hole filled' + (fresh ? " pp-pop" : "") + '" data-hole>' + shapeSvg(ans.shape, ans.color) + "</div>"
                : '<div class="pp-tile pp-hole" data-hole><span class="pp-q">?</span></div>';
        }).join("");

        /* opsi jawaban */
        optsEl.innerHTML = pat.options.map((t, i) => {
            const cls = ["pp-tile", "pp-opt"];
            let dis = true;
            if (playing) {
                if (mine) {
                    dis = i === cut;
                    if (i === cut) cls.push("cut");
                    if (cheats.hint && i === pat.answerIdx) cls.push("hint");
                    if (selVisible && i === sel && i !== cut) cls.push("sel");
                } else cls.push("dim");
            } else if (reveal) {
                if (i === pat.answerIdx) cls.push("right");
                else if (st.phase === "reveal" && i === st.picked && !st.ok) cls.push("wrong");
                else cls.push("dim");
            }
            return '<button type="button" class="' + cls.join(" ") + '" data-opt="' + i + '" aria-label="' + t.color + " " + t.shape + '"' + (dis ? " disabled" : "") + '><span class="pp-kbd">' + (i + 1) + "</span>" + shapeSvg(t.shape, t.color) + "</button>";
        }).join("");

        /* feedback */
        fbEl.className = "pp-fb";
        fbEl.textContent = "";
        if (st) {
            if (st.phase === "reveal") {
                fbEl.classList.add(st.ok ? "ok" : "bad");
                fbEl.textContent = st.ok ? PRAISE[(st.round - 1) % PRAISE.length] : "Oops! The green tile was next.";
            } else if (playing && !mine) {
                fbEl.classList.add("wait");
                fbEl.textContent = st.mode === "bot" ? "Watch the bot pick…" : "Watch your rival pick…";
            }
        }

        /* pad + HUD controls */
        padBtns.forEach((b) => { b.disabled = !mine || paused; });
        restartBtn.hidden = !st || st.phase === "lobby";
        cheatDot.hidden = !(cheats.hint || cheats.fifty || cheats.auto || cheats.weak);
        const pauseLabel = pauseBtn.querySelector(".pp-btn-label");
        if (pauseLabel) pauseLabel.textContent = paused ? "Resume" : "Pause";
        pauseBtn.setAttribute("aria-label", paused ? "Resume" : "Pause");
        pauseBtn.hidden = online;
        pauseBtn.disabled = !st || st.phase === "lobby";
        cheatsBtn.setAttribute("aria-label", cheatDot.hidden ? "Cheats" : "Cheats active");
        cheatsBtn.classList.toggle("on", !cheatDot.hidden);
        helpBtn.setAttribute("aria-expanded", String(helpOpen));

        /* overlays: help > cheats > pause > phase */
        ovStart.hidden = Boolean(st && st.phase !== "lobby") || paused || helpOpen || cheatOpen;
        startLocal.hidden = online;
        startHost.hidden = !online || !room.isHost;
        startWait.hidden = !online || room.isHost;
        ovOver.hidden = !st || st.phase !== "over" || paused || helpOpen || cheatOpen;
        ovPause.hidden = !paused || helpOpen || cheatOpen;
        ovHelp.hidden = !helpOpen;
        ovCheat.hidden = !cheatOpen || helpOpen;
        lobbyBtn.hidden = online;

        /* cheat controls */
        cheatInputs.forEach((inp) => {
            const k = inp.dataset.cheat;
            const off = k === "weak" && (online || !st || st.mode !== "bot");
            inp.checked = cheats[k];
            inp.disabled = off;
            inp.closest(".pp-cheat").classList.toggle("off", off);
        });

        bestLine.hidden = best <= 0;
        bestLine.textContent = "Best solo score: " + best + " / " + ROUNDS;

        /* hasil akhir */
        if (st && st.phase === "over") {
            const s0 = st.scores[0], s1 = st.scores[1];
            let title, sub;
            if (st.mode === "solo") {
                const win = s0 >= NEED;
                title = win ? "Party time! 🎉" : "Keep practicing!";
                sub = win ? "You solved " + s0 + " of " + ROUNDS + " — the party is on!" : "You solved " + s0 + " of " + ROUNDS + ". Reach " + NEED + " to win.";
                if (s0 > best) { best = s0; saveBest(); }
            } else {
                const me = st.scores[my], op = st.scores[1 - my];
                title = me > op ? "You win! 🎉" : me < op ? (st.mode === "bot" ? "Bot wins!" : "Rival wins!") : "It's a tie!";
                sub = me > op ? "Pattern champion — nice eyes!" : me < op ? "Rematch and flip the table!" : "Evenly matched. One more match?";
            }
            overTitle.textContent = title;
            overScores.textContent = st.mode === "solo"
                ? nameOf(0, st) + " " + s0 + " · Target " + NEED
                : nameOf(0, st) + " " + s0 + " — " + s1 + " " + nameOf(1, st);
            overSub.textContent = sub;
            overBest.hidden = !(st.mode === "solo" && best > 0);
            overBest.textContent = "Best solo score: " + best + " / " + ROUNDS;
        }

        /* toast match baru: siapa jalan duluan */
        if (st && st.phase === "playing" && st.gid && st.gid !== lastGid) {
            lastGid = st.gid;
            announce(solo ? "Solo practice — good luck!" : st.turn === my ? "You go first!" : nameOf(st.turn, st) + " goes first!");
        }

        /* efek hanya sekali per transisi */
        if (fresh) { lastFx = fxKey; if (st.ok) burst(); }

        syncFreeze();
        scheduleActors();
    }

    function announce(text) {
        toastEl.textContent = text;
        toastEl.classList.remove("show");
        void toastEl.offsetWidth; /* restart animasi */
        toastEl.classList.add("show");
    }

    function burst() {
        const hole = $('[data-hole]');
        if (!hole) return;
        clearGameTimer(burstTimer);
        burstEl.innerHTML = "";
        const bb = stageEl.getBoundingClientRect();
        const hb = hole.getBoundingClientRect();
        const cx = hb.left - bb.left + hb.width / 2;
        const cy = hb.top - bb.top + hb.height / 2;
        const cols = ["#fbbf24", "#f472b6", "#34d399", "#60a5fa", "#a78bfa"];
        for (let i = 0; i < 10; i++) {
            const ang = (Math.PI / 5) * i + 0.31;
            const dist = 58 + (i % 3) * 24;
            const el = document.createElement("div");
            el.className = "pp-star";
            el.style.left = cx.toFixed(1) + "px";
            el.style.top = cy.toFixed(1) + "px";
            el.style.setProperty("--pp-dx", (Math.cos(ang) * dist).toFixed(1) + "px");
            el.style.setProperty("--pp-dy", (Math.sin(ang) * dist).toFixed(1) + "px");
            el.style.color = cols[i % cols.length];
            el.innerHTML = STAR_SVG;
            burstEl.appendChild(el);
        }
        burstTimer = setGameTimer(() => { burstTimer = null; burstEl.innerHTML = ""; }, 950);
    }

    /* ---------------- bot & auto-answer ---------------- */
    function scheduleActors() {
        if (destroyed) return;
        let key = "", fn = null, delay = 0;
        if (state && state.phase === "playing") {
            if (isAuthority() && state.mode === "bot" && state.turn === 1) {
                key = "bot:" + state.gid + ":" + state.round + ":" + cheats.weak;
                delay = 900 + Math.random() * 1300;
                fn = () => {
                    const pat = makePattern(state.round, state.seed);
                    const acc = cheats.weak ? 0 : state.round <= 6 ? 0.75 : 0.6;
                    let i = pat.answerIdx;
                    if (Math.random() >= acc) {
                        const wrong = [0, 1, 2].filter((x) => x !== pat.answerIdx);
                        i = wrong[(Math.random() * wrong.length) | 0];
                    }
                    applyAction({ type: "pick", i, round: state.round }, 1);
                };
            } else if (myTurn() && cheats.auto) {
                key = "auto:" + state.gid + ":" + state.round;
                delay = 650;
                fn = () => submitAction({ type: "pick", i: makePattern(state.round, state.seed).answerIdx, round: state.round });
            }
        }
        if (key !== actorKey) {
            clearGameTimer(actorTimer);
            actorTimer = null;
            actorKey = key;
            if (fn) actorTimer = setGameTimer(() => { actorTimer = null; fn(); }, delay);
        }
    }

    /* ---------------- canonical state flow ---------------- */
    function publish() {
        render();
        /* Hanya host yang menulis state kanonik ke Firebase. */
        if (online && room.isHost) Promise.resolve(room.publishState(state)).catch(console.warn);
    }

    function advance() {
        nextTimer = null;
        if (destroyed || !state || state.phase !== "reveal") return;
        if (state.round >= ROUNDS) { state.phase = "over"; publish(); return; }
        state.round += 1;
        state.turn = state.mode === "solo" ? 0 : 1 - state.turn;
        state.phase = "playing";
        state.picked = null;
        state.ok = null;
        publish();
    }

    function applyAction(action, actor) {
        if (!state || !action || typeof action.type !== "string") return;
        const seat = seatOf(actor);
        if (action.type === "start") {
            if (online && actor !== 0) return; /* host only */
            if (state.phase !== "lobby" && state.phase !== "over") return;
            newGame(online ? "duel" : action.opp === "solo" ? "solo" : "bot");
            return;
        }
        if (action.type === "restart") {
            if (state.phase === "lobby") return;
            newGame(state.mode);
            return;
        }
        if (action.type === "lobby") {
            if (online && actor !== 0) return;
            clearRoundTimers();
            state = { ...state, phase: "lobby" };
            publish();
            return;
        }
        if (action.type === "cheatPoint") {
            if (state.phase !== "playing" && state.phase !== "reveal") return;
            state.scores[seat] = Math.min(99, state.scores[seat] + 1);
            publish();
            return;
        }
        if (action.type === "pick") {
            if (state.phase !== "playing") return;
            if (seat !== state.turn) return;      /* bukan giliranmu */
            if (action.round !== state.round) return; /* aksi basi */
            const i = Number(action.i);
            if (!Number.isInteger(i) || i < 0 || i > 2) return;
            const pat = makePattern(state.round, state.seed);
            const ok = check(pat, i);
            state.picked = i;
            state.ok = ok;
            state.phase = "reveal";
            state.log.push(ok ? 1 : 0);
            if (ok) state.scores[seat] += 1;
            publish();
            nextTimer = setGameTimer(advance, ok ? 1150 : 1700);
        }
    }

    function submitAction(action) {
        if (online && !room.isHost) {
            Promise.resolve(room.sendAction(action)).catch(console.warn);
            return;
        }
        applyAction(action, playerIndex);
    }

    /* ---------------- input: mouse / touch ---------------- */
    function moveSel(dir) {
        if (!myTurn() || helpOpen || cheatOpen || paused) return;
        let n = sel;
        for (let k = 0; k < 3; k++) {
            n = (n + dir + 3) % 3;
            if (n !== cutIdx()) break;
        }
        sel = n;
        selVisible = true;
        render();
    }

    function toggleHelp(on) {
        helpOpen = typeof on === "boolean" ? on : !helpOpen;
        if (helpOpen) cheatOpen = false;
        render();
    }
    function toggleCheats(on) {
        cheatOpen = typeof on === "boolean" ? on : !cheatOpen;
        if (cheatOpen) helpOpen = false;
        render();
    }
    function setPaused(on) {
        if (online) return;
        const next = typeof on === "boolean" ? on : !paused;
        if (next === paused) { render(); return; }
        if (next) {
            pauseAt = shiftedNow();
            perfPauseAt = shiftedPerf();
            helpOpen = false;
            cheatOpen = false;
        } else {
            /* Resume: geser anchor Date.now()/performance.now() agar tidak loncat. */
            clockShift += shiftedNow() - pauseAt;
            perfShift += shiftedPerf() - perfPauseAt;
        }
        paused = next;
        render();
    }

    function handleClick(event) {
        const el = event.target.closest("[data-exit],[data-help],[data-help-close],[data-cheats],[data-cheats-close],[data-pause],[data-resume],[data-restart],[data-act],[data-opt],[data-pad],[data-cheat]");
        if (!el) return;
        if (el.hasAttribute("data-exit")) { onExit(); return; }
        if (el.hasAttribute("data-help")) { toggleHelp(); return; }
        if (el.hasAttribute("data-help-close")) { toggleHelp(false); return; }
        if (el.hasAttribute("data-cheats")) { toggleCheats(); return; }
        if (el.hasAttribute("data-cheats-close")) { toggleCheats(false); return; }
        if (el.hasAttribute("data-pause")) { setPaused(!paused); return; }
        if (el.hasAttribute("data-resume")) { setPaused(false); return; }
        if (el.hasAttribute("data-restart")) { helpOpen = false; cheatOpen = false; paused = false; submitAction({ type: "restart" }); return; }
        if (el.dataset.cheat) {
            cheats[el.dataset.cheat] = el.checked;
            if (el.dataset.cheat === "fifty" && el.checked && sel === cutIdx()) moveSel(1);
            render();
            return;
        }
        if (el.dataset.pad) {
            if (helpOpen || cheatOpen || paused) return;
            if (el.dataset.pad === "ok") {
                if (myTurn() && sel !== cutIdx()) submitAction({ type: "pick", i: sel, round: state.round });
            } else moveSel(el.dataset.pad === "left" ? -1 : 1);
            return;
        }
        if (el.dataset.act) {
            const a = el.dataset.act;
            if (a === "start") { helpOpen = false; cheatOpen = false; paused = false; submitAction({ type: "start", opp: el.dataset.opp || "bot" }); }
            else if (a === "restart") { helpOpen = false; cheatOpen = false; paused = false; submitAction({ type: "restart" }); }
            else if (a === "lobby") submitAction({ type: "lobby" });
            else if (a === "help") toggleHelp(true);
            else if (a === "cheats") toggleCheats(false);
            else if (a === "cheat-point") submitAction({ type: "cheatPoint" });
            return;
        }
        if (el.dataset.opt !== undefined) {
            if (helpOpen || cheatOpen || paused) return;
            const i = parseInt(el.dataset.opt, 10);
            if (myTurn() && i !== cutIdx()) submitAction({ type: "pick", i, round: state.round });
        }
    }

    /* ---------------- input: keyboard (desktop) ---------------- */
    function onKey(e) {
        if (destroyed || !root.isConnected) return;
        if (e.ctrlKey || e.metaKey || e.altKey) return;
        const t = e.target;
        if (t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) && !root.contains(t)) return;
        const k = e.key;
        /* prioritas: help → cheats → pause → Escape → aksi game (H/C/P/R) */
        if (k === "h" || k === "H" || k === "?") { toggleHelp(); e.preventDefault(); return; }
        if (k === "c" || k === "C") { toggleCheats(); e.preventDefault(); return; }
        if (k === "p" || k === "P") {
            if (helpOpen) toggleHelp(false);
            else if (cheatOpen) toggleCheats(false);
            else setPaused(!paused);
            e.preventDefault(); return;
        }
        if (k === "Escape") {
            if (helpOpen) toggleHelp(false);
            else if (cheatOpen) toggleCheats(false);
            else if (paused) setPaused(false);
            e.preventDefault(); return;
        }
        if (k === "r" || k === "R") {
            if (!helpOpen && !cheatOpen && !paused && state && state.phase !== "lobby") submitAction({ type: "restart" });
            e.preventDefault(); return;
        }
        if (helpOpen || cheatOpen || paused) return;
        if (!state) return;
        /* Enter/Space pada tombol yang ter-focus dibiarkan native (klik). */
        const nativeBtn = (k === "Enter" || k === " ") && t && t.tagName === "BUTTON" && root.contains(t);
        if (state.phase === "lobby") {
            if (k === "Enter" && !nativeBtn && (!online || room.isHost)) { submitAction({ type: "start", opp: online ? "duel" : "bot" }); e.preventDefault(); }
            return;
        }
        if (state.phase === "over") {
            if (k === "Enter" && !nativeBtn) { submitAction({ type: "restart" }); e.preventDefault(); }
            return;
        }
        if (state.phase !== "playing" || !myTurn()) return;
        if (k === "1" || k === "2" || k === "3") {
            const i = Number(k) - 1;
            if (i !== cutIdx()) submitAction({ type: "pick", i, round: state.round });
            e.preventDefault();
            return;
        }
        if (k === "ArrowLeft" || k === "ArrowRight") { moveSel(k === "ArrowLeft" ? -1 : 1); e.preventDefault(); return; }
        if ((k === "Enter" || k === " ") && !nativeBtn) {
            if (selVisible) { if (sel !== cutIdx()) submitAction({ type: "pick", i: sel, round: state.round }); }
            else { selVisible = true; render(); }
            e.preventDefault();
        }
    }

    /* ---------------- boot ---------------- */
    const subs = [];
    const sub = (fn) => { try { const u = fn(); if (typeof u === "function") subs.push(u); } catch (err) { console.warn(err); } };

    root.addEventListener("click", handleClick);
    document.addEventListener("keydown", onKey);

    if (online) {
        sub(() => room.onRoom((nextRoom) => { roomData = nextRoom; render(); }));
        if (room.isHost) {
            state = lobbyState();
            publish();
            sub(() => room.onAction((action) => applyAction(action, 1)));
        } else {
            sub(() => room.onState((nextState) => { state = nextState; render(); }));
            render(); /* layar tunggu sampai state pertama tiba */
        }
    } else {
        state = lobbyState();
        render();
    }

    return {
        destroy() {
            destroyed = true;
            clearRoundTimers();
            clearGameTimer(burstTimer);
            pending.clear();
            root.removeEventListener("click", handleClick);
            document.removeEventListener("keydown", onKey);
            subs.forEach((u) => { try { u(); } catch (err) { /* ignore */ } });
        },
    };
}