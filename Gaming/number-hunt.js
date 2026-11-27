/* ==== GAME: number-hunt.js ==== */

/* =============================================================
 NUMBER GUESS - find the secret number (1-100) in 7 tries.
 Every guess earns a higher / lower hint and shrinks the
 possible-range bar. Pure SVG, no emoji, no assets.
 Layout: HUD bar + fill-height board + internal help/cheat/pause
 overlays. Classic MGP script is kept (inline icon helper below)
 so the manifest "kind" stays "mgp".
 ============================================================= */
(() => {
    "use strict";

    /* ---------- pure logic (exposed via _test) ---------- */
    const MIN = 1;
    const MAX = 100;
    const ATTEMPTS = 7;

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

    /* Random Number */
    function makeSecret(rnd) {
        return MIN + Math.floor(rnd() * (MAX - MIN + 1));
    }

    /* Higher / Lower Hint */
    function hintOf(secret, guess) {
        if (guess === secret) return "correct";
        return guess < secret ? "higher" : "lower";
    }

    /* knowledge range: [lo, hi] still possible */
    function narrow(range, guess, hint) {
        let lo = range[0],
            hi = range[1];
        if (hint === "higher") lo = Math.max(lo, guess + 1);
        if (hint === "lower") hi = Math.min(hi, guess - 1);
        return [lo, hi];
    }

    /* Attempt Counter state */
    function newGame(rnd) {
        return {
            secret: makeSecret(rnd),
            range: [MIN, MAX],
            tries: 0,
            history: [],
        };
    }

    /* apply a guess; returns { g, ev } ev.type = bad|higher|lower|correct|out */
    function guess(g, n) {
        if (
            typeof n !== "number" ||
            !isFinite(n) ||
            n < MIN ||
            n > MAX ||
            Math.floor(n) !== n
        ) {
            return { g, ev: { type: "bad" } };
        }
        if (g.tries >= ATTEMPTS) return { g, ev: { type: "out" } };
        const h = hintOf(g.secret, n);
        const g2 = {
            secret: g.secret,
            range: narrow(g.range, n, h),
            tries: g.tries + 1,
            history: g.history.concat([{ n, hint: h }]),
        };
        if (h === "correct") return { g: g2, ev: { type: "correct" } };
        if (g2.tries >= ATTEMPTS) return { g: g2, ev: { type: "out" } };
        return { g: g2, ev: { type: h } };
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
        id: "number-hunt",
        name: "Number Hunt",
        category: "casual",
        catLabel: "Casual",
        desc: "Find the secret number from 1 to 100 in 7 tries using hints.",
        art: '<svg viewBox="0 0 48 48" width="54" height="54" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="6" y="6" width="36" height="36" rx="8" fill="#0ea5e9"/><text x="24" y="30" font-size="17" font-family="inherit" font-weight="800" text-anchor="middle" fill="#fff" stroke="none">?</text><circle cx="38" cy="38" r="8" fill="#f59e0b" stroke="#92400e" stroke-width="2"/><path d="M34.5 38h7M38 34.5v7" stroke="#fff" stroke-width="2.4"/></svg>',
        bg: ["#bae6fd", "#7dd3fc"],
        _test: {
            MIN,
            MAX,
            ATTEMPTS,
            rng,
            makeSecret,
            hintOf,
            narrow,
            newGame,
            guess,
        },
        build(app, context) {
            const ctx = context || {};
            const onExit = typeof ctx.onExit === "function" ? ctx.onExit : function () {
                const b = typeof document !== "undefined" && document.getElementById
                    ? document.getElementById("closeGameButton") : null;
                if (b && typeof b.click === "function") b.click();
            };
            app.classList.add("game-app", "ng", "game-fill");

            /* ---------- shell: HUD bar + fill-height board + overlays ---------- */
            app.innerHTML = `
<style>
#number-hunt-app [hidden]{display:none!important}
#number-hunt-app.ng{--panel:#111a33;--court:#0b1020;--line:#ffffff1f;--ink:#e5e7eb;--mut:#9ca3af;--acc:#60a5fa;--warn:#fde047;--danger:#fb7185;display:flex;flex-direction:column;gap:8px;min-height:0;color:var(--ink)}
#number-hunt-app.ng *{box-sizing:border-box}
#number-hunt-app .ng-hud{display:flex;align-items:center;gap:8px;flex-wrap:wrap;font:600 11px/1 ui-monospace,SFMono-Regular,Menlo,monospace}
#number-hunt-app .ng-chip{display:inline-flex;align-items:center;gap:6px;min-height:32px;padding:5px 9px;border:1px solid var(--line);border-radius:999px;background:var(--panel);color:var(--mut);white-space:nowrap}
#number-hunt-app .ng-chip b{color:var(--ink);font-variant-numeric:tabular-nums}
#number-hunt-app .ng-chip[data-hud="secret"]{color:#fbbf24;border-color:#f59e0b55}
#number-hunt-app .ng-chip[data-hud="status"]{max-width:210px;overflow:hidden;text-overflow:ellipsis}
#number-hunt-app .ng-chip .game-status-dot{width:7px;height:7px;border-radius:50%;background:var(--acc);flex:none}
#number-hunt-app .ng-chip.go .game-status-dot{background:#6ee7b7}
#number-hunt-app .ng-chip.over .game-status-dot{background:var(--danger)}
#number-hunt-app .ng-spacer{flex:1 1 auto}
#number-hunt-app .ng-btn{appearance:none;border:1px solid var(--line);background:var(--panel);color:var(--ink);border-radius:9px;min-height:36px;padding:0 11px;font:inherit;font-size:11px;font-weight:700;letter-spacing:.04em;cursor:pointer;touch-action:manipulation;user-select:none;-webkit-user-select:none}
#number-hunt-app .ng-btn:hover:not(:disabled){border-color:var(--acc);color:var(--acc)}
#number-hunt-app .ng-btn:disabled{opacity:.4;cursor:default}
#number-hunt-app .ng-btn.acc{border-color:var(--acc);color:var(--acc)}
#number-hunt-app .ng-btn.on{border-color:var(--warn);color:var(--warn)}
#number-hunt-app .ng-icon-btn{display:inline-flex;align-items:center;gap:6px}
#number-hunt-app .ng-icon-btn svg{flex:none;display:block}
#number-hunt-app.ng.game-fill > .ng-board{position:relative;width:100%;flex:1 1 auto;min-height:0;aspect-ratio:auto;border:1px solid var(--line);border-radius:12px;background:var(--court);overflow:hidden;padding:0;display:flex;align-items:center;justify-content:center}
#number-hunt-app .ng-wrap{width:min(100%,430px);height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:12px 10px;text-align:center;overflow:auto;scrollbar-width:none}
#number-hunt-app .ng-wrap::-webkit-scrollbar{display:none}
#number-hunt-app .ng-disp{font-size:clamp(40px,12vw,56px);font-weight:800;color:#fff;line-height:1.1;margin:4px 0 8px;min-height:56px;font-variant-numeric:tabular-nums}
#number-hunt-app .ng-hint{min-height:26px;display:flex;justify-content:center;align-items:center;gap:8px;font-weight:700;font-size:15px;line-height:1.4;color:#e5e7eb}
#number-hunt-app .ng-hint.up{color:#34d399}
#number-hunt-app .ng-hint.down{color:#f87171}
#number-hunt-app .ng-hint.ok{color:#34d399}
#number-hunt-app .ng-range{position:relative;height:26px;border-radius:13px;background:#ffffff14;margin:12px 0 4px;width:100%;overflow:hidden}
#number-hunt-app .ng-range i{position:absolute;top:0;bottom:0;background:linear-gradient(90deg,#0ea5e9,#22d3ee);transition:left .2s,width .2s}
#number-hunt-app .ng-range span{position:absolute;top:0;bottom:0;display:flex;align-items:center;padding:0 8px;font-size:11.5px;font-weight:700;color:#c7d2fe}
#number-hunt-app .ng-tries{display:flex;justify-content:center;gap:6px;margin:12px 0}
#number-hunt-app .ng-tries i{width:12px;height:12px;border-radius:50%;background:#ffffff1c;border:1px solid #ffffff2e}
#number-hunt-app .ng-tries i.used{background:#f59e0b;border-color:#b45309}
#number-hunt-app .ng-hist{display:flex;justify-content:center;flex-wrap:wrap;gap:6px;margin-top:8px;min-height:30px}
#number-hunt-app .ng-hist b{display:inline-flex;align-items:center;gap:4px;padding:4px 9px;border-radius:999px;background:#ffffff10;font-size:13px;color:#dbe1ea}
#number-hunt-app .ng-pad{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:8px;margin-top:12px;width:100%}
#number-hunt-app .ng-key{min-height:44px;border:0;border-radius:10px;padding:0;background:#ffffff14;color:#fff;font-weight:800;font-size:16px;cursor:pointer;transition:background .15s}
#number-hunt-app .ng-key:hover{background:#ffffff24}
#number-hunt-app .ng-key:active,#number-hunt-app .ng-key.go{background:#0ea5e9}
#number-hunt-app .ng-key.wide{grid-column:span 2}
#number-hunt-app :is(button):focus-visible{outline:2px solid #7aa7ff;outline-offset:2px}
#number-hunt-app .ng-shake{animation:ng-shake .3s ease}
@keyframes ng-shake{0%,100%{transform:translateX(0)}30%{transform:translateX(-6px)}70%{transform:translateX(6px)}}
#number-hunt-app .ng-ov{position:absolute;inset:0;z-index:5;display:flex;align-items:center;justify-content:center;padding:14px;background:rgba(11,16,32,.86);backdrop-filter:blur(3px)}
#number-hunt-app .ng-card{width:min(520px,100%);max-height:100%;display:flex;flex-direction:column;gap:12px;padding:16px;border:1px solid var(--line);border-radius:12px;background:var(--panel);overflow:hidden;text-align:center}
#number-hunt-app .mgp-ov-title{margin:0;font-size:17px}
#number-hunt-app .mgp-win{color:var(--acc)}
#number-hunt-app .mgp-lose{color:var(--danger)}
#number-hunt-app .ng-sub{font-size:12px;line-height:1.55;color:var(--mut);margin:0}
#number-hunt-app .ng-head{display:flex;align-items:center;justify-content:space-between;gap:10px;flex:none;text-align:left}
#number-hunt-app .ng-foot{display:flex;align-items:center;justify-content:space-between;gap:10px;flex:none;text-align:left}
#number-hunt-app .ng-cheats,#number-hunt-app .ng-help{display:grid;gap:8px;flex:1 1 auto;min-height:0;overflow:auto}
#number-hunt-app .ng-cheats{grid-template-columns:repeat(auto-fit,minmax(150px,1fr))}
#number-hunt-app .ng-help{grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:14px;text-align:left}
#number-hunt-app .ng-help b{display:block;margin-bottom:5px;color:var(--mut);font-size:10px;letter-spacing:.1em;text-transform:uppercase}
#number-hunt-app .ng-help ul{margin:0 0 10px;padding-left:16px;color:var(--mut);font-size:12px;line-height:1.6}
#number-hunt-app .ng-kbd{display:inline-block;padding:1px 5px;border:1px solid var(--line);border-bottom-width:2px;border-radius:5px;background:var(--court);color:var(--ink);font:inherit}
#number-hunt-app .ng-note{color:var(--mut);font-size:11px;line-height:1.5}
#number-hunt-app .ng-cheatrow{display:flex;align-items:center;justify-content:space-between;gap:10px;min-height:44px;padding:8px 10px;border:1px solid var(--line);border-radius:10px;background:var(--court);font-size:12px;text-align:left}
#number-hunt-app .ng-switch{position:relative;width:40px;height:22px;border-radius:999px;border:1px solid var(--line);background:var(--court);cursor:pointer;flex:none;padding:0}
#number-hunt-app .ng-switch:after{content:"";position:absolute;top:2px;left:2px;width:16px;height:16px;border-radius:50%;background:var(--mut)}
#number-hunt-app .ng-switch[aria-pressed="true"]{border-color:var(--acc);background:rgba(96,165,250,.15)}
#number-hunt-app .ng-switch[aria-pressed="true"]:after{left:20px;background:var(--acc)}
@media (prefers-reduced-motion:reduce){#number-hunt-app *{animation:none!important;transition:none!important}}
/* --- layout redesign overrides (keep last) --- */
#number-hunt-app.ng.game-fill > .ng-board{flex:1 1 auto;min-height:0;aspect-ratio:auto}
@media (max-width:640px){
#number-hunt-app.ng.game-fill > .ng-board:not(:has(.ng-ov:not([hidden]))){aspect-ratio:4/3;flex:0 0 auto;min-height:min(70dvh,620px)}
#number-hunt-app.ng.game-fill > .ng-board:has(.ng-ov:not([hidden])){aspect-ratio:auto;flex:0 0 auto;min-height:min(70dvh,620px)}
#number-hunt-app .ng-hud{gap:5px}
#number-hunt-app .ng-chip{padding:4px 6px;min-height:0;font-size:9px}
#number-hunt-app .ng-chip[data-hud="status"]{max-width:130px}
#number-hunt-app .ng-btn{min-height:32px;padding:5px 9px;font-size:9px}
#number-hunt-app .ng-icon-btn .ng-btn-label,#number-hunt-app .ng-spacer{display:none}
#number-hunt-app .ng-wrap{padding:10px;justify-content:flex-start}
#number-hunt-app .ng-disp{font-size:clamp(36px,11vw,52px);min-height:48px}
#number-hunt-app .ng-hint{font-size:13px}
#number-hunt-app .ng-range{margin:10px 0 4px}
#number-hunt-app .ng-tries{margin:10px 0}
#number-hunt-app .ng-hist b{font-size:12px;padding:4px 8px}
#number-hunt-app .ng-pad{gap:6px;margin-top:10px}
#number-hunt-app .ng-key{font-size:15px;min-height:42px}
#number-hunt-app .ng-ov{padding:8px}
#number-hunt-app .ng-card{width:100%;height:100%;max-height:100%;padding:12px;border-radius:12px}
#number-hunt-app .ng-cheats,#number-hunt-app .ng-help{scrollbar-width:none}
#number-hunt-app .ng-cheats::-webkit-scrollbar,#number-hunt-app .ng-help::-webkit-scrollbar{display:none}
#number-hunt-app .ng-foot{position:static;margin:0;padding:10px 0 0;border-top:1px solid var(--line)}
#number-hunt-app .ng-note{display:none}
}
@media (pointer:coarse){
#number-hunt-app.ng .ng-hud .ng-btn{min-height:32px;padding:5px 9px;font-size:9px}
}
</style>
<div class="ng-hud">
  <span class="ng-chip game-status" data-chip="status"><i class="game-status-dot"></i><span data-hud="status">Press Start to play</span></span>
  <span class="ng-chip">TRIES <b data-hud="tries">0</b>/${ATTEMPTS}</span>
  <span class="ng-chip">LEFT <b data-hud="left">${ATTEMPTS}</b></span>
  <span class="ng-chip">RANGE <b data-hud="range">${MIN}-${MAX}</b></span>
  <span class="ng-chip" data-chip="secret" hidden>SECRET <b data-hud="secret">--</b></span>
  <span class="ng-spacer"></span>
  <button class="ng-btn ng-icon-btn" type="button" data-help aria-label="How to play" title="How to play (H)">${iconSVG("helpCircle", 14)}<span class="ng-btn-label">Help</span></button>
  <button class="ng-btn ng-icon-btn" type="button" data-cheats aria-label="Cheats" title="Cheats (C)">${iconSVG("wrench", 14)}<span class="ng-btn-label">Cheats</span></button>
  <button class="ng-btn ng-icon-btn" type="button" data-pause aria-label="Pause" title="Pause (P)">${iconSVG("pause", 14)}<span class="ng-btn-label" data-label="pause">Pause</span></button>
  <button class="ng-btn ng-icon-btn" type="button" data-restart aria-label="Restart" title="Restart (R)">${iconSVG("refresh", 14)}<span class="ng-btn-label">Restart</span></button>
  <button class="ng-btn ng-icon-btn" type="button" data-exit aria-label="Exit game" title="Exit game">${iconSVG("logOut", 14)}<span class="ng-btn-label">Exit</span></button>
</div>
<section class="game-panel ng-board" data-board>
  <div class="ng-wrap" data-wrap>
    <div class="ng-disp" data-disp>--</div>
    <div class="ng-hint" data-hintline>Guess the secret number</div>
    <div class="ng-range" data-bar><i data-fill style="left:0;width:100%"></i><span data-lo style="left:6px">1</span><span data-hi style="right:6px">100</span></div>
    <div class="ng-tries" data-tries></div>
    <div class="ng-hist" data-hist></div>
    <div class="ng-pad" data-pad>
      <button class="ng-key" type="button" data-k="1">1</button><button class="ng-key" type="button" data-k="2">2</button><button class="ng-key" type="button" data-k="3">3</button>
      <button class="ng-key" type="button" data-k="4">4</button><button class="ng-key" type="button" data-k="5">5</button><button class="ng-key" type="button" data-k="6">6</button>
      <button class="ng-key" type="button" data-k="7">7</button><button class="ng-key" type="button" data-k="8">8</button><button class="ng-key" type="button" data-k="9">9</button>
      <button class="ng-key" type="button" data-k="0">0</button><button class="ng-key" type="button" data-k="del">DEL</button><button class="ng-key go" type="button" data-k="ok">OK</button>
    </div>
  </div>
  <div class="ng-ov" data-ov="start">
    <div class="ng-card">
      <div class="ng-head"><h2 class="mgp-ov-title">Number Hunt</h2><span class="ng-note">1&ndash;100 &middot; ${ATTEMPTS} tries</span></div>
      <p class="ng-sub">I picked a secret number between 1 and 100. Each guess tells you to go higher or lower, and the bar shows every number still possible. Find it in ${ATTEMPTS} tries.</p>
      <div class="ng-foot"><button class="ng-btn" type="button" data-help>How to play</button><button class="ng-btn acc" type="button" data-act="start">Start game</button></div>
    </div>
  </div>
  <div class="ng-ov" data-ov="over" hidden>
    <div class="ng-card">
      <div class="ng-head"><h2 class="mgp-ov-title" data-ov="title">Game over</h2><span class="ng-note">Press R to replay</span></div>
      <p class="ng-sub" data-ov="reason"></p>
      <div class="ng-foot"><span class="ng-note">Press H to reopen the guide</span><button class="ng-btn acc" type="button" data-act="start">Play again</button></div>
    </div>
  </div>
  <div class="ng-ov" data-ov="pause" hidden>
    <div class="ng-card">
      <div class="ng-head"><h3>Paused</h3></div>
      <p class="ng-sub">The game and its timers are frozen. Your guesses and the possible range are kept when you resume.</p>
      <div class="ng-foot"><span class="ng-note">Press P or Esc to resume</span><button class="ng-btn acc" type="button" data-resume>Resume</button></div>
    </div>
  </div>
  <div class="ng-ov" data-ov="cheat" hidden>
    <div class="ng-card">
      <div class="ng-head"><h3>Cheats</h3><button class="ng-btn" type="button" data-close aria-label="Close cheats">${iconSVG("x", 14)}</button></div>
      <div class="ng-cheats" data-cheatgrid></div>
      <div class="ng-cheats" data-cheatacts></div>
      <div class="ng-foot"><span class="ng-note">Toggles apply immediately</span><button class="ng-btn" type="button" data-close>Done</button></div>
    </div>
  </div>
  <div class="ng-ov" data-ov="help" hidden>
    <div class="ng-card">
      <div class="ng-head"><h3>How to play</h3><button class="ng-btn" type="button" data-help-close aria-label="Close help">${iconSVG("x", 14)}</button></div>
      <div class="ng-help">
        <div>
          <b>Desktop</b>
          <ul>
            <li>Type <span class="ng-kbd">1</span>&ndash;<span class="ng-kbd">0</span> or press the on-screen keypad, then <span class="ng-kbd">Enter</span> to submit.</li>
            <li><span class="ng-kbd">Backspace</span> deletes the last digit. Start near 50 - every hint halves the possibilities.</li>
            <li><span class="ng-kbd">H</span> help &middot; <span class="ng-kbd">C</span> cheats &middot; <span class="ng-kbd">P</span> pause &middot; <span class="ng-kbd">R</span> restart.</li>
          </ul>
          <b>Mobile</b>
          <ul>
            <li>Tap the number keys and OK. The HUD buttons handle help, cheats, pause, restart and exit.</li>
          </ul>
        </div>
        <div>
          <b>Rules</b>
          <ul>
            <li>You have ${ATTEMPTS} tries to find the secret number from ${MIN} to ${MAX}.</li>
            <li>Each wrong guess tells you whether the secret is higher or lower and shrinks the highlighted bar to the numbers still possible.</li>
          </ul>
          <div class="ng-foot"><span class="ng-note">Press H to reopen this guide</span><button class="ng-btn acc" type="button" data-help-close>Got it</button></div>
        </div>
      </div>
    </div>
  </div>
</section>`;

            /* ---------------- refs ---------------- */
            const $ = (s, r) => (r || app).querySelector(s);
            const board = $("[data-board]");
            const dispEl = $("[data-disp]");
            const hintEl = $("[data-hintline]");
            const fillEl = $("[data-fill]");
            const loEl = $("[data-lo]");
            const hiEl = $("[data-hi]");
            const triesEl = $("[data-tries]");
            const histEl = $("[data-hist]");
            const wrapEl = $("[data-wrap]");
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
                tries: $('[data-hud="tries"]'),
                left: $('[data-hud="left"]'),
                range: $('[data-hud="range"]'),
                secret: $('[data-hud="secret"]'),
            };
            const statusChip = $('[data-chip="status"]');
            const secretChip = $('[data-chip="secret"]');
            const pbtn = $("[data-pause]");
            const cbtn = $("[data-cheats]");
            const pauseLabel = $('[data-label="pause"]');

            const UP =
                '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 19V5M5 12l7-7 7 7"/></svg>';
            const DOWN =
                '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 5v14M19 12l-7 7-7-7"/></svg>';
            const CHECK =
                '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6L9 17l-5-5"/></svg>';

            /* ---------------- state ---------------- */
            let g = null;
            let running = false,
                wasRunning = false,
                active = false;
            let entry = "";
            let phase = "start"; /* start | play | over */
            let overReady = false,
                resultWin = false;
            let paused = false,
                cheatsOpen = false,
                helpOpen = false;
            const cheats = { reveal: false, quickNarrow: false };
            const CHEAT_LABELS = {
                reveal: "Reveal the secret number",
                quickNarrow: "Auto-narrow range after each guess",
            };
            const CHEAT_ACTS = [
                ["hint", "Suggest a guess"],
                ["refill", "Refill tries (reset to 0)"],
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
            function after(ms, fn) {
                const id = ++timerSeq;
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
            try { seenHelp = localStorage.getItem("numberHuntHelpSeen") === "1"; } catch (_) { seenHelp = true; }
            if (!seenHelp) {
                helpOpen = true;
                try { localStorage.setItem("numberHuntHelpSeen", "1"); } catch (_) { /* storage blocked */ }
            }

            /* ---------------- rendering ---------------- */
            function renderCheats() {
                let h = "";
                for (const k of Object.keys(cheats)) {
                    const label = CHEAT_LABELS[k];
                    h += '<div class="ng-cheatrow"><span>' + label + '</span><button class="ng-switch" type="button" data-cheat="' + k + '" aria-pressed="' + (cheats[k] ? "true" : "false") + '" aria-label="' + label + '"></button></div>';
                }
                cheatGrid.innerHTML = h;
                let a = "";
                for (const act of CHEAT_ACTS) {
                    a += '<button class="ng-btn" type="button" data-cheatact="' + act[0] + '">' + act[1] + "</button>";
                }
                cheatActs.innerHTML = a;
            }

            function syncUI() {
                const tries = g ? g.tries : 0;
                const range = g ? g.range : [MIN, MAX];
                hud.tries.textContent = String(tries);
                hud.left.textContent = String(Math.max(0, ATTEMPTS - tries));
                hud.range.textContent = range[0] + "-" + range[1];
                fillEl.style.left = ((range[0] - MIN) / (MAX - MIN)) * 100 + "%";
                fillEl.style.width = (Math.max(0, range[1] - range[0] + 1) / (MAX - MIN)) * 100 + "%";
                loEl.textContent = range[0];
                hiEl.textContent = range[1];
                let dots = "";
                for (let i = 0; i < ATTEMPTS; i++)
                    dots += "<i class='" + (i < tries ? "used" : "") + "'></i>";
                triesEl.innerHTML = dots;
                histEl.innerHTML = g
                    ? g.history
                        .map(
                            (item) =>
                                "<b>" +
                                item.n +
                                (item.hint === "higher"
                                    ? UP
                                    : item.hint === "lower"
                                        ? DOWN
                                        : CHECK) +
                                "</b>",
                        )
                        .join("")
                    : "";

                secretChip.hidden = !cheats.reveal;
                hud.secret.textContent = g ? String(g.secret) : "--";
                const status = paused ? "Paused" : cheatsOpen ? "Cheats open" : helpOpen ? "Guide open"
                    : phase === "start" ? "Press Start to play"
                        : phase === "over" ? (resultWin ? "Solved" : "Out of tries")
                            : "Guess the number";
                hud.status.textContent = status;
                hud.status.title = status;
                statusChip.className = "ng-chip game-status" +
                    (phase === "over" ? " over" : phase === "play" ? " go" : "");

                ov.start.hidden = phase !== "start" || cheatsOpen || helpOpen || paused;
                ov.over.hidden = phase !== "over" || !overReady || cheatsOpen || helpOpen || paused;
                ov.pause.hidden = !paused || cheatsOpen || helpOpen;
                ov.cheat.hidden = !cheatsOpen || helpOpen;
                ov.help.hidden = !helpOpen;
                pauseLabel.textContent = paused ? "Resume" : "Pause";
                pbtn.setAttribute("aria-label", paused ? "Resume" : "Pause");
                pbtn.querySelector("svg").innerHTML = (paused ? ICON_PATHS.play : ICON_PATHS.pause)
                    .map((d) => '<path d="' + d + '"/>')
                    .join("");
                pbtn.disabled = phase !== "play" || !running;
                cbtn.classList.toggle("on", cheats.reveal || cheats.quickNarrow);
                renderCheats();
            }

            function setHint(text, cls) {
                hintEl.className = "ng-hint" + (cls ? " " + cls : "");
                hintEl.innerHTML = text;
            }

            /* ---------------- game flow ---------------- */
            function finish(win, reason) {
                running = false;
                phase = "over";
                resultWin = win;
                overReady = false;
                ovTitle.textContent = win ? "You got it!" : "Out of tries";
                ovTitle.className = "mgp-ov-title " + (win ? "mgp-win" : "mgp-lose");
                ovReason.textContent = reason;
                syncUI();
                after(600, () => {
                    overReady = true;
                    syncUI();
                });
            }

            function submit() {
                if (!running || frozen() || !entry) return;
                const n = parseInt(entry, 10);
                const res = guess(g, n);
                if (res.ev.type === "bad") {
                    wrapEl.classList.remove("ng-shake");
                    void wrapEl.offsetWidth;
                    wrapEl.classList.add("ng-shake");
                    setHint("Pick a whole number from 1 to 100", "");
                    return;
                }
                g = res.g;
                entry = "";
                dispEl.textContent = n;
                /* cheats only post-process state; the pure guess() rule is untouched */
                if (cheats.quickNarrow && g.range[0] < g.secret && g.range[1] > g.secret) {
                    g.range = [
                        Math.max(MIN, g.secret - 3),
                        Math.min(MAX, g.secret + 3),
                    ];
                }
                syncUI();
                if (res.ev.type === "correct") {
                    setHint(CHECK + " " + n + " is the secret number!", "ok");
                    finish(
                        true,
                        "Found " + g.secret + " in " + g.tries + " " + (g.tries === 1 ? "try" : "tries") + ". Great narrowing!",
                    );
                } else if (res.ev.type === "out") {
                    const h = g.history[g.history.length - 1].hint;
                    setHint(
                        (h === "higher" ? UP : DOWN) + " The secret is " + h + " than " + n,
                        h === "higher" ? "up" : "down",
                    );
                    finish(
                        false,
                        "The secret number was " + g.secret + ". Better first guesses narrow the range faster.",
                    );
                } else {
                    setHint(
                        (res.ev.type === "higher" ? UP : DOWN) + " The secret is " + res.ev.type + " than " + n,
                        res.ev.type === "higher" ? "up" : "down",
                    );
                }
            }

            function press(k) {
                if (!running || frozen()) return;
                if (k === "ok") {
                    submit();
                    return;
                }
                if (k === "del") {
                    entry = entry.slice(0, -1);
                    dispEl.textContent = entry || "--";
                    return;
                }
                if (entry.length < 3) {
                    entry += k;
                    dispEl.textContent = entry;
                }
            }

            function startGame() {
                clearTimers();
                g = newGame(Math.random);
                entry = "";
                running = true;
                wasRunning = true;
                phase = "play";
                overReady = false;
                resultWin = false;
                paused = false;
                cheatsOpen = false;
                helpOpen = false;
                dispEl.textContent = "--";
                setHint("Guess the secret number", "");
                syncFreeze();
                syncUI();
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
            function cheatAction(key) {
                if (!g) return;
                if (key === "hint") {
                    const mid = Math.floor((g.range[0] + g.range[1]) / 2);
                    setHint("Try " + mid + " - it splits the remaining range", "");
                    return;
                }
                if (key === "refill" && phase === "play") {
                    g.tries = 0;
                    setHint("Tries refilled - keep guessing", "");
                    syncUI();
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
                    else press("ok");
                    e.preventDefault();
                    return;
                }
                if (frozen()) return;
                if (/^[0-9]$/.test(e.key || "")) press(e.key);
                else if (e.key === "Backspace") {
                    e.preventDefault();
                    press("del");
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
                const key = t.closest("[data-k]");
                if (key) { press(key.dataset.k); return; }
                const btn = t.closest("[data-act]");
                if (btn && btn.dataset.act === "start") startGame();
            });

            /* ---------- init ---------- */
            g = newGame(rng(3));
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
