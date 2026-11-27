import { iconSVG } from "../JS/icons.js";

/*
 * Rally Racer — game 2D top-down (id harus sama dengan nama file: rally-racer)
 * Setelah menaruh file ini di folder games, jalankan:
 *   node tools/build-games-manifest.mjs
 *
 * 5 MVP dalam satu file:
 *  1. Time Trial + Ghost   2. Balap vs Bot (waypoint)   3. Split-screen 2 pemain
 *  4. Rally Stage (surface, damage, pace notes)          5. Daily Challenge + leaderboard
 * Mode room (online) = duel 2 pemain real-time ringan (tiap klien mensimulasikan mobilnya sendiri).
 */

export const META = {
    id: "rally-racer",
    name: "Rally Racer",
    category: "arcade",
    catLabel: "Arcade",
    desc: "Balap rally 2D: time trial dengan ghost, lawan bot, split-screen 2 pemain, stage rally, dan daily challenge.",
    art: '<svg viewBox="0 0 48 48" fill="none"><rect x="15" y="5" width="18" height="38" rx="8" fill="#fff"/><rect x="18" y="15" width="12" height="9" rx="2" fill="#ef4444"/><rect x="11" y="9" width="5" height="9" rx="2" fill="#fff" opacity=".75"/><rect x="32" y="9" width="5" height="9" rx="2" fill="#fff" opacity=".75"/><rect x="11" y="30" width="5" height="9" rx="2" fill="#fff" opacity=".75"/><rect x="32" y="30" width="5" height="9" rx="2" fill="#fff" opacity=".75"/></svg>',
    bg: ["#fca5a5", "#ef4444"],
};

/* ---------------------------------------------------------------- util */
const TAU = Math.PI * 2;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const wrapA = (a) => { while (a > Math.PI) a -= TAU; while (a < -Math.PI) a += TAU; return a; };
const randSeed = () => Math.random().toString(36).slice(2, 8).toUpperCase();
function hashStr(s) { let h = 2166136261; for (const ch of String(s)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const fmt = (t) => { if (t == null || !isFinite(t)) return "--:--.--"; const m = Math.floor(t / 60), s = t - m * 60; return m + ":" + (s < 10 ? "0" : "") + s.toFixed(2); };
const shuffle = (arr) => { for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1));[arr[i], arr[j]] = [arr[j], arr[i]]; } return arr; };
const store = {
    get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage penuh/diblokir */ } },
};

const SURF = {
    asphalt: { n: "Aspal", c: "#5d636b", g: 1, v: 1 },
    gravel: { n: "Kerikil", c: "#a8a49b", g: 0.62, v: 0.93 },
    dirt: { n: "Tanah", c: "#a8805a", g: 0.72, v: 0.95 },
    snow: { n: "Salju", c: "#e8eef3", g: 0.42, v: 0.88 },
    grass: { n: "Rumput", c: "", g: 0.5, v: 0.55 },
};
const MODES = [
    { id: "trial", t: "Time trial + ghost", d: "1 lap melawan waktu terbaik dan ghost dirimu." },
    { id: "race", t: "Balap vs bot", d: "3 lap, 3–5 bot, posisi start diundi." },
    { id: "local", t: "2 pemain, split-screen", d: "WASD vs panah di satu perangkat." },
    { id: "rally", t: "Rally stage", d: "Permukaan campur, damage, pace notes." },
    { id: "daily", t: "Daily challenge", d: "Track harian dan papan skor." },
];
const MODE_SHORT = { trial: "Trial", race: "Race", local: "2P local", rally: "Rally", daily: "Daily" };

/* ---------------------------------------------------------------- track */
const S = 24, TW = 130, MINR = 300;

function catmull(ctrl, steps) {
    const K = ctrl.length, out = [];
    for (let i = 0; i < K; i++) {
        const p0 = ctrl[(i + K - 1) % K], p1 = ctrl[i], p2 = ctrl[(i + 1) % K], p3 = ctrl[(i + 2) % K];
        for (let s = 0; s < steps; s++) {
            const t = s / steps, t2 = t * t, t3 = t2 * t;
            out.push([0, 1].map((d) => 0.5 * (2 * p1[d] + (-p0[d] + p2[d]) * t + (2 * p0[d] - 5 * p1[d] + 4 * p2[d] - p3[d]) * t2 + (-p0[d] + 3 * p1[d] - 3 * p2[d] + p3[d]) * t3)));
        }
    }
    return out;
}
function resample(d, step) {
    const n = d.length, cum = [0];
    for (let i = 1; i <= n; i++) { const a = d[i - 1], b = d[i % n]; cum.push(cum[i - 1] + Math.hypot(b[0] - a[0], b[1] - a[1])); }
    const L = cum[n], N = Math.round(L / step), out = [];
    let j = 0;
    for (let k = 0; k < N; k++) {
        const s = (k * L) / N;
        while (cum[j + 1] < s) j++;
        const a = d[j], b = d[(j + 1) % n], t = (s - cum[j]) / (cum[j + 1] - cum[j] || 1);
        out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
    }
    return out;
}
function radii(P) {
    const N = P.length, R = new Array(N);
    for (let i = 0; i < N; i++) {
        const a = P[(i + N - 3) % N], b = P[i], c = P[(i + 3) % N];
        const ab = Math.hypot(b[0] - a[0], b[1] - a[1]), bc = Math.hypot(c[0] - b[0], c[1] - b[1]), ca = Math.hypot(a[0] - c[0], a[1] - c[1]);
        const cr = Math.abs((b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]));
        R[i] = cr < 1e-6 ? 1e6 : (ab * bc * ca) / (2 * cr);
    }
    return R;
}
function isStarShaped(P) {
    let sum = 0, prev = Math.atan2(P[P.length - 1][1], P[P.length - 1][0]);
    for (const p of P) { const a = Math.atan2(p[1], p[0]), d = wrapA(a - prev); if (Math.abs(sum) > 0 && d * sum < 0) return false; sum += d; prev = a; }
    return Math.abs(Math.abs(sum) - TAU) < 0.5;
}

function buildTrack(seed, surfMode) {
    const rnd = rng(hashStr(seed));
    let pts = null, R = null;
    for (let attempt = 0; attempt < 16 && !pts; attempt++) {
        const K = 9 + Math.floor(rnd() * 5), vari = Math.max(0.06, 0.5 - attempt * 0.035);
        let rs = [], as = [];
        for (let k = 0; k < K; k++) { as.push((TAU * k) / K + (rnd() - 0.5) * (TAU / K) * 0.5); rs.push(1 - vari * rnd()); }
        for (let p = 0; p < 2 + Math.floor(attempt / 2); p++) rs = rs.map((r, i) => (rs[(i + K - 1) % K] + 2 * r + rs[(i + 1) % K]) / 4);
        const ctrl = as.map((a, i) => [Math.cos(a) * rs[i] * 1900, Math.sin(a) * rs[i] * 1500]);
        const res = resample(catmull(ctrl, 20), S), rr = radii(res);
        if (Math.min(...rr) >= MINR && isStarShaped(res)) { pts = res; R = rr; }
    }
    if (!pts) { // cadangan: elips mulus, pasti bisa dilewati
        const d = []; for (let i = 0; i < 160; i++) d.push([Math.cos((TAU * i) / 160) * 1700, Math.sin((TAU * i) / 160) * 1200]);
        pts = resample(d, S); R = radii(pts);
    }
    const N = pts.length, ang = pts.map((p, i) => { const q = pts[(i + 1) % N]; return Math.atan2(q[1] - p[1], q[0] - p[0]); });
    const surf = new Array(N).fill("asphalt"), ids = ["asphalt", "gravel", "dirt", "snow"];
    if (surfMode === "mixed") {
        let i = 0, last = "";
        while (i < N) { const len = 30 + Math.floor(rnd() * 50); let s; do { s = ids[Math.floor(rnd() * 4)]; } while (s === last); for (let k = 0; k < len && i < N; k++, i++) surf[i] = s; last = s; }
        for (let i = 0; i < 10; i++) { surf[i] = "asphalt"; surf[N - 1 - i] = "asphalt"; }
    } else if (surfMode === "single") surf.fill(ids[Math.floor(rnd() * 4)]);
    const K = 8, cp = []; for (let k = 1; k < K; k++) cp.push(Math.round((k * N) / K));
    // pace notes
    const kc = ang.map((a, i) => wrapA(ang[(i + 1) % N] - a) / S);
    const ks = kc.map((_, i) => { let s = 0; for (let d = -2; d <= 2; d++) s += kc[(i + d + N) % N]; return s / 5; });
    const notes = []; let i = 0;
    while (i < N) {
        if (Math.abs(ks[i]) > 1 / 1000) {
            const sign = Math.sign(ks[i]); let j = i, minR = 1e9;
            while (j < N && Math.sign(ks[j]) === sign && Math.abs(ks[j]) > 1 / 1000) { minR = Math.min(minR, 1 / Math.abs(ks[j])); j++; }
            if (j - i >= 3) {
                const sev = minR < 340 ? 1 : minR < 420 ? 2 : minR < 520 ? 3 : minR < 680 ? 4 : minR < 900 ? 5 : 6, len = j - i;
                notes.push({ i, txt: `${sign > 0 ? "▶ Kanan" : "◀ Kiri"} ${sev}${len < 8 ? " pendek" : len > 18 ? " panjang" : ""}${sev <= 2 ? " hati-hati" : ""}` });
            }
            i = j;
        } else i++;
    }
    let minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;
    for (const p of pts) { minX = Math.min(minX, p[0]); maxX = Math.max(maxX, p[0]); minY = Math.min(minY, p[1]); maxY = Math.max(maxY, p[1]); }
    const T = { seed, pts, N, ang, R, surf, cp, notes, par: null, bg: surf[Math.floor(N / 2)] === "snow" && surfMode === "single" ? "#f1f5f8" : "#e4ebdd", run: surf[Math.floor(N / 2)] === "snow" && surfMode === "single" ? "#e3eaf0" : "#d6e2cd", bounds: [minX, minY, maxX, maxY] };
    return T;
}

/* Generator "bisa diselesaikan": track divalidasi dengan menjalankan bot satu lap tanpa tampilan. */
function makeSolvable(seed, surfMode) {
    let T = null;
    for (let n = 0; n < 8; n++) {
        T = buildTrack(n ? `${seed}~${n}` : seed, surfMode);
        const par = validate(T);
        if (par) { T.par = par; return T; }
    }
    T.par = validate(T) || 60;
    return T;
}
function validate(T) {
    const c = makeCar(T, { name: "val", color: "", slot: 0, skill: 0.95 });
    const dt = 1 / 60;
    for (let t = 0; t < 160; t += dt) {
        stepCar(T, c, aiInput(T, c, [c], t, 1), dt, {});
        progress(T, c, t, 1);
        if (c.finished) return c.finishTime;
    }
    return null;
}

/* ---------------------------------------------------------------- car sim */
function pointAt(T, u) {
    const N = T.N, w = ((u % N) + N) % N, i = Math.floor(w), f = w - i, a = T.pts[i], b = T.pts[(i + 1) % N];
    return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
}
function makeCar(T, o) {
    const c = { name: o.name, color: o.color, human: o.human ?? null, x: 0, y: 0, a: 0, vx: 0, vy: 0, vf: 0, vl: 0, idx: 0, lastIdx: 0, dist: 0, prog: 0, maxProg: 0, lap: 0, nextCp: 0, lapStart: 0, lapTimes: [], finished: false, finishTime: null, nitro: 100, nitroOn: false, dmg: 0, bias: Math.random() < 0.5 ? -1 : 1, skill: o.skill || 1, lane: o.lane || 0, phase: Math.random() * 6, sid: "asphalt", skid: false, slot: o.slot || 0, wrong: false, remote: false, boost: 0, pos: 1, flash: null };
    placeGrid(T, c, c.slot);
    return c;
}
function placeGrid(T, c, slot) {
    const dist = 40 + Math.floor(slot / 2) * 48, lat = (slot % 2 ? 1 : -1) * TW * 0.2;
    const uu = T.N - dist / S, p = pointAt(T, uu), a = T.ang[Math.floor(uu) % T.N];
    c.x = p[0] - Math.sin(a) * lat; c.y = p[1] + Math.cos(a) * lat; c.a = a; c.vx = c.vy = 0;
    project(T, c, true); c.lastIdx = c.idx; c.prog = -dist / S; c.maxProg = c.prog;
}
function project(T, c, fresh) {
    const N = T.N, P = T.pts;
    let bi = 0, bd = 1e18, bt = 0;
    const base = Math.floor(c.idx), from = fresh ? 0 : -6, to = fresh ? N - 1 : 18;
    for (let k = from; k <= to; k++) {
        const j = (((fresh ? k : base + k) % N) + N) % N, a = P[j], b = P[(j + 1) % N];
        const ex = b[0] - a[0], ey = b[1] - a[1];
        const t = clamp(((c.x - a[0]) * ex + (c.y - a[1]) * ey) / (ex * ex + ey * ey), 0, 1);
        const qx = a[0] + ex * t, qy = a[1] + ey * t, d2 = (c.x - qx) ** 2 + (c.y - qy) ** 2;
        if (d2 < bd) { bd = d2; bi = j; bt = t; }
    }
    const a = P[bi], b = P[(bi + 1) % N];
    c.idx = bi + bt; c.dist = Math.sqrt(bd); c.qx = a[0] + (b[0] - a[0]) * bt; c.qy = a[1] + (b[1] - a[1]) * bt;
}
function stepCar(T, c, inp, dt, o) {
    const ch = o.cheat || {};
    const vf0 = c.vx * Math.cos(c.a) + c.vy * Math.sin(c.a);
    const off = c.dist > TW / 2, sid = T.surf[Math.floor(c.idx) % T.N], sf = off ? SURF.grass : SURF[sid];
    c.sid = off ? "grass" : sid;
    let g = sf.g; if (ch.grip) g = Math.max(g, 1);
    const dmgF = ch.nodmg ? 1 : 1 - (c.dmg / 100) * 0.45, bo = 1 + c.boost;
    c.nitroOn = !!inp.nitro && (c.nitro > 0 || ch.nitro) && vf0 > 30;
    const maxV = 430 * sf.v * dmgF * bo * (c.nitroOn ? 1.28 : 1) * (ch.speed ? 1.3 : 1);
    let steer = inp.steer;
    if (o.dmg && !ch.nodmg && c.dmg > 45) steer += (c.bias * (c.dmg - 45)) / 55 * 0.25;
    const sp = Math.abs(vf0), sgn = vf0 >= 0 ? 1 : -1;
    const sr = 2.7 * clamp(sp / 90, 0, 1) * (1 - 0.4 * clamp(sp / 430, 0, 1)) * (inp.hand ? 1.4 : 1) * (0.55 + 0.45 * g);
    c.a += clamp(steer, -1, 1) * sr * sgn * dt;
    const fx = Math.cos(c.a), fy = Math.sin(c.a), rx = -fy, ry = fx;
    let vf = c.vx * fx + c.vy * fy, vl = c.vx * rx + c.vy * ry;
    const acc = 360 * (c.nitroOn ? 1.8 : 1) * dmgF * bo * (ch.speed ? 1.3 : 1) * (0.6 + 0.4 * g);
    if (inp.gas && vf < maxV) vf += acc * dt * clamp(1 - vf / maxV + 0.08, 0, 1);
    if (inp.brake) { if (vf > 8) vf -= 720 * dt * (0.5 + 0.5 * g); else vf = Math.max(vf - 230 * dt, -120); }
    if (!inp.gas && !inp.brake) vf -= vf * 0.5 * dt;
    if (vf > maxV) vf -= (vf - maxV) * 2.2 * dt;
    if (off) vf -= vf * 1.1 * dt;
    if (inp.hand) vf -= vf * 0.6 * dt;
    vl *= Math.exp(-9 * g * (inp.hand ? 0.16 : 1) * dt);
    c.vx = fx * vf + rx * vl; c.vy = fy * vf + ry * vl; c.vf = vf; c.vl = vl;
    if (c.nitroOn && !ch.nitro) c.nitro = Math.max(0, c.nitro - 30 * dt); else if (!inp.nitro) c.nitro = Math.min(100, c.nitro + 7 * dt);
    c.skid = Math.abs(vl) > 70 && !off;
    c.x += c.vx * dt; c.y += c.vy * dt;
    project(T, c, false);
    const lim = TW / 2 + 50;
    if (c.dist > lim) { // pagar pembatas
        const nx = (c.x - c.qx) / c.dist, ny = (c.y - c.qy) / c.dist;
        c.x = c.qx + nx * lim; c.y = c.qy + ny * lim; c.dist = lim;
        const vn = c.vx * nx + c.vy * ny;
        if (vn > 0) { c.vx -= vn * 1.6 * nx; c.vy -= vn * 1.6 * ny; if (o.dmg && !ch.nodmg && vn > 110) c.dmg = Math.min(100, c.dmg + (vn - 100) * 0.06); }
    }
}
function aiInput(T, c, cars, t, slowF) {
    const N = T.N, P = T.pts, sp = Math.hypot(c.vx, c.vy), i0 = Math.floor(c.idx);
    const ti = (i0 + 4 + Math.floor(sp / 55)) % N, a = T.ang[ti];
    const lane = (c.lane + Math.sin(t * 0.4 + c.phase) * 0.12) * TW * 0.5;
    const tx = P[ti][0] - Math.sin(a) * lane, ty = P[ti][1] + Math.cos(a) * lane;
    let steer = clamp(wrapA(Math.atan2(ty - c.y, tx - c.x) - c.a) * 2.4, -1, 1), brake = false;
    const fx = Math.cos(c.a), fy = Math.sin(c.a);
    for (const o of cars) {
        if (o === c) continue;
        const dx = o.x - c.x, dy = o.y - c.y, ah = dx * fx + dy * fy, sd = -dx * fy + dy * fx;
        if (ah > 0 && ah < 95 && Math.abs(sd) < 34) { steer += (sd > 0 ? -1 : 1) * 0.7; if (ah < 55 && c.vf > o.vf + 30) brake = true; }
    }
    const sf = SURF[T.surf[i0 % N]], sk = c.skill * slowF;
    let vmax = 430 * sk * sf.v;
    for (let k = 1; k <= 14; k++) { const vc = Math.sqrt(430 * T.R[(i0 + k) % N] * sf.g) * (0.9 + 0.1 * sk); vmax = Math.min(vmax, Math.sqrt(vc * vc + 2 * 420 * k * S)); }
    return { steer, gas: c.vf < vmax, brake: brake || c.vf > vmax + 30, nitro: false, hand: false };
}
function progress(T, c, t, laps) {
    const N = T.N;
    let d = c.idx - c.lastIdx; if (d > N / 2) d -= N; else if (d < -N / 2) d += N;
    if (Math.abs(d) < 40) c.prog += d;
    c.lastIdx = c.idx; c.wrong = c.prog < c.maxProg - 14; if (c.prog > c.maxProg) c.maxProg = c.prog;
    if (c.finished) return null;
    if (c.nextCp < T.cp.length) {
        if (c.prog >= c.lap * N + T.cp[c.nextCp] && c.dist < TW * 1.3) { c.nextCp++; return "cp"; }
    } else if (c.prog >= (c.lap + 1) * N) {
        c.lapTimes.push(t - c.lapStart); c.lapStart = t; c.lap++; c.nextCp = 0;
        if (c.lap >= laps) { c.finished = true; c.finishTime = t; return "finish"; }
        return "lap";
    }
    return null;
}
const rankScore = (c) => (c.finished ? 1e9 - c.finishTime : c.prog);
const rankCars = (cars) => [...cars].sort((a, b) => rankScore(b) - rankScore(a));

/* ---------------------------------------------------------------- game */
const CSS = `
.rr *{box-sizing:border-box}
.rr [hidden]{display:none!important}
.rr-board{position:relative;width:100%;padding:0;border:0;aspect-ratio:16/9;max-height:74vh;min-height:260px;background:#e4ebdd;border-radius:10px;overflow:hidden;touch-action:none;user-select:none;-webkit-user-select:none}
.rr-board canvas{position:absolute;inset:0;width:100%;height:100%;display:block}
.rr-hud{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:10px;font:600 11px/1 ui-monospace,SFMono-Regular,Menlo,monospace}
.rr-hud .rr-btn{min-height:32px;padding:6px 10px;font-size:10px}
.rr-spacer{flex:1 1 auto}
.rr-chip{display:inline-flex;align-items:center;gap:6px;padding:5px 9px;border:1px solid rgba(128,128,128,.28);border-radius:999px;background:rgba(255,255,255,.65);color:#6b7280;white-space:nowrap}
.rr-chip b{color:#111827;font-weight:700;font-variant-numeric:tabular-nums}
.rr-bar{display:block;width:52px;height:5px;border-radius:3px;background:#d1d5db;overflow:hidden}
.rr-bar i{display:block;height:100%;width:100%;background:#f97316;transition:width .12s linear}
.rr-icon-btn{display:inline-flex;align-items:center;gap:6px}
.rr-icon-btn svg{flex:none;display:block}
.rr-btn{font:inherit;padding:7px 12px;border:1px solid rgba(0,0,0,.18);border-radius:8px;background:#fff;color:#111827;cursor:pointer}
.rr-btn:hover:not(:disabled){border-color:#ef4444}
.rr-btn:disabled{opacity:.45;cursor:not-allowed}
.rr-btn.on{border-color:#ef4444;color:#b91c1c;background:#fff1f2}
.rr-btn.p{background:#ef4444;border-color:#ef4444;color:#fff}
.rr-btn.p:hover:not(:disabled){opacity:.9;color:#fff}
.rr-ov{position:absolute;inset:0;z-index:5;display:grid;place-items:center;padding:12px;background:rgba(255,255,255,.72);backdrop-filter:blur(3px);overflow:auto}
.rr-card{display:flex;flex-direction:column;overflow:hidden;margin:auto;width:100%;max-width:min(620px,100%);max-height:100%;background:#fff;color:#111827;border-radius:12px;padding:16px 18px;box-shadow:0 6px 28px rgba(0,0,0,.16);font-size:13px;line-height:1.55}
.rr-head{flex:none;display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:8px}
.rr-head h3{margin:0;font-size:16px;font-weight:600}
.rr-head .rr-btn{min-height:34px;padding:5px 10px;font-size:11px}
.rr-menu,.rr-cheats,.rr-help,.rr-stats{flex:1 1 auto;min-height:0;overflow:auto}
.rr-menu{display:grid;align-content:start;gap:16px;padding-right:2px}
.rr-opts{display:flex;flex-wrap:wrap;gap:8px 16px;align-items:center;font-size:13px}
.rr-opts label{display:flex;gap:6px;align-items:center}
.rr-opts input[type=text],.rr-opts select{font:inherit;padding:5px 8px;border:1px solid rgba(128,128,128,.35);border-radius:8px;background:transparent;color:inherit;width:auto}
.rr-opts input[type=text]{width:110px}
.rr-modes{display:grid;gap:8px;grid-template-columns:repeat(auto-fit,minmax(230px,1fr))}
.rr-mode{text-align:left;font:inherit;padding:12px 14px;border:1px solid rgba(128,128,128,.3);border-radius:10px;background:transparent;color:inherit;cursor:pointer;display:grid;gap:3px}
.rr-mode:hover,.rr-mode:focus-visible{border-color:#ef4444;outline:none}
.rr-mode b{font-size:14px;font-weight:600}.rr-mode span{font-size:12px;opacity:.65}
.rr-cheat-grid{display:grid;gap:8px;grid-template-columns:repeat(auto-fill,minmax(180px,1fr))}
.rr-sep{margin:12px 0 6px;font:700 10px/1 ui-monospace,monospace;letter-spacing:.1em;color:#6b7280;text-transform:uppercase}
.rr-foot{flex:none;display:flex;gap:8px;flex-wrap:wrap;align-items:center;justify-content:flex-end;margin-top:12px}
.rr-foot .rr-note{margin-right:auto}
.rr-card p{margin:6px 0}
.rr-card ul{margin:6px 0;padding-left:18px}
.rr-card kbd{font:inherit;font-size:12px;padding:1px 5px;border:1px solid #d1d5db;border-radius:5px;background:#f3f4f6}
.rr-line{display:flex;justify-content:space-between;gap:12px;padding:5px 0;border-bottom:1px solid #eee}
.rr-line:last-child{border-bottom:0}
.rr-tag{color:#b45309;font-size:12px;margin-top:6px}
.rr-note{color:#6b7280;font-size:11px}
.rr-help{display:grid;gap:6px 18px;grid-template-columns:repeat(auto-fit,minmax(220px,1fr))}
.rr-help b{display:block;margin-top:6px}
.rr-pad{display:flex;justify-content:space-between;align-items:flex-end;gap:8px;padding:8px 10px 0;pointer-events:none;user-select:none}
.rr-pad .g{display:flex;gap:8px;align-items:flex-end;pointer-events:auto}
.rr-pad button{width:56px;height:56px;border-radius:50%;border:1px solid rgba(0,0,0,.22);background:rgba(255,255,255,.62);font:600 14px/1 system-ui,sans-serif;color:#111;touch-action:none;-webkit-tap-highlight-color:transparent}
.rr-pad button.on{background:#ef4444;color:#fff;border-color:#ef4444}
.rr-hide{display:none!important}

/* --- Batch 02 design polish --- */
.rr :focus-visible,.rr button:focus-visible{outline:2px solid #ef4444;outline-offset:2px}
.rr-opts{gap:12px 16px}
.rr-btn,.rr-mode{min-height:44px}
.rr-card{box-shadow:none}
.rr-pad button{min-height:44px}
@media (pointer:coarse){.rr button:not(:disabled){min-height:44px}}
@media (prefers-reduced-motion:reduce){.rr *{animation:none!important;transition:none!important}}

/* --- fill height + mobile refinements --- */
.rr-card{display:flex;flex-direction:column;overflow:hidden}
.rr-head,.rr-foot{flex:none}
.rr-menu,.rr-cheats,.rr-help,.rr-stats{flex:1 1 auto;min-height:0;overflow:auto}
@media (max-width:640px){
.rr.game-fill > .rr-board:not(:has(.rr-ov:not([hidden]))){aspect-ratio:16/9;flex:0 0 auto}
.rr.game-fill > .rr-board:has(.rr-ov:not([hidden])){flex:0 0 auto;min-height:min(70dvh,620px);aspect-ratio:auto}
.rr .rr-hud{gap:5px;margin-bottom:8px}
.rr .rr-hud .rr-chip{padding:4px 6px;font-size:9px}
.rr .rr-hud .rr-chip[data-chip="mode"],
.rr .rr-hud .rr-chip[data-chip="status"],
.rr .rr-hud .rr-chip[data-chip="best"],
.rr .rr-hud .rr-chip[data-chip="spd"],
.rr .rr-hud .rr-chip[data-chip="surf"],
.rr .rr-hud .rr-chip[data-chip="dmg"]{display:none}
.rr .rr-hud .rr-btn{min-height:32px;padding:5px 9px;font-size:9px}
.rr .rr-hud .rr-btn-label,.rr .rr-hud .rr-spacer{display:none}
.rr .rr-ov{padding:8px}
.rr .rr-card{width:100%;height:100%;max-height:100%;padding:12px;border-radius:12px}
.rr .rr-menu,.rr .rr-cheats,.rr .rr-help,.rr .rr-stats{scrollbar-width:none}
.rr .rr-menu::-webkit-scrollbar,.rr .rr-cheats::-webkit-scrollbar,
.rr .rr-help::-webkit-scrollbar,.rr .rr-stats::-webkit-scrollbar{display:none}
.rr .rr-foot{position:static;margin:0;padding:10px 0 0;border-top:1px solid #e5e7eb}
.rr .rr-note{display:none}
}
`;

const CHEATS = [
    ["nitro", "Nitro tak terbatas"], ["nodmg", "Tanpa damage"], ["grip", "Grip maksimal"],
    ["speed", "Turbo (tenaga +30%)"], ["slow", "Bot melambat"], ["assist", "Bantuan kemudi otomatis"],
];

export function mount(root, context = {}) {
    const { mode = "ai", room = null, playerName = "Player", onExit = () => { } } = context;
    const online = mode === "room" && Boolean(room);
    const playerIndex = online && !room.isHost ? 1 : 0;
    let roomData = room?.room || null;
    let state = null; // online: { seed, hostSlot, startAt, cars:[p0,p1] }

    const opt = { seed: randSeed(), ai: 3, diff: "normal", mouse: false, touch: !!(window.matchMedia && matchMedia("(pointer: coarse)").matches) };
    const cheat = { nitro: false, nodmg: false, grip: false, speed: false, slow: false, assist: false, used: false };
    const keys = {}, vk = { l: 0, r: 0, gas: 0, brake: 0, nitro: 0, hand: 0 }, mouse = { x: 0, y: 0, l: 0, r: 0, on: false };
    let game = null, ovName = null, raf = 0, last = 0, acc = 0, W = 0, H = 0, dpr = 1;
    let helpOpen = false, cheatsOpen = false, wasPaused = false, pausedAt = 0;
    let seenHelp = true;
    try { seenHelp = store.get("rr.seenHelp") === 1 || localStorage.getItem("rr.seenHelp") === "1"; } catch (_) { seenHelp = true; }
    if (!seenHelp) { helpOpen = true; store.set("rr.seenHelp", 1); }

    root.innerHTML = `<style>${CSS}</style>
  <div class="game-app rr game-fill" data-rr>
    <div class="rr-hud">
      <span class="rr-chip" data-chip="mode">MODE <b data-hud="mode">—</b></span>
      <span class="rr-chip" data-chip="status">STATUS <b data-status>Siap</b></span>
      <span class="rr-chip">LAP <b data-hud="lap">—</b></span>
      <span class="rr-chip">TIME <b data-hud="time">0:00.00</b></span>
      <span class="rr-chip" data-chip="best">BEST <b data-hud="best">--:--.--</b></span>
      <span class="rr-chip">POS <b data-hud="pos">—</b></span>
      <span class="rr-chip" data-chip="spd">SPD <b data-hud="spd">0 km/h</b></span>
      <span class="rr-chip" data-chip="surf">SURF <b data-hud="surf">—</b></span>
      <span class="rr-chip" data-chip="nitro">N2O <span class="rr-bar"><i data-hud="nitro"></i></span></span>
      <span class="rr-chip" data-chip="dmg" hidden>DMG <span class="rr-bar"><i data-hud="dmg"></i></span></span>
      <span class="rr-spacer"></span>
      <button class="rr-btn rr-icon-btn" type="button" data-help aria-label="How to play" title="How to play (H)">${iconSVG("helpCircle", { size: 14 })}<span class="rr-btn-label">Help</span></button>
      <button class="rr-btn rr-icon-btn" type="button" data-cheats aria-label="Cheats" title="Cheats (C)">${iconSVG("wrench", { size: 14 })}<span class="rr-btn-label">Cheats</span></button>
      <button class="rr-btn rr-icon-btn" type="button" data-pause aria-label="Pause" title="Pause (P)">${iconSVG("pause", { size: 14 })}<span class="rr-btn-label">Pause</span></button>
      <button class="rr-btn rr-icon-btn" type="button" data-restart aria-label="Restart" title="Restart (R)">${iconSVG("refresh", { size: 14 })}<span class="rr-btn-label">Restart</span></button>
      <button class="rr-btn rr-icon-btn" type="button" data-tomenu aria-label="Menu" title="Back to menu">${iconSVG("home", { size: 14 })}<span class="rr-btn-label">Menu</span></button>
      <button class="rr-btn rr-icon-btn" type="button" data-exit aria-label="Exit game" title="Exit game">${iconSVG("logOut", { size: 14 })}<span class="rr-btn-label">Exit game</span></button>
    </div>
    <section class="game-panel rr-board" data-board>
      <canvas data-cv></canvas>
      <div class="rr-ov" data-ov="select">
        <div class="rr-card">
          <div class="rr-head"><h3>Rally Racer</h3><span class="rr-tag">Pilih mode & track</span></div>
          <div class="rr-menu">
            <div class="rr-opts">
              <label>Seed <input type="text" data-seed maxlength="24" value="${opt.seed}"></label>
              <button class="rr-btn" type="button" data-newseed>Acak track</button>
              <label>Bot <select data-ai><option>3</option><option>4</option><option>5</option></select></label>
              <label>Level <select data-diff><option value="easy">Mudah</option><option value="normal" selected>Normal</option><option value="hard">Sulit</option></select></label>
              <label><input type="checkbox" data-mouse> Kemudi mouse</label>
              <label><input type="checkbox" data-touch ${opt.touch ? "checked" : ""}> Tombol virtual</label>
            </div>
            <div class="rr-modes">${MODES.map((m) => `<button class="rr-mode" type="button" data-mode="${m.id}"><b>${m.t}</b><span>${m.d}</span></button>`).join("")}</div>
          </div>
        </div>
      </div>
      <div class="rr-ov" data-ov="wait" hidden>
        <div class="rr-card">
          <div class="rr-head"><h3>Menunggu host</h3></div>
          <p>Balapan dimulai begitu host selesai menyiapkan track.</p>
        </div>
      </div>
      <div class="rr-ov" data-ov="pause" hidden>
        <div class="rr-card">
          <div class="rr-head"><h3>Pause</h3></div>
          <div class="rr-foot"><button class="rr-btn p" data-resume type="button">Lanjut</button><button class="rr-btn" data-restart type="button">Ulangi</button></div>
        </div>
      </div>
      <div class="rr-ov" data-ov="cheat" hidden>
        <div class="rr-card">
          <div class="rr-head"><h3>Cheat</h3><button class="rr-btn" data-cheat-close type="button">Tutup</button></div>
          <div class="rr-cheats">
            <div class="rr-cheat-grid">${CHEATS.map(([k, n]) => `<button class="rr-btn" type="button" data-ch="${k}">${n} · <b data-chv="${k}">Mati</b></button>`).join("")}</div>
            <div class="rr-sep">Aksi cepat</div>
            <div class="rr-foot"><button class="rr-btn" data-chact="repair" type="button">Perbaiki mobil</button><button class="rr-btn" data-chact="nitro" type="button">Isi nitro</button><button class="rr-btn" data-chact="cp" type="button">Loncat ke checkpoint</button></div>
          </div>
          <div class="rr-foot"><span class="rr-note">Cheat dipakai = rekor dan papan skor tidak disimpan.</span><button class="rr-btn p" data-cheat-close type="button">Tutup</button></div>
        </div>
      </div>
      <div class="rr-ov" data-ov="results" hidden>
        <div class="rr-card">
          <div class="rr-head"><h3 data-out="title">Hasil</h3></div>
          <div class="rr-stats" data-out="html"></div>
          <div class="rr-foot" data-out="actions">
            <button class="rr-btn p" data-restart type="button">Ulangi</button>
            <button class="rr-btn" data-newtrack type="button">Track baru</button>
            <button class="rr-btn" data-tomenu type="button">Menu</button>
          </div>
        </div>
      </div>
      <div class="rr-ov" data-ov="help" hidden>
        <div class="rr-card">
          <div class="rr-head"><h3>Cara main</h3><button class="rr-btn" data-help-close type="button">Tutup</button></div>
          <div class="rr-help">
            <div>
              <p>Selesaikan lap secepat mungkin. Lewati checkpoint secara berurutan agar lap dihitung. Track dibuat acak dari seed dan sudah dicek bisa diselesaikan.</p>
              <p><b>Keyboard</b>: <kbd>W</kbd>/<kbd>↑</kbd> gas, <kbd>S</kbd>/<kbd>↓</kbd> rem, <kbd>A</kbd><kbd>D</kbd>/<kbd>←</kbd><kbd>→</kbd> belok, <kbd>Space</kbd> rem tangan (drift), <kbd>Shift</kbd> nitro.</p>
              <p><b>Mouse</b> (aktifkan di menu): arahkan kursor ke tujuan, klik kiri gas, klik kanan rem.</p>
              <p><b>Mobile</b>: pakai tombol virtual di bawah layar.</p>
            </div>
            <div>
              <b>2 pemain</b>
              <ul><li>P1 <kbd>WASD</kbd> + <kbd>Shift kiri</kbd> + <kbd>Space</kbd>.</li>
                <li>P2 <kbd>Panah</kbd> + <kbd>Shift kanan</kbd> + <kbd>Enter</kbd>.</li>
                <li>Pemain yang tertinggal mendapat bantuan kecepatan kecil.</li></ul>
              <b>Aturan</b>
              <ul><li>Keluar jalur memperlambat mobil; pagar luar membuat mobil memantul.</li>
                <li>Rally stage: permukaan berubah (aspal, kerikil, tanah, salju). Tabrakan merusak mobil, dan co-driver membacakan tikungan di depan.</li>
                <li>Nitro habis cepat dan terisi pelan saat tidak dipakai.</li></ul>
              <p><b>Pintasan</b>: <kbd>H</kbd> bantuan · <kbd>C</kbd> cheat · <kbd>P</kbd> pause · <kbd>R</kbd> ulangi.</p>
            </div>
          </div>
          <div class="rr-foot"><span class="rr-note">Tekan H untuk membuka panduan ini</span><button class="rr-btn p" data-help-close type="button">Mengerti</button></div>
        </div>
      </div>
    </section>
    <div class="rr-pad rr-hide" data-vkroot>
      <div class="g"><button data-vk="l" type="button">◀</button><button data-vk="r" type="button">▶</button></div>
      <div class="g"><button data-vk="hand" type="button">Drift</button><button data-vk="nitro" type="button">N2O</button><button data-vk="brake" type="button">Rem</button><button data-vk="gas" type="button">Gas</button></div>
    </div>
  </div>`;

    const $ = (s) => root.querySelector(s);
    const cv = $("[data-cv]"), ctx = cv.getContext("2d"), board = $("[data-board]");
    const ov = {
        select: $('[data-ov="select"]'), wait: $('[data-ov="wait"]'), pause: $('[data-ov="pause"]'),
        cheat: $('[data-ov="cheat"]'), results: $('[data-ov="results"]'), help: $('[data-ov="help"]'),
    };
    const hudEl = {
        mode: $("[data-hud='mode']"), lap: $("[data-hud='lap']"), time: $("[data-hud='time']"),
        best: $("[data-hud='best']"), pos: $("[data-hud='pos']"), nitro: $("[data-hud='nitro']"),
        spd: $("[data-hud='spd']"), surf: $("[data-hud='surf']"),
        dmg: $("[data-hud='dmg']"), dmgChip: $('[data-chip="dmg"]'),
    };
    const out = { title: $("[data-out='title']"), html: $("[data-out='html']"), actions: $("[data-out='actions']") };
    const vkRoot = $("[data-vkroot]");
    const setStatus = (t) => { const e = $("[data-status]"); if (e) e.textContent = t; };
    const paused = () => helpOpen || cheatsOpen || ovName === "pause";

    /* ------------------------------ DOM state */
    function syncHud() {
        const g = game, c = g?.humans[0];
        hudEl.mode.textContent = g ? (MODE_SHORT[g.cfg.mode] || (online ? "Online" : "—")) : "—";
        hudEl.lap.textContent = c ? `${Math.min(c.lap + 1, g.cfg.laps)}/${g.cfg.laps}` : "—";
        hudEl.time.textContent = g ? fmt(g.phase === "countdown" ? 0 : c.finished ? c.finishTime : g.t) : "0:00.00";
        hudEl.best.textContent = g?.best != null ? fmt(g.best) : "--:--.--";
        hudEl.pos.textContent = c && !g.cfg.timeAttack ? `P${c.pos}/${g.cars.length}` : "—";
        hudEl.spd.textContent = c ? `${Math.round(Math.hypot(c.vx, c.vy) * 0.5)} km/h` : "0 km/h";
        hudEl.surf.textContent = c ? (SURF[c.sid] || SURF.grass).n : "—";
        hudEl.nitro.style.width = `${c ? c.nitro : 100}%`;
        hudEl.dmgChip.hidden = !(g?.cfg.dmg);
        if (g?.cfg.dmg && c) {
            hudEl.dmg.style.width = `${100 - c.dmg}%`;
            hudEl.dmg.style.background = c.dmg > 60 ? "#ef4444" : "#10b981";
        }
    }
    function render() {
        const inGame = !!game, active = inGame && !online, blocking = helpOpen || cheatsOpen;
        ov.select.hidden = inGame || online || blocking;
        ov.wait.hidden = ovName !== "wait" || blocking;
        ov.pause.hidden = ovName !== "pause" || blocking;
        ov.results.hidden = ovName !== "results" || blocking;
        ov.cheat.hidden = !cheatsOpen || helpOpen || !inGame;
        ov.help.hidden = !helpOpen;
        out.actions.hidden = online;
        if (ovName === "results" && game?.res) {
            out.title.textContent = game.res.title;
            out.html.innerHTML = game.res.html;
        }
        vkRoot.classList.toggle("rr-hide", !(inGame && opt.touch && game.cfg.mode !== "local"));
        const cbtn = root.querySelector("[data-cheats]"), pbtn = root.querySelector("[data-pause]"),
            rbtn = root.querySelector("[data-restart]"), mbtn = root.querySelector("[data-tomenu]");
        cbtn.disabled = !active;
        pbtn.disabled = !active || game.phase === "done";
        rbtn.disabled = !active;
        mbtn.disabled = !active;
        cbtn.classList.toggle("on", Object.keys(cheat).some((k) => cheat[k]));
        const plabel = pbtn.querySelector(".rr-btn-label");
        if (plabel) plabel.textContent = ovName === "pause" ? "Resume" : "Pause";
        pbtn.setAttribute("aria-label", ovName === "pause" ? "Resume" : "Pause");
        root.querySelectorAll("[data-ch]").forEach((b) => {
            const on = !!cheat[b.dataset.ch];
            b.classList.toggle("on", on);
            const v = b.querySelector("[data-chv]");
            if (v) v.textContent = on ? "Aktif" : "Mati";
        });
        syncHud();
        if (inGame) resize();
    }
    function openOv(n) { ovName = n; render(); }
    function toggleHelp(on) {
        helpOpen = typeof on === "boolean" ? on : !helpOpen;
        if (helpOpen) cheatsOpen = false;
        render();
    }
    function togglePause() {
        if (!game || online || game.phase === "done") return;
        if (helpOpen) { toggleHelp(false); return; }
        if (cheatsOpen) { cheatsOpen = false; render(); return; }
        ovName = ovName === "pause" ? null : "pause";
        render();
    }
    function toMenu() { game = null; ovName = null; cheatsOpen = false; setStatus("Siap"); render(); }

    /* ------------------------------ game setup */
    function baseGame(T, cfg) {
        return { T, cfg, cars: [], humans: [], t: 0, step: 0, phase: "countdown", cd: 3.5, marks: [], mi: 0, views: [], ghost: null, best: null, frames: [], info: "", res: null };
    }
    function startGame(id, seedOverride) {
        const seed = seedOverride || (id === "daily" ? new Date().toISOString().slice(0, 10) : opt.seed);
        const surface = id === "rally" ? "mixed" : id === "daily" ? "single" : "asphalt";
        const timeAttack = id === "trial" || id === "rally" || id === "daily";
        setStatus("Membuat track…");
        Object.keys(cheat).forEach((k) => (cheat[k] = false));
        const T = makeSolvable(seed, surface);
        const cfg = { mode: id, seed, laps: timeAttack ? 1 : 3, timeAttack, dmg: id === "rally", notes: id === "rally", humans: id === "local" ? 2 : 1, ai: id === "race" ? opt.ai : 0 };
        const g = baseGame(T, cfg);
        const n = cfg.humans + cfg.ai, order = shuffle([...Array(n).keys()]);
        const colors = ["#f59e0b", "#10b981", "#8b5cf6", "#64748b", "#ec4899"], names = ["Bima", "Sari", "Joko", "Dewi", "Raka"];
        for (let h = 0; h < cfg.humans; h++) {
            const c = makeCar(T, { name: cfg.humans > 1 ? `P${h + 1}` : playerName, color: h ? "#3b82f6" : "#ef4444", slot: order[h], human: h, skill: 0.9 });
            g.cars.push(c); g.humans.push(c);
        }
        const sk = { easy: 0.84, normal: 0.92, hard: 1 }[opt.diff];
        for (let k = 0; k < cfg.ai; k++) g.cars.push(makeCar(T, { name: names[k], color: colors[k], slot: order[cfg.humans + k], skill: sk * (0.97 + Math.random() * 0.03), lane: (Math.random() * 2 - 1) * 0.5 }));
        g.humans.forEach((c) => (c.lane = 0));
        if (id === "race") g.info = `Kamu start di posisi ${order[0] + 1} dari ${n} (diundi)`;
        if (id === "local") g.info = `${order[0] < order[1] ? "P1" : "P2"} start di depan (diundi)`;
        if (timeAttack) { const s = store.get(`rr.ghost.${id}.${seed}`); if (s?.frames) { g.ghost = s.frames; g.best = s.time; } }
        game = g; ovName = null; acc = 0;
        setStatus("Siap start");
        render();
    }
    function startOnline() {
        const T = makeSolvable(state.seed, "asphalt");
        const mySlot = room.isHost ? state.hostSlot : 1 - state.hostSlot;
        const g = baseGame(T, { mode: "online", seed: state.seed, laps: 3, timeAttack: false, dmg: false, notes: false, humans: 1, ai: 0 });
        const me = makeCar(T, { name: playerName, color: mySlot ? "#3b82f6" : "#ef4444", slot: mySlot, human: 0, skill: 0.9 });
        const op = makeCar(T, { name: "Lawan", color: mySlot ? "#ef4444" : "#3b82f6", slot: 1 - mySlot, skill: 0.9 });
        op.remote = true; me.lane = 0;
        g.cars = [me, op]; g.humans = [me]; g.mySlot = mySlot; g.oppSlot = 1 - mySlot;
        g.info = `Kamu ${mySlot ? "biru, start di belakang" : "merah, start di depan"} (diundi)`;
        game = g; ovName = null; setStatus("Siap start"); render();
    }

    /* ------------------------------ input */
    function readInput(h, c) {
        const k = keys;
        let inp;
        if (game.cfg.mode === "local") {
            inp = h === 0
                ? { steer: (k.KeyD ? 1 : 0) - (k.KeyA ? 1 : 0), gas: k.KeyW, brake: k.KeyS, nitro: k.ShiftLeft, hand: k.Space }
                : { steer: (k.ArrowRight ? 1 : 0) - (k.ArrowLeft ? 1 : 0), gas: k.ArrowUp, brake: k.ArrowDown, nitro: k.ShiftRight, hand: k.Enter || k.NumpadEnter };
        } else {
            inp = {
                steer: (k.KeyD || k.ArrowRight ? 1 : 0) - (k.KeyA || k.ArrowLeft ? 1 : 0) + vk.r - vk.l,
                gas: k.KeyW || k.ArrowUp || vk.gas || mouse.l, brake: k.KeyS || k.ArrowDown || vk.brake || mouse.r,
                nitro: k.ShiftLeft || k.ShiftRight || vk.nitro, hand: k.Space || vk.hand,
            };
            if (opt.mouse && mouse.on && inp.steer === 0) inp.steer = clamp(wrapA(Math.atan2(mouse.y - H / 2, mouse.x - W / 2) - c.a) * 2, -1, 1);
        }
        if (!online && cheat.assist && inp.steer === 0) inp.steer = aiInput(game.T, c, game.cars, game.t, 1).steer;
        return inp;
    }
    const onKeyDown = (e) => {
        if (e.target && /INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) return;
        const c = e.code;
        // Prioritas: help → cheats → pause/escape → aksi game.
        if (c === "KeyH") { toggleHelp(); keys[c] = false; e.preventDefault(); return; }
        if (c === "KeyC") { if (!helpOpen && game && !online) { cheatsOpen = !cheatsOpen; render(); } keys[c] = false; e.preventDefault(); return; }
        if (c === "KeyP" || c === "Escape") {
            if (helpOpen) toggleHelp(false);
            else if (cheatsOpen) { cheatsOpen = false; render(); }
            else if (game && !online) togglePause();
            keys[c] = false; e.preventDefault(); return;
        }
        if (c === "KeyR") { if (game && !online) startGame(game.cfg.mode, game.cfg.seed); keys[c] = false; e.preventDefault(); return; }
        keys[c] = true;
        if (game && ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].includes(c)) e.preventDefault();
    };
    const onKeyUp = (e) => { keys[e.code] = false; };
    const onBlur = () => { for (const k in keys) keys[k] = false; for (const k in vk) vk[k] = 0; };
    window.addEventListener("keydown", onKeyDown); window.addEventListener("keyup", onKeyUp); window.addEventListener("blur", onBlur);

    const mpos = (e) => { const r = cv.getBoundingClientRect(); mouse.x = e.clientX - r.left; mouse.y = e.clientY - r.top; mouse.on = true; };
    const onMouseMove = (e) => mpos(e);
    const onMouseDown = (e) => { mpos(e); if (e.button === 0) mouse.l = 1; if (e.button === 2) mouse.r = 1; };
    const onMouseUp = (e) => { if (e.button === 0) mouse.l = 0; if (e.button === 2) mouse.r = 0; };
    const onCtx = (e) => e.preventDefault();
    cv.addEventListener("mousemove", onMouseMove); cv.addEventListener("mousedown", onMouseDown); window.addEventListener("mouseup", onMouseUp); cv.addEventListener("contextmenu", onCtx);

    const vkPtr = new Map();
    const vkDown = (e) => { const b = e.target.closest("[data-vk]"); if (!b) return; vk[b.dataset.vk] = 1; b.classList.add("on"); vkPtr.set(e.pointerId, b); e.preventDefault(); };
    const vkUp = (e) => { const b = vkPtr.get(e.pointerId); if (!b) return; vk[b.dataset.vk] = 0; b.classList.remove("on"); vkPtr.delete(e.pointerId); };
    vkRoot.addEventListener("pointerdown", vkDown); vkRoot.addEventListener("pointerup", vkUp); vkRoot.addEventListener("pointercancel", vkUp);

    /* ------------------------------ UI events */
    function submitAction(action) {
        if (online && !room.isHost) { room.sendAction(action).catch(console.warn); return; }
        applyAction(action, playerIndex);
    }
    function applyAction(action, actor) {
        if (!state || !action) return;
        const slot = actor === 1 ? 1 - state.hostSlot : state.hostSlot;
        state.cars[slot] = action;
        if (actor !== playerIndex && game) { const op = game.cars.find((c) => c.remote); if (op) op.tg = action; }
    }
    function publish() {
        render();
        if (online && room.isHost) room.publishState(state).catch(console.warn);
    }

    function handleClick(event) {
        const t = event.target;
        if (!t || !t.closest) return;
        if (t.closest("[data-exit]")) { onExit(); return; }
        if (t.closest("[data-help]")) { toggleHelp(); return; }
        if (t.closest("[data-help-close]")) { toggleHelp(false); return; }
        if (t.closest("[data-cheats]")) { if (game && !online && !helpOpen) { cheatsOpen = !cheatsOpen; render(); } return; }
        if (t.closest("[data-cheat-close]")) { cheatsOpen = false; render(); return; }
        if (t.closest("[data-pause]") || t.closest("[data-resume]")) { togglePause(); return; }
        if (t.closest("[data-tomenu]")) { toMenu(); return; }
        if (t.closest("[data-restart]") && game) { startGame(game.cfg.mode, game.cfg.seed); return; }
        if (t.closest("[data-newtrack]") && game) {
            opt.seed = randSeed(); $("[data-seed]").value = opt.seed;
            startGame(game.cfg.mode === "daily" ? "trial" : game.cfg.mode); return;
        }
        const b = t.closest("button");
        if (!b) return;
        const d = b.dataset;
        if (d.mode) startGame(d.mode);
        else if (d.newseed !== undefined) { opt.seed = randSeed(); $("[data-seed]").value = opt.seed; }
        else if (d.ch) { cheat[d.ch] = !cheat[d.ch]; if (cheat[d.ch]) cheat.used = true; render(); }
        else if (d.chact && game) cheatAction(d.chact);
    }
    function cheatAction(a) {
        const c = game.humans[0], T = game.T; cheat.used = true;
        if (a === "repair") c.dmg = 0;
        if (a === "nitro") c.nitro = 100;
        if (a === "cp" && !c.finished) {
            const base = c.nextCp < T.cp.length ? c.lap * T.N + T.cp[c.nextCp] : (c.lap + 1) * T.N;
            const p = pointAt(T, base), sp = Math.hypot(c.vx, c.vy), a0 = T.ang[Math.floor(((base % T.N) + T.N) % T.N)];
            c.x = p[0]; c.y = p[1]; c.a = a0; c.vx = Math.cos(a0) * sp; c.vy = Math.sin(a0) * sp;
            project(T, c, true); c.lastIdx = c.idx; c.prog = base + 0.6; c.maxProg = c.prog; c.idx = (base + 0.6) % T.N; c.lastIdx = c.idx;
        }
        cheatsOpen = false;
        render();
    }
    function handleInput(e) {
        const t = e.target;
        if (t.matches("[data-seed]")) opt.seed = t.value.trim().slice(0, 24) || randSeed();
        else if (t.matches("[data-ai]")) opt.ai = +t.value;
        else if (t.matches("[data-diff]")) opt.diff = t.value;
        else if (t.matches("[data-mouse]")) opt.mouse = t.checked;
        else if (t.matches("[data-touch]")) opt.touch = t.checked;
    }
    root.addEventListener("click", handleClick);
    root.addEventListener("input", handleInput);
    root.addEventListener("change", handleInput);

    /* ------------------------------ simulation */
    function stepRemote(c, dt) {
        const tg = c.tg; if (!tg) return;
        if (c.tgn !== tg.n) { c.tgn = tg.n; c.vx = tg.vx; c.vy = tg.vy; }
        c.x += c.vx * dt; c.y += c.vy * dt;
        c.x += (tg.x - c.x) * 0.12; c.y += (tg.y - c.y) * 0.12; c.a += wrapA(tg.a - c.a) * 0.2;
        c.prog = tg.prog; c.lap = tg.lap; c.finished = tg.fin; c.finishTime = tg.ft;
    }
    function collide(cars) {
        for (let i = 0; i < cars.length; i++) for (let j = i + 1; j < cars.length; j++) {
            const a = cars[i], b = cars[j]; if (a.remote || b.remote) continue;
            const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy);
            if (d > 0 && d < 30) {
                const nx = dx / d, ny = dy / d, ov = (30 - d) / 2;
                a.x -= nx * ov; a.y -= ny * ov; b.x += nx * ov; b.y += ny * ov;
                const rv = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
                if (rv < 0) {
                    const j2 = (-1.4 * rv) / 2; a.vx -= j2 * nx; a.vy -= j2 * ny; b.vx += j2 * nx; b.vy += j2 * ny;
                    if (game.cfg.dmg && -rv > 80) { const dm = (-rv - 80) * 0.05; if (a.human != null && !cheat.nodmg) a.dmg = Math.min(100, a.dmg + dm); if (b.human != null && !cheat.nodmg) b.dmg = Math.min(100, b.dmg + dm); }
                }
            }
        }
    }
    function tick(dt) {
        const g = game, T = g.T, cars = g.cars;
        if (g.phase === "countdown") {
            if (online) g.cd = (state.startAt - Date.now()) / 1000; else g.cd -= dt;
            if (g.cd <= 0) { g.phase = "race"; g.t = 0; setStatus("Balapan"); }
            return;
        }
        if (g.phase !== "race") return;
        g.t += dt; g.step++;
        for (const c of cars) {
            if (c.remote) { stepRemote(c, dt); continue; }
            const human = c.human != null && !c.finished;
            const inp = human ? readInput(c.human, c) : aiInput(T, c, cars, g.t, cheat.slow && c.human == null ? 0.7 : 1);
            stepCar(T, c, inp, dt, { dmg: g.cfg.dmg, cheat: human && !online ? cheat : null });
            if (c.skid && g.step % 2 === 0) { g.marks[g.mi] = [c.x, c.y]; g.mi = (g.mi + 1) % 700; }
            const ev = progress(T, c, g.t, g.cfg.laps);
            if (c.human != null && ev) c.flash = { t: ev === "finish" ? "Finish " + fmt(c.finishTime) : ev === "lap" ? `Lap ${c.lap} · ${fmt(c.lapTimes[c.lapTimes.length - 1])}` : "Checkpoint", u: g.t + 2 };
        }
        collide(cars);
        if (g.step % 6 === 0) {
            const rk = rankCars(cars); rk.forEach((c, i) => (c.pos = i + 1));
            if (g.cfg.mode === "local") { // bantuan untuk yang tertinggal
                const [a, b] = g.humans, gap = a.prog - b.prog;
                a.boost = clamp((-gap - 25) / 80, 0, 1) * 0.06; b.boost = clamp((gap - 25) / 80, 0, 1) * 0.06;
            }
        }
        if (g.cfg.timeAttack && (g.step - 1) % 3 === 0 && !g.humans[0].finished) g.frames.push(Math.round(g.humans[0].x), Math.round(g.humans[0].y), Math.round(g.humans[0].a * 100));
        if (online && g.step % 6 === 0) {
            const me = g.humans[0], p = { x: Math.round(me.x), y: Math.round(me.y), a: +me.a.toFixed(3), vx: Math.round(me.vx), vy: Math.round(me.vy), prog: +me.prog.toFixed(1), lap: me.lap, fin: me.finished, ft: me.finishTime, n: g.step };
            submitAction(p);
            if (room.isHost) room.publishState(state).catch(console.warn);
        }
        const hs = g.humans, m = g.cfg.mode;
        if (m === "local") { if (hs.every((c) => c.finished) || (hs.some((c) => c.finished) && g.t - Math.min(...hs.filter((c) => c.finished).map((c) => c.finishTime)) > 10)) finishRace(); }
        else if (hs.every((c) => c.finished)) finishRace();
    }
    function finishRace() {
        const g = game, cfg = g.cfg; g.phase = "done"; setStatus("Selesai");
        const rank = rankCars(g.cars), me = g.humans[0];
        let title = "Hasil", html = "";
        if (cfg.timeAttack) {
            const time = me.finishTime, prev = g.best;
            const record = !cheat.used && (prev == null || time < prev);
            title = record ? "Rekor baru" : "Selesai";
            html = `<div class="rr-line"><span>Waktu</span><b>${fmt(time)}</b></div><div class="rr-line"><span>Terbaik</span><span>${fmt(record ? time : prev)}</span></div><div class="rr-line"><span>Par (bot)</span><span>${fmt(g.T.par)}</span></div>`;
            if (cfg.dmg) html += `<div class="rr-line"><span>Damage</span><span>${Math.round(me.dmg)}%</span></div>`;
            if (record) store.set(`rr.ghost.${cfg.mode}.${cfg.seed}`, { time, frames: g.frames });
            if (cfg.mode === "daily" && !cheat.used) {
                // Ganti blok ini dengan Firebase/Supabase untuk papan skor global.
                const key = `rr.lb.${cfg.seed}`, list = store.get(key) || [];
                list.push({ n: playerName, t: time }); list.sort((a, b) => a.t - b.t); store.set(key, list.slice(0, 10));
                html += `<p><b>Papan skor ${cfg.seed}</b></p>` + list.slice(0, 5).map((e, i) => `<div class="rr-line"><span>${i + 1}. ${e.n}</span><span>${fmt(e.t)}</span></div>`).join("");
            }
        } else if (online) {
            const op = g.cars.find((c) => c.remote), win = !(op.finished && op.finishTime < me.finishTime);
            title = win ? "Kamu menang" : "Lawan lebih cepat";
            html = `<div class="rr-line"><span>Waktumu</span><b>${fmt(me.finishTime)}</b></div><div class="rr-line"><span>Lawan</span><span>${op.finished ? fmt(op.finishTime) : "belum finish"}</span></div>`;
        } else {
            const pos = rank.indexOf(me) + 1;
            title = cfg.mode === "local" ? `${rank[0].name} menang` : `Posisi ${pos} dari ${rank.length}`;
            html = rank.map((c, i) => `<div class="rr-line"><span>${i + 1}. ${c.name}${c.human != null ? " ★" : ""}</span><span>${c.finished ? fmt(c.finishTime) : "—"}</span></div>`).join("");
        }
        if (cheat.used && !online) html += `<p class="rr-tag">Cheat dipakai, rekor tidak disimpan.</p>`;
        g.res = { title, html };
        openOv("results");
    }

    /* ------------------------------ render */
    function resize() {
        dpr = Math.min(2, window.devicePixelRatio || 1);
        const r = board.getBoundingClientRect();
        W = r.width || board.clientWidth; H = r.height || board.clientHeight;
        cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    }
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => game && resize()) : null;
    ro?.observe(board);

    function pill(txt, x, y, o = {}) {
        const s = o.s || 13; ctx.font = `${o.w || 600} ${s}px ui-monospace,Menlo,Consolas,monospace`;
        const w = ctx.measureText(txt).width + 14, h = s + 10, px = o.al === "r" ? x - w : o.al === "c" ? x - w / 2 : x;
        ctx.fillStyle = o.bg || "rgba(255,255,255,.8)"; ctx.fillRect(px, y, w, h);
        ctx.fillStyle = o.fg || "#111827"; ctx.textBaseline = "middle"; ctx.textAlign = "left"; ctx.fillText(txt, px + 7, y + h / 2 + 0.5);
    }
    function bar(x, y, w, h, f, col, label) {
        ctx.fillStyle = "rgba(255,255,255,.75)"; ctx.fillRect(x, y, w, h);
        ctx.fillStyle = col; ctx.fillRect(x + 2, y + 2, (w - 4) * clamp(f, 0, 1), h - 4);
        ctx.fillStyle = "#111827"; ctx.font = "600 10px ui-monospace,Menlo,monospace"; ctx.textBaseline = "middle"; ctx.fillText(label, x + 6, y + h / 2 + 0.5);
    }
    function drawTrack(g) {
        const T = g.T, P = T.pts, N = T.N;
        const loop = () => { ctx.beginPath(); P.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); ctx.closePath(); };
        ctx.lineJoin = "round"; ctx.lineCap = "butt";
        loop(); ctx.strokeStyle = "#9aa5ae"; ctx.lineWidth = TW + 104; ctx.stroke();
        ctx.strokeStyle = T.run; ctx.lineWidth = TW + 100; ctx.stroke();
        ctx.strokeStyle = "rgba(255,255,255,.8)"; ctx.lineWidth = TW + 6; ctx.stroke();
        let i = 0;
        while (i < N) {
            const s = T.surf[i]; let j = i; while (j < N && T.surf[j] === s) j++;
            ctx.beginPath(); ctx.moveTo(P[i][0], P[i][1]); for (let k = i + 1; k <= j; k++) ctx.lineTo(P[k % N][0], P[k % N][1]);
            ctx.strokeStyle = SURF[s].c; ctx.lineWidth = TW; ctx.stroke(); i = j;
        }
        loop(); ctx.setLineDash([14, 20]); ctx.strokeStyle = "rgba(255,255,255,.45)"; ctx.lineWidth = 3; ctx.stroke(); ctx.setLineDash([]);
        ctx.save(); ctx.translate(P[0][0], P[0][1]); ctx.rotate(T.ang[0]);
        const ch = TW / 8; for (let r = 0; r < 8; r++) { ctx.fillStyle = "#fff"; ctx.fillRect(-7, -TW / 2 + r * ch, 14, ch); ctx.fillStyle = "#111"; ctx.fillRect(r % 2 ? -7 : 0, -TW / 2 + r * ch, 7, ch); }
        ctx.restore();
    }
    function drawCar(c, alpha) {
        ctx.save(); ctx.translate(c.x, c.y); ctx.rotate(c.a); ctx.globalAlpha = alpha;
        ctx.fillStyle = "rgba(0,0,0,.2)"; ctx.fillRect(-17, -6, 38, 20);
        if (c.nitroOn) { ctx.fillStyle = "#f97316"; ctx.fillRect(-30, -4, 11, 8); }
        ctx.fillStyle = c.color; ctx.fillRect(-19, -9, 38, 18);
        ctx.fillStyle = "rgba(255,255,255,.88)"; ctx.fillRect(1, -6, 9, 12);
        ctx.fillStyle = "rgba(17,24,39,.35)"; ctx.fillRect(-19, -9, 5, 18);
        if (c.dmg > 0) { ctx.fillStyle = `rgba(0,0,0,${(c.dmg / 100) * 0.5})`; ctx.fillRect(-19, -9, 38, 18); }
        ctx.restore();
    }
    function ghostAt(fr, t) {
        const n = fr.length / 3; let f = t * 20, i = Math.floor(f);
        if (i >= n - 1) { i = n - 1; f = i; }
        const k = f - i, j = Math.min(i + 1, n - 1), a0 = fr[i * 3 + 2] / 100, a1 = fr[j * 3 + 2] / 100;
        return { x: fr[i * 3] + (fr[j * 3] - fr[i * 3]) * k, y: fr[i * 3 + 1] + (fr[j * 3 + 1] - fr[i * 3 + 1]) * k, a: a0 + wrapA(a1 - a0) * k, color: "#475569", dmg: 0, nitroOn: false };
    }
    function drawView(g, v, idx) {
        const car = v.car, sp = Math.hypot(car.vx, car.vy), T = g.T;
        ctx.save(); ctx.beginPath(); ctx.rect(v.x, v.y, v.w, v.h); ctx.clip();
        ctx.fillStyle = T.bg; ctx.fillRect(v.x, v.y, v.w, v.h);
        const vw = g.views[idx] || (g.views[idx] = { cx: car.x, cy: car.y });
        vw.cx += (car.x + car.vx * 0.25 - vw.cx) * 0.12; vw.cy += (car.y + car.vy * 0.25 - vw.cy) * 0.12;
        const zoom = Math.min(v.w / 1.6, v.h) / (700 + sp * 0.8);
        ctx.translate(v.x + v.w / 2, v.y + v.h / 2); ctx.scale(zoom, zoom); ctx.translate(-vw.cx, -vw.cy);
        drawTrack(g);
        ctx.fillStyle = "rgba(0,0,0,.16)";
        for (const m of g.marks) if (m) ctx.fillRect(m[0] - 2, m[1] - 2, 4, 4);
        if (g.ghost && g.phase !== "countdown") drawCar(ghostAt(g.ghost, g.t), 0.4);
        for (const c of g.cars) if (c !== car) drawCar(c, 1);
        drawCar(car, 1);
        ctx.restore();
        hud(g, v, car);
    }
    function hud(g, v, c) {
        const T = g.T, cfg = g.cfg, s = v.w < 460 ? 0.85 : 1, y0 = v.y + 10;
        ctx.save(); ctx.beginPath(); ctx.rect(v.x, v.y, v.w, v.h); ctx.clip();
        // Statistik (waktu, lap, posisi, kecepatan, permukaan, nitro, damage) ada di bar HUD.
        // Board hanya menampilkan umpan balik dalam arena: pace note, arah salah, dan flash.
        if (cfg.notes) {
            const N = T.N, ns = T.notes.map((n) => ({ n, d: (((n.i - c.idx) % N) + N) % N })).filter((o) => o.d < 30 && o.d > 1).sort((a, b) => a.d - b.d).slice(0, 2);
            ns.forEach((o, i) => pill(`${o.n.txt}  ${Math.round((o.d * S) / 2)}m`, v.x + v.w / 2, y0 + 38 * s + i * 30 * s, { al: "c", s: (i ? 12 : 16) * s, w: 700, bg: i ? "rgba(255,255,255,.65)" : "rgba(17,24,39,.88)", fg: i ? "#111827" : "#fff" }));
        }
        if (c.wrong) pill("Salah arah", v.x + v.w / 2, v.y + v.h / 2 - 20, { al: "c", s: 18, w: 700, bg: "#ef4444", fg: "#fff" });
        if (c.flash && g.t < c.flash.u) pill(c.flash.t, v.x + v.w / 2, v.y + v.h - 70, { al: "c", s: 14 * s, bg: "rgba(17,24,39,.85)", fg: "#fff" });
        ctx.restore();
    }
    function draw() {
        if (!game || !W) return;
        const g = game;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);
        if (g.cfg.mode === "local") {
            const land = W >= H, gap = 3, w = land ? (W - gap) / 2 : W, h = land ? H : (H - gap) / 2;
            g.humans.forEach((car, i) => drawView(g, { x: land ? i * (w + gap) : 0, y: land ? 0 : i * (h + gap), w, h, car }, i));
        } else drawView(g, { x: 0, y: 0, w: W, h: H, car: g.humans[0] }, 0);
        ctx.textAlign = "left";
        if (g.phase === "countdown" || (g.phase === "race" && g.t < 0.8)) {
            const txt = g.phase === "race" ? "GO" : g.cd > 3 ? "Siap" : String(Math.ceil(g.cd));
            ctx.fillStyle = "rgba(255,255,255,.7)"; ctx.beginPath(); ctx.arc(W / 2, H / 2, Math.min(W, H) * 0.14, 0, TAU); ctx.fill();
            ctx.fillStyle = g.phase === "race" ? "#10b981" : "#111827"; ctx.font = `700 ${Math.min(W, H) * 0.14}px ui-monospace,Menlo,monospace`; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(txt, W / 2, H / 2 + 3);
            if (g.info) pill(g.info, W / 2, H * 0.78, { al: "c", s: 13 });
        }
    }
    function syncPauseAnchors() {
        const p = paused(), now = Date.now();
        if (p && !wasPaused) pausedAt = now;
        else if (!p && wasPaused && pausedAt) {
            const shift = now - pausedAt;
            if (shift > 0 && online && state?.startAt) state.startAt += shift;
            pausedAt = 0;
            last = performance.now(); // hindari lompatan dt/animasi saat resume
        }
        wasPaused = p;
    }
    function frame(ts) {
        raf = requestAnimationFrame(frame);
        syncPauseAnchors();
        const dt = Math.min(0.05, (ts - last) / 1000 || 0.016); last = ts;
        if (game && !paused()) { acc += dt; let n = 0; while (acc >= 1 / 60 && n++ < 6) { tick(1 / 60); acc -= 1 / 60; } }
        draw();
        if (game) syncHud();
    }

    /* ------------------------------ boot */
    if (online) {
        room.onRoom((nextRoom) => { roomData = nextRoom; });
        if (room.isHost) {
            state = { seed: "O" + randSeed(), hostSlot: Math.random() < 0.5 ? 0 : 1, startAt: Date.now() + 4500, cars: [null, null] };
            publish(); startOnline();
            room.onAction((action) => applyAction(action, 1));
        } else {
            ovName = "wait"; render();
            room.onState((next) => {
                state = next;
                if (!game) startOnline();
                else { const op = game.cars.find((c) => c.remote); if (op && next.cars?.[game.oppSlot]) op.tg = next.cars[game.oppSlot]; }
            });
        }
    } else render();
    raf = requestAnimationFrame(frame);

    return {
        destroy() {
            cancelAnimationFrame(raf); ro?.disconnect();
            window.removeEventListener("keydown", onKeyDown); window.removeEventListener("keyup", onKeyUp);
            window.removeEventListener("blur", onBlur); window.removeEventListener("mouseup", onMouseUp);
            root.removeEventListener("click", handleClick); root.removeEventListener("input", handleInput); root.removeEventListener("change", handleInput);
            void roomData;
            root.innerHTML = "";
        },
    };
}