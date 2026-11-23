/* ==== GAME: one-page-quest.js ==== */
/*
 * ONE PAGE QUEST — adaptasi digital dari print-and-play karya Léandre Proust
 * (Grammes Édition). Solo roguelike: lempar 5 dadu, bentuk kombinasi ala
 * Yahtzee, kalikan STR x ACC untuk mengalahkan musuh, belanja ke tiga
 * merchant, hadapi 3 act (3 minion + 1 boss tiap act), lalu Endless Mode.
 *
 * Format: ESM — export META + mount(root, context).
 * Setelah menyalin/mengubah file ini jalankan:
 *   node tools/build-games-manifest.mjs
 */

export const META = {
    id: "one-page-quest", // harus sama dengan nama file (tanpa .js)
    name: "One Page Quest",
    category: "rpg",
    catLabel: "RPG",
    desc: "Solo dice roguelike: roll 5 dice, form Yahtzee-style combos, multiply STR x ACC to beat 3 acts of monsters, then go Endless.",
    art: '<svg viewBox="0 0 48 48" width="54" height="54" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="5" width="26" height="26" rx="6"/><circle cx="11" cy="12" r="1.7" fill="currentColor" stroke="none"/><circle cx="23" cy="12" r="1.7" fill="currentColor" stroke="none"/><circle cx="17" cy="18" r="1.7" fill="currentColor" stroke="none"/><circle cx="11" cy="24" r="1.7" fill="currentColor" stroke="none"/><circle cx="23" cy="24" r="1.7" fill="currentColor" stroke="none"/><path d="M31 19l3-3 12 12-3 3z"/><path d="M34 16l-2-2m4 0l3-3"/><path d="M27 31c-2 2-2 5 0 7s5 2 7 0-2-5 0-7-5-2-7 0z" fill="currentColor" fill-opacity=".25"/></svg>',
    bg: ["#fde68a", "#b45309"],
    bestKey: "onePageQuestBest",
};

/* ===================================================================== */
/* Data murni                                                             */
/* ===================================================================== */

const ICON = { str: "⚔", acc: "◎", gold: "🪙" };

const HEROES = [
    { id: "adventurer", name: "Adventurer", desc: "+1 reroll di setiap pertarungan.", perk: { reroll: 1 } },
    { id: "mercenary", name: "Mercenary", desc: "Mulai dengan +25 emas di purse.", perk: { gold: 25 } },
    { id: "hunter", name: "Hunter", desc: "+2 STR pada semua dadu.", perk: { str: 2 } },
    { id: "scholar", name: "Scholar", desc: "+2 ACC pada semua dadu.", perk: { acc: 2 } },
];

/* Nilai tiap wajah dadu: index 1..6 */
const FACE_BASE = [
    null,
    { str: 1, acc: 1, gold: 0 },
    { str: 2, acc: 1, gold: 0 },
    { str: 2, acc: 2, gold: 1 },
    { str: 3, acc: 2, gold: 1 },
    { str: 3, acc: 3, gold: 2 },
    { str: 4, acc: 3, gold: 3 },
];

/* Urutan sesuai papan: Pair, Two Pair, Three of a Kind, Party, Full House, Four, Five */
const COMBOS = [
    { id: "pair", name: "Pair", need: "2 sama", bonus: { str: 2, acc: 2, gold: 1 }, dice: 1 },
    { id: "twoPair", name: "Two Pair", need: "2 pasang", bonus: { str: 4, acc: 4, gold: 2 }, dice: 1 },
    { id: "three", name: "Three of a Kind", need: "3 sama", bonus: { str: 6, acc: 6, gold: 3 }, dice: 1 },
    { id: "party", name: "Party", need: "5 berbeda", bonus: { str: 8, acc: 8, gold: 4 }, dice: 1 },
    { id: "fullHouse", name: "Full House", need: "3 + 2", bonus: { str: 10, acc: 10, gold: 5 }, dice: 1 },
    { id: "four", name: "Four of a Kind", need: "4 sama", bonus: { str: 14, acc: 14, gold: 7 }, dice: 1 },
    { id: "five", name: "Five of a Kind", need: "5 sama", bonus: { str: 20, acc: 20, gold: 10 }, dice: 2 },
];

/* 12 equipment dari Wandering Trader. `fx` dipakai mesin skor. */
const EQUIPMENT = [
    { id: "ancient-ring", name: "Ancient Ring", cost: 15, text: "Efek Equipment Kumulatif menjadi 2x.", fx: "double" },
    { id: "boar-cloak", name: "Boar Cloak", cost: 12, text: "Akhir fight: +2 STR & +1 ACC pada kombinasi.", fx: "cloak" },
    { id: "boar-pauldrons", name: "Boar Pauldrons", cost: 12, text: "Jika kombinasi Pair: +1 Pair level.", fx: "pauldrons" },
    { id: "vulture-headdress", name: "Vulture Headdress", cost: 10, text: "+4 STR per dadu 6 di luar kombinasi.", fx: "headdress" },
    { id: "bear-belt", name: "Bear Belt", cost: 10, text: "+4 STR jika semua dadu kombinasi genap.", fx: "belt" },
    { id: "raven-gloves", name: "Raven Gloves", cost: 8, text: "Tiap kunjungan Scribe: +1 emas saat beli pertama.", fx: "gloves" },
    { id: "vulture-bracers", name: "Vulture Bracers", cost: 8, text: "+1 STR per dadu di luar kombinasi.", fx: "bracers" },
    { id: "tiger-breastplate", name: "Tiger Breastplate", cost: 6, text: "+15 STR jika semua dadu kombinasi ganjil.", fx: "tiger" },
    { id: "serpent-greaves", name: "Serpent Greaves", cost: 6, text: "Dadu 5 boleh dihitung sebagai 6.", fx: "serpent" },
    { id: "boar-boots", name: "Boar Boots", cost: 6, text: "Dengan Full House: +1 Full House level.", fx: "boots" },
    { id: "sylvan-pendant", name: "Sylvan Pendant", cost: 15, text: "+10 ACC jika ≥3 wajah bernilai >5.", fx: "pendant" },
    { id: "wolf-totem", name: "Wolf Totem", cost: 7, text: "+5 emas setiap kali menang fight.", fx: "totem" },
];

/* 12 potion/efek dari Apothecary. Semua dipakai saat fight, sekali pakai. */
const POTIONS = [
    { id: "amplified-vial", name: "Amplified Vial", cost: 9, text: "+1 STR pada semua wajah (permanen).", fx: { faceAll: { str: 1 } } },
    { id: "radiant-brew", name: "Radiant Brew", cost: 6, text: "+2 STR & +2 ACC pada 2 kombinasi terendah.", fx: { lowestCombos: 2, str: 2, acc: 2 } },
    { id: "cloudy-mixture", name: "Cloudy Mixture", cost: 3, text: "Lempar 1 dadu, tambahkan ke ACC fight ini.", fx: { rollAcc: 1 } },
    { id: "superior-philter", name: "Superior Philter", cost: 7, text: "Lempar 2 dadu, dapat emas = totalnya.", fx: { rollGold: 2 } },
    { id: "potent-potion", name: "Potent Potion", cost: 8, text: "+3 STR pada wajah 2, 4, dan 6 (permanen).", fx: { faceEven: { str: 3 } } },
    { id: "fleeting-elixir", name: "Fleeting Elixir", cost: 1, text: "+3 reroll pada fight berikutnya.", fx: { rerolls: 3 } },
    { id: "ancient-fragment", name: "Ancient Fragment", cost: 6, text: "Sisa reroll memberi +10 emas (biasanya +5).", fx: { rerollGold: 10 } },
    { id: "forbidden-enchantment", name: "Forbidden Enchantment", cost: 13, text: "Tiap nilai yang tidak muncul dapat +1 di wajahnya.", fx: { absentFaces: 1 } },
    { id: "ultimate-scroll", name: "Ultimate Scroll", cost: 16, text: "Skor fight ini x2.", fx: { scoreMult: 2 } },
    { id: "forgotten-vellum", name: "Forgotten Vellum", cost: 5, text: "+1 reroll sekarang & +8 emas.", fx: { rerolls: 1, gold: 8 } },
    { id: "primordial-roll", name: "Primordial Roll", cost: 15, text: "Lempar ulang kelima dadu sekali lagi (gratis).", fx: { freeRoll: true } },
    { id: "occult-seal", name: "Occult Seal", cost: 11, text: "+1 STR & +1 ACC pada semua kombinasi (permanen).", fx: { comboAll: { str: 1, acc: 1 } } },
];

/* 3 minion + 1 boss per act — 12 fight total. */
const ENEMIES = [
    { act: 1, name: "Spore Lurker", threshold: 25, boss: false, note: "Jamur pengintai." },
    { act: 1, name: "Mycelium Brute", threshold: 50, boss: false, note: "Badan spora yang tebal." },
    { act: 1, name: "Mushroom Herder", threshold: 75, boss: false, note: "Penggembala jamur." },
    { act: 1, name: "Mushroom Farm Escape", threshold: 150, boss: true, note: "Tanpa Critical Victory, turunkan 1 level tiap kombinasi." },
    { act: 2, name: "Siren's Suitor", threshold: 200, boss: false, note: "Wajah genap tidak memberi ACC." },
    { act: 2, name: "Coral Songstress", threshold: 300, boss: false, note: "Wajah genap tidak memberi ACC." },
    { act: 2, name: "Reef Chorus", threshold: 400, boss: false, note: "Wajah genap tidak memberi ACC." },
    { act: 2, name: "Siren's Irresistible Song", threshold: 600, boss: true, note: "Wajah genap tidak memberi ACC." },
    { act: 3, name: "Dragon Whelp", threshold: 800, boss: false, note: "Equipment mati atau bayar 40 emas." },
    { act: 3, name: "Hoard Keeper", threshold: 1100, boss: false, note: "Equipment mati atau bayar 40 emas." },
    { act: 3, name: "Cinder Wyrm", threshold: 1400, boss: false, note: "Equipment mati atau bayar 40 emas." },
    { act: 3, name: "Greedy Dragon's Covetousness", threshold: 2000, boss: true, note: "Equipment mati atau bayar 40 emas." },
];

const CHESTS = [
    { id: "swift", name: "Boots of Haste", text: "+1 reroll di semua fight.", fx: { reroll: 1 } },
    { id: "coinpurse", name: "Deep Purse", text: "+5 emas setiap kemenangan.", fx: { winGold: 5 } },
    { id: "iron", name: "Iron Dice", text: "+1 STR di semua wajah.", fx: { faceStr: 1 } },
    { id: "glass", name: "Glass Dice", text: "+1 ACC di semua wajah.", fx: { faceAcc: 1 } },
    { id: "tome", name: "Torn Tome", text: "+1 STR & +1 ACC di semua kombinasi.", fx: { combo: 1 } },
    { id: "lucky", name: "Lucky Coin", text: "+1 emas di semua wajah.", fx: { faceGold: 1 } },
    { id: "focus", name: "Hunter's Focus", text: "+8% pada skor kombinasi.", fx: { mult: 0.08 } },
];

const ACT_RULE = {
    1: "Tanpa Critical Victory, turunkan 1 level semua kombinasi.",
    2: "Wajah genap (2,4,6) tidak memberi ACC.",
    3: "Equipment mati fight ini, atau bayar 40 emas untuk mengaktifkannya.",
};

/* ===================================================================== */
/* Util & logika murni                                                    */
/* ===================================================================== */

const esc = (s) => String(s).replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
const rnd = (n) => 1 + Math.floor(Math.random() * n);
const sum = (a) => a.reduce((x, y) => x + y, 0);
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));

function freshFaces() {
    return FACE_BASE.map((v) => (v ? { ...v } : null));
}
function freshCombos() {
    return COMBOS.map((c) => ({ ...c.bonus }));
}

/* kombinasi terbaik dari dadu yang dipilih; index sesuai COMBOS, atau -1 */
function comboOf(values) {
    if (values.length < 2) return -1;
    const c = [0, 0, 0, 0, 0, 0, 0];
    for (const v of values) if (v >= 1 && v <= 6) c[v]++;
    const groups = c.filter(Boolean).sort((a, b) => b - a);
    if (groups[0] === 5) return 6;
    if (groups[0] === 4) return 5;
    if (groups[0] === 3 && groups[1] === 2) return 4;
    if (groups.length === 5) return 3;
    if (groups[0] === 3) return 2;
    if (groups[0] === 2 && groups[1] === 2) return 1;
    if (groups[0] === 2) return 0;
    return -1;
}

const hasChest = (s, id) => s.chests.includes(id);

function chestFx(s, key) {
    let v = 0;
    for (const id of s.chests) {
        const c = CHESTS.find((x) => x.id === id);
        if (c && c.fx[key] !== undefined) v += c.fx[key];
    }
    return v;
}

/* hitung skor dari dadu yang dipilih (index ke state.dice) */
function compute(state, chosen) {
    const equipOn = !state.equipDisabled;
    const has = (id) => equipOn && state.equipment.includes(id);
    let values = chosen.map((i) => {
        let v = state.dice[i].v;
        if (has("serpent-greaves") && v === 5) v = 6;
        return v;
    });
    const outside = state.dice.map((d, i) => ({ d, i })).filter((o) => !chosen.includes(o.i));
    const combo = comboOf(values);
    const cb = combo >= 0 ? { ...state.combos[combo] } : { str: 0, acc: 0, gold: 0 };

    let str = 0, acc = 0, gold = 0;
    for (const v of values) {
        const f = state.faces[v];
        str += f.str + chestFx(state, "faceStr") + (state.heroData.perk.str || 0);
        acc += (state.act === 2 && v % 2 === 0) ? 0 : f.acc + chestFx(state, "faceAcc") + (state.heroData.perk.acc || 0);
        gold += f.gold + chestFx(state, "faceGold");
    }

    if (combo >= 0) {
        str += cb.str + chestFx(state, "combo");
        acc += cb.acc + chestFx(state, "combo");
        gold += cb.gold;
    }
    if (state.temp && state.temp.rollAcc) acc += state.temp.rollAcc;
    if (has("boar-cloak")) { str += 2; acc += 1; }
    if (has("boar-pauldrons") && combo === 0) str += 2;
    if (has("boar-boots") && combo === 4) { str += 10; acc += 10; }
    if (has("vulture-headdress")) {
        for (const o of outside) if (o.d.v === 6) str += 4;
    }
    if (has("vulture-bracers")) str += outside.length;
    if (has("tiger-breastplate") && values.length && values.every((v) => v % 2 === 1)) str += 15;
    if (has("bear-belt") && values.length && values.every((v) => v % 2 === 0)) str += 4;
    if (has("sylvan-pendant")) {
        const strong = state.faces.slice(1).filter((f) => f.str + f.acc > 5).length;
        if (strong >= 3) acc += 10;
    }
    const mult = 1 + chestFx(state, "mult") + (state.temp.scoreMult ? state.temp.scoreMult - 1 : 0);
    if (has("ancient-ring")) { str = Math.round(str * 1.1); acc = Math.round(acc * 1.1); }
    str = Math.max(1, str);
    acc = Math.max(1, acc);
    const score = Math.round(str * acc * mult);
    return { combo, str, acc, gold, score, values };
}

/* ===================================================================== */
/* Modul                                                                  */
/* ===================================================================== */

export function mount(root, context = {}) {
    const { mode = "ai", onExit = () => {} } = context;
    let state = null;
    let best = 0;
    try { best = Number(localStorage.getItem(META.bestKey)) || 0; } catch (_) { /* ignore */ }

    const css = `
<style>
.opq-app{--opq-ink:#2b1d0e;--opq-paper:#fff8e7;--opq-line:#c9a227;--opq-red:#a33;--opq-green:#276749;--opq-gold:#b45309;font-family:system-ui,-apple-system,"Segoe UI",sans-serif;color:var(--opq-ink);max-width:980px;margin:0 auto;padding:14px;box-sizing:border-box}
.opq-app *{box-sizing:border-box}
.opq-app h2,.opq-app h3,.opq-app p{margin:0 0 8px}
.opq-app h2{font-size:1.5rem}
.opq-app h3{font-size:1rem;border-bottom:2px solid var(--opq-line);padding-bottom:4px;margin-bottom:10px}
.opq-top{display:flex;flex-wrap:wrap;align-items:center;gap:10px;justify-content:space-between;margin-bottom:10px}
.opq-stats{display:flex;flex-wrap:wrap;gap:8px;font-size:.85rem}
.opq-chip{background:var(--opq-paper);border:1px solid var(--opq-line);border-radius:999px;padding:3px 10px;font-weight:700}
.opq-panel{background:#fffdf6;border:2px solid var(--opq-line);border-radius:14px;padding:14px;min-height:240px;box-shadow:0 3px 0 rgba(0,0,0,.08)}
.opq-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:12px}
.opq-card{background:var(--opq-paper);border:1px solid #e0c98a;border-radius:10px;padding:12px}
.opq-card.sel{border-color:var(--opq-green);box-shadow:0 0 0 2px rgba(39,103,73,.25)}
.opq-btn{background:#b45309;color:#fff;border:0;border-radius:8px;padding:8px 14px;font-weight:700;font-size:.88rem;cursor:pointer;margin:3px 4px 3px 0}
.opq-btn:hover{filter:brightness(1.08)}
.opq-btn:disabled{opacity:.45;cursor:not-allowed}
.opq-btn.ghost{background:transparent;color:var(--opq-ink);border:1px solid var(--opq-line)}
.opq-btn.go{background:var(--opq-green)}
.opq-btn.small{padding:4px 8px;font-size:.78rem}
.opq-dice{display:flex;flex-wrap:wrap;gap:9px;margin:12px 0}
.opq-die{width:60px;height:60px;border-radius:12px;border:2px solid var(--opq-ink);background:#fff;display:grid;grid-template-columns:repeat(3,1fr);grid-template-rows:repeat(3,1fr);padding:6px;cursor:pointer;transition:transform .12s;user-select:none}
.opq-die .pip{width:7px;height:7px;border-radius:50%;background:var(--opq-ink);align-self:center;justify-self:center}
.opq-die.held{background:#fff2c9;border-color:var(--opq-gold);transform:translateY(-4px)}
.opq-die.used{background:#e7f5ec;border-color:var(--opq-green)}
.opq-die.assigned{opacity:.55;cursor:default}
.opq-die.rolling{animation:opq-spin .25s linear infinite}
@keyframes opq-spin{to{transform:rotate(12deg)}}
.opq-row{display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin:6px 0}
.opq-enemy{border-left:6px solid var(--opq-red);padding-left:10px}
.opq-big{font-size:1.7rem;font-weight:800}
.opq-win{color:var(--opq-green);font-weight:800}
.opq-lose{color:var(--opq-red);font-weight:800}
.opq-log{background:#fff8e7;border:1px dashed var(--opq-line);border-radius:8px;padding:8px 10px;font-size:.82rem;max-height:140px;overflow:auto;margin-top:10px}
.opq-log div{padding:1px 0}
.opq-tabs{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:10px}
.opq-list{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:8px}
.opq-item{border:1px solid #e0c98a;border-radius:8px;padding:8px 10px;background:#fffdf6;font-size:.82rem}
.opq-item b{display:block;font-size:.9rem}
.opq-item.owned{border-color:var(--opq-green);background:#eef8f1}
.opq-note{font-size:.8rem;opacity:.8}
.opq-warn{background:#fff1f0;border:1px solid #f5a3a3;color:#8a1c1c;padding:8px 10px;border-radius:8px;margin:8px 0}
.opq-table{width:100%;border-collapse:collapse;font-size:.8rem}
.opq-table th,.opq-table td{border:1px solid #e0c98a;padding:4px 6px;text-align:center}
</style>`;

    root.innerHTML = `<div class="opq-app">${css}
        <div class="opq-top">
            <div><h2>One Page Quest</h2><div class="opq-note">Solo dice roguelike · 5 dadu · 3 act</div></div>
            <div class="opq-stats" data-stats></div>
        </div>
        <section class="opq-panel" data-stage></section>
        <div class="opq-row"><button class="opq-btn ghost small" data-act="exit">Keluar</button><span class="opq-note" data-mode></span></div>
    </div>`;

    const elStats = root.querySelector("[data-stats]");
    const elStage = root.querySelector("[data-stage]");
    root.querySelector("[data-mode]").textContent = mode === "room" ? "Mode room (lokal)" : "Mode AI (solo)";
    root.querySelector('[data-act="exit"]').addEventListener("click", onExit);

    function saveBest() {
        if (state && state.lastScore > best) {
            best = state.lastScore;
            try { localStorage.setItem(META.bestKey, String(best)); } catch (_) { /* ignore */ }
        }
    }

    function log(msg) {
        state.log.unshift(msg);
        if (state.log.length > 40) state.log.length = 40;
    }

    function newGame(heroId, endless = false, carry = null) {
        const hero = HEROES.find((h) => h.id === heroId) || HEROES[0];
        state = {
            heroId: hero.id,
            heroData: hero,
            gold: (hero.perk.gold || 0) + (carry ? carry.gold : 0),
            fight: 0,
            faces: carry ? carry.faces : freshFaces(),
            combos: carry ? carry.combos : freshCombos(),
            equipment: carry ? [...carry.equipment] : [],
            potions: carry ? { ...carry.potions } : {},
            chests: carry ? [...carry.chests] : [],
            rerollExtra: (hero.perk.reroll || 0) + (carry ? carry.rerollExtra : 0),
            endless,
            multiplier: carry ? carry.multiplier : 1,
            phase: "fight",
            dice: [], rollsLeft: 0, chosen: [], held: [],
            shopDice: [], shopAssign: [], shopTab: "scribe",
            equipDisabled: false,
            log: [], lastScore: 0, result: null, cleared: 0,
        };
        if (carry) {
            state.fight = 4; // Endless mulai ulang dari Act 2 (index 4 = minion pertama Act 2)
            state.multiplier = (carry.multiplier || 1) * 10;
        }
        startFight();
    }

    function enemyNow() {
        const e = ENEMIES[state.fight];
        if (!e) return null;
        return { ...e, threshold: Math.round(e.threshold * state.multiplier) };
    }

    function startFight() {
        const e = enemyNow();
        if (!e) { finishRun(); return; }
        state.phase = "fight";
        state.act = e.act;
        state.dice = Array.from({ length: 5 }, () => ({ v: rnd(6) }));
        state.held = [false, false, false, false, false];
        state.chosen = [0, 1, 2, 3, 4];
        state.rollsLeft = 2 + state.rerollExtra + chestFx(state, "reroll");
        state.temp = { scoreMult: 0, rollAcc: 0, rollGold: 0, freeRoll: 0, rerollGold: 0 };
        state.equipDisabled = e.act === 3;
        state.result = null;
        log(`Fight ${state.fight + 1}/12 — ${e.name} (threshold ${e.threshold}).`);
    }

    function rollDice(all = false) {
        if (state.rollsLeft <= 0 && !all) return;
        if (!all) state.rollsLeft--;
        state.dice.forEach((d, i) => { if (all || !state.held[i]) d.v = rnd(6); });
        state.result = null;
        render();
    }

    function usePotion(id) {
        if (!state.potions[id]) return;
        const p = POTIONS.find((x) => x.id === id);
        if (!p) return;
        state.potions[id]--;
        if (!state.potions[id]) delete state.potions[id];
        const fx = p.fx;
        if (fx.faceAll) for (let v = 1; v <= 6; v++) for (const k in fx.faceAll) state.faces[v][k] += fx.faceAll[k];
        if (fx.faceEven) for (const v of [2, 4, 6]) for (const k in fx.faceEven) state.faces[v][k] += fx.faceEven[k];
        if (fx.comboAll) for (const c of state.combos) for (const k in fx.comboAll) c[k] += fx.comboAll[k];
        if (fx.lowestCombos) {
            const sorted = state.combos.map((c, i) => ({ c, i })).sort((a, b) => (a.c.str + a.c.acc) - (b.c.str + b.c.acc));
            for (let n = 0; n < fx.lowestCombos; n++) { sorted[n].c.str += fx.str; sorted[n].c.acc += fx.acc; }
        }
        if (fx.rerolls) state.rollsLeft += fx.rerolls;
        if (fx.gold) state.gold += fx.gold;
        if (fx.scoreMult) state.temp.scoreMult = fx.scoreMult;
        if (fx.rerollGold) state.temp.rerollGold = fx.rerollGold;
        if (fx.absentFaces) {
            const seen = new Set(state.dice.map((d) => d.v));
            for (let v = 1; v <= 6; v++) if (!seen.has(v)) state.faces[v].str += fx.absentFaces;
        }
        if (fx.rollAcc) { const r = rnd(6); state.temp.rollAcc += r; log(`${p.name}: dadu ${r} → +${r} ACC.`); }
        if (fx.rollGold) { const r = rnd(6) + rnd(6); state.temp.rollGold += r; log(`${p.name}: dadu ${r} → +${r} emas.`); }
        if (fx.freeRoll) { state.temp.freeRoll++; rollDice(true); return; }
        log(`Pakai ${p.name}.`);
        render();
    }

    function attack() {
        const e = enemyNow();
        if (!e) return;
        if (!state.chosen.length) { log("Pilih minimal 2 dadu untuk kombinasi."); render(); return; }
        const r = compute(state, state.chosen);
        const score = r.score;
        state.lastScore = score;
        saveBest();
        const win = score > e.threshold;
        const critical = win && score >= e.threshold * 2;
        let goldGain = r.gold + state.temp.rollGold + (win ? state.rollsLeft * (state.temp.rerollGold || 5) : 0);
        if (win) goldGain += chestFx(state, "winGold") + (state.equipment.includes("wolf-totem") && !state.equipDisabled ? 5 : 0);
        state.gold += goldGain;

        if (win) {
            state.result = { win, critical, score, threshold: e.threshold, gold: goldGain, combo: r.combo, str: r.str, acc: r.acc };
            log(`${critical ? "CRITICAL VICTORY" : "Victory"}! ${score} > ${e.threshold}. +${goldGain} emas.`);
            if (e.act === 1 && !critical) {
                for (const c of state.combos) { c.str = Math.max(0, c.str - 1); c.acc = Math.max(0, c.acc - 1); }
                log("Act 1: tanpa Critical Victory, semua kombinasi turun 1 level.");
            }
            if (critical) grantChest();
            state.cleared++;
            openShop(critical, e.boss);
        } else {
            const consolation = Math.floor(r.gold / 2);
            state.gold += consolation;
            state.result = { win, critical: false, score, threshold: e.threshold, gold: consolation, combo: r.combo, str: r.str, acc: r.acc };
            log(`Kalah. ${score} ≤ ${e.threshold}. +${consolation} emas konsolasi.`);
            if (e.boss) finishRun(false);
        }
    }

    function grantChest() {
        const pool = CHESTS.filter((c) => !state.chests.includes(c.id));
        if (!pool.length) { state.gold += 30; log("Semua chest sudah didapat → +30 emas."); return; }
        const c = pool[Math.floor(Math.random() * pool.length)];
        state.chests.push(c.id);
        if (c.fx.reroll) state.rerollExtra += c.fx.reroll;
        log(`Chest: ${c.name} — ${c.text}`);
    }

    function openShop(critical, boss) {
        state.phase = "shop";
        state.shopDice = Array.from({ length: 3 + (critical ? 1 : 0) + (boss ? 1 : 0) }, () => rnd(6));
        state.shopAssign = state.shopDice.map(() => null);
        state.shopTab = "scribe";
        state.boughtFirst = false;
        log(`Merchant: ${state.shopDice.length} dadu belanja. Tempel ke slot untuk membeli.`);
    }

    function nextFight() {
        saveBest();
        state.fight++;
        if (state.fight >= ENEMIES.length) { finishRun(true); return; }
        startFight();
    }

    function finishRun(won = true) {
        saveBest();
        state.phase = "end";
        state.won = won;
        log(won ? "Quest selesai! Act 3 dikalahkan." : "Quest berakhir — boss mengalahkanmu.");
    }

    function assignDie(i, target) {
        if (state.shopAssign[i]) return false;
        state.shopAssign[i] = target;
        return true;
    }

    function freeDiceOfValue(v, count = 1) {
        const idx = [];
        for (let i = 0; i < state.shopDice.length; i++) {
            if (!state.shopAssign[i] && (v === 0 || state.shopDice[i] === v)) idx.push(i);
            if (idx.length === count) break;
        }
        return idx.length === count ? idx : null;
    }

    function costWithGloves(cost) {
        if (state.equipment.includes("raven-gloves") && !state.boughtFirst) { state.boughtFirst = true; return Math.max(0, cost - 1); }
        return cost;
    }

    function buyFace(v) {
        const idx = freeDiceOfValue(v);
        const base = 5 + v * 3;
        if (!idx || state.gold < base) { log("Gagal: butuh dadu yang cocok & emas cukup."); render(); return; }
        const cost = costWithGloves(base);
        state.shopAssign[idx[0]] = `face${v}`;
        state.gold -= cost;
        state.faces[v].str += 3; state.faces[v].acc += 3; state.faces[v].gold += 1;
        log(`Scribe: wajah ${v} ditingkatkan (−${cost} emas).`);
        render();
    }

    function buyCombo(i) {
        const c = COMBOS[i];
        const idx = freeDiceOfValue(i === 6 ? 0 : i + 1, c.dice);
        const base = 8 + i * 6;
        if (!idx || state.gold < base) { log("Gagal: butuh dadu yang cocok & emas cukup."); render(); return; }
        const cost = costWithGloves(base);
        idx.forEach((n) => { state.shopAssign[n] = `combo${i}`; });
        state.gold -= cost;
        state.combos[i].str += 4; state.combos[i].acc += 4; state.combos[i].gold += 1;
        log(`Apothecary: ${c.name} ditingkatkan (−${cost} emas).`);
        render();
    }

    function buyEquipment(id) {
        const it = EQUIPMENT.find((x) => x.id === id);
        if (!it || state.equipment.includes(id)) return;
        const idx = freeDiceOfValue(0, 2);
        if (!idx || state.gold < it.cost) { log("Gagal: butuh 2 dadu & emas cukup."); render(); return; }
        const cost = costWithGloves(it.cost);
        idx.forEach((n) => { state.shopAssign[n] = `equip:${id}`; });
        state.gold -= cost;
        state.equipment.push(id);
        log(`Trader: ${it.name} dibeli (−${cost} emas).`);
        render();
    }

    function buyPotion(id) {
        const it = POTIONS.find((x) => x.id === id);
        if (!it) return;
        const idx = freeDiceOfValue(0);
        if (!idx || state.gold < it.cost) { log("Gagal: butuh 1 dadu & emas cukup."); render(); return; }
        const cost = costWithGloves(it.cost);
        state.shopAssign[idx[0]] = `potion:${id}`;
        state.gold -= cost;
        state.potions[id] = (state.potions[id] || 0) + 1;
        log(`Apothecary: ${it.name} dibeli (−${cost} emas).`);
        render();
    }

    /* ---------------- render ---------------- */

    function renderStats() {
        const e = enemyNow();
        elStats.innerHTML = [
            `<span class="opq-chip">Act ${e && e.act ? e.act : (state.multiplier > 1 ? 2 : 3)}</span>`,
            `<span class="opq-chip">Fight ${Math.min(state.fight + 1, 12)}/12</span>`,
            `<span class="opq-chip">🪙 ${state.gold}</span>`,
            `<span class="opq-chip">Best ${best}</span>`,
            state.multiplier > 1 ? `<span class="opq-chip">Endless x${state.multiplier}</span>` : "",
        ].join("");
    }

    function dieHTML(v, cls = "") {
        const P = { 0: [], 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };
        let pips = "";
        for (let i = 0; i < 9; i++) pips += `<span class="pip" style="${P[v] && P[v].includes(i) ? "" : "visibility:hidden"}"></span>`;
        return `<div class="opq-die${cls ? " " + cls : ""}"${cls && cls.includes("assigned") ? ' aria-disabled="true"' : ""}>${pips}</div>`;
    }

    function renderSetup() {
        elStage.innerHTML = `<h3>Pilih pahlawan</h3>
            <div class="opq-grid">${HEROES.map((h) => `<div class="opq-card"><b>${esc(h.name)}</b><p class="opq-note">${esc(h.desc)}</p><button class="opq-btn go small" data-act="start" data-hero="${h.id}">Mulai</button></div>`).join("")}</div>
            <div class="opq-note" style="margin-top:12px">Cara main: lempar 5 dadu, pilih dadu yang dipakai (minimal 2), bentuk kombinasi, lalu <b>STR × ACC</b> harus lebih besar dari threshold musuh. Menang ≥2× threshold = Critical Victory + chest. Sisa reroll jadi emas. Setelah fight, tempel dadu ke merchant untuk upgrade.</div>`;
    }

    function renderFight() {
        const e = enemyNow();
        const r = compute(state, state.chosen);
        const comboName = r.combo >= 0 ? COMBOS[r.combo].name : "—";
        const resultHTML = state.result ? `<div class="${state.result.win ? "opq-win" : "opq-lose"}" style="margin:10px 0">
            ${state.result.win ? (state.result.critical ? "★ CRITICAL VICTORY" : "✔ VICTORY") : "✖ DEFEAT"} — skor ${state.result.score} vs ${state.result.threshold} · +${state.result.gold} emas
            ${state.result.win ? '<button class="opq-btn go" data-act="next">Lanjut ke merchant →</button>' : (e.boss ? '<button class="opq-btn" data-act="restart">Main lagi</button>' : '<button class="opq-btn go" data-act="retry">Coba lagi</button>')}
        </div>` : "";
        elStage.innerHTML = `
            <div class="opq-row opq-enemy"><div><b>${esc(e.name)}</b> ${e.boss ? "· BOSS" : "· minion"}<div class="opq-note">${esc(e.note)}</div></div>
                <div style="margin-left:auto"><span class="opq-note">Threshold</span><div class="opq-big">${e.threshold}</div></div></div>
            ${e.act === 1 ? `<div class="opq-warn">Act 1: ${esc(ACT_RULE[1])}</div>` : ""}
            ${e.act === 2 ? `<div class="opq-warn">Act 2: ${esc(ACT_RULE[2])}</div>` : ""}
            ${e.act === 3 ? `<div class="opq-warn">Act 3: ${esc(ACT_RULE[3])} equipment ${state.equipDisabled ? "MATI fight ini" : "aktif"}. ${state.equipDisabled ? '<button class="opq-btn small" data-act="pay">Bayar 40 emas</button>' : ""}</div>` : ""}
            <h3 style="margin-top:10px">Dadu (klik: pakai / tahan)</h3>
            <div class="opq-dice">${state.dice.map((d, i) => dieHTML(d.v, [state.chosen.includes(i) ? "used" : "", state.held[i] ? "held" : ""].filter(Boolean).join(" "))).join("")}</div>
            <div class="opq-row">
                <button class="opq-btn" data-act="roll" ${state.rollsLeft <= 0 ? "disabled" : ""}>Lempar ulang (${state.rollsLeft})</button>
                <span class="opq-note">Klik dadu = pilih untuk kombinasi · klik kanan = tahan untuk reroll</span>
            </div>
            <div class="opq-grid" style="margin-top:10px">
                <div class="opq-card"><h3>Kombinasi</h3><div class="opq-big">${esc(comboName)}</div><div class="opq-note">${r.combo >= 0 ? COMBOS[r.combo].need : "pilih minimal 2 dadu"}</div></div>
                <div class="opq-card"><h3>Skor</h3><div class="opq-big">${r.str} <span style="font-size:1rem">× ${r.acc}</span></div><div class="opq-note">STR × ACC = <b>${r.score}</b> · +${r.gold} 🪙</div></div>
                <div class="opq-card"><h3>Potion</h3><div class="opq-row">${Object.keys(state.potions).length ? Object.entries(state.potions).map(([id, n]) => { const p = POTIONS.find((x) => x.id === id); return `<button class="opq-btn small" data-act="potion" data-id="${id}">${esc(p.name)} ×${n}</button>`; }).join("") : '<span class="opq-note">Tidak ada potion.</span>'}</div></div>
            </div>
            ${resultHTML}
            ${state.result ? "" : '<div style="margin-top:12px"><button class="opq-btn go" data-act="attack">Serang!</button></div>'}
            ${state.chests.length ? `<div class="opq-note" style="margin-top:8px">Chest: ${state.chests.map((id) => esc(CHESTS.find((c) => c.id === id).name)).join(", ")}</div>` : ""}
            <div class="opq-log">${state.log.map((l) => `<div>${esc(l)}</div>`).join("")}</div>`;
    }

    function renderShop() {
        const diceHTML = state.shopDice.map((v, i) => dieHTML(v, state.shopAssign[i] ? "assigned" : "")).join("");
        let body = "";
        if (state.shopTab === "scribe") {
            body = `<p class="opq-note">Tempel dadu dengan nilai yang sama ke wajah itu. +3 STR, +3 ACC, +1 emas per upgrade.</p>
                <div class="opq-list">${[1, 2, 3, 4, 5, 6].map((v) => `<div class="opq-item"><b>Wajah ${v}</b>${ICON.str}${state.faces[v].str} · ${ICON.acc}${state.faces[v].acc} · ${ICON.gold}${state.faces[v].gold}<br><button class="opq-btn small" data-act="buy-face" data-v="${v}">Upgrade (${5 + v * 3} 🪙)</button></div>`).join("")}</div>`;
        } else if (state.shopTab === "apothecary") {
            body = `<p class="opq-note">Tempel dadu bernilai 1–6 ke kombinasi 1–6. Five of a Kind butuh 2 dadu bebas.</p>
                <div class="opq-list">${COMBOS.map((c, i) => `<div class="opq-item"><b>${esc(c.name)}</b>${c.need}<br>${ICON.str}${state.combos[i].str} · ${ICON.acc}${state.combos[i].acc}<br><button class="opq-btn small" data-act="buy-combo" data-i="${i}">Upgrade (${8 + i * 6} 🪙)</button></div>`).join("")}</div>
                <h3 style="margin-top:12px">Potion</h3>
                <div class="opq-list">${POTIONS.map((p) => `<div class="opq-item"><b>${esc(p.name)}</b>${esc(p.text)}<br><button class="opq-btn small" data-act="buy-potion" data-id="${p.id}" ${state.gold < p.cost ? "disabled" : ""}>Beli (${p.cost} 🪙)</button></div>`).join("")}</div>`;
        } else {
            body = `<p class="opq-note">Butuh 2 dadu bebas untuk membeli equipment. Efek langsung aktif.</p>
                <div class="opq-list">${EQUIPMENT.map((it) => `<div class="opq-item ${state.equipment.includes(it.id) ? "owned" : ""}"><b>${esc(it.name)}</b>${esc(it.text)}<br><button class="opq-btn small" data-act="buy-equip" data-id="${it.id}" ${state.equipment.includes(it.id) || state.gold < it.cost ? "disabled" : ""}>${state.equipment.includes(it.id) ? "Dimiliki" : `Beli (${it.cost} 🪙)`}</button></div>`).join("")}</div>`;
        }
        elStage.innerHTML = `<h3>Merchant — ${state.gold} 🪙</h3>
            <div class="opq-dice">${diceHTML}</div>
            <div class="opq-tabs">
                <button class="opq-btn small ${state.shopTab === "scribe" ? "go" : "ghost"}" data-act="tab" data-tab="scribe">Faceless Scribe</button>
                <button class="opq-btn small ${state.shopTab === "apothecary" ? "go" : "ghost"}" data-act="tab" data-tab="apothecary">Apothecary</button>
                <button class="opq-btn small ${state.shopTab === "trader" ? "go" : "ghost"}" data-act="tab" data-tab="trader">Wandering Trader</button>
            </div>
            ${body}
            <div style="margin-top:12px"><button class="opq-btn go" data-act="next">Lanjut fight berikutnya →</button></div>
            <div class="opq-log">${state.log.map((l) => `<div>${esc(l)}</div>`).join("")}</div>`;
    }

    function renderEnd() {
        elStage.innerHTML = `<h3>${state.won ? "Quest Selesai! 🎉" : "Quest Berakhir"}</h3>
            <p>Fight dikalahkan: ${state.cleared}/12 · Emas: ${state.gold} · Skor terbaik: ${best}</p>
            <p class="opq-note">${state.won ? "Act 3 berhasil ditaklukkan. Lanjut ke Endless Mode (mulai Act 2, threshold ×10) atau mulai quest baru." : "Kalah melawan boss. Coba pahlawan dan strategi lain."}</p>
            <div class="opq-row">
                ${state.won ? '<button class="opq-btn go" data-act="endless">Endless Mode</button>' : ""}
                <button class="opq-btn" data-act="restart">Quest baru</button>
            </div>
            <div class="opq-log">${state.log.map((l) => `<div>${esc(l)}</div>`).join("")}</div>`;
    }

    function render() {
        if (!state) { elStage.innerHTML = ""; return; }
        renderStats();
        if (state.phase === "fight") renderFight();
        else if (state.phase === "shop") renderShop();
        else if (state.phase === "end") renderEnd();
    }

    /* ---------------- events ---------------- */

    function onClick(ev) {
        const t = ev.target.closest("[data-act]");
        if (!t) return;
        const act = t.dataset.act;
        if (act === "exit") { onExit(); return; }
        if (act === "start") { newGame(t.dataset.hero); render(); return; }
        if (act === "restart") { state = null; renderSetup(); return; }
        if (act === "endless") {
            newGame(state.heroId, true, {
                gold: Math.floor(state.gold / 2), faces: state.faces, combos: state.combos,
                equipment: state.equipment, potions: state.potions, chests: state.chests,
                rerollExtra: state.rerollExtra, multiplier: state.multiplier,
            });
            render(); return;
        }
        if (act === "retry") { startFight(); render(); return; }
        if (act === "roll") { rollDice(); return; }
        if (act === "attack") { attack(); render(); return; }
        if (act === "next") { nextFight(); render(); return; }
        if (act === "pay") {
            if (state.gold >= 40) { state.gold -= 40; state.equipDisabled = false; log("Bayar 40 emas — equipment aktif."); }
            else log("Emas tidak cukup untuk membayar 40.");
            render(); return;
        }
        if (act === "potion") { usePotion(t.dataset.id); return; }
        if (act === "tab") { state.shopTab = t.dataset.tab; render(); return; }
        if (act === "buy-face") { buyFace(Number(t.dataset.v)); return; }
        if (act === "buy-combo") { buyCombo(Number(t.dataset.i)); return; }
        if (act === "buy-equip") { buyEquipment(t.dataset.id); return; }
        if (act === "buy-potion") { buyPotion(t.dataset.id); return; }
    }

    function onDiceClick(ev) {
        const die = ev.target.closest(".opq-die");
        if (!die) return;
        if (state.phase !== "fight") return;
        const diceWrap = root.querySelector(".opq-dice");
        const i = [...diceWrap.children].indexOf(die);
        if (i < 0) return;
        if (ev.button === 2 || ev.shiftKey) {
            state.held[i] = !state.held[i];
        } else {
            const at = state.chosen.indexOf(i);
            if (at >= 0) state.chosen.splice(at, 1);
            else state.chosen.push(i);
            state.result = null;
        }
        render();
    }

    function onContext(ev) {
        if (ev.target.closest(".opq-die") && state && state.phase === "fight") ev.preventDefault();
    }

    root.addEventListener("click", onClick);
    root.addEventListener("click", onDiceClick);
    root.addEventListener("contextmenu", onContext);

    renderSetup();

    return {
        destroy() {
            root.removeEventListener("click", onClick);
            root.removeEventListener("click", onDiceClick);
            root.removeEventListener("contextmenu", onContext);
            saveBest();
        },
    };
}
