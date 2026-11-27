/* ==== GAME: ludo.js ==== */
import { iconSVG } from "../JS/icons.js";
/*
  Ludo — papan klasik, tampilan minimalis gelap.
  Mode AI  : Red (kamu) vs Blue AI, giliran pertama diundi.
  Mode room: host otoritatif, kursi Red/Blue diundi acak oleh host.
  Semua state serializable (aman untuk Firebase), animasi murni CSS.
*/

export const META = {
    id: "ludo", // harus sama dengan nama file (tanpa .js)
    name: "Ludo",
    category: "board",
    catLabel: "Board",
    desc: "Race 4 pawns home, capture foes, exact roll to finish. vs AI or a friend.",
    art: '<svg viewBox="0 0 48 48" width="54" height="54" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="17" y="5" width="14" height="38" rx="3"/><rect x="5" y="17" width="38" height="14" rx="3"/><circle cx="11" cy="11" r="2.4" fill="currentColor" stroke="none"/><circle cx="37" cy="11" r="2.4" fill="currentColor" stroke="none"/><circle cx="11" cy="37" r="2.4" fill="currentColor" stroke="none"/><circle cx="37" cy="37" r="2.4" fill="currentColor" stroke="none"/><circle cx="24" cy="24" r="3.4" fill="currentColor" stroke="none"/></svg>',
    bg: ["#fee2e2", "#fecaca"],
};

export function mount(root, context = {}) {
    const { mode = "ai", room = null, playerName = "Player", onExit = () => { } } = context;
    const online = mode === "room" && Boolean(room);
    const fallbackIndex = online && !room.isHost ? 1 : 0;
    let roomData = room?.room || null;
    let state = null;

    /* ---------------- geometri papan ---------------- */
    const CELL = 40;
    const SVGNS = "http://www.w3.org/2000/svg";
    const TRACK = [
        [1, 6], [2, 6], [3, 6], [4, 6], [5, 6],
        [6, 5], [6, 4], [6, 3], [6, 2], [6, 1], [6, 0],
        [7, 0], [8, 0],
        [8, 1], [8, 2], [8, 3], [8, 4], [8, 5],
        [9, 6], [10, 6], [11, 6], [12, 6], [13, 6], [14, 6],
        [14, 7], [14, 8],
        [13, 8], [12, 8], [11, 8], [10, 8], [9, 8],
        [8, 9], [8, 10], [8, 11], [8, 12], [8, 13], [8, 14],
        [7, 14], [6, 14],
        [6, 13], [6, 12], [6, 11], [6, 10], [6, 9],
        [5, 8], [4, 8], [3, 8], [2, 8], [1, 8], [0, 8],
        [0, 7], [0, 6],
    ];
    const SAFE = new Set([0, 8, 13, 21, 26, 34, 39, 47]);
    const STAR =
        "M0,-7.2L1.8,-2.5L6.9,-2.2L2.9,0.9L4.2,5.8L0,3.1L-4.2,5.8L-2.9,0.9L-6.9,-2.2L-1.8,-2.5Z";

    /* Palet gelap: papan tidak lagi terlalu cerah */
    const PL = [
        {
            label: "Red", color: "#ef4444",
            yard: "#2a1418", stretch: "#4c1d24", start: "#7f1d1d", tri: "#dc2626",
            startIdx: 0,
            slots: [[70, 70], [170, 70], [70, 170], [170, 170]],
            stretchCells: [[1, 7], [2, 7], [3, 7], [4, 7], [5, 7]],
            home: [[259, 300], [276, 287], [276, 313], [292, 300]],
        },
        {
            label: "Blue", color: "#3b82f6",
            yard: "#111a30", stretch: "#1c2f55", start: "#1e40af", tri: "#2563eb",
            startIdx: 26,
            slots: [[430, 430], [530, 430], [430, 530], [530, 530]],
            stretchCells: [[13, 7], [12, 7], [11, 7], [10, 7], [9, 7]],
            home: [[341, 300], [324, 287], [324, 313], [308, 300]],
        },
    ];
    const DECOR = [
        {
            color: "#22c55e", yard: "#0f2016", stretch: "#16351f", start: "#166534", tri: "#16a34a",
            yardXY: [360, 0], startIdx: 13,
            stretchCells: [[7, 1], [7, 2], [7, 3], [7, 4], [7, 5]],
        },
        {
            color: "#eab308", yard: "#221c0c", stretch: "#3a2f10", start: "#713f12", tri: "#ca8a04",
            yardXY: [0, 360], startIdx: 39,
            stretchCells: [[7, 13], [7, 12], [7, 11], [7, 10], [7, 9]],
        },
    ];
    const PIPS = {
        1: [[32, 32]],
        2: [[21, 21], [43, 43]],
        3: [[21, 21], [32, 32], [43, 43]],
        4: [[21, 21], [43, 21], [21, 43], [43, 43]],
        5: [[21, 21], [43, 21], [32, 32], [21, 43], [43, 43]],
        6: [[21, 18], [43, 18], [21, 32], [43, 32], [21, 46], [43, 46]],
    };

    /* ---------------- shell: HUD bar + papan penuh tinggi ---------------- */
    root.innerHTML = `
<style>
/* Ludo — HUD bar above a fill-height square board; info never overlaps the arena. */
.ludo-app{--ld-line:#16213a;--ld-ink:#e2e8f0;--ld-mut:#8b93a7;width:100%;max-width:1100px;margin:0 auto;padding:14px;background:#0b1220;border:1px solid var(--ld-line);border-radius:14px;color:#cbd5e1;font:14px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
.ludo-app *{box-sizing:border-box}
.ludo-app [hidden]{display:none!important}
.ludo-hud{display:flex;align-items:center;gap:7px;flex-wrap:wrap;margin-bottom:10px;font:600 11px/1 ui-monospace,SFMono-Regular,Menlo,monospace}
.ludo-chip{display:inline-flex;align-items:center;gap:6px;padding:6px 10px;border:1px solid #1f2b45;border-radius:999px;background:#0e1830;color:var(--ld-mut);white-space:nowrap;max-width:100%}
.ludo-chip b{color:var(--ld-ink);font-weight:700;font-variant-numeric:tabular-nums}
.ludo-status-dot{width:8px;height:8px;border-radius:50%;background:#ef4444;flex:0 0 auto}
.ludo-spacer{flex:1 1 auto}
.ludo-die-wrap{display:inline-flex;align-items:center;gap:6px;padding:4px 8px}
.ludo-die-btn{background:none;border:0;padding:0;border-radius:10px;cursor:pointer;transition:transform .15s ease,opacity .15s ease,box-shadow .2s ease}
.ludo-die-btn:disabled{opacity:.38;cursor:default}
.ludo-die-btn:not(:disabled):hover{transform:translateY(-2px)}
.ludo-die-btn.armed{box-shadow:0 0 0 2px #26334f,0 0 14px rgba(226,232,240,.14)}
.ludo-app :is(button,select,input):focus-visible{outline:2px solid #94a3b8;outline-offset:2px}
.ludo-die{display:block;width:36px;height:36px}
.ludo-die-btn.pop .ludo-die{animation:ludoPop .34s ease}
.ludo-force{font-size:10px;color:#fbbf24;letter-spacing:.03em}
.ludo-players{display:flex;gap:6px;flex-wrap:wrap;min-width:0}
.ludo-pchip{display:inline-flex;align-items:center;gap:7px;background:#0e1830;border:1px solid #1f2b45;border-radius:999px;padding:5px 9px;font-size:11px;color:#7c8aa5;transition:border-color .2s ease;min-width:0}
.ludo-pchip.active{border-color:var(--pc)}
.ludo-pchip .ludo-dot{width:8px;height:8px;border-radius:50%;background:var(--pc);flex:0 0 auto}
.ludo-pname{color:var(--ld-ink);font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:110px;min-width:0}
.ludo-pstat{white-space:nowrap}
.ludo-pstat b{color:#cbd5e1;font-weight:600}
.ludo-msg{max-width:270px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--ld-mut)}
.ludo-btn{background:#16223c;border:1px solid #26334f;color:#cbd5e1;border-radius:9px;padding:8px 13px;min-height:36px;font-size:12.5px;font-family:inherit;cursor:pointer;transition:background .15s ease,border-color .15s ease,color .15s ease}
.ludo-btn:hover{background:#1c2a49;border-color:#33436b;color:var(--ld-ink)}
.ludo-btn:disabled{opacity:.4;cursor:default}
.ludo-btn.primary{background:#e2e8f0;border-color:#e2e8f0;color:#0b1220;font-weight:600}
.ludo-btn.primary:hover{background:#ffffff}
.ludo-btn.on{border-color:#fbbf24;color:#fbbf24}
.ludo-icon-btn{display:inline-flex;align-items:center;gap:6px}
.ludo-icon-btn svg{flex:none;display:block}
.ludo-app .game-panel.ludo-board{margin:0;padding:0;min-width:0;position:relative;display:flex;align-items:center;justify-content:center;overflow:hidden;border-color:var(--ld-line);background:#0d1526}
.ludo-map{display:block;width:100%;height:100%}
.ludo-pawn{transition:transform .3s cubic-bezier(.2,.8,.3,1)}
.ludo-pawn .ring{opacity:0}
.ludo-pawn .num{display:none;pointer-events:none}
.ludo-pawn.movable{cursor:pointer}
.ludo-pawn.movable .ring{opacity:1;animation:ludoPulse .95s ease-in-out infinite;transform-box:fill-box;transform-origin:center}
.ludo-pawn.movable .num{display:block}
.ludo-pawn.movable .inner{display:none}
.ludo-ov{position:absolute;inset:0;z-index:6;display:flex;align-items:center;justify-content:center;background:rgba(4,8,20,.72);backdrop-filter:blur(3px);padding:12px}
.ludo-card{background:#0f172a;border:1px solid #223052;border-radius:14px;padding:18px;max-width:420px;width:100%;max-height:100%;display:flex;flex-direction:column;gap:10px;align-items:center;text-align:center}
.ludo-head{display:flex;align-items:center;justify-content:space-between;gap:10px;width:100%;flex:none}
.ludo-head h3{margin:0;font-size:16px;font-weight:700;color:var(--ld-ink)}
.ludo-foot{display:flex;align-items:center;justify-content:space-between;gap:10px;width:100%;flex:none;margin-top:4px}
.ludo-note{font-size:10px;color:#64748b}
.ludo-ov-title{margin:0;font-size:19px;font-weight:700;color:var(--ld-ink)}
.ludo-ov-sub{margin:0;font-size:12.5px;line-height:1.55;color:var(--ld-mut)}
.ludo-cheat-card{max-width:360px;gap:10px}
.ludo-cheat-note{margin:0;font-size:11px;color:#64748b}
.ludo-cheats,.ludo-help{width:100%;display:flex;flex-direction:column;gap:10px;flex:1 1 auto;min-height:0;overflow:auto;text-align:left}
.ludo-help{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:14px}
.ludo-help b{display:block;margin-bottom:4px;font:700 10px/1 ui-monospace,monospace;letter-spacing:.09em;color:#64748b;text-transform:uppercase}
.ludo-help ul{margin:0 0 10px;padding-left:16px;font-size:11.5px;line-height:1.6;color:var(--ld-mut)}
.ludo-cheat-sec{width:100%;display:flex;flex-direction:column;gap:6px;align-items:flex-start}
.ludo-cheat-label{font-size:10.5px;text-transform:uppercase;letter-spacing:.09em;color:#64748b}
.ludo-dice-row{display:grid;grid-template-columns:repeat(6,1fr);gap:6px;width:100%}
.ludo-dice-btn{padding:8px 0;text-align:center}
.ludo-dice-btn.sel{border-color:#fbbf24;color:#fbbf24}
.ludo-cheat-list{display:flex;flex-direction:column;gap:6px;width:100%}
.ludo-cheat-list .ludo-btn{width:100%;text-align:left}
@keyframes ludoPulse{0%,100%{opacity:.25;transform:scale(1)}50%{opacity:1;transform:scale(1.26)}}
@keyframes ludoPop{0%{transform:scale(1) rotate(0deg)}30%{transform:scale(.88) rotate(-9deg)}65%{transform:scale(1.09) rotate(7deg)}100%{transform:scale(1) rotate(0deg)}}
@media (max-width:760px){.ludo-app{padding:12px}.ludo-players{order:-1;width:100%}}
@media (pointer:coarse){.ludo-btn{min-height:44px}.ludo-dice-btn{min-height:44px}}
@media (prefers-reduced-motion:reduce){.ludo-app *{animation-duration:.01ms!important;animation-iteration-count:1!important;transition-duration:.01ms!important;scroll-behavior:auto!important}}
/* --- fill height + mobile refinements (must stay last) --- */
.ludo-app.game-fill > .ludo-board{flex:1 1 auto;min-height:0;aspect-ratio:auto}
@media (max-width:640px){
.ludo-app.game-fill > .ludo-board:not(:has(.ludo-ov:not([hidden]))){aspect-ratio:1;flex:0 0 auto}
.ludo-app.game-fill > .ludo-board:has(.ludo-ov:not([hidden])){flex:0 0 auto;min-height:min(70dvh,620px);aspect-ratio:auto}
.ludo-app .ludo-hud{gap:5px;margin-bottom:8px}
.ludo-app .ludo-hud .ludo-chip{padding:4px 6px;font-size:9px}
.ludo-app .ludo-hud .ludo-msg{max-width:130px}
.ludo-app .ludo-hud .ludo-btn{min-height:32px;padding:5px 9px;font-size:9px}
.ludo-app .ludo-hud .ludo-btn-label,.ludo-app .ludo-hud .ludo-spacer{display:none}
.ludo-app .ludo-hud .ludo-die-btn{min-height:32px}
.ludo-app .ludo-hud .ludo-force{display:none}
.ludo-app .ludo-ov{padding:8px}
.ludo-app .ludo-card{width:100%;height:100%;max-height:100%;padding:14px;border-radius:12px}
.ludo-app .ludo-cheats,.ludo-app .ludo-help{scrollbar-width:none}
.ludo-app .ludo-cheats::-webkit-scrollbar,.ludo-app .ludo-help::-webkit-scrollbar{display:none}
.ludo-app .ludo-foot{position:static;margin:0;padding:10px 0 0;border-top:1px solid var(--ld-line)}
.ludo-app .ludo-note{display:none}
}
</style>
<div class="game-app ludo-app game-fill" data-ludo>
  <div class="ludo-hud">
    <span class="ludo-chip"><i class="ludo-status-dot" data-dot></i><span data-status>Ready</span></span>
    <span class="ludo-chip ludo-die-wrap">
      <button class="ludo-die-btn" type="button" data-act="roll" aria-label="Roll die" title="Roll die (Space)" disabled>
        <svg class="ludo-die" viewBox="0 0 64 64" aria-hidden="true"></svg>
      </button>
      <span class="ludo-force" data-force hidden></span>
    </span>
    <span class="ludo-players">
      <span class="ludo-pchip" data-chip="0" style="--pc:#ef4444"><span class="ludo-dot"></span><span class="ludo-pname" data-name="0">You</span><span class="ludo-pstat"><b data-home="0">0</b>/4 · <b data-cap="0">0</b> caps</span></span>
      <span class="ludo-pchip" data-chip="1" style="--pc:#3b82f6"><span class="ludo-dot"></span><span class="ludo-pname" data-name="1">Blue AI</span><span class="ludo-pstat"><b data-home="1">0</b>/4 · <b data-cap="1">0</b> caps</span></span>
    </span>
    <span class="ludo-chip ludo-msg" data-msg></span>
    <span class="ludo-spacer"></span>
    <button class="ludo-btn ludo-icon-btn" type="button" data-help aria-label="How to play" title="How to play (H)">${iconSVG("helpCircle", { size: 14 })}<span class="ludo-btn-label">Help</span></button>
    <button class="ludo-btn ludo-icon-btn" type="button" data-cheats aria-label="Cheats" title="Cheats (C)">${iconSVG("wrench", { size: 14 })}<span class="ludo-btn-label">Cheats</span></button>
    <button class="ludo-btn ludo-icon-btn" type="button" data-pause aria-label="Pause" title="Pause (P)">${iconSVG("pause", { size: 14 })}<span class="ludo-btn-label">Pause</span></button>
    <button class="ludo-btn ludo-icon-btn" type="button" data-restart aria-label="Restart" title="Restart">${iconSVG("refresh", { size: 14 })}<span class="ludo-btn-label">Restart</span></button>
    <button class="ludo-btn ludo-icon-btn" type="button" data-exit aria-label="Exit game" title="Exit game">${iconSVG("logOut", { size: 14 })}<span class="ludo-btn-label">Exit game</span></button>
  </div>
  <section class="game-panel ludo-board" data-board>
    <svg class="ludo-map" viewBox="0 0 600 600" font-family="inherit" role="img" aria-label="Ludo board"></svg>
    <div class="ludo-ov" data-ov="win" hidden>
      <div class="ludo-card">
        <div class="ludo-head"><h3 data-win-title></h3></div>
        <p class="ludo-ov-sub" data-win-sub></p>
        <div class="ludo-foot"><span class="ludo-note">Race complete</span><button class="ludo-btn primary" type="button" data-act="restart">Play again</button></div>
      </div>
    </div>
    <div class="ludo-ov" data-ov="pause" hidden>
      <div class="ludo-card">
        <div class="ludo-head"><h3>Paused</h3></div>
        <div class="ludo-foot"><span class="ludo-note">Press P or Esc to resume</span><button class="ludo-btn primary" type="button" data-act="resume">Resume</button></div>
      </div>
    </div>
    <div class="ludo-ov" data-ov="cheat" hidden>
      <div class="ludo-card ludo-cheat-card">
        <div class="ludo-head"><h3>Cheats</h3><button class="ludo-btn" type="button" data-act="cheat-close">Close</button></div>
        <div class="ludo-cheats">
          <p class="ludo-cheat-note">Offline only · you are Red</p>
          <div class="ludo-cheat-sec">
            <span class="ludo-cheat-label">Next roll</span>
            <div class="ludo-dice-row">
              ${[1, 2, 3, 4, 5, 6].map((v) => `<button class="ludo-btn ludo-dice-btn" type="button" data-cheat="dice" data-value="${v}">${v}</button>`).join("")}
            </div>
          </div>
          <div class="ludo-cheat-list">
            <button class="ludo-btn" type="button" data-cheat="shield" data-shield-btn>Shield: Off</button>
            <button class="ludo-btn" type="button" data-cheat="release">Release all pawns</button>
            <button class="ludo-btn" type="button" data-cheat="warp">Warp a pawn home</button>
            <button class="ludo-btn" type="button" data-cheat="banish">Send foes to yard</button>
            <button class="ludo-btn" type="button" data-cheat="win">Win instantly</button>
          </div>
        </div>
      </div>
    </div>
    <div class="ludo-ov" data-ov="help" hidden>
      <div class="ludo-card">
        <div class="ludo-head"><h3>How to play</h3><button class="ludo-btn" type="button" data-help-close>Close</button></div>
        <div class="ludo-help">
          <div>
            <b>Desktop</b>
            <ul>
              <li><span class="ludo-chip">Space</span> — roll the die</li>
              <li><span class="ludo-chip">1</span>–<span class="ludo-chip">4</span> — pick a pawn to move</li>
              <li><span class="ludo-chip">H</span> help · <span class="ludo-chip">C</span> cheats · <span class="ludo-chip">P</span> pause · <span class="ludo-chip">R</span> restart</li>
            </ul>
            <b>Mobile</b>
            <ul>
              <li>Tap the die in the HUD to roll</li>
              <li>Tap a glowing pawn on the board to move it</li>
              <li>Use the HUD icon buttons for help, cheats, pause and restart</li>
            </ul>
          </div>
          <div>
            <b>Rules</b>
            <ul>
              <li>Race all four pawns around the track and into your home triangle.</li>
              <li>Roll a 6 to leave the yard; reach home with an exact roll.</li>
              <li>Land on a foe to send it back to its yard — star cells are safe.</li>
              <li>A 6 or a capture grants another roll; three 6s in a row forfeits the turn.</li>
              <li>First player to bring all four pawns home wins.</li>
            </ul>
            <div class="ludo-foot"><span class="ludo-note">Press H to reopen this guide</span><button class="ludo-btn primary" type="button" data-help-close>Got it</button></div>
          </div>
        </div>
      </div>
    </div>
  </section>
</div>`;

    /* ---------------- refs ---------------- */
    const board = root.querySelector("[data-board]");
    const svg = board.querySelector(".ludo-map");
    const dieSvg = root.querySelector(".ludo-die");
    const dieBtn = root.querySelector('[data-act="roll"]');
    const statusEl = root.querySelector("[data-status]");
    const statusDot = root.querySelector("[data-dot]");
    const msgEl = root.querySelector("[data-msg]");
    const forceEl = root.querySelector("[data-force]");
    const ovWin = root.querySelector('[data-ov="win"]');
    const winTitle = root.querySelector("[data-win-title]");
    const winSub = root.querySelector("[data-win-sub]");
    const ovPause = root.querySelector('[data-ov="pause"]');
    const ovCheat = root.querySelector('[data-ov="cheat"]');
    const ovHelp = root.querySelector('[data-ov="help"]');
    const shieldBtn = root.querySelector("[data-shield-btn]");
    const cheatToggleBtn = root.querySelector("[data-cheats]");
    const pauseBtn = root.querySelector("[data-pause]");
    const chips = [0, 1].map((pl) => ({
        el: root.querySelector(`[data-chip="${pl}"]`),
        name: root.querySelector(`[data-name="${pl}"]`),
        home: root.querySelector(`[data-home="${pl}"]`),
        cap: root.querySelector(`[data-cap="${pl}"]`),
    }));
    const diceBtns = Array.from(root.querySelectorAll(".ludo-dice-btn"));
    const cheatBtns = Array.from(root.querySelectorAll("[data-cheat]"));

    let aiTimer = null;
    let cheatOpen = false;
    let helpOpen = false;
    let paused = false;
    let lastRollTotal = 0;
    let seenHelp = true;
    try { seenHelp = localStorage.getItem("ludoHelpSeen") === "1"; } catch (_) { seenHelp = true; }
    if (!seenHelp) {
        helpOpen = true;
        try { localStorage.setItem("ludoHelpSeen", "1"); } catch (_) { /* storage blocked */ }
    }
    const subs = [];
    const addSub = (u) => { if (typeof u === "function") subs.push(u); };

    /* ---------------- kursi pemain (undi acak saat online) ---------------- */
    function myIndex() {
        if (!online) return 0;
        if (state && Array.isArray(state.seats)) return room.isHost ? state.seats[0] : state.seats[1];
        return fallbackIndex;
    }
    function seatName(pl) {
        if (pl === myIndex()) return online ? (playerName || "You") : "You";
        return PL[pl].label + (online ? "" : " AI");
    }

    /* ---------------- state (serializable, aman Firebase) ---------------- */
    function normalize(s) {
        if (!s) return null;
        s.movable = Array.isArray(s.movable) ? s.movable : [];
        s.winner = s.winner === 0 || s.winner === 1 ? s.winner : null;
        s.forceDice = Number.isInteger(s.forceDice) && s.forceDice >= 1 && s.forceDice <= 6 ? s.forceDice : null;
        s.shield = Boolean(s.shield);
        s.msg = typeof s.msg === "string" ? s.msg : "";
        s.seats = Array.isArray(s.seats) ? s.seats : [0, 1];
        return s;
    }
    function freshState() {
        // Undi kursi Red/Blue (online) + undi siapa jalan duluan (semua mode).
        const seats = online ? (Math.random() < 0.5 ? [0, 1] : [1, 0]) : [0, 1];
        const first = Math.random() < 0.5 ? 0 : 1;
        return normalize({
            pawns: [[-1, -1, -1, -1], [-1, -1, -1, -1]],
            turn: first,
            phase: "roll", // roll | choose | over
            dice: 6,
            sixes: 0,
            rolls: [0, 0],
            caps: [0, 0],
            movable: [],
            winner: null,
            forceDice: null,
            shield: false,
            seats,
            msg: "Coin toss — " + PL[first].label + " starts.",
        });
    }

    /* ---------------- papan statis ---------------- */
    function boardMarkup() {
        let s = '<rect x="1" y="1" width="598" height="598" rx="16" fill="#0d1526" stroke="#243354" stroke-width="1.5"/>';
        const yard = (x, y, p) => {
            s += `<rect x="${x + 8}" y="${y + 8}" width="224" height="224" rx="16" fill="${p.yard}"/>`;
            s += `<rect x="${x + 36}" y="${y + 36}" width="168" height="168" rx="12" fill="#0e1830" stroke="${p.stretch}" stroke-width="1.5"/>`;
        };
        yard(0, 0, PL[0]);
        yard(360, 0, DECOR[0]);
        yard(0, 360, DECOR[1]);
        yard(360, 360, PL[1]);
        const cell = (c, r, fill) => {
            s += `<rect x="${c * CELL}" y="${r * CELL}" width="${CELL}" height="${CELL}" fill="${fill}" stroke="#243354" stroke-width="1"/>`;
        };
        for (let i = 0; i < 52; i++) {
            const [c, r] = TRACK[i];
            const fill =
                i === PL[0].startIdx ? PL[0].start :
                    i === PL[1].startIdx ? PL[1].start :
                        i === DECOR[0].startIdx ? DECOR[0].start :
                            i === DECOR[1].startIdx ? DECOR[1].start : "#131d33";
            cell(c, r, fill);
        }
        PL.forEach((p) => p.stretchCells.forEach(([c, r]) => cell(c, r, p.stretch)));
        DECOR.forEach((p) => p.stretchCells.forEach(([c, r]) => cell(c, r, p.stretch)));
        SAFE.forEach((i) => {
            const [c, r] = TRACK[i];
            const cx = c * CELL + 20, cy = r * CELL + 20;
            const col =
                i === PL[0].startIdx ? PL[0].color :
                    i === PL[1].startIdx ? PL[1].color :
                        i === DECOR[0].startIdx ? DECOR[0].color :
                            i === DECOR[1].startIdx ? DECOR[1].color : "#5b6b85";
            s += `<path d="${STAR}" transform="translate(${cx},${cy})" fill="#0d1526" stroke="${col}" stroke-width="1.4"/>`;
        });
        const tri = (color, pts) => {
            s += `<polygon points="${pts.map((p) => p.join(",")).join(" ")}" fill="${color}" stroke="#0b1220" stroke-width="2" opacity="0.92"/>`;
        };
        tri(PL[0].tri, [[240, 240], [240, 360], [300, 300]]);
        tri(DECOR[0].tri, [[240, 240], [360, 240], [300, 300]]);
        tri(PL[1].tri, [[360, 240], [360, 360], [300, 300]]);
        tri(DECOR[1].tri, [[240, 360], [360, 360], [300, 300]]);
        PL.forEach((p) => p.slots.forEach(([x, y]) => {
            s += `<circle cx="${x}" cy="${y}" r="17" fill="#0b1220" stroke="${p.start}" stroke-width="2"/>`;
        }));
        return s;
    }

    /* ---------------- pion ---------------- */
    const pawnEls = [];
    function buildPawns() {
        for (let pl = 0; pl < 2; pl++) {
            for (let i = 0; i < 4; i++) {
                const g = document.createElementNS(SVGNS, "g");
                g.setAttribute("class", "ludo-pawn");
                g.dataset.p = pl;
                g.dataset.i = i;
                const col = PL[pl].color;
                g.innerHTML =
                    `<circle class="ring" r="15.5" fill="none" stroke="${col}" stroke-width="3"/>` +
                    `<circle class="body" r="11.5" fill="${col}" stroke="#f1f5f9" stroke-width="2"/>` +
                    `<circle class="inner" r="3.6" fill="#ffffff" opacity="0.95"/>` +
                    `<text class="num" y="3.8" text-anchor="middle" font-size="10.5" font-weight="700" fill="#ffffff">${i + 1}</text>` +
                    `<circle class="hit" r="19" fill="#ffffff" opacity="0" pointer-events="all"/>`;
                g.style.transform = `translate(${PL[pl].slots[i][0]}px,${PL[pl].slots[i][1]}px)`;
                svg.appendChild(g);
                pawnEls.push(g);
            }
        }
    }
    function pawnPos(pl, i) {
        const pos = state.pawns[pl][i];
        if (pos === -1) return PL[pl].slots[i];
        if (pos === 56) return PL[pl].home[i];
        if (pos <= 50) {
            const [c, r] = TRACK[(PL[pl].startIdx + pos) % 52];
            return [c * CELL + 20, r * CELL + 20];
        }
        const [c, r] = PL[pl].stretchCells[pos - 51];
        return [c * CELL + 20, r * CELL + 20];
    }
    function locKey(pl, i) {
        const pos = state.pawns[pl][i];
        if (pos === -1 || pos === 56) return "u" + pl + "-" + i;
        if (pos <= 50) return "t" + ((PL[pl].startIdx + pos) % 52);
        return "s" + pl + "-" + pos;
    }
    function offsets(n) {
        if (n <= 1) return [[0, 0]];
        const R = n === 2 ? 7 : n <= 4 ? 8 : 10;
        const out = [];
        for (let k = 0; k < n; k++) {
            const a = -Math.PI / 2 + (k * 2 * Math.PI) / n;
            out.push([Math.cos(a) * R, Math.sin(a) * R]);
        }
        return out;
    }

    /* ---------------- dadu ---------------- */
    function showDie(v) {
        dieSvg.innerHTML =
            '<rect x="2" y="2" width="60" height="60" rx="14" fill="#e2e8f0"/>' +
            PIPS[v].map((p) => `<circle cx="${p[0]}" cy="${p[1]}" r="5" fill="#0f172a"/>`).join("");
    }

    /* ---------------- render ---------------- */
    function render() {
        if (!state) {
            statusEl.textContent = online ? "Waiting for host…" : "Ready";
            statusDot.style.background = "#64748b";
            msgEl.textContent = "";
            msgEl.title = "";
            syncUI();
            return;
        }
        const mine = myIndex();
        const over = state.winner !== null;

        statusEl.textContent = over
            ? (state.winner === mine ? "You win" : PL[state.winner].label + " wins")
            : (state.turn === mine ? "Your turn" : PL[state.turn].label + "'s turn");
        statusDot.style.background = PL[over ? state.winner : state.turn].color;

        for (let pl = 0; pl < 2; pl++) {
            chips[pl].el.classList.toggle("active", !over && state.turn === pl);
            chips[pl].name.textContent = seatName(pl);
            chips[pl].home.textContent = state.pawns[pl].filter((p) => p === 56).length;
            chips[pl].cap.textContent = state.caps[pl];
        }

        showDie(state.dice);
        forceEl.hidden = !state.forceDice;
        if (state.forceDice) forceEl.textContent = "next · " + state.forceDice;

        const total = state.rolls[0] + state.rolls[1];
        if (total !== lastRollTotal) {
            lastRollTotal = total;
            dieBtn.classList.remove("pop");
            void dieBtn.offsetWidth;
            dieBtn.classList.add("pop");
        }

        const groups = {};
        for (let pl = 0; pl < 2; pl++) {
            for (let i = 0; i < 4; i++) {
                const k = locKey(pl, i);
                (groups[k] || (groups[k] = [])).push(pl * 4 + i);
            }
        }
        Object.keys(groups).forEach((k) => {
            const list = groups[k];
            const off = offsets(list.length);
            list.forEach((id, idx) => {
                const pl = Math.floor(id / 4), i = id % 4;
                const p = pawnPos(pl, i);
                pawnEls[id].style.transform = `translate(${p[0] + off[idx][0]}px,${p[1] + off[idx][1]}px)`;
            });
        });
        const canPick = !over && state.phase === "choose" && state.turn === mine && !uiBlocked();
        pawnEls.forEach((g, id) => {
            const pl = Math.floor(id / 4), i = id % 4;
            g.classList.toggle("movable", canPick && pl === mine && state.movable.includes(i));
        });

        msgEl.textContent = state.msg;
        msgEl.title = state.msg;

        if (over) {
            const mineWin = state.winner === mine;
            winTitle.textContent = mineWin ? "You win" : PL[state.winner].label + " wins";
            winTitle.style.color = mineWin ? "#4ade80" : "#f87171";
            winSub.textContent =
                "Captures — Red " + state.caps[0] + " · Blue " + state.caps[1] +
                ". Rolls — Red " + state.rolls[0] + " · Blue " + state.rolls[1] + ".";
        }
        syncUI();
    }

    /* Overlay saling menekan: help > cheats > pause > hasil. */
    function uiBlocked() { return helpOpen || cheatOpen || paused; }
    function syncUI() {
        const over = Boolean(state && state.winner !== null);
        ovHelp.hidden = !helpOpen;
        ovCheat.hidden = !cheatOpen || helpOpen;
        ovPause.hidden = !paused || cheatOpen || helpOpen;
        ovWin.hidden = !over || uiBlocked();

        const canRoll = Boolean(state && !over && state.phase === "roll" &&
            state.turn === myIndex() && !uiBlocked());
        dieBtn.disabled = !canRoll;
        dieBtn.classList.toggle("armed", canRoll);

        if (cheatToggleBtn) cheatToggleBtn.classList.toggle("on", cheatOpen);
        if (pauseBtn) {
            const label = pauseBtn.querySelector(".ludo-btn-label");
            if (label) label.textContent = paused ? "Resume" : "Pause";
            pauseBtn.setAttribute("aria-label", paused ? "Resume" : "Pause");
            pauseBtn.title = (paused ? "Resume" : "Pause") + " (P)";
            pauseBtn.disabled = online;
        }
        if (cheatOpen && state) {
            shieldBtn.textContent = "Shield: " + (state.shield ? "On" : "Off");
            diceBtns.forEach((b) => b.classList.toggle("sel", +b.dataset.value === state.forceDice));
            cheatBtns.forEach((b) => { b.disabled = over; });
        }
    }

    function publish() {
        render();
        if (online && room.isHost) room.publishState(state).catch(console.warn);
        if (!online) scheduleAI();
    }

    /* ---------------- aturan ---------------- */
    function movablePawns(pl, v) {
        const out = [];
        for (let i = 0; i < 4; i++) {
            const p = state.pawns[pl][i];
            if (p === -1 ? v === 6 : p + v <= 56) out.push(i);
        }
        return out;
    }
    function passTurn() {
        state.sixes = 0;
        state.turn = 1 - state.turn;
        state.phase = "roll";
        state.movable = [];
    }
    function execMove(pl, pi) {
        const v = state.dice;
        const pos = state.pawns[pl][pi];
        if (pos === -1 && v !== 6) return;
        if (pos !== -1 && pos + v > 56) return;
        const name = PL[pl].label;
        state.movable = [];
        state.pawns[pl][pi] = pos === -1 ? 0 : pos + v;
        const np = state.pawns[pl][pi];
        let captured = false;
        let extra = "";
        if (np <= 50) {
            const cell = (PL[pl].startIdx + np) % 52;
            const op = 1 - pl;
            const shielded = !online && op === 0 && state.shield;
            if (!SAFE.has(cell) && !shielded) {
                for (let j = 0; j < 4; j++) {
                    const o = state.pawns[op][j];
                    if (o >= 0 && o <= 50 && (PL[op].startIdx + o) % 52 === cell) {
                        state.pawns[op][j] = -1;
                        captured = true;
                        state.caps[pl]++;
                    }
                }
            }
        }
        if (captured) extra += name + " captured a pawn. ";
        if (np === 56) extra += name + " pawn reached home. ";
        else if (np === 51) extra += name + " entered the home stretch. ";

        if (state.pawns[pl].every((p) => p === 56)) {
            state.winner = pl;
            state.phase = "over";
            state.movable = [];
            state.msg = name + " wins!";
            return;
        }
        if (v === 6 || captured) {
            state.phase = "roll";
            state.msg = (extra + name + " rolls again.").trim();
        } else {
            state.msg = extra.trim() || name + " moved.";
            passTurn();
        }
    }

    /* ---------------- AI (hanya mode offline) ---------------- */
    function pickAI(mov, v) {
        let best = mov[0], bs = -Infinity;
        const active = state.pawns[1].filter((p) => p >= 0 && p < 56).length;
        for (const pi of mov) {
            const pos = state.pawns[1][pi];
            let sc;
            if (pos === -1) {
                sc = 55 + (active <= 1 ? 20 : 0);
            } else {
                const t = pos + v;
                sc = 14 + t * 0.45;
                if (t === 56) sc += 95;
                if (t >= 51 && pos < 51) sc += 26;
                if (t <= 50) {
                    const cell = (26 + t) % 52;
                    const safe = SAFE.has(cell);
                    if (safe) sc += 12;
                    for (let j = 0; j < 4; j++) {
                        const o = state.pawns[0][j];
                        if (o < 0 || o > 50) continue;
                        const oc = (PL[0].startIdx + o) % 52;
                        if (oc === cell && !safe && !state.shield) sc += 110;
                        if (!safe) {
                            const d = (cell - oc + 52) % 52;
                            if (d >= 1 && d <= 6) sc -= 7;
                        }
                    }
                }
            }
            sc += Math.random() * 5;
            if (sc > bs) { bs = sc; best = pi; }
        }
        return best;
    }
    function scheduleAI() {
        if (aiTimer) { clearTimeout(aiTimer); aiTimer = null; }
        // Pause/help/cheats membekukan bot; saat resume timer dijadwalkan ulang
        // sehingga penanda waktu tidak pernah "loncat" melampaui jeda.
        if (paused || helpOpen || cheatOpen) return;
        if (online || !state || state.winner !== null || state.turn !== 1) return;
        if (state.phase === "roll") {
            aiTimer = setTimeout(() => { aiTimer = null; applyAction({ type: "roll" }, 1); }, 750);
        } else if (state.phase === "choose") {
            aiTimer = setTimeout(() => {
                aiTimer = null;
                const mov = state.movable || [];
                if (!mov.length) return;
                applyAction({ type: "move", pawn: pickAI(mov, state.dice) }, 1);
            }, 620);
        }
    }

    /* ---------------- cheat (offline saja) ---------------- */
    function applyCheat(action) {
        if (!state || state.winner !== null) return;
        const c = action.cheat;
        if (c === "dice") {
            const v = Number(action.value);
            if (Number.isInteger(v) && v >= 1 && v <= 6) {
                state.forceDice = v;
                state.msg = "Cheat armed — next roll is " + v + ".";
            }
        } else if (c === "shield") {
            state.shield = !state.shield;
            state.msg = "Cheat — shield " + (state.shield ? "on." : "off.");
        } else if (c === "release") {
            state.pawns[0] = state.pawns[0].map((p) => (p === -1 ? 0 : p));
            state.msg = "Cheat — all pawns released.";
        } else if (c === "warp") {
            let bi = -1, bp = -2;
            state.pawns[0].forEach((p, i) => { if (p < 56 && p > bp) { bp = p; bi = i; } });
            if (bi >= 0) { state.pawns[0][bi] = 56; state.msg = "Cheat — a pawn warped home."; }
            if (state.pawns[0].every((p) => p === 56)) {
                state.winner = 0; state.phase = "over"; state.movable = [];
                state.msg = "You win!";
                return;
            }
        } else if (c === "banish") {
            state.pawns[1] = state.pawns[1].map((p) => (p >= 0 && p < 56 ? -1 : p));
            state.msg = "Cheat — foes sent to the yard.";
        } else if (c === "win") {
            state.pawns[0] = [56, 56, 56, 56];
            state.winner = 0; state.phase = "over"; state.movable = [];
            state.msg = "You win!";
            return;
        } else {
            return;
        }
        if (state.phase === "choose") {
            const m = movablePawns(state.turn, state.dice);
            state.movable = m;
            if (!m.length) passTurn();
        }
    }
    function setCheatOpen(v) {
        cheatOpen = Boolean(v) && !online && !helpOpen;
        if (cheatOpen && aiTimer) { clearTimeout(aiTimer); aiTimer = null; }
        render();
        if (!cheatOpen) scheduleAI();
    }
    function toggleHelp(on) {
        helpOpen = typeof on === "boolean" ? on : !helpOpen;
        if (helpOpen) {
            cheatOpen = false;
            if (aiTimer) { clearTimeout(aiTimer); aiTimer = null; }
        }
        render();
        if (!helpOpen && !cheatOpen && !paused) scheduleAI();
    }
    function setPaused(v) {
        paused = Boolean(v) && !online && !helpOpen && !cheatOpen;
        if (paused && aiTimer) { clearTimeout(aiTimer); aiTimer = null; }
        syncUI();
        if (!paused) scheduleAI();
    }

    /* ---------------- aksi (host otoritatif) ---------------- */
    function applyAction(action, actor) {
        if (!state || !action || typeof action.type !== "string") return;
        if (actor !== 0 && actor !== 1) return;
        switch (action.type) {
            case "restart": {
                state = freshState();
                publish();
                break;
            }
            case "roll": {
                if (state.winner !== null || state.phase !== "roll" || state.turn !== actor) return;
                let v;
                if (!online && actor === 0 && state.forceDice) {
                    v = state.forceDice;
                    state.forceDice = null;
                } else {
                    v = 1 + Math.floor(Math.random() * 6);
                }
                state.rolls[actor]++;
                state.dice = v;
                state.sixes = v === 6 ? state.sixes + 1 : 0;
                const name = PL[actor].label;
                if (state.sixes >= 3) {
                    state.msg = name + " rolled a third 6 — turn forfeited.";
                    passTurn();
                    publish();
                    break;
                }
                const mov = movablePawns(actor, v);
                if (!mov.length) {
                    state.msg = name + " rolled " + v + " — no possible move.";
                    passTurn();
                    publish();
                    break;
                }
                if (mov.length === 1) {
                    state.msg = name + " rolled " + v + ".";
                    execMove(actor, mov[0]);
                    publish();
                    break;
                }
                state.phase = "choose";
                state.movable = mov;
                state.msg = name + " rolled " + v + " — pick a pawn.";
                publish();
                break;
            }
            case "move": {
                if (state.winner !== null || state.phase !== "choose" || state.turn !== actor) return;
                const pi = action.pawn;
                if (!Number.isInteger(pi) || !state.movable.includes(pi)) return;
                execMove(actor, pi);
                publish();
                break;
            }
            case "cheat": {
                if (online || actor !== 0) return;
                applyCheat(action);
                publish();
                break;
            }
        }
    }

    function submitAction(action) {
        if (online && !room.isHost) {
            room.sendAction(action).catch(console.warn);
            return;
        }
        applyAction(action, myIndex());
    }

    /* ---------------- input: mouse + sentuh langsung + keyboard ---------------- */
    function restartGame() {
        paused = false;
        cheatOpen = false;
        helpOpen = false;
        submitAction({ type: "restart" });
    }
    function tryRoll() {
        if (uiBlocked()) return;
        if (state && state.winner === null && state.phase === "roll" && state.turn === myIndex()) {
            submitAction({ type: "roll" });
        }
    }
    function tryMove(i) {
        if (uiBlocked()) return;
        if (state && state.winner === null && state.phase === "choose" &&
            state.turn === myIndex() && state.movable.includes(i)) {
            submitAction({ type: "move", pawn: i });
        }
    }
    function handleClick(event) {
        const t = event.target;
        if (t.closest("[data-help]")) { toggleHelp(); return; }
        if (t.closest("[data-help-close]")) { toggleHelp(false); return; }
        if (t.closest("[data-exit]")) { onExit(); return; }
        if (t.closest("[data-cheats]")) { setCheatOpen(!cheatOpen); return; }
        if (t.closest("[data-pause]")) { setPaused(!paused); return; }
        const act = t.closest("[data-act]");
        if (act) {
            const a = act.dataset.act;
            if (a === "roll") { if (!act.disabled) submitAction({ type: "roll" }); }
            else if (a === "resume") setPaused(false);
            else if (a === "restart") restartGame();
            else if (a === "cheat-close") setCheatOpen(false);
            return;
        }
        const ch = t.closest("[data-cheat]");
        if (ch) {
            submitAction({
                type: "cheat",
                cheat: ch.dataset.cheat,
                value: ch.dataset.value ? +ch.dataset.value : undefined,
            });
            return;
        }
        const pawn = t.closest(".ludo-pawn");
        if (pawn) {
            if (uiBlocked()) return;
            if (!state || state.winner !== null || state.phase !== "choose" || state.turn !== myIndex()) return;
            const pl = +pawn.dataset.p, pi = +pawn.dataset.i;
            if (pl !== myIndex() || !state.movable.includes(pi)) return;
            submitAction({ type: "move", pawn: pi });
        }
    }
    function onKey(e) {
        if (e.repeat) return;
        const k = e.key, code = e.code;
        // Prioritas: help → cheats → pause → Escape → aksi game.
        if (code === "KeyH") { toggleHelp(); e.preventDefault(); return; }
        if (code === "KeyC") { if (!helpOpen) setCheatOpen(!cheatOpen); e.preventDefault(); return; }
        if (code === "KeyP" || code === "Escape") {
            if (helpOpen) toggleHelp(false);
            else if (cheatOpen) setCheatOpen(false);
            else if (code === "KeyP") setPaused(!paused);
            else if (paused) setPaused(false);
            e.preventDefault();
            return;
        }
        if (helpOpen || cheatOpen) {
            if (cheatOpen && !online && k >= "1" && k <= "6") {
                submitAction({ type: "cheat", cheat: "dice", value: +k });
            }
            return;
        }
        if (code === "KeyR") { restartGame(); e.preventDefault(); return; }
        if (paused) return;
        if (code === "Space") { e.preventDefault(); tryRoll(); return; }
        if (k >= "1" && k <= "4") { tryMove(+k - 1); return; }
    }

    /* ---------------- init ---------------- */
    svg.innerHTML = boardMarkup();
    buildPawns();
    showDie(6);
    cheatToggleBtn.hidden = online;
    root.addEventListener("click", handleClick);
    document.addEventListener("keydown", onKey);

    if (online) {
        if (typeof room.onRoom === "function") {
            addSub(room.onRoom((nextRoom) => { roomData = nextRoom; render(); }));
        }
        if (room.isHost) {
            state = freshState();
            publish();
            if (typeof room.onAction === "function") {
                // Aksi guest selalu diterapkan sebagai kursi guest hasil undian.
                addSub(room.onAction((action) =>
                    applyAction(action, state && Array.isArray(state.seats) ? state.seats[1] : 1)));
            }
        } else {
            render();
            if (typeof room.onState === "function") {
                addSub(room.onState((nextState) => { state = normalize(nextState); render(); }));
            }
        }
    } else {
        state = freshState();
        publish();
    }

    return {
        destroy() {
            if (aiTimer) { clearTimeout(aiTimer); aiTimer = null; }
            root.removeEventListener("click", handleClick);
            document.removeEventListener("keydown", onKey);
            subs.forEach((u) => { try { u(); } catch (_) { } });
            subs.length = 0;
        },
    };
}