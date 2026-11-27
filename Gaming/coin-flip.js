/* ==== GAME: coin-flip.js ==== */
/* =============================================================== */
/* Coin Flip - casino game (module template)                        */
/* Race to 8 correct calls within 12 flips, vs bot or online rival. */
/* =============================================================== */

import { iconSVG } from "../JS/icons.js";

export const META = {
    id: "coin-flip", // harus sama dengan nama file (tanpa .js)
    name: "Coin Flip",
    category: "casino",
    catLabel: "Casino",
    desc: "Call heads or tails and race to 8 correct calls in 12 flips.",
    art: '<svg viewBox="0 0 48 48" width="54" height="54" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="24" cy="24" r="19"/><circle cx="24" cy="24" r="14"/><path d="M24 17l1.8 4.6 4.9.2-3.8 3.1 1.2 4.8-4.1-2.7-4.1 2.7 1.2-4.8-3.8-3.1 4.9-.2z"/></svg>',
    bg: ["#fde68a", "#eab308"],
    bestKey: "coinFlipBestStreak",
};

/* ---------- aturan murni ---------- */
const TARGET = 8;
const MAX_FLIPS = 12;
const FLIP_MS = 1250;
const RESOLVE_DELAY = FLIP_MS + 220;
const rollFace = () => (Math.random() < 0.5 ? "heads" : "tails");
const opposite = (f) => (f === "heads" ? "tails" : "heads");
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

export function mount(root, context = {}) {
    const { mode = "ai", room = null, playerName = "Player", onExit = () => { } } = context;
    const online = mode === "room" && Boolean(room);
    const playerIndex = online && !room.isHost ? 1 : 0; // 0 = host, 1 = guest
    let roomData = room?.room || null;
    let state = null;

    /* ---------- state UI lokal (tidak disinkronkan) ---------- */
    let myCall = null;
    let awaiting = false; // guest: menunggu echo state dari host
    let cheatOpen = false;
    let helpOpen = false;
    let paused = false;
    let destroyed = false;
    let animSeq = 0; // seq flip yang sudah dianimasikan (anti double-spin)
    let lastRound = 0;
    let baseRot = 0; // 0 = heads, 180 = tails
    let currentAnim = null;
    let shadowAnim = null;
    let resolveTimer = 0;
    let botTimer = 0;
    const offs = [];
    const reduced =
        typeof matchMedia === "function" &&
        matchMedia("(prefers-reduced-motion: reduce)").matches;
    let record = 0;
    try { record = parseInt(localStorage.getItem(META.bestKey) || "0", 10) || 0; } catch (e) { }

    /* panduan internal sekali per game (global how-to tidak dipakai) */
    let seenHelp = true;
    try { seenHelp = localStorage.getItem("coinFlipHelpSeen") === "1"; } catch (e) { seenHelp = true; }
    if (!seenHelp) {
        helpOpen = true;
        try { localStorage.setItem("coinFlipHelpSeen", "1"); } catch (e) { /* storage blocked */ }
    }

    /* timer sadar-pause: semua deadline memakai anchor Date.now() yang
       digeser saat resume sehingga bot/resolve tidak loncat setelah freeze. */
    const timers = new Set();
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
    function syncFreeze() {
        const frozen = paused || helpOpen || cheatOpen;
        if (frozen) {
            freezeTimers();
            if (currentAnim && currentAnim.playState === "running") {
                try { currentAnim.pause(); if (shadowAnim) shadowAnim.pause(); } catch (e) { }
            }
        } else {
            thawTimers();
            if (currentAnim && currentAnim.playState === "paused") {
                try { currentAnim.play(); if (shadowAnim) shadowAnim.play(); } catch (e) { }
            }
        }
    }

    /* ---------- svg ---------- */
    const uid = Math.random().toString(36).slice(2, 7);
    const STAR =
        '<path d="M80 54l6.5 17.1 18.2.9-14.2 11.4 4.8 17.7-15.3-10.1-15.3 10.1 4.8-17.7-14.2-11.4 18.2-.9z" fill="#92400e"/>';
    const MOON =
        '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" transform="translate(14 14) scale(5.5)" fill="#92400e"/>';
    function coinFaceSvg(face, gid) {
        return (
            '<svg viewBox="0 0 160 160" aria-hidden="true">' +
            '<defs><linearGradient id="' + gid + '" x1="0" y1="0" x2="0" y2="1">' +
            '<stop offset="0" stop-color="#fde68a"/><stop offset=".55" stop-color="#fbbf24"/>' +
            '<stop offset="1" stop-color="#d97706"/></linearGradient></defs>' +
            '<circle cx="80" cy="80" r="74" fill="url(#' + gid + ')" stroke="#92400e" stroke-width="4"/>' +
            '<circle cx="80" cy="80" r="62" fill="none" stroke="#92400e" stroke-width="5" stroke-dasharray="3.5 7" opacity=".55"/>' +
            '<circle cx="80" cy="80" r="52" fill="none" stroke="#92400e" stroke-width="3" opacity=".4"/>' +
            (face === "tails" ? MOON : STAR) +
            "</svg>"
        );
    }
    function callIconSvg(face) {
        if (face === "heads") {
            return (
                '<svg viewBox="0 0 48 48" aria-hidden="true">' +
                '<circle cx="24" cy="24" r="20" fill="#f59e0b" stroke="#92400e" stroke-width="2.5"/>' +
                '<path d="M24 16l2 5.3 5.6.3-4.4 3.6 1.5 5.4-4.7-3.1-4.7 3.1 1.5-5.4-4.4-3.6 5.6-.3z" fill="#92400e"/></svg>'
            );
        }
        return (
            '<svg viewBox="0 0 48 48" aria-hidden="true">' +
            '<circle cx="24" cy="24" r="20" fill="#cbd5e1" stroke="#475569" stroke-width="2.5"/>' +
            '<path d="M42 25.6A18 18 0 1 1 22.4 6 14 14 0 0 0 42 25.6z" fill="#475569"/></svg>'
        );
    }

    /* ---------- shell: HUD + fill-height board + overlays ---------- */
    root.innerHTML = `
<style>
.cf-app{--line:#ffffff14;--muted:#8b93a7;--ink:#e8edf7;--accent:#eab308;--good:#7dd8a5;--bad:#e89090;color:var(--ink);display:flex;flex-direction:column;gap:10px;width:100%;max-width:760px;height:100%;min-height:0;margin:0 auto;min-width:0;user-select:none;-webkit-user-select:none}
.cf-app [hidden]{display:none!important}
.cf-app .cf-hud{display:flex;align-items:center;gap:6px;flex-wrap:wrap;min-width:0;font:600 11px/1 ui-monospace,SFMono-Regular,Menlo,monospace}
.cf-app .cf-chip{display:inline-flex;align-items:center;gap:6px;padding:5px 9px;border:1px solid var(--line);border-radius:999px;background:#ffffff07;color:var(--muted);white-space:nowrap;letter-spacing:.08em;text-transform:uppercase}
.cf-app .cf-chip b{color:var(--ink);font-weight:700;font-variant-numeric:tabular-nums}
.cf-app .cf-status i{width:6px;height:6px;border-radius:50%;background:var(--good);flex:none}
.cf-app .cf-spacer{flex:1 1 auto}
.cf-app .cf-btn{appearance:none;border:1px solid var(--line);background:#ffffff0a;color:var(--ink);border-radius:9px;padding:7px 11px;min-height:36px;font:inherit;font-size:10px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;cursor:pointer;touch-action:manipulation;transition:border-color .15s ease,background .15s ease,transform .1s ease}
.cf-app .cf-btn:hover:not(:disabled){border-color:#eab30866}
.cf-app .cf-btn:active{transform:scale(.98)}
.cf-app .cf-btn:disabled{opacity:.4;cursor:default}
.cf-app .cf-btn.primary{border-color:#eab30855;background:#eab3081a;color:#fde68a}
.cf-app .cf-btn.ghost{background:transparent}
.cf-app .cf-btn.on{border-color:var(--accent);color:#fde68a}
.cf-app .cf-btn.sm{min-height:32px;padding:5px 10px;font-size:9px}
.cf-app .cf-icon-btn{display:inline-flex;align-items:center;gap:6px}
.cf-app .cf-icon-btn svg{flex:none;display:block}
.cf-app .cf-callset{display:flex;gap:6px}
.cf-app .cf-call{display:inline-flex;align-items:center;justify-content:center;gap:6px;min-height:36px;padding:5px 10px;background:#ffffff07;border:1px solid var(--line);border-radius:9px;color:var(--ink);font:inherit;font-size:10px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;cursor:pointer;touch-action:manipulation;user-select:none;-webkit-user-select:none;transition:border-color .15s ease,background .15s ease,transform .1s ease}
.cf-app .cf-call svg{width:22px;height:22px;flex:none}
.cf-app .cf-call:active{transform:scale(.98)}
.cf-app .cf-call.sel{border-color:var(--accent);background:#eab30814;color:#fde68a}
.cf-app .cf-call:disabled{opacity:.45;cursor:default}
.cf-app .cf-flipbtn{min-height:36px;padding:6px 12px;border:1px solid #eab30855;background:#eab3081a;color:#fde68a;border-radius:9px;font:inherit;font-size:10px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;cursor:pointer;touch-action:manipulation;user-select:none;-webkit-user-select:none;transition:background .15s ease,transform .1s ease}
.cf-app .cf-flipbtn:active{transform:scale(.99)}
.cf-app .cf-flipbtn:disabled{opacity:.4;cursor:default}
.cf-app kbd{font:600 9px/1 inherit;letter-spacing:.05em;color:var(--muted);border:1px solid var(--line);border-radius:5px;padding:2px 5px;margin-left:2px}
.cf-app .cf-panel{position:relative;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;flex:1 1 auto;min-height:0;width:100%;padding:14px 12px;border:1px solid var(--line);border-radius:12px;background:#0a0f1f80;overflow:hidden}
.cf-app .cf-score{display:grid;grid-template-columns:repeat(2,minmax(0,220px));gap:12px;width:100%;max-width:460px}
.cf-app .cf-seat{background:#ffffff07;border:1px solid var(--line);border-radius:10px;padding:12px;display:flex;flex-direction:column;gap:8px;min-width:0;transition:border-color .16s ease,background .16s ease}
.cf-app .cf-seat.active{border-color:#eab30866;background:#eab3080d}
.cf-app .cf-seat-top{display:flex;align-items:center;gap:6px;font-size:11px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:var(--muted);flex-wrap:wrap;min-width:0}
.cf-app .cf-seat.active .cf-seat-top{color:#fde68a}
.cf-app .cf-tag{font-size:10px;color:var(--muted);border:1px solid var(--line);border-radius:6px;padding:1px 5px}
.cf-app .cf-turn{width:6px;height:6px;border-radius:50%;background:var(--accent);margin-left:auto;opacity:0;transition:opacity .16s ease;flex:none}
.cf-app .cf-seat.active .cf-turn{opacity:1}
.cf-app .cf-big{font-size:28px;font-weight:800;line-height:1;font-variant-numeric:tabular-nums}
.cf-app .cf-big span{font-size:13px;color:var(--muted);font-weight:600}
.cf-app .cf-mini{font-size:11px;color:var(--muted)}
.cf-app .cf-rec{font-size:10px;color:var(--muted);opacity:.8}
.cf-app .cf-dots{display:flex;flex-wrap:wrap;gap:4px;margin-top:2px}
.cf-app .cf-dot{width:8px;height:8px;border-radius:50%;background:#ffffff14;border:1px solid #ffffff1f}
.cf-app .cf-dot.hit{background:var(--good);border-color:transparent}
.cf-app .cf-dot.miss{background:var(--bad);border-color:transparent}
.cf-app .cf-scene{position:relative;width:144px;height:144px;perspective:900px;flex:none}
.cf-app .cf-coin3d{position:absolute;inset:0;transform-style:preserve-3d;will-change:transform;cursor:pointer}
.cf-app .cf-side{position:absolute;inset:0;backface-visibility:hidden;-webkit-backface-visibility:hidden}
.cf-app .cf-side svg{width:100%;height:100%;display:block;filter:drop-shadow(0 10px 14px #00000059)}
.cf-app .cf-back{transform:rotateX(180deg)}
.cf-app .cf-shadow{position:absolute;left:50%;bottom:-8px;width:104px;height:12px;margin-left:-52px;border-radius:50%;background:#00000080;filter:blur(5px)}
.cf-app .cf-face{font-size:11px;font-weight:700;letter-spacing:.3em;color:var(--muted);min-height:16px}
.cf-app .cf-peek{font-size:10px;font-weight:700;letter-spacing:.18em;color:#fde68a;border:1px dashed #eab30866;border-radius:8px;padding:3px 8px}
.cf-app .cf-banner{min-height:20px;font-size:13px;font-weight:600;color:var(--muted);text-align:center;line-height:1.4}
.cf-app .cf-banner.good{color:var(--good)}
.cf-app .cf-banner.bad{color:var(--bad)}
.cf-app .cf-ov{position:absolute;inset:0;z-index:5;display:flex;align-items:center;justify-content:center;border-radius:inherit;padding:14px;background:#0a0f1fd9;backdrop-filter:blur(3px)}
.cf-app .cf-card{display:flex;flex-direction:column;gap:10px;width:min(430px,100%);max-height:100%;overflow:hidden;padding:18px;background:#101830;border:1px solid var(--line);border-radius:12px;text-align:center}
.cf-app .cf-head{flex:none;display:flex;align-items:center;justify-content:space-between;gap:8px}
.cf-app .cf-head h3{margin:0;font-size:19px}
.cf-app .cf-head h3.good{color:var(--good)}
.cf-app .cf-head h3.bad{color:var(--bad)}
.cf-app .cf-head b{font-size:12px;letter-spacing:.18em;text-transform:uppercase;color:#fde68a}
.cf-app .cf-body,.cf-app .cf-cheat-body,.cf-app .cf-help{flex:1 1 auto;min-height:0;overflow:auto}
.cf-app .cf-body p{margin:0;font-size:12px;color:var(--muted);line-height:1.5}
.cf-app .cf-foot{flex:none;display:flex;align-items:center;justify-content:flex-end;gap:8px;flex-wrap:wrap;padding-top:10px;border-top:1px solid var(--line)}
.cf-app .cf-note{margin-right:auto;font-size:10px;color:var(--muted);line-height:1.4}
.cf-app .cf-cheat-body{display:flex;flex-direction:column;gap:6px;text-align:left}
.cf-app .cf-cheat-row{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:8px 0;border-top:1px solid var(--line)}
.cf-app .cf-cheat-row b{display:block;font-size:12px}
.cf-app .cf-cheat-row small{display:block;font-size:10px;color:var(--muted)}
.cf-app .cf-cheat-btn{flex:none;min-width:64px;min-height:44px;border-radius:9px;border:1px solid var(--line);background:#ffffff0a;color:var(--ink);font-size:11px;font-weight:700;cursor:pointer}
.cf-app .cf-cheat-btn.on{border-color:var(--accent);background:#eab3081a;color:#fde68a}
.cf-app .cf-cheat-btn:disabled{opacity:.4;cursor:default}
.cf-app .cf-cheat-dot{display:inline-block;width:6px;height:6px;border-radius:50%;background:var(--accent);vertical-align:middle}
.cf-app .cf-help{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:14px;text-align:left}
.cf-app .cf-help b{display:block;margin-bottom:6px;font-size:10px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#fde68a}
.cf-app .cf-help ul{margin:0 0 12px;padding-left:16px;font-size:11px;line-height:1.6;color:var(--muted)}
.cf-app .cf-call:focus-visible,.cf-app .cf-flipbtn:focus-visible,.cf-app .cf-coin3d:focus-visible,.cf-app .cf-btn:focus-visible,.cf-app .cf-cheat-btn:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
@media (hover:none){.cf-app kbd{display:none}}
@media (pointer:coarse){.cf-app .cf-cheat-btn{min-height:44px}}
@media (prefers-reduced-motion:reduce){.cf-app .cf-seat,.cf-app .cf-turn,.cf-app .cf-call,.cf-app .cf-flipbtn,.cf-app .cf-btn{transition:none}.cf-app .cf-call:active,.cf-app .cf-flipbtn:active,.cf-app .cf-btn:active{transform:none}}
/* --- layout overrides (keep last) --- */
.cf-app.game-fill > .cf-panel{flex:1 1 auto;min-height:0;aspect-ratio:auto}
@media (max-width:640px){
.cf-app.game-fill > .cf-panel:not(:has(.cf-ov:not([hidden]))){flex:1 1 auto;min-height:0;aspect-ratio:auto}
.cf-app.game-fill > .cf-panel:has(.cf-ov:not([hidden])){flex:0 0 auto;min-height:min(70dvh,620px);aspect-ratio:auto}
.cf-app .cf-hud{gap:5px}
.cf-app .cf-hud .cf-chip{padding:4px 6px;font-size:9px}
.cf-app .cf-hud .cf-chip[data-hud="first"],.cf-app .cf-hud .cf-chip[data-hud="streak"],.cf-app .cf-hud .cf-chip[data-hud="record"]{display:none}
.cf-app .cf-hud .cf-btn{min-height:32px;padding:5px 8px;font-size:9px}
.cf-app .cf-hud .cf-btn-label,.cf-app .cf-spacer{display:none}
.cf-app .cf-hud .cf-call{min-height:32px;padding:4px 7px;font-size:9px}
.cf-app .cf-hud .cf-call svg{width:18px;height:18px}
.cf-app .cf-hud .cf-flipbtn{min-height:32px;padding:5px 8px;font-size:9px}
.cf-app .cf-panel{padding:12px 8px;gap:10px}
.cf-app .cf-score{max-width:100%}
.cf-app .cf-scene{width:128px;height:128px}
.cf-app .cf-ov{padding:8px}
.cf-app .cf-card{width:100%;height:100%;max-height:100%;padding:12px;border-radius:12px}
.cf-app .cf-body,.cf-app .cf-cheat-body,.cf-app .cf-help{scrollbar-width:none}
.cf-app .cf-body::-webkit-scrollbar,.cf-app .cf-cheat-body::-webkit-scrollbar,.cf-app .cf-help::-webkit-scrollbar{display:none}
.cf-app .cf-note{display:none}
}
</style>
<div class="game-app cf-app game-fill" data-cf>
  <div class="cf-hud">
    <span class="cf-chip cf-status"><i class="game-status-dot"></i><span data-status>Ready</span></span>
    <span class="cf-chip">YOU <b data-hud="you">0/${TARGET}</b></span>
    <span class="cf-chip">RIVAL <b data-hud="rival">0/${TARGET}</b></span>
    <span class="cf-chip">LEFT <b data-hud="left">${MAX_FLIPS}</b></span>
    <span class="cf-chip" data-hud="first">FIRST —</span>
    <span class="cf-chip" data-hud="streak" hidden>STREAK 0</span>
    <span class="cf-chip" data-hud="record" hidden>BEST ${record}</span>
    <span class="cf-chip" data-chip>vs Bot</span>
    <span class="cf-spacer"></span>
    <div class="cf-callset" role="group" aria-label="Choose heads or tails">
      <button class="cf-call" type="button" data-call="heads" aria-label="Call heads (1)">${callIconSvg("heads")}<span>Heads</span><kbd>1</kbd></button>
      <button class="cf-call" type="button" data-call="tails" aria-label="Call tails (2)">${callIconSvg("tails")}<span>Tails</span><kbd>2</kbd></button>
    </div>
    <button class="cf-flipbtn" type="button" data-act="flip" disabled>Flip <kbd>Space</kbd></button>
    <button class="cf-btn cf-icon-btn" type="button" data-help aria-label="How to play" title="How to play (H)">${iconSVG("helpCircle", { size: 14 })}<span class="cf-btn-label">Help</span></button>
    <button class="cf-btn cf-icon-btn" type="button" data-cheats aria-label="Cheats" title="Cheats (C)">${iconSVG("wrench", { size: 14 })}<span class="cf-btn-label">Cheats</span><span class="cf-cheat-dot" data-cheat-dot hidden></span></button>
    <button class="cf-btn cf-icon-btn" type="button" data-pause aria-label="Pause" title="Pause (P)"><span class="cf-icon">${iconSVG("pause", { size: 14 })}</span><span class="cf-btn-label">Pause</span></button>
    <button class="cf-btn cf-icon-btn" type="button" data-restart data-restart-label aria-label="Restart" title="Restart (R)">${iconSVG("refresh", { size: 14 })}<span class="cf-btn-label">Restart</span></button>
    <button class="cf-btn cf-icon-btn" type="button" data-exit aria-label="Exit game" title="Exit game">${iconSVG("logOut", { size: 14 })}<span class="cf-btn-label">Exit game</span></button>
  </div>
  <section class="game-panel cf-panel" data-board>
    <div class="cf-score">
      <div class="cf-seat" data-seat="0">
        <div class="cf-seat-top"><span data-name>You</span><span class="cf-tag" data-tag hidden></span><span class="cf-turn"></span></div>
        <div class="cf-big"><b data-score>0</b><span>/${TARGET}</span></div>
        <div class="cf-mini" data-mini>${MAX_FLIPS} left</div>
        <div class="cf-dots" data-dots></div>
        <div class="cf-rec" data-rec hidden></div>
      </div>
      <div class="cf-seat" data-seat="1">
        <div class="cf-seat-top"><span data-name>Bot</span><span class="cf-tag" data-tag hidden></span><span class="cf-turn"></span></div>
        <div class="cf-big"><b data-score>0</b><span>/${TARGET}</span></div>
        <div class="cf-mini" data-mini>${MAX_FLIPS} left</div>
        <div class="cf-dots" data-dots></div>
        <div class="cf-rec" data-rec hidden></div>
      </div>
    </div>
    <div class="cf-scene">
      <div class="cf-shadow" data-el="shadow"></div>
      <div class="cf-coin3d" data-el="coin" data-act="flip" role="button" aria-label="Flip the coin">
        <div class="cf-side cf-front">${coinFaceSvg("heads", "cfGoldH" + uid)}</div>
        <div class="cf-side cf-back">${coinFaceSvg("tails", "cfGoldT" + uid)}</div>
      </div>
    </div>
    <div class="cf-face" data-el="face">HEADS</div>
    <div class="cf-peek" data-el="peek" hidden></div>
    <div class="cf-banner" data-el="banner" aria-live="polite"></div>
    <div class="cf-ov" data-el="over" hidden>
      <div class="cf-card">
        <div class="cf-head"><h3 data-over-title></h3></div>
        <div class="cf-body"><p data-over-sub></p></div>
        <div class="cf-foot"><span class="cf-note">R to restart</span><button class="cf-btn primary" type="button" data-act="restart" data-restart-label><span class="cf-btn-label">Restart</span></button><button class="cf-btn" type="button" data-exit>Exit game</button></div>
      </div>
    </div>
    <div class="cf-ov" data-el="pause" hidden>
      <div class="cf-card">
        <div class="cf-head"><h3>Paused</h3></div>
        <div class="cf-body"><p>Timers, bot moves and the coin animation are frozen.</p></div>
        <div class="cf-foot"><span class="cf-note">P or Esc to resume</span><button class="cf-btn primary" type="button" data-act="pause">Resume</button></div>
      </div>
    </div>
    <div class="cf-ov" data-el="cheats" hidden>
      <div class="cf-card">
        <div class="cf-head"><b>Cheats</b><button class="cf-btn ghost sm" type="button" data-act="cheats-close" aria-label="Close cheats">Close</button></div>
        <div class="cf-cheat-body">
          <div class="cf-cheat-row"><div><b>Peek next flip</b><small>Reveal your next outcome</small></div><button class="cf-cheat-btn" type="button" data-cheat="peek">Use</button></div>
          <div class="cf-cheat-row"><div><b>Rig next flip</b><small>Your next flip matches your call</small></div><button class="cf-cheat-btn" type="button" data-cheat="rig">Arm</button></div>
          <div class="cf-cheat-row"><div><b>Lucky coin</b><small>All your flips are correct</small></div><button class="cf-cheat-btn" type="button" data-cheat="lucky">Off</button></div>
          <div class="cf-cheat-row" data-jinx-row><div><b>Jinx the bot</b><small>Bot always misses</small></div><button class="cf-cheat-btn" type="button" data-cheat="jinx">Off</button></div>
          <div class="cf-cheat-row"><div><b>+4 flips</b><small>Extend your flip budget</small></div><button class="cf-cheat-btn" type="button" data-cheat="flips">Use</button></div>
          <div class="cf-cheat-row"><div><b>Instant win</b><small>End the session in your favor</small></div><button class="cf-cheat-btn" type="button" data-cheat="win">Use</button></div>
        </div>
        <div class="cf-foot"><span class="cf-note">C to close</span><button class="cf-btn primary" type="button" data-act="cheats-close">Done</button></div>
      </div>
    </div>
    <div class="cf-ov" data-el="help" hidden>
      <div class="cf-card">
        <div class="cf-head"><h3>How to play</h3><button class="cf-btn ghost sm" type="button" data-act="help-close" aria-label="Close help">Close</button></div>
        <div class="cf-help">
          <div>
            <b>Desktop</b>
            <ul>
              <li><kbd>1</kbd> heads · <kbd>2</kbd> tails · click the coin to flip.</li>
              <li><kbd>Space</kbd> / <kbd>Enter</kbd> flip · <kbd>R</kbd> restart.</li>
              <li><kbd>H</kbd> help · <kbd>C</kbd> cheats · <kbd>P</kbd> / <kbd>Esc</kbd> pause.</li>
            </ul>
            <b>Mobile</b>
            <ul>
              <li>Tap Heads or Tails in the HUD, then Flip (or tap the coin).</li>
            </ul>
          </div>
          <div>
            <b>Rules</b>
            <ul>
              <li>Race to 8 correct calls within 12 flips each; a toss decides who starts.</li>
              <li>Turns alternate; a correct call scores, a miss does not.</li>
              <li>First to 8 wins; if both run out, the higher score wins (draw possible).</li>
              <li>Your best streak is saved on this device.</li>
            </ul>
          </div>
        </div>
        <div class="cf-foot"><span class="cf-note">Press H to reopen this guide</span><button class="cf-btn primary" type="button" data-act="help-close">Got it</button></div>
      </div>
    </div>
  </section>
</div>`;

    /* ---------- refs ---------- */
    const $ = (s) => root.querySelector(s);
    const statusEl = $("[data-status]");
    const chipEl = $("[data-chip]");
    const coinEl = $('[data-el="coin"]');
    const shadowEl = $('[data-el="shadow"]');
    const faceEl = $('[data-el="face"]');
    const peekEl = $('[data-el="peek"]');
    const bannerEl = $('[data-el="banner"]');
    const overEl = $('[data-el="over"]');
    const overTitle = $("[data-over-title]");
    const overSub = $("[data-over-sub]");
    const pauseEl = $('[data-el="pause"]');
    const cheatsEl = $('[data-el="cheats"]');
    const helpEl = $('[data-el="help"]');
    const pauseBtn = $("[data-pause]");
    const cheatDot = $("[data-cheat-dot]");
    const jinxRow = $("[data-jinx-row]");
    const hud = {
        you: $('[data-hud="you"]'),
        rival: $('[data-hud="rival"]'),
        left: $('[data-hud="left"]'),
        first: $('[data-hud="first"]'),
        streak: $('[data-hud="streak"]'),
        record: $('[data-hud="record"]'),
    };
    const flipBtn = $(".cf-flipbtn");
    const callBtns = Array.prototype.slice.call(root.querySelectorAll(".cf-call"));
    const cheatBtns = Array.prototype.slice.call(root.querySelectorAll("[data-cheat]"));
    const restartBtns = Array.prototype.slice.call(root.querySelectorAll("[data-restart-label]"));
    const seatRefs = Array.prototype.slice.call(root.querySelectorAll(".cf-seat")).map((el) => ({
        el,
        name: el.querySelector("[data-name]"),
        tag: el.querySelector("[data-tag]"),
        score: el.querySelector("[data-score]"),
        mini: el.querySelector("[data-mini]"),
        dots: el.querySelector("[data-dots]"),
        rec: el.querySelector("[data-rec]"),
    }));

    /* ---------- state & aturan (host-authoritative) ---------- */
    function mkSeat() {
        return {
            correct: 0, used: 0, streak: 0, best: 0, budget: MAX_FLIPS,
            history: [], next: rollFace(),
            rig: false, lucky: false, jinx: false, peek: false,
        };
    }
    function freshState() {
        // posisi duduk acak saat online: host bisa jadi P1 atau P2
        const hostSeat = online ? (Math.random() < 0.5 ? 0 : 1) : 0;
        return {
            roundId: Date.now(),
            seq: 0,
            phase: "call", // call | flipping | over
            first: Math.random() < 0.5 ? 0 : 1, // lempar koin: siapa jalan duluan
            turn: 0,
            winner: null, // 0 | 1 | "draw"
            seatMap: [hostSeat, 1 - hostSeat], // [seat host, seat guest]
            target: TARGET,
            seats: [mkSeat(), mkSeat()],
            pending: null,
            lastResult: null,
        };
    }
    function mySeat() { return state ? state.seatMap[playerIndex] : 0; }
    function seatLabel(s) {
        if (s === mySeat()) return online ? String(playerName || "You").slice(0, 12) : "You";
        return online ? "Rival" : "Bot";
    }
    function computeOutcome(S, call) {
        if (S.lucky || S.rig) return call;
        if (S.jinx) return opposite(call);
        return S.next;
    }
    function canAct() {
        return Boolean(state) && !destroyed && !paused && !helpOpen && !cheatOpen &&
            state.phase === "call" && state.winner === null &&
            state.turn === mySeat() && !awaiting;
    }

    function applyAction(action, actor) {
        if (!state || !action || typeof action !== "object") return;
        if (action.type === "restart") { resetGame(); return; }
        if (state.phase === "over" || state.winner !== null) return;
        const seat = state.seatMap[actor];
        const S = state.seats[seat];

        if (action.type === "flip") {
            if (state.phase !== "call" || state.turn !== seat) return;
            const call = action.call;
            if (call !== "heads" && call !== "tails") return;
            if (S.used >= S.budget) return;
            state.pending = { seat, call, outcome: computeOutcome(S, call) };
            state.seq++;
            state.phase = "flipping";
            publish();
            const token = state.seq;
            cancelTimer(resolveTimer);
            resolveTimer = schedule(RESOLVE_DELAY, () => {
                if (state && state.phase === "flipping" && state.seq === token) resolvePending();
            });
            return;
        }

        if (action.type === "cheat") {
            if (state.phase === "flipping") return;
            switch (action.key) {
                case "peek": S.peek = true; break;
                case "rig": S.rig = true; break;
                case "lucky": S.lucky = !S.lucky; break;
                case "jinx":
                    if (online) return;
                    state.seats[1].jinx = !state.seats[1].jinx;
                    break;
                case "flips": S.budget += 4; break;
                case "win":
                    S.correct = state.target;
                    state.winner = seat;
                    state.phase = "over";
                    break;
                default: return;
            }
            publish();
        }
    }

    function resolvePending() {
        const p = state.pending;
        if (!p) return;
        const S = state.seats[p.seat];
        const hit = p.call === p.outcome;
        S.used++;
        S.history.push(hit);
        if (hit) {
            S.correct++;
            S.streak++;
            if (S.streak > S.best) S.best = S.streak;
        } else {
            S.streak = 0;
        }
        S.rig = false;
        S.peek = false;
        S.next = rollFace();
        state.lastResult = { seat: p.seat, call: p.call, outcome: p.outcome, hit };
        state.pending = null;

        if (S.correct >= state.target) {
            state.winner = p.seat;
            state.phase = "over";
        } else {
            const aOut = state.seats[0].used >= state.seats[0].budget;
            const bOut = state.seats[1].used >= state.seats[1].budget;
            if (aOut && bOut) {
                const c0 = state.seats[0].correct, c1 = state.seats[1].correct;
                state.winner = c0 > c1 ? 0 : c1 > c0 ? 1 : "draw";
                state.phase = "over";
            } else {
                const otherSeat = 1 - p.seat;
                const otherOut = state.seats[otherSeat].used >= state.seats[otherSeat].budget;
                state.turn = otherOut ? p.seat : otherSeat;
                state.phase = "call";
            }
        }
        publish();
    }

    function resetGame() {
        cancelTimer(resolveTimer);
        cancelTimer(botTimer);
        if (currentAnim) { currentAnim.cancel(); currentAnim = null; }
        state = freshState();
        state.turn = state.first;
        myCall = null;
        awaiting = false;
        animSeq = 0;
        lastRound = state.roundId;
        setCoinBase("heads");
        publish();
    }

    function publish() {
        render();
        if (online && room.isHost) room.publishState(state).catch(console.warn);
    }

    function submitAction(action) {
        if (online && !room.isHost) {
            room.sendAction(action).catch(console.warn);
            return;
        }
        applyAction(action, playerIndex);
    }

    /* ---------- bot (mode ai) ---------- */
    function maybeScheduleBot() {
        cancelTimer(botTimer);
        if (online || !state || state.phase !== "call" || state.winner !== null) return;
        if (state.turn !== state.seatMap[1]) return;
        const round = state.roundId, seq = state.seq;
        botTimer = schedule(750 + Math.random() * 650, () => {
            if (!state || state.roundId !== round || state.seq !== seq) return;
            if (state.phase !== "call" || state.turn !== state.seatMap[1]) return;
            applyAction({ type: "flip", call: rollFace() }, 1);
        });
    }

    /* ---------- animasi koin (satu putaran mulus, tanpa double-spin) ---------- */
    function setCoinBase(f) {
        baseRot = f === "tails" ? 180 : 0;
        coinEl.style.transform = "rotateX(" + baseRot + "deg)";
        faceEl.textContent = f.toUpperCase();
    }
    function startFlipAnim(outcome) {
        animSeq = state.seq;
        const targetBase = outcome === "tails" ? 180 : 0;
        const delta = ((targetBase - baseRot) % 360 + 360) % 360;
        const total = reduced ? (delta || 360) : 1080 + delta;
        const dur = reduced ? 240 : FLIP_MS;
        const ease = "cubic-bezier(.32,.05,.22,1)";
        if (currentAnim) { currentAnim.cancel(); currentAnim = null; }
        faceEl.textContent = "\u2026";
        const anim = coinEl.animate(
            [
                { transform: "rotateX(" + baseRot + "deg) translateY(0) scale(1)" },
                { transform: "rotateX(" + (baseRot + total / 2) + "deg) translateY(-54px) scale(1.05)", offset: 0.5 },
                { transform: "rotateX(" + (baseRot + total) + "deg) translateY(0) scale(1)" },
            ],
            { duration: dur, easing: ease, fill: "forwards" },
        );
        shadowAnim = shadowEl.animate(
            [
                { transform: "scaleX(1)", opacity: 0.5 },
                { transform: "scaleX(.55)", opacity: 0.22, offset: 0.5 },
                { transform: "scaleX(1)", opacity: 0.5 },
            ],
            { duration: dur, easing: ease },
        );
        currentAnim = anim;
        anim.onfinish = () => {
            baseRot = targetBase;
            coinEl.style.transform = "rotateX(" + baseRot + "deg)";
            faceEl.textContent = outcome.toUpperCase();
            if (currentAnim === anim) currentAnim = null;
            shadowAnim = null;
            anim.cancel(); // lepas fill:forwards, posisi sudah dipatok via style
            if (state && state.phase !== "flipping") {
                setCoinBase(state.lastResult ? state.lastResult.outcome : "heads");
            }
        };
        anim.oncancel = () => { if (currentAnim === anim) { currentAnim = null; shadowAnim = null; } };
    }

    function syncPauseButton() {
        const label = pauseBtn.querySelector(".cf-btn-label");
        if (label) label.textContent = paused ? "Resume" : "Pause";
        pauseBtn.setAttribute("aria-label", paused ? "Resume" : "Pause");
        pauseBtn.setAttribute("title", paused ? "Resume (P)" : "Pause (P)");
        const icon = pauseBtn.querySelector(".cf-icon");
        if (icon) icon.innerHTML = iconSVG(paused ? "play" : "pause", { size: 14 });
    }

    /* ---------- render ---------- */
    function render() {
        if (destroyed) return;
        if (!state) {
            statusEl.textContent = "Waiting for host\u2026";
            chipEl.textContent = "\u2026";
            hud.you.textContent = "0/" + TARGET;
            hud.rival.textContent = "0/" + TARGET;
            hud.left.textContent = String(MAX_FLIPS);
            hud.first.textContent = "FIRST —";
            hud.streak.textContent = "STREAK 0";
            hud.record.textContent = "BEST " + record;
            callBtns.forEach((b) => { b.disabled = true; });
            flipBtn.disabled = true;
            overEl.hidden = true;
            cheatsEl.hidden = !cheatOpen || helpOpen;
            pauseEl.hidden = !paused || helpOpen || cheatOpen;
            helpEl.hidden = !helpOpen;
            syncPauseButton();
            return;
        }
        if (state.roundId !== lastRound) {
            lastRound = state.roundId;
            animSeq = 0;
            myCall = null;
            awaiting = false;
            cheatOpen = false;
            if (currentAnim) { currentAnim.cancel(); currentAnim = null; }
            setCoinBase("heads");
        }

        const mine = mySeat();
        const myS = state.seats[mine];
        if (myS.best > record) {
            record = myS.best;
            try { localStorage.setItem(META.bestKey, String(record)); } catch (e) { }
        }

        chipEl.textContent = online ? "You are P" + (mine + 1) : "vs Bot";
        hud.you.textContent = myS.correct + "/" + state.target;
        hud.rival.textContent = state.seats[1 - mine].correct + "/" + state.target;
        hud.left.textContent = String(Math.max(0, myS.budget - myS.used));
        hud.first.textContent = "FIRST " + seatLabel(state.first).toUpperCase();
        hud.streak.textContent = "STREAK " + myS.streak;
        hud.record.textContent = "BEST " + record;
        restartBtns.forEach((b) => {
            const label = b.querySelector(".cf-btn-label");
            if (label) label.textContent = online ? "Rematch" : "Restart";
            b.setAttribute("aria-label", online ? "Rematch" : "Restart");
            b.setAttribute("title", online ? "Rematch (R)" : "Restart (R)");
        });
        syncPauseButton();

        for (let s = 0; s < 2; s++) {
            const R = seatRefs[s], S = state.seats[s];
            R.name.textContent = seatLabel(s);
            R.tag.hidden = !online;
            R.tag.textContent = "P" + (s + 1);
            R.score.textContent = String(S.correct);
            R.mini.textContent = Math.max(0, S.budget - S.used) + " left \u00b7 streak " + S.streak;
            R.el.classList.toggle("active", state.phase !== "over" && state.turn === s);
            let dots = "";
            for (let i = 0; i < S.budget; i++) {
                const h = S.history[i];
                dots += '<span class="cf-dot' + (h === true ? " hit" : h === false ? " miss" : "") + '"></span>';
            }
            R.dots.innerHTML = dots;
            R.rec.hidden = s !== mine;
            if (s === mine) R.rec.textContent = "best " + S.best + " \u00b7 record " + record;
        }

        // status & banner
        if (state.phase === "over") {
            statusEl.textContent =
                state.winner === "draw" ? "Draw game" :
                    state.winner === mine ? "You win!" : seatLabel(state.winner) + " wins";
        } else if (state.phase === "flipping") {
            statusEl.textContent = "Coin in the air\u2026";
        } else {
            statusEl.textContent =
                state.turn === mine ? "Your turn \u2014 call it" :
                    online ? "Rival is calling\u2026" : "Bot is thinking\u2026";
        }
        const totalUsed = state.seats[0].used + state.seats[1].used;
        if (state.phase === "call" && state.turn === mine && myCall) {
            bannerEl.textContent = "You call " + myCall.toUpperCase();
            bannerEl.className = "cf-banner";
        } else if (state.lastResult) {
            const L = state.lastResult;
            bannerEl.textContent = cap(L.outcome) + " \u2014 " + seatLabel(L.seat) + (L.hit ? " called it" : " missed");
            bannerEl.className = "cf-banner " + (L.hit ? "good" : "bad");
        } else if (totalUsed === 0) {
            bannerEl.textContent = seatLabel(state.first) + " won the toss and goes first";
            bannerEl.className = "cf-banner";
        }

        // peek hanya untuk sisi sendiri
        const showPeek = myS.peek && state.phase !== "over";
        peekEl.hidden = !showPeek;
        if (showPeek) peekEl.textContent = "NEXT: " + myS.next.toUpperCase();

        // kontrol (virtual buttons mobile + mouse desktop)
        const ok = canAct();
        callBtns.forEach((b) => {
            b.disabled = !ok;
            b.classList.toggle("sel", b.dataset.call === myCall);
            b.setAttribute("aria-pressed", b.dataset.call === myCall ? "true" : "false");
        });
        flipBtn.disabled = !ok || !myCall;

        // overlay hasil
        if (state.phase === "over") {
            const win = state.winner === mine;
            overTitle.textContent =
                state.winner === "draw" ? "Draw" : win ? "You win!" : seatLabel(state.winner) + " wins";
            overTitle.className = state.winner === "draw" ? "" : win ? "good" : "bad";
            overSub.textContent =
                seatLabel(mine) + " " + myS.correct + " \u2014 " +
                state.seats[1 - mine].correct + " " + seatLabel(1 - mine) +
                " \u00b7 " + totalUsed + " flips";
            overEl.hidden = helpOpen || cheatOpen || paused;
        } else {
            overEl.hidden = true;
        }

        // overlays: help > cheats > pause; all freeze the game
        pauseEl.hidden = !paused || helpOpen || cheatOpen;
        helpEl.hidden = !helpOpen;
        cheatsEl.hidden = !cheatOpen || helpOpen;
        jinxRow.hidden = online;
        const cheatOk = state.phase === "call";
        cheatBtns.forEach((b) => {
            const k = b.dataset.cheat;
            b.disabled = !cheatOk;
            if (k === "lucky") {
                b.classList.toggle("on", myS.lucky);
                b.textContent = myS.lucky ? "On" : "Off";
                b.setAttribute("aria-pressed", myS.lucky ? "true" : "false");
            } else if (k === "jinx") {
                const on = state.seats[1].jinx;
                b.classList.toggle("on", on);
                b.textContent = on ? "On" : "Off";
                b.setAttribute("aria-pressed", on ? "true" : "false");
            } else if (k === "rig") {
                b.classList.toggle("on", myS.rig);
                b.textContent = myS.rig ? "Armed" : "Arm";
            } else if (k === "peek") {
                b.classList.toggle("on", myS.peek);
            }
        });
        cheatDot.hidden = !(myS.rig || myS.lucky || myS.peek || (!online && state.seats[1].jinx));

        // animasi: hanya sekali per seq flip
        if (state.phase === "flipping" && state.pending && state.seq !== animSeq) {
            startFlipAnim(state.pending.outcome);
        }
        if (state.phase !== "flipping" && !currentAnim) {
            setCoinBase(state.lastResult ? state.lastResult.outcome : "heads");
        }

        maybeScheduleBot();
    }

    /* ---------- input ---------- */
    function selectCall(c) {
        if (!canAct()) return;
        myCall = c;
        render();
    }
    function tryFlip() {
        if (!canAct()) return;
        if (!myCall) {
            bannerEl.textContent = "Pick a side first";
            bannerEl.className = "cf-banner bad";
            return;
        }
        if (online && !room.isHost) { awaiting = true; render(); }
        submitAction({ type: "flip", call: myCall });
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
            if (a === "flip") { tryFlip(); return; }
            if (a === "restart") { restartGame(); return; }
            if (a === "pause") { togglePause(false); return; }
            if (a === "cheats") { toggleCheats(); return; }
            if (a === "cheats-close") { toggleCheats(false); return; }
            if (a === "help-close") { toggleHelp(false); return; }
        }
        const cb = t.closest("[data-call]");
        if (cb) { selectCall(cb.dataset.call); return; }
        const ch = t.closest("[data-cheat]");
        if (ch && !paused && !helpOpen) { submitAction({ type: "cheat", key: ch.dataset.cheat }); }
    }

    function onKey(e) {
        if (destroyed) return;
        if (e.ctrlKey || e.metaKey || e.altKey) return;
        const t = e.target;
        if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
        const code = e.code || "";
        const k = (e.key || "").toLowerCase();
        if (e.repeat) return; // tahan tombol tidak memicu aksi berulang

        /* prioritas UI: help → cheats → pause/Escape → restart → aksi game */
        if (code === "KeyH" || k === "h") { toggleHelp(); e.preventDefault(); return; }
        if (code === "KeyC" || k === "c") { if (!helpOpen) toggleCheats(); e.preventDefault(); return; }
        if (code === "KeyP" || code === "Escape" || k === "p" || k === "escape") {
            if (helpOpen) toggleHelp(false);
            else if (cheatOpen) toggleCheats(false);
            else togglePause();
            e.preventDefault(); return;
        }
        if (code === "KeyR" || k === "r") { if (state) restartGame(); e.preventDefault(); return; }
        if (helpOpen || cheatOpen || !state) return;
        if (paused) {
            if (code === "Space" || code === "Enter") { togglePause(false); e.preventDefault(); }
            return;
        }
        if (code === "Digit1" || code === "Numpad1" || k === "1") { selectCall("heads"); e.preventDefault(); return; }
        if (code === "Digit2" || code === "Numpad2" || k === "2" || code === "KeyT") { selectCall("tails"); e.preventDefault(); return; }
        if (code === "Space" || code === "Enter") {
            if (t && t.closest && t.closest("button")) return;
            e.preventDefault();
            tryFlip();
        }
    }

    root.addEventListener("click", handleClick);
    document.addEventListener("keydown", onKey);
    syncFreeze();

    /* ---------- wiring ---------- */
    if (online) {
        offs.push(room.onRoom((nextRoom) => { roomData = nextRoom; render(); }));
        if (room.isHost) {
            state = freshState();
            state.turn = state.first;
            publish();
            offs.push(room.onAction((action) => applyAction(action, 1)));
        } else {
            render();
            offs.push(room.onState((nextState) => { state = nextState; awaiting = false; render(); }));
        }
    } else {
        state = freshState();
        state.turn = state.first;
        render();
    }

    return {
        destroy() {
            destroyed = true;
            root.removeEventListener("click", handleClick);
            document.removeEventListener("keydown", onKey);
            cancelTimer(resolveTimer);
            cancelTimer(botTimer);
            if (currentAnim) { currentAnim.cancel(); currentAnim = null; }
            if (shadowAnim) { try { shadowAnim.cancel(); } catch (e) { } shadowAnim = null; }
            timers.clear();
            for (const off of offs) {
                if (typeof off === "function") { try { off(); } catch (e) { } }
            }
        },
    };
}