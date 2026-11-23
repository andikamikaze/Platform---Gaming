/* ==== GAME: mini-dungeon.js ==== */
/* Mini Dungeon - a beat-driven crypt crawl (Crypt of the Necrodancer inspired).
   Fixed, hand-validated levels. Race a rival (bot or human) for the gold key.
   Enemies telegraph and move on a cadence, so damage is never guaranteed. */

export const META = {
    id: "mini-dungeon",
    name: "Mini Dungeon",
    category: "adventure",
    catLabel: "Adventure",
    desc: "A beat-driven crypt crawl. Grab the gold key, outstep the dead, escape.",
    art: '<svg viewBox="0 0 48 48" width="54" height="54" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 42V22a15 15 0 0 1 30 0v20"/><path d="M17 42V31a7 7 0 0 1 14 0v11"/><circle cx="24" cy="24" r="2.2"/><path d="M24 27v5"/></svg>',
    bg: ["#c7d2fe", "#818cf8"],
    bestKey: "miniDungeonBest",
};

/* ---------------- constants & fixed levels ---------------- */
const W = 21, H = 15, TS = 36, VW = W * TS, VH = H * TS;
const MAX_HP = 5, SIGHT = 4, CHASE = 8;
const PCOL = ["#38bdf8", "#fbbf24"];
const EDEF = {
    imp: { hp: 2, cad: 2, col: "#f87171" },
    bat: { hp: 1, cad: 1, col: "#c084fc" },
    slime: { hp: 1, cad: 0, col: "#4ade80" },
};
const DIRS4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];

const LEVELS = [
    {
        name: "The Vestibule", rows: [
            "#####################",
            "#P......c.#........K#",
            "#....##...#...##....#",
            "#Q...##...#...##....#",
            "#.........#.c.......#",
            "#....#######.####...#",
            "#....#........i.#...#",
            "#.c..#..##c.##..#.c.#",
            "#....#..##..##..#...#",
            "#....#........c.#...#",
            "#....####t#######...#",
            "#.........t.........#",
            "#..p...s.....i......#",
            "#........E..........#",
            "#####################",
        ]
    },
    {
        name: "Crossroads", rows: [
            "#####################",
            "#P...#....c....#...K#",
            "#....#..#####..#....#",
            "#Q...#..#...#..#i...#",
            "#....#..#.c.#..#....#",
            "#....#..##.##..#....#",
            "#....#c........#....#",
            "#c####..##.##..####c#",
            "#....t..#.b.#..t....#",
            "#....#..##.##..#....#",
            "#....#s.......c#....#",
            "#....####t#######...#",
            "#..i....p..s....i...#",
            "#.c.#....E....#..p..#",
            "#####################",
        ]
    },
    {
        name: "The Crypt", rows: [
            "#####################",
            "#P.c.#..t...t..#.c.K#",
            "#....#....i....#....#",
            "#Q...#..##.##..#....#",
            "#....#..#..s#..#....#",
            "#....#..#.c.#..#....#",
            "#....#..##.##..#....#",
            "#c####b.......b####c#",
            "#...t..###.###..t...#",
            "#.####..#s.c#..####.#",
            "#....#..##.##..#....#",
            "#....#c........#....#",
            "#..i....p..i....i...#",
            "#...#....E....#..p..#",
            "#####################",
        ]
    },
];

function parseLevel(rows) {
    const grid = [], spawns = [null, null], enemies = [], traps = [], coins = [], potions = [];
    let key = null, exit = null;
    for (let y = 0; y < H; y++) {
        grid[y] = [];
        for (let x = 0; x < W; x++) {
            const ch = rows[y][x];
            grid[y][x] = ch === "#" ? 0 : 1;
            if (ch === "P") spawns[0] = { x, y };
            else if (ch === "Q") spawns[1] = { x, y };
            else if (ch === "K") key = { x, y };
            else if (ch === "E") exit = { x, y };
            else if (ch === "i") enemies.push({ type: "imp", x, y });
            else if (ch === "b") enemies.push({ type: "bat", x, y });
            else if (ch === "s") enemies.push({ type: "slime", x, y });
            else if (ch === "t") traps.push({ x, y });
            else if (ch === "c") coins.push({ x, y });
            else if (ch === "p") potions.push({ x, y });
        }
    }
    return { grid, spawns, key, exit, enemies, traps, coins, potions };
}
const PARSED = LEVELS.map((l) => parseLevel(l.rows));
const NEIGH = PARSED.map((L) => {
    const nb = {};
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        if (L.grid[y][x] !== 1) continue;
        nb[x + "," + y] = DIRS4
            .map(([dx, dy]) => [x + dx, y + dy])
            .filter(([nx, ny]) => nx >= 0 && ny >= 0 && nx < W && ny < H && L.grid[ny][nx] === 1);
    }
    return nb;
});

/* ---------------- pure engine (serializable state) ---------------- */
const manh = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
function rand(s) {
    let t = (s.rngState = (s.rngState + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t = (t ^ ((t + Math.imul(t ^ (t >>> 7), t | 61)) >>> 0)) >>> 0;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
function fx(s, e) {
    e.id = ++s.fxId;
    s.fx.push(e);
    if (s.fx.length > 14) s.fx.shift();
}
function say(s, text, code, seat) {
    s.msg = { id: ++s.msgId, text: text || null, code: code || null, seat: seat == null ? -1 : seat };
}
const cur = (s) => s.order[s.turnIdx];
const active = (s, i) => s.players[i].alive && !s.players[i].escaped;
const floor = (s, x, y) => x >= 0 && y >= 0 && x < W && y < H && PARSED[s.level].grid[y][x] === 1;
function enemyAt(s, x, y) { return s.enemies.find((e) => e.hp > 0 && e.x === x && e.y === y) || null; }
function playerAt(s, x, y) { return s.players.findIndex((p, i) => active(s, i) && p.x === x && p.y === y); }
function trapAt(s, x, y) { return s.traps.find((t) => !t.sprung && t.x === x && t.y === y) || null; }

function newGame(level, vsBot, seed) {
    const L = PARSED[level];
    const s = {
        gid: seed, level, vsBot, seed, rngState: seed >>> 0,
        order: [0, 1], turnIdx: 0, round: 1,
        seatOf: { host: 0, guest: 1 },
        players: [], enemies: [],
        key: { x: L.key.x, y: L.key.y, holder: -1, cool: 0 },
        exit: { x: L.exit.x, y: L.exit.y },
        coins: L.coins.map((c) => ({ x: c.x, y: c.y, taken: false })),
        traps: L.traps.map((t) => ({ x: t.x, y: t.y, sprung: false })),
        potions: L.potions.map((p) => ({ x: p.x, y: p.y, taken: false })),
        phase: "play", winner: -1,
        fx: [], fxId: 0, msg: null, msgId: 0,
        cheats: { reveal: false, freeze: false }, cheated: false,
    };
    if (rand(s) < 0.5) s.order = [1, 0];                          // random first mover
    if (!vsBot && rand(s) < 0.5) s.seatOf = { host: 1, guest: 0 }; // random seats online
    for (let seat = 0; seat < 2; seat++) {
        const sp = L.spawns[seat];
        s.players.push({ x: sp.x, y: sp.y, hp: MAX_HP, coins: 0, kills: 0, steps: 0, alive: true, escaped: false, god: false });
    }
    L.enemies.forEach((e, i) => {
        const d = EDEF[e.type];
        s.enemies.push({ id: i, type: e.type, x: e.x, y: e.y, hp: d.hp, phase: i % 2, windup: false });
    });
    say(s, null, "first", s.order[0]);
    return s;
}

function killPlayer(s, seat) {
    const p = s.players[seat];
    p.alive = false;
    if (s.key.holder === seat) {
        s.key.holder = -1; s.key.x = p.x; s.key.y = p.y; s.key.cool = 0;
        fx(s, { k: "txt", x: p.x, y: p.y, txt: "key dropped", c: "#facc15" });
    }
    fx(s, { k: "die", x: p.x, y: p.y, c: PCOL[seat] });
    say(s, null, "fell", seat);
    if (s.vsBot) {
        if (seat === 0) { s.phase = "lose"; s.winner = 1; }
    } else if (!active(s, 0) && !active(s, 1)) {
        s.phase = "draw"; s.winner = -1;
    }
}
function escape(s, seat) {
    const p = s.players[seat];
    p.escaped = true; s.winner = seat;
    s.phase = s.vsBot ? (s.level < LEVELS.length - 1 ? "clear" : "win") : "win";
    fx(s, { k: "txt", x: p.x, y: p.y, txt: "escaped!", c: "#34d399" });
    say(s, null, "escape", seat);
}
function hitEnemy(s, seat, foe, d) {
    const p = s.players[seat];
    fx(s, { k: "atk", x: p.x, y: p.y, dx: d[0], dy: d[1], tx: foe.x, ty: foe.y, src: "p" + seat });
    foe.hp -= 1;
    fx(s, { k: "hit", x: foe.x, y: foe.y });
    if (foe.hp <= 0) {
        p.kills += 1;
        fx(s, { k: "die", x: foe.x, y: foe.y, c: EDEF[foe.type].col });
        if (foe.type === "slime") { p.coins += 1; fx(s, { k: "txt", x: foe.x, y: foe.y, txt: "+1", c: "#facc15" }); }
    }
}
function hitPlayer(s, srcSeat, target, d, pvp, srcPos) {
    const t = s.players[target];
    const sp = srcPos || s.players[srcSeat];
    fx(s, { k: "atk", x: sp.x, y: sp.y, dx: d[0], dy: d[1], tx: t.x, ty: t.y, src: srcSeat == null ? "e" : "p" + srcSeat });
    if (t.god) {
        fx(s, { k: "txt", x: t.x, y: t.y, txt: "0", c: "#38bdf8" });
    } else {
        t.hp -= 1;
        fx(s, { k: "hit", x: t.x, y: t.y });
        fx(s, { k: "shake" });
    }
    if (pvp && s.key.holder === target && s.key.cool <= 0) {
        s.key.holder = srcSeat; s.key.cool = 2;
        fx(s, { k: "txt", x: t.x, y: t.y, txt: "key stolen!", c: "#facc15" });
        say(s, null, "steal", srcSeat);
    }
    if (!t.god && t.hp <= 0) killPlayer(s, target);
}
function pickups(s, seat) {
    const p = s.players[seat], k = s.key;
    if (k.holder === -1 && k.x === p.x && k.y === p.y) {
        k.holder = seat; k.cool = 2;
        fx(s, { k: "txt", x: p.x, y: p.y, txt: "+key", c: "#facc15" });
        say(s, null, "key", seat);
    }
    for (const pot of s.potions) {
        if (!pot.taken && pot.x === p.x && pot.y === p.y && p.hp < MAX_HP) {
            pot.taken = true; p.hp = Math.min(MAX_HP, p.hp + 1);
            fx(s, { k: "heal", x: p.x, y: p.y });
            fx(s, { k: "txt", x: p.x, y: p.y, txt: "+1 HP", c: "#f472b6" });
        }
    }
    for (const c of s.coins) {
        if (!c.taken && c.x === p.x && c.y === p.y) {
            c.taken = true; p.coins += 1;
            fx(s, { k: "txt", x: p.x, y: p.y, txt: "+1", c: "#facc15" });
        }
    }
    const tr = trapAt(s, p.x, p.y);
    if (tr) {
        tr.sprung = true;
        if (!p.god) {
            p.hp -= 1;
            fx(s, { k: "hit", x: p.x, y: p.y }); fx(s, { k: "shake" });
            say(s, "A spike trap!");
            if (p.hp <= 0) { killPlayer(s, seat); return; }
        }
    }
    if (p.x === s.exit.x && p.y === s.exit.y) {
        if (k.holder === seat) escape(s, seat);
        else say(s, null, "locked");
    }
}
function stepToward(s, e, target) {
    const dx = target.x - e.x, dy = target.y - e.y, cand = [];
    if (Math.abs(dx) >= Math.abs(dy)) {
        if (dx) cand.push([Math.sign(dx), 0]);
        if (dy) cand.push([0, Math.sign(dy)]);
    } else {
        if (dy) cand.push([0, Math.sign(dy)]);
        if (dx) cand.push([Math.sign(dx), 0]);
    }
    for (const [sx, sy] of cand) {
        const nx = e.x + sx, ny = e.y + sy;
        if (floor(s, nx, ny) && !enemyAt(s, nx, ny) && playerAt(s, nx, ny) < 0) { e.x = nx; e.y = ny; return; }
    }
}
function wander(s, e) {
    if (rand(s) < 0.5) {
        const [dx, dy] = DIRS4[(rand(s) * 4) | 0];
        const nx = e.x + dx, ny = e.y + dy;
        if (floor(s, nx, ny) && !enemyAt(s, nx, ny) && playerAt(s, nx, ny) < 0) { e.x = nx; e.y = ny; }
    }
}
function enemyBeat(s) {
    fx(s, { k: "beat", n: s.round });
    for (const e of s.enemies) {
        if (e.hp <= 0) continue;
        if (s.cheats.freeze) { e.windup = false; continue; }
        if (e.type === "slime") continue;
        let tgt = null, best = 1e9, tseat = -1;
        for (let i = 0; i < 2; i++) if (active(s, i)) {
            const d = manh(e, s.players[i]);
            if (d < best) { best = d; tgt = s.players[i]; tseat = i; }
        }
        if (!tgt) { e.windup = false; continue; }
        const cad = EDEF[e.type].cad;
        const on = (s.round % cad) === (e.phase % cad);
        if (!on) { e.windup = e.type === "imp" && best === 1; continue; }
        if (best === 1) {
            hitPlayer(s, null, tseat, [tgt.x - e.x, tgt.y - e.y], false, e);
            e.windup = false;
            if (s.phase !== "play") return;
        } else if (best <= CHASE) {
            stepToward(s, e, tgt);
            e.windup = e.type === "imp" && manh(e, tgt) === 1;
        } else { wander(s, e); e.windup = false; }
    }
}
function advance(s) {
    if (s.key.cool > 0) s.key.cool -= 1;
    let guard = 0;
    for (; ;) {
        s.turnIdx += 1;
        if (s.turnIdx >= s.order.length) { s.turnIdx = 0; s.round += 1; enemyBeat(s); }
        if (s.phase !== "play") return;
        if (active(s, cur(s))) return;
        if (++guard > 6) return;
    }
}
function plainDist(level, tx, ty) {
    const nb = NEIGH[level], dist = {};
    dist[tx + "," + ty] = 0;
    const q = [[tx, ty]];
    for (let i = 0; i < q.length; i++) {
        const [x, y] = q[i], d = dist[x + "," + y] + 1;
        for (const [nx, ny] of nb[x + "," + y]) {
            const kk = nx + "," + ny;
            if (dist[kk] == null) { dist[kk] = d; q.push([nx, ny]); }
        }
    }
    return dist;
}
function botAction(s, seat) {
    const p = s.players[seat];
    if (rand(s) < 0.16) return { t: "wait" };
    const k = s.key;
    let to;
    if (k.holder === seat) to = s.exit;
    else if (k.holder === -1) to = { x: k.x, y: k.y };
    else to = s.players[k.holder];
    const dist = plainDist(s.level, to.x, to.y);
    const curd = dist[p.x + "," + p.y] == null ? 1e9 : dist[p.x + "," + p.y];
    let safe = null, atk = null, trapstep = null;
    for (const [dx, dy] of DIRS4) {
        const nx = p.x + dx, ny = p.y + dy;
        if (!floor(s, nx, ny)) continue;
        const d = dist[nx + "," + ny] == null ? 1e9 : dist[nx + "," + ny];
        if (d >= curd) continue;
        const oth = playerAt(s, nx, ny);
        if (oth >= 0 && oth !== seat) { if (!atk || d < atk[0]) atk = [d, [dx, dy]]; continue; }
        const foe = enemyAt(s, nx, ny), tr = trapAt(s, nx, ny);
        if (foe) { if (!atk || d < atk[0]) atk = [d, [dx, dy]]; }
        else if (tr) { if (!trapstep || d < trapstep[0]) trapstep = [d, [dx, dy]]; }
        else { if (!safe || d < safe[0]) safe = [d, [dx, dy]]; }
    }
    if (safe) return { t: "move", d: safe[1] };
    if (atk) return { t: "move", d: atk[1] };
    if (trapstep) return { t: "move", d: trapstep[1] };
    for (const e of s.enemies) {
        if (e.hp > 0 && e.windup && manh(e, p) === 1 && p.hp <= 2) return { t: "move", d: [e.x - p.x, e.y - p.y] };
    }
    return { t: "wait" };
}
function applyCheat(s, seat, c) {
    const p = s.players[seat];
    s.cheated = true;
    if (["god", "heal", "key", "coins", "warp"].includes(c) && !active(s, seat)) return false;
    if (c === "god") { p.god = !p.god; fx(s, { k: "txt", x: p.x, y: p.y, txt: p.god ? "god on" : "god off", c: "#38bdf8" }); }
    else if (c === "heal") { p.hp = MAX_HP; fx(s, { k: "heal", x: p.x, y: p.y }); }
    else if (c === "key") { s.key.holder = seat; s.key.cool = 2; say(s, null, "key", seat); }
    else if (c === "slay") { for (const e of s.enemies) if (e.hp > 0) { e.hp = 0; p.kills += 1; fx(s, { k: "die", x: e.x, y: e.y, c: EDEF[e.type].col }); } }
    else if (c === "reveal") { s.cheats.reveal = !s.cheats.reveal; }
    else if (c === "freeze") { s.cheats.freeze = !s.cheats.freeze; for (const e of s.enemies) e.windup = false; }
    else if (c === "coins") { p.coins += 10; fx(s, { k: "txt", x: p.x, y: p.y, txt: "+10", c: "#facc15" }); }
    else if (c === "warp") { p.x = s.exit.x; p.y = s.exit.y; fx(s, { k: "txt", x: p.x, y: p.y, txt: "warp", c: "#c084fc" }); if (s.key.holder === seat) escape(s, seat); }
    else return false;
    return true;
}
function act(s, action, seat) {
    if (!s || s.phase !== "play" || (seat !== 0 && seat !== 1)) return false;
    const t = action && action.t;
    if (t === "cheat") return applyCheat(s, seat, action.c);
    if (cur(s) !== seat || !active(s, seat)) return false;
    if (t === "wait") { advance(s); return true; }
    if (t === "move") {
        const d = action.d;
        if (!Array.isArray(d) || d.length !== 2 || Math.abs(d[0]) + Math.abs(d[1]) !== 1) return false;
        const p = s.players[seat], nx = p.x + d[0], ny = p.y + d[1];
        const foe = enemyAt(s, nx, ny);
        if (foe) { hitEnemy(s, seat, foe, d); advance(s); return true; }
        const other = playerAt(s, nx, ny);
        if (other >= 0 && other !== seat) { hitPlayer(s, seat, other, d, true); advance(s); return true; }
        if (!floor(s, nx, ny)) return false;
        p.x = nx; p.y = ny; p.steps += 1;
        pickups(s, seat);
        if (s.phase !== "play") return true;
        advance(s);
        return true;
    }
    return false;
}

/* ---------------- mount ---------------- */
export function mount(root, context = {}) {
    const { mode = "ai", room = null, playerName = "Player", onExit = () => { } } = context;
    const online = mode === "room" && Boolean(room);
    const canManage = !online || room.isHost;
    let roomData = (room && room.room) || null;
    let state = null;

    const NS = "http://www.w3.org/2000/svg";
    const mk = (tag, attrs) => {
        const el = document.createElementNS(NS, tag);
        if (attrs) for (const k in attrs) el.setAttribute(k, attrs[k]);
        return el;
    };
    const px = (t) => t * TS + TS / 2;

    root.innerHTML = `
<style>
.md-app{max-width:940px;margin:0 auto;padding:14px 14px 18px;display:flex;flex-direction:column;gap:10px;color:#e6ebf2;font-family:inherit}
.md-app *{box-sizing:border-box}
.md-app .game-intro{display:flex;align-items:center;justify-content:space-between;gap:12px}
.md-app .game-intro h2{margin:0;font-size:15px;font-weight:650;letter-spacing:.03em}
.md-app .game-status{display:inline-flex;align-items:center;gap:7px;font-size:12px;color:#aab4c4;background:#ffffff08;border:1px solid #ffffff12;border-radius:999px;padding:4px 11px}
.md-app .game-status-dot{width:7px;height:7px;border-radius:50%;background:#5b6678;transition:background .2s,box-shadow .2s}
.md-app .game-status-dot.on{background:#38bdf8;box-shadow:0 0 8px #38bdf8aa}
.md-hud{display:flex;flex-wrap:wrap;align-items:center;gap:7px}
.md-chip{display:inline-flex;align-items:center;gap:6px;font-size:12px;color:#c3ccda;background:#ffffff08;border:1px solid #ffffff12;border-radius:999px;padding:4px 10px;line-height:1}
.md-chip b{color:#eef2f8;font-weight:650}
.md-hearts{gap:3px;padding:4px 9px}
.md-hearts svg{display:block}
.md-turn{font-weight:650}
.md-beat{width:12px;height:12px;margin-left:2px;border-radius:3px;background:#ffffff14;border:1px solid #ffffff1f;transform:rotate(45deg)}
.md-cheatflag{color:#facc15;font-size:12px}
.md-app .game-panel{padding:10px;background:#0f141d;border:1px solid #ffffff10;border-radius:16px}
.md-boardwrap{position:relative;width:min(100%,calc(72vh * 21 / 15));aspect-ratio:21/15;margin:0 auto}
.md-board{width:100%;height:100%;display:block;border-radius:12px;touch-action:none;cursor:pointer;background:#0a0e15}
.md-toast{position:absolute;left:50%;bottom:10px;transform:translateX(-50%);background:#111831ee;border:1px solid #ffffff1f;border-radius:999px;padding:5px 14px;font-size:12px;font-weight:600;color:#dbe1ea;white-space:nowrap;pointer-events:none;opacity:0;transition:opacity .25s;z-index:3}
.md-overlay{position:absolute;inset:0;display:grid;place-items:center;background:#0a0e15d9;backdrop-filter:blur(4px);border-radius:12px;z-index:4}
.md-card{width:min(88%,360px);background:#141a26;border:1px solid #ffffff14;border-radius:16px;padding:22px 22px 20px;text-align:center;box-shadow:0 18px 50px #00000066}
.md-card h3{margin:0 0 8px;font-size:21px;font-weight:700;letter-spacing:.01em}
.md-card p{margin:0 0 16px;font-size:12.5px;color:#9aa6b8;line-height:1.55}
.md-cardbtns{display:flex;gap:8px;justify-content:center;flex-wrap:wrap}
.md-wait{margin:12px 0 0;font-size:12px;color:#7c8798}
.md-cheats{position:absolute;top:10px;right:10px;width:min(86%,250px);background:#141a26f2;border:1px solid #ffffff16;border-radius:14px;padding:12px;z-index:5;backdrop-filter:blur(6px);box-shadow:0 14px 40px #00000066}
.md-cheatshead{display:flex;align-items:center;justify-content:space-between;font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#facc15;margin-bottom:9px}
.md-cheatshead button{background:none;border:none;color:#8b95a7;font-size:18px;line-height:1;cursor:pointer;padding:0 2px}
.md-switch{display:flex;align-items:center;gap:9px;width:100%;background:#ffffff07;border:1px solid #ffffff10;border-radius:9px;color:#c3ccda;font-size:12px;padding:7px 9px;margin-bottom:6px;cursor:pointer;font-family:inherit}
.md-switch i{width:26px;height:15px;border-radius:999px;background:#3a4356;position:relative;transition:background .18s;flex:0 0 auto}
.md-switch i::after{content:"";position:absolute;top:2px;left:2px;width:11px;height:11px;border-radius:50%;background:#cbd5e1;transition:left .18s}
.md-switch[aria-pressed="true"]{color:#eef2f8;border-color:#38bdf855}
.md-switch[aria-pressed="true"] i{background:#38bdf8}
.md-switch[aria-pressed="true"] i::after{left:13px}
.md-cheatgrid{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-top:8px}
.md-cheatgrid button{background:#ffffff07;border:1px solid #ffffff10;border-radius:9px;color:#c3ccda;font-size:11.5px;padding:7px 6px;cursor:pointer;font-family:inherit}
.md-cheatgrid button:hover,.md-switch:hover{background:#ffffff12}
.md-app .game-actions{display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap}
.md-app .game-action-button{font-family:inherit;font-size:12.5px;font-weight:600;padding:8px 15px;border-radius:10px;border:1px solid #ffffff14;background:#ffffff0a;color:#dbe1ea;cursor:pointer}
.md-app .game-action-button:hover{background:#ffffff16}
.md-app .game-action-button.md-primary{background:#38bdf8;border-color:#38bdf8;color:#06202c}
.md-app .game-action-button.md-primary:hover{background:#5cc8fa}
.md-app .game-action-button.md-ghost{background:transparent}
.md-app [hidden]{display:none!important}
@media (max-width:560px){.md-app{padding:10px}.md-app .game-panel{padding:7px}.md-chip{font-size:11px;padding:3px 8px}}
</style>
<div class="game-app md-app">
  <div class="game-intro">
    <h2>Mini Dungeon</h2>
    <span class="game-status"><i class="game-status-dot" data-dot></i><span data-status>Ready</span></span>
  </div>
  <div class="md-hud">
    <span class="md-chip md-hearts" data-hearts></span>
    <span class="md-chip"><svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><circle cx="8" cy="12" r="3.4"/><path d="M11.4 12h8M16 12v3M19 12v3"/></svg><b data-keytext>—</b></span>
    <span class="md-chip">◉ <b data-coins>0</b></span>
    <span class="md-chip">Lv <b data-level>1</b>/${LEVELS.length}</span>
    <span class="md-chip md-turn" data-turn>—</span>
    <span class="md-beat" data-beat></span>
    <span class="md-cheatflag" data-cheatflag hidden>⚡</span>
  </div>
  <section class="game-panel">
    <div class="md-boardwrap" data-boardwrap>
      <svg class="md-board" data-board viewBox="0 0 ${VW} ${VH}" preserveAspectRatio="xMidYMid meet" aria-label="Mini Dungeon board">
        <rect x="0" y="0" width="${VW}" height="${VH}" rx="12" fill="#0a0e15"></rect>
        <g data-tiles></g><g data-items></g><g data-foes></g><g data-players></g><g data-fx></g>
        <rect data-beatflash x="0" y="0" width="${VW}" height="${VH}" rx="12" fill="#ffffff" opacity="0" pointer-events="none"></rect>
        <rect data-hover width="${TS - 2}" height="${TS - 2}" rx="4" fill="none" stroke="#38bdf8" stroke-width="2" opacity="0" pointer-events="none"></rect>
      </svg>
      <div class="md-toast" data-toast></div>
      <div class="md-overlay" data-end hidden>
        <div class="md-card">
          <h3 data-endtitle>—</h3><p data-endsub></p>
          <div class="md-cardbtns">
            <button class="game-action-button md-primary" type="button" data-endprimary hidden>—</button>
            <button class="game-action-button md-ghost" type="button" data-exit>Exit game</button>
          </div>
          <p class="md-wait" data-endwait hidden>Waiting for host…</p>
        </div>
      </div>
      <div class="md-cheats" data-cheats hidden>
        <div class="md-cheatshead"><span>Cheats</span><button type="button" data-cheat-close aria-label="Close cheats">×</button></div>
        <button class="md-switch" type="button" data-cheat="god" aria-pressed="false"><i></i>God mode</button>
        <button class="md-switch" type="button" data-cheat="reveal" aria-pressed="false"><i></i>Reveal map</button>
        <button class="md-switch" type="button" data-cheat="freeze" aria-pressed="false"><i></i>Freeze enemies</button>
        <div class="md-cheatgrid">
          <button type="button" data-cheat="heal">Full heal</button>
          <button type="button" data-cheat="key">Give key</button>
          <button type="button" data-cheat="slay">Slay all</button>
          <button type="button" data-cheat="warp">Warp to exit</button>
          <button type="button" data-cheat="coins">+10 coins</button>
        </div>
      </div>
    </div>
  </section>
  <div class="game-actions">
    <button class="game-action-button md-ghost" type="button" data-cheats-toggle>⚡ Cheats</button>
    <button class="game-action-button md-ghost" type="button" data-act="restart" data-restart>Restart</button>
    <button class="game-action-button" type="button" data-exit>Exit game</button>
  </div>
</div>`;

    const $ = (sel) => root.querySelector(sel);
    const board = $("[data-board]");
    const tilesG = $("[data-tiles]"), itemsG = $("[data-items]"), foesG = $("[data-foes]"), playersG = $("[data-players]"), fxG = $("[data-fx]");
    const beatFlash = $("[data-beatflash]"), hoverRect = $("[data-hover]");
    const heartsEl = $("[data-hearts]"), keyText = $("[data-keytext]"), coinsEl = $("[data-coins]"), levelEl = $("[data-level]");
    const turnEl = $("[data-turn]"), beatEl = $("[data-beat]"), cheatFlag = $("[data-cheatflag]");
    const statusEl = $("[data-status]"), dotEl = $("[data-dot]"), toastEl = $("[data-toast]");
    const endOv = $("[data-end]"), endTitle = $("[data-endtitle]"), endSub = $("[data-endsub]"), endPrimary = $("[data-endprimary]"), endWait = $("[data-endwait]");
    const cheatsOv = $("[data-cheats]"), restartBtn = $("[data-restart]");

    /* ---------------- view state ---------------- */
    let buildKey = "";
    let tileEls = [], itemEls = {}, enemyEls = [], windupEls = [], playerEls = [];
    let seen = [];
    const disp = {}, lunges = {}, anims = [];
    let lastFxId = 0, lastMsgId = 0;
    let shakeT = 0, beatT = 0, toastT = 0, windupPhase = 0;
    let raf = 0, lastT = 0, botTimer = 0, destroyed = false;

    const mySeat = () => {
        if (!online) return 0;
        if (state && state.seatOf) return state.seatOf[room.isHost ? "host" : "guest"];
        return room.isHost ? 0 : 1;
    };
    const rivalSeat = () => 1 - mySeat();
    const isVisible = (x, y) => {
        if (!state) return false;
        if (state.cheats.reveal) return true;
        const p = state.players[mySeat()];
        return Math.max(Math.abs(x - p.x), Math.abs(y - p.y)) <= SIGHT;
    };

    /* ---------------- board construction ---------------- */
    function buildBoard() {
        const L = PARSED[state.level];
        tilesG.innerHTML = ""; itemsG.innerHTML = ""; foesG.innerHTML = ""; playersG.innerHTML = ""; fxG.innerHTML = "";
        tileEls = []; itemEls = { potions: [], traps: [], coins: [] }; enemyEls = []; windupEls = []; playerEls = [];
        for (let y = 0; y < H; y++) {
            const row = [];
            for (let x = 0; x < W; x++) {
                const wall = L.grid[y][x] === 0;
                const r = mk("rect", {
                    x: x * TS + 1, y: y * TS + 1, width: TS - 2, height: TS - 2, rx: wall ? 3 : 2,
                    fill: wall ? "#10151f" : ((x + y) % 2 ? "#1b2230" : "#1e2635"),
                    stroke: wall ? "#0a0e15" : "#232c3d", "stroke-width": 1,
                });
                tilesG.appendChild(r); row.push(r);
            }
            tileEls.push(row);
        }
        const ex = state.exit, dg = mk("g", {});
        dg.appendChild(mk("path", { d: `M${ex.x * TS + 7} ${ex.y * TS + TS - 5} v-${TS - 14} a${TS / 2 - 7} ${TS / 2 - 7} 0 0 1 ${TS - 14} 0 v${TS - 14}`, fill: "none", stroke: "#c4b5fd", "stroke-width": 2.4, "stroke-linejoin": "round" }));
        dg.appendChild(mk("circle", { cx: px(ex.x) + 4, cy: px(ex.y) + 2, r: 1.8, fill: "#c4b5fd" }));
        itemsG.appendChild(dg); itemEls.exit = dg; itemEls.exitStroke = dg.firstChild;
        const kg = mk("g", {});
        kg.appendChild(mk("circle", { cx: -4, cy: 0, r: 4.4, fill: "none", stroke: "#facc15", "stroke-width": 2.4 }));
        kg.appendChild(mk("path", { d: "M0.4 0 h9 M6 0 v4 M9 0 v4", fill: "none", stroke: "#facc15", "stroke-width": 2.4, "stroke-linecap": "round" }));
        itemsG.appendChild(kg); itemEls.key = kg;
        state.potions.forEach((p) => {
            const g = mk("g", {});
            g.appendChild(mk("circle", { r: 8, fill: "#f472b622", stroke: "#f472b6", "stroke-width": 1.6 }));
            g.appendChild(mk("path", { d: "M-4 0 h8 M0 -4 v8", stroke: "#f472b6", "stroke-width": 2.2, "stroke-linecap": "round" }));
            itemsG.appendChild(g); itemEls.potions.push(g);
        });
        state.traps.forEach((t) => {
            const g = mk("g", {});
            for (let i = 0; i < 3; i++) {
                const bx = -10 + i * 8;
                g.appendChild(mk("path", { d: `M${bx} 8 L${bx + 4} -7 L${bx + 8} 8 z`, fill: "#64748b", stroke: "#475569", "stroke-width": 1 }));
            }
            itemsG.appendChild(g); itemEls.traps.push(g);
        });
        state.coins.forEach((c) => {
            const g = mk("g", {});
            g.appendChild(mk("circle", { r: 5, fill: "#eab308", stroke: "#a16207", "stroke-width": 1.4 }));
            g.appendChild(mk("circle", { r: 1.6, fill: "#fde68a" }));
            itemsG.appendChild(g); itemEls.coins.push(g);
        });
        state.enemies.forEach((e) => {
            const g = mk("g", {});
            const col = EDEF[e.type].col;
            if (e.type === "slime") {
                g.appendChild(mk("rect", { x: -10, y: -7, width: 20, height: 15, rx: 7, fill: col, stroke: "#14532d", "stroke-width": 1.6 }));
                g.appendChild(mk("circle", { cx: -3.5, cy: -1, r: 1.5, fill: "#052e16" }));
                g.appendChild(mk("circle", { cx: 3.5, cy: -1, r: 1.5, fill: "#052e16" }));
            } else if (e.type === "bat") {
                g.appendChild(mk("path", { d: "M0 -8 L9 0 L4 2 L0 8 L-4 2 L-9 0 z", fill: col, stroke: "#581c87", "stroke-width": 1.5, "stroke-linejoin": "round" }));
                g.appendChild(mk("circle", { cx: -2.4, cy: -1, r: 1.2, fill: "#2e1065" }));
                g.appendChild(mk("circle", { cx: 2.4, cy: -1, r: 1.2, fill: "#2e1065" }));
            } else {
                g.appendChild(mk("path", { d: "M-8 -6 l-3 -6 l5 3 z", fill: col, stroke: "#7f1d1d", "stroke-width": 1.3 }));
                g.appendChild(mk("path", { d: "M8 -6 l3 -6 l-5 3 z", fill: col, stroke: "#7f1d1d", "stroke-width": 1.3 }));
                g.appendChild(mk("rect", { x: -9, y: -8, width: 18, height: 17, rx: 6, fill: col, stroke: "#7f1d1d", "stroke-width": 1.7 }));
                g.appendChild(mk("circle", { cx: -3.4, cy: -1, r: 1.6, fill: "#450a0a" }));
                g.appendChild(mk("circle", { cx: 3.4, cy: -1, r: 1.6, fill: "#450a0a" }));
                g.appendChild(mk("path", { d: "M-4 4 q4 3 8 0", fill: "none", stroke: "#450a0a", "stroke-width": 1.5, "stroke-linecap": "round" }));
            }
            const w = mk("text", { x: 0, y: -TS * 0.5, "text-anchor": "middle", "font-size": 15, "font-weight": 800, fill: "#fca5a5", opacity: 0 });
            w.textContent = "!";
            g.appendChild(w);
            foesG.appendChild(g); enemyEls.push(g); windupEls.push(w);
        });
        for (let seat = 0; seat < 2; seat++) {
            const g = mk("g", {});
            const col = PCOL[seat];
            g.appendChild(mk("rect", { x: -10, y: -10, width: 20, height: 20, rx: 6, fill: col, stroke: "#0b1020", "stroke-width": 2 }));
            g.appendChild(mk("circle", { cx: -3.6, cy: -2, r: 1.8, fill: "#0b1020" }));
            g.appendChild(mk("circle", { cx: 3.6, cy: -2, r: 1.8, fill: "#0b1020" }));
            g.appendChild(mk("path", { d: "M-4 4 h8", stroke: "#0b1020", "stroke-width": 1.6, "stroke-linecap": "round" }));
            playersG.appendChild(g); playerEls.push(g);
        }
        seen = Array.from({ length: H }, () => Array(W).fill(false));
        anims.length = 0;
        for (const kk in lunges) delete lunges[kk];
        for (const kk in disp) delete disp[kk];
        for (let seat = 0; seat < 2; seat++) { const p = state.players[seat]; disp["p" + seat] = { x: px(p.x), y: px(p.y) }; }
        state.enemies.forEach((e) => { disp["e" + e.id] = { x: px(e.x), y: px(e.y) }; });
        lastFxId = state.fxId;
        buildKey = state.level + ":" + state.gid;
    }

    /* ---------------- transient fx ---------------- */
    function spawnFx(e) {
        const cx = px(e.x), cy = px(e.y);
        if (e.k === "txt") {
            const el = mk("text", { x: cx, y: cy - 8, "text-anchor": "middle", "font-size": 14, "font-weight": 800, fill: e.c });
            el.textContent = e.txt; fxG.appendChild(el);
            anims.push({ kind: "txt", els: [el], t: 0, dur: 0.75, x: cx, y: cy - 8 });
        } else if (e.k === "hit") {
            const el = mk("circle", { cx, cy, r: TS * 0.42, fill: "#ffffff", opacity: 0.8 });
            fxG.appendChild(el); anims.push({ kind: "fade", els: [el], t: 0, dur: 0.22, o0: 0.8 });
            const t = mk("text", { x: cx, y: cy - 8, "text-anchor": "middle", "font-size": 14, "font-weight": 800, fill: "#f87171" });
            t.textContent = "-1"; fxG.appendChild(t); anims.push({ kind: "txt", els: [t], t: 0, dur: 0.7, x: cx, y: cy - 8 });
        } else if (e.k === "heal") {
            const el = mk("circle", { cx, cy, r: TS * 0.4, fill: "none", stroke: "#f472b6", "stroke-width": 2.5, opacity: 0.9 });
            fxG.appendChild(el); anims.push({ kind: "ring", els: [el], t: 0, dur: 0.4, x: cx, y: cy });
        } else if (e.k === "die") {
            const els = [];
            for (let i = 0; i < 7; i++) {
                const a = (i / 7) * Math.PI * 2;
                const c = mk("circle", { cx, cy, r: 2.6, fill: e.c });
                fxG.appendChild(c); els.push({ el: c, a });
            }
            anims.push({ kind: "burst", els, t: 0, dur: 0.5, x: cx, y: cy });
        } else if (e.k === "atk") {
            const src = e.src;
            if (disp[src]) lunges[src] = { dx: e.dx, dy: e.dy, t: 0 };
            const ang = Math.atan2(e.dy, e.dx) * 180 / Math.PI;
            const tx = px(e.tx), ty = px(e.ty);
            const el = mk("path", { d: "M-11 -7 A 13 13 0 0 1 11 7", fill: "none", stroke: "#ffffff", "stroke-width": 3, "stroke-linecap": "round", opacity: 0.9, transform: `translate(${tx} ${ty}) rotate(${ang})` });
            fxG.appendChild(el); anims.push({ kind: "slash", els: [el], t: 0, dur: 0.18, x: tx, y: ty, ang });
        } else if (e.k === "shake") {
            shakeT = 0.22;
        } else if (e.k === "beat") {
            beatT = 0.3;
        }
    }
    function updateAnims(dt) {
        for (let i = anims.length - 1; i >= 0; i--) {
            const a = anims[i]; a.t += dt; const k = Math.min(1, a.t / a.dur);
            if (a.kind === "txt") {
                a.els[0].setAttribute("y", (a.y - 30 * k).toFixed(1));
                a.els[0].setAttribute("opacity", (1 - k).toFixed(2));
            } else if (a.kind === "fade") {
                a.els[0].setAttribute("opacity", (a.o0 * (1 - k)).toFixed(2));
            } else if (a.kind === "ring") {
                a.els[0].setAttribute("r", (TS * 0.3 + TS * 0.25 * k).toFixed(1));
                a.els[0].setAttribute("opacity", (0.9 * (1 - k)).toFixed(2));
            } else if (a.kind === "burst") {
                for (const b of a.els) {
                    b.el.setAttribute("cx", (a.x + Math.cos(b.a) * 20 * k).toFixed(1));
                    b.el.setAttribute("cy", (a.y + Math.sin(b.a) * 20 * k).toFixed(1));
                    b.el.setAttribute("opacity", (1 - k).toFixed(2));
                }
            } else if (a.kind === "slash") {
                const sc = 0.7 + 0.5 * k;
                a.els[0].setAttribute("transform", `translate(${a.x} ${a.y}) rotate(${a.ang}) scale(${sc.toFixed(2)})`);
                a.els[0].setAttribute("opacity", (0.9 * (1 - k)).toFixed(2));
            }
            if (k >= 1) { a.els.forEach((o) => (o.el || o).remove()); anims.splice(i, 1); }
        }
    }

    /* ---------------- render ---------------- */
    function heartRow(hp, god) {
        let s = "";
        for (let i = 0; i < MAX_HP; i++) {
            const on = i < hp;
            const col = god ? "#38bdf8" : "#ef4444";
            s += '<svg viewBox="0 0 24 24" width="13" height="13" fill="' + (on ? col : "none") + '" stroke="' + (on ? col : "#4b5563") + '" stroke-width="2" aria-hidden="true"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>';
        }
        heartsEl.innerHTML = s;
    }
    function msgText(m) {
        if (!m) return "";
        const mine = m.seat === mySeat();
        const rival = "Rival";
        switch (m.code) {
            case "first": return mine ? "You move first" : rival + " moves first";
            case "key": return mine ? "You grabbed the gold key" : rival + " grabbed the gold key";
            case "steal": return mine ? "You stole the key!" : rival + " stole your key!";
            case "fell": return mine ? "You fell…" : rival + " fell";
            case "escape": return mine ? "You escaped!" : rival + " escaped";
            case "locked": return "The exit is locked — find the gold key";
            default: return m.text || "";
        }
    }
    function score(seat) {
        const p = state.players[seat];
        return p.coins * 10 + p.kills * 25 + (p.escaped ? p.hp * 15 + 50 * (state.level + 1) : 0);
    }
    function render() {
        if (!state) return;
        if (buildKey !== state.level + ":" + state.gid) buildBoard();
        const me = mySeat(), rs = rivalSeat(), mp = state.players[me];
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
            const vis = isVisible(x, y);
            if (vis) seen[y][x] = true;
            tileEls[y][x].setAttribute("opacity", !seen[y][x] ? "0" : vis ? "1" : "0.34");
        }
        const setVis = (el, x, y, extra) => {
            if (!el) return;
            el.setAttribute("opacity", (extra === false) ? "0" : (isVisible(x, y) ? "1" : "0"));
        };
        const unlocked = state.key.holder === me;
        itemEls.exitStroke.setAttribute("stroke", unlocked ? "#facc15" : "#c4b5fd");
        setVis(itemEls.exit, state.exit.x, state.exit.y);
        itemEls.key.setAttribute("transform", `translate(${px(state.key.x)} ${px(state.key.y)})`);
        setVis(itemEls.key, state.key.x, state.key.y, state.key.holder === -1);
        state.potions.forEach((p, i) => { itemEls.potions[i].setAttribute("transform", `translate(${px(p.x)} ${px(p.y)})`); setVis(itemEls.potions[i], p.x, p.y, !p.taken); });
        state.traps.forEach((t, i) => {
            itemEls.traps[i].setAttribute("transform", `translate(${px(t.x)} ${px(t.y)})`);
            const op = !seen[t.y][t.x] ? "0" : t.sprung ? "0.22" : isVisible(t.x, t.y) ? "1" : "0.34";
            itemEls.traps[i].setAttribute("opacity", op);
        });
        state.coins.forEach((c, i) => { itemEls.coins[i].setAttribute("transform", `translate(${px(c.x)} ${px(c.y)})`); setVis(itemEls.coins[i], c.x, c.y, !c.taken); });
        state.enemies.forEach((e) => {
            const d = disp["e" + e.id]; if (d) { d.tx = px(e.x); d.ty = px(e.y); }
            enemyEls[e.id].setAttribute("opacity", e.hp > 0 && isVisible(e.x, e.y) ? "1" : "0");
            windupEls[e.id].setAttribute("opacity", e.hp > 0 && e.windup && isVisible(e.x, e.y) ? "1" : "0");
        });
        for (let seat = 0; seat < 2; seat++) {
            const p = state.players[seat], d = disp["p" + seat];
            if (d) { d.tx = px(p.x); d.ty = px(p.y); }
            const shown = p.alive && !p.escaped && (seat === me || isVisible(p.x, p.y));
            playerEls[seat].setAttribute("opacity", shown ? "1" : "0");
        }
        heartRow(mp.hp, mp.god);
        keyText.textContent = state.key.holder === me ? "you" : state.key.holder === rs ? "rival" : "—";
        keyText.style.color = state.key.holder === me ? "#facc15" : state.key.holder === rs ? "#f87171" : "";
        coinsEl.textContent = String(mp.coins);
        levelEl.textContent = String(state.level + 1);
        cheatFlag.hidden = !state.cheated;
        const myTurn = state.phase === "play" && cur(state) === me && active(state, me);
        turnEl.textContent = state.phase !== "play" ? "—" : myTurn ? "YOU" : "RIVAL";
        turnEl.style.color = state.phase !== "play" ? "" : PCOL[cur(state)];
        turnEl.style.borderColor = state.phase !== "play" ? "" : PCOL[cur(state)] + "55";
        let st, on = false;
        if (state.phase === "play") { st = myTurn ? "Your turn" : "Rival's turn"; on = myTurn; }
        else if (state.phase === "clear") st = "Level clear";
        else if (state.phase === "win") st = state.winner === me ? "Escaped" : "Rival escaped";
        else if (state.phase === "lose") st = "You fell";
        else st = "Draw";
        statusEl.textContent = st; dotEl.classList.toggle("on", on);
        for (const e of state.fx) {
            if (e.id <= lastFxId) continue;
            lastFxId = e.id;
            if (e.k === "beat" || e.k === "shake") { spawnFx(e); continue; }
            const involvesMe = (e.src === "p" + me) || (e.x === mp.x && e.y === mp.y);
            if (isVisible(e.x, e.y) || involvesMe) spawnFx(e);
        }
        if (state.msg && state.msg.id !== lastMsgId) {
            lastMsgId = state.msg.id;
            const txt = msgText(state.msg);
            if (txt) { toastEl.textContent = txt; toastEl.style.opacity = "1"; toastT = 2.6; }
        }
        cheatsOv.querySelector('[data-cheat="god"]').setAttribute("aria-pressed", String(mp.god));
        cheatsOv.querySelector('[data-cheat="reveal"]').setAttribute("aria-pressed", String(state.cheats.reveal));
        cheatsOv.querySelector('[data-cheat="freeze"]').setAttribute("aria-pressed", String(state.cheats.freeze));
        restartBtn.hidden = !canManage;
        if (state.phase === "play") { endOv.hidden = true; }
        else {
            endOv.hidden = false;
            const won = state.winner === me;
            let title, sub, primary = null;
            const sc = score(me);
            let best = 0;
            try { best = parseInt(localStorage.getItem(META.bestKey) || "0", 10) || 0; if (sc > best && !state.cheated) { best = sc; localStorage.setItem(META.bestKey, String(sc)); } } catch (err) { }
            const line = mp.coins + " coins · " + mp.kills + " kills · " + mp.steps + " steps · score " + sc + (best ? " · best " + best : "");
            if (state.phase === "clear") { title = "Level clear"; sub = line; primary = ["next", "Next level"]; }
            else if (state.phase === "win") {
                if (state.vsBot) { title = "Crypt cleared!"; sub = line; primary = ["restart0", "Play again"]; }
                else { title = won ? "You escaped!" : "Rival escaped"; sub = line; primary = canManage ? ["rematch", "Rematch"] : null; }
            } else if (state.phase === "lose") { title = "You fell"; sub = line; primary = ["retry", "Retry"]; }
            else { title = "The crypt claims all"; sub = line; primary = canManage ? ["rematch", "Rematch"] : null; }
            endTitle.textContent = title;
            endTitle.style.color = won || state.phase === "clear" ? "#34d399" : state.phase === "draw" ? "#c4b5fd" : "#f87171";
            endSub.textContent = sub;
            if (primary) { endPrimary.hidden = false; endPrimary.dataset.act = primary[0]; endPrimary.textContent = primary[1]; }
            else endPrimary.hidden = true;
            endWait.hidden = !(online && !canManage);
        }
    }

    /* ---------------- action pipeline ---------------- */
    function publish() {
        render();
        if (online && room.isHost) room.publishState(state).catch(console.warn);
        scheduleBot();
    }
    function applyAction(action, actor) {
        if (!state) return;
        if (act(state, action, actor)) publish();
    }
    function submitAction(action) {
        if (online && !room.isHost) { room.sendAction(action).catch(console.warn); return; }
        applyAction(action, mySeat());
    }
    function scheduleBot() {
        if (botTimer) { clearTimeout(botTimer); botTimer = 0; }
        if (online || !state || state.phase !== "play") return;
        if (cur(state) === 1 && active(state, 1)) {
            botTimer = setTimeout(() => {
                botTimer = 0;
                if (!destroyed && state && state.phase === "play" && cur(state) === 1) applyAction(botAction(state, 1), 1);
            }, 420 + Math.random() * 220);
        }
    }
    function startGame(level) {
        if (!canManage) return;
        state = newGame(level, !online, (Math.random() * 0x7fffffff) | 0);
        publish();
    }
    function submitMove(dx, dy) {
        if (!state || state.phase !== "play" || cur(state) !== mySeat() || !active(state, mySeat())) return;
        submitAction({ t: "move", d: [dx, dy] });
    }
    function submitWait() {
        if (!state || state.phase !== "play" || cur(state) !== mySeat() || !active(state, mySeat())) return;
        submitAction({ t: "wait" });
    }

    /* ---------------- click delegation ---------------- */
    function handleClick(event) {
        const t = event.target;
        if (t.closest("[data-exit]")) { onExit(); return; }
        if (t.closest("[data-cheats-toggle]")) { cheatsOv.hidden = !cheatsOv.hidden; return; }
        if (t.closest("[data-cheat-close]")) { cheatsOv.hidden = true; return; }
        const ch = t.closest("[data-cheat]");
        if (ch) { submitAction({ t: "cheat", c: ch.dataset.cheat }); return; }
        const actBtn = t.closest("[data-act]");
        if (actBtn) {
            const a = actBtn.dataset.act;
            if (a === "restart") startGame(state ? state.level : 0);
            else if (a === "retry") startGame(state ? state.level : 0);
            else if (a === "next") startGame(state ? Math.min(LEVELS.length - 1, state.level + 1) : 0);
            else if (a === "rematch") startGame(state ? state.level : 0);
            else if (a === "restart0") startGame(0);
            return;
        }
    }
    root.addEventListener("click", handleClick);

    /* ---------------- keyboard ---------------- */
    const KEYMAP = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0], w: [0, -1], s: [0, 1], a: [-1, 0], d: [1, 0], W: [0, -1], S: [0, 1], A: [-1, 0], D: [1, 0] };
    function onKey(e) {
        if (destroyed || !state) return;
        const tag = (e.target && e.target.tagName) || "";
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || e.target.isContentEditable) return;
        if (e.metaKey || e.ctrlKey || e.altKey) return;
        if (e.key === "Escape") { cheatsOv.hidden = true; return; }
        if (e.key === "c" || e.key === "C") { cheatsOv.hidden = !cheatsOv.hidden; e.preventDefault(); return; }
        if ((e.key === "r" || e.key === "R") && canManage) { startGame(state.level); e.preventDefault(); return; }
        if (e.key === " " || e.key === ".") { submitWait(); e.preventDefault(); return; }
        const d = KEYMAP[e.key];
        if (d) { submitMove(d[0], d[1]); e.preventDefault(); }
    }
    document.addEventListener("keydown", onKey);

    /* ---------------- pointer: swipe (mobile) + click (desktop) ---------------- */
    let ptr = null;
    function tileFromEvent(e) {
        const rect = board.getBoundingClientRect();
        const scale = Math.min(rect.width / VW, rect.height / VH);
        const ox = (rect.width - VW * scale) / 2, oy = (rect.height - VH * scale) / 2;
        const x = Math.floor((e.clientX - rect.left - ox) / (TS * scale));
        const y = Math.floor((e.clientY - rect.top - oy) / (TS * scale));
        return { x, y };
    }
    function onPointerDown(e) {
        if (!state || state.phase !== "play") return;
        ptr = { x: e.clientX, y: e.clientY, id: e.pointerId };
        try { board.setPointerCapture(e.pointerId); } catch (err) { }
    }
    function onPointerUp(e) {
        if (!ptr || ptr.id !== e.pointerId) return;
        const dx = e.clientX - ptr.x, dy = e.clientY - ptr.y;
        ptr = null;
        if (Math.max(Math.abs(dx), Math.abs(dy)) > 26) {
            if (Math.abs(dx) >= Math.abs(dy)) submitMove(Math.sign(dx), 0);
            else submitMove(0, Math.sign(dy));
            return;
        }
        if (cur(state) !== mySeat() || !active(state, mySeat())) return;
        const { x, y } = tileFromEvent(e);
        if (x < 0 || y < 0 || x >= W || y >= H || !floor(state, x, y)) return;
        const p = state.players[mySeat()];
        if (x === p.x && y === p.y) { submitWait(); return; }
        if (Math.abs(x - p.x) + Math.abs(y - p.y) === 1) { submitMove(x - p.x, y - p.y); return; }
        const dist = plainDist(state.level, x, y);
        const cd = dist[p.x + "," + p.y];
        if (cd == null) return;
        let best = null;
        for (const [ddx, ddy] of DIRS4) {
            const nx = p.x + ddx, ny = p.y + ddy;
            if (!floor(state, nx, ny)) continue;
            const d = dist[nx + "," + ny];
            if (d != null && d < cd && (!best || d < best[0])) best = [d, [ddx, ddy]];
        }
        if (best) submitMove(best[1][0], best[1][1]);
    }
    function onPointerMove(e) {
        if (!state || e.pointerType !== "mouse") { hoverRect.setAttribute("opacity", "0"); return; }
        const { x, y } = tileFromEvent(e);
        if (x >= 0 && y >= 0 && x < W && y < H && floor(state, x, y) && seen[y] && seen[y][x]) {
            hoverRect.setAttribute("x", x * TS + 1); hoverRect.setAttribute("y", y * TS + 1);
            hoverRect.setAttribute("opacity", "0.55");
        } else hoverRect.setAttribute("opacity", "0");
    }
    function onPointerLeave() { hoverRect.setAttribute("opacity", "0"); }
    board.addEventListener("pointerdown", onPointerDown);
    board.addEventListener("pointerup", onPointerUp);
    board.addEventListener("pointercancel", () => { ptr = null; });
    board.addEventListener("pointermove", onPointerMove);
    board.addEventListener("pointerleave", onPointerLeave);

    /* ---------------- animation loop ---------------- */
    function tick(t) {
        if (destroyed) return;
        raf = requestAnimationFrame(tick);
        if (!lastT) lastT = t;
        let dt = (t - lastT) / 1000; lastT = t;
        if (!(dt > 0)) dt = 0; if (dt > 0.05) dt = 0.05;
        windupPhase += dt;
        const k = 1 - Math.exp(-dt * 16);
        for (const key in disp) {
            const d = disp[key];
            if (d.tx == null) continue;
            d.x += (d.tx - d.x) * k; d.y += (d.ty - d.y) * k;
        }
        for (const key in lunges) {
            const l = lunges[key]; l.t += dt;
            if (l.t >= 0.16) delete lunges[key];
        }
        const place = (key, el, bob) => {
            const d = disp[key]; if (!d || !el) return;
            let ox = 0, oy = 0;
            const l = lunges[key];
            if (l) { const kk = Math.sin(Math.PI * Math.min(1, l.t / 0.16)); ox = l.dx * kk * TS * 0.34; oy = l.dy * kk * TS * 0.34; }
            if (bob) oy += Math.sin(windupPhase * 6 + d.x) * 1.2;
            el.setAttribute("transform", `translate(${(d.x + ox).toFixed(1)} ${(d.y + oy).toFixed(1)})`);
        };
        for (let seat = 0; seat < 2; seat++) place("p" + seat, playerEls[seat], false);
        if (state) state.enemies.forEach((e) => place("e" + e.id, enemyEls[e.id], e.type === "bat"));
        if (state) state.enemies.forEach((e) => {
            if (windupEls[e.id]) windupEls[e.id].setAttribute("y", (-TS * 0.5 + Math.sin(windupPhase * 8) * 1.5).toFixed(1));
        });
        updateAnims(dt);
        if (shakeT > 0) {
            shakeT -= dt;
            const amp = Math.max(0, shakeT / 0.22) * 3;
            board.style.transform = `translate(${(Math.random() * 2 - 1) * amp}px,${(Math.random() * 2 - 1) * amp}px)`;
        } else board.style.transform = "";
        if (beatT > 0) {
            beatT -= dt;
            const bk = Math.max(0, beatT / 0.3);
            beatFlash.setAttribute("opacity", (bk * 0.05).toFixed(3));
            beatEl.style.transform = `rotate(45deg) scale(${(1 + bk * 0.5).toFixed(2)})`;
            beatEl.style.background = `rgba(56,189,248,${(0.15 + bk * 0.6).toFixed(2)})`;
        } else { beatFlash.setAttribute("opacity", "0"); beatEl.style.transform = "rotate(45deg)"; beatEl.style.background = ""; }
        if (toastT > 0) {
            toastT -= dt;
            if (toastT <= 0) toastEl.style.opacity = "0";
            else if (toastT < 0.5) toastEl.style.opacity = (toastT / 0.5).toFixed(2);
        }
    }

    /* ---------------- room wiring / init ---------------- */
    if (online) {
        room.onRoom((nextRoom) => { roomData = nextRoom; render(); });
        if (room.isHost) {
            state = newGame(0, false, (Math.random() * 0x7fffffff) | 0);
            publish();
            room.onAction((action) => applyAction(action, state ? state.seatOf.guest : 1));
        } else {
            room.onState((nextState) => { state = nextState; render(); });
        }
    } else {
        state = newGame(0, true, (Math.random() * 0x7fffffff) | 0);
        publish();
    }
    raf = requestAnimationFrame(tick);

    return {
        destroy() {
            destroyed = true;
            if (raf) cancelAnimationFrame(raf);
            if (botTimer) clearTimeout(botTimer);
            document.removeEventListener("keydown", onKey);
            root.removeEventListener("click", handleClick);
            board.removeEventListener("pointerdown", onPointerDown);
            board.removeEventListener("pointerup", onPointerUp);
            board.removeEventListener("pointermove", onPointerMove);
            board.removeEventListener("pointerleave", onPointerLeave);
        },
    };
}

/* exposed for automated tests / tooling (not used by the UI) */
export const _engine = { newGame, act, botAction, cur, active, plainDist, PARSED, LEVELS, W, H, MAX_HP };