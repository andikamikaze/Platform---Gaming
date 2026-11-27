/* ==== GAME: city-take-over.js ==== */

import { iconSVG } from "../JS/icons.js";

export const META = {
    id: "city-take-over", // harus sama dengan nama file (tanpa .js)
    name: "City Take Over",
    category: "strategy",
    catLabel: "Strategy",
    desc: "Duel 1v1: kembangkan kotamu, upgrade, dan sapu habis lawan dari peta.",
    art: '<svg viewBox="0 0 48 48" width="54" height="54" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="4" width="40" height="40" rx="6" fill="#0b1220"/><circle cx="14" cy="34" r="8" fill="#38bdf8"/><circle cx="34" cy="14" r="8" fill="#f87171"/><path d="M21 28l7-7" stroke="#94a3b8" stroke-dasharray="3 3"/><circle cx="24" cy="25" r="2" fill="#38bdf8" stroke="none"/><circle cx="27" cy="22" r="2" fill="#38bdf8" stroke="none"/></svg>',
    bg: ["#475569", "#1e293b"],
};

/* =========================================================
   PURE LOGIC — semua state serializable (aman untuk Firebase)
   ========================================================= */
const W = 800, H = 520;                 // area gameplay lebih luas (800x520)
const RADII = [14, 18, 23, 28];         // radius per level kota (0..3)
const RATES = [0.55, 0.85, 1.25, 1.7];  // produksi pasukan/detik (lebih lambat)
const UPCOST = [30, 45, 60];            // biaya upgrade level 0->1->2->3
const CAP = 999;
const SPEED = 55;                       // kecepatan pasukan (lebih lambat)
const RECRUIT_N = 12, RECRUIT_CD = 8;   // tambah pasukan ke kota yang sama
const COL = ["#38bdf8", "#f87171"];     // sisi 0 / sisi 1
const NEUTRAL = "#64748b";
const SIDE_NAME = ["Azure", "Ruby"];
const FX_TTL = 1.3;

/* mulberry32 dengan state numerik di dalam save-state */
function rand(st) {
    st.rs = (st.rs + 0x6d2b79f5) >>> 0;
    let t = st.rs;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

function pushFx(st, x, y, txt, c) {
    st.fx.push({ x, y, txt, c, born: st.t });
    if (st.fx.length > 60) st.fx.splice(0, st.fx.length - 60);
}

/* Random level generator yang dijamin adil & bisa diselesaikan:
   layout simetris titik (setiap kota netral punya kembaran identik),
   jarak minimum antar kota dijaga lewat rejection sampling. */
function genLevel(st) {
    const b = [];
    const add = (x, y, s, owner, u) =>
        b.push({ x, y, s, owner, u, rc: 0 });

    add(86, H - 86, 2, 0, 25);          // markas sisi 0 (kiri-bawah)
    add(W - 86, 86, 2, 1, 25);          // markas sisi 1 (kanan-atas)
    add(W / 2 + (rand(st) - 0.5) * 28,
        H / 2 + (rand(st) - 0.5) * 28, 1, -1, 18); // pusat

    for (let p = 0; p < 6; p++) {       // 6 pasang netral simetris
        let best = null, bestScore = -1, placed = false;
        for (let t = 0; t < 400; t++) {
            const x = 70 + rand(st) * (W - 140);
            const y = 70 + rand(st) * (H - 140);
            const mx = W - x, my = H - y;
            let score = Math.hypot(x - mx, y - my);
            for (const o of b) {
                score = Math.min(score, Math.hypot(x - o.x, y - o.y));
                score = Math.min(score, Math.hypot(mx - o.x, my - o.y));
            }
            if (score > bestScore) { bestScore = score; best = { x, y, mx, my }; }
            if (score >= 78) { placed = true; break; }
        }
        void placed; // fallback: kandidat terbaik tetap dipakai
        const r = rand(st);
        const s = r < 0.45 ? 0 : r < 0.8 ? 1 : 2;
        const u = 6 + s * 5 + Math.floor(rand(st) * 10);
        add(best.x, best.y, s, -1, u);
        add(best.mx, best.my, s, -1, u); // kembaran identik -> fair
    }
    st.b = b;
}

function newGame(seed, online) {
    const st = {
        seed: seed >>> 0, rs: seed >>> 0,
        t: 0, over: false, winner: -1,
        first: 0, sides: { host: 0, guest: 1 },
        b: [], troops: [], fx: [], nextId: 1,
        aiT: 0, aiOn: true, boost: 1,
    };
    st.first = rand(st) < 0.5 ? 0 : 1;              // siapa jalan duluan (acak)
    const hostSide = online ? (rand(st) < 0.5 ? 0 : 1) : 0; // posisi MP acak
    st.sides = { host: hostSide, guest: 1 - hostSide };
    st.aiT = st.first === 1 ? 1.0 + rand(st) : 4.5 + rand(st) * 2;
    genLevel(st);
    return st;
}

function sendTroop(st, side, from, to, frac) {
    if (!Number.isInteger(from) || !Number.isInteger(to)) return false;
    const s = st.b[from], d = st.b[to];
    if (!s || !d || from === to || s.owner !== side || s.u < 2) return false;
    frac = Math.min(1, Math.max(0.1, frac || 0.5));
    const n = Math.min(Math.floor(s.u), Math.max(1, Math.floor(s.u * frac)));
    s.u -= n;
    pushFx(st, s.x, s.y - RADII[s.s] - 8, "\u2212" + n, "#94a3b8");
    const dist = Math.hypot(d.x - s.x, d.y - s.y) || 1;
    st.troops.push({
        id: st.nextId++, x: s.x, y: s.y, from, to, owner: side, n,
        dx: (d.x - s.x) / dist, dy: (d.y - s.y) / dist, left: dist, dist,
    });
    return true;
}

/* mekanik menambah pasukan ke kota yang sama (dobel-klik / tombol / R) */
function recruit(st, side, i) {
    const d = st.b[i];
    if (!d || d.owner !== side || d.rc > 0) return false;
    d.u = Math.min(CAP, d.u + RECRUIT_N);
    d.rc = RECRUIT_CD;
    pushFx(st, d.x, d.y - RADII[d.s] - 8, "+" + RECRUIT_N, "#4ade80");
    return true;
}

/* mekanik upgrade kota: bayar pasukan, level & produksi naik */
function upgradeCity(st, side, i) {
    const d = st.b[i];
    if (!d || d.owner !== side || d.s >= 3) return false;
    const cost = UPCOST[d.s];
    if (d.u < cost + 4) return false;
    d.u -= cost;
    d.s++;
    pushFx(st, d.x, d.y - RADII[d.s] - 8, "\u2212" + cost, "#f87171");
    pushFx(st, d.x, d.y - RADII[d.s] - 24, "LV" + (d.s + 1), "#4ade80");
    return true;
}

function applyCheat(st, kind, cursor) {
    const mine = st.b.filter((x) => x.owner === 0);
    if (kind === "troops") {
        for (const d of mine) {
            d.u = Math.min(CAP, d.u + 100);
            pushFx(st, d.x, d.y - RADII[d.s] - 8, "+100", "#4ade80");
        }
    } else if (kind === "upgrade") {
        for (const d of mine) {
            d.s = 3;
            pushFx(st, d.x, d.y - RADII[d.s] - 8, "MAX", "#4ade80");
        }
    } else if (kind === "weaken") {
        for (const d of st.b) if (d.owner === 1) {
            d.u = 1;
            pushFx(st, d.x, d.y - 22, "\u2212", "#f87171");
        }
    } else if (kind === "capture") {
        const d = st.b[cursor];
        if (d && d.owner !== 0) {
            d.owner = 0; d.u = 10; d.rc = 0;
            pushFx(st, d.x, d.y - 24, "\u2691", COL[0]);
        }
    } else if (kind === "freeze") st.aiOn = !st.aiOn;
    else if (kind === "turbo") st.boost = st.boost === 1 ? 5 : 1;
}

function resolveArrival(st, tr) {
    const d = st.b[tr.to];
    if (d.owner === tr.owner) {
        d.u = Math.min(CAP, d.u + tr.n);
        pushFx(st, d.x, d.y - RADII[d.s] - 8, "+" + tr.n, "#4ade80");
        return;
    }
    d.u -= tr.n;
    if (d.u < 0) {
        d.owner = tr.owner; d.u = -d.u; d.rc = 0;
        pushFx(st, d.x, d.y - RADII[d.s] - 8, "\u2691", COL[tr.owner]);
    } else {
        pushFx(st, d.x, d.y - RADII[d.s] - 8, "\u2212" + tr.n, "#f87171");
    }
}

/* AI 1v1 (sisi 1): serang saat unggul, upgrade saat kaya,
   OTHERWISE tumpuk pasukan / recruit. */
function aiThink(st) {
    const mine = st.b.map((x, i) => ({ x, i })).filter((o) => o.x.owner === 1);
    if (!mine.length) return null;
    mine.sort((a, b) => b.x.u - a.x.u);
    const src = mine[0];
    if (src.x.s < 3 && src.x.u >= UPCOST[src.x.s] + 30 && rand(st) < 0.45)
        return { type: "upgrade", i: src.i };
    const targets = st.b.map((x, i) => ({ x, i }))
        .filter((o) => o.x.owner !== 1)
        .map((o) => ({
            o, cost: o.x.u + Math.hypot(o.x.x - src.x.x, o.x.y - src.x.y) * 0.3 +
                (o.x.owner === -1 ? -8 : 0),
        }))
        .sort((a, b) => a.cost - b.cost);
    const best = targets[0];
    if (best && src.x.u >= 8 && best.o.x.u + 6 < src.x.u * 0.7)
        return { type: "send", from: src.i, to: best.o.i, frac: 0.75 };
    const second = mine[1];
    if (second && second.x.u > 14)
        return { type: "send", from: second.i, to: src.i, frac: 0.5 };
    if (src.x.rc <= 0 && src.x.u < 50) return { type: "recruit", i: src.i };
    return null;
}

function checkEnd(st) {
    if (st.over) return;
    const has = (s) =>
        st.b.some((x) => x.owner === s) || st.troops.some((x) => x.owner === s);
    let w = -1;
    if (st.b.every((x) => x.owner === 0)) w = 0;
    else if (st.b.every((x) => x.owner === 1)) w = 1;
    else if (!has(0) && !has(1)) w = -2;
    else if (!has(0)) w = 1;
    else if (!has(1)) w = 0;
    if (w !== -1) { st.over = true; st.winner = w; }
}

function stepGame(st, dt, withAI) {
    if (st.over) return;
    st.t += dt;
    for (const x of st.b) {
        if (x.owner >= 0) {
            const rate = RATES[x.s] * (x.owner === 0 ? st.boost : 1);
            x.u = Math.min(CAP, x.u + rate * dt);
        }
        if (x.rc > 0) x.rc = Math.max(0, x.rc - dt);
    }
    if (withAI && st.aiOn) {
        st.aiT -= dt;
        if (st.aiT <= 0) {
            st.aiT = 2.6 + rand(st) * 2.2;
            const mv = aiThink(st);
            if (mv) {
                if (mv.type === "send") sendTroop(st, 1, mv.from, mv.to, mv.frac);
                else if (mv.type === "recruit") recruit(st, 1, mv.i);
                else if (mv.type === "upgrade") upgradeCity(st, 1, mv.i);
            }
        }
    }
    for (const tr of st.troops) {
        const step = Math.min(SPEED * dt, tr.left);
        tr.x += tr.dx * step; tr.y += tr.dy * step; tr.left -= step;
        if (tr.left <= 0.01) { tr.done = true; resolveArrival(st, tr); }
    }
    st.troops = st.troops.filter((t) => !t.done);
    st.fx = st.fx.filter((f) => st.t - f.born < FX_TTL);
    checkEnd(st);
}

/* =========================================================
   MOUNT
   ========================================================= */
export function mount(root, context = {}) {
    const { mode = "ai", room = null, onExit = () => { } } = context;
    const online = mode === "room" && Boolean(room);
    const isHost = !online || room.isHost;
    const slot = online && !room.isHost ? 1 : 0;
    let roomData = room?.room || null;

    let state = null, guestAt = 0;
    let sel = -1, tgt = -1, hover = -1, frac = 0.5;
    let cheatOpen = false, helpOpen = false, paused = false;
    let raf = 0, lastT = 0, pubT = 0, closed = false;
    let pauseStart = 0, timeAnchor = 0;
    const unsubs = [];
    const uid = Math.random().toString(36).slice(2, 8);

    let seenHelp = true;
    try { seenHelp = localStorage.getItem("cityTakeOverHelpSeen") === "1"; } catch (_) { seenHelp = true; }
    if (!seenHelp) {
        helpOpen = true;
        try { localStorage.setItem("cityTakeOverHelpSeen", "1"); } catch (_) { /* storage blocked */ }
    }
    /* Pause-aware clock: timeAnchor absorbs frozen spans so neither the bot
       timers nor guest interpolation jump forward after a resume. */
    const nowMs = () => performance.now() - timeAnchor;

    const cheatHtml = online ? "" : `
    <div class="ct-ov" data-ov="cheat" hidden>
      <div class="ct-card">
        <div class="ct-head"><h3>Cheats</h3><button class="ct-btn" type="button" data-cheat-close aria-label="Close cheats">${iconSVG("x", { size: 14 })}</button></div>
        <div class="ct-cheats">
          <button class="ct-btn" type="button" data-cheat-do data-cheat="troops">+100 troops (all your cities)</button>
          <button class="ct-btn" type="button" data-cheat-do data-cheat="upgrade">Max upgrade (all your cities)</button>
          <button class="ct-btn" type="button" data-cheat-do data-cheat="weaken">Rival garrison down to 1</button>
          <button class="ct-btn" type="button" data-cheat-do data-cheat="capture">Capture city under cursor</button>
          <button class="ct-btn" type="button" data-cheat-do data-cheat="freeze"><span data-lbl="freeze">Freeze bot: off</span></button>
          <button class="ct-btn" type="button" data-cheat-do data-cheat="turbo"><span data-lbl="turbo">Turbo growth \u00d75: off</span></button>
        </div>
        <div class="ct-foot"><span class="ct-note">Offline games only</span><button class="ct-btn primary" type="button" data-cheat-close>Close</button></div>
      </div>
    </div>`;

    root.innerHTML = `
<style>
/* City Take Over — single HUD bar, fill-height board, overlay sheets. */
.ct-app{--ct-acc:#4ade80;width:100%;height:100%;min-height:0;margin:0 auto;padding:2px 10px 10px;display:flex;flex-direction:column;gap:8px;outline:none;color:#e2e8f0;font:14px/1.5 ui-sans-serif,system-ui,sans-serif}
.ct-app *{box-sizing:border-box}
.ct-app [hidden]{display:none!important}
.ct-app button:focus-visible{outline:2px solid var(--ct-acc);outline-offset:2px}
.ct-app .ct-hud{display:flex;align-items:center;gap:6px;flex-wrap:wrap;font:600 10.5px/1 ui-monospace,SFMono-Regular,Menlo,monospace}
.ct-app .ct-chip{display:inline-flex;align-items:center;gap:6px;min-height:30px;padding:5px 9px;border:1px solid #1e293b;border-radius:999px;background:#111a2c;color:#cbd5e1;white-space:nowrap}
.ct-app .ct-chip b{color:#f1f5f9;font-variant-numeric:tabular-nums}
.ct-app .ct-chip.ct-dim{color:#64748b}
.ct-app .ct-dot{width:8px;height:8px;border-radius:50%;display:inline-block;flex:none;background:#64748b}
.ct-app .ct-spacer{flex:1 1 auto;min-width:6px}
.ct-app .ct-btn{font:inherit;font-size:11px;padding:6px 10px;min-height:32px;border:1px solid #24324d;border-radius:9px;background:#16213a;color:#e2e8f0;cursor:pointer;transition:background .15s,border-color .15s}
.ct-app .ct-btn:hover:not(:disabled){background:#1d2b4a;border-color:var(--ct-acc)}
.ct-app .ct-btn:disabled{opacity:.4;cursor:default}
.ct-app .ct-btn.on{border-color:var(--ct-acc);color:var(--ct-acc)}
.ct-app .ct-btn.primary{background:#e2e8f0;border-color:#e2e8f0;color:#0b1220;font-weight:700}
.ct-app .ct-btn.primary:hover{background:#cbd5e1}
.ct-app .ct-icon-btn{display:inline-flex;align-items:center;gap:5px}
.ct-app .ct-icon-btn svg{flex:none;display:block}
.ct-app .ct-btn-label{white-space:nowrap}
.ct-app.game-fill>.ct-panel{flex:1 1 auto;min-height:0;aspect-ratio:auto;position:relative;display:flex;align-items:center;justify-content:center;min-width:0;padding:0;border:1px solid #1e293b;border-radius:12px;background:#0b1220;overflow:hidden}
.ct-app .ct-map{position:absolute;inset:0;display:block;width:100%;height:100%;background:#0b1220;touch-action:manipulation;user-select:none;-webkit-user-select:none}
.ct-app .ct-map [data-i]{cursor:pointer}
.ct-app .ct-map text{pointer-events:none;font-family:ui-sans-serif,system-ui,sans-serif}
.ct-app .ct-u{fill:#e2e8f0;font-size:12px;font-weight:700;text-anchor:middle;font-variant-numeric:tabular-nums}
.ct-app .ct-tn{font-size:10px;font-weight:800;text-anchor:middle;paint-order:stroke;stroke:#0b1220;stroke-width:3px}
.ct-app .ct-fx{font-size:12px;font-weight:800;text-anchor:middle;paint-order:stroke;stroke:#0b1220;stroke-width:3px}
.ct-app .ct-path{stroke-dasharray:5 7;animation:ct-dash 1.1s linear infinite}
@keyframes ct-dash{to{stroke-dashoffset:-24}}
.ct-app .ct-aim{stroke-dasharray:3 5}
.ct-app .ct-selring{animation:ct-pulse 1s ease-in-out infinite alternate}
@keyframes ct-pulse{from{stroke-opacity:.35}to{stroke-opacity:1}}
.ct-app .ct-ov{position:absolute;inset:0;z-index:6;display:flex;align-items:center;justify-content:center;padding:12px;background:rgba(11,18,32,.88);border-radius:12px}
.ct-app .ct-card{display:flex;flex-direction:column;overflow:hidden;width:min(430px,100%);max-height:100%;padding:16px;border:1px solid #334155;border-radius:14px;background:#111a2c;color:#e2e8f0;box-shadow:0 10px 30px rgba(0,0,0,.35)}
.ct-app .ct-head{display:flex;align-items:center;justify-content:space-between;gap:10px;flex:none;margin-bottom:10px}
.ct-app .ct-head h3{margin:0;font-size:17px;font-weight:700}
.ct-app .ct-head h3.win{color:var(--ct-acc)}
.ct-app .ct-head h3.lose{color:#f87171}
.ct-app .ct-cheats,.ct-app .ct-help,.ct-app .ct-stats{flex:1 1 auto;min-height:0;overflow:auto}
.ct-app .ct-cheats{display:flex;flex-direction:column;gap:6px}
.ct-app .ct-cheats .ct-btn{width:100%;text-align:left}
.ct-app .ct-cheats .ct-btn.on{border-color:var(--ct-acc);color:var(--ct-acc)}
.ct-app .ct-help{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
.ct-app .ct-help b{display:block;margin:0 0 5px;font:700 10px/1 ui-monospace,monospace;letter-spacing:.08em;color:#94a3b8;text-transform:uppercase}
.ct-app .ct-help ul{margin:0 0 10px;padding-left:16px;font-size:11.5px;line-height:1.65;color:#cbd5e1}
.ct-app .ct-kbd{display:inline-block;padding:1px 5px;border:1px solid #334155;border-bottom-width:2px;border-radius:5px;background:#0b1220;color:#e2e8f0;font:600 10px/1.4 ui-monospace,monospace}
.ct-app .ct-foot{display:flex;align-items:center;justify-content:space-between;gap:10px;flex:none;margin-top:12px;padding-top:10px;border-top:1px solid #334155}
.ct-app .ct-note{font-size:11px;color:#94a3b8}
.ct-app .ct-why{margin:0;font-size:13px;color:#94a3b8}
@media (prefers-reduced-motion:reduce){.ct-app .ct-path,.ct-app .ct-selring{animation:none}}
/* --- layout overrides last (beat pointer:coarse 44px defaults) --- */
@media (max-width:640px){
  .ct-app.game-fill>.ct-panel:not(:has(.ct-ov:not([hidden]))){aspect-ratio:800/520;flex:0 0 auto}
  .ct-app.game-fill>.ct-panel:has(.ct-ov:not([hidden])){flex:0 0 auto;min-height:min(70dvh,620px);aspect-ratio:auto}
  .ct-app{gap:5px;padding:2px 6px 6px}
  .ct-app .ct-hud{gap:4px}
  .ct-app .ct-hud .ct-chip{padding:4px 6px;min-height:0;font-size:9px}
  .ct-app .ct-hud .ct-chip[data-hud="init"]{display:none}
  .ct-app .ct-hud .ct-btn{min-height:32px;padding:5px 8px;font-size:9px}
  .ct-app .ct-hud .ct-btn-label,.ct-app .ct-hud .ct-spacer{display:none}
  .ct-app .ct-ov{padding:8px}
  .ct-app .ct-card{width:100%;height:100%;max-height:100%;padding:12px}
  .ct-app .ct-help{grid-template-columns:1fr;gap:8px}
  .ct-app .ct-cheats,.ct-app .ct-help,.ct-app .ct-stats{scrollbar-width:none}
  .ct-app .ct-cheats::-webkit-scrollbar,.ct-app .ct-help::-webkit-scrollbar,.ct-app .ct-stats::-webkit-scrollbar{display:none}
  .ct-app .ct-note{display:none}
}
@media (pointer:coarse){
  .ct-app .ct-hud .ct-btn{min-height:32px;padding:5px 8px;font-size:9px}
  .ct-app .ct-card .ct-btn{min-height:44px}
}
</style>
<div class="game-app ct-app game-fill" data-ct>
  <div class="ct-hud">
    <span class="ct-chip"><i class="ct-dot" data-dot="you"></i>YOU <b data-hud="youC">1</b>c &middot; <b data-hud="youU">25</b>u</span>
    <span class="ct-chip"><i class="ct-dot" data-dot="foe"></i>RIVAL <b data-hud="foeC">1</b>c &middot; <b data-hud="foeU">25</b>u</span>
    <span class="ct-chip ct-dim"><b data-hud="time">0s</b></span>
    <span class="ct-chip" data-hud="init">FIRST &mdash;</span>
    <span class="ct-chip" data-status>Ready</span>
    <span class="ct-spacer"></span>
    <button class="ct-btn" type="button" data-act="cycle" title="Next city (\u2190/\u2192)">\u25b8 Next</button>
    <button class="ct-btn" type="button" data-act="recruit" title="Recruit +12 (G)"><span data-lbl="recruit">Recruit +12</span></button>
    <button class="ct-btn" type="button" data-act="upgrade" title="Upgrade city (U)"><span data-lbl="upgrade">Upgrade</span></button>
    <button class="ct-btn" type="button" data-act="pct" title="Send fraction (F)"><span data-lbl="pct">Send 50%</span></button>
    <button class="ct-btn ct-icon-btn" type="button" data-help aria-label="How to play" title="How to play (H)">${iconSVG("helpCircle", { size: 14 })}<span class="ct-btn-label">Help</span></button>
    <button class="ct-btn ct-icon-btn" type="button" data-cheats aria-label="Cheats" title="Cheats (C)" ${online ? "disabled" : ""}>${iconSVG("wrench", { size: 14 })}<span class="ct-btn-label">Cheats</span></button>
    <button class="ct-btn ct-icon-btn" type="button" data-pause aria-label="Pause" title="Pause (P)" ${online ? "disabled" : ""}>${iconSVG("pause", { size: 14 })}<span class="ct-btn-label">Pause</span></button>
    <button class="ct-btn ct-icon-btn" type="button" data-restart aria-label="Restart" title="New map (R)">${iconSVG("refresh", { size: 14 })}<span class="ct-btn-label">Restart</span></button>
    <button class="ct-btn ct-icon-btn" type="button" data-exit aria-label="Exit game" title="Exit game">${iconSVG("logOut", { size: 14 })}<span class="ct-btn-label">Exit game</span></button>
  </div>
  <section class="game-panel ct-panel" data-board>
    <svg class="ct-map" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="City take over map">
      <defs>
        <pattern id="ct-grid-${uid}" width="40" height="40" patternUnits="userSpaceOnUse">
          <path d="M40 0H0V40" fill="none" stroke="#94a3b8" stroke-opacity=".06"/>
        </pattern>
      </defs>
      <rect width="${W}" height="${H}" fill="url(#ct-grid-${uid})"/>
      <g data-g="paths"></g>
      <g data-g="cities"></g>
      <g data-g="troops"></g>
      <g data-g="fx"></g>
    </svg>
    ${cheatHtml}
    <div class="ct-ov" data-ov="over" hidden>
      <div class="ct-card">
        <div class="ct-head"><h3 data-over-title>Victory</h3></div>
        <div class="ct-stats"><p class="ct-why" data-over-sub></p></div>
        <div class="ct-foot"><span class="ct-note">Press R for a new map</span><button class="ct-btn primary" type="button" data-act="rematch"><span data-lbl="newmap">New map</span></button></div>
      </div>
    </div>
    <div class="ct-ov" data-ov="pause" hidden>
      <div class="ct-card">
        <div class="ct-head"><h3>Paused</h3></div>
        <div class="ct-stats"><p class="ct-why">The map, bot and timers are frozen.</p></div>
        <div class="ct-foot"><span class="ct-note">Press P or Esc to resume</span><button class="ct-btn primary" type="button" data-resume>Resume</button></div>
      </div>
    </div>
    <div class="ct-ov" data-ov="help" hidden>
      <div class="ct-card">
        <div class="ct-head"><h3>How to play</h3><button class="ct-btn" type="button" data-help-close aria-label="Close">${iconSVG("x", { size: 14 })}</button></div>
        <div class="ct-help">
          <div>
            <b>Desktop</b>
            <ul>
              <li>Click one of your cities to select it, then click another city to send troops.</li>
              <li>Click your selected city again (or <span class="ct-kbd">G</span>) to recruit +12; <span class="ct-kbd">U</span> upgrades it.</li>
              <li><span class="ct-kbd">&larr; &rarr;</span> / <span class="ct-kbd">A D</span> cycle city &middot; <span class="ct-kbd">&uarr; &darr;</span> / <span class="ct-kbd">W S</span> cycle target &middot; <span class="ct-kbd">Enter</span> send.</li>
              <li><span class="ct-kbd">F</span> toggles 50% / 100% send &middot; <span class="ct-kbd">Esc</span> clears selection.</li>
              <li><span class="ct-kbd">H</span> help &middot; <span class="ct-kbd">C</span> cheats &middot; <span class="ct-kbd">P</span> pause &middot; <span class="ct-kbd">R</span> / <span class="ct-kbd">N</span> new map</li>
            </ul>
            <b>Mobile</b>
            <ul>
              <li>Tap one of your cities, then tap a destination to march or reinforce.</li>
              <li>Use the HUD buttons for all actions; the map keeps its aspect ratio.</li>
            </ul>
          </div>
          <div>
            <b>Rules</b>
            <ul>
              <li>Every owned city produces troops over time; higher levels produce faster.</li>
              <li>Upgrades spend troops; recruitment adds a one-off +12 with a short cooldown.</li>
              <li>Arriving troops reinforce your cities or subtract from a rival / neutral garrison; a depleted city changes owner.</li>
              <li>The map is point-symmetric and fair. Capture every city to win.</li>
              <li>Cheats and pause are offline-only; online rooms stay in sync with the host.</li>
            </ul>
            <div class="ct-foot"><span class="ct-note">Press H to reopen this guide</span><button class="ct-btn primary" type="button" data-help-close>Got it</button></div>
          </div>
        </div>
      </div>
    </div>
  </section>
</div>`;

    const $ = (s) => root.querySelector(s);
    const $$ = (s) => root.querySelectorAll(s);
    const mapEl = $(".ct-map");
    const layers = {
        paths: $('[data-g="paths"]'), cities: $('[data-g="cities"]'),
        troops: $('[data-g="troops"]'), fx: $('[data-g="fx"]'),
    };
    const statusEl = $("[data-status]");
    const hud = {
        youC: $('[data-hud="youC"]'), youU: $('[data-hud="youU"]'),
        foeC: $('[data-hud="foeC"]'), foeU: $('[data-hud="foeU"]'),
        time: $('[data-hud="time"]'), init: $('[data-hud="init"]'),
        dotYou: $('[data-dot="you"]'), dotFoe: $('[data-dot="foe"]'),
    };
    const lbl = {
        recruit: $('[data-lbl="recruit"]'), upgrade: $('[data-lbl="upgrade"]'),
        pct: $('[data-lbl="pct"]'),
        freeze: $('[data-lbl="freeze"]'), turbo: $('[data-lbl="turbo"]'),
    };
    const btn = {
        cycle: $('[data-act="cycle"]'),
        recruit: $('[data-act="recruit"]'),
        upgrade: $('[data-act="upgrade"]'),
    };
    const ov = {
        over: $('[data-ov="over"]'),
        pause: $('[data-ov="pause"]'),
        cheat: online ? null : $('[data-ov="cheat"]'),
        help: $('[data-ov="help"]'),
    };
    const overTitle = $("[data-over-title]");
    const overSub = $("[data-over-sub]");

    const mySide = () => (state ? state.sides[isHost ? "host" : "guest"] : 0);
    const cursor = () => (tgt >= 0 ? tgt : hover);
    const f1 = (n) => n.toFixed(1);

    /* ---------- render ---------- */
    function render() {
        const now = nowMs();
        if (!state) {
            statusEl.textContent = "Waiting for host\u2026";
            syncUI();
            return;
        }
        const my = mySide(), foe = 1 - my;
        if (sel >= 0 && (!state.b[sel] || state.b[sel].owner !== my)) { sel = -1; tgt = -1; }
        if (tgt === sel) tgt = -1;
        const ex = online && !isHost ? Math.min(0.25, (now - guestAt) / 1000) : 0;
        const tNow = state.t + ex;
        const cur = cursor();

        /* garis bantu: jalur semua pasukan + garis bidik sel->kursor */
        let s = "";
        for (const tr of state.troops) {
            const a = state.b[tr.from], b = state.b[tr.to];
            s += '<line class="ct-path" x1="' + f1(a.x) + '" y1="' + f1(a.y) +
                '" x2="' + f1(b.x) + '" y2="' + f1(b.y) + '" stroke="' +
                COL[tr.owner] + '" stroke-opacity=".3" stroke-width="1.5"/>';
        }
        if (sel >= 0 && cur >= 0 && cur !== sel && state.b[sel] && state.b[cur]) {
            const a = state.b[sel], b = state.b[cur];
            s += '<line class="ct-aim" x1="' + f1(a.x) + '" y1="' + f1(a.y) +
                '" x2="' + f1(b.x) + '" y2="' + f1(b.y) +
                '" stroke="#e2e8f0" stroke-opacity=".6" stroke-width="1.5"/>';
        }
        layers.paths.innerHTML = s;

        /* kota */
        s = "";
        state.b.forEach((d, i) => {
            const r = RADII[d.s];
            const c = d.owner < 0 ? NEUTRAL : COL[d.owner];
            const x = f1(d.x), y = f1(d.y);
            s += '<g data-i="' + i + '">';
            s += '<circle cx="' + x + '" cy="' + y + '" r="' + (r + 4) +
                '" fill="none" stroke="' + c + '" stroke-opacity=".45" stroke-width="1.5"/>';
            if (i === sel)
                s += '<circle class="ct-selring" cx="' + x + '" cy="' + y + '" r="' + (r + 8) +
                    '" fill="none" stroke="#f8fafc" stroke-width="1.5"/>';
            else if (sel >= 0 && i === cur)
                s += '<circle cx="' + x + '" cy="' + y + '" r="' + (r + 8) +
                    '" fill="none" stroke="#f8fafc" stroke-opacity=".7" stroke-width="1.2" stroke-dasharray="3 4"/>';
            s += '<circle cx="' + x + '" cy="' + y + '" r="' + r +
                '" fill="#0f172a" stroke="' + c + '" stroke-width="2.5"/>';
            if (d.owner === my && d.rc > 0) {
                const p = ((d.rc / RECRUIT_CD) * 100).toFixed(1);
                s += '<circle cx="' + x + '" cy="' + y + '" r="' + (r + 4) +
                    '" fill="none" stroke="#f8fafc" stroke-opacity=".35" stroke-width="2" pathLength="100" stroke-dasharray="' +
                    p + ' 100" transform="rotate(-90 ' + x + " " + y + ')"/>';
            }
            for (let k = 0; k <= d.s; k++)
                s += '<circle cx="' + f1(d.x - d.s * 3 + k * 6) + '" cy="' + f1(d.y + r + 8) +
                    '" r="1.7" fill="' + c + '"/>';
            s += '<text class="ct-u" x="' + x + '" y="' + f1(d.y + 4) + '">' +
                Math.floor(d.u) + "</text></g>";
        });
        layers.cities.innerHTML = s;

        /* pasukan: kerumunan lingkaran sejumlah setengah jumlah pasukan */
        s = "";
        for (const tr of state.troops) {
            const adv = online && !isHost ? Math.min(SPEED * ex, tr.left) : 0;
            const px = tr.x + tr.dx * adv, py = tr.y + tr.dy * adv;
            const traveled = tr.dist - tr.left + adv;
            const dots = Math.min(16, Math.max(1, Math.round(tr.n / 2)));
            s += '<g>';
            for (let k = dots - 1; k >= 0; k--) {
                const back = Math.min(k * 7, traveled);
                const wob = Math.sin(tNow * 5 + tr.id * 1.7 + k * 1.35) * 3.2;
                const dx2 = px - tr.dx * back - tr.dy * wob;
                const dy2 = py - tr.dy * back + tr.dx * wob;
                s += '<circle cx="' + f1(dx2) + '" cy="' + f1(dy2) + '" r="' +
                    (k === 0 ? 4.2 : 2.6) + '" fill="' + COL[tr.owner] +
                    '" stroke="#0b1220" stroke-width="1"/>';
            }
            s += '<text class="ct-tn" x="' + f1(px) + '" y="' + f1(py - 10) +
                '" fill="' + COL[tr.owner] + '">' + tr.n + "</text></g>";
        }
        layers.troops.innerHTML = s;

        /* animasi angka +/- melayang */
        s = "";
        if (!state.over) {
            for (const fx of state.fx) {
                const age = tNow - fx.born;
                if (age < 0 || age >= FX_TTL) continue;
                s += '<text class="ct-fx" x="' + f1(fx.x) + '" y="' + f1(fx.y - age * 26) +
                    '" fill="' + fx.c + '" opacity="' + (1 - age / FX_TTL).toFixed(2) +
                    '">' + fx.txt + "</text>";
            }
        }
        layers.fx.innerHTML = s;

        /* HUD & tombol */
        const sum = (side) => {
            let c = 0, u = 0;
            for (const d of state.b) if (d.owner === side) { c++; u += d.u; }
            for (const t of state.troops) if (t.owner === side) u += t.n;
            return { c, u: Math.floor(u) };
        };
        const you = sum(my), rival = sum(foe);
        hud.youC.textContent = you.c; hud.youU.textContent = you.u;
        hud.foeC.textContent = rival.c; hud.foeU.textContent = rival.u;
        hud.time.textContent = Math.floor(state.t) + "s";
        hud.init.textContent = "FIRST " + (state.first === my
            ? "YOU" : (online ? "RIVAL" : "BOT"));
        hud.dotYou.style.background = COL[my];
        hud.dotFoe.style.background = COL[foe];

        const d = sel >= 0 ? state.b[sel] : null;
        const canAct = Boolean(d) && d.owner === my && !state.over;
        btn.cycle.disabled = you.c === 0 || state.over;
        btn.recruit.disabled = !canAct || d.rc > 0;
        lbl.recruit.textContent = canAct && d.rc > 0
            ? "Recruit " + Math.ceil(d.rc) + "s" : "Recruit +12";
        btn.upgrade.disabled = !canAct || d.s >= 3 || d.u < UPCOST[d.s] + 4;
        lbl.upgrade.textContent = canAct && d.s < 3
            ? "Upgrade \u2212" + UPCOST[d.s] : "Upgrade";
        lbl.pct.textContent = frac === 0.5 ? "Send 50%" : "Send 100%";
        $$('[data-lbl="newmap"]').forEach((el) => {
            el.textContent = online ? (isHost ? "Rematch" : "Ask rematch") : "New map";
        });
        $$('[data-act="rematch"]').forEach((el) => {
            el.disabled = online && !isHost && !state.over;
        });
        if (!online && lbl.freeze) {
            lbl.freeze.textContent = "Freeze bot: " + (state.aiOn ? "off" : "on");
            lbl.turbo.textContent = "Turbo growth \u00d75: " + (state.boost === 1 ? "off" : "on");
            lbl.freeze.parentElement.classList.toggle("on", !state.aiOn);
            lbl.turbo.parentElement.classList.toggle("on", state.boost !== 1);
        }

        /* status & overlay akhir */
        if (state.over) {
            statusEl.textContent = state.winner === my ? "Victory"
                : state.winner === -2 ? "Draw" : "Defeat";
            overTitle.textContent = state.winner === my ? "Victory"
                : state.winner === -2 ? "Draw" : "Defeat";
            overTitle.className = state.winner === my ? "win" : "lose";
            overSub.textContent = you.c + "/" + state.b.length + " cities \u00b7 " +
                you.u + " troops \u00b7 " + Math.floor(state.t) + "s";
        } else {
            statusEl.textContent = state.t < 6
                ? (state.first === my ? "You move first"
                    : online ? "Rival moves first" : "Bot moves first")
                : "You are " + SIDE_NAME[my];
        }
        syncUI();
    }

    /* ---------- overlays & pause ---------- */
    function syncUI() {
        const resultOpen = Boolean(state && state.over);
        ov.over.hidden = !resultOpen || cheatOpen || helpOpen || paused;
        ov.pause.hidden = !paused || cheatOpen || helpOpen;
        if (ov.cheat) ov.cheat.hidden = !cheatOpen || helpOpen;
        ov.help.hidden = !helpOpen;
        const cbtn = root.querySelector("[data-cheats]");
        if (cbtn) cbtn.classList.toggle("on", cheatOpen);
        const pbtn = root.querySelector("[data-pause]");
        if (pbtn) {
            const label = pbtn.querySelector(".ct-btn-label");
            if (label) label.textContent = paused ? "Resume" : "Pause";
            pbtn.setAttribute("aria-label", paused ? "Resume" : "Pause");
            pbtn.disabled = online;
        }
    }

    function toggleHelp(on) {
        helpOpen = typeof on === "boolean" ? on : !helpOpen;
        if (helpOpen) cheatOpen = false;
        render();
    }

    function toggleCheats(on) {
        if (online) return;
        cheatOpen = typeof on === "boolean" ? on : !cheatOpen;
        if (cheatOpen) helpOpen = false;
        render();
    }

    function togglePause(on) {
        if (online) return;
        const next = typeof on === "boolean" ? on : !paused;
        if (next === paused) return;
        paused = next;
        if (paused) {
            pauseStart = performance.now();
        } else {
            if (pauseStart) timeAnchor += performance.now() - pauseStart;
            pauseStart = 0;
            lastT = 0; // no dt spike on the first frame after resume
        }
        render();
    }

    /* ---------- alur & sinkronisasi ---------- */
    function publish() {
        render();
        if (online && isHost) room.publishState(state).catch(console.warn);
    }

    function startLocal() {
        state = newGame((Math.random() * 1e9) | 0, online);
        sel = tgt = hover = -1;
        cheatOpen = false; helpOpen = false;
        paused = false; pauseStart = 0;
        lastT = 0; pubT = 0;
        publish();
    }

    function applyAction(a, actorSlot) {
        if (!state || !a || typeof a !== "object") return;
        const side = state.sides[actorSlot === 0 ? "host" : "guest"];
        if (a.type === "rematch") {
            if (!online || actorSlot === 0 || state.over) startLocal();
            return;
        }
        if (state.over) return;
        if (a.type === "send")
            sendTroop(state, side, a.from | 0, a.to | 0, +a.frac || 0.5);
        else if (a.type === "recruit") recruit(state, side, a.i | 0);
        else if (a.type === "upgrade") upgradeCity(state, side, a.i | 0);
        else if (a.type === "cheat" && !online && actorSlot === 0)
            applyCheat(state, String(a.kind), cursor());
        publish();
    }

    function submitAction(a) {
        if (online && !isHost) { room.sendAction(a).catch(console.warn); return; }
        applyAction(a, slot);
    }

    /* ---------- frame ---------- */
    function frame(t) {
        raf = requestAnimationFrame(frame);
        if (closed) return;
        if (!lastT) lastT = t;
        const dt = Math.min(0.05, (t - lastT) / 1000);
        lastT = t;
        if (state && !state.over && !paused && (!online || isHost)) {
            stepGame(state, dt, !online);
            if (online) {
                pubT += dt;
                if (pubT >= 0.12 || state.over) {
                    pubT = 0;
                    room.publishState(state).catch(console.warn);
                }
            }
        }
        render();
    }

    /* ---------- input: mouse / touch ---------- */
    function interact(i) {
        if (!state || state.over || paused || cheatOpen || helpOpen) return;
        const d = state.b[i];
        if (!d) return;
        if (d.owner === mySide()) {
            if (sel === i) submitAction({ type: "recruit", i }); // kota sama = tambah pasukan
            else { sel = i; tgt = -1; }
        } else if (sel >= 0) {
            submitAction({ type: "send", from: sel, to: i, frac }); // serang / reinforce
            tgt = -1;
        }
    }

    function cycleSel(dir) {
        if (!state || state.over) return;
        const own = state.b.map((x, i) => i).filter((i) => state.b[i].owner === mySide());
        if (!own.length) return;
        const pos = own.indexOf(sel);
        sel = own[(pos + dir + own.length) % own.length];
        tgt = -1;
    }

    function cycleTgt(dir) {
        if (!state || state.over || sel < 0) return;
        const all = state.b.map((x, i) => i).filter((i) => i !== sel);
        const pos = all.indexOf(tgt);
        tgt = all[(pos + dir + all.length) % all.length];
    }

    function handleClick(e) {
        const t = e.target;
        if (!t || !t.closest) return;
        if (t.closest("[data-help]")) { toggleHelp(); return; }
        if (t.closest("[data-help-close]")) { toggleHelp(false); return; }
        if (t.closest("[data-exit]")) { onExit(); return; }
        if (t.closest("[data-cheats]")) { toggleCheats(); return; }
        if (t.closest("[data-cheat-close]")) { cheatOpen = false; render(); return; }
        if (t.closest("[data-pause]")) {
            if (helpOpen) toggleHelp(false);
            else if (cheatOpen) toggleCheats(false);
            else togglePause();
            return;
        }
        if (t.closest("[data-resume]")) { togglePause(false); return; }
        if (t.closest("[data-restart]") || t.closest('[data-act="rematch"]')) {
            submitAction({ type: "rematch" }); return;
        }
        const cheatBtn = t.closest("[data-cheat-do]");
        if (cheatBtn) { submitAction({ type: "cheat", kind: cheatBtn.dataset.cheat }); return; }

        const b = t.closest("[data-act]");
        if (b) {
            const a = b.dataset.act;
            if (a === "cycle") cycleSel(1);
            else if (a === "recruit" && sel >= 0) submitAction({ type: "recruit", i: sel });
            else if (a === "upgrade" && sel >= 0) submitAction({ type: "upgrade", i: sel });
            else if (a === "pct") frac = frac === 0.5 ? 1 : 0.5;
            render();
            return;
        }
        const c = t.closest("[data-i]");
        if (c && mapEl.contains(c)) { interact(+c.dataset.i); return; }
        if (t.closest(".ct-map")) { sel = -1; tgt = -1; }
    }

    function handleMove(e) {
        const c = e.target.closest("[data-i]");
        hover = c && mapEl.contains(c) ? +c.dataset.i : -1;
    }
    function handleLeave() { hover = -1; }
    function handleCtx(e) { e.preventDefault(); sel = -1; tgt = -1; }

    /* ---------- input: keyboard (help > cheats > pause > Esc > actions) ---------- */
    function handleKey(e) {
        if (closed || !root.isConnected) return;
        const t = e.target;
        if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" ||
            t.tagName === "SELECT" || t.isContentEditable)) return;
        const c = e.code;
        let used = true;
        if (c === "KeyH") toggleHelp();
        else if (c === "KeyC") { if (!online) toggleCheats(); }
        else if (c === "KeyP" || c === "Escape") {
            if (helpOpen) toggleHelp(false);
            else if (cheatOpen) toggleCheats(false);
            else if (c === "KeyP") togglePause();
            else { if (tgt >= 0) tgt = -1; else sel = -1; render(); }
        }
        else if (c === "Enter" || c === "Space") {
            if (helpOpen) toggleHelp(false);
            else if (cheatOpen) toggleCheats(false);
            else if (paused) togglePause(false);
            else if (state && state.over) submitAction({ type: "rematch" });
            else {
                const cur = cursor();
                if (sel >= 0 && cur >= 0 && cur !== sel) {
                    submitAction({ type: "send", from: sel, to: cur, frac });
                    tgt = -1;
                } else if (sel < 0) cycleSel(1);
            }
        }
        else if (helpOpen || cheatOpen || paused) used = false;
        else if (c === "KeyR" || c === "KeyN") { if (!online) submitAction({ type: "rematch" }); }
        else if (c === "ArrowLeft" || c === "KeyA") cycleSel(-1);
        else if (c === "ArrowRight" || c === "KeyD") cycleSel(1);
        else if (c === "ArrowUp" || c === "KeyW") cycleTgt(-1);
        else if (c === "ArrowDown" || c === "KeyS") cycleTgt(1);
        else if (c === "KeyG") { if (sel >= 0) submitAction({ type: "recruit", i: sel }); }
        else if (c === "KeyU") { if (sel >= 0) submitAction({ type: "upgrade", i: sel }); }
        else if (c === "KeyF") { frac = frac === 0.5 ? 1 : 0.5; render(); }
        else used = false;
        if (used) e.preventDefault();
    }

    root.addEventListener("click", handleClick);
    mapEl.addEventListener("pointermove", handleMove);
    mapEl.addEventListener("pointerleave", handleLeave);
    mapEl.addEventListener("contextmenu", handleCtx);
    document.addEventListener("keydown", handleKey);

    /* ---------- mode AI / room ---------- */
    if (online) {
        const u1 = room.onRoom((nextRoom) => { roomData = nextRoom; });
        if (typeof u1 === "function") unsubs.push(u1);
        if (isHost) {
            startLocal(); // host权威: simulasi + publish state
            const u2 = room.onAction((a) => applyAction(a, 1));
            if (typeof u2 === "function") unsubs.push(u2);
        } else {
            const u3 = room.onState((ns) => {
                if (closed || !ns) return;
                state = ns;
                guestAt = nowMs();
            });
            if (typeof u3 === "function") unsubs.push(u3);
        }
    } else {
        startLocal();
    }
    raf = requestAnimationFrame(frame);

    return {
        destroy() {
            closed = true;
            cancelAnimationFrame(raf);
            root.removeEventListener("click", handleClick);
            mapEl.removeEventListener("pointermove", handleMove);
            mapEl.removeEventListener("pointerleave", handleLeave);
            mapEl.removeEventListener("contextmenu", handleCtx);
            document.removeEventListener("keydown", handleKey);
            unsubs.forEach((f) => { try { f(); } catch (_) { /* noop */ } });
        },
    };
}
