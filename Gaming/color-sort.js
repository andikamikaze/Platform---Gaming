/*
 * color-sort.js — Color Sort (template ES-module)
 * Konversi dari MGP_REGISTER ke META + mount().
 * Setelah menyalin file ini, jalankan: node tools/build-games-manifest.mjs
 */

export const META = {
    id: "color-sort", // harus sama dengan nama file (tanpa .js)
    name: "Color Sort",
    category: "puzzle",
    catLabel: "Puzzle",
    desc: "Minimal ball-sort puzzle. Solo, vs Bot, or duel a friend — every deal is solvable.",
    art: '<svg viewBox="0 0 48 48" width="54" height="54" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 8v26a6 6 0 0 0 12 0V8"/><path d="M8 14h16"/><circle cx="16" cy="26" r="3.2"/><path d="M32 8v26a6 6 0 0 0 12 0V8"/><path d="M30 14h16"/><circle cx="38" cy="30" r="3.2"/></svg>',
    bg: ["#e0e7ff", "#a5b4fc"],
};

/* ================= aturan murni (tanpa DOM) ================= */
const COLORS_N = 5, CAP = 4, EMPTIES = 2, MAX_TUBES = 9;

const top = (t) => t[t.length - 1];
const tubeDone = (t) => t.length === CAP && t.every((v) => v === t[0]);
const isSolved = (ts) => ts.every((t) => t.length === 0 || tubeDone(t));

function canMove(ts, s, d) {
    if (s === d) return false;
    const src = ts[s], dst = ts[d];
    // tube yang sudah lengkap dikunci (aman: 4 bola/color = posisi final di semua solusi)
    if (!src.length || tubeDone(src) || dst.length >= CAP) return false;
    return dst.length === 0 || top(dst) === top(src);
}
function applyMove(ts, s, d) {
    const n = ts.map((t) => t.slice());
    n[d].push(n[s].pop());
    return n;
}
function hasLegalMove(ts) {
    for (let s = 0; s < ts.length; s++)
        for (let d = 0; d < ts.length; d++)
            if (canMove(ts, s, d)) return true;
    return false;
}
// key kanonik: urutan tube tidak penting -> dedup simetri, solver jauh lebih cepat
const keyOf = (ts) => ts.map((t) => t.join(",")).sort().join("|");

/* DFS solver dengan move-ordering; return array [s,d] atau null */
function solve(ts, maxStates = 120000, maxDepth = 160) {
    if (isSolved(ts)) return [];
    const seen = new Set([keyOf(ts)]);
    const path = [];
    let budget = maxStates;
    function dfs(st, depth) {
        if (depth >= maxDepth || budget <= 0) return false;
        const moves = [];
        for (let s = 0; s < st.length; s++) {
            const src = st[s];
            if (!src.length || tubeDone(src)) continue;
            const uniform = src.every((v) => v === src[0]);
            for (let d = 0; d < st.length; d++) {
                if (!canMove(st, s, d)) continue;
                const dst = st[d];
                if (!dst.length && uniform) continue; // pindah run seragam ke tube kosong = sia-sia
                let sc = 0;
                if (dst.length) {
                    if (dst.length === CAP - 1 && dst.every((v) => v === top(src))) sc += 1000;
                    sc += 50 + dst.length * 5;
                } else {
                    sc += src.length > 1 && src[src.length - 2] !== top(src) ? 20 : 2;
                }
                if (src.length === 1) sc += 15;
                moves.push([sc, s, d]);
            }
        }
        moves.sort((a, b) => b[0] - a[0]);
        for (const [, s, d] of moves) {
            const nx = applyMove(st, s, d);
            const k = keyOf(nx);
            if (seen.has(k)) continue;
            seen.add(k);
            budget--;
            path.push([s, d]);
            if (isSolved(nx)) return true;
            if (dfs(nx, depth + 1)) return true;
            path.pop();
        }
        return false;
    }
    return dfs(ts.map((t) => t.slice()), 0) ? path.slice() : null;
}

/* Generator: hanya deal yang LOLOS verifikasi solver yang dipakai */
function generate() {
    for (let attempt = 0; attempt < 300; attempt++) {
        const pool = [];
        for (let c = 0; c < COLORS_N; c++) for (let k = 0; k < CAP; k++) pool.push(c);
        for (let i = pool.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [pool[i], pool[j]] = [pool[j], pool[i]];
        }
        const ts = [];
        for (let t = 0; t < COLORS_N; t++) ts.push(pool.slice(t * CAP, t * CAP + CAP));
        for (let t = 0; t < EMPTIES; t++) ts.push([]);
        if (ts.some(tubeDone)) continue; // hindari tube selesai di awal (poin duel selalu ganjil)
        if (solve(ts)) return ts;
    }
    // fallback yang trivially solvable (prakmustahil terpakai)
    const fb = [];
    for (let t = 0; t < COLORS_N; t++) fb.push([t, t, t, t]);
    fb.push([], []);
    return applyMove(applyMove(fb, 0, COLORS_N), 1, COLORS_N + 1);
}

/* ================= mount ================= */
export function mount(root, context = {}) {
    const { mode = "ai", room = null, playerName = "Player", onExit = () => { } } = context;
    const online = mode === "room" && Boolean(room);
    const playerIndex = online && !room.isHost ? 1 : 0; // 0 = host/lokal, 1 = guest/bot
    let roomData = room?.room || null;
    let state = null;

    let gameMode = online ? "room" : "bot"; // "solo" | "bot" | "room"
    let selected = -1, cursor = -1, bad = -1, hint = null, showCheat = false;
    let destroyed = false;
    let botTimer = null, autoTimer = null, hintTimer = null, badTimer = null;
    const unsubs = [];

    const HUES = ["#f87171", "#60a5fa", "#fbbf24", "#a78bfa", "#2dd4bf"];
    const TW = 34, TH = 132, GAP = 14, X0 = 13, Y0 = 36, BR = 12.5;
    const tubeX = (i) => X0 + i * (TW + GAP);
    const ballY = (j) => Y0 + TH - 16 - j * 27;

    root.innerHTML = `
<style>
.cs-app{--cs-accent:#6366f1;--cs-p0:#0ea5e9;--cs-p1:#f472b6;--cs-line:rgba(148,163,184,.4)}
.cs-app [hidden]{display:none!important}
.cs-app .cs-sub{margin:2px 0 0;font-size:12px;opacity:.6}
.cs-app .cs-panel{position:relative;display:flex;flex-direction:column;gap:10px;padding:12px}
.cs-app .cs-hud{display:flex;flex-wrap:wrap;gap:6px;align-items:center;justify-content:center}
.cs-app .cs-chip{font-size:12px;padding:3px 10px;border:1px solid var(--cs-line);border-radius:999px;display:inline-flex;gap:6px;align-items:center;opacity:.85}
.cs-app .cs-chip b{font-weight:600}
.cs-app .cs-chip.on{opacity:1;border-color:var(--cs-accent)}
.cs-app .cs-dot{width:8px;height:8px;border-radius:50%;display:inline-block}
.cs-app .cs-seg{display:inline-flex;border:1px solid var(--cs-line);border-radius:999px;overflow:hidden}
.cs-app .cs-seg button{font:inherit;font-size:12px;padding:3px 12px;background:none;border:0;color:inherit;cursor:pointer;opacity:.55}
.cs-app .cs-seg button.on{background:rgba(99,102,241,.16);opacity:1}
.cs-app .cs-board{display:flex;justify-content:center}
.cs-app .cs-svg{width:100%;max-width:560px;height:auto;display:block}
.cs-app .cs-tube{fill:rgba(148,163,184,.08);stroke:rgba(148,163,184,.55);stroke-width:2;cursor:pointer;transition:stroke .15s}
.cs-app .cs-tube:hover{stroke:rgba(148,163,184,.95)}
.cs-app .cs-tube.last{stroke:rgba(99,102,241,.5)}
.cs-app .cs-tube.done{stroke:#34d399}
.cs-app .cs-tube.cur{stroke:var(--cs-accent);stroke-dasharray:4 3}
.cs-app .cs-tube.sel{stroke:var(--cs-accent);stroke-width:2.5;stroke-dasharray:none}
.cs-app .cs-tube.hint{stroke:#f59e0b;animation:csPulse 1s ease infinite}
.cs-app .cs-tube.bad{stroke:#f87171;animation:csShake .3s}
.cs-app .cs-ball{stroke:rgba(2,6,23,.25);stroke-width:1;pointer-events:none}
.cs-app .cs-check{fill:#34d399;font-size:11px;text-anchor:middle}
.cs-app .cs-touch{display:none;gap:8px;justify-content:center}
@media (hover:none) and (pointer:coarse){.cs-app .cs-touch{display:flex}}
.cs-app .cs-touch button{min-width:54px;padding:10px 14px;font-size:16px;border-radius:12px;border:1px solid var(--cs-line);background:rgba(148,163,184,.08);color:inherit;cursor:pointer}
.cs-app .cs-touch button:active{background:rgba(99,102,241,.2)}
.cs-app .cs-overlay{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(2,6,23,.35);backdrop-filter:blur(3px);z-index:5;border-radius:inherit}
.cs-app .cs-card{background:Canvas;color:Text;border:1px solid var(--cs-line);border-radius:16px;padding:18px 20px;max-width:320px;width:calc(100% - 40px);display:flex;flex-direction:column;gap:10px;text-align:center}
.cs-app .cs-card h3{margin:0;font-size:18px}
.cs-app .cs-card p{margin:0;font-size:12px;opacity:.65}
.cs-app .cs-row{display:flex;gap:8px;justify-content:center;flex-wrap:wrap}
.cs-app .cs-btn{font:inherit;font-size:13px;padding:7px 14px;border-radius:10px;border:1px solid var(--cs-line);background:none;color:inherit;cursor:pointer}
.cs-app .cs-btn.primary{background:var(--cs-accent);border-color:transparent;color:#fff}
.cs-app .cs-cheatlist{display:flex;flex-direction:column;gap:6px}
@keyframes csShake{0%,100%{transform:translateX(0)}25%{transform:translateX(-3px)}75%{transform:translateX(3px)}}
@keyframes csPulse{0%,100%{stroke-opacity:1}50%{stroke-opacity:.35}}
</style>
<div class="game-app cs-app">
  <div class="game-intro">
    <div><h2>Color Sort</h2><p class="cs-sub" data-sub></p></div>
    <span class="game-status"><i class="game-status-dot"></i><span data-status>Ready</span></span>
  </div>
  <section class="game-panel cs-panel" data-board>
    <div class="cs-hud" data-hud></div>
    <div class="cs-board"><svg class="cs-svg" data-svg aria-label="Color Sort board"></svg></div>
    <div class="cs-touch">
      <button type="button" data-touch="left" aria-label="Previous tube">&#9664;</button>
      <button type="button" data-touch="act" aria-label="Pick or drop ball">&#9679;</button>
      <button type="button" data-touch="right" aria-label="Next tube">&#9654;</button>
      <button type="button" data-touch="undo" aria-label="Undo" data-vundo>&#8617;</button>
    </div>
    <div class="cs-overlay" data-cheatov hidden>
      <div class="cs-card">
        <h3>Cheats</h3>
        <p>Solo only. Using cheats marks the result as assisted.</p>
        <div class="cs-cheatlist">
          <button type="button" class="cs-btn" data-cheat="hint">Hint — highlight best move</button>
          <button type="button" class="cs-btn" data-cheat="step">Auto-step — play best move</button>
          <button type="button" class="cs-btn" data-cheat="solve" data-solvelabel>Auto-solve &#9654;</button>
          <button type="button" class="cs-btn" data-cheat="tube">+1 empty tube (max ${MAX_TUBES})</button>
        </div>
        <div class="cs-row"><button type="button" class="cs-btn primary" data-cheat="close">Close</button></div>
      </div>
    </div>
    <div class="cs-overlay" data-endov hidden>
      <div class="cs-card">
        <h3 data-endtitle></h3>
        <p data-endsub></p>
        <div class="cs-row" data-endbtns></div>
      </div>
    </div>
  </section>
  <div class="game-actions">
    <button class="game-action-button" type="button" data-act="undo" data-undo title="Undo (U)">Undo</button>
    <button class="game-action-button" type="button" data-act="retry" title="Retry this deal (R)">Retry</button>
    <button class="game-action-button" type="button" data-act="new" title="New deal (N)">New deal</button>
    <button class="game-action-button" type="button" data-act="cheat" data-cheatbtn title="Cheats (C)">Cheats</button>
    <button class="game-action-button" type="button" data-exit>Exit game</button>
  </div>
</div>`;

    const $ = (s) => root.querySelector(s);
    const svgEl = $('[data-svg]'), hudEl = $('[data-hud]');
    const subEl = $('[data-sub]'), statusEl = $('[data-status]');
    const endOv = $('[data-endov]'), cheatOv = $('[data-cheatov]');

    /* ---------------- helpers ---------------- */
    const mySeat = () => (state ? state.seatMap[playerIndex] : 0);
    const isSolo = () => state && state.mode === "solo";
    const nameOf = (seat) => {
        if (!state || state.mode === "solo") return "You";
        const n = seat === mySeat() ? (playerName || "You") : (state.mode === "bot" ? "Bot" : "Rival");
        return String(n).slice(0, 14);
    };
    const myTurn = () => state && state.status === "playing" && (state.mode === "solo" || state.turn === mySeat());

    /* ---------------- match lifecycle ---------------- */
    function newMatch(keepDeal) {
        const base = keepDeal && state ? state.initial.map((t) => t.slice()) : generate();
        // random posisi pemain (P1/P2) + random giliran pertama, tiap match
        const seatMap = Math.random() < 0.5 ? [0, 1] : [1, 0];
        const first = Math.floor(Math.random() * 2);
        state = {
            v: 1, mode: gameMode,
            initial: base.map((t) => t.slice()), tubes: base.map((t) => t.slice()),
            moves: 0, history: [], scores: [0, 0],
            seatMap, first, turn: gameMode === "solo" ? 0 : first,
            status: "playing", cheated: false, last: null,
            seq: (state?.seq || 0) + 1,
        };
        selected = -1; hint = null; stopAuto();
        publish();
    }

    /* ---------------- canonical action pipeline ---------------- */
    function applyAction(action, seat) {
        if (!state || destroyed) return;
        const t = action?.type;
        if (t === "new" || t === "retry") { newMatch(t === "retry"); return; }
        if (t === "undo") {
            if (state.mode !== "solo" || !state.history.length || state.status === "solved") return;
            const mv = state.history.pop();
            state.tubes = applyMove(state.tubes, mv.d, mv.s);
            state.moves = Math.max(0, state.moves - 1);
            state.status = "playing"; state.last = null; selected = -1;
            publish(); return;
        }
        if (t === "cheat-tube") {
            if (state.mode !== "solo" || state.tubes.length >= MAX_TUBES) return;
            state.tubes = state.tubes.concat([[]]);
            state.cheated = true; publish(); return;
        }
        if (t === "move") {
            const { s, d } = action;
            if (state.status !== "playing" || seat !== state.turn) return;
            if (!Number.isInteger(s) || !Number.isInteger(d)) return;
            if (s < 0 || d < 0 || s >= state.tubes.length || d >= state.tubes.length) return;
            if (!canMove(state.tubes, s, d)) return;
            state.tubes = applyMove(state.tubes, s, d);
            state.moves++;
            if (state.mode === "solo") state.history.push({ s, d });
            else if (tubeDone(state.tubes[d])) state.scores[seat]++;
            state.last = { s, d };
            state.turn = state.mode === "solo" ? 0 : 1 - seat;
            state.status = isSolved(state.tubes) ? "solved" : (hasLegalMove(state.tubes) ? "playing" : "stuck");
            if (state.status !== "playing") stopAuto();
            publish();
        }
    }

    function submitAction(action) {
        if (online && !room.isHost) { room.sendAction(action).catch(console.warn); return; }
        applyAction(action, mySeat());
    }

    function publish() {
        render();
        if (online && room.isHost) room.publishState(state).catch(console.warn);
        syncBot();
    }

    /* ---------------- bot (mode "bot" saja) ---------------- */
    function botChoose() {
        const sol = solve(state.tubes);
        if (sol && sol.length && Math.random() < 0.85) return sol[0];
        // variasi: pilih move heuristik terbaik (tetap legal)
        let best = null, bestSc = -1;
        for (let s = 0; s < state.tubes.length; s++)
            for (let d = 0; d < state.tubes.length; d++) {
                if (!canMove(state.tubes, s, d)) continue;
                const src = state.tubes[s], dst = state.tubes[d];
                let sc = Math.random() * 8;
                if (dst.length === CAP - 1 && dst.every((v) => v === top(src))) sc += 100;
                else if (dst.length) sc += 10 + dst.length;
                else if (src.every((v) => v === src[0])) sc -= 20;
                if (sc > bestSc) { bestSc = sc; best = [s, d]; }
            }
        return best;
    }
    function syncBot() {
        if (botTimer) { clearTimeout(botTimer); botTimer = null; }
        if (destroyed || online || !state || state.mode !== "bot") return;
        const botSeat = state.seatMap[1];
        if (state.status !== "playing" || state.turn !== botSeat) return;
        const seq = state.seq;
        botTimer = setTimeout(() => {
            botTimer = null;
            if (destroyed || !state || state.seq !== seq || state.status !== "playing") return;
            const mv = botChoose();
            if (mv) applyAction({ type: "move", s: mv[0], d: mv[1] }, botSeat);
        }, 650 + Math.random() * 600);
    }

    /* ---------------- cheats (solo) ---------------- */
    function stopAuto() { if (autoTimer) { clearInterval(autoTimer); autoTimer = null; } }
    function doCheat(kind) {
        if (kind === "close") { showCheat = false; render(); return; }
        if (!isSolo()) return;
        if (kind === "hint") {
            const sol = solve(state.tubes);
            if (sol && sol.length) {
                hint = { s: sol[0][0], d: sol[0][1] };
                if (hintTimer) clearTimeout(hintTimer);
                hintTimer = setTimeout(() => { hint = null; hintTimer = null; render(); }, 2200);
            }
            showCheat = false; render(); return;
        }
        if (kind === "step") {
            const sol = solve(state.tubes);
            if (sol && sol.length) {
                state.cheated = true;
                applyAction({ type: "move", s: sol[0][0], d: sol[0][1] }, 0);
            }
            showCheat = false; render(); return;
        }
        if (kind === "solve") {
            if (autoTimer) { stopAuto(); render(); return; }
            state.cheated = true;
            autoTimer = setInterval(() => {
                if (destroyed || !isSolo() || state.status !== "playing") { stopAuto(); render(); return; }
                const sol = solve(state.tubes);
                if (!sol || !sol.length) { stopAuto(); render(); return; }
                applyAction({ type: "move", s: sol[0][0], d: sol[0][1] }, 0);
            }, 180);
            showCheat = false; render(); return;
        }
        if (kind === "tube") { applyAction({ type: "cheat-tube" }, 0); showCheat = false; render(); }
    }

    /* ---------------- interaksi papan ---------------- */
    function flashBad(i) {
        bad = i; render();
        if (badTimer) clearTimeout(badTimer);
        badTimer = setTimeout(() => { bad = -1; badTimer = null; render(); }, 320);
    }
    function onTube(i) {
        if (!state || state.status !== "playing" || showCheat) return;
        if (!myTurn()) { flashBad(i); return; }
        if (!Number.isInteger(i) || i < 0 || i >= state.tubes.length) return;
        cursor = i;
        if (selected === -1) {
            if (state.tubes[i].length && !tubeDone(state.tubes[i])) { selected = i; render(); }
            else flashBad(i);
            return;
        }
        if (selected === i) { selected = -1; render(); return; }
        if (canMove(state.tubes, selected, i)) {
            const mv = { type: "move", s: selected, d: i };
            selected = -1;
            submitAction(mv);
            if (online && !room.isHost) render(); // guest: tunggu state kanonik dari host
        } else {
            flashBad(i);
            selected = state.tubes[i].length && state.tubes[i].length < CAP && !tubeDone(state.tubes[i]) ? i : -1;
            render();
        }
    }

    /* ---------------- render ---------------- */
    function render() {
        if (destroyed) return;
        if (!state) {
            svgEl.setAttribute("viewBox", "0 0 348 186");
            svgEl.innerHTML = "";
            hudEl.innerHTML = "";
            subEl.textContent = "";
            statusEl.textContent = "Waiting for host…";
            return;
        }
        const ts = state.tubes, n = ts.length;
        const W = X0 * 2 + n * TW + (n - 1) * GAP;
        svgEl.setAttribute("viewBox", "0 0 " + W + " 186");

        let html = "";
        for (let i = 0; i < n; i++) {
            const t = ts[i];
            const cls = ["cs-tube"];
            if (state.last && state.last.d === i) cls.push("last");
            if (tubeDone(t)) cls.push("done");
            if (hint && (hint.s === i || hint.d === i)) cls.push("hint");
            if (i === cursor) cls.push("cur");
            if (i === selected) cls.push("sel");
            if (i === bad) cls.push("bad");
            html += '<rect class="' + cls.join(" ") + '" data-tube="' + i + '" x="' + tubeX(i) +
                '" y="' + Y0 + '" width="' + TW + '" height="' + TH + '" rx="10"/>';
            for (let j = 0; j < t.length; j++) {
                const lift = i === selected && j === t.length - 1 ? 12 : 0;
                html += '<circle class="cs-ball" cx="' + (tubeX(i) + TW / 2) + '" cy="' + (ballY(j) - lift) +
                    '" r="' + BR + '" fill="' + HUES[t[j]] + '"/>';
            }
            if (tubeDone(t)) html += '<text class="cs-check" x="' + (tubeX(i) + TW / 2) + '" y="' + (Y0 - 8) + '">&#10003;</text>';
        }
        svgEl.innerHTML = html;

        // HUD
        const sorted = ts.filter(tubeDone).length;
        let hud = '<span class="cs-chip">Sorted <b>' + sorted + "</b>/" + COLORS_N + "</span>";
        hud += '<span class="cs-chip">Moves <b>' + state.moves + "</b></span>";
        if (state.mode !== "solo") {
            for (let seat = 0; seat < 2; seat++) {
                const on = state.status === "playing" && state.turn === seat;
                hud += '<span class="cs-chip' + (on ? " on" : "") + '"><i class="cs-dot" style="background:var(--cs-p' + seat + ')"></i>' +
                    nameOf(seat) + " <b>" + state.scores[seat] + "</b></span>";
            }
        } else if (!online) {
            hud += '<span class="cs-seg">' +
                '<button type="button" data-mode="solo" class="' + (gameMode === "solo" ? "on" : "") + '">Solo</button>' +
                '<button type="button" data-mode="bot" class="' + (gameMode === "bot" ? "on" : "") + '">Bot</button></span>';
        }
        hudEl.innerHTML = hud;

        // intro & status (tanpa teks tutorial)
        subEl.textContent = state.mode === "solo"
            ? "Solo deal #" + state.seq
            : "vs " + (state.mode === "bot" ? "Bot" : "Rival") + " · " + nameOf(state.first) + " starts";
        statusEl.textContent =
            state.status === "solved" ? "Solved" :
                state.status === "stuck" ? "No moves" :
                    state.mode === "solo" ? "Your move" :
                        state.turn === mySeat() ? "Your turn" :
                            state.mode === "bot" ? "Bot thinking…" : "Rival's turn";

        // tombol kontekstual
        const solo = state.mode === "solo";
        const undoOk = solo && state.history.length > 0 && state.status !== "solved";
        $('[data-undo]').hidden = !solo;
        $('[data-undo]').disabled = !undoOk;
        $('[data-vundo]').hidden = !solo;
        $('[data-vundo]').disabled = !undoOk;
        $('[data-cheatbtn]').hidden = !solo;
        $('[data-solvelabel]').innerHTML = autoTimer ? "Stop auto-solve &#9632;" : "Auto-solve &#9654;";
        cheatOv.hidden = !showCheat || !solo;

        // overlay hasil
        if (state.status === "playing") { endOv.setAttribute("hidden", ""); return; }
        endOv.removeAttribute("hidden");
        const scoreLine = nameOf(0) + " " + state.scores[0] + " — " + state.scores[1] + " " + nameOf(1);
        let title, sub;
        if (state.mode === "solo") {
            title = state.status === "solved" ? "Solved!" : "No moves left";
            sub = state.status === "solved"
                ? state.moves + " moves" + (state.cheated ? " · assisted" : "")
                : "Undo a step or deal again.";
        } else {
            const [a, b] = state.scores;
            title = a === b ? "Draw" : nameOf(a > b ? 0 : 1) + " wins!";
            sub = scoreLine + " · " + state.moves + " moves" + (state.status === "stuck" ? " · board stuck" : "");
        }
        $('[data-endtitle]').textContent = title;
        $('[data-endsub]').textContent = sub;
        $('[data-endbtns]').innerHTML =
            (state.mode === "solo" && state.status === "stuck" && state.history.length
                ? '<button type="button" class="cs-btn" data-act="undo">Undo</button>' : "") +
            '<button type="button" class="cs-btn primary" data-act="new">New deal</button>' +
            '<button type="button" class="cs-btn" data-act="retry">Retry</button>';
    }

    /* ---------------- events: mouse / touch / virtual ---------------- */
    function handleClick(event) {
        const el = event.target;
        if (!el.closest) return;
        if (el.closest("[data-exit]")) { onExit(); return; }
        const tube = el.closest("[data-tube]");
        if (tube) { onTube(Number(tube.dataset.tube)); return; }
        const modeBtn = el.closest("[data-mode]");
        if (modeBtn && !online) {
            const m = modeBtn.dataset.mode;
            if (m !== gameMode) { gameMode = m; newMatch(false); }
            return;
        }
        const cheatBtn = el.closest("[data-cheat]");
        if (cheatBtn) { doCheat(cheatBtn.dataset.cheat); return; }
        const touch = el.closest("[data-touch]");
        if (touch && state) {
            const k = touch.dataset.touch, n = state.tubes.length;
            if (k === "left") { cursor = cursor <= 0 ? n - 1 : cursor - 1; render(); }
            else if (k === "right") { cursor = cursor >= n - 1 ? 0 : cursor + 1; render(); }
            else if (k === "act") { if (cursor < 0) cursor = 0; onTube(cursor); }
            else if (k === "undo") submitAction({ type: "undo" });
            return;
        }
        const act = el.closest("[data-act]");
        if (!act) return;
        const a = act.dataset.act;
        if (a === "new") submitAction({ type: "new" });
        else if (a === "retry") submitAction({ type: "retry" });
        else if (a === "undo") submitAction({ type: "undo" });
        else if (a === "cheat" && isSolo()) { showCheat = !showCheat; render(); }
    }

    /* ---------------- events: keyboard (desktop) ---------------- */
    function handleKey(e) {
        if (destroyed || !root.isConnected || !state) return;
        if (e.metaKey || e.ctrlKey || e.altKey) return;
        const tag = e.target?.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
        const k = e.key;
        if (showCheat) {
            if (k === "Escape" || k === "c" || k === "C") { showCheat = false; render(); e.preventDefault(); }
            return;
        }
        if (k >= "1" && k <= "9") {
            const i = Number(k) - 1;
            if (i < state.tubes.length) { onTube(i); e.preventDefault(); }
            return;
        }
        switch (k) {
            case "ArrowLeft": cursor = cursor <= 0 ? state.tubes.length - 1 : cursor - 1; render(); e.preventDefault(); break;
            case "ArrowRight": cursor = cursor >= state.tubes.length - 1 ? 0 : cursor + 1; render(); e.preventDefault(); break;
            case "Enter": case " ": if (cursor < 0) cursor = 0; onTube(cursor); e.preventDefault(); break;
            case "Escape": selected = -1; cursor = -1; render(); break;
            case "u": case "U": submitAction({ type: "undo" }); break;
            case "n": case "N": submitAction({ type: "new" }); break;
            case "r": case "R": submitAction({ type: "retry" }); break;
            case "c": case "C": if (isSolo()) { showCheat = true; render(); } break;
        }
    }

    root.addEventListener("click", handleClick);
    document.addEventListener("keydown", handleKey);

    /* ---------------- init: online (host-authoritative) / lokal ---------------- */
    if (online) {
        const u1 = room.onRoom((nextRoom) => { roomData = nextRoom; render(); });
        if (typeof u1 === "function") unsubs.push(u1);
        if (room.isHost) {
            newMatch(false); // host: deal + random seatMap + random giliran pertama
            const u2 = room.onAction((action) => applyAction(action, state ? state.seatMap[1] : 1));
            if (typeof u2 === "function") unsubs.push(u2);
        } else {
            render();
            const u3 = room.onState((nextState) => {
                state = nextState; selected = -1; hint = null; render();
            });
            if (typeof u3 === "function") unsubs.push(u3);
        }
    } else {
        newMatch(false); // lokal: mode "bot" (bisa diganti Solo via toggle)
    }

    return {
        destroy() {
            destroyed = true;
            root.removeEventListener("click", handleClick);
            document.removeEventListener("keydown", handleKey);
            if (botTimer) clearTimeout(botTimer);
            if (hintTimer) clearTimeout(hintTimer);
            if (badTimer) clearTimeout(badTimer);
            stopAuto();
            unsubs.forEach((u) => { try { u(); } catch (_) { } });
        },
    };
}