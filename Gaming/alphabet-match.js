/* ==== games/alphabet-match.js ==== */
/*
 * Alphabet Match — turn-based letter ↔ picture matching.
 * Template module: export mount(root, context).
 * Register its metadata + module path in GAMES inside app.js.
 *
 * Modes:
 *   "ai"   → vs Bot. Random coin toss decides who goes first.
 *   "room" → 2 players. Host randomly assigns seats (P1/P2) at start.
 *
 * Rules: pick a letter, then its picture. Correct = +1 and go again.
 * Wrong = turn passes. Highest score after all fixed levels wins.
 * Levels are fixed (always solvable); only picture display order is
 * shuffled once by the host and stored in state so both clients agree.
 *
 * Controls: tap/click tiles (no virtual buttons on mobile).
 * Desktop: Tab / Arrow keys + Enter/Space, Esc = deselect,
 * C = cheat overlay, R = restart. Hover a picture to see its name.
 */

import { iconSVG } from "../JS/icons.js";

export const META = {
    id: "alphabet-match",
    name: "Alphabet Match",
    category: "educational",
    catLabel: "Educational",
    desc: "Pair each letter with the picture whose word starts with it.",
    art: `<svg viewBox="0 0 48 48" width="54" height="54" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="7" y="7" width="15" height="15" rx="4"/><rect x="26" y="26" width="15" height="15" rx="4"/><path d="M14 14.5h1.5v-4M32.5 36.5h4M30 32.5l5 8"/><path d="M27 14l6 6m0-6l-6 6"/></svg>`,
    bg: ["#a7f3d0", "#10b981"],
};

/* ---------- static data: 26 letters, inline SVG only (no emoji) ---------- */
const ICONS = {
    apple: '<circle cx="24" cy="28" r="13"/><path d="M24 15c1-5 5-7 8-7-1 5-4 7-8 7z"/><path d="M24 15c-1-4-3-5-5-6"/>',
    ball: '<circle cx="24" cy="24" r="14"/><path d="M10 15c8 6 20 12 28 2M14 38c4-9 10-16 22-15M24 10v28"/>',
    cat: '<path d="M12 20l3-10 7 6M36 20l-3-10-7 6"/><circle cx="24" cy="27" r="12"/><circle cx="19" cy="26" r="1.6"/><circle cx="29" cy="26" r="1.6"/><path d="M22 31c1 1.4 3 1.4 4 0"/><path d="M24 29v3"/>',
    dog: '<path d="M12 14v14l6 8h12l6-8V14l-7 7H19z"/><circle cx="20" cy="25" r="1.6"/><circle cx="28" cy="25" r="1.6"/><path d="M24 30v3m-3 3c2 1.4 4 1.4 6 0"/>',
    egg: '<path d="M24 8c8 0 13 12 13 20a13 13 0 0 1-26 0c0-8 5-20 13-20z"/>',
    fish: '<path d="M8 24c6-8 14-11 22-8l8-6-2 9 2 9-8-6c-8 3-16 0-22-8z"/><circle cx="15" cy="22" r="1.4"/>',
    gift: '<rect x="10" y="20" width="28" height="18" rx="3"/><path d="M10 27h28M24 20v18"/><path d="M24 20c-8 0-10-8-5-9s5 9 5 9zm0 0c8 0 10-8 5-9s-5 9-5 9z"/>',
    hat: '<path d="M14 34c0-12 4-22 10-22s10 10 10 22"/><path d="M8 35h32"/>',
    icecream: '<path d="M16 18h16l-8 22z"/><path d="M16 18a8 8 0 0 1 16 0"/>',
    juice: '<path d="M15 14h18l-3 26H18z"/><path d="M17 22h14"/><path d="M30 8l4 4"/>',
    key: '<circle cx="17" cy="17" r="7"/><path d="M22 22l14 14m-5-1l4-4m-9 3l4-4"/>',
    lemon: '<ellipse cx="24" cy="24" rx="10" ry="14" transform="rotate(30 24 24)"/><path d="M36 12l3-3m0 6l3-1"/>',
    moon: '<path d="M30 8a14 14 0 1 0 10 24A16 16 0 0 1 30 8z"/>',
    nest: '<path d="M10 26c0 8 6 13 14 13s14-5 14-13c-4-3-9-5-14-5s-10 2-14 5z"/><path d="M14 27c6 2 14 2 20 0"/><circle cx="24" cy="20" r="4"/>',
    orange: '<circle cx="24" cy="24" r="13"/><path d="M24 11v-3"/><circle cx="24" cy="24" r="6"/>',
    pig: '<circle cx="24" cy="26" r="12"/><path d="M14 20l-5-4v8"/><path d="M34 20l5-4v8"/><ellipse cx="24" cy="28" rx="4" ry="3"/><circle cx="22.6" cy="28" r=".8"/><circle cx="25.4" cy="28" r=".8"/><circle cx="20" cy="23" r="1.2"/><circle cx="28" cy="23" r="1.2"/>',
    queen: '<path d="M12 34l-3-18 8 7 7-13 7 13 8-7-3 18z"/><path d="M12 34h24"/><circle cx="24" cy="12" r="2"/>',
    ring: '<circle cx="24" cy="28" r="10"/><path d="M20 12l4-4 4 4-4 6z"/>',
    sun: '<circle cx="24" cy="24" r="8"/><path d="M24 8v5m0 22v5M8 24h5m22 0h5M12 12l3.5 3.5m17 17l3.5 3.5m0-24l-3.5 3.5m-17 17L12 36"/>',
    tree: '<path d="M24 8l9 14h-5l8 13H12l8-13h-5z"/><path d="M24 35v6"/>',
    umbrella: '<path d="M8 24a16 16 0 0 1 32 0z"/><path d="M24 24v12a4 4 0 0 0 8 0"/>',
    violin: '<path d="M20 40l-4-4 4-4"/><path d="M20 32L34 10l4 4-16 22z"/><path d="M17 33c2 2 6 3 9 2"/>',
    water: '<path d="M24 8s10 12 10 19a10 10 0 0 1-20 0C14 20 24 8 24 8z"/><path d="M19 27a5 5 0 0 0 4 6"/>',
    xylophone: '<rect x="8" y="10" width="7" height="26" rx="2"/><rect x="17" y="12" width="7" height="22" rx="2"/><rect x="26" y="14" width="7" height="18" rx="2"/><rect x="35" y="16" width="7" height="14" rx="2"/><path d="M12 43l22-9"/><circle cx="36" cy="33" r="2.5"/>',
    yoyo: '<circle cx="24" cy="30" r="11"/><circle cx="24" cy="30" r="3.5"/><path d="M24 19c0-7 5-9 11-11"/>',
    zebra: '<path d="M14 12c0-4 20-4 20 0v18l-4 8h-3l2-8h-10l2 8h-3l-4-8z"/><path d="M18 18h12M18 24h12"/>',
};
const WORDS = {
    A: "apple", B: "ball", C: "cat", D: "dog", E: "egg", F: "fish",
    G: "gift", H: "hat", I: "icecream", J: "juice", K: "key", L: "lemon",
    M: "moon", N: "nest", O: "orange", P: "pig", Q: "queen", R: "ring",
    S: "sun", T: "tree", U: "umbrella", V: "violin", W: "water",
    X: "xylophone", Y: "yoyo", Z: "zebra",
};
const LABEL = {
    apple: "Apple", ball: "Ball", cat: "Cat", dog: "Dog", egg: "Egg", fish: "Fish",
    gift: "Gift", hat: "Hat", icecream: "Ice cream", juice: "Juice", key: "Key",
    lemon: "Lemon", moon: "Moon", nest: "Nest", orange: "Orange", pig: "Pig",
    queen: "Queen", ring: "Ring", sun: "Sun", tree: "Tree", umbrella: "Umbrella",
    violin: "Violin", water: "Water", xylophone: "Xylophone", yoyo: "Yo-yo", zebra: "Zebra",
};
const LETTER_OF = Object.fromEntries(Object.entries(WORDS).map(([l, w]) => [w, l]));

/* Fixed, always-solvable levels (no random level generator). */
const LEVELS = ["ABCDEF", "GHIJKL", "MNOPQR", "STUVWX", "YZ"];

const BOT_ACCURACY = 0.72; /* chance the bot picks the right picture */

function shuffle(a) {
    const arr = a.slice();
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const levelLetters = (i) => LEVELS[i].split("");
const levelWords = (i) => levelLetters(i).map((l) => WORDS[l]);
const iconSvg = (w) =>
    '<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    ICONS[w] + "</svg>";

export function mount(root, context = {}) {
    const { mode = "ai", room = null, playerName = "Player", onExit = () => { } } = context;
    const online = mode === "room" && Boolean(room);
    let roomData = room?.room || null;
    let state = null;

    /* local-only UI flags (never published) */
    let destroyed = false;
    let botTimer = 0;
    let cheatsOpen = false;
    let reveal = false;
    let lastPulse = 0;
    let didFocus = false;
    let helpOpen = false, paused = false;
    let seenHelp = true;
    try { seenHelp = localStorage.getItem("alphabetMatchHelpSeen") === "1"; } catch (err) { seenHelp = true; }
    if (!seenHelp) {
        helpOpen = true;
        try { localStorage.setItem("alphabetMatchHelpSeen", "1"); } catch (err) { /* storage blocked */ }
    }
    const unsubs = [];

    const $ = (s) => root.querySelector(s);
    const me = (playerName || "Player").trim() || "Player";

    function toggleHelp(on) {
        helpOpen = typeof on === "boolean" ? on : !helpOpen;
        if (helpOpen) cheatsOpen = false;
        render();
    }
    function togglePause(on) {
        if (online && !room.isHost) return;
        paused = typeof on === "boolean" ? on : !paused;
        if (paused) { clearTimeout(botTimer); botTimer = 0; }
        else scheduleBot();
        render();
    }

    /* Random seat assignment (multiplayer): host flips a coin once,
       stores it in state, both clients derive their seat from it. */
    function mySeat() {
        if (!online) return 0;
        if (!state) return 0;
        return room.isHost ? state.seats.host : state.seats.guest;
    }
    function seatNames() {
        if (!online) return [me, "Bot"];
        const n = ["Opponent", "Opponent"];
        n[mySeat()] = me;
        return n;
    }

    function initialState() {
        const seats = online
            ? (Math.random() < 0.5 ? { host: 0, guest: 1 } : { host: 1, guest: 0 })
            : { host: 0, guest: 1 };
        return {
            v: 1,
            seats,
            turn: Math.random() < 0.5 ? 0 : 1, /* random first turn (coin toss) */
            level: 0,
            order: shuffle(levelWords(0)), /* display order only, host-owned */
            matched: [],
            sel: null,
            scores: [0, 0],
            misses: [0, 0],
            phase: "play", /* play | over */
            pulse: { n: 0, kind: "", word: "", letter: "" },
            freeze: false, /* cheat: bot always misses */
        };
    }

    /* ---------------- skeleton (template structure) ---------------- */
    root.innerHTML = `
<style>
.am-app{--am-line:rgba(127,135,160,.28);--am-tile:rgba(127,135,160,.07);--am-accent:#6366f1;--am-ok:#10b981;--am-bad:#ef4444;color:var(--color-text,#e5e9f0)}
.am-game{--am-line:rgba(127,135,160,.28);--am-tile:rgba(127,135,160,.07);--am-accent:#6366f1;--am-ok:#10b981;--am-bad:#ef4444;width:100%;min-width:0;font-family:inherit}
.am-hud{display:flex;flex-wrap:wrap;align-items:center;gap:8px 12px;margin-bottom:8px;padding:8px 12px;border:1px solid var(--am-line);border-radius:10px}
.am-app .am-btn{display:inline-flex;align-items:center;gap:6px;padding:6px 10px;min-height:32px;border:1px solid var(--am-line);border-radius:8px;background:var(--am-tile);color:inherit;font:inherit;font-size:11px;font-weight:700;cursor:pointer;touch-action:manipulation}
.am-app .am-btn svg{flex:none;display:block}
.am-app .am-btn.on{border-color:var(--am-accent);color:var(--am-accent)}
.am-app .am-btn:disabled{opacity:.4;cursor:default}
.am-spacer{flex:1 1 auto}
.am-subchip{font-size:11px;opacity:.8}
.am-game .am-panel{position:relative;display:flex;align-items:center;justify-content:center;min-height:0;overflow:hidden}
.am-game .am-wrap{display:grid;gap:12px;padding:4px 2px;width:min(620px,100%);margin:0 auto}
.am-game .am-scores{display:flex;gap:8px;justify-content:center;align-items:stretch;flex-wrap:wrap}
.am-game .am-score{flex:1 1 120px;max-width:160px;border:1px solid var(--am-line);border-radius:10px;padding:8px 12px;display:grid;gap:2px;text-align:center;opacity:.75;transition:opacity .16s,border-color .16s}
.am-game .am-score.on{opacity:1;border-color:var(--am-accent)}
.am-game .am-who{font-size:10.5px;letter-spacing:.06em;text-transform:uppercase;opacity:.8;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.am-game .am-score b{font-size:22px;font-weight:700;line-height:1.15}
.am-game .am-mini{font-size:10px;opacity:.7}
.am-game .am-mid{display:grid;place-content:center;text-align:center;font-size:10.5px;opacity:.85;padding:0 4px}
.am-game .am-mid b{font-size:15px}
.am-game .am-board{display:grid;grid-template-columns:1fr 1fr;gap:12px;align-items:start;min-width:0}
.am-game .am-col{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;min-width:0}
.am-game .am-tile{position:relative;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;min-width:0;min-height:clamp(60px,16vw,80px);border:1px solid var(--am-line);border-radius:10px;background:var(--am-tile);color:inherit;font:inherit;font-size:13px;cursor:pointer;padding:8px 4px;transition:border-color .16s,background .16s;-webkit-tap-highlight-color:transparent;touch-action:manipulation;user-select:none}
.am-game .am-tile:hover:not(:disabled){border-color:var(--am-accent)}
.am-game .am-tile:focus-visible{outline:2px solid var(--am-accent);outline-offset:2px}
.am-game .am-tile.sel{border-color:var(--am-accent);background:rgba(99,102,241,.14)}
.am-game .am-tile.done{border-color:rgba(16,185,129,.5);background:rgba(16,185,129,.1);cursor:default}
.am-game .am-big{font-size:clamp(20px,6vw,28px);font-weight:700;line-height:1.1}
.am-game .am-sub{font-size:9px;height:11px;line-height:11px;text-transform:uppercase;letter-spacing:.05em;opacity:.7;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.am-game .am-tile svg{width:clamp(26px,7vw,36px);height:auto}
.am-game .am-name{font-size:9px;height:11px;line-height:11px;letter-spacing:.05em;text-transform:uppercase;opacity:0;transition:opacity .12s;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.am-game .am-tile:hover .am-name,.am-game .am-tile:focus-visible .am-name,.am-game .am-tile.done .am-name,.am-game .am-board.reveal .am-name{opacity:.85}
.am-game .am-board.wait{opacity:.55;pointer-events:none}
.am-game .am-tile.err{animation:am-shake .28s;border-color:var(--am-bad)}
.am-game .am-tile.pop{animation:am-pop .28s}
@keyframes am-shake{0%,100%{transform:translateX(0)}25%{transform:translateX(-4px)}75%{transform:translateX(4px)}}
@keyframes am-pop{0%{transform:scale(1)}40%{transform:scale(1.06)}100%{transform:scale(1)}}
.am-game .am-ov{position:absolute;inset:0;z-index:6;display:flex;align-items:center;justify-content:center;background:rgba(8,10,20,.55);border-radius:12px;padding:12px}
.am-game .am-card{width:min(320px,100%);max-height:100%;overflow:auto;background:#0f172a;color:#eef2ff;border:1px solid rgba(255,255,255,.12);border-radius:12px;padding:16px;display:grid;gap:12px;text-align:center}
.am-game .am-card h3{margin:0;font-size:18px}
.am-game .am-card p{margin:0;font-size:12.5px;opacity:.85;line-height:1.5}
.am-game .am-help{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px;text-align:left}
.am-game .am-help b{display:block;margin-bottom:4px;font-size:11px;letter-spacing:.08em;text-transform:uppercase;opacity:.8}
.am-game .am-help ul{margin:0 0 10px;padding-left:16px;font-size:12px;line-height:1.6;opacity:.85}
.am-game .am-btn{border:1px solid transparent;border-radius:8px;background:var(--am-accent);color:#fff;font:inherit;font-weight:600;font-size:13px;min-height:44px;padding:8px 16px;cursor:pointer;transition:filter .16s}
.am-game .am-btn:hover{filter:brightness(1.1)}
.am-game .am-btn.ghost{background:transparent;border-color:rgba(255,255,255,.25);color:inherit}
.am-game .am-btn.small{min-height:44px;padding:8px 12px;font-size:11.5px;border-radius:8px}
.am-game .am-btn:disabled{opacity:.45;cursor:default}
.am-game .am-cheat-row{display:flex;justify-content:space-between;align-items:center;gap:12px;min-height:44px;font-size:12.5px;text-align:left}
.am-game .am-waiting{padding:32px 12px;text-align:center;font-size:13px;opacity:.8}
@media (max-width:420px){
.am-game .am-board{gap:8px}
.am-game .am-col{gap:6px}
.am-game .am-scores{gap:6px}
.am-game .am-score{padding:8px}
.am-game .am-big{font-size:20px}
.am-game .am-tile{min-height:60px;padding:6px 2px}
}
.am-game.am-app .am-hud{color:#e5e9f0}
.am-game.am-app .am-btn{background:var(--am-tile);border-color:var(--am-line);color:inherit}
.am-game.am-app .am-btn.on{border-color:var(--am-accent);color:var(--am-accent)}
.am-hud .am-scores{flex:0 0 auto;flex-wrap:nowrap}
.am-hud .am-score{flex:0 0 116px;max-width:116px}
.am-hud .am-mid{flex:0 0 auto}
@media (max-width:640px){
.am-app .am-hud{gap:5px 8px;padding:6px 8px;margin-bottom:6px}
.am-app .am-hud .am-scores{gap:4px}
.am-app .am-hud .am-score{padding:5px 8px;flex-basis:80px;max-width:100px}
.am-app .am-hud .am-score b{font-size:16px}
.am-app .am-hud .am-who,.am-app .am-hud .am-mini{font-size:9px}
.am-app .am-hud .am-mid{font-size:9px;padding:0}
.am-app .am-hud .am-mid b{font-size:12px}
.am-app .am-hud .am-btn{min-width:28px;min-height:28px;padding:4px 6px;font-size:10px}
.am-app .am-hud .am-btn-label,.am-app .am-hud .am-spacer,.am-app .am-hud .am-subchip{display:none}
.am-game .am-panel{flex:0 0 auto;min-height:min(70dvh,620px)}
.am-game .am-card{padding:14px}
}
@media (prefers-reduced-motion:reduce){.am-game *{animation-duration:.01ms!important;animation-delay:0s!important;transition-duration:.01ms!important}}
</style>
<div class="game-app am-game am-app game-fill">
  <div class="am-hud">
    <span class="game-status"><i class="game-status-dot"></i><span data-status aria-live="polite">Ready</span></span>
    <span class="am-subchip" data-sub></span>
    <div class="am-scores" data-scores></div>
    <div class="am-mid" data-levelinfo></div>
    <span class="am-spacer"></span>
    <button class="am-btn" type="button" data-help aria-label="How to play" title="How to play (H)">${iconSVG("helpCircle", { size: 14 })}<span class="am-btn-label">Help</span></button>
    <button class="am-btn" type="button" data-act="cheats" aria-label="Cheats" title="Cheats (C)">${iconSVG("wrench", { size: 14 })}<span class="am-btn-label">Cheats</span></button>
    <button class="am-btn" type="button" data-act="pause" data-pause-btn aria-label="Pause" title="Pause (P)">${iconSVG("pause", { size: 14 })}<span class="am-btn-label">Pause</span></button>
    <button class="am-btn" type="button" data-act="restart" data-restart-btn aria-label="Restart" title="Restart (R)">${iconSVG("refresh", { size: 14 })}<span class="am-btn-label">Restart</span></button>
    <button class="am-btn" type="button" data-exit aria-label="Exit game" title="Exit game">${iconSVG("logOut", { size: 14 })}<span class="am-btn-label">Exit</span></button>
  </div>
  <section class="game-panel am-panel" data-board></section>
</div>`;

    /* ---------------- render ---------------- */
    function statusText() {
        if (!state) return "Connecting…";
        const names = seatNames();
        if (state.phase === "over") {
            const [a, b] = state.scores;
            if (a === b) return "Draw";
            const w = a > b ? 0 : 1;
            return w === mySeat() ? "You win" : names[w] + " wins";
        }
        if (state.turn === mySeat()) {
            return state.sel
                ? "Your turn — find the picture for \u201C" + state.sel + "\u201D"
                : "Your turn — pick a letter";
        }
        return online ? names[state.turn] + " is choosing…" : "Bot is thinking…";
    }

    function render() {
        const board = $("[data-board]");
        const sub = $("[data-sub]");
        const status = $("[data-status]");
        const scoresEl = $("[data-scores]"), levelInfoEl = $("[data-levelinfo]");
        const restartBtn = $("[data-restart-btn]"), pauseBtn = $("[data-pause-btn]");
        if (!board) return;

        status.textContent = statusText();
        if (restartBtn) restartBtn.disabled = online && !room.isHost;
        if (pauseBtn) {
            pauseBtn.disabled = online && !room.isHost;
            const want = paused ? "play" : "pause";
            if (pauseBtn.dataset.iconState !== want) {
                pauseBtn.dataset.iconState = want;
                const ico = pauseBtn.querySelector("svg");
                if (ico) ico.outerHTML = iconSVG(want, { size: 14 });
                const label = pauseBtn.querySelector(".am-btn-label");
                if (label) label.textContent = paused ? "Resume" : "Pause";
            }
        }

        if (!state) {
            sub.textContent = "Waiting for the host to start…";
            if (scoresEl) scoresEl.innerHTML = "";
            if (levelInfoEl) levelInfoEl.innerHTML = "";
            board.innerHTML = '<div class="am-waiting">Waiting for host…</div>';
            return;
        }

        const letters = levelLetters(state.level);
        const matched = new Set(state.matched);
        const names = seatNames();
        const seat = mySeat();
        const myTurn = state.phase === "play" && state.turn === seat;
        const fresh = state.pulse.n !== lastPulse;
        lastPulse = state.pulse.n;

        sub.textContent = state.phase === "over"
            ? "All 26 letters matched."
            : "Level " + (state.level + 1) + " of " + LEVELS.length + " · " + letters.join(" ");

        /* keep keyboard focus across re-renders */
        const ae = document.activeElement;
        const keepKey = ae && root.contains(ae) && ae.dataset ? ae.dataset.key : null;

        const scoresHtml =
            '<div class="am-scores">' +
            [0, 1].map((s) =>
                '<div class="am-score' + (state.phase === "play" && state.turn === s ? " on" : "") + '">' +
                '<span class="am-who">P' + (s + 1) + " · " + names[s] + (s === seat ? " (You)" : "") + "</span>" +
                "<b>" + state.scores[s] + "</b>" +
                '<span class="am-mini">' + state.misses[s] + " miss" + (state.misses[s] === 1 ? "" : "es") + "</span></div>"
            ).join("") + "</div>";

        if (scoresEl) scoresEl.innerHTML = scoresHtml;
        if (levelInfoEl) levelInfoEl.innerHTML = "<span>Level " + (state.level + 1) + "/" + LEVELS.length + "</span><b>" +
            state.matched.length + "/" + letters.length + "</b><span>pairs</span>";

        const lettersHtml = letters.map((L, i) => {
            const done = matched.has(WORDS[L]);
            const sel = state.sel === L && !done;
            const pop = fresh && state.pulse.kind === "match" && state.pulse.letter === L;
            return '<button type="button" class="am-tile' + (done ? " done" : "") + (sel ? " sel" : "") + (pop ? " pop" : "") +
                '" data-act="letter" data-letter="' + L + '" data-key="l' + i + '" data-col="0" data-row="' + i +
                '" aria-label="Letter ' + L + '"' + (done ? " disabled" : "") + ">" +
                '<span class="am-big">' + L + '</span><span class="am-sub">' + (done ? LABEL[WORDS[L]] : "") + "</span></button>";
        }).join("");

        const picsHtml = state.order.map((w, i) => {
            const done = matched.has(w);
            const err = fresh && state.pulse.kind === "miss" && state.pulse.word === w;
            const pop = fresh && state.pulse.kind === "match" && state.pulse.word === w;
            return '<button type="button" class="am-tile' + (done ? " done" : "") + (err ? " err" : "") + (pop ? " pop" : "") +
                '" data-act="pic" data-word="' + w + '" data-key="p' + i + '" data-col="1" data-row="' + i +
                '" title="' + LABEL[w] + '" aria-label="' + LABEL[w] + '"' + (done ? " disabled" : "") + ">" +
                iconSvg(w) + '<span class="am-name">' + LABEL[w] + "</span></button>";
        }).join("");

        const boardHtml =
            '<div class="am-board' + (myTurn ? "" : " wait") + (reveal ? " reveal" : "") + '">' +
            '<div class="am-col">' + lettersHtml + "</div>" +
            '<div class="am-col">' + picsHtml + "</div></div>";

        let overHtml = "";
        if (state.phase === "over" && !helpOpen && !paused) {
            const [a, b] = state.scores;
            const title = a === b ? "It\u2019s a draw" : (a > b ? 0 : 1) === seat ? "You win!" : names[a > b ? 0 : 1] + " wins";
            const guestLock = online && !room.isHost;
            overHtml =
                '<div class="am-ov"><div class="am-card"><h3>' + title + "</h3>" +
                "<p>Final score " + a + "\u2013" + b + " · Misses " + state.misses[0] + "\u2013" + state.misses[1] + "</p>" +
                '<button type="button" class="am-btn" data-act="restart"' + (guestLock ? " disabled" : "") + ">Play again</button>" +
                (guestLock ? '<p class="am-mini">Only the host can restart.</p>' : "") + "</div></div>";
        }

        let cheatHtml = "";
        if (cheatsOpen && !helpOpen && !paused) {
            const over = state.phase === "over";
            cheatHtml =
                '<div class="am-ov"><div class="am-card"><h3>Cheats</h3>' +
                '<div class="am-cheat-row"><span>Reveal picture names</span><button type="button" class="am-btn small ghost" data-act="cheat-reveal">' + (reveal ? "ON" : "OFF") + "</button></div>" +
                '<div class="am-cheat-row"><span>Match one pair (+1 you)</span><button type="button" class="am-btn small" data-act="cheat-pair"' + (over ? " disabled" : "") + ">Do it</button></div>" +
                '<div class="am-cheat-row"><span>Clear this level</span><button type="button" class="am-btn small" data-act="cheat-clear"' + (over ? " disabled" : "") + ">Do it</button></div>" +
                (!online
                    ? '<div class="am-cheat-row"><span>Bot always misses</span><button type="button" class="am-btn small ghost" data-act="cheat-freeze">' + (state.freeze ? "ON" : "OFF") + "</button></div>"
                    : "") +
                (online ? '<p class="am-mini">Cheats apply to both players.</p>' : "") +
                '<button type="button" class="am-btn ghost" data-act="cheats-close">Close</button></div></div>';
        }

        const helpHtml = helpOpen
            ? '<div class="am-ov"><div class="am-card"><h3>How to play</h3>' +
            '<div class="am-help"><div><b>Goal</b><ul>' +
            "<li>Pair every letter with the picture whose word starts with it.</li>" +
            "<li>A correct match scores a point and you go again; a wrong one passes the turn.</li>" +
            "<li>Highest score after all five levels wins.</li></ul><b>Desktop</b><ul>" +
            "<li>Click a letter, then its picture. Hover a picture to see its name.</li>" +
            "<li>Tab / arrows to move, Enter or Space to select, Esc to deselect.</li>" +
            "<li>C cheats · R restart · P pause · H help.</li></ul></div><div><b>Mobile</b><ul>" +
            "<li>Tap a letter, then tap the matching picture.</li>" +
            "<li>No virtual buttons are needed — the tiles are the controls.</li></ul></div></div>" +
            '<button type="button" class="am-btn" data-act="help-close">Got it</button></div></div>'
            : "";
        const pauseHtml = paused
            ? '<div class="am-ov"><div class="am-card"><h3>Paused</h3><p>The bot is stopped.</p>' +
            '<button type="button" class="am-btn" data-act="resume">Resume <kbd>P</kbd></button></div></div>'
            : "";

        board.innerHTML = '<div class="am-wrap">' + boardHtml + "</div>" + overHtml + cheatHtml + helpHtml + pauseHtml;

        /* restore / initial focus for keyboard users */
        const focusEl = (key) => {
            const el = key && root.querySelector('[data-key="' + key + '"]');
            if (el && !el.disabled) { el.focus({ preventScroll: true }); return true; }
            return false;
        };
        if (!focusEl(keepKey)) {
            const first = root.querySelector('.am-tile[data-col="0"]:not(:disabled)');
            const active = document.activeElement;
            if (first && (!didFocus ? active === document.body || root.contains(active) : keepKey)) {
                first.focus({ preventScroll: true });
            }
        }
        didFocus = true;
    }

    function publish() {
        render();
        /* Only the host writes canonical state to Firebase. */
        if (online && room.isHost) room.publishState(state).catch(console.warn);
        scheduleBot();
    }

    /* ---------------- game logic (host-authoritative) ---------------- */
    function maybeAdvance() {
        const letters = levelLetters(state.level);
        if (state.matched.length < letters.length) return;
        if (state.level < LEVELS.length - 1) {
            state.level++;
            state.order = shuffle(levelWords(state.level));
            state.matched = [];
            state.sel = null;
        } else {
            state.phase = "over";
            state.sel = null;
        }
    }

    function applyAction(action, actor) {
        if (destroyed || !state || !action || typeof action !== "object") return;
        const t = action.type;

        if (t === "restart") {
            if (online && actor !== state.seats.host) return; /* host only */
            cheatsOpen = false;
            state = initialState(); /* new coin toss + new seats */
            publish();
            return;
        }
        if (t === "cheat-freeze") {
            if (online) return; /* bot cheat is AI-mode only */
            state.freeze = !state.freeze;
            publish();
            return;
        }
        if (state.phase !== "play") return;

        if (t === "cheat-pair" || t === "cheat-clear") {
            if (!online && actor !== 0) return; /* humans only */
            const remaining = levelLetters(state.level).filter((L) => !state.matched.includes(WORDS[L]));
            if (!remaining.length) return;
            const take = t === "cheat-pair" ? remaining.slice(0, 1) : remaining;
            for (const L of take) { state.matched.push(WORDS[L]); state.scores[actor]++; }
            const last = take[take.length - 1];
            state.sel = null;
            state.pulse = { n: state.pulse.n + 1, kind: "match", word: WORDS[last], letter: last };
            maybeAdvance();
            publish();
            return;
        }

        if (actor !== state.turn) return; /* validate: only the player on turn */

        if (t === "clear") {
            state.sel = null;
            publish();
            return;
        }
        if (t === "pick-letter") {
            const L = action.letter;
            if (!levelLetters(state.level).includes(L) || state.matched.includes(WORDS[L])) return;
            state.sel = state.sel === L ? null : L; /* tap again to deselect */
            publish();
            return;
        }
        if (t === "pick-pic") {
            const w = action.word;
            if (!state.sel || !state.order.includes(w) || state.matched.includes(w)) return;
            if (LETTER_OF[w] === state.sel) {
                state.matched.push(w);
                state.scores[actor]++;
                state.pulse = { n: state.pulse.n + 1, kind: "match", word: w, letter: state.sel };
                state.sel = null;
                maybeAdvance(); /* correct match = go again */
            } else {
                state.misses[actor]++;
                state.pulse = { n: state.pulse.n + 1, kind: "miss", word: w, letter: state.sel };
                state.sel = null;
                state.turn = 1 - state.turn; /* wrong = turn passes */
            }
            publish();
        }
    }

    function submitAction(action) {
        if (online && !room.isHost) {
            room.sendAction(action).catch(console.warn);
            return;
        }
        applyAction(action, mySeat());
    }

    /* ---------------- bot (AI mode only) ---------------- */
    function scheduleBot() {
        clearTimeout(botTimer);
        if (online || destroyed || paused || !state) return;
        if (state.phase !== "play" || state.turn !== 1) return;
        botTimer = setTimeout(botStep, 650 + Math.random() * 450);
    }
    function botStep() {
        if (destroyed || !state || state.phase !== "play" || state.turn !== 1) return;
        const remaining = levelLetters(state.level).filter((L) => !state.matched.includes(WORDS[L]));
        if (!remaining.length) return;
        if (!state.sel) {
            applyAction({ type: "pick-letter", letter: pick(remaining) }, 1);
            return;
        }
        const correct = WORDS[state.sel];
        const wrong = state.order.filter((w) => w !== correct && !state.matched.includes(w));
        const useCorrect = !state.freeze && (wrong.length === 0 || Math.random() < BOT_ACCURACY);
        applyAction({ type: "pick-pic", word: useCorrect ? correct : pick(wrong) }, 1);
    }

    /* ---------------- input: mouse / touch (no virtual buttons) ---------------- */
    function handleClick(event) {
        if (event.target.closest && event.target.closest("[data-help]")) { toggleHelp(); return; }
        const el = event.target.closest ? event.target.closest("[data-exit],[data-act]") : null;
        if (!el || el.disabled) return;
        if (el.hasAttribute("data-exit")) { onExit(); return; }
        switch (el.dataset.act) {
            case "restart": submitAction({ type: "restart" }); break;
            case "cheats": cheatsOpen = !cheatsOpen; render(); break;
            case "cheats-close": cheatsOpen = false; render(); break;
            case "help-close": toggleHelp(false); break;
            case "pause": togglePause(); break;
            case "resume": togglePause(false); break;
            case "cheat-reveal": reveal = !reveal; render(); break;
            case "cheat-pair": submitAction({ type: "cheat-pair" }); break;
            case "cheat-clear": submitAction({ type: "cheat-clear" }); break;
            case "cheat-freeze": submitAction({ type: "cheat-freeze" }); break;
            case "letter": submitAction({ type: "pick-letter", letter: el.dataset.letter }); break;
            case "pic": submitAction({ type: "pick-pic", word: el.dataset.word }); break;
        }
    }

    /* ---------------- input: keyboard (desktop) ---------------- */
    function focusTile(col, row) {
        const el = root.querySelector('[data-key="' + (col === 0 ? "l" : "p") + row + '"]');
        if (el && !el.disabled) { el.focus({ preventScroll: true }); return true; }
        return false;
    }
    function handleKey(event) {
        if (destroyed || !state) return;
        const t = event.target;
        if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;

        if (helpOpen) {
            if (event.key === "Escape" || event.key === "h" || event.key === "H" || event.key === "Enter") toggleHelp(false);
            return;
        }
        if (paused) {
            if (event.key === "p" || event.key === "P" || event.key === "Escape" || event.key === "Enter") togglePause(false);
            return;
        }

        if (event.key === "Escape") {
            if (cheatsOpen) { cheatsOpen = false; render(); event.preventDefault(); }
            else if (state.sel && state.turn === mySeat()) submitAction({ type: "clear" });
            return;
        }
        const inRoot = root.contains(document.activeElement);
        if ((event.key === "h" || event.key === "H") && inRoot) { toggleHelp(); event.preventDefault(); return; }
        if ((event.key === "p" || event.key === "P") && inRoot) { togglePause(); event.preventDefault(); return; }
        if ((event.key === "c" || event.key === "C") && (inRoot || cheatsOpen)) {
            cheatsOpen = !cheatsOpen; render(); event.preventDefault(); return;
        }
        if ((event.key === "r" || event.key === "R") && inRoot) {
            if (!online || room.isHost) submitAction({ type: "restart" });
            event.preventDefault(); return;
        }
        if (!inRoot) return;
        const dirs = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] };
        const d = dirs[event.key];
        if (!d) return; /* Enter/Space activate focused buttons natively */
        event.preventDefault();
        const cur = document.activeElement.closest ? document.activeElement.closest(".am-tile") : null;
        if (!cur) { focusTile(0, 0); return; }
        const col = Math.min(1, Math.max(0, +cur.dataset.col + d[0]));
        const rows = col === 0 ? levelLetters(state.level).length : state.order.length;
        let row = (+cur.dataset.row + d[1] + rows) % rows;
        for (let i = 0; i < rows; i++) {           /* skip locked tiles */
            if (focusTile(col, row)) return;
            row = (row + (d[1] || 1) + rows) % rows;
        }
        for (let i = 0; i < rows; i++) {           /* fall back to other column */
            if (focusTile(1 - col, i)) return;
        }
    }

    /* ---------------- wiring ---------------- */
    root.addEventListener("click", handleClick);
    document.addEventListener("keydown", handleKey);

    if (online) {
        unsubs.push(room.onRoom((nextRoom) => { roomData = nextRoom; render(); }));
        if (room.isHost) {
            state = initialState();
            publish();
            /* remote actions always come from the guest's assigned seat */
            unsubs.push(room.onAction((action) => applyAction(action, state ? state.seats.guest : 1)));
        } else {
            unsubs.push(room.onState((nextState) => { if (nextState) { state = nextState; render(); } }));
        }
    } else {
        state = initialState();
        publish(); /* renders + schedules the bot if it won the coin toss */
    }

    return {
        destroy() {
            destroyed = true;
            clearTimeout(botTimer);
            root.removeEventListener("click", handleClick);
            document.removeEventListener("keydown", handleKey);
            for (const u of unsubs) if (typeof u === "function") u();
            root.innerHTML = "";
        },
    };
}