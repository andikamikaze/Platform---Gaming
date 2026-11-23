/* ==== GAME: beat-maker.js ==== */
/* Beat Maker - turn-based memory duel on a 16-step drum grid.
   Modes: "ai" (vs bot, fully local) and "room" (online, host-authoritative).
   Register its metadata + module path in GAMES inside app.js. */

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
        if (!c || muted) return;
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
        if (!c || muted) return;
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

    /* ---------------- timers ---------------- */
    const timers = new Set();
    let autoId = 0;
    function later(fn, ms) {
        const id = setTimeout(() => { timers.delete(id); fn(); }, ms);
        timers.add(id);
        return id;
    }
    function clearTimers() {
        for (const id of timers) clearTimeout(id);
        timers.clear();
        autoId = 0;
    }
    function scheduleAuto(fn, ms) {
        if (autoId) return;
        autoId = later(() => { autoId = 0; fn(); }, ms);
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
    let cursor = { r: 0, s: 0 }, kbMode = false, cheatsOpen = false;

    /* ---------------- markup (minimal, uniform grid gaps) ---------------- */
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
.bm-game{--line:rgba(127,127,127,.28);--soft:rgba(127,127,127,.08);--accent:#6366f1;--gap:6px}
.bm-game [hidden]{display:none!important}
.bm-meta{margin:2px 0 0;font-size:12px;opacity:.6}
.bm-panel{position:relative;display:flex;flex-direction:column;gap:12px;padding:14px;border:1px solid var(--line);border-radius:14px;background:var(--soft)}
.bm-players{display:flex;align-items:stretch;gap:10px}
.bm-pcard{flex:1;display:flex;flex-direction:column;gap:5px;padding:8px 10px;border:1px solid var(--line);border-radius:10px;min-width:0;transition:border-color .15s,box-shadow .15s}
.bm-pcard.active{border-color:var(--accent);box-shadow:inset 0 0 0 1px var(--accent)}
.bm-pname{font-size:12px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.bm-ptag{font-size:10px;opacity:.55}
.bm-lives{display:flex;gap:4px}
.bm-life{width:7px;height:7px;border-radius:50%;background:var(--accent)}
.bm-life.off{background:var(--line)}
.bm-chain{align-self:center;text-align:center;font-size:10px;opacity:.7;min-width:56px}
.bm-chain b{display:block;font-size:17px;line-height:1.1}
.bm-note{min-height:16px;font-size:12px;opacity:.7;text-align:center}
.bm-grid{display:grid;grid-template-columns:58px repeat(16,minmax(0,1fr));gap:var(--gap);align-items:center}
.bm-num{font-size:9px;text-align:center;opacity:.4}
.bm-label{display:flex;align-items:center;justify-content:flex-end;gap:5px;font-size:10px;font-weight:600;opacity:.8;white-space:nowrap;padding-right:2px}
.bm-label i{width:7px;height:7px;border-radius:50%;background:var(--h);flex:none}
.bm-cell{position:relative;aspect-ratio:1.15/1;min-width:0;border:1px solid var(--line);border-radius:6px;background:transparent;padding:0;cursor:pointer;transition:background .12s,border-color .12s,transform .12s}
.bm-grid.locked .bm-cell{cursor:default}
.bm-grid:not(.locked) .bm-cell:hover{border-color:var(--accent)}
.bm-cell.used{background:var(--soft);box-shadow:inset 0 0 0 1.5px var(--h)}
.bm-cell.flash,.bm-cell.pop{background:var(--h);border-color:transparent}
.bm-cell.pop{transform:scale(1.08)}
.bm-cell.bad{background:#ef4444;border-color:transparent}
.bm-cell.hint{outline:2px solid var(--accent);outline-offset:1px;animation:bm-pulse 1s infinite}
.bm-cell.cursor{outline:2px solid currentColor;outline-offset:1px}
@keyframes bm-pulse{50%{outline-color:transparent}}
.bm-controls{display:flex;gap:8px;flex-wrap:wrap;justify-content:center}
.bm-btn{font:inherit;font-size:12.5px;padding:6px 14px;border:1px solid var(--line);border-radius:9px;background:transparent;color:inherit;cursor:pointer;transition:border-color .12s}
.bm-btn:hover{border-color:var(--accent)}
.bm-btn:disabled{opacity:.4;cursor:default}
.bm-btn.primary{background:var(--accent);border-color:var(--accent);color:#fff}
.bm-btn.on{border-color:var(--accent);color:var(--accent)}
.bm-cheats{position:absolute;top:10px;right:10px;z-index:40;width:min(300px,calc(100% - 20px));background:#16181d;color:#eceef2;border:1px solid rgba(255,255,255,.12);border-radius:12px;padding:12px;display:flex;flex-direction:column;gap:9px;box-shadow:0 12px 32px rgba(0,0,0,.35)}
.bm-cheats h4{margin:0;font-size:13px;display:flex;justify-content:space-between;align-items:center}
.bm-crow{display:flex;justify-content:space-between;align-items:center;gap:10px;font-size:12px}
.bm-sw{width:34px;height:20px;border-radius:999px;border:1px solid rgba(255,255,255,.2);background:transparent;position:relative;cursor:pointer;padding:0;flex:none}
.bm-sw::after{content:"";position:absolute;top:2px;left:2px;width:14px;height:14px;border-radius:50%;background:#8a8f98;transition:left .15s,background .15s}
.bm-sw[aria-checked="true"]{background:var(--accent);border-color:var(--accent)}
.bm-sw[aria-checked="true"]::after{left:16px;background:#fff}
.bm-x{background:none;border:none;color:inherit;cursor:pointer;font-size:14px;opacity:.7;padding:2px 4px}
.bm-overlay{position:absolute;inset:0;z-index:30;display:grid;place-items:center;background:rgba(10,12,16,.55);border-radius:inherit}
.bm-card{background:#16181d;color:#eceef2;border:1px solid rgba(255,255,255,.12);border-radius:14px;padding:20px 24px;text-align:center;display:flex;flex-direction:column;gap:10px;max-width:320px}
.bm-card h3{margin:0;font-size:18px}
.bm-card p{margin:0;font-size:12.5px;opacity:.7}
@media (max-width:620px){
.bm-game{--gap:4px}
.bm-grid{grid-template-columns:42px repeat(16,minmax(0,1fr))}
.bm-label{font-size:8.5px;gap:3px}
.bm-label i{width:5px;height:5px}
.bm-num{font-size:7.5px}
.bm-cell{border-radius:4px}
.bm-panel{padding:10px}
}
</style>
<div class="game-app bm-game">
  <div class="game-intro">
    <div><h2>Beat Maker</h2><p class="bm-meta" data-meta>&hellip;</p></div>
    <span class="game-status"><i class="game-status-dot"></i><span data-status>Ready</span></span>
  </div>
  <section class="game-panel bm-panel" data-board>
    <div class="bm-players">
      <div class="bm-pcard" data-p="0">
        <span class="bm-pname" data-pname></span><span class="bm-ptag" data-ptag></span><span class="bm-lives" data-plives></span>
      </div>
      <div class="bm-chain"><b data-chain>0</b><span>of ${MAX_CHAIN}</span></div>
      <div class="bm-pcard" data-p="1">
        <span class="bm-pname" data-pname></span><span class="bm-ptag" data-ptag></span><span class="bm-lives" data-plives></span>
      </div>
    </div>
    <div class="bm-note" data-note aria-live="polite"></div>
    <div class="bm-grid" data-grid>${gridHTML()}</div>
    <div class="bm-controls">
      <button class="bm-btn" type="button" data-act="listen" data-listen>Listen</button>
      <button class="bm-btn" type="button" data-act="mute" data-mute aria-pressed="false">Mute</button>
      <button class="bm-btn" type="button" data-act="cheats" data-cheatsbtn aria-pressed="false">Cheats</button>
    </div>
    <div class="bm-cheats" data-cheatpanel hidden>
      <h4><span>Cheats</span><button class="bm-x" type="button" data-act="close-cheats" aria-label="Close">&#10005;</button></h4>
      <div class="bm-crow"><span>Hint: next hit</span><button class="bm-sw" type="button" role="switch" aria-checked="false" data-cheat="hint"></button></div>
      <div class="bm-crow"><span>Auto-repeat my turn</span><button class="bm-sw" type="button" role="switch" aria-checked="false" data-cheat="auto"></button></div>
      <div class="bm-crow"><span>Mark used cells</span><button class="bm-sw" type="button" role="switch" aria-checked="false" data-cheat="mark"></button></div>
      <div class="bm-crow"><span>Slow preview</span><button class="bm-sw" type="button" role="switch" aria-checked="false" data-cheat="slow"></button></div>
      <div class="bm-crow" data-ai><span>Bot blunder &times;3</span><button class="bm-sw" type="button" role="switch" aria-checked="false" data-cheat="blunder"></button></div>
      <div class="bm-crow" data-ai><span>Extra life</span><button class="bm-btn" type="button" data-act="life" data-life>+1</button></div>
    </div>
    <div class="bm-overlay" data-over hidden>
      <div class="bm-card">
        <h3 data-overtitle></h3>
        <p data-oversub></p>
        <button class="bm-btn primary" type="button" data-act="restart">Play again</button>
      </div>
    </div>
  </section>
  <div class="game-actions"><button class="game-action-button" type="button" data-exit>Exit game</button></div>
</div>`;

    /* ---------------- refs ---------------- */
    const q = (s) => root.querySelector(s);
    const metaEl = q("[data-meta]");
    const statusEl = q("[data-status]");
    const noteEl = q("[data-note]");
    const gridEl = q("[data-grid]");
    const chainEl = q("[data-chain]");
    const listenBtn = q("[data-listen]");
    const muteBtn = q("[data-mute]");
    const cheatsBtn = q("[data-cheatsbtn]");
    const cheatPanel = q("[data-cheatpanel]");
    const lifeBtn = q("[data-life]");
    const overEl = q("[data-over]");
    const overTitle = q("[data-overtitle]");
    const overSub = q("[data-oversub]");
    const cellEls = Array.from(root.querySelectorAll(".bm-cell"));
    const pcards = [q('[data-p="0"]'), q('[data-p="1"]')];

    /* ---------------- rendering ---------------- */
    function flashCell(r, s, cls, ms) {
        const el = cellEls[cellKey(r, s)];
        if (!el) return;
        el.classList.add(cls);
        later(() => el.classList.remove(cls), ms);
    }

    function updateTurnUI() {
        if (!state) return;
        const me = mySeat();
        const mine = state.turn === me;
        const over = state.phase === "over";

        let meta = (online ? "Online" : "vs Bot") + " \u00b7 You are P" + (me + 1);
        if (!state.seq.length && !over) {
            meta += " \u00b7 " + (mine ? "you start" : seatLabel(state.turn) + " starts");
        }
        metaEl.textContent = meta;
        statusEl.textContent = over ? "Finished"
            : previewing ? "Listen"
                : mine ? (state.phase === "add" ? "Your turn" : "Repeat")
                    : (online ? "Rival" : "Bot");
        noteEl.textContent = over ? ""
            : previewing ? "\u2026"
                : mine ? (state.phase === "add" ? "Add one hit" : "Repeat " + state.progress + "/" + state.seq.length)
                    : seatLabel(state.turn) + " is playing";

        chainEl.textContent = String(state.seq.length);
        for (let seat = 0; seat < 2; seat++) {
            const card = pcards[seat];
            card.querySelector("[data-pname]").textContent = seatLabel(seat) + (seat === me ? " \u00b7 you" : "");
            card.querySelector("[data-ptag]").textContent = "P" + (seat + 1);
            const total = Math.max(START_LIVES, state.lives[seat]);
            let dots = "";
            for (let i = 0; i < total; i++) dots += '<span class="bm-life' + (i < state.lives[seat] ? "" : " off") + '"></span>';
            card.querySelector("[data-plives]").innerHTML = dots;
            card.classList.toggle("active", !over && state.turn === seat);
        }

        gridEl.classList.toggle("locked", over || previewing || !mine);
        const used = new Set(cheats.mark ? state.seq.map((c) => cellKey(c.r, c.s)) : []);
        const hint = cheats.hint && mine && state.phase === "replay" && !previewing ? state.seq[state.progress] : null;
        cellEls.forEach((el) => {
            const r = Number(el.dataset.r), s = Number(el.dataset.s), k = cellKey(r, s);
            el.classList.toggle("used", used.has(k));
            el.classList.toggle("hint", !!hint && hint.r === r && hint.s === s);
            el.classList.toggle("cursor", kbMode && cursor.r === r && cursor.s === s);
        });

        listenBtn.disabled = !state.seq.length || previewing || over;
        cheatPanel.hidden = !cheatsOpen || over;
        root.querySelectorAll("[data-ai]").forEach((el) => { el.hidden = online; });
        for (const k of Object.keys(cheats)) {
            const sw = q('[data-cheat="' + k + '"]');
            if (sw) sw.setAttribute("aria-checked", String(cheats[k]));
        }
        lifeBtn.disabled = online || state.lives[0] >= MAX_LIVES;
        const anyCheat = Object.values(cheats).some(Boolean);
        cheatsBtn.classList.toggle("on", anyCheat);
        cheatsBtn.setAttribute("aria-pressed", String(cheatsOpen));

        overEl.hidden = !over;
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
            flashCell(lp.r, lp.s, lp.ok ? "pop" : "bad", 260);
            if (lp.ok) SOUNDS[lp.r](); else badBuzz();
        }
    }

    function render() {
        if (!state) {
            statusEl.textContent = online && !room.isHost ? "Waiting" : "Ready";
            return;
        }
        updateTurnUI();
        pickSideEffects();
        refresh();
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
        if (!state || state.phase === "over" || previewing) return;
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
        if (!state || online || state.phase === "over" || state.turn !== 1 || previewing) return;
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
    function tryPick(r, s) {
        if (!state || previewing || state.phase === "over" || state.turn !== mySeat()) return;
        submitAction({ type: "pick", r, s });
    }

    function listen() {
        if (!state || !state.seq.length || previewing || state.phase === "over") return;
        clearTimers();
        previewing = true;
        updateTurnUI();
        playSeq(() => { previewing = false; afterPreview(); });
    }

    function syncMuteBtn() {
        muteBtn.textContent = muted ? "Unmute" : "Mute";
        muteBtn.setAttribute("aria-pressed", String(muted));
    }

    function handleClick(event) {
        const t = event.target;
        if (t.closest("[data-exit]")) { onExit(); return; }
        actx();
        const cell = t.closest(".bm-cell");
        if (cell) {
            kbMode = false;
            tryPick(Number(cell.dataset.r), Number(cell.dataset.s));
            return;
        }
        const sw = t.closest("[data-cheat]");
        if (sw) {
            const k = sw.dataset.cheat;
            cheats[k] = !cheats[k];
            render();
            return;
        }
        const btn = t.closest("[data-act]");
        if (!btn) return;
        const a = btn.dataset.act;
        if (a === "listen") listen();
        else if (a === "mute") { muted = !muted; syncMuteBtn(); }
        else if (a === "cheats") { cheatsOpen = !cheatsOpen; render(); }
        else if (a === "close-cheats") { cheatsOpen = false; render(); }
        else if (a === "life") submitAction({ type: "life" });
        else if (a === "restart") { cheatsOpen = false; submitAction({ type: "restart" }); }
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
        const k = e.key;
        if (k === "Escape") {
            if (cheatsOpen) { cheatsOpen = false; render(); e.preventDefault(); }
            return;
        }
        if (k === "c" || k === "C") { cheatsOpen = !cheatsOpen; render(); e.preventDefault(); return; }
        if (k === "m" || k === "M") { muted = !muted; syncMuteBtn(); e.preventDefault(); return; }
        if (k === "p" || k === "P") { listen(); e.preventDefault(); return; }
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