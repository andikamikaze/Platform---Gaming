/* ==== GAME: virtual-piano.js ==== */

/* =============================================================== */
/* Virtual Piano - music game (MGP module)                          */
/* Luminote Edition: a three-octave piano with falling lights.      */
/* Free play / Listen / Learn (new) + the original melody challenge,*/
/* sustain and octave shifting preserved as a classic mode.         */
/* =============================================================== */
(() => {
    "use strict";

    /* ---------- pure rules (exposed via _test) — preserved ---------- */
    const NAMES = [
        "C",
        "C#",
        "D",
        "D#",
        "E",
        "F",
        "F#",
        "G",
        "G#",
        "A",
        "A#",
        "B",
    ];
    const WHITE_SEMI = [0, 2, 4, 5, 7, 9, 11];
    const BASE_MIN = 3,
        BASE_MAX = 5;
    const MISTAKES = 3;

    function noteToMidi(note) {
        const m = /^([A-G]#?)(\d)$/.exec(note);
        if (!m) return null;
        return (Number(m[2]) + 1) * 12 + NAMES.indexOf(m[1]);
    }
    function noteFreq(note) {
        if (typeof note === "number") return 440 * Math.pow(2, (note - 69) / 12);
        const midi = noteToMidi(note);
        if (midi === null) return null;
        return 440 * Math.pow(2, (midi - 69) / 12);
    }
    const isBlack = (note) => note.indexOf("#") >= 0;
    /* build the 24 visible keys for a base octave: white then black interleaved by position */
    function buildKeys(base) {
        const keys = [];
        for (let oct = 0; oct < 2; oct++) {
            for (let s = 0; s < 7; s++) {
                const semi = WHITE_SEMI[s];
                keys.push({ note: NAMES[semi] + (base + oct), black: false });
                if (
                    semi === 0 ||
                    semi === 2 ||
                    semi === 5 ||
                    semi === 7 ||
                    semi === 9
                ) {
                    keys.push({
                        note: NAMES[semi + 1] + (base + oct),
                        black: true,
                    });
                }
            }
        }
        return keys;
    }
    const MELODIES = [
        {
            name: "Twinkle Twinkle",
            notes: [
                "C4",
                "C4",
                "G4",
                "G4",
                "A4",
                "A4",
                "G4",
                "F4",
                "F4",
                "E4",
                "E4",
                "D4",
                "D4",
                "C4",
            ],
        },
        {
            name: "Ode to Joy",
            notes: [
                "E4",
                "E4",
                "F4",
                "G4",
                "G4",
                "F4",
                "E4",
                "D4",
                "C4",
                "C4",
                "D4",
                "E4",
                "E4",
                "D4",
                "D4",
            ],
        },
        {
            name: "Jingle Bells",
            notes: [
                "E4",
                "E4",
                "E4",
                "E4",
                "E4",
                "E4",
                "E4",
                "G4",
                "C4",
                "D4",
                "E4",
            ],
        },
    ];
    const KEYMAP = {
        a: 0,
        w: 1,
        s: 2,
        e: 3,
        d: 4,
        f: 5,
        t: 6,
        g: 7,
        y: 8,
        h: 9,
        u: 10,
        j: 11,
        k: 14,
        o: 15,
        l: 16,
        p: 17,
    };
    const TEST = {
        NAMES,
        WHITE_SEMI,
        BASE_MIN,
        BASE_MAX,
        MISTAKES,
        noteToMidi,
        noteFreq,
        isBlack,
        buildKeys,
        MELODIES,
        KEYMAP,
    };

    /* =============================================================== */
    /* Luminote layer: midi notes, pitch colours, timed melodies        */
    /* =============================================================== */
    const LOW = 48,
        HIGH = 84;
    const PITCH_NAMES = ["C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯", "A", "A♯", "B"];
    const BLACK_PC = { 1: 1, 3: 1, 6: 1, 8: 1, 10: 1 };
    const BOFF = { 1: -0.08, 3: 0.08, 6: -0.1, 8: 0, 10: 0.1 };

    function pc(m) {
        return ((m % 12) + 12) % 12;
    }
    function isBlackMidi(m) {
        return !!BLACK_PC[pc(m)];
    }
    function nameOf(m) {
        return PITCH_NAMES[pc(m)] + (Math.floor(m / 12) - 1);
    }
    function hueOf(m) {
        return (pc(m) * 30 + 340) % 360;
    }
    function hsl(h, s, l, a) {
        return "hsla(" + h + "," + s + "%," + l + "%," + (a === undefined ? 1 : a) + ")";
    }
    function parseRef(n) {
        if (n === "-" || n === null || n === undefined) return null;
        const r = /^([A-G])(#|b)?(\d)$/.exec(String(n).trim());
        if (!r) return null;
        const base = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[r[1]] +
            (r[2] === "#" ? 1 : r[2] === "b" ? -1 : 0);
        return 12 * (+r[3] + 1) + base;
    }
    /* "E4:1 E4:1 -:0.5" → [[note, duration], ...] */
    function S(str) {
        return str.trim().split(/\s+/).map(function (tok) {
            const p = tok.split(":");
            return [p[0] === "-" ? null : p[0].replace(/\+/g, " "), parseFloat(p[1])];
        });
    }
    function seq(list, start, mel, out) {
        let t = start;
        for (let i = 0; i < list.length; i++) {
            const it = list[i];
            if (it[0]) {
                const notes = it[0].split(" ");
                for (let k = 0; k < notes.length; k++) {
                    out.push({ t: t, n: parseRef(notes[k]), d: it[1], mel: mel });
                }
            }
            t += it[1];
        }
        return t;
    }

    /* four public-domain melodies, with rhythm + accompaniment */
    const SONGS = [];
    (function () {
        const ev = [];
        let t = 0;
        const A = "E4:1 E4:1 F4:1 G4:1 G4:1 F4:1 E4:1 D4:1 C4:1 C4:1 D4:1 E4:1 ";
        t = seq(S(A + "E4:1.5 D4:0.5 D4:2"), t, true, ev);
        t = seq(S(A + "D4:1.5 C4:0.5 C4:2"), t, true, ev);
        t = seq(S("D4:1 D4:1 E4:1 C4:1 D4:1 E4:0.5 F4:0.5 E4:1 C4:1 D4:1 E4:0.5 F4:0.5 E4:1 D4:1 C4:1 D4:1 G3:2"), t, true, ev);
        t = seq(S(A + "D4:1.5 C4:0.5 C4:2"), t, true, ev);
        SONGS.push({ title: "Ode to Joy", by: "Ludwig van Beethoven · Symphony No. 9 · 1824", bpm: 108, ev: ev, len: t });
    })();
    (function () {
        const ev = [];
        let t = 0;
        const bar1 = "E5:.25 D#5:.25 E5:.25 B4:.25 D5:.25 C5:.25 ";
        t = seq(S("E5:.25 D#5:.25 " + bar1 + "A4:.5 -:.25 C4:.25 E4:.25 A4:.25 B4:.5 -:.25 E4:.25 G#4:.25 B4:.25 C5:.5 -:.25 E4:.25 E5:.25 D#5:.25 " +
            bar1 + "A4:.5 -:.25 C4:.25 E4:.25 A4:.25 B4:.5 -:.25 E4:.25 C5:.25 B4:.25 A4:1.5"), t, true, ev);
        SONGS.push({ title: "Für Elise", by: "Ludwig van Beethoven · 1810 · the opening", bpm: 84, ev: ev, len: t });
    })();
    (function () {
        const ev = [];
        let t = 0;
        const a = "C4:1 C4:1 G4:1 G4:1 A4:1 A4:1 G4:2 F4:1 F4:1 E4:1 E4:1 D4:1 D4:1 C4:2 ";
        const b = "G4:1 G4:1 F4:1 F4:1 E4:1 E4:1 D4:2 ";
        t = seq(S(a + b + b + a), t, true, ev);
        SONGS.push({ title: "Twinkle, Twinkle, Little Star", by: "Traditional · French melody first printed in 1761", bpm: 100, ev: ev, len: t });
    })();
    (function () {
        const ev = [];
        for (let b = 0; b < 12; b++) {
            const G = b % 2 === 0;
            ev.push({ t: b * 3, n: parseRef(G ? "G3" : "D3"), d: 1, mel: false });
            const ch = G ? ["B3", "D4", "F#4"] : ["A3", "C#4", "F#4"];
            for (let k = 0; k < ch.length; k++) {
                if (b >= 8 && ch[k] === "F#4") continue;
                ev.push({ t: b * 3 + 1, n: parseRef(ch[k]), d: 2, mel: false });
            }
        }
        ev.push({ t: 36, n: parseRef("G3"), d: 3, mel: false });
        ev.push({ t: 36, n: parseRef("B3"), d: 3, mel: false });
        ev.push({ t: 36, n: parseRef("D4"), d: 3, mel: false });
        seq(S("-:13 F#5:1 A5:1 G5:1 F#5:1 C#5:1 B4:1 C#5:1 D5:1 A4:3 F#4:9"), 0, true, ev);
        ev.sort(function (a, b) { return a.t - b.t || a.n - b.n; });
        SONGS.push({ title: "Gymnopédie No. 1", by: "Erik Satie · 1888 · the opening, lent et douloureux", bpm: 70, ev: ev, len: 39 });
    })();
    /* the original three challenge melodies, kept playable in Listen / Learn */
    MELODIES.forEach(function (mel) {
        const ev = [];
        let t = 0;
        mel.notes.forEach(function (n) {
            ev.push({ t: t, n: parseRef(n), d: 0.9, mel: true });
            t += 1;
        });
        SONGS.push({ title: mel.name + " (Classic)", by: "Virtual Piano challenge · simple melody", bpm: 100, ev: ev, len: t, legacy: true });
    });

    /* computer keyboard: physical codes (Luminote rows) */
    const CODE = {
        KeyZ: 48, KeyS: 49, KeyX: 50, KeyD: 51, KeyC: 52, KeyV: 53, KeyG: 54, KeyB: 55,
        KeyH: 56, KeyN: 57, KeyJ: 58, KeyM: 59, Comma: 60, KeyL: 61, Period: 62,
        Semicolon: 63, Slash: 64,
        KeyQ: 60, Digit2: 61, KeyW: 62, Digit3: 63, KeyE: 64, KeyR: 65, Digit5: 66,
        KeyT: 67, Digit6: 68, KeyY: 69, Digit7: 70, KeyU: 71, KeyI: 72, Digit9: 73,
        KeyO: 74, Digit0: 75, KeyP: 76, BracketLeft: 77, Equal: 78, BracketRight: 79,
    };
    const LABEL = {};
    (function () {
        const show = {
            KeyZ: "Z", KeyS: "S", KeyX: "X", KeyD: "D", KeyC: "C", KeyV: "V", KeyG: "G",
            KeyB: "B", KeyH: "H", KeyN: "N", KeyJ: "J", KeyM: "M",
            KeyQ: "Q", Digit2: "2", KeyW: "W", Digit3: "3", KeyE: "E", KeyR: "R",
            Digit5: "5", KeyT: "T", Digit6: "6", KeyY: "Y", Digit7: "7", KeyU: "U",
            KeyI: "I", Digit9: "9", KeyO: "O", Digit0: "0", KeyP: "P",
            BracketLeft: "[", Equal: "=", BracketRight: "]",
        };
        for (const c in show) {
            const m = CODE[c];
            if (m !== undefined && LABEL[m] === undefined) LABEL[m] = show[c];
        }
        /* legacy letters as a fallback where the new rows have no mapping */
        const oldShow = { a: "A", w: "W", s: "S", e: "E", d: "D", f: "F", t: "T", g: "G", y: "Y", h: "H", u: "U", j: "J", k: "K", o: "O", l: "L", p: "P" };
        const oldKeys = buildKeys(4);
        for (const k in oldShow) {
            const idx = KEYMAP[k];
            if (idx !== undefined && oldKeys[idx]) {
                const m = noteToMidi(oldKeys[idx].note);
                if (LABEL[m] === undefined) LABEL[m] = oldShow[k];
            }
        }
    })();

    const COL = {}, CSSC = {};
    for (let mm = LOW; mm <= HIGH; mm++) {
        const h = hueOf(mm);
        COL[mm] = { h: h, core: hsl(h, 95, 74), glow: hsl(h, 95, 62) };
        CSSC[mm] = hsl(h, 92, 64);
    }
    const WHITES = [];
    for (let q = LOW; q <= HIGH; q++) if (!isBlackMidi(q)) WHITES.push(q);

    MGP_REGISTER({
        id: "virtual-piano",
        name: "Virtual Piano",
        category: "music",
        catLabel: "Music",
        desc: "Play two octaves of synth piano, or nail a melody challenge.",
        art: '<svg viewBox="0 0 48 48" width="54" height="54" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="6" y="8" width="36" height="34" rx="3"/><path d="M6 26h36"/><path d="M13 8v18M27 8v18"/><rect x="8" y="8" width="5" height="18" fill="currentColor" stroke="none" opacity=".7"/><rect x="22" y="8" width="5" height="18" fill="currentColor" stroke="none" opacity=".7"/></svg>',
        bg: ["#fef9c3", "#eab308"],
        _test: TEST,

        build(app) {
            const $ = (s) => app.querySelector(s);
            app.classList.add("ln-root");

            /* ========================================================= */
            /* audio — original playNote() preserved, upgraded synth      */
            /* ========================================================= */
            let AC = null,
                muted = false,
                sustain = false;
            let master = null,
                comp = null,
                dry = null,
                wet = null,
                verb = null;
            const voices = Object.create(null);

            function actx() {
                if (!AC) {
                    try {
                        const Ctor = window.AudioContext || window.webkitAudioContext;
                        if (!Ctor) return null;
                        AC = new Ctor();
                        comp = AC.createDynamicsCompressor();
                        comp.threshold.value = -16;
                        comp.knee.value = 18;
                        comp.ratio.value = 4;
                        comp.attack.value = 0.004;
                        comp.release.value = 0.25;
                        master = AC.createGain();
                        master.gain.value = muted ? 0 : 0.85;
                        dry = AC.createGain();
                        dry.gain.value = 0.9;
                        wet = AC.createGain();
                        wet.gain.value = 0.34;
                        verb = AC.createConvolver();
                        verb.buffer = makeImpulse(2.8);
                        const tone = AC.createBiquadFilter();
                        tone.type = "lowpass";
                        tone.frequency.value = 5200;
                        dry.connect(comp);
                        wet.connect(verb);
                        verb.connect(tone);
                        tone.connect(comp);
                        comp.connect(master);
                        master.connect(AC.destination);
                    } catch (e) {
                        AC = null;
                    }
                }
                if (AC && AC.state === "suspended") AC.resume();
                return AC;
            }
            function makeImpulse(sec) {
                const rate = AC.sampleRate,
                    len = Math.floor(rate * sec),
                    buf = AC.createBuffer(2, len, rate);
                for (let ch = 0; ch < 2; ch++) {
                    const d = buf.getChannelData(ch);
                    let lp = 0;
                    for (let i = 0; i < len; i++) {
                        const tt = i / len;
                        const n = Math.random() * 2 - 1;
                        lp += (n - lp) * (0.35 + 0.4 * (1 - tt));
                        const er = i < rate * 0.08 && Math.random() < 0.004 ? (Math.random() * 2 - 1) * 0.8 : 0;
                        d[i] = (lp * Math.pow(1 - tt, 2.8) + er) * (1 - Math.exp(-i / (rate * 0.004)));
                    }
                }
                return buf;
            }
            const PARTIALS = [
                [1, 1, 0], [1, 0.55, 4.5], [2, 0.36, -3], [3, 0.17, 2],
                [4, 0.1, -4], [5, 0.06, 1], [6, 0.035, 0], [8, 0.015, 0],
            ];
            function voiceOn(midi, vel) {
                const c = actx();
                if (!c || muted || midi === null || midi < 12 || midi > 120) return null;
                voiceOff(midi, true);
                const t = c.currentTime,
                    f = 440 * Math.pow(2, (midi - 69) / 12);
                const out = c.createGain();
                out.gain.setValueAtTime(0, t);
                const decay = (sustain ? 2.1 : 1) * (3.4 - ((midi - LOW) / (HIGH - LOW)) * 1.9);
                const peak = 0.26 * (vel || 1);
                out.gain.linearRampToValueAtTime(peak, t + 0.005);
                out.gain.setTargetAtTime(peak * 0.55, t + 0.005, 0.08);
                out.gain.setTargetAtTime(0, t + 0.12, decay / 4.2);
                const lp = c.createBiquadFilter();
                lp.type = "lowpass";
                lp.Q.value = 0.5;
                lp.frequency.setValueAtTime(Math.min(14000, f * 16), t);
                lp.frequency.setTargetAtTime(Math.max(700, f * 3), t + 0.01, 0.35);
                const oscs = [];
                for (let i = 0; i < PARTIALS.length; i++) {
                    const p = PARTIALS[i];
                    const fr = f * p[0] * Math.pow(2, p[2] / 1200) * (1 + 0.0004 * p[0] * p[0]);
                    if (fr > 18000) continue;
                    const o = c.createOscillator(),
                        g = c.createGain();
                    o.type = "sine";
                    o.frequency.value = fr;
                    g.gain.setValueAtTime(p[1], t);
                    g.gain.setTargetAtTime(p[1] * 0.25, t + 0.02, decay / (1.5 + p[0] * 0.9));
                    o.connect(g);
                    g.connect(lp);
                    o.start(t);
                    oscs.push(o);
                }
                /* a very short filtered-noise hammer tick */
                const nb = c.createBuffer(1, Math.floor(c.sampleRate * 0.03), c.sampleRate),
                    nd = nb.getChannelData(0);
                for (let j = 0; j < nd.length; j++) nd[j] = (Math.random() * 2 - 1) * Math.pow(1 - j / nd.length, 3);
                const ns = c.createBufferSource();
                ns.buffer = nb;
                const bp = c.createBiquadFilter();
                bp.type = "bandpass";
                bp.frequency.value = Math.min(5000, Math.max(900, f * 5));
                bp.Q.value = 0.9;
                const ng = c.createGain();
                ng.gain.value = 0.12 * (vel || 1);
                ns.connect(bp);
                bp.connect(ng);
                ng.connect(out);
                ns.start(t);
                lp.connect(out);
                out.connect(dry);
                out.connect(wet);
                const stopAt = t + decay * 1.6;
                oscs.forEach(function (o) { o.stop(stopAt); });
                try { ns.stop(t + 0.05); } catch (e) { }
                const v = { out: out, oscs: oscs, end: stopAt };
                voices[midi] = v;
                return v;
            }
            function voiceOff(midi, quick) {
                const v = voices[midi];
                if (!v || !AC) return;
                const t = AC.currentTime;
                try {
                    v.out.gain.cancelScheduledValues(t);
                    v.out.gain.setValueAtTime(v.out.gain.value, t);
                    v.out.gain.setTargetAtTime(0, t, quick ? 0.015 : 0.11);
                    v.oscs.forEach(function (o) { try { o.stop(t + (quick ? 0.1 : 0.7)); } catch (e) { } });
                } catch (e) { }
                delete voices[midi];
            }
            function playNote(note, opts) {
                const c = actx();
                const midi = typeof note === "number" ? note : noteToMidi(note);
                const f = noteFreq(note);
                if (!c || muted || midi === null || f === null) return;
                voiceOn(midi, (opts && opts.vel) || 1);
            }
            function setMuted(v) {
                muted = !!v;
                paintMute();
                if (muted) {
                    for (const m in voices) voiceOff(+m, true);
                } else {
                    actx();
                }
                if (master && AC) master.gain.setTargetAtTime(muted ? 0 : 0.85, AC.currentTime, 0.05);
            }

            /* ========================================================= */
            /* markup                                                     */
            /* ========================================================= */
            app.innerHTML = `
<style>
#virtual-piano-app.mgp-app{
  --stage:#0a0a12;--ink:#ecebf5;--ink-2:#a5a3bd;--ink-3:#6c6a86;
  --glass:rgba(20,19,36,.62);--line:rgba(255,255,255,.09);--line-2:rgba(255,255,255,.16);
  --accent:#b9a8ff;--kb:clamp(116px,26vh,180px);
  padding:0;gap:0;background:var(--stage);color:var(--ink);position:relative;overflow:hidden;border-radius:14px;
  font-family:"Avenir Next",Avenir,"Segoe UI","Helvetica Neue",Arial,sans-serif;-webkit-font-smoothing:antialiased;
  -webkit-tap-highlight-color:transparent;
}
#virtual-piano-app [hidden]{display:none!important}
#virtual-piano-app .ln-app{position:relative;display:flex;flex-direction:column;width:100%;height:100%;min-height:0;overflow:hidden;background:var(--stage)}
#virtual-piano-app button,#virtual-piano-app select,#virtual-piano-app input{font:inherit;color:inherit}
#virtual-piano-app :focus-visible{outline:2px solid var(--accent);outline-offset:2px}
#virtual-piano-app .sc{font-variant-caps:all-small-caps;letter-spacing:.09em}

/* control bar */
#virtual-piano-app .ln-bar{position:relative;z-index:20;flex:0 0 auto;margin:10px 10px 0;display:flex;align-items:center;gap:8px 14px;flex-wrap:wrap;
  padding:8px 10px 8px 13px;border-radius:15px;background:var(--glass);border:1px solid var(--line);
  -webkit-backdrop-filter:blur(14px) saturate(1.3);backdrop-filter:blur(14px) saturate(1.3);
  box-shadow:0 20px 50px -30px rgba(0,0,0,.9),inset 0 1px 0 rgba(255,255,255,.06)}
#virtual-piano-app .ln-brand{display:flex;align-items:center;gap:9px;margin-right:auto;order:0}
#virtual-piano-app .ln-brand h1{margin:0;font-size:17px;font-weight:600;letter-spacing:.3em;font-variant-caps:all-small-caps;
  background:linear-gradient(90deg,#ff8fb1,#ffc07a,#c7f27a,#7ef0d9,#8fb8ff,#c9a2ff);-webkit-background-clip:text;background-clip:text;color:transparent}
#virtual-piano-app .ln-brand p{margin:0;font-size:11px;color:var(--ink-3);letter-spacing:.06em}
#virtual-piano-app .ln-grp{display:flex;align-items:center;gap:7px}
#virtual-piano-app .ln-lbl{font-size:11px;color:var(--ink-3);font-variant-caps:all-small-caps;letter-spacing:.12em}
#virtual-piano-app .ln-mode{order:1}#virtual-piano-app .ln-song{order:2}#virtual-piano-app .ln-play{order:3}
#virtual-piano-app .ln-tempo{order:4}#virtual-piano-app .ln-lab{order:5}#virtual-piano-app .ln-mute{order:6}
#virtual-piano-app .ln-seg{display:inline-flex;background:rgba(0,0,0,.35);border:1px solid var(--line);border-radius:11px;padding:3px;gap:2px}
#virtual-piano-app .ln-seg button{appearance:none;border:0;background:transparent;border-radius:8px;padding:5px 10px;cursor:pointer;color:var(--ink-2);font-size:12.5px;letter-spacing:.02em;transition:background .25s,color .25s}
#virtual-piano-app .ln-seg button:hover{color:var(--ink)}
#virtual-piano-app .ln-seg button[aria-pressed="true"]{background:linear-gradient(180deg,rgba(255,255,255,.16),rgba(255,255,255,.07));color:#fff;box-shadow:inset 0 1px 0 rgba(255,255,255,.18)}
#virtual-piano-app .ln-icon{appearance:none;width:34px;height:34px;border-radius:10px;border:1px solid var(--line-2);background:rgba(255,255,255,.05);display:grid;place-items:center;cursor:pointer;color:var(--ink);transition:background .2s,transform .15s,border-color .2s}
#virtual-piano-app .ln-icon:hover{background:rgba(255,255,255,.1);border-color:rgba(255,255,255,.28)}
#virtual-piano-app .ln-icon:active{transform:scale(.94)}
#virtual-piano-app .ln-icon:disabled{opacity:.35;cursor:not-allowed}
#virtual-piano-app .ln-icon.play{width:40px;height:40px;border-radius:50%;background:radial-gradient(circle at 35% 30%,#fff 0,#d9d2ff 35%,#9f8cff 100%);color:#15122a;border:0;box-shadow:0 0 22px rgba(185,168,255,.45)}
#virtual-piano-app .ln-icon .i-pause{display:none}
#virtual-piano-app .ln-icon.playing .i-play{display:none}
#virtual-piano-app .ln-icon.playing .i-pause{display:block}
#virtual-piano-app .ln-icon.mute .i-off{display:none}
#virtual-piano-app .ln-icon.mute.muted .i-on{display:none}
#virtual-piano-app .ln-icon.mute.muted .i-off{display:block}
#virtual-piano-app select{appearance:none;-webkit-appearance:none;background:rgba(0,0,0,.35);border:1px solid var(--line);border-radius:10px;padding:7px 28px 7px 10px;font-size:12.5px;cursor:pointer;
  background-image:linear-gradient(45deg,transparent 50%,#a5a3bd 50%),linear-gradient(135deg,#a5a3bd 50%,transparent 50%);
  background-position:calc(100% - 15px) 55%,calc(100% - 10px) 55%;background-size:5px 5px;background-repeat:no-repeat}
#virtual-piano-app select option{background:#15142a;color:#ecebf5}
#virtual-piano-app input[type=range]{appearance:none;-webkit-appearance:none;width:96px;height:4px;border-radius:4px;background:linear-gradient(90deg,#ff8fb1,#8fb8ff);outline:none;cursor:pointer}
#virtual-piano-app input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;width:15px;height:15px;border-radius:50%;background:#fff;box-shadow:0 0 0 3px rgba(185,168,255,.35),0 2px 6px rgba(0,0,0,.5)}
#virtual-piano-app input[type=range]::-moz-range-thumb{width:15px;height:15px;border-radius:50%;background:#fff;border:0;box-shadow:0 0 0 3px rgba(185,168,255,.35)}
#virtual-piano-app .ln-tempo output{min-width:38px;font-variant-numeric:tabular-nums;color:var(--ink-2);font-size:12px}
#virtual-piano-app .ln-more{display:none}

/* legacy challenge strip */
#virtual-piano-app .ln-legacy,#virtual-piano-app .ln-picker{position:relative;z-index:19;flex:0 0 auto;margin:8px 10px 0;display:flex;align-items:center;gap:7px;flex-wrap:wrap;
  padding:7px 10px;border-radius:12px;background:rgba(14,13,28,.78);border:1px solid var(--line);
  -webkit-backdrop-filter:blur(10px);backdrop-filter:blur(10px);font-size:11.5px}
#virtual-piano-app .ln-mini{padding:5px 10px;border:1px solid var(--line-2);border-radius:8px;background:rgba(255,255,255,.05);cursor:pointer;color:var(--ink-2);font-size:11.5px}
#virtual-piano-app .ln-mini:hover{background:rgba(255,255,255,.12);color:#fff}
#virtual-piano-app .ln-mini.on{background:rgba(185,168,255,.22);border-color:rgba(185,168,255,.5);color:#fff}

/* hud + coach */
#virtual-piano-app .ln-info{position:relative;z-index:10;flex:0 0 auto;display:flex;align-items:flex-start;justify-content:space-between;gap:12px;
  padding:9px 16px 0;pointer-events:none}
#virtual-piano-app .ln-hud{position:relative;pointer-events:none;max-width:min(440px,66%)}
#virtual-piano-app .ln-hud .kicker{font-size:11px;color:var(--ink-3);font-variant-caps:all-small-caps;letter-spacing:.2em}
#virtual-piano-app .ln-hud h2{margin:2px 0;font-size:clamp(20px,2.4vw,30px);font-weight:300;letter-spacing:.02em;line-height:1.1}
#virtual-piano-app .ln-hud .by{margin:0;color:var(--ink-2);font-size:12px}
#virtual-piano-app .prog{margin-top:10px;height:3px;width:200px;border-radius:3px;background:rgba(255,255,255,.1);overflow:hidden}
#virtual-piano-app .prog i{display:block;height:100%;width:0;background:linear-gradient(90deg,#ff8fb1,#ffc07a,#7ef0d9,#8fb8ff,#c9a2ff)}
#virtual-piano-app .ln-coach{position:relative;pointer-events:none;text-align:right;max-width:min(330px,54%);transition:opacity .4s}
#virtual-piano-app .ln-coach .big{font-size:clamp(30px,4vw,52px);font-weight:200;line-height:1;letter-spacing:.02em}
#virtual-piano-app .ln-coach .small{font-size:12px;color:var(--ink-2);margin-top:5px}
#virtual-piano-app .ln-coach .acc{font-size:11px;color:var(--ink-3);margin-top:2px;font-variant-numeric:tabular-nums}
#virtual-piano-app .ln-toast{position:absolute;left:50%;top:42%;z-index:55;transform:translate(-50%,-50%) scale(.96);opacity:0;pointer-events:none;
  text-align:center;padding:16px 22px;border-radius:17px;background:rgba(14,13,28,.82);border:1px solid var(--line-2);
  -webkit-backdrop-filter:blur(10px);backdrop-filter:blur(10px);transition:opacity .4s,transform .4s}
#virtual-piano-app .ln-toast.show{opacity:1;transform:translate(-50%,-50%) scale(1)}
#virtual-piano-app .ln-toast b{display:block;font-size:23px;font-weight:300;letter-spacing:.04em}
#virtual-piano-app .ln-toast span{color:var(--ink-2);font-size:12.5px}
#virtual-piano-app .ln-gate{position:absolute;left:50%;bottom:calc(var(--kb) + 26px);z-index:14;transform:translateX(-50%);display:flex;align-items:center;gap:9px;
  padding:8px 15px;border-radius:999px;cursor:pointer;background:rgba(14,13,28,.75);border:1px solid var(--line-2);color:var(--ink);font-size:12.5px;
  box-shadow:0 0 30px rgba(185,168,255,.18);animation:lnBreathe 2.8s ease-in-out infinite}
@keyframes lnBreathe{50%{box-shadow:0 0 44px rgba(185,168,255,.34)}}

/* stage + keys */
#virtual-piano-app .ln-scroller{position:relative;flex:1;min-height:0;overflow-x:auto;overflow-y:hidden;scrollbar-width:none;overscroll-behavior-x:contain}
#virtual-piano-app .ln-scroller::-webkit-scrollbar{display:none}
#virtual-piano-app .ln-world{position:relative;height:100%;display:flex;flex-direction:column;min-width:100%}
#virtual-piano-app .ln-stage{display:block;flex:1;min-height:0;width:100%;touch-action:pan-x}
#virtual-piano-app .ln-fallboard{position:relative;height:14px;flex:0 0 auto;background:linear-gradient(180deg,#1a1824 0,#0c0b12 55%,#050508 100%);
  box-shadow:0 -1px 0 rgba(255,255,255,.08),inset 0 -2px 0 #6d1a2c}
#virtual-piano-app .ln-fallboard::after{content:"";position:absolute;left:0;right:0;top:2px;height:1px;background:linear-gradient(90deg,transparent,rgba(255,255,255,.14),transparent)}
#virtual-piano-app .ln-keys{position:relative;height:var(--kb);flex:0 0 auto;background:#07070b;touch-action:none;user-select:none;-webkit-user-select:none;cursor:pointer}
#virtual-piano-app .ln-keys.legacy{height:190px;overflow:hidden}
#virtual-piano-app .key{position:absolute;top:0;display:flex;align-items:flex-end;justify-content:center}
#virtual-piano-app .key.w{height:100%;z-index:1;border-radius:0 0 7px 7px;
  background:linear-gradient(180deg,#d8d3c8 0,#f7f3ea 4%,#fbf8f1 55%,#f1ece1 88%,#e6dfd0 100%);
  box-shadow:inset 0 -9px 0 #d9d1bf,inset -1px 0 0 rgba(0,0,0,.18),inset 1px 0 0 rgba(255,255,255,.7),0 3px 4px rgba(0,0,0,.55);
  transition:transform .06s,box-shadow .08s,background .1s}
#virtual-piano-app .key.w::after{content:"";position:absolute;inset:0;border-radius:inherit;background:linear-gradient(180deg,var(--c) 0%,transparent 75%);opacity:0;transition:opacity .35s ease;mix-blend-mode:multiply;pointer-events:none}
#virtual-piano-app .key.w.down{transform:translateY(2px);background:linear-gradient(180deg,#cfc9bd 0,#efe9dd 6%,#f3eee4 60%,#e9e2d4 100%);
  box-shadow:inset 0 -4px 0 #d5ccb9,inset -1px 0 0 rgba(0,0,0,.2),0 1px 2px rgba(0,0,0,.5),0 -14px 26px -6px var(--c)}
#virtual-piano-app .key.w.down::after{opacity:.55;transition:opacity .04s}
#virtual-piano-app .key.b{height:62%;z-index:3;border-radius:0 0 5px 5px;
  background:linear-gradient(180deg,#040406 0,#23222b 6%,#15141b 60%,#0b0b10 100%);
  box-shadow:inset 0 -9px 0 1px #2c2b36,inset 0 -10px 0 1px #09090d,0 5px 7px rgba(0,0,0,.7),0 1px 1px rgba(0,0,0,.9);
  transition:transform .06s,box-shadow .08s}
#virtual-piano-app .key.b::before{content:"";position:absolute;left:18%;right:18%;top:8%;bottom:22%;border-radius:3px;
  background:linear-gradient(180deg,rgba(255,255,255,.2),rgba(255,255,255,.03) 45%,transparent);pointer-events:none}
#virtual-piano-app .key.b::after{content:"";position:absolute;inset:0;border-radius:inherit;background:linear-gradient(180deg,var(--c),transparent 80%);opacity:0;transition:opacity .35s ease;pointer-events:none}
#virtual-piano-app .key.b.down{transform:translateY(2px);
  box-shadow:inset 0 -4px 0 1px #2c2b36,inset 0 -5px 0 1px #09090d,0 2px 3px rgba(0,0,0,.7),0 0 22px 2px var(--c)}
#virtual-piano-app .key.b.down::after{opacity:.5;transition:opacity .04s}
#virtual-piano-app .key.hint.w{box-shadow:inset 0 -9px 0 #d9d1bf,inset 0 0 0 2px var(--c),0 3px 4px rgba(0,0,0,.55),0 -18px 30px -8px var(--c)}
#virtual-piano-app .key.hint.b{box-shadow:inset 0 -9px 0 1px #2c2b36,0 0 0 2px var(--c),0 0 26px 3px var(--c)}
#virtual-piano-app .key.hint{animation:lnHint 1s ease-in-out infinite}
@keyframes lnHint{50%{filter:brightness(1.12)}}
#virtual-piano-app .key.wrong{animation:lnShake .32s ease}
@keyframes lnShake{25%{transform:translateX(-3px)}75%{transform:translateX(3px)}}
#virtual-piano-app .key .nm{font-size:10px;color:#7d7668;margin-bottom:12px;pointer-events:none;font-variant-caps:all-small-caps;letter-spacing:.04em;white-space:nowrap;opacity:0;transition:opacity .3s}
#virtual-piano-app .key.b .nm{color:#a09eb4;margin-bottom:10px;font-size:9px}
#virtual-piano-app .ln-keys.labels-on .key .nm{opacity:1}
#virtual-piano-app .key .nm.c{color:#3a352d;font-weight:600}

/* original challenge keyboard, kept alive */
#virtual-piano-app .vp-w,#virtual-piano-app .vp-b{position:absolute;top:0;cursor:pointer;display:flex;align-items:flex-end;justify-content:center}
#virtual-piano-app .vp-w{width:38px;height:190px;background:linear-gradient(180deg,#d8d3c8 0,#f7f3ea 6%,#fbf8f1 70%,#e6dfd0 100%);
  border:1px solid #334155;border-radius:0 0 6px 6px;box-shadow:inset 0 -8px 0 #d9d1bf,0 3px 4px rgba(0,0,0,.6)}
#virtual-piano-app .vp-w span{position:absolute;bottom:6px;left:0;right:0;text-align:center;font-size:10px;font-weight:700;color:#7d7668}
#virtual-piano-app .vp-b{width:24px;height:116px;background:linear-gradient(180deg,#040406 0,#23222b 6%,#15141b 60%,#0b0b10 100%);
  border:1px solid #000;border-radius:0 0 5px 5px;z-index:2;box-shadow:inset 0 -8px 0 1px #2c2b36,0 5px 7px rgba(0,0,0,.7)}
#virtual-piano-app .vp-b span{position:absolute;bottom:5px;left:0;right:0;text-align:center;font-size:9px;font-weight:700;color:#a09eb4}
#virtual-piano-app .vp-w.on{background:#c7d2fe}
#virtual-piano-app .vp-b.on{background:#4f46e5}
#virtual-piano-app .vp-w.target,#virtual-piano-app .vp-b.target{background:#fef08a;animation:lnHint 1s infinite}

/* overlays / foot */
#virtual-piano-app .mgp-overlay{position:absolute;inset:0;z-index:60;background:rgba(10,10,18,.84);-webkit-backdrop-filter:blur(7px);backdrop-filter:blur(7px)}
#virtual-piano-app .mgp-card{width:min(420px,100%);padding:20px;border-radius:18px;background:linear-gradient(180deg,rgba(24,22,44,.96),rgba(14,13,28,.96));
  border:1px solid var(--line-2);box-shadow:0 30px 70px -30px #000,inset 0 1px 0 rgba(255,255,255,.07)}
#virtual-piano-app .mgp-ov-title{background:linear-gradient(90deg,#ff8fb1,#7ef0d9,#c9a2ff);-webkit-background-clip:text;background-clip:text;color:transparent}
#virtual-piano-app .mgp-ov-title.mgp-win{background:none;color:#6ee7b7;-webkit-text-fill-color:#6ee7b7}
#virtual-piano-app .mgp-ov-title.mgp-lose{background:none;color:#fca5a5;-webkit-text-fill-color:#fca5a5}
#virtual-piano-app .mgp-ov-sub{color:var(--ink-2)}
#virtual-piano-app .mgp-foot{background:#0d0c16;border:0;border-top:1px solid var(--line);border-radius:0;padding:6px 12px}
#virtual-piano-app .mgp-hint{color:var(--ink-3)}
#virtual-piano-app .vp-status{position:relative;flex:0 0 auto;height:18px;text-align:center;font-size:11.5px;font-weight:600;color:var(--ink-2)}
#virtual-piano-app .vp-status.good{color:#6ee7b7}
#virtual-piano-app .vp-status.bad{color:#fca5a5}

@media (max-width:760px){
  #virtual-piano-app .ln-bar{left:7px;right:7px;top:7px;padding:7px 8px 7px 10px;gap:6px 9px}
  #virtual-piano-app .ln-brand p{display:none}
  #virtual-piano-app .ln-brand h1{font-size:15px;letter-spacing:.24em}
  #virtual-piano-app .ln-info{padding:8px 12px 0}
  #virtual-piano-app .ln-opt{display:none}
  #virtual-piano-app .ln-bar.open .ln-opt{display:flex}
  #virtual-piano-app .ln-more{display:grid}
  #virtual-piano-app .ln-bar.open .ln-more{background:rgba(185,168,255,.2);border-color:rgba(185,168,255,.5)}
  #virtual-piano-app input[type=range]{width:76px}
}
@media (max-width:520px){
  #virtual-piano-app .ln-brand{flex:1;margin-right:0}
  #virtual-piano-app .ln-seg button{padding:5px 7px;font-size:11.5px}
  #virtual-piano-app .ln-hud h2{font-size:18px}
  #virtual-piano-app .ln-coach .big{font-size:28px}
  #virtual-piano-app .ln-gate{bottom:auto;top:44%}
  #virtual-piano-app .prog{width:140px}
}
@media (prefers-reduced-motion:reduce){
  #virtual-piano-app .ln-gate,#virtual-piano-app .key.hint,#virtual-piano-app .vp-w.target,#virtual-piano-app .vp-b.target{animation:none}
}
</style>
<div class="ln-app">
  <header class="ln-bar" data-el="bar" aria-label="Luminote controls">
    <div class="ln-brand">
      <svg width="26" height="26" viewBox="0 0 30 30" aria-hidden="true">
        <defs><linearGradient id="vpLgm" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ff8fb1"/><stop offset=".5" stop-color="#7ef0d9"/><stop offset="1" stop-color="#c9a2ff"/></linearGradient></defs>
        <rect x="5" y="3" width="6" height="16" rx="3" fill="url(#vpLgm)" opacity=".9"/>
        <rect x="13" y="7" width="6" height="12" rx="3" fill="url(#vpLgm)" opacity=".7"/>
        <rect x="21" y="1" width="6" height="18" rx="3" fill="url(#vpLgm)" opacity=".55"/>
        <rect x="3" y="22" width="25" height="5" rx="1.5" fill="#ecebf5"/>
      </svg>
      <div><h1>Luminote</h1><p>Piano with falling lights</p></div>
    </div>
    <div class="ln-grp ln-mode">
      <span class="ln-lbl" id="vpModeLbl">Mode</span>
      <div class="ln-seg" role="group" aria-labelledby="vpModeLbl">
        <button type="button" data-mode="free" aria-pressed="false">Free play</button>
        <button type="button" data-mode="listen" aria-pressed="true">Listen</button>
        <button type="button" data-mode="learn" aria-pressed="false">Learn</button>
        <button type="button" data-mode="challenge" aria-pressed="false">Challenge</button>
      </div>
    </div>
    <div class="ln-grp ln-song ln-opt">
      <label class="sc" for="vpSong" style="position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)">Melody</label>
      <select id="vpSong" data-el="song" aria-label="Melody"></select>
      <button type="button" class="ln-icon" data-act="restart" aria-label="Restart melody" title="Restart melody">
        <svg width="15" height="15" viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8 A5 5 0 1 0 5 4 M5 1.5 V4.5 H2" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </button>
    </div>
    <div class="ln-grp ln-play">
      <button type="button" class="ln-icon play playing" data-act="play" data-el="play" aria-label="Pause" title="Play / pause">
        <svg class="i-play" width="15" height="15" viewBox="0 0 16 16" aria-hidden="true"><path d="M4 2.5 L13 8 L4 13.5Z" fill="currentColor"/></svg>
        <svg class="i-pause" width="15" height="15" viewBox="0 0 16 16" aria-hidden="true"><rect x="3.5" y="2.5" width="3" height="11" rx="1" fill="currentColor"/><rect x="9.5" y="2.5" width="3" height="11" rx="1" fill="currentColor"/></svg>
      </button>
    </div>
    <div class="ln-grp ln-tempo ln-opt">
      <label class="ln-lbl" for="vpTempo">Tempo</label>
      <input type="range" id="vpTempo" data-el="tempo" min="40" max="160" step="5" value="100">
      <output data-el="tempoOut" for="vpTempo">100%</output>
    </div>
    <div class="ln-grp ln-lab ln-opt">
      <span class="ln-lbl" id="vpLabLbl">Labels</span>
      <div class="ln-seg" role="group" aria-labelledby="vpLabLbl">
        <button type="button" data-lab="off" aria-pressed="false">Off</button>
        <button type="button" data-lab="notes" aria-pressed="true">Notes</button>
        <button type="button" data-lab="keys" aria-pressed="false">Keys</button>
      </div>
    </div>
    <div class="ln-grp ln-mute">
      <button type="button" class="ln-icon mute" data-act="mutenew" data-el="mutenew" aria-pressed="false" aria-label="Mute sound" title="Mute">
        <svg class="i-on" width="17" height="17" viewBox="0 0 18 18" aria-hidden="true"><path d="M3 7 H6 L10 3.5 V14.5 L6 11 H3Z" fill="currentColor"/><path d="M12.5 6 C13.8 7.3,13.8 10.7,12.5 12 M14.6 4 C17 6.5,17 11.5,14.6 14" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>
        <svg class="i-off" width="17" height="17" viewBox="0 0 18 18" aria-hidden="true"><path d="M3 7 H6 L10 3.5 V14.5 L6 11 H3Z" fill="currentColor"/><path d="M12.5 7 L16.5 11 M16.5 7 L12.5 11" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
      </button>
      <button type="button" class="ln-icon ln-more" data-act="more" aria-expanded="false" aria-label="More settings" title="More settings">
        <svg width="17" height="17" viewBox="0 0 18 18" aria-hidden="true"><path d="M3 5 H15 M3 9 H15 M3 13 H15" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><circle cx="6" cy="5" r="1.8" fill="#15142a" stroke="currentColor" stroke-width="1.4"/><circle cx="12" cy="9" r="1.8" fill="#15142a" stroke="currentColor" stroke-width="1.4"/><circle cx="7" cy="13" r="1.8" fill="#15142a" stroke="currentColor" stroke-width="1.4"/></svg>
      </button>
    </div>
  </header>

  <div class="ln-legacy" data-el="legacy" hidden>
    <span class="mgp-chip" data-el="modechip">Free play</span>
    <span class="mgp-chip">Note <b data-hud="note">-</b></span>
    <span class="mgp-chip" data-el="melchip" hidden>Progress <b data-hud="prog">0</b>/<b data-hud="total">0</b></span>
    <span class="mgp-chip" data-el="mischip" hidden>Mistakes <b data-hud="miss">0</b>/${MISTAKES}</span>
    <span class="mgp-chip">Accuracy <b data-hud="score">0</b></span>
    <span class="mgp-spacer"></span>
    <button class="ln-mini" type="button" data-act="octdown">Oct −</button>
    <button class="ln-mini" type="button" data-act="octup">Oct +</button>
    <button class="ln-mini" type="button" data-act="sustain" data-el="sustainbtn">Sustain</button>
    <button class="ln-mini" type="button" data-act="mute" data-el="mute">Mute</button>
  </div>
  <div class="ln-picker" data-el="picker" hidden>
    <span class="ln-lbl">Classic challenge:</span>
    <button class="ln-mini" type="button" data-act="mel0">Twinkle</button>
    <button class="ln-mini" type="button" data-act="mel1">Ode to Joy</button>
    <button class="ln-mini" type="button" data-act="mel2">Jingle Bells</button>
  </div>

  <div class="ln-info">
    <div class="ln-hud" aria-live="polite">
      <div class="kicker" data-el="hudKicker">Listen · now playing</div>
      <h2 data-el="hudTitle">Für Elise</h2>
      <p class="by" data-el="hudBy">Ludwig van Beethoven · 1810 · the opening</p>
      <div class="prog" aria-hidden="true"><i data-el="progBar"></i></div>
    </div>
    <div class="ln-coach" aria-live="polite">
      <div class="big" data-el="coachBig"></div>
      <div class="small" data-el="coachSmall"></div>
      <div class="acc" data-el="coachAcc"></div>
    </div>
  </div>
  <div class="ln-toast" data-el="toast" role="status"><b data-el="toastB"></b><span data-el="toastS"></span></div>
  <button type="button" class="ln-gate" data-act="wake" data-el="gate">
    <svg width="15" height="15" viewBox="0 0 16 16" aria-hidden="true"><path d="M2 6 H5 L9 2.5 V13.5 L5 10 H2Z" fill="currentColor"/><path d="M11.5 5 C13 6.5,13 9.5,11.5 11" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>
    <span>Tap anywhere to wake the piano</span>
  </button>

  <div class="ln-scroller" data-el="scroller">
    <div class="ln-world" data-el="world">
      <canvas class="ln-stage" data-el="stage" aria-hidden="true"></canvas>
      <div class="ln-fallboard" aria-hidden="true"></div>
      <div class="ln-keys labels-on" data-el="keys" role="group" aria-label="Piano keyboard, three octaves from C3 to C6. Play with mouse or touch, or with the computer keyboard."></div>
    </div>
  </div>

  <div class="mgp-overlay" data-ov="start">
    <div class="mgp-card">
      <h2 class="mgp-ov-title">Luminote</h2>
      <p class="mgp-ov-sub">A glowing three-octave piano you can play with mouse, touch or computer keyboard. Notes fall like light in Listen mode, wait for you in Learn mode, and rise as ribbons when you play freely. The classic melody challenge, sustain and octave shift are still here under <strong>Challenge</strong>.</p>
      <button class="mgp-btn" type="button" data-act="start">Start game</button>
    </div>
  </div>
  <div class="mgp-overlay" data-ov="over" hidden>
    <div class="mgp-card">
      <h2 class="mgp-ov-title" data-ov="title">Melody done</h2>
      <p class="mgp-ov-sub" data-ov="reason"></p>
      <div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap">
        <button class="mgp-btn" type="button" data-act="free">Free play</button>
        <button class="mgp-btn ghost" type="button" data-act="retry">Retry melody</button>
        <button class="mgp-btn ghost" type="button" data-act="relearn">Try again</button>
      </div>
    </div>
  </div>
  <div class="mgp-foot"><span class="mgp-hint">Whites: Z X C V B N M , . / · Q W E R T Y U I O P — or the classic A S D F G H J K L row. Sustain lengthens notes.</span></div>
</div>`;

            /* ========================================================= */
            /* refs                                                        */
            /* ========================================================= */
            const keysEl = $('[data-el="keys"]'),
                scroller = $('[data-el="scroller"]'),
                world = $('[data-el="world"]'),
                canvas = $('[data-el="stage"]'),
                ctx = canvas.getContext("2d");
            let statusEl = $('[data-el="status"]') || document.createElement("div");
            const modeChip = $('[data-el="modechip"]'),
                melChip = $('[data-el="melchip"]'),
                misChip = $('[data-el="mischip"]'),
                hudNote = $('[data-hud="note"]'),
                hudProg = $('[data-hud="prog"]'),
                hudTotal = $('[data-hud="total"]'),
                hudMiss = $('[data-hud="miss"]'),
                hudScore = $('[data-hud="score"]');
            const ovStart = $('[data-ov="start"]'),
                ovOver = $('[data-ov="over"]'),
                ovTitle = $('[data-ov="title"]'),
                ovReason = $('[data-ov="reason"]');
            const bar = $('[data-el="bar"]'),
                songSel = $('[data-el="song"]'),
                playBtn = $('[data-el="play"]'),
                tempoEl = $('[data-el="tempo"]'),
                tempoOut = $('[data-el="tempoOut"]'),
                legacyEl = $('[data-el="legacy"]'),
                pickerEl = $('[data-el="picker"]'),
                sustainBtn = $('[data-el="sustainbtn"]'),
                muteBtnOld = $('[data-el="mute"]'),
                muteBtnNew = $('[data-el="mutenew"]'),
                gate = $('[data-el="gate"]'),
                hudK = $('[data-el="hudKicker"]'),
                hudT = $('[data-el="hudTitle"]'),
                hudB = $('[data-el="hudBy"]'),
                progBar = $('[data-el="progBar"]'),
                cBig = $('[data-el="coachBig"]'),
                cSmall = $('[data-el="coachSmall"]'),
                cAcc = $('[data-el="coachAcc"]'),
                toastEl = $('[data-el="toast"]'),
                toastB = $('[data-el="toastB"]'),
                toastS = $('[data-el="toastS"]');

            /* ========================================================= */
            /* state — original challenge state + Luminote state          */
            /* ========================================================= */
            let active = false,
                started = false,
                over = false;
            let base = 4,
                keys = [];
            let melody = -1,
                prog = 0,
                mistakes = 0;
            const st = {
                mode: "listen",
                song: 1,
                t: -1.2,
                playing: true,
                tempo: 1,
                labels: "notes",
                idx: 0,
                li: 0,
                waiting: null,
                hits: 0,
                first: true,
                misses: 0,
                done: false,
                loopAt: 0,
            };
            let EV = [];
            let W = 0, H = 0, DPR = 1, whiteW = 0, PXS = 0;
            const keyEls = {}, keyX = {}, keyW = {};
            const down = Object.create(null);
            const ptr = Object.create(null);
            const keyGlow = Object.create(null);
            const bg = document.createElement("canvas"),
                bgx = bg.getContext("2d");
            const sparks = [];
            for (let i = 0; i < 420; i++) sparks.push({ on: false });
            const bursts = [], trails = [], dust = [], timers = [];
            for (let i = 0; i < 70; i++) {
                dust.push({
                    x: Math.random(), y: Math.random(), r: 0.4 + Math.random() * 1.3,
                    v: 0.004 + Math.random() * 0.012, a: 0.05 + Math.random() * 0.18,
                    ph: Math.random() * 6.28,
                });
            }
            let rafId = 0, lastT = 0, hintPulse = 0, toastT = 0, userScrollAt = 0,
                autoScrolling = false, rzT = 0, reduce = false;
            try {
                reduce = !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
            } catch (e) { }

            /* preferences (guarded) */
            try {
                const sv = JSON.parse(localStorage.getItem("virtual-piano-luminote-prefs") || "null");
                if (sv) {
                    if (sv.labels) st.labels = sv.labels;
                    if (sv.tempo) st.tempo = sv.tempo;
                    if (typeof sv.muted === "boolean") muted = sv.muted;
                }
            } catch (e) { }
            function savePrefs() {
                try {
                    localStorage.setItem("virtual-piano-luminote-prefs", JSON.stringify({ labels: st.labels, tempo: st.tempo, muted: muted }));
                } catch (e) { }
            }
            function later(fn, ms) {
                const id = setTimeout(function () {
                    const i = timers.indexOf(id);
                    if (i >= 0) timers.splice(i, 1);
                    fn();
                }, ms);
                timers.push(id);
                return id;
            }
            function clearTimers() {
                timers.forEach(clearTimeout);
                timers.length = 0;
            }

            /* ========================================================= */
            /* keyboard rendering — original renderer kept and reused     */
            /* ========================================================= */
            function renderKeys() {
                keys = buildKeys(base);
                let html = "";
                let wi = 0;
                const per = 38.6;
                keys.forEach((k, idx) => {
                    if (!k.black) {
                        const x = 4 + wi * per;
                        html +=
                            '<div class="vp-w" data-note="' +
                            k.note +
                            '" data-idx="' +
                            idx +
                            '" style="left:' +
                            x +
                            'px"><span>' +
                            k.note +
                            "</span></div>";
                        wi++;
                    }
                });
                let wj = 0;
                keys.forEach((k, idx) => {
                    if (!k.black) {
                        wj++;
                        return;
                    }
                    const x = 4 + wj * per - 12.5;
                    html +=
                        '<div class="vp-b" data-note="' +
                        k.note +
                        '" data-idx="' +
                        idx +
                        '" style="left:' +
                        x +
                        'px"><span>' +
                        k.note.replace(/[0-9]/g, "") +
                        "</span></div>";
                });
                keysEl.innerHTML = html;
            }
            function renderLegacyKeys() {
                renderKeys();
                Array.prototype.forEach.call(keysEl.children, function (el) {
                    const m = noteToMidi(el.getAttribute("data-note"));
                    if (m !== null) {
                        el.setAttribute("data-m", String(m));
                        el.style.setProperty("--c", CSSC[m] || "#b9a8ff");
                    }
                });
                let stEl = keysEl.parentNode.querySelector(".vp-status");
                if (!stEl) {
                    stEl = document.createElement("div");
                    stEl.className = "vp-status";
                    stEl.setAttribute("data-el", "status");
                    keysEl.parentNode.insertBefore(stEl, keysEl);
                }
                stEl.textContent = statusEl.textContent || "";
                statusEl = stEl;
            }
            function buildLuminoteKeys() {
                const oldStatus = keysEl.parentNode.querySelector('.vp-status');
                if (oldStatus) oldStatus.parentNode.removeChild(oldStatus);
                keysEl.innerHTML = "";
                for (let m = LOW; m <= HIGH; m++) {
                    const d = document.createElement("div");
                    d.className = "key " + (isBlackMidi(m) ? "b" : "w");
                    d.setAttribute("data-m", String(m));
                    d.style.setProperty("--c", CSSC[m]);
                    const s = document.createElement("span");
                    s.className = "nm" + (pc(m) === 0 ? " c" : "");
                    d.appendChild(s);
                    keysEl.appendChild(d);
                    keyEls[m] = d;
                }
                paintLabels();
            }
            function measureKeys() {
                for (const m in keyEls) delete keyEls[m];
                for (const m in keyX) delete keyX[m];
                for (const m in keyW) delete keyW[m];
                Array.prototype.forEach.call(keysEl.children, function (el) {
                    let m = +(el.getAttribute("data-m") || -1);
                    if (m < 0) {
                        const n = el.getAttribute("data-note");
                        m = n ? noteToMidi(n) : -1;
                    }
                    if (m === null || m < 0) return;
                    const left = parseFloat(el.style.left) || 0;
                    const width = parseFloat(el.style.width) || el.offsetWidth || 10;
                    keyEls[m] = el;
                    keyX[m] = left + width / 2;
                    keyW[m] = width;
                });
            }
            function layout() {
                const sw = scroller.clientWidth || 600;
                const legacy = st.mode === "challenge";
                let ww;
                if (legacy) {
                    ww = 568;
                    whiteW = 38.6;
                } else {
                    const minW = sw < 640 ? 38 : 26;
                    ww = Math.max(sw, WHITES.length * minW);
                    whiteW = ww / WHITES.length;
                    const bw = whiteW * 0.6;
                    let wi = 0;
                    for (let m = LOW; m <= HIGH; m++) {
                        const el = keyEls[m];
                        if (!el) continue;
                        if (!isBlackMidi(m)) {
                            keyX[m] = wi * whiteW + whiteW / 2;
                            keyW[m] = whiteW;
                            el.style.left = (wi * whiteW + 0.5) + "px";
                            el.style.width = (whiteW - 1) + "px";
                            wi++;
                        } else {
                            const cx = wi * whiteW + BOFF[pc(m)] * whiteW;
                            keyX[m] = cx;
                            keyW[m] = bw;
                            el.style.left = (cx - bw / 2) + "px";
                            el.style.width = bw + "px";
                        }
                    }
                }
                world.style.width = ww + "px";
                W = ww;
                H = canvas.clientHeight || 240;
                DPR = Math.min(2, window.devicePixelRatio || 1);
                canvas.width = Math.round(W * DPR);
                canvas.height = Math.round(H * DPR);
                measureKeys();
                buildBackdrop();
                keysEl.style.fontSize = whiteW < 30 ? "10px" : "";
            }
            function paintLabels() {
                keysEl.classList.toggle("labels-on", st.labels !== "off");
                if (st.mode === "challenge") return;
                for (let m = LOW; m <= HIGH; m++) {
                    const el = keyEls[m];
                    if (!el || !el.firstChild) continue;
                    el.firstChild.textContent = st.labels === "keys"
                        ? LABEL[m] || ""
                        : isBlackMidi(m) ? PITCH_NAMES[pc(m)] : nameOf(m);
                }
            }
            function buildBackdrop() {
                bg.width = canvas.width;
                bg.height = canvas.height;
                const c = bgx;
                c.setTransform(DPR, 0, 0, DPR, 0, 0);
                const g = c.createLinearGradient(0, 0, 0, H);
                g.addColorStop(0, "#0a0a12");
                g.addColorStop(0.62, "#0c0b17");
                g.addColorStop(1, "#171230");
                c.fillStyle = g;
                c.fillRect(0, 0, W, H);
                const r = c.createRadialGradient(W * 0.5, H * 1.05, 10, W * 0.5, H * 1.05, Math.max(W, H) * 0.7);
                r.addColorStop(0, "rgba(140,110,255,.16)");
                r.addColorStop(1, "rgba(140,110,255,0)");
                c.fillStyle = r;
                c.fillRect(0, 0, W, H);
                for (const m in keyX) {
                    if (!isBlackMidi(+m)) continue;
                    c.fillStyle = "rgba(0,0,0,.18)";
                    c.fillRect(keyX[m] - keyW[m] / 2, 0, keyW[m], H);
                }
                const lines = st.mode === "challenge"
                    ? Object.keys(keyX).map(Number).filter(function (m) { return !isBlackMidi(m); }).sort(function (a, b) { return a - b; })
                    : WHITES;
                for (let i = 0; i <= lines.length; i++) {
                    const x = i < lines.length ? Math.round(keyX[lines[i]]) + 0.5 : W - 0.5;
                    const cn = i < lines.length && pc(lines[i]) === 0;
                    c.strokeStyle = cn ? "rgba(255,255,255,.07)" : "rgba(255,255,255,.028)";
                    c.beginPath();
                    c.moveTo(x, 0);
                    c.lineTo(x, H);
                    c.stroke();
                }
                c.font = "600 10px " + getComputedStyle(document.body).fontFamily;
                c.fillStyle = "rgba(255,255,255,.12)";
                c.textAlign = "center";
                lines.forEach(function (m) {
                    if (pc(m) === 0) c.fillText("C" + (Math.floor(m / 12) - 1), keyX[m], H - 10);
                });
            }

            /* ========================================================= */
            /* original HUD helpers — preserved                           */
            /* ========================================================= */
            function keyEl(note) {
                return keysEl.querySelector('[data-note="' + note + '"]');
            }
            function setStatus(txt, cls) {
                statusEl.textContent = txt;
                statusEl.className = "vp-status" + (cls ? " " + cls : "");
            }
            function updateHud() {
                hudProg.textContent = String(prog);
                hudTotal.textContent = melody >= 0 ? String(MELODIES[melody].notes.length) : "0";
                hudMiss.textContent = String(mistakes);
                melChip.hidden = melody < 0;
                misChip.hidden = melody < 0;
                modeChip.textContent = melody >= 0 ? "Challenge: " + MELODIES[melody].name : "Free play";
                hudScore.textContent = String(st.mode === "learn" ? st.hits : Math.round(prog / Math.max(1, MELODIES[melody >= 0 ? melody : 0].notes.length) * 100));
            }
            function clearTargets() {
                keysEl.querySelectorAll(".target").forEach(function (el) { el.classList.remove("target"); });
            }
            function markTarget() {
                clearTargets();
                if (melody < 0 || prog >= MELODIES[melody].notes.length) return;
                const el = keyEl(MELODIES[melody].notes[prog]);
                if (el) el.classList.add("target");
            }

            /* ========================================================= */
            /* original challenge logic — preserved                       */
            /* ========================================================= */
            function press(note) {
                if (!active || !started) return;
                playNote(note);
                hudNote.textContent = note;
                const el = keyEl(note);
                if (el) {
                    el.classList.add("on");
                    later(function () { el.classList.remove("on"); }, 150);
                }
                if (melody < 0 || over) return;
                const target = MELODIES[melody].notes[prog];
                if (note === target) {
                    prog++;
                    if (prog >= MELODIES[melody].notes.length) {
                        win();
                        return;
                    }
                    setStatus("Nice - " + (MELODIES[melody].notes.length - prog) + " notes to go", "good");
                } else {
                    mistakes++;
                    playNote("C2");
                    if (mistakes >= MISTAKES) {
                        lose();
                        return;
                    }
                    setStatus("Oops, that was " + note + " - aim for " + target, "bad");
                }
                updateHud();
                markTarget();
            }
            function win() {
                over = true;
                clearTargets();
                ovTitle.textContent = "Melody mastered!";
                ovTitle.className = "mgp-ov-title mgp-win";
                ovReason.textContent = MELODIES[melody].name + " played clean with " + mistakes + " wrong note" + (mistakes === 1 ? "" : "s") + ".";
                setStatus("Melody complete!", "good");
                ovOver.removeAttribute("hidden");
            }
            function lose() {
                over = true;
                clearTargets();
                ovTitle.textContent = "Too many wrongs";
                ovTitle.className = "mgp-ov-title mgp-lose";
                ovReason.textContent = "Three wrong notes in " + MELODIES[melody].name + ". You got " + prog + "/" + MELODIES[melody].notes.length + " - one more run?";
                setStatus("Challenge failed", "bad");
                ovOver.removeAttribute("hidden");
            }
            function freePlay() {
                melody = -1;
                prog = 0;
                mistakes = 0;
                over = false;
                clearTargets();
                updateHud();
                setStatus("Play anything - keys A S D F G H J K L and W E T Y U O P.");
                ovOver.setAttribute("hidden", "");
            }
            function startMelody(i) {
                melody = i;
                prog = 0;
                mistakes = 0;
                over = false;
                base = 4; /* melodies live on C4..B5 */
                renderLegacyKeys();
                layout();
                updateHud();
                markTarget();
                setStatus("Repeat " + MELODIES[i].name + " - lit key is your next note");
                ovOver.setAttribute("hidden", "");
            }
            function shiftOct(d) {
                if (melody >= 0) return; /* locked during challenge */
                const nb = Math.max(BASE_MIN, Math.min(BASE_MAX, base + d));
                if (nb !== base) {
                    base = nb;
                    renderLegacyKeys();
                    layout();
                    setStatus("Octave range: C" + base + " to B" + (base + 1));
                }
            }
            function startGame() {
                actx();
                started = true;
                gate.hidden = true;
                ovStart.setAttribute("hidden", "");
                freePlay();
            }

            /* ========================================================= */
            /* song engine — Luminote modes                               */
            /* ========================================================= */
            function song() { return SONGS[st.song] || SONGS[0]; }
            function events() { return st.mode === "learn" ? song().ev.filter(function (e) { return e.mel; }) : song().ev; }
            function bps() { return song().bpm * st.tempo / 60; }
            function learnTarget() {
                while (st.li < EV.length && EV[st.li].hit) st.li++;
                return EV[st.li] || null;
            }
            function clearHints() {
                for (const m in keyEls) keyEls[m].classList.remove("hint");
            }
            function releaseSongNotes() {
                for (const m in down) if (down[m] && down[m].song) releaseMidi(+m, "song");
            }
            function resetSong(pre) {
                releaseSongNotes();
                EV = events().map(function (e) { return { t: e.t, n: e.n, d: e.d, mel: e.mel, on: false, off: false, hit: false }; });
                st.t = pre === undefined ? -2.4 : pre;
                st.idx = 0;
                st.li = 0;
                st.waiting = null;
                st.hits = 0;
                st.misses = 0;
                st.first = true;
                st.done = false;
                st.loopAt = 0;
                clearHints();
                paintHud();
            }
            function showToast(b, s) {
                toastB.textContent = b;
                toastS.textContent = s;
                toastEl.classList.add("show");
                clearTimeout(toastT);
                toastT = setTimeout(function () { toastEl.classList.remove("show"); }, 4200);
            }
            function finishLearn() {
                st.done = true;
                const total = EV.length,
                    acc = Math.round(st.hits / total * 100);
                showToast(
                    acc >= 90 ? "Bravissimo!" : acc >= 70 ? "Molto bene" : "Well played",
                    "You found " + st.hits + " of " + total + " notes on the first try (" + acc + "%)."
                );
                clearHints();
                hudScore.textContent = String(acc);
                later(function () {
                    ovTitle.textContent = acc >= 70 ? "Bravissimo!" : "Keep practicing";
                    ovTitle.className = "mgp-ov-title " + (acc >= 70 ? "mgp-win" : "mgp-lose");
                    ovReason.textContent = st.hits + " of " + total + " notes found on the first try · " + acc + "% accuracy.";
                    ovOver.removeAttribute("hidden");
                }, 1500);
            }
            function onUserNote(m) {
                if (st.mode !== "learn" || st.done) return;
                const tg = learnTarget();
                if (!tg) return;
                const ahead = tg.t - st.t;
                if (tg.n === m && ahead <= 0.6) {
                    tg.hit = true;
                    tg.on = true;
                    if (st.first) st.hits++;
                    st.first = true;
                    st.waiting = null;
                    keyEls[m] && keyEls[m].classList.remove("hint");
                    spawnSparks(m, 22, 1.25);
                    burst(m, 1.4);
                    st.li++;
                    if (!learnTarget()) finishLearn();
                    paintCoach();
                } else if (st.waiting || ahead <= 0.6) {
                    st.first = false;
                    st.misses++;
                    const el = keyEls[m];
                    if (el) {
                        el.classList.remove("wrong");
                        void el.offsetWidth;
                        el.classList.add("wrong");
                    }
                    paintCoach();
                }
            }
            function advance(dt) {
                if (st.mode === "free" || st.mode === "challenge" || !st.playing) return;
                let nt = st.t + dt * bps();
                if (st.mode === "learn" && !st.done) {
                    const tg = learnTarget();
                    if (tg && nt >= tg.t) {
                        nt = tg.t;
                        if (!st.waiting) {
                            st.waiting = tg;
                            if (keyEls[tg.n]) keyEls[tg.n].classList.add("hint");
                            paintCoach();
                        }
                    }
                }
                st.t = nt;
                for (let i = st.idx; i < EV.length; i++) {
                    const e = EV[i];
                    if (e.t > st.t) break;
                    if (!e.on) {
                        e.on = true;
                        if (st.mode === "listen") pressMidi(e.n, "song", e.mel ? 0.86 : 0.55);
                    }
                    st.idx = i + 1;
                }
                for (let j = 0; j < EV.length; j++) {
                    const e = EV[j];
                    if (e.on && !e.off && st.t >= e.t + e.d * 0.96) {
                        e.off = true;
                        if (st.mode === "listen") releaseMidi(e.n, "song");
                    }
                }
                const sg = song();
                if (st.mode === "listen" && st.t > sg.len + 0.5) {
                    if (!st.loopAt) {
                        st.loopAt = performance.now();
                        showToast("Da capo", "The melody will begin again.");
                    }
                    if (performance.now() - st.loopAt > 2600) resetSong(-2.4);
                }
            }

            /* ========================================================= */
            /* HUD — Luminote                                              */
            /* ========================================================= */
            function paintHud() {
                const sg = song();
                if (st.mode === "free") {
                    hudK.textContent = "Free play";
                    hudT.textContent = "Play anything";
                    hudB.textContent = "Mouse, touch (several fingers at once) or your keyboard: Z…/ from C3, Q…] from C4.";
                } else if (st.mode === "challenge") {
                    hudK.textContent = "Classic · melody challenge";
                    hudT.textContent = melody >= 0 ? MELODIES[melody].name : "Challenge";
                    hudB.textContent = "Repeat the lit notes with at most " + MISTAKES + " wrong notes.";
                } else {
                    hudK.textContent = st.mode === "listen" ? "Listen · now playing" : "Learn · the melody waits for you";
                    hudT.textContent = sg.title;
                    hudB.textContent = sg.by;
                }
                progBar.parentNode.style.visibility = st.mode === "free" || st.mode === "challenge" ? "hidden" : "visible";
                paintCoach();
            }
            function paintCoach() {
                if (st.mode === "learn") {
                    const tg = learnTarget();
                    cBig.textContent = tg ? nameOf(tg.n) : "✓";
                    cBig.style.color = tg ? CSSC[tg.n] : "#ecebf5";
                    cSmall.textContent = tg
                        ? (st.waiting ? "Play the glowing key" : "Get ready…") + (LABEL[tg.n] ? " · computer key " + LABEL[tg.n] : "")
                        : "Finished";
                    cAcc.textContent = "Note " + Math.min(st.li + 1, EV.length) + " of " + EV.length + " · " + st.hits + " first-try";
                } else if (st.mode === "free") {
                    cBig.textContent = "";
                    cSmall.textContent = "Played notes rise as ribbons of light.";
                    cAcc.textContent = "";
                } else {
                    cBig.textContent = "";
                    cSmall.textContent = "";
                    cAcc.textContent = "";
                }
            }

            /* ========================================================= */
            /* press / release plumbing                                    */
            /* ========================================================= */
            function startTrail(m) {
                if (st.mode !== "free") return;
                trails.push({ m: m, bot: H, top: H, live: true });
            }
            function endTrail(m) {
                for (let i = trails.length - 1; i >= 0; i--) {
                    if (trails[i].m === m && trails[i].live) { trails[i].live = false; break; }
                }
            }
            function spawnSparks(m, n, power) {
                if (reduce) n = Math.ceil(n / 4);
                const x = keyX[m], col = COL[m];
                if (x === undefined || !col) return;
                for (let i = 0; i < n; i++) {
                    let p = null;
                    for (let k = 0; k < sparks.length; k++) if (!sparks[k].on) { p = sparks[k]; break; }
                    if (!p) return;
                    p.on = true;
                    p.x = x + (Math.random() - 0.5) * keyW[m] * 0.8;
                    p.y = H - 2;
                    const a = -Math.PI / 2 + (Math.random() - 0.5) * 1.5,
                        sp = (90 + Math.random() * 260) * power;
                    p.vx = Math.cos(a) * sp;
                    p.vy = Math.sin(a) * sp;
                    p.life = 0;
                    p.max = 0.45 + Math.random() * 0.75;
                    p.h = col.h;
                    p.r = 0.8 + Math.random() * 1.6;
                }
            }
            function burst(m, power) {
                bursts.push({ m: m, t: 0, p: power });
                if (bursts.length > 40) bursts.shift();
            }
            function pressMidi(m, src, vel) {
                if (m < LOW || m > HIGH) return;
                const was = !!down[m];
                if (!down[m]) down[m] = Object.create(null);
                down[m][src] = true;
                if (keyEls[m]) keyEls[m].classList.add("down");
                keyGlow[m] = 1;
                if (!was || src === "song") {
                    voiceOn(m, vel || 0.8);
                    spawnSparks(m, src === "song" ? 10 : 14, src === "song" ? 0.9 : 1.1);
                    burst(m, 1);
                    if (st.mode === "free" || src !== "song") startTrail(m);
                }
                if (src !== "song") onUserNote(m);
            }
            function releaseMidi(m, src) {
                if (!down[m]) return;
                delete down[m][src];
                if (Object.keys(down[m]).length) return;
                delete down[m];
                if (keyEls[m]) keyEls[m].classList.remove("down");
                voiceOff(m, false);
                endTrail(m);
            }
            function releaseAllNotes() {
                for (const m in down) {
                    Object.keys(down[m]).slice().forEach(function (s) { releaseMidi(+m, s); });
                }
                for (const m in voices) voiceOff(+m, true);
                for (const m in keyEls) keyEls[m].classList.remove("down", "hint", "wrong");
            }

            /* ========================================================= */
            /* drawing                                                     */
            /* ========================================================= */
            function rr(c, x, y, w, h, r) {
                r = Math.min(r, w / 2, h / 2);
                c.beginPath();
                c.moveTo(x + r, y);
                c.arcTo(x + w, y, x + w, y + h, r);
                c.arcTo(x + w, y + h, x, y + h, r);
                c.arcTo(x, y + h, x, y, r);
                c.arcTo(x, y, x + w, y, r);
                c.closePath();
            }
            function drawBar(m, top, bot, alpha, bright) {
                if (bot < 0 || top > H) return;
                const x = keyX[m], w = Math.max(4, keyW[m] * (isBlackMidi(m) ? 0.86 : 0.7));
                if (x === undefined) return;
                const y0 = Math.max(-20, top), y1 = Math.min(H + 10, bot);
                if (y1 - y0 < 1) return;
                const col = COL[m];
                const g = ctx.createLinearGradient(0, y0, 0, y1);
                g.addColorStop(0, hsl(col.h, 90, 62, 0.25 * alpha));
                g.addColorStop(0.7, hsl(col.h, 95, 64, 0.85 * alpha));
                g.addColorStop(1, hsl(col.h, 100, 80, alpha));
                ctx.shadowColor = hsl(col.h, 100, 62, 0.9 * alpha);
                ctx.shadowBlur = bright ? 26 : 16;
                ctx.fillStyle = g;
                rr(ctx, x - w / 2, y0, w, y1 - y0, Math.min(9, w / 2));
                ctx.fill();
                ctx.shadowBlur = 0;
                ctx.fillStyle = hsl(col.h, 100, 94, 0.42 * alpha);
                rr(ctx, x - w * 0.09, y0 + 4, w * 0.18, Math.max(0, y1 - y0 - 8), w * 0.09);
                ctx.fill();
            }
            function frame(now) {
                if (!active) { rafId = 0; return; }
                const dt = Math.min(0.05, (now - lastT) / 1000);
                lastT = now;
                advance(dt);
                const c = ctx;
                c.setTransform(DPR, 0, 0, DPR, 0, 0);
                c.globalCompositeOperation = "source-over";
                c.drawImage(bg, 0, 0, W, H);
                for (let i = 0; i < dust.length; i++) {
                    const d = dust[i];
                    if (!reduce) {
                        d.y -= d.v * dt;
                        if (d.y < -0.02) { d.y = 1.02; d.x = Math.random(); }
                    }
                    const tw = 0.6 + 0.4 * Math.sin(now / 900 + d.ph);
                    c.fillStyle = "rgba(210,200,255," + (d.a * tw).toFixed(3) + ")";
                    c.beginPath();
                    c.arc(d.x * W, d.y * H, d.r, 0, 6.283);
                    c.fill();
                }
                c.globalCompositeOperation = "lighter";
                PXS = H / 2.7;
                const ppb = PXS / bps();
                if (st.mode !== "free" && st.mode !== "challenge") {
                    for (let k = 0; k < EV.length; k++) {
                        const e = EV[k];
                        const bot = H - (e.t - st.t) * ppb;
                        const top = bot - Math.max(0.12, e.d - 0.06) * ppb;
                        if (top > H + 4) continue;
                        if (bot < -4) break;
                        let a = e.mel ? 1 : 0.62;
                        if (st.mode === "learn" && e.hit) a = 0.55;
                        drawBar(e.n, top, bot, a, st.waiting === e);
                    }
                }
                const rise = H / 2.2;
                for (let ti = trails.length - 1; ti >= 0; ti--) {
                    const tr = trails[ti];
                    tr.top -= rise * dt;
                    if (!tr.live) tr.bot -= rise * dt;
                    const fade = Math.max(0, Math.min(1, tr.bot / (H * 0.9)));
                    drawBar(tr.m, tr.top, tr.bot, 0.25 + 0.75 * fade, false);
                    if (tr.bot < -10) trails.splice(ti, 1);
                }
                for (const m in keyGlow) {
                    let gl = keyGlow[m];
                    const onNote = !!down[m];
                    if (!onNote) {
                        gl -= dt * 2.4;
                        if (gl <= 0) { delete keyGlow[m]; continue; }
                        keyGlow[m] = gl;
                    }
                    const bx = keyX[m], bw2 = keyW[m] * 1.1, bh = H * 0.42 * gl;
                    if (bx === undefined) continue;
                    const bgd = c.createLinearGradient(0, H, 0, H - bh);
                    bgd.addColorStop(0, hsl(COL[m].h, 100, 70, 0.32 * gl));
                    bgd.addColorStop(1, hsl(COL[m].h, 100, 70, 0));
                    c.fillStyle = bgd;
                    c.fillRect(bx - bw2 / 2, H - bh, bw2, bh);
                }
                for (let b = bursts.length - 1; b >= 0; b--) {
                    const bu = bursts[b];
                    bu.t += dt;
                    const life = 0.55, p = bu.t / life;
                    if (p >= 1) { bursts.splice(b, 1); continue; }
                    const R = (18 + 70 * p) * bu.p, x = keyX[bu.m];
                    if (x === undefined) continue;
                    const rg = c.createRadialGradient(x, H, 0, x, H, R);
                    rg.addColorStop(0, hsl(COL[bu.m].h, 100, 85, 0.7 * (1 - p)));
                    rg.addColorStop(0.35, hsl(COL[bu.m].h, 100, 65, 0.35 * (1 - p)));
                    rg.addColorStop(1, hsl(COL[bu.m].h, 100, 60, 0));
                    c.fillStyle = rg;
                    c.beginPath();
                    c.ellipse(x, H, R * 1.2, R * 0.75, 0, Math.PI, 0);
                    c.fill();
                }
                for (let sI = 0; sI < sparks.length; sI++) {
                    const sp = sparks[sI];
                    if (!sp.on) continue;
                    sp.life += dt;
                    if (sp.life > sp.max) { sp.on = false; continue; }
                    const ox = sp.x, oy = sp.y;
                    sp.vy += 420 * dt;
                    sp.vx *= 1 - dt * 0.8;
                    sp.x += sp.vx * dt;
                    sp.y += sp.vy * dt;
                    if (sp.y > H) { sp.on = false; continue; }
                    const lf = 1 - sp.life / sp.max;
                    c.strokeStyle = hsl(sp.h, 100, 78, lf);
                    c.lineWidth = sp.r;
                    c.lineCap = "round";
                    c.beginPath();
                    c.moveTo(ox - sp.vx * dt * 2, oy - sp.vy * dt * 2);
                    c.lineTo(sp.x, sp.y);
                    c.stroke();
                }
                const hz = c.createLinearGradient(0, 0, W, 0);
                hz.addColorStop(0, "rgba(255,143,177,.35)");
                hz.addColorStop(0.35, "rgba(126,240,217,.35)");
                hz.addColorStop(0.7, "rgba(143,184,255,.35)");
                hz.addColorStop(1, "rgba(201,162,255,.35)");
                c.fillStyle = hz;
                c.fillRect(0, H - 1.5, W, 1.5);
                c.globalCompositeOperation = "source-over";
                if (st.mode === "learn" && st.waiting) {
                    hintPulse += dt * 4;
                    const hx = keyX[st.waiting.n], hw = keyW[st.waiting.n];
                    if (hx !== undefined) {
                        c.strokeStyle = hsl(COL[st.waiting.n].h, 100, 75, 0.5 + 0.3 * Math.sin(hintPulse));
                        c.lineWidth = 2;
                        rr(c, hx - hw / 2 - 3, H - 8, hw + 6, 12, 5);
                        c.stroke();
                    }
                }
                if (st.mode !== "free" && st.mode !== "challenge") {
                    const sg = song();
                    progBar.style.width = (Math.max(0, Math.min(1, st.t / sg.len)) * 100).toFixed(1) + "%";
                }
                followScroll(dt);
                rafId = requestAnimationFrame(frame);
            }
            function startFrame() {
                if (!active || rafId) return;
                lastT = performance.now();
                rafId = requestAnimationFrame(frame);
            }
            function stopFrame() {
                if (rafId) cancelAnimationFrame(rafId);
                rafId = 0;
            }

            /* ========================================================= */
            /* auto-follow                                                  */
            /* ========================================================= */
            function followScroll(dt) {
                if (W <= scroller.clientWidth + 2 || st.mode === "free" || st.mode === "challenge" || !st.playing) return;
                if (performance.now() - userScrollAt < 3500) return;
                let sum = 0, n = 0;
                for (let i = 0; i < EV.length; i++) {
                    const e = EV[i];
                    if (e.t >= st.t - 0.5 && e.t <= st.t + 4) { sum += keyX[e.n] || 0; n++; }
                }
                if (!n) return;
                const target = Math.max(0, Math.min(W - scroller.clientWidth, sum / n - scroller.clientWidth / 2));
                const cur = scroller.scrollLeft, nx = cur + (target - cur) * Math.min(1, dt * 2.2);
                if (Math.abs(nx - cur) > 0.5) { autoScrolling = true; scroller.scrollLeft = nx; }
            }
            function centerKeys() {
                if (W > scroller.clientWidth) {
                    autoScrolling = true;
                    scroller.scrollLeft = Math.max(0, keyX[st.mode === "free" ? 60 : 64] - scroller.clientWidth * (st.mode === "free" ? 0.3 : 0.5));
                }
            }

            /* ========================================================= */
            /* mode switching + control paint                              */
            /* ========================================================= */
            function paintMode() {
                Array.prototype.forEach.call(app.querySelectorAll("[data-mode]"), function (b) {
                    b.setAttribute("aria-pressed", String(b.getAttribute("data-mode") === st.mode));
                });
                playBtn.classList.toggle("playing", st.playing);
                playBtn.setAttribute("aria-label", st.playing ? "Pause" : "Play");
                const disabled = st.mode === "free" || st.mode === "challenge";
                playBtn.disabled = disabled;
                songSel.disabled = disabled;
                legacyEl.hidden = st.mode !== "challenge";
                pickerEl.hidden = st.mode !== "challenge";
            }
            function paintMute() {
                if (muteBtnNew) {
                    muteBtnNew.classList.toggle("muted", muted);
                    muteBtnNew.setAttribute("aria-pressed", String(muted));
                    muteBtnNew.setAttribute("aria-label", muted ? "Unmute sound" : "Mute sound");
                }
                if (muteBtnOld) muteBtnOld.textContent = muted ? "Unmute" : "Mute";
            }
            function paintLabelsButtons() {
                Array.prototype.forEach.call(app.querySelectorAll("[data-lab]"), function (b) {
                    b.setAttribute("aria-pressed", String(b.getAttribute("data-lab") === st.labels));
                });
            }
            function setMode(mode) {
                st.mode = mode;
                releaseAllNotes();
                trails.length = 0;
                clearTimers();
                toastEl.classList.remove("show");
                ovOver.setAttribute("hidden", "");
                keysEl.classList.toggle("legacy", mode === "challenge");
                if (mode === "challenge") {
                    renderLegacyKeys();
                    st.playing = false;
                    over = false;
                    if (melody < 0) freePlay(); else { updateHud(); markTarget(); }
                    paintHud();
                    updateHud();
                } else {
                    buildLuminoteKeys();
                    layout();
                    resetSong(mode === "learn" ? -3.2 : -2.4);
                    st.playing = true;
                    centerKeys();
                }
                paintMode();
            }

            /* ========================================================= */
            /* input                                                        */
            /* ========================================================= */
            function keyAt(x, y) {
                const el = document.elementFromPoint(x, y);
                if (!el) return -1;
                let node = el;
                while (node && node !== keysEl) {
                    if (node.classList && node.classList.contains("key")) return +(node.getAttribute("data-m") || -1);
                    node = node.parentNode;
                }
                return -1;
            }
            keysEl.addEventListener("pointerdown", function (e) {
                if (!active) return;
                e.preventDefault();
                actx();
                gate.hidden = true;
                if (st.mode === "challenge") {
                    const el = e.target.closest ? e.target.closest("[data-note]") : null;
                    if (el) press(el.getAttribute("data-note"));
                    return;
                }
                try { keysEl.setPointerCapture(e.pointerId); } catch (err) { }
                const m = keyAt(e.clientX, e.clientY),
                    r = keysEl.getBoundingClientRect(),
                    vel = 0.55 + 0.45 * Math.min(1, (e.clientY - r.top) / r.height + 0.2);
                ptr[e.pointerId] = m;
                if (m >= 0) pressMidi(m, "p" + e.pointerId, vel);
            });
            keysEl.addEventListener("pointermove", function (e) {
                if (!(e.pointerId in ptr)) return;
                const m = keyAt(e.clientX, e.clientY),
                    old = ptr[e.pointerId];
                if (m !== old) {
                    if (old >= 0) releaseMidi(old, "p" + e.pointerId);
                    ptr[e.pointerId] = m;
                    if (m >= 0) pressMidi(m, "p" + e.pointerId, 0.7);
                }
            });
            function ptrEnd(e) {
                if (!(e.pointerId in ptr)) return;
                const m = ptr[e.pointerId];
                delete ptr[e.pointerId];
                if (m >= 0) releaseMidi(m, "p" + e.pointerId);
            }
            keysEl.addEventListener("pointerup", ptrEnd);
            keysEl.addEventListener("pointercancel", ptrEnd);
            keysEl.addEventListener("lostpointercapture", ptrEnd);
            keysEl.addEventListener("contextmenu", function (e) { e.preventDefault(); });

            const held = new Set();
            const onKey = (e) => {
                if (!active) return;
                if (e.type === "keydown") {
                    const k = (e.key || "").toLowerCase();
                    if (e.repeat) return;
                    if (st.mode !== "challenge") {
                        const m = CODE[e.code];
                        if (m !== undefined) {
                            e.preventDefault();
                            actx();
                            gate.hidden = true;
                            pressMidi(m, "k" + e.code, 0.82);
                            return;
                        }
                        if (e.key === " " || e.code === "Space") {
                            e.preventDefault();
                            if (!started) startGame();
                        }
                        return;
                    }
                    if (k in KEYMAP && keys[KEYMAP[k]]) {
                        e.preventDefault();
                        press(keys[KEYMAP[k]].note);
                        held.add(k);
                    } else if (e.key === " " || e.code === "Space") {
                        e.preventDefault();
                        if (!started) startGame();
                    }
                } else {
                    if (st.mode !== "challenge") {
                        const m = CODE[e.code];
                        if (m !== undefined) releaseMidi(m, "k" + e.code);
                    } else {
                        held.delete((e.key || "").toLowerCase());
                    }
                }
            };
            document.addEventListener("keydown", onKey);
            document.addEventListener("keyup", onKey);

            app.addEventListener("click", (e) => {
                if (!active) return;
                const btn = e.target.closest ? e.target.closest("[data-act]") : null;
                if (!btn) return;
                const a = btn.getAttribute("data-act");
                if (a === "start") startGame();
                else if (a === "free") { setMode("free"); freePlay(); }
                else if (a === "retry") { setMode("challenge"); startMelody(melody >= 0 ? melody : 0); }
                else if (a === "relearn") { setMode("learn"); }
                else if (a === "mel0") { setMode("challenge"); startMelody(0); }
                else if (a === "mel1") { setMode("challenge"); startMelody(1); }
                else if (a === "mel2") { setMode("challenge"); startMelody(2); }
                else if (a === "octdown") shiftOct(-1);
                else if (a === "octup") shiftOct(1);
                else if (a === "sustain") {
                    sustain = !sustain;
                    btn.textContent = sustain ? "Sustain on" : "Sustain";
                } else if (a === "mute") {
                    setMuted(!muted);
                } else if (a === "mutenew") {
                    setMuted(!muted);
                    savePrefs();
                } else if (a === "play") {
                    if (st.mode === "free" || st.mode === "challenge") return;
                    st.playing = !st.playing;
                    if (!st.playing) releaseSongNotes();
                    paintMode();
                } else if (a === "restart") {
                    resetSong(-2.4);
                    st.playing = true;
                    paintMode();
                    toastEl.classList.remove("show");
                    ovOver.setAttribute("hidden", "");
                } else if (a === "more") {
                    const o = !bar.classList.contains("open");
                    bar.classList.toggle("open", o);
                    btn.setAttribute("aria-expanded", String(o));
                } else if (a === "wake") {
                    actx();
                    gate.hidden = true;
                }
            });
            Array.prototype.forEach.call(app.querySelectorAll("[data-mode]"), function (b) {
                b.addEventListener("click", function () { setMode(b.getAttribute("data-mode")); });
            });
            Array.prototype.forEach.call(app.querySelectorAll("[data-lab]"), function (b) {
                b.addEventListener("click", function () {
                    st.labels = b.getAttribute("data-lab");
                    paintLabelsButtons();
                    paintLabels();
                    savePrefs();
                });
            });
            songSel.innerHTML =
                '<optgroup label="Luminote classics">' +
                SONGS.map(function (s, i) {
                    return '<option value="' + i + '"' + (i === st.song ? " selected" : "") + ">" + s.title + "</option>";
                }).join("") +
                "</optgroup>";
            songSel.value = String(st.song);
            songSel.addEventListener("change", function () {
                st.song = +this.value;
                resetSong(-2.4);
                st.playing = true;
                paintMode();
                toastEl.classList.remove("show");
            });
            tempoEl.value = String(Math.round(st.tempo * 100));
            tempoOut.textContent = tempoEl.value + "%";
            tempoEl.addEventListener("input", function () {
                st.tempo = +tempoEl.value / 100;
                tempoOut.textContent = tempoEl.value + "%";
                savePrefs();
            });
            scroller.addEventListener("scroll", function () {
                if (!autoScrolling) userScrollAt = performance.now();
                autoScrolling = false;
            }, { passive: true });
            scroller.addEventListener("pointerdown", function (e) {
                if (e.target === canvas) userScrollAt = performance.now();
            });
            window.addEventListener("blur", function () {
                for (const m in down) {
                    Object.keys(down[m]).slice().forEach(function (s) {
                        if (s !== "song") releaseMidi(+m, s);
                    });
                }
                held.clear();
            });
            function onVisibility() {
                if (document.hidden) {
                    releaseSongNotes();
                    stopFrame();
                } else {
                    lastT = performance.now();
                    startFrame();
                }
            }
            document.addEventListener("visibilitychange", onVisibility);
            window.addEventListener("resize", function () {
                clearTimeout(rzT);
                rzT = setTimeout(function () {
                    layout();
                    userScrollAt = 0;
                    centerKeys();
                }, 60);
            });

            /* ========================================================= */
            /* boot + lifecycle                                             */
            /* ========================================================= */
            buildLuminoteKeys();
            layout();
            resetSong(-1.2);
            paintMode();
            paintMute();
            paintLabelsButtons();
            updateHud();
            if (W > scroller.clientWidth) {
                autoScrolling = true;
                scroller.scrollLeft = Math.max(0, keyX[64] - scroller.clientWidth * 0.5);
            }
            function open() {
                active = true;
                H = canvas.clientHeight || H;
                startFrame();
            }
            function close() {
                active = false;
                stopFrame();
                held.clear();
                releaseAllNotes();
                clearTimers();
                clearTimeout(toastT);
                clearTimeout(rzT);
            }
            open();
            return { open, close };
        },
    });
})();
