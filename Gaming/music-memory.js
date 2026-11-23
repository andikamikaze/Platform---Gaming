/* ==== GAME: music-memory.js ==== */

/* =============================================================== */
/* Music Memory - music game (MGP module)                           */
/* Simon with tones: watch the pad sequence, repeat it back. Every  */
/* round adds one more note - reach 8 to win. Tiny WebAudio synth.  */
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

    MGP_REGISTER({
        id: "music-memory",
        name: "Music Memory",
        category: "music",
        catLabel: "Music",
        desc: "Watch the tune, play it back - grow the sequence to 8 notes.",
        art: '<svg viewBox="0 0 48 48" width="54" height="54" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="18" cy="18" r="9"/><circle cx="32" cy="20" r="7"/><circle cx="20" cy="33" r="7"/><path d="M40 38c3-2 4-6 3-9"/><path d="M44 30l1-3 3 2"/></svg>',
        bg: ["#bfdbfe", "#3b82f6"],
        _test: TEST,

        build(app) {
            const $ = (s) => app.querySelector(s);
            const PAD_INFO = [
                { hue: "#22c55e", dark: "#15803d" },
                { hue: "#ef4444", dark: "#b91c1c" },
                { hue: "#eab308", dark: "#a16207" },
                { hue: "#3b82f6", dark: "#1d4ed8" },
            ];

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

            app.innerHTML = `
<style>
#music-memory-app [hidden]{display:none!important}
#music-memory-app .mm-wrap{display:flex;align-items:center;justify-content:center;height:100%;padding:10px}
#music-memory-app .mm-grid{display:grid;grid-template-columns:repeat(2,140px);grid-template-rows:repeat(2,110px);gap:14px}
#music-memory-app .mm-pad{border:0;border-radius:18px;cursor:pointer;position:relative;transition:transform .1s,filter .1s;box-shadow:inset 0 -6px 0 #00000040}
#music-memory-app .mm-pad:active{transform:scale(.96)}
#music-memory-app .mm-pad.lit{filter:brightness(1.75);transform:scale(1.04)}
#music-memory-app .mm-pad.win{filter:brightness(1.4)}
#music-memory-app .mm-pad .mm-note{position:absolute;right:10px;bottom:6px;color:#00000055;font-weight:800;font-size:12px;letter-spacing:1px}
#music-memory-app .mm-phase{min-height:22px;text-align:center;font-weight:800;font-size:15px;color:#c3cde2;padding:0 8px 8px}
#music-memory-app .mm-phase.watch{color:#fde047}
#music-memory-app .mm-phase.go{color:#6ee7b7}
</style>
<div class="mgp-hud">
  <span class="mgp-title">Music Memory</span>
  <span class="mgp-chip">Round <b data-hud="round">1</b>/${ROUNDS}</span>
  <span class="mgp-chip">Notes <b data-hud="len">1</b></span>
  <span class="mgp-chip">Best <b data-hud="best">0</b></span>
  <span class="mgp-spacer"></span>
  <button class="mgp-btn ghost" data-act="mute" data-el="mute">Mute</button>
  <button class="mgp-btn ghost" data-act="restart">Restart</button>
</div>
<div class="mgp-stage">
  <div class="mm-wrap">
    <div>
      <div class="mm-phase" data-el="phase">Press start to play</div>
      <div class="mm-grid" data-el="pads"></div>
    </div>
  </div>
  <div class="mgp-overlay" data-ov="start">
    <div class="mgp-card">
      <h2 class="mgp-ov-title">Music Memory</h2>
      <p class="mgp-ov-sub">The pads flash a little tune - watch and listen, then tap it back in the same order. Each round adds one note. Repeat all ${ROUNDS} rounds to win; one wrong pad ends the run.</p>
      <button class="mgp-btn" data-act="start">Start game</button>
    </div>
  </div>
  <div class="mgp-overlay" data-ov="over" hidden>
    <div class="mgp-card">
      <h2 class="mgp-ov-title" data-ov="title">Game over</h2>
      <p class="mgp-ov-sub" data-ov="reason"></p>
      <button class="mgp-btn" data-act="start">Play again</button>
    </div>
  </div>
</div>
<div class="mgp-foot"><span class="mgp-hint">Keys 1-4 tap the pads. Listen closely - the tune speeds up.</span></div>`;

            /* ---------------- refs ---------------- */
            const padsEl = $('[data-el="pads"]');
            const phaseEl = $('[data-el="phase"]');
            const hudRound = $('[data-hud="round"]');
            const hudLen = $('[data-hud="len"]');
            const hudBest = $('[data-hud="best"]');
            const ovStart = $('[data-ov="start"]');
            const ovOver = $('[data-ov="over"]');
            const ovTitle = $('[data-ov="title"]');
            const ovReason = $('[data-ov="reason"]');

            /* ---------------- state ---------------- */
            let active = false,
                started = false,
                over = false;
            let seq = [],
                round = 1,
                input = [],
                best = 0;
            let phase = "idle"; /* idle | watch | go */
            const timers = new Set();
            function after(ms, fn) {
                const id = setTimeout(() => {
                    timers.delete(id);
                    fn();
                }, ms);
                timers.add(id);
                return id;
            }
            function clearTimers() {
                for (const id of timers) clearTimeout(id);
                timers.clear();
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
                        '"><span class="mm-note">' +
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
            function setPhase(p, label) {
                phase = p;
                phaseEl.textContent = label;
                phaseEl.className =
                    "mm-phase" +
                    (p === "watch" ? " watch" : p === "go" ? " go" : "");
            }
            function updateHud() {
                hudRound.textContent = String(round);
                hudLen.textContent = String(round);
                hudBest.textContent = String(best);
            }

            /* ---------------- sequence playback ---------------- */
            function playRound() {
                input = [];
                setPhase("watch", "Watch...");
                const fl = flashMs(round);
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
                if (!active || !started || over) return;
                if (phase !== "go") return;
                lightPad(i, 160);
                input.push(i);
                const res = checkInput(input, seq.slice(0, round));
                if (res === -2) return; /* still going */
                if (res === -1) {
                    /* round complete */
                    if (round > best) best = round;
                    updateHud();
                    if (round >= ROUNDS) {
                        win();
                        return;
                    }
                    round++;
                    updateHud();
                    setPhase("idle", "Nice! Round " + round + "...");
                    after(700, () => {
                        if (started && !over) playRound();
                    });
                } else {
                    lose(res);
                }
            }
            function win() {
                over = true;
                setPhase("idle", "Flawless!");
                ovTitle.textContent = "Perfect pitch!";
                ovTitle.className = "mgp-ov-title mgp-win";
                ovReason.textContent =
                    "You repeated all " +
                    ROUNDS +
                    " rounds, " +
                    ROUNDS +
                    " notes long. Maestro!";
                ovOver.removeAttribute("hidden");
            }
            function lose(badIndex) {
                over = true;
                setPhase("idle", "Oops - wrong pad");
                ovTitle.textContent = "Wrong note";
                ovTitle.className = "mgp-ov-title mgp-lose";
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
                ovOver.removeAttribute("hidden");
            }

            /* ---------------- flow ---------------- */
            function startGame() {
                clearTimers();
                actx();
                seq = makeSequence(ROUNDS);
                round = 1;
                input = [];
                over = false;
                started = true;
                ovStart.setAttribute("hidden", "");
                ovOver.setAttribute("hidden", "");
                updateHud();
                after(400, () => {
                    if (started && !over) playRound();
                });
            }

            /* ---------------- events ---------------- */
            padsEl.addEventListener("pointerdown", (e) => {
                const el = e.target.closest
                    ? e.target.closest("[data-pad]")
                    : null;
                if (el) pressPad(Number(el.dataset.pad));
            });
            const onKey = (e) => {
                if (!active) return;
                const k = e.key;
                if (k >= "1" && k <= "4") pressPad(Number(k) - 1);
                else if (e.key === " " || e.code === "Space") {
                    e.preventDefault();
                    if (!started || over) startGame();
                }
            };
            document.addEventListener("keydown", onKey);
            app.addEventListener("click", (e) => {
                if (!active) return;
                const btn = e.target.closest
                    ? e.target.closest("[data-act]")
                    : null;
                if (!btn) return;
                const a = btn.dataset.act;
                if (a === "start" || a === "restart") startGame();
                else if (a === "mute") {
                    muted = !muted;
                    btn.textContent = muted ? "Unmute" : "Mute";
                }
            });

            /* ---------------- open / close ---------------- */
            function open() {
                active = true;
            }
            function close() {
                active = false;
                clearTimers();
                if (!over && started) {
                    setPhase(
                        "idle",
                        "Paused - press Restart to replay round " + round,
                    );
                }
            }

            buildPads();
            updateHud();
            return { open, close };
        },
    });
})();
