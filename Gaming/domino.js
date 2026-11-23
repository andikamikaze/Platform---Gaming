/* ==== GAME: domino.js ==== */
/* Domino - Draw / Block / All Fives. Solo vs bot or online (room). */

export const META = {
    id: "domino", // harus sama dengan nama file (tanpa .js)
    name: "Domino",
    category: "board",
    catLabel: "Board",
    desc: "Draw, Block, or All Fives domino - versus the bot or a friend.",
    art: '<svg viewBox="0 0 48 48" width="54" height="54" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="8" y="8" width="32" height="16" rx="3" fill="#f8fafc" stroke="#94a3b8"/><line x1="24" y1="8" x2="24" y2="24" stroke="#94a3b8"/><circle cx="16" cy="16" r="2.4" fill="#1e293b" stroke="none"/><circle cx="32" cy="12.5" r="2.4" fill="#1e293b" stroke="none"/><circle cx="32" cy="19.5" r="2.4" fill="#1e293b" stroke="none"/><rect x="14" y="28" width="20" height="14" rx="3" fill="#e2e8f0" stroke="#94a3b8" transform="rotate(-8 24 35)"/><circle cx="21" cy="35" r="2.2" fill="#1e293b" stroke="none"/><circle cx="28" cy="35" r="2.2" fill="#1e293b" stroke="none"/></svg>',
    bg: ["#7c2d12", "#78350f"],
};

/* ================= pure logic (serializable state) ================= */
const TARGET = 100;
const MODES = { draw: "Draw", block: "Block", fives: "All Fives" };
const pips = (t) => t.a + t.b;
const sum = (h) => h.reduce((x, t) => x + pips(t), 0);
const round5 = (n) => Math.round(n / 5) * 5;
const clone = (o) => JSON.parse(JSON.stringify(o));

function makeSet() {
    const t = [];
    for (let a = 0; a <= 6; a++) for (let b = a; b <= 6; b++) t.push({ a, b });
    return t;
}
function shuffle(arr) {
    const c = arr.slice();
    for (let i = c.length - 1; i > 0; i--) {
        const j = (Math.random() * (i + 1)) | 0;
        [c[i], c[j]] = [c[j], c[i]];
    }
    return c;
}
function blank(hostSeat) {
    return {
        phase: "menu", mode: null, hostSeat,
        hands: [[], []], boneyard: [], chain: [],
        leftEnd: null, rightEnd: null, turn: 0,
        score: [0, 0], passes: 0, over: false, winner: null,
        locked: false, round: 0, last: null, endInfo: null,
    };
}
/* standard shuffled deal - random first player, no level generator */
function deal(mode, hostSeat, round = 1, score = [0, 0]) {
    const deck = shuffle(makeSet());
    return {
        ...blank(hostSeat), phase: "play", mode,
        hands: [deck.slice(0, 7), deck.slice(7, 14)],
        boneyard: deck.slice(14),
        turn: Math.random() < 0.5 ? 0 : 1,
        score: score.slice(), round,
    };
}
function playable(s, i) {
    const out = [];
    if (!s.chain.length) {
        s.hands[i].forEach((t, k) => out.push({ side: "R", tileIdx: k }));
        return out;
    }
    s.hands[i].forEach((t, k) => {
        if (t.a === s.leftEnd || t.b === s.leftEnd) out.push({ side: "L", tileIdx: k });
        if (t.a === s.rightEnd || t.b === s.rightEnd) out.push({ side: "R", tileIdx: k });
    });
    return out;
}
function place(s, i, tileIdx, side) {
    if (!playable(s, i).some((m) => m.tileIdx === tileIdx && m.side === side))
        return { err: "illegal" };
    const hands = [s.hands[0].slice(), s.hands[1].slice()];
    const tile = hands[i].splice(tileIdx, 1)[0];
    const chain = s.chain.map((e) => ({ ...e }));
    let L = s.leftEnd, R = s.rightEnd;
    if (!chain.length) {
        chain.push({ L: tile.a, R: tile.b }); L = tile.a; R = tile.b;
    } else if (side === "L") {
        const e = tile.a === L ? { L: tile.b, R: tile.a } : { L: tile.a, R: tile.b };
        chain.unshift(e); L = e.L;
    } else {
        const e = tile.a === R ? { L: tile.a, R: tile.b } : { L: tile.b, R: tile.a };
        chain.push(e); R = e.R;
    }
    let gained = 0;
    if (s.mode === "fives") {
        const tot = L + R;
        if (tot > 0 && tot % 5 === 0) gained = tot;
    }
    const score = s.score.slice();
    if (gained) score[i] += gained;
    return {
        s: {
            ...s, hands, chain, leftEnd: L, rightEnd: R, score,
            passes: 0, turn: 1 - i,
            last: { by: i, kind: "play", a: tile.a, b: tile.b, gained },
        },
        gained, tile,
    };
}
/* one tap: draw until something fits (or the yard runs dry) */
function drawAuto(s, i) {
    const hands = [s.hands[0].slice(), s.hands[1].slice()];
    const by = s.boneyard.slice();
    const cur = { ...s, hands, boneyard: by };
    let drew = 0;
    while (by.length && !playable(cur, i).length) {
        hands[i].push(by.shift()); drew++;
    }
    cur.last = { by: i, kind: "draw", drew };
    return { s: cur, drew, stuck: !playable(cur, i).length };
}
function pass(s) {
    const passes = s.passes + 1;
    const ns = { ...s, passes, turn: 1 - s.turn, last: { by: s.turn, kind: "pass" } };
    if (passes >= 2) {
        const p = [sum(s.hands[0]), sum(s.hands[1])];
        const winner = p[0] < p[1] ? 0 : p[1] < p[0] ? 1 : null;
        return finish(ns, winner, "locked");
    }
    return ns;
}
function finish(s, winner, kind) {
    const p = [sum(s.hands[0]), sum(s.hands[1])];
    const score = s.score.slice();
    let gained = 0;
    if (s.mode === "fives" && winner != null) {
        gained = round5(p[1 - winner]);
        score[winner] += gained;
    }
    const hit = s.mode === "fives" && (score[0] >= TARGET || score[1] >= TARGET);
    const phase = s.mode === "fives" && !hit ? "round" : "over";
    return { ...s, score, over: true, winner, locked: kind === "locked", phase, endInfo: { kind, winner, pips: p, gained } };
}
function bestMove(s, i) {
    const moves = playable(s, i);
    let best = null, bv = -1;
    for (const m of moves) {
        const r = place(s, i, m.tileIdx, m.side);
        if (r.err) continue;
        const t = s.hands[i][m.tileIdx];
        const v = (r.gained || 0) * 100 + pips(t) + (t.a === t.b ? 5 : 0);
        if (v > bv) { bv = v; best = m; }
    }
    return best;
}
/* Firebase RTDB drops empty arrays - rebuild them on receive */
function normalize(s) {
    if (!s) return s;
    return {
        ...s,
        hands: [(s.hands && s.hands[0]) || [], (s.hands && s.hands[1]) || []],
        boneyard: s.boneyard || [], chain: s.chain || [], score: s.score || [0, 0],
        leftEnd: s.leftEnd ?? null, rightEnd: s.rightEnd ?? null,
        winner: s.winner ?? null, last: s.last || null, endInfo: s.endInfo || null,
    };
}

/* ================= tile art ================= */
const PIPS = {
    0: [], 1: [[22, 22]],
    2: [[13, 13], [31, 31]],
    3: [[13, 13], [22, 22], [31, 31]],
    4: [[13, 13], [31, 13], [13, 31], [31, 31]],
    5: [[13, 13], [31, 13], [22, 22], [13, 31], [31, 31]],
    6: [[13, 12], [31, 12], [13, 22], [31, 22], [13, 32], [31, 32]],
};
function halfSVG(v, ox, oy) {
    return PIPS[v].map((p) =>
        '<circle cx="' + (ox + p[0]) + '" cy="' + (oy + p[1]) + '" r="3.6" fill="#18181b"/>'
    ).join("");
}
function tileSVG(t, vert, mini) {
    const cls = "dm-tile" + (vert ? " dm-vert" : "") + (mini ? " dm-mini" : "");
    if (vert) {
        return '<svg class="' + cls + '" viewBox="0 0 44 88" aria-hidden="true">' +
            '<rect x="1" y="1" width="42" height="86" rx="6" fill="#fafafa" stroke="#d4d4d8"/>' +
            '<line x1="5" y1="44" x2="39" y2="44" stroke="#d4d4d8" stroke-width="2"/>' +
            halfSVG(t.a, 0, 0) + halfSVG(t.b, 0, 44) + "</svg>";
    }
    return '<svg class="' + cls + '" viewBox="0 0 66 44" aria-hidden="true">' +
        '<rect x="1" y="1" width="64" height="42" rx="6" fill="#fafafa" stroke="#d4d4d8"/>' +
        '<line x1="33" y1="5" x2="33" y2="39" stroke="#d4d4d8" stroke-width="2"/>' +
        halfSVG(t.a, -11, 0) + halfSVG(t.b, 22, 0) + "</svg>";
}
const esc = (t) => String(t).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

/* ================= mount ================= */
export function mount(root, context = {}) {
    const { mode = "ai", room = null, playerName = "Player", onExit = () => { } } = context;
    const online = mode === "room" && Boolean(room);
    let roomData = room?.room || null;
    let state = null;

    root.innerHTML = `
<div class="game-app dm-app">
<style>
.dm-app{--dm-acc:#f59e0b;--dm-line:rgba(127,127,127,.32);--dm-soft:rgba(127,127,127,.1);display:flex;flex-direction:column;gap:12px;-webkit-user-select:none;user-select:none}
.dm-app .game-intro{display:flex;align-items:flex-start;justify-content:space-between;gap:10px;flex-wrap:wrap}
.dm-app h2{margin:0;font-size:20px;font-weight:650;letter-spacing:.2px}
.dm-chips{display:flex;gap:6px;flex-wrap:wrap;margin-top:6px}
.dm-chip{font-size:10.5px;font-weight:650;letter-spacing:.8px;text-transform:uppercase;opacity:.75;border:1px solid var(--dm-line);border-radius:999px;padding:3px 9px;white-space:nowrap}
.dm-app .game-panel{position:relative;padding:14px;border:1px solid var(--dm-line);border-radius:14px;background:transparent}
.dm-board{display:flex;flex-direction:column;gap:10px}
.dm-label{display:block;text-align:center;font-size:10.5px;font-weight:650;letter-spacing:.8px;text-transform:uppercase;opacity:.55;margin-bottom:5px;min-height:13px}
.dm-row{display:flex;gap:5px;flex-wrap:wrap;justify-content:center;align-items:center;min-height:38px}
.dm-back{width:22px;height:34px;border-radius:5px;background:#52525b;border:1px solid #3f3f46}
.dm-chainwrap{display:flex;gap:8px;align-items:stretch}
.dm-chainbox{flex:1;overflow-x:auto;scrollbar-width:thin;background:var(--dm-soft);border:1px solid var(--dm-line);border-radius:12px;padding:8px;min-height:92px;display:flex;align-items:center}
.dm-chain{display:flex;gap:4px;align-items:center;margin:0 auto}
.dm-empty{opacity:.35;margin:0 auto;font-size:18px}
.dm-tile{display:block;width:clamp(46px,11vw,64px);height:auto}
.dm-tile.dm-vert{width:clamp(26px,6.5vw,42px)}
.dm-tile.dm-mini{width:30px}
.dm-end{width:44px;min-width:44px;border-radius:10px;border:1px solid var(--dm-line);background:transparent;color:inherit;font-size:17px;font-weight:700;cursor:default;touch-action:manipulation}
.dm-end.dm-live{border-color:var(--dm-acc);color:var(--dm-acc);background:rgba(245,158,11,.12);cursor:pointer;animation:dm-pulse 1.2s ease-in-out infinite}
@keyframes dm-pulse{50%{box-shadow:0 0 0 4px rgba(245,158,11,.18)}}
.dm-msg{text-align:center;font-size:13px;opacity:.75;min-height:18px}
.dm-hand{min-height:56px}
.dm-cell{position:relative;background:none;border:0;padding:2px;border-radius:9px;cursor:default;touch-action:manipulation;transition:transform .12s}
.dm-cell.dm-ok{cursor:pointer}
.dm-cell.dm-ok:hover{transform:translateY(-3px)}
.dm-cell.dm-dim{opacity:.35}
.dm-cell.dm-sel{outline:2px solid var(--dm-acc);outline-offset:1px}
.dm-cell.dm-hint{outline:2px dashed #10b981;outline-offset:1px}
.dm-hintbadge{position:absolute;top:-6px;right:-4px;background:#10b981;color:#fff;font-style:normal;font-size:10px;font-weight:700;border-radius:6px;padding:1px 5px}
.dm-controls{display:flex;gap:8px;justify-content:center;align-items:center;flex-wrap:wrap;margin-top:2px}
.dm-nav,.dm-primary{display:flex;gap:6px}
.dm-btn{height:42px;min-width:42px;padding:0 14px;border-radius:10px;border:1px solid var(--dm-line);background:transparent;color:inherit;font:inherit;font-size:14px;font-weight:600;cursor:pointer;touch-action:manipulation;display:inline-flex;align-items:center;justify-content:center;gap:6px}
.dm-btn:disabled{opacity:.35;cursor:default}
.dm-btn.dm-acc{background:var(--dm-acc);border-color:var(--dm-acc);color:#1c1917}
.dm-btn.dm-acc:disabled{background:transparent;color:inherit}
.dm-btn.dm-small{height:32px;min-width:32px;padding:0 12px;font-size:13px}
.dm-btn.dm-wide{width:100%;margin-top:8px}
.dm-app kbd{font-size:10px;border:1px solid currentColor;border-radius:4px;padding:0 4px;opacity:.6}
@media (hover:none){.dm-app kbd{display:none}}
.dm-ov{position:absolute;inset:0;z-index:20;display:flex;align-items:center;justify-content:center;background:rgba(9,9,11,.45);backdrop-filter:blur(3px);border-radius:inherit;padding:12px}
.dm-card{background:#fafafa;color:#18181b;border-radius:14px;padding:18px;width:min(100%,330px);max-height:100%;overflow:auto;box-shadow:0 12px 32px rgba(0,0,0,.28)}
.dm-card h3{margin:0 0 4px;font-size:18px;font-weight:650}
.dm-card p{margin:6px 0;font-size:13.5px;line-height:1.45;opacity:.8}
.dm-card .dm-btn{border-color:#d4d4d8}
.dm-card .dm-btn.dm-acc{border-color:var(--dm-acc)}
.dm-win{color:#059669}.dm-lose{color:#dc2626}
.dm-wait{opacity:.6;font-size:13.5px}
.dm-cheatcard{width:min(100%,360px)}
.dm-chead{display:flex;align-items:center;justify-content:space-between;margin-bottom:6px}
.dm-crow{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:9px 0;border-bottom:1px solid #e4e4e7;font-size:14px}
.dm-crow:last-child{border-bottom:0}
.dm-sw{width:40px;height:22px;min-width:40px;border-radius:999px;border:1px solid #d4d4d8;background:#e4e4e7;position:relative;cursor:pointer;padding:0;touch-action:manipulation}
.dm-sw span{position:absolute;top:2px;left:2px;width:16px;height:16px;border-radius:50%;background:#fff;transition:left .15s;box-shadow:0 1px 2px rgba(0,0,0,.2)}
.dm-sw[aria-pressed="true"]{background:var(--dm-acc);border-color:var(--dm-acc)}
.dm-sw[aria-pressed="true"] span{left:20px}
.dm-peek{display:flex;flex-wrap:wrap;gap:4px;padding:8px 0}
.dm-note{font-size:11.5px;opacity:.55;margin-top:8px}
.dm-sep{font-size:10.5px;font-weight:700;letter-spacing:.8px;text-transform:uppercase;opacity:.5;margin-top:10px}
.dm-app .game-actions{display:flex;gap:8px;flex-wrap:wrap}
.dm-app .game-action-button{touch-action:manipulation}
.dm-app button:focus-visible,.dm-cell:focus-visible{outline:2px solid var(--dm-acc);outline-offset:2px}
@media (max-width:560px){.dm-app .game-actions .game-action-button{flex:1}.dm-end{width:40px;min-width:40px}}
@media (prefers-reduced-motion:reduce){.dm-cell,.dm-sw span{transition:none}.dm-end.dm-live{animation:none}}
</style>
<div class="game-intro">
  <div>
    <h2>Domino</h2>
    <div class="dm-chips">
      <span class="dm-chip" data-hud="mode">—</span>
      <span class="dm-chip" data-hud="round" hidden></span>
      <span class="dm-chip" data-hud="score" hidden></span>
      <span class="dm-chip" data-hud="bone" hidden></span>
      <span class="dm-chip" data-hud="seat" hidden></span>
    </div>
  </div>
  <span class="game-status"><i class="game-status-dot"></i><span data-status aria-live="polite">Ready</span></span>
</div>
<section class="game-panel" data-board>
  <div class="dm-board">
    <div><span class="dm-label" data-g="opplabel"></span><div class="dm-row" data-g="opp"></div></div>
    <div class="dm-chainwrap">
      <button class="dm-end" type="button" data-end="L" aria-label="Left end">–</button>
      <div class="dm-chainbox"><div class="dm-chain" data-g="chain"></div></div>
      <button class="dm-end" type="button" data-end="R" aria-label="Right end">–</button>
    </div>
    <div class="dm-msg" data-g="msg" aria-live="polite"></div>
    <div class="dm-row dm-hand" data-g="hand"></div>
    <div class="dm-controls">
      <div class="dm-nav">
        <button class="dm-btn" type="button" data-act="sel-prev" aria-label="Previous tile">◀</button>
        <button class="dm-btn" type="button" data-act="sel-next" aria-label="Next tile">▶</button>
      </div>
      <div class="dm-primary" data-g="primary"></div>
    </div>
  </div>
  <div class="dm-ov" data-ov="menu" hidden><div class="dm-card" data-card="menu"></div></div>
  <div class="dm-ov" data-ov="round" hidden><div class="dm-card" data-card="round"></div></div>
  <div class="dm-ov" data-ov="over" hidden><div class="dm-card" data-card="over"></div></div>
  <div class="dm-ov" data-ov="cheat" hidden><div class="dm-card dm-cheatcard" data-card="cheat"></div></div>
</section>
<div class="game-actions">
  <button class="game-action-button" type="button" data-act="restart" title="Restart (N)">Restart</button>
  <button class="game-action-button" type="button" data-act="modes">Mode</button>
  <button class="game-action-button" type="button" data-act="cheats" title="Cheats (C)">Cheats</button>
  <button class="game-action-button" type="button" data-exit>Exit game</button>
</div>
</div>`;

    const $ = (s) => root.querySelector(s);
    const statusEl = $("[data-status]");
    const chips = {
        mode: $('[data-hud="mode"]'), round: $('[data-hud="round"]'),
        score: $('[data-hud="score"]'), bone: $('[data-hud="bone"]'), seat: $('[data-hud="seat"]'),
    };
    const oppLabel = $('[data-g="opplabel"]');
    const oppRow = $('[data-g="opp"]');
    const chainEl = $('[data-g="chain"]');
    const chainBox = $(".dm-chainbox");
    const lendBtn = $('[data-end="L"]');
    const rendBtn = $('[data-end="R"]');
    const msgEl = $('[data-g="msg"]');
    const handEl = $('[data-g="hand"]');
    const primaryEl = $('[data-g="primary"]');
    const navPrev = $('[data-act="sel-prev"]');
    const navNext = $('[data-act="sel-next"]');
    const ov = {
        menu: $('[data-ov="menu"]'), round: $('[data-ov="round"]'),
        over: $('[data-ov="over"]'), cheat: $('[data-ov="cheat"]'),
    };
    const card = {
        menu: $('[data-card="menu"]'), round: $('[data-card="round"]'),
        over: $('[data-card="over"]'), cheat: $('[data-card="cheat"]'),
    };
    const restartBtn = $('[data-act="restart"]');
    const modesBtn = $('[data-act="modes"]');

    /* ---------- local (non-shared) state ---------- */
    let destroyed = false;
    let sel = -1;
    let cheatOpen = false;
    const cheats = { reveal: false, peek: false, hint: false };
    let history = [];
    let timers = [];
    let botTimer = 0;
    let msgOverride = null;
    let lastChainLen = 0;
    const unsubs = [];

    const meName = playerName || "You";
    const oppName = () => (online ? "Opponent" : "Bot");
    const mySeat = () => (online && state ? (room.isHost ? state.hostSeat : 1 - state.hostSeat) : 0);
    const priv = () => (online ? Boolean(room.isHost) : true);

    function later(fn, ms) {
        const id = setTimeout(() => {
            timers = timers.filter((t) => t !== id);
            if (!destroyed) fn();
        }, ms);
        timers.push(id);
        return id;
    }
    function cancelBot() {
        if (botTimer) { clearTimeout(botTimer); timers = timers.filter((t) => t !== botTimer); botTimer = 0; }
    }
    function snapshot() {
        if (online || !state) return;
        history.push(clone(state));
        if (history.length > 30) history.shift();
    }
    function flash(text) {
        msgOverride = text;
        render();
        later(() => { msgOverride = null; render(); }, 900);
    }

    /* ---------- actions (host-authoritative when online) ---------- */
    function applyAction(action, actor) {
        if (!state || !action || typeof action.type !== "string") return;
        const t = action.type;
        const privileged = online ? actor === state.hostSeat : actor === 0;
        if (t === "start") {
            if (state.phase !== "menu" || !privileged || !MODES[action.mode]) return;
            cancelBot(); history = [];
            state = deal(action.mode, state.hostSeat);
        } else if (t === "restart") {
            if (state.phase === "menu" || !privileged) return;
            cancelBot(); history = [];
            state = deal(state.mode, state.hostSeat); // same mode, fresh deal
        } else if (t === "menu") {
            if (!privileged) return;
            cancelBot(); history = [];
            state = blank(state.hostSeat);
        } else if (t === "next") {
            if (state.phase !== "round" || !privileged) return;
            cancelBot(); history = [];
            state = deal(state.mode, state.hostSeat, state.round + 1, state.score);
        } else if (t === "play") {
            if (state.phase !== "play" || actor !== state.turn) return;
            const r = place(state, actor, action.tileIdx | 0, String(action.side));
            if (r.err) return;
            let ns = r.s;
            if (!ns.hands[actor].length) ns = finish(ns, actor, "domino");
            else if (ns.mode === "fives" && ns.score[actor] >= TARGET)
                ns = {
                    ...ns, over: true, winner: actor, phase: "over",
                    endInfo: { kind: "target", winner: actor, pips: [sum(ns.hands[0]), sum(ns.hands[1])], gained: r.gained }
                };
            state = ns;
        } else if (t === "draw") {
            if (state.phase !== "play" || actor !== state.turn || state.mode !== "draw" ||
                !state.boneyard.length || playable(state, actor).length) return;
            const r = drawAuto(state, actor);
            let ns = r.s;
            if (r.stuck) ns = { ...pass(ns), last: { by: actor, kind: "drawpass", drew: r.drew } };
            state = ns;
        } else if (t === "pass") {
            if (state.phase !== "play" || actor !== state.turn || playable(state, actor).length) return;
            if (state.mode === "draw" && state.boneyard.length) return;
            state = pass(state);
        } else return;
        sel = -1;
        publish();
    }

    function submitAction(action) {
        if (online && !room.isHost) { room.sendAction(action).catch(console.warn); return; }
        if (!online && (action.type === "play" || action.type === "draw" || action.type === "pass")) snapshot();
        applyAction(action, online ? state.hostSeat : 0);
    }

    function publish() {
        render();
        if (online && room.isHost) room.publishState(clone(state)).catch(console.warn);
        maybeBot();
    }

    /* ---------- bot (AI mode only) ---------- */
    function maybeBot() {
        if (online || destroyed || !state || state.phase !== "play" || state.turn !== 1 || botTimer) return;
        botTimer = later(() => { botTimer = 0; botStep(); }, 650 + Math.random() * 550);
    }
    function botStep() {
        if (!state || state.phase !== "play" || state.turn !== 1) return;
        const moves = playable(state, 1);
        if (moves.length) {
            const m = bestMove(state, 1);
            applyAction({ type: "play", tileIdx: m.tileIdx, side: m.side }, 1);
        } else if (state.mode === "draw" && state.boneyard.length) {
            applyAction({ type: "draw" }, 1); // maybeBot() chains the follow-up play
        } else {
            applyAction({ type: "pass" }, 1);
        }
    }

    /* ---------- cheats ---------- */
    function undo() {
        if (online || !history.length || !state || state.phase === "menu") return;
        cancelBot();
        state = history.pop();
        sel = -1;
        publish();
    }
    function cheatAction(name) {
        if (name === "reveal" || name === "peek" || name === "hint") {
            cheats[name] = !cheats[name];
            render();
            return;
        }
        if (!state || state.phase === "menu") return;
        if (name === "undo") { undo(); return; }
        if (online || state.phase !== "play") return;
        if (name === "skip") {
            if (state.turn !== 1) return;
            cancelBot(); snapshot();
            state = { ...state, turn: 0, passes: 0, last: { by: 1, kind: "skip" } };
            publish();
        } else if (name === "points") {
            if (state.mode !== "fives") return;
            snapshot();
            const score = state.score.slice();
            score[0] += 25;
            let ns = { ...state, score, last: { by: 0, kind: "cheat" } };
            if (score[0] >= TARGET)
                ns = {
                    ...ns, over: true, winner: 0, phase: "over",
                    endInfo: { kind: "target", winner: 0, pips: [sum(ns.hands[0]), sum(ns.hands[1])], gained: 25 }
                };
            state = ns;
            publish();
        } else if (name === "win") {
            snapshot(); cancelBot();
            state = finish({ ...state, last: { by: 0, kind: "cheat" } }, 0, "domino");
            publish();
        }
    }

    /* ---------- selection helpers ---------- */
    const myTurn = () => state && state.phase === "play" && state.turn === mySeat();
    function legalIdxs() {
        if (!myTurn()) return [];
        return [...new Set(playable(state, mySeat()).map((m) => m.tileIdx))];
    }
    function legalSides(k) {
        if (!myTurn()) return [];
        return playable(state, mySeat()).filter((m) => m.tileIdx === k).map((m) => m.side);
    }
    const ambiguous = (sides) => sides.length === 2 && state.leftEnd !== state.rightEnd;

    function tileClick(k) {
        if (!myTurn()) return;
        const sides = legalSides(k);
        if (!sides.length) { flash("No match"); return; }
        if (!ambiguous(sides)) {
            submitAction({ type: "play", tileIdx: k, side: sides.includes("R") ? "R" : sides[0] });
            return;
        }
        sel = sel === k ? -1 : k;
        render();
    }
    function playSelected() {
        if (!myTurn()) return;
        const idxs = legalIdxs();
        if (!idxs.length) return;
        if (sel < 0 || !idxs.includes(sel)) { sel = idxs[0]; render(); }
        const sides = legalSides(sel);
        if (ambiguous(sides)) { render(); return; } // pick a side: L/R buttons or keys
        submitAction({ type: "play", tileIdx: sel, side: sides.includes("R") ? "R" : sides[0] });
    }
    function moveSel(d) {
        const idxs = legalIdxs();
        if (!idxs.length) return;
        const pos = idxs.indexOf(sel);
        sel = pos < 0 ? idxs[d > 0 ? 0 : idxs.length - 1] : idxs[(pos + d + idxs.length) % idxs.length];
        render();
    }
    function chooseSide(side) {
        if (sel < 0 || !myTurn()) return;
        const sides = legalSides(sel);
        if (ambiguous(sides) && sides.includes(side))
            submitAction({ type: "play", tileIdx: sel, side });
    }
    const canDraw = () => myTurn() && !playable(state, mySeat()).length && state.mode === "draw" && state.boneyard.length > 0;
    const canPass = () => myTurn() && !playable(state, mySeat()).length && (state.mode !== "draw" || !state.boneyard.length);

    /* ---------- rendering ---------- */
    function lastMsg(s, my) {
        const l = s.last;
        if (!l) return "";
        const who = l.by === my ? "You" : oppName();
        if (l.kind === "play") return who + " played " + l.a + "|" + l.b + (l.gained ? " (+" + l.gained + ")" : "");
        if (l.kind === "draw") return who + " drew " + l.drew;
        if (l.kind === "drawpass") return who + " drew " + l.drew + " - passed";
        if (l.kind === "pass") return who + " passed";
        if (l.kind === "skip") return "Bot skipped";
        if (l.kind === "cheat") return "Cheat applied";
        return "";
    }
    function endReason(s, my) {
        const e = s.endInfo;
        if (!e) return "";
        const name = (w) => (w == null ? "Nobody" : w === my ? "You" : oppName());
        if (e.kind === "domino") return name(e.winner) + " dominoed" + (e.gained ? " (+" + e.gained + ")" : "");
        if (e.kind === "locked") return "Locked - You " + e.pips[my] + " / " + oppName() + " " + e.pips[1 - my] + " pips";
        if (e.kind === "target") return name(e.winner) + " reached " + TARGET;
        return "";
    }
    function cheatHTML(s) {
        const sw = (label, key) =>
            '<div class="dm-crow"><span>' + label + '</span><button type="button" class="dm-sw" data-cheat="' + key +
            '" aria-pressed="' + cheats[key] + '" aria-label="' + label + '"><span></span></button></div>';
        const btn = (label, key, dis) =>
            '<div class="dm-crow"><span>' + label + '</span><button type="button" class="dm-btn dm-small" data-cheat="' + key +
            '"' + (dis ? " disabled" : "") + ">Use</button></div>";
        const play = s && s.phase === "play";
        let h = '<div class="dm-chead"><h3>Cheats</h3><button type="button" class="dm-btn dm-small" data-act="close-cheats" aria-label="Close">✕</button></div>';
        h += sw("Reveal opponent hand", "reveal");
        h += sw("Peek boneyard", "peek");
        if (cheats.peek && s && s.boneyard.length)
            h += '<div class="dm-peek">' + s.boneyard.map((t) => tileSVG(t, false, true)).join("") + "</div>";
        h += sw("Best-move hint", "hint");
        h += '<div class="dm-sep">Assists</div>';
        h += btn("Undo last move", "undo", online || !history.length);
        h += btn("Skip bot turn", "skip", online || !play || !s || s.turn === mySeat());
        h += btn("+25 points", "points", online || !play || !s || s.mode !== "fives");
        h += btn("Win this round", "win", online || !play);
        if (online) h += '<div class="dm-note">Assists are disabled in multiplayer.</div>';
        return h;
    }

    function render() {
        const s = state;
        const my = s ? mySeat() : 0;
        const opp = 1 - my;
        restartBtn.disabled = !s || s.phase === "menu" || !priv();
        modesBtn.disabled = !priv();
        ov.cheat.hidden = !cheatOpen;
        if (cheatOpen) card.cheat.innerHTML = cheatHTML(s);

        if (!s) {
            statusEl.textContent = "Connecting...";
            chips.mode.textContent = "—";
            chips.round.hidden = chips.score.hidden = chips.bone.hidden = chips.seat.hidden = true;
            oppLabel.textContent = ""; oppRow.innerHTML = ""; chainEl.innerHTML = "";
            handEl.innerHTML = ""; primaryEl.innerHTML = ""; msgEl.textContent = "";
            lendBtn.textContent = rendBtn.textContent = "–";
            lendBtn.disabled = rendBtn.disabled = true;
            lendBtn.classList.remove("dm-live"); rendBtn.classList.remove("dm-live");
            navPrev.disabled = navNext.disabled = true;
            ov.round.hidden = ov.over.hidden = true;
            ov.menu.hidden = false;
            card.menu.innerHTML = "<h3>Domino</h3><p class='dm-wait'>Waiting for host...</p>";
            return;
        }

        const inGame = s.phase !== "menu";
        const mine = myTurn();
        const idxs = legalIdxs();
        const selSides = sel >= 0 && idxs.includes(sel) ? legalSides(sel) : [];
        const chooseSideNow = mine && selSides.length === 2 && s.leftEnd !== s.rightEnd;
        const hint = cheats.hint && mine ? bestMove(s, my) : null;

        /* status + chips */
        statusEl.textContent =
            s.phase === "menu" ? (priv() ? "Choose a mode" : "Waiting for host...") :
                s.phase === "play" ? (mine ? "Your turn" : online ? "Opponent's turn" : "Bot is thinking...") :
                    s.phase === "round" ? "Round over" :
                        s.winner == null ? "Tie" : s.winner === my ? "You win" : oppName() + " wins";
        chips.mode.textContent = s.mode ? MODES[s.mode] : "—";
        chips.round.hidden = !(inGame && s.mode === "fives");
        chips.score.hidden = !(inGame && s.mode === "fives");
        if (inGame && s.mode === "fives") {
            chips.round.textContent = "Round " + s.round;
            chips.score.textContent = "You " + s.score[my] + " / " + s.score[opp];
        }
        chips.bone.hidden = !inGame;
        if (inGame) chips.bone.textContent = "Yard " + s.boneyard.length;
        chips.seat.hidden = !(online && inGame);
        if (online && inGame) chips.seat.textContent = "You are P" + (my + 1);

        /* opponent */
        oppLabel.textContent = inGame ? oppName() + " - " + s.hands[opp].length : "";
        oppRow.innerHTML = !inGame ? "" :
            cheats.reveal ? s.hands[opp].map((t) => tileSVG(t, false, true)).join("") :
                s.hands[opp].map(() => '<span class="dm-back"></span>').join("");

        /* chain + ends */
        chainEl.innerHTML = s.chain.length
            ? s.chain.map((e) => tileSVG({ a: e.L, b: e.R }, e.L === e.R, false)).join("")
            : '<span class="dm-empty">—</span>';
        if (s.chain.length > lastChainLen) chainBox.scrollLeft = chainBox.scrollWidth;
        lastChainLen = s.chain.length;
        lendBtn.textContent = s.leftEnd ?? "–";
        rendBtn.textContent = s.rightEnd ?? "–";
        const lLive = chooseSideNow && selSides.includes("L");
        const rLive = chooseSideNow && selSides.includes("R");
        lendBtn.disabled = !lLive; rendBtn.disabled = !rLive;
        lendBtn.classList.toggle("dm-live", lLive);
        rendBtn.classList.toggle("dm-live", rLive);

        /* message */
        msgEl.textContent = msgOverride ??
            (s.phase === "round" || s.phase === "over" ? endReason(s, my) :
                inGame ? lastMsg(s, my) : "");

        /* hand */
        handEl.innerHTML = s.hands[my].map((t, k) => {
            const ok = mine && idxs.includes(k);
            const cls = "dm-cell" + (ok ? " dm-ok" : " dm-dim") +
                (k === sel ? " dm-sel" : "") +
                (hint && hint.tileIdx === k ? " dm-hint" : "");
            const badge = hint && hint.tileIdx === k ? '<i class="dm-hintbadge">' + hint.side + "</i>" : "";
            return '<button type="button" class="' + cls + '" data-k="' + k + '" aria-label="Tile ' + t.a + " " + t.b + '">' +
                tileSVG(t, false, false) + badge + "</button>";
        }).join("");

        /* virtual controls */
        navPrev.disabled = navNext.disabled = !mine || !idxs.length;
        let p = "";
        if (chooseSideNow) {
            p = '<button type="button" class="dm-btn dm-acc" data-side="L">◀ ' + s.leftEnd + " <kbd>L</kbd></button>" +
                '<button type="button" class="dm-btn dm-acc" data-side="R">' + s.rightEnd + " ▶ <kbd>R</kbd></button>";
        } else if (mine && idxs.length) {
            p = '<button type="button" class="dm-btn dm-acc" data-act="play">Play <kbd>⏎</kbd></button>';
        } else if (canDraw()) {
            p = '<button type="button" class="dm-btn dm-acc" data-act="draw">Draw ' + s.boneyard.length + " <kbd>D</kbd></button>";
        } else if (canPass()) {
            p = '<button type="button" class="dm-btn dm-acc" data-act="pass">Pass <kbd>P</kbd></button>';
        } else {
            p = '<button type="button" class="dm-btn" disabled>' + (inGame && s.phase === "play" ? "Wait" : "—") + "</button>";
        }
        primaryEl.innerHTML = p;

        /* overlays */
        ov.menu.hidden = s.phase !== "menu";
        ov.round.hidden = s.phase !== "round";
        ov.over.hidden = s.phase !== "over";
        if (s.phase === "menu") {
            card.menu.innerHTML = "<h3>Domino</h3>" + (priv()
                ? '<button type="button" class="dm-btn dm-acc dm-wide" data-mode="draw">Draw</button>' +
                '<button type="button" class="dm-btn dm-wide" data-mode="block">Block</button>' +
                '<button type="button" class="dm-btn dm-wide" data-mode="fives">All Fives - to ' + TARGET + "</button>"
                : '<p class="dm-wait">Waiting for host...</p>');
        }
        if (s.phase === "round") {
            card.round.innerHTML = "<h3>Round " + s.round + "</h3><p>" + esc(endReason(s, my)) +
                "</p><p>You " + s.score[my] + " / " + esc(oppName()) + " " + s.score[opp] + "</p>" +
                (priv() ? '<button type="button" class="dm-btn dm-acc dm-wide" data-act="next">Next round</button>'
                    : '<p class="dm-wait">Waiting for host...</p>');
        }
        if (s.phase === "over") {
            const tie = s.winner == null;
            const you = !tie && s.winner === my;
            card.over.innerHTML =
                '<h3 class="' + (tie ? "" : you ? "dm-win" : "dm-lose") + '">' +
                (tie ? "Tie" : you ? "You win" : esc(oppName()) + " wins") + "</h3><p>" +
                esc(endReason(s, my)) +
                (s.mode === "fives" ? " - final You " + s.score[my] + " / " + esc(oppName()) + " " + s.score[opp] : "") +
                "</p>" +
                (priv() ? '<button type="button" class="dm-btn dm-acc dm-wide" data-act="restart">Play again</button>' +
                    '<button type="button" class="dm-btn dm-wide" data-act="modes">Change mode</button>'
                    : '<p class="dm-wait">Waiting for host...</p>');
        }
    }

    /* ---------- input: mouse / touch ---------- */
    function handleClick(event) {
        const el = event.target.closest("[data-exit],[data-act],[data-mode],[data-cheat],[data-k],[data-side],[data-end]");
        if (!el || el.disabled) return;
        if (el.hasAttribute("data-exit")) { onExit(); return; }
        if (el.dataset.cheat) { cheatAction(el.dataset.cheat); return; }
        if (el.dataset.mode) { submitAction({ type: "start", mode: el.dataset.mode }); return; }
        const act = el.dataset.act;
        if (act) {
            if (act === "cheats") { cheatOpen = !cheatOpen; render(); }
            else if (act === "close-cheats") { cheatOpen = false; render(); }
            else if (act === "restart") submitAction({ type: "restart" });
            else if (act === "modes") submitAction({ type: "menu" });
            else if (act === "next") submitAction({ type: "next" });
            else if (act === "sel-prev") moveSel(-1);
            else if (act === "sel-next") moveSel(1);
            else if (act === "play") playSelected();
            else if (act === "draw") { if (canDraw()) submitAction({ type: "draw" }); }
            else if (act === "pass") { if (canPass()) submitAction({ type: "pass" }); }
            return;
        }
        if (el.dataset.side) { chooseSide(el.dataset.side); return; }
        if (el.dataset.end) { chooseSide(el.dataset.end); return; }
        if (el.dataset.k !== undefined) { tileClick(+el.dataset.k); return; }
    }

    /* ---------- input: keyboard ---------- */
    function handleKey(event) {
        if (destroyed) return;
        const tag = (event.target.tagName || "").toLowerCase();
        if (tag === "input" || tag === "textarea" || event.target.isContentEditable) return;
        const k = event.key;
        if (k === "Escape") {
            if (cheatOpen) { cheatOpen = false; render(); }
            else if (sel >= 0) { sel = -1; render(); }
            return;
        }
        if (k === "c" || k === "C") { cheatOpen = !cheatOpen; render(); event.preventDefault(); return; }
        if (cheatOpen || !state) return;
        if (k === "n" || k === "N") { if (priv()) submitAction({ type: "restart" }); return; }
        if (k === "u" || k === "U") { undo(); return; }
        if (state.phase !== "play") return;
        if (k === "ArrowLeft") { moveSel(-1); event.preventDefault(); }
        else if (k === "ArrowRight") { moveSel(1); event.preventDefault(); }
        else if (k === "Enter" || k === " ") { playSelected(); event.preventDefault(); }
        else if (k === "l" || k === "L") chooseSide("L");
        else if (k === "r" || k === "R") chooseSide("R");
        else if (k === "d" || k === "D") { if (canDraw()) submitAction({ type: "draw" }); }
        else if (k === "p" || k === "P") { if (canPass()) submitAction({ type: "pass" }); }
    }

    root.addEventListener("click", handleClick);
    document.addEventListener("keydown", handleKey);

    /* ---------- boot ---------- */
    if (online) {
        const offRoom = room.onRoom?.((nextRoom) => { roomData = nextRoom; render(); });
        if (typeof offRoom === "function") unsubs.push(offRoom);
        if (room.isHost) {
            // random seat assignment: host may be P1 or P2
            state = blank(Math.random() < 0.5 ? 0 : 1);
            publish();
            const offAction = room.onAction?.((action) => applyAction(action, 1 - state.hostSeat));
            if (typeof offAction === "function") unsubs.push(offAction);
        } else {
            const offState = room.onState?.((nextState) => {
                if (!nextState) return;
                state = normalize(nextState);
                sel = -1;
                render();
            });
            if (typeof offState === "function") unsubs.push(offState);
        }
    } else {
        state = blank(0);
        render();
    }
    void roomData;

    return {
        destroy() {
            destroyed = true;
            root.removeEventListener("click", handleClick);
            document.removeEventListener("keydown", handleKey);
            cancelBot();
            timers.forEach(clearTimeout);
            timers = [];
            unsubs.forEach((u) => { try { u(); } catch (e) { console.warn(e); } });
        },
    };
}