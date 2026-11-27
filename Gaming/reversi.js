/* ==== GAME: reversi.js ==== */

/* =============================================================
REVERSI (OTHELLO) — ESM / mount() template
8x8 green-felt board, black (you) vs white (AI). Standard
8-direction flips, legal-move rings, auto pass, game ends
when neither side can move. AI = greedy weight matrix (corners
best, X-squares worst) + flips, 600ms think delay; Easy =
random legal move. Inline SVG, CSS flip animation. No canvas,
no emoji, no external assets.

Layout: single HUD bar + fill-height board + internal help,
cheat, pause and result overlays. Engine rules unchanged.
============================================================= */

import { iconSVG } from "../JS/icons.js";

export const META = {
    id: "reversi",
    name: "Reversi",
    category: "board",
    catLabel: "Board",
    desc: "Flip AI discs by trapping them between yours. Most discs wins.",
    art: '<svg viewBox="0 0 48 48" width="54" height="54" aria-hidden="true"><rect x="5" y="5" width="38" height="38" rx="6" fill="#2f7d4f"/><circle cx="17" cy="17" r="6.5" fill="#f4f6fb"/><circle cx="31" cy="17" r="6.5" fill="#0d1526"/><circle cx="17" cy="31" r="6.5" fill="#0d1526"/><circle cx="31" cy="31" r="6.5" fill="#f4f6fb"/></svg>',
    bg: ["#bbf7d0", "#4ade80"],
};

export function mount(root, context = {}) {
    const { onExit = () => { } } = context;
    const $ = (s, r) => (r || root).querySelector(s);
    const NS = "http://www.w3.org/2000/svg";
    const mk = (tag, attrs, parent) => {
        const el = document.createElementNS(NS, tag);
        for (const k in attrs) el.setAttribute(k, attrs[k]);
        if (parent) parent.appendChild(el);
        return el;
    };
    const icon = (name) => iconSVG(name, { size: 14 });

    /* ---------- first-run internal help ---------- */
    const HELP_KEY = "reversiHelpSeen";
    let seenHelp = true;
    try { seenHelp = localStorage.getItem(HELP_KEY) === "1"; } catch (_) { seenHelp = true; }
    let helpOpen = !seenHelp;
    if (!seenHelp) {
        try { localStorage.setItem(HELP_KEY, "1"); } catch (_) { /* storage blocked */ }
    }

    /* ---------- markup ---------- */
    root.innerHTML = `
<style>
/* Reversi — emerald board and black/white discs preserved; single HUD + fill board. */
.rv{--rv-acc:#34d399;width:100%;height:100%;min-height:0;margin:0 auto;padding:2px;display:flex;flex-direction:column;gap:10px;outline:none;font:14px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:#e5e7eb}
.rv *{box-sizing:border-box}
.rv [hidden]{display:none!important}
.rv :is(button,input):focus-visible{outline:2px solid var(--rv-acc);outline-offset:2px}
.rv-hud{display:flex;align-items:center;gap:6px;flex-wrap:wrap;font:600 10.5px/1 ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:.02em}
.rv-chip{display:inline-flex;align-items:center;gap:6px;padding:5px 9px;min-height:30px;border:1px solid rgba(255,255,255,.16);border-radius:999px;white-space:nowrap;background:rgba(255,255,255,.04)}
.rv-chip b{font-variant-numeric:tabular-nums;color:#f4f6fb}
.rv-spacer{flex:1 1 auto;min-width:6px}
.rv-btn,.rv-select{font:inherit;font-size:11px;padding:6px 10px;min-height:32px;border-radius:9px;border:1px solid rgba(255,255,255,.18);background:transparent;color:inherit;cursor:pointer;transition:border-color .15s,color .15s,background .15s}
.rv-btn:hover:not(:disabled){border-color:var(--rv-acc);color:var(--rv-acc)}
.rv-btn:disabled{opacity:.4;cursor:default}
.rv-btn.on{border-color:var(--rv-acc);color:var(--rv-acc)}
.rv-icon-btn{display:inline-flex;align-items:center;gap:5px}
.rv-icon-btn svg{flex:none;display:block}
.rv-btn-label{white-space:nowrap}
.rv.game-fill>.rv-panel{flex:1 1 auto;min-height:0;aspect-ratio:auto;position:relative;display:flex;align-items:center;justify-content:center;min-width:0;padding:0;border:0;border-radius:12px;overflow:hidden;background:radial-gradient(circle at 50% 40%,rgba(52,211,153,.10),rgba(8,16,30,.36))}
.rv-wrap{width:100%;height:100%;display:flex;align-items:center;justify-content:center;min-width:0;min-height:0;position:relative}
.rv-svg{display:block;width:100%;height:100%;max-width:520px;max-height:520px;aspect-ratio:1/1;touch-action:manipulation;user-select:none;-webkit-user-select:none}
.rv-cell{cursor:default}
.rv-cell.rv-play{cursor:pointer}
.rv-cell.rv-play:hover{fill:#49a873}
.rv-cell:focus-visible{outline:2px solid #34d399;outline-offset:1px}
.rv-ring{fill:none;stroke:rgba(255,255,255,.55);stroke-width:2.5}
.rv-hint{fill:#fbbf24;stroke:#0b1020;stroke-width:1.5}
.rv-cursor{fill:none;stroke:#34d399;stroke-width:3}
.rv-b{fill:#0d1526;stroke:#33415e;stroke-width:2}
.rv-w{fill:#f4f6fb;stroke:#b9c2d4;stroke-width:2}
.rv-disc{transform-box:fill-box;transform-origin:center;pointer-events:none}
.rv-pop{animation:rv-grow .2s ease-out}
@keyframes rv-grow{from{transform:scale(.2)}to{transform:scale(1)}}
.rv-flip{animation:rv-flip .28s ease-in-out}
@keyframes rv-flip{0%{transform:scaleX(1)}50%{transform:scaleX(.06)}100%{transform:scaleX(1)}}
.rv-marker{fill:#34d399;stroke:#0b1020;stroke-width:1.5;pointer-events:none}
.rv-toast{position:absolute;top:12px;left:50%;transform:translateX(-50%);background:rgba(17,24,49,.94);border:1px solid rgba(255,255,255,.16);color:#e5e7eb;padding:6px 16px;border-radius:999px;font-size:12.5px;font-weight:600;opacity:0;transition:opacity .2s;z-index:4;pointer-events:none;white-space:normal;text-align:center;max-width:calc(100% - 16px)}
.rv-toast.rv-on{opacity:1}
.rv-think{animation:rv-blink 1.1s infinite}
@keyframes rv-blink{50%{opacity:.4}}
.rv-ov{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(12,20,34,.5);backdrop-filter:blur(3px);border-radius:12px;z-index:5;padding:12px}
.rv-card{background:#111a2c;color:#e5e7eb;border:1px solid rgba(255,255,255,.12);border-radius:14px;padding:16px 20px;min-width:0;width:min(460px,100%);max-height:100%;overflow:hidden;box-shadow:0 8px 32px rgba(0,0,0,.35);display:flex;flex-direction:column;gap:12px}
.rv-head{display:flex;align-items:center;justify-content:space-between;gap:10px;flex:none}
.rv-head h3{margin:0;font-size:18px;font-weight:600;color:#f4f6fb}
.rv-card p{margin:0;font-size:13px;color:#b6c2d4}
.rv-win{color:#34d399}
.rv-lose{color:#f87171}
.rv-stats,.rv-cheats,.rv-help{flex:1 1 auto;min-height:0;overflow:auto}
.rv-cheats{display:flex;flex-direction:column;gap:2px}
.rv-help{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}
.rv-help b{display:block;margin:0 0 5px;font:700 10px/1 ui-monospace,monospace;letter-spacing:.08em;color:#94a3b8;text-transform:uppercase}
.rv-help ul{margin:0 0 10px;padding-left:16px;font-size:12px;line-height:1.6;color:#cbd5e1}
.rv-kbd{display:inline-block;padding:1px 5px;border:1px solid rgba(255,255,255,.2);border-bottom-width:2px;border-radius:5px;font:600 10px/1.4 ui-monospace,monospace}
.rv-row{display:flex;justify-content:space-between;align-items:center;gap:14px;font-size:13px;min-height:40px;padding:3px 0;color:#cbd5e1}
.rv-row input{accent-color:var(--rv-acc);width:18px;height:18px;cursor:pointer}
.rv-foot{display:flex;align-items:center;justify-content:space-between;gap:10px;flex:none;flex-wrap:wrap}
.rv-note{font-size:11px;color:#94a3b8}
.rv-primary{background:#059669;color:#fff;border:1px solid #059669;border-radius:9px;padding:9px 14px;min-height:40px;font:inherit;font-size:13px;cursor:pointer}
.rv-primary:hover{background:#047857}
@media (prefers-reduced-motion:reduce){.rv *{animation-duration:.01ms!important;animation-iteration-count:1!important;transition-duration:.01ms!important}}
/* --- layout overrides last (beat pointer:coarse 44px defaults) --- */
@media (max-width:640px){
  .rv.game-fill>.rv-panel:not(:has(.rv-ov:not([hidden]))){aspect-ratio:1;flex:0 0 auto}
  .rv.game-fill>.rv-panel:has(.rv-ov:not([hidden])){flex:0 0 auto;min-height:min(70dvh,620px);aspect-ratio:auto}
  .rv{gap:6px}
  .rv .rv-hud{gap:4px}
  .rv .rv-hud .rv-chip{padding:4px 6px;font-size:9px;min-height:0}
  .rv .rv-hud .rv-btn{min-height:32px;padding:5px 9px;font-size:9px}
  .rv .rv-hud .rv-btn-label,.rv .rv-hud .rv-spacer{display:none}
  .rv-ov{padding:8px}
  .rv-card{width:100%;height:100%;max-height:100%;padding:12px}
  .rv-help{grid-template-columns:1fr;gap:8px}
  .rv-stats,.rv-cheats,.rv-help{scrollbar-width:none}
  .rv-stats::-webkit-scrollbar,.rv-cheats::-webkit-scrollbar,.rv-help::-webkit-scrollbar{display:none}
  .rv-foot{padding-top:8px;border-top:1px solid rgba(255,255,255,.14)}
  .rv-note{display:none}
}
@media (pointer:coarse){
  .rv .rv-hud .rv-btn,.rv .rv-hud .rv-select{min-height:32px;padding:5px 9px;font-size:9px}
  .rv .rv-card .rv-primary{min-height:44px}
}
</style>
<div class="game-app rv game-fill" data-rv>
  <div class="rv-hud">
    <span class="rv-chip">YOU <b data-hud="you">2</b></span>
    <span class="rv-chip">AI <b data-hud="ai">2</b></span>
    <span class="rv-chip">TURN <b data-hud="turn">Your turn</b></span>
    <button class="rv-btn" type="button" data-act="diff" title="Toggle AI difficulty">AI: <span data-diff-label>Greedy</span></button>
    <span class="rv-spacer"></span>
    <button class="rv-btn rv-icon-btn" type="button" data-help aria-label="How to play" title="How to play (H)">${icon("helpCircle")}<span class="rv-btn-label">Help</span></button>
    <button class="rv-btn rv-icon-btn" type="button" data-cheats aria-label="Cheats" title="Cheats (C)">${icon("wrench")}<span class="rv-btn-label">Cheats</span></button>
    <button class="rv-btn rv-icon-btn" type="button" data-pause aria-label="Pause" title="Pause (P)">${icon("pause")}<span class="rv-btn-label">Pause</span></button>
    <button class="rv-btn rv-icon-btn" type="button" data-restart aria-label="Restart" title="Restart (R)">${icon("refresh")}<span class="rv-btn-label">Restart</span></button>
    <button class="rv-btn rv-icon-btn" type="button" data-exit aria-label="Exit game" title="Exit game">${icon("logOut")}<span class="rv-btn-label">Exit game</span></button>
  </div>
  <section class="game-panel rv-panel" data-board>
    <div class="rv-wrap">
      <svg class="rv-svg" viewBox="0 0 464 464" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Reversi board">
        <rect x="4" y="4" width="456" height="456" rx="10" fill="none" stroke="#17472f" stroke-width="5"/>
        <g class="rv-cells"></g>
        <g class="rv-rings"></g>
        <g class="rv-hints" pointer-events="none"></g>
        <g class="rv-discs"></g>
        <rect class="rv-cursor" width="56" height="56" pointer-events="none" hidden/>
        <circle class="rv-marker" r="5" pointer-events="none" style="display:none"/>
      </svg>
      <div class="rv-toast"></div>
    </div>
    <div class="rv-ov" data-ov="over" hidden>
      <div class="rv-card">
        <div class="rv-head"><h3 data-ov="title">Game over</h3></div>
        <div class="rv-stats"><p data-ov="reason"></p></div>
        <div class="rv-foot"><span class="rv-note">Press R to play again</span><button class="rv-btn rv-primary" type="button" data-restart>Play again</button></div>
      </div>
    </div>
    <div class="rv-ov" data-ov="pause" hidden>
      <div class="rv-card">
        <div class="rv-head"><h3>Paused</h3></div>
        <div class="rv-stats"><p>The board, AI moves and timers are frozen.</p></div>
        <div class="rv-foot"><span class="rv-note">Press P or Esc to resume</span><button class="rv-btn rv-primary" type="button" data-resume>Resume</button></div>
      </div>
    </div>
    <div class="rv-ov" data-ov="cheat" hidden>
      <div class="rv-card">
        <div class="rv-head"><h3>Cheats</h3><button class="rv-btn" type="button" data-cheat-close aria-label="Close">Close</button></div>
        <div class="rv-cheats">
          <label class="rv-row"><span>Auto-play your moves</span><input type="checkbox" data-cheat="auto"></label>
          <label class="rv-row"><span>Reveal AI's best reply</span><input type="checkbox" data-cheat="hint"></label>
          <div class="rv-row"><span>Flip a random AI disc</span><button class="rv-btn" type="button" data-act="cheat-flip">Apply</button></div>
          <div class="rv-row"><span>Win instantly</span><button class="rv-btn" type="button" data-act="cheat-win">Apply</button></div>
        </div>
        <div class="rv-foot"><span class="rv-note">Press C or Esc to close</span></div>
      </div>
    </div>
    <div class="rv-ov" data-ov="help" hidden>
      <div class="rv-card">
        <div class="rv-head"><h3>How to play</h3><button class="rv-btn" type="button" data-help-close aria-label="Close">Close</button></div>
        <div class="rv-help">
          <div>
            <b>Desktop</b>
            <ul>
              <li>Click any ringed cell to place a black disc.</li>
              <li><span class="rv-kbd">← ↑ → ↓</span> move the cursor, <span class="rv-kbd">Enter</span> place a disc.</li>
              <li><span class="rv-kbd">H</span> help · <span class="rv-kbd">C</span> cheats · <span class="rv-kbd">P</span> pause · <span class="rv-kbd">R</span> restart</li>
            </ul>
            <b>Mobile</b>
            <ul>
              <li>Tap a ringed cell; rings mark every legal move.</li>
              <li>Use the HUD buttons for Help, Cheats, Pause, Restart and Exit.</li>
            </ul>
          </div>
          <div>
            <b>Rules</b>
            <ul>
              <li>You play black and move first; the AI plays white.</li>
              <li>A move flips every AI disc trapped in a straight line between your new disc and another of yours.</li>
              <li>If a side has no legal move its turn passes automatically.</li>
              <li>The game ends when neither side can move; most discs wins. Corners are the strongest squares.</li>
              <li>Cheats: auto-play, reveal the AI reply, flip a disc or win instantly.</li>
            </ul>
            <div class="rv-foot"><span class="rv-note">Press H to reopen this guide</span><button class="rv-btn rv-primary" type="button" data-help-close>Got it</button></div>
          </div>
        </div>
      </div>
    </div>
  </section>
</div>`;

    /* ---------- element refs ---------- */
    const gCells = $(".rv-cells");
    const gRings = $(".rv-rings");
    const gHints = $(".rv-hints");
    const gDiscs = $(".rv-discs");
    const marker = $(".rv-marker");
    const cursorEl = $(".rv-cursor");
    const toastEl = $(".rv-toast");
    const hud = {
        you: $('[data-hud="you"]'),
        ai: $('[data-hud="ai"]'),
        turn: $('[data-hud="turn"]'),
    };
    const ov = {
        over: $('[data-ov="over"]'),
        pause: $('[data-ov="pause"]'),
        cheat: $('[data-ov="cheat"]'),
        help: $('[data-ov="help"]'),
    };
    const ovTitle = $('[data-ov="title"]', ov.over);
    const ovReason = $('[data-ov="reason"]', ov.over);
    const diffBtn = $('[data-act="diff"]');
    const diffLabel = $("[data-diff-label]");
    const pauseBtn = $("[data-pause]");

    const N = 8,
        CELL = 56,
        PAD = 8;
    const cxOf = (c) => PAD + CELL * c + CELL / 2;
    const cyOf = (r) => PAD + CELL * r + CELL / 2;
    const DIRS = [
        [-1, -1],
        [-1, 0],
        [-1, 1],
        [0, -1],
        [0, 1],
        [1, -1],
        [1, 0],
        [1, 1],
    ];
    const WT = [
        [120, -20, 20, 5, 5, 20, -20, 120],
        [-20, -40, -5, -5, -5, -5, -40, -20],
        [20, -5, 15, 3, 3, 15, -5, 20],
        [5, -5, 3, 3, 3, 3, -5, 5],
        [5, -5, 3, 3, 3, 3, -5, 5],
        [20, -5, 15, 3, 3, 15, -5, 20],
        [-20, -40, -5, -5, -5, -5, -40, -20],
        [120, -20, 20, 5, 5, 20, -20, 120],
    ];

    /* ---------- state ---------- */
    let grid,
        discEls,
        cellEls,
        turn,
        over,
        started = true,
        active = true,
        alive = true;
    let diff = "greedy";
    let resultOpen = false;
    let cheatsOpen = false;
    let paused = false;
    let kb = false;
    let cursor = 3 * N + 3;
    const cheats = { auto: false, hint: false };

    /* Pause-aware timers: keep Date.now() due anchors and replay only the
       remaining delay on resume so the AI / flip animations never jump ahead. */
    let timerSeq = 0;
    const timers = new Map();
    let deferred = [];
    let frozen = false;
    let pauseStart = 0, pauseOffset = 0;
    const perfNow = () => performance.now() - pauseOffset;

    function clearLater(key) {
        const rec = timers.get(key);
        if (rec) { clearTimeout(rec.id); timers.delete(key); }
        deferred = deferred.filter((t) => t.key !== key);
    }
    function later(fn, ms, key) {
        if (key !== undefined) clearLater(key);
        const idKey = key === undefined ? ++timerSeq : key;
        if (frozen) { deferred.push({ key: idKey, fn, wait: Math.max(0, ms) }); return idKey; }
        const id = setTimeout(() => {
            timers.delete(idKey);
            if (alive && !frozen) fn();
        }, ms);
        timers.set(idKey, { id, due: Date.now() + ms, fn });
        return idKey;
    }
    function clearTimers() {
        for (const rec of timers.values()) clearTimeout(rec.id);
        timers.clear();
        deferred = [];
    }
    function freezeTimers() {
        if (frozen) return;
        frozen = true;
        pauseStart = performance.now();
        const now = Date.now();
        for (const [key, rec] of timers) {
            clearTimeout(rec.id);
            deferred.push({ key, fn: rec.fn, wait: Math.max(0, rec.due - now) });
        }
        timers.clear();
    }
    function thawTimers() {
        if (!frozen) return;
        if (pauseStart) pauseOffset += performance.now() - pauseStart;
        pauseStart = 0;
        frozen = false;
        const queue = deferred;
        deferred = [];
        for (const t of queue) later(t.fn, t.wait, t.key);
    }

    /* ---------- cells ---------- */
    cellEls = [];
    for (let r = 0; r < N; r++) {
        cellEls.push([]);
        for (let c = 0; c < N; c++) {
            const rc = mk(
                "rect",
                {
                    x: PAD + CELL * c,
                    y: PAD + CELL * r,
                    width: CELL,
                    height: CELL,
                    fill: (r + c) % 2 ? "#357f56" : "#3a8a5f",
                    class: "rv-cell",
                },
                gCells,
            );
            rc.addEventListener("pointerdown", () => humanPlay(r, c));
            cellEls[r].push(rc);
        }
    }

    /* ---------- rules (unchanged engine) ---------- */
    function flipsFor(r, c, p) {
        if (grid[r][c]) return null;
        let all = null;
        for (const d of DIRS) {
            let rr = r + d[0],
                cc = c + d[1];
            const line = [];
            while (
                rr >= 0 &&
                rr < N &&
                cc >= 0 &&
                cc < N &&
                grid[rr][cc] === 3 - p
            ) {
                line.push([rr, cc]);
                rr += d[0];
                cc += d[1];
            }
            if (
                line.length &&
                rr >= 0 &&
                rr < N &&
                cc >= 0 &&
                cc < N &&
                grid[rr][cc] === p
            ) {
                if (!all) all = [];
                all = all.concat(line);
            }
        }
        return all;
    }

    function legalMoves(p) {
        const out = [];
        for (let r = 0; r < N; r++)
            for (let c = 0; c < N; c++) {
                const f = flipsFor(r, c, p);
                if (f) out.push({ r, c, flips: f });
            }
        return out;
    }

    function counts() {
        let b = 0,
            w = 0;
        for (let r = 0; r < N; r++)
            for (let c = 0; c < N; c++) {
                if (grid[r][c] === 1) b++;
                else if (grid[r][c] === 2) w++;
            }
        return { b, w };
    }

    function bestMove(list) {
        let best = -Infinity, pick = list[0];
        for (const m of list) {
            const s = WT[m.r][m.c] * 3 + m.flips.length;
            if (s > best) { best = s; pick = m; }
        }
        return pick;
    }

    /* ---------- rendering ---------- */
    function syncDiscs(flips, pr, pc) {
        const fmap = new Map();
        if (flips)
            flips.forEach((f, i) => fmap.set(f[0] + "_" + f[1], i));
        for (let r = 0; r < N; r++)
            for (let c = 0; c < N; c++) {
                const v = grid[r][c];
                let el = discEls[r][c];
                if (!v) {
                    if (el) {
                        el.remove();
                        discEls[r][c] = null;
                    }
                    continue;
                }
                if (!el) {
                    el = mk(
                        "circle",
                        {
                            cx: cxOf(c),
                            cy: cyOf(r),
                            r: 23,
                            class: "rv-disc " + (v === 1 ? "rv-b" : "rv-w"),
                        },
                        gDiscs,
                    );
                    discEls[r][c] = el;
                    if (pr === r && pc === c) el.classList.add("rv-pop");
                    continue;
                }
                const idx = fmap.get(r + "_" + c);
                if (idx !== undefined) {
                    const to = v;
                    later(() => el.classList.add("rv-flip"), idx * 45);
                    later(
                        () => {
                            el.style.fill = to === 1 ? "#0d1526" : "#f4f6fb";
                            el.style.stroke = to === 1 ? "#33415e" : "#b9c2d4";
                        },
                        idx * 45 + 150,
                    );
                    later(
                        () => {
                            el.classList.remove("rv-flip");
                            el.setAttribute(
                                "class",
                                "rv-disc " + (to === 1 ? "rv-b" : "rv-w"),
                            );
                            el.style.fill = "";
                            el.style.stroke = "";
                        },
                        idx * 45 + 330,
                    );
                } else {
                    el.setAttribute(
                        "class",
                        "rv-disc " + (v === 1 ? "rv-b" : "rv-w"),
                    );
                }
            }
    }

    function renderRings() {
        gRings.innerHTML = "";
        const play = active && started && !over && turn === 1 && !frozen;
        for (let r = 0; r < N; r++)
            for (let c = 0; c < N; c++) {
                const legal = play && !!flipsFor(r, c, 1);
                cellEls[r][c].classList.toggle("rv-play", legal);
                if (legal)
                    mk(
                        "circle",
                        { cx: cxOf(c), cy: cyOf(r), r: 9, class: "rv-ring" },
                        gRings,
                    );
            }
        gHints.innerHTML = "";
        if (cheats.hint && play) {
            const ms = legalMoves(1);
            if (ms.length) {
                const m = bestMove(ms);
                mk(
                    "circle",
                    { cx: cxOf(m.c), cy: cyOf(m.r), r: 6, class: "rv-hint" },
                    gHints,
                );
            }
        }
        renderCursor();
    }

    function renderCursor() {
        cursorEl.hidden = !kb || frozen || over || turn !== 1;
        cursorEl.setAttribute("x", PAD + CELL * (cursor & 7));
        cursorEl.setAttribute("y", PAD + CELL * (cursor >> 3));
    }

    function setMarker(r, c) {
        marker.setAttribute("cx", cxOf(c));
        marker.setAttribute("cy", cyOf(r));
        marker.style.display = "";
    }

    function updateHud() {
        const n = counts();
        hud.you.textContent = n.b;
        hud.ai.textContent = n.w;
        hud.turn.classList.remove("rv-think");
        if (over) hud.turn.textContent = "Game over";
        else if (turn === 1) hud.turn.textContent = "Your turn";
        else {
            hud.turn.textContent = "AI thinking";
            hud.turn.classList.add("rv-think");
        }
    }

    function toast(msg) {
        toastEl.textContent = msg;
        toastEl.classList.add("rv-on");
        later(() => toastEl.classList.remove("rv-on"), 1600, "toast");
    }

    /* ---------- overlay / control wiring ---------- */
    function syncUI() {
        const freeze = helpOpen || cheatsOpen || paused;
        if (freeze && !frozen) freezeTimers();
        else if (!freeze && frozen) thawTimers();
        ov.over.hidden = !resultOpen || cheatsOpen || helpOpen || paused;
        ov.pause.hidden = !paused || cheatsOpen || helpOpen;
        ov.cheat.hidden = !cheatsOpen || helpOpen;
        ov.help.hidden = !helpOpen;
        if (pauseBtn) {
            const label = pauseBtn.querySelector(".rv-btn-label");
            if (label) label.textContent = paused ? "Resume" : "Pause";
            pauseBtn.setAttribute("aria-label", paused ? "Resume" : "Pause");
            pauseBtn.setAttribute("title", paused ? "Resume (P)" : "Pause (P)");
        }
        cheatsOpen && cheatsOpenUiSync();
        renderRings();
    }

    function cheatsOpenUiSync() {
        root.querySelectorAll("[data-cheat]").forEach((input) => {
            input.checked = Boolean(cheats[input.dataset.cheat]);
        });
    }

    function toggleHelp(on) {
        helpOpen = typeof on === "boolean" ? on : !helpOpen;
        if (helpOpen) cheatsOpen = false;
        syncUI();
    }
    function toggleCheats(on) {
        if (!alive) return;
        cheatsOpen = typeof on === "boolean" ? on : !cheatsOpen;
        if (cheatsOpen) helpOpen = false;
        syncUI();
        cheatsOpenUiSync();
        if (cheatsOpen && cheats.auto) armAuto();
    }
    function togglePause(on) {
        if (!alive) return;
        const next = typeof on === "boolean" ? on : !paused;
        if (next === paused) return;
        paused = next;
        syncUI();
    }
    function toggleDiff() {
        diff = diff === "greedy" ? "easy" : "greedy";
        diffLabel.textContent = diff === "greedy" ? "Greedy" : "Easy";
        toast("AI difficulty: " + diffLabel.textContent + ".");
    }

    /* ---------- turn flow (unchanged engine) ---------- */
    function humanPlay(r, c) {
        if (!active || !started || over || turn !== 1 || frozen) return;
        const f = flipsFor(r, c, 1);
        if (!f) return;
        place(r, c, 1, f);
    }

    function place(r, c, p, flips) {
        grid[r][c] = p;
        for (const f of flips) grid[f[0]][f[1]] = p;
        syncDiscs(flips, r, c);
        setMarker(r, c);
        updateHud();
        advance(p);
    }

    function advance(p) {
        const o = 3 - p;
        const mo = legalMoves(o);
        if (mo.length) {
            turn = o;
            renderRings();
            updateHud();
            if (o === 2) later(aiMove, 600, "ai");
            else armAuto();
            return;
        }
        const mp = legalMoves(p);
        if (mp.length) {
            toast(
                o === 1
                    ? "You have no legal moves. Your turn passes."
                    : "The AI has no legal moves. It passes.",
            );
            turn = p;
            renderRings();
            updateHud();
            if (p === 2) later(aiMove, 1100, "ai");
            else armAuto();
            return;
        }
        endGame();
    }

    /* ---------- AI ---------- */
    function aiMove() {
        if (!active || over || turn !== 2 || frozen) return;
        const ms = legalMoves(2);
        if (!ms.length) return;
        let pick;
        if (diff === "easy") {
            pick = ms[Math.floor(Math.random() * ms.length)];
        } else {
            let best = -Infinity;
            for (const m of ms) {
                const s = WT[m.r][m.c] * 3 + m.flips.length;
                if (s > best) {
                    best = s;
                    pick = m;
                }
            }
        }
        place(pick.r, pick.c, 2, pick.flips);
    }

    function armAuto() {
        if (!cheats.auto || frozen || over || !active || turn !== 1) return;
        later(autoPlay, 420, "auto");
    }
    function autoPlay() {
        if (!alive || !active || over || turn !== 1 || frozen) return;
        const ms = legalMoves(1);
        if (!ms.length) return;
        const m = bestMove(ms);
        place(m.r, m.c, 1, m.flips);
    }

    function cheatFlip() {
        if (over) return;
        const whites = [];
        for (let r = 0; r < N; r++)
            for (let c = 0; c < N; c++)
                if (grid[r][c] === 2) whites.push([r, c]);
        if (!whites.length) { toast("No AI discs to flip."); return; }
        const [r, c] = whites[Math.floor(Math.random() * whites.length)];
        grid[r][c] = 1;
        syncDiscs(null, -1, -1);
        updateHud();
        renderRings();
        toast("One AI disc flipped to black.");
    }
    function cheatWin() {
        if (over) return;
        for (let r = 0; r < N; r++)
            for (let c = 0; c < N; c++)
                if (grid[r][c] === 2) grid[r][c] = 1;
        syncDiscs(null, -1, -1);
        updateHud();
        cheatsOpen = false;
        endGame();
        syncUI();
    }

    /* ---------- end ---------- */
    function endGame() {
        over = true;
        renderRings();
        updateHud();
        later(showOver, 750, "over");
    }

    function showOver() {
        if (!over || !alive) return;
        resultOpen = true;
        const n = counts();
        const final = "Final score: you " + n.b + " - " + n.w + " AI.";
        ovTitle.classList.remove("mgp-win", "mgp-lose", "rv-win", "rv-lose");
        if (n.b > n.w) {
            ovTitle.textContent = "You win";
            ovTitle.classList.add("mgp-win", "rv-win");
            ovReason.textContent = "You hold the majority of discs. " + final;
        } else if (n.w > n.b) {
            ovTitle.textContent = "AI wins";
            ovTitle.classList.add("mgp-lose", "rv-lose");
            ovReason.textContent = "The AI holds the majority of discs. " + final;
        } else {
            ovTitle.textContent = "Draw";
            ovReason.textContent = "Discs are split evenly, 32 - 32.";
        }
        syncUI();
    }

    /* ---------- round management ---------- */
    function resetBoard() {
        grid = Array.from({ length: N }, () => new Array(N).fill(0));
        grid[3][3] = 2;
        grid[4][4] = 2; // white
        grid[3][4] = 1;
        grid[4][3] = 1; // black
        gDiscs.innerHTML = "";
        discEls = Array.from({ length: N }, () =>
            new Array(N).fill(null),
        );
        marker.style.display = "none";
        turn = 1;
        over = false;
        syncDiscs(null, -1, -1);
        renderRings();
        updateHud();
    }

    function newGame() {
        clearTimers();
        frozen = false;
        pauseStart = 0;
        helpOpen = false;
        cheatsOpen = false;
        paused = false;
        resultOpen = false;
        started = true;
        active = true;
        resetBoard();
        syncUI();
        cheatsOpenUiSync();
        root.focus({ preventScroll: true });
    }

    function handleClick(event) {
        const t = event.target;
        if (t.closest("[data-exit]")) { onExit(); return; }
        if (t.closest("[data-help]")) { toggleHelp(); root.focus({ preventScroll: true }); return; }
        if (t.closest("[data-help-close]")) { toggleHelp(false); root.focus({ preventScroll: true }); return; }
        if (t.closest("[data-cheats]")) { toggleCheats(); root.focus({ preventScroll: true }); return; }
        if (t.closest("[data-cheat-close]")) { toggleCheats(false); root.focus({ preventScroll: true }); return; }
        if (t.closest("[data-pause]")) { togglePause(); root.focus({ preventScroll: true }); return; }
        if (t.closest("[data-resume]")) { togglePause(false); root.focus({ preventScroll: true }); return; }
        if (t.closest("[data-restart]")) { newGame(); root.focus({ preventScroll: true }); return; }
        const act = t.closest("[data-act]");
        if (act) {
            const a = act.dataset.act;
            if (a === "diff") toggleDiff();
            else if (a === "cheat-flip") cheatFlip();
            else if (a === "cheat-win") cheatWin();
            root.focus({ preventScroll: true });
        }
    }

    function handleChange(event) {
        const t = event.target;
        if (t.dataset && t.dataset.cheat) {
            cheats[t.dataset.cheat] = Boolean(t.checked);
            if (t.dataset.cheat === "hint") renderRings();
            if (t.dataset.cheat === "auto" && t.checked) armAuto();
        }
    }

    function handleKey(e) {
        if (!alive) return;
        const k = e.key;
        const code = e.code || "";
        const tag = (e.target && e.target.tagName) || "";
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
        /* priority: help -> cheats -> pause -> Escape -> restart -> game actions */
        if (code === "KeyH" || k === "?") {
            if (!e.repeat) toggleHelp();
            e.preventDefault(); return;
        }
        if (code === "KeyC") {
            if (!e.repeat && !helpOpen) toggleCheats();
            e.preventDefault(); return;
        }
        if (code === "KeyP") {
            if (!e.repeat && !helpOpen && !cheatsOpen) togglePause();
            e.preventDefault(); return;
        }
        if (k === "Escape") {
            if (helpOpen) toggleHelp(false);
            else if (cheatsOpen) toggleCheats(false);
            else if (paused) togglePause(false);
            e.preventDefault(); return;
        }
        if (code === "KeyR") {
            if (!e.repeat && !helpOpen && !cheatsOpen) newGame();
            e.preventDefault(); return;
        }
        if (tag === "BUTTON") return;
        if (frozen) { e.preventDefault(); return; }
        if (k === "ArrowUp" || k === "ArrowDown" || k === "ArrowLeft" || k === "ArrowRight") {
            e.preventDefault();
            kb = true;
            let r = cursor >> 3, c = cursor & 7;
            if (k === "ArrowUp") r = Math.max(0, r - 1);
            else if (k === "ArrowDown") r = Math.min(N - 1, r + 1);
            else if (k === "ArrowLeft") c = Math.max(0, c - 1);
            else c = Math.min(N - 1, c + 1);
            cursor = r * N + c;
            renderCursor();
            return;
        }
        if (k === "Enter" || k === " ") {
            e.preventDefault();
            kb = true;
            humanPlay(cursor >> 3, cursor & 7);
        }
    }

    root.tabIndex = 0;
    root.addEventListener("click", handleClick);
    root.addEventListener("change", handleChange);
    root.addEventListener("keydown", handleKey);

    /* ---------- boot ---------- */
    resetBoard();
    syncUI();
    root.focus({ preventScroll: true });

    return {
        destroy() {
            alive = false;
            active = false;
            clearTimers();
            root.removeEventListener("click", handleClick);
            root.removeEventListener("change", handleChange);
            root.removeEventListener("keydown", handleKey);
        },
    };
}
