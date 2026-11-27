/* ==== GAME: music-memory.js ==== */

/* =============================================================== */
/* Music Memory - music game (MGP module)                           */
/* Simon with tones: watch the pad sequence, repeat it back. Every  */
/* round adds one more note - reach 8 to win. Tiny WebAudio synth.  */
/* Layout: HUD bar + fill-height board + internal help/cheat/pause  */
/* overlays. Classic MGP script is kept (inline icon helper below)  */
/* so the manifest "kind" stays "mgp".                              */
/* =============================================================== */
(() => {
    "use strict";

    /* ---------- pure rules (exposed via _test) ---------- */
    const PADS = 4,
        ROUNDS = 8;
    const PAD_FREQ = [262, 330, 392, 494];

    function makeSequence(n) {
        const out = [];
        for (let i = 0; i < n; i++)
            out.push(Math.floor(Math.random() * PADS));
        return out;
    }
    /* index of first mismatch, or -1 when input matches seq[0..len) */
    function checkInput(input, seq) {
        for (let i = 0; i < input.length; i++) {
            if (i >= seq.length || input[i] !== seq[i]) return i;
        }
        return input.length >= seq.length ? -1 : -2; /* -2 = keep going */
    }
    function flashMs(round) {
        return Math.max(280, 580 - round * 32);
    }
    const TEST = {
        PADS,
        ROUNDS,
        PAD_FREQ,
        makeSequence,
        checkInput,
        flashMs,
    };

    /* ---------- inline icons (no ESM import; keeps classic MGP) ---------- */
    const ICON_PATHS = {
        helpCircle: ["M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z", "M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3", "M12 17h.01"],
        wrench: ["M14.7 6.3a4 4 0 0 0 5 5l-9 9a2.8 2.8 0 0 1-4-4z", "M6 16l-3 3", "M14.5 4.5 19 9"],
        pause: ["M7 4h3v16H7z", "M14 4h3v16h-3z"],
        play: ["M8 5v14l11-7z"],
        refresh: ["M21 2v6h-6", "M3 12a9 9 0 0 1 15-6.7L21 8", "M3 22v-6h6", "M21 12a9 9 0 0 1-15 6.7L3 16"],
        logOut: ["m16 17 5-5-5-5", "M21 12H9", "M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"],
        x: ["M18 6 6 18", "M6 6l12 12"],
        volume: ["M11 5 6 9H2v6h4l5 4V5z", "M15.54 8.46a5 5 0 0 1 0 7.07", "M19.07 4.93a10 10 0 0 1 0 14.14"],
        volumeX: ["M11 4.702a.7.7 0 0 0-1.203-.498L6.413 7.587A1.4 1.4 0 0 1 5.416 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.416a1.4 1.4 0 0 1 .997.413l3.383 3.384A.7.7 0 0 0 11 19.298z", "m16.5 14.5 5-5", "m16.5 9.5 5 5"],
    };
    function iconSVG(name, size) {
        const paths = ICON_PATHS[name] || ICON_PATHS.helpCircle;
        return '<svg viewBox="0 0 24 24" width="' + size + '" height="' + size + '" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' + paths.map(function (d) { return '<path d="' + d + '"/>'; }).join("") + "</svg>";
    }

    MGP_REGISTER({
        id: "music-memory",
        name: "Music Memory",
        category: "music",
        catLabel: "Music",
        desc: "Watch the tune, play it back - grow the sequence to 8 notes.",
        art: '<svg viewBox="0 0 48 48" width="54" height="54" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="18" cy="18" r="9"/><circle cx="32" cy="20" r="7"/><circle cx="20" cy="33" r="7"/><path d="M40 38c3-2 4-6 3-9"/><path d="M44 30l1-3 3 2"/></svg>',
        bg: ["#bfdbfe", "#3b82f6"],
        _test: TEST,

        build(app, context) {
            const ctx = context || {};
            const onExit = typeof ctx.onExit === "function" ? ctx.onExit : function () {
                const b = typeof document !== "undefined" && document.getElementById
                    ? document.getElementById("closeGameButton") : null;
                if (b && typeof b.click === "function") b.click();
            };
            const $ = (s) => app.querySelector(s);
            const PAD_INFO = [
                { hue: "#22c55e", dark: "#15803d" },
                { hue: "#ef4444", dark: "#b91c1c" },
                { hue: "#eab308", dark: "#a16207" },
                { hue: "#3b82f6", dark: "#1d4ed8" },
            ];
            app.className = "mgp-app game-app mm game-fill";

            /* ---------- tiny synth ---------- */
            let AC = null,
                muted = false;
            function actx() {
                if (!AC) {
                    try {
                        AC = new (window.AudioContext || window.webkitAudioContext)();
                    } catch (e) {
                        AC = null;
                    }
                }
                if (AC && AC.state === "suspended") AC.resume();
                return AC;
            }
            function tone(freq, dur, vol) {
                const c = actx();
                if (!c || muted) return;
                try {
                    const t = c.currentTime;
                    const o = c.createOscillator(),
                        g = c.createGain();
                    o.type = "triangle";
                    o.frequency.value = freq;
                    g.gain.setValueAtTime(0.0001, t);
                    g.gain.exponentialRampToValueAtTime(vol || 0.25, t + 0.015);
                    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
                    o.connect(g);
                    g.connect(c.destination);
                    o.start(t);
                    o.stop(t + dur + 0.05);
                } catch (e) { }
            }
            function silence(on) {
                if (!AC) return;
                try {
                    if (on && AC.state === "running") AC.suspend();
                    else if (!on && AC.state === "suspended") AC.resume();
                } catch (e) { }
            }

            app.innerHTML = `
<style>
#music-memory-app [hidden]{display:none!important}
#music-memory-app.mm{--panel:#111a33;--court:#0b1020;--line:#ffffff1f;--ink:#e5e7eb;--mut:#9ca3af;--acc:#60a5fa;--warn:#fde047;--danger:#fb7185;display:flex;flex-direction:column;gap:8px;width:100%;height:100%;min-height:0}
#music-memory-app.mm *{box-sizing:border-box}
#music-memory-app .mm-hud{display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:0;font:600 11px/1 ui-monospace,SFMono-Regular,Menlo,monospace}
#music-memory-app .mm-info{display:flex;align-items:center;gap:8px;flex-wrap:wrap;flex:1 1 auto;min-width:0}
#music-memory-app .mm-tools{display:flex;align-items:center;gap:6px;flex-wrap:wrap;min-width:0}
#music-memory-app .mm-chip{display:inline-flex;align-items:center;gap:6px;min-height:32px;padding:5px 9px;border:1px solid var(--line);border-radius:999px;background:var(--panel);color:var(--mut);white-space:nowrap}
#music-memory-app .mm-chip b{color:var(--ink);font-variant-numeric:tabular-nums}
#music-memory-app .mm-chip[data-hud="status"]{max-width:230px;overflow:hidden;text-overflow:ellipsis}
#music-memory-app .mm-chip .game-status-dot{width:7px;height:7px;border-radius:50%;background:var(--acc);flex:none}
#music-memory-app .mm-chip.watch .game-status-dot{background:var(--warn)}
#music-memory-app .mm-chip.go .game-status-dot{background:#6ee7b7}
#music-memory-app .mm-btn{appearance:none;border:1px solid var(--line);background:var(--panel);color:var(--ink);border-radius:9px;min-height:36px;padding:0 11px;font:inherit;font-size:11px;font-weight:700;letter-spacing:.04em;cursor:pointer;touch-action:manipulation;user-select:none;-webkit-user-select:none}
#music-memory-app .mm-btn:hover:not(:disabled){border-color:var(--acc);color:var(--acc)}
#music-memory-app .mm-btn:disabled{opacity:.4;cursor:default}
#music-memory-app .mm-btn.acc{border-color:var(--acc);color:var(--acc)}
#music-memory-app .mm-btn.on{border-color:var(--warn);color:var(--warn)}
#music-memory-app .mm-icon-btn{display:inline-flex;align-items:center;gap:6px}
#music-memory-app .mm-icon-btn svg{flex:none;display:block}
#music-memory-app .mm-board{position:relative;width:100%;flex:1 1 auto;min-height:0;aspect-ratio:4/3;border:1px solid var(--line);border-radius:12px;background:var(--court);overflow:hidden;padding:0;display:flex;align-items:center;justify-content:center}
#music-memory-app .mm-wrap{display:flex;align-items:center;justify-content:center;width:100%;height:100%;padding:14px}
#music-memory-app .mm-grid{width:min(100%,min(360px,48vh));aspect-ratio:1;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));grid-template-rows:repeat(2,minmax(0,1fr));gap:12px}
#music-memory-app .mm-pad{border:0;border-radius:16px;cursor:pointer;position:relative;min-height:0;transition:transform .15s,filter .15s;box-shadow:inset 0 -6px 0 #00000040}
#music-memory-app .mm-pad:active{transform:scale(.97)}
#music-memory-app .mm-pad.lit{filter:brightness(1.75);transform:scale(1.04)}
#music-memory-app .mm-pad.win{filter:brightness(1.4)}
#music-memory-app .mm-pad .mm-note{position:absolute;right:12px;bottom:8px;color:#00000055;font-weight:800;font-size:13px;letter-spacing:1px}
#music-memory-app .mm-ov{position:absolute;inset:0;z-index:5;display:flex;align-items:center;justify-content:center;padding:14px;background:rgba(11,16,32,.86);backdrop-filter:blur(3px)}
#music-memory-app .mm-card{width:min(520px,100%);max-height:100%;display:flex;flex-direction:column;gap:12px;padding:16px;border:1px solid var(--line);border-radius:12px;background:var(--panel);overflow:hidden;text-align:center}
#music-memory-app .mm-card h2,#music-memory-app .mm-card h3{margin:0;font-size:17px}
#music-memory-app .mm-win{color:var(--acc)}
#music-memory-app .mm-lose{color:var(--danger)}
#music-memory-app .mm-sub{font-size:12px;line-height:1.55;color:var(--mut);margin:0}
#music-memory-app .mm-head{display:flex;align-items:center;justify-content:space-between;gap:10px;flex:none;text-align:left}
#music-memory-app .mm-foot{display:flex;align-items:center;justify-content:space-between;gap:10px;flex:none;text-align:left}
#music-memory-app .mm-cheats,#music-memory-app .mm-help{display:grid;gap:8px;flex:1 1 auto;min-height:0;overflow:auto}
#music-memory-app .mm-cheats{grid-template-columns:repeat(auto-fit,minmax(150px,1fr))}
#music-memory-app .mm-help{grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:14px;text-align:left}
#music-memory-app .mm-help b{display:block;margin-bottom:5px;color:var(--mut);font-size:10px;letter-spacing:.1em;text-transform:uppercase}
#music-memory-app .mm-help ul{margin:0 0 10px;padding-left:16px;color:var(--mut);font-size:12px;line-height:1.6}
#music-memory-app .mm-kbd{display:inline-block;padding:1px 5px;border:1px solid var(--line);border-bottom-width:2px;border-radius:5px;background:var(--court);color:var(--ink);font:inherit}
#music-memory-app .mm-note{color:var(--mut);font-size:11px;line-height:1.5}
#music-memory-app .mm-cheatrow{display:flex;align-items:center;justify-content:space-between;gap:10px;min-height:44px;padding:8px 10px;border:1px solid var(--line);border-radius:10px;background:var(--court);font-size:12px;text-align:left}
#music-memory-app .mm-switch{position:relative;width:40px;height:22px;border-radius:999px;border:1px solid var(--line);background:var(--court);cursor:pointer;flex:none;padding:0}
#music-memory-app .mm-switch:after{content:"";position:absolute;top:2px;left:2px;width:16px;height:16px;border-radius:50%;background:var(--mut)}
#music-memory-app .mm-switch[aria-pressed="true"]{border-color:var(--acc);background:rgba(96,165,250,.15)}
#music-memory-app .mm-switch[aria-pressed="true"]:after{left:20px;background:var(--acc)}
@media (prefers-reduced-motion:reduce){#music-memory-app .mm-pad{transition:none}}
/* --- layout redesign overrides (keep last) --- */
#music-memory-app.mm.game-fill > .mm-board{flex:1 1 auto;min-height:0;aspect-ratio:auto}
@media (max-width:640px){
#music-memory-app.mm.game-fill > .mm-board:not(:has(.mm-ov:not([hidden]))){aspect-ratio:4/3;flex:0 0 auto}
#music-memory-app.mm.game-fill > .mm-board:has(.mm-ov:not([hidden])){flex:0 0 auto;min-height:min(70dvh,620px);aspect-ratio:auto}
#music-memory-app .mm-hud{gap:5px;flex-direction:column;align-items:stretch}
#music-memory-app .mm-info{gap:5px}
#music-memory-app .mm-tools{gap:5px;flex-wrap:nowrap;justify-content:space-between}
#music-memory-app .mm-chip{padding:4px 6px;min-height:0;font-size:9px}
#music-memory-app .mm-chip[data-hud="notes"]{display:none}
#music-memory-app .mm-btn{min-height:32px;padding:5px 6px;font-size:9px}
#music-memory-app .mm-icon-btn .mm-label{display:none}
#music-memory-app .mm-wrap{padding:10px}
#music-memory-app .mm-grid{width:min(100%,46vh);gap:8px}
#music-memory-app .mm-ov{padding:8px}
#music-memory-app .mm-card{width:100%;height:100%;max-height:100%;padding:12px;border-radius:12px}
#music-memory-app .mm-cheats,#music-memory-app .mm-help{scrollbar-width:none}
#music-memory-app .mm-cheats::-webkit-scrollbar,#music-memory-app .mm-help::-webkit-scrollbar{display:none}
#music-memory-app .mm-foot{position:static;margin:0;padding:10px 0 0;border-top:1px solid var(--line)}
#music-memory-app .mm-note{display:none}
}
@media (pointer:coarse){#music-memory-app .mm-hud .mm-btn{min-height:32px}}
</style>
<div class="mm-hud">
  <div class="mm-info">
    <span class="mm-chip game-status" data-chip="status"><i class="game-status-dot"></i><span data-hud="status">Press Start to play</span></span>
    <span class="mm-chip">ROUND <b data-hud="round">1</b>/${ROUNDS}</span>
    <span class="mm-chip">NOTES <b data-hud="notes">1</b></span>
    <span class="mm-chip">BEST <b data-hud="score">0</b></span>
  </div>
  <div class="mm-tools">
    <button class="mm-btn mm-icon-btn" type="button" data-act="mute" aria-label="Mute" title="Mute sound"><span data-ico="on">${iconSVG("volume", 14)}</span><span data-ico="off" hidden>${iconSVG("volumeX", 14)}</span><span class="mm-label" data-label="mute">Mute</span></button>
    <button class="mm-btn mm-icon-btn" type="button" data-help aria-label="How to play" title="How to play (H)">${iconSVG("helpCircle", 14)}<span class="mm-label">Help</span></button>
    <button class="mm-btn mm-icon-btn" type="button" data-cheats aria-label="Cheats" title="Cheats (C)">${iconSVG("wrench", 14)}<span class="mm-label">Cheats</span></button>
    <button class="mm-btn mm-icon-btn" type="button" data-pause aria-label="Pause" title="Pause (P)">${iconSVG("pause", 14)}<span class="mm-label" data-label="pause">Pause</span></button>
    <button class="mm-btn mm-icon-btn" type="button" data-restart aria-label="Restart" title="Restart (R)">${iconSVG("refresh", 14)}<span class="mm-label">Restart</span></button>
    <button class="mm-btn mm-icon-btn" type="button" data-exit aria-label="Exit game" title="Exit game">${iconSVG("logOut", 14)}<span class="mm-label">Exit</span></button>
  </div>
</div>
<section class="game-panel mm-board" data-board>
  <div class="mm-wrap"><div class="mm-grid" data-el="pads"></div></div>
  <div class="mm-ov" data-ov="start">
    <div class="mm-card">
      <div class="mm-head"><h2>Music Memory</h2><span class="mm-note">${ROUNDS} rounds</span></div>
      <p class="mm-sub">The pads flash a little tune - watch and listen, then tap it back in the same order. Each round adds one note. Repeat all ${ROUNDS} rounds to win; one wrong pad ends the run.</p>
      <div class="mm-foot"><button class="mm-btn" type="button" data-help>How to play</button><button class="mm-btn acc" type="button" data-act="start">Start game</button></div>
    </div>
  </div>
  <div class="mm-ov" data-ov="over" hidden>
    <div class="mm-card">
      <div class="mm-head"><h2 data-ov="title">Game over</h2></div>
      <p class="mm-sub" data-ov="reason"></p>
      <div class="mm-foot"><span class="mm-note">Press H to reopen the guide</span><button class="mm-btn acc" type="button" data-act="start">Play again</button></div>
    </div>
  </div>
  <div class="mm-ov" data-ov="pause" hidden>
    <div class="mm-card">
      <div class="mm-head"><h3>Paused</h3></div>
      <p class="mm-sub">The tune and all note timers are frozen. Your place in the sequence is kept when you resume.</p>
      <div class="mm-foot"><span class="mm-note">Press P or Esc to resume</span><button class="mm-btn acc" type="button" data-resume>Resume</button></div>
    </div>
  </div>
  <div class="mm-ov" data-ov="cheat" hidden>
    <div class="mm-card">
      <div class="mm-head"><h3>Cheats</h3><button class="mm-btn" type="button" data-close aria-label="Close cheats">${iconSVG("x", 14)}</button></div>
      <div class="mm-cheats" data-cheatgrid></div>
      <div class="mm-cheats" data-cheatacts></div>
      <div class="mm-foot"><span class="mm-note">Toggles apply immediately</span><button class="mm-btn" type="button" data-close>Done</button></div>
    </div>
  </div>
  <div class="mm-ov" data-ov="help" hidden>
    <div class="mm-card">
      <div class="mm-head"><h3>How to play</h3><button class="mm-btn" type="button" data-help-close aria-label="Close help">${iconSVG("x", 14)}</button></div>
      <div class="mm-help">
        <div>
          <b>Desktop</b>
          <ul>
            <li>Watch the pads flash, then press <span class="mm-kbd">1</span>-<span class="mm-kbd">4</span> or click them in the same order.</li>
            <li><span class="mm-kbd">Space</span> or <span class="mm-kbd">Enter</span> starts a new game.</li>
            <li><span class="mm-kbd">H</span> help &middot; <span class="mm-kbd">C</span> cheats &middot; <span class="mm-kbd">P</span> pause &middot; <span class="mm-kbd">R</span> restart.</li>
          </ul>
          <b>Mobile</b>
          <ul>
            <li>Tap the coloured pads in the order they lit up. The HUD buttons handle help, cheats, pause, restart, sound and exit.</li>
          </ul>
        </div>
        <div>
          <b>Rules</b>
          <ul>
            <li>Each round adds one note and the tune gets faster as rounds go up.</li>
            <li>Repeat all ${ROUNDS} rounds to win. One wrong pad ends the run; your best round is kept.</li>
          </ul>
          <div class="mm-foot"><span class="mm-note">Press H to reopen this guide</span><button class="mm-btn acc" type="button" data-help-close>Got it</button></div>
        </div>
      </div>
    </div>
  </div>
</section>`;

            /* ---------------- refs ---------------- */
            const padsEl = $('[data-el="pads"]');
            const hudRound = $('[data-hud="round"]');
            const hudNotes = $('[data-hud="notes"]');
            const hudBest = $('[data-hud="score"]');
            const hudStatus = $('[data-hud="status"]');
            const statusChip = $('[data-chip="status"]');
            const ov = {
                start: $('[data-ov="start"]'),
                over: $('[data-ov="over"]'),
                pause: $('[data-ov="pause"]'),
                cheat: $('[data-ov="cheat"]'),
                help: $('[data-ov="help"]'),
            };
            const ovTitle = $('[data-ov="title"]');
            const ovReason = $('[data-ov="reason"]');
            const cheatGrid = $('[data-cheatgrid]');
            const cheatActs = $('[data-cheatacts]');
            const pbtn = $('[data-pause]');
            const cbtn = $('[data-cheats]');
            const mbtn = $('[data-act="mute"]');
            const muteLabel = $('[data-label="mute"]');
            const pauseLabel = $('[data-label="pause"]');
            const iconOn = $('[data-ico="on"]');
            const iconOff = $('[data-ico="off"]');

            /* ---------------- state ---------------- */
            let active = false,
                started = false,
                over = false;
            let paused = false,
                cheatsOpen = false,
                helpOpen = false;
            let seq = [],
                round = 1,
                input = [],
                best = 0;
            let phase = "idle", /* idle | watch | go */
                statusText = "Press Start to play";
            const cheats = { slow: false, noFail: false };
            const CHEAT_LABELS = {
                slow: "Slow tune (2x note time)",
                noFail: "Wrong notes don't end the run",
            };
            const CHEAT_ACTS = [
                ["skip", "Skip to next round"],
                ["resetBest", "Reset best"],
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
                    if (active && !frozen()) t.fn();
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
                silence(true);
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
                silence(false);
            }
            function frozen() { return helpOpen || cheatsOpen || paused; }
            function syncFreeze() {
                if (frozen()) freezeTimers();
                else resumeTimers();
            }

            let seenHelp = true;
            try { seenHelp = localStorage.getItem("musicMemoryHelpSeen") === "1"; } catch (_) { seenHelp = true; }
            if (!seenHelp) {
                helpOpen = true;
                try { localStorage.setItem("musicMemoryHelpSeen", "1"); } catch (_) { /* storage blocked */ }
            }

            /* ---------------- rendering ---------------- */
            function renderCheats() {
                let h = "";
                for (const k of Object.keys(cheats)) {
                    const label = CHEAT_LABELS[k];
                    h += '<div class="mm-cheatrow"><span>' + label + '</span><button class="mm-switch" type="button" data-cheat="' + k + '" aria-pressed="' + (cheats[k] ? "true" : "false") + '" aria-label="' + label + '"></button></div>';
                }
                cheatGrid.innerHTML = h;
                let a = "";
                for (const act of CHEAT_ACTS) {
                    a += '<button class="mm-btn" type="button" data-cheatact="' + act[0] + '">' + act[1] + "</button>";
                }
                cheatActs.innerHTML = a;
            }
            function hud() {
                hudRound.textContent = String(round);
                hudNotes.textContent = String(round);
                hudBest.textContent = String(best);
                hudStatus.textContent = statusText;
                hudStatus.title = statusText;
                statusChip.className = "mm-chip game-status" +
                    (phase === "watch" ? " watch" : phase === "go" ? " go" : "");
                ov.start.hidden = started || cheatsOpen || helpOpen || paused;
                ov.over.hidden = !over || cheatsOpen || helpOpen || paused;
                ov.pause.hidden = !paused || cheatsOpen || helpOpen;
                ov.cheat.hidden = !cheatsOpen || helpOpen;
                ov.help.hidden = !helpOpen;
                pauseLabel.textContent = paused ? "Resume" : "Pause";
                pbtn.setAttribute("aria-label", paused ? "Resume" : "Pause");
                pbtn.querySelector("svg").innerHTML = paused ? ICON_PATHS.play.map((d) => '<path d="' + d + '"/>').join("") : ICON_PATHS.pause.map((d) => '<path d="' + d + '"/>').join("");
                pbtn.disabled = !started || over;
                muteLabel.textContent = muted ? "Unmute" : "Mute";
                mbtn.setAttribute("aria-label", muted ? "Unmute" : "Mute");
                iconOn.hidden = muted;
                iconOff.hidden = !muted;
                mbtn.classList.toggle("on", muted);
                cbtn.classList.toggle("on", cheats.slow || cheats.noFail);
                renderCheats();
            }
            function setPhase(p, label) {
                phase = p;
                statusText = label;
                hud();
            }
            function clearLights() {
                for (const el of padsEl.children) el.classList.remove("lit", "win");
            }

            /* ---------------- pads ---------------- */
            function buildPads() {
                let html = "";
                for (let i = 0; i < PADS; i++) {
                    html +=
                        '<button class="mm-pad" data-pad="' +
                        i +
                        '" style="background:' +
                        PAD_INFO[i].hue +
                        '" aria-label="Pad ' + (i + 1) + ' (' + ["C4", "E4", "G4", "B4"][i] + ')"><span class="mm-note">' +
                        ["C4", "E4", "G4", "B4"][i] +
                        "</span></button>";
                }
                padsEl.innerHTML = html;
            }
            function lightPad(i, ms) {
                const el = padsEl.children[i];
                if (!el) return;
                el.classList.add("lit");
                tone(PAD_FREQ[i], Math.min(0.5, ms / 1000 + 0.08), 0.26);
                after(ms, () => el.classList.remove("lit"));
            }

            /* ---------------- sequence playback ---------------- */
            function playRound() {
                input = [];
                setPhase("watch", "Watch...");
                const fl = flashMs(round) * (cheats.slow ? 2 : 1);
                seq.slice(0, round).forEach((pad, i) => {
                    after(i * (fl + 200), () => lightPad(pad, fl));
                });
                after(round * (fl + 200) + 120, () => {
                    if (phase === "watch")
                        setPhase(
                            "go",
                            "Your turn - " + round + " note" + (round > 1 ? "s" : ""),
                        );
                });
            }

            /* ---------------- input ---------------- */
            function pressPad(i) {
                if (!active || !started || over || frozen()) return;
                if (phase !== "go") return;
                lightPad(i, 160);
                input.push(i);
                const res = checkInput(input, seq.slice(0, round));
                if (res === -2) return; /* still going */
                if (res === -1) {
                    /* round complete */
                    if (round > best) best = round;
                    if (round >= ROUNDS) {
                        win();
                        return;
                    }
                    round++;
                    setPhase("idle", "Nice! Round " + round + "...");
                    after(700, () => {
                        if (started && !over) playRound();
                    });
                } else if (cheats.noFail) {
                    input = [];
                    setPhase("idle", "No-fail cheat - replaying round " + round + "...");
                    after(650, () => {
                        if (started && !over) playRound();
                    });
                } else {
                    lose(res);
                }
            }
            function win() {
                over = true;
                for (const el of padsEl.children) el.classList.add("win");
                setPhase("idle", "Flawless!");
                ovTitle.textContent = "Perfect pitch!";
                ovTitle.className = "mm-win";
                ovReason.textContent =
                    "You repeated all " +
                    ROUNDS +
                    " rounds, " +
                    ROUNDS +
                    " notes long. Maestro!";
            }
            function lose(badIndex) {
                over = true;
                setPhase("idle", "Oops - wrong pad");
                ovTitle.textContent = "Wrong note";
                ovTitle.className = "mm-lose";
                ovReason.textContent =
                    "Note " +
                    (badIndex + 1) +
                    " of " +
                    round +
                    " broke the tune. You reached round " +
                    round +
                    " (best " +
                    best +
                    "). Try again!";
            }

            /* ---------------- flow ---------------- */
            function startGame() {
                clearTimers();
                clearLights();
                actx();
                seq = makeSequence(ROUNDS);
                round = 1;
                input = [];
                over = false;
                started = true;
                paused = false;
                cheatsOpen = false;
                helpOpen = false;
                syncFreeze();
                setPhase("idle", "Get ready...");
                after(400, () => {
                    if (started && !over) playRound();
                });
            }
            function restart() {
                startGame();
            }

            /* ---------------- overlay toggles ---------------- */
            function toggleHelp(on) {
                helpOpen = typeof on === "boolean" ? on : !helpOpen;
                if (helpOpen) cheatsOpen = false;
                syncFreeze();
                hud();
            }
            function toggleCheats(on) {
                cheatsOpen = typeof on === "boolean" ? on : !cheatsOpen;
                if (cheatsOpen) {
                    helpOpen = false;
                    paused = false;
                }
                syncFreeze();
                hud();
            }
            function togglePause(on) {
                if (!started || over) return;
                paused = typeof on === "boolean" ? on : !paused;
                if (paused) {
                    helpOpen = false;
                    cheatsOpen = false;
                }
                syncFreeze();
                hud();
            }
            function cheatAction(key) {
                if (key === "resetBest") {
                    best = 0;
                    hud();
                    return;
                }
                if (!started || over) return;
                if (key === "skip") {
                    clearTimers();
                    if (round > best) best = round;
                    if (round >= ROUNDS) {
                        win();
                        return;
                    }
                    round++;
                    input = [];
                    setPhase("idle", "Cheat: skipped to round " + round + "...");
                    after(500, () => {
                        if (started && !over) playRound();
                    });
                }
            }

            /* ---------------- events ---------------- */
            padsEl.addEventListener("pointerdown", (e) => {
                if (frozen()) return;
                const el = e.target.closest ? e.target.closest("[data-pad]") : null;
                if (el) pressPad(Number(el.dataset.pad));
            });
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
                if (c === "KeyR") { restart(); e.preventDefault(); return; }
                if (c === "Enter") {
                    if (helpOpen) toggleHelp(false);
                    else if (cheatsOpen) toggleCheats(false);
                    else if (!started || over) startGame();
                    e.preventDefault();
                    return;
                }
                if (frozen()) return;
                if (/^(Digit|Numpad)[1-4]$/.test(c) || /^[1-4]$/.test(e.key || "")) {
                    pressPad(Number((c.match(/[1-4]$/) || [e.key])[0]) - 1);
                    e.preventDefault();
                } else if (e.key === " " || c === "Space") {
                    e.preventDefault();
                    if (!started || over) startGame();
                }
            };
            document.addEventListener("keydown", onKey);
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
                if (t.closest("[data-restart]")) { restart(); return; }
                const sw = t.closest("[data-cheat]");
                if (sw) {
                    const k = sw.dataset.cheat;
                    if (Object.prototype.hasOwnProperty.call(cheats, k)) {
                        cheats[k] = !cheats[k];
                        hud();
                    }
                    return;
                }
                const ca = t.closest("[data-cheatact]");
                if (ca) { cheatAction(ca.dataset.cheatact); return; }
                const btn = t.closest("[data-act]");
                if (!btn) return;
                const a = btn.dataset.act;
                if (a === "start") startGame();
                else if (a === "mute") { muted = !muted; hud(); }
            });

            /* ---------------- open / close ---------------- */
            function open() {
                active = true;
                silence(false);
            }
            function close() {
                active = false;
                clearTimers();
                clearLights();
                silence(true);
                if (!over && started) {
                    setPhase(
                        "idle",
                        "Stopped - press Restart to replay round " + round,
                    );
                }
            }

            buildPads();
            renderCheats();
            hud();
            return { open, close };
        },
    });
})();
