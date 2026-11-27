/* ==== GAME: lucky-wheel.js ==== */
/* Lucky Wheel — minimalist casino race, template META + mount().
   - Fixed 8-wedge wheel (no level generator, no tutorial texts).
   - mode "ai": you vs Bot, random coin toss decides who spins first.
   - mode "room": random P1/P2 slot draw (host is NOT always P1),
     random first turn. Host is authoritative for all state.
   - Economy: start balance 100, each spin costs 10. Payouts add coins,
     Mystery can subtract. Collect all 6 prize types or hit Jackpot to win.
   - Controls: mouse click / tap on wheel or SPIN hub (no virtual pad),
     keyboard Space/Enter = spin, H = help, C = cheats, P/Esc = pause,
     R = restart.
   - Layout: HUD bar + fill-height board, overlays are internal modals. */

import { iconSVG } from "../JS/icons.js";

const SEGMENTS = [
    { icon: "star", label: "Star", short: "Star", weight: 2, collect: "star", pay: 8 },
    { icon: "candy", label: "Candy", short: "Candy", weight: 2, collect: "candy", pay: 8 },
    { icon: "gem", label: "Gem", short: "Gem", weight: 2, collect: "gem", pay: 8 },
    { icon: "ticket", label: "Ticket", short: "Ticket", weight: 2, collect: "ticket", pay: 8 },
    { icon: "coin", label: "Coin x2", short: "x2", weight: 3, collect: "coin", pay: 20 },
    { icon: "coin", label: "Coin x5", short: "x5", weight: 1, collect: "coin", pay: 50 },
    { icon: "jackpot", label: "Jackpot", short: "JACKPOT", weight: 1, collect: null, pay: 100 },
    { icon: "mystery", label: "Mystery", short: "Mystery", weight: 3, collect: "mystery", pay: 0 },
];
const COLLECT_KEYS = ["star", "candy", "gem", "ticket", "coin", "mystery"];
const COLLECT_LABELS = { star: "Star", candy: "Candy", gem: "Gem", ticket: "Ticket", coin: "Coin", mystery: "Mystery" };
const TOTAL_SPINS = 12;
const START_BALANCE = 100;
const SPIN_COST = 10;
const SPIN_MS = 3700;
const BOT_DELAY = 1100;
/* Mystery: [delta, weight] — can grow or shrink the balance */
const MYSTERY_OUTCOMES = [[-20, 2], [-10, 3], [5, 3], [15, 2], [30, 1]];

function spinIndex(rng = Math.random) {
    let total = 0;
    for (const s of SEGMENTS) total += s.weight;
    let r = rng() * total;
    for (let i = 0; i < SEGMENTS.length; i++) {
        r -= SEGMENTS[i].weight;
        if (r < 0) return i;
    }
    return SEGMENTS.length - 1;
}

function mysteryDelta(rng = Math.random) {
    let total = 0;
    for (const [, w] of MYSTERY_OUTCOMES) total += w;
    let r = rng() * total;
    for (const [d, w] of MYSTERY_OUTCOMES) {
        r -= w;
        if (r < 0) return d;
    }
    return MYSTERY_OUTCOMES[MYSTERY_OUTCOMES.length - 1][0];
}

function collectionComplete(list) {
    const set = new Set(list);
    return COLLECT_KEYS.every((k) => set.has(k));
}

export const META = {
    id: "lucky-wheel", // harus sama dengan nama file (tanpa .js)
    name: "Lucky Wheel",
    category: "casino",
    catLabel: "Casino",
    desc: "Race a rival on the prize wheel: collect all 6 prizes or hit the Jackpot. Every spin costs coins.",
    art: '<svg viewBox="0 0 48 48" width="54" height="54" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="24" cy="27" r="15"/><path d="M24 12v30"/><path d="M9 27h30"/><path d="M13.4 16.4l21.2 21.2"/><path d="M34.6 16.4L13.4 37.6"/><circle cx="24" cy="27" r="3" fill="currentColor" stroke="none"/><path d="M18.5 2h11L24 9.5z" fill="currentColor" stroke="none"/></svg>',
    bg: ["#fde68a", "#fbbf24"],
    bestKey: "luckyWheelBest",
};

export function mount(root, context = {}) {
    const { mode = "ai", room = null, playerName = "Player", onExit = () => { } } = context;
    const online = mode === "room" && Boolean(room);
    let roomData = room?.room || null;
    let state = null;

    /* ---------------- local UI state ---------------- */
    let cheatOpen = false;
    let helpOpen = false;
    let paused = false;
    let destroyed = false;
    let spinTimer = null;
    let botTimer = null;
    let shownRot = 0;
    let frozenTransform = null;
    const timers = new Set();
    const unsubs = [];

    /* panduan internal sekali per game (global how-to tidak dipakai) */
    let seenHelp = true;
    try { seenHelp = localStorage.getItem("luckyWheelHelpSeen") === "1"; } catch (_) { seenHelp = true; }
    if (!seenHelp) {
        helpOpen = true;
        try { localStorage.setItem("luckyWheelHelpSeen", "1"); } catch (_) { /* storage blocked */ }
    }

    /* timer sadar-pause: semua deadline memakai anchor Date.now() yang
       digeser saat resume sehingga bot/spin tidak loncat setelah freeze. */
    let freezeAt = 0;
    function schedule(ms, fn) {
        const rec = { fn, due: (freezeAt || Date.now()) + ms, id: 0 };
        rec.arm = () => {
            rec.id = setTimeout(() => {
                rec.id = 0;
                if (freezeAt) return;
                timers.delete(rec);
                if (!destroyed) fn();
            }, Math.max(0, rec.due - Date.now()));
        };
        timers.add(rec);
        if (!freezeAt) rec.arm();
        return rec;
    }
    function cancelTimer(rec) {
        if (!rec) return;
        if (rec.id) clearTimeout(rec.id);
        rec.id = 0;
        timers.delete(rec);
    }
    function freezeTimers() {
        if (freezeAt) return;
        freezeAt = Date.now();
        for (const rec of timers) { if (rec.id) clearTimeout(rec.id); rec.id = 0; }
    }
    function thawTimers() {
        if (!freezeAt) return;
        const shift = Date.now() - freezeAt;
        freezeAt = 0;
        for (const rec of timers) { rec.due += shift; rec.arm(); }
    }
    function freezeWheel() {
        if (frozenTransform != null) return;
        const m = getComputedStyle(wheelSvg).transform;
        frozenTransform = m && m !== "none" ? m : "rotate(" + shownRot + "deg)";
        wheelSvg.style.transition = "none";
        wheelSvg.style.transform = frozenTransform;
        void wheelSvg.getBoundingClientRect();
    }
    function thawWheel() {
        if (frozenTransform == null) return;
        frozenTransform = null;
        wheelSvg.style.transition = "";
        wheelSvg.style.transform = "rotate(" + shownRot + "deg)";
    }
    function syncFreeze() {
        const frozen = paused || helpOpen || cheatOpen;
        if (frozen) { freezeTimers(); freezeWheel(); }
        else { thawTimers(); thawWheel(); }
    }

    /* ---------------- shell: HUD + fill-height board + overlays ---------------- */
    root.innerHTML = `
<style>
.lw-app{--line:#ffffff14;--muted:#8b93a7;--ink:#e7eaf0;--accent:#e3b341;color:var(--ink);font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;display:flex;flex-direction:column;gap:10px;width:100%;height:100%;min-height:0;margin:0 auto;min-width:0;user-select:none;-webkit-user-select:none}
.lw-app [hidden]{display:none!important}
.lw-app .lw-hud{display:flex;align-items:center;gap:6px;flex-wrap:wrap;min-width:0;font:600 11px/1 ui-monospace,SFMono-Regular,Menlo,monospace}
.lw-app .lw-chip{display:inline-flex;align-items:center;gap:6px;padding:5px 9px;border:1px solid var(--line);border-radius:999px;background:#ffffff07;color:var(--muted);white-space:nowrap;letter-spacing:.08em;text-transform:uppercase}
.lw-app .lw-chip b{color:var(--ink);font-weight:700;font-variant-numeric:tabular-nums}
.lw-app .lw-status i{width:6px;height:6px;border-radius:50%;background:var(--accent);flex:none}
.lw-app .lw-spacer{flex:1 1 auto}
.lw-app .lw-btn{appearance:none;border:1px solid var(--line);background:#ffffff0a;color:var(--ink);border-radius:9px;padding:7px 11px;min-height:36px;font:inherit;font-size:10px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;cursor:pointer;touch-action:manipulation;transition:border-color .15s ease,background .15s ease,transform .1s ease}
.lw-app .lw-btn:hover:not(:disabled){border-color:#e3b34166}
.lw-app .lw-btn:active{transform:scale(.98)}
.lw-app .lw-btn:disabled{opacity:.4;cursor:default}
.lw-app .lw-btn.primary{border-color:#e3b34155;background:#e3b3411a;color:#fde68a}
.lw-app .lw-btn.ghost{background:transparent}
.lw-app .lw-btn.sm{min-height:32px;padding:5px 10px;font-size:9px}
.lw-app .lw-icon-btn{display:inline-flex;align-items:center;gap:6px}
.lw-app .lw-icon-btn svg{flex:none;display:block}
.lw-app .lw-spinbtn{border-color:#e3b34155;background:#e3b3411a;color:#fde68a}
.lw-app .lw-spinbtn small{font-size:9px;letter-spacing:0;color:var(--muted)}
.lw-app .lw-board{position:relative;display:flex;align-items:center;justify-content:center;flex:1 1 auto;min-height:0;width:100%;padding:14px;border:1px solid var(--line);border-radius:12px;background:#0a0f1f80;overflow:hidden}
.lw-app .lw-layout{display:flex;flex-wrap:wrap;gap:24px;align-items:center;justify-content:center;width:100%;max-width:820px;min-width:0}
.lw-app .lw-wheel-wrap{position:relative;width:min(320px,100%);aspect-ratio:1/1;flex:0 1 320px;max-width:320px}
.lw-app .lw-wheel{width:100%;height:100%;display:block;transition:transform 3.6s cubic-bezier(.15,.85,.25,1);cursor:pointer;touch-action:manipulation}
.lw-app .lw-wheel.off{cursor:default}
.lw-app .lw-pointer{position:absolute;top:-6px;left:50%;transform:translateX(-50%);z-index:3}
.lw-app .lw-hub{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:34%;aspect-ratio:1/1;z-index:2}
.lw-app .lw-spin{width:100%;height:100%;border-radius:50%;border:1px solid #e3b34166;background:#141b2b;color:#e3b341;font-weight:800;font-size:15px;letter-spacing:.08em;cursor:pointer;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;touch-action:manipulation;transition:background .16s ease,opacity .16s ease}
.lw-app .lw-spin small{font-weight:600;color:#8b93a7;font-size:10px;letter-spacing:0}
.lw-app .lw-spin:disabled{opacity:.45;cursor:default}
.lw-app .lw-spin:not(:disabled):hover{background:#1a2336}
.lw-app .lw-side{display:flex;flex-direction:column;gap:12px;flex:1 1 260px;min-width:0;max-width:320px;width:100%}
.lw-app .lw-player{border:1px solid #ffffff12;background:#121826;border-radius:10px;padding:12px 14px;display:flex;flex-direction:column;gap:8px;min-width:0;transition:border-color .16s ease}
.lw-app .lw-player.active{border-color:#e3b34188}
.lw-app .lw-p-head{display:flex;align-items:center;gap:8px;font-size:13px;font-weight:700;flex-wrap:wrap;min-width:0}
.lw-app .lw-pos{font-size:10px;font-weight:600;color:#8b93a7;border:1px solid #ffffff1a;border-radius:6px;padding:1px 5px}
.lw-app .lw-tag{font-size:10px;color:#f87171}
.lw-app .lw-dot{width:6px;height:6px;border-radius:50%;background:#e3b341;margin-left:auto;opacity:0;flex:none}
.lw-app .lw-player.active .lw-dot{opacity:1}
.lw-app .lw-nums{display:flex;gap:12px;align-items:baseline;flex-wrap:wrap;font-size:12px;color:#8b93a7}
.lw-app .lw-nums b{color:#e7eaf0;font-size:13px}
.lw-app .lw-next{font-size:10px;color:#e3b341;margin-left:auto}
.lw-app .lw-coll{display:flex;gap:6px;flex-wrap:wrap}
.lw-app .lw-cell{width:34px;height:34px;border-radius:8px;background:#0e1420;border:1px solid #ffffff0d;display:flex;align-items:center;justify-content:center}
.lw-app .lw-cell svg{opacity:.22;filter:grayscale(1)}
.lw-app .lw-cell.got{border-color:#e3b34155}
.lw-app .lw-cell.got svg{opacity:1;filter:none}
.lw-app .lw-banner{font-size:12.5px;color:#aeb6c8;text-align:center;border:1px dashed #ffffff14;border-radius:10px;padding:8px 12px;min-height:18px;line-height:1.45}
.lw-app .lw-ov{position:absolute;inset:0;z-index:5;display:flex;align-items:center;justify-content:center;padding:14px;background:#0b101cd9;backdrop-filter:blur(3px)}
.lw-app .lw-card{display:flex;flex-direction:column;gap:10px;width:min(430px,100%);max-height:100%;overflow:hidden;padding:18px;background:#121826;border:1px solid var(--line);border-radius:12px;text-align:center}
.lw-app .lw-head{flex:none;display:flex;align-items:center;justify-content:space-between;gap:8px}
.lw-app .lw-head h3{margin:0;font-size:19px}
.lw-app .lw-head b{font-size:12px;letter-spacing:.18em;text-transform:uppercase;color:#fde68a}
.lw-app .lw-body,.lw-app .lw-cheat-body,.lw-app .lw-help{flex:1 1 auto;min-height:0;overflow:auto}
.lw-app .lw-body p{margin:0 0 10px;font-size:12px;color:var(--muted);line-height:1.5}
.lw-app .lw-over-stats{font-weight:700;color:#e7eaf0!important}
.lw-app .lw-foot{flex:none;display:flex;align-items:center;justify-content:flex-end;gap:8px;flex-wrap:wrap;padding-top:10px;border-top:1px solid var(--line)}
.lw-app .lw-note{margin-right:auto;font-size:10px;color:var(--muted);line-height:1.4}
.lw-app .lw-cheat-body{display:flex;flex-direction:column;gap:6px;text-align:left}
.lw-app .lw-cheat-row{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:8px 0;border-top:1px solid var(--line)}
.lw-app .lw-cheat-row b{display:block;font-size:12px}
.lw-app .lw-cheat-row small{display:block;font-size:10px;color:var(--muted)}
.lw-app .lw-cheat-btn{flex:none;min-width:64px;min-height:44px;border-radius:9px;border:1px solid var(--line);background:#ffffff0a;color:var(--ink);font-size:11px;font-weight:700;cursor:pointer}
.lw-app .lw-cheat-btn:hover:not(:disabled){border-color:#e3b34166}
.lw-app .lw-cheat-btn.on{border-color:#e3b341;background:#e3b3411a;color:#fde68a}
.lw-app .lw-cheat-btn:disabled{opacity:.4;cursor:default}
.lw-app .lw-help{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:14px;text-align:left}
.lw-app .lw-help b{display:block;margin-bottom:6px;font-size:10px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#fde68a}
.lw-app .lw-help ul{margin:0 0 12px;padding-left:16px;font-size:11px;line-height:1.6;color:var(--muted)}
.lw-app kbd{font:600 9px/1 inherit;letter-spacing:.05em;color:var(--muted);border:1px solid var(--line);border-radius:5px;padding:2px 5px;margin-left:2px}
.lw-app .lw-wheel:focus-visible,.lw-app .lw-spin:focus-visible,.lw-app .lw-btn:focus-visible,.lw-app .lw-cheat-btn:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
@media (hover:none){.lw-app kbd{display:none}}
@media (pointer:coarse){.lw-app .lw-cheat-btn{min-height:44px}}
@media (prefers-reduced-motion:reduce){.lw-app .lw-wheel{transition-duration:.01ms!important}.lw-app .lw-spin,.lw-app .lw-btn{transition:none}}
/* --- layout overrides (keep last) --- */
.lw-app.game-fill > .lw-board{flex:1 1 auto;min-height:0;aspect-ratio:auto}
@media (max-width:640px){
.lw-app.game-fill > .lw-board:not(:has(.lw-ov:not([hidden]))){flex:1 1 auto;min-height:0;aspect-ratio:auto}
.lw-app.game-fill > .lw-board:has(.lw-ov:not([hidden])){flex:0 0 auto;min-height:min(70dvh,620px);aspect-ratio:auto}
.lw-app .lw-hud{gap:5px}
.lw-app .lw-hud .lw-chip{padding:4px 6px;font-size:9px}
.lw-app .lw-hud .lw-chip[data-hud="first"]{display:none}
.lw-app .lw-hud .lw-btn{min-height:32px;padding:5px 8px;font-size:9px}
.lw-app .lw-hud .lw-btn-label,.lw-app .lw-spacer{display:none}
.lw-app .lw-hud .lw-spinbtn{min-height:32px;padding:5px 8px;font-size:9px}
.lw-app .lw-board{padding:12px 8px}
.lw-app .lw-layout{gap:16px}
.lw-app .lw-wheel-wrap{flex-basis:min(280px,100%);width:min(280px,100%)}
.lw-app .lw-side{flex-basis:100%;max-width:none}
.lw-app .lw-spin{font-size:14px}
.lw-app .lw-ov{padding:8px}
.lw-app .lw-card{width:100%;height:100%;max-height:100%;padding:12px;border-radius:12px}
.lw-app .lw-body,.lw-app .lw-cheat-body,.lw-app .lw-help{scrollbar-width:none}
.lw-app .lw-body::-webkit-scrollbar,.lw-app .lw-cheat-body::-webkit-scrollbar,.lw-app .lw-help::-webkit-scrollbar{display:none}
.lw-app .lw-note{display:none}
}
</style>
<div class="game-app lw-app game-fill" data-lw>
  <div class="lw-hud">
    <span class="lw-chip lw-status"><i class="game-status-dot"></i><span data-status>Ready</span></span>
    <span class="lw-chip">YOU <b data-hud="you">${START_BALANCE}</b></span>
    <span class="lw-chip">RIVAL <b data-hud="rival">${START_BALANCE}</b></span>
    <span class="lw-chip">LEFT <b data-hud="left">${TOTAL_SPINS}</b></span>
    <span class="lw-chip">PRIZES <b data-hud="prizes">0/6</b></span>
    <span class="lw-chip" data-hud="first">FIRST —</span>
    <span class="lw-chip" data-best-chip hidden>BEST <b data-hud="best">0</b></span>
    <span class="lw-spacer"></span>
    <button class="lw-btn lw-spinbtn" type="button" data-act="spin" data-spin-btn disabled>SPIN <small>−${SPIN_COST}</small></button>
    <button class="lw-btn lw-icon-btn" type="button" data-help aria-label="How to play" title="How to play (H)">${iconSVG("helpCircle", { size: 14 })}<span class="lw-btn-label">Help</span></button>
    <button class="lw-btn lw-icon-btn" type="button" data-cheats aria-label="Cheats" title="Cheats (C)">${iconSVG("wrench", { size: 14 })}<span class="lw-btn-label">Cheats</span></button>
    <button class="lw-btn lw-icon-btn" type="button" data-pause aria-label="Pause" title="Pause (P)"><span class="lw-icon">${iconSVG("pause", { size: 14 })}</span><span class="lw-btn-label">Pause</span></button>
    <button class="lw-btn lw-icon-btn" type="button" data-restart aria-label="Restart" title="Restart (R)">${iconSVG("refresh", { size: 14 })}<span class="lw-btn-label">Restart</span></button>
    <button class="lw-btn lw-icon-btn" type="button" data-exit aria-label="Exit game" title="Exit game">${iconSVG("logOut", { size: 14 })}<span class="lw-btn-label">Exit game</span></button>
  </div>
  <section class="game-panel lw-board" data-board>
    <div class="lw-layout">
      <div class="lw-wheel-wrap">
        <svg class="lw-wheel off" data-el="wheel" data-act="spin" viewBox="-200 -200 400 400" role="button" aria-label="Spin the wheel"></svg>
        <div class="lw-pointer"><svg viewBox="0 0 30 34" width="24" height="28" aria-hidden="true"><path d="M3 3h24L15 31z" fill="#e3b341" stroke="#0b1020" stroke-width="2.5" stroke-linejoin="round"/></svg></div>
        <div class="lw-hub"><button class="lw-spin" type="button" data-act="spin" disabled><b>SPIN</b><small>−${SPIN_COST}</small></button></div>
      </div>
      <div class="lw-side">
        <div data-el="players"></div>
        <div class="lw-banner" data-el="banner" aria-live="polite"></div>
      </div>
    </div>
    <div class="lw-ov" data-el="over" hidden>
      <div class="lw-card">
        <div class="lw-head"><h3 data-el="overTitle"></h3></div>
        <div class="lw-body"><p data-el="overSub"></p><p class="lw-over-stats" data-el="overStats"></p></div>
        <div class="lw-foot"><span class="lw-note">R to restart</span><button class="lw-btn primary" type="button" data-act="restart">Play again</button><button class="lw-btn" type="button" data-exit>Exit game</button></div>
      </div>
    </div>
    <div class="lw-ov" data-el="pause" hidden>
      <div class="lw-card">
        <div class="lw-head"><h3>Paused</h3></div>
        <div class="lw-body"><p>Spins, bot moves and the wheel animation are frozen.</p></div>
        <div class="lw-foot"><span class="lw-note">P or Esc to resume</span><button class="lw-btn primary" type="button" data-act="pause">Resume</button></div>
      </div>
    </div>
    <div class="lw-ov" data-el="cheats" hidden>
      <div class="lw-card">
        <div class="lw-head"><b>Cheats</b><button class="lw-btn ghost sm" type="button" data-act="cheats-close" aria-label="Close cheats">Close</button></div>
        <div class="lw-cheat-body">
          <div class="lw-cheat-row"><div><b>+100 coins</b><small>Add coins to your balance</small></div><button class="lw-cheat-btn" type="button" data-cheat="coins">Use</button></div>
          <div class="lw-cheat-row"><div><b>+5 spins</b><small>Extend your spin budget</small></div><button class="lw-cheat-btn" type="button" data-cheat="spins">Use</button></div>
          <div class="lw-cheat-row"><div><b>Grant missing prize</b><small>Complete one prize type for you</small></div><button class="lw-cheat-btn" type="button" data-cheat="grant">Use</button></div>
          <div class="lw-cheat-row"><div><b>Next spin: Jackpot</b><small>Arm an instant jackpot</small></div><button class="lw-cheat-btn" type="button" data-cheat="jackpot">Arm</button></div>
          <div class="lw-cheat-row"><div><b>Next spin: Coin x5</b><small>Arm the big coin payout</small></div><button class="lw-cheat-btn" type="button" data-cheat="coin5">Arm</button></div>
        </div>
        <div class="lw-foot"><span class="lw-note">C to close</span><button class="lw-btn primary" type="button" data-act="cheats-close">Done</button></div>
      </div>
    </div>
    <div class="lw-ov" data-el="help" hidden>
      <div class="lw-card">
        <div class="lw-head"><h3>How to play</h3><button class="lw-btn ghost sm" type="button" data-act="help-close" aria-label="Close help">Close</button></div>
        <div class="lw-help">
          <div>
            <b>Desktop</b>
            <ul>
              <li>Click the wheel or the SPIN hub to take your turn.</li>
              <li><kbd>Space</kbd> / <kbd>Enter</kbd> spin · <kbd>R</kbd> restart.</li>
              <li><kbd>H</kbd> help · <kbd>C</kbd> cheats · <kbd>P</kbd> / <kbd>Esc</kbd> pause.</li>
            </ul>
            <b>Mobile</b>
            <ul>
              <li>Tap SPIN in the HUD or the wheel hub when it is your turn.</li>
            </ul>
          </div>
          <div>
            <b>Rules</b>
            <ul>
              <li>A coin toss decides who spins first; turns alternate with your rival.</li>
              <li>Every spin costs ${SPIN_COST} coins. Prizes pay coins; Mystery can take them away.</li>
              <li>Collect all 6 prize types or land the Jackpot to win.</li>
              <li>If both run out of spins/coins, prizes decide, then balance.</li>
              <li>Your best balance is saved on this device.</li>
            </ul>
          </div>
        </div>
        <div class="lw-foot"><span class="lw-note">Press H to reopen this guide</span><button class="lw-btn primary" type="button" data-act="help-close">Got it</button></div>
      </div>
    </div>
  </section>
</div>`;

    /* ---------------- refs ---------------- */
    const $ = (s) => root.querySelector(s);
    const wheelSvg = $('[data-el="wheel"]');
    const playersEl = $('[data-el="players"]');
    const bannerEl = $('[data-el="banner"]');
    const statusEl = $("[data-status]");
    const spinBtn = $(".lw-spin");
    const hudSpinBtn = $("[data-spin-btn]");
    const pauseBtn = $("[data-pause]");
    const overEl = $('[data-el="over"]');
    const overTitle = $('[data-el="overTitle"]');
    const overSub = $('[data-el="overSub"]');
    const overStats = $('[data-el="overStats"]');
    const pauseEl = $('[data-el="pause"]');
    const cheatsEl = $('[data-el="cheats"]');
    const helpEl = $('[data-el="help"]');
    const bestChip = $("[data-best-chip]");
    const cheatBtns = Array.prototype.slice.call(root.querySelectorAll("[data-cheat]"));
    const hud = {
        you: $('[data-hud="you"]'),
        rival: $('[data-hud="rival"]'),
        left: $('[data-hud="left"]'),
        prizes: $('[data-hud="prizes"]'),
        first: $('[data-hud="first"]'),
        best: $('[data-hud="best"]'),
    };

    /* ---------------- icons ---------------- */
    const ICONS = {
        star: '<polygon points="0,-12 2.8,-3.9 11.4,-3.7 4.6,1.5 7.1,9.7 0,4.8 -7.1,9.7 -4.6,1.5 -11.4,-3.7 -2.8,-3.9" fill="#fffbeb" stroke="#b45309" stroke-width="1.4" stroke-linejoin="round"/>',
        candy: '<path d="M-4 0l-9-5.5v11z" fill="#fff1f2" stroke="#be123c" stroke-width="1.4" stroke-linejoin="round"/><path d="M4 0l9-5.5v11z" fill="#fff1f2" stroke="#be123c" stroke-width="1.4" stroke-linejoin="round"/><circle r="7.5" fill="#fff1f2" stroke="#be123c" stroke-width="1.4"/><path d="M-4.5-2.6q4.5 5.2 9 0" fill="none" stroke="#be123c" stroke-width="1.4" stroke-linecap="round"/><path d="M-4.5 2q4.5-5.2 9 0" fill="none" stroke="#be123c" stroke-width="1.2" stroke-linecap="round"/>',
        gem: '<polygon points="0,-11 9,-4 5.5,10 -5.5,10 -9,-4" fill="#cffafe" stroke="#0e7490" stroke-width="1.4" stroke-linejoin="round"/><path d="M-9-4h18M0-11l-5.5 21M0-11l5.5 21" fill="none" stroke="#0e7490" stroke-width="1" opacity=".7"/>',
        ticket: '<rect x="-12" y="-7" width="24" height="14" rx="2.5" fill="#eef2ff" stroke="#4338ca" stroke-width="1.4"/><line x1="-4" y1="-7" x2="-4" y2="7" stroke="#4338ca" stroke-width="1.4" stroke-dasharray="2.4 2.2"/>',
        coin: '<circle r="11" fill="#fcd34d" stroke="#92400e" stroke-width="1.6"/><circle r="7.6" fill="none" stroke="#92400e" stroke-width="1.2" opacity=".8"/><text y="4" font-size="11" font-weight="800" text-anchor="middle" font-family="inherit" fill="#92400e">$</text>',
        jackpot: '<path d="M-11 7L-12.5-5-6-1 0-9 6-1 12.5-5 11 7z" fill="#fffbeb" stroke="#b45309" stroke-width="1.4" stroke-linejoin="round"/><circle cx="-12.5" cy="-6.5" r="1.6" fill="#fbbf24"/><circle cx="0" cy="-10.5" r="1.6" fill="#fbbf24"/><circle cx="12.5" cy="-6.5" r="1.6" fill="#fbbf24"/>',
        mystery: '<circle r="11" fill="#312e81" stroke="#a5b4fc" stroke-width="1.5"/><text y="4.5" font-size="14" font-weight="800" text-anchor="middle" font-family="inherit" fill="#e0e7ff">?</text>',
    };
    const icon = (key, size) =>
        '<svg viewBox="-14 -14 28 28" width="' + size + '" height="' + size + '" aria-hidden="true">' + ICONS[key] + "</svg>";

    /* ---------------- static wheel art (fixed layout, muted flat wedges) ---------------- */
    {
        const P = (r, deg) => {
            const a = (deg * Math.PI) / 180;
            return (r * Math.sin(a)).toFixed(2) + " " + (-r * Math.cos(a)).toFixed(2);
        };
        const R = 185;
        let s = '<circle r="193" fill="#0e1420"/>';
        for (let i = 0; i < 8; i++) {
            const fill = SEGMENTS[i].icon === "jackpot" ? "#3d2f12" : i % 2 ? "#1c2434" : "#242e42";
            s += '<path d="M0 0 L' + P(R, i * 45 - 22.5) + " A" + R + " " + R + " 0 0 1 " + P(R, i * 45 + 22.5) +
                ' Z" fill="' + fill + '" stroke="#0e1420" stroke-width="2"/>';
        }
        s += '<circle r="' + R + '" fill="none" stroke="#e3b341" stroke-width="3" opacity=".9"/>';
        for (let i = 0; i < 8; i++) {
            const seg = SEGMENTS[i];
            s += '<g transform="rotate(' + i * 45 + ')">' +
                '<g transform="translate(0,-141) scale(1.55)">' + ICONS[seg.icon] + "</g>" +
                '<text x="0" y="-100" font-size="13" font-weight="800" text-anchor="middle" font-family="inherit" fill="#dfe5f1" stroke="#0e1420" stroke-width="2.5" paint-order="stroke">' + seg.short + "</text></g>";
        }
        s += '<circle r="86" fill="#0e1420" stroke="#2a3550" stroke-width="2"/>';
        wheelSvg.innerHTML = s;
    }

    let best = 0;
    try { best = Number(localStorage.getItem(META.bestKey)) || 0; } catch (_) { }
    let savedGame = null;

    /* ---------------- state (fully serializable for Firebase) ---------------- */
    function newPlayer() {
        return { coins: START_BALANCE, spins: TOTAL_SPINS, collected: [], forced: null };
    }
    function freshState() {
        const hostSlot = Math.random() < 0.5 ? 0 : 1; // random P1/P2 draw in rooms
        const first = Math.random() < 0.5 ? 0 : 1;    // random coin toss for first turn
        return {
            gameId: Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
            phase: "idle",            // idle | spinning | over
            turn: first,
            first,
            slots: { host: online ? hostSlot : 0, guest: online ? 1 - hostSlot : 1 },
            wheelRot: 0,
            spinId: 0,
            pending: null,            // { idx, slot } while the wheel turns
            last: null,               // { slot, idx, pay, isNew, label }
            winner: null,             // 0 | 1 | -1 (draw)
            reason: "",
            players: [newPlayer(), newPlayer()],
        };
    }
    function mySlot() {
        if (!online) return 0;
        if (!state) return room.isHost ? 0 : 1;
        return room.isHost ? state.slots.host : state.slots.guest;
    }
    function canSpin(p) { return p.spins > 0 && p.coins >= SPIN_COST; }
    function nameOf(slot, me) {
        return slot === me ? (playerName || "You") : online ? "Rival" : "Bot";
    }

    /* ---------------- rules engine (host / offline only) ---------------- */
    function startSpin(actor) {
        const p = state.players[actor];
        p.coins -= SPIN_COST;
        p.spins -= 1;
        const idx = p.forced != null ? p.forced : spinIndex();
        p.forced = null;
        const target = (360 - idx * 45) % 360;
        const cur = ((state.wheelRot % 360) + 360) % 360;
        let delta = target - cur;
        if (delta <= 0) delta += 360;
        state.wheelRot += delta + 360 * 3;
        state.spinId += 1;
        state.pending = { idx, slot: actor };
        state.phase = "spinning";
        state.last = null;
        publish();
        cancelTimer(spinTimer);
        spinTimer = schedule(SPIN_MS, finalizeSpin);
    }

    function finalizeSpin() {
        if (!state || state.phase !== "spinning" || !state.pending) return;
        const { idx, slot } = state.pending;
        state.pending = null;
        const p = state.players[slot];
        const seg = SEGMENTS[idx];
        let pay = seg.icon === "mystery" ? mysteryDelta() : seg.pay;
        const before = p.coins;
        p.coins = Math.max(0, p.coins + pay); // balance can shrink but never below 0
        pay = p.coins - before;
        let isNew = false;
        if (seg.collect && !p.collected.includes(seg.collect)) {
            p.collected.push(seg.collect);
            isNew = true;
        }
        state.last = { slot, idx, pay, isNew, label: seg.label };
        state.phase = "idle";
        if (seg.icon === "jackpot") return endGame(slot, "Jackpot — instant grand prize.");
        if (collectionComplete(p.collected)) return endGame(slot, "Collection complete — all 6 prizes.");
        const other = 1 - slot;
        if (canSpin(state.players[other])) state.turn = other;
        else if (canSpin(p)) state.turn = slot; // rival is stuck, keep spinning
        else return decideByScore();
        publish();
    }

    function decideByScore() {
        const [a, b] = state.players;
        let w = -1;
        if (a.collected.length !== b.collected.length) w = a.collected.length > b.collected.length ? 0 : 1;
        else if (a.coins !== b.coins) w = a.coins > b.coins ? 0 : 1;
        endGame(w, "Both players are out of spins or coins — decided by prizes, then balance.");
    }

    function endGame(winner, reason) {
        state.phase = "over";
        state.winner = winner;
        state.reason = reason;
        publish();
    }

    function applyCheat(id, slot) {
        const p = state.players[slot];
        if (id === "coins") p.coins += 100;
        else if (id === "spins") p.spins += 5;
        else if (id === "grant") {
            const miss = COLLECT_KEYS.find((k) => !p.collected.includes(k));
            if (miss) {
                p.collected.push(miss);
                state.last = { slot, idx: -1, pay: 0, isNew: true, label: COLLECT_LABELS[miss] + " (cheat)" };
            }
        } else if (id === "jackpot") p.forced = 6;
        else if (id === "coin5") p.forced = 5;
    }

    function applyAction(action, actor) {
        if (!state || !action || typeof action !== "object") return;
        if (actor !== 0 && actor !== 1) return;
        if (action.type === "spin") {
            if (state.phase !== "idle" || actor !== state.turn || !canSpin(state.players[actor])) return;
            startSpin(actor);
        } else if (action.type === "restart") {
            cancelTimer(spinTimer);
            cancelTimer(botTimer);
            state = freshState();
            publish();
        } else if (action.type === "cheat") {
            if (state.phase !== "idle") return; // no cheats mid-spin / after game over
            applyCheat(action.cheat, actor);
            if (collectionComplete(state.players[actor].collected)) {
                endGame(actor, "Collection complete — all 6 prizes.");
            } else {
                publish();
            }
        }
    }

    function submitAction(action) {
        if (online && !room.isHost) {
            room.sendAction(action).catch(console.warn);
            return;
        }
        applyAction(action, mySlot());
    }

    function publish() {
        render();
        if (online && room.isHost) room.publishState(state).catch(console.warn);
        scheduleBot();
    }

    /* ---------------- bot (AI mode only) ---------------- */
    function scheduleBot() {
        cancelTimer(botTimer);
        if (!online && state && state.phase === "idle" && state.turn === 1 && canSpin(state.players[1])) {
            botTimer = schedule(BOT_DELAY, () => applyAction({ type: "spin" }, 1));
        }
    }

    /* ---------------- render ---------------- */
    function snapWheel(rot) {
        wheelSvg.style.transition = "none";
        wheelSvg.style.transform = "rotate(" + rot + "deg)";
        void wheelSvg.getBoundingClientRect();
        wheelSvg.style.transition = "";
    }

    function syncPauseButton() {
        const label = pauseBtn.querySelector(".lw-btn-label");
        if (label) label.textContent = paused ? "Resume" : "Pause";
        pauseBtn.setAttribute("aria-label", paused ? "Resume" : "Pause");
        pauseBtn.setAttribute("title", paused ? "Resume (P)" : "Pause (P)");
        const icon = pauseBtn.querySelector(".lw-icon");
        if (icon) icon.innerHTML = iconSVG(paused ? "play" : "pause", { size: 14 });
    }

    function panelHTML(p, i, me) {
        const active = state.phase !== "over" && state.turn === i;
        const stuck = state.phase !== "over" && !canSpin(p);
        const cells = COLLECT_KEYS.map((k) =>
            '<span class="lw-cell' + (p.collected.includes(k) ? " got" : "") + '">' + icon(k, 18) + "</span>"
        ).join("");
        const next = p.forced != null ? '<span class="lw-next">next: ' + SEGMENTS[p.forced].short + "</span>" : "";
        return '<div class="lw-player' + (active ? " active" : "") + '" style="margin-bottom:10px">' +
            '<div class="lw-p-head"><span class="lw-pos">P' + (i + 1) + "</span><span>" + nameOf(i, me) + "</span>" +
            (stuck ? '<span class="lw-tag">stuck</span>' : "") + '<span class="lw-dot"></span></div>' +
            '<div class="lw-nums"><span>Coins <b>' + p.coins + "</b></span><span>Spins <b>" + p.spins + "</b></span>" + next + "</div>" +
            '<div class="lw-coll">' + cells + "</div></div>";
    }

    function render() {
        if (destroyed) return;
        const frozen = paused || helpOpen || cheatOpen;
        if (!state) {
            statusEl.textContent = "Waiting for host…";
            hud.you.textContent = String(START_BALANCE);
            hud.rival.textContent = String(START_BALANCE);
            hud.left.textContent = String(TOTAL_SPINS);
            hud.prizes.textContent = "0/6";
            hud.first.textContent = "FIRST —";
            bestChip.hidden = best <= 0;
            hud.best.textContent = String(best);
            spinBtn.disabled = true;
            hudSpinBtn.disabled = true;
            wheelSvg.classList.add("off");
            overEl.hidden = true;
            pauseEl.hidden = !paused || helpOpen || cheatOpen;
            cheatsEl.hidden = !cheatOpen || helpOpen;
            helpEl.hidden = !helpOpen;
            syncPauseButton();
            return;
        }
        const me = mySlot();

        /* HUD chips */
        const mine = state.players[me];
        hud.you.textContent = String(mine.coins);
        hud.rival.textContent = String(state.players[1 - me].coins);
        hud.left.textContent = String(mine.spins);
        hud.prizes.textContent = mine.collected.length + "/6";
        hud.first.textContent = "FIRST " + nameOf(state.first, me).toUpperCase();
        bestChip.hidden = best <= 0;
        hud.best.textContent = String(best);

        /* status chip */
        if (state.phase === "over") {
            statusEl.textContent = state.winner === -1 ? "Draw" : state.winner === me ? "You win" : nameOf(state.winner, me) + " wins";
        } else if (state.phase === "spinning") {
            statusEl.textContent = state.pending && state.pending.slot === me ? "Spinning…" : nameOf(1 - me, me) + " spinning…";
        } else {
            statusEl.textContent = state.turn === me ? "Your turn" : nameOf(state.turn, me) + "'s turn";
        }

        /* player panels */
        playersEl.innerHTML = state.players.map((p, i) => panelHTML(p, i, me)).join("");

        /* banner: coin toss / last result — never a tutorial */
        if (state.phase === "spinning") {
            bannerEl.textContent = "Spinning…";
        } else if (state.last) {
            const L = state.last;
            const sign = L.pay > 0 ? "+" + L.pay : L.pay < 0 ? "−" + -L.pay : "±0";
            bannerEl.textContent = nameOf(L.slot, me) + " · " + L.label + " " + sign + (L.isNew ? " · NEW" : "");
        } else {
            const who = state.first === me ? "you" : nameOf(state.first, me);
            bannerEl.textContent = "Coin toss — " + who + (state.first === me ? " go" : " goes") + " first" +
                (online ? " · you are P" + (me + 1) : "");
        }

        /* wheel rotation (snap on restart, animate forward otherwise;
           while frozen the captured matrix is held until resume) */
        if (state.wheelRot !== shownRot) {
            if (!frozen) {
                if (state.wheelRot < shownRot) snapWheel(state.wheelRot);
                else wheelSvg.style.transform = "rotate(" + state.wheelRot + "deg)";
            }
            shownRot = state.wheelRot;
        }

        /* controls */
        const canSpinNow = state.phase === "idle" && state.turn === me && canSpin(mine) && !frozen;
        spinBtn.disabled = !canSpinNow;
        hudSpinBtn.disabled = !canSpinNow;
        wheelSvg.classList.toggle("off", !canSpinNow);
        cheatBtns.forEach((b) => {
            const k = b.dataset.cheat;
            b.disabled = state.phase !== "idle";
            if (k === "jackpot") {
                const on = mine.forced === 6;
                b.classList.toggle("on", on);
                b.textContent = on ? "Armed" : "Arm";
            } else if (k === "coin5") {
                const on = mine.forced === 5;
                b.classList.toggle("on", on);
                b.textContent = on ? "Armed" : "Arm";
            }
        });
        syncPauseButton();

        /* game over overlay + best score */
        if (state.phase === "over") {
            overTitle.textContent = state.winner === -1 ? "Draw" : state.winner === me ? "You win" : nameOf(state.winner, me) + " wins";
            overSub.textContent = state.reason;
            overStats.textContent = "Balance " + mine.coins + " · Prizes " + mine.collected.length + "/6 · Spins used " + Math.max(0, TOTAL_SPINS - mine.spins);
            if (savedGame !== state.gameId) {
                savedGame = state.gameId;
                if (mine.coins > best) {
                    best = mine.coins;
                    try { localStorage.setItem(META.bestKey, String(best)); } catch (_) { }
                }
            }
        }

        /* overlays: help > cheats > pause; all freeze the game */
        overEl.hidden = state.phase !== "over" || helpOpen || cheatOpen || paused;
        pauseEl.hidden = !paused || helpOpen || cheatOpen;
        cheatsEl.hidden = !cheatOpen || helpOpen;
        helpEl.hidden = !helpOpen;
    }

    /* ---------------- input: mouse / touch / keyboard ---------------- */
    function trySpin() {
        if (!state || paused || helpOpen || cheatOpen || state.phase !== "idle") return;
        const me = mySlot();
        if (state.turn !== me || !canSpin(state.players[me])) return;
        submitAction({ type: "spin" });
    }
    function toggleHelp(on) {
        helpOpen = typeof on === "boolean" ? on : !helpOpen;
        if (helpOpen) cheatOpen = false;
        syncFreeze();
        render();
    }
    function toggleCheats(on) {
        cheatOpen = typeof on === "boolean" ? on : !cheatOpen;
        if (cheatOpen) helpOpen = false;
        syncFreeze();
        render();
    }
    function togglePause(on) {
        paused = typeof on === "boolean" ? on : !paused;
        syncFreeze();
        render();
    }
    function restartGame() {
        paused = false;
        helpOpen = false;
        cheatOpen = false;
        syncFreeze();
        submitAction({ type: "restart" });
    }

    function handleClick(event) {
        if (destroyed) return;
        const t = event.target;
        if (!t || !t.closest) return;
        if (t.closest("[data-help]")) { toggleHelp(); return; }
        if (t.closest("[data-help-close]")) { toggleHelp(false); return; }
        if (t.closest("[data-exit]")) { onExit(); return; }
        if (t.closest("[data-cheats]")) { toggleCheats(); return; }
        if (t.closest("[data-pause]")) { togglePause(); return; }
        const btn = t.closest("[data-act]");
        if (btn) {
            const a = btn.dataset.act;
            if (a === "spin") trySpin();
            else if (a === "restart") restartGame();
            else if (a === "pause") togglePause(false);
            else if (a === "cheats") toggleCheats();
            else if (a === "cheats-close") toggleCheats(false);
            else if (a === "help-close") toggleHelp(false);
            return;
        }
        const ch = t.closest("[data-cheat]");
        if (ch) submitAction({ type: "cheat", cheat: ch.dataset.cheat });
    }

    function handleKey(event) {
        if (destroyed || !root.isConnected) return;
        if (event.ctrlKey || event.metaKey || event.altKey) return;
        const t = event.target;
        if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
        if (event.repeat) return;
        const code = event.code || "";
        const k = (event.key || "").toLowerCase();

        /* prioritas UI: help → cheats → pause/Escape → restart → aksi game */
        if (code === "KeyH" || k === "h") { toggleHelp(); event.preventDefault(); return; }
        if (code === "KeyC" || k === "c") { if (!helpOpen) toggleCheats(); event.preventDefault(); return; }
        if (code === "KeyP" || code === "Escape" || k === "p" || k === "escape") {
            if (helpOpen) toggleHelp(false);
            else if (cheatOpen) toggleCheats(false);
            else togglePause();
            event.preventDefault(); return;
        }
        if (code === "KeyR" || k === "r") { if (state) restartGame(); event.preventDefault(); return; }
        if (helpOpen || cheatOpen || !state) return;
        if (paused) {
            if (code === "Space" || code === "Enter") { togglePause(false); event.preventDefault(); }
            return;
        }
        if (t && t.closest && t.closest("button")) return;
        if (code === "Space" || code === "Enter") { event.preventDefault(); trySpin(); }
    }

    root.addEventListener("click", handleClick);
    document.addEventListener("keydown", handleKey);
    syncFreeze();

    /* ---------------- boot ---------------- */
    if (online) {
        const offRoom = room.onRoom?.((nextRoom) => { roomData = nextRoom; render(); });
        if (typeof offRoom === "function") unsubs.push(offRoom);
        if (room.isHost) {
            state = freshState();
            publish();
            // guest connection maps to the randomly drawn guest slot
            const offAction = room.onAction?.((action) => applyAction(action, state ? state.slots.guest : 1));
            if (typeof offAction === "function") unsubs.push(offAction);
        } else {
            const offState = room.onState?.((nextState) => { if (nextState) { state = nextState; render(); } });
            if (typeof offState === "function") unsubs.push(offState);
        }
    } else {
        state = freshState();
        publish();
    }
    render();

    return {
        destroy() {
            destroyed = true;
            timers.forEach((rec) => { if (rec.id) clearTimeout(rec.id); });
            timers.clear();
            root.removeEventListener("click", handleClick);
            document.removeEventListener("keydown", handleKey);
            unsubs.forEach((fn) => { try { fn(); } catch (_) { } });
        },
    };
}
