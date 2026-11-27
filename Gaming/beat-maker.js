/* ==== GAME: beat-maker.js ==== */
/* Beat Maker - turn-based memory duel on a 16-step drum grid.
   Modes: "ai" (vs bot, fully local) and "room" (online, host-authoritative).
   Register its metadata + module path in GAMES inside app.js. */

import { iconSVG } from "../JS/icons.js";

export const META = {
  id: "beat-maker",
  name: "Beat Maker",
  category: "music",
  catLabel: "Music",
  desc: "Build beats on a 16-step grid, or recreate target patterns to win.",
  art: `<svg viewBox="0 0 48 48" width="54" height="54" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="24" cy="24" r="19"/><circle cx="24" cy="24" r="4" fill="currentColor" stroke="none"/><path d="M24 5v6M24 37v6M5 24h6M37 24h6M10.6 10.6l4.2 4.2M33.2 33.2l4.2 4.2M37.4 10.6l-4.2 4.2M14.8 33.2l-4.2 4.2"/></svg>`,
  bg: ["#c7d2fe", "#6366f1"],
};

export function mount(root, context = {}) {
    const { mode = "ai", room = null, playerName = "Player", onExit = () => { } } = context;
    const online = mode === "room" && Boolean(room);
    const playerIndex = online && !room.isHost ? 1 : 0; // connection index (host = 0)
    let roomData = room?.room || null;
    let state = null;

    /* ---------------- rules ---------------- */
    const ROWS = 8, STEPS = 16, START_LIVES = 3, MAX_LIVES = 5, MAX_CHAIN = 64;
    const TRACKS = [
        { name: "Kick", hue: "#e2635c" },
        { name: "Snare", hue: "#e89a5b" },
        { name: "Clap", hue: "#d9c26a" },
        { name: "Hat", hue: "#8fbf7f" },
        { name: "OpenHat", hue: "#63b8a6" },
        { name: "Tom", hue: "#6fa8dc" },
        { name: "Rim", hue: "#9d8fd8" },
        { name: "Cowbell", hue: "#d18fc4" },
    ];
    const rnd = (n) => Math.floor(Math.random() * n);
    const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
    const cellKey = (r, s) => r * STEPS + s;

    /* Random seat shuffle (multiplayer) + random first move (every mode). */
    function initState(prev = null) {
        return {
            v: 1,
            hostSeat: rnd(2),
            turn: rnd(2),
            phase: "add",            // replay | add | over
            seq: [],                 // chain of { r, s } built by the players
            progress: 0,
            lives: [START_LIVES, START_LIVES],
            winner: null,
            previewToken: prev ? prev.previewToken + 1 : 1,
            pickN: prev ? prev.pickN : 0,
            lastPick: null,
        };
    }
    const mySeat = () => {
        if (!online || !state) return 0;
        return playerIndex === 0 ? state.hostSeat : 1 - state.hostSeat;
    };
    function seatLabel(seat) {
        if (!online) return seat === 0 ? (playerName || "You") : "Bot";
        const conn = state && seat === state.hostSeat ? 0 : 1;
        const p = roomData?.players?.[conn];
        return p?.name || p?.playerName || "Player " + (seat + 1);
    }

    /* ---------------- tiny synth: 8 instruments ---------------- */
    let AC = null, noiseBuf = null, muted = false;
    function actx() {
        if (!AC) {
            try { AC = new (window.AudioContext || window.webkitAudioContext)(); }
            catch (e) { AC = null; }
        }
        if (AC && AC.state === "suspended") AC.resume().catch(() => { });
        return AC;
    }
    function tone(freq, dur, type, vol, slideTo) {
        const c = actx();
        if (!c || muted || timersFrozen) return;
        try {
            const t = c.currentTime, o = c.createOscillator(), g = c.createGain();
            o.type = type || "sine";
            o.frequency.setValueAtTime(freq, t);
            if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur * 0.85);
            g.gain.setValueAtTime(0.0001, t);
            g.gain.exponentialRampToValueAtTime(vol || 0.25, t + 0.008);
            g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
            o.connect(g); g.connect(c.destination);
            o.start(t); o.stop(t + dur + 0.05);
        } catch (e) { }
    }
    function hiss(dur, vol, type, freq, q) {
        const c = actx();
        if (!c || muted || timersFrozen) return;
        try {
            if (!noiseBuf) {
                noiseBuf = c.createBuffer(1, Math.floor(c.sampleRate * 0.3), c.sampleRate);
                const d = noiseBuf.getChannelData(0);
                for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
            }
            const t = c.currentTime;
            const src = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
            src.buffer = noiseBuf;
            f.type = type || "highpass"; f.frequency.value = freq || 6000; f.Q.value = q || 1;
            g.gain.setValueAtTime(0.0001, t);
            g.gain.exponentialRampToValueAtTime(vol || 0.2, t + 0.006);
            g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
            src.connect(f); f.connect(g); g.connect(c.destination);
            src.start(t); src.stop(t + dur + 0.02);
        } catch (e) { }
    }

    /* ---------------- timers (pausable) ---------------- */
    const timers = new Map(); // logical id -> { id, fn, ms, due, tid }
    let nextTimerId = 1;
    let autoId = 0;
    let timersFrozen = false;
    function arm(rec) {
        rec.due = Date.now() + rec.ms;
        rec.tid = setTimeout(() => {
            timers.delete(rec.id);
            if (!timersFrozen) rec.fn();
        }, rec.ms);
    }
    function later(fn, ms) {
        const id = nextTimerId++;
        const rec = { id, fn, ms: Math.max(0, ms), due: Infinity, tid: 0 };
        timers.set(id, rec);
        if (!timersFrozen) arm(rec);
        return id;
    }
    function clearTimers() {
        for (const rec of timers.values()) clearTimeout(rec.tid);
        timers.clear();
        autoId = 0;
    }
    function freezeTimers() {
        if (timersFrozen) return;
        timersFrozen = true;
        for (const rec of timers.values()) {
            clearTimeout(rec.tid);
            if (rec.due !== Infinity) rec.ms = Math.max(0, rec.due - Date.now());
        }
    }
    function thawTimers() {
        if (!timersFrozen) return;
        timersFrozen = false;
        for (const rec of timers.values()) arm(rec);
    }
    function scheduleAuto(fn, ms) {
        if (autoId) return;
        autoId = later(() => { autoId = 0; fn(); }, ms);
    }
    function syncFreeze() {
        if (paused || helpOpen || cheatsOpen) freezeTimers();
        else thawTimers();
    }

    const SOUNDS = [
        () => tone(160, 0.16, "sine", 0.55, 42),                                  // kick
        () => { hiss(0.12, 0.3, "bandpass", 1800, 0.9); tone(190, 0.08, "triangle", 0.22); }, // snare
        () => { hiss(0.05, 0.26, "bandpass", 1200, 1.2); later(() => hiss(0.07, 0.2, "bandpass", 1400, 1.2), 30); }, // clap
        () => hiss(0.045, 0.2, "highpass", 7500),                                 // closed hat
        () => hiss(0.28, 0.16, "highpass", 6000),                                 // open hat
        () => tone(210, 0.2, "sine", 0.4, 75),                                    // tom
        () => { tone(820, 0.03, "square", 0.16); hiss(0.02, 0.08, "highpass", 4000); }, // rim
        () => { tone(540, 0.14, "square", 0.11); tone(810, 0.14, "square", 0.09); },     // cowbell
    ];
    const badBuzz = () => tone(120, 0.2, "sawtooth", 0.18, 65);

    /* ---------------- local (non-synced) UI state ---------------- */
    const cheats = { hint: false, auto: false, mark: false, slow: false, blunder: false };
    let previewing = false, lastToken = -1, lastPickN = 0;
    let cursor = { r: 0, s: 0 }, kbMode = false;
    let cheatsOpen = false, helpOpen = false, paused = false;
    let seenHelp = true;
    try { seenHelp = localStorage.getItem("beat-maker-help-seen") === "1"; } catch (e) { seenHelp = true; }
    if (!seenHelp) {
        helpOpen = true;
        try { localStorage.setItem("beat-maker-help-seen", "1"); } catch (e) { /* storage blocked */ }
    }

    /* ---------------- markup: HUD + fill board + overlay modals ---------------- */
    function gridHTML() {
        let h = '<span class="bm-corner" aria-hidden="true"></span>';
        for (let s = 0; s < STEPS; s++) h += '<span class="bm-num">' + (s + 1) + "</span>";
        for (let r = 0; r < ROWS; r++) {
            h += '<span class="bm-label"><i style="--h:' + TRACKS[r].hue + '"></i>' + TRACKS[r].name + "</span>";
            for (let s = 0; s < STEPS; s++) {
                h += '<button type="button" class="bm-cell" data-r="' + r + '" data-s="' + s +
                    '" style="--h:' + TRACKS[r].hue + '" aria-label="' + TRACKS[r].name + " step " + (s + 1) + '"></button>';
            }
        }
        return h;
    }

    root.innerHTML = `
<style>
.bm-game{--line:rgba(127,127,127,.28);--soft:rgba(127,127,127,.08);--accent:#818cf8;--gap:4px;color:#e5e7eb}
.bm-game [hidden]{display:none!important}
.bm-hud{display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-bottom:10px;font:600 9px/1 ui-monospace,SFMono-Regular,Menlo,monospace}
.bm-chip{display:inline-flex;align-items:center;gap:5px;padding:4px 7px;border:1px solid var(--line);border-radius:999px;background:var(--soft);white-space:nowrap}
.bm-chip b{font-weight:700;font-variant-numeric:tabular-nums;opacity:1}
.bm-chip.active{border-color:var(--accent);box-shadow:inset 0 0 0 1px var(--accent);opacity:1}
.bm-chip[data-chip="note"]{max-width:220px;overflow:hidden;text-overflow:ellipsis}
.bm-spacer{flex:1 1 auto}
.bm-btn{font:inherit;font-size:10px;min-height:32px;padding:5px 8px;border:1px solid var(--line);border-radius:9px;background:transparent;color:inherit;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:5px;transition:border-color .15s,background .15s}
.bm-btn:hover{border-color:var(--accent)}
.bm-btn:disabled{opacity:.45;cursor:default}
.bm-btn.primary{background:var(--accent);border-color:var(--accent);color:#fff}
.bm-btn.on{border-color:var(--accent);color:var(--accent)}
.bm-icon-btn svg{flex:none;display:block}
.bm-btn-icon{display:inline-flex;align-items:center}
.bm-board{position:relative;display:flex;flex-direction:column;gap:8px;min-height:0;padding:14px;border:1px solid var(--line);border-radius:12px;background:var(--soft);overflow:hidden}
.bm-grid{display:grid;grid-template-columns:56px repeat(16,minmax(0,1fr));gap:var(--gap);align-items:center;align-content:center;flex:1 1 auto;min-height:0}
.bm-corner{display:block}
.bm-num{font-size:10px;text-align:center;opacity:.6;font-variant-numeric:tabular-nums}
.bm-label{display:flex;align-items:center;justify-content:flex-end;gap:4px;font-size:11px;font-weight:600;opacity:.85;white-space:nowrap;padding-right:4px}
.bm-label i{width:8px;height:8px;border-radius:50%;background:var(--h);flex:none}
.bm-cell{position:relative;aspect-ratio:1.15/1;min-width:0;min-height:28px;border:1px solid var(--line);border-radius:8px;background:transparent;padding:0;cursor:pointer;transition:background .15s,border-color .15s,transform .15s}
.bm-grid.locked .bm-cell{cursor:default}
.bm-grid:not(.locked) .bm-cell:hover{border-color:var(--accent)}
.bm-cell.used{background:var(--soft);box-shadow:inset 0 0 0 1.5px var(--h)}
.bm-cell.flash,.bm-cell.pop{background:var(--h);border-color:transparent}
.bm-cell.pop{transform:scale(1.06)}
.bm-cell.bad{background:#ef4444;border-color:transparent}
.bm-cell.hint{outline:2px solid var(--accent);outline-offset:1px;animation:bm-pulse 1s infinite}
.bm-cell.cursor{outline:2px solid currentColor;outline-offset:1px}
@keyframes bm-pulse{50%{outline-color:transparent}}
.bm-ov{position:absolute;inset:0;z-index:30;display:grid;place-items:center;padding:14px;background:rgba(10,12,16,.55);border-radius:inherit}
.bm-card{display:flex;flex-direction:column;gap:12px;width:min(420px,100%);max-height:100%;overflow:hidden;padding:18px;background:#16181d;color:#eceef2;border:1px solid rgba(255,255,255,.12);border-radius:12px;box-shadow:0 12px 32px rgba(0,0,0,.35)}
.bm-card.bm-center{text-align:center;align-items:center;width:min(340px,100%)}
.bm-card h3{margin:0;font-size:18px}
.bm-card p{margin:0;font-size:13px;opacity:.8;line-height:1.5}
.bm-head,.bm-foot{flex:none}
.bm-head{display:flex;align-items:center;justify-content:space-between;gap:10px;width:100%}
.bm-head h3{font-size:15px}
.bm-foot{display:flex;align-items:center;justify-content:space-between;gap:10px;width:100%;padding-top:10px;border-top:1px solid rgba(255,255,255,.14)}
.bm-note-sm{font-size:11px;opacity:.7}
.bm-cheats,.bm-help,.bm-stats{display:flex;flex-direction:column;gap:8px;flex:1 1 auto;min-height:0;overflow:auto}
.bm-help{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));align-content:start;gap:12px}
.bm-help b{display:block;margin-bottom:4px;font:700 10px/1 ui-monospace,monospace;letter-spacing:.08em;text-transform:uppercase;opacity:.65}
.bm-help ul{margin:0 0 10px;padding-left:16px;font-size:11px;line-height:1.6;opacity:.85}
.bm-card .bm-btn{border-color:rgba(255,255,255,.24);color:#eceef2}
.bm-card .bm-btn:hover{border-color:var(--accent)}
.bm-card .bm-btn.primary{background:var(--accent);border-color:var(--accent);color:#fff}
.bm-crow{display:flex;justify-content:space-between;align-items:center;gap:12px;font-size:13px;min-height:36px}
.bm-sw{width:40px;height:24px;border-radius:999px;border:1px solid rgba(255,255,255,.2);background:transparent;position:relative;cursor:pointer;padding:0;flex:none;transition:background .15s,border-color .15s}
.bm-sw::after{content:"";position:absolute;top:3px;left:3px;width:16px;height:16px;border-radius:50%;background:#8a8f98;transition:left .15s,background .15s}
.bm-sw[aria-checked="true"]{background:var(--accent);border-color:var(--accent)}
.bm-sw[aria-checked="true"]::after{left:19px;background:#fff}
@media (max-width:640px){
.bm-hud{font-size:9px;gap:5px;margin-bottom:8px}
.bm-chip{padding:4px 6px}
.bm-grid{grid-template-columns:44px repeat(16,minmax(0,1fr))}
.bm-label{font-size:9px;gap:3px}
.bm-label i{width:6px;height:6px}
.bm-num{font-size:8px}
.bm-cell{min-height:40px;aspect-ratio:auto;border-radius:8px}
.bm-board{padding:12px}
.bm-card{padding:14px}
}
@media (pointer:coarse){
.bm-game button:not(:disabled){min-height:44px}
.bm-grid{grid-template-columns:48px repeat(16,44px);overflow-x:auto;overscroll-behavior-x:contain;scrollbar-width:thin;padding-bottom:4px}
.bm-cell{min-height:44px}
.bm-num,.bm-label{font-size:9px}
}
@media (prefers-reduced-motion:reduce){
.bm-cell.hint{animation:none}
.bm-cell,.bm-btn,.bm-sw,.bm-sw::after{transition:none}
}

/* --- fill height + mobile refinements (keep last) --- */
.bm-icon-btn{display:inline-flex;align-items:center;gap:6px}
.bm-icon-btn svg{flex:none;display:block}
.bm-card .bm-cheats,.bm-card .bm-help,.bm-card .bm-stats{min-height:0;overflow:auto}
@media (max-width:640px){
.bm-game.game-fill > .bm-board{flex:0 0 auto;min-height:0}
.bm-game.game-fill > .bm-board:has(.bm-ov:not([hidden])){min-height:min(70dvh,620px)}
.bm-game .bm-hud{gap:5px;margin-bottom:8px}
.bm-game .bm-hud .bm-chip{padding:4px 6px;font-size:9px}
.bm-game .bm-hud .bm-chip[data-chip="mode"],
.bm-game .bm-hud .bm-chip[data-chip="step"],
.bm-game .bm-hud .bm-chip[data-chip="note"]{display:none}
.bm-game .bm-hud .bm-btn{min-height:32px;padding:5px 8px;font-size:9px}
.bm-game .bm-hud .bm-btn-label,
.bm-game .bm-hud .bm-spacer{display:none}
.bm-game .bm-ov{padding:8px}
.bm-game .bm-card{width:100%;height:100%;max-height:100%;padding:12px;border-radius:12px}
.bm-game .bm-cheats,.bm-game .bm-help,.bm-game .bm-stats{scrollbar-width:none}
.bm-game .bm-cheats::-webkit-scrollbar,.bm-game .bm-help::-webkit-scrollbar,.bm-game .bm-stats::-webkit-scrollbar{display:none}
.bm-game .bm-foot{position:static;margin:0;padding:10px 0 0;border-top:1px solid rgba(255,255,255,.14)}
.bm-game .bm-note-sm{display:none}
}
</style>
<div class="game-app bm-game game-fill" data-bm>
  <div class="bm-hud">
    <span class="bm-chip" data-chip="mode">MODE <b data-hud="mode">vs Bot</b></span>
    <span class="bm-chip">YOU <b data-hud="seat">P1</b></span>
    <span class="bm-chip" data-chip="turn">TURN <b data-hud="turn">Ready</b></span>
    <span class="bm-chip" data-chip="p0">P1 <b data-plives="0"></b></span>
    <span class="bm-chip" data-chip="p1">P2 <b data-plives="1"></b></span>
    <span class="bm-chip">CHAIN <b data-hud="chain">0/${MAX_CHAIN}</b></span>
    <span class="bm-chip" data-chip="step">STEP <b data-hud="step">0/0</b></span>
    <span class="bm-chip" data-chip="note"><span data-hud="note">Add one hit</span></span>
    <span class="bm-spacer"></span>
    <button class="bm-btn bm-icon-btn" type="button" data-listen aria-label="Listen" title="Listen (L)">${iconSVG("playCircle", { size: 14 })}<span class="bm-btn-label">Listen</span></button>
    <button class="bm-btn bm-icon-btn" type="button" data-mute aria-label="Mute" aria-pressed="false" title="Mute (M)"><span class="bm-btn-icon">${iconSVG("volume1", { size: 14 })}</span><span class="bm-btn-label">Mute</span></button>
    <button class="bm-btn bm-icon-btn" type="button" data-help aria-label="How to play" title="How to play (H)">${iconSVG("helpCircle", { size: 14 })}<span class="bm-btn-label">Help</span></button>
    <button class="bm-btn bm-icon-btn" type="button" data-cheats aria-label="Cheats" title="Cheats (C)">${iconSVG("wrench", { size: 14 })}<span class="bm-btn-label">Cheats</span></button>
    <button class="bm-btn bm-icon-btn" type="button" data-pause aria-label="Pause" title="Pause (P)"><span class="bm-btn-icon">${iconSVG("pause", { size: 14 })}</span><span class="bm-btn-label">Pause</span></button>
    <button class="bm-btn bm-icon-btn" type="button" data-restart aria-label="Restart" title="Restart (R)">${iconSVG("refresh", { size: 14 })}<span class="bm-btn-label">Restart</span></button>
    <button class="bm-btn bm-icon-btn" type="button" data-exit aria-label="Exit game" title="Exit game">${iconSVG("logOut", { size: 14 })}<span class="bm-btn-label">Exit</span></button>
  </div>
  <section class="game-panel bm-board" data-board>
    <div class="bm-grid" data-grid>${gridHTML()}</div>
    <div class="bm-ov" data-ov="over" hidden>
      <div class="bm-card bm-center">
        <h3 data-overtitle></h3>
        <p data-oversub></p>
        <button class="bm-btn primary" type="button" data-restart>Play again</button>
      </div>
    </div>
    <div class="bm-ov" data-ov="pause" hidden>
      <div class="bm-card bm-center">
        <h3>Paused</h3>
        <p>Timers and the bot are frozen.</p>
        <button class="bm-btn primary" type="button" data-resume>Resume</button>
      </div>
    </div>
    <div class="bm-ov" data-ov="cheat" hidden>
      <div class="bm-card">
        <div class="bm-head"><h3>Cheats</h3><button class="bm-btn" type="button" data-cheat-close aria-label="Close cheats">Close</button></div>
        <div class="bm-cheats">
          <div class="bm-crow"><span>Hint: next hit</span><button class="bm-sw" type="button" role="switch" aria-checked="false" aria-label="Hint: next hit" data-cheat="hint"></button></div>
          <div class="bm-crow"><span>Auto-repeat my turn</span><button class="bm-sw" type="button" role="switch" aria-checked="false" aria-label="Auto-repeat my turn" data-cheat="auto"></button></div>
          <div class="bm-crow"><span>Mark used cells</span><button class="bm-sw" type="button" role="switch" aria-checked="false" aria-label="Mark used cells" data-cheat="mark"></button></div>
          <div class="bm-crow"><span>Slow preview</span><button class="bm-sw" type="button" role="switch" aria-checked="false" aria-label="Slow preview" data-cheat="slow"></button></div>
          <div class="bm-crow" data-ai><span>Bot blunder &times;3</span><button class="bm-sw" type="button" role="switch" aria-checked="false" aria-label="Bot blunder times three" data-cheat="blunder"></button></div>
          <div class="bm-crow" data-ai><span>Extra life</span><button class="bm-btn" type="button" data-life aria-label="Extra life">+1</button></div>
        </div>
      </div>
    </div>
    <div class="bm-ov" data-ov="help" hidden>
      <div class="bm-card">
        <div class="bm-head"><h3>How to play</h3><button class="bm-btn" type="button" data-help-close aria-label="Close help">Close</button></div>
        <div class="bm-help">
          <div>
            <b>Desktop</b>
            <ul>
              <li>Click a grid cell to place your hit.</li>
              <li>Keys 1-8 pick a track; arrows move; Space or Enter places a hit.</li>
              <li>L replay &middot; M mute &middot; R restart</li>
              <li>H help &middot; C cheats &middot; P/Esc pause</li>
            </ul>
            <b>Mobile</b>
            <ul>
              <li>Tap a cell to place your hit; use the HUD icons for the rest.</li>
            </ul>
          </div>
          <div>
            <b>Rules</b>
            <ul>
              <li>Players alternate adding one hit to the shared beat.</li>
              <li>On your replay turn, repeat the whole chain in order.</li>
              <li>A wrong hit costs one life; you start with three.</li>
              <li>First player to run out lives loses, or chain ${MAX_CHAIN} ends the duel.</li>
            </ul>
            <div class="bm-foot"><span class="bm-note-sm">Press H to reopen this guide</span><button class="bm-btn primary" type="button" data-help-close>Got it</button></div>
          </div>
        </div>
      </div>
    </div>
  </section>
</div>`;

    /* ---------------- refs ---------------- */
    const q = (s) => root.querySelector(s);
    const gridEl = q("[data-grid]");
    const hud = {
        mode: q('[data-hud="mode"]'),
        seat: q('[data-hud="seat"]'),
        turn: q('[data-hud="turn"]'),
        chain: q('[data-hud="chain"]'),
        step: q('[data-hud="step"]'),
        note: q('[data-hud="note"]'),
        lives: [q('[data-plives="0"]'), q('[data-plives="1"]')],
        chips: [q('[data-chip="p0"]'), q('[data-chip="p1"]')],
    };
    const listenBtn = q("[data-listen]");
    const muteBtn = q("[data-mute]");
    const cheatsBtn = q("[data-cheats]");
    const pauseBtn = q("[data-pause]");
    const restartBtn = q("[data-restart]");
    const lifeBtn = q("[data-life]");
    const ov = {
        over: q('[data-ov="over"]'),
        pause: q('[data-ov="pause"]'),
        cheat: q('[data-ov="cheat"]'),
        help: q('[data-ov="help"]'),
    };
    const overTitle = q("[data-overtitle]");
    const overSub = q("[data-oversub]");
    const cellEls = Array.from(root.querySelectorAll(".bm-cell"));

    /* ---------------- rendering ---------------- */
    function flashCell(r, s, cls, ms) {
        const el = cellEls[cellKey(r, s)];
        if (!el) return;
        el.classList.add(cls);
        later(() => el.classList.remove(cls), ms);
    }

    function syncPauseBtn() {
        if (!pauseBtn) return;
        const label = pauseBtn.querySelector(".bm-btn-label");
        if (label) label.textContent = paused ? "Resume" : "Pause";
        pauseBtn.setAttribute("aria-label", paused ? "Resume" : "Pause");
        const icon = pauseBtn.querySelector(".bm-btn-icon");
        if (icon) icon.innerHTML = iconSVG(paused ? "play" : "pause", { size: 14 });
    }

    function syncCheatBtn() {
        if (!cheatsBtn) return;
        const active = Object.values(cheats).filter(Boolean).length;
        cheatsBtn.classList.toggle("on", active > 0);
        cheatsBtn.setAttribute("aria-pressed", String(cheatsOpen));
        const label = cheatsBtn.querySelector(".bm-btn-label");
        if (label) label.textContent = active ? "Cheats " + active : "Cheats";
    }

    function syncOverlays() {
        const over = !!state && state.phase === "over";
        ov.over.hidden = !over || cheatsOpen || helpOpen || paused;
        ov.pause.hidden = !paused || cheatsOpen || helpOpen;
        ov.cheat.hidden = !cheatsOpen || helpOpen;
        ov.help.hidden = !helpOpen;
        if (restartBtn) restartBtn.disabled = !over;
    }

    function updateTurnUI() {
        if (!state) return;
        const me = mySeat();
        const mine = state.turn === me;
        const over = state.phase === "over";

        hud.mode.textContent = online ? "Online" : "vs Bot";
        hud.seat.textContent = "P" + (me + 1);
        hud.turn.textContent = over ? "Finished"
            : paused ? "Paused"
                : previewing ? "Listen"
                    : mine ? (state.phase === "add" ? "Your turn" : "Repeat")
                        : (online ? "Rival" : "Bot");
        hud.note.textContent = over ? ""
            : previewing ? "\u2026"
                : mine ? (state.phase === "add" ? "Add one hit" : "Repeat " + state.progress + "/" + state.seq.length)
                    : seatLabel(state.turn) + " is playing";
        hud.chain.textContent = state.seq.length + "/" + MAX_CHAIN;
        hud.step.textContent = state.progress + "/" + state.seq.length;
        for (let seat = 0; seat < 2; seat++) {
            const total = Math.max(START_LIVES, state.lives[seat]);
            let hearts = "";
            for (let i = 0; i < total; i++) hearts += i < state.lives[seat] ? "\u2665" : "\u2661";
            hud.lives[seat].textContent = hearts;
            hud.chips[seat].title = seatLabel(seat);
            hud.chips[seat].classList.toggle("active", !over && state.turn === seat);
        }

        gridEl.classList.toggle("locked", over || previewing || !mine || paused || helpOpen || cheatsOpen);
        const used = new Set(cheats.mark ? state.seq.map((c) => cellKey(c.r, c.s)) : []);
        const hint = cheats.hint && mine && state.phase === "replay" && !previewing ? state.seq[state.progress] : null;
        cellEls.forEach((el) => {
            const r = Number(el.dataset.r), s = Number(el.dataset.s), k = cellKey(r, s);
            el.classList.toggle("used", used.has(k));
            el.classList.toggle("hint", !!hint && hint.r === r && hint.s === s);
            el.classList.toggle("cursor", kbMode && cursor.r === r && cursor.s === s);
        });

        listenBtn.disabled = !state.seq.length || previewing || over || paused || helpOpen || cheatsOpen;
        lifeBtn.disabled = online || state.lives[0] >= MAX_LIVES;
        root.querySelectorAll("[data-ai]").forEach((el) => { el.hidden = online; });
        for (const k of Object.keys(cheats)) {
            const sw = q('[data-cheat="' + k + '"]');
            if (sw) sw.setAttribute("aria-checked", String(cheats[k]));
        }
        syncPauseBtn();
        syncCheatBtn();

        if (over) {
            overTitle.textContent = online
                ? (state.winner === me ? "You win" : "You lose")
                : (state.winner === 0 ? "You win" : "Bot wins");
            overSub.textContent = state.seq.length >= MAX_CHAIN
                ? "Chain limit \u00b7 most lives wins"
                : seatLabel(1 - state.winner) + " ran out of lives \u00b7 chain " + state.seq.length;
        }
    }

    function pickSideEffects() {
        const lp = state.lastPick;
        if (lp && lp.n !== lastPickN) {
            lastPickN = lp.n;
            if (timersFrozen) return;
            flashCell(lp.r, lp.s, lp.ok ? "pop" : "bad", 260);
            if (lp.ok) SOUNDS[lp.r](); else badBuzz();
        }
    }

    function render() {
        syncFreeze();
        if (!state) {
            hud.turn.textContent = online && !room.isHost ? "Waiting" : "Ready";
            hud.note.textContent = online && !room.isHost ? "Waiting for host" : "Add one hit";
            syncPauseBtn();
            syncOverlays();
            return;
        }
        updateTurnUI();
        pickSideEffects();
        refresh();
        syncOverlays();
    }

    /* ---------------- preview playback (local, both clients) ---------------- */
    function playSeq(done) {
        const gap = cheats.slow ? 540 : 300;
        const seq = state.seq;
        seq.forEach((c, i) => later(() => { flashCell(c.r, c.s, "flash", 200); SOUNDS[c.r](); }, 120 + i * gap));
        later(done, 120 + seq.length * gap + 160);
    }

    function refresh() {
        if (!state) return;
        if (state.phase === "over") { clearTimers(); previewing = false; return; }
        if (state.previewToken !== lastToken) {
            lastToken = state.previewToken;
            clearTimers();
            if (state.phase === "replay" && state.seq.length) {
                previewing = true;
                updateTurnUI();
                playSeq(() => { previewing = false; afterPreview(); });
            } else {
                previewing = false;
                afterPreview();
            }
        } else if (!previewing) {
            afterPreview();
        }
    }

    function afterPreview() {
        updateTurnUI();
        if (!state || state.phase === "over" || previewing || timersFrozen) return;
        if (!online && state.turn === 1) {
            scheduleAuto(botStep, state.phase === "add" ? 650 : 400);
        } else if (state.turn === mySeat() && state.phase === "replay" && cheats.auto) {
            scheduleAuto(() => {
                const c = state.seq[state.progress];
                if (c) submitAction({ type: "pick", r: c.r, s: c.s });
            }, 240);
        }
    }

    /* ---------------- bot (AI mode only) ---------------- */
    function botPick() {
        if (state.phase === "replay") {
            const want = state.seq[state.progress];
            const p = clamp((0.05 + state.seq.length * 0.011) * (cheats.blunder ? 3 : 1), 0, 0.85);
            if (Math.random() >= p) return { r: want.r, s: want.s };
            let r = rnd(ROWS), s = rnd(STEPS);
            if (r === want.r && s === want.s) s = (s + 1) % STEPS;
            return { r, s };
        }
        const w = [22, 17, 11, 17, 7, 10, 8, 8];
        let t = rnd(100), r = 0;
        while (t >= w[r]) { t -= w[r]; r++; }
        const s = Math.random() < 0.55 ? rnd(4) * 4 + (Math.random() < 0.3 ? rnd(4) : 0) : rnd(STEPS);
        return { r, s };
    }
    function botStep() {
        if (!state || online || state.phase === "over" || state.turn !== 1 || previewing || timersFrozen) return;
        const p = botPick();
        applyAction({ type: "pick", r: p.r, s: p.s }, 1);
    }

    /* ---------------- state sync ---------------- */
    function publish() {
        render();
        // Only the host writes canonical state to Firebase.
        if (online && room.isHost) room.publishState(state).catch(console.warn);
    }

    function applyAction(action, actor) {
        if (!state || !action) return;
        if (action.type === "restart") {
            if (state.phase !== "over") return;
            state = initState(state);
            publish();
            return;
        }
        if (action.type === "life") { // local cheat, AI mode only
            if (online || actor !== 0) return;
            if (state.lives[0] < MAX_LIVES) { state.lives[0]++; publish(); }
            return;
        }
        if (action.type !== "pick") return;
        const r = action.r, s = action.s;
        if (state.phase === "over" || actor !== state.turn) return;
        if (!Number.isInteger(r) || !Number.isInteger(s) || r < 0 || r >= ROWS || s < 0 || s >= STEPS) return;
        const mark = (ok) => { state.pickN++; state.lastPick = { r, s, ok, n: state.pickN }; };

        if (state.phase === "replay") {
            const want = state.seq[state.progress];
            if (want && want.r === r && want.s === s) {
                mark(true);
                state.progress++;
                if (state.progress >= state.seq.length) { state.phase = "add"; state.progress = 0; }
            } else {
                mark(false);
                state.lives[actor]--;
                if (state.lives[actor] <= 0) {
                    state.lives[actor] = 0;
                    state.phase = "over";
                    state.winner = 1 - actor;
                } else {
                    state.progress = 0;
                    state.previewToken++;
                }
            }
        } else if (state.phase === "add") {
            mark(true);
            state.seq.push({ r, s });
            if (state.seq.length >= MAX_CHAIN) {
                state.phase = "over";
                const l0 = state.lives[0], l1 = state.lives[1];
                state.winner = l0 === l1 ? rnd(2) : l0 > l1 ? 0 : 1;
            } else {
                state.turn = 1 - state.turn;
                state.phase = "replay";
                state.progress = 0;
                state.previewToken++;
            }
        }
        publish();
    }

    function submitAction(action) {
        if (online && !room.isHost) {
            room.sendAction(action).catch(console.warn);
            return;
        }
        applyAction(action, mySeat());
    }

    /* ---------------- input: mouse / touch / keyboard ---------------- */
    function toggleHelp(on) {
        helpOpen = typeof on === "boolean" ? on : !helpOpen;
        if (helpOpen) cheatsOpen = false;
        render();
    }
    function togglePause(on) {
        paused = typeof on === "boolean" ? on : !paused;
        if (paused) cheatsOpen = false;
        render();
    }
    function restartGame() {
        paused = false;
        cheatsOpen = false;
        render();
        submitAction({ type: "restart" });
    }
    function tryPick(r, s) {
        if (!state || previewing || state.phase === "over" || state.turn !== mySeat()) return;
        if (paused || helpOpen || cheatsOpen || timersFrozen) return;
        submitAction({ type: "pick", r, s });
    }

    function listen() {
        if (!state || !state.seq.length || previewing || state.phase === "over") return;
        if (paused || helpOpen || cheatsOpen || timersFrozen) return;
        clearTimers();
        previewing = true;
        updateTurnUI();
        playSeq(() => { previewing = false; afterPreview(); });
    }

    function syncMuteBtn() {
        const label = muteBtn.querySelector(".bm-btn-label");
        if (label) label.textContent = muted ? "Unmute" : "Mute";
        muteBtn.setAttribute("aria-label", muted ? "Unmute" : "Mute");
        muteBtn.setAttribute("aria-pressed", String(muted));
        const icon = muteBtn.querySelector(".bm-btn-icon");
        if (icon) icon.innerHTML = iconSVG(muted ? "volumeX" : "volume1", { size: 14 });
    }

    function handleClick(event) {
        const t = event.target;
        if (!t || !t.closest) return;
        if (t.closest("[data-help]")) { toggleHelp(); return; }
        if (t.closest("[data-help-close]")) { toggleHelp(false); return; }
        if (t.closest("[data-exit]")) { onExit(); return; }
        if (t.closest("[data-cheats]")) { if (!helpOpen) { cheatsOpen = !cheatsOpen; render(); } return; }
        if (t.closest("[data-cheat-close]")) { cheatsOpen = false; render(); return; }
        if (t.closest("[data-pause]")) { togglePause(); return; }
        if (t.closest("[data-resume]")) { togglePause(false); return; }
        if (t.closest("[data-restart]")) { restartGame(); return; }
        if (t.closest("[data-listen]")) { listen(); return; }
        if (t.closest("[data-mute]")) { muted = !muted; syncMuteBtn(); return; }
        const sw = t.closest("[data-cheat]");
        if (sw) {
            const k = sw.dataset.cheat;
            cheats[k] = !cheats[k];
            render();
            return;
        }
        if (t.closest("[data-life]")) { submitAction({ type: "life" }); return; }
        if (helpOpen || cheatsOpen || paused || timersFrozen) return;
        actx();
        const cell = t.closest(".bm-cell");
        if (cell) {
            kbMode = false;
            tryPick(Number(cell.dataset.r), Number(cell.dataset.s));
        }
    }

    function handlePointer() {
        actx();
        if (kbMode) { kbMode = false; updateTurnUI(); }
    }

    function handleKey(e) {
        if (!root.isConnected) return;
        const tag = (e.target.tagName || "").toLowerCase();
        if (tag === "input" || tag === "textarea" || tag === "select") return;
        const ae = document.activeElement;
        if (ae && ae !== document.body && !root.contains(ae)) return;
        const code = e.code || "";
        /* priority: help -> cheats -> pause/escape -> restart -> game actions */
        if (code === "KeyH") { toggleHelp(); e.preventDefault(); return; }
        if (code === "KeyC") { if (!helpOpen) { cheatsOpen = !cheatsOpen; render(); } e.preventDefault(); return; }
        if (code === "KeyP" || e.key === "Escape") {
            if (helpOpen) toggleHelp(false);
            else if (cheatsOpen) { cheatsOpen = false; render(); }
            else togglePause();
            e.preventDefault(); return;
        }
        if (code === "KeyR") {
            if (helpOpen) toggleHelp(false);
            else if (cheatsOpen) { cheatsOpen = false; render(); }
            else restartGame();
            e.preventDefault(); return;
        }
        if (helpOpen || cheatsOpen || paused || timersFrozen) return;
        const k = e.key;
        if (k === "m" || k === "M") { muted = !muted; syncMuteBtn(); e.preventDefault(); return; }
        if (k === "l" || k === "L") { listen(); e.preventDefault(); return; }
        if (k >= "1" && k <= "8") {
            cursor.r = Number(k) - 1; kbMode = true; updateTurnUI(); e.preventDefault(); return;
        }
        const moves = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };
        if (moves[k]) {
            cursor.r = clamp(cursor.r + moves[k][0], 0, ROWS - 1);
            cursor.s = clamp(cursor.s + moves[k][1], 0, STEPS - 1);
            kbMode = true; updateTurnUI(); e.preventDefault(); return;
        }
        if (k === " " || k === "Enter") {
            if (ae && ae.tagName === "BUTTON") return; // let native button activation work
            kbMode = true;
            actx();
            tryPick(cursor.r, cursor.s);
            updateTurnUI();
            e.preventDefault();
        }
    }

    root.addEventListener("click", handleClick);
    root.addEventListener("pointerdown", handlePointer);
    document.addEventListener("keydown", handleKey);

    /* ---------------- room wiring / local init ---------------- */
    const unsubs = [];
    const sub = (ret) => { if (typeof ret === "function") unsubs.push(ret); };

    if (online) {
        sub(room.onRoom((nextRoom) => { roomData = nextRoom; render(); }));
        if (room.isHost) {
            state = initState();
            publish();
            // Guest connection maps to whichever seat the shuffle gave them.
            sub(room.onAction((action) => applyAction(action, 1 - state.hostSeat)));
        } else {
            sub(room.onState((nextState) => { state = nextState; render(); }));
        }
    } else {
        state = initState();
        render();
    }

    return {
        destroy() {
            clearTimers();
            root.removeEventListener("click", handleClick);
            root.removeEventListener("pointerdown", handlePointer);
            document.removeEventListener("keydown", handleKey);
            for (const u of unsubs) { try { u(); } catch (e) { } }
            try { if (AC) AC.close(); } catch (e) { }
            AC = null;
            root.innerHTML = "";
        },
    };
}
