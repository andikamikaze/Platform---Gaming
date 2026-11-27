/* ==== GAME: mini-gta.js ==== */
/* Mini GTA — open-world driving / shooting / missions.
   Layout: HUD bar + fill-height board + touch pad (game-layout-redesign).
   Converted from the classic MGP registrar to ESM so HUD buttons can use iconSVG. */

import { iconSVG } from "../JS/icons.js";

export const META = {
    id: "mini-gta",
    name: "Mini GTA",
    category: "action",
    catLabel: "Action",
    desc: "Drive, shoot and finish ten jobs across three city districts.",
    art: `<svg viewBox="0 0 48 48" width="54" height="54" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 16h31v8H7z"/><path d="M29 24l-4 11h8l4-11"/><path d="M21 24v4h4"/><path d="M33 16v-3"/></svg>`,
    bg: ["#c7d2fe", "#a5b4fc"],
};

export function mount(root, context = {}) {
    const { onExit = () => { } } = context;
    const app = root;
    const T = 40,
        MW = 60,
        MH = 42,
        WW = MW * T,
        WH = MH * T,
        CAMW = 960,
        CAMH = 640;
    const RX = [4, 13, 22, 31, 40, 49, 58],
        RY = [3, 10, 17, 24, 31, 38];
    const RC = new Set(RX),
        RR = new Set(RY);
    const DISTS = [
        { name: "Industrial", g: "#4a4a41", bc: "#57534e", bo: "#8a7d70" },
        { name: "Downtown", g: "#46474f", bc: "#3b4a63", bo: "#66779a" },
        { name: "Residential", g: "#43503f", bc: "#6b4f3a", bo: "#9c7a5b" },
    ];
    function mulberry32(a) {
        return function () {
            a |= 0;
            a = (a + 0x6d2b79f5) | 0;
            let t = Math.imul(a ^ (a >>> 15), 1 | a);
            t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    }
    const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
    const dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);
    const districtOf = (y) => (y < 11 * T ? 0 : y < 25 * T ? 1 : 2);
    const copCount = (w) => COPS_PER[clamp(w, 0, 5)];
    const fareCalc = (d) => clamp(40 + Math.floor(d / 25), 40, 220);
    const raceReward = (place) => [0, 450, 150, 60][place] || 60;
    function wantedFromHeat(h) {
        return h >= 100
            ? 5
            : h >= 75
                ? 4
                : h >= 50
                    ? 3
                    : h >= 25
                        ? 2
                        : h >= 10
                            ? 1
                            : 0;
    }
    function tileAt(city, c, r) {
        return c < 0 || r < 0 || c >= MW || r >= MH
            ? 2
            : city.tiles[r * MW + c];
    }
    const solid = (city, x, y) =>
        tileAt(city, Math.floor(x / T), Math.floor(y / T)) === 2;
    function steerSign(x, y, ang, tx, ty) {
        let d = Math.atan2(ty - y, tx - x) - ang;
        while (d > Math.PI) d -= 2 * Math.PI;
        while (d < -Math.PI) d += 2 * Math.PI;
        return d > 0.12 ? 1 : d < -0.12 ? -1 : 0;
    }
    function vehStep(v, th, st, dt) {
        const s = v.spec;
        v.spd = clamp(v.spd + th * s.acc * dt, -s.max * 0.45, s.max);
        if (!th) v.spd *= Math.max(0, 1 - 1.8 * dt);
        v.ang +=
            st *
            s.turn *
            dt *
            Math.min(1, Math.abs(v.spd) / 110) *
            (v.spd < 0 ? -1 : 1);
        v.x += Math.cos(v.ang) * v.spd * dt;
        v.y += Math.sin(v.ang) * v.spd * dt;
        return v;
    }
    const WEAPONS = [
        { id: "fist", label: "Fists", dmg: 14, cd: 0.42, rng: 36, pel: 0 },
        { id: "pistol", label: "Pistol", dmg: 11, cd: 0.34, rng: 280, pel: 1 },
        { id: "shotgun", label: "Shotgun", dmg: 9, cd: 0.85, rng: 200, pel: 4 },
        { id: "smg", label: "SMG", dmg: 7, cd: 0.11, rng: 250, pel: 1 },
    ];
    const VEHS = [
        {
            id: "sedan",
            label: "Sedan",
            max: 260,
            acc: 180,
            turn: 2.4,
            hp: 90,
            w: 40,
            h: 20,
            price: 800,
            col: "#94a3b8",
        },
        {
            id: "sports",
            label: "Sports Car",
            max: 360,
            acc: 270,
            turn: 2.8,
            hp: 70,
            w: 40,
            h: 18,
            price: 2500,
            col: "#ef4444",
        },
        {
            id: "moto",
            label: "Motorcycle",
            max: 310,
            acc: 250,
            turn: 3.5,
            hp: 45,
            w: 26,
            h: 12,
            price: 900,
            col: "#22d3ee",
        },
        {
            id: "van",
            label: "Van",
            max: 220,
            acc: 150,
            turn: 2.0,
            hp: 130,
            w: 44,
            h: 24,
            price: 1500,
            col: "#f59e0b",
        },
        {
            id: "truck",
            label: "Truck",
            max: 180,
            acc: 110,
            turn: 1.6,
            hp: 220,
            w: 54,
            h: 26,
            price: 1800,
            col: "#84cc16",
        },
    ];
    const HEAT = {
        shot: 4,
        jack: 6,
        jackcar: 15,
        hitciv: 6,
        killciv: 22,
        hitgang: 2,
        killgang: 4,
        hitcop: 12,
        killcop: 35,
        rob: 70,
    };
    const COPS_PER = [0, 1, 2, 4, 6, 8];
    const POIS = {
        ammo: {
            label: "AMMO DEPOT",
            x: 7,
            y: 12,
            w: 4,
            h: 3,
            c: "#b45309",
            door: [9, 15.5],
        },
        bank: {
            label: "GRAND BANK",
            x: 33,
            y: 12,
            w: 6,
            h: 4,
            c: "#0e7490",
            door: [36, 16.6],
        },
        wheels: {
            label: "WHEELS",
            x: 7,
            y: 5,
            w: 4,
            h: 3,
            c: "#7c3aed",
            door: [9, 8.5],
        },
        ware: {
            label: "WAREHOUSE",
            x: 15,
            y: 5,
            w: 6,
            h: 4,
            c: "#9a3412",
            door: [18, 9.6],
        },
        docks: {
            label: "DOCKS",
            x: 24,
            y: 5,
            w: 6,
            h: 3,
            c: "#155e75",
            door: [27, 8.5],
        },
        bar: {
            label: "VINNIE'S BAR",
            x: 24,
            y: 19,
            w: 4,
            h: 3,
            c: "#a16207",
            door: [26, 22.6],
        },
        pd: {
            label: "POLICE",
            x: 34,
            y: 19,
            w: 4,
            h: 3,
            c: "#1d4ed8",
            door: [36, 22.6],
        },
        garage: {
            label: "GARAGE",
            x: 52,
            y: 19,
            w: 4,
            h: 3,
            c: "#4d7c0f",
            door: [54, 22.6],
        },
        mart: {
            label: "24-7 MART",
            x: 15,
            y: 26,
            w: 4,
            h: 3,
            c: "#be185d",
            door: [17, 29.6],
        },
        safe: {
            label: "SAFEHOUSE",
            x: 7,
            y: 33,
            w: 4,
            h: 3,
            c: "#334155",
            door: [9, 36.6],
        },
        depot: {
            label: "DEPOT",
            x: 15,
            y: 33,
            w: 4,
            h: 3,
            c: "#0f766e",
            door: [17, 36.6],
        },
    };
    const MISSIONS = [
        {
            name: "First Contact",
            brief: "Vinnie has work for a newcomer. Meet him at the bar in Downtown.",
            reward: 200,
            steps: [{ k: "goto", poi: "bar", r: 60, t: "Meet Vinnie at the bar" }],
        },
        {
            name: "Vehicle Theft",
            brief:
                "A client wants a clean sedan. Steal the marked car and drop it at the garage.",
            reward: 350,
            car: ["sedan", 22.5, 34],
            protect: true,
            steps: [
                { k: "car", t: "Steal the marked sedan" },
                {
                    k: "drive",
                    poi: "garage",
                    r: 65,
                    t: "Deliver the sedan to the garage",
                },
            ],
        },
        {
            name: "Package Delivery",
            brief:
                "Grab Vinnie's package and make two drops before the clock runs out.",
            reward: 400,
            time: 100,
            steps: [
                {
                    k: "goto",
                    poi: "ware",
                    r: 60,
                    t: "Pick up the package at the warehouse",
                },
                { k: "goto", poi: "docks", r: 60, t: "Drop one at the docks" },
                { k: "goto", poi: "bank", r: 60, t: "Drop two at the bank" },
            ],
        },
        {
            name: "Street Trouble",
            brief:
                "A crew is muscling in on Vinnie's turf. Clear the industrial lot.",
            reward: 500,
            steps: [{ k: "kill", n: 4, t: "Take out the crew" }],
        },
        {
            name: "Getaway Driver",
            brief:
                "Vinnie needs a ride out, fast. Get the van to the docks before the heat lands.",
            reward: 600,
            time: 110,
            car: ["van", 26, 24.5],
            heat: 20,
            protect: true,
            failBust: true,
            steps: [
                { k: "car", t: "Get into Vinnie's van" },
                { k: "drive", poi: "docks", r: 65, t: "Drive the van to the docks" },
            ],
        },
        {
            name: "Bank Robbery",
            brief:
                "Crack the vault at Grand Bank, then disappear before the city closes in.",
            reward: 1000,
            failBust: true,
            steps: [
                {
                    k: "rob",
                    poi: "bank",
                    r: 80,
                    sec: 5,
                    t: "Crack the vault - stay close",
                },
                { k: "evade", t: "Lose the cops" },
            ],
        },
        {
            name: "Police Chase",
            brief: "A marked unit made your face. Shake the entire force.",
            reward: 700,
            heat: 60,
            failBust: true,
            steps: [{ k: "evade", t: "Lose the cops" }],
        },
        {
            name: "Gang Territory",
            brief: "Take the warehouse block for Vinnie and hold it.",
            reward: 800,
            steps: [
                { k: "kill", n: 6, t: "Wipe out the gang" },
                { k: "hold", poi: "ware", r: 85, sec: 8, t: "Hold the block" },
            ],
        },
        {
            name: "High Value Target",
            brief:
                "An armored truck sits at the warehouse. Bring it to the safehouse in one piece.",
            reward: 900,
            car: ["truck", 18, 10.5],
            protect: true,
            failBust: true,
            ambush: 5,
            steps: [
                { k: "car", t: "Steal the armored truck" },
                {
                    k: "drive",
                    poi: "safe",
                    r: 65,
                    t: "Deliver the truck to the safehouse",
                },
            ],
        },
        {
            name: "Final Job",
            brief:
                "Hit the warehouse crew, jack their truck and dump it at the docks. Last job.",
            reward: 2000,
            time: 180,
            car: ["truck", 18, 10.5],
            protect: true,
            failBust: true,
            heat: 40,
            steps: [
                { k: "kill", n: 8, t: "Clear the warehouse crew" },
                { k: "car", t: "Steal the crew's truck" },
                { k: "drive", poi: "docks", r: 65, t: "Dump the truck at the docks" },
            ],
        },
    ];
    const SHOPS = {
        ammo: {
            title: "Ammo Depot - Weapon Shop",
            items: [
                { id: "shotgun", label: "Shotgun + 16 shells", price: 600 },
                { id: "smg", label: "SMG + 60 rounds", price: 1300 },
                { id: "a_pistol", label: "Pistol ammo x24", price: 60 },
                { id: "a_shotgun", label: "Shotgun shells x16", price: 90 },
                { id: "a_smg", label: "SMG ammo x60", price: 130 },
            ],
        },
        wheels: {
            title: "Wheels - Vehicle Shop",
            items: VEHS.map((v) => ({
                id: "v_" + v.id,
                label: v.label + ", delivered at the door",
                price: v.price,
            })),
        },
        mart: {
            title: "24-7 Mart - General Shop",
            items: [
                { id: "medkit", label: "Medkit, heals 60 (key H)", price: 150 },
                { id: "armor", label: "Body armor, absorbs hits", price: 300 },
                { id: "plates", label: "Fake plates, clears heat", price: 400 },
            ],
        },
    };
    const RACE_CPS = [
        [4.5, 3.5],
        [13.5, 3.5],
        [22.5, 3.5],
        [22.5, 10.5],
        [13.5, 10.5],
        [4.5, 10.5],
    ];
    const FARES = [
        [9, 23.5],
        [26, 16.5],
        [45, 23.5],
        [18, 30.5],
        [54, 16.5],
        [9, 37.5],
    ];
    const DROPS = [
        [26, 16.5],
        [49, 23.5],
        [17, 30.5],
    ];
    const CASH = [
        [13.5, 7],
        [22.5, 7],
        [40.5, 7],
        [13.5, 21],
        [31.5, 13],
        [49.5, 21],
        [22.5, 28],
        [40.5, 28],
        [13.5, 35],
        [49.5, 35],
    ];
    const PARKED = [
        [4.7, 7, 1],
        [4.7, 20, 0],
        [13.3, 8, 0],
        [13.3, 33, 1],
        [22.7, 13, 0],
        [22.7, 34, 1],
        [31.3, 7, 1],
        [31.3, 27, 0],
        [40.7, 13, 1],
        [40.7, 34, 0],
        [49.3, 12, 1],
        [49.3, 33, 0],
        [10, 17.4, 2],
        [26, 17.4, 2],
        [44, 17.4, 3],
        [55, 17.4, 2],
        [10, 31.4, 3],
        [44, 31.4, 2],
    ];
    function genCity() {
        const tiles = new Uint8Array(MW * MH);
        for (let r = 0; r < MH; r++)
            for (let c = 0; c < MW; c++)
                tiles[r * MW + c] = RC.has(c) || RR.has(r) ? 0 : 1;
        const B = [],
            rng = mulberry32(7);
        const BC = [
            [0, 3],
            [5, 12],
            [14, 21],
            [23, 30],
            [32, 39],
            [41, 48],
            [50, 57],
            [59, 59],
        ];
        const BR = [
            [0, 2],
            [4, 9],
            [11, 16],
            [18, 23],
            [25, 30],
            [32, 37],
            [39, 41],
        ];
        const PARK = new Set(["41,4", "5,18", "41,25"]);
        const PB = {
            "5,11": "ammo",
            "32,11": "bank",
            "5,4": "wheels",
            "14,4": "ware",
            "23,4": "docks",
            "23,18": "bar",
            "32,18": "pd",
            "50,18": "garage",
            "14,25": "mart",
            "5,32": "safe",
            "14,32": "depot",
        };
        const fill = (bx, by, bw, bh) => {
            for (let r = by; r < by + bh; r++)
                for (let c = bx; c < bx + bw; c++)
                    if (c >= 0 && r >= 0 && c < MW && r < MH) tiles[r * MW + c] = 2;
        };
        for (const [c0, c1] of BC)
            for (const [r0, r1] of BR) {
                const key = c0 + "," + r0,
                    cw = c1 - c0 - 1,
                    ch = r1 - r0 - 1;
                if (cw < 1 || ch < 1) continue;
                if (PB[key]) {
                    const p = POIS[PB[key]];
                    B.push({
                        x: p.x * T,
                        y: p.y * T,
                        w: p.w * T,
                        h: p.h * T,
                        c: p.c,
                        label: p.label,
                        poi: PB[key],
                    });
                    fill(p.x, p.y, p.w, p.h);
                    continue;
                }
                const d = DISTS[districtOf((r0 + 1) * T)];
                if (PARK.has(key)) {
                    B.push({
                        x: (c0 + 1) * T,
                        y: (r0 + 1) * T,
                        w: cw * T,
                        h: ch * T,
                        c: "#2f5d3a",
                        park: true,
                    });
                    for (let r = r0 + 1; r <= r1 - 1; r++)
                        for (let c = c0 + 1; c <= c1 - 1; c++) tiles[r * MW + c] = 3;
                    continue;
                }
                const put = (bx, by, bw, bh) => {
                    if (bw < 2 || bh < 1) return;
                    B.push({
                        x: bx * T,
                        y: by * T,
                        w: bw * T,
                        h: bh * T,
                        c: d.bc,
                        bo: d.bo,
                    });
                    fill(bx, by, bw, bh);
                };
                const m = () => (rng() < 0.5 ? 1 : 0);
                if (cw >= 6 && ch >= 4) {
                    const ac = c0 + 1 + ((cw / 2) | 0),
                        ar = r0 + 1 + ((ch / 2) | 0);
                    put(c0 + 1 + m(), r0 + 1 + m(), ac - c0 - 1 - m(), ar - r0 - 1 - m());
                    put(ac + 1 + m(), r0 + 1 + m(), c1 - ac - 1 - m(), ar - r0 - 1 - m());
                    put(c0 + 1 + m(), ar + 1 + m(), ac - c0 - 1 - m(), r1 - ar - 1 - m());
                    put(ac + 1 + m(), ar + 1 + m(), c1 - ac - 1 - m(), r1 - ar - 1 - m());
                } else put(c0 + 1 + m(), r0 + 1, cw - m(), ch);
            }
        const pois = {};
        for (const k in POIS)
            pois[k] = {
                ...POIS[k],
                dx: POIS[k].door[0] * T,
                dy: POIS[k].door[1] * T,
                cx: (POIS[k].x + POIS[k].w / 2) * T,
                cy: (POIS[k].y + POIS[k].h / 2) * T,
            };
        return { tiles, buildings: B, pois, rng };
    }
    function defaultState() {
        return {
            money: 300,
            hp: 100,
            armor: 0,
            medkits: 1,
            weapons: ["fist", "pistol"],
            cur: 1,
            ammo: { pistol: 48, shotgun: 0, smg: 0 },
            done: 0,
            ownedCars: [],
            kills: 0,
            earned: 0,
        };
    }
    function applySave(data) {
        const s = defaultState();
        for (const k of [
            "money",
            "hp",
            "armor",
            "medkits",
            "done",
            "kills",
            "earned",
        ])
            if (typeof data[k] === "number") s[k] = data[k];
        if (typeof data.cur === "number")
            s.cur = clamp(data.cur | 0, 0, WEAPONS.length - 1);
        if (Array.isArray(data.weapons))
            s.weapons = data.weapons.filter((w) => WEAPONS.some((x) => x.id === w));
        if (Array.isArray(data.ownedCars))
            s.ownedCars = data.ownedCars.filter((v) => VEHS.some((x) => x.id === v));
        if (data.ammo)
            for (const k in s.ammo)
                if (typeof data.ammo[k] === "number")
                    s.ammo[k] = Math.max(0, data.ammo[k] | 0);
        return s;
    }
    app.innerHTML = `
    <style>
      .gta{--bg:#0d142b;--line:#ffffff22;--ink:#e5e7eb;--mut:#9ca3af;--acc:#facc15}
      .gta [hidden]{display:none!important}
      .gta-hud{display:flex;align-items:center;flex-wrap:wrap;gap:6px;padding:8px 10px;border:1px solid var(--line);border-radius:12px;background:#111a33;font:600 11px/1.3 ui-monospace,SFMono-Regular,Menlo,monospace}
      .gta-chip{display:inline-flex;align-items:center;gap:5px;padding:5px 9px;border-radius:999px;background:#ffffff10;color:#c3cde2;white-space:nowrap}
      .gta-chip b{color:#fff;font-variant-numeric:tabular-nums}
      .gta-obj{max-width:190px;overflow:hidden;text-overflow:ellipsis;display:inline-block;white-space:nowrap}
      .gta-obj:before{content:"OBJ ";color:var(--mut)}
      .gta-spacer{flex:1 1 auto}
      .gta-btn{display:inline-flex;align-items:center;justify-content:center;gap:5px;min-height:32px;padding:6px 9px;border:1px solid #ffffff33;border-radius:9px;background:#ffffff12;color:var(--ink);font:600 10px/1 inherit;letter-spacing:.03em;cursor:pointer;white-space:nowrap}
      .gta-btn:hover{border-color:var(--acc);color:var(--acc)}
      .gta-btn.on{border-color:var(--acc);color:var(--acc);background:#facc151c}
      .gta-btn:disabled{opacity:.45;cursor:default}
      .gta-btn svg{flex:none;display:block}
      .gta-btn.primary{background:#4f46e5;border-color:#4f46e5;color:#fff}
      .gta game-app,.game-app.gta{gap:8px}
      .game-app.gta > .gta-board{flex:1 1 auto;min-height:0;aspect-ratio:auto}
      .gta-board{position:relative;width:100%;aspect-ratio:3/2;padding:0;border:1px solid var(--line);border-radius:12px;background:var(--bg);overflow:hidden}
      .gta-board .city{width:100%;height:100%;display:block;background:#22231f}
      .gta-board .mini{position:absolute;right:12px;bottom:calc(12px + env(safe-area-inset-bottom));width:min(150px,38vw);aspect-ratio:150/105;height:auto;background:#0b1020dd;border:1px solid #ffffff33;border-radius:10px;z-index:3;pointer-events:none}
      .gta-board .toast{position:absolute;bottom:calc(16px + env(safe-area-inset-bottom));left:50%;transform:translateX(-50%);max-width:calc(100% - 16px);background:#151d38ee;color:var(--ink);padding:8px 16px;border-radius:10px;font:600 13px/1.4 inherit;z-index:4;pointer-events:none;opacity:0;transition:opacity .18s;border:1px solid var(--line);box-sizing:border-box;text-align:center}
      .gta-board .toast.show{opacity:1}
      .gta-board .arrest{position:absolute;top:12px;left:50%;transform:translateX(-50%);max-width:90%;color:#f87171;font-weight:800;font-size:14px;text-align:center;z-index:3;pointer-events:none}
      .gta-ov{position:absolute;inset:0;z-index:5;display:grid;place-items:center;padding:14px;background:rgba(11,16,32,.9);backdrop-filter:blur(3px)}
      .gta-card{display:flex;flex-direction:column;gap:10px;width:min(460px,100%);max-height:100%;padding:16px;border:1px solid #ffffff22;border-radius:14px;background:#111a33;color:var(--ink);box-shadow:0 12px 32px #0006;text-align:center}
      .gta-head{flex:none;display:flex;align-items:center;justify-content:space-between;gap:10px}
      .gta-head h2,.gta-head h3{margin:0;font-size:1.15rem;font-weight:800;color:#fff}
      .gta-body{flex:1 1 auto;min-height:0;overflow:auto;text-align:left}
      .gta-foot{flex:none;display:flex;flex-wrap:wrap;justify-content:center;gap:8px;padding-top:4px}
      .gta-foot .gta-btn{min-height:38px;padding:8px 14px}
      .gta-win{color:#34d399!important}
      .gta-lose{color:#fb7185!important}
      .gta-sub{margin:0;color:var(--mut);font-size:.86rem;line-height:1.55}
      .gta .keys{text-align:left;font-size:12px;color:var(--mut);line-height:1.7;margin:10px 0}
      .gta .keys b{color:var(--ink)}
      .gta-note{font-size:11px;color:var(--mut)}
      .gta-sep{font:700 9px/1 ui-monospace,monospace;letter-spacing:.12em;color:var(--mut);text-transform:uppercase;margin:10px 0 4px}
      .gta .shoplist{display:flex;flex-direction:column;gap:8px;margin:12px 0;width:min(300px,100%)}
      .gta .shoplist button{display:flex;justify-content:space-between;gap:12px;min-height:44px;background:#ffffff10;border:1px solid #ffffff22;color:var(--ink);border-radius:10px;padding:8px 12px;font:600 13px/1.4 inherit;cursor:pointer}
      .gta .shoplist button:disabled{opacity:.4;cursor:default}
      .gta-cheats{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:8px}
      .gta-toggle{display:flex;align-items:center;justify-content:space-between;gap:8px;min-height:44px;padding:8px 10px;border:1px solid #ffffff2e;border-radius:10px;background:#ffffff10;color:var(--ink);font-size:11px;font-weight:600;text-align:left;cursor:pointer}
      .gta-toggle:hover{border-color:var(--acc)}
      .gta-toggle.on{border-color:var(--acc);color:var(--acc);background:#facc151c}
      .gta .wstars svg{margin:0 1px;vertical-align:-2px}
      .gta-pad{flex:none;display:flex;align-items:center;justify-content:space-between;gap:10px;padding:8px 10px;border:1px solid var(--line);border-radius:12px;background:#111a33;touch-action:none;user-select:none}
      .gta-dpad{display:grid;grid-template-columns:repeat(3,40px);grid-template-rows:repeat(2,38px);gap:4px}
      .gta-dpad [data-k="u"]{grid-area:1/2}
      .gta-dpad [data-k="l"]{grid-area:2/1}
      .gta-dpad [data-k="d"]{grid-area:2/2}
      .gta-dpad [data-k="r"]{grid-area:2/3}
      .gta-pad button{display:grid;place-items:center;border:1px solid #ffffff33;border-radius:10px;background:#ffffff12;color:var(--ink);font:700 10px/1 inherit;cursor:pointer}
      .gta-dpad button{width:40px;height:38px}
      .gta-acts{display:flex;flex-wrap:wrap;gap:6px}
      .gta-acts button{min-width:52px;min-height:38px;padding:4px 8px}
      .gta-hint{flex:1 1 100%;text-align:center;font-size:10px;color:var(--mut)}
      @media (max-width:720px){.gta-board .mini{right:8px;bottom:calc(8px + env(safe-area-inset-bottom));width:min(120px,34vw)}}
      @media (prefers-reduced-motion:reduce){.gta-board .toast{transition:none}}
      /* design polish */
      .gta :focus-visible,.gta button:focus-visible{outline:2px solid var(--acc);outline-offset:2px}
      @media (pointer:coarse){.gta button:not(:disabled){min-height:44px}}
      /* fill height + mobile refinements (last wins) */
      @media (max-width:640px){
        .gta.game-fill > .gta-board:not(:has(.gta-ov:not([hidden]))){aspect-ratio:3/2;flex:0 0 auto}
        .gta.game-fill > .gta-board:has(.gta-ov:not([hidden])){flex:0 0 auto;min-height:min(70dvh,620px);aspect-ratio:auto}
        .gta .gta-hud{gap:4px;padding:6px}
        .gta .gta-hud .gta-chip{padding:4px 6px;font-size:9px}
        .gta .gta-hud .gta-chip[data-hud="arm"],.gta .gta-hud .gta-chip[data-hud="med"]{display:none}
        .gta .gta-obj{max-width:110px}
        .gta .gta-hud .gta-btn{min-height:32px;padding:5px 8px;font-size:9px}
        .gta .gta-hud .gta-btn-label,.gta .gta-hud .gta-spacer{display:none}
        .gta .gta-ov{padding:8px}
        .gta .gta-card{width:100%;height:100%;max-height:100%;padding:12px;border-radius:12px}
        .gta .gta-body,.gta .gta-cheats{scrollbar-width:none}
        .gta .gta-body::-webkit-scrollbar,.gta .gta-cheats::-webkit-scrollbar{display:none}
        .gta .gta-foot{position:static;margin:0;padding:10px 0 0;border-top:1px solid var(--line)}
        .gta .gta-note{display:none}
        .gta .gta-pad{padding:6px;gap:6px}
        .gta .gta-dpad button{width:38px;height:38px}
        .gta .gta-acts button{min-width:44px;min-height:38px;font-size:10px}
      }
</style>
    <div class="game-app gta game-fill" data-gta>
      <div class="gta-hud">
        <span class="gta-chip">CASH <b data-hud="cash">$300</b></span>
        <span class="gta-chip">HP <b data-hud="hp">100</b></span>
        <span class="gta-chip" data-hud="arm">ARMOR 0</span>
        <span class="gta-chip" data-hud="med" hidden>MED 1</span>
        <span class="gta-chip wstars" data-hud="stars" aria-label="Wanted level"></span>
        <span class="gta-chip"><b data-hud="wep">Pistol</b></span>
        <span class="gta-chip" data-hud="tchip" hidden>TIME <b data-hud="time">0</b></span>
        <span class="gta-chip gta-obj" data-hud="obj" hidden></span>
        <span class="gta-spacer"></span>
        <button class="gta-btn" type="button" data-act="save" aria-label="Save game" title="Save game">${iconSVG("save", { size: 14 })}<span class="gta-btn-label">Save</span></button>
        <button class="gta-btn" type="button" data-act="load" aria-label="Load game" title="Load game">${iconSVG("download", { size: 14 })}<span class="gta-btn-label">Load</span></button>
        <button class="gta-btn" type="button" data-act="mute" aria-label="Toggle sound" title="Toggle sound">${iconSVG("volume", { size: 14 })}<span class="gta-btn-label" data-hud="sound">Sound on</span></button>
        <button class="gta-btn" type="button" data-help aria-label="How to play" title="How to play (H)">${iconSVG("helpCircle", { size: 14 })}<span class="gta-btn-label">Help</span></button>
        <button class="gta-btn" type="button" data-cheats aria-label="Cheats" title="Cheats (C)">${iconSVG("wrench", { size: 14 })}<span class="gta-btn-label">Cheats</span></button>
        <button class="gta-btn" type="button" data-pause aria-label="Pause" title="Pause (P)">${iconSVG("pause", { size: 14 })}<span class="gta-btn-label" data-hud="pauselabel">Pause</span></button>
        <button class="gta-btn" type="button" data-restart aria-label="Restart" title="Restart (R)">${iconSVG("refresh", { size: 14 })}<span class="gta-btn-label">Restart</span></button>
        <button class="gta-btn" type="button" data-exit aria-label="Exit game" title="Exit game">${iconSVG("logOut", { size: 14 })}<span class="gta-btn-label">Exit game</span></button>
      </div>
      <section class="game-panel gta-board" data-board>
        <svg class="city" viewBox="0 0 960 640" preserveAspectRatio="xMidYMid slice"><g data-l="static"></g><g data-l="dyn"></g></svg>
        <div class="arrest" data-arrest hidden>COPS CLOSING IN - BREAK AWAY</div>
        <svg class="mini" viewBox="0 0 300 210" preserveAspectRatio="none"><g data-l="mstatic"></g><g data-l="mdyn"></g></svg>
        <div class="toast" data-toast></div>
        <div class="gta-ov" data-ov="start"><div class="gta-card">
          <div class="gta-head"><h2>Mini GTA</h2></div>
          <div class="gta-body"><p class="gta-sub">Vinnie runs the jobs in this town. Walk, drive, shoot and climb from a nobody to the final job. Watch your wanted stars: five levels of heat bring the whole force down on you.</p>
          <div class="keys"><b>WASD / Arrows</b> move or drive<br><b>Space</b> attack or fire<br><b>E</b> enter or exit cars, shop doors<br><b>Q</b> swap weapon · <b>M</b> medkit<br><b>H</b> help · <b>C</b> cheats · <b>P</b> pause · <b>R</b> restart</div></div>
          <div class="gta-foot"><button class="gta-btn primary" type="button" data-act="start">Start game</button></div>
        </div></div>
        <div class="gta-ov" data-ov="brief" hidden><div class="gta-card">
          <div class="gta-head"><h2 data-b="name"></h2></div>
          <div class="gta-body"><p class="gta-sub" data-b="sub"></p></div>
          <div class="gta-foot"><button class="gta-btn primary" type="button" data-act="accept">Accept job</button><button class="gta-btn" type="button" data-act="decline">Later</button></div>
        </div></div>
        <div class="gta-ov" data-ov="shop" hidden><div class="gta-card">
          <div class="gta-head"><h2 data-s="title"></h2></div>
          <div class="gta-body"><div class="shoplist" data-s="list"></div></div>
          <div class="gta-foot"><button class="gta-btn primary" type="button" data-act="leave">Leave shop</button></div>
        </div></div>
        <div class="gta-ov" data-ov="pause" hidden><div class="gta-card">
          <div class="gta-head"><h3>Paused</h3></div>
          <div class="gta-body"><p class="gta-sub">The city is frozen. Press P or Resume to continue.</p></div>
          <div class="gta-foot"><button class="gta-btn primary" type="button" data-act="unpause">Resume</button></div>
        </div></div>
        <div class="gta-ov" data-ov="cheat" hidden><div class="gta-card">
          <div class="gta-head"><h3>Cheats</h3><button class="gta-btn" type="button" data-cheats-close>Close</button></div>
          <div class="gta-body"><div class="gta-cheats" data-cheatgrid></div><div class="gta-sep">Quick actions</div><div class="gta-cheats" data-cheatacts></div></div>
          <div class="gta-foot"><span class="gta-note">Press C to close</span><button class="gta-btn primary" type="button" data-cheats-close>Done</button></div>
        </div></div>
        <div class="gta-ov" data-ov="help" hidden><div class="gta-card">
          <div class="gta-head"><h3>How to play</h3><button class="gta-btn" type="button" data-help-close>Close</button></div>
          <div class="gta-body"><div class="keys"><b>WASD / Arrows</b> move or drive<br><b>Space</b> attack or fire, on foot only<br><b>E</b> enter or exit cars, use shop doors<br><b>Q</b> swap weapon · <b>M</b> use medkit<br><br>Yellow marker: Vinnie's next job.<br>Green markers: side work - street race, taxi, delivery.<br>Colored doors: weapon, vehicle and general shops.<br>Break away from the cops to cool your stars. Getting busted on a marked job fails it.<br><br><b>H</b> help · <b>C</b> cheats · <b>P</b> pause · <b>R</b> restart</div></div>
          <div class="gta-foot"><span class="gta-note">Press H to reopen this guide</span><button class="gta-btn primary" type="button" data-help-close>Got it</button></div>
        </div></div>
        <div class="gta-ov" data-ov="over" hidden><div class="gta-card">
          <div class="gta-head"><h2 data-o="title"></h2></div>
          <div class="gta-body"><p class="gta-sub" data-o="sub"></p></div>
          <div class="gta-foot"><button class="gta-btn primary" type="button" data-act="restart">Play again</button><button class="gta-btn" data-o="resume" data-act="resume" type="button" hidden>Keep going</button><button class="gta-btn" data-o="respawn" data-act="respawn" type="button" hidden>Respawn</button></div>
        </div></div>
      </section>
      <div class="gta-pad">
        <div class="gta-dpad">
          <button type="button" data-k="u" aria-label="Up">${iconSVG("arrowUp", { size: 16 })}</button>
          <button type="button" data-k="l" aria-label="Left">${iconSVG("arrowLeft", { size: 16 })}</button>
          <button type="button" data-k="d" aria-label="Down">${iconSVG("arrowDown", { size: 16 })}</button>
          <button type="button" data-k="r" aria-label="Right">${iconSVG("arrowRight", { size: 16 })}</button>
        </div>
        <div class="gta-acts">
          <button type="button" data-k="fire" aria-label="Fire">FIRE</button>
          <button type="button" data-k="use" aria-label="Use / enter car">USE</button>
          <button type="button" data-k="swap" aria-label="Swap weapon">SWAP</button>
          <button type="button" data-k="med" aria-label="Use medkit">MED</button>
        </div>
        <span class="gta-hint">E use · Q swap · M medkit · Space fire</span>
      </div>
    </div>`;
            const $ = (s) => app.querySelector(s);
            const hud = {
                cash: $('[data-hud="cash"]'),
                hp: $('[data-hud="hp"]'),
                arm: $('[data-hud="arm"]'),
                med: $('[data-hud="med"]'),
                stars: $('[data-hud="stars"]'),
                wep: $('[data-hud="wep"]'),
                tchip: $('[data-hud="tchip"]'),
                time: $('[data-hud="time"]'),
                obj: $('[data-hud="obj"]'),
                sound: $('[data-hud="sound"]'),
                pauselabel: $('[data-hud="pauselabel"]'),
                arrest: $("[data-arrest]"),
                toast: $("[data-toast]"),
            };
            const btn = {
                help: $("[data-help]"),
                cheats: $("[data-cheats]"),
                pause: $("[data-pause]"),
                restart: $("[data-restart]"),
                exit: $("[data-exit]"),
                mute: $('[data-act="mute"]'),
            };
            const svg = app.querySelector(".city");
            const statG = app.querySelector('[data-l="static"]'),
                dynG = app.querySelector('[data-l="dyn"]');
            const miniG = app.querySelector('[data-l="mdyn"]'),
                mstatG = app.querySelector('[data-l="mstatic"]');
            const ov = {
                start: $('[data-ov="start"]'),
                brief: $('[data-ov="brief"]'),
                shop: $('[data-ov="shop"]'),
                pause: $('[data-ov="pause"]'),
                cheat: $('[data-ov="cheat"]'),
                help: $('[data-ov="help"]'),
                over: $('[data-ov="over"]'),
            };
            const cheatGrid = $("[data-cheatgrid]"),
                cheatActs = $("[data-cheatacts]");
            const bName = $('[data-b="name"]'),
                bSub = $('[data-b="sub"]'),
                sTitle = $('[data-s="title"]'),
                sList = $('[data-s="list"]');
            const oTitle = $('[data-o="title"]'),
                oSub = $('[data-o="sub"]'),
                oResume = $('[data-o="resume"]'),
                oRespawn = $('[data-o="respawn"]');
            const city = genCity();
            const G = { pickups: [], vehs: [], npcs: [], bullets: [], fxs: [] };
            const K = { u: 0, d: 0, l: 0, r: 0, fire: 0 };
            let active = false,
                destroyed = false,
                running = false,
                paused = true,
                phase = "start",
                helpOpen = false,
                cheatsOpen = false,
                userPaused = false,
                iv = 0,
                lastT = 0,
                hudT = 0;
            let pendingM = null,
                curShop = null,
                toastTO = 0,
                copCd = 0,
                civCd = 0,
                shotHeatT = 0,
                sideCd = 0;
            let AC = null,
                muted = false;
            const cheat = { god: false, noHeat: false, noCops: false, infiniteAmmo: false };
            let seenHelp = true;
            try { seenHelp = localStorage.getItem("miniGtaHelpSeen") === "1"; } catch (err) { seenHelp = true; }
            if (!seenHelp) {
                helpOpen = true;
                try { localStorage.setItem("miniGtaHelpSeen", "1"); } catch (err) { /* storage blocked */ }
            }
            const CHEAT_TOGGLES = [
                ["god", "Invincible"],
                ["noHeat", "No wanted level"],
                ["noCops", "No cop spawns"],
                ["infiniteAmmo", "Infinite ammo"],
            ];
            const CHEAT_ACTS = [
                ["heal", "Full health + armor"],
                ["cash", "+1000 cash"],
                ["cool", "Clear heat"],
                ["finish", "Finish current job"],
            ];
            function beep(f, d, type, v, slide) {
                if (muted) return;
                try {
                    const Ctx = window.AudioContext || window.webkitAudioContext;
                    if (!Ctx) return;
                    AC = AC || new Ctx();
                    if (AC.state === "suspended") AC.resume();
                    const o = AC.createOscillator(),
                        g = AC.createGain();
                    o.type = type || "square";
                    o.frequency.value = f;
                    if (slide)
                        o.frequency.exponentialRampToValueAtTime(
                            Math.max(30, f + slide),
                            AC.currentTime + d,
                        );
                    g.gain.value = v || 0.06;
                    g.gain.exponentialRampToValueAtTime(0.001, AC.currentTime + d);
                    o.connect(g);
                    g.connect(AC.destination);
                    o.start();
                    o.stop(AC.currentTime + d);
                } catch (e) { }
            }
            const SFX = {
                shot: () => beep(190, 0.07, "square", 0.045, -120),
                shotgun: () => beep(90, 0.14, "sawtooth", 0.07, -50),
                hit: () => beep(140, 0.05, "triangle", 0.06, -60),
                boom: () => beep(60, 0.45, "sawtooth", 0.11, -40),
                cash: () => {
                    beep(880, 0.07, "sine", 0.06);
                    setTimeout(() => beep(1320, 0.09, "sine", 0.06), 70);
                },
                job: () => {
                    beep(520, 0.09, "sine", 0.07);
                    setTimeout(() => beep(660, 0.09, "sine", 0.07), 90);
                    setTimeout(() => beep(880, 0.13, "sine", 0.07), 180);
                },
                siren: () => beep(720, 0.3, "square", 0.04, -320),
                door: () => beep(300, 0.06, "sine", 0.05, 90),
            };
            function syncUI() {
                const suppress = helpOpen || cheatsOpen;
                ov.start.hidden = phase !== "start" || suppress;
                ov.brief.hidden = phase !== "brief" || suppress;
                ov.shop.hidden = phase !== "shop" || suppress;
                ov.over.hidden = phase !== "over" || suppress;
                ov.pause.hidden = !userPaused || suppress;
                ov.cheat.hidden = !cheatsOpen || helpOpen;
                ov.help.hidden = !helpOpen;
                paused = helpOpen || cheatsOpen || userPaused || phase !== "play";
                hud.pauselabel.textContent = userPaused ? "Resume" : "Pause";
                btn.pause.setAttribute("aria-label", userPaused ? "Resume" : "Pause");
                btn.pause.classList.toggle("on", userPaused);
                btn.cheats.classList.toggle("on", cheatsOpen);
                btn.help.classList.toggle("on", helpOpen);
            }
            function hideOvs() {
                phase = "play";
                syncUI();
            }
            function showOv(el) {
                phase = el.dataset.ov || "play";
                syncUI();
            }
            function toggleHelp(on) {
                helpOpen = typeof on === "boolean" ? on : !helpOpen;
                if (helpOpen) cheatsOpen = false;
                syncUI();
            }
            function toggleCheats(on) {
                cheatsOpen = typeof on === "boolean" ? on : !cheatsOpen;
                if (cheatsOpen) {
                    helpOpen = false;
                    renderCheats();
                }
                syncUI();
            }
            function togglePause() {
                if (helpOpen) { toggleHelp(false); lastT = Date.now(); return; }
                if (cheatsOpen) { toggleCheats(false); lastT = Date.now(); return; }
                if (phase !== "play") return;
                userPaused = !userPaused;
                lastT = Date.now();
                clearK();
                syncUI();
            }
            function startGame() {
                init();
                phase = "play";
                helpOpen = cheatsOpen = userPaused = false;
                running = true;
                clearK();
                lastT = Date.now();
                syncUI();
            }
            function renderCheats() {
                cheatGrid.innerHTML = CHEAT_TOGGLES.map(([k, label]) =>
                    '<button class="gta-toggle' + (cheat[k] ? " on" : "") + '" type="button" data-cheat="' + k + '" aria-pressed="' + cheat[k] + '">' + label + "<em>" + (cheat[k] ? "ON" : "OFF") + "</em></button>"
                ).join("");
                cheatActs.innerHTML = CHEAT_ACTS.map(([k, label]) =>
                    '<button class="gta-toggle" type="button" data-cheatact="' + k + '">' + label + "</button>"
                ).join("");
            }
            function runCheatAct(k) {
                if (k === "heal") {
                    G.hp = 100;
                    G.armor = 120;
                    toast("Health restored.");
                } else if (k === "cash") {
                    G.money += 1000;
                    G.earned += 1000;
                    toast("+$1000 added.");
                } else if (k === "cool") {
                    G.heat = 0;
                    toast("Heat cleared.");
                } else if (k === "finish") {
                    if (G.mission) {
                        completeMission();
                        if (running) hideOvs();
                    } else toast("No active job.");
                }
                updateHud();
            }
            function toast(msg) {
                hud.toast.textContent = msg;
                hud.toast.classList.add("show");
                if (toastTO) clearTimeout(toastTO);
                toastTO = setTimeout(() => hud.toast.classList.remove("show"), 2300);
            }
            function showOver(kind, title, sub) {
                oTitle.textContent = title;
                oTitle.className =
                    "gta-title " + (kind === "win" ? "mgp-win gta-win" : "mgp-lose gta-lose");
                oSub.textContent = sub;
                oResume.hidden = kind !== "fail";
                oRespawn.hidden = kind !== "dead";
                showOv(ov.over);
            }
            function renderStatic() {
                let s = "";
                const bands = [
                    [0, 11 * T],
                    [11 * T, 25 * T],
                    [25 * T, WH],
                ];
                for (let i = 0; i < 3; i++) {
                    s += `<rect x="0" y="${bands[i][0]}" width="${WW}" height="${bands[i][1] - bands[i][0]}" fill="${DISTS[i].g}"/>`;
                    s += `<text x="${WW / 2}" y="${(bands[i][0] + bands[i][1]) / 2}" font-size="52" font-family="inherit" text-anchor="middle" fill="#ffffff13" font-weight="800" letter-spacing="6">${DISTS[i].name.toUpperCase()}</text>`;
                }
                for (const c of RX) {
                    s += `<rect x="${c * T}" y="0" width="${T}" height="${WH}" fill="#34353b"/><line x1="${c * T + T / 2}" y1="0" x2="${c * T + T / 2}" y2="${WH}" stroke="#d8b13c55" stroke-width="2" stroke-dasharray="16 14"/>`;
                }
                for (const r of RY) {
                    s += `<rect x="0" y="${r * T}" width="${WW}" height="${T}" fill="#34353b"/><line x1="0" y1="${r * T + T / 2}" x2="${WW}" y2="${r * T + T / 2}" stroke="#d8b13c55" stroke-width="2" stroke-dasharray="16 14"/>`;
                }
                for (const b of city.buildings) {
                    if (b.park) {
                        s += `<rect x="${b.x + 2}" y="${b.y + 2}" width="${b.w - 4}" height="${b.h - 4}" rx="8" fill="${b.c}"/>`;
                        s += `<circle cx="${b.x + b.w * 0.3}" cy="${b.y + b.h * 0.4}" r="12" fill="#1f4429"/><circle cx="${b.x + b.w * 0.7}" cy="${b.y + b.h * 0.65}" r="15" fill="#1f4429"/>`;
                    } else {
                        s += `<rect x="${b.x + 2}" y="${b.y + 2}" width="${b.w - 4}" height="${b.h - 4}" rx="3" fill="${b.c}" stroke="#00000066" stroke-width="2"/>`;
                        if (b.bo)
                            s += `<rect x="${b.x + 9}" y="${b.y + 9}" width="${b.w - 18}" height="${b.h - 18}" rx="2" fill="${b.bo}" opacity="0.4"/>`;
                    }
                    if (b.label)
                        s += `<text x="${b.x + b.w / 2}" y="${b.y + b.h - 9}" font-size="11" font-family="inherit" text-anchor="middle" fill="#ffffffdd" font-weight="700">${b.label}</text>`;
                }
                s += `<rect x="2" y="2" width="${WW - 4}" height="${WH - 4}" fill="none" stroke="#ffffff22" stroke-width="4"/>`;
                statG.innerHTML = s;
                const sc = 300 / WW;
                let m = "";
                for (let i = 0; i < 3; i++)
                    m += `<rect x="0" y="${bands[i][0] * sc}" width="300" height="${(bands[i][1] - bands[i][0]) * sc}" fill="#1c2438"/>`;
                for (const c of RX)
                    m += `<line x1="${c * T * sc}" y1="0" x2="${c * T * sc}" y2="210" stroke="#3d4a63" stroke-width="2"/>`;
                for (const r of RY)
                    m += `<line x1="0" y1="${r * T * sc}" x2="300" y2="${r * T * sc}" stroke="#3d4a63" stroke-width="2"/>`;
                for (const k in city.pois) {
                    const p = city.pois[k];
                    m += `<rect x="${p.x * T * sc - 2}" y="${p.y * T * sc - 2}" width="5" height="5" fill="${p.c}"/>`;
                }
                mstatG.innerHTML = m;
            }
            function mkVeh(spec, x, y, ang, o) {
                return {
                    x,
                    y,
                    ang,
                    spd: 0,
                    hp: spec.hp,
                    spec,
                    ai: (o && o.ai) || null,
                    owned: !!(o && o.owned),
                    mission: !!(o && o.mission),
                    axis: "x",
                    dir: 1,
                    rcp: 0,
                    done: false,
                };
            }
            function walkTile(x, y, rMin, rMax) {
                for (let i = 0; i < 40; i++) {
                    const a = Math.random() * Math.PI * 2,
                        r = rMin + Math.random() * (rMax - rMin);
                    const x2 = clamp(x + Math.cos(a) * r, 30, WW - 30),
                        y2 = clamp(y + Math.sin(a) * r, 30, WH - 30);
                    const v = tileAt(city, Math.floor(x2 / T), Math.floor(y2 / T));
                    if (v === 1 || v === 3) return { x: x2, y: y2 };
                }
                return null;
            }
            function roadPoint(x, y, rMin, rMax) {
                for (let i = 0; i < 40; i++) {
                    const a = Math.random() * Math.PI * 2,
                        r = rMin + Math.random() * (rMax - rMin);
                    const x2 = clamp(x + Math.cos(a) * r, T, WW - T),
                        y2 = clamp(y + Math.sin(a) * r, T, WH - T);
                    const c = Math.floor(x2 / T),
                        rr = Math.floor(y2 / T);
                    if (RC.has(c) || RR.has(rr)) return { x: x2, y: y2, c, r: rr };
                }
                return null;
            }
            function spawnCiv(nearPlayer) {
                const p = walkTile(
                    G.px,
                    G.py,
                    nearPlayer ? 320 : 60,
                    nearPlayer ? 750 : WW * 0.7,
                );
                if (!p) return;
                G.npcs.push({
                    kind: "civ",
                    x: p.x,
                    y: p.y,
                    hp: 30,
                    tx: p.x,
                    ty: p.y,
                    cd: 0,
                    flee: 0,
                    col: ["#e2e8f0", "#fcd34d", "#a5b4fc", "#f9a8d4", "#86efac"][
                        (Math.random() * 5) | 0
                    ],
                });
            }
            function spawnGang(m, at) {
                const base = at || { x: city.pois.ware.dx, y: city.pois.ware.dy };
                const p = walkTile(base.x, base.y, 40, 190) || base;
                G.npcs.push({
                    kind: "gang",
                    x: p.x,
                    y: p.y,
                    hp: 60,
                    tx: p.x,
                    ty: p.y,
                    cd: 1,
                    flee: 0,
                    aggro: !!m,
                    gun: Math.random() < 0.4,
                    m: !!m,
                });
            }
            function spawnCop() {
                const p = roadPoint(G.px, G.py, 380, 700);
                if (!p) return;
                G.npcs.push({
                    kind: "cop",
                    x: p.x,
                    y: p.y,
                    hp: 80,
                    tx: p.x,
                    ty: p.y,
                    cd: 1.5,
                    flee: 0,
                });
            }
            function spawnTraffic() {
                const p = roadPoint(G.px, G.py, 480, 950);
                if (!p) return;
                const axis =
                    RC.has(p.c) && Math.random() < 0.5 ? "x" : RR.has(p.r) ? "y" : "x";
                const v = mkVeh(VEHS[(Math.random() * 3) | 0], p.x, p.y, 0, {
                    ai: "traffic",
                });
                if (axis === "x") {
                    v.dir = Math.random() < 0.5 ? 1 : -1;
                    v.ang = v.dir > 0 ? 0 : Math.PI;
                } else {
                    v.axis = "y";
                    v.dir = Math.random() < 0.5 ? 1 : -1;
                    v.ang = v.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
                }
                v.spd = 120;
                G.vehs.push(v);
            }
            function init() {
                Object.assign(G, defaultState(), {
                    px: city.pois.bar.dx + 60,
                    py: city.pois.bar.dy + 30,
                    dirX: 1,
                    dirY: 0,
                    heat: 0,
                    lastCrime: -99,
                    car: null,
                    arrest: 0,
                    time: 0,
                    mission: null,
                    side: null,
                    fireCd: 0,
                    hitCd: 0,
                    bullets: [],
                    fxs: [],
                });
                G.vehs = PARKED.map((p, i) =>
                    mkVeh(
                        VEHS[i % VEHS.length],
                        p[0] * T,
                        p[1] * T,
                        [Math.PI / 2, -Math.PI / 2, 0, Math.PI][p[2]],
                        { ai: null },
                    ),
                );
                G.npcs = [];
                G.pickups = CASH.map((c, i) => ({
                    x: c[0] * T,
                    y: c[1] * T,
                    v: 15 + ((i * 7) % 26),
                    on: true,
                    t: 0,
                    temp: false,
                }));
                for (let i = 0; i < 12; i++) spawnCiv(false);
                for (let i = 0; i < 5; i++) spawnGang(false);
                copCd = civCd = shotHeatT = sideCd = 0;
                pendingM = null;
                hud.arm.hidden = false;
            }
            const SIDE_PTS = {
                race: { x: RACE_CPS[0][0] * T, y: RACE_CPS[0][1] * T },
                taxi: { x: 31.5 * T, y: 17.5 * T },
                deliv: { x: city.pois.depot.dx, y: city.pois.depot.dy },
            };
            const KM = {
                ArrowUp: "u",
                KeyW: "u",
                ArrowDown: "d",
                KeyS: "d",
                ArrowLeft: "l",
                KeyA: "l",
                ArrowRight: "r",
                KeyD: "r",
                Space: "fire",
            };
            const clearK = () => {
                K.u = K.d = K.l = K.r = K.fire = 0;
            };
            function onKeyDown(e) {
                if (!active || destroyed) return;
                if (KM[e.code]) {
                    e.preventDefault();
                    if (phase === "play" && !helpOpen && !cheatsOpen && !userPaused)
                        K[KM[e.code]] = 1;
                }
                if (e.repeat) return;
                /* keyboard priority: help -> cheats -> pause/escape -> actions */
                if (e.code === "KeyH") { e.preventDefault(); toggleHelp(); return; }
                if (e.code === "KeyC") {
                    e.preventDefault();
                    if (helpOpen) toggleHelp(false); else toggleCheats();
                    return;
                }
                if (e.code === "KeyP") { e.preventDefault(); togglePause(); return; }
                if (e.code === "Escape") {
                    e.preventDefault();
                    if (helpOpen) toggleHelp(false);
                    else if (cheatsOpen) toggleCheats(false);
                    else if (userPaused) { userPaused = false; syncUI(); lastT = Date.now(); }
                    else if (phase === "play") togglePause();
                    return;
                }
                if (e.code === "KeyR") { e.preventDefault(); startGame(); return; }
                if (helpOpen || cheatsOpen || userPaused) return;
                if (e.code === "Enter") {
                    e.preventDefault();
                    if (phase === "start") startGame();
                    else if (phase === "brief") {
                        if (pendingM) { startMission(pendingM); pendingM = null; }
                        hideOvs();
                        running = true;
                    } else if (phase === "shop") { hideOvs(); running = true; }
                    else if (phase === "over") startGame();
                    return;
                }
                if (phase !== "play") return;
                if (e.code === "KeyE") doUse();
                else if (e.code === "KeyQ") swapWeapon();
                else if (e.code === "KeyM") useMedkit();
            }
            function onKeyUp(e) {
                if (active && KM[e.code]) K[KM[e.code]] = 0;
            }
            function onPointerDown(e) {
                if (!active || !running || paused) return;
                const b = e.target.closest("[data-k]");
                if (!b) return;
                e.preventDefault();
                const k = b.dataset.k;
                if (k === "use") { doUse(); return; }
                if (k === "swap") { swapWeapon(); return; }
                if (k === "med") { useMedkit(); return; }
                K[k] = 1;
            }
            const onPointerUp = () => { if (active) clearK(); };
            function onClick(e) {
                if (!active || destroyed) return;
                const buy = e.target.closest("[data-buy]");
                if (buy) { buyItem(buy.dataset.buy); return; }
                const ch = e.target.closest("[data-cheat]");
                if (ch) {
                    cheat[ch.dataset.cheat] = !cheat[ch.dataset.cheat];
                    renderCheats();
                    return;
                }
                const ca = e.target.closest("[data-cheatact]");
                if (ca) { runCheatAct(ca.dataset.cheatact); return; }
                if (e.target.closest("[data-help]")) { toggleHelp(); return; }
                if (e.target.closest("[data-help-close]")) { toggleHelp(false); return; }
                if (e.target.closest("[data-cheats]")) { toggleCheats(); return; }
                if (e.target.closest("[data-cheats-close]")) { toggleCheats(false); return; }
                if (e.target.closest("[data-pause]")) { togglePause(); return; }
                if (e.target.closest("[data-restart]")) { startGame(); return; }
                if (e.target.closest("[data-exit]")) { onExit(); return; }
                const b = e.target.closest("[data-act]");
                if (!b) return;
                const a = b.dataset.act;
                if (a === "start" || a === "restart") startGame();
                else if (a === "resume" || a === "respawn" || a === "unpause") {
                    if (a === "respawn") respawn();
                    userPaused = false;
                    hideOvs();
                    running = true;
                    lastT = Date.now();
                } else if (a === "accept") {
                    if (pendingM) { startMission(pendingM); pendingM = null; }
                    hideOvs();
                    running = true;
                    lastT = Date.now();
                } else if (a === "decline") {
                    pendingM = null;
                    offerCd = 5;
                    hideOvs();
                    running = true;
                    lastT = Date.now();
                } else if (a === "leave") {
                    hideOvs();
                    running = true;
                    lastT = Date.now();
                } else if (a === "save") doSave();
                else if (a === "load") doLoad();
                else if (a === "mute") {
                    muted = !muted;
                    hud.sound.textContent = muted ? "Sound off" : "Sound on";
                }
            }
            document.addEventListener("keydown", onKeyDown);
            document.addEventListener("keyup", onKeyUp);
            app.addEventListener("pointerdown", onPointerDown);
            app.addEventListener("pointerup", onPointerUp);
            app.addEventListener("pointerleave", onPointerUp);
            app.addEventListener("pointercancel", onPointerUp);
            app.addEventListener("click", onClick);
            function doUse() {
                if (!active || !running || paused) return;
                if (G.car) {
                    exitCar();
                    return;
                }
                for (const k of ["ammo", "wheels", "mart"]) {
                    const p = city.pois[k];
                    if (dist(G.px, G.py, p.dx, p.dy) < 55) {
                        openShop(k);
                        return;
                    }
                }
                let best = null,
                    bd = 62;
                for (const v of G.vehs) {
                    const d = dist(G.px, G.py, v.x, v.y);
                    if (d < bd) {
                        bd = d;
                        best = v;
                    }
                }
                if (best) enterCar(best);
            }
            function enterCar(v) {
                if (v.ai === "traffic") {
                    G.npcs.push({
                        kind: "civ",
                        x: v.x,
                        y: v.y,
                        hp: 30,
                        tx: v.x,
                        ty: v.y,
                        cd: 0,
                        flee: 3.5,
                        col: "#e2e8f0",
                    });
                    addHeat(HEAT.jackcar);
                } else if (!v.owned) addHeat(HEAT.jack);
                v.ai = null;
                G.car = v;
                SFX.door();
            }
            function exitCar() {
                const v = G.car;
                const a = v.ang + Math.PI / 2;
                let ex = v.x + Math.cos(a) * (v.spec.h / 2 + 16),
                    ey = v.y + Math.sin(a) * (v.spec.h / 2 + 16);
                if (solid(city, ex, ey)) {
                    ex = v.x - Math.cos(a) * (v.spec.h / 2 + 16);
                    ey = v.y - Math.sin(a) * (v.spec.h / 2 + 16);
                }
                if (solid(city, ex, ey)) {
                    ex = v.x - Math.cos(v.ang) * (v.spec.w / 2 + 18);
                    ey = v.y - Math.sin(v.ang) * (v.spec.w / 2 + 18);
                }
                G.px = ex;
                G.py = ey;
                G.dirX = Math.cos(v.ang);
                G.dirY = Math.sin(v.ang);
                G.car = null;
                v.spd = 0;
                SFX.door();
            }
            function swapWeapon() {
                if (!active || !running || paused) return;
                for (let i = 1; i <= WEAPONS.length; i++) {
                    const n = (G.cur + i) % WEAPONS.length;
                    if (G.weapons.includes(WEAPONS[n].id)) {
                        G.cur = n;
                        break;
                    }
                }
                SFX.door();
            }
            function useMedkit() {
                if (!active || !running || paused) return;
                if (G.medkits <= 0) {
                    toast("No medkits. Buy some at the 24-7 Mart.");
                    return;
                }
                if (G.hp >= 100) {
                    toast("Health is already full.");
                    return;
                }
                G.medkits--;
                G.hp = Math.min(100, G.hp + 60);
                SFX.cash();
                toast("Medkit used.");
            }
            function addHeat(h) {
                if (cheat.noHeat) return;
                const w0 = wantedFromHeat(G.heat);
                G.heat = Math.min(130, G.heat + h);
                G.lastCrime = G.time;
                if (wantedFromHeat(G.heat) > w0) SFX.siren();
            }
            function fire() {
                const w = WEAPONS[G.cur];
                if (w.pel === 0) {
                    G.fireCd = w.cd;
                    let hitAny = false;
                    for (const n of G.npcs) {
                        const d = dist(G.px, G.py, n.x, n.y);
                        if (d < w.rng && d > 0.01) {
                            const dot =
                                ((n.x - G.px) / d) * G.dirX + ((n.y - G.py) / d) * G.dirY;
                            if (dot > 0.35) {
                                hitNpc(n, w.dmg, true);
                                hitAny = true;
                                break;
                            }
                        }
                    }
                    if (!hitAny)
                        for (const v of G.vehs) {
                            if (
                                v !== G.car &&
                                !v.dead &&
                                dist(G.px, G.py, v.x, v.y) < w.rng
                            ) {
                                dmgVeh(v, 6);
                                break;
                            }
                        }
                    SFX.hit();
                    return;
                }
                if (!cheat.infiniteAmmo && (G.ammo[w.id] || 0) <= 0) {
                    toast("Out of ammo for the " + w.label + ".");
                    G.fireCd = 0.4;
                    return;
                }
                if (!cheat.infiniteAmmo) G.ammo[w.id]--;
                G.fireCd = w.cd;
                const base = Math.atan2(G.dirY, G.dirX);
                for (let i = 0; i < w.pel; i++) {
                    const a =
                        base + (i - (w.pel - 1) / 2) * 0.09 + (Math.random() - 0.5) * 0.05;
                    G.bullets.push({
                        x: G.px + Math.cos(a) * 12,
                        y: G.py + Math.sin(a) * 12,
                        vx: Math.cos(a) * 640,
                        vy: Math.sin(a) * 640,
                        dmg: w.dmg,
                        life: w.rng / 640,
                        who: "p",
                    });
                }
                G.fxs.push({
                    x: G.px + G.dirX * 14,
                    y: G.py + G.dirY * 14,
                    t: 0,
                    dur: 0.06,
                    c: "#fde047",
                    r: 5,
                });
                if (w.id === "shotgun") SFX.shotgun();
                else SFX.shot();
                for (const n of G.npcs)
                    if (n.kind === "civ" && dist(G.px, G.py, n.x, n.y) < 300) n.flee = 3;
                if (G.time - shotHeatT > 1.6) {
                    shotHeatT = G.time;
                    addHeat(HEAT.shot);
                }
            }
            function hitNpc(n, dmg, byPlayer) {
                n.hp -= dmg;
                if (n.kind === "civ") n.flee = 3.5;
                if (n.kind === "gang") n.aggro = true;
                if (n.hp <= 0) {
                    n.dead = true;
                    G.fxs.push({ x: n.x, y: n.y, t: 0, dur: 0.4, c: "#94a3b8", r: 14 });
                    if (byPlayer) {
                        G.kills++;
                        if (n.kind === "civ") addHeat(HEAT.killciv);
                        else if (n.kind === "cop") addHeat(HEAT.killcop);
                        else if (n.kind === "gang") {
                            addHeat(HEAT.killgang);
                            G.pickups.push({
                                x: n.x,
                                y: n.y,
                                v: 15 + ((Math.random() * 26) | 0),
                                on: true,
                                t: 0,
                                temp: true,
                            });
                        }
                    }
                    if (G.mission && n.m) G.mission.killed++;
                } else if (byPlayer && n.kind === "cop") addHeat(HEAT.hitcop);
                else if (byPlayer && n.kind === "civ") addHeat(HEAT.hitciv);
            }
            function dmgPlayer(d) {
                if (cheat.god) return;
                if (G.armor > 0) {
                    const a = Math.min(G.armor, d * 0.6);
                    G.armor -= a;
                    d -= a;
                }
                G.hp -= d;
                if (G.hp <= 0 && running) {
                    G.hp = 0;
                    running = false;
                    SFX.boom();
                    if (G.mission) failMission("You got wasted.");
                    else
                        showOver(
                            "dead",
                            "WASTED",
                            "You bled out on the asphalt. Respawn keeps your progress for a 10% cut of the cash.",
                        );
                }
            }
            function dmgVeh(v, d) {
                v.hp -= d;
                if (v.hp > 0 || v.dead) return;
                v.dead = true;
                G.fxs.push({ x: v.x, y: v.y, t: 0, dur: 0.6, c: "#f97316", r: 46 });
                SFX.boom();
                for (const n of G.npcs)
                    if (!n.dead && dist(v.x, v.y, n.x, n.y) < 70)
                        hitNpc(n, 45, v === G.car);
                if (v === G.car) {
                    G.car = null;
                    G.px = v.x + 24;
                    G.py = v.y + 24;
                    if (solid(city, G.px, G.py)) {
                        G.px = v.x - 24;
                        G.py = v.y - 24;
                    }
                    dmgPlayer(50);
                } else if (!G.car && dist(v.x, v.y, G.px, G.py) < 70) dmgPlayer(30);
            }
            function updatePlayer(dt) {
                G.fireCd -= dt;
                G.hitCd -= dt;
                if (G.car) {
                    const v = G.car;
                    vehStep(v, K.u ? 1 : K.d ? -1 : 0, (K.r ? 1 : 0) - (K.l ? 1 : 0), dt);
                    G.px = v.x;
                    G.py = v.y;
                    G.dirX = Math.cos(v.ang);
                    G.dirY = Math.sin(v.ang);
                } else {
                    let vx = K.r - K.l,
                        vy = K.d - K.u;
                    if (vx || vy) {
                        const l = Math.hypot(vx, vy);
                        vx /= l;
                        vy /= l;
                        G.dirX = vx;
                        G.dirY = vy;
                        const nx = G.px + vx * 172 * dt,
                            ny = G.py + vy * 172 * dt;
                        if (!solid(city, nx + (vx > 0 ? 8 : vx < 0 ? -8 : 0), G.py))
                            G.px = nx;
                        if (!solid(city, G.px, ny + (vy > 0 ? 8 : vy < 0 ? -8 : 0)))
                            G.py = ny;
                    }
                    if (K.fire && G.fireCd <= 0) fire();
                }
                G.px = clamp(G.px, 12, WW - 12);
                G.py = clamp(G.py, 12, WH - 12);
            }
            function trafficAI(v, dt) {
                const c = Math.floor(v.x / T),
                    r = Math.floor(v.y / T);
                const ahead = tileAt(
                    city,
                    Math.floor((v.x + Math.cos(v.ang) * 62) / T),
                    Math.floor((v.y + Math.sin(v.ang) * 62) / T),
                );
                let th = 0.5,
                    must = ahead !== 0;
                if (RC.has(c) && RR.has(r) && must) {
                    const opts = [];
                    if (tileAt(city, c + 1, r) === 0) opts.push(["x", 1]);
                    if (tileAt(city, c - 1, r) === 0) opts.push(["x", -1]);
                    if (tileAt(city, c, r + 1) === 0) opts.push(["y", 1]);
                    if (tileAt(city, c, r - 1) === 0) opts.push(["y", -1]);
                    const pick = opts.length
                        ? opts[(Math.random() * opts.length) | 0]
                        : null;
                    if (pick) {
                        v.axis = pick[0];
                        v.dir = pick[1];
                        must = false;
                    }
                }
                if (must) th = -1;
                const want =
                    v.axis === "x"
                        ? v.dir > 0
                            ? 0
                            : Math.PI
                        : v.dir > 0
                            ? Math.PI / 2
                            : -Math.PI / 2;
                let st = steerSign(
                    v.x,
                    v.y,
                    v.ang,
                    v.x + Math.cos(want) * 40,
                    v.y + Math.sin(want) * 40,
                );
                if (st) th = 0.12;
                const pd = dist(v.x, v.y, G.px, G.py);
                if (pd < 85) {
                    const dx = G.px - v.x,
                        dy = G.py - v.y;
                    if (dx * Math.cos(v.ang) + dy * Math.sin(v.ang) > 0) th = -0.5;
                }
                vehStep(v, th, st, dt);
                if (Math.abs(v.spd) < 8) {
                    v.stuck = (v.stuck || 0) + dt;
                    if (v.stuck > 5) v.dead = true;
                } else v.stuck = 0;
            }
            function updateVehicles(dt) {
                for (const v of G.vehs) {
                    if (v.dead) continue;
                    if (v !== G.car && v.ai === "traffic") trafficAI(v, dt);
                    else if (v.ai === "race") {
                        const cp = RACE_CPS[Math.min(v.rcp, RACE_CPS.length - 1)];
                        const tx = cp[0] * T,
                            ty = cp[1] * T;
                        vehStep(v, 0.7, steerSign(v.x, v.y, v.ang, tx, ty), dt);
                        if (dist(v.x, v.y, tx, ty) < 62) {
                            v.rcp++;
                            if (v.rcp >= RACE_CPS.length) v.done = true;
                        }
                    }
                    if (Math.abs(v.spd) > 8) {
                        const fx2 = v.x + Math.cos(v.ang) * (v.spec.w / 2 + 8),
                            fy2 = v.y + Math.sin(v.ang) * (v.spec.w / 2 + 8);
                        const bx = v.x - Math.cos(v.ang) * (v.spec.w / 2 + 8),
                            by = v.y - Math.sin(v.ang) * (v.spec.w / 2 + 8);
                        if (solid(city, fx2, fy2) || solid(city, bx, by)) {
                            const imp = Math.abs(v.spd);
                            v.spd = -v.spd * 0.25;
                            if (imp > 120) v.hp -= imp * 0.06;
                            G.fxs.push({
                                x: fx2,
                                y: fy2,
                                t: 0,
                                dur: 0.25,
                                c: "#e2e8f0",
                                r: 10,
                            });
                            if (imp > 170) {
                                SFX.hit();
                                if (v === G.car) dmgPlayer(imp * 0.03);
                            }
                        }
                    }
                    if (v.hp <= 0) dmgVeh(v, 0);
                }
                for (let i = 0; i < G.vehs.length; i++)
                    for (let j = i + 1; j < G.vehs.length; j++) {
                        const a = G.vehs[i],
                            b = G.vehs[j];
                        if (a.dead || b.dead || (a !== G.car && b !== G.car)) continue;
                        const d = dist(a.x, a.y, b.x, b.y);
                        if (d < 34 && d > 0.001) {
                            const push = (34 - d) / 2,
                                nx2 = (b.x - a.x) / d,
                                ny2 = (b.y - a.y) / d;
                            a.x -= nx2 * push;
                            a.y -= ny2 * push;
                            b.x += nx2 * push;
                            b.y += ny2 * push;
                            if (Math.abs(a.spd - b.spd) > 150) {
                                a.hp -= 6;
                                b.hp -= 6;
                                SFX.hit();
                            }
                            a.spd *= 0.55;
                            b.spd *= 0.55;
                        }
                    }
                for (const v of G.vehs) {
                    if (v.dead || Math.abs(v.spd) < 95) continue;
                    for (const n of G.npcs) {
                        if (!n.dead && dist(v.x, v.y, n.x, n.y) < v.spec.h / 2 + 12)
                            hitNpc(n, 999, v === G.car);
                    }
                    if (
                        !G.car &&
                        G.hitCd <= 0 &&
                        dist(v.x, v.y, G.px, G.py) < v.spec.h / 2 + 12
                    ) {
                        dmgPlayer(Math.abs(v.spd) * 0.12);
                        G.hitCd = 0.9;
                    }
                }
                G.vehs = G.vehs.filter((v) => !v.dead);
            }
            function moveNpc(n, tx, ty, spd, dt) {
                const dx = tx - n.x,
                    dy = ty - n.y,
                    d = Math.hypot(dx, dy);
                if (d < 4) return true;
                const nx = n.x + (dx / d) * spd * dt,
                    ny = n.y + (dy / d) * spd * dt;
                if (!solid(city, nx, n.y)) n.x = nx;
                else n.blocked = true;
                if (!solid(city, n.x, ny)) n.y = ny;
                else n.blocked = true;
                return false;
            }
            function wanderNpc(n, spd, dt) {
                if (moveNpc(n, n.tx, n.ty, spd, dt) || n.blocked || n.cd <= 0) {
                    const p = walkTile(n.x, n.y, 30, 180);
                    if (p) {
                        n.tx = p.x;
                        n.ty = p.y;
                    }
                    n.cd = 3 + Math.random() * 4;
                }
            }
            function updateNpcs(dt) {
                const w = wantedFromHeat(G.heat);
                for (const n of G.npcs) {
                    if (n.dead) continue;
                    n.cd -= dt;
                    if (n.kind === "civ") {
                        if (n.flee > 0) {
                            n.flee -= dt;
                            moveNpc(n, n.x * 2 - G.px, n.y * 2 - G.py, 185, dt);
                        } else wanderNpc(n, 58, dt);
                    } else if (n.kind === "gang") {
                        const pd = dist(n.x, n.y, G.px, G.py);
                        if (!n.aggro && pd < 250) n.aggro = true;
                        if (n.aggro && pd < 480) {
                            if (n.gun) {
                                if (pd > 170) moveNpc(n, G.px, G.py, 128, dt);
                                else if (pd < 90)
                                    moveNpc(n, n.x * 2 - G.px, n.y * 2 - G.py, 100, dt);
                                if (n.cd <= 0 && pd < 230) {
                                    n.cd = 1.2 + Math.random() * 0.5;
                                    const a =
                                        Math.atan2(G.py - n.y, G.px - n.x) +
                                        (Math.random() - 0.5) * 0.15;
                                    G.bullets.push({
                                        x: n.x + Math.cos(a) * 10,
                                        y: n.y + Math.sin(a) * 10,
                                        vx: Math.cos(a) * 560,
                                        vy: Math.sin(a) * 560,
                                        dmg: 6,
                                        life: 0.5,
                                        who: "e",
                                    });
                                    SFX.shot();
                                }
                            } else {
                                if (pd > 26) moveNpc(n, G.px, G.py, 132, dt);
                                else if (n.cd <= 0) {
                                    n.cd = 0.85;
                                    dmgPlayer(9);
                                    SFX.hit();
                                }
                            }
                        } else if (n.aggro && pd >= 480) n.aggro = false;
                        else wanderNpc(n, 55, dt);
                    } else {
                        if (w === 0) {
                            n.dead = true;
                            continue;
                        }
                        const pd = dist(n.x, n.y, G.px, G.py);
                        if (pd > 30) moveNpc(n, G.px, G.py, 172 + w * 5, dt);
                        if (w >= 2 && n.cd <= 0 && pd < 260) {
                            n.cd = 1.0 + Math.random() * 0.4;
                            const a =
                                Math.atan2(G.py - n.y, G.px - n.x) +
                                (Math.random() - 0.5) * 0.12;
                            G.bullets.push({
                                x: n.x + Math.cos(a) * 10,
                                y: n.y + Math.sin(a) * 10,
                                vx: Math.cos(a) * 600,
                                vy: Math.sin(a) * 600,
                                dmg: 8,
                                life: 0.48,
                                who: "e",
                            });
                            SFX.shot();
                        }
                    }
                    n.blocked = false;
                }
                G.npcs = G.npcs.filter((n) => !n.dead);
            }
            function updateBullets(dt) {
                for (const b of G.bullets) {
                    b.life -= dt;
                    b.x += b.vx * dt;
                    b.y += b.vy * dt;
                    if (b.life <= 0 || solid(city, b.x, b.y)) {
                        b.dead = true;
                        continue;
                    }
                    if (b.who === "p") {
                        for (const n of G.npcs) {
                            if (
                                !n.dead &&
                                dist(b.x, b.y, n.x, n.y) < (n.kind === "civ" ? 9 : 11)
                            ) {
                                hitNpc(n, b.dmg, true);
                                b.dead = true;
                                SFX.hit();
                                break;
                            }
                        }
                        if (!b.dead)
                            for (const v of G.vehs) {
                                if (
                                    !v.dead &&
                                    v !== G.car &&
                                    dist(b.x, b.y, v.x, v.y) < v.spec.w / 2
                                ) {
                                    dmgVeh(v, b.dmg);
                                    b.dead = true;
                                    break;
                                }
                            }
                    } else if (!G.car && dist(b.x, b.y, G.px, G.py) < 10) {
                        dmgPlayer(b.dmg);
                        b.dead = true;
                        SFX.hit();
                    }
                }
                G.bullets = G.bullets.filter((b) => !b.dead);
            }
            function updatePickups(dt) {
                for (const p of G.pickups) {
                    if (!p.on) {
                        p.t -= dt;
                        if (p.t <= 0 && !p.temp) p.on = true;
                        continue;
                    }
                    if (dist(G.px, G.py, p.x, p.y) < 30) {
                        p.on = false;
                        p.t = 25;
                        G.money += p.v;
                        G.earned += p.v;
                        toast("Picked up $" + p.v + ".");
                    }
                }
                G.pickups = G.pickups.filter((p) => !p.temp || p.on);
            }
            function updateWanted(dt) {
                const w = wantedFromHeat(G.heat);
                let cops = 0,
                    near = false,
                    close = false;
                for (const n of G.npcs) {
                    if (n.kind !== "cop" || n.dead) continue;
                    cops++;
                    const d = dist(n.x, n.y, G.px, G.py);
                    if (d < 460) near = true;
                    if (d < 34 && !G.car) close = true;
                }
                copCd -= dt;
                if (!cheat.noCops && cops < copCount(w) && copCd <= 0) {
                    spawnCop();
                    copCd = 1.1;
                }
                if (!near && G.time - G.lastCrime > 3 && G.heat > 0)
                    G.heat = Math.max(0, G.heat - 10 * dt);
                if (close) {
                    G.arrest += dt;
                    if (G.arrest >= 1.15) busted();
                } else G.arrest = Math.max(0, G.arrest - dt * 1.6);
            }
            function busted() {
                G.arrest = 0;
                G.heat = 0;
                if (G.mission && G.mission.d.failBust) {
                    failMission("You got busted.");
                    return;
                }
                const fine = Math.ceil(G.money * 0.15);
                G.money -= fine;
                G.car = null;
                G.px = city.pois.pd.dx + 50;
                G.py = city.pois.pd.dy + 40;
                SFX.siren();
                toast("Busted! The cops took a $" + fine + " fine.");
            }
            let offerCd = 0;
            function startMission(d) {
                G.mission = {
                    d,
                    si: 0,
                    killed: 0,
                    prog: 0,
                    t: d.time || 0,
                    car: null,
                    next: false,
                };
                if (d.car) {
                    const spec = VEHS.find((x) => x.id === d.car[0]);
                    const v = mkVeh(spec, d.car[1] * T, d.car[2] * T, -Math.PI / 2, {
                        mission: true,
                    });
                    G.mission.car = v;
                    G.vehs.push(v);
                    if (d.ambush)
                        for (let i = 0; i < d.ambush; i++)
                            spawnGang(true, { x: v.x, y: v.y });
                }
                if (d.heat) addHeat(d.heat);
                if (d.steps[0].k === "kill")
                    for (let i = 0; i < d.steps[0].n; i++) spawnGang(true);
                toast("Job started: " + d.name + ".");
            }
            function completeMission() {
                const d = G.mission.d;
                G.money += d.reward;
                G.earned += d.reward;
                G.done++;
                if (G.mission.car) G.mission.car.mission = false;
                G.mission = null;
                SFX.job();
                if (G.done >= MISSIONS.length) {
                    running = false;
                    showOver(
                        "win",
                        "CAMPAIGN COMPLETE",
                        "The final job is done and the town knows your name. Cash $" +
                        G.money +
                        ", kills " +
                        G.kills +
                        ", total earned $" +
                        G.earned +
                        ".",
                    );
                } else
                    toast(
                        "Job done: $" +
                        d.reward +
                        ". Meet Vinnie at the bar for the next one.",
                    );
            }
            function failMission(reason) {
                if (!G.mission) return;
                G.mission = null;
                running = false;
                SFX.siren();
                showOver(
                    "fail",
                    "MISSION FAILED",
                    reason + " Meet Vinnie at the bar to try again.",
                );
            }
            function stepPoint(st) {
                if (st.poi) {
                    const p = city.pois[st.poi];
                    return { x: p.dx, y: p.dy };
                }
                if (st.k === "car" && G.mission && G.mission.car)
                    return { x: G.mission.car.x, y: G.mission.car.y };
                return null;
            }
            function tickMission(dt) {
                offerCd -= dt;
                const M = G.mission;
                if (!M) {
                    if (
                        running &&
                        !paused &&
                        G.done < MISSIONS.length &&
                        offerCd <= 0 &&
                        dist(G.px, G.py, city.pois.bar.dx, city.pois.bar.dy) < 60
                    ) {
                        const d = MISSIONS[G.done];
                        pendingM = d;
                        bName.textContent = "Job " + (G.done + 1) + "/10: " + d.name;
                        bSub.textContent =
                            d.brief +
                            " Reward $" +
                            d.reward +
                            "." +
                            (d.time ? " Time limit " + d.time + "s." : "") +
                            (d.failBust ? " Getting busted fails this job." : "");
                        showOv(ov.brief);
                    }
                    return;
                }
                const d = M.d,
                    st = d.steps[M.si];
                if (d.time) {
                    M.t -= dt;
                    if (M.t <= 0) {
                        failMission("Out of time.");
                        return;
                    }
                }
                if (d.protect && M.car && M.car.hp <= 0) {
                    failMission("The vehicle was wrecked.");
                    return;
                }
                if (
                    st.k === "goto" &&
                    dist(G.px, G.py, city.pois[st.poi].dx, city.pois[st.poi].dy) < st.r
                )
                    M.next = true;
                else if (st.k === "car" && G.car && G.car === M.car) M.next = true;
                else if (
                    st.k === "drive" &&
                    G.car &&
                    (!M.car || G.car === M.car) &&
                    dist(G.px, G.py, city.pois[st.poi].dx, city.pois[st.poi].dy) < st.r
                )
                    M.next = true;
                else if (st.k === "kill" && M.killed >= st.n) M.next = true;
                else if (st.k === "evade" && G.heat <= 0) M.next = true;
                else if (st.k === "rob" || st.k === "hold") {
                    if (
                        dist(G.px, G.py, city.pois[st.poi].dx, city.pois[st.poi].dy) < st.r
                    ) {
                        M.prog += dt;
                        if (M.prog >= st.sec) {
                            if (st.k === "rob") {
                                addHeat(HEAT.rob);
                                SFX.siren();
                                toast("Vault cracked! Run!");
                            }
                            M.next = true;
                        }
                    } else M.prog = Math.max(0, M.prog - dt * 2);
                }
                if (M.next) {
                    M.next = false;
                    M.prog = 0;
                    M.si++;
                    SFX.door();
                    if (M.si >= d.steps.length) completeMission();
                }
            }
            function sidePoint() {
                const S = G.side;
                if (!S) return null;
                if (S.kind === "race") {
                    const cp = RACE_CPS[Math.min(S.cp, RACE_CPS.length - 1)];
                    return {
                        x: cp[0] * T,
                        y: cp[1] * T,
                        label: "CP " + (S.cp + 1) + "/" + RACE_CPS.length,
                    };
                }
                if (S.kind === "taxi") {
                    const f = FARES[S.fare * 2 + (S.phase === 1 ? 1 : 0)];
                    return {
                        x: f[0] * T,
                        y: f[1] * T,
                        label: S.phase === 0 ? "PICK UP" : "DROP OFF",
                    };
                }
                if (S.phase === 0)
                    return { x: SIDE_PTS.deliv.x, y: SIDE_PTS.deliv.y, label: "PICK UP" };
                const d = DROPS[S.drop];
                return {
                    x: d[0] * T,
                    y: d[1] * T,
                    label: "DROP " + (S.drop + 1) + "/" + DROPS.length,
                };
            }
            function tickSide(dt) {
                sideCd -= dt;
                const S = G.side;
                if (S) {
                    if (S.kind === "race") {
                        const cp = RACE_CPS[Math.min(S.cp, RACE_CPS.length - 1)];
                        if (G.car && dist(G.px, G.py, cp[0] * T, cp[1] * T) < 60) {
                            S.cp++;
                            SFX.door();
                            if (S.cp >= RACE_CPS.length) {
                                const place =
                                    1 + G.vehs.filter((v) => v.ai === "race" && v.done).length;
                                const pay = raceReward(place);
                                G.money += pay;
                                G.earned += pay;
                                G.vehs = G.vehs.filter((v) => v.ai !== "race");
                                G.side = null;
                                sideCd = 3;
                                SFX.cash();
                                toast(
                                    place === 1
                                        ? "Race won! $" + pay
                                        : "Finished " + (place === 2 ? "2nd" : "3rd") + ". $" + pay,
                                );
                            }
                        }
                    } else if (S.kind === "taxi") {
                        const pick = {
                            x: FARES[S.fare * 2][0] * T,
                            y: FARES[S.fare * 2][1] * T,
                        };
                        const drop = {
                            x: FARES[S.fare * 2 + 1][0] * T,
                            y: FARES[S.fare * 2 + 1][1] * T,
                        };
                        if (S.phase === 0) {
                            if (G.car === S.taxi && dist(G.px, G.py, pick.x, pick.y) < 48) {
                                S.wait += dt;
                                if (S.wait > 0.7) {
                                    S.wait = 0;
                                    S.phase = 1;
                                    SFX.door();
                                    toast("Passenger aboard. Drive to the drop.");
                                }
                            }
                        } else if (
                            G.car === S.taxi &&
                            dist(G.px, G.py, drop.x, drop.y) < 48
                        ) {
                            const pay = fareCalc(dist(pick.x, pick.y, drop.x, drop.y));
                            G.money += pay;
                            G.earned += pay;
                            SFX.cash();
                            S.fare++;
                            S.phase = 0;
                            S.wait = 0;
                            if (S.fare >= 3) {
                                G.money += 100;
                                G.earned += 100;
                                G.side = null;
                                sideCd = 3;
                                toast("Taxi shift done. $100 bonus.");
                            } else toast("Fare paid $" + pay + ". Next pickup!");
                        }
                    } else {
                        if (S.phase === 0) {
                            if (dist(G.px, G.py, SIDE_PTS.deliv.x, SIDE_PTS.deliv.y) < 55) {
                                S.phase = 1;
                                SFX.door();
                                toast("Package loaded. Three drops, hurry!");
                            }
                        } else {
                            S.t -= dt;
                            const dpt = DROPS[S.drop];
                            if (dist(G.px, G.py, dpt[0] * T, dpt[1] * T) < 50) {
                                S.drop++;
                                SFX.door();
                                if (S.drop >= DROPS.length) {
                                    G.money += 400;
                                    G.earned += 400;
                                    G.side = null;
                                    sideCd = 3;
                                    SFX.cash();
                                    toast("All drops done. $400.");
                                } else toast("Drop " + S.drop + "/" + DROPS.length + " done.");
                            } else if (S.t <= 0) {
                                G.side = null;
                                sideCd = 3;
                                toast("Delivery failed. Too slow.");
                            }
                        }
                    }
                    return;
                }
                if (!G.mission && running && !paused && sideCd <= 0) {
                    if (dist(G.px, G.py, SIDE_PTS.race.x, SIDE_PTS.race.y) < 55) {
                        if (!G.car) {
                            sideCd = 2.5;
                            toast("You need a car for the street race.");
                            return;
                        }
                        G.side = { kind: "race", cp: 0 };
                        for (let i = 0; i < 2; i++)
                            G.vehs.push(
                                mkVeh(
                                    VEHS[1],
                                    SIDE_PTS.race.x + (i + 1) * 55,
                                    SIDE_PTS.race.y,
                                    0,
                                    { ai: "race" },
                                ),
                            );
                        SFX.job();
                        toast("Street race! Hit all " + RACE_CPS.length + " checkpoints.");
                    } else if (dist(G.px, G.py, SIDE_PTS.taxi.x, SIDE_PTS.taxi.y) < 55) {
                        const taxi = mkVeh(
                            VEHS[0],
                            SIDE_PTS.taxi.x,
                            SIDE_PTS.taxi.y + 30,
                            0,
                            { owned: true },
                        );
                        taxi.spec = { ...VEHS[0], col: "#facc15", label: "Taxi" };
                        G.vehs.push(taxi);
                        G.side = { kind: "taxi", fare: 0, phase: 0, wait: 0, taxi };
                        SFX.job();
                        toast("Taxi shift! Get in the marked cab and pick up fares.");
                    } else if (
                        dist(G.px, G.py, SIDE_PTS.deliv.x, SIDE_PTS.deliv.y) < 55
                    ) {
                        G.side = { kind: "deliv", drop: 0, phase: 0, t: 130 };
                        SFX.job();
                        toast("Delivery job. Grab the package at the depot.");
                    }
                }
            }
            function openShop(k) {
                curShop = k;
                sTitle.textContent = SHOPS[k].title;
                renderShop();
                showOv(ov.shop);
                SFX.door();
            }
            function renderShop() {
                sList.innerHTML = SHOPS[curShop].items
                    .map((it) => {
                        let owned = "",
                            dis = G.money < it.price;
                        if (
                            (it.id === "shotgun" || it.id === "smg") &&
                            G.weapons.includes(it.id)
                        ) {
                            owned = " (owned)";
                            dis = true;
                        }
                        return (
                            '<button data-buy="' +
                            it.id +
                            '"' +
                            (dis ? " disabled" : "") +
                            "><span>" +
                            it.label +
                            owned +
                            "</span><span>$" +
                            it.price +
                            "</span></button>"
                        );
                    })
                    .join("");
            }
            function buyItem(id) {
                const it = SHOPS[curShop].items.find((x) => x.id === id);
                if (!it || G.money < it.price) return;
                let msg = "Purchased.";
                if (id === "shotgun" || id === "smg") {
                    if (G.weapons.includes(id)) return;
                    G.weapons.push(id);
                    G.ammo[id] = (G.ammo[id] || 0) + (id === "shotgun" ? 16 : 60);
                    msg = "Weapon purchased.";
                } else if (id === "a_pistol") G.ammo.pistol += 24;
                else if (id === "a_shotgun") G.ammo.shotgun += 16;
                else if (id === "a_smg") G.ammo.smg += 60;
                else if (id === "medkit") {
                    if (G.medkits >= 5) {
                        toast("You can carry five medkits.");
                        return;
                    }
                    G.medkits++;
                } else if (id === "armor") {
                    G.armor = 120;
                    msg = "Armor equipped.";
                } else if (id === "plates") {
                    G.heat = 0;
                    msg = "Plates swapped. Heat is off.";
                } else if (id.slice(0, 2) === "v_") {
                    const spec = VEHS.find((x) => "v_" + x.id === id);
                    G.vehs.push(
                        mkVeh(spec, city.pois.wheels.dx, city.pois.wheels.dy + 60, 0, {
                            owned: true,
                        }),
                    );
                    if (!G.ownedCars.includes(spec.id)) G.ownedCars.push(spec.id);
                    msg = spec.label + " delivered at the door.";
                }
                G.money -= it.price;
                SFX.cash();
                toast(msg);
                renderShop();
            }
            function doSave() {
                G.save = JSON.stringify({
                    money: G.money,
                    hp: G.hp,
                    armor: G.armor,
                    medkits: G.medkits,
                    weapons: G.weapons,
                    cur: G.cur,
                    ammo: G.ammo,
                    done: G.done,
                    ownedCars: G.ownedCars,
                    kills: G.kills,
                    earned: G.earned,
                    px: G.px,
                    py: G.py,
                });
                SFX.door();
                toast("Progress saved.");
            }
            function doLoad() {
                if (!G.save) {
                    toast("No save yet.");
                    return;
                }
                const raw = JSON.parse(G.save);
                Object.assign(G, applySave(raw));
                G.px = typeof raw.px === "number" ? raw.px : G.px;
                G.py = typeof raw.py === "number" ? raw.py : G.py;
                G.heat = 0;
                G.arrest = 0;
                G.car = null;
                G.mission = null;
                G.side = null;
                for (const v of G.vehs) v.mission = false;
                G.vehs = G.vehs.filter((v) => v.ai !== "race");
                SFX.door();
                toast("Progress loaded.");
            }
            function respawn() {
                G.money -= Math.ceil(G.money * 0.1);
                G.hp = 100;
                G.heat = 0;
                G.arrest = 0;
                G.car = null;
                G.px = city.pois.pd.dx + 50;
                G.py = city.pois.pd.dy + 40;
            }
            function maintain(dt) {
                civCd -= dt;
                let civs = 0,
                    gangs = 0;
                for (const n of G.npcs) {
                    if (n.kind === "civ") {
                        civs++;
                        if (dist(n.x, n.y, G.px, G.py) > 950) n.dead = true;
                    } else if (n.kind === "gang" && !n.m) gangs++;
                }
                if (civs < 12 && civCd <= 0) {
                    spawnCiv(true);
                    civCd = 0.4;
                }
                if (gangs < 5 && civCd <= 0) spawnGang(false);
                let traffic = 0;
                for (const v of G.vehs) {
                    if (v.ai !== "traffic" || v.dead) continue;
                    if (dist(v.x, v.y, G.px, G.py) > 1250) v.dead = true;
                    else traffic++;
                }
                if (traffic < 7 && civCd <= 0) spawnTraffic();
            }
            function marker(x, y, col, r) {
                return (
                    '<circle cx="' +
                    x +
                    '" cy="' +
                    y +
                    '" r="' +
                    (r || 17) +
                    '" fill="none" stroke="' +
                    col +
                    '" stroke-width="3" opacity="0.9"/><circle cx="' +
                    x +
                    '" cy="' +
                    y +
                    '" r="' +
                    (5 + Math.sin(G.time * 5) * 2.5).toFixed(1) +
                    '" fill="' +
                    col +
                    '"/>'
                );
            }
            function tag(x, y, col, txt, dy) {
                return (
                    '<text x="' +
                    x +
                    '" y="' +
                    (y + (dy === undefined ? -24 : dy)) +
                    '" font-size="12" font-family="inherit" text-anchor="middle" fill="' +
                    col +
                    '" font-weight="700">' +
                    txt +
                    "</text>"
                );
            }
            function render() {
                const MSC = 300 / WW;
                let s = "";
                if (running && !G.mission && !G.side) {
                    if (G.done < MISSIONS.length) {
                        s +=
                            marker(city.pois.bar.dx, city.pois.bar.dy, "#facc15") +
                            tag(city.pois.bar.dx, city.pois.bar.dy, "#facc15", "JOB !", 30);
                    }
                    s +=
                        marker(SIDE_PTS.race.x, SIDE_PTS.race.y, "#4ade80") +
                        tag(SIDE_PTS.race.x, SIDE_PTS.race.y, "#4ade80", "RACE");
                    s +=
                        marker(SIDE_PTS.taxi.x, SIDE_PTS.taxi.y, "#4ade80") +
                        tag(SIDE_PTS.taxi.x, SIDE_PTS.taxi.y, "#4ade80", "TAXI");
                    s +=
                        marker(SIDE_PTS.deliv.x, SIDE_PTS.deliv.y, "#4ade80") +
                        tag(SIDE_PTS.deliv.x, SIDE_PTS.deliv.y, "#4ade80", "DELIVERY");
                }
                if (G.mission) {
                    const st = G.mission.d.steps[G.mission.si];
                    const pt = stepPoint(st);
                    if (pt) s += marker(pt.x.toFixed(0), pt.y.toFixed(0), "#facc15");
                    else if (st.k === "kill")
                        s += marker(city.pois.ware.dx, city.pois.ware.dy, "#facc15");
                }
                if (G.side) {
                    const pt = sidePoint();
                    if (pt)
                        s +=
                            marker(pt.x.toFixed(0), pt.y.toFixed(0), "#4ade80") +
                            tag(pt.x.toFixed(0), pt.y.toFixed(0), "#4ade80", pt.label);
                }
                const TAGS = { ammo: "A", wheels: "V", mart: "M" };
                for (const k in TAGS) {
                    const p = city.pois[k];
                    s +=
                        '<rect x="' +
                        (p.dx - 7) +
                        '" y="' +
                        (p.dy - 7) +
                        '" width="14" height="14" rx="3" fill="' +
                        p.c +
                        '" stroke="#ffffffcc" stroke-width="2"/>' +
                        '<text x="' +
                        p.dx +
                        '" y="' +
                        (p.dy + 4) +
                        '" font-size="11" font-family="inherit" text-anchor="middle" fill="#ffffff" font-weight="800">' +
                        TAGS[k] +
                        "</text>";
                }
                for (const p of G.pickups) {
                    if (p.on)
                        s +=
                            '<circle cx="' +
                            p.x +
                            '" cy="' +
                            p.y +
                            '" r="8" fill="#22c55e" stroke="#14532d" stroke-width="2"/><text x="' +
                            p.x +
                            '" y="' +
                            (p.y + 3) +
                            '" font-size="9" font-family="inherit" text-anchor="middle" fill="#ffffff" font-weight="800">$</text>';
                }
                for (const v of G.vehs) {
                    s +=
                        '<g transform="translate(' +
                        v.x.toFixed(1) +
                        " " +
                        v.y.toFixed(1) +
                        ") rotate(" +
                        (v.ang * 57.2958).toFixed(1) +
                        ')"><rect x="' +
                        -v.spec.w / 2 +
                        '" y="' +
                        -v.spec.h / 2 +
                        '" width="' +
                        v.spec.w +
                        '" height="' +
                        v.spec.h +
                        '" rx="4" fill="' +
                        v.spec.col +
                        '" stroke="#00000088" stroke-width="2"/><rect x="' +
                        (-v.spec.w / 2 + 5) +
                        '" y="' +
                        (-v.spec.h / 2 + 3) +
                        '" width="' +
                        (v.spec.w - 10) +
                        '" height="' +
                        (v.spec.h - 6) +
                        '" rx="2" fill="#00000042"/></g>';
                    if (v.hp < v.spec.hp)
                        s +=
                            '<rect x="' +
                            (v.x - 16) +
                            '" y="' +
                            (v.y - v.spec.h / 2 - 10) +
                            '" width="32" height="4" rx="2" fill="#334155"/><rect x="' +
                            (v.x - 16) +
                            '" y="' +
                            (v.y - v.spec.h / 2 - 10) +
                            '" width="' +
                            Math.max(0, (32 * v.hp) / v.spec.hp).toFixed(1) +
                            '" height="4" rx="2" fill="#f87171"/>';
                }
                for (const n of G.npcs) {
                    const col =
                        n.kind === "cop"
                            ? "#3b82f6"
                            : n.kind === "gang"
                                ? "#ea580c"
                                : n.col;
                    const r = n.kind === "civ" ? 7 : 8;
                    s +=
                        '<circle cx="' +
                        n.x.toFixed(1) +
                        '" cy="' +
                        n.y.toFixed(1) +
                        '" r="' +
                        r +
                        '" fill="' +
                        col +
                        '" stroke="#0b1020" stroke-width="2"/>';
                }
                if (!G.car) {
                    s +=
                        '<g transform="translate(' +
                        G.px.toFixed(1) +
                        " " +
                        G.py.toFixed(1) +
                        ')"><circle r="9" fill="#f8fafc" stroke="#0f172a" stroke-width="2.5"/><line x1="0" y1="0" x2="' +
                        (G.dirX * 15).toFixed(1) +
                        '" y2="' +
                        (G.dirY * 15).toFixed(1) +
                        '" stroke="#0f172a" stroke-width="3.5"/></g>';
                }
                for (const b of G.bullets)
                    s +=
                        '<rect x="' +
                        (b.x - 2).toFixed(1) +
                        '" y="' +
                        (b.y - 2).toFixed(1) +
                        '" width="4" height="4" fill="' +
                        (b.who === "p" ? "#fde047" : "#fb923c") +
                        '"/>';
                for (const f of G.fxs) {
                    const p = f.t / f.dur;
                    s +=
                        '<circle cx="' +
                        f.x.toFixed(1) +
                        '" cy="' +
                        f.y.toFixed(1) +
                        '" r="' +
                        (f.r * (0.3 + 0.7 * p)).toFixed(1) +
                        '" fill="none" stroke="' +
                        f.c +
                        '" stroke-width="3" opacity="' +
                        Math.max(0, 1 - p).toFixed(2) +
                        '"/>';
                }
                dynG.innerHTML = s;
                svg.setAttribute(
                    "viewBox",
                    clamp(G.px - CAMW / 2, 0, WW - CAMW).toFixed(0) +
                    " " +
                    clamp(G.py - CAMH / 2, 0, WH - CAMH).toFixed(0) +
                    " " +
                    CAMW +
                    " " +
                    CAMH,
                );
                let m = "";
                if (G.mission) {
                    const pt = stepPoint(G.mission.d.steps[G.mission.si]);
                    if (pt)
                        m +=
                            '<circle cx="' +
                            (pt.x * MSC).toFixed(1) +
                            '" cy="' +
                            (pt.y * MSC).toFixed(1) +
                            '" r="5" fill="#facc15"/>';
                }
                if (G.side) {
                    const pt = sidePoint();
                    if (pt)
                        m +=
                            '<circle cx="' +
                            (pt.x * MSC).toFixed(1) +
                            '" cy="' +
                            (pt.y * MSC).toFixed(1) +
                            '" r="5" fill="#4ade80"/>';
                }
                for (const n of G.npcs)
                    if (n.kind === "cop")
                        m +=
                            '<circle cx="' +
                            (n.x * MSC).toFixed(1) +
                            '" cy="' +
                            (n.y * MSC).toFixed(1) +
                            '" r="3" fill="#ef4444"/>';
                m +=
                    '<circle cx="' +
                    (G.px * MSC).toFixed(1) +
                    '" cy="' +
                    (G.py * MSC).toFixed(1) +
                    '" r="4" fill="#ffffff"/>';
                miniG.innerHTML = m;
            }
            function updateHud() {
                hud.cash.textContent = "$" + G.money;
                hud.hp.textContent = Math.max(0, Math.ceil(G.hp));
                hud.arm.textContent = "ARMOR " + Math.ceil(G.armor);
                hud.med.textContent = "MED " + G.medkits;
                hud.med.hidden = G.medkits <= 0;
                const w = WEAPONS[G.cur];
                hud.wep.textContent =
                    w.label + (w.pel ? " " + (G.ammo[w.id] || 0) : "");
                const stars = wantedFromHeat(G.heat);
                let sh = "";
                for (let i = 0; i < 5; i++) {
                    sh +=
                        '<svg viewBox="0 0 24 24" width="13" height="13"><path d="M12 2l2.9 6.3 6.9.8-5.1 4.7 1.4 6.8L12 17l-6.1 3.6 1.4-6.8L2.2 9.1l6.9-.8z" fill="' +
                        (i < stars ? "#facc15" : "#ffffff26") +
                        '"/></svg>';
                }
                hud.stars.innerHTML = sh;
                let tt = 0;
                if (G.mission && G.mission.d.time) tt = G.mission.t;
                else if (G.side && G.side.kind === "deliv" && G.side.phase === 1)
                    tt = G.side.t;
                if (tt > 0) {
                    hud.tchip.hidden = false;
                    hud.time.textContent = Math.ceil(tt);
                } else hud.tchip.hidden = true;
                let obj = "";
                if (G.mission) {
                    const M = G.mission,
                        st = M.d.steps[M.si];
                    obj = "Job " + (G.done + 1) + "/10 " + M.d.name + ": " + st.t;
                    if (st.k === "kill")
                        obj += " (" + Math.max(0, st.n - M.killed) + " left)";
                    if (st.k === "rob" || st.k === "hold")
                        obj += " (" + Math.max(0, Math.ceil(st.sec - M.prog)) + "s)";
                } else if (G.side) {
                    const pt = sidePoint();
                    obj = "Side job: " + (pt ? pt.label : "");
                } else if (G.done < MISSIONS.length)
                    obj =
                        "Meet Vinnie at the bar (yellow marker) for job " +
                        (G.done + 1) +
                        "/10.";
                else obj = "All jobs done. Free roam - stack cash!";
                hud.obj.textContent = obj;
                hud.obj.hidden = !running;
                hud.arrest.hidden = !(G.arrest > 0.1);
            }
            function tick(dt) {
                G.time += dt;
                updatePlayer(dt);
                updateVehicles(dt);
                updateNpcs(dt);
                updateBullets(dt);
                updatePickups(dt);
                updateWanted(dt);
                tickMission(dt);
                tickSide(dt);
                maintain(dt);
                for (const f of G.fxs) f.t += dt;
                G.fxs = G.fxs.filter((f) => f.t < f.dur);
                render();
                hudT += dt;
                if (hudT > 0.12) {
                    hudT = 0;
                    updateHud();
                }
            }
            function loop() {
                const now = Date.now();
                const dt = Math.min(0.05, (now - lastT) / 1000);
                lastT = now;
                if (active && running && !paused) tick(dt);
            }
            renderStatic();
            init();
            updateHud();
            syncUI();
            active = true;
            lastT = Date.now();
            iv = setInterval(loop, 33);
            mount._test = {
                T, MW, MH, RX, RY, WEAPONS, VEHS, MISSIONS, POIS, HEAT, COPS_PER, SHOPS,
                RACE_CPS, DISTS, rng: mulberry32, clamp, dist, districtOf, copCount,
                fareCalc, raceReward, wantedFromHeat, tileAt, steerSign, vehStep,
                genCity, defaultState, applySave,
            };
            return {
                destroy() {
                    destroyed = true;
                    active = false;
                    clearK();
                    if (iv) {
                        clearInterval(iv);
                        iv = 0;
                    }
                    if (toastTO) clearTimeout(toastTO);
                    document.removeEventListener("keydown", onKeyDown);
                    document.removeEventListener("keyup", onKeyUp);
                    app.removeEventListener("pointerdown", onPointerDown);
                    app.removeEventListener("pointerup", onPointerUp);
                    app.removeEventListener("pointerleave", onPointerUp);
                    app.removeEventListener("pointercancel", onPointerUp);
                    app.removeEventListener("click", onClick);
                },
            };
        }
