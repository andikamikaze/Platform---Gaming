/* ==== GAME: sword-master.js ==== */
/* Sword Master — deckbuilding roguelike terinspirasi Slay the Spire.
 * Template: export META + mount(root, context). Jalankan: node tools/build-games-manifest.mjs
 */
export const META = {
    id: "sword-master", name: "Sword Master", category: "rpg", catLabel: "RPG",
    desc: "A minimalist deckbuilding roguelike: build a lean deck, climb three acts, slay the bosses.",
    art: '<svg viewBox="0 0 48 48" width="54" height="54" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 38L34 14"/><path d="M30 10l8 8"/><path d="M36 6l6 6"/><path d="M12 34l-4 4"/><path d="M25 21l-7-2 2 7"/></svg>',
    bg: ["#e7e5e4", "#a8a29e"], bestKey: "swordMasterBest",
};

/* ================= DATA ================= */
const HP0 = 72, ENERGY = 3, HAND = 5, ACTS = 3, POT_SLOTS = 3;
const RARITY_W = { common: 60, uncommon: 30, rare: 10 };
const PRICE = { common: 45, uncommon: 68, rare: 135 };

/* e = efek; up = override saat upgrade. Cost X = -1. */
const CARDS = {
    strike: { name: "Strike", type: "attack", cost: 1, rarity: "common", e: { dmg: 6 }, up: { dmg: 9 } },
    defend: { name: "Defend", type: "skill", cost: 1, rarity: "common", e: { block: 5 }, up: { block: 8 } },
    bash: { name: "Bash", type: "attack", cost: 2, rarity: "common", e: { dmg: 8, vuln: 2 }, up: { dmg: 10, vuln: 3 } },
    cleave: { name: "Cleave", type: "attack", cost: 1, rarity: "common", e: { dmg: 8, aoe: 1 }, up: { dmg: 11 } },
    ironwave: { name: "Iron Wave", type: "attack", cost: 1, rarity: "common", e: { dmg: 5, block: 5 }, up: { dmg: 7, block: 7 } },
    pommel: { name: "Pommel", type: "attack", cost: 1, rarity: "common", e: { dmg: 9, draw: 1 }, up: { dmg: 10, draw: 2 } },
    twin: { name: "Twin Strike", type: "attack", cost: 1, rarity: "common", e: { dmg: 5, hits: 2 }, up: { dmg: 7 } },
    anger: { name: "Anger", type: "attack", cost: 0, rarity: "common", e: { dmg: 6, copyDiscard: 1 }, up: { dmg: 8 } },
    shrug: { name: "Shrug It Off", type: "skill", cost: 1, rarity: "common", e: { block: 8, draw: 1 }, up: { block: 11 } },
    warcry: { name: "Warcry", type: "skill", cost: 0, rarity: "common", e: { draw: 2 }, up: { draw: 3 } },
    poisonstab: { name: "Poison Stab", type: "attack", cost: 1, rarity: "common", e: { dmg: 4, poison: 3 }, up: { dmg: 6, poison: 4 } },
    clothes: { name: "Clothesline", type: "attack", cost: 2, rarity: "uncommon", e: { dmg: 12, weak: 2 }, up: { dmg: 16, weak: 3 } },
    heavy: { name: "Heavy Blade", type: "attack", cost: 2, rarity: "uncommon", e: { dmg: 14, strmult: 3 }, up: { dmg: 18 } },
    inflame: { name: "Inflame", type: "power", cost: 1, rarity: "uncommon", e: { strength: 2 }, up: { strength: 3 } },
    metal: { name: "Metallicize", type: "power", cost: 1, rarity: "uncommon", e: { metal: 3 }, up: { metal: 4 } },
    battle: { name: "Battle Trance", type: "skill", cost: 0, rarity: "uncommon", e: { draw: 3 }, up: { draw: 4 } },
    rampage: { name: "Rampage", type: "attack", cost: 1, rarity: "uncommon", e: { dmg: 8, rampage: 5 }, up: { dmg: 10, rampage: 7 } },
    deadly: { name: "Deadly Poison", type: "skill", cost: 1, rarity: "uncommon", e: { poison: 5 }, up: { poison: 7 } },
    disarm: { name: "Disarm", type: "skill", cost: 1, rarity: "uncommon", e: { enStr: 2, exhaust: 1 }, up: { enStr: 3 } },
    imperv: { name: "Impervious", type: "skill", cost: 2, rarity: "rare", e: { block: 30, exhaust: 1 }, up: { block: 40 } },
    offering: { name: "Offering", type: "skill", cost: 0, rarity: "rare", e: { selfDmg: 6, energy: 2, draw: 3, exhaust: 1 }, up: { draw: 5 } },
    demon: { name: "Demon Form", type: "power", cost: 3, rarity: "rare", e: { demon: 2 }, up: { demon: 3 } },
    limit: { name: "Limit Break", type: "skill", cost: 1, rarity: "rare", e: { doubleStr: 1, exhaust: 1 }, up: { cost: 0 } },
    whirlwind: { name: "Whirlwind", type: "attack", cost: -1, rarity: "rare", e: { dmg: 5, aoe: 1, xcost: 1 }, up: { dmg: 8 } },
    reaper: { name: "Reaper", type: "attack", cost: 2, rarity: "rare", e: { dmg: 12, aoe: 1, healOnDmg: 1, exhaust: 1 }, up: { dmg: 16 } },
    bludgeon: { name: "Bludgeon", type: "attack", cost: 3, rarity: "rare", e: { dmg: 32 }, up: { dmg: 42 } },
};
const POOL = Object.keys(CARDS).filter(k => !["strike", "defend", "bash"].includes(k));
const STARTER = ["strike", "strike", "strike", "strike", "strike", "defend", "defend", "defend", "defend", "bash"];

const RELICS = {
    burning: { name: "Burning Blood", text: "Heal 6 HP after combat." },
    vajra: { name: "Vajra", text: "Start combat with +1 Strength." },
    anchor: { name: "Anchor", text: "Start combat with 10 Block." },
    lantern: { name: "Lantern", text: "+1 Energy on turn 1." },
    bag: { name: "Bag of Prep", text: "Draw +2 on turn 1." },
    vial: { name: "Poison Vial", text: "Apply 2 Poison to all foes at start." },
    scales: { name: "Bronze Scales", text: "Reflect 3 damage when hit." },
    strawberry: { name: "Strawberry", text: "+7 Max HP." },
    meat: { name: "Meat on Bone", text: "Heal 12 after combat if HP < 50%." },
    cleat: { name: "Horn Cleat", text: "+14 Block on turn 2." },
    sunflower: { name: "Sunflower", text: "+1 Energy every 3rd turn." },
};
const RELIC_IDS = Object.keys(RELICS);

const POTIONS = {
    heal: { name: "Heal Potion", text: "Heal 20 HP." },
    block: { name: "Block Potion", text: "Gain 12 Block." },
    strength: { name: "Strength Potion", text: "+2 Strength." },
    fire: { name: "Fire Bomb", text: "Deal 15 damage to ALL." },
    swift: { name: "Swift Potion", text: "Draw 3 cards." },
};
const POTION_IDS = Object.keys(POTIONS);

/* pola: [kind, nilai] ; kind: atk(mult), block, buff(str) */
const ENEMIES = {
    small: [
        { name: "Rat", hp: 30, dmg: 8, pat: [["atk", 1], ["atk", 1], ["block", 6]] },
        { name: "Cultist", hp: 34, dmg: 7, pat: [["buff", 2], ["atk", 1], ["atk", 1]] },
        { name: "Slime", hp: 38, dmg: 9, pat: [["atk", 1], ["block", 8], ["atk", 2]] },
    ],
    elite: [
        { name: "Brute", hp: 70, dmg: 11, pat: [["atk", 1], ["buff", 2], ["atk", 2]] },
        { name: "Sentinel", hp: 80, dmg: 10, pat: [["block", 12], ["atk", 2], ["atk", 1]] },
    ],
    boss: [
        { name: "The Warden", hp: 120, dmg: 11, pat: [["atk", 1], ["block", 10], ["atk", 2], ["atk", 1]] },
        { name: "The Collector", hp: 120, dmg: 11, pat: [["atk", 1], ["buff", 2], ["atk", 2], ["block", 10]] },
        { name: "The Corrupt Heart", hp: 120, dmg: 11, pat: [["atk", 2], ["atk", 1], ["block", 12], ["buff", 3]] },
    ],
};
const ACT_HP = { 1: 1, 2: 1.2, 3: 1.4 }, ACT_DMG = { 1: 0, 2: 1, 3: 2 };

const EVENTS = [
    {
        title: "Shrine", choices: [
            { label: "Pray", run: r => { r.maxHp += 5; r.hp += 5; return "+5 Max HP."; } },
            { label: "Offer blood", run: r => { r.hp -= 8; gainRelic(r); return "-8 HP, gained a relic."; } },
            { label: "Leave", run: () => "You walk away." }]
    },
    {
        title: "Buried Chest", choices: [
            { label: "Open", run: r => { if (Math.random() < 0.25) { r.hp = Math.max(1, r.hp - 8); return "Trapped! -8 HP, +40 gold."; } r.gold += 40; return "+40 gold."; }, gold: 40 },
            { label: "Leave", run: () => "Nothing ventured." }]
    },
    {
        title: "Beggar", choices: [
            { label: "Give 15 gold", run: r => { if (r.gold >= 15) { r.gold -= 15; r.removeMode = true; return "Remove a card."; } return "Not enough gold."; } },
            { label: "Leave", run: () => "You keep your coin." }]
    },
    {
        title: "Fountain", choices: [
            { label: "Drink", run: r => { r.hp = Math.min(r.maxHp, r.hp + 20); return "Heal 20 HP."; } },
            { label: "Leave", run: () => "The water glows, untouched." }]
    },
    {
        title: "Altar", choices: [
            { label: "Sacrifice 10 HP", run: r => { r.hp -= 10; addCard(r, pickRarity("rare")); return "-10 HP, gained a rare card."; } },
            { label: "Leave", run: () => "The altar waits." }]
    },
];

/* ================= PURE HELPERS ================= */
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
function mulberry32(a) { return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function shuffle(arr, rnd) { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1));[a[i], a[j]] = [a[j], a[i]]; } return a; }
function computeAttack(base, weak, vuln) { let d = base; if (weak) d = Math.floor(d * 0.75); if (vuln) d = Math.floor(d * 1.5); return Math.max(0, d); }
function hitUnit(u, amount) { const b = Math.min(u.block, amount); u.block -= b; u.hp -= (amount - b); return amount - b; }
let UID = 1; const mkInst = (id) => ({ uid: UID++, id, up: false, ramp: 0 });
function eff(inst) { const c = CARDS[inst.id]; return Object.assign({}, c.e, inst.up ? c.up : {}); }
function costOf(inst) { const c = CARDS[inst.id]; return inst.up && c.up.cost !== undefined ? c.up.cost : c.cost; }
function cardText(inst) {
    const e = eff(inst), p = [];
    if (e.dmg) p.push(`Deal ${e.dmg}${e.strmult ? ` (+${e.strmult}×Str)` : ''}${e.rampage ? ` (+${e.rampage}/play)` : ''} dmg${e.hits > 1 ? ` ×${e.hits}` : ''}${e.aoe ? ' to ALL' : ''}${e.xcost ? ' ×Energy' : ''}.`);
    if (e.block) p.push(`Gain ${e.block} Block.`);
    if (e.draw) p.push(`Draw ${e.draw}.`);
    if (e.strength) p.push(`+${e.strength} Strength.`);
    if (e.doubleStr) p.push(`Double Strength.`);
    if (e.metal) p.push(`End of turn: +${e.metal} Block.`);
    if (e.demon) p.push(`Start of turn: +${e.demon} Strength.`);
    if (e.vuln) p.push(`Apply ${e.vuln} Vulnerable.`);
    if (e.weak) p.push(`Apply ${e.weak} Weak.`);
    if (e.poison) p.push(`Apply ${e.poison} Poison.`);
    if (e.enStr) p.push(`Foe -${e.enStr} Strength.`);
    if (e.heal) p.push(`Heal ${e.heal}.`);
    if (e.healOnDmg) p.push(`Heal = dmg dealt.`);
    if (e.energy) p.push(`+${e.energy} Energy.`);
    if (e.selfDmg) p.push(`Lose ${e.selfDmg} HP.`);
    if (e.copyDiscard) p.push(`Copy to discard.`);
    if (e.exhaust) p.push(`Exhaust.`);
    return p.join(' ');
}
function pickRarity(force) {
    if (force) return force;
    const r = Math.random() * 100; return r < RARITY_W.common ? 'common' : r < RARITY_W.common + RARITY_W.uncommon ? 'uncommon' : 'rare';
}
function randomCard(rarity) { const pool = POOL.filter(k => CARDS[k].rarity === (rarity || pickRarity())); return pool[Math.floor(Math.random() * pool.length)] || POOL[0]; }
function gainRelic(r) { const own = new Set(r.relics); const left = RELIC_IDS.filter(x => !own.has(x)); if (!left.length) return null; const id = left[Math.floor(Math.random() * left.length)]; r.relics.push(id); if (id === 'strawberry') { r.maxHp += 7; r.hp += 7; } return id; }
function addCard(r, id) { r.deck.push(mkInst(id)); }

/* ---- Map: 3 lanes x 7 rows + boss (connectivity validated) ---- */
function genMap(seed) {
    const r = mulberry32(seed), ROWS = 7, nodes = [], edges = {}, types = {};
    for (let row = 0; row < ROWS; row++)nodes.push([0, 1, 2]);
    for (let row = 0; row < ROWS - 1; row++) {
        const ins = { 0: 0, 1: 0, 2: 0 };
        for (const l of nodes[row]) {
            const opts = nodes[row + 1].filter(x => Math.abs(x - l) <= 1);
            let keep = opts.filter(() => r() < 0.7); if (!keep.length) keep = [opts[Math.floor(r() * opts.length)]];
            edges[row + ',' + l] = keep; keep.forEach(x => ins[x]++);
        }
        for (const x of nodes[row + 1]) if (!ins[x]) { const srcs = nodes[row].filter(l => Math.abs(l - x) <= 1); const s = srcs[Math.floor(r() * srcs.length)]; edges[row + ',' + s].push(x); }
    }
    for (let row = 0; row < ROWS; row++)for (const l of nodes[row]) {
        let t;
        if (row === 0) t = 'fight'; else if (row === ROWS - 1) t = 'rest';
        else { const roll = r(); t = (row >= 3 && roll < 0.16) ? 'elite' : roll < 0.30 ? 'event' : roll < 0.42 ? 'shop' : roll < 0.52 ? 'rest' : 'fight'; }
        types[row + ',' + l] = t;
    }
    return { nodes, edges, types, rows: ROWS };
}

/* ================= MOUNT ================= */
export function mount(root, context = {}) {
    const { mode = "ai", room = null, playerName = "Player", onExit = () => { } } = context;
    const online = mode === "room" && Boolean(room);
    const isHost = !online || room.isHost;
    const hostSeat = online ? (Math.random() < 0.5 ? 0 : 1) : 0;
    let roomData = room?.room || null;
    const unsubs = [], timers = new Set();
    const later = (ms, fn) => { const id = setTimeout(() => { timers.delete(id); fn(); }, ms); timers.add(id); return id; };
    const mySeat = () => online ? (isHost ? S.hostSeat : 1 - S.hostSeat) : 0;
    const viewSeat = () => online ? (isHost ? (S?.hostSeat ?? 0) : 1 - (S?.hostSeat ?? 0)) : 0;

    let S = null;                 // session
    const cheats = { god: false, energy: false, gold: false };
    let cheated = false;
    function loadBest() { try { return JSON.parse(localStorage.getItem(META.bestKey) || "null"); } catch (_) { return null; } }
    function saveBest(v) { try { localStorage.setItem(META.bestKey, JSON.stringify(v)); } catch (_) { } }

    /* ---------- markup ---------- */
    root.innerHTML = `
<div class="game-app sm-root">
<style>
.sm-root{--ink:#1c1917;--mut:#78716c;--line:#e7e5e4;--paper:#fafaf9;--red:#dc2626;--grn:#059669;--amb:#d97706;--blu:#2563eb}
.sm-root [hidden]{display:none!important}
.sm-root .sm-panel{padding:14px;background:var(--paper);border:1px solid var(--line);border-radius:18px;max-width:760px;width:100%;margin:0 auto;color:var(--ink);font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif}
.sm-root .sm-bar{display:flex;gap:10px;flex-wrap:wrap;align-items:center;font-size:12px;font-weight:700;letter-spacing:.5px;color:var(--mut);margin-bottom:10px}
.sm-root .sm-bar b{color:var(--ink)}
.sm-root .sm-chip{border:1px solid var(--line);border-radius:999px;padding:3px 10px;background:#fff}
.sm-root .sm-screen{min-height:340px}
.sm-root .sm-center{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;min-height:340px;text-align:center}
.sm-root h3{margin:0;font-size:24px;font-weight:800;letter-spacing:.5px}
.sm-root .sm-sub{font-size:12px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:var(--mut);margin:0}
.sm-root button{font:600 13px/1.2 ui-sans-serif,system-ui,sans-serif;cursor:pointer}
.sm-root .sm-btn{padding:11px 18px;border-radius:11px;border:1px solid var(--ink);background:var(--ink);color:var(--paper);font-weight:700;letter-spacing:.5px}
.sm-root .sm-ghost{padding:9px 14px;border-radius:11px;border:1px solid #d6d3d1;background:#fff;color:#44403c}
.sm-root button:disabled{opacity:.4;cursor:default}
.sm-root .sm-row{display:flex;gap:10px;flex-wrap:wrap;justify-content:center;align-items:center}
/* map */
.sm-root .sm-map{width:100%;height:auto;display:block}
.sm-root .sm-node{cursor:pointer}
.sm-root .sm-node circle{fill:#fff;stroke:#d6d3d1;stroke-width:2}
.sm-root .sm-node.open circle{stroke:var(--ink);stroke-width:3}
.sm-root .sm-node.done circle{fill:var(--line)}
.sm-root .sm-node.dim{opacity:.35;cursor:default}
.sm-root .sm-node text{font-size:13px;font-weight:800;fill:var(--ink);text-anchor:middle;pointer-events:none}
.sm-root .sm-edge{stroke:#d6d3d1;stroke-width:2;fill:none}
/* combat */
.sm-root .sm-foes{display:flex;gap:12px;justify-content:center;flex-wrap:wrap;margin:6px 0 14px}
.sm-root .sm-foe{border:1px solid var(--line);border-radius:14px;padding:10px 14px;min-width:130px;text-align:center;background:#fff;cursor:pointer}
.sm-root .sm-foe.target{border-color:var(--red);box-shadow:0 0 0 2px #dc262622}
.sm-root .sm-foe.dead{opacity:.3}
.sm-root .sm-foe .nm{font-weight:800;font-size:13px}
.sm-root .sm-foe .intent{font-size:12px;font-weight:800;color:var(--red);margin:4px 0}
.sm-root .sm-hpbar{height:6px;border-radius:3px;background:var(--line);overflow:hidden;margin:4px 0}
.sm-root .sm-hpbar i{display:block;height:100%;background:var(--red)}
.sm-root .sm-stat{font-size:10px;font-weight:700;color:var(--mut);letter-spacing:.5px}
.sm-root .sm-you{display:flex;gap:14px;align-items:center;justify-content:center;flex-wrap:wrap;border-top:1px solid var(--line);padding-top:10px;margin-top:6px}
.sm-root .sm-hand{display:flex;gap:8px;flex-wrap:wrap;justify-content:center;margin:12px 0}
.sm-root .sm-card{width:118px;min-height:120px;border:1px solid #d6d3d1;border-radius:12px;background:#fff;padding:8px;text-align:left;display:flex;flex-direction:column;gap:4px;position:relative}
.sm-root .sm-card.attack{border-top:3px solid var(--red)}
.sm-root .sm-card.skill{border-top:3px solid var(--blu)}
.sm-root .sm-card.power{border-top:3px solid var(--amb)}
.sm-root .sm-card .cost{position:absolute;top:-8px;left:-8px;width:24px;height:24px;border-radius:50%;background:var(--ink);color:var(--paper);font-weight:800;font-size:12px;display:flex;align-items:center;justify-content:center}
.sm-root .sm-card .cn{font-weight:800;font-size:12px;margin-top:4px}
.sm-root .sm-card .ct{font-size:9px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:var(--mut)}
.sm-root .sm-card .cx{font-size:10px;line-height:1.3;color:#44403c}
.sm-root .sm-card.off{opacity:.45}
.sm-root .sm-card.up .cn{color:var(--grn)}
.sm-root .sm-piles{display:flex;gap:14px;justify-content:center;font-size:11px;font-weight:700;color:var(--mut)}
.sm-root .sm-potions{display:flex;gap:6px}
.sm-root .sm-pot{width:34px;height:34px;border-radius:50%;border:1px solid #d6d3d1;background:#fff;font-size:10px;font-weight:800;color:var(--grn)}
.sm-root .sm-pot.empty{opacity:.3}
.sm-root .sm-log{text-align:center;font-size:12px;font-weight:700;color:var(--mut);min-height:18px;margin-top:6px}
.sm-root .sm-relics{display:flex;gap:6px;flex-wrap:wrap}
.sm-root .sm-relic{font-size:10px;font-weight:700;border:1px solid var(--line);border-radius:999px;padding:2px 8px;background:#fff;color:#57534e}
.sm-root .sm-list{display:flex;flex-direction:column;gap:6px;max-height:240px;overflow:auto;width:100%;max-width:420px}
.sm-root .sm-list button{text-align:left;padding:8px 10px;border-radius:9px;border:1px solid var(--line);background:#fff}
.sm-root .sm-ov{position:fixed;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(250,250,249,.9);backdrop-filter:blur(2px);z-index:50}
.sm-root .sm-ovcard{background:#fff;border:1px solid var(--line);border-radius:16px;padding:22px;display:flex;flex-direction:column;gap:12px;align-items:center;max-width:340px}
.sm-root .sm-cheats{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.sm-root .sm-cheats button{padding:9px;border-radius:9px;border:1px solid #d6d3d1;background:#fff}
.sm-root .sm-cheats button.on{background:var(--ink);color:var(--paper);border-color:var(--ink)}
.sm-root .sm-actions{display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-top:12px}
.sm-root .sm-kbd{font:700 10px/1 ui-monospace,monospace;border:1px solid #d6d3d1;border-radius:5px;padding:2px 5px;color:var(--mut);background:#f5f5f4}
@media (pointer:coarse){.sm-root .sm-kbd{display:none}.sm-root .sm-card{width:104px}}
</style>
<div class="game-intro"><div><h2>Sword Master</h2></div>
  <span class="game-status"><i class="game-status-dot"></i><span data-status>Ready</span></span></div>
<section class="game-panel sm-panel" data-board>
  <div class="sm-bar" data-bar></div>
  <div class="sm-screen" data-screen></div>
</section>
<div class="game-actions sm-actions">
  <button class="sm-ghost" type="button" data-act="cheat" data-cheatbtn>Cheats<span data-cheatdot hidden> •</span></button>
  <button class="sm-ghost" type="button" data-exit>Exit game</button>
</div>
<div class="sm-ov" data-ov="cheats" hidden><div class="sm-ovcard">
  <h3>Cheats</h3>
  <div class="sm-cheats">
    <button type="button" data-act="toggle" data-cheat="god">Invincible</button>
    <button type="button" data-act="toggle" data-cheat="energy">∞ Energy</button>
    <button type="button" data-act="toggle" data-cheat="gold">∞ Gold</button>
    <button type="button" data-act="cheat-heal">Full heal</button>
    <button type="button" data-act="cheat-gold">+999 gold</button>
    <button type="button" data-act="cheat-relic">+ Relic</button>
    <button type="button" data-act="cheat-win">Win fight</button>
  </div>
  <button class="sm-ghost" type="button" data-act="close-cheats">Close</button>
</div></div>
</div>`;
    const $ = s => root.querySelector(s);
    const barEl = $('[data-bar]'), screenEl = $('[data-screen]'), statusEl = $('[data-status]');
    const cheatBtn = $('[data-cheatbtn]'), cheatDot = $('[data-cheatdot]'), ovCheats = $('[data-ov="cheats"]');
    if (online) cheatBtn.setAttribute('hidden', '');

    /* ================= AI RUN ================= */
    function newRun(asc) {
        UID = 1; cheated = false;
        const r = {
            asc: asc || 0, hp: HP0, maxHp: HP0, gold: 99, act: 1, deck: STARTER.map(mkInst), relics: [], potions: [null, null, null],
            map: null, pos: null, screen: 'map', combat: null, reward: null, shop: null, rest: null, event: null, seed: (Math.random() * 1e9) | 0,
            removeMode: false, node: null
        };
        if (asc >= 5) { r.maxHp = Math.floor(HP0 * 0.9); r.hp = r.maxHp; }
        r.map = genMap(r.seed); return r;
    }
    function startRun(asc) { S = { mode: 'ai', run: newRun(asc) }; paint(); }

    function reachable() { // nodes clickable from current pos
        const r = S.run, m = r.map;
        if (!r.pos) return m.nodes[0].map(l => ({ row: 0, lane: l }));
        if (r.pos.row >= m.rows - 1) return []; // at top -> boss handled separately
        return (m.edges[r.pos.row + ',' + r.pos.lane] || []).map(x => ({ row: r.pos.row + 1, lane: x }));
    }
    function enterNode(row, lane) {
        const r = S.run; r.pos = { row, lane }; const t = r.map.types[row + ',' + lane]; r.node = t;
        if (t === 'fight') startCombat('small');
        else if (t === 'elite') startCombat('elite');
        else if (t === 'rest') { r.rest = { smith: false }; r.screen = 'rest'; paint(); }
        else if (t === 'shop') { openShop(); }
        else if (t === 'event') { r.event = { idx: Math.floor(Math.random() * EVENTS.length), done: false, msg: '' }; r.screen = 'event'; paint(); }
    }
    function enterBoss() { startCombat('boss'); }
    function atTop() { const r = S.run; return r.pos && r.pos.row >= r.map.rows - 1; }

    /* ---- combat ---- */
    function makeEnemies(kind) {
        const r = S.run, act = r.act, asc = r.asc;
        const list = ENEMIES[kind]; const base = list[Math.floor(Math.random() * list.length)];
        const hp = Math.round(base.hp * ACT_HP[act] * (1 + 0.08 * asc));
        const dmg = base.dmg + ACT_DMG[act] + asc;
        const mk = () => ({ name: base.name, hp, maxHp: hp, block: 0, str: 0, vuln: 0, weak: 0, poison: 0, dmg, pat: base.pat, mi: 0, intent: null });
        const arr = [mk()];
        if (kind === 'small' && Math.random() < 0.35) { const b2 = ENEMIES.small[Math.floor(Math.random() * 3)]; arr.push({ name: b2.name, hp: Math.round(b2.hp * ACT_HP[act] * (1 + 0.08 * asc)), maxHp: hp, block: 0, str: 0, vuln: 0, weak: 0, poison: 0, dmg: b2.dmg + ACT_DMG[act] + asc, pat: b2.pat, mi: 0, intent: null }); arr[1].maxHp = arr[1].hp; }
        arr.forEach(e => e.intent = nextIntent(e));
        return arr;
    }
    function nextIntent(e) { return e.pat[e.mi % e.pat.length]; }
    function intentText(e, p) { const m = e.intent; if (m[0] === 'atk') { const v = computeAttack(e.dmg * m[1], e.weak > 0, p.vuln > 0) + e.str; return 'ATK ' + v + (m[1] > 1 ? ' ×' + m[1] : ''); } if (m[0] === 'block') return 'BLK ' + m[1]; return 'BUFF'; }

    function startCombat(kind) {
        const r = S.run;
        const byId = {}; r.deck.forEach(c => { c.ramp = 0; byId[c.uid] = c; });
        const rnd = mulberry32((r.seed ^ r.deck.length ^ Date.now()) >>> 0);
        const draw = shuffle(r.deck.map(c => c.uid), rnd);
        const c = {
            kind, byId, rnd, draw, hand: [], discard: [], exhaust: [], energy: ENERGY, maxEnergy: ENERGY, turn: 0, target: 0,
            p: { hp: r.hp, maxHp: r.maxHp, block: 0, str: 0, vuln: 0, weak: 0, poison: 0, metal: 0, demon: 0 },
            enemies: makeEnemies(kind), phase: 'player', log: ''
        };
        // relics: combat start
        if (r.relics.includes('vajra')) c.p.str += 1;
        if (r.relics.includes('anchor')) c.p.block += 10;
        if (r.relics.includes('vial')) c.enemies.forEach(e => e.poison += 2);
        S.run.combat = c; S.run.screen = 'combat';
        startPlayerTurn();
    }
    function drawCards(n) {
        const c = S.run.combat;
        for (let i = 0; i < n; i++) {
            if (!c.draw.length) { c.draw = shuffle(c.discard, c.rnd); c.discard = []; }
            if (c.draw.length) c.hand.push(c.draw.pop());
        }
    }
    function startPlayerTurn() {
        const c = S.run.combat, r = S.run; c.turn++;
        c.p.block = 0; c.p.str += c.p.demon;
        if (c.p.poison > 0) { c.p.hp -= c.p.poison; c.p.poison--; if (c.p.hp <= 0) return loseRun(); }
        c.energy = c.maxEnergy;
        if (c.turn === 1 && r.relics.includes('lantern')) c.energy += 1;
        if (r.relics.includes('sunflower') && c.turn % 3 === 0) c.energy += 1;
        if (cheats.energy) c.energy = 99;
        drawCards(HAND + (c.turn === 1 && r.relics.includes('bag') ? 2 : 0));
        if (c.turn === 2 && r.relics.includes('cleat')) c.p.block += 14;
        c.phase = 'player'; paint();
    }
    function aliveEnemies() { return S.run.combat.enemies.filter(e => e.hp > 0); }
    function applyCardEffects(inst, src, tgts, ctx) {
        const e = eff(inst);
        if (e.selfDmg) src.hp -= e.selfDmg;
        if (e.energy) ctx.energy(e.energy);
        if (e.draw) ctx.draw(e.draw);
        if (e.block) src.block += e.block;
        if (e.strength) src.str += e.strength;
        if (e.doubleStr) src.str *= 2;
        if (e.metal) src.metal += e.metal;
        if (e.demon) src.demon += e.demon;
        if (e.heal) src.hp = Math.min(src.maxHp, src.hp + e.heal);
        const primary = tgts[0];
        if (e.enStr) primary.str -= e.enStr;
        if (e.vuln) primary.vuln += e.vuln;
        if (e.weak) primary.weak += e.weak;
        if (e.poison) primary.poison += e.poison;
        if (e.dmg) {
            const base = e.dmg + (e.strmult ? src.str * e.strmult : src.str) + (e.rampage ? inst.ramp : 0);
            const hits = e.xcost ? ctx.xhits : (e.hits || 1);
            const list = e.aoe ? tgts : [primary];
            for (let h = 0; h < hits; h++)for (const t of list) { if (t.hp <= 0) continue; const amt = computeAttack(base, src.weak > 0, t.vuln > 0); const ub = hitUnit(t, amt); if (e.healOnDmg) src.hp = Math.min(src.maxHp, src.hp + ub); }
        }
        if (e.rampage) inst.ramp += e.rampage;
        if (e.copyDiscard) ctx.copy(inst);
    }
    function playCard(uid) {
        const c = S.run.combat; if (c.phase !== 'player') return;
        const idx = c.hand.indexOf(uid); if (idx < 0) return;
        const inst = c.byId[uid], cost = costOf(inst);
        const xcost = CARDS[inst.id].cost === -1;
        const pay = xcost ? c.energy : cost;
        if (!xcost && cost > c.energy) return;
        if (xcost && c.energy <= 0) return;
        c.energy -= pay;
        c.hand.splice(idx, 1);
        const e = eff(inst);
        (e.exhaust ? c.exhaust : c.discard).push(uid);
        const alive = aliveEnemies(); if (!alive.length) return;
        const target = alive[Math.min(c.target, alive.length - 1)];
        const tgts = [target, ...alive.filter(x => x !== target)];
        applyCardEffects(inst, c.p, tgts, {
            energy: n => c.energy += n, draw: n => drawCards(n), xhits: pay,
            copy: () => { const ni = mkInst(inst.id); c.byId[ni.uid] = ni; c.discard.push(ni.uid); }
        });
        c.log = `Played ${CARDS[inst.id].name}.`;
        if (c.p.hp <= 0) return loseRun();
        if (aliveEnemies().length === 0) return winCombat();
        paint();
    }
    function usePotion(slot) {
        const r = S.run, c = r.combat; if (!c || c.phase !== 'player') return;
        const id = r.potions[slot]; if (!id) return;
        const alive = aliveEnemies();
        if (id === 'heal') c.p.hp = Math.min(c.p.maxHp, c.p.hp + 20);
        else if (id === 'block') c.p.block += 12;
        else if (id === 'strength') c.p.str += 2;
        else if (id === 'swift') drawCards(3);
        else if (id === 'fire') alive.forEach(e => hitUnit(e, 15));
        r.potions[slot] = null; c.log = `Used ${POTIONS[id].name}.`;
        if (aliveEnemies().length === 0) return winCombat();
        paint();
    }
    function endTurn() {
        const c = S.run.combat; if (c.phase !== 'player') return;
        c.phase = 'enemy';
        c.discard.push(...c.hand); c.hand = [];
        if (c.p.metal) c.p.block += c.p.metal;
        if (c.p.vuln > 0) c.p.vuln--; if (c.p.weak > 0) c.p.weak--;
        paint();
        later(420, enemyTurn);
    }
    function enemyTurn() {
        const c = S.run.combat, r = S.run;
        for (const e of c.enemies) {
            if (e.hp <= 0) continue;
            e.block = 0;
            if (e.poison > 0) { e.hp -= e.poison; e.poison--; if (e.hp <= 0) continue; }
            const m = e.intent;
            if (m[0] === 'atk') {
                const amt = computeAttack(e.dmg * m[1], e.weak > 0, c.p.vuln > 0) + e.str;
                if (!(cheats.god)) hitUnit(c.p, amt);
                if (r.relics.includes('scales')) hitUnit(e, 3);
            } else if (m[0] === 'block') e.block += m[1];
            else if (m[0] === 'buff') e.str += m[1];
            if (e.vuln > 0) e.vuln--; if (e.weak > 0) e.weak--;
            e.mi++; e.intent = nextIntent(e);
            if (c.p.hp <= 0) return loseRun();
        }
        if (aliveEnemies().length === 0) return winCombat();
        startPlayerTurn();
    }
    function winCombat() {
        const r = S.run, c = r.combat; c.phase = 'won'; r.hp = Math.max(1, c.p.hp);
        if (r.relics.includes('burning')) r.hp = Math.min(r.maxHp, r.hp + 6);
        if (r.relics.includes('meat') && r.hp < r.maxHp * 0.5) r.hp = Math.min(r.maxHp, r.hp + 12);
        const goldBase = c.kind === 'boss' ? 60 : c.kind === 'elite' ? 30 : 15;
        const gold = Math.round((goldBase + Math.floor(Math.random() * 10)) * (r.asc >= 2 ? 0.8 : 1));
        r.gold += gold;
        const cards = [randomCard(), randomCard(), randomCard()];
        const relic = (c.kind === 'elite' || c.kind === 'boss') ? gainRelic(r) : null;
        r.reward = { gold, cards, relic, kind: c.kind, picked: false };
        r.screen = 'reward'; r.combat = null; paint();
    }
    function loseRun() {
        const r = S.run; r.hp = 0;
        const cleared = r.act - 1; const best = loadBest(); const score = cleared * 100 + r.asc;
        if (!cheated && (!best || score > best.score)) saveBest({ score, act: cleared, asc: r.asc });
        r.screen = 'over'; r.combat = null; paint();
    }
    function chooseReward(i) {
        const r = S.run, rw = r.reward; if (rw.picked) return;
        if (i >= 0) addCard(r, rw.cards[i]);
        rw.picked = true; afterReward();
    }
    function afterReward() {
        const r = S.run;
        if (r.reward.kind === 'boss') {
            if (r.act >= ACTS) { return victory(); }
            r.act++; r.hp = Math.min(r.maxHp, r.hp + Math.floor(r.maxHp * 0.25) + 15);
            r.seed = (Math.random() * 1e9) | 0; r.map = genMap(r.seed); r.pos = null; r.reward = null; r.screen = 'map'; paint();
        } else { r.reward = null; r.screen = 'map'; paint(); }
    }
    function victory() {
        const r = S.run; const best = loadBest(); const score = ACTS * 100 + r.asc;
        if (!cheated && (!best || score > best.score)) saveBest({ score, act: ACTS, asc: r.asc });
        r.screen = 'win'; paint();
    }

    /* ---- shop / rest / event ---- */
    function openShop() {
        const r = S.run;
        const cards = [0, 1, 2].map(() => { const id = randomCard(); return { id, price: PRICE[CARDS[id].rarity] + Math.floor(Math.random() * 10) }; });
        const relicId = (() => { const own = new Set(r.relics); const left = RELIC_IDS.filter(x => !own.has(x)); return left.length ? left[Math.floor(Math.random() * left.length)] : null; })();
        const pots = [POTION_IDS[Math.floor(Math.random() * 5)], POTION_IDS[Math.floor(Math.random() * 5)]];
        r.shop = { cards, relic: relicId ? { id: relicId, price: 150 } : null, pots: pots.map(id => ({ id, price: 50 })), removePrice: 75, removed: false };
        r.screen = 'shop'; paint();
    }
    function buy(kind, i) {
        const r = S.run, s = r.shop;
        const pay = (p) => { const g = cheats.gold ? 0 : p; if (r.gold < g) return false; r.gold -= g; return true; };
        if (kind === 'card') { const it = s.cards[i]; if (it && !it.sold && pay(it.price)) { addCard(r, it.id); it.sold = true; } }
        else if (kind === 'relic') { if (s.relic && !s.relic.sold && pay(s.relic.price)) { r.relics.push(s.relic.id); if (s.relic.id === 'strawberry') { r.maxHp += 7; r.hp += 7; } s.relic.sold = true; } }
        else if (kind === 'pot') { const it = s.pots[i]; if (it && !it.sold && pay(it.price)) { const slot = r.potions.indexOf(null); if (slot >= 0) { r.potions[slot] = it.id; it.sold = true; } } }
        else if (kind === 'remove') { if (!s.removed && pay(s.removePrice)) { r.removeMode = true; s.removed = true; } }
        paint();
    }
    function restHeal() { const r = S.run; const pct = r.asc >= 3 ? 0.25 : 0.3; r.hp = Math.min(r.maxHp, r.hp + Math.floor(r.maxHp * pct)); r.rest = null; r.screen = 'map'; paint(); }
    function smith(uid) { const r = S.run; const c = r.deck.find(x => x.uid === uid); if (c && !c.up) { c.up = true; } r.rest = null; r.screen = 'map'; paint(); }
    function eventChoice(i) {
        const r = S.run, ev = r.event; if (ev.done) return;
        const msg = EVENTS[ev.idx].choices[i].run(r);
        ev.done = true; ev.msg = msg;
        if (r.hp <= 0) { r.hp = 0; return loseRun(); }
        paint();
    }
    function removeCard(uid) {
        const r = S.run; const i = r.deck.findIndex(x => x.uid === uid);
        if (i >= 0 && r.deck.length > 1) r.deck.splice(i, 1);
        r.removeMode = false; paint();
    }

    /* ================= PVP DUEL (open hand) ================= */
    function pvpSide(name) {
        const deck = STARTER.map(mkInst).concat([mkInst(randomCard('common')), mkInst(randomCard('common')), mkInst(randomCard('uncommon'))]);
        const byId = {}; deck.forEach(c => byId[c.uid] = c);
        const rnd = mulberry32((Math.random() * 1e9) | 0);
        return {
            name, hp: PVP_HP, maxHp: PVP_HP, block: 0, str: 0, vuln: 0, weak: 0, poison: 0, metal: 0, demon: 0,
            energy: ENERGY, maxEnergy: ENERGY, byId, rnd, draw: shuffle(deck.map(c => c.uid), rnd), hand: [], discard: [], exhaust: []
        };
    }
    const PVP_HP = 50;
    function startMatch() {
        const sides = [pvpSide('Player 1'), pvpSide('Player 2')];
        sides[hostSeat].name = playerName || 'Host'; sides[1 - hostSeat].name = 'Challenger';
        S = { mode: 'pvp', hostSeat, sides, active: Math.random() < 0.5 ? 0 : 1, turn: 0, screen: 'combat', winner: -1, log: '' };
        pvpStartTurn();
    }
    function pvpDraw(side, n) { for (let i = 0; i < n; i++) { if (!side.draw.length) { side.draw = shuffle(side.discard, side.rnd); side.discard = []; } if (side.draw.length) side.hand.push(side.draw.pop()); } }
    function pvpStartTurn() {
        const side = S.sides[S.active]; S.turn++;
        side.block = 0; side.str += side.demon;
        if (side.poison > 0) { side.hp -= side.poison; side.poison--; if (side.hp <= 0) return pvpWin(1 - S.active); }
        side.energy = side.maxEnergy; side.hand = []; pvpDraw(side, HAND);
        paint(); publish();
    }
    function pvpPlay(uid) {
        if (S.sides[mySeat()] !== S.sides[S.active]) return;
        const side = S.sides[S.active], other = S.sides[1 - S.active];
        const idx = side.hand.indexOf(uid); if (idx < 0) return;
        const inst = side.byId[uid], cost = costOf(inst), xcost = CARDS[inst.id].cost === -1;
        const pay = xcost ? side.energy : cost;
        if ((!xcost && cost > side.energy) || (xcost && side.energy <= 0)) return;
        side.energy -= pay; side.hand.splice(idx, 1);
        (eff(inst).exhaust ? side.exhaust : side.discard).push(uid);
        applyCardEffects(inst, side, [other], {
            energy: n => side.energy += n, draw: n => pvpDraw(side, n), xhits: pay,
            copy: () => { const ni = mkInst(inst.id); side.byId[ni.uid] = ni; side.discard.push(ni.uid); }
        });
        S.log = `${side.name} played ${CARDS[inst.id].name}.`;
        if (other.hp <= 0) return pvpWin(S.active);
        if (side.hp <= 0) return pvpWin(1 - S.active);
        paint(); publish();
    }
    function pvpEnd() {
        if (S.sides[mySeat()] !== S.sides[S.active]) return;
        const side = S.sides[S.active];
        side.discard.push(...side.hand); side.hand = [];
        if (side.metal) side.block += side.metal;
        if (side.vuln > 0) side.vuln--; if (side.weak > 0) side.weak--;
        S.active = 1 - S.active; pvpStartTurn();
    }
    function pvpWin(seat) { S.winner = seat; S.screen = 'over'; paint(); publish(); }

    /* ================= RENDER ================= */
    const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    function statLine(u) { const p = []; if (u.block) p.push('BLK ' + u.block); if (u.str) p.push('STR ' + u.str); if (u.vuln) p.push('VULN ' + u.vuln); if (u.weak) p.push('WEAK ' + u.weak); if (u.poison) p.push('PSN ' + u.poison); if (u.metal) p.push('METAL ' + u.metal); if (u.demon) p.push('DEMON ' + u.demon); return p.join(' · '); }
    function hpBar(u) { return `<div class="sm-hpbar"><i style="width:${clamp(100 * u.hp / u.maxHp, 0, 100)}%"></i></div><div class="sm-stat">${Math.max(0, u.hp)}/${u.maxHp}</div>`; }
    function cardHtml(inst, playable, act) {
        const c = CARDS[inst.id], cost = costOf(inst);
        return `<button class="sm-card ${c.type} ${inst.up ? 'up' : ''} ${playable ? '' : 'off'}" data-${act}="${inst.uid}" ${playable ? '' : 'disabled'}>
      <span class="cost">${cost === -1 ? 'X' : cost}</span><span class="cn">${esc(c.name)}${inst.up ? '+' : ''}</span>
      <span class="ct">${c.type}</span><span class="cx">${esc(cardText(inst))}</span></button>`;
    }
    function paint() {
        if (!S) { renderStart(); return; }
        if (S.mode === 'pvp') { if (!S.sides) { renderStart(); return; } renderPvp(); return; }
        const r = S.run;
        statusEl.textContent = r.screen === 'combat' ? 'In combat' : r.screen === 'map' ? `Act ${r.act}` : r.screen === 'win' ? 'Victory' : r.screen === 'over' ? 'Defeated' : 'Ready';
        barEl.innerHTML = `<span class="sm-chip">ACT <b>${r.act}/${ACTS}</b></span>
      <span class="sm-chip">HP <b>${Math.max(0, r.hp)}/${r.maxHp}</b></span>
      <span class="sm-chip">GOLD <b>${cheats.gold ? '∞' : r.gold}</b></span>
      <span class="sm-chip">ASC <b>${r.asc}</b></span>
      <span class="sm-chip">DECK <b>${r.deck.length}</b></span>
      <span class="sm-relics">${r.relics.map(id => `<span class="sm-relic" title="${esc(RELICS[id].text)}">${esc(RELICS[id].name)}</span>`).join('')}</span>`;
        if (r.removeMode) { renderRemove(); return; }
        switch (r.screen) {
            case 'map': renderMap(); break; case 'combat': renderCombat(); break; case 'reward': renderReward(); break;
            case 'shop': renderShop(); break; case 'rest': renderRest(); break; case 'event': renderEvent(); break;
            case 'over': renderEnd(false); break; case 'win': renderEnd(true); break; default: renderStart();
        }
    }
    function renderStart() {
        statusEl.textContent = 'Ready'; barEl.innerHTML = '';
        const best = loadBest(); const bestTxt = best ? `Best: Act ${best.act} · A${best.asc}` : 'No record yet';
        if (online) {
            screenEl.innerHTML = `<div class="sm-center"><h3>Sword Master</h3><p class="sm-sub">Card duel · open hand</p>
        <button class="sm-btn" data-act="start">Start duel</button></div>`;
        } else {
            screenEl.innerHTML = `<div class="sm-center"><h3>Sword Master</h3><p class="sm-sub">${esc(bestTxt)}</p>
        <div class="sm-row"><span class="sm-sub">Ascension</span>
        <select data-asc class="sm-ghost">${[0, 1, 2, 3, 4, 5].map(a => `<option value="${a}">${a}</option>`).join('')}</select></div>
        <button class="sm-btn" data-act="start">Begin run</button></div>`;
        }
    }
    function renderMap() {
        const r = S.run, m = r.map, W = 360, rowH = 52, top = 30;
        const X = l => 60 + l * 120, Y = row => top + (m.rows - 1 - row) * rowH;
        const open = reachable(); const openSet = new Set(open.map(n => n.row + ',' + n.lane));
        let edges = '';
        for (let row = 0; row < m.rows - 1; row++)for (const l of m.nodes[row]) for (const x of (m.edges[row + ',' + l] || []))
            edges += `<path class="sm-edge" d="M${X(l)},${Y(row)} L${X(x)},${Y(row + 1)}"/>`;
        const ICON = { fight: '⚔', elite: '★', rest: '⌂', shop: '$', event: '?', boss: '☠' };
        let nodes = '';
        for (let row = 0; row < m.rows; row++)for (const l of m.nodes[row]) {
            const key = row + ',' + l, t = m.types[key];
            const done = r.pos && (row < r.pos.row || (row === r.pos.row && l === r.pos.lane));
            const cls = openSet.has(key) ? 'open' : done ? 'done' : 'dim';
            nodes += `<g class="sm-node ${cls}" data-node="${key}"><circle cx="${X(l)}" cy="${Y(row)}" r="16"/><text x="${X(l)}" y="${Y(row) + 4}">${ICON[t]}</text></g>`;
        }
        const bossY = Y(m.rows) - rowH + 10; const bossOpen = atTop();
        nodes += `<g class="sm-node ${bossOpen ? 'open' : 'dim'}" data-boss="1"><circle cx="${X(1)}" cy="${bossY}" r="20"/><text x="${X(1)}" y="${bossY + 5}">☠</text></g>`;
        edges += `<path class="sm-edge" d="M${X(1)},${Y(m.rows - 1)} L${X(1)},${bossY}"/>`;
        screenEl.innerHTML = `<svg class="sm-map" viewBox="0 0 ${W} ${top + m.rows * rowH + 20}">${edges}${nodes}</svg>
      <p class="sm-sub" style="text-align:center;margin-top:8px">${bossOpen ? 'Face the boss' : 'Choose a path upward'}</p>`;
    }
    function renderCombat() {
        const c = S.run.combat;
        const alive = aliveEnemies();
        const foes = c.enemies.map((e, i) => {
            const isT = alive.indexOf(e) === Math.min(c.target, alive.length - 1);
            return `<div class="sm-foe ${e.hp <= 0 ? 'dead' : ''} ${isT && e.hp > 0 ? 'target' : ''}" data-enemy="${i}">
        <div class="nm">${esc(e.name)}</div><div class="intent">${e.hp > 0 ? intentText(e, c.p) : '—'}</div>
        ${hpBar(e)}<div class="sm-stat">${statLine(e)}</div></div>`;
        }).join('');
        const hand = c.hand.map(uid => {
            const inst = c.byId[uid]; const cost = costOf(inst); const x = CARDS[inst.id].cost === -1;
            const ok = c.phase === 'player' && (x ? c.energy > 0 : cost <= c.energy); return cardHtml(inst, ok, 'card');
        }).join('');
        const pots = S.run.potions.map((id, i) => `<button class="sm-pot ${id ? '' : 'empty'}" data-pot="${i}" ${id && c.phase === 'player' ? '' : 'disabled'} title="${id ? esc(POTIONS[id].text) : ''}">${id ? '●' : '○'}</button>`).join('');
        screenEl.innerHTML = `<div class="sm-foes">${foes}</div>
      <div class="sm-you"><div><b>YOU</b> ${hpBar(c.p)}<div class="sm-stat">${statLine(c.p)}</div></div>
      <div class="sm-stat">ENERGY <b style="font-size:18px;color:var(--ink)">${c.energy}/${c.maxEnergy}</b></div>
      <div class="sm-potions">${pots}</div></div>
      <div class="sm-hand">${hand}</div>
      <div class="sm-piles"><span>Draw ${c.draw.length}</span><span>Discard ${c.discard.length}</span><span>Exhaust ${c.exhaust.length}</span>
      <button class="sm-btn" data-act="end" ${c.phase === 'player' ? '' : 'disabled'}>End turn <span class="sm-kbd">E</span></button></div>
      <div class="sm-log">${esc(c.log || '')}</div>`;
    }
    function renderReward() {
        const rw = S.run.reward;
        const cards = rw.cards.map((id, i) => cardHtml(mkInstPreview(id), !rw.picked, 'pick')).join('');
        screenEl.innerHTML = `<div class="sm-center"><h3>${rw.kind === 'boss' ? 'Boss slain' : rw.kind === 'elite' ? 'Elite slain' : 'Victory'}</h3>
      <p class="sm-sub">+${rw.gold} gold${rw.relic ? ` · relic: ${esc(RELICS[rw.relic].name)}` : ''}</p>
      <p class="sm-sub">Add a card (or skip)</p><div class="sm-row">${cards}</div>
      <button class="sm-ghost" data-act="skip" ${rw.picked ? 'disabled' : ''}>Skip card</button></div>`;
    }
    function mkInstPreview(id) { return { uid: 'p' + id, id, up: false, ramp: 0 }; }
    function renderShop() {
        const s = S.run.shop;
        const cards = s.cards.map((it, i) => `<div style="text-align:center">${cardHtml(mkInstPreview(it.id), !it.sold, 'buyc')}<div class="sm-sub">${it.sold ? 'SOLD' : it.price + 'g'}</div></div>`).join('');
        const relic = s.relic ? `<button class="sm-ghost" data-act="buyrelic" ${s.relic.sold ? 'disabled' : ''}>${esc(RELICS[s.relic.id].name)} — ${s.relic.sold ? 'SOLD' : s.relic.price + 'g'}</button>` : '';
        const pots = s.pots.map((it, i) => `<button class="sm-ghost" data-act="buyp" data-i="${i}" ${it.sold ? 'disabled' : ''}>${esc(POTIONS[it.id].name)} — ${it.sold ? 'SOLD' : it.price + 'g'}</button>`).join('');
        screenEl.innerHTML = `<div class="sm-center"><h3>Shop</h3><div class="sm-row">${cards}</div>
      <div class="sm-row">${relic}${pots}</div>
      <div class="sm-row"><button class="sm-ghost" data-act="buyremove" ${s.removed ? 'disabled' : ''}>Remove a card — ${s.removePrice}g</button>
      <button class="sm-btn" data-act="leaveshop">Leave</button></div></div>`;
    }
    function renderRest() {
        const r = S.run;
        if (r.rest.smith) {
            const list = r.deck.filter(c => !c.up).map(c => `<button data-smith="${c.uid}">${esc(CARDS[c.id].name)} → ${esc(CARDS[c.id].name)}+</button>`).join('');
            screenEl.innerHTML = `<div class="sm-center"><h3>Smith</h3><p class="sm-sub">Upgrade a card</p><div class="sm-list">${list || '<span class="sm-sub">All upgraded</span>'}</div><button class="sm-ghost" data-act="restback">Back</button></div>`;
        } else {
            screenEl.innerHTML = `<div class="sm-center"><h3>Rest Site</h3>
        <div class="sm-row"><button class="sm-btn" data-act="restheal">Rest (heal ${r.asc >= 3 ? 25 : 30}%)</button>
        <button class="sm-ghost" data-act="smith">Smith (upgrade)</button></div></div>`;
        }
    }
    function renderEvent() {
        const ev = S.run.event, E = EVENTS[ev.idx];
        const ch = ev.done ? `<p class="sm-sub">${esc(ev.msg)}</p><button class="sm-btn" data-act="leaveevent">Continue</button>`
            : `<div class="sm-row">${E.choices.map((c, i) => `<button class="sm-ghost" data-choice="${i}">${esc(c.label)}</button>`).join('')}</div>`;
        screenEl.innerHTML = `<div class="sm-center"><h3>${esc(E.title)}</h3>${ch}</div>`;
    }
    function renderRemove() {
        const list = S.run.deck.map(c => `<button data-remove="${c.uid}">${esc(CARDS[c.id].name)}${c.up ? '+' : ''} — ${esc(cardText(c))}</button>`).join('');
        screenEl.innerHTML = `<div class="sm-center"><h3>Remove a card</h3><div class="sm-list">${list}</div><button class="sm-ghost" data-act="cancelremove">Cancel</button></div>`;
    }
    function renderEnd(won) {
        const best = loadBest();
        screenEl.innerHTML = `<div class="sm-center"><h3>${won ? 'Victory!' : 'Defeated'}</h3>
      <p class="sm-sub">${won ? `All ${ACTS} acts cleared · Ascension ${S.run.asc}` : `Fell in Act ${S.run.act}`}${cheated ? ' · cheated' : ''}</p>
      <p class="sm-sub">${best ? `Best: Act ${best.act} · A${best.asc}` : ''}</p>
      <button class="sm-btn" data-act="restart">New run</button></div>`;
    }
    function renderPvp() {
        if (S.screen === 'over') {
            const won = S.winner === viewSeat();
            barEl.innerHTML = ''; statusEl.textContent = won ? 'Victory' : 'Defeated';
            screenEl.innerHTML = `<div class="sm-center"><h3>${won ? 'Victory!' : 'Defeated'}</h3><p class="sm-sub">${esc(S.sides[S.winner].name)} wins</p><button class="sm-btn" data-act="start">Rematch</button></div>`;
            return;
        }
        const me = viewSeat(), mine = S.active === me;
        statusEl.textContent = mine ? 'Your turn' : 'Foe turn';
        const sideHtml = (side, idx) => {
            const hand = side.hand.map(uid => {
                const inst = side.byId[uid]; const cost = costOf(inst); const x = CARDS[inst.id].cost === -1;
                const ok = mine && idx === me && (x ? side.energy > 0 : cost <= side.energy); return cardHtml(inst, ok, 'pcard');
            }).join('');
            return `<div style="border:1px solid ${idx === S.active ? 'var(--ink)' : 'var(--line)'};border-radius:14px;padding:10px;margin:6px 0">
        <div class="sm-row" style="justify-content:space-between"><b>${esc(side.name)}${idx === me ? ' (you)' : ''}</b>
        <span class="sm-stat">EN ${side.energy}/${side.maxEnergy} · ${statLine(side)}</span></div>
        ${hpBar(side)}<div class="sm-hand">${hand}</div>
        <div class="sm-piles"><span>Draw ${side.draw.length}</span><span>Discard ${side.discard.length}</span></div></div>`;
        };
        barEl.innerHTML = `<span class="sm-chip">TURN <b>${S.turn}</b></span><span class="sm-chip">${mine ? 'Your turn' : 'Opponent'}</span>`;
        screenEl.innerHTML = sideHtml(S.sides[1 - me], 1 - me) + sideHtml(S.sides[me], me) +
            `<div class="sm-row"><button class="sm-btn" data-act="pend" ${mine ? '' : 'disabled'}>End turn</button></div><div class="sm-log">${esc(S.log || '')}</div>`;
    }

    /* ================= ACTIONS / EVENTS ================= */
    function publish() { if (online && isHost && S) room.publishState(serialize()).catch(console.warn); }
    function serialize() { return JSON.parse(JSON.stringify(S)); }
    function applyAction(a, actor) {
        if (!isHost || !a) return;
        if (S.mode === 'pvp') {
            if (actor !== S.active && a.type !== 'start') return;
            if (a.type === 'play') pvpPlay(a.uid); else if (a.type === 'end') pvpEnd();
            else if (a.type === 'start' && (S.screen === 'over' || !S.sides)) startMatch();
            return;
        }
    }
    function submit(a) { if (online && !isHost) { room.sendAction(a).catch(console.warn); return; } applyAction(a, mySeat()); }

    function handleClick(e) {
        const t = e.target.closest ? e.target : null; if (!t) return;
        const ex = t.closest('[data-exit]'); if (ex) { onExit(); return; }
        const act = t.closest('[data-act]');
        if (act) {
            const a = act.dataset.act;
            if (a === 'cheat') { ovCheats.toggleAttribute('hidden'); refreshCheats(); return; }
            if (a === 'close-cheats') { ovCheats.setAttribute('hidden', ''); return; }
            if (a === 'toggle') { cheats[act.dataset.cheat] = !cheats[act.dataset.cheat]; cheated = true; refreshCheats(); paint(); return; }
            if (a === 'cheat-heal') { cheated = true; if (S?.run) { S.run.hp = S.run.maxHp; if (S.run.combat) S.run.combat.p.hp = S.run.combat.p.maxHp; } paint(); return; }
            if (a === 'cheat-gold') { cheated = true; if (S?.run) S.run.gold += 999; paint(); return; }
            if (a === 'cheat-relic') { cheated = true; if (S?.run) gainRelic(S.run); paint(); return; }
            if (a === 'cheat-win') { cheated = true; if (S?.run?.combat) winCombat(); return; }
            if (a === 'start') { if (online) submit({ type: 'start' }); else startRun(Number(root.querySelector('[data-asc]')?.value || 0)); return; }
            if (a === 'restart') { startRun(S.run.asc); return; }
            if (a === 'end') { endTurn(); return; }
            if (a === 'skip') { chooseReward(-1); return; }
            if (a === 'leaveshop') { S.run.shop = null; S.run.screen = 'map'; paint(); return; }
            if (a === 'buyrelic') { buy('relic'); return; }
            if (a === 'buyremove') { buy('remove'); return; }
            if (a === 'restheal') { restHeal(); return; }
            if (a === 'smith') { S.run.rest.smith = true; paint(); return; }
            if (a === 'restback') { S.run.rest.smith = false; paint(); return; }
            if (a === 'leaveevent') { S.run.event = null; S.run.screen = 'map'; paint(); return; }
            if (a === 'cancelremove') { S.run.removeMode = false; paint(); return; }
            if (a === 'pend') { submit({ type: 'end' }); return; }
            return;
        }
        if (!S) return;
        if (S.mode === 'pvp') { const pc = t.closest('[data-pcard]'); if (pc) { submit({ type: 'play', uid: Number(pc.dataset.pcard) }); } return; }
        const r = S.run;
        const node = t.closest('[data-node]'); if (node && r.screen === 'map') { const [row, lane] = node.dataset.node.split(',').map(Number); if (reachable().some(n => n.row === row && n.lane === lane)) enterNode(row, lane); return; }
        if (t.closest('[data-boss]') && r.screen === 'map' && atTop()) { enterBoss(); return; }
        const card = t.closest('[data-card]'); if (card) { playCard(Number(card.dataset.card)); return; }
        const enemy = t.closest('[data-enemy]'); if (enemy) { const alive = aliveEnemies(); const e = r.combat.enemies[Number(enemy.dataset.enemy)]; const ai = alive.indexOf(e); if (ai >= 0) r.combat.target = ai; paint(); return; }
        const pot = t.closest('[data-pot]'); if (pot) { usePotion(Number(pot.dataset.pot)); return; }
        const pick = t.closest('[data-pick]'); if (pick) { const id = pick.dataset.pick.replace(/^p/, ''); const i = r.reward.cards.indexOf(id); chooseReward(i); return; }
        const buyc = t.closest('[data-buyc]'); if (buyc) { const id = buyc.dataset.buyc.replace(/^p/, ''); const i = r.shop.cards.findIndex(x => x.id === id); buy('card', i); return; }
        const buyp = t.closest('[data-buyp]'); if (buyp) { buy('pot', Number(buyp.dataset.i)); return; }
        const sm = t.closest('[data-smith]'); if (sm) { smith(Number(sm.dataset.smith)); return; }
        const ch = t.closest('[data-choice]'); if (ch) { eventChoice(Number(ch.dataset.choice)); return; }
        const rm = t.closest('[data-remove]'); if (rm) { removeCard(Number(rm.dataset.remove)); return; }
    }
    function refreshCheats() { root.querySelectorAll('[data-act="toggle"]').forEach(b => b.classList.toggle('on', cheats[b.dataset.cheat])); cheatDot.toggleAttribute('hidden', !Object.values(cheats).some(Boolean)); }
    function onKey(e) {
        if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
        const k = e.key;
        if (k === 'Escape') { ovCheats.setAttribute('hidden', ''); return; }
        if ((k === 'c' || k === 'C') && !online) { ovCheats.toggleAttribute('hidden'); refreshCheats(); return; }
        if (!S) return;
        if (S.mode === 'pvp') {
            if (k === 'Enter') { submit({ type: 'end' }); return; }
            const n = parseInt(k); if (n >= 1 && n <= 9) { const side = S.sides[mySeat()]; const uid = side.hand[n - 1]; if (uid) submit({ type: 'play', uid }); }
            return;
        }
        const r = S.run;
        if (r.screen === 'combat') {
            if (k === 'e' || k === 'E' || k === 'Enter') { endTurn(); return; }
            if (k === 'z' || k === 'Z') { usePotion(0); return; } if (k === 'x' || k === 'X') { usePotion(1); return; } if (k === 'v' || k === 'V') { usePotion(2); return; }
            const n = parseInt(k); if (n >= 1 && n <= 9) { const uid = r.combat.hand[n - 1]; if (uid) playCard(uid); }
        } else if (r.screen === 'map') {
            if (k === 'Enter' && atTop()) enterBoss();
        } else if (r.screen === 'rest') {
            if (k === '1') restHeal(); else if (k === '2') { r.rest.smith = true; paint(); }
        } else if (r.screen === 'reward') {
            const n = parseInt(k); if (n >= 1 && n <= 3) chooseReward(n - 1); else if (k === 'Enter') chooseReward(-1);
        } else if (r.screen === 'over' || r.screen === 'win') {
            if (k === 'Enter') startRun(r.asc);
        }
    }
    root.addEventListener('click', handleClick);
    document.addEventListener('keydown', onKey);

    /* ================= ROOM ================= */
    if (online) {
        const u0 = room.onRoom?.(n => { roomData = n; paint(); }); if (typeof u0 === 'function') unsubs.push(u0);
        if (isHost) {
            S = { mode: 'pvp', hostSeat, sides: null, active: 0, turn: 0, screen: 'start', winner: -1, log: '' };
            // show start screen for host too
            S.screen = 'start';
            const u1 = room.onAction?.(a => applyAction(a, 1 - hostSeat)); if (typeof u1 === 'function') unsubs.push(u1);
            publish();
        } else {
            const u2 = room.onState?.(ns => { if (!ns) return; S = ns; paint(); }); if (typeof u2 === 'function') unsubs.push(u2);
        }
    }
    // initial paint
    if (online && S && S.screen === 'start') { renderStart(); statusEl.textContent = 'Ready'; barEl.innerHTML = ''; }
    else paint();

    return { destroy() { timers.forEach(id => clearTimeout(id)); timers.clear(); document.removeEventListener('keydown', onKey); root.removeEventListener('click', handleClick); unsubs.forEach(u => { try { u(); } catch (_) { } }); } };
}