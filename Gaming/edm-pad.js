/* ==== GAME: edm-pad.js ==== */
/* EDM Pad — minimalist synth pads, loop studio, VS Bot / online battle. */

import { iconSVG } from "../JS/icons.js";

export const META = {
    id: "edm-pad", // harus sama dengan nama file (tanpa .js)
    name: "EDM Pad",
    category: "music",
    catLabel: "Music",
    desc: "Jam on synth pads, record loops, and battle a bot or a friend by echoing beat patterns.",
    art: '<svg viewBox="0 0 48 48" width="54" height="54" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="6" width="17" height="16" rx="4"/><rect x="26" y="6" width="17" height="16" rx="4"/><rect x="5" y="26" width="17" height="16" rx="4"/><rect x="26" y="26" width="17" height="16" rx="4"/><circle cx="13.5" cy="14" r="2.6" fill="currentColor" stroke="none"/><circle cx="34.5" cy="34" r="2.6" fill="currentColor" stroke="none"/></svg>',
    bg: ["#fbcfe8", "#d946ef"],
    bestKey: "edmPadBest",
};

export function mount(root, context = {}) {
    const { mode = "ai", room = null, playerName = "Player", onExit = () => { } } = context;
    const online = mode === "room" && Boolean(room);
    const playerIndex = online && !room.isHost ? 1 : 0; // actor index: host=0, guest=1
    const isHost = !online || room.isHost;
    let roomData = room?.room || null;
    let destroyed = false;

    /* ---------------- constants & pure rules ---------------- */
    const PADS = 8, STEPS = 16, BASE_STEP = 150, LIVES = 3, TOL = 1;
    const CYCLES = { lead: 2, preview: 2, input: 2, bot: 1 };
    const PAD_DEFS = [
        { label: "Kick" }, { label: "Snare" }, { label: "Hat" }, { label: "Clap" },
        { label: "Bass C" }, { label: "Bass F" }, { label: "Stab" }, { label: "Lead" },
    ];
    const HUES = ["#f472b6", "#fb923c", "#facc15", "#4ade80", "#38bdf8", "#a78bfa", "#f87171", "#2dd4bf"];

    function circDiff(a, b) {
        const d = Math.abs(a - b) % STEPS;
        return Math.min(d, STEPS - d);
    }
    /* Solvable random patterns: circular spacing >= 2, drums only on early rounds, capped size. */
    function makeEvents(round) {
        const n = Math.min(2 + round, 8);
        const pool = round <= 2 ? [0, 1, 2, 3] : [0, 1, 2, 3, 4, 5, 6, 7];
        const steps = [];
        let guard = 0;
        while (steps.length < n && guard++ < 600) {
            const s = (Math.random() * STEPS) | 0;
            if (steps.every((x) => circDiff(x, s) >= 2)) steps.push(s);
        }
        for (let i = 0; steps.length < n; i++) {
            const s = (i * 2) % STEPS;
            if (steps.every((x) => circDiff(x, s) >= 2)) steps.push(s);
        }
        steps.sort((a, b) => a - b);
        return steps.map((s) => ({ step: s, pad: pool[(Math.random() * pool.length) | 0] }));
    }
    function matchEvents(player, target, tol) {
        const used = new Array(target.length).fill(false);
        let matched = 0;
        for (const ph of player) {
            for (let i = 0; i < target.length; i++) {
                if (used[i]) continue;
                if (target[i].pad === ph.pad && circDiff(target[i].step, ph.step) <= tol) {
                    used[i] = true; matched++; break;
                }
            }
        }
        return { matched, extras: player.length - matched, total: target.length };
    }
    /* Bot echo: imperfect on purpose so it can lose. */
    function genBotHits(evs, round) {
        const acc = Math.max(0.5, 0.92 - (round - 1) * 0.05);
        const hits = [];
        for (const ev of evs) {
            if (Math.random() < acc) {
                const j = Math.random() < 0.7 ? 0 : (Math.random() < 0.5 ? -1 : 1);
                hits.push({ step: (ev.step + j + STEPS) % STEPS, pad: ev.pad, cycle: 0 });
            }
        }
        if (Math.random() < 0.12) hits.push({ step: (Math.random() * STEPS) | 0, pad: (Math.random() * PADS) | 0, cycle: 0 });
        return hits;
    }

    /* ---------------- tiny synth ---------------- */
    let AC = null, muted = false, noiseBuf = null;
    function actx() {
        if (!AC) { try { AC = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { AC = null; } }
        if (AC && AC.state === "suspended") AC.resume();
        return AC;
    }
    function noise() {
        const c = actx(); if (!c) return null;
        if (!noiseBuf) {
            noiseBuf = c.createBuffer(1, c.sampleRate * 0.25, c.sampleRate);
            const d = noiseBuf.getChannelData(0);
            for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
        }
        const src = c.createBufferSource(); src.buffer = noiseBuf; return src;
    }
    function blip(freq, dur, type, vol, slideTo) {
        const c = actx(); if (!c || muted) return;
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
    function burst(dur, vol, delay) {
        const c = actx(); if (!c || muted) return;
        try {
            const t = c.currentTime + (delay || 0), src = noise(), g = c.createGain();
            g.gain.setValueAtTime(0.0001, t);
            g.gain.exponentialRampToValueAtTime(vol || 0.2, t + 0.006);
            g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
            src.connect(g); g.connect(c.destination);
            src.start(t); src.stop(t + dur + 0.02);
        } catch (e) { }
    }
    const SOUNDS = [
        () => blip(150, 0.16, "sine", 0.5, 45),
        () => { burst(0.14, 0.3); blip(190, 0.08, "triangle", 0.22); },
        () => burst(0.045, 0.18),
        () => { burst(0.05, 0.26); burst(0.05, 0.24, 0.03); burst(0.08, 0.22, 0.06); },
        () => blip(65.41, 0.3, "sawtooth", 0.24),
        () => blip(87.31, 0.3, "sawtooth", 0.24),
        () => { blip(262, 0.13, "square", 0.14); blip(330, 0.13, "square", 0.12); },
        () => blip(659.25, 0.2, "sine", 0.2),
    ];

    /* ---------------- local state ---------------- */
    let uiMode = online ? "battle" : "free"; // free | loop | battle
    const loop = { playing: false, pos: 0, last: 0, record: true, hits: [] };
    let saved = loadJSON("edmPadLoops", []);
    let best = loadJSON(META.bestKey, 0);
    const cheats = { reveal: false, auto: false }; // purely local assists
    let cheatsUsed = false;
    let helpOpen = false, cheatsOpen = false, loopsOpen = false, paused = false;
    let frozen = false, pauseStart = 0;
    let lastAbs = -1, lastLoopAbs = -1, prevT0 = 0, prevHitsLen = 0;
    const isFrozen = () => paused || helpOpen || cheatsOpen || loopsOpen;

    function loadJSON(k, fb) { try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? fb : v; } catch (e) { return fb; } }
    function saveJSON(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { } }

    /* ---------------- battle state (serializable, host-authoritative) ---------------- */
    function freshState() {
        return {
            phase: "lobby", round: 1, leader: 0, hostSeat: 0,
            lives: [LIVES, LIVES], scores: [0, 0],
            events: [], hits: [], botHits: [], result: null, winner: null,
            t0: 0, until: 0, stepMs: BASE_STEP,
            shields: [false, false], tols: [TOL, TOL],
            names: ["Player 1", "Player 2"],
        };
    }
    let state = freshState();

    const seatOfActor = (actor) => (actor === 0 ? state.hostSeat : 1 - state.hostSeat);
    const mySeat = () => (online ? seatOfActor(playerIndex) : 0);
    const isBot = (seat) => !online && seat === 1;
    const follower = () => 1 - state.leader;
    const seatLabel = (seat) => (seat === mySeat() ? "You" : state.names[seat] || "P" + (seat + 1));
    const anyCheatActive = () =>
        cheats.reveal || cheats.auto || state.shields.some(Boolean) ||
        state.tols.some((t) => t > TOL) || state.stepMs !== BASE_STEP;

    function battleClock() {
        if (!state.t0) return { abs: 0, s: 0, cycle: 0 };
        const abs = Math.floor((Date.now() - state.t0) / state.stepMs);
        return { abs, s: abs % STEPS, cycle: Math.floor(abs / STEPS) };
    }
    const phaseDur = (p) => (CYCLES[p] || 0) * STEPS * state.stepMs;

    /* ---------------- DOM ---------------- */
    let seenHelp = true;
    try { seenHelp = localStorage.getItem("edmPadHelpSeen") === "1"; } catch (e) { seenHelp = true; }
    if (!seenHelp) {
        helpOpen = true;
        try { localStorage.setItem("edmPadHelpSeen", "1"); } catch (e) { /* storage blocked */ }
    }

    root.innerHTML = `
<style>
.ep-app{color:#e7ecf3;font-size:14px;line-height:1.5}
.ep-app [hidden]{display:none!important}
.ep-app .ep-hud{display:flex;align-items:center;gap:8px;flex-wrap:wrap;font:600 11px/1.2 ui-monospace,SFMono-Regular,Menlo,monospace}
.ep-app .ep-hud-info{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.ep-app .ep-chip{display:inline-flex;align-items:center;gap:6px;padding:6px 10px;border:1px solid #ffffff14;border-radius:999px;background:#141821;color:#a5b1c2;white-space:nowrap}
.ep-app .ep-chip b{color:#e7ecf3;font-variant-numeric:tabular-nums}
.ep-app .ep-lives{display:inline-flex;gap:4px;vertical-align:middle}
.ep-app .ep-life{width:8px;height:8px;border-radius:50%;background:#f87171}
.ep-app .ep-life.off{background:#ffffff1c}
.ep-app .ep-status .ep-status-dot{width:6px;height:6px;border-radius:50%;background:#a5b1c2}
.ep-app .ep-status.good{color:#6ee7b7;border-color:#6ee7b755}
.ep-app .ep-status.good .ep-status-dot{background:#6ee7b7}
.ep-app .ep-status.bad{color:#fca5a5;border-color:#fca5a555}
.ep-app .ep-status.bad .ep-status-dot{background:#fca5a5}
.ep-app .ep-spacer{flex:1 1 auto}
.ep-app .ep-btn{background:#141821;border:1px solid #ffffff14;color:#dbe3ee;border-radius:9px;padding:0 14px;min-height:44px;font:700 11px/1 ui-monospace,SFMono-Regular,Menlo,monospace;cursor:pointer;touch-action:manipulation;transition:border-color .15s,background .15s}
.ep-app .ep-btn:hover{border-color:#ffffff33}
.ep-app .ep-btn.on{border-color:#a78bfa;color:#c4b5fd;background:#a78bfa1c}
.ep-app .ep-btn.primary{background:#a78bfa;border-color:transparent;color:#10131a}
.ep-app .ep-btn:disabled{opacity:.4;cursor:default}
.ep-app .ep-icon-btn{display:inline-flex;align-items:center;gap:6px}
.ep-app .ep-icon-btn svg{flex:none;display:block}
.ep-app .ep-tabs{display:inline-flex;gap:4px;padding:4px;border:1px solid #ffffff14;border-radius:10px;background:#141821}
.ep-app .ep-tabs .ep-btn{min-height:32px;padding:0 10px;border:0;background:transparent;border-radius:7px}
.ep-app .ep-tabs .ep-btn.on{background:#a78bfa2b;color:#c4b5fd}
.ep-app .ep-board{position:relative;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;width:100%;min-height:0;padding:14px;border:1px solid #ffffff12;border-radius:12px;background:#0b0e13;overflow:hidden}
.ep-app .ep-pads{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;width:100%;max-width:640px}
.ep-app .ep-pad{position:relative;min-height:76px;height:clamp(72px,16vw,96px);border:1px solid #ffffff12;border-radius:10px;background:#161a21;color:#dbe3ee;cursor:pointer;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;font-size:12px;font-weight:700;letter-spacing:.8px;text-transform:uppercase;touch-action:manipulation;user-select:none;-webkit-user-select:none;transition:transform .15s,background .15s,border-color .15s}
.ep-app .ep-pad i{width:8px;height:8px;border-radius:50%;background:var(--h)}
.ep-app .ep-pad small{position:absolute;top:8px;right:8px;font-size:10px;font-weight:600;opacity:.5}
.ep-app .ep-pad:active,.ep-app .ep-pad.lit{transform:scale(.97);background:var(--hs);border-color:var(--h)}
.ep-app .ep-steps{display:grid;grid-template-columns:repeat(16,1fr);gap:4px;width:100%;max-width:640px}
.ep-app .ep-bar{height:8px;border-radius:4px;background:#ffffff10}
.ep-app .ep-bar.rec{background:#a78bfa}
.ep-app .ep-bar.hint{box-shadow:inset 0 0 0 1px #facc15aa}
.ep-app .ep-bar.cur{background:#e2e8f0}
.ep-app .ep-transport{display:flex;flex-wrap:wrap;gap:8px;align-items:center;justify-content:center}
.ep-app .ep-transport .ep-btn{min-height:40px;padding:0 12px}
.ep-app .ep-ov{position:absolute;inset:0;z-index:5;display:flex;align-items:center;justify-content:center;padding:14px;background:#0b0e13d9;backdrop-filter:blur(4px)}
.ep-app .ep-card{width:min(420px,100%);max-height:100%;display:flex;flex-direction:column;gap:12px;padding:18px;border:1px solid #ffffff14;border-radius:14px;background:#141821;box-shadow:0 16px 40px #0008;text-align:center}
.ep-app .ep-card.wide{width:min(600px,100%);text-align:left}
.ep-app .ep-head{display:flex;align-items:center;justify-content:space-between;gap:10px;flex:none}
.ep-app .ep-head h3{margin:0;font-size:13px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#a5b1c2}
.ep-app .ep-body{flex:1 1 auto;min-height:0;overflow:auto;text-align:left;font-size:13px;line-height:1.6;color:#c3cde2}
.ep-app .ep-body b{color:#e7ecf3}
.ep-app .ep-help{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:14px;flex:1 1 auto;min-height:0;overflow:auto;text-align:left;font-size:12px;line-height:1.6;color:#c3cde2}
.ep-app .ep-help b{display:block;margin-bottom:6px;font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:#a5b1c2}
.ep-app .ep-help ul{margin:0 0 12px;padding-left:18px}
.ep-app .ep-cheats,.ep-app .ep-loops{flex:1 1 auto;min-height:0;overflow:auto;font-size:13px;line-height:1.6;color:#c3cde2}
.ep-app .ep-cheat-row{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:8px 0;min-height:44px;border-bottom:1px solid #ffffff0a}
.ep-app .ep-cheat-row:last-child{border-bottom:0}
.ep-app .ep-cheat-row span{font-size:13px}
.ep-app .ep-loop-item{display:flex;align-items:center;gap:8px;padding:8px 0;min-height:44px;border-bottom:1px solid #ffffff0a}
.ep-app .ep-loop-item:last-child{border-bottom:0}
.ep-app .ep-loop-item .name{flex:1;font-weight:600;font-size:13px}
.ep-app .ep-loop-item .meta{font-size:11px;color:#a5b1c2}
.ep-app .ep-empty{font-size:12px;color:#a5b1c2;text-align:center;padding:8px}
.ep-app .ep-foot{display:flex;align-items:center;justify-content:space-between;gap:10px;flex:none;padding-top:10px;border-top:1px solid #ffffff14}
.ep-app .ep-note{font-size:11px;color:#a5b1c2;text-align:left}
.ep-app .ep-kbd{display:inline-block;padding:1px 5px;border:1px solid #ffffff24;border-bottom-width:2px;border-radius:5px;background:#0b0e13;color:#e7ecf3;font:inherit}
.ep-app .ep-title{font-size:22px;font-weight:800;margin:0}
.ep-app .ep-sub{margin:0;font-size:13px;color:#a5b1c2;line-height:1.6}
.ep-app .ep-center{display:flex;flex-direction:column;align-items:center;gap:12px}
@media (hover:none){.ep-app .ep-keys{display:none}}
@media (prefers-reduced-motion:reduce){.ep-app .ep-btn,.ep-app .ep-pad{transition:none}}

/* --- fill height + mobile refinements (LAST: beat pointer:coarse 44px) --- */
.ep-app.game-fill > .ep-board{flex:1 1 auto;min-height:0;aspect-ratio:auto}
@media (pointer:coarse){.ep-app button:not(:disabled){min-height:44px}}
@media (max-width:640px){
.ep-app.game-fill > .ep-board:not(:has(.ep-ov:not([hidden]))){aspect-ratio:auto;flex:1 1 auto;min-height:min(52dvh,520px)}
.ep-app.game-fill > .ep-board:has(.ep-ov:not([hidden])){aspect-ratio:auto;flex:0 0 auto;min-height:min(70dvh,620px)}
.ep-app .ep-hud{gap:4px;margin-bottom:0}
.ep-app .ep-hud .ep-hud-info{flex:1 1 100%;gap:4px}
.ep-app .ep-hud .ep-chip{padding:4px 6px;font-size:9px;gap:4px}
.ep-app .ep-hud .ep-chip[data-el="status"],
.ep-app .ep-hud .ep-chip:has([data-el="best"]),
.ep-app .ep-hud .ep-chip[data-el="battleInfo"] .ep-lives{display:none}
.ep-app .ep-hud .ep-btn{min-height:32px;padding:5px 6px;font-size:9px;gap:4px}
.ep-app .ep-hud .ep-btn-label,.ep-app .ep-hud .ep-spacer{display:none}
.ep-app .ep-hud .ep-tabs{padding:3px;gap:3px}
.ep-app .ep-hud .ep-tabs .ep-btn{min-height:32px;padding:5px 6px}
.ep-app .ep-board{gap:8px;padding:8px}
.ep-app .ep-pads,.ep-app .ep-steps{gap:6px}
.ep-app .ep-pad{min-height:60px;height:clamp(58px,14vw,76px);font-size:10px}
.ep-app .ep-transport .ep-btn{min-height:32px;padding:5px 8px;font-size:9px}
.ep-app .ep-ov{padding:8px}
.ep-app .ep-card{width:100%;height:100%;max-height:100%;padding:12px;border-radius:12px}
.ep-app .ep-body,.ep-app .ep-cheats,.ep-app .ep-loops,.ep-app .ep-help{scrollbar-width:none}
.ep-app .ep-body::-webkit-scrollbar,.ep-app .ep-cheats::-webkit-scrollbar,.ep-app .ep-loops::-webkit-scrollbar,.ep-app .ep-help::-webkit-scrollbar{display:none}
.ep-app .ep-foot{position:static;margin:0;padding:10px 0 0;border-top:1px solid #ffffff14}
.ep-app .ep-note{display:none}
}
@media (pointer:coarse) and (max-width:640px){.ep-app .ep-hud .ep-btn{min-height:32px}}
</style>
<div class="game-app ep-app game-fill" data-ep>
  <div class="ep-hud">
    <div class="ep-hud-info">
      <span class="ep-chip">MODE <b data-el="mode">Free jam</b></span>
      <span class="ep-chip ep-status" data-el="status"><i class="ep-status-dot"></i><span data-status>Ready</span></span>
      <span class="ep-chip">BEST <b data-el="best">—</b></span>
      <span class="ep-chip" data-el="battleInfo" hidden>R <b data-el="round">1</b> · LEAD <b data-el="lead">—</b> · SCORE <b data-el="me-score">0</b>–<b data-el="op-score">0</b> · <span class="ep-lives" data-el="me-lives"></span>/<span class="ep-lives" data-el="op-lives"></span></span>
    </div>
    <span class="ep-spacer"></span>
    <div class="ep-tabs" data-el="tabs">
      <button class="ep-btn ep-icon-btn" type="button" data-act="tab-free" aria-label="Free jam" title="Free jam">${iconSVG("music", { size: 14 })}<span class="ep-btn-label">Free</span></button>
      <button class="ep-btn ep-icon-btn" type="button" data-act="tab-loop" aria-label="Loop studio" title="Loop studio">${iconSVG("repeat", { size: 14 })}<span class="ep-btn-label">Loop</span></button>
      <button class="ep-btn ep-icon-btn" type="button" data-act="tab-battle" aria-label="Pattern battle" title="Pattern battle">${iconSVG("swords", { size: 14 })}<span class="ep-btn-label">Battle</span></button>
    </div>
    <button class="ep-btn ep-icon-btn" type="button" data-act="loops" data-el="loopsbtn" aria-label="Recordings" title="Recordings" hidden>${iconSVG("library", { size: 14 })}<span class="ep-btn-label">Loops</span></button>
    <button class="ep-btn ep-icon-btn" type="button" data-act="mute" data-el="mute" aria-label="Mute sound" title="Mute sound">${iconSVG("volume", { size: 14 })}<span class="ep-btn-label" data-el="muteLabel">Mute</span></button>
    <button class="ep-btn ep-icon-btn" type="button" data-help aria-label="How to play" title="How to play (H)">${iconSVG("helpCircle", { size: 14 })}<span class="ep-btn-label">Help</span></button>
    <button class="ep-btn ep-icon-btn" type="button" data-cheats aria-label="Cheats" title="Cheats (C)">${iconSVG("wrench", { size: 14 })}<span class="ep-btn-label">Cheats</span></button>
    <button class="ep-btn ep-icon-btn" type="button" data-pause aria-label="Pause" title="Pause (P)"><span data-icon-pause>${iconSVG("pause", { size: 14 })}</span><span data-icon-play hidden>${iconSVG("play", { size: 14 })}</span><span class="ep-btn-label" data-el="pauseLabel">Pause</span></button>
    <button class="ep-btn ep-icon-btn" type="button" data-restart aria-label="Restart" title="Restart (R)">${iconSVG("refresh", { size: 14 })}<span class="ep-btn-label">Restart</span></button>
    <button class="ep-btn ep-icon-btn" type="button" data-exit aria-label="Exit game" title="Exit game">${iconSVG("logOut", { size: 14 })}<span class="ep-btn-label">Exit game</span></button>
  </div>
  <section class="game-panel ep-board" data-board>
    <div class="ep-pads" data-el="pads"></div>
    <div class="ep-steps" data-el="steps"></div>
    <div class="ep-transport" data-el="transport" hidden>
      <button class="ep-btn primary" type="button" data-act="play" data-el="play">Play</button>
      <button class="ep-btn" type="button" data-act="stop">Stop</button>
      <button class="ep-btn" type="button" data-act="restart-loop">Restart</button>
      <button class="ep-btn" type="button" data-act="rec" data-el="rec">Rec</button>
      <button class="ep-btn" type="button" data-act="clear">Clear</button>
      <button class="ep-btn" type="button" data-act="save" data-el="save">Save</button>
    </div>
    <div class="ep-ov" data-ov="lobby" hidden>
      <div class="ep-card ep-center">
        <h2 class="ep-title">Pattern battle</h2>
        <p class="ep-sub">Coin flip decides who leads each round. Lead: play a pattern. Follow: echo it. 3 lives each.</p>
        <button class="ep-btn primary" type="button" data-act="start">Start</button>
      </div>
    </div>
    <div class="ep-ov" data-ov="over" hidden>
      <div class="ep-card ep-center">
        <h2 class="ep-title" data-el="over-title">Game over</h2>
        <p class="ep-sub" data-el="over-sub"></p>
        <button class="ep-btn primary" type="button" data-act="start">Play again</button>
      </div>
    </div>
    <div class="ep-ov" data-ov="pause" hidden>
      <div class="ep-card ep-center">
        <h2 class="ep-title">Paused</h2>
        <p class="ep-sub">Timers and playback are on hold.</p>
        <button class="ep-btn primary" type="button" data-resume>Resume</button>
      </div>
    </div>
    <div class="ep-ov" data-ov="cheat" hidden>
      <div class="ep-card wide">
        <div class="ep-head"><h3>Cheats</h3><button class="ep-btn" type="button" data-close-cheats aria-label="Close cheats" title="Close cheats">${iconSVG("x", { size: 14 })}</button></div>
        <div class="ep-cheats">
          <div class="ep-cheat-row"><span>Infinite lives (you)</span><button class="ep-btn" type="button" data-cheat="lives">Off</button></div>
          <div class="ep-cheat-row"><span>Slow tempo</span><button class="ep-btn" type="button" data-cheat="slow">Off</button></div>
          <div class="ep-cheat-row"><span>Lenient timing (±3 steps)</span><button class="ep-btn" type="button" data-cheat="lenient">Off</button></div>
          <div class="ep-cheat-row"><span>Reveal pattern on grid</span><button class="ep-btn" type="button" data-cheat="reveal">Off</button></div>
          <div class="ep-cheat-row"><span>Auto-echo (plays for you)</span><button class="ep-btn" type="button" data-cheat="auto">Off</button></div>
        </div>
        <div class="ep-foot"><span class="ep-note">Cheats work locally in VS Bot mode.</span><button class="ep-btn primary" type="button" data-close-cheats>Done</button></div>
      </div>
    </div>
    <div class="ep-ov" data-ov="loops" hidden>
      <div class="ep-card wide">
        <div class="ep-head"><h3>Recordings</h3><button class="ep-btn" type="button" data-close-loops aria-label="Close recordings" title="Close recordings">${iconSVG("x", { size: 14 })}</button></div>
        <div class="ep-loops" data-el="looplist"></div>
        <div class="ep-foot"><span class="ep-note">Save a loop from the transport bar.</span><button class="ep-btn primary" type="button" data-close-loops>Close</button></div>
      </div>
    </div>
    <div class="ep-ov" data-ov="help" hidden>
      <div class="ep-card wide">
        <div class="ep-head"><h3>How to play</h3><button class="ep-btn" type="button" data-help-close aria-label="Close help" title="Close help">${iconSVG("x", { size: 14 })}</button></div>
        <div class="ep-help">
          <div>
            <b>Controls</b>
            <ul>
              <li><span class="ep-kbd">1–8</span> / tap pads — play a sound (records a hit in Loop / Battle).</li>
              <li><span class="ep-kbd">Space</span> — play/pause loop or start battle.</li>
              <li><span class="ep-kbd">S</span> — stop loop · <span class="ep-kbd">R</span> — restart.</li>
              <li><span class="ep-kbd">H</span> help · <span class="ep-kbd">C</span> cheats · <span class="ep-kbd">P</span>/<span class="ep-kbd">Esc</span> pause.</li>
              <li class="ep-keys">Use the HUD to switch Free / Loop / Battle and mute audio.</li>
            </ul>
          </div>
          <div>
            <b>Rules</b>
            <ul>
              <li><b>Free</b> — tap pads to jam.</li>
              <li><b>Loop</b> — keep Rec on and tap pads: hits snap to the 16-step grid and replay. Save stores the loop.</li>
              <li><b>Battle</b> — a coin flip picks the leader. The leader plays a pattern (min 2 hits), the follower echoes it. Miss = lose a life. 3 lives each.</li>
            </ul>
            <div class="ep-foot"><span class="ep-note">Press H to reopen this guide</span><button class="ep-btn primary" type="button" data-help-close>Got it</button></div>
          </div>
        </div>
      </div>
    </div>
  </section>
</div>`;

    const $ = (s) => root.querySelector(s);
    const padsEl = $('[data-el="pads"]'), stepsEl = $('[data-el="steps"]');
    const statusEl = $('[data-status]'), statusChip = $('[data-el="status"]');
    const pauseBtn = $('[data-pause]');
    const ov = {
        lobby: $('[data-ov="lobby"]'), over: $('[data-ov="over"]'), pause: $('[data-ov="pause"]'),
        cheat: $('[data-ov="cheat"]'), loops: $('[data-ov="loops"]'), help: $('[data-ov="help"]'),
    };

    padsEl.innerHTML = PAD_DEFS.map((p, i) =>
        `<button class="ep-pad" type="button" data-pad="${i}" style="--h:${HUES[i]};--hs:${HUES[i]}33"><i></i>${p.label}<small class="ep-keys">${i + 1}</small></button>`
    ).join("");
    stepsEl.innerHTML = Array.from({ length: STEPS }, (_, i) => `<span class="ep-bar" data-step="${i}"></span>`).join("");

    function flashPad(i) {
        const el = padsEl.children[i];
        if (!el) return;
        el.classList.add("lit");
        setTimeout(() => { if (!destroyed) el.classList.remove("lit"); }, 130);
    }

    /* ---------------- render ---------------- */
    function livesHTML(n) {
        let h = "";
        for (let i = 0; i < LIVES; i++) h += `<span class="ep-life${i < n ? "" : " off"}"></span>`;
        return h;
    }
    function statusText() {
        if (uiMode === "free") return ["Tap pads to jam.", ""];
        if (uiMode === "loop")
            return [`Loop · ${loop.playing ? "Playing" : "Paused"} · ${loop.hits.length} hits · Rec ${loop.record ? "on" : "off"}`, ""];
        const lead = seatLabel(state.leader), fol = seatLabel(follower());
        switch (state.phase) {
            case "lobby": return ["Press Start.", ""];
            case "lead": return [state.leader === mySeat() ? `You lead — play a pattern (${CYCLES.lead} loops).` : `${lead} is composing…`, ""];
            case "preview": return [`Listen — ${lead}'s pattern.`, ""];
            case "input": return [follower() === mySeat() ? `Your turn — echo it (${CYCLES.input} loops).` : `${fol} echoes…`, ""];
            case "bot": return ["Bot echoes…", ""];
            case "end": {
                const r = state.result; if (!r) return ["", ""];
                if (r.ok) return [`Clean echo! ${seatLabel(r.seat)} +1.`, "good"];
                const shielded = state.shields[r.seat];
                return [`Missed ${r.matched}/${r.total} — ${seatLabel(r.seat)} ${shielded ? "shielded (cheat)" : "-1 life"}.`, "bad"];
            }
            case "over": return [state.winner === mySeat() ? "You win!" : `${seatLabel(state.winner)} wins.`, state.winner === mySeat() ? "good" : "bad"];
        }
        return ["", ""];
    }
    function paintSteps(cur) {
        const marks = uiMode === "loop" ? loop.hits
            : (uiMode === "battle" && (state.phase === "lead" || state.phase === "input")) ? state.hits : [];
        const hints = uiMode === "battle" && cheats.reveal && (state.phase === "preview" || state.phase === "input") ? state.events : [];
        for (let i = 0; i < STEPS; i++) {
            stepsEl.children[i].className = "ep-bar"
                + (marks.some((h) => h.step === i) ? " rec" : "")
                + (hints.some((h) => h.step === i) ? " hint" : "")
                + (i === cur ? " cur" : "");
        }
    }
    function renderLoopList() {
        const el = $('[data-el="looplist"]');
        if (!saved.length) { el.innerHTML = `<div class="ep-empty">No recordings yet — make a loop and press Save.</div>`; return; }
        el.innerHTML = saved.map((l) =>
            `<div class="ep-loop-item"><span class="name">${l.name}</span><span class="meta">${l.hits.length} hits</span>` +
            `<button class="ep-btn" type="button" data-loop="play" data-id="${l.id}">Play</button>` +
            `<button class="ep-btn" type="button" data-loop="load" data-id="${l.id}">Load</button>` +
            `<button class="ep-btn" type="button" data-loop="del" data-id="${l.id}">✕</button></div>`
        ).join("");
    }
    function render() {
        if (destroyed) return;
        if (state.t0 !== prevT0) { prevT0 = state.t0; lastAbs = -1; prevHitsLen = 0; }
        const battle = uiMode === "battle";
        $('[data-el="mode"]').textContent = online ? `Online · P${mySeat() + 1}` : ({ free: "Free jam", loop: "Loop studio", battle: "VS Bot" })[uiMode];
        $('[data-el="best"]').textContent = best > 0 ? `R${best}` : "—";
        $('[data-el="tabs"]').hidden = online;
        for (const m of ["free", "loop", "battle"]) $(`[data-act="tab-${m}"]`).classList.toggle("on", uiMode === m);
        $('[data-el="loopsbtn"]').hidden = uiMode !== "loop";
        $('[data-el="muteLabel"]').textContent = muted ? "Unmute" : "Mute";
        $('[data-el="mute"]').classList.toggle("on", muted);
        $('[data-el="mute"]').setAttribute("aria-label", muted ? "Unmute sound" : "Mute sound");

        const [txt, cls] = statusText();
        statusEl.textContent = txt;
        statusChip.className = "ep-chip ep-status" + (cls ? " " + cls : "");

        $('[data-el="battleInfo"]').hidden = !battle;
        $('[data-el="transport"]').hidden = uiMode !== "loop";
        if (battle) {
            const me = mySeat(), op = 1 - me;
            $('[data-el="me-lives"]').innerHTML = livesHTML(state.lives[me]);
            $('[data-el="op-lives"]').innerHTML = livesHTML(state.lives[op]);
            $('[data-el="me-score"]').textContent = state.scores[me];
            $('[data-el="op-score"]').textContent = state.scores[op];
            $('[data-el="round"]').textContent = state.round;
            $('[data-el="lead"]').textContent = state.phase === "lobby" ? "—" : seatLabel(state.leader);
        }
        if (uiMode === "loop") {
            $('[data-el="play"]').textContent = loop.playing ? "Pause" : "Play";
            $('[data-el="rec"]').classList.toggle("on", loop.record);
            $('[data-el="save"]').disabled = loop.hits.length === 0;
            renderLoopList();
        }
        const cheatState = {
            lives: state.shields[mySeat()], slow: state.stepMs !== BASE_STEP,
            lenient: state.tols[mySeat()] > TOL, reveal: cheats.reveal, auto: cheats.auto,
        };
        root.querySelectorAll("[data-cheat]").forEach((b) => {
            const on = cheatState[b.dataset.cheat];
            b.textContent = on ? "On" : "Off";
            b.classList.toggle("on", on);
        });

        ov.lobby.hidden = !(battle && state.phase === "lobby") || cheatsOpen || helpOpen || loopsOpen || paused;
        ov.over.hidden = !(battle && state.phase === "over") || cheatsOpen || helpOpen || loopsOpen || paused;
        ov.pause.hidden = !paused || cheatsOpen || helpOpen || loopsOpen;
        ov.cheat.hidden = !cheatsOpen || helpOpen;
        ov.loops.hidden = !loopsOpen || helpOpen;
        ov.help.hidden = !helpOpen;
        if (battle && state.phase === "over" && !helpOpen && !cheatsOpen && !loopsOpen && !paused) {
            const win = state.winner === mySeat();
            $('[data-el="over-title"]').textContent = win ? "You win!" : `${seatLabel(state.winner)} wins`;
            $('[data-el="over-sub"]').textContent = `Rounds: ${state.round} · Score ${state.scores[mySeat()]} – ${state.scores[1 - mySeat()]}`;
        }

        $('[data-help]').classList.toggle("on", helpOpen);
        $('[data-cheats]').classList.toggle("on", cheatsOpen || anyCheatActive());
        $('[data-el="loopsbtn"]').classList.toggle("on", loopsOpen);
        if (pauseBtn) {
            const label = pauseBtn.querySelector(".ep-btn-label");
            if (label) label.textContent = paused ? "Resume" : "Pause";
            pauseBtn.setAttribute("aria-label", paused ? "Resume" : "Pause");
            const iconPause = pauseBtn.querySelector("[data-icon-pause]"), iconPlay = pauseBtn.querySelector("[data-icon-play]");
            if (iconPause) iconPause.hidden = paused;
            if (iconPlay) iconPlay.hidden = !paused;
        }
        paintSteps(uiMode === "loop" ? Math.floor(loop.pos / BASE_STEP) % STEPS : (battle && state.t0 ? battleClock().s : -1));
    }

    /* ---------------- network plumbing (template pattern) ---------------- */
    function publish() {
        render();
        if (online && room.isHost) room.publishState(state).catch(console.warn);
    }
    function submitAction(action) {
        if (online && !room.isHost) { room.sendAction(action).catch(console.warn); return; }
        applyAction(action, playerIndex);
    }
    function applyAction(action, actor) {
        if (!action || typeof action !== "object") return;
        const seat = seatOfActor(actor);
        if (action.type === "start") {
            if (state.phase === "lobby" || state.phase === "over") startBattle();
        } else if (action.type === "restart") {
            startBattle();
        } else if (action.type === "hit") {
            const pad = action.pad | 0, step = action.step | 0, cycle = action.cycle | 0;
            if (pad < 0 || pad >= PADS || step < 0 || step >= STEPS || cycle < 0) return;
            let ok = false;
            if (state.phase === "lead" && seat === state.leader && cycle < CYCLES.lead) {
                if (!state.hits.some((h) => h.step === step && h.pad === pad)) { state.hits.push({ step, pad, cycle }); ok = true; }
            } else if (state.phase === "input" && seat === follower() && cycle < CYCLES.input) {
                if (state.hits.length < 64) { state.hits.push({ step, pad, cycle }); ok = true; }
            }
            if (!ok) return;
            if (actor !== playerIndex) SOUNDS[pad]();
            flashPad(pad);
            publish();
        } else if (action.type === "cheat") {
            if (action.key === "lives") state.shields[seat] = !!action.on;
            else if (action.key === "lenient") state.tols[seat] = action.on ? 3 : TOL;
            else if (action.key === "slow") state.stepMs = action.on ? 240 : BASE_STEP;
            else return;
            publish();
        }
    }

    /* ---------------- battle flow (host only) ---------------- */
    function setPhase(p) {
        state.phase = p;
        state.t0 = Date.now();
        state.hits = [];
        state.botHits = p === "bot" ? genBotHits(state.events, state.round) : [];
        lastAbs = -1;
        publish();
    }
    function startBattle() {
        state.hostSeat = Math.random() < 0.5 ? 0 : 1;   // random player position (multiplayer)
        state.leader = Math.random() < 0.5 ? 0 : 1;     // random first mover
        state.round = 1;
        state.lives = [LIVES, LIVES];
        state.scores = [0, 0];
        state.result = null; state.winner = null; state.events = [];
        const hostName = (roomData?.players?.[0]?.name) || (isHost ? playerName : "Player 1");
        const guestName = (roomData?.players?.[1]?.name) || "Player 2";
        state.names = ["", ""];
        state.names[state.hostSeat] = online ? hostName : playerName;
        state.names[1 - state.hostSeat] = online ? guestName : "Bot";
        if (isBot(state.leader)) { state.events = makeEvents(1); setPhase("preview"); }
        else setPhase("lead");
    }
    function judge() {
        const fol = follower(), tol = state.tols[fol];
        const botEcho = state.phase === "bot";
        const pool = botEcho ? state.botHits : state.hits;
        const cycles = botEcho ? 1 : CYCLES.input;
        let bestRes = { matched: -1, extras: 0, total: state.events.length };
        for (let cy = 0; cy < cycles; cy++) {
            const r = matchEvents(pool.filter((h) => h.cycle === cy), state.events, tol);
            if (r.matched > bestRes.matched || (r.matched === bestRes.matched && r.extras < bestRes.extras)) bestRes = r;
        }
        const ok = bestRes.matched === bestRes.total && bestRes.extras === 0;
        if (ok) state.scores[fol]++;
        else if (!state.shields[fol]) state.lives[fol]--;
        state.result = { seat: fol, ok, ...bestRes };
        state.phase = "end";
        state.until = Date.now() + 1500;
        publish();
    }
    function afterEnd() {
        const dead = state.lives.findIndex((l) => l <= 0);
        if (dead >= 0) {
            state.winner = 1 - dead;
            state.phase = "over";
            if (!cheatsUsed && !anyCheatActive() && state.round > best) { best = state.round; saveJSON(META.bestKey, best); }
            publish();
            return;
        }
        state.round++;
        state.leader = Math.random() < 0.5 ? 0 : 1; // random leader every round
        if (isBot(state.leader)) { state.events = makeEvents(state.round); setPhase("preview"); }
        else setPhase("lead");
    }
    function hostAdvance(now) {
        const p = state.phase;
        if (p === "end") { if (now >= state.until) afterEnd(); return; }
        if (!CYCLES[p] || now < state.t0 + phaseDur(p)) return;
        if (p === "lead") {
            const evs = state.hits.map(({ step, pad }) => ({ step, pad }));
            state.events = evs.length >= 2 ? evs : makeEvents(state.round); // auto pattern keeps round solvable
            setPhase("preview");
        } else if (p === "preview") {
            setPhase(isBot(follower()) ? "bot" : "input");
        } else if (p === "input" || p === "bot") {
            judge();
        }
    }

    /* ---------------- clock / ticker ---------------- */
    function onBattleStep(s, cycle) {
        if (state.phase === "preview") {
            for (const ev of state.events) if (ev.step === s) { SOUNDS[ev.pad](); flashPad(ev.pad); }
        } else if (state.phase === "bot" && cycle === 0) {
            for (const h of state.botHits) if (h.step === s) { SOUNDS[h.pad](); flashPad(h.pad); }
        } else if (state.phase === "input" && cycle === 0 && cheats.auto && mySeat() === follower()) {
            for (const ev of state.events) if (ev.step === s) doHit(ev.pad);
        }
    }
    const ticker = setInterval(() => {
        if (destroyed || isFrozen()) return;
        const now = Date.now();
        if (uiMode === "loop") {
            if (loop.playing) {
                loop.pos += now - loop.last;
                const abs = Math.floor(loop.pos / BASE_STEP);
                if (abs !== lastLoopAbs) {
                    lastLoopAbs = abs;
                    const s = abs % STEPS;
                    for (const h of loop.hits) if (h.step === s) { SOUNDS[h.pad](); flashPad(h.pad); }
                }
            }
            loop.last = now;
            paintSteps(Math.floor(loop.pos / BASE_STEP) % STEPS);
        } else if (uiMode === "battle") {
            if (state.t0 && CYCLES[state.phase]) {
                const c = battleClock();
                if (c.abs !== lastAbs) { lastAbs = c.abs; onBattleStep(c.s, c.cycle); }
                paintSteps(c.s);
            }
            if (isHost) hostAdvance(now);
        }
    }, 25);

    /* ---------------- pad input ---------------- */
    function doHit(pad) {
        if (destroyed || isFrozen()) return;
        actx();
        SOUNDS[pad]();
        flashPad(pad);
        if (uiMode === "loop") {
            if (loop.record) {
                if (!loop.playing) { loop.playing = true; loop.pos = 0; loop.last = Date.now(); lastLoopAbs = -1; }
                const st = Math.round(loop.pos / BASE_STEP) % STEPS;
                if (!loop.hits.some((h) => h.step === st && h.pad === pad)) loop.hits.push({ step: st, pad });
                render();
            }
            return;
        }
        if (uiMode !== "battle" || !state.t0) return;
        const c = battleClock();
        if ((state.phase === "lead" && mySeat() === state.leader) ||
            (state.phase === "input" && mySeat() === follower())) {
            submitAction({ type: "hit", pad, step: c.s, cycle: c.cycle });
        }
    }

    /* ---------------- overlays / freeze ---------------- */
    function shiftAnchors(ms) {
        if (ms <= 0) return;
        if (!online || isHost) {
            if (state.t0) { state.t0 += ms; prevT0 = state.t0; }
            if (state.until) state.until += ms;
        }
        if (loop.last) loop.last += ms;
        if (online && isHost) publish();
    }
    function syncFreeze() {
        const shouldFreeze = isFrozen();
        if (shouldFreeze === frozen) return;
        if (shouldFreeze) pauseStart = Date.now();
        else { shiftAnchors(Date.now() - pauseStart); pauseStart = 0; }
        frozen = shouldFreeze;
    }
    function setPause(on) {
        paused = Boolean(on);
        if (paused) { cheatsOpen = false; loopsOpen = false; }
        syncFreeze(); render();
    }
    function toggleHelp(on) {
        helpOpen = typeof on === "boolean" ? on : !helpOpen;
        if (helpOpen) { cheatsOpen = false; loopsOpen = false; paused = false; }
        syncFreeze(); render();
    }
    function toggleCheatsPanel(on) {
        cheatsOpen = typeof on === "boolean" ? on : !cheatsOpen;
        if (cheatsOpen) { helpOpen = false; loopsOpen = false; paused = false; }
        syncFreeze(); render();
    }
    function toggleLoops(on) {
        loopsOpen = typeof on === "boolean" ? on : !loopsOpen;
        if (loopsOpen) { helpOpen = false; cheatsOpen = false; paused = false; }
        syncFreeze(); render();
    }
    function closeTopOverlay() {
        if (helpOpen) { toggleHelp(false); return true; }
        if (cheatsOpen) { toggleCheatsPanel(false); return true; }
        if (loopsOpen) { toggleLoops(false); return true; }
        if (paused) { setPause(false); return true; }
        return false;
    }
    function restartGame() {
        helpOpen = false; cheatsOpen = false; loopsOpen = false; paused = false;
        syncFreeze();
        if (uiMode === "loop") {
            loop.pos = 0; lastLoopAbs = -1; loop.playing = true; loop.last = Date.now();
        } else if (uiMode === "battle") {
            submitAction({ type: "restart" });
        }
        render();
    }

    /* ---------------- UI actions ---------------- */
    function setUiMode(m) {
        if (online || uiMode === m) return;
        loop.playing = false;
        if (m !== "battle") state = freshState();
        uiMode = m;
        helpOpen = false; cheatsOpen = false; loopsOpen = false; paused = false;
        syncFreeze(); render();
    }
    function toggleCheat(key) {
        if (key === "reveal" || key === "auto") {
            cheats[key] = !cheats[key];
            if (cheats[key]) cheatsUsed = true;
            render();
        } else {
            const cur = key === "lives" ? state.shields[mySeat()] : key === "lenient" ? state.tols[mySeat()] > TOL : state.stepMs !== BASE_STEP;
            if (!cur) cheatsUsed = true;
            submitAction({ type: "cheat", key, on: !cur });
        }
    }
    function loopAction(act, id) {
        const item = saved.find((l) => l.id === id);
        if (act === "del") { saved = saved.filter((l) => l.id !== id); saveJSON("edmPadLoops", saved); render(); return; }
        if (!item) return;
        loop.hits = item.hits.map((h) => ({ ...h }));
        loop.pos = 0; lastLoopAbs = -1;
        loop.playing = act === "play";
        loop.last = Date.now();
        render();
    }
    function handleClick(event) {
        const t = event.target;
        if (t.closest("[data-exit]")) { onExit(); return; }
        if (t.closest("[data-help-close]")) { toggleHelp(false); return; }
        if (t.closest("[data-help]")) { toggleHelp(); return; }
        if (t.closest("[data-close-cheats]")) { toggleCheatsPanel(false); return; }
        if (t.closest("[data-close-loops]")) { toggleLoops(false); return; }
        if (t.closest("[data-pause]") || t.closest("[data-resume]")) {
            if (t.closest("[data-resume]")) { setPause(false); return; }
            if (!closeTopOverlay()) setPause(true);
            return;
        }
        if (t.closest("[data-restart]")) { restartGame(); return; }
        if (t.closest("[data-cheats]")) { toggleCheatsPanel(); return; }
        const cheatBtn = t.closest("[data-cheat]");
        if (cheatBtn) { toggleCheat(cheatBtn.dataset.cheat); return; }
        const loopBtn = t.closest("[data-loop]");
        if (loopBtn) { loopAction(loopBtn.dataset.loop, Number(loopBtn.dataset.id)); return; }
        const btn = t.closest("[data-act]");
        if (!btn) return;
        switch (btn.dataset.act) {
            case "tab-free": setUiMode("free"); break;
            case "tab-loop": setUiMode("loop"); break;
            case "tab-battle": setUiMode("battle"); break;
            case "loops": toggleLoops(); break;
            case "mute": muted = !muted; render(); break;
            case "start": submitAction({ type: "start" }); break;
            case "play":
                loop.playing = !loop.playing; loop.last = Date.now(); render(); break;
            case "stop":
                loop.playing = false; loop.pos = 0; lastLoopAbs = -1; render(); break;
            case "restart-loop":
                loop.pos = 0; lastLoopAbs = -1; loop.playing = true; loop.last = Date.now(); render(); break;
            case "rec": loop.record = !loop.record; render(); break;
            case "clear": loop.hits = []; render(); break;
            case "save":
                if (loop.hits.length) {
                    saved.push({ id: Date.now(), name: `Loop ${saved.length + 1}`, hits: loop.hits.map((h) => ({ ...h })) });
                    saveJSON("edmPadLoops", saved); render();
                }
                break;
        }
    }
    function handlePointer(event) {
        if (destroyed || isFrozen() || event.target.closest(".ep-ov")) return;
        const el = event.target.closest("[data-pad]");
        if (el) { event.preventDefault(); doHit(Number(el.dataset.pad)); }
    }
    function handleKey(event) {
        if (destroyed || event.repeat) return;
        if (event.target.closest?.("input,textarea,[contenteditable]")) return;
        const k = event.key, code = event.code;
        if (code === "KeyH" || k === "?") { toggleHelp(); event.preventDefault(); return; }
        if (code === "KeyC") { if (!helpOpen) toggleCheatsPanel(); event.preventDefault(); return; }
        if (code === "KeyP" || k === "Escape") {
            if (!closeTopOverlay()) setPause(true);
            event.preventDefault(); return;
        }
        if (code === "KeyR") {
            if (isFrozen()) closeTopOverlay(); else restartGame();
            event.preventDefault(); return;
        }
        if (isFrozen()) {
            if (k === " " || code === "Space" || k === "Enter") { closeTopOverlay(); event.preventDefault(); }
            return;
        }
        if (k >= "1" && k <= "8") { doHit(Number(k) - 1); return; }
        if (k === " " || code === "Space") {
            event.preventDefault();
            if (uiMode === "loop") { loop.playing = !loop.playing; loop.last = Date.now(); render(); }
            else if (uiMode === "battle" && (state.phase === "lobby" || state.phase === "over")) submitAction({ type: "start" });
            return;
        }
        if (k === "s" || k === "S") { if (uiMode === "loop") { loop.playing = false; loop.pos = 0; lastLoopAbs = -1; render(); } }
    }

    root.addEventListener("click", handleClick);
    root.addEventListener("pointerdown", handlePointer);
    document.addEventListener("keydown", handleKey);

    /* ---------------- boot ---------------- */
    if (online) {
        room.onRoom((nextRoom) => { if (destroyed) return; roomData = nextRoom; render(); });
        if (room.isHost) {
            state = freshState();
            publish();
            room.onAction((action) => { if (!destroyed) applyAction(action, 1); });
        } else {
            room.onState((nextState) => {
                if (destroyed || !nextState) return;
                const hitter = nextState.phase === "lead" ? nextState.leader : 1 - nextState.leader;
                if (nextState.t0 === state.t0 && nextState.hits.length > prevHitsLen && hitter !== mySeat()) {
                    const h = nextState.hits[nextState.hits.length - 1];
                    SOUNDS[h.pad](); flashPad(h.pad);
                }
                prevHitsLen = nextState.hits.length;
                state = nextState;
                render();
            });
        }
    } else {
        state = freshState();
    }
    syncFreeze();
    render();

    return {
        destroy() {
            destroyed = true;
            clearInterval(ticker);
            root.removeEventListener("click", handleClick);
            root.removeEventListener("pointerdown", handlePointer);
            document.removeEventListener("keydown", handleKey);
            loop.playing = false;
            try { if (AC) AC.close(); } catch (e) { }
        },
    };
}