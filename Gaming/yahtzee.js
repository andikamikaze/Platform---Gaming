/* ==== GAME: yahtzee.js ==== */
import { iconSVG } from "../JS/icons.js";
/* ===================================================================== */
/* YAHTZEE — aturan resmi: 5 dadu, maks 3 lemparan/giliran, 13 kategori.  */
/* Bonus upper +35 (>=63), bonus Yahtzee +100 + aturan Joker.             */
/* Mode: vs AI (kocok giliran pertama), Challenge (level acak yang pasti  */
/* bisa diselesaikan), Online room (kursi & giliran pertama diacak).      */
/* ===================================================================== */

export const META = {
    id: "yahtzee", // harus sama dengan nama file (tanpa .js)
    name: "Yahtzee",
    category: "casino",
    catLabel: "Casino",
    desc: "Roll up to 3 times, hold your best dice, fill 13 boxes. Real rules: +35 upper bonus, +100 Yahtzee bonus & Joker.",
    art: '<svg viewBox="0 0 48 48" width="54" height="54" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="1" y="19" width="8.5" height="8.5" rx="2"/><circle cx="5.25" cy="23.25" r="1" fill="currentColor" stroke="none"/><rect x="10.5" y="19" width="8.5" height="8.5" rx="2"/><circle cx="12.7" cy="21.2" r="1" fill="currentColor" stroke="none"/><circle cx="16.8" cy="25.3" r="1" fill="currentColor" stroke="none"/><rect x="20" y="19" width="8.5" height="8.5" rx="2"/><circle cx="22.2" cy="21.2" r="1" fill="currentColor" stroke="none"/><circle cx="24.25" cy="23.25" r="1" fill="currentColor" stroke="none"/><circle cx="26.3" cy="25.3" r="1" fill="currentColor" stroke="none"/><rect x="29.5" y="19" width="8.5" height="8.5" rx="2"/><circle cx="31.7" cy="21.2" r="1" fill="currentColor" stroke="none"/><circle cx="35.8" cy="21.2" r="1" fill="currentColor" stroke="none"/><circle cx="31.7" cy="25.3" r="1" fill="currentColor" stroke="none"/><circle cx="35.8" cy="25.3" r="1" fill="currentColor" stroke="none"/><rect x="39" y="19" width="8.5" height="8.5" rx="2"/><circle cx="41.2" cy="21.2" r="1" fill="currentColor" stroke="none"/><circle cx="45.3" cy="21.2" r="1" fill="currentColor" stroke="none"/><circle cx="43.25" cy="23.25" r="1" fill="currentColor" stroke="none"/><circle cx="41.2" cy="25.3" r="1" fill="currentColor" stroke="none"/><circle cx="45.3" cy="25.3" r="1" fill="currentColor" stroke="none"/></svg>',
    bg: ["#bbf7d0", "#22c55e"],
    bestKey: "yahtzeeBest",
};

/* ---------------- aturan murni (dipakai game, AI, dan simulator level) ---------------- */

const ROUNDS = 13;
const CATS = [
    { id: "ones", label: "Ones", sec: "upper", rule: "Add all dice showing 1", pts: "1 each" },
    { id: "twos", label: "Twos", sec: "upper", rule: "Add all dice showing 2", pts: "2 each" },
    { id: "threes", label: "Threes", sec: "upper", rule: "Add all dice showing 3", pts: "3 each" },
    { id: "fours", label: "Fours", sec: "upper", rule: "Add all dice showing 4", pts: "4 each" },
    { id: "fives", label: "Fives", sec: "upper", rule: "Add all dice showing 5", pts: "5 each" },
    { id: "sixes", label: "Sixes", sec: "upper", rule: "Add all dice showing 6", pts: "6 each" },
    { id: "threeKind", label: "3 of a Kind", sec: "lower", rule: "3+ alike: sum of all 5 dice", pts: "sum" },
    { id: "fourKind", label: "4 of a Kind", sec: "lower", rule: "4+ alike: sum of all 5 dice", pts: "sum" },
    { id: "fullHouse", label: "Full House", sec: "lower", rule: "3 of one + 2 of another", pts: "25" },
    { id: "smallStraight", label: "Small Straight", sec: "lower", rule: "Any 4 in a row", pts: "30" },
    { id: "largeStraight", label: "Large Straight", sec: "lower", rule: "5 in a row", pts: "40" },
    { id: "yahtzee", label: "Yahtzee", sec: "lower", rule: "All 5 alike (again: +100)", pts: "50" },
    { id: "chance", label: "Chance", sec: "lower", rule: "Anything: sum of all dice", pts: "sum" },
];
const UPPER = ["ones", "twos", "threes", "fours", "fives", "sixes"];
const LOWER = CATS.filter((c) => c.sec === "lower").map((c) => c.id);
const ID_FACE = { ones: 1, twos: 2, threes: 3, fours: 4, fives: 5, sixes: 6 };
const FACE_ID = { 1: "ones", 2: "twos", 3: "threes", 4: "fours", 5: "fives", 6: "sixes" };
const LABEL = {};
for (const c of CATS) LABEL[c.id] = c.label;

const PIP = {
    0: [],
    1: [[30, 30]],
    2: [[20, 20], [40, 40]],
    3: [[20, 20], [30, 30], [40, 40]],
    4: [[20, 20], [40, 20], [20, 40], [40, 40]],
    5: [[20, 20], [40, 20], [30, 30], [20, 40], [40, 40]],
    6: [[20, 20], [40, 20], [20, 30], [40, 30], [20, 40], [40, 40]],
};

const randInt = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
const rollDie = () => 1 + Math.floor(Math.random() * 6);
const esc = (s) => String(s).replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
const cleanName = (s) => String(s || "").trim().slice(0, 16);

function scoreCategory(cat, dice) {
    const c = [0, 0, 0, 0, 0, 0, 0];
    let sum = 0, maxCount = 0;
    for (const v of dice) {
        if (v >= 1 && v <= 6) {
            c[v] += 1; sum += v;
            if (c[v] > maxCount) maxCount = c[v];
        }
    }
    if (ID_FACE[cat]) return c[ID_FACE[cat]] * ID_FACE[cat];
    if (cat === "threeKind") return maxCount >= 3 ? sum : 0;
    if (cat === "fourKind") return maxCount >= 4 ? sum : 0;
    if (cat === "fullHouse") {
        let three = false, two = false;
        for (let f = 1; f <= 6; f++) {
            if (c[f] === 3) three = true;
            else if (c[f] === 2) two = true;
        }
        return three && two ? 25 : 0;
    }
    if (cat === "smallStraight") {
        for (let s = 1; s <= 3; s++) {
            let ok = true;
            for (let k = 0; k < 4; k++) if (c[s + k] === 0) ok = false;
            if (ok) return 30;
        }
        return 0;
    }
    if (cat === "largeStraight") {
        let low = true, high = true;
        for (let k = 1; k <= 5; k++) {
            if (c[k] === 0) low = false;
            if (c[k + 1] === 0) high = false;
        }
        return low || high ? 40 : 0;
    }
    if (cat === "yahtzee") return maxCount >= 5 ? 50 : 0;
    if (cat === "chance") return sum;
    return 0;
}

const isYahtzee = (d) => d.length === 5 && d[0] >= 1 && d[0] <= 6 && d.every((v) => v === d[0]);
/* Joker aktif: Yahtzee lagi padahal kotak Yahtzee sudah terisi (50 atau 0). */
const jokerActive = (sc, d) => isYahtzee(d) && sc.yahtzee !== undefined;
const yahtzeeBonusFor = (sc, d) => (isYahtzee(d) && sc.yahtzee === 50 ? 100 : 0);

function legalCats(sc, d) {
    const open = CATS.map((c) => c.id).filter((id) => sc[id] === undefined);
    if (!jokerActive(sc, d)) return open;
    const up = FACE_ID[d[0]];
    if (open.includes(up)) return [up];               // wajib upper yang cocok
    const low = open.filter((id) => LOWER.includes(id));
    return low.length ? low : open;                   // lalu lower bebas, terakhir upper bebas (0)
}

function scoreFor(cat, d, sc) {
    if (jokerActive(sc, d)) {
        if (cat === "fullHouse") return 25;             // Joker: poin tetap penuh
        if (cat === "smallStraight") return 30;
        if (cat === "largeStraight") return 40;
    }
    return scoreCategory(cat, d);
}

function upperSum(sc) { let s = 0; for (const id of UPPER) s += sc[id] || 0; return s; }
const upperBonus = (sub) => (sub >= 63 ? 35 : 0);
function lowerSum(sc) { let s = 0; for (const id of LOWER) s += sc[id] || 0; return s; }
const grand = (sc, bonus) => upperSum(sc) + upperBonus(upperSum(sc)) + lowerSum(sc) + (bonus || 0);

function bestCategory(d, cats, sc) {
    let cat = null, pts = -1;
    for (const id of cats) {
        const p = scoreFor(id, d, sc);
        if (p > pts) { pts = p; cat = id; }
    }
    return { cat, pts: Math.max(0, pts) };
}
function worstCategory(d, cats, sc) {
    let cat = cats[0] || null, pts = Infinity;
    for (const id of cats) {
        const p = scoreFor(id, d, sc);
        if (p < pts) { pts = p; cat = id; }
    }
    return { cat, pts: pts === Infinity ? 0 : pts };
}

/* Rencana hold greedy saat mengejar satu kategori. */
function keepMask(d, cat) {
    const c = [0, 0, 0, 0, 0, 0, 0];
    for (const v of d) c[v] += 1;
    const keep = [false, false, false, false, false];
    if (ID_FACE[cat]) return d.map((v) => v === ID_FACE[cat]);
    if (cat === "smallStraight" || cat === "largeStraight") {
        let bs = 1, bl = 0;
        for (let s = 1; s <= 6; s++) {
            let len = 0;
            while (s + len <= 6 && c[s + len] > 0) len += 1;
            if (len > bl) { bl = len; bs = s; }
        }
        const used = [false, false, false, false, false, false, false];
        for (let i = 0; i < 5; i++) {
            const v = d[i];
            if (v >= bs && v < bs + bl && !used[v]) { keep[i] = true; used[v] = true; }
        }
        return keep;
    }
    if (cat === "chance") return d.map((v) => v >= 4);
    let modal = 1;
    for (let f = 2; f <= 6; f++) if (c[f] > c[modal]) modal = f;
    for (let i = 0; i < 5; i++) if (d[i] === modal) keep[i] = true;
    if (cat === "fullHouse") {
        let second = 0;
        for (let f = 1; f <= 6; f++) if (f !== modal && c[f] >= 2) second = f;
        if (second) for (let i = 0; i < 5; i++) if (d[i] === second) keep[i] = true;
    }
    return keep;
}

/* ---------------- generator level: target dari simulasi nyata => pasti bisa diselesaikan ---------------- */

function simTotal() {
    const sc = {};
    let bonus = 0;
    for (let r = 0; r < ROUNDS; r++) {
        let d = [rollDie(), rollDie(), rollDie(), rollDie(), rollDie()];
        let rolls = 1;
        while (rolls < 3) {
            const b = bestCategory(d, legalCats(sc, d), sc);
            if (b.pts >= 40) break;
            const keep = keepMask(d, b.cat);
            if (keep.every(Boolean)) break;
            d = d.map((v, i) => (keep[i] ? v : rollDie()));
            rolls += 1;
        }
        const b = bestCategory(d, legalCats(sc, d), sc);
        bonus += yahtzeeBonusFor(sc, d);
        sc[b.cat] = scoreFor(b.cat, d, sc);
    }
    return grand(sc, bonus);
}

const LEVEL_NAMES = ["Warm-up", "Lucky Lane", "Steady Hands", "Combo Hunt", "Straight Shot", "Full House Party", "Bonus Chase", "Six Fever", "High Roller", "Yahtzee Alley"];

function generateLevel(n) {
    const totals = [];
    for (let i = 0; i < 24; i++) totals.push(simTotal());
    totals.sort((a, b) => a - b);
    const q = Math.min(0.05 + n * 0.05, 0.85); // makin tinggi level, makin sulit (maks persentil 85)
    const base = totals[Math.round(q * (totals.length - 1))];
    const target = Math.max(110, Math.min(320, base + randInt(-6, 6)));
    return { n, target, name: LEVEL_NAMES[(n - 1) % LEVEL_NAMES.length] };
}

const BEST_KEY = "yahtzeeBest";
const LVL_KEY = "yahtzeeLevel";
function loadNum(k, d) {
    try { const v = +localStorage.getItem(k); return Number.isFinite(v) && v > 0 ? v : d; } catch (e) { return d; }
}
function saveNum(k, v) { try { localStorage.setItem(k, String(v)); } catch (e) { /* abaikan */ } }

/* ===================================================================== */
/* MOUNT                                                                  */
/* ===================================================================== */

export function mount(root, context = {}) {
    const { mode = "ai", room = null, playerName = "Player", onExit = () => { } } = context;
    const online = mode === "room" && Boolean(room);
    const participantIndex = online && !room.isHost ? 1 : 0;
    let roomData = room?.room || null;
    let state = null;

    /* lokal (tidak disinkronkan) */
    let destroyed = false, helpOpen = false, cheatOpen = false, paused = false;
    let cheatUsed = false, lastNewBest = false;
    const cheats = { loaded: 0, infinite: false, dumb: false };
    let aiTimer = null;
    const anim = { id: 0, active: false, flick: null, timer: null };
    let cursor = 0, kbMode = false, gotState = false;
    const offs = [];

    /* panduan internal: tampil sekali per browser */
    let seenHelp = true;
    try { seenHelp = localStorage.getItem("yahtzee-help-seen") === "1"; } catch (err) { seenHelp = true; }
    if (!seenHelp) {
        helpOpen = true;
        try { localStorage.setItem("yahtzee-help-seen", "1"); } catch (err) { /* storage blocked */ }
    }

    /* ---------------- shell (minimalis) ---------------- */
    root.innerHTML = `
<div class="game-app yz-app game-fill" data-yz>
<style>
.yz-app{--yz-bg:#f6f7f9;--yz-card:#fff;--yz-ink:#1f2937;--yz-mut:#6b7280;--yz-line:#e5e7eb;--yz-acc:#059669;--yz-acc-soft:#ecfdf5;--yz-warn:#b45309;--yz-warn-soft:#fffbeb;--yz-bad:#dc2626;color:var(--yz-ink);font-size:14px;line-height:1.45;min-width:0}
.yz-app [hidden]{display:none!important}
.yz-panel{position:relative;background:var(--yz-bg);border:1px solid var(--yz-line);border-radius:12px;padding:16px;min-height:440px;min-width:0;display:flex;flex-direction:column;gap:12px;overflow:hidden}
.yz-hud{display:flex;align-items:center;gap:8px;flex-wrap:wrap;min-width:0;font:600 11px/1 ui-monospace,SFMono-Regular,Menlo,monospace}
.yz-chip{display:inline-flex;align-items:center;gap:6px;background:var(--yz-card);border:1px solid var(--yz-line);border-radius:999px;padding:6px 12px;font-size:12px;color:var(--yz-mut)}
.yz-chip b{color:var(--yz-ink);font-variant-numeric:tabular-nums}
.yz-chip.badge{background:var(--yz-warn-soft);border-color:#fde68a;color:var(--yz-warn);font-weight:700;letter-spacing:.4px}
.yz-spacer{flex:1 1 auto}
.yz-btn{appearance:none;border:1px solid var(--yz-line);background:var(--yz-card);color:var(--yz-ink);border-radius:9px;padding:8px 14px;min-height:44px;font-size:13px;font-weight:600;cursor:pointer;transition:background .15s ease,border-color .15s ease,transform .1s ease}
.yz-btn:hover:not(:disabled){background:var(--yz-bg)}
.yz-btn:active:not(:disabled){transform:scale(.97)}
.yz-btn:disabled{opacity:.45;cursor:default}
.yz-btn.primary{background:var(--yz-acc);border-color:var(--yz-acc);color:#fff}
.yz-btn.primary:hover:not(:disabled){background:#047857}
.yz-btn.big{padding:12px 24px;font-size:14px;border-radius:10px;min-height:48px}
.yz-btn.on{background:var(--yz-acc-soft);border-color:var(--yz-acc);color:var(--yz-acc)}
.yz-icon-btn{display:inline-flex;align-items:center;gap:6px}
.yz-icon-btn svg{flex:none;display:block}
.yz-btn-label{white-space:nowrap}
.yz-hud .yz-btn{min-height:32px;padding:6px 10px;font-size:10px}
.yz-hud .yz-roll{background:var(--yz-acc);border-color:var(--yz-acc);color:#fff}
.yz-hud .yz-roll:hover:not(:disabled){background:#047857}
.yz-main{display:flex;gap:16px;flex-wrap:wrap;align-items:flex-start;min-width:0;flex:1 1 auto;min-height:0}
.yz-left{flex:1 1 260px;min-width:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;max-width:100%}
.yz-turnline{font-size:13px;font-weight:700;color:var(--yz-acc);min-height:18px;text-align:center}
.yz-dice{display:flex;gap:12px;justify-content:center;flex-wrap:wrap;min-height:64px;max-width:100%}
.yz-die{width:56px;height:56px;padding:0;border:none;background:none;cursor:pointer;transition:transform .15s ease}
.yz-die svg{display:block;width:100%;height:100%}
.yz-die .face{fill:var(--yz-card);stroke:var(--yz-line);stroke-width:2.5;transition:stroke .15s,fill .15s}
.yz-die .pip{fill:var(--yz-ink)}
.yz-die.held{transform:translateY(-5px)}
.yz-die.held .face{stroke:var(--yz-acc);fill:var(--yz-acc-soft)}
.yz-die.held .pip{fill:var(--yz-acc)}
.yz-die.locked{cursor:default}
.yz-die.rolling{animation:yzTumble .3s linear infinite}
@keyframes yzTumble{0%{transform:rotate(0) translateY(0)}25%{transform:rotate(-10deg) translateY(-6px)}50%{transform:rotate(8deg) translateY(-3px)}75%{transform:rotate(-5deg) translateY(-7px)}100%{transform:rotate(0) translateY(0)}}
.yz-msg{min-height:38px;max-width:320px;text-align:center;font-size:12.5px;color:var(--yz-mut);line-height:1.5}
.yz-touch{display:none;flex-direction:column;gap:8px;width:100%;max-width:360px}
.yz-touchrow{display:flex;gap:6px;justify-content:center;flex-wrap:wrap}
.yz-touch .yz-btn{flex:1;padding:11px 0;font-size:13px}
.yz-prog{width:100%;max-width:320px;display:flex;flex-direction:column;gap:8px}
.yz-prow{display:flex;align-items:center;gap:8px;font-size:11px;color:var(--yz-mut)}
.yz-prow span{width:74px;text-align:right;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex:none}
.yz-track{flex:1;min-width:40px;height:4px;background:var(--yz-line);border-radius:2px;overflow:hidden}
.yz-fill{height:100%;background:var(--yz-acc);border-radius:2px;transition:width .2s ease}
.yz-prow b{width:64px;flex:none;font-variant-numeric:tabular-nums;color:var(--yz-ink)}
.yz-cardwrap{flex:1 1 320px;min-width:0;max-width:440px;width:100%;max-height:100%;background:var(--yz-card);border:1px solid var(--yz-line);border-radius:12px;padding:12px;overflow:auto}
.yz-card{width:100%;min-width:300px;border-collapse:collapse;font-size:12.5px}
.yz-card th{font-size:10.5px;text-transform:uppercase;letter-spacing:.6px;color:var(--yz-mut);font-weight:700;padding:6px 8px;text-align:right;border-bottom:1px solid var(--yz-line);max-width:110px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.yz-card th:first-child{text-align:left}
.yz-card td{padding:6px 8px;text-align:right;border-bottom:1px solid var(--yz-line);font-variant-numeric:tabular-nums;color:var(--yz-ink)}
.yz-card td.lab{text-align:left;color:var(--yz-ink);font-weight:600;white-space:nowrap}
.yz-card td.c{min-width:52px;color:var(--yz-mut)}
.yz-card td.c.free{color:var(--yz-acc);cursor:pointer;font-weight:600}
.yz-card td.c.free:hover{background:var(--yz-acc-soft)}
.yz-card td.c.taken{color:var(--yz-ink);font-weight:700}
.yz-card td.c.blocked{color:var(--yz-mut);opacity:.6}
.yz-card td.c.cursor{outline:2px solid var(--yz-acc);outline-offset:-2px;border-radius:6px}
.yz-card tr.last td.c.taken{background:var(--yz-acc-soft)}
.yz-card tr.sub td{color:var(--yz-mut);border-bottom:none;background:var(--yz-bg);font-size:11.5px}
.yz-card tr.tot td{color:var(--yz-ink);font-weight:800;border-bottom:none;border-top:2px solid var(--yz-line);background:var(--yz-bg)}
.yz-card .hint{color:var(--yz-mut);font-weight:400;font-size:10px}
.yz-solo th:nth-child(3),.yz-solo td:nth-child(3){display:none}
.yz-joker{margin-top:8px;font-size:11.5px;background:var(--yz-warn-soft);border:1px solid #fde68a;color:var(--yz-warn);border-radius:8px;padding:8px 12px;line-height:1.45}
.yz-legend{margin-top:8px;font-size:10.5px;color:var(--yz-mut)}
.yz-ov{position:absolute;inset:0;z-index:6;display:flex;align-items:center;justify-content:center;background:rgba(246,247,249,.94);border-radius:12px;padding:16px}
.yz-ovcard{background:var(--yz-card);border:1px solid var(--yz-line);border-radius:12px;padding:20px;max-width:560px;width:100%;max-height:100%;overflow:hidden;display:flex;flex-direction:column;gap:12px;box-shadow:0 8px 24px rgba(0,0,0,.12)}
.yz-head{display:flex;align-items:center;justify-content:space-between;gap:10px;flex:none}
.yz-body{flex:1 1 auto;min-height:0;overflow:auto}
.yz-foot{display:flex;align-items:center;justify-content:space-between;gap:10px;flex:none;flex-wrap:wrap}
.yz-hint{font-size:10.5px;color:var(--yz-mut)}
.yz-ovcard h3{margin:0;font-size:19px}
.yz-ovcard h4{margin:6px 0 2px;font-size:12px;text-transform:uppercase;letter-spacing:.6px;color:var(--yz-mut)}
.yz-ovcard p{margin:0 0 8px;font-size:13px;color:var(--yz-ink);line-height:1.55}
.yz-ovbtns{display:flex;gap:8px;flex-wrap:wrap}
.yz-rules{width:100%;border-collapse:collapse;font-size:12px}
.yz-rules td{padding:6px;border-bottom:1px solid var(--yz-line);color:var(--yz-ink)}
.yz-rules td:first-child{font-weight:600;color:var(--yz-ink);white-space:nowrap}
.yz-rules td:last-child{text-align:right;font-weight:700;color:var(--yz-acc);white-space:nowrap}
.yz-cheatrow{display:flex;align-items:center;gap:8px;flex-wrap:wrap;font-size:13px}
.yz-cheatrow .lbl{min-width:112px;font-weight:600}
.yz-stepper{display:inline-flex;align-items:center;gap:4px}
.yz-stepper b{width:20px;text-align:center}
.yz-stepper .yz-btn{padding:6px 12px}
.yz-note{font-size:11.5px;color:var(--yz-warn);background:var(--yz-warn-soft);border:1px solid #fde68a;border-radius:8px;padding:8px 12px;line-height:1.45}
.yz-break{width:100%;border-collapse:collapse;font-size:12.5px}
.yz-break td{padding:6px;border-bottom:1px solid var(--yz-line);text-align:right;color:var(--yz-ink)}
.yz-break td:first-child{text-align:left}
.yz-break tr.t td{font-weight:800;color:var(--yz-ink)}
.yz-win{color:var(--yz-acc)}
.yz-lose{color:var(--yz-bad)}
.yz-app button:focus-visible,.yz-card td.c.free:focus-visible{outline:2px solid var(--yz-acc);outline-offset:2px}
@media (pointer:coarse),(max-width:760px){
.yz-touch{display:flex}
.yz-die{width:52px;height:52px}
.yz-cardwrap{max-width:100%}
}
@media (pointer:coarse){.yz-card td.c{min-height:44px}.yz-stepper .yz-btn{min-height:44px}}
@media (prefers-reduced-motion:reduce){.yz-die.rolling{animation:none}.yz-btn,.yz-die,.yz-fill,.yz-die .face{transition:none}.yz-die.held{transform:none}}

/* --- fill height + mobile refinements (last — beat pointer:coarse 44px) --- */
.yz-app.game-fill > .yz-panel[data-board]{flex:1 1 auto;min-height:0;aspect-ratio:auto}
.yz-app .yz-hud .yz-btn{min-height:32px;padding:5px 9px;font-size:9px}
@media (max-width:640px){
.yz-app.game-fill > .yz-panel[data-board]:not(:has(.yz-ov:not([hidden]))){aspect-ratio:auto;flex:1 1 auto;min-height:min(70dvh,620px)}
.yz-app.game-fill > .yz-panel[data-board]:has(.yz-ov:not([hidden])){aspect-ratio:auto;flex:1 1 auto;min-height:min(70dvh,620px)}
.yz-app .yz-hud{gap:5px;margin-bottom:0}
.yz-app .yz-hud .yz-chip{padding:4px 6px;font-size:9px}
.yz-app .yz-hud .yz-btn{min-height:32px;padding:5px 9px;font-size:9px}
.yz-app .yz-hud .yz-btn-label,.yz-app .yz-hud .yz-spacer{display:none}
.yz-app .yz-card{min-width:270px}
.yz-app .yz-card td.c{min-width:44px}
.yz-app .yz-ov{padding:8px}
.yz-app .yz-ovcard{width:100%;height:100%;max-height:100%;padding:12px;border-radius:12px}
.yz-app .yz-body{scrollbar-width:none}
.yz-app .yz-body::-webkit-scrollbar{display:none}
.yz-app .yz-foot{position:static;margin:0;padding-top:10px;border-top:1px solid var(--yz-line)}
.yz-app .yz-hint{display:none}
}
</style>
<div class="yz-hud">
  <span class="yz-chip">ROUND <b data-el="round">1</b>/13</span>
  <span class="yz-chip"><span data-el="youlab">You</span> <b data-el="you">0</b></span>
  <span class="yz-chip"><span data-el="rivallab">Rival</span> <b data-el="rival">0</b></span>
  <span class="yz-chip">ROLLS <b data-el="rolls">3</b></span>
  <span class="yz-chip"><span data-status>Ready</span></span>
  <span class="yz-chip badge" data-el="cheatbadge" hidden>CHEATS</span>
  <span class="yz-spacer"></span>
  <button class="yz-btn primary yz-icon-btn yz-roll" type="button" data-act="roll" data-el="rollbtn" aria-label="Roll dice" title="Roll dice (Space)" disabled>${iconSVG("rotateCcw", { size: 14 })}<span class="yz-btn-label">Roll</span></button>
  <button class="yz-btn yz-icon-btn" type="button" data-help aria-label="How to play" title="How to play (H)">${iconSVG("helpCircle", { size: 14 })}<span class="yz-btn-label">Help</span></button>
  <button class="yz-btn yz-icon-btn" type="button" data-cheats data-el="cheatbtn" aria-label="Cheats" title="Cheats (C)">${iconSVG("wrench", { size: 14 })}<span class="yz-btn-label">Cheats</span></button>
  <button class="yz-btn yz-icon-btn" type="button" data-pause data-el="pausebtn" aria-label="Pause" title="Pause (P)" disabled>${iconSVG("pause", { size: 14 })}<span class="yz-btn-label">Pause</span></button>
  <button class="yz-btn yz-icon-btn" type="button" data-restart data-el="restartbtn" aria-label="Restart" title="Restart (R)" disabled>${iconSVG("refresh", { size: 14 })}<span class="yz-btn-label">Restart</span></button>
  <button class="yz-btn yz-icon-btn" type="button" data-exit aria-label="Exit game" title="Exit game">${iconSVG("logOut", { size: 14 })}<span class="yz-btn-label">Exit game</span></button>
</div>
<section class="game-panel yz-panel" data-board>
  <div class="yz-main">
    <div class="yz-left">
      <div class="yz-turnline" data-el="turnline"></div>
      <div class="yz-dice" data-el="dice"></div>
      <div class="yz-msg" data-el="msg">Pick a mode to begin.</div>
      <div class="yz-touch">
        <div class="yz-touchrow" data-el="holdrow"></div>
        <div class="yz-touchrow">
          <button class="yz-btn" type="button" data-act="holdall" data-el="holdallbtn" disabled>Hold all</button>
          <button class="yz-btn" type="button" data-act="clear" data-el="clearbtn" disabled>Clear</button>
          <button class="yz-btn" type="button" data-act="best" data-el="bestbtn" disabled>Bank best</button>
        </div>
      </div>
      <div class="yz-prog">
        <div class="yz-prow" data-el="prow0"><span data-el="pname0">You</span><div class="yz-track"><div class="yz-fill" data-el="pfill0" style="width:0%"></div></div><b data-el="pval0">0/63</b></div>
        <div class="yz-prow" data-el="prow1"><span data-el="pname1">Rival</span><div class="yz-track"><div class="yz-fill" data-el="pfill1" style="width:0%"></div></div><b data-el="pval1">0/63</b></div>
      </div>
    </div>
    <div class="yz-cardwrap">
      <table class="yz-card" data-el="card"></table>
      <div class="yz-joker" data-el="joker" hidden></div>
      <div class="yz-legend">Green numbers = points you would bank right now. You must fill one box per turn &mdash; scoring 0 is allowed. Hover a category name for its rule.</div>
    </div>
  </div>

  <div class="yz-ov" data-ov="intro" hidden>
    <div class="yz-ovcard">
      <div class="yz-head"><h3>Yahtzee</h3></div>
      <div class="yz-body">
        <p>Classic dice scorecard duel. Fill all 13 categories; highest total wins. A coin toss decides who starts.</p>
        <p>Best total: <b data-el="introbest">&mdash;</b> &middot; Challenge level unlocked: <b data-el="introlvl">1</b></p>
      </div>
      <div class="yz-foot yz-ovbtns">
        <button class="yz-btn primary big" type="button" data-act="start-ai">Play vs Rival</button>
        <button class="yz-btn big" type="button" data-act="start-challenge" data-el="introchal">Challenge Lv.1</button>
        <button class="yz-btn big" type="button" data-act="help">How to play</button>
      </div>
    </div>
  </div>
  <div class="yz-ov" data-ov="wait" hidden>
    <div class="yz-ovcard"><div class="yz-head"><h3>Online room</h3></div><div class="yz-body"><p>Connecting&hellip; waiting for the host to publish the game state. Seats and the first turn are drawn randomly.</p></div></div>
  </div>
  <div class="yz-ov" data-ov="help" hidden>
    <div class="yz-ovcard">
      <div class="yz-head"><h3>How to play</h3><button class="yz-btn" type="button" data-help-close aria-label="Close help">Close</button></div>
      <div class="yz-body" data-el="helpbody"></div>
      <div class="yz-foot"><span class="yz-hint">Press H to reopen this guide</span><button class="yz-btn primary" type="button" data-help-close>Got it</button></div>
    </div>
  </div>
  <div class="yz-ov" data-ov="cheat" hidden>
    <div class="yz-ovcard">
      <div class="yz-head"><h3>Cheats</h3><button class="yz-btn" type="button" data-act="cheat" aria-label="Close cheats">Close</button></div>
      <div class="yz-body" data-el="cheatbody"></div>
      <div class="yz-foot"><span class="yz-hint">Offline only &mdash; cheats disable best scores &amp; progress</span></div>
    </div>
  </div>
  <div class="yz-ov" data-ov="pause" hidden>
    <div class="yz-ovcard">
      <div class="yz-head"><h3>Paused</h3></div>
      <div class="yz-body"><p>Dice, animations and the rival are frozen. Take your time.</p></div>
      <div class="yz-foot"><span class="yz-hint">Press P or Esc to resume</span><button class="yz-btn primary" type="button" data-act="pause">Resume</button></div>
    </div>
  </div>
  <div class="yz-ov" data-ov="over" hidden>
    <div class="yz-ovcard" data-el="overbody"></div>
  </div>
</section>
</div>`;

    /* ---------------- refs ---------------- */
    const $ = (sel) => root.querySelector(sel);
    const statusEl = $("[data-status]");
    const diceBox = $('[data-el="dice"]');
    const msgEl = $('[data-el="msg"]');
    const turnlineEl = $('[data-el="turnline"]');
    const rollBtn = $('[data-el="rollbtn"]');
    const cardEl = $('[data-el="card"]');
    const jokerEl = $('[data-el="joker"]');
    const cheatBtn = $('[data-el="cheatbtn"]');
    const cheatBadge = $('[data-el="cheatbadge"]');
    const restartBtn = $('[data-el="restartbtn"]');
    const pauseBtn = $('[data-el="pausebtn"]');
    const holdAllBtn = $('[data-el="holdallbtn"]');
    const clearBtn = $('[data-el="clearbtn"]');
    const bestBtn = $('[data-el="bestbtn"]');
    const ovIntro = $('[data-ov="intro"]');
    const ovWait = $('[data-ov="wait"]');
    const ovHelp = $('[data-ov="help"]');
    const ovCheat = $('[data-ov="cheat"]');
    const ovPause = $('[data-ov="pause"]');
    const ovOver = $('[data-ov="over"]');
    const overBody = $('[data-el="overbody"]');
    const cheatBody = $('[data-el="cheatbody"]');
    const hud = {
        round: $('[data-el="round"]'), you: $('[data-el="you"]'), rival: $('[data-el="rival"]'),
        rolls: $('[data-el="rolls"]'), youlab: $('[data-el="youlab"]'), rivallab: $('[data-el="rivallab"]'),
    };
    const prog = [0, 1].map((i) => ({
        row: $('[data-el="prow' + i + '"]'), name: $('[data-el="pname' + i + '"]'),
        fill: $('[data-el="pfill' + i + '"]'), val: $('[data-el="pval' + i + '"]'),
    }));
    const show = (el, on) => { if (on) el.removeAttribute("hidden"); else el.setAttribute("hidden", ""); };

    /* modal: help > cheats > pause. Semua membekukan timer AI & animasi dadu.
       Game ini tidak memakai Date.now()/performance.now(), jadi tidak ada
       penanda waktu yang perlu digeser saat resume — cukup jadwalkan ulang AI. */
    function freezeAsync() {
        if (aiTimer) { clearTimeout(aiTimer); aiTimer = null; }
        if (anim.flick || anim.timer) {
            clearInterval(anim.flick); clearTimeout(anim.timer);
            anim.flick = null; anim.timer = null; anim.active = false;
            for (const el of dieEls) el.classList.remove("rolling");
            if (state) for (let i = 0; i < 5; i++) setFace(dieEls[i], state.dice[i] || 0);
        }
    }
    function resumeAsync() {
        if (!paused && !helpOpen && !cheatOpen) scheduleAI();
    }
    function toggleHelp(on) {
        helpOpen = typeof on === "boolean" ? on : !helpOpen;
        if (helpOpen) { cheatOpen = false; freezeAsync(); } else resumeAsync();
        render();
    }
    function toggleCheats(on) {
        if (online) return;
        cheatOpen = typeof on === "boolean" ? on : !cheatOpen;
        if (cheatOpen) { helpOpen = false; freezeAsync(); } else resumeAsync();
        render();
    }
    function setPaused(on) {
        if (online) return;
        paused = typeof on === "boolean" ? on : !paused;
        if (paused) freezeAsync(); else resumeAsync();
        render();
    }

    /* dadu */
    const dieEls = [];
    for (let i = 0; i < 5; i++) {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "yz-die locked";
        b.setAttribute("aria-label", "Die " + (i + 1));
        b.innerHTML = '<svg viewBox="0 0 60 60" aria-hidden="true"><rect class="face" x="3" y="3" width="54" height="54" rx="12"></rect><g class="pips"></g></svg>';
        diceBox.appendChild(b);
        dieEls.push(b);
    }
    function setFace(el, v) {
        el.querySelector(".pips").innerHTML = (PIP[v] || [])
            .map((p) => '<circle class="pip" cx="' + p[0] + '" cy="' + p[1] + '" r="5"></circle>').join("");
    }

    /* tombol hold virtual (mobile) */
    const holdRow = $('[data-el="holdrow"]');
    const holdBtns = [];
    for (let i = 0; i < 5; i++) {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "yz-btn";
        b.dataset.act = "hold";
        b.dataset.i = String(i);
        b.textContent = String(i + 1);
        b.disabled = true;
        holdRow.appendChild(b);
        holdBtns.push(b);
    }

    /* scorecard */
    let cardHtml = '<thead><tr><th>Category</th><th data-el="th-you">You</th><th data-el="th-ai">Rival</th></tr></thead><tbody>';
    for (const c of CATS) {
        cardHtml += '<tr data-cat="' + c.id + '"><td class="lab" title="' + c.rule + ' (' + c.pts + ')">' + c.label + "</td>" +
            '<td class="c" data-cat="' + c.id + '" data-seat="0"></td><td class="c" data-cat="' + c.id + '" data-seat="1"></td></tr>';
    }
    cardHtml += '<tr class="sub" data-sub="upper"><td class="lab">Upper subtotal <span class="hint">/ 63</span></td><td class="c"></td><td class="c"></td></tr>' +
        '<tr class="sub" data-sub="bonus"><td class="lab">Upper bonus</td><td class="c"></td><td class="c"></td></tr>' +
        '<tr class="sub" data-sub="ybonus"><td class="lab">Yahtzee bonus <span class="hint">&times;100</span></td><td class="c"></td><td class="c"></td></tr>' +
        '<tr class="tot" data-sub="total"><td class="lab">Total</td><td class="c"></td><td class="c"></td></tr></tbody>';
    cardEl.innerHTML = cardHtml;
    const thYou = $('[data-el="th-you"]');
    const thAi = $('[data-el="th-ai"]');
    const rowEls = {}, cells = {}, subCells = {};
    for (const c of CATS) {
        const tr = cardEl.querySelector('tr[data-cat="' + c.id + '"]');
        rowEls[c.id] = tr;
        cells[c.id] = [tr.children[1], tr.children[2]];
    }
    for (const k of ["upper", "bonus", "ybonus", "total"]) {
        const tr = cardEl.querySelector('tr[data-sub="' + k + '"]');
        subCells[k] = [tr.children[1], tr.children[2]];
    }

    /* konten help (statis) */
    const rulesRows = CATS.map((c) => "<tr><td>" + c.label + "</td><td>" + c.rule + "</td><td>" + c.pts + "</td></tr>").join("");
    $('[data-el="helpbody"]').innerHTML =
        "<p>Each round both players take one turn. After 13 rounds all 13 boxes are filled and the highest total wins.</p>" +
        "<h4>Your turn</h4><p>1) Roll all five dice. 2) Tap dice to hold them (tap again to release) and roll the rest &mdash; up to 3 rolls. 3) Tap a highlighted box to bank its points. You may score after any roll, but you must fill exactly one box per turn, even if it scores 0.</p>" +
        "<h4>Scoring</h4><table class=\"yz-rules\">" + rulesRows + "</table>" +
        "<h4>Bonuses (real Yahtzee)</h4><p><b>Upper bonus:</b> 63+ points in Ones&ndash;Sixes earns <b>+35</b> (that is 3 of each face).<br><b>Yahtzee bonus:</b> roll another Yahtzee when your Yahtzee box already shows 50 and you get <b>+100</b>. The dice then act as a <b>Joker</b>: you must fill the matching upper box first; if it is taken, fill any open lower box (Full House still 25, Straights still 30/40); if all lower boxes are taken, put 0 in any open upper box. If your Yahtzee box shows 0 there is no +100, but Joker rules still apply.</p>" +
        "<h4>Modes</h4><p><b>Vs Rival:</b> a coin toss decides who starts. <b>Challenge:</b> a random target score is generated from real simulated games, so it is always beatable &mdash; reach it in 13 rounds to unlock the next level. <b>Online:</b> player seats and the first turn are drawn randomly each game.</p>" +
        "<h4>Controls</h4><p><b>Desktop:</b> Space roll &middot; 1&ndash;5 hold dice &middot; B bank best box &middot; &uarr;/&darr; choose a box &middot; Enter score it &middot; H help &middot; C cheats &middot; P pause &middot; R restart &middot; Esc close overlays. Mouse: click dice to hold, click a green number to score. Use the on-screen Hold all / Clear buttons for the rest.<br><b>Mobile:</b> tap dice, use the Roll button in the HUD and the on-screen hold/action buttons.</p>" +
        "<h4>Cheats</h4><p>Offline only. Loaded dice, unlimited rolls, dice editor, instant Yahtzee, weak rival. Using cheats disables best-score saving and level progress.</p>";

    /* ---------------- helper state ---------------- */
    function nameIn(s, seat) {
        const pi = s.seatOf.indexOf(seat);
        return s.pnames[pi] || "Player " + (seat + 1);
    }
    const nameOf = (seat) => (state ? nameIn(state, seat) : "Player " + (seat + 1));
    const mySeat = () => (online ? (state ? state.seatOf[participantIndex] : participantIndex) : 0);
    const isCheated = () => cheatUsed || cheats.loaded > 0 || cheats.infinite || cheats.dumb;
    function legalNow() {
        if (paused || helpOpen || cheatOpen) return [];
        if (!state || state.status !== "playing" || state.turn !== mySeat() || state.rolls < 1) return [];
        return legalCats(state.scores[mySeat()], state.dice);
    }
    function canRoll() {
        if (paused || helpOpen || cheatOpen) return false;
        if (!state || state.status !== "playing" || anim.active || state.turn !== mySeat()) return false;
        const unlimited = !online && cheats.infinite;
        if (state.rolls >= 3 && !unlimited) return false;
        return state.held.some((h) => !h);
    }

    function newGame(gmode, opts = {}) {
        const first = gmode === "challenge" ? 0 : randInt(0, 1);            // kocok giliran pertama
        const seatOf = gmode === "online" ? (Math.random() < 0.5 ? [0, 1] : [1, 0]) : [0, 1]; // acak kursi
        const pnames = gmode === "online"
            ? [cleanName(opts.hostName) || "Player 1", "Player 2"]
            : [cleanName(opts.playerName) || "You", gmode === "challenge" ? "Target" : "Rival"];
        const level = gmode === "challenge" ? (opts.level || generateLevel(loadNum(LVL_KEY, 1))) : null;
        const s = {
            v: 1, mode: gmode, status: "playing",
            round: 1, first, turn: first, seatOf, pnames,
            dice: [0, 0, 0, 0, 0], held: [false, false, false, false, false], rolls: 0,
            scores: [{}, {}], bonuses: [0, 0],
            rollId: 0, lastRoll: null, lastScore: null,
            level, result: null, msg: "",
        };
        s.msg = gmode === "challenge"
            ? "Level " + level.n + " \u201C" + level.name + "\u201D \u2014 score " + level.target + "+ in 13 rounds."
            : (gmode === "online" ? "Seats drawn. " : "") + "Coin toss \u2014 " + nameIn(s, first) + " goes first.";
        return s;
    }

    /* ---------------- animasi dadu (visual lokal) ---------------- */
    function stopAnim() {
        clearInterval(anim.flick); clearTimeout(anim.timer);
        anim.flick = null; anim.timer = null; anim.active = false;
        for (const el of dieEls) el.classList.remove("rolling");
    }
    function maybeAnimate() {
        if (paused || helpOpen || cheatOpen) return;
        const lr = state && state.lastRoll;
        if (!lr) { if (anim.active) stopAnim(); anim.id = 0; return; }
        if (lr.id === anim.id) return;
        anim.id = lr.id;
        stopAnim();
        const idx = (lr.idx || []).filter((i) => i >= 0 && i < 5);
        if (!idx.length) return;
        anim.active = true;
        for (const i of idx) dieEls[i].classList.add("rolling");
        anim.flick = setInterval(() => { for (const i of idx) setFace(dieEls[i], rollDie()); }, 90);
        anim.timer = setTimeout(() => { stopAnim(); render(); }, 560);
    }

    /* ---------------- render ---------------- */
    function render() {
        if (destroyed) return;
        const modal = helpOpen || cheatOpen || paused;
        show(ovIntro, !online && !state && !modal);
        show(ovWait, online && !state && !modal);
        show(ovOver, !!state && state.status === "over" && !modal);
        show(ovPause, paused && !helpOpen && !cheatOpen);
        show(ovCheat, cheatOpen && !online && !helpOpen);
        show(ovHelp, helpOpen);
        cheatBtn.hidden = online;
        pauseBtn.disabled = online || !state || state.status !== "playing";
        if (!state) { renderEmpty(); return; }

        maybeAnimate();
        const s = state;
        const my = mySeat();
        const solo = s.mode === "challenge";
        const myTurn = s.status === "playing" && s.turn === my;

        hud.round.textContent = String(Math.min(s.round, ROUNDS));
        hud.youlab.textContent = nameOf(0);
        hud.rivallab.textContent = solo ? "Target" : nameOf(1);
        hud.you.textContent = String(grand(s.scores[0], s.bonuses[0]));
        hud.rival.textContent = String(solo ? s.level.target : grand(s.scores[1], s.bonuses[1]));
        hud.rolls.textContent = !online && cheats.infinite && myTurn ? "\u221E" : String(Math.max(0, 3 - s.rolls));
        show(cheatBadge, !online && isCheated());

        for (let i = 0; i < 5; i++) {
            const el = dieEls[i];
            if (!anim.active) setFace(el, s.dice[i] || 0);
            el.classList.toggle("held", !!s.held[i] && s.rolls >= 1);
            el.classList.toggle("locked", !(myTurn && s.rolls >= 1));
            el.setAttribute("aria-pressed", s.held[i] ? "true" : "false");
        }

        msgEl.textContent = s.msg;
        turnlineEl.textContent = s.status !== "playing" ? "" :
            myTurn ? "Your turn \u2014 roll, hold, then pick a box" :
                s.mode === "ai" ? "Rival is playing\u2026" : nameOf(s.turn) + " is playing\u2026";
        statusEl.textContent = s.status === "over" ? "Finished" :
            anim.active ? "Rolling\u2026" :
                myTurn ? "Your turn" :
                    s.mode === "ai" ? "Rival thinking\u2026" : nameOf(s.turn) + "\u2019s turn";

        renderCard();

        for (let seat = 0; seat < 2; seat++) {
            const u = upperSum(s.scores[seat]);
            prog[seat].name.textContent = nameOf(seat);
            prog[seat].fill.style.width = Math.min(100, (u / 63) * 100) + "%";
            prog[seat].val.textContent = u >= 63 ? u + " \u2713+35" : u + "/63";
        }
        show(prog[1].row, !solo);

        const jActive = s.status === "playing" && jokerActive(s.scores[s.turn], s.dice);
        if (jActive) {
            const cats = legalCats(s.scores[s.turn], s.dice);
            const bonusTxt = yahtzeeBonusFor(s.scores[s.turn], s.dice) ? "+100 Yahtzee bonus! " : "Yahtzee again (box = 0, no +100). ";
            const forceTxt = cats.length === 1 ? "Joker rule: you must fill " + LABEL[cats[0]] + "." :
                cats.every((id) => LOWER.includes(id)) ? "Joker rule: pick any open lower box \u2014 Full House 25 / Straights 30 & 40 still count." :
                    "Joker rule: all lower boxes are taken \u2014 put 0 in any open upper box.";
            jokerEl.textContent = bonusTxt + forceTxt;
        }
        show(jokerEl, jActive);

        updateControls();
        if (cheatOpen && !online) renderCheat();
        if (s.status === "over") renderOver();
    }

    function renderEmpty() {
        stopAnim(); anim.id = 0;
        hud.round.textContent = "1"; hud.you.textContent = "0"; hud.rival.textContent = "0"; hud.rolls.textContent = "3";
        hud.youlab.textContent = "You"; hud.rivallab.textContent = "Rival";
        msgEl.textContent = "Pick a mode to begin.";
        turnlineEl.textContent = "";
        statusEl.textContent = "Ready";
        for (const el of dieEls) { setFace(el, 0); el.classList.remove("held"); el.classList.add("locked"); }
        cardEl.classList.remove("yz-solo");
        thYou.textContent = "You"; thAi.textContent = "Rival";
        for (const c of CATS) {
            rowEls[c.id].classList.remove("last");
            for (const td of cells[c.id]) { td.textContent = ""; td.className = "c"; td.title = ""; }
        }
        for (const k of ["upper", "bonus", "ybonus", "total"]) for (const td of subCells[k]) td.textContent = "\u2013";
        for (const p of prog) { p.fill.style.width = "0%"; p.val.textContent = "0/63"; }
        show(prog[1].row, true);
        show(jokerEl, false);
        show(cheatBadge, !online && isCheated());
        $('[data-el="introbest"]').textContent = loadNum(BEST_KEY, 0) ? String(loadNum(BEST_KEY, 0)) : "\u2014";
        const lvl = loadNum(LVL_KEY, 1);
        $('[data-el="introlvl"]').textContent = String(lvl);
        $('[data-el="introchal"]').textContent = "Challenge Lv." + lvl;
        updateControls();
        if (cheatOpen && !online) renderCheat();
    }

    function renderCard() {
        const s = state;
        const my = mySeat();
        const solo = s.mode === "challenge";
        const myTurn = s.status === "playing" && s.turn === my;
        const legal = myTurn && s.rolls >= 1 ? legalCats(s.scores[my], s.dice) : [];
        if (cursor >= legal.length) cursor = Math.max(0, legal.length - 1);
        cardEl.classList.toggle("yz-solo", solo);
        thYou.textContent = nameOf(0) + (0 === my ? " (you)" : "");
        thAi.textContent = solo ? "Target" : nameOf(1) + (1 === my ? " (you)" : "");
        for (const c of CATS) {
            rowEls[c.id].classList.toggle("last", !!(s.lastScore && s.lastScore.cat === c.id));
            for (let seat = 0; seat < 2; seat++) {
                const td = cells[c.id][seat];
                const v = s.scores[seat][c.id];
                if (v !== undefined) {
                    td.textContent = String(v); td.className = "c taken";
                    td.title = LABEL[c.id] + ": " + v + " points";
                } else if (seat === my && myTurn && s.rolls >= 1) {
                    if (legal.includes(c.id)) {
                        const p = scoreFor(c.id, s.dice, s.scores[my]);
                        td.textContent = String(p);
                        td.className = "c free" + (kbMode && legal[cursor] === c.id ? " cursor" : "");
                        td.title = "Bank " + p + " points in " + LABEL[c.id];
                    } else {
                        td.textContent = "\u00B7"; td.className = "c blocked";
                        td.title = "Blocked by the Joker rule this turn";
                    }
                } else { td.textContent = ""; td.className = "c"; td.title = ""; }
            }
        }
        for (let seat = 0; seat < 2; seat++) {
            const sc = s.scores[seat];
            const u = upperSum(sc);
            subCells.upper[seat].textContent = String(u);
            subCells.bonus[seat].textContent = u >= 63 ? "+35" : "\u2013";
            subCells.ybonus[seat].textContent = s.bonuses[seat] ? String(s.bonuses[seat]) : "\u2013";
            subCells.total[seat].textContent = String(grand(sc, s.bonuses[seat]));
        }
    }

    function updateControls() {
        const s = state;
        const myTurn = !!s && s.status === "playing" && s.turn === mySeat();
        const canHold = myTurn && s.rolls >= 1 && !anim.active;
        rollBtn.disabled = !canRoll();
        const rollText = !s || s.rolls === 0 ? "Roll" :
            !online && cheats.infinite && myTurn ? "Roll \u221E" :
                "Roll " + Math.min(s.rolls + 1, 3);
        const rollLabel = rollBtn.querySelector(".yz-btn-label");
        if (rollLabel) rollLabel.textContent = rollText;
        rollBtn.setAttribute("aria-label", rollText + " dice");
        holdBtns.forEach((b, i) => {
            b.disabled = !canHold;
            b.classList.toggle("on", !!(s && s.held[i] && s.rolls >= 1));
        });
        holdAllBtn.disabled = !canHold;
        clearBtn.disabled = !canHold;
        bestBtn.disabled = !(canHold && legalNow().length > 0);
        restartBtn.disabled = !s;
        const pauseLabel = pauseBtn.querySelector(".yz-btn-label");
        if (pauseLabel) pauseLabel.textContent = paused ? "Resume" : "Pause";
        pauseBtn.setAttribute("aria-label", paused ? "Resume" : "Pause");
        const cheatLabel = cheatBtn.querySelector(".yz-btn-label");
        const cheatActive = !online && isCheated();
        if (cheatLabel) cheatLabel.textContent = cheatActive ? "Cheats •" : "Cheats";
        cheatBtn.classList.toggle("on", cheatActive);
    }

    function renderCheat() {
        const s = state;
        const editable = !!s && s.status === "playing" && s.turn === 0 && !online;
        const faceBtns = [0, 1, 2, 3, 4, 5, 6].map((f) =>
            '<button class="yz-btn' + (cheats.loaded === f ? " on" : "") + '" type="button" data-cheat="face" data-face="' + f + '">' + (f === 0 ? "Off" : f) + "</button>").join("");
        const steppers = [0, 1, 2, 3, 4].map((i) => {
            const v = s ? s.dice[i] : 0;
            return '<span class="yz-stepper">D' + (i + 1) +
                ' <button class="yz-btn" type="button" data-cheat="die" data-dieidx="' + i + '" data-delta="-1"' + (editable ? "" : " disabled") + ">\u2212</button><b>" + (v || "\u2013") + "</b>" +
                '<button class="yz-btn" type="button" data-cheat="die" data-dieidx="' + i + '" data-delta="1"' + (editable ? "" : " disabled") + ">+</button></span>";
        }).join(" ");
        const showDumb = !s || s.mode === "ai";
        cheatBody.innerHTML =
            '<div class="yz-cheatrow"><span class="lbl">Loaded dice</span>' + faceBtns + "</div>" +
            '<p style="font-size:11.5px;color:#6b7280;margin:4px 0 10px">Every die you reroll lands on the chosen face.</p>' +
            '<div class="yz-cheatrow"><span class="lbl">Rolls</span><button class="yz-btn' + (cheats.infinite ? " on" : "") + '" type="button" data-cheat="infinite">Unlimited rolls: ' + (cheats.infinite ? "ON" : "OFF") + "</button></div>" +
            (showDumb ? '<div class="yz-cheatrow" style="margin-top:8px"><span class="lbl">Rival</span><button class="yz-btn' + (cheats.dumb ? " on" : "") + '" type="button" data-cheat="dumb">Rival plays badly: ' + (cheats.dumb ? "ON" : "OFF") + "</button></div>" : "") +
            '<div class="yz-cheatrow" style="margin-top:10px"><span class="lbl">Dice editor</span>' + steppers + "</div>" +
            '<div class="yz-cheatrow" style="margin-top:10px"><button class="yz-btn" type="button" data-cheat="yahtzee"' + (editable ? "" : " disabled") + '>Instant Yahtzee (all 6)</button><button class="yz-btn" type="button" data-cheat="off">All cheats off</button></div>' +
            '<div class="yz-note" style="margin-top:12px">Cheats are offline-only. While used, best scores and challenge level progress are not saved.</div>';
    }

    function renderOver() {
        const s = state, r = s.result;
        if (!r) return;
        const my = mySeat();
        const solo = s.mode === "challenge";
        let title, cls;
        if (solo) { title = r.success ? "Level complete!" : "Target missed"; cls = r.success ? "yz-win" : "yz-lose"; }
        else if (r.winner === -1) { title = "It\u2019s a tie!"; cls = ""; }
        else if (r.winner === my) { title = "You win!"; cls = "yz-win"; }
        else { title = (online ? esc(nameOf(r.winner)) : "Rival") + " wins!"; cls = "yz-lose"; }
        const sub = solo
            ? "You scored <b>" + r.a + "</b> of the " + s.level.target + " target (\u201C" + esc(s.level.name) + "\u201D, level " + s.level.n + ")."
            : esc(nameOf(0)) + " <b>" + r.a + "</b> \u2014 " + esc(nameOf(1)) + " <b>" + r.b + "</b> after 13 rounds.";
        let breakHtml = '<table class="yz-break"><tr><td></td><td>' + esc(nameOf(0)) + "</td>" + (solo ? "" : "<td>" + esc(nameOf(1)) + "</td>") + "</tr>";
        const rows = [
            ["Upper", (i) => upperSum(s.scores[i])],
            ["Upper bonus", (i) => upperBonus(upperSum(s.scores[i]))],
            ["Yahtzee bonus", (i) => s.bonuses[i]],
            ["Lower", (i) => lowerSum(s.scores[i])],
        ];
        for (const [lab, fn] of rows) {
            breakHtml += "<tr><td>" + lab + "</td><td>" + fn(0) + "</td>" + (solo ? "" : "<td>" + fn(1) + "</td>") + "</tr>";
        }
        breakHtml += '<tr class="t"><td>Total</td><td>' + r.a + "</td>" + (solo ? "" : "<td>" + r.b + "</td>") + "</tr></table>";
        const note = !online && isCheated() ? '<div class="yz-note">Cheats were used \u2014 best score &amp; level progress not saved.</div>' :
            lastNewBest ? "<p><b>New personal best!</b></p>" :
                solo && r.success ? "<p>Next level unlocked.</p>" : "";
        let btns;
        if (online) btns = '<button class="yz-btn primary big" type="button" data-act="restart">Rematch (re-draw seats)</button>';
        else if (solo && r.success) btns = '<button class="yz-btn primary big" type="button" data-act="next-level">Next level</button><button class="yz-btn big" type="button" data-act="restart">Replay level</button><button class="yz-btn big" type="button" data-act="menu">Menu</button>';
        else if (solo) btns = '<button class="yz-btn primary big" type="button" data-act="restart">Retry level</button><button class="yz-btn big" type="button" data-act="menu">Menu</button>';
        else btns = '<button class="yz-btn primary big" type="button" data-act="restart">Play again</button><button class="yz-btn big" type="button" data-act="menu">Menu</button>';
        overBody.innerHTML = '<div class="yz-body"><h3 class="' + cls + '">' + title + "</h3><p>" + sub + "</p>" + breakHtml + note + '</div><div class="yz-foot yz-ovbtns">' + btns + "</div>";
    }

    /* ---------------- alur giliran ---------------- */
    function advance(seat) {
        const s = state;
        const solo = s.mode === "challenge";
        const done = solo ? s.round >= ROUNDS : seat !== s.first && s.round >= ROUNDS;
        if (done) { finishGame(); return; }
        if (solo || seat !== s.first) s.round += 1;
        s.turn = solo ? 0 : seat === s.first ? 1 - seat : s.first;
        s.dice = [0, 0, 0, 0, 0];
        s.held = [false, false, false, false, false];
        s.rolls = 0;
        s.msg += " " + nameOf(s.turn) + " to play.";
    }

    function finishGame() {
        const s = state;
        paused = false;
        s.status = "over";
        const a = grand(s.scores[0], s.bonuses[0]);
        const b = grand(s.scores[1], s.bonuses[1]);
        const winner = a > b ? 0 : b > a ? 1 : -1;
        const success = s.mode === "challenge" ? a >= s.level.target : null;
        s.result = { a, b, winner, success };
        s.msg = s.mode === "challenge"
            ? (success ? "Target reached \u2014 level complete!" : "You scored " + a + " of " + s.level.target + ".")
            : winner === -1 ? "It\u2019s a tie!" : nameOf(winner) + " wins!";
        if (!online) {
            lastNewBest = false;
            if (!isCheated()) {
                if (a > loadNum(BEST_KEY, 0)) { saveNum(BEST_KEY, a); lastNewBest = true; }
                if (success) saveNum(LVL_KEY, Math.max(loadNum(LVL_KEY, 1), s.level.n + 1));
            }
        }
    }

    /* ---------------- aksi kanonik (divalidasi, lalu publish) ---------------- */
    function applyAction(action, actor) {
        if (destroyed || !action || typeof action.type !== "string") return;

        if (action.type === "join") {
            if (online && actor === 1 && state) {
                state.pnames[1] = cleanName(action.name) || "Guest";
                publish();
            }
            return;
        }

        if (action.type === "restart") {
            if (online) {
                const keepNames = state ? state.pnames.slice() : null;
                state = newGame("online", { hostName: playerName });
                if (keepNames) state.pnames = keepNames; // nama ikut peserta, kursi dikocok ulang
            } else {
                const gmode = action.mode || (state && state.mode) || "ai";
                const level = gmode === "challenge" ? (action.level || generateLevel(loadNum(LVL_KEY, 1))) : null;
                state = newGame(gmode, { level, playerName });
                cheatUsed = false;
            }
            lastNewBest = false; cursor = 0; kbMode = false; paused = false;
            stopAnim(); anim.id = 0;
            publish();
            return;
        }

        if (!state || state.status !== "playing") return;
        const seat = online ? state.seatOf[actor] : actor;
        if (seat !== state.turn) return;
        const s = state;

        if (action.type === "roll") {
            const unlimited = !online && actor === 0 && cheats.infinite;
            if (s.rolls >= 3 && !unlimited) return;
            const idx = [];
            for (let i = 0; i < 5; i++) if (!s.held[i]) idx.push(i);
            if (!idx.length) return;
            const loaded = !online && actor === 0 && cheats.loaded > 0 ? cheats.loaded : 0;
            for (const i of idx) s.dice[i] = loaded || rollDie();
            s.rolls += 1;
            s.rollId += 1;
            s.lastRoll = { id: s.rollId, idx };
            s.msg = actor === 1 && !online ? "Rival rolls the dice." :
                s.rolls >= 3 && !unlimited ? "No rolls left \u2014 pick a category to score." :
                    "Roll " + s.rolls + (unlimited ? " (unlimited)" : " of 3") + " \u2014 hold dice, roll again, or score.";
            publish();
            return;
        }

        if (action.type === "hold") {
            const i = action.i;
            if (s.rolls < 1 || !(i >= 0 && i < 5)) return;
            s.held[i] = !s.held[i];
            publish();
            return;
        }

        if (action.type === "holdSet") {
            if (s.rolls < 1 || !Array.isArray(action.mask) || action.mask.length !== 5) return;
            s.held = action.mask.map(Boolean);
            publish();
            return;
        }

        /* giliran AI lanjutan: set hold lalu langsung lempar sisanya */
        if (action.type === "aiTurn") {
            if (online || seat !== 1 || s.rolls < 1 || s.rolls >= 3) return;
            if (!Array.isArray(action.mask) || action.mask.length !== 5) return;
            s.held = action.mask.map(Boolean);
            const idx = [];
            for (let i = 0; i < 5; i++) if (!s.held[i]) idx.push(i);
            if (!idx.length) return;
            for (const i of idx) s.dice[i] = rollDie();
            s.rolls += 1;
            s.rollId += 1;
            s.lastRoll = { id: s.rollId, idx };
            const n = s.held.filter(Boolean).length;
            s.msg = "Rival holds " + n + (n === 1 ? " die" : " dice") + ", chasing " + (LABEL[action.chase] || "a combo") + "\u2026";
            publish();
            return;
        }

        if (action.type === "score") {
            if (s.rolls < 1) return;
            const sc = s.scores[seat];
            const cats = legalCats(sc, s.dice);
            if (!cats.includes(action.cat)) return;
            const pts = scoreFor(action.cat, s.dice, sc);
            const bonus = yahtzeeBonusFor(sc, s.dice);
            sc[action.cat] = pts;
            s.bonuses[seat] += bonus;
            s.lastScore = { seat, cat: action.cat, pts, bonus };
            s.msg = nameOf(seat) + " scored " + pts + " in " + LABEL[action.cat] + (bonus ? " (+100 Yahtzee bonus!)" : "") + ".";
            advance(seat);
            publish();
            return;
        }

        /* cheat lokal (offline, hanya giliran pemain manusia) */
        if (action.type === "cheatDice") {
            if (online || actor !== 0 || seat !== 0) return;
            const i = action.die, v = action.value;
            if (!(i >= 0 && i < 5) || !(v >= 1 && v <= 6)) return;
            s.dice[i] = v;
            s.rolls = Math.max(1, s.rolls);
            publish();
            return;
        }
        if (action.type === "cheatYahtzee") {
            if (online || actor !== 0 || seat !== 0) return;
            s.dice = [6, 6, 6, 6, 6];
            s.rolls = Math.max(1, s.rolls);
            publish();
            return;
        }
    }

    function submitAction(action) {
        if (online && !room.isHost) { room.sendAction(action).catch(console.warn); return; }
        applyAction(action, participantIndex);
    }

    function publish() {
        render();
        if (online && room.isHost) room.publishState(state).catch(console.warn);
        scheduleAI();
    }

    /* ---------------- AI (hanya mode lokal vs Rival) ---------------- */
    function scheduleAI() {
        if (aiTimer) { clearTimeout(aiTimer); aiTimer = null; }
        if (paused || helpOpen || cheatOpen) return;
        if (online || !state || state.mode !== "ai" || state.status !== "playing" || state.turn !== 1) return;
        aiTimer = setTimeout(() => { aiTimer = null; aiStep(); }, state.rolls === 0 ? 900 : 1050);
    }
    function aiStep() {
        if (paused || helpOpen || cheatOpen) return;
        if (!state || state.status !== "playing" || state.turn !== 1 || state.mode !== "ai") return;
        const sc = state.scores[1];
        if (state.rolls === 0) { applyAction({ type: "roll" }, 1); return; }
        const cats = legalCats(sc, state.dice);
        if (!cats.length) return;
        if (cheats.dumb) {
            if (state.rolls < 3) { applyAction({ type: "roll" }, 1); return; }
            applyAction({ type: "score", cat: worstCategory(state.dice, cats, sc).cat }, 1);
            return;
        }
        const b = bestCategory(state.dice, cats, sc);
        if (state.rolls >= 3 || b.pts >= 40) { applyAction({ type: "score", cat: b.cat }, 1); return; }
        const mask = keepMask(state.dice, b.cat);
        if (mask.every(Boolean)) { applyAction({ type: "score", cat: b.cat }, 1); return; }
        applyAction({ type: "aiTurn", mask, chase: b.cat }, 1);
    }

    /* ---------------- input pemain ---------------- */
    function doRoll() { if (canRoll()) submitAction({ type: "roll" }); }
    function toggleHold(i) {
        if (paused || helpOpen || cheatOpen) return;
        if (!state || state.status !== "playing" || anim.active) return;
        if (state.turn !== mySeat() || state.rolls < 1) return;
        submitAction({ type: "hold", i });
    }
    function setHolds(all) {
        if (paused || helpOpen || cheatOpen) return;
        if (!state || state.status !== "playing" || anim.active) return;
        if (state.turn !== mySeat() || state.rolls < 1) return;
        submitAction({ type: "holdSet", mask: [all, all, all, all, all] });
    }
    function tryScore(cat) {
        if (anim.active || !legalNow().includes(cat)) return;
        submitAction({ type: "score", cat });
    }
    function scoreBest() {
        const legal = legalNow();
        if (anim.active || !legal.length) return;
        submitAction({ type: "score", cat: bestCategory(state.dice, legal, state.scores[mySeat()]).cat });
    }

    function handleCheat(el) {
        if (online) return;
        const k = el.dataset.cheat;
        if (k === "infinite") { cheats.infinite = !cheats.infinite; if (cheats.infinite) cheatUsed = true; }
        else if (k === "dumb") { cheats.dumb = !cheats.dumb; if (cheats.dumb) cheatUsed = true; }
        else if (k === "face") { cheats.loaded = +el.dataset.face || 0; if (cheats.loaded) cheatUsed = true; }
        else if (k === "off") { cheats.loaded = 0; cheats.infinite = false; cheats.dumb = false; }
        else if (k === "die") {
            if (state && state.status === "playing" && state.turn === 0) {
                cheatUsed = true;
                const i = +el.dataset.dieidx;
                const v = Math.min(6, Math.max(1, (state.dice[i] || 1) + +el.dataset.delta));
                submitAction({ type: "cheatDice", die: i, value: v });
                return;
            }
        } else if (k === "yahtzee") {
            if (state && state.status === "playing" && state.turn === 0) {
                cheatUsed = true;
                submitAction({ type: "cheatYahtzee" });
                return;
            }
        }
        render();
    }

    function act(a, btn) {
        if (a === "roll") doRoll();
        else if (a === "hold") toggleHold(+btn.dataset.i);
        else if (a === "holdall") setHolds(true);
        else if (a === "clear") setHolds(false);
        else if (a === "best") scoreBest();
        else if (a === "help") toggleHelp();
        else if (a === "cheat") toggleCheats();
        else if (a === "pause") setPaused();
        else if (a === "start-ai") submitAction({ type: "restart", mode: "ai" });
        else if (a === "start-challenge") submitAction({ type: "restart", mode: "challenge" });
        else if (a === "next-level") {
            if (state && state.level) submitAction({ type: "restart", mode: "challenge", level: generateLevel(state.level.n + 1) });
        }
        else if (a === "restart") {
            if (online) submitAction({ type: "restart" });
            else if (state) submitAction({ type: "restart", mode: state.mode, level: state.level });
        }
        else if (a === "menu") {
            if (online) return;
            state = null; helpOpen = false; cheatOpen = false; paused = false;
            if (aiTimer) { clearTimeout(aiTimer); aiTimer = null; }
            stopAnim(); anim.id = 0;
            render();
        }
    }

    function handleClick(event) {
        const t = event.target;
        if (t.closest("[data-help]")) { toggleHelp(); return; }
        if (t.closest("[data-help-close]")) { toggleHelp(false); return; }
        if (t.closest("[data-exit]")) { onExit(); return; }
        if (t.closest("[data-cheats]")) { toggleCheats(); return; }
        if (t.closest("[data-pause]")) { setPaused(); return; }
        if (t.closest("[data-restart]")) { act("restart"); return; }
        const ch = t.closest("[data-cheat]");
        if (ch) { if (!ch.disabled) handleCheat(ch); return; }
        const die = t.closest(".yz-die");
        if (die) { toggleHold(dieEls.indexOf(die)); die.blur(); return; }
        const cell = t.closest("td[data-cat]");
        if (cell) {
            if (+cell.dataset.seat === mySeat()) { kbMode = false; tryScore(cell.dataset.cat); }
            return;
        }
        const btn = t.closest("button[data-act]");
        if (btn) { if (!btn.disabled) act(btn.dataset.act, btn); btn.blur(); }
    }

    function onKey(e) {
        if (destroyed || e.ctrlKey || e.metaKey || e.altKey) return;
        const tag = e.target && e.target.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA") return;
        const c = e.code;
        /* prioritas: help → cheats → pause/Escape → restart → aksi game */
        if (c === "KeyH" || c === "KeyT" || e.key === "?") { e.preventDefault(); toggleHelp(); return; }
        if (c === "KeyC" || c === "KeyX") { e.preventDefault(); if (!helpOpen) toggleCheats(); return; }
        if (c === "KeyP" || e.key === "Escape") {
            e.preventDefault();
            if (helpOpen) toggleHelp(false);
            else if (cheatOpen) toggleCheats(false);
            else if (!online) {
                if (paused) setPaused(false);
                else if (state && state.status === "playing") setPaused(true);
            }
            return;
        }
        if (c === "KeyR") {
            e.preventDefault();
            if (helpOpen) toggleHelp(false);
            else if (cheatOpen) toggleCheats(false);
            else if (state) act("restart");
            return;
        }
        if (helpOpen || cheatOpen || paused) return;
        if (e.repeat && c !== "ArrowUp" && c !== "ArrowDown") return;
        if (!state || state.status !== "playing") return;
        const ae = document.activeElement;
        if ((c === "Space" || e.key === "Enter") && ae && ae.tagName === "BUTTON" && root.contains(ae)) return; // biarkan native
        if (c === "Space") { e.preventDefault(); doRoll(); return; }
        if (e.key >= "1" && e.key <= "5") { toggleHold(+e.key - 1); return; }
        if (c === "KeyB") { scoreBest(); return; }
        if (c === "ArrowDown" || c === "ArrowUp") {
            const legal = legalNow();
            if (!legal.length) return;
            e.preventDefault();
            kbMode = true;
            cursor = (cursor + (c === "ArrowDown" ? 1 : -1) + legal.length) % legal.length;
            render();
            return;
        }
        if (e.key === "Enter") {
            const legal = legalNow();
            if (kbMode && legal.length) { e.preventDefault(); tryScore(legal[Math.min(cursor, legal.length - 1)]); }
        }
    }

    root.addEventListener("click", handleClick);
    document.addEventListener("keydown", onKey);

    /* ---------------- init: online (host/guest) atau lokal ---------------- */
    function sub(fn) { const off = fn(); if (typeof off === "function") offs.push(off); }

    if (online) {
        sub(() => room.onRoom((nextRoom) => { roomData = nextRoom; render(); }));
        sub(() => room.onState((nextState) => {
            if (room.isHost || !nextState || destroyed) return; // host = sumber kebenaran
            const firstState = !gotState;
            gotState = true;
            state = nextState;
            if (firstState) submitAction({ type: "join", name: playerName });
            render();
        }));
        if (room.isHost) {
            sub(() => room.onAction((action) => applyAction(action, 1)));
            state = newGame("online", { hostName: playerName });
            publish();
        } else {
            submitAction({ type: "join", name: playerName });
            render(); // overlay "waiting for host" sampai state pertama tiba
        }
    } else {
        state = null; // tampilkan menu intro (Vs Rival / Challenge)
        render();
    }

    return {
        destroy() {
            destroyed = true;
            root.removeEventListener("click", handleClick);
            document.removeEventListener("keydown", onKey);
            if (aiTimer) { clearTimeout(aiTimer); aiTimer = null; }
            stopAnim();
            for (const off of offs) { try { off(); } catch (e) { /* abaikan */ } }
            root.innerHTML = "";
        },
    };
}