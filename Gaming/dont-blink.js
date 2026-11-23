/* ==== GAME: dont-blink.js ==== */
/*
 * Don't Blink - ported to the game template (export META + mount).
 * Setelah edit: node tools/build-games-manifest.mjs
 *
 * - 8 ronde tetap (bukan generator level acak tanpa akhir), pembuatan grid
 *   seeded per-match dan SELALU ada tepat 1 perubahan -> selalu bisa diselesaikan.
 * - Turn-based: vs Bot (mode "ai") atau 1v1 (mode "room", host authoritative).
 * - Giliran pertama diacak tiap match; kursi P1/P2 diacak tiap match (online).
 * - Tanpa teks tutorial; tanpa tombol virtual (mobile tap langsung grid).
 * - Desktop: mouse + keyboard (1-9, panah + Enter, Space, R, C, Esc).
 * - Cheat overlay: reveal target, slow watch, infinite lives, auto spot.
 */

export const META = {
    id: "dont-blink", // harus sama dengan nama file (tanpa .js)
    name: "Don't Blink",
    category: "educational",
    catLabel: "Educational",
    desc: "Memorize the grid, then spot the one shape that changed after the blink.",
    art: '<svg viewBox="0 0 48 48" width="54" height="54" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 24s8-11 22-11 22 11 22 11-8 11-22 11S2 24 2 24z"/><circle cx="24" cy="24" r="5"/></svg>',
    bg: ["#fda4af", "#f43f5e"],
    bestKey: "dontBlinkBest",
};

/* ---------------- constants ---------------- */
const ROUNDS = 8;
const LIVES = 3;
const FIND_MS = 15000; /* batas waktu mencari (anti-stall di multiplayer) */
const BLINK_MS = 460;
const CHANGE_MS = 150; /* perubahan diterapkan di tengah kedipan */
const REVEAL_MS = 1250;
const SIZES = [3, 3, 4, 4, 4, 5, 5, 5];
const KINDS = ["color", "shape", "color", "size", "shape", "size", "color", "shape"];

const SHAPES = {
    circle: '<circle cx="20" cy="20" r="13"/>',
    square: '<rect x="8" y="8" width="24" height="24" rx="4"/>',
    triangle: '<path d="M20 7l13 24H7z"/>',
    diamond: '<path d="M20 6l14 14-14 14L6 20z"/>',
    star: '<path d="M20 6l4.2 9.2 10 .9-7.6 6.6 2.3 9.8L20 26.8l-8.9 5.7 2.3-9.8L5.8 16.1l10-.9z"/>',
    hexagon: '<path d="M20 6l12 7v14l-12 7-12-7V13z"/>',
};
const COLORS = ["#ef4444", "#f59e0b", "#34d399", "#38bdf8", "#a78bfa", "#f472b6"];
const SHAPE_KEYS = Object.keys(SHAPES);

const CHEAT_DEFS = [
    { key: "reveal", label: "Reveal target" },
    { key: "slow", label: "Slow watch x2.5" },
    { key: "lives", label: "Infinite lives" },
    { key: "auto", label: "Auto spot" },
];

/* PRNG deterministik: grid identik untuk host & guest, match selalu valid */
function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function makeRound(seed, idx, slow) {
    const rnd = mulberry32((seed + idx * 7919) >>> 0);
    const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
    const n = SIZES[idx];
    const kind = KINDS[idx];
    const cells = [];
    for (let k = 0; k < n * n; k++) {
        cells.push({ shape: pick(SHAPE_KEYS), color: pick(COLORS), big: false });
    }
    const ci = Math.floor(rnd() * cells.length);
    const before = Object.assign({}, cells[ci]);
    const t = cells[ci];
    /* tepat satu perubahan yang dijamin terlihat -> ronde selalu bisa diselesaikan */
    if (kind === "color") {
        let c;
        do { c = pick(COLORS); } while (c === t.color);
        t.color = c;
    } else if (kind === "shape") {
        let s;
        do { s = pick(SHAPE_KEYS); } while (s === t.shape);
        t.shape = s;
    } else {
        t.big = true;
    }
    const obs = Math.max(1800, 3600 - idx * 220);
    return { n, cells, ci, before, obs: Math.round(obs * (slow ? 2.5 : 1)) };
}

function cellSvg(c) {
    const scale = c.big ? ' transform="translate(20 20) scale(1.28) translate(-20 -20)"' : "";
    return (
        '<svg viewBox="0 0 40 40"' + scale +
        ' fill="' + c.color + '" stroke="rgba(0,0,0,.18)" stroke-width="1" aria-hidden="true">' +
        SHAPES[c.shape] + "</svg>"
    );
}

/* ---------------- mount ---------------- */
export function mount(root, context = {}) {
    const { mode = "ai", room = null, playerName = "Player", onExit = () => { } } = context;
    const online = mode === "room" && Boolean(room);
    const playerIndex = online && !room.isHost ? 1 : 0;
    const authority = !online || room.isHost; /* hanya host/offline yang menjalankan clock */
    let roomData = (room && room.room) || null;
    let state = null;

    let destroyed = false;
    let cheatsOpen = false;
    let kbMode = false;
    let cursor = 0;
    let botPlan = null;      /* lokal (offline), tidak diserialisasi */
    let autoTag = "";
    let matchCounter = 0;
    let lastGridKey = "";
    let lastPhase = "";
    let changeApplied = true;
    const offs = [];

    root.innerHTML = `
<style>
.db-app{--db-bg:#0f1216;--db-panel:#171b22;--db-line:#242b36;--db-text:#e8edf4;--db-mut:#8a93a2;--db-acc:#8b9cf9;--db-good:#34d399;--db-bad:#f87171;color:var(--db-text)}
.db-app [hidden]{display:none!important}
.db-app .db-panel{display:flex;flex-direction:column;align-items:center;gap:14px;padding:18px;background:var(--db-bg);border:1px solid var(--db-line);border-radius:16px}
.db-app .db-top{display:flex;align-items:flex-start;justify-content:space-between;width:100%;gap:12px}
.db-app .db-seat{display:flex;flex-direction:column;gap:5px;min-width:88px}
.db-app .db-seat.right{align-items:flex-end;text-align:right}
.db-app .db-seat-name{display:flex;align-items:center;gap:6px;font-size:12px;color:var(--db-mut)}
.db-app .db-seat.right .db-seat-name{flex-direction:row-reverse}
.db-app .db-seat-name b{font-size:10px;font-weight:700;letter-spacing:.06em;padding:1px 5px;border:1px solid var(--db-line);border-radius:5px;color:var(--db-mut)}
.db-app .db-seat.on .db-seat-name{color:var(--db-acc)}
.db-app .db-seat.on .db-seat-name b{border-color:var(--db-acc);color:var(--db-acc)}
.db-app .db-cflag{font-style:normal;font-size:9px;font-weight:800;color:#f59e0b;border:1px solid rgba(245,158,11,.4);border-radius:4px;padding:0 3px}
.db-app .db-seat-score{font-size:24px;font-weight:800;line-height:1;font-variant-numeric:tabular-nums}
.db-app .db-lives{display:flex;gap:4px}
.db-app .db-lives i{width:7px;height:7px;border-radius:50%;background:var(--db-bad)}
.db-app .db-lives i.off{background:var(--db-line)}
.db-app .db-round{font-size:10px;letter-spacing:.14em;color:var(--db-mut);text-align:center;padding-top:2px}
.db-app .db-round b{display:block;font-size:14px;letter-spacing:.02em;color:var(--db-text);margin-top:2px;font-variant-numeric:tabular-nums}
.db-app .db-phase{display:flex;align-items:center;gap:8px;min-height:22px;font-size:14px;color:var(--db-mut)}
.db-app .db-count{font-size:14px;font-weight:800;color:var(--db-acc);font-variant-numeric:tabular-nums}
.db-app .db-board{position:relative;width:min(100%,420px);min-height:264px;display:grid;align-items:center}
.db-app .db-grid{display:grid;grid-template-columns:repeat(var(--n),1fr);gap:8px;width:min(100%,calc(var(--n)*72px + (var(--n) - 1)*8px));margin:0 auto;user-select:none;-webkit-user-select:none;touch-action:manipulation}
.db-app .db-cell{aspect-ratio:1;display:grid;place-items:center;padding:0;background:var(--db-panel);border:1px solid var(--db-line);border-radius:12px;cursor:pointer;transition:border-color .12s,background .12s,transform .12s}
@media (hover:hover){.db-app .db-grid:not(.locked) .db-cell:hover{border-color:var(--db-acc);transform:translateY(-1px)}}
.db-app .db-grid.locked .db-cell{cursor:default}
.db-app .db-cell svg{width:62%;height:62%;display:block}
.db-app .db-cell.good{border-color:var(--db-good);background:rgba(52,211,153,.1)}
.db-app .db-cell.bad{border-color:var(--db-bad);background:rgba(248,113,113,.1)}
.db-app .db-cell.hint{border-color:var(--db-acc);border-style:dashed}
.db-app .db-cell.cursor{box-shadow:0 0 0 2px var(--db-acc) inset}
.db-app .db-flash{position:absolute;inset:0;background:#fff;border-radius:12px;opacity:0;pointer-events:none;z-index:3}
.db-app .db-flash.go{animation:db-blink .46s ease-out}
@keyframes db-blink{0%{opacity:0}30%{opacity:.95}100%{opacity:0}}
.db-app .db-cover{position:absolute;inset:0;z-index:4;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;background:rgba(15,18,22,.94);border-radius:12px;text-align:center;padding:16px}
.db-app .db-cover-title{font-size:22px;font-weight:800}
.db-app .db-cover-sub{font-size:13px;color:var(--db-mut)}
.db-app .db-cheats{position:absolute;top:8px;right:8px;z-index:5;width:min(230px,calc(100% - 16px));background:var(--db-panel);border:1px solid var(--db-line);border-radius:12px;padding:12px;display:flex;flex-direction:column;gap:10px}
.db-app .db-cheats-head{display:flex;justify-content:space-between;align-items:center;font-size:11px;font-weight:800;letter-spacing:.12em;color:var(--db-mut);text-transform:uppercase}
.db-app .db-x{background:none;border:0;color:var(--db-mut);font-size:16px;line-height:1;cursor:pointer;padding:2px 4px}
.db-app .db-cheat-row{display:flex;justify-content:space-between;align-items:center;gap:10px;font-size:13px;cursor:pointer}
.db-app .db-cheat-row input{appearance:none;-webkit-appearance:none;width:34px;height:20px;border-radius:999px;background:var(--db-line);position:relative;cursor:pointer;transition:background .15s;flex:none;margin:0}
.db-app .db-cheat-row input::after{content:"";position:absolute;top:3px;left:3px;width:14px;height:14px;border-radius:50%;background:#fff;transition:left .15s}
.db-app .db-cheat-row input:checked{background:var(--db-acc)}
.db-app .db-cheat-row input:checked::after{left:17px}
@media (max-width:480px){.db-app .db-panel{padding:12px}.db-app .db-grid{gap:6px}.db-app .db-seat-score{font-size:20px}}
</style>
<div class="game-app db-app">
  <div class="game-intro">
    <div><h2>Don't Blink</h2></div>
    <span class="game-status"><i class="game-status-dot"></i><span data-status>Ready</span></span>
  </div>
  <section class="game-panel db-panel">
    <div class="db-top">
      <div class="db-seat" data-seat="0">
        <span class="db-seat-name"><b data-tag>P1</b><span data-name>You</span><i class="db-cflag" data-cflag hidden>C</i></span>
        <span class="db-seat-score" data-score>0</span>
        <span class="db-lives"><i data-life></i><i data-life></i><i data-life></i></span>
      </div>
      <div class="db-round">ROUND<b data-round>1/${ROUNDS}</b></div>
      <div class="db-seat right" data-seat="1">
        <span class="db-seat-name"><b data-tag>P2</b><span data-name>${online ? "Player 2" : "Bot"}</span><i class="db-cflag" data-cflag hidden>C</i></span>
        <span class="db-seat-score" data-score>0</span>
        <span class="db-lives"><i data-life></i><i data-life></i><i data-life></i></span>
      </div>
    </div>
    <div class="db-phase"><span data-phase aria-live="polite"></span><b class="db-count" data-count></b></div>
    <div class="db-board">
      <div class="db-grid" data-grid style="--n:3"></div>
      <div class="db-flash" data-flash aria-hidden="true"></div>
      <div class="db-cheats" data-cheats hidden>
        <div class="db-cheats-head"><span>Cheats - you</span><button type="button" class="db-x" data-act="cheats-close" aria-label="Close cheats">&#215;</button></div>
        ${CHEAT_DEFS.map((d) => '<label class="db-cheat-row"><span>' + d.label + '</span><input type="checkbox" data-cheat="' + d.key + '"></label>').join("")}
      </div>
      <div class="db-cover" data-cover>
        <div class="db-cover-title" data-cover-title>Don't Blink</div>
        <div class="db-cover-sub" data-cover-sub hidden></div>
        <button type="button" class="game-action-button" data-act="start" data-cover-btn>Start</button>
      </div>
    </div>
  </section>
  <div class="game-actions">
    <button class="game-action-button" type="button" data-act="restart">Restart</button>
    <button class="game-action-button" type="button" data-act="cheats" data-cheats-btn aria-expanded="false">Cheats</button>
    <button class="game-action-button" type="button" data-exit>Exit game</button>
  </div>
</div>`;

    /* ---------------- refs ---------------- */
    const $ = (s) => root.querySelector(s);
    const statusEl = $("[data-status]"),
        phaseEl = $("[data-phase]"),
        countEl = $("[data-count]"),
        roundEl = $("[data-round]"),
        gridEl = $("[data-grid]"),
        flashEl = $("[data-flash]"),
        coverEl = $("[data-cover]"),
        coverTitleEl = $("[data-cover-title]"),
        coverSubEl = $("[data-cover-sub]"),
        coverBtnEl = $("[data-cover-btn]"),
        cheatsEl = $("[data-cheats]"),
        cheatsBtnEl = $("[data-cheats-btn]");
    const seatEls = Array.from(root.querySelectorAll(".db-seat"));
    const cheatInputs = Array.from(root.querySelectorAll("input[data-cheat]"));

    /* ---------------- helpers ---------------- */
    const now = () => Date.now();
    const mySeat = () => (state ? state.seatMap[playerIndex] : 0);
    const activeSeat = () => (state.first + state.round - 1) % 2;
    const myCheats = () => (state && state.cheats && state.cheats[mySeat()]) || {};
    const seatName = (s) => {
        if (!state) return s === 0 ? "P1" : "P2";
        if (s === mySeat()) return "You";
        if (!online) return "Bot";
        const p = state.seatMap.indexOf(s);
        const rec = roomData && roomData.players && roomData.players[p];
        return (rec && rec.name) || "Player " + (p + 1);
    };

    /* ---------------- state (serializable, host-authoritative) ---------------- */
    function blankState() {
        return {
            phase: "idle", round: 1, first: 0, seatMap: [0, 1],
            seed: 0, matchId: 0, n: 0, cells: [], ci: -1, before: null,
            pick: null, good: false, scores: [0, 0], lives: [LIVES, LIVES],
            cheats: [{}, {}], endsAt: 0, changeAt: 0, findAt: 0,
            winner: null, reason: "",
        };
    }

    function newMatch() {
        const seed = (Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0;
        const r = mulberry32(seed);
        const keepCheats = state && state.cheats ? state.cheats : [{}, {}];
        /* kursi P1/P2 diacak tiap match (online); offline pemain selalu kursi 0 */
        const hostSeat = online ? (r() < 0.5 ? 0 : 1) : 0;
        matchCounter += 1;
        state = blankState();
        state.seed = seed;
        state.matchId = matchCounter;
        state.seatMap = online ? [hostSeat, 1 - hostSeat] : [0, 1];
        state.first = r() < 0.5 ? 0 : 1; /* siapa jalan duluan: acak (bot & multiplayer) */
        state.cheats = keepCheats;
        beginRound(1);
    }

    function beginRound(k) {
        const seat = (state.first + k - 1) % 2;
        const slow = !!(state.cheats[seat] && state.cheats[seat].slow);
        const gen = makeRound(state.seed, k - 1, slow);
        state.round = k;
        state.n = gen.n;
        state.cells = gen.cells;
        state.ci = gen.ci;
        state.before = gen.before;
        state.pick = null;
        state.good = false;
        state.phase = "watch";
        state.endsAt = now() + gen.obs;
        state.changeAt = 0;
        state.findAt = 0;
        botPlan = null;
        publish();
    }

    function resolvePick(i) {
        const seat = activeSeat();
        const good = i === state.ci;
        state.pick = i;
        state.good = good;
        if (good) state.scores[seat] += 1;
        else if (!(state.cheats[seat] && state.cheats[seat].lives)) {
            state.lives[seat] = Math.max(0, state.lives[seat] - 1);
        }
        state.phase = "reveal";
        state.endsAt = now() + REVEAL_MS;
        publish();
    }

    function finish(winner, reason) {
        state.phase = "over";
        state.winner = winner;
        state.reason = reason;
        state.endsAt = 0;
        if (!online) {
            try {
                const prev = Number(localStorage.getItem(META.bestKey)) || 0;
                const sc = state.scores[mySeat()];
                if (sc > prev) localStorage.setItem(META.bestKey, String(sc));
            } catch (err) { /* storage tidak tersedia */ }
        }
        publish();
    }

    /* transisi waktu, hanya dijalankan authority (offline / host) */
    function advance() {
        const t = now();
        if (state.phase === "watch") {
            state.phase = "blink";
            state.changeAt = t + CHANGE_MS;
            state.endsAt = t + BLINK_MS;
            publish();
        } else if (state.phase === "blink") {
            state.phase = "find";
            state.findAt = t;
            state.endsAt = t + FIND_MS;
            if (!online && activeSeat() === 1) {
                /* bot: akurasi menurun sesuai ronde, delay manusiawi */
                const acc = Math.max(0.5, 0.93 - (state.round - 1) * 0.05);
                let i = state.ci;
                if (Math.random() >= acc) {
                    do { i = Math.floor(Math.random() * state.cells.length); } while (i === state.ci);
                }
                botPlan = { at: t + 700 + Math.floor(Math.random() * 1600), i };
            }
            publish();
        } else if (state.phase === "find") {
            resolvePick(-1); /* timeout dihitung miss */
        } else if (state.phase === "reveal") {
            const seat = activeSeat();
            if (state.lives[seat] <= 0) finish(1 - seat, "lives");
            else if (state.round >= ROUNDS) {
                const a = state.scores[0], b = state.scores[1];
                finish(a === b ? -1 : a > b ? 0 : 1, "rounds");
            } else beginRound(state.round + 1);
        }
    }

    /* ---------------- template plumbing ---------------- */
    function publish() {
        render();
        if (online && room.isHost) room.publishState(state).catch(console.warn);
    }

    function applyAction(action, actor) {
        if (destroyed || !authority || !state || !action) return;
        if (actor !== 0 && actor !== 1) return;
        const seat = state.seatMap[actor];
        if (action.type === "start") { newMatch(); return; }
        if (action.type === "cheat") {
            if (!CHEAT_DEFS.some((d) => d.key === action.key)) return;
            if (!state.cheats) state.cheats = [{}, {}];
            if (!state.cheats[seat]) state.cheats[seat] = {};
            state.cheats[seat][action.key] = !!action.on;
            publish();
            return;
        }
        if (action.type === "tap") {
            if (state.phase !== "find" || seat !== activeSeat()) return;
            const i = action.i;
            if (!Number.isInteger(i) || i < 0 || i >= state.cells.length) return;
            resolvePick(i);
        }
    }

    function submitAction(action) {
        if (online && !room.isHost) {
            room.sendAction(action).catch(console.warn);
            return;
        }
        applyAction(action, playerIndex);
    }

    /* ---------------- render ---------------- */
    function buildGrid() {
        const s = state;
        if (!s || !s.cells.length) {
            gridEl.innerHTML = "";
            changeApplied = true;
            return;
        }
        const useBefore = s.phase === "watch" || (s.phase === "blink" && now() < s.changeAt);
        gridEl.style.setProperty("--n", String(s.n));
        let html = "";
        for (let i = 0; i < s.cells.length; i++) {
            const c = i === s.ci && useBefore ? s.before : s.cells[i];
            html += '<button type="button" class="db-cell" data-i="' + i + '" aria-label="Cell ' + (i + 1) + '">' + cellSvg(c) + "</button>";
        }
        gridEl.innerHTML = html;
        changeApplied = !useBefore;
    }

    function decorate() {
        const s = state;
        if (!s) return;
        const mine = s.phase === "find" && activeSeat() === mySeat();
        gridEl.classList.toggle("locked", !mine);
        const reveal = mine && !!myCheats().reveal;
        const cells = gridEl.children;
        for (let i = 0; i < cells.length; i++) {
            const el = cells[i];
            el.classList.toggle("good", s.phase === "reveal" && i === s.ci);
            el.classList.toggle("bad", s.phase === "reveal" && Number.isInteger(s.pick) && s.pick >= 0 && s.pick === i && i !== s.ci);
            el.classList.toggle("hint", reveal && i === s.ci);
            el.classList.toggle("cursor", kbMode && mine && i === cursor);
        }
    }

    function tickText() {
        const s = state;
        if (!s) { countEl.textContent = ""; return; }
        if (s.phase === "watch" || s.phase === "find") {
            countEl.textContent = String(Math.max(0, Math.ceil((s.endsAt - now()) / 1000)));
        } else countEl.textContent = "";
    }

    function render() {
        if (destroyed) return;
        const s = state;
        if (!s) { /* guest menunggu state pertama dari host */
            statusEl.textContent = "Connecting...";
            phaseEl.textContent = "";
            countEl.textContent = "";
            coverEl.hidden = false;
            coverTitleEl.textContent = META.name;
            coverSubEl.hidden = false;
            coverSubEl.textContent = "Waiting for host...";
            coverBtnEl.hidden = true;
            cheatsEl.hidden = true;
            return;
        }

        const mine = activeSeat() === mySeat();
        const who = mine ? "You" : seatName(activeSeat());
        let phaseTxt = "", statusTxt = "Ready";
        if (s.phase === "watch") {
            phaseTxt = mine ? "Memorize" : who + " memorizing...";
            statusTxt = s.round === 1 ? who + (mine ? " go first" : " goes first") : mine ? "Your turn" : who + "'s turn";
        } else if (s.phase === "blink") {
            phaseTxt = "";
            statusTxt = mine ? "Your turn" : who + "'s turn";
        } else if (s.phase === "find") {
            phaseTxt = mine ? "Spot the change" : who + " looking...";
            statusTxt = mine ? "Your turn" : "Waiting";
        } else if (s.phase === "reveal") {
            phaseTxt = s.good ? "Spotted" : s.pick === -1 ? "Too slow" : "Missed";
            statusTxt = phaseTxt;
        } else if (s.phase === "over") {
            statusTxt = "Finished";
        }
        statusEl.textContent = statusTxt;
        phaseEl.textContent = phaseTxt;
        roundEl.textContent = Math.min(s.round, ROUNDS) + "/" + ROUNDS;

        seatEls.forEach((el, seat) => {
            el.classList.toggle("on", (s.phase === "watch" || s.phase === "blink" || s.phase === "find") && activeSeat() === seat);
            el.querySelector("[data-name]").textContent = seatName(seat);
            el.querySelector("[data-score]").textContent = String(s.scores[seat]);
            const lv = s.lives[seat];
            el.querySelectorAll("[data-life]").forEach((d, j) => d.classList.toggle("off", j >= lv));
            const ch = !!(s.cheats && s.cheats[seat] && CHEAT_DEFS.some((d) => s.cheats[seat][d.key]));
            el.querySelector("[data-cflag]").hidden = !ch;
        });

        const gridKey = s.matchId + ":" + s.round + ":" +
            (s.phase === "watch" || s.phase === "blink" ? "b" : "a") + ":" +
            (s.phase === "reveal" ? s.pick : "");
        if (gridKey !== lastGridKey) {
            lastGridKey = gridKey;
            cursor = 0;
            buildGrid();
        }
        decorate();

        if (s.phase === "blink" && lastPhase !== "blink") {
            flashEl.classList.remove("go");
            void flashEl.offsetWidth; /* restart animasi */
            flashEl.classList.add("go");
        }
        lastPhase = s.phase;

        const showCover = s.phase === "idle" || s.phase === "over";
        coverEl.hidden = !showCover;
        if (showCover) {
            let title = META.name, sub = "", btn = "Start";
            if (s.phase === "over") {
                title = s.winner === -1 ? "Draw" : s.winner === mySeat() ? "You win" : seatName(s.winner) + " wins";
                sub = s.scores[0] + " - " + s.scores[1] + (s.reason === "lives" ? " | out of lives" : "");
                btn = "Play again";
            }
            coverTitleEl.textContent = title;
            coverSubEl.textContent = sub;
            coverSubEl.hidden = !sub;
            coverBtnEl.hidden = false;
            coverBtnEl.textContent = btn;
        }

        cheatsEl.hidden = !cheatsOpen;
        cheatsBtnEl.setAttribute("aria-expanded", String(cheatsOpen));
        cheatInputs.forEach((input) => { input.checked = !!myCheats()[input.dataset.cheat]; });
        tickText();
    }

    /* ---------------- input ---------------- */
    function tap(i) {
        const s = state;
        if (!s || s.phase !== "find" || activeSeat() !== mySeat()) return;
        kbMode = false;
        submitAction({ type: "tap", i });
    }

    function handleClick(event) {
        if (event.target.closest("[data-exit]")) { onExit(); return; }
        const act = event.target.closest("[data-act]");
        if (act) {
            const a = act.dataset.act;
            if (a === "start" || a === "restart") submitAction({ type: "start" });
            else if (a === "cheats") { cheatsOpen = !cheatsOpen; render(); }
            else if (a === "cheats-close") { cheatsOpen = false; render(); }
            return;
        }
        const cell = event.target.closest(".db-cell");
        if (cell) tap(Number(cell.dataset.i));
    }

    /* mouse + sentuhan: tap langsung sel grid (tanpa tombol virtual) */
    function handlePointer(event) {
        if (typeof event.button === "number" && event.button > 0) return;
        const cell = event.target.closest(".db-cell");
        if (!cell) return;
        event.preventDefault();
        tap(Number(cell.dataset.i));
    }

    function handleChange(event) {
        const input = event.target.closest("input[data-cheat]");
        if (!input) return;
        submitAction({ type: "cheat", key: input.dataset.cheat, on: input.checked });
    }

    function handleKey(event) {
        if (destroyed || !root.isConnected) return;
        if (event.target && event.target.closest && event.target.closest("input,textarea,select")) return;
        const k = event.key;
        if (k === "c" || k === "C") { event.preventDefault(); cheatsOpen = !cheatsOpen; render(); return; }
        if (k === "Escape") { if (cheatsOpen) { cheatsOpen = false; render(); } return; }
        if (k === "r" || k === "R") { submitAction({ type: "start" }); return; }
        const s = state;
        if (!s) return;
        if (s.phase === "idle" || s.phase === "over") {
            if (k === " " || k === "Enter") {
                if (event.target.closest && event.target.closest("button")) return; /* aktivasi native */
                event.preventDefault();
                submitAction({ type: "start" });
            }
            return;
        }
        if (s.phase !== "find") return;
        if (k >= "1" && k <= "9") {
            const i = Number(k) - 1;
            if (i < s.cells.length) tap(i);
            return;
        }
        const n = s.n;
        if (cursor >= n * n) cursor = 0;
        let r = Math.floor(cursor / n), c = cursor % n, moved = true;
        if (k === "ArrowLeft") c = (c + n - 1) % n;
        else if (k === "ArrowRight") c = (c + 1) % n;
        else if (k === "ArrowUp") r = (r + n - 1) % n;
        else if (k === "ArrowDown") r = (r + 1) % n;
        else moved = false;
        if (moved) { event.preventDefault(); kbMode = true; cursor = r * n + c; decorate(); return; }
        if (k === "Enter" || k === " ") {
            if (event.target.closest && event.target.closest("button")) return; /* sel fokus / tombol UI: klik native */
            event.preventDefault();
            kbMode = true;
            tap(cursor);
        }
    }

    /* ---------------- clock: 1 tick ringan, tanpa write Firebase per detik ---------------- */
    const tickId = setInterval(() => {
        if (destroyed || !state) return;
        const s = state, t = now();
        tickText();
        if (s.phase === "blink" && !changeApplied && t >= s.changeAt) {
            const el = gridEl.children[s.ci];
            if (el) el.innerHTML = cellSvg(s.cells[s.ci]);
            changeApplied = true;
        }
        if (authority && s.endsAt && t >= s.endsAt &&
            (s.phase === "watch" || s.phase === "blink" || s.phase === "find" || s.phase === "reveal")) {
            advance();
        }
        if (!online && s.phase === "find" && botPlan && activeSeat() === 1 && t >= botPlan.at) {
            const p = botPlan;
            botPlan = null;
            applyAction({ type: "tap", i: p.i }, 1);
        }
        if (s.phase === "find" && activeSeat() === mySeat() && myCheats().auto) {
            const tag = s.matchId + ":" + s.round;
            if (autoTag !== tag && t >= s.findAt + 350) {
                autoTag = tag;
                submitAction({ type: "tap", i: s.ci });
            }
        }
    }, 100);

    /* ---------------- wiring ---------------- */
    root.addEventListener("click", handleClick);
    root.addEventListener("change", handleChange);
    gridEl.addEventListener("pointerdown", handlePointer);
    document.addEventListener("keydown", handleKey);

    if (online) {
        offs.push(room.onRoom((nextRoom) => { roomData = nextRoom; render(); }));
        if (room.isHost) {
            state = blankState();
            publish();
            offs.push(room.onAction((action) => applyAction(action, 1)));
        } else {
            offs.push(room.onState((nextState) => { state = nextState; render(); }));
            render();
        }
    } else {
        state = blankState();
        render();
    }

    return {
        destroy() {
            destroyed = true;
            clearInterval(tickId);
            root.removeEventListener("click", handleClick);
            root.removeEventListener("change", handleChange);
            gridEl.removeEventListener("pointerdown", handlePointer);
            document.removeEventListener("keydown", handleKey);
            for (const off of offs) {
                if (typeof off === "function") { try { off(); } catch (err) { /* noop */ } }
            }
        },
    };
}