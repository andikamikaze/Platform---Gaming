/*
 * Arena Battle — competitive 2v2 arena sports-brawler (PRD v1.0 / MVP).
 * 1. Simpan file ini sebagai arena-battle.js (id META = nama file).
 * 2. Logika game ada di mount().
 * 3. Jalankan: node tools/build-games-manifest.mjs
 *
 * Fitur MVP: arena oktagon + 2 gawang + 4 barrier bisa hancur, 4 fighter
 * (serangan dasar + skill unik), bola fisika (pukul/oper/tembak/bawa),
 * best-of-3 ronde + sudden death, respawn 5 detik, anti-camping,
 * bot Easy/Normal, HUD lengkap, menu/pause/hasil, audio & VFX neon,
 * keyboard + mouse + gamepad, lokal 2-4 pemain (slot kosong diisi bot),
 * dan mode room online sederhana (host-authoritative).
 *
 * Layout mengikuti sistem game-layout-redesign: satu bar HUD di atas board,
 * canvas + overlay sebagai anak langsung .game-panel[data-board], bantuan
 * internal pertama kali (flag arenaBattleHelpSeen), pause/cheat, dan
 * penanganan keyboard berprioritas H → C → P/Esc → R → aksi game.
 */

import { iconSVG } from "../JS/icons.js";

export const META = {
    id: "arena-battle",
    name: "Arena Battle",
    category: "sports",
    catLabel: "Sports",
    desc: "Brawl bola 2v2 di arena oktagon: pukul bola ke gawang lawan, pakai skill & dash, rebut 2 kemenangan ronde. WASD gerak, mouse bidik, klik kiri serang, klik kanan skill, Spasi dash, E ambil/oper, Esc jeda.",
    bg: ["#f87171", "#22d3ee"],
    bestKey: "arenaBattleBest",
};

export function mount(root, context = {}) {
    const { mode = "ai", room = null, playerName = "Player", onExit = () => { } } = context;
    const online = mode === "room" && Boolean(room);
    const isHost = !online || Boolean(room.isHost);
    const mySlot = online && !isHost ? 1 : 0;
    let roomData = room?.room || null;

    // ---------- konfigurasi & penyimpanan ----------
    const CFG_KEY = "arenaBattleCfg", BEST_KEY = "arenaBattleBest";
    const cfg = { humans: 2, diff: 1, roundLen: 75, vol: 0.8, music: 0.55, sfx: 0.9 };
    try { Object.assign(cfg, JSON.parse(localStorage.getItem(CFG_KEY) || "{}")); } catch (e) { }
    // FR-01 (keputusan ketat): lokal harus 2-4 manusia; sisanya diisi bot.
    cfg.humans = Math.max(2, Math.min(4, cfg.humans | 0));
    if (online) cfg.humans = 2;
    let best = 0, streak = 0;
    try { best = parseInt(localStorage.getItem(BEST_KEY) || "0", 10) || 0; } catch (e) { }
    const saveCfg = () => { try { localStorage.setItem(CFG_KEY, JSON.stringify(cfg)); } catch (e) { } };

    // ---------- bantuan internal (first-run) ----------
    let helpOpen = false, cheatsOpen = false;
    let seenHelp = true;
    try { seenHelp = localStorage.getItem("arenaBattleHelpSeen") === "1"; } catch (e) { seenHelp = true; }
    if (!seenHelp) {
        helpOpen = true;
        try { localStorage.setItem("arenaBattleHelpSeen", "1"); } catch (e) { /* storage diblokir */ }
    }
    const nowMs = () => (typeof performance !== "undefined" && performance.now) ? performance.now() : Date.now();

    // ---------- util ----------
    const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
    const lerp = (a, b, t) => a + (b - a) * t;
    const rnd = (a = 1, b) => b === undefined ? Math.random() * a : a + Math.random() * (b - a);
    const hyp = Math.hypot;
    const angDiff = (a, b) => { let d = (b - a) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2; return d; };
    const angLerp = (a, b, t) => a + angDiff(a, b) * clamp(t, 0, 1);
    const dist = (a, b) => hyp(a.x - b.x, a.y - b.y);
    const mulberry = (s) => () => { s |= 0; s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };

    // ---------- DOM ----------
    const chip = (i) => {
        const team = (i === 0 || i === 2) ? "red" : "cyan";
        return `<div class="ab-chip ${team}" data-chip="${i}">
      <div class="ab-chip-top"><span data-name="${i}">-</span><span class="ab-tag" data-tag="${i}">P${i + 1}</span></div>
      <div class="ab-bar ab-hp"><i data-hp="${i}" style="width:100%"></i></div>
      <div class="ab-bar ab-en"><i data-en="${i}" style="width:100%"></i></div>
    </div>`;
    };
    root.innerHTML = `
  <style>
    .ab-app{display:flex;flex-direction:column;width:100%;font-family:system-ui,'Segoe UI',Roboto,sans-serif;color:#dbeafe}
    .ab-app [hidden]{display:none!important}
    .ab-app.game-fill > .game-panel[data-board]{position:relative;flex:1 1 auto;min-height:0;aspect-ratio:auto;width:100%;padding:0;border:0;border-radius:14px;overflow:hidden;background:#05070f;user-select:none;-webkit-user-select:none}
    .ab-cv{position:absolute;inset:0;width:100%;height:100%;display:block;cursor:crosshair;touch-action:none}
    /* satu bar HUD di atas board */
    .ab-hud{display:flex;align-items:center;gap:7px;flex-wrap:wrap;flex:none;margin-bottom:8px;font:600 11px/1 ui-monospace,SFMono-Regular,Menlo,monospace}
    .ab-hudchip{display:inline-flex;align-items:center;gap:5px;padding:5px 9px;border:1px solid rgba(125,211,252,.24);border-radius:999px;background:rgba(10,16,34,.9);color:#93c5fd;white-space:nowrap;letter-spacing:.03em}
    .ab-hudchip b{color:#f8fafc;font-weight:800;font-variant-numeric:tabular-nums}
    .ab-hudchip.r b{color:#ff6b78} .ab-hudchip.c b{color:#5ee7f0} .ab-hudchip.sd b{color:#f87171}
    .ab-spacer{flex:1 1 auto}
    .ab-icon-btn{display:inline-flex;align-items:center;gap:5px}
    .ab-icon-btn svg{flex:none;display:block}
    .ab-btn-label{white-space:nowrap}
    .ab-btn:disabled{opacity:.45;cursor:not-allowed}
    .ab-hud .ab-btn{min-height:30px;padding:5px 9px;font-size:10px;letter-spacing:0}
    .ab-hud .ab-btn.on{border-color:#ffc857;color:#ffc857}
    /* HUD lapangan (anak board, bukan bar atas) */
    .ab-fieldhud{position:absolute;top:0;left:0;right:0;display:flex;justify-content:space-between;align-items:flex-start;padding:10px 12px;pointer-events:none;gap:8px;z-index:2}
    .ab-team{display:flex;flex-direction:column;gap:6px;width:200px}
    .ab-chip{background:rgba(8,12,26,.74);border:1px solid;border-radius:9px;padding:5px 8px;font-size:11px;line-height:1.25}
    .ab-chip.red{border-color:rgba(255,77,93,.55)} .ab-chip.cyan{border-color:rgba(41,216,229,.55)}
    .ab-chip.ko{opacity:.55;filter:grayscale(.7)}
    .ab-chip-top{display:flex;justify-content:space-between;gap:6px;font-weight:700}
    .ab-tag{font-size:9px;padding:1px 5px;border-radius:6px;background:rgba(255,255,255,.14)}
    .ab-bar{height:5px;border-radius:3px;background:rgba(255,255,255,.12);margin-top:3px;overflow:hidden}
    .ab-bar i{display:block;height:100%;border-radius:3px;transition:width .12s linear}
    .ab-hp i{background:linear-gradient(90deg,#4ade80,#a3e635)}
    .ab-en i{background:linear-gradient(90deg,#38bdf8,#818cf8)}
    .ab-mid{text-align:center;min-width:170px}
    .ab-score{display:flex;justify-content:center;align-items:center;gap:10px;font-size:26px;font-weight:900;text-shadow:0 0 14px rgba(56,189,248,.45)}
    .ab-score .r{color:#ff4d5d}.ab-score .c{color:#29d8e5}
    .ab-pips{font-size:11px;letter-spacing:2px}
    .ab-timer{font-size:22px;font-weight:800;font-variant-numeric:tabular-nums;margin-top:2px}
    .ab-timer.sd{color:#f87171;animation:ab-pulse 1s infinite}
    .ab-round{font-size:10px;opacity:.75;letter-spacing:1px;text-transform:uppercase}
    .ab-banner{position:absolute;left:50%;top:24%;transform:translate(-50%,-50%) scale(.7);font-size:44px;font-weight:900;letter-spacing:2px;opacity:0;pointer-events:none;text-align:center;white-space:nowrap;text-shadow:0 0 24px currentColor,0 2px 0 rgba(0,0,0,.6);transition:opacity .15s,transform .15s}
    .ab-banner.show{opacity:1;transform:translate(-50%,-50%) scale(1)}
    .ab-banner.count{font-size:88px}
    .ab-banner.small{font-size:24px}
    .ab-toast{position:absolute;bottom:12px;left:50%;transform:translateX(-50%);background:rgba(8,12,26,.88);border:1px solid rgba(125,211,252,.4);padding:6px 14px;border-radius:20px;font-size:12px;opacity:0;transition:opacity .2s;pointer-events:none;white-space:nowrap}
    .ab-toast.show{opacity:1}
    .ab-hint{position:absolute;bottom:8px;left:10px;font-size:10px;opacity:.55;pointer-events:none}
    .ab-vign{position:absolute;inset:0;pointer-events:none;box-shadow:inset 0 0 110px rgba(255,50,60,.55);opacity:0;transition:opacity .3s}
    .ab-screen{position:absolute;inset:0;display:none;flex-direction:column;align-items:center;justify-content:center;gap:14px;background:rgba(4,7,16,.8);backdrop-filter:blur(4px);padding:18px;overflow:auto;text-align:center}
    .ab-screen.menu{background:linear-gradient(180deg,rgba(4,7,16,.5),rgba(4,7,16,.88))}
    .ab-title{font-size:52px;font-weight:900;letter-spacing:4px;background:linear-gradient(90deg,#ff4d5d,#ffc857,#29d8e5);-webkit-background-clip:text;background-clip:text;color:transparent;filter:drop-shadow(0 0 18px rgba(56,189,248,.35))}
    .ab-sub{font-size:13px;opacity:.85;max-width:600px;line-height:1.6}
    .ab-btn{pointer-events:auto;cursor:pointer;background:rgba(10,16,34,.92);color:#e0f2fe;border:1px solid rgba(125,211,252,.5);padding:10px 22px;border-radius:10px;font-size:14px;font-weight:700;letter-spacing:.5px;transition:all .15s;font-family:inherit}
    .ab-btn:hover{border-color:#7dd3fc;box-shadow:0 0 16px rgba(56,189,248,.4);transform:translateY(-1px)}
    .ab-btn.primary{background:linear-gradient(90deg,#dc2626,#0891b2);border-color:transparent;font-size:16px;padding:12px 30px}
    .ab-btn.small{padding:6px 12px;font-size:12px}
    .ab-row{display:flex;gap:10px;flex-wrap:wrap;justify-content:center;align-items:center}
    .ab-set{display:flex;gap:6px;align-items:center;font-size:12px;background:rgba(10,16,34,.85);border:1px solid rgba(125,211,252,.25);border-radius:8px;padding:6px 10px}
    .ab-set select{background:#0b1226;color:#e0f2fe;border:1px solid rgba(125,211,252,.4);border-radius:6px;padding:3px 6px;font-size:12px}
    .ab-grid{display:grid;grid-template-columns:repeat(4,minmax(130px,170px));gap:10px;justify-content:center}
    .ab-card{pointer-events:auto;cursor:pointer;background:rgba(10,16,34,.92);border:1px solid rgba(125,211,252,.3);border-radius:12px;padding:10px;text-align:left;transition:all .15s;position:relative}
    .ab-card:hover{transform:translateY(-2px);border-color:#7dd3fc}
    .ab-card.sel{border-color:#ffc857;box-shadow:0 0 14px rgba(255,200,87,.35)}
    .ab-card h4{margin:6px 0 2px;font-size:13px}
    .ab-card .role{font-size:10px;opacity:.7}
    .ab-card .sk{font-size:10px;color:#7dd3fc;margin-top:4px}
    .ab-face{width:44px;height:44px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:18px;font-weight:900;color:#0b1226}
    .ab-pickbadges{position:absolute;top:6px;right:6px;display:flex;gap:3px}
    .ab-pb{font-size:9px;font-weight:800;padding:1px 5px;border-radius:6px;color:#0b1226}
    .ab-tabs{display:flex;gap:6px;flex-wrap:wrap;justify-content:center}
    .ab-tab{pointer-events:auto;cursor:pointer;padding:5px 14px;border-radius:8px;border:1px solid rgba(125,211,252,.3);background:rgba(10,16,34,.85);font-size:12px;font-weight:700;color:#dbeafe;font-family:inherit}
    .ab-tab.on{border-color:#ffc857;color:#ffc857}
    .ab-table{border-collapse:collapse;font-size:12px;pointer-events:auto}
    .ab-table th,.ab-table td{padding:6px 12px;border-bottom:1px solid rgba(125,211,252,.15)}
    .ab-table th{opacity:.7;font-size:10px;text-transform:uppercase;letter-spacing:1px}
    .ab-kbd{display:inline-block;background:#0b1226;border:1px solid rgba(125,211,252,.4);border-radius:5px;padding:1px 7px;font-size:11px;font-family:monospace}
    .ab-ctrl{font-size:12px;text-align:left;line-height:2.1}
    .ab-vol{display:flex;align-items:center;gap:8px;font-size:12px}
    .ab-vol input{width:130px;accent-color:#38bdf8}
    .ab-h2{font-size:26px;font-weight:900;letter-spacing:2px;margin:0}
    @media(max-width:760px){.ab-grid{grid-template-columns:repeat(2,minmax(130px,1fr))}.ab-team{width:128px}.ab-banner{font-size:30px}.ab-title{font-size:34px}.ab-fieldhud{padding:6px}}
    @keyframes ab-pulse{0%,100%{opacity:1}50%{opacity:.45}}

    /* overlay bantuan / cheat: card fleksibel, isi bisa digulir */
    .ab-screen{z-index:5;gap:12px;overflow:auto}
    .ab-modal{display:flex;flex-direction:column;width:min(780px,100%);max-height:100%;overflow:hidden;padding:16px;border:1px solid rgba(125,211,252,.28);border-radius:14px;background:rgba(8,12,26,.96);text-align:left;gap:10px}
    .ab-head{display:flex;align-items:center;justify-content:space-between;gap:10px;flex:none}
    .ab-head h3{margin:0;color:#7dd3fc;font-size:16px;font-weight:800;letter-spacing:1px}
    .ab-help{flex:1 1 auto;min-height:0;overflow:auto;display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:14px}
    .ab-cheats{flex:1 1 auto;min-height:0;overflow:auto;display:grid;grid-template-columns:repeat(auto-fill,minmax(170px,1fr));gap:8px}
    .ab-foot{display:flex;align-items:center;justify-content:space-between;gap:10px;flex:none;padding-top:10px;border-top:1px solid rgba(125,211,252,.16)}
    .ab-note{font-size:10px;opacity:.6}

    /* --- final overrides: taruh PALING AKHIR (specificity tinggi) --- */
    @media (max-width:640px){
      .ab-app.game-fill > .game-panel[data-board]:not(:has(.ab-screen:not([hidden]))){aspect-ratio:16/10;flex:0 0 auto;min-height:0}
      .ab-app.game-fill > .game-panel[data-board]:has(.ab-screen:not([hidden])){flex:0 0 auto;min-height:min(70dvh,620px);aspect-ratio:auto}
      .ab-app .ab-hud{gap:5px;margin-bottom:6px}
      .ab-app .ab-hud .ab-hudchip{padding:3px 6px;font-size:9px}
      .ab-app .ab-hud .ab-hudchip[data-hud="status"],
      .ab-app .ab-hud .ab-hudchip[data-hud="best"]{display:none}
      .ab-app .ab-hud .ab-btn{min-height:30px;padding:4px 7px;font-size:9px}
      .ab-app .ab-hud .ab-btn-label,
      .ab-app .ab-hud .ab-spacer{display:none}
      .ab-app .ab-fieldhud{padding:5px 6px}
      .ab-app .ab-fieldhud .ab-team{width:118px}
      .ab-app .ab-screen{padding:8px;justify-content:flex-start}
      .ab-app .ab-modal{width:100%;height:100%;max-height:100%;padding:12px;border-radius:12px}
      .ab-app .ab-help,.ab-app .ab-cheats{scrollbar-width:none}
      .ab-app .ab-help::-webkit-scrollbar,.ab-app .ab-cheats::-webkit-scrollbar{display:none}
      .ab-app .ab-grid{grid-template-columns:repeat(2,minmax(120px,1fr))}
      .ab-app .ab-title{font-size:32px}
      .ab-app .ab-banner{font-size:28px}
    }
    @media (pointer:coarse){
      .ab-app .ab-hud .ab-btn{min-height:30px;padding:4px 8px}
    }
  </style>
  <div class="game-app ab-app game-fill" data-ab>
    <div class="ab-hud" data-topbar>
      <span class="ab-hudchip">RONDE <b data-hud="round">1</b></span>
      <span class="ab-hudchip r">SKOR <b data-hud="score">0:0</b></span>
      <span class="ab-hudchip">WAKTU <b data-hud="timer">1:15</b></span>
      <span class="ab-hudchip">STATUS <b data-status>Siap</b></span>
      <span class="ab-hudchip">BEST <b data-hud="best">0</b></span>
      <span class="ab-spacer"></span>
      <button class="ab-btn ab-icon-btn" type="button" data-help aria-label="Cara main" title="Cara main (H)">
        <span class="ab-btn-icon">${iconSVG("helpCircle", { size: 14 })}</span><span class="ab-btn-label">Bantuan</span>
      </button>
      <button class="ab-btn ab-icon-btn" type="button" data-cheats aria-label="Cheat" title="Cheat (C)">
        <span class="ab-btn-icon">${iconSVG("wrench", { size: 14 })}</span><span class="ab-btn-label">Cheat</span>
      </button>
      <button class="ab-btn ab-icon-btn" type="button" data-pause aria-label="Jeda" title="Jeda (P)">
        <span class="ab-btn-icon" data-pause-icon>${iconSVG("pause", { size: 14 })}</span><span class="ab-btn-label">Jeda</span>
      </button>
      <button class="ab-btn ab-icon-btn" type="button" data-restart aria-label="Ulangi pertandingan" title="Ulangi (R)">
        <span class="ab-btn-icon">${iconSVG("refresh", { size: 14 })}</span><span class="ab-btn-label">Ulangi</span>
      </button>
      <button class="ab-btn ab-icon-btn" type="button" data-exit aria-label="Keluar game" title="Keluar game">
        <span class="ab-btn-icon">${iconSVG("logOut", { size: 14 })}</span><span class="ab-btn-label">Keluar</span>
      </button>
    </div>
    <section class="game-panel" data-board>
      <canvas class="ab-cv" data-cv></canvas>
      <div class="ab-vign" data-vign></div>
      <div class="ab-fieldhud" data-fieldhud style="display:none">
        <div class="ab-team">${chip(0)}${chip(2)}</div>
        <div class="ab-mid">
          <div class="ab-score"><span class="ab-pips r" data-pips="0"></span><span class="r" data-score="0">0</span><span style="opacity:.4">:</span><span class="c" data-score="1">0</span><span class="ab-pips c" data-pips="1"></span></div>
          <div class="ab-timer" data-timer>1:15</div>
          <div class="ab-round" data-round>Ronde 1 &middot; Best of 3</div>
        </div>
        <div class="ab-team">${chip(1)}${chip(3)}</div>
      </div>
      <div class="ab-banner" data-banner></div>
      <div class="ab-toast" data-toast></div>
      <div class="ab-hint" data-hint></div>
      <div class="ab-screen menu" data-screen="menu" hidden></div>
      <div class="ab-screen" data-screen="select" hidden></div>
      <div class="ab-screen" data-screen="pause" hidden></div>
      <div class="ab-screen" data-screen="results" hidden></div>
      <div class="ab-screen" data-screen="wait" hidden></div>
      <div class="ab-screen" data-ov="cheats" hidden>
        <div class="ab-modal">
          <div class="ab-head"><h3>Cheat (host)</h3><button class="ab-btn small" type="button" data-cheat-close aria-label="Tutup cheat">Tutup</button></div>
          <div class="ab-cheats" data-cheatgrid></div>
          <div class="ab-foot"><span class="ab-note">Tekan C untuk menutup · Hanya host yang bisa memakai cheat</span><button class="ab-btn primary small" type="button" data-cheat-close>Selesai</button></div>
        </div>
      </div>
      <div class="ab-screen" data-ov="help" hidden>
        <div class="ab-modal">
          <div class="ab-head"><h3>Cara Main — Arena Battle</h3><button class="ab-btn small" type="button" data-help-close aria-label="Tutup bantuan">Tutup</button></div>
          <div class="ab-help" data-help-body></div>
          <div class="ab-foot"><span class="ab-note">Tekan H untuk membuka panduan ini lagi</span><button class="ab-btn primary small" type="button" data-help-close>Mengerti</button></div>
        </div>
      </div>
    </section>
  </div>`;

    const $ = (sel) => root.querySelector(sel);
    const app = $("[data-ab]"), board = $("[data-board]"), cv = $("[data-cv]");
    const ctx = cv.getContext("2d");
    const el = {
        status: $("[data-status]"), hud: $("[data-fieldhud]"), banner: $("[data-banner]"),
        toast: $("[data-toast]"), hint: $("[data-hint]"), vign: $("[data-vign]"),
        timer: $("[data-timer]"), round: $("[data-round]"),
        top: {
            round: $("[data-hud='round']"), score: $("[data-hud='score']"),
            timer: $("[data-hud='timer']"), best: $("[data-hud='best']"),
        },
        screens: { menu: $("[data-screen='menu']"), select: $("[data-screen='select']"), pause: $("[data-screen='pause']"), results: $("[data-screen='results']"), wait: $("[data-screen='wait']") },
        ov: { help: $("[data-ov='help']"), cheats: $("[data-ov='cheats']") },
        helpBody: $("[data-help-body]"), cheatGrid: $("[data-cheatgrid]"),
        hp: [0, 1, 2, 3].map(i => $(`[data-hp='${i}']`)), en: [0, 1, 2, 3].map(i => $(`[data-en='${i}']`)),
        name: [0, 1, 2, 3].map(i => $(`[data-name='${i}']`)), tag: [0, 1, 2, 3].map(i => $(`[data-tag='${i}']`)),
        chipEl: [0, 1, 2, 3].map(i => $(`[data-chip='${i}']`)),
        score: [$("[data-score='0']"), $("[data-score='1']")], pips: [$("[data-pips='0']"), $("[data-pips='1']")],
    };

    // ---------- audio (WebAudio, tanpa aset eksternal) ----------
    const AC = (typeof window !== "undefined") && (window.AudioContext || window.webkitAudioContext);
    const AU = {
        ctx: null, master: null, mg: null, sg: null, noiseBuf: null, last: {}, mStep: 0, mNext: 0,
        ensure() {
            if (!AC || this.ctx) { if (this.ctx && this.ctx.state === "suspended") this.ctx.resume().catch(() => { }); return; }
            try {
                this.ctx = new AC();
                this.master = this.ctx.createGain(); this.master.connect(this.ctx.destination);
                this.mg = this.ctx.createGain(); this.mg.connect(this.master);
                this.sg = this.ctx.createGain(); this.sg.connect(this.master);
                const len = this.ctx.sampleRate | 0;
                this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
                const d = this.noiseBuf.getChannelData(0);
                for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
                this.setVol();
            } catch (e) { this.ctx = null; }
        },
        setVol() {
            if (!this.ctx) return;
            this.master.gain.value = cfg.vol; this.mg.gain.value = cfg.music * 0.5; this.sg.gain.value = cfg.sfx;
        },
        tone(f, d, type = "sine", v = 0.2, slide = 0, when = 0, dest) {
            if (!this.ctx) return;
            const t = this.ctx.currentTime + when;
            const o = this.ctx.createOscillator(), g = this.ctx.createGain();
            o.type = type; o.frequency.setValueAtTime(Math.max(20, f), t);
            if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, slide), t + d);
            g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
            o.connect(g); g.connect(dest || this.sg); o.start(t); o.stop(t + d + 0.03);
        },
        noise(d, v = 0.2, fq = 1200, type = "bandpass", when = 0, dest) {
            if (!this.ctx || !this.noiseBuf) return;
            const t = this.ctx.currentTime + when;
            const s = this.ctx.createBufferSource(); s.buffer = this.noiseBuf; s.loop = true;
            const f = this.ctx.createBiquadFilter(); f.type = type; f.frequency.value = fq; f.Q.value = 0.8;
            const g = this.ctx.createGain(); g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
            s.connect(f); f.connect(g); g.connect(dest || this.sg); s.start(t); s.stop(t + d + 0.03);
        },
        sfx(name) {
            if (!this.ctx || cfg.sfx <= 0 || cfg.vol <= 0) return;
            const now = this.ctx.currentTime;
            const gap = { bounce: 0.06, hit: 0.045, shoot: 0.05 }[name] || 0.02;
            if (now - (this.last[name] || 0) < gap) return;
            this.last[name] = now;
            const T = (...a) => this.tone(...a), N = (...a) => this.noise(...a);
            switch (name) {
                case "ui": T(880, .05, "sine", .12); break;
                case "select": T(600, .07, "triangle", .16, 850); break;
                case "count": T(660, .09, "square", .2); break;
                case "go": T(990, .24, "square", .26); break;
                case "hit": N(.06, .28, 1800); T(170, .08, "triangle", .3, 90); break;
                case "shoot": T(520, .07, "square", .14, 180); break;
                case "laser": T(1400, .28, "sawtooth", .22, 180); N(.24, .14, 2400); break;
                case "slam": T(70, .3, "sine", .5, 40); N(.22, .32, 300, "lowpass"); break;
                case "rush": N(.3, .22, 600); T(120, .3, "sawtooth", .16, 320); break;
                case "dash": N(.11, .16, 2200, "highpass"); break;
                case "grab": T(700, .06, "sine", .18, 950); break;
                case "pass": T(500, .07, "sine", .18, 720); break;
                case "bounce": T(180, .05, "triangle", .16, 120); break;
                case "break": N(.25, .32, 700); T(90, .2, "square", .18, 50); break;
                case "ko": T(400, .4, "sawtooth", .26, 60); N(.3, .2, 500); break;
                case "respawn": T(440, .08, "sine", .18); T(660, .08, "sine", .18, 0, .07); T(880, .12, "sine", .18, 0, .14); break;
                case "goal": T(523, .12, "square", .24); T(659, .12, "square", .24, 0, .09); T(784, .3, "square", .28, 0, .18); N(1.1, .16, 900, "bandpass", .05); break;
                case "win": [523, 659, 784, 1046, 1318].forEach((f, i) => T(f, .22, "square", .22, 0, i * .12)); N(1.4, .16, 1000, "bandpass", .2); break;
                case "sudden": T(220, .4, "sawtooth", .3, 110); N(.4, .18, 400); break;
                case "lowhp": T(660, .07, "sine", .13); T(660, .07, "sine", .13, 0, .13); break;
                case "camp": T(300, .15, "square", .18, 190); break;
            }
        },
        musicTick(active) {
            if (!this.ctx || !active || cfg.music <= 0 || cfg.vol <= 0) { this.mNext = 0; return; }
            const now = this.ctx.currentTime;
            if (!this.mNext || this.mNext < now - 0.3) this.mNext = now + 0.06;
            const bass = [55, 0, 55, 0, 65.41, 0, 49, 0, 55, 0, 55, 0, 73.42, 0, 65.41, 0];
            while (this.mNext < now + 0.16) {
                const i = this.mStep, t = this.mNext - now;
                if (i % 4 === 0) this.tone(120, .12, "sine", .32, 42, t, this.mg);
                if (bass[i]) this.tone(bass[i], .2, "sawtooth", .09, bass[i] * .99, t, this.mg);
                if (i % 2 === 1) this.noise(.03, .05, 6500, "highpass", t, this.mg);
                if (i === 2 || i === 10) this.tone(i === 10 ? 523 : 440, .09, "square", .04, 0, t, this.mg);
                this.mStep = (this.mStep + 1) % 16;
                this.mNext += 60 / 128 / 2;
            }
        },
        close() { if (this.ctx) { try { this.ctx.close(); } catch (e) { } this.ctx = null; } },
    };

    // ---------- konstanta dunia ----------
    const AR = { A: 600, B: 380, C: 170, GH: 95, GD: 74 };   // oktagon + gawang
    const PR = 25, BR = 14, BH = 34, K = 0.62;               // radius pemain/bola, tinggi barrier, squash isometrik
    const TEAM = [
        { name: "RED", col: "#ff4d5d", glow: "rgba(255,77,93,", shape: "tri" },
        { name: "CYAN", col: "#29d8e5", glow: "rgba(41,216,229,", shape: "dia" },
    ];
    const OCT = [
        [-AR.A + AR.C, -AR.B], [AR.A - AR.C, -AR.B], [AR.A, -AR.B + AR.C], [AR.A, AR.B - AR.C],
        [AR.A - AR.C, AR.B], [-AR.A + AR.C, AR.B], [-AR.A, AR.B - AR.C], [-AR.A, -AR.B + AR.C],
    ].map(([x, y]) => ({ x, y }));
    const EDGES = OCT.map((a, i) => {
        const b = OCT[(i + 1) % 8];
        const dx = b.x - a.x, dy = b.y - a.y, L = hyp(dx, dy);
        let nx = -dy / L, ny = dx / L;
        const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
        if (nx * -mx + ny * -my < 0) { nx = -nx; ny = -ny; }
        const goal = (a.x === -AR.A && b.x === -AR.A) ? -1 : (a.x === AR.A && b.x === AR.A) ? 1 : 0;
        return { a, b, nx, ny, goal };
    });
    const BARS = [
        { x: -190, y: -128, ang: Math.atan2(-128, -190) + Math.PI / 2 },
        { x: 190, y: -128, ang: Math.atan2(-128, 190) + Math.PI / 2 },
        { x: -190, y: 128, ang: Math.atan2(128, -190) + Math.PI / 2 },
        { x: 190, y: 128, ang: Math.atan2(128, 190) + Math.PI / 2 },
    ].map(b => ({ ...b, w: 118, h: 24, max: 60 }));
    const SPAWNS = [{ x: -430, y: -110 }, { x: 430, y: 110 }, { x: -430, y: 110 }, { x: 430, y: -110 }];
    const FIGHTERS = [
        {
            id: "phantom", name: "Hooded Phantom", role: "Jarak Jauh", hp: 85, spd: 308, mass: .85, col: "#a78bfa", col2: "#6d28d9", glyph: "P",
            atk: { type: "shot", cd: .34, dmg: 8, kb: 170, spd: 920, r: 7 },
            skl: { name: "Laser Penembus", cost: 45, cd: 5, type: "beam", dmg: 22, kb: 420, len: 640, w: 26, ball: 950 }
        },
        {
            id: "luchador", name: "Luchador", role: "Petarung", hp: 112, spd: 272, mass: 1.1, col: "#f97316", col2: "#c2410c", glyph: "L",
            atk: { type: "melee", cd: .52, dmg: 16, kb: 430, range: 74, arc: 1.9, ball: 900 },
            skl: { name: "Gelombang Kejut", cost: 50, cd: 6, type: "slam", dmg: 18, kb: 660, r: 190, ball: 830 }
        },
        {
            id: "mech", name: "Mech Striker", role: "Seimbang", hp: 100, spd: 288, mass: 1, col: "#38bdf8", col2: "#0369a1", glyph: "M",
            atk: { type: "shot", cd: .42, dmg: 10, kb: 210, spd: 800, r: 8 },
            skl: { name: "Tembakan Beruntun", cost: 45, cd: 5, type: "burst", n: 6, dmg: 6, kb: 150, spd: 900 }
        },
        {
            id: "yeti", name: "Yeti Bruiser", role: "Tank", hp: 138, spd: 246, mass: 1.45, col: "#e2e8f0", col2: "#64748b", glyph: "Y",
            atk: { type: "melee", cd: .66, dmg: 12, kb: 520, range: 88, arc: 2.6, ball: 840 },
            skl: { name: "Terjangan Es", cost: 50, cd: 6, type: "rush", dmg: 20, kb: 720, dur: .45, spd: 1020, ball: 1000 }
        },
    ];

    // ---------- geometri ----------
    function collideWalls(o, r, rest, isBall) {
        let hit = false;
        for (const e of EDGES) {
            if (isBall && e.goal && Math.abs(o.y) < AR.GH - 4) continue; // mulut gawang
            const d = (o.x - e.a.x) * e.nx + (o.y - e.a.y) * e.ny;
            if (d < r) {
                o.x += e.nx * (r - d); o.y += e.ny * (r - d);
                const vn = o.vx * e.nx + o.vy * e.ny;
                if (vn < 0) { o.vx -= e.nx * vn * (1 + rest); o.vy -= e.ny * vn * (1 + rest); hit = true; }
            }
        }
        return hit;
    }
    function circleOBB(o, r, b, rest) {
        const c = Math.cos(b.ang), s = Math.sin(b.ang);
        const dx = o.x - b.x, dy = o.y - b.y;
        const lx = dx * c + dy * s, ly = -dx * s + dy * c;
        const hx = b.w / 2, hy = b.h / 2;
        const qx = clamp(lx, -hx, hx), qy = clamp(ly, -hy, hy);
        let ddx = lx - qx, ddy = ly - qy, d = hyp(ddx, ddy);
        if (d >= r) return false;
        let nlx, nly;
        if (d > 0.0001) { nlx = ddx / d; nly = ddy / d; } else { nlx = 0; nly = ly >= 0 ? 1 : -1; d = 0; }
        const push = r - d, nx = nlx * c - nly * s, ny = nlx * s + nly * c;
        o.x += nx * push; o.y += ny * push;
        if (rest != null) {
            const vn = o.vx * nx + o.vy * ny;
            if (vn < 0) { o.vx -= nx * vn * (1 + rest); o.vy -= ny * vn * (1 + rest); }
        }
        return true;
    }
    function segDist(px, py, x1, y1, x2, y2) {
        const dx = x2 - x1, dy = y2 - y1, L2 = dx * dx + dy * dy || 1;
        const t = clamp(((px - x1) * dx + (py - y1) * dy) / L2, 0, 1);
        return hyp(px - (x1 + dx * t), py - (y1 + dy * t));
    }
    function losBlocked(S, x1, y1, x2, y2) {
        for (const b of S.barriers) {
            if (b.hp <= 0) continue;
            if (segDist(b.x, b.y, x1, y1, x2, y2) < b.w / 2 + 8) return true;
        }
        return false;
    }

    // ---------- state ----------
    let S = null;
    const ui = { screen: "menu", paused: false, activeSlot: 0 };
    function makePlayer(slot, f, bot) {
        const F = FIGHTERS[f], sp = SPAWNS[slot];
        return {
            slot, team: (slot === 0 || slot === 2) ? 0 : 1, f, bot, auto: false,
            x: sp.x, y: sp.y, vx: 0, vy: 0, aim: slot === 0 || slot === 2 ? 0 : Math.PI,
            hp: F.hp, en: 100, cdA: 0, cdS: 0, cdD: 0, dashT: 0, dashX: 0, dashY: 0,
            rushT: 0, rushX: 0, rushY: 0, rushHit: [], stunT: 0, koT: 0, invulnT: 0,
            flashT: 0, carryT: 0, campT: 0, campWarned: false, burstN: 0, burstT: 0,
            lastHitBy: null, stats: { g: 0, k: 0, d: 0, a: 0 },
            bt: rnd(0.4), btx: sp.x, bty: sp.y, bax: sp.x + 100, bay: sp.y, bAtk: false, bSkl: false, bDash: false, bGrab: false, bmode: "chase",
        };
    }
    function newState(settings, picks, demo) {
        return {
            demo: !!demo, settings: { ...settings }, picks: picks.slice(),
            phase: "countdown", phaseT: 3, lastCount: 4, timer: settings.roundLen,
            round: 1, score: [0, 0], wins: [0, 0], sd: false, sdT: 0, sdBoost: false,
            ballMult: 1, goalTeam: 0, time: 0,
            players: [0, 1, 2, 3].map(i => makePlayer(i, picks[i], i >= settings.humans)),
            ball: { x: 0, y: 0, vx: 0, vy: 0, carrier: -1, noCatchT: 0, stuckT: 0, trail: [] },
            barriers: BARS.map(b => ({ ...b, hp: b.max })),
            proj: [], touches: [],
        };
    }
    function resetRound(st) {
        st.score = [0, 0]; st.timer = st.settings.roundLen; st.sd = false; st.sdT = 0;
        st.sdBoost = false; st.ballMult = 1; st.proj = []; st.touches = [];
        st.barriers.forEach(b => b.hp = b.max);
        Object.assign(st.ball, { x: 0, y: 0, vx: 0, vy: 0, carrier: -1, noCatchT: 0, stuckT: 0, trail: [] });
        st.players.forEach(p => {
            const F = FIGHTERS[p.f], sp = SPAWNS[p.slot];
            Object.assign(p, {
                x: sp.x, y: sp.y, vx: 0, vy: 0, aim: p.team === 0 ? 0 : Math.PI,
                hp: F.hp, en: 100, cdA: 0, cdS: 0, cdD: 0, dashT: 0, rushT: 0, stunT: 0,
                koT: 0, invulnT: 0, flashT: 0, carryT: 0, campT: 0, campWarned: false, burstN: 0, lastHitBy: null, bt: rnd(.5),
            });
        });
        emit("reset", {});
    }
    const newDemo = () => newState({ humans: 0, diff: 1, roundLen: 60 }, [0, 1, 2, 3].map(() => (Math.random() * 4) | 0), true);

    // ---------- combat & bola ----------
    function touchBall(st, i) {
        st.touches.push({ i, t: st.time });
        if (st.touches.length > 8) st.touches.shift();
    }
    function impulseBall(st, b, nx, ny, power, i) {
        if (b.carrier >= 0) { const c = st.players[b.carrier]; b.carrier = -1; c.carryT = 0; }
        b.vx += nx * power * st.ballMult; b.vy += ny * power * st.ballMult;
        b.noCatchT = 0.25; b.stuckT = 0;
        if (i != null) { touchBall(st, i); const p = st.players[i]; p.en = Math.min(100, p.en + 3); }
    }
    function releaseBall(st, p, vx, vy) {
        const b = st.ball;
        b.carrier = -1; p.carryT = 0; b.vx = vx * st.ballMult; b.vy = vy * st.ballMult;
        b.noCatchT = 0.3; b.stuckT = 0; touchBall(st, p.slot);
    }
    function dropBall(st, p, nx, ny) {
        if (st.ball.carrier !== p.slot) return;
        st.ball.carrier = -1; p.carryT = 0;
        st.ball.vx = nx * 220 + rnd(-80, 80); st.ball.vy = ny * 220 + rnd(-80, 80);
        st.ball.noCatchT = 0.35;
    }
    function resetBall(st) {
        const b = st.ball;
        if (b.carrier >= 0) st.players[b.carrier].carryT = 0;
        Object.assign(b, { x: 0, y: 0, vx: 0, vy: 0, carrier: -1, noCatchT: 0, stuckT: 0, trail: [] });
        emit("ballreset", {});
    }
    function fireShot(st, p, ang, dmg, kb, spd, type) {
        st.proj.push({
            x: p.x + Math.cos(ang) * (PR + 6), y: p.y + Math.sin(ang) * (PR + 6),
            vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd,
            r: type === "burst" ? 6 : 8, dmg, kb, team: p.team, owner: p.slot, life: 1.15, type,
            col: FIGHTERS[p.f].col,
        });
        emit("muzzle", { x: p.x, y: p.y, ang, col: FIGHTERS[p.f].col });
        emit("sfx", { n: "shoot" });
    }
    function damageBarrier(st, bar, dmg) {
        if (bar.hp <= 0) return;
        bar.hp -= dmg;
        if (bar.hp <= 0) { bar.hp = 0; emit("break", { x: bar.x, y: bar.y }); }
    }
    function applyDamage(st, q, dmg, nx, ny, kb, attacker) {
        if (q.koT > 0 || q.invulnT > 0 || st.phase !== "play") return;
        if (q.rushT > 0) { dmg *= 0.5; kb *= 0.3; }
        q.hp -= dmg; q.flashT = 0.12;
        q.vx += nx * kb; q.vy += ny * kb;
        if (kb >= 450 && q.rushT <= 0) q.stunT = Math.max(q.stunT, 0.18);
        const a = st.players[attacker];
        if (a && a.team !== q.team) {
            a.en = Math.min(100, a.en + 6); a.stats.d += dmg;
            q.lastHitBy = { i: attacker, t: st.time };
        }
        if (st.ball.carrier === q.slot) dropBall(st, q, nx, ny);
        emit("hit", { x: q.x, y: q.y, col: a ? FIGHTERS[a.f].col : "#fff", dmg: Math.round(dmg), big: dmg >= 15 });
        if (q.hp <= 0) {
            q.hp = 0; q.koT = 5; q.stunT = 0; q.dashT = 0; q.rushT = 0; q.burstN = 0;
            dropBall(st, q, nx, ny);
            if (q.lastHitBy && st.time - q.lastHitBy.t < 5) {
                const k = st.players[q.lastHitBy.i];
                if (k && k.team !== q.team) k.stats.k++;
            }
            emit("ko", { x: q.x, y: q.y, team: q.team, slot: q.slot });
        }
    }
    function respawn(st, p) {
        const F = FIGHTERS[p.f], sp = SPAWNS[p.slot];
        Object.assign(p, { x: sp.x, y: sp.y, vx: 0, vy: 0, hp: F.hp, en: 55, koT: 0, invulnT: 1.2, stunT: 0, campT: 0, aim: p.team === 0 ? 0 : Math.PI });
        emit("respawn", { x: p.x, y: p.y, team: p.team });
    }
    function doDash(st, p, cmd) {
        if (p.cdD > 0 || p.en < 12) return;
        let dx = cmd.mx, dy = cmd.my;
        if (hyp(dx, dy) < 0.1) { dx = Math.cos(p.aim); dy = Math.sin(p.aim); }
        const l = hyp(dx, dy) || 1;
        p.en -= 12; p.cdD = 0.9; p.dashT = 0.16; p.dashX = dx / l; p.dashY = dy / l;
        p.invulnT = Math.max(p.invulnT, 0.18);
        emit("dash", { x: p.x, y: p.y, col: FIGHTERS[p.f].col });
    }
    function doGrab(st, p) {
        const b = st.ball;
        if (b.carrier === p.slot) {
            releaseBall(st, p, Math.cos(p.aim) * 640, Math.sin(p.aim) * 640);
            emit("pass", { x: p.x, y: p.y });
        } else if (b.carrier < 0 && b.noCatchT <= 0 && dist(p, b) < PR + BR + 16) {
            b.carrier = p.slot; p.carryT = 3; b.stuckT = 0; touchBall(st, p.slot);
            emit("grab", { x: p.x, y: p.y });
        }
    }
    function doAttack(st, p) {
        if (p.cdA > 0) return;
        const F = FIGHTERS[p.f], b = st.ball;
        if (b.carrier === p.slot) { // tembak bola
            releaseBall(st, p, Math.cos(p.aim) * 1050, Math.sin(p.aim) * 1050);
            p.cdA = F.atk.cd * 0.6;
            emit("shootball", { x: b.x, y: b.y, ang: p.aim });
            return;
        }
        p.cdA = F.atk.cd;
        if (F.atk.type === "shot") { fireShot(st, p, p.aim, F.atk.dmg, F.atk.kb, F.atk.spd, "shot"); return; }
        // melee: busur serang
        emit("swing", { x: p.x, y: p.y, ang: p.aim, range: F.atk.range, arc: F.atk.arc, col: F.col });
        for (const q of st.players) {
            if (q.team === p.team || q.koT > 0) continue;
            const d = dist(p, q);
            if (d < F.atk.range + PR && Math.abs(angDiff(p.aim, Math.atan2(q.y - p.y, q.x - p.x))) < F.atk.arc / 2) {
                const l = d || 1;
                applyDamage(st, q, F.atk.dmg, (q.x - p.x) / l, (q.y - p.y) / l, F.atk.kb, p.slot);
            }
        }
        for (const bar of st.barriers) {
            if (bar.hp <= 0) continue;
            const d = dist(p, bar);
            if (d < F.atk.range + 44 && Math.abs(angDiff(p.aim, Math.atan2(bar.y - p.y, bar.x - p.x))) < F.atk.arc / 2 + 0.3) damageBarrier(st, bar, F.atk.dmg);
        }
        if (b.carrier < 0 && dist(p, b) < F.atk.range + BR + 6 && Math.abs(angDiff(p.aim, Math.atan2(b.y - p.y, b.x - p.x))) < F.atk.arc / 2 + 0.35) {
            impulseBall(st, b, Math.cos(p.aim), Math.sin(p.aim), F.atk.ball, p.slot);
            emit("ballhit", { x: b.x, y: b.y });
        }
    }
    function doSpecial(st, p) {
        const F = FIGHTERS[p.f], sk = F.skl;
        if (p.cdS > 0 || p.en < sk.cost) return;
        p.en -= sk.cost; p.cdS = sk.cd;
        const ca = Math.cos(p.aim), sa = Math.sin(p.aim), b = st.ball;
        if (sk.type === "beam") {
            const x2 = p.x + ca * sk.len, y2 = p.y + sa * sk.len;
            for (const q of st.players) {
                if (q.team === p.team || q.koT > 0) continue;
                if (segDist(q.x, q.y, p.x, p.y, x2, y2) < sk.w / 2 + PR) applyDamage(st, q, sk.dmg, ca, sa, sk.kb, p.slot);
            }
            for (const bar of st.barriers) if (bar.hp > 0 && segDist(bar.x, bar.y, p.x, p.y, x2, y2) < sk.w / 2 + 40) damageBarrier(st, bar, 40);
            if (b.carrier < 0 && segDist(b.x, b.y, p.x, p.y, x2, y2) < sk.w / 2 + BR) impulseBall(st, b, ca, sa, sk.ball, p.slot);
            emit("beam", { x1: p.x, y1: p.y, x2, y2, col: F.col });
            emit("sfx", { n: "laser" });
        } else if (sk.type === "slam") {
            for (const q of st.players) {
                if (q.team === p.team || q.koT > 0) continue;
                const d = dist(p, q);
                if (d < sk.r + PR) { const l = d || 1; applyDamage(st, q, sk.dmg, (q.x - p.x) / l, (q.y - p.y) / l, sk.kb, p.slot); }
            }
            for (const bar of st.barriers) if (bar.hp > 0 && dist(p, bar) < sk.r + 40) damageBarrier(st, bar, 45);
            if (b.carrier < 0 && dist(p, b) < sk.r + BR) {
                const d = dist(p, b) || 1;
                impulseBall(st, b, (b.x - p.x) / d, (b.y - p.y) / d, sk.ball, p.slot);
            }
            emit("slam", { x: p.x, y: p.y, r: sk.r, col: F.col });
        } else if (sk.type === "burst") {
            p.burstN = sk.n; p.burstT = 0;
            emit("sfx", { n: "select" });
        } else if (sk.type === "rush") {
            p.rushT = sk.dur; p.rushX = ca; p.rushY = sa; p.rushHit = [];
            emit("rush", { x: p.x, y: p.y, col: F.col });
        }
    }
    function scoreGoal(st, team) {
        if (st.phase !== "play") return;
        st.score[team]++; st.wins[team]++;
        const last = st.touches[st.touches.length - 1];
        const scorer = last ? st.players[last.i] : null;
        let own = false;
        if (scorer && scorer.team === team) {
            scorer.stats.g++;
            for (let i = st.touches.length - 2; i >= 0; i--) {
                const t = st.touches[i];
                if (st.time - t.t > 8) break;
                const q = st.players[t.i];
                if (q.team === team && t.i !== scorer.slot) { q.stats.a++; break; }
            }
        } else own = !!scorer;
        if (st.ball.carrier >= 0) { st.players[st.ball.carrier].carryT = 0; st.ball.carrier = -1; }
        st.ball.vx *= 0.2; st.ball.vy *= 0.2;
        st.phase = "goal"; st.phaseT = 2.4; st.goalTeam = team;
        emit("goal", { team, x: team === 0 ? AR.A : -AR.A, y: 0, own });
    }

    // ---------- langkah simulasi ----------
    function playerStep(st, p, dt, cmd) {
        p.cdA = Math.max(0, p.cdA - dt); p.cdS = Math.max(0, p.cdS - dt); p.cdD = Math.max(0, p.cdD - dt);
        p.flashT = Math.max(0, p.flashT - dt); p.invulnT = Math.max(0, p.invulnT - dt); p.stunT = Math.max(0, p.stunT - dt);
        if (p.koT > 0) {
            if (st.phase === "play") { p.koT -= dt; if (p.koT <= 0) respawn(st, p); }
            return;
        }
        if (st.phase !== "play") { p.vx *= Math.pow(.02, dt); p.vy *= Math.pow(.02, dt); p.x += p.vx * dt; p.y += p.vy * dt; collideWalls(p, PR, .2, false); return; }
        const F = FIGHTERS[p.f];
        p.en = Math.min(100, p.en + 9 * dt);
        if (p.burstN > 0) {
            p.burstT -= dt;
            if (p.burstT <= 0) { p.burstT = 0.09; p.burstN--; fireShot(st, p, p.aim + rnd(-.07, .07), F.skl.dmg, F.skl.kb, F.skl.spd, "burst"); }
        }
        if (cmd && cmd.ax != null) {
            const ta = Math.atan2(cmd.ay - p.y, cmd.ax - p.x);
            p.aim = (p.bot || p.auto) ? angLerp(p.aim, ta, 10 * dt) : ta;
        }
        let mvx = cmd ? cmd.mx : 0, mvy = cmd ? cmd.my : 0;
        const ml = hyp(mvx, mvy);
        if (ml > 1) { mvx /= ml; mvy /= ml; }
        if (p.stunT > 0) { mvx = 0; mvy = 0; }
        let spd = F.spd * (st.ball.carrier === p.slot ? 0.88 : 1);
        if ((p.bot || p.auto) && st.settings.diff === 0) spd *= 0.86;
        const acc = p.stunT > 0 ? 2.2 : 11;
        p.vx += (mvx * spd - p.vx) * Math.min(1, acc * dt);
        p.vy += (mvy * spd - p.vy) * Math.min(1, acc * dt);
        if (p.dashT > 0) { p.dashT -= dt; p.vx = p.dashX * 820; p.vy = p.dashY * 820; }
        if (p.rushT > 0) {
            p.rushT -= dt; p.vx = p.rushX * F.skl.spd; p.vy = p.rushY * F.skl.spd;
            for (const q of st.players) {
                if (q.team === p.team || q.koT > 0 || p.rushHit.includes(q.slot)) continue;
                if (dist(p, q) < PR * 2 + 4) { p.rushHit.push(q.slot); applyDamage(st, q, F.skl.dmg, p.rushX, p.rushY, F.skl.kb, p.slot); }
            }
            const b = st.ball;
            if (b.carrier < 0 && dist(p, b) < PR + BR + 6) impulseBall(st, b, p.rushX, p.rushY, F.skl.ball, p.slot);
            if (p.rushT <= 0) emit("crack", { x: p.x, y: p.y });
        }
        p.x += p.vx * dt; p.y += p.vy * dt;
        collideWalls(p, PR, 0.25, false);
        for (const bar of st.barriers) if (bar.hp > 0) circleOBB(p, PR, bar, null);
        for (const q of st.players) {
            if (q.slot <= p.slot || q.koT > 0) continue;
            const dx = q.x - p.x, dy = q.y - p.y, d = hyp(dx, dy) || 0.001, min = PR * 2;
            if (d < min) {
                const ov = min - d, nx = dx / d, ny = dy / d;
                const mp = F.mass, mq = FIGHTERS[q.f].mass;
                p.x -= nx * ov * mq / (mp + mq); p.y -= ny * ov * mq / (mp + mq);
                q.x += nx * ov * mp / (mp + mq); q.y += ny * ov * mp / (mp + mq);
            }
        }
        // anti-camping di area gawang sendiri (maks 3 detik)
        const inZone = (p.team === 0 ? p.x < -AR.A + 150 : p.x > AR.A - 150) && Math.abs(p.y) < AR.GH + 40;
        if (inZone) {
            p.campT += dt;
            if (p.campT > 1.4 && !p.campWarned) { p.campWarned = true; emit("campwarn", { slot: p.slot, team: p.team }); }
            if (p.campT >= 3) {
                p.campT = 0; p.campWarned = false;
                p.vx = (p.team === 0 ? 1 : -1) * 760; p.vy = rnd(-160, 160); p.stunT = 0.5;
                emit("camp", { x: p.x, y: p.y, team: p.team });
            }
        } else { p.campT = 0; p.campWarned = false; }
        if (p.stunT > 0 || !cmd) return;
        if (cmd.dash) doDash(st, p, cmd);
        if (cmd.grab) doGrab(st, p);
        if (cmd.skl) doSpecial(st, p);
        if (cmd.atk) doAttack(st, p);
    }
    function projStep(st, dt) {
        for (let i = st.proj.length - 1; i >= 0; i--) {
            const pr = st.proj[i];
            pr.x += pr.vx * dt; pr.y += pr.vy * dt; pr.life -= dt;
            let dead = pr.life <= 0;
            if (!dead) {
                const probe = { x: pr.x, y: pr.y, vx: pr.vx, vy: pr.vy };
                if (collideWalls(probe, pr.r, 0, false)) { dead = true; emit("spark", { x: pr.x, y: pr.y, col: pr.col }); }
            }
            if (!dead) for (const bar of st.barriers) {
                if (bar.hp <= 0) continue;
                if (circleOBB(pr, pr.r, bar, null)) { damageBarrier(st, bar, pr.dmg * 1.6); dead = true; emit("spark", { x: pr.x, y: pr.y, col: pr.col }); break; }
            }
            if (!dead) for (const q of st.players) {
                if (q.team === pr.team || q.koT > 0 || q.invulnT > 0) continue;
                if (dist(pr, q) < PR + pr.r) {
                    const l = hyp(pr.vx, pr.vy) || 1;
                    applyDamage(st, q, pr.dmg, pr.vx / l, pr.vy / l, pr.kb, pr.owner);
                    dead = true; break;
                }
            }
            if (!dead && st.ball.carrier < 0 && dist(pr, st.ball) < BR + pr.r) {
                const l = hyp(pr.vx, pr.vy) || 1;
                impulseBall(st, st.ball, pr.vx / l, pr.vy / l, 520, pr.owner);
                emit("ballhit", { x: st.ball.x, y: st.ball.y });
                dead = true;
            }
            if (dead) st.proj.splice(i, 1);
        }
    }
    function ballStep(st, dt) {
        const b = st.ball;
        b.noCatchT = Math.max(0, b.noCatchT - dt);
        if (b.carrier >= 0) {
            const c = st.players[b.carrier];
            if (c.koT > 0) { b.carrier = -1; }
            else {
                b.x = c.x + Math.cos(c.aim) * 36; b.y = c.y + Math.sin(c.aim) * 36;
                b.vx = c.vx; b.vy = c.vy;
                c.carryT -= dt;
                if (c.carryT <= 0) releaseBall(st, c, Math.cos(c.aim) * 280, Math.sin(c.aim) * 280);
            }
        }
        if (b.carrier < 0) {
            b.x += b.vx * dt; b.y += b.vy * dt;
            const fr = Math.pow(0.5, dt);
            b.vx *= fr; b.vy *= fr;
            let sp = hyp(b.vx, b.vy);
            const max = 1500 * st.ballMult;
            if (sp > max) { b.vx *= max / sp; b.vy *= max / sp; sp = max; }
            if (collideWalls(b, BR, 0.86, true) && sp > 120) emit("bounce", { x: b.x, y: b.y });
            for (const bar of st.barriers) {
                if (bar.hp <= 0) continue;
                if (circleOBB(b, BR, bar, 0.8)) {
                    if (sp > 420) damageBarrier(st, bar, sp / 26);
                    if (sp > 120) emit("bounce", { x: b.x, y: b.y });
                }
            }
            for (const p of st.players) {
                if (p.koT > 0) continue;
                const d = dist(p, b);
                if (d < PR + BR) {
                    const nx = (b.x - p.x) / (d || 1), ny = (b.y - p.y) / (d || 1);
                    b.x = p.x + nx * (PR + BR); b.y = p.y + ny * (PR + BR);
                    const vn = (b.vx - p.vx) * nx + (b.vy - p.vy) * ny;
                    if (vn < 0) { b.vx -= nx * vn * 1.6; b.vy -= ny * vn * 1.6; }
                    b.vx += p.vx * 0.35 + nx * 110; b.vy += p.vy * 0.35 + ny * 110;
                    touchBall(st, p.slot);
                }
            }
            if (sp < 12) { b.stuckT += dt; if (b.stuckT > 4) resetBall(st); } else b.stuckT = 0;
            if (sp > 260) { b.trail.push({ x: b.x, y: b.y }); if (b.trail.length > 12) b.trail.shift(); }
            else if (b.trail.length) b.trail.shift();
        } else if (b.trail.length) b.trail.shift();
        // deteksi gol (bola bebas maupun dibawa)
        if (b.x < -AR.A - 6 && Math.abs(b.y) < AR.GH) scoreGoal(st, 1);
        else if (b.x > AR.A + 6 && Math.abs(b.y) < AR.GH) scoreGoal(st, 0);
        // jaring gawang
        if (b.x < -AR.A - AR.GD + BR) { b.x = -AR.A - AR.GD + BR; b.vx = Math.abs(b.vx) * 0.3; }
        if (b.x > AR.A + AR.GD - BR) { b.x = AR.A + AR.GD - BR; b.vx = -Math.abs(b.vx) * 0.3; }
        if (!isFinite(b.x) || !isFinite(b.y) || Math.abs(b.y) > AR.B + 200) resetBall(st);
    }
    function stepSim(st, dt, cmds) {
        st.time += dt;
        if (st.phase === "countdown") {
            st.phaseT -= dt;
            const c = Math.ceil(st.phaseT);
            if (c !== st.lastCount && c > 0) { st.lastCount = c; emit("count", { n: c }); }
            if (st.phaseT <= 0) { st.phase = "play"; emit("go", {}); }
        } else if (st.phase === "play") {
            if (!st.sd) {
                st.timer -= dt;
                if (st.timer <= 0) { st.timer = 0; st.sd = true; st.sdT = 0; emit("sudden", {}); }
            } else {
                st.sdT += dt;
                if (st.sdT > 30 && !st.sdBoost) {
                    st.sdBoost = true; st.ballMult = 1.45;
                    for (const bar of st.barriers) if (bar.hp > 0) { bar.hp = 0; emit("break", { x: bar.x, y: bar.y }); }
                    emit("sdboost", {});
                }
            }
        } else if (st.phase === "goal") {
            st.phaseT -= dt;
            if (st.phaseT <= 0) {
                if (st.wins[st.goalTeam] >= 2) { st.phase = "matchend"; st.phaseT = 2.4; emit("matchwin", { team: st.goalTeam }); }
                else { st.phase = "roundend"; st.phaseT = 1.8; emit("roundwin", { team: st.goalTeam, round: st.round }); }
            }
        } else if (st.phase === "roundend") {
            st.phaseT -= dt;
            if (st.phaseT <= 0) { st.round++; resetRound(st); st.phase = "countdown"; st.phaseT = 3; st.lastCount = 4; }
        } else if (st.phase === "matchend") {
            st.phaseT -= dt;
            if (st.phaseT <= 0) st.phase = "done";
        }
        for (const p of st.players) {
            let cmd = cmds ? cmds[p.slot] : null;
            if ((p.bot || p.auto) && st.phase === "play" && p.koT <= 0) cmd = botCmd(st, p, dt);
            playerStep(st, p, dt, cmd);
        }
        if (st.phase === "play") { projStep(st, dt); ballStep(st, dt); }
        else { st.proj.length = 0; }
    }

    // ---------- AI bot (state machine: chase / support / hunt / defend / carry) ----------
    function botDecide(st, p, D) {
        const b = st.ball, team = p.team;
        const goalX = team === 0 ? AR.A : -AR.A;         // gawang lawan
        const ownX = team === 0 ? -AR.A : AR.A;
        const goalDir = team === 0 ? 1 : -1;
        const mate = st.players.find(q => q.team === team && q.slot !== p.slot && q.koT <= 0);
        const enemies = st.players.filter(q => q.team !== team && q.koT <= 0);
        const nearEnemy = enemies.length ? enemies.reduce((a, q) => dist(p, q) < dist(p, a) ? q : a) : null;
        const F = FIGHTERS[p.f];
        const err = (D ? 0.1 : 0.34) * rnd(-1, 1);
        const aimAt = (tx, ty) => {
            const dx = tx - p.x, dy = ty - p.y, d = hyp(dx, dy) || 1;
            p.bax = tx + (-dy / d) * err * d; p.bay = ty + (dx / d) * err * d;
        };
        p.bAtk = false; p.bSkl = false; p.bDash = false; p.bGrab = false;
        const iAmNearest = !mate || dist(p, b) <= dist(mate, b);
        const sk = F.skl;
        const canSk = p.cdS <= 0 && p.en >= sk.cost && Math.random() < (D ? 0.85 : 0.35);

        if (b.carrier === p.slot) {
            p.bmode = "carry";
            p.btx = goalX - goalDir * 60; p.bty = clamp(p.y * 0.5, -60, 60);
            const dGoal = hyp(goalX - p.x, p.y);
            aimAt(goalX, clamp(p.y * 0.3, -AR.GH * .6, AR.GH * .6));
            p.bAtk = dGoal < 520 || (nearEnemy && dist(p, nearEnemy) < 130);
            if (canSk && dGoal < 560 && (sk.type === "rush" || sk.type === "beam" || sk.type === "burst")) p.bSkl = true;
            if (p.en > 60 && dGoal > 350 && Math.random() < (D ? .3 : .1)) p.bDash = true;
            return;
        }
        if (b.carrier >= 0) {
            const c = st.players[b.carrier];
            if (c.team === team) {
                p.bmode = "support";
                p.btx = clamp(c.x + goalDir * 190, -AR.A + 120, AR.A - 120);
                p.bty = clamp(c.y + (p.slot < 2 ? -150 : 150), -AR.B + 80, AR.B - 80);
                if (nearEnemy && dist(p, nearEnemy) < 400) {
                    aimAt(nearEnemy.x, nearEnemy.y);
                    const rng = F.atk.type === "melee" ? F.atk.range + PR : 430;
                    p.bAtk = dist(p, nearEnemy) < rng && (F.atk.type === "melee" || !losBlocked(st, p.x, p.y, nearEnemy.x, nearEnemy.y));
                } else aimAt(b.x, b.y);
            } else {
                if (iAmNearest) {
                    p.bmode = "hunt";
                    p.btx = c.x; p.bty = c.y;
                    aimAt(c.x, c.y);
                    const rng = F.atk.type === "melee" ? F.atk.range + PR : 430;
                    p.bAtk = dist(p, c) < rng;
                    if (canSk && dist(p, c) < (sk.type === "slam" ? 160 : sk.type === "rush" ? 330 : 560)) {
                        if (sk.type === "beam" || sk.type === "burst") { if (!losBlocked(st, p.x, p.y, c.x, c.y)) p.bSkl = true; }
                        else p.bSkl = true;
                    }
                    if (dist(p, c) > 260 && p.en > 45 && Math.random() < (D ? .3 : .08)) p.bDash = true;
                } else {
                    p.bmode = "defend";
                    p.btx = clamp(lerp(c.x, ownX, 0.5), -AR.A + 200, AR.A - 200);
                    p.bty = clamp(c.y * 0.5, -AR.GH, AR.GH);
                    aimAt(c.x, c.y);
                    if (nearEnemy && dist(p, nearEnemy) < F.atk.range + PR + 30) p.bAtk = true;
                }
            }
            return;
        }
        // bola bebas
        const danger = (team === 0 ? b.x < -AR.A + 280 : b.x > AR.A - 280);
        if (iAmNearest || danger) {
            p.bmode = "chase";
            const lead = D ? 0.16 : 0.08;
            const tx = b.x + b.vx * lead, ty = b.y + b.vy * lead;
            // dekati bola dari sisi belakang agar pukulan mengarah ke gawang lawan
            p.btx = tx - goalDir * 34; p.bty = ty;
            const dBall = dist(p, b);
            const aligned = (b.x - p.x) * goalDir > -10;
            if (F.atk.type === "melee") {
                if (dBall < F.atk.range + BR + 14 && aligned) { aimAt(goalX, clamp(b.y * 0.4, -AR.GH, AR.GH)); p.bAtk = true; }
                else aimAt(tx, ty);
                if (canSk && dBall < (sk.type === "slam" ? 150 : 330) && aligned) p.bSkl = true;
            } else {
                if (dBall < 430 && aligned && Math.abs(b.y - p.y) < 200 && !losBlocked(st, p.x, p.y, goalX * 0.9, b.y)) {
                    aimAt(goalX, clamp(b.y * 0.4, -AR.GH, AR.GH)); p.bAtk = true;
                } else aimAt(tx, ty);
                if (canSk && dBall < 560 && aligned && !losBlocked(st, p.x, p.y, b.x, b.y)) p.bSkl = true;
            }
            if (D && dBall < PR + BR + 14 && Math.random() < 0.4) p.bGrab = true;
            if (dBall > 300 && p.en > 50 && Math.random() < (D ? .28 : .07)) p.bDash = true;
            if (nearEnemy && dist(p, nearEnemy) < (F.atk.type === "melee" ? F.atk.range + PR : 300) && Math.random() < 0.45) {
                aimAt(nearEnemy.x, nearEnemy.y); p.bAtk = true;
            }
        } else {
            p.bmode = "defend";
            p.btx = clamp(lerp(b.x, ownX, 0.45), -AR.A + 210, AR.A - 210);
            p.bty = clamp(b.y * 0.45, -AR.GH - 30, AR.GH + 30);
            if (nearEnemy && dist(p, nearEnemy) < 380) {
                aimAt(nearEnemy.x, nearEnemy.y);
                const rng = F.atk.type === "melee" ? F.atk.range + PR : 400;
                p.bAtk = dist(p, nearEnemy) < rng;
            } else aimAt(b.x, b.y);
        }
    }
    function botCmd(st, p, dt) {
        const D = st.settings.diff;
        p.bt -= dt;
        if (p.bt <= 0) { p.bt = (D ? 0.16 : 0.42) * rnd(0.75, 1.25); botDecide(st, p, D); }
        let dx = p.btx - p.x, dy = p.bty - p.y;
        const d = hyp(dx, dy);
        let mx = 0, my = 0;
        if (d > 14) { mx = dx / d; my = dy / d; }
        // hindari barrier: probe di depan, geser tegak lurus
        if (mx || my) {
            const probe = { x: p.x + mx * 74, y: p.y + my * 74, vx: 0, vy: 0 };
            for (const bar of st.barriers) {
                if (bar.hp <= 0) continue;
                if (circleOBB(probe, PR + 6, bar, null)) {
                    const side = p.slot % 2 ? 1 : -1;
                    const ox = mx, oy = my;
                    mx = ox * 0.35 - oy * side; my = oy * 0.35 + ox * side;
                    const l = hyp(mx, my) || 1; mx /= l; my /= l;
                    break;
                }
            }
        }
        const cmd = { mx, my, ax: p.bax, ay: p.bay, atk: p.bAtk, skl: p.bSkl, dash: p.bDash, grab: p.bGrab };
        p.bSkl = p.bDash = p.bGrab = false;
        return cmd;
    }

    // ---------- FX (partikel, beam, ring, teks, retakan, guncangan) ----------
    const FX = { parts: [], beams: [], rings: [], texts: [], shakeT: 0, shakeDur: 0, shakeMag: 0, hitstop: 0 };
    const netEvQ = [];
    let bannerTO = null, toastTO = null;
    // Penunda berbasis dt (bukan setTimeout): ikut berhenti saat game dijeda,
    // sehingga banner/toast tidak hilang saat simulasi beku.
    let timers = [], timerSeq = 0;
    const later = (fn, ms) => { const id = ++timerSeq; timers.push({ id, fn, left: ms }); return id; };
    const cancelLater = (id) => { if (id != null) timers = timers.filter(t => t.id !== id); };
    function tickTimers(dt) {
        if (!timers.length) return;
        const list = timers; timers = [];
        for (const t of list) {
            t.left -= dt * 1000;
            if (t.left <= 0) { try { t.fn(); } catch (err) { /* abaikan */ } }
            else timers.push(t);
        }
    }
    function shake(mag, dur) { FX.shakeMag = Math.max(FX.shakeMag, mag); FX.shakeT = Math.max(FX.shakeT, dur); FX.shakeDur = Math.max(FX.shakeDur, dur); }
    function addParts(x, y, n, col, spd = 260, life = 0.5, z = 20, grav = 0) {
        for (let i = 0; i < n; i++) {
            const a = rnd(Math.PI * 2), v = rnd(0.3, 1) * spd;
            FX.parts.push({ x, y, z: rnd(4, z), vx: Math.cos(a) * v, vy: Math.sin(a) * v, vz: rnd(30, 160), g: grav, life: rnd(0.6, 1) * life, max: life, col, size: rnd(2, 4.5), rect: grav > 0 });
        }
        if (FX.parts.length > 260) FX.parts.splice(0, FX.parts.length - 260);
    }
    function addText(x, y, txt, col, size = 15) { FX.texts.push({ x, y, txt, col, size, life: 0.9, max: 0.9 }); }
    function setBanner(txt, col, dur = 1.2, cls = "") {
        el.banner.textContent = txt;
        el.banner.style.color = col;
        el.banner.className = "ab-banner show " + cls;
        if (bannerTO) cancelLater(bannerTO);
        bannerTO = later(() => { el.banner.className = "ab-banner"; }, dur * 1000);
    }
    function setToast(txt, dur = 2) {
        el.toast.textContent = txt; el.toast.classList.add("show");
        if (toastTO) cancelLater(toastTO);
        toastTO = later(() => el.toast.classList.remove("show"), dur * 1000);
    }
    function emit(type, d) {
        applyFx(type, d);
        if (online && isHost && !S.demo) { netEvQ.push({ t: type, d }); if (netEvQ.length > 60) netEvQ.shift(); }
    }
    function applyFx(type, d) {
        const quiet = S && S.demo;
        const sfx = (n) => { if (!quiet) AU.sfx(n); };
        const banner = (...a) => { if (!quiet) setBanner(...a); };
        switch (type) {
            case "sfx": sfx(d.n); break;
            case "count": banner(String(d.n), "#ffc857", 0.85, "count"); sfx("count"); break;
            case "go": banner("GO!", "#4ade80", 0.7, "count"); sfx("go"); break;
            case "muzzle": addParts(d.x + Math.cos(d.ang) * 28, d.y + Math.sin(d.ang) * 28, 3, d.col, 150, 0.22, 26); break;
            case "spark": addParts(d.x, d.y, 5, d.col, 220, 0.3, 22); break;
            case "hit":
                addParts(d.x, d.y, d.big ? 14 : 8, d.col, d.big ? 380 : 260, 0.4, 30);
                if (d.big) { addText(d.x, d.y - 30, "-" + d.dmg, "#fff", 14); shake(4, 0.15); }
                sfx("hit"); break;
            case "swing": FX.rings.push({ x: d.x, y: d.y, r0: d.range * 0.55, r1: d.range + 14, life: 0.16, max: 0.16, col: d.col, arc: d.arc, ang: d.ang }); break;
            case "ballhit": addParts(d.x, d.y, 6, "#ffc857", 300, 0.3, 16); sfx("hit"); break;
            case "shootball": addParts(d.x, d.y, 10, "#ffc857", 420, 0.35, 16); sfx("shoot"); shake(3, 0.12); break;
            case "bounce": addParts(d.x, d.y, 3, "#7dd3fc", 160, 0.25, 12); sfx("bounce"); break;
            case "grab": FX.rings.push({ x: d.x, y: d.y, r0: 10, r1: 44, life: 0.25, max: 0.25, col: "#ffc857" }); sfx("grab"); break;
            case "pass": sfx("pass"); break;
            case "dash": addParts(d.x, d.y, 7, d.col, 180, 0.3, 14); sfx("dash"); break;
            case "beam": FX.beams.push({ ...d, life: 0.22, max: 0.22 }); shake(5, 0.2); break;
            case "slam":
                FX.rings.push({ x: d.x, y: d.y, r0: 20, r1: d.r, life: 0.35, max: 0.35, col: d.col });
                addParts(d.x, d.y, 18, d.col, 420, 0.5, 26);
                drawCrack(d.x, d.y); shake(9, 0.3); FX.hitstop = Math.max(FX.hitstop, 0.04); sfx("slam"); break;
            case "rush": addParts(d.x, d.y, 8, d.col, 200, 0.35, 18); sfx("rush"); break;
            case "crack": drawCrack(d.x, d.y); break;
            case "break": addParts(d.x, d.y, 16, "#94a3b8", 340, 0.6, 40, 500); sfx("break"); shake(4, 0.18); break;
            case "ko":
                addParts(d.x, d.y, 22, TEAM[d.team].col, 420, 0.7, 36, 300);
                addText(d.x, d.y - 40, "KO!", TEAM[d.team].col, 22);
                shake(6, 0.25); FX.hitstop = Math.max(FX.hitstop, 0.05); sfx("ko"); break;
            case "respawn": FX.rings.push({ x: d.x, y: d.y, r0: 8, r1: 60, life: 0.4, max: 0.4, col: TEAM[d.team].col }); sfx("respawn"); break;
            case "goal": {
                const T = TEAM[d.team];
                addParts(d.x * 0.92, 0, 70, T.col, 620, 1.1, 90, 420);
                addParts(d.x * 0.92, 0, 30, "#ffc857", 520, 1, 80, 420);
                addParts(d.x * 0.92, 0, 24, "#ffffff", 460, 0.9, 70, 420);
                banner(d.own ? "OWN GOAL!" : "GOAL!", T.col, 2.1);
                shake(16, 0.5); FX.hitstop = Math.max(FX.hitstop, 0.1); sfx("goal");
                break;
            }
            case "roundwin": banner(TEAM[d.team].name + " MENANG RONDE " + d.round, TEAM[d.team].col, 1.7); break;
            case "matchwin": banner(TEAM[d.team].name + " MENANG!", TEAM[d.team].col, 2.3); sfx("win"); shake(10, 0.5); break;
            case "sudden": banner("SUDDEN DEATH", "#f87171", 2); sfx("sudden"); shake(6, 0.3); break;
            case "sdboost": banner("BOLA DIPERCEPAT!", "#ffc857", 1.6, "small"); sfx("sudden"); break;
            case "campwarn": if (!quiet) setToast("P" + (d.slot + 1) + ": jangan diam di gawang sendiri! (anti-camp)", 1.6); sfx("camp"); break;
            case "camp": addText(d.x, d.y - 34, "ANTI-CAMP!", "#f87171", 15); FX.rings.push({ x: d.x, y: d.y, r0: 10, r1: 70, life: 0.3, max: 0.3, col: "#f87171" }); sfx("camp"); break;
            case "ballreset": FX.rings.push({ x: 0, y: 0, r0: 10, r1: 90, life: 0.4, max: 0.4, col: "#ffc857" }); if (!quiet) setToast("Bola macet — direset ke tengah", 1.6); break;
            case "reset": clearDecals(); break;
        }
    }
    function fxStep(dt) {
        FX.shakeT = Math.max(0, FX.shakeT - dt);
        if (FX.shakeT <= 0) { FX.shakeMag = 0; FX.shakeDur = 0; }
        for (let i = FX.parts.length - 1; i >= 0; i--) {
            const p = FX.parts[i];
            p.life -= dt;
            if (p.life <= 0) { FX.parts.splice(i, 1); continue; }
            p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; p.vz -= (p.g || 600) * dt;
            if (p.z < 0) { p.z = 0; p.vz *= -0.4; p.vx *= 0.7; p.vy *= 0.7; }
        }
        for (let i = FX.beams.length - 1; i >= 0; i--) { FX.beams[i].life -= dt; if (FX.beams[i].life <= 0) FX.beams.splice(i, 1); }
        for (let i = FX.rings.length - 1; i >= 0; i--) { FX.rings[i].life -= dt; if (FX.rings[i].life <= 0) FX.rings.splice(i, 1); }
        for (let i = FX.texts.length - 1; i >= 0; i--) { FX.texts[i].life -= dt; if (FX.texts[i].life <= 0) FX.texts.splice(i, 1); }
    }
    function resetFx() {
        FX.parts.length = 0; FX.beams.length = 0; FX.rings.length = 0; FX.texts.length = 0;
        FX.shakeT = 0; FX.shakeMag = 0; FX.hitstop = 0;
        clearDecals();
    }

    // ---------- renderer ----------
    const proj = { s: 1, cx: 0, cy: 0 };
    let DPR = 1, VW = 960, VH = 600;
    const floorCv = document.createElement("canvas");
    const decalCv = document.createElement("canvas");
    const px = (x) => proj.cx + x * proj.s;
    const py = (y) => proj.cy + y * proj.s * K;
    function resize() {
        // Ukur board (parent langsung canvas), bukan wrapper lama yang sudah dihapus.
        const rect = board.getBoundingClientRect();
        const w = Math.max(320, Math.round(rect.width) || 960);
        const h = Math.max(200, Math.round(rect.height) || 600);
        DPR = Math.min(2, (typeof window !== "undefined" && window.devicePixelRatio) || 1);
        VW = w; VH = h;
        cv.width = Math.round(w * DPR); cv.height = Math.round(h * DPR);
        proj.s = Math.min(w / 1480, h / 660);
        proj.cx = w / 2; proj.cy = h / 2 + 10;
        buildFloor();
    }
    function octPath(c) {
        c.beginPath();
        OCT.forEach((v, i) => i ? c.lineTo(px(v.x), py(v.y)) : c.moveTo(px(v.x), py(v.y)));
        c.closePath();
    }
    function buildFloor() {
        floorCv.width = cv.width; floorCv.height = cv.height;
        decalCv.width = cv.width; decalCv.height = cv.height;
        const c = floorCv.getContext("2d");
        if (!c) return;
        c.setTransform(DPR, 0, 0, DPR, 0, 0);
        c.clearRect(0, 0, VW, VH);
        // tribun penonton (titik neon, seed tetap)
        const rng = mulberry(1337);
        const cols = ["#334155", "#475569", "#7c3aed", "#0891b2", "#be123c", "#a16207"];
        for (let i = 0; i < 320; i++) {
            const x = (rng() * 2 - 1) * (AR.A + 130), y = (rng() * 2 - 1) * (AR.B + 120);
            let inside = true;
            for (const e of EDGES) if ((x - e.a.x) * e.nx + (y - e.a.y) * e.ny < 26) { inside = false; break; }
            if (inside) continue;
            c.fillStyle = cols[(rng() * cols.length) | 0];
            c.globalAlpha = 0.25 + rng() * 0.5;
            c.beginPath(); c.arc(px(x), py(y) - 6 * proj.s, (1.4 + rng() * 1.8) * proj.s, 0, 7); c.fill();
        }
        c.globalAlpha = 1;
        // lantai oktagon
        octPath(c);
        const g = c.createLinearGradient(0, py(-AR.B), 0, py(AR.B));
        g.addColorStop(0, "#0b1226"); g.addColorStop(0.5, "#0e1730"); g.addColorStop(1, "#0a1020");
        c.fillStyle = g; c.fill();
        // grid
        c.save(); octPath(c); c.clip();
        c.strokeStyle = "rgba(56,189,248,0.07)"; c.lineWidth = 1;
        for (let x = -AR.A; x <= AR.A; x += 80) { c.beginPath(); c.moveTo(px(x), py(-AR.B)); c.lineTo(px(x), py(AR.B)); c.stroke(); }
        for (let y = -AR.B; y <= AR.B; y += 80) { c.beginPath(); c.moveTo(px(-AR.A), py(y)); c.lineTo(px(AR.A), py(y)); c.stroke(); }
        // tint wilayah tim
        c.fillStyle = "rgba(255,77,93,0.045)"; c.fillRect(px(-AR.A), py(-AR.B), AR.A * proj.s, AR.B * 2 * proj.s * K);
        c.fillStyle = "rgba(41,216,229,0.045)"; c.fillRect(px(0), py(-AR.B), AR.A * proj.s, AR.B * 2 * proj.s * K);
        // garis tengah
        c.strokeStyle = "rgba(148,163,184,0.16)"; c.setLineDash([8, 10]); c.lineWidth = 2;
        c.beginPath(); c.moveTo(px(0), py(-AR.B)); c.lineTo(px(0), py(AR.B)); c.stroke(); c.setLineDash([]);
        // lingkaran tengah
        c.strokeStyle = "rgba(41,216,229,0.4)"; c.lineWidth = 3 * proj.s;
        c.beginPath(); c.ellipse(px(0), py(0), 120 * proj.s, 120 * proj.s * K, 0, 0, 7); c.stroke();
        c.strokeStyle = "rgba(41,216,229,0.25)"; c.setLineDash([6, 8]);
        c.beginPath(); c.ellipse(px(0), py(0), 46 * proj.s, 46 * proj.s * K, 0, 0, 7); c.stroke(); c.setLineDash([]);
        c.fillStyle = "rgba(41,216,229,0.5)";
        c.beginPath(); c.ellipse(px(0), py(0), 5 * proj.s, 5 * proj.s * K, 0, 0, 7); c.fill();
        c.restore();
        // pagar neon
        octPath(c); c.strokeStyle = "rgba(96,165,250,0.28)"; c.lineWidth = 9 * proj.s; c.stroke();
        octPath(c); c.strokeStyle = "rgba(125,211,252,0.85)"; c.lineWidth = 2.4 * proj.s; c.stroke();
        // gawang + jaring
        for (const side of [-1, 1]) {
            const T = TEAM[side === -1 ? 0 : 1];
            const x0 = side * AR.A, x1 = side * (AR.A + AR.GD);
            c.fillStyle = T.glow + "0.10)";
            c.beginPath();
            c.moveTo(px(x0), py(-AR.GH)); c.lineTo(px(x1), py(-AR.GH));
            c.lineTo(px(x1), py(AR.GH)); c.lineTo(px(x0), py(AR.GH)); c.closePath(); c.fill();
            c.strokeStyle = T.glow + "0.35)"; c.lineWidth = 1;
            for (let i = 1; i < 5; i++) { const yy = -AR.GH + i * AR.GH * 2 / 5; c.beginPath(); c.moveTo(px(x0), py(yy)); c.lineTo(px(x1), py(yy)); c.stroke(); }
            for (let i = 1; i < 4; i++) { const xx = lerp(x0, x1, i / 4); c.beginPath(); c.moveTo(px(xx), py(-AR.GH)); c.lineTo(px(xx), py(AR.GH)); c.stroke(); }
            // area gawang (zona anti-camp)
            c.fillStyle = T.glow + "0.05)";
            const zx = side === -1 ? -AR.A : AR.A - 150;
            c.fillRect(px(zx), py(-AR.GH - 40), 150 * proj.s, (AR.GH * 2 + 80) * proj.s * K);
            // tiang gawang
            c.strokeStyle = T.col; c.lineWidth = 4 * proj.s;
            c.beginPath(); c.moveTo(px(x0), py(-AR.GH)); c.lineTo(px(x0), py(AR.GH)); c.stroke();
            for (const yy of [-AR.GH, AR.GH]) {
                c.fillStyle = T.col;
                c.beginPath(); c.arc(px(x0), py(yy), 6 * proj.s, 0, 7); c.fill();
                c.fillStyle = T.glow + "0.3)";
                c.beginPath(); c.arc(px(x0), py(yy), 11 * proj.s, 0, 7); c.fill();
            }
        }
    }
    function clearDecals() {
        const c = decalCv.getContext("2d");
        if (c) { c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, decalCv.width, decalCv.height); }
    }
    function drawCrack(x, y) {
        const c = decalCv.getContext("2d");
        if (!c) return;
        c.setTransform(DPR, 0, 0, DPR, 0, 0);
        const rng = mulberry((x * 13 + y * 7) | 0);
        c.strokeStyle = "rgba(2,6,16,0.75)"; c.lineWidth = 2.2 * proj.s;
        for (let i = 0; i < 7; i++) {
            const a = rng() * Math.PI * 2;
            let cx0 = x, cy0 = y;
            c.beginPath(); c.moveTo(px(cx0), py(cy0));
            const segs = 3 + (rng() * 3 | 0);
            for (let s2 = 0; s2 < segs; s2++) {
                cx0 += Math.cos(a + rnd(-.5, .5)) * rnd(14, 34);
                cy0 += Math.sin(a + rnd(-.5, .5)) * rnd(14, 34);
                c.lineTo(px(cx0), py(cy0));
            }
            c.stroke();
        }
        c.strokeStyle = "rgba(125,211,252,0.12)"; c.lineWidth = 4 * proj.s;
        c.beginPath(); c.ellipse(px(x), py(y), 40 * proj.s, 40 * proj.s * K, 0, 0, 7); c.stroke();
    }
    function drawShadow(c, x, y, r) {
        c.fillStyle = "rgba(0,0,0,0.4)";
        c.beginPath(); c.ellipse(px(x), py(y), r * proj.s, r * proj.s * 0.5, 0, 0, 7); c.fill();
    }
    function teamMarker(c, p) {
        const T = TEAM[p.team], r = 32 * proj.s, x = px(p.x), y = py(p.y);
        c.beginPath();
        if (T.shape === "tri") {
            c.moveTo(x, y - r * K); c.lineTo(x + r * 0.9, y + r * K * 0.7); c.lineTo(x - r * 0.9, y + r * K * 0.7);
        } else {
            c.moveTo(x, y - r * K); c.lineTo(x + r, y); c.lineTo(x, y + r * K); c.lineTo(x - r, y);
        }
        c.closePath();
        c.fillStyle = T.glow + "0.16)"; c.fill();
        c.strokeStyle = T.glow + "0.9)"; c.lineWidth = 2 * proj.s; c.stroke();
    }
    function drawFace(c, f, x, y, r) {
        c.save(); c.translate(x, y);
        if (f === 0) { // hood
            c.fillStyle = "#312e81";
            c.beginPath(); c.moveTo(0, -r * 1.05); c.quadraticCurveTo(r * 1.1, -r * 0.2, r * 0.7, r * 0.6);
            c.lineTo(-r * 0.7, r * 0.6); c.quadraticCurveTo(-r * 1.1, -r * 0.2, 0, -r * 1.05); c.fill();
            c.fillStyle = "#c4b5fd";
            c.beginPath(); c.arc(-r * 0.26, 0, r * 0.12, 0, 7); c.arc(r * 0.26, 0, r * 0.12, 0, 7); c.fill();
        } else if (f === 1) { // mask
            c.fillStyle = "#7c2d12";
            c.beginPath(); c.arc(0, 0, r * 0.82, 0, 7); c.fill();
            c.fillStyle = "#fde047";
            c.beginPath(); c.ellipse(-r * 0.3, -r * 0.12, r * 0.22, r * 0.14, 0, 0, 7); c.ellipse(r * 0.3, -r * 0.12, r * 0.22, r * 0.14, 0, 0, 7); c.fill();
            c.strokeStyle = "#fde047"; c.lineWidth = r * 0.1;
            c.beginPath(); c.moveTo(-r * 0.3, r * 0.34); c.lineTo(r * 0.3, r * 0.34); c.stroke();
        } else if (f === 2) { // visor
            c.fillStyle = "#0c4a6e";
            c.fillRect(-r * 0.72, -r * 0.34, r * 1.44, r * 0.5);
            c.fillStyle = "#7dd3fc";
            c.fillRect(-r * 0.56, -r * 0.2, r * 1.12, r * 0.22);
            c.fillStyle = "#38bdf8";
            c.fillRect(-r * 0.2, r * 0.3, r * 0.4, r * 0.14);
        } else { // yeti
            c.fillStyle = "#f8fafc";
            for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; c.beginPath(); c.arc(Math.cos(a) * r * 0.72, Math.sin(a) * r * 0.72, r * 0.3, 0, 7); c.fill(); }
            c.fillStyle = "#94a3b8";
            c.beginPath(); c.moveTo(-r * 0.55, -r * 0.62); c.lineTo(-r * 0.85, -r * 1.1); c.lineTo(-r * 0.25, -r * 0.8); c.closePath();
            c.moveTo(r * 0.55, -r * 0.62); c.lineTo(r * 0.85, -r * 1.1); c.lineTo(r * 0.25, -r * 0.8); c.closePath(); c.fill();
            c.fillStyle = "#0f172a";
            c.beginPath(); c.arc(-r * 0.26, -r * 0.05, r * 0.11, 0, 7); c.arc(r * 0.26, -r * 0.05, r * 0.11, 0, 7); c.fill();
            c.fillStyle = "#e2e8f0";
            c.beginPath(); c.ellipse(0, r * 0.34, r * 0.3, r * 0.18, 0, 0, 7); c.fill();
        }
        c.restore();
    }
    function drawPlayer(c, p, tNow) {
        const T = TEAM[p.team], F = FIGHTERS[p.f];
        if (p.koT > 0) { // cincin respawn di titik spawn
            const sp = SPAWNS[p.slot], frac = 1 - p.koT / 5;
            c.strokeStyle = T.glow + "0.35)"; c.lineWidth = 3 * proj.s;
            c.beginPath(); c.ellipse(px(sp.x), py(sp.y), 26 * proj.s, 26 * proj.s * K, 0, 0, 7); c.stroke();
            c.strokeStyle = T.col;
            c.beginPath(); c.ellipse(px(sp.x), py(sp.y), 26 * proj.s, 26 * proj.s * K, 0, -Math.PI / 2, -Math.PI / 2 + frac * Math.PI * 2); c.stroke();
            c.fillStyle = T.col; c.font = `700 ${12 * proj.s}px system-ui`; c.textAlign = "center";
            c.fillText(Math.ceil(p.koT) + "", px(sp.x), py(sp.y) + 4 * proj.s);
            return;
        }
        teamMarker(c, p);
        drawShadow(c, p.x, p.y, PR * 0.95);
        const bx = px(p.x), by = py(p.y) - 20 * proj.s, r = PR * proj.s;
        // afterimage dash / rush
        if (p.dashT > 0 || p.rushT > 0) {
            c.globalAlpha = 0.25;
            c.fillStyle = F.col;
            c.beginPath(); c.arc(bx - p.vx * 0.03 * proj.s, by - p.vy * 0.03 * proj.s * K, r, 0, 7); c.fill();
            c.globalAlpha = 1;
        }
        if (p.invulnT > 0) c.globalAlpha = 0.55 + 0.3 * Math.sin(tNow * 0.02);
        // badan
        const bg = c.createRadialGradient(bx - r * 0.3, by - r * 0.4, r * 0.2, bx, by, r);
        bg.addColorStop(0, F.col); bg.addColorStop(1, F.col2);
        c.fillStyle = bg;
        c.beginPath(); c.arc(bx, by, r, 0, 7); c.fill();
        c.strokeStyle = T.col; c.lineWidth = 2.6 * proj.s; c.stroke();
        drawFace(c, p.f, bx, by, r * 0.8);
        // wedge arah bidik
        const dx = Math.cos(p.aim), dy = Math.sin(p.aim) * K;
        const dl = hyp(dx, dy) || 1, ux = dx / dl, uy = dy / dl;
        c.fillStyle = "rgba(255,255,255,0.9)";
        c.beginPath();
        c.moveTo(bx + ux * (r + 9 * proj.s), by + uy * (r + 9 * proj.s));
        c.lineTo(bx + ux * r * 0.8 - uy * 5 * proj.s, by + uy * r * 0.8 + ux * 5 * proj.s);
        c.lineTo(bx + ux * r * 0.8 + uy * 5 * proj.s, by + uy * r * 0.8 - ux * 5 * proj.s);
        c.closePath(); c.fill();
        // flash kena hit
        if (p.flashT > 0) {
            c.globalAlpha = p.flashT / 0.12 * 0.8;
            c.fillStyle = "#fff";
            c.beginPath(); c.arc(bx, by, r + 2, 0, 7); c.fill();
        }
        c.globalAlpha = 1;
        // stun
        if (p.stunT > 0) {
            c.fillStyle = "#fde047";
            for (let i = 0; i < 3; i++) {
                const a = tNow * 0.008 + i * 2.1;
                c.beginPath(); c.arc(bx + Math.cos(a) * r * 0.9, by - r - 6 * proj.s + Math.sin(a) * 3 * proj.s, 2.4 * proj.s, 0, 7); c.fill();
            }
        }
        // bar HP kecil di atas kepala
        const F2 = FIGHTERS[p.f], w = 36 * proj.s, hpf = clamp(p.hp / F2.hp, 0, 1);
        c.fillStyle = "rgba(0,0,0,0.55)";
        c.fillRect(bx - w / 2, by - r - 12 * proj.s, w, 4 * proj.s);
        c.fillStyle = hpf > 0.35 ? T.col : "#f87171";
        c.fillRect(bx - w / 2, by - r - 12 * proj.s, w * hpf, 4 * proj.s);
        // label pemain
        const label = (p.bot || p.auto) ? "BOT" : "P" + (p.slot + 1);
        c.font = `800 ${10 * proj.s}px system-ui`; c.textAlign = "center";
        c.fillStyle = "rgba(5,8,18,0.7)";
        const tw = c.measureText(label).width + 8 * proj.s;
        c.fillRect(bx - tw / 2, by - r - 26 * proj.s, tw, 12 * proj.s);
        c.fillStyle = T.col;
        c.fillText(label, bx, by - r - 17 * proj.s);
        // indikator peringatan camp
        if (p.campT > 1.2) {
            c.strokeStyle = "rgba(248,113,113," + (0.4 + 0.4 * Math.sin(tNow * 0.02)) + ")";
            c.lineWidth = 2.5 * proj.s;
            c.beginPath(); c.ellipse(px(p.x), py(p.y), 40 * proj.s, 40 * proj.s * K, 0, 0, 7); c.stroke();
        }
    }
    function drawBarrier(c, bar) {
        if (bar.hp <= 0) return;
        const co = Math.cos(bar.ang), si = Math.sin(bar.ang);
        const corners = [[-bar.w / 2, -bar.h / 2], [bar.w / 2, -bar.h / 2], [bar.w / 2, bar.h / 2], [-bar.w / 2, bar.h / 2]]
            .map(([lx, ly]) => ({ x: bar.x + lx * co - ly * si, y: bar.y + lx * si + ly * co }));
        const hpf = bar.hp / bar.max;
        const edge = hpf > 0.6 ? "#34d399" : hpf > 0.3 ? "#fbbf24" : "#f87171";
        // sisi (extrude)
        for (let i = 0; i < 4; i++) {
            const a = corners[i], b = corners[(i + 1) % 4];
            if ((a.y + b.y) / 2 < bar.y - 2) continue;
            c.fillStyle = "#16213b";
            c.beginPath();
            c.moveTo(px(a.x), py(a.y)); c.lineTo(px(b.x), py(b.y));
            c.lineTo(px(b.x), py(b.y) - BH * proj.s); c.lineTo(px(a.x), py(a.y) - BH * proj.s);
            c.closePath(); c.fill();
            c.strokeStyle = "rgba(56,189,248,0.2)"; c.lineWidth = 1; c.stroke();
        }
        // atap
        c.beginPath();
        corners.forEach((v, i) => i ? c.lineTo(px(v.x), py(v.y) - BH * proj.s) : c.moveTo(px(v.x), py(v.y) - BH * proj.s));
        c.closePath();
        const g = c.createLinearGradient(px(bar.x - 40), py(bar.y) - BH * proj.s, px(bar.x + 40), py(bar.y) - BH * proj.s);
        g.addColorStop(0, "#334155"); g.addColorStop(1, "#1e293b");
        c.fillStyle = g; c.fill();
        c.strokeStyle = edge; c.lineWidth = 2 * proj.s; c.stroke();
        // garis energi
        c.strokeStyle = edge; c.globalAlpha = 0.7; c.lineWidth = 3 * proj.s;
        c.beginPath();
        c.moveTo(px(bar.x - co * bar.w * 0.36), py(bar.y - si * bar.w * 0.36) - BH * proj.s);
        c.lineTo(px(bar.x + co * bar.w * 0.36), py(bar.y + si * bar.w * 0.36) - BH * proj.s);
        c.stroke(); c.globalAlpha = 1;
        if (hpf < 0.55) {
            c.strokeStyle = "rgba(2,6,16,0.8)"; c.lineWidth = 1.6 * proj.s;
            c.beginPath();
            c.moveTo(px(bar.x - co * 20 + si * 8), py(bar.y - si * 20 - co * 8) - BH * proj.s);
            c.lineTo(px(bar.x + si * 4), py(bar.y - co * 4) - BH * proj.s);
            c.lineTo(px(bar.x + co * 24 - si * 6), py(bar.y + si * 24 + co * 6) - BH * proj.s);
            c.stroke();
        }
    }
    function drawBall(c, b) {
        // trail
        if (b.trail && b.trail.length > 1) {
            c.save(); c.globalCompositeOperation = "lighter";
            for (let i = 0; i < b.trail.length; i++) {
                const t = b.trail[i], a = (i + 1) / b.trail.length * 0.25;
                c.fillStyle = "rgba(255,200,87," + a + ")";
                c.beginPath(); c.arc(px(t.x), py(t.y) - 10 * proj.s, BR * proj.s * (0.4 + 0.6 * (i + 1) / b.trail.length), 0, 7); c.fill();
            }
            c.restore();
        }
        drawShadow(c, b.x, b.y, BR * 0.9);
        const bx = px(b.x), by = py(b.y) - 10 * proj.s, r = BR * proj.s;
        c.save();
        c.shadowColor = "#ffc857"; c.shadowBlur = 16 * proj.s;
        const g = c.createRadialGradient(bx - r * 0.35, by - r * 0.4, r * 0.15, bx, by, r);
        g.addColorStop(0, "#fff7e0"); g.addColorStop(0.55, "#ffc857"); g.addColorStop(1, "#b45309");
        c.fillStyle = g;
        c.beginPath(); c.arc(bx, by, r, 0, 7); c.fill();
        c.restore();
        c.strokeStyle = "rgba(255,255,255,0.5)"; c.lineWidth = 1.2 * proj.s;
        c.beginPath(); c.arc(bx, by, r * 0.55, -0.6, 1.4); c.stroke();
        if (b.carrier >= 0) {
            const p = S ? S.players[b.carrier] : null;
            if (p) {
                c.strokeStyle = "rgba(255,200,87,0.4)"; c.lineWidth = 2 * proj.s;
                c.beginPath(); c.moveTo(px(p.x), py(p.y) - 20 * proj.s); c.lineTo(bx, by); c.stroke();
            }
        }
    }
    function draw(st, tNow) {
        if (!ctx || !st) return;
        ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
        ctx.clearRect(0, 0, VW, VH);
        // latar
        const bgg = ctx.createLinearGradient(0, 0, 0, VH);
        bgg.addColorStop(0, "#070b18"); bgg.addColorStop(1, "#04060d");
        ctx.fillStyle = bgg; ctx.fillRect(0, 0, VW, VH);
        // guncangan layar
        let sx = 0, sy = 0;
        if (FX.shakeT > 0 && FX.shakeDur > 0) {
            const k = FX.shakeT / FX.shakeDur;
            sx = rnd(-1, 1) * FX.shakeMag * k; sy = rnd(-1, 1) * FX.shakeMag * k;
        }
        ctx.save();
        ctx.translate(sx, sy);
        ctx.drawImage(floorCv, 0, 0, VW, VH);
        ctx.drawImage(decalCv, 0, 0, VW, VH);
        // denyut mulut gawang
        for (const side of [-1, 1]) {
            const T = TEAM[side === -1 ? 0 : 1];
            const pulse = 0.12 + 0.08 * Math.sin(tNow * 0.004 + side);
            ctx.fillStyle = T.glow + pulse + ")";
            ctx.fillRect(px(side * AR.A) - 3 * proj.s, py(-AR.GH), 6 * proj.s, AR.GH * 2 * proj.s * K);
        }
        // bayangan barrier
        for (const bar of st.barriers) if (bar.hp > 0) {
            ctx.fillStyle = "rgba(0,0,0,0.3)";
            ctx.beginPath(); ctx.ellipse(px(bar.x), py(bar.y), bar.w * 0.55 * proj.s, bar.h * 1.1 * proj.s * K, bar.ang, 0, 7); ctx.fill();
        }
        // entitas diurutkan berdasarkan kedalaman (y)
        const items = [];
        for (const bar of st.barriers) if (bar.hp > 0) items.push({ y: bar.y, d: () => drawBarrier(ctx, bar) });
        for (const p of st.players) items.push({ y: p.y, d: () => drawPlayer(ctx, p, tNow) });
        items.push({ y: st.ball.y + 2, d: () => drawBall(ctx, st.ball) });
        items.sort((a, b) => a.y - b.y);
        for (const it of items) it.d();
        // proyektil
        ctx.save(); ctx.globalCompositeOperation = "lighter";
        for (const pr of st.proj) {
            const bx = px(pr.x), by = py(pr.y) - 18 * proj.s;
            ctx.strokeStyle = pr.col; ctx.lineWidth = pr.r * proj.s * 0.9; ctx.globalAlpha = 0.5;
            ctx.beginPath(); ctx.moveTo(bx - pr.vx * 0.02 * proj.s, by - pr.vy * 0.02 * proj.s * K); ctx.lineTo(bx, by); ctx.stroke();
            ctx.globalAlpha = 1; ctx.fillStyle = "#fff";
            ctx.beginPath(); ctx.arc(bx, by, pr.r * proj.s * 0.6, 0, 7); ctx.fill();
            ctx.fillStyle = pr.col; ctx.globalAlpha = 0.6;
            ctx.beginPath(); ctx.arc(bx, by, pr.r * proj.s, 0, 7); ctx.fill();
            ctx.globalAlpha = 1;
        }
        // beam
        for (const bm of FX.beams) {
            const a = bm.life / bm.max;
            const x1 = px(bm.x1), y1 = py(bm.y1) - 20 * proj.s, x2 = px(bm.x2), y2 = py(bm.y2) - 20 * proj.s;
            ctx.strokeStyle = bm.col; ctx.globalAlpha = a * 0.35; ctx.lineWidth = 22 * proj.s * a;
            ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
            ctx.globalAlpha = a; ctx.lineWidth = 6 * proj.s * a;
            ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
            ctx.strokeStyle = "#fff"; ctx.lineWidth = 2 * proj.s * a;
            ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
            ctx.globalAlpha = 1;
        }
        // ring efek
        for (const rg of FX.rings) {
            const t = 1 - rg.life / rg.max, r = lerp(rg.r0, rg.r1, t);
            ctx.strokeStyle = rg.col; ctx.globalAlpha = (1 - t) * 0.8; ctx.lineWidth = 3 * proj.s;
            ctx.beginPath();
            if (rg.arc) ctx.ellipse(px(rg.x), py(rg.y), r * proj.s, r * proj.s * K, 0, rg.ang - rg.arc / 2, rg.ang + rg.arc / 2);
            else ctx.ellipse(px(rg.x), py(rg.y), r * proj.s, r * proj.s * K, 0, 0, 7);
            ctx.stroke(); ctx.globalAlpha = 1;
        }
        // partikel
        for (const p of FX.parts) {
            const a = clamp(p.life / p.max, 0, 1);
            ctx.globalAlpha = a; ctx.fillStyle = p.col;
            const x = px(p.x), y = py(p.y) - p.z * proj.s;
            if (p.rect) ctx.fillRect(x - p.size * proj.s / 2, y - p.size * proj.s / 2, p.size * proj.s, p.size * proj.s * 0.7);
            else { ctx.beginPath(); ctx.arc(x, y, p.size * proj.s * a, 0, 7); ctx.fill(); }
        }
        ctx.globalAlpha = 1;
        ctx.restore();
        // teks melayang
        for (const t of FX.texts) {
            const a = clamp(t.life / t.max, 0, 1);
            ctx.globalAlpha = a;
            ctx.font = `900 ${t.size * proj.s}px system-ui`; ctx.textAlign = "center";
            ctx.fillStyle = t.col;
            ctx.fillText(t.txt, px(t.x), py(t.y) - (1 - a) * 40 * proj.s - 30 * proj.s);
        }
        ctx.globalAlpha = 1;
        ctx.restore();
    }

    // ---------- HUD ----------
    const hudCache = { timer: "", round: "", score: "", pips: "", names: ["", "", "", ""], tags: ["", "", "", ""], ko: [false, false, false, false] };
    const topCache = { round: "", score: "", timer: "", best: "" };
    function syncTopHud(st) {
        const set = (key, val) => { if (topCache[key] !== val) { topCache[key] = val; el.top[key].textContent = val; } };
        if (st) {
            set("round", String(st.round));
            set("score", st.score[0] + ":" + st.score[1]);
            let ttxt;
            if (st.phase === "countdown") ttxt = "0:" + String(Math.max(0, Math.ceil(st.phaseT))).padStart(2, "0");
            else if (st.sd) ttxt = "SD +" + Math.floor(st.sdT) + "s";
            else { const t = Math.max(0, Math.ceil(st.timer)); ttxt = Math.floor(t / 60) + ":" + String(t % 60).padStart(2, "0"); }
            set("timer", ttxt);
            if (el.top.timer.parentElement) el.top.timer.parentElement.classList.toggle("sd", !!st.sd);
        }
        set("best", String(best));
    }
    function hudUpdate(st) {
        if (!st) return;
        for (const p of st.players) {
            const F = FIGHTERS[p.f], i = p.slot;
            el.hp[i].style.width = clamp(p.hp / F.hp * 100, 0, 100) + "%";
            el.en[i].style.width = clamp(p.en, 0, 100) + "%";
            const nm = F.name + (p.koT > 0 ? " · " + Math.ceil(p.koT) + "s" : "");
            if (hudCache.names[i] !== nm) { hudCache.names[i] = nm; el.name[i].textContent = nm; }
            const tag = (p.bot || p.auto) ? "BOT" : "P" + (i + 1);
            if (hudCache.tags[i] !== tag) { hudCache.tags[i] = tag; el.tag[i].textContent = tag; }
            const ko = p.koT > 0;
            if (hudCache.ko[i] !== ko) { hudCache.ko[i] = ko; el.chipEl[i].classList.toggle("ko", ko); }
        }
        const sc = st.score[0] + ":" + st.score[1];
        if (hudCache.score !== sc) { hudCache.score = sc; el.score[0].textContent = st.score[0]; el.score[1].textContent = st.score[1]; }
        const pips = st.wins.join(",");
        if (hudCache.pips !== pips) {
            hudCache.pips = pips;
            el.pips[0].textContent = "●".repeat(st.wins[0]) + "○".repeat(Math.max(0, 2 - st.wins[0]));
            el.pips[1].textContent = "○".repeat(Math.max(0, 2 - st.wins[1])) + "●".repeat(st.wins[1]);
        }
        let ttxt;
        if (st.phase === "countdown") ttxt = "0:" + String(Math.max(0, Math.ceil(st.phaseT))).padStart(2, "0");
        else if (st.sd) ttxt = "SD +" + Math.floor(st.sdT) + "s";
        else { const t = Math.max(0, Math.ceil(st.timer)); ttxt = Math.floor(t / 60) + ":" + String(t % 60).padStart(2, "0"); }
        if (hudCache.timer !== ttxt) { hudCache.timer = ttxt; el.timer.textContent = ttxt; }
        el.timer.classList.toggle("sd", !!st.sd);
        const rtxt = "Ronde " + st.round + " · Best of 3" + (st.sd ? " · SUDDEN DEATH" : "");
        if (hudCache.round !== rtxt) { hudCache.round = rtxt; el.round.textContent = rtxt; }
        // vignette + beep HP rendah untuk pemain lokal
        const me = st.players[mySlot];
        const low = me && me.koT <= 0 && me.hp / FIGHTERS[me.f].hp < 0.25 && st.phase === "play" && !st.demo;
        el.vign.style.opacity = low ? 1 : 0;
        if (low && S && S.time - (hudCache.lastLow || 0) > 1.3) { hudCache.lastLow = S.time; AU.sfx("lowhp"); }
        syncTopHud(st);
    }

    // ---------- input (keyboard + mouse + gamepad) ----------
    const keysDown = new Set(), keysPressed = new Set();
    const mouse = { x: null, y: null, l: false, r: false, lp: false, rp: false };
    const pads = [null, null, null, null], padPrev = [{}, {}, {}, {}];
    const lastDir2 = { x: -1, y: 0 };
    const GAME_KEYS = new Set(["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "KeyE", "Slash", "Comma", "Period"]);
    function screenToWorld(cx0, cy0) {
        const r = cv.getBoundingClientRect();
        return { x: (cx0 - r.left - proj.cx) / proj.s, y: (cy0 - r.top - proj.cy) / (proj.s * K) };
    }
    function pollPads() {
        const list = (typeof navigator !== "undefined" && navigator.getGamepads) ? navigator.getGamepads() : [];
        for (let i = 0; i < 4; i++) {
            pads[i] = (list && list[i]) || null;
            const p = pads[i];
            if (p) {
                const start = p.buttons[9] && p.buttons[9].pressed;
                if (start && !padPrev[i].start) togglePause();
                padPrev[i].start = start;
            }
        }
    }
    function readCmd(slot, p) {
        const padIdx = online ? 0 : slot;
        const pad = pads[padIdx];
        const cmd = { mx: 0, my: 0, ax: null, ay: null, atk: false, skl: false, dash: false, grab: false };
        if (pad) {
            const ax0 = pad.axes[0] || 0, ay0 = pad.axes[1] || 0;
            if (hyp(ax0, ay0) > 0.22) { cmd.mx = ax0; cmd.my = ay0; }
            let adx = pad.axes[2] || 0, ady = pad.axes[3] || 0;
            if (hyp(adx, ady) < 0.25) { adx = cmd.mx; ady = cmd.my; }
            if (hyp(adx, ady) > 0.1) { cmd.ax = p.x + adx * 140; cmd.ay = p.y + ady * 140; }
            const bt = (i) => pad.buttons[i] && (pad.buttons[i].pressed || pad.buttons[i].value > 0.5);
            const prev = padPrev[padIdx];
            cmd.atk = bt(7) || bt(5);
            cmd.skl = (bt(6) || bt(4)) && !prev.skl;
            cmd.dash = bt(0) && !prev.dash;
            cmd.grab = bt(2) && !prev.grab;
            prev.skl = bt(6) || bt(4); prev.dash = bt(0); prev.grab = bt(2);
            return cmd;
        }
        if (slot === mySlot) {
            cmd.mx = (keysDown.has("KeyD") ? 1 : 0) - (keysDown.has("KeyA") ? 1 : 0);
            cmd.my = (keysDown.has("KeyS") ? 1 : 0) - (keysDown.has("KeyW") ? 1 : 0);
            if (mouse.x != null) { const w = screenToWorld(mouse.x, mouse.y); cmd.ax = w.x; cmd.ay = w.y; }
            else if (cmd.mx || cmd.my) { cmd.ax = p.x + cmd.mx * 140; cmd.ay = p.y + cmd.my * 140; }
            cmd.atk = mouse.l; cmd.skl = mouse.rp;
            cmd.dash = keysPressed.has("Space"); cmd.grab = keysPressed.has("KeyE");
            return cmd;
        }
        if (slot === 1 && !online && cfg.humans >= 2) {
            cmd.mx = (keysDown.has("ArrowRight") ? 1 : 0) - (keysDown.has("ArrowLeft") ? 1 : 0);
            cmd.my = (keysDown.has("ArrowDown") ? 1 : 0) - (keysDown.has("ArrowUp") ? 1 : 0);
            if (cmd.mx || cmd.my) { lastDir2.x = cmd.mx; lastDir2.y = cmd.my; }
            cmd.ax = p.x + lastDir2.x * 140; cmd.ay = p.y + lastDir2.y * 140;
            cmd.atk = keysDown.has("Period");
            cmd.skl = keysPressed.has("Comma"); cmd.dash = keysPressed.has("Slash"); cmd.grab = keysPressed.has("ShiftRight");
            return cmd;
        }
        return null;
    }
    let gCmd = { mx: 0, my: 0, ax: null, ay: null, atk: false, skl: false, dash: false, grab: false };
    let gLastIn = -99;
    function gatherCmds() {
        const cmds = [null, null, null, null];
        if (!S) return cmds;
        for (let i = 0; i < 4; i++) {
            const p = S.players[i];
            if (p.bot) continue;
            if (online && isHost && i === 1) {
                if (S.time - gLastIn > 3) {
                    if (!p.auto) { p.auto = true; setToast("Tamu terputus — Bot mengambil alih P2"); }
                } else {
                    if (p.auto) { p.auto = false; setToast("P2 (tamu) aktif kembali"); }
                    cmds[i] = { ...gCmd };
                    gCmd.skl = gCmd.dash = gCmd.grab = false;
                }
                continue;
            }
            const c = readCmd(i, p);
            if (!c) {
                if (!p.auto) { p.auto = true; setToast("P" + (i + 1) + " tanpa perangkat — Bot mengambil alih"); }
            } else {
                if (p.auto) { p.auto = false; setToast("P" + (i + 1) + " aktif kembali"); }
                cmds[i] = c;
            }
        }
        return cmds;
    }

    // ---------- layar / UI ----------
    let picks = [0, 1, 2, 3];
    let resultsCounted = false;
    const slotCol = (i) => TEAM[(i === 0 || i === 2) ? 0 : 1].col;
    const ctrlHTML = `
    <div class="ab-ctrl">
      <b>P1 (Keyboard + Mouse):</b> <span class="ab-kbd">WASD</span> gerak · <span class="ab-kbd">Mouse</span> bidik · <span class="ab-kbd">Klik kiri</span> serang / pukul bola · <span class="ab-kbd">Klik kanan</span> skill · <span class="ab-kbd">Spasi</span> dash · <span class="ab-kbd">E</span> ambil / oper<br>
      <b>P2 (Keyboard):</b> <span class="ab-kbd">Panah</span> gerak · <span class="ab-kbd">.</span> serang · <span class="ab-kbd">,</span> skill · <span class="ab-kbd">/</span> dash · <span class="ab-kbd">Shift kanan</span> ambil<br>
      <b>Gamepad:</b> stick kiri gerak · stick kanan bidik · <span class="ab-kbd">RT</span> serang · <span class="ab-kbd">LT</span> skill · <span class="ab-kbd">A</span> dash · <span class="ab-kbd">X</span> ambil / oper · <span class="ab-kbd">Start</span> jeda<br>
      <b>Aturan:</b> Best of 3 · gol langsung mengakhiri ronde · waktu habis seri &rarr; <b>Sudden Death</b> (30 detik: bola makin cepat, barrier lenyap) · KO respawn 5 detik · dilarang diam di gawang sendiri &gt;3 detik · barrier bisa dihancurkan &amp; pulih tiap ronde.
    </div>`;

    // Bantuan internal menggantikan panel data-howto lama di menu.
    if (el.helpBody) el.helpBody.innerHTML = `
      <div>
        <b>Kontrol</b>
        ${ctrlHTML}
      </div>
      <div>
        <b>Tim &amp; ronde</b>
        <ul>
          <li>2-4 pemain lokal; slot kosong diisi bot sampai 4 fighter. Mode online selalu 2 pemain.</li>
          <li>RED &#9650; di kiri, CYAN &#9670; di kanan. Gol ke gawang lawan bernilai 1 poin; gol sendiri untuk tim lawan.</li>
          <li>Menangkan 2 dari 3 ronde. Waktu habis seri memicu <b>Sudden Death</b> (gol pertama menang).</li>
          <li>KO respawn 5 detik; health &amp; energy kembali penuh tiap ronde; barrier regenerasi.</li>
          <li>Jangan diam di gawang sendiri lebih dari 3 detik (anti-camp).</li>
        </ul>
        <b>Tombol panel</b>
        <ul>
          <li><span class="ab-kbd">H</span> bantuan · <span class="ab-kbd">C</span> cheat · <span class="ab-kbd">P</span>/<span class="ab-kbd">Esc</span> jeda · <span class="ab-kbd">R</span> ulangi.</li>
          <li>Overlay bantuan/cheat membekukan simulasi dan timer.</li>
        </ul>
      </div>`;
    if (el.cheatGrid) el.cheatGrid.innerHTML = `
      <button class="ab-btn" type="button" data-cheatact="energy">+ Energi tim</button>
      <button class="ab-btn" type="button" data-cheatact="hp">+ Pulihkan HP</button>
      <button class="ab-btn" type="button" data-cheatact="goal">+ Gol instan</button>
      <button class="ab-btn" type="button" data-cheatact="skip">Lewati ronde</button>`;
    const localTeam = () => (mySlot === 0 || mySlot === 2) ? 0 : 1;
    function cheatAction(key) {
        if (!isHost || !S || S.demo) return;
        const T = localTeam();
        if (key === "energy") {
            S.players.forEach(p => { if (p.team === T) { p.en = 100; p.cdS = 0; p.cdD = 0; } });
            setToast("Energi tim dipenuhi", 1.4);
        } else if (key === "hp") {
            S.players.forEach(p => { if (p.team === T) { p.hp = FIGHTERS[p.f].hp; p.koT = 0; p.stunT = 0; } });
            setToast("HP tim dipulihkan", 1.4);
        } else if (key === "goal") {
            if (S.phase !== "play") S.phase = "play";
            scoreGoal(S, T);
        } else if (key === "skip") {
            S.wins[T] = Math.min(2, S.wins[T] + 1);
            S.phase = S.wins[T] >= 2 ? "matchend" : "roundend";
            S.phaseT = 0.6;
            setBanner("RONDE DILEWAT", TEAM[T].col, 1.2, "small");
            if (S.wins[T] >= 2) emit("matchwin", { team: T });
        }
        syncTopHud(S);
    }
    function buildMenu() {
        el.screens.menu.innerHTML = `
      <div class="ab-title">ARENA BATTLE</div>
      <div class="ab-sub">Sports-brawler 2v2: rebut bola, hantam lawan, cetak gol. Menangkan <b>2 dari 3 ronde</b> untuk juara.</div>
      ${best > 0 ? `<div class="ab-sub" style="color:#ffc857">Rekor menang beruntun: <b>${best}</b></div>` : ""}
      <div class="ab-row">
        <button class="ab-btn primary" data-action="play">${online ? "Main Online (Host)" : "Main Lokal (2v2)"}</button>
        <button class="ab-btn" data-action="help">Cara Main (H)</button>
      </div>
      <div class="ab-sub" style="font-size:11px;opacity:.6">2-4 pemain lokal (slot kosong diisi bot sampai 4) · gamepad terdeteksi otomatis · tim: RED &#9650; vs CYAN &#9670; · H bantuan · C cheat · P/Esc jeda</div>`;
    }
    function fighterCard(f, guestMode) {
        const F = FIGHTERS[f];
        const badges = picks.map((pk, s) => {
            const isHuman = guestMode ? s === 1 : (online ? s < 2 : s < cfg.humans);
            return (pk === f && isHuman) ? `<span class="ab-pb" style="background:${slotCol(s)}">P${s + 1}</span>` : "";
        }).join("");
        const sel = guestMode ? picks[1] === f : picks[ui.activeSlot] === f;
        const spd = "●".repeat(Math.round((F.spd - 230) / 25) + 1);
        return `<div class="ab-card ${sel ? "sel" : ""}" data-action="pick" data-f="${f}">
      <div class="ab-pickbadges">${badges}</div>
      <div class="ab-face" style="background:${F.col}">${F.glyph}</div>
      <h4>${F.name}</h4>
      <div class="role">${F.role} · HP ${F.hp} · SPD ${spd}</div>
      <div class="sk">&#9889; ${F.skl.name} (${F.skl.cost} energi)</div>
    </div>`;
    }
    function buildSelect() {
        const guestMode = online && !isHost;
        ui.activeSlot = clamp(ui.activeSlot, 0, Math.max(0, (online ? 2 : cfg.humans) - 1));
        const tabs = guestMode ? `<div class="ab-tabs"><span class="ab-tab on" style="border-color:${slotCol(1)};color:${slotCol(1)}">P2 (Kamu)</span></div>`
            : `<div class="ab-tabs">${Array.from({ length: online ? 1 : cfg.humans }, (_, s) =>
                `<button class="ab-tab ${s === ui.activeSlot ? "on" : ""}" data-action="slot" data-slot="${s}" style="${s === ui.activeSlot ? `border-color:${slotCol(s)};color:${slotCol(s)}` : ""}">P${s + 1} · ${TEAM[(s === 0 || s === 2) ? 0 : 1].name}</button>`).join("")}</div>`;
        const sets = guestMode ? "" : `
      <div class="ab-row">
        ${online ? `<span class="ab-set">P2 = tamu (memilih sendiri)</span>` : `
        <label class="ab-set">Pemain lokal
          <select data-set="humans">${[2, 3, 4].map(n => `<option value="${n}" ${cfg.humans === n ? "selected" : ""}>${n}</option>`).join("")}</select>
        </label>`}
        <label class="ab-set">Bot
          <select data-set="diff"><option value="0" ${cfg.diff === 0 ? "selected" : ""}>Easy</option><option value="1" ${cfg.diff === 1 ? "selected" : ""}>Normal</option></select>
        </label>
        <label class="ab-set">Durasi ronde
          <select data-set="roundLen">${[60, 75, 90].map(n => `<option value="${n}" ${cfg.roundLen === n ? "selected" : ""}>${n}s</option>`).join("")}</select>
        </label>
      </div>`;
        el.screens.select.innerHTML = `
      <h3 class="ab-h2">PILIH FIGHTER</h3>
      ${sets}${tabs}
      <div class="ab-grid">${[0, 1, 2, 3].map(f => fighterCard(f, guestMode)).join("")}</div>
      ${guestMode
                ? `<div class="ab-sub">Menunggu host memulai pertandingan&hellip;</div>`
                : `<div class="ab-row"><button class="ab-btn" data-action="menu">Kembali</button><button class="ab-btn primary" data-action="start">Mulai Pertandingan</button></div>
           <div class="ab-sub" style="font-size:11px;opacity:.6">Slot kosong otomatis diisi bot sampai 4 pemain · P1 &amp; P3 = RED, P2 &amp; P4 = CYAN</div>`}`;
    }
    function buildPause() {
        el.screens.pause.innerHTML = `
      <h3 class="ab-h2">JEDA</h3>
      <div class="ab-row"><button class="ab-btn primary" data-action="resume">Lanjutkan</button></div>
      <div class="ab-row">
        <label class="ab-vol">Master <input type="range" min="0" max="100" value="${Math.round(cfg.vol * 100)}" data-vol="vol"></label>
        <label class="ab-vol">Musik <input type="range" min="0" max="100" value="${Math.round(cfg.music * 100)}" data-vol="music"></label>
        <label class="ab-vol">SFX <input type="range" min="0" max="100" value="${Math.round(cfg.sfx * 100)}" data-vol="sfx"></label>
      </div>
      ${ctrlHTML}
      <div class="ab-row"><button class="ab-btn" data-action="menu">Keluar ke Menu</button></div>`;
    }
    function buildResults(st) {
        if (!st) return;
        const winner = st.wins[0] >= 2 ? 0 : 1;
        const T = TEAM[winner];
        const rows = [0, 2, 1, 3].map(i => {
            const p = st.players[i], F = FIGHTERS[p.f], TT = TEAM[p.team];
            const who = (p.bot || p.auto) ? "BOT" : "P" + (i + 1);
            return `<tr><td style="color:${TT.col}">${TT.shape === "tri" ? "&#9650;" : "&#9670;"} ${who}</td><td>${F.name}</td><td>${p.stats.g}</td><td>${p.stats.k}</td><td>${Math.round(p.stats.d)}</td><td>${p.stats.a}</td></tr>`;
        }).join("");
        el.screens.results.innerHTML = `
      <div class="ab-title" style="font-size:44px;background:none;color:${T.col};-webkit-text-fill-color:${T.col}">${T.name} MENANG!</div>
      <div class="ab-sub">Skor ronde <b style="color:${TEAM[0].col}">${st.wins[0]}</b> &ndash; <b style="color:${TEAM[1].col}">${st.wins[1]}</b> · ${st.round} ronde dimainkan</div>
      <table class="ab-table"><tr><th>Pemain</th><th>Fighter</th><th>Gol</th><th>KO</th><th>Damage</th><th>Assist</th></tr>${rows}</table>
      ${(!online || isHost)
                ? `<div class="ab-row">
            <button class="ab-btn primary" data-action="rematch">Main Lagi</button>
            <button class="ab-btn" data-action="toselect">Ganti Fighter</button>
            <button class="ab-btn" data-action="menu">Menu Utama</button>
          </div>`
                : `<div class="ab-sub">Menunggu host untuk rematch&hellip;</div><div class="ab-row"><button class="ab-btn" data-action="menu">Kembali</button></div>`}`;
    }
    function buildWait() {
        el.screens.wait.innerHTML = `
      <div class="ab-title" style="font-size:36px">ARENA BATTLE</div>
      <div class="ab-sub">Mode online: menunggu host&hellip;<br>Kamu bermain sebagai <b style="color:${TEAM[1].col}">P2 · CYAN</b> (WASD + mouse / gamepad).</div>`;
    }
    // Overlay bantuan/cheat membekukan simulasi, timer, bot dan penunda.
    let frozenAt = 0;
    function isFrozen() { return ui.paused || helpOpen || cheatsOpen; }
    function syncFreeze() {
        const freeze = isFrozen();
        if (freeze && !frozenAt) frozenAt = nowMs();
        else if (!freeze && frozenAt) {
            const delta = nowMs() - frozenAt;
            // Anchor wall-clock yang tidak di-refresh saat jeda ikut digeser.
            if (gT0 && gT0 < frozenAt) gT0 += delta;
            frozenAt = 0; lastTs = 0; acc = 0;
        }
    }
    function syncOverlays() {
        const blocked = helpOpen || cheatsOpen;
        for (const k in el.screens) {
            const show = (k === ui.screen) && !blocked;
            el.screens[k].hidden = !show;
            el.screens[k].style.display = show ? "flex" : "none";
        }
        el.ov.help.hidden = !helpOpen;
        el.ov.help.style.display = helpOpen ? "flex" : "none";
        el.ov.cheats.hidden = !cheatsOpen || helpOpen;
        el.ov.cheats.style.display = (cheatsOpen && !helpOpen) ? "flex" : "none";

        // Perbarui label span, BUKAN button.textContent (ikon harus tetap ada).
        const pbtn = root.querySelector("[data-pause]");
        if (pbtn) {
            const label = pbtn.querySelector(".ab-btn-label");
            if (label) label.textContent = ui.paused ? "Lanjut" : "Jeda";
            pbtn.setAttribute("aria-label", ui.paused ? "Lanjutkan" : "Jeda");
            pbtn.title = ui.paused ? "Lanjutkan (P)" : "Jeda (P)";
            const iconWrap = pbtn.querySelector("[data-pause-icon]");
            if (iconWrap) iconWrap.innerHTML = iconSVG(ui.paused ? "play" : "pause", { size: 14 });
        }
        const cbtn = root.querySelector("[data-cheats]");
        if (cbtn) { cbtn.classList.toggle("on", cheatsOpen); cbtn.disabled = online && !isHost; }
        const hbtn = root.querySelector("[data-help]");
        if (hbtn) hbtn.classList.toggle("on", helpOpen);
        const rbtn = root.querySelector("[data-restart]");
        if (rbtn) rbtn.disabled = !isHost || !S || S.demo;
        syncFreeze();
    }
    function toggleHelp(on) {
        helpOpen = typeof on === "boolean" ? on : !helpOpen;
        if (helpOpen) cheatsOpen = false;
        syncOverlays();
    }
    function showScreen(name) {
        ui.screen = name;
        syncOverlays();
        el.hud.style.display = (name === "match" || name === "pause") ? "flex" : "none";
        el.hint.style.display = name === "match" ? "block" : "none";
        el.status.textContent = { menu: "Siap", select: "Pilih Fighter", match: "Bermain", pause: "Jeda", results: "Selesai", wait: "Menunggu host" }[name] || "Siap";
        syncTopHud(S && !S.demo ? S : null);
        if (name === "menu") buildMenu();
        if (name === "select") buildSelect();
        if (name === "pause") buildPause();
        if (name === "wait") buildWait();
        if (online && isHost) publish();
    }
    function setHint() {
        let t = "P1: WASD + mouse · klik serang · klik-kanan skill · Spasi dash · E ambil/oper";
        if (!online && cfg.humans >= 2) t += "  |  P2: Panah · . serang · , skill · / dash · RShift ambil";
        if (pads.some(Boolean)) t += "  |  Gamepad: RT serang · LT skill · A dash · X ambil";
        el.hint.textContent = t;
    }
    function countResult(st) {
        if (resultsCounted || !st || st.demo || st.settings.humans < 2) return;
        resultsCounted = true;
        const winner = st.wins[0] >= 2 ? 0 : 1;
        streak = winner === localTeam() ? streak + 1 : 0;
        if (streak > best) { best = streak; try { localStorage.setItem(BEST_KEY, String(best)); } catch (e) { } }
        syncTopHud(st);
    }
    function startMatch() {
        const settings = { humans: online ? 2 : cfg.humans, diff: cfg.diff, roundLen: cfg.roundLen };
        S = newState(settings, picks, false);
        gLastIn = -99; gCmd = { mx: 0, my: 0, ax: null, ay: null, atk: false, skl: false, dash: false, grab: false };
        resetFx(); ui.paused = false; resultsCounted = false;
        setHint(); showScreen("match");
    }
    function toMenu() {
        ui.paused = false;
        if (isHost) { S = newDemo(); resetFx(); showScreen("menu"); }
        else showScreen("wait");
    }
    function toSelect() {
        ui.paused = false;
        if (isHost) { S = newDemo(); resetFx(); }
        ui.activeSlot = 0; showScreen("select");
    }
    function togglePause() {
        if (helpOpen || cheatsOpen) return;
        if (ui.screen === "match" && !ui.paused) {
            ui.paused = true; showScreen("pause"); if (online && isHost) publish();
        } else if (ui.screen === "pause") {
            ui.paused = false; showScreen("match");
        } else if (ui.screen === "select") {
            toMenu();
        }
    }

    // ---------- online (host-authoritative sederhana) ----------
    const unsubs = [];
    let view = null, gFrom = null, gTo = null, gT0 = 0, gScr = "", gPicksKey = "";
    const gLatch = { mx: 0, my: 0, ax: null, ay: null, atk: false, skl: false, dash: false, grab: false };
    function snapshot() {
        if (!S) return null;
        return {
            v: 1, scr: ui.screen, ph: S.phase, pt: +S.phaseT.toFixed(2), t: Math.ceil(S.timer), rnd: S.round,
            sc: S.score, w: S.wins, sd: S.sd ? 1 : 0, sdt: Math.floor(S.sdT), gt: S.goalTeam, paused: ui.paused ? 1 : 0,
            pl: S.players.map(p => ({ x: Math.round(p.x), y: Math.round(p.y), a: +p.aim.toFixed(2), h: Math.round(p.hp), e: Math.round(p.en), f: p.f, b: (p.bot || p.auto) ? 1 : 0, k: +p.koT.toFixed(1), d: p.dashT > 0 ? 1 : 0, r: p.rushT > 0 ? 1 : 0, fl: p.flashT > 0 ? 1 : 0, i: p.invulnT > 0 ? 1 : 0, st: p.stunT > 0 ? 1 : 0 })),
            bl: { x: Math.round(S.ball.x), y: Math.round(S.ball.y), c: S.ball.carrier },
            ba: S.barriers.map(b => Math.round(b.hp)),
            pj: S.proj.map(p => [Math.round(p.x), Math.round(p.y), p.type, p.owner]),
            ev: netEvQ.splice(0, 40),
            st: S.players.map(p => [p.stats.g, p.stats.k, Math.round(p.stats.d), p.stats.a]),
            pk: picks, cfg: { h: S.settings.humans, d: S.settings.diff, l: S.settings.roundLen },
        };
    }
    function publish() {
        if (!online || !isHost) return;
        const snap = snapshot();
        if (snap) room.publishState(snap).catch(console.warn);
    }
    function applyAction(action, actor) {
        if (!online || !isHost || !action || typeof action !== "object") return;
        if (action.type === "in" && action.c && S && !S.demo) {
            const c = action.c;
            gCmd = {
                mx: clamp(+c.mx || 0, -1, 1), my: clamp(+c.my || 0, -1, 1),
                ax: c.ax == null ? null : +c.ax, ay: c.ay == null ? null : +c.ay,
                atk: !!c.atk, skl: !!c.skl || gCmd.skl, dash: !!c.dash || gCmd.dash, grab: !!c.grab || gCmd.grab,
            };
            gLastIn = S.time;
        } else if (action.type === "pick" && ui.screen === "select") {
            picks[1] = clamp(action.f | 0, 0, 3);
            buildSelect(); publish();
        } else if (action.type === "hello") publish();
    }
    function submitAction(action) {
        if (online && !isHost) room.sendAction(action).catch(console.warn);
    }
    function expand(snap) {
        return {
            demo: false, phase: snap.ph, phaseT: snap.pt, timer: snap.t, round: snap.rnd,
            score: snap.sc, wins: snap.w, sd: !!snap.sd, sdT: snap.sdt, goalTeam: snap.gt, ballMult: 1,
            settings: { humans: snap.cfg.h, diff: snap.cfg.d, roundLen: snap.cfg.l }, picks: snap.pk,
            players: snap.pl.map((a, i) => ({
                slot: i, team: (i === 0 || i === 2) ? 0 : 1, x: a.x, y: a.y, aim: a.a, hp: a.h, en: a.e, f: a.f,
                bot: !!a.b, auto: false, koT: a.k, dashT: a.d ? 0.1 : 0, rushT: a.r ? 0.1 : 0,
                flashT: a.fl ? 0.1 : 0, invulnT: a.i ? 0.1 : 0, stunT: a.st ? 0.1 : 0,
                vx: 0, vy: 0, campT: 0, stats: { g: snap.st[i][0], k: snap.st[i][1], d: snap.st[i][2], a: snap.st[i][3] },
            })),
            ball: { x: snap.bl.x, y: snap.bl.y, vx: 0, vy: 0, carrier: snap.bl.c, trail: [] },
            barriers: BARS.map((b, i) => ({ ...b, hp: snap.ba[i] })),
            proj: snap.pj.map(a => ({ x: a[0], y: a[1], vx: 0, vy: 0, r: 7, col: FIGHTERS[snap.pl[a[3]].f].col })),
        };
    }
    function onSnap(snap) {
        if (!snap || !snap.pl) return;
        if (Array.isArray(snap.pk)) picks = snap.pk.slice();
        const nv = expand(snap);
        if (view) {
            gFrom = { pl: view.players.map(p => ({ x: p.x, y: p.y })), bx: view.ball.x, by: view.ball.y };
            nv.ball.trail = view.ball.trail;
        } else {
            gFrom = { pl: nv.players.map(p => ({ x: p.x, y: p.y })), bx: nv.ball.x, by: nv.ball.y };
        }
        gTo = { pl: nv.players.map(p => ({ x: p.x, y: p.y })), bx: nv.ball.x, by: nv.ball.y };
        gT0 = lastTs;
        view = nv;
        (snap.ev || []).forEach(e => applyFx(e.t, e.d));
        if (snap.paused && ui.screen === "match") setToast("Host menjeda permainan", 1.2);
        if (snap.scr !== gScr) {
            gScr = snap.scr;
            if (snap.scr === "match") { ui.paused = false; resultsCounted = false; showScreen("match"); setHint(); }
            else if (snap.scr === "select") showScreen("select");
            else if (snap.scr === "results") { countResult(view); buildResults(view); showScreen("results"); }
            else showScreen("wait");
        } else if (snap.scr === "select") {
            const key = snap.pk.join(",");
            if (key !== gPicksKey) { gPicksKey = key; buildSelect(); }
        }
    }
    function guestFrame(dt, ts) {
        if (!view) return;
        const k = clamp((ts - gT0) / 90, 0, 1);
        for (let i = 0; i < 4; i++) {
            view.players[i].x = lerp(gFrom.pl[i].x, gTo.pl[i].x, k);
            view.players[i].y = lerp(gFrom.pl[i].y, gTo.pl[i].y, k);
        }
        const b = view.ball;
        b.x = lerp(gFrom.bx, gTo.bx, k); b.y = lerp(gFrom.by, gTo.by, k);
        const sp = hyp(b.x - (b._lx ?? b.x), b.y - (b._ly ?? b.y)) / Math.max(dt, 0.001);
        if (sp > 260 && b.carrier < 0) { b.trail.push({ x: b.x, y: b.y }); if (b.trail.length > 12) b.trail.shift(); }
        else if (b.trail.length) b.trail.shift();
        b._lx = b.x; b._ly = b.y;
        if (ui.screen === "match" && !ui.paused) {
            const c = readCmd(mySlot, view.players[mySlot]);
            if (c) {
                gLatch.mx = c.mx; gLatch.my = c.my; gLatch.ax = c.ax; gLatch.ay = c.ay; gLatch.atk = c.atk;
                gLatch.skl = gLatch.skl || c.skl; gLatch.dash = gLatch.dash || c.dash; gLatch.grab = gLatch.grab || c.grab;
            }
        }
        inAcc += dt;
        if (inAcc >= 0.05) {
            inAcc = 0;
            submitAction({ type: "in", c: { ...gLatch } });
            gLatch.skl = gLatch.dash = gLatch.grab = false;
        }
    }

    // ---------- event handler ----------
    function handleClick(event) {
        const t = event.target;
        if (!t || !t.closest) return;
        if (t.closest("[data-exit]")) { onExit(); return; }
        if (t.closest("[data-help]")) { AU.ensure(); toggleHelp(); return; }
        if (t.closest("[data-help-close]")) { toggleHelp(false); return; }
        if (t.closest("[data-cheats]")) {
            AU.ensure();
            if (!isHost) return;
            cheatsOpen = !cheatsOpen;
            if (cheatsOpen) helpOpen = false;
            syncOverlays(); return;
        }
        if (t.closest("[data-cheat-close]")) { cheatsOpen = false; syncOverlays(); return; }
        if (t.closest("[data-pause]")) { AU.ensure(); togglePause(); return; }
        if (t.closest("[data-restart]")) {
            AU.ensure();
            if (isHost && S && !S.demo && !helpOpen && !cheatsOpen) startMatch();
            return;
        }
        const cheatBtn = t.closest("[data-cheatact]");
        if (cheatBtn) { AU.ensure(); cheatAction(cheatBtn.dataset.cheatact); AU.sfx("select"); return; }
        const b = t.closest("[data-action]");
        if (!b) return;
        AU.ensure(); AU.sfx("ui");
        const a = b.dataset.action;
        if (a === "pause" || a === "resume") togglePause();
        else if (a === "play") toSelect();
        else if (a === "help") toggleHelp(true);
        else if (a === "menu") toMenu();
        else if (a === "toselect") toSelect();
        else if (a === "start" && isHost) startMatch();
        else if (a === "rematch" && isHost) startMatch();
        else if (a === "slot") { ui.activeSlot = clamp(+b.dataset.slot || 0, 0, 3); buildSelect(); }
        else if (a === "pick") {
            const f = clamp(+b.dataset.f || 0, 0, 3);
            if (online && !isHost) { submitAction({ type: "pick", f }); AU.sfx("select"); }
            else { picks[ui.activeSlot] = f; AU.sfx("select"); buildSelect(); }
        }
    }
    function handleChange(e) {
        const s = e.target.closest("[data-set]");
        if (!s) return;
        const key = s.dataset.set, v = parseInt(s.value, 10);
        if (key === "humans") cfg.humans = clamp(v, 2, 4);
        else if (key === "diff") cfg.diff = clamp(v, 0, 1);
        else if (key === "roundLen") cfg.roundLen = clamp(v, 60, 90);
        saveCfg(); buildSelect();
    }
    function handleInput(e) {
        const r = e.target.closest("[data-vol]");
        if (!r) return;
        cfg[r.dataset.vol] = clamp((parseInt(r.value, 10) || 0) / 100, 0, 1);
        AU.ensure(); AU.setVol(); saveCfg();
    }
    function onKeyDown(e) {
        const tag = e.target && e.target.tagName;
        if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") {
            if (e.code === "Escape") e.target.blur();
            return;
        }
        AU.ensure();
        const c = e.code;
        // Prioritas: H → C → P/Esc → R → aksi game.
        if (c === "KeyH") { toggleHelp(); e.preventDefault(); return; }
        if (c === "KeyC") {
            if (!helpOpen && isHost) { cheatsOpen = !cheatsOpen; syncOverlays(); }
            e.preventDefault(); return;
        }
        if (c === "KeyP" || c === "Escape") {
            if (helpOpen) toggleHelp(false);
            else if (cheatsOpen) { cheatsOpen = false; syncOverlays(); }
            else togglePause();
            e.preventDefault(); return;
        }
        if (c === "KeyR") {
            if (!helpOpen && !cheatsOpen && isHost && S && !S.demo && ui.screen !== "menu") {
                AU.sfx("ui"); startMatch();
            }
            e.preventDefault(); return;
        }
        if (c === "Enter") {
            if (helpOpen) toggleHelp(false);
            else if (cheatsOpen) { cheatsOpen = false; syncOverlays(); }
            else if (ui.screen === "select" && isHost) startMatch();
            else if (ui.screen === "pause") togglePause();
            e.preventDefault(); return;
        }
        if (ui.screen === "match" && GAME_KEYS.has(c)) e.preventDefault();
        if (!e.repeat) keysPressed.add(c);
        keysDown.add(c);
    }
    function onKeyUp(e) { keysDown.delete(e.code); }
    function onMouseMove(e) { mouse.x = e.clientX; mouse.y = e.clientY; }
    function onMouseDown(e) {
        AU.ensure();
        if (e.button === 0) { mouse.l = true; mouse.lp = true; }
        if (e.button === 2) { mouse.r = true; mouse.rp = true; }
        e.preventDefault();
    }
    function onMouseUp(e) { if (e.button === 0) mouse.l = false; if (e.button === 2) mouse.r = false; }
    function onCtx(e) { e.preventDefault(); }
    function onVis() { if (document.hidden && ui.screen === "match" && !ui.paused) togglePause(); }
    function onBlur() { keysDown.clear(); mouse.l = mouse.r = false; }
    function unlock() { AU.ensure(); }

    // ---------- loop utama ----------
    const STEP = 1 / 60;
    let raf = 0, lastTs = 0, acc = 0, pubAcc = 0, inAcc = 0, hudAcc = 0;
    function frame(ts) {
        raf = requestAnimationFrame(frame);
        if (!lastTs) lastTs = ts;
        const dt = Math.min(0.1, (ts - lastTs) / 1000);
        lastTs = ts;
        const frozen = isFrozen();
        if (!frozen) tickTimers(dt);
        pollPads();
        if (isHost) {
            if (S) {
                const active = !frozen || (S.demo && !helpOpen && !cheatsOpen);
                if (FX.hitstop > 0) FX.hitstop -= dt;
                else if (active) {
                    acc += dt;
                    let cmds = gatherCmds(), steps = 0;
                    while (acc >= STEP && steps < 8) {
                        stepSim(S, STEP, cmds);
                        cmds = cmds.map(c => c ? { ...c, skl: false, dash: false, grab: false } : null);
                        acc -= STEP; steps++;
                    }
                    if (steps >= 8) acc = 0;
                }
                if (S.demo && S.phase === "done") { S = newDemo(); resetFx(); }
                if (!S.demo && S.phase === "done" && ui.screen === "match") {
                    countResult(S); buildResults(S); showScreen("results");
                }
            }
            if (!frozen) fxStep(dt);
            draw(S, ts);
            hudAcc += dt;
            if (hudAcc > 0.1) { hudAcc = 0; if (ui.screen === "match" || ui.screen === "pause") hudUpdate(S); }
            AU.musicTick(S && !S.demo && ui.screen === "match" && !frozen && (S.phase === "play" || S.phase === "countdown"));
            if (online) {
                pubAcc += dt;
                if (pubAcc >= (ui.screen === "match" ? 0.09 : 0.35)) { pubAcc = 0; publish(); }
            }
        } else {
            if (!frozen) guestFrame(dt, ts);
            if (!frozen) fxStep(dt);
            draw(view, ts);
            hudAcc += dt;
            if (hudAcc > 0.1) { hudAcc = 0; if (view && (ui.screen === "match" || ui.screen === "pause")) hudUpdate(view); }
            AU.musicTick(view && ui.screen === "match" && !frozen && view.phase === "play");
        }
        keysPressed.clear(); mouse.lp = false; mouse.rp = false;
    }

    // ---------- pasang & mulai ----------
    root.addEventListener("click", handleClick);
    root.addEventListener("change", handleChange);
    root.addEventListener("input", handleInput);
    root.addEventListener("pointerdown", unlock);
    cv.addEventListener("mousedown", onMouseDown);
    board.addEventListener("contextmenu", onCtx);
    cv.addEventListener("contextmenu", onCtx);
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("resize", resize);
    window.addEventListener("blur", onBlur);
    document.addEventListener("visibilitychange", onVis);
    let ro = null;
    if (typeof ResizeObserver !== "undefined") {
        ro = new ResizeObserver(() => resize());
        ro.observe(board);
    }
    resize();
    if (online) {
        if (isHost) {
            S = newDemo();
            showScreen("menu");
            publish();
            const u1 = room.onAction((action) => applyAction(action, 1));
            if (typeof u1 === "function") unsubs.push(u1);
        } else {
            showScreen("wait");
            const u2 = room.onState((snap) => onSnap(snap));
            if (typeof u2 === "function") unsubs.push(u2);
            submitAction({ type: "hello" });
        }
        const u3 = room.onRoom((nextRoom) => { roomData = nextRoom; });
        if (typeof u3 === "function") unsubs.push(u3);
    } else {
        S = newDemo();
        showScreen("menu");
    }
    raf = requestAnimationFrame(frame);

    return {
        destroy() {
            cancelAnimationFrame(raf);
            timers = [];
            if (ro) { try { ro.disconnect(); } catch (e) { /* abaikan */ } }
            root.removeEventListener("click", handleClick);
            root.removeEventListener("change", handleChange);
            root.removeEventListener("input", handleInput);
            root.removeEventListener("pointerdown", unlock);
            cv.removeEventListener("mousedown", onMouseDown);
            board.removeEventListener("contextmenu", onCtx);
            cv.removeEventListener("contextmenu", onCtx);
            window.removeEventListener("mousemove", onMouseMove);
            window.removeEventListener("mouseup", onMouseUp);
            window.removeEventListener("keydown", onKeyDown);
            window.removeEventListener("keyup", onKeyUp);
            window.removeEventListener("resize", resize);
            window.removeEventListener("blur", onBlur);
            document.removeEventListener("visibilitychange", onVis);
            unsubs.forEach((f) => { try { f(); } catch (e) { } });
            AU.close();
            root.innerHTML = "";
        },
    };
}