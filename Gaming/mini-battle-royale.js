import { iconSVG } from "../JS/icons.js";

/*
 * mini-battle-royale.js — Mini Battle Royale (working title)
 * Top-down battle royale kilat: 12 pemain (kamu + 11 bot, atau 2 manusia + 10 bot
 * di mode room), 3 hero, zona menyusut, loot, leveling in-match, spektaktor,
 * hasil + reward koin, unlock hero. Target durasi match 4-6 menit.
 *
 * Cara import ke game library:
 * 1. Simpan file ini sebagai JS/games/mini-battle-royale.js (id META = nama file).
 * 2. Jalankan: node tools/build-games-manifest.mjs
 *
 * Mode:
 * - "ai"   : solo vs 11 bot (offline penuh, tanpa database).
 * - "room" : host-authoritative. Host mensimulasikan match & publish snapshot
 *            ~5x/dtk; tamu mengirim input ~10x/dtk dan merender interpolasi.
 *            (Sinkronisasi santai via Firebase — bukan netcode kompetitif.)
 *
 * Tuning cepat: HEROES/WEAPONS (damage/CD), makeZonePlan() (fase zona),
 * expNext() (kurva level), PLACE_COINS/PLACE_XP (reward), botThink() (AI).
 */
export const META = {
    id: "mini-battle-royale",
    name: "Mini Battle Royale",
    category: "arcade",
    catLabel: "Arcade",
    desc: "Battle royale kilat 12 pemain! Joystick untuk gerak, serang auto-aim (tahan & geser untuk bidik manual), skill + ultimate, potion, loot & crate, zona neon menyusut. Terakhir bertahan = menang. Desktop: WASD, Spasi serang, J/K skill, L ult, Shift dodge, 1/2 potion, E emote, I info.",
    bg: ["#22d3ee", "#a855f7"],
    bestKey: "mbrBest",
};

export function mount(root, context = {}) {
    const { mode = "ai", room = null, playerName = "Player", onExit = () => { } } = context;
    const online = mode === "room" && Boolean(room);
    const isHost = !online || Boolean(room.isHost);
    const myPid = online && !isHost ? 1 : 0;
    let roomData = (room && room.room) || null;
    let destroyed = false;

    /* ---------------- util ---------------- */
    const TAU = Math.PI * 2;
    const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
    const lerp = (a, b, t) => a + (b - a) * t;
    const dist = (ax, ay, bx, by) => Math.hypot(bx - ax, by - ay);
    const angTo = (ax, ay, bx, by) => Math.atan2(by - ay, bx - ax);
    const angDiff = (a, b) => { let d = (b - a) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return d; };
    const rnd = Math.random;
    const rndi = (a, b) => a + Math.floor(rnd() * (b - a + 1));
    const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
    const fmtT = (s) => Math.floor(s / 60) + ":" + String(Math.floor(s % 60)).padStart(2, "0");
    // PRD §4.4: inventory limit = 2 potion slots TOTAL (hp + energy combined), 1 weapon.
    const POTION_CAP = 2;
    const potionCap = (p) => ((p.ph || 0) + (p.pe || 0)) < POTION_CAP;
    const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
    const r1 = (v) => Math.round(v * 10) / 10;
    const r2 = (v) => Math.round(v * 100) / 100;
    const perfNow = () => (typeof performance !== "undefined" ? performance.now() : Date.now()) / 1000;
    const store = {
        get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
        set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { } },
    };

    /* ---------------- profil & settings (persisten) ---------------- */
    const profile = Object.assign(
        { coins: 0, matches: 0, wins: 0, hero: "max", xp: { max: 0, ted: 0, tani: 0 }, unlocked: { max: true, ted: true, tani: false } },
        store.get("mbrProfile", {})
    );
    profile.xp = Object.assign({ max: 0, ted: 0, tani: 0 }, profile.xp);
    profile.unlocked = Object.assign({ max: true, ted: true, tani: false }, profile.unlocked);
    let best = store.get("mbrBest", 0);
    const settings = Object.assign({ q: "med", size: "m", sound: true, cb: false }, store.get("mbrSettings", {}));
    const saveProfile = () => { store.set("mbrProfile", profile); store.set("mbrBest", best); };
    const saveSettings = () => store.set("mbrSettings", settings);

    /* ---------------- audio (synth kecil, aman autoplay) ---------------- */
    const SFX = (() => {
        let ctx = null, master = null;
        function ensure() {
            if (!settings.sound || destroyed) return null;
            if (!ctx) {
                try {
                    const AC = window.AudioContext || window.webkitAudioContext;
                    if (!AC) return null;
                    ctx = new AC(); master = ctx.createGain(); master.gain.value = 0.16; master.connect(ctx.destination);
                } catch (e) { return null; }
            }
            if (ctx.state === "suspended") { try { ctx.resume().catch(() => { }); } catch (e) { } }
            return ctx;
        }
        function tone(f, d, type, v, slide) {
            const c = ensure(); if (!c || destroyed) return;
            try {
                const o = c.createOscillator(), g = c.createGain(), t0 = c.currentTime;
                o.type = type; o.frequency.setValueAtTime(f, t0);
                if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, f + slide), t0 + d);
                g.gain.setValueAtTime(v, t0); g.gain.exponentialRampToValueAtTime(0.001, t0 + d);
                o.connect(g); g.connect(master); o.start(); o.stop(t0 + d + 0.02);
            } catch (e) { }
        }
        const lib = {
            shoot: () => tone(760, 0.06, "square", 0.3, -300),
            claw: () => tone(300, 0.08, "sawtooth", 0.35, -120),
            hit: () => tone(230, 0.05, "square", 0.25, -80),
            hurt: () => tone(140, 0.12, "sawtooth", 0.45, -60),
            pick: () => tone(880, 0.07, "sine", 0.35, 220),
            potion: () => tone(520, 0.15, "sine", 0.35, 180),
            lvl: () => { tone(660, 0.09, "square", 0.35); setTimeout(() => tone(880, 0.12, "square", 0.35), 90); setTimeout(() => tone(1100, 0.16, "square", 0.35), 190); },
            skill: () => tone(500, 0.1, "triangle", 0.4, 260),
            dash: () => tone(400, 0.08, "sine", 0.3, 300),
            ult: () => tone(180, 0.35, "sawtooth", 0.45, 240),
            warn: () => { tone(600, 0.12, "square", 0.35); setTimeout(() => tone(600, 0.12, "square", 0.35), 160); },
            die: () => tone(200, 0.3, "sawtooth", 0.45, -150),
            win: () => { [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => tone(f, 0.18, "square", 0.4), i * 120)); },
            click: () => tone(700, 0.04, "sine", 0.2),
            crate: () => tone(440, 0.12, "triangle", 0.45, 120),
            count: () => tone(880, 0.08, "square", 0.3),
        };
        return {
            play(n) { if (settings.sound && lib[n]) { try { lib[n](); } catch (e) { } } },
            close() { try { if (ctx) ctx.close(); } catch (e) { } ctx = null; },
        };
    })();

    /* ---------------- UI shell ---------------- */
    root.innerHTML = `
  <style>
    .mbr-app{--cs:1;flex:1 1 auto;min-height:0;display:flex;flex-direction:column;gap:10px;position:relative;font-family:ui-rounded,"Segoe UI",system-ui,sans-serif;color:#e8ecff;touch-action:none;user-select:none;-webkit-user-select:none}
    .mbr-app [hidden]{display:none!important}
    .mbr-app.size-s{--cs:.82}.mbr-app.size-l{--cs:1.16}
    .mbr-board{position:relative;width:100%;aspect-ratio:16/9;flex:1 1 auto;min-height:0;padding:0;border:0;border-radius:16px;overflow:hidden;background:#0b1020}
    .mbr-app.game-fill>.mbr-board{flex:1 1 auto;min-height:0;aspect-ratio:auto}
    .mbr-app canvas.mbr-cv{position:absolute;inset:0;width:100%;height:100%;display:block}
    /* HUD bar: info chips + icon controls, above the board */
    .mbr-hud{display:flex;align-items:center;gap:8px;flex-wrap:wrap;flex:none;font:700 11px/1 ui-monospace,SFMono-Regular,Menlo,monospace}
    .mbr-spacer{flex:1 1 auto}
    .mbr-hud .mbr-btn{position:relative;display:inline-flex;align-items:center;gap:6px;border-radius:9px;padding:6px 10px;min-height:32px;font-size:10px;border:1px solid rgba(255,255,255,.22);background:rgba(16,22,44,.9);color:#e8ecff;white-space:nowrap}
    .mbr-hud .mbr-btn svg{flex:none;display:block}
    .mbr-hud .mbr-btn:disabled{opacity:.45;cursor:not-allowed}
    .mbr-chip{background:rgba(10,14,30,.72);border:1px solid rgba(255,255,255,.16);border-radius:999px;padding:3px 10px;font-weight:700;white-space:nowrap}
    .mbr-worldhud{position:absolute;inset:0;pointer-events:none;font-size:12px}
    .mbr-topc{position:absolute;top:8px;left:50%;transform:translateX(-50%);display:flex;gap:6px;align-items:center}
    .mbr-topc .warn{color:#fda4af;border-color:#f43f5e;animation:mbrPulse 1s infinite}
    @keyframes mbrPulse{50%{opacity:.55}}
    .mbr-topr{position:absolute;top:8px;right:8px;display:flex;flex-direction:column;align-items:flex-end;gap:4px}
    .mbr-feed{display:flex;flex-direction:column;align-items:flex-end;gap:2px;margin-top:4px;max-width:46vw}
    .mbr-feed div{background:rgba(10,14,30,.6);border-radius:8px;padding:2px 8px;font-size:11px;color:#cbd5e1}
    .mbr-mini{position:absolute;top:8px;left:8px;width:108px;height:108px;border-radius:50%;border:2px solid rgba(34,211,238,.5);background:rgba(10,14,30,.8)}
    .mbr-banner{position:absolute;top:52px;left:50%;transform:translateX(-50%);display:flex;flex-direction:column;gap:4px;align-items:center;text-align:center}
    .mbr-banner div{background:rgba(10,14,30,.85);border:1px solid rgba(34,211,238,.5);color:#a5f3fc;border-radius:10px;padding:4px 14px;font-weight:800;font-size:13px;animation:mbrPop .25s}
    .mbr-banner div.gold{border-color:#fbbf24;color:#fde68a}
    .mbr-banner div.red{border-color:#f43f5e;color:#fecdd3}
    @keyframes mbrPop{from{transform:scale(.6);opacity:0}}
    .mbr-count{position:absolute;top:38%;left:50%;transform:translate(-50%,-50%);font-size:72px;font-weight:900;color:#a5f3fc;text-shadow:0 0 24px #22d3ee}
    .mbr-net{position:absolute;left:6px;bottom:2px;font-size:10px;color:#94a3b8;display:flex;gap:8px}
    .mbr-lv{position:absolute;right:6px;bottom:2px;width:150px;font-size:10px;text-align:right}
    .mbr-lv .bar{height:5px;background:rgba(255,255,255,.15);border-radius:4px;overflow:hidden;margin-top:2px}
    .mbr-lv .bar i{display:block;height:100%;background:linear-gradient(90deg,#a855f7,#22d3ee);width:0%}
    .mbr-selfhp{position:absolute;left:50%;transform:translateX(-50%);bottom:calc(62px*var(--cs));width:min(240px,50vw);pointer-events:none}
    .mbr-selfhp .bar{height:10px;background:rgba(255,255,255,.14);border-radius:6px;overflow:hidden;border:1px solid rgba(255,255,255,.25);position:relative}
    .mbr-selfhp .bar i{display:block;height:100%;background:#22d3ee;width:100%}
    .mbr-selfhp .bar b{position:absolute;inset:0;background:#60a5fa;width:0%;opacity:.85}
    .mbr-selfhp span{font-size:10px;font-weight:700;text-shadow:0 1px 2px #000}
    .mbr-app.cb .mbr-selfhp .bar i{background:#3b82f6}
    /* controls & spectator are siblings AFTER the board, not overlays on the canvas */
    .mbr-ctrl{position:relative;inset:auto;width:100%;height:calc(236px*var(--cs));margin-top:2px;pointer-events:none;flex:none}
    .mbr-joy{position:absolute;left:8px;bottom:calc(34px*var(--cs));width:calc(150px*var(--cs));height:calc(150px*var(--cs));pointer-events:auto;touch-action:none}
    .mbr-joy .base{position:absolute;width:calc(110px*var(--cs));height:calc(110px*var(--cs));border-radius:50%;background:rgba(255,255,255,.07);border:2px solid rgba(255,255,255,.22);left:calc(20px*var(--cs));top:calc(20px*var(--cs));opacity:.6}
    .mbr-joy .knob{position:absolute;width:calc(52px*var(--cs));height:calc(52px*var(--cs));border-radius:50%;background:rgba(34,211,238,.5);border:2px solid #22d3ee;left:calc(49px*var(--cs));top:calc(49px*var(--cs))}
    .mbr-ctrl .mbr-btn{position:absolute;pointer-events:auto;border-radius:50%;border:2px solid rgba(255,255,255,.3);background:rgba(16,22,44,.78);color:#fff;display:flex;align-items:center;justify-content:center;font-size:calc(22px*var(--cs));cursor:pointer;touch-action:none;overflow:hidden;padding:0}
    .mbr-ctrl .mbr-btn:active{transform:scale(.93)}
    .mbr-ctrl .mbr-btn .cool{position:absolute;left:0;bottom:0;width:100%;height:0%;background:rgba(0,0,0,.62);pointer-events:none}
    .mbr-ctrl .mbr-btn .cdtxt{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-weight:900;font-size:calc(15px*var(--cs));color:#fda4af;pointer-events:none}
    .mbr-ctrl .mbr-btn .ico{position:relative;pointer-events:none;line-height:1}
    .mbr-ctrl .mbr-btn .cnt{position:absolute;bottom:2px;right:6px;font-size:calc(11px*var(--cs));font-weight:900;color:#fde68a;pointer-events:none}
    .mbr-ctrl .mbr-btn.ready{border-color:#fbbf24;box-shadow:0 0 14px rgba(251,191,36,.7);animation:mbrPulse 1.2s infinite}
    .mbr-atk{right:calc(14px*var(--cs));bottom:calc(64px*var(--cs));width:calc(84px*var(--cs));height:calc(84px*var(--cs));font-size:calc(34px*var(--cs));border-color:rgba(244,63,94,.7);background:rgba(80,20,40,.8)}
    .mbr-s1{right:calc(110px*var(--cs));bottom:calc(40px*var(--cs));width:calc(54px*var(--cs));height:calc(54px*var(--cs))}
    .mbr-s2{right:calc(120px*var(--cs));bottom:calc(106px*var(--cs));width:calc(54px*var(--cs));height:calc(54px*var(--cs))}
    .mbr-ult{right:calc(36px*var(--cs));bottom:calc(162px*var(--cs));width:calc(62px*var(--cs));height:calc(62px*var(--cs));border-color:#a855f7}
    .mbr-dodge{right:calc(176px*var(--cs));bottom:calc(58px*var(--cs));width:calc(46px*var(--cs));height:calc(46px*var(--cs));font-size:calc(18px*var(--cs))}
    .mbr-pots{position:absolute;left:50%;transform:translateX(-50%);bottom:calc(6px*var(--cs));display:flex;gap:10px;pointer-events:none}
    .mbr-pots .mbr-btn{position:relative;width:calc(46px*var(--cs));height:calc(46px*var(--cs));font-size:calc(20px*var(--cs))}
    .mbr-side{position:absolute;right:6px;top:38%;display:flex;flex-direction:column;gap:8px;pointer-events:none}
    .mbr-side .mbr-btn{position:relative;width:calc(38px*var(--cs));height:calc(38px*var(--cs));font-size:calc(16px*var(--cs))}
    .mbr-spect{position:relative;left:auto;transform:none;bottom:auto;width:max-content;margin:8px auto 0;display:flex;gap:6px;align-items:center;pointer-events:auto;background:rgba(10,14,30,.85);border:1px solid rgba(255,255,255,.2);border-radius:12px;padding:6px 10px;font-size:12px;flex:none}
    .mbr-spect button,.mbr-mini-btn{background:#1c2745;color:#e8ecff;border:1px solid rgba(255,255,255,.25);border-radius:8px;padding:4px 10px;font-weight:700;cursor:pointer;font-size:12px}
    .mbr-screen{position:absolute;inset:0;background:radial-gradient(120% 120% at 50% 0%,#1b2547 0%,#0b1020 70%);display:flex;flex-direction:column;align-items:center;padding:16px;overflow-y:auto;gap:12px;z-index:5}
    .mbr-screen h3{margin:4px 0;font-size:22px;letter-spacing:.5px}
    .mbr-cards{display:flex;gap:10px;flex-wrap:wrap;justify-content:center;max-width:640px}
    .mbr-card{width:170px;background:#141a2e;border:2px solid rgba(255,255,255,.14);border-radius:14px;padding:10px;cursor:pointer;position:relative;transition:transform .12s}
    .mbr-card:hover{transform:translateY(-3px)}
    .mbr-card.sel{border-color:#22d3ee;box-shadow:0 0 16px rgba(34,211,238,.45)}
    .mbr-card .av{font-size:40px;text-align:center}
    .mbr-card h4{margin:4px 0 2px;font-size:15px;text-align:center}
    .mbr-card .role{font-size:10px;color:#93c5fd;text-align:center;font-weight:700;text-transform:uppercase;letter-spacing:.6px}
    .mbr-card .kit{font-size:10.5px;color:#cbd5e1;margin-top:6px;line-height:1.5}
    .mbr-card .lock{position:absolute;inset:0;background:rgba(5,8,18,.82);border-radius:12px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;font-size:12px}
    .mbr-card .lock button{background:#fbbf24;color:#1c1917;border:none;border-radius:8px;padding:6px 10px;font-weight:800;cursor:pointer}
    .mbr-card .lock button:disabled{opacity:.45;cursor:default}
    .mbr-big{background:linear-gradient(90deg,#22d3ee,#a855f7);color:#08101f;border:none;border-radius:14px;padding:12px 34px;font-size:17px;font-weight:900;cursor:pointer;letter-spacing:.5px}
    .mbr-big:disabled{opacity:.5;cursor:default}
    .mbr-ghost{background:transparent;color:#cbd5e1;border:1px solid rgba(255,255,255,.3);border-radius:12px;padding:9px 20px;font-weight:700;cursor:pointer}
    .mbr-row{display:flex;gap:10px;flex-wrap:wrap;justify-content:center;align-items:center}
    .mbr-stat{font-size:12px;color:#94a3b8}
    .mbr-qnames{display:flex;flex-wrap:wrap;gap:6px;max-width:420px;justify-content:center}
    .mbr-qnames span{background:#141a2e;border:1px solid rgba(255,255,255,.15);border-radius:999px;padding:3px 10px;font-size:11px;animation:mbrPop .2s}
    .mbr-res{background:#141a2e;border:1px solid rgba(255,255,255,.15);border-radius:16px;padding:16px 20px;width:min(400px,92%);text-align:center}
    .mbr-res .place{font-size:44px;font-weight:900;line-height:1.1}
    .mbr-res .place.win{color:#fbbf24;text-shadow:0 0 22px rgba(251,191,36,.8)}
    .mbr-res table{width:100%;font-size:13px;margin:10px 0;border-collapse:collapse}
    .mbr-res td{padding:3px 4px;border-bottom:1px dashed rgba(255,255,255,.08);text-align:left}
    .mbr-res td:last-child{text-align:right;font-weight:800}
    .mbr-info{position:absolute;inset:0;background:rgba(5,8,18,.9);z-index:6;display:flex;align-items:center;justify-content:center;padding:14px}
    .mbr-info .box{background:#141a2e;border:1px solid rgba(255,255,255,.2);border-radius:14px;padding:14px 16px;width:min(430px,96%);max-height:92%;overflow-y:auto;font-size:12px;line-height:1.55}
    .mbr-info h4{margin:8px 0 4px;color:#a5f3fc;font-size:13px}
    .mbr-info table{width:100%;border-collapse:collapse;font-size:11px}
    .mbr-info td{padding:2px 4px;border-bottom:1px dashed rgba(255,255,255,.08)}
    .mbr-info select,.mbr-info input[type=checkbox]{accent-color:#22d3ee}
    .mbr-info select{background:#0b1020;color:#fff;border:1px solid rgba(255,255,255,.3);border-radius:6px;padding:2px 6px}
    .mbr-set{display:flex;gap:12px;flex-wrap:wrap;align-items:center;margin:6px 0}
    /* modal overlays: pause / cheats / internal help */
    .mbr-ov{position:absolute;inset:0;z-index:7;display:grid;place-items:center;padding:14px;background:rgba(5,8,18,.9)}
    .mbr-ovcard{display:flex;flex-direction:column;overflow:hidden;max-height:100%;width:min(620px,100%);background:#141a2e;border:1px solid rgba(255,255,255,.2);border-radius:14px;padding:14px 16px;font-size:12px;line-height:1.5}
    .mbr-ovhead{display:flex;align-items:center;justify-content:space-between;gap:10px;flex:none}
    .mbr-ovhead h3{margin:0;font-size:16px;color:#a5f3fc}
    .mbr-ovfoot{display:flex;align-items:center;justify-content:space-between;gap:10px;flex:none;margin-top:12px}
    .mbr-note{font-size:10px;color:#94a3b8}
    .mbr-help,.mbr-cheatgrid{flex:1 1 auto;min-height:0;overflow:auto}
    .mbr-help{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:14px}
    .mbr-help b{display:block;margin:8px 0 4px;color:#a5f3fc;font-size:12px}
    .mbr-help ul{margin:0 0 10px;padding-left:16px;color:#cbd5e1;font-size:11px;line-height:1.6}
    .mbr-cheatgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:8px;padding-top:10px}
    [hidden]{display:none!important}
    /* mobile overrides LAST: beat pointer:coarse 44px with .mbr-app .mbr-hud .mbr-btn */
    @media (max-width:640px){
      .mbr-app.game-fill>.mbr-board:not(:has(.mbr-screen:not([hidden]),.mbr-info:not([hidden]),.mbr-ov:not([hidden]))){aspect-ratio:16/9;flex:0 0 auto}
      .mbr-app.game-fill>.mbr-board:has(.mbr-screen:not([hidden]),.mbr-info:not([hidden]),.mbr-ov:not([hidden])){aspect-ratio:auto;flex:0 0 auto;min-height:min(70dvh,620px)}
      .mbr-app .mbr-hud{gap:5px;margin-bottom:0}
      .mbr-app .mbr-hud .mbr-chip{padding:4px 6px;font-size:9px}
      .mbr-app .mbr-hud .mbr-chip[data-hudspec],.mbr-app .mbr-hud .mbr-chip[data-hudkeys],.mbr-app .mbr-hud .mbr-chip[data-hudpot]{display:none}
      .mbr-app .mbr-hud .mbr-btn{min-height:32px;padding:5px 9px;font-size:9px;border-radius:8px}
      .mbr-app .mbr-hud .mbr-btn-label,.mbr-app .mbr-hud .mbr-spacer{display:none}
      .mbr-app .mbr-ctrl{height:calc(196px*var(--cs))}
      .mbr-app .mbr-ov{padding:8px}
      .mbr-app .mbr-ovcard{width:100%;height:100%;max-height:100%;padding:12px;border-radius:12px}
      .mbr-app .mbr-help,.mbr-app .mbr-cheatgrid{scrollbar-width:none}
      .mbr-app .mbr-help::-webkit-scrollbar,.mbr-app .mbr-cheatgrid::-webkit-scrollbar{display:none}
      .mbr-app .mbr-ovfoot{position:static;margin:10px 0 0;padding:10px 0 0;border-top:1px solid rgba(255,255,255,.14)}
      .mbr-app .mbr-note{display:none}
    }
  </style>
  <div class="game-app mbr-app game-fill" data-mbr-app>
    <div class="mbr-hud">
      <span class="mbr-chip">👥 <b data-hudalive>12</b></span>
      <span class="mbr-chip">⚔️ <b data-hudkills>0</b></span>
      <span class="mbr-chip">👁 <b data-hudspec>0</b></span>
      <span class="mbr-chip" data-hudzonet>⏱ 0:00</span>
      <span class="mbr-chip">🗝 <b data-hudkeys>0</b></span>
      <span class="mbr-chip">🪙 <b data-hudcoins>0</b></span>
      <span class="mbr-chip">🧪 <b data-hudpot>1/2</b></span>
      <span class="mbr-chip">🏆 <b data-hudbest>0</b></span>
      <span class="mbr-spacer"></span>
      <button class="mbr-btn" type="button" data-help aria-label="Cara bermain" title="Cara bermain (H)">${iconSVG("helpCircle", { size: 14 })}<span class="mbr-btn-label">Bantuan</span></button>
      <button class="mbr-btn" type="button" data-cheats aria-label="Cheat" title="Cheat (C)">${iconSVG("wrench", { size: 14 })}<span class="mbr-btn-label">Cheat</span></button>
      <button class="mbr-btn" type="button" data-pause aria-label="Jeda" title="Jeda (P)">${iconSVG("pause", { size: 14 })}<span class="mbr-btn-label">Jeda</span></button>
      <button class="mbr-btn" type="button" data-restart aria-label="Ulangi" title="Ulangi (R)">${iconSVG("refresh", { size: 14 })}<span class="mbr-btn-label">Ulangi</span></button>
      <button class="mbr-btn" type="button" data-exit aria-label="Keluar" title="Keluar">${iconSVG("logOut", { size: 14 })}<span class="mbr-btn-label">Keluar</span></button>
    </div>
    <section class="game-panel mbr-board" data-board>
      <canvas class="mbr-cv" data-cv></canvas>
      <div class="mbr-worldhud" data-hud hidden>
        <canvas class="mbr-mini" data-mini width="108" height="108"></canvas>
        <div class="mbr-topc">
          <span class="mbr-chip">👥 <b data-alive>12</b></span>
          <span class="mbr-chip">⚔️ <b data-kills>0</b></span>
          <span class="mbr-chip">👁 <b data-spec>0</b></span>
          <span class="mbr-chip" data-zonet>⏱ 0:00</span>
        </div>
        <div class="mbr-topr">
          <div class="mbr-row" style="gap:6px">
            <span class="mbr-chip">🗝 <b data-keys>0</b></span>
            <span class="mbr-chip">🪙 <b data-coins>0</b></span>
          </div>
          <div class="mbr-feed" data-feed></div>
        </div>
        <div class="mbr-banner" data-banner></div>
        <div class="mbr-count" data-count></div>
        <div class="mbr-selfhp" data-selfhp><span data-hptext>100/100</span><div class="bar"><i data-hpfill></i><b data-shfill></b></div></div>
        <div class="mbr-net" data-net><span data-ping>📶 LOKAL</span><span data-batt></span></div>
        <div class="mbr-lv"><b data-lv>LV.1</b> <span data-exptext>0/50 EXP</span><div class="bar"><i data-expfill></i></div></div>
      </div>
      <div class="mbr-screen" data-lobby></div>
      <div class="mbr-screen" data-queue hidden>
        <h3>🔎 Mencari Pertandingan…</h3>
        <div class="mbr-stat" data-qfill>1/12 pemain</div>
        <div class="mbr-qnames" data-qnames></div>
        <button class="mbr-ghost" type="button" data-qcancel>Batalkan</button>
      </div>
      <div class="mbr-screen" data-results hidden></div>
      <div class="mbr-info" data-info hidden><div class="box" data-infobox></div></div>
      <div class="mbr-ov" data-ov="pause" hidden>
        <div class="mbr-ovcard">
          <div class="mbr-ovhead"><h3>Jeda</h3></div>
          <div class="mbr-ovfoot"><span class="mbr-note">Simulasi, efek &amp; zona dibekukan.</span><button class="mbr-big" type="button" data-resume>Lanjutkan</button></div>
        </div>
      </div>
      <div class="mbr-ov" data-ov="cheat" hidden>
        <div class="mbr-ovcard">
          <div class="mbr-ovhead"><h3>Cheat (host)</h3><button class="mbr-ghost" type="button" data-cheatclose>Tutup</button></div>
          <div class="mbr-cheatgrid" data-cheatgrid>
            <button class="mbr-ghost" type="button" data-cheat="hp">+HP penuh</button>
            <button class="mbr-ghost" type="button" data-cheat="coins">+200 🪙</button>
            <button class="mbr-ghost" type="button" data-cheat="exp">+50 EXP</button>
            <button class="mbr-ghost" type="button" data-cheat="crate">📦 Spawn crate</button>
          </div>
        </div>
      </div>
      <div class="mbr-ov" data-ov="help" hidden>
        <div class="mbr-ovcard">
          <div class="mbr-ovhead"><h3>Cara bermain</h3><button class="mbr-ghost" type="button" data-help-close>Tutup</button></div>
          <div class="mbr-help">
            <div>
              <b>Desktop</b>
              <ul>
                <li>WASD / panah — gerak</li>
                <li>Spasi (tahan) — serang auto-aim; geser untuk bidik manual</li>
                <li>J / K / L — skill 1, skill 2, ultimate</li>
                <li>Shift — dodge · 1 / 2 — potion · E — emote · I — info zona</li>
                <li>P / Esc — jeda · C — cheat · H — bantuan · R — ulangi</li>
              </ul>
              <b>Mobile</b>
              <ul>
                <li>Joystick kiri — gerak; tombol kanan — serang &amp; skill</li>
                <li>Tombol potion di tengah bawah — total maksimal 2 potion</li>
                <li>Tombol ℹ️ di sisi kanan — info zona &amp; pengaturan</li>
              </ul>
            </div>
            <div>
              <b>Aturan</b>
              <ul>
                <li>12 pemain free-for-all; yang terakhir bertahan menang.</li>
                <li>Zona neon menyusut tiap menit — tetap di dalam zona!</li>
                <li>Kill &amp; pickup memberi EXP; naik level menambah HP &amp; damage.</li>
                <li>Loot: potion (maks 2 total), koin, kunci, crate &amp; senjata.</li>
                <li>Tereliminasi = mode spektaktor; peringkat tetap dapat reward.</li>
              </ul>
              <div class="mbr-ovfoot"><span class="mbr-note">Tekan H untuk membuka lagi</span><button class="mbr-big" type="button" data-help-close>Mengerti</button></div>
            </div>
          </div>
        </div>
      </div>
    </section>
    <div class="mbr-ctrl" data-ctrl>
      <div class="mbr-joy" data-joy><div class="base" data-joybase></div><div class="knob" data-joyknob></div></div>
      <button class="mbr-btn mbr-atk" data-atk type="button"><span class="ico" data-atkico>🔫</span></button>
      <button class="mbr-btn mbr-s1" data-s1 type="button"><span class="ico" data-s1ico>💨</span><span class="cool" data-s1cool></span><span class="cdtxt" data-s1txt></span></button>
      <button class="mbr-btn mbr-s2" data-s2 type="button"><span class="ico" data-s2ico>🛡️</span><span class="cool" data-s2cool></span><span class="cdtxt" data-s2txt></span></button>
      <button class="mbr-btn mbr-ult" data-ult type="button"><span class="ico" data-ultico>⚡</span><span class="cool" data-ultcool></span><span class="cdtxt" data-ulttxt></span></button>
      <button class="mbr-btn mbr-dodge" data-dodge type="button"><span class="ico">🌀</span><span class="cool" data-dodgecool></span><span class="cdtxt" data-dodgetxt></span></button>
      <div class="mbr-pots">
        <button class="mbr-btn" data-ph type="button"><span class="ico">🧪</span><span class="cnt" data-phn>1</span></button>
        <button class="mbr-btn" data-pe type="button"><span class="ico">🔋</span><span class="cnt" data-pen>0</span></button>
      </div>
      <div class="mbr-side">
        <button class="mbr-btn" data-info-btn type="button"><span class="ico">ℹ️</span></button>
        <button class="mbr-btn" data-emote type="button"><span class="ico">😄</span></button>
      </div>
    </div>
    <div class="mbr-spect" data-spect hidden>
      <span>👁 <b data-specname>-</b></span>
      <button type="button" data-specprev>◀</button>
      <button type="button" data-specnext>▶</button>
      <button type="button" data-specres>Hasil</button>
    </div>
  </div>`;
    const $ = (s) => root.querySelector(s);
    const app = $(".mbr-app"), board = $("[data-board]"), cv = $("[data-cv]"), mini = $("[data-mini]");
    const ov = { pause: $("[data-ov='pause']"), cheat: $("[data-ov='cheat']"), help: $("[data-ov='help']") };
    const el = {};
    ["hud", "alive", "kills", "spec", "zonet", "keys", "coins", "feed", "banner", "count", "selfhp", "hptext", "hpfill", "shfill", "net", "ping", "batt", "lv", "exptext", "expfill", "ctrl", "joy", "joybase", "joyknob", "atk", "atkico", "s1", "s1ico", "s1cool", "s1txt", "s2", "s2ico", "s2cool", "s2txt", "ult", "ultico", "ultcool", "ulttxt", "dodge", "dodgecool", "dodgetxt", "ph", "phn", "pe", "pen", "emote", "spect", "specname", "lobby", "queue", "qfill", "qnames", "results", "info", "infobox", "hudalive", "hudkills", "hudspec", "hudzonet", "hudkeys", "hudcoins", "hudpot", "hudbest"].forEach((k) => { el[k] = $("[data-" + k + "]"); });
    const ctx = cv.getContext("2d"), mctx = mini.getContext("2d");

    /* ---------------- data game ---------------- */
    const WORLD = 1200, PR = 14; // dunia 1200 unit ~ 120 m; radius pemain
    const HEROES = {
        max: {
            name: "Bear Max", emoji: "🤖", role: "Ranged / DPS", hp: 110, spd: 52, wpn: "pistol", color: "#38bdf8",
            s1: { n: "Dash", cd: 6, ico: "💨" }, s2: { n: "Shield Burst", cd: 11, ico: "🛡️" }, ult: { n: "Overcharge", ico: "⚡", dur: 6 }
        },
        ted: {
            name: "Agent Ted", emoji: "🐻", role: "Melee / Assassin", hp: 135, spd: 56, wpn: "claws", color: "#f97316",
            s1: { n: "Claw Leap", cd: 7, ico: "🐾" }, s2: { n: "Bleed Strike", cd: 9, ico: "🩸" }, ult: { n: "Rampage", ico: "😡", dur: 6 }
        },
        tani: {
            name: "Tani", emoji: "🎯", role: "Ranged / Control", hp: 100, spd: 53, wpn: "burst", color: "#a78bfa", cost: 250,
            s1: { n: "Slow Portal", cd: 9, ico: "🌀" }, s2: { n: "Smoke Bomb", cd: 11, ico: "💣" }, ult: { n: "Gravity Well", ico: "🕳️", dur: 4 }
        },
    };
    const WEAPONS = {
        pistol: { n: "Pistol", tier: 0, kind: "gun", dmg: 8, rof: 0.16, range: 270, spd: 560, spread: 0.05, pellets: 1 },
        claws: { n: "Dual Claws", tier: 0, kind: "melee", dmg: 15, rof: 0.38, range: 82, arc: 1.9 },
        burst: { n: "Burst Rifle", tier: 0, kind: "gun", dmg: 7, rof: 0.13, range: 320, spd: 620, spread: 0.03, pellets: 1, burst: 3, gap: 0.62 },
        smg: { n: "SMG Tawon", tier: 1, kind: "gun", dmg: 6, rof: 0.09, range: 250, spd: 560, spread: 0.11, pellets: 1 },
        shotgun: { n: "Shotgun Boomer", tier: 2, kind: "gun", dmg: 6, rof: 0.85, range: 200, spd: 520, spread: 0.34, pellets: 5 },
        dmr: { n: "DMR Elang", tier: 3, kind: "gun", dmg: 26, rof: 0.9, range: 410, spd: 780, spread: 0.012, pellets: 1, crit: 0.2 },
    };
    const WCOLOR = { 0: "#94a3b8", 1: "#4ade80", 2: "#60a5fa", 3: "#c084fc" };
    const BOT_NAMES = ["Raka", "Bintang", "Sari", "Dimas", "Putri", "Bagas", "Naya", "Fajar", "Citra", "Yoga", "Lala", "Rico"];
    const EMOTES = ["😄", "👍", "🔥", "😱"];
    const PLACE_COINS = (p) => (p === 1 ? 200 : p <= 3 ? 120 : p <= 6 ? 70 : 30);
    const PLACE_XP = (p) => (p === 1 ? 100 : p <= 3 ? 70 : p <= 6 ? 40 : 20);
    const expNext = (l) => 50 + (l - 1) * 35;
    const EMOJI_FONT = "'Segoe UI Emoji','Apple Color Emoji','Noto Color Emoji',sans-serif";

    /* ---------------- peta kota (5 POI + cover) ---------------- */
    const RECTS = [
        { x: 50, y: 50, w: 180, h: 160, c: "#31456e", neon: 1 }, { x: 420, y: 60, w: 150, h: 130, c: "#5d6b85" }, { x: 640, y: 80, w: 130, h: 120, c: "#6d5f95" },
        { x: 1110, y: 70, w: 70, h: 150, c: "#475569" }, { x: 70, y: 420, w: 150, h: 130, c: "#8b6f47" }, { x: 80, y: 620, w: 140, h: 140, c: "#5b7553" },
        { x: 970, y: 420, w: 160, h: 130, c: "#6b7280" }, { x: 990, y: 620, w: 150, h: 130, c: "#6d55b0" }, { x: 430, y: 980, w: 170, h: 140, c: "#8a63c9" },
    ];
    const CARS = [
        [960, 90, "#ef4444"], [1022, 90, "#3b82f6"], [1084, 90, "#eab308"], [960, 190, "#10b981"], [1022, 190, "#ec4899"], [1084, 190, "#94a3b8"],
        [288, 150, "#ef4444", 1], [288, 700, "#3b82f6", 1], [878, 480, "#f59e0b", 1], [878, 1010, "#10b981", 1],
        [150, 288, "#eab308"], [700, 288, "#ec4899"], [480, 878, "#22d3ee"], [1020, 878, "#f97316"], [660, 1000, "#f43f5e"], [740, 1060, "#84cc16"],
    ].map((a) => ({ x: a[0], y: a[1], w: a[3] ? 32 : 60, h: a[3] ? 60 : 32, c: a[2], car: 1 }));
    const BARRIERS = [
        [480, 470, 70, 16], [650, 470, 70, 16], [480, 714, 70, 16], [650, 714, 70, 16], [390, 330, 60, 14], [750, 850, 60, 14],
        [950, 950, 100, 14], [1090, 950, 80, 14], [950, 1156, 80, 14], [1090, 1156, 80, 14],
        [950, 964, 14, 80], [950, 1090, 14, 66], [1156, 964, 14, 80], [1156, 1090, 14, 66],
    ].map((a) => ({ x: a[0], y: a[1], w: a[2], h: a[3], c: "#d9a520", bar: 1 }));
    const SOLIDS_R = RECTS.concat(CARS, BARRIERS);
    const TREES = [[400, 400], [800, 400], [400, 800], [800, 800], [110, 990], [190, 1050], [100, 1110], [220, 1140], [600, 230], [820, 230]].map((a) => ({ x: a[0], y: a[1], r: 14 }));
    const FOUNTAIN = { x: 600, y: 600, r: 40 };
    const SOLIDS_C = TREES.concat([FOUNTAIN]);
    const BUSHES = [[140, 1020, 30], [210, 1090, 28], [90, 1160, 26], [250, 980, 24], [520, 600, 26], [680, 600, 26], [960, 580, 26]].map((a) => ({ x: a[0], y: a[1], r: a[2] }));
    const POIS = [[600, 560, "PLAZA"], [1040, 160, "PARKIRAN"], [140, 130, "TECH GRID"], [160, 1075, "TAMAN"], [1060, 1060, "ROOFTOP"]];
    const CRATE_SPOTS = [[520, 520], [680, 680], [600, 460], [140, 250], [1050, 260], [1060, 1060]];

    function rr(c, x, y, w, h, r) { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }
    const mapCv = document.createElement("canvas"); mapCv.width = WORLD; mapCv.height = WORLD;
    (function paintMap() {
        const c = mapCv.getContext("2d");
        c.fillStyle = "#20263a"; c.fillRect(0, 0, WORLD, WORLD);
        c.fillStyle = "#2a3149";
        [[0, 0, 270, 270], [360, 0, 480, 270], [930, 0, 270, 270], [0, 360, 270, 480], [360, 360, 480, 480], [930, 360, 270, 480], [0, 930, 270, 270], [360, 930, 480, 270], [930, 930, 270, 270]].forEach((b) => c.fillRect(b[0], b[1], b[2], b[3]));
        c.fillStyle = "#3a4258"; c.fillRect(270, 0, 90, WORLD); c.fillRect(840, 0, 90, WORLD); c.fillRect(0, 270, WORLD, 90); c.fillRect(0, 840, WORLD, 90);
        c.strokeStyle = "rgba(226,232,240,.3)"; c.lineWidth = 3; c.setLineDash([18, 16]);
        [315, 885].forEach((x) => { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, WORLD); c.stroke(); });
        [315, 885].forEach((y) => { c.beginPath(); c.moveTo(0, y); c.lineTo(WORLD, y); c.stroke(); });
        c.setLineDash([]);
        c.fillStyle = "#33405e"; c.fillRect(945, 60, 240, 220);
        c.strokeStyle = "rgba(255,255,255,.28)"; c.lineWidth = 2;
        for (let i = 0; i < 4; i++) { c.strokeRect(952 + i * 62, 82, 50, 76); c.strokeRect(952 + i * 62, 182, 50, 76); }
        c.fillStyle = "#2c6e49"; rr(c, 40, 940, 240, 240, 18); c.fill();
        c.fillStyle = "rgba(255,255,255,.05)"; for (let i = 0; i < 40; i++) c.fillRect(50 + rnd() * 220, 950 + rnd() * 220, 3, 3);
        c.fillStyle = "#414d6b"; rr(c, 380, 380, 440, 440, 22); c.fill();
        c.strokeStyle = "rgba(255,255,255,.06)"; c.lineWidth = 1;
        for (let i = 1; i < 8; i++) { c.beginPath(); c.moveTo(380 + i * 55, 380); c.lineTo(380 + i * 55, 820); c.stroke(); c.beginPath(); c.moveTo(380, 380 + i * 55); c.lineTo(820, 380 + i * 55); c.stroke(); }
        c.fillStyle = "#4b5878"; rr(c, 946, 946, 228, 228, 14); c.fill();
        c.strokeStyle = "rgba(34,211,238,.5)"; c.lineWidth = 3; rr(c, 946, 946, 228, 228, 14); c.stroke();
        RECTS.forEach((b) => {
            c.fillStyle = "rgba(0,0,0,.3)"; rr(c, b.x + 6, b.y + 8, b.w, b.h, 8); c.fill();
            c.fillStyle = b.c; rr(c, b.x, b.y, b.w, b.h, 8); c.fill();
            c.strokeStyle = b.neon ? "#22d3ee" : "rgba(0,0,0,.4)"; c.lineWidth = b.neon ? 3 : 2; rr(c, b.x, b.y, b.w, b.h, 8); c.stroke();
            c.strokeStyle = "rgba(255,255,255,.12)"; c.lineWidth = 1;
            for (let i = 1; i < 4; i++) { c.beginPath(); c.moveTo(b.x + 8, b.y + (b.h / 4) * i); c.lineTo(b.x + b.w - 8, b.y + (b.h / 4) * i); c.stroke(); }
            c.fillStyle = "rgba(0,0,0,.25)"; c.fillRect(b.x + b.w - 34, b.y + 10, 22, 22);
            if (b.neon) { c.strokeStyle = "rgba(34,211,238,.35)"; for (let i = 1; i < 5; i++) { c.beginPath(); c.moveTo(b.x + (b.w / 5) * i, b.y + 4); c.lineTo(b.x + (b.w / 5) * i, b.y + b.h - 4); c.stroke(); } }
        });
        CARS.forEach((b) => {
            c.fillStyle = "rgba(0,0,0,.3)"; rr(c, b.x + 3, b.y + 4, b.w, b.h, 8); c.fill();
            c.fillStyle = b.c; rr(c, b.x, b.y, b.w, b.h, 8); c.fill();
            c.fillStyle = "rgba(15,23,42,.75)";
            if (b.w > b.h) c.fillRect(b.x + b.w * 0.55, b.y + 4, b.w * 0.22, b.h - 8); else c.fillRect(b.x + 4, b.y + b.h * 0.55, b.w - 8, b.h * 0.22);
        });
        BARRIERS.forEach((b) => { c.fillStyle = b.c; rr(c, b.x, b.y, b.w, b.h, 4); c.fill(); c.fillStyle = "rgba(0,0,0,.35)"; for (let i = 0; i < Math.max(b.w, b.h); i += 16) { if (b.w > b.h) c.fillRect(b.x + i, b.y, 8, b.h); else c.fillRect(b.x, b.y + i, b.w, 8); } });
        c.fillStyle = "#1d4ed8"; c.beginPath(); c.arc(FOUNTAIN.x, FOUNTAIN.y, FOUNTAIN.r, 0, TAU); c.fill();
        c.fillStyle = "#60a5fa"; c.beginPath(); c.arc(FOUNTAIN.x, FOUNTAIN.y, FOUNTAIN.r - 10, 0, TAU); c.fill();
        c.fillStyle = "#bfdbfe"; c.beginPath(); c.arc(FOUNTAIN.x, FOUNTAIN.y, 8, 0, TAU); c.fill();
        BUSHES.forEach((b) => { c.fillStyle = "rgba(74,222,128,.55)"; c.beginPath(); c.arc(b.x, b.y, b.r, 0, TAU); c.fill(); c.fillStyle = "rgba(34,120,60,.6)"; c.beginPath(); c.arc(b.x - 6, b.y + 4, b.r * 0.6, 0, TAU); c.fill(); });
        TREES.forEach((t) => {
            c.fillStyle = "rgba(0,0,0,.28)"; c.beginPath(); c.arc(t.x + 5, t.y + 6, 26, 0, TAU); c.fill();
            c.fillStyle = "#1f7a3d"; c.beginPath(); c.arc(t.x, t.y, 27, 0, TAU); c.fill();
            c.fillStyle = "#2f9e52"; c.beginPath(); c.arc(t.x - 5, t.y - 5, 19, 0, TAU); c.fill();
            c.fillStyle = "#7c4a21"; c.beginPath(); c.arc(t.x, t.y, 6, 0, TAU); c.fill();
        });
        c.fillStyle = "rgba(255,255,255,.4)"; c.font = "900 17px system-ui,sans-serif"; c.textAlign = "center"; c.textBaseline = "middle";
        POIS.forEach((p) => c.fillText(p[2], p[0], p[1]));
        c.strokeStyle = "rgba(34,211,238,.25)"; c.lineWidth = 6; c.strokeRect(3, 3, WORLD - 6, WORLD - 6);
    })();

    /* ---------------- geometri / tabrakan ---------------- */
    function circleRectPush(p) {
        for (let i = 0; i < SOLIDS_R.length; i++) {
            const b = SOLIDS_R[i], nx = clamp(p.x, b.x, b.x + b.w), ny = clamp(p.y, b.y, b.y + b.h);
            const dx = p.x - nx, dy = p.y - ny, d2 = dx * dx + dy * dy;
            if (d2 < PR * PR) {
                if (d2 > 0.0001) { const d = Math.sqrt(d2); p.x = nx + (dx / d) * PR; p.y = ny + (dy / d) * PR; }
                else {
                    const l = p.x - b.x, r = b.x + b.w - p.x, t = p.y - b.y, bo = b.y + b.h - p.y, m = Math.min(l, r, t, bo);
                    if (m === l) p.x = b.x - PR; else if (m === r) p.x = b.x + b.w + PR; else if (m === t) p.y = b.y - PR; else p.y = b.y + b.h + PR;
                }
            }
        }
        for (let i = 0; i < SOLIDS_C.length; i++) {
            const t = SOLIDS_C[i], dx = p.x - t.x, dy = p.y - t.y, rr2 = PR + t.r, d2 = dx * dx + dy * dy;
            if (d2 < rr2 * rr2 && d2 > 0.0001) { const d = Math.sqrt(d2); p.x = t.x + (dx / d) * rr2; p.y = t.y + (dy / d) * rr2; }
        }
        p.x = clamp(p.x, PR, WORLD - PR); p.y = clamp(p.y, PR, WORLD - PR);
    }
    function pointSolid(x, y) {
        for (let i = 0; i < SOLIDS_R.length; i++) { const b = SOLIDS_R[i]; if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return true; }
        for (let i = 0; i < SOLIDS_C.length; i++) { const t = SOLIDS_C[i]; if (dist(x, y, t.x, t.y) < t.r) return true; }
        return false;
    }
    function los(ax, ay, bx, by) {
        const d = dist(ax, ay, bx, by), n = Math.max(1, Math.ceil(d / 14));
        for (let i = 1; i < n; i++) { const t = i / n; if (pointSolid(ax + (bx - ax) * t, ay + (by - ay) * t)) return false; }
        return true;
    }
    function freeSpot(x, y) { const p = { x, y }; circleRectPush(p); return p; }

    /* ---------------- state & efek visual ---------------- */
    let S = null;                 // dunia simulasi (host / lokal)
    let V = null;                 // view tamu (interpolasi snapshot)
    let screen = "lobby";         // lobby | queue | match | results
    let matchSeq = 0;
    let selHero = HEROES[profile.hero] ? profile.hero : "max";
    let guestHero = "ted";        // pilihan hero tamu (room)
    let paused = false, infoOpen = false, cheatsOpen = false, helpOpen = false, pauseStart = 0;
    const frozen = () => paused || helpOpen || cheatsOpen || infoOpen;
    // Internal first-run help: H reopens. Info (i) stays separate for zone/settings.
    let seenHelp = true;
    try { seenHelp = localStorage.getItem("miniBattleRoyaleHelpSeen") === "1"; } catch (e) { seenHelp = true; }
    if (!seenHelp) {
        helpOpen = true;
        try { localStorage.setItem("miniBattleRoyaleHelpSeen", "1"); } catch (e) { /* storage blocked */ }
    }
    const fx = { floaters: [], parts: [], shake: 0, flash: 0 };
    const cam = { x: 600, y: 600 };
    const input = { joy: { x: 0, y: 0 }, keys: {}, fire: false, aim: null };
    const remote = { mv: { x: 0, y: 0 }, fire: false, aim: null, name: "Player 2" };
    const spectate = { on: false, target: -1 };
    const banners = [];
    let queue = null, resultShown = false, profilePaid = false;

    function banner(txt, cls) { banners.push({ txt, cls: cls || "", t: 2.6 }); if (banners.length > 3) banners.shift(); }
    function floater(x, y, txt, c, size) { fx.floaters.push({ x, y, txt, c: c || "#fff", size: size || 13, t: 0.95 }); if (fx.floaters.length > 60) fx.floaters.shift(); }
    function puff(x, y, c, n, spd, r) {
        const cap = settings.q === "low" ? 50 : 200;
        for (let i = 0; i < n; i++) { const a = rnd() * TAU, s = (0.3 + rnd() * 0.7) * (spd || 90); fx.parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, t: 0.35 + rnd() * 0.3, c, r: r || 3 }); }
        while (fx.parts.length > cap) fx.parts.shift();
    }
    function slashFx(x, y, a, arc, r) { fx.parts.push({ x, y, a, arc, r, t: 0.16, c: "#fde68a", slash: 1 }); }
    function ev(o) { if (online && isHost && S) { o.t = S.t; S.events.push(o); if (S.events.length > 80) S.events.shift(); } }
    const scoreOf = (p) => p.kills * 100 + Math.round(p.dmg) + Math.floor(p.alive ? S.t : p.deathT);
    const dmgMult = (p) => (1 + 0.05 * (p.lv - 1)) * (p.ultT > 0 && p.hero === "max" ? 1.6 : 1) * (p.bot ? 0.85 : 1);
    const cdr = (p) => Math.min(0.3, 0.02 * (p.lv - 1));

    /* ---------------- zona (fase sesuai PRD) ---------------- */
    function makeZonePlan() {
        const phases = [[0, 1, 0], [60, 0.7, 0.03], [120, 0.45, 0.05], [180, 0.25, 0.08], [240, 0.10, 0.12]];
        const R = 850; let cx = 600, cy = 600, prevR = R;
        return phases.map((ph, i) => {
            const r = R * ph[1];
            if (i > 0) { const maxOff = (prevR - r) * 0.5, a = rnd() * TAU, off = rnd() * maxOff; cx = clamp(cx + Math.cos(a) * off, 300, 900); cy = clamp(cy + Math.sin(a) * off, 300, 900); }
            prevR = r; return { t: ph[0], r, d: ph[2], cx, cy };
        });
    }
    function zoneAt(t) {
        const plan = S.zonePlan; let i = 0;
        for (let k = 0; k < plan.length; k++) if (t >= plan[k].t) i = k;
        const cur = plan[i], prev = i > 0 ? plan[i - 1] : cur;
        const sh = i > 0 ? clamp((t - cur.t) / 25, 0, 1) : 1; // menyusut selama 25 dtk pertama fase
        const z = { cx: lerp(prev.cx, cur.cx, sh), cy: lerp(prev.cy, cur.cy, sh), r: lerp(prev.r, cur.r, sh), dmg: cur.d, phase: i + 1 };
        z.next = i + 1 < plan.length ? plan[i + 1] : null;
        z.warn = z.next && z.next.t - t <= 10 ? Math.ceil(z.next.t - t) : 0;
        return z;
    }

    /* ---------------- loot ---------------- */
    function addLoot(type, x, y, extra) {
        const it = Object.assign({ id: S.nextId++, type, x: clamp(x, 20, WORLD - 20), y: clamp(y, 20, WORLD - 20), lock: 0, bob: rnd() * TAU }, extra || {});
        S.loot.push(it); return it;
    }
    function randLootType() { const r = rnd(); return r < 0.32 ? "coin" : r < 0.5 ? "hp" : r < 0.64 ? "en" : r < 0.82 ? "wpn" : "key"; }
    function randWpn() { const r = rnd(); return r < 0.5 ? "smg" : r < 0.8 ? "shotgun" : "dmr"; }
    function randSpot() {
        for (let i = 0; i < 10; i++) {
            let x, y;
            if (rnd() < 0.6) { const a = rnd() * TAU, d = rnd() * 420; x = 600 + Math.cos(a) * d; y = 600 + Math.sin(a) * d; }
            else { x = 40 + rnd() * (WORLD - 80); y = 40 + rnd() * (WORLD - 80); }
            if (!pointSolid(x, y)) return { x, y };
        }
        return { x: 600, y: 430 };
    }
    function spawnLoot(type, x, y) {
        if (type === "wpn") addLoot("wpn", x, y, { wpn: randWpn() });
        else if (type === "coin") addLoot("coin", x, y, { val: 5 });
        else addLoot(type, x, y);
    }

    /* ---------------- pemain & mulai match ---------------- */
    function newPlayer(id, name, hero, bot, x, y) {
        const h = HEROES[hero];
        return {
            id, name, hero, bot, x, y, dir: angTo(x, y, 600, 600), mvx: 0, mvy: 0,
            hp: h.hp, mhp: h.hp, sh: 0, shT: 0, spawnT: 3, invT: 0, dashT: 0, dashA: 0, dashSpd: 0, ivx: 0, ivy: 0,
            lv: 1, exp: 0, kills: 0, kb: 0, dmg: 0, coins: 0, keys: 0, ph: 1, pe: 0, wpn: h.wpn, burst: 0, // ph+pe ≤ POTION_CAP (2)
            cd: { atk: 0, s1: 0, s2: 0, dodge: 0 }, ult: 0, ultT: 0, bladesT: 0, hot: null, bleed: null, slowT: 0,
            stealth: false, zoneAcc: 0, alive: true, deathT: 0, place: 0, emote: -1, emoteT: 0, lastAct: 0,
            ai: bot ? { dec: rnd() * 0.3, mx: 0, my: 0, fire: false, aim: null, wx: x, wy: y, wt: 0, strafe: rnd() < 0.5 ? 1 : -1, skill: 0.55 + rnd() * 0.45 } : null
        };
    }
    function startMatch() {
        const plan = makeZonePlan();
        S = { t: 0, cd: 3.2, over: false, endT: 0, alive: 12, zonePlan: plan, zone: null, players: [], bullets: [], loot: [], effects: [], feed: [], events: [], results: null, lootT: 0, nextId: 1, winner: -1, mid: ++matchSeq };
        S.zone = zoneAt(0);
        const names = BOT_NAMES.slice(); const heroes = ["max", "ted", "tani"]; const a0 = rnd() * TAU;
        for (let i = 0; i < 12; i++) {
            const a = a0 + (i / 12) * TAU, r = 470 + rnd() * 60;
            const pos = freeSpot(clamp(600 + Math.cos(a) * r, 40, 1160), clamp(600 + Math.sin(a) * r, 40, 1160));
            let p;
            if (i === 0) p = newPlayer(0, playerName || "Kamu", selHero, false, pos.x, pos.y);
            else if (i === 1 && online) p = newPlayer(1, remote.name || "Player 2", guestHero, false, pos.x, pos.y);
            else p = newPlayer(i, names.splice(rndi(0, names.length - 1), 1)[0] || "Bot" + i, pick(heroes), true, pos.x, pos.y);
            p.lastAct = 0; S.players.push(p);
        }
        CRATE_SPOTS.forEach((c) => addLoot("crate", c[0], c[1]));
        for (let i = 0; i < 40; i++) { const s = randSpot(); spawnLoot(randLootType(), s.x, s.y); }
        fx.floaters.length = 0; fx.parts.length = 0; fx.shake = 0; fx.flash = 0; banners.length = 0;
        spectate.on = false; spectate.target = -1; resultShown = false; profilePaid = false;
        const me = S.players[myPid]; cam.x = me.x; cam.y = me.y;
        screen = "match"; setScreen(); updateSkillIcons(S); SFX.play("count");
        publish(true);
    }

    /* ---------------- EXP & level ---------------- */
    function gainExp(p, n) {
        if (!p.alive || p.lv >= 15) return;
        p.exp += n;
        while (p.lv < 15 && p.exp >= expNext(p.lv)) {
            p.exp -= expNext(p.lv); p.lv++;
            const old = p.mhp; p.mhp = Math.round(HEROES[p.hero].hp * (1 + 0.08 * (p.lv - 1)));
            p.hp = Math.min(p.mhp, p.hp + (p.mhp - old) + p.mhp * 0.1);
            floater(p.x, p.y - 30, "LEVEL " + p.lv + "!", "#c084fc", 15); puff(p.x, p.y, "#c084fc", 10, 120);
            if (p.id === myPid) { banner("⬆️ LEVEL UP! LV." + p.lv + " — HP & damage naik", "gold"); SFX.play("lvl"); }
            ev({ k: "lvl", x: p.x, y: p.y, p: p.id });
        }
        if (p.lv >= 15) p.exp = 0;
    }

    /* ---------------- damage & eliminasi ---------------- */
    function damage(att, vic, amt, o) {
        o = o || {};
        if (!vic.alive || amt <= 0) return;
        if (vic.invT > 0 || vic.spawnT > 0) { if (!o.dot) floater(vic.x, vic.y - 24, vic.spawnT > 0 ? "🛡" : "KEBAL", "#7dd3fc", 11); return; }
        if (vic.sh > 0) { const ab = Math.min(vic.sh, amt); vic.sh -= ab; amt -= ab; if (!o.dot) floater(vic.x, vic.y - 24, "-" + Math.round(ab), "#60a5fa", 11); if (amt <= 0) return; }
        vic.hp -= amt; vic.hot = null; // potion terinterupsi saat terkena damage
        if (!o.dot) {
            const me = vic.id === myPid;
            floater(vic.x + rndi(-8, 8), vic.y - 26, "-" + Math.round(amt), me ? "#f87171" : o.crit ? "#fbbf24" : "#fff", o.crit ? 17 : 13);
            puff(vic.x, vic.y, me ? "#f87171" : "#fca5a5", 3, 70, 2);
        }
        if (att && att !== vic && att.alive) {
            att.dmg += amt; gainExp(att, amt * 0.5); att.ult = Math.min(100, att.ult + amt * 0.35);
            if (att.ultT > 0 && att.hero === "ted") att.hp = Math.min(att.mhp, att.hp + amt * 0.5); // lifesteal Rampage
        }
        ev({ k: "hit", x: vic.x, y: vic.y, d: Math.round(amt), c: o.crit ? 1 : 0, v: vic.id, a: att ? att.id : -1, dot: o.dot ? 1 : 0 });
        if (vic.id === myPid && !o.dot) { fx.shake = 5; fx.flash = 0.3; SFX.play("hurt"); }
        else if (att && att.id === myPid && !o.dot) SFX.play("hit");
        if (vic.hp <= 0) eliminate(vic, att, o.zone ? "zone" : "hit");
    }
    function dropLoot(v) {
        let dropPot = Math.min(POTION_CAP, (v.ph || 0) + (v.pe || 0)); // total potion yang dijatuhkan ≤ 2
        for (let i = 0; i < Math.min(dropPot, v.ph || 0); i++) addLoot("hp", v.x + rndi(-30, 30), v.y + rndi(-30, 30));
        dropPot -= Math.min(dropPot, v.ph || 0);
        for (let i = 0; i < Math.min(dropPot, v.pe || 0); i++) addLoot("en", v.x + rndi(-30, 30), v.y + rndi(-30, 30));
        const c = Math.min(24, v.coins); for (let i = 0; i < Math.floor(c / 6); i++) addLoot("coin", v.x + rndi(-36, 36), v.y + rndi(-36, 36), { val: 6 });
        for (let i = 0; i < v.keys; i++) addLoot("key", v.x + rndi(-24, 24), v.y + rndi(-24, 24));
        addLoot("wpn", v.x + rndi(-20, 20), v.y + rndi(-20, 20), { wpn: v.wpn, lock: 1.5 });
        addLoot("orb", v.x + rndi(-26, 26), v.y + rndi(-26, 26), { val: 25 }); addLoot("orb", v.x + rndi(-26, 26), v.y + rndi(-26, 26), { val: 25 });
    }
    function firstAlive(not) { const a = S.players.filter((p) => p.alive && p.id !== not); return a.length ? a[0].id : -1; }
    function eliminate(v, killer, cause) {
        if (!v.alive) return;
        v.alive = false; v.deathT = S.t; v.place = S.alive; S.alive--; v.hp = 0;
        dropLoot(v); puff(v.x, v.y, "#f87171", 14, 160, 4); puff(v.x, v.y, "#fde68a", 8, 120, 3);
        if (killer && killer !== v && killer.alive) {
            killer.kills++; if (v.bot) killer.kb++;
            gainExp(killer, 60 + v.lv * 4); killer.ult = Math.min(100, killer.ult + 25);
            S.feed.push({ a: killer.name, b: v.name, t: S.t });
            if (killer.id === myPid) banner("💥 ELIMINASI! +" + (60 + v.lv * 4) + " EXP", "gold");
            if (killer.bot && rnd() < 0.3) { killer.emote = rndi(0, 3); killer.emoteT = 2; }
        } else S.feed.push({ a: cause === "zone" ? "🌐 ZONA" : cause === "afk" ? "💤 AFK" : "🏳️", b: v.name, t: S.t });
        while (S.feed.length > 6) S.feed.shift();
        ev({ k: "die", x: v.x, y: v.y, v: v.id, a: killer ? killer.id : -1 });
        if (v.id === myPid) {
            spectate.on = true; spectate.target = killer && killer.alive ? killer.id : firstAlive(v.id);
            banner("☠️ TERELIMINASI — Peringkat #" + v.place, "red"); SFX.play("die");
        } else if (dist(v.x, v.y, S.players[myPid].x, S.players[myPid].y) < 420) SFX.play("die");
        if (S.alive <= 1) finishMatch();
    }
    function finishMatch() {
        if (S.over) return;
        S.over = true; S.endT = S.t;
        const alive = S.players.filter((p) => p.alive).sort((a, b) => scoreOf(b) - scoreOf(a));
        alive.forEach((p, i) => { p.place = i + 1; });
        if (!alive.length) { const all = S.players.slice().sort((a, b) => scoreOf(b) - scoreOf(a)); all.forEach((p, i) => { p.place = i + 1; }); }
        S.results = S.players.map((p) => ({ id: p.id, name: p.name, hero: p.hero, bot: p.bot, place: p.place, kills: p.kills, kb: p.kb, dmg: Math.round(p.dmg), time: Math.floor(p.alive ? S.t : p.deathT), coins: p.coins }));
        S.winner = S.results.find((r) => r.place === 1).id;
        if (S.winner === myPid) { banner("🏆 VICTORY! Peringkat #1", "gold"); SFX.play("win"); }
        ev({ k: "end", w: S.winner }); publish(true);
    }

    /* ---------------- serangan & skill ---------------- */
    function inBush(p) { for (const b of BUSHES) if (dist(p.x, p.y, b.x, b.y) < b.r) return true; return false; }
    function inSmoke(p) { for (const e of S.effects) if (e.type === "smoke" && dist(p.x, p.y, e.x, e.y) < e.r) return true; return false; }
    function visibleTo(hunter, prey) { return !prey.stealth || dist(hunter.x, hunter.y, prey.x, prey.y) < 70; }
    function autoTarget(p, range) {
        let best = null, bd = range;
        for (const q of S.players) {
            if (!q.alive || q.id === p.id || !visibleTo(p, q)) continue;
            const d = dist(p.x, p.y, q.x, q.y);
            if (d < bd && los(p.x, p.y, q.x, q.y)) { bd = d; best = q; }
        }
        return best;
    }
    function startDash(p, a, spd, dur, inv) { p.dashT = dur; p.dashA = a; p.dashSpd = spd; p.invT = Math.max(p.invT, inv || 0); }
    function doAttack(p, manualAim) {
        const w = WEAPONS[p.wpn];
        if (p.spawnT > 0) p.spawnT = 0; // menembak membatalkan shield spawn
        let aim = manualAim;
        if (aim == null) { const t = autoTarget(p, w.range * 1.2); aim = t ? angTo(p.x, p.y, t.x + t.mvx * 0.12, t.y + t.mvy * 0.12) : p.dir; }
        p.dir = aim;
        const mult = dmgMult(p), oc = p.ultT > 0 && p.hero === "max";
        if (w.kind === "melee") {
            const rng = w.range + (p.ultT > 0 && p.hero === "ted" ? 14 : 0);
            slashFx(p.x, p.y, aim, w.arc, rng);
            for (const q of S.players) {
                if (!q.alive || q.id === p.id) continue;
                const d = dist(p.x, p.y, q.x, q.y);
                if (d < rng + PR && Math.abs(angDiff(aim, angTo(p.x, p.y, q.x, q.y))) < w.arc / 2 && los(p.x, p.y, q.x, q.y)) {
                    const crit = rnd() < 0.1;
                    damage(p, q, w.dmg * mult * (crit ? 1.6 : 1), { crit });
                    if (p.bladesT > 0 && q.alive) q.bleed = { t: 3, src: p.id, acc: 0 };
                }
            }
            if (p.id === myPid) SFX.play("claw");
            p.cd.atk = w.rof * (p.ultT > 0 && p.hero === "ted" ? 0.7 : 1);
        } else {
            const n = w.pellets || 1;
            for (let i = 0; i < n; i++) {
                const a = aim + (rnd() - 0.5) * 2 * w.spread;
                S.bullets.push({ x: p.x + Math.cos(a) * (PR + 4), y: p.y + Math.sin(a) * (PR + 4), a, spd: w.spd, dmg: w.dmg * mult, rng: w.range, tr: 0, own: p.id, crit: w.crit || 0.1 });
            }
            puff(p.x + Math.cos(aim) * (PR + 6), p.y + Math.sin(aim) * (PR + 6), "#fde68a", 1, 40, 2);
            if (p.id === myPid) SFX.play("shoot");
            if (p.id < 2) ev({ k: "shot", x: p.x, y: p.y, p: p.id });
            const rof = w.rof * (oc ? 0.6 : 1);
            if (w.burst) { if (p.burst <= 0) p.burst = w.burst; p.burst--; p.cd.atk = p.burst > 0 ? rof : w.gap * (oc ? 0.6 : 1); }
            else p.cd.atk = rof;
        }
    }
    function skillTarget(p, range) {
        const t = autoTarget(p, range);
        if (t) return { x: t.x, y: t.y };
        return { x: clamp(p.x + Math.cos(p.dir) * range * 0.65, 20, WORLD - 20), y: clamp(p.y + Math.sin(p.dir) * range * 0.65, 20, WORLD - 20) };
    }
    function castSkill(p, key) {
        if (!p.alive || S.cd > 0 || S.over) return;
        const h = HEROES[p.hero];
        if (key === "ult") {
            if (p.ult < 100) return;
            p.ult = 0; p.ultT = h.ult.dur;
            if (p.hero === "tani") { const t = skillTarget(p, 300); S.effects.push({ type: "gravity", x: t.x, y: t.y, r: 130, t: 4, own: p.id, acc: 0 }); }
            puff(p.x, p.y, h.color, 12, 150, 4);
            if (p.id === myPid) { banner(h.ult.ico + " " + h.ult.n.toUpperCase() + "!", "gold"); SFX.play("ult"); }
            ev({ k: "ult", x: p.x, y: p.y, p: p.id }); return;
        }
        if (p.cd[key] > 0) return;
        p.cd[key] = h[key].cd * (1 - cdr(p));
        const k = p.hero + key;
        if (k === "maxs1") { const a = (p.mvx || p.mvy) ? Math.atan2(p.mvy, p.mvx) : p.dir; startDash(p, a, 480, 0.22, 0.25); }
        else if (k === "maxs2") {
            p.sh = Math.round(p.mhp * 0.35); p.shT = 4; puff(p.x, p.y, "#60a5fa", 10, 130, 3);
            for (const q of S.players) if (q.alive && q.id !== p.id && dist(p.x, p.y, q.x, q.y) < 110) { const a = angTo(p.x, p.y, q.x, q.y); q.ivx += Math.cos(a) * 260; q.ivy += Math.sin(a) * 260; damage(p, q, 10 * dmgMult(p)); }
        }
        else if (k === "teds1") {
            const t = skillTarget(p, 240), d = Math.min(190, dist(p.x, p.y, t.x, t.y)), a = angTo(p.x, p.y, t.x, t.y);
            for (let i = 0; i < 5; i++) puff(p.x + Math.cos(a) * d * i / 5, p.y + Math.sin(a) * d * i / 5, "#f97316", 2, 40, 3);
            p.x += Math.cos(a) * d; p.y += Math.sin(a) * d; circleRectPush(p); p.dir = a;
            slashFx(p.x, p.y, a, TAU, 75);
            for (const q of S.players) if (q.alive && q.id !== p.id && dist(p.x, p.y, q.x, q.y) < 75 + PR) damage(p, q, 22 * dmgMult(p));
        }
        else if (k === "teds2") {
            p.bladesT = 4; const t = autoTarget(p, 95);
            if (t) { damage(p, t, 24 * dmgMult(p)); if (t.alive) t.bleed = { t: 3, src: p.id, acc: 0 }; slashFx(p.x, p.y, angTo(p.x, p.y, t.x, t.y), 1.4, 95); }
        }
        else if (k === "tanis1") { const t = skillTarget(p, 260); S.effects.push({ type: "slow", x: t.x, y: t.y, r: 95, t: 4, own: p.id, acc: 0 }); }
        else if (k === "tanis2") { S.effects.push({ type: "smoke", x: p.x, y: p.y, r: 110, t: 4.5, own: p.id, acc: 0 }); puff(p.x, p.y, "#94a3b8", 10, 90, 5); }
        if (p.id === myPid) SFX.play("skill");
        ev({ k: "skill", x: p.x, y: p.y, p: p.id });
    }
    function doDodge(p) {
        if (!p.alive || p.cd.dodge > 0 || S.cd > 0 || S.over) return;
        const a = (p.mvx || p.mvy) ? Math.atan2(p.mvy, p.mvx) : p.dir;
        startDash(p, a, 400, 0.18, 0.3); p.cd.dodge = 3.5 * (1 - cdr(p));
        if (p.id === myPid) SFX.play("dash");
        ev({ k: "dodge", x: p.x, y: p.y, p: p.id });
    }
    function usePotion(p, kind) {
        if (!p.alive || S.over) return;
        if (kind === "ph") {
            if (p.ph <= 0 || p.hp >= p.mhp || p.hot) return;
            p.ph = Math.max(0, p.ph - 1); p.hot = { t: 2, ps: p.mhp * 0.2 }; // 40% max HP over 2 dtk; slot total ≤ 2
            floater(p.x, p.y - 26, "+HP…", "#4ade80", 12);
            if (p.id === myPid) SFX.play("potion");
            ev({ k: "pot", x: p.x, y: p.y, p: p.id });
        } else {
            if (p.pe <= 0) return;
            p.pe = Math.max(0, p.pe - 1); p.cd.s1 *= 0.5; p.cd.s2 *= 0.5; p.cd.dodge *= 0.5; // slot total ≤ 2
            floater(p.x, p.y - 26, "CD -50%", "#7dd3fc", 12);
            if (p.id === myPid) SFX.play("potion");
            ev({ k: "pot", x: p.x, y: p.y, p: p.id });
        }
    }

    /* ---------------- AI bot ---------------- */
    function botThink(p, dt) {
        const ai = p.ai; ai.dec -= dt; ai.wt -= dt;
        if (ai.dec > 0) return;
        ai.dec = 0.12 + rnd() * 0.08;
        const z = S.zone, dz = dist(p.x, p.y, z.cx, z.cy), w = WEAPONS[p.wpn];
        const e = autoTarget(p, 340);
        ai.fire = false; ai.aim = null;
        let mx = 0, my = 0;
        if (dz > z.r - 70) { // prioritas: masuk zona
            const a = angTo(p.x, p.y, z.cx, z.cy) + (rnd() - 0.5) * 0.5;
            mx = Math.cos(a); my = Math.sin(a);
            if (e && dist(p.x, p.y, e.x, e.y) < w.range * 0.8) { ai.fire = true; ai.aim = angTo(p.x, p.y, e.x, e.y) + (rnd() - 0.5) * 0.2; }
        } else if (p.hp < p.mhp * 0.35 && p.ph > 0 && (!e || dist(p.x, p.y, e.x, e.y) > 150)) {
            usePotion(p, "ph");
            if (e) { const a = angTo(e.x, e.y, p.x, p.y); mx = Math.cos(a); my = Math.sin(a); }
        } else if (e) {
            const d = dist(p.x, p.y, e.x, e.y), want = w.kind === "melee" ? 42 : w.range * 0.62;
            const a = angTo(p.x, p.y, e.x, e.y), perp = a + Math.PI / 2 * ai.strafe;
            const radial = clamp((d - want) / 60, -1, 1);
            mx = Math.cos(a) * radial + Math.cos(perp) * 0.7; my = Math.sin(a) * radial + Math.sin(perp) * 0.7;
            if (rnd() < 0.06) ai.strafe *= -1;
            ai.aim = a + (rnd() - 0.5) * 0.24 * (1.1 - ai.skill);
            ai.fire = d < w.range * 0.95 && los(p.x, p.y, e.x, e.y);
            const sk = ai.skill;
            if (p.hero === "max") { if (d > 210 && rnd() < 0.25 * sk) castSkill(p, "s1"); if ((p.hp < p.mhp * 0.5 || d < 100) && rnd() < 0.3 * sk) castSkill(p, "s2"); }
            else if (p.hero === "ted") { if (d > 90 && d < 230 && rnd() < 0.35 * sk) castSkill(p, "s1"); if (d < 95 && rnd() < 0.4 * sk) castSkill(p, "s2"); }
            else { if (d < 240 && rnd() < 0.3 * sk) castSkill(p, "s1"); if ((p.hp < p.mhp * 0.45 || d < 110) && rnd() < 0.25 * sk) castSkill(p, "s2"); }
            if (p.ult >= 100 && d < 260 && rnd() < 0.3) castSkill(p, "ult");
            if (p.pe > 0 && p.cd.s1 > 3 && p.cd.s2 > 3 && rnd() < 0.2) usePotion(p, "pe");
            for (const b of S.bullets) {
                if (b.own === p.id) continue;
                const db = dist(p.x, p.y, b.x, b.y);
                if (db < 75 && Math.cos(b.a) * (p.x - b.x) + Math.sin(b.a) * (p.y - b.y) > 0 && rnd() < 0.35 * sk) { doDodge(p); break; }
            }
        } else { // cari loot / wander
            let best = null, bs = -1;
            for (const it of S.loot) {
                const d = dist(p.x, p.y, it.x, it.y); if (d > 450) continue;
                let wgt = 0;
                if (it.type === "crate") wgt = p.keys > 0 ? 3 : 0.2;
                else if (it.type === "key") wgt = p.keys < 1 ? 1.6 : 0.3;
                else if (it.type === "wpn") wgt = WEAPONS[it.wpn].tier > WEAPONS[p.wpn].tier ? 2 : 0.2;
                else if (it.type === "hp") wgt = potionCap(p) ? 1.5 : 0.3;
                else if (it.type === "en") wgt = potionCap(p) ? 1.1 : 0.3;
                else if (it.type === "orb") wgt = 1.8; else wgt = 0.8;
                const sc = wgt * 200 / (d + 40);
                if (sc > bs) { bs = sc; best = it; }
            }
            if (best) { ai.wx = best.x; ai.wy = best.y; }
            else if (ai.wt <= 0 || dist(p.x, p.y, ai.wx, ai.wy) < 30) { const a = rnd() * TAU, d = rnd() * z.r * 0.7; ai.wx = clamp(z.cx + Math.cos(a) * d, 40, 1160); ai.wy = clamp(z.cy + Math.sin(a) * d, 40, 1160); ai.wt = 3 + rnd() * 3; }
            const a = angTo(p.x, p.y, ai.wx, ai.wy); mx = Math.cos(a); my = Math.sin(a);
            if (rnd() < 0.004) { p.emote = rndi(0, 3); p.emoteT = 2; }
        }
        const m = Math.hypot(mx, my) || 1; ai.mx = mx / m; ai.my = my / m;
    }

    /* ---------------- tick simulasi ---------------- */
    function getLocalMove() {
        let x = input.joy.x, y = input.joy.y;
        if (!x && !y) {
            const k = input.keys;
            x = (k.KeyD || k.ArrowRight ? 1 : 0) - (k.KeyA || k.ArrowLeft ? 1 : 0);
            y = (k.KeyS || k.ArrowDown ? 1 : 0) - (k.KeyW || k.ArrowUp ? 1 : 0);
            const m = Math.hypot(x, y); if (m > 1) { x /= m; y /= m; }
        }
        return { x, y };
    }
    function tick(dt) {
        if (!S || (S.over && S.t > S.endT + 2)) return;
        if (S.cd > 0) { const prev = Math.ceil(S.cd); S.cd -= dt; if (Math.ceil(S.cd) !== prev && S.cd > 0) SFX.play("count"); return; }
        if (S.over) { S.t += dt; return; }
        S.t += dt;
        const z = zoneAt(S.t); const prevPhase = S.zone.phase; S.zone = z;
        if (z.phase !== prevPhase) { S.players.forEach((p) => { if (p.alive) gainExp(p, 30); }); banner("🌐 ZONA MENYUSUT! Fase " + z.phase, "red"); SFX.play("warn"); S.warned = false; }
        if (z.warn && !S.warned) { S.warned = true; banner("⚠️ Zona menyusut dalam " + z.warn + "s!", "red"); SFX.play("warn"); }
        for (const p of S.players) {
            if (!p.alive) continue;
            p.spawnT = Math.max(0, p.spawnT - dt); p.invT = Math.max(0, p.invT - dt);
            if (p.shT > 0) { p.shT -= dt; if (p.shT <= 0) p.sh = 0; }
            p.emoteT = Math.max(0, p.emoteT - dt); p.bladesT = Math.max(0, p.bladesT - dt);
            p.slowT = Math.max(0, p.slowT - dt); p.ultT = Math.max(0, p.ultT - dt);
            for (const k in p.cd) p.cd[k] = Math.max(0, p.cd[k] - dt);
            p.ult = Math.min(100, p.ult + 1.5 * dt);
            if (p.hot) { p.hot.t -= dt; p.hp = Math.min(p.mhp, p.hp + p.hot.ps * dt); if (p.hot.t <= 0) p.hot = null; }
            if (p.bleed) {
                p.bleed.t -= dt; const src = S.players[p.bleed.src];
                damage(src && src.alive ? src : null, p, 4 * dt, { dot: true });
                if (p.alive) { p.bleed.acc += 4 * dt; if (p.bleed.acc > 6) { floater(p.x, p.y - 24, "-" + Math.round(p.bleed.acc), "#fb7185", 11); p.bleed.acc = 0; } if (p.bleed.t <= 0) p.bleed = null; }
            }
            if (!p.alive) continue;
            let mv, fire, aim;
            if (p.bot) { botThink(p, dt); mv = { x: p.ai.mx, y: p.ai.my }; fire = p.ai.fire; aim = p.ai.aim; }
            else if (p.id === 0) { mv = getLocalMove(); fire = input.fire; aim = input.aim; }
            else { mv = remote.mv; fire = remote.fire; aim = remote.aim; }
            p.mvx = mv.x * HEROES[p.hero].spd; p.mvy = mv.y * HEROES[p.hero].spd;
            if (mv.x || mv.y || fire) { p.lastAct = S.t; if (aim == null && (mv.x || mv.y)) p.dir = Math.atan2(mv.y, mv.x); }
            if (aim != null) p.dir = aim;
            const spd = HEROES[p.hero].spd * (p.ultT > 0 && p.hero === "ted" ? 1.4 : 1) * (p.slowT > 0 ? 0.55 : 1);
            let vx, vy;
            if (p.dashT > 0) { p.dashT -= dt; vx = Math.cos(p.dashA) * p.dashSpd; vy = Math.sin(p.dashA) * p.dashSpd; if (rnd() < 0.5) puff(p.x, p.y, HEROES[p.hero].color, 1, 20, 2); }
            else { vx = mv.x * spd; vy = mv.y * spd; }
            const ox = p.x, oy = p.y;
            p.x += (vx + p.ivx) * dt; p.y += (vy + p.ivy) * dt; circleRectPush(p);
            p.ivx *= Math.max(0, 1 - 6 * dt); p.ivy *= Math.max(0, 1 - 6 * dt);
            if (p.bot && (vx || vy) && dist(ox, oy, p.x, p.y) < Math.hypot(vx, vy) * dt * 0.25) { const a = Math.atan2(p.ai.my, p.ai.mx) + (rnd() < 0.5 ? 1 : -1) * (1.2 + rnd()); p.ai.mx = Math.cos(a); p.ai.my = Math.sin(a); }
            p.stealth = inBush(p) || inSmoke(p);
            if (fire && p.cd.atk <= 0) doAttack(p, aim);
            const dz = dist(p.x, p.y, z.cx, z.cy);
            if (dz > z.r && z.dmg > 0 && p.spawnT <= 0) {
                const dd = p.mhp * z.dmg * dt; p.hp -= dd; p.zoneAcc += dd;
                if (p.zoneAcc > p.mhp * 0.04) { floater(p.x, p.y - 24, "-" + Math.round(p.zoneAcc), "#f43f5e", 12); if (p.id === myPid) { fx.flash = 0.25; SFX.play("hurt"); } p.zoneAcc = 0; }
                if (p.hp <= 0) { eliminate(p, null, "zone"); continue; }
            }
            if (!p.bot && S.t - p.lastAct > 20) { eliminate(p, null, "afk"); banner("💤 " + p.name + " dikeluarkan (AFK)", "red"); continue; }
        }
        for (let i = S.effects.length - 1; i >= 0; i--) {
            const e = S.effects[i]; e.t -= dt;
            if (e.t <= 0) { S.effects.splice(i, 1); continue; }
            if (e.type === "slow") { for (const p of S.players) if (p.alive && p.id !== e.own && dist(p.x, p.y, e.x, e.y) < e.r) p.slowT = Math.max(p.slowT, 0.15); }
            else if (e.type === "gravity") {
                for (const p of S.players) {
                    if (!p.alive || p.id === e.own) continue;
                    const d = dist(p.x, p.y, e.x, e.y);
                    if (d < e.r && d > 6) {
                        const a = angTo(p.x, p.y, e.x, e.y); p.x += Math.cos(a) * 120 * dt; p.y += Math.sin(a) * 120 * dt; circleRectPush(p);
                        const src = S.players[e.own]; damage(src && src.alive ? src : null, p, 8 * dt, { dot: true });
                    }
                }
                e.acc += dt; if (e.acc > 0.5) { e.acc = 0; puff(e.x, e.y, "#a855f7", 3, 60, 3); }
            }
        }
        for (let i = S.bullets.length - 1; i >= 0; i--) {
            const b = S.bullets[i]; const step = b.spd * dt, n = Math.max(1, Math.ceil(step / 9)); let dead = false;
            for (let s = 0; s < n && !dead; s++) {
                b.x += Math.cos(b.a) * step / n; b.y += Math.sin(b.a) * step / n; b.tr += step / n;
                if (b.x < 0 || b.x > WORLD || b.y < 0 || b.y > WORLD || b.tr > b.rng) { dead = true; break; }
                if (pointSolid(b.x, b.y)) { puff(b.x, b.y, "#94a3b8", 2, 50, 2); dead = true; break; }
                for (const p of S.players) {
                    if (!p.alive || p.id === b.own) continue;
                    if (dist(b.x, b.y, p.x, p.y) < PR + 4) { const crit = rnd() < b.crit; damage(S.players[b.own], p, b.dmg * (crit ? 1.6 : 1), { crit }); dead = true; break; }
                }
            }
            if (dead) S.bullets.splice(i, 1);
        }
        for (let i = S.loot.length - 1; i >= 0; i--) {
            const it = S.loot[i]; if (it.lock > 0) it.lock -= dt;
            if (it.type === "orb") { for (const p of S.players) if (p.alive) { const d = dist(p.x, p.y, it.x, it.y); if (d < 70 && d > 4) { const a = angTo(it.x, it.y, p.x, p.y); it.x += Math.cos(a) * 150 * dt; it.y += Math.sin(a) * 150 * dt; } } }
            for (const p of S.players) {
                if (!p.alive) continue;
                const d = dist(p.x, p.y, it.x, it.y), rad = it.type === "crate" ? 34 : 26;
                if (d > rad) continue;
                let taken = false;
                if (it.type === "crate") {
                    if (p.keys > 0) {
                        p.keys--; taken = true; gainExp(p, 40);
                        for (let c = 0; c < 3; c++) addLoot("coin", it.x + rndi(-34, 34), it.y + rndi(-34, 34), { val: 8 });
                        addLoot("hp", it.x + rndi(-30, 30), it.y + rndi(-30, 30)); addLoot("en", it.x + rndi(-30, 30), it.y + rndi(-30, 30));
                        addLoot("wpn", it.x + rndi(-26, 26), it.y + rndi(-26, 26), { wpn: rnd() < 0.5 ? "shotgun" : "dmr" });
                        addLoot("orb", it.x + rndi(-30, 30), it.y + rndi(-30, 30), { val: 25 });
                        puff(it.x, it.y, "#fbbf24", 12, 140, 3); S.feed.push({ a: "📦", b: p.name + " membuka crate", t: S.t });
                        if (p.id === myPid) { banner("📦 SUPPLY CRATE DIBUKA! +40 EXP", "gold"); SFX.play("crate"); }
                        ev({ k: "crate", x: it.x, y: it.y, p: p.id });
                    } else if (p.id === myPid && (!it.hint || S.t - it.hint > 2)) { it.hint = S.t; floater(it.x, it.y - 26, "Butuh 🗝!", "#fde68a", 12); }
                }
                else if (it.type === "coin") { p.coins += it.val || 5; gainExp(p, 5); taken = true; }
                else if (it.type === "hp") { if (potionCap(p)) { p.ph++; gainExp(p, 8); taken = true; } } // total ph+pe ≤ 2
                else if (it.type === "en") { if (potionCap(p)) { p.pe++; gainExp(p, 8); taken = true; } }
                else if (it.type === "key") { if (p.keys < 3) { p.keys++; gainExp(p, 10); taken = true; } }
                else if (it.type === "orb") { gainExp(p, it.val || 25); taken = true; }
                else if (it.type === "wpn") {
                    if (it.lock > 0 || it.wpn === p.wpn) continue;
                    addLoot("wpn", p.x + rndi(-18, 18), p.y + rndi(-18, 18), { wpn: p.wpn, lock: 1.5 });
                    p.wpn = it.wpn; p.burst = 0; gainExp(p, 12); taken = true;
                    floater(p.x, p.y - 30, WEAPONS[p.wpn].n + "!", WCOLOR[WEAPONS[p.wpn].tier], 13);
                    if (p.id === myPid) { banner("🔫 Senjata baru: " + WEAPONS[p.wpn].n, "gold"); updateAtkIcon(); }
                }
                if (taken) {
                    S.loot.splice(i, 1); puff(it.x, it.y, "#a5f3fc", 4, 70, 2);
                    if (p.id === myPid && it.type !== "crate") SFX.play("pick");
                    ev({ k: "pick", x: it.x, y: it.y, p: p.id, ty: it.type });
                    break;
                }
            }
        }
        S.lootT += dt; if (S.lootT > 6) { S.lootT = 0; if (S.loot.length < 52) { const s = randSpot(); spawnLoot(randLootType(), s.x, s.y); } }
        if (S.t >= 300) finishMatch(); // akhir fase final: skor tertinggi menang
    }

    /* ---------------- render ---------------- */
    let cw = 800, ch = 600, dpr = 1, viewScale = 1;
    function resize() {
        const r = board.getBoundingClientRect();
        cw = Math.max(320, r.width || 800); ch = Math.max(300, r.height || 600);
        dpr = Math.min(2, window.devicePixelRatio || 1);
        cv.width = Math.round(cw * dpr); cv.height = Math.round(ch * dpr);
        viewScale = ch / 520;
        mini.width = Math.round(108 * dpr); mini.height = Math.round(108 * dpr);
    }
    function getView() { return online && !isHost ? V : S; }
    function leaderId(view) { let id = -1, bs = -1; for (const p of view.players) if (p.alive) { const s = p.kills * 100 + p.dmg; if (s > bs) { bs = s; id = p.id; } } return id; }
    function efont(px) { ctx.font = px + "px " + EMOJI_FONT; }
    function drawPlayer(p, view, lead) {
        const h = HEROES[p.hero];
        ctx.globalAlpha = p.stealth ? (p.id === myPid ? 0.6 : 0.3) : 1;
        ctx.fillStyle = "rgba(0,0,0,.3)"; ctx.beginPath(); ctx.ellipse(p.x, p.y + PR * 0.8, PR * 0.9, PR * 0.45, 0, 0, TAU); ctx.fill();
        if (p.spawnT > 0) { ctx.strokeStyle = "rgba(125,211,252,.8)"; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(p.x, p.y, PR + 8, 0, TAU); ctx.stroke(); ctx.fillStyle = "rgba(125,211,252,.12)"; ctx.fill(); }
        if (p.ultT > 0) { ctx.strokeStyle = h.color; ctx.lineWidth = 3; ctx.setLineDash([6, 6]); ctx.lineDashOffset = -view.t * 30; ctx.beginPath(); ctx.arc(p.x, p.y, PR + 5, 0, TAU); ctx.stroke(); ctx.setLineDash([]); }
        ctx.fillStyle = "#0f172a"; ctx.beginPath(); ctx.arc(p.x, p.y, PR, 0, TAU); ctx.fill();
        ctx.lineWidth = 3; ctx.strokeStyle = p.id === myPid ? (settings.cb ? "#3b82f6" : "#22d3ee") : h.color; ctx.stroke();
        const w = WEAPONS[p.wpn];
        if (w.kind === "gun") { ctx.strokeStyle = "#cbd5e1"; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(p.x + Math.cos(p.dir) * 6, p.y + Math.sin(p.dir) * 6); ctx.lineTo(p.x + Math.cos(p.dir) * (PR + 7), p.y + Math.sin(p.dir) * (PR + 7)); ctx.stroke(); }
        efont(16); ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillStyle = "#fff"; ctx.fillText(h.emoji, p.x, p.y + 1);
        if (p.sh > 0) { ctx.strokeStyle = "#60a5fa"; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(p.x, p.y, PR + 3, -Math.PI / 2, -Math.PI / 2 + TAU * Math.min(1, p.sh / p.mhp)); ctx.stroke(); }
        const by = p.y - PR - 12, bw = 46, bx = p.x - bw / 2;
        ctx.font = "900 9px system-ui"; ctx.fillStyle = "rgba(0,0,0,.6)"; ctx.fillText(p.name, p.x + 1, by - 6);
        ctx.fillStyle = p.id === myPid ? "#a5f3fc" : "#e2e8f0"; ctx.fillText(p.name, p.x, by - 7);
        ctx.fillStyle = "rgba(0,0,0,.55)"; ctx.fillRect(bx - 1, by - 1, bw + 2, 7);
        const col = p.id === lead ? "#facc15" : p.id === myPid ? (settings.cb ? "#3b82f6" : "#22d3ee") : (settings.cb ? "#f97316" : "#ef4444");
        ctx.fillStyle = col; ctx.fillRect(bx, by, bw * clamp(p.hp / p.mhp, 0, 1), 5);
        if (p.sh > 0) { ctx.fillStyle = "rgba(96,165,250,.9)"; ctx.fillRect(bx, by, bw * Math.min(1, p.sh / p.mhp), 2); }
        ctx.fillStyle = "#1e293b"; rr(ctx, bx - 17, by - 3, 15, 11, 3); ctx.fill();
        ctx.fillStyle = "#fde68a"; ctx.font = "900 8px system-ui"; ctx.fillText(p.lv, bx - 9.5, by + 3);
        if (p.id === lead) { efont(10); ctx.fillText("👑", p.x, by - 18); }
        if (p.emote >= 0 && (p.emoteT === undefined || p.emoteT > 0)) {
            ctx.fillStyle = "rgba(255,255,255,.92)"; ctx.beginPath(); ctx.arc(p.x, by - 32, 11, 0, TAU); ctx.fill();
            efont(12); ctx.fillStyle = "#000"; ctx.fillText(EMOTES[p.emote] || "😄", p.x, by - 31);
        }
        ctx.globalAlpha = 1;
    }
    function renderWorld(view, dt) {
        const me = view.players[myPid];
        let target = me;
        if (spectate.on || !me.alive) {
            let t = view.players[spectate.target];
            if (!t || !t.alive) { const a = view.players.filter((p) => p.alive); t = a[0] || me; spectate.target = t.id; }
            target = t;
        }
        cam.x = lerp(cam.x, target.x, Math.min(1, 8 * dt)); cam.y = lerp(cam.y, target.y, Math.min(1, 8 * dt));
        const shx = (rnd() - 0.5) * fx.shake, shy = (rnd() - 0.5) * fx.shake;
        const sc = viewScale, ox = cw / 2 - cam.x * sc + shx, oy = ch / 2 - cam.y * sc + shy;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.fillStyle = "#0b1020"; ctx.fillRect(0, 0, cw, ch);
        ctx.setTransform(dpr * sc, 0, 0, dpr * sc, dpr * ox, dpr * oy);
        ctx.drawImage(mapCv, 0, 0);
        const glow = settings.q === "high";
        for (const e of view.effects) {
            if (e.type === "slow") { ctx.fillStyle = "rgba(34,211,238,.14)"; ctx.beginPath(); ctx.arc(e.x, e.y, e.r, 0, TAU); ctx.fill(); ctx.strokeStyle = "rgba(34,211,238,.7)"; ctx.lineWidth = 2; ctx.setLineDash([10, 8]); ctx.lineDashOffset = -view.t * 50; ctx.beginPath(); ctx.arc(e.x, e.y, e.r, 0, TAU); ctx.stroke(); ctx.setLineDash([]); }
            else if (e.type === "smoke") { ctx.fillStyle = "rgba(148,163,184,.4)"; for (let i = 0; i < 3; i++) { const a = view.t * 0.7 + i * 2.1; ctx.beginPath(); ctx.arc(e.x + Math.cos(a) * e.r * 0.3, e.y + Math.sin(a) * e.r * 0.3, e.r * 0.7, 0, TAU); ctx.fill(); } }
            else if (e.type === "gravity") { ctx.fillStyle = "rgba(168,85,247,.16)"; ctx.beginPath(); ctx.arc(e.x, e.y, e.r, 0, TAU); ctx.fill(); ctx.strokeStyle = "rgba(192,132,252,.8)"; ctx.lineWidth = 2; for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc(e.x, e.y, e.r * (0.3 + i * 0.25), view.t * 2 + i, view.t * 2 + i + 4); ctx.stroke(); } ctx.fillStyle = "#a855f7"; ctx.beginPath(); ctx.arc(e.x, e.y, 6, 0, TAU); ctx.fill(); }
        }
        for (const it of view.loot) {
            const bob = Math.sin(view.t * 3 + (it.bob || 0)) * 2.5, y = it.y + bob;
            ctx.fillStyle = "rgba(0,0,0,.25)"; ctx.beginPath(); ctx.ellipse(it.x, it.y + 8, 8, 3.5, 0, 0, TAU); ctx.fill();
            ctx.textAlign = "center"; ctx.textBaseline = "middle";
            if (it.type === "wpn") { const tier = WEAPONS[it.wpn].tier; ctx.fillStyle = "rgba(15,23,42,.85)"; rr(ctx, it.x - 12, y - 10, 24, 20, 5); ctx.fill(); ctx.strokeStyle = WCOLOR[tier]; ctx.lineWidth = 2; rr(ctx, it.x - 12, y - 10, 24, 20, 5); ctx.stroke(); efont(12); ctx.fillStyle = "#fff"; ctx.fillText(WEAPONS[it.wpn].kind === "melee" ? "🗡️" : "🔫", it.x, y + 1); }
            else if (it.type === "crate") { if (glow) { ctx.shadowColor = "#fbbf24"; ctx.shadowBlur = 12; } efont(22); ctx.fillStyle = "#fff"; ctx.fillText("📦", it.x, y); ctx.shadowBlur = 0; }
            else if (it.type === "orb") { ctx.fillStyle = "rgba(192,132,252,.9)"; ctx.beginPath(); ctx.arc(it.x, y, 6, 0, TAU); ctx.fill(); ctx.fillStyle = "#f3e8ff"; ctx.beginPath(); ctx.arc(it.x - 2, y - 2, 2, 0, TAU); ctx.fill(); }
            else { efont(14); ctx.fillStyle = "#fff"; ctx.fillText(it.type === "coin" ? "🪙" : it.type === "hp" ? "🧪" : it.type === "en" ? "🔋" : "🗝️", it.x, y); }
        }
        for (const b of view.bullets) {
            const col = b.own === myPid ? "#7dd3fc" : "#fda4af";
            if (glow) { ctx.shadowColor = col; ctx.shadowBlur = 8; }
            ctx.strokeStyle = col; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(b.x - Math.cos(b.a) * 10, b.y - Math.sin(b.a) * 10); ctx.lineTo(b.x, b.y); ctx.stroke(); ctx.shadowBlur = 0;
        }
        const lead = leaderId(view);
        const ps = view.players.filter((p) => p.alive).sort((a, b) => a.y - b.y);
        for (const p of ps) drawPlayer(p, view, lead);
        for (const pt of fx.parts) {
            const a = clamp(pt.t / 0.4, 0, 1);
            if (pt.slash) { ctx.strokeStyle = "rgba(253,230,138," + a + ")"; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(pt.x, pt.y, pt.r, pt.a - pt.arc / 2, pt.a + pt.arc / 2); ctx.stroke(); }
            else { ctx.globalAlpha = a; ctx.fillStyle = pt.c; ctx.beginPath(); ctx.arc(pt.x, pt.y, pt.r, 0, TAU); ctx.fill(); ctx.globalAlpha = 1; }
        }
        for (const f of fx.floaters) {
            const a = clamp(f.t / 0.95, 0, 1), yy = f.y - (0.95 - f.t) * 45;
            ctx.globalAlpha = a; ctx.font = "900 " + f.size + "px system-ui"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
            ctx.lineWidth = 3; ctx.strokeStyle = "rgba(0,0,0,.7)"; ctx.strokeText(f.txt, f.x, yy); ctx.fillStyle = f.c; ctx.fillText(f.txt, f.x, yy); ctx.globalAlpha = 1;
        }
        const z = view.zone;
        const vx0 = cam.x - cw / (2 * sc) - 60, vy0 = cam.y - ch / (2 * sc) - 60;
        ctx.beginPath(); ctx.rect(vx0, vy0, cw / sc + 120, ch / sc + 120); ctx.arc(z.cx, z.cy, z.r, 0, TAU, true);
        ctx.fillStyle = "rgba(244,63,94,.13)"; ctx.fill();
        ctx.lineWidth = 7; ctx.strokeStyle = "rgba(34,211,238,.28)"; ctx.beginPath(); ctx.arc(z.cx, z.cy, z.r, 0, TAU); ctx.stroke();
        ctx.lineWidth = 2.5; ctx.strokeStyle = "#22d3ee"; ctx.setLineDash([14, 10]); ctx.lineDashOffset = -view.t * 40; ctx.beginPath(); ctx.arc(z.cx, z.cy, z.r, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
        ctx.lineWidth = 2; ctx.strokeStyle = "rgba(34,211,238,.5)";
        for (let i = 0; i < 36; i++) { const a = i / 36 * TAU; ctx.beginPath(); ctx.moveTo(z.cx + Math.cos(a) * (z.r - 6), z.cy + Math.sin(a) * (z.r - 6)); ctx.lineTo(z.cx + Math.cos(a) * (z.r + 6), z.cy + Math.sin(a) * (z.r + 6)); ctx.stroke(); }
        if (z.next) { ctx.strokeStyle = "rgba(255,255,255,.55)"; ctx.lineWidth = 1.5; ctx.setLineDash([8, 8]); ctx.beginPath(); ctx.arc(z.next.cx, z.next.cy, z.next.r, 0, TAU); ctx.stroke(); ctx.setLineDash([]); }
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        if (me.alive && dist(me.x, me.y, z.cx, z.cy) > z.r) {
            const a = angTo(me.x, me.y, z.cx, z.cy);
            const px = cw / 2 + (me.x - cam.x) * sc, py = ch / 2 + (me.y - cam.y) * sc;
            const ax = px + Math.cos(a) * 60, ay = py + Math.sin(a) * 60;
            ctx.save(); ctx.translate(ax, ay); ctx.rotate(a); ctx.fillStyle = "#f43f5e";
            ctx.beginPath(); ctx.moveTo(12, 0); ctx.lineTo(-6, -8); ctx.lineTo(-6, 8); ctx.closePath(); ctx.fill(); ctx.restore();
            ctx.font = "900 11px system-ui"; ctx.fillStyle = "#fda4af"; ctx.textAlign = "center"; ctx.fillText("KE ZONA!", ax, ay - 14);
        }
        const hpf = me.hp / me.mhp;
        if (me.alive && hpf < 0.3) {
            const g = ctx.createRadialGradient(cw / 2, ch / 2, Math.min(cw, ch) * 0.3, cw / 2, ch / 2, Math.max(cw, ch) * 0.7);
            g.addColorStop(0, "rgba(244,63,94,0)"); g.addColorStop(1, "rgba(244,63,94," + (0.3 * (1 - hpf / 0.3)) + ")");
            ctx.fillStyle = g; ctx.fillRect(0, 0, cw, ch);
        }
        if (fx.flash > 0) { ctx.fillStyle = "rgba(244,63,94," + (fx.flash * 0.3) + ")"; ctx.fillRect(0, 0, cw, ch); }
    }
    function renderMini(view) {
        const md = mini.width / 108, s = 108 / WORLD;
        mctx.setTransform(md, 0, 0, md, 0, 0);
        mctx.clearRect(0, 0, 108, 108);
        mctx.save(); mctx.beginPath(); mctx.arc(54, 54, 53, 0, TAU); mctx.clip();
        mctx.drawImage(mapCv, 0, 0, 108, 108);
        const z = view.zone, me = view.players[myPid];
        mctx.beginPath(); mctx.rect(0, 0, 108, 108); mctx.arc(z.cx * s, z.cy * s, z.r * s, 0, TAU, true); mctx.fillStyle = "rgba(10,10,20,.55)"; mctx.fill();
        mctx.strokeStyle = "#22d3ee"; mctx.lineWidth = 1.5; mctx.beginPath(); mctx.arc(z.cx * s, z.cy * s, z.r * s, 0, TAU); mctx.stroke();
        if (z.next) { mctx.strokeStyle = "rgba(255,255,255,.7)"; mctx.setLineDash([3, 3]); mctx.beginPath(); mctx.arc(z.next.cx * s, z.next.cy * s, z.next.r * s, 0, TAU); mctx.stroke(); mctx.setLineDash([]); }
        for (const it of view.loot) if (it.type === "crate") { mctx.fillStyle = "#fbbf24"; mctx.fillRect(it.x * s - 1.5, it.y * s - 1.5, 3, 3); }
        const focus = spectate.on && view.players[spectate.target] && view.players[spectate.target].alive ? view.players[spectate.target] : me;
        for (const p of view.players) {
            if (!p.alive || p.id === focus.id) continue;
            if (dist(p.x, p.y, focus.x, focus.y) > 260 || p.stealth) continue;
            mctx.fillStyle = settings.cb ? "#f97316" : "#ef4444"; mctx.beginPath(); mctx.arc(p.x * s, p.y * s, 2.4, 0, TAU); mctx.fill();
        }
        mctx.save(); mctx.translate(focus.x * s, focus.y * s); mctx.rotate(focus.dir);
        mctx.fillStyle = "#fff"; mctx.beginPath(); mctx.moveTo(5, 0); mctx.lineTo(-3, -3.4); mctx.lineTo(-3, 3.4); mctx.closePath(); mctx.fill(); mctx.restore();
        mctx.restore();
    }
    let lastBannerSig = "", lastFeedSig = "";
    function setCd(cool, txt, v, max) { cool.style.height = clamp(v / max * 100, 0, 100) + "%"; txt.textContent = v > 0.05 ? (v >= 1 ? Math.ceil(v) : v.toFixed(1)) : ""; }
    function updateHudFast(view) {
        const me = view.players[myPid]; if (!me) return;
        el.hpfill.style.width = clamp(me.hp / me.mhp * 100, 0, 100) + "%";
        el.shfill.style.width = clamp((me.sh || 0) / me.mhp * 100, 0, 100) + "%";
        el.expfill.style.width = (me.lv >= 15 ? 100 : clamp(me.exp / expNext(me.lv) * 100, 0, 100)) + "%";
        const h = HEROES[me.hero], cd = me.cd || {};
        setCd(el.s1cool, el.s1txt, cd.s1 || 0, h.s1.cd * (1 - cdr(me)));
        setCd(el.s2cool, el.s2txt, cd.s2 || 0, h.s2.cd * (1 - cdr(me)));
        setCd(el.dodgecool, el.dodgetxt, cd.dodge || 0, 3.5 * (1 - cdr(me)));
        const ult = me.ult || 0, ultT = me.ultT || 0;
        if (ultT > 0) { el.ultcool.style.height = "0%"; el.ulttxt.textContent = Math.ceil(ultT) + "s"; el.ult.classList.add("ready"); }
        else { el.ultcool.style.height = (100 - clamp(ult, 0, 100)) + "%"; el.ulttxt.textContent = ult >= 100 ? "" : Math.floor(ult) + "%"; el.ult.classList.toggle("ready", ult >= 100); }
        el.phn.textContent = me.ph || 0; el.pen.textContent = me.pe || 0;
        el.hudpot.textContent = ((me.ph || 0) + (me.pe || 0)) + "/" + POTION_CAP; // total slot potion (PRD §4.4)
        el.ph.style.opacity = (me.ph || 0) > 0 ? 1 : 0.45; el.pe.style.opacity = (me.pe || 0) > 0 ? 1 : 0.45;
        const sig = banners.map((b) => b.txt).join("|");
        if (sig !== lastBannerSig) { lastBannerSig = sig; el.banner.innerHTML = banners.map((b) => '<div class="' + b.cls + '">' + esc(b.txt) + "</div>").join(""); }
        const dead = !me.alive;
        el.ctrl.hidden = dead || frozen(); el.selfhp.hidden = dead; el.spect.hidden = !dead;
        if (dead) { const t = view.players[spectate.target]; el.specname.textContent = t && t.alive ? t.name : "…"; }
        el.count.textContent = view.cd > 0 ? Math.ceil(view.cd) : (view.t < 0.8 && !view.over ? "GO!" : "");
    }
    function updateHudText(view) {
        const me = view.players[myPid]; if (!me) return;
        el.alive.textContent = view.alive; el.kills.textContent = me.kills; el.spec.textContent = 12 - view.alive;
        el.coins.textContent = me.coins || 0; el.keys.textContent = me.keys || 0;
        // HUD bar (separate from the in-world counters)
        el.hudalive.textContent = view.alive; el.hudkills.textContent = me.kills; el.hudspec.textContent = 12 - view.alive;
        el.hudcoins.textContent = me.coins || 0; el.hudkeys.textContent = me.keys || 0;
        el.hptext.textContent = Math.max(0, Math.ceil(me.hp)) + "/" + me.mhp;
        el.lv.textContent = "LV." + me.lv; el.exptext.textContent = me.lv >= 15 ? "MAX" : Math.floor(me.exp) + "/" + expNext(me.lv) + " EXP";
        const z = view.zone;
        el.zonet.textContent = "⏱ " + fmtT(view.t) + " • Z" + z.phase + (z.warn ? " ⚠️" + z.warn + "s" : "");
        el.hudzonet.textContent = el.zonet.textContent;
        el.zonet.classList.toggle("warn", !!z.warn);
        const feed = (view.feed || []).slice(-4);
        const fsig = feed.map((f) => f.a + f.b + f.t).join("|");
        if (fsig !== lastFeedSig) { lastFeedSig = fsig; el.feed.innerHTML = feed.map((f) => "<div>" + esc(f.a) + " ⚔️ " + esc(f.b) + "</div>").join(""); }
        el.ping.textContent = online ? (isHost ? "📶 HOST" : "📶 ~" + Math.round(net.syncMs || 200) + "ms") : "📶 LOKAL";
        updateAtkIcon();
    }
    function updateAtkIcon() { const view = getView(); if (!view || !view.players) return; const me = view.players[myPid]; if (me) el.atkico.textContent = WEAPONS[me.wpn].kind === "melee" ? "🗡️" : "🔫"; }
    function updateSkillIcons(v) { const view = v || getView(); if (!view || !view.players) return; const me = view.players[myPid]; if (!me) return; const h = HEROES[me.hero]; el.s1ico.textContent = h.s1.ico; el.s2ico.textContent = h.s2.ico; el.ultico.textContent = h.ult.ico; updateAtkIcon(); }

    /* ---------------- modal & pause controls ---------------- */
    function syncUI() {
        el.lobby.hidden = screen !== "lobby" || cheatsOpen || helpOpen;
        el.queue.hidden = screen !== "queue" || cheatsOpen || helpOpen;
        el.results.hidden = screen !== "results" || cheatsOpen || helpOpen;
        el.info.hidden = !infoOpen || cheatsOpen || helpOpen;
        el.hud.hidden = screen !== "match";
        ov.pause.hidden = !paused || cheatsOpen || helpOpen || infoOpen;
        ov.cheat.hidden = !cheatsOpen || helpOpen;
        ov.help.hidden = !helpOpen;
        const pb = root.querySelector("[data-pause]");
        if (pb) {
            const label = pb.querySelector(".mbr-btn-label");
            if (label) label.textContent = paused ? "Lanjut" : "Jeda"; // update label, never the icon
            pb.setAttribute("aria-label", paused ? "Resume" : "Pause");
            pb.setAttribute("title", paused ? "Resume (P)" : "Pause (P)");
            pb.disabled = online && !isHost;
        }
        const cb = root.querySelector("[data-cheats]");
        if (cb) cb.disabled = online && !isHost; // cheat & restart & pause are host-only in room mode
        const rb = root.querySelector("[data-restart]");
        if (rb) rb.disabled = online && !isHost;
    }
    function toggleHelp(on) {
        helpOpen = typeof on === "boolean" ? on : !helpOpen;
        if (helpOpen) { cheatsOpen = false; infoOpen = false; }
        syncUI();
    }
    function toggleCheats(on) {
        if (online && !isHost) return;
        cheatsOpen = typeof on === "boolean" ? on : !cheatsOpen;
        if (cheatsOpen) helpOpen = false;
        syncUI();
    }
    function setPaused(on) {
        if (online && !isHost) return; // guest cannot freeze the authoritative sim
        if (on === paused) return;
        if (on) { pauseStart = perfNow(); paused = true; }
        else {
            paused = false;
            const shift = pauseStart ? perfNow() - pauseStart : 0;
            if (shift > 0) {
                for (const sn of net.snaps) sn.rt += shift; // geser anchor interpolasi agar tidak lompat
                if (net.overAt) net.overAt += shift;
            }
            pauseStart = 0;
        }
        lastT = 0; // cegah lonjakan dt pada frame pertama setelah resume
        syncUI();
    }
    function togglePause() { setPaused(!paused); }
    function restartMatch() {
        if (online && !isHost) return;
        if (helpOpen) toggleHelp(false);
        if (cheatsOpen) toggleCheats(false);
        if (infoOpen) closeInfo();
        if (paused) setPaused(false);
        startMatch();
    }
    function applyCheat(k) {
        if ((online && !isHost) || !S || !S.players) return;
        const p = S.players[myPid]; if (!p || !p.alive) return;
        if (k === "hp") { p.hp = p.mhp; p.hot = null; }
        else if (k === "coins") p.coins += 200;
        else if (k === "exp") gainExp(p, 50);
        else if (k === "crate") addLoot("crate", clamp(p.x + 30, 20, WORLD - 20), clamp(p.y + 30, 20, WORLD - 20));
        SFX.play("click");
        const view = getView(); if (view && view.players) updateHudText(view);
    }

    /* ---------------- layar & UI ---------------- */
    function setScreen() {
        syncUI();
        el.hudbest.textContent = best;
        if (screen === "lobby") renderLobby();
    }
    function heroCard(id, guest) {
        const h = HEROES[id], locked = !guest && !profile.unlocked[id], sel = (guest ? guestHero : selHero) === id;
        const mastery = Math.floor((profile.xp[id] || 0) / 150) + 1;
        return '<div class="mbr-card' + (sel ? " sel" : "") + '" data-hero="' + id + '">'
            + '<div class="av">' + h.emoji + "</div><h4>" + h.name + '</h4><div class="role">' + h.role + "</div>"
            + '<div class="kit">' + h.s1.ico + " " + h.s1.n + "<br>" + h.s2.ico + " " + h.s2.n + "<br>" + h.ult.ico + " " + h.ult.n + " (Ult)</div>"
            + '<div class="mbr-stat" style="text-align:center;margin-top:4px">HP ' + h.hp + " • Mastery Lv." + mastery + "</div>"
            + (locked ? '<div class="lock">🔒 Terkunci<button type="button" data-unlock="' + id + '" ' + (profile.coins < h.cost ? "disabled" : "") + ">Buka • " + h.cost + " 🪙</button></div>" : "")
            + "</div>";
    }
    function renderLobby() {
        const guest = online && !isHost;
        el.lobby.innerHTML = "<h3>🏙️ Mini Battle Royale</h3>"
            + '<div class="mbr-row"><span class="mbr-chip">🪙 ' + profile.coins + '</span><span class="mbr-chip">🏆 Best: ' + best + '</span><span class="mbr-chip">🎮 ' + profile.matches + " match • " + profile.wins + " win</span></div>"
            + '<div class="mbr-stat">' + (guest ? "Pilih hero kamu — host yang memulai pertandingan." : "Pilih hero, lalu mulai. 12 pemain: kamu " + (online ? "+ 1 pemain room + 10 bot" : "+ 11 bot") + ".") + "</div>"
            + '<div class="mbr-cards">' + ["max", "ted", "tani"].map((id) => heroCard(id, guest)).join("") + "</div>"
            + (guest ? '<div class="mbr-stat">⏳ Menunggu host memulai…</div>' : '<button class="mbr-big" type="button" data-start>▶ MULAI BERTANDING</button>')
            + '<div class="mbr-stat">🕹️ Joystick/WASD gerak • serang auto-aim (tahan+geser = bidik manual) • J/K skill • L ult • Shift dodge • 1/2 potion</div>';
    }
    function startQueue() {
        if (!(online && isHost && S && !S.over)) S = null;
        screen = "queue"; queue = { t: 0, names: [playerName || "Kamu"], next: 0.12, done: false };
        el.qnames.innerHTML = ""; el.qfill.textContent = "1/12 pemain"; setScreen();
        publish(true);
    }
    function tickQueue(dt) {
        if (!queue) return;
        queue.t += dt;
        if (!queue.done) {
            queue.next -= dt;
            if (queue.next <= 0 && queue.names.length < 12) {
                queue.next = 0.1 + rnd() * 0.15;
                const n = online && queue.names.length === 1 ? (remote.name || "Player 2") : (BOT_NAMES[queue.names.length - 1] || "Bot" + queue.names.length);
                queue.names.push(n);
                el.qfill.textContent = queue.names.length + "/12 pemain";
                el.qnames.innerHTML = queue.names.map((x) => "<span>" + esc(x) + "</span>").join("");
                SFX.play("click");
            }
            if (queue.names.length >= 12) { queue.done = true; queue.t = 0; el.qfill.textContent = "✅ Match ditemukan! Bersiap…"; }
        } else if (queue.t > 0.5) { queue = null; startMatch(); }
    }
    function showResults() {
        if (resultShown) return;
        const view = getView(); if (!view || !view.players) return;
        const res = view.results;
        let mine = res ? res.find((r) => r.id === myPid) : null;
        if (!mine) { const me = view.players[myPid]; mine = { id: myPid, name: me.name, hero: me.hero, place: me.place || 12, kills: me.kills, kb: me.kb || 0, dmg: Math.round(me.dmg), time: Math.floor(me.alive ? view.t : (me.deathT || view.t)), coins: me.coins || 0 }; }
        resultShown = true; screen = "results"; setScreen();
        const pc = PLACE_COINS(mine.place), kc = (mine.kills - (mine.kb || 0)) * 20 + (mine.kb || 0) * 12, total = pc + kc + mine.coins;
        const xp = PLACE_XP(mine.place) + (mine.kills - (mine.kb || 0)) * 10 + (mine.kb || 0) * 6;
        const score = mine.kills * 100 + mine.dmg + mine.time;
        if (!profilePaid) { profilePaid = true; profile.coins += total; profile.matches++; if (mine.place === 1) profile.wins++; profile.xp[mine.hero] = (profile.xp[mine.hero] || 0) + xp; if (score > best) best = score; saveProfile(); }
        const win = mine.place === 1;
        el.results.innerHTML = '<div class="mbr-res">'
            + '<div class="place' + (win ? " win" : "") + '">' + (win ? "🏆 VICTORY!" : "#" + mine.place) + "</div>"
            + '<div class="mbr-stat">' + (win ? "Kamu yang terakhir bertahan!" : "Peringkat " + mine.place + " dari 12") + " • " + esc(mine.name) + "</div>"
            + "<table><tr><td>⚔️ Eliminasi</td><td>" + mine.kills + "</td></tr><tr><td>💥 Damage</td><td>" + mine.dmg + "</td></tr><tr><td>⏱ Bertahan</td><td>" + fmtT(mine.time) + "</td></tr><tr><td>⭐ Skor</td><td>" + score + "</td></tr></table>"
            + "<table><tr><td>🪙 Bonus peringkat</td><td>+" + pc + "</td></tr><tr><td>🪙 Kill (" + (mine.kb || 0) + " bot ×12, " + (mine.kills - (mine.kb || 0)) + " pemain ×20)</td><td>+" + kc + "</td></tr><tr><td>🪙 Koin dipungut</td><td>+" + mine.coins + "</td></tr><tr><td><b>Total koin</b></td><td><b>+" + total + "</b></td></tr><tr><td>✨ " + HEROES[mine.hero].name + " XP</td><td>+" + xp + "</td></tr></table>"
            + '<div class="mbr-row" style="margin-top:8px"><button class="mbr-big" type="button" data-again>🔁 MAIN LAGI</button><button class="mbr-ghost" type="button" data-tolobby>🏠 Lobi</button></div>'
            + "</div>";
        if (win) { const me = view.players[myPid]; puff(me.x, me.y, "#fbbf24", 30, 200, 4); puff(me.x, me.y, "#22d3ee", 20, 160, 3); }
    }
    function openInfo() {
        infoOpen = true; syncUI(); // info membekukan via frozen(), tanpa mengubah state jeda
        const view = getView(); const me = view && view.players ? view.players[myPid] : null;
        const w = me ? WEAPONS[me.wpn] : null;
        el.infobox.innerHTML = "<h4>📋 Jadwal Zona</h4>"
            + "<table><tr><td>Fase</td><td>Waktu</td><td>Ukuran</td><td>Damage/dtk</td></tr><tr><td>1</td><td>0:00–1:00</td><td>100%</td><td>—</td></tr><tr><td>2</td><td>1:00–2:00</td><td>70%</td><td>3%</td></tr><tr><td>3</td><td>2:00–3:00</td><td>45%</td><td>5%</td></tr><tr><td>4</td><td>3:00–4:00</td><td>25%</td><td>8%</td></tr><tr><td>5</td><td>4:00–5:00</td><td>10%</td><td>12%</td></tr></table>"
            + (me ? "<h4>🦸 Statistik Kamu</h4><div>Hero: " + HEROES[me.hero].name + " • LV." + me.lv + " • HP " + Math.ceil(me.hp) + "/" + me.mhp + "<br>Senjata: " + w.n + " (dmg " + w.dmg + ", jarak " + w.range + ")<br>Bonus damage: +" + Math.round((dmgMult(me) - 1) * 100) + "% • CDR: " + Math.round(cdr(me) * 100) + "%</div>" : "")
            + '<h4>⚙️ Pengaturan</h4><div class="mbr-set">'
            + '<label>Kualitas <select data-q><option value="low"' + (settings.q === "low" ? " selected" : "") + '>Low</option><option value="med"' + (settings.q === "med" ? " selected" : "") + '>Medium</option><option value="high"' + (settings.q === "high" ? " selected" : "") + '>High</option></select></label>'
            + '<label>Tombol <select data-size><option value="s"' + (settings.size === "s" ? " selected" : "") + '>S</option><option value="m"' + (settings.size === "m" ? " selected" : "") + '>M</option><option value="l"' + (settings.size === "l" ? " selected" : "") + '>L</option></select></label>'
            + '<label><input type="checkbox" data-sound' + (settings.sound ? " checked" : "") + '> Suara</label>'
            + '<label><input type="checkbox" data-cb' + (settings.cb ? " checked" : "") + '> Buta warna</label></div>'
            + "<h4>🕹️ Kontrol</h4><div>Joystick / WASD: gerak • Serang / Spasi: auto-aim (tahan & geser: bidik manual) • J/K: skill • L: ultimate • Shift: dodge • 1/2: potion • E: emote • I: info</div>"
            + '<div class="mbr-row" style="margin-top:10px">' + (me && me.alive && screen === "match" ? '<button class="mbr-ghost" type="button" data-surrender>🏳️ Menyerah</button>' : "") + '<button class="mbr-big" type="button" data-infoclose>Tutup</button></div>';
    }
    function closeInfo() { infoOpen = false; syncUI(); }
    let emoteIdx = 0;
    function cycleSpectate(dir) {
        const view = getView(); if (!view || !view.players) return;
        const alive = view.players.filter((p) => p.alive); if (!alive.length) return;
        let i = alive.findIndex((p) => p.id === spectate.target); i = (i + dir + alive.length) % alive.length;
        spectate.target = alive[i].id;
    }
    function submitAction(action) {
        if (online && !isHost) { room.sendAction(Object.assign({ t: "act" }, action)).catch(console.warn); return; }
        applyLocal(myPid, action);
    }
    function applyLocal(pid, a) {
        if (!S || !a) return;
        const p = S.players[pid]; if (!p) return;
        if (p.alive) p.lastAct = S.t;
        switch (a.a) {
            case "s1": case "s2": case "ult": castSkill(p, a.a); break;
            case "dodge": doDodge(p); break;
            case "ph": usePotion(p, "ph"); break;
            case "pe": usePotion(p, "pe"); break;
            case "emote": p.emote = a.e | 0; p.emoteT = 2.2; break;
            case "surrender": if (p.alive) eliminate(p, null, "surrender"); break;
        }
    }
    function handleClick(event) {
        const t = event.target;
        if (!t || !t.closest) return;
        if (t.closest("[data-help]")) { toggleHelp(); return; }
        if (t.closest("[data-help-close]")) { toggleHelp(false); return; }
        if (t.closest("[data-cheats]")) { toggleCheats(); return; }
        if (t.closest("[data-cheatclose]")) { toggleCheats(false); return; }
        const ch = t.closest("[data-cheat]");
        if (ch) { applyCheat(ch.getAttribute("data-cheat")); return; }
        if (t.closest("[data-pause]")) { togglePause(); return; }
        if (t.closest("[data-resume]")) { setPaused(false); return; }
        if (t.closest("[data-restart]")) { restartMatch(); return; }
        if (t.closest("[data-exit]")) { destroy(); onExit(); return; }
        if (t.closest("[data-start]")) { SFX.play("click"); if (online && isHost && S && !S.over) { screen = "match"; setScreen(); } else startQueue(); return; }
        const un = t.closest("[data-unlock]");
        if (un) { const id = un.getAttribute("data-unlock"), h = HEROES[id]; if (h && profile.coins >= h.cost && !profile.unlocked[id]) { profile.coins -= h.cost; profile.unlocked[id] = true; selHero = id; profile.hero = id; saveProfile(); SFX.play("crate"); renderLobby(); } return; }
        const hc = t.closest("[data-hero]");
        if (hc) { const id = hc.getAttribute("data-hero"); if (HEROES[id]) { if (online && !isHost) { guestHero = id; submitAction({ a: "hero", h: id }); } else if (profile.unlocked[id]) { selHero = id; profile.hero = id; saveProfile(); } SFX.play("click"); renderLobby(); } return; }
        if (t.closest("[data-qcancel]")) { queue = null; screen = "lobby"; setScreen(); publish(true); return; }
        if (t.closest("[data-again]")) {
            SFX.play("click");
            if (online && !isHost) {
                const last = net.snaps.length ? net.snaps[net.snaps.length - 1].s : null;
                if (last && !last.over) { screen = "match"; setScreen(); } else { submitAction({ a: "again" }); screen = "queue"; setScreen(); el.qfill.textContent = "Menunggu host memulai ulang…"; el.qnames.innerHTML = ""; }
            } else if (S && !S.over) { screen = "match"; setScreen(); } else startQueue();
            return;
        }
        if (t.closest("[data-tolobby]")) { if (online && !isHost) submitAction({ a: "leave" }); screen = "lobby"; setScreen(); publish(true); return; }
        if (t.closest("[data-info-btn]")) { openInfo(); return; }
        if (t.closest("[data-infoclose]")) { closeInfo(); return; }
        if (t.closest("[data-surrender]")) { closeInfo(); if (online && !isHost) submitAction({ a: "surrender" }); else if (S && S.players[myPid].alive) eliminate(S.players[myPid], null, "surrender"); return; }
        if (t.closest("[data-specprev]")) { cycleSpectate(-1); return; }
        if (t.closest("[data-specnext]")) { cycleSpectate(1); return; }
        if (t.closest("[data-specres]")) { showResults(); return; }
        if (t.closest("[data-emote]")) { emoteIdx = (emoteIdx + 1) % EMOTES.length; el.emote.querySelector(".ico").textContent = EMOTES[emoteIdx]; submitAction({ a: "emote", e: emoteIdx }); return; }
    }
    function handleChange(e) {
        const t = e.target; if (!t || !t.matches) return;
        if (t.matches("[data-q]")) { settings.q = t.value; saveSettings(); }
        else if (t.matches("[data-size]")) { settings.size = t.value; saveSettings(); applySettings(); }
        else if (t.matches("[data-sound]")) { settings.sound = t.checked; saveSettings(); }
        else if (t.matches("[data-cb]")) { settings.cb = t.checked; saveSettings(); applySettings(); }
    }
    function applySettings() { app.classList.remove("size-s", "size-m", "size-l"); app.classList.add("size-" + settings.size); app.classList.toggle("cb", !!settings.cb); }

    /* ---------------- input (pointer + keyboard) ---------------- */
    let joyId = null, atkId = null, atkStart = null;
    function joyMove(e) {
        const r = el.joy.getBoundingClientRect(); const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
        let dx = (e.clientX - cx) / (r.width * 0.36), dy = (e.clientY - cy) / (r.height * 0.36);
        const m = Math.hypot(dx, dy); if (m > 1) { dx /= m; dy /= m; }
        input.joy.x = dx; input.joy.y = dy;
        el.joyknob.style.transform = "translate(" + (dx * r.width * 0.28) + "px," + (dy * r.height * 0.28) + "px)";
    }
    function joyDown(e) { joyId = e.pointerId; try { el.joy.setPointerCapture(e.pointerId); } catch (err) { } joyMove(e); e.preventDefault(); }
    function joyMoveEv(e) { if (e.pointerId === joyId) joyMove(e); }
    function joyUp(e) { if (e.pointerId === joyId) { joyId = null; input.joy.x = 0; input.joy.y = 0; el.joyknob.style.transform = ""; } }
    function atkDown(e) { atkId = e.pointerId; atkStart = { x: e.clientX, y: e.clientY }; input.fire = true; try { el.atk.setPointerCapture(e.pointerId); } catch (err) { } e.preventDefault(); }
    function atkMove(e) { if (e.pointerId !== atkId || !atkStart) return; const dx = e.clientX - atkStart.x, dy = e.clientY - atkStart.y; input.aim = Math.hypot(dx, dy) > 16 ? Math.atan2(dy, dx) : null; }
    function atkUp(e) { if (e.pointerId === atkId) { atkId = null; atkStart = null; input.fire = false; input.aim = null; } }
    function skillDown(a) { return (e) => { e.preventDefault(); submitAction({ a }); }; }
    function onKeyDown(e) {
        if (e.repeat) return;
        const c = e.code;
        // Prioritas keyboard: H → C → P/Escape → R → aksi game
        if (c === "KeyH") { toggleHelp(); e.preventDefault(); return; }
        if (c === "KeyC") { toggleCheats(); e.preventDefault(); return; }
        if (c === "KeyP" || c === "Escape") {
            if (helpOpen) toggleHelp(false);
            else if (cheatsOpen) toggleCheats(false);
            else if (infoOpen) closeInfo();
            else togglePause();
            e.preventDefault(); return;
        }
        if (c === "KeyR") { restartMatch(); e.preventDefault(); return; }
        if (helpOpen || cheatsOpen || infoOpen || paused) return;
        if (screen !== "match") return;
        input.keys[c] = true;
        if (c === "Space") { input.fire = true; e.preventDefault(); }
        else if (c === "KeyJ") submitAction({ a: "s1" });
        else if (c === "KeyK") submitAction({ a: "s2" });
        else if (c === "KeyL") submitAction({ a: "ult" });
        else if (c === "ShiftLeft" || c === "ShiftRight") submitAction({ a: "dodge" });
        else if (c === "Digit1") submitAction({ a: "ph" });
        else if (c === "Digit2") submitAction({ a: "pe" });
        else if (c === "KeyE") { emoteIdx = (emoteIdx + 1) % EMOTES.length; submitAction({ a: "emote", e: emoteIdx }); }
        else if (c === "KeyI") { openInfo(); }
        if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].indexOf(c) >= 0) e.preventDefault();
    }
    function onKeyUp(e) { input.keys[e.code] = false; if (e.code === "Space") input.fire = false; }
    function onBlur() { input.keys = {}; input.fire = false; input.joy.x = 0; input.joy.y = 0; input.aim = null; }

    /* ---------------- jaringan (mode room) ---------------- */
    const net = { snaps: [], syncMs: 200, lastPhase: 0, pred: null, overAt: 0, mid: 0 };
    const unsubs = [];
    function makeSnap() {
        if (!S) return { scr: screen === "queue" ? "queue" : "lobby", gh: guestHero };
        const z = S.zone;
        return {
            scr: S.over ? "results" : (screen === "queue" ? "queue" : "match"), mid: S.mid, t: r2(S.t), cd: r1(Math.max(0, S.cd)), over: S.over, endT: r2(S.endT), alive: S.alive, winner: S.winner,
            zone: { cx: r1(z.cx), cy: r1(z.cy), r: r1(z.r), phase: z.phase, dmg: z.dmg, warn: z.warn, next: z.next ? { cx: z.next.cx, cy: z.next.cy, r: z.next.r } : null },
            players: S.players.map((p) => {
                const b = { id: p.id, name: p.name, hero: p.hero, bot: p.bot, x: r1(p.x), y: r1(p.y), dir: r2(p.dir), hp: r1(p.hp), mhp: p.mhp, sh: r1(p.sh), lv: p.lv, alive: p.alive, kills: p.kills, dmg: Math.round(p.dmg), wpn: p.wpn, stealth: p.stealth ? 1 : 0, spawnT: r1(p.spawnT), ultT: r1(p.ultT), emote: p.emoteT > 0 ? p.emote : -1, place: p.place };
                if (!p.bot) { b.exp = Math.floor(p.exp); b.ph = p.ph; b.pe = p.pe; b.pot = (p.ph || 0) + (p.pe || 0); b.keys = p.keys; b.coins = p.coins; b.kb = p.kb; b.deathT = r1(p.deathT); b.cd = { s1: r1(p.cd.s1), s2: r1(p.cd.s2), dodge: r1(p.cd.dodge) }; b.ult = Math.floor(p.ult); }
                return b;
            }),
            bullets: S.bullets.map((b) => ({ x: r1(b.x), y: r1(b.y), a: r2(b.a), spd: b.spd, own: b.own })),
            loot: S.loot.map((it) => ({ id: it.id, type: it.type, x: r1(it.x), y: r1(it.y), wpn: it.wpn, val: it.val, bob: r1(it.bob) })),
            effects: S.effects.map((e) => ({ type: e.type, x: r1(e.x), y: r1(e.y), r: e.r, t: r1(e.t), own: e.own })),
            feed: S.feed.slice(-4),
            events: S.events.splice(0, S.events.length),
            results: S.results,
        };
    }
    function publish(force) {
        if (!online || !isHost || destroyed) return;
        try { room.publishState(makeSnap()).catch(console.warn); } catch (e) { console.warn(e); }
    }
    function applyAction(action, actor) {
        if (!action || typeof action !== "object") return;
        if (action.t === "name") { remote.name = String(action.n || "Player 2").slice(0, 14); if (S && S.players[1]) S.players[1].name = remote.name; return; }
        if (action.t === "in") {
            const mv = action.mv || [0, 0];
            remote.mv.x = clamp(+mv[0] || 0, -1, 1); remote.mv.y = clamp(+mv[1] || 0, -1, 1);
            remote.fire = !!action.f; remote.aim = (typeof action.a === "number" && isFinite(action.a)) ? action.a : null;
            if (S && S.players[1] && (remote.mv.x || remote.mv.y || remote.fire)) S.players[1].lastAct = S.t;
            return;
        }
        if (action.t !== "act") return;
        if (action.a === "hero") { if (HEROES[action.h]) guestHero = action.h; return; }
        if (action.a === "again") { if (S && S.over) startQueue(); return; }
        if (action.a === "leave") { if (S && S.players[1] && S.players[1].alive) eliminate(S.players[1], null, "surrender"); return; }
        applyLocal(1, action);
    }
    function consumeEvents(s) {
        if (s.zone && s.zone.phase !== net.lastPhase) { if (net.lastPhase && s.zone.phase > net.lastPhase) { banner("🌐 ZONA MENYUSUT! Fase " + s.zone.phase, "red"); SFX.play("warn"); } net.lastPhase = s.zone.phase; }
        const evs = s.events || [];
        for (const e of evs) {
            if (e.k === "hit") { if (!e.dot) { floater(e.x, e.y - 26, "-" + e.d, e.v === myPid ? "#f87171" : e.c ? "#fbbf24" : "#fff", e.c ? 17 : 13); puff(e.x, e.y, "#fca5a5", 3, 70, 2); } if (e.v === myPid && !e.dot) { fx.shake = 5; fx.flash = 0.3; SFX.play("hurt"); } else if (e.a === myPid && !e.dot) SFX.play("hit"); }
            else if (e.k === "die") { puff(e.x, e.y, "#f87171", 14, 160, 4); if (e.v === myPid) { spectate.on = true; const k = s.players[e.a]; spectate.target = (k && k.alive) ? e.a : (s.players.find((p) => p.alive) || { id: -1 }).id; banner("☠️ TERELIMINASI — Peringkat #" + (s.players[myPid] ? s.players[myPid].place : "?"), "red"); SFX.play("die"); } }
            else if (e.k === "lvl") { floater(e.x, e.y - 30, "LEVEL UP!", "#c084fc", 15); puff(e.x, e.y, "#c084fc", 10, 120); if (e.p === myPid) { banner("⬆️ LEVEL UP!", "gold"); SFX.play("lvl"); } }
            else if (e.k === "pick") { puff(e.x, e.y, "#a5f3fc", 4, 70, 2); if (e.p === myPid) SFX.play("pick"); }
            else if (e.k === "crate") { puff(e.x, e.y, "#fbbf24", 12, 140, 3); if (e.p === myPid) { banner("📦 SUPPLY CRATE DIBUKA!", "gold"); SFX.play("crate"); } }
            else if (e.k === "pot") { floater(e.x, e.y - 26, "+", "#4ade80", 12); if (e.p === myPid) SFX.play("potion"); }
            else if (e.k === "skill") { puff(e.x, e.y, "#a5f3fc", 6, 110, 3); if (e.p === myPid) SFX.play("skill"); }
            else if (e.k === "ult") { puff(e.x, e.y, "#fbbf24", 12, 150, 4); if (e.p === myPid) { banner("⚡ ULTIMATE!", "gold"); SFX.play("ult"); } }
            else if (e.k === "dodge") { if (e.p === myPid) SFX.play("dash"); }
            else if (e.k === "shot") { if (e.p === myPid) SFX.play("shoot"); }
            else if (e.k === "end") { if (e.w === myPid) { banner("🏆 VICTORY! Peringkat #1", "gold"); SFX.play("win"); } }
        }
    }
    function onSnap(s) {
        if (destroyed || !s) return;
        const now = perfNow();
        if (net.snaps.length) { const gap = now - net.snaps[net.snaps.length - 1].rt; net.syncMs = lerp(net.syncMs, gap * 1000, 0.2); }
        net.snaps.push({ rt: now, s }); if (net.snaps.length > 5) net.snaps.shift();
        if (s.scr === "closed") { banner("🔌 Host menutup pertandingan", "red"); screen = "lobby"; setScreen(); return; }
        consumeEvents(s);
        if (s.scr === "lobby") { if (screen !== "lobby") { screen = "lobby"; setScreen(); } return; }
        if (s.scr === "queue") { if (screen !== "queue") { screen = "queue"; setScreen(); el.qfill.textContent = "Host menyiapkan pertandingan…"; el.qnames.innerHTML = ""; } return; }
        if (s.mid && s.mid !== net.mid) {
            net.mid = s.mid; resultShown = false; profilePaid = false; spectate.on = false; spectate.target = -1; net.pred = null; net.overAt = 0; net.lastPhase = 0;
            const me = s.players && s.players[myPid]; if (me) { cam.x = me.x; cam.y = me.y; }
            if (screen !== "match") { screen = "match"; setScreen(); }
            updateSkillIcons(s);
        }
        if (s.over) { if (!net.overAt) net.overAt = now; } else net.overAt = 0;
    }
    function buildGuestView(dt) {
        if (!net.snaps.length) { V = null; return; }
        const now = perfNow(), rt = now - 0.22; // buffer interpolasi 220 ms
        let a = net.snaps[0], b = net.snaps[net.snaps.length - 1];
        for (let i = 0; i < net.snaps.length - 1; i++) { if (net.snaps[i].rt <= rt && net.snaps[i + 1].rt >= rt) { a = net.snaps[i]; b = net.snaps[i + 1]; break; } }
        if (rt >= b.rt) a = b;
        const sa = a.s, sb = b.s;
        if (!sb.players || !sb.zone) { V = null; return; }
        const saOk = sa.players && sa.zone ? sa : sb;
        const span = Math.max(0.001, b.rt - a.rt), al = clamp((rt - a.rt) / span, 0, 1);
        const players = sb.players.map((p) => {
            const pa = saOk.players[p.id];
            const q = Object.assign({}, p);
            if (pa && pa.alive === p.alive) { q.x = lerp(pa.x, p.x, al); q.y = lerp(pa.y, p.y, al); q.dir = pa.dir + angDiff(pa.dir, p.dir) * al; q.hp = lerp(pa.hp, p.hp, al); }
            return q;
        });
        const z = { cx: lerp(saOk.zone.cx, sb.zone.cx, al), cy: lerp(saOk.zone.cy, sb.zone.cy, al), r: lerp(saOk.zone.r, sb.zone.r, al), phase: sb.zone.phase, dmg: sb.zone.dmg, warn: sb.zone.warn, next: sb.zone.next };
        const bdt = Math.max(0, rt - a.rt);
        const bullets = (saOk.bullets || []).map((bl) => ({ x: bl.x + Math.cos(bl.a) * bl.spd * bdt, y: bl.y + Math.sin(bl.a) * bl.spd * bdt, a: bl.a, own: bl.own }));
        V = { t: lerp(saOk.t, sb.t, al), cd: sb.cd, over: sb.over, alive: sb.alive, winner: sb.winner, zone: z, players, bullets, loot: sb.loot || [], effects: sb.effects || [], feed: sb.feed || [], results: sb.results, mid: sb.mid };
        const me = V.players[myPid];
        if (me && me.alive && !V.over) { // prediksi lokal ringan untuk pemain sendiri
            const mv = getLocalMove();
            if (!net.pred) net.pred = { x: me.x, y: me.y };
            const spd = HEROES[me.hero].spd * (me.ultT > 0 && me.hero === "ted" ? 1.4 : 1);
            net.pred.x += mv.x * spd * dt; net.pred.y += mv.y * spd * dt;
            const d = dist(net.pred.x, net.pred.y, me.x, me.y);
            if (d > 90) { net.pred.x = me.x; net.pred.y = me.y; } else { net.pred.x = lerp(net.pred.x, me.x, 0.2); net.pred.y = lerp(net.pred.y, me.y, 0.2); }
            me.x = net.pred.x; me.y = net.pred.y;
            if (mv.x || mv.y) me.dir = Math.atan2(mv.y, mv.x);
        } else net.pred = null;
    }
    function sendInput() {
        const mv = getLocalMove();
        room.sendAction({ t: "in", mv: [r2(mv.x), r2(mv.y)], f: input.fire ? 1 : 0, a: input.aim == null ? null : r2(input.aim) }).catch(console.warn);
    }

    /* ---------------- loop utama ---------------- */
    let raf = 0, lastT = 0, acc = 0, hudT = 0, pubT = 0, sendT = 0, hiddenTimer = 0;
    const STEP = 1 / 60;
    function frame(ts) {
        if (destroyed) return;
        raf = requestAnimationFrame(frame);
        const now = ts / 1000, dt = Math.min(0.1, lastT ? now - lastT : 0.016); lastT = now;
        const hold = frozen(); // jeda/bantuan/cheat/info membekukan sim, FX, banner & timer
        if (screen === "queue" && queue && isHost && !hold) tickQueue(dt);
        const simOK = S && !hold && (online && isHost ? true : screen === "match");
        if (simOK) { acc += dt; let n = 0; while (acc >= STEP && n < 6) { tick(STEP); acc -= STEP; n++; } if (n === 6) acc = 0; }
        if (online && !isHost && !hold) buildGuestView(dt);
        if (!hold) {
            for (let i = fx.floaters.length - 1; i >= 0; i--) { fx.floaters[i].t -= dt; if (fx.floaters[i].t <= 0) fx.floaters.splice(i, 1); }
            for (let i = fx.parts.length - 1; i >= 0; i--) { const p = fx.parts[i]; p.t -= dt; if (p.t <= 0) { fx.parts.splice(i, 1); continue; } if (!p.slash) { p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.92; p.vy *= 0.92; } }
            fx.shake *= Math.max(0, 1 - 6 * dt); fx.flash = Math.max(0, fx.flash - dt * 1.2);
            for (let i = banners.length - 1; i >= 0; i--) { banners[i].t -= dt; if (banners[i].t <= 0) banners.splice(i, 1); }
        }
        const view = getView();
        if (screen === "match" && view && view.players) { renderWorld(view, hold ? 0 : dt); renderMini(view); updateHudFast(view); if (!hold) { hudT += dt; if (hudT > 0.25) { hudT = 0; updateHudText(view); } } }
        if (online && isHost) { pubT += dt; const iv = screen === "match" ? (paused ? 0.8 : 0.2) : 0.8; if (pubT > iv) { pubT = 0; publish(); } }
        if (online && !isHost && screen === "match" && !hold) { sendT += dt; if (sendT > 0.1) { sendT = 0; sendInput(); } }
        if (!hold && isHost && S && S.over && !resultShown && S.t > S.endT + 1.3 && screen === "match") showResults();
        if (!hold && online && !isHost && !resultShown && net.overAt && perfNow() > net.overAt + 1.2 && screen === "match") showResults();
    }
    function onVis() { // host: tetap simulasi saat tab tersembunyi (RAF berhenti)
        if (destroyed) return;
        if (document.hidden && online && isHost && S && !S.over) {
            if (!hiddenTimer) hiddenTimer = setInterval(() => { if (destroyed || !S || frozen()) return; for (let i = 0; i < 5; i++) tick(0.05); publish(); }, 250);
        } else if (hiddenTimer) { clearInterval(hiddenTimer); hiddenTimer = 0; lastT = 0; }
    }

    /* ---------------- init & cleanup ---------------- */
    const bound = [];
    function on(o, t, f) { o.addEventListener(t, f); bound.push([o, t, f]); }
    let ro = null, battObj = null, battUpd = null;
    applySettings(); resize();
    if (window.ResizeObserver) { ro = new ResizeObserver(() => resize()); ro.observe(board); }
    on(window, "resize", resize);
    on(root, "click", handleClick);
    on(root, "change", handleChange);
    on(el.joy, "pointerdown", joyDown); on(el.joy, "pointermove", joyMoveEv); on(el.joy, "pointerup", joyUp); on(el.joy, "pointercancel", joyUp);
    on(el.atk, "pointerdown", atkDown); on(el.atk, "pointermove", atkMove); on(el.atk, "pointerup", atkUp); on(el.atk, "pointercancel", atkUp);
    on(el.s1, "pointerdown", skillDown("s1")); on(el.s2, "pointerdown", skillDown("s2")); on(el.ult, "pointerdown", skillDown("ult"));
    on(el.dodge, "pointerdown", skillDown("dodge")); on(el.ph, "pointerdown", skillDown("ph")); on(el.pe, "pointerdown", skillDown("pe"));
    on(window, "keydown", onKeyDown); on(window, "keyup", onKeyUp); on(window, "blur", onBlur);
    on(document, "visibilitychange", onVis);
    if (navigator.getBattery) {
        try {
            navigator.getBattery().then((b) => {
                if (destroyed) return;
                battObj = b; battUpd = () => { el.batt.textContent = "🔋" + Math.round(b.level * 100) + "%" + (b.charging ? "⚡" : ""); };
                battUpd(); b.addEventListener("levelchange", battUpd); b.addEventListener("chargingchange", battUpd);
            }).catch(() => { });
        } catch (e) { }
    }
    if (online) {
        const u1 = room.onRoom((nextRoom) => { roomData = nextRoom; });
        if (typeof u1 === "function") unsubs.push(u1);
        if (isHost) { const u2 = room.onAction((action) => applyAction(action, 1)); if (typeof u2 === "function") unsubs.push(u2); publish(true); }
        else { const u3 = room.onState((s) => onSnap(s)); if (typeof u3 === "function") unsubs.push(u3); room.sendAction({ t: "name", n: playerName || "Player 2" }).catch(console.warn); }
    }
    screen = "lobby"; setScreen();
    raf = requestAnimationFrame(frame);

    function destroy() {
        if (destroyed) return; destroyed = true;
        cancelAnimationFrame(raf);
        if (hiddenTimer) clearInterval(hiddenTimer);
        bound.forEach((b) => { try { b[0].removeEventListener(b[1], b[2]); } catch (e) { } });
        if (ro) { try { ro.disconnect(); } catch (e) { } }
        unsubs.forEach((u) => { try { u(); } catch (e) { } });
        if (online) { try { if (isHost) room.publishState({ scr: "closed" }).catch(() => { }); else room.sendAction({ t: "act", a: "leave" }).catch(() => { }); } catch (e) { } }
        if (battObj && battUpd) { try { battObj.removeEventListener("levelchange", battUpd); battObj.removeEventListener("chargingchange", battUpd); } catch (e) { } }
        SFX.close();
    }
    return { destroy };
}