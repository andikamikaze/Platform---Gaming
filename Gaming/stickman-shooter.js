/* ==== GAME: stickman-shooter.js ==== */
/*
  Format template baru:
  - META.id harus sama dengan nama file tanpa .js  ->  stickman-shooter.js
  - Logika game ada di mount(root, context).
  - Setelah menyalin file ini, jalankan: node tools/build-games-manifest.mjs

  STICKMAN SHOOTER — duel tembak stickman real-time 2D side-scrolling.
  - vs Bot (mode "ai") atau vs Pemain (mode "room", host-authoritative).
  - Arena dibuat generator acak yang DIJAMIN bisa diselesaikan:
      * semua peti maksimum setinggi 88px, lompatan pemain mencapai 112px
      * jendela udara di atas peti tinggi (89px) > lebar peti + badan (72px)
      * jarak antar peti >= 64px (pemain muat berdiri), area spawn bebas 250px
      * ronde dibatasi 60 detik -> selalu ada pemenang / seri, tidak buntu
  - Undian acak "siapa jalan duluan" tiap ronde (initiative 1.3 detik).
  - Posisi pemain (kiri/kanan) diacak saat pertandingan multiplayer dimulai.
*/

export const META = {
    id: "stickman-shooter",
    name: "Stickman Shooter",
    category: "arcade",
    catLabel: "Arcade",
    desc: "Duel tembak stickman real-time 2D side-scrolling di arena acak. Bidik otomatis, lompati peti, menang 3 ronde melawan Bot atau temanmu.",
    art: '<svg viewBox="0 0 48 48" width="54" height="54" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="14" cy="12" r="5"/><path d="M14 17v14M14 21l-7 5M14 31l-5 10M14 31l5 10"/><path d="M14 21l10 4" stroke="#fde047" stroke-width="3"/><path d="M24 25l7 3" stroke="#cbd5e1" stroke-width="4.5"/><circle cx="38" cy="30" r="3.5" fill="#fde047" stroke="none"/></svg>',
    bg: ["#9a3412", "#431407"],
    bestKey: "stickmanShooterBest",
};

/* ================= pure logic (deterministik & bisa diuji) ================= */

const VIEW_W = 960, VIEW_H = 420;      // layar kamera (lebih luas dari sebelumnya 640x400)
const WORLD_W = 1920, GROUND = 356;    // dunia side-scrolling 2x lebar layar
const GRAV = 1500, MOVE = 250, JUMP = 580;
const P_H = 56, P_HW = 10;             // tinggi & setengah lebar badan pemain
const COYOTE = 0.08, JBUF = 0.10;      // toleransi lompat (coyote time & input buffer)
const B_SPD = 640, B_R = 5, B_DMG = 12, FIRE_CD = 0.18;
const ROUND_TIME = 60, INIT_TIME = 1.3, WIN_TARGET = 3;
const SPAWN = [150, WORLD_W - 150];
const STEP = 1 / 60;
const EMPTY_IN = { l: 0, r: 0, j: 0, f: 0, aim: null };

function rng(seed) {
    let a = seed >>> 0;
    return function () {
        a |= 0; a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

/* Generator arena acak yang bisa diselesaikan (lihat invarian di header). */
function genArena(seed) {
    const r = rng(seed);
    const crates = [];
    let x = 400 + r() * 80;                       // zona spawn kiri bebas >= 250px
    while (x < 1440 && crates.length < 8) {       // zona spawn kanan bebas >= 250px
        const tall = r() < 0.38;
        const w = Math.round(tall ? 40 + r() * 12 : 56 + r() * 20);
        const h = tall ? 88 : 44;                   // maksimum 88 < lompatan 112
        const hp = tall ? 60 : 40;
        crates.push({ x: Math.round(x), w: w, h: h, hp: hp, max: hp });
        x += w + 64 + r() * 150;                    // celah >= 64px, selalu bisa dilalui
    }
    if (crates.length && !crates.some(function (c) { return c.h === 88; })) {
        const c = crates[(r() * crates.length) | 0];
        c.h = 88; c.w = Math.min(c.w, 52); c.hp = c.max = 60;
    }
    let lows = crates.filter(function (c) { return c.h === 44; }).length;
    for (let i = 0; i < crates.length && lows < 2; i++) {
        if (crates[i].h === 88) { crates[i].h = 44; crates[i].hp = crates[i].max = 40; lows++; }
    }
    return { seed: seed, crates: crates };
}

function mkPlayer(seat) {
    return {
        x: SPAWN[seat], y: GROUND, vx: 0, vy: 0, hp: 100,
        aim: seat === 0 ? 0 : Math.PI, face: seat === 0 ? 1 : -1,
        cd: 0, recoil: 0, hurt: 0, walk: 0,
        onGround: true, coy: 0, jBuf: 0, jPrev: false,
        dead: false, deadT: 0,
    };
}
function pushEv(st, ev) {
    ev.i = ++st.evId;
    st.ev.push(ev);
    if (st.ev.length > 24) st.ev.shift();
}
function newMatch(seatMap) {
    const seed = (Math.random() * 1e9) | 0;
    return {
        matchId: seed + "-" + ((Math.random() * 1e6) | 0),
        phase: "lobby", round: 0, wins: [0, 0], score: [0, 0],
        seatMap: seatMap, first: 0, t: 0, initT: 0, roundT: ROUND_TIME, tGlobal: 0,
        seed: seed, arena: genArena(seed),
        players: [mkPlayer(0), mkPlayer(1)],
        bullets: [], bId: 0, ev: [], evId: 0,
        bot: { t: 0, strafe: 1, band: 340, react: 0 },
    };
}
function beginRound(st, n) {
    st.round = n;
    st.seed = (Math.random() * 1e9) | 0;
    st.arena = genArena(st.seed);
    st.players = [mkPlayer(0), mkPlayer(1)];
    st.bullets = [];
    st.first = Math.random() < 0.5 ? 0 : 1;       // undian siapa yang jalan duluan
    st.phase = "countdown"; st.t = 2.4;
    st.initT = 0; st.roundT = ROUND_TIME;
    st.bot.react = 0;
    pushEv(st, { k: "round", n: n });
}
/* Kesulitan bot naik perlahan tiap ronde; sudah dituning agar kasual-friendly. */
function diffFor(round) {
    const r = Math.max(1, round);
    return {
        err: Math.max(0.07, 0.19 - 0.010 * (r - 1)),   // error bidikan bot (rad)
        cd: Math.max(0.22, 0.33 - 0.010 * (r - 1)),    // cooldown tembak bot
        spd: Math.min(1.2, 1 + 0.04 * (r - 1)),
        lead: 0.30,
        dodge: Math.min(0.06, 0.020 + 0.008 * (r - 1)),
        range: 600,
        react: 0.50,
    };
}
function losClear(st, x1, y1, x2, y2) {
    const dx = x2 - x1, dy = y2 - y1;
    const n = Math.max(2, Math.ceil(Math.hypot(dx, dy) / 12));
    for (let i = 1; i < n; i++) {
        const x = x1 + (dx * i) / n, y = y1 + (dy * i) / n;
        for (const c of st.arena.crates) {
            if (x > c.x && x < c.x + c.w && y > GROUND - c.h && y < GROUND) return false;
        }
    }
    return true;
}
function crateAhead(st, x, y) {
    for (const c of st.arena.crates) {
        if (x > c.x - 4 && x < c.x + c.w + 4 && y > GROUND - c.h + 1) return true;
    }
    return false;
}

/* Bot: jaga jarak, lompati peti, hindari peluru, tembak kalau ada garis pandang. */
function botThink(st, dt, env) {
    const b = st.bot, me = st.players[1], foe = st.players[0];
    const inp = { l: 0, r: 0, j: 0, f: 0, aim: null };
    b.react = Math.max(0, b.react - dt);
    if (st.phase !== "play" || b.react > 0 || me.dead || foe.dead) return inp;
    const d = env.diff;
    const slow = env.cheats.slowbot ? 0.55 : 1;
    const dx = foe.x - me.x, dist = Math.abs(dx), toward = dx > 0 ? 1 : -1;
    b.t -= dt;
    if (b.t <= 0) { b.t = 0.5 + Math.random() * 0.7; b.strafe = Math.random() < 0.5 ? -1 : 1; b.band = 280 + Math.random() * 200; }
    let mv = 0;
    if (dist > b.band + 70) mv = toward;
    else if (dist < b.band - 70) mv = -toward;
    else mv = b.strafe;
    if (me.x < 70) mv = 1;
    if (me.x > WORLD_W - 70) mv = -1;
    if (mv !== 0 && me.onGround && crateAhead(st, me.x + mv * 26, me.y)) inp.j = 1;
    const los = losClear(st, me.x, me.y - 36, foe.x, foe.y - 36);
    if (!los && me.onGround && Math.random() < 0.02) inp.j = 1;
    for (const bl of st.bullets) {
        if (bl.o !== 0) continue;
        if ((me.x - bl.x) * bl.vx > 0 && Math.abs(bl.x - me.x) < 130 &&
            Math.abs(bl.y - (me.y - 30)) < 26 && me.onGround &&
            Math.random() < d.dodge * slow) { inp.j = 1; break; }
    }
    inp.l = mv < 0 ? 1 : 0; inp.r = mv > 0 ? 1 : 0;
    const base = Math.atan2((me.y - 36) - (foe.y - 36), foe.x - me.x);
    if (los && dist < d.range) {
        const lead = foe.vx * (dist / B_SPD) * d.lead;
        inp.aim = Math.atan2((me.y - 36) - (foe.y - 36), foe.x + lead - me.x) +
            (Math.random() * 2 - 1) * d.err / slow;
        inp.f = 1;
    } else inp.aim = base;
    return inp;
}
function applyCheats(st, inp, env) {
    const c = env.cheats;
    if (!c.aimbot && !c.trigger) return inp;
    const me = st.players[0], foe = st.players[1];
    let aim = inp.aim, f = inp.f;
    if (c.aimbot) {
        const t = Math.abs(foe.x - me.x) / B_SPD;
        aim = Math.atan2((me.y - 36) - (foe.y - 36), foe.x + foe.vx * t * 0.85 - me.x);
    }
    if (c.trigger && losClear(st, me.x, me.y - 36, foe.x, foe.y - 36)) f = 1;
    return Object.assign({}, inp, { aim: aim, f: f });
}
function landPhysics(st, p, prevY, dt, ev) {
    p.vy += GRAV * dt;
    p.y += p.vy * dt;
    p.onGround = false;
    if (p.y >= GROUND) { p.y = GROUND; p.vy = 0; p.onGround = true; }
    for (const c of st.arena.crates) {
        const top = GROUND - c.h;
        if (p.x + P_HW - 2 > c.x && p.x - P_HW + 2 < c.x + c.w &&
            p.vy >= 0 && prevY <= top + 0.6 && p.y >= top) {
            p.y = top; p.vy = 0; p.onGround = true;
        }
    }
    if (ev && p.onGround) pushEv(st, { k: "land", x: p.x, y: p.y });
}
function settle(st, p, dt) {
    p.vx = 0;
    const prevY = p.y, was = p.onGround;
    landPhysics(st, p, prevY, dt, !was);
    p.cd = Math.max(0, p.cd - dt);
    p.hurt = Math.max(0, p.hurt - dt);
    p.recoil = Math.max(0, p.recoil - dt);
    if (p.dead) p.deadT += dt;
}
function movePlayer(st, p, s, inp, dt, env) {
    const foe = st.players[1 - s];
    let spdMul = 1;
    if (env.vsBot && s === 0 && env.cheats.speed) spdMul = 1.55;
    if (env.vsBot && s === 1) spdMul = env.diff.spd * (env.cheats.slowbot ? 0.55 : 1);
    const mv = (inp.r ? 1 : 0) - (inp.l ? 1 : 0);
    p.vx = mv * MOVE * spdMul;
    const prevX = p.x, prevY = p.y;
    p.x = clamp(p.x + p.vx * dt, 30, WORLD_W - 30);
    for (const c of st.arena.crates) {           // tabrakan horizontal dengan peti
        const top = GROUND - c.h;
        if (p.y > top + 1 && p.x + P_HW > c.x && p.x - P_HW < c.x + c.w) {
            if (prevX <= c.x) p.x = c.x - P_HW;
            else if (prevX >= c.x + c.w) p.x = c.x + c.w + P_HW;
            else p.x = p.x < c.x + c.w / 2 ? c.x - P_HW : c.x + c.w + P_HW;
            p.vx = 0;
        }
    }
    p.coy = p.onGround ? COYOTE : Math.max(0, p.coy - dt);
    if (inp.j && !p.jPrev) p.jBuf = JBUF;
    p.jPrev = !!inp.j;
    p.jBuf = Math.max(0, p.jBuf - dt);
    if (p.jBuf > 0 && (p.onGround || p.coy > 0)) {
        p.vy = -JUMP; p.onGround = false; p.coy = 0; p.jBuf = 0;
        pushEv(st, { k: "jump", x: p.x, y: p.y });
    }
    const was = p.onGround;
    landPhysics(st, p, prevY, dt, !was);
    if (p.onGround) p.walk += Math.abs(p.vx) * dt * 0.055;
    let aim = typeof inp.aim === "number" && isFinite(inp.aim)
        ? inp.aim
        : Math.atan2((p.y - 36) - (foe.y - 36), foe.x - p.x);   // bidik otomatis
    p.aim = aim;
    p.face = Math.cos(aim) >= 0 ? 1 : -1;
    p.cd -= dt;
    const cd = env.vsBot && s === 0 && env.cheats.rapid ? 0.07
        : env.vsBot && s === 1 ? env.diff.cd : FIRE_CD;
    if (inp.f && p.cd <= 0 && !p.dead) {
        p.cd = cd; p.recoil = 0.1;
        const dmg = env.vsBot && s === 0 && env.cheats.oneshot ? 99 : B_DMG;
        const mx = p.x + Math.cos(aim) * 30, my = p.y - 36 - Math.sin(aim) * 30;
        st.bullets.push({ id: ++st.bId, x: mx, y: my, vx: Math.cos(aim) * B_SPD, vy: -Math.sin(aim) * B_SPD, o: s, d: dmg });
        if (st.bullets.length > 40) st.bullets.shift();
        pushEv(st, { k: "shot", x: mx, y: my, seat: s });
    }
}
function hurt(st, s, d, from, env, x, y) {
    if (st.phase !== "play") return;
    const p = st.players[s];
    if (p.dead) return;
    if (env.vsBot && s === 0 && env.cheats.god) { pushEv(st, { k: "shield", x: x, y: y }); return; }
    p.hp = Math.max(0, p.hp - d);
    p.hurt = 0.3;
    st.score[from] += d;
    pushEv(st, { k: "hit", x: x, y: y, seat: s, d: d });
    if (p.hp <= 0) {
        p.dead = true; p.deadT = 0;
        pushEv(st, { k: "death", x: p.x, y: p.y - 30, seat: s });
        resolveRound(st, 1 - s);
    }
}
function resolveRound(st, winner) {
    if (st.phase !== "play") return;
    if (winner === null) pushEv(st, { k: "draw" });
    else {
        st.wins[winner]++;
        st.score[winner] += 100 + Math.ceil(st.players[winner].hp);
        pushEv(st, { k: "ko", seat: winner });
    }
    st.phase = "roundEnd"; st.t = 2.5;
}
function stepBullets(st, dt, env, canHurt) {
    const alive = [];
    for (const b of st.bullets) {
        b.x += b.vx * dt; b.y += b.vy * dt;
        let dead = false;
        if (b.x < -20 || b.x > WORLD_W + 20 || b.y > GROUND - 2 || b.y < -60) {
            dead = true;
            if (b.y > GROUND - 2) pushEv(st, { k: "puff", x: b.x, y: GROUND - 3 });
        }
        if (!dead) for (const c of st.arena.crates) {
            if (b.x + B_R > c.x && b.x - B_R < c.x + c.w && b.y + B_R > GROUND - c.h && b.y - B_R < GROUND) {
                dead = true; c.hp -= b.d;
                if (c.hp <= 0) pushEv(st, { k: "break", x: c.x + c.w / 2, y: GROUND - c.h / 2, w: c.w, h: c.h });
                else pushEv(st, { k: "crate", x: b.x, y: b.y });
                break;
            }
        }
        if (!dead && canHurt) for (let s = 0; s < 2; s++) {
            if (s === b.o) continue;
            const p = st.players[s];
            if (p.dead) continue;
            const hitBody =
                Math.hypot(b.x - p.x, b.y - (p.y - 52)) < 8 + B_R ||
                Math.hypot(b.x - p.x, b.y - (p.y - 36)) < 12 + B_R ||
                Math.hypot(b.x - p.x, b.y - (p.y - 14)) < 12 + B_R;
            if (hitBody) { dead = true; hurt(st, s, b.d, b.o, env, b.x, b.y); break; }
        }
        if (!dead) alive.push(b);
    }
    st.bullets = alive;
    st.arena.crates = st.arena.crates.filter(function (c) { return c.hp > 0; });
}
function stepSim(st, ins, dt, env) {
    if (!st || st.phase === "lobby" || st.phase === "matchEnd") return;
    st.tGlobal += dt;
    if (st.phase === "countdown") {
        st.t -= dt;
        for (const p of st.players) settle(st, p, dt);
        if (st.t <= 0) {
            st.phase = "play"; st.initT = INIT_TIME; st.roundT = ROUND_TIME;
            st.bot.react = env.diff.react;
            pushEv(st, { k: "first", seat: st.first });
        }
        return;
    }
    if (st.phase === "roundEnd") {
        st.t -= dt;
        for (const p of st.players) settle(st, p, dt);
        stepBullets(st, dt, env, false);
        if (st.t <= 0) {
            if (st.wins[0] >= WIN_TARGET || st.wins[1] >= WIN_TARGET) {
                st.phase = "matchEnd";
                pushEv(st, { k: "match", seat: st.wins[0] > st.wins[1] ? 0 : 1 });
            } else beginRound(st, st.round + 1);
        }
        return;
    }
    /* phase === "play" */
    st.initT = Math.max(0, st.initT - dt);
    st.roundT -= dt;
    let inputs = ins;
    if (env.vsBot) inputs = [ins[0], botThink(st, dt, env)];
    for (let s = 0; s < 2; s++) {
        const p = st.players[s];
        const allowed = st.initT <= 0 || s === st.first;   // giliran awal hasil undian
        let inp = allowed && !p.dead ? inputs[s] || EMPTY_IN : EMPTY_IN;
        if (env.vsBot && s === 0) inp = applyCheats(st, inp, env);
        movePlayer(st, p, s, inp, dt, env);
        p.hurt = Math.max(0, p.hurt - dt);
        p.recoil = Math.max(0, p.recoil - dt);
    }
    stepBullets(st, dt, env, true);
    if (st.phase !== "play") return;
    if (st.roundT <= 0) {
        pushEv(st, { k: "time" });
        const a = st.players[0].hp, b = st.players[1].hp;
        resolveRound(st, a === b ? null : a > b ? 0 : 1);
    }
}

/* ============================ mount ============================ */

export function mount(root, context = {}) {
    const { mode = "ai", room = null, playerName = "Player", onExit = () => { } } = context;
    const online = mode === "room" && Boolean(room);
    const playerIndex = online && !room.isHost ? 1 : 0;   // indeks koneksi: 0 host, 1 guest
    let roomData = (room && room.room) || null;
    let state = null;
    let destroyed = false;
    const unsubs = [];
    const uid = Math.random().toString(36).slice(2, 8);

    const cheats = { god: false, rapid: false, oneshot: false, speed: false, slowbot: false, aimbot: false, trigger: false };
    let guestIn = Object.assign({}, EMPTY_IN);
    let best = 0;
    try { best = parseInt(localStorage.getItem(META.bestKey) || "0", 10) || 0; } catch (e) { }

    /* ---------- state klien (efek, kamera, jaringan) ---------- */
    let cam = 0, shake = 0, hurtFlash = 0, cloudT = 0;
    let fx = [], bannerQueue = [], bannerT = 0;
    let lastEv = 0, matchSeen = null, staticSeed = null, lastPhase = null, bestSavedMatch = null;
    let dispP = [null, null], dispB = new Map();
    let tutOpen = false, cheatOpen = false;
    const flags = { kl: 0, kr: 0, kj: 0, kf: 0, bl: 0, br: 0, bj: 0, bf: 0, boardF: 0 };
    let manualAim = null, aimUntil = 0;
    const net = { snap: null, at: 0, round: -1 };
    let lastPub = 0, lastPubPhase = "", lastSentKey = "", lastSentAt = 0;
    let raf = null, lastT = 0, acc = 0;
    const clouds = [];

    function esc(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
    function setText(el, txt) { if (el && el.__t !== txt) { el.__t = txt; el.textContent = txt; } }
    function localSeat() { const st = state || net.snap; return st ? st.seatMap[playerIndex] : playerIndex; }
    function canStart() { return !online || room.isHost; }
    function nameOf(seat) {
        if (!online) return seat === 0 ? (playerName || "Kamu") : "Bot";
        const st = state || net.snap;
        const conn = st ? st.seatMap.indexOf(seat) : seat;
        if (conn === playerIndex) return playerName || "Kamu";
        const ps = roomData && roomData.players;
        const n = ps && ps[conn] && (ps[conn].name || ps[conn].displayName);
        return n || (conn === 0 ? "Host" : "Teman");
    }
    function resetClientFx() {
        fx = []; bannerQueue = []; bannerT = 0; lastEv = 0; staticSeed = null; lastPhase = null;
        dispP = [null, null]; dispB.clear(); shake = 0; hurtFlash = 0; acc = 0;
        cam = clamp(SPAWN[localSeat()] - VIEW_W / 2, 0, WORLD_W - VIEW_W);
    }

    /* ---------- jaringan (host-authoritative) ---------- */
    function sanitizeIn(o) {
        o = o || {};
        let aim = null;
        if (typeof o.aim === "number" && isFinite(o.aim)) aim = Math.max(-3.2, Math.min(3.2, o.aim));
        return { l: o.l ? 1 : 0, r: o.r ? 1 : 0, j: o.j ? 1 : 0, f: o.f ? 1 : 0, aim: aim };
    }
    function publish(force) {
        if (!online || !room.isHost || !state) return;
        const now = performance.now();
        if (!force && now - lastPub < 100) return;   // ~10 snapshot/detik, hemat bandwidth
        lastPub = now;
        try {
            const p = room.publishState(JSON.parse(JSON.stringify(state)));
            if (p && p.catch) p.catch(console.warn);
        } catch (err) { console.warn(err); }
    }
    function startMatch() {
        // posisi pemain diacak saat multiplayer (host bisa kiri atau kanan)
        const seatMap = online ? (Math.random() < 0.5 ? [0, 1] : [1, 0]) : [0, 1];
        state = newMatch(seatMap);
        matchSeen = state.matchId;
        beginRound(state, 1);
        resetClientFx();
        publish(true);
    }
    function cheatCmd(cmd) {
        if (!state || state.phase !== "play") return;
        const env = { vsBot: true, cheats: cheats, diff: diffFor(state.round) };
        if (cmd === "heal") {
            state.players[0].hp = 100;
            pushEv(state, { k: "heal", x: state.players[0].x, y: state.players[0].y - 40 });
        } else if (cmd === "win") {
            hurt(state, 1, 999, 0, env, state.players[1].x, state.players[1].y - 36);
        }
    }
    function applyAction(action, actor) {
        if (destroyed || !state || !action) return;
        if (action.type === "input") { if (online && actor === 1) guestIn = sanitizeIn(action.in); return; }
        if (action.type === "start") { if (actor === 0) startMatch(); return; }
        if (action.type === "cheatcmd") { if (!online && actor === 0) cheatCmd(action.cmd); return; }
    }
    function submitAction(action) {
        if (online && !room.isHost) {
            try { const p = room.sendAction(action); if (p && p.catch) p.catch(console.warn); } catch (err) { console.warn(err); }
            return;
        }
        applyAction(action, playerIndex);
    }
    function receive(s) {
        if (!s || !s.players || !s.arena) return;
        // normalisasi (Firebase bisa menghilangkan array kosong)
        s.bullets = s.bullets || [];
        s.ev = s.ev || [];
        s.wins = s.wins || [0, 0];
        s.score = s.score || [0, 0];
        s.seatMap = s.seatMap || [0, 1];
        s.arena.crates = s.arena.crates || [];
        const isNew = s.matchId !== matchSeen;
        const newRound = s.round !== net.round;
        net.snap = s; net.at = performance.now(); net.round = s.round;
        if (isNew) { matchSeen = s.matchId; resetClientFx(); }
        else if (newRound) { dispP = [null, null]; dispB.clear(); }
        ingest(s);
    }
    function guestView(now) {
        const s = net.snap;
        if (!s) return null;
        const age = Math.min(0.25, (now - net.at) / 1000);
        const v = Object.assign({}, s);
        v.players = s.players.map(function (p) {
            const qp = Object.assign({}, p);
            if (s.phase === "play" && !p.dead) {
                qp.x = clamp(p.x + p.vx * age, 30, WORLD_W - 30);
                if (!p.onGround) qp.y = Math.min(GROUND, p.y + p.vy * age + 0.5 * GRAV * age * age);
            }
            if (p.dead) qp.deadT = p.deadT + age;
            return qp;
        });
        v.bullets = s.bullets.map(function (b) { return Object.assign({}, b, { x: b.x + b.vx * age, y: b.y + b.vy * age }); });
        if (s.phase === "countdown" || s.phase === "roundEnd") v.t = Math.max(0, s.t - age);
        if (s.phase === "play") { v.initT = Math.max(0, s.initT - age); v.roundT = Math.max(0, s.roundT - age); }
        return v;
    }
    function maybeSendInput(now) {
        const inp = composeLocal(now);
        const key = "" + inp.l + inp.r + inp.j + inp.f + "|" + (inp.aim === null ? "a" : inp.aim);
        const discrete = key.slice(0, 4) !== lastSentKey.slice(0, 4);
        if ((key !== lastSentKey && (discrete || now - lastSentAt > 60)) || now - lastSentAt > 600) {
            lastSentKey = key; lastSentAt = now;
            try { const p = room.sendAction({ type: "input", in: inp }); if (p && p.catch) p.catch(console.warn); } catch (err) { console.warn(err); }
        }
    }

    /* ---------- efek visual (partikel, banner, guncangan) ---------- */
    function burst(x, y, c, n, spd, life) {
        for (let i = 0; i < n; i++) {
            const a = Math.random() * Math.PI * 2, v = spd * (0.4 + Math.random() * 0.6);
            fx.push({ s: "c", x: x, y: y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 40, g: 500, t: 0, life: life, r: 2 + Math.random() * 2.5, c: c });
        }
    }
    function dust(x, y, n) {
        for (let i = 0; i < n; i++) {
            fx.push({ s: "c", x: x + (Math.random() - 0.5) * 14, y: y - 2, vx: (Math.random() - 0.5) * 70, vy: -30 - Math.random() * 50, g: 120, t: 0, life: 0.4, r: 2.5 + Math.random() * 2, c: "#cbd5e1" });
        }
    }
    function debris(x, y, n) {
        for (let i = 0; i < n; i++) {
            fx.push({ s: "r", x: x, y: y, vx: (Math.random() - 0.5) * 260, vy: -120 - Math.random() * 180, g: 800, t: 0, life: 0.7, r: 2.5 + Math.random() * 3, c: Math.random() < 0.5 ? "#94a3b8" : "#cbd5e1" });
        }
    }
    function dmgText(x, y, d, c) {
        fx.push({ s: "t", x: x, y: y - 14, vx: (Math.random() - 0.5) * 20, vy: -70, g: 0, t: 0, life: 0.7, r: 13, c: c, txt: "-" + d });
    }
    function confetti(x, y) {
        const cols = ["#2563eb", "#f59e0b", "#22c55e", "#e11d48", "#a855f7"];
        for (let i = 0; i < 40; i++) {
            fx.push({ s: "r", x: x, y: y, vx: (Math.random() - 0.5) * 420, vy: -200 - Math.random() * 260, g: 600, t: 0, life: 1.2, r: 2.5 + Math.random() * 3, c: cols[(Math.random() * cols.length) | 0] });
        }
    }
    function showBanner(text) { bannerQueue.push(text); }
    function tickBanners(dt) {
        if (bannerT > 0) {
            bannerT -= dt;
            if (bannerT <= 0) bannerEl.hidden = true;
        }
        if (bannerT <= 0 && bannerQueue.length) {
            bannerEl.textContent = bannerQueue.shift();
            bannerEl.hidden = false;
            bannerEl.classList.remove("show");
            void bannerEl.offsetWidth;
            bannerEl.classList.add("show");
            bannerT = 1.5;
        }
    }
    function ingest(st) {
        const me = localSeat();
        for (const ev of st.ev) {
            if (ev.i <= lastEv) continue;
            lastEv = ev.i;
            switch (ev.k) {
                case "shot": burst(ev.x, ev.y, "#fbbf24", 3, 70, 0.16); break;
                case "hit":
                    burst(ev.x, ev.y, SEAT_LIGHT[ev.seat], 8, 170, 0.35);
                    dmgText(ev.x, ev.y, ev.d, "#ef4444");
                    if (ev.seat === me) { shake = 7; hurtFlash = 0.35; } else shake = Math.max(shake, 2);
                    break;
                case "shield": burst(ev.x, ev.y, "#22d3ee", 8, 140, 0.3); break;
                case "crate": burst(ev.x, ev.y, "#94a3b8", 4, 110, 0.25); break;
                case "break": debris(ev.x, ev.y, 12); shake = Math.max(shake, 3); break;
                case "puff": dust(ev.x, ev.y, 2); break;
                case "jump": dust(ev.x, ev.y, 3); break;
                case "land": dust(ev.x, ev.y, 4); break;
                case "death": burst(ev.x, ev.y, SEAT_LIGHT[ev.seat], 22, 250, 0.6); shake = 10; break;
                case "heal": burst(ev.x, ev.y, "#4ade80", 12, 130, 0.5); dmgText(ev.x, ev.y, "HP", "#22c55e"); break;
                case "round": showBanner("Ronde " + ev.n); break;
                case "first": showBanner("⚡ " + nameOf(ev.seat) + " jalan duluan!"); break;
                case "ko": showBanner("KO! " + nameOf(ev.seat) + " menang ronde"); break;
                case "time": showBanner("⏱ Waktu habis!"); break;
                case "draw": showBanner("🤝 Seri — ronde diulang"); break;
                case "match": if (ev.seat === me) confetti(st.players[me].x, st.players[me].y - 60); break;
            }
        }
    }

    /* ---------- UI (desain minimalis, layout: HUD -> arena -> kontrol) ---------- */
    root.innerHTML = `
<div class="game-app ss-shell">
<style>
.ss-shell{max-width:1020px;margin:0 auto;display:flex;flex-direction:column;gap:12px;color:#0f172a}
.ss-shell *{box-sizing:border-box}
.ss-shell .game-action-button{border:1px solid #cbd5e1;background:#fff;border-radius:10px;padding:8px 14px;font-size:13px;font-weight:600;cursor:pointer;color:#0f172a;font-family:inherit}
.ss-shell .game-action-button:hover{background:#f8fafc}
.ss-shell .game-action-button:disabled{opacity:.45;cursor:not-allowed}
.ss-head{display:flex;align-items:center;justify-content:space-between;gap:12px}
.ss-head h2{margin:0;font-size:20px;letter-spacing:-.02em}
.ss-head p{margin:2px 0 0;font-size:12.5px;color:#64748b}
.ss-status{display:inline-flex;align-items:center;gap:6px;font-size:12px;color:#475569;background:#fff;border:1px solid #e2e8f0;padding:4px 10px;border-radius:99px;white-space:nowrap}
.ss-status .game-status-dot{width:8px;height:8px;border-radius:50%;background:#22c55e;display:inline-block;animation:ssPulse 1.2s infinite alternate}
.ss-hud{display:grid;grid-template-columns:1fr auto 1fr;gap:10px;align-items:stretch}
.ss-pcard{background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:8px 12px;display:flex;flex-direction:column;gap:6px;min-width:0}
.ss-pcard.right{align-items:flex-end}
.ss-pname{display:flex;gap:6px;align-items:center;font-size:12.5px;min-width:0}
.ss-pcard.right .ss-pname{flex-direction:row-reverse}
.ss-pname b{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:150px}
.ss-dot{width:9px;height:9px;border-radius:50%;flex:none}
.ss-pcard[data-seat="0"] .ss-dot{background:#2563eb}
.ss-pcard[data-seat="1"] .ss-dot{background:#e11d48}
.ss-you{font-size:9px;font-weight:700;letter-spacing:.08em;background:#eff6ff;color:#2563eb;border-radius:4px;padding:1px 5px;flex:none}
.ss-hpbar{width:100%;height:8px;background:#e2e8f0;border-radius:99px;overflow:hidden}
.ss-hpbar i{display:block;height:100%;width:100%;border-radius:99px;transition:width .18s ease}
.ss-pcard[data-seat="0"] .ss-hpbar i{background:#2563eb}
.ss-pcard[data-seat="1"] .ss-hpbar i{background:#e11d48}
.ss-hpbar i.low{background:#f59e0b !important;animation:ssPulse .6s infinite alternate}
.ss-psub{display:flex;justify-content:space-between;align-items:center;width:100%;font-size:11px;color:#64748b}
.ss-pcard.right .ss-psub{flex-direction:row-reverse}
.ss-pips{display:inline-flex;gap:4px;align-items:center}
.ss-pips i{width:8px;height:8px;border-radius:50%;background:#e2e8f0}
.ss-pcard[data-seat="0"] .ss-pips i.on{background:#2563eb}
.ss-pcard[data-seat="1"] .ss-pips i.on{background:#e11d48}
.ss-mid{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;padding:0 6px}
.ss-round{font-size:11px;font-weight:600;color:#64748b;letter-spacing:.06em;text-transform:uppercase;white-space:nowrap}
.ss-timer{font-size:24px;font-weight:800;font-variant-numeric:tabular-nums;letter-spacing:-.02em}
.ss-timer.hot{color:#e11d48;animation:ssPulse .5s infinite alternate}
.ss-mode{font-size:9.5px;font-weight:700;letter-spacing:.1em;color:#94a3b8;white-space:nowrap}
.ss-stage{position:relative;padding:0 !important;border-radius:14px;overflow:hidden;background:#eef2f7;border:1px solid #e2e8f0;line-height:0}
.ss-svg{display:block;width:100%;height:auto;touch-action:none;cursor:crosshair;user-select:none;-webkit-user-select:none}
.ss-svg text{font-family:inherit}
.ss-vignette{position:absolute;inset:0;pointer-events:none;opacity:0;box-shadow:inset 0 0 60px 18px rgba(225,29,72,.55)}
.ss-count{position:absolute;inset:0;display:flex;flex-direction:column;gap:8px;align-items:center;justify-content:center;pointer-events:none;line-height:1.1}
.ss-count b{font-size:76px;font-weight:800;color:#0f172a;animation:ssPop .8s ease infinite;text-shadow:0 2px 0 #fff}
.ss-count span{font-size:12px;color:#64748b;background:rgba(255,255,255,.9);padding:3px 10px;border-radius:99px;border:1px solid #e2e8f0}
.ss-init{position:absolute;top:10px;left:50%;transform:translateX(-50%);background:#fff;border:1px solid #e2e8f0;color:#0f172a;font-size:12px;font-weight:600;padding:4px 12px;border-radius:99px;pointer-events:none;box-shadow:0 2px 8px rgba(15,23,42,.08);line-height:1.4;white-space:nowrap}
.ss-banner{position:absolute;top:38%;left:50%;transform:translate(-50%,-50%);pointer-events:none;font-size:26px;font-weight:800;color:#0f172a;background:rgba(255,255,255,.93);border:1px solid #e2e8f0;padding:8px 22px;border-radius:14px;box-shadow:0 8px 24px rgba(15,23,42,.12);white-space:nowrap;line-height:1.3}
.ss-banner.show{animation:ssBanner 1.5s ease forwards}
@keyframes ssBanner{0%{opacity:0;transform:translate(-50%,-50%) scale(.7)}12%{opacity:1;transform:translate(-50%,-50%) scale(1.06)}20%{transform:translate(-50%,-50%) scale(1)}80%{opacity:1}100%{opacity:0;transform:translate(-50%,-50%) scale(.96)}}
@keyframes ssPop{0%{transform:scale(.82)}30%{transform:scale(1.08)}100%{transform:scale(1)}}
@keyframes ssPulse{from{opacity:1}to{opacity:.5}}
.ss-ov{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(241,245,249,.9);backdrop-filter:blur(3px);z-index:5;line-height:1.5;padding:14px;overflow:auto}
.ss-ov[data-ov="tutorial"],.ss-ov[data-ov="cheats"]{z-index:7}
.ss-card{background:#fff;border:1px solid #e2e8f0;border-radius:16px;padding:20px 22px;max-width:460px;width:100%;box-shadow:0 12px 32px rgba(15,23,42,.1);text-align:center;margin:auto}
.ss-card h3{margin:0 0 6px;font-size:20px}
.ss-ovsub{margin:0 0 12px;font-size:13px;color:#64748b}
.ss-quick{display:flex;gap:6px;justify-content:center;flex-wrap:wrap;margin-bottom:14px}
.ss-quick span{font-size:11px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:99px;padding:3px 9px;color:#475569}
.ss-ovbtns{display:flex;gap:8px;justify-content:center;flex-wrap:wrap}
.ss-primary{background:#2563eb !important;color:#fff !important;border-color:#2563eb !important}
.ss-primary:hover{background:#1d4ed8 !important}
.ss-best{font-size:12px;color:#64748b;margin:12px 0 0}
.ss-wait{font-size:12.5px;color:#2563eb;margin:10px 0 0;animation:ssPulse .8s infinite alternate}
.ss-tut{text-align:left;max-width:500px}
.ss-tut h3{text-align:center}
.ss-tut ul{margin:8px 0 14px;padding-left:18px;font-size:12.5px;color:#334155;display:flex;flex-direction:column;gap:7px}
.ss-tut kbd{background:#f1f5f9;border:1px solid #cbd5e1;border-bottom-width:2px;border-radius:5px;padding:0 5px;font-size:11px;font-family:inherit}
.ss-cheatnote{font-size:11px;color:#94a3b8;font-weight:500}
.ss-cheats{display:grid;grid-template-columns:1fr 1fr;gap:7px;margin:10px 0 14px;text-align:left}
.ss-cheats label{display:flex;gap:7px;align-items:center;font-size:12px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:9px;padding:7px 9px;cursor:pointer}
.ss-cheats input{accent-color:#2563eb}
.ss-touch{display:none;justify-content:space-between;gap:10px;align-items:center}
.ss-touch.force{display:flex}
@media (pointer:coarse),(max-width:760px){.ss-touch{display:flex}.ss-keys{display:none}}
.ss-tcluster{display:flex;gap:10px}
.ss-tbtn{width:58px;height:58px;border-radius:50%;border:1px solid #cbd5e1;background:#fff;font-size:20px;color:#0f172a;display:grid;place-items:center;touch-action:none;user-select:none;-webkit-user-select:none;cursor:pointer;box-shadow:0 2px 6px rgba(15,23,42,.06);font-family:inherit;padding:0}
.ss-tbtn:active{background:#eff6ff;border-color:#2563eb;transform:scale(.94)}
.ss-tfire{width:72px;height:72px;background:#e11d48;border-color:#e11d48;color:#fff;font-size:26px}
.ss-tfire:active{background:#be123c;border-color:#be123c}
.ss-bar{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.ss-keys{font-size:11.5px;color:#94a3b8;flex:1;text-align:center;min-width:120px}
.ss-bar [data-exit]{margin-left:auto}
@media (max-width:640px){.ss-timer{font-size:19px}.ss-pname b{max-width:80px}.ss-banner{font-size:17px;padding:6px 14px}.ss-count b{font-size:56px}.ss-cheats{grid-template-columns:1fr}.ss-head p{display:none}}
</style>
  <div class="game-intro ss-head">
    <div><h2>Stickman Shooter</h2><p>Duel tembak 2D real-time &middot; arena acak side-scrolling &middot; pertama menang 3 ronde</p></div>
    <span class="game-status ss-status"><i class="game-status-dot"></i><span data-status>Siap</span></span>
  </div>
  <div class="ss-hud">
    <div class="ss-pcard" data-pcard="0" data-seat="0">
      <div class="ss-pname"><i class="ss-dot"></i><b data-name="0">Kamu</b><span class="ss-you" data-you="0">KAMU</span></div>
      <div class="ss-hpbar"><i data-hp="0"></i></div>
      <div class="ss-psub"><span class="ss-pips" data-pips="0"></span><span>Skor <b data-score="0">0</b></span></div>
    </div>
    <div class="ss-mid">
      <div class="ss-round" data-round>Ronde 1</div>
      <div class="ss-timer" data-timer>60</div>
      <div class="ss-mode" data-modelabel>VS BOT</div>
    </div>
    <div class="ss-pcard right" data-pcard="1" data-seat="1">
      <div class="ss-pname"><i class="ss-dot"></i><b data-name="1">Bot</b><span class="ss-you" data-you="1" hidden>KAMU</span></div>
      <div class="ss-hpbar"><i data-hp="1"></i></div>
      <div class="ss-psub"><span class="ss-pips" data-pips="1"></span><span>Skor <b data-score="1">0</b></span></div>
    </div>
  </div>
  <section class="game-panel ss-stage" data-board>
    <svg class="ss-svg" viewBox="0 0 960 420" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Arena duel stickman side-scrolling">
      <defs>
        <linearGradient id="ssSky${uid}" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#f8fafc"/><stop offset="1" stop-color="#e8eef5"/>
        </linearGradient>
      </defs>
      <rect x="0" y="0" width="960" height="420" fill="url(#ssSky${uid})"/>
      <circle cx="858" cy="64" r="26" fill="#fde68a" opacity="0.9"/>
      <g data-g="clouds"></g>
      <g data-g="far"></g>
      <g data-g="near"></g>
      <g data-g="world"><g data-g="static"></g><g data-g="crates"></g><g data-g="dyn"></g><g data-g="fx"></g></g>
      <g data-g="edge"></g>
    </svg>
    <div class="ss-vignette" data-vig></div>
    <div class="ss-count" data-count hidden></div>
    <div class="ss-init" data-init hidden></div>
    <div class="ss-banner" data-banner hidden></div>
    <div class="ss-ov" data-ov="lobby">
      <div class="ss-card">
        <h3>Stickman Shooter</h3>
        <p class="ss-ovsub" data-lobbyinfo></p>
        <div class="ss-quick"><span>🎯 Bidik otomatis</span><span>📦 Peti = tameng</span><span>⚡ Undian jalan duluan</span><span>🏆 Menang 3 ronde</span></div>
        <div class="ss-ovbtns">
          <button class="game-action-button ss-primary" type="button" data-act="start">Mulai duel</button>
          <button class="game-action-button" type="button" data-act="tutorial">📖 Cara main</button>
        </div>
        <p class="ss-best">Skor terbaik: <b data-best>0</b></p>
        <p class="ss-wait" data-wait hidden>Menunggu host memulai&hellip;</p>
      </div>
    </div>
    <div class="ss-ov" data-ov="end" hidden>
      <div class="ss-card">
        <h3 data-endtitle>Selesai</h3>
        <p class="ss-ovsub" data-endinfo></p>
        <div class="ss-ovbtns">
          <button class="game-action-button ss-primary" type="button" data-act="rematch">Main lagi</button>
          <button class="game-action-button" type="button" data-exit>Keluar</button>
        </div>
        <p class="ss-best" data-endbest></p>
        <p class="ss-wait" data-wait2 hidden>Menunggu host memulai ulang&hellip;</p>
      </div>
    </div>
    <div class="ss-ov" data-ov="tutorial" hidden>
      <div class="ss-card ss-tut">
        <h3>📖 Cara Main</h3>
        <ul>
          <li><b>Tujuan:</b> habiskan 100 HP lawan. Pertama menang <b>3 ronde</b> jadi juara. Waktu ronde 60 detik &mdash; jika habis, HP terbanyak menang.</li>
          <li><b>Gerak:</b> <kbd>A</kbd>/<kbd>D</kbd> atau <kbd>&larr;</kbd>/<kbd>&rarr;</kbd> &middot; <b>Lompat:</b> <kbd>W</kbd>/<kbd>&uarr;</kbd> &middot; <b>Tembak:</b> tahan <kbd>Spasi</kbd> atau klik/tahan di arena.</li>
          <li><b>Bidik otomatis:</b> tembakan selalu mengarah ke lawan &mdash; cukup bergerak, melompat &amp; menembak. Gerakkan mouse di arena untuk bidik manual sesaat.</li>
          <li><b>Peti:</b> menahan peluru dan bisa hancur. Lompati peti tinggi lalu tembak dari udara.</li>
          <li><b>⚡ Giliran awal:</b> tiap ronde diundi acak siapa yang boleh bergerak duluan selama 1,3 detik (lawan terkunci 🔒).</li>
          <li><b>👥 Multiplayer:</b> posisi kiri/kanan diacak saat pertandingan dimulai.</li>
          <li><b>📱 Mobile:</b> gunakan tombol virtual di bawah arena.</li>
          <li><b>🧪 Cheat:</b> tombol Cheat (atau <kbd>C</kbd>) saat latihan vs Bot; nonaktif di multiplayer.</li>
        </ul>
        <div class="ss-ovbtns"><button class="game-action-button ss-primary" type="button" data-act="closetut">Mengerti!</button></div>
      </div>
    </div>
    <div class="ss-ov" data-ov="cheats" hidden>
      <div class="ss-card">
        <h3>🧪 Cheat <span class="ss-cheatnote">(khusus latihan vs Bot)</span></h3>
        <div class="ss-cheats">
          <label><input type="checkbox" data-cheat="god"> 🛡️ Kebal (God Mode)</label>
          <label><input type="checkbox" data-cheat="rapid"> 🔥 Tembak cepat</label>
          <label><input type="checkbox" data-cheat="oneshot"> 💥 Sekali tembak KO</label>
          <label><input type="checkbox" data-cheat="speed"> 👟 Lari kencang</label>
          <label><input type="checkbox" data-cheat="slowbot"> 🐌 Bot lamban</label>
          <label><input type="checkbox" data-cheat="aimbot"> 🎯 Aimbot prediksi</label>
          <label><input type="checkbox" data-cheat="trigger"> 🤖 Auto-tembak</label>
        </div>
        <div class="ss-ovbtns">
          <button class="game-action-button" type="button" data-cheatcmd="heal">❤️ Pulihkan HP</button>
          <button class="game-action-button" type="button" data-cheatcmd="win">🏆 Menangkan ronde</button>
          <button class="game-action-button ss-primary" type="button" data-act="closecheat">Tutup</button>
        </div>
      </div>
    </div>
  </section>
  <div class="ss-touch" data-touch>
    <div class="ss-tcluster">
      <button class="ss-tbtn" type="button" data-k="l" aria-label="Gerak kiri">&#9664;</button>
      <button class="ss-tbtn" type="button" data-k="r" aria-label="Gerak kanan">&#9654;</button>
    </div>
    <div class="ss-tcluster">
      <button class="ss-tbtn" type="button" data-k="j" aria-label="Lompat">&#10514;</button>
      <button class="ss-tbtn ss-tfire" type="button" data-k="f" aria-label="Tembak">&#9679;</button>
    </div>
  </div>
  <div class="game-actions ss-bar">
    <button class="game-action-button" type="button" data-act="tutorial">📖 Cara main</button>
    <button class="game-action-button" type="button" data-act="cheats" data-cheatbtn>🧪 Cheat</button>
    <span class="ss-keys">A/D gerak &middot; W lompat &middot; Spasi/klik tembak &middot; mouse = bidik manual &middot; C cheat</span>
    <button class="game-action-button" type="button" data-exit>Exit game</button>
  </div>
</div>`;

    /* ---------- referensi elemen ---------- */
    const q = function (s) { return root.querySelector(s); };
    const svg = q(".ss-svg");
    const stage = q("[data-board]");
    const cloudsG = q('[data-g="clouds"]'), farG = q('[data-g="far"]'), nearG = q('[data-g="near"]');
    const worldG = q('[data-g="world"]'), staticG = q('[data-g="static"]'), cratesG = q('[data-g="crates"]');
    const dynG = q('[data-g="dyn"]'), fxG = q('[data-g="fx"]'), edgeG = q('[data-g="edge"]');
    const ovLobby = q('[data-ov="lobby"]'), ovEnd = q('[data-ov="end"]');
    const ovTut = q('[data-ov="tutorial"]'), ovCheat = q('[data-ov="cheats"]');
    const bannerEl = q("[data-banner]"), countEl = q("[data-count]"), initEl = q("[data-init]"), vigEl = q("[data-vig]");
    const touchEl = q("[data-touch]"), cheatBtn = q("[data-cheatbtn]");
    const hud = {
        status: q("[data-status]"), round: q("[data-round]"), timer: q("[data-timer]"), mode: q("[data-modelabel]"),
        cards: [q('[data-pcard="0"]'), q('[data-pcard="1"]')],
        names: [q('[data-name="0"]'), q('[data-name="1"]')],
        you: [q('[data-you="0"]'), q('[data-you="1"]')],
        hp: [q('[data-hp="0"]'), q('[data-hp="1"]')],
        pips: [q('[data-pips="0"]'), q('[data-pips="1"]')],
        score: [q('[data-score="0"]'), q('[data-score="1"]')],
        lobbyinfo: q("[data-lobbyinfo]"), wait: q("[data-wait]"), wait2: q("[data-wait2]"),
        best: q("[data-best]"), endtitle: q("[data-endtitle]"), endinfo: q("[data-endinfo]"), endbest: q("[data-endbest]"),
        startBtn: q('[data-act="start"]'), rematchBtn: q('[data-act="rematch"]'),
    };
    const SEAT_FILL = ["#2563eb", "#e11d48"];
    const SEAT_STROKE = ["#1d4ed8", "#be123c"];
    const SEAT_LIGHT = ["#60a5fa", "#fb7185"];
    const SEAT_NAME = ["Biru", "Merah"];

    /* ---------- rendering SVG ---------- */
    function buildClouds() {
        let s = "";
        for (let i = 0; i < 6; i++) {
            clouds.push({ base: Math.random() * 1200, y: 26 + Math.random() * 100, sc: 0.6 + Math.random() * 0.8, v: 6 + Math.random() * 10 });
            s += '<g opacity="0.85"><ellipse cx="0" cy="0" rx="34" ry="13" fill="#fff"/><ellipse cx="22" cy="-7" rx="22" ry="11" fill="#fff"/><ellipse cx="-24" cy="-5" rx="18" ry="9" fill="#fff"/></g>';
        }
        cloudsG.innerHTML = s;
    }
    function hillPath(r, width, minH, maxH) {
        let d = "M0 " + GROUND;
        for (let x = 0; x <= width; x += 140) {
            d += " L" + x + " " + (GROUND - minH - r() * (maxH - minH)).toFixed(0);
        }
        d += " L" + width + " " + GROUND + " Z";
        return d;
    }
    function buildStatic(arena) {
        staticSeed = arena.seed;
        let s = '<rect x="0" y="' + GROUND + '" width="' + WORLD_W + '" height="' + (VIEW_H - GROUND) + '" fill="#dfe7f0"/>';
        s += '<line x1="0" y1="' + GROUND + '" x2="' + WORLD_W + '" y2="' + GROUND + '" stroke="#94a3b8" stroke-width="2"/>';
        for (let x = 160; x < WORLD_W; x += 160) {
            s += '<line x1="' + x + '" y1="' + (GROUND + 9) + '" x2="' + x + '" y2="' + (GROUND + 15) + '" stroke="#b6c2d2" stroke-width="2"/>';
        }
        for (let i = 0; i < 2; i++) {
            s += '<rect x="' + (SPAWN[i] - 26) + '" y="' + (GROUND - 3) + '" width="52" height="6" rx="3" fill="' + SEAT_LIGHT[i] + '" opacity="0.8"/>';
        }
        staticG.innerHTML = s;
        const r1 = rng(arena.seed + 11), r2 = rng(arena.seed + 23);
        farG.innerHTML = '<path d="' + hillPath(r1, WORLD_W * 0.25 + VIEW_W + 240, 60, 150) + '" fill="#e7edf4"/>';
        nearG.innerHTML = '<path d="' + hillPath(r2, WORLD_W * 0.5 + VIEW_W + 240, 26, 88) + '" fill="#dbe3ee"/>';
    }
    function drawPlayer(view, p, seat, x, y) {
        const stroke = p.hurt > 0 ? "#ef4444" : SEAT_STROKE[seat];
        const frozen = view.phase === "play" && view.initT > 0 && seat !== view.first && !p.dead;
        const rot = p.dead ? Math.min(90, p.deadT * 220) * (p.face || 1) : 0;
        const op = p.dead ? 0.85 : frozen ? 0.55 : 1;
        let s = '<g transform="translate(' + x.toFixed(1) + "," + y.toFixed(1) + ") rotate(" + rot.toFixed(1) + ')" opacity="' + op + '">';
        s += '<g stroke="' + stroke + '" stroke-width="2.6" fill="none" stroke-linecap="round">';
        s += '<circle cx="0" cy="-50" r="8" fill="#fff"/>';
        s += '<circle cx="' + (p.face * 3) + '" cy="-52" r="1.6" fill="' + stroke + '" stroke="none"/>';
        s += '<path d="M0 -42V-20"/>';
        if (!p.onGround && !p.dead) {
            s += '<path d="M0 -20l-7 14"/><path d="M0 -20l8 10"/>';
        } else {
            const sw = Math.abs(p.vx) > 1 && p.onGround ? Math.sin(p.walk) * 6 : 0;
            s += '<path d="M0 -20l' + (-7 + sw).toFixed(1) + ' 20"/><path d="M0 -20l' + (7 - sw).toFixed(1) + ' 20"/>';
        }
        s += '<path d="M0 -36l' + (-p.face * 7) + ' 8"/>';
        const ca = Math.cos(p.aim), sa = -Math.sin(p.aim);
        const gl = 26 - 60 * p.recoil;
        s += '<path d="M0 -36L' + (ca * 12).toFixed(1) + " " + (-36 + sa * 12).toFixed(1) + '"/>';
        s += '<path d="M' + (ca * 12).toFixed(1) + " " + (-36 + sa * 12).toFixed(1) + "L" + (ca * gl).toFixed(1) + " " + (-36 + sa * gl).toFixed(1) + '" stroke="#334155" stroke-width="4.5"/>';
        if (p.recoil > 0.055) {
            s += '<circle cx="' + (ca * 32).toFixed(1) + '" cy="' + (-36 + sa * 32).toFixed(1) + '" r="4" fill="#fbbf24" stroke="none" opacity="' + (p.recoil / 0.1).toFixed(2) + '"/>';
        }
        s += "</g>";
        if (!p.dead) {
            s += '<rect x="-15" y="-70" width="30" height="3.5" rx="1.75" fill="#e2e8f0"/>';
            s += '<rect x="-15" y="-70" width="' + ((30 * p.hp) / 100).toFixed(1) + '" height="3.5" rx="1.75" fill="' + SEAT_FILL[seat] + '"/>';
            s += '<text x="0" y="-77" text-anchor="middle" font-size="10" fill="#64748b">' + esc(nameOf(seat)) + (seat === localSeat() ? " ★" : "") + "</text>";
            if (frozen) s += '<text x="0" y="-90" text-anchor="middle" font-size="12">🔒</text>';
        }
        s += "</g>";
        return s;
    }
    function render(view, dt, now) {
        const isGuest = online && !room.isHost;
        const meSeat = localSeat();
        const dp = [];
        for (let s = 0; s < 2; s++) {
            const p = view.players[s];
            if (isGuest) {
                if (!dispP[s]) dispP[s] = { x: p.x, y: p.y };
                const k = 1 - Math.exp(-dt * 14);
                dispP[s].x += (p.x - dispP[s].x) * k;
                dispP[s].y += (p.y - dispP[s].y) * k;
                dp.push(dispP[s]);
            } else { dispP[s] = { x: p.x, y: p.y }; dp.push(dispP[s]); }
        }
        const db = [];
        if (isGuest) {
            const seen = new Set();
            const k = 1 - Math.exp(-dt * 20);
            for (const b of view.bullets) {
                seen.add(b.id);
                let e = dispB.get(b.id);
                if (!e) { e = { x: b.x, y: b.y }; dispB.set(b.id, e); }
                else { e.x += (b.x - e.x) * k; e.y += (b.y - e.y) * k; }
                db.push({ x: e.x, y: e.y, vx: b.vx, vy: b.vy, o: b.o });
            }
            for (const id of Array.from(dispB.keys())) if (!seen.has(id)) dispB.delete(id);
        } else {
            for (const b of view.bullets) db.push(b);
        }
        const target = clamp(dp[meSeat].x + view.players[meSeat].face * 90 - VIEW_W / 2, 0, WORLD_W - VIEW_W);
        cam += (target - cam) * (1 - Math.exp(-dt * 6));
        shake = Math.max(0, shake - dt * 26);
        const sx = (Math.random() - 0.5) * shake, sy = (Math.random() - 0.5) * shake * 0.6;
        worldG.setAttribute("transform", "translate(" + (-cam + sx).toFixed(1) + "," + sy.toFixed(1) + ")");
        farG.setAttribute("transform", "translate(" + (-cam * 0.25 + sx * 0.4).toFixed(1) + "," + (sy * 0.3).toFixed(1) + ")");
        nearG.setAttribute("transform", "translate(" + (-cam * 0.5 + sx * 0.6).toFixed(1) + "," + (sy * 0.5).toFixed(1) + ")");
        cloudT += dt;
        const cg = cloudsG.children;
        for (let i = 0; i < clouds.length && i < cg.length; i++) {
            const c = clouds[i];
            const cx = ((c.base + cloudT * c.v) % (VIEW_W + 260)) - 130;
            cg[i].setAttribute("transform", "translate(" + cx.toFixed(1) + "," + c.y.toFixed(1) + ") scale(" + c.sc.toFixed(2) + ")");
        }
        if (staticSeed !== view.arena.seed) buildStatic(view.arena);
        let cs = "";
        for (const c of view.arena.crates) {
            const top = GROUND - c.h;
            cs += '<g><rect x="' + c.x + '" y="' + top + '" width="' + c.w + '" height="' + c.h + '" rx="4" fill="#fff" stroke="#94a3b8" stroke-width="2"/>';
            cs += '<path d="M' + (c.x + 4) + " " + (top + 4) + "L" + (c.x + c.w - 4) + " " + (GROUND - 4) + "M" + (c.x + c.w - 4) + " " + (top + 4) + "L" + (c.x + 4) + " " + (GROUND - 4) + '" stroke="#e2e8f0" stroke-width="2"/>';
            if (c.h === 88) cs += '<line x1="' + c.x + '" y1="' + (top + 44) + '" x2="' + (c.x + c.w) + '" y2="' + (top + 44) + '" stroke="#e2e8f0" stroke-width="2"/>';
            if (c.hp < c.max) {
                const o = (1 - c.hp / c.max).toFixed(2);
                cs += '<path d="M' + (c.x + c.w * 0.3) + " " + (top + 6) + "l6 10l-5 8M" + (c.x + c.w * 0.7) + " " + (top + 12) + 'l-6 12" stroke="#64748b" stroke-width="1.5" fill="none" opacity="' + o + '"/>';
            }
            cs += "</g>";
        }
        cratesG.innerHTML = cs;
        let ds = "";
        const foeSeat = 1 - meSeat;
        ds += drawPlayer(view, view.players[foeSeat], foeSeat, dp[foeSeat].x, dp[foeSeat].y);
        ds += drawPlayer(view, view.players[meSeat], meSeat, dp[meSeat].x, dp[meSeat].y);
        for (const b of db) {
            ds += '<line x1="' + (b.x - b.vx * 0.03).toFixed(1) + '" y1="' + (b.y - b.vy * 0.03).toFixed(1) + '" x2="' + b.x.toFixed(1) + '" y2="' + b.y.toFixed(1) + '" stroke="' + SEAT_FILL[b.o] + '" stroke-width="3" opacity="0.35" stroke-linecap="round"/>';
            ds += '<circle cx="' + b.x.toFixed(1) + '" cy="' + b.y.toFixed(1) + '" r="4.5" fill="' + SEAT_FILL[b.o] + '"/><circle cx="' + b.x.toFixed(1) + '" cy="' + b.y.toFixed(1) + '" r="2" fill="#fff"/>';
        }
        if (now < aimUntil && manualAim !== null && view.phase === "play" && !view.players[meSeat].dead) {
            const mp = view.players[meSeat];
            const mx = mp.x + Math.cos(manualAim) * 32, my = mp.y - 36 - Math.sin(manualAim) * 32;
            ds += '<line x1="' + mx.toFixed(1) + '" y1="' + my.toFixed(1) + '" x2="' + (mx + Math.cos(manualAim) * 70).toFixed(1) + '" y2="' + (my - Math.sin(manualAim) * 70).toFixed(1) + '" stroke="#64748b" stroke-width="2" stroke-dasharray="3 7" opacity="0.4"/>';
        }
        dynG.innerHTML = ds;
        let fs = "";
        const keep = [];
        for (const f of fx) {
            f.t += dt;
            if (f.t >= f.life) continue;
            f.x += f.vx * dt; f.y += f.vy * dt; f.vy += f.g * dt;
            const o = (1 - f.t / f.life).toFixed(2);
            if (f.s === "c") fs += '<circle cx="' + f.x.toFixed(1) + '" cy="' + f.y.toFixed(1) + '" r="' + f.r + '" fill="' + f.c + '" opacity="' + o + '"/>';
            else if (f.s === "r") fs += '<rect x="' + (f.x - f.r).toFixed(1) + '" y="' + (f.y - f.r).toFixed(1) + '" width="' + f.r * 2 + '" height="' + f.r * 2 + '" fill="' + f.c + '" opacity="' + o + '"/>';
            else fs += '<text x="' + f.x.toFixed(1) + '" y="' + f.y.toFixed(1) + '" font-size="' + f.r + '" font-weight="800" fill="' + f.c + '" stroke="#fff" stroke-width="3" paint-order="stroke" text-anchor="middle" opacity="' + o + '">' + f.txt + "</text>";
            keep.push(f);
        }
        fx = keep;
        fxG.innerHTML = fs;
        let es = "";
        const fp = view.players[foeSeat];
        const scrX = fp.x - cam;
        if ((scrX < 0 || scrX > VIEW_W) && !fp.dead) {
            const ex = scrX < 0 ? 16 : VIEW_W - 16;
            const ey = clamp(fp.y - 36, 40, 330);
            const dir = scrX < 0 ? -1 : 1;
            es += '<g opacity="0.9"><circle cx="' + ex + '" cy="' + ey + '" r="11" fill="#fff" stroke="' + SEAT_FILL[foeSeat] + '" stroke-width="2"/>';
            es += '<path d="M' + (ex - dir * 2) + " " + (ey - 5) + "L" + (ex + dir * 5) + " " + ey + "L" + (ex - dir * 2) + " " + (ey + 5) + '" fill="none" stroke="' + SEAT_FILL[foeSeat] + '" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></g>';
        }
        edgeG.innerHTML = es;
        hurtFlash = Math.max(0, hurtFlash - dt);
        vigEl.style.opacity = ((hurtFlash / 0.35) * 0.9).toFixed(2);
        let countKey = "";
        if (view.phase === "countdown") {
            const n = Math.max(1, Math.ceil(view.t / 0.8));
            countKey = "c" + n;
            if (countEl.__k !== countKey) {
                countEl.__k = countKey;
                countEl.innerHTML = "<b>" + n + "</b><span>🪙 mengundi giliran awal&hellip;</span>";
            }
            countEl.hidden = false;
        } else { countEl.hidden = true; countEl.__k = ""; }
        if (view.phase === "play" && view.initT > 0) {
            setText(initEl, "⚡ " + nameOf(view.first) + " jalan duluan!");
            initEl.hidden = false;
        } else initEl.hidden = true;
    }

    /* ---------- HUD & overlay ---------- */
    function updateHud(view) {
        const meSeat = localSeat();
        for (let slot = 0; slot < 2; slot++) {
            const seat = slot === 0 ? meSeat : 1 - meSeat;
            const card = hud.cards[slot];
            if (card.__seat !== seat) { card.__seat = seat; card.setAttribute("data-seat", String(seat)); }
            setText(hud.names[slot], nameOf(seat));
            hud.you[slot].hidden = seat !== meSeat;
            const p = view.players[seat];
            const hp = Math.max(0, Math.ceil(p.hp));
            const w = hp + "%";
            if (hud.hp[slot].__w !== w) { hud.hp[slot].__w = w; hud.hp[slot].style.width = w; }
            hud.hp[slot].classList.toggle("low", hp < 30 && hp > 0);
            const wins = view.wins[seat];
            if (hud.pips[slot].__v !== wins) {
                hud.pips[slot].__v = wins;
                let ph = "";
                for (let i = 0; i < WIN_TARGET; i++) ph += '<i class="' + (i < wins ? "on" : "") + '"></i>';
                hud.pips[slot].innerHTML = ph;
            }
            setText(hud.score[slot], String(view.score[seat]));
        }
        setText(hud.round, "Ronde " + Math.max(1, view.round));
        const tsec = Math.max(0, Math.ceil(view.roundT));
        setText(hud.timer, String(tsec));
        hud.timer.classList.toggle("hot", view.phase === "play" && tsec < 10);
        const paused = !online && (tutOpen || cheatOpen);
        let status = "Siap";
        if (paused && view.phase !== "lobby" && view.phase !== "matchEnd") status = "Jeda";
        else if (view.phase === "countdown") status = "Bersiap…";
        else if (view.phase === "play") status = "Bermain";
        else if (view.phase === "roundEnd") status = "Ronde selesai";
        else if (view.phase === "matchEnd") status = "Selesai";
        else if (online && !room.isHost && !net.snap) status = "Menghubungkan…";
        setText(hud.status, status);
    }
    function refreshLobby() {
        setText(hud.lobbyinfo, online
            ? "Duel online vs " + nameOf(1 - localSeat()) + ". Posisi kiri/kanan diacak saat mulai. Menang 3 ronde untuk juara."
            : "Latihan vs Bot. Arena dibuat acak tiap ronde dan selalu bisa diselesaikan. Menang 3 ronde untuk juara.");
        hud.startBtn.hidden = !canStart();
        hud.wait.hidden = canStart();
        if (!canStart()) setText(hud.wait, net.snap ? "Menunggu host memulai…" : "Menghubungkan ke host…");
        setText(hud.best, String(best));
    }
    function syncPhase(view) {
        if (view.phase === lastPhase) return;
        lastPhase = view.phase;
        ovLobby.hidden = view.phase !== "lobby";
        ovEnd.hidden = view.phase !== "matchEnd";
        if (view.phase === "lobby") refreshLobby();
        if (view.phase === "countdown" && view.round === 1) {
            showBanner("Kamu: " + SEAT_NAME[localSeat()] + " · start dari " + (localSeat() === 0 ? "kiri" : "kanan"));
        }
        if (view.phase === "matchEnd") {
            const meSeat = localSeat();
            const winner = view.wins[0] > view.wins[1] ? 0 : 1;
            setText(hud.endtitle, winner === meSeat ? "🏆 Kamu menang!" : "💀 Kamu kalah");
            setText(hud.endinfo, nameOf(0) + " " + view.score[0] + " — " + view.score[1] + " " + nameOf(1) + " · Menang ronde " + view.wins[0] + "–" + view.wins[1]);
            hud.rematchBtn.hidden = !canStart();
            hud.wait2.hidden = canStart();
            if (bestSavedMatch !== matchSeen) {
                bestSavedMatch = matchSeen;
                const sc = view.score[meSeat];
                let rec = false;
                if (sc > best) { best = sc; rec = true; try { localStorage.setItem(META.bestKey, String(best)); } catch (e) { } }
                setText(hud.endbest, "Skor terbaik: " + best + (rec ? " · Rekor baru! 🎉" : ""));
                setText(hud.best, String(best));
            }
        }
        if (online && room.isHost) publish(true);
    }

    /* ---------- input: keyboard + mouse (desktop), tombol virtual (mobile) ---------- */
    function composeLocal(now) {
        return {
            l: flags.kl || flags.bl ? 1 : 0,
            r: flags.kr || flags.br ? 1 : 0,
            j: flags.kj || flags.bj ? 1 : 0,
            f: flags.kf || flags.bf || flags.boardF ? 1 : 0,
            aim: now < aimUntil ? manualAim : null,
        };
    }
    function clearFlags() {
        flags.kl = flags.kr = flags.kj = flags.kf = 0;
        flags.bl = flags.br = flags.bj = flags.bf = 0;
        flags.boardF = 0;
    }
    function openTut() { tutOpen = true; ovTut.hidden = false; }
    function closeTut() { tutOpen = false; ovTut.hidden = true; }
    function openCheats() { if (online) return; cheatOpen = true; ovCheat.hidden = false; }
    function closeCheats() { cheatOpen = false; ovCheat.hidden = true; }
    function onKeyDown(e) {
        if (destroyed) return;
        if (e.code === "Escape") { closeTut(); closeCheats(); return; }
        if (e.code === "KeyC" && !online) {
            e.preventDefault();
            if (cheatOpen) closeCheats(); else if (!tutOpen) openCheats();
            return;
        }
        if (tutOpen || cheatOpen) return;
        if (e.code === "Enter" && state && (state.phase === "lobby" || state.phase === "matchEnd") && canStart()) {
            e.preventDefault(); submitAction({ type: "start" }); return;
        }
        let used = true;
        switch (e.code) {
            case "ArrowLeft": case "KeyA": flags.kl = 1; break;
            case "ArrowRight": case "KeyD": flags.kr = 1; break;
            case "ArrowUp": case "KeyW": flags.kj = 1; break;
            case "Space": case "KeyJ": flags.kf = 1; break;
            default: used = false;
        }
        if (used) e.preventDefault();
    }
    function onKeyUp(e) {
        if (destroyed) return;
        switch (e.code) {
            case "ArrowLeft": case "KeyA": flags.kl = 0; break;
            case "ArrowRight": case "KeyD": flags.kr = 0; break;
            case "ArrowUp": case "KeyW": flags.kj = 0; break;
            case "Space": case "KeyJ": flags.kf = 0; break;
        }
    }
    function aimAt(e) {
        const src = online && !room.isHost ? net.snap : state;
        if (!src) return;
        const me = src.players[localSeat()];
        const r = svg.getBoundingClientRect();
        if (!r.width) return;
        const wx = cam + ((e.clientX - r.left) * VIEW_W) / r.width;
        const wy = ((e.clientY - r.top) * VIEW_H) / r.height;
        const a = Math.atan2(me.y - 36 - wy, wx - me.x);
        manualAim = Math.round(a * 1000) / 1000;
        aimUntil = performance.now() + 1200;   // bidik manual sementara, lalu kembali otomatis
    }
    function onBoardDown(e) {
        if (destroyed || tutOpen || cheatOpen) return;
        e.preventDefault();
        aimAt(e);
        flags.boardF = 1;
    }
    function onBoardMove(e) {
        if (destroyed || tutOpen || cheatOpen) return;
        if (e.pointerType === "mouse" || e.buttons > 0) aimAt(e);
    }
    function onWinUp() { flags.boardF = 0; }
    function onBlur() { clearFlags(); }
    function onVis() { if (document.hidden) clearFlags(); }
    function onFirstTouch() { touchEl.classList.add("force"); }
    function onTouchDown(e) {
        const b = e.target.closest("[data-k]");
        if (!b || destroyed) return;
        e.preventDefault();
        try { b.setPointerCapture(e.pointerId); } catch (err) { }
        flags["b" + b.dataset.k] = 1;
    }
    function onTouchUp(e) {
        const b = e.target.closest("[data-k]");
        if (!b) return;
        flags["b" + b.dataset.k] = 0;
    }
    function onContext(e) { e.preventDefault(); }
    function handleClick(e) {
        if (destroyed) return;
        if (e.target.closest("[data-exit]")) { onExit(); return; }
        const cc = e.target.closest("[data-cheatcmd]");
        if (cc) { if (!online) submitAction({ type: "cheatcmd", cmd: cc.dataset.cheatcmd }); return; }
        const act = e.target.closest("[data-act]");
        if (!act) return;
        switch (act.dataset.act) {
            case "start": case "rematch": submitAction({ type: "start" }); break;
            case "tutorial": openTut(); break;
            case "closetut": closeTut(); break;
            case "cheats": openCheats(); break;
            case "closecheat": closeCheats(); break;
        }
    }
    function handleChange(e) {
        const c = e.target.closest("[data-cheat]");
        if (c && !online) cheats[c.dataset.cheat] = c.checked;
    }

    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("keyup", onKeyUp);
    window.addEventListener("pointerup", onWinUp);
    window.addEventListener("blur", onBlur);
    window.addEventListener("touchstart", onFirstTouch, { once: true, passive: true });
    document.addEventListener("visibilitychange", onVis);
    svg.addEventListener("pointerdown", onBoardDown);
    svg.addEventListener("pointermove", onBoardMove);
    stage.addEventListener("contextmenu", onContext);
    touchEl.addEventListener("pointerdown", onTouchDown);
    touchEl.addEventListener("pointerup", onTouchUp);
    touchEl.addEventListener("pointercancel", onTouchUp);
    touchEl.addEventListener("lostpointercapture", onTouchUp);
    root.addEventListener("click", handleClick);
    root.addEventListener("change", handleChange);

    /* ---------- loop utama (real-time 60fps, fixed-step) ---------- */
    function frame(t) {
        if (destroyed) return;
        raf = requestAnimationFrame(frame);
        if (!lastT) lastT = t;
        const dt = Math.min(0.05, (t - lastT) / 1000);
        lastT = t;
        const now = performance.now();
        const isHostSide = !online || room.isHost;
        const paused = !online && (tutOpen || cheatOpen);
        if (state && isHostSide && !paused) {
            acc += dt;
            let n = 0;
            const env = { vsBot: !online, cheats: cheats, diff: diffFor(state.round) };
            while (acc >= STEP && n < 5) {
                stepSim(state, [composeLocal(now), guestIn], STEP, env);
                acc -= STEP; n++;
            }
            if (n === 5) acc = 0;
            ingest(state);
            if (online) {
                publish(false);
                if (state.phase !== lastPubPhase) { lastPubPhase = state.phase; publish(true); }
            }
        } else if (paused) acc = 0;
        const view = online && !room.isHost ? guestView(now) : state;
        if (view) { render(view, dt, now); syncPhase(view); updateHud(view); }
        if (online && !room.isHost && net.snap) maybeSendInput(now);
        tickBanners(dt);
    }

    /* ---------- inisialisasi ---------- */
    buildClouds();
    setText(hud.mode, online ? "VS PEMAIN" : "VS BOT");
    if (online) {
        cheatBtn.disabled = true;
        cheatBtn.title = "Cheat hanya tersedia saat latihan vs Bot (offline).";
        const u0 = room.onRoom(function (r) { if (!destroyed) { roomData = r; if (state && state.phase === "lobby") refreshLobby(); } });
        if (typeof u0 === "function") unsubs.push(u0);
        if (room.isHost) {
            state = newMatch([0, 1]);
            matchSeen = state.matchId;
            publish(true);
            const u1 = room.onAction(function (a) { if (!destroyed) applyAction(a, 1); });
            if (typeof u1 === "function") unsubs.push(u1);
        } else {
            const u2 = room.onState(function (s) { if (!destroyed) receive(s); });
            if (typeof u2 === "function") unsubs.push(u2);
        }
    } else {
        state = newMatch([0, 1]);
        matchSeen = state.matchId;
    }
    refreshLobby();
    resetClientFx();
    raf = requestAnimationFrame(frame);

    return {
        destroy() {
            destroyed = true;
            if (raf) cancelAnimationFrame(raf);
            document.removeEventListener("keydown", onKeyDown);
            document.removeEventListener("keyup", onKeyUp);
            window.removeEventListener("pointerup", onWinUp);
            window.removeEventListener("blur", onBlur);
            window.removeEventListener("touchstart", onFirstTouch);
            document.removeEventListener("visibilitychange", onVis);
            svg.removeEventListener("pointerdown", onBoardDown);
            svg.removeEventListener("pointermove", onBoardMove);
            stage.removeEventListener("contextmenu", onContext);
            touchEl.removeEventListener("pointerdown", onTouchDown);
            touchEl.removeEventListener("pointerup", onTouchUp);
            touchEl.removeEventListener("pointercancel", onTouchUp);
            touchEl.removeEventListener("lostpointercapture", onTouchUp);
            root.removeEventListener("click", handleClick);
            root.removeEventListener("change", handleChange);
            for (const u of unsubs) { if (typeof u === "function") { try { u(); } catch (e) { } } }
            root.innerHTML = "";
        },
    };
}