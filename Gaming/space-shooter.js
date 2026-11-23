/* ==== GAME: space-shooter.js ==== */

/*
    - File ini mengikuti template game (META + mount).
  - id META harus sama dengan nama file tanpa .js  ->  "space-shooter".
  - Setelah menyalin file ini, jalankan: node tools/build-games-manifest.mjs
*/

export const META = {
    id: "space-shooter",
    name: "Space Shooter",
    category: "action",
    catLabel: "Action",
    desc: "Clear randomized, always-solvable enemy sectors and destroy the flagship. Solo, vs bot, or online duel.",
    art: '<svg viewBox="0 0 48 48" width="54" height="54" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M24 4l6 9v10l-6 5-6-5V13z"/><path d="M18 26l-5 8M30 26l5 8"/><path d="M24 33v11"/><circle cx="24" cy="10" r="2" fill="currentColor" stroke="none"/></svg>',
    bg: ["#c7d2fe", "#818cf8"],
    bestKey: "spaceShooterBest",
};

export function mount(root, context = {}) {
    const { mode = "ai", room = null, playerName = "Player", onExit = () => { } } = context;
    const online = mode === "room" && Boolean(room);
    const isHost = !online || Boolean(room.isHost);
    const authoritative = isHost; // host = satu-satunya penulis state kanonik
    let roomData = (online && room.room) || null;
    let lobbyGuestName = "";
    let destroyed = false;

    /* ================= konstanta & aturan murni ================= */
    const W = 560, H = 520;
    const SHIP_Y = H - 46;
    const PLAYER_SPEED = 300, BULLET_V = 460, COOLDOWN = 0.27;
    const START_HP = 100, INVULN_S = 1.6, REPAIR_BONUS = 8;
    const WAVE_COUNT = 4, TOTAL_LEVELS = WAVE_COUNT + 1; // 4 sektor + flagship
    const FIRST_STRIKE_S = 2.2; // head-start hasil coin flip (duel)
    const PUB_INTERVAL = 0.1;   // host publish snapshot ~10 Hz
    const DMG = { enemyHit: 25, pass: 10, bomb: 18, bossHit: 35 };
    const SCORE = { enemy: 15, bossHit: 5, bossKill: 300 };
    const SHIP_COLORS = ["#818cf8", "#34d399"];
    const SHIP_STROKES = ["#e0e7ff", "#d1fae5"];
    const NOINPUT = { left: false, right: false, fire: false, tx: null };

    const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
    function circleHit(x1, y1, r1, x2, y2, r2) {
        const dx = x1 - x2, dy = y1 - y2, r = r1 + r2;
        return dx * dx + dy * dy <= r * r;
    }
    /* PRNG mulberry32 yang state-nya serializable (dibawa di state.rngState) */
    function rnd(s) {
        s.rngState = (s.rngState + 0x6d2b79f5) >>> 0;
        let t = s.rngState;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }

    /* ===== Random level generator yang DIJAMIN bisa diselesaikan =====
       Musuh seragam: 1 HP, 1 pola gerak (sinus drift), tanpa ability.
       Tingkat kesulitan hanya dari jumlah / kecepatan / interval spawn.
       Batas kelayakan (solvable):
         1. interval >= cooldown tembak * 1.7  -> DPS pemain cukup untuk semua spawn
         2. musuh di layar bersamaan <= 7      -> tidak menumpuk tak terkejar
         3. kecepatan jatuh <= 140 px/s        -> waktu reaksi memadai
         4. kecepatan geser horizontal musuh <= 55% kecepatan pemain -> selalu bisa dikejar
         5. bom boss: interval >= 0.8 s, jatuh >= 1.3 s -> selalu bisa dihindari  */
    function levelSolvable(c) {
        const fall = (H + 40) / c.evSpeed;
        return (
            c.interval >= COOLDOWN * 1.7 &&
            fall / c.interval <= 7 &&
            c.evSpeed <= 140 &&
            c.drift * 2.1 <= PLAYER_SPEED * 0.55 &&
            c.count >= 6 && c.count <= 22
        );
    }
    function repairLevel(c) {
        c.evSpeed = Math.min(c.evSpeed, 140);
        c.interval = Math.max(c.interval, COOLDOWN * 1.7);
        const fall = (H + 40) / c.evSpeed;
        if (fall / c.interval > 7) c.interval = (fall / 7) * 1.02;
        c.drift = Math.min(c.drift, (PLAYER_SPEED * 0.55) / 2.1);
        c.count = clamp(Math.round(c.count), 6, 22);
        return c;
    }
    function makeSolvableLevels(seed) {
        const rs = { rngState: seed >>> 0 };
        const levels = [];
        for (let i = 0; i < WAVE_COUNT; i++) {
            let c = {
                count: Math.round(8 + i * 3 + rnd(rs) * 4),
                interval: 1.22 - i * 0.17 - rnd(rs) * 0.12,
                evSpeed: 64 + i * 15 + rnd(rs) * 14,
                drift: 12 + i * 9 + rnd(rs) * 10,
            };
            let guard = 0;
            while (!levelSolvable(c) && guard < 8) { c = repairLevel(c); guard++; }
            if (!levelSolvable(c)) c = { count: 10, interval: 1.1, evSpeed: 70, drift: 18 };
            levels.push(c);
        }
        const boss = {
            hp: 22 + Math.round(rnd(rs) * 8),          // <= 30 tembakan (~8 dtk fokus tembak)
            speed: 120 + Math.round(rnd(rs) * 45),
            bombInt: Math.max(0.8, 0.95 + rnd(rs) * 0.35),
            bombV: Math.min(230, 185 + Math.round(rnd(rs) * 45)),
        };
        return { levels: levels, boss: boss };
    }

    /* ================= state & input ================= */
    let state = null;      // state kanonik (serializable, dipublish ke Firebase oleh host)
    let inputs = [];       // input per pemain — LOKAL di host, tidak ikut dipublish
    let paused = false, helpOpen = false, cheatOpen = false;
    const cheats = { god: false, rapid: false, triple: false, slow: false };
    let cheated = false;
    let botT = 0, botErr = 0;
    let raf = 0, lastT = 0, pubT = 0, lastPubPhase = "";
    let lastTxSend = 0;
    let best = 0;
    try { best = parseInt(localStorage.getItem(META.bestKey) || "0", 10) || 0; } catch (err) { best = 0; }

    function nameFor(ctrl) {
        if (ctrl === "human") return playerName || "You";
        if (ctrl === "bot") return "Bot";
        if (ctrl === "host") return playerName || "Host";
        return lobbyGuestName || "Guest";
    }
    function myIdx(s) {
        if (!s || !s.players) return -1;
        const ctrl = online ? (isHost ? "host" : "guest") : "human";
        return s.players.findIndex((p) => p.controller === ctrl);
    }
    function anyCheat() { return cheats.god || cheats.rapid || cheats.triple || cheats.slow; }
    function resetCheats() {
        cheats.god = cheats.rapid = cheats.triple = cheats.slow = false;
        root.querySelectorAll("[data-cheat]").forEach((el) => { el.checked = false; });
    }

    function newMatch(matchMode) {
        const seed = (Math.random() * 4294967296) >>> 0;
        const gen = makeSolvableLevels(seed);
        let controllers;
        if (matchMode === "solo") controllers = ["human"];
        else if (online) {
            // ACAK posisi pemain multiplayer: host/guest bisa jadi P1 (kiri) atau P2 (kanan)
            controllers = Math.random() < 0.5 ? ["host", "guest"] : ["guest", "host"];
        } else {
            controllers = Math.random() < 0.5 ? ["human", "bot"] : ["bot", "human"];
        }
        const players = controllers.map((c, i) => ({
            controller: c,
            name: nameFor(c),
            x: controllers.length === 1 ? W / 2 : i === 0 ? W * 0.3 : W * 0.7,
            hp: START_HP, score: 0, alive: true, cd: 0, invuln: 0,
        }));
        // ACAK siapa jalan duluan (coin flip) — berlaku saat vs bot & duel online
        const firstMover = matchMode === "solo" ? -1 : Math.random() < 0.5 ? 0 : 1;
        state = {
            v: 1, mode: matchMode, phase: "intro", phaseT: 1.6,
            level: 1, seed: seed, rngState: seed,
            levels: gen.levels, bossCfg: gen.boss,
            spawned: 0, spawnT: 0.55, time: 0,
            firstMover: firstMover, firstT: FIRST_STRIKE_S,
            players: players, enemies: [], bullets: [], bombs: [], boss: null,
            nextId: 1, winner: null, reason: "",
        };
        inputs = players.map(() => ({ left: false, right: false, fire: false, tx: null }));
        botT = 0; botErr = 0; cheated = false;
        resetCheats();
        paused = false; helpOpen = false; cheatOpen = false;
        hideAllOverlays();
        resetView();
        publishNow();
        render(state);
    }

    /* ================= simulasi (hanya host / lokal) ================= */
    function addScore(s, i, n) { if (s.players[i]) s.players[i].score += n; }
    function nearestPlayer(s, x) {
        let bi = -1, bd = 1e9;
        for (let i = 0; i < s.players.length; i++) {
            const p = s.players[i];
            if (!p.alive) continue;
            const d = Math.abs(p.x - x);
            if (d < bd) { bd = d; bi = i; }
        }
        return bi;
    }
    function damage(s, i, n, kind) {
        const p = s.players[i];
        if (!p || !p.alive) return;
        if (!online && cheats.god && p.controller === "human") return;
        if (kind === "hit" && p.invuln > 0) return;
        p.hp = Math.max(0, p.hp - n);
        if (kind === "hit") p.invuln = INVULN_S;
        if (p.hp <= 0) p.alive = false;
    }
    function endMatch(s, winner, reason) {
        s.phase = "over"; s.winner = winner; s.reason = reason;
        if (s.mode === "solo" && !cheated && s.players[0].score > best) {
            best = s.players[0].score;
            try { localStorage.setItem(META.bestKey, String(best)); } catch (err) { }
        }
        publishNow();
    }
    function checkDeaths(s) {
        if (s.phase === "over") return true;
        let deadAny = false, aliveIdx = -1, aliveCount = 0;
        for (let i = 0; i < s.players.length; i++) {
            if (s.players[i].alive) { aliveCount++; aliveIdx = i; } else deadAny = true;
        }
        if (!deadAny) return false;
        if (s.mode === "solo") { endMatch(s, -1, "Your ship was destroyed."); return true; }
        if (aliveCount === 0) { endMatch(s, -1, "Both ships were destroyed."); return true; }
        const loser = s.players[aliveIdx === 0 ? 1 : 0];
        endMatch(s, aliveIdx, loser.name + " was destroyed.");
        return true;
    }
    function duelWinnerByScore(s) {
        if (s.mode === "solo") return 0;
        const a = s.players[0].score, b = s.players[1].score;
        return a === b ? -1 : a > b ? 0 : 1;
    }
    function mkBullet(s, x, y, vx, o) {
        s.bullets.push({ id: s.nextId++, x: x, y: y, vx: vx, o: o });
    }
    function fire(s, i) {
        const p = s.players[i];
        if (p.cd > 0) return;
        const humanLocal = !online && p.controller === "human";
        p.cd = humanLocal && cheats.rapid ? 0.07 : COOLDOWN;
        mkBullet(s, p.x, SHIP_Y - 18, 0, i);
        if (humanLocal && cheats.triple) {
            mkBullet(s, p.x, SHIP_Y - 18, -130, i);
            mkBullet(s, p.x, SHIP_Y - 18, 130, i);
        }
    }
    function spawnEnemy(s, cfg) {
        const x = 30 + rnd(s) * (W - 60);
        s.enemies.push({
            id: s.nextId++, x: x, x0: x, y: -18,
            vy: cfg.evSpeed * (0.85 + rnd(s) * 0.3),
            drift: cfg.drift, t: rnd(s) * 6,
        });
        s.spawned++;
    }
    function spawnBoss(s) {
        const cfg = s.bossCfg;
        s.boss = { x: W / 2, y: 96, dir: rnd(s) < 0.5 ? -1 : 1, hp: cfg.hp, hpMax: cfg.hp, bombT: 1.1 };
    }
    function dropBomb(s) {
        const b = s.boss;
        const ti = nearestPlayer(s, b.x + (rnd(s) * 2 - 1) * 160);
        const tx = ti >= 0 ? s.players[ti].x : W / 2;
        const vx = clamp((tx - b.x) * 0.55, -90, 90);
        s.bombs.push({ id: s.nextId++, x: b.x, y: b.y + 24, vx: vx });
    }
    function nextLevel(s) {
        s.level++;
        s.phase = "intro"; s.phaseT = 1.5;
        s.spawned = 0; s.spawnT = 0.55;
        s.enemies.length = 0; s.bullets.length = 0; s.bombs.length = 0;
        for (let i = 0; i < s.players.length; i++) {
            const p = s.players[i];
            if (p.alive) p.hp = Math.min(START_HP, p.hp + REPAIR_BONUS);
        }
    }
    function botThink(s, i, dt) {
        const p = s.players[i], inp = inputs[i];
        inp.left = false; inp.right = false; inp.fire = false; inp.tx = null;
        if (s.phase !== "play" || !p.alive) return;
        // hindari bom yang sudah dekat
        let threat = null;
        for (let k = 0; k < s.bombs.length; k++) {
            const b = s.bombs[k];
            if (b.y > H * 0.5 && Math.abs(b.x - p.x) < 64) { threat = b; break; }
        }
        if (threat) {
            inp.tx = clamp(p.x + (threat.x >= p.x ? -90 : 90), 24, W - 24);
            inp.fire = true;
            return;
        }
        let target = null;
        for (let k = 0; k < s.enemies.length; k++) {
            const e = s.enemies[k];
            if (!target || e.y > target.y) target = e;
        }
        const aim = target ? target.x : s.boss ? s.boss.x : W / 2;
        botT -= dt;
        if (botT <= 0) { botT = 0.22 + Math.random() * 0.1; botErr = (Math.random() * 2 - 1) * 18; }
        inp.tx = clamp(aim + botErr, 24, W - 24);
        inp.fire = s.boss ? true : Math.abs(aim - p.x) < 30;
    }

    function simulate(dt) {
        const s = state;
        if (!s || s.phase === "lobby" || s.phase === "over") return;
        s.time += dt;
        if (s.phase === "intro") {
            s.phaseT -= dt;
            if (s.phaseT <= 0) {
                s.phase = "play";
                if (s.level === TOTAL_LEVELS) spawnBoss(s);
            }
        }
        const playing = s.phase === "play";
        const wdt = dt * (!online && cheats.slow ? 0.55 : 1); // slow-motion cheat
        if (playing && s.firstT > 0) s.firstT = Math.max(0, s.firstT - dt);

        if (!online && s.mode === "duel") {
            const bi = s.players.findIndex((p) => p.controller === "bot");
            if (bi >= 0) botThink(s, bi, dt);
        }

        /* pemain: gerak + tembak (head-start first strike mengunci lawan) */
        for (let i = 0; i < s.players.length; i++) {
            const p = s.players[i];
            if (!p.alive) continue;
            p.cd = Math.max(0, p.cd - dt);
            p.invuln = Math.max(0, p.invuln - dt);
            const locked = s.mode === "duel" && s.level === 1 && s.firstT > 0 && s.firstMover !== i;
            const inp = locked ? NOINPUT : inputs[i] || NOINPUT;
            let mv = 0;
            if (inp.left) mv -= 1;
            if (inp.right) mv += 1;
            if (mv) p.x = clamp(p.x + mv * PLAYER_SPEED * dt, 24, W - 24);
            else if (inp.tx != null) {
                const d = inp.tx - p.x, st = PLAYER_SPEED * dt;
                p.x = clamp(p.x + clamp(d, -st, st), 24, W - 24);
            }
            if (playing && inp.fire && !locked) fire(s, i);
        }

        /* spawn wave */
        if (playing && s.level < TOTAL_LEVELS) {
            const cfg = s.levels[s.level - 1];
            if (s.spawned < cfg.count) {
                s.spawnT -= wdt;
                if (s.spawnT <= 0) { spawnEnemy(s, cfg); s.spawnT = cfg.interval * (0.7 + rnd(s) * 0.6); }
            } else if (s.enemies.length === 0) {
                nextLevel(s);
            }
        }

        /* musuh — semuanya identik: 1 HP, drift sinus, tanpa ability */
        for (let i = s.enemies.length - 1; i >= 0; i--) {
            const e = s.enemies[i];
            e.t += wdt; e.y += e.vy * wdt;
            e.x = e.x0 + Math.sin(e.t * 2.1) * e.drift;
            if (e.y > H - 24) {
                s.enemies.splice(i, 1);
                const t = nearestPlayer(s, e.x);
                if (t >= 0) damage(s, t, DMG.pass, "pass");
                continue;
            }
            let hit = -1;
            for (let j = 0; j < s.players.length; j++) {
                const p = s.players[j];
                if (p.alive && p.invuln <= 0 && circleHit(e.x, e.y, 14, p.x, SHIP_Y, 16)) { hit = j; break; }
            }
            if (hit >= 0) { s.enemies.splice(i, 1); damage(s, hit, DMG.enemyHit, "hit"); }
        }
        if (checkDeaths(s)) return;

        /* boss */
        if (playing && s.boss) {
            const b = s.boss, cfg = s.bossCfg;
            b.x += b.dir * cfg.speed * wdt;
            if (b.x > W - 60) { b.x = W - 60; b.dir = -1; }
            if (b.x < 60) { b.x = 60; b.dir = 1; }
            b.bombT -= wdt;
            if (b.bombT <= 0) { dropBomb(s); b.bombT = cfg.bombInt * (0.75 + rnd(s) * 0.5); }
            for (let j = 0; j < s.players.length; j++) {
                const p = s.players[j];
                if (p.alive && p.invuln <= 0 && circleHit(b.x, b.y, 30, p.x, SHIP_Y, 16)) damage(s, j, DMG.bossHit, "hit");
            }
            if (checkDeaths(s)) return;
        }

        /* peluru pemain */
        for (let i = s.bullets.length - 1; i >= 0; i--) {
            const u = s.bullets[i];
            u.y -= BULLET_V * dt;
            u.x += u.vx * dt;
            let dead = u.y < 6 || u.x < 4 || u.x > W - 4;
            if (!dead) {
                for (let j = s.enemies.length - 1; j >= 0; j--) {
                    const e = s.enemies[j];
                    if (circleHit(u.x, u.y, 6, e.x, e.y, 14)) {
                        s.enemies.splice(j, 1);
                        addScore(s, u.o, SCORE.enemy);
                        dead = true;
                        break;
                    }
                }
            }
            if (!dead && s.boss && circleHit(u.x, u.y, 6, s.boss.x, s.boss.y, 32)) {
                const b = s.boss;
                b.hp -= 1;
                addScore(s, u.o, SCORE.bossHit);
                dead = true;
                if (b.hp <= 0) {
                    addScore(s, u.o, SCORE.bossKill);
                    s.boss = null;
                    endMatch(s, duelWinnerByScore(s), "Flagship destroyed. The sector is clear.");
                    return;
                }
            }
            if (dead) s.bullets.splice(i, 1);
        }

        /* bom boss */
        for (let i = s.bombs.length - 1; i >= 0; i--) {
            const b = s.bombs[i];
            b.y += s.bossCfg.bombV * wdt;
            b.x += b.vx * wdt;
            let dead = b.y > H - 10 || b.x < 6 || b.x > W - 6;
            if (!dead) {
                for (let j = 0; j < s.players.length; j++) {
                    const p = s.players[j];
                    if (p.alive && p.invuln <= 0 && circleHit(b.x, b.y, 5, p.x, SHIP_Y, 16)) {
                        damage(s, j, DMG.bomb, "bomb");
                        dead = true;
                        break;
                    }
                }
            }
            if (dead) s.bombs.splice(i, 1);
        }
        checkDeaths(s);
    }

    /* ================= UI (minimalis) ================= */
    root.innerHTML = `
<div class="game-app ss-app">
<style>
.ss-app{--ss-line:#e2e8f0;--ss-ink:#0f172a;--ss-mut:#64748b;--ss-acc:#6366f1;--ss-board:#0b1020;display:flex;flex-direction:column;gap:14px;color:var(--ss-ink)}
.ss-app [hidden]{display:none!important}
.ss-hud{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-bottom:10px}
.ss-chip{display:inline-flex;align-items:center;gap:7px;padding:4px 11px;border:1px solid var(--ss-line);border-radius:999px;background:#fff;font-size:12px;color:var(--ss-mut);white-space:nowrap}
.ss-chip b{color:var(--ss-ink);font-variant-numeric:tabular-nums;font-weight:600}
.ss-dot{width:8px;height:8px;border-radius:50%;background:#818cf8;flex:none}
.ss-hpbar{width:56px;height:5px;border-radius:3px;background:#eef2f7;overflow:hidden;flex:none}
.ss-hpfill{display:block;height:100%;width:100%;border-radius:3px;background:#10b981;transition:width .15s linear}
.ss-cheatflag{color:#b45309;border-color:#fcd34d;background:#fffbeb;font-weight:700;letter-spacing:.06em}
.ss-stage{position:relative;border-radius:14px;overflow:hidden;background:var(--ss-board);user-select:none;-webkit-user-select:none}
.ss-board{display:block;width:100%;height:auto;touch-action:none;cursor:crosshair}
.ss-banner{fill:#fff;font-weight:800;letter-spacing:5px}
.ss-bannersub{fill:#94a3b8;font-weight:500;letter-spacing:1px}
.ss-shiplabel{fill:#7c8db0;font-size:9px;letter-spacing:1px}
.ss-lerp [data-ent]{transition:transform .12s linear}
.ss-overlay{position:absolute;inset:0;z-index:6;display:flex;align-items:center;justify-content:center;padding:14px;background:rgba(7,11,26,.72);backdrop-filter:blur(4px)}
.ss-card{width:100%;max-width:430px;max-height:100%;overflow:auto;background:#fff;border-radius:14px;padding:20px 22px;box-shadow:0 18px 50px rgba(2,6,23,.45)}
.ss-kicker{font-size:10px;font-weight:700;letter-spacing:.16em;text-transform:uppercase;color:var(--ss-acc);margin:0 0 4px}
.ss-card h3{margin:0 0 6px;font-size:19px;letter-spacing:-.01em}
.ss-card p{margin:6px 0;font-size:13px;line-height:1.55;color:#334155}
.ss-list{margin:10px 0;padding-left:16px;display:grid;gap:6px;font-size:13px;line-height:1.5;color:#334155}
.ss-kbd{display:inline-block;padding:0 6px;border:1px solid var(--ss-line);border-bottom-width:2px;border-radius:5px;background:#f8fafc;font-size:11px;font-family:ui-monospace,monospace}
.ss-btn{appearance:none;border:1px solid var(--ss-acc);background:var(--ss-acc);color:#fff;border-radius:10px;padding:9px 16px;font-size:13px;font-weight:600;cursor:pointer}
.ss-btn:hover{filter:brightness(1.06)}
.ss-btn:disabled{opacity:.5;cursor:default}
.ss-btn.ghost{background:#fff;color:var(--ss-ink);border-color:var(--ss-line)}
.ss-btn.ghost:hover{border-color:#cbd5e1;background:#f8fafc}
.ss-btnrow{display:flex;flex-wrap:wrap;gap:8px;margin-top:14px}
.ss-note{font-size:11.5px;color:var(--ss-mut);margin:8px 0 0}
.ss-touch{display:none;gap:10px;margin-top:10px}
.ss-pad{flex:1;height:54px;border-radius:12px;border:1px solid var(--ss-line);background:#fff;color:var(--ss-ink);font-size:17px;cursor:pointer;touch-action:none;user-select:none;-webkit-user-select:none}
.ss-pad:active{transform:translateY(1px);background:#f1f5f9}
.ss-pad.fire{flex:1.5;background:var(--ss-acc);border-color:var(--ss-acc);color:#fff;font-weight:800;letter-spacing:.12em;font-size:13px}
.ss-pad.fire:active{background:#4f46e5}
@media (pointer:coarse),(max-width:720px){.ss-touch{display:flex}.ss-deskhint{display:none}}
.ss-cheat{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:9px 2px;border-bottom:1px dashed var(--ss-line);font-size:13px}
.ss-cheat small{display:block;color:var(--ss-mut);font-size:11px}
.ss-cheat input{width:17px;height:17px;accent-color:var(--ss-acc);flex:none}
.ss-scores{margin:10px 0 0;font-size:13px;display:grid;gap:4px}
.ss-scores div{display:flex;justify-content:space-between;border-bottom:1px dashed var(--ss-line);padding:4px 2px}
</style>
  <div class="game-intro">
    <div><h2>Space Shooter</h2><p>Clear five randomized, always-solvable sectors and destroy the flagship. Play solo, duel a bot, or duel a friend online.</p></div>
    <span class="game-status"><i class="game-status-dot"></i><span data-status>Ready</span></span>
  </div>
  <section class="game-panel" data-board>
    <div class="ss-hud">
      <span class="ss-chip" data-pchip="0"><i class="ss-dot" data-pdot="0"></i><b data-pname="0">P1</b><span class="ss-hpbar"><span class="ss-hpfill" data-php="0"></span></span><b data-pscore="0">0</b></span>
      <span class="ss-chip" data-pchip="1" hidden><i class="ss-dot" data-pdot="1"></i><b data-pname="1">P2</b><span class="ss-hpbar"><span class="ss-hpfill" data-php="1"></span></span><b data-pscore="1">0</b></span>
      <span class="ss-chip">Sector <b data-level>1</b>/${TOTAL_LEVELS}</span>
      <span class="ss-chip" data-seedchip hidden>Layout <b data-seed>—</b></span>
      <span class="ss-chip" data-bestchip hidden>Best <b data-best>0</b></span>
      <span class="ss-chip ss-cheatflag" data-cheatflag hidden>CHEATS</span>
    </div>
    <div class="ss-stage" data-stage>
      <svg data-svg class="ss-board" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" aria-label="Space Shooter board">
        <rect x="0" y="0" width="${W}" height="${H}" fill="#0b1020"></rect>
        <g data-g="stars"></g>
        <g data-g="shots"></g>
        <g data-g="bombs"></g>
        <g data-g="enemies"></g>
        <g data-g="boss"></g>
        <g data-g="ships"></g>
        <g data-g="fx"></g>
        <text class="ss-banner" data-banner x="${W / 2}" y="232" font-size="32" text-anchor="middle" hidden></text>
        <text class="ss-bannersub" data-bannersub x="${W / 2}" y="262" font-size="13" text-anchor="middle" hidden></text>
      </svg>

      <div class="ss-overlay" data-ov="start" hidden>
        <div class="ss-card">
          <p class="ss-kicker">Space Shooter</p>
          <h3>Ready to launch?</h3>
          <ul class="ss-list">
            <li><b>Move</b> — mouse, <span class="ss-kbd">A</span>/<span class="ss-kbd">D</span> or arrow keys, or the on-screen pads.</li>
            <li><b>Fire</b> — hold click / <span class="ss-kbd">Space</span> / the FIRE pad.</li>
            <li><b>Goal</b> — clear 4 random sectors, then destroy the flagship. Every layout is generated to be beatable.</li>
            <li><b>VS Bot</b> — a coin flip decides who moves first (2.2s head start). Highest score wins if both survive.</li>
          </ul>
          <div class="ss-btnrow">
            <button class="ss-btn" type="button" data-start="solo">Solo campaign</button>
            <button class="ss-btn ghost" type="button" data-start="duel">VS Bot</button>
          </div>
          <p class="ss-note">Collisions cost 25 HP, leaked enemies 10 HP, bombs 18 HP. Each cleared sector repairs +8 HP.</p>
        </div>
      </div>

      <div class="ss-overlay" data-ov="lobby" hidden>
        <div class="ss-card">
          <p class="ss-kicker">Online duel</p>
          <h3>Two ships, one sector</h3>
          <p data-lobbytext>Waiting for the host to start…</p>
          <ul class="ss-list">
            <li>Player slots (P1 left / P2 right) are <b>randomly assigned</b> every match.</li>
            <li>A coin flip decides who gets the 2.2s first-move head start.</li>
          </ul>
          <div class="ss-btnrow">
            <button class="ss-btn" type="button" data-start="duel" data-lobbystart>Start match</button>
            <button class="ss-btn ghost" type="button" data-ready>I am ready</button>
          </div>
        </div>
      </div>

      <div class="ss-overlay" data-ov="pause" hidden>
        <div class="ss-card">
          <p class="ss-kicker">Paused</p>
          <h3>Take a breath</h3>
          <p>Press <span class="ss-kbd">P</span> or any control to resume.</p>
          <div class="ss-btnrow"><button class="ss-btn" type="button" data-resume>Resume</button></div>
        </div>
      </div>

      <div class="ss-overlay" data-ov="help" hidden>
        <div class="ss-card">
          <p class="ss-kicker">How to play</p>
          <h3>Field manual</h3>
          <ul class="ss-list">
            <li><b>Desktop</b> — the ship follows your mouse; hold click to fire. Keyboard: <span class="ss-kbd">A</span>/<span class="ss-kbd">D</span> or arrows to move, <span class="ss-kbd">Space</span> to fire, <span class="ss-kbd">P</span> pause, <span class="ss-kbd">H</span> help, <span class="ss-kbd">C</span> cheats, <span class="ss-kbd">R</span> rematch.</li>
            <li><b>Mobile</b> — drag on the board, or hold the on-screen pads. FIRE auto-repeats.</li>
            <li><b>Enemies</b> — one identical drone type, one hit each, no special abilities. They drift down in a sine wave. A leak costs the nearest ship 10 HP; a collision 25 HP.</li>
            <li><b>Flagship</b> — sector ${TOTAL_LEVELS}. It strafes and drops aimed bombs (18 HP). Dodge and keep firing.</li>
            <li><b>Scoring</b> — drone 15, flagship hit 5, flagship kill 300. Each cleared sector repairs +8 HP.</li>
            <li><b>Duel rules</b> — random slots each match; coin flip gives one ship a 2.2s head start. If a ship dies the other wins; if the flagship falls, the higher score wins.</li>
            <li><b>Layouts</b> — every sector is randomly generated from a seed and mathematically checked to be solvable (spawn rate stays below your fire rate, everything is dodgeable).</li>
          </ul>
          <div class="ss-btnrow"><button class="ss-btn" type="button" data-closehelp>Got it</button></div>
        </div>
      </div>

      <div class="ss-overlay" data-ov="cheats" hidden>
        <div class="ss-card">
          <p class="ss-kicker">Cheats</p>
          <h3>Bend the rules</h3>
          <p class="ss-note">Local modes only. Using cheats disables best-score saving for the match.</p>
          <label class="ss-cheat"><span>God mode<small>Ignore all damage</small></span><input type="checkbox" data-cheat="god"></label>
          <label class="ss-cheat"><span>Rapid fire<small>Cooldown 0.27s → 0.07s</small></span><input type="checkbox" data-cheat="rapid"></label>
          <label class="ss-cheat"><span>Triple shot<small>Three-way spread</small></span><input type="checkbox" data-cheat="triple"></label>
          <label class="ss-cheat"><span>Slow motion<small>Enemies and bombs at 55% speed</small></span><input type="checkbox" data-cheat="slow"></label>
          <div class="ss-btnrow">
            <button class="ss-btn ghost" type="button" data-cheatact="heal">Full heal</button>
            <button class="ss-btn ghost" type="button" data-cheatact="skip">Skip sector</button>
            <button class="ss-btn" type="button" data-closecheats>Close</button>
          </div>
        </div>
      </div>

      <div class="ss-overlay" data-ov="over" hidden>
        <div class="ss-card">
          <p class="ss-kicker">Match result</p>
          <h3 data-overtitle>Game over</h3>
          <p data-overreason></p>
          <div class="ss-scores" data-overscores></div>
          <div class="ss-btnrow">
            <button class="ss-btn" type="button" data-again>Play again</button>
            <button class="ss-btn ghost" type="button" data-menu>Change mode</button>
          </div>
        </div>
      </div>
    </div>

    <div class="ss-touch">
      <button class="ss-pad" type="button" data-hold="left" aria-label="Move left">◀</button>
      <button class="ss-pad" type="button" data-hold="right" aria-label="Move right">▶</button>
      <button class="ss-pad fire" type="button" data-hold="fire" aria-label="Fire">FIRE</button>
    </div>
    <p class="ss-note ss-deskhint">Move: mouse or A/D · Fire: hold click or Space · P pause · H help · C cheats</p>
  </section>
  <div class="game-actions">
    <button class="ss-btn ghost" type="button" data-help>How to play</button>
    <button class="ss-btn ghost" type="button" data-cheatsbtn>Cheats</button>
    <button class="ss-btn ghost" type="button" data-pausebtn>Pause</button>
    <button class="ss-btn ghost" type="button" data-restartbtn>Restart</button>
    <button class="game-action-button" type="button" data-exit>Exit game</button>
  </div>
</div>`;

    /* ================= refs ================= */
    const $ = (sel) => root.querySelector(sel);
    const svg = $("[data-svg]");
    const stage = $("[data-stage]");
    const statusEl = $("[data-status]");
    const banner = $("[data-banner]");
    const bannerSub = $("[data-bannersub]");
    const levelEl = $("[data-level]");
    const seedChip = $("[data-seedchip]");
    const seedEl = $("[data-seed]");
    const bestChip = $("[data-bestchip]");
    const bestEl = $("[data-best]");
    const cheatFlag = $("[data-cheatflag]");
    const pchip = [$('[data-pchip="0"]'), $('[data-pchip="1"]')];
    const pname = [$('[data-pname="0"]'), $('[data-pname="1"]')];
    const pscore = [$('[data-pscore="0"]'), $('[data-pscore="1"]')];
    const php = [$('[data-php="0"]'), $('[data-php="1"]')];
    const pdot = [$('[data-pdot="0"]'), $('[data-pdot="1"]')];
    const ovStart = $('[data-ov="start"]');
    const ovLobby = $('[data-ov="lobby"]');
    const ovPause = $('[data-ov="pause"]');
    const ovHelp = $('[data-ov="help"]');
    const ovCheats = $('[data-ov="cheats"]');
    const ovOver = $('[data-ov="over"]');
    const lobbyText = $("[data-lobbytext]");
    const lobbyStart = $("[data-lobbystart]");
    const readyBtn = $("[data-ready]");
    const overTitle = $("[data-overtitle]");
    const overReason = $("[data-overreason]");
    const overScores = $("[data-overscores]");
    const againBtn = $("[data-again]");
    const menuBtn = $("[data-menu]");
    const pauseBtn = $("[data-pausebtn]");
    const restartBtn = $("[data-restartbtn]");
    const cheatsBtn = $("[data-cheatsbtn]");
    const G = {
        stars: $('[data-g="stars"]'), shots: $('[data-g="shots"]'), bombs: $('[data-g="bombs"]'),
        enemies: $('[data-g="enemies"]'), boss: $('[data-g="boss"]'), ships: $('[data-g="ships"]'), fx: $('[data-g="fx"]'),
    };
    const show = (el) => el.removeAttribute("hidden");
    const hide = (el) => el.setAttribute("hidden", "");
    const NS = "http://www.w3.org/2000/svg";
    function mk(tag, attrs) {
        const el = document.createElementNS(NS, tag);
        if (attrs) for (const k in attrs) el.setAttribute(k, attrs[k]);
        return el;
    }
    function hideAllOverlays() {
        [ovStart, ovLobby, ovPause, ovHelp, ovCheats, ovOver].forEach(hide);
    }

    /* bintang statis, aksen halus */
    for (let i = 0; i < 26; i++) {
        G.stars.appendChild(mk("circle", {
            cx: (4 + Math.random() * (W - 8)).toFixed(1),
            cy: (4 + Math.random() * (H - 8)).toFixed(1),
            r: (0.6 + Math.random() * 0.9).toFixed(2),
            fill: "#fff", opacity: (0.05 + Math.random() * 0.13).toFixed(2),
        }));
    }

    /* ================= view layer (diff state -> SVG) ================= */
    const view = { seed: -1, ships: [], enemies: new Map(), bullets: new Map(), bombs: new Map(), boss: null, bossShip: null, bossFill: null, prevAlive: [], overKey: "" };
    const fx = [];
    function setPos(el, x, y) {
        el.style.transform = "translate(" + x.toFixed(1) + "px," + y.toFixed(1) + "px)";
        el._x = x; el._y = y;
    }
    function poof(x, y, color, r0) {
        const el = mk("circle", { cx: x.toFixed(1), cy: y.toFixed(1), r: r0 || 4, fill: "none", stroke: color, "stroke-width": 2.5 });
        G.fx.appendChild(el);
        fx.push({ t: 0, el: el, r0: r0 || 4 });
    }
    function updateFx(dt) {
        for (let i = fx.length - 1; i >= 0; i--) {
            const p = fx[i];
            p.t += dt;
            const k = p.t / 0.32;
            if (k >= 1) { p.el.remove(); fx.splice(i, 1); continue; }
            p.el.setAttribute("r", (p.r0 + 15 * k).toFixed(1));
            p.el.setAttribute("opacity", (1 - k).toFixed(2));
        }
    }
    function resetView() {
        [view.enemies, view.bullets, view.bombs].forEach((m) => { m.forEach((el) => el.remove()); m.clear(); });
        if (view.boss) { view.boss.remove(); view.boss = null; view.bossShip = null; view.bossFill = null; }
        view.ships.forEach((g) => g.remove());
        view.ships = [];
        view.prevAlive = [];
        view.seed = -1;
        view.overKey = "";
        fx.forEach((p) => p.el.remove());
        fx.length = 0;
    }
    function makeShip(i) {
        const g = mk("g", { "data-ent": "1" });
        g.appendChild(mk("path", {
            d: "M0 -16 L9 -4 L18 -4 L18 8 L10 8 L7 14 L-7 14 L-10 8 L-18 8 L-18 -4 L-9 -4 Z",
            fill: SHIP_COLORS[i], stroke: SHIP_STROKES[i], "stroke-width": 1.5,
        }));
        g.appendChild(mk("circle", { cx: 0, cy: -3, r: 3.2, fill: "#0b1020", opacity: 0.55 }));
        const label = mk("text", { x: 0, y: 30, "text-anchor": "middle", "class": "ss-shiplabel" });
        g.appendChild(label);
        g._label = label;
        G.ships.appendChild(g);
        return g;
    }
    function rebuildShips(s) {
        view.ships.forEach((g) => g.remove());
        view.ships = s.players.map((p, i) => makeShip(i));
        view.prevAlive = s.players.map(() => true);
    }
    function makeEnemy() {
        const g = mk("g", { "data-ent": "1" });
        g.appendChild(mk("path", {
            d: "M-14 0 L-8 -7 L8 -7 L14 0 L8 7 L-8 7 Z",
            fill: "#fb7185", stroke: "#ffffff30", "stroke-width": 1,
        }));
        g.appendChild(mk("circle", { cx: -4, cy: 0, r: 1.8, fill: "#0b1020" }));
        g.appendChild(mk("circle", { cx: 4, cy: 0, r: 1.8, fill: "#0b1020" }));
        return g;
    }
    function makeBullet() {
        return mk("rect", { x: -1.6, y: 0, width: 3.2, height: 11, rx: 1.6, fill: "#fde68a", "data-ent": "1" });
    }
    function makeBomb() {
        return mk("circle", { r: 5, fill: "#f87171", stroke: "#fecaca", "stroke-width": 1.5, "data-ent": "1" });
    }
    function syncMap(map, arr, group, make, poofColor) {
        const seen = new Set();
        for (let i = 0; i < arr.length; i++) {
            const it = arr[i];
            seen.add(it.id);
            let el = map.get(it.id);
            if (!el) { el = make(); group.appendChild(el); map.set(it.id, el); }
            setPos(el, it.x, it.y);
        }
        map.forEach((el, id) => {
            if (!seen.has(id)) {
                if (poofColor) poof(el._x || 0, el._y || 0, poofColor);
                el.remove();
                map.delete(id);
            }
        });
    }
    function ensureBoss(s) {
        if (s.boss && !view.boss) {
            const rootG = mk("g", {});
            const ship = mk("g", { "data-ent": "1" });
            ship.appendChild(mk("path", {
                d: "M0 -26 L16 -22 L40 -8 L40 10 L20 10 L12 22 L-12 22 L-20 10 L-40 10 L-40 -8 L-16 -22 Z",
                fill: "#a78bfa", stroke: "#ede9fe", "stroke-width": 2,
            }));
            ship.appendChild(mk("circle", { cx: -12, cy: -4, r: 4, fill: "#0b1020" }));
            ship.appendChild(mk("circle", { cx: 12, cy: -4, r: 4, fill: "#0b1020" }));
            rootG.appendChild(ship);
            rootG.appendChild(mk("rect", { x: W / 2 - 80, y: 26, width: 160, height: 10, rx: 5, fill: "#ffffff18" }));
            const fill = mk("rect", { x: W / 2 - 78, y: 28, width: 156, height: 6, rx: 3, fill: "#f87171" });
            rootG.appendChild(fill);
            G.boss.appendChild(rootG);
            view.boss = rootG; view.bossShip = ship; view.bossFill = fill;
        } else if (!s.boss && view.boss) {
            poof(view.bossShip._x || W / 2, view.bossShip._y || 96, "#c4b5fd", 8);
            poof(view.bossShip._x || W / 2, view.bossShip._y || 96, "#fef08a", 5);
            view.boss.remove();
            view.boss = null; view.bossShip = null; view.bossFill = null;
        }
        if (s.boss && view.boss) {
            setPos(view.bossShip, s.boss.x, s.boss.y);
            view.bossFill.setAttribute("width", (clamp(s.boss.hp / s.boss.hpMax, 0, 1) * 156).toFixed(1));
        }
    }
    function lockedFor(s, i) {
        return s.mode === "duel" && s.level === 1 && s.firstT > 0 && s.firstMover !== i && s.phase === "play";
    }
    function setHudEmpty() {
        hide(pchip[0]); hide(pchip[1]); hide(seedChip); hide(bestChip); hide(cheatFlag);
        levelEl.textContent = "—";
    }
    function statusText(s, mi) {
        if (!s) return online ? (isHost ? "Room ready" : "Waiting for host") : "Ready";
        if (s.phase === "lobby") return "Lobby";
        if (s.phase === "over") {
            if (s.mode === "solo") return s.winner === 0 ? "You win" : "Game over";
            return s.winner === -1 ? "Draw" : s.winner === mi ? "You win" : "You lose";
        }
        if (!online && (paused || helpOpen || cheatOpen)) return "Paused";
        if (lockedFor(s, mi)) return "Wait your turn";
        return s.phase === "intro" ? "Sector " + s.level : "Playing";
    }
    function fillOver(s, mi) {
        const key = s.seed + ":" + s.winner + ":" + s.players.map((p) => p.score + "/" + p.alive).join(",");
        if (view.overKey === key) return;
        view.overKey = key;
        overTitle.textContent = statusText(s, mi);
        overReason.textContent = s.reason + (s.mode === "solo" && !cheated && s.players[0].score >= best && best > 0 ? " Best: " + best + "." : "");
        overScores.textContent = "";
        s.players.forEach((p, i) => {
            const row = document.createElement("div");
            const nm = document.createElement("span");
            nm.textContent = (i === mi ? "▸ " : "") + p.name + (p.alive ? "" : " ✕");
            const sc = document.createElement("b");
            sc.textContent = String(p.score);
            row.appendChild(nm); row.appendChild(sc);
            overScores.appendChild(row);
        });
        againBtn.textContent = online && !isHost ? "Request rematch" : "Play again";
        if (online) hide(menuBtn); else show(menuBtn);
    }

    function render(s) {
        statusEl.textContent = statusText(s, myIdx(s));
        if (!s) { setHudEmpty(); hide(banner); hide(bannerSub); return; }
        if (s.phase === "lobby") {
            setHudEmpty(); hide(banner); hide(bannerSub);
            show(ovLobby);
            lobbyText.textContent = isHost
                ? (s.guestReady ? "Opponent is ready. Launch when you are." : "Waiting for the opponent to join / ready up…")
                : "Waiting for the host to start…";
            if (isHost) { show(lobbyStart); hide(readyBtn); }
            else { hide(lobbyStart); show(readyBtn); readyBtn.disabled = Boolean(s.guestReady); readyBtn.textContent = s.guestReady ? "Ready ✓" : "I am ready"; }
            return;
        }
        hide(ovLobby);
        const mi = myIdx(s);
        if (view.seed !== s.seed) { rebuildShips(s); view.seed = s.seed; }

        for (let i = 0; i < 2; i++) {
            const p = s.players[i];
            if (!p) { hide(pchip[i]); continue; }
            show(pchip[i]);
            pname[i].textContent = (i === mi ? "▸ " : "") + p.name + (p.alive ? "" : " ✕");
            pscore[i].textContent = String(p.score);
            php[i].style.width = (clamp(p.hp / START_HP, 0, 1) * 100).toFixed(0) + "%";
            php[i].style.background = p.hp > 50 ? "#10b981" : p.hp > 25 ? "#f59e0b" : "#ef4444";
            pdot[i].style.background = SHIP_COLORS[i];
            pchip[i].style.opacity = p.alive ? "1" : ".55";
        }
        levelEl.textContent = String(s.level);
        show(seedChip);
        seedEl.textContent = "#" + s.seed.toString(36).slice(0, 5);
        if (s.mode === "solo") { show(bestChip); bestEl.textContent = String(best); } else hide(bestChip);
        if (!online && (cheated || anyCheat())) show(cheatFlag); else hide(cheatFlag);

        if (s.phase === "intro") {
            banner.textContent = "SECTOR " + s.level + (s.level === TOTAL_LEVELS ? " · FLAGSHIP" : "");
            bannerSub.textContent =
                s.level === 1 && s.mode === "duel" && s.firstMover >= 0
                    ? s.players[s.firstMover].name + " moves first"
                    : s.level === TOTAL_LEVELS
                        ? "Destroy the flagship"
                        : s.level > 1 ? "+8 hull repaired · clear all drones" : "Clear all drones";
            show(banner); show(bannerSub);
        } else { hide(banner); hide(bannerSub); }

        for (let i = 0; i < s.players.length; i++) {
            const p = s.players[i], g = view.ships[i];
            if (!g) continue;
            setPos(g, p.x, SHIP_Y);
            const locked = lockedFor(s, i);
            g.style.opacity = !p.alive ? "0.12" : locked ? "0.4" : p.invuln > 0 && Math.floor(s.time * 12) % 2 ? "0.3" : "1";
            g._label.textContent = !p.alive ? "DOWN" : locked ? "WAIT" : p.name.toUpperCase().slice(0, 10);
            if (view.prevAlive[i] && !p.alive) poof(p.x, SHIP_Y, "#f87171", 7);
            view.prevAlive[i] = p.alive;
        }

        syncMap(view.bullets, s.bullets, G.shots, makeBullet, null);
        syncMap(view.bombs, s.bombs, G.bombs, makeBomb, "#f87171");
        syncMap(view.enemies, s.enemies, G.enemies, makeEnemy, "#fda4af");
        ensureBoss(s);

        if (s.phase === "over") { fillOver(s, mi); show(ovOver); } else hide(ovOver);
    }

    /* ================= jaringan (template room API) ================= */
    function publishNow() {
        if (online && isHost && state) {
            lastPubPhase = state.phase;
            pubT = 0;
            room.publishState(state).catch(console.warn);
        }
    }
    function sanitizePatch(patch) {
        const out = {};
        if (!patch || typeof patch !== "object") return out;
        if ("left" in patch) out.left = Boolean(patch.left);
        if ("right" in patch) out.right = Boolean(patch.right);
        if ("fire" in patch) out.fire = Boolean(patch.fire);
        if ("tx" in patch) {
            const v = patch.tx;
            out.tx = typeof v === "number" && isFinite(v) ? clamp(v, 0, W) : null;
        }
        return out;
    }
    function applyAction(action, actor) {
        if (destroyed || !action || typeof action !== "object") return;
        const t = action.type;
        if (t === "input") {
            const s = state;
            if (!s || !s.players || !s.players[actor] || !inputs[actor]) return;
            Object.assign(inputs[actor], sanitizePatch(action.patch));
            return;
        }
        if (t === "hello") {
            if (!online || !isHost) return;
            const nm = String(action.name || "").slice(0, 24);
            if (!nm) return;
            lobbyGuestName = nm;
            if (state && state.players) {
                const gi = state.players.findIndex((p) => p.controller === "guest");
                if (gi >= 0) state.players[gi].name = nm;
            }
            if (state && state.phase === "lobby") publishNow();
            render(state);
            return;
        }
        if (t === "ready") {
            if (state && state.phase === "lobby") { state.guestReady = true; publishNow(); render(state); }
            return;
        }
        if (t === "start") {
            if (!authoritative) return;
            const mm = action.matchMode === "solo" && !online ? "solo" : "duel";
            newMatch(mm);
            return;
        }
        if (t === "rematch") {
            if (!authoritative) return;
            if (state && state.phase === "over") newMatch(state.mode);
            return;
        }
    }
    function submitAction(action) {
        if (online && !isHost) { room.sendAction(action).catch(console.warn); return; }
        const mi = myIdx(state);
        applyAction(action, mi >= 0 ? mi : 0);
    }

    /* ================= input lokal ================= */
    function canControl() {
        const s = state;
        if (!s || (s.phase !== "play" && s.phase !== "intro")) return false;
        if (!online && (paused || helpOpen || cheatOpen)) return false;
        const mi = myIdx(s);
        return mi >= 0 && s.players[mi] && s.players[mi].alive;
    }
    function pushInput(patch, force) {
        if (destroyed) return;
        if (!force && !canControl()) return;
        const s = state;
        if (!s || !s.players) return;
        if (online && !isHost) {
            const keys = Object.keys(patch);
            const onlyTx = keys.length === 1 && keys[0] === "tx";
            const now = performance.now();
            if (onlyTx && now - lastTxSend < 60) return; // throttle gerak mouse guest
            lastTxSend = now;
            room.sendAction({ type: "input", patch: patch }).catch(console.warn);
            return;
        }
        const mi = myIdx(s);
        if (mi >= 0 && inputs[mi]) Object.assign(inputs[mi], sanitizePatch(patch));
    }

    function togglePause() {
        if (online || !state || state.phase === "over" || state.phase === "lobby") return;
        paused = !paused;
        if (paused) show(ovPause); else hide(ovPause);
        render(state);
    }
    function resumeGame() { paused = false; hide(ovPause); render(state); }
    function toggleHelp(force) {
        helpOpen = typeof force === "boolean" ? force : !helpOpen;
        if (helpOpen) show(ovHelp); else hide(ovHelp);
        render(state);
    }
    function toggleCheats(force) {
        if (online) return;
        cheatOpen = typeof force === "boolean" ? force : !cheatOpen;
        if (cheatOpen) show(ovCheats); else hide(ovCheats);
        render(state);
    }
    function backToMenu() {
        state = null;
        paused = false; helpOpen = false; cheatOpen = false;
        resetView();
        hideAllOverlays();
        show(ovStart);
        render(null);
    }
    function doCheatAct(act) {
        if (online || !state || state.phase === "over" || state.phase === "lobby") return;
        const mi = myIdx(state);
        if (mi < 0) return;
        cheated = true;
        if (act === "heal") {
            const p = state.players[mi];
            if (p.alive) p.hp = START_HP;
        } else if (act === "skip") {
            if (state.level < TOTAL_LEVELS) nextLevel(state);
            else endMatch(state, state.mode === "solo" ? 0 : mi, "Flagship skipped (cheat).");
        }
        render(state);
    }

    /* ================= event wiring ================= */
    function onClick(e) {
        const t = e.target;
        if (!t || !t.closest) return;
        if (t.closest("[data-exit]")) { onExit(); return; }
        const st = t.closest("[data-start]");
        if (st) { submitAction({ type: "start", matchMode: st.getAttribute("data-start") }); return; }
        if (t.closest("[data-ready]")) {
            if (online && !isHost) {
                room.sendAction({ type: "ready" }).catch(console.warn);
                readyBtn.disabled = true;
                readyBtn.textContent = "Ready ✓";
            }
            return;
        }
        if (t.closest("[data-resume]")) { resumeGame(); return; }
        if (t.closest("[data-help]")) { toggleHelp(); return; }
        if (t.closest("[data-closehelp]")) { toggleHelp(false); return; }
        if (t.closest("[data-cheatsbtn]")) { toggleCheats(); return; }
        if (t.closest("[data-closecheats]")) { toggleCheats(false); return; }
        if (t.closest("[data-pausebtn]")) { togglePause(); return; }
        if (t.closest("[data-restartbtn]")) {
            if (state && state.phase !== "lobby") submitAction({ type: "start", matchMode: state.mode });
            else if (!online) backToMenu();
            return;
        }
        if (t.closest("[data-again]")) { submitAction({ type: "rematch" }); return; }
        if (t.closest("[data-menu]")) { backToMenu(); return; }
        const ca = t.closest("[data-cheatact]");
        if (ca) { doCheatAct(ca.getAttribute("data-cheatact")); return; }
    }
    function onChange(e) {
        const el = e.target;
        if (!el || !el.getAttribute) return;
        const key = el.getAttribute("data-cheat");
        if (!key || online) return;
        cheats[key] = Boolean(el.checked);
        if (cheats[key]) cheated = true;
        render(state);
    }
    function onKeyDown(e) {
        if (destroyed) return;
        const c = e.code;
        if (c === "KeyH") { e.preventDefault(); toggleHelp(); return; }
        if (c === "KeyC" && !online) { e.preventDefault(); toggleCheats(); return; }
        if (c === "KeyP" && !online) { e.preventDefault(); togglePause(); return; }
        if (c === "Escape") {
            if (helpOpen) toggleHelp(false);
            else if (cheatOpen) toggleCheats(false);
            else if (paused) resumeGame();
            return;
        }
        if (c === "KeyR" && state && state.phase === "over") { submitAction({ type: "rematch" }); return; }
        const isCtrl = c === "ArrowLeft" || c === "ArrowRight" || c === "Space" || c === "KeyA" || c === "KeyD";
        if (!isCtrl) return;
        if (state && state.phase !== "lobby") e.preventDefault();
        if (paused) resumeGame();
        if (!canControl()) return;
        if (c === "ArrowLeft" || c === "KeyA") pushInput({ left: true, tx: null });
        else if (c === "ArrowRight" || c === "KeyD") pushInput({ right: true, tx: null });
        else if (c === "Space") pushInput({ fire: true });
    }
    function onKeyUp(e) {
        if (destroyed) return;
        const c = e.code;
        if (c === "ArrowLeft" || c === "KeyA") pushInput({ left: false }, true);
        else if (c === "ArrowRight" || c === "KeyD") pushInput({ right: false }, true);
        else if (c === "Space") pushInput({ fire: false }, true);
    }
    function onVis() {
        if (document.hidden && !online && state && (state.phase === "play" || state.phase === "intro") && !paused) togglePause();
    }
    function svgX(e) {
        const r = svg.getBoundingClientRect();
        if (!(r.width > 0)) return null;
        return clamp(((e.clientX - r.left) / r.width) * W, 0, W);
    }
    function onSvgMove(e) {
        if (!canControl()) return;
        if (authoritative) {
            const inp = inputs[myIdx(state)];
            if (inp && (inp.left || inp.right)) return; // keyboard sedang aktif
        }
        const x = svgX(e);
        if (x != null) pushInput({ tx: x });
    }
    function onSvgDown(e) {
        if (!canControl()) return;
        e.preventDefault();
        try { svg.setPointerCapture(e.pointerId); } catch (err) { }
        const x = svgX(e);
        const patch = { fire: true };
        if (x != null) patch.tx = x;
        pushInput(patch);
    }
    function onSvgUp() { pushInput({ fire: false }, true); }

    root.addEventListener("click", onClick);
    root.addEventListener("change", onChange);
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("keyup", onKeyUp);
    document.addEventListener("visibilitychange", onVis);
    svg.addEventListener("pointermove", onSvgMove);
    svg.addEventListener("pointerdown", onSvgDown);
    svg.addEventListener("pointerup", onSvgUp);
    svg.addEventListener("pointercancel", onSvgUp);

    const padHandlers = [];
    root.querySelectorAll("[data-hold]").forEach((b) => {
        const k = b.getAttribute("data-hold");
        const down = (e) => {
            e.preventDefault();
            if (paused) resumeGame();
            try { b.setPointerCapture(e.pointerId); } catch (err) { }
            const patch = {};
            patch[k] = true;
            if (k !== "fire") patch.tx = null;
            pushInput(patch);
        };
        const up = () => {
            const patch = {};
            patch[k] = false;
            pushInput(patch, true);
        };
        b.addEventListener("pointerdown", down);
        b.addEventListener("pointerup", up);
        b.addEventListener("pointercancel", up);
        padHandlers.push([b, down, up]);
    });

    /* ================= mode & loop ================= */
    if (online) {
        hide(cheatsBtn); hide(pauseBtn);
        if (!isHost) {
            stage.classList.add("ss-lerp"); // guest: interpolasi halus antar snapshot 10 Hz
            hide(restartBtn);
        }
    }

    const offs = [];
    function sub(fn) {
        try { const u = fn(); if (typeof u === "function") offs.push(u); } catch (err) { console.warn(err); }
    }

    if (online) {
        sub(() => room.onRoom((nextRoom) => { roomData = nextRoom; }));
        if (isHost) {
            state = { phase: "lobby", guestReady: false };
            publishNow();
            render(state);
            sub(() => room.onAction((action) => {
                // actor = index pemain guest berdasarkan slot ACAK yang aktif
                let gi = 1;
                if (state && state.players) {
                    const idx = state.players.findIndex((p) => p.controller === "guest");
                    if (idx >= 0) gi = idx;
                }
                applyAction(action, gi);
            }));
        } else {
            sub(() => room.onState((nextState) => {
                if (destroyed) return;
                state = nextState;
                render(state);
            }));
            room.sendAction({ type: "hello", name: playerName }).catch(console.warn);
            render(null);
        }
    } else {
        show(ovStart);
        render(null);
    }

    function tick(t) {
        if (destroyed) return;
        raf = requestAnimationFrame(tick);
        if (!lastT) lastT = t;
        let dt = (t - lastT) / 1000;
        lastT = t;
        if (!(dt > 0)) dt = 0;
        if (dt > 0.05) dt = 0.05;
        const localBlocked = !online && (paused || helpOpen || cheatOpen);
        if (authoritative && state && !localBlocked) simulate(dt);
        if (state) render(state);
        updateFx(dt);
        if (online && isHost && state) {
            pubT += dt;
            if (pubT >= PUB_INTERVAL || state.phase !== lastPubPhase) publishNow();
        }
    }
    raf = requestAnimationFrame(tick);

    /* ================= cleanup ================= */
    return {
        destroy() {
            destroyed = true;
            if (raf) cancelAnimationFrame(raf);
            raf = 0;
            root.removeEventListener("click", onClick);
            root.removeEventListener("change", onChange);
            document.removeEventListener("keydown", onKeyDown);
            document.removeEventListener("keyup", onKeyUp);
            document.removeEventListener("visibilitychange", onVis);
            svg.removeEventListener("pointermove", onSvgMove);
            svg.removeEventListener("pointerdown", onSvgDown);
            svg.removeEventListener("pointerup", onSvgUp);
            svg.removeEventListener("pointercancel", onSvgUp);
            padHandlers.forEach((h) => {
                h[0].removeEventListener("pointerdown", h[1]);
                h[0].removeEventListener("pointerup", h[2]);
                h[0].removeEventListener("pointercancel", h[2]);
            });
            offs.forEach((u) => { try { u(); } catch (err) { } });
        },
    };
}