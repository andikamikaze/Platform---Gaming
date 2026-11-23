/* ==== GAME: city-take-over.js ==== */

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
    let sel = -1, tgt = -1, hover = -1, frac = 0.5, cheatOpen = false;
    let raf = 0, lastT = 0, pubT = 0, closed = false;
    const unsubs = [];
    const uid = Math.random().toString(36).slice(2, 8);

    const cheatHtml = online ? "" : `
    <div class="ct-cheats" data-cheats hidden>
      <div class="ct-cheat-head"><b>Cheats</b><button type="button" data-act="cheat-close">\u2715</button></div>
      <button type="button" data-act="cheat-do" data-cheat="troops">+100 troops (semua kotamu)</button>
      <button type="button" data-act="cheat-do" data-cheat="upgrade">Max upgrade (semua kotamu)</button>
      <button type="button" data-act="cheat-do" data-cheat="weaken">Garrison lawan jadi 1</button>
      <button type="button" data-act="cheat-do" data-cheat="capture">Rebut kota di kursor</button>
      <button type="button" data-act="cheat-do" data-cheat="freeze"><span data-lbl="freeze">Freeze bot: off</span></button>
      <button type="button" data-act="cheat-do" data-cheat="turbo"><span data-lbl="turbo">Turbo growth \u00d75: off</span></button>
    </div>`;

    root.innerHTML = `
<style>
.ct-app{max-width:920px;margin:0 auto}
.ct-app .ct-hud{display:flex;gap:8px;flex-wrap:wrap;margin:0 0 10px}
.ct-app .ct-chip{display:inline-flex;align-items:center;gap:6px;font-size:12px;color:#cbd5e1;background:#111a2c;border:1px solid #1e293b;border-radius:999px;padding:4px 10px}
.ct-app .ct-chip i{width:8px;height:8px;border-radius:50%;display:inline-block}
.ct-app .ct-chip b{color:#f1f5f9;font-variant-numeric:tabular-nums}
.ct-app .ct-dim{color:#64748b}
.ct-app .ct-panel{position:relative;padding:10px}
.ct-app .ct-map{display:block;width:100%;aspect-ratio:800/520;background:#0b1220;border:1px solid #1e293b;border-radius:14px;touch-action:manipulation;user-select:none;-webkit-user-select:none}
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
.ct-app .ct-bar{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px}
.ct-app .ct-bar button,.ct-app .ct-cheats button{background:#16213a;color:#e2e8f0;border:1px solid #24324d;border-radius:10px;padding:8px 12px;font-size:12.5px;cursor:pointer;transition:background .15s}
.ct-app .ct-bar button:hover:not(:disabled),.ct-app .ct-cheats button:hover{background:#1d2b4a}
.ct-app .ct-bar button:disabled{opacity:.4;cursor:default}
.ct-app kbd{background:#0b1220;border:1px solid #334155;border-radius:4px;padding:0 4px;font-size:10px;margin-left:6px;color:#94a3b8}
.ct-app .ct-cheats{position:absolute;top:18px;right:18px;z-index:5;display:flex;flex-direction:column;gap:6px;background:rgba(15,23,42,.96);border:1px solid #334155;border-radius:12px;padding:10px;width:230px}
.ct-app .ct-cheats[hidden]{display:none}
.ct-app .ct-cheat-head{display:flex;justify-content:space-between;align-items:center;color:#e2e8f0;font-size:13px;margin-bottom:2px}
.ct-app .ct-cheat-head button{padding:2px 8px}
.ct-app .ct-cheats .on{border-color:#4ade80;color:#4ade80}
.ct-app .ct-over{position:absolute;inset:10px;display:flex;align-items:center;justify-content:center;background:rgba(11,18,32,.85);border-radius:14px;z-index:6}
.ct-app .ct-over[hidden]{display:none}
.ct-app .ct-over-card{text-align:center;padding:24px}
.ct-app .ct-over-card h3{margin:0 0 6px;font-size:26px;color:#e2e8f0}
.ct-app .ct-over-card h3.win{color:#4ade80}
.ct-app .ct-over-card h3.lose{color:#f87171}
.ct-app .ct-over-card p{margin:0 0 14px;color:#94a3b8;font-size:13px}
.ct-app .ct-over-card button{background:#e2e8f0;color:#0b1220;border:0;border-radius:10px;padding:10px 18px;font-size:14px;font-weight:700;cursor:pointer}
@media (pointer:coarse){
  .ct-app .ct-bar button{flex:1 1 30%;padding:13px 10px;font-size:14px}
  .ct-app kbd{display:none}
}
</style>
<div class="game-app ct-app">
  <div class="game-intro">
    <div><h2>City Take Over</h2></div>
    <span class="game-status"><i class="game-status-dot"></i><span data-status>Ready</span></span>
  </div>
  <div class="ct-hud">
    <span class="ct-chip"><i data-dot="you"></i>You&nbsp;<b data-hud="youC">1</b>&nbsp;cities ·&nbsp;<b data-hud="youU">25</b></span>
    <span class="ct-chip"><i data-dot="foe"></i>Rival&nbsp;<b data-hud="foeC">1</b>&nbsp;cities ·&nbsp;<b data-hud="foeU">25</b></span>
    <span class="ct-chip ct-dim"><b data-hud="time">0s</b></span>
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
    <div class="ct-over" data-over hidden>
      <div class="ct-over-card">
        <h3 data-over-title>Victory</h3>
        <p data-over-sub></p>
        <button type="button" data-act="rematch"><span data-lbl="newmap">New map</span></button>
      </div>
    </div>
  </section>
  <div class="ct-bar">
    <button type="button" data-act="cycle" title="Pilih kota berikutnya">\u25b8 Next city<kbd>\u2190\u2192</kbd></button>
    <button type="button" data-act="recruit" title="Tambah pasukan ke kota terpilih (dobel-klik kota juga bisa)"><span data-lbl="recruit">Recruit +12</span><kbd>R</kbd></button>
    <button type="button" data-act="upgrade" title="Upgrade kota terpilih"><span data-lbl="upgrade">Upgrade</span><kbd>U</kbd></button>
    <button type="button" data-act="pct"><span data-lbl="pct">Send 50%</span><kbd>P</kbd></button>
    <button type="button" data-act="clear">\u2715 Clear<kbd>Esc</kbd></button>
    ${online ? "" : '<button type="button" data-act="cheat">Cheats<kbd>C</kbd></button>'}
    <button type="button" data-act="rematch"><span data-lbl="newmap">New map</span>${online ? "" : "<kbd>N</kbd>"}</button>
  </div>
  <div class="game-actions"><button class="game-action-button" type="button" data-act="exit">Exit game</button></div>
</div>`;

    const $ = (s) => root.querySelector(s);
    const $$ = (s) => root.querySelectorAll(s);
    const mapEl = $(".ct-map");
    const layers = {
        paths: $('[data-g="paths"]'), cities: $('[data-g="cities"]'),
        troops: $('[data-g="troops"]'), fx: $('[data-g="fx"]'),
    };
    const statusEl = $("[data-status]");
    const cheatPanel = $("[data-cheats]");
    const overEl = $("[data-over]");
    const overTitle = $("[data-over-title]");
    const overSub = $("[data-over-sub]");
    const hud = {
        youC: $('[data-hud="youC"]'), youU: $('[data-hud="youU"]'),
        foeC: $('[data-hud="foeC"]'), foeU: $('[data-hud="foeU"]'),
        time: $('[data-hud="time"]'),
        dotYou: $('[data-dot="you"]'), dotFoe: $('[data-dot="foe"]'),
    };
    const lbl = {
        recruit: $('[data-lbl="recruit"]'), upgrade: $('[data-lbl="upgrade"]'),
        pct: $('[data-lbl="pct"]'),
        freeze: $('[data-lbl="freeze"]'), turbo: $('[data-lbl="turbo"]'),
    };
    const btn = {
        cycle: $('[data-act="cycle"]'), recruit: $('[data-act="recruit"]'),
        upgrade: $('[data-act="upgrade"]'), clear: $('[data-act="clear"]'),
    };

    const mySide = () => (state ? state.sides[isHost ? "host" : "guest"] : 0);
    const cursor = () => (tgt >= 0 ? tgt : hover);
    const f1 = (n) => n.toFixed(1);

    /* ---------- render ---------- */
    function render(now) {
        if (!state) { statusEl.textContent = "Waiting for host\u2026"; return; }
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
        hud.dotYou.style.background = COL[my];
        hud.dotFoe.style.background = COL[foe];

        const d = sel >= 0 ? state.b[sel] : null;
        const canAct = Boolean(d) && d.owner === my && !state.over;
        btn.cycle.disabled = you.c === 0 || state.over;
        btn.clear.disabled = sel < 0;
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
            overSub.textContent = you.c + "/" + state.b.length + " cities · " +
                you.u + " troops · " + Math.floor(state.t) + "s";
            overEl.hidden = false;
        } else {
            overEl.hidden = true;
            statusEl.textContent = state.t < 6
                ? (state.first === my ? "You move first"
                    : online ? "Rival moves first" : "Bot moves first")
                : "You are " + SIDE_NAME[my];
        }
    }

    /* ---------- alur & sinkronisasi ---------- */
    function publish() {
        render(performance.now());
        if (online && isHost) room.publishState(state).catch(console.warn);
    }

    function startLocal() {
        state = newGame((Math.random() * 1e9) | 0, online);
        sel = tgt = hover = -1;
        cheatOpen = false;
        if (cheatPanel) cheatPanel.hidden = true;
        pubT = 0;
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
        if (state && !state.over && (!online || isHost)) {
            stepGame(state, dt, !online);
            if (online) {
                pubT += dt;
                if (pubT >= 0.12 || state.over) {
                    pubT = 0;
                    room.publishState(state).catch(console.warn);
                }
            }
        }
        render(t);
    }

    /* ---------- input: mouse / touch ---------- */
    function interact(i) {
        if (!state || state.over) return;
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
        const b = e.target.closest("[data-act]");
        if (b) {
            const a = b.dataset.act;
            if (a === "exit") onExit();
            else if (a === "cycle") cycleSel(1);
            else if (a === "recruit" && sel >= 0) submitAction({ type: "recruit", i: sel });
            else if (a === "upgrade" && sel >= 0) submitAction({ type: "upgrade", i: sel });
            else if (a === "pct") frac = frac === 0.5 ? 1 : 0.5;
            else if (a === "clear") { sel = -1; tgt = -1; }
            else if (a === "cheat" && cheatPanel) {
                cheatOpen = !cheatOpen; cheatPanel.hidden = !cheatOpen;
            } else if (a === "cheat-close" && cheatPanel) {
                cheatOpen = false; cheatPanel.hidden = true;
            } else if (a === "cheat-do") submitAction({ type: "cheat", kind: b.dataset.cheat });
            else if (a === "rematch") submitAction({ type: "rematch" });
            render(performance.now());
            return;
        }
        const c = e.target.closest("[data-i]");
        if (c && mapEl.contains(c)) { interact(+c.dataset.i); return; }
        if (e.target.closest(".ct-map")) { sel = -1; tgt = -1; }
    }

    function handleMove(e) {
        const c = e.target.closest("[data-i]");
        hover = c && mapEl.contains(c) ? +c.dataset.i : -1;
    }
    function handleLeave() { hover = -1; }
    function handleCtx(e) { e.preventDefault(); sel = -1; tgt = -1; }

    /* ---------- input: keyboard ---------- */
    function handleKey(e) {
        if (closed || !root.isConnected) return;
        const t = e.target;
        if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" ||
            t.tagName === "SELECT" || t.isContentEditable)) return;
        const k = e.key;
        let used = true;
        if (k === "Escape") {
            if (cheatOpen && cheatPanel) { cheatOpen = false; cheatPanel.hidden = true; }
            else if (tgt >= 0) tgt = -1;
            else sel = -1;
        }
        else if (k === "ArrowLeft" || k === "a" || k === "A") cycleSel(-1);
        else if (k === "ArrowRight" || k === "d" || k === "D") cycleSel(1);
        else if (k === "ArrowUp" || k === "w" || k === "W") cycleTgt(-1);
        else if (k === "ArrowDown" || k === "s" || k === "S") cycleTgt(1);
        else if (k === "Enter" || k === " ") {
            const c = cursor();
            if (sel >= 0 && c >= 0 && c !== sel) {
                submitAction({ type: "send", from: sel, to: c, frac });
                tgt = -1;
            } else if (sel < 0) cycleSel(1);
        }
        else if (k === "r" || k === "R") { if (sel >= 0) submitAction({ type: "recruit", i: sel }); }
        else if (k === "u" || k === "U") { if (sel >= 0) submitAction({ type: "upgrade", i: sel }); }
        else if (k === "p" || k === "P") frac = frac === 0.5 ? 1 : 0.5;
        else if ((k === "c" || k === "C") && !online && cheatPanel) {
            cheatOpen = !cheatOpen; cheatPanel.hidden = !cheatOpen;
        }
        else if ((k === "n" || k === "N") && !online) submitAction({ type: "rematch" });
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
                guestAt = performance.now();
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