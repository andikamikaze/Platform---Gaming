/* ==== GAME: pairs-memory.js ==== */

/* =============================================================
MEMORY MATCH - flip cards two at a time and find every pair
before the clock (90s) or the move budget (30) runs out.
8 pairs of SVG shapes on a 4x4 grid. Pure SVG, no emoji.
Layout: HUD bar + fill-height board + internal help/cheat/pause
overlays. Classic MGP script is kept (inline icon helper below)
so the manifest "kind" stays "mgp".
============================================================= */
(() => {
    "use strict";

    /* ---------- pure logic (exposed via _test) ---------- */
    const GRID = 4;
    const PAIRS = 8;
    const TIME_LIMIT = 90;
    const MOVE_LIMIT = 30;

    function rng(seed) {
        let a = seed >>> 0;
        return function () {
            a |= 0;
            a = (a + 0x6d2b79f5) | 0;
            let t = Math.imul(a ^ (a >>> 15), 1 | a);
            t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    }

    /* 8 distinct shapes, each with an svg body (48x48 viewBox) */
    const SHAPES = [
        {
            id: "sun",
            color: "#fbbf24",
            body: '<circle cx="24" cy="24" r="13" fill="#fbbf24"/>',
        },
        {
            id: "moon",
            color: "#a5b4fc",
            body: '<path d="M30 8a16 16 0 1 0 10 28A18 18 0 0 1 30 8z" fill="#a5b4fc"/>',
        },
        {
            id: "tri",
            color: "#34d399",
            body: '<polygon points="24,9 39,38 9,38" fill="#34d399"/>',
        },
        {
            id: "dia",
            color: "#f472b6",
            body: '<polygon points="24,8 40,24 24,40 8,24" fill="#f472b6"/>',
        },
        {
            id: "star",
            color: "#facc15",
            body: '<polygon points="24,7 29,19 42,20 32,29 35,42 24,35 13,42 16,29 6,20 19,19" fill="#facc15"/>',
        },
        {
            id: "heart",
            color: "#f87171",
            body: '<path d="M24 40C10 30 6 22 6 16a9 9 0 0 1 18-3 9 9 0 0 1 18 3c0 6-4 14-18 24z" fill="#f87171"/>',
        },
        {
            id: "cross",
            color: "#60a5fa",
            body: '<path d="M19 8h10v11h11v10H29v11H19V29H8V19h11z" fill="#60a5fa"/>',
        },
        {
            id: "ring",
            color: "#2dd4bf",
            body: '<circle cx="24" cy="24" r="14" fill="none" stroke="#2dd4bf" stroke-width="8"/>',
        },
    ];

    /* Card Pair Generator: deck of 16 with each pid exactly twice */
    function makeDeck(rnd) {
        const deck = [];
        for (let p = 0; p < PAIRS; p++) {
            deck.push(p);
            deck.push(p);
        }
        for (let i = deck.length - 1; i > 0; i--) {
            const j = Math.floor(rnd() * (i + 1));
            const t = deck[i];
            deck[i] = deck[j];
            deck[j] = t;
        }
        return deck;
    }

    function newGame(rnd) {
        return {
            deck: makeDeck(rnd),
            open: [],
            matched: [],
            moves: 0,
            time: 0,
        };
    }

    /* Card Flip + Pair Detection + Card Lock reducer.
    Returns { g, ev } where ev.type is:
    flip | match | miss | locked | already | win                    */
    function pick(g, idx) {
        if (idx < 0 || idx >= g.deck.length)
            return { g, ev: { type: "locked" } };
        if (g.matched.indexOf(idx) >= 0 || g.open.indexOf(idx) >= 0) {
            return { g, ev: { type: "already" } };
        }
        if (g.open.length >= 2) return { g, ev: { type: "locked" } };
        const g2 = {
            deck: g.deck,
            open: g.open.slice(),
            matched: g.matched.slice(),
            moves: g.moves,
            time: g.time,
        };
        g2.open.push(idx);
        if (g2.open.length < 2) return { g: g2, ev: { type: "flip" } };
        /* second card */
        g2.moves = g.moves + 1;
        const a = g2.open[0],
            b = g2.open[1];
        if (g2.deck[a] === g2.deck[b]) {
            g2.matched = g2.matched.concat(a, b);
            g2.open = [];
            const won = g2.matched.length === g2.deck.length;
            return { g: g2, ev: { type: won ? "win" : "match" } };
        }
        return { g: g2, ev: { type: "miss" } };
    }

    /* after a miss the UI closes both cards */
    function closeMiss(g) {
        return {
            deck: g.deck,
            open: [],
            matched: g.matched,
            moves: g.moves,
            time: g.time,
        };
    }

    function isWin(g) {
        return g.matched.length === g.deck.length;
    }
    function isLose(g) {
        return !isWin(g) && (g.moves >= MOVE_LIMIT || g.time >= TIME_LIMIT);
    }

    /* ---------- inline icons (no ESM import; keeps classic MGP) ---------- */
    const ICON_PATHS = {
        helpCircle: ["M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z", "M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3", "M12 17h.01"],
        wrench: ["M14.7 6.3a4 4 0 0 0 5 5l-9 9a2.8 2.8 0 0 1-4-4z", "M6 16l-3 3", "M14.5 4.5 19 9"],
        pause: ["M7 4h3v16H7z", "M14 4h3v16h-3z"],
        play: ["M8 5v14l11-7z"],
        refresh: ["M21 2v6h-6", "M3 12a9 9 0 0 1 15-6.7L21 8", "M3 22v-6h6", "M21 12a9 9 0 0 1-15 6.7L3 16"],
        logOut: ["m16 17 5-5-5-5", "M21 12H9", "M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"],
        x: ["M18 6 6 18", "M6 6l12 12"],
    };
    function iconSVG(name, size) {
        const paths = ICON_PATHS[name] || ICON_PATHS.helpCircle;
        return '<svg viewBox="0 0 24 24" width="' + size + '" height="' + size + '" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' + paths.map(function (d) { return '<path d="' + d + '"/>'; }).join("") + "</svg>";
    }

    MGP_REGISTER({
        id: "pairs-memory",
        name: "Pairs Memory",
        category: "puzzle",
        catLabel: "Puzzle",
        desc: "Flip two cards at a time and find all 8 pairs before time runs out.",
        art: '<svg viewBox="0 0 48 48" width="54" height="54" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="5" width="17" height="24" rx="3" fill="#4f46e5"/><rect x="26" y="5" width="17" height="24" rx="3" fill="#f59e0b"/><rect x="5" y="31" width="17" height="12" rx="3" fill="#f59e0b"/><rect x="26" y="31" width="17" height="12" rx="3" fill="#4f46e5" stroke="none" transform="rotate(8 34 37)"/><text x="13.5" y="22" font-size="11" font-family="inherit" font-weight="800" text-anchor="middle" fill="#fff" stroke="none">A</text><text x="34.5" y="22" font-size="11" font-family="inherit" font-weight="800" text-anchor="middle" fill="#fff" stroke="none">a</text></svg>',
        bg: ["#c7d2fe", "#a5b4fc"],
        _test: {
            GRID,
            PAIRS,
            TIME_LIMIT,
            MOVE_LIMIT,
            SHAPES,
            rng,
            makeDeck,
            newGame,
            pick,
            closeMiss,
            isWin,
            isLose,
        },
        build(app) {
            const onExit = typeof document !== "undefined" && document.getElementById
                ? function () {
                    const b = document.getElementById("closeGameButton");
                    if (b && typeof b.click === "function") b.click();
                }
                : function () { };

            app.classList.add("game-app", "mm", "game-fill");

            /* ---------- shell: HUD bar + fill-height board + overlays ---------- */
            app.innerHTML = `
<style>
#pairs-memory-app [hidden]{display:none!important}
#pairs-memory-app.mm{--panel:#111a33;--court:#0b1020;--line:#ffffff1f;--ink:#e5e7eb;--mut:#9ca3af;--acc:#818cf8;--ok:#34d399;--danger:#fb7185;display:flex;flex-direction:column;gap:8px;min-height:0;color:var(--ink);-webkit-tap-highlight-color:transparent}
#pairs-memory-app.mm *{box-sizing:border-box}
#pairs-memory-app.mm :where(svg,canvas,img){max-width:100%;height:auto}
#pairs-memory-app.mm-hud{display:flex;align-items:center;gap:8px;flex-wrap:wrap;font:600 11px/1 ui-monospace,SFMono-Regular,Menlo,monospace}
#pairs-memory-app .mm-chip{display:inline-flex;align-items:center;gap:6px;min-height:32px;padding:5px 9px;border:1px solid var(--line);border-radius:999px;background:var(--panel);color:var(--mut);white-space:nowrap}
#pairs-memory-app .mm-chip b{color:var(--ink);font-variant-numeric:tabular-nums}
#pairs-memory-app .mm-chip.warn{border-color:#f8717155;color:#fca5a5}
#pairs-memory-app .mm-chip[data-hud="status"]{max-width:200px;overflow:hidden;text-overflow:ellipsis}
#pairs-memory-app .mm-chip .game-status-dot{width:7px;height:7px;border-radius:50%;background:var(--acc);flex:none}
#pairs-memory-app .mm-chip.go .game-status-dot{background:var(--ok)}
#pairs-memory-app .mm-chip.over .game-status-dot{background:var(--danger)}
#pairs-memory-app .mm-bar{width:48px;height:5px;border-radius:3px;background:#ffffff14;overflow:hidden}
#pairs-memory-app .mm-bar i{display:block;height:100%;background:var(--ok);transition:width .3s}
#pairs-memory-app .mm-bar.warn i{background:var(--danger)}
#pairs-memory-app .mm-spacer{flex:1 1 auto}
#pairs-memory-app .mm-btn{appearance:none;border:1px solid var(--line);background:var(--panel);color:var(--ink);border-radius:9px;min-height:36px;padding:0 11px;font:inherit;font-size:11px;font-weight:700;letter-spacing:.04em;cursor:pointer;touch-action:manipulation;user-select:none;-webkit-user-select:none}
#pairs-memory-app .mm-btn:hover:not(:disabled){border-color:var(--acc);color:var(--acc)}
#pairs-memory-app .mm-btn:disabled{opacity:.4;cursor:default}
#pairs-memory-app .mm-btn.acc{border-color:var(--acc);color:var(--acc)}
#pairs-memory-app .mm-btn.on{border-color:#fbbf24;color:#fbbf24}
#pairs-memory-app .mm-icon-btn{display:inline-flex;align-items:center;gap:6px}
#pairs-memory-app .mm-icon-btn svg{flex:none;display:block}
#pairs-memory-app.mm.game-fill > .mm-board{position:relative;width:100%;flex:1 1 auto;min-height:0;aspect-ratio:auto;border:1px solid var(--line);border-radius:12px;background:var(--court);overflow:hidden;padding:0;display:flex;align-items:center;justify-content:center}
#pairs-memory-app .mm-wrap{width:min(100%,430px);max-height:100%;display:flex;align-items:center;justify-content:center;padding:12px;overflow:auto;scrollbar-width:none}
#pairs-memory-app .mm-wrap::-webkit-scrollbar{display:none}
#pairs-memory-app .mm-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;width:100%;margin:auto}
#pairs-memory-app .mm-card{position:relative;aspect-ratio:1;border:0;border-radius:12px;background:#1b2547;padding:0;cursor:pointer;transition:transform .18s;min-width:0}
#pairs-memory-app .mm-card:hover{transform:translateY(-2px)}
#pairs-memory-app .mm-card[disabled]{cursor:default}
#pairs-memory-app .mm-face{position:absolute;inset:0;border-radius:12px;display:grid;place-items:center;backface-visibility:hidden;transition:opacity .2s}
#pairs-memory-app .mm-back{background:linear-gradient(135deg,#312e81,#4f46e5)}
#pairs-memory-app .mm-front{background:#0f1a33;border:2px solid #ffffff22}
#pairs-memory-app .mm-card.done .mm-front{border-color:#34d39966;background:#0f2a1e}
#pairs-memory-app .mm-card.done{cursor:default}
#pairs-memory-app .mm-card.hidden .mm-back{opacity:1}
#pairs-memory-app .mm-card:not(.hidden) .mm-back{opacity:0}
#pairs-memory-app .mm-card.hidden .mm-front{opacity:0}
#pairs-memory-app .mm-shake{animation:mm-shake .35s ease}
@keyframes mm-shake{0%,100%{transform:translateX(0)}30%{transform:translateX(-6px)}70%{transform:translateX(6px)}}
#pairs-memory-app :is(button):focus-visible{outline:2px solid #a5b4fc;outline-offset:2px}
#pairs-memory-app .mm-ov{position:absolute;inset:0;z-index:5;display:flex;align-items:center;justify-content:center;padding:14px;background:rgba(11,16,32,.86);backdrop-filter:blur(3px)}
#pairs-memory-app .mm-card-ov{width:min(520px,100%);max-height:100%;display:flex;flex-direction:column;gap:12px;padding:16px;border:1px solid var(--line);border-radius:12px;background:var(--panel);overflow:hidden;text-align:center}
#pairs-memory-app .mgp-ov-title{margin:0;font-size:17px}
#pairs-memory-app .mgp-win{color:var(--ok)}
#pairs-memory-app .mgp-lose{color:var(--danger)}
#pairs-memory-app .mm-sub{font-size:12px;line-height:1.55;color:var(--mut);margin:0}
#pairs-memory-app .mm-head{display:flex;align-items:center;justify-content:space-between;gap:10px;flex:none;text-align:left}
#pairs-memory-app .mm-foot{display:flex;align-items:center;justify-content:space-between;gap:10px;flex:none;text-align:left}
#pairs-memory-app .mm-cheats,#pairs-memory-app .mm-help{display:grid;gap:8px;flex:1 1 auto;min-height:0;overflow:auto}
#pairs-memory-app .mm-cheats{grid-template-columns:repeat(auto-fit,minmax(150px,1fr))}
#pairs-memory-app .mm-help{grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:14px;text-align:left}
#pairs-memory-app .mm-help b{display:block;margin-bottom:5px;color:var(--mut);font-size:10px;letter-spacing:.1em;text-transform:uppercase}
#pairs-memory-app .mm-help ul{margin:0 0 10px;padding-left:16px;color:var(--mut);font-size:12px;line-height:1.6}
#pairs-memory-app .mm-kbd{display:inline-block;padding:1px 5px;border:1px solid var(--line);border-bottom-width:2px;border-radius:5px;background:var(--court);color:var(--ink);font:inherit}
#pairs-memory-app .mm-note{color:var(--mut);font-size:11px;line-height:1.5}
#pairs-memory-app .mm-cheatrow{display:flex;align-items:center;justify-content:space-between;gap:10px;min-height:44px;padding:8px 10px;border:1px solid var(--line);border-radius:10px;background:var(--court);font-size:12px;text-align:left}
#pairs-memory-app .mm-switch{position:relative;width:40px;height:22px;border-radius:999px;border:1px solid var(--line);background:var(--court);cursor:pointer;flex:none;padding:0}
#pairs-memory-app .mm-switch:after{content:"";position:absolute;top:2px;left:2px;width:16px;height:16px;border-radius:50%;background:var(--mut)}
#pairs-memory-app .mm-switch[aria-pressed="true"]{border-color:var(--acc);background:rgba(129,140,248,.15)}
#pairs-memory-app .mm-switch[aria-pressed="true"]:after{left:20px;background:var(--acc)}
@media (prefers-reduced-motion:reduce){#pairs-memory-app *{animation:none!important;transition:none!important}}
/* --- layout redesign overrides (keep last) --- */
#pairs-memory-app.mm.game-fill > .mm-board{flex:1 1 auto;min-height:0;aspect-ratio:auto}
@media (max-width:640px){
#pairs-memory-app.mm.game-fill > .mm-board:not(:has(.mm-ov:not([hidden]))){aspect-ratio:1/1;flex:0 0 auto;min-height:0}
#pairs-memory-app.mm.game-fill > .mm-board:has(.mm-ov:not([hidden])){aspect-ratio:auto;flex:0 0 auto;min-height:min(70dvh,620px)}
#pairs-memory-app .mm-hud{gap:5px}
#pairs-memory-app .mm-chip{padding:4px 6px;min-height:0;font-size:9px}
#pairs-memory-app .mm-chip[data-hud="status"]{max-width:120px}
#pairs-memory-app .mm-chip[data-hud="moves"],#pairs-memory-app .mm-chip[data-hud="pairs"]{display:none}
#pairs-memory-app .mm-bar{width:36px}
#pairs-memory-app .mm-btn{min-height:32px;padding:5px 9px;font-size:9px}
#pairs-memory-app .mm-icon-btn .mm-btn-label,#pairs-memory-app .mm-spacer{display:none}
#pairs-memory-app .mm-wrap{padding:8px}
#pairs-memory-app .mm-grid{gap:6px}
#pairs-memory-app .mm-ov{padding:8px}
#pairs-memory-app .mm-card-ov{width:100%;height:100%;max-height:100%;padding:12px;border-radius:12px}
#pairs-memory-app .mm-cheats,#pairs-memory-app .mm-help{scrollbar-width:none}
#pairs-memory-app .mm-cheats::-webkit-scrollbar,#pairs-memory-app .mm-help::-webkit-scrollbar{display:none}
#pairs-memory-app .mm-foot{position:static;margin:0;padding:10px 0 0;border-top:1px solid var(--line)}
#pairs-memory-app .mm-note{display:none}
}
@media (pointer:coarse){
#pairs-memory-app.mm .mm-hud .mm-btn{min-height:32px;padding:5px 9px;font-size:9px}
}
</style>
<div class="mm-hud">
  <span class="mm-chip game-status" data-chip="status"><i class="game-status-dot"></i><span data-hud="status">Press Start to play</span></span>
  <span class="mm-chip" data-hud="pairs">PAIRS <b>0</b>/${PAIRS}</span>
  <span class="mm-chip" data-hud="moves">MOVES <b>0</b>/${MOVE_LIMIT}</span>
  <span class="mm-chip" data-hud="time">TIME <b data-hud="timeval">0</b>/${TIME_LIMIT}s <span class="mm-bar" data-bar><i data-hud="timebar" style="width:100%"></i></span></span>
  <span class="mm-spacer"></span>
  <button class="mm-btn mm-icon-btn" type="button" data-help aria-label="How to play" title="How to play (H)">${iconSVG("helpCircle", 14)}<span class="mm-btn-label">Help</span></button>
  <button class="mm-btn mm-icon-btn" type="button" data-cheats aria-label="Cheats" title="Cheats (C)">${iconSVG("wrench", 14)}<span class="mm-btn-label">Cheats</span></button>
  <button class="mm-btn mm-icon-btn" type="button" data-pause aria-label="Pause" title="Pause (P)">${iconSVG("pause", 14)}<span class="mm-btn-label" data-label="pause">Pause</span></button>
  <button class="mm-btn mm-icon-btn" type="button" data-restart aria-label="Restart" title="Restart (R)">${iconSVG("refresh", 14)}<span class="mm-btn-label">Restart</span></button>
  <button class="mm-btn mm-icon-btn" type="button" data-exit aria-label="Exit game" title="Exit game">${iconSVG("logOut", 14)}<span class="mm-btn-label">Exit</span></button>
</div>
<section class="game-panel mm-board" data-board>
  <div class="mm-wrap" data-wrap>
    <div class="mm-grid" data-grid></div>
  </div>
  <div class="mm-ov" data-ov="start">
    <div class="mm-card-ov">
      <div class="mm-head"><h2 class="mgp-ov-title">Pairs Memory</h2><span class="mm-note">${PAIRS} pairs &middot; ${TIME_LIMIT}s &middot; ${MOVE_LIMIT} moves</span></div>
      <p class="mm-sub">16 cards hide 8 pairs of shapes. Flip two cards per move - a matching pair stays open, a mismatch flips back. Find every pair within 90 seconds and 30 moves.</p>
      <div class="mm-foot"><button class="mm-btn" type="button" data-help>How to play</button><button class="mm-btn acc" type="button" data-act="start">Start game</button></div>
    </div>
  </div>
  <div class="mm-ov" data-ov="over" hidden>
    <div class="mm-card-ov">
      <div class="mm-head"><h2 class="mgp-ov-title" data-ov="title">Game over</h2><span class="mm-note">Press R to replay</span></div>
      <p class="mm-sub" data-ov="reason"></p>
      <div class="mm-foot"><span class="mm-note">Press H to reopen the guide</span><button class="mm-btn acc" type="button" data-act="start">Play again</button></div>
    </div>
  </div>
  <div class="mm-ov" data-ov="pause" hidden>
    <div class="mm-card-ov">
      <div class="mm-head"><h3>Paused</h3></div>
      <p class="mm-sub">The clock and every pending flip are frozen. Your cards and progress are kept when you resume.</p>
      <div class="mm-foot"><span class="mm-note">Press P or Esc to resume</span><button class="mm-btn acc" type="button" data-resume>Resume</button></div>
    </div>
  </div>
  <div class="mm-ov" data-ov="cheat" hidden>
    <div class="mm-card-ov">
      <div class="mm-head"><h3>Cheats</h3><button class="mm-btn" type="button" data-close aria-label="Close cheats">${iconSVG("x", 14)}</button></div>
      <div class="mm-cheats" data-cheatgrid></div>
      <div class="mm-cheats" data-cheatacts></div>
      <div class="mm-foot"><span class="mm-note">Toggles apply immediately</span><button class="mm-btn" type="button" data-close>Done</button></div>
    </div>
  </div>
  <div class="mm-ov" data-ov="help" hidden>
    <div class="mm-card-ov">
      <div class="mm-head"><h3>How to play</h3><button class="mm-btn" type="button" data-help-close aria-label="Close help">${iconSVG("x", 14)}</button></div>
      <div class="mm-help">
        <div>
          <b>Desktop</b>
          <ul>
            <li>Click a card to flip it, or press <span class="mm-kbd">1</span>&ndash;<span class="mm-kbd">9</span>, <span class="mm-kbd">0</span> for cards 1&ndash;10.</li>
            <li>Two matching shapes stay open; a mismatch flips back after a short pause.</li>
            <li><span class="mm-kbd">H</span> help &middot; <span class="mm-kbd">C</span> cheats &middot; <span class="mm-kbd">P</span> pause &middot; <span class="mm-kbd">R</span> restart. <span class="mm-kbd">Esc</span> closes the top panel.</li>
          </ul>
          <b>Mobile</b>
          <ul>
            <li>Tap cards on the board; the HUD buttons handle help, cheats, pause, restart and exit.</li>
          </ul>
        </div>
        <div>
          <b>Rules</b>
          <ul>
            <li>Find all ${PAIRS} pairs before the ${TIME_LIMIT}-second clock or the ${MOVE_LIMIT}-move budget runs out.</li>
            <li>Every two flipped cards cost one move, so remember where each shape lives.</li>
          </ul>
          <div class="mm-foot"><span class="mm-note">Press H to reopen this guide</span><button class="mm-btn acc" type="button" data-help-close>Got it</button></div>
        </div>
      </div>
    </div>
  </div>
</section>`;

            /* ---------------- refs ---------------- */
            const $ = (s, r) => (r || app).querySelector(s);
            const gridEl = $("[data-grid]");
            const barEl = $("[data-bar]");
            const barFill = $('[data-hud="timebar"]');
            const ov = {
                start: $('[data-ov="start"]'),
                over: $('[data-ov="over"]'),
                pause: $('[data-ov="pause"]'),
                cheat: $('[data-ov="cheat"]'),
                help: $('[data-ov="help"]'),
            };
            const ovTitle = $('[data-ov="title"]');
            const ovReason = $('[data-ov="reason"]');
            const cheatGrid = $("[data-cheatgrid]");
            const cheatActs = $("[data-cheatacts]");
            const hud = {
                status: $('[data-hud="status"]'),
                pairs: $('[data-hud="pairs"] b'),
                moves: $('[data-hud="moves"] b'),
                time: $('[data-hud="timeval"]'),
            };
            const statusChip = $('[data-chip="status"]');
            const timeChip = $('[data-hud="time"]');
            const pbtn = $("[data-pause]");
            const cbtn = $("[data-cheats]");
            const pauseLabel = $('[data-label="pause"]');
            const cards = [];

            /* ---------------- state ---------------- */
            let g = null;
            let running = false,
                wasRunning = false,
                active = false,
                busy = false;
            let phase = "start"; /* start | play | over */
            let overReady = false,
                resultWin = false;
            let paused = false,
                cheatsOpen = false,
                helpOpen = false;
            const cheats = { peek: false, freeze: false };
            const CHEAT_LABELS = {
                peek: "Reveal every card",
                freeze: "Freeze the clock",
            };
            const CHEAT_ACTS = [
                ["time", "Add 30 seconds"],
                ["moves", "Reset move counter"],
                ["pair", "Match one pair"],
            ];

            /* pausable timers: pending callbacks keep their remaining time and
               their Date.now() due-anchors are shifted on resume. */
            const timers = new Map(); /* id -> { due, ms, fn, handle } */
            let timerSeq = 0,
                pauseAt = 0,
                isFrozen = false;
            function arm(id) {
                const t = timers.get(id);
                if (!t || t.handle !== null) return;
                t.due = Date.now() + t.ms;
                t.handle = setTimeout(() => {
                    timers.delete(id);
                    t.handle = null;
                    if (active) t.fn();
                }, t.ms);
            }
            function after(ms, fn, key) {
                const id = key || ++timerSeq;
                timers.set(id, { due: 0, ms: Math.max(0, ms), fn, handle: null });
                if (!isFrozen) arm(id);
                return id;
            }
            function clearTimers() {
                for (const t of timers.values()) {
                    if (t.handle !== null) clearTimeout(t.handle);
                }
                timers.clear();
                isFrozen = false;
                pauseAt = 0;
            }
            function freezeTimers() {
                if (isFrozen) return;
                isFrozen = true;
                pauseAt = Date.now();
                for (const t of timers.values()) {
                    if (t.handle !== null) {
                        clearTimeout(t.handle);
                        t.handle = null;
                        t.ms = Math.max(0, t.due - pauseAt);
                    }
                }
            }
            function resumeTimers() {
                if (!isFrozen) return;
                const shift = Date.now() - pauseAt; /* skip the paused wall-clock gap */
                isFrozen = false;
                pauseAt = 0;
                for (const [id, t] of timers) {
                    t.due += shift;
                    t.ms = Math.max(0, t.due - Date.now());
                    arm(id);
                }
            }
            function frozen() { return helpOpen || cheatsOpen || paused; }
            function syncFreeze() {
                if (frozen()) freezeTimers();
                else resumeTimers();
            }

            let seenHelp = true;
            try { seenHelp = localStorage.getItem("pairsMemoryHelpSeen") === "1"; } catch (_) { seenHelp = true; }
            if (!seenHelp) {
                helpOpen = true;
                try { localStorage.setItem("pairsMemoryHelpSeen", "1"); } catch (_) { /* storage blocked */ }
            }

            /* ---------------- rendering ---------------- */
            function cardEl(idx) {
                const shape = SHAPES[g.deck[idx]];
                const b = document.createElement("button");
                b.className = "mm-card hidden";
                b.setAttribute("aria-label", "Card " + (idx + 1));
                b.innerHTML =
                    '<span class="mm-face mm-back"><svg viewBox="0 0 48 48" width="55%" height="55%" fill="none" stroke="#c7d2fe" stroke-width="4" stroke-linecap="round" aria-hidden="true"><circle cx="24" cy="24" r="8"/><path d="M24 10v-4M24 42v-4M10 24H6M42 24h-4M14 14l-3-3M37 37l3 3M34 14l3-3M11 37l-3 3"/></svg></span>' +
                    '<span class="mm-face mm-front"><svg viewBox="0 0 48 48" width="72%" height="72%" aria-hidden="true">' +
                    shape.body +
                    "</svg></span>";
                b.addEventListener("click", () => onCard(idx, b));
                return b;
            }

            function renderGrid() {
                gridEl.innerHTML = "";
                cards.length = 0;
                for (let i = 0; i < g.deck.length; i++) {
                    const el = cardEl(i);
                    cards.push(el);
                    gridEl.appendChild(el);
                }
            }

            function syncCard(idx) {
                const el = cards[idx];
                if (!el) return;
                const open =
                    g.open.indexOf(idx) >= 0 || g.matched.indexOf(idx) >= 0;
                el.classList.toggle("hidden", !open && !cheats.peek);
                el.classList.toggle("done", g.matched.indexOf(idx) >= 0);
            }

            function renderCheats() {
                let h = "";
                for (const k of Object.keys(cheats)) {
                    const label = CHEAT_LABELS[k];
                    h += '<div class="mm-cheatrow"><span>' + label + '</span><button class="mm-switch" type="button" data-cheat="' + k + '" aria-pressed="' + (cheats[k] ? "true" : "false") + '" aria-label="' + label + '"></button></div>';
                }
                cheatGrid.innerHTML = h;
                cheatActs.innerHTML = CHEAT_ACTS
                    .map((act) => '<button class="mm-btn" type="button" data-cheatact="' + act[0] + '">' + act[1] + "</button>")
                    .join("");
            }

            function syncUI() {
                const pairs = g ? g.matched.length / 2 : 0;
                const moves = g ? g.moves : 0;
                const time = g ? Math.min(TIME_LIMIT, Math.floor(g.time)) : 0;
                hud.pairs.textContent = String(pairs);
                hud.moves.textContent = String(moves);
                hud.time.textContent = String(time);
                const left = Math.max(0, TIME_LIMIT - (g ? g.time : 0));
                barFill.style.width = (left / TIME_LIMIT) * 100 + "%";
                barEl.classList.toggle("warn", left < 20);
                timeChip.classList.toggle("warn", left < 20);

                for (let i = 0; i < cards.length; i++) syncCard(i);

                const status = paused ? "Paused" : cheatsOpen ? "Cheats open" : helpOpen ? "Guide open"
                    : phase === "start" ? "Press Start to play"
                        : phase === "over" ? (resultWin ? "Solved" : "Game over")
                            : "Finding pairs";
                hud.status.textContent = status;
                hud.status.title = status;
                statusChip.className = "mm-chip game-status" +
                    (phase === "over" ? " over" : phase === "play" ? " go" : "");

                ov.help.hidden = !helpOpen;
                ov.cheat.hidden = !cheatsOpen || helpOpen;
                ov.pause.hidden = !paused || cheatsOpen || helpOpen;
                ov.start.hidden = phase !== "start" || cheatsOpen || helpOpen || paused;
                ov.over.hidden = phase !== "over" || !overReady || cheatsOpen || helpOpen || paused;
                pauseLabel.textContent = paused ? "Resume" : "Pause";
                pbtn.setAttribute("aria-label", paused ? "Resume" : "Pause");
                pbtn.querySelector("svg").innerHTML = (paused ? ICON_PATHS.play : ICON_PATHS.pause)
                    .map((d) => '<path d="' + d + '"/>')
                    .join("");
                pbtn.disabled = phase !== "play" || !running;
                cbtn.classList.toggle("on", cheats.peek || cheats.freeze);
                renderCheats();
            }

            /* ---------------- game flow ---------------- */
            function scheduleTick() {
                after(1000, onTick, "tick");
            }

            function onTick() {
                if (!running || phase !== "play") return;
                if (!cheats.freeze) g.time += 1;
                syncUI();
                if (g.time >= TIME_LIMIT) {
                    finish(
                        false,
                        "Time ran out with " +
                        (PAIRS - g.matched.length / 2) +
                        " pairs still hidden.",
                    );
                    return;
                }
                scheduleTick();
            }

            function onCard(idx, el) {
                if (!running || busy || frozen()) return;
                const res = pick(g, idx);
                if (res.ev.type === "already" || res.ev.type === "locked") {
                    el.classList.remove("mm-shake");
                    void el.offsetWidth;
                    el.classList.add("mm-shake");
                    return;
                }
                g = res.g;
                syncCard(idx);
                if (res.ev.type === "match" || res.ev.type === "win") {
                    g.open.forEach(syncCard);
                    if (res.ev.type === "win")
                        finish(
                            true,
                            "All " + PAIRS + " pairs found in " +
                            g.moves + " moves and " +
                            Math.floor(g.time) + "s.",
                        );
                } else if (res.ev.type === "miss") {
                    busy = true;
                    const missed = g.open.slice();
                    after(750, () => {
                        g = closeMiss(g);
                        missed.forEach(syncCard);
                        busy = false;
                        if (g.moves >= MOVE_LIMIT)
                            finish(
                                false,
                                "Move budget used up with " +
                                (PAIRS - g.matched.length / 2) +
                                " pairs still hidden.",
                            );
                    });
                }
                syncUI();
            }

            function finish(win, reason) {
                running = false;
                phase = "over";
                resultWin = win;
                overReady = false;
                ovTitle.textContent = win ? "All pairs found!" : "Game over";
                ovTitle.className = "mgp-ov-title " + (win ? "mgp-win" : "mgp-lose");
                ovReason.textContent = reason;
                syncUI();
                after(600, () => {
                    overReady = true;
                    syncUI();
                });
            }

            function startGame() {
                clearTimers();
                g = newGame(Math.random);
                busy = false;
                running = true;
                wasRunning = true;
                phase = "play";
                overReady = false;
                resultWin = false;
                paused = false;
                cheatsOpen = false;
                helpOpen = false;
                renderGrid();
                syncFreeze();
                syncUI();
                scheduleTick();
            }

            /* ---------------- overlay toggles ---------------- */
            function toggleHelp(on) {
                helpOpen = typeof on === "boolean" ? on : !helpOpen;
                if (helpOpen) cheatsOpen = false;
                syncFreeze();
                syncUI();
            }
            function toggleCheats(on) {
                cheatsOpen = typeof on === "boolean" ? on : !cheatsOpen;
                if (cheatsOpen) {
                    helpOpen = false;
                    paused = false;
                }
                syncFreeze();
                syncUI();
            }
            function togglePause(on) {
                if (phase !== "play" || !running) return;
                paused = typeof on === "boolean" ? on : !paused;
                if (paused) {
                    helpOpen = false;
                    cheatsOpen = false;
                }
                syncFreeze();
                syncUI();
            }

            /* cheats only post-process state; the pure pick() rule is untouched */
            function cheatAction(key) {
                if (!g) return;
                if (key === "time") {
                    g.time = Math.max(0, g.time - 30);
                    syncUI();
                    return;
                }
                if (key === "moves") {
                    g.moves = 0;
                    syncUI();
                    return;
                }
                if (key === "pair" && phase === "play" && running && !busy) {
                    for (let a = 0; a < g.deck.length; a++) {
                        if (g.matched.indexOf(a) >= 0 || g.open.indexOf(a) >= 0) continue;
                        for (let b = a + 1; b < g.deck.length; b++) {
                            if (g.deck[a] !== g.deck[b]) continue;
                            if (g.matched.indexOf(b) >= 0 || g.open.indexOf(b) >= 0) continue;
                            let r = pick(g, a);
                            g = r.g;
                            r = pick(g, b);
                            g = r.g;
                            syncCard(a);
                            syncCard(b);
                            syncUI();
                            if (r.ev.type === "win")
                                finish(true, "All " + PAIRS + " pairs matched with a little help.");
                            return;
                        }
                    }
                }
            }

            /* ---------------- events ---------------- */
            const onKey = (e) => {
                if (!active || e.ctrlKey || e.metaKey || e.altKey) return;
                const tag = e.target ? e.target.tagName : "";
                if (tag === "INPUT" || tag === "TEXTAREA") return;
                const c = e.code;
                /* priority: help -> cheats -> pause/escape -> restart -> game actions */
                if (c === "KeyH") { toggleHelp(); e.preventDefault(); return; }
                if (c === "KeyC") {
                    if (!helpOpen && !paused) toggleCheats();
                    e.preventDefault();
                    return;
                }
                if (c === "KeyP" || c === "Escape") {
                    if (helpOpen) toggleHelp(false);
                    else if (cheatsOpen) toggleCheats(false);
                    else togglePause();
                    e.preventDefault();
                    return;
                }
                if (c === "KeyR") { startGame(); e.preventDefault(); return; }
                if (c === "Enter") {
                    if (helpOpen) toggleHelp(false);
                    else if (cheatsOpen) toggleCheats(false);
                    else if (phase !== "play") startGame();
                    e.preventDefault();
                    return;
                }
                if (frozen() || !running) return;
                if (/^[0-9]$/.test(e.key || "")) {
                    const idx = e.key === "0" ? 9 : Number(e.key) - 1;
                    if (idx < cards.length && cards[idx]) onCard(idx, cards[idx]);
                    e.preventDefault();
                }
            };
            app.addEventListener("click", (e) => {
                if (!active) return;
                const t = e.target;
                if (!t || !t.closest) return;
                if (t.closest("[data-help]")) { toggleHelp(); return; }
                if (t.closest("[data-help-close]")) { toggleHelp(false); return; }
                if (t.closest("[data-exit]")) { onExit(); return; }
                if (t.closest("[data-cheats]")) { toggleCheats(); return; }
                if (t.closest("[data-close]")) { toggleCheats(false); return; }
                if (t.closest("[data-pause]")) { togglePause(); return; }
                if (t.closest("[data-resume]")) { togglePause(false); return; }
                if (t.closest("[data-restart]")) { startGame(); return; }
                const sw = t.closest("[data-cheat]");
                if (sw) {
                    const k = sw.dataset.cheat;
                    if (Object.prototype.hasOwnProperty.call(cheats, k)) {
                        cheats[k] = !cheats[k];
                        syncUI();
                    }
                    return;
                }
                const ca = t.closest("[data-cheatact]");
                if (ca) { cheatAction(ca.dataset.cheatact); return; }
                const btn = t.closest("[data-act]");
                if (btn && btn.dataset.act === "start") startGame();
            });

            /* ---------- init ---------- */
            g = newGame(rng(7));
            renderGrid();
            syncUI();

            /* ---------- open / close ---------- */
            return {
                open() {
                    active = true;
                    document.addEventListener("keydown", onKey);
                    if (wasRunning) running = true;
                    syncFreeze();
                    syncUI();
                },
                close() {
                    active = false;
                    wasRunning = running;
                    running = false;
                    document.removeEventListener("keydown", onKey);
                    clearTimers();
                },
            };
        },
    });
})();
