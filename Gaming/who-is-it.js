/*
 * Who Is It? (Digital Edition) — MVP v1.0
 * File: who-is-it.js  (id META harus sama dengan nama file tanpa .js)
 * Setelah menyalin file ini, jalankan: node tools/build-games-manifest.mjs
 */

import { iconSVG } from "../JS/icons.js";

export const META = {
    id: "who-is-it",
    name: "Who Is It?",
    category: "puzzle",
    catLabel: "Puzzle",
    desc: "Ask yes/no questions, flip down faces, and guess your opponent's mystery character. First to 5 correct identifications wins the match!",
    bg: ["#c7d2fe", "#818cf8"],
    bestKey: "whoIsItBest",
};

const TURN_MS = 30000;
const TARGET = 5;
const MAX_MISS = 3;
const MAX_SKIP = 3;
const DISCONNECT_MS = 60000;
const SOUND_KEY = "whoIsItSound";
const GUEST_ACTIONS = new Set(["flip", "ask", "guess", "next", "rematch", "rule", "heartbeat"]);

const CHARS = [
    { name: "Peter", gender: "m", hair: "white", style: "short", glasses: false, hat: false, hatType: null, facial: "none", skin: "light", earrings: false },
    { name: "Kevin", gender: "m", hair: "brown", style: "short", glasses: false, hat: false, hatType: null, facial: "mustache", skin: "medium", earrings: false },
    { name: "Paul", gender: "m", hair: "black", style: "short", glasses: true, hat: false, hatType: null, facial: "none", skin: "dark", earrings: false },
    { name: "Michael", gender: "m", hair: "brown", style: "curly", glasses: false, hat: false, hatType: null, facial: "beard", skin: "light", earrings: false },
    { name: "Emma", gender: "f", hair: "blonde", style: "long", glasses: false, hat: false, hatType: null, facial: "none", skin: "light", earrings: true },
    { name: "Richard", gender: "m", hair: "none", style: "bald", glasses: false, hat: false, hatType: null, facial: "beard", skin: "medium", earrings: false },
    { name: "Daniel", gender: "m", hair: "black", style: "short", glasses: false, hat: true, hatType: "cap", facial: "none", skin: "medium", earrings: false },
    { name: "Amy", gender: "f", hair: "red", style: "long", glasses: true, hat: false, hatType: null, facial: "none", skin: "light", earrings: false },
    { name: "Jenny", gender: "f", hair: "blonde", style: "short", glasses: false, hat: false, hatType: null, facial: "none", skin: "light", earrings: true },
    { name: "Joshua", gender: "m", hair: "black", style: "curly", glasses: false, hat: false, hatType: null, facial: "none", skin: "dark", earrings: false },
    { name: "John", gender: "m", hair: "blonde", style: "short", glasses: true, hat: false, hatType: null, facial: "mustache", skin: "light", earrings: false },
    { name: "Anne", gender: "f", hair: "black", style: "long", glasses: false, hat: false, hatType: null, facial: "none", skin: "medium", earrings: true },
    { name: "Kate", gender: "f", hair: "red", style: "long", glasses: false, hat: true, hatType: "beanie", facial: "none", skin: "light", earrings: false },
    { name: "Graham", gender: "m", hair: "white", style: "short", glasses: false, hat: false, hatType: null, facial: "mustache", skin: "light", earrings: false },
    { name: "Andrew", gender: "m", hair: "blonde", style: "curly", glasses: false, hat: false, hatType: null, facial: "none", skin: "light", earrings: false },
    { name: "Sarah", gender: "f", hair: "brown", style: "long", glasses: true, hat: false, hatType: null, facial: "none", skin: "medium", earrings: true },
    { name: "Thomas", gender: "m", hair: "none", style: "bald", glasses: true, hat: false, hatType: null, facial: "mustache", skin: "dark", earrings: false },
    { name: "Harry", gender: "m", hair: "red", style: "short", glasses: false, hat: false, hatType: null, facial: "beard", skin: "light", earrings: false },
    { name: "Neil", gender: "m", hair: "brown", style: "short", glasses: false, hat: true, hatType: "cap", facial: "none", skin: "medium", earrings: false },
    { name: "Simon", gender: "m", hair: "black", style: "short", glasses: true, hat: false, hatType: null, facial: "none", skin: "light", earrings: false },
    { name: "Megan", gender: "f", hair: "blonde", style: "long", glasses: false, hat: false, hatType: null, facial: "none", skin: "dark", earrings: true },
    { name: "Olivia", gender: "f", hair: "brown", style: "curly", glasses: false, hat: false, hatType: null, facial: "none", skin: "dark", earrings: false },
    { name: "Victor", gender: "m", hair: "white", style: "long", glasses: false, hat: false, hatType: null, facial: "beard", skin: "medium", earrings: false },
    { name: "Lucy", gender: "f", hair: "black", style: "short", glasses: false, hat: true, hatType: "beanie", facial: "none", skin: "light", earrings: false },
].map(function (c, i) { return Object.assign({ id: i }, c); });

const QUESTIONS = [
    { id: "woman", group: "Look", text: "Is your character a woman?", test: function (c) { return c.gender === "f"; } },
    { id: "skin-light", group: "Look", text: "Does your character have a light skin tone?", test: function (c) { return c.skin === "light"; } },
    { id: "skin-medium", group: "Look", text: "Does your character have a medium skin tone?", test: function (c) { return c.skin === "medium"; } },
    { id: "skin-dark", group: "Look", text: "Does your character have a dark skin tone?", test: function (c) { return c.skin === "dark"; } },
    { id: "hair-black", group: "Hair", text: "Does your character have black hair?", test: function (c) { return c.hair === "black"; } },
    { id: "hair-brown", group: "Hair", text: "Does your character have brown hair?", test: function (c) { return c.hair === "brown"; } },
    { id: "hair-blonde", group: "Hair", text: "Does your character have blonde hair?", test: function (c) { return c.hair === "blonde"; } },
    { id: "hair-red", group: "Hair", text: "Does your character have red hair?", test: function (c) { return c.hair === "red"; } },
    { id: "hair-white", group: "Hair", text: "Does your character have white hair?", test: function (c) { return c.hair === "white"; } },
    { id: "hair-short", group: "Hair", text: "Does your character have short hair?", test: function (c) { return c.style === "short"; } },
    { id: "hair-long", group: "Hair", text: "Does your character have long hair?", test: function (c) { return c.style === "long"; } },
    { id: "hair-curly", group: "Hair", text: "Does your character have curly hair?", test: function (c) { return c.style === "curly"; } },
    { id: "bald", group: "Hair", text: "Is your character bald?", test: function (c) { return c.style === "bald"; } },
    { id: "mustache", group: "Face", text: "Does your character have a mustache?", test: function (c) { return c.facial === "mustache"; } },
    { id: "beard", group: "Face", text: "Does your character have a beard?", test: function (c) { return c.facial === "beard"; } },
    { id: "facial", group: "Face", text: "Does your character have any facial hair?", test: function (c) { return c.facial !== "none"; } },
    { id: "glasses", group: "Accessories", text: "Does your character wear glasses?", test: function (c) { return c.glasses; } },
    { id: "hat", group: "Accessories", text: "Does your character wear a hat?", test: function (c) { return c.hat; } },
    { id: "earrings", group: "Accessories", text: "Does your character wear earrings?", test: function (c) { return c.earrings; } },
];
const QMAP = {};
QUESTIONS.forEach(function (q) { QMAP[q.id] = q; });

/* String UI dipusatkan di sini (localization-ready, English first). */
const STR = {
    ready: "Ready",
    connecting: "Connecting to room…",
    yourTurn: "Your turn",
    thinking: function (n) { return n + " is thinking…"; },
    roundOver: "Round over",
    matchOver: "Match over",
    passDevice: "Pass the device",
    yes: "YES",
    no: "NO",
    ask: "Ask",
    guessBtn: "Make a guess",
    cancelGuess: "Cancel guess",
    autoFlip: "Auto-flip",
    history: "Question history",
    noHistory: "No questions yet.",
    askHint: "Ask a question or make a guess. Tap cards to flip them down.",
    guessHint: "🎯 Tap the face you want to guess.",
    confirmHint: "Confirm your guess below.",
    guessQuestion: function (n) { return "Guess " + n + "?"; },
    confirmGuess: "Confirm guess",
    cancel: "Cancel",
    yourCard: "Your mystery card — the opponent must guess it!",
    hidden: "Hidden",
    facesLeft: function (n, k) { return n + ": " + k + " faces left"; },
    roundLabel: function (r) { return "Round " + r + " · first to 5"; },
    passTitle: "Pass the device",
    passHint: "Keep the mystery card secret! Hand the device over, then tap the button.",
    imReady: "I'm ready ▶",
    vsBot: "Play vs Bot",
    vsBotHint: "Solo · easy or normal AI",
    local2p: "2 Players (local)",
    localHint: "Pass & play on one device",
    startOnline: "Start match",
    startOnlineHint: "Both players are connected",
    waitHost: "Waiting for the host to start the match…",
    optMiss: "3 wrong guesses = lose round",
    botLevel: "Bot level:",
    easy: "Easy",
    normal: "Normal",
    best: function (n) { return "Best match win: " + n + " moves"; },
    howTo: "How to play (1 minute)",
    roundWin: function (n) { return n + " wins the round!"; },
    matchWin: function (n) { return n + " wins the match!"; },
    nextRound: "Next round ▶",
    playAgain: "Play again",
    reasonGuess: "Correct identification!",
    reasonMiss: function (n) { return n + " made 3 wrong guesses."; },
    reasonSkip: function (n) { return n + " missed 3 turns in a row."; },
    reasonDc: "Opponent disconnected for 60+ seconds.",
    guessedRight: function (n) { return "guessed " + n + " — correct!"; },
    guessedWrong: function (n) { return "guessed " + n + " — wrong!"; },
    skipped: function (n) { return n + " ran out of time — turn skipped."; },
    finalScore: "Final score",
    dcTitle: "Connection lost",
    dcBody: "Your opponent has been offline for more than 60 seconds. You win by forfeit.",
    soundOn: "Sound on",
    soundOff: "Sound off",
    helpTitle: "How to play",
    helpClose: "Close",
    helpGotIt: "Got it",
    helpHint: "Press H to reopen this guide.",
    pauseLabel: "Pause",
    resumeLabel: "Resume",
    pausedTitle: "Paused",
    pauseHint: "The timer is stopped. Resume when you are ready.",
    resumeBtn: "Resume ▶",
    restartLabel: "Restart",
    cheatsLabel: "Cheats",
    cheatReveal: "Opponent's mystery card",
    cheatAutoFlip: "Auto-flip",
    cheatSkip: "Skip current turn",
    cheatScore: "+1 score",
    cheatClose: "Close",
    rules: [
        "Each player secretly gets one mystery character. Your opponent must guess yours — and you must guess theirs.",
        "On your turn, ask ONE yes/no question about your opponent's character (hair, glasses, hat…). The game answers truthfully.",
        "Tap cards to flip down anyone who no longer matches. Tap again to flip them back up.",
        "Instead of asking, you may guess a character. A correct guess wins the round; a wrong guess uses up your turn.",
        "3 wrong guesses in one round = you lose the round. 3 skipped turns (30s timer) = you lose the round.",
        "Questions about names are not allowed — use a Guess instead. First player to win 5 rounds wins the match!",
    ],
};

/* Art wajah SVG prosedural & orisinal (deterministik per karakter). */
const SKIN = { light: "#ffd9b3", medium: "#e0a878", dark: "#8d5a3b" };
const HAIR = { black: "#2f2a33", brown: "#6b4226", blonde: "#e8c46b", red: "#c9502e", white: "#d9d9de", none: "#6b7280" };
const SHIRTS = ["#ef4444", "#3b82f6", "#10b981", "#f59e0b", "#8b5cf6", "#ec4899", "#14b8a6", "#f97316"];
const BGS = ["#fde68a", "#bfdbfe", "#bbf7d0", "#fbcfe8", "#ddd6fe", "#fed7aa", "#a5f3fc", "#fecaca"];
const EYES = ["#312e81", "#3f2d20", "#14532d", "#1e3a8a"];
const HATS = ["#dc2626", "#2563eb", "#059669", "#7c3aed"];
const FACE_CACHE = new Map();

function seeded(n) {
    let t = (n + 1) >>> 0;
    return function () { t = (t * 1664525 + 1013904223) >>> 0; return t / 4294967296; };
}

function faceSVG(c) {
    if (FACE_CACHE.has(c.id)) return FACE_CACHE.get(c.id);
    const rnd = seeded(c.id * 7 + 3);
    const skin = SKIN[c.skin];
    const hair = HAIR[c.hair] || "#6b7280";
    const shirt = SHIRTS[Math.floor(rnd() * SHIRTS.length)];
    const bg = BGS[Math.floor(rnd() * BGS.length)];
    const eye = EYES[Math.floor(rnd() * EYES.length)];
    const hatCol = HATS[Math.floor(rnd() * HATS.length)];
    const female = c.gender === "f";
    let s = '<svg viewBox="0 0 120 120" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="' + c.name + '">';
    s += '<rect width="120" height="120" fill="' + bg + '"/>';
    if (c.style === "long") s += '<rect x="28" y="38" width="64" height="64" rx="22" fill="' + hair + '"/>';
    s += '<path d="M20 120 Q20 96 42 92 L78 92 Q100 96 100 120 Z" fill="' + shirt + '"/>';
    s += '<rect x="52" y="76" width="16" height="20" rx="6" fill="' + skin + '"/>';
    s += '<circle cx="33" cy="58" r="6" fill="' + skin + '"/><circle cx="87" cy="58" r="6" fill="' + skin + '"/>';
    if (c.earrings) s += '<circle cx="33" cy="66" r="2.6" fill="#fbbf24"/><circle cx="87" cy="66" r="2.6" fill="#fbbf24"/>';
    s += '<ellipse cx="60" cy="58" rx="26" ry="30" fill="' + skin + '"/>';
    if (c.style === "bald") s += '<path d="M46 34 Q52 29 58 31" stroke="#ffffff88" stroke-width="3" fill="none" stroke-linecap="round"/>';
    if (c.style === "short" || c.style === "long") s += '<path d="M33 56 Q33 26 60 26 Q87 26 87 56 Q80 42 60 42 Q40 42 33 56 Z" fill="' + hair + '"/>';
    if (c.style === "curly") s += '<g fill="' + hair + '"><circle cx="36" cy="42" r="9"/><circle cx="46" cy="32" r="9"/><circle cx="60" cy="28" r="9"/><circle cx="74" cy="32" r="9"/><circle cx="84" cy="42" r="9"/><circle cx="32" cy="52" r="8"/><circle cx="88" cy="52" r="8"/></g>';
    const brow = c.style === "bald" ? "#5b6472" : hair;
    s += '<rect x="44" y="47" width="12" height="3" rx="1.5" fill="' + brow + '"/><rect x="64" y="47" width="12" height="3" rx="1.5" fill="' + brow + '"/>';
    s += '<circle cx="50" cy="56" r="5" fill="#fff"/><circle cx="70" cy="56" r="5" fill="#fff"/><circle cx="50" cy="56" r="2.4" fill="' + eye + '"/><circle cx="70" cy="56" r="2.4" fill="' + eye + '"/>';
    if (female) s += '<path d="M44 51 L41 49 M76 51 L79 49" stroke="#334155" stroke-width="1.6" stroke-linecap="round"/>';
    s += '<path d="M58 60 Q56 66 60 68" stroke="#00000033" stroke-width="2.4" fill="none" stroke-linecap="round"/>';
    s += '<path d="M50 76 Q60 84 70 76" stroke="' + (female ? "#be185d" : "#7f1d1d") + '" stroke-width="' + (female ? 3 : 2.6) + '" fill="none" stroke-linecap="round"/>';
    if (c.facial === "mustache") s += '<path d="M48 72 Q60 66 72 72 Q66 77 60 75 Q54 77 48 72 Z" fill="' + hair + '"/>';
    if (c.facial === "beard") s += '<path d="M34 60 Q34 94 60 96 Q86 94 86 60 Q86 80 78 84 Q70 88 60 88 Q50 88 42 84 Q34 80 34 60 Z" fill="' + hair + '"/>';
    if (rnd() < 0.35 && c.skin === "light") s += '<g fill="#00000026"><circle cx="44" cy="64" r="1.1"/><circle cx="48" cy="66" r="1.1"/><circle cx="42" cy="67" r="1.1"/><circle cx="76" cy="64" r="1.1"/><circle cx="72" cy="66" r="1.1"/><circle cx="78" cy="67" r="1.1"/></g>';
    if (c.glasses) s += '<g fill="none" stroke="#1f2937" stroke-width="2.4"><circle cx="50" cy="56" r="8"/><circle cx="70" cy="56" r="8"/><path d="M58 56 L62 56 M42 56 L34 54 M78 56 L86 54"/></g>';
    if (c.hat) {
        if (c.hatType === "beanie") {
            s += '<path d="M32 44 Q32 16 60 16 Q88 16 88 44 Z" fill="' + hatCol + '"/><rect x="31" y="38" width="58" height="9" rx="4" fill="#00000033"/><circle cx="60" cy="14" r="6" fill="#fff"/>';
        } else {
            s += '<path d="M32 42 Q32 16 60 16 Q88 16 88 42 Z" fill="' + hatCol + '"/><rect x="26" y="40" width="68" height="7" rx="3.5" fill="' + hatCol + '"/><rect x="26" y="40" width="68" height="7" rx="3.5" fill="#00000022"/>';
        }
    }
    s += "</svg>";
    FACE_CACHE.set(c.id, s);
    return s;
}

export function mount(root, context) {
    context = context || {};
    const mode = context.mode || "ai";
    const room = context.room || null;
    const playerName = context.playerName || "Player";
    const onExit = context.onExit || function () { };
    const online = mode === "room" && Boolean(room);
    const playerIndex = online && !room.isHost ? 1 : 0;
    let roomData = (room && room.room) || null;
    let state = null;

    let destroyed = false;
    let handoff = false;          // layar oper-device (mode lokal 2 pemain)
    let botTimer = null;
    let lastKey = "";
    let prevTk = "";
    let prevPhase = "";
    const ui = { guessMode: false, pendingGuess: null, lastQ: QUESTIONS[0].id, disconnected: false };
    let muted = false;
    try { muted = localStorage.getItem(SOUND_KEY) === "1"; } catch (e) { }
    let audio = null;

    /* UI shell state (tidak mengubah mesin game) */
    let helpOpen = false;
    let cheatsOpen = false;
    let paused = false;
    let pausedAt = 0;
    const unsubs = [];
    let seenHelp = true;
    try { seenHelp = localStorage.getItem("whoIsItHelpSeen") === "1"; } catch (e) { seenHelp = true; }
    if (!seenHelp) {
        helpOpen = true;
        try { localStorage.setItem("whoIsItHelpSeen", "1"); } catch (e) { /* storage blocked */ }
    }

    root.innerHTML = `
    <style>
      .whi-app{min-height:0}
      .whi-app [hidden]{display:none!important}
      .whi-board{position:relative;display:flex;flex-direction:column;overflow:hidden;padding:0}
      .whi-screen{flex:1 1 auto;min-height:0;overflow:auto;padding:12px}
      .whi-screen:has(.whi-result){display:grid;place-items:center}
      .whi-wrap{display:flex;flex-direction:column;gap:12px}
      .whi-top{display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap}
      .whi-player{display:flex;flex-direction:column;gap:3px;padding:6px 10px;border-radius:10px;background:#f1f5f9;min-width:110px;font-size:13px}
      .whi-player.active{background:#eef2ff;box-shadow:inset 0 0 0 2px #6366f1}
      .whi-pips{display:inline-flex;gap:3px;min-height:10px}
      .whi-pip{width:10px;height:10px;border-radius:50%;background:#cbd5e1;display:inline-block}
      .whi-pip.on{background:#6366f1}
      .whi-miss .whi-pip.on{background:#f59e0b}
      .whi-round{font-size:12px;color:#64748b;font-weight:600}
      .whi-secrets{display:flex;gap:10px;flex-wrap:wrap}
      .whi-secret{flex:1;min-width:170px;display:flex;gap:10px;align-items:center;background:#f1f5f9;border-radius:12px;padding:8px;font-size:12px;color:#475569}
      .whi-mini{display:inline-flex;flex-direction:column;width:56px;flex:none;border-radius:8px;overflow:hidden;background:#fff;box-shadow:0 1px 3px rgba(15,23,42,.2)}
      .whi-mini svg{width:100%;height:52px;display:block}
      .whi-mini-name{font-size:10px;font-weight:700;text-align:center;padding:2px;color:#1e293b;background:#fff}
      .whi-mini-hidden{background:linear-gradient(135deg,#818cf8,#6366f1);align-items:center;justify-content:center;height:70px}
      .whi-mini-hidden .whi-q{font-size:26px;font-weight:800;color:#fff}
      .whi-mini-hidden .whi-mini-name{background:transparent;color:#e0e7ff}
      .whi-answer{min-height:42px;display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:8px 12px;border-radius:12px;background:#f8fafc;border:1px dashed #cbd5e1;font-size:14px;color:#1e293b}
      .whi-badge{font-weight:800;padding:2px 10px;border-radius:99px;color:#fff;font-size:13px}
      .whi-badge.yes{background:#0284c7}
      .whi-badge.no{background:#ea580c}
      .whi-grid{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:8px}
      @media(max-width:620px){.whi-grid{grid-template-columns:repeat(4,minmax(0,1fr));gap:6px}}
      .whi-card{position:relative;aspect-ratio:3/4;min-height:44px;border:0;padding:0;background:transparent;cursor:pointer;perspective:700px;-webkit-tap-highlight-color:transparent;font:inherit}
      .whi-card-inner{position:absolute;inset:0;transform-style:preserve-3d;transition:transform .45s cubic-bezier(.4,.2,.2,1)}
      .whi-card.is-down .whi-card-inner{transform:rotateX(180deg)}
      .whi-face{position:absolute;inset:0;backface-visibility:hidden;-webkit-backface-visibility:hidden;border-radius:10px;overflow:hidden;display:flex;flex-direction:column;background:#fff;box-shadow:0 1px 3px rgba(15,23,42,.18)}
      .whi-face svg{width:100%;flex:1;min-height:0;display:block}
      .whi-back{transform:rotateX(180deg);background:repeating-linear-gradient(45deg,#e0e7ff 0 8px,#eef2ff 8px 16px);align-items:center;justify-content:center;gap:4px}
      .whi-name{font-size:11px;font-weight:600;text-align:center;padding:3px 2px;background:#fff;color:#1e293b;border-top:1px solid #e2e8f0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .whi-back .whi-name{background:transparent;border:0;color:#64748b}
      .whi-back-mark{font-size:22px;color:#94a3b8;font-weight:800;line-height:1}
      .whi-card.is-pending .whi-front{outline:3px solid #6366f1;outline-offset:-3px}
      .whi-card:focus-visible{outline:3px solid #6366f1;outline-offset:2px;border-radius:10px}
      .whi-controls{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
      .whi-controls select{flex:1;min-width:180px;min-height:44px;font-size:16px;border-radius:10px;border:1px solid #cbd5e1;padding:0 10px;background:#fff;color:#1e293b}
      .whi-btn{min-height:44px;padding:0 16px;border-radius:10px;border:1px solid transparent;font-weight:700;font-size:14px;cursor:pointer;background:#6366f1;color:#fff}
      .whi-btn.secondary{background:#e2e8f0;color:#1e293b}
      .whi-btn.warn{background:#ea580c;color:#fff}
      .whi-btn:disabled{opacity:.45;cursor:not-allowed}
      .whi-check{display:inline-flex;align-items:center;gap:6px;font-size:13px;color:#475569;min-height:32px}
      .whi-check input{width:18px;height:18px}
      .whi-guessbar{display:flex;align-items:center;gap:10px;flex-wrap:wrap;background:#eef2ff;border:2px solid #6366f1;border-radius:12px;padding:8px;font-size:14px;font-weight:600}
      /* HUD bar (one row on desktop, 1-2 rows on mobile) */
      .whi-hud{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:10px;font:600 11px/1 ui-monospace,SFMono-Regular,Menlo,monospace}
      .whi-chip{display:inline-flex;align-items:center;gap:6px;padding:5px 9px;border:1px solid #e2e8f0;border-radius:999px;background:#fff;color:#64748b;white-space:nowrap;max-width:190px;overflow:hidden;text-overflow:ellipsis}
      .whi-chip b{color:#1e293b;font-weight:700;font-variant-numeric:tabular-nums}
      .whi-sound{cursor:pointer;font:inherit;min-height:32px}
      .whi-icon{display:inline-flex;align-items:center}
      .whi-icon svg{display:block;flex:none}
      .whi-timebar{display:inline-block;width:46px;height:5px;border-radius:99px;background:#e2e8f0;overflow:hidden}
      .whi-timebar i{display:block;height:100%;width:100%;background:#6366f1;border-radius:99px;transition:width .25s linear}
      .whi-timebar.low i{background:#f59e0b}
      .whi-spacer{flex:1 1 auto}
      .whi-icon-btn{display:inline-flex;align-items:center;gap:6px}
      .whi-icon-btn svg{flex:none;display:block}
      .whi-overlay{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;z-index:5;border-radius:12px;padding:12px}
      .whi-solid{background:#f8fafc}
      .whi-overlay-card{background:#fff;border-radius:16px;box-shadow:0 10px 30px rgba(15,23,42,.15);padding:20px;max-width:min(520px,100%);width:100%;text-align:center;display:flex;flex-direction:column;gap:12px;align-items:center;max-height:100%;overflow:hidden}
      .whi-overlay-card h3{margin:0;font-size:20px;color:#1e293b}
      .whi-overlay-card p{margin:0}
      .whi-head-inline{display:flex;align-items:center;justify-content:space-between;gap:10px;width:100%}
      .whi-foot-inline{display:flex;align-items:center;justify-content:space-between;gap:10px;width:100%;padding-top:10px;border-top:1px solid #e2e8f0}
      .whi-help{font-size:13px;color:#475569;background:#f8fafc;border-radius:12px;padding:10px 12px;text-align:left;width:100%;min-height:0;overflow:auto}
      .whi-help ul{margin:8px 0 0;padding-left:18px;display:flex;flex-direction:column;gap:6px}
      .whi-cheats{display:flex;flex-direction:column;gap:10px;width:100%;min-height:0;overflow:auto;text-align:left}
      .whi-cheat-row{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
      .whi-cheat-row .whi-mini{width:64px}
      .whi-result{display:flex;justify-content:center;padding:12px}
      .whi-reveal{display:flex;gap:16px;justify-content:center}
      .whi-reveal>div{display:flex;flex-direction:column;align-items:center;gap:4px;font-size:12px;color:#475569}
      .whi-muted{color:#64748b;font-size:13px;margin:0}
      .whi-log{font-size:13px;color:#475569}
      .whi-log ol{margin:6px 0 0;padding-left:18px;display:flex;flex-direction:column;gap:4px}
      .whi-setup{display:flex;flex-direction:column;gap:14px}
      .whi-faces-row{display:flex;gap:8px}
      .whi-modes{display:flex;gap:10px;flex-wrap:wrap}
      .whi-mode-btn{flex:1;min-width:170px;min-height:84px;border-radius:14px;border:2px solid #e2e8f0;background:#fff;cursor:pointer;font-weight:700;font-size:15px;display:flex;flex-direction:column;gap:4px;align-items:center;justify-content:center;color:#1e293b;padding:10px}
      .whi-mode-btn:hover{border-color:#6366f1}
      .whi-mode-btn small{font-weight:500;color:#64748b}
      .whi-options{display:flex;gap:14px;flex-wrap:wrap;align-items:center;font-size:14px}
      .whi-options select{min-height:36px;border-radius:8px;border:1px solid #cbd5e1;padding:0 8px;font-size:14px}
      .whi-big{font-size:40px;line-height:1}
      /* --- fill height + mobile refinements (keep LAST) --- */
      .whi-app.whi-app > .whi-board{flex:1 1 auto;min-height:0;aspect-ratio:auto;padding:0}
      .whi-app .whi-hud .whi-btn{min-height:32px}
      @media (max-width:640px){
        .whi-app .whi-hud{gap:5px;margin-bottom:8px}
        .whi-app .whi-hud .whi-chip{padding:4px 6px;font-size:9px;max-width:120px}
        .whi-app .whi-hud .whi-chip[data-hud-wrap="status"],
        .whi-app .whi-hud .whi-chip[data-hud-wrap="miss"]{display:none}
        .whi-app .whi-hud .whi-btn,
        .whi-app .whi-hud .whi-sound{min-height:32px;padding:5px 9px;font-size:9px}
        .whi-app .whi-hud .whi-btn-label,
        .whi-app .whi-hud .whi-spacer{display:none}
        .whi-app .whi-overlay{padding:8px}
        .whi-app .whi-overlay-card{width:100%;height:100%;max-height:100%;padding:12px;border-radius:12px}
        .whi-app .whi-help,
        .whi-app .whi-cheats{scrollbar-width:none}
        .whi-app .whi-help::-webkit-scrollbar,
        .whi-app .whi-cheats::-webkit-scrollbar{display:none}
        .whi-app .whi-screen{padding:8px}
        .whi-app .whi-card{min-height:44px}
      }
    </style>
    <div class="game-app whi-app game-fill" data-whi>
      <div class="whi-hud" role="toolbar" aria-label="Game controls">
        <span class="whi-chip" data-hud-wrap="status">STATUS <b data-hud="status">${STR.ready}</b></span>
        <span class="whi-chip">ROUND <b data-hud="round">–</b></span>
        <span class="whi-chip"><span data-hud="p1-name">P1</span> <b data-hud="p1">0</b></span>
        <span class="whi-chip"><span data-hud="p2-name">P2</span> <b data-hud="p2">0</b></span>
        <span class="whi-chip" data-hud-wrap="miss">MISS <b data-hud="miss">0/${MAX_MISS}</b></span>
        <span class="whi-chip whi-chip-time">TIME <b data-hud="timer">–</b><span class="whi-timebar"><i data-hud="timer-bar"></i></span></span>
        <button class="whi-chip whi-sound" type="button" data-sound aria-label="${muted ? STR.soundOff : STR.soundOn}" title="Toggle sound">
          <span class="whi-icon" data-hud="sound-icon">${iconSVG(muted ? "volumeX" : "volume", { size: 14 })}</span><span class="whi-btn-label" data-hud="sound">${muted ? STR.soundOff : STR.soundOn}</span>
        </button>
        <span class="whi-spacer"></span>
        <button class="whi-btn whi-icon-btn" type="button" data-help aria-label="How to play" title="How to play (H)">${iconSVG("helpCircle", { size: 14 })}<span class="whi-btn-label">Help</span></button>
        <button class="whi-btn whi-icon-btn" type="button" data-cheats aria-label="Cheats" title="Cheats (C)">${iconSVG("wrench", { size: 14 })}<span class="whi-btn-label">Cheats</span></button>
        <button class="whi-btn whi-icon-btn" type="button" data-pause aria-label="Pause" title="Pause (P)">${iconSVG("pause", { size: 14 })}<span class="whi-btn-label">Pause</span></button>
        <button class="whi-btn whi-icon-btn" type="button" data-restart aria-label="Restart" title="Restart (R)">${iconSVG("refresh", { size: 14 })}<span class="whi-btn-label">Restart</span></button>
        <button class="whi-btn whi-icon-btn" type="button" data-exit aria-label="Exit game" title="Exit game">${iconSVG("logOut", { size: 14 })}<span class="whi-btn-label">Exit game</span></button>
      </div>
      <section class="game-panel whi-board" data-board>
        <div class="whi-screen" data-screen></div>
        <div class="whi-overlay whi-solid" data-handoff hidden>
          <div class="whi-overlay-card">
            <div class="whi-big">🔄</div><h3>${STR.passTitle}</h3>
            <p><b data-handoff-name></b></p>
            <p class="whi-muted">${STR.passHint}</p>
            <button type="button" class="whi-btn" data-ready>${STR.imReady}</button>
          </div>
        </div>
        <div class="whi-overlay whi-solid" data-ov="pause" hidden>
          <div class="whi-overlay-card">
            <div class="whi-big">⏸</div><h3>${STR.pausedTitle}</h3>
            <p class="whi-muted">${STR.pauseHint}</p>
            <button type="button" class="whi-btn" data-resume>${STR.resumeBtn}</button>
          </div>
        </div>
        <div class="whi-overlay whi-solid" data-ov="cheat" hidden>
          <div class="whi-overlay-card">
            <div class="whi-head-inline"><h3>${STR.cheatsLabel}</h3><button class="whi-btn secondary" type="button" data-close aria-label="${STR.cheatClose}">${STR.cheatClose}</button></div>
            <div class="whi-cheats" data-cheat-body></div>
          </div>
        </div>
        <div class="whi-overlay whi-solid" data-ov="help" hidden>
          <div class="whi-overlay-card">
            <div class="whi-head-inline"><h3>${STR.helpTitle}</h3><button class="whi-btn secondary" type="button" data-help-close aria-label="${STR.helpClose}">${STR.helpClose}</button></div>
            <div class="whi-help"><ul>${STR.rules.map(function (r) { return "<li>" + r + "</li>"; }).join("")}</ul></div>
            <div class="whi-foot-inline"><span class="whi-muted">${STR.helpHint}</span><button class="whi-btn" type="button" data-help-close>${STR.helpGotIt}</button></div>
          </div>
        </div>
      </section>
    </div>`;

    const screen = root.querySelector("[data-screen]");
    const ov = {
        handoff: root.querySelector("[data-handoff]"),
        pause: root.querySelector('[data-ov="pause"]'),
        cheat: root.querySelector('[data-ov="cheat"]'),
        help: root.querySelector('[data-ov="help"]'),
    };

    function isPaused() { return online && !room.isHost ? Boolean(state && state.paused) : paused; }
    function canPause() { return !online || room.isHost; }
    function syncSound() {
        const btn = root.querySelector("[data-sound]");
        if (!btn) return;
        const label = btn.querySelector(".whi-btn-label");
        if (label) label.textContent = muted ? STR.soundOff : STR.soundOn;
        btn.setAttribute("aria-label", muted ? STR.soundOff : STR.soundOn);
        const icon = btn.querySelector("[data-hud='sound-icon']");
        if (icon) icon.innerHTML = iconSVG(muted ? "volumeX" : "volume", { size: 14 });
    }

    /* ------------------------- util & tampilan ------------------------- */

    function local2p() { return !online && state && !state.vsBot; }
    function viewerIndex() {
        if (online) return playerIndex;
        if (local2p() && state.phase !== "setup") return state.turn;
        return 0;
    }
    function nameOf(i) {
        if (online) return i === playerIndex ? playerName : (i === 0 ? "Host" : "Guest");
        if (i === 0) return playerName;
        return state && !state.vsBot ? "Player 2" : "Bot";
    }
    function canAct() {
        return Boolean(state) && state.phase === "playing" && !handoff && state.turn === viewerIndex();
    }
    function authority() { return !online || room.isHost; }

    function pips(n, total) {
        let out = "";
        for (let i = 0; i < total; i++) out += '<span class="whi-pip' + (i < n ? " on" : "") + '"></span>';
        return out;
    }
    function miniCard(c) {
        return '<span class="whi-mini">' + faceSVG(c) + '<span class="whi-mini-name">' + c.name + "</span></span>";
    }
    function hiddenMini() {
        return '<span class="whi-mini whi-mini-hidden"><span class="whi-q">?</span><span class="whi-mini-name">' + STR.hidden + "</span></span>";
    }
    function cardHTML(c) {
        return '<button type="button" class="whi-card" data-card="' + c.id + '" aria-pressed="false" aria-label="' + c.name + '">' +
            '<span class="whi-card-inner">' +
            '<span class="whi-face whi-front">' + faceSVG(c) + '<span class="whi-name">' + c.name + "</span></span>" +
            '<span class="whi-face whi-back"><span class="whi-back-mark">✕</span><span class="whi-name">' + c.name + "</span></span>" +
            "</span></button>";
    }
    function eventHTML(e) {
        if (e.t === "qa") {
            const q = QMAP[e.q];
            return "<span>" + nameOf(e.a) + ': “' + q.text + '”</span> <b class="whi-badge ' + (e.ans ? "yes" : "no") + '">' + (e.ans ? STR.yes : STR.no) + "</b>";
        }
        if (e.t === "guess") {
            return e.ok
                ? "🎉 <b>" + nameOf(e.a) + "</b> " + STR.guessedRight(CHARS[e.card].name)
                : "❌ <b>" + nameOf(e.a) + "</b> " + STR.guessedWrong(CHARS[e.card].name);
        }
        if (e.t === "skip") return "⏱ " + STR.skipped(nameOf(e.a));
        return "";
    }
    function reasonText(r) {
        if (r.reason === "guess") return STR.reasonGuess;
        if (r.reason === "misses") return STR.reasonMiss(nameOf(1 - r.winner));
        if (r.reason === "timeout") return STR.reasonSkip(nameOf(1 - r.winner));
        return STR.reasonDc;
    }
    function readBest() {
        try { const n = Number(localStorage.getItem(META.bestKey)); return n > 0 ? n : null; } catch (e) { return null; }
    }

    function sfx(kind) {
        if (muted) return;
        try {
            const AC = window.AudioContext || window.webkitAudioContext;
            if (!AC) return;
            audio = audio || new AC();
            if (audio.state === "suspended") audio.resume();
            const notes = {
                flip: [[320, 0.05]],
                yes: [[660, 0.09], [880, 0.12]],
                no: [[330, 0.12], [247, 0.14]],
                win: [[523, 0.12], [659, 0.12], [784, 0.2]],
                lose: [[392, 0.15], [311, 0.2]],
            }[kind] || [];
            const t = audio.currentTime;
            let off = 0;
            for (const nd of notes) {
                const o = audio.createOscillator();
                const g = audio.createGain();
                o.type = "sine";
                o.frequency.value = nd[0];
                g.gain.setValueAtTime(0.0001, t + off);
                g.gain.exponentialRampToValueAtTime(0.18, t + off + 0.01);
                g.gain.exponentialRampToValueAtTime(0.0001, t + off + nd[1]);
                o.connect(g);
                g.connect(audio.destination);
                o.start(t + off);
                o.stop(t + off + nd[1] + 0.02);
                off += nd[1] * 0.9;
            }
        } catch (e) { }
    }

    /* --------------------------- state & engine ------------------------ */

    function initialState() {
        return {
            phase: "setup",           // setup | playing | roundEnd | matchEnd
            vsBot: true,
            round: 0,
            starter0: 0,
            secrets: [null, null],    // FR-1: satu kartu rahasia per pemain, tanpa duplikat
            scores: [0, 0],
            actions: [0, 0],          // jumlah pertanyaan+tebakan (untuk best score)
            flipped: [new Array(24).fill(false), new Array(24).fill(false)],
            wrong: [[], []],
            skipped: [0, 0],
            log: [],
            turn: 0,
            turnEndsAt: null,
            roundResult: null,
            matchWinner: null,
            settings: { threeMiss: true, autoFlip: [false, false], difficulty: "easy" },
            lastSeen: [Date.now(), null],
            updatedAt: Date.now(),
        };
    }

    function freshRound(s, roundNo) {
        const ids = [];
        for (let i = 0; i < 24; i++) ids.push(i);
        for (let i = ids.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            const tmp = ids[i]; ids[i] = ids[j]; ids[j] = tmp;
        }
        s.round = roundNo;
        s.secrets = [ids[0], ids[1]];
        s.turn = (s.starter0 + roundNo - 1) % 2;   // koin acak di awal, lalu bergantian
        s.flipped = [new Array(24).fill(false), new Array(24).fill(false)];
        s.wrong = [[], []];
        s.skipped = [0, 0];
        s.log = [];
        s.roundResult = null;
        s.turnEndsAt = Date.now() + TURN_MS;
        s.phase = "playing";
        if (s.vsBot) s.settings.autoFlip[1] = true; // bot selalu merapikan papannya
        if (!online && !s.vsBot) handoff = true;
    }

    function candidatesFor(actor) {
        let list = CHARS.slice();
        for (const e of state.log) {
            if (e.t === "qa" && e.a === actor) {
                const q = QMAP[e.q];
                list = list.filter(function (c) { return Boolean(q.test(c)) === e.ans; });
            } else if (e.t === "guess" && e.a === actor && !e.ok) {
                list = list.filter(function (c) { return c.id !== e.card; });
            }
        }
        return list;
    }

    function autoEliminate(actor) {
        const keep = new Set(candidatesFor(actor).map(function (c) { return c.id; }));
        for (let i = 0; i < 24; i++) state.flipped[actor][i] = !keep.has(i);
    }

    function passTurn() {
        state.turn = 1 - state.turn;
        state.turnEndsAt = Date.now() + TURN_MS;
        if (local2p()) handoff = true;
    }

    function endRound(winner, reason) {
        state.roundResult = { winner: winner, reason: reason };
        state.turnEndsAt = null;
        if (state.scores[winner] >= TARGET) {
            state.phase = "matchEnd";
            state.matchWinner = winner;
        } else {
            state.phase = "roundEnd";
        }
        sfx(winner === viewerIndex() || local2p() ? "win" : "lose");
    }

    function applyAction(action, actor) {
        if (destroyed || !state || !action) return;
        switch (action.type) {
            case "start": {
                if (state.phase !== "setup") return;
                if (online && actor !== 0) return;
                state.vsBot = !online && action.vsBot === true;
                state.settings.threeMiss = action.threeMiss !== false;
                state.settings.difficulty = action.difficulty === "normal" ? "normal" : "easy";
                state.settings.autoFlip = [false, state.vsBot];
                state.scores = [0, 0];
                state.actions = [0, 0];
                state.matchWinner = null;
                state.starter0 = Math.random() < 0.5 ? 0 : 1;
                freshRound(state, 1);
                break;
            }
            case "flip": {                                     // FR-3: bebas flip kapan saja
                if (state.phase !== "playing") return;
                const i = Number(action.card);
                if (!(i >= 0 && i < 24)) return;
                state.flipped[actor][i] = !state.flipped[actor][i];
                sfx("flip");
                break;
            }
            case "ask": {                                      // FR-5: jawaban otomatis & jujur
                if (state.phase !== "playing" || actor !== state.turn) return;
                const q = QMAP[action.qid];
                if (!q) return;
                const ans = Boolean(q.test(CHARS[state.secrets[1 - actor]]));
                state.log.push({ t: "qa", a: actor, q: action.qid, ans: ans });
                state.actions[actor]++;
                state.skipped[actor] = 0;
                if (state.settings.autoFlip[actor]) autoEliminate(actor);
                sfx(ans ? "yes" : "no");
                passTurn();
                break;
            }
            case "guess": {                                    // FR-6: validasi & poin langsung
                if (state.phase !== "playing" || actor !== state.turn) return;
                const i = Number(action.card);
                if (!(i >= 0 && i < 24)) return;
                state.actions[actor]++;
                state.skipped[actor] = 0;
                if (i === state.secrets[1 - actor]) {
                    state.log.push({ t: "guess", a: actor, card: i, ok: true });
                    state.scores[actor]++;
                    endRound(actor, "guess");
                } else {
                    state.log.push({ t: "guess", a: actor, card: i, ok: false });
                    state.wrong[actor].push(i);
                    if (state.settings.threeMiss && state.wrong[actor].length >= MAX_MISS) endRound(1 - actor, "misses");
                    else passTurn();
                }
                break;
            }
            case "timeout": {                                  // FR-9: auto-skip saat waktu habis
                if (state.phase !== "playing" || actor !== state.turn) return;
                state.skipped[actor]++;
                state.log.push({ t: "skip", a: actor });
                if (state.skipped[actor] >= MAX_SKIP) endRound(1 - actor, "timeout");
                else passTurn();
                break;
            }
            case "next": {
                if (state.phase !== "roundEnd") return;
                freshRound(state, state.round + 1);
                break;
            }
            case "rematch": {
                if (state.phase !== "matchEnd") return;
                state.scores = [0, 0];
                state.actions = [0, 0];
                state.matchWinner = null;
                state.starter0 = Math.random() < 0.5 ? 0 : 1;
                freshRound(state, 1);
                break;
            }
            case "rule": {
                if (action.key === "autoFlip") state.settings.autoFlip[actor] = Boolean(action.value);
                break;
            }
            case "heartbeat": {
                state.lastSeen[actor] = Date.now();
                break;
            }
            case "forfeit": {                                  // menang karena lawan disconnect
                if (!online || actor !== 0) return;
                if (state.phase === "setup" || state.phase === "matchEnd") return;
                state.matchWinner = 0;
                state.roundResult = { winner: 0, reason: "disconnect" };
                state.phase = "matchEnd";
                break;
            }
            default: return;
        }
        publish();
    }

    function publicState() {
        // Kartu rahasia HOST tidak dikirim ke guest selama ronde berjalan
        // (semua jawaban dihitung oleh host). Di akhir ronde, keduanya dibuka.
        const base = (state.phase === "playing" || state.phase === "setup")
            ? Object.assign({}, state, { secrets: [null, state.secrets[1]] })
            : Object.assign({}, state);
        // Flag UI (bukan aturan mesin) agar guest melihat overlay pause host.
        return Object.assign(base, { paused: paused });
    }

    function pushState() {
        if (online && room.isHost && room.publishState) room.publishState(publicState()).catch(console.warn);
    }

    function publish() {
        if (!state) return;
        state.updatedAt = Date.now();
        render();
        pushState();
    }

    function submitAction(action) {
        if (!action || (isPaused() && action.type !== "heartbeat")) return;
        if (online && !room.isHost) {
            room.sendAction(action).catch(console.warn);
            return;
        }
        applyAction(action, viewerIndex());
    }

    /* ------------------------------ bot AI ----------------------------- */

    function botMove() {
        if (destroyed || !state || online || !state.vsBot || isPaused()) return;
        if (state.phase !== "playing" || state.turn !== 1) return;
        const cands = candidatesFor(1);
        const hard = state.settings.difficulty === "normal";
        let act = null;
        if (cands.length === 1) {
            act = { type: "guess", card: cands[0].id };
        } else if (cands.length > 0 && cands.length <= (hard ? 2 : 3) && Math.random() < (hard ? 0.8 : 0.25)) {
            act = { type: "guess", card: cands[Math.floor(Math.random() * cands.length)].id };
        } else {
            const asked = new Set(state.log.filter(function (e) { return e.t === "qa" && e.a === 1; }).map(function (e) { return e.q; }));
            const opts = [];
            for (const q of QUESTIONS) {
                if (asked.has(q.id)) continue;
                const yes = cands.filter(function (c) { return q.test(c); }).length;
                if (yes > 0 && yes < cands.length) opts.push({ q: q, d: Math.abs(yes - (cands.length - yes)) });
            }
            if (opts.length) {
                opts.sort(function (a, b) { return a.d - b.d; });
                const pool = opts.slice(0, hard ? 3 : 6);
                act = { type: "ask", qid: pool[Math.floor(Math.random() * pool.length)].q.id };
            } else if (cands.length) {
                act = { type: "guess", card: cands[Math.floor(Math.random() * cands.length)].id };
            } else {
                act = { type: "ask", qid: QUESTIONS[0].id };
            }
        }
        applyAction(act, 1);
    }

    function scheduleBot() {
        if (isPaused()) {
            if (botTimer) { clearTimeout(botTimer); botTimer = null; }
            return;
        }
        const botTurn = !online && state && state.vsBot && state.phase === "playing" && state.turn === 1;
        if (botTurn && !botTimer) {
            botTimer = setTimeout(function () { botTimer = null; botMove(); }, 1200 + Math.random() * 900);
        }
        if (!botTurn && botTimer) { clearTimeout(botTimer); botTimer = null; }
    }

    /* ----------------------- UI shell controls ------------------------- */

    function toggleHelp(on) {
        helpOpen = typeof on === "boolean" ? on : !helpOpen;
        if (helpOpen) cheatsOpen = false;
        render();
    }

    function toggleCheats(on) {
        if (!canPause()) return;                 // guest tidak boleh cheat
        cheatsOpen = typeof on === "boolean" ? on : !cheatsOpen;
        if (cheatsOpen) helpOpen = false;
        render();
    }

    function setPaused(on) {
        if (!canPause()) return;                 // guest tidak boleh pause
        on = Boolean(on);
        if (paused === on) return;
        if (on) {
            pausedAt = Date.now();
            paused = true;
            if (botTimer) { clearTimeout(botTimer); botTimer = null; }
        } else {
            const dur = Math.max(0, Date.now() - pausedAt);
            if (state) {
                // Geser semua anchor Date.now() supaya tidak "lompat" saat resume.
                if (state.turnEndsAt != null) state.turnEndsAt += dur;
                if (Array.isArray(state.lastSeen)) state.lastSeen = state.lastSeen.map(function (t) { return t == null ? t : t + dur; });
                if (state.updatedAt != null) state.updatedAt += dur;
            }
            paused = false;
            pausedAt = 0;
        }
        render();
        pushState();
    }

    function restartMatch() {
        if (destroyed || !canPause()) return;
        if (botTimer) { clearTimeout(botTimer); botTimer = null; }
        paused = false; pausedAt = 0;
        helpOpen = false; cheatsOpen = false;
        handoff = false;
        ui.guessMode = false; ui.pendingGuess = null; ui.disconnected = false;
        prevTk = "";
        state = initialState();
        render();
        pushState();
    }

    function ask() {
        if (!state || !canAct() || ui.guessMode) return;
        const sel = root.querySelector("[data-q]");
        if (sel && sel.value) { ui.lastQ = sel.value; submitAction({ type: "ask", qid: sel.value }); }
    }

    function toggleGuessMode() {
        if (!canAct()) return;
        ui.guessMode = !ui.guessMode;
        ui.pendingGuess = null;
        render();
    }

    function cheatAction(kind) {
        if (destroyed || !state || isPaused() || !canPause()) return;
        const v = viewerIndex();
        if (kind === "skip") {
            if (state.phase !== "playing") return;
            applyAction({ type: "timeout" }, state.turn);
        } else if (kind === "score") {
            if (state.phase !== "playing") return;
            if (state.scores[v] < TARGET) state.scores[v]++;
            if (state.scores[v] >= TARGET) endRound(v, "guess");
            else publish();
        } else if (kind === "autoFlip") {
            const af = ov.cheat.querySelector("[data-cheat-autoflip]");
            submitAction({ type: "rule", key: "autoFlip", value: Boolean(af && af.checked) });
        }
    }

    function onKeyDown(e) {
        if (destroyed) return;
        const c = e.code;
        const t = e.target;
        const typing = Boolean(t && (t.tagName === "INPUT" || t.tagName === "SELECT" || t.tagName === "TEXTAREA" || t.isContentEditable));
        // Prioritas: H → C → P/Escape → R → aksi game (Space/Enter ask, G guess).
        if (c === "KeyH") { toggleHelp(); e.preventDefault(); return; }
        if (c === "KeyC") { if (!helpOpen) toggleCheats(); e.preventDefault(); return; }
        if (c === "KeyP" || c === "Escape") {
            if (helpOpen) toggleHelp(false);
            else if (cheatsOpen) toggleCheats(false);
            else setPaused(!isPaused());
            e.preventDefault();
            return;
        }
        if (c === "KeyR") { restartMatch(); e.preventDefault(); return; }
        if (typing || helpOpen || cheatsOpen || isPaused() || !state) return;
        if (c === "KeyG") { toggleGuessMode(); e.preventDefault(); return; }
        if (c === "Space" || c === "Enter") {
            if (state.phase === "playing") ask();
            else if (state.phase === "roundEnd") submitAction({ type: "next" });
            else if (state.phase === "matchEnd") submitAction({ type: "rematch" });
            e.preventDefault();
        }
    }

    /* ----------------------------- render ------------------------------ */

    function screenKey() {
        const lt = local2p() && state.phase === "playing" ? state.turn : "-";
        return state.phase + "|" + state.round + "|" + state.vsBot + "|" + lt + "|" + ui.disconnected;
    }

    function buildSetup() {
        const best = readBest();
        let modes;
        if (online) {
            modes = room.isHost
                ? '<button type="button" class="whi-mode-btn" data-start-online>🌐 ' + STR.startOnline + "<small>" + STR.startOnlineHint + "</small></button>"
                : '<p class="whi-muted">' + STR.waitHost + "</p>";
        } else {
            modes =
                '<button type="button" class="whi-mode-btn" data-start-bot>🤖 ' + STR.vsBot + "<small>" + STR.vsBotHint + "</small></button>" +
                '<button type="button" class="whi-mode-btn" data-start-local>👥 ' + STR.local2p + "<small>" + STR.localHint + "</small></button>";
        }
        const options = online && !room.isHost ? "" :
            '<div class="whi-options">' +
            '<label class="whi-check"><input type="checkbox" data-opt-miss checked> ' + STR.optMiss + "</label>" +
            '<label class="whi-check">' + STR.botLevel + ' <select data-opt-diff><option value="easy">' + STR.easy + '</option><option value="normal">' + STR.normal + "</option></select></label>" +
            "</div>";
        return '<div class="whi-setup">' +
            '<div class="whi-faces-row">' + [4, 10, 16].map(function (i) { return miniCard(CHARS[i]); }).join("") + "</div>" +
            '<div class="whi-modes">' + modes + "</div>" +
            options +
            (best ? '<p class="whi-muted">🏅 ' + STR.best(best) + "</p>" : "") +
            "</div>";
    }

    function buildPlaying() {
        const v = viewerIndex();
        const own = state.secrets[v];
        const groups = [];
        QUESTIONS.forEach(function (q) { if (groups.indexOf(q.group) === -1) groups.push(q.group); });
        const opts = groups.map(function (g) {
            return '<optgroup label="' + g + '">' + QUESTIONS.filter(function (q) { return q.group === g; })
                .map(function (q) { return '<option value="' + q.id + '">' + q.text + "</option>"; }).join("") + "</optgroup>";
        }).join("");
        const players = [0, 1].map(function (i) {
            return '<div class="whi-player" data-player="' + i + '"><b>' + nameOf(i) + "</b>" +
                '<span class="whi-pips" data-score="' + i + '"></span>' +
                '<span class="whi-pips whi-miss" data-miss="' + i + '" title="Wrong guesses this round"></span></div>';
        }).join("");
        return '<div class="whi-wrap">' +
            '<div class="whi-top">' + players + '<span class="whi-round">' + STR.roundLabel(state.round) + "</span></div>" +
            '<div class="whi-secrets">' +
            '<div class="whi-secret">' + (own != null ? miniCard(CHARS[own]) : hiddenMini()) + "<span>" + STR.yourCard + "</span></div>" +
            '<div class="whi-secret">' + hiddenMini() + "<span data-remaining></span></div>" +
            "</div>" +
            '<div class="whi-answer" data-answer aria-live="polite"></div>' +
            '<div class="whi-guessbar" data-guessbar hidden></div>' +
            '<div class="whi-grid">' + CHARS.map(cardHTML).join("") + "</div>" +
            '<div class="whi-controls">' +
            '<select data-q aria-label="Question">' + opts + "</select>" +
            '<button type="button" class="whi-btn" data-ask>' + STR.ask + "</button>" +
            '<button type="button" class="whi-btn secondary" data-guess-mode>' + STR.guessBtn + "</button>" +
            '<label class="whi-check"><input type="checkbox" data-autoflip> ' + STR.autoFlip + "</label>" +
            "</div>" +
            '<details class="whi-log"><summary>' + STR.history + '</summary><ol data-log></ol></details>' +
            "</div>";
    }

    function resultCard(emoji, title, sub, buttons) {
        const reveal = state.secrets[0] != null && state.secrets[1] != null
            ? '<div class="whi-reveal">' +
            "<div>" + miniCard(CHARS[state.secrets[0]]) + "<small>" + nameOf(0) + "</small></div>" +
            "<div>" + miniCard(CHARS[state.secrets[1]]) + "<small>" + nameOf(1) + "</small></div>" +
            "</div>"
            : "";
        return '<div class="whi-result"><div class="whi-overlay-card">' +
            '<div class="whi-big">' + emoji + "</div><h3>" + title + "</h3>" +
            '<p class="whi-muted">' + sub + "</p>" + reveal +
            "<p><b>" + nameOf(0) + " " + state.scores[0] + " – " + state.scores[1] + " " + nameOf(1) + "</b></p>" +
            buttons + "</div></div>";
    }

    function buildRoundEnd() {
        const r = state.roundResult;
        const happy = r.winner === viewerIndex() || local2p();
        return resultCard(happy ? "🎉" : "😅", STR.roundWin(nameOf(r.winner)), reasonText(r),
            '<button type="button" class="whi-btn" data-next>' + STR.nextRound + "</button>");
    }

    function buildMatchEnd() {
        const w = state.matchWinner;
        const best = readBest();
        const happy = w === playerIndex || local2p();
        const sub = STR.finalScore + " · " + (state.roundResult ? reasonText(state.roundResult) : "") +
            (best ? " · 🏅 " + STR.best(best) : "");
        return resultCard(happy ? "🏆" : "🤖", STR.matchWin(nameOf(w)), sub,
            '<button type="button" class="whi-btn" data-rematch>' + STR.playAgain + "</button>" +
            '<button type="button" class="whi-btn secondary" data-exit>Exit game</button>');
    }

    function buildDisconnect() {
        return '<div class="whi-result"><div class="whi-overlay-card">' +
            '<div class="whi-big">📡</div><h3>' + STR.dcTitle + "</h3>" +
            '<p class="whi-muted">' + STR.dcBody + "</p>" +
            '<button type="button" class="whi-btn" data-exit>Exit game</button></div></div>';
    }

    function buildScreen() {
        if (ui.disconnected) return buildDisconnect();
        if (state.phase === "setup") return buildSetup();
        if (state.phase === "roundEnd") return buildRoundEnd();
        if (state.phase === "matchEnd") return buildMatchEnd();
        return buildPlaying();
    }

    function saveBestOnce() {
        if (state.phase === "matchEnd" && prevPhase !== "matchEnd") {
            const w = state.matchWinner;
            if (w === playerIndex || local2p()) {
                const moves = state.actions[w];
                try {
                    const prev = Number(localStorage.getItem(META.bestKey)) || Infinity;
                    if (moves < prev) localStorage.setItem(META.bestKey, String(moves));
                } catch (e) { }
            }
        }
        prevPhase = state.phase;
    }

    function render() {
        if (destroyed) return;
        if (!state) {
            screen.innerHTML = '<div class="whi-result"><div class="whi-overlay-card"><p>' + STR.connecting + "</p></div></div>";
            return;
        }
        saveBestOnce();
        const key = screenKey();
        if (key !== lastKey) { lastKey = key; screen.innerHTML = buildScreen(); }
        update();
        scheduleBot();
    }

    function update() {
        const v = viewerIndex();
        const tk = state.phase + "|" + state.turn + "|" + state.round;
        if (tk !== prevTk) { prevTk = tk; ui.guessMode = false; ui.pendingGuess = null; }

        let status = STR.ready;
        if (isPaused()) status = STR.pausedTitle;
        else if (helpOpen) status = STR.helpTitle;
        else if (cheatsOpen) status = STR.cheatsLabel;
        else if (state.phase === "playing") status = state.turn === v ? STR.yourTurn : STR.thinking(nameOf(state.turn));
        else if (state.phase === "roundEnd") status = STR.roundOver;
        else if (state.phase === "matchEnd") status = STR.matchOver;
        if (handoff && !isPaused()) status = STR.passDevice;

        const setHud = function (key, value) {
            const el = root.querySelector('[data-hud="' + key + '"]');
            if (el) el.textContent = value;
        };
        setHud("status", status);
        setHud("round", state.round ? String(state.round) : "–");
        setHud("p1-name", nameOf(0));
        setHud("p2-name", nameOf(1));
        setHud("p1", String(Math.min(TARGET, state.scores[0])));
        setHud("p2", String(Math.min(TARGET, state.scores[1])));
        setHud("miss", state.settings.threeMiss ? Math.min(MAX_MISS, state.wrong[v].length) + "/" + MAX_MISS : "off");

        const pbtn = root.querySelector("[data-pause]");
        if (pbtn) {
            const label = pbtn.querySelector(".whi-btn-label");
            if (label) label.textContent = isPaused() ? STR.resumeLabel : STR.pauseLabel;
            pbtn.setAttribute("aria-label", isPaused() ? STR.resumeLabel : STR.pauseLabel);
            pbtn.title = (isPaused() ? "Resume" : "Pause") + " (P)";
            pbtn.disabled = !canPause();
        }
        const cbtn = root.querySelector("[data-cheats]");
        if (cbtn) cbtn.disabled = !canPause();
        syncSound();

        const flips = state.flipped[v] || [];
        root.querySelectorAll("[data-card]").forEach(function (btn) {
            const i = Number(btn.dataset.card);
            btn.classList.toggle("is-down", Boolean(flips[i]));
            btn.classList.toggle("is-pending", ui.pendingGuess === i);
            btn.setAttribute("aria-pressed", flips[i] ? "true" : "false");
        });

        for (let i = 0; i < 2; i++) {
            const sc = root.querySelector('[data-score="' + i + '"]');
            if (sc) sc.innerHTML = pips(state.scores[i], TARGET);
            const ms = root.querySelector('[data-miss="' + i + '"]');
            if (ms) ms.innerHTML = state.settings.threeMiss ? pips(state.wrong[i].length, MAX_MISS) : "";
            const pl = root.querySelector('[data-player="' + i + '"]');
            if (pl) pl.classList.toggle("active", state.phase === "playing" && state.turn === i);
        }
        const rem = root.querySelector("[data-remaining]");
        if (rem) {
            const opp = 1 - v;
            const n = state.flipped[opp].filter(Boolean).length;
            rem.textContent = STR.facesLeft(nameOf(opp), 24 - n);
        }

        const ans = root.querySelector("[data-answer]");
        if (ans) {
            if (ui.guessMode) ans.innerHTML = ui.pendingGuess != null ? STR.confirmHint : STR.guessHint;
            else ans.innerHTML = state.log.length ? eventHTML(state.log[state.log.length - 1]) : STR.askHint;
        }
        const gb = root.querySelector("[data-guessbar]");
        if (gb) {
            if (ui.pendingGuess != null) {
                const c = CHARS[ui.pendingGuess];
                gb.hidden = false;
                gb.innerHTML = miniCard(c) + "<span>" + STR.guessQuestion(c.name) + "</span>" +
                    '<button type="button" class="whi-btn warn" data-guess-confirm>' + STR.confirmGuess + "</button>" +
                    '<button type="button" class="whi-btn secondary" data-guess-cancel>' + STR.cancel + "</button>";
            } else gb.hidden = true;
        }

        const act = canAct();
        const askBtn = root.querySelector("[data-ask]");
        if (askBtn) askBtn.disabled = !act;
        const sel = root.querySelector("[data-q]");
        if (sel) { sel.disabled = !act; if (ui.lastQ) sel.value = ui.lastQ; }
        const gm = root.querySelector("[data-guess-mode]");
        if (gm) { gm.disabled = !act; gm.textContent = ui.guessMode ? STR.cancelGuess : STR.guessBtn; gm.classList.toggle("warn", ui.guessMode); }
        const af = root.querySelector("[data-autoflip]");
        if (af) af.checked = Boolean(state.settings.autoFlip[v]);

        const log = root.querySelector("[data-log]");
        if (log) {
            log.innerHTML = state.log.length
                ? state.log.slice(-6).reverse().map(function (e) { return "<li>" + eventHTML(e) + "</li>"; }).join("")
                : "<li>" + STR.noHistory + "</li>";
        }
        const nm = ov.handoff.querySelector("[data-handoff-name]");
        if (nm) nm.textContent = nameOf(state.turn);
        ov.handoff.hidden = !handoff || isPaused() || helpOpen || cheatsOpen || ui.disconnected;
        ov.pause.hidden = !isPaused() || helpOpen || cheatsOpen;
        ov.cheat.hidden = !cheatsOpen || helpOpen || isPaused() || !canPause();
        ov.help.hidden = !helpOpen;

        if (cheatsOpen && canPause()) {
            const opp = 1 - v;
            const secret = state.secrets[opp];
            const cb = ov.cheat.querySelector("[data-cheat-body]");
            if (cb) {
                cb.innerHTML =
                    '<div class="whi-cheat-row"><b>' + STR.cheatReveal + ' (' + nameOf(opp) + '):</b>' +
                    (secret != null ? miniCard(CHARS[secret]) : hiddenMini()) + "</div>" +
                    '<div class="whi-cheat-row"><label class="whi-check"><input type="checkbox" data-cheat-autoflip' +
                    (state.settings.autoFlip[v] ? " checked" : "") + "> " + STR.cheatAutoFlip + "</label>" +
                    '<button type="button" class="whi-btn secondary" data-cheat-skip>' + STR.cheatSkip + "</button>" +
                    '<button type="button" class="whi-btn warn" data-cheat-score>' + STR.cheatScore + "</button></div>";
            }
        }
        updateTimer();
    }

    function updateTimer() {
        const bar = root.querySelector("[data-hud='timer-bar']");
        const txt = root.querySelector("[data-hud='timer']");
        const wrap = root.querySelector(".whi-timebar");
        if (!state || state.phase !== "playing") {
            if (txt) txt.textContent = "–";
            if (bar) bar.style.width = "0%";
            return;
        }
        // Saat pause, bekukan kunci waktu agar timer tidak terus berkurang.
        const now = isPaused() ? pausedAt : Date.now();
        const remain = handoff ? TURN_MS : Math.max(0, state.turnEndsAt - now);
        if (bar) bar.style.width = (remain / TURN_MS * 100) + "%";
        if (txt) txt.textContent = Math.ceil(remain / 1000) + "s";
        if (wrap) wrap.classList.toggle("low", remain < 10000);
    }

    /* ------------------------ timer & koneksi -------------------------- */

    function tick() {
        if (destroyed || !state) return;
        updateTimer();
        if (isPaused()) return;                  // sim & deteksi disconnect dihentikan saat pause
        const playing = state.phase === "playing";
        if (playing && !handoff && authority() && Date.now() >= state.turnEndsAt) {
            applyAction({ type: "timeout" }, state.turn);
        }
        if (online && (playing || state.phase === "roundEnd")) {
            if (room.isHost) {
                if (state.lastSeen[1] && Date.now() - state.lastSeen[1] > DISCONNECT_MS) applyAction({ type: "forfeit" }, 0);
            } else if (!ui.disconnected && Date.now() - state.updatedAt > DISCONNECT_MS) {
                ui.disconnected = true;
                render();
            }
        }
    }

    /* ----------------------------- events ------------------------------ */

    function handleClick(event) {
        const el = event.target.closest("[data-exit],[data-help],[data-help-close],[data-cheats],[data-close],[data-pause],[data-resume],[data-restart],[data-sound],[data-cheat-skip],[data-cheat-score],[data-start-bot],[data-start-local],[data-start-online],[data-card],[data-ask],[data-guess-mode],[data-guess-confirm],[data-guess-cancel],[data-ready],[data-next],[data-rematch]");
        if (!el) return;
        if (el.hasAttribute("data-exit")) { onExit(); return; }
        if (el.hasAttribute("data-help")) { toggleHelp(); return; }
        if (el.hasAttribute("data-help-close")) { toggleHelp(false); return; }
        if (el.hasAttribute("data-cheats")) { toggleCheats(); return; }
        if (el.hasAttribute("data-close")) { toggleCheats(false); return; }
        if (el.hasAttribute("data-pause")) { setPaused(!isPaused()); return; }
        if (el.hasAttribute("data-resume")) { setPaused(false); return; }
        if (el.hasAttribute("data-restart")) { restartMatch(); return; }
        if (el.hasAttribute("data-sound")) {
            muted = !muted;
            try { localStorage.setItem(SOUND_KEY, muted ? "1" : "0"); } catch (e) { }
            syncSound();
            if (!muted) sfx("flip");
            return;
        }
        if (el.hasAttribute("data-cheat-skip")) { cheatAction("skip"); return; }
        if (el.hasAttribute("data-cheat-score")) { cheatAction("score"); return; }
        if (!state || helpOpen || cheatsOpen || isPaused()) return;
        if (el.hasAttribute("data-start-bot") || el.hasAttribute("data-start-local") || el.hasAttribute("data-start-online")) {
            const missEl = root.querySelector("[data-opt-miss]");
            const diffEl = root.querySelector("[data-opt-diff]");
            submitAction({
                type: "start",
                vsBot: el.hasAttribute("data-start-bot"),
                threeMiss: missEl ? missEl.checked : true,
                difficulty: diffEl ? diffEl.value : "easy",
            });
            return;
        }
        if (el.hasAttribute("data-card")) {
            const i = Number(el.dataset.card);
            if (ui.guessMode && canAct()) { ui.pendingGuess = i; render(); }
            else submitAction({ type: "flip", card: i });
            return;
        }
        if (el.hasAttribute("data-ask")) { ask(); return; }
        if (el.hasAttribute("data-guess-mode")) { toggleGuessMode(); return; }
        if (el.hasAttribute("data-guess-confirm")) {
            if (ui.pendingGuess != null) {
                const card = ui.pendingGuess;
                ui.guessMode = false;
                ui.pendingGuess = null;
                submitAction({ type: "guess", card: card });
                render();
            }
            return;
        }
        if (el.hasAttribute("data-guess-cancel")) { ui.guessMode = false; ui.pendingGuess = null; render(); return; }
        if (el.hasAttribute("data-ready")) {
            if (isPaused()) return;
            handoff = false;
            state.turnEndsAt = Date.now() + TURN_MS;
            publish();
            return;
        }
        if (el.hasAttribute("data-next")) { submitAction({ type: "next" }); return; }
        if (el.hasAttribute("data-rematch")) { submitAction({ type: "rematch" }); return; }
    }

    function handleChange(event) {
        if (event.target.closest("[data-cheat-autoflip]")) { cheatAction("autoFlip"); return; }
        const af = event.target.closest("[data-autoflip]");
        if (af) { submitAction({ type: "rule", key: "autoFlip", value: af.checked }); return; }
        const q = event.target.closest("[data-q]");
        if (q) ui.lastQ = q.value;
    }

    /* ------------------------------ init ------------------------------- */

    root.addEventListener("click", handleClick);
    root.addEventListener("change", handleChange);
    document.addEventListener("keydown", onKeyDown);

    if (online) {
        unsubs.push(room.onRoom(function (nextRoom) { roomData = nextRoom; if (!destroyed) render(); }));
        if (room.isHost) {
            state = initialState();
            publish();
            unsubs.push(room.onAction(function (action) {
                if (destroyed || !state || !action || !GUEST_ACTIONS.has(action.type)) return;
                if (paused && action.type !== "heartbeat") return;  // host mengontrol sim saat pause
                state.lastSeen[1] = Date.now();
                applyAction(action, 1);
            }));
        } else {
            unsubs.push(room.onState(function (nextState) {
                if (destroyed || !nextState) return;
                state = nextState;
                ui.disconnected = false;
                render();
            }));
        }
    } else {
        state = initialState();
        render();
    }

    const tickTimer = setInterval(tick, 250);
    const hbTimer = setInterval(function () {
        if (destroyed || !online || !state) return;
        if (room.isHost) applyAction({ type: "heartbeat" }, 0);
        else room.sendAction({ type: "heartbeat" }).catch(function () { });
    }, 10000);

    return {
        destroy() {
            destroyed = true;
            root.removeEventListener("click", handleClick);
            root.removeEventListener("change", handleChange);
            document.removeEventListener("keydown", onKeyDown);
            clearInterval(tickTimer);
            clearInterval(hbTimer);
            if (botTimer) { clearTimeout(botTimer); botTimer = null; }
            for (const u of unsubs) {
                if (typeof u === "function") { try { u(); } catch (e) { /* ignore */ } }
            }
            unsubs.length = 0;
            try { if (audio) audio.close(); } catch (e) { }
        },
    };
}