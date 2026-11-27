/* ==== battleship.js — ES module (mount/destroy template) ==== */
import { iconSVG } from "../JS/icons.js";

export const META = {
  id: "battleship",
  name: "Battleship",
  category: "board",
  catLabel: "Board",
  desc: "Place your fleet, hunt the AI, sink all five ships first.",
  art: `<svg viewBox="0 0 48 48" width="54" height="54" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 29h32l-5 8H13z"/><path d="M20 29v-6h8v6"/><path d="M24 23v-6"/><path d="M6 42c3-2.5 6-2.5 9 0s6 2.5 9 0 6-2.5 9 0 6 2.5 9 0"/></svg>`,
  bg: ["#bae6fd", "#38bdf8"],
};

export function mount(root, context = {}) {
    const { mode = "ai", room = null, playerName = "Player", onExit = () => { } } = context;
    const online = mode === "room" && Boolean(room);
    let roomData = (room && room.room) || null;
    let state = null;

    /* ---------- constants ---------- */
    const N = 10, CS = 32, VB = N * CS;
    const FLEET = [["Carrier", 5], ["Battleship", 4], ["Cruiser", 3], ["Submarine", 3], ["Destroyer", 2]];
    const ORTH = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    const COST = { mine: 20, radar: 30, strike: 50, repair: 35 };
    const START_MONEY = 60, HIT_PAY = 12, SINK_PAY = 25, INCOME = 5;
    const AI_SIDE = 1;
    const NS = "http://www.w3.org/2000/svg";

    /* ---------- local UI (not synced) ---------- */
    let sel = 0, orient = "H";
    let cursor = { r: 4, c: 4 }, cursorOn = false;
    let hover = { you: null, foe: null };
    let aim = null;            // "mine" | "radar" | "strike"
    let cheatOpen = false;
    let helpOpen = false;
    let paused = false;
    const cheats = { reveal: false, mines: false, freeze: false };
    let seenEv = 0, destroyed = false, aiTimer = null;
    const timers = new Set();
    const timerRec = new Map();
    let deferredTimers = [];
    const subs = [];

    let seenHelp = true;
    try { seenHelp = localStorage.getItem("battleship-help-seen") === "1"; } catch (_) { seenHelp = true; }
    if (!seenHelp) {
        helpOpen = true;
        try { localStorage.setItem("battleship-help-seen", "1"); } catch (_) { /* storage blocked */ }
    }

    const $ = (s) => root.querySelector(s);
    const rand = (n) => (Math.random() * n) | 0;
    const key = (r, c) => r + "," + c;
    const inb = (r, c) => r >= 0 && r < N && c >= 0 && c < N;
    /* Random side assignment in multiplayer: host flips a coin, guest gets the other side. */
    const mySide = () => !online ? 0 : room.isHost ? (state ? state.hostSide : 0) : (state ? 1 - state.hostSide : 1);
    const me = () => state.players[mySide()];
    const foe = () => state.players[1 - mySide()];

    function mk(t, at, parent) {
        const n = document.createElementNS(NS, t);
        for (const k in at) n.setAttribute(k, at[k]);
        if (parent) parent.appendChild(n);
        return n;
    }
    function later(ms, fn) {
        if (paused) { deferredTimers.push({ old: null, wait: ms, fn }); return null; }
        const id = setTimeout(() => { timers.delete(id); timerRec.delete(id); fn(); }, ms);
        timers.add(id);
        timerRec.set(id, { due: Date.now() + ms, fn });
        return id;
    }
    function clearTimers() {
        for (const id of timers) clearTimeout(id);
        timers.clear(); timerRec.clear(); deferredTimers = [];
    }
    /* Pause freezes every scheduled callback by keeping its Date.now() anchor;
     * resume replays the remaining delay so nothing jumps ahead. */
    function pauseTimers() {
        const now = Date.now();
        for (const [id, rec] of timerRec) {
            clearTimeout(id);
            deferredTimers.push({ old: id, wait: Math.max(0, rec.due - now), fn: rec.fn });
        }
        timers.clear(); timerRec.clear();
    }
    function resumeTimers() {
        const queue = deferredTimers; deferredTimers = [];
        const remap = new Map();
        for (const t of queue) remap.set(t.old, later(t.wait, t.fn));
        if (aiTimer != null) aiTimer = remap.has(aiTimer) ? remap.get(aiTimer) : null;
    }
    function watch(u) { if (typeof u === "function") subs.push(u); }

    /* ---------- grid helpers (no-touch rule: 1 cell gap between ships) ---------- */
    function gridOf(p) {
        const g = Array.from({ length: N }, () => Array(N).fill(-1));
        p.ships.forEach((s, i) => { if (s.cells) s.cells.forEach((rc) => { g[rc[0]][rc[1]] = i; }); });
        return g;
    }
    function cellsOf(r, c, len, h) {
        const out = [];
        for (let i = 0; i < len; i++) {
            const rr = h ? r : r + i, cc = h ? c + i : c;
            if (!inb(rr, cc)) return null;
            out.push([rr, cc]);
        }
        return out;
    }
    function canPlace(grid, r, c, len, h) {
        const cs = cellsOf(r, c, len, h);
        if (!cs) return false;
        for (const rc of cs)
            for (let dr = -1; dr <= 1; dr++)
                for (let dc = -1; dc <= 1; dc++) {
                    const r2 = rc[0] + dr, c2 = rc[1] + dc;
                    if (inb(r2, c2) && grid[r2][c2] >= 0) return false;
                }
        return true;
    }
    const allPlaced = (p) => p.ships.every((s) => s.cells);
    const allSunk = (p) => p.ships.every((s) => s.sunk);
    function box(cells) {
        let r0 = N, c0 = N, r1 = -1, c1 = -1;
        cells.forEach((rc) => {
            r0 = Math.min(r0, rc[0]); c0 = Math.min(c0, rc[1]);
            r1 = Math.max(r1, rc[0]); c1 = Math.max(c1, rc[1]);
        });
        return { r0, c0, r1, c1 };
    }
    function plusCells(r, c) {
        return [[r, c]].concat(ORTH.map((d) => [r + d[0], c + d[1]])).filter((rc) => inb(rc[0], rc[1]));
    }
    function area3(r, c) {
        const out = [];
        for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++)
            if (inb(r + dr, c + dc)) out.push([r + dr, c + dc]);
        return out;
    }
    function autoFleet(p) {
        const grid = gridOf(p);
        for (const s of p.ships) {
            if (s.cells) continue;
            let done = false;
            for (let t = 0; t < 400 && !done; t++) {
                const h = Math.random() < 0.5, r = rand(N), c = rand(N);
                if (canPlace(grid, r, c, s.len, h)) {
                    s.cells = cellsOf(r, c, s.len, h); s.horiz = h;
                    s.cells.forEach((rc) => { grid[rc[0]][rc[1]] = 1; });
                    done = true;
                }
            }
            if (!done) {
                outer:
                for (let r = 0; r < N; r++)
                    for (let c = 0; c < N; c++)
                        for (const h of [true, false])
                            if (canPlace(grid, r, c, s.len, h)) {
                                s.cells = cellsOf(r, c, s.len, h); s.horiz = h;
                                s.cells.forEach((rc) => { grid[rc[0]][rc[1]] = 1; });
                                done = true; break outer;
                            }
            }
            if (!done) { toast("No room left — clear and retry", "bad"); return; }
        }
    }
    function mineOk(side, r, c) {
        const p = state.players[side], d = state.players[1 - side];
        if (!inb(r, c) || p.money < COST.mine) return false;
        if (gridOf(p)[r][c] >= 0) return false;
        if (p.mines.some((m) => m[0] === r && m[1] === c)) return false;
        if (d.shots[key(r, c)]) return false;
        return true;
    }
    function mineSpot(side) {
        const free = [];
        for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) if (mineOk(side, r, c)) free.push([r, c]);
        return free.length ? free[rand(free.length)] : null;
    }

    /* ---------- state ---------- */
    function newPlayer(name) {
        return {
            name, money: START_MONEY, ready: false, stun: false,
            ships: FLEET.map((f) => ({ name: f[0], len: f[1], cells: null, horiz: true, hits: 0, sunk: false })),
            mines: [], shots: {}, scans: {}
        };
    }
    function newState() {
        const hostSide = online ? rand(2) : 0;
        const p = [newPlayer("Player 1"), newPlayer("Player 2")];
        if (online) p[hostSide].name = (playerName || "Player").slice(0, 20);
        else { p[0].name = (playerName || "You").slice(0, 20); p[1].name = "AI"; }
        return { phase: "setup", hostSide, turn: 0, winner: null, ev: { id: 0 }, players: p };
    }
    function setEv(type, board, cells, extra) {
        const id = ((state.ev && state.ev.id) || 0) + 1;
        state.ev = Object.assign({ id, type, board: board == null ? null : board, cells: cells || null }, extra || {});
    }

    /* ---------- combat core ---------- */
    function resolveShot(a, r, c) {
        const p = state.players[a], d = state.players[1 - a], k = key(r, c);
        const grid = gridOf(d);
        const mi = d.mines.findIndex((m) => m[0] === r && m[1] === c);
        if (mi >= 0 && grid[r][c] < 0) {
            d.mines.splice(mi, 1); p.shots[k] = "miss"; p.stun = true;
            return { res: "mine" };
        }
        const idx = grid[r][c];
        if (idx < 0) { p.shots[k] = "miss"; return { res: "miss" }; }
        const s = d.ships[idx];
        s.hits++; p.shots[k] = "hit"; p.money += HIT_PAY;
        if (s.hits >= s.len) {
            s.sunk = true; p.money += SINK_PAY;
            s.cells.forEach((rc) => { p.shots[key(rc[0], rc[1])] = "sunk"; });
            return { res: "sunk", ship: s };
        }
        return { res: "hit", ship: s };
    }
    function checkWin(a) {
        if (!allSunk(state.players[1 - a])) return false;
        state.phase = "over"; state.winner = a;
        setEv("over", null, null, { winner: a });
        return true;
    }
    function passTurn(from) {
        let nxt = 1 - from;
        if (state.players[nxt].stun) {
            state.players[nxt].stun = false;
            if (state.ev) state.ev.stunned = state.players[nxt].name;
            nxt = from;
        }
        state.turn = nxt;
        state.players[nxt].money += INCOME;
    }
    function doFire(a, r, c) {
        const out = resolveShot(a, r, c);
        if (out.res === "sunk")
            setEv("sunk", 1 - a, out.ship.cells.map((rc) => ({ r: rc[0], c: rc[1], res: "sunk" })), { actor: a, ship: out.ship.name });
        else
            setEv(out.res, 1 - a, [{ r, c, res: out.res }], { actor: a });
        if (checkWin(a)) return out.res;
        if (out.res === "miss" || out.res === "mine") passTurn(a);   // hit/sunk => same player keeps the turn
        return out.res;
    }
    function doStrike(a, r, c) {
        if (!inb(r, c)) return false;
        const p = state.players[a];
        const cells = plusCells(r, c).filter((rc) => !p.shots[key(rc[0], rc[1])]);
        if (!cells.length) return false;
        p.money -= COST.strike;
        let any = false; const fx = [];
        cells.forEach((rc) => {
            const o = resolveShot(a, rc[0], rc[1]);
            if (o.res === "hit" || o.res === "sunk") any = true;
            fx.push({ r: rc[0], c: rc[1], res: o.res });
        });
        const n = fx.filter((f) => f.res === "hit" || f.res === "sunk").length;
        setEv("strike", 1 - a, fx, { actor: a, n });
        if (checkWin(a)) return true;
        if (!any) passTurn(a);
        return true;
    }
    function doRadar(a, r, c) {
        if (!inb(r, c)) return false;
        const p = state.players[a], d = state.players[1 - a], grid = gridOf(d);
        p.money -= COST.radar;
        area3(r, c).forEach((rc) => {
            p.scans[key(rc[0], rc[1])] = grid[rc[0]][rc[1]] >= 0 ? 1
                : (d.mines.some((m) => m[0] === rc[0] && m[1] === rc[1]) ? 2 : 0);
        });
        setEv("radar", 1 - a, [{ r, c, res: "scan" }], { actor: a });
        passTurn(a);
        return true;
    }
    function doRepair(a) {
        const p = state.players[a], d = state.players[1 - a];
        const dmg = p.ships.filter((s) => s.cells && !s.sunk && s.hits > 0);
        if (!dmg.length || p.money < COST.repair) return false;
        const s = dmg.reduce((x, y) => (y.hits > x.hits ? y : x));
        p.money -= COST.repair; s.hits--;
        for (const rc of s.cells) {
            const k = key(rc[0], rc[1]);
            if (d.shots[k] === "hit") { delete d.shots[k]; break; }
        }
        setEv("repair", null, null, { actor: a, ship: s.name });
        return true;
    }
    function doMine(a, r, c) {
        const p = state.players[a];
        p.money -= COST.mine; p.mines.push([r, c]);
        setEv("mineplace", null, null, { actor: a });
    }
    function startBattle() {
        state.phase = "battle";
        state.turn = rand(2);   // random first turn
        setEv("start", null, null, { name: state.players[state.turn].name });
    }

    /* ---------- actions (host-authoritative) ---------- */
    function applyAction(action, actor) {
        if (!state || !action || typeof action !== "object") return;
        if (actor !== 0 && actor !== 1) return;
        const p = state.players[actor];
        switch (action.type) {
            case "hello":
                if (typeof action.name === "string" && action.name.trim()) p.name = action.name.trim().slice(0, 20);
                else return;
                break;
            case "place": {
                if (state.phase !== "setup" || p.ready) return;
                const s = p.ships[action.ship | 0];
                if (!s || s.cells) return;
                const r = action.r | 0, c = action.c | 0, h = !!action.horiz;
                if (!canPlace(gridOf(p), r, c, s.len, h)) return;
                s.cells = cellsOf(r, c, s.len, h); s.horiz = h;
                break;
            }
            case "auto":
                if (state.phase !== "setup" || p.ready) return;
                autoFleet(p);
                break;
            case "clear":
                if (state.phase !== "setup" || p.ready) return;
                p.ships.forEach((s) => { s.cells = null; s.hits = 0; s.sunk = false; s.horiz = true; });
                break;
            case "ready":
                if (state.phase !== "setup" || p.ready || !allPlaced(p)) return;
                p.ready = true;
                if (!online && actor === 0) {
                    const a = state.players[AI_SIDE];
                    autoFleet(a);
                    for (let i = 0; i < 2; i++) { const sp = mineSpot(AI_SIDE); if (sp) doMine(AI_SIDE, sp[0], sp[1]); }
                    a.ready = true;
                }
                if (state.players[0].ready && state.players[1].ready) startBattle();
                else setEv("ready", null, null, { name: p.name });
                break;
            case "mine": {
                const r = action.r | 0, c = action.c | 0;
                const phaseOk = state.phase === "setup" ? !p.ready : (state.phase === "battle" && state.turn === actor);
                if (!phaseOk || !mineOk(actor, r, c)) return;
                doMine(actor, r, c);
                break;
            }
            case "radar":
                if (state.phase !== "battle" || state.turn !== actor || p.money < COST.radar) return;
                if (!doRadar(actor, action.r | 0, action.c | 0)) return;
                break;
            case "strike":
                if (state.phase !== "battle" || state.turn !== actor || p.money < COST.strike) return;
                if (!doStrike(actor, action.r | 0, action.c | 0)) return;
                break;
            case "repair":
                if (state.phase !== "battle" || state.turn !== actor) return;
                if (!doRepair(actor)) return;
                break;
            case "fire": {
                if (state.phase !== "battle" || state.turn !== actor) return;
                const r = action.r | 0, c = action.c | 0;
                if (!inb(r, c) || p.shots[key(r, c)]) return;
                doFire(actor, r, c);
                break;
            }
            default:
                return;
        }
        publish();
    }

    function publish() {
        render();
        if (online && room.isHost) room.publishState(state).catch(console.warn);
        if (!online) maybeAI();
    }
    function submitAction(action) {
        if (online && !room.isHost) { room.sendAction(action).catch(console.warn); return; }
        applyAction(action, mySide());
    }

    /* ---------- AI ---------- */
    function aiPick(a) {
        const p = state.players[a];
        const tried = (r, c) => Boolean(p.shots[key(r, c)]);
        const scanHits = [];
        Object.keys(p.scans).forEach((k) => {
            if (p.scans[k] === 1 && !p.shots[k]) { const pt = k.split(","); scanHits.push([+pt[0], +pt[1]]); }
        });
        if (scanHits.length) return scanHits[rand(scanHits.length)];
        const pend = [];
        Object.keys(p.shots).forEach((k) => {
            if (p.shots[k] === "hit") { const pt = k.split(","); pend.push([+pt[0], +pt[1]]); }
        });
        if (pend.length) {
            for (let i = 0; i < pend.length; i++)
                for (let j = i + 1; j < pend.length; j++) {
                    const r1 = pend[i][0], c1 = pend[i][1], r2 = pend[j][0], c2 = pend[j][1];
                    let cand = [];
                    if (r1 === r2) { const lo = Math.min(c1, c2), hi = Math.max(c1, c2); cand = [[r1, lo - 1], [r1, hi + 1]]; }
                    else if (c1 === c2) { const lo = Math.min(r1, r2), hi = Math.max(r1, r2); cand = [[lo - 1, c1], [hi + 1, c1]]; }
                    const ok = cand.filter((rc) => inb(rc[0], rc[1]) && !tried(rc[0], rc[1]));
                    if (ok.length) return ok[rand(ok.length)];
                }
            const opts = [];
            pend.forEach((rc) => ORTH.forEach((d) => {
                const r2 = rc[0] + d[0], c2 = rc[1] + d[1];
                if (inb(r2, c2) && !tried(r2, c2)) opts.push([r2, c2]);
            }));
            if (opts.length) return opts[rand(opts.length)];
        }
        let free = [];
        for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
            const v = p.scans[key(r, c)];
            if (!tried(r, c) && v !== 0 && v !== 2) free.push([r, c]);
        }
        if (!free.length)
            for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) if (!tried(r, c)) free.push([r, c]);
        if (!free.length) return null;
        const par = free.filter((rc) => (rc[0] + rc[1]) % 2 === 0);
        const pool = par.length ? par : free;
        return pool[rand(pool.length)];
    }
    function strikeCenter(a) {
        const p = state.players[a], pend = [], sh = [];
        Object.keys(p.shots).forEach((k) => {
            if (p.shots[k] === "hit") { const pt = k.split(","); pend.push([+pt[0], +pt[1]]); }
        });
        if (pend.length) return pend[rand(pend.length)];
        Object.keys(p.scans).forEach((k) => {
            if (p.scans[k] === 1 && !p.shots[k]) { const pt = k.split(","); sh.push([+pt[0], +pt[1]]); }
        });
        return sh.length ? sh[rand(sh.length)] : null;
    }
    function aiTurn() {
        if (online || !state || destroyed || paused) return;
        if (state.phase !== "battle" || state.turn !== AI_SIDE || state.winner != null || cheats.freeze) return;
        const p = state.players[AI_SIDE];
        const dmg = p.ships.some((s) => s.cells && !s.sunk && s.hits > 0);
        if (dmg && p.money >= COST.repair && Math.random() < 0.45) doRepair(AI_SIDE);
        if (p.money >= COST.mine && p.mines.length < 4 && Math.random() < 0.15) {
            const sp = mineSpot(AI_SIDE); if (sp) doMine(AI_SIDE, sp[0], sp[1]);
        }
        const ctr = strikeCenter(AI_SIDE);
        if (ctr && p.money >= COST.strike && Math.random() < 0.5 && doStrike(AI_SIDE, ctr[0], ctr[1])) { publish(); return; }
        if (p.money >= COST.radar && Math.random() < 0.2) { doRadar(AI_SIDE, rand(N), rand(N)); publish(); return; }
        const pick = aiPick(AI_SIDE);
        if (pick) doFire(AI_SIDE, pick[0], pick[1]); else passTurn(AI_SIDE);
        publish();
    }
    function maybeAI() {
        if (online || !state || destroyed || paused) return;
        if (aiTimer) { clearTimeout(aiTimer); timers.delete(aiTimer); aiTimer = null; }
        if (state.phase === "battle" && state.turn === AI_SIDE && state.winner == null && !cheats.freeze)
            aiTimer = later(950, () => { aiTimer = null; aiTurn(); });
    }

    /* ---------- markup ---------- */
    root.innerHTML = `
<style>
/* Battleship — navy/indigo chart palette, HUD-driven fill-height layout. */
.bsr{--bs-ink:#e2e8f0;--bs-mut:#8b95a9;--bs-line:#263244;--bs-soft:#111827;--bs-acc:#6366f1;--bs-warn:#fbbf24;
  width:100%;max-width:1080px;margin:0 auto;display:flex;flex-direction:column;gap:10px;color:var(--bs-ink);
  font:14px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
.bsr *{box-sizing:border-box}
.bsr [hidden]{display:none!important}
.bsr :is(button,select,input,[role="button"]):focus-visible{outline:2px solid var(--bs-acc);outline-offset:2px}
/* Single HUD bar: status/info left, icon controls right. */
.bsr .bs-hud{display:flex;align-items:center;gap:6px;flex-wrap:wrap;row-gap:6px}
.bsr .bs-chip{font-size:11px;letter-spacing:.5px;color:var(--bs-mut);background:#ffffff07;border:1px solid #ffffff12;border-radius:999px;padding:5px 10px;white-space:nowrap}
.bsr .bs-chip b{color:var(--bs-ink);font-weight:700;margin-left:3px;font-variant-numeric:tabular-nums}
.bsr .bs-chip.warn{color:var(--bs-warn);border-color:#fbbf2444}
.bsr .bs-chip.status[data-tone="you"]{color:#34d399;border-color:#34d39944}
.bsr .bs-chip.status[data-tone="foe"]{color:#f87171;border-color:#f8717144}
.bsr .bs-chip.status[data-tone="idle"]{color:#fbbf24;border-color:#fbbf2444}
.bsr .bs-sp{flex:1 1 8px}
.bsr .bs-b{background:var(--bs-soft);border:1px solid var(--bs-line);color:#cbd5e1;border-radius:9px;padding:8px 12px;min-height:36px;font-size:12.5px;font-weight:600;cursor:pointer;transition:border-color .15s,background .15s}
.bsr .bs-b:hover:not(:disabled){border-color:var(--bs-acc)}
.bsr .bs-b:disabled{opacity:.4;cursor:default}
.bsr .bs-b.pri{background:#4f46e5;border-color:#6366f1;color:#fff}
.bsr .bs-b.on{border-color:var(--bs-warn);color:#fde68a}
.bsr .bs-b.danger{color:#f87171;border-color:#f8717144}
.bsr .bs-b em{font-style:normal;color:var(--bs-warn);margin-left:4px;font-size:11px}
.bsr .bs-icon-btn{display:inline-flex;align-items:center;gap:6px;padding:7px 10px;min-height:32px;font-size:11px}
.bsr .bs-icon-btn svg{flex:none;display:block}
/* Board owns all remaining height; its SVG content keeps its 1:1 viewBox ratio. */
.bsr .game-panel.bs-stage{position:relative;display:flex;flex-direction:column;gap:8px;padding:8px 0;min-width:0;min-height:0;flex:1 1 auto;overflow:hidden}
.bsr .bs-bar{display:flex;flex-direction:column;gap:8px;align-items:center;flex:none;min-width:0}
.bsr .bs-row{display:flex;gap:6px;flex-wrap:wrap;justify-content:center}
.bsr .bs-shop{flex-direction:row;flex-wrap:wrap;justify-content:center;gap:6px}
.bsr .bs-ships{display:flex;gap:6px;flex-wrap:wrap;justify-content:center}
.bsr .bs-ship{background:#ffffff08;border:1px solid #ffffff1a;border-radius:9px;padding:8px 12px;min-height:36px;font-size:11.5px;font-weight:600;color:#aab4c8;cursor:pointer}
.bsr .bs-ship.sel{background:#4f46e5;border-color:#818cf8;color:#fff}
.bsr .bs-ship.done{opacity:.35;cursor:default}
.bsr .bs-boards{flex:1 1 auto;min-height:0;display:flex;gap:16px;justify-content:center;align-items:stretch;min-width:0}
.bsr .bs-col{display:flex;flex-direction:column;gap:6px;align-items:center;min-width:0;min-height:0;flex:1 1 320px;max-width:380px}
.bsr .bs-head{font-size:10px;font-weight:800;letter-spacing:2px;text-transform:uppercase;color:var(--bs-mut);flex:none}
.bsr .bs-board{flex:1 1 auto;min-height:0;width:100%;display:flex;align-items:center;justify-content:center}
.bsr .bs-board svg{width:100%;height:100%;display:block;border-radius:12px;background:#0a0f1c;border:1px solid #1e293b}
.bsr .bs-board[data-board-side="foe"] svg{cursor:crosshair}
.bsr .bs-board[data-board-side="you"] svg{cursor:pointer}
.bsr .bs-board.aim svg{box-shadow:0 0 0 2px rgba(99,102,241,.5)}
.bsr .bs-cell{fill:#0d1526;stroke:#1c2740;stroke-width:1}
.bsr .bs-buffer{fill:rgba(148,163,184,.045);stroke:#33415588;stroke-width:1;stroke-dasharray:4 3}
.bsr .bs-gb-ok{fill:none;stroke:#34d39988;stroke-width:1;stroke-dasharray:4 3}
.bsr .bs-gb-bad{fill:none;stroke:#f8717188;stroke-width:1;stroke-dasharray:4 3}
.bsr .bs-g-ok{fill:rgba(52,211,153,.18);stroke:#34d399;stroke-width:1.4}
.bsr .bs-g-bad{fill:rgba(248,113,113,.16);stroke:#f87171;stroke-width:1.4}
.bsr .bs-g-aim{fill:rgba(251,191,36,.12);stroke:#fbbf24;stroke-width:1.2;stroke-dasharray:5 3}
.bsr .bs-cursor{fill:none;stroke:var(--bs-ink);stroke-width:1.5;stroke-dasharray:5 4}
.bsr .bs-shipart .hull{fill:#2c4a7c;stroke:#8fb0ff;stroke-width:1.6}
.bsr .bs-shipart .deck{fill:#3a5c96}
.bsr .bs-shipart .bridge{fill:#5b7bb4;stroke:#a9c4f5;stroke-width:.8}
.bsr .bs-shipart .turret{fill:#22355c;stroke:#8fb0ff;stroke-width:1}
.bsr .bs-shipart .barrel{stroke:#8fb0ff;stroke-width:1.6;stroke-linecap:round}
.bsr .bs-shipart .mast{fill:#c7d8f7}
.bsr .bs-shipart.sunk .hull{fill:#471c24;stroke:#f87171}
.bsr .bs-shipart.sunk .deck{fill:#571f29}
.bsr .bs-shipart.sunk .bridge{fill:#6b2530;stroke:#f87171}
.bsr .bs-shipart.sunk .turret{fill:#3a161d;stroke:#f87171}
.bsr .bs-shipart.sunk .barrel{stroke:#f87171}
.bsr .bs-shipart.sunk .mast{fill:#fca5a5}
.bsr .bs-shipart.ghost{opacity:.32}
.bsr .bs-shipart.ghost .hull{stroke-dasharray:4 3}
.bsr .bs-missdot{fill:none;stroke:#64748b;stroke-width:1.6}
.bsr .bs-mine{fill:#1f2937;stroke:#f59e0b;stroke-width:1.4}
.bsr .bs-spike{stroke:#f59e0b;stroke-width:1.2;stroke-linecap:round}
.bsr .bs-scan1{fill:none;stroke:#fbbf24;stroke-width:1.4}
.bsr .bs-scan0{fill:#475569}
.bsr .bs-scan2{stroke:#f87171;stroke-width:1.6;stroke-linecap:round}
.bsr .bs-fleet{display:flex;flex-direction:column;gap:4px;width:100%;flex:none}
.bsr .bs-frow{display:flex;align-items:center;justify-content:space-between;gap:8px;font-size:11.5px;color:#94a3b8;background:#ffffff06;border-radius:8px;padding:5px 9px}
.bsr .bs-frow.sunk{color:#f87171}
.bsr .bs-frow.sunk span:first-child{text-decoration:line-through}
.bsr .bs-pips{display:flex;gap:3px}
.bsr .bs-pips i{width:8px;height:8px;border-radius:2px;background:#26324a}
.bsr .bs-pips i.on{background:#fb923c}
.bsr .bs-frow.sunk .bs-pips i{background:#ef4444}
.bsr .bs-toasts{position:absolute;top:4px;left:50%;transform:translateX(-50%);display:flex;flex-direction:column;gap:6px;align-items:center;z-index:6;pointer-events:none;max-width:calc(100% - 16px)}
.bsr .bs-toast{background:#0f172aee;border:1px solid #ffffff22;color:#e5e7eb;padding:6px 14px;border-radius:999px;font-size:12px;font-weight:600;text-align:center;animation:bsToast 2.6s forwards}
.bsr .bs-toast.good{border-color:#34d39966;color:#a7f3d0}
.bsr .bs-toast.bad{border-color:#f8717166;color:#fecaca}
@keyframes bsToast{0%{opacity:0;transform:translateY(-6px)}10%{opacity:1;transform:none}82%{opacity:1}100%{opacity:0}}
.bsr .bs-fx .ring{fill:none;stroke:#7dd3fc;stroke-width:2;opacity:0;transform-box:fill-box;transform-origin:center;animation:bsRing 1.15s ease-out forwards}
.bsr .fx-miss .r2{animation-delay:.22s;stroke:#38bdf8}
.bsr .fx-miss .splash{fill:#bae6fd;opacity:0;transform-box:fill-box;transform-origin:center;animation:bsSplash 1s ease-out forwards}
.bsr .fx-hit .flash,.bsr .fx-sunk .flash,.bsr .fx-mine .flash{fill:#fbbf24;opacity:0;transform-box:fill-box;transform-origin:center;animation:bsFlash .95s ease-out forwards}
.bsr .fx-mine .flash{fill:#f59e0b}
.bsr .fx-hit .ring,.bsr .fx-sunk .ring,.bsr .fx-mine .ring{stroke:#fb923c}
.bsr .bs-fx .boom{fill:#fb923c;opacity:0;transform-box:fill-box;transform-origin:center;animation:bsBoom 1.3s cubic-bezier(.2,.9,.3,1.15) forwards}
.bsr .bs-fx .smoke{fill:#94a3b8;opacity:0;animation:bsSmoke 1.45s ease-out forwards}
.bsr .bs-fx .s2{animation-delay:.16s}
.bsr .fx-sunk .sink{stroke:#f87171;animation-duration:1.5s}
.bsr .fx-scan .ring{stroke:#fbbf24;animation-duration:1.3s}
.bsr .fx-repair .ring{stroke:#34d399}
@keyframes bsRing{0%{transform:scale(.15);opacity:.9}100%{transform:scale(1.9);opacity:0}}
@keyframes bsFlash{0%{transform:scale(.2);opacity:.95}55%{transform:scale(1.25);opacity:.5}100%{transform:scale(1.6);opacity:0}}
@keyframes bsBoom{0%{transform:scale(.1);opacity:0}30%{transform:scale(1.15);opacity:1}70%{transform:scale(.95);opacity:1}100%{transform:scale(.85);opacity:0}}
@keyframes bsSmoke{0%{opacity:0;transform:translateY(0)}25%{opacity:.7}100%{opacity:0;transform:translateY(-14px)}}
@keyframes bsSplash{0%{opacity:.9;transform:scale(.4)}100%{opacity:0;transform:scale(1.5)}}
/* Overlays — fixed head/foot, scrollable body, one modal wins at a time. */
.bsr .bs-ov{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(2,6,23,.74);backdrop-filter:blur(3px);z-index:8;border-radius:12px;padding:12px}
.bsr .bs-card{display:flex;flex-direction:column;overflow:hidden;max-height:100%;width:min(420px,100%);padding:18px 20px;background:#0f172a;border:1px solid #1e293b;border-radius:14px;box-shadow:0 18px 50px rgba(2,6,23,.45)}
.bsr .bs-card.wide{width:min(640px,100%)}
.bsr .bs-head{display:flex;align-items:center;justify-content:space-between;gap:12px;flex:none;padding-bottom:12px;border-bottom:1px solid #ffffff12}
.bsr .bs-head h3{margin:0;font-size:15px;font-weight:800;letter-spacing:.5px}
.bsr .bs-head h3.win{color:#34d399}
.bsr .bs-head h3.lose{color:#f87171}
.bsr .bs-body{flex:1 1 auto;min-height:0;overflow:auto;padding:14px 0;font-size:12.5px;color:#94a3b8}
.bsr .bs-body p{margin:0 0 10px}
.bsr .bs-foot{flex:none;display:flex;align-items:center;justify-content:space-between;gap:10px;padding-top:12px;border-top:1px solid #ffffff12}
.bsr .bs-note{font-size:11px;color:var(--bs-mut)}
.bsr .bs-tag{font:700 10px/1 ui-monospace,monospace;letter-spacing:.1em;color:var(--bs-mut);border:1px solid var(--bs-line);border-radius:999px;padding:5px 9px}
.bsr .bs-cheat-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.bsr .bs-help{display:grid;grid-template-columns:1fr 1fr;gap:14px}
.bsr .bs-help b{display:block;margin-bottom:6px;font-size:10px;font-weight:800;letter-spacing:1.4px;text-transform:uppercase;color:var(--bs-warn)}
.bsr .bs-help ul{margin:0 0 12px;padding-left:16px;line-height:1.7}
.bsr .bs-kbd{display:inline-block;padding:1px 5px;border:1px solid var(--bs-line);border-bottom-width:2px;border-radius:5px;background:#0a0f1c;color:var(--bs-ink);font:600 10px/1.5 ui-monospace,monospace}
@media (max-width:560px){
  .bsr .bs-cheat-grid{grid-template-columns:1fr}
}
@media (pointer:coarse){
  .bsr .bs-b,.bsr .bs-ship{min-height:44px;padding:10px 14px}
  .bsr .bs-card .bs-b{min-height:44px}
}
@media (prefers-reduced-motion:reduce){.bsr *{animation-duration:.01ms!important;animation-iteration-count:1!important;transition-duration:.01ms!important;scroll-behavior:auto!important}}

/* --- fill height + mobile refinements (keep LAST) --- */
.bsr.game-fill > .bs-stage{flex:1 1 auto;min-height:0;aspect-ratio:auto}
@media (max-width:640px){
.bsr.game-fill > .bs-stage:not(:has(.bs-ov:not([hidden]))){min-height:0}
.bsr.game-fill > .bs-stage:has(.bs-ov:not([hidden])){flex:0 0 auto;min-height:min(70dvh,620px)}
.bsr .bs-boards{flex-direction:column;gap:10px;align-items:center}
.bsr .bs-col{flex:0 0 auto;width:100%;max-width:340px}
.bsr .bs-board{flex:none;width:min(320px,100%);aspect-ratio:1;min-height:0}
.bsr .bs-hud{gap:5px;margin-bottom:0}
.bsr .bs-hud .bs-chip{padding:4px 6px;font-size:9px}
.bsr .bs-hud .bs-chip:has([data-hud="hits"]),.bsr .bs-hud .bs-chip[data-side]{display:none}
.bsr .bs-hud .bs-b{min-height:32px;padding:5px 9px;font-size:9px}
.bsr .bs-hud .bs-btn-label,.bsr .bs-hud .bs-sp{display:none}
.bsr .bs-ov{padding:8px}
.bsr .bs-card{width:100%;height:100%;max-height:100%;padding:12px;border-radius:12px}
.bsr .bs-body,.bsr .bs-cheat-grid,.bsr .bs-help{scrollbar-width:none}
.bsr .bs-body::-webkit-scrollbar,.bsr .bs-cheat-grid::-webkit-scrollbar,.bsr .bs-help::-webkit-scrollbar{display:none}
.bsr .bs-help,.bsr .bs-cheat-grid{grid-template-columns:1fr}
.bsr .bs-foot{position:static;margin:0;padding:10px 0 0}
}
</style>
<div class="game-app bsr game-fill" data-bsr>
  <div class="bs-hud">
    <span class="bs-chip status" data-status data-tone="idle">Ready</span>
    <span class="bs-chip" data-side hidden>You: P1</span>
    <span class="bs-chip">Credits<b data-hud="money">$60</b></span>
    <span class="bs-chip">Shots<b data-hud="shots">0</b></span>
    <span class="bs-chip">Hits<b data-hud="hits">0</b></span>
    <span class="bs-chip">Enemy<b data-hud="sunk">0/5</b></span>
    <span class="bs-chip warn" data-stun hidden>Enemy disabled</span>
    <span class="bs-sp"></span>
    <button class="bs-b bs-icon-btn" type="button" data-help aria-label="How to play" title="How to play (H)">${iconSVG("helpCircle", { size: 14 })}<span class="bs-btn-label">Help</span></button>
    <button class="bs-b bs-icon-btn" type="button" data-cheats aria-label="Cheats" title="Cheats (C)">${iconSVG("wrench", { size: 14 })}<span class="bs-btn-label">Cheats</span></button>
    <button class="bs-b bs-icon-btn" type="button" data-pause aria-label="Pause" title="Pause (P)">${iconSVG("pause", { size: 14 })}<span class="bs-btn-label">Pause</span></button>
    <button class="bs-b bs-icon-btn" type="button" data-restart aria-label="Restart" title="Restart (R)">${iconSVG("refresh", { size: 14 })}<span class="bs-btn-label">Restart</span></button>
    <button class="bs-b bs-icon-btn" type="button" data-exit aria-label="Exit game" title="Exit game">${iconSVG("logOut", { size: 14 })}<span class="bs-btn-label">Exit game</span></button>
  </div>
  <section class="game-panel bs-stage" data-board>
    <div class="bs-bar" data-setupbar>
      <div class="bs-ships" data-ships></div>
      <div class="bs-row">
        <button class="bs-b" type="button" data-act="rotate" data-rotate>Rotate · T</button>
        <button class="bs-b" type="button" data-act="auto">Auto</button>
        <button class="bs-b" type="button" data-act="clear">Clear</button>
        <button class="bs-b pri" type="button" data-act="ready" data-ready disabled>Start battle</button>
      </div>
    </div>
    <div class="bs-bar bs-shop" data-shopbar>
      <button class="bs-b" type="button" data-buy="mine">Mine<em>$20</em></button>
      <button class="bs-b" type="button" data-buy="radar">Radar<em>$30</em></button>
      <button class="bs-b" type="button" data-buy="strike">Airstrike<em>$50</em></button>
      <button class="bs-b" type="button" data-buy="repair">Repair<em>$35</em></button>
    </div>
    <div class="bs-boards">
      <div class="bs-col">
        <div class="bs-head">Your fleet</div>
        <div class="bs-board" data-board-side="you"><svg viewBox="0 0 320 320" role="img" aria-label="Your fleet"></svg></div>
        <div class="bs-fleet" data-fleet="you"></div>
      </div>
      <div class="bs-col">
        <div class="bs-head">Enemy waters</div>
        <div class="bs-board" data-board-side="foe"><svg viewBox="0 0 320 320" role="img" aria-label="Enemy waters"></svg></div>
        <div class="bs-fleet" data-fleet="foe"></div>
      </div>
    </div>
    <div class="bs-toasts" data-toasts></div>
    <div class="bs-ov" data-ov="cheat" hidden>
      <div class="bs-card wide">
        <div class="bs-head"><h3>Cheats</h3><button class="bs-b" type="button" data-close aria-label="Close cheats">Close</button></div>
        <div class="bs-body bs-cheat-grid">
          <button class="bs-b" type="button" data-cheat="cash">+ $500</button>
          <button class="bs-b" type="button" data-cheat="reveal">Reveal fleet</button>
          <button class="bs-b" type="button" data-cheat="mines">Reveal mines</button>
          <button class="bs-b" type="button" data-cheat="freeze">Freeze AI</button>
          <button class="bs-b" type="button" data-cheat="snipe">Guaranteed hit</button>
          <button class="bs-b" type="button" data-cheat="stun">Disable enemy</button>
          <button class="bs-b danger" type="button" data-cheat="win">Sink all · win</button>
        </div>
      </div>
    </div>
    <div class="bs-ov" data-ov="pause" hidden>
      <div class="bs-card">
        <div class="bs-head"><h3>Paused</h3><span class="bs-tag">Solo</span></div>
        <div class="bs-body"><p>AI turns, toasts and effects are frozen. Press <span class="bs-kbd">P</span> or <span class="bs-kbd">Esc</span> to resume.</p></div>
        <div class="bs-foot"><span class="bs-note">Battle held</span><button class="bs-b pri" type="button" data-resume>Resume</button></div>
      </div>
    </div>
    <div class="bs-ov" data-ov="over" hidden>
      <div class="bs-card">
        <div class="bs-head"><h3 data-over-title>Victory</h3><span class="bs-tag">Battle report</span></div>
        <div class="bs-body"><p data-over-stats></p></div>
        <div class="bs-foot"><span class="bs-note">Fleet report</span><button class="bs-b pri" type="button" data-again>Play again</button></div>
      </div>
    </div>
    <div class="bs-ov" data-ov="help" hidden>
      <div class="bs-card wide">
        <div class="bs-head"><h3>How to play</h3><button class="bs-b" type="button" data-help-close aria-label="Close help">Close</button></div>
        <div class="bs-body bs-help">
          <div>
            <b>Desktop</b>
            <ul>
              <li>Select a ship, then click your grid to deploy it. Ships need a 1-cell gap.</li>
              <li><span class="bs-kbd">T</span> rotate · <span class="bs-kbd">1–5</span> select ship · <span class="bs-kbd">Auto</span> deploys the fleet.</li>
              <li>Arrow keys / <span class="bs-kbd">WASD</span> move the cursor · <span class="bs-kbd">Enter</span> or click to fire.</li>
              <li>Right-click cancels targeting or rotates the selected ship.</li>
              <li><span class="bs-kbd">H</span> help · <span class="bs-kbd">C</span> cheats · <span class="bs-kbd">P</span> pause · <span class="bs-kbd">R</span> restart.</li>
            </ul>
            <b>Mobile</b>
            <ul>
              <li>Tap a ship, then tap your grid to deploy. Tap enemy waters to fire.</li>
              <li>Fleet and shop buttons sit directly above the two grids.</li>
            </ul>
          </div>
          <div>
            <b>Rules</b>
            <ul>
              <li>Hits earn credits; sinking a ship pays a bonus and reveals it.</li>
              <li>A miss passes the turn; a hit lets you fire again.</li>
              <li>Mines skip the enemy's next turn, radar scans 3×3 and airstrike hits a plus.</li>
              <li>Sink all five enemy ships before your own fleet is destroyed.</li>
              <li>Cheats, pause and restart are unavailable in multiplayer rooms.</li>
            </ul>
            <div class="bs-foot"><span class="bs-note">Press H to reopen this guide</span><button class="bs-b pri" type="button" data-help-close>Got it</button></div>
          </div>
        </div>
      </div>
    </div>
  </section>
</div>`;

    /* ---------- board scaffolding ---------- */
    const boards = {};
    root.querySelectorAll(".bs-board").forEach((wrap) => {
        const side = wrap.dataset.boardSide;
        const svg = wrap.querySelector("svg");
        const cells = mk("g", {}, svg);
        for (let r = 0; r < N; r++)
            for (let c = 0; c < N; c++)
                mk("rect", { x: c * CS + 0.5, y: r * CS + 0.5, width: CS - 1, height: CS - 1, class: "bs-cell" }, cells);
        boards[side] = {
            wrap, svg,
            buffer: mk("g", {}, svg), ships: mk("g", {}, svg), icons: mk("g", {}, svg),
            marks: mk("g", {}, svg), ghost: mk("g", {}, svg), fx: mk("g", {}, svg)
        };
    });

    /* ---------- drawing ---------- */
    function shipArt(parent, s, style) {
        const b = box(s.cells);
        const L = s.len * CS - 10, W = CS * 0.6;
        const cx = (b.c0 + b.c1 + 1) * CS / 2, cy = (b.r0 + b.r1 + 1) * CS / 2;
        const tr = s.horiz
            ? "translate(" + (cx - L / 2) + "," + (cy - W / 2) + ")"
            : "translate(" + cx + "," + cy + ") rotate(90) translate(" + (-L / 2) + "," + (-W / 2) + ")";
        const g = mk("g", { transform: tr, class: "bs-shipart" + (style === "sunk" ? " sunk" : style === "ghost" ? " ghost" : "") }, parent);
        const hull = "M5 " + (W / 2) + " C5 " + (W * 0.14) + " 11 2 19 2 L " + (L - 20) + " 2 C " + (L - 9) + " 2 " + (L - 3) + " " + (W * 0.32) + " " + (L - 1) + " " + (W / 2) +
            " C " + (L - 3) + " " + (W * 0.68) + " " + (L - 9) + " " + (W - 2) + " " + (L - 20) + " " + (W - 2) + " L 19 " + (W - 2) + " C 11 " + (W - 2) + " 5 " + (W * 0.86) + " 5 " + (W / 2) + " Z";
        mk("path", { d: hull, class: "hull" }, g);
        mk("rect", { x: 13, y: W * 0.24, width: Math.max(6, L - 34), height: W * 0.52, rx: 3.5, class: "deck" }, g);
        mk("rect", { x: L * 0.4, y: W * 0.14, width: Math.max(10, L * 0.16), height: W * 0.72, rx: 2.5, class: "bridge" }, g);
        mk("circle", { cx: L * 0.22, cy: W / 2, r: W * 0.17, class: "turret" }, g);
        mk("line", { x1: L * 0.22, y1: W / 2, x2: L * 0.22 + W * 0.34, y2: W / 2, class: "barrel" }, g);
        if (s.len > 2) {
            mk("circle", { cx: L * 0.72, cy: W / 2, r: W * 0.15, class: "turret" }, g);
            mk("line", { x1: L * 0.72, y1: W / 2, x2: L * 0.72 + W * 0.3, y2: W / 2, class: "barrel" }, g);
        }
        mk("circle", { cx: L * 0.48, cy: W * 0.5, r: 1.6, class: "mast" }, g);
        return g;
    }
    function bufferRect(parent, cells, cls) {
        const b = box(cells);
        const x0 = Math.max(0, b.c0 - 1), y0 = Math.max(0, b.r0 - 1);
        const x1 = Math.min(N - 1, b.c1 + 1), y1 = Math.min(N - 1, b.r1 + 1);
        mk("rect", { x: x0 * CS + 1.5, y: y0 * CS + 1.5, width: (x1 - x0 + 1) * CS - 3, height: (y1 - y0 + 1) * CS - 3, rx: 7, class: cls || "bs-buffer" }, parent);
    }
    function flame(parent, r, c) {
        const g = mk("g", { transform: "translate(" + (c * CS + CS / 2) + "," + (r * CS + CS / 2) + ")" }, parent);
        mk("path", { d: "M0 -11 C4 -6 8.5 -3.5 8.5 3 A8.5 8.5 0 0 1 -8.5 3 C-8.5 -3.5 -4 -6 0 -11 Z", fill: "#fb923c" }, g);
        mk("path", { d: "M0 -3 C2.4 -0.5 3.6 1.4 3.2 3.6 A3.6 3.6 0 0 1 -3.2 3.6 C-3.6 1.4 -2.4 -0.5 0 -3 Z", fill: "#fde047" }, g);
    }
    function mineIcon(parent, r, c) {
        const g = mk("g", { transform: "translate(" + (c * CS + CS / 2) + "," + (r * CS + CS / 2) + ")" }, parent);
        for (let i = 0; i < 8; i++) {
            const a = i * Math.PI / 4;
            mk("line", { x1: Math.cos(a) * 4.5, y1: Math.sin(a) * 4.5, x2: Math.cos(a) * 8, y2: Math.sin(a) * 8, class: "bs-spike" }, g);
        }
        mk("circle", { r: 4.6, class: "bs-mine" }, g);
    }
    function scanMark(parent, r, c, v) {
        const x = c * CS + CS / 2, y = r * CS + CS / 2;
        if (v === 1) mk("path", { d: "M" + x + " " + (y - 5) + " L" + (x + 5) + " " + y + " L" + x + " " + (y + 5) + " L" + (x - 5) + " " + y + " Z", class: "bs-scan1" }, parent);
        else if (v === 2) {
            mk("line", { x1: x - 4, y1: y - 4, x2: x + 4, y2: y + 4, class: "bs-scan2" }, parent);
            mk("line", { x1: x - 4, y1: y + 4, x2: x + 4, y2: y - 4, class: "bs-scan2" }, parent);
        } else mk("circle", { cx: x, cy: y, r: 1.6, class: "bs-scan0" }, parent);
    }
    function drawMarks(parent, shots) {
        Object.keys(shots).forEach((k) => {
            const pt = k.split(","), r = +pt[0], c = +pt[1];
            if (shots[k] === "miss") mk("circle", { cx: c * CS + CS / 2, cy: r * CS + CS / 2, r: 3.2, class: "bs-missdot" }, parent);
            else flame(parent, r, c);
        });
    }
    function renderBoard(screen) {
        const B = boards[screen];
        const owner = screen === "you" ? mySide() : 1 - mySide();
        const p = state.players[owner], enemy = state.players[1 - owner];
        B.buffer.innerHTML = ""; B.ships.innerHTML = ""; B.icons.innerHTML = ""; B.marks.innerHTML = "";
        if (screen === "you") {
            p.ships.forEach((s) => {
                if (!s.cells) return;
                bufferRect(B.buffer, s.cells);
                shipArt(B.ships, s, s.sunk ? "sunk" : "own");
            });
            p.mines.forEach((m) => mineIcon(B.icons, m[0], m[1]));
            drawMarks(B.marks, enemy.shots);
        } else {
            p.ships.forEach((s) => {
                if (!s.cells) return;
                if (s.sunk) shipArt(B.ships, s, "sunk");
                else if (!online && cheats.reveal) shipArt(B.ships, s, "ghost");
            });
            if (!online && cheats.mines) p.mines.forEach((m) => mineIcon(B.icons, m[0], m[1]));
            Object.keys(enemy.scans).forEach((k) => {
                const pt = k.split(",");
                scanMark(B.icons, +pt[0], +pt[1], enemy.scans[k]);
            });
            drawMarks(B.marks, enemy.shots);
        }
    }
    const activeScreen = () => state.phase === "setup" ? "you" : aim === "mine" ? "you" : "foe";
    function renderGhost() {
        boards.you.ghost.innerHTML = ""; boards.foe.ghost.innerHTML = "";
        if (!state) return;
        const p = me(), phase = state.phase;
        if (cursorOn && phase !== "over")
            mk("rect", { x: cursor.c * CS + 1.5, y: cursor.r * CS + 1.5, width: CS - 3, height: CS - 3, rx: 4, class: "bs-cursor" }, boards[activeScreen()].ghost);
        if (phase === "setup") {
            const cell = hover.you || (cursorOn ? cursor : null);
            const s = p.ships[sel];
            if (cell && s && !s.cells && !p.ready) {
                const h = orient === "H", ok = canPlace(gridOf(p), cell.r, cell.c, s.len, h);
                for (let i = 0; i < s.len; i++) {
                    const rr = h ? cell.r : cell.r + i, cc = h ? cell.c + i : cell.c;
                    if (!inb(rr, cc)) continue;
                    mk("rect", { x: cc * CS + 3, y: rr * CS + 3, width: CS - 6, height: CS - 6, rx: 5, class: ok ? "bs-g-ok" : "bs-g-bad" }, boards.you.ghost);
                }
                const cs = cellsOf(cell.r, cell.c, s.len, h);
                if (cs) bufferRect(boards.you.ghost, cs, ok ? "bs-gb-ok" : "bs-gb-bad");
            }
        } else if (aim === "mine") {
            const cell = hover.you || (cursorOn ? cursor : null);
            if (cell) mk("rect", { x: cell.c * CS + 3, y: cell.r * CS + 3, width: CS - 6, height: CS - 6, rx: 5, class: mineOk(mySide(), cell.r, cell.c) ? "bs-g-ok" : "bs-g-bad" }, boards.you.ghost);
        } else if (aim === "radar" || aim === "strike") {
            const cell = hover.foe || (cursorOn ? cursor : null);
            if (cell) {
                const list = aim === "radar" ? area3(cell.r, cell.c) : plusCells(cell.r, cell.c);
                list.forEach((rc) => mk("rect", { x: rc[1] * CS + 3, y: rc[0] * CS + 3, width: CS - 6, height: CS - 6, rx: 5, class: "bs-g-aim" }, boards.foe.ghost));
            }
        }
    }
    function renderFleets() {
        [["you", me()], ["foe", foe()]].forEach((pair) => {
            const boxEl = root.querySelector('[data-fleet="' + pair[0] + '"]');
            boxEl.innerHTML = "";
            pair[1].ships.forEach((s) => {
                const row = document.createElement("div");
                row.className = "bs-frow" + (s.sunk ? " sunk" : "");
                const nm = document.createElement("span");
                nm.textContent = s.name;
                const pips = document.createElement("span");
                pips.className = "bs-pips";
                for (let i = 0; i < s.len; i++) {
                    const dot = document.createElement("i");
                    if (i < s.hits) dot.className = "on";
                    pips.appendChild(dot);
                }
                row.appendChild(nm); row.appendChild(pips);
                boxEl.appendChild(row);
            });
        });
    }
    function renderHud() {
        const p = me(), d = foe();
        const shots = Object.keys(p.shots).length;
        const hits = Object.keys(p.shots).filter((k) => p.shots[k] !== "miss").length;
        $('[data-hud="money"]').textContent = "$" + p.money;
        $('[data-hud="shots"]').textContent = shots;
        $('[data-hud="hits"]').textContent = hits;
        $('[data-hud="sunk"]').textContent = d.ships.filter((s) => s.sunk).length + "/5";
        const sideChip = $("[data-side]");
        sideChip.hidden = !online;
        sideChip.textContent = "You: P" + (mySide() + 1);
        $("[data-stun]").hidden = !d.stun;
        let text, tone;
        if (state.phase === "setup") { text = p.ready ? "Waiting for opponent" : "Deploy your fleet"; tone = "idle"; }
        else if (state.phase === "over") { text = state.winner === mySide() ? "Victory" : "Defeat"; tone = state.winner === mySide() ? "you" : "foe"; }
        else if (aim) { text = { mine: "Place mine on your waters", radar: "Pick radar center (3×3)", strike: "Pick airstrike center (+)" }[aim]; tone = "you"; }
        else if (state.turn === mySide()) { text = "Your turn — fire"; tone = "you"; }
        else { text = state.players[state.turn].name + " is aiming…"; tone = "foe"; }
        const statusChip = $("[data-status]");
        statusChip.textContent = text;
        statusChip.dataset.tone = tone;
        boards.foe.wrap.classList.toggle("aim", state.phase === "battle" && state.turn === mySide() && !aim);
        boards.you.wrap.classList.toggle("aim", (state.phase === "setup" && !p.ready) || aim === "mine");
    }
    function renderSetup() {
        const bar = $("[data-setupbar]");
        bar.hidden = state.phase !== "setup";
        if (bar.hidden) return;
        const p = me(), boxEl = $("[data-ships]");
        boxEl.innerHTML = "";
        p.ships.forEach((s, i) => {
            const b = document.createElement("button");
            b.type = "button";
            b.className = "bs-ship" + (i === sel && !s.cells ? " sel" : "") + (s.cells ? " done" : "");
            b.dataset.ship = i;
            b.disabled = Boolean(s.cells) || p.ready;
            b.textContent = s.name + " · " + s.len;
            boxEl.appendChild(b);
        });
        $("[data-rotate]").textContent = "Rotate · " + orient + " (T)";
        ["rotate", "auto", "clear"].forEach((a) => {
            const b = root.querySelector('[data-act="' + a + '"]');
            if (b) b.disabled = p.ready;
        });
        const rd = $("[data-ready]");
        rd.disabled = !allPlaced(p) || p.ready;
        rd.textContent = p.ready ? "Waiting…" : online ? "Ready" : "Start battle";
    }
    function renderShop() {
        const bar = $("[data-shopbar]");
        bar.hidden = state.phase === "over";
        if (bar.hidden) return;
        const p = me();
        const myTurn = state.phase === "battle" && state.turn === mySide();
        const canMine = ((state.phase === "setup" && !p.ready) || myTurn) && p.money >= COST.mine;
        const dmg = p.ships.some((s) => s.cells && !s.sunk && s.hits > 0);
        bar.querySelectorAll("[data-buy]").forEach((b) => {
            const it = b.dataset.buy;
            const ok = it === "mine" ? canMine
                : it === "repair" ? (myTurn && p.money >= COST.repair && dmg)
                    : (myTurn && p.money >= COST[it]);
            b.disabled = !ok;
            b.classList.toggle("on", aim === it);
        });
    }
    function renderCheats() {
        $("[data-cheats]").hidden = online;
        $("[data-restart]").hidden = online;
        $("[data-pause]").hidden = online;
        const panel = $('[data-ov="cheat"]');
        panel.querySelector('[data-cheat="reveal"]').classList.toggle("on", cheats.reveal);
        panel.querySelector('[data-cheat="mines"]').classList.toggle("on", cheats.mines);
        panel.querySelector('[data-cheat="freeze"]').classList.toggle("on", cheats.freeze);
    }
    function syncOverlays() {
        const over = Boolean(state && state.phase === "over");
        $('[data-ov="help"]').hidden = !helpOpen;
        $('[data-ov="cheat"]').hidden = online || !cheatOpen || helpOpen;
        $('[data-ov="pause"]').hidden = online || !paused || helpOpen || cheatOpen;
        $('[data-ov="over"]').hidden = !over || helpOpen || cheatOpen || paused;
        const pbtn = $("[data-pause]");
        if (pbtn) {
            const label = pbtn.querySelector(".bs-btn-label");
            if (label) label.textContent = paused ? "Resume" : "Pause";
            pbtn.setAttribute("aria-label", paused ? "Resume" : "Pause");
            pbtn.setAttribute("title", paused ? "Resume (P)" : "Pause (P)");
        }
        const cbtn = $("[data-cheats]");
        if (cbtn) cbtn.classList.toggle("on", cheatOpen || Object.keys(cheats).some((k) => cheats[k]));
    }
    function renderOver() {
        if (!state || state.phase !== "over") return;
        const win = state.winner === mySide();
        const t = $("[data-over-title]");
        t.textContent = win ? "Victory" : "Defeat";
        t.className = win ? "win" : "lose";
        const p = me();
        const shots = Object.keys(p.shots).length;
        const hits = Object.keys(p.shots).filter((k) => p.shots[k] !== "miss").length;
        $("[data-over-stats]").textContent = "Shots " + shots + " · Hits " + hits + " · Accuracy " +
            (shots ? Math.round(hits / shots * 100) : 0) + "% · Credits $" + p.money;
        $("[data-again]").hidden = online;
    }
    function evText(ev) {
        const mine = ev.actor === mySide();
        const an = ev.actor != null ? state.players[ev.actor].name : "";
        let text = "", kind = "info";
        switch (ev.type) {
            case "hit": text = mine ? "Hit — fire again!" : an + " hit your fleet"; kind = mine ? "good" : "bad"; break;
            case "miss": text = mine ? "Miss" : an + " missed"; break;
            case "mine": text = mine ? "You triggered a mine — next turn lost" : an + " triggered your mine!"; kind = mine ? "bad" : "good"; break;
            case "sunk": text = (mine ? "You sank the enemy " : an + " sank your ") + ev.ship + "!"; kind = mine ? "good" : "bad"; break;
            case "strike": text = (mine ? "Airstrike — " : an + " airstrike — ") + ev.n + " hit" + (ev.n === 1 ? "" : "s"); kind = (ev.n > 0) === mine ? "good" : "bad"; break;
            case "radar": text = mine ? "Radar sweep complete" : an + " used radar"; break;
            case "repair": text = (mine ? "You repaired your " : an + " repaired its ") + ev.ship; kind = mine ? "good" : "bad"; break;
            case "mineplace": text = mine ? "Mine deployed" : an + " deployed a mine"; break;
            case "ready": text = ev.name + " is ready"; break;
            case "start": text = ev.name + " fires first"; break;
            case "over": text = ev.winner === mySide() ? "Victory — enemy fleet destroyed" : "Defeat — your fleet was destroyed"; kind = ev.winner === mySide() ? "good" : "bad"; break;
            case "cheat": text = ev.text || ""; kind = ev.kind || "good"; break;
        }
        if (ev.stunned) text += " · " + ev.stunned + " is disabled";
        return { text, kind };
    }
    function render() {
        if (!state) { $("[data-status]").textContent = "Connecting…"; syncOverlays(); return; }
        const p = me();
        if (state.phase === "setup" && p.ships[sel] && p.ships[sel].cells) {
            const n = p.ships.findIndex((s) => !s.cells);
            if (n >= 0) sel = n;
        }
        if (state.phase === "over" && aim) aim = null;
        renderHud(); renderSetup(); renderShop();
        renderBoard("you"); renderBoard("foe");
        renderFleets(); renderGhost(); renderOver(); renderCheats(); syncOverlays();
        const ev = state.ev;
        if (ev && ev.id !== seenEv) {
            seenEv = ev.id;
            const t = evText(ev);
            if (t.text) toast(t.text, t.kind);
            spawnFx(ev);
        }
    }

    /* ---------- toasts & fx ---------- */
    function toast(msg, kind) {
        const boxEl = $("[data-toasts]");
        const t = document.createElement("div");
        t.className = "bs-toast" + (kind && kind !== "info" ? " " + kind : "");
        t.textContent = msg;
        boxEl.appendChild(t);
        while (boxEl.children.length > 3) boxEl.firstChild.remove();
        later(2600, () => t.remove());
    }
    const FLAME_D = "M0 -11 C4 -6 8.5 -3.5 8.5 3 A8.5 8.5 0 0 1 -8.5 3 C-8.5 -3.5 -4 -6 0 -11 Z";
    function fxAt(screen, cell) {
        const g = mk("g", { transform: "translate(" + (cell.c * CS + CS / 2) + "," + (cell.r * CS + CS / 2) + ")", class: "bs-fx fx-" + cell.res }, boards[screen].fx);
        if (cell.res === "miss") {
            mk("circle", { r: 10, class: "ring r1" }, g);
            mk("circle", { r: 10, class: "ring r2" }, g);
            mk("circle", { r: 2.5, class: "splash" }, g);
        } else if (cell.res === "hit" || cell.res === "sunk") {
            mk("circle", { r: 12, class: "flash" }, g);
            mk("circle", { r: 10, class: "ring r1" }, g);
            mk("path", { d: FLAME_D, class: "boom" }, g);
            mk("circle", { r: 3, cx: -4, cy: -6, class: "smoke s1" }, g);
            mk("circle", { r: 2.4, cx: 5, cy: -8, class: "smoke s2" }, g);
            if (cell.res === "sunk") mk("circle", { r: 13, class: "ring sink" }, g);
        } else if (cell.res === "scan" || cell.res === "repair") {
            mk("circle", { r: 14, class: "ring" }, g);
        } else if (cell.res === "mine") {
            mk("circle", { r: 12, class: "flash" }, g);
            mk("circle", { r: 11, class: "ring r1" }, g);
        }
        later(1700, () => g.remove());
    }
    function spawnFx(ev) {
        if (ev.type === "repair") {
            if (ev.actor === mySide()) {
                const s = me().ships.find((x) => x.name === ev.ship);
                if (s && s.cells) fxAt("you", { r: s.cells[0][0], c: s.cells[0][1], res: "repair" });
            }
            return;
        }
        if (ev.type === "mineplace") {
            if (ev.actor === mySide() && me().mines.length) {
                const m = me().mines[me().mines.length - 1];
                fxAt("you", { r: m[0], c: m[1], res: "mine" });
            }
            return;
        }
        if (!ev.cells || ev.board == null) return;
        const screen = ev.board === mySide() ? "you" : "foe";
        ev.cells.forEach((cell, i) => later(i * 140, () => { if (!destroyed) fxAt(screen, cell); }));
    }

    /* ---------- cheats (offline only) ---------- */
    function runCheat(kind) {
        if (online || !state) return;
        const p = state.players[0], d = state.players[1];
        if (kind === "cash") { p.money += 500; setEv("cheat", null, null, { text: "+ $500 credits", kind: "good" }); }
        else if (kind === "reveal") cheats.reveal = !cheats.reveal;
        else if (kind === "mines") cheats.mines = !cheats.mines;
        else if (kind === "freeze") { cheats.freeze = !cheats.freeze; if (!cheats.freeze) maybeAI(); }
        else if (kind === "stun") {
            if (state.phase !== "battle") { toast("Start a battle first", "bad"); return; }
            d.stun = true; setEv("cheat", null, null, { text: "Enemy will skip its next turn", kind: "good" });
        } else if (kind === "snipe") {
            if (state.phase !== "battle" || state.turn !== 0) { toast("Only on your battle turn", "bad"); return; }
            const opts = [];
            d.ships.forEach((s) => {
                if (s.cells && !s.sunk) s.cells.forEach((rc) => { if (!p.shots[key(rc[0], rc[1])]) opts.push(rc); });
            });
            if (!opts.length) return;
            const rc = opts[rand(opts.length)];
            doFire(0, rc[0], rc[1]);
        } else if (kind === "win") {
            if (state.phase !== "battle") { toast("Start a battle first", "bad"); return; }
            d.ships.forEach((s) => {
                if (!s.cells) return;
                s.sunk = true; s.hits = s.len;
                s.cells.forEach((rc) => { p.shots[key(rc[0], rc[1])] = "sunk"; });
            });
            checkWin(0);
        }
        publish();
    }

    /* ---------- input ---------- */
    function cellFromEvent(bw, e) {
        const svg = bw.querySelector("svg"), rect = svg.getBoundingClientRect();
        if (!rect.width || !rect.height) return null;
        /* SVG keeps its 1:1 viewBox ratio (meet), so map through the letterboxed viewport. */
        const scale = Math.min(rect.width, rect.height) / VB;
        const ox = (rect.width - VB * scale) / 2, oy = (rect.height - VB * scale) / 2;
        const x = (e.clientX - rect.left - ox) / scale;
        const y = (e.clientY - rect.top - oy) / scale;
        const c = Math.floor(x / CS), r = Math.floor(y / CS);
        return inb(r, c) ? { r, c } : null;
    }
    function activateCell(screen, r, c) {
        if (!state || helpOpen || cheatOpen || paused) return;
        const side = mySide(), p = state.players[side];
        if (screen === "you") {
            if (state.phase === "setup" && !p.ready) {
                const s = p.ships[sel];
                if (!s || s.cells) return;
                if (!canPlace(gridOf(p), r, c, s.len, orient === "H")) { toast("Cannot place there — keep a 1-cell gap", "bad"); return; }
                submitAction({ type: "place", ship: sel, r, c, horiz: orient === "H" });
                return;
            }
            if (aim === "mine") {
                if (!mineOk(side, r, c)) { toast("Invalid mine spot", "bad"); return; }
                aim = null;
                submitAction({ type: "mine", r, c });
                render();
                return;
            }
            return;
        }
        if (state.phase !== "battle" || state.turn !== side || state.winner != null) return;
        if (aim === "radar") { aim = null; submitAction({ type: "radar", r, c }); render(); return; }
        if (aim === "strike") { aim = null; submitAction({ type: "strike", r, c }); render(); return; }
        if (p.shots[key(r, c)]) { toast("Already fired there"); return; }
        submitAction({ type: "fire", r, c });
    }
    function buy(item) {
        if (!state || helpOpen || cheatOpen || paused) return;
        const p = me();
        if (p.money < COST[item]) { toast("Not enough credits", "bad"); return; }
        if (item === "repair") { submitAction({ type: "repair" }); return; }
        if (item !== "mine" && (state.phase !== "battle" || state.turn !== mySide())) { toast("Only on your battle turn", "bad"); return; }
        aim = aim === item ? null : item;
        render();
    }
    function toggleHelp(on) {
        helpOpen = typeof on === "boolean" ? on : !helpOpen;
        if (helpOpen) cheatOpen = false;
        aim = null;
        render();
    }
    function setPaused(on) {
        if (online || !state) return;
        on = typeof on === "boolean" ? on : !paused;
        if (paused === on) return;
        paused = on;
        if (paused) { aim = null; pauseTimers(); }
        else resumeTimers();
        render();
    }
    function handleAct(act) {
        if (act === "restart") { restart(); return; }
        if (act === "cheats") { if (!online) { cheatOpen = !cheatOpen; renderCheats(); syncOverlays(); } return; }
        if (!state || helpOpen || cheatOpen || paused) return;
        if (act === "rotate") { if (state.phase === "setup") { orient = orient === "H" ? "V" : "H"; renderSetup(); renderGhost(); } return; }
        if (act === "auto") { if (state.phase === "setup") submitAction({ type: "auto" }); return; }
        if (act === "clear") { if (state.phase === "setup") submitAction({ type: "clear" }); return; }
        if (act === "ready") { if (state.phase === "setup" && allPlaced(me())) submitAction({ type: "ready" }); return; }
    }
    function handleClick(event) {
        const el = event.target;
        if (!el || !el.closest) return;
        if (el.closest("[data-help]")) { toggleHelp(); return; }
        if (el.closest("[data-help-close]")) { toggleHelp(false); return; }
        if (el.closest("[data-exit]")) { onExit(); return; }
        if (el.closest("[data-cheats]")) { if (!online) { cheatOpen = !cheatOpen; render(); } return; }
        if (el.closest("[data-close]")) { cheatOpen = false; render(); return; }
        if (el.closest("[data-pause]")) { setPaused(); return; }
        if (el.closest("[data-resume]")) { setPaused(false); return; }
        if (el.closest("[data-restart]") || el.closest("[data-again]")) { restart(); return; }
        if (helpOpen || cheatOpen || paused) return;
        const btn = el.closest("button");
        if (btn) {
            if (btn.dataset.act) { handleAct(btn.dataset.act); return; }
            if (btn.dataset.ship != null) {
                const i = +btn.dataset.ship, p = state && state.players[mySide()];
                if (p && p.ships[i] && !p.ships[i].cells) { sel = i; renderSetup(); renderGhost(); }
                return;
            }
            if (btn.dataset.buy) { buy(btn.dataset.buy); return; }
            if (btn.dataset.cheat) { runCheat(btn.dataset.cheat); return; }
            return;
        }
        const bw = el.closest(".bs-board");
        if (bw && state) {
            const cell = cellFromEvent(bw, event);
            if (cell) activateCell(bw.dataset.boardSide, cell.r, cell.c);
        }
    }
    function handleCtx(e) {
        const bw = e.target.closest ? e.target.closest(".bs-board") : null;
        if (!bw) return;
        e.preventDefault();                      // right mouse button = rotate / cancel targeting
        if (!state || helpOpen || cheatOpen || paused) return;
        if (aim) { aim = null; render(); return; }
        if (state.phase === "setup" && bw.dataset.boardSide === "you") {
            orient = orient === "H" ? "V" : "H";
            renderSetup(); renderGhost();
        }
    }
    function handleMove(e) {
        if (!state || helpOpen || cheatOpen || paused) return;
        const bw = e.target.closest ? e.target.closest(".bs-board") : null;
        hover.you = null; hover.foe = null;
        if (bw) {
            const cell = cellFromEvent(bw, e);
            if (cell) { hover[bw.dataset.boardSide] = cell; cursor = { r: cell.r, c: cell.c }; }
        }
        renderGhost();
    }
    function handleKey(e) {
        if (destroyed || !root.isConnected || !state) return;
        const t = e.target;
        if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA")) return;
        const k = e.key, c = e.code || "";
        const hit = (code, letter) => c === code || k === letter || k === letter.toUpperCase();
        /* HUD shortcut priority: help → cheats → pause → Escape → game actions. */
        if (hit("KeyH", "h")) { toggleHelp(); e.preventDefault(); return; }
        if (hit("KeyC", "c")) { if (!online && !helpOpen) { cheatOpen = !cheatOpen; aim = null; render(); } e.preventDefault(); return; }
        if (hit("KeyP", "p")) { if (!helpOpen) setPaused(); e.preventDefault(); return; }
        if (hit("KeyR", "r")) { if (!helpOpen && !cheatOpen) restart(); e.preventDefault(); return; }
        if (helpOpen || cheatOpen || paused) {
            if (k === "Escape") {
                if (helpOpen) toggleHelp(false);
                else if (cheatOpen) { cheatOpen = false; render(); }
                else setPaused(false);
                e.preventDefault();
            }
            return;
        }
        const move = (dr, dc) => {
            cursor.r = Math.min(N - 1, Math.max(0, cursor.r + dr));
            cursor.c = Math.min(N - 1, Math.max(0, cursor.c + dc));
            cursorOn = true; hover.you = null; hover.foe = null;
            renderGhost(); e.preventDefault();
        };
        if (k === "ArrowUp" || k === "w" || k === "W") return move(-1, 0);
        if (k === "ArrowDown" || k === "s" || k === "S") return move(1, 0);
        if (k === "ArrowLeft" || k === "a" || k === "A") return move(0, -1);
        if (k === "ArrowRight" || k === "d" || k === "D") return move(0, 1);
        if (k === "t" || k === "T") {
            if (state.phase === "setup") { orient = orient === "H" ? "V" : "H"; renderSetup(); renderGhost(); e.preventDefault(); }
            return;
        }
        if (k === "Enter" || k === " ") { cursorOn = true; activateCell(activeScreen(), cursor.r, cursor.c); renderGhost(); e.preventDefault(); return; }
        if (k >= "1" && k <= "5") {
            const i = +k - 1, p = me();
            if (state.phase === "setup" && p.ships[i] && !p.ships[i].cells) { sel = i; renderSetup(); renderGhost(); }
            return;
        }
        if (k === "Escape") { if (aim) { aim = null; render(); } return; }
    }
    function restart() {
        if (online) return;
        clearTimers();
        if (aiTimer) { clearTimeout(aiTimer); aiTimer = null; }
        paused = false; cheatOpen = false; helpOpen = false;
        aim = null; sel = 0; orient = "H"; seenEv = 0; cursorOn = false;
        boards.you.fx.innerHTML = ""; boards.foe.fx.innerHTML = "";
        $("[data-toasts]").innerHTML = "";
        state = newState();
        render();
    }

    /* ---------- wiring ---------- */
    root.addEventListener("click", handleClick);
    root.addEventListener("contextmenu", handleCtx);
    root.addEventListener("pointermove", handleMove);
    document.addEventListener("keydown", handleKey);

    if (online) {
        watch(room.onRoom((nextRoom) => { roomData = nextRoom; render(); }));
        if (room.isHost) {
            state = newState();
            publish();
            watch(room.onAction((action) => applyAction(action, 1 - state.hostSide))); // guest side is randomized
        } else {
            watch(room.onState((nextState) => { state = nextState; render(); }));
            submitAction({ type: "hello", name: playerName });
        }
    } else {
        state = newState();
        render();
    }

    return {
        destroy() {
            destroyed = true;
            root.removeEventListener("click", handleClick);
            root.removeEventListener("contextmenu", handleCtx);
            root.removeEventListener("pointermove", handleMove);
            document.removeEventListener("keydown", handleKey);
            clearTimers();
            if (aiTimer) { clearTimeout(aiTimer); aiTimer = null; }
            subs.forEach((u) => { try { u(); } catch (err) { /* ignore */ } });
        }
    };
}