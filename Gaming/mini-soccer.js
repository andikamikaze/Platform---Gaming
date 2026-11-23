/*
  mini-soccer.js — Mini Soccer (mengikuti template mount()/META).
  - id META harus sama dengan nama file tanpa .js  -> "mini-soccer"
  - Setelah menaruh file ini di JS/games/, jalankan:
      node tools/build-games-manifest.mjs
  Fitur: UI minimalis, tutorial, level acak (dijamin ada jalur/solvable),
  cheat overlay (lokal), tombol virtual mobile, keyboard+mouse desktop,
  undian kickoff acak vs bot, tim & nomor pemain acak di multiplayer,
  hingga 5 pemain per tim termasuk kiper, mekanik dribble/slide/shoot.
*/

export const META = {
    id: "mini-soccer",
    name: "Mini Soccer",
    category: "sports",
    catLabel: "Sports",
    desc: "Sepak bola arcade hingga 5 pemain per tim (termasuk kiper). Dribble, slide tackle, dan tendangan bertenaga — vs bot, level acak, atau multiplayer.",
    art: '<svg viewBox="0 0 48 48" width="54" height="54" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="24" cy="24" r="9"/><path d="M24 15v18M15 24h18M24 15l-7-5M24 15l7-5M24 33l-7 5M24 33l7 5"/></svg>',
    bg: ["#86efac", "#16a34a"],
    bestKey: "miniSoccerBestLevel",
};

/* ================= konstanta & aturan murni (tanpa DOM) ================= */
const W = 880, H = 520;
const LEFT = 40, RIGHT = 840, TOP = 40, BOT = 480;
const CX = (LEFT + RIGHT) / 2, CY = (TOP + BOT) / 2;
const MOUTH_HALF = 52;                    /* setengah tinggi mulut gawang */
const BALL_R = 8, PLAYER_R = 13;
const CTRL_R = 30;                        /* radius kontrol/dribble */
const KICK_MIN = 300, KICK_MAX = 650;
const SLIDE_SPEED = 440, SLIDE_TIME = 0.32, SLIDE_CD = 1.25, STUN_TIME = 0.55;
const BALL_FRICTION = 215;
const P_ACC = 1250, P_FRIC = 5.2, P_SPEED = 238;
const DIFFS = {
    easy: { sp: 170, acc: 820, noise: 96, slideP: 0.012, range: 250 },
    normal: { sp: 202, acc: 900, noise: 60, slideP: 0.030, range: 275 },
    hard: { sp: 236, acc: 1010, noise: 30, slideP: 0.055, range: 300 },
};

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const r1 = (v) => Math.round(v * 10) / 10;
const r2 = (v) => Math.round(v * 100) / 100;

function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
        a |= 0; a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/* resolusi tabrakan lingkaran vs AABB; bounce=true memantulkan kecepatan */
function circleRect(o, r, rect, bounce) {
    const cx = clamp(o.x, rect.x, rect.x + rect.w);
    const cy = clamp(o.y, rect.y, rect.y + rect.h);
    const dx = o.x - cx, dy = o.y - cy;
    const d = Math.hypot(dx, dy);
    if (d >= r) return false;
    if (d < 0.0001) {
        const l = o.x - rect.x, rr = rect.x + rect.w - o.x;
        const t = o.y - rect.y, bb = rect.y + rect.h - o.y;
        const m = Math.min(l, rr, t, bb);
        if (m === l) { o.x = rect.x - r; if (bounce && o.vx > 0) o.vx = -o.vx * 0.65; }
        else if (m === rr) { o.x = rect.x + rect.w + r; if (bounce && o.vx < 0) o.vx = -o.vx * 0.65; }
        else if (m === t) { o.y = rect.y - r; if (bounce && o.vy > 0) o.vy = -o.vy * 0.65; }
        else { o.y = rect.y + rect.h + r; if (bounce && o.vy < 0) o.vy = -o.vy * 0.65; }
        return true;
    }
    const nx = dx / d, ny = dy / d;
    o.x = cx + nx * r; o.y = cy + ny * r;
    if (bounce) {
        const vn = o.vx * nx + o.vy * ny;
        if (vn < 0) { o.vx -= 1.65 * vn * nx; o.vy -= 1.65 * vn * ny; }
    }
    return true;
}

/* BFS grid: memastikan ada jalur dari titik kickoff ke depan gawang kanan.
   Rintangan digembungkan sebesar pemain+bola, jadi jalur benar-benar muat. */
function levelSolvable(obstacles, mouthHalf) {
    const cell = 20;
    const cols = Math.ceil((RIGHT - LEFT) / cell);
    const rows = Math.ceil((BOT - TOP) / cell);
    const pad = PLAYER_R + BALL_R + 2;
    const blocked = new Uint8Array(cols * rows);
    for (let gy = 0; gy < rows; gy++) {
        for (let gx = 0; gx < cols; gx++) {
            const x = LEFT + gx * cell + cell / 2, y = TOP + gy * cell + cell / 2;
            for (const ob of obstacles) {
                if (x > ob.x - pad && x < ob.x + ob.w + pad && y > ob.y - pad && y < ob.y + ob.h + pad) {
                    blocked[gy * cols + gx] = 1; break;
                }
            }
        }
    }
    const sx = Math.floor((CX - LEFT) / cell), sy = Math.floor((CY - TOP) / cell);
    if (blocked[sy * cols + sx]) return false;
    const stack = [sy * cols + sx];
    const seen = new Uint8Array(cols * rows);
    seen[stack[0]] = 1;
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    while (stack.length) {
        const c = stack.pop();
        const cx0 = c % cols, cy0 = (c / cols) | 0;
        const wx = LEFT + cx0 * cell + cell / 2, wy = TOP + cy0 * cell + cell / 2;
        if (wx > RIGHT - 70 && wy > CY - mouthHalf + 12 && wy < CY + mouthHalf - 12) return true;
        for (const d of dirs) {
            const nx = cx0 + d[0], ny = cy0 + d[1];
            if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
            const ni = ny * cols + nx;
            if (!blocked[ni] && !seen[ni]) { seen[ni] = 1; stack.push(ni); }
        }
    }
    return false;
}

/* generator level acak yang selalu bisa diselesaikan:
   coba beberapa kandidat; kalau buntu, kurangi rintangan; fallback 0 rintangan. */
function genLevel(n, seed) {
    const rnd = mulberry32(seed);
    const defs = Math.min(1 + ((n - 1) >> 1), 4);
    const target = n < 3 ? 1 : n < 6 ? 2 : 3;
    const time = Math.max(35, 60 - (n - 1) * 3);
    let want = Math.min(2 + n, 9);
    let obstacles = [];
    for (let attempt = 0; attempt < 60; attempt++) {
        if (attempt > 0 && attempt % 8 === 0) want = Math.max(0, want - 1);
        obstacles = [];
        for (let i = 0; i < want; i++) {
            for (let t = 0; t < 8; t++) {
                const w = Math.round(26 + rnd() * 66);
                const h = Math.round(26 + rnd() * 88);
                const x = Math.round(470 + rnd() * (RIGHT - 80 - 470 - w));
                const y = Math.round(TOP + 22 + rnd() * (BOT - TOP - 44 - h));
                const cand = { x, y, w, h };
                let ok = true;
                for (const o of obstacles) {
                    if (cand.x < o.x + o.w + 40 && cand.x + cand.w > o.x - 40 &&
                        cand.y < o.y + o.h + 40 && cand.y + cand.h > o.y - 40) { ok = false; break; }
                }
                if (ok) { obstacles.push(cand); break; }
            }
        }
        if (levelSolvable(obstacles, MOUTH_HALF)) break;
        if (attempt === 59) obstacles = [];
    }
    return { n, seed, target, time, defs, obstacles };
}

/* langkah bola murni: gesekan, pantulan dinding/rintangan, deteksi gol.
   return indeks tim pencetak (tim 0 menyerang kanan) atau null. */
function stepBall(b, dt, obstacles, mouthHalf, noclip, friction) {
    b.x += b.vx * dt; b.y += b.vy * dt;
    const sp = Math.hypot(b.vx, b.vy);
    if (sp > 0) {
        const ns = Math.max(0, sp - (friction || BALL_FRICTION) * dt);
        b.vx *= ns / sp; b.vy *= ns / sp;
    }
    if (!noclip) for (const ob of obstacles) circleRect(b, BALL_R, ob, true);
    if (b.y < TOP + BALL_R) { b.y = TOP + BALL_R; b.vy = Math.abs(b.vy) * 0.72; }
    if (b.y > BOT - BALL_R) { b.y = BOT - BALL_R; b.vy = -Math.abs(b.vy) * 0.72; }
    const y0 = CY - mouthHalf, y1 = CY + mouthHalf;
    const inMouth = b.y > y0 + 3 && b.y < y1 - 3;
    let goal = null;
    if (b.x < LEFT + BALL_R) {
        if (inMouth) { if (b.x < LEFT - 6) goal = 1; }
        else { b.x = LEFT + BALL_R; b.vx = Math.abs(b.vx) * 0.72; }
    }
    if (b.x > RIGHT - BALL_R) {
        if (inMouth) { if (b.x > RIGHT + 6) goal = 0; }
        else { b.x = RIGHT - BALL_R; b.vx = -Math.abs(b.vx) * 0.72; }
    }
    return goal;
}

function buildTeam(teamIdx, size) {
    const dir = teamIdx === 0 ? 1 : -1;
    const roles = [];
    if (size >= 2) roles.push("gk");
    const m = size - roles.length;
    const defs = Math.floor(m / 2), atks = m - defs;
    for (let i = 0; i < defs; i++) roles.push("def");
    for (let i = 0; i < atks; i++) roles.push("atk");
    return roles.map((role, i) => ({
        team: teamIdx, role, num: i + 1,
        x: 0, y: 0, vx: 0, vy: 0, fx: dir, fy: 0,
        stun: 0, slide: 0, scd: 0, kcd: 0, charge: 0,
    }));
}

function outfieldSlots(s, team) {
    const a = [];
    s.players.forEach((p, i) => { if (p.team === team && p.role !== "gk") a.push(i); });
    return a;
}

function placeFormation(s, kickTeam) {
    const counts = [{ gk: 0, def: 0, atk: 0 }, { gk: 0, def: 0, atk: 0 }];
    for (const p of s.players) counts[p.team][p.role]++;
    const seen = [{ gk: 0, def: 0, atk: 0 }, { gk: 0, def: 0, atk: 0 }];
    let kicked = false;
    const spread = (n, i) => n <= 1 ? CY : TOP + 95 + i * ((BOT - TOP - 190) / (n - 1));
    s.players.forEach((p) => {
        const dir = p.team === 0 ? 1 : -1;
        const gx = p.team === 0 ? LEFT : RIGHT;
        const idx = seen[p.team][p.role]++;
        const cnt = counts[p.team][p.role];
        let x, y;
        if (p.role === "gk") { x = gx + dir * 26; y = CY; }
        else if (p.role === "def") { x = gx + dir * 150; y = spread(cnt, idx); }
        else { x = CX - dir * 110; y = spread(cnt, idx); }
        if (kickTeam === p.team && p.role === "atk" && !kicked) {
            x = CX - dir * (CTRL_R + 8); y = CY; kicked = true;
        }
        p.x = clamp(x, LEFT + PLAYER_R, RIGHT - PLAYER_R);
        p.y = clamp(y, TOP + PLAYER_R, BOT - PLAYER_R);
        p.vx = 0; p.vy = 0; p.fx = dir; p.fy = 0;
        p.stun = 0; p.slide = 0; p.scd = 0; p.kcd = 0; p.charge = 0;
    });
    s.ball.x = CX; s.ball.y = CY; s.ball.vx = 0; s.ball.vy = 0;
    s.owner = -1; s.lock = 0.25;
}

function setMsg(s, text, tone, t) { s.msg = { text, tone, t }; }

function makeState(st, online) {
    const type = online ? "match" : st.type;
    const size = st.size;
    let level = null, oppSize = size;
    if (type === "level") { level = genLevel(st.levelN, st.seed); oppSize = 1 + level.defs; }
    const players = [...buildTeam(0, size), ...buildTeam(1, oppSize)];
    const s = {
        v: 1, type, phase: "lobby", phaseT: 0,
        t: type === "level" ? level.time : st.dur, dur: st.dur,
        size, oppSize, diff: st.diff, level, mouthHalf: MOUTH_HALF,
        players, ball: { x: CX, y: CY, vx: 0, vy: 0 },
        owner: -1, lock: 0, score: [0, 0], kick: 0,
        assign: null, ctrl: 0, msg: null, pend: null, seq: 0,
    };
    const outs = [outfieldSlots(s, 0), outfieldSlots(s, 1)];
    if (online) {
        /* ACAK: tim (kiri/kanan) dan nomor pemain untuk host & tamu */
        const order = Math.random() < 0.5 ? [0, 1] : [1, 0];
        s.assign = order.map((t) => ({ team: t, slot: outs[t][Math.floor(Math.random() * outs[t].length)] }));
    } else {
        const atk = s.players.findIndex((p) => p.team === 0 && p.role === "atk");
        s.assign = [{ team: 0, slot: atk >= 0 ? atk : outs[0][0] }];
        s.ctrl = s.assign[0].slot;
    }
    placeFormation(s, 0);
    return s;
}

function tryKick(s, p, i, dir, charge, cheats) {
    const b = s.ball;
    if (s.owner !== i && dist(p, b) > CTRL_R + 8) return false;
    let pow = KICK_MIN + (KICK_MAX - KICK_MIN) * clamp(charge, 0, 1);
    if (cheats && cheats.power && p.team === 0) pow *= 1.55;
    b.vx = dir.x * pow; b.vy = dir.y * pow;
    s.owner = -1; s.lock = 0.22; p.charge = 0;
    return true;
}

function tryPass(s, p, i) {
    if (s.owner !== i && dist(p, s.ball) > CTRL_R + 8) return;
    const dir = p.team === 0 ? 1 : -1;
    let best = null, bs = -1e9, bd = 0;
    s.players.forEach((q, j) => {
        if (j === i || q.team !== p.team || q.role === "gk") return;
        const dx = q.x - p.x, dy = q.y - p.y, d = Math.hypot(dx, dy);
        if (d < 50 || d > 470) return;
        const sc = dx * dir - Math.abs(dy) * 0.35 - d * 0.15;
        if (sc > bs) { bs = sc; best = q; bd = d; }
    });
    if (best) {
        const tx = best.x + best.vx * 0.25 - p.x, ty = best.y + best.vy * 0.25 - p.y;
        const m = Math.hypot(tx, ty) || 1;
        const pow = clamp(bd * 1.7, 280, 500);
        s.ball.vx = (tx / m) * pow; s.ball.vy = (ty / m) * pow;
    } else { s.ball.vx = p.fx * 300; s.ball.vy = p.fy * 300; }
    s.owner = -1; s.lock = 0.18; p.charge = 0;
}

/* keputusan AI per pemain: kiper jaga garis, chaser kejar bola,
   lainnya isi posisi support. */
function aiThink(s, p, i, cfg, chaser, obstacles) {
    const b = s.ball, dir = p.team === 0 ? 1 : -1;
    const goalX = p.team === 0 ? RIGHT : LEFT;
    const out = { mx: 0, my: 0, aim: null, shoot: false, ch: 0.6, slide: false, pass: false };
    const move = (tx, ty) => {
        let dx = tx - p.x, dy = ty - p.y;
        for (const ob of obstacles) {
            const cx = clamp(p.x, ob.x, ob.x + ob.w), cy = clamp(p.y, ob.y, ob.y + ob.h);
            const ax = p.x - cx, ay = p.y - cy, d = Math.hypot(ax, ay);
            if (d < 64 && d > 0.001) { const w = (1 - d / 64) * 90; dx += (ax / d) * w; dy += (ay / d) * w; }
        }
        const m = Math.hypot(dx, dy);
        if (m > 4) { out.mx = dx / m; out.my = dy / m; }
    };
    if (p.role === "gk") {
        const gx = (p.team === 0 ? LEFT : RIGHT) + dir * 24;
        let tx = gx, ty = clamp(b.y, CY - s.mouthHalf + 10, CY + s.mouthHalf - 10);
        const close = Math.abs(b.x - gx) < 120 && Math.abs(b.y - CY) < s.mouthHalf + 70;
        if (close) { tx = gx + dir * 26; ty = b.y; }
        move(tx, ty);
        const d = dist(p, b);
        if (d < CTRL_R + 6 && Math.hypot(b.vx, b.vy) < 430 && p.kcd <= 0) {
            out.shoot = true; out.ch = 0.85; p.kcd = 0.8;
            out.aim = { x: p.x + dir * 320, y: CY + (Math.random() - 0.5) * 170 };
        } else if (close && p.scd <= 0 && Math.hypot(b.vx, b.vy) > 260 &&
            b.vx * dir < -80 && d < 120 && Math.random() < 0.35) {
            out.slide = true; out.aim = { x: b.x, y: b.y };   /* kiper "dive" */
        }
        return out;
    }
    const isChaser = chaser[p.team] === i;
    const ownHalf = p.team === 0 ? b.x < CX : b.x > CX;
    if (s.owner === i) {
        const dGoal = Math.hypot(goalX - p.x, CY - p.y);
        if (dGoal < cfg.range && p.kcd <= 0) {
            out.shoot = true; out.ch = 0.55 + Math.random() * 0.4; p.kcd = 0.75;
            out.aim = { x: goalX + dir * 12, y: CY + (Math.random() - 0.5) * cfg.noise };
        } else {
            let pressed = false;
            for (const q of s.players) if (q.team !== p.team && dist(q, p) < 46) { pressed = true; break; }
            if (pressed && Math.random() < 0.025) out.pass = true;
            move(goalX, CY + (p.y - CY) * 0.4);
        }
        return out;
    }
    if (isChaser || (p.role === "def" && ownHalf)) {
        move(b.x + b.vx * 0.12, b.y + b.vy * 0.12);
        const o = s.owner;
        if (o >= 0 && s.players[o].team !== p.team && p.scd <= 0 &&
            dist(p, s.players[o]) < 52 && Math.random() < cfg.slideP) {
            out.slide = true; out.aim = { x: b.x, y: b.y };
        }
        return out;
    }
    if (p.role === "def") {
        const gx = p.team === 0 ? LEFT : RIGHT;
        move(gx + (b.x - gx) * 0.35, CY + (b.y - CY) * 0.55);
    } else {
        const tx = clamp(b.x + dir * 130, LEFT + 60, RIGHT - 60);
        const off = (p.num % 2 ? 1 : -1) * 85;
        move(tx, clamp(b.y + off, TOP + 60, BOT - 60));
    }
    return out;
}

/* simulasi otoritatif (dijalankan lokal / host). memodifikasi state. */
function simulate(s, dt, humans, cheats, online) {
    if (s.msg) { s.msg.t -= dt; if (s.msg.t <= 0) s.msg = null; }
    if (s.phase === "toss" || s.phase === "kickoff" || s.phase === "goal") {
        s.phaseT -= dt;
        if (s.phaseT <= 0) {
            if (s.phase === "toss") { s.phase = "kickoff"; s.phaseT = 0.9; setMsg(s, "KICK OFF!", "ink", 0.9); }
            else if (s.phase === "kickoff") { s.phase = "play"; }
            else {
                if (s.pend === "clear") { s.phase = "clear"; s.pend = null; }
                else { placeFormation(s, s.kick); s.phase = "kickoff"; s.phaseT = 0.9; setMsg(s, "KICK OFF!", "ink", 0.9); }
            }
        }
        return;
    }
    if (s.phase !== "play") return;

    s.mouthHalf = cheats && cheats.biggoal ? 96 : MOUTH_HALF;
    if (!(cheats && cheats.notime)) s.t -= dt;
    if (s.t <= 0) {
        s.t = 0;
        if (s.type === "level") s.phase = s.score[0] >= s.level.target ? "clear" : "fail";
        else s.phase = "end";
        return;
    }

    const cfg = DIFFS[s.diff] || DIFFS.normal;
    const aiSp = cfg.sp + (s.type === "level" ? Math.min(50, (s.level.n - 1) * 5) : 0);
    const obstacles = s.level ? s.level.obstacles : [];

    if (!online && humans[0] && humans[0].inp.sw) {
        humans[0].inp.sw = false;
        const outs = outfieldSlots(s, 0);
        const i = outs.indexOf(s.ctrl);
        s.ctrl = outs[(i + 1) % outs.length];
        humans[0].slot = s.ctrl;
    }

    const bySlot = new Map();
    for (const h of humans) bySlot.set(h.team * 100 + h.slot, h);

    const chaser = [-1, -1], cd = [1e9, 1e9];
    s.players.forEach((p, i) => {
        if (p.role === "gk") return;
        const d = dist(p, s.ball);
        if (d < cd[p.team]) { cd[p.team] = d; chaser[p.team] = i; }
    });

    /* kepemilikan & dribble lengket */
    const b = s.ball;
    s.lock = Math.max(0, s.lock - dt);
    const bs = Math.hypot(b.vx, b.vy);
    if (s.owner >= 0) {
        const o = s.players[s.owner];
        if (o.stun > 0 || o.slide > 0 || dist(o, b) > CTRL_R * 2.4 || bs > 420) s.owner = -1;
    }
    if (s.owner < 0 && s.lock <= 0 && bs < 360) {
        let best = -1, bd = 1e9;
        s.players.forEach((p, i) => {
            if (p.stun > 0 || p.slide > 0) return;
            const cr = CTRL_R * (cheats && cheats.magnet && p.team === 0 ? 2.1 : 1);
            const d = dist(p, b);
            if (d < cr && d < bd) { bd = d; best = i; }
        });
        s.owner = best;
    }
    if (s.owner >= 0) {
        const p = s.players[s.owner];
        const stick = cheats && cheats.magnet && p.team === 0 ? 17 : 11;
        const tx = p.x + p.fx * (PLAYER_R + BALL_R + 3), ty = p.y + p.fy * (PLAYER_R + BALL_R + 3);
        b.vx = (tx - b.x) * stick + p.vx * 0.9;
        b.vy = (ty - b.y) * stick + p.vy * 0.9;
        const cs = Math.hypot(b.vx, b.vy), cap = Math.hypot(p.vx, p.vy) + 80;
        if (cs > cap) { b.vx *= cap / cs; b.vy *= cap / cs; }
    }

    s.players.forEach((p, i) => {
        p.scd = Math.max(0, p.scd - dt);
        p.kcd = Math.max(0, p.kcd - dt);
        const human = bySlot.get(p.team * 100 + i);
        let mx = 0, my = 0, aim = null, shoot = false, ch = 0, slide = false, pass = false;
        if (p.stun > 0) {
            p.stun -= dt;
        } else if (human) {
            const inp = human.inp;
            mx = inp.x; my = inp.y;
            if (inp.ao) aim = { x: inp.ax, y: inp.ay };
            if (inp.held) p.charge = Math.min(1, p.charge + dt / 0.7);
            if (inp.rel) { shoot = true; ch = p.charge; p.charge = 0; inp.rel = false; }
            if (inp.sl) { slide = true; inp.sl = false; }
            if (inp.pa) { pass = true; inp.pa = false; }
            if (!inp.held && !shoot) p.charge = Math.max(0, p.charge - dt * 3);
        } else {
            const d = aiThink(s, p, i, cfg, chaser, obstacles);
            mx = d.mx; my = d.my; aim = d.aim; shoot = d.shoot; ch = d.ch; slide = d.slide; pass = d.pass;
            if (cheats && cheats.freeze && p.team === 1) { mx = 0; my = 0; shoot = false; slide = false; pass = false; }
        }
        if (aim) {
            const ax = aim.x - p.x, ay = aim.y - p.y, m = Math.hypot(ax, ay);
            if (m > 2) { p.fx = ax / m; p.fy = ay / m; }
        } else if (mx || my) {
            const m = Math.hypot(mx, my);
            p.fx = mx / m; p.fy = my / m;
        }
        if (slide && p.scd <= 0 && p.slide <= 0 && p.stun <= 0) {
            p.slide = SLIDE_TIME; p.scd = SLIDE_CD;
            p.vx = p.fx * SLIDE_SPEED; p.vy = p.fy * SLIDE_SPEED;
            if (s.owner === i) { s.owner = -1; s.lock = 0.1; b.vx += p.fx * 150; b.vy += p.fy * 150; }
        }
        if (p.slide > 0) {
            p.slide -= dt;
            p.vx -= p.vx * Math.min(1, 1.6 * dt);
            p.vy -= p.vy * Math.min(1, 1.6 * dt);
            if (p.slide <= 0) { p.slide = 0; p.stun = Math.max(p.stun, 0.12); }
        } else if (p.stun <= 0) {
            const m = Math.hypot(mx, my);
            const acc = human ? P_ACC : cfg.acc;
            if (m > 0.01) { p.vx += (mx / m) * acc * dt; p.vy += (my / m) * acc * dt; }
            p.vx -= p.vx * Math.min(1, P_FRIC * dt);
            p.vy -= p.vy * Math.min(1, P_FRIC * dt);
            const cap = human ? P_SPEED * (cheats && cheats.speed ? 1.45 : 1)
                : (p.role === "gk" ? aiSp * 0.95 : aiSp);
            const v = Math.hypot(p.vx, p.vy);
            if (v > cap) { p.vx *= cap / v; p.vy *= cap / v; }
        } else {
            p.vx -= p.vx * Math.min(1, 6 * dt);
            p.vy -= p.vy * Math.min(1, 6 * dt);
        }
        p.x += p.vx * dt; p.y += p.vy * dt;
        p.x = clamp(p.x, LEFT + PLAYER_R, RIGHT - PLAYER_R);
        p.y = clamp(p.y, TOP + PLAYER_R, BOT - PLAYER_R);
        if (p.role === "gk") {
            if (p.team === 0) p.x = Math.min(p.x, LEFT + 118);
            else p.x = Math.max(p.x, RIGHT - 118);
            p.y = clamp(p.y, CY - s.mouthHalf - 46, CY + s.mouthHalf + 46);
        }
        if (!(cheats && cheats.noclip && p.team === 0)) {
            for (const ob of obstacles) circleRect(p, PLAYER_R, ob, false);
        }
        if (p.slide > 0 && s.owner !== i && dist(p, b) < PLAYER_R + BALL_R + 6) {
            const victim = s.owner;
            b.vx = p.fx * 330 + p.vx * 0.25;
            b.vy = p.fy * 330 + p.vy * 0.25;
            if (victim >= 0) s.players[victim].stun = STUN_TIME;
            s.owner = -1; s.lock = 0.22;
        }
        if (shoot) { if (!tryKick(s, p, i, { x: p.fx, y: p.fy }, ch, cheats)) p.charge = 0; }
        else if (pass) tryPass(s, p, i);
    });

    /* separasi antar pemain + stun saat tersambar slide lawan */
    for (let i = 0; i < s.players.length; i++) {
        for (let j = i + 1; j < s.players.length; j++) {
            const a = s.players[i], c = s.players[j];
            const dx = c.x - a.x, dy = c.y - a.y;
            const d = Math.hypot(dx, dy), min = PLAYER_R * 2;
            if (d < min && d > 0.001) {
                const nx = dx / d, ny = dy / d, push = (min - d) / 2;
                a.x -= nx * push; a.y -= ny * push;
                c.x += nx * push; c.y += ny * push;
                if (a.team !== c.team) {
                    if (a.slide > 0 && c.slide <= 0) c.stun = Math.max(c.stun, 0.35);
                    if (c.slide > 0 && a.slide <= 0) a.stun = Math.max(a.stun, 0.35);
                }
            }
        }
    }

    const fric = cheats && cheats.tame ? BALL_FRICTION * 2.4 : BALL_FRICTION;
    const goal = stepBall(b, dt, obstacles, s.mouthHalf, cheats && cheats.noclip, fric);
    if (goal !== null) {
        s.score[goal]++;
        b.vx *= 0.15; b.vy *= 0.15;
        b.x = clamp(b.x, LEFT - 16, RIGHT + 16);
        s.owner = -1; s.lock = 0.4;
        s.kick = 1 - goal;                     /* yang kebobolan kickoff berikutnya */
        s.phase = "goal"; s.phaseT = 1.5;
        setMsg(s, goal === 0 ? "GOL! TIM BIRU" : "GOL! TIM MERAH", goal === 0 ? "blue" : "red", 1.5);
        if (s.type === "level" && goal === 0 && s.score[0] >= s.level.target) s.pend = "clear";
    }
}

/* ekspor kecil untuk unit test (tidak dipakai platform) */
export const _test = { genLevel, levelSolvable, stepBall, circleRect, makeState, simulate, buildTeam, DIFFS };

/* ============================ mount ============================ */
export function mount(root, context = {}) {
    const { mode = "ai", room = null, playerName = "Player", onExit = () => { } } = context;
    const online = mode === "room" && Boolean(room);
    const playerIndex = online && !room.isHost ? 1 : 0;
    const authority = !online || room.isHost;   /* yang menjalankan simulasi */
    let roomData = room?.room || null;
    let state = null;

    const settings = { type: "match", size: 3, diff: "normal", dur: 90, levelN: 1, seed: (Math.random() * 1e9) | 0 };
    const cheats = {};                          /* hanya mode lokal */
    let cheatOpen = false, helpOpen = false, forceTouch = false;
    let best = 0;
    try { best = parseInt(localStorage.getItem(META.bestKey) || "0", 10) || 0; } catch (e) { }

    /* ---------------- input ---------------- */
    const keys = { up: false, down: false, left: false, right: false };
    const touchDirs = new Set();
    let spaceHeld = false, mouseHeld = false, touchShoot = false;
    let mouseX = CX, mouseY = CY, mouseT = -1e9;
    const localInp = { x: 0, y: 0, ao: false, ax: CX, ay: CY, held: false, rel: false, sl: false, pa: false, sw: false };
    const guestInp = { x: 0, y: 0, ao: false, ax: CX, ay: CY, held: false, rel: false, sl: false, pa: false, sw: false };
    let guestUntil = 0, lastSend = 0, lastCore = "";
    let seqCounter = 0, lastPub = 0, lastPubPhase = "";
    const unsubs = [];

    /* ---------------- DOM ---------------- */
    root.innerHTML = `
<div class="ms-game game-app">
<style>
.ms-game{--ink:#0f172a;--mut:#64748b;--line:#e2e8f0;--panel:#f8fafc;--blue:#2563eb;--red:#ef4444;--acc:#16a34a;color:var(--ink);font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;max-width:920px;margin:0 auto}
.ms-game [hidden]{display:none!important}
.ms-game *{box-sizing:border-box}
.ms-intro{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;margin-bottom:10px}
.ms-intro h2{margin:0;font-size:18px;letter-spacing:-.01em}
.ms-intro p{margin:2px 0 0;font-size:12.5px;color:var(--mut)}
.ms-status{display:inline-flex;align-items:center;gap:6px;font-size:12px;color:var(--mut);border:1px solid var(--line);border-radius:999px;padding:4px 10px;background:#fff;white-space:nowrap}
.ms-status .game-status-dot{width:7px;height:7px;border-radius:50%;background:var(--acc);display:inline-block}
.ms-panel{border:1px solid var(--line);border-radius:16px;background:#fff;padding:12px}
.ms-score{display:flex;align-items:center;justify-content:center;gap:16px;padding:2px 0 8px}
.ms-team{display:inline-flex;align-items:center;gap:8px;font-size:12px;font-weight:700;letter-spacing:.06em;color:var(--mut)}
.ms-team i{width:9px;height:9px;border-radius:50%;display:inline-block}
.ms-team strong{font-size:22px;font-weight:800;color:var(--ink);font-variant-numeric:tabular-nums;min-width:20px;text-align:center}
.ms-mid{text-align:center;line-height:1}
.ms-mid span{font-size:20px;font-weight:800;font-variant-numeric:tabular-nums}
.ms-mid small{display:block;font-size:9.5px;letter-spacing:.12em;color:var(--mut);margin-top:3px}
.ms-power{height:4px;border-radius:4px;background:var(--line);overflow:hidden;margin:0 0 8px;opacity:0;transition:opacity .15s}
.ms-power i{display:block;height:100%;width:0;background:var(--acc);border-radius:4px;transition:width .05s linear}
.ms-stage{position:relative;border:1px solid var(--line);border-radius:12px;overflow:hidden;background:#fbfdfc}
.ms-stage svg{display:block;width:100%;height:auto;touch-action:none;cursor:crosshair}
.ms-flash{position:absolute;top:36%;left:50%;transform:translate(-50%,-50%);font-size:clamp(18px,3.6vw,32px);font-weight:800;letter-spacing:.04em;color:var(--ink);text-shadow:0 1px 0 #fff,0 6px 24px rgba(15,23,42,.18);opacity:0;transition:opacity .15s;pointer-events:none;text-align:center;width:92%}
.ms-ring{animation:msSpin 7s linear infinite;transform-box:fill-box;transform-origin:center}
@keyframes msSpin{to{transform:rotate(360deg)}}
.ms-ov{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(255,255,255,.88);backdrop-filter:blur(3px);z-index:5;overflow:auto;padding:14px}
.ms-card{width:100%;max-width:430px;display:flex;flex-direction:column;gap:11px;text-align:center;padding:8px 4px}
.ms-card h3{margin:0;font-size:21px;letter-spacing:-.01em}
.ms-card p{margin:0;font-size:12.5px;color:var(--mut);line-height:1.55}
.ms-row{display:flex;align-items:center;justify-content:space-between;gap:10px;font-size:12.5px;font-weight:600}
.ms-select{border:1px solid var(--line);border-radius:9px;background:#fff;padding:6px 9px;font-size:12.5px;font-weight:600;color:var(--ink);min-width:130px}
.ms-tabs{display:flex;background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:3px;gap:3px}
.ms-tabs button{flex:1;border:0;background:transparent;border-radius:8px;padding:7px 8px;font-size:12.5px;font-weight:700;color:var(--mut);cursor:pointer}
.ms-tabs button.on{background:#fff;color:var(--ink);box-shadow:0 1px 3px rgba(15,23,42,.10)}
.ms-btn{border:1px solid var(--line);background:#fff;color:var(--ink);border-radius:10px;padding:8px 14px;font-size:13px;font-weight:600;cursor:pointer;transition:border-color .12s,background .12s}
.ms-btn:hover{border-color:#94a3b8;background:var(--panel)}
.ms-btn.primary{background:var(--ink);border-color:var(--ink);color:#fff}
.ms-btn.primary:hover{background:#1e293b}
.ms-btn.ghost{border-color:transparent;background:transparent;color:var(--mut)}
.ms-btn.ghost:hover{color:var(--ink);background:var(--panel)}
.ms-btn.big{padding:11px 18px;font-size:14px}
.ms-btn:disabled{opacity:.45;cursor:default}
.ms-btn .n{display:inline-block;min-width:16px;padding:0 4px;margin-left:5px;border-radius:8px;background:var(--acc);color:#fff;font-size:10.5px;line-height:16px}
.ms-help{text-align:left;font-size:12.5px;line-height:1.6;color:var(--ink);display:flex;flex-direction:column;gap:8px}
.ms-help h4{margin:2px 0 0;font-size:11px;letter-spacing:.1em;color:var(--mut)}
.ms-help ul{margin:0;padding-left:16px}
.ms-help li{margin:2px 0}
.ms-help kbd{border:1px solid var(--line);border-bottom-width:2px;border-radius:5px;background:var(--panel);padding:0 5px;font-size:11px;font-family:inherit;font-weight:700}
.ms-cheats{position:absolute;top:10px;right:10px;width:232px;max-height:calc(100% - 20px);overflow:auto;background:#fff;border:1px solid var(--line);border-radius:12px;box-shadow:0 10px 30px rgba(15,23,42,.12);padding:11px;z-index:6;text-align:left}
.ms-cheats h4{margin:0 0 6px;font-size:12px;letter-spacing:.08em;display:flex;justify-content:space-between;align-items:center}
.ms-cheats h4 button{border:0;background:none;font-size:15px;cursor:pointer;color:var(--mut);line-height:1}
.ms-cheats label{display:flex;justify-content:space-between;align-items:center;gap:8px;font-size:12px;font-weight:600;padding:4.5px 0;border-bottom:1px dashed var(--line);cursor:pointer}
.ms-cheats label:last-of-type{border-bottom:0}
.ms-cheats input{accent-color:var(--acc);width:15px;height:15px}
.ms-cheats .ops{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}
.ms-cheats .ops .ms-btn{padding:5px 9px;font-size:11.5px}
.ms-cheats .note{font-size:10.5px;color:var(--mut);margin-top:7px}
.ms-touch{display:none;justify-content:space-between;align-items:center;gap:12px;padding:12px 2px 2px;user-select:none;-webkit-user-select:none}
.ms-game.touch .ms-touch{display:flex}
.ms-game.touch .ms-hints{display:none}
.ms-dpad{display:grid;grid-template-columns:repeat(3,46px);grid-template-rows:repeat(2,46px);gap:5px}
.ms-dpad span{visibility:hidden}
.ms-tbtn{border:1px solid var(--line);background:#fff;border-radius:12px;color:var(--ink);display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:800;letter-spacing:.05em;cursor:pointer;touch-action:none;-webkit-tap-highlight-color:transparent}
.ms-tbtn svg{width:20px;height:20px;pointer-events:none}
.ms-tbtn.on,.ms-tbtn:active{background:var(--ink);color:#fff;border-color:var(--ink)}
.ms-tbtn.cd{opacity:.4}
.ms-acts{display:flex;align-items:flex-end;gap:8px}
.ms-acts .ms-tbtn{width:52px;height:52px;border-radius:50%}
.ms-acts .shoot{width:68px;height:68px;background:var(--acc);border-color:var(--acc);color:#fff;font-size:11px}
.ms-acts .shoot.on,.ms-acts .shoot:active{background:#15803d}
.ms-hints{margin:9px 0 0;font-size:11.5px;color:var(--mut);text-align:center;line-height:1.9}
.ms-hints kbd{border:1px solid var(--line);border-bottom-width:2px;border-radius:5px;background:var(--panel);padding:0 5px;font-size:10.5px;font-family:inherit;font-weight:700}
.ms-actions{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin-top:10px}
.ms-actions .sp{flex:1}
.ms-spin{width:26px;height:26px;border:3px solid var(--line);border-top-color:var(--acc);border-radius:50%;margin:0 auto;animation:msRot 1s linear infinite}
@keyframes msRot{to{transform:rotate(360deg)}}
@media (max-width:640px){
  .ms-panel{padding:8px}
  .ms-team strong{font-size:18px}
  .ms-mid span{font-size:17px}
  .ms-intro p{display:none}
  .ms-cheats{width:200px}
}
</style>
<div class="game-intro ms-intro">
  <div><h2>Mini Soccer</h2><p>Dribble · Slide tackle · Tendangan bertenaga — kalahkan bot atau temanmu.</p></div>
  <span class="game-status ms-status"><i class="game-status-dot"></i><span data-status>Siap</span></span>
</div>
<section class="game-panel ms-panel" data-board>
  <div class="ms-score">
    <span class="ms-team"><i style="background:var(--blue)"></i><b data-name0>KAMU</b><strong data-s0>0</strong></span>
    <span class="ms-mid"><span data-clock>90</span><small data-sub>DETIK</small></span>
    <span class="ms-team"><strong data-s1>0</strong><b data-name1>BOT</b><i style="background:var(--red)"></i></span>
  </div>
  <div class="ms-power" data-powerwrap><i data-power></i></div>
  <div class="ms-stage">
    <svg data-svg viewBox="0 0 880 520" aria-hidden="true"></svg>
    <div class="ms-flash" data-flash></div>

    <div class="ms-cheats" data-cheatpanel hidden>
      <h4>CHEAT <button type="button" data-act="cheat-close" aria-label="Tutup">×</button></h4>
      <label>Lari cepat <input type="checkbox" data-cheat="speed"></label>
      <label>Tendangan super <input type="checkbox" data-cheat="power"></label>
      <label>Magnet bola <input type="checkbox" data-cheat="magnet"></label>
      <label>Bola jinak <input type="checkbox" data-cheat="tame"></label>
      <label>Bekukan lawan <input type="checkbox" data-cheat="freeze"></label>
      <label>Gawang lebar <input type="checkbox" data-cheat="biggoal"></label>
      <label>Bekukan waktu <input type="checkbox" data-cheat="notime"></label>
      <label>Tembus rintangan <input type="checkbox" data-cheat="noclip"></label>
      <div class="ops">
        <button type="button" class="ms-btn" data-act="cheat-goal">+1 Gol</button>
        <button type="button" class="ms-btn" data-act="cheat-clear" data-cheatclear hidden>Selesaikan level</button>
        <button type="button" class="ms-btn" data-act="cheat-reset">Reset</button>
      </div>
      <div class="note">Cheat hanya berlaku di mode lokal (vs bot / level).</div>
    </div>

    <div class="ms-ov" data-ov="setup">
      <div class="ms-card">
        <h3>Mini Soccer</h3>
        <p data-setupdesc>Cetak gol lebih banyak sebelum waktu habis. Undian menentukan siapa kick off duluan.</p>
        <div class="ms-tabs" data-tabs>
          <button type="button" data-act="tab" data-tab="match" class="on">Vs Bot</button>
          <button type="button" data-act="tab" data-tab="level">Level Acak</button>
        </div>
        <div class="ms-row" data-setrow><span>Pemain per tim</span>
          <select class="ms-select" data-set="size">
            <option value="1">1 (solo, tanpa kiper)</option>
            <option value="2">2 (kiper + 1)</option>
            <option value="3" selected>3 (kiper + 2)</option>
            <option value="4">4 (kiper + 3)</option>
            <option value="5">5 (kiper + 4)</option>
          </select></div>
        <div class="ms-row" data-setrow><span>Kesulitan bot</span>
          <select class="ms-select" data-set="diff">
            <option value="easy">Mudah</option>
            <option value="normal" selected>Sedang</option>
            <option value="hard">Sulit</option>
          </select></div>
        <div class="ms-row" data-setrow data-durrow><span>Durasi</span>
          <select class="ms-select" data-set="dur">
            <option value="60">60 detik</option>
            <option value="90" selected>90 detik</option>
            <option value="120">120 detik</option>
          </select></div>
        <p data-note></p>
        <button type="button" class="ms-btn primary big" data-act="start" data-startbtn>Mulai</button>
        <button type="button" class="ms-btn ghost" data-act="help">Cara main</button>
      </div>
    </div>

    <div class="ms-ov" data-ov="result" hidden>
      <div class="ms-card">
        <h3 data-rtitle>Selesai</h3>
        <p data-rsub></p>
        <div data-rbtns style="display:flex;flex-direction:column;gap:8px"></div>
      </div>
    </div>

    <div class="ms-ov" data-ov="help" hidden>
      <div class="ms-card" style="max-width:480px">
        <h3>Cara Main</h3>
        <div class="ms-help">
          <h4>GERAK & BIDIK</h4>
          <ul>
            <li>Desktop: <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> / panah untuk bergerak. Arah hadap mengikuti gerakan, atau <b>kursor mouse</b> untuk membidik bebas.</li>
            <li>Mobile: D-pad kiri untuk bergerak; arah hadap = arah gerak.</li>
          </ul>
          <h4>MEKANIK</h4>
          <ul>
            <li><b>Dribble</b> — sentuh bola: bola lengket di depan kaki selama kamu bergerak.</li>
            <li><b>Shoot</b> — tahan <kbd>Space</kbd> / klik kiri / tombol <b>SHOOT</b> untuk mengisi tenaga, lepas untuk menendang ke arah hadap. Ketuk cepat = tendangan pelan.</li>
            <li><b>Slide tackle</b> — <kbd>Shift</kbd> / klik kanan / tombol <b>SLIDE</b>: meluncur, merebut bola, dan membuat lawan terpental sesaat. Ada cooldown.</li>
            <li><b>Pass</b> — <kbd>E</kbd> / tombol <b>PASS</b>: oper ke teman di depan.</li>
            <li><b>Ganti pemain</b> — <kbd>Q</kbd> / tombol <b>GANTI</b> (mode lokal). Kiper & rekan tim digerakkan AI.</li>
          </ul>
          <h4>ATURAN</h4>
          <ul>
            <li>Undian acak menentukan kick off pertama; setelah gol, tim yang kebobolan kick off.</li>
            <li><b>Level Acak</b>: rintangan dibuat acak tetapi <b>dijamin ada jalur</b> ke gawang. Cetak target gol sebelum waktu habis untuk naik level.</li>
            <li><b>Multiplayer</b>: tim (biru/merah) dan nomor pemain yang kamu kendalikan <b>diacak</b> tiap mulai. Rekan tim lainnya AI.</li>
            <li>Cheat (tombol <b>Cheat</b> / <kbd>C</kbd>) hanya untuk mode lokal.</li>
          </ul>
        </div>
        <button type="button" class="ms-btn primary" data-act="help-close">Mengerti</button>
      </div>
    </div>

    <div class="ms-ov" data-ov="wait" hidden>
      <div class="ms-card"><div class="ms-spin"></div><h3>Menunggu tuan rumah…</h3><p>Host sedang menyiapkan pertandingan.</p></div>
    </div>
  </div>

  <div class="ms-touch">
    <div class="ms-dpad">
      <span></span>
      <button type="button" class="ms-tbtn" data-tc="up" aria-label="Atas"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5M5 12l7-7 7 7"/></svg></button>
      <span></span>
      <button type="button" class="ms-tbtn" data-tc="left" aria-label="Kiri"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg></button>
      <button type="button" class="ms-tbtn" data-tc="down" aria-label="Bawah"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M19 12l-7 7-7-7"/></svg></button>
      <button type="button" class="ms-tbtn" data-tc="right" aria-label="Kanan"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg></button>
    </div>
    <div class="ms-acts">
      <button type="button" class="ms-tbtn" data-tc="switch" data-switchbtn>GANTI</button>
      <button type="button" class="ms-tbtn" data-tc="pass">PASS</button>
      <button type="button" class="ms-tbtn" data-tc="slide" data-slidebtn>SLIDE</button>
      <button type="button" class="ms-tbtn shoot" data-tc="shoot">SHOOT</button>
    </div>
  </div>
  <p class="ms-hints"><kbd>WASD</kbd> gerak · mouse bidik · tahan <kbd>Space</kbd>/klik = tembak · <kbd>Shift</kbd>/klik kanan = slide · <kbd>E</kbd> oper · <kbd>Q</kbd> ganti pemain · <kbd>C</kbd> cheat · <kbd>H</kbd> bantuan</p>
</section>
<div class="game-actions ms-actions">
  <button type="button" class="ms-btn" data-act="restart" data-restartbtn>Ulang</button>
  <button type="button" class="ms-btn" data-act="help">Cara Main</button>
  <button type="button" class="ms-btn" data-act="cheats" data-cheatbtn>Cheat<b class="n" data-cheatn hidden>0</b></button>
  <button type="button" class="ms-btn" data-act="touch">Kontrol Sentuh</button>
  <span class="sp"></span>
  <button type="button" class="ms-btn ghost game-action-button" data-exit>Keluar</button>
</div>
</div>`;

    const $ = (s) => root.querySelector(s);
    const wrap = $(".ms-game");
    const svg = $("[data-svg]");
    const el = {
        status: $("[data-status]"), s0: $("[data-s0]"), s1: $("[data-s1]"),
        name0: $("[data-name0]"), name1: $("[data-name1]"),
        clock: $("[data-clock]"), sub: $("[data-sub]"),
        flash: $("[data-flash]"), power: $("[data-power]"), powerwrap: $("[data-powerwrap]"),
        setup: $('[data-ov="setup"]'), result: $('[data-ov="result"]'),
        help: $('[data-ov="help"]'), wait: $('[data-ov="wait"]'),
        rtitle: $("[data-rtitle]"), rsub: $("[data-rsub]"), rbtns: $("[data-rbtns]"),
        tabs: $("[data-tabs]"), note: $("[data-note]"), setupdesc: $("[data-setupdesc]"),
        startbtn: $("[data-startbtn]"), durrow: $("[data-durrow]"),
        cheatpanel: $("[data-cheatpanel]"), cheatbtn: $("[data-cheatbtn]"),
        cheatn: $("[data-cheatn]"), cheatclear: $("[data-cheatclear]"),
        restartbtn: $("[data-restartbtn]"), switchbtn: $("[data-switchbtn]"),
        slidebtn: $("[data-slidebtn]"),
        setrows: root.querySelectorAll("[data-setrow]"),
        selects: root.querySelectorAll("[data-set]"),
        cheatboxes: root.querySelectorAll("[data-cheat]"),
    };

    /* ---------------- render SVG ---------------- */
    let staticSig = "";
    let plEls = [], bodyEls = [], ringEls = [], shEls = [], ballEl = null, ballSh = null;
    const disp = { p: [], ball: { x: CX, y: CY } };

    function pitchSVG(s) {
        const mh = s.mouthHalf, y0 = CY - mh, y1 = CY + mh;
        let g = '<rect x="0" y="0" width="' + W + '" height="' + H + '" fill="#fbfdfc"/>';
        for (let i = 0; i < 8; i++) {
            g += '<rect x="' + (LEFT + i * 100) + '" y="' + TOP + '" width="100" height="' + (BOT - TOP) + '" fill="' + (i % 2 ? "#e9f6ec" : "#f1faf3") + '"/>';
        }
        g += '<rect x="' + LEFT + '" y="' + TOP + '" width="' + (RIGHT - LEFT) + '" height="' + (BOT - TOP) + '" fill="none" stroke="#b9c6cf" stroke-width="2"/>';
        g += '<line x1="' + CX + '" y1="' + TOP + '" x2="' + CX + '" y2="' + BOT + '" stroke="#b9c6cf" stroke-width="2"/>';
        g += '<circle cx="' + CX + '" cy="' + CY + '" r="52" fill="none" stroke="#b9c6cf" stroke-width="2"/>';
        g += '<circle cx="' + CX + '" cy="' + CY + '" r="3" fill="#b9c6cf"/>';
        g += '<rect x="' + LEFT + '" y="' + (CY - mh - 40) + '" width="64" height="' + (2 * mh + 80) + '" fill="none" stroke="#b9c6cf" stroke-width="2"/>';
        g += '<rect x="' + (RIGHT - 64) + '" y="' + (CY - mh - 40) + '" width="64" height="' + (2 * mh + 80) + '" fill="none" stroke="#b9c6cf" stroke-width="2"/>';
        for (const side of [0, 1]) {
            const nx = side === 0 ? LEFT - 24 : RIGHT;
            g += '<rect x="' + nx + '" y="' + y0 + '" width="24" height="' + (2 * mh) + '" fill="#ffffff" stroke="#b9c6cf" stroke-width="1.5"/>';
            for (let i = 1; i < 4; i++) g += '<line x1="' + (nx + i * 6) + '" y1="' + y0 + '" x2="' + (nx + i * 6) + '" y2="' + y1 + '" stroke="#dbe4ea" stroke-width="1"/>';
            for (let i = 1; i < 6; i++) g += '<line x1="' + nx + '" y1="' + (y0 + i * (2 * mh / 6)) + '" x2="' + (nx + 24) + '" y2="' + (y0 + i * (2 * mh / 6)) + '" stroke="#dbe4ea" stroke-width="1"/>';
            const px = side === 0 ? LEFT : RIGHT;
            g += '<circle cx="' + px + '" cy="' + y0 + '" r="3.4" fill="#0f172a"/>';
            g += '<circle cx="' + px + '" cy="' + y1 + '" r="3.4" fill="#0f172a"/>';
        }
        if (s.level) for (const ob of s.level.obstacles) {
            g += '<rect x="' + ob.x + '" y="' + ob.y + '" width="' + ob.w + '" height="' + ob.h + '" rx="7" fill="#dbe4ea" stroke="#b9c6cf" stroke-width="1.5"/>';
            g += '<line x1="' + (ob.x + 8) + '" y1="' + (ob.y + ob.h - 8) + '" x2="' + (ob.x + ob.w - 8) + '" y2="' + (ob.y + 8) + '" stroke="#b9c6cf" stroke-width="1.5"/>';
        }
        g += '<g data-shadows>';
        s.players.forEach((p, i) => { g += '<ellipse data-sh="' + i + '" rx="12" ry="4" fill="#0f172a" opacity=".10"/>'; });
        g += '<ellipse data-bsh rx="7" ry="2.6" fill="#0f172a" opacity=".12"/>';
        g += '</g><g data-players>';
        s.players.forEach((p, i) => {
            const col = p.team === 0 ? "#2563eb" : "#ef4444";
            g += '<g data-pl="' + i + '">' +
                '<circle class="ms-ring" data-ring r="' + (PLAYER_R + 6) + '" fill="none" stroke="' + col + '" stroke-width="1.6" stroke-dasharray="4 4" style="display:none"/>' +
                '<g data-body><circle r="' + PLAYER_R + '" fill="' + col + '" stroke="#fff" stroke-width="2"/>' +
                '<path d="M' + PLAYER_R + ' 0L' + (PLAYER_R + 8) + ' 0" stroke="#fff" stroke-width="3" stroke-linecap="round"/></g>' +
                '<text dy="3.5" text-anchor="middle" font-size="9" font-weight="700" fill="#fff" style="pointer-events:none">' + p.num + '</text>' +
                '</g>';
        });
        g += '</g><g data-ball><circle r="' + BALL_R + '" fill="#fff" stroke="#0f172a" stroke-width="1.5"/><path d="M0 -3.4L3.2 2.4L-3.2 2.4Z" fill="#0f172a"/></g>';
        return g;
    }

    function ensureStatic(s) {
        const sig = s.type + "|" + (s.level ? s.level.seed : "-") + "|" + s.players.length + "|" + s.mouthHalf;
        if (sig === staticSig) return;
        staticSig = sig;
        svg.innerHTML = pitchSVG(s);
        plEls = Array.from(svg.querySelectorAll("[data-pl]"));
        bodyEls = Array.from(svg.querySelectorAll("[data-body]"));
        ringEls = Array.from(svg.querySelectorAll("[data-ring]"));
        shEls = Array.from(svg.querySelectorAll("[data-sh]"));
        ballEl = svg.querySelector("[data-ball]");
        ballSh = svg.querySelector("[data-bsh]");
        disp.p = s.players.map((p) => ({ x: p.x, y: p.y }));
        disp.ball = { x: s.ball.x, y: s.ball.y };
    }

    const myTeam = () => (state ? (online ? state.assign[playerIndex].team : 0) : 0);
    const mySlot = () => (state ? (online ? state.assign[playerIndex].slot : state.ctrl) : 0);

    function renderFrame(dt) {
        el.wait.hidden = !(online && !authority && !state);
        if (!state) return;
        ensureStatic(state);
        const k = authority ? 1 : 1 - Math.exp(-14 * dt);
        const mt = myTeam(), ms = mySlot();
        state.players.forEach((p, i) => {
            const d = disp.p[i] || (disp.p[i] = { x: p.x, y: p.y });
            d.x += (p.x - d.x) * k; d.y += (p.y - d.y) * k;
            const deg = Math.atan2(p.fy, p.fx) * 180 / Math.PI;
            const sx = p.slide > 0 ? 1.22 : 1, sy = p.slide > 0 ? 0.82 : 1;
            plEls[i].setAttribute("transform", "translate(" + d.x.toFixed(1) + "," + d.y.toFixed(1) + ")");
            bodyEls[i].setAttribute("transform", "rotate(" + deg.toFixed(0) + ") scale(" + sx + "," + sy + ")");
            bodyEls[i].setAttribute("opacity", p.stun > 0 ? "0.55" : "1");
            const mine = online ? (state.assign[0].slot === i && state.assign[0].team === p.team) || (state.assign[1].slot === i && state.assign[1].team === p.team) : i === state.ctrl;
            ringEls[i].style.display = mine ? "" : "none";
            ringEls[i].setAttribute("stroke-width", i === ms && p.team === mt ? "2.6" : "1.4");
            shEls[i].setAttribute("cx", d.x.toFixed(1));
            shEls[i].setAttribute("cy", (d.y + 13).toFixed(1));
        });
        const b = state.ball;
        disp.ball.x += (b.x - disp.ball.x) * k;
        disp.ball.y += (b.y - disp.ball.y) * k;
        ballEl.setAttribute("transform", "translate(" + disp.ball.x.toFixed(1) + "," + disp.ball.y.toFixed(1) + ") rotate(" + (((disp.ball.x + disp.ball.y) * 3) % 360).toFixed(0) + ")");
        ballSh.setAttribute("cx", disp.ball.x.toFixed(1));
        ballSh.setAttribute("cy", (disp.ball.y + 9).toFixed(1));

        /* HUD */
        el.s0.textContent = String(state.score[0]);
        el.s1.textContent = String(state.score[1]);
        el.name0.textContent = mt === 0 ? "KAMU" : (online ? "LAWAN" : "BOT");
        el.name1.textContent = mt === 1 ? "KAMU" : (online ? "LAWAN" : "BOT");
        el.clock.textContent = String(Math.max(0, Math.ceil(state.t)));
        el.sub.textContent = state.type === "level"
            ? "LV " + state.level.n + " · GOL " + state.score[0] + "/" + state.level.target
            : "DETIK";
        if (state.msg) {
            el.flash.textContent = state.msg.text;
            el.flash.style.color = state.msg.tone === "blue" ? "#2563eb" : state.msg.tone === "red" ? "#ef4444" : "#0f172a";
            el.flash.style.opacity = "1";
        } else el.flash.style.opacity = "0";
        const me = state.players[ms];
        const chg = me && me.team === mt ? me.charge : 0;
        el.power.style.width = (chg * 100).toFixed(0) + "%";
        el.powerwrap.style.opacity = chg > 0.02 ? "1" : "0";
        el.slidebtn.classList.toggle("cd", Boolean(me && me.scd > 0));
        el.switchbtn.hidden = online;

        /* overlay & status */
        el.setup.hidden = state.phase !== "lobby" || helpOpen;
        el.result.hidden = !["end", "clear", "fail"].includes(state.phase) || helpOpen;
        el.help.hidden = !helpOpen;
        el.cheatpanel.hidden = !cheatOpen || online;
        if (!el.result.hidden) fillResult();
        el.restartbtn.disabled = !authority;
        el.cheatbtn.hidden = online;
        let statusTxt = online
            ? (authority ? "Online · Host" : "Online · Tamu") + (authority && performance.now() > guestUntil ? " · lawan AI" : "")
            : (state.type === "level" ? "Lokal · Level " + state.level.n : "Lokal · Vs Bot");
        if (online && state.assign && state.phase !== "lobby") {
            const meP = state.players[ms];
            statusTxt += " · Kamu " + (mt === 0 ? "Biru" : "Merah") + " #" + (meP ? meP.num : "?");
        }
        el.status.textContent = statusTxt;
    }

    function fillResult() {
        const mt = myTeam(), me = state.score[mt], op = state.score[1 - mt];
        let title = "", sub = "", btns = "";
        if (state.phase === "end") {
            title = me > op ? "Kamu menang!" : me < op ? "Kamu kalah" : "Seri";
            sub = "Skor akhir — Kamu " + me + " : " + op + " " + (online ? "Lawan" : "Bot") + ".";
            btns = authority
                ? '<button type="button" class="ms-btn primary big" data-act="again">Main lagi (acak ulang)</button><button type="button" class="ms-btn" data-act="menu">Kembali ke menu</button>'
                : '<p>Menunggu host memulai ulang…</p>';
        } else if (state.phase === "clear") {
            title = "Level " + state.level.n + " selesai!";
            sub = "Target " + state.level.target + " gol tercapai. Rekor terbaik: Level " + best + ".";
            btns = '<button type="button" class="ms-btn primary big" data-act="next">Level berikutnya</button><button type="button" class="ms-btn" data-act="menu">Kembali ke menu</button>';
        } else {
            title = "Waktu habis";
            sub = "Baru " + state.score[0] + " dari " + state.level.target + " gol. Coba lagi!";
            btns = '<button type="button" class="ms-btn primary big" data-act="retry">Ulangi level</button><button type="button" class="ms-btn" data-act="menu">Kembali ke menu</button>';
        }
        el.rtitle.textContent = title;
        el.rsub.textContent = sub;
        if (el.rbtns.dataset.sig !== state.phase + "|" + me + "|" + op + "|" + authority) {
            el.rbtns.dataset.sig = state.phase + "|" + me + "|" + op + "|" + authority;
            el.rbtns.innerHTML = btns;
        }
    }

    function syncSetup() {
        el.tabs.hidden = online;
        el.setrows.forEach((r) => { r.hidden = !authority; });
        el.startbtn.hidden = !authority;
        el.tabs.querySelectorAll("button").forEach((b) => b.classList.toggle("on", b.dataset.tab === settings.type));
        el.selects.forEach((s) => { s.value = String(settings[s.dataset.set]); });
        el.durrow.hidden = !authority || settings.type === "level";
        if (online) {
            el.setupdesc.textContent = "Duel online: tim (biru/merah) dan nomor pemainmu diacak saat host memulai. Rekan tim dikendalikan AI.";
            el.note.textContent = authority ? "Kamu host — atur lalu mulai. Posisi pemain diacak otomatis." : "Menunggu host memulai pertandingan…";
        } else if (settings.type === "level") {
            el.setupdesc.textContent = "Level acak: rintangan berubah tiap level, tetapi jalur ke gawang dijamin ada. Cetak target gol sebelum waktu habis.";
            el.note.textContent = "Rekor terbaik: Level " + best + ". Kesulitan & jumlah bek naik tiap level.";
        } else {
            el.setupdesc.textContent = "Cetak gol lebih banyak sebelum waktu habis. Undian acak menentukan siapa kick off duluan.";
            el.note.textContent = "Kamu mengendalikan tim biru; rekan tim & kiper dibantu AI. Tekan Q untuk ganti pemain.";
        }
        el.cheatclear.hidden = settings.type !== "level";
    }

    function syncCheats() {
        el.cheatboxes.forEach((c) => { c.checked = Boolean(cheats[c.dataset.cheat]); });
        const n = Object.values(cheats).filter(Boolean).length;
        el.cheatn.hidden = n === 0;
        el.cheatn.textContent = String(n);
        if (state && !online) state.mouthHalf = cheats.biggoal ? 96 : MOUTH_HALF;
    }

    function noteBest() {
        if (state && state.type === "level" && state.level.n > best) {
            best = state.level.n;
            try { localStorage.setItem(META.bestKey, String(best)); } catch (e) { }
        }
    }

    /* ---------------- jaringan (room) ---------------- */
    function snapshot(s) {
        return {
            v: 1, seq: s.seq, type: s.type, phase: s.phase, phaseT: r2(s.phaseT), t: r1(s.t), dur: s.dur,
            size: s.size, oppSize: s.oppSize, diff: s.diff,
            level: s.level ? { n: s.level.n, seed: s.level.seed, target: s.level.target, time: s.level.time, defs: s.level.defs, obstacles: s.level.obstacles } : null,
            mouthHalf: s.mouthHalf,
            players: s.players.map((p) => ({
                x: r1(p.x), y: r1(p.y), vx: r1(p.vx), vy: r1(p.vy), fx: r2(p.fx), fy: r2(p.fy),
                team: p.team, role: p.role, num: p.num, stun: r2(p.stun), slide: r2(p.slide), scd: r2(p.scd), charge: r2(p.charge),
            })),
            ball: { x: r1(s.ball.x), y: r1(s.ball.y), vx: r1(s.ball.vx), vy: r1(s.ball.vy) },
            owner: s.owner, score: [s.score[0], s.score[1]], kick: s.kick,
            assign: s.assign, ctrl: s.ctrl,
            msg: s.msg ? { text: s.msg.text, tone: s.msg.tone, t: r2(s.msg.t) } : null,
        };
    }

    function publishNow() {
        if (!online || !authority || !state) return;
        state.seq = ++seqCounter;
        lastPub = performance.now(); lastPubPhase = state.phase;
        room.publishState(snapshot(state)).catch(console.warn);
    }

    function startMatch() {
        if (!authority) return;
        state = makeState(settings, online);
        staticSig = "";
        if (state.type === "level") {
            state.kick = 0; placeFormation(state, 0);
            state.phase = "kickoff"; state.phaseT = 1.2;
            setMsg(state, "LEVEL " + state.level.n + " — CETAK " + state.level.target + " GOL", "ink", 1.2);
        } else {
            /* ACAK: undian siapa kick off duluan */
            state.kick = Math.random() < 0.5 ? 0 : 1;
            placeFormation(state, state.kick);
            state.phase = "toss"; state.phaseT = 1.6;
            const mt = online ? state.assign[playerIndex].team : 0;
            const you = state.kick === mt;
            setMsg(state,
                you ? "UNDIAN: KAMU KICK OFF!" : (online ? "UNDIAN: LAWAN KICK OFF" : "UNDIAN: BOT KICK OFF"),
                state.kick === 0 ? "blue" : "red", 1.6);
        }
        helpOpen = false; cheatOpen = false;
        syncSetup();
        publishNow();
    }

    function startByPhase() {
        if (!authority || !state) return;
        if (state.phase === "clear") { settings.levelN++; settings.seed = (Math.random() * 1e9) | 0; }
        startMatch();
    }

    function cheatGoal() {
        if (online || !state || !["play", "kickoff", "goal"].includes(state.phase)) return;
        state.score[0]++;
        setMsg(state, "GOL! (CHEAT)", "blue", 1.2);
        if (state.type === "level" && state.score[0] >= state.level.target) { state.phase = "clear"; noteBest(); }
    }

    /* hanya host yang menulis state kanonik; tamu mengirim aksi input */
    function applyAction(action, actor) {
        if (!action || typeof action !== "object") return;
        if (action.t === "input" && online && actor === 1) {
            const i = action.i || {};
            guestInp.x = clamp(Number(i.x) || 0, -1, 1);
            guestInp.y = clamp(Number(i.y) || 0, -1, 1);
            guestInp.ao = Boolean(i.ao);
            guestInp.ax = Number(i.ax) || 0;
            guestInp.ay = Number(i.ay) || 0;
            guestInp.held = Boolean(i.h);
            if (state && state.phase === "play") {
                if (i.r) guestInp.rel = true;
                if (i.s) guestInp.sl = true;
                if (i.p) guestInp.pa = true;
            }
            guestUntil = performance.now() + 2500;
        }
    }

    function submitAction(action) {
        if (online && !room.isHost) { room.sendAction(action).catch(console.warn); return; }
        applyAction(action, playerIndex);
    }

    function sendInput(force) {
        if (!online || authority) return;
        const now = performance.now();
        const i = localInp;
        const core = i.x + "," + i.y + "," + (i.ao ? 1 : 0) + "," + Math.round(i.ax) + "," + Math.round(i.ay) + "," + (i.held ? 1 : 0);
        const edges = i.rel || i.sl || i.pa;
        if (!force && !edges && core === lastCore && now - lastSend < 400) return;
        if (!edges && now - lastSend < 60) return;
        lastCore = core; lastSend = now;
        submitAction({ t: "input", i: { x: i.x, y: i.y, ao: i.ao, ax: r1(i.ax), ay: r1(i.ay), h: i.held, r: i.rel, s: i.sl, p: i.pa } });
        i.rel = false; i.sl = false; i.pa = false;
    }

    /* ---------------- input lokal ---------------- */
    function buildLocalInput() {
        localInp.x = ((keys.right || touchDirs.has("right")) ? 1 : 0) - ((keys.left || touchDirs.has("left")) ? 1 : 0);
        localInp.y = ((keys.down || touchDirs.has("down")) ? 1 : 0) - ((keys.up || touchDirs.has("up")) ? 1 : 0);
        localInp.ao = performance.now() - mouseT < 1500 && !touchMode;
        localInp.ax = mouseX; localInp.ay = mouseY;
        localInp.held = spaceHeld || mouseHeld || touchShoot;
    }

    function edge(f) {
        if (f === "sw" && online) return;
        if (!state || state.phase !== "play") return;
        localInp[f] = true;
        if (!authority) sendInput(true);
    }

    /* ---------------- event handler ---------------- */
    function handleClick(e) {
        const t = e.target.closest ? e.target.closest("[data-act],[data-exit]") : null;
        if (!t) return;
        if (t.hasAttribute("data-exit")) { onExit(); return; }
        const act = t.dataset.act;
        if (act === "start" || act === "restart" || act === "again" || act === "retry") { if (authority) startMatch(); }
        else if (act === "next") { if (authority) { settings.levelN++; settings.seed = (Math.random() * 1e9) | 0; startMatch(); } }
        else if (act === "menu") { if (authority) { state = makeState(settings, online); syncSetup(); publishNow(); } }
        else if (act === "tab") { if (authority && !online) { settings.type = t.dataset.tab; state = makeState(settings, false); syncSetup(); } }
        else if (act === "help") helpOpen = !helpOpen;
        else if (act === "help-close") helpOpen = false;
        else if (act === "cheats") { if (!online) cheatOpen = !cheatOpen; }
        else if (act === "cheat-close") cheatOpen = false;
        else if (act === "cheat-reset") { for (const k of Object.keys(cheats)) cheats[k] = false; syncCheats(); }
        else if (act === "cheat-goal") cheatGoal();
        else if (act === "cheat-clear") { if (authority && !online && state && state.type === "level") { state.phase = "clear"; noteBest(); } }
        else if (act === "touch") { forceTouch = !forceTouch; applyTouchMode(); }
    }

    function handleChange(e) {
        const s = e.target.closest ? e.target.closest("[data-set]") : null;
        if (s && authority) {
            const k = s.dataset.set;
            settings[k] = (k === "size" || k === "dur") ? parseInt(s.value, 10) : s.value;
            state = makeState(settings, online);
            syncSetup(); publishNow();
            return;
        }
        const c = e.target.closest ? e.target.closest("[data-cheat]") : null;
        if (c && !online) { cheats[c.dataset.cheat] = c.checked; syncCheats(); }
    }

    function onKeyDown(e) {
        const tag = e.target && e.target.tagName;
        if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") return;
        const k = e.key.toLowerCase();
        if (k === "arrowleft" || k === "a") { keys.left = true; e.preventDefault(); }
        else if (k === "arrowright" || k === "d") { keys.right = true; e.preventDefault(); }
        else if (k === "arrowup" || k === "w") { keys.up = true; e.preventDefault(); }
        else if (k === "arrowdown" || k === "s") { keys.down = true; e.preventDefault(); }
        else if (k === " " || e.code === "Space") {
            e.preventDefault();
            if (e.repeat || helpOpen) return;
            if (state && authority && ["lobby", "end", "clear", "fail"].includes(state.phase)) startByPhase();
            else spaceHeld = true;
        }
        else if (k === "shift") { if (!e.repeat) edge("sl"); }
        else if (k === "e") edge("pa");
        else if (k === "q") edge("sw");
        else if (k === "c" && !online) cheatOpen = !cheatOpen;
        else if (k === "h" || k === "?") helpOpen = !helpOpen;
        else if (k === "escape") { helpOpen = false; cheatOpen = false; }
        else if (k === "r" && authority && state && state.phase === "play") startMatch();
    }

    function onKeyUp(e) {
        const k = e.key.toLowerCase();
        if (k === "arrowleft" || k === "a") keys.left = false;
        else if (k === "arrowright" || k === "d") keys.right = false;
        else if (k === "arrowup" || k === "w") keys.up = false;
        else if (k === "arrowdown" || k === "s") keys.down = false;
        else if (k === " " || e.code === "Space") {
            if (spaceHeld) {
                spaceHeld = false;
                if (state && state.phase === "play") { localInp.rel = true; if (!authority) sendInput(true); }
            }
        }
    }

    function onPointerDown(e) {
        const b = e.target.closest ? e.target.closest("[data-tc]") : null;
        if (b) {
            e.preventDefault();
            if (b.setPointerCapture) { try { b.setPointerCapture(e.pointerId); } catch (err) { } }
            const tc = b.dataset.tc;
            if (tc === "shoot") touchShoot = true;
            else if (tc === "slide") edge("sl");
            else if (tc === "pass") edge("pa");
            else if (tc === "switch") edge("sw");
            else touchDirs.add(tc);
            b.classList.add("on");
            return;
        }
        if (e.pointerType === "mouse" && e.target.closest && e.target.closest("[data-svg]")) {
            if (e.button === 0) mouseHeld = true;
            else if (e.button === 2) edge("sl");
        }
    }

    function onPointerUp(e) {
        const b = e.target.closest ? e.target.closest("[data-tc]") : null;
        if (!b) return;
        const tc = b.dataset.tc;
        if (tc === "shoot") {
            if (touchShoot) {
                touchShoot = false;
                if (state && state.phase === "play") { localInp.rel = true; if (!authority) sendInput(true); }
            }
        } else touchDirs.delete(tc);
        b.classList.remove("on");
    }

    function onDocPointerUp(e) {
        if (e.pointerType === "mouse" && e.button === 0 && mouseHeld) {
            mouseHeld = false;
            if (state && state.phase === "play") { localInp.rel = true; if (!authority) sendInput(true); }
        }
    }

    function onPointerMove(e) {
        if (e.pointerType !== "mouse") return;
        if (!(e.target.closest && e.target.closest("[data-svg]"))) return;
        const r = svg.getBoundingClientRect();
        if (!r.width) return;
        mouseX = (e.clientX - r.left) / r.width * W;
        mouseY = (e.clientY - r.top) / r.height * H;
        mouseT = performance.now();
    }

    function onCtx(e) { if (e.target.closest && e.target.closest("[data-svg]")) e.preventDefault(); }
    function onVis() { lastT = performance.now(); }
    function onBlur() {
        keys.up = keys.down = keys.left = keys.right = false;
        touchDirs.clear();
        spaceHeld = false; mouseHeld = false; touchShoot = false;
        root.querySelectorAll(".ms-tbtn.on").forEach((b) => b.classList.remove("on"));
    }

    /* ---------------- mode sentuh ---------------- */
    const mqCoarse = matchMedia("(pointer: coarse)");
    const mqNarrow = matchMedia("(max-width: 720px)");
    let touchMode = false;
    function applyTouchMode() {
        touchMode = forceTouch || mqCoarse.matches || mqNarrow.matches;
        wrap.classList.toggle("touch", touchMode);
    }
    function onMq() { applyTouchMode(); }

    /* ---------------- loop utama ---------------- */
    let rafId = null, lastT = performance.now();
    function frame(t) {
        rafId = requestAnimationFrame(frame);
        const dt = Math.min(0.04, (t - lastT) / 1000 || 0.016);
        lastT = t;
        buildLocalInput();
        if (state && state.phase !== "play") {
            localInp.rel = false; localInp.sl = false; localInp.pa = false; localInp.sw = false;
            guestInp.rel = false; guestInp.sl = false; guestInp.pa = false;
        }
        if (authority && state) {
            const humans = [];
            if (online) {
                humans.push({ team: state.assign[0].team, slot: state.assign[0].slot, inp: localInp });
                if (performance.now() < guestUntil) humans.push({ team: state.assign[1].team, slot: state.assign[1].slot, inp: guestInp });
            } else {
                humans.push({ team: 0, slot: state.ctrl, inp: localInp });
            }
            const prev = state.phase;
            simulate(state, dt, humans, online ? null : cheats, online);
            if (state.phase !== prev && state.phase === "clear") noteBest();
            if (online && (t - lastPub > 100 || state.phase !== lastPubPhase)) publishNow();
        } else if (online) {
            sendInput(false);
        }
        renderFrame(dt);
    }

    /* ---------------- pasang listener ---------------- */
    root.addEventListener("click", handleClick);
    root.addEventListener("change", handleChange);
    root.addEventListener("pointerdown", onPointerDown);
    root.addEventListener("pointerup", onPointerUp);
    root.addEventListener("pointercancel", onPointerUp);
    root.addEventListener("pointermove", onPointerMove);
    root.addEventListener("contextmenu", onCtx);
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("keyup", onKeyUp);
    document.addEventListener("pointerup", onDocPointerUp);
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("blur", onBlur);
    if (mqCoarse.addEventListener) { mqCoarse.addEventListener("change", onMq); mqNarrow.addEventListener("change", onMq); }
    else if (mqCoarse.addListener) { mqCoarse.addListener(onMq); mqNarrow.addListener(onMq); }

    /* ---------------- boot ---------------- */
    applyTouchMode();
    syncCheats();
    if (online) {
        const u1 = room.onRoom((nextRoom) => { roomData = nextRoom; });
        if (typeof u1 === "function") unsubs.push(u1);
        if (authority) {
            state = makeState(settings, true);
            syncSetup();
            publishNow();
            const u2 = room.onAction((action) => applyAction(action, 1));
            if (typeof u2 === "function") unsubs.push(u2);
        } else {
            const u3 = room.onState((nextState) => {
                if (nextState && (!state || (nextState.seq || 0) >= (state.seq || 0))) {
                    state = nextState;
                    syncSetup();
                }
            });
            if (typeof u3 === "function") unsubs.push(u3);
        }
    } else {
        state = makeState(settings, false);
        syncSetup();
    }
    rafId = requestAnimationFrame(frame);

    return {
        destroy() {
            if (rafId) cancelAnimationFrame(rafId);
            document.removeEventListener("keydown", onKeyDown);
            document.removeEventListener("keyup", onKeyUp);
            document.removeEventListener("pointerup", onDocPointerUp);
            document.removeEventListener("visibilitychange", onVis);
            window.removeEventListener("blur", onBlur);
            root.removeEventListener("click", handleClick);
            root.removeEventListener("change", handleChange);
            root.removeEventListener("pointerdown", onPointerDown);
            root.removeEventListener("pointerup", onPointerUp);
            root.removeEventListener("pointercancel", onPointerUp);
            root.removeEventListener("pointermove", onPointerMove);
            root.removeEventListener("contextmenu", onCtx);
            if (mqCoarse.removeEventListener) { mqCoarse.removeEventListener("change", onMq); mqNarrow.removeEventListener("change", onMq); }
            else if (mqCoarse.removeListener) { mqCoarse.removeListener(onMq); mqNarrow.removeListener(onMq); }
            for (const u of unsubs) { if (typeof u === "function") { try { u(); } catch (e) { } } }
        },
    };
}