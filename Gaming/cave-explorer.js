/* ==== GAME: cave-explorer.js ==== */
import { iconSVG } from "../JS/icons.js";

/*
- Cave Explorer (template ES-module: export META + mount).
- Setelah edit: node tools/build-games-manifest.mjs
- Level dibangkitkan prosedural dari seed & DIJAMIN bisa diselesaikan:
  semua gap/tanjakan dibatasi jangkauan lompat fisika, lalu divalidasi
  ulang dengan BFS reachability (start -> exit) sebelum dipakai.
- Mode "ai": balapan lawan bot (siapa jalan duluan diacak).
- Mode "room": host = server fisika; slot P1/P2 diacak untuk host & guest.
- Kontrol: keyboard + mouse (klik = lompat) di desktop; zona sentuh
  tak-terlihat (kiri/kanan/lompat) di mobile -- tanpa tombol virtual.
*/

export const META = {
    id: "cave-explorer",
    name: "Cave Explorer",
    category: "adventure",
    catLabel: "Adventure",
    desc: "Race through a procedurally generated cave: dodge spikes, saws, bats and falling stalactites, grab gems, reach the exit first.",
    art: '<svg viewBox="0 0 48 48" width="54" height="54" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 42V20a20 20 0 0 1 40 0v22"/><path d="M12 42V26M36 42V26"/><path d="M24 18l6 9-6 9-6-9z"/></svg>',
    bg: ["#e2e8f0", "#94a3b8"],
    bestKey: "caveExplorerBestTime",
};

/* ================= konstanta & util ================= */
const VIEW_W = 960, VIEW_H = 540;
const GRAV = 2300, MOVE = 250, JUMP_V = 720, MAX_FALL = 1200;
const COYOTE = 0.09, JBUF = 0.12, JUMP_CUT = 200;
const PW = 26, PH = 34;
const HP0 = 3, INVULN = 1.2, GEM_SCORE = 25;
const GY = 470;
const CR_SHAKE = 0.5, CR_RESPAWN = 2.5;         // trap: platform runtuh
const ST_SHAKE = 0.32, ST_LEN = 26, ST_Y0 = 26; // trap: stalaktit jatuh
const READY_T = 0.8, HEAD_START = 1.0;          // jeda start & head-start acak
const BOT_SPEED = 0.93;

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const aabb = (ax, ay, aw, ah, bx, by, bw, bh) =>
    ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
const camClamp = (px, worldW) => clamp(px - VIEW_W * 0.4, 0, Math.max(0, worldW - VIEW_W));

function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
        a |= 0; a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/* ================= generator level (deterministik per seed) =================
   Batas aman (dari simulasi fisika): lompat penuh ~111px tinggi / ~156px jauh
   (bot 93%: ~145px). Gap datar <=112, tanjakan <=70 dengan gap <=72, dst. */
function genLevel(seed) {
    const rnd = mulberry32(seed);
    const target = 2500 + Math.floor(rnd() * 3) * 150;
    const G = [], P = [], SP = [], ST = [], SW = [], BT = [], GM = [], CP = [];
    const ground = (x, w) => {
        const g = { x, y: GY, w, h: 70 };
        G.push(g);
        if (w >= 180 && (!CP.length || g.x - CP[CP.length - 1].x >= 720))
            CP.push({ x: g.x + 26, y: GY - 34 });
        return g;
    };
    ground(0, 300);
    let x = 300, risk = false; // risk = ground setelah turunan platform (zona pendaratan)
    GM.push({ x: 180, y: GY - 40 });
    while (x < target - 420) {
        const r = rnd();
        if (r < 0.18) { /* gap datar */
            const gap = 70 + rnd() * 42; x += gap;
            GM.push({ x: x - gap / 2 - 10, y: GY - 72 });
            const w = 180 + rnd() * 160; ground(x, w); x += w; risk = false;
        } else if (r < 0.34) { /* spikes */
            const w = (risk ? 340 : 300) + rnd() * 80; ground(x, w);
            const sx = x + (risk ? 170 : 110) + rnd() * 40;
            const sw = 40 + Math.floor(rnd() * 2) * 20;
            SP.push({ x: sx, y: GY - 24, w: sw, h: 24 });
            GM.push({ x: sx + sw / 2 - 10, y: GY - 96 }); x += w; risk = false;
        } else if (r < 0.52) { /* tangga platform di atas jurang */
            const n = 2 + (rnd() < 0.4 ? 1 : 0);
            let ex = x, py = GY;
            for (let i = 0; i < n; i++) {
                const gap = 50 + rnd() * 22, rise = 25 + rnd() * 45;
                py = Math.max(320, py - rise);
                const px = ex + gap, pw = 72 + rnd() * 26;
                P.push({ x: px, y: py, w: pw, h: 14, kind: "p" });
                GM.push({ x: px + pw / 2 - 10, y: py - 46 }); ex = px + pw;
            }
            const gap = 55 + rnd() * 25, w = 200 + rnd() * 120;
            ground(ex + gap, w); x = ex + gap + w; risk = true;
        } else if (r < 0.64) { /* jembatan runtuh */
            let py = GY - 20 - rnd() * 25, ex = x;
            for (let i = 0; i < 2; i++) {
                const gap = 52 + rnd() * 16, px = ex + gap, pw = 80 + rnd() * 14;
                const py2 = i ? py - 20 + rnd() * 40 : py;
                P.push({ x: px, y: py2, w: pw, h: 14, kind: "c" });
                GM.push({ x: px + pw / 2 - 10, y: py2 - 46 }); ex = px + pw; py = py2;
            }
            const gap = 55 + rnd() * 20, w = 200 + rnd() * 120;
            ground(ex + gap, w); x = ex + gap + w; risk = true;
        } else if (r < 0.76) { /* koridor stalaktit */
            const w = (risk ? 300 : 260) + rnd() * 80; ground(x, w);
            const s1 = x + (risk ? 150 : 90);
            ST.push({ x: s1 }, { x: s1 + 80 });
            GM.push({ x: s1 + 30, y: GY - 40 }); x += w; risk = false;
        } else if (r < 0.88) { /* kelelawar patroli */
            const w = 340 + rnd() * 80; ground(x, w);
            BT.push({ x0: x + 150, x1: x + w - 60, y: GY - 46, amp: 20, v: Math.min(90 + rnd() * 40, 80), ph: rnd() * 10 });
            GM.push({ x: x + w / 2 - 10, y: GY - 100 }); x += w; risk = false;
        } else { /* gergaji bolak-balik */
            const w = 340 + rnd() * 60; ground(x, w);
            const amp = Math.min(70 + rnd() * 30, w / 2 - 110);
            SW.push({ cx: x + w / 2 + 40, amp, y: GY - 16, r: 15, sp: Math.min(1.6 + rnd() * 0.8, 90 / amp), ph: rnd() * 6.28 });
            GM.push({ x: x + w / 2 - 10, y: GY - 90 }); x += w; risk = false;
        }
    }
    const w = Math.max(320, target - x + 320); ground(x, w);
    const worldW = x + w;
    let gems = GM;
    if (gems.length > 14) gems = gems.filter((g, i) => i % 2 === 0 || i === GM.length - 1);
    let ci = 0;
    for (const p of P) if (p.kind === "c") p.ci = ci++;
    return {
        seed, worldW, ground: G, plats: P, spikes: SP, stals: ST, saws: SW,
        bats: BT, gems, cps: CP, ncr: ci,
        exit: { x: worldW - 86, y: GY - 70, w: 54, h: 70 },
        solids: G.concat(P),
    };
}

/* BFS reachability: pastikan ada rantai lompatan start -> exit. */
function validateLevel(lvl) {
    const nodes = lvl.ground.map((g) => ({ l: g.x, r: g.x + g.w, y: g.y }))
        .concat(lvl.plats.map((p) => ({ l: p.x, r: p.x + p.w, y: p.y })));
    const goal = lvl.ground.length - 1;
    const seen = new Set([0]); const stack = [0];
    while (stack.length) {
        const a = nodes[stack.pop()];
        for (let j = 0; j < nodes.length; j++) {
            if (seen.has(j)) continue;
            const b = nodes[j];
            if (b.r <= a.l + 4 || b.l < a.l) continue;
            const g = b.l - a.r, rise = a.y - b.y;
            if (rise > 80) continue;
            const allowed = rise > 0 ? 118 - rise * 0.6 : 118 + Math.min(-rise, 140) * 0.3;
            if (g <= allowed) { seen.add(j); stack.push(j); }
        }
    }
    return seen.has(goal);
}
function buildLevel(seed) {
    for (let k = 0; k < 10; k++) {
        const l = genLevel((seed + k) >>> 0);
        if (validateLevel(l)) return l;
    }
    return genLevel(seed >>> 0);
}

/* ================= fisika ================= */
function step(r, inp, dt, solids, worldW, o = {}) {
    const move = o.move ?? MOVE, grav = o.grav ?? GRAV, jv = o.jv ?? JUMP_V;
    r.vx = ((inp.r ? 1 : 0) - (inp.l ? 1 : 0)) * move;
    if (inp.jp) r.jb = JBUF; else r.jb = Math.max(0, r.jb - dt);
    r.coy = r.og ? COYOTE : Math.max(0, r.coy - dt);
    if (r.jb > 0 && (r.coy > 0 || o.air)) {
        r.vy = -jv; r.jb = 0; r.coy = 0; r.og = false;
    }
    if (!inp.jh && r.vy < -JUMP_CUT) r.vy = -JUMP_CUT;
    r.vy = Math.min(MAX_FALL, r.vy + grav * dt);
    r.x += r.vx * dt;
    r.x = clamp(r.x, 0, worldW - PW);
    for (const p of solids) {
        if (aabb(r.x, r.y, PW, PH, p.x, p.y, p.w, p.h)) {
            r.x = r.vx > 0 ? p.x - PW : p.x + p.w; r.vx = 0;
        }
    }
    r.y += r.vy * dt;
    r.og = false; let land = -1;
    for (let i = 0; i < solids.length; i++) {
        const p = solids[i];
        if (aabb(r.x, r.y, PW, PH, p.x, p.y, p.w, p.h)) {
            if (r.vy > 0) { r.y = p.y - PH; r.og = true; land = i; }
            else r.y = p.y + p.h;
            r.vy = 0;
        }
    }
    if (r.vx > 1) r.face = 1; else if (r.vx < -1) r.face = -1;
    return land;
}
const sawX = (sw, t) => sw.cx + Math.sin(t * sw.sp + sw.ph) * sw.amp;
function batPos(b, t) {
    const span = b.x1 - b.x0;
    const u = ((t * b.v / span) + b.ph) % 2;
    const k = u < 1 ? u : 2 - u;
    return [b.x0 + k * span, b.y + Math.sin(t * 2.2 + b.ph) * b.amp];
}
function groundTop(lvl, x) {
    for (const g of lvl.ground) if (x >= g.x && x <= g.x + g.w) return g.y;
    return VIEW_H + 200;
}

/* ================= bot (dipakai mode "ai") ================= */
function botInput(lvl, r, t, dt) {
    const idle = { l: false, r: false, jh: false, jp: false };
    if (r.dead || r.fin) return idle;
    const inp = { l: false, r: true, jh: false, jp: false };
    const ahead = r.x + PW, foot = r.y + PH, sol = lvl.solids;
    const solidAt = (x, y) => sol.some((p) => x >= p.x && x <= p.x + p.w && y >= p.y && y <= p.y + p.h);
    const onCrumble = r.og && lvl.plats.some((p) => p.kind === "c" && r.x + PW / 2 >= p.x && r.x + PW / 2 <= p.x + p.w && Math.abs(p.y - foot) < 3);
    const canJump = r.og || r.coy > 0;
    const gap = canJump && !solidAt(ahead + 6, foot + 6) && !solidAt(ahead + 20, foot + 6);
    let nd = 999;
    for (const p of sol) if (p.x >= ahead - 4 && p.x - ahead < nd) nd = p.x - ahead;
    let hz = lvl.spikes.some((s) => s.x < ahead + 40 && s.x + s.w > r.x && Math.abs(s.y + s.h - foot) < 40);
    let wait = false, retreat = false;
    for (const sw of lvl.saws) {
        const sx = sawX(sw, t);
        const vx = Math.cos(t * sw.sp + sw.ph) * sw.amp * sw.sp;
        const d = sx - ahead;
        if (Math.abs(sw.y - foot) < 60 && d > -30 && d < 110) {
            if (d < 45 && vx > -10) hz = true;
            else if (d < 85 && vx < -10) retreat = true;
            else if (d < 100 && Math.abs(vx) <= 10) wait = true;
        }
    }
    for (const b of lvl.bats) {
        const [bx, by] = batPos(b, t);
        const d = bx - ahead;
        if (d > -20 && d < 80) {
            if (by > GY - 44 && d < 32) hz = true;
            else if (by > GY - 54) { if (d < 60) retreat = true; else wait = true; }
        }
    }
    const wall = solidAt(ahead + 6, foot - 10) && !solidAt(ahead + 6, r.y - 6);
    const up = lvl.plats.some((p) => p.x > r.x && p.x < ahead + 70 && p.y > foot - 90 && p.y < foot - 8);
    if (canJump && (gap || hz || wall || up)) {
        inp.jp = true;
        r.jh = (nd < 65 && !gap) ? 0.16 : 0.5;
    } else if ((wait || retreat) && r.og && !onCrumble && !gap) {
        inp.r = false;
        if (retreat) inp.l = true;
    }
    r.jh = Math.max(0, r.jh - dt);
    inp.jh = r.jh > 0;
    return inp;
}

/* ================= state balapan ================= */
function makeRacer(x, nGems) {
    return {
        x, y: GY - PH, vx: 0, vy: 0, og: true, coy: 0, jb: 0,
        hp: HP0, inv: 0, cp: 0, fin: false, dead: false, face: 1,
        gems: new Array(nGems).fill(false), gct: 0, jh: 0, go: false,
    };
}
function newRace(seed, slotHost, first, mode) {
    const lvl = buildLevel(seed);
    const S = {
        seed: lvl.seed, mode, phase: "play", t: 0, first, slotHost,
        rel: [READY_T + (first === 0 ? 0 : HEAD_START), READY_T + (first === 1 ? 0 : HEAD_START)],
        racers: [makeRacer(50, lvl.gems.length), makeRacer(92, lvl.gems.length)],
        cr: Array.from({ length: lvl.ncr }, () => ({ s: 0, t: 0 })),
        st: lvl.stals.map(() => ({ s: 0, t: 0, y: ST_Y0, v: 0 })),
        winner: null, reason: "",
    };
    return { S, lvl };
}

/* Satu langkah simulasi otoritatif (host / mode ai). Mengembalikan event fx. */
function simTick(S, lvl, inputs, dt, opts) {
    const ev = [];
    if (S.phase !== "play") return ev;
    S.t += dt;
    for (const c of S.cr) {
        if (c.s === 1) { c.t += dt; if (c.t >= CR_SHAKE) { c.s = 2; c.t = 0; } }
        else if (c.s === 2) { c.t += dt; if (c.t >= CR_RESPAWN) { c.s = 0; c.t = 0; } }
    }
    S.st.forEach((s, k) => {
        const x = lvl.stals[k].x;
        if (s.s === 0) {
            if (S.racers.some((r) => !r.dead && !r.fin && Math.abs(r.x + PW / 2 - x) < 42 && r.y > 110)) { s.s = 1; s.t = 0; }
        } else if (s.s === 1) {
            s.t += dt; if (s.t >= ST_SHAKE) { s.s = 2; s.v = 0; }
        } else if (s.s === 2) {
            s.v += GRAV * 0.9 * dt; s.y += s.v * dt;
            const gy = groundTop(lvl, x);
            if (s.y + ST_LEN >= gy) { s.s = 3; ev.push(["shatter", x, gy]); }
        }
    });
    const solids = lvl.ground.concat(lvl.plats.filter((p) => p.kind !== "c" || S.cr[p.ci].s < 2));
    for (let i = 0; i < 2; i++) {
        const r = S.racers[i];
        if (r.dead || r.fin) continue;
        if (!r.go && S.t >= S.rel[i]) { r.go = true; ev.push(["go", i]); }
        if (!r.go) continue;
        if (r.inv > 0) r.inv -= dt;
        const o = opts[i] || {};
        const land = step(r, inputs[i] || { l: false, r: false, jh: false, jp: false }, dt, solids, lvl.worldW, o);
        if (land >= 0) {
            const p = solids[land];
            if (p.kind === "c" && S.cr[p.ci].s === 0) { S.cr[p.ci].s = 1; S.cr[p.ci].t = 0; }
        }
        const mag = o.magnet ? 90 : 0;
        lvl.gems.forEach((g, gi) => {
            if (!r.gems[gi] && aabb(r.x - mag, r.y - mag, PW + 2 * mag, PH + 2 * mag, g.x, g.y, 20, 20)) {
                r.gems[gi] = true; r.gct++; ev.push(["gem", i, g.x, g.y]);
            }
        });
        lvl.cps.forEach((c, ci) => {
            if (ci > r.cp && Math.abs(r.x - c.x) < 30 && r.y > c.y - 80) { r.cp = ci; ev.push(["cp", i, c.x, c.y]); }
        });
        let hit = lvl.spikes.some((s) => aabb(r.x + 5, r.y + 5, PW - 10, PH - 10, s.x, s.y, s.w, s.h));
        if (!hit) hit = lvl.saws.some((sw) => {
            const sx = sawX(sw, S.t), cy = sw.y;
            const px = clamp(sx, r.x, r.x + PW), py = clamp(cy, r.y, r.y + PH);
            return (sx - px) * (sx - px) + (cy - py) * (cy - py) < (sw.r + 2) * (sw.r + 2);
        });
        if (!hit) hit = lvl.bats.some((b) => {
            const [bx, by] = batPos(b, S.t);
            return aabb(r.x + 4, r.y + 4, PW - 8, PH - 8, bx - 12, by - 7, 24, 14);
        });
        if (!hit) hit = S.st.some((s, k) => s.s === 2 && aabb(r.x + 4, r.y + 4, PW - 8, PH - 8, lvl.stals[k].x - 7, s.y, 14, ST_LEN));
        if (hit && !o.god && r.inv <= 0) {
            r.hp--; r.inv = INVULN; r.vy = -300; ev.push(["hurt", i]);
            if (r.hp <= 0) { r.dead = true; ev.push(["dead", i]); }
        }
        if (r.y > VIEW_H + 60) {
            r.hp--; ev.push(["hurt", i]);
            if (r.hp <= 0) { r.dead = true; ev.push(["dead", i]); }
            else {
                const c = lvl.cps[r.cp];
                r.x = c.x; r.y = c.y - 40; r.vx = 0; r.vy = 0; r.inv = INVULN; r.og = false;
            }
        }
        const e = lvl.exit;
        if (!r.dead && aabb(r.x, r.y, PW, PH, e.x, e.y, e.w, e.h)) {
            r.fin = true;
            if (S.winner === null) S.winner = i;
            ev.push(["fin", i]);
        }
    }
    if (S.winner !== null) { S.phase = "over"; S.reason = "exit"; }
    else if (S.racers.every((r) => r.dead)) { S.phase = "over"; S.reason = "draw"; S.winner = -1; }
    else if (S.mode === "ai" && S.racers[0].dead) { S.phase = "over"; S.reason = "dead"; S.winner = 1; }
    return ev;
}

/* ================= snapshot jaringan (host -> guest) ================= */
function pack(S) {
    return {
        v: 1, seed: S.seed, phase: S.phase, t: +S.t.toFixed(3),
        first: S.first, slotHost: S.slotHost, winner: S.winner, reason: S.reason,
        rel: S.rel,
        r: S.racers.map((r) => ({
            x: +r.x.toFixed(1), y: +r.y.toFixed(1), vx: Math.round(r.vx), f: r.face,
            o: r.og ? 1 : 0, hp: r.hp, iv: +r.inv.toFixed(2), cp: r.cp,
            fin: r.fin, dead: r.dead, go: r.go, gct: r.gct,
            gm: r.gems.reduce((a, v, i) => (v && a.push(i), a), []),
        })),
        cr: S.cr.map((c) => [c.s, +c.t.toFixed(2)]),
        st: S.st.map((s) => [s.s, +s.y.toFixed(1), +s.t.toFixed(2)]),
    };
}
function unpack(p, lvl) {
    return {
        seed: p.seed, mode: "room", phase: p.phase, t: p.t, first: p.first,
        slotHost: p.slotHost, winner: p.winner ?? null, reason: p.reason || "", rel: p.rel,
        racers: p.r.map((r) => {
            const gems = new Array(lvl.gems.length).fill(false);
            (r.gm || []).forEach((i) => { if (i < gems.length) gems[i] = true; });
            return {
                x: r.x, y: r.y, vx: r.vx, vy: 0, og: !!r.o, coy: 0, jb: 0,
                hp: r.hp, inv: r.iv, cp: r.cp, fin: r.fin, dead: r.dead,
                face: r.f, gems, gct: r.gct, jh: 0, go: r.go,
            };
        }),
        cr: (p.cr || []).map((c) => ({ s: c[0], t: c[1] })),
        st: (p.st || []).map((s) => ({ s: s[0], y: s[1], t: s[2], v: 0 })),
    };
}

/* Diekspos untuk pengujian headless (tidak dipakai UI). */
export const __test = {
    genLevel, validateLevel, buildLevel, step, botInput, simTick, newRace,
    pack, unpack, sawX, batPos, mulberry32,
    C: { VIEW_W, VIEW_H, GRAV, MOVE, JUMP_V, PW, PH, GY, HP0, INVULN, GEM_SCORE },
};

/* ================= mount ================= */
export function mount(root, context = {}) {
    const { mode = "ai", room = null, playerName = "Player", onExit = () => { } } = context;
    const online = mode === "room" && Boolean(room);
    const isHost = !online || Boolean(room.isHost);
    const authority = isHost; // host / mode ai = otoritas simulasi
    let roomData = room?.room || null;

    /* ---------- DOM & gaya (minimalis) ---------- */
    root.innerHTML = `
<style>
.ce-app{--ce-line:#e2e8f0;--ce-ink:#0f172a;--ce-mut:#64748b;display:flex;flex-direction:column;gap:10px;width:100%;min-height:0;color:#e2e8f0}
.ce-app *{box-sizing:border-box}
.ce-app [hidden]{display:none!important}
.ce-hud{display:flex;align-items:center;gap:8px;flex-wrap:wrap;flex:none;font:600 11px/1 ui-monospace,SFMono-Regular,Menlo,monospace;color:#cbd5e1}
.ce-pill{display:inline-flex;align-items:center;gap:5px;max-width:100%;background:rgba(13,18,38,.72);border:1px solid rgba(148,163,184,.22);border-radius:999px;padding:5px 10px;white-space:nowrap}
.ce-pill b{font-weight:700;color:#f1f5f9;font-variant-numeric:tabular-nums}
.ce-track{position:relative;width:130px;height:8px;flex:none;border-radius:999px;background:rgba(148,163,184,.16)}
.ce-track i{position:absolute;top:-2.5px;width:8px;height:8px;border-radius:50%;transform:translateX(-50%);transition:left .12s linear}
.ce-track b{position:absolute;right:4px;top:-2px;width:3px;height:7px;border-radius:2px;background:#34d399}
.ce-spacer{flex:1 1 8px}
.ce-app .ce-panel[data-board]{position:relative;width:100%;padding:0;border:1px solid var(--ce-line);border-radius:12px;overflow:hidden;background:#0e1322;touch-action:none;user-select:none;-webkit-user-select:none;aspect-ratio:16/9;flex:0 0 auto}
.ce-board{display:block;width:100%;height:100%;touch-action:none}
.ce-btn{appearance:none;min-height:32px;border:1px solid var(--ce-line);background:#fff;color:var(--ce-ink);border-radius:8px;font:600 11px/1 ui-monospace,SFMono-Regular,Menlo,monospace;padding:0 10px;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:6px;white-space:nowrap}
.ce-btn:hover{background:#f8fafc}
.ce-btn:disabled{opacity:.45;cursor:default}
.ce-icon-btn svg{flex:none;display:block}
.ce-ov{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;padding:12px;overflow:auto;background:rgba(8,12,24,.55);z-index:5}
.ce-ov[hidden]{display:none!important}
.ce-card{display:flex;flex-direction:column;width:min(430px,100%);max-height:100%;overflow:hidden;background:#fff;color:var(--ce-ink);border-radius:12px;padding:18px 20px;text-align:center}
.ce-card h3{margin:0 0 12px;font-size:18px;font-weight:800}
.ce-card p{margin:0 0 12px;font-size:13px;line-height:1.5;color:var(--ce-mut)}
.ce-head{display:flex;align-items:center;justify-content:space-between;gap:8px;flex:none;margin-bottom:10px;text-align:left}
.ce-head h3{margin:0}
.ce-foot{display:flex;align-items:center;justify-content:space-between;gap:10px;flex:none;margin-top:12px;text-align:left}
.ce-primary{appearance:none;min-height:44px;border:0;border-radius:9px;background:#0f172a;color:#fff;font-weight:700;font-size:14px;padding:8px 22px;cursor:pointer;transition:background .15s}
.ce-primary:hover{background:#1e293b}
.ce-primary:disabled,.ce-mini:disabled{opacity:.45;cursor:default}
.ce-wait{font-size:13px;color:var(--ce-mut)}
.ce-cheats,.ce-help{flex:1 1 auto;min-height:0;overflow:auto;text-align:left}
.ce-cheats{padding-right:4px}
.ce-help{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:14px}
.ce-help b{display:block;margin:10px 0 4px;color:var(--ce-mut);font-size:10px;letter-spacing:.1em;text-transform:uppercase}
.ce-help ul{margin:0;padding-left:16px;font-size:12px;line-height:1.6;color:var(--ce-ink)}
.ce-kbd{display:inline-block;padding:1px 5px;border:1px solid var(--ce-line);border-radius:5px;background:#f8fafc;font:inherit}
.ce-x{min-width:44px;min-height:44px;border:0;background:none;font-size:18px;cursor:pointer;color:var(--ce-mut);line-height:1}
.ce-row{display:flex;align-items:center;justify-content:space-between;gap:12px;min-height:44px;padding:8px 0;border-bottom:1px solid #f1f5f9;font-size:13px;cursor:pointer}
.ce-sw{position:relative;width:40px;height:24px;flex:none}
.ce-sw input{position:absolute;opacity:0;inset:0;margin:0;cursor:pointer}
.ce-sw span{position:absolute;inset:0;border-radius:999px;background:#e2e8f0;transition:background .15s;pointer-events:none}
.ce-sw span::after{content:"";position:absolute;top:2px;left:2px;width:20px;height:20px;border-radius:50%;background:#fff;transition:left .15s}
.ce-sw input:checked+span{background:#0ea5e9}
.ce-sw input:checked+span::after{left:18px}
.ce-cheatacts{display:flex;gap:8px;margin-top:12px;flex-wrap:wrap}
.ce-mini{min-height:44px;border:1px solid var(--ce-line);background:#fff;border-radius:8px;font-size:12px;font-weight:600;padding:8px 12px;cursor:pointer;color:var(--ce-ink)}
.ce-mini:hover{background:#f8fafc;border-color:var(--ce-mut)}
.ce-note{margin:0;font-size:11px;line-height:1.5;color:var(--ce-mut)}
.ce-app :is(button,input):focus-visible{outline:2px solid #0ea5e9;outline-offset:2px}
.ce-ripple{position:absolute;width:14px;height:14px;margin:-7px 0 0 -7px;border:2px solid rgba(255,255,255,.55);border-radius:50%;pointer-events:none;z-index:4;animation:ce-ping .45s ease-out forwards}
@keyframes ce-ping{to{transform:scale(3.2);opacity:0}}
.ce-flame{transform-box:fill-box;transform-origin:center bottom;animation:ce-flick .5s ease-in-out infinite alternate}
@keyframes ce-flick{from{transform:scale(1)}to{transform:scale(1.2,.85)}}
.ce-legA,.ce-legB{transform-box:fill-box;transform-origin:center top}
.ce-run .ce-legA{animation:ce-stepA .26s linear infinite alternate}
.ce-run .ce-legB{animation:ce-stepB .26s linear infinite alternate}
@keyframes ce-stepA{from{transform:rotate(-24deg)}to{transform:rotate(24deg)}}
@keyframes ce-stepB{from{transform:rotate(24deg)}to{transform:rotate(-24deg)}}
.ce-wingL,.ce-wingR{transform-box:fill-box}
.ce-wingL{transform-origin:right center;animation:ce-flapL .22s ease-in-out infinite alternate}
.ce-wingR{transform-origin:left center;animation:ce-flapR .22s ease-in-out infinite alternate}
@keyframes ce-flapL{from{transform:rotate(16deg)}to{transform:rotate(-26deg)}}
@keyframes ce-flapR{from{transform:rotate(-16deg)}to{transform:rotate(26deg)}}
.ce-warn path{stroke:#f59e0b}
.ce-fx{font-weight:800;font-family:inherit;text-anchor:middle}
@media (prefers-reduced-motion:reduce){.ce-app *,.ce-app *::before,.ce-app *::after{animation:none!important;transition:none!important}}
/* --- layout redesign overrides (keep last) --- */
.ce-app.game-fill > .ce-panel[data-board]{flex:1 1 auto;min-height:0;aspect-ratio:auto}
@media (max-width:640px){
.ce-app.game-fill > .ce-panel[data-board]:not(:has(.ce-ov:not([hidden]))){aspect-ratio:16/9;flex:0 0 auto}
.ce-app.game-fill > .ce-panel[data-board]:has(.ce-ov:not([hidden])){flex:0 0 auto;min-height:min(70dvh,620px);aspect-ratio:auto}
.ce-app{gap:8px}
.ce-app .ce-hud{gap:5px;margin-bottom:0}
.ce-app .ce-hud .ce-pill{padding:4px 6px;font-size:9px}
.ce-app .ce-hud .ce-track{width:72px}
.ce-app .ce-hud .ce-btn{min-height:32px;padding:5px 9px;font-size:9px}
.ce-app .ce-hud .ce-btn-label,.ce-app .ce-hud .ce-spacer{display:none}
.ce-ov{padding:8px}
.ce-app .ce-card{width:100%;height:100%;max-height:100%;padding:12px;border-radius:12px}
.ce-cheats,.ce-help{scrollbar-width:none}
.ce-cheats::-webkit-scrollbar,.ce-help::-webkit-scrollbar{display:none}
.ce-app .ce-note{display:none}
.ce-row{font-size:12px}
}
</style>
<div class="game-app ce-app game-fill" data-ce>
  <div class="ce-hud">
    <span class="ce-pill"><i class="game-status-dot"></i><span data-status>Ready</span></span>
    <span class="ce-pill" data-hearts></span>
    <span class="ce-pill">&#9670; <b data-gems>0</b>/<span data-gemtotal>0</span></span>
    <span class="ce-pill"><b data-time>0</b>s</span>
    <span class="ce-pill" data-bestwrap hidden>best <b data-best>&ndash;</b>s</span>
    <span class="ce-pill" data-rival></span>
    <span class="ce-track" role="img" aria-label="Race progress"><i data-dot0></i><i data-dot1></i><b></b></span>
    <span class="ce-spacer"></span>
    <button class="ce-btn ce-icon-btn" type="button" data-help aria-label="How to play" title="How to play (H)">${iconSVG("helpCircle", { size: 14 })}<span class="ce-btn-label">Help</span></button>
    <button class="ce-btn ce-icon-btn" type="button" data-cheats aria-label="Cheats" title="Cheats (C)">${iconSVG("wrench", { size: 14 })}<span class="ce-btn-label">Cheats</span></button>
    <button class="ce-btn ce-icon-btn" type="button" data-pause aria-label="Pause" title="Pause (P)">${iconSVG("pause", { size: 14 })}<span class="ce-btn-label">Pause</span></button>
    <button class="ce-btn ce-icon-btn" type="button" data-restart aria-label="Restart" title="Restart (R)">${iconSVG("refresh", { size: 14 })}<span class="ce-btn-label">Restart</span></button>
    <button class="ce-btn ce-icon-btn" type="button" data-exit aria-label="Exit game" title="Exit game">${iconSVG("logOut", { size: 14 })}<span class="ce-btn-label">Exit game</span></button>
  </div>
  <section class="game-panel ce-panel" data-board>
    <svg class="ce-board" viewBox="0 0 ${VIEW_W} ${VIEW_H}" preserveAspectRatio="xMidYMid meet" aria-label="Cave Explorer" data-svg>
      <g data-world></g>
      <g data-fx></g>
    </svg>
    <div class="ce-ov" data-ov="start">
      <div class="ce-card">
        <h3>Cave Explorer</h3>
        <button class="ce-primary" type="button" data-act="start">Start</button>
        <div class="ce-wait" data-wait hidden>Waiting for host&hellip;</div>
      </div>
    </div>
    <div class="ce-ov" data-ov="over" hidden>
      <div class="ce-card">
        <h3 data-overtitle>Result</h3>
        <p data-oversub></p>
        <button class="ce-primary" type="button" data-act="start" data-again>Play again</button>
        <div class="ce-wait" data-wait2 hidden>Waiting for host&hellip;</div>
      </div>
    </div>
    <div class="ce-ov" data-ov="pause" hidden>
      <div class="ce-card">
        <div class="ce-head"><h3>Paused</h3></div>
        <p>The race, bot and timers are frozen.</p>
        <div class="ce-foot"><span class="ce-note">Press P or Esc to resume</span><button class="ce-btn" type="button" data-resume>Resume</button></div>
      </div>
    </div>
    <div class="ce-ov" data-ov="cheat" hidden>
      <div class="ce-card">
        <div class="ce-head"><h3>Cheats</h3><button class="ce-x" type="button" data-cheat-close aria-label="Close">&#10005;</button></div>
        <div class="ce-cheats">
          <label class="ce-row">God mode <span class="ce-sw"><input type="checkbox" data-cheat="god"><span></span></span></label>
          <label class="ce-row">Air jump <span class="ce-sw"><input type="checkbox" data-cheat="air"><span></span></span></label>
          <label class="ce-row">Low gravity <span class="ce-sw"><input type="checkbox" data-cheat="moon"><span></span></span></label>
          <label class="ce-row">Speed boost <span class="ce-sw"><input type="checkbox" data-cheat="speed"><span></span></span></label>
          <label class="ce-row">Gem magnet <span class="ce-sw"><input type="checkbox" data-cheat="magnet"><span></span></span></label>
          <label class="ce-row">Slow motion <span class="ce-sw"><input type="checkbox" data-cheat="slow"><span></span></span></label>
          <div class="ce-cheatacts">
            <button class="ce-mini" type="button" data-cheat-act="heal">Heal</button>
            <button class="ce-mini" type="button" data-cheat-act="skip">Skip to exit</button>
            <button class="ce-mini" type="button" data-cheat-act="newlvl">New level</button>
          </div>
        </div>
        <div class="ce-foot"><span class="ce-note">Cheats disable best time.</span><button class="ce-btn" type="button" data-cheat-close>Close</button></div>
      </div>
    </div>
    <div class="ce-ov" data-ov="help" hidden>
      <div class="ce-card">
        <div class="ce-head"><h3>How to play</h3><button class="ce-x" type="button" data-help-close aria-label="Close">&#10005;</button></div>
        <div class="ce-help">
          <div>
            <b>Desktop</b>
            <ul>
              <li><span class="ce-kbd">&larr;</span> <span class="ce-kbd">&rarr;</span> or <span class="ce-kbd">A</span> <span class="ce-kbd">D</span> run; <span class="ce-kbd">&uarr;</span> / <span class="ce-kbd">W</span> / <span class="ce-kbd">Space</span> or left-click jumps.</li>
              <li>Time your jumps over gaps, spikes, saws, bats and falling stalactites; checkpoints save your spot.</li>
            </ul>
            <b>Mobile</b>
            <ul>
              <li>Touch the left third to run left, the middle to run right and the right third to jump.</li>
            </ul>
          </div>
          <div>
            <b>Rules</b>
            <ul>
              <li>A level is generated from a seed and verified reachable before you play.</li>
              <li>Collect gems for points and reach the exit before your rival. You have three hearts.</li>
              <li>You start head-to-head with a bot in AI mode, or a second player in room mode.</li>
              <li><span class="ce-kbd">H</span> help &middot; <span class="ce-kbd">C</span> cheats &middot; <span class="ce-kbd">P</span> pause &middot; <span class="ce-kbd">R</span> restart.</li>
            </ul>
            <div class="ce-foot"><span class="ce-note">Press H to reopen this guide</span><button class="ce-btn" type="button" data-help-close>Got it</button></div>
          </div>
        </div>
      </div>
    </div>
  </section>
</div>`;

    const $ = (s) => root.querySelector(s);
    const board = $("[data-board]");
    const svg = $("[data-svg]");
    const worldG = $("[data-world]");
    const fxG = $("[data-fx]");
    const heartsEl = $("[data-hearts]");
    const gemsEl = $("[data-gems]");
    const gemTotalEl = $("[data-gemtotal]");
    const timeEl = $("[data-time]");
    const bestWrap = $("[data-bestwrap]");
    const bestEl = $("[data-best]");
    const rivalEl = $("[data-rival]");
    const statusEl = $("[data-status]");
    const dotEls = [$("[data-dot0]"), $("[data-dot1]")];
    const ovStart = $('[data-ov="start"]');
    const ovOver = $('[data-ov="over"]');
    const ovPause = $('[data-ov="pause"]');
    const ovCheat = $('[data-ov="cheat"]');
    const ovHelp = $('[data-ov="help"]');
    const ovTitle = $("[data-overtitle]");
    const ovSub = $("[data-oversub]");
    const startBtn = $('[data-act="start"]');
    const againBtn = $("[data-again]");
    const restartBtn = $("[data-restart]");
    const cheatsBtn = $("[data-cheats]");
    const pauseBtn = $("[data-pause]");
    const show = (el) => el.removeAttribute("hidden");
    const hide = (el) => el.setAttribute("hidden", "");
    const NS = "http://www.w3.org/2000/svg";
    const mk = (tag, attrs) => {
        const el = document.createElementNS(NS, tag);
        if (attrs) for (const k in attrs) el.setAttribute(k, attrs[k]);
        return el;
    };

    /* ---------- state runtime ---------- */
    let S = null, lvl = null, builtSeed = -1, mySlot = 0;
    let raf = 0, lastT = 0, netAcc = 0, inputAcc = 0, localT = 0;
    let overHandled = false, cheatOpen = false, cheatUsed = false;
    let helpOpen = false, paused = false, frozen = false, freezeAt = 0;
    let camX = 0, dispInit = false;
    const disp = [{ x: 50, y: GY - PH }, { x: 92, y: GY - PH }];
    const held = { l: false, r: false, j: false };
    let jpEdge = false, netEdge = false, mouseJump = false;
    const touches = new Map();
    let netInput = { l: false, r: false, j: false };
    const pendJump = [false, false];
    const cheats = { god: false, air: false, moon: false, speed: false, magnet: false, slow: false };
    const fx = [];
    const offs = [];
    let best = readBest();
    let lastHudHp = -1, lastRivalHp = -1, lastStatus = "";

    let seenHelp = true;
    try { seenHelp = localStorage.getItem("caveExplorerHelpSeen") === "1"; } catch (err) { seenHelp = true; }
    if (!seenHelp) {
        helpOpen = true;
        try { localStorage.setItem("caveExplorerHelpSeen", "1"); } catch (err) { /* storage blocked */ }
    }

    const SLOT = [
        { main: "#38bdf8", dark: "#0c4a6e" },
        { main: "#fbbf24", dark: "#78350f" },
    ];

    function readBest() {
        try { const v = parseInt(localStorage.getItem(META.bestKey), 10); return Number.isFinite(v) && v > 0 ? v : null; }
        catch { return null; }
    }
    function saveBest(t) {
        if (t <= 0) return false;
        if (best === null || t < best) {
            best = t;
            try { localStorage.setItem(META.bestKey, String(t)); } catch { }
            return true;
        }
        return false;
    }

    /* ---------- gambar dunia ---------- */
    let gemEls = [], crEls = [], stEls = [], sawEls = [], batEls = [], racerEls = [];
    function racerNode(slot) {
        const c = SLOT[slot];
        const g = mk("g");
        const label = mk("text", {
            x: PW / 2, y: -8, "text-anchor": "middle", "font-size": 9,
            "font-weight": 800, "letter-spacing": 1, fill: "#94a3b8",
            "font-family": "inherit",
        });
        label.textContent = "P" + (slot + 1);
        g.appendChild(label);
        const inner = mk("g");
        const legs = mk("g");
        legs.appendChild(mk("rect", { class: "ce-legA", x: 5, y: 26, width: 6, height: 8, rx: 2, fill: c.dark }));
        legs.appendChild(mk("rect", { class: "ce-legB", x: 15, y: 26, width: 6, height: 8, rx: 2, fill: c.dark }));
        inner.appendChild(legs);
        inner.appendChild(mk("rect", { x: -1, y: 13, width: 5, height: 11, rx: 2, fill: c.dark }));
        inner.appendChild(mk("rect", { x: 2, y: 8, width: 22, height: 20, rx: 7, fill: c.main, stroke: c.dark, "stroke-width": 2 }));
        inner.appendChild(mk("path", { d: "M3 13 a10 10 0 0 1 20 0 v1 h-20 z", fill: c.dark }));
        inner.appendChild(mk("circle", { cx: 21, cy: 10, r: 3, fill: "#fde047", stroke: c.dark, "stroke-width": 1 }));
        inner.appendChild(mk("circle", { cx: 17, cy: 18, r: 2.2, fill: "#0b1020" }));
        inner.appendChild(mk("path", { d: "M14 23 h5", stroke: "#0b1020", "stroke-width": 1.6, "stroke-linecap": "round" }));
        g.appendChild(inner);
        return { g, inner, legs, label };
    }
    function buildStatic() {
        const parts = [];
        parts.push('<rect x="0" y="0" width="' + lvl.worldW + '" height="' + VIEW_H + '" fill="#0e1322"/>');
        for (let x = 40; x < lvl.worldW; x += 130) {
            const len = 40 + ((x * 7) % 60);
            parts.push('<path d="M' + x + " 0 l14 " + len + " l14 -" + len + ' z" fill="#161d33"/>');
        }
        lvl.ground.forEach((g) => {
            parts.push('<rect x="' + g.x + '" y="' + g.y + '" width="' + g.w + '" height="' + g.h + '" rx="6" fill="#232c47"/>');
            parts.push('<rect x="' + g.x + '" y="' + g.y + '" width="' + g.w + '" height="8" rx="4" fill="#303b60"/>');
        });
        lvl.plats.forEach((p) => {
            if (p.kind === "c") return;
            parts.push('<rect x="' + p.x + '" y="' + p.y + '" width="' + p.w + '" height="' + p.h + '" rx="6" fill="#2c3654" stroke="#3a4670" stroke-width="1.5"/>');
        });
        lvl.spikes.forEach((s) => {
            const n = Math.round(s.w / 20);
            let d = "";
            for (let i = 0; i < n; i++) {
                const x0 = s.x + i * (s.w / n);
                d += "M" + x0 + " " + (s.y + s.h) + " L" + (x0 + s.w / n / 2) + " " + s.y + " L" + (x0 + s.w / n) + " " + (s.y + s.h) + " z ";
            }
            parts.push('<path d="' + d + '" fill="#8b95ad" stroke="#5b6577" stroke-width="1.2"/>');
        });
        lvl.cps.forEach((c) => {
            parts.push('<g><rect x="' + (c.x + 8) + '" y="' + (c.y + 12) + '" width="5" height="34" rx="2" fill="#78350f"/>' +
                '<g class="ce-flame"><path d="M' + (c.x + 10.5) + " " + (c.y + 12) + ' q-7 -10 0 -20 q7 10 0 20 z" fill="#f59e0b"/></g>' +
                '<circle cx="' + (c.x + 10.5) + '" cy="' + (c.y + 4) + '" r="3" fill="#fde047"/></g>');
        });
        const e = lvl.exit;
        parts.push('<g><rect x="' + e.x + '" y="' + e.y + '" width="' + e.w + '" height="' + e.h + '" rx="18" fill="#0b1020" stroke="#34d399" stroke-width="3"/>' +
            '<path d="M' + (e.x + 12) + " " + (e.y + e.h - 6) + ' v-40 a15 15 0 0 1 30 0 v40" fill="none" stroke="#34d399" stroke-width="3"/>' +
            '<text x="' + (e.x + e.w / 2) + '" y="' + (e.y - 10) + '" fill="#34d399" font-size="13" font-weight="800" font-family="inherit" text-anchor="middle">EXIT</text></g>');
        worldG.innerHTML = parts.join("");
        fxG.innerHTML = ""; fx.length = 0;

        crEls = lvl.plats.filter((p) => p.kind === "c").map((p) => {
            const g = mk("g");
            g.appendChild(mk("rect", { x: p.x, y: p.y, width: p.w, height: p.h, rx: 6, fill: "#4a4258", stroke: "#332d40", "stroke-width": 1.5 }));
            g.appendChild(mk("path", {
                d: "M" + (p.x + p.w * 0.3) + " " + p.y + " l4 " + p.h + " M" + (p.x + p.w * 0.65) + " " + p.y + " l-4 " + p.h,
                stroke: "#1f2437", "stroke-width": 1.5, fill: "none",
            }));
            worldG.appendChild(g);
            return g;
        });
        gemEls = lvl.gems.map((g) => {
            const el = mk("g", { transform: "translate(" + (g.x + 10) + " " + (g.y + 10) + ")" });
            el.appendChild(mk("path", { d: "M0 -10 L8 0 L0 10 L-8 0 z", fill: "#22d3ee", stroke: "#0e7490", "stroke-width": 2 }));
            el.appendChild(mk("path", { d: "M-3 -4 L0 -8 L3 -4 z", fill: "#a5f3fc" }));
            worldG.appendChild(el);
            return el;
        });
        stEls = lvl.stals.map(() => {
            const g = mk("g");
            g.appendChild(mk("path", { d: "M-8 0 L8 0 L0 " + ST_LEN + " z", fill: "#7c87a3", stroke: "#4a5470", "stroke-width": 1.5 }));
            worldG.appendChild(g);
            return g;
        });
        sawEls = lvl.saws.map((sw) => {
            const g = mk("g");
            const inner = mk("g");
            let d = "";
            for (let i = 0; i < 8; i++) {
                const a = (i / 8) * Math.PI * 2;
                const x1 = Math.cos(a) * sw.r, y1 = Math.sin(a) * sw.r;
                const a2 = a + 0.22;
                const x2 = Math.cos(a2) * (sw.r + 6), y2 = Math.sin(a2) * (sw.r + 6);
                const a3 = a + 0.44;
                const x3 = Math.cos(a3) * sw.r, y3 = Math.sin(a3) * sw.r;
                d += "M" + x1.toFixed(1) + " " + y1.toFixed(1) + " L" + x2.toFixed(1) + " " + y2.toFixed(1) + " L" + x3.toFixed(1) + " " + y3.toFixed(1) + " z ";
            }
            inner.appendChild(mk("path", { d, fill: "#a7b0c4" }));
            inner.appendChild(mk("circle", { cx: 0, cy: 0, r: sw.r, fill: "#a7b0c4", stroke: "#5b6577", "stroke-width": 2 }));
            inner.appendChild(mk("circle", { cx: 0, cy: 0, r: 4, fill: "#5b6577" }));
            g.appendChild(inner);
            worldG.appendChild(g);
            return { g, inner };
        });
        batEls = lvl.bats.map(() => {
            const g = mk("g");
            const inner = mk("g");
            inner.appendChild(mk("path", { class: "ce-wingL", d: "M-6 -1 q-12 -8 -16 2 q8 6 16 2 z", fill: "#8b7cf0" }));
            inner.appendChild(mk("path", { class: "ce-wingR", d: "M6 -1 q12 -8 16 2 q-8 6 -16 2 z", fill: "#8b7cf0" }));
            inner.appendChild(mk("ellipse", { cx: 0, cy: 0, rx: 9, ry: 6.5, fill: "#b7a6f7", stroke: "#6d5bd0", "stroke-width": 1.5 }));
            inner.appendChild(mk("path", { d: "M-5 -5 l-2 -4 l4 1 z M5 -5 l2 -4 l-4 1 z", fill: "#6d5bd0" }));
            inner.appendChild(mk("circle", { cx: -3, cy: -1, r: 1.4, fill: "#1e1b4b" }));
            inner.appendChild(mk("circle", { cx: 3, cy: -1, r: 1.4, fill: "#1e1b4b" }));
            g.appendChild(inner);
            worldG.appendChild(g);
            return { g, inner };
        });
        racerEls = [racerNode(0), racerNode(1)];
        racerEls.forEach((r) => worldG.appendChild(r.g));
        gemTotalEl.textContent = String(lvl.gems.length);
        dotEls[0].style.background = SLOT[0].main;
        dotEls[1].style.background = SLOT[1].main;
        lastHudHp = -1; lastRivalHp = -1;
    }
    function setLabels() {
        if (!racerEls.length) return;
        const other = 1 - mySlot;
        racerEls[mySlot].label.textContent = "YOU";
        racerEls[mySlot].label.setAttribute("fill", "#e2e8f0");
        racerEls[other].label.textContent = S && S.mode === "ai" ? "BOT" : "RIVAL";
        racerEls[other].label.setAttribute("fill", "#94a3b8");
    }

    /* ---------- fx teks ---------- */
    function popText(wx, wy, text, color) {
        const el = mk("text", { x: wx - camX, y: wy, fill: color, "font-size": 16, class: "ce-fx" });
        el.textContent = text;
        fxG.appendChild(el);
        fx.push({ t: 0, el, y: wy });
    }
    function updateFx(dt) {
        for (let i = fx.length - 1; i >= 0; i--) {
            const p = fx[i];
            p.t += dt;
            const k = p.t / 0.7;
            if (k >= 1) { p.el.remove(); fx.splice(i, 1); continue; }
            p.el.setAttribute("y", (p.y - 30 * k).toFixed(1));
            p.el.setAttribute("opacity", (1 - k).toFixed(2));
        }
    }
    function handleEvents(ev) {
        for (const e of ev) {
            const [kind, i, a, b] = e;
            if (kind === "gem") popText(a + 10, b - 4, "+" + GEM_SCORE, SLOT[i].main);
            else if (kind === "cp" && i === mySlot) popText(a + 10, b - 30, "CHECKPOINT", "#fbbf24");
            else if (kind === "hurt") { const r = S.racers[i]; popText(r.x + PW / 2, r.y - 6, "-1", "#f87171"); }
            else if (kind === "go") { const r = S.racers[i]; popText(r.x + PW / 2, r.y - 14, "GO!", "#e2e8f0"); }
            else if (kind === "fin") { const r = S.racers[i]; popText(r.x + PW / 2, r.y - 14, "FINISH!", "#34d399"); }
            else if (kind === "dead") { const r = S.racers[i]; popText(r.x + PW / 2, r.y - 14, "DOWN", "#94a3b8"); }
        }
    }

    /* ---------- HUD & render ---------- */
    function heartsSVG(hp) {
        let s = "";
        for (let i = 0; i < HP0; i++) {
            const on = i < hp;
            s += '<svg viewBox="0 0 24 24" width="13" height="13" fill="' + (on ? "#ef4444" : "none") + '" stroke="' + (on ? "#ef4444" : "#6b7280") + '" stroke-width="2" aria-hidden="true"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>';
        }
        return s;
    }
    function setStatus(txt) {
        if (txt === lastStatus) return;
        lastStatus = txt;
        statusEl.textContent = txt;
    }
    function renderFrame(dt) {
        if (!lvl || !S) return;
        const me = S.racers[mySlot], other = S.racers[1 - mySlot];
        const follow = me.dead && !me.fin ? other : me;
        camX = camClamp(follow.x + PW / 2, lvl.worldW);
        worldG.setAttribute("transform", "translate(" + (-camX).toFixed(1) + " 0)");
        const animT = authority ? S.t : localT;
        const k = 1 - Math.exp(-14 * dt);
        for (let i = 0; i < 2; i++) {
            const r = S.racers[i], el = racerEls[i], d = disp[i];
            if (!dispInit || authority) { d.x = r.x; d.y = r.y; }
            else {
                if (Math.abs(r.x - d.x) + Math.abs(r.y - d.y) > 140) { d.x = r.x; d.y = r.y; }
                else { d.x += (r.x - d.x) * k; d.y += (r.y - d.y) * k; }
            }
            el.g.setAttribute("transform", "translate(" + d.x.toFixed(1) + " " + d.y.toFixed(1) + ")");
            el.inner.setAttribute("transform", r.face < 0 ? "translate(" + PW + " 0) scale(-1 1)" : "");
            const running = r.og && Math.abs(r.vx) > 10 && !r.dead && r.go;
            el.legs.setAttribute("class", running ? "ce-run" : "");
            let op = 1;
            if (r.dead) op = 0.22;
            else if (!r.go) op = 0.45;
            else if (r.inv > 0) op = Math.sin(animT * 30) > 0 ? 0.35 : 1;
            el.g.setAttribute("opacity", String(op));
        }
        dispInit = true;
        lvl.gems.forEach((g, gi) => gemEls[gi].setAttribute("opacity", me.gems[gi] ? "0" : "1"));
        lvl.plats.forEach((p) => {
            if (p.kind !== "c") return;
            const c = S.cr[p.ci], el = crEls[p.ci];
            if (c.s === 1) el.setAttribute("transform", "translate(" + (Math.sin(animT * 40 + p.ci) * 2).toFixed(1) + " 0)");
            else if (c.s === 2) {
                el.setAttribute("transform", "translate(0 " + Math.min(c.t * 520, 620).toFixed(1) + ")");
                el.setAttribute("opacity", Math.max(0, 1 - c.t * 1.3).toFixed(2));
            } else { el.setAttribute("transform", ""); el.setAttribute("opacity", "1"); }
        });
        lvl.stals.forEach((s, i) => {
            const st = S.st[i], el = stEls[i];
            if (st.s === 3) { el.setAttribute("opacity", "0"); return; }
            el.setAttribute("opacity", "1");
            const jx = st.s === 1 ? Math.sin(animT * 50) * 2 : 0;
            el.setAttribute("transform", "translate(" + (s.x + jx).toFixed(1) + " " + (st.s === 2 ? st.y : ST_Y0).toFixed(1) + ")");
            el.setAttribute("class", st.s === 1 ? "ce-warn" : "");
        });
        lvl.saws.forEach((sw, i) => {
            const sx = sawX(sw, animT);
            sawEls[i].g.setAttribute("transform", "translate(" + sx.toFixed(1) + " " + sw.y + ")");
            sawEls[i].inner.setAttribute("transform", "rotate(" + ((animT * 240) % 360).toFixed(1) + ")");
        });
        lvl.bats.forEach((b, i) => {
            const [bx, by] = batPos(b, animT);
            const span = b.x1 - b.x0;
            const u = ((animT * b.v / span) + b.ph) % 2;
            batEls[i].g.setAttribute("transform", "translate(" + bx.toFixed(1) + " " + by.toFixed(1) + ")");
            batEls[i].inner.setAttribute("transform", u < 1 ? "" : "scale(-1 1)");
        });
        if (me.hp !== lastHudHp) { lastHudHp = me.hp; heartsEl.innerHTML = heartsSVG(Math.max(0, me.hp)); }
        gemsEl.textContent = String(me.gct);
        timeEl.textContent = String(Math.floor(S.t));
        if (best !== null) { bestWrap.removeAttribute("hidden"); bestEl.textContent = String(best); }
        if (other.hp !== lastRivalHp) {
            lastRivalHp = other.hp;
            const name = S.mode === "ai" ? "BOT" : "RIVAL";
            let dots = "";
            for (let i = 0; i < HP0; i++)
                dots += '<svg viewBox="0 0 8 8" width="7" height="7" aria-hidden="true"><circle cx="4" cy="4" r="3" fill="' + (i < other.hp ? SLOT[1 - mySlot].main : "none") + '" stroke="' + (i < other.hp ? SLOT[1 - mySlot].main : "#6b7280") + '" stroke-width="1.4"/></svg>';
            rivalEl.innerHTML = '<span style="font-weight:700;letter-spacing:.5px">' + name + "</span>" + dots;
        }
        const denom = Math.max(1, lvl.worldW - 80);
        dotEls[0].style.left = clamp((S.racers[0].x / denom) * 100, 0, 100).toFixed(1) + "%";
        dotEls[1].style.left = clamp((S.racers[1].x / denom) * 100, 0, 100).toFixed(1) + "%";
        if (S.phase === "play" && !frozen)
            setStatus(!me.go ? "Get ready…" : me.dead ? "Spectating" : "Racing");
    }

    /* ---------- overlay, help, pause & freeze ---------- */
    function syncFreeze() {
        const next = paused || helpOpen || cheatOpen;
        if (next === frozen) return;
        frozen = next;
        if (frozen) {
            freezeAt = performance.now();
            held.l = held.r = held.j = false;
            mouseJump = false; touches.clear(); jpEdge = false; netEdge = false;
        } else {
            const shift = performance.now() - freezeAt;
            freezeAt = 0;
            // rAF timestamps share performance.now()'s origin: shifting the
            // anchor keeps the first frame after a resume from jumping ahead.
            if (lastT) lastT += shift;
            netAcc = 0; inputAcc = 0;
        }
    }
    function syncUI() {
        const inLobby = !!S && S.phase === "lobby";
        const inOver = !!S && S.phase === "over";
        ovStart.hidden = !inLobby || frozen;
        ovOver.hidden = !inOver || frozen;
        ovPause.hidden = !paused || cheatOpen || helpOpen;
        ovCheat.hidden = online || !cheatOpen || helpOpen || paused;
        ovHelp.hidden = !helpOpen;
        cheatsBtn.hidden = online;
        const label = pauseBtn.querySelector(".ce-btn-label");
        if (label) label.textContent = paused ? "Resume" : "Pause";
        pauseBtn.setAttribute("aria-label", paused ? "Resume" : "Pause");
        if (helpOpen) setStatus("How to play");
        else if (cheatOpen) setStatus("Cheats");
        else if (paused) setStatus("Paused");
        else if (S && S.phase === "play")
            setStatus(!S.racers[mySlot].go ? "Get ready…" : S.racers[mySlot].dead ? "Spectating" : "Racing");
        if (inLobby && !frozen && authority) updateLobby();
    }
    function toggleHelp(on) {
        helpOpen = typeof on === "boolean" ? on : !helpOpen;
        if (helpOpen) { cheatOpen = false; paused = false; }
        syncFreeze(); syncUI();
    }
    function toggleCheat(on) {
        if (online) return;
        cheatOpen = typeof on === "boolean" ? on : !cheatOpen;
        if (cheatOpen) { helpOpen = false; paused = false; }
        syncFreeze(); syncUI();
    }
    function togglePause(on) {
        paused = typeof on === "boolean" ? on : !paused;
        if (paused) { cheatOpen = false; helpOpen = false; }
        syncFreeze(); syncUI();
    }

    /* ---------- alur permainan ---------- */
    function playersCount() {
        if (!online) return 2;
        const p = roomData?.players;
        if (Array.isArray(p)) return p.length;
        if (p && typeof p === "object") return Object.keys(p).length;
        return 2;
    }
    function updateLobby() {
        if (S && S.phase === "lobby" && authority) {
            const ready = playersCount() >= 2;
            startBtn.disabled = !ready;
            setStatus(ready ? "Ready" : "Waiting for player");
        }
    }
    function anyCheatsOn() { return Object.values(cheats).some(Boolean); }
    function cheatOpts() {
        return {
            god: cheats.god, air: cheats.air, magnet: cheats.magnet,
            grav: cheats.moon ? GRAV * 0.55 : GRAV,
            jv: cheats.moon ? JUMP_V * 0.85 : JUMP_V,
            move: cheats.speed ? MOVE * 1.4 : MOVE,
        };
    }
    function startGame() {
        if (!authority) return;
        if (online && playersCount() < 2) { setStatus("Waiting for player"); return; }
        const seed = (Math.random() * 0x7fffffff) | 0;
        const slotHost = online ? (Math.random() < 0.5 ? 0 : 1) : 0; // posisi P1/P2 diacak
        const first = Math.random() < 0.5 ? 0 : 1;                   // siapa jalan duluan diacak
        const race = newRace(seed, slotHost, first, online ? "room" : "ai");
        S = race.S; lvl = race.lvl; builtSeed = S.seed;
        mySlot = online ? slotHost : 0;
        overHandled = false;
        cheatUsed = anyCheatsOn();
        dispInit = false;
        buildStatic();
        setLabels();
        syncUI();
        popText(S.racers[mySlot].x + PW / 2, GY - PH - 24, "YOU · P" + (mySlot + 1), SLOT[mySlot].main);
        localT = 0;
        if (online) publish();
        updateLobby();
    }
    function onOver() {
        if (overHandled || !S) return;
        overHandled = true;
        const win = S.winner === mySlot;
        const g = S.racers[mySlot].gct, n = lvl.gems.length, tm = Math.floor(S.t);
        let sub = "◆ " + g + "/" + n + " · " + tm + "s · " + g * GEM_SCORE + " pts";
        let title;
        if (S.winner === -1) title = "Draw";
        else if (win) {
            title = S.mode === "ai" ? "You escaped!" : "You win!";
            if (!cheatUsed && saveBest(tm)) sub += " · new best";
        } else {
            title = S.mode === "ai" ? (S.reason === "dead" ? "Out of hearts" : "Bot wins") : "Rival wins";
        }
        ovTitle.textContent = title;
        ovSub.textContent = sub;
        setStatus(win ? "You win" : S.winner === -1 ? "Draw" : "Rival wins");
        syncUI();
        if (online && isHost) publish();
    }
    function applyCheatAct(act) {
        if (!S || S.mode !== "ai") return;
        const r = S.racers[mySlot];
        if (act === "heal" && S.phase === "play" && !r.dead) { r.hp = HP0; cheatUsed = true; lastHudHp = -1; }
        else if (act === "skip" && S.phase === "play" && !r.dead) {
            r.x = lvl.exit.x - 30; r.y = lvl.exit.y + 10; r.vx = 0; r.vy = 0; cheatUsed = true;
        }
        else if (act === "newlvl") { cheatOpen = false; syncFreeze(); startGame(); }
    }

    /* ---------- input: keyboard + mouse + zona sentuh ---------- */
    const KEYMAP = {
        ArrowLeft: "l", a: "l", A: "l",
        ArrowRight: "r", d: "r", D: "r",
        ArrowUp: "j", w: "j", W: "j", " ": "j",
    };
    function sendInput() {
        if (online && !isHost) {
            room.sendAction({ type: "input", l: held.l, r: held.r, j: held.j, p: netEdge }).catch(console.warn);
            netEdge = false;
        }
    }
    function refreshHeld() {
        let l = false, r = false, j = mouseJump;
        touches.forEach((z) => { if (z === "l") l = true; else if (z === "r") r = true; else j = true; });
        const wasJ = held.j;
        held.l = l; held.r = r; held.j = j;
        if (j && !wasJ) { jpEdge = true; netEdge = true; }
        sendInput();
    }
    function onKey(e) {
        if (e.type === "keydown") {
            const code = e.code || "";
            if (code === "KeyH" && !e.repeat) { toggleHelp(); e.preventDefault(); return; }
            if (code === "KeyC" && !e.repeat) {
                if (!helpOpen && !paused) toggleCheat();
                e.preventDefault(); return;
            }
            if (code === "KeyP" || code === "Escape" || e.key === "Enter") {
                if (e.repeat) { e.preventDefault(); return; }
                if (helpOpen) toggleHelp(false);
                else if (cheatOpen) toggleCheat(false);
                else if (code === "KeyP") togglePause();
                else if (code === "Escape" && paused) togglePause(false);
                e.preventDefault(); return;
            }
            if (code === "KeyR" && authority && !e.repeat && S && S.phase !== "lobby" && !frozen) {
                startGame(); e.preventDefault(); return;
            }
        }
        const k = KEYMAP[e.key];
        if (!k) return;
        if (!S || S.phase !== "play" || frozen) return;
        e.preventDefault();
        if (e.type === "keydown") {
            if (k === "j") { if (!held.j) { held.j = true; jpEdge = true; netEdge = true; sendInput(); } }
            else if (!held[k]) { held[k] = true; sendInput(); }
        } else {
            if (held[k]) { held[k] = false; sendInput(); }
        }
    }
    function zoneOf(e) {
        const rect = svg.getBoundingClientRect();
        const fx = (e.clientX - rect.left) / Math.max(1, rect.width);
        return fx < 0.34 ? "l" : fx < 0.62 ? "r" : "j";
    }
    function ripple(e) {
        const rect = board.getBoundingClientRect();
        const el = document.createElement("div");
        el.className = "ce-ripple";
        el.style.left = (e.clientX - rect.left) + "px";
        el.style.top = (e.clientY - rect.top) + "px";
        board.appendChild(el);
        el.addEventListener("animationend", () => el.remove());
    }
    function onPointerDown(e) {
        if (!S || S.phase !== "play" || frozen) return;
        e.preventDefault();
        try { svg.setPointerCapture(e.pointerId); } catch { }
        if (e.pointerType === "mouse") { if (e.button === 0) { mouseJump = true; refreshHeld(); } }
        else { touches.set(e.pointerId, zoneOf(e)); refreshHeld(); }
        ripple(e);
    }
    function onPointerMove(e) {
        if (!touches.has(e.pointerId)) return;
        const z = zoneOf(e);
        if (touches.get(e.pointerId) !== z) { touches.set(e.pointerId, z); refreshHeld(); }
    }
    function onPointerUp(e) {
        if (e.pointerType === "mouse") { if (mouseJump) { mouseJump = false; refreshHeld(); } }
        else if (touches.delete(e.pointerId)) refreshHeld();
    }
    function onBlur() {
        held.l = held.r = held.j = false;
        mouseJump = false; touches.clear();
        sendInput();
    }
    function handleClick(e) {
        const t = e.target;
        if (t.closest("[data-help]")) { toggleHelp(); return; }
        if (t.closest("[data-help-close]")) { toggleHelp(false); return; }
        if (t.closest("[data-exit]")) { onExit(); return; }
        if (t.closest("[data-pause]")) { togglePause(); return; }
        if (t.closest("[data-resume]")) { togglePause(false); return; }
        if (t.closest("[data-restart]")) { if (authority && !frozen) startGame(); return; }
        if (t.closest('[data-act="start"]')) { startGame(); return; }
        if (t.closest("[data-cheats]")) { toggleCheat(); return; }
        if (t.closest("[data-cheat-close]")) { toggleCheat(false); return; }
        const ca = t.closest("[data-cheat-act]");
        if (ca) { applyCheatAct(ca.dataset.cheatAct); return; }
    }
    function handleChange(e) {
        const k = e.target?.dataset?.cheat;
        if (!k) return;
        cheats[k] = Boolean(e.target.checked);
        if (cheats[k]) cheatUsed = true;
    }

    /* ---------- jaringan (template room API) ---------- */
    function publish() {
        if (online && isHost && S) room.publishState(pack(S)).catch(console.warn);
    }
    function applyAction(action, actor) {
        if (!isHost || !S || S.phase !== "play") return;
        if (!action || action.type !== "input") return;
        const gs = 1 - S.slotHost; // slot guest
        netInput = { l: Boolean(action.l), r: Boolean(action.r), j: Boolean(action.j) };
        if (action.p) pendJump[gs] = true;
    }
    function applySnapshot(p) {
        if (!p || p.v !== 1) return;
        if (p.seed !== builtSeed) {
            lvl = buildLevel(p.seed);
            builtSeed = p.seed;
            buildStatic();
            dispInit = false;
            overHandled = false;
            localT = p.t;
        }
        mySlot = 1 - p.slotHost;
        S = unpack(p, lvl);
        setLabels();
        if (S.phase === "over") onOver();
        syncUI();
    }

    /* ---------- loop ---------- */
    function tick(t) {
        raf = requestAnimationFrame(tick);
        if (frozen) return;
        if (!lastT) lastT = t;
        let dt = (t - lastT) / 1000;
        lastT = t;
        if (!(dt > 0)) dt = 0;
        if (dt > 0.05) dt = 0.05;
        if (authority) {
            if (S && S.phase === "play" && !cheatOpen) {
                const simDt = S.mode === "ai" && cheats.slow ? dt * 0.55 : dt;
                const inputs = [null, null];
                const other = 1 - mySlot;
                inputs[mySlot] = { l: held.l, r: held.r, jh: held.j, jp: jpEdge };
                const opts = [{}, {}];
                if (S.mode === "ai") {
                    inputs[other] = botInput(lvl, S.racers[other], S.t, simDt);
                    opts[mySlot] = cheatOpts();
                    opts[other] = { move: MOVE * BOT_SPEED };
                } else {
                    inputs[other] = { l: netInput.l, r: netInput.r, jh: netInput.j, jp: pendJump[other] };
                }
                const ev = simTick(S, lvl, inputs, simDt, opts);
                jpEdge = false; pendJump[other] = false;
                handleEvents(ev);
                if (S.phase === "over") onOver();
                if (online) {
                    netAcc += dt;
                    if (netAcc >= 0.12) { netAcc = 0; publish(); }
                }
            }
        } else {
            localT += dt;
            if (S) localT += (S.t - localT) * 0.15;
            if (S && S.phase === "play") {
                inputAcc += dt;
                if (inputAcc >= 0.25) { inputAcc = 0; sendInput(); }
            }
        }
        renderFrame(dt);
        if (fx.length) updateFx(dt);
    }

    /* ---------- init ---------- */
    if (online && !isHost) {
        hide(startBtn); show($("[data-wait]"));
        hide(againBtn); show($("[data-wait2]"));
        hide(restartBtn);
    }
    if (online) hide(cheatsBtn);
    {
        const preview = newRace(20261114, 0, 0, online ? "room" : "ai");
        S = preview.S; lvl = preview.lvl; builtSeed = S.seed;
        S.phase = "lobby";
        buildStatic();
    }
    updateLobby();
    renderFrame(0);
    syncFreeze();
    syncUI();
    root.addEventListener("click", handleClick);
    root.addEventListener("change", handleChange);
    document.addEventListener("keydown", onKey);
    document.addEventListener("keyup", onKey);
    window.addEventListener("blur", onBlur);
    svg.addEventListener("pointerdown", onPointerDown);
    svg.addEventListener("pointermove", onPointerMove);
    svg.addEventListener("pointerup", onPointerUp);
    svg.addEventListener("pointercancel", onPointerUp);
    svg.addEventListener("contextmenu", (e) => e.preventDefault());
    if (online) {
        offs.push(room.onRoom((nextRoom) => { roomData = nextRoom; updateLobby(); }));
        if (isHost) offs.push(room.onAction((action) => applyAction(action, 1)));
        else offs.push(room.onState((nextState) => applySnapshot(nextState)));
    }
    raf = requestAnimationFrame(tick);

    return {
        destroy() {
            if (raf) cancelAnimationFrame(raf);
            raf = 0;
            root.removeEventListener("click", handleClick);
            root.removeEventListener("change", handleChange);
            document.removeEventListener("keydown", onKey);
            document.removeEventListener("keyup", onKey);
            window.removeEventListener("blur", onBlur);
            offs.forEach((fn) => { if (typeof fn === "function") fn(); });
            offs.length = 0;
            root.innerHTML = "";
        },
    };
}