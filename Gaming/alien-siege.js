/*
 * Alien Siege — RTS + Tower Defense melawan invasi alien serangga.
 * Mengikuti template game: export META + mount(root, context).
 * Setelah file ini ada di folder games, jalankan: node tools/build-games-manifest.mjs
 */

import { iconSVG } from "../JS/icons.js";

export const META = {
    id: "alien-siege", // harus sama dengan nama file (tanpa .js)
    name: "Alien Siege",
    category: "strategy",
    catLabel: "Strategy",
    desc: "Bangun markas, pasang turret, kerahkan pasukan darat-laut-udara dan robot untuk menahan invasi alien serangga. Solo vs AI atau Co-op 2 pemain. Level acak yang selalu bisa diselesaikan.",
    art: '<svg viewBox="0 0 48 48" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="24" cy="27" rx="9" ry="11"/><path d="M24 16v-6M17 21l-8-6M31 21l8-6M16 28l-9 2M32 28l9 2M18 36l-6 7M30 36l6 7M21 25h.01M27 25h.01"/></svg>',
    bg: ["#38bdf8", "#0f172a"],
    bestKey: "alienSiegeBest",
};

/* ============================ DATA ============================ */
const TS = 32, MW = 64, MH = 44, N = MW * MH, STEP = 1 / 30, BR = 11;
const RK = ["e", "m", "c", "f", "b", "d"];
const RLABEL = { e: "Energy", m: "Metal", c: "Credits", f: "Fuel", b: "Bio", d: "Data" };
const RCOL = { e: "#facc15", m: "#94a3b8", c: "#4ade80", f: "#fb923c", b: "#c084fc", d: "#38bdf8" };
const OC = ["#38bdf8", "#4ade80"];
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const cellAt = (x, y) => clamp((y / TS) | 0, 0, MH - 1) * MW + clamp((x / TS) | 0, 0, MW - 1);
const cxOf = (i) => ((i % MW) + 0.5) * TS;
const cyOf = (i) => (((i / MW) | 0) + 0.5) * TS;
const pick = (a) => a[(Math.random() * a.length) | 0];
const shuffle = (a) => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0;[a[i], a[j]] = [a[j], a[i]]; } return a; };
function mulberry(a) { return function () { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const costStr = (c) => Object.keys(c).map((k) => k.toUpperCase() + c[k]).join(" ") || "gratis";
const DIRS = ["Timur", "Tenggara", "Selatan", "Barat Daya", "Barat", "Barat Laut", "Utara", "Timur Laut"];
const dirName = (dx, dy) => DIRS[(((Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) % 8) + 8) % 8)];

const D = {};
const defU = (tm, rows) => {
    for (const id in rows) {
        const [n, d, cl, hp, sp, r, dmg, cd, c, t, x] = rows[id];
        D[id] = { id, k: "u", tm, n, d, cl, hp, sp, r, dmg, cd, c, t, tg: "ls", z: clamp(5 + Math.sqrt(hp) * 0.5, 6, 40), ...x };
    }
};
// [nama, domain(l/s/a), kelas riset, hp, speed, range, dmg, cooldown, biaya, waktu produksi, ekstra]
defU("h", {
    inf: ["Infantry", "l", "inf", 60, 70, 120, 6, 0.5, { c: 50 }, 5, { tg: "lsa" }],
    hv: ["Heavy Soldier", "l", "inf", 150, 55, 130, 14, 0.7, { m: 30, c: 90 }, 8, { tg: "lsa" }],
    sn: ["Sniper", "l", "inf", 50, 60, 270, 38, 1.6, { m: 20, c: 110 }, 9, { tg: "lsa", rq: ["inf", 1] }],
    md: ["Medic", "l", "inf", 55, 75, 0, 0, 1, { c: 70 }, 6, { heal: 14 }],
    en: ["Engineer", "l", "inf", 60, 70, 0, 0, 1, { c: 60 }, 6, { rep: 22 }],
    tk: ["Tank", "l", "veh", 320, 62, 190, 30, 1.1, { m: 120, c: 100, f: 20 }, 12, { sp: 26, ar: 1 }],
    apc: ["APC", "l", "veh", 260, 90, 110, 7, 0.3, { m: 90, c: 80, f: 15 }, 9, { cap: 4 }],
    art: ["Artillery", "l", "veh", 120, 36, 390, 55, 3, { m: 140, c: 140, f: 30 }, 14, { sp: 50, tg: "l", rq: ["veh", 1] }],
    pb: ["Patrol Boat", "s", "nav", 140, 125, 150, 8, 0.4, { m: 50, c: 60, f: 15 }, 8, { tg: "lsa" }],
    fr: ["Frigate", "s", "nav", 300, 95, 230, 18, 0.9, { m: 100, c: 120, f: 25 }, 12, { tg: "lsa" }],
    ds: ["Destroyer", "s", "nav", 520, 80, 290, 40, 1.3, { m: 180, c: 200, f: 40 }, 16, { sp: 30, rq: ["nav", 1] }],
    sm: ["Submarine", "s", "nav", 240, 100, 210, 45, 1.6, { m: 150, c: 160, f: 30 }, 14, { st: 1, rq: ["nav", 1] }],
    cv: ["Aircraft Carrier", "s", "nav", 1100, 50, 330, 30, 1.2, { m: 400, c: 500, f: 100 }, 30, { tg: "lsa", sp: 30, rq: ["nav", 2], ab: "launch" }],
    fj: ["Fighter Jet", "a", "air", 150, 230, 190, 14, 0.3, { m: 80, c: 120, f: 30 }, 10, { tg: "lsa" }],
    bm: ["Bomber", "a", "air", 220, 165, 30, 95, 2.5, { m: 140, c: 180, f: 50 }, 14, { sp: 75, tg: "l", rq: ["air", 1] }],
    ah: ["Attack Helicopter", "a", "air", 200, 140, 170, 20, 0.6, { m: 110, c: 140, f: 35 }, 12, { tg: "lsa" }],
    th: ["Transport Helicopter", "a", "air", 160, 150, 0, 0, 1, { m: 90, c: 110, f: 30 }, 10, { cap: 6 }],
    gs: ["Gunship", "a", "air", 480, 100, 210, 28, 0.35, { m: 220, c: 260, f: 60 }, 20, { tg: "lsa", sp: 28, rq: ["air", 2] }],
    cr: ["Combat Robot", "l", "rob", 220, 78, 150, 16, 0.45, { m: 90, c: 100, b: 1 }, 10, { tg: "lsa", rq: ["rob", 1] }],
    mc: ["Mech", "l", "rob", 640, 56, 210, 38, 0.9, { m: 220, c: 240, f: 30, b: 3 }, 18, { tg: "lsa", sp: 24, rq: ["rob", 2], ab: "stomp" }],
    at: ["Autonomous Tank", "l", "rob", 380, 72, 200, 30, 1, { m: 160, c: 150, f: 20, b: 2 }, 14, { ar: 1, sp: 20, rq: ["ai", 1] }],
    rr: ["Repair Robot", "l", "rob", 140, 85, 0, 0, 1, { m: 60, c: 80 }, 8, { rep2: 22, rq: ["rob", 1] }],
    adu: ["AI Defense Unit", "l", "rob", 320, 30, 250, 22, 0.35, { m: 180, c: 200, e: 40, b: 2 }, 16, { tg: "lsa", rq: ["ai", 1], ab: "deploy" }],
    ucv: ["Unmanned Combat Vessel", "s", "rob", 380, 112, 260, 24, 0.7, { m: 150, c: 160, f: 30, b: 2 }, 14, { tg: "lsa", rq: ["ai", 1] }],
    asm: ["Autonomous Submarine", "s", "rob", 300, 110, 230, 50, 1.4, { m: 180, c: 190, f: 30, b: 2 }, 16, { st: 1, rq: ["ai", 1] }],
    cd: ["Combat Drone", "a", "rob", 90, 200, 150, 10, 0.3, { m: 50, c: 70, f: 10, b: 1 }, 7, { tg: "lsa", rq: ["rob", 1] }],
    rd: ["Recon Drone", "a", "rob", 60, 260, 0, 0, 1, { m: 30, c: 50, f: 10 }, 6, { scout: 1, rq: ["rob", 1] }],
    afd: ["AI Fighter Drone", "a", "rob", 130, 245, 200, 16, 0.25, { m: 100, c: 130, f: 25, b: 2 }, 10, { tg: "lsa", rq: ["ai", 1] }],
    bd: ["Bomber Drone", "a", "rob", 180, 170, 30, 75, 2.2, { m: 130, c: 150, f: 30, b: 2 }, 12, { sp: 65, tg: "l", rq: ["ai", 1] }],
});
// alien: th = nilai ancaman (budget wave), tr = wave minimal muncul
defU("a", {
    wa: ["Worker Ant", "l", "", 30, 72, 18, 4, 0.8, {}, 0, { th: 1, tr: 1, tg: "l" }],
    wr: ["Warrior Ant", "l", "", 75, 82, 20, 8, 0.6, {}, 0, { th: 2, tr: 1, tg: "l" }],
    sk: ["Spider Stalker", "l", "", 110, 112, 140, 10, 0.8, {}, 0, { th: 3, tr: 2, tg: "lsa", slow: [0.45, 3] }],
    cp: ["Centipede", "l", "", 200, 92, 24, 14, 0.4, {}, 0, { th: 4, tr: 3, tg: "l" }],
    bt: ["Beetle Tank", "l", "", 420, 46, 120, 18, 1.4, {}, 0, { th: 7, tr: 3, ar: 1, sp: 22 }],
    sb: ["Scorpion Brute", "l", "", 290, 66, 42, 32, 1, {}, 0, { th: 6, tr: 4, sp: 26, tg: "l", poi: [6, 4] }],
    aq: ["Aquatic Insectoid", "s", "", 90, 86, 100, 9, 0.8, {}, 0, { th: 3, tr: 3 }],
    sc: ["Sea Crawler", "s", "", 230, 70, 150, 16, 0.9, {}, 0, { th: 5, tr: 4 }],
    lv: ["Leviathan", "s", "", 1300, 50, 330, 55, 2, {}, 0, { th: 22, tr: 7, sp: 50 }],
    ws: ["Wasp Swarm", "a", "", 25, 170, 18, 3, 0.4, {}, 0, { th: 1, tr: 2, tg: "lsa", sw: 4 }],
    fm: ["Flying Mantis", "a", "", 90, 150, 22, 14, 0.6, {}, 0, { th: 3, tr: 3, tg: "lsa" }],
    hn: ["Hornet", "a", "", 150, 190, 125, 10, 0.5, {}, 0, { th: 4, tr: 4, tg: "lsa", poi: [3, 4] }],
    gm: ["Giant Moth", "a", "", 330, 90, 160, 9, 1, {}, 0, { th: 8, tr: 6, tg: "lsa", sp: 42, aura: [8, 130] }],
    qa: ["Queen Alien", "l", "", 3500, 34, 170, 30, 1, {}, 0, { boss: 1, tg: "lsa", spw: ["wr", 7, 6], aura: [6, 170] }],
    cb: ["Colossal Beetle", "l", "", 6500, 30, 100, 80, 1.8, {}, 0, { boss: 1, ar: 1, sp: 60, tg: "l", slam: [110, 6] }],
    ho: ["Hive Overlord", "a", "", 4800, 44, 230, 40, 1.2, {}, 0, { boss: 1, tg: "lsa", sp: 50, spw: ["ws", 6, 8] }],
});
const defB = (id, n, g, sz, hp, c, t, x = {}) => {
    D[id] = { id, k: "b", tm: "h", n, g, sz, hp, c, t, d: "l", z: (sz * TS) / 2, r: 0, dmg: 0, cd: 1, tg: "ls", cl: "", ...x };
};
defB("hq", "HQ", "HQ", 3, 2400, {}, 0, { pr: ["en", "inf"], inc: { c: 4, e: 2, d: 0.1 } });
defB("pg", "Power Generator", "PG", 2, 420, { m: 80, c: 60 }, 10, { inc: { e: 6 } });
defB("rf", "Resource Factory", "RF", 3, 650, { m: 60, c: 150 }, 14, { inc: { m: 2.5, c: 3.5, f: 0.8 } });
defB("bk", "Barracks", "BK", 3, 700, { m: 80, c: 120 }, 12, { pr: ["inf", "hv", "sn", "md", "en"] });
defB("vf", "Vehicle Factory", "VF", 3, 900, { m: 200, c: 200 }, 18, { up: 0.5, pr: ["tk", "apc", "art", "cr", "mc", "at", "rr", "adu"] });
defB("ab", "Airbase", "AB", 4, 850, { m: 300, c: 300, f: 40 }, 22, { up: 0.8, pr: ["fj", "bm", "ah", "th", "gs", "cd", "rd", "afd", "bd"] });
defB("ns", "Naval Shipyard", "NS", 3, 950, { m: 300, c: 300 }, 22, { up: 0.8, pr: ["pb", "fr", "ds", "sm", "cv", "ucv", "asm"], coast: 2 });
defB("rs", "Radar Station", "RD", 2, 360, { m: 120, c: 150, e: 30 }, 12, { up: 0.4, inc: { d: 0.15 } });
defB("rl", "Research Lab", "RL", 3, 620, { m: 150, c: 250, e: 40 }, 16, { up: 0.6, inc: { d: 0.8 } });
defB("mg", "Machine Gun Turret", "MG", 1, 230, { m: 60, c: 40 }, 6, { r: 160, dmg: 5, cd: 0.15, tg: "lsa" });
defB("lt", "Laser Turret", "LT", 1, 260, { m: 100, c: 120, e: 30 }, 8, { r: 210, dmg: 13, cd: 0.3, tg: "lsa", en: 0.5 });
defB("ms", "Missile Turret", "MT", 1, 240, { m: 140, c: 140 }, 9, { r: 300, dmg: 46, cd: 1.4, sp: 34, tg: "lsa" });
defB("ts", "Tesla Tower", "TT", 1, 260, { m: 120, c: 200, e: 40 }, 10, { r: 155, dmg: 28, cd: 1, chain: 3, tg: "lsa", en: 0.8 });
defB("aat", "Anti-Air Turret", "AA", 1, 200, { m: 100, c: 100 }, 8, { r: 290, dmg: 22, cd: 0.35, tg: "a" });
defB("att", "Anti-Tank Turret", "AT", 1, 300, { m: 120, c: 140 }, 9, { r: 250, dmg: 80, cd: 1.8, tg: "l", vh: 2.2 });
defB("nd", "Naval Defense Turret", "ND", 1, 280, { m: 130, c: 150 }, 9, { r: 310, dmg: 36, cd: 0.9, tg: "s", coast: 4 });
defB("cc", "Coastal Defense Cannon", "CC", 2, 400, { m: 220, c: 260 }, 14, { r: 430, dmg: 95, cd: 2.4, sp: 44, tg: "ls", coast: 4 });
defB("bu", "Bunker", "BU", 2, 650, { m: 90, c: 70 }, 9, { r: 150, dmg: 9, cd: 0.25, tg: "lsa", cap: 4 });
defB("wl", "Wall", "", 1, 450, { m: 12 }, 2, {});
D.hive = { id: "hive", k: "b", tm: "a", n: "Alien Hive", g: "", sz: 3, hp: 3200, z: 48, d: "l", r: 0, dmg: 0, cd: 1, tg: "", c: {}, t: 0, cl: "", spw: ["wr", 12, 8] };

const BUILD = ["pg", "rf", "bk", "vf", "ab", "ns", "rs", "rl"];
const DEFENSE = ["mg", "lt", "ms", "ts", "aat", "att", "nd", "cc", "bu", "wl"];
const UNITS = Object.keys(D).filter((i) => D[i].k === "u" && D[i].tm === "h");
const RS = {
    inf: ["Infantry Research", "Infantry +12% HP & damage per level. Lv1: Sniper."],
    veh: ["Vehicle Technology", "Vehicles +12% per level. Lv1: Artillery."],
    nav: ["Naval Technology", "Ships +12% per level. Lv1: Destroyer, Submarine. Lv2: Carrier."],
    air: ["Aircraft Technology", "Aircraft +12% per level. Lv1: Bomber. Lv2: Gunship."],
    rob: ["Robot Upgrade", "Robots +12% per level. Lv1: Combat Robot, Repair Robot, Combat/Recon Drone. Lv2: Mech."],
    wpn: ["Weapon Research", "Semua senjata & turret +10% damage per level."],
    arm: ["Armor Upgrade", "Semua unit & bangunan menerima 8% lebih sedikit damage per level."],
    ai: ["AI Technology", "Lv1: unit AI + AI Command (auto-defend). Lv2: turret menembak lebih cepat."],
    bio: ["Alien Biology Research", "+10% damage ke alien per level. Lv3: drop Bio lebih banyak."],
};
const FUEL = { veh: 0.015, nav: 0.015, air: 0.025, rob: 0.01 };
const RSPRE = { nav: { 2: ["veh", 1] }, air: { 2: ["wpn", 1] }, rob: { 2: ["veh", 1] }, ai: { 2: ["rob", 1], 3: ["rob", 2] }, bio: { 3: ["wpn", 2] } };
const PW = {
    air: { n: "Airstrike", cd: 90, c: { c: 300, e: 40 }, tgt: 1, d: "Bom beruntun di area target (darat & laut)." },
    orb: { n: "Orbital Laser", cd: 120, c: { c: 250, e: 80, d: 20 }, tgt: 1, d: "Sinar orbital 5 detik, menghantam semua alien termasuk udara." },
    stasis: { n: "Stasis Field", cd: 100, c: { e: 60, d: 15 }, tgt: 1, d: "Memperlambat alien di area selama 8 detik." },
    drop: { n: "Supply Drop", cd: 150, c: {}, d: "Kiriman Metal, Credits, Fuel & Energy." },
    rep: { n: "Repair Wave", cd: 80, c: { e: 30 }, d: "Memulihkan 35% HP semua unit dan bangunan." },
};
const CHAT = ["Pertahankan di sini!", "Butuh pertahanan udara!", "Serang sekarang!", "Butuh resource!", "Mundur ke markas!"];
const PRI = ["Terdekat", "Terkuat", "Terlemah", "Udara dulu"];
const upgradable = (d) => d.k === "b" && d.tm === "h" && d.id !== "wl" && Boolean(d.dmg || d.inc || d.pr);
const upCost = (d, lv) => { const m = lv + 1, b = d.id === "hq" ? { m: 150, c: 200 } : d.c, o = {}; for (const k of ["m", "c"]) o[k] = Math.round(((b[k] || 0) * 0.8 + (k === "c" ? 50 : 0)) * m); return o; };
const rankOf = (e) => (e.rk !== undefined ? e.rk : e.vk >= 15 ? 3 : e.vk >= 8 ? 2 : e.vk >= 3 ? 1 : 0);
const rsCost = (c, L) => ({ c: 120 + 130 * L, d: 8 + 10 * L, ...(["rob", "ai", "bio"].includes(c) ? { b: L } : {}) });
const rsTime = (L) => 18 + 14 * L;
const DIFF = {
    easy: { n: "Easy", w: 0.7, h: 0.8, d: 0.75, s: 1.5, i: 1.2, tot: 8, bw: 6, hv: 1 },
    normal: { n: "Normal", w: 1, h: 1, d: 1, s: 1, i: 1, tot: 10, bw: 7, hv: 1 },
    hard: { n: "Hard", w: 1.35, h: 1.2, d: 1.2, s: 0.8, i: 0.9, tot: 12, bw: 8, hv: 2 },
    nightmare: { n: "Nightmare", w: 1.8, h: 1.45, d: 1.4, s: 0.6, i: 0.8, tot: 15, bw: 9, hv: 2 },
};
const MISSIONS = {
    survive: "Defend HQ — Survive Waves",
    hive: "Destroy Alien Hive",
    queen: "Destroy Alien Queen",
    boss: "Eliminate Alien Boss",
    capture: "Capture Strategic Locations",
    naval: "Protect Naval Base",
    airbase: "Protect Airbase",
};
const KL = { ground: "Ground Wave", naval: "Naval Invasion", air: "Air Assault", multi: "Multi-Directional Attack", random: "Random Attack", elite: "Elite Wave", swarm: "Swarm Wave", boss: "Boss Wave" };

const HELP = [
    ["Tujuan", "Alien serangga menyerang markasmu lewat darat, laut, dan udara. <b>HQ hancur = kalah.</b> Setiap level dibuat acak dan sudah dicek bisa diselesaikan (jalur darat, pantai, dan sumber daya selalu tersedia). Misi ditampilkan di bagian atas layar: bertahan beberapa wave, hancurkan hive, bunuh Queen/Boss, rebut lokasi, atau lindungi pangkalan laut/udara."],
    ["Ekonomi", "Enam sumber daya: <b>E</b>nergy (Power Generator), <b>M</b>etal, <b>C</b>redits, <b>F</b>uel (Resource Factory, bonus bila dekat node di peta), <b>B</b>io (drop dari alien yang dibunuh), <b>D</b>ata (Research Lab). Turret Laser/Tesla butuh Energy untuk menembak. Mulai dengan: Power Generator, Resource Factory, lalu Barracks."],
    ["Membangun & bertahan", "Tab <b>Build</b> dan <b>Defense</b>: pilih bangunan, lalu klik/tap lokasi (radius 11 petak dari bangunanmu). Naval Shipyard dan turret laut harus dekat air. Machine Gun/Laser/Missile/Tesla melawan semua; Anti-Air hanya udara; Anti-Tank kuat vs kendaraan lapis baja dan beetle; Coastal Cannon menghantam kapal alien. Tembok memperlambat alien."],
    ["Pasukan", "Tab <b>Units</b> memproduksi unit di bangunan yang sesuai (Barracks, Vehicle Factory, Airbase, Shipyard). Pilih unit lalu beri perintah. Medic menyembuhkan infantri, Engineer memperbaiki bangunan, Repair Robot memperbaiki kendaraan. APC dan Transport Helicopter mengangkut infantri (klik kanan transport, lalu tombol Unload). Setelah riset AI, <b>AI Command</b> membuat unit diam menjaga markas otomatis."],
    ["Upkeep & upgrade", "<b>Energy</b>: bangunan canggih (Vehicle Factory, Airbase, Shipyard, Radar, Lab) memakai Energy tiap detik. Bila Energy habis, produksi dan riset melambat dan Radar mati; lihat angka +/- di samping E. <b>Fuel</b>: kendaraan, kapal, pesawat, dan robot memakai Fuel saat bergerak; bila habis unit melambat 60%. <b>Upgrade</b> bangunan sampai Lv3 lewat panel seleksi (HP, damage, jangkauan, produksi, dan income naik). <b>Rally point</b>: pilih bangunan produksi lalu tekan Rally. <b>Bunker</b>: masukkan infantri (klik kanan) untuk bonus damage."],
    ["Riset", "Bangun Research Lab, lalu buka tab <b>Research</b>. Sembilan jalur, masing-masing 3 level: infantri, kendaraan, laut, udara, robot, senjata, armor, AI, dan biologi alien. Beberapa unit baru hanya terbuka setelah riset tertentu."],
    ["Kontrol desktop", "<b>Klik kiri</b>: pilih (klik dua kali = pilih semua sejenis). <b>Drag cepat</b>: geser kamera; <b>tahan ~0,3 dtk lalu geser</b>: drag kotak pilih unit. <b>Klik kanan</b>: gerak / serang. <b>WASD</b> atau panah: geser kamera, <b>roda mouse</b>: zoom. <b>Q</b>: attack-move, <b>X</b>: stop, <b>H</b>: hold, <b>Z</b>: unload, <b>Ctrl+A</b>: semua pasukan, <b>Ctrl+1-9</b> / <b>1-9</b>: grup. <b>V</b>: patroli, <b>E</b>: kemampuan unit, <b>B/T/U/R/G/Y</b>: tab, <b>N</b>: ping, <b>P</b>: jeda, <b>C</b>: cheat, <b>Esc</b>: batal, <b>F</b>: ke HQ."],
    ["Kontrol mobile", "Tombol virtual muncul otomatis di layar sentuh (atau tombol Touch di atas). <b>D-pad</b> menggeser kamera, +/- zoom. <b>Tap</b> unit/bangunan untuk memilih; <b>double-tap</b> tanah/musuh/transport untuk gerak/serang/board (double-tap unit sendiri = pilih semua sejenis). <b>Tahan ~0,3 dtk lalu geser</b> untuk drag kotak pilih area; <b>geser cepat</b> menggeser kamera. Tombol: <b>All</b> pilih semua pasukan, <b>Q</b> attack-move, <b>Stop</b>, <b>Box</b> (drag langsung pilih area tanpa tahan), <b>Batal</b>."],
    ["Kemampuan komandan", "Butuh <b>Radar Station</b>. Tab <b>Powers</b> (G): <b>Airstrike</b> dan <b>Orbital Laser</b> dan <b>Stasis Field</b> (pilih lokasi), <b>Supply Drop</b>, <b>Repair Wave</b>. Setiap kemampuan punya cooldown. Unit juga punya kemampuan: Carrier meluncurkan pesawat, Mech menghentak tanah, AI Defense Unit bisa di-<b>Deploy</b> (E). Unit yang banyak membunuh naik pangkat (▲) dan menjadi lebih kuat. Turret bisa diatur prioritas targetnya."],
    ["AI Command & Co-op", "Riset <b>AI Technology</b> membuka tombol: <b>Auto-defend</b> (Lv1), <b>Auto-repair</b> jarak jauh (Lv1), <b>Auto-rebuild</b> bangunan yang hancur (Lv2), <b>Focus fire</b> (Lv3). Co-op: tab <b>Tim</b> (Y) untuk ping (Alt+klik), pesan cepat, dan kirim resource bila markas terpisah. Bagi peran: satu pemain fokus darat+turret, satu lagi laut+udara+riset (combined arms)."],
    ["Tips", "Radar Station menampilkan alien di minimap dan jenis wave berikutnya. Wave pertama: lihat hasil undian siapa yang mulai lebih dulu. Tempatkan turret di arah datangnya alien, jangan lupa Anti-Air dan pertahanan pantai. Gunakan Cheat (C) bila ingin santai. Skor terbaik hanya tersimpan jika tidak memakai cheat."],
];

/* ============================ GAME ============================ */
export function mount(root, context = {}) {
    const { mode = "ai", room = null, playerName = "Player", onExit = () => { } } = context;
    const online = mode === "room" && Boolean(room);
    const playerIndex = online && !room.isHost ? 1 : 0;
    const isHost = !online || room.isHost;
    let roomData = room?.room || null;
    let state = null, map = null, T = new Uint8Array(N), cdist = new Int16Array(N), terrain = null;
    const occ = new Uint8Array(N);
    const byid = new Map(), kids = new Map(), hum = [], ali = [];
    let pathBudget = 0, tickN = 0, fx = [], fxq = [], dead = false, speed = 1;

    /* ---------- peta acak yang dijamin bisa diselesaikan ---------- */
    function genMap(cfg) {
        for (let tr = 1; tr <= 40; tr++) {
            const m = tryMap(mulberry(((cfg.seed >>> 0) + tr * 7919) >>> 0), tr === 40);
            if (m) { m.tries = tr; return m; }
        }
        return null;
    }
    const bfsLand = (t, s) => {
        const seen = new Uint8Array(N), q = [s.y * MW + s.x]; seen[q[0]] = 1;
        const ok = (i) => t[i] === 0;
        for (let h = 0; h < q.length; h++) {
            const c = q[h], x = c % MW, y = (c / MW) | 0;
            for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
                const nx = x + dx, ny = y + dy; if ((!dx && !dy) || nx < 0 || ny < 0 || nx >= MW || ny >= MH) continue;
                const ni = ny * MW + nx; if (seen[ni] || !ok(ni)) continue;
                if (dx && dy && (!ok(y * MW + nx) || !ok(ny * MW + x))) continue;
                seen[ni] = 1; q.push(ni);
            }
        }
        return seen;
    };
    function tryMap(R, plain) {
        const ri = (a, b) => a + Math.floor(R() * (b - a + 1));
        const t = new Uint8Array(N);
        const shore = 33 + R() * 3, amp = 1.2 + R() * 2.2, ph = R() * 6.3, fq = 0.12 + R() * 0.16;
        for (let x = 0; x < MW; x++) { const sy = Math.ceil(shore + amp * Math.sin(x * fq + ph) + (R() - 0.5) * 0.7); for (let y = sy; y < MH; y++) t[y * MW + x] = 1; }
        const hq = [{ x: ri(10, 18), y: ri(21, 25) }]; hq.push({ x: hq[0].x + ri(13, 16), y: hq[0].y + ri(-3, 3) });
        const pts = {
            land: [{ x: ri(16, 48), y: 1 }, { x: MW - 2, y: ri(4, 24) }, { x: 1, y: ri(2, 9) }],
            sea: [{ x: ri(46, 60), y: MH - 3 }, { x: ri(3, 16), y: MH - 3 }],
            hive: [{ x: ri(47, 56), y: ri(5, 12) }, { x: ri(30, 40), y: ri(3, 7) }],
            cap: [{ x: ri(22, 32), y: ri(8, 15) }, { x: ri(36, 46), y: ri(18, 26) }, { x: ri(25, 34), y: ri(26, 29) }],
            node: [],
        };
        for (const c of hq.slice(0, 2)) {
            const nm = c === hq[0] ? 4 : 2, nf = c === hq[0] ? 2 : 1;
            for (let i = 0; i < nm + nf; i++) {
                for (let k = 0; k < 30; k++) {
                    const a = R() * 6.283, d = i < nm ? 5 + R() * 4 : 7 + R() * 5, x = Math.round(c.x + Math.cos(a) * d), y = Math.round(c.y + Math.sin(a) * d);
                    if (x > 2 && x < MW - 3 && y > 2 && y < 30 && t[y * MW + x] === 0) { pts.node.push({ k: i < nm ? "m" : "f", x, y }); break; }
                }
            }
        }
        if (!plain) {
            const keys = [...hq, ...pts.land, ...pts.hive, ...pts.cap, ...pts.node];
            const nr = ri(14, 22);
            for (let i = 0; i < nr; i++) {
                const cx = ri(2, MW - 3), cy = ri(2, 29), rr = 1 + R() * 1.6;
                if (hq.some((p) => Math.hypot(p.x - cx, p.y - cy) < 8) || keys.some((p) => Math.hypot(p.x - cx, p.y - cy) < 4)) continue;
                for (let y = Math.floor(cy - rr); y <= cy + rr; y++) for (let x = Math.floor(cx - rr); x <= cx + rr; x++) if (x >= 0 && y >= 0 && x < MW && y < MH && Math.hypot(x - cx, y - cy) <= rr && t[y * MW + x] === 0) t[y * MW + x] = 2;
            }
        }
        const fxF = R() < 0.5, fyF = R() < 0.5;
        const F = (p) => ({ ...p, x: fxF ? MW - 1 - p.x : p.x, y: fyF ? MH - 1 - p.y : p.y });
        const t2 = new Uint8Array(N);
        for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) t2[(fyF ? MH - 1 - y : y) * MW + (fxF ? MW - 1 - x : x)] = t[y * MW + x];
        const m = { t: t2, hq: hq.map(F), land: pts.land.map(F), sea: pts.sea.map(F), hive: pts.hive.map(F), cap: pts.cap.map(F), node: pts.node.map(F), flip: [fxF, fyF] };
        // validasi: semua titik penting terjangkau lewat darat dari markas
        const reach = bfsLand(t2, m.hq[0]), rc = (p) => reach[p.y * MW + p.x] === 1;
        m.land = m.land.filter(rc); m.sea = m.sea.filter((p) => t2[p.y * MW + p.x] === 1);
        if (!m.land.length || !m.sea.length || !m.hive.every(rc) || !m.cap.every(rc) || !m.hq.every(rc) || m.node.filter(rc).length < 3) return null;
        m.node = m.node.filter(rc);
        const near = (ox, oy, sz, coast) => {
            for (let y = oy; y < oy + sz; y++) for (let x = ox; x < ox + sz; x++) if (x < 0 || y < 0 || x >= MW || y >= MH || t2[y * MW + x] !== 0) return false;
            if (!coast) return true;
            for (let y = oy - coast; y < oy + sz + coast; y++) for (let x = ox - coast; x < ox + sz + coast; x++) if (x >= 0 && y >= 0 && x < MW && y < MH && t2[y * MW + x] === 1) return true;
            return false;
        };
        const spot = (sz, coast) => {
            let best = null, bd = 1e9; const h = m.hq[0];
            for (let oy = h.y - 10; oy <= h.y + 10; oy++) for (let ox = h.x - 10; ox <= h.x + 10; ox++) {
                if (ox <= h.x + 3 && ox + sz - 1 >= h.x - 3 && oy <= h.y + 3 && oy + sz - 1 >= h.y - 3) continue;
                const d = Math.hypot(ox + sz / 2 - h.x, oy + sz / 2 - h.y); if (d < bd && d < 10 && near(ox, oy, sz, coast)) { bd = d; best = { x: ox, y: oy }; }
            }
            return best;
        };
        m.spotNs = spot(3, 2); m.spotAb = spot(4, 0);
        if (!m.spotNs || !m.spotAb) return null;
        return m;
    }
    function coastMap(t) {
        const d = new Int16Array(N).fill(999), q = [];
        for (let i = 0; i < N; i++) if (t[i] === 1) { d[i] = 0; q.push(i); }
        for (let h = 0; h < q.length; h++) {
            const c = q[h], x = c % MW, y = (c / MW) | 0;
            for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= MW || ny >= MH) continue; const ni = ny * MW + nx; if (d[ni] > d[c] + 1) { d[ni] = d[c] + 1; q.push(ni); } }
        }
        return d;
    }

    /* ---------- pathfinding ---------- */
    const gS = new Float32Array(N), prv = new Int32Array(N), seenG = new Uint32Array(N), cloG = new Uint32Array(N);
    let genId = 0;
    const hf = [], hi = [];
    const hpush = (f, i) => { let k = hf.length; hf.push(f); hi.push(i); while (k > 0) { const p = (k - 1) >> 1; if (hf[p] <= f) break; hf[k] = hf[p]; hi[k] = hi[p]; k = p; } hf[k] = f; hi[k] = i; };
    const hpop = () => { const top = hi[0], lf = hf.pop(), li = hi.pop(), n = hf.length; if (n) { let k = 0; for (; ;) { let c = 2 * k + 1; if (c >= n) break; if (c + 1 < n && hf[c + 1] < hf[c]) c++; if (hf[c] >= lf) break; hf[k] = hf[c]; hi[k] = hi[c]; k = c; } hf[k] = lf; hi[k] = li; } return top; };
    const walk = (dom, i, ign) => dom === "a" || (dom === "s" ? T[i] === 1 : T[i] === 0 && (ign || !occ[i]));
    function nearestCell(dom, c, ign, mr = 16) {
        if (walk(dom, c, ign)) return c;
        const x0 = c % MW, y0 = (c / MW) | 0;
        for (let r = 1; r <= mr; r++) {
            let best = -1, bd = 1e9;
            for (let y = y0 - r; y <= y0 + r; y++) for (let x = x0 - r; x <= x0 + r; x++) {
                if (Math.max(Math.abs(x - x0), Math.abs(y - y0)) !== r || x < 0 || y < 0 || x >= MW || y >= MH) continue;
                const i = y * MW + x; if (walk(dom, i, ign)) { const dd = (x - x0) ** 2 + (y - y0) ** 2; if (dd < bd) { bd = dd; best = i; } }
            }
            if (best >= 0) return best;
        }
        return -1;
    }
    function findPath(dom, sx, sy, tx, ty, ign) {
        const s = cellAt(sx, sy), g = nearestCell(dom, cellAt(tx, ty), ign);
        if (g < 0) return null;
        if (s === g) return [walk(dom, cellAt(tx, ty), ign) ? { x: tx, y: ty } : { x: cxOf(g), y: cyOf(g) }];
        genId++; hf.length = 0; hi.length = 0;
        gS[s] = 0; seenG[s] = genId; prv[s] = -1; hpush(0, s);
        const gx = g % MW, gy = (g / MW) | 0; let n = 0;
        while (hf.length && n++ < 5000) {
            const cur = hpop(); if (cloG[cur] === genId) continue; cloG[cur] = genId; if (cur === g) break;
            const x = cur % MW, y = (cur / MW) | 0;
            for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
                if (!dx && !dy) continue; const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= MW || ny >= MH) continue;
                const ni = ny * MW + nx; if (!walk(dom, ni, ign)) continue;
                if (dx && dy && (!walk(dom, y * MW + nx, ign) || !walk(dom, ny * MW + x, ign))) continue;
                const ng = gS[cur] + (dx && dy ? 1.414 : 1);
                if (seenG[ni] !== genId || ng < gS[ni]) { seenG[ni] = genId; gS[ni] = ng; prv[ni] = cur; hpush(ng + Math.hypot(gx - nx, gy - ny), ni); }
            }
        }
        if (cloG[g] !== genId) return null;
        const out = []; for (let c = g; c !== -1 && c !== s; c = prv[c]) out.push({ x: cxOf(c), y: cyOf(c) });
        out.reverse();
        if (g === cellAt(tx, ty) && out.length) out[out.length - 1] = { x: tx, y: ty };
        return out;
    }
    function los(dom, x0, y0, x1, y1, ign) {
        const n = Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 10);
        for (let i = 1; i <= n; i++) if (!walk(dom, cellAt(x0 + ((x1 - x0) * i) / n, y0 + ((y1 - y0) * i) / n), ign)) return false;
        return true;
    }
    function advance(e, d, gx, gy, stop, dt, ign) {
        const dx = gx - e.x, dy = gy - e.y, ds = Math.hypot(dx, dy);
        if (ds <= stop) return true;
        const sp = d.sp * (e.sm || 1) * dt;
        if (d.d === "a") { e.a = Math.atan2(dy, dx); const m = Math.min(sp, ds); e.x += (dx / ds) * m; e.y += (dy / ds) * m; return false; }
        const moved = e.gx === undefined ? 1e9 : Math.hypot(e.gx - gx, e.gy - gy);
        if (!e.path || (e.rp <= 0 && (moved > 40 || !e.path.length))) {
            if (pathBudget > 0) { pathBudget--; e.path = findPath(d.d, e.x, e.y, gx, gy, ign) || []; e.gx = gx; e.gy = gy; e.rp = 0.7 + Math.random() * 0.6; }
            else if (!e.path) return false;
        }
        const p = e.path;
        while (p.length > 1 && los(d.d, e.x, e.y, p[1].x, p[1].y, ign)) p.shift();
        if (!p.length) return false;
        const wx = p[0].x - e.x, wy = p[0].y - e.y, wd = Math.hypot(wx, wy);
        e.a = Math.atan2(wy, wx);
        if (wd <= sp) { e.x = p[0].x; e.y = p[0].y; p.shift(); } else { e.x += (wx / wd) * sp; e.y += (wy / wd) * sp; }
        return false;
    }

    /* ---------- dunia & state ---------- */
    const lvl = (o, c) => (c && state ? (state.rs[state.shared ? 0 : o] || {})[c] || 0 : 0);
    const resIdx = (o) => (state.shared ? 0 : o);
    const say = (text) => { state.msg = { id: state.msg.id + 1, text }; };
    const afford = (R, c) => { if (state.cheats.inf) return true; for (const k in c) if (R[k] < c[k]) return false; return true; };
    const spend = (R, c) => { if (!state.cheats.inf) for (const k in c) R[k] -= c[k]; };
    const addFx = (f) => { if (fx.length < 260) fx.push(f); if (fxq.length < 80) fxq.push(f); snd(f.k === "l" ? "s" : "b"); };

    function mk(t, x, y, o = 0, ex = {}) {
        const d = D[t];
        const e = { id: state.id++, t, tm: d.tm, k: d.k, o, x, y, hp: d.hp, mh: d.hp, a: 0, cd: Math.random() * 0.3, tt: 0, rp: 0, tg: 0, ord: null, ...ex };
        if (d.k === "b") { if (e.prog === undefined) e.prog = 1; e.q = []; e.lv = 0; }
        if (d.cap) e.cargo = [];
        state.ents.push(e); byid.set(e.id, e); (d.tm === "h" ? hum : ali).push(e);
        return e;
    }
    function rebuildOcc() {
        occ.fill(0); if (!state) return;
        for (const e of state.ents) {
            if (e.k !== "b" || e.dead) continue;
            const d = D[e.t], ox = Math.round(e.x / TS - d.sz / 2), oy = Math.round(e.y / TS - d.sz / 2);
            for (let y = oy; y < oy + d.sz; y++) for (let x = ox; x < ox + d.sz; x++) if (x >= 0 && y >= 0 && x < MW && y < MH) occ[y * MW + x] = 1;
        }
    }
    function placeB(t, ox, oy, o, prog = 1) {
        const d = D[t], b = mk(t, (ox + d.sz / 2) * TS, (oy + d.sz / 2) * TS, o, { prog, hp: prog >= 1 ? d.hp : d.hp * 0.1 });
        if (t === "rf") {
            const nb = { m: 0, f: 0 };
            for (const n of map.node) if (Math.hypot((n.x + 0.5) * TS - b.x, (n.y + 0.5) * TS - b.y) < 4.5 * TS) nb[n.k] = Math.min(nb[n.k] + (n.k === "m" ? 2.5 : 1.2), n.k === "m" ? 5 : 2.4);
            b.nb = nb;
        }
        rebuildOcc();
        for (const u of state.ents) if (u.k === "u" && !u.dead && !u.inside && D[u.t].d === "l" && occ[cellAt(u.x, u.y)]) { const c = nearestCell("l", cellAt(u.x, u.y), false, 8); if (c >= 0) { u.x = cxOf(c); u.y = cyOf(c); u.path = null; } }
        return b;
    }
    function canPlace(d, ox, oy, own) {
        const sz = d.sz;
        if (ox < 0 || oy < 0 || ox + sz > MW || oy + sz > MH) return false;
        for (let y = oy; y < oy + sz; y++) for (let x = ox; x < ox + sz; x++) { const i = y * MW + x; if (T[i] !== 0 || occ[i]) return false; }
        if (d.coast) {
            let ok = false;
            for (let y = oy - d.coast; y < oy + sz + d.coast && !ok; y++) for (let x = ox - d.coast; x < ox + sz + d.coast; x++) if (x >= 0 && y >= 0 && x < MW && y < MH && T[y * MW + x] === 1) { ok = true; break; }
            if (!ok) return false;
        }
        const px = (ox + sz / 2) * TS, py = (oy + sz / 2) * TS;
        for (const e of state.ents) if (e.k === "b" && e.tm === "h" && e.t !== "wl" && (state.shared || e.o === own) && Math.hypot(e.x - px, e.y - py) <= BR * TS) return true;
        return false;
    }
    function prepMap(cfg) {
        map = genMap(cfg); T = map.t; cdist = coastMap(T);
        terrain = document.createElement("canvas"); terrain.width = MW * TS; terrain.height = MH * TS;
        const g = terrain.getContext("2d"), R = mulberry(cfg.seed >>> 0);
        for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) {
            const t = T[y * MW + x], v = R();
            g.fillStyle = t === 1 ? (v < 0.5 ? "#0a2236" : "#0c263c") : t === 2 ? "#202b38" : v < 0.5 ? "#121a22" : "#141d26";
            g.fillRect(x * TS, y * TS, TS, TS);
            if (t === 2) { g.fillStyle = "#2c3a4a"; g.fillRect(x * TS + 4, y * TS + 4, TS - 8, TS - 8); }
            if (t === 1 && v > 0.9) { g.strokeStyle = "rgba(125,180,220,.12)"; g.beginPath(); g.moveTo(x * TS + 6, y * TS + 16); g.quadraticCurveTo(x * TS + 16, y * TS + 10, x * TS + 26, y * TS + 16); g.stroke(); }
        }
        g.strokeStyle = "rgba(255,255,255,.025)"; g.beginPath();
        for (let x = 0; x <= MW; x++) { g.moveTo(x * TS, 0); g.lineTo(x * TS, MH * TS); }
        for (let y = 0; y <= MH; y++) { g.moveTo(0, y * TS); g.lineTo(MW * TS, y * TS); }
        g.stroke();
        g.strokeStyle = "rgba(125,200,255,.35)"; g.lineWidth = 1.5; g.beginPath();
        for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) if (T[y * MW + x] === 1) {
            if (x > 0 && T[y * MW + x - 1] === 0) { g.moveTo(x * TS, y * TS); g.lineTo(x * TS, (y + 1) * TS); }
            if (x < MW - 1 && T[y * MW + x + 1] === 0) { g.moveTo((x + 1) * TS, y * TS); g.lineTo((x + 1) * TS, (y + 1) * TS); }
            if (y > 0 && T[(y - 1) * MW + x] === 0) { g.moveTo(x * TS, y * TS); g.lineTo((x + 1) * TS, y * TS); }
            if (y < MH - 1 && T[(y + 1) * MW + x] === 0) { g.moveTo(x * TS, (y + 1) * TS); g.lineTo((x + 1) * TS, (y + 1) * TS); }
        }
        g.stroke();
    }
    function buildWorld(cfg) {
        prepMap(cfg);
        const df = DIFF[cfg.diff], shared = !cfg.coop || cfg.base !== "separate", k = cfg.mission;
        const base = { e: 80, m: 400, c: 650, f: 80, b: 2, d: 0 }, mkRes = (mul) => Object.fromEntries(RK.map((r) => [r, Math.round(base[r] * mul)]));
        fx = []; fxq = []; byid.clear(); hum.length = 0; ali.length = 0; occ.fill(0);
        state = {
            cfg, shared, t: 0, id: 1, ents: [], res: [mkRes(df.s * (cfg.coop && shared ? 1.5 : 1)), mkRes(df.s)], rs: [{}, {}], rq: [null, null],
            wave: { n: 0, timer: cfg.first === "alien" ? 14 : 75, kind: cfg.first === "alien" ? "random" : "ground", lt: 0, w: -1 },
            ms: { k, tot: df.tot, fin: ["survive", "naval", "airbase"].includes(k), bw: df.bw, boss: Math.random() < 0.5 ? "cb" : "ho", prot: k === "naval" ? "ns" : k === "airbase" ? "ab" : "", bs: 0 },
            over: null, omsg: "", kills: 0, cheats: {}, aic: { def: 1, rep: 1, reb: 1, foc: 1 }, caps: [], msg: { id: 0, text: "" }, ua: -99, score: 0, cheated: 0,
            pw: [{}, {}], ev: [], pings: [], rb: [], lostU: 0, lostB: 0, stars: 0, early: -99,
        };
        const owners = cfg.coop ? [0, 1] : [0];
        for (const o of shared ? [0] : owners) { const h = map.hq[shared ? 0 : o]; placeB("hq", h.x - 1, h.y - 1, o); }
        if (k === "naval") placeB("ns", map.spotNs.x, map.spotNs.y, 0);
        if (k === "airbase") placeB("ab", map.spotAb.x, map.spotAb.y, 0);
        owners.forEach((o) => {
            const h = map.hq[shared ? 0 : o], list = cfg.coop ? ["inf", "inf", "en"] : ["inf", "inf", "inf", "inf", "en", "tk"];
            list.forEach((u, i) => { const c = nearestCell("l", cellAt((h.x + 0.5) * TS + ((i % 3) - 1) * 30 + (o ? 24 : 0), (h.y + 3.3) * TS + ((i / 3) | 0) * 30), false, 8); if (c >= 0) mk(u, cxOf(c), cyOf(c), o); });
        });
        if (k === "hive" || k === "queen") {
            map.hive.slice(0, k === "queen" ? 1 : df.hv).forEach((p, i) => {
                const h = placeB("hive", p.x - 1, p.y - 1, 0);
                for (let g = 0; g < 4; g++) mkAlien(g < 2 ? "wa" : "wr", h.x + (g - 1.5) * 34, h.y + 70, 1, false, { ord: { k: "guard", x: h.x, y: h.y }, par: h.id });
                if (k === "queen" && i === 0) mkAlien("qa", h.x + 80, h.y + 20, 1, false, { ord: { k: "guard", x: h.x, y: h.y }, qq: 1 });
            });
        }
        if (k === "capture") {
            state.caps = map.cap.map((p) => ({ x: (p.x + 0.5) * TS, y: (p.y + 0.5) * TS, p: 0, done: 0 }));
            for (const c of state.caps) for (let g = 0; g < 3; g++) mkAlien(g ? "wr" : "sk", c.x + (g - 1) * 40, c.y - 50, 1, false, { ord: { k: "guard", x: c.x, y: c.y } });
        }
        rebuildOcc();
        say("Misi: " + MISSIONS[k]);
    }
    function mkAlien(t, x, y, n, elite, ex) {
        const df = DIFF[state.cfg.diff], d = D[t];
        const hm = (1 + (d.boss ? 0.04 : 0.06) * (n - 1)) * df.h * (elite ? 1.8 : 1);
        return mk(t, x, y, 0, { hp: d.hp * hm, mh: d.hp * hm, dm: (1 + 0.03 * (n - 1)) * df.d * (elite ? 1.3 : 1), el: elite ? 1 : 0, ord: { k: "assault" }, gt: 0, ...ex });
    }

    /* ---------- aksi pemain (dieksekusi oleh host / solo) ---------- */
    const formOff = (i, n) => { const c = Math.ceil(Math.sqrt(n)), rows = Math.ceil(n / c); return [((i % c) - (c - 1) / 2) * 26, (((i / c) | 0) - (rows - 1) / 2) * 26]; };
    function applyAction(a, actor) {
        const S = state; if (!S || S.over) return;
        const own = S.cfg.slots[actor] ?? 0, ri = S.shared ? 0 : own, R = S.res[ri], cf = S.cheats;
        const can = (e) => e && !e.dead && e.tm === "h" && (S.shared || e.o === own);
        switch (a.t) {
            case "build": {
                const d = D[a.k]; if (!d || d.k !== "b" || d.tm !== "h" || a.k === "hq" || !canPlace(d, a.x, a.y, own) || !afford(R, d.c)) return;
                spend(R, d.c); placeB(a.k, a.x, a.y, own, cf.inst ? 1 : 0); break;
            }
            case "prod": {
                const b = byid.get(a.b), ud = D[a.u];
                if (!can(b) || b.k !== "b" || b.prog < 1 || !D[b.t].pr || !D[b.t].pr.includes(a.u) || !ud || (ud.rq && lvl(own, ud.rq[0]) < ud.rq[1]) || b.q.length >= 6 || !afford(R, ud.c)) return;
                spend(R, ud.c); b.q.push({ t: a.u, left: ud.t, total: ud.t }); break;
            }
            case "cq": {
                const b = byid.get(a.b); if (!can(b) || !b.q[a.i]) return;
                if (!cf.inf) { const c = D[b.q[a.i].t].c; for (const k in c) R[k] += c[k]; }
                b.q.splice(a.i, 1); break;
            }
            case "order": {
                const us = a.ids.map((id) => byid.get(id)).filter((e) => can(e) && e.k === "u" && !e.inside), o = a.o, tr = o.id ? byid.get(o.id) : null;
                us.forEach((e, i) => {
                    let oo = null;
                    if (o.k === "move" || o.k === "amove" || o.k === "patrol") { const [ox, oy] = formOff(i, us.length); oo = { k: o.k, x: clamp(o.x + ox, 6, MW * TS - 6), y: clamp(o.y + oy, 6, MH * TS - 6) }; if (o.k === "patrol") { oo.ax = e.x; oo.ay = e.y; } }
                    else if (o.k === "atk") { if (tr && !tr.dead && D[e.t].dmg > 0 && D[e.t].tg.includes(D[tr.t].d)) oo = { k: "atk", id: tr.id }; else if (tr) oo = { k: "move", x: tr.x, y: tr.y }; }
                    else if (o.k === "board") { if (tr && tr.cargo && D[e.t].cl === "inf") oo = { k: "board", id: tr.id }; else if (tr) oo = { k: "move", x: tr.x, y: tr.y }; }
                    else if (o.k === "hold") oo = { k: "hold" };
                    if (oo && oo.k !== "hold") e.dep = 0;
                    e.ord = oo; e.path = null; e.tg = 0; e.pur = 0;
                });
                break;
            }
            case "unload":
                for (const id of a.ids) {
                    const tr = byid.get(id); if (!can(tr) || !tr.cargo || !tr.cargo.length) continue;
                    const c0 = cellAt(tr.x, tr.y); if (tr.k === "u" && (T[c0] !== 0 || occ[c0])) { say("Tidak bisa unload di sini."); continue; }
                    for (const cid of tr.cargo) {
                        const c = byid.get(cid); if (!c) continue; c.inside = 0; c.ord = null; c.path = null;
                        if (tr.k === "b") { const cc = nearestCell("l", cellAt(tr.x, tr.y + D[tr.t].z + 10), false, 8); c.x = cc >= 0 ? cxOf(cc) : tr.x; c.y = cc >= 0 ? cyOf(cc) : tr.y; } else { c.x = tr.x + (Math.random() - 0.5) * 36; c.y = tr.y + (Math.random() - 0.5) * 36; }
                    }
                    tr.cargo = [];
                }
                break;
            case "rsch": {
                const L = (S.rs[ri][a.c] || 0) + 1;
                if (!RS[a.c] || L > 3 || (RSPRE[a.c] && RSPRE[a.c][L] && lvl(own, RSPRE[a.c][L][0]) < RSPRE[a.c][L][1]) || S.rq[ri] || !hum.some((e) => e.t === "rl" && e.prog >= 1 && (S.shared || e.o === own)) || !afford(R, rsCost(a.c, L))) return;
                spend(R, rsCost(a.c, L)); S.rq[ri] = { c: a.c, l: L, left: rsTime(L), total: rsTime(L) }; break;
            }
            case "sell": {
                const b = byid.get(a.id); if (!can(b) || b.k !== "b" || b.t === "hq" || b.t === S.ms.prot) return;
                const c = D[b.t].c; for (const k in c) R[k] += Math.floor(c[k] * 0.5);
                b.dead = true; rebuildOcc(); break;
            }
            case "ai": { const al = lvl(own, "ai"); if (al >= 1 && S.aic[a.k] !== undefined && (a.k !== "reb" || al >= 2) && (a.k !== "foc" || al >= 3)) S.aic[a.k] = S.aic[a.k] ? 0 : 1; break; }
            case "upg": {
                const b = byid.get(a.id); if (!can(b) || b.k !== "b" || b.prog < 1 || !upgradable(D[b.t]) || b.lv >= 2) return;
                const d = D[b.t], c = upCost(d, b.lv); if (!afford(R, c)) return;
                spend(R, c); b.lv++; const nm = Math.round(d.hp * (1 + 0.3 * b.lv)); b.hp += nm - b.mh; b.mh = nm;
                addFx({ k: "r", x: b.x, y: b.y, r: d.z * 1.4, c: "#facc15", t: 0.5 }); break;
            }
            case "rally": { const b = byid.get(a.b); if (!can(b) || b.k !== "b" || !D[b.t].pr) return; b.ra = { x: clamp(a.x, 6, MW * TS - 6), y: clamp(a.y, 6, MH * TS - 6) }; break; }
            case "pri": { const b = byid.get(a.id); if (can(b) && b.k === "b") b.pri = a.v % 4; break; }
            case "abil": for (const id of a.ids) { const e = byid.get(id); if (can(e) && e.k === "u" && !e.inside) useAbility(e); } break;
            case "power": usePower(a, own, ri, R); break;
            case "ping": S.pings.push({ x: a.x, y: a.y, o: own, u: S.t + 8 }); if (S.pings.length > 8) S.pings.shift(); break;
            case "chat": if (CHAT[a.m]) say("P" + (own + 1) + ": " + CHAT[a.m]); break;
            case "give": {
                if (S.shared || !["m", "c", "f", "e"].includes(a.k)) return;
                const n = Math.min(a.n, Math.floor(R[a.k])); if (n <= 0) return; R[a.k] -= n; S.res[1 - ri][a.k] += n; say("P" + (own + 1) + " mengirim " + n + " " + RLABEL[a.k]); break;
            }
            case "early": {
                const W = S.wave; if (S.t - S.early < 6 || (S.ms.fin && W.n >= S.ms.tot) || W.timer < 6) return;
                const bonus = Math.round(W.timer * 3); S.early = S.t; R.c += bonus; W.timer = 0.5; say("Wave dipanggil lebih awal: +" + bonus + " Credits"); break;
            }
            case "cheat": {
                S.cheated = 1; const c = a.c;
                if (c === "res") for (const k of RK) R[k] += k === "b" ? 50 : k === "d" ? 300 : 5000;
                else if (c === "inf") cf.inf = !cf.inf;
                else if (c === "inst") cf.inst = !cf.inst;
                else if (c === "god") cf.god = !cf.god;
                else if (c === "reveal") cf.reveal = !cf.reveal;
                else if (c === "tech") for (const k in RS) S.rs[ri][k] = 3;
                else if (c === "army") {
                    const h = hum.find((e) => e.t === "hq" && (S.shared || e.o === own)); if (!h) return;
                    for (const u of ["inf", "inf", "hv", "hv", "sn", "md", "tk", "tk", "art", "fj", "fj", "ah"]) {
                        const d = D[u]; let x = h.x + (Math.random() - 0.5) * 120, y = h.y + 80 + Math.random() * 40;
                        if (d.d === "l") { const cc = nearestCell("l", cellAt(x, y), false, 8); if (cc < 0) continue; x = cxOf(cc); y = cyOf(cc); }
                        mk(u, x, y, own);
                    }
                }
                else if (c === "heal") for (const e of hum) e.hp = e.mh;
                else if (c === "wipe") for (const e of ali.slice()) if (e.t !== "hive") die(e, null);
                else if (c === "wave") S.wave.timer = 0;
                else if (c === "win") end("win", "Menang (cheat).");
                break;
            }
        }
    }

    function usePower(a, own, ri, R) {
        const S = state, p = PW[a.p]; if (!p) return;
        if (!hum.some((e) => e.t === "rs" && e.prog >= 1 && (S.shared || e.o === own))) { say("Butuh Radar Station untuk Command Uplink."); return; }
        if (S.t < (S.pw[ri][a.p] || 0) || !afford(R, p.c) || (p.tgt && typeof a.x !== "number")) return;
        spend(R, p.c); S.pw[ri][a.p] = S.t + p.cd * (S.cheats.inst ? 0.1 : 1);
        const x = a.x, y = a.y;
        if (a.p === "air") { const ang = Math.random() * 3.14; for (let i = 0; i < 8; i++) S.ev.push({ k: "bomb", u: S.t + 0.35 * i + 0.8, x: x + Math.cos(ang) * (i - 3.5) * 34, y: y + Math.sin(ang) * (i - 3.5) * 34 }); say("Airstrike datang!"); }
        else if (a.p === "orb") S.ev.push({ k: "orb", u: S.t + 0.8, x, y, n: 10 });
        else if (a.p === "stasis") { addFx({ k: "r", x, y, r: 150, c: "#a5f3fc", t: 0.8 }); for (const e of ali) if (Math.hypot(e.x - x, e.y - y) < 150) { e.sl = S.t + 8; e.sf = 0.3; } }
        else if (a.p === "drop") { R.m += 500; R.c += 500; R.f += 100; R.e += 100; say("Supply drop diterima!"); }
        else if (a.p === "rep") { for (const e of hum) if (!e.dead) e.hp = Math.min(e.mh, e.hp + e.mh * 0.35); const h = hum.find((e) => e.t === "hq"); if (h) addFx({ k: "r", x: h.x, y: h.y, r: 220, c: "#4ade80", t: 0.7 }); }
    }
    function processEv() {
        const S = state;
        for (let i = S.ev.length - 1; i >= 0; i--) {
            const v = S.ev[i]; if (S.t < v.u) continue;
            if (v.k === "bomb") {
                addFx({ k: "r", x: v.x, y: v.y, r: 70, c: "#fde68a", t: 0.4 });
                for (const e of ali.slice()) if (!e.dead && D[e.t].d !== "a" && Math.hypot(e.x - v.x, e.y - v.y) < 70 + D[e.t].z) hurt(e, 110, null);
                S.ev.splice(i, 1);
            } else if (v.k === "orb") {
                addFx({ k: "r", x: v.x, y: v.y, r: 95, c: "#c4b5fd", t: 0.5 }); addFx({ k: "l", x1: v.x, y1: v.y - 900, x2: v.x, y2: v.y, c: "#ddd6fe", t: 0.3 });
                for (const e of ali.slice()) if (!e.dead && Math.hypot(e.x - v.x, e.y - v.y) < 95 + D[e.t].z) hurt(e, 55, null);
                v.n--; v.u = S.t + 0.5; if (v.n <= 0) S.ev.splice(i, 1);
            }
        }
    }
    function useAbility(e) {
        const S = state, d = D[e.t]; if (!d.ab) return;
        if (d.ab === "deploy") { e.dep = e.dep ? 0 : 1; e.ord = null; e.path = null; return; }
        if ((e.ac || 0) > S.t) return;
        if (d.ab === "launch") {
            e.ac = S.t + 70;
            for (let i = 0; i < 3; i++) { const u = mk("fj", e.x + (i - 1) * 24, e.y - 20, e.o, { life: 35, tmp: 1, ord: { k: "amove", x: e.x + Math.cos(e.a) * 260, y: e.y + Math.sin(e.a) * 260 } }); u.hp = u.mh = 110; }
            addFx({ k: "r", x: e.x, y: e.y, r: 60, c: "#7dd3fc", t: 0.4 });
        } else if (d.ab === "stomp") {
            e.ac = S.t + 18; addFx({ k: "r", x: e.x, y: e.y, r: 110, c: "#fbbf24", t: 0.5 });
            for (const a of ali.slice()) if (!a.dead && D[a.t].d === "l" && Math.hypot(a.x - e.x, a.y - e.y) < 110 + D[a.t].z) { hurt(a, 70, e); a.sl = S.t + 3; a.sf = 0.4; }
        }
    }
    function autoRebuild() {
        const S = state; if (!S.rb.length || tickN % 60) return;
        for (let i = 0; i < S.rb.length; i++) {
            const r = S.rb[i], d = D[r.t], R = S.res[S.shared ? 0 : r.o];
            if (afford(R, d.c) && canPlace(d, r.ox, r.oy, r.o)) { spend(R, d.c); placeB(r.t, r.ox, r.oy, r.o, S.cheats.inst ? 1 : 0); S.rb.splice(i, 1); say("Auto-rebuild: " + d.n); return; }
        }
    }

    /* ---------- simulasi ---------- */
    const nearOwn = (c) => { for (const b of hum) if (b.k === "b" && Math.hypot(b.x - c.x, b.y - c.y) < 300) return true; return false; };
    const helps = (d, f) => { const fd = D[f.t]; return f.hp < f.mh && (d.heal ? fd.cl === "inf" : d.rep ? fd.k === "b" : fd.k === "u" && fd.cl !== "inf"); };
    function stepSim(dt) {
        const S = state, cf = S.cheats;
        S.t += dt; tickN++;
        if (S.ents.some((e) => e.dead)) S.ents = S.ents.filter((e) => !e.dead);
        byid.clear(); hum.length = 0; ali.length = 0; kids.clear();
        for (const e of S.ents) { byid.set(e.id, e); if (e.inside) continue; if (e.tm === "h") hum.push(e); else { ali.push(e); if (e.par) kids.set(e.par, (kids.get(e.par) || 0) + 1); } }
        pathBudget = 14;
        for (const R of S.res) for (const k of RK) { if (cf.inf) R[k] = Math.max(R[k], 9999); else if (R[k] < 0) R[k] = 0; }
        for (let i = 0; i < S.ents.length; i++) { const e = S.ents[i]; if (e.dead || e.inside) continue; const d = D[e.t]; if (e.k === "b") runBuilding(e, d, dt); else runUnit(e, d, dt); }
        if (!(tickN & 1)) separate();
        runResearch(dt); waves(dt); missions(dt); processEv(); autoRebuild();
        if (!(tickN % 30)) S.pings = S.pings.filter((q) => q.u > S.t);
        for (let i = fx.length - 1; i >= 0; i--) if ((fx[i].t -= dt) <= 0) fx.splice(i, 1);
    }
    function runBuilding(b, d, dt) {
        const S = state, cf = S.cheats;
        if (b.tm === "a") { if (d.spw) spawner(b, d, dt); return; }
        const R = S.res[S.shared ? 0 : b.o];
        if (b.prog < 1) {
            const tt = Math.max(1, d.t) / (cf.inst ? 12 : 1);
            b.prog = Math.min(1, b.prog + dt / tt); b.hp = Math.min(d.hp, b.hp + (d.hp * 0.9 * dt) / tt);
            if (b.prog >= 1) b.hp = Math.max(b.hp, d.hp * 0.95);
            return;
        }
        if (d.up) R.e = Math.max(0, R.e - d.up * dt);
        const lp = d.up && R.e <= 0.5 ? 0.4 : 1, lm = 1 + 0.3 * (b.lv || 0);
        if (d.inc) for (const k in d.inc) R[k] += (d.inc[k] + (b.nb && b.nb[k] ? b.nb[k] : 0)) * dt * lm * (k === "d" ? lp : 1);
        if (d.pr && b.q.length) {
            const it = b.q[0]; it.left -= dt * (cf.inst ? 12 : 1) * lp * (1 + 0.25 * (b.lv || 0));
            if (it.left <= 0) { if (spawnUnit(b, it.t)) b.q.shift(); else it.left = 1; }
        }
        if (d.dmg > 0) combat(b, d, dt);
    }
    function spawnUnit(b, t) {
        const d = D[t];
        let n = 0; for (const e of hum) if (e.k === "u") n++;
        if (n >= 160) return false;
        let x = b.x + (Math.random() - 0.5) * 40, y = b.y;
        if (d.d !== "a") {
            const c = nearestCell(d.d, cellAt(b.x, b.y + D[b.t].z + 10), false, 14); if (c < 0) return false;
            x = cxOf(c) + (Math.random() - 0.5) * 10; y = cyOf(c) + (Math.random() - 0.5) * 10;
        }
        const u = mk(t, x, y, b.o);
        if (b.ra) u.ord = { k: "move", x: b.ra.x + (Math.random() - 0.5) * 40, y: b.ra.y + (Math.random() - 0.5) * 40 };
        return true;
    }
    function spawner(e, d, dt) {
        const [ty, iv, mx] = d.spw; e.sp = (e.sp === undefined ? iv * 0.5 : e.sp) - dt;
        if (e.sp > 0) return;
        e.sp = iv * (DIFF[state.cfg.diff].i + 0.2);
        if ((kids.get(e.id) || 0) >= mx) return;
        const guard = e.t === "hive" || (e.ord && e.ord.k === "guard");
        let type = ty;
        if (e.t === "hive") { const w = state.wave.n + 1, ps = ["wa", "wr", "wr", "cp", "sk", "sb", "bt"].filter((i) => D[i].tr <= w); type = pick(ps); }
        const dd = D[type], ang = Math.random() * 6.28, r = 40 + Math.random() * 50;
        const c = nearestCell(dd.d, cellAt(e.x + Math.cos(ang) * r, e.y + Math.sin(ang) * r), true, 6); if (c < 0) return;
        mkAlien(type, cxOf(c), cyOf(c), Math.max(1, state.wave.n), false, { par: e.id, ord: guard ? { k: "guard", x: e.ord ? e.ord.x : e.x, y: e.ord ? e.ord.y : e.y } : { k: "assault" } });
    }
    function support(e, d, dt) {
        e.sc = (e.sc || 0) - dt; if (e.sc > 0) return; e.sc = 0.5;
        const rate = (d.heal || d.rep || d.rep2) * 0.5, rng = d.heal ? 100 : 85;
        for (const f of hum) {
            if (f === e || f.dead || f.inside || !helps(d, f)) continue;
            if (Math.hypot(f.x - e.x, f.y - e.y) - D[f.t].z <= rng) { f.hp = Math.min(f.mh, f.hp + rate); addFx({ k: "l", x1: e.x, y1: e.y, x2: f.x, y2: f.y, c: "#4ade80", t: 0.15 }); }
        }
    }
    function pickGoal(e, d) {
        let best = null, bd = 1e9;
        for (const h of hum) {
            if (h.dead || h.inside) continue; const hd = D[h.t];
            if (d.d === "l" && hd.d !== "l") continue;
            if (d.d === "s" && cdist[cellAt(h.x, h.y)] * TS > d.r + 30) continue;
            const dd = Math.hypot(h.x - e.x, h.y - e.y) - (hd.k === "b" ? 0 : 40); if (dd < bd) { bd = dd; best = h; }
        }
        return best;
    }
    function acquire(e, d, rad) {
        const foes = e.tm === "h" ? ali : hum; let best = null, bd = 1e9;
        for (const f of foes) {
            if (f.dead || f.inside) continue; const fd = D[f.t];
            if (!d.tg.includes(fd.d)) continue;
            const dist = Math.hypot(f.x - e.x, f.y - e.y); if (fd.st && dist > 110) continue;
            const g = dist - fd.z; if (g > rad) continue;
            let sc = g;
            if (e.k === "b" && e.pri) sc = e.pri === 1 ? -f.hp : e.pri === 2 ? f.hp : fd.d === "a" ? g - 1000 : g;
            else if (e.tm === "h" && state.aic.foc && lvl(e.o, "ai") >= 3) sc = g + (f.hp / f.mh) * 80 - (fd.boss ? 150 : 0);
            if (sc < bd) { bd = sc; best = f; }
        }
        return best;
    }
    function combat(e, d, dt, forced) {
        e.cd -= dt; e.tt -= dt;
        const er = d.r * (1 + 0.08 * (e.lv || 0) + (e.dep ? 0.25 : 0)), rad = e.k === "b" ? er : er + (e.tm === "h" ? 45 : 60);
        let t = forced || (e.tg ? byid.get(e.tg) : null);
        if (t && (t.dead || t.inside || !d.tg.includes(D[t.t].d))) t = null;
        if (t && !forced && Math.hypot(t.x - e.x, t.y - e.y) - D[t.t].z > rad * 1.6) t = null;
        if (!forced && (!t || e.tt <= 0)) { t = acquire(e, d, rad); e.tt = 0.25 + Math.random() * 0.15; }
        e.tg = t ? t.id : 0;
        if (t) {
            const td = D[t.t];
            if (Math.hypot(t.x - e.x, t.y - e.y) - td.z <= er + 6) {
                e.a = Math.atan2(t.y - e.y, t.x - e.x);
                if (e.cd <= 0 && (!(d.en && e.tm === "h") || state.cheats.inf || state.res[resIdx(e.o)].e > 0.1)) {
                    fire(e, d, t, td); e.cd = d.cd * (e.tm === "h" && e.k === "b" && lvl(e.o, "ai") >= 2 ? 0.85 : 1);
                }
            }
        }
        return t;
    }
    function fire(e, d, t, td) {
        const human = e.tm === "h"; let v = d.dmg;
        if (human) v *= (1 + 0.12 * lvl(e.o, d.cl)) * (1 + 0.1 * lvl(e.o, "wpn")) * (1 + 0.1 * lvl(e.o, "bio")) * (1 + 0.3 * (e.lv || 0)) * (1 + 0.1 * rankOf(e)) * (e.dep ? 1.8 : 1) * (e.k === "b" && e.cargo ? 1 + 0.5 * e.cargo.length : 1); else v *= e.dm || 1;
        if (d.vh && td.ar) v *= d.vh;
        if (d.en && human) state.res[resIdx(e.o)].e -= d.en * d.cd;
        const col = human ? (e.o ? "#86efac" : "#7dd3fc") : "#fb923c", foes = human ? ali : hum;
        addFx({ k: "l", x1: e.x, y1: e.y, x2: t.x, y2: t.y, c: col, t: 0.1 });
        hurt(t, v, e);
        if (!human && !t.dead) { if (d.slow && t.tm === "h") { t.sl = state.t + d.slow[1]; t.sf = d.slow[0]; } if (d.poi && t.k === "u") t.po = { d: d.poi[0], u: state.t + d.poi[1] }; }
        if (d.sp) {
            for (const f of foes) if (f !== t && !f.dead && !f.inside && d.tg.includes(D[f.t].d) && Math.hypot(f.x - t.x, f.y - t.y) < d.sp) hurt(f, v * 0.6, e);
            addFx({ k: "r", x: t.x, y: t.y, r: d.sp, c: col, t: 0.25 });
        }
        if (d.chain) {
            let n = d.chain, last = t;
            for (const f of foes) { if (n <= 0) break; if (f !== t && !f.dead && !f.inside && d.tg.includes(D[f.t].d) && Math.hypot(f.x - last.x, f.y - last.y) < 110) { hurt(f, v * 0.7, e); addFx({ k: "l", x1: last.x, y1: last.y, x2: f.x, y2: f.y, c: "#a5f3fc", t: 0.12 }); last = f; n--; } }
        }
    }
    function hurt(t, v, src) {
        const S = state, td = D[t.t];
        if (t.tm === "h") {
            if (S.cheats.god) return;
            v *= 1 - 0.08 * lvl(t.o, "arm"); if (td.cl) v /= 1 + 0.12 * lvl(t.o, td.cl);
            v /= 1 + 0.08 * rankOf(t);
            if (t.k === "b" && S.t - S.ua > 12) { S.ua = S.t; say("Bangunan diserang!"); }
        }
        t.hp -= v;
        if (t.hp <= 0 && !t.dead) die(t, src);
    }
    function die(t, src) {
        t.dead = true; const S = state, d = D[t.t];
        addFx({ k: "r", x: t.x, y: t.y, r: d.k === "b" ? d.z * 1.1 : d.z * 2.2, c: t.tm === "h" ? "#fca5a5" : "#fdba74", t: 0.4 });
        if (t.k === "b") rebuildOcc();
        if (t.tm === "h") {
            if (t.k === "u") { if (!t.tmp) S.lostU++; }
            else { S.lostB++; if (S.aic.reb && lvl(t.o, "ai") >= 2 && t.t !== "hq" && t.t !== "wl" && t.prog >= 1 && S.rb.length < 24) S.rb.push({ t: t.t, ox: Math.round(t.x / TS - d.sz / 2), oy: Math.round(t.y / TS - d.sz / 2), o: t.o }); }
        } else if (src && src.tm === "h" && src.k === "u" && !src.dead) src.vk = (src.vk || 0) + 1;
        if (t.tm === "a") {
            S.kills++;
            const ri = src && src.tm === "h" && !S.shared ? src.o : 0, R = S.res[ri], th = d.th || (d.boss ? 25 : t.t === "hive" ? 30 : 4);
            R.c += Math.round(th * 6 * (t.el ? 1.5 : 1));
            if (Math.random() < Math.min(1, (0.04 + th * 0.04) * (lvl(ri, "bio") >= 3 ? 1.5 : 1))) R.b += d.boss || t.t === "hive" ? 6 : 1;
        }
        if (t.cargo && t.cargo.length) for (const id of t.cargo) {
            const c = byid.get(id); if (!c) continue;
            if (T[cellAt(t.x, t.y)] === 0) { c.inside = 0; c.x = t.x + (Math.random() - 0.5) * 30; c.y = t.y + (Math.random() - 0.5) * 30; } else c.dead = true;
        }
    }
    function runUnit(e, d, dt) {
        const S = state, al = e.tm === "a", o = e.ord, k = o ? o.k : "";
        e.rp -= dt; e.pt = (e.pt || 0) - dt;
        const ox = e.x, oy = e.y;
        if (e.life !== undefined && (e.life -= dt) <= 0) { e.dead = true; return; }
        let sm = e.sl > S.t ? e.sf || 0.5 : 1;
        if (!al && FUEL[d.cl] && !S.cheats.inf && S.res[resIdx(e.o)].f <= 0.1) sm *= 0.4;
        e.sm = sm;
        if (e.po && S.t < e.po.u) hurt(e, e.po.d * dt, null);
        if (d.aura) { e.au = (e.au || 0) - dt; if (e.au <= 0) { e.au = 0.5; for (const a of ali) if (a !== e && !a.dead && a.hp < a.mh && Math.hypot(a.x - e.x, a.y - e.y) < d.aura[1]) a.hp = Math.min(a.mh, a.hp + d.aura[0] * 0.5); } }
        if (d.slam) {
            e.sl2 = (e.sl2 === undefined ? 3 : e.sl2) - dt;
            if (e.sl2 <= 0) {
                const near = hum.filter((h) => !h.dead && D[h.t].d === "l" && Math.hypot(h.x - e.x, h.y - e.y) < d.slam[0] + D[h.t].z);
                if (near.length) { e.sl2 = d.slam[1]; addFx({ k: "r", x: e.x, y: e.y, r: d.slam[0], c: "#fbbf24", t: 0.5 }); for (const h of near) { hurt(h, 40 * (e.dm || 1), e); h.sl = S.t + 3; h.sf = 0.4; } } else e.sl2 = 0.5;
            }
        }
        if (d.heal || d.rep || d.rep2) support(e, d, dt);
        if (d.spw) spawner(e, d, dt);
        let t = null;
        if (d.dmg > 0) {
            if (k === "atk") { t = byid.get(o.id); if (!t || t.dead || t.inside || !d.tg.includes(D[t.t].d)) { e.ord = null; t = null; } }
            t = combat(e, d, dt, t);
        }
        let mvT = t;
        if (!mvT && !al && !o && S.aic.def && d.dmg > 0 && lvl(e.o, "ai") >= 1) {
            if (e.pt <= 0) { e.pt = 0.5; const c = acquire(e, d, 380); e.pur = c && nearOwn(c) ? c.id : 0; }
            mvT = e.pur ? byid.get(e.pur) : null; if (mvT && (mvT.dead || mvT.inside)) { mvT = null; e.pur = 0; }
        }
        let gx = null, gy = 0, stop = 4;
        const approach = (m) => { const md = D[m.t], gap = Math.hypot(m.x - e.x, m.y - e.y) - md.z; if (gap > d.r * 0.85) { gx = m.x; gy = m.y; stop = d.r * 0.85 + md.z; } };
        if (e.dep) { /* deploy: diam */ }
        else if (k === "move") { gx = o.x; gy = o.y; stop = 6; }
        else if (k === "board") {
            const tr = byid.get(o.id);
            if (!tr || tr.dead || !tr.cargo || tr.cargo.length >= D[tr.t].cap || d.cl !== "inf") e.ord = null;
            else if (Math.hypot(tr.x - e.x, tr.y - e.y) < 26 + (tr.k === "b" ? D[tr.t].z : 0)) { tr.cargo.push(e.id); e.inside = tr.id; e.ord = null; e.tg = 0; }
            else { gx = tr.x; gy = tr.y; stop = 20; }
        }
        else if (k === "hold") { /* diam */ }
        else if (mvT) {
            if (k === "guard" && Math.hypot(mvT.x - o.x, mvT.y - o.y) > 340) { gx = o.x; gy = o.y; stop = 20; } else approach(mvT);
        }
        else if (k === "amove") { gx = o.x; gy = o.y; stop = 8; }
        else if (k === "patrol") { gx = o.x; gy = o.y; stop = 10; }
        else if (k === "assault") {
            let g = e.gl ? byid.get(e.gl) : null; e.gt -= dt;
            if (!g || g.dead || g.inside || e.gt <= 0) { g = pickGoal(e, d); e.gl = g ? g.id : 0; e.gt = 1.5 + Math.random(); }
            if (g) { gx = g.x; gy = g.y; stop = Math.max(8, d.r * 0.7 + D[g.t].z); e.idl = 0; }
            else { e.idl = (e.idl || 0) + dt; if (e.idl > 40 && d.d === "s") e.dead = true; }
        }
        else if (k === "guard") { if (Math.hypot(e.x - o.x, e.y - o.y) > 40) { gx = o.x + (e.id % 5) * 8; gy = o.y + 50; stop = 24; } }
        else if (!o && (d.heal || d.rep || d.rep2)) {
            if (e.pt <= 0) { e.pt = 0.6; e.sg = 0; let bd = !al && S.aic.rep && lvl(e.o, "ai") >= 1 ? 700 : 260; for (const f of hum) if (!f.dead && !f.inside && f !== e && helps(d, f)) { const dd = Math.hypot(f.x - e.x, f.y - e.y); if (dd < bd) { bd = dd; e.sg = f.id; } } }
            const f = e.sg ? byid.get(e.sg) : null; if (f && !f.dead && f.hp < f.mh) { gx = f.x; gy = f.y; stop = 40; }
        }
        if (gx !== null) {
            const arrived = advance(e, d, gx, gy, stop, dt, al);
            if (arrived && (k === "move" || k === "amove")) e.ord = null;
            else if (arrived && k === "patrol") { const tx = o.x, ty = o.y; o.x = o.ax; o.y = o.ay; o.ax = tx; o.ay = ty; e.path = null; }
        }
        e.x = clamp(e.x, 4, MW * TS - 4); e.y = clamp(e.y, 4, MH * TS - 4);
        if (!al && FUEL[d.cl] && !S.cheats.inf && Math.hypot(e.x - ox, e.y - oy) > 0.05) { const Rf = S.res[resIdx(e.o)]; Rf.f = Math.max(0, Rf.f - FUEL[d.cl] * dt); }
    }
    function nudge(e, dx, dy) {
        const d = D[e.t]; const nx = clamp(e.x + dx, 4, MW * TS - 4), ny = clamp(e.y + dy, 4, MH * TS - 4);
        if (d.d === "a" || walk(d.d, cellAt(nx, ny), e.tm === "a")) { e.x = nx; e.y = ny; }
    }
    function separate() {
        const us = state.ents, n = us.length;
        for (let i = 0; i < n; i++) {
            const a = us[i]; if (a.k !== "u" || a.dead || a.inside) continue; const da = D[a.t];
            for (let j = i + 1; j < n; j++) {
                const b = us[j]; if (b.k !== "u" || b.dead || b.inside) continue; const db = D[b.t]; if (da.d !== db.d) continue;
                const dx = b.x - a.x; if (dx > 40 || dx < -40) continue; const dy = b.y - a.y; if (dy > 40 || dy < -40) continue;
                const mn = (da.z + db.z) * 0.8, dd = dx * dx + dy * dy; if (dd >= mn * mn || dd < 0.0001) continue;
                const ds = Math.sqrt(dd), p = (mn - ds) * 0.25, ux = (dx / ds) * p, uy = (dy / ds) * p;
                nudge(a, -ux, -uy); nudge(b, ux, uy);
            }
        }
    }
    function runResearch(dt) {
        const S = state;
        for (let ri = 0; ri < 2; ri++) {
            const q = S.rq[ri]; if (!q) continue;
            let labs = 0; for (const e of hum) if (e.t === "rl" && e.prog >= 1 && (S.shared || e.o === ri)) labs++;
            if (!labs) continue;
            q.left -= dt * (S.cheats.inst ? 12 : 1) * (1 + 0.5 * (labs - 1)) * (S.res[ri].e <= 0.5 ? 0.4 : 1);
            if (q.left <= 0) { S.rs[ri][q.c] = q.l; S.rq[ri] = null; say("Riset selesai: " + RS[q.c][0] + " Lv" + q.l); }
        }
    }

    /* ---------- wave & misi ---------- */
    function pickKind(n) {
        const ms = state.ms;
        if (ms.k === "boss" && n === ms.bw) return "boss";
        if (n % 10 === 0) return "boss";
        if (ms.k === "naval" && n % 2 === 0) return "naval";
        if (ms.k === "airbase" && n % 2 === 1 && n > 1) return "air";
        if (n % 5 === 0) return "elite";
        if (n >= 3 && n % 4 === 3) return "naval";
        if (n >= 2 && n % 3 === 2) return "air";
        if (n >= 4 && n % 4 === 0) return "multi";
        if (n > 1 && n % 6 === 1) return "swarm";
        return n % 7 === 0 ? "random" : "ground";
    }
    function planWave(kind) {
        const S = state, n = S.wave.n + 1, ms = S.ms, W = MW * TS, H = MH * TS;
        const px = (q) => ({ x: (q.x + 0.5) * TS, y: (q.y + 0.5) * TS });
        const edge = () => { const s = (Math.random() * 4) | 0, r = Math.random(); return s === 0 ? { x: r * W, y: 0 } : s === 1 ? { x: W, y: r * H } : s === 2 ? { x: 0, y: r * H } : { x: r * W, y: H }; };
        const pl = { l: shuffle(map.land).map(px), s: shuffle(map.sea).map(px), a: [edge(), edge()], dm: "", bt: "", u: "", m: [] };
        if (kind === "random") pl.dm = pick(["l", "l", "a", "s"]);
        if (kind === "boss") pl.bt = ms.k === "boss" ? ms.boss : ["cb", "qa", "ho"][((n / 10) | 0) % 3];
        pl.u = { ground: "l", naval: n >= 5 ? "sl" : "s", air: "a", multi: n >= 6 ? "la" : "l", swarm: "la", elite: "la", random: pl.dm, boss: pl.bt && D[pl.bt].d === "a" ? "la" : "l" }[kind] || "l";
        if (pl.u.includes("l")) pl.m.push(...pl.l.slice(0, kind === "multi" ? Math.min(3, pl.l.length) : 1));
        if (pl.u.includes("s")) pl.m.push(pl.s[0]);
        if (pl.u.includes("a")) pl.m.push(pl.a[0]);
        return pl;
    }
    function waves(dt) {
        const S = state, W = S.wave, ms = S.ms, df = DIFF[S.cfg.diff];
        if (ms.fin && W.n >= ms.tot) return;
        W.timer -= dt;
        if (W.timer <= 14 && !W.plan) W.plan = planWave(W.kind);
        if (W.timer <= 8 && W.w !== W.n) { W.w = W.n; say("Wave " + (W.n + 1) + " tiba sebentar lagi" + (hum.some((e) => e.t === "rs" && e.prog >= 1) || S.cheats.reveal ? ": " + KL[W.kind] : "!")); }
        if (W.timer <= 0) { W.n++; launchWave(W.kind, W.n, W.plan); W.plan = 0; W.lt = S.t; W.kind = pickKind(W.n + 1); W.timer = Math.max(26, 52 - W.n * 1.1) * df.i; }
    }
    function launchWave(kind, n, plan) {
        const S = state, df = DIFF[S.cfg.diff], ms = S.ms, base = map.hq[0];
        const B = (5 + 3.2 * Math.pow(n, 1.15)) * df.w;
        const pl = plan || planWave(kind);
        let li = 0, si = 0, ai = 0;
        const L = () => pl.l[li++ % pl.l.length], Sx = () => pl.s[si++ % pl.s.length], AE = () => pl.a[ai++ % pl.a.length];
        const where = (p) => dirName(p.x - (base.x + 0.5) * TS, p.y - (base.y + 0.5) * TS);
        const group = (dom, bud, p, elite, maxTh) => {
            const ps = Object.values(D).filter((u) => u.tm === "a" && u.k === "u" && !u.boss && u.d === dom && u.tr <= n + (elite ? 1 : 0) && u.th <= (maxTh || 99)).sort((a, b) => a.th - b.th);
            let cnt = 0;
            while (bud >= 1 && ps.length && cnt < 90) {
                const aff = ps.filter((u) => u.th * (u.sw || 1) <= bud + 1); if (!aff.length) break;
                const u = aff[Math.floor(Math.pow(Math.random(), 0.6) * aff.length)], k = u.sw || 1;
                bud -= u.th * k;
                for (let j = 0; j < k; j++) {
                    let x = p.x + (Math.random() - 0.5) * 90, y = p.y + (Math.random() - 0.5) * 90;
                    if (u.d !== "a") { const c = nearestCell(u.d, cellAt(x, y), true, 6); if (c < 0) continue; x = cxOf(c); y = cyOf(c); }
                    mkAlien(u.id, x, y, n, elite); cnt++;
                }
            }
        };
        let p0;
        switch (kind) {
            case "naval": p0 = Sx(); group("s", B * 1.1, p0); if (n >= 5) group("l", B * 0.3, L()); break;
            case "air": p0 = AE(); group("a", B, p0); if (n >= 4 && Math.random() < 0.5) group("a", B * 0.5, AE()); break;
            case "multi": { const ls = pl.l.slice(0, Math.min(3, pl.l.length)); p0 = ls[0]; ls.forEach((p) => group("l", (B / ls.length) * 1.1, p)); if (n >= 6) group("a", B * 0.3, AE()); break; }
            case "swarm": p0 = L(); group("l", B * 1.4, p0, false, 2); group("a", B * 0.5, AE(), false, 2); break;
            case "elite": p0 = L(); group("l", B * 0.8, p0, true); group("a", B * 0.3, AE(), true); break;
            case "random": { const dm = pl.dm || "l"; p0 = dm === "a" ? AE() : dm === "s" ? Sx() : L(); group(dm, B * 0.8, p0); break; }
            case "boss": {
                const bt = pl.bt || (ms.k === "boss" ? ms.boss : ["cb", "qa", "ho"][((n / 10) | 0) % 3]), air = D[bt].d === "a";
                p0 = air ? AE() : L(); mkAlien(bt, p0.x, p0.y, n, false); ms.bs = 1;
                group("l", B * 0.5, L()); if (air) group("a", B * 0.3, AE()); break;
            }
            default: p0 = L(); group("l", B, p0);
        }
        say("Wave " + n + ": " + KL[kind] + " dari " + where(p0));
    }
    function missions(dt) {
        const S = state, ms = S.ms; if (S.over) return;
        if (!hum.some((e) => e.t === "hq")) return end("lose", "HQ hancur. Invasi berhasil.");
        if (ms.prot && !hum.some((e) => e.t === ms.prot && e.prog >= 1)) return end("lose", (ms.prot === "ns" ? "Naval Shipyard" : "Airbase") + " hancur.");
        for (const c of S.caps) {
            if (c.done) { for (let i = 0; i < S.res.length; i++) S.res[i].c += (1.5 * dt) / (S.shared ? 1 : 2) * (S.shared ? (i === 0 ? 1 : 0) : 1); continue; }
            let h = 0, a = 0;
            for (const e of hum) if (e.k === "u" && D[e.t].d === "l" && !e.inside && Math.hypot(e.x - c.x, e.y - c.y) < 72) h++;
            for (const e of ali) if (Math.hypot(e.x - c.x, e.y - c.y) < 72) a++;
            if (h && !a) c.p = Math.min(1, c.p + dt / 8); else if (a && !h) c.p = Math.max(0, c.p - dt / 10);
            if (c.p >= 1) { c.done = 1; say("Lokasi strategis direbut!"); }
        }
        const raiders = () => ali.some((a) => a.ord && a.ord.k === "assault");
        switch (ms.k) {
            case "survive": case "naval": case "airbase": if (S.wave.n >= ms.tot && (!raiders() || S.t - S.wave.lt > 100)) end("win", "Semua wave berhasil ditahan!"); break;
            case "hive": if (!ali.some((a) => a.t === "hive")) end("win", "Semua Alien Hive hancur!"); break;
            case "queen": if (!ali.some((a) => a.qq)) end("win", "Queen Alien terbunuh!"); break;
            case "boss": if (ms.bs && !ali.some((a) => D[a.t].boss)) end("win", "Boss alien dikalahkan!"); break;
            case "capture": if (S.caps.every((c) => c.done)) end("win", "Semua lokasi strategis direbut!"); break;
        }
    }
    function end(r, msg) {
        const S = state; if (S.over) return;
        S.over = r; S.omsg = msg;
        S.score = S.wave.n * 100 + S.kills * 5 + (r === "win" ? 1000 + Math.max(0, 600 - Math.round(S.t)) : 0);
        S.stars = r === "win" ? 1 + (S.lostU + S.lostB <= 15 ? 1 : 0) + (S.cheated ? 0 : 1) : 0;
        say(msg);
    }

    /* ---------- snapshot (host -> guest) ---------- */
    function snap() {
        const S = state, W = S.wave;
        return {
            c: S.cfg, t: Math.round(S.t * 10) / 10, r: S.res.map((r) => RK.map((k) => Math.floor(r[k]))), rs: S.rs, rq: S.rq,
            w: [W.n, Math.ceil(W.timer), W.kind], pl: W.plan ? { u: W.plan.u, m: W.plan.m.map((q) => [Math.round(q.x), Math.round(q.y)]) } : 0,
            ms: S.ms, ov: S.over, om: S.omsg, sc: S.score, k: S.kills, cf: S.cheats, ch: S.cheated, aic: S.aic, pw: S.pw, cp: S.caps, msg: S.msg,
            pg: S.pings.map((q) => [Math.round(q.x), Math.round(q.y), q.o, Math.round(q.u - S.t)]), lu: S.lostU, lb: S.lostB, st: S.stars,
            fx: fxq.splice(0).map((f) => ({ ...f })),
            e: S.ents.filter((e) => !e.dead).map((e) => [e.id, e.t, e.o, Math.round(e.x), Math.round(e.y), Math.ceil(e.hp), Math.ceil(e.mh), Math.round(e.a * 10), e.prog < 1 ? Math.round(e.prog * 100) : 100, e.q ? e.q.map((q) => [q.t, Math.round((1 - q.left / q.total) * 100)]) : 0, e.cargo ? e.cargo.length : 0, e.inside ? 1 : 0, e.el ? 1 : 0,
            e.lv || 0, e.ra ? [Math.round(e.ra.x), Math.round(e.ra.y)] : 0, rankOf(e), Math.max(0, Math.ceil((e.ac || 0) - S.t)), e.dep ? 1 : 0, e.pri || 0, (e.sl > S.t ? 1 : 0) | (e.po && e.po.u > S.t ? 2 : 0)]),
        };
    }
    function hydrate(z) {
        const prev = new Map(); if (state) for (const e of state.ents) prev.set(e.id, e);
        const shared = !z.c.coop || z.c.base !== "separate";
        const ents = z.e.map((a) => {
            const d = D[a[1]], p = prev.get(a[0]);
            return { id: a[0], t: a[1], o: a[2], x: a[3], y: a[4], hp: a[5], mh: a[6], a: a[7] / 10, prog: a[8] / 100, q: a[9] ? a[9].map((q) => ({ t: q[0], pct: q[1] })) : [], cargoN: a[10], inside: a[11], el: a[12], lv: a[13], ra: a[14] ? { x: a[14][0], y: a[14][1] } : null, rk: a[15], acr: a[16], dep: a[17], pri: a[18], fl: a[19], k: d.k, tm: d.tm, rx: p ? p.rx : a[3], ry: p ? p.ry : a[4] };
        });
        return {
            cfg: z.c, shared, t: z.t, res: z.r.map((a) => Object.fromEntries(RK.map((k, i) => [k, a[i]]))), rs: z.rs, rq: z.rq,
            wave: { n: z.w[0], timer: z.w[1], kind: z.w[2], plan: z.pl ? { u: z.pl.u, m: z.pl.m.map((a) => ({ x: a[0], y: a[1] })) } : 0 },
            ms: z.ms, over: z.ov, omsg: z.om, score: z.sc, kills: z.k, cheats: z.cf, cheated: z.ch, aic: z.aic, pw: z.pw, caps: z.cp, msg: z.msg, ents,
            pings: z.pg.map((a) => ({ x: a[0], y: a[1], o: a[2], u: z.t + a[3] })), lostU: z.lu, lostB: z.lb, stars: z.st,
        };
    }

    /* ============================ UI ============================ */
    const CSS = `
.as-app{--bg:#0b1016;--pn:#0e141b;--ln:#1f2a37;--tx:#e5e9f0;--mu:#7b8796;--ac:#38bdf8;--bad:#f87171;--dh:96px;color:var(--tx);font:13px/1.4 ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
.as-board{position:relative;padding:0;border:0;border-radius:12px;overflow:hidden}
.as-hud{display:flex;flex-wrap:wrap;align-items:center;gap:8px 14px;margin-bottom:10px;padding:8px 12px;background:var(--pn);border:1px solid var(--ln);border-radius:10px}
.as-app .as-btn{display:inline-flex;align-items:center;gap:6px;padding:5px 10px;min-height:30px;font:inherit;font-size:11px;font-weight:600;color:var(--tx);background:var(--bg);border:1px solid var(--ln);border-radius:8px;cursor:pointer;touch-action:manipulation}
.as-app .as-btn:hover{border-color:var(--ac)}
.as-app .as-btn.on{border-color:var(--ac);color:var(--ac)}
.as-app .as-btn.off{opacity:.45}
.as-app .as-btn svg{flex:none;display:block}
.as-spacer{flex:1 1 auto}
.as{--bg:#0b1016;--pn:#0e141b;--ln:#1f2a37;--tx:#e5e9f0;--mu:#7b8796;--ac:#38bdf8;--bad:#f87171;--th:0px;--dh:96px;position:absolute;inset:0;width:100%;height:100%;background:var(--bg);color:var(--tx);border:1px solid var(--ln);border-radius:12px;overflow:hidden;font:13px/1.4 ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;-webkit-user-select:none;user-select:none;touch-action:none}
.as canvas{position:absolute;left:0;top:0;width:100%;height:100%;display:block}
.as button{font:inherit;color:var(--tx);background:var(--pn);border:1px solid var(--ln);border-radius:8px;padding:6px 12px;cursor:pointer;touch-action:manipulation;transition:border-color .15s,background .15s}
.as button:hover{border-color:var(--ac)}
.as button:focus-visible,.as input:focus-visible{outline:2px solid var(--ac);outline-offset:2px}
.as button.on{border-color:var(--ac);color:var(--ac)}
.as button.off{opacity:.4}
.as button[hidden]{display:none}
.as button.pri{background:var(--ac);border-color:var(--ac);color:#04121c;font-weight:600}
.as h3{margin:0 0 4px;font-size:18px;font-weight:600}
.as p{margin:0 0 8px;line-height:1.5}
.as small{font-size:11px}
.as .mu{color:var(--mu)}
.as input{background:var(--bg);color:var(--tx);border:1px solid var(--ln);border-radius:8px;padding:8px 12px;font:inherit;width:140px;max-width:100%;-webkit-user-select:text;user-select:text}
.as-res{display:flex;flex-wrap:wrap;gap:4px 14px}
.as-status{font-size:11px;color:var(--mu);white-space:nowrap}
.as-r{display:inline-flex;align-items:center;gap:6px;color:var(--mu)}
.as-r i{width:7px;height:7px;border-radius:50%;background:var(--c)}
.as-r b{color:var(--tx);font-weight:600;min-width:2ch}
.as-r.warn b,.as-r.warn small{color:var(--bad)}
.as-wave{flex:1;min-width:150px;text-align:center}
.as-wave small{display:block;color:var(--mu)}
.as-tb{display:flex;gap:4px;flex-wrap:wrap}
.as .as-mini{left:auto;right:12px;top:calc(var(--th) + 8px);width:150px;height:103px;border:1px solid var(--ln);border-radius:8px;background:var(--bg);cursor:pointer}
.as-hint{position:absolute;left:12px;top:calc(var(--th) + 8px);max-width:calc(100% - 180px);color:var(--mu);line-height:1.4}
.as-toast{position:absolute;left:50%;top:calc(var(--th) + 12px);transform:translateX(-50%);background:var(--pn);border:1px solid var(--ac);border-radius:8px;padding:6px 12px;opacity:0;pointer-events:none;transition:opacity .18s;max-width:70%;text-align:center;z-index:2}
.as-toast.show{opacity:1}
.as-sel{position:absolute;left:12px;bottom:calc(var(--dh) + 12px);max-width:calc(100% - 24px);background:var(--pn);border:1px solid var(--ln);border-radius:10px;padding:8px 12px;display:flex;flex-wrap:wrap;gap:4px 8px;align-items:center}
.as-sel:empty{display:none}
.as-sel button{padding:4px 10px}
.as-dock{position:absolute;left:0;right:0;bottom:0;background:var(--pn);border-top:1px solid var(--ln);padding:8px 12px}
.as-tabs{display:flex;gap:4px;margin-bottom:8px;flex-wrap:wrap}
.as-tabs button{padding:4px 12px}
.as-items{display:flex;gap:8px;overflow-x:auto;padding-bottom:4px;touch-action:pan-x;scrollbar-width:thin}
.as-it{flex:0 0 auto;display:flex;flex-direction:column;align-items:flex-start;text-align:left;min-width:104px}
.as-it b{font-weight:600}
.as-it i{font-style:normal;color:var(--mu);font-size:11px}
.as-vc{position:absolute;bottom:calc(var(--dh) + 64px);display:none;gap:8px}
.as.touch .as-vc{display:grid}
.as-vcl{left:12px;grid-template-columns:repeat(3,44px);grid-template-rows:repeat(3,44px)}
.as-vcr{right:12px;grid-template-columns:repeat(2,54px)}
.as-vc button{padding:0;opacity:.9;background:rgba(14,20,27,.85)}
.as-vcl .u{grid-area:1/2}.as-vcl .l{grid-area:2/1}.as-vcl .r{grid-area:2/3}.as-vcl .dn{grid-area:3/2}
.as-ov{position:absolute;inset:0;background:rgba(6,9,13,.8);display:flex;align-items:center;justify-content:center;padding:16px;overflow:auto;touch-action:pan-y;z-index:3}
.as-ov[hidden]{display:none}
.as-card{width:min(540px,100%);max-height:100%;overflow:auto;background:var(--pn);border:1px solid var(--ln);border-radius:14px;padding:20px 24px}
.as-row{margin-top:12px}
.as-row>span{display:block;color:var(--mu);margin-bottom:4px}
.as-seg{display:flex;flex-wrap:wrap;gap:8px}
.as-btns{display:flex;gap:8px;flex-wrap:wrap;margin-top:16px;align-items:center}
.as-st{display:grid;grid-template-columns:auto 1fr;gap:4px 16px;margin-top:12px}
.as-stars{font-size:22px;letter-spacing:4px;color:#facc15}
.as-coin{width:54px;height:54px;border-radius:50%;border:2px solid var(--ac);margin:12px auto;animation:asf .6s linear infinite}
@keyframes asf{to{transform:rotateY(360deg)}}
@media (pointer:coarse){.as-tabs button,.as-sel button{min-height:44px}}
@media (max-width:640px){
.as-app .as-board{flex:0 0 auto;min-height:min(72dvh,620px)}
.as-app .as-hud{gap:5px 8px;padding:6px 8px;margin-bottom:8px}
.as-app .as-hud .as-rl,.as-app .as-hud .as-status,.as-app .as-spacer{display:none}
.as-app .as-hud .as-btn{min-width:26px;min-height:28px;padding:4px 6px;font-size:10px}
.as-app .as-hud .as-btn-label{display:none}
.as-wave{order:3;flex-basis:100%;min-width:0;text-align:left}
.as .as-mini{width:110px;height:76px}
.as-hint{max-width:calc(100% - 130px)}
.as-card{padding:16px}
.as-vcl{left:6px;grid-template-columns:repeat(3,36px);grid-template-rows:repeat(3,36px);gap:3px}
.as-vcr{right:6px;grid-template-columns:repeat(2,44px);gap:3px}
.as-vc button{min-width:36px;min-height:36px;font-size:11px}
}
@media (prefers-reduced-motion:reduce){.as *{transition-duration:.01ms!important}.as-coin{animation:none}}
`;
    root.innerHTML = `<style>${CSS}</style>
  <div class="game-app as-app game-fill">
    <div class="as-hud">
      <div class="as-res" data-res></div>
      <div class="as-wave" data-wave></div>
      <span class="as-status" data-status>Siap</span>
      <span class="as-spacer"></span>
      <div class="as-tb">
        <button class="as-btn" type="button" data-act="early" title="Call the next wave early for bonus Credits">${iconSVG("forward", { size: 14 })}<span class="as-btn-label">Wave+</span></button>
        <button class="as-btn" type="button" data-act="help" title="How to play (H)">${iconSVG("helpCircle", { size: 14 })}<span class="as-btn-label">Help</span></button>
        <button class="as-btn" type="button" data-act="cheat" title="Cheats (C)">${iconSVG("wrench", { size: 14 })}<span class="as-btn-label">Cheats</span></button>
        <button class="as-btn" type="button" data-act="pause" title="Pause (P)">${iconSVG("pause", { size: 14 })}<span class="as-btn-label">Pause</span></button>
        <button class="as-btn" type="button" data-act="restart" title="Restart mission">${iconSVG("refresh", { size: 14 })}<span class="as-btn-label">Restart</span></button>
        <button class="as-btn" type="button" data-exit title="Exit game">${iconSVG("logOut", { size: 14 })}<span class="as-btn-label">Exit</span></button>
        <button class="as-btn" type="button" data-act="snd" data-snd title="Sound">${iconSVG("volume", { size: 14 })}<span class="as-btn-label">Sound</span></button>
        <button class="as-btn" type="button" data-act="touch" title="Toggle touch controls">${iconSVG("smartphone", { size: 14 })}<span class="as-btn-label">Touch</span></button>
      </div>
    </div>
    <section class="game-panel as-board" data-board>
      <div class="as" data-as>
        <canvas data-cv></canvas>
        <div class="as-hint" data-hint></div>
        <canvas class="as-mini" data-mini width="150" height="103"></canvas>
        <div class="as-toast" data-toast></div>
        <div class="as-sel" data-sel></div>
        <div class="as-vc as-vcl"><button class="u" data-hold="up">▲</button><button class="l" data-hold="left">◀</button><button class="r" data-hold="right">▶</button><button class="dn" data-hold="down">▼</button></div>
        <div class="as-vc as-vcr"><button data-act="vc:all">All</button><button data-act="vc:q">Q</button><button data-act="vc:stop">Stop</button><button data-act="vc:box" data-box>Box</button><button data-act="vc:zin">+</button><button data-act="vc:zout">−</button><button data-act="vc:cancel">Batal</button></div>
        <div class="as-dock" data-dock><div class="as-tabs" data-tabs></div><div class="as-items" data-items></div></div>
        <div class="as-ov" data-ov hidden></div>
      </div>
    </section>
  </div>`;
    const $ = (s) => root.querySelector(s);
    const stage = $("[data-as]"), cv = $("[data-cv]"), ctx = cv.getContext("2d"), mini = $("[data-mini]"), mctx = mini.getContext("2d");
    const dockEl = $("[data-dock]"), ovEl = $("[data-ov]"), selEl = $("[data-sel]"), toastEl = $("[data-toast]"), waveEl = $("[data-wave]"), hintEl = $("[data-hint]"), statusEl = $("[data-status]");
    const rEl = {};
    $("[data-res]").innerHTML = RK.map((k) => `<span class="as-r" data-rw="${k}" title="${RLABEL[k]}" style="--c:${RCOL[k]}"><i></i><span class="as-rl">${k.toUpperCase()}</span> <b data-r="${k}">0</b>${k === "e" ? ' <small data-net></small>' : ""}</span>`).join("");
    RK.forEach((k) => (rEl[k] = $(`[data-r="${k}"]`)));

    const cam = { x: 0, y: 0, z: 0.9 };
    let vw = 800, vh = 500, dpr = 1;
    let sel = new Set(), placing = null, cmdMode = "", boxMode = false, tab = "b", ovK = "", helpPg = 0, touchUI = false, paused = false, bestSaved = false;
    const setup = { diff: "normal", mission: "random", first: "random", seed: "", base: "shared" };
    const groups = {}, keys = {}, mouse = { x: 0, y: 0 }, pings = [], timers = [];
    let hold = "", ptr = null, lastMsg = 0, sigSel = "", toastUntil = 0, lastClick = { id: 0, t: 0 }, lowPowerT = 0;
    const HOLD_MS = 280, TAP_MS = 350, DRAG_SLOP = 8, TAP_SLOP = 26;
    let holdTimer = 0, lastTap = { id: 0, t: 0, x: 0, y: 0 };
    let raf = 0, last = 0, accT = 0, uiT = 0, miniT = 0, pubT = 0;
    try { touchUI = Boolean(window.matchMedia && window.matchMedia("(pointer: coarse)").matches); } catch (e) { /* abaikan */ }

    /* ---------- suara (WebAudio, tanpa file) ---------- */
    let actx = null, audioOn = true; const lastSnd = {};
    try { audioOn = localStorage.getItem("alienSiegeMute") !== "1"; } catch (e) { /* abaikan */ }
    function snd(k) {
        if (!audioOn || dead) return;
        const now = performance.now(), lim = { s: 70, b: 110, a: 700, u: 40 };
        if (now - (lastSnd[k] || 0) < (lim[k] || 80)) return; lastSnd[k] = now;
        try {
            if (!actx) { const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return; actx = new AC(); }
            if (actx.state === "suspended") actx.resume();
            const o = actx.createOscillator(), g = actx.createGain(), t = actx.currentTime;
            const P = { s: [520, 0.05, "square", 0.012], b: [120, 0.2, "sawtooth", 0.035], a: [660, 0.3, "triangle", 0.05], u: [880, 0.05, "sine", 0.03] }[k];
            o.type = P[2]; o.frequency.setValueAtTime(P[0], t);
            if (k === "b") o.frequency.exponentialRampToValueAtTime(40, t + P[1]); else if (k === "s") o.frequency.exponentialRampToValueAtTime(260, t + P[1]);
            g.gain.setValueAtTime(P[3], t); g.gain.exponentialRampToValueAtTime(0.0001, t + P[1]);
            o.connect(g); g.connect(actx.destination); o.start(t); o.stop(t + P[1]);
        } catch (e) { /* abaikan */ }
    }

    const myOwner = () => (state && online ? state.cfg.slots[playerIndex] ?? 0 : 0);
    const canCmd = (e) => Boolean(e) && !e.dead && e.tm === "h" && (state.shared || e.o === myOwner());
    const myR = () => state.res[state.shared ? 0 : myOwner()];
    const fmtT = (t) => Math.floor(t / 60) + ":" + String(Math.floor(t % 60)).padStart(2, "0");
    const qpct = (q) => (q.pct !== undefined ? q.pct : Math.round((1 - q.left / q.total) * 100));
    const cargoN = (e) => (e.cargo ? e.cargo.length : e.cargoN || 0);
    const hasOwnRadar = () => state.ents.some((e) => e.t === "rs" && e.prog >= 1 && canCmd(e));
    const hasRadar = () => Boolean(state.cheats.reveal) || (state.ents.some((e) => e.t === "rs" && e.prog >= 1 && e.tm === "h" && !e.dead) && myR().e > 0.5);
    const abCd = (e) => (e.acr !== undefined ? e.acr : Math.max(0, Math.ceil((e.ac || 0) - state.t)));
    const statusFl = (e) => (e.fl !== undefined ? e.fl : (e.sl > state.t ? 1 : 0) | (e.po && e.po.u > state.t ? 2 : 0));
    const toWorld = (sx, sy) => ({ x: cam.x + sx / cam.z, y: cam.y + sy / cam.z });
    function toast(t) { toastEl.textContent = t; toastEl.classList.add("show"); toastUntil = performance.now() + 3500; }
    function netPower() {
        let n = 0; const me = myOwner();
        for (const e of state.ents) {
            if (e.k !== "b" || e.tm !== "h" || e.prog < 1 || e.dead || (!state.shared && e.o !== me)) continue;
            const d = D[e.t]; n += (d.inc && d.inc.e ? d.inc.e * (1 + 0.3 * (e.lv || 0)) : 0) - (d.up || 0);
        }
        return n;
    }
    function clampCam() {
        const mw = MW * TS, mh = MH * TS, zmin = Math.max(vw / mw, vh / mh);
        cam.z = clamp(cam.z, zmin, 1.8);
        cam.x = clamp(cam.x, 0, Math.max(0, mw - vw / cam.z)); cam.y = clamp(cam.y, 0, Math.max(0, mh - vh / cam.z));
    }
    function centerOn(x, y) { cam.x = x - vw / (2 * cam.z); cam.y = y - vh / (2 * cam.z); clampCam(); }
    function resize() {
        const r = stage.getBoundingClientRect();
        vw = Math.max(200, r.width || 800); vh = Math.max(200, r.height || 500); dpr = Math.min(2, window.devicePixelRatio || 1);
        cv.width = Math.round(vw * dpr); cv.height = Math.round(vh * dpr);
        stage.style.setProperty("--th", "0px"); stage.style.setProperty("--dh", dockEl.offsetHeight + "px");
        clampCam();
    }

    /* ---------- seleksi & perintah ---------- */
    const selEnts = () => { const r = []; for (const id of sel) { const e = byid.get(id); if (e && !e.dead) r.push(e); } return r; };
    const selUnits = () => selEnts().filter((e) => e.k === "u" && canCmd(e) && !e.inside);
    const armyIds = () => state.ents.filter((e) => e.k === "u" && canCmd(e) && !e.inside && D[e.t].dmg > 0).map((e) => e.id);
    function submit(a) {
        if (!state || state.over) return;
        if (online && !isHost) room.sendAction(a).catch(console.warn); else applyAction(a, playerIndex);
    }
    function pickAt(wx, wy) {
        let best = null, bd = 1e9;
        for (const e of state.ents) {
            if (e.k !== "u" || e.dead || e.inside) continue; const d = D[e.t], dd = Math.hypot(wx - e.x, wy - e.y) - (d.d === "a" ? 40 : 0);
            if (dd <= d.z + 8 && dd < bd) { bd = dd; best = e; }
        }
        if (best) return best;
        for (const e of state.ents) if (e.k === "b" && !e.dead && Math.abs(wx - e.x) <= D[e.t].z && Math.abs(wy - e.y) <= D[e.t].z) return e;
        return null;
    }
    function boxSelect(a, b, add) {
        const xa = Math.min(a.x, b.x), xb = Math.max(a.x, b.x), ya = Math.min(a.y, b.y), yb = Math.max(a.y, b.y), inb = (e) => e.x >= xa && e.x <= xb && e.y >= ya && e.y <= yb;
        const us = state.ents.filter((e) => e.k === "u" && canCmd(e) && !e.inside && inb(e));
        if (!add) sel.clear();
        if (us.length) us.forEach((e) => sel.add(e.id)); else { const bd = state.ents.find((e) => e.k === "b" && canCmd(e) && inb(e)); if (bd) sel.add(bd.id); }
    }
    function clickAt(wx, wy, add) {
        const hit = pickAt(wx, wy), now = performance.now();
        if (!add) sel.clear();
        if (!hit) return;
        if (hit.k === "u" && canCmd(hit) && lastClick.id === hit.id && now - lastClick.t < 380) {
            const x0 = cam.x, y0 = cam.y, x1 = cam.x + vw / cam.z, y1 = cam.y + vh / cam.z;
            for (const e of state.ents) if (e.t === hit.t && canCmd(e) && !e.inside && e.x > x0 && e.x < x1 && e.y > y0 && e.y < y1) sel.add(e.id);
        } else sel.add(hit.id);
        lastClick = { id: hit.id, t: now };
    }
    function command(wx, wy, hit, mode) {
        const us = selUnits(); if (!us.length) return false;
        const ids = us.map((e) => e.id), m = mode || cmdMode; let o;
        if (hit && hit.tm === "a" && m !== "patrol") o = { k: "atk", id: hit.id };
        else if (hit && hit.tm === "h" && D[hit.t].cap && !sel.has(hit.id) && us.some((e) => D[e.t].cl === "inf")) o = { k: "board", id: hit.id };
        else o = { k: m === "amove" || m === "patrol" ? m : "move", x: wx, y: wy };
        submit({ t: "order", ids, o }); pings.push({ x: wx, y: wy, t: 0.5, c: o.k === "atk" ? "#f87171" : "#e5e9f0" }); cmdMode = ""; return true;
    }
    function execMode(w) {
        const m = cmdMode;
        if (m === "amove" || m === "patrol") command(w.x, w.y, null, m);
        else if (m === "ping") { submit({ t: "ping", x: Math.round(w.x), y: Math.round(w.y) }); cmdMode = ""; }
        else if (m === "rally") { const b = selEnts()[0]; if (b) { submit({ t: "rally", b: b.id, x: Math.round(w.x), y: Math.round(w.y) }); toast("Rally point diatur"); } cmdMode = ""; }
        else if (m.startsWith("pw:")) { submit({ t: "power", p: m.slice(3), x: Math.round(w.x), y: Math.round(w.y) }); cmdMode = ""; }
    }
    function rightClick(sx, sy) {
        if (placing || cmdMode) { placing = null; cmdMode = ""; return; }
        const w = toWorld(sx, sy), es = selEnts();
        if (!selUnits().length && es.length === 1 && es[0].k === "b" && canCmd(es[0]) && D[es[0].t].pr) { submit({ t: "rally", b: es[0].id, x: Math.round(w.x), y: Math.round(w.y) }); toast("Rally point diatur"); return; }
        command(w.x, w.y, pickAt(w.x, w.y));
    }
    function tapAt(wx, wy) {
        const hit = pickAt(wx, wy), now = performance.now();
        const dbl = now - lastTap.t < TAP_MS && Math.hypot(wx - lastTap.x, wy - lastTap.y) < TAP_SLOP;
        if (dbl) {
            const boardable = hit && hit.tm === "h" && D[hit.t].cap && !sel.has(hit.id) && selUnits().some((e) => D[e.t].cl === "inf");
            if (boardable) command(wx, wy, hit);
            else if (hit && hit.tm === "h" && canCmd(hit) && hit.k === "u" && hit.id === lastTap.id) {
                const x0 = cam.x, y0 = cam.y, x1 = cam.x + vw / cam.z, y1 = cam.y + vh / cam.z;
                sel.clear();
                for (const e of state.ents) if (e.t === hit.t && canCmd(e) && !e.inside && e.x > x0 && e.x < x1 && e.y > y0 && e.y < y1) sel.add(e.id);
            } else command(wx, wy, hit);
            lastTap = { id: 0, t: 0, x: 0, y: 0 };
            return;
        }
        if (hit && hit.tm === "h" && canCmd(hit)) {
            const boardIntent = D[hit.t].cap && !sel.has(hit.id) && selUnits().some((e) => D[e.t].cl === "inf");
            if (!boardIntent) { sel.clear(); sel.add(hit.id); }
        }
        // tanah kosong / musuh: seleksi dipertahankan supaya double-tap bisa memberi perintah
        lastTap = { id: hit ? hit.id : 0, t: now, x: wx, y: wy };
    }
    function tryPlace(w, keep) {
        const d = D[placing], ox = Math.round(w.x / TS - d.sz / 2), oy = Math.round(w.y / TS - d.sz / 2);
        if (canPlace(d, ox, oy, myOwner()) && afford(myR(), d.c)) { submit({ t: "build", k: placing, x: ox, y: oy }); if (!keep && placing !== "wl") placing = null; }
        else toast(afford(myR(), d.c) ? "Lokasi tidak valid" : "Sumber daya kurang");
    }
    const bestProducer = (u) => {
        let best = null;
        for (const e of state.ents) if (e.k === "b" && canCmd(e) && e.prog >= 1 && D[e.t].pr && D[e.t].pr.includes(u) && (!best || e.q.length < best.q.length)) best = e;
        return best;
    };
    function availUnit(id) {
        const d = D[id];
        if (d.rq && lvl(myOwner(), d.rq[0]) < d.rq[1]) return "Butuh riset " + RS[d.rq[0]][0] + " Lv" + d.rq[1];
        const pb = ["hq", "bk", "vf", "ab", "ns"].find((b) => D[b].pr.includes(id));
        if (!bestProducer(id)) return "Butuh " + D[pb].n;
        return afford(myR(), d.c) ? "" : "Resource kurang";
    }
    function availPower(id) {
        const P = PW[id], ri = state.shared ? 0 : myOwner(), rem = Math.ceil(((state.pw[ri] || {})[id] || 0) - state.t);
        return !hasOwnRadar() ? "Butuh Radar Station" : rem > 0 ? "Cooldown " + rem + " d" : !afford(myR(), P.c) ? "Resource kurang" : "";
    }
    function setTab(t) { if (t === "y" && !online) return; tab = t; dockBuild(); }

    /* ---------- input ---------- */
    const ovBlocks = () => ovK !== "";
    function clearHold() { if (holdTimer) { clearTimeout(holdTimer); holdTimer = 0; } }
    function armHold() {
        clearHold();
        holdTimer = setTimeout(() => {
            holdTimer = 0;
            if (ptr && ptr.mode === "pending" && !ptr.moved) {
                ptr.mode = "box"; ptr.held = true;
                try { if (ptr.touch && navigator.vibrate) navigator.vibrate(12); } catch (e) { /* abaikan */ }
            }
        }, HOLD_MS);
    }
    function onDown(ev) {
        if (!state || ovBlocks() || ptr) return;
        const r = cv.getBoundingClientRect(), sx = ev.clientX - r.left, sy = ev.clientY - r.top; mouse.x = sx; mouse.y = sy;
        if (ev.button === 0 && ev.altKey && online) { const w = toWorld(sx, sy); submit({ t: "ping", x: Math.round(w.x), y: Math.round(w.y) }); return; }
        try { cv.setPointerCapture(ev.pointerId); } catch (e) { /* abaikan */ }
        const touch = ev.pointerType === "touch";
        ptr = { id: ev.pointerId, sx, sy, x: sx, y: sy, touch, moved: false, mode: "pending", held: false };
        if (ev.button === 1 || keys[" "]) ptr.mode = "pan";
        else if (ev.button === 2) { ptr.mode = "cmd"; rightClick(sx, sy); }
        else if (placing) ptr.mode = "place";
        else if (cmdMode) ptr.mode = "mode";
        else if (boxMode) ptr.mode = "box";
        else armHold();
    }
    function onMove(ev) {
        const r = cv.getBoundingClientRect(); mouse.x = ev.clientX - r.left; mouse.y = ev.clientY - r.top;
        if (!ptr || ptr.id !== ev.pointerId) return;
        if (Math.hypot(mouse.x - ptr.sx, mouse.y - ptr.sy) > DRAG_SLOP) {
            if (!ptr.moved) lastTap = { id: 0, t: 0, x: 0, y: 0 };
            ptr.moved = true;
        }
        if (ptr.mode === "pending" && ptr.moved) { clearHold(); ptr.mode = "pan"; }
        if (ptr.mode === "pan" || (ptr.mode === "mode" && ptr.touch && ptr.moved)) { cam.x -= (mouse.x - ptr.x) / cam.z; cam.y -= (mouse.y - ptr.y) / cam.z; clampCam(); }
        ptr.x = mouse.x; ptr.y = mouse.y;
    }
    function onUp(ev) {
        if (!ptr || ptr.id !== ev.pointerId) return;
        const p = ptr; ptr = null; clearHold(); if (!state) return;
        const w = toWorld(p.x, p.y);
        if (p.mode === "place") tryPlace(w, ev.shiftKey);
        else if (p.mode === "mode") { if (!(p.touch && p.moved)) execMode(w); }
        else if (p.mode === "box") { if (p.moved) boxSelect(toWorld(p.sx, p.sy), w, ev.shiftKey); else if (p.touch) tapAt(w.x, w.y); else clickAt(w.x, w.y, ev.shiftKey); }
        else if (p.mode === "pending" && !p.moved) { if (p.touch) tapAt(w.x, w.y); else clickAt(w.x, w.y, ev.shiftKey); }
        // "pan": drag cepat hanya menggeser kamera, bukan seleksi
    }
    function onWheel(ev) {
        ev.preventDefault(); if (!state) return;
        const before = toWorld(mouse.x, mouse.y); cam.z *= ev.deltaY < 0 ? 1.12 : 1 / 1.12; clampCam();
        cam.x += before.x - toWorld(mouse.x, mouse.y).x; cam.y += before.y - toWorld(mouse.x, mouse.y).y; clampCam();
    }
    function miniPointer(ev) {
        if (!state) return;
        const r = mini.getBoundingClientRect(), wx = ((ev.clientX - r.left) / r.width) * MW * TS, wy = ((ev.clientY - r.top) / r.height) * MH * TS;
        if (ev.type === "pointerdown" && ev.button === 2) { command(wx, wy, null, "move"); return; }
        if (ev.type === "pointermove" && !(ev.buttons & 1)) return;
        if (ev.button === 0 || ev.type === "pointermove") centerOn(wx, wy);
    }
    function onKey(ev) {
        if (dead || (ev.target && /^(INPUT|TEXTAREA|SELECT)$/.test(ev.target.tagName))) return;
        const k = ev.key.length === 1 ? ev.key.toLowerCase() : ev.key;
        if (ev.type === "keyup") { keys[k] = false; return; }
        keys[k] = true;
        if (k === "Escape") { if (ovK === "help" || ovK === "cheat" || ovK === "pause") closeOv(); else if (ovK === "") { if (placing || cmdMode) { placing = null; cmdMode = ""; } else sel.clear(); } return; }
        if (!state || ovK === "setup" || ovK === "toss") return;
        if (k === "p") { if (ovK === "pause") closeOv(); else ovPause(); return; }
        if (k === "?" || k === "F1") { ovHelp(); ev.preventDefault(); return; }
        if (ovK) return;
        if (k === "c") { ovCheat(); return; }
        if (ev.ctrlKey || ev.metaKey) {
            if (k === "a") { ev.preventDefault(); sel = new Set(armyIds()); }
            else if (/^[1-9]$/.test(k)) { ev.preventDefault(); groups[k] = Array.from(sel); }
            return;
        }
        if (/^[1-9]$/.test(k)) { if (groups[k]) { const same = groups[k].join() === Array.from(sel).join(); sel = new Set(groups[k].filter((id) => byid.get(id) && !byid.get(id).dead)); if (same) { const e = selEnts()[0]; if (e) centerOn(e.x, e.y); } } return; }
        if (k === "b") setTab("b"); else if (k === "t") setTab("d"); else if (k === "u") setTab("u"); else if (k === "r") setTab("r"); else if (k === "g") setTab("g"); else if (k === "y") setTab("y");
        else if (k === "q") { if (selUnits().length) { cmdMode = "amove"; placing = null; toast("Attack-move: klik tujuan"); } }
        else if (k === "v") { if (selUnits().length) { cmdMode = "patrol"; placing = null; toast("Patroli: klik titik tujuan"); } }
        else if (k === "n" && online) { cmdMode = "ping"; placing = null; toast("Ping: klik lokasi"); }
        else if (k === "e") submit({ t: "abil", ids: selUnits().map((e) => e.id) });
        else if (k === "x") submit({ t: "order", ids: selUnits().map((e) => e.id), o: { k: "stop" } });
        else if (k === "h") submit({ t: "order", ids: selUnits().map((e) => e.id), o: { k: "hold" } });
        else if (k === "z") submit({ t: "unload", ids: selEnts().map((e) => e.id) });
        else if (k === "f" || k === "Home") { const h = state.ents.find((e) => e.t === "hq" && canCmd(e)) || state.ents.find((e) => e.t === "hq"); if (h) centerOn(h.x, h.y); }
        else if (k === "+" || k === "=") { cam.z *= 1.15; clampCam(); } else if (k === "-") { cam.z /= 1.15; clampCam(); }
        if (/^Arrow/.test(ev.key) || ev.key === " ") ev.preventDefault();
    }
    function panCam(dt) {
        const dx = (keys.d || keys.ArrowRight || hold === "right" ? 1 : 0) - (keys.a || keys.ArrowLeft || hold === "left" ? 1 : 0);
        const dy = (keys.s || keys.ArrowDown || hold === "down" ? 1 : 0) - (keys.w || keys.ArrowUp || hold === "up" ? 1 : 0);
        if (dx || dy) { cam.x += (dx * 720 * dt) / cam.z; cam.y += (dy * 720 * dt) / cam.z; clampCam(); }
    }

    /* ---------- gambar ---------- */
    function rr(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
    function hpBar(g, x, y, w, e) {
        const f = clamp(e.hp / e.mh, 0, 1);
        g.fillStyle = "rgba(0,0,0,.6)"; g.fillRect(x - w / 2, y, w, 3.5); g.fillStyle = f > 0.5 ? "#4ade80" : f > 0.25 ? "#facc15" : "#f87171"; g.fillRect(x - w / 2, y, w * f, 3.5);
    }
    function drawU(g, e) {
        const d = D[e.t], x = e.rx ?? e.x, y = e.ry ?? e.y, z = d.z, hu = e.tm === "h";
        const col = hu ? OC[e.o] : d.boss ? "#f43f5e" : d.d === "a" ? "#e879f9" : d.d === "s" ? "#2dd4bf" : "#fb923c";
        g.save(); g.translate(x, y);
        if (d.d === "a") { g.fillStyle = "rgba(0,0,0,.3)"; g.beginPath(); g.ellipse(6, 11, z, z * 0.55, 0, 0, 7); g.fill(); }
        g.rotate(e.a || 0); g.lineWidth = 1.6; g.strokeStyle = col; g.fillStyle = hu ? "#0f1822" : col + "55";
        if (!hu) {
            g.beginPath();
            if (d.d === "l") for (let i = -1; i <= 1; i++) { g.moveTo(i * z * 0.5, -z * 0.6); g.lineTo(i * z * 0.8, -z * 1.15); g.moveTo(i * z * 0.5, z * 0.6); g.lineTo(i * z * 0.8, z * 1.15); }
            else if (d.d === "a") { g.ellipse(-z * 0.1, -z * 0.95, z * 0.9, z * 0.32, 0.4, 0, 7); g.ellipse(-z * 0.1, z * 0.95, z * 0.9, z * 0.32, -0.4, 0, 7); }
            else { g.moveTo(-z * 0.4, 0); g.lineTo(-z * 1.4, -z * 0.5); g.lineTo(-z * 1.4, z * 0.5); g.closePath(); }
            g.stroke();
        }
        g.beginPath();
        if (hu) {
            if (d.d === "l") { if (d.cl === "rob") g.rect(-z, -z, 2 * z, 2 * z); else g.arc(0, 0, z, 0, 7); }
            else if (d.d === "s") { g.moveTo(z * 1.5, 0); g.lineTo(-z, -z * 0.75); g.lineTo(-z * 0.7, 0); g.lineTo(-z, z * 0.75); g.closePath(); }
            else { g.moveTo(z * 1.3, 0); g.lineTo(-z, -z); g.lineTo(-z * 0.45, 0); g.lineTo(-z, z); g.closePath(); }
        } else g.ellipse(0, 0, z * (d.d === "a" ? 1.1 : 1.15), z * (d.d === "a" ? 0.55 : 0.8), 0, 0, 7);
        g.fill(); g.stroke();
        if (hu && d.d === "l" && d.dmg > 0) { g.beginPath(); g.moveTo(0, 0); g.lineTo(z * 1.5, 0); g.stroke(); }
        g.restore();
        if (e.el) { g.strokeStyle = "#fbbf24"; g.lineWidth = 1.5; g.beginPath(); g.arc(x, y, z + 3, 0, 7); g.stroke(); }
        if (d.boss) { g.strokeStyle = "#fbbf24"; g.lineWidth = 2; g.beginPath(); g.arc(x, y, z + 5, 0, 7); g.stroke(); }
        const fl = statusFl(e);
        if (fl) { g.lineWidth = 1.5; g.strokeStyle = fl & 2 ? "#a3e635" : "#67e8f9"; g.setLineDash([3, 3]); g.beginPath(); g.arc(x, y, z + 7, 0, 7); g.stroke(); g.setLineDash([]); }
        if (e.dep) { g.strokeStyle = "#fbbf24"; g.lineWidth = 1.5; g.strokeRect(x - z - 3, y - z - 3, 2 * z + 6, 2 * z + 6); }
        const s = sel.has(e.id);
        if (s) { g.strokeStyle = "#fff"; g.lineWidth = 1.5; g.beginPath(); g.arc(x, y, z + 5, 0, 7); g.stroke(); }
        if (s || e.hp < e.mh) hpBar(g, x, y - z - 9, Math.max(16, z * 2), e);
        const rk = hu ? rankOf(e) : 0; if (rk) { g.fillStyle = "#fbbf24"; g.font = "8px system-ui"; g.textAlign = "center"; g.textBaseline = "top"; g.fillText("▲".repeat(rk), x, y + z + 3); }
        const cn = cargoN(e); if (cn) { g.fillStyle = "#fff"; g.font = "600 10px system-ui"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(cn, x, y); }
    }
    function drawB(g, e) {
        const d = D[e.t], x = e.rx ?? e.x, y = e.ry ?? e.y, s = d.sz * TS, hu = e.tm === "h", col = hu ? OC[e.o] : "#fb7185", built = e.prog >= 1;
        g.save(); g.translate(x, y); g.lineWidth = 1.8; g.strokeStyle = col; g.fillStyle = hu ? "#0f1822" : "#2a1420"; if (!built) g.globalAlpha = 0.6;
        if (e.t === "hive") { g.beginPath(); g.ellipse(0, 0, s * 0.5, s * 0.42, 0, 0, 7); g.fill(); g.stroke(); g.beginPath(); g.ellipse(0, -4, s * 0.25, s * 0.2, 0, 0, 7); g.stroke(); }
        else if (e.t === "wl") { g.fillStyle = "#1b2633"; g.fillRect(-s / 2 + 2, -s / 2 + 2, s - 4, s - 4); g.strokeRect(-s / 2 + 2, -s / 2 + 2, s - 4, s - 4); }
        else if (d.dmg > 0 && !d.cap) {
            g.beginPath(); g.arc(0, 0, s * 0.36, 0, 7); g.fill(); g.stroke();
            g.save(); g.rotate(e.a || 0); g.fillStyle = col; g.fillRect(0, -2, s * 0.55, 4); g.restore();
            g.fillStyle = col; g.font = "600 9px system-ui"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(d.g, 0, 0);
        } else {
            rr(g, -s / 2 + 2, -s / 2 + 2, s - 4, s - 4, 6); g.fill(); g.stroke();
            g.fillStyle = col; g.font = "600 " + Math.max(10, s * 0.22) + "px system-ui"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(d.g, 0, 0);
        }
        g.restore();
        if (!built) { g.fillStyle = "rgba(0,0,0,.6)"; g.fillRect(x - s / 2 + 4, y + s / 2 - 8, s - 8, 4); g.fillStyle = col; g.fillRect(x - s / 2 + 4, y + s / 2 - 8, (s - 8) * e.prog, 4); }
        if (e.lv) { g.fillStyle = "#facc15"; for (let i = 0; i < e.lv; i++) g.fillRect(x - s / 2 + 5 + i * 6, y - s / 2 + 5, 4, 4); }
        if (d.cap && cargoN(e)) { g.fillStyle = "#fff"; g.font = "600 10px system-ui"; g.textAlign = "right"; g.textBaseline = "bottom"; g.fillText(cargoN(e) + "/" + d.cap, x + s / 2 - 5, y + s / 2 - 4); }
        const sl = sel.has(e.id);
        if (sl) {
            g.strokeStyle = "#fff"; g.lineWidth = 1.5; g.strokeRect(x - s / 2, y - s / 2, s, s);
            const rg = d.r * (1 + 0.08 * (e.lv || 0)); if (rg) { g.strokeStyle = "rgba(255,255,255,.25)"; g.beginPath(); g.arc(x, y, rg, 0, 7); g.stroke(); }
            if (e.ra) { g.strokeStyle = "#e5e9f0"; g.setLineDash([4, 4]); g.beginPath(); g.moveTo(x, y); g.lineTo(e.ra.x, e.ra.y); g.stroke(); g.setLineDash([]); g.fillStyle = "#e5e9f0"; g.fillRect(e.ra.x - 1, e.ra.y - 16, 2, 16); g.fillRect(e.ra.x, e.ra.y - 16, 10, 6); }
        }
        if (sl || e.hp < e.mh) hpBar(g, x, y - s / 2 - 6, Math.max(20, s * 0.8), e);
    }
    function draw() {
        const g = ctx, S = state;
        g.setTransform(dpr, 0, 0, dpr, 0, 0); g.fillStyle = "#0b1016"; g.fillRect(0, 0, vw, vh);
        if (!S || !terrain) return;
        g.save(); g.scale(cam.z, cam.z); g.translate(-cam.x, -cam.y); g.drawImage(terrain, 0, 0);
        const x0 = cam.x - 80, y0 = cam.y - 80, x1 = cam.x + vw / cam.z + 80, y1 = cam.y + vh / cam.z + 80;
        const vis = (e) => { const x = e.rx ?? e.x, y = e.ry ?? e.y; return x > x0 && x < x1 && y > y0 && y < y1; };
        const tnow = performance.now() / 1000;
        for (const n of map.node) {
            const x = (n.x + 0.5) * TS, y = (n.y + 0.5) * TS; g.strokeStyle = n.k === "m" ? "#94a3b8" : "#fb923c"; g.globalAlpha = 0.7; g.lineWidth = 1.5;
            g.beginPath(); g.arc(x, y, 10, 0, 7); g.stroke(); g.fillStyle = g.strokeStyle; g.font = "600 9px system-ui"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(n.k === "m" ? "M" : "F", x, y); g.globalAlpha = 1;
        }
        for (const c of S.caps) {
            g.strokeStyle = c.done ? "#4ade80" : "#facc15"; g.lineWidth = 2; g.setLineDash([6, 5]); g.beginPath(); g.arc(c.x, c.y, 72, 0, 7); g.stroke(); g.setLineDash([]);
            if (c.p > 0 && !c.done) { g.beginPath(); g.arc(c.x, c.y, 60, -1.57, -1.57 + 6.283 * c.p); g.stroke(); }
        }
        if (S.wave.plan && hasRadar()) {
            for (const m of S.wave.plan.m) {
                const a = 0.5 + 0.5 * Math.sin(tnow * 6), px = clamp(m.x, 20, MW * TS - 20), py = clamp(m.y, 20, MH * TS - 20);
                g.strokeStyle = "#f87171"; g.globalAlpha = a; g.lineWidth = 2.5; g.beginPath(); g.arc(px, py, 34, 0, 7); g.stroke();
                g.fillStyle = "#f87171"; g.font = "700 18px system-ui"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText("!", px, py); g.globalAlpha = 1;
            }
        }
        for (const e of S.ents) if (e.k === "b" && !e.dead && vis(e)) drawB(g, e);
        for (const pass of ["s", "l", "a"]) for (const e of S.ents) if (e.k === "u" && !e.dead && !e.inside && D[e.t].d === pass && vis(e)) drawU(g, e);
        for (const f of fx) {
            const a = clamp(f.t / (f.k === "l" ? 0.12 : 0.35), 0, 1); g.globalAlpha = a; g.strokeStyle = f.c;
            g.lineWidth = f.k === "l" ? 1.6 : 2; g.beginPath();
            if (f.k === "l") { g.moveTo(f.x1, f.y1); g.lineTo(f.x2, f.y2); } else g.arc(f.x, f.y, f.r * (1.25 - a * 0.6), 0, 7);
            g.stroke();
        }
        g.globalAlpha = 1;
        for (let i = pings.length - 1; i >= 0; i--) { const p = pings[i]; p.t -= 1 / 60; if (p.t <= 0) { pings.splice(i, 1); continue; } g.globalAlpha = p.t * 2; g.strokeStyle = p.c; g.lineWidth = 2; g.beginPath(); g.arc(p.x, p.y, 22 - p.t * 24, 0, 7); g.stroke(); }
        g.globalAlpha = 1;
        for (const q of S.pings) {
            const rem = q.u - S.t; if (rem <= 0) continue; const a = 0.5 + 0.5 * Math.sin(tnow * 8), c = OC[q.o] || "#fff";
            g.strokeStyle = c; g.fillStyle = c; g.globalAlpha = a; g.lineWidth = 2.5; g.beginPath(); g.arc(q.x, q.y, 26, 0, 7); g.stroke();
            g.globalAlpha = 1; g.font = "700 11px system-ui"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText("P" + (q.o + 1), q.x, q.y - 36);
        }
        if (placing) {
            const d = D[placing], w = toWorld(ptr ? ptr.x : mouse.x, ptr ? ptr.y : mouse.y), ox = Math.round(w.x / TS - d.sz / 2), oy = Math.round(w.y / TS - d.sz / 2), ok = canPlace(d, ox, oy, myOwner()) && afford(myR(), d.c);
            g.fillStyle = ok ? "rgba(74,222,128,.28)" : "rgba(248,113,113,.3)"; g.strokeStyle = ok ? "#4ade80" : "#f87171"; g.lineWidth = 1.5;
            g.fillRect(ox * TS, oy * TS, d.sz * TS, d.sz * TS); g.strokeRect(ox * TS, oy * TS, d.sz * TS, d.sz * TS);
            if (d.r) { g.strokeStyle = "rgba(255,255,255,.3)"; g.beginPath(); g.arc((ox + d.sz / 2) * TS, (oy + d.sz / 2) * TS, d.r, 0, 7); g.stroke(); }
        } else if (cmdMode.startsWith("pw:")) {
            const w = toWorld(ptr ? ptr.x : mouse.x, ptr ? ptr.y : mouse.y), id = cmdMode.slice(3), r = id === "air" ? 140 : id === "orb" ? 95 : 150;
            g.strokeStyle = "#c4b5fd"; g.lineWidth = 2; g.setLineDash([8, 6]); g.beginPath(); g.arc(w.x, w.y, r, 0, 7); g.stroke(); g.setLineDash([]);
        }
        g.restore();
        if (ptr && ptr.mode === "box" && ptr.moved) {
            const bx = Math.min(ptr.sx, ptr.x), by = Math.min(ptr.sy, ptr.y), bw = Math.abs(ptr.x - ptr.sx), bh = Math.abs(ptr.y - ptr.sy);
            g.strokeStyle = "#38bdf8"; g.fillStyle = "rgba(56,189,248,.1)"; g.lineWidth = 1; g.fillRect(bx, by, bw, bh); g.strokeRect(bx, by, bw, bh);
        } else if (ptr && ptr.held && !ptr.moved) {
            g.strokeStyle = "#38bdf8"; g.globalAlpha = 0.45 + 0.35 * Math.sin(performance.now() / 120); g.lineWidth = 2;
            g.beginPath(); g.arc(ptr.sx, ptr.sy, 14, 0, 7); g.stroke(); g.globalAlpha = 1;
        }
    }
    function drawMini() {
        const g = mctx, w = 150, h = 103, sx = w / (MW * TS), sy = h / (MH * TS), S = state;
        g.clearRect(0, 0, w, h); if (!terrain) return; g.drawImage(terrain, 0, 0, w, h);
        const radar = hasRadar(), scouts = S.ents.filter((e) => e.t === "rd" && !e.dead), blink = Math.floor(performance.now() / 300) % 2;
        for (const e of S.ents) {
            if (e.dead || e.inside) continue;
            if (e.tm === "a" && !radar && !scouts.some((s) => Math.hypot(s.x - e.x, s.y - e.y) < 420)) continue;
            g.fillStyle = e.tm === "a" ? "#fb923c" : OC[e.o]; const sz = e.k === "b" ? 3.5 : 2; g.fillRect(e.x * sx - sz / 2, e.y * sy - sz / 2, sz, sz);
        }
        g.lineWidth = 1; g.strokeStyle = "#facc15"; for (const c of S.caps) { g.beginPath(); g.arc(c.x * sx, c.y * sy, 3, 0, 7); g.stroke(); }
        if (radar && S.wave.plan && blink) { g.strokeStyle = "#f87171"; for (const m of S.wave.plan.m) { g.beginPath(); g.arc(clamp(m.x, 0, MW * TS) * sx, clamp(m.y, 0, MH * TS) * sy, 5, 0, 7); g.stroke(); } }
        for (const q of S.pings) if (q.u > S.t) { g.strokeStyle = OC[q.o]; g.beginPath(); g.arc(q.x * sx, q.y * sy, 4 + blink * 2, 0, 7); g.stroke(); }
        g.strokeStyle = "#fff"; g.strokeRect(cam.x * sx, cam.y * sy, (vw / cam.z) * sx, (vh / cam.z) * sy);
    }

    /* ---------- HUD, dock, panel seleksi ---------- */
    function objText() {
        const S = state, ms = S.ms, n = S.wave.n;
        switch (ms.k) {
            case "survive": return "Pertahankan HQ: wave " + Math.min(n, ms.tot) + "/" + ms.tot;
            case "naval": return "Lindungi Naval Shipyard: wave " + Math.min(n, ms.tot) + "/" + ms.tot;
            case "airbase": return "Lindungi Airbase: wave " + Math.min(n, ms.tot) + "/" + ms.tot;
            case "hive": return "Hancurkan Alien Hive (" + S.ents.filter((e) => e.t === "hive" && !e.dead).length + " tersisa)";
            case "queen": return "Bunuh Queen Alien di dalam hive";
            case "boss": return ms.bs ? "Eliminasi boss alien" : "Boss alien muncul di wave " + ms.bw;
            case "capture": return "Rebut lokasi strategis " + S.caps.filter((c) => c.done).length + "/" + S.caps.length;
        }
        return "";
    }
    function hint() {
        const S = state, me = myOwner(), mine = (e) => e.tm === "h" && !e.dead && (S.shared || e.o === me), has = (t) => S.ents.some((e) => e.t === t && mine(e));
        if (S.t > 900) return "";
        if (!has("pg")) return "Langkah 1: bangun Power Generator (tab Build).";
        if (!has("rf")) return "Langkah 2: bangun Resource Factory, lebih baik dekat node M/F di peta.";
        if (!has("bk")) return "Langkah 3: bangun Barracks untuk memproduksi pasukan.";
        if (S.ents.filter((e) => e.k === "b" && D[e.t].dmg > 0 && mine(e)).length < 3) return "Pasang turret (tab Defense) di arah datangnya alien.";
        if (!has("rl")) return "Bangun Research Lab untuk membuka teknologi baru.";
        if (!has("rs")) return "Radar Station: peringatan wave, minimap alien, dan Commander Powers (tab Powers).";
        return "";
    }
    function hud() {
        const S = state, Rr = myR(), W = S.wave, ms = S.ms, ne = netPower();
        for (const k of RK) { const v = String(Math.floor(Rr[k])); if (rEl[k].textContent !== v) rEl[k].textContent = v; }
        const netEl = $("[data-net]"); netEl.textContent = (ne >= 0 ? "+" : "") + ne.toFixed(1) + "/s";
        const lowE = Rr.e <= 0.5 && ne < 0; $('[data-rw="e"]').classList.toggle("warn", lowE || (ne < 0 && Rr.e < 20));
        $('[data-rw="f"]').classList.toggle("warn", Rr.f < 8);
        if (lowE && performance.now() - lowPowerT > 20000) { lowPowerT = performance.now(); toast("Energy habis: produksi & riset melambat, radar mati."); }
        if (Rr.f < 8 && Rr.f > 0 && performance.now() - lowPowerT > 25000 && S.ents.some((e) => e.k === "u" && canCmd(e) && FUEL[D[e.t].cl])) { lowPowerT = performance.now(); toast("Fuel menipis: unit akan melambat."); }
        const rd = hasRadar(), m0 = W.plan && W.plan.m[0], base = map.hq[0];
        const next = ms.fin && W.n >= ms.tot ? "wave terakhir sedang berjalan" : "wave " + (W.n + 1) + " dalam " + Math.max(0, Math.ceil(W.timer)) + " d" + (rd ? " · " + KL[W.kind] + (m0 ? " dari " + dirName(m0.x - (base.x + 0.5) * TS, m0.y - (base.y + 0.5) * TS) : "") : "");
        waveEl.innerHTML = "<b>" + objText() + "</b><small>Wave " + W.n + (ms.fin ? "/" + ms.tot : "") + " · " + next + "</small>";
        statusEl.textContent = DIFF[S.cfg.diff].n + " · Wave " + W.n + (online ? " · P" + (myOwner() + 1) : "");
        hintEl.textContent = hint();
        stage.classList.toggle("touch", touchUI);
        $('[data-act="touch"]').classList.toggle("on", touchUI);
        $("[data-box]").classList.toggle("on", boxMode);
        const sndBtn = $("[data-snd]");
        if (sndBtn && sndBtn.dataset.iconState !== String(audioOn)) {
            sndBtn.dataset.iconState = String(audioOn);
            sndBtn.classList.toggle("on", audioOn);
            const label = sndBtn.querySelector(".as-btn-label");
            if (label) label.textContent = audioOn ? "Sound" : "Muted";
            const ico = sndBtn.querySelector("svg");
            if (ico) ico.outerHTML = iconSVG(audioOn ? "volume" : "volumeX", { size: 14 });
        }
        const pauseBtn = $('[data-act="pause"]');
        if (pauseBtn) {
            const want = ovK === "pause" ? "play" : "pause";
            if (pauseBtn.dataset.iconState !== want) {
                pauseBtn.dataset.iconState = want;
                const ico = pauseBtn.querySelector("svg");
                if (ico) ico.outerHTML = iconSVG(want, { size: 14 });
                const label = pauseBtn.querySelector(".as-btn-label");
                if (label) label.textContent = want === "play" ? "Resume" : "Pause";
            }
        }
        $('[data-act="early"]').classList.toggle("off", Boolean(S.over) || (ms.fin && W.n >= ms.tot) || W.timer < 6);
        stage.style.setProperty("--th", "0px"); stage.style.setProperty("--dh", dockEl.offsetHeight + "px");
    }
    function dockBuild() {
        if (!state) return;
        const tabs = [["b", "Build"], ["d", "Defense"], ["u", "Units"], ["r", "Research"], ["g", "Powers"]]; if (online) tabs.push(["y", "Tim"]);
        if (tab === "y" && !online) tab = "b";
        const aiB = [["def", "Auto-defend"], ["rep", "Auto-repair"], ["reb", "Auto-rebuild"], ["foc", "Focus fire"]].map(([k, n]) => `<button data-act="ai:${k}" data-aic="${k}" hidden>${n}</button>`).join("");
        $("[data-tabs]").innerHTML = tabs.map(([k, n]) => `<button class="${k === tab ? "on" : ""}" data-act="tab:${k}">${n}</button>`).join("") + aiB;
        const it = (act, id, name, sub) => `<button class="as-it" data-act="${act}:${id}" data-id="${id}"><b>${name}</b><i>${sub}</i></button>`;
        let h = "";
        if (tab === "b" || tab === "d") h = (tab === "b" ? BUILD : DEFENSE).map((id) => it("b", id, D[id].n, costStr(D[id].c))).join("");
        else if (tab === "u") h = UNITS.map((id) => it("u", id, D[id].n, costStr(D[id].c))).join("");
        else if (tab === "g") h = Object.keys(PW).map((id) => it("pw", id, PW[id].n, costStr(PW[id].c))).join("");
        else if (tab === "y") {
            h = `<button class="as-it" data-act="tm:ping"><b>Ping</b><i>Alt+klik / N</i></button>` + CHAT.map((m, i) => `<button class="as-it" data-act="tm:chat:${i}"><b>${m}</b><i>pesan cepat</i></button>`).join("");
            if (!state.shared) h += `<button class="as-it" data-act="tm:give:c"><b>Kirim 500 C</b><i>ke rekan</i></button><button class="as-it" data-act="tm:give:m"><b>Kirim 300 M</b><i>ke rekan</i></button>`;
        } else h = Object.keys(RS).map((id) => it("r", id, RS[id][0], "")).join("");
        $("[data-items]").innerHTML = h; dockUpdate();
    }
    function dockUpdate() {
        const me = myOwner(), Rr = myR(), ri = state.shared ? 0 : me, rq = state.rq[ri], al = lvl(me, "ai");
        root.querySelectorAll("[data-act^='tab:']").forEach((b) => b.classList.toggle("on", b.dataset.act === "tab:" + tab));
        root.querySelectorAll("[data-aic]").forEach((b) => { const k = b.dataset.aic; b.hidden = al < (k === "foc" ? 3 : k === "reb" ? 2 : 1); b.classList.toggle("on", Boolean(state.aic[k])); });
        root.querySelectorAll(".as-it[data-id], [data-act^='pb:']").forEach((b) => {
            const p = b.dataset.act.split(":"), type = p[0], id = type === "pb" ? p[2] : p[1]; let why = "";
            if (type === "b") { if (!afford(Rr, D[id].c)) why = "Resource kurang"; }
            else if (type === "u" || type === "pb") { why = availUnit(id); }
            else if (type === "pw") {
                const P = PW[id], rem = Math.ceil(((state.pw[ri] || {})[id] || 0) - state.t); b.querySelector("i").textContent = rem > 0 ? "Cooldown " + rem + " d" : costStr(P.c);
                why = availPower(id); b.title = P.d + (why ? " — " + why : "");
            }
            else if (type === "r") {
                const cur = lvl(me, id), L = cur + 1, sub = b.querySelector("i"), pre = RSPRE[id] && RSPRE[id][L];
                if (cur >= 3) { why = "Maksimum"; sub.textContent = "Lv 3/3"; }
                else {
                    sub.textContent = rq && rq.c === id ? "Berjalan " + Math.round((1 - rq.left / rq.total) * 100) + "%" : "Lv " + cur + "/3 · " + costStr(rsCost(id, L));
                    if (rq) why = rq.c === id ? "Sedang diriset" : "Riset lain berjalan";
                    else if (pre && lvl(me, pre[0]) < pre[1]) why = "Butuh " + RS[pre[0]][0] + " Lv" + pre[1];
                    else if (!state.ents.some((e) => e.t === "rl" && e.prog >= 1 && canCmd(e))) why = "Butuh Research Lab";
                    else if (!afford(Rr, rsCost(id, L))) why = "Resource kurang";
                }
                b.title = RS[id][1] + (why ? " — " + why : "");
            }
            b.classList.toggle("off", Boolean(why)); if (type !== "r" && type !== "pw") b.title = why;
        });
    }
    const orderBtns = (us) => {
        const ab = us.find((e) => D[e.t].ab), abName = ab ? { launch: "Launch Wing", stomp: "Stomp", deploy: ab.dep ? "Undeploy" : "Deploy" }[D[ab.t].ab] : "";
        return `<button data-act="ord:stop">Stop</button><button data-act="ord:hold">Hold</button><button data-act="am">Attack-move</button><button data-act="pat">Patroli</button>` + (us.some((e) => cargoN(e)) ? `<button data-act="unl">Unload</button>` : "") + (ab ? `<button data-act="abil" data-ab>${abName}</button>` : "");
    };
    function selHTML() {
        const es = selEnts(); if (!es.length) return "";
        if (es.length === 1) {
            const e = es[0], d = D[e.t], rk = rankOf(e); let h = `<b>${d.n}${e.lv ? " Lv" + (e.lv + 1) : ""}${rk ? " " + "▲".repeat(rk) : ""}</b><span class="mu" data-hp>${Math.ceil(e.hp)}/${Math.ceil(e.mh)}</span>`;
            if (d.dmg) h += `<span class="mu">dmg ${d.dmg} · range ${Math.round(d.r * (1 + 0.08 * (e.lv || 0)))}</span>`;
            if (canCmd(e)) {
                if (e.k === "b") {
                    if (e.prog < 1) h += `<span class="mu">dibangun…</span>`;
                    else {
                        if (d.pr) {
                            h += d.pr.map((u) => `<button data-act="pb:${e.id}:${u}">${D[u].n} <small class="mu">${costStr(D[u].c)}</small></button>`).join("");
                            h += e.q.map((q, i) => `<button data-act="cq:${e.id}:${i}">✕ ${D[q.t].n} <small class="mu" data-qp="${i}"></small></button>`).join("");
                            h += `<button data-act="rl:${e.id}">Rally</button>`;
                        }
                        if (d.dmg && !d.cap) h += `<button data-act="pri:${e.id}:${((e.pri || 0) + 1) % 4}">Target: ${PRI[e.pri || 0]}</button>`;
                        if (d.cap) h += `<span class="mu">garnisun ${cargoN(e)}/${d.cap} · klik kanan dengan infantri</span>` + (cargoN(e) ? `<button data-act="unl">Unload</button>` : "");
                        if (upgradable(d) && (e.lv || 0) < 2) h += `<button data-act="upg:${e.id}" data-up>Upgrade Lv${(e.lv || 0) + 2} <small class="mu">${costStr(upCost(d, e.lv || 0))}</small></button>`;
                    }
                    if (e.t !== "hq" && e.t !== state.ms.prot) h += `<button data-act="sell:${e.id}">Jual</button>`;
                } else if (cargoN(e)) h += `<span class="mu">muatan ${cargoN(e)}</span>`;
            }
            if (e.k === "u" && canCmd(e)) h += orderBtns(es);
            return h;
        }
        const us = es.filter((e) => e.k === "u" && canCmd(e)), cnt = {};
        us.forEach((e) => (cnt[e.t] = (cnt[e.t] || 0) + 1));
        return `<b>${us.length || es.length} dipilih</b><span class="mu">${Object.keys(cnt).slice(0, 5).map((k) => D[k].n + "×" + cnt[k]).join(", ")}</span>` + (us.length ? orderBtns(us) : "");
    }
    function selRefresh() {
        const es = selEnts(); sel = new Set(es.map((e) => e.id));
        const sg = es.map((e) => e.id + ":" + (e.q ? e.q.length : "") + ":" + cargoN(e) + ":" + (e.prog >= 1 ? 1 : 0) + ":" + (e.lv || 0) + ":" + (e.pri || 0) + ":" + (e.dep || 0) + ":" + rankOf(e)).join(",") + "|" + tab;
        if (sg !== sigSel) { sigSel = sg; selEl.innerHTML = selHTML(); }
        const hp = selEl.querySelector("[data-hp]"); if (hp && es[0]) hp.textContent = Math.ceil(es[0].hp) + "/" + Math.ceil(es[0].mh);
        if (es.length === 1 && es[0].q) selEl.querySelectorAll("[data-qp]").forEach((s) => { const q = es[0].q[Number(s.dataset.qp)]; if (q) s.textContent = qpct(q) + "%"; });
        selEl.querySelectorAll("[data-act^='pb:']").forEach((b) => { const why = availUnit(b.dataset.act.split(":")[2]); b.classList.toggle("off", Boolean(why)); b.title = why; });
        const up = selEl.querySelector("[data-up]"); if (up && es[0]) up.classList.toggle("off", !afford(myR(), upCost(D[es[0].t], es[0].lv || 0)));
        const ab = selEl.querySelector("[data-ab]"); if (ab) { const us = selUnits(), cds = us.filter((e) => D[e.t].ab && D[e.t].ab !== "deploy").map(abCd); ab.classList.toggle("off", cds.length > 0 && Math.min(...cds) > 0 && !us.some((e) => D[e.t].ab === "deploy")); }
    }
    function refreshUI() {
        if (!state) return;
        hud(); dockUpdate(); selRefresh();
        if (state.msg.id !== lastMsg) { lastMsg = state.msg.id; if (state.msg.text) { toast(state.msg.text); if (/Wave|diserang|Airstrike|tiba/.test(state.msg.text)) snd("a"); } }
        if (toastUntil && performance.now() > toastUntil) { toastEl.classList.remove("show"); toastUntil = 0; }
        if (state.over && ovK !== "result") { ovResult(); if (!bestSaved) { bestSaved = true; saveBest(); } }
    }
    function saveBest() {
        if (state.cheated) return;
        try { const prev = Number(localStorage.getItem(META.bestKey)) || 0; if (state.score > prev) localStorage.setItem(META.bestKey, String(state.score)); } catch (e) { /* abaikan */ }
    }

    /* ---------- overlay ---------- */
    function setOv(k, html) { ovK = k; ovEl.hidden = false; ovEl.innerHTML = `<div class="as-card">${html}</div>`; ptr = null; }
    function closeOv() { ovK = ""; ovEl.hidden = true; ovEl.innerHTML = ""; if (!state) ovSetup(); }
    const seg = (name, opts, cur) => `<div class="as-seg">${opts.map(([v, l]) => `<button class="${cur === v ? "on" : ""}" data-act="set:${name}:${v}">${l}</button>`).join("")}</div>`;
    function ovSetup() {
        if (online && !isHost) { setOv("setup", `<h3>Alien Siege · Co-op</h3><p class="mu">Menunggu host memulai misi…</p><div class="as-btns"><button data-act="help">Cara bermain</button></div>`); return; }
        setOv("setup", `<h3>Alien Siege</h3><p class="mu">${online ? "Co-op 2 pemain melawan alien." : "Solo melawan alien."} Level dibuat acak dan dijamin bisa diselesaikan.</p>
      <div class="as-row"><span>Tingkat kesulitan</span>${seg("diff", Object.keys(DIFF).map((k) => [k, DIFF[k].n]), setup.diff)}</div>
      <div class="as-row"><span>Misi</span>${seg("mission", [["random", "Acak"], ...Object.keys(MISSIONS).map((k) => [k, MISSIONS[k]])], setup.mission)}</div>
      <div class="as-row"><span>Siapa mulai lebih dulu</span>${seg("first", [["random", "Acak"], ["player", "Pemain"], ["alien", "Alien"]], setup.first)}</div>
      ${online ? `<div class="as-row"><span>Markas co-op</span>${seg("base", [["shared", "Bersama + sumber daya bersama"], ["separate", "Terpisah"]], setup.base)}</div>` : ""}
      <div class="as-row"><span>Seed level (kosong = acak)</span><input data-seed value="${setup.seed}" inputmode="numeric" maxlength="9"></div>
      <div class="as-btns"><button class="pri" data-act="start">Mulai</button><button data-act="help">Cara bermain</button></div>`);
    }
    function ovHelp() {
        const [t, body] = HELP[helpPg];
        setOv("help", `<h3>${t}</h3><p>${body}</p><p class="mu">Halaman ${helpPg + 1} dari ${HELP.length}</p>
      <div class="as-btns"><button data-act="hp:-1" ${helpPg ? "" : "disabled"}>Sebelumnya</button><button data-act="hp:1" ${helpPg < HELP.length - 1 ? "" : "disabled"}>Berikutnya</button><button class="pri" data-act="close">Tutup</button></div>`);
    }
    function ovPause() {
        setOv("pause", `<h3>Jeda</h3><p class="mu">${online ? "Di mode co-op permainan tetap berjalan." : "Permainan dihentikan."}</p>
      ${online ? "" : `<div class="as-row"><span>Kecepatan game</span><div class="as-seg">${[1, 2, 3].map((n) => `<button class="${speed === n ? "on" : ""}" data-act="spd:${n}">x${n}</button>`).join("")}</div></div>`}
      <div class="as-row"><span>Suara</span><div class="as-seg"><button class="${audioOn ? "on" : ""}" data-act="snd">${audioOn ? "Aktif" : "Senyap"}</button></div></div>
      <div class="as-btns"><button class="pri" data-act="close">Lanjutkan</button><button data-act="help">Cara bermain</button>${isHost ? '<button data-act="again">Level baru</button>' : ""}<button data-exit>Keluar</button></div>`);
    }
    function ovCheat() {
        const cf = state.cheats, t = (k, n) => `<button class="${cf[k] ? "on" : ""}" data-act="ch:${k}">${n}</button>`;
        setOv("cheat", `<h3>Cheat</h3><p class="mu">Memakai cheat menonaktifkan penyimpanan skor terbaik dan bintang.</p><div class="as-seg">
      <button data-act="ch:res">+5000 resource</button>${t("inf", "Resource tak terbatas")}${t("inst", "Bangun, produksi & cooldown instan")}${t("god", "God mode")}
      <button data-act="ch:tech">Semua riset maksimum</button><button data-act="ch:army">Panggil pasukan</button><button data-act="ch:heal">Pulihkan semua</button><button data-act="ch:wipe">Bunuh semua alien</button>
      <button data-act="ch:wave">Panggil wave berikutnya</button>${t("reveal", "Radar aktif")}${online ? "" : `<button data-act="ch:speed">Kecepatan x${speed}</button>`}<button data-act="ch:win">Menang sekarang</button></div>
      <div class="as-btns"><button class="pri" data-act="close">Tutup</button></div>`);
    }
    function ovResult() {
        const S = state, win = S.over === "win"; let best = 0; try { best = Number(localStorage.getItem(META.bestKey)) || 0; } catch (e) { /* abaikan */ }
        setOv("result", `<h3>${win ? "Misi berhasil" : "Misi gagal"}</h3><p class="mu">${S.omsg}</p>
      ${win ? `<div class="as-stars">${"★".repeat(S.stars)}${"☆".repeat(3 - S.stars)}</div>` : ""}
      <div class="as-st"><span class="mu">Wave dilewati</span><b>${S.wave.n}</b><span class="mu">Alien terbunuh</span><b>${S.kills}</b><span class="mu">Unit hilang</span><b>${S.lostU}</b><span class="mu">Bangunan hilang</span><b>${S.lostB}</b><span class="mu">Waktu</span><b>${fmtT(S.t)}</b><span class="mu">Skor</span><b>${S.score}</b><span class="mu">Skor terbaik</span><b>${S.cheated ? "tidak disimpan (cheat)" : Math.max(best, S.score)}</b></div>
      ${win ? '<p class="mu" style="margin-top:10px">Bintang: menang, kerugian ≤ 15 unit/bangunan, dan tanpa cheat.</p>' : ""}
      <div class="as-btns">${isHost ? '<button class="pri" data-act="again">Main lagi (level baru)</button>' : '<span class="mu">Menunggu host…</span>'}<button data-exit>Keluar</button></div>`);
    }
    function showToss() {
        const S = state, c = S.cfg;
        const who = c.first === "player" ? "Kamu bergerak lebih dulu: ada 75 detik untuk membangun." : "Alien menyerang lebih dulu: serangan pertama datang dalam 14 detik!";
        const slot = online ? `<p>Kamu <b style="color:${OC[myOwner()]}">Player ${myOwner() + 1}</b> (${myOwner() ? "hijau" : "biru"}). ${c.base === "separate" ? "Markas terpisah." : "Markas dan sumber daya bersama."}</p>` : "";
        setOv("toss", `<h3>Mengundi…</h3><div class="as-coin"></div><p class="mu">Menentukan giliran${online ? " dan posisi pemain" : ""}.</p>`);
        timers.push(setTimeout(() => { if (ovK === "toss") setOv("toss", `<h3>${c.first === "player" ? "Pemain mulai" : "Alien mulai"}</h3><p>${who}</p>${slot}<p class="mu">Misi: ${MISSIONS[c.mission]} · Seed ${c.seed} · peta divalidasi (percobaan ke-${map.tries})</p>`); }, 1200));
        timers.push(setTimeout(() => { if (ovK === "toss") closeOv(); }, 3600));
    }
    function handleClick(ev) {
        if (ev.target.closest("[data-exit]")) { onExit(); return; }
        const b = ev.target.closest("[data-act]"); if (!b) return;
        snd("u");
        const [a, p1, p2] = b.dataset.act.split(":");
        switch (a) {
            case "tab": setTab(p1); break;
            case "b": placing = p1; cmdMode = ""; if (touchUI) toast("Tap lokasi untuk membangun, seret untuk menggeser bidikan"); break;
            case "u": { const why = availUnit(p1); if (why) { toast(why); break; } submit({ t: "prod", b: bestProducer(p1).id, u: p1 }); break; }
            case "pb": submit({ t: "prod", b: Number(p1), u: p2 }); break;
            case "cq": submit({ t: "cq", b: Number(p1), i: Number(p2) }); break;
            case "r": submit({ t: "rsch", c: p1 }); break;
            case "sell": submit({ t: "sell", id: Number(p1) }); sel.clear(); break;
            case "upg": submit({ t: "upg", id: Number(p1) }); break;
            case "rl": cmdMode = "rally"; placing = null; toast("Klik / tap lokasi rally point"); break;
            case "pri": submit({ t: "pri", id: Number(p1), v: Number(p2) }); break;
            case "ord": submit({ t: "order", ids: selUnits().map((e) => e.id), o: { k: p1 } }); break;
            case "am": if (selUnits().length) { cmdMode = "amove"; placing = null; toast("Attack-move: klik / tap tujuan"); } break;
            case "pat": if (selUnits().length) { cmdMode = "patrol"; placing = null; toast("Patroli: klik / tap titik tujuan"); } break;
            case "abil": submit({ t: "abil", ids: selUnits().map((e) => e.id) }); break;
            case "unl": submit({ t: "unload", ids: selEnts().map((e) => e.id) }); break;
            case "ai": submit({ t: "ai", k: p1 }); break;
            case "pw": { const why = availPower(p1); if (why) { toast(why); break; } if (PW[p1].tgt) { cmdMode = "pw:" + p1; placing = null; toast("Pilih target " + PW[p1].n); } else submit({ t: "power", p: p1 }); break; }
            case "tm":
                if (p1 === "ping") { cmdMode = "ping"; placing = null; toast("Ping: klik / tap lokasi"); }
                else if (p1 === "chat") submit({ t: "chat", m: Number(p2) });
                else if (p1 === "give") submit({ t: "give", k: p2, n: p2 === "c" ? 500 : 300 });
                break;
            case "early": submit({ t: "early" }); break;
            case "snd": audioOn = !audioOn; try { localStorage.setItem("alienSiegeMute", audioOn ? "0" : "1"); } catch (e) { /* abaikan */ } if (ovK === "pause") ovPause(); break;
            case "spd": speed = Number(p1); ovPause(); break;
            case "pause": if (ovK === "pause") closeOv(); else if (state) ovPause(); break;
            case "help": helpPg = 0; ovHelp(); break;
            case "hp": helpPg = clamp(helpPg + Number(p1), 0, HELP.length - 1); ovHelp(); break;
            case "close": closeOv(); break;
            case "cheat": if (state) ovCheat(); break;
            case "touch": touchUI = !touchUI; if (touchUI && state) toast("Tap=pilih · double-tap=gerak · tahan lalu geser=box select"); break;
            case "set": setup[p1] = p2; ovSetup(); break;
            case "start": beginGame(); break;
            case "restart": if (isHost) ovSetup(); break;
            case "again": ovSetup(); break;
            case "ch":
                if (p1 === "speed") { speed = speed >= 3 ? 1 : speed + 1; state.cheated = 1; ovCheat(); break; }
                submit({ t: "cheat", c: p1 }); if (online && !isHost) timers.push(setTimeout(() => ovK === "cheat" && ovCheat(), 450)); else ovCheat(); break;
            case "vc":
                if (p1 === "all") sel = new Set(armyIds()); else if (p1 === "q") { if (selUnits().length) { cmdMode = "amove"; placing = null; } }
                else if (p1 === "stop") submit({ t: "order", ids: selUnits().map((e) => e.id), o: { k: "stop" } });
                else if (p1 === "box") { boxMode = !boxMode; toast(boxMode ? "Box: drag langsung pilih area" : "Box: tahan lalu geser untuk pilih area"); }
                else if (p1 === "zin") { cam.z *= 1.2; clampCam(); } else if (p1 === "zout") { cam.z /= 1.2; clampCam(); }
                else if (p1 === "cancel") { placing = null; cmdMode = ""; sel.clear(); }
                break;
        }
        sigSel = "";
    }

    /* ---------- mulai game & jaringan ---------- */
    function resetUI() {
        clearHold(); ptr = null; lastTap = { id: 0, t: 0, x: 0, y: 0 }; lastClick = { id: 0, t: 0 };
        sel.clear(); placing = null; cmdMode = ""; paused = false; bestSaved = false; lastMsg = 0; sigSel = ""; Object.keys(groups).forEach((k) => delete groups[k]); pings.length = 0;
        tab = "b"; accT = 0; pubT = 0;
        const h = state.ents.find((e) => e.t === "hq" && (state.shared || e.o === myOwner())) || state.ents.find((e) => e.t === "hq");
        cam.z = clamp(vw / (26 * TS), 0.5, 1.1); clampCam(); if (h) centerOn(h.x, h.y);
        dockBuild(); selEl.innerHTML = "";
    }
    function publishNow() { if (online && isHost && state) room.publishState({ z: JSON.stringify(snap()) }).catch(console.warn); }
    function beginGame() {
        const seed = parseInt(setup.seed, 10) || ((Math.random() * 1e9) | 0);
        const cfg = {
            gid: Date.now() + Math.random(), seed, diff: setup.diff, mission: setup.mission === "random" ? pick(Object.keys(MISSIONS)) : setup.mission,
            first: setup.first === "random" ? (Math.random() < 0.5 ? "player" : "alien") : setup.first, coop: online, base: setup.base,
            slots: online ? (Math.random() < 0.5 ? [0, 1] : [1, 0]) : [0, 0],
        };
        speed = 1; buildWorld(cfg); resetUI(); ovK = ""; showToss(); publishNow();
    }
    function onNetState(next) {
        if (dead || !next || !next.z) return;
        let z; try { z = JSON.parse(next.z); } catch (e) { return; }
        const fresh = !state || state.cfg.gid !== z.c.gid;
        if (fresh) { fx = []; prepMap(z.c); }
        state = hydrate(z); byid.clear(); for (const e of state.ents) byid.set(e.id, e); rebuildOcc();
        for (const f of z.fx) { if (fx.length < 260) fx.push(f); snd(f.k === "l" ? "s" : "b"); }
        if (fresh) { resetUI(); showToss(); }
    }
    function smooth() { for (const e of state.ents) { e.rx += (e.x - e.rx) * 0.3; e.ry += (e.y - e.ry) * 0.3; } }

    /* ---------- loop ---------- */
    const blocking = () => ovK === "toss" || ovK === "setup" || (!online && ovK !== "");
    function frame(now) {
        if (dead) return; raf = requestAnimationFrame(frame);
        const dt = Math.min(0.1, (now - last) / 1000); last = now;
        if (!state) { ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.fillStyle = "#0b1016"; ctx.fillRect(0, 0, vw, vh); return; }
        panCam(dt);
        if (isHost && !state.over && !paused && !blocking()) {
            accT += dt * speed; let n = 0; while (accT >= STEP && n++ < 9) { stepSim(STEP); accT -= STEP; } if (accT > STEP * 9) accT = 0;
        }
        if (!isHost) smooth();
        if (online && isHost) { pubT += dt; if (pubT >= 0.25 || (state.over && pubT >= 0.1)) { pubT = 0; publishNow(); } }
        draw();
        miniT += dt; if (miniT > 0.1) { miniT = 0; drawMini(); }
        uiT += dt; if (uiT > 0.25) { uiT = 0; refreshUI(); }
    }

    /* ---------- pasang listener ---------- */
    const onHoldDown = (ev) => { const b = ev.target.closest("[data-hold]"); if (b) hold = b.dataset.hold; };
    const onHoldUp = () => { hold = ""; };
    const onInput = (ev) => { if (ev.target.matches("[data-seed]")) setup.seed = ev.target.value.replace(/\D/g, ""); };
    const noMenu = (ev) => ev.preventDefault();
    const onVis = () => { if (document.hidden && state && !state.over && !online && ovK === "") ovPause(); };
    root.addEventListener("click", handleClick); root.addEventListener("pointerdown", onHoldDown); root.addEventListener("input", onInput);
    window.addEventListener("pointerup", onHoldUp); window.addEventListener("pointercancel", onHoldUp);
    cv.addEventListener("pointerdown", onDown); cv.addEventListener("pointermove", onMove); cv.addEventListener("pointerup", onUp); cv.addEventListener("pointercancel", onUp);
    cv.addEventListener("wheel", onWheel, { passive: false }); cv.addEventListener("contextmenu", noMenu);
    mini.addEventListener("pointerdown", miniPointer); mini.addEventListener("pointermove", miniPointer); mini.addEventListener("contextmenu", noMenu);
    document.addEventListener("keydown", onKey); document.addEventListener("keyup", onKey); document.addEventListener("visibilitychange", onVis);
    let ro = null;
    if (typeof ResizeObserver !== "undefined") { ro = new ResizeObserver(resize); ro.observe(stage); } else window.addEventListener("resize", resize);
    resize();

    if (online) {
        room.onRoom((nextRoom) => { roomData = nextRoom; });
        if (isHost) room.onAction((action) => { if (state) applyAction(action, 1); }); else room.onState(onNetState);
    }
    let seenHelp = false; try { seenHelp = localStorage.getItem("alienSiegeHelp") === "1"; } catch (e) { /* abaikan */ }
    ovSetup();
    if (!seenHelp) { try { localStorage.setItem("alienSiegeHelp", "1"); } catch (e) { /* abaikan */ } helpPg = 0; ovHelp(); }
    last = performance.now(); raf = requestAnimationFrame(frame);

    return {
        destroy() {
            dead = true; cancelAnimationFrame(raf); clearHold(); timers.forEach(clearTimeout);
            root.removeEventListener("click", handleClick); root.removeEventListener("pointerdown", onHoldDown); root.removeEventListener("input", onInput);
            window.removeEventListener("pointerup", onHoldUp); window.removeEventListener("pointercancel", onHoldUp); window.removeEventListener("resize", resize);
            document.removeEventListener("keydown", onKey); document.removeEventListener("keyup", onKey); document.removeEventListener("visibilitychange", onVis);
            if (ro) ro.disconnect();
            try { if (actx) actx.close(); } catch (e) { /* abaikan */ }
        },
        _debug: { get state() { return state; }, get map() { return map; }, canPlace: (k, x, y, o = 0) => canPlace(D[k], x, y, o), snap: () => snap(), hyd: (z) => hydrate(z), step: (n = 1) => { for (let i = 0; i < n; i++) stepSim(STEP); }, act: (a, who = 0) => applyAction(a, who), begin: (o = {}) => { Object.assign(setup, o); beginGame(); closeOv(); }, ui: () => refreshUI(), click: (act) => handleClick({ target: { closest: (s) => (s === "[data-act]" ? { dataset: { act } } : s === "[data-exit]" ? null : null) } }), net: onNetState },
    };
}