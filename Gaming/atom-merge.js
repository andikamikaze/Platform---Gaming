/* ==== GAME: atom-merge.js ====
   Atom Merge - turn-based Suika-style merge puzzle: H > He > Li > Be > B > C.
   Register its metadata + module path in GAMES inside app.js.

   Modes
   - "ai"   : offline vs bot. Random starting player each game. Cheats enabled.
   - "room" : online, host-authoritative. Random seat (P1/P2) assignment for
              the host + random starting player each game.

   The drop queue is NOT random: a fixed pair cycle (H,H,He,He,Li,Li) keeps
   every game solvable up to Carbon. Randomness is limited to seats, starter
   and a small bot aiming jitter. No tutorial text, no virtual d-pad:
   mouse/keyboard on desktop, drag + release on touch.
*/

import { iconSVG } from "../JS/icons.js";

export const META = {
    id: "atom-merge",
    name: "Atom Merge",
    category: "puzzle",
    catLabel: "Puzzle",
    desc: "Drop and merge atoms from Hydrogen up to Carbon without overflowing.",
    art: `<svg viewBox="0 0 48 48" width="54" height="54" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="9" cy="15" r="7"/><circle cx="16" cy="28" r="7"/><path d="M23 24h7"/><path d="M27.5 20.5 31.5 24l-4 3.5"/><circle cx="38.5" cy="24" r="9"/><text x="9" y="15" dy=".35em" font-size="7" font-family="inherit" text-anchor="middle" fill="currentColor" stroke="none">H</text><text x="16" y="28" dy=".35em" font-size="7" font-family="inherit" text-anchor="middle" fill="currentColor" stroke="none">H</text><text x="38.5" y="24" dy=".35em" font-size="8" font-weight="700" font-family="inherit" text-anchor="middle" fill="currentColor" stroke="none">He</text></svg>`,
    bg: ["#cffafe", "#a5f3fc"],
};

export function mount(root, context = {}) {
    const { mode = "ai", room = null, playerName = "Player", onExit = () => { } } = context;
    const online = mode === "room" && Boolean(room);
    const isHost = !online || room.isHost;
    const isGuest = online && !room.isHost;
    let roomData = room?.room || null;
    let state = null;

    /* ---------- constants + pure physics (no DOM) ---------- */
    const ELEMENTS = [
        { symbol: "H", radius: 14, color: "#f2a0a0", ink: "#c05050", score: 10 },
        { symbol: "He", radius: 18, color: "#f2cd84", ink: "#b07d2a", score: 20 },
        { symbol: "Li", radius: 22, color: "#bcd98f", ink: "#6d8f3a", score: 30 },
        { symbol: "Be", radius: 26, color: "#8fd8b8", ink: "#2f8f6b", score: 40 },
        { symbol: "B", radius: 30, color: "#8fd2e0", ink: "#2f8fa3", score: 50 },
        { symbol: "C", radius: 34, color: "#b9a7ee", ink: "#7a5fc0", score: 60 },
    ];
    const SEQ = [0, 0, 1, 1, 2, 2]; // deterministic, always-solvable pair cycle
    const W = 520, L = 10, R = 510, FLOOR = 410, DANGER_Y = 88, DROP_Y = 42;
    const GRAV = 1500, REST_W = 0.45, REST_P = 0.4, ITER = 6, SUBSTEPS = 2;
    const AGE_GATE = 0.25, SETTLE_V = 45, DANGER_T = 2.5;
    const BOT_SEAT = 1;

    const clampAim = (x, r) => Math.max(L + r + 2, Math.min(R - r - 2, x));

    function clampWall(a) {
        const r = ELEMENTS[a.el].radius;
        if (a.x < L + r) { a.x = L + r; if (a.vx < 0) a.vx = -a.vx * REST_W; }
        if (a.x > R - r) { a.x = R - r; if (a.vx > 0) a.vx = -a.vx * REST_W; }
        if (a.y > FLOOR - r) { a.y = FLOOR - r; if (a.vy > 0) a.vy = -a.vy * REST_W; a.vx *= 0.94; }
        if (a.y < r + 2) { a.y = r + 2; if (a.vy < 0) a.vy = -a.vy * REST_W; }
    }

    /* Deterministic advance (no DOM, no random). Same-element pairs older than
       AGE_GATE skip collision so they can sink into each other and merge. */
    function stepPhysics(atoms, dt, grav) {
        for (let i = 0; i < atoms.length; i++) {
            const a = atoms[i];
            a.vy += grav * dt;
            a.x += a.vx * dt;
            a.y += a.vy * dt;
            a.age += dt;
        }
        for (let it = 0; it < ITER; it++) {
            for (let i = 0; i < atoms.length; i++) {
                for (let j = i + 1; j < atoms.length; j++) {
                    const a = atoms[i], b = atoms[j];
                    if (a.el === b.el && a.age > AGE_GATE && b.age > AGE_GATE) continue;
                    const ra = ELEMENTS[a.el].radius, rb = ELEMENTS[b.el].radius;
                    const min = ra + rb;
                    let dx = b.x - a.x, dy = b.y - a.y;
                    let d2 = dx * dx + dy * dy;
                    if (d2 === 0) { dx = 0.01; dy = 0.01; d2 = 0.0002; }
                    if (d2 >= min * min) continue;
                    const d = Math.sqrt(d2);
                    const nx = dx / d, ny = dy / d;
                    const overlap = min - d;
                    const ma = ra * ra, mb = rb * rb, tot = ma + mb;
                    a.x -= nx * overlap * (mb / tot);
                    a.y -= ny * overlap * (mb / tot);
                    b.x += nx * overlap * (ma / tot);
                    b.y += ny * overlap * (ma / tot);
                    if (it === 0) {
                        const rvn = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
                        if (rvn < 0) {
                            const imp = (-(1 + REST_P) * rvn) / (1 / ma + 1 / mb);
                            a.vx -= (imp * nx) / ma;
                            a.vy -= (imp * ny) / ma;
                            b.vx += (imp * nx) / mb;
                            b.vy += (imp * ny) / mb;
                        }
                    }
                }
            }
            for (let i = 0; i < atoms.length; i++) clampWall(atoms[i]);
        }
        return atoms;
    }

    /* ---------- shell (minimalist, no tutorial, no virtual d-pad) ---------- */
    root.innerHTML = `
<style>
.am{display:flex;flex-direction:column;gap:10px}
.am-app{color:#e5e9f0}
.am [hidden]{display:none!important}
.am :where(h2){margin:0;font-size:1.05rem;font-weight:650;letter-spacing:.02em}
.am :where(.game-intro){display:flex;align-items:center;justify-content:space-between;gap:10px}
.am :where(.game-actions){display:flex;gap:8px;flex-wrap:wrap}
.am :where(.game-action-button){padding:8px 14px;border-radius:10px;border:1px solid rgba(128,128,128,.35);background:transparent;color:inherit;font:inherit;font-size:.8rem;cursor:pointer}
.am-hud{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin-bottom:8px}
.am-spacer{flex:1 1 auto}
.am-app .am-hbtn{display:inline-flex;align-items:center;gap:6px;padding:5px 9px;min-height:30px;border:1px solid rgba(128,128,128,.35);border-radius:8px;background:transparent;color:inherit;font:inherit;font-size:11px;font-weight:700;cursor:pointer;touch-action:manipulation}
.am-app .am-hbtn svg{flex:none;display:block}
.am-app .am-hbtn.on{border-color:#34d399;color:#34d399}
.am-app .am-hbtn:disabled{opacity:.4;cursor:default}
.am-help{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px;text-align:left}
.am-help b{display:block;margin-bottom:4px;font-size:11px;letter-spacing:.08em;text-transform:uppercase;opacity:.6}
.am-help ul{margin:0 0 10px;padding-left:16px;font-size:12px;line-height:1.6;opacity:.8}
.am-meta{display:flex;align-items:stretch;justify-content:space-between;gap:10px;flex-wrap:wrap}
.am-player{display:flex;align-items:center;gap:8px;padding:6px 10px;border:1px solid rgba(128,128,128,.25);border-radius:12px;min-width:168px;transition:border-color .2s}
.am-player.is-active{border-color:currentColor}
.am-pdot{width:7px;height:7px;border-radius:50%;background:rgba(128,128,128,.35);flex:none}
.am-player.is-active .am-pdot{background:#34d399}
.am-pseat{font-size:.6rem;letter-spacing:.12em;opacity:.5;flex:none}
.am-pname{font-weight:600;font-size:.82rem;max-width:110px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.am-pscore{margin-left:auto;font-variant-numeric:tabular-nums;font-weight:700;font-size:.9rem}
.am-pbest{font-size:.7rem;font-weight:700;padding:2px 8px;border-radius:999px;background:rgba(128,128,128,.15);color:inherit}
.am-queue{display:flex;gap:16px;align-items:center;justify-content:center;padding:0 6px}
.am-q{display:flex;flex-direction:column;align-items:center;gap:1px}
.am-q em{font-style:normal;font-size:.6rem;text-transform:uppercase;letter-spacing:.14em;opacity:.5}
.am-q b{font-size:.95rem}
.am-tiers{display:flex;align-items:center;gap:6px;flex-wrap:wrap}
.am-tier{display:flex;flex-direction:column;align-items:center;min-width:44px;padding:4px 8px;border:1px solid rgba(128,128,128,.22);border-radius:10px;opacity:.4;transition:opacity .2s,border-color .2s}
.am-tier b{font-size:.85rem;line-height:1.1}
.am-tier i{font-style:normal;font-size:.58rem;opacity:.6}
.am-tier.is-reached{opacity:1}
.am-tier.is-current{border-color:currentColor}
.am-sep{opacity:.3;font-size:.7rem}
.am .game-panel{position:relative;padding:0;overflow:hidden;display:flex;align-items:center;justify-content:center;min-height:0}
.am-svg{display:block;width:100%;height:auto;aspect-ratio:520/420;max-height:100%;margin:0 auto;touch-action:none;-webkit-user-select:none;user-select:none}
.am-svg.is-mine{cursor:crosshair}
.am-arena{fill:rgba(128,128,128,.05);stroke:rgba(128,128,128,.4);stroke-width:1.5}
.am-danger{stroke:#e07070;stroke-width:1.2;stroke-dasharray:5 6;opacity:.5}
.am-guide{stroke:currentColor;opacity:.25;stroke-width:1;stroke-dasharray:3 7}
.am-skin{stroke:rgba(0,0,0,.18);stroke-width:1.5}
.am-sym{fill:#20263b;font-weight:700;pointer-events:none;font-family:inherit}
.am-pop{transform-box:fill-box;transform-origin:center;animation:am-pop .3s ease-out}
@keyframes am-pop{0%{transform:scale(.4)}60%{transform:scale(1.12)}100%{transform:scale(1)}}
.am-warn .am-skin{stroke:#e07070;stroke-width:2.5;animation:am-warn .5s ease-in-out infinite}
@keyframes am-warn{50%{stroke-opacity:.3}}
.am-overlay{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(128,128,128,.14);backdrop-filter:blur(3px)}
.am-card{display:flex;flex-direction:column;gap:10px;align-items:center;text-align:center;padding:18px 22px;border-radius:14px;border:1px solid rgba(128,128,128,.25);background:#fff;color:#20263b;max-width:min(92%,340px);box-shadow:0 4px 12px rgba(0,0,0,.12)}
.am-card h3{margin:0;font-size:1rem}
.am-card p{margin:0;font-size:.8rem;opacity:.7}
.am-wait{font-size:.72rem;opacity:.55}
.am-cheat-card{align-items:stretch;text-align:left;width:min(92%,320px)}
.am-cheat-head{display:flex;justify-content:space-between;align-items:center}
.am-x{border:0;background:none;font-size:1.15rem;cursor:pointer;color:inherit;line-height:1;padding:2px 6px}
.am-cheat-sec{display:flex;flex-direction:column;gap:6px}
.am-cheat-sec>span{font-size:.6rem;text-transform:uppercase;letter-spacing:.14em;opacity:.5}
.am-cheat-els{display:flex;gap:6px;flex-wrap:wrap}
.am-elbtn{width:34px;height:34px;border-radius:50%;border:1.5px solid rgba(0,0,0,.15);background:var(--c);font-weight:700;font-size:.75rem;cursor:pointer;color:#20263b}
.am-elbtn.is-on{outline:2px solid #20263b;outline-offset:2px}
.am-cheat-row{display:flex;gap:6px;flex-wrap:wrap}
.am-cbtn{flex:1;padding:7px 9px;font-size:.72rem;border-radius:9px;border:1px solid rgba(0,0,0,.18);background:rgba(128,128,128,.08);cursor:pointer;color:inherit;white-space:nowrap}
.am-cbtn.is-on{background:#20263b;color:#fff;border-color:#20263b}
@media (max-width:560px){.am-player{min-width:0;flex:1}.am-queue{order:-1;width:100%}}
/* ==== FRONTEND REDESIGN · design.md — minimalist game utility ==== */
.am{min-width:0;max-width:100%;overflow-x:clip;-webkit-tap-highlight-color:transparent}
.am *,.am *::before,.am *::after{box-sizing:border-box}
.am :where(svg,canvas,img){max-width:100%;height:auto}
.am :where(button,[role="button"],select,input){touch-action:manipulation}
.am :where(button,[role="button"],select,input):focus-visible{outline:2px solid currentColor;outline-offset:2px}
/* 4px spacing grid: HUD/control rows wrap instead of overflowing on narrow screens. */
.am :where([class*="hud"],[class*="bar"],[class*="chips"],[class*="actions"],[class*="controls"],[class*="tools"],[class*="seg"],[class*="row"],[class*="intro"]){flex-wrap:wrap;min-width:0;gap:8px}
/* Thin borders and calm surfaces instead of heavy elevation. */
.am :is([class*="card"],[class*="panel"],[class*="sheet"],[class*="boardwrap"],[class*="board-wrap"],[class*="wrap"]){border-radius:12px;box-shadow:none}
/* Clear type hierarchy: 12px metadata, compact headings. */
.am :where(h2,h3,h4){line-height:1.25;letter-spacing:-.01em}
.am :where([class*="chip"],[class*="label"],[class*="meta"],[class*="hint"],[class*="note"],[class*="sub"]){font-size:12px;line-height:1.45}
@media (max-width:768px){
  .am :where([class*="stage"],[class*="boardwrap"],[class*="board-wrap"],[class*="sheet"]){padding:12px}
  .am :where([class*="hud"],[class*="bar"],[class*="chips"],[class*="actions"],[class*="controls"],[class*="tools"],[class*="seg"],[class*="row"],[class*="intro"]){gap:8px}
}
@media (max-width:480px){
  .am :where(kbd,[class*="kbd"]){display:none}
}
@media (pointer:coarse){
  .am :where(button:not([aria-checked]):not([class*="switch"]),[role="button"],select){min-height:44px;min-width:44px}
}
@media (prefers-reduced-motion:reduce){
  .am *,.am *::before,.am *::after{animation-duration:.01ms!important;animation-iteration-count:1!important;transition-duration:.01ms!important}
}
/* --- layout redesign overrides (keep last) --- */
@media (max-width:640px){
.am-app .am-hud{gap:5px 8px;margin-bottom:6px}
.am-app .am-hbtn{min-width:28px;min-height:28px;padding:4px 6px;font-size:10px}
.am-app .am-hbtn .am-hlbl,.am-app .am-spacer{display:none}
.am-app .game-panel{flex:0 0 auto;min-height:min(70dvh,620px)}
.am-player{min-width:0;padding:4px 8px}
.am-pname{max-width:72px}
.am-tier{min-width:34px;padding:3px 5px}
.am-card{padding:14px}
}
</style>
<div class="game-app am am-app game-fill">
  <div class="am-hud">
    <span class="game-status"><i class="game-status-dot"></i><span data-status aria-live="polite">Ready</span></span>
    <div class="am-meta">
      <div class="am-player" data-player="0">
        <span class="am-pdot"></span><span class="am-pseat">P1</span>
        <span class="am-pname" data-pname>-</span>
        <span class="am-pscore" data-pscore>0</span>
        <span class="am-pbest" data-pbest>-</span>
      </div>
      <div class="am-queue">
        <span class="am-q"><em>Drop</em><b data-q-cur>H</b></span>
        <span class="am-q"><em>Next</em><b data-q-next>H</b></span>
      </div>
      <div class="am-player" data-player="1">
        <span class="am-pdot"></span><span class="am-pseat">P2</span>
        <span class="am-pname" data-pname>-</span>
        <span class="am-pscore" data-pscore>0</span>
        <span class="am-pbest" data-pbest>-</span>
      </div>
    </div>
    <div class="am-tiers" data-tiers aria-label="Periodic tiers"></div>
    <span class="am-spacer"></span>
    <button class="am-btn am-hbtn" type="button" data-help aria-label="How to play" title="How to play (H)">${iconSVG("helpCircle", { size: 14 })}<span class="am-hlbl">Help</span></button>
    <button class="am-btn am-hbtn" type="button" data-cheat-open ${online ? "hidden" : ""} aria-label="Cheats" title="Cheats (C)">${iconSVG("wrench", { size: 14 })}<span class="am-hlbl">Cheats</span></button>
    <button class="am-btn am-hbtn" type="button" data-pause-btn aria-label="Pause" title="Pause (P)">${iconSVG("pause", { size: 14 })}<span class="am-hlbl">Pause</span></button>
    <button class="am-btn am-hbtn" type="button" data-restart data-restart-hud ${isGuest ? "hidden" : ""} aria-label="Restart" title="Restart (R)">${iconSVG("refresh", { size: 14 })}<span class="am-hlbl">Restart</span></button>
    <button class="am-btn am-hbtn" type="button" data-exit aria-label="Exit game" title="Exit game">${iconSVG("logOut", { size: 14 })}<span class="am-hlbl">Exit</span></button>
  </div>

  <section class="game-panel" data-board>
    <svg class="am-svg" viewBox="0 0 520 420" role="img" aria-label="Atom Merge arena">
      <rect class="am-arena" x="10" y="1" width="500" height="409" rx="8"></rect>
      <line class="am-danger" x1="10" y1="88" x2="510" y2="88"></line>
      <line class="am-guide" data-guide x1="260" y1="60" x2="260" y2="408" opacity="0"></line>
      <g data-atoms></g>
      <g data-drop opacity="0">
        <circle class="am-skin" data-drop-cir r="14" fill="#f2a0a0"></circle>
        <text class="am-sym" data-drop-txt dy=".34em" text-anchor="middle" font-size="14">H</text>
      </g>
    </svg>
    <div class="am-overlay" data-result hidden>
      <div class="am-card">
        <h3 data-result-title></h3>
        <p data-result-sub></p>
        <button class="game-action-button" type="button" data-restart>Play again</button>
        <span class="am-wait" data-result-wait hidden>Waiting for host to restart</span>
      </div>
    </div>
    <div class="am-overlay" data-cheats hidden>
      <div class="am-card am-cheat-card">
        <div class="am-cheat-head"><h3>Cheats</h3><button class="am-x" type="button" data-cheat-close aria-label="Close">&#215;</button></div>
        <div class="am-cheat-sec"><span>Next atom</span><div class="am-cheat-els" data-cheat-els></div></div>
        <div class="am-cheat-sec"><span>Physics</span><div class="am-cheat-row">
          <button class="am-cbtn" type="button" data-cheat-toggle="lowGrav">Low gravity</button>
          <button class="am-cbtn" type="button" data-cheat-toggle="shield">Overflow shield</button>
        </div></div>
        <div class="am-cheat-sec"><span>Arena</span><div class="am-cheat-row">
          <button class="am-cbtn" type="button" data-cheat-act="clearTop">Clear above line</button>
          <button class="am-cbtn" type="button" data-cheat-act="clearArena">Clear arena</button>
          <button class="am-cbtn" type="button" data-cheat-act="win">Win now</button>
        </div></div>
      </div>
    </div>
    <div class="am-overlay" data-ov="help" hidden>
      <div class="am-card">
        <h3>How to play</h3>
        <div class="am-help">
          <div>
            <b>Goal</b>
            <ul>
              <li>Merge matching atoms: H → He → Li → Be → B → C.</li>
              <li>Create Carbon to win; letting atoms rest above the red line loses.</li>
              <li>The drop order is fixed: H, H, He, He, Li, Li — every game is solvable.</li>
            </ul>
          </div>
          <div>
            <b>Controls</b>
            <ul>
              <li>Move the pointer or drag to aim, release/click to drop.</li>
              <li>← / → aim · Space or Enter drop.</li>
              <li>C cheats · P pause · R restart · H help.</li>
            </ul>
            <p>Cheats are available in solo mode only.</p>
            <button class="game-action-button" type="button" data-help-close>Got it</button>
          </div>
        </div>
      </div>
    </div>
    <div class="am-overlay" data-ov="pause" hidden>
      <div class="am-card">
        <h3>Paused</h3>
        <p>The simulation and the bot are stopped.</p>
        <button class="game-action-button" type="button" data-resume>Resume <kbd>P</kbd></button>
      </div>
    </div>
  </section>
</div>`;

    /* ---------- refs ---------- */
    const $ = (s, r) => (r || root).querySelector(s);
    const NS = "http://www.w3.org/2000/svg";
    const mk = (tag, attrs, parent) => {
        const el = document.createElementNS(NS, tag);
        for (const k in attrs) el.setAttribute(k, attrs[k]);
        if (parent) parent.appendChild(el);
        return el;
    };
    const svg = $(".am-svg");
    const gAtoms = $("[data-atoms]");
    const guide = $("[data-guide]");
    const dropG = $("[data-drop]");
    const dropCir = $("[data-drop-cir]");
    const dropTxt = $("[data-drop-txt]");
    const statusEl = $("[data-status]");
    const qCur = $("[data-q-cur]");
    const qNext = $("[data-q-next]");
    const resultEl = $("[data-result]");
    const resultTitle = $("[data-result-title]");
    const resultSub = $("[data-result-sub]");
    const resultWait = $("[data-result-wait]");
    const cheatOverlay = $("[data-cheats]");
    const ovHelp = $('[data-ov="help"]'), ovPause = $('[data-ov="pause"]');
    const pauseBtn = $("[data-pause-btn]"), hudRestart = $("[data-restart-hud]");
    const playerRefs = [0, 1].map((i) => {
        const box = $('[data-player="' + i + '"]');
        return {
            box,
            name: $("[data-pname]", box),
            score: $("[data-pscore]", box),
            best: $("[data-pbest]", box),
        };
    });

    /* periodic tier list: H > He > Li > Be > B > C */
    const tiersEl = $("[data-tiers]");
    tiersEl.innerHTML = ELEMENTS.map(
        (e, i) =>
            '<span class="am-tier" data-tier="' + i + '"><b>' + e.symbol + "</b><i>+" + e.score + "</i></span>"
    ).join('<span class="am-sep">&#8594;</span>');
    const tierEls = Array.from(tiersEl.querySelectorAll("[data-tier]"));

    const cheatElsBox = $("[data-cheat-els]");
    cheatElsBox.innerHTML = ELEMENTS.map(
        (e, i) =>
            '<button class="am-elbtn" type="button" data-cheat-el="' + i + '" style="--c:' + e.color + '">' + e.symbol + "</button>"
    ).join("");
    const cheatElBtns = Array.from(cheatElsBox.querySelectorAll("[data-cheat-el]"));
    const togGrav = $('[data-cheat-toggle="lowGrav"]');
    const togShield = $('[data-cheat-toggle="shield"]');
    const resultRestart = $("[data-restart]", resultEl);

    /* ---------- local (non-synced) UI state ---------- */
    let aimX = W / 2;
    let shownEl = -1;
    let cheatOpen = false;
    let helpOpen = false, paused = false;
    let seenHelp = true;
    try { seenHelp = localStorage.getItem("atomMergeHelpSeen") === "1"; } catch (err) { seenHelp = true; }
    if (!seenHelp) {
        helpOpen = true;
        try { localStorage.setItem("atomMergeHelpSeen", "1"); } catch (err) { /* storage blocked */ }
    }
    let pointerAiming = false;
    let botDelay = 0;
    let rafId = 0;
    let lastT = 0;
    let lastPub = 0;
    const atomEls = new Map(); // atom id -> svg group
    const disp = new Map();    // guest-side interpolated positions

    function toggleHelp(on) {
        helpOpen = typeof on === "boolean" ? on : !helpOpen;
        if (helpOpen) cheatOpen = false;
        render();
    }
    function togglePause(on) {
        if (isGuest) return;
        paused = typeof on === "boolean" ? on : !paused;
        if (paused) { cheatOpen = false; pointerAiming = false; }
        render();
    }

    const currentEl = () => (state.override !== null ? state.override : SEQ[state.seq % SEQ.length]);
    const mySeat = () => {
        if (!online) return 0;
        if (!state) return room.isHost ? 0 : 1;
        return room.isHost ? state.hostSeat : 1 - state.hostSeat;
    };
    const myTurn = () =>
        !!state && state.phase === "playing" && !state.resolving && state.turn === mySeat();

    /* ---------- rendering ---------- */
    const fsFor = (el) => Math.max(10, Math.round(el.radius * (el.symbol.length > 1 ? 0.82 : 0.98)));
    const posOf = (a) => (isGuest ? disp.get(a.id) || a : a);

    function renderDropper() {
        if (!state || state.phase !== "playing") {
            dropG.setAttribute("opacity", "0");
            guide.setAttribute("opacity", "0");
            return;
        }
        const cur = currentEl();
        const el = ELEMENTS[cur];
        const mine = myTurn();
        const x = mine ? clampAim(aimX, el.radius) : W / 2;
        if (mine) aimX = x;
        guide.setAttribute("x1", x);
        guide.setAttribute("x2", x);
        guide.setAttribute("y1", DROP_Y + el.radius + 4);
        guide.setAttribute("opacity", mine ? "1" : "0");
        dropG.setAttribute("transform", "translate(" + x + " " + DROP_Y + ")");
        dropG.setAttribute("opacity", state.resolving ? "0.25" : mine ? "1" : "0.4");
        if (shownEl !== cur) {
            shownEl = cur;
            dropCir.setAttribute("r", el.radius);
            dropCir.setAttribute("fill", el.color);
            dropTxt.setAttribute("font-size", fsFor(el));
            dropTxt.textContent = el.symbol;
        }
    }

    function renderAtoms() {
        const alive = new Set();
        const list = state ? state.atoms : [];
        for (let i = 0; i < list.length; i++) {
            const a = list[i];
            alive.add(a.id);
            let g = atomEls.get(a.id);
            if (g && Number(g.dataset.el) !== a.el) { g.remove(); atomEls.delete(a.id); g = null; }
            if (!g) {
                g = mk("g", {}, gAtoms);
                g.dataset.el = a.el;
                const popping = a.pop || (isGuest && state && state.resolving);
                const inner = mk("g", { class: popping ? "am-pop" : "" }, g);
                const el = ELEMENTS[a.el];
                mk("circle", { r: el.radius, fill: el.color, class: "am-skin" }, inner);
                const t = mk("text", { dy: ".34em", "font-size": fsFor(el), "text-anchor": "middle", class: "am-sym" }, inner);
                t.textContent = el.symbol;
                a.pop = false;
                atomEls.set(a.id, g);
            }
            const p = posOf(a);
            g.setAttribute("transform", "translate(" + p.x + " " + p.y + ")");
            g.classList.toggle("am-warn", (a.aboveT || 0) > 0.05);
        }
        atomEls.forEach((g, id) => {
            if (!alive.has(id)) { g.remove(); atomEls.delete(id); disp.delete(id); }
        });
    }

    function render() {
        ovHelp.hidden = !helpOpen;
        ovPause.hidden = !paused || helpOpen;
        if (pauseBtn) {
            pauseBtn.disabled = isGuest;
            const want = paused ? "play" : "pause";
            if (pauseBtn.dataset.iconState !== want) {
                pauseBtn.dataset.iconState = want;
                const ico = pauseBtn.querySelector("svg");
                if (ico) ico.outerHTML = iconSVG(want, { size: 14 });
                const label = pauseBtn.querySelector(".am-hlbl");
                if (label) label.textContent = paused ? "Resume" : "Pause";
            }
        }
        if (hudRestart) hudRestart.disabled = isGuest;
        const st = state;
        const mine = myTurn() && !paused && !helpOpen;
        svg.classList.toggle("is-mine", mine);

        /* status */
        let status = "Waiting for host";
        if (st) {
            if (st.phase === "over") status = st.names[st.winner] + " wins";
            else if (st.resolving) status = "Resolving";
            else if (mine) status = "Your turn";
            else if (!online) status = "Bot is thinking";
            else status = st.names[st.turn] + " is aiming";
        }
        statusEl.textContent = status;

        /* players */
        for (let i = 0; i < 2; i++) {
            const r = playerRefs[i];
            r.name.textContent = st ? st.names[i] : "-";
            r.score.textContent = st ? st.scores[i] : 0;
            const b = st ? st.best[i] : -1;
            r.best.textContent = b >= 0 ? ELEMENTS[b].symbol : "-";
            r.best.style.background = b >= 0 ? ELEMENTS[b].color : "";
            r.best.style.color = b >= 0 ? "#20263b" : "";
            r.box.classList.toggle("is-active", !!st && st.phase === "playing" && st.turn === i);
        }

        /* queue */
        const cur = st ? currentEl() : 0;
        const nxt = st ? SEQ[(st.seq + 1) % SEQ.length] : 0;
        qCur.textContent = ELEMENTS[cur].symbol;
        qCur.style.color = ELEMENTS[cur].ink;
        qNext.textContent = ELEMENTS[nxt].symbol;
        qNext.style.color = ELEMENTS[nxt].ink;

        /* tier list */
        const maxBest = st ? Math.max(st.best[0], st.best[1]) : -1;
        for (let i = 0; i < tierEls.length; i++) {
            const reached = i <= maxBest;
            tierEls[i].classList.toggle("is-reached", reached);
            tierEls[i].classList.toggle("is-current", !!st && st.phase === "playing" && i === cur);
            tierEls[i].querySelector("b").style.color = reached ? ELEMENTS[i].ink : "";
        }

        renderDropper();
        renderAtoms();
        if (paused || helpOpen) {
            dropG.setAttribute("opacity", "0");
            guide.setAttribute("opacity", "0");
        }

        /* result overlay */
        const over = !!st && st.phase === "over";
        resultEl.hidden = !over || helpOpen || paused;
        if (over) {
            resultTitle.textContent = st.names[st.winner] + " wins";
            resultSub.textContent =
                (st.reason === "carbon" ? "Carbon created" : "Arena overflowed") +
                " - Score " + st.scores[0] + " : " + st.scores[1];
            resultRestart.hidden = isGuest;
            resultWait.hidden = !isGuest;
        }

        /* cheat overlay */
        cheatOverlay.hidden = !cheatOpen || online || helpOpen || paused;
        if (cheatOpen && st) {
            cheatElBtns.forEach((b, i) => b.classList.toggle("is-on", st.override === i));
            togGrav.classList.toggle("is-on", !!st.lowGrav);
            togShield.classList.toggle("is-on", !!st.shield);
        }
    }

    /* ---------- networking ---------- */
    function serialize() {
        const s = state;
        return {
            ...s,
            atoms: s.atoms.map((a) => ({
                id: a.id, el: a.el,
                x: Math.round(a.x * 10) / 10,
                y: Math.round(a.y * 10) / 10,
                vx: Math.round(a.vx), vy: Math.round(a.vy),
                age: Math.round(a.age * 100) / 100,
                aboveT: Math.round(a.aboveT * 100) / 100,
            })),
        };
    }

    function syncNet(force) {
        if (!online || !room.isHost || !state) return;
        const now = performance.now();
        if (force || now - lastPub > 150) {
            lastPub = now;
            room.publishState(serialize()).catch(console.warn);
        }
    }

    function publish() {
        render();
        syncNet(true); // only the host writes canonical state
    }

    /* ---------- game flow ---------- */
    function newGame() {
        const starter = Math.random() < 0.5 ? 0 : 1;          // random first turn (bot + multiplayer)
        const hostSeat = online ? (Math.random() < 0.5 ? 0 : 1) : 0; // random P1/P2 seat in multiplayer
        let names;
        if (online) {
            const hostName = roomData?.players?.[0]?.name || roomData?.hostName || playerName || "Host";
            const guestName = roomData?.players?.[1]?.name || roomData?.guestName || "Guest";
            names = hostSeat === 0 ? [hostName, guestName] : [guestName, hostName];
        } else {
            names = [playerName || "Player", "Bot"];
        }
        state = {
            phase: "playing",
            atoms: [],
            seq: 0, uid: 0,
            turn: starter, starter, hostSeat, names,
            scores: [0, 0], merges: [0, 0], best: [-1, -1],
            resolving: false, dropper: null,
            resolveT: 0, stableT: 0, pendingAt: 0,
            pendingWin: null, pendingLose: null,
            winner: null, reason: "",
            override: null, lowGrav: false, shield: false,
        };
        aimX = W / 2;
        shownEl = -1;
        cheatOpen = false;
        botDelay = !online && starter === BOT_SEAT ? 0.9 + Math.random() * 0.6 : 0;
        disp.clear();
        publish();
    }

    function doDrop(x) {
        const cur = currentEl();
        const el = ELEMENTS[cur];
        state.atoms.push({
            id: ++state.uid, el: cur,
            x: clampAim(x, el.radius), y: DROP_Y,
            vx: 0, vy: 60, age: 0, aboveT: 0, pop: false,
        });
        state.override = null;
        state.seq++;
        if (cur > state.best[state.turn]) state.best[state.turn] = cur;
        state.dropper = state.turn;
        state.resolving = true;
        state.resolveT = 0;
        state.stableT = 0;
        state.pendingAt = 0;
        state.pendingWin = null;
        state.pendingLose = null;
        publish();
    }

    function mergePass() {
        const atoms = state.atoms;
        const d = state.dropper;
        const dead = new Set();
        const spawned = [];
        for (let i = 0; i < atoms.length; i++) {
            const a = atoms[i];
            if (dead.has(a.id)) continue;
            for (let j = i + 1; j < atoms.length; j++) {
                const b = atoms[j];
                if (dead.has(b.id) || b.el !== a.el) continue;
                if (a.age <= AGE_GATE || b.age <= AGE_GATE) continue;
                const r = ELEMENTS[a.el].radius;
                const dx = b.x - a.x, dy = b.y - a.y;
                const need = r * 2 * 0.85;
                if (dx * dx + dy * dy > need * need) continue;
                dead.add(a.id);
                dead.add(b.id);
                state.merges[d]++;
                if (a.el >= ELEMENTS.length - 1) {
                    state.scores[d] += 150; // two Carbon annihilate for a big bonus
                } else {
                    const ni = a.el + 1;
                    state.scores[d] += ELEMENTS[ni].score;
                    if (ni > state.best[d]) state.best[d] = ni;
                    if (ni === ELEMENTS.length - 1) {
                        state.pendingWin = d;
                        state.pendingAt = state.resolveT;
                    }
                    spawned.push({
                        id: ++state.uid, el: ni,
                        x: (a.x + b.x) / 2, y: (a.y + b.y) / 2,
                        vx: (a.vx + b.vx) * 0.25, vy: (a.vy + b.vy) * 0.25,
                        age: 0, aboveT: 0, pop: true,
                    });
                }
                break;
            }
        }
        if (dead.size) state.atoms = atoms.filter((a) => !dead.has(a.id)).concat(spawned);
    }

    function dangerPass(dt) {
        for (let i = 0; i < state.atoms.length; i++) {
            const a = state.atoms[i];
            const sp2 = a.vx * a.vx + a.vy * a.vy;
            if (!state.shield && a.age > 0.5 && sp2 < SETTLE_V * SETTLE_V && a.y < DANGER_Y) {
                a.aboveT += dt;
                if (a.aboveT > DANGER_T && state.pendingLose === null) state.pendingLose = state.dropper;
            } else {
                a.aboveT = 0;
            }
        }
    }

    function finishTurn() {
        state.resolving = false;
        if (state.pendingWin !== null) {
            state.phase = "over";
            state.winner = state.pendingWin;
            state.reason = "carbon";
        } else if (state.pendingLose !== null) {
            state.phase = "over";
            state.winner = 1 - state.pendingLose;
            state.reason = "overflow";
        } else {
            state.turn = 1 - state.turn;
            state.dropper = null;
            if (!online && state.turn === BOT_SEAT) botDelay = 0.7 + Math.random() * 0.7;
        }
        publish();
    }

    function simulate(dt) {
        const grav = GRAV * (state.lowGrav ? 0.35 : 1);
        for (let s = 0; s < SUBSTEPS; s++) stepPhysics(state.atoms, dt / SUBSTEPS, grav);
        mergePass();
        dangerPass(dt);
        state.resolveT += dt;
        const settled = state.atoms.every(
            (a) => a.age > 0.35 && a.vx * a.vx + a.vy * a.vy < SETTLE_V * SETTLE_V
        );
        state.stableT = settled ? state.stableT + dt : 0;
        const winShown = state.pendingWin !== null && state.resolveT - state.pendingAt > 0.7;
        if (winShown || state.pendingLose !== null || state.stableT > 0.3 || state.resolveT > 6) finishTurn();
    }

    /* ---------- bot ---------- */
    function botAim() {
        const cur = currentEl();
        const r = ELEMENTS[cur].radius;
        const same = state.atoms.filter((a) => a.el === cur);
        if (same.length) {
            let t = same[0];
            for (const a of same) if (a.y > t.y) t = a; // merge onto the lowest twin
            return t.x + (Math.random() * 12 - 6);
        }
        let bestX = W / 2, bestTop = -Infinity; // otherwise pick the flattest column
        for (let x = L + r + 4; x <= R - r - 4; x += 16) {
            let top = FLOOR;
            for (const a of state.atoms) {
                const ra = ELEMENTS[a.el].radius;
                if (Math.abs(a.x - x) < r + ra) top = Math.min(top, a.y - ra);
            }
            const jitter = Math.random() * 8;
            if (top + jitter > bestTop) { bestTop = top + jitter; bestX = x; }
        }
        return bestX;
    }

    /* ---------- cheats (offline only) ---------- */
    function applyCheat(action) {
        if (online || !state) return;
        switch (action.cheat) {
            case "setEl":
                if (state.phase === "playing" && Number.isInteger(action.value) &&
                    action.value >= 0 && action.value < ELEMENTS.length) state.override = action.value;
                break;
            case "toggle":
                if (action.value === "lowGrav" || action.value === "shield") state[action.value] = !state[action.value];
                break;
            case "clearTop":
                state.atoms = state.atoms.filter((a) => a.y - ELEMENTS[a.el].radius >= DANGER_Y);
                break;
            case "clearArena":
                state.atoms = [];
                break;
            case "win":
                if (state.phase === "playing") {
                    state.phase = "over";
                    state.resolving = false;
                    state.winner = 0;
                    state.reason = "carbon";
                }
                break;
            default:
                return;
        }
        publish();
    }

    /* ---------- actions (host-authoritative) ---------- */
    function applyAction(action, actor) {
        if (!state || !action || typeof action.type !== "string") return;
        switch (action.type) {
            case "drop": {
                if (state.phase !== "playing" || state.resolving || actor !== state.turn) return;
                const x = Number(action.x);
                if (!Number.isFinite(x)) return;
                doDrop(x);
                break;
            }
            case "restart":
                if (online && actor !== state.hostSeat) return; // host-only restart
                newGame();
                helpOpen = false; paused = false;
                render();
                break;
            case "cheat":
                if (online) return;
                applyCheat(action);
                break;
        }
    }

    function submitAction(action) {
        if (isGuest) {
            room.sendAction(action).catch(console.warn);
            return;
        }
        applyAction(action, mySeat());
    }

    /* ---------- input: mouse + keyboard + touch, no virtual buttons ---------- */
    function svgX(e) {
        const rect = svg.getBoundingClientRect();
        const scale = Math.min(rect.width / W, rect.height / 420) || 1;
        const offX = (rect.width - W * scale) / 2;
        return (e.clientX - rect.left - offX) / scale;
    }
    const onPointerMove = (e) => { if (myTurn() && !cheatOpen && !paused && !helpOpen) aimX = svgX(e); };
    const onPointerDown = (e) => {
        if (!myTurn() || cheatOpen || paused || helpOpen) return;
        pointerAiming = true;
        aimX = svgX(e);
        if (svg.setPointerCapture) { try { svg.setPointerCapture(e.pointerId); } catch (err) { /* noop */ } }
    };
    const onPointerUp = (e) => {
        if (!pointerAiming) return;
        pointerAiming = false;
        if (!myTurn() || cheatOpen || paused || helpOpen) return;
        aimX = svgX(e);
        submitAction({ type: "drop", x: aimX });
    };
    const onPointerCancel = () => { pointerAiming = false; };
    const onCtx = (e) => e.preventDefault();

    svg.addEventListener("pointermove", onPointerMove);
    svg.addEventListener("pointerdown", onPointerDown);
    svg.addEventListener("pointerup", onPointerUp);
    svg.addEventListener("pointercancel", onPointerCancel);
    svg.addEventListener("contextmenu", onCtx);

    const onKey = (e) => {
        if (!root.isConnected || !state) return;
        const t = e.target;
        const tag = t && t.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || (t && t.isContentEditable)) return;
        if (tag === "BUTTON" && (e.key === " " || e.key === "Enter")) return; // let native click work
        if (helpOpen) {
            if (e.key === "Escape" || e.key === "h" || e.key === "H" || e.key === "Enter" || e.key === " ") toggleHelp(false);
            return;
        }
        if (paused) {
            if (e.key === "p" || e.key === "P" || e.key === "Escape" || e.key === "Enter" || e.key === " ") togglePause(false);
            return;
        }
        if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
            if (!myTurn() || cheatOpen) return;
            e.preventDefault();
            aimX += e.key === "ArrowLeft" ? -16 : 16;
        } else if (e.key === " " || e.key === "Enter") {
            if (!myTurn() || cheatOpen) return;
            e.preventDefault();
            submitAction({ type: "drop", x: aimX });
        } else if (e.key === "h" || e.key === "H") {
            toggleHelp();
        } else if (e.key === "p" || e.key === "P") {
            togglePause();
        } else if (e.key === "c" || e.key === "C") {
            if (!online) { cheatOpen = !cheatOpen; render(); }
        } else if (e.key === "r" || e.key === "R") {
            if (!online || room.isHost) submitAction({ type: "restart" });
        } else if (e.key === "Escape") {
            if (cheatOpen) { cheatOpen = false; render(); }
        }
    };
    document.addEventListener("keydown", onKey);

    function handleClick(event) {
        const t = event.target;
        if (t.closest("[data-help]")) { toggleHelp(); return; }
        if (t.closest("[data-help-close]")) { toggleHelp(false); return; }
        if (t.closest("[data-resume]")) { togglePause(false); return; }
        if (t.closest("[data-pause-btn]")) { togglePause(); return; }
        if (t.closest("[data-exit]")) { onExit(); return; }
        if (t.closest("[data-restart]")) { submitAction({ type: "restart" }); return; }
        if (t.closest("[data-cheat-open]")) { if (!online) { cheatOpen = !cheatOpen; render(); } return; }
        if (t.closest("[data-cheat-close]")) { cheatOpen = false; render(); return; }
        const elBtn = t.closest("[data-cheat-el]");
        if (elBtn) { submitAction({ type: "cheat", cheat: "setEl", value: Number(elBtn.dataset.cheatEl) }); return; }
        const tog = t.closest("[data-cheat-toggle]");
        if (tog) { submitAction({ type: "cheat", cheat: "toggle", value: tog.dataset.cheatToggle }); return; }
        const act = t.closest("[data-cheat-act]");
        if (act) { submitAction({ type: "cheat", cheat: act.dataset.cheatAct }); return; }
    }
    root.addEventListener("click", handleClick);

    /* ---------- main loop ---------- */
    function updateDisp(dt) {
        if (!state) return;
        const k = 1 - Math.exp(-14 * dt);
        for (const a of state.atoms) {
            let p = disp.get(a.id);
            if (!p) { p = { x: a.x, y: a.y }; disp.set(a.id, p); }
            p.x += (a.x - p.x) * k;
            p.y += (a.y - p.y) * k;
        }
    }

    function tick(t) {
        rafId = requestAnimationFrame(tick);
        let dt = (t - lastT) / 1000;
        lastT = t;
        if (!(dt > 0)) dt = 0.016;
        if (dt > 0.032) dt = 0.032;
        if (state) {
            if (!paused && isHost && state.phase === "playing" && state.resolving) {
                simulate(dt);
                syncNet(false);
            } else if (!paused && !online && state.phase === "playing" && !state.resolving && state.turn === BOT_SEAT) {
                botDelay -= dt;
                if (botDelay <= 0) doDrop(botAim());
            }
            if (isGuest) updateDisp(dt);
        }
        render();
    }

    /* ---------- boot ---------- */
    const offs = [];
    if (online) {
        offs.push(room.onRoom((nextRoom) => {
            roomData = nextRoom;
            if (room.isHost && state) {
                const gn = nextRoom?.players?.[1]?.name || nextRoom?.guestName;
                const seat = 1 - state.hostSeat;
                if (gn && state.names[seat] !== gn) { state.names[seat] = gn; publish(); }
            }
            render();
        }));
        if (room.isHost) {
            newGame();
            offs.push(room.onAction((action) => applyAction(action, state ? 1 - state.hostSeat : 1)));
        } else {
            offs.push(room.onState((nextState) => {
                state = nextState;
                if (state && state.seq === 0 && state.atoms.length === 0) disp.clear();
                render();
            }));
        }
    } else {
        newGame();
    }
    lastT = performance.now();
    rafId = requestAnimationFrame(tick);
    render();

    return {
        destroy() {
            cancelAnimationFrame(rafId);
            root.removeEventListener("click", handleClick);
            document.removeEventListener("keydown", onKey);
            svg.removeEventListener("pointermove", onPointerMove);
            svg.removeEventListener("pointerdown", onPointerDown);
            svg.removeEventListener("pointerup", onPointerUp);
            svg.removeEventListener("pointercancel", onPointerCancel);
            svg.removeEventListener("contextmenu", onCtx);
            offs.forEach((fn) => { if (typeof fn === "function") fn(); });
        },
    };
}