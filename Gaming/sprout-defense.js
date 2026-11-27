/*
 * Sprout Defense: lane defense 2D (tanaman vs zombi).
 * Mode: Kampanye 10 level vs AI, Level acak (pasti bisa diselesaikan), Lawan bot,
 *       2 pemain lokal, dan PvP online (host = server autoritatif).
 * Jalankan: node tools/build-games-manifest.mjs
 */
import { iconSVG } from "../JS/icons.js";

export const META = {
    id: "sprout-defense", // harus sama dengan nama file (tanpa .js)
    name: "Sprout Defense",
    category: "arcade", // ganti ke id kategori "strategy" bila sudah ada
    catLabel: "Arcade",
    desc: "Tanam pertahanan di 5 lane dan hentikan zombi. Lawan AI, bot, teman lokal, atau online.",
    art: '<svg viewBox="0 0 48 48"><circle cx="24" cy="31" r="12" fill="#fff" opacity=".9"/><path d="M24 33V15M24 20c0-6 5-9 11-8 0 6-4 9-11 8zM24 25c0-5-4-8-10-7 0 5 3 8 10 7z" fill="none" stroke="#14532d" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    bg: ["#86efac", "#16a34a"],
    bestKey: "sproutDefenseSave",
};

/* ====================== DATA ====================== */
const COLS = 9, DT = 0.05, CS = 80, LOCK = 5, SHOT_V = 6, SUN_INC = 10;

const PLANTS = {
    seed: { n: "Seedling", role: "shooter", cost: 100, hp: 100, cd: 4, rate: 1.4, dmg: 20, col: "#4ade80", d: ["Menembak zombi di lane-nya.", "Shoots zombies in its lane."] },
    bloom: { n: "Sunbloom", role: "producer", cost: 50, hp: 80, cd: 4, rate: 7, gain: 25, col: "#facc15", d: ["Menghasilkan sinar.", "Produces sun."] },
    bark: { n: "Barkwall", role: "wall", cost: 50, hp: 700, cd: 12, col: "#a16207", d: ["Tembok, menahan gigitan.", "Wall that soaks damage."] },
    frost: { n: "Frostmint", role: "frost", cost: 125, hp: 100, cd: 5, rate: 1.5, dmg: 10, slow: 3, col: "#22d3ee", d: ["Menembak es, memperlambat zombi.", "Shoots ice, slows zombies."] },
    bomb: { n: "Berry Bomb", role: "bomb", cost: 150, hp: 60, cd: 20, fuse: 0.8, dmg: 400, col: "#ef4444", d: ["Meledak di area 3x3.", "Explodes in a 3x3 area."] },
};
const ZOMBIES = {
    walker: { n: "Walker", cost: 50, hp: 100, speed: 0.22, dps: 25, cd: 3, th: 1, col: "#9ca3af", d: ["Zombi standar.", "Standard zombie."] },
    runner: { n: "Runner", cost: 75, hp: 70, speed: 0.5, dps: 25, cd: 5, th: 1.3, col: "#fb923c", d: ["Cepat tapi rapuh.", "Fast but fragile."] },
    tank: { n: "Buckethead", cost: 100, hp: 380, speed: 0.18, dps: 25, cd: 8, th: 3.5, col: "#64748b", d: ["Sangat tahan lama.", "Very durable."] },
    leaper: { n: "Leaper", cost: 125, hp: 140, speed: 0.28, dps: 25, cd: 10, th: 2.2, leap: true, col: "#a78bfa", d: ["Melompati tanaman pertama.", "Leaps over the first plant."] },
};
const P_ALL = Object.keys(PLANTS), Z_ALL = Object.keys(ZOMBIES);

const LEVELS = [
    { lanes: 1, plants: ["seed"], zombies: ["walker"], waves: 4, diff: 0.3 },
    { lanes: 3, plants: ["seed", "bloom"], zombies: ["walker"], waves: 5, diff: 0.35 },
    { lanes: 3, plants: ["seed", "bloom", "bark"], zombies: ["walker", "runner"], waves: 6, diff: 0.4 },
    { lanes: 5, plants: ["seed", "bloom", "bark"], zombies: ["walker", "runner"], waves: 6, diff: 0.45 },
    { lanes: 5, plants: ["seed", "bloom", "bark", "frost"], zombies: ["walker", "runner", "tank"], waves: 7, diff: 0.5 },
    { lanes: 5, plants: P_ALL, zombies: ["walker", "runner", "tank"], waves: 8, diff: 0.55 },
    { lanes: 5, plants: P_ALL, zombies: Z_ALL, waves: 8, diff: 0.62 },
    { lanes: 5, plants: P_ALL, zombies: Z_ALL, waves: 9, diff: 0.7 },
    { lanes: 5, plants: P_ALL, zombies: Z_ALL, waves: 10, diff: 0.78 },
    { lanes: 5, plants: P_ALL, zombies: Z_ALL, waves: 12, diff: 0.88 },
].map((l, i) => ({ ...l, seed: 1000 + i * 37, sun: 150 }));

/* Teks [id, en] */
const I = {
    tag: ["Pertahankan taman dari zombi, atau kirim zombi ke taman lawan.", "Defend your garden from zombies, or send them at your rival."],
    campaign: ["Kampanye", "Campaign"], campaignD: ["10 level melawan AI", "10 levels vs AI"],
    random: ["Level acak", "Random level"], randomD: ["Selalu bisa diselesaikan", "Always winnable"],
    vsbot: ["Lawan bot", "Versus bot"], vsbotD: ["Pilih sisi, hadapi AI adaptif", "Pick a side, face the bot"],
    local: ["2 pemain", "2 players"], localD: ["Satu perangkat, tanaman vs zombi", "One device, plants vs zombies"],
    help: ["Cara bermain", "How to play"], back: ["Kembali", "Back"], level: ["Level", "Level"],
    play: ["Main", "Play"], seed: ["Seed", "Seed"], reroll: ["Acak ulang", "Reroll"],
    plants: ["Tanaman", "Plants"], zombies: ["Zombi", "Zombies"], sun: ["Sinar", "Sun"], brains: ["Otak", "Brains"],
    wave: ["Gelombang {0}/{1}", "Wave {0}/{1}"], pause: ["Jeda", "Pause"], resume: ["Lanjut", "Resume"], menu: ["Menu", "Menu"],
    retry: ["Ulangi", "Retry"], next: ["Level berikutnya", "Next level"], rematch: ["Main lagi", "Rematch"], newRand: ["Level acak baru", "New random level"],
    win: ["Kamu menang!", "You win!"], lose: ["Kamu kalah", "You lose"], pWin: ["Tanaman menang!", "Plants win!"], zWin: ["Zombi menang!", "Zombies win!"],
    firstYou: ["Undian koin: kamu jalan duluan", "Coin flip: you move first"],
    firstOpp: ["Undian koin: lawan jalan duluan, kamu terkunci {0} detik", "Coin flip: opponent moves first, you are locked {0}s"],
    firstSide: ["Undian koin: {0} jalan duluan", "Coin flip: {0} move first"],
    youAre: ["Kamu bermain sebagai {0}", "You play as {0}"],
    locked: ["Terkunci {0} detik", "Locked {0}s"],
    lobbyHost: ["Mulai setelah temanmu masuk. Sisi dan giliran awal diacak.", "Start once your friend has joined. Sides and first move are random."],
    lobbyGuest: ["Menunggu host memulai pertandingan…", "Waiting for the host to start…"],
    start: ["Mulai", "Start"], waitHost: ["Menunggu host untuk main lagi…", "Waiting for host to rematch…"],
    noRes: ["Sumber daya kurang", "Not enough resources"], onCd: ["Masih cooldown", "Still cooling down"], occ: ["Petak sudah terisi", "Tile occupied"],
    cheat: ["Cheat", "Cheat"], cheatNote: ["Progres tidak disimpan jika cheat dipakai.", "Progress is not saved when cheats are used."],
    cSun: ["+500 sumber daya", "+500 resources"], cCd: ["Tanpa cooldown", "No cooldown"], cFreeze: ["Bekukan zombi", "Freeze zombies"],
    cGod: ["Tanaman kebal", "Invincible plants"], cKill: ["Hapus semua zombi", "Clear all zombies"], cWin: ["Menang instan", "Instant win"], cSpeed: ["Kecepatan", "Speed"],
    hGoal: ["Tujuan", "Goal"], hCtl: ["Kontrol", "Controls"],
    hPve: ["Kampanye: tanam pertahanan sampai semua gelombang zombi habis. Jika zombi menembus tepi kiri, kamu kalah.", "Campaign: build defenses until every zombie wave is gone. If a zombie reaches the left edge, you lose."],
    hPvp: ["PvP: tanaman bertahan sampai waktu habis; zombi menang jika menembus tepi kiri. Zombi memakai otak yang terkumpul seiring waktu.", "PvP: plants survive until time runs out; zombies win by breaking through. Zombies spend brains that build up over time."],
    hFirst: ["Undian koin menentukan siapa jalan duluan. Pihak kedua terkunci 5 detik tapi dapat bonus awal.", "A coin flip decides who moves first. The other side is locked 5s but gets a small bonus."],
    hKb: ["Keyboard: panah/WASD gerak kursor, Spasi/Enter beraksi, 1-5 atau Q/E ganti kartu, P/Esc jeda, H bantuan, C cheat. Mode 2 pemain: P1 = WASD + Spasi, P2 = panah + Enter.", "Keyboard: arrows/WASD move, Space/Enter act, 1-5 or Q/E switch card, P/Esc pause, H help, C cheat. 2 players: P1 = WASD + Space, P2 = arrows + Enter."],
    hMouse: ["Mouse: klik kartu lalu klik petak (zombi: klik lane).", "Mouse: click a card, then a tile (zombies: click a lane)."],
    hTouch: ["Layar sentuh: ketuk kartu lalu petak, atau pakai tombol virtual (tombol Pad).", "Touch: tap a card then a tile, or use the virtual buttons (Pad button)."],
    sReady: ["Siap", "Ready"], sPlay: ["Bermain", "Playing"], sPause: ["Jeda", "Paused"], sLose: ["Kalah", "Defeated"], sWin: ["Menang", "Victory"],
    seedNote: ["Seed sama = level sama.", "Same seed = same level."], noLevel: ["Selesaikan level sebelumnya", "Clear the previous level"],
};

/* ====================== ENGINE (deterministik, bisa diserialisasi) ====================== */
function mulberry32(a) {
    return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const sid = () => Math.random().toString(36).slice(2, 9);

function newState(o) {
    const s = {
        v: 1, sid: sid(), phase: "play", mode: o.mode, n: 0, uid: 1, lanes: o.lanes,
        avail: { plants: o.plants, zombies: o.zombies }, sides: o.sides, first: o.first,
        res: { plants: o.sunStart, zombies: o.brainStart }, inc: { plants: o.sunInc, zombies: o.brainInc },
        ready: {}, lock: { plants: 0, zombies: 0 }, plants: [], zombies: [], shots: [], fx: [],
        waves: o.waves || [], wi: 0, limit: o.limit || 0, winner: null,
        cheat: { nocd: false, freeze: false, god: false }, lv: o.lv || null,
    };
    const second = o.first === "plants" ? "zombies" : "plants";
    s.lock[second] = LOCK; s.res[second] += 25;
    return s;
}

function spawnZ(s, k, r) {
    s.zombies.push({ id: s.uid++, k, r, x: COLS + 0.3, hp: ZOMBIES[k].hp, slow: 0, leaped: false });
}

function weakest(s) {
    const W = { shooter: 3, frost: 2.5, wall: 1.2, bomb: 1.5, producer: 0.3 };
    let best = 0, bs = 1e9;
    for (let i = 0; i < s.lanes; i++) {
        const r = (i + s.n) % s.lanes;
        let v = s.zombies.filter((z) => z.r === r).length * 0.8;
        for (const p of s.plants) if (p.r === r) v += W[PLANTS[p.k].role];
        if (v < bs) { bs = v; best = r; }
    }
    return best;
}

function step(s) {
    if (s.phase !== "play") return;
    s.n++;
    const t = s.n * DT;
    s.res.plants += s.inc.plants * DT; s.res.zombies += s.inc.zombies * DT;
    while (s.wi < s.waves.length && s.waves[s.wi].t <= t) {
        const w = s.waves[s.wi++]; spawnZ(s, w.z, w.r < 0 ? weakest(s) : w.r);
    }
    for (const p of s.plants) {
        const d = PLANTS[p.k]; p.cd -= DT;
        if (d.role === "shooter" || d.role === "frost") {
            if (p.cd <= 0 && s.zombies.some((z) => z.r === p.r && z.x > p.c + 0.4 && z.x < COLS + 0.4)) {
                s.shots.push({ id: s.uid++, r: p.r, x: p.c + 0.8, dmg: d.dmg, slow: d.slow || 0 }); p.cd = d.rate;
            }
        } else if (d.role === "producer") {
            if (p.cd <= 0) { s.res.plants += d.gain; p.cd = d.rate; p.pulse = t; }
        } else if (d.role === "bomb" && p.cd <= 0) {
            for (const z of s.zombies) if (Math.abs(z.r - p.r) <= 1 && Math.abs(z.x - p.c - 0.5) <= 1.6) z.hp -= d.dmg;
            s.fx.push({ r: p.r, c: p.c, t }); p.hp = 0;
        }
    }
    for (const b of s.shots) {
        b.x += SHOT_V * DT;
        let hit = null;
        for (const z of s.zombies) if (z.r === b.r && z.x >= b.x - 0.3 && z.x - b.x < 0.45 && (!hit || z.x < hit.x)) hit = z;
        if (hit) { hit.hp -= b.dmg; if (b.slow) hit.slow = b.slow; b.dead = true; } else if (b.x > COLS + 1) b.dead = true;
    }
    s.shots = s.shots.filter((b) => !b.dead);
    for (const z of s.zombies) {
        const d = ZOMBIES[z.k], sf = z.slow > 0 ? 0.5 : 1;
        if (z.slow > 0) z.slow -= DT;
        const col = Math.floor(z.x - 0.35);
        const p = s.plants.find((q) => q.r === z.r && q.c === col && q.hp > 0);
        if (p && d.leap && !z.leaped) { z.leaped = true; z.x = col + 0.3; z.jump = t; }
        else if (p) { if (!s.cheat.god) p.hp -= d.dps * sf * DT; }
        else if (!s.cheat.freeze) z.x -= d.speed * sf * DT;
        if (z.x <= 0) { s.phase = "over"; s.winner = "zombies"; }
    }
    s.zombies = s.zombies.filter((z) => z.hp > 0);
    s.plants = s.plants.filter((p) => p.hp > 0);
    s.fx = s.fx.filter((f) => t - f.t < 0.6);
    if (s.phase === "play") {
        if (s.mode === "pve" && s.wi >= s.waves.length && !s.zombies.length) { s.phase = "over"; s.winner = "plants"; }
        else if (s.mode === "pvp" && s.limit && t >= s.limit) { s.phase = "over"; s.winner = "plants"; }
    }
}

/** Validasi + eksekusi aksi. Mengembalikan null jika sukses, atau kode galat. */
function act(s, side, a) {
    if (s.phase !== "play") return "over";
    const t = s.n * DT;
    if (t < s.lock[side]) return "locked";
    const isP = side === "plants", D = isP ? PLANTS : ZOMBIES;
    if (!a || a.type !== (isP ? "place" : "spawn")) return "bad";
    const d = D[a.k];
    if (!d || !s.avail[side].includes(a.k) || !Number.isInteger(a.r) || a.r < 0 || a.r >= s.lanes) return "bad";
    if (isP) {
        if (!Number.isInteger(a.c) || a.c < 0 || a.c >= COLS) return "bad";
        if (s.plants.some((p) => p.r === a.r && p.c === a.c)) return "occ";
    }
    if (s.res[side] < d.cost) return "noRes";
    if (!s.cheat.nocd && (s.ready[a.k] || 0) > t) return "onCd";
    s.res[side] -= d.cost; s.ready[a.k] = t + d.cd;
    if (isP) s.plants.push({ id: s.uid++, k: a.k, r: a.r, c: a.c, hp: d.hp, cd: d.role === "bomb" ? d.fuse : d.role === "producer" ? d.rate * 0.5 : 0.6 });
    else spawnZ(s, a.k, a.r);
    return null;
}

/* ---------- Bot tanaman (juga dipakai sebagai "solver" untuk memvalidasi level) ---------- */
function plantBot(s) {
    const t = s.n * DT;
    if (t < s.lock.plants) return null;
    const A = s.avail.plants, L = s.lanes, res = s.res.plants;
    const ok = (k) => A.includes(k) && res >= PLANTS[k].cost && (s.cheat.nocd || (s.ready[k] || 0) <= t);
    const at = (r, c) => s.plants.some((p) => p.r === r && p.c === c);
    const place = (k, r, cols) => { const c = cols.find((x) => x >= 0 && x < COLS && !at(r, x)); return c === undefined ? null : { type: "place", k, r, c }; };
    const cnt = (r, f) => s.plants.filter((p) => p.r === r && f(PLANTS[p.k].role)).length;
    const shooters = (r) => cnt(r, (x) => x === "shooter" || x === "frost");
    const zs = (r) => s.zombies.filter((z) => z.r === r);
    const prog = s.waves.length ? s.wi / s.waves.length : Math.min(1, t / 150);
    const lanes = [...Array(L).keys()].sort((a, b) => zs(b).length - zs(a).length);
    let a;
    for (const r of lanes) if (zs(r).length && !shooters(r) && ok("seed") && (a = place("seed", r, [2, 1, 3, 0, 4]))) return a;
    if (ok("bomb")) {
        for (const r of lanes) {
            const zr = s.zombies.filter((z) => Math.abs(z.r - r) <= 1 && z.x < 7.5 && z.x > 1.5);
            if (zr.length >= 4 || zr.some((z) => ZOMBIES[z.k].hp >= 300 && z.x < 6.5)) {
                const cx = Math.round(zr.reduce((q, z) => q + z.x, 0) / zr.length - 0.5);
                if ((a = place("bomb", r, [cx, cx - 1, cx + 1, cx - 2, cx + 2]))) return a;
            }
        }
    }
    const nb = s.plants.filter((p) => p.k === "bloom").length;
    if (ok("bloom") && nb < (L === 1 ? 1 : L === 3 ? 3 : 5)) for (let i = 0; i < L; i++) if ((a = place("bloom", (i + nb) % L, [0, 1]))) return a;
    for (const r of lanes) {
        const want = s.mode === "pve" ? 1 + Math.floor(prog * 3.2) : 1 + Math.floor(zs(r).length / 2);
        if (shooters(r) < want) {
            if (A.includes("frost") && shooters(r) >= 1 && !s.plants.some((p) => p.r === r && p.k === "frost") && ok("frost") && (a = place("frost", r, [1, 2, 3, 0, 4]))) return a;
            if (ok("seed") && (a = place("seed", r, [2, 1, 3, 0, 4, 5]))) return a;
        }
    }
    for (const r of lanes) if (ok("bark") && zs(r).some((z) => z.x < 8) && cnt(r, (x) => x === "wall") < 1 + (prog > 0.6 ? 1 : 0) && (a = place("bark", r, [5, 6, 4]))) return a;
    return null;
}

function zombieBot(s) {
    const t = s.n * DT;
    if (t < s.lock.zombies) return null;
    const opts = s.avail.zombies.filter((k) => s.res.zombies >= ZOMBIES[k].cost && (s.ready[k] || 0) <= t);
    if (!opts.length || (s.res.zombies < 100 && Math.random() < 0.35)) return null;
    const k = Math.random() < 0.5 ? opts[opts.length - 1] : opts[(Math.random() * opts.length) | 0];
    const r = Math.random() < 0.25 ? (Math.random() * s.lanes) | 0 : weakest(s);
    return { type: "spawn", k, r };
}

/* ---------- Generator level + verifikasi ---------- */
function pickZ(pool, i, rng) {
    const w = pool.map((k) => (k === "walker" ? 3 : k === "runner" ? (i >= 1 ? 1.5 : 0) : k === "tank" ? (i >= 2 ? 1.2 : 0) : i >= 3 ? 1 : 0));
    let x = rng() * w.reduce((a, b) => a + b, 0);
    for (let j = 0; j < pool.length; j++) if ((x -= w[j]) < 0) return pool[j];
    return pool[0];
}
function makeWaves(p, diff, rng) {
    const L = p.lanes, f = L === 1 ? 1 : L === 3 ? 2.2 : 3.4, gap = 13 - 5 * diff, adapt = 0.1 + 0.5 * diff, out = [];
    for (let i = 0; i < p.waves; i++) {
        let B = f * (1 + 0.42 * i) * (0.65 + 0.7 * diff);
        if (i === p.waves - 1) B *= 1.5;
        let g = 0;
        do {
            const k = pickZ(p.zombies, i, rng);
            B -= ZOMBIES[k].th;
            out.push({ t: +(i * gap + rng() * 5).toFixed(2), z: k, r: rng() < adapt ? -1 : (rng() * L) | 0 });
        } while (B > 0.5 && ++g < 80);
    }
    return out.sort((a, b) => a.t - b.t);
}
function verify(lv) {
    const s = newState({ mode: "pve", lanes: lv.lanes, plants: lv.plants, zombies: lv.zombies, waves: lv.waves.map((w) => ({ ...w, t: w.t + 3 })), sides: ["plants", "zombies"], first: "zombies", sunStart: lv.sun, sunInc: SUN_INC, brainStart: 0, brainInc: 0 });
    const end = lv.waves[lv.waves.length - 1].t + 120;
    while (s.phase === "play" && s.n * DT < end) {
        if (s.n % 10 === 0) { const a = plantBot(s); if (a) act(s, "plants", a); }
        step(s);
    }
    return s.winner === "plants";
}
/** Level dianggap valid hanya jika bot referensi (bereaksi 0,5 dtk, kasus terburuk: zombi jalan duluan) bisa memenangkannya. */
function genLevel(p) {
    let diff = p.diff, lv = null;
    for (let i = 0; i < 18; i++) {
        lv = { ...p, diff, waves: makeWaves(p, diff, mulberry32(p.seed + i * 7919)), verified: false };
        if (verify(lv)) { lv.verified = true; break; }
        diff = Math.max(0, diff - 0.06);
    }
    return lv;
}
function randParams(seed) {
    const r = mulberry32(seed), lanes = [3, 5, 5][(r() * 3) | 0];
    const plants = P_ALL.filter((k) => k === "seed" || k === "bloom" || r() < 0.75);
    const zombies = Z_ALL.filter((k) => k === "walker" || r() < 0.7);
    return { lanes, plants, zombies, waves: 6 + ((r() * 5) | 0), diff: 0.3 + r() * 0.55, seed, sun: 150 };
}
function vsState(sides) {
    return newState({ mode: "pvp", lanes: 5, plants: P_ALL, zombies: Z_ALL, waves: [], sides, first: Math.random() < 0.5 ? "plants" : "zombies", sunStart: 150, sunInc: 6, brainStart: 100, brainInc: 6, limit: 180 });
}

/* ====================== UI ====================== */
const CSS = `
.sd-app{--ink:#1f2937;--mut:#6b7280;--line:#e5e7eb;--bg:#fafaf7;--ac:#16a34a;--zc:#7c3aed;display:flex;flex-direction:column;gap:8px;flex:1 1 auto;min-width:0;min-height:0;overflow-x:clip;padding:10px;background:var(--bg);color:var(--ink);font:14px/1.45 system-ui,-apple-system,"Segoe UI",sans-serif;user-select:none;-webkit-user-select:none;touch-action:manipulation}
.sd-app *{box-sizing:border-box}
.sd-app [hidden]{display:none!important}
.sd-app button{font:inherit;color:var(--ink);background:#fff;border:1px solid var(--line);border-radius:10px;padding:8px 12px;cursor:pointer}
.sd-app button:hover:not(:disabled){border-color:#9ca3af}
.sd-app button:focus-visible,.sd-app input:focus-visible{outline:2px solid var(--ac);outline-offset:2px}
.sd-app button.pri,.sd-app button.primary{background:var(--ac);border-color:var(--ac);color:#fff}
.sd-app button:disabled{opacity:.4;cursor:not-allowed}
.sd-app .mut{color:var(--mut)}
.sd-app h1{margin:6px 0 2px;font-size:26px;letter-spacing:-.02em}
.sd-app h3{margin:0 0 8px;font-size:18px}
.sd-app.game-fill>.game-panel.sd-board[data-board]{flex:1 1 auto;min-height:0;aspect-ratio:auto}

/* HUD: info + icon controls */
.sd-hud{display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:6px 8px;border:1px solid var(--line);border-radius:12px;background:#fff;font:600 11px/1 ui-monospace,SFMono-Regular,Menlo,monospace}
.sd-chip{display:inline-flex;align-items:center;gap:5px;padding:6px 9px;border:1px solid var(--line);border-radius:999px;background:#f8fafc;color:var(--mut);white-space:nowrap;font-variant-numeric:tabular-nums}
.sd-chip b{color:var(--ink);font-weight:700}
.sd-chip [data-hud="info"]{display:block;max-width:210px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.sd-chip i.sd-dot{display:inline-block;width:9px;height:9px;border-radius:50%}
.sd-spacer{flex:1 1 auto}
.sd-btn{font-size:10px;font-weight:700;letter-spacing:.02em;padding:6px 8px;min-height:34px}
.sd-btn.on{background:#dcfce7;border-color:var(--ac)}
.sd-icon-btn{display:inline-flex;align-items:center;gap:6px}
.sd-icon-btn svg{flex:none;display:block}
.sd-btn-label{white-space:nowrap}
.sd-app .sd-hud .sd-btn[data-a="padt"] .sd-btn-label,
.sd-app .sd-hud .sd-btn[data-a="snd"] .sd-btn-label,
.sd-app .sd-hud .sd-btn[data-a="go"] .sd-btn-label,
.sd-app .sd-hud .sd-btn[data-exit] .sd-btn-label{display:none}
.sd-picon,.sd-sicon{display:inline-flex}

/* board = arena only; canvas + overlays are direct children */
.sd-board{position:relative;display:flex;align-items:center;justify-content:center;min-width:0;min-height:0;padding:0;border:1px solid var(--line);border-radius:12px;background:#fafaf7;overflow:hidden}
.sd-cv{display:block;max-width:100%;max-height:100%;border-radius:10px;touch-action:none;cursor:crosshair}
.sd-bn{position:absolute;left:50%;top:10px;z-index:3;transform:translateX(-50%);max-width:94%;background:#111827e6;color:#fff;padding:6px 12px;border-radius:999px;font-size:13px;text-align:center;pointer-events:none;opacity:0;transition:opacity .2s}
.sd-bn.on{opacity:1}

/* deck + touch pad are siblings after the board */
.sd-deck{display:flex;flex-direction:column;gap:6px;flex:none;max-height:150px;overflow:auto;padding:2px}
.sd-row{display:flex;gap:6px;min-width:0}
.sd-card{position:relative;overflow:hidden;flex:1 1 0;min-width:0;display:flex!important;flex-direction:column;align-items:flex-start;justify-content:center;padding:6px 8px!important;text-align:left;min-height:46px}
.sd-card b{font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%}
.sd-card small{color:var(--mut)}
.sd-card .sw{position:absolute;right:8px;top:8px;width:10px;height:10px;border-radius:50%}
.sd-card.sel{border-color:var(--ac)!important;box-shadow:0 0 0 2px #16a34a33}
.sd-card.zb.sel{border-color:var(--zc)!important;box-shadow:0 0 0 2px #7c3aed33}
.sd-card.off{opacity:.55}
.sd-card em{position:absolute;left:0;bottom:0;width:100%;height:0;background:#0000001f;pointer-events:none}
.sd-pads{display:none;justify-content:space-between;gap:10px;flex:none;padding:2px}
.sd-app.pad .sd-pads{display:flex}
.sd-pad{display:flex;gap:10px;align-items:center}
.sd-dp{display:grid;grid-template:repeat(3,40px)/repeat(3,40px);gap:4px}
.sd-dp button{padding:0}
.sd-dp .u{grid-area:1/2}.sd-dp .l{grid-area:2/1}.sd-dp .r{grid-area:2/3}.sd-dp .d{grid-area:3/2}
.sd-ab{display:flex;flex-direction:column;gap:4px}
.sd-ab button{padding:7px 12px}

/* menu + modal overlays */
.sd-menuwrap{position:absolute;inset:0;z-index:4;display:flex;align-items:center;justify-content:center;overflow:auto;padding:14px;background:var(--bg);border-radius:12px}
.sd-menu{text-align:center;padding:10px 4px;width:100%}
.sd-logo{width:56px;height:56px;margin:0 auto;border-radius:16px;background:#dcfce7;display:grid;place-items:center}
.sd-logo svg{width:36px;height:36px}
.sd-list{display:grid;gap:8px;max-width:360px;margin:18px auto}
.sd-big{display:flex;flex-direction:column;align-items:flex-start;padding:12px 14px!important;text-align:left}
.sd-big span{color:var(--mut);font-size:12px}
.sd-lv{display:grid;grid-template-columns:repeat(5,1fr);gap:8px;max-width:420px;margin:16px auto}
.sd-lv button{padding:14px 0;font-weight:600}
.sd-row2{display:flex;gap:8px;justify-content:center;flex-wrap:wrap;margin:10px 0}
.sd-app input{font:inherit;padding:8px 10px;border:1px solid var(--line);border-radius:10px;width:120px;text-align:center;user-select:text}
.sd-ov{position:absolute;inset:0;z-index:5;display:flex;align-items:center;justify-content:center;padding:14px;background:#fafaf7ee;border-radius:12px}
.sd-ovcard{display:flex;flex-direction:column;overflow:hidden;width:min(520px,100%);max-height:100%;padding:16px;background:#fff;border:1px solid var(--line);border-radius:14px}
.sd-head{flex:none;display:flex;align-items:center;justify-content:space-between;gap:10px}
.sd-head h3{margin:0}
.sd-body,.sd-cheats,.sd-help,.sd-grid{flex:1 1 auto;min-height:0;overflow:auto}
.sd-body p{margin:8px 0 2px}
.sd-body ul,.sd-help ul{margin:4px 0 10px;padding-left:18px}
.sd-cheats{display:grid;grid-template-columns:1fr 1fr;gap:6px;align-content:start;margin:10px 0}
.sd-cheats .on{border-color:var(--ac);background:#dcfce7}
.sd-help{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}
.sd-foot{flex:none;display:flex;align-items:center;justify-content:space-between;gap:10px;padding-top:10px;margin-top:8px;border-top:1px solid var(--line)}
.sd-note{font-size:11px;color:var(--mut)}
.sd-u{display:grid;grid-template-columns:12px 100px 38px 1fr;gap:8px;align-items:center;padding:3px 0;font-size:13px}
.sd-u i{width:10px;height:10px;border-radius:50%}
.sd-u small{color:var(--mut)}
.sd-kbd{display:inline-block;padding:1px 5px;border:1px solid var(--line);border-bottom-width:2px;border-radius:5px;background:#f8fafc;font:600 10px/1.4 ui-monospace,monospace}

/* --- Batch 02 design polish --- */
.sd-app :focus-visible,.sd-app button:focus-visible,.sd-app input:focus-visible{outline:2px solid var(--ac);outline-offset:2px}
.sd-app .sd-hud .sd-btn,.sd-app .sd-ab button{min-height:44px}
.sd-app .sd-dp button{min-height:44px;min-width:44px}
@media (pointer:coarse){.sd-app button:not(:disabled){min-height:44px}}
@media (prefers-reduced-motion:reduce){.sd-app *,.sd-app *::before,.sd-app *::after{animation-duration:.01ms!important;animation-iteration-count:1!important;transition-duration:.01ms!important}}

/* --- fill height + mobile refinements (last, beat pointer:coarse 44px) --- */
@media (max-width:640px){
  .sd-app.game-fill>.game-panel.sd-board[data-board]{flex:0 0 auto;min-height:min(70dvh,620px);aspect-ratio:auto}
  .sd-app .sd-hud{gap:5px;padding:5px 6px;margin-bottom:0}
  .sd-app .sd-hud .sd-chip{padding:4px 6px;font-size:9px}
  .sd-app .sd-hud .sd-chip[data-hud="level"],.sd-app .sd-hud .sd-chip[data-hud="side"]{display:none}
  .sd-app .sd-hud .sd-btn-label,.sd-app .sd-hud .sd-spacer{display:none}
  .sd-app .sd-hud .sd-btn{min-height:32px;min-width:0;padding:5px 9px;font-size:9px}
  .sd-app .sd-deck{max-height:108px}
  .sd-app .sd-card{min-height:44px;padding:4px 6px!important}
  .sd-app .sd-card b{font-size:11px}
  .sd-app .sd-ov{padding:8px}
  .sd-app .sd-ovcard{width:100%;height:100%;max-height:100%;padding:12px;border-radius:12px}
  .sd-app .sd-body,.sd-app .sd-cheats,.sd-app .sd-help,.sd-app .sd-grid{scrollbar-width:none}
  .sd-app .sd-body::-webkit-scrollbar,.sd-app .sd-cheats::-webkit-scrollbar,.sd-app .sd-help::-webkit-scrollbar,.sd-app .sd-grid::-webkit-scrollbar{display:none}
  .sd-app .sd-foot{position:static;margin:0;padding:8px 0 0}
  .sd-app .sd-note{display:none}
}
@media (pointer:coarse){
  .sd-app .sd-hud .sd-btn{min-height:32px;min-width:0;padding:5px 9px;font-size:9px}
  .sd-app .sd-ovcard .sd-btn{min-height:44px}
}
`;

export function mount(root, context = {}) {
    const { mode = "ai", room = null, playerName = "Player", onExit = () => { } } = context;
    const online = mode === "room" && Boolean(room);
    const playerIndex = online && !room.isHost ? 1 : 0;
    let roomData = room?.room || null;
    let state = null;

    /* ---- penyimpanan & bahasa ---- */
    const defaults = { cleared: 0, lang: "id", sound: true };
    let save = { ...defaults };
    try { save = { ...defaults, ...JSON.parse(localStorage.getItem(META.bestKey) || "{}") }; } catch { /* abaikan */ }
    const persist = () => { try { localStorage.setItem(META.bestKey, JSON.stringify(save)); } catch { /* abaikan */ } };
    const T = (k, ...a) => (I[k] ? I[k][save.lang === "en" ? 1 : 0] : k).replace(/\{(\d)\}/g, (_, i) => a[i]);

    const HELP_KEY = "sproutDefenseHelpSeen";
    const ui = {
        screen: online ? "lobby" : "menu", helpOpen: false, cheatsOpen: false, paused: false, speed: 1, ctl: [], gm: { kind: online ? "online" : "" },
        pad: !!window.matchMedia?.("(pointer:coarse)").matches, seed: 1000 + ((Math.random() * 9000) | 0),
        bn: "", bnUntil: 0, viewSid: null, ended: null, cheated: false,
    };
    let seenHelp = true;
    try { seenHelp = localStorage.getItem(HELP_KEY) === "1"; } catch { /* abaikan */ }
    if (!seenHelp) {
        ui.helpOpen = true;
        try { localStorage.setItem(HELP_KEY, "1"); } catch { /* abaikan */ }
    }
    let raf = 0, last = 0, acc = 0, syncT = 0, botT = 1.5, hudT = 0, destroyed = false, cv = null, ctx = null, pauseAt = 0, ro = null;

    root.innerHTML = `
    <style>${CSS}</style>
    <div class="game-app sd-app game-fill" data-sd>
      <div class="sd-hud">
        <span class="sd-chip" data-hud="mode">MENU</span>
        <span class="sd-chip">LV <b data-hud="level">—</b></span>
        <span class="sd-chip"><i class="sd-dot" style="background:#facc15"></i>SUN <b data-hud="sun">0</b></span>
        <span class="sd-chip" data-hud="brains" hidden><i class="sd-dot" style="background:#7c3aed"></i>BRAINS <b data-hud="brainsv">0</b></span>
        <span class="sd-chip"><span data-hud="info">READY</span></span>
        <span class="sd-chip" data-hud="side" hidden></span>
        <span class="sd-chip" data-hud="status">${T("sReady")}</span>
        <span class="sd-spacer"></span>
        <button class="sd-btn sd-icon-btn" type="button" data-a="help" aria-label="${T("help")}" title="${T("help")} (H)">${iconSVG("helpCircle", { size: 14 })}<span class="sd-btn-label">Help</span></button>
        <button class="sd-btn sd-icon-btn" type="button" data-a="cheat" data-cheats aria-label="${T("cheat")}" title="${T("cheat")} (C)">${iconSVG("wrench", { size: 14 })}<span class="sd-btn-label">Cheats</span></button>
        <button class="sd-btn sd-icon-btn" type="button" data-a="pause" data-pause aria-label="${T("pause")}" title="${T("pause")} (P)"><span class="sd-picon">${iconSVG("pause", { size: 14 })}</span><span class="sd-btn-label">Pause</span></button>
        <button class="sd-btn sd-icon-btn" type="button" data-a="restart" data-restart aria-label="Restart" title="Restart (R)">${iconSVG("refresh", { size: 14 })}<span class="sd-btn-label">Restart</span></button>
        <button class="sd-btn sd-icon-btn" type="button" data-a="padt" aria-label="Virtual pad" title="Virtual pad">${iconSVG("gamepad2", { size: 14 })}<span class="sd-btn-label">Pad</span></button>
        <button class="sd-btn sd-icon-btn" type="button" data-a="snd" aria-label="Sound" title="Sound"><span class="sd-sicon">${iconSVG("volume", { size: 14 })}</span><span class="sd-btn-label">Sound</span></button>
        <button class="sd-btn sd-icon-btn" type="button" data-a="go" data-v="menu" aria-label="${T("menu")}" title="${T("menu")}">${iconSVG("home", { size: 14 })}<span class="sd-btn-label">Menu</span></button>
        <button class="sd-btn sd-icon-btn" type="button" data-exit aria-label="Exit game" title="Exit game">${iconSVG("logOut", { size: 14 })}<span class="sd-btn-label">Exit game</span></button>
      </div>
      <section class="game-panel sd-board" data-board>
        <canvas class="sd-cv" data-cv hidden></canvas>
        <div class="sd-bn" data-bn hidden></div>
        <div class="sd-menuwrap" data-menu></div>
        <div class="sd-ov" data-ov hidden></div>
      </section>
      <div class="sd-deck" data-deck hidden></div>
      <div class="sd-pads" data-pads hidden></div>
    </div>`;
    const q = (s) => root.querySelector(s);
    const board = q("[data-board]");
    const setStatus = (k) => { const e = q('[data-hud="status"]'); if (e) e.textContent = T(k); };
    function fitCanvas() {
        if (!cv) return;
        const w = board.clientWidth, h = board.clientHeight;
        const fullW = COLS * CS, fullH = (state?.lanes || 5) * CS;
        if (w < 2 || h < 2) return;
        const scale = Math.min(w / fullW, h / fullH);
        cv.style.width = Math.max(1, fullW * scale) + "px";
        cv.style.height = Math.max(1, fullH * scale) + "px";
    }
    ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(fitCanvas) : null;
    if (ro) ro.observe(board); else window.addEventListener("resize", fitCanvas);

    /* ---- suara ---- */
    let ac = null;
    function beep(f, d = 0.08, type = "sine") {
        if (!save.sound) return;
        try {
            ac = ac || new (window.AudioContext || window.webkitAudioContext)();
            const o = ac.createOscillator(), g = ac.createGain();
            o.type = type; o.frequency.value = f; g.gain.value = 0.04; o.connect(g); g.connect(ac.destination);
            o.start(); g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + d); o.stop(ac.currentTime + d);
        } catch { /* abaikan */ }
    }

    /* ---- alur permainan ---- */
    function startPve(p, kind, no) {
        const lv = genLevel(p), first = Math.random() < 0.5 ? "plants" : "zombies", at = first === "zombies" ? 3 : 12;
        state = newState({ mode: "pve", lanes: lv.lanes, plants: lv.plants, zombies: lv.zombies, waves: lv.waves.map((w) => ({ ...w, t: w.t + at })), sides: ["plants", "zombies"], first, sunStart: lv.sun, sunInc: SUN_INC, brainStart: 0, brainInc: 0, lv: { kind, no, seed: lv.seed } });
        ui.gm = { kind, p, no, humanSide: "plants" };
        openGame();
    }
    function startVs(kind, human) {
        const sides = kind === "local" ? ["plants", "zombies"] : [human, human === "plants" ? "zombies" : "plants"];
        state = vsState(sides);
        ui.gm = { kind, humanSide: human, botSide: kind === "bot" ? sides[1] : null };
        openGame();
    }
    function beginOnline() {
        state = vsState(Math.random() < 0.5 ? ["plants", "zombies"] : ["zombies", "plants"]);
        ui.gm = { kind: "online" };
        openGame(); pushState();
    }
    function openGame() {
        ui.viewSid = state.sid; ui.ended = null; ui.paused = false; ui.speed = 1; ui.helpOpen = false; ui.cheatsOpen = false; ui.cheated = false; acc = 0; botT = 1.5; last = performance.now();
        const sides = online ? [state.sides[playerIndex]] : ui.gm.kind === "local" ? ["plants", "zombies"] : [ui.gm.humanSide];
        ui.ctl = sides.map((s, i) => ({ side: s, r: Math.floor(state.lanes / 2), c: 2, sel: 0, kmap: sides.length === 2 ? (i ? "arrows" : "wasd") : "both" }));
        ui.screen = "game";
        buildGame(); sync(); setStatus("sPlay");
        const me = ui.ctl.length === 1 ? ui.ctl[0].side : null;
        let txt = !me ? T("firstSide", T(state.first)) : state.first === me ? T("firstYou") : T("firstOpp", LOCK);
        if (online) txt = T("youAre", T(me)) + ". " + txt;
        setBanner(txt, 4.5);
    }
    function pushState() { room.publishState(JSON.parse(JSON.stringify(state))).catch(console.warn); }
    function setBanner(t, sec) { ui.bn = t; ui.bnUntil = performance.now() + sec * 1000; }
    function cheatOK() { return !online && ui.gm.kind !== "local" && ui.screen === "game" && state?.phase === "play"; }

    function onEnd() {
        const s = state, me = ui.ctl.length === 1 ? ui.ctl[0].side : null, won = me && s.winner === me;
        ui.helpOpen = false; ui.cheatsOpen = false; ui.paused = false;
        setStatus(!me ? "sWin" : won ? "sWin" : "sLose"); beep(won ? 780 : 120, 0.35, won ? "sine" : "sawtooth");
        if (ui.gm.kind === "campaign" && s.winner === "plants" && !ui.cheated && ui.gm.no + 1 > save.cleared) { save.cleared = ui.gm.no + 1; persist(); }
        sync();
    }

    /* ---- aksi (template: applyAction / submitAction / publish) ---- */
    function applyAction(action, actor) {
        if (!action) return null;
        if (action.type === "start") {
            if (online && actor === 0 && (!state || state.phase === "lobby" || state.phase === "over")) beginOnline();
            return null;
        }
        if (!state || state.phase !== "play") return "over";
        const side = state.sides[actor];
        if (!side) return "bad";
        const err = act(state, side, action);
        if (!err) { beep(side === "plants" ? 520 : 200, 0.07); publish(); }
        return err;
    }
    function submitAction(action, side) {
        if (online && !room.isHost) { room.sendAction(action).catch(console.warn); return; }
        const err = applyAction(action, online ? playerIndex : state.sides.indexOf(side));
        if (err && I[err]) { setBanner(err === "locked" ? T("locked", Math.ceil(state.lock[side] - state.n * DT)) : T(err), 1.4); beep(140, 0.1, "square"); }
    }
    function publish() {
        render();
        if (online && room.isHost) pushState();
    }
    function doAct(c) {
        if (!state || state.phase !== "play" || ui.paused || ui.helpOpen || ui.cheatsOpen) return;
        const k = state.avail[c.side][c.sel];
        submitAction(c.side === "plants" ? { type: "place", k, r: c.r, c: c.c } : { type: "spawn", k, r: c.r }, c.side);
    }
    function move(c, d) {
        const L = state.lanes;
        if (d === "u") c.r = (c.r + L - 1) % L; else if (d === "d") c.r = (c.r + 1) % L;
        else if (c.side === "plants") c.c = d === "l" ? Math.max(0, c.c - 1) : Math.min(COLS - 1, c.c + 1);
        else cycle(c, d === "l" ? -1 : 1);
    }
    function cycle(c, dv) { const n = state.avail[c.side].length; c.sel = (c.sel + dv + n) % n; }
    function toggleHelp(on) {
        ui.helpOpen = typeof on === "boolean" ? on : !ui.helpOpen;
        if (ui.helpOpen) ui.cheatsOpen = false;
        sync();
    }
    function toggleCheats(on) {
        if (!cheatOK()) return;
        ui.cheatsOpen = typeof on === "boolean" ? on : !ui.cheatsOpen;
        if (ui.cheatsOpen) ui.helpOpen = false;
        sync();
    }
    function restartGame() {
        if (ui.screen !== "game" || !state) return;
        const g = ui.gm;
        if (g.kind === "campaign" || g.kind === "random") startPve(g.p, g.kind, g.no);
        else if (g.kind === "bot" || g.kind === "local") startVs(g.kind, g.humanSide);
    }
    function togglePause() {
        if (online || ui.screen !== "game" || state?.phase !== "play") return;
        ui.paused = !ui.paused;
        if (ui.paused) { pauseAt = performance.now(); acc = 0; }
        else {
            const held = Math.max(0, performance.now() - pauseAt);
            ui.bnUntil += held;
            last = performance.now(); acc = 0; syncT = 0;
        }
        setStatus(ui.paused ? "sPause" : "sPlay");
        sync();
    }
    function cheat(v) {
        const s = state; if (!s || !cheatOK()) return;
        ui.cheated = true;
        const me = ui.ctl[0].side;
        if (v === "sun") s.res[me] += 500;
        else if (v === "nocd" || v === "freeze" || v === "god") s.cheat[v] = !s.cheat[v];
        else if (v === "kill") s.zombies = [];
        else if (v === "win") { s.phase = "over"; s.winner = me; }
        else if (v[0] === "x") ui.speed = +v.slice(1);
        sync();
    }

    /* ---- bot (hanya mode lawan bot) ---- */
    function bots() {
        const g = ui.gm; if (g.kind !== "bot") return;
        botT -= DT; if (botT > 0) return;
        botT = g.botSide === "plants" ? 0.9 + Math.random() * 0.7 : 1.4 + Math.random();
        const a = g.botSide === "plants" ? plantBot(state) : zombieBot(state);
        if (a) act(state, g.botSide, a);
    }

    /* ---- DOM ---- */
    const unitRows = (D) => Object.values(D).map((d) => `<div class="sd-u"><i style="background:${d.col}"></i><b>${d.n}</b><span>${d.cost}</span><small>${d.d[save.lang === "en" ? 1 : 0]}</small></div>`).join("");
    const li = (a) => `<ul>${a.map((x) => `<li>${x}</li>`).join("")}</ul>`;

    function menuHTML() {
        const sc = ui.screen;
        const back = `<button data-a="go" data-v="menu">${T("back")}</button>`;
        if (sc === "levels") return `<div class="sd-menu"><h3>${T("campaign")}</h3><div class="sd-lv">${LEVELS.map((l, i) => `<button data-a="lvl" data-v="${i}" ${i > save.cleared ? "disabled" : ""} title="${i > save.cleared ? T("noLevel") : ""}">${i + 1}</button>`).join("")}</div>${back}</div>`;
        if (sc === "random") return `<div class="sd-menu"><h3>${T("random")}</h3><p class="mut">${T("randomD")}. ${T("seedNote")}</p><div class="sd-row2"><input data-seed inputmode="numeric" value="${ui.seed}" aria-label="${T("seed")}"><button data-a="reroll">${T("reroll")}</button></div><div class="sd-row2"><button class="pri" data-a="rand">${T("play")}</button>${back}</div></div>`;
        if (sc === "bot") return `<div class="sd-menu"><h3>${T("vsbot")}</h3><div class="sd-row2"><button class="pri" data-a="bot" data-v="plants">${T("plants")}</button><button data-a="bot" data-v="zombies">${T("zombies")}</button></div>${back}</div>`;
        if (sc === "lobby") return `<div class="sd-menu"><h3>Sprout Defense</h3><p class="mut">${playerName}</p><p>${room.isHost ? T("lobbyHost") : T("lobbyGuest")}</p>${room.isHost ? `<button class="pri" data-a="start">${T("start")}</button>` : ""}</div>`;
        return `<div class="sd-menu"><div class="sd-logo">${iconSVG("sprout")}</div><h1>Sprout Defense</h1><p class="mut">${T("tag")}</p>
      <div class="sd-list">
        ${[["levels", "campaign"], ["random", "random"], ["bot", "vsbot"], ["local", "local"]].map(([v, k]) => `<button class="sd-big" data-a="go" data-v="${v}"><b>${T(k)}</b><span>${T(k + "D")}</span></button>`).join("")}
        <button data-a="help">${T("help")}</button>
      </div>
      <div class="sd-row2"><button data-a="lang">${save.lang === "id" ? "Bahasa: ID" : "Language: EN"}</button><button data-a="snd">${save.sound ? "Sound: on" : "Sound: off"}</button></div></div>`;
    }

    function overlayHTML() {
        const close = (a, label) => `<button class="sd-btn" type="button" data-a="${a}" aria-label="${label}">${iconSVG("x", { size: 14 })}</button>`;
        if (ui.helpOpen) {
            return `<div class="sd-ovcard">
        <div class="sd-head"><h3>${T("help")}</h3>${close("closehelp", "Close help")}</div>
        <div class="sd-help">
          <div><b>${T("hGoal")}</b>${li([T("hPve"), T("hPvp"), T("hFirst")])}<b>${T("hCtl")}</b>${li([T("hKb"), T("hMouse"), T("hTouch")])}</div>
          <div><b>${T("plants")}</b><div class="sd-grid">${unitRows(PLANTS)}</div><b>${T("zombies")}</b><div class="sd-grid">${unitRows(ZOMBIES)}</div>
            <div class="sd-foot"><span class="sd-note">H ${T("help")} · C ${T("cheat")} · P ${T("pause")}</span><button class="sd-btn pri" type="button" data-a="closehelp">OK</button></div>
          </div>
        </div></div>`;
        }
        if (ui.cheatsOpen && state) {
            const c = state.cheat, b = (v, k, on) => `<button class="sd-btn ${on ? "on" : ""}" data-a="ch" data-v="${v}">${T(k)}</button>`;
            return `<div class="sd-ovcard">
        <div class="sd-head"><h3>${T("cheat")}</h3>${close("closech", "Close cheats")}</div>
        <div class="sd-cheats"><p class="mut">${T("cheatNote")}</p>${b("sun", "cSun")}${b("nocd", "cCd", c.nocd)}${b("freeze", "cFreeze", c.freeze)}${b("god", "cGod", c.god)}${b("kill", "cKill")}${b("win", "cWin")}</div>
        <div class="sd-foot"><span class="sd-note">${T("cSpeed")}</span><div class="sd-row2">${[1, 2, 3].map((n) => `<button class="sd-btn ${ui.speed === n ? "on" : ""}" data-a="ch" data-v="x${n}">x${n}</button>`).join("")}<button class="sd-btn pri" data-a="closech">OK</button></div></div>
      </div>`;
        }
        if (ui.paused) {
            return `<div class="sd-ovcard">
        <div class="sd-head"><h3>${T("pause")}</h3></div>
        <div class="sd-body"><p>${T("sPause")}</p></div>
        <div class="sd-foot"><span class="sd-note">P / Esc</span><div class="sd-row2"><button class="sd-btn pri" data-a="resume">${T("resume")}</button><button class="sd-btn" data-a="retry">${T("retry")}</button><button class="sd-btn" data-a="go" data-v="menu">${T("menu")}</button></div></div>
      </div>`;
        }
        if (state && ui.screen === "game" && state.phase === "over") {
            const me = ui.ctl.length === 1 ? ui.ctl[0].side : null, w = state.winner;
            const title = me ? (w === me ? T("win") : T("lose")) : w === "plants" ? T("pWin") : T("zWin");
            const g = ui.gm; let btns = "";
            if (online) btns = room.isHost ? `<button class="sd-btn pri" data-a="start">${T("rematch")}</button>` : `<p class="mut">${T("waitHost")}</p>`;
            else {
                if (g.kind === "campaign" && w === "plants" && g.no < LEVELS.length - 1) btns += `<button class="sd-btn pri" data-a="lvl" data-v="${g.no + 1}">${T("next")}</button>`;
                btns += `<button class="sd-btn" data-a="retry">${g.kind === "bot" || g.kind === "local" ? T("rematch") : T("retry")}</button>`;
                if (g.kind === "random") btns += `<button class="sd-btn" data-a="reroll" data-v="go">${T("newRand")}</button>`;
                btns += `<button class="sd-btn" data-a="go" data-v="menu">${T("menu")}</button>`;
            }
            const sub = state.lv?.kind === "random" ? `${T("seed")} #${state.lv.seed}` : state.lv?.kind === "campaign" ? `${T("level")} ${state.lv.no + 1}` : "";
            const prog = g.kind === "campaign" ? `${T("campaign")} ${save.cleared}/${LEVELS.length}` : "";
            return `<div class="sd-ovcard">
        <div class="sd-head"><h3>${title}</h3></div>
        <div class="sd-body"><p class="mut">${sub}${prog ? (sub ? " · " : "") + prog : ""}</p></div>
        <div class="sd-foot"><span class="sd-note">R ${T("retry")}</span><div class="sd-row2">${btns}</div></div>
      </div>`;
        }
        return "";
    }

    function buildGame() {
        const L = state.lanes;
        const cards = ui.ctl.map((c, ci) => `<div class="sd-row">${state.avail[c.side].map((k, i) => { const d = (c.side === "plants" ? PLANTS : ZOMBIES)[k]; return `<button class="sd-card ${c.side === "zombies" ? "zb" : ""}" data-a="card" data-ci="${ci}" data-v="${i}"><i class="sw" style="background:${d.col}"></i><b>${d.n}</b><small>${d.cost}${ui.ctl.length < 2 || c.kmap === "wasd" ? " · " + (i + 1) : ""}</small><em></em></button>`; }).join("")}</div>`).join("");
        const pads = ui.ctl.map((c, ci) => `<div class="sd-pad"><div class="sd-dp">${["u", "l", "r", "d"].map((d) => `<button class="${d}" data-a="pad" data-ci="${ci}" data-v="${d}">${{ u: "&#9650;", d: "&#9660;", l: "&#9664;", r: "&#9654;" }[d]}</button>`).join("")}</div><div class="sd-ab"><button class="pri" data-a="pad" data-ci="${ci}" data-v="act">${c.side === "plants" ? "Plant" : "Send"}</button><button data-a="pad" data-ci="${ci}" data-v="next">&#8250;</button><button data-a="pad" data-ci="${ci}" data-v="prev">&#8249;</button></div></div>`).join("");
        q("[data-deck]").innerHTML = cards;
        q("[data-pads]").innerHTML = pads;
        cv = q("[data-cv]");
        const dpr = Math.min(2, window.devicePixelRatio || 1);
        cv.width = COLS * CS * dpr; cv.height = L * CS * dpr;
        ctx = cv.getContext("2d");
        fitCanvas();
    }

    function sync() {
        const inGame = ui.screen === "game";
        q("[data-menu]").hidden = inGame;
        if (!inGame) q("[data-menu]").innerHTML = menuHTML();
        q("[data-cv]").hidden = !inGame;
        q("[data-bn]").hidden = !inGame;
        q("[data-deck]").hidden = !inGame;
        q("[data-pads]").hidden = !inGame;
        q("[data-sd]").classList.toggle("pad", ui.pad && inGame);
        const ov = q("[data-ov]");
        ov.innerHTML = overlayHTML();
        ov.hidden = !ov.innerHTML;
        const pBtn = q("[data-pause]"), pLabel = pBtn.querySelector(".sd-btn-label"), pIcon = q(".sd-picon");
        const label = ui.paused ? T("resume") : T("pause");
        pBtn.disabled = !(inGame && !online && state?.phase === "play");
        if (pLabel) pLabel.textContent = label;
        pBtn.setAttribute("aria-label", label);
        pBtn.setAttribute("title", label + " (P)");
        if (pIcon) pIcon.innerHTML = iconSVG(ui.paused ? "play" : "pause", { size: 14 });
        const cBtn = q("[data-cheats]");
        cBtn.disabled = !cheatOK();
        cBtn.classList.toggle("on", ui.cheatsOpen);
        q("[data-restart]").disabled = !inGame;
        q('[data-a="padt"]').classList.toggle("on", ui.pad);
        q('[data-a="snd"]').classList.toggle("on", save.sound);
        const sIcon = q(".sd-sicon");
        if (sIcon) sIcon.innerHTML = iconSVG(save.sound ? "volume" : "volumeX", { size: 14 });
        if (!inGame) {
            setStatus("sReady");
            q('[data-hud="mode"]').textContent = ui.screen === "lobby" ? "LOBBY" : ui.screen.toUpperCase();
            q('[data-hud="level"]').textContent = "—";
            q('[data-hud="sun"]').textContent = "0";
            q('[data-hud="info"]').textContent = ui.screen === "menu" ? T("tag") : "";
            q('[data-hud="brains"]').hidden = true;
            q('[data-hud="side"]').hidden = true;
        } else if (state) hud();
        fitCanvas();
    }

    function hud() {
        const s = state, t = s.n * DT, e = (x) => q(x);
        const pv = s.mode === "pvp";
        e('[data-hud="sun"]').textContent = Math.floor(s.res.plants);
        const bc = e('[data-hud="brains"]'); bc.hidden = !pv;
        if (pv) e('[data-hud="brainsv"]').textContent = Math.floor(s.res.zombies);
        const left = Math.max(0, s.limit - t);
        e('[data-hud="info"]').textContent = pv
            ? `${Math.floor(left / 60)}:${String(Math.floor(left) % 60).padStart(2, "0")}`
            : T("wave", Math.min(s.wi, s.waves.length), s.waves.length) + (s.lv?.kind === "random" ? ` · #${s.lv.seed}` : "");
        const kinds = { campaign: T("campaign"), random: T("random"), bot: T("vsbot"), local: T("local"), online: "PvP" };
        e('[data-hud="mode"]').textContent = kinds[ui.gm.kind] || ui.gm.kind || "—";
        e('[data-hud="level"]').textContent = s.lv ? s.lv.no + 1 : "—";
        const me = ui.ctl.length === 1 ? ui.ctl[0].side : null, sc = e('[data-hud="side"]');
        sc.hidden = !me;
        if (me) {
            const lock = Math.max(0, s.lock[me] - t);
            sc.textContent = T(me === "plants" ? "plants" : "zombies") + (lock > 0 ? ` · ${T("locked", Math.ceil(lock))}` : "");
        }
        let idx = 0;
        ui.ctl.forEach((c) => {
            const D = c.side === "plants" ? PLANTS : ZOMBIES, lockLeft = s.lock[c.side] - t;
            s.avail[c.side].forEach((k, i) => {
                const el = root.querySelectorAll(".sd-card")[idx++]; if (!el) return;
                const d = D[k], cdl = s.cheat.nocd ? 0 : Math.max(0, ((s.ready[k] || 0) - t) / d.cd);
                el.classList.toggle("sel", c.sel === i); el.classList.toggle("off", s.res[c.side] < d.cost || cdl > 0 || lockLeft > 0);
                el.querySelector("em").style.height = (lockLeft > 0 ? 100 : cdl * 100) + "%";
            });
        });
        const bn = e("[data-bn]"); bn.textContent = ui.bn; bn.classList.toggle("on", performance.now() < ui.bnUntil);
    }

    /* ---- gambar kanvas ---- */
    const circ = (g, x, y, r) => { g.beginPath(); g.arc(x, y, r, 0, 7); g.fill(); g.stroke(); };
    const rr = (g, x, y, w, h, r) => { g.beginPath(); g.roundRect ? g.roundRect(x, y, w, h, r) : g.rect(x, y, w, h); g.fill(); g.stroke(); };
    const bar = (g, x, y, f, c) => { g.fillStyle = "#0002"; g.fillRect(x - 16, y, 32, 4); g.fillStyle = c; g.fillRect(x - 16, y, 32 * Math.max(0, f), 4); };

    function drawPlant(g, p, t, alpha = 1) {
        const d = PLANTS[p.k], x = p.c * CS + CS / 2, y = p.r * CS + CS / 2 + Math.sin(t * 3 + p.id) * 1.5;
        g.save(); g.globalAlpha = alpha; g.lineWidth = 2; g.strokeStyle = "#0000002e"; g.fillStyle = d.col;
        if (d.role === "shooter") { rr(g, x + 6, y - 7, 24, 14, 5); circ(g, x - 4, y, 22); g.fillStyle = "#14532d"; g.fillRect(x - 14, y - 7, 5, 5); }
        else if (d.role === "frost") { g.beginPath(); g.moveTo(x - 4, y - 26); g.lineTo(x + 20, y); g.lineTo(x - 4, y + 26); g.lineTo(x - 28, y); g.closePath(); g.fill(); g.stroke(); rr(g, x + 14, y - 5, 16, 10, 4); }
        else if (d.role === "producer") { const k = p.pulse != null && t - p.pulse < 0.4 ? 1.2 : 1; for (let i = 0; i < 8; i++) { g.fillStyle = "#fde68a"; circ(g, x + Math.cos(i * 0.785) * 18 * k, y + Math.sin(i * 0.785) * 18 * k, 8); } g.fillStyle = d.col; circ(g, x, y, 14 * k); }
        else if (d.role === "wall") { rr(g, x - 22, y - 30, 44, 60, 10); g.strokeStyle = "#0004"; g.beginPath(); g.moveTo(x - 10, y - 14); g.lineTo(x + 8, y - 14); g.moveTo(x - 6, y + 6); g.lineTo(x + 12, y + 6); g.stroke(); }
        else { circ(g, x, y + 4, 22); g.strokeStyle = "#78350f"; g.lineWidth = 3; g.beginPath(); g.moveTo(x, y - 18); g.lineTo(x + 6, y - 28); g.stroke(); if (((t * 8) | 0) % 2) { g.fillStyle = "#fde047"; circ(g, x + 7, y - 29, 4); } }
        g.restore();
        if (p.hp < d.hp) bar(g, x, p.r * CS + 4, p.hp / d.hp, "#16a34a");
    }

    function drawZombie(g, z, t) {
        const d = ZOMBIES[z.k], x = z.x * CS, w = Math.sin(t * 6 + z.id) * 3;
        let y = z.r * CS + CS / 2 + 10;
        if (z.jump != null && t - z.jump < 0.35) y -= Math.sin(((t - z.jump) / 0.35) * Math.PI) * 34;
        const bw = z.k === "runner" ? 18 : z.k === "tank" ? 28 : 24;
        g.save(); g.lineWidth = 2; g.strokeStyle = "#0000002e";
        g.fillStyle = "#475569"; g.fillRect(x - 9 + w, y + 16, 7, 10); g.fillRect(x + 2 - w, y + 16, 7, 10);
        g.fillStyle = d.col; rr(g, x - bw / 2, y - 18, bw, 36, 8); g.fillRect(x - bw / 2 - 14, y - 8, 16, 6);
        g.fillStyle = "#d9dec8"; circ(g, x - 2, y - 28, 11);
        g.fillStyle = "#111827"; g.fillRect(x - 8, y - 31, 3, 3);
        if (z.k === "tank") { g.fillStyle = "#cbd5e1"; rr(g, x - 13, y - 44, 24, 12, 3); }
        if (z.slow > 0) { g.strokeStyle = "#22d3ee"; g.lineWidth = 3; g.strokeRect(x - bw / 2 - 3, y - 41, bw + 6, 70); }
        g.restore();
        if (z.hp < d.hp) bar(g, x, y - 50, z.hp / d.hp, "#7c3aed");
    }

    function draw() {
        if (ui.screen !== "game" || !state || !ctx) return;
        const s = state, t = s.n * DT, L = s.lanes, W = COLS * CS, H = L * CS, g = ctx;
        g.setTransform(cv.width / W, 0, 0, cv.width / W, 0, 0); g.clearRect(0, 0, W, H);
        for (let r = 0; r < L; r++) for (let c = 0; c < COLS; c++) { g.fillStyle = (r + c) % 2 ? "#eef0e8" : "#f5f6f0"; g.fillRect(c * CS, r * CS, CS, CS); }
        g.fillStyle = "#16a34a66"; g.fillRect(0, 0, 6, H); g.fillStyle = "#7c3aed14"; g.fillRect(W - 14, 0, 14, H);
        for (const p of s.plants) drawPlant(g, p, t);
        for (const z of s.zombies) drawZombie(g, z, t);
        for (const b of s.shots) { g.fillStyle = b.slow ? "#22d3ee" : "#22c55e"; g.beginPath(); g.arc(b.x * CS, b.r * CS + CS / 2 - 6, 6, 0, 7); g.fill(); }
        for (const f of s.fx) { const k = (t - f.t) / 0.6; g.fillStyle = `rgba(249,115,22,${0.5 * (1 - k)})`; g.beginPath(); g.arc(f.c * CS + CS / 2, f.r * CS + CS / 2, CS * (0.5 + k * 1.3), 0, 7); g.fill(); }
        for (const c of ui.ctl) {
            if (c.side === "plants") {
                const k = s.avail.plants[c.sel], busy = s.plants.some((p) => p.r === c.r && p.c === c.c);
                drawPlant(g, { k, c: c.c, r: c.r, id: 0, hp: 1e9 }, 0, 0.35);
                g.strokeStyle = busy ? "#ef4444" : "#16a34a"; g.lineWidth = 3; g.strokeRect(c.c * CS + 2, c.r * CS + 2, CS - 4, CS - 4);
            } else {
                g.fillStyle = "#7c3aed1a"; g.fillRect(0, c.r * CS, W, CS);
                g.fillStyle = "#7c3aed"; g.beginPath(); g.moveTo(W - 4, c.r * CS + CS / 2); g.lineTo(W - 22, c.r * CS + CS / 2 - 10); g.lineTo(W - 22, c.r * CS + CS / 2 + 10); g.fill();
            }
        }
    }

    function render() {
        if (online) {
            if (!state || state.phase === "lobby") { if (ui.screen !== "lobby") { ui.screen = "lobby"; sync(); } return; }
            if (ui.viewSid !== state.sid) openGame();
        }
        if (ui.screen !== "game" || !state) return;
        if (state.phase === "over" && ui.ended !== state.sid) { ui.ended = state.sid; onEnd(); }
        draw();
    }

    /* ---- loop ---- */
    function frame(ts) {
        if (destroyed) return;
        raf = requestAnimationFrame(frame);
        const dt = Math.min(0.25, (ts - last) / 1000 || 0); last = ts;
        const s = state;
        if (s && ui.screen === "game" && s.phase === "play" && !ui.paused && !ui.helpOpen && !ui.cheatsOpen) {
            acc += dt * (online ? 1 : ui.speed);
            while (acc >= DT && s.phase === "play") { acc -= DT; step(s); if (!online) bots(); }
            if (online && room.isHost) { syncT += dt; if (syncT > 0.4) { syncT = 0; pushState(); } }
        } else acc = 0;
        render();
        hudT += dt;
        if (hudT > 0.1 && ui.screen === "game" && state) { hudT = 0; hud(); }
    }

    /* ---- input ---- */
    function handleClick(event) {
        if (event.target.closest("[data-exit]")) { onExit(); return; }
        const el = event.target.closest("[data-a]");
        if (!el) return;
        const a = el.dataset.a, v = el.dataset.v, ci = +el.dataset.ci || 0;
        switch (a) {
            case "go":
                if (v === "local") { startVs("local", "plants"); break; }
                if (v === "random") ui.seed = ui.seed || 1234;
                if (v === "menu") { state = online ? state : null; ui.paused = false; ui.helpOpen = false; ui.cheatsOpen = false; ui.cheated = false; }
                ui.screen = v; sync(); break;
            case "lvl": startPve({ ...LEVELS[+v], seed: LEVELS[+v].seed }, "campaign", +v); break;
            case "rand": { const inp = q("[data-seed]"); ui.seed = Math.abs(parseInt(inp?.value, 10)) || ui.seed; startPve(randParams(ui.seed), "random", 0); break; }
            case "reroll": ui.seed = 1000 + ((Math.random() * 9000) | 0); if (v === "go") startPve(randParams(ui.seed), "random", 0); else sync(); break;
            case "bot": startVs("bot", v); break;
            case "retry": case "restart": restartGame(); break;
            case "help": toggleHelp(); break;
            case "closehelp": toggleHelp(false); break;
            case "cheat": toggleCheats(); break;
            case "closech": toggleCheats(false); break;
            case "ch": cheat(v); break;
            case "pause":
                if (ui.helpOpen) toggleHelp(false);
                else if (ui.cheatsOpen) toggleCheats(false);
                else togglePause();
                break;
            case "resume": if (ui.paused) togglePause(); break;
            case "padt": ui.pad = !ui.pad; sync(); break;
            case "lang": save.lang = save.lang === "id" ? "en" : "id"; persist(); sync(); break;
            case "snd": save.sound = !save.sound; persist(); sync(); break;
            case "pad": if (v) { const c = ui.ctl[ci]; if (v === "act") doAct(c); else if (v === "next") cycle(c, 1); else if (v === "prev") cycle(c, -1); else move(c, v); } break;
            case "card": { const c = ui.ctl[ci]; c.sel = +v; break; }
            case "start": submitAction({ type: "start" }, null); break;
            default: break;
        }
    }
    function cellOf(e) {
        const b = cv.getBoundingClientRect();
        return { c: Math.min(COLS - 1, Math.max(0, Math.floor(((e.clientX - b.left) / b.width) * COLS))), r: Math.min(state.lanes - 1, Math.max(0, Math.floor(((e.clientY - b.top) / b.height) * state.lanes))) };
    }
    const mouseCtl = () => ui.ctl.find((c) => c.side === "plants") || ui.ctl[0];
    function onPointer(e) {
        if (!state || ui.screen !== "game" || !e.target.matches?.("canvas.sd-cv")) return;
        const k = mouseCtl(), { r, c } = cellOf(e);
        k.r = r; if (k.side === "plants") k.c = c;
        if (e.type === "pointerdown") { e.preventDefault(); doAct(k); }
    }
    function onKey(e) {
        if (destroyed || e.ctrlKey || e.metaKey || e.altKey) return;
        const focused = e.target;
        if (focused?.closest?.("[contenteditable=true]") || (focused?.closest?.("input,textarea,select") && root.contains(focused))) return;
        const k = e.key.toLowerCase();
        /* priority: help -> cheats -> pause -> escape -> game actions */
        if (k === "h") { toggleHelp(); e.preventDefault(); return; }
        if (k === "c") { toggleCheats(); e.preventDefault(); return; }
        if (k === "r") { restartGame(); e.preventDefault(); return; }
        if (k === "p") {
            if (ui.helpOpen) toggleHelp(false);
            else if (ui.cheatsOpen) toggleCheats(false);
            else togglePause();
            e.preventDefault(); return;
        }
        if (k === "escape") {
            if (ui.helpOpen) toggleHelp(false);
            else if (ui.cheatsOpen) toggleCheats(false);
            else if (ui.paused) togglePause();
            else if (ui.screen === "game" && state?.phase === "play") togglePause();
            e.preventDefault(); return;
        }
        if (k === "enter" && (ui.helpOpen || ui.cheatsOpen || ui.paused)) {
            if (ui.helpOpen) toggleHelp(false);
            else if (ui.cheatsOpen) toggleCheats(false);
            else togglePause();
            e.preventDefault(); return;
        }
        if (ui.helpOpen || ui.cheatsOpen || ui.paused) return;
        if (ui.screen !== "game" || !state) return;
        const W = { w: "u", s: "d", a: "l", d: "r" }, A = { arrowup: "u", arrowdown: "d", arrowleft: "l", arrowright: "r" };
        let used = false;
        for (const c of ui.ctl) {
            const km = c.kmap, dir = (km !== "arrows" && W[k]) || (km !== "wasd" && A[k]);
            if (dir) { move(c, dir); used = true; }
            else if ((k === " " && km !== "arrows") || (k === "enter" && km !== "wasd")) { doAct(c); used = true; }
            else if (km !== "arrows" && /^[1-9]$/.test(k) && +k <= state.avail[c.side].length) { c.sel = +k - 1; used = true; }
            else if (km !== "arrows" && (k === "q" || k === "e")) { cycle(c, k === "q" ? -1 : 1); used = true; }
        }
        if (used) e.preventDefault();
    }

    root.addEventListener("click", handleClick);
    root.addEventListener("pointerdown", onPointer);
    root.addEventListener("pointermove", onPointer);
    document.addEventListener("keydown", onKey);

    /* ---- inisialisasi (template: online host / guest / lokal) ---- */
    sync();
    if (online) {
        room.onRoom((nextRoom) => { roomData = nextRoom; if (ui.screen === "lobby") sync(); });
        if (room.isHost) {
            state = { phase: "lobby", sid: "lobby", v: 1 };
            publish();
            room.onAction((action) => applyAction(action, 1));
        } else {
            room.onState((nextState) => { state = nextState; acc = 0; render(); });
        }
    }
    raf = requestAnimationFrame(frame);

    return {
        destroy() {
            destroyed = true;
            cancelAnimationFrame(raf);
            if (ro) ro.disconnect(); else window.removeEventListener("resize", fitCanvas);
            root.removeEventListener("click", handleClick);
            root.removeEventListener("pointerdown", onPointer);
            root.removeEventListener("pointermove", onPointer);
            document.removeEventListener("keydown", onKey);
        },
    };
}