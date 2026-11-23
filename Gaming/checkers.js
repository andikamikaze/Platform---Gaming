/* ==== GAME: checkers.js ==== */

/*
 * American checkers — template-compliant module.
 * META is read by tools/build-games-manifest.mjs (id must match filename).
 * After editing: node tools/build-games-manifest.mjs
 */

export const META = {
    id: "checkers",
    name: "Checkers",
    category: "board",
    catLabel: "Board",
    desc: "American checkers: forced jumps, multi-jumps, kings. Elo bots or online rooms.",
    art: '<svg viewBox="0 0 48 48" width="54" height="54" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="24" cy="28" r="12"/><circle cx="24" cy="28" r="6.5"/><path d="M16 13l2-7 4 4.5 2-7.5 2 7.5 4-4.5 2 7z"/></svg>',
    bg: ["#fee2e2", "#fecaca"],
};

export function mount(root, context = {}) {
    const { mode = "ai", room = null, playerName = "Player", onExit = () => { } } = context;
    const online = mode === "room" && Boolean(room);
    const playerIndex = online && !room.isHost ? 1 : 0;
    let roomData = room?.room || null;
    let state = null;

    /* ================= engine (pure) ================= */
    const RD = "r", BK = "b", FILES = "abcdefgh";
    const DIRS4 = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
    const DIRS_R = [[-1, -1], [-1, 1]];
    const DIRS_B = [[1, -1], [1, 1]];
    const colOf = (p) => p.toLowerCase();
    const isK = (p) => p === "R" || p === "B";
    const opp = (c) => (c === RD ? BK : RD);
    const dirsFor = (p) => (isK(p) ? DIRS4 : p === "r" ? DIRS_R : DIRS_B);
    const colorName = (c) => (c === RD ? "Red" : "Black");
    const ABORT = {};

    function initState(colors, turn) {
        const b = new Array(64).fill(null);
        for (let r = 0; r < 8; r++)
            for (let c = 0; c < 8; c++) {
                if ((r + c) % 2 !== 1) continue;
                if (r < 3) b[r * 8 + c] = "b";
                else if (r > 4) b[r * 8 + c] = "r";
            }
        return { b, turn, chain: -1, last: null, capR: 0, capB: 0, colors, quiet: 0, result: null };
    }

    function jumpsFor(b, i) {
        const p = b[i];
        if (!p) return [];
        const r = i >> 3, c = i & 7, out = [];
        for (const d of dirsFor(p)) {
            const mr = r + d[0], mc = c + d[1];
            const lr = r + 2 * d[0], lc = c + 2 * d[1];
            if (lr < 0 || lr > 7 || lc < 0 || lc > 7) continue;
            const mid = b[mr * 8 + mc];
            if (mid && colOf(mid) !== colOf(p) && !b[lr * 8 + lc])
                out.push({ f: i, t: lr * 8 + lc, mid: mr * 8 + mc });
        }
        return out;
    }

    function stepsFor(b, i) {
        const p = b[i];
        if (!p) return [];
        const r = i >> 3, c = i & 7, out = [];
        for (const d of dirsFor(p)) {
            const rr = r + d[0], cc = c + d[1];
            if (rr >= 0 && rr < 8 && cc >= 0 && cc < 8 && !b[rr * 8 + cc])
                out.push({ f: i, t: rr * 8 + cc });
        }
        return out;
    }

    /* Single-step legal moves for the side to move (chain-aware, forced jumps). */
    function movesFor(st) {
        if (st.chain >= 0) {
            const js = jumpsFor(st.b, st.chain);
            return { type: "jump", list: js, forced: js.length ? [st.chain] : [] };
        }
        const jumps = [], steps = [], forced = [];
        for (let i = 0; i < 64; i++) {
            const p = st.b[i];
            if (!p || colOf(p) !== st.turn) continue;
            const j = jumpsFor(st.b, i);
            if (j.length) { jumps.push(...j); forced.push(i); }
            else steps.push(...stepsFor(st.b, i));
        }
        return jumps.length
            ? { type: "jump", list: jumps, forced }
            : { type: "step", list: steps, forced: [] };
    }

    function applyJumpB(b, j) {
        const p = b[j.f];
        b[j.f] = null;
        b[j.mid] = null;
        const r = j.t >> 3;
        const crowned = !isK(p) && (p === "r" ? r === 0 : r === 7);
        b[j.t] = crowned ? p.toUpperCase() : p;
        return crowned;
    }

    function applyStepB(b, m) {
        const p = b[m.f];
        b[m.f] = null;
        const r = m.t >> 3;
        const crowned = !isK(p) && (p === "r" ? r === 0 : r === 7);
        b[m.t] = crowned ? p.toUpperCase() : p;
        return crowned;
    }

    /* Full-turn sequences (whole jump chains) — used by the search. */
    function turnMoves(b, color) {
        const out = [];
        let anyJump = false;
        const expand = (bb, i, path) => {
            const js = jumpsFor(bb, i);
            if (!js.length) { if (path.length) out.push({ steps: path }); return; }
            for (const j of js) {
                const b2 = bb.slice();
                const crowned = applyJumpB(b2, j);
                const p2 = path.concat([j]);
                if (crowned) out.push({ steps: p2 });
                else expand(b2, j.t, p2);
            }
        };
        for (let i = 0; i < 64; i++) {
            const p = b[i];
            if (!p || colOf(p) !== color) continue;
            if (jumpsFor(b, i).length) { anyJump = true; expand(b, i, []); }
        }
        if (anyJump) return { type: "jump", list: out };
        const ss = [];
        for (let i = 0; i < 64; i++) {
            const p = b[i];
            if (!p || colOf(p) !== color) continue;
            for (const m of stepsFor(b, i)) ss.push({ steps: [m] });
        }
        return { type: "step", list: ss };
    }

    function applyFull(b, mv) {
        for (const s of mv.steps) {
            if (s.mid !== undefined) b[s.mid] = null;
            applyStepB(b, s);
        }
    }

    function evalBoard(b, color) {
        let s = 0;
        for (let i = 0; i < 64; i++) {
            const p = b[i];
            if (!p) continue;
            const c = colOf(p), r = i >> 3, cc = i & 7;
            let v;
            if (isK(p)) v = 170 + (3.5 - Math.abs(cc - 3.5)) * 2;
            else {
                v = 100 + (c === RD ? 7 - r : r) * 4 + (3.5 - Math.abs(cc - 3.5)) * 3;
                if ((c === RD && r === 7) || (c === BK && r === 0)) v += 6;
                if (cc === 0 || cc === 7) v += 2;
            }
            s += c === color ? v : -v;
        }
        return s;
    }

    function orderMoves(b, mv) {
        const score = (m) => {
            const last = m.steps[m.steps.length - 1];
            const p = b[m.steps[0].f];
            const r = last.t >> 3;
            const crown = !isK(p) && (p === "r" ? r === 0 : r === 7);
            return m.steps.length * 10 + (crown ? 6 : 0);
        };
        mv.list.sort((a, z) => score(z) - score(a));
    }

    function negamax(b, color, depth, alpha, beta, ctx) {
        ctx.n++;
        if ((ctx.n & 255) === 0 && performance.now() > ctx.deadline) throw ABORT;
        const mv = turnMoves(b, color);
        if (!mv.list.length) return -(100000 + depth);
        if (depth <= 0) return evalBoard(b, color);
        orderMoves(b, mv);
        let best = -Infinity;
        for (const m of mv.list) {
            const b2 = b.slice();
            applyFull(b2, m);
            const s = -negamax(b2, opp(color), depth - 1, -beta, -alpha, ctx);
            if (s > best) best = s;
            if (best > alpha) alpha = best;
            if (alpha >= beta) break;
        }
        return best;
    }

    /* Elo presets: search depth + evaluation noise + random-blunder rate + time budget. */
    const ELOS = {
        800: { depth: 1, noise: 150, rand: 0.35, ms: 60 },
        1200: { depth: 2, noise: 70, rand: 0.12, ms: 120 },
        1600: { depth: 4, noise: 25, rand: 0.02, ms: 300 },
        2000: { depth: 6, noise: 8, rand: 0, ms: 600 },
        2400: { depth: 9, noise: 0, rand: 0, ms: 1000 },
    };

    function chooseBotMove(b, color, cfg) {
        const mv = turnMoves(b, color);
        if (!mv.list.length) return null;
        if (mv.list.length === 1) return mv.list[0];
        if (cfg.rand && Math.random() < cfg.rand)
            return mv.list[(Math.random() * mv.list.length) | 0];
        orderMoves(b, mv);
        const ctx = { n: 0, deadline: performance.now() + cfg.ms };
        let pick = mv.list[0];
        for (let d = 1; d <= cfg.depth; d++) {
            try {
                let best = -Infinity, cur = null;
                for (const m of mv.list) {
                    const b2 = b.slice();
                    applyFull(b2, m);
                    let s = -negamax(b2, opp(color), d - 1, -1e9, 1e9, ctx);
                    s += (Math.random() * 2 - 1) * cfg.noise;
                    if (s > best) { best = s; cur = m; }
                }
                if (cur) {
                    pick = cur;
                    mv.list = [pick].concat(mv.list.filter((m) => m !== pick));
                }
            } catch (e) {
                if (e === ABORT) break;
                throw e;
            }
        }
        return pick;
    }

    /* ================= local (non-synced) UI state ================= */
    let submode = "ai";                 /* offline: "ai" | "2p" */
    let elo = 1200;
    let sel = -1, cursor = 40, kb = false;
    let U = [];                         /* undo snapshots, offline only */
    let showCheats = false;
    const cheats = { remove: false, free: false, extra: false };
    let botQueue = [];
    let aiT = 0, stepT = 0, hopT = 0;
    let alive = true;
    const offs = [];

    /* ================= markup (minimalist, no tutorial text) ================= */
    const M = 24, SQ = 60, BD = 480;
    const px = (i) => M + (i & 7) * SQ;
    const py = (i) => M + (i >> 3) * SQ;
    const cx = (i) => px(i) + SQ / 2;
    const cy = (i) => py(i) + SQ / 2;

    let sqs = "", cos = "";
    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            sqs +=
                '<rect x="' + (M + c * SQ) + '" y="' + (M + r * SQ) +
                '" width="' + SQ + '" height="' + SQ +
                '" class="' + ((r + c) % 2 ? "sq-d" : "sq-l") +
                '" data-i="' + (r * 8 + c) + '"/>';
        }
        cos += '<text x="' + (M - 11) + '" y="' + (M + r * SQ + SQ / 2 + 4) +
            '" class="coord">' + (8 - r) + "</text>";
    }
    for (let c = 0; c < 8; c++)
        cos += '<text x="' + (M + c * SQ + SQ / 2) + '" y="' + (M + BD + 17) +
            '" class="coord">' + FILES[c] + "</text>";

    root.innerHTML = `
<style>
.ck{display:flex;flex-direction:column;gap:12px;outline:none}
.ck [hidden]{display:none!important}
.ck-bar{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
.ck-flex{flex:1}
.ck-chip{display:inline-flex;align-items:center;gap:6px;font-size:12px;padding:4px 10px;border:1px solid rgba(128,128,128,.32);border-radius:999px;white-space:nowrap}
.ck-dot{width:9px;height:9px;border-radius:50%;display:inline-block;flex:none}
.ck-dot.r{background:#e05555}.ck-dot.b{background:#2f333c}
.ck-sep{opacity:.4}
.ck-btn,.ck-select{font:inherit;font-size:12.5px;padding:5px 12px;border-radius:8px;border:1px solid rgba(128,128,128,.32);background:transparent;color:inherit;cursor:pointer}
.ck-btn:hover:not(:disabled),.ck-select:hover{border-color:#6366f1;color:#6366f1}
.ck-btn:disabled{opacity:.4;cursor:default}
.ck-btn.on{border-color:#6366f1;color:#6366f1}
.ck-panel{position:relative;display:flex;justify-content:center}
.ck-board{width:min(440px,92vw);touch-action:manipulation}
.ck-board svg{display:block;width:100%;height:auto;border-radius:12px;border:1px solid rgba(128,128,128,.18)}
.ck .sq-l{fill:#f0ece3}
.ck .sq-d{fill:#b3a48e}
.ck .coord{fill:#a3a3a3;font-size:10.5px;font-family:inherit;text-anchor:middle}
.ck .hl-last{fill:#6366f1;opacity:.13}
.ck .hl-sel{fill:#6366f1;opacity:.22;stroke:#6366f1;stroke-width:2}
.ck .hl-dot{fill:#4f46e5;opacity:.5}
.ck .hl-cap{fill:none;stroke:#4f46e5;stroke-width:3;opacity:.8}
.ck .hl-forced{fill:none;stroke:#d97706;stroke-width:2.5;opacity:.9}
.ck .hl-cur{fill:none;stroke:#6366f1;stroke-width:2;stroke-dasharray:5 4}
.ck .hl-x{fill:none;stroke:#dc2626;stroke-width:2.5;stroke-dasharray:4 4;opacity:.9}
.ck .ck-piece{cursor:default}
.ck .ck-piece.can{cursor:pointer}
.ck .ck-piece.can:hover .ck-disc{filter:brightness(1.12)}
.ck-ov{position:absolute;inset:0;display:grid;place-items:center;background:rgba(20,20,20,.32);backdrop-filter:blur(3px);border-radius:12px;z-index:5}
.ck-card{background:#fff;color:#1f2430;border-radius:14px;padding:18px 20px;min-width:230px;max-width:320px;box-shadow:0 10px 30px rgba(0,0,0,.18);display:flex;flex-direction:column;gap:10px}
.ck-card h3{margin:0;font-size:18px;font-weight:600}
.ck-card p{margin:0;font-size:13px;color:#6b7280}
.ck-win{color:#16a34a}.ck-lose{color:#dc2626}
.ck-primary{background:#4f46e5;color:#fff;border:none;border-radius:8px;padding:8px 14px;font:inherit;font-size:13px;cursor:pointer}
.ck-primary:hover{background:#4338ca}
.ck-cheats{position:absolute;top:10px;right:10px;z-index:6;gap:8px}
.ck-cheat-head{display:flex;justify-content:space-between;align-items:center;gap:14px}
.ck-row{display:flex;justify-content:space-between;align-items:center;gap:14px;font-size:13px}
.ck-row input{accent-color:#4f46e5;width:16px;height:16px;cursor:pointer}
</style>
<div class="game-app ck" data-ck>
  <div class="game-intro">
    <div><h2>Checkers</h2></div>
    <span class="game-status"><i class="game-status-dot"></i><span data-status>Ready</span></span>
  </div>
  <div class="ck-bar">
    <span class="ck-chip"><i class="ck-dot r" data-turn-dot></i><b data-turn>Red</b></span>
    <span class="ck-chip" title="Captured pieces"><i class="ck-dot r"></i><b data-capr>0</b><span class="ck-sep">·</span><i class="ck-dot b"></i><b data-capb>0</b></span>
    <span class="ck-chip" data-you hidden>You: Red</span>
    <span class="ck-flex"></span>
    <select class="ck-select" data-elo title="Bot strength">
      <option value="800">800 · Beginner</option>
      <option value="1200" selected>1200 · Casual</option>
      <option value="1600">1600 · Club</option>
      <option value="2000">2000 · Expert</option>
      <option value="2400">2400 · Master</option>
    </select>
    <button class="ck-btn" type="button" data-act="mode">vs Bot</button>
    <button class="ck-btn" type="button" data-act="undo" disabled>Undo</button>
    <button class="ck-btn" type="button" data-act="cheat">Cheats</button>
    <button class="ck-btn" type="button" data-act="new">New</button>
  </div>
  <section class="game-panel ck-panel" data-board>
    <div class="ck-board">
      <svg viewBox="0 0 528 528" role="img" aria-label="Checkers board">
        <g>${sqs}</g>
        <g data-g="mk" pointer-events="none"></g>
        <g data-g="pc"></g>
        <g pointer-events="none">${cos}</g>
      </svg>
    </div>
    <div class="ck-ov" data-ov hidden>
      <div class="ck-card">
        <h3 data-ov-ttl>Game over</h3>
        <p data-ov-why></p>
        <button class="ck-primary" type="button" data-act="new">Play again</button>
      </div>
    </div>
    <div class="ck-card ck-cheats" data-cheats hidden>
      <div class="ck-cheat-head"><b>Cheats</b><button class="ck-btn" type="button" data-act="cheat-close">Close</button></div>
      <label class="ck-row"><span>Remove enemy piece</span><input type="checkbox" data-cheat="remove"></label>
      <label class="ck-row"><span>Free movement</span><input type="checkbox" data-cheat="free"></label>
      <label class="ck-row"><span>Extra turn</span><input type="checkbox" data-cheat="extra"></label>
      <div class="ck-row"><span>Crown my army</span><button class="ck-btn" type="button" data-act="crown">Apply</button></div>
      <div class="ck-row"><span>Win instantly</span><button class="ck-btn" type="button" data-act="win">Apply</button></div>
    </div>
  </section>
  <div class="game-actions"><button class="game-action-button" type="button" data-exit>Exit game</button></div>
</div>`;

    const $ = (s) => root.querySelector(s);
    const gMk = $('[data-g="mk"]'), gPc = $('[data-g="pc"]');
    const elStatus = $("[data-status]"), elTurn = $("[data-turn]"), elTurnDot = $("[data-turn-dot]");
    const elCapR = $("[data-capr]"), elCapB = $("[data-capb]"), elYou = $("[data-you]");
    const btnMode = $('[data-act="mode"]'), btnUndo = $('[data-act="undo"]'), btnCheat = $('[data-act="cheat"]');
    const selElo = $("[data-elo]");
    const ov = $("[data-ov]"), ovTtl = $("[data-ov-ttl]"), ovWhy = $("[data-ov-why]");
    const cheatPanel = $("[data-cheats]");

    /* ================= helpers ================= */
    const myColor = () => (state ? state.colors[playerIndex] : RD);
    const isHumanColor = (c) =>
        online ? c === myColor() : submode === "2p" || c === RD;
    const humanTurn = () =>
        Boolean(state) && !state.result && isHumanColor(state.turn);
    const canBot = () =>
        alive && Boolean(state) && !state.result && !online &&
        submode === "ai" && state.turn === BK;

    function freeMoves(st) {
        const list = [];
        for (let i = 0; i < 64; i++) {
            const p = st.b[i];
            if (!p || colOf(p) !== st.turn) continue;
            for (let t = 0; t < 64; t++) {
                if (((t >> 3) + (t & 7)) % 2 !== 1 || st.b[t]) continue;
                if (t !== i) list.push({ f: i, t });
            }
        }
        return { type: "free", list, forced: [] };
    }

    /* Human-facing legal moves (cheat "free movement" applies offline only). */
    function legalNow() {
        if (!state) return { type: "step", list: [], forced: [] };
        if (!online && cheats.free && humanTurn() && state.chain < 0)
            return freeMoves(state);
        return movesFor(state);
    }

    function clearTimers() {
        clearTimeout(aiT); clearTimeout(stepT); clearTimeout(hopT);
        aiT = stepT = hopT = 0;
    }

    function pushSnap() {
        U.push({
            b: state.b.slice(), turn: state.turn, chain: state.chain,
            capR: state.capR, capB: state.capB, last: state.last,
            quiet: state.quiet, colors: state.colors.slice(),
        });
        if (U.length > 240) U.shift();
    }

    /* ================= svg builders ================= */
    function pieceSVG(p, i, can) {
        const red = colOf(p) === RD;
        const fill = red ? "#e05555" : "#2f333c";
        const strk = red ? "#b03e3e" : "#171a20";
        const ring = red ? "#f6c6c2" : "#9aa3b5";
        let g =
            '<g data-i="' + i + '" class="ck-piece' + (can ? " can" : "") +
            '" transform="translate(' + cx(i) + "," + cy(i) + ')">' +
            '<circle class="ck-disc" r="18" fill="' + fill +
            '" stroke="' + strk + '" stroke-width="2"/>';
        g += isK(p)
            ? '<path d="M-8 5 L-8 -2 L-4 1.5 L0 -6 L4 1.5 L8 -2 L8 5 Z" fill="#f2c14e" stroke="#8a5a12" stroke-width="1.2" stroke-linejoin="round"/>'
            : '<circle r="11" fill="none" stroke="' + ring + '" stroke-width="1.5" opacity=".55"/>';
        return g + "</g>";
    }
    const rectMk = (i, cls) =>
        '<rect x="' + px(i) + '" y="' + py(i) + '" width="' + SQ +
        '" height="' + SQ + '" class="' + cls + '"/>';
    const dotMk = (i) =>
        '<circle cx="' + cx(i) + '" cy="' + cy(i) + '" r="8" class="hl-dot"/>';
    const ringC = (i, cls) =>
        '<circle cx="' + cx(i) + '" cy="' + cy(i) + '" r="25" class="' + cls + '"/>';
    const curMk = (i) =>
        '<rect x="' + (px(i) + 3) + '" y="' + (py(i) + 3) + '" width="' + (SQ - 6) +
        '" height="' + (SQ - 6) + '" rx="6" class="hl-cur"/>';

    /* ================= render ================= */
    function resultTitle() {
        const w = state.result.winner;
        if (w === null) return "Draw";
        if (online) return w === myColor() ? "You win" : "You lose";
        if (submode === "ai") return w === RD ? "You win" : "Bot wins";
        return colorName(w) + " wins";
    }
    function resultWhy() {
        const r = state.result.reason;
        return r === "captured" ? "All pieces captured."
            : r === "blocked" ? "No legal moves left."
                : "80 moves without a capture.";
    }
    function statusText() {
        if (!state) return "Waiting for host…";
        if (state.result) return resultTitle();
        if (!online && submode === "ai" && state.turn === BK) return "Bot thinking…";
        if (state.chain >= 0) return "Chain jump";
        if (movesFor(state).type === "jump") return "Forced jump";
        if (online) return state.turn === myColor() ? "Your move" : "Opponent's move";
        return colorName(state.turn) + " to move";
    }

    function render() {
        if (!state) {
            elStatus.textContent = "Waiting for host…";
            gMk.innerHTML = ""; gPc.innerHTML = "";
            btnUndo.disabled = true;
            return;
        }
        const mv = movesFor(state);
        const hv = legalNow();
        const my = humanTurn();
        const removeMode = !online && cheats.remove && my;

        let mk = "";
        if (state.last)
            mk += rectMk(state.last.f, "hl-last") + rectMk(state.last.t, "hl-last");
        for (const i of mv.forced) if (i !== sel) mk += ringC(i, "hl-forced");
        if (sel >= 0) mk += rectMk(sel, "hl-sel");
        if (my && sel >= 0)
            for (const m of hv.list)
                if (m.f === sel)
                    mk += m.mid !== undefined ? ringC(m.t, "hl-cap") : dotMk(m.t);
        if (removeMode)
            for (let i = 0; i < 64; i++) {
                const p = state.b[i];
                if (p && colOf(p) !== state.turn) mk += ringC(i, "hl-x");
            }
        if (kb) mk += curMk(cursor);
        gMk.innerHTML = mk;

        let pc = "";
        for (let i = 0; i < 64; i++) {
            const p = state.b[i];
            if (!p) continue;
            let can = false;
            if (removeMode && colOf(p) !== state.turn) can = true;
            else if (my && colOf(p) === state.turn) {
                if (state.chain >= 0) can = i === state.chain;
                else can = !mv.forced.length || mv.forced.includes(i);
            }
            pc += pieceSVG(p, i, can);
        }
        gPc.innerHTML = pc;

        elTurn.textContent = colorName(state.turn);
        elTurnDot.className = "ck-dot " + (state.turn === RD ? "r" : "b");
        elCapR.textContent = String(state.capR);
        elCapB.textContent = String(state.capB);
        elStatus.textContent = statusText();

        elYou.hidden = !online;
        if (online) elYou.textContent = "You: " + colorName(myColor());
        btnMode.hidden = online;
        btnMode.textContent = submode === "ai" ? "vs Bot" : "2 Players";
        selElo.hidden = online || submode !== "ai";
        selElo.value = String(elo);
        btnUndo.hidden = online;
        btnUndo.disabled = !U.length;
        btnCheat.hidden = online;
        btnCheat.classList.toggle("on", showCheats);
        cheatPanel.hidden = online || !showCheats;
        for (const box of cheatPanel.querySelectorAll("[data-cheat]"))
            box.checked = Boolean(cheats[box.dataset.cheat]);

        ov.hidden = !state.result;
        if (state.result) {
            ovTtl.textContent = resultTitle();
            const w = state.result.winner;
            const good = w !== null && (online ? w === myColor() : submode !== "ai" || w === RD);
            ovTtl.className = w === null ? "" : good ? "ck-win" : "ck-lose";
            ovWhy.textContent = resultWhy();
        }
    }

    function publish() {
        render();
        if (online && room.isHost && state)
            room.publishState(state).catch(console.warn);
    }

    /* ================= game flow ================= */
    function finishTurn(mover) {
        state.chain = -1;
        sel = -1;
        let next = opp(mover);
        if (!online && cheats.extra && isHumanColor(mover)) next = mover;
        state.turn = next;
        const mv = movesFor(state);
        if (!mv.list.length) {
            const any = state.b.some((p) => p && colOf(p) === next);
            state.result = { winner: opp(next), reason: any ? "blocked" : "captured" };
        } else if (state.quiet >= 80) {
            state.result = { winner: null, reason: "draw" };
        }
        if (canBot()) scheduleBot();
    }

    function performMove(f, t, color) {
        if (!state || state.result || color !== state.turn) return false;
        const bot = !online && submode === "ai" && color === BK;
        const list = bot ? movesFor(state).list : legalNow().list;
        const m = list.find((x) => x.f === f && x.t === t);
        if (!m) return false;
        clearTimeout(hopT); hopT = 0;
        if (!online && state.chain < 0) pushSnap();

        if (m.mid !== undefined) {
            const crowned = applyJumpB(state.b, m);
            if (color === RD) state.capR++; else state.capB++;
            state.last = { f: m.f, t: m.t };
            state.quiet = 0;
            if (crowned || !jumpsFor(state.b, m.t).length) finishTurn(color);
            else {
                state.chain = m.t;
                if (!bot && isHumanColor(color)) sel = m.t;
            }
        } else {
            const crowned = applyStepB(state.b, m);
            state.last = { f: m.f, t: m.t };
            state.quiet = crowned ? 0 : state.quiet + 1;
            finishTurn(color);
        }
        publish();
        if (state && !state.result && state.chain >= 0 && !bot && isHumanColor(color))
            armAutoHop();
        return true;
    }

    function armAutoHop() {
        clearTimeout(hopT); hopT = 0;
        if (!state || state.result || state.chain < 0 || !isHumanColor(state.turn)) return;
        const ms = movesFor(state).list;
        if (ms.length !== 1) return;
        const m = ms[0];
        hopT = setTimeout(() => {
            hopT = 0;
            if (alive && state && !state.result && state.chain === m.f && isHumanColor(state.turn))
                submitAction({ k: "move", f: m.f, t: m.t });
        }, 430);
    }

    /* ---------- bot (offline only) ---------- */
    function scheduleBot() {
        if (!canBot()) return;
        clearTimeout(aiT);
        render();
        aiT = setTimeout(() => { aiT = 0; runBot(); }, 380);
    }
    function runBot() {
        if (!canBot()) return;
        const mv = chooseBotMove(state.b, BK, ELOS[elo] || ELOS[1200]);
        botQueue = mv ? mv.steps.slice() : [];
        botStep();
    }
    function botStep() {
        if (!alive || !state || state.result) { botQueue = []; return; }
        const s = botQueue.shift();
        if (!s) return;
        performMove(s.f, s.t, BK);
        if (state.chain >= 0 && botQueue.length) {
            clearTimeout(stepT);
            stepT = setTimeout(() => { stepT = 0; botStep(); }, 340);
        } else botQueue = [];
    }

    /* ---------- controls ---------- */
    function doRestart() {
        clearTimers();
        botQueue = [];
        U = [];
        sel = -1;
        /* Random seat colors online; random first turn vs bot offline. */
        const colors = online
            ? (Math.random() < 0.5 ? [RD, BK] : [BK, RD])
            : [RD, BK];
        const turn = !online && submode === "ai"
            ? (Math.random() < 0.5 ? RD : BK)
            : RD;
        state = initState(colors, turn);
        publish();
        if (canBot()) scheduleBot();
    }

    function undo() {
        if (online || !U.length) return;
        clearTimers();
        botQueue = [];
        let s = U.pop();
        if (submode === "ai") while (s.turn !== RD && U.length) s = U.pop();
        state = {
            b: s.b.slice(), turn: s.turn, chain: s.chain,
            capR: s.capR, capB: s.capB, last: s.last,
            quiet: s.quiet, colors: s.colors.slice(), result: null,
        };
        sel = -1;
        publish();
        if (canBot()) scheduleBot();
    }

    /* ---------- cheats (offline only) ---------- */
    function cheatGuard() {
        return !online && state && !state.result && humanTurn();
    }
    function cheatRemove(i) {
        if (!cheatGuard()) return;
        const p = state.b[i];
        if (!p || colOf(p) === state.turn) return;
        pushSnap();
        state.b[i] = null;
        if (colOf(p) === RD) state.capB++; else state.capR++;
        if (!state.b.some((q) => q && colOf(q) === opp(state.turn)))
            state.result = { winner: state.turn, reason: "captured" };
        publish();
    }
    function cheatCrown() {
        if (!cheatGuard()) return;
        pushSnap();
        for (let i = 0; i < 64; i++) {
            const p = state.b[i];
            if (p && colOf(p) === state.turn && !isK(p)) state.b[i] = p.toUpperCase();
        }
        publish();
    }
    function cheatWin() {
        if (!cheatGuard()) return;
        pushSnap();
        const enemy = opp(state.turn);
        for (let i = 0; i < 64; i++) {
            const p = state.b[i];
            if (p && colOf(p) === enemy) {
                state.b[i] = null;
                if (enemy === RD) state.capB++; else state.capR++;
            }
        }
        state.result = { winner: state.turn, reason: "captured" };
        publish();
    }

    /* ================= actions (host-authoritative) ================= */
    function applyAction(action, actor) {
        if (!action || typeof action !== "object") return;
        if (action.k === "restart") { doRestart(); return; }
        if (!state) return;
        if (action.k === "move") {
            const c = state.colors[actor];
            if (!c || state.result || c !== state.turn) return;
            performMove(action.f | 0, action.t | 0, c);
        } else if (action.k === "undo" && !online) {
            undo();
        }
    }

    function submitAction(action) {
        if (online && !room.isHost) {
            room.sendAction(action).catch(console.warn);
            return;
        }
        applyAction(action, playerIndex);
    }

    /* ================= input: mouse / touch / keyboard ================= */
    function onSq(i) {
        if (!state || state.result || !humanTurn()) return;
        if (!online && cheats.remove) {
            const p = state.b[i];
            if (p && colOf(p) !== state.turn) { cheatRemove(i); return; }
        }
        if (sel >= 0) {
            const mv = legalNow().list.find((m) => m.f === sel && m.t === i);
            if (mv) { submitAction({ k: "move", f: sel, t: i }); return; }
        }
        if (state.chain >= 0) {
            if (i === state.chain) { sel = i; render(); }
            return;
        }
        const p = state.b[i];
        if (p && colOf(p) === state.turn) {
            const mv = legalNow();
            if (mv.forced.length && !mv.forced.includes(i)) return;
            sel = sel === i ? -1 : i;
            render();
        } else if (sel >= 0) {
            sel = -1;
            render();
        }
    }

    function handleClick(event) {
        if (event.target.closest("[data-exit]")) { onExit(); return; }
        const act = event.target.closest("[data-act]");
        if (act) {
            const a = act.dataset.act;
            if (a === "new") submitAction({ k: "restart" });
            else if (a === "undo" && !online) undo();
            else if (a === "mode" && !online) {
                submode = submode === "ai" ? "2p" : "ai";
                doRestart();
            }
            else if (a === "cheat" && !online) { showCheats = !showCheats; render(); }
            else if (a === "cheat-close") { showCheats = false; render(); }
            else if (a === "crown") cheatCrown();
            else if (a === "win") cheatWin();
            root.focus({ preventScroll: true });
            return;
        }
        const sq = event.target.closest("[data-i]");
        if (sq) {
            onSq(parseInt(sq.dataset.i, 10));
            root.focus({ preventScroll: true });
        }
    }

    function handleChange(event) {
        const t = event.target;
        if (t === selElo) {
            elo = parseInt(selElo.value, 10) || 1200;
            return;
        }
        if (t.dataset && t.dataset.cheat && !online) {
            cheats[t.dataset.cheat] = t.checked;
            if (t.dataset.cheat === "remove") sel = -1;
            render();
        }
    }

    function handleKey(e) {
        const k = e.key;
        if (k === "Escape") {
            if (showCheats) { showCheats = false; render(); }
            else if (sel >= 0) { sel = -1; render(); }
            return;
        }
        const tag = e.target.tagName;
        if (tag === "SELECT" || tag === "INPUT" || tag === "TEXTAREA" || tag === "BUTTON") return;
        if (k === "ArrowUp" || k === "ArrowDown" || k === "ArrowLeft" || k === "ArrowRight") {
            e.preventDefault();
            kb = true;
            let r = cursor >> 3, c = cursor & 7;
            if (k === "ArrowUp") r = Math.max(0, r - 1);
            else if (k === "ArrowDown") r = Math.min(7, r + 1);
            else if (k === "ArrowLeft") c = Math.max(0, c - 1);
            else c = Math.min(7, c + 1);
            cursor = r * 8 + c;
            render();
        } else if (k === "Enter" || k === " ") {
            e.preventDefault();
            kb = true;
            onSq(cursor);
        } else if (k === "u" || k === "U") {
            if (!online) undo();
        } else if (k === "n" || k === "N") {
            submitAction({ k: "restart" });
        } else if (k === "c" || k === "C") {
            if (!online) { showCheats = !showCheats; render(); }
        }
    }

    root.tabIndex = 0;
    root.addEventListener("click", handleClick);
    root.addEventListener("change", handleChange);
    root.addEventListener("keydown", handleKey);

    /* ================= boot ================= */
    const reg = (u) => { if (typeof u === "function") offs.push(u); };

    if (online) {
        reg(room.onRoom((nextRoom) => { roomData = nextRoom; render(); }));
        if (room.isHost) {
            doRestart(); /* random seat assignment, host publishes */
            reg(room.onAction((action) => applyAction(action, 1)));
        } else {
            render();
            reg(room.onState((nextState) => {
                state = nextState;
                clearTimeout(hopT); hopT = 0;
                if (!state) { render(); return; }
                if (sel >= 0) {
                    const p = state.b[sel];
                    if (!p || colOf(p) !== state.turn) sel = -1;
                }
                if (state.chain >= 0 && humanTurn()) sel = state.chain;
                render();
                armAutoHop();
            }));
        }
    } else {
        doRestart(); /* random first turn when vs bot */
    }
    root.focus({ preventScroll: true });

    return {
        destroy() {
            alive = false;
            clearTimers();
            botQueue = [];
            root.removeEventListener("click", handleClick);
            root.removeEventListener("change", handleChange);
            root.removeEventListener("keydown", handleKey);
            for (const off of offs) { try { off(); } catch (_) { } }
        },
    };
}