/*
  war-of-survivors.js
  - Hasil konversi ke template baru (export META + mount).
  - id META harus sama dengan nama file tanpa .js.
  - Setelah edit: node tools/build-games-manifest.mjs
*/

export const META = {
    id: "war-of-survivors",
    name: "War of Survivors",
    category: "simulation",
    catLabel: "Simulation",
    desc: "Give each survivor one simple action per day, then end the day. Survive the raids until the ceasefire.",
    art: '<svg viewBox="0 0 48 48" width="54" height="54" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 24l8-8 7 6 6-11 9 10 6-4"/><path d="M10 24v18h28V24"/><path d="M24 42v-9h6v9"/><path d="M16 42v-6"/><path d="M16 30c-2 2.6-2 4.8 0 6.3 2-1.5 2-3.7 0-6.3z"/></svg>',
    bg: ["#94a3b8", "#334155"],
    bestKey: "warOfSurvivorsBest",
};

/* ================= pure rules layer (seeded, testable) ================= */

const CAP = 30;
const BOARD_COST = 4;      // wood per board
const BOARD_DEF = 12;      // defense per board
const MAX_BOARDS = 3;
const HUNGER_DAY = 34;     // hunger gained each dawn
const EAT_AT = 35;         // auto-eat threshold at dawn
const EAT_BASE = 45;       // hunger removed by one food
const EAT_CHEF = 60;       // Marko gets more from a meal
const EXH = 80;            // exhausted threshold
const EXH_DRAIN = 8;       // hp lost per dawn while exhausted
const HEAL_AMT = 35;
const FAT = { rest: -55, scavenge: 35, guard: 25, board: 20, heal: 10 };
const ACTS = ["rest", "scavenge", "guard", "board", "heal"];
const ACT_META = {
    rest: { label: "Rest", icon: "😴", hint: "fatigue -55" },
    scavenge: { label: "Scavenge", icon: "🎒", hint: "loot, some risk" },
    guard: { label: "Guard", icon: "🛡", hint: "defend tonight" },
    board: { label: "Board Up", icon: "🔨", hint: "4 wood, +12 def" },
    heal: { label: "Heal", icon: "💊", hint: "1 med, +35 hp" },
};
const ZONES = {
    ruins: { label: "Ruins", risk: 0.10, hint: "wood + a little food", loot: [{ res: "wood", min: 2, max: 4, w: 1 }, { res: "food", min: 0, max: 1, w: 0.7 }] },
    market: { label: "Market", risk: 0.30, hint: "food + some meds", loot: [{ res: "food", min: 2, max: 4, w: 1 }, { res: "meds", min: 0, max: 1, w: 0.5 }] },
    clinic: { label: "Clinic", risk: 0.50, hint: "meds + scraps", loot: [{ res: "meds", min: 1, max: 2, w: 1 }, { res: "food", min: 0, max: 1, w: 0.7 }, { res: "wood", min: 0, max: 1, w: 0.4 }] },
};
const ZONE_ORDER = ["ruins", "market", "clinic"];
const AREAS = ["Grey District", "Old Town", "Riverside", "Northgate", "Cinder Row"];
const SURVIVORS = [
    { id: "marko", name: "Marko", trait: "Chef", traitText: "meals restore +15 more hunger" },
    { id: "katia", name: "Katia", trait: "Careful", traitText: "+50% loot, -10% risk" },
    { id: "boris", name: "Boris", trait: "Tough", traitText: "-30% injuries, strong guard" },
];

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

/* Deterministic mulberry32 generator. */
function rng(seed) {
    let a = seed >>> 0 || 1;
    return function () {
        a |= 0; a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
const h32 = (s, d, k) => (Math.imul(s, 2654435761) ^ Math.imul(d, 97) ^ k) >>> 0;

/* Random level: campaign length, start supplies, raid schedule, loot boost. */
function genLevel(seed) {
    const r = rng(seed);
    const days = 9 + Math.floor(r() * 4); // 9-12 days
    const start = {
        food: 5 + Math.floor(r() * 4),
        wood: 7 + Math.floor(r() * 5),
        meds: 1 + Math.floor(r() * 2),
    };
    const raids = {};
    const n = Math.max(2, Math.floor(days / 3));
    let d = 2 + Math.floor(r() * 2);
    for (let i = 0; i < n; i++) {
        if (d > days) break;
        raids[d] = 18 + Math.round(d * 3.5) + Math.floor(r() * 7);
        d += 2 + Math.floor(r() * 2);
    }
    raids[days] = Math.max(raids[days] || 0, 22 + Math.round(days * 3.5)); // finale raid
    const boost = ZONE_ORDER[Math.floor(r() * 3)];
    const name = AREAS[Math.floor(r() * AREAS.length)];
    return { seed, days, start, raids, boost, name };
}

function makeParty(seed) {
    const r = rng(h32(seed, 0, 0xbeef));
    return SURVIVORS.map((s) => ({
        id: s.id, name: s.name, trait: s.trait, traitText: s.traitText,
        hp: 90 + Math.floor(r() * 11),
        hunger: 20 + Math.floor(r() * 16),
        fatigue: 15 + Math.floor(r() * 21),
        alive: true, deathDay: 0,
        action: { type: "rest", zone: null },
    }));
}

const raidOn = (level, day) => level.raids[day] || 0;
const guardPower = (p) => (p.trait === "Tough" ? 40 : 26) * (p.fatigue >= EXH ? 0.5 : 1);
const turnToken = (st) => st.seats[(st.day - 1) % st.seats.length];

function estimateDefense(st) {
    let def = st.security * BOARD_DEF;
    for (const p of st.party)
        if (p.alive && p.action.type === "guard") def += guardPower(p);
    return def;
}

function lootSalt(zone, pid) {
    return 10 + ZONE_ORDER.indexOf(zone) * 16 + pid.charCodeAt(0);
}
function rollLoot(st, p, r) {
    const zone = p.action.zone || "market";
    const z = ZONES[zone];
    const out = {};
    z.loot.forEach((e, i) => {
        if (r() >= e.w) return;
        const mx = e.max + (st.level.boost === zone && i === 0 ? 1 : 0);
        out[e.res] = (out[e.res] || 0) + e.min + Math.floor(r() * (mx - e.min + 1));
    });
    if (p.trait === "Careful") for (const k of Object.keys(out)) out[k] = Math.ceil(out[k] * 1.5);
    if (p.fatigue >= EXH) for (const k of Object.keys(out)) out[k] = Math.round(out[k] * 0.5);
    return out;
}
function hurt(p, amt, day, god) {
    p.hp = clamp(p.hp - amt, god ? 1 : 0, 100);
    if (p.hp <= 0 && !god) { p.alive = false; p.deathDay = day; return true; }
    return false;
}

/* Resolve one full day. Pure: clones state, returns { next, report, gain }. */
function resolveDay(st, opts) {
    const god = !!(opts && opts.god);
    const next = JSON.parse(JSON.stringify(st));
    const day = next.day, seed = next.seed;
    const cmd = turnToken(next);
    const rep = [];
    let gain = 0;
    const scav = new Set();

    /* 1) day actions, in party order */
    for (const p of next.party) {
        if (!p.alive) continue;
        const t = p.action.type;
        if (t === "board") {
            if (next.security < MAX_BOARDS && next.inv.wood >= BOARD_COST) {
                next.inv.wood -= BOARD_COST; next.security++; gain += 6;
                rep.push("🔨 " + p.name + " boarded a window (+" + BOARD_DEF + " def).");
            } else {
                p.action = { type: "rest", zone: null };
                rep.push("😐 " + p.name + " could not board up and rested instead.");
            }
        } else if (t === "heal") {
            if (next.inv.meds >= 1) {
                next.inv.meds--; p.hp = clamp(p.hp + HEAL_AMT, 0, 100); gain += 7;
                rep.push("💊 " + p.name + " patched up (+" + HEAL_AMT + " hp).");
            } else {
                p.action = { type: "rest", zone: null };
                rep.push("😐 " + p.name + " had no meds and rested instead.");
            }
        } else if (t === "scavenge") {
            const zone = p.action.zone || "market";
            const rL = rng(h32(seed, day, lootSalt(zone, p.id)));
            let loot = rollLoot(next, p, rL);
            scav.add(p.id);
            const risk = Math.max(0, ZONES[zone].risk - (p.trait === "Careful" ? 0.1 : 0));
            if (rL() < risk) {
                let inj = 14 + Math.floor(rL() * 17);
                if (p.trait === "Tough") inj = Math.round(inj * 0.7);
                for (const k of Object.keys(loot)) loot[k] = Math.round(loot[k] * 0.5);
                const died = hurt(p, inj, day, god);
                rep.push("🩸 " + p.name + " was hurt at the " + ZONES[zone].label + " (-" + inj + " hp, half loot).");
                if (died) { rep.push("💀 " + p.name + " did not make it home."); loot = {}; }
            }
            const stored = [];
            for (const k of Object.keys(loot)) {
                if (loot[k] <= 0) continue;
                const before = next.inv[k];
                next.inv[k] = Math.min(CAP, before + loot[k]);
                const got = next.inv[k] - before;
                if (got > 0) { stored.push(got + " " + k); gain += got * 2; }
            }
            rep.push("🎒 " + p.name + " → " + ZONES[zone].label + ": " + (stored.join(", ") || "empty-handed") + ".");
        }
    }

    /* 2) raid tonight */
    const raid = raidOn(next.level, day);
    if (raid) {
        const guards = next.party.filter((p) => p.alive && !scav.has(p.id) && p.action.type === "guard");
        const defense = next.security * BOARD_DEF + guards.reduce((s, g) => s + guardPower(g), 0);
        const rR = rng(h32(seed, day, 77));
        if (defense >= raid) {
            gain += 15;
            rep.push("🛡 Raiders hit the house and were repelled (" + defense + " vs " + raid + ").");
        } else {
            const home = next.party.filter((p) => p.alive && !scav.has(p.id));
            const pct = home.length ? 25 + Math.floor(rR() * 16) : 40 + Math.floor(rR() * 16);
            for (const k of Object.keys(next.inv)) next.inv[k] -= Math.round((next.inv[k] * pct) / 100);
            next.security = Math.max(0, next.security - 1);
            let extra = "";
            if (home.length) {
                const v = home[Math.floor(rR() * home.length)];
                let inj = 12 + Math.floor(rR() * 11);
                if (v.trait === "Tough") inj = Math.round(inj * 0.7);
                const died = hurt(v, inj, day, god);
                extra = " " + v.name + " was hurt (-" + inj + " hp)." + (died ? " 💀 " + v.name + " died defending the house." : "");
            }
            rep.push("🔥 Raiders broke in (" + defense + " vs " + raid + "): -" + pct + "% supplies, boards torn." + extra);
        }
    } else {
        rep.push("🌙 A quiet night passed.");
    }

    /* 3) dawn: fatigue, hunger, auto-eat, attrition */
    let alive = next.party.filter((p) => p.alive);
    for (const p of alive) {
        p.fatigue = clamp(p.fatigue + (FAT[p.action.type] != null ? FAT[p.action.type] : -55), 0, 100);
        p.hunger = clamp(p.hunger + HUNGER_DAY, 0, 100);
    }
    let ate = 0;
    const eaters = alive.slice().sort((a, b) => b.hunger - a.hunger);
    for (const p of eaters) {
        if (p.hunger >= EAT_AT && next.inv.food > 0) {
            next.inv.food--; ate++;
            p.hunger = clamp(p.hunger - (p.trait === "Chef" ? EAT_CHEF : EAT_BASE), 0, 100);
        }
    }
    if (ate) rep.push("🍽 The team ate " + ate + " food at dawn.");
    for (const p of alive) {
        if (p.hunger >= 100) { if (hurt(p, 20, day, god)) rep.push("💀 " + p.name + " starved."); else rep.push("⚠ " + p.name + " is starving (-20 hp)."); }
        else if (p.hunger >= 80) { if (hurt(p, 10, day, god)) rep.push("💀 " + p.name + " starved."); else rep.push("⚠ " + p.name + " is going hungry (-10 hp)."); }
        if (p.alive && p.fatigue >= EXH) {
            if (hurt(p, EXH_DRAIN, day, god)) rep.push("💀 " + p.name + " collapsed from exhaustion.");
            else rep.push("⚠ " + p.name + " is exhausted (-" + EXH_DRAIN + " hp).");
        }
    }
    alive = next.party.filter((p) => p.alive);
    next.day++;
    if (!alive.length) next.phase = "lost";
    else if (next.day > next.level.days) next.phase = "won";
    next.scores[cmd] = (next.scores[cmd] || 0) + gain;
    next.report = rep;
    return { next, report: rep, gain };
}

/* Reference policy — also used by the bot and by the solvability check. */
function planFor(st, r) {
    const plan = {};
    const alive = st.party.filter((p) => p.alive);
    const raid = raidOn(st.level, st.day);
    const soon = raidOn(st.level, st.day) || raidOn(st.level, st.day + 1) ? 1 : 0;
    let meds = st.inv.meds, wood = st.inv.wood, boards = st.security;
    const guards = [];
    const wounded = alive.some((p) => p.hp < 60);
    const pickZone = () => {
        if (st.inv.food < alive.length * 2) return "market";
        if (wounded && st.inv.meds < 1) return "clinic";
        if (st.inv.wood < BOARD_COST) return "ruins";
        const v = r();
        return v < 0.5 ? "market" : v < 0.8 ? "ruins" : "clinic";
    };
    alive.forEach((p, i) => {
        let a;
        if (p.hp <= 40 && meds > 0) { meds--; a = { type: "heal", zone: null }; }
        else if (p.fatigue >= 72) a = { type: "rest", zone: null };
        else if (soon && boards < MAX_BOARDS && wood >= BOARD_COST + 2 && p.trait !== "Tough") { wood -= BOARD_COST; boards++; a = { type: "board", zone: null }; }
        else if (raid && !guards.length && (p.trait === "Tough" || alive.length <= 2 || i === alive.length - 1)) { guards.push(p); a = { type: "guard", zone: null }; }
        else if (p.fatigue >= 55) a = { type: "rest", zone: null };
        else a = { type: "scavenge", zone: pickZone() };
        plan[p.id] = a;
    });
    const defense = () => boards * BOARD_DEF + guards.reduce((s, g) => s + guardPower(g), 0);
    if (raid && defense() < raid) {
        const c = alive.filter((p) => plan[p.id].type === "scavenge" || plan[p.id].type === "rest").sort((a, b) => guardPower(b) - guardPower(a));
        if (c.length) { plan[c[0].id] = { type: "guard", zone: null }; guards.push(c[0]); }
    }
    if (raid && defense() < raid && boards < MAX_BOARDS && st.inv.wood >= BOARD_COST) {
        const c = alive.find((p) => plan[p.id].type === "scavenge");
        if (c) { plan[c.id] = { type: "board", zone: null }; boards++; }
    }
    if (st.inv.food < alive.length * 1.5 && !Object.values(plan).some((a) => a.type === "scavenge")) {
        const c = alive.filter((p) => plan[p.id].type !== "heal").sort((a, b) => a.fatigue - b.fatigue);
        if (c.length) plan[c[0].id] = { type: "scavenge", zone: "market" };
    }
    return plan;
}

function stateFor(level, seats) {
    const scores = {};
    seats.forEach((s) => (scores[s] = 0));
    return {
        v: 1, seed: level.seed, level, day: 1, phase: "play",
        party: makeParty(level.seed),
        inv: { food: level.start.food, wood: level.start.wood, meds: level.start.meds },
        security: 0, seats: seats.slice(), scores,
        cheats: { god: false, used: false },
        report: [], log: [],
    };
}
function applyPlan(st, plan) {
    for (const p of st.party)
        if (p.alive && plan[p.id]) p.action = { type: plan[p.id].type, zone: plan[p.id].zone || null };
    return st;
}
function simPolicy(level, attempt) {
    let st = stateFor(level, ["human"]);
    const r = rng(h32(level.seed, attempt, 13));
    while (st.phase === "play") {
        st = applyPlan(st, planFor(st, r));
        st = resolveDay(st).next;
    }
    return st;
}
/* A level is accepted only if the reference policy can beat it. */
function verifyLevel(level) {
    for (let a = 0; a < 6; a++) if (simPolicy(level, a).phase === "won") return true;
    return false;
}
function newGame(seed, seats) {
    const level = genLevel(seed);
    let bumps = 0;
    while (!verifyLevel(level) && bumps < 4) {
        bumps++;
        level.start.food += 2; level.start.wood += 2; level.start.meds += 1;
        if (level.raids[level.days]) level.raids[level.days] -= 3;
    }
    level.verified = true;
    return stateFor(level, seats);
}

/* ================= mount: UI + modes + input ================= */

export function mount(root, context = {}) {
    const { mode = "ai", room = null, playerName = "Player", onExit = () => { } } = context;
    const online = mode === "room" && Boolean(room);
    const playerIndex = online && !room.isHost ? 1 : 0;
    let roomData = room?.room || null;
    let state = null;

    let destroyed = false;
    let matchMode = online ? "online" : mode === "ai" ? "bot" : "solo";
    let selected = "marko";
    let lastZone = "market";
    let botTimer = null;
    let best = 0;
    try { best = parseInt(localStorage.getItem(META.bestKey) || "0", 10) || 0; } catch (e) { }
    let helpSeen = false;
    try { helpSeen = localStorage.getItem("wosHelpSeen") === "1"; } catch (e) { }
    const ui = { help: !helpSeen, cheat: false, vpad: false };

    const myToken = () => (online ? (room.isHost ? "host" : "guest") : "human");
    const seatLabel = (t) => ({ human: "You", bot: "Bot", host: "Host", guest: "Guest" }[t] || t);
    const myTurn = () => !!state && state.phase === "play" && turnToken(state) === myToken();
    const authority = () => (online ? room.isHost : true);
    const living = () => (state ? state.party.filter((p) => p.alive) : []);
    const randomSeed = () => ((Math.random() * 0x7fffffff) | 0) >>> 0 || 1;

    /* ---------- skeleton ---------- */
    root.innerHTML = `
<style>
.wos{--bg:#0f1317;--panel:#151a21;--line:#242c37;--ink:#e7eaee;--mut:#8b95a3;--acc:#7fb0ff;--ok:#6fd08c;--warn:#e8b45a;--bad:#e46a6a;color:var(--ink);max-width:920px;margin:0 auto;padding:8px 10px;box-sizing:border-box;font-size:13px}
.wos *{box-sizing:border-box}
.wos .game-intro{display:flex;justify-content:space-between;align-items:flex-start;gap:10px;margin-bottom:6px}
.wos .game-intro h2{margin:0;font-size:16px;font-weight:700;letter-spacing:.2px}
.wos .game-intro p{margin:2px 0 0;font-size:11.5px;color:var(--mut)}
.wos .game-status{display:inline-flex;align-items:center;gap:6px;font-size:11px;color:var(--mut);border:1px solid var(--line);border-radius:99px;padding:4px 10px;white-space:nowrap}
.wos .game-status-dot{width:7px;height:7px;border-radius:99px;background:var(--ok);display:inline-block}
.wos-bar-top{display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin:0 0 8px}
.wos-btn{background:var(--panel);border:1px solid var(--line);color:var(--ink);border-radius:8px;padding:6px 10px;font:inherit;font-size:11.5px;cursor:pointer}
.wos-btn:hover:not(:disabled){border-color:var(--acc)}
.wos-btn.on{border-color:var(--acc);color:var(--acc)}
.wos-btn:disabled{opacity:.35;cursor:default}
.wos-spacer{flex:1}
.wos-board{position:relative;display:flex;flex-direction:column;gap:8px}
.wos-sec{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:10px 12px}
.wos-step{font-size:9.5px;letter-spacing:.14em;text-transform:uppercase;color:var(--mut);margin:0 0 8px;font-weight:700}
.wos-cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:8px}
.wos-card{border:1px solid var(--line);border-radius:10px;padding:8px 9px;cursor:pointer;background:#12171e}
.wos-card:hover{border-color:#334052}
.wos-card.sel{border-color:var(--acc)}
.wos-card.dead{opacity:.45;cursor:default}
.wos-cname{display:flex;justify-content:space-between;align-items:baseline;gap:6px}
.wos-cname b{font-size:12.5px}
.wos-trait{font-size:9.5px;color:var(--acc);font-weight:700}
.wos-tags{display:flex;gap:4px;flex-wrap:wrap;min-height:14px;margin:3px 0 5px}
.wos-tag{font-size:8.5px;font-weight:700;padding:1px 6px;border-radius:99px;background:#ffffff10;color:var(--mut)}
.wos-tag.warn{background:#3a2c10;color:var(--warn)}
.wos-tag.bad{background:#3d1518;color:var(--bad)}
.wos-g{display:flex;align-items:center;gap:5px;font-size:8px;color:var(--mut);font-weight:700;margin:2px 0}
.wos-g .lbl{width:24px;flex:none}
.wos-g .val{width:18px;flex:none;text-align:right;color:var(--ink)}
.wos-track{flex:1;height:4px;border-radius:99px;background:#0b0f13;overflow:hidden}
.wos-track i{display:block;height:100%}
.wos-act-pill{margin-top:5px;font-size:10.5px;color:var(--ink);font-weight:600;min-height:13px}
.wos-scene{border:1px solid var(--line);border-radius:10px;overflow:hidden;margin-bottom:8px}
.wos-scene svg{display:block;width:100%;height:auto}
.wos-fore{font-size:11.5px;border:1px solid var(--line);border-radius:8px;padding:6px 9px;margin-bottom:8px;color:var(--mut)}
.wos-fore.ok{border-color:#2c4a33;color:var(--ok)}
.wos-fore.bad{border-color:#57262a;color:var(--bad)}
.wos-turn{font-size:11.5px;color:var(--mut);margin-bottom:8px}
.wos-turn b{color:var(--ink)}
.wos-acts{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:6px}
.wos-act{flex:1 1 90px;text-align:left;background:#12171e;border:1px solid var(--line);color:var(--ink);border-radius:9px;padding:6px 8px;font:inherit;font-size:11.5px;font-weight:600;cursor:pointer}
.wos-act small{display:block;font-size:8.5px;color:var(--mut);font-weight:500;margin-top:1px}
.wos-act:hover:not(:disabled){border-color:var(--acc)}
.wos-act.on{border-color:var(--acc);background:#1a2333}
.wos-act:disabled{opacity:.35;cursor:default}
.wos-zones{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px}
.wos-zone{flex:1 1 110px;display:flex;justify-content:space-between;gap:6px;align-items:center;background:#12171e;border:1px solid var(--line);color:var(--ink);border-radius:9px;padding:6px 9px;font:inherit;font-size:11px;font-weight:600;cursor:pointer;text-align:left}
.wos-zone small{display:block;font-size:8.5px;color:var(--mut);font-weight:500}
.wos-zone.on{border-color:var(--acc);background:#1a2333}
.wos-zone:disabled{opacity:.35;cursor:default}
.wos-go{width:100%;background:var(--acc);color:#0b1220;border:none;border-radius:10px;padding:10px;font:inherit;font-size:13px;font-weight:700;cursor:pointer}
.wos-go:disabled{opacity:.35;cursor:default}
.wos-report{list-style:none;margin:8px 0 0;padding:0;font-size:11px;color:var(--mut);line-height:1.6}
.wos-check{list-style:none;margin:0;padding:0}
.wos-check li{display:flex;gap:8px;font-size:11.5px;color:var(--mut);line-height:1.7}
.wos-check li.done{color:var(--ok)}
.wos-check .mk{flex:none;width:14px}
.wos-hud{display:flex;gap:6px;flex-wrap:wrap}
.wos-chip{border:1px solid var(--line);border-radius:8px;padding:4px 8px;font-size:10.5px;color:var(--mut);background:#12171e}
.wos-chip b{color:var(--ink)}
.wos-chip.hot b{color:var(--warn)}
.wos-chip.cheat{border-color:#57262a;color:var(--bad)}
.wos-vpad{position:sticky;bottom:6px;display:grid;grid-template-columns:repeat(8,1fr);gap:6px;background:#12171ef2;border:1px solid var(--line);border-radius:12px;padding:8px;z-index:4}
.wos-vpad button{min-height:42px;background:#151c26;border:1px solid var(--line);color:var(--ink);border-radius:9px;font:inherit;font-size:12px;font-weight:700;cursor:pointer}
.wos-vpad button:disabled{opacity:.35}
.wos-vpad .end{background:var(--acc);color:#0b1220;border:none}
.wos-ov{position:absolute;inset:0;background:#0b0f13d9;display:flex;align-items:flex-start;justify-content:center;padding:16px;z-index:6}
.wos-ovcard{max-width:540px;width:100%;max-height:80vh;overflow:auto;background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:16px}
.wos-ovcard h3{margin:0 0 8px;font-size:15px}
.wos-ovcard p,.wos-ovcard li{font-size:12px;color:var(--mut);line-height:1.6}
.wos-ovcard table{width:100%;border-collapse:collapse;font-size:11.5px;margin:6px 0}
.wos-ovcard td{padding:3px 5px;border-bottom:1px solid var(--line);color:var(--mut)}
.wos-ovcard td:first-child{color:var(--ink);white-space:nowrap}
.wos-ovrow{display:flex;gap:6px;flex-wrap:wrap;margin-top:10px}
.wos-cheatgrid{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-top:8px}
.wos-seed{display:flex;gap:6px;margin-top:8px}
.wos-seed input{flex:1;background:#0b0f13;border:1px solid var(--line);color:var(--ink);border-radius:8px;padding:6px 8px;font:inherit;font-size:12px}
.wos-note{font-size:10.5px;color:var(--mut);margin-top:8px}
.wos .game-actions{margin-top:8px}
@media (max-width:640px){
  .wos-vpad{grid-template-columns:repeat(4,1fr)}
  .wos-cards{grid-template-columns:1fr 1fr}
}
</style>
<div class="game-app wos">
  <div class="game-intro">
    <div><h2>War of Survivors</h2><p data-sub>Keep three civilians alive until the ceasefire.</p></div>
    <span class="game-status"><i class="game-status-dot"></i><span data-status>Ready</span></span>
  </div>
  <div class="wos-bar-top">
    <button class="wos-btn" type="button" data-act="mode-solo" data-mode>Solo</button>
    <button class="wos-btn" type="button" data-act="mode-bot" data-mode>VS Bot</button>
    <span class="wos-spacer"></span>
    <button class="wos-btn" type="button" data-ui="help">How to play</button>
    <button class="wos-btn" type="button" data-ui="cheat">Cheats</button>
    <button class="wos-btn" type="button" data-ui="vpad" data-vpadbtn>🎮 Pad</button>
    <button class="wos-btn" type="button" data-act="new" data-new>🎲 New level</button>
  </div>
  <section class="game-panel wos-board" data-board></section>
  <div class="game-actions"><button class="game-action-button" type="button" data-exit>Exit game</button></div>
</div>`;

    const board = root.querySelector("[data-board]");
    const statusEl = root.querySelector("[data-status]");
    const subEl = root.querySelector("[data-sub]");

    /* ---------- small render helpers ---------- */
    const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    function gauge(lbl, v, color) {
        return `<span class="wos-g"><span class="lbl">${lbl}</span><span class="wos-track"><i style="width:${Math.round(v)}%;background:${color}"></i></span><span class="val">${Math.round(v)}</span></span>`;
    }
    function tagsOf(p) {
        if (!p.alive) return '<span class="wos-tag bad">Fallen</span>';
        const t = [];
        if (p.hp <= 40) t.push(["Wounded", "bad"]);
        if (p.hunger >= 80) t.push(["Starving", "bad"]);
        else if (p.hunger >= 55) t.push(["Hungry", "warn"]);
        if (p.fatigue >= EXH) t.push(["Exhausted", "bad"]);
        else if (p.fatigue >= 55) t.push(["Tired", "warn"]);
        if (!t.length) t.push(["Steady", ""]);
        return t.map(([x, c]) => `<span class="wos-tag ${c}">${x}</span>`).join("");
    }
    function actionText(p) {
        if (!p.alive) return "Fallen on day " + p.deathDay;
        const a = p.action;
        if (a.type === "scavenge") return "🎒 " + ZONES[a.zone || "market"].label;
        return ACT_META[a.type].icon + " " + ACT_META[a.type].label;
    }
    function sceneSVG(st) {
        const raid = raidOn(st.level, st.day);
        const sky = raid ? "#10141d" : "#141a26";
        const guards = living().filter((p) => p.action.type === "guard");
        const scavs = living().filter((p) => p.action.type === "scavenge");
        let s = `<svg viewBox="0 0 320 110" role="img" aria-label="Shelter at night">`;
        s += `<rect width="320" height="110" fill="${sky}"/>`;
        s += `<circle cx="290" cy="18" r="7" fill="#e8eaee"/><circle cx="287" cy="15" r="6" fill="${sky}"/>`;
        s += `<circle cx="40" cy="16" r="1" fill="#cbd5e1" opacity=".5"/><circle cx="120" cy="10" r="1" fill="#cbd5e1" opacity=".4"/><circle cx="210" cy="14" r="1" fill="#cbd5e1" opacity=".5"/>`;
        s += `<rect y="88" width="320" height="22" fill="#1b2230"/>`;
        s += `<rect x="70" y="46" width="180" height="42" fill="#232c3d" stroke="#3a465c" stroke-width="1.5"/>`;
        s += `<polyline points="62,50 110,26 160,40 205,22 258,50" fill="none" stroke="#4a5a74" stroke-width="3" stroke-linejoin="round"/>`;
        s += `<rect x="150" y="64" width="18" height="24" fill="#0d1118" stroke="#3a465c"/>`;
        for (const wx of [88, 214]) {
            s += `<rect x="${wx}" y="56" width="26" height="16" fill="${raid ? "#f59e0b" : "#7fb0ff"}" fill-opacity=".12" stroke="#3a465c"/>`;
            for (let i = 0; i < st.security; i++) s += `<rect x="${wx - 1}" y="${58 + i * 5}" width="28" height="3" rx="1" fill="#8a5a2b"/>`;
        }
        if (guards.length) s += `<circle cx="143" cy="84" r="3.5" fill="#7fb0ff"/><text x="143" y="79" font-size="7" text-anchor="middle" fill="#7fb0ff">guard</text>`;
        scavs.forEach((p, i) => {
            s += `<circle cx="${272 + i * 15}" cy="84" r="3.5" fill="#e8b45a"/><text x="${272 + i * 15}" y="79" font-size="7" text-anchor="middle" fill="#e8b45a">${(p.action.zone || "market")[0].toUpperCase()}</text>`;
        });
        if (raid) s += `<circle cx="18" cy="84" r="3.5" fill="#e46a6a"/><circle cx="30" cy="84" r="3.5" fill="#e46a6a"/><circle cx="42" cy="84" r="3.5" fill="#e46a6a"/><text x="30" y="79" font-size="7" text-anchor="middle" fill="#e46a6a">raid</text>`;
        return s + "</svg>";
    }
    function checklist(st) {
        const alive = living();
        const raid = raidOn(st.level, st.day);
        const def = estimateDefense(st);
        const items = [];
        if (raid) items.push({ done: def >= raid, text: `Tonight's raid ~${raid} vs your defense ${def}. ${def >= raid ? "You can hold." : "Add a Guard or Board Up!"}` });
        else items.push({ done: true, text: "Quiet night - a good time to scavenge." });
        const eaters = alive.filter((p) => p.hunger + HUNGER_DAY >= EAT_AT).length;
        items.push({ done: st.inv.food >= eaters, text: `Morning meals: ${st.inv.food} food for ${eaters} eaters.` });
        const tired = alive.filter((p) => p.fatigue >= EXH);
        if (tired.length) items.push({ done: tired.every((p) => p.action.type === "rest"), text: `Exhausted: ${tired.map((p) => p.name).join(", ")} - let them Rest.` });
        const hurtL = alive.filter((p) => p.hp <= 40);
        if (hurtL.length && st.inv.meds > 0) items.push({ done: hurtL.every((p) => p.action.type === "heal"), text: `Wounded: ${hurtL.map((p) => p.name).join(", ")} - Heal (1 med).` });
        if (!alive.some((p) => p.action.type === "scavenge") && st.inv.food < 8) items.push({ done: false, text: "Nobody is scavenging - supplies will run low." });
        return items.slice(0, 4);
    }

    /* ---------- board render ---------- */
    function buildBoard() {
        if (!state) return `<div class="wos-sec"><div class="wos-step">Multiplayer</div><p class="wos-turn">Waiting for the host to start the match...</p></div>`;
        const st = state;
        const turn = turnToken(st);
        const mine = myTurn();
        const raid = raidOn(st.level, st.day);
        const def = estimateDefense(st);
        let sel = st.party.find((p) => p.id === selected && p.alive) || living()[0] || null;
        if (sel) selected = sel.id;

        /* 01 — survivors */
        let h = `<div class="wos-sec"><div class="wos-step">01 · Survivors — tap to select, right-click to cycle action</div><div class="wos-cards">`;
        for (const p of st.party) {
            h += `<div class="wos-card${p.alive ? "" : " dead"}${sel && p.id === sel.id ? " sel" : ""}" data-surv="${p.id}" title="${esc(p.traitText)}">
        <div class="wos-cname"><b>${p.name}</b><span class="wos-trait">${p.trait}</span></div>
        <div class="wos-tags">${tagsOf(p)}</div>
        ${gauge("HP", p.hp, "var(--ok)")}
        ${gauge("HUN", p.hunger, "var(--bad)")}
        ${gauge("FAT", p.fatigue, "var(--warn)")}
        <div class="wos-act-pill">${actionText(p)}</div>
      </div>`;
        }
        h += `</div></div>`;

        /* 02 — gameplay */
        h += `<div class="wos-sec"><div class="wos-step">02 · Today — one action per survivor, then end the day</div>`;
        h += `<div class="wos-scene">${sceneSVG(st)}</div>`;
        h += raid
            ? `<div class="wos-fore ${def >= raid ? "ok" : "bad"}">🌙 Raid expected tonight (~${raid}) · your defense ${def} ${def >= raid ? "— you can hold the line." : "— too weak! Guard or Board Up."}</div>`
            : `<div class="wos-fore ok">🌙 Quiet night forecast — safe to send everyone out.</div>`;
        if (st.phase === "play") {
            h += mine
                ? `<div class="wos-turn"><b>Your command.</b> Assigning <b>${sel ? sel.name : ""}</b> — pick an action below.</div>`
                : `<div class="wos-turn">⏳ <b>${seatLabel(turn)}</b> is commanding day ${st.day}${turn === "bot" ? " — bot is thinking..." : " — waiting for their moves..."}</div>`;
        }
        if (sel) {
            h += `<div class="wos-acts">`;
            ACTS.forEach((a, i) => {
                const m = ACT_META[a];
                h += `<button type="button" class="wos-act${sel.action.type === a ? " on" : ""}" data-act="${a}" ${mine ? "" : "disabled"} title="Key ${i + 1}">${m.icon} ${m.label}<small>${i + 1} · ${m.hint}</small></button>`;
            });
            h += `</div><div class="wos-zones">`;
            for (const z of ZONE_ORDER) {
                const zo = ZONES[z];
                const on = sel.action.type === "scavenge" && (sel.action.zone || "market") === z;
                h += `<button type="button" class="wos-zone${on ? " on" : ""}" data-zone="${z}" ${mine ? "" : "disabled"}><span>${zo.label}<small>${zo.hint}${st.level.boost === z ? " · boosted" : ""}</small></span><span style="color:${zo.risk <= 0.1 ? "var(--ok)" : zo.risk <= 0.3 ? "var(--warn)" : "var(--bad)"}">${Math.round(zo.risk * 100)}%</span></button>`;
            }
            h += `</div>`;
        }
        h += `<button type="button" class="wos-go" data-act="end" ${mine ? "" : "disabled"}>End Day ${st.day} ⏎</button>`;
        if (st.report.length) {
            h += `<ul class="wos-report">` + st.report.map((l) => `<li>${esc(l)}</li>`).join("") + `</ul>`;
        }
        h += `</div>`;

        /* 03 — checklist */
        h += `<div class="wos-sec"><div class="wos-step">03 · Checklist — the house keeps score of your plan</div><ul class="wos-check">`;
        for (const it of checklist(st)) h += `<li class="${it.done ? "done" : ""}"><span class="mk">${it.done ? "✓" : "○"}</span><span>${esc(it.text)}</span></li>`;
        h += `</ul></div>`;

        /* 04 — HUD */
        const scores = st.seats.map((s) => `${seatLabel(s)} ${st.scores[s] || 0}`).join(" · ");
        h += `<div class="wos-sec"><div class="wos-step">04 · HUD</div><div class="wos-hud">
      <span class="wos-chip">Day <b>${Math.min(st.day, st.level.days)}/${st.level.days}</b></span>
      <span class="wos-chip">🍞 <b>${st.inv.food}</b></span>
      <span class="wos-chip">🪵 <b>${st.inv.wood}</b></span>
      <span class="wos-chip">💊 <b>${st.inv.meds}</b></span>
      <span class="wos-chip">🛡 <b>${def}</b> (${st.security}/${MAX_BOARDS} boards)</span>
      <span class="wos-chip">👥 <b>${living().length}/3</b></span>
      <span class="wos-chip hot">⭐ <b>${scores}</b></span>
      ${!online ? `<span class="wos-chip">🏆 Best <b>${best}</b></span>` : ""}
      <span class="wos-chip">🎲 <b>${st.seed}</b> · ${esc(st.level.name)}</span>
      <span class="wos-chip">P1 <b>${seatLabel(st.seats[0])}</b>${st.seats[1] ? ` · P2 <b>${seatLabel(st.seats[1])}</b>` : ""}</span>
      ${st.cheats.used ? `<span class="wos-chip cheat">CHEATS</span>` : ""}
    </div></div>`;

        /* virtual pad (mobile) */
        if (ui.vpad) {
            h += `<div class="wos-vpad">
        <button type="button" data-ui="prev" ${mine ? "" : "disabled"}>◀</button>
        <button type="button" data-act="rest" ${mine ? "" : "disabled"}>😴</button>
        <button type="button" data-act="scavenge" ${mine ? "" : "disabled"}>🎒</button>
        <button type="button" data-act="guard" ${mine ? "" : "disabled"}>🛡</button>
        <button type="button" data-act="board" ${mine ? "" : "disabled"}>🔨</button>
        <button type="button" data-act="heal" ${mine ? "" : "disabled"}>💊</button>
        <button type="button" data-ui="next" ${mine ? "" : "disabled"}>▶</button>
        <button type="button" class="end" data-act="end" ${mine ? "" : "disabled"}>⏎</button>
        <button type="button" data-zone="ruins" ${mine ? "" : "disabled"}>R</button>
        <button type="button" data-zone="market" ${mine ? "" : "disabled"}>M</button>
        <button type="button" data-zone="clinic" ${mine ? "" : "disabled"}>C</button>
        <button type="button" data-ui="help">?</button>
      </div>`;
        }

        /* overlays */
        if (ui.help) h += helpOverlay();
        if (ui.cheat) h += cheatOverlay(st);
        if (st.phase !== "play") h += endOverlay(st);
        return h;
    }

    function helpOverlay() {
        return `<div class="wos-ov"><div class="wos-ovcard">
      <h3>How to play</h3>
      <p>Survive until the ceasefire at dawn after the last day. Each day is one turn: give every survivor <b>one action</b>, then press <b>End Day</b>. Everything resolves at once — scavenging, the night raid, and dawn (everyone automatically eats 1 food if hungry).</p>
      <table>
        <tr><td>😴 Rest</td><td>fatigue -55. Exhausted survivors (80+) work at half effect and lose 8 hp each dawn.</td></tr>
        <tr><td>🎒 Scavenge</td><td>pick a zone: Ruins (safe, wood), Market (food), Clinic (meds, risky). Injuries cost hp and half the loot.</td></tr>
        <tr><td>🛡 Guard</td><td>adds 26 defense tonight (Boris 40). Raids are forecast — match their strength.</td></tr>
        <tr><td>🔨 Board Up</td><td>spends 4 wood for +12 permanent defense (max 3 boards). Breaches tear one board off.</td></tr>
        <tr><td>💊 Heal</td><td>spends 1 med, +35 hp to self.</td></tr>
      </table>
      <p><b>Traits:</b> Marko's meals restore more hunger · Katia hauls +50% loot with -10% risk · Boris takes -30% injury and guards best.</p>
      <p><b>Losing:</b> hunger 80+ or exhaustion drains hp every dawn. At 0 hp a survivor falls. If everyone falls, the run ends.</p>
      <p><b>Match modes:</b> Solo, or take turns commanding the same house against the Bot / a friend. A coin toss decides who commands day 1 and which seat (P1/P2) you get — random every match. Higher score (loot, boards, heals, repelled raids) wins the shift war.</p>
      <table>
        <tr><td>1–5</td><td>assign Rest / Scavenge / Guard / Board / Heal</td></tr>
        <tr><td>Z · X · C</td><td>scavenge Ruins / Market / Clinic</td></tr>
        <tr><td>← → / Tab</td><td>cycle survivor · right-click a card cycles its action</td></tr>
        <tr><td>Enter / Space</td><td>End Day</td></tr>
        <tr><td>H · &#96; · N · Esc</td><td>help · cheats · new level · close overlays</td></tr>
      </table>
      <p>Tip: just follow the ✓ checklist under the gameplay area. Every generated level is verified to be winnable.</p>
      <div class="wos-ovrow"><button type="button" class="wos-btn" data-ui="closehelp">Got it — play</button></div>
    </div></div>`;
    }
    function cheatOverlay(st) {
        const can = authority();
        const dis = can ? "" : "disabled";
        return `<div class="wos-ov"><div class="wos-ovcard">
      <h3>Cheat console</h3>
      <p>Using any cheat marks the run — best scores are not saved. ${can ? "" : "Only the host can cheat in a room match."}</p>
      <div class="wos-cheatgrid">
        <button type="button" class="wos-btn${st.cheats.god ? " on" : ""}" data-cheat="god" ${dis}>${st.cheats.god ? "✓ " : ""}God mode (no deaths)</button>
        <button type="button" class="wos-btn" data-cheat="supply" ${dis}>📦 Max supplies (30 each)</button>
        <button type="button" class="wos-btn" data-cheat="heal" ${dis}>💊 Full heal team</button>
        <button type="button" class="wos-btn" data-cheat="feed" ${dis}>🍞 Feed team (hunger 0)</button>
        <button type="button" class="wos-btn" data-cheat="rest" ${dis}>😴 Rested team (fatigue 0)</button>
        <button type="button" class="wos-btn" data-cheat="boards" ${dis}>🛡 Max boards</button>
        <button type="button" class="wos-btn" data-cheat="win" ${dis}>🕊 Skip to ceasefire</button>
      </div>
      <div class="wos-seed"><input type="number" placeholder="Load a specific seed..." data-seedinp ${dis}><button type="button" class="wos-btn" data-cheat="seed" ${dis}>Load seed</button></div>
      <div class="wos-ovrow"><button type="button" class="wos-btn" data-ui="closecheat">Close</button></div>
    </div></div>`;
    }
    function endOverlay(st) {
        const won = st.phase === "won";
        const alive = living();
        const my = st.scores[myToken()] || 0;
        const otherTok = st.seats.find((s) => s !== myToken());
        let verdict;
        if (!won) verdict = "The war outlasted you.";
        else if (!otherTok) verdict = `Final score ${my}.`;
        else {
            const other = st.scores[otherTok] || 0;
            verdict = my > other ? `You win the shift war ${my}–${other}!` : my < other ? `${seatLabel(otherTok)} wins the shift war ${other}–${my}.` : `Shared victory — ${my}–${other}.`;
        }
        return `<div class="wos-ov"><div class="wos-ovcard">
      <h3>${won ? "🕊 Ceasefire" : "🌑 The house fell silent"}</h3>
      <p>${won
                ? `Dawn after day ${st.level.days}. ${alive.length}/3 made it: ${alive.map((p) => p.name).join(", ") || "no one"}. The guns fall silent.`
                : `The last survivor fell on day ${Math.min(st.day, st.level.days)}. Seed ${st.seed} — ${esc(st.level.name)}.`}</p>
      <p><b>${verdict}</b></p>
      ${st.cheats.used ? `<p class="wos-note">Cheat-assisted run — best score not saved.</p>` : !online && won ? `<p class="wos-note">Best score: ${best}</p>` : ""}
      <div class="wos-ovrow">
        <button type="button" class="wos-btn" data-act="new" ${authority() ? "" : "disabled"}>🎲 New level</button>
        <button type="button" class="wos-btn" data-act="replay" ${authority() ? "" : "disabled"}>↻ Replay seed</button>
        <button type="button" class="wos-btn" data-exit>Exit</button>
      </div>
    </div></div>`;
    }

    function render() {
        if (destroyed) return;
        board.innerHTML = buildBoard();
        const modeBtns = root.querySelectorAll("[data-mode]");
        modeBtns.forEach((b) => {
            b.hidden = online;
            b.classList.toggle("on", !online && ((b.dataset.act === "mode-solo" && matchMode === "solo") || (b.dataset.act === "mode-bot" && matchMode === "bot")));
        });
        const nb = root.querySelector("[data-new]");
        if (nb) nb.disabled = online && !room.isHost;
        const vp = root.querySelector("[data-vpadbtn]");
        if (vp) vp.classList.toggle("on", ui.vpad);
        if (state) {
            subEl.textContent = `Survive ${state.level.days} days in ${state.level.name} · seed ${state.seed}`;
            statusEl.textContent =
                state.phase === "won" ? "Ceasefire 🕊" :
                    state.phase === "lost" ? "Fallen" :
                        myTurn() ? `Your turn · Day ${state.day}/${state.level.days}` :
                            `${seatLabel(turnToken(state))} commands · Day ${state.day}`;
        } else {
            statusEl.textContent = "Waiting for host...";
        }
    }

    function publish() {
        render();
        maybeBot();
        if (online && room.isHost) room.publishState(state).catch(console.warn);
    }

    /* ---------- game flow ---------- */
    function clearBot() { if (botTimer) { clearTimeout(botTimer); botTimer = null; } }
    function startFresh(seed) {
        clearBot();
        const r = rng((seed ^ 0xc0ffee) >>> 0);
        let seats;
        if (online) seats = r() < 0.5 ? ["host", "guest"] : ["guest", "host"];
        else if (matchMode === "bot") seats = r() < 0.5 ? ["human", "bot"] : ["bot", "human"];
        else seats = ["human"];
        state = newGame(seed, seats);
        state.log.push({ d: 1, t: "🪙 Coin toss — " + seatLabel(seats[0]) + " commands day 1." });
        selected = (living()[0] || {}).id || "marko";
        ui.cheat = false;
        publish();
    }
    function saveBest() {
        if (online || !state || state.phase !== "won" || state.cheats.used) return;
        const my = state.scores.human || 0;
        if (my > best) {
            best = my;
            try { localStorage.setItem(META.bestKey, String(best)); } catch (e) { }
        }
    }
    function doEnd() {
        const res = resolveDay(state, { god: state.cheats.god });
        state = res.next;
        for (const line of res.report) state.log.push({ d: state.day - 1, t: line });
        if (state.log.length > 12) state.log.splice(0, state.log.length - 12);
        if (state.phase === "won") saveBest();
        publish();
    }
    function applyCheat(op, value) {
        if (op === "seed") {
            const v = parseInt(value, 10);
            if (Number.isFinite(v)) startFresh((v >>> 0) || 1);
            return false;
        }
        state.cheats.used = true;
        if (op === "god") state.cheats.god = !state.cheats.god;
        else if (op === "supply") state.inv = { food: CAP, wood: CAP, meds: CAP };
        else if (op === "heal") living().forEach((p) => (p.hp = 100));
        else if (op === "feed") living().forEach((p) => (p.hunger = 0));
        else if (op === "rest") living().forEach((p) => (p.fatigue = 0));
        else if (op === "boards") state.security = MAX_BOARDS;
        else if (op === "win") { state.phase = "won"; state.report = ["🕊 Cheat: the ceasefire was called early."]; }
        return true;
    }
    const sanitize = (a) => {
        const type = ACTS.indexOf(a && a.type) >= 0 ? a.type : "rest";
        const zone = type === "scavenge" ? (ZONES[a.zone] ? a.zone : "market") : null;
        return { type, zone };
    };

    function applyAction(action, actor) {
        if (!state || destroyed || !action) return;
        const token = online ? (actor === 1 ? "guest" : "host") : actor === "bot" ? "bot" : "human";
        const turn = turnToken(state);
        const can = online ? token === "host" : token === "human";
        if (action.t === "assign") {
            if (state.phase !== "play" || token !== turn) return;
            const p = state.party.find((x) => x.id === action.pid);
            if (!p || !p.alive) return;
            p.action = sanitize(action.act);
        } else if (action.t === "plan") {
            if (state.phase !== "play" || token !== turn) return;
            for (const p of state.party)
                if (p.alive && action.plan && action.plan[p.id]) p.action = sanitize(action.plan[p.id]);
        } else if (action.t === "end") {
            if (state.phase !== "play" || token !== turn) return;
            doEnd();
            return;
        } else if (action.t === "new") {
            if (!can) return;
            startFresh(randomSeed());
            return;
        } else if (action.t === "replay") {
            if (!can) return;
            startFresh(state.seed);
            return;
        } else if (action.t === "mode") {
            if (online || !can) return;
            matchMode = action.mode === "solo" ? "solo" : "bot";
            startFresh(state.seed);
            return;
        } else if (action.t === "cheat") {
            if (!can) return;
            if (applyCheat(action.op, action.value) === false) return;
        } else return;
        publish();
    }
    function submitAction(action) {
        if (online && !room.isHost) { room.sendAction(action).catch(console.warn); render(); return; }
        applyAction(action, playerIndex);
    }

    /* Bot commander: plans, shows its picks, then ends the day. */
    function maybeBot() {
        if (online || matchMode !== "bot" || !state || state.phase !== "play") return;
        if (turnToken(state) !== "bot" || botTimer) return;
        const day = state.day;
        const ok = () => !destroyed && state && state.phase === "play" && state.day === day && turnToken(state) === "bot";
        botTimer = setTimeout(() => {
            botTimer = null;
            if (!ok()) return;
            applyAction({ t: "plan", plan: planFor(state, Math.random) }, "bot");
            botTimer = setTimeout(() => {
                botTimer = null;
                if (!ok()) return;
                applyAction({ t: "end" }, "bot");
            }, 900);
        }, 800);
    }

    /* ---------- input: mouse / touch / keyboard ---------- */
    function cycleSelection(dir) {
        const l = living();
        if (!l.length) return;
        let i = l.findIndex((p) => p.id === selected);
        i = (i + dir + l.length) % l.length;
        selected = l[i].id;
        render();
    }
    function assignSelected(act) {
        if (!myTurn()) return;
        const a = sanitize(act);
        if (a.type === "scavenge") lastZone = a.zone;
        submitAction({ t: "assign", pid: selected, act: a });
        const l = living();
        const i = l.findIndex((p) => p.id === selected);
        if (l.length > 1) selected = l[(i + 1) % l.length].id;
        render();
    }
    function handleUi(op) {
        if (op === "help") { ui.help = true; ui.cheat = false; render(); }
        else if (op === "closehelp") {
            ui.help = false;
            try { localStorage.setItem("wosHelpSeen", "1"); } catch (e) { }
            render();
        }
        else if (op === "cheat") { ui.cheat = !ui.cheat; ui.help = false; render(); }
        else if (op === "closecheat") { ui.cheat = false; render(); }
        else if (op === "vpad") { ui.vpad = !ui.vpad; render(); }
        else if (op === "prev") cycleSelection(-1);
        else if (op === "next") cycleSelection(1);
    }
    function handleAct(act) {
        if (act === "end") { if (myTurn()) submitAction({ t: "end" }); return; }
        if (act === "new") { submitAction({ t: "new" }); return; }
        if (act === "replay") { submitAction({ t: "replay" }); return; }
        if (act === "mode-solo") { submitAction({ t: "mode", mode: "solo" }); return; }
        if (act === "mode-bot") { submitAction({ t: "mode", mode: "bot" }); return; }
        if (ACTS.indexOf(act) >= 0) assignSelected({ type: act, zone: act === "scavenge" ? lastZone : null });
    }
    function handleClick(event) {
        const t = event.target;
        const closest = (sel) => (t && t.closest ? t.closest(sel) : null);
        if (closest("[data-exit]")) { onExit(); return; }
        const ub = closest("[data-ui]");
        if (ub) { handleUi(ub.dataset.ui); return; }
        const cb = closest("[data-cheat]");
        if (cb) {
            const op = cb.dataset.cheat;
            if (op === "seed") {
                const inp = root.querySelector("[data-seedinp]");
                submitAction({ t: "cheat", op: "seed", value: inp ? inp.value : 0 });
            } else submitAction({ t: "cheat", op });
            return;
        }
        const ab = closest("[data-act]");
        if (ab) { handleAct(ab.dataset.act); return; }
        const zb = closest("[data-zone]");
        if (zb) { lastZone = zb.dataset.zone; assignSelected({ type: "scavenge", zone: lastZone }); return; }
        const sb = closest("[data-surv]");
        if (sb) {
            const p = state && state.party.find((x) => x.id === sb.dataset.surv);
            if (p && p.alive) { selected = p.id; render(); }
        }
    }
    function handleCtx(event) {
        const t = event.target;
        const card = t && t.closest ? t.closest("[data-surv]") : null;
        if (!card) return;
        event.preventDefault();
        if (!myTurn()) return;
        const p = state.party.find((x) => x.id === card.dataset.surv);
        if (!p || !p.alive) return;
        selected = p.id;
        const next = ACTS[(ACTS.indexOf(p.action.type) + 1) % ACTS.length];
        assignSelected({ type: next, zone: next === "scavenge" ? lastZone : null });
    }
    function handleKey(event) {
        if (destroyed || !state || event.ctrlKey || event.metaKey || event.altKey) return;
        const tag = ((event.target && event.target.tagName) || "").toLowerCase();
        if (tag === "input" || tag === "textarea") return;
        const k = event.key;
        if (k === "Escape") { ui.help = false; ui.cheat = false; render(); return; }
        if (k === "h" || k === "H" || k === "?") { ui.help = !ui.help; ui.cheat = false; render(); event.preventDefault(); return; }
        if (k === "`") { ui.cheat = !ui.cheat; ui.help = false; render(); event.preventDefault(); return; }
        if (k === "n" || k === "N") { submitAction({ t: "new" }); return; }
        if (state.phase !== "play" || !myTurn()) return;
        if (k === "ArrowLeft") { cycleSelection(-1); event.preventDefault(); return; }
        if (k === "ArrowRight" || k === "Tab") { cycleSelection(1); event.preventDefault(); return; }
        if (k === "Enter" || k === " ") { submitAction({ t: "end" }); event.preventDefault(); return; }
        if (k >= "1" && k <= "5") { const a = ACTS[+k - 1]; assignSelected({ type: a, zone: a === "scavenge" ? lastZone : null }); return; }
        if (k === "z" || k === "Z") { lastZone = "ruins"; assignSelected({ type: "scavenge", zone: "ruins" }); }
        else if (k === "x" || k === "X") { lastZone = "market"; assignSelected({ type: "scavenge", zone: "market" }); }
        else if (k === "c" || k === "C") { lastZone = "clinic"; assignSelected({ type: "scavenge", zone: "clinic" }); }
    }

    root.addEventListener("click", handleClick);
    root.addEventListener("contextmenu", handleCtx);
    if (typeof document !== "undefined") document.addEventListener("keydown", handleKey);

    /* Auto-show the virtual pad on touch devices. */
    let mq = null, mqHandler = null;
    if (typeof window !== "undefined" && window.matchMedia) {
        mq = window.matchMedia("(pointer: coarse)");
        ui.vpad = mq.matches || (window.innerWidth || 1024) < 720;
        mqHandler = (e) => { ui.vpad = e.matches; render(); };
        if (mq.addEventListener) mq.addEventListener("change", mqHandler);
        else if (mq.addListener) mq.addListener(mqHandler);
    }

    /* ---------- boot ---------- */
    if (online) {
        room.onRoom((nextRoom) => { roomData = nextRoom; render(); });
        if (room.isHost) {
            startFresh(randomSeed());
            room.onAction((action) => applyAction(action, 1));
        } else {
            room.onState((nextState) => { state = nextState; render(); });
            render();
        }
    } else {
        startFresh(randomSeed());
    }

    return {
        destroy() {
            destroyed = true;
            clearBot();
            root.removeEventListener("click", handleClick);
            root.removeEventListener("contextmenu", handleCtx);
            if (typeof document !== "undefined") document.removeEventListener("keydown", handleKey);
            if (mq && mqHandler) {
                if (mq.removeEventListener) mq.removeEventListener("change", mqHandler);
                else if (mq.removeListener) mq.removeListener(mqHandler);
            }
        },
    };
}

/* Extra export for unit tests — tidak memengaruhi build manifest. */
export const _test = {
    CAP, BOARD_COST, BOARD_DEF, MAX_BOARDS, HUNGER_DAY, EAT_AT, EXH, FAT, ACTS, ZONES, ZONE_ORDER,
    rng, h32, genLevel, makeParty, raidOn, guardPower, turnToken, estimateDefense,
    rollLoot, resolveDay, planFor, stateFor, applyPlan, simPolicy, verifyLevel, newGame,
};