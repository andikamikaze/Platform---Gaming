/*
 * cat-vs-dog.js — Duel lempar kucing vs anjing, side-view arena dengan tembok tengah.
 * Template: export META + export mount(root, context).
 * Setelah menyalin/mengubah file ini, jalankan: node tools/build-games-manifest.mjs
 */

export const META = {
    id: "cat-vs-dog", // harus sama dengan nama file (tanpa .js)
    name: "Cat vs Dog",
    category: "arcade",
    catLabel: "Arcade",
    desc: "Duel lempar kucing vs anjing: angin, tembok tengah, dan ability.",
    art: '<svg viewBox="0 0 48 48" width="54" height="54" fill="none" aria-hidden="true"><circle cx="15" cy="27" r="10" fill="#fbbf24"/><path d="M9 20l-1-6 5 3zM21 20l1-6-5 3" fill="#fbbf24" stroke="#d97706" stroke-width="1.5"/><circle cx="12" cy="26" r="1.5" fill="#0f172a"/><circle cx="18" cy="26" r="1.5" fill="#0f172a"/><circle cx="33" cy="27" r="10" fill="#cbd5e1"/><path d="M26 22q-4-2-5 3M40 22q4-2 5 3" stroke="#64748b" stroke-width="2.5" stroke-linecap="round"/><circle cx="30" cy="26" r="1.5" fill="#0f172a"/><circle cx="36" cy="26" r="1.5" fill="#0f172a"/><rect x="22" y="14" width="4" height="20" rx="1" fill="#94a3b8"/></svg>',
    bg: ["#e0e7ff", "#c7d2fe"],
};

export function mount(root, context = {}) {
    const { mode = "ai", room = null, playerName = "Player", onExit = () => { } } = context;
    const online = mode === "room" && Boolean(room);
    const playerIndex = online && !room.isHost ? 1 : 0;
    let roomData = room?.room || null;

    /* ================= konstanta arena (statis — tanpa generator level) ================= */
    const WORLD_W = 1200, VIEW_W = 900, H = 420;   // dunia lebih lebar dari viewport -> kamera side-scroll
    const GROUND = 368;
    const WALL_X = 600, WALL_W = 16, WALL_H = 118;
    const WALL_TOP = GROUND - WALL_H;
    const CHAR_X = { L: 200, R: 1000 };
    const BODY_Y = GROUND - 22;
    const BALL_R = 6, HIT_R = 22;
    const GRAV = 360, VEL = 6, WIND_ACC = 6, WIND_MAX = 10;
    const DT = 1 / 120;
    const HP_MAX = 100;
    const CAM_MAX = WORLD_W - VIEW_W;
    const CHAR_OF = { L: "cat", R: "dog" };
    const NAME_OF = { L: "Kucing", R: "Anjing" };
    const ABILITY = {
        cat: { label: "+22 HP", cd: 4 },      // Nine Lives: heal, cooldown 4 giliran
        dog: { label: "Pukulan ×2", cd: 3 },  // Power Bark: damage lemparan berikutnya ×2
    };

    const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
    const other = (s) => (s === "L" ? "R" : "L");
    const dirOf = (s) => (s === "L" ? 1 : -1);

    /* ================= fisika murni (dipakai animasi, bot, auto-aim, host) ================= */
    function throwVel(angle, power, dir) {
        const a = (angle * Math.PI) / 180;
        return { vx: Math.cos(a) * power * VEL * dir, vy: -Math.sin(a) * power * VEL };
    }
    function stepP(p, dt, wind) {
        return {
            x: p.x + p.vx * dt,
            y: p.y + p.vy * dt,
            vx: p.vx + wind * WIND_ACC * dt,
            vy: p.vy + GRAV * dt,
        };
    }
    function originOf(side) {
        const d = dirOf(side);
        return { x: CHAR_X[side] + 20 * d, y: BODY_Y - 10 };
    }
    function terminalAt(p, t, from) {
        if (p.x > WALL_X - WALL_W / 2 - BALL_R && p.x < WALL_X + WALL_W / 2 + BALL_R && p.y > WALL_TOP - BALL_R)
            return { outcome: "wall" };
        for (const s of ["L", "R"]) {
            if (s === from && t < 0.25) continue; // jangan kena diri sendiri saat baru lepas
            const dx = p.x - CHAR_X[s], dy = p.y - BODY_Y;
            if (dx * dx + dy * dy < HIT_R * HIT_R) return { outcome: "hit", hitSide: s };
        }
        if (p.y >= GROUND - 4) return { outcome: "ground" };
        if (p.x < -60 || p.x > WORLD_W + 60) return { outcome: "out" };
        return null;
    }
    function simulateShot(from, angle, power, wind) {
        const o = originOf(from), v = throwVel(angle, power, dirOf(from));
        let p = { x: o.x, y: o.y, vx: v.vx, vy: v.vy }, t = 0;
        for (let i = 0; i < 1500; i++) {
            p = stepP(p, DT, wind); t += DT;
            const r = terminalAt(p, t, from);
            if (r) return { ...r, t, x: p.x, y: p.y, speed: Math.hypot(p.vx, p.vy) };
        }
        return { outcome: "out", t, x: p.x, y: p.y, speed: Math.hypot(p.vx, p.vy) };
    }
    /* Planner: binary-search power untuk beberapa kandidat sudut.
       errA/errP = wobble supaya bot tetap bisa dikalahkan; 0 = auto-aim presisi. */
    function planShot(from, wind, errA, errP) {
        const target = CHAR_X[other(from)], d = dirOf(from);
        const base = 44 + Math.floor(Math.random() * 14);
        const candidates = [base, 45, 52, 38, 58, 33, 62, 42];
        let bestA = base, bestP = 60;
        for (const angle of candidates) {
            let lo = 20, hi = 100, best = 60, found = false;
            for (let i = 0; i < 28; i++) {
                const mid = (lo + hi) / 2;
                const r = simulateShot(from, angle, mid, wind);
                if (r.outcome === "hit" && r.hitSide === other(from)) { best = mid; found = true; break; }
                if (d === 1 ? r.x < target : r.x > target) lo = mid; else hi = mid;
                best = mid;
            }
            bestA = angle; bestP = best;
            const chk = simulateShot(from, angle, best, wind);
            if (found || (chk.outcome === "hit" && chk.hitSide === other(from))) break;
        }
        return {
            angle: clamp(Math.round(bestA + (Math.random() * 2 - 1) * errA), 10, 85),
            power: clamp(Math.round(bestP + (Math.random() * 2 - 1) * errP), 20, 100),
        };
    }
    function newWind() {
        if (cheats.noWind && (!online || room.isHost)) return 0;
        if (Math.random() < 0.15) return 0; // sesekali tenang
        const speed = Math.round(Math.random() * WIND_MAX * 10) / 10;
        return (Math.random() < 0.5 ? -1 : 1) * speed;
    }

    /* ================= cheats (lokal per perangkat) ================= */
    const cheats = { god: false, ohko: false, noWind: false, fullAim: false, ready: false, botMiss: false };

    /* ================= state & runtime ================= */
    let state = null;
    let aim = { angle: 45, power: 70 };
    let flight = null;          // animasi bola lokal (host & guest menghitung deterministik)
    let fxSeen = 0;
    let cam = CAM_MAX / 2;
    let raf = null, lastT = 0, acc = 0;
    let botTimer = null, resolveTimer = null;
    let drag = null;
    let destroyed = false;
    const timers = new Set();
    const unsubs = [];

    function later(fn, ms) {
        const id = setTimeout(() => { timers.delete(id); if (!destroyed) fn(); }, ms);
        timers.add(id);
        return id;
    }

    const uid = Math.random().toString(36).slice(2, 7);

    /* ================= markup (minimalis, tanpa tutorial, tanpa tombol virtual arah) ================= */
    root.innerHTML = `
<style>
.cvd{--line:#e2e8f0;--ink:#0f172a;--mut:#64748b;--acc:#6366f1;color:var(--ink)}
.cvd .game-intro p{color:var(--mut)}
.cvd .game-panel{padding:0;overflow:hidden;border:1px solid var(--line);border-radius:16px;background:#fff}
.cvd-hud{display:grid;grid-template-columns:1fr auto 1fr;gap:12px;align-items:center;padding:12px 16px;border-bottom:1px solid var(--line)}
.cvd-side{display:flex;flex-direction:column;gap:5px;min-width:0}
.cvd-right{align-items:flex-end;text-align:right}
.cvd-name{display:flex;align-items:center;gap:6px;font-size:12px;font-weight:600;color:var(--mut);white-space:nowrap}
.cvd-right .cvd-name{flex-direction:row-reverse}
.cvd-dot{width:7px;height:7px;border-radius:50%;background:#cbd5e1;flex:none;transition:background .2s}
.cvd-dot.on{background:var(--acc)}
.cvd-hpbar{width:100%;max-width:180px;height:6px;border-radius:3px;background:#eef2f7;overflow:hidden}
.cvd-hpbar i{display:block;height:100%;border-radius:3px;background:#34d399;transition:width .35s}
.cvd-right .cvd-hpbar i{margin-left:auto}
.cvd-hpbar.lo i{background:#ef4444}
.cvd-hpnum{font-size:11px;color:var(--mut);font-variant-numeric:tabular-nums}
.cvd-wind{display:flex;flex-direction:column;align-items:center;gap:2px}
.cvd-lbl{font-size:9px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:#94a3b8}
.cvd-windrow{display:flex;align-items:center;gap:6px;min-height:14px}
.cvd-wval{font-size:12px;color:#0284c7;font-variant-numeric:tabular-nums}
.cvd-stage{position:relative;background:#f8fafc}
.cvd-stage svg{display:block;width:100%;aspect-ratio:900/420;touch-action:none;cursor:crosshair;user-select:none;-webkit-user-select:none}
.cvd-bar{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 16px;border-top:1px solid var(--line);flex-wrap:wrap}
.cvd-read{display:flex;gap:8px}
.cvd-read b{min-width:52px;text-align:center;padding:6px 10px;border:1px solid var(--line);border-radius:10px;font-size:13px;font-variant-numeric:tabular-nums;background:#f8fafc}
.cvd-barbtns{display:flex;gap:8px}
.cvd-btn{border:1px solid var(--line);background:#fff;color:var(--ink);border-radius:10px;padding:7px 14px;font-size:12px;font-weight:600;cursor:pointer;transition:border-color .15s,color .15s}
.cvd-btn:hover:not(:disabled){border-color:var(--acc);color:var(--acc)}
.cvd-btn:disabled{opacity:.4;cursor:default}
.cvd-ghost{color:var(--mut)}
.cvd-ov{position:absolute;inset:0;display:grid;place-items:center;background:rgba(248,250,252,.88);backdrop-filter:blur(3px);z-index:5}
.cvd-ov[hidden]{display:none}
.cvd-card{background:#fff;border:1px solid var(--line);border-radius:16px;padding:22px 26px;text-align:center;box-shadow:0 8px 30px rgba(15,23,42,.06);max-width:min(92%,360px)}
.cvd-card h3{margin:0 0 6px;font-size:17px}
.cvd-card p{margin:0 0 14px;font-size:12px;color:var(--mut)}
.cvd-picks{display:flex;gap:10px;justify-content:center}
.cvd-pick{display:flex;flex-direction:column;align-items:center;gap:6px;border:1px solid var(--line);border-radius:14px;background:#fff;padding:14px 20px;font-size:12px;font-weight:600;color:var(--ink);cursor:pointer}
.cvd-pick:hover{border-color:var(--acc)}
.cvd-row{display:flex;gap:8px;justify-content:center;flex-wrap:wrap}
.cvd-cheats .cvd-card{text-align:left;width:min(92%,320px)}
.cvd-cheatrow{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:8px 0;border-bottom:1px solid var(--line);font-size:13px}
.cvd-cheatrow:last-of-type{border-bottom:0}
.cvd-switch{appearance:none;-webkit-appearance:none;width:34px;height:20px;border-radius:10px;background:#e2e8f0;position:relative;cursor:pointer;transition:background .15s;flex:none;margin:0}
.cvd-switch:checked{background:var(--acc)}
.cvd-switch::after{content:"";position:absolute;top:2px;left:2px;width:16px;height:16px;border-radius:50%;background:#fff;transition:left .15s}
.cvd-switch:checked::after{left:16px}
.cvd-note{font-size:10px;color:#94a3b8;margin:10px 0 0}
.cvd-cheatacts{display:flex;gap:8px;margin-top:12px}
.cvd-pop{font:700 15px system-ui,sans-serif;fill:#0f172a;paint-order:stroke;stroke:#fff;stroke-width:3px;text-anchor:middle;pointer-events:none;animation:cvd-rise .9s ease-out forwards}
@keyframes cvd-rise{from{opacity:1;transform:translateY(0)}to{opacity:0;transform:translateY(-28px)}}
.cvd-shake{animation:cvd-shake .4s ease}
@keyframes cvd-shake{0%,100%{transform:translateX(0)}30%{transform:translateX(-5px)}70%{transform:translateX(5px)}}
.cvd-charge{font:800 12px system-ui,sans-serif;fill:#ef4444;text-anchor:middle;paint-order:stroke;stroke:#fff;stroke-width:3px}
@media (max-width:560px){.cvd-hud{padding:10px 12px;gap:8px}.cvd-name{font-size:11px}.cvd-bar{padding:8px 12px}}
</style>
<div class="game-app cvd">
  <div class="game-intro">
    <div><h2>Cat vs Dog</h2><p>Duel halaman — kucing vs anjing.</p></div>
    <span class="game-status"><i class="game-status-dot" data-status-dot></i><span data-status>Menyiapkan…</span></span>
  </div>
  <section class="game-panel" data-board>
    <div class="cvd-hud">
      <div class="cvd-side">
        <span class="cvd-name"><i class="cvd-dot" data-dot="L"></i><span data-name="L">Kucing</span></span>
        <span class="cvd-hpbar"><i data-hp="L" style="width:100%"></i></span>
        <b class="cvd-hpnum" data-hpnum="L">100</b>
      </div>
      <div class="cvd-wind">
        <span class="cvd-lbl">Angin</span>
        <span class="cvd-windrow" data-wind></span>
      </div>
      <div class="cvd-side cvd-right">
        <span class="cvd-name"><i class="cvd-dot" data-dot="R"></i><span data-name="R">Anjing</span></span>
        <span class="cvd-hpbar"><i data-hp="R" style="width:100%"></i></span>
        <b class="cvd-hpnum" data-hpnum="R">100</b>
      </div>
    </div>
    <div class="cvd-stage">
      <svg data-svg viewBox="150 0 900 420" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Arena Cat vs Dog">
        <defs>
          <linearGradient id="cvd-sky-${uid}" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stop-color="#f8fafc"/><stop offset="1" stop-color="#eef2f7"/>
          </linearGradient>
        </defs>
        <rect width="1200" height="420" fill="url(#cvd-sky-${uid})"/>
        <g data-g="par">
          <circle cx="140" cy="70" r="22" fill="#fef3c7" stroke="#fde68a" stroke-width="2"/>
          <ellipse cx="340" cy="88" rx="34" ry="11" fill="#fff" opacity=".9"/>
          <ellipse cx="760" cy="60" rx="28" ry="9" fill="#fff" opacity=".85"/>
          <ellipse cx="1020" cy="120" rx="30" ry="10" fill="#fff" opacity=".9"/>
        </g>
        <rect y="368" width="1200" height="52" fill="#e2e8f0"/>
        <line x1="0" y1="368" x2="1200" y2="368" stroke="#cbd5e1" stroke-width="2"/>
        <g data-g="wall">
          <rect x="592" y="250" width="16" height="118" fill="#cbd5e1" stroke="#94a3b8" stroke-width="1"/>
          <line x1="592" y1="280" x2="608" y2="280" stroke="#94a3b8" stroke-width=".75" opacity=".6"/>
          <line x1="592" y1="310" x2="608" y2="310" stroke="#94a3b8" stroke-width=".75" opacity=".6"/>
          <line x1="592" y1="340" x2="608" y2="340" stroke="#94a3b8" stroke-width=".75" opacity=".6"/>
          <rect x="588" y="246" width="24" height="6" rx="2" fill="#94a3b8"/>
        </g>
        <g data-g="chars"></g>
        <g data-g="aim"></g>
        <g data-g="proj"></g>
        <g data-g="fx"></g>
      </svg>
      <div class="cvd-ov" data-ov="pick" hidden>
        <div class="cvd-card">
          <h3>Pilih karakter</h3>
          <div class="cvd-picks">
            <button class="cvd-pick" type="button" data-pick="cat">
              <svg viewBox="0 0 48 48" width="42" height="42" aria-hidden="true"><circle cx="24" cy="27" r="13" fill="#fbbf24"/><path d="M16 19l-2-9 8 4M32 19l2-9-8 4" fill="#fbbf24" stroke="#d97706" stroke-width="1.5"/><circle cx="19" cy="26" r="2" fill="#0f172a"/><circle cx="29" cy="26" r="2" fill="#0f172a"/><path d="M20 33q4 4 8 0" fill="none" stroke="#0f172a" stroke-width="1.8"/></svg>
              Kucing
            </button>
            <button class="cvd-pick" type="button" data-pick="dog">
              <svg viewBox="0 0 48 48" width="42" height="42" aria-hidden="true"><circle cx="24" cy="27" r="13" fill="#cbd5e1"/><path d="M15 22q-5-3-6 4M33 22q5-3 6 4" fill="none" stroke="#64748b" stroke-width="2.5"/><circle cx="19" cy="26" r="2" fill="#0f172a"/><circle cx="29" cy="26" r="2" fill="#0f172a"/><ellipse cx="24" cy="33" rx="4" ry="3" fill="#0f172a"/></svg>
              Anjing
            </button>
          </div>
        </div>
      </div>
      <div class="cvd-ov" data-ov="wait" hidden>
        <div class="cvd-card"><h3>Menunggu host…</h3></div>
      </div>
      <div class="cvd-ov" data-ov="over" hidden>
        <div class="cvd-card">
          <h3 data-over-title></h3>
          <p data-over-sub></p>
          <div class="cvd-row">
            <button class="cvd-btn" type="button" data-act="rematch">Rematch</button>
            <button class="cvd-btn cvd-ghost" type="button" data-act="repick" data-repick>Ganti karakter</button>
          </div>
        </div>
      </div>
      <div class="cvd-ov cvd-cheats" data-ov="cheats" hidden>
        <div class="cvd-card">
          <h3>Cheats</h3>
          <label class="cvd-cheatrow">HP abadi<input class="cvd-switch" type="checkbox" data-cheat="god"></label>
          <label class="cvd-cheatrow">One-hit KO<input class="cvd-switch" type="checkbox" data-cheat="ohko"></label>
          <label class="cvd-cheatrow">Angin selalu 0<input class="cvd-switch" type="checkbox" data-cheat="noWind"></label>
          <label class="cvd-cheatrow">Lintasan penuh<input class="cvd-switch" type="checkbox" data-cheat="fullAim"></label>
          <label class="cvd-cheatrow">Ability selalu siap<input class="cvd-switch" type="checkbox" data-cheat="ready"></label>
          <label class="cvd-cheatrow" data-botmiss-row>Bot sering meleset<input class="cvd-switch" type="checkbox" data-cheat="botMiss"></label>
          <div class="cvd-cheatacts">
            <button class="cvd-btn" type="button" data-act="autoaim">Auto-aim</button>
            <button class="cvd-btn cvd-ghost" type="button" data-act="cheats-close">Tutup</button>
          </div>
          <p class="cvd-note" data-cheat-note hidden>Mode online: cheat HP/damage hanya berlaku di sisi host.</p>
        </div>
      </div>
    </div>
    <div class="cvd-bar">
      <span class="cvd-read"><b data-ang>45°</b><b data-pow>70</b></span>
      <span class="cvd-barbtns">
        <button class="cvd-btn" type="button" data-ability disabled>Ability</button>
        <button class="cvd-btn cvd-ghost" type="button" data-act="cheats">Cheats</button>
      </span>
    </div>
  </section>
  <div class="game-actions"><button class="game-action-button" type="button" data-exit>Keluar</button></div>
</div>`;

    const $ = (s) => root.querySelector(s);
    const svg = $("[data-svg]");
    const charsG = $('[data-g="chars"]');
    const aimG = $('[data-g="aim"]');
    const projG = $('[data-g="proj"]');
    const fxG = $('[data-g="fx"]');
    const parG = $('[data-g="par"]');
    const windEl = $("[data-wind]");
    const statusEl = $("[data-status]");
    const statusDot = $("[data-status-dot]");
    const angEl = $("[data-ang]");
    const powEl = $("[data-pow]");
    const abilityBtn = $("[data-ability]");
    const ovPick = $('[data-ov="pick"]');
    const ovWait = $('[data-ov="wait"]');
    const ovOver = $('[data-ov="over"]');
    const ovCheats = $('[data-ov="cheats"]');
    const overTitle = $("[data-over-title]");
    const overSub = $("[data-over-sub]");
    const repickBtn = $("[data-repick]");
    const botMissRow = $("[data-botmiss-row]");
    const cheatNote = $("[data-cheat-note]");

    const mySide = () => (state && state.sideOf ? state.sideOf[playerIndex] : null);
    const canAim = () => !!state && state.phase === "aim" && mySide() === state.turn;

    /* ================= render ================= */
    function catBody() {
        return '<path d="M-12 5q-9 7-4 12" fill="none" stroke="#f59e0b" stroke-width="3" stroke-linecap="round"/>' +
            '<circle r="15" fill="#fbbf24" stroke="#d97706" stroke-width="1.5"/>' +
            '<path d="M-10-7l-2-9 8 4zM10-7l2-9-8 4z" fill="#fbbf24" stroke="#d97706" stroke-width="1.5" stroke-linejoin="round"/>' +
            '<circle cx="-5" cy="-2" r="2" fill="#0f172a"/><circle cx="5" cy="-2" r="2" fill="#0f172a"/>' +
            '<path d="M-4 5q4 3 8 0" fill="none" stroke="#0f172a" stroke-width="1.8" stroke-linecap="round"/>';
    }
    function dogBody() {
        return '<path d="M-14 10q-3 6 2 8" fill="none" stroke="#94a3b8" stroke-width="4" stroke-linecap="round"/>' +
            '<circle r="15" fill="#cbd5e1" stroke="#64748b" stroke-width="1.5"/>' +
            '<path d="M-10-8q-7-2-7 7M10-8q7-2 7 7" fill="none" stroke="#64748b" stroke-width="4" stroke-linecap="round"/>' +
            '<circle cx="-5" cy="-2" r="2" fill="#0f172a"/><circle cx="5" cy="-2" r="2" fill="#0f172a"/>' +
            '<ellipse cx="0" cy="6" rx="4.5" ry="3.2" fill="#0f172a"/>';
    }
    function renderChars() {
        let s = "";
        for (const side of ["L", "R"]) {
            const x = CHAR_X[side], flip = side === "R" ? " scale(-1,1)" : "";
            const body = CHAR_OF[side] === "cat" ? catBody() : dogBody();
            s += '<g transform="translate(' + x + "," + BODY_Y + ")" + flip + '"><g data-char="' + side + '">' + body + "</g></g>";
            if (state && state.phase === "aim" && state.turn === side)
                s += '<circle cx="' + x + '" cy="' + (BODY_Y - 32) + '" r="3.5" fill="#6366f1"/>';
            if (state && state.charged[side])
                s += '<text x="' + x + '" y="' + (BODY_Y - 44) + '" class="cvd-charge">×2</text>';
        }
        charsG.innerHTML = s;
    }
    function renderWind() {
        const w = state ? state.wind : 0;
        if (!w) { windEl.innerHTML = '<b class="cvd-wval">0</b>'; return; }
        const d = w > 0 ? 1 : -1, len = 10 + Math.abs(w) * 2.2;
        const x1 = (23 - d * len / 2).toFixed(1), x2 = (23 + d * len / 2).toFixed(1);
        windEl.innerHTML =
            '<svg width="46" height="12" viewBox="0 0 46 12" aria-hidden="true">' +
            '<path d="M' + x1 + " 6H" + x2 + '" stroke="#0ea5e9" stroke-width="2" stroke-linecap="round"/>' +
            '<path d="M' + (23 + d * len / 2 - d * 5).toFixed(1) + " 2l" + d * 5 + " 4-" + d * 5 + ' 4" fill="none" stroke="#0ea5e9" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>' +
            '<b class="cvd-wval">' + Math.abs(w).toFixed(1) + "</b>";
    }
    function renderRead() {
        angEl.textContent = aim.angle + "°";
        powEl.textContent = aim.power;
    }
    function renderAim() {
        if (!canAim()) { aimG.innerHTML = ""; return; }
        const my = mySide(), o = originOf(my), v = throwVel(aim.angle, aim.power, dirOf(my));
        let p = { x: o.x, y: o.y, vx: v.vx, vy: v.vy }, s = "", t = 0;
        const dot = (pt, r, op) => '<circle cx="' + pt.x.toFixed(1) + '" cy="' + pt.y.toFixed(1) + '" r="' + r.toFixed(1) + '" fill="#6366f1" opacity="' + op.toFixed(2) + '"/>';
        if (cheats.fullAim) {
            for (let i = 0; i < 1500; i++) {
                p = stepP(p, DT, state.wind); t += DT;
                if (i % 8 === 0) s += dot(p, 2.4, 0.6);
                const r = terminalAt(p, t, my);
                if (r) {
                    s += '<circle cx="' + p.x.toFixed(1) + '" cy="' + p.y.toFixed(1) + '" r="7" fill="none" stroke="#6366f1" stroke-width="2"/>' +
                        '<circle cx="' + p.x.toFixed(1) + '" cy="' + p.y.toFixed(1) + '" r="2" fill="#6366f1"/>';
                    break;
                }
            }
        } else {
            for (let i = 0; i < 16; i++) { p = stepP(p, 0.055, state.wind); s += dot(p, 3 - i * 0.12, 0.85 - i * 0.04); }
        }
        aimG.innerHTML = s;
    }
    function renderHud() {
        const my = mySide();
        for (const side of ["L", "R"]) {
            const hp = state ? state.hp[side] : HP_MAX;
            const bar = root.querySelector('[data-hp="' + side + '"]');
            bar.style.width = Math.max(0, (hp / HP_MAX) * 100) + "%";
            bar.parentElement.classList.toggle("lo", hp <= 30);
            root.querySelector('[data-hpnum="' + side + '"]').textContent = hp;
            root.querySelector('[data-dot="' + side + '"]').classList.toggle("on", !!state && state.phase === "aim" && state.turn === side);
            let suffix = "";
            if (state && state.sideOf) {
                if (side === my) suffix = online ? " · " + playerName : " · kamu";
                else suffix = online ? " · lawan" : " · bot";
            }
            root.querySelector('[data-name="' + side + '"]').textContent = NAME_OF[side] + suffix;
        }
        if (!my || !state || state.phase === "pick") {
            abilityBtn.disabled = true;
            abilityBtn.textContent = "Ability";
        } else {
            const ch = CHAR_OF[my], ab = ABILITY[ch], cd = state.cd[my];
            const ready = cd <= 0 || cheats.ready;
            const usable = canAim() && ready && !(ch === "dog" && state.charged[my]);
            abilityBtn.disabled = !usable;
            abilityBtn.textContent = ab.label + (cd > 0 && !cheats.ready ? " (" + cd + ")" : "");
        }
    }
    function renderStatus() {
        let text = "Menyiapkan…", tone = "#94a3b8";
        if (!state) { text = "Menunggu host…"; }
        else if (state.phase === "pick") { text = "Pilih karakter"; }
        else if (state.phase === "fly") { text = "Bola melambung…"; tone = "#6366f1"; }
        else if (state.phase === "over") { text = NAME_OF[state.winner] + " menang"; tone = "#6366f1"; }
        else if (state.phase === "aim") {
            if (state.turn === mySide()) { text = "Giliranmu"; tone = "#22c55e"; }
            else { text = online ? "Giliran lawan" : "Bot membidik…"; tone = "#f59e0b"; }
        }
        statusEl.textContent = text;
        statusDot.style.background = tone;
    }
    function renderOverlays() {
        ovPick.hidden = !(state && state.phase === "pick" && !online);
        ovWait.hidden = !(online && !state);
        ovOver.hidden = !(state && state.phase === "over");
        if (state && state.phase === "over") {
            overTitle.textContent = NAME_OF[state.winner] + " menang";
            overSub.textContent = "Sisa HP: " + state.hp[state.winner];
            repickBtn.hidden = online;
        }
        botMissRow.hidden = online;
        cheatNote.hidden = !online;
    }
    function render() {
        if (destroyed) return;
        renderHud(); renderChars(); renderWind(); renderStatus(); renderOverlays(); renderRead();
        syncFlight(); maybeFx(); renderAim(); scheduleBot();
    }

    /* ================= efek ================= */
    function popText(x, y, text) {
        const el = document.createElementNS("http://www.w3.org/2000/svg", "text");
        el.setAttribute("x", x); el.setAttribute("y", y);
        el.setAttribute("class", "cvd-pop");
        el.textContent = text;
        fxG.appendChild(el);
        later(() => { if (el.parentNode) el.parentNode.removeChild(el); }, 950);
    }
    function shake(side) {
        const g = charsG.querySelector('[data-char="' + side + '"]');
        if (!g) return;
        g.classList.add("cvd-shake");
        later(() => g.classList.remove("cvd-shake"), 450);
    }
    function maybeFx() {
        const ev = state && state.lastEvent;
        if (!ev || ev.id === fxSeen) return;
        fxSeen = ev.id;
        if (ev.type === "hit") { popText(CHAR_X[ev.side], BODY_Y - 36, ev.dmg > 0 ? "-" + ev.dmg : "0"); shake(ev.side); }
        else if (ev.type === "heal") popText(CHAR_X[ev.side], BODY_Y - 36, "+" + ev.amount);
        else if (ev.type === "charge") popText(CHAR_X[ev.side], BODY_Y - 36, "×2");
        else if (ev.type === "wall") popText(WALL_X, WALL_TOP - 10, "blok");
    }

    /* ================= animasi lokal (deterministik, host & guest sama) ================= */
    function syncFlight() {
        if (state && state.phase === "fly" && state.shot) {
            if (!flight || flight.id !== state.shot.id) {
                const sh = state.shot, o = originOf(sh.from), v = throwVel(sh.angle, sh.power, dirOf(sh.from));
                flight = { id: sh.id, x: o.x, y: o.y, vx: v.vx, vy: v.vy, wind: sh.wind, from: sh.from, t: 0, done: false };
                acc = 0;
            }
        } else { flight = null; projG.innerHTML = ""; }
    }
    function frame(t) {
        raf = requestAnimationFrame(frame);
        if (!lastT) { lastT = t; return; }
        const dt = Math.min(0.05, (t - lastT) / 1000);
        lastT = t;
        if (flight && !flight.done) {
            acc += dt;
            while (acc >= DT && !flight.done) {
                acc -= DT;
                const next = stepP(flight, DT, flight.wind);
                flight.x = next.x; flight.y = next.y; flight.vx = next.vx; flight.vy = next.vy;
                flight.t += DT;
                if (terminalAt(flight, flight.t, flight.from)) flight.done = true;
            }
            const spin = (Math.atan2(flight.vy, flight.vx) * 180) / Math.PI;
            projG.innerHTML =
                '<g transform="translate(' + flight.x.toFixed(1) + "," + flight.y.toFixed(1) + ") rotate(" + spin.toFixed(0) + ')">' +
                '<circle r="6" fill="#fff" stroke="#64748b" stroke-width="1.5"/>' +
                '<path d="M-4-2q4 4 8 0" fill="none" stroke="#94a3b8" stroke-width="1.2"/></g>';
        }
        /* kamera side-scroll: ikuti bola saat terbang, kembali ke tengah saat membidik */
        const target = flight ? clamp(flight.x - VIEW_W / 2, 0, CAM_MAX) : CAM_MAX / 2;
        cam += (target - cam) * 0.08;
        svg.setAttribute("viewBox", cam.toFixed(1) + " 0 " + VIEW_W + " " + H);
        parG.setAttribute("transform", "translate(" + (cam * 0.35).toFixed(1) + ",0)");
    }

    /* ================= mesin giliran (host-authoritative) ================= */
    function freshPick() {
        return {
            seq: (state ? state.seq : 0) + 1, shotN: 0, evN: 0,
            phase: "pick", sideOf: null,
            hp: { L: HP_MAX, R: HP_MAX }, cd: { L: 0, R: 0 }, charged: { L: false, R: false },
            turn: "L", wind: 0, shot: null, lastEvent: null, winner: null,
        };
    }
    function resetBattle(randomizeSides) {
        if (botTimer) { clearTimeout(botTimer); botTimer = null; }
        if (resolveTimer) { clearTimeout(resolveTimer); resolveTimer = null; }
        const keep = !randomizeSides && state && state.sideOf;
        // posisi pemain diacak saat mulai / rematch online; giliran pertama selalu acak
        const sideOf = keep ? state.sideOf.slice() : (Math.random() < 0.5 ? ["L", "R"] : ["R", "L"]);
        state = { ...freshPick(), phase: "aim", sideOf, turn: Math.random() < 0.5 ? "L" : "R", wind: newWind() };
        flight = null; fxSeen = 0; aim = { angle: 45, power: 70 };
        publish();
    }
    function publish() {
        state.seq++;
        render();
        if (online && room.isHost) room.publishState(state).catch(console.warn);
    }
    function startFlight(side, angle, power) {
        const sim = simulateShot(side, angle, power, state.wind);
        state.shot = { id: ++state.shotN, from: side, angle, power, wind: state.wind };
        state.phase = "fly";
        publish();
        resolveTimer = later(() => { resolveTimer = null; resolveFlight(sim); }, sim.t * 1000 + 150);
    }
    function resolveFlight(sim) {
        if (!state || state.phase !== "fly" || !state.shot) return;
        const sh = state.shot;
        state.shot = null;
        const wasCharged = state.charged[sh.from];
        state.charged[sh.from] = false;
        let ended = false;
        if (sim.outcome === "hit") {
            const target = sim.hitSide;
            let dmg = Math.min(32, 12 + Math.floor(sim.speed / 40));
            if (wasCharged) dmg *= 2;
            if (cheats.ohko && sh.from === mySide()) dmg = 999;
            if (cheats.god && target === mySide()) dmg = 0;
            state.hp[target] = Math.max(0, state.hp[target] - dmg);
            state.lastEvent = { id: ++state.evN, type: "hit", side: target, dmg };
            if (state.hp[target] <= 0) { state.phase = "over"; state.winner = other(target); ended = true; }
        } else {
            state.lastEvent = { id: ++state.evN, type: sim.outcome, x: Math.round(sim.x), y: Math.round(sim.y) };
        }
        if (!ended) {
            state.turn = other(sh.from);
            state.cd[state.turn] = Math.max(0, state.cd[state.turn] - 1);
            state.wind = newWind();
            state.phase = "aim";
        }
        publish();
    }
    function applyAction(action, actor) {
        if (!state || destroyed || !action) return;
        if (action.type === "pick" && !online && actor === 0) {
            const side = action.char === "dog" ? "R" : "L";
            state = freshPick();
            state.sideOf = [side, other(side)];
            resetBattle(false);
            return;
        }
        if (action.type === "rematch") { if (state.phase === "over") resetBattle(online); return; }
        if (action.type === "repick" && !online) { state = freshPick(); publish(); return; }
        const side = state.sideOf ? state.sideOf[actor] : null;
        if (!side) return;
        if (action.type === "ability") {
            if (state.phase !== "aim" || state.turn !== side) return;
            const ch = CHAR_OF[side], ab = ABILITY[ch];
            const ready = state.cd[side] <= 0 || (cheats.ready && side === mySide());
            if (!ready) return;
            if (ch === "cat") {
                if (state.hp[side] >= HP_MAX) return;
                const amt = Math.min(22, HP_MAX - state.hp[side]);
                state.hp[side] += amt;
                state.lastEvent = { id: ++state.evN, type: "heal", side, amount: amt };
            } else {
                if (state.charged[side]) return;
                state.charged[side] = true;
                state.lastEvent = { id: ++state.evN, type: "charge", side };
            }
            state.cd[side] = ab.cd;
            publish();
            return;
        }
        if (action.type === "throw") {
            if (state.phase !== "aim" || state.turn !== side) return;
            startFlight(side, clamp(Math.round(action.angle), 10, 85), clamp(Math.round(action.power), 20, 100));
        }
    }
    function submitAction(action) {
        if (online && !room.isHost) { room.sendAction(action).catch(console.warn); return; }
        applyAction(action, playerIndex);
    }

    /* ================= bot (mode AI saja) ================= */
    function scheduleBot() {
        if (online || !state || state.phase !== "aim" || !state.sideOf) return;
        if (state.turn !== state.sideOf[1] || botTimer) return;
        botTimer = later(() => { botTimer = null; botMove(); }, 900 + Math.random() * 600);
    }
    function botMove() {
        if (!state || state.phase !== "aim" || state.turn !== state.sideOf[1]) return;
        const side = state.sideOf[1], ch = CHAR_OF[side];
        if (state.cd[side] <= 0 && ((ch === "cat" && state.hp[side] <= 60) || (ch === "dog" && !state.charged[side]))) {
            applyAction({ type: "ability" }, 1);
            botTimer = later(() => { botTimer = null; botMove(); }, 650);
            return;
        }
        const plan = planShot(side, state.wind, 2, cheats.botMiss ? 30 : 5);
        applyAction({ type: "throw", angle: plan.angle, power: plan.power }, 1);
    }

    /* ================= input: klik / sentuh (seret untuk bidik, lepas untuk lempar) ================= */
    function handleClick(event) {
        const t = event.target;
        if (t.closest("[data-exit]")) { onExit(); return; }
        const pick = t.closest("[data-pick]");
        if (pick) { submitAction({ type: "pick", char: pick.dataset.pick }); return; }
        const act = t.closest("[data-act]");
        if (act) {
            const a = act.dataset.act;
            if (a === "rematch") submitAction({ type: "rematch" });
            else if (a === "repick") submitAction({ type: "repick" });
            else if (a === "cheats") ovCheats.hidden = !ovCheats.hidden;
            else if (a === "cheats-close") ovCheats.hidden = true;
            else if (a === "autoaim" && canAim()) {
                const p = planShot(mySide(), state.wind, 0, 0);
                aim.angle = p.angle; aim.power = p.power;
                renderRead(); renderAim();
            }
            return;
        }
        if (t.closest("[data-ability]") && canAim()) submitAction({ type: "ability" });
    }
    function handleChange(event) {
        const c = event.target.closest("[data-cheat]");
        if (!c) return;
        cheats[c.dataset.cheat] = c.checked;
        render();
    }
    function svgPoint(e) {
        const r = svg.getBoundingClientRect();
        return { x: cam + ((e.clientX - r.left) / r.width) * VIEW_W, y: ((e.clientY - r.top) / r.height) * H };
    }
    function aimFromEvent(e) {
        const my = mySide();
        if (!my) return;
        const o = originOf(my), d = dirOf(my), pt = svgPoint(e);
        let dx = (pt.x - o.x) * d, dy = o.y - pt.y;
        if (dx < 4) dx = 4;
        if (dy < 0) dy = 0;
        aim.angle = clamp(Math.round((Math.atan2(dy, dx) * 180) / Math.PI), 10, 85);
        aim.power = clamp(Math.round(Math.hypot(dx, dy) / 3.2), 20, 100);
        renderRead(); renderAim();
    }
    function onPointerDown(e) {
        if (!canAim()) return;
        drag = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: false };
        svg.setPointerCapture(e.pointerId);
        aimFromEvent(e);
        e.preventDefault();
    }
    function onPointerMove(e) {
        if (!drag || e.pointerId !== drag.id) return;
        if (Math.hypot(e.clientX - drag.x, e.clientY - drag.y) > 10) drag.moved = true;
        aimFromEvent(e);
    }
    function onPointerUp(e) {
        if (!drag || e.pointerId !== drag.id) return;
        const fire = drag.moved && canAim();
        drag = null;
        if (fire) submitAction({ type: "throw", angle: aim.angle, power: aim.power });
    }
    function onWheel(e) {
        if (!canAim()) return;
        e.preventDefault();
        aim.power = clamp(aim.power + (e.deltaY < 0 ? 2 : -2), 20, 100);
        renderRead(); renderAim();
    }
    /* keyboard desktop: panah = bidik (Shift = langkah 5), Space/Enter = lempar, A = ability, C = cheats */
    function onKey(e) {
        if (destroyed) return;
        if (e.code === "Escape") { ovCheats.hidden = true; return; }
        if (e.code === "KeyC") { ovCheats.hidden = !ovCheats.hidden; return; }
        if (!canAim()) return;
        const step = e.shiftKey ? 5 : 1;
        switch (e.code) {
            case "ArrowLeft": e.preventDefault(); aim.angle = clamp(aim.angle - step, 10, 85); break;
            case "ArrowRight": e.preventDefault(); aim.angle = clamp(aim.angle + step, 10, 85); break;
            case "ArrowUp": e.preventDefault(); aim.power = clamp(aim.power + step, 20, 100); break;
            case "ArrowDown": e.preventDefault(); aim.power = clamp(aim.power - step, 20, 100); break;
            case "Space": case "Enter": e.preventDefault(); submitAction({ type: "throw", angle: aim.angle, power: aim.power }); return;
            case "KeyA": e.preventDefault(); submitAction({ type: "ability" }); return;
            default: return;
        }
        renderRead(); renderAim();
    }

    root.addEventListener("click", handleClick);
    root.addEventListener("change", handleChange);
    svg.addEventListener("pointerdown", onPointerDown);
    svg.addEventListener("pointermove", onPointerMove);
    svg.addEventListener("pointerup", onPointerUp);
    svg.addEventListener("pointercancel", onPointerUp);
    svg.addEventListener("wheel", onWheel, { passive: false });
    document.addEventListener("keydown", onKey);

    /* ================= inisialisasi mode ================= */
    if (online) {
        const u1 = room.onRoom((nextRoom) => { roomData = nextRoom; });
        if (typeof u1 === "function") unsubs.push(u1);
        if (room.isHost) {
            resetBattle(true); // posisi & giliran pertama diacak
            const u2 = room.onAction((action) => applyAction(action, 1));
            if (typeof u2 === "function") unsubs.push(u2);
        } else {
            render(); // tampilkan "Menunggu host…" sampai state pertama tiba
            const u3 = room.onState((nextState) => { state = nextState; render(); });
            if (typeof u3 === "function") unsubs.push(u3);
        }
    } else {
        state = freshPick();
        render();
    }
    raf = requestAnimationFrame(frame);

    return {
        destroy() {
            destroyed = true;
            if (raf) cancelAnimationFrame(raf);
            timers.forEach(clearTimeout);
            timers.clear();
            document.removeEventListener("keydown", onKey);
            root.removeEventListener("click", handleClick);
            root.removeEventListener("change", handleChange);
            svg.removeEventListener("pointerdown", onPointerDown);
            svg.removeEventListener("pointermove", onPointerMove);
            svg.removeEventListener("pointerup", onPointerUp);
            svg.removeEventListener("pointercancel", onPointerUp);
            svg.removeEventListener("wheel", onWheel);
            unsubs.forEach((fn) => { try { fn(); } catch (_) { } });
        },
    };
}