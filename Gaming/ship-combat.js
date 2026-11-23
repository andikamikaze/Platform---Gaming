/* ==== GAME: ship-combat.js ==== */
/*
  Ship Combat - arcade naval warfare. Template: export META + mount().
  - Solo vs bot : endless raider waves from a random, always-solvable generator.
  - Online duel : host-authoritative sim; ship sides + first salvo rolled at random.
  - 2D side-scrolling sea with a set-sail-from-port intro animation.
  - Minimalist UI, how-to-play overlay, cheats overlay (solo only).
  - Desktop: keyboard + mouse. Mobile: multi-touch virtual buttons.
  After editing META run: node tools/build-games-manifest.mjs
*/

export const META = {
    id: "ship-combat",
    name: "Ship Combat",
    category: "arcade",
    catLabel: "Arcade",
    desc: "Pick a ship, set sail from port and sink endless raider waves. Solo vs bot or online duel.",
    art: '<svg viewBox="0 0 48 48" width="54" height="54" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 29l6 9h23l6-9z"/><path d="M13 29v-6h9v6"/><path d="M27 29v-9h7v9"/><path d="M30 20l9-6"/><path d="M10 44l4-3 4 3 4-3 4 3 4-3 4 3" opacity=".55"/><path d="M40 29l4 4" opacity=".7"/></svg>',
    bg: ["#0e7490", "#164e63"],
    bestKey: "shipCombatBest",
};

/* ================= pure logic (no DOM) ================= */
const W = 640, H = 400, WATER = 250, GRAV = 240;
const SEA_W = 1600;      /* side-scrolling world width (solo) */
const SAIL_DUR = 2.2;    /* set-sail animation seconds */
const SHELL_V = 330, FOE_SHELL_V = 320, TORP_V = 260;

const SHIPS = {
    frigate: { label: "Frigate", hp: 110, armor: 3, spd: 120, gun: 16, grate: 1.6, special: "torpedo", sDmg: 32, sCd: 3.0, col: "#67e8f9", blurb: "Balanced hull - torpedo special" },
    destroyer: { label: "Destroyer", hp: 140, armor: 5, spd: 100, gun: 20, grate: 1.9, special: "depth", sDmg: 26, sCd: 3.2, col: "#fbbf24", blurb: "Heavy guns - depth-charge salvo" },
    submarine: { label: "Submarine", hp: 90, armor: 2, spd: 80, gun: 30, grate: 2.4, special: "dive", sDmg: 0, sCd: 6.0, col: "#a5b4fc", blurb: "Torpedo primary - dive special" },
    lsd: { label: "Dock Landing Ship", hp: 180, armor: 6, spd: 70, gun: 14, grate: 2.2, special: "craft", sDmg: 24, sCd: 6.0, col: "#f9a8d4", blurb: "Tanky hull - explosive landing craft" },
    carrier: { label: "Aircraft Carrier", hp: 200, armor: 7, spd: 60, gun: 10, grate: 2.6, special: "strike", sDmg: 42, sCd: 8.0, col: "#86efac", blurb: "Flagship hull - air strike" },
};
/* one single enemy archetype - difficulty scales by wave, never by type */
const ENEMY = { label: "Raider", armor: 2, spd: 95, col: "#fb923c", band: [150, 330] };

const CHEATS = [
    { id: "god", label: "God mode - immune to damage" },
    { id: "rapid", label: "Rapid fire - 4x gun speed" },
    { id: "instant", label: "Instant special - no cooldown" },
    { id: "power", label: "Overcharged - 3x damage" },
    { id: "slow", label: "Slow raiders - half speed, lazy guns" },
];

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
function num(v, d) { return typeof v === "number" && isFinite(v) ? v : d; }
function aimClamp(a) { return clamp(num(a, 0.5), 0.12, 1.25); }
function easeOut(t) { const k = clamp(num(t, 0), 0, 1); return 1 - Math.pow(1 - k, 3); }
function effDamage(dmg, armor) {
    const d = num(dmg, 0);
    if (d <= 0) return 0;
    return Math.max(1, Math.round((d * 10) / (10 + Math.max(0, num(armor, 0)))));
}
/* shells and bombs miss a dived submarine; torpedoes and depth blasts do not */
function canHit(weapon, dived) {
    if (weapon === "shell" || weapon === "bomb") return !dived;
    if (weapon === "torpedo" || weapon === "depth") return true;
    return false;
}
function bandDir(dist) {
    const d = Math.max(0, num(dist, ENEMY.band[0]));
    if (d < ENEMY.band[0]) return 1;
    if (d > ENEMY.band[1]) return -1;
    return 0;
}
function shellStep(s, dt) {
    if (!s) return s;
    const d = num(dt, 0);
    if (d > 0) { s.x += s.vx * d; s.vy += GRAV * d; s.y += s.vy * d; }
    return s;
}
function torpedoStep(tp, dt) {
    if (!tp) return tp;
    const d = num(dt, 0);
    if (d > 0) { tp.x += tp.vx * d; tp.y = WATER + 16; tp.arm = num(tp.arm, 0) + d; }
    return tp;
}
function turretGeom(x, a, flip) {
    const dir = flip ? -1 : 1;
    return { bx: x + dir * Math.cos(a) * 20, by: WATER - 18 - Math.sin(a) * 20 };
}
function hullCy(p) { return p.ship === "submarine" ? (p.dived ? WATER + 16 : WATER + 4) : WATER - 4; }
function deepCy(p) { return p.ship === "submarine" ? (p.dived ? WATER + 16 : WATER + 8) : WATER + 2; }
function rollFirst(r) { return r() < 0.5 ? 0 : 1; }
function rollSides(r) { return r() < 0.5 ? [0, 1] : [1, 0]; }

/* Random wave generator with a solvability budget:
   estimated time-to-clear must stay well under estimated time-to-sink. */
function generateWave(wave, seed, shipKey) {
    const r = rng(seed >>> 0);
    const spec = SHIPS[shipKey] || SHIPS.frigate;
    const wv = Math.max(1, Math.round(num(wave, 1)));
    let count = clamp(1 + Math.floor((wv + 1) / 2) + (r() < 0.3 ? 1 : 0), 1, 5);
    let hp = Math.round(52 + wv * 9 + r() * 14);
    let gun = Math.round(9 + wv * 1.15);
    let rate = Math.max(1.2, 2.35 - wv * 0.06);
    const pDps = (spec.gun / spec.grate + (spec.sDmg > 0 ? spec.sDmg / spec.sCd : 0)) * (10 / (10 + ENEMY.armor)) * 0.7;
    function budget() {
        const shooters = Math.min(count, 2); /* staggered wake keeps pressure bounded */
        const tKill = (hp * count) / Math.max(1, pDps);
        const eDps = shooters * (gun / rate) * (10 / (10 + spec.armor)) * 0.5;
        const tDie = spec.hp / Math.max(0.5, eDps);
        return { ok: tKill < tDie * 0.8, margin: tDie / Math.max(0.1, tKill) };
    }
    let guard = 0;
    while (!budget().ok && guard++ < 40) {
        hp = Math.max(30, Math.round(hp * 0.9));
        gun = Math.max(5, Math.round(gun * 0.92));
        rate = Math.min(3, rate * 1.05);
        if (guard % 4 === 0 && count > 1) count--;
    }
    const foes = [];
    let x = 640 + r() * 60;
    for (let i = 0; i < count; i++) {
        foes.push({ x: clamp(x, 600, SEA_W - 60), hp, maxHp: hp, aim: 0.45 + r() * 0.2, cd: 1.2 + r() * 1.4, torpCd: 5 + r() * 4, wake: i * 1.7 });
        x += 90 + r() * 70;
    }
    const b = budget();
    return { foes, hp, gun, rate, count, solvable: b.ok, margin: b.margin };
}

function fullPlayer(ship, name, side, x) {
    const s = SHIPS[ship] || SHIPS.frigate;
    return { ship, name, side, x, hp: s.hp, maxHp: s.hp, aim: 0.5, cd: 0, sCd: 0, dived: false, diveT: 0, diveCd: 0, wake: 0, sailFrom: x, sailTo: x };
}
function blankArrays(st) {
    st.foes = []; st.shells = []; st.torps = []; st.charges = []; st.crafts = []; st.planes = []; st.effects = [];
}
function newSoloState(name) {
    const st = {
        mode: "solo", phase: "lobby", wave: 0, score: 0, best: 0, newBest: false,
        nid: 1, camX: 0, sailT: 0, wakeAcc: 0, toast: null, first: null, winner: null,
        reason: "", lastBonus: 0, waveStats: { gun: 10, rate: 2.2 },
        players: [{ ship: "frigate", name: name || "Player" }],
        cheats: { god: false, rapid: false, instant: false, power: false, slow: false },
        cheatUsed: false,
    };
    blankArrays(st);
    return st;
}
function newDuelState(hostName) {
    const st = {
        mode: "duel", phase: "lobby", wave: 0, score: 0, nid: 1, camX: 0, sailT: 0, wakeAcc: 0,
        toast: null, first: null, sides: null, winner: null, reason: "",
        waveStats: { gun: 10, rate: 2.2 },
        players: [{ ship: null, name: hostName || "Host" }, { ship: null, name: "Opponent" }],
    };
    blankArrays(st);
    return st;
}
function fx(st, x, y, kind, color) {
    if (st.effects.length > 60) st.effects.shift();
    st.effects.push({ x, y, t: 0, kind, color });
}
function beginWave(st, n, seed, r) {
    const prev = st.players[0] || {};
    const ship = prev.ship || "frigate";
    const gen = generateWave(n, seed, ship);
    const oldWave = st.wave;
    blankArrays(st);
    st.wave = n; st.waveStats = { gun: gen.gun, rate: gen.rate };
    st.foes = gen.foes.map(function (f) { return Object.assign({ id: st.nid++ }, f); });
    const p = fullPlayer(ship, prev.name || "Player", 0, 40);
    if (n === oldWave + 1 && typeof prev.hp === "number" && prev.hp > 0) p.hp = Math.min(p.maxHp, Math.round(prev.hp));
    p.sailFrom = 40; p.sailTo = 260;
    st.players = [p];
    st.phase = "sailing"; st.sailT = SAIL_DUR; st.camX = 0; st.wakeAcc = 0;
    st.first = rollFirst(r); st.winner = null; st.reason = ""; st.newBest = false;
    st.toast = { text: "WAVE " + n + " - SET SAIL", t: 0, dur: 2.0 };
}
function beginDuel(st, r) {
    st.sides = rollSides(r); st.first = rollFirst(r);
    st.players = st.players.map(function (p, i) {
        const side = st.sides[i];
        const fp = fullPlayer(p.ship, p.name, side, side === 0 ? -50 : 690);
        fp.sailTo = side === 0 ? 120 : 520;
        return fp;
    });
    blankArrays(st);
    st.phase = "sailing"; st.sailT = SAIL_DUR; st.camX = 0; st.wakeAcc = 0;
    st.winner = null; st.reason = "";
    st.toast = { text: "Sides shuffled - set sail!", t: 0, dur: 2.0 };
}
function startBattle(st) {
    st.phase = "battle";
    if (st.mode === "solo") {
        const p = st.players[0];
        if (st.first === 0) {
            p.cd = 0;
            for (const f of st.foes) f.cd += 1.2;
            st.toast = { text: "Coin flip: you fire first!", t: 0, dur: 1.7 };
        } else {
            p.cd = 1.2;
            st.toast = { text: "Coin flip: raiders fire first!", t: 0, dur: 1.7 };
        }
    } else {
        st.players[st.first].cd = 0;
        st.players[1 - st.first].cd = 1.2;
        st.toast = { text: st.players[st.first].name + " fires first!", t: 0, dur: 1.8 };
    }
}
function nearestFoe(st, x) {
    let best = null, bd = Infinity;
    for (const f of st.foes) {
        if (f.dead) continue;
        const d = Math.abs(f.x - x);
        if (d < bd) { bd = d; best = f; }
    }
    return best;
}
function hurtFoe(st, f, dmg, weapon) {
    if (f.dead || !canHit(weapon, false)) return false;
    f.hp = Math.max(0, f.hp - effDamage(dmg, ENEMY.armor));
    fx(st, f.x, WATER - 8, "boom", "#f97316");
    if (f.hp <= 0) {
        f.dead = true;
        st.score += 20 + st.wave * 3;
        fx(st, f.x, WATER + 2, "boom", ENEMY.col);
        fx(st, f.x + 14, WATER + 6, "splash", "#e2e8f0");
    }
    return true;
}
function hurtPlayer(st, i, dmg, weapon) {
    const p = st.players[i];
    if (!p || p.hp <= 0 || !canHit(weapon, p.dived)) return false;
    if (st.mode === "solo" && i === 0 && st.cheats.god) { fx(st, p.x, WATER - 10, "muzzle", "#22d3ee"); return false; }
    const spec = SHIPS[p.ship];
    p.hp = Math.max(0, p.hp - effDamage(dmg, spec.armor));
    fx(st, p.x, WATER - 8, "boom", "#ef4444");
    fx(st, 0, 0, "flash", "#ef4444");
    return true;
}
function blast(st, x, y, dmg, who, weapon) {
    const R = 58;
    fx(st, x, Math.min(y, WATER + 22), "boom", "#e2e8f0");
    if (st.mode === "solo") {
        if (who === 0) {
            for (const f of st.foes) if (!f.dead && Math.hypot(f.x - x, (WATER + 2) - y) < R) hurtFoe(st, f, dmg, weapon);
        } else {
            const p = st.players[0];
            if (p && Math.hypot(p.x - x, deepCy(p) - y) < R) hurtPlayer(st, 0, dmg, weapon);
        }
    } else {
        for (let j = 0; j < 2; j++) {
            if (j === who) continue;
            const p = st.players[j];
            if (p && Math.hypot(p.x - x, deepCy(p) - y) < R) hurtPlayer(st, j, dmg, weapon);
        }
    }
}
function firePrimary(st, i) {
    const p = st.players[i];
    if (!p || p.hp <= 0) return;
    const spec = SHIPS[p.ship];
    const flip = p.side === 1, dir = flip ? -1 : 1;
    const pow = st.mode === "solo" && st.cheats.power ? 3 : 1;
    if (p.ship === "submarine") {
        st.torps.push({ id: st.nid++, x: p.x + dir * 30, vx: dir * TORP_V, arm: 0, who: i, dmg: spec.gun * pow });
    } else {
        const b = turretGeom(p.x, p.aim, flip);
        st.shells.push({ id: st.nid++, x: b.bx, y: b.by, vx: dir * Math.cos(p.aim) * SHELL_V, vy: -Math.sin(p.aim) * SHELL_V, who: i, dmg: spec.gun * pow });
        fx(st, b.bx, b.by, "muzzle", "#fde047");
    }
    p.cd = spec.grate * (st.mode === "solo" && st.cheats.rapid ? 0.25 : 1);
}
function doSpecial(st, i) {
    if (st.phase !== "battle") return false;
    const p = st.players[i];
    if (!p || p.hp <= 0) return false;
    const spec = SHIPS[p.ship];
    const ch = st.mode === "solo" ? st.cheats : null;
    if (p.sCd > 0 && !(ch && ch.instant)) return false;
    if (p.dived && spec.special !== "dive") return false;
    const flip = p.side === 1, dir = flip ? -1 : 1;
    const pow = ch && ch.power ? 3 : 1;
    if (spec.special === "torpedo") {
        st.torps.push({ id: st.nid++, x: p.x + dir * 34, vx: dir * 250, arm: 0, who: i, dmg: spec.sDmg * pow });
        p.sCd = spec.sCd;
    } else if (spec.special === "depth") {
        st.charges.push({ id: st.nid++, x: p.x + dir * 26, y: WATER - 10, vx: dir * 150, vy: -40, fuse: 1.3, who: i, dmg: spec.sDmg * pow });
        st.charges.push({ id: st.nid++, x: p.x + dir * 26, y: WATER - 10, vx: dir * 195, vy: -60, fuse: 1.55, who: i, dmg: spec.sDmg * pow });
        p.sCd = spec.sCd;
    } else if (spec.special === "dive") {
        if (p.dived || p.diveCd > 0) return false;
        p.dived = true; p.diveT = 4;
        fx(st, p.x, WATER, "splash", "#38bdf8");
    } else if (spec.special === "craft") {
        st.crafts.push({ id: st.nid++, x: p.x + dir * 30, dir, who: i, dmg: spec.sDmg * pow });
        p.sCd = spec.sCd;
    } else if (spec.special === "strike") {
        let tx = p.x + dir * 420;
        if (st.mode === "solo") { const t = nearestFoe(st, p.x); if (t) tx = t.x; }
        else { const t = st.players[1 - i]; if (t) tx = t.x; }
        st.planes.push({ id: st.nid++, x: p.x, y: 150, vx: dir * 200, who: i, dmg: spec.sDmg * pow, dropped: false, tx });
        p.sCd = spec.sCd;
    }
    if (ch && ch.instant) p.sCd = 0;
    return true;
}
function foeShell(st, f, dmg, r) {
    const b = turretGeom(f.x, f.aim, true);
    const a = Math.PI - f.aim + (r() - 0.5) * 0.08;
    st.shells.push({ id: st.nid++, x: b.bx, y: b.by, vx: Math.cos(a) * FOE_SHELL_V, vy: -Math.sin(a) * FOE_SHELL_V, who: "e", dmg });
    fx(st, b.bx, b.by, "muzzle", "#fb923c");
}
function stepFoes(st, dt, r, ch) {
    const p = st.players[0];
    if (!p) return;
    const ws = st.waveStats;
    const slow = ch && ch.slow;
    const spd = ENEMY.spd * (slow ? 0.5 : 1);
    const rate = ws.rate * (slow ? 1.8 : 1);
    for (const f of st.foes) {
        if (f.dead) continue;
        f.wake = Math.max(0, (f.wake || 0) - dt);
        const dist = Math.abs(f.x - p.x);
        const dir = bandDir(dist);
        if (dir !== 0) f.x = clamp(f.x + dir * spd * dt, Math.max(p.x + 70, 380), SEA_W - 40);
        f.cd -= dt;
        if (f.wake <= 0 && f.cd <= 0 && dist < 560 && !p.dived) {
            f.cd = rate;
            const des = clamp(0.22 + (dist / 640) * 0.55, 0.2, 0.9);
            f.aim += clamp(des - f.aim, -dt, dt);
            foeShell(st, f, ws.gun, r);
        }
        if (st.wave >= 3) {
            f.torpCd -= dt;
            if (f.wake <= 0 && f.torpCd <= 0 && dist < 520) {
                f.torpCd = 6 + r() * 3;
                st.torps.push({ id: st.nid++, x: f.x - 30, vx: -240, arm: 0, who: "e", dmg: Math.round(ws.gun * 1.3) });
            }
        }
    }
}
function stepShells(st, dt) {
    for (const sh of st.shells) {
        if (sh.dead) continue;
        shellStep(sh, dt);
        if (sh.y > WATER + 2) {
            sh.dead = true;
            if (sh.bomb) blast(st, sh.x, WATER + 4, sh.dmg, sh.who, "bomb");
            else fx(st, sh.x, WATER + 2, "splash", "#7dd3fc");
            continue;
        }
        if (sh.x < -40 || sh.x > SEA_W + 40) { sh.dead = true; continue; }
        if (sh.who === "e") {
            const p = st.players[0];
            if (p && p.hp > 0 && canHit("shell", p.dived) && Math.hypot(p.x - sh.x, hullCy(p) - sh.y) < 34) { sh.dead = true; hurtPlayer(st, 0, sh.dmg, "shell"); }
        } else if (st.mode === "solo") {
            for (const f of st.foes) {
                if (f.dead) continue;
                if (Math.hypot(f.x - sh.x, (WATER - 4) - sh.y) < 34) { sh.dead = true; hurtFoe(st, f, sh.dmg, "shell"); break; }
            }
        } else {
            const j = 1 - sh.who, p = st.players[j];
            if (p && p.hp > 0 && canHit("shell", p.dived) && Math.hypot(p.x - sh.x, hullCy(p) - sh.y) < 34) { sh.dead = true; hurtPlayer(st, j, sh.dmg, "shell"); }
        }
    }
}
function stepTorps(st, dt) {
    for (const tp of st.torps) {
        if (tp.dead) continue;
        torpedoStep(tp, dt);
        if (tp.x < -40 || tp.x > SEA_W + 40) { tp.dead = true; continue; }
        if (tp.arm < 0.12) continue;
        if (tp.who === "e") {
            const p = st.players[0];
            if (p && p.hp > 0 && Math.abs(p.x - tp.x) < 30 && Math.abs(deepCy(p) - (WATER + 16)) < 26) { tp.dead = true; hurtPlayer(st, 0, tp.dmg, "torpedo"); }
        } else if (st.mode === "solo") {
            for (const f of st.foes) {
                if (f.dead) continue;
                if (Math.abs(f.x - tp.x) < 30 && Math.abs((WATER + 2) - (WATER + 16)) < 26) { tp.dead = true; hurtFoe(st, f, tp.dmg, "torpedo"); break; }
            }
        } else {
            const j = 1 - tp.who, p = st.players[j];
            if (p && p.hp > 0 && Math.abs(p.x - tp.x) < 30 && Math.abs(deepCy(p) - (WATER + 16)) < 26) { tp.dead = true; hurtPlayer(st, j, tp.dmg, "torpedo"); }
        }
    }
}
function stepCharges(st, dt) {
    for (const c of st.charges) {
        if (c.dead) continue;
        if (c.y < WATER + 6) c.vy += GRAV * 0.6 * dt;
        else { c.vy = 34; c.vx *= Math.max(0, 1 - 3 * dt); }
        c.x += c.vx * dt; c.y += c.vy * dt; c.fuse -= dt;
        if (c.fuse <= 0) c.dead = true;
        else if (st.mode === "solo" && c.who === 0) {
            for (const f of st.foes) {
                if (!f.dead && Math.hypot(f.x - c.x, (WATER + 2) - c.y) < 40) { c.dead = true; break; }
            }
        } else if (st.mode === "duel") {
            const p = st.players[1 - c.who];
            if (p && p.hp > 0 && Math.hypot(p.x - c.x, deepCy(p) - c.y) < 40) c.dead = true;
        }
        if (c.dead) { fx(st, c.x, Math.min(c.y, WATER + 22), "splash", "#e2e8f0"); blast(st, c.x, c.y, c.dmg, c.who, "depth"); }
    }
}
function stepCrafts(st, dt) {
    for (const cr of st.crafts) {
        if (cr.dead) continue;
        const tgt = st.mode === "solo" ? nearestFoe(st, cr.x) : st.players[1 - cr.who];
        if (tgt && typeof tgt.x === "number") cr.dir = Math.sign(tgt.x - cr.x) || cr.dir;
        cr.x += cr.dir * 95 * dt;
        if (tgt && tgt.hp > 0 && Math.abs(tgt.x - cr.x) < 34) {
            cr.dead = true;
            fx(st, cr.x, WATER + 2, "boom", "#f9a8d4");
            if (st.mode === "solo") hurtFoe(st, tgt, cr.dmg, "shell");
            else hurtPlayer(st, 1 - cr.who, cr.dmg, "shell");
        }
        if (cr.x < -40 || cr.x > SEA_W + 40) cr.dead = true;
    }
}
function stepPlanes(st, dt) {
    for (const pl of st.planes) {
        if (pl.dead) continue;
        pl.x += pl.vx * dt;
        let tx = pl.tx;
        if (st.mode === "duel") { const t = st.players[1 - pl.who]; if (t && typeof t.x === "number") tx = t.x; }
        if (!pl.dropped && Math.abs(pl.x - tx) < 26) {
            pl.dropped = true;
            st.shells.push({ id: st.nid++, x: pl.x, y: pl.y + 10, vx: pl.vx * 0.25, vy: 40, who: pl.who, dmg: pl.dmg, bomb: true });
        }
        if (pl.x < -60 || pl.x > SEA_W + 60) pl.dead = true;
    }
}
function moveBounds(st, p) {
    if (st.mode === "solo") return [40, SEA_W - 40];
    return p.side === 0 ? [40, 300] : [340, 600];
}
function stepBattle(st, inputs, dt, r) {
    const solo = st.mode === "solo";
    const ch = solo ? st.cheats : null;
    for (let i = 0; i < st.players.length; i++) {
        const p = st.players[i];
        if (!p || p.hp <= 0) continue;
        const spec = SHIPS[p.ship];
        const inp = inputs[i] || {};
        const dir = (inp.r ? 1 : 0) - (inp.l ? 1 : 0);
        const b = moveBounds(st, p);
        p.x = clamp(p.x + dir * spec.spd * (p.dived ? 0.6 : 1) * dt, b[0], b[1]);
        if (!p.dived) {
            if (inp.u) p.aim = aimClamp(p.aim + 1.1 * dt);
            if (inp.d) p.aim = aimClamp(p.aim - 1.1 * dt);
        }
        if (p.dived) {
            p.diveT -= dt;
            if (p.diveT <= 0) { p.dived = false; p.diveCd = ch && ch.instant ? 0 : spec.sCd; fx(st, p.x, WATER, "splash", "#e2e8f0"); }
        } else if (p.diveCd > 0) p.diveCd = Math.max(0, p.diveCd - dt);
        p.sCd = Math.max(0, p.sCd - dt);
        p.cd -= dt;
        if (inp.f && p.cd <= 0 && !(p.dived && p.ship !== "submarine")) firePrimary(st, i);
        if (dir !== 0) {
            p.wake = (p.wake || 0) + dt;
            if (p.wake > 0.18) { p.wake = 0; fx(st, p.x - (p.side === 0 ? 26 : -26), WATER + 2, "splash", "#38bdf8"); }
        }
    }
    if (solo) stepFoes(st, dt, r, ch);
    stepShells(st, dt);
    stepTorps(st, dt);
    stepCharges(st, dt);
    stepCrafts(st, dt);
    stepPlanes(st, dt);
    st.shells = st.shells.filter(function (x) { return !x.dead; });
    st.torps = st.torps.filter(function (x) { return !x.dead; });
    st.charges = st.charges.filter(function (x) { return !x.dead; });
    st.crafts = st.crafts.filter(function (x) { return !x.dead; });
    st.planes = st.planes.filter(function (x) { return !x.dead; });
    st.foes = st.foes.filter(function (f) { return !f.dead; });
    if (solo) {
        const p = st.players[0];
        if (p.hp <= 0) {
            st.phase = "over"; st.winner = null;
            st.reason = "Your " + SHIPS[p.ship].label + " sank on wave " + st.wave + ".";
            fx(st, p.x, WATER, "boom", "#f97316");
        } else if (st.foes.length === 0) {
            st.phase = "cleared";
            st.lastBonus = 100 + st.wave * 25;
            st.score += st.lastBonus;
            p.hp = Math.min(p.maxHp, p.hp + Math.round(p.maxHp * 0.2));
        }
    } else {
        const d0 = st.players[0].hp <= 0, d1 = st.players[1].hp <= 0;
        if (d0 || d1) {
            st.phase = "over";
            if (d0 && d1) { st.winner = -1; st.reason = "Mutual destruction - it's a draw!"; }
            else { st.winner = d0 ? 1 : 0; st.reason = st.players[st.winner].name + " wins the duel!"; }
        }
    }
}
function stepWorld(st, inputs, dt, r) {
    if (!st || !(dt > 0)) return st;
    if (st.toast) { st.toast.t += dt; if (st.toast.t >= st.toast.dur) st.toast = null; }
    for (const f of st.effects) f.t += dt;
    st.effects = st.effects.filter(function (f) { return f.t < 0.6; });
    if (st.phase === "sailing") {
        st.sailT = Math.max(0, st.sailT - dt);
        const k = easeOut(1 - st.sailT / SAIL_DUR);
        for (const p of st.players) p.x = p.sailFrom + (p.sailTo - p.sailFrom) * k;
        st.wakeAcc = (st.wakeAcc || 0) + dt;
        if (st.wakeAcc > 0.1) {
            st.wakeAcc = 0;
            for (const p of st.players) fx(st, p.x - (p.side === 0 ? 30 : -30), WATER + 2, "splash", "#7dd3fc");
        }
        if (st.sailT <= 0) startBattle(st);
    } else if (st.phase === "battle") {
        stepBattle(st, inputs, dt, r);
    }
    const me = st.players[0];
    const mx = me && typeof me.x === "number" ? me.x : 200;
    const target = st.mode === "solo" ? clamp(mx - 220, 0, SEA_W - W) : 0;
    st.camX += (target - st.camX) * Math.min(1, dt * 6);
    return st;
}

/* ================= mount (DOM + input + net) ================= */
export function mount(root, context = {}) {
    const { mode = "ai", room = null, playerName = "Player", onExit = () => { } } = context;
    const online = mode === "room" && Boolean(room);
    const isHost = !online || Boolean(room.isHost);
    const myIdx = online && !room.isHost ? 1 : 0;
    let roomData = room && room.room ? room.room : null;

    root.innerHTML = `
<style>
.sc-app{--sc-line:#ffffff14;--sc-ink:#e2e8f0;--sc-dim:#8fa3b8;--sc-acc:#22d3ee;color:var(--sc-ink)}
.sc-app [hidden]{display:none!important}
.sc-hud{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:10px 0}
.sc-chip{font-size:12px;letter-spacing:.03em;padding:5px 11px;border:1px solid var(--sc-line);border-radius:999px;background:#ffffff07;color:var(--sc-dim);white-space:nowrap}
.sc-chip b{color:var(--sc-ink);font-weight:600}
.sc-spacer{flex:1}
.sc-ico{width:32px;height:32px;border-radius:10px;border:1px solid var(--sc-line);background:#ffffff07;color:var(--sc-dim);cursor:pointer;font-size:14px;line-height:1;display:grid;place-items:center;padding:0}
.sc-ico:hover{color:var(--sc-ink);background:#ffffff12}
.sc-panel{position:relative;padding:0;background:none;border:none}
.sc-board{display:block;width:100%;max-width:820px;margin:0 auto;border-radius:16px;border:1px solid var(--sc-line);background:#0a1420;touch-action:none;cursor:crosshair}
.sc-touch{display:none;gap:10px;justify-content:center;padding:12px 0 2px;flex-wrap:wrap}
@media (pointer:coarse),(max-width:760px){.sc-touch{display:flex}}
.sc-tbtn{width:56px;height:48px;border-radius:14px;border:1px solid var(--sc-line);background:#ffffff0a;color:var(--sc-ink);display:grid;place-items:center;user-select:none;-webkit-user-select:none;touch-action:none;cursor:pointer;padding:0}
.sc-tbtn:active{background:#ffffff22}
.sc-tbtn svg{width:22px;height:22px}
.sc-tbtn.fire{width:72px;background:#7f1d1d4d;border-color:#f8717144}
.sc-tbtn.spec{width:72px;background:#1e3a5f4d;border-color:#38bdf844}
.sc-ov{position:absolute;inset:0;display:grid;place-items:center;background:#0b1220d9;backdrop-filter:blur(5px);z-index:10;padding:14px;border-radius:16px}
.sc-card{width:min(100%,560px);max-height:100%;overflow:auto;background:#0f172a;border:1px solid var(--sc-line);border-radius:18px;padding:22px;text-align:center}
.sc-card h3{margin:0 0 6px;font-size:20px;font-weight:700;letter-spacing:.02em}
.sc-card p{margin:6px 0;color:var(--sc-dim);font-size:13px;line-height:1.55}
.sc-row{display:flex;gap:8px;justify-content:center;flex-wrap:wrap;margin-top:14px}
.sc-btn{border:1px solid #22d3ee55;background:#22d3ee1a;color:#a5f3fc;border-radius:12px;padding:9px 18px;font-size:13px;font-weight:700;cursor:pointer;letter-spacing:.02em}
.sc-btn:hover{background:#22d3ee2e}
.sc-btn.ghost{border-color:var(--sc-line);background:#ffffff07;color:var(--sc-dim)}
.sc-btn.ghost:hover{color:var(--sc-ink)}
.sc-ships{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px;margin:14px 0 4px}
.sc-ship{border:1px solid var(--sc-line);background:#ffffff06;border-radius:12px;padding:10px 12px;color:var(--sc-ink);cursor:pointer;text-align:left;font:inherit}
.sc-ship.on{border-color:var(--sc-acc);background:#22d3ee14}
.sc-ship b{display:block;font-size:13px}
.sc-ship small{display:block;color:var(--sc-dim);font-size:11px;margin-top:3px;line-height:1.4}
.sc-cols{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:14px;text-align:left;margin:12px 0;font-size:12.5px;color:var(--sc-dim)}
.sc-cols b{color:var(--sc-ink);font-size:12px;letter-spacing:.06em;text-transform:uppercase}
.sc-cols ul{margin:6px 0 12px;padding-left:16px;line-height:1.7}
.sc-kbd{border:1px solid var(--sc-line);border-bottom-width:2px;padding:0 6px;border-radius:6px;font-size:11px;background:#ffffff0a;color:var(--sc-ink);font-family:ui-monospace,monospace}
.sc-cheatrow{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:8px 12px;border:1px solid var(--sc-line);border-radius:10px;margin:6px 0;font-size:12.5px;color:var(--sc-dim);text-align:left}
.sc-switch{min-width:52px;border:1px solid var(--sc-line);background:#ffffff07;color:var(--sc-dim);border-radius:999px;padding:4px 10px;font-size:11px;font-weight:700;cursor:pointer}
.sc-switch.on{border-color:#4ade8066;background:#4ade801a;color:#86efac}
.sc-actions{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap}
.sc-hint{color:var(--sc-dim);font-size:12px}
</style>
<div class="game-app sc-app">
  <div class="game-intro">
    <div><h2>Ship Combat</h2><p>Arcade naval warfare - set sail from port, sink the raider waves, stay afloat.</p></div>
    <span class="game-status"><i class="game-status-dot"></i><span data-status>Ready</span></span>
  </div>
  <div class="sc-hud">
    <span class="sc-chip">Wave <b data-hud="wave">-</b></span>
    <span class="sc-chip" data-hud="ship">Frigate</span>
    <span class="sc-chip">HP <b data-hud="hp">-</b></span>
    <span class="sc-chip" data-hud="spec">Special ready</span>
    <span class="sc-chip">Score <b data-hud="score">0</b></span>
    <span class="sc-chip" data-chip="best">Best <b data-hud="best">0</b></span>
    <span class="sc-spacer"></span>
    <button class="sc-ico" type="button" data-act="help" title="How to play (H)" aria-label="How to play">?</button>
    <button class="sc-ico" type="button" data-act="cheat" data-btn="cheat" title="Cheats (C)" aria-label="Cheats">&#9881;</button>
    <button class="sc-ico" type="button" data-act="pause" data-btn="pause" title="Pause (P)" aria-label="Pause">&#10074;&#10074;</button>
    <button class="sc-ico" type="button" data-act="restart" title="Restart" aria-label="Restart">&#8635;</button>
  </div>
  <section class="game-panel sc-panel" data-board>
    <svg class="sc-board" viewBox="0 0 640 400" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Naval battle theater">
      <g data-g="static"></g><g data-g="world"></g><g data-g="screen"></g>
    </svg>
    <div class="sc-touch">
      <button class="sc-tbtn" type="button" data-k="l" aria-label="Sail left"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M14 6l-6 6 6 6"/></svg></button>
      <button class="sc-tbtn" type="button" data-k="r" aria-label="Sail right"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M10 6l6 6-6 6"/></svg></button>
      <button class="sc-tbtn" type="button" data-k="u" aria-label="Aim up"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M6 14l6-6 6 6"/></svg></button>
      <button class="sc-tbtn" type="button" data-k="d" aria-label="Aim down"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M6 10l6 6 6-6"/></svg></button>
      <button class="sc-tbtn fire" type="button" data-k="f" aria-label="Fire"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="6" fill="#fde047"/></svg></button>
      <button class="sc-tbtn spec" type="button" data-k="s" aria-label="Special"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 3L5 13h5l-2 8 9-11h-5l3-7z"/></svg></button>
    </div>
    <div class="sc-ov" data-ov="lobby">
      <div class="sc-card">
        <h3>Choose your ship</h3>
        <p data-lobby-sub>Arcade mode - endless raider waves, each one generated to be beatable.</p>
        <div class="sc-ships" data-ships></div>
        <p data-duel-info hidden></p>
        <div class="sc-row">
          <button class="sc-btn" type="button" data-act="start" data-start>Set sail</button>
          <button class="sc-btn ghost" type="button" data-act="help">How to play</button>
        </div>
      </div>
    </div>
    <div class="sc-ov" data-ov="help" hidden>
      <div class="sc-card">
        <h3>How to play</h3>
        <div class="sc-cols">
          <div>
            <b>Desktop</b>
            <ul>
              <li><span class="sc-kbd">A</span>/<span class="sc-kbd">D</span> or arrows - sail</li>
              <li><span class="sc-kbd">W</span>/<span class="sc-kbd">S</span> - gun elevation</li>
              <li><span class="sc-kbd">Space</span> (hold) - fire</li>
              <li><span class="sc-kbd">X</span> - special weapon</li>
              <li>Mouse move - aim, hold click - fire, right-click - special</li>
              <li><span class="sc-kbd">P</span> pause, <span class="sc-kbd">H</span> help, <span class="sc-kbd">C</span> cheats (solo)</li>
            </ul>
            <b>Mobile</b>
            <ul>
              <li>On-screen buttons: sail, aim, hold fire, special</li>
              <li>Drag on the sea to aim, hold to fire</li>
            </ul>
          </div>
          <div>
            <b>Rules</b>
            <ul>
              <li>Sink every raider to clear the wave. Bonus points and +20% hull repair between waves.</li>
              <li>A coin flip decides who fires the opening salvo.</li>
              <li>Online duel: your side (left/right) is shuffled at random every match.</li>
              <li>Shells arc over the sea; torpedoes run at the waterline and hit dived subs too.</li>
              <li>Dived subs are immune to shells and bombs - not to torpedoes.</li>
              <li>Using cheats disables best-score saving.</li>
            </ul>
          </div>
        </div>
        <div class="sc-row"><button class="sc-btn" type="button" data-act="closehelp">Got it</button></div>
      </div>
    </div>
    <div class="sc-ov" data-ov="cheat" hidden>
      <div class="sc-card">
        <h3>Cheats</h3>
        <p>Solo only. Any cheat disables best-score saving for this run.</p>
        <div data-cheats></div>
        <div class="sc-row">
          <button class="sc-btn ghost" type="button" data-cheat="heal">Full repair</button>
          <button class="sc-btn ghost" type="button" data-cheat="skip">Clear wave</button>
          <button class="sc-btn" type="button" data-act="closecheat">Close</button>
        </div>
      </div>
    </div>
    <div class="sc-ov" data-ov="clear" hidden>
      <div class="sc-card">
        <h3 data-clear-title>Wave cleared</h3>
        <p data-clear-sub></p>
        <div class="sc-row">
          <button class="sc-btn" type="button" data-act="next">Next wave</button>
          <button class="sc-btn ghost" type="button" data-act="lobby">Change ship</button>
        </div>
      </div>
    </div>
    <div class="sc-ov" data-ov="over" hidden>
      <div class="sc-card">
        <h3 data-over-title>Sunk</h3>
        <p data-over-sub></p>
        <div class="sc-row">
          <button class="sc-btn" type="button" data-act="retry" data-retry>Retry</button>
          <button class="sc-btn" type="button" data-act="rematch" data-rematch hidden>Rematch</button>
          <button class="sc-btn ghost" type="button" data-act="lobby">Change ship</button>
        </div>
      </div>
    </div>
  </section>
  <div class="game-actions sc-actions">
    <span class="sc-hint">A/D sail - W/S aim - Space fire - X special - mouse aim &amp; click - right-click special</span>
    <button class="game-action-button" type="button" data-exit>Exit game</button>
  </div>
</div>`;

    const $ = function (s) { return root.querySelector(s); };
    const svgEl = $(".sc-board");
    const staticG = $('[data-g="static"]');
    const worldG = $('[data-g="world"]');
    const screenG = $('[data-g="screen"]');
    const statusEl = $("[data-status]");
    const ovLobby = $('[data-ov="lobby"]');
    const ovHelp = $('[data-ov="help"]');
    const ovCheat = $('[data-ov="cheat"]');
    const ovClear = $('[data-ov="clear"]');
    const ovOver = $('[data-ov="over"]');
    const lobbySub = $("[data-lobby-sub]");
    const shipsHost = $("[data-ships]");
    const duelInfo = $("[data-duel-info]");
    const startBtn = $("[data-start]");
    const cheatsHost = $("[data-cheats]");
    const clearTitle = $("[data-clear-title]");
    const clearSub = $("[data-clear-sub]");
    const overTitle = $("[data-over-title]");
    const overSub = $("[data-over-sub]");
    const retryBtn = $("[data-retry]");
    const rematchBtn = $("[data-rematch]");
    const cheatBtn = $('[data-btn="cheat"]');
    const pauseBtn = $('[data-btn="pause"]');
    const bestChip = $('[data-chip="best"]');
    const hud = {
        wave: $('[data-hud="wave"]'), ship: $('[data-hud="ship"]'), hp: $('[data-hud="hp"]'),
        spec: $('[data-hud="spec"]'), score: $('[data-hud="score"]'), best: $('[data-hud="best"]'),
    };

    /* ---------- local (non-serializable) runtime ---------- */
    let state = null;                 /* canonical sim state (host / solo) */
    let netState = null, netAt = 0;   /* guest replica */
    let inputs = online ? [{}, {}] : [{}];
    let inp = { l: false, r: false, u: false, d: false, f: false };
    const rngBattle = rng((Math.random() * 1e9) | 0);
    let raf = null, lastT = 0, lastPub = 0, T = 0;
    let paused = false, showHelp = false, showCheat = false;
    let boardFireId = null;
    const touchPts = new Map();
    const posCache = new Map();
    let lastViewAt = 0, myAim = 0.5, myAimAt = 0, lastAimSent = -9, lastAimSentAt = 0;
    let pickSig = "", cheatSig = "", ovSig = "";
    const unsubs = [];

    function loadBest() { try { return parseInt(localStorage.getItem(META.bestKey), 10) || 0; } catch (e) { return 0; } }
    function saveBest() {
        if (!state || state.mode !== "solo" || state.cheatUsed) return;
        if (state.score > (state.best || 0)) {
            state.best = state.score; state.newBest = true;
            try { localStorage.setItem(META.bestKey, String(state.best)); } catch (e) { }
        }
    }
    function curState() { return isHost ? state : netState; }
    function publish() { if (online && isHost && state && room.publishState) room.publishState(state).catch(console.warn); }
    function renderNow() { render(isHost ? state : guestView()); }

    /* ---------- rendering ---------- */
    function renderStatic() {
        let s = '<defs><linearGradient id="scSea" x1="0" y1="0" x2="0" y2="1">' +
            '<stop offset="0" stop-color="#0a2836"/><stop offset="1" stop-color="#071c26"/></linearGradient></defs>';
        s += '<rect x="0" y="0" width="640" height="' + WATER + '" fill="#0d1826"/>';
        s += '<circle cx="505" cy="52" r="16" fill="#e8e2cf" opacity=".35"/>';
        s += '<rect x="0" y="' + WATER + '" width="640" height="' + (H - WATER) + '" fill="url(#scSea)"/>';
        s += '<path d="M0 ' + WATER + ' q30 5 60 0 q30 -5 60 0 q30 5 60 0 q30 -5 60 0 q30 5 60 0 q30 -5 60 0 q30 5 60 0 q30 -5 60 0 q30 5 60 0 q30 -5 60 0 q30 5 60 0" stroke="#2dd4bf" stroke-width="1.6" fill="none" opacity=".28"/>';
        for (const y of [305, 350, 385]) {
            s += '<path d="M0 ' + y + ' q40 5 80 0 q40 -5 80 0 q40 5 80 0 q40 -5 80 0 q40 5 80 0 q40 -5 80 0 q40 5 80 0 q40 -5 80 0" stroke="#14384a" stroke-width="1.6" fill="none" opacity=".7"/>';
        }
        staticG.innerHTML = s;
    }
    function portSvg() {
        let s = '<g>';
        s += '<rect x="0" y="' + (WATER - 16) + '" width="150" height="10" fill="#16283a"/>';
        for (const x of [18, 58, 98, 138]) s += '<line x1="' + x + '" y1="' + (WATER - 6) + '" x2="' + x + '" y2="' + (WATER + 42) + '" stroke="#16283a" stroke-width="6"/>';
        s += '<path d="M120 ' + (WATER - 16) + ' V' + (WATER - 72) + ' L62 ' + (WATER - 54) + '" stroke="#3d5570" stroke-width="3" fill="none"/>';
        s += '<line x1="62" y1="' + (WATER - 54) + '" x2="62" y2="' + (WATER - 40) + '" stroke="#3d5570" stroke-width="2"/>';
        s += '<line x1="146" y1="' + (WATER - 16) + '" x2="146" y2="' + (WATER - 58) + '" stroke="#3d5570" stroke-width="2"/>';
        s += '<path d="M146 ' + (WATER - 58) + ' l16 5 -16 5 Z" fill="#22d3ee" opacity=".8"/>';
        s += '<text x="70" y="' + (WATER - 24) + '" fill="#5b7186" font-size="10" letter-spacing="4" text-anchor="middle">PORT</text>';
        s += '</g>';
        return s;
    }
    function buoysSvg() {
        let s = "";
        for (const x of [28, 612]) {
            s += '<path d="M' + (x - 6) + ' ' + WATER + ' l6 -14 6 14 Z" fill="#16283a" stroke="#3d5570" stroke-width="1.5"/>';
            s += '<circle cx="' + x + '" cy="' + (WATER - 16) + '" r="2.4" fill="#f87171" opacity=".8"/>';
        }
        return s;
    }
    function shipShape(type, col, big) {
        const hw = big ? 46 : type === "carrier" ? 46 : type === "raider" ? 26 : 30;
        let s = '<g stroke="' + col + '" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round">';
        s += '<path d="M' + (-hw) + ' -6 L' + hw + ' -6 L' + (hw - 10) + ' 8 L' + (-hw + 8) + ' 8 Z" fill="#122536"/>';
        if (type === "carrier") {
            s += '<rect x="' + (-hw + 6) + '" y="-24" width="' + (hw * 2 - 14) + '" height="10" rx="2" fill="#1a3348"/>';
            s += '<path d="M' + (-hw + 8) + ' -19h' + (hw * 2 - 18) + '" stroke-dasharray="5 4" opacity=".7"/>';
            s += '<rect x="' + (hw - 16) + '" y="-34" width="7" height="11" rx="1.5" fill="#1a3348"/>';
        } else if (type === "raider") {
            s += '<rect x="-10" y="-16" width="20" height="9" rx="2" fill="#1a3348"/>';
            s += '<line x1="2" y1="-16" x2="2" y2="-23"/>';
        } else if (type === "lsd") {
            s += '<rect x="-16" y="-22" width="40" height="14" rx="3" fill="#1a3348"/>';
            s += '<rect x="10" y="-30" width="12" height="9" rx="2" fill="#1a3348"/>';
            s += '<line x1="16" y1="-30" x2="16" y2="-38"/>';
        } else {
            s += '<rect x="-13" y="-20" width="26" height="12" rx="2" fill="#1a3348"/>';
            s += '<rect x="-4" y="-30" width="10" height="10" rx="2" fill="#1a3348"/>';
        }
        s += '</g>';
        return s;
    }
    function turretSvg(x, a, flip) {
        const b = turretGeom(x, a, flip);
        return '<line x1="' + x + '" y1="' + (WATER - 18) + '" x2="' + b.bx.toFixed(1) + '" y2="' + b.by.toFixed(1) + '" stroke="#cbd5e1" stroke-width="4" stroke-linecap="round"/>' +
            '<circle cx="' + x + '" cy="' + (WATER - 18) + '" r="5" fill="#233649" stroke="#cbd5e1" stroke-width="1.6"/>';
    }
    function subSvg(x, dived, col) {
        if (dived) {
            return '<g><line x1="' + (x - 4) + '" y1="' + (WATER - 2) + '" x2="' + (x - 4) + '" y2="' + (WATER - 22) + '" stroke="' + col + '" stroke-width="3"/>' +
                '<path d="M' + (x - 8) + ' ' + (WATER - 22) + ' h8" stroke="' + col + '" stroke-width="2.6"/>' +
                '<path d="M' + (x - 30) + ' ' + (WATER + 6) + ' q10 -4 20 0 q10 4 20 0" stroke="#38bdf8" fill="none" opacity=".4"/></g>';
        }
        return '<g stroke="' + col + '" stroke-width="2" fill="#122536"><path d="M-26 4 q0 -12 26 -12 q26 0 26 12 q0 8 -26 8 q-26 0 -26 -8 Z" transform="translate(' + x + ',' + (WATER + 2) + ')"/>' +
            '<line x1="' + (x - 2) + '" y1="' + (WATER - 8) + '" x2="' + (x - 2) + '" y2="' + (WATER - 20) + '" stroke-width="3"/>' +
            '<path d="M' + (x - 6) + ' ' + (WATER - 20) + ' h8"/></g>';
    }
    function hpBar(x, y, w2, frac, col) {
        return '<rect x="' + (x - w2 / 2).toFixed(1) + '" y="' + y.toFixed(1) + '" width="' + w2 + '" height="4" rx="2" fill="#22364a"/>' +
            '<rect x="' + (x - w2 / 2).toFixed(1) + '" y="' + y.toFixed(1) + '" width="' + Math.max(0, w2 * clamp(frac, 0, 1)).toFixed(1) + '" height="4" rx="2" fill="' + col + '"/>';
    }
    function drawPlayer(p, mine) {
        const spec = SHIPS[p.ship];
        if (!spec) return "";
        let s = "";
        if (p.ship === "submarine") s += subSvg(p.x, p.dived, spec.col);
        else {
            s += '<g transform="translate(' + p.x.toFixed(1) + ',' + WATER + ')">' + shipShape(p.ship, spec.col, p.ship === "carrier") + '</g>';
            s += turretSvg(p.x, p.aim, p.side === 1);
        }
        s += hpBar(p.x, WATER - 46, 60, p.hp / p.maxHp, mine ? "#4ade80" : "#f87171");
        return s;
    }
    function render(ds) {
        const cam = ds && typeof ds.camX === "number" ? ds.camX : 0;
        const solo = !ds || ds.mode === "solo";
        const phase = ds ? ds.phase : "lobby";
        const world = [];
        const screen = [];
        world.push('<g transform="translate(' + (-cam).toFixed(1) + ',0)">');
        world.push(solo ? portSvg() : buoysSvg());
        if (ds && phase === "lobby") {
            const me = ds.players[myIdx];
            if (me && me.ship) {
                const bob = Math.sin(T * 2) * 2;
                world.push('<g transform="translate(110,' + (WATER + bob).toFixed(1) + ')">' + (me.ship === "submarine" ? subSvg(0, false, SHIPS[me.ship].col) : shipShape(me.ship, SHIPS[me.ship].col, me.ship === "carrier")) + '</g>');
            }
        }
        if (ds && (phase === "sailing" || phase === "battle" || phase === "cleared" || phase === "over")) {
            for (const f of ds.foes) {
                if (f.hp <= 0) continue;
                world.push('<g transform="translate(' + f.x.toFixed(1) + ',' + WATER + ')">' + shipShape("raider", ENEMY.col, false) + '</g>');
                world.push(turretSvg(f.x, f.aim, true));
                world.push(hpBar(f.x, WATER - 40, 52, f.hp / f.maxHp, ENEMY.col));
            }
            for (let i = 0; i < ds.players.length; i++) {
                const p = ds.players[i];
                if (!p || typeof p.x !== "number" || !(p.hp > 0)) continue;
                world.push(drawPlayer(p, i === myIdx));
                if (!solo) world.push('<text x="' + p.x.toFixed(1) + '" y="' + (WATER - 54) + '" fill="#8fa3b8" font-size="10" text-anchor="middle">' + String(p.name || "").slice(0, 14) + '</text>');
                if (i === myIdx && !p.dived && phase === "battle" && p.ship !== "submarine") {
                    const dir = p.side === 1 ? -1 : 1;
                    const mx = p.x + dir * Math.cos(p.aim) * 42, my = WATER - 18 - Math.sin(p.aim) * 38;
                    world.push('<line x1="' + mx.toFixed(1) + '" y1="' + my.toFixed(1) + '" x2="' + (mx + dir * Math.cos(p.aim) * 54).toFixed(1) + '" y2="' + (my - Math.sin(p.aim) * 54).toFixed(1) + '" stroke="#fde047" stroke-width="1.6" stroke-dasharray="3 7" opacity=".3"/>');
                }
            }
            for (const sh of ds.shells) {
                world.push('<circle cx="' + sh.x.toFixed(1) + '" cy="' + sh.y.toFixed(1) + '" r="' + (sh.bomb ? 4.4 : 3.4) + '" fill="' + (sh.who === myIdx ? "#fde047" : "#fb923c") + '"/>');
            }
            for (const tp of ds.torps) {
                const col = tp.who === myIdx ? "#f0abfc" : "#fb7185";
                world.push('<line x1="' + (tp.x - Math.sign(tp.vx) * 10).toFixed(1) + '" y1="' + (WATER + 16) + '" x2="' + tp.x.toFixed(1) + '" y2="' + (WATER + 16) + '" stroke="' + col + '" stroke-width="4.6" stroke-linecap="round"/>');
                world.push('<circle cx="' + (tp.x - Math.sign(tp.vx) * 16).toFixed(1) + '" cy="' + (WATER + 16) + '" r="2.2" fill="#bae6fd" opacity=".55"/>');
            }
            for (const c of ds.charges) {
                world.push('<circle cx="' + c.x.toFixed(1) + '" cy="' + c.y.toFixed(1) + '" r="4.6" fill="#e2e8f0"/>');
                world.push('<circle cx="' + (c.x + 3).toFixed(1) + '" cy="' + (c.y - 7).toFixed(1) + '" r="1.8" fill="#bae6fd" opacity=".5"/>');
            }
            for (const cr of ds.crafts) {
                world.push('<g transform="translate(' + cr.x.toFixed(1) + ',' + WATER + ')"><path d="M-12 -3 h24 l-4 7 h-16 z" fill="#3d1f33" stroke="#f9a8d4" stroke-width="1.8"/><line x1="0" y1="-3" x2="0" y2="-9" stroke="#f9a8d4" stroke-width="1.8"/></g>');
            }
            for (const pl of ds.planes) {
                world.push('<g transform="translate(' + pl.x.toFixed(1) + ',' + pl.y.toFixed(1) + ') scale(' + (pl.vx < 0 ? -1 : 1) + ',1)">' +
                    '<path d="M-12 0h20M12 0l5 -3v6zM0 0l-8 -8m8 8l-8 8M-12 0l-5 -5m5 5l-5 5" stroke="' + (pl.who === myIdx ? "#86efac" : "#fca5a5") + '" stroke-width="2.2" fill="none" stroke-linecap="round"/></g>');
            }
            for (const f of ds.effects) {
                if (f.kind === "flash") continue;
                const p = f.t / 0.55;
                const r = f.kind === "splash" ? 4 + 12 * p : f.kind === "muzzle" ? 3 + 7 * p : 8 + 26 * p;
                world.push('<circle cx="' + f.x.toFixed(1) + '" cy="' + f.y.toFixed(1) + '" r="' + r.toFixed(1) + '" fill="none" stroke="' + f.color + '" stroke-width="' + (f.kind === "boom" ? 2.6 : 1.6) + '" opacity="' + Math.max(0, 1 - p).toFixed(2) + '"/>');
            }
        }
        world.push('</g>');
        /* screen-space layer */
        const off = -((cam * 0.5) % 28);
        screen.push('<path d="M-30 ' + (WATER + 45) + ' H670" stroke="#1c4258" stroke-width="1.4" stroke-dasharray="14 14" stroke-dashoffset="' + off.toFixed(1) + '" opacity=".5"/>');
        screen.push('<path d="M-30 ' + (WATER + 95) + ' H670" stroke="#173a4e" stroke-width="1.4" stroke-dasharray="10 18" stroke-dashoffset="' + (off * 0.7).toFixed(1) + '" opacity=".5"/>');
        if (ds && solo && (phase === "battle" || phase === "sailing")) {
            let ahead = 0;
            for (const f of ds.foes) if (f.hp > 0 && f.x - cam > W - 16) ahead++;
            if (ahead > 0) {
                screen.push('<path d="M616 ' + (WATER - 74) + ' l10 8 -10 8" stroke="#fb923c" stroke-width="2.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/>');
                screen.push('<text x="608" y="' + (WATER - 62) + '" fill="#fb923c" font-size="12" text-anchor="end" font-weight="600">' + ahead + '</text>');
            }
            const mw = W - 24;
            screen.push('<rect x="12" y="' + (H - 13) + '" width="' + mw + '" height="3" rx="1.5" fill="#ffffff12"/>');
            screen.push('<rect x="' + (12 + (cam / SEA_W) * mw).toFixed(1) + '" y="' + (H - 15) + '" width="' + ((W / SEA_W) * mw).toFixed(1) + '" height="7" rx="3" fill="none" stroke="#ffffff22"/>');
            const me = ds.players[0];
            if (me && typeof me.x === "number") screen.push('<circle cx="' + (12 + (me.x / SEA_W) * mw).toFixed(1) + '" cy="' + (H - 11.5) + '" r="2.6" fill="#22d3ee"/>');
            for (const f of ds.foes) if (f.hp > 0) screen.push('<circle cx="' + (12 + (f.x / SEA_W) * mw).toFixed(1) + '" cy="' + (H - 11.5) + '" r="2.2" fill="#fb923c"/>');
        }
        if (ds && !solo) screen.push('<line x1="320" y1="' + (WATER - 90) + '" x2="320" y2="' + (H - 30) + '" stroke="#ffffff" stroke-width="1" stroke-dasharray="2 8" opacity=".08"/>');
        if (ds && ds.toast) {
            const t = ds.toast, dur = t.dur || 1.6;
            const op = t.t < 0.25 ? t.t / 0.25 : t.t > dur - 0.4 ? Math.max(0, (dur - t.t) / 0.4) : 1;
            const tw = t.text.length * 8.2 + 30;
            screen.push('<g opacity="' + op.toFixed(2) + '"><rect x="' + (320 - tw / 2).toFixed(1) + '" y="42" width="' + tw.toFixed(1) + '" height="30" rx="15" fill="#0f172a" stroke="#ffffff14"/>' +
                '<text x="320" y="62" fill="#e2e8f0" font-size="13.5" font-weight="600" text-anchor="middle" letter-spacing=".5">' + t.text + '</text></g>');
        }
        if (ds) for (const f of ds.effects) {
            if (f.kind !== "flash") continue;
            screen.push('<rect x="3" y="3" width="634" height="394" rx="14" fill="none" stroke="#ef4444" stroke-width="5" opacity="' + Math.max(0, 1 - f.t / 0.35).toFixed(2) + '"/>');
        }
        if (!online && paused && phase === "battle") {
            screen.push('<rect x="0" y="0" width="640" height="400" fill="#0b1220" opacity=".55"/>');
            screen.push('<text x="320" y="200" fill="#8fa3b8" font-size="16" text-anchor="middle" letter-spacing="2">PAUSED - P TO RESUME</text>');
        }
        worldG.innerHTML = world.join("");
        screenG.innerHTML = screen.join("");
        updateHud(ds);
        syncOverlays(ds);
        updateStatus(ds);
    }

    function specText(p) {
        if (!p || !p.ship) return "Special ready";
        const spec = SHIPS[p.ship];
        if (spec.special === "dive") {
            if (p.dived) return "Dived " + Math.max(0, p.diveT).toFixed(1) + "s";
            if (p.diveCd > 0) return "Dive in " + p.diveCd.toFixed(1) + "s";
            return "Dive ready";
        }
        if (p.sCd > 0) return "Reload " + p.sCd.toFixed(1) + "s";
        return "Special ready";
    }
    function updateHud(ds) {
        const me = ds ? ds.players[myIdx] : null;
        const solo = !ds || ds.mode === "solo";
        hud.wave.textContent = solo ? (ds && ds.wave > 0 ? String(ds.wave) : "-") : "duel";
        hud.ship.textContent = me && me.ship ? SHIPS[me.ship].label + (me.dived ? " (dived)" : "") : "-";
        hud.hp.textContent = me && typeof me.hp === "number" ? Math.max(0, Math.ceil(me.hp)) + "/" + me.maxHp : "-";
        hud.spec.textContent = specText(me);
        hud.score.textContent = ds ? String(ds.score) : "0";
        hud.best.textContent = ds && typeof ds.best === "number" ? String(ds.best) : String(loadBest());
    }
    function updateStatus(ds) {
        let txt;
        if (!online) txt = "Solo vs bot";
        else if (!ds) txt = "Connecting to room...";
        else {
            const side = ds.sides ? (ds.sides[myIdx] === 0 ? "left" : "right") : "lobby";
            txt = "Online duel - P" + (myIdx + 1) + " - " + side + " side";
        }
        if (!online && paused) txt += " - paused";
        statusEl.textContent = txt;
    }
    function renderPickers(ds) {
        const myShip = ds && ds.players[myIdx] ? ds.players[myIdx].ship : null;
        const sig = JSON.stringify([myShip, online, ds ? ds.players.map(function (p) { return [p.ship, p.name]; }) : null]);
        if (sig === pickSig) return;
        pickSig = sig;
        let s = "";
        for (const k of Object.keys(SHIPS)) {
            const sh = SHIPS[k];
            s += '<button type="button" class="sc-ship' + (myShip === k ? " on" : "") + '" data-ship="' + k + '"><b>' + sh.label + '</b>' +
                '<small>HP ' + sh.hp + ' - SPD ' + sh.spd + ' - DMG ' + sh.gun + '</small><small>' + sh.blurb + '</small></button>';
        }
        shipsHost.innerHTML = s;
        if (!ds) { lobbySub.textContent = "Connecting to room..."; shipsHost.innerHTML = ""; }
        else if (online) {
            lobbySub.textContent = "Online duel - sides and first salvo are rolled at random. Battle starts when both captains are ready.";
            const other = ds.players[1 - myIdx];
            duelInfo.hidden = false;
            duelInfo.textContent = (myShip ? "You are ready. " : "Pick your ship. ") + (other && other.ship ? other.name + " is ready." : "Waiting for " + (other ? other.name : "opponent") + "...");
        } else {
            lobbySub.textContent = "Arcade mode - endless raider waves, each one generated to be beatable.";
            duelInfo.hidden = true;
        }
        startBtn.hidden = online;
    }
    function renderCheats(ds) {
        const ch = ds && ds.cheats ? ds.cheats : {};
        const sig = JSON.stringify(ch);
        if (sig === cheatSig) return;
        cheatSig = sig;
        let s = "";
        for (const c of CHEATS) {
            const on = Boolean(ch[c.id]);
            s += '<div class="sc-cheatrow"><span>' + c.label + '</span><button type="button" class="sc-switch' + (on ? " on" : "") + '" data-cheat="' + c.id + '">' + (on ? "ON" : "OFF") + '</button></div>';
        }
        cheatsHost.innerHTML = s;
    }
    function syncOverlays(ds) {
        const phase = ds ? ds.phase : "lobby";
        const solo = !ds || ds.mode === "solo";
        ovLobby.hidden = phase !== "lobby";
        ovClear.hidden = !(solo && phase === "cleared");
        ovOver.hidden = phase !== "over";
        ovHelp.hidden = !showHelp;
        ovCheat.hidden = !showCheat || online;
        cheatBtn.hidden = online;
        pauseBtn.hidden = online;
        bestChip.hidden = !solo;
        if (phase === "lobby") renderPickers(ds);
        if (!ovCheat.hidden) renderCheats(ds);
        const sig = JSON.stringify([phase, ds ? ds.wave : 0, ds ? ds.score : 0, ds ? ds.winner : null, ds ? ds.reason : "", ds ? ds.lastBonus : 0, ds ? ds.newBest : false]);
        if (sig === ovSig) return;
        ovSig = sig;
        if (phase === "cleared" && ds) {
            clearTitle.textContent = "Wave " + ds.wave + " cleared";
            clearSub.textContent = "+" + ds.lastBonus + " bonus points - hull patched +20%. The next wave is generated to be fair.";
        }
        if (phase === "over" && ds) {
            if (solo) {
                overTitle.textContent = "Sunk";
                overSub.textContent = ds.reason + " Score: " + ds.score + (ds.newBest ? " - new best!" : " (best " + (ds.best || 0) + ")");
            } else {
                overTitle.textContent = ds.winner === myIdx ? "Victory" : ds.winner === -1 ? "Draw" : "Defeat";
                overSub.textContent = ds.reason;
            }
            retryBtn.hidden = online;
            rematchBtn.hidden = !online;
        }
    }

    /* ---------- guest interpolation / prediction ---------- */
    function guestView() {
        if (!netState) return null;
        const now = performance.now();
        const e = Math.min(0.15, (now - netAt) / 1000);
        const s = netState;
        const v = Object.assign({}, s);
        v.shells = (s.shells || []).map(function (sh) { return Object.assign({}, sh, { x: sh.x + sh.vx * e, y: sh.y + sh.vy * e + 0.5 * GRAV * e * e }); });
        v.torps = (s.torps || []).map(function (t) { return Object.assign({}, t, { x: t.x + t.vx * e }); });
        v.charges = (s.charges || []).map(function (c) { return Object.assign({}, c, { x: c.x + (c.vx || 0) * e, y: c.y + (c.vy || 0) * e }); });
        v.planes = (s.planes || []).map(function (p) { return Object.assign({}, p, { x: p.x + p.vx * e }); });
        v.effects = (s.effects || []).map(function (f) { return Object.assign({}, f, { t: f.t + e }); });
        if (s.toast) v.toast = Object.assign({}, s.toast, { t: s.toast.t + e });
        const dtF = lastViewAt ? Math.min(0.05, (now - lastViewAt) / 1000) : 0.016;
        lastViewAt = now;
        v.players = (s.players || []).map(function (p, i) {
            if (typeof p.x !== "number") return p;
            const key = "p" + i;
            let cx = posCache.has(key) ? posCache.get(key) : p.x;
            if (i === myIdx && s.phase === "battle") {
                const spec = SHIPS[p.ship];
                const dir = (inp.r ? 1 : 0) - (inp.l ? 1 : 0);
                const b = moveBounds(s, p);
                cx = clamp(cx + dir * spec.spd * (p.dived ? 0.6 : 1) * dtF, b[0], b[1]);
                cx += (p.x - cx) * 0.12;
                if (!p.dived && (inp.u || inp.d)) { myAim = aimClamp(myAim + (inp.u ? 1.1 : -1.1) * dtF); myAimAt = now; }
            } else cx += (p.x - cx) * 0.35;
            posCache.set(key, cx);
            const out = Object.assign({}, p, { x: cx });
            if (i === myIdx) {
                if (now - myAimAt < 500 && !p.dived) out.aim = myAim;
                else myAim = p.aim;
            }
            return out;
        });
        v.foes = (s.foes || []).map(function (f) {
            const key = "f" + f.id;
            let cx = posCache.has(key) ? posCache.get(key) : f.x;
            cx += (f.x - cx) * 0.35;
            posCache.set(key, cx);
            return Object.assign({}, f, { x: cx });
        });
        let cam = posCache.has("cam") ? posCache.get("cam") : (s.camX || 0);
        cam += ((s.camX || 0) - cam) * 0.3;
        posCache.set("cam", cam);
        v.camX = cam;
        return v;
    }

    /* ---------- actions (host-authoritative) ---------- */
    function afterAction() { if (isHost) { render(state); if (online) publish(); } }
    function applyAction(a, actor) {
        if (!state || !a || (actor !== 0 && actor !== 1)) return;
        if (state.mode === "solo" && actor !== 0) return;
        const t = a.type;
        if (t === "hello") {
            if (state.mode === "duel" && state.players[actor]) state.players[actor].name = String(a.name || "Player").slice(0, 16);
            afterAction(); return;
        }
        if (t === "input") {
            const k = a.k || {};
            inputs[actor] = { l: Boolean(k.l), r: Boolean(k.r), u: Boolean(k.u), d: Boolean(k.d), f: Boolean(k.f) };
            return;
        }
        if (t === "aim") {
            const p = state.players[actor];
            if (p && state.phase === "battle" && !p.dived) p.aim = aimClamp(a.a);
            return;
        }
        if (t === "pick") {
            if (state.phase !== "lobby" || !SHIPS[a.ship]) return;
            state.players[actor].ship = a.ship;
            if (state.mode === "duel" && state.players[0].ship && state.players[1].ship) beginDuel(state, rngBattle);
            afterAction(); return;
        }
        if (t === "start" || t === "retry") {
            if (state.mode !== "solo") return;
            if (t === "start" && state.phase !== "lobby") return;
            state.score = 0; state.cheatUsed = false; state.newBest = false;
            for (const ck of Object.keys(state.cheats)) state.cheats[ck] = false;
            beginWave(state, 1, (Math.random() * 1e9) | 0, rngBattle);
            afterAction(); return;
        }
        if (t === "next") {
            if (state.mode !== "solo" || state.phase !== "cleared") return;
            beginWave(state, state.wave + 1, (Math.random() * 1e9) | 0, rngBattle);
            afterAction(); return;
        }
        if (t === "rematch") {
            if (state.mode !== "duel" || state.phase !== "over") return;
            beginDuel(state, rngBattle);
            afterAction(); return;
        }
        if (t === "lobby") {
            if (state.phase === "sailing") return;
            if (state.mode === "duel") {
                state.players = state.players.map(function (p) { return { ship: null, name: p.name }; });
                state.sides = null;
            } else {
                const me = state.players[0] || {};
                state.players = [{ ship: me.ship || "frigate", name: me.name || "Player" }];
            }
            blankArrays(state);
            state.phase = "lobby"; state.toast = null; state.winner = null; state.reason = "";
            afterAction(); return;
        }
        if (t === "special") { doSpecial(state, actor); afterAction(); return; }
        if (t === "cheat") {
            if (state.mode !== "solo") return;
            const id = a.id;
            const p = state.players[0];
            if (id === "heal") { if (p && typeof p.hp === "number") p.hp = p.maxHp; state.cheatUsed = true; }
            else if (id === "skip") {
                if (state.phase === "battle") { for (const f of state.foes) if (!f.dead) hurtFoe(state, f, 9999, "depth"); state.foes = state.foes.filter(function (f) { return !f.dead; }); state.cheatUsed = true; }
            } else if (Object.prototype.hasOwnProperty.call(state.cheats, id)) {
                state.cheats[id] = !state.cheats[id];
                state.cheatUsed = true;
            }
            afterAction(); return;
        }
    }
    function submitAction(a) {
        if (online && !isHost) { if (room.sendAction) room.sendAction(a).catch(console.warn); return; }
        applyAction(a, myIdx);
    }
    function setInp(k, v) {
        if (inp[k] === v) return;
        inp[k] = v;
        submitAction({ type: "input", k: Object.assign({}, inp) });
    }
    function resetInp() {
        inp = { l: false, r: false, u: false, d: false, f: false };
        touchPts.clear(); boardFireId = null;
        submitAction({ type: "input", k: Object.assign({}, inp) });
    }

    /* ---------- input: keyboard / mouse / touch ---------- */
    function codeToKey(c) {
        if (c === "ArrowLeft" || c === "KeyA") return "l";
        if (c === "ArrowRight" || c === "KeyD") return "r";
        if (c === "ArrowUp" || c === "KeyW") return "u";
        if (c === "ArrowDown" || c === "KeyS") return "d";
        if (c === "Space") return "f";
        if (c === "KeyX" || c === "KeyK") return "s";
        return null;
    }
    function onKeyDown(e) {
        const c = e.code;
        if (c === "KeyH") { e.preventDefault(); showHelp = !showHelp; renderNow(); return; }
        if (c === "KeyC" && !online) { e.preventDefault(); showCheat = !showCheat; renderNow(); return; }
        if (c === "KeyP" && !online) { e.preventDefault(); paused = !paused; renderNow(); return; }
        if (c === "Escape") { if (showHelp || showCheat) { showHelp = false; showCheat = false; renderNow(); } return; }
        if (c === "Enter") {
            const ds = curState(), ph = ds ? ds.phase : "lobby";
            if (ph === "lobby" && !online) submitAction({ type: "start" });
            else if (ph === "cleared") submitAction({ type: "next" });
            else if (ph === "over") submitAction({ type: online ? "rematch" : "retry" });
            return;
        }
        const k = codeToKey(c);
        if (!k) return;
        e.preventDefault();
        if (k === "s") { if (!e.repeat) submitAction({ type: "special" }); return; }
        setInp(k, true);
    }
    function onKeyUp(e) {
        const k = codeToKey(e.code);
        if (k && k !== "s") setInp(k, false);
    }
    function onBoardMove(e) {
        const ds = curState();
        if (!ds || ds.phase !== "battle") return;
        const p = ds.players[myIdx];
        if (!p || typeof p.x !== "number" || p.dived) return;
        const r = svgEl.getBoundingClientRect();
        if (!(r.width > 0)) return;
        const vx = (e.clientX - r.left) * (W / r.width);
        const vy = (e.clientY - r.top) * (H / r.height);
        const wx = vx + (ds.camX || 0);
        const a = Math.atan2(WATER - 18 - vy, p.side === 1 ? p.x - wx : wx - p.x);
        if (a > 0.05) {
            const aa = aimClamp(a);
            myAim = aa; myAimAt = performance.now();
            if (!online || (Math.abs(aa - lastAimSent) > 0.02 && performance.now() - lastAimSentAt > 66)) {
                lastAimSent = aa; lastAimSentAt = performance.now();
                submitAction({ type: "aim", a: aa });
            }
        }
    }
    function onBoardDown(e) {
        const ds = curState();
        if (!ds) return;
        e.preventDefault();
        if (e.button === 2) { submitAction({ type: "special" }); return; }
        if (ds.phase !== "battle") return;
        boardFireId = e.pointerId;
        setInp("f", true);
    }
    function onCtx(e) { e.preventDefault(); }
    function onRootDown(e) {
        const b = e.target.closest("[data-k]");
        if (!b) return;
        e.preventDefault();
        const k = b.dataset.k;
        if (k === "s") { submitAction({ type: "special" }); return; }
        try { b.setPointerCapture(e.pointerId); } catch (err) { }
        touchPts.set(e.pointerId, k);
        setInp(k, true);
    }
    function onWinUp(e) {
        if (touchPts.has(e.pointerId)) {
            const k = touchPts.get(e.pointerId);
            touchPts.delete(e.pointerId);
            if (k !== "s") setInp(k, false);
            return;
        }
        if (e.pointerId === boardFireId) { boardFireId = null; setInp("f", false); }
    }
    function onBlur() { resetInp(); }
    function handleClick(e) {
        if (e.target.closest("[data-exit]")) { onExit(); return; }
        const sh = e.target.closest("[data-ship]");
        if (sh) { submitAction({ type: "pick", ship: sh.dataset.ship }); renderNow(); return; }
        const ch = e.target.closest("[data-cheat]");
        if (ch) { submitAction({ type: "cheat", id: ch.dataset.cheat }); renderNow(); return; }
        const b = e.target.closest("[data-act]");
        if (!b) return;
        const a = b.dataset.act;
        if (a === "help") showHelp = true;
        else if (a === "closehelp") showHelp = false;
        else if (a === "cheat") { if (!online) showCheat = true; }
        else if (a === "closecheat") showCheat = false;
        else if (a === "pause") { if (!online) paused = !paused; }
        else if (a === "restart") submitAction({ type: online ? "lobby" : "retry" });
        else if (a === "start") submitAction({ type: "start" });
        else if (a === "next") submitAction({ type: "next" });
        else if (a === "retry") submitAction({ type: "retry" });
        else if (a === "rematch") submitAction({ type: "rematch" });
        else if (a === "lobby") submitAction({ type: "lobby" });
        renderNow();
    }

    /* ---------- frame loop ---------- */
    function frame(t) {
        raf = requestAnimationFrame(frame);
        if (!lastT) lastT = t;
        const dt = Math.min(0.05, (t - lastT) / 1000);
        lastT = t; T += dt;
        if (isHost) {
            if (state) {
                const prev = state.phase;
                const frozen = !online && (paused || showHelp || showCheat);
                if (!frozen) stepWorld(state, inputs, dt, rngBattle);
                if (prev !== "over" && state.phase === "over") saveBest();
                render(state);
                if (online && t - lastPub > 120 && (state.phase === "sailing" || state.phase === "battle")) { lastPub = t; publish(); }
            } else render(null);
        } else render(guestView());
    }

    /* ---------- boot ---------- */
    renderStatic();
    root.addEventListener("click", handleClick);
    root.addEventListener("pointerdown", onRootDown);
    root.addEventListener("pointercancel", onWinUp);
    svgEl.addEventListener("pointermove", onBoardMove);
    svgEl.addEventListener("pointerdown", onBoardDown);
    svgEl.addEventListener("contextmenu", onCtx);
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("keyup", onKeyUp);
    window.addEventListener("pointerup", onWinUp);
    window.addEventListener("blur", onBlur);

    if (online) {
        if (room.onRoom) unsubs.push(room.onRoom(function (next) { roomData = next; renderNow(); }));
        if (isHost) {
            state = newDuelState(playerName);
            render(state);
            publish();
            if (room.onAction) unsubs.push(room.onAction(function (action) { applyAction(action, 1); }));
        } else {
            if (room.onState) unsubs.push(room.onState(function (next) { netState = next; netAt = performance.now(); }));
            submitAction({ type: "hello", name: playerName });
            render(null);
        }
    } else {
        state = newSoloState(playerName);
        state.best = loadBest();
        render(state);
    }
    raf = requestAnimationFrame(frame);

    return {
        destroy() {
            if (raf) cancelAnimationFrame(raf);
            raf = null;
            root.removeEventListener("click", handleClick);
            root.removeEventListener("pointerdown", onRootDown);
            root.removeEventListener("pointercancel", onWinUp);
            svgEl.removeEventListener("pointermove", onBoardMove);
            svgEl.removeEventListener("pointerdown", onBoardDown);
            svgEl.removeEventListener("contextmenu", onCtx);
            document.removeEventListener("keydown", onKeyDown);
            document.removeEventListener("keyup", onKeyUp);
            window.removeEventListener("pointerup", onWinUp);
            window.removeEventListener("blur", onBlur);
            for (const u of unsubs) { if (typeof u === "function") { try { u(); } catch (e) { } } }
            posCache.clear(); touchPts.clear();
            state = null; netState = null;
        },
    };
}

/* exposed for unit tests / tooling */
export const LOGIC = {
    W, H, WATER, GRAV, SEA_W, SAIL_DUR, SHIPS, ENEMY, CHEATS,
    rng, clamp, aimClamp, effDamage, canHit, bandDir, shellStep, torpedoStep,
    generateWave, rollFirst, rollSides, fullPlayer, newSoloState, newDuelState,
    beginWave, beginDuel, startBattle, doSpecial, firePrimary, stepWorld,
};