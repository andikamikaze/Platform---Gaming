/* ==== GAME: word-chain.js ==== */

/*
  WORD CHAIN — turn-based word linking game.
  - Format template baru: export META + export mount(root, context).
  - Mode "ai"  : vs Bot (lokal, tanpa room).
  - Mode "room": 2 pemain, host-authoritative (hanya host menulis state).
  - Level acak DIJAMIN punya solusi 8 kata (DFS saat generate).
  - Giliran & posisi pemain diacak (coin toss + seat shuffle).
*/

export const META = {
    id: "word-chain", // harus sama dengan nama file (tanpa .js)
    name: "Word Chain",
    category: "words",
    catLabel: "Word",
    desc: "Take turns linking words head-to-tail. Complete the 8-word chain and outscore your rival.",
    art: '<svg viewBox="0 0 48 48" width="54" height="54" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="17" width="12" height="15" rx="3"/><rect x="32" y="17" width="12" height="15" rx="3"/><path d="M16 24.5h3.4"/><circle cx="23" cy="24.5" r="2.1"/><circle cx="28.6" cy="24.5" r="2.1"/><path d="M31.9 24.5h.1"/></svg>',
    bg: ["#e0e7ff", "#a5b4fc"],
    bestKey: "wordChainBest",
};

/* ================= pure logic (module scope, dibagikan antar instance) ================= */

const CHAIN_TARGET = 8;   // total kata dalam rantai (termasuk kata awal)
const TURN_MS = 20000;    // waktu per giliran (menggantikan timer global 60s)
const SKIPS = 2;          // skip per pemain per ronde
const MIN_LEN = 3;
const MAX_LEN = 12;

const STARTS = ["APPLE", "TIGER", "MUSIC", "BREAD", "LEMON", "OCEAN", "SUGAR", "NIGHT"];

const DICT = ["ABLE", "ACORN", "ACTOR", "ADAPT", "AFTER", "AGENT", "ANGEL", "ANKLE", "APPLE", "APRON", "ARENA", "ARGUE", "ARISE", "ARMOR", "AROMA", "ARRAY", "ARROW", "ATLAS", "AUDIO", "AVOID", "AWAKE", "AWARD", "BADGE", "BAKER", "BANANA", "BANJO", "BARGE", "BEACH", "BENCH", "BERRY", "BLAZE", "BLISS", "BOARD", "BONUS", "BRAVE", "BREAD", "BRICK", "BROOM", "BUDGE", "BUNCH", "CABIN", "CABLE", "CACTUS", "CANDLE", "CANOE", "CARGO", "CAROL", "CHAIR", "CHALK", "CHARM", "CHESS", "CHIME", "CLOUD", "CLOVER", "COMET", "CORAL", "CRANE", "CRISP", "CRUST", "CUPID", "DAIRY", "DAISY", "DANCE", "DAWN", "DECAY", "DECOR", "DELTA", "DENSE", "DIARY", "DIGIT", "DINNER", "DODGE", "DONOR", "DOUGH", "EAGER", "EAGLE", "EARTH", "ECHO", "EDGE", "ELBOW", "ELDER", "EMPTY", "ENEMY", "ENJOY", "EQUAL", "ERUPT", "ESSAY", "EVENT", "EXTRA", "FABLE", "FAIRY", "FEAST", "FENCE", "FERRY", "FETCH", "FIBER", "FLAME", "FLEET", "FLINT", "FLOAT", "FLOUR", "FLUTE", "FOCUS", "FORGE", "FROST", "FUDGE", "FUNGI", "GARLIC", "GENTLE", "GIANT", "GLASS", "GLOBE", "GRAIN", "GRAPE", "GRAVE", "GRAVY", "GREED", "GRILL", "GROVE", "GROWL", "GUEST", "HALO", "HATCH", "HAVEN", "HAZEL", "HELM", "HINGE", "HONOR", "HORDE", "HOUSE", "HUMID", "HURRY", "ICED", "IDEA", "IDLE", "IGLOO", "IMAGE", "INDEX", "INPUT", "IRIS", "IRON", "IVORY", "JELLY", "JEWEL", "JOLLY", "JUDGE", "JUICE", "JUMBO", "KAYAK", "KETTLE", "KIOSK", "KNEEL", "KNIFE", "KOALA", "LABEL", "LADDER", "LAGOON", "LATTE", "LAUGH", "LAYER", "LEDGE", "LEMON", "LIGHT", "LILAC", "LINEN", "LODGE", "LOGIC", "LOYAL", "LUNCH", "LYRIC", "MANGO", "MAPLE", "MARSH", "MEDAL", "MELON", "MERCY", "MERGE", "MINOR", "MODEL", "MOIST", "MOTEL", "MOUNT", "MOUSE", "MUSIC", "MUSTY", "NAPKIN", "NICHE", "NIGHT", "NOBLE", "NOISE", "NORTH", "NUDGE", "NUMBER", "OASIS", "OBEY", "OCEAN", "OFFER", "OLIVE", "ONION", "ORBIT", "ORGAN", "OTTER", "OUNCE", "OVAL", "OVEN", "OWNER", "PANDA", "PANIC", "PAPER", "PARKA", "PARTY", "PASTA", "PATCH", "PEARL", "PEDAL", "PIANO", "PITCH", "PIVOT", "PIXEL", "PLAZA", "PLUCK", "POUCH", "POUND", "PRIZE", "PULSE", "PUPIL", "PUNCH", "QUAIL", "QUEST", "QUICK", "QUIET", "QUOTA", "QUOTE", "RABBIT", "RADAR", "RALLY", "RANCH", "RAPID", "RATIO", "RAVEN", "REACT", "REBEL", "REIGN", "RELAX", "RELAY", "REPLY", "RHYME", "RIDER", "RIFLE", "RINSE", "ROBIN", "ROBOT", "RODEO", "ROUND", "RUGBY", "RULER", "RUMOR", "SADDLE", "SALSA", "SAUCE", "SCARF", "SCENE", "SCOUT", "SEDAN", "SHACK", "SHELF", "SHINE", "SHRUB", "SIEGE", "SIREN", "SKATE", "SKIRT", "SLICE", "SLOPE", "SMASH", "SNACK", "SNAIL", "SOLAR", "SPARK", "SPICE", "SPIKE", "SPOON", "SQUAD", "STAGE", "STEAM", "STOVE", "SUGAR", "SUITE", "SWAMP", "SWORD", "SYRUP", "TABLE", "TANGO", "TEACH", "TEMPO", "TENOR", "THEFT", "THORN", "TIARA", "TIGER", "TIMBER", "TOAST", "TOKEN", "TOMATO", "TORCH", "TOTAL", "TOWEL", "TOXIC", "TRACK", "TRAIL", "TRIBE", "TRUCE", "TRUCK", "TRUST", "TRUTH", "TULIP", "TUNIC", "TURBO", "TUTOR", "TWIST", "UDDER", "ULCER", "UNCLE", "UNDER", "UNITE", "URBAN", "USUAL", "UTTER", "VAGUE", "VALVE", "VAPOR", "VENOM", "VERSE", "VIGOR", "VIRUS", "VISIT", "VODKA", "VOTER", "VOWEL", "WAFER", "WAGON", "WALTZ", "WATCH", "WATER", "WHISK", "WIDOW", "WINDOW", "WISDOM", "WOMAN", "WORTH", "YACHT", "YIELD", "YOUNG", "YOUTH", "XENON", "XYLEM", "ZEBRA", "ZONE", "ZOOM"];

const DICT_SET = new Set(DICT);
const BY_FIRST = {};
for (const w of DICT) {
    const k = w.charAt(0);
    (BY_FIRST[k] = BY_FIRST[k] || []).push(w);
}

const lastLetter = (w) => w.charAt(w.length - 1);
const linkOk = (prev, next) => lastLetter(prev) === next.charAt(0);
const sanitize = (s) => String(s || "").toUpperCase().replace(/[^A-Z]/g, "").slice(0, MAX_LEN);
const cleanName = (s) => String(s || "").replace(/\s+/g, " ").trim().slice(0, 16);
const randOf = (a) => a[Math.floor(Math.random() * a.length)];

function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
}

/* kandidat kata valid untuk lanjutan rantai (belum dipakai, huruf nyambung) */
function candidates(chain) {
    if (!chain.length) return [];
    const used = new Set(chain);
    const list = BY_FIRST[lastLetter(chain[chain.length - 1])] || [];
    return list.filter((w) => !used.has(w));
}

function canPlay(chain, word) {
    if (!word || word.length < MIN_LEN) return { ok: false, reason: "short" };
    const prev = chain[chain.length - 1];
    if (prev && !linkOk(prev, word)) return { ok: false, reason: "link" };
    if (!DICT_SET.has(word)) return { ok: false, reason: "dict" };
    if (chain.indexOf(word) >= 0) return { ok: false, reason: "used" };
    return { ok: true, reason: "" };
}

function missText(chain, word, reason) {
    if (reason === "short") return '"' + word + '" needs at least ' + MIN_LEN + " letters.";
    if (reason === "link") return '"' + word + '" must start with "' + lastLetter(chain[chain.length - 1]) + '".';
    if (reason === "dict") return '"' + word + '" is not in the word list.';
    return '"' + word + '" is already in the chain.';
}

/* DFS dengan budget node: cari rantai penuh dari kata awal (generator level) */
function findPath(start, target) {
    const path = [start];
    const used = new Set(path);
    let budget = 20000;
    const dfs = () => {
        if (path.length >= target) return true;
        if (budget-- <= 0) return false;
        const opts = shuffle((BY_FIRST[lastLetter(path[path.length - 1])] || []).filter((w) => !used.has(w)));
        for (const w of opts) {
            used.add(w); path.push(w);
            if (dfs()) return true;
            path.pop(); used.delete(w);
            if (budget <= 0) return false;
        }
        return false;
    };
    return dfs() ? path : null;
}

/* apakah rantai saat ini masih bisa diselesaikan sampai target? (hint & bot) */
function canFinish(chain, target) {
    target = target || CHAIN_TARGET;
    if (chain.length >= target) return true;
    const path = chain.slice();
    const used = new Set(path);
    let budget = 4000;
    const dfs = () => {
        if (path.length >= target) return true;
        if (budget-- <= 0) return false;
        const opts = (BY_FIRST[lastLetter(path[path.length - 1])] || []).filter((w) => !used.has(w));
        for (const w of opts) {
            used.add(w); path.push(w);
            if (dfs()) return true;
            path.pop(); used.delete(w);
            if (budget <= 0) return false;
        }
        return false;
    };
    return dfs();
}

/* kata terbaik berikutnya: deterministik (alfabetis) + dijamin tidak menemui jalan buntu */
function bestNext(chain) {
    const cands = candidates(chain);
    if (!cands.length) return null;
    for (const w of cands) if (canFinish(chain.concat(w))) return w;
    return cands[0];
}

/* RANDOM LEVEL GENERATOR — hanya menerima kata awal yang terbukti punya solusi penuh */
function generateLevel() {
    const id = 1000 + Math.floor(Math.random() * 9000);
    for (const s of shuffle(STARTS)) if (findPath(s, CHAIN_TARGET)) return { id, start: s };
    for (const s of shuffle(DICT)) if (findPath(s, CHAIN_TARGET)) return { id, start: s };
    return { id, start: "APPLE" }; // fallback yang sudah terbukti solvable
}

/* hint progresif: salah 2x -> 2 huruf terbuka, salah 3x -> 3 huruf, dst. */
function hintFor(chain, misses) {
    const w = bestNext(chain);
    if (!w) return "No valid link exists from here.";
    const reveal = Math.max(1, Math.min(misses, w.length - 1));
    return "Hint: " + w.slice(0, reveal) + "\u2022".repeat(w.length - reveal) + "  (" + w.length + " letters)";
}

/* ================= mount ================= */

export function mount(root, context = {}) {
    const { mode = "ai", room = null, playerName = "Player", onExit = () => { } } = context;
    const online = mode === "room" && Boolean(room);
    let roomData = room?.room || null;
    let state = null;
    let destroyed = false;

    /* Posisi pemain TIDAK fixed: di room, host mengacak seat (state.seats),
       lalu tiap client menurunkan indeksnya sendiri dari state. */
    function myIndex() {
        if (!online) return 0;
        if (!state || !state.seats) return room.isHost ? 0 : 1;
        return room.isHost ? state.seats.host : state.seats.guest;
    }

    const coarse = typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches;
    let kbOpen = coarse;          // keyboard virtual otomatis aktif di perangkat sentuh
    let openPanel = null;         // null | "help" | "cheats"
    let reveal = null;            // cheat reveal lokal: { round, len, word }
    let hintCache = { key: "", text: "" };
    let prevYourTurn = false;
    let botTimer = null, botToken = "";
    let best = 0;
    try { best = parseInt(localStorage.getItem(META.bestKey), 10) || 0; } catch (e) { /* abaikan */ }

    /* ---------- markup (minimalis, semua style di-scope ke .wc-app) ---------- */

    const CHEVRON = '<svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 1.5l5 4.5-5 4.5"/></svg>';
    const BACK_ICON = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 5h11a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H9L3 12l6-7z"/><path d="M12.5 9.5l5 5M17.5 9.5l-5 5"/></svg>';

    const kbHtml = ["QWERTYUIOP", "ASDFGHJKL", "ZXCVBNM"].map((row, i) => {
        const keys = row.split("").map((k) =>
            '<button type="button" class="wc-key" data-key="' + k + '">' + k + "</button>"
        ).join("");
        const back = i === 2 ? '<button type="button" class="wc-key wc-wide" data-key="back" aria-label="Backspace">' + BACK_ICON + "</button>" : "";
        const enter = i === 2 ? '<button type="button" class="wc-key wc-wide wc-go" data-key="enter">Add</button>' : "";
        return '<div class="wc-kbrow">' + back + keys + enter + "</div>";
    }).join("");

    root.innerHTML = `
<div class="game-app wc-app">
<style>
.wc-app{--bg:#f8fafc;--card:#fff;--line:#e2e8f0;--ink:#0f172a;--mut:#64748b;--acc:#4f46e5;--soft:#eef2ff;--good:#059669;--bad:#dc2626;--warn:#d97706}
.wc-app [hidden]{display:none!important}
.wc-app .wc-panel{position:relative;display:flex;flex-direction:column;gap:14px;padding:18px;background:var(--bg);border:1px solid var(--line);border-radius:16px;color:var(--ink)}
.wc-app .wc-toolbar{display:flex;flex-wrap:wrap;align-items:center;gap:8px}
.wc-app .wc-chip{font-size:12px;color:var(--mut);background:var(--card);border:1px solid var(--line);border-radius:999px;padding:4px 10px}
.wc-app .wc-chip b{color:var(--ink);font-variant-numeric:tabular-nums}
.wc-app .wc-spacer{flex:1}
.wc-app .wc-btn{border:1px solid var(--line);background:var(--card);color:var(--ink);border-radius:10px;padding:8px 14px;font:inherit;font-size:13px;font-weight:600;cursor:pointer;transition:border-color .15s,background .15s}
.wc-app .wc-btn:hover:not(:disabled){border-color:#c7d2fe}
.wc-app .wc-btn:disabled{opacity:.45;cursor:default}
.wc-app .wc-btn.wc-primary{background:var(--acc);border-color:var(--acc);color:#fff}
.wc-app .wc-btn.wc-primary:hover:not(:disabled){background:#4338ca}
.wc-app .wc-btn.wc-ghost{background:transparent}
.wc-app .wc-btn:focus-visible,.wc-app .wc-key:focus-visible,.wc-app .wc-in:focus-visible,.wc-app .wc-tile:focus-visible{outline:2px solid var(--acc);outline-offset:2px}
.wc-app .wc-players{display:grid;grid-template-columns:1fr auto 1fr;gap:10px;align-items:stretch}
.wc-app .wc-player{display:flex;flex-direction:column;gap:2px;padding:10px 14px;background:var(--card);border:1px solid var(--line);border-radius:12px;transition:border-color .15s,box-shadow .15s}
.wc-app .wc-player.on{border-color:var(--acc);box-shadow:0 0 0 3px var(--soft)}
.wc-app .wc-prow{display:flex;align-items:center;gap:6px;min-width:0}
.wc-app .wc-pname{font-size:13px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.wc-app .wc-ptag{font-size:10px;font-weight:800;letter-spacing:.08em;color:var(--acc);background:var(--soft);border-radius:999px;padding:1px 7px}
.wc-app .wc-pscore{font-size:20px;font-weight:800;font-variant-numeric:tabular-nums}
.wc-app .wc-pskips{font-size:11px;color:var(--mut)}
.wc-app .wc-vs{align-self:center;font-size:11px;font-weight:700;color:var(--mut);letter-spacing:.1em}
.wc-app .wc-clock{display:flex;align-items:center;gap:10px}
.wc-app .wc-track{flex:1;height:4px;border-radius:999px;background:var(--line);overflow:hidden}
.wc-app .wc-track i{display:block;height:100%;width:100%;border-radius:999px;background:var(--acc);transition:width .1s linear}
.wc-app .wc-clock.low .wc-track i{background:var(--bad)}
.wc-app .wc-clock.paused .wc-track i{background:var(--warn)}
.wc-app .wc-clock b{min-width:44px;text-align:right;font-size:12px;color:var(--mut);font-variant-numeric:tabular-nums}
.wc-app .wc-chain{display:flex;flex-wrap:wrap;align-items:center;justify-content:center;gap:8px;min-height:44px}
.wc-app .wc-empty{font-size:13px;color:var(--mut)}
.wc-app .wc-tile{padding:7px 12px;border-radius:10px;background:var(--card);border:1px solid var(--line);font:inherit;font-size:14px;font-weight:700;letter-spacing:.12em;color:var(--ink)}
.wc-app .wc-tile.first{background:var(--soft);border-color:#c7d2fe;color:var(--acc)}
.wc-app .wc-tile.last{border-color:var(--acc)}
.wc-app .wc-tile.last b{color:var(--acc);text-decoration:underline;text-underline-offset:3px}
.wc-app button.wc-tile{cursor:pointer}
.wc-app button.wc-tile:hover{background:var(--soft)}
.wc-app .wc-sep{display:grid;place-items:center;width:14px;height:14px;color:#cbd5e1}
.wc-app .wc-sep svg{width:12px;height:12px}
.wc-app .wc-next{align-self:center;font-size:12px;font-weight:700;letter-spacing:.04em;color:var(--acc);background:var(--soft);border-radius:999px;padding:4px 12px}
.wc-app .wc-form{display:flex;flex-wrap:wrap;gap:8px;justify-content:center}
.wc-app .wc-in{flex:0 1 240px;min-width:0;background:var(--card);border:1px solid var(--line);border-radius:10px;color:var(--ink);font:inherit;font-size:16px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;text-align:center;padding:10px 14px;outline:none;transition:border-color .15s,box-shadow .15s}
.wc-app .wc-in::placeholder{letter-spacing:normal;font-weight:500;text-transform:none;color:var(--mut)}
.wc-app .wc-in:focus{border-color:var(--acc);box-shadow:0 0 0 3px var(--soft)}
.wc-app .wc-in:disabled{opacity:.55}
.wc-app .wc-msg{min-height:18px;text-align:center;font-size:13px;font-weight:600;color:var(--mut)}
.wc-app .wc-msg.good{color:var(--good)}
.wc-app .wc-msg.bad{color:var(--bad)}
.wc-app .wc-msg.cheat{color:var(--warn)}
.wc-app .wc-hint{align-self:center;font-size:13px;font-weight:700;letter-spacing:.08em;color:var(--warn);background:#fffbeb;border:1px solid #fde68a;border-radius:10px;padding:8px 12px}
.wc-app .wc-kb{display:flex;flex-direction:column;gap:6px;width:min(480px,100%);margin:0 auto}
.wc-app .wc-kbrow{display:flex;gap:6px}
.wc-app .wc-key{flex:1;min-width:0;height:clamp(38px,9vw,46px);display:grid;place-items:center;border:1px solid var(--line);border-radius:8px;background:var(--card);color:var(--ink);font:inherit;font-size:14px;font-weight:700;cursor:pointer;user-select:none;-webkit-tap-highlight-color:transparent}
.wc-app .wc-key:active:not(:disabled){background:var(--soft);border-color:#c7d2fe}
.wc-app .wc-key:disabled{opacity:.4;cursor:default}
.wc-app .wc-key.wc-wide{flex:1.7}
.wc-app .wc-key.wc-go{background:var(--acc);border-color:var(--acc);color:#fff}
.wc-app .wc-ov{position:absolute;inset:0;z-index:5;display:grid;place-items:center;padding:16px;background:rgba(248,250,252,.92);backdrop-filter:blur(3px);border-radius:16px}
.wc-app .wc-card{width:min(440px,100%);max-height:100%;overflow:auto;display:flex;flex-direction:column;gap:12px;background:var(--card);border:1px solid var(--line);border-radius:16px;padding:22px;box-shadow:0 10px 30px rgba(15,23,42,.08)}
.wc-app .wc-ovtitle{margin:0;font-size:18px;font-weight:800}
.wc-app .wc-ovtitle.win{color:var(--good)}
.wc-app .wc-ovtitle.lose{color:var(--bad)}
.wc-app .wc-ovsub{margin:0;font-size:13.5px;line-height:1.55;color:#334155}
.wc-app .wc-rules{margin:0;padding-left:18px;display:grid;gap:6px;font-size:13px;line-height:1.5;color:#334155}
.wc-app .wc-h4{margin:4px 0 0;font-size:12px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:var(--mut)}
.wc-app .wc-note{margin:0;font-size:12px;line-height:1.5;color:var(--mut)}
.wc-app .wc-recap{font-size:12.5px;font-weight:700;letter-spacing:.06em;line-height:1.7;color:#334155;background:var(--bg);border:1px solid var(--line);border-radius:10px;padding:10px 12px;word-break:break-word}
.wc-app .wc-ovrow{display:flex;flex-wrap:wrap;gap:8px}
.wc-app .wc-cheat{display:flex;flex-direction:column;align-items:flex-start;gap:2px;width:100%;text-align:left;border:1px solid var(--line);border-radius:10px;background:var(--card);padding:10px 12px;font:inherit;cursor:pointer}
.wc-app .wc-cheat:hover:not(:disabled){border-color:#fcd34d;background:#fffbeb}
.wc-app .wc-cheat:disabled{opacity:.45;cursor:default}
.wc-app .wc-cheat b{font-size:13px}
.wc-app .wc-cheat span{font-size:11.5px;color:var(--mut)}
.wc-app .game-status.is-you .game-status-dot{background:var(--acc)}
.wc-app .game-status.is-wait .game-status-dot{background:var(--warn)}
@media (max-width:600px){
.wc-app .wc-panel{padding:12px;gap:12px}
.wc-app .wc-chip{font-size:11px;padding:3px 8px}
.wc-app .wc-btn{padding:7px 10px;font-size:12px}
.wc-app .wc-in{flex:1 1 140px}
.wc-app .wc-tile{font-size:12.5px;padding:6px 9px}
.wc-app .wc-pscore{font-size:18px}
.wc-app .wc-card{padding:16px}
}
</style>
  <div class="game-intro">
    <div><h2>Word Chain</h2><p>Link words head-to-tail — every word starts with the last letter of the previous one.</p></div>
    <span class="game-status"><i class="game-status-dot"></i><span data-status>Ready</span></span>
  </div>
  <section class="game-panel wc-panel" data-board>
    <div class="wc-toolbar">
      <span class="wc-chip">Level <b data-level>—</b></span>
      <span class="wc-chip">Chain <b data-progress>0/8</b></span>
      <span class="wc-chip" data-bestchip>Best <b data-best>0</b></span>
      <span class="wc-spacer"></span>
      <button class="wc-btn wc-ghost" type="button" data-act="help">How to play</button>
      <button class="wc-btn wc-ghost" type="button" data-act="cheats">Cheats</button>
      <button class="wc-btn wc-ghost" type="button" data-act="kb" aria-pressed="false">Keys</button>
      <button class="wc-btn wc-ghost" type="button" data-act="start">New round</button>
    </div>
    <div class="wc-players">
      <div class="wc-player" data-p="0">
        <span class="wc-prow"><span class="wc-pname" data-name>Player 1</span><span class="wc-ptag" data-tag hidden></span></span>
        <b class="wc-pscore" data-score>0</b><span class="wc-pskips" data-skips>2 skips</span>
      </div>
      <span class="wc-vs">VS</span>
      <div class="wc-player" data-p="1">
        <span class="wc-prow"><span class="wc-pname" data-name>Player 2</span><span class="wc-ptag" data-tag hidden></span></span>
        <b class="wc-pscore" data-score>0</b><span class="wc-pskips" data-skips>2 skips</span>
      </div>
    </div>
    <div class="wc-clock" data-clock><div class="wc-track"><i data-bar></i></div><b data-time>20s</b></div>
    <div class="wc-chain" data-chain></div>
    <span class="wc-next" data-next hidden></span>
    <div class="wc-form">
      <input class="wc-in" data-in maxlength="12" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="Type a word" aria-label="Next word"/>
      <button class="wc-btn wc-primary" type="button" data-act="add">Add</button>
      <button class="wc-btn" type="button" data-act="skip">Skip (2)</button>
    </div>
    <div class="wc-msg" data-msg aria-live="polite"></div>
    <div class="wc-hint" data-hint hidden></div>
    <div class="wc-kb" data-kb hidden>${kbHtml}</div>

    <div class="wc-ov" data-ov="start">
      <div class="wc-card">
        <h3 class="wc-ovtitle">Word Chain</h3>
        <p class="wc-ovsub">Take turns with your rival. Every word must start with the last letter of the previous one — APPLE leads to ECHO, then OLIVE, and so on.</p>
        <ul class="wc-rules">
          <li>Grow the shared chain to 8 words; the higher score wins.</li>
          <li>10 points per letter. A skip auto-plays a word for +5 (2 skips each).</li>
          <li>20 seconds per turn. Run out of time or valid links and you lose.</li>
          <li>Stuck? Two wrong tries reveal a letter hint.</li>
        </ul>
        <div class="wc-ovrow">
          <button class="wc-btn wc-primary" type="button" data-act="start">Start game</button>
          <button class="wc-btn wc-ghost" type="button" data-act="help">Full guide</button>
        </div>
      </div>
    </div>
    <div class="wc-ov" data-ov="over" hidden>
      <div class="wc-card">
        <h3 class="wc-ovtitle" data-result-title>Round over</h3>
        <p class="wc-ovsub" data-result-sub></p>
        <div class="wc-recap" data-recap></div>
        <div class="wc-ovrow">
          <button class="wc-btn wc-primary" type="button" data-act="start">Play again</button>
          <button class="wc-btn wc-ghost" type="button" data-act="help">How to play</button>
        </div>
      </div>
    </div>
    <div class="wc-ov" data-ov="help" hidden>
      <div class="wc-card">
        <h3 class="wc-ovtitle">How to play</h3>
        <ul class="wc-rules">
          <li><b>Goal.</b> Build the chain to 8 words together, but finish with more points than your rival.</li>
          <li><b>Link rule.</b> Your word starts with the last letter of the previous word: APPLE → ECHO → OLIVE.</li>
          <li><b>Words.</b> Built-in list of 359 words, at least 3 letters, no repeats.</li>
          <li><b>Turns.</b> Players alternate, 20 seconds each. A coin toss picks who starts; seats are shuffled in multiplayer.</li>
          <li><b>Scoring.</b> 10 points per letter. Skip auto-plays a valid word for +5 and spends one of your 2 skips.</li>
          <li><b>Losing.</b> Run out of time, or face a link with no valid word — your rival wins. If the chain completes, the higher score wins.</li>
          <li><b>Hints.</b> Miss twice on your turn and letters of a safe word start to reveal.</li>
        </ul>
        <h4 class="wc-h4">Controls</h4>
        <ul class="wc-rules">
          <li><b>Desktop.</b> Just type — letters go to the input. Enter adds the word, Backspace deletes, Esc closes panels. Click the last tile to seed its final letter.</li>
          <li><b>Mobile.</b> Tap the on-screen keys; toggle them with the Keys button.</li>
        </ul>
        <p class="wc-note">Every level is generated with a guaranteed 8-word solution — but a careless word can still corner you. Cheats flag the round and disable best-score saving.</p>
        <div class="wc-ovrow"><button class="wc-btn" type="button" data-act="close">Close</button></div>
      </div>
    </div>
    <div class="wc-ov" data-ov="cheats" hidden>
      <div class="wc-card">
        <h3 class="wc-ovtitle">Cheats</h3>
        <button class="wc-cheat" type="button" data-cheat="reveal"><b>Reveal a word</b><span>Show one safe word for the current link (only you see it).</span></button>
        <button class="wc-cheat" type="button" data-cheat="autoplay"><b>Auto-play</b><span>Let the game place a safe word for you. Scores 0.</span></button>
        <button class="wc-cheat" type="button" data-cheat="time"><b>+15 seconds</b><span>Add time to the current turn clock.</span></button>
        <button class="wc-cheat" type="button" data-cheat="freeze"><b>Freeze timer</b><span>Pause or resume the turn clock.</span></button>
        <button class="wc-cheat" type="button" data-cheat="skips"><b>+2 skips</b><span>Refill your skip supply.</span></button>
        <p class="wc-note">Cheats are for practice. Using one flags the round for both players and stops best-score saving.</p>
        <div class="wc-ovrow"><button class="wc-btn" type="button" data-act="close">Close</button></div>
      </div>
    </div>
  </section>
  <div class="game-actions"><button class="game-action-button" type="button" data-exit>Exit game</button></div>
</div>`;

    /* ---------- refs ---------- */
    const $ = (s) => root.querySelector(s);
    const statusWrap = $(".game-status"), statusEl = $("[data-status]");
    const levelEl = $("[data-level]"), progressEl = $("[data-progress]");
    const bestChip = $("[data-bestchip]"), bestEl = $("[data-best]");
    const clockEl = $("[data-clock]"), barEl = $("[data-bar]"), timeEl = $("[data-time]");
    const chainEl = $("[data-chain]"), nextEl = $("[data-next]");
    const inEl = $("[data-in]"), addBtn = $('[data-act="add"]'), skipBtn = $('[data-act="skip"]');
    const msgEl = $("[data-msg]"), hintEl = $("[data-hint]");
    const kbEl = $("[data-kb]"), kbBtn = $('[data-act="kb"]');
    const ovStart = $('[data-ov="start"]'), ovOver = $('[data-ov="over"]');
    const ovHelp = $('[data-ov="help"]'), ovCheats = $('[data-ov="cheats"]');
    const resultTitle = $("[data-result-title]"), resultSub = $("[data-result-sub]"), recapEl = $("[data-recap]");
    const freezeBtn = $('[data-cheat="freeze"]');
    const cheatBtns = root.querySelectorAll("[data-cheat]");
    const playerEls = [0, 1].map((i) => {
        const el = $('[data-p="' + i + '"]');
        return {
            el,
            name: el.querySelector("[data-name]"),
            tag: el.querySelector("[data-tag]"),
            score: el.querySelector("[data-score]"),
            skips: el.querySelector("[data-skips]"),
        };
    });

    /* ---------- state ---------- */
    function freshState() {
        // ACAK POSISI: host mengacak seat host/guest -> Player 1 / Player 2.
        const seats = online
            ? (Math.random() < 0.5 ? { host: 0, guest: 1 } : { host: 1, guest: 0 })
            : { host: 0, guest: 1 };
        const names = online ? ["Player 1", "Player 2"] : [cleanName(playerName) || "You", "Bot"];
        if (online) names[seats.host] = cleanName(playerName) || "Host";
        return {
            phase: "intro", round: 0, level: null,
            chain: [], turn: 0, deadline: 0, frozen: false, frozenLeft: TURN_MS,
            scores: [0, 0], skips: [SKIPS, SKIPS], misses: 0,
            names, seats, cheated: false, winner: null, endReason: "",
            event: { kind: "info", text: online ? "Either player can start the round." : "Press Start game to begin." },
        };
    }

    function startRound() {
        stopBot();
        const level = generateLevel();
        state.round += 1;
        state.level = level;
        state.chain = [level.start];
        state.turn = Math.random() < 0.5 ? 0 : 1; // ACAK GILIRAN PERTAMA (coin toss, vs bot & multiplayer)
        state.scores = [0, 0];
        state.skips = [SKIPS, SKIPS];
        state.misses = 0;
        state.frozen = false;
        state.frozenLeft = TURN_MS;
        state.deadline = Date.now() + TURN_MS;
        state.phase = "playing";
        state.winner = null;
        state.endReason = "";
        state.cheated = false;
        state.event = { kind: "info", text: "Level LV-" + level.id + " — coin toss: " + state.names[state.turn] + " goes first." };
        reveal = null;
        hintCache = { key: "", text: "" };
    }

    function afterMove() {
        if (state.chain.length >= CHAIN_TARGET) { finish("complete"); return; }
        state.turn = 1 - state.turn;
        state.misses = 0;
        if (state.frozen) state.frozenLeft = TURN_MS;
        else state.deadline = Date.now() + TURN_MS;
        if (!candidates(state.chain).length) finish("stuck"); // pemain berikutnya buntu -> kalah
    }

    function finish(reason) {
        state.phase = "over";
        state.endReason = reason;
        state.frozen = false;
        stopBot();
        if (reason === "complete") {
            state.winner = state.scores[0] === state.scores[1] ? -1 : (state.scores[0] > state.scores[1] ? 0 : 1);
        } else {
            state.winner = 1 - state.turn;
        }
        const stuckName = state.names[state.turn];
        const winName = state.winner === -1 ? "" : state.names[state.winner];
        let text;
        if (reason === "complete") {
            text = state.winner === -1
                ? "Chain complete — a draw at " + state.scores[0] + " points."
                : "Chain complete — " + winName + " wins " + Math.max(state.scores[0], state.scores[1]) + "\u2013" + Math.min(state.scores[0], state.scores[1]) + ".";
        } else if (reason === "timeout") {
            text = stuckName + " ran out of time — " + winName + " wins.";
        } else {
            text = stuckName + " has no valid link left — " + winName + " wins.";
        }
        state.event = { kind: state.winner === -1 ? "info" : "good", text };
        if (!online && state.winner === 0 && !state.cheated && state.scores[0] > best) {
            best = state.scores[0];
            try { localStorage.setItem(META.bestKey, String(best)); } catch (e) { /* abaikan */ }
        }
    }

    function applyCheat(kind, me) {
        if (state.phase !== "playing") return;
        state.cheated = true;
        const name = state.names[me];
        if (kind === "reveal") {
            state.event = { kind: "cheat", text: name + " used a cheat: Reveal word." };
        } else if (kind === "autoplay") {
            if (me !== state.turn) { state.event = { kind: "bad", text: "Auto-play only works on your turn." }; return; }
            const w = bestNext(state.chain);
            if (!w) return;
            state.chain.push(w);
            state.event = { kind: "cheat", text: name + " auto-played " + w + " (+0)." };
            afterMove();
        } else if (kind === "time") {
            if (state.frozen) state.frozenLeft += 15000;
            else state.deadline += 15000;
            state.event = { kind: "cheat", text: name + " added 15 seconds." };
        } else if (kind === "freeze") {
            if (!state.frozen) {
                state.frozen = true;
                state.frozenLeft = Math.max(0, state.deadline - Date.now());
                state.event = { kind: "cheat", text: "Timer frozen by " + name + "." };
            } else {
                state.frozen = false;
                state.deadline = Date.now() + Math.max(500, state.frozenLeft);
                state.event = { kind: "cheat", text: "Timer resumed by " + name + "." };
            }
        } else if (kind === "skips") {
            state.skips[me] += 2;
            state.event = { kind: "cheat", text: name + " gained 2 extra skips." };
        }
    }

    /* ---------- rendering ---------- */
    function updateClock() {
        if (!state) { timeEl.textContent = "—"; barEl.style.width = "0%"; return; }
        const playing = state.phase === "playing";
        let rem = TURN_MS;
        if (playing) rem = state.frozen ? state.frozenLeft : Math.max(0, state.deadline - Date.now());
        else if (state.phase === "over") rem = 0;
        timeEl.textContent = playing && state.frozen ? "pause" : Math.ceil(rem / 1000) + "s";
        barEl.style.width = Math.max(0, Math.min(100, (rem / TURN_MS) * 100)).toFixed(1) + "%";
        clockEl.classList.toggle("low", playing && !state.frozen && rem <= 5000);
        clockEl.classList.toggle("paused", playing && state.frozen);
    }

    function render() {
        if (destroyed) return;
        if (!state) { // guest menunggu state pertama dari host
            statusEl.textContent = "Connecting…";
            msgEl.textContent = "Waiting for the host to publish the first state…";
            inEl.disabled = addBtn.disabled = skipBtn.disabled = true;
            ovStart.hidden = ovOver.hidden = ovHelp.hidden = ovCheats.hidden = true;
            return;
        }
        const me = myIndex();
        const playing = state.phase === "playing";
        const yourTurn = playing && state.turn === me;

        statusEl.textContent = !playing
            ? (state.phase === "intro" ? "Ready" : "Round over")
            : yourTurn ? "Your turn" : online ? state.names[state.turn] + "'s turn" : "Bot is thinking…";
        statusWrap.classList.toggle("is-you", yourTurn);
        statusWrap.classList.toggle("is-wait", playing && !yourTurn);

        levelEl.textContent = state.level ? "LV-" + state.level.id : "—";
        progressEl.textContent = state.chain.length + "/" + CHAIN_TARGET;
        bestChip.hidden = online;
        bestEl.textContent = String(best);

        playerEls.forEach((p, i) => {
            p.name.textContent = state.names[i];
            p.tag.textContent = i === me ? "YOU" : (!online && i === 1 ? "BOT" : "");
            p.tag.hidden = !p.tag.textContent;
            p.score.textContent = String(state.scores[i]);
            p.skips.textContent = state.skips[i] + " skips";
            p.el.classList.toggle("on", playing && state.turn === i);
        });

        chainEl.textContent = "";
        if (!state.chain.length) {
            const em = document.createElement("span");
            em.className = "wc-empty";
            em.textContent = "Start a round to deal the first word.";
            chainEl.appendChild(em);
        } else {
            const frag = document.createDocumentFragment();
            state.chain.forEach((w, i) => {
                if (i > 0) {
                    const sep = document.createElement("span");
                    sep.className = "wc-sep";
                    sep.innerHTML = CHEVRON;
                    frag.appendChild(sep);
                }
                const isLast = i === state.chain.length - 1;
                const t = document.createElement(isLast && playing ? "button" : "span");
                if (t.tagName === "BUTTON") t.type = "button";
                t.className = "wc-tile" + (i === 0 ? " first" : "") + (isLast ? " last" : "");
                if (isLast && playing) {
                    t.dataset.act = "seed";
                    t.title = "Click to type from '" + lastLetter(w) + "'";
                    t.append(w.slice(0, -1));
                    const b = document.createElement("b");
                    b.textContent = lastLetter(w);
                    t.appendChild(b);
                } else {
                    t.textContent = w;
                    if (i === 0) t.title = "Start word";
                }
                frag.appendChild(t);
            });
            chainEl.appendChild(frag);
        }

        nextEl.hidden = !state.chain.length;
        if (state.chain.length) nextEl.textContent = 'Next word starts with "' + lastLetter(state.chain[state.chain.length - 1]) + '"';

        inEl.disabled = !yourTurn;
        addBtn.disabled = !yourTurn;
        skipBtn.disabled = !yourTurn || state.skips[me] <= 0;
        skipBtn.textContent = "Skip (" + state.skips[me] + ")";
        inEl.placeholder = yourTurn ? "Type a word…" : playing ? "Waiting…" : "—";

        const ev = state.event || { kind: "info", text: "" };
        msgEl.textContent = ev.text;
        msgEl.className = "wc-msg " + ev.kind;

        let hintText = "";
        if (yourTurn && reveal && reveal.round === state.round && reveal.len === state.chain.length) {
            hintText = "Cheat word: " + reveal.word;
        } else if (yourTurn && state.misses >= 2) {
            const key = state.chain.join(",") + "|" + state.misses;
            if (hintCache.key !== key) hintCache = { key, text: hintFor(state.chain, state.misses) };
            hintText = hintCache.text;
        }
        hintEl.hidden = !hintText;
        hintEl.textContent = hintText;

        kbEl.hidden = !kbOpen;
        kbBtn.textContent = kbOpen ? "Keys: on" : "Keys: off";
        kbBtn.setAttribute("aria-pressed", String(kbOpen));
        kbEl.querySelectorAll("button").forEach((b) => { b.disabled = !yourTurn; });
        inEl.setAttribute("inputmode", kbOpen && coarse ? "none" : "text");

        ovStart.hidden = state.phase !== "intro";
        ovOver.hidden = state.phase !== "over";
        ovHelp.hidden = openPanel !== "help";
        ovCheats.hidden = openPanel !== "cheats";
        cheatBtns.forEach((b) => { b.disabled = !playing; });
        freezeBtn.querySelector("b").textContent = state.frozen ? "Resume timer" : "Freeze timer";

        if (state.phase === "over") {
            resultTitle.textContent = state.winner === -1 ? "Draw" : state.winner === me ? "You win" : state.names[state.winner] + " wins";
            resultTitle.className = "wc-ovtitle " + (state.winner === me ? "win" : state.winner === -1 ? "" : "lose");
            resultSub.textContent = ev.text + (state.cheated ? " (cheats were used)" : "");
            recapEl.textContent = state.chain.join(" \u2192 ");
        }

        updateClock();
        if (yourTurn && !prevYourTurn && !openPanel && !coarse) inEl.focus();
        prevYourTurn = yourTurn;
    }

    function publish() {
        render();
        // Hanya host yang menulis state kanonik ke Firebase.
        if (online && room.isHost) room.publishState(state).catch(console.warn);
    }

    /* ---------- aksi (validasi terpusat di otoritas: host / lokal) ---------- */
    function applyAction(action, actor) {
        if (!state || !action || typeof action.type !== "string") return;
        const me = actor === 1 ? 1 : 0;
        switch (action.type) {
            case "hello": {
                if (online) state.names[me] = cleanName(action.name) || state.names[me];
                break;
            }
            case "start": {
                startRound();
                break;
            }
            case "word": {
                if (state.phase !== "playing" || me !== state.turn) return;
                const word = sanitize(action.word);
                if (!word) return;
                const v = canPlay(state.chain, word);
                if (!v.ok) {
                    state.misses += 1; // salah beruntun -> hint muncul di client pemain tsb.
                    state.event = { kind: "bad", text: state.names[me] + ": " + missText(state.chain, word, v.reason) };
                    break;
                }
                state.chain.push(word);
                state.scores[me] += word.length * 10;
                state.misses = 0;
                state.event = { kind: "good", text: state.names[me] + " played " + word + " (+" + word.length * 10 + ")." };
                afterMove();
                break;
            }
            case "skip": {
                if (state.phase !== "playing" || me !== state.turn || state.skips[me] <= 0) return;
                const cands = candidates(state.chain);
                if (!cands.length) { state.event = { kind: "bad", text: "No link available to skip to." }; break; }
                const w = randOf(cands);
                state.skips[me] -= 1;
                state.chain.push(w);
                state.scores[me] += 5;
                state.misses = 0;
                state.event = { kind: "good", text: state.names[me] + " skipped to " + w + " (+5)." };
                afterMove();
                break;
            }
            case "cheat": {
                applyCheat(String(action.cheat || ""), me);
                break;
            }
            case "timeout": { // hanya dipanggil oleh jam otoritas, difilter dari jaringan
                if (state.phase !== "playing") return;
                finish("timeout");
                break;
            }
            default: return;
        }
        publish();
    }

    function submitAction(action) {
        if (online && !room.isHost) {
            room.sendAction(action).catch(console.warn);
            return;
        }
        applyAction(action, myIndex());
    }

    /* ---------- bot (mode ai) ---------- */
    function stopBot() {
        if (botTimer) { clearTimeout(botTimer); botTimer = null; }
        botToken = "";
    }
    function maybeBot() {
        if (online || !state || state.phase !== "playing" || state.turn !== 1) return;
        const token = state.round + ":" + state.chain.length;
        if (botToken === token) return;
        botToken = token;
        botTimer = setTimeout(() => {
            botTimer = null;
            if (destroyed || !state || state.phase !== "playing" || state.turn !== 1 || botToken !== token) return;
            const cands = candidates(state.chain);
            if (!cands.length) { applyAction({ type: "timeout" }, 1); return; }
            // 80% bot memilih kata yang menjaga rantai tetap solvable; 20% sembrono -> bisa dikalahkan.
            const safe = cands.filter((w) => canFinish(state.chain.concat(w)));
            const pool = safe.length && Math.random() < 0.8 ? safe : cands;
            applyAction({ type: "word", word: randOf(pool) }, 1);
        }, 1400 + Math.random() * 1800);
    }

    /* ---------- jam: render countdown utk semua, timeout hanya di otoritas ---------- */
    function clockTick() {
        if (destroyed) return;
        updateClock();
        if (!state || state.phase !== "playing") return;
        const authority = !online || room.isHost;
        if (authority && !state.frozen && Date.now() >= state.deadline) {
            applyAction({ type: "timeout" }, state.turn);
            return;
        }
        if (!online) maybeBot();
    }

    /* ---------- input: mouse, keyboard fisik, keyboard virtual ---------- */
    function submitWord() {
        if (!state || state.phase !== "playing" || state.turn !== myIndex()) return;
        const word = sanitize(inEl.value);
        if (!word) return;
        const v = canPlay(state.chain, word);
        submitAction({ type: "word", word });
        if (v.ok) inEl.value = "";
        else { inEl.value = word; inEl.select(); }
    }

    function useCheat(kind) {
        if (!state || state.phase !== "playing") return;
        if (kind === "reveal") {
            const w = bestNext(state.chain);
            reveal = w ? { round: state.round, len: state.chain.length, word: w } : null;
        }
        submitAction({ type: "cheat", cheat: kind });
        render();
    }

    function pressKey(k) {
        if (!state || state.phase !== "playing" || state.turn !== myIndex()) return;
        if (k === "enter") { submitWord(); return; }
        if (k === "back") inEl.value = inEl.value.slice(0, -1);
        else if (inEl.value.length < MAX_LEN) inEl.value += k;
        if (typeof navigator !== "undefined" && navigator.vibrate) { try { navigator.vibrate(6); } catch (e) { /* abaikan */ } }
    }

    function handleClick(event) {
        if (event.target.closest("[data-exit]")) { onExit(); return; }
        const cheatBtn = event.target.closest("[data-cheat]");
        if (cheatBtn) { useCheat(cheatBtn.dataset.cheat); return; }
        const keyBtn = event.target.closest("[data-key]");
        if (keyBtn) { pressKey(keyBtn.dataset.key); return; }
        const actBtn = event.target.closest("[data-act]");
        if (actBtn) {
            const act = actBtn.dataset.act;
            if (act === "start") { openPanel = null; submitAction({ type: "start" }); }
            else if (act === "add") submitWord();
            else if (act === "skip") submitAction({ type: "skip" });
            else if (act === "help") { openPanel = openPanel === "help" ? null : "help"; render(); }
            else if (act === "cheats") { openPanel = openPanel === "cheats" ? null : "cheats"; render(); }
            else if (act === "close") { openPanel = null; render(); }
            else if (act === "kb") { kbOpen = !kbOpen; render(); }
            else if (act === "seed") {
                if (state && state.phase === "playing" && state.turn === myIndex()) {
                    inEl.value = lastLetter(state.chain[state.chain.length - 1]);
                    inEl.focus();
                }
            }
            return;
        }
        // klik backdrop overlay menutup panel help/cheats
        if (openPanel && event.target.classList && event.target.classList.contains("wc-ov")) {
            openPanel = null;
            render();
        }
    }

    function handleKeydown(e) {
        if (e.key === "Escape" && openPanel) { e.preventDefault(); openPanel = null; render(); return; }
        if (!state) return;
        const onInput = e.target === inEl;
        const onButton = e.target && e.target.closest && e.target.closest("button");
        if (e.key === "Enter") {
            if (onInput) { e.preventDefault(); submitWord(); return; }
            if (!onButton && !openPanel) {
                e.preventDefault();
                if (state.phase === "playing" && state.turn === myIndex()) submitWord();
                else if (state.phase !== "playing") submitAction({ type: "start" });
            }
            return;
        }
        if (openPanel || state.phase !== "playing" || state.turn !== myIndex()) return;
        if (e.ctrlKey || e.metaKey || e.altKey) return;
        // ketik di mana saja -> huruf otomatis masuk ke input (desktop)
        if (/^[a-zA-Z]$/.test(e.key)) {
            if (!onInput) {
                e.preventDefault();
                if (inEl.value.length < MAX_LEN) inEl.value += e.key.toUpperCase();
                inEl.focus();
            }
            return;
        }
        if (e.key === "Backspace" && !onInput && !onButton) {
            e.preventDefault();
            inEl.value = inEl.value.slice(0, -1);
            inEl.focus();
        }
    }

    function handleInput(e) {
        if (e.target === inEl) inEl.value = sanitize(inEl.value);
    }

    /* ---------- wiring ---------- */
    root.addEventListener("click", handleClick);
    root.addEventListener("keydown", handleKeydown);
    root.addEventListener("input", handleInput);
    const clockTimer = setInterval(clockTick, 100);
    const unsubs = [];
    const track = (u) => { if (typeof u === "function") unsubs.push(u); };

    if (online) {
        track(room.onRoom((nextRoom) => { roomData = nextRoom; if (!destroyed) render(); }));
        if (room.isHost) {
            state = freshState();
            publish();
            // aksi guest dipetakan ke seat guest yang sudah diacak; "timeout" dari jaringan ditolak.
            track(room.onAction((action) => {
                if (destroyed || !state || !action || action.type === "timeout") return;
                applyAction(action, state.seats.guest);
            }));
        } else {
            track(room.onState((nextState) => { if (destroyed) return; state = nextState; render(); }));
            submitAction({ type: "hello", name: playerName });
        }
    } else {
        state = freshState();
        publish();
    }

    return {
        destroy() {
            destroyed = true;
            clearInterval(clockTimer);
            stopBot();
            root.removeEventListener("click", handleClick);
            root.removeEventListener("keydown", handleKeydown);
            root.removeEventListener("input", handleInput);
            unsubs.forEach((u) => { try { u(); } catch (e) { /* abaikan */ } });
        },
    };
}