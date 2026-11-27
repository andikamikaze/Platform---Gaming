/*
  Uno — mengikuti template game module.
  - id META harus sama dengan nama file tanpa .js  → uno.js
  - Setelah edit: node tools/build-games-manifest.mjs
*/

import { iconSVG } from "../JS/icons.js";

export const META = {
    id: "uno",
    name: "Uno",
    category: "cards",
    catLabel: "Cards",
    desc: "Match colors and numbers, play action cards, and empty your hand first. Solvable random levels, cheats, and 2-player rooms.",
    art: '<svg viewBox="0 0 48 48" width="54" height="54" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="7" y="5" width="25" height="35" rx="4" fill="#3b82f6"/><rect x="17" y="8" width="25" height="35" rx="4" fill="#ef4444"/><ellipse cx="29.5" cy="25.5" rx="8" ry="11.5" fill="#fff" stroke-width="2.5"/></svg>',
    bg: ["#fee2e2", "#ef4444"],
    bestKey: "unoBestLevel",
};

/* ================= pure rules (tanpa DOM, deterministik) ================= */

const COLORS = ["red", "yellow", "green", "blue"];
const CARD_HEX = { red: "#ef4444", yellow: "#f59e0b", green: "#22c55e", blue: "#3b82f6", wild: "#1e293b" };

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const esc = (s) => String(s).replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));

/* RNG ber-seed: level yang sama = deal yang sama (retry adil & solvable) */
function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
        a |= 0; a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/* Deck standar 108 kartu */
function makeDeck() {
    const d = [];
    for (const c of COLORS) {
        d.push({ color: c, kind: "num", rank: 0 });
        for (let r = 1; r <= 9; r++) d.push({ color: c, kind: "num", rank: r }, { color: c, kind: "num", rank: r });
        for (const k of ["skip", "rev", "draw2"]) d.push({ color: c, kind: k }, { color: c, kind: k });
    }
    for (let i = 0; i < 4; i++) d.push({ color: "wild", kind: "wild" }, { color: "wild", kind: "wild4" });
    return d;
}

function shuffle(arr, rnd = Math.random) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
        const j = (rnd() * (i + 1)) | 0;
        const t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
}

const isWildK = (c) => c.kind === "wild" || c.kind === "wild4";

function canPlay(card, top, color) {
    if (!card || !top) return false;
    if (isWildK(card)) return true;
    if (card.color === color) return true;
    if (card.kind === "num" && top.kind === "num" && card.rank === top.rank) return true;
    if (card.kind !== "num" && card.kind === top.kind) return true;
    return false;
}

/* AI: skill 0 = casual (kadang acak), 1 = smart, 2 = sharp (hitung warna dominan) */
function aiPick(hand, top, color, oppMin, skill = 1, rnd = Math.random) {
    const playable = [];
    for (let i = 0; i < hand.length; i++) if (canPlay(hand[i], top, color)) playable.push(i);
    if (!playable.length) return -1;
    if (skill <= 0 && rnd() < 0.5) return playable[(rnd() * playable.length) | 0];
    const threat = (oppMin == null ? 99 : oppMin) <= 2;
    const cnt = { red: 0, yellow: 0, green: 0, blue: 0 };
    if (skill >= 2) for (const c of hand) if (cnt[c.color] != null) cnt[c.color]++;
    let best = -1, bestScore = -Infinity;
    for (const i of playable) {
        const c = hand[i];
        let s;
        if (threat) {
            if (c.kind === "draw2") s = 40;
            else if (c.kind === "wild4") s = 39;
            else if (c.kind === "skip") s = 38;
            else if (c.kind === "rev") s = 24;
            else if (c.kind === "num") s = 10 + c.rank * 0.5;
            else s = 5;
        } else if (c.kind === "num") s = c.color === color ? 20 + c.rank : 8 + c.rank * 0.5;
        else if (c.kind === "draw2") s = c.color === color ? 16 : 7;
        else if (c.kind === "skip") s = c.color === color ? 15 : 6.5;
        else if (c.kind === "rev") s = c.color === color ? 14 : 6;
        else s = c.kind === "wild" ? 2 : 1;
        if (skill >= 2) {
            if (c.color !== "wild") s += cnt[c.color] * 0.8;
            if (isWildK(c) && hand.length <= 3) s += 6;
        }
        if (s > bestScore) { bestScore = s; best = i; }
    }
    return best;
}

function aiColorChoice(hand) {
    const n = { red: 0, yellow: 0, green: 0, blue: 0 };
    for (const c of hand) if (n[c.color] != null) n[c.color]++;
    let best = "red", bn = -1;
    for (const c of COLORS) if (n[c] > bn) { bn = n[c]; best = c; }
    return best;
}

/* Generator level: deal diacak lalu DIVALIDASI supaya selalu bisa dimainkan:
   - tangan pemain 0 punya >= 2 kartu playable di kartu pembuka
   - pemain 0 punya >= 2 warna berbeda (tidak mentok sejak awal)
   - tiap lawan punya >= 1 opsi playable
   Fallback: ambil deal terbaik dari 80 percobaan (dijamin berhenti). */
function generateDeal(seed, nPlayers) {
    const rnd = mulberry32(seed);
    let best = null, bestScore = -1;
    for (let attempt = 0; attempt < 80; attempt++) {
        const deck = shuffle(makeDeck(), rnd);
        const hands = [];
        for (let i = 0; i < nPlayers; i++) hands.push(deck.splice(0, 7));
        const fi = deck.findIndex((c) => c.kind === "num");
        const first = deck.splice(fi, 1)[0];
        const counts = hands.map((h) => h.filter((c) => canPlay(c, first, first.color)).length);
        const myColors = new Set(hands[0].filter((c) => c.color !== "wild").map((c) => c.color));
        const cand = { deck, hands, first };
        if (counts[0] >= 2 && counts.slice(1).every((n) => n >= 1) && myColors.size >= 2) { best = cand; break; }
        const score = Math.min(...counts) * 10 + counts[0];
        if (score > bestScore) { bestScore = score; best = cand; }
    }
    best.starter = Math.floor(rnd() * nPlayers); /* random siapa jalan duluan */
    return best;
}

function cardLabel(c) {
    if (c.kind === "num") return cap(c.color) + " " + c.rank;
    if (c.kind === "skip") return cap(c.color) + " Skip";
    if (c.kind === "rev") return cap(c.color) + " Reverse";
    if (c.kind === "draw2") return cap(c.color) + " Draw Two";
    if (c.kind === "wild") return "Wild";
    return "Wild Draw Four";
}

const skillFor = (level) => (level <= 2 ? 0 : level <= 5 ? 1 : 2);
const SKILL_LABEL = ["Casual", "Smart", "Sharp"];
const newSeed = () => (Math.random() * 0x7fffffff) | 0;

/* ================= painter kartu (SVG flat minimalis) ================= */

function quadrants(cx, cy, r) {
    const hex = [CARD_HEX.red, CARD_HEX.yellow, CARD_HEX.green, CARD_HEX.blue];
    const d = [
        `M${cx} ${cy - r} A${r} ${r} 0 0 1 ${cx + r} ${cy} L${cx} ${cy} Z`,
        `M${cx + r} ${cy} A${r} ${r} 0 0 1 ${cx} ${cy + r} L${cx} ${cy} Z`,
        `M${cx} ${cy + r} A${r} ${r} 0 0 1 ${cx - r} ${cy} L${cx} ${cy} Z`,
        `M${cx - r} ${cy} A${r} ${r} 0 0 1 ${cx} ${cy - r} L${cx} ${cy} Z`,
    ];
    return d.map((p, i) => `<path d="${p}" fill="${hex[i]}"/>`).join("");
}

function centerGlyph(card) {
    const t = (txt, y, size) =>
        `<text x="36" y="${y}" font-size="${size}" font-weight="800" fill="#fff" text-anchor="middle" font-family="inherit">${txt}</text>`;
    if (card.kind === "num") return t(String(card.rank), 66, 38);
    if (card.kind === "skip")
        return `<circle cx="36" cy="54" r="15" fill="none" stroke="#fff" stroke-width="5"/><line x1="25.5" y1="43.5" x2="46.5" y2="64.5" stroke="#fff" stroke-width="5" stroke-linecap="round"/>`;
    if (card.kind === "rev")
        return `<path d="M25 46 A11 11 0 0 1 47 46" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round"/><polygon points="47,56 42.5,46 51.5,46" fill="#fff"/><path d="M47 62 A11 11 0 0 1 25 62" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round"/><polygon points="25,52 20.5,62 29.5,62" fill="#fff"/>`;
    if (card.kind === "draw2")
        return t("+2", 46, 24) + `<rect x="26" y="56" width="12" height="18" rx="2.5" fill="#fff" opacity=".75"/><rect x="34" y="52" width="12" height="18" rx="2.5" fill="#fff"/>`;
    if (card.kind === "wild") return quadrants(36, 54, 16);
    return t("+4", 44, 22) + quadrants(36, 70, 9);
}

function cornerLabel(card) {
    if (card.kind === "num") return String(card.rank);
    if (card.kind === "skip") return "S";
    if (card.kind === "rev") return "R";
    if (card.kind === "draw2") return "+2";
    if (card.kind === "wild") return "W";
    return "+4";
}

function cardSvg(card) {
    const hex = CARD_HEX[card.color] || CARD_HEX.wild;
    const cl = cornerLabel(card);
    const corner = (x, y) =>
        `<text x="${x}" y="${y}" font-size="11" font-weight="700" fill="#fff" text-anchor="middle" font-family="inherit">${cl}</text>`;
    return `<svg viewBox="0 0 72 108" aria-hidden="true"><rect x="1.5" y="1.5" width="69" height="105" rx="10" fill="${hex}" stroke="#00000014"/>${centerGlyph(card)}${corner(11, 16)}${corner(61, 102)}</svg>`;
}

function backSvg() {
    return `<svg viewBox="0 0 72 108" aria-hidden="true"><rect x="1.5" y="1.5" width="69" height="105" rx="10" fill="#1e293b"/><rect x="7" y="7" width="58" height="94" rx="7" fill="none" stroke="#ffffff26" stroke-width="2"/><text x="36" y="60" font-size="16" font-weight="900" font-style="italic" fill="#fff" text-anchor="middle" font-family="inherit" transform="rotate(-20 36 54)">UNO</text></svg>`;
}

/* ================================ mount ================================ */

export function mount(root, context = {}) {
    const { mode = "ai", room = null, playerName = "Player", onExit = () => { } } = context;
    const online = mode === "room" && Boolean(room);
    const playerIndex = online && !room.isHost ? 1 : 0;
    let roomData = room?.room || null;
    let state = null;

    /* UI lokal (tidak ikut dipublish) */
    let sel = 0, picker = null, scrollSelFlag = false, lastTopSig = "";
    let botTimer = null, botDueAt = 0, botRemain = null, destroyed = false, notedRound = 0;
    let helpOpen = false, cheatsOpen = false, paused = false;
    let pauseStart = 0, pauseOffset = 0;
    const toastTimers = new Set();
    const offs = [];
    let best = 0;
    try { best = parseInt(localStorage.getItem(META.bestKey) || "0", 10) || 0; } catch (_) { }
    let seenHelp = true;
    try { seenHelp = localStorage.getItem("uno-help-seen") === "1"; } catch (_) { seenHelp = true; }
    if (!seenHelp) {
        helpOpen = true;
        try { localStorage.setItem("uno-help-seen", "1"); } catch (_) { /* storage blocked */ }
    }

    root.innerHTML = `
<style>
.uno-app{width:100%;height:100%;min-height:0;display:flex;flex-direction:column;gap:10px;color:#0f172a;font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;outline:none}
.uno-app *{box-sizing:border-box}
.uno-app [hidden]{display:none!important}
.uno-app button:focus-visible{outline:2px solid #6366f1;outline-offset:2px}
/* HUD: semua info + kontrol, tanpa intro/footer */
.uno-hud{display:flex;align-items:center;gap:8px;flex-wrap:wrap;font:600 11px/1 ui-monospace,SFMono-Regular,Menlo,monospace}
.uno-chip{display:inline-flex;align-items:center;gap:6px;min-height:28px;background:#f1f5f9;color:#475569;border-radius:99px;padding:4px 10px;font-size:11px;font-weight:700;white-space:nowrap}
.uno-chip b{color:#0f172a;font-variant-numeric:tabular-nums}
.uno-dot{width:7px;height:7px;border-radius:50%;display:inline-block;flex:none;background:#94a3b8}
.uno-spacer{flex:1 1 auto;min-width:4px}
.uno-btn{background:#fff;border:1px solid #e2e8f0;border-radius:10px;padding:8px 12px;font-size:12px;font-weight:700;color:#0f172a;cursor:pointer;min-height:36px;transition:background .16s,transform .16s}
.uno-btn:hover:not(:disabled){background:#f1f5f9}
.uno-btn:disabled{opacity:.45;cursor:default}
.uno-btn.primary{background:#0f172a;border-color:#0f172a;color:#fff}
.uno-btn.primary:hover:not(:disabled){background:#1e293b}
.uno-btn.on{border-color:#6366f1;color:#4338ca;background:#eef2ff}
.uno-icon-btn{display:inline-flex;align-items:center;gap:6px}
.uno-icon-btn svg{flex:none;display:block}
.uno-btn-label{white-space:nowrap}
.uno-btn kbd{margin-left:6px}
.uno-app kbd{background:#f1f5f9;border:1px solid #e2e8f0;border-radius:4px;padding:0 4px;font-size:10px;font-family:inherit;color:#64748b}
.uno-btn.primary kbd{background:#ffffff22;border-color:#ffffff33;color:#fff}
/* Board mengisi sisa tinggi; konten proporsional dan ter-tengah */
.uno-app.game-fill > .uno-panel{flex:1 1 auto;min-height:0;aspect-ratio:auto;position:relative;display:flex;align-items:center;justify-content:center;min-width:0;padding:0;border:0;border-radius:14px;overflow:hidden;background:#f8fafc}
.uno-board{width:100%;max-width:920px;max-height:100%;min-height:0;display:flex;flex-direction:column;gap:10px;margin:auto;padding:14px;overflow:auto}
.uno-panel{display:flex;flex-direction:column;gap:12px;min-width:0;overflow:hidden}
.uno-zlabel{font-size:10.5px;font-weight:800;letter-spacing:1.2px;text-transform:uppercase;color:#94a3b8;margin-bottom:8px;display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.uno-opps{display:flex;gap:8px;flex-wrap:wrap}
.uno-opp{flex:1 1 150px;min-width:150px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:12px;transition:border-color .16s,box-shadow .16s}
.uno-opp.cur{border-color:#6366f1;box-shadow:0 0 0 2px #6366f122}
.uno-opphead{display:flex;align-items:center;gap:8px;font-size:12.5px;margin-bottom:8px}
.uno-count{margin-left:auto;background:#e2e8f0;border-radius:99px;padding:2px 8px;font-size:11px;font-weight:800;color:#334155}
.uno-badge{background:#fde047;color:#713f12;border-radius:99px;padding:2px 8px;font-size:10px;font-weight:900;letter-spacing:.5px}
.uno-backs{display:flex;gap:4px;flex-wrap:wrap;align-items:center;min-height:30px}
.uno-back{width:20px;height:30px;border-radius:4px;background:#1e293b;flex:none}
.uno-mini svg{width:30px;height:45px;display:block;border-radius:4px}
.uno-more{font-size:11px;font-weight:800;color:#64748b}
.uno-tablezone{background:#f8fafc;border:1px solid #eef2f7;border-radius:12px;padding:16px}
.uno-table{display:flex;align-items:center;justify-content:center;gap:24px;flex-wrap:wrap}
.uno-deck{position:relative;border:none;background:none;padding:0;min-width:44px;min-height:44px;cursor:pointer;transition:transform .16s}
.uno-deck svg{width:66px;height:99px;display:block;border-radius:10px;box-shadow:0 3px 8px #0f172a1f}
.uno-deck.ready:hover{transform:translateY(-3px)}
.uno-deck.hint svg{box-shadow:0 0 0 3px #6366f155,0 3px 8px #0f172a1f}
.uno-deckcount{position:absolute;bottom:-8px;left:50%;transform:translateX(-50%);background:#0f172a;color:#fff;font-size:10.5px;font-weight:800;border-radius:99px;padding:1px 8px;pointer-events:none}
.uno-piletag{font-size:10px;font-weight:800;letter-spacing:1.2px;color:#94a3b8;text-align:center;margin-top:12px}
.uno-dir{text-align:center;color:#64748b}
.uno-dir b{font-size:26px;display:block;line-height:1}
.uno-dir small{font-size:10px;font-weight:700;letter-spacing:.8px;text-transform:uppercase}
.uno-discard svg{width:92px;height:138px;display:block;border-radius:12px;box-shadow:0 5px 14px #0f172a26}
.uno-discard.pop svg{animation:unoPop .2s ease}
.uno-colorchip{display:flex;align-items:center;gap:8px;justify-content:center;margin-top:8px;font-size:12px;font-weight:800;color:#334155}
.uno-dotcard{width:11px;height:11px;border-radius:50%;display:inline-block;flex:none}
.uno-last{text-align:center;font-size:12px;color:#64748b;margin-top:12px;min-height:16px}
.uno-picker{display:flex;align-items:center;justify-content:center;gap:8px;flex-wrap:wrap;margin-top:12px;padding:12px;background:#eef2ff;border-radius:10px}
.uno-picker span{font-size:12.5px;font-weight:700;color:#3730a3}
.uno-colorbtn{border:none;border-radius:9px;padding:10px 16px;font-size:12.5px;font-weight:800;cursor:pointer;color:#fff;min-height:44px}
.uno-colorbtn small{opacity:.8;font-weight:700}
.uno-hand{display:flex;gap:8px;overflow-x:auto;padding:8px 2px 12px;min-height:120px;align-items:flex-end;scrollbar-width:thin;overscroll-behavior-x:contain}
.uno-card{border:none;background:none;padding:0;flex:none;cursor:pointer;transition:transform .16s,opacity .16s;border-radius:10px}
.uno-card svg{width:72px;height:108px;display:block;border-radius:10px;box-shadow:0 3px 8px #0f172a1f}
.uno-card.hot svg{box-shadow:0 0 0 2px #6366f1,0 4px 10px #0f172a29}
.uno-card.hot:hover{transform:translateY(-7px)}
.uno-card.off{opacity:.38;filter:saturate(.5)}
.uno-card.idle{opacity:.8}
.uno-card.sel svg{outline:3px solid #0f172a;outline-offset:2px}
/* Touch pad adalah sibling board, bukan anak board */
.uno-pad{display:none;justify-content:center;align-items:center;gap:8px;margin-top:2px}
.uno-pad .uno-btn{min-width:48px;font-size:15px}
.uno-toasts{position:absolute;top:12px;left:50%;transform:translateX(-50%);display:flex;flex-direction:column;gap:8px;align-items:center;z-index:6;pointer-events:none;max-width:92%}
.uno-toast{background:#0f172aee;color:#f8fafc;padding:6px 14px;border-radius:99px;font-size:12px;font-weight:700;animation:unoToast 2.2s forwards;white-space:nowrap;max-width:100%;overflow:hidden;text-overflow:ellipsis}
.uno-toast.good{background:#166534ee}
.uno-toast.bad{background:#991b1bee}
.uno-toast.warn{background:#92400eee}
/* Overlay modal: head/foot tetap, isi bisa scroll */
.uno-ov{position:absolute;inset:0;z-index:5;background:#f8fafcee;backdrop-filter:blur(3px);display:flex;align-items:center;justify-content:center;padding:16px}
.uno-ovcard{display:flex;flex-direction:column;overflow:hidden;background:#fff;border:1px solid #e2e8f0;border-radius:14px;padding:20px;max-width:560px;width:100%;max-height:100%;box-shadow:0 12px 28px #0f172a18}
.uno-head{flex:none;display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:12px}
.uno-head h3{margin:0;font-size:19px;line-height:1.25}
.uno-body{flex:1 1 auto;min-height:0;overflow:auto}
.uno-body p,.uno-ovsub{margin:8px 0;font-size:13px;line-height:1.6;color:#334155}
.uno-body ul{margin:8px 0;padding-left:18px;font-size:13px;line-height:1.7;color:#334155}
.uno-foot{flex:none;display:flex;gap:8px;flex-wrap:wrap;align-items:center;justify-content:space-between;margin-top:14px;padding-top:12px;border-top:1px solid #e2e8f0}
.uno-ovbtns{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
.uno-ovhint{font-size:11.5px;color:#94a3b8}
.uno-note{font-size:11.5px;color:#92400e;background:#fef3c7;border-radius:8px;padding:8px 12px;margin:8px 0}
.uno-help{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}
.uno-help b{display:block;margin:10px 0 4px;font-size:10px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:#64748b}
.uno-help p{margin:6px 0;font-size:12.5px;line-height:1.55}
.uno-help ul{font-size:12.5px}
.uno-kbd{display:inline-block;padding:1px 5px;border:1px solid #e2e8f0;border-bottom-width:2px;border-radius:5px;background:#f8fafc;font:600 10px/1.4 ui-monospace,monospace;color:#334155}
.uno-cheats{display:flex;flex-direction:column}
.uno-cheat{display:flex;align-items:center;gap:12px;justify-content:space-between;padding:12px 0;border-bottom:1px solid #f1f5f9;min-height:44px}
.uno-cheat b{font-size:13px;display:block}
.uno-cheat small{font-size:11.5px;color:#64748b}
@keyframes unoPop{from{transform:scale(.85);opacity:.4}}
@keyframes unoToast{0%{opacity:0;transform:translateY(-6px)}10%{opacity:1;transform:none}80%{opacity:1}100%{opacity:0}}
@media (max-width:700px){
 .uno-app .uno-panel{padding:12px}
}
@media (prefers-reduced-motion:reduce){
 .uno-app *{animation:none!important;transition:none!important}
}
/* --- layout final: override pointer:coarse 44px dengan spesifisitas lebih tinggi --- */
@media (max-width:640px){
 .uno-app{gap:6px}
 .uno-app .uno-hud{gap:4px}
 .uno-app .uno-hud .uno-chip{padding:4px 6px;font-size:9px;min-height:0}
 .uno-app .uno-hud .uno-chip[data-hud="skill"],
 .uno-app .uno-hud .uno-chip[data-hud="best"],
 .uno-app .uno-hud .uno-chip[data-hud="room"]{display:none}
 .uno-app .uno-hud .uno-btn-label,.uno-app .uno-hud .uno-spacer{display:none}
 .uno-app .uno-hud .uno-btn{min-height:32px;padding:5px 9px;font-size:9px}
 .uno-app.game-fill > .uno-panel:has(.uno-ov:not([hidden])){flex:0 0 auto;min-height:min(70dvh,620px);aspect-ratio:auto}
 .uno-app .uno-board{padding:10px;gap:8px}
 .uno-app .uno-card svg{width:58px;height:87px}
 .uno-app .uno-discard svg{width:78px;height:117px}
 .uno-app .uno-deck svg{width:56px;height:84px}
 .uno-app .uno-opp{min-width:120px;flex-basis:120px;padding:8px}
 .uno-app .uno-table{gap:16px}
 .uno-app .uno-tablezone{padding:12px}
 .uno-app .uno-ov{padding:8px}
 .uno-app .uno-ovcard{width:100%;height:100%;max-height:100%;padding:12px;border-radius:12px}
 .uno-app .uno-body{scrollbar-width:none}
 .uno-app .uno-body::-webkit-scrollbar{display:none}
 .uno-app .uno-help{grid-template-columns:1fr;gap:8px}
 .uno-app .uno-foot{padding-top:8px}
 .uno-app .uno-note{display:none}
 .uno-app .uno-pad{display:flex}
}
@media (pointer:coarse){
 .uno-app .uno-hud .uno-btn{min-height:32px;padding:5px 9px;font-size:9px}
 .uno-app .uno-pad{display:flex}
 .uno-app .uno-pad .uno-btn{min-width:48px;min-height:44px}
 .uno-app .uno-ovcard .uno-btn{min-height:44px}
}
</style>
<div class="game-app uno-app game-fill" data-uno>
  <div class="uno-hud">
    <span class="uno-chip">LV <b data-hud="level">1</b> <span data-hud="skill">Casual bots</span></span>
    <span class="uno-chip" data-hud="bestchip">BEST <b data-hud="best">—</b></span>
    <span class="uno-chip"><i class="uno-dot" data-status-dot></i><span data-status>Ready</span></span>
    <span class="uno-chip">HAND <b data-hud="hand">0</b></span>
    <span class="uno-chip">DECK <b data-hud="deck">0</b></span>
    <span class="uno-chip" data-hud="room" hidden>ROOM · P<b data-hud="seat">1</b></span>
    <span class="uno-chip" data-hud="cheated" hidden>🪄 cheated</span>
    <span class="uno-spacer"></span>
    <button class="uno-btn uno-icon-btn" type="button" data-act="draw" data-drawbtn aria-label="Draw a card" title="Draw a card (D)">${iconSVG("layers", { size: 14 })}<span class="uno-btn-label">Draw</span></button>
    <button class="uno-btn uno-icon-btn" type="button" data-help aria-label="How to play" title="How to play (H)">${iconSVG("helpCircle", { size: 14 })}<span class="uno-btn-label">Help</span></button>
    <button class="uno-btn uno-icon-btn" type="button" data-cheats aria-label="Cheats" title="Cheats (C)" ${online ? "disabled" : ""}>${iconSVG("wrench", { size: 14 })}<span class="uno-btn-label">Cheats</span></button>
    <button class="uno-btn uno-icon-btn" type="button" data-pause aria-label="Pause" title="Pause (P)" ${online ? "disabled" : ""}>${iconSVG("pause", { size: 14 })}<span class="uno-btn-label">Pause</span></button>
    <button class="uno-btn uno-icon-btn" type="button" data-restart aria-label="Restart" title="Restart (R)">${iconSVG("refresh", { size: 14 })}<span class="uno-btn-label">Restart</span></button>
    <button class="uno-btn uno-icon-btn" type="button" data-exit aria-label="Exit game" title="Exit game">${iconSVG("logOut", { size: 14 })}<span class="uno-btn-label">Exit game</span></button>
  </div>
  <section class="game-panel uno-panel" data-board>
    <div class="uno-board">
      <div class="uno-zone">
        <div class="uno-zlabel">Opponents</div>
        <div class="uno-opps" data-opps></div>
      </div>

      <div class="uno-zone uno-tablezone">
        <div class="uno-zlabel">Table</div>
        <div class="uno-table">
          <div>
            <button type="button" class="uno-deck" data-act="draw" aria-label="Draw a card (D)">${backSvg()}<span class="uno-deckcount" data-deckcount>0</span></button>
            <div class="uno-piletag">DRAW</div>
          </div>
          <div class="uno-dir" data-dir><b>↻</b><small>Clockwise</small></div>
          <div>
            <div class="uno-discard" data-discard></div>
            <div class="uno-colorchip"><span class="uno-dotcard" data-colordot></span><span data-colorname>—</span></div>
          </div>
        </div>
        <div class="uno-last" data-last aria-live="polite"></div>
        <div class="uno-picker" data-picker hidden>
          <span>Wild! Pick a color:</span>
          <button type="button" class="uno-colorbtn" data-act="color" data-color="red" style="background:#ef4444">Red <small>1</small></button>
          <button type="button" class="uno-colorbtn" data-act="color" data-color="yellow" style="background:#f59e0b">Yellow <small>2</small></button>
          <button type="button" class="uno-colorbtn" data-act="color" data-color="green" style="background:#22c55e">Green <small>3</small></button>
          <button type="button" class="uno-colorbtn" data-act="color" data-color="blue" style="background:#3b82f6">Blue <small>4</small></button>
          <button type="button" class="uno-btn" data-act="cancelColor">Cancel</button>
        </div>
      </div>

      <div class="uno-zone">
        <div class="uno-zlabel">Your hand · <span class="uno-badge" data-handuno hidden>UNO!</span></div>
        <div class="uno-hand" data-hand></div>
      </div>
    </div>

    <div class="uno-toasts" data-toasts aria-live="polite"></div>

    <div class="uno-ov" data-ov="help" hidden>
      <div class="uno-ovcard">
        <div class="uno-head"><h3>How to play</h3><button class="uno-btn" type="button" data-act="closeHelp" aria-label="Close help">${iconSVG("x", { size: 14 })}</button></div>
        <div class="uno-body uno-help">
          <div>
            <b>Your turn</b>
            <p>Match the table's <b>color</b> or <b>number / symbol</b>. Wilds always fit — then pick the next color.</p>
            <p><b>Stuck?</b> Tap the deck or <b>Draw</b>. If the drawn card fits it is played automatically; otherwise your turn passes.</p>
            <b>Action cards</b>
            <ul>
              <li><b>Skip</b> — next player loses a turn.</li>
              <li><b>Reverse</b> — flips direction (with 2 players it acts as a Skip).</li>
              <li><b>+2</b> — next player draws 2 and is skipped.</li>
              <li><b>Wild</b> — you choose the color.</li>
              <li><b>Wild +4</b> — choose a color; next player draws 4 and is skipped.</li>
            </ul>
          </div>
          <div>
            <b>Rules</b>
            <p>Be the first to empty your hand. UNO is called automatically at one card — no penalty, no timers.</p>
            <p>Every deal is seeded and validated so you start with at least two playable cards. Win → next level with smarter bots. Lose → retry the <i>exact same deal</i>.</p>
            <b>Controls</b>
            <ul>
              <li><span class="uno-kbd">← →</span> select · <span class="uno-kbd">Enter</span> play · <span class="uno-kbd">D</span> draw · <span class="uno-kbd">1–4</span> pick color</li>
              <li><span class="uno-kbd">H</span> help · <span class="uno-kbd">C</span> cheats · <span class="uno-kbd">P</span> pause · <span class="uno-kbd">R</span> restart · <span class="uno-kbd">Esc</span> close</li>
              <li>Mobile: tap cards or use the ◀ Play ▶ pad below the board.</li>
            </ul>
            <div class="uno-foot"><span class="uno-note">Press H to reopen this guide</span><button class="uno-btn primary" type="button" data-act="closeHelp">Got it</button></div>
          </div>
        </div>
      </div>
    </div>

    <div class="uno-ov" data-ov="cheats" hidden>
      <div class="uno-ovcard">
        <div class="uno-head"><h3>Cheats</h3><button class="uno-btn" type="button" data-act="closeCheats" aria-label="Close cheats">${iconSVG("x", { size: 14 })}</button></div>
        <div class="uno-body uno-cheats">
          <div class="uno-note">Sandbox mode — using any cheat marks this round, and your best level won't increase. Cheats are disabled in room matches.</div>
          <div data-cheatlist></div>
        </div>
        <div class="uno-foot"><span class="uno-note">Offline games only</span><button class="uno-btn" type="button" data-act="closeCheats">Close cheats</button></div>
      </div>
    </div>

    <div class="uno-ov" data-ov="pause" hidden>
      <div class="uno-ovcard">
        <div class="uno-head"><h3>Paused</h3></div>
        <div class="uno-body"><p>The board, bots and timers are frozen.</p></div>
        <div class="uno-foot"><span class="uno-note">Press P or Esc to resume</span><button class="uno-btn primary" type="button" data-resume>Resume</button></div>
      </div>
    </div>

    <div class="uno-ov" data-ov="over" hidden>
      <div class="uno-ovcard">
        <div class="uno-head"><h3 data-overtitle>Game over</h3></div>
        <div class="uno-body"><p class="uno-ovsub" data-overreason></p></div>
        <div class="uno-foot"><div class="uno-ovbtns" data-overbtns></div></div>
      </div>
    </div>
  </section>
  <div class="uno-pad">
    <button type="button" class="uno-btn" data-act="selPrev" aria-label="Select previous card">${iconSVG("chevronLeft", { size: 16 })}</button>
    <button type="button" class="uno-btn primary" data-act="playSel" data-padplay>Play</button>
    <button type="button" class="uno-btn" data-act="selNext" aria-label="Select next card">${iconSVG("chevronRight", { size: 16 })}</button>
  </div>
</div>`;
    /* ---------------- refs ---------------- */
    const $ = (s) => root.querySelector(s);
    const statusEl = $("[data-status]"), dotEl = $("[data-status-dot]");
    const hud = {
        level: $('[data-hud="level"]'), skill: $('[data-hud="skill"]'), best: $('[data-hud="best"]'),
        bestChip: $('[data-hud="bestchip"]'), hand: $('[data-hud="hand"]'), deck: $('[data-hud="deck"]'),
        room: $('[data-hud="room"]'), seat: $('[data-hud="seat"]'), cheated: $('[data-hud="cheated"]'),
    };
    const oppsEl = $("[data-opps]"), discardEl = $("[data-discard]");
    const deckBtn = $(".uno-deck"), deckCountEl = $("[data-deckcount]"), dirEl = $("[data-dir]");
    const colorDotEl = $("[data-colordot]"), colorNameEl = $("[data-colorname]"), lastEl = $("[data-last]");
    const pickerEl = $("[data-picker]"), handEl = $("[data-hand]");
    const handUnoEl = $("[data-handuno]");
    const drawBtn = $("[data-drawbtn]"), padPlayBtn = $("[data-padplay]");
    const restartBtn = $(".uno-hud [data-restart]"), cheatsBtn = $("[data-cheats]"), pauseBtn = $("[data-pause]");
    const toastsEl = $("[data-toasts]");
    const ov = {
        help: $('[data-ov="help"]'), cheats: $('[data-ov="cheats"]'),
        pause: $('[data-ov="pause"]'), over: $('[data-ov="over"]'),
    };
    const overTitle = $("[data-overtitle]"), overReason = $("[data-overreason]"), overBtns = $("[data-overbtns]");
    const cheatList = $("[data-cheatlist]");

    /* ---------------- identitas & kursi ---------------- */
    /* Multiplayer: kursi diacak lewat swapSeats. actor = index koneksi (host 0, guest 1). */
    const seatOf = (actor) => (online && state?.swapSeats ? 1 - actor : actor);
    const mySeat = () => (online ? seatOf(playerIndex) : 0);
    const topCard = () => state.discard[state.discard.length - 1];

    function connNames() {
        const p = roomData && roomData.players;
        const pick = (v) => (typeof v === "string" ? v : (v && (v.name || v.displayName || v.playerName)) || "");
        let host = pick(Array.isArray(p) ? p[0] : p && p.host) || (roomData && roomData.hostName) || "";
        let guest = pick(Array.isArray(p) ? p[1] : p && p.guest) || (roomData && roomData.guestName) || "";
        if (room?.isHost && playerName) host = playerName;
        return [host || "Player 1", guest || "Player 2"];
    }
    function refreshNames() {
        const names = connNames();
        let changed = false;
        for (let conn = 0; conn < 2; conn++) {
            const s = state.swapSeats ? 1 - conn : conn;
            if (state.players[s].name !== names[conn]) { state.players[s].name = names[conn]; changed = true; }
        }
        return changed;
    }

    /* ---------------- toast ---------------- */
    function toast(msg, kind) {
        const el = document.createElement("div");
        el.className = "uno-toast" + (kind ? " " + kind : "");
        el.textContent = msg;
        toastsEl.appendChild(el);
        while (toastsEl.children.length > 4) toastsEl.firstChild.remove();
        const id = setTimeout(() => { toastTimers.delete(id); el.remove(); }, 2250);
        toastTimers.add(id);
    }

    /* ---------------- mesin permainan (semua mutasi state di sini) ---------------- */
    function advanceSeat(seat, steps) {
        for (let k = 0; k < steps; k++) seat = (seat + state.dir + state.nPlayers) % state.nPlayers;
        return seat;
    }
    function refillDeck() {
        if (state.discard.length <= 1) return;
        const top = state.discard.pop();
        state.deck = shuffle(state.discard);
        state.discard = [top];
    }
    function drawCards(seat, n) {
        const p = state.players[seat], got = [];
        for (let k = 0; k < n; k++) {
            if (!state.deck.length) refillDeck();
            if (!state.deck.length) break;
            const c = state.deck.pop();
            p.hand.push(c);
            p.calledUno = p.hand.length === 1;
            got.push(c);
        }
        return got;
    }
    function checkStalemate() {
        if (state.phase === "over") return;
        if (state.deck.length || state.discard.length > 1) return;
        const t = topCard();
        if (state.players.some((p) => p.hand.some((c) => canPlay(c, t, state.currentColor)))) return;
        let w = 0;
        for (let i = 1; i < state.nPlayers; i++) if (state.players[i].hand.length < state.players[w].hand.length) w = i;
        state.phase = "over"; state.winner = w; state.winReason = "stalemate";
        state.lastAction = "The piles ran dry — fewest cards wins";
    }
    function doPlay(seat, idx, color) {
        const p = state.players[seat];
        const card = p.hand.splice(idx, 1)[0];
        state.discard.push(card);
        state.currentColor = isWildK(card) ? color || "red" : card.color;
        let msg = p.name + " played " + cardLabel(card);
        if (isWildK(card)) msg += " → " + cap(state.currentColor);
        p.calledUno = p.hand.length === 1; /* UNO otomatis — tanpa penalti */
        if (!p.hand.length) {
            state.phase = "over"; state.winner = seat; state.winReason = "shed";
            state.lastAction = msg + " — round over";
            return;
        }
        let skip = 0;
        const vi = advanceSeat(seat, 1);
        const victim = state.players[vi];
        if (card.kind === "skip") { skip = 1; msg += " · " + victim.name + " skipped"; }
        else if (card.kind === "rev") { state.dir *= -1; if (state.nPlayers === 2) skip = 1; msg += " · direction reversed"; }
        else if (card.kind === "draw2") { drawCards(vi, 2); skip = 1; msg += " · " + victim.name + " +2 & skipped"; }
        else if (card.kind === "wild4") { drawCards(vi, 4); skip = 1; msg += " · " + victim.name + " +4 & skipped"; }
        if (p.hand.length === 1) msg += " · UNO!";
        state.turn = advanceSeat(seat, 1 + skip);
        state.lastAction = msg;
        checkStalemate();
    }
    function doDraw(seat) {
        const p = state.players[seat];
        const got = drawCards(seat, 1);
        if (!got.length) {
            state.lastAction = p.name + " could not draw — turn passes";
            state.turn = advanceSeat(seat, 1);
            checkStalemate();
            return;
        }
        const c = got[0];
        if (canPlay(c, topCard(), state.currentColor)) {
            /* Disederhanakan: kartu hasil draw langsung auto-play kalau cocok */
            const idx = p.hand.length - 1;
            const color = isWildK(c) ? aiColorChoice(p.hand.slice(0, idx)) : null;
            doPlay(seat, idx, color);
            state.lastAction = p.name + " drew & auto-played " + cardLabel(c) +
                (isWildK(c) ? " → " + cap(state.currentColor) : "") +
                (state.phase === "over" ? " — round over" : "");
        } else {
            state.lastAction = p.name + " drew a card — turn passes";
            state.turn = advanceSeat(seat, 1);
            checkStalemate();
        }
    }
    function applyCheat(kind) {
        const me = state.players[0];
        if (kind === "reveal") { state.cheats.reveal = !state.cheats.reveal; state.lastAction = "Cheat: reveal " + (state.cheats.reveal ? "ON" : "OFF"); }
        else if (kind === "free") { state.cheats.freePlay = !state.cheats.freePlay; state.lastAction = "Cheat: free play " + (state.cheats.freePlay ? "ON" : "OFF"); }
        else if (kind === "wild") { me.hand.push({ color: "wild", kind: "wild" }); me.calledUno = false; state.lastAction = "Cheat: a Wild appears in your hand"; }
        else if (kind === "trim") {
            const burn = Math.min(3, me.hand.length - 1);
            if (burn > 0) me.hand.splice(0, burn);
            me.calledUno = me.hand.length === 1;
            state.lastAction = "Cheat: burned " + burn + " card" + (burn === 1 ? "" : "s");
        }
        else if (kind === "tax") { for (let s = 1; s < state.nPlayers; s++) drawCards(s, 2); state.lastAction = "Cheat: every bot draws 2"; }
        else if (kind === "win") { me.hand = []; state.phase = "over"; state.winner = 0; state.winReason = "cheat"; state.lastAction = "Cheat: instant win"; }
        else return;
        state.cheated = true;
    }

    /* ---------------- ronde baru ---------------- */
    function newGame(level, seed) {
        if (botTimer) { clearTimeout(botTimer); botTimer = null; }
        paused = false; pauseStart = 0; botRemain = null;
        const nPlayers = online ? 2 : 4;
        const deal = generateDeal(seed, nPlayers);
        const swap = online ? Math.random() < 0.5 : false; /* posisi pemain multiplayer diacak */
        const names = online ? connNames() : ["You", "Ada", "Ben", "Cleo"];
        const players = [];
        for (let s = 0; s < nPlayers; s++) {
            const conn = online ? (swap ? 1 - s : s) : s;
            players.push({
                name: online ? names[conn] || "Player " + (conn + 1) : names[s],
                ai: !online && s > 0,
                hand: deal.hands[s],
                calledUno: false,
            });
        }
        state = {
            roundId: state ? state.roundId + 1 : 1,
            level, seed, nPlayers, players,
            deck: deal.deck, discard: [deal.first],
            turn: deal.starter, dir: 1, currentColor: deal.first.color,
            phase: "play", winner: null, winReason: null,
            swapSeats: swap, cheated: false, cheats: { reveal: false, freePlay: false },
            lastAction: players[deal.starter].name + " goes first 🎲",
        };
        sel = 0; picker = null; scrollSelFlag = false; lastTopSig = "";
        toast("Level " + level + " · " + (deal.starter === mySeat() ? "you start!" : players[deal.starter].name + " starts"), "good");
        if (online) toast("Random seats: you are Player " + (mySeat() + 1));
    }

    /* ---------------- best level (hanya vs bot, tanpa cheat) ---------------- */
    function noteResult() {
        if (!state || online || state.phase !== "over" || notedRound === state.roundId) return;
        notedRound = state.roundId;
        if (state.winner === 0 && !state.cheated && state.winReason !== "cheat" && state.level > best) {
            best = state.level;
            try { localStorage.setItem(META.bestKey, String(best)); } catch (_) { }
            toast("🏆 New best: Level " + best, "good");
        }
    }

    /* ---------------- publish & bot ---------------- */
    function publish() {
        noteResult();
        render();
        if (online && room.isHost) room.publishState(state).catch(console.warn);
        scheduleBot();
    }
    /* Pause: hentikan bot & timer, lalu geser penanda waktu saat resume
       supaya sisa jeda tidak loncat (Date.now()/performance.now() anchor). */
    const clock = () => (typeof performance !== "undefined" && performance.now ? performance.now() : Date.now());
    const nowMs = () => clock() - pauseOffset;
    function scheduleBot(wait) {
        if (botTimer) { clearTimeout(botTimer); botTimer = null; }
        if (destroyed || paused || online || !state || state.phase !== "play") return;
        if (!state.players[state.turn].ai) return;
        const ms = wait == null ? 750 + Math.random() * 550 : wait;
        botDueAt = nowMs() + ms;
        botTimer = setTimeout(() => { botTimer = null; if (paused || destroyed) return; botMove(); }, ms);
    }
    function togglePause(on) {
        if (online || !state) return;
        const next = typeof on === "boolean" ? on : !paused;
        if (next === paused) return;
        paused = next;
        if (paused) {
            pauseStart = clock();
            botRemain = botTimer ? Math.max(0, botDueAt - nowMs()) : null;
            if (botTimer) { clearTimeout(botTimer); botTimer = null; }
        } else {
            if (pauseStart) pauseOffset += clock() - pauseStart;
            pauseStart = 0;
            const remain = botRemain; botRemain = null;
            scheduleBot(remain);
        }
        render();
    }
    function botMove() {
        if (destroyed || paused || !state || state.phase !== "play") return;
        const seat = state.turn, p = state.players[seat];
        if (!p.ai) return;
        let oppMin = 99;
        for (let i = 0; i < state.nPlayers; i++) if (i !== seat) oppMin = Math.min(oppMin, state.players[i].hand.length);
        const idx = aiPick(p.hand, topCard(), state.currentColor, oppMin, skillFor(state.level));
        if (idx >= 0) {
            const c = p.hand[idx];
            const color = isWildK(c) ? aiColorChoice(p.hand.filter((_, k) => k !== idx)) : null;
            doPlay(seat, idx, color);
        } else doDraw(seat);
        publish();
    }

    /* ---------------- aksi (host-authoritative) ---------------- */
    function applyAction(action, actor) {
        if (destroyed || !state || !action || typeof action !== "object") return;
        const seat = seatOf(actor);
        const type = action.type;
        if (paused && type !== "restart") return;
        if (type === "restart") {
            helpOpen = false; cheatsOpen = false;
            if (online) newGame(1, newSeed());          /* rematch: seed & kursi baru */
            else newGame(state.level, state.seed);      /* retry: deal SAMA (solvable) */
            publish(); return;
        }
        if (type === "nextLevel") {
            if (!online && state.phase === "over" && state.winner === 0) { newGame(state.level + 1, newSeed()); publish(); }
            return;
        }
        if (type === "cheat") {
            if (online || seat !== 0) return;
            applyCheat(String(action.cheat || ""));
            publish(); return;
        }
        if (state.phase !== "play" || state.turn !== seat) return;
        if (type === "play") {
            const i = Number(action.index);
            if (!Number.isInteger(i) || i < 0) return;
            const p = state.players[seat], c = p.hand[i];
            if (!c) return;
            const free = !online && state.cheats.freePlay && seat === 0;
            if (!free && !canPlay(c, topCard(), state.currentColor)) return;
            let color = null;
            if (isWildK(c)) color = COLORS.includes(action.color) ? action.color : aiColorChoice(p.hand.filter((_, k) => k !== i));
            doPlay(seat, i, color);
            publish(); return;
        }
        if (type === "draw") { doDraw(seat); publish(); return; }
    }
    function submitAction(action) {
        if (online && !room.isHost) {
            room.sendAction(action).catch(console.warn);
            render(); /* tutup picker / update UI lokal sambil menunggu state host */
            return;
        }
        applyAction(action, playerIndex);
    }

    /* ---------------- interaksi lokal ---------------- */
    function tryPlay(i) {
        if (!state || helpOpen || cheatsOpen || paused || picker || state.phase === "over") return;
        const my = mySeat();
        if (state.turn !== my) { toast("Wait — " + state.players[state.turn].name + " is playing", "warn"); return; }
        const me = state.players[my], c = me.hand[i];
        if (!c) return;
        sel = i;
        const free = !online && state.cheats.freePlay;
        if (!free && !canPlay(c, topCard(), state.currentColor)) {
            toast("Doesn't match — play a glowing card or draw", "warn");
            render(); return;
        }
        if (isWildK(c)) { picker = { index: i }; render(); return; }
        submitAction({ type: "play", index: i });
    }
    function tryDraw() {
        if (!state || helpOpen || cheatsOpen || paused || state.phase === "over") return;
        if (state.turn !== mySeat()) { toast("Not your turn yet", "warn"); return; }
        picker = null;
        submitAction({ type: "draw" });
    }
    function moveSel(d) {
        if (!state || helpOpen || cheatsOpen || paused) return;
        const n = state.players[mySeat()].hand.length;
        if (!n) return;
        sel = (sel + d + n) % n;
        scrollSelFlag = true;
        render();
    }
    function confirmColor(col) {
        if (!picker || paused) return;
        const i = picker.index;
        picker = null;
        submitAction({ type: "play", index: i, color: col });
    }

    /* ---------------- render ---------------- */
    function render() {
        if (destroyed) return;
        if (!state) {
            statusEl.textContent = "Waiting for host to deal…";
            dotEl.style.background = "#94a3b8";
            hud.level.textContent = "—"; hud.skill.textContent = "";
            hud.best.textContent = "—"; hud.bestChip.hidden = true;
            hud.hand.textContent = "0"; hud.deck.textContent = "0";
            hud.room.hidden = !online; hud.seat.textContent = String(playerIndex + 1);
            hud.cheated.hidden = true;
            oppsEl.innerHTML = ""; handEl.innerHTML = ""; discardEl.innerHTML = "";
            drawBtn.disabled = true; padPlayBtn.disabled = true;
            syncUI();
            return;
        }
        const my = mySeat(), me = state.players[my];
        const myTurn = state.phase === "play" && state.turn === my;
        const free = !online && state.cheats.freePlay;
        const t = topCard();

        /* picker hanya valid saat giliranmu & kartunya masih wild di tangan */
        if (picker && (!myTurn || !me.hand[picker.index] || !isWildK(me.hand[picker.index]))) picker = null;
        pickerEl.hidden = !picker;
        sel = Math.max(0, Math.min(sel, me.hand.length - 1));

        /* HUD chips + status */
        hud.level.textContent = String(state.level);
        hud.skill.textContent = online ? "" : SKILL_LABEL[skillFor(state.level)] + " bots";
        hud.best.textContent = best ? String(best) : "—";
        hud.bestChip.hidden = online;
        hud.hand.textContent = String(me.hand.length);
        hud.deck.textContent = String(state.deck.length);
        hud.room.hidden = !online; hud.seat.textContent = String(my + 1);
        hud.cheated.hidden = !state.cheated;
        const anyPlayable = me.hand.some((c) => free || canPlay(c, t, state.currentColor));
        if (state.phase === "over") {
            statusEl.textContent = state.winner === my ? "You win! 🎉" : state.players[state.winner].name + " wins";
            dotEl.style.background = "#64748b";
        } else if (myTurn) {
            statusEl.textContent = anyPlayable ? "Your turn — tap a glowing card" : "No match — tap the deck to draw";
            dotEl.style.background = "#22c55e";
        } else {
            statusEl.textContent = state.players[state.turn].name + " is thinking…";
            dotEl.style.background = "#f59e0b";
        }

        /* meja */
        deckCountEl.textContent = String(state.deck.length);
        deckBtn.classList.toggle("ready", myTurn);
        deckBtn.classList.toggle("hint", myTurn && !anyPlayable);
        deckBtn.setAttribute("aria-disabled", myTurn ? "false" : "true");
        dirEl.innerHTML = state.dir === 1 ? "<b>↻</b><small>Clockwise</small>" : "<b>↺</b><small>Reversed</small>";
        colorDotEl.style.background = CARD_HEX[state.currentColor] || "#94a3b8";
        colorNameEl.textContent = cap(state.currentColor || "—");
        lastEl.textContent = state.lastAction || "";
        const sig = state.discard.length + ":" + cardLabel(t) + ":" + state.currentColor;
        discardEl.innerHTML = cardSvg(t);
        if (sig !== lastTopSig) {
            discardEl.classList.remove("pop"); void discardEl.offsetWidth; discardEl.classList.add("pop");
            lastTopSig = sig;
        }

        /* lawan */
        const reveal = !online && state.cheats.reveal;
        let oh = "";
        for (let k = 1; k < state.nPlayers; k++) {
            const s = (my + k) % state.nPlayers, p = state.players[s];
            const cur = state.turn === s && state.phase === "play";
            const shown = Math.min(p.hand.length, 8);
            let cards = "";
            for (let b = 0; b < shown; b++) cards += reveal ? '<span class="uno-mini">' + cardSvg(p.hand[b]) + "</span>" : '<i class="uno-back"></i>';
            if (p.hand.length > 8) cards += '<span class="uno-more">+' + (p.hand.length - 8) + "</span>";
            oh += '<div class="uno-opp' + (cur ? " cur" : "") + '"><div class="uno-opphead"><b>' + esc(p.name) + '</b><span class="uno-count">' + p.hand.length + "</span>" + (p.hand.length === 1 ? '<span class="uno-badge">UNO</span>' : "") + '</div><div class="uno-backs">' + cards + "</div></div>";
        }
        oppsEl.innerHTML = oh;

        /* tangan (scroll dipertahankan antar-render) */
        handUnoEl.hidden = me.hand.length !== 1;
        const prevScroll = handEl.scrollLeft;
        handEl.innerHTML = me.hand.map((c, i) => {
            const ok = myTurn && (free || canPlay(c, t, state.currentColor));
            const cls = "uno-card" + (ok ? " hot" : myTurn ? " off" : " idle") + (i === sel && myTurn ? " sel" : "");
            return '<button type="button" class="' + cls + '" data-i="' + i + '" aria-label="' + esc(cardLabel(c)) + (ok ? " (playable)" : "") + '">' + cardSvg(c) + "</button>";
        }).join("");
        handEl.scrollLeft = prevScroll;
        if (scrollSelFlag) {
            const el = handEl.querySelector(".sel");
            if (el) el.scrollIntoView({ block: "nearest", inline: "nearest" });
            scrollSelFlag = false;
        }

        /* kontrol HUD — update label span, jangan textContent tombol (icon!) */
        const blocked = helpOpen || cheatsOpen || paused;
        drawBtn.disabled = !myTurn || blocked;
        padPlayBtn.disabled = !myTurn || blocked || !(free || canPlay(me.hand[sel], t, state.currentColor));
        const restartLabel = restartBtn.querySelector(".uno-btn-label");
        if (restartLabel) restartLabel.textContent = online ? "Rematch" : "Restart";
        restartBtn.setAttribute("aria-label", online ? "Rematch" : "Restart");
        cheatsBtn.hidden = online;
        pauseBtn.disabled = online;

        /* overlay: help > cheats > pause > result */
        if (cheatsOpen && !online) renderCheats();
        renderOver();
        syncUI();
    }

    /* Overlays saling menekan. Label tombol di-update lewat span agar ikon utuh. */
    function syncUI() {
        const resultOpen = Boolean(state && state.phase === "over");
        ov.help.hidden = !helpOpen;
        ov.cheats.hidden = !cheatsOpen || helpOpen || online;
        ov.pause.hidden = !paused || helpOpen || cheatsOpen;
        ov.over.hidden = !resultOpen || helpOpen || cheatsOpen || paused;
        if (pauseBtn) {
            const label = pauseBtn.querySelector(".uno-btn-label");
            if (label) label.textContent = paused ? "Resume" : "Pause";
            pauseBtn.setAttribute("aria-label", paused ? "Resume" : "Pause");
            pauseBtn.title = (paused ? "Resume" : "Pause") + " (P)";
        }
        const cbtn = root.querySelector("[data-cheats]");
        if (cbtn) cbtn.classList.toggle("on", cheatsOpen || Boolean(state && !online && (state.cheats?.reveal || state.cheats?.freePlay)));
    }

    function toggleHelp(on) {
        helpOpen = typeof on === "boolean" ? on : !helpOpen;
        if (helpOpen) cheatsOpen = false;
        render();
    }

    function renderCheats() {
        const c = state.cheats, dis = state.phase === "over";
        const rows = [
            { k: "reveal", label: "Reveal bot hands", desc: "See every opponent card.", btn: c.reveal ? "ON" : "OFF", on: c.reveal, toggle: true },
            { k: "free", label: "Free play", desc: "Play any card, ignore matching.", btn: c.freePlay ? "ON" : "OFF", on: c.freePlay, toggle: true },
            { k: "wild", label: "Add a Wild", desc: "Puts a Wild in your hand.", btn: "+ Wild" },
            { k: "trim", label: "Burn 3 cards", desc: "Removes up to 3 cards (keeps 1).", btn: "Burn 3" },
            { k: "tax", label: "Tax the bots", desc: "Every bot draws 2 cards.", btn: "Tax bots" },
            { k: "win", label: "Instant win", desc: "End the round as the winner.", btn: "Win now" },
        ];
        cheatList.innerHTML = rows.map((r) =>
            '<div class="uno-cheat"><div><b>' + r.label + "</b><small>" + r.desc + "</small></div>" +
            '<button type="button" class="uno-btn' + (r.on ? " primary" : "") + '" data-act="cheat" data-cheat="' + r.k + '"' +
            (dis && !r.toggle ? " disabled" : "") + ">" + r.btn + "</button></div>"
        ).join("");
    }

    function renderOver() {
        if (!state || state.phase !== "over") return;
        const my = mySeat(), win = state.winner === my;
        overTitle.textContent = win ? "You win! 🎉" : state.players[state.winner].name + " wins";
        let reason;
        if (state.winReason === "stalemate") reason = "The piles ran dry — fewest cards takes the round.";
        else if (state.winReason === "cheat") reason = "Instant-win cheat was used.";
        else if (win) reason = "You shed every card first.";
        else reason = "They shed every card first. You still hold " + state.players[my].hand.length + " card" + (state.players[my].hand.length === 1 ? "" : "s") + ".";
        if (!online && state.cheated) reason += " Cheats were used — best level not recorded.";
        overReason.textContent = reason;
        overBtns.innerHTML = online
            ? '<button type="button" class="uno-btn primary" data-act="restart">Rematch</button>'
            : win
                ? '<button type="button" class="uno-btn primary" data-act="nextLevel">Next level →</button><button type="button" class="uno-btn" data-act="restart">Replay level</button>'
                : '<button type="button" class="uno-btn primary" data-act="restart">Retry same deal</button><span class="uno-ovhint">Same seed = same cards. You can beat it!</span>';
    }

    /* ---------------- events: klik / keyboard / wheel ---------------- */
    function handleClick(e) {
        if (e.target.closest("[data-exit]")) { onExit(); return; }
        if (e.target.closest("[data-help]")) { toggleHelp(); return; }
        if (e.target.closest("[data-cheats]")) {
            if (!online && !helpOpen) { cheatsOpen = !cheatsOpen; render(); }
            return;
        }
        if (e.target.closest("[data-pause]")) { togglePause(); return; }
        if (e.target.closest("[data-restart]")) { submitAction({ type: "restart" }); return; }
        if (e.target.closest("[data-resume]")) { togglePause(false); return; }
        const btn = e.target.closest("[data-act]");
        if (btn) {
            const a = btn.dataset.act;
            if (a === "draw") tryDraw();
            else if (a === "selPrev") moveSel(-1);
            else if (a === "selNext") moveSel(1);
            else if (a === "playSel") tryPlay(sel);
            else if (a === "help") { toggleHelp(); picker = null; }
            else if (a === "cheats") { if (!online && !helpOpen) { cheatsOpen = !cheatsOpen; render(); } }
            else if (a === "closeHelp") toggleHelp(false);
            else if (a === "closeCheats") { cheatsOpen = false; render(); }
            else if (a === "restart") submitAction({ type: "restart" });
            else if (a === "nextLevel") submitAction({ type: "nextLevel" });
            else if (a === "cancelColor") { picker = null; render(); }
            else if (a === "color") confirmColor(btn.dataset.color);
            else if (a === "cheat") submitAction({ type: "cheat", cheat: btn.dataset.cheat });
            return;
        }
        if (e.target === ov.help) { toggleHelp(false); return; }
        if (e.target === ov.cheats) { cheatsOpen = false; render(); return; }
        if (e.target === ov.pause) { togglePause(false); return; }
        const cardBtn = e.target.closest(".uno-card");
        if (cardBtn && cardBtn.dataset.i != null) tryPlay(+cardBtn.dataset.i);
    }

    function onKey(e) {
        if (destroyed || e.altKey || e.ctrlKey || e.metaKey) return;
        const tag = (e.target && e.target.tagName) || "";
        if (/INPUT|TEXTAREA|SELECT/.test(tag) || (e.target && e.target.isContentEditable)) return;
        const k = e.key, lk = (k || "").toLowerCase(), code = e.code || "";
        /* Prioritas: help → cheats → pause → Escape → aksi game */
        if (code === "KeyH" || lk === "h" || k === "?") {
            if (!e.repeat) toggleHelp();
            e.preventDefault(); return;
        }
        if (code === "KeyC" || lk === "c") {
            if (!e.repeat && !online && !helpOpen) { cheatsOpen = !cheatsOpen; render(); }
            e.preventDefault(); return;
        }
        if (code === "KeyP" || lk === "p") {
            if (!e.repeat && !helpOpen && !cheatsOpen) togglePause();
            e.preventDefault(); return;
        }
        if (k === "Escape") {
            if (picker) { picker = null; render(); }
            else if (helpOpen) toggleHelp(false);
            else if (cheatsOpen) { cheatsOpen = false; render(); }
            else if (paused) togglePause(false);
            e.preventDefault(); return;
        }
        if ((code === "KeyR" || lk === "r") && !e.repeat) {
            if (!helpOpen && !cheatsOpen) submitAction({ type: "restart" });
            e.preventDefault(); return;
        }
        /* Enter/Space pada tombol yang sedang fokus = klik normal (aksesibilitas) */
        if ((k === "Enter" || k === " ") && e.target.closest && e.target.closest("button")) return;
        if (helpOpen || cheatsOpen || paused) { e.preventDefault(); return; }
        if (picker) {
            const map = { 1: "red", 2: "yellow", 3: "green", 4: "blue" };
            if (map[k]) { confirmColor(map[k]); e.preventDefault(); }
            return;
        }
        if (k === "ArrowLeft") { moveSel(-1); e.preventDefault(); }
        else if (k === "ArrowRight") { moveSel(1); e.preventDefault(); }
        else if (k === "Enter" || k === " ") { tryPlay(sel); e.preventDefault(); }
        else if (lk === "d") { tryDraw(); e.preventDefault(); }
    }

    function handleWheel(e) {
        const h = e.target.closest && e.target.closest(".uno-hand");
        if (!h) return;
        e.preventDefault();
        h.scrollLeft += e.deltaY + e.deltaX;
    }

    root.addEventListener("click", handleClick);
    root.addEventListener("wheel", handleWheel, { passive: false });
    document.addEventListener("keydown", onKey);

    /* ---------------- wiring room / mode AI ---------------- */
    const sub = (fn) => { try { const off = fn(); if (typeof off === "function") offs.push(off); } catch (err) { console.warn(err); } };

    if (online) {
        sub(() => room.onRoom((nextRoom) => {
            roomData = nextRoom || roomData;
            if (room.isHost && state) { if (refreshNames()) publish(); else render(); }
            else render();
        }));
        if (room.isHost) {
            newGame(1, newSeed());
            publish();
            sub(() => room.onAction((action) => applyAction(action, 1)));
        } else {
            render(); /* menunggu state pertama dari host */
            sub(() => room.onState((nextState) => { if (!nextState) return; state = nextState; render(); }));
        }
    } else {
        newGame(1, newSeed());
        publish();
    }

    return {
        destroy() {
            destroyed = true;
            if (botTimer) clearTimeout(botTimer);
            for (const id of toastTimers) clearTimeout(id);
            toastTimers.clear();
            root.removeEventListener("click", handleClick);
            root.removeEventListener("wheel", handleWheel);
            document.removeEventListener("keydown", onKey);
            for (const off of offs) { try { off(); } catch (_) { } }
            offs.length = 0;
            state = null;
            root.innerHTML = "";
        },
    };
}