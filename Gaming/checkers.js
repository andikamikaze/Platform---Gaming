/* ==== GAME: checkers.js ==== */

/*
 * American checkers — template-compliant module.
 * META is read by tools/build-games-manifest.mjs (id must match filename).
 * After editing: node tools/build-games-manifest.mjs
 */

import { iconSVG } from "../JS/icons.js";

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
        if ((ctx.n & 255) === 0 && (ctx.now ? ctx.now() : performance.now()) > ctx.deadline) throw ABORT;
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

    function chooseBotMove(b, color, cfg, now = performance.now) {
        const mv = turnMoves(b, color);
        if (!mv.list.length) return null;
        if (mv.list.length === 1) return mv.list[0];
        if (cfg.rand && Math.random() < cfg.rand)
            return mv.list[(Math.random() * mv.list.length) | 0];
        orderMoves(b, mv);
        const ctx = { n: 0, deadline: now() + cfg.ms, now };
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
    let cheatsOpen = false, helpOpen = false, paused = false;
    const cheats = { remove: false, free: false, extra: false };
    let botQueue = [];
    let alive = true;
    const offs = [];

    /* Pause-aware timers: keep Date.now() due anchors and replay only the
       remaining delay on resume so the bot / auto-hop never jump ahead. */
    const timers = new Map();
    let deferredTimers = [];
    let pauseStart = 0, pauseOffset = 0;
    const perfNow = () => performance.now() - pauseOffset;

    function setT(key, fn, ms) {
        clearT(key);
        if (paused) { deferredTimers.push({ key, fn, wait: Math.max(0, ms) }); return; }
        const id = setTimeout(() => {
            timers.delete(key);
            if (alive && !paused) fn();
        }, ms);
        timers.set(key, { id, due: Date.now() + ms, fn });
    }
    function clearT(key) {
        const rec = timers.get(key);
        if (rec) { clearTimeout(rec.id); timers.delete(key); }
        deferredTimers = deferredTimers.filter((t) => t.key !== key);
    }
    function pauseTimers() {
        const now = Date.now();
        for (const [key, rec] of timers) {
            clearTimeout(rec.id);
            deferredTimers.push({ key, fn: rec.fn, wait: Math.max(0, rec.due - now) });
        }
        timers.clear();
    }
    function resumeTimers() {
        const queue = deferredTimers;
        deferredTimers = [];
        for (const t of queue) setT(t.key, t.fn, t.wait);
    }

    let seenHelp = true;
    try { seenHelp = localStorage.getItem("checkersHelpSeen") === "1"; } catch (_) { seenHelp = true; }
    if (!seenHelp) {
        helpOpen = true;
        try { localStorage.setItem("checkersHelpSeen", "1"); } catch (_) { /* storage blocked */ }
    }

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
/* Checkers — single HUD bar, fill-height square board, overlay sheets. */
.ck{--ck-acc:#6366f1;width:100%;height:100%;min-height:0;margin:0 auto;padding:2px;display:flex;flex-direction:column;gap:10px;outline:none;font:14px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
.ck *{box-sizing:border-box}
.ck [hidden]{display:none!important}
.ck :is(button,select,input):focus-visible{outline:2px solid var(--ck-acc);outline-offset:2px}
.ck-hud{display:flex;align-items:center;gap:6px;flex-wrap:wrap;font:600 10.5px/1 ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:.02em}
.ck-chip{display:inline-flex;align-items:center;gap:6px;font-size:11px;padding:5px 9px;min-height:30px;border:1px solid rgba(128,128,128,.32);border-radius:999px;white-space:nowrap}
.ck-chip b{font-variant-numeric:tabular-nums}
.ck-dot{width:9px;height:9px;border-radius:50%;display:inline-block;flex:none}
.ck-dot.r{background:#e05555}
.ck-dot.b{background:#2f333c}
.ck-sep{opacity:.4}
.ck-spacer{flex:1 1 auto;min-width:6px}
.ck-btn,.ck-select{font:inherit;font-size:11px;padding:6px 10px;min-height:32px;border-radius:9px;border:1px solid rgba(128,128,128,.32);background:transparent;color:inherit;cursor:pointer;transition:border-color .15s,color .15s,background .15s}
.ck-btn:hover:not(:disabled),.ck-select:hover{border-color:var(--ck-acc);color:var(--ck-acc)}
.ck-btn:disabled{opacity:.4;cursor:default}
.ck-btn.on{border-color:var(--ck-acc);color:var(--ck-acc)}
.ck-icon-btn{display:inline-flex;align-items:center;gap:5px}
.ck-icon-btn svg{flex:none;display:block}
.ck-btn-label{white-space:nowrap}
.ck.game-fill>.ck-panel{flex:1 1 auto;min-height:0;aspect-ratio:auto;position:relative;display:flex;align-items:center;justify-content:center;min-width:0;padding:0;border:0;border-radius:12px;overflow:hidden}
.ck-board{width:100%;height:100%;display:flex;align-items:center;justify-content:center;min-width:0;touch-action:manipulation}
.ck-board svg{display:block;width:100%;height:100%;border-radius:12px;border:1px solid rgba(128,128,128,.18)}
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
.ck-ov{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(20,20,20,.32);backdrop-filter:blur(3px);border-radius:12px;z-index:5;padding:12px}
.ck-card{background:#fff;color:#1f2430;border-radius:14px;padding:16px 20px;min-width:0;width:min(380px,100%);max-height:100%;overflow:hidden;box-shadow:0 8px 24px rgba(0,0,0,.12);display:flex;flex-direction:column;gap:12px}
.ck-head{display:flex;align-items:center;justify-content:space-between;gap:10px;flex:none}
.ck-head h3{margin:0;font-size:18px;font-weight:600}
.ck-card p{margin:0;font-size:13px;color:#6b7280}
.ck-win{color:#16a34a}
.ck-lose{color:#dc2626}
.ck-stats,.ck-cheats,.ck-help{flex:1 1 auto;min-height:0;overflow:auto}
.ck-cheats{display:flex;flex-direction:column;gap:2px}
.ck-help{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}
.ck-help b{display:block;margin:0 0 5px;font:700 10px/1 ui-monospace,monospace;letter-spacing:.08em;color:#6b7280;text-transform:uppercase}
.ck-help ul{margin:0 0 10px;padding-left:16px;font-size:12px;line-height:1.6}
.ck-kbd{display:inline-block;padding:1px 5px;border:1px solid rgba(128,128,128,.32);border-bottom-width:2px;border-radius:5px;font:600 10px/1.4 ui-monospace,monospace}
.ck-row{display:flex;justify-content:space-between;align-items:center;gap:14px;font-size:13px;min-height:40px;padding:3px 0}
.ck-row input{accent-color:var(--ck-acc);width:18px;height:18px;cursor:pointer}
.ck-foot{display:flex;align-items:center;justify-content:space-between;gap:10px;flex:none;flex-wrap:wrap}
.ck-note{font-size:11px;color:#6b7280}
.ck-primary{background:#4f46e5;color:#fff;border:1px solid #4f46e5;border-radius:9px;padding:9px 14px;min-height:40px;font:inherit;font-size:13px;cursor:pointer}
.ck-primary:hover{background:#4338ca}
@media (prefers-reduced-motion:reduce){.ck *{animation-duration:.01ms!important;animation-iteration-count:1!important;transition-duration:.01ms!important}}
/* --- layout overrides last (beat pointer:coarse 44px defaults) --- */
@media (max-width:640px){
  .ck.game-fill>.ck-panel:not(:has(.ck-ov:not([hidden]))){aspect-ratio:1;flex:0 0 auto}
  .ck.game-fill>.ck-panel:has(.ck-ov:not([hidden])){flex:0 0 auto;min-height:min(70dvh,620px);aspect-ratio:auto}
  .ck{gap:6px}
  .ck .ck-hud{gap:4px}
  .ck .ck-hud .ck-chip{padding:4px 6px;font-size:9px;min-height:0}
  .ck .ck-hud .ck-chip[data-you]{display:none}
  .ck .ck-hud .ck-btn-label,.ck .ck-hud .ck-spacer{display:none}
  .ck .ck-hud .ck-btn,.ck .ck-hud .ck-select{min-height:32px;padding:5px 9px;font-size:9px}
  .ck-ov{padding:8px}
  .ck-card{width:100%;height:100%;max-height:100%;padding:12px}
  .ck-help{grid-template-columns:1fr;gap:8px}
  .ck-stats,.ck-cheats,.ck-help{scrollbar-width:none}
  .ck-stats::-webkit-scrollbar,.ck-cheats::-webkit-scrollbar,.ck-help::-webkit-scrollbar{display:none}
  .ck-foot{padding-top:8px;border-top:1px solid rgba(128,128,128,.2)}
  .ck-note{display:none}
}
@media (pointer:coarse){
  .ck .ck-hud .ck-btn,.ck .ck-hud .ck-select{min-height:32px;padding:5px 9px;font-size:9px}
  .ck .ck-card .ck-primary{min-height:44px}
}
</style>
<div class="game-app ck game-fill" data-ck>
  <div class="ck-hud">
    <span class="ck-chip"><i class="ck-dot r" data-turn-dot></i><b data-turn>Red</b></span>
    <span class="ck-chip" title="Captured pieces"><i class="ck-dot r"></i><b data-capr>0</b><span class="ck-sep">·</span><i class="ck-dot b"></i><b data-capb>0</b></span>
    <span class="ck-chip" data-status>Ready</span>
    <span class="ck-chip" data-you hidden>You: Red</span>
    <span class="ck-spacer"></span>
    <select class="ck-select" data-elo title="Bot strength">
      <option value="800">800 · Beginner</option>
      <option value="1200" selected>1200 · Casual</option>
      <option value="1600">1600 · Club</option>
      <option value="2000">2000 · Expert</option>
      <option value="2400">2400 · Master</option>
    </select>
    <button class="ck-btn" type="button" data-act="mode">vs Bot</button>
    <button class="ck-btn" type="button" data-act="undo" disabled>Undo</button>
    <button class="ck-btn ck-icon-btn" type="button" data-help aria-label="How to play" title="How to play (H)">${iconSVG("helpCircle", { size: 14 })}<span class="ck-btn-label">Help</span></button>
    <button class="ck-btn ck-icon-btn" type="button" data-cheats aria-label="Cheats" title="Cheats (C)" ${online ? "disabled" : ""}>${iconSVG("wrench", { size: 14 })}<span class="ck-btn-label">Cheats</span></button>
    <button class="ck-btn ck-icon-btn" type="button" data-pause aria-label="Pause" title="Pause (P)" ${online ? "disabled" : ""}>${iconSVG("pause", { size: 14 })}<span class="ck-btn-label">Pause</span></button>
    <button class="ck-btn ck-icon-btn" type="button" data-restart aria-label="Restart" title="Restart (R)">${iconSVG("refresh", { size: 14 })}<span class="ck-btn-label">Restart</span></button>
    <button class="ck-btn ck-icon-btn" type="button" data-exit aria-label="Exit game" title="Exit game">${iconSVG("logOut", { size: 14 })}<span class="ck-btn-label">Exit game</span></button>
  </div>
  <section class="game-panel ck-panel" data-board>
    <div class="ck-board">
      <svg viewBox="0 0 528 528" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Checkers board">
        <g>${sqs}</g>
        <g data-g="mk" pointer-events="none"></g>
        <g data-g="pc"></g>
        <g pointer-events="none">${cos}</g>
      </svg>
    </div>
    <div class="ck-ov" data-ov="over" hidden>
      <div class="ck-card">
        <div class="ck-head"><h3 data-ov-ttl>Game over</h3></div>
        <div class="ck-stats"><p data-ov-why></p></div>
        <div class="ck-foot"><span class="ck-note">Press R to restart</span><button class="ck-primary" type="button" data-restart>Play again</button></div>
      </div>
    </div>
    <div class="ck-ov" data-ov="pause" hidden>
      <div class="ck-card">
        <div class="ck-head"><h3>Paused</h3></div>
        <div class="ck-stats"><p>The board, bot and timers are frozen.</p></div>
        <div class="ck-foot"><span class="ck-note">Press P or Esc to resume</span><button class="ck-primary" type="button" data-resume>Resume</button></div>
      </div>
    </div>
    <div class="ck-ov" data-ov="cheat" hidden>
      <div class="ck-card">
        <div class="ck-head"><h3>Cheats</h3><button class="ck-btn" type="button" data-cheat-close aria-label="Close">Close</button></div>
        <div class="ck-cheats">
          <label class="ck-row"><span>Remove enemy piece</span><input type="checkbox" data-cheat="remove"></label>
          <label class="ck-row"><span>Free movement</span><input type="checkbox" data-cheat="free"></label>
          <label class="ck-row"><span>Extra turn</span><input type="checkbox" data-cheat="extra"></label>
          <div class="ck-row"><span>Crown my army</span><button class="ck-btn" type="button" data-act="crown">Apply</button></div>
          <div class="ck-row"><span>Win instantly</span><button class="ck-btn" type="button" data-act="win">Apply</button></div>
        </div>
        <div class="ck-foot"><span class="ck-note">Offline games only</span></div>
      </div>
    </div>
    <div class="ck-ov" data-ov="help" hidden>
      <div class="ck-card">
        <div class="ck-head"><h3>How to play</h3><button class="ck-btn" type="button" data-help-close aria-label="Close">Close</button></div>
        <div class="ck-help">
          <div>
            <b>Desktop</b>
            <ul>
              <li>Click a piece, then a highlighted square to move it.</li>
              <li><span class="ck-kbd">← ↑ → ↓</span> move the cursor, <span class="ck-kbd">Enter</span> select / place.</li>
              <li><span class="ck-kbd">H</span> help · <span class="ck-kbd">C</span> cheats · <span class="ck-kbd">P</span> pause · <span class="ck-kbd">R</span> restart · <span class="ck-kbd">U</span> undo</li>
            </ul>
            <b>Mobile</b>
            <ul>
              <li>Tap a piece then a highlighted destination; multi-jumps continue automatically.</li>
              <li>Use the HUD buttons for Help, Cheats, Pause, Restart and Exit.</li>
            </ul>
          </div>
          <div>
            <b>Rules</b>
            <ul>
              <li>Red moves down, Black moves up; men move diagonally forward.</li>
              <li>Jumps are mandatory: hop an adjacent enemy into the empty square beyond it.</li>
              <li>Reach the far row to crown a King, which moves both directions.</li>
              <li>Win by capturing every enemy piece or leaving the opponent with no legal move.</li>
              <li>Cheats (offline only): remove a piece, free movement, extra turn, crown or instant win.</li>
            </ul>
            <div class="ck-foot"><span class="ck-note">Press H to reopen this guide</span><button class="ck-primary" type="button" data-help-close>Got it</button></div>
          </div>
        </div>
      </div>
    </div>
  </section>
</div>`;

    const $ = (s) => root.querySelector(s);
    const gMk = $('[data-g="mk"]'), gPc = $('[data-g="pc"]');
    const elStatus = $("[data-status]"), elTurn = $("[data-turn]"), elTurnDot = $("[data-turn-dot]");
    const elCapR = $("[data-capr]"), elCapB = $("[data-capb]"), elYou = $("[data-you]");
    const btnMode = $('[data-act="mode"]'), btnUndo = $('[data-act="undo"]');
    const selElo = $("[data-elo]");
    const ov = {
        over: $('[data-ov="over"]'),
        pause: $('[data-ov="pause"]'),
        cheat: $('[data-ov="cheat"]'),
        help: $('[data-ov="help"]'),
    };
    const ovTtl = $("[data-ov-ttl]"), ovWhy = $("[data-ov-why]");
    const cheatPanel = ov.cheat;
    const pauseBtn = $("[data-pause]");

    /* ================= helpers ================= */
    const myColor = () => (state ? state.colors[playerIndex] : RD);
    const isHumanColor = (c) =>
        online ? c === myColor() : submode === "2p" || c === RD;
    const humanTurn = () =>
        Boolean(state) && !state.result && !paused && isHumanColor(state.turn);
    const canBot = () =>
        alive && !paused && Boolean(state) && !state.result && !online &&
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
        for (const rec of timers.values()) clearTimeout(rec.id);
        timers.clear();
        deferredTimers = [];
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
            syncUI();
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
        btnUndo.disabled = !U.length || paused;
        for (const box of cheatPanel.querySelectorAll("[data-cheat]"))
            box.checked = Boolean(cheats[box.dataset.cheat]);

        if (state.result) {
            ovTtl.textContent = resultTitle();
            const w = state.result.winner;
            const good = w !== null && (online ? w === myColor() : submode !== "ai" || w === RD);
            ovTtl.className = w === null ? "" : good ? "ck-win" : "ck-lose";
            ovWhy.textContent = resultWhy();
        }
        syncUI();
    }

    /* Overlays suppress each other: help > cheats > pause > result. HUD
       labels are updated on the label span so the icon is never destroyed. */
    function syncUI() {
        const resultOpen = Boolean(state && state.result);
        ov.over.hidden = !resultOpen || cheatsOpen || helpOpen || paused;
        ov.pause.hidden = !paused || cheatsOpen || helpOpen;
        ov.cheat.hidden = !cheatsOpen || helpOpen;
        ov.help.hidden = !helpOpen;
        const cbtn = root.querySelector("[data-cheats]");
        if (cbtn) cbtn.classList.toggle("on", cheatsOpen || Object.values(cheats).some(Boolean));
        if (pauseBtn) {
            const label = pauseBtn.querySelector(".ck-btn-label");
            if (label) label.textContent = paused ? "Resume" : "Pause";
            pauseBtn.setAttribute("aria-label", paused ? "Resume" : "Pause");
        }
    }

    function toggleHelp(on) {
        helpOpen = typeof on === "boolean" ? on : !helpOpen;
        if (helpOpen) cheatsOpen = false;
        render();
    }

    function togglePause(on) {
        if (online) return;
        const next = typeof on === "boolean" ? on : !paused;
        if (next === paused) return;
        paused = next;
        if (paused) { pauseStart = performance.now(); pauseTimers(); }
        else {
            if (pauseStart) pauseOffset += performance.now() - pauseStart;
            pauseStart = 0;
            resumeTimers();
        }
        render();
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
        clearT("hop");
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
        clearT("hop");
        if (!state || state.result || state.chain < 0 || !isHumanColor(state.turn)) return;
        const ms = movesFor(state).list;
        if (ms.length !== 1) return;
        const m = ms[0];
        setT("hop", () => {
            if (alive && state && !state.result && state.chain === m.f && isHumanColor(state.turn))
                submitAction({ k: "move", f: m.f, t: m.t });
        }, 430);
    }

    /* ---------- bot (offline only) ---------- */
    function scheduleBot() {
        if (!canBot()) return;
        clearT("ai");
        render();
        setT("ai", runBot, 380);
    }
    function runBot() {
        if (!canBot()) return;
        const mv = chooseBotMove(state.b, BK, ELOS[elo] || ELOS[1200], perfNow);
        botQueue = mv ? mv.steps.slice() : [];
        botStep();
    }
    function botStep() {
        if (!alive || !state || state.result) { botQueue = []; return; }
        const s = botQueue.shift();
        if (!s) return;
        performMove(s.f, s.t, BK);
        if (state.chain >= 0 && botQueue.length) {
            setT("step", botStep, 340);
        } else botQueue = [];
    }

    /* ---------- controls ---------- */
    function doRestart() {
        if (paused) togglePause(false);
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
        const t = event.target;
        if (t.closest("[data-exit]")) { onExit(); return; }
        if (t.closest("[data-help]")) { toggleHelp(); root.focus({ preventScroll: true }); return; }
        if (t.closest("[data-help-close]")) { toggleHelp(false); root.focus({ preventScroll: true }); return; }
        if (t.closest("[data-cheats]")) {
            if (!online) { cheatsOpen = !cheatsOpen; if (cheatsOpen) helpOpen = false; render(); }
            root.focus({ preventScroll: true }); return;
        }
        if (t.closest("[data-cheat-close]")) { cheatsOpen = false; render(); root.focus({ preventScroll: true }); return; }
        if (t.closest("[data-pause]")) { togglePause(); root.focus({ preventScroll: true }); return; }
        if (t.closest("[data-resume]")) { togglePause(false); root.focus({ preventScroll: true }); return; }
        if (t.closest("[data-restart]")) { submitAction({ k: "restart" }); root.focus({ preventScroll: true }); return; }
        const act = t.closest("[data-act]");
        if (act) {
            const a = act.dataset.act;
            if (a === "undo" && !online) undo();
            else if (a === "mode" && !online) {
                submode = submode === "ai" ? "2p" : "ai";
                doRestart();
            }
            else if (a === "crown") cheatCrown();
            else if (a === "win") cheatWin();
            root.focus({ preventScroll: true });
            return;
        }
        if (helpOpen || cheatsOpen || paused) return;
        const sq = t.closest("[data-i]");
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
        if (!alive) return;
        const k = e.key;
        const code = e.code || "";
        const tag = (e.target && e.target.tagName) || "";
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
        /* priority: help -> cheats -> pause -> escape -> restart -> game actions */
        if (code === "KeyH" || k === "?") {
            if (!e.repeat) toggleHelp();
            e.preventDefault(); return;
        }
        if (code === "KeyC") {
            if (!e.repeat && !online && !helpOpen) { cheatsOpen = !cheatsOpen; render(); }
            e.preventDefault(); return;
        }
        if (code === "KeyP") {
            if (!e.repeat && !helpOpen && !cheatsOpen) togglePause();
            e.preventDefault(); return;
        }
        if (k === "Escape") {
            if (helpOpen) toggleHelp(false);
            else if (cheatsOpen) { cheatsOpen = false; render(); }
            else if (paused) togglePause(false);
            else if (sel >= 0) { sel = -1; render(); }
            e.preventDefault(); return;
        }
        if (code === "KeyR") {
            if (!e.repeat && !helpOpen && !cheatsOpen) submitAction({ k: "restart" });
            e.preventDefault(); return;
        }
        if (tag === "BUTTON") return; /* keep native Enter/Space on HUD buttons */
        if (helpOpen || cheatsOpen || paused) { e.preventDefault(); return; }
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
        } else if (code === "KeyU") {
            if (!online) undo();
        } else if (code === "KeyN") {
            submitAction({ k: "restart" });
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
                clearT("hop");
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