/* ==== GAME: dots-and-boxes.js ==== */
/* Dots and Boxes — 4x4 boxes. You vs bot (mode "ai") or online (mode "room").
   Minimalist UI, no tutorial text, no level generator (always a fresh,
   completable empty board). A point counts ONLY when the 4th side of a box
   is drawn; the closer keeps the turn. Random starter every round; random
   seat/color mapping in multiplayer (stored in state.swap so both clients
   agree). Cheats are AI-mode only. Controls: mouse hover+click, arrows/WASD
   + Enter/Space, R restart, C cheats, H hint, U undo, Esc close; virtual
   D-pad appears automatically on touch devices. */

export const META = {
    id: "dots-and-boxes", // harus sama dengan nama file (tanpa .js)
    name: "Dots and Boxes",
    category: "board",
    catLabel: "Board",
    desc: "Draw lines and close boxes to outscore your rival on a 4x4 grid.",
    art: '<svg viewBox="0 0 48 48" width="54" height="54" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" aria-hidden="true"><path d="M10 10h28M10 10v28M38 10v28M10 38h28"/><rect x="13" y="13" width="18" height="18" rx="3" fill="currentColor" fill-opacity=".25" stroke="none"/><circle cx="10" cy="10" r="3" fill="currentColor" stroke="none"/><circle cx="38" cy="10" r="3" fill="currentColor" stroke="none"/><circle cx="24" cy="24" r="3" fill="currentColor" stroke="none"/><circle cx="10" cy="38" r="3" fill="currentColor" stroke="none"/><circle cx="38" cy="38" r="3" fill="currentColor" stroke="none"/></svg>',
    bg: ["#e0e7ff", "#818cf8"],
};

export function mount(root, context = {}) {
    const { mode = "ai", room = null, playerName = "Player", onExit = () => { } } = context;
    const online = mode === "room" && Boolean(room);
    let roomData = room?.room || null;

    /* ---------- board constants & pure helpers ---------- */
    const NB = 4, GAP = 72, PAD = 36;
    const COL = { 1: "#6366f1", 2: "#f43f5e" }; // seat 1 = indigo, seat 2 = rose
    const NAME = { 1: "indigo", 2: "rose" };
    const dx = (c) => PAD + GAP * c;
    const dy = (r) => PAD + GAP * r;
    const eKey = (t, r, c) => `${t}-${r}-${c}`;
    const KEYS = [];
    for (let r = 0; r <= NB; r++) for (let c = 0; c < NB; c++) KEYS.push(eKey("h", r, c));
    for (let r = 0; r < NB; r++) for (let c = 0; c <= NB; c++) KEYS.push(eKey("v", r, c));
    const parse = (k) => { const [t, r, c] = k.split("-"); return { t, r: +r, c: +c }; };
    const ends = (k) => { const { t, r, c } = parse(k); return { x1: dx(c), y1: dy(r), x2: dx(c) + (t === "h" ? GAP : 0), y2: dy(r) + (t === "v" ? GAP : 0) }; };
    const mid = (k) => { const { t, r, c } = parse(k); return { x: dx(c) + (t === "h" ? GAP / 2 : 0), y: dy(r) + (t === "v" ? GAP / 2 : 0) }; };
    const boxEdges = (r, c) => [eKey("h", r, c), eKey("h", r + 1, c), eKey("v", r, c), eKey("v", r, c + 1)];
    const adjBoxes = (k) => {
        const { t, r, c } = parse(k); const out = [];
        if (t === "h") { if (r > 0) out.push([r - 1, c]); if (r < NB) out.push([r, c]); }
        else { if (c > 0) out.push([r, c - 1]); if (c < NB) out.push([r, c]); }
        return out;
    };

    /* ---------- local state ---------- */
    let state = null;          // canonical, serializable (host-owned when online)
    let history = [];          // undo snapshots (AI mode only)
    let timers = [], aiTimer = null;
    let destroyed = false;
    let cursor = KEYS[0], hoverKey = null, hintKey = null;
    let cheatOpen = false, dumbBot = false, showCounts = false, flashMsg = "";

    const later = (fn, ms) => { const t = setTimeout(() => { timers = timers.filter((x) => x !== t); fn(); }, ms); timers.push(t); return t; };
    const clearTimers = () => { timers.forEach(clearTimeout); timers = []; aiTimer = null; };

    const sideCount = (r, c) => boxEdges(r, c).reduce((n, k) => n + (state.edges[k] ? 1 : 0), 0);
    const gainOf = (k) => adjBoxes(k).reduce((n, [r, c]) => n + (!state.boxes[r * NB + c] && sideCount(r, c) === 3 ? 1 : 0), 0);
    const givesThird = (k) => adjBoxes(k).some(([r, c]) => !state.boxes[r * NB + c] && sideCount(r, c) === 2);
    const freeKeys = () => KEYS.filter((k) => !state.edges[k]);

    function freshState() {
        const edges = {}; KEYS.forEach((k) => (edges[k] = 0));
        return {
            edges, boxes: Array(NB * NB).fill(0), scores: [0, 0], claimed: 0,
            turn: Math.random() < 0.5 ? 1 : 2,            // random starter (bot & online)
            swap: online ? Math.random() < 0.5 : false,   // random seat mapping (online)
            over: false, last: null,
        };
    }
    function normalize(s) { // defensive against DB serialization quirks
        const edges = {}; KEYS.forEach((k) => (edges[k] = Number(s?.edges?.[k]) || 0));
        return {
            edges,
            boxes: Array.from({ length: NB * NB }, (_, i) => Number(s?.boxes?.[i]) || 0),
            scores: [Number(s?.scores?.[0]) || 0, Number(s?.scores?.[1]) || 0],
            claimed: Number(s?.claimed) || 0,
            turn: Number(s?.turn) === 2 ? 2 : 1,
            swap: Boolean(s?.swap), over: Boolean(s?.over),
            last: typeof s?.last === "string" ? s.last : null,
        };
    }
    const hostSeat = () => (state && state.swap ? 2 : 1);
    const mySeat = () => (online ? (state ? (room.isHost ? hostSeat() : 3 - hostSeat()) : 1) : 1);
    const oppSeat = () => 3 - mySeat();
    const myTurn = () => Boolean(state) && !state.over && state.turn === mySeat();

    /* ---------- markup (built once, updated by render) ---------- */
    const parts = { boxes: "", counts: "", guides: "", lines: "", dots: "", hits: "" };
    for (let r = 0; r < NB; r++) for (let c = 0; c < NB; c++) {
        const i = r * NB + c;
        parts.boxes += `<rect data-box="${i}" x="${dx(c) + 7}" y="${dy(r) + 7}" width="${GAP - 14}" height="${GAP - 14}" rx="10" fill="#fff" fill-opacity="0"/>`;
        parts.counts += `<text data-count="${i}" x="${dx(c) + GAP / 2}" y="${dy(r) + GAP / 2 + 5}" text-anchor="middle" font-size="15" font-weight="600" fill="#94a3b8" opacity="0"></text>`;
    }
    KEYS.forEach((k) => {
        const { x1, y1, x2, y2 } = ends(k);
        const geo = `x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"`;
        parts.guides += `<line ${geo} stroke="#e2e8f0" stroke-width="3" stroke-linecap="round"/>`;
        parts.lines += `<line data-line="${k}" ${geo} stroke="transparent" stroke-width="5" stroke-linecap="round" opacity="0"/>`;
        parts.hits += `<line data-hit="${k}" class="dab-hit" ${geo} stroke="#000" stroke-opacity="0" stroke-width="26" stroke-linecap="round" style="pointer-events:stroke"/>`;
    });
    for (let r = 0; r <= NB; r++) for (let c = 0; c <= NB; c++)
        parts.dots += `<circle cx="${dx(c)}" cy="${dy(r)}" r="5.5" fill="#64748b"/>`;

    root.innerHTML = `
<style>
.dab{--ink:#0f172a;--mut:#64748b;--hair:#e2e8f0;color:var(--ink)}
.dab .game-intro{display:flex;align-items:center;justify-content:space-between;gap:12px}
.dab .game-intro h2{margin:0;font-size:1.05rem;font-weight:650;letter-spacing:-.01em}
.dab .game-status{display:inline-flex;align-items:center;gap:7px;font-size:.8rem;color:var(--mut)}
.dab .game-status-dot{width:8px;height:8px;border-radius:50%;background:#94a3b8;display:inline-block;flex:none}
.dab-card{background:#fff;border:1px solid var(--hair);border-radius:18px;padding:14px;display:flex;flex-direction:column;gap:12px}
.dab-hud{display:flex;align-items:center;gap:8px;flex-wrap:wrap;font-size:.78rem;color:var(--mut)}
.dab-chip{display:inline-flex;align-items:center;gap:6px;border:1px solid var(--hair);border-radius:999px;padding:3px 10px;background:#fff}
.dab-chip b{color:var(--ink);font-variant-numeric:tabular-nums}
.dab-cdot{width:8px;height:8px;border-radius:50%;flex:none}
.dab-stage{position:relative}
.dab-svg{display:block;width:100%;height:auto;max-width:430px;margin:0 auto;touch-action:manipulation;user-select:none;-webkit-user-select:none}
.dab-hit{cursor:pointer}
.dab-pulse{animation:dab-pulse 1s ease-in-out infinite}
@keyframes dab-pulse{50%{opacity:.25}}
.dab-ov{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(255,255,255,.85);backdrop-filter:blur(3px);border-radius:14px;z-index:5}
.dab-ov[hidden]{display:none}
.dab-modal{width:min(320px,92%);background:#fff;border:1px solid var(--hair);border-radius:16px;padding:18px;display:flex;flex-direction:column;gap:10px;box-shadow:0 12px 32px rgba(15,23,42,.08)}
.dab-modal h3{margin:0;font-size:1rem;font-weight:650}
.dab-modal p{margin:0;font-size:.85rem;color:var(--mut)}
.dab-btn{appearance:none;border:1px solid var(--hair);background:#fff;color:var(--ink);border-radius:10px;padding:8px 12px;font:inherit;font-size:.82rem;font-weight:550;cursor:pointer;transition:background .12s,border-color .12s}
.dab-btn:hover:not(:disabled){background:#f8fafc;border-color:#cbd5e1}
.dab-btn:disabled{opacity:.45;cursor:default}
.dab-btn.primary{background:var(--ink);border-color:var(--ink);color:#fff}
.dab-btn.primary:hover:not(:disabled){background:#1e293b}
.dab-btn[aria-pressed="true"]{background:#eef2ff;border-color:#c7d2fe;color:#4338ca}
.dab-cheats{display:flex;flex-direction:column;gap:6px}
.dab-cheats .dab-btn{text-align:left;display:flex;justify-content:space-between;align-items:center;gap:8px}
.dab-cheats .dab-btn span{color:var(--mut);font-size:.72rem}
.dab-pad{display:none;grid-template-columns:repeat(3,52px);grid-template-rows:repeat(3,44px);gap:6px;justify-content:center}
.dab-pad .dab-btn{padding:0;font-size:1rem;border-radius:12px}
@media (hover:none) and (pointer:coarse){.dab-pad{display:grid}}
.dab .game-actions{display:flex;gap:8px;flex-wrap:wrap}
</style>
<div class="game-app dab">
  <div class="game-intro">
    <div><h2>Dots and Boxes</h2></div>
    <span class="game-status"><i class="game-status-dot" data-status-dot></i><span data-status aria-live="polite">Ready</span></span>
  </div>
  <section class="game-panel">
    <div class="dab-card">
      <div class="dab-hud">
        <span class="dab-chip"><i class="dab-cdot" data-you-dot></i>You <b data-you>0</b></span>
        <span class="dab-chip"><i class="dab-cdot" data-opp-dot></i><span data-opp-name>Bot</span> <b data-opp>0</b></span>
        <span class="dab-chip">Left <b data-left>16</b></span>
      </div>
      <div class="dab-stage">
        <svg class="dab-svg" viewBox="0 0 360 360" role="img" aria-label="Dots and Boxes board">
          <g>${parts.boxes}</g><g>${parts.counts}</g><g>${parts.guides}</g><g>${parts.lines}</g>
          <line data-cursor stroke="#6366f1" stroke-width="6" stroke-linecap="round" stroke-dasharray="1 11" opacity="0"/>
          <g>${parts.dots}</g><g>${parts.hits}</g>
        </svg>
        <div class="dab-ov" data-result hidden>
          <div class="dab-modal">
            <h3 data-result-title>Draw</h3>
            <p data-result-score>0 – 0</p>
            <button class="dab-btn primary" type="button" data-restart>Play again</button>
          </div>
        </div>
        <div class="dab-ov" data-cheat-ov hidden>
          <div class="dab-modal">
            <h3>Cheats</h3>
            <div class="dab-cheats">
              <button class="dab-btn" type="button" data-cheat="hint">Best move <span>H</span></button>
              <button class="dab-btn" type="button" data-cheat="claim">Auto-claim boxes</button>
              <button class="dab-btn" type="button" data-cheat="undo">Undo move <span>U</span></button>
              <button class="dab-btn" type="button" data-cheat="skip">Skip bot turn</button>
              <button class="dab-btn" type="button" data-cheat="dumb" aria-pressed="false">Random bot</button>
              <button class="dab-btn" type="button" data-cheat="counts" aria-pressed="false">Show side counts</button>
            </div>
            <button class="dab-btn" type="button" data-cheat-close>Close</button>
          </div>
        </div>
      </div>
      <div class="dab-pad" aria-label="Touch controls">
        <button class="dab-btn" type="button" data-pad="up" style="grid-column:2;grid-row:1" aria-label="Up">↑</button>
        <button class="dab-btn" type="button" data-pad="left" style="grid-column:1;grid-row:2" aria-label="Left">←</button>
        <button class="dab-btn" type="button" data-pad="ok" style="grid-column:2;grid-row:2" aria-label="Draw line">OK</button>
        <button class="dab-btn" type="button" data-pad="right" style="grid-column:3;grid-row:2" aria-label="Right">→</button>
        <button class="dab-btn" type="button" data-pad="down" style="grid-column:2;grid-row:3" aria-label="Down">↓</button>
      </div>
    </div>
  </section>
  <div class="game-actions">
    <button class="game-action-button" type="button" data-restart>Restart</button>
    <button class="game-action-button" type="button" data-cheats>Cheats</button>
    <button class="game-action-button" type="button" data-exit>Exit game</button>
  </div>
</div>`;

    /* ---------- refs ---------- */
    const $ = (s) => root.querySelector(s);
    const lineEls = {}, hitEls = {};
    root.querySelectorAll("[data-line]").forEach((el) => (lineEls[el.getAttribute("data-line")] = el));
    root.querySelectorAll("[data-hit]").forEach((el) => (hitEls[el.getAttribute("data-hit")] = el));
    const boxEls = [...root.querySelectorAll("[data-box]")];
    const countEls = [...root.querySelectorAll("[data-count]")];
    const cursorEl = $("[data-cursor]");
    const statusEl = $("[data-status]"), statusDot = $("[data-status-dot]");
    const hudYou = $("[data-you]"), hudOpp = $("[data-opp]"), hudLeft = $("[data-left]");
    const youDot = $("[data-you-dot]"), oppDot = $("[data-opp-dot]"), oppName = $("[data-opp-name]");
    const resultOv = $("[data-result]"), resultTitle = $("[data-result-title]"), resultScore = $("[data-result-score]");
    const cheatOv = $("[data-cheat-ov]"), padOk = $('[data-pad="ok"]');
    const cheatBtns = {};
    ["hint", "claim", "undo", "skip", "dumb", "counts"].forEach((id) => (cheatBtns[id] = $(`[data-cheat="${id}"]`)));
    $("[data-cheats]").style.display = online ? "none" : ""; // cheats: AI mode only

    /* ---------- core rules ---------- */
    function playEdge(k, seat) {
        if (!state || state.over || state.turn !== seat || state.edges[k]) return false;
        state.edges[k] = seat;
        let gained = 0;
        for (const [r, c] of adjBoxes(k)) {
            const i = r * NB + c;
            // Point counts ONLY when all 4 sides of the box are drawn.
            if (!state.boxes[i] && boxEdges(r, c).every((bk) => state.edges[bk])) {
                state.boxes[i] = seat;
                state.scores[seat - 1]++;
                gained++;
            }
        }
        state.claimed += gained;
        state.last = k;
        if (state.claimed === NB * NB) state.over = true;
        else if (!gained) state.turn = 3 - seat; // closing a box keeps the turn
        return true;
    }

    function pickMove(dumb) {
        const free = freeKeys();
        if (!free.length) return null;
        if (dumb) return free[(Math.random() * free.length) | 0];
        let best = null, bg = 0;
        for (const k of free) { const g = gainOf(k); if (g > bg) { bg = g; best = k; } }
        if (best) return best; // take available boxes (double-box first)
        const safe = free.filter((k) => !givesThird(k));
        const pool = safe.length ? safe : free;
        return pool[(Math.random() * pool.length) | 0];
    }

    /* ---------- render ---------- */
    function ensureCursor() {
        if (!state || !state.edges[cursor]) return;
        const free = freeKeys();
        if (!free.length) return;
        const m = mid(cursor);
        let best = free[0], bd = Infinity;
        for (const k of free) { const p = mid(k); const d = (p.x - m.x) ** 2 + (p.y - m.y) ** 2; if (d < bd) { bd = d; best = k; } }
        cursor = best;
    }

    function render() {
        const st = state, me = mySeat(), opp = oppSeat(), mt = myTurn();
        KEYS.forEach((k) => {
            const el = lineEls[k], o = st ? st.edges[k] : 0;
            if (o) { el.setAttribute("stroke", COL[o]); el.setAttribute("opacity", "1"); }
            else if (mt && k === hoverKey) { el.setAttribute("stroke", COL[me]); el.setAttribute("opacity", ".4"); }
            else el.setAttribute("opacity", "0");
            hitEls[k].style.pointerEvents = o ? "none" : "stroke";
            hitEls[k].style.cursor = mt && !o ? "pointer" : "default";
        });
        for (let i = 0; i < NB * NB; i++) {
            const o = st ? st.boxes[i] : 0;
            boxEls[i].setAttribute("fill", o ? COL[o] : "#fff");
            boxEls[i].setAttribute("fill-opacity", o ? ".16" : "0");
            const r = (i / NB) | 0, c = i % NB;
            const n = st && !o ? sideCount(r, c) : 0;
            countEls[i].textContent = String(n);
            countEls[i].setAttribute("opacity", showCounts && st && !o && !st.over ? "1" : "0");
        }
        if (mt && !st.edges[cursor]) {
            const { x1, y1, x2, y2 } = ends(cursor);
            cursorEl.setAttribute("x1", x1); cursorEl.setAttribute("y1", y1);
            cursorEl.setAttribute("x2", x2); cursorEl.setAttribute("y2", y2);
            cursorEl.setAttribute("stroke", COL[me]);
            cursorEl.setAttribute("opacity", ".55");
            cursorEl.classList.toggle("dab-pulse", hintKey === cursor);
        } else cursorEl.setAttribute("opacity", "0");

        const you = st ? st.scores[me - 1] : 0, them = st ? st.scores[opp - 1] : 0;
        hudYou.textContent = you; hudOpp.textContent = them;
        hudLeft.textContent = st ? NB * NB - st.claimed : NB * NB;
        youDot.style.background = COL[me]; oppDot.style.background = COL[opp];
        oppName.textContent = online ? "Rival" : "Bot";

        let msg, pulse = false;
        if (!st) msg = online ? "Waiting for host…" : "Ready";
        else if (st.over) msg = you > them ? "You win" : you < them ? (online ? "Rival wins" : "Bot wins") : "Draw";
        else if (mt) msg = "Your turn";
        else { msg = online ? "Rival's turn" : "Bot thinking…"; pulse = true; }
        if (flashMsg) msg = flashMsg;
        statusEl.textContent = msg;
        statusDot.style.background = st && !st.over ? COL[st.turn] : "#94a3b8";
        statusDot.classList.toggle("dab-pulse", pulse);

        resultOv.hidden = !(st && st.over);
        if (st && st.over) { resultTitle.textContent = msg; resultScore.textContent = `${you} – ${them}`; }
        cheatOv.hidden = !cheatOpen || online;
        cheatBtns.hint.disabled = !mt;
        cheatBtns.claim.disabled = !mt;
        cheatBtns.undo.disabled = !history.length;
        cheatBtns.skip.disabled = !(st && !st.over && st.turn === 2);
        cheatBtns.dumb.setAttribute("aria-pressed", String(dumbBot));
        cheatBtns.counts.setAttribute("aria-pressed", String(showCounts));
        padOk.disabled = !mt;

        scheduleAI();
    }

    function flash(msg) { flashMsg = msg; later(() => { flashMsg = ""; render(); }, 1600); }

    /* ---------- sync (host-authoritative when online) ---------- */
    function publish() {
        ensureCursor();
        render();
        if (online && room.isHost) room.publishState(state).catch(console.warn);
    }

    function newRound() {
        clearTimers();
        history = []; hintKey = null; hoverKey = null;
        state = freshState();
        cursor = KEYS[0];
        const me = mySeat();
        flash(`You play ${NAME[me]} · ${state.turn === me ? "you start" : (online ? "rival" : "bot") + " starts"}`);
        publish();
    }

    function applyAction(action, seat) {
        if (destroyed || !action || !state) return;
        if (action.type === "restart") { newRound(); return; }
        if (action.type !== "edge") return;
        const k = action.key;
        if (typeof k !== "string" || !(k in state.edges)) return;
        if (state.over || state.turn !== seat) return;
        if (playEdge(k, seat)) publish();
    }

    function submitAction(action) {
        if (online && !room.isHost) { room.sendAction(action).catch(console.warn); return; }
        applyAction(action, mySeat());
    }

    /* ---------- bot (AI mode only) ---------- */
    function scheduleAI() {
        if (online || destroyed || aiTimer || !state || state.over || state.turn !== 2) return;
        aiTimer = later(() => { aiTimer = null; aiMove(); }, dumbBot ? 320 : 560);
    }
    function aiMove() {
        if (destroyed || !state || state.over || state.turn !== 2) return;
        const k = pickMove(dumbBot);
        if (!k) { state.over = true; publish(); return; }
        playEdge(k, 2);
        publish(); // render() chains extra turns via scheduleAI()
    }

    /* ---------- cheats (AI mode only) ---------- */
    const pushHistory = () => { history.push(JSON.stringify(state)); if (history.length > 80) history.shift(); };
    function cheat(id) {
        if (online || !state) return;
        if (id === "hint") {
            if (!myTurn()) return;
            const k = pickMove(false);
            if (k) { hintKey = k; cursor = k; flash("Best move highlighted"); }
            render(); return;
        }
        if (id === "claim") {
            if (!myTurn()) return;
            if (!freeKeys().some((f) => gainOf(f) > 0)) { flash("No open boxes"); render(); return; }
            pushHistory();
            const before = state.claimed;
            while (!state.over) {
                const k = freeKeys().find((f) => gainOf(f) > 0);
                if (!k) break;
                playEdge(k, 1);
            }
            flash(`Auto-claimed ${state.claimed - before} box(es)`);
            publish(); return;
        }
        if (id === "undo") {
            if (!history.length) return;
            clearTimers();
            state = JSON.parse(history.pop());
            hintKey = null;
            flash("Move undone");
            publish(); return;
        }
        if (id === "skip") {
            if (state.over || state.turn !== 2) return;
            pushHistory();
            clearTimers();
            state.turn = 1;
            flash("Bot turn skipped");
            publish(); return;
        }
        if (id === "dumb") { dumbBot = !dumbBot; flash(dumbBot ? "Bot: random moves" : "Bot: smart moves"); render(); return; }
        if (id === "counts") { showCounts = !showCounts; render(); return; }
    }

    /* ---------- input: mouse / keyboard / virtual pad ---------- */
    function moveCursor(dir) {
        if (!state) return;
        const vec = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[dir];
        const m = mid(cursor);
        const scan = (pool) => {
            let best = null, bs = Infinity;
            for (const k of pool) {
                if (k === cursor) continue;
                const p = mid(k);
                const ddx = p.x - m.x, ddy = p.y - m.y;
                const along = ddx * vec[0] + ddy * vec[1];
                if (along <= 0) continue;
                const perp = Math.abs(ddx * vec[1] - ddy * vec[0]);
                const score = along + perp * 2.5;
                if (score < bs) { bs = score; best = k; }
            }
            return best;
        };
        const best = scan(freeKeys()) || scan(KEYS); // prefer free edges
        if (best) { cursor = best; hintKey = null; render(); }
    }

    function humanPlay(k) {
        if (!state || !myTurn() || state.edges[k]) return;
        if (!online) pushHistory();
        hintKey = null; hoverKey = null;
        submitAction({ type: "edge", key: k });
    }
    const placeCursor = () => humanPlay(cursor);

    function handleClick(event) {
        const t = event.target;
        if (t.closest("[data-exit]")) { onExit(); return; }
        if (t.closest("[data-restart]")) { submitAction({ type: "restart" }); return; }
        if (t.closest("[data-cheats]")) { if (!online) { cheatOpen = !cheatOpen; render(); } return; }
        if (t.closest("[data-cheat-close]")) { cheatOpen = false; render(); return; }
        const ch = t.closest("[data-cheat]");
        if (ch) { cheat(ch.getAttribute("data-cheat")); return; }
        const pad = t.closest("[data-pad]");
        if (pad) { const d = pad.getAttribute("data-pad"); if (d === "ok") placeCursor(); else moveCursor(d); return; }
        const hit = t.closest("[data-hit]");
        if (hit) { humanPlay(hit.getAttribute("data-hit")); return; }
    }
    function handleOver(e) {
        const h = e.target.closest?.("[data-hit]");
        if (h) { hoverKey = h.getAttribute("data-hit"); render(); }
    }
    function handleOut(e) {
        const h = e.target.closest?.("[data-hit]");
        if (h && hoverKey === h.getAttribute("data-hit")) { hoverKey = null; render(); }
    }
    function handleKey(e) {
        if (destroyed || !root.isConnected || e.ctrlKey || e.metaKey || e.altKey) return;
        const tag = e.target?.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA") return;
        const k = e.key, low = k.toLowerCase();
        if (k === "Escape" || (cheatOpen && low === "c")) { if (cheatOpen) { cheatOpen = false; render(); e.preventDefault(); } return; }
        if (cheatOpen) return;
        const dir = { ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right", w: "up", s: "down", a: "left", d: "right" }[k] ||
            { w: "up", s: "down", a: "left", d: "right" }[low];
        if (dir) { moveCursor(dir); e.preventDefault(); return; }
        if (k === "Enter" || k === " ") { placeCursor(); e.preventDefault(); return; }
        if (low === "r") { submitAction({ type: "restart" }); e.preventDefault(); }
        else if (low === "c" && !online) { cheatOpen = true; render(); e.preventDefault(); }
        else if (low === "h") { cheat("hint"); e.preventDefault(); }
        else if (low === "u") { cheat("undo"); e.preventDefault(); }
    }

    /* ---------- boot ---------- */
    root.addEventListener("click", handleClick);
    root.addEventListener("pointerover", handleOver);
    root.addEventListener("pointerout", handleOut);
    document.addEventListener("keydown", handleKey);

    if (online) {
        room.onRoom((nextRoom) => { if (destroyed) return; roomData = nextRoom; render(); });
        if (room.isHost) {
            newRound(); // host owns canonical state; random swap + starter
            room.onAction((action) => { if (!destroyed) applyAction(action, 3 - hostSeat()); });
        } else {
            room.onState((nextState) => { if (destroyed || !nextState) return; state = normalize(nextState); ensureCursor(); render(); });
            render(); // waiting for host…
        }
    } else {
        newRound(); // random starter vs bot
    }

    return {
        destroy() {
            destroyed = true;
            clearTimers();
            root.removeEventListener("click", handleClick);
            root.removeEventListener("pointerover", handleOver);
            root.removeEventListener("pointerout", handleOut);
            document.removeEventListener("keydown", handleKey);
        },
    };
}