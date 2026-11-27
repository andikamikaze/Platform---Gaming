/* ==== GAME: word-builder.js ==== */

/*
    Word Builder — turn-based word duel (template: META + mount).
    - Simpan file ini sebagai: js/games/word-builder.js  (id === nama file)
    - Regenerate manifest: node tools/build-games-manifest.mjs
*/

import { iconSVG } from "../JS/icons.js";

export const META = {
    id: "word-builder",
    name: "Word Builder",
    category: "words",
    catLabel: "Word",
    desc: "Duel kata dari 7 huruf. Susun kata 3+ huruf, pertama menemukan 6 kata menang.",
    art: '<svg viewBox="0 0 48 48" width="54" height="54" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="8" width="10" height="12" rx="2.5"/><rect x="19" y="8" width="10" height="12" rx="2.5"/><rect x="12" y="27" width="14" height="16" rx="3"/><path d="M36 24v12M30 30h12"/></svg>',
    bg: ["#ffe4e6", "#fda4af"],
    bestKey: "wordBuilderBest",
};

/* =============================================================
   PURE LOGIC (no DOM) — deterministic, testable via _test export
============================================================= */
const TARGET = 6;          // words needed to win
const TIME_MS = 90000;     // chess-clock bank per player
const MIN_LEN = 3;
const MIN_WORDS = 16;      // rack must allow >= this many words (2 x TARGET + buffer)
const PASS_COST_MS = 5000;
const TICK_MS = 250;
const COMMON = "AEIORSTLN";

/* Seed pool: every entry verified to yield >= MIN_WORDS buildable words. */
const SEEDS = [
    "GARDENS", "PLAYERS", "SILENCE", "ORANGES", "NETWORK", "STRANGE",
    "PAINTER", "PAINTED", "PARENTS", "PLASTER", "STAPLER", "ANTLERS",
    "RENTALS", "ENTRAPS", "GRANITE", "INGRATE", "TEARING", "GARNETS",
    "NEGATOR", "ONAGERS", "SENATOR", "TREASON", "ATONERS", "ORNATES",
    "ORIENTS", "PROTEIN", "POINTER", "PERTAIN", "PASTERN", "PANTERS",
    "TREPANS", "ARPENTS", "PANTHER", "SPANNER", "SNAPPER", "SEALING",
    "LEASING", "ANGLERS", "GLEANER", "SEARING", "REGAINS", "SEAGIRT",
    "GAITERS", "TRIAGES", "LARGEST", "STINGER",
];

const DICT = Array.from(new Set([
    /* original dictionary */
    "AGE", "AGENT", "AGENTS", "AGES", "AGO", "ANGER", "ANGERS", "ANT", "APES", "ARE",
    "ARGON", "ARSON", "ART", "ASP", "DANGER", "DANGERS", "DARE", "DEAN", "DEANS", "DEAR",
    "DEN", "DENS", "EAR", "EARLS", "EARN", "EARNS", "EARS", "EAT", "EEL", "EELS",
    "EGO", "ELSE", "EON", "EONS", "ERA", "ERAS", "ERGO", "GARDEN", "GARDENS", "GARNET",
    "GAS", "GATE", "GATES", "GEAR", "GEARS", "GET", "GONE", "GORE", "GRAND", "GRANDS",
    "GRANT", "GRANTS", "GRATE", "GRATES", "GROAN", "GROANS", "KEN", "KNEW", "KNOT", "LASER",
    "LAYER", "LAYERS", "LEAP", "LEAPS", "LEI", "LEIS", "LENS", "LIE", "LIEN", "LIES",
    "LINE", "LINES", "LYRE", "NAG", "NAGS", "NEAR", "NEARS", "NET", "NETWORK", "NEW",
    "NEWT", "NICE", "NIECE", "NIL", "NOR", "NOTE", "NOW", "OAR", "OARS", "ONE",
    "ONES", "ORANGE", "ORANGES", "ORE", "ORGAN", "ORGANS", "OWE", "PAL", "PALE", "PALS",
    "PAR", "PARE", "PARES", "PARLEY", "PARSE", "PAY", "PAYER", "PAYS", "PEA", "PEAL",
    "PEALS", "PEAR", "PEARL", "PEARLS", "PEAS", "PLAY", "PLAYER", "PLAYERS", "PLAYS", "PRAY",
    "PRAYS", "PRY", "RAGE", "RAGES", "RAN", "RANGE", "RANGES", "RANT", "RANTS", "RASP",
    "RAT", "RATES", "RATS", "RAY", "RAYS", "READ", "READS", "REAP", "REAPS", "REASON",
    "RED", "REDS", "RELAY", "REPLAY", "ROE", "ROSE", "ROT", "ROTE", "ROW", "SAD",
    "SAG", "SAGE", "SALE", "SANE", "SANER", "SAND", "SANDER", "SAY", "SCENE", "SEA",
    "SEAR", "SEEN", "SEE", "SEND", "SET", "ICE", "ICES", "SIN", "SINCE", "SINE",
    "SILENCE", "SLAP", "SLICE", "SNAG", "SNARE", "SON", "SONAR", "SONG", "SORE", "SPA",
    "SPARE", "STAGE", "STARE", "STRANGE", "TAG", "TAN", "TAR", "TEA", "TEARS", "TEN",
    "TENOR", "TERN", "TOE", "TOKEN", "TON", "TONE", "TONER", "TORE", "TOW", "TOWER",
    "TREK", "TWO", "NOT", "RENT", "WET", "WOKEN", "WOK", "WON", "WORE", "WORT",
    "WREN", "WROTE", "YAP", "YAPS", "YEA", "YES",
    /* expanded dictionary (more solvable racks, fewer "that's a word!" moments) */
    "ANTE", "ANTES", "ARTS", "EAST", "EATS", "EATEN", "NEAT", "GNAT", "GNATS", "GNAW",
    "GNAWS", "LATE", "LATER", "LEAN", "LEANS", "LANE", "LANES", "ELAN", "LEARN", "LEARNS",
    "RENAL", "SNARL", "SNARLS", "REGAL", "LAGER", "LARGE", "GLARE", "GALE", "GALES", "GRAN",
    "GRANS", "RANG", "SANG", "TANG", "TANGS", "ANGST", "DARN", "DARNS", "NERD", "NERDS",
    "PANE", "PANES", "PANT", "PANTS", "PAST", "PASTE", "PATE", "PATES", "PELT", "PELTS",
    "PET", "PETS", "RATE", "SATE", "SEAT", "SEATS", "STAR", "TARE", "TARES", "TARS",
    "TEAR", "TEAS", "TERNS", "RENTS", "LICE", "CEIL", "CEILS", "LENSE", "LEE", "LEES",
    "NILS", "SIC", "NAP", "NAPS", "PAN", "PANS", "SNAP", "SPAN", "TAP", "TAPS",
    "PAT", "PATS", "APT", "PEAT", "PEATS", "TAPE", "TAPES", "TRAP", "TRAPS", "PART",
    "PARTS", "TARP", "TARPS", "RAPT", "PASTEL", "STAPLE", "STAPLER", "PLASTER", "ALTER",
    "ALTERS", "ALERT", "ALERTS", "SALT", "SALTS", "SLAT", "SLATS", "LAST", "LATS", "ALT",
    "ALTS", "SEAL", "SEALS", "LEASE", "EASEL", "LEAST", "SLATE", "STALE", "STEAL", "STEALS",
    "TALE", "TALES", "TEAL", "TEALS", "OWN", "OWNS", "OWNER", "OWNERS", "TOWN", "TOWNS",
    "WONT", "WONK", "KENO", "TOKENS", "WORK", "WORKS", "TREKS", "NEWTS", "WETS", "TOWS",
    "ROWS", "OWES", "ROES", "ROTS", "TOES", "TONS", "TONES", "TONERS", "TORES", "TENS",
    "TENORS", "NETS", "WOKS", "WORTS", "WRENS", "APE", "APER", "APERS", "ARES", "AYE",
    "AYES", "LAPSE", "PALSY", "PARLEYS", "PARSLEY", "PAYERS", "PERT", "PERTS", "PLEA", "PLEAS",
    "PREY", "PREYS", "PYRE", "PYRES", "RELY", "REP", "REPS", "RYE", "RYES", "SAP",
    "SAYER", "SLAY", "SLAYER", "SPLAY", "SPRAY", "SPRY", "YELP", "YELPS", "LYRES", "PALER",
    "PALES", "GOER", "GOERS", "GONER", "GONERS", "GORES", "NOES", "NOSE", "OGRE", "OGRES",
    "SENOR", "SENORS", "SENORA", "SNORE", "ARGONS", "EGOS", "ONAGER", "AND", "ANDS", "DEARS",
    "DREG", "DREGS", "GRADE", "GRADES", "GRAD", "GRADS", "SNARED", "RANGED", "DRAG", "DRAGS",
    "DANG", "DANGS", "GNAR", "GNARS", "RAGED", "RAG", "RAGS", "END", "ENDS", "SEDAN",
    "RAND", "ASTER", "TASER", "RETAG", "STERN", "NEST", "SENT", "SAT", "ATE", "STAG",
    "STAGS", "GETS", "TAGS", "TANS", "ANTS", "GARNETS", "STAGES", "TARN", "TARNS", "GREAT",
    "GREATS", "CENSE", "LIENS", "SNOG", "SAGO",
])).sort();

function rng(seed) {
    let t = seed >>> 0;
    return function () {
        t += 0x6d2b79f5;
        let r = Math.imul(t ^ (t >>> 15), 1 | t);
        r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
        return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
    };
}
function shuffle(arr, rnd) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(rnd() * (i + 1));
        const t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
}
function canMake(word, letters) {
    const bag = {};
    for (const ch of letters) bag[ch] = (bag[ch] || 0) + 1;
    for (const ch of word) {
        if (!bag[ch]) return false;
        bag[ch]--;
    }
    return true;
}
function buildableWords(letters) {
    return DICT.filter((w) => canMake(w, letters));
}
function isFind(found, word, letters) {
    if (word.length < MIN_LEN) return { ok: false, reason: "short" };
    if (DICT.indexOf(word) < 0) return { ok: false, reason: "dict" };
    if (found.indexOf(word) >= 0) return { ok: false, reason: "used" };
    if (!canMake(word, letters)) return { ok: false, reason: "tiles" };
    return { ok: true, reason: "" };
}
function wordScore(word) { return word.length * 10; }

/* Random level generator — guaranteed solvable.
   Picks a seed, optionally mutates one letter, then VERIFIES the rack
   allows >= MIN_WORDS distinct words. Retries until valid. */
function generateLevel(levelSeed) {
    const rnd = rng(levelSeed >>> 0);
    for (let attempt = 0; attempt < 40; attempt++) {
        const base = SEEDS[Math.floor(rnd() * SEEDS.length)];
        const arr = base.split("");
        if (rnd() < 0.5) {
            const i = Math.floor(rnd() * arr.length);
            arr[i] = COMMON[Math.floor(rnd() * COMMON.length)];
        }
        const letters = shuffle(arr, rnd).join("");
        if (buildableWords(letters).length >= MIN_WORDS) return { letters, seedWord: base };
    }
    const base = SEEDS[Math.floor(rnd() * SEEDS.length)];
    return { letters: shuffle(base.split(""), rnd).join(""), seedWord: base };
}
function hintPattern(word, reveal) {
    return word.split("").map((c, i) => (i < reveal ? c : "_")).join(" ");
}

/* Optional: pure-logic exports for unit tests (safe to remove). */
export const _test = {
    TARGET, TIME_MS, MIN_LEN, MIN_WORDS, SEEDS, DICT,
    rng, shuffle, canMake, buildableWords, isFind, wordScore, generateLevel, hintPattern,
};

/* =============================================================
   MOUNT — UI, duel flow, bot, room sync, cheats, input
============================================================= */
export function mount(root, context = {}) {
    const { mode = "ai", room = null, playerName = "Player", onExit = () => { } } = context;
    const online = mode === "room" && Boolean(room);
    const BOT = 1; // bot seat in AI mode (human is seat 0)
    let roomData = room?.room || null;
    let state = null;

    /* ---------- local (non-synced) UI state ---------- */
    let tray = [];            // tile indices composing the current word
    let lastLetters = "";     // for remapping tray when the rack reshuffles
    let seenSeq = -1;
    let pendingWord = null;   // guest: word awaiting host confirmation
    let lastSync = 0;         // guest: for clock interpolation
    let localMsg = null;
    let showHelp = false, showCheats = false, paused = false;
    let cheatReveal = false, freezeClock = false;
    let tickTimer = null, guestTimer = null, botTimer = null, pubAcc = 0;

    /* Virtual timers: freeze while help/cheats/pause are open, then shift
       every due time by the frozen span so the bot and messages never jump. */
    let timers = [], timerTick = null, frozenAt = 0;
    const virtualNow = () => frozenAt || Date.now();
    const frozen = () => !online && (paused || showHelp || showCheats);

    function ensureTimer() {
        if (timerTick || frozen() || !timers.length) return;
        const next = Math.min.apply(null, timers.map((t) => t.due));
        timerTick = setTimeout(() => {
            timerTick = null;
            if (frozen()) return;
            const now = Date.now();
            const due = timers.filter((t) => t.due <= now);
            timers = timers.filter((t) => t.due > now);
            due.forEach((t) => t.fn());
            ensureTimer();
        }, Math.max(0, next - Date.now()));
    }
    const later = (fn, ms) => {
        const t = { fn, due: virtualNow() + ms };
        timers.push(t);
        ensureTimer();
        return t;
    };
    const cancelLater = (t) => {
        if (!t) return;
        timers = timers.filter((x) => x !== t);
        if (!timers.length && timerTick) { clearTimeout(timerTick); timerTick = null; }
    };
    const clearTimers = () => {
        if (timerTick) { clearTimeout(timerTick); timerTick = null; }
        timers = []; botTimer = null;
    };
    function freezeTimers() {
        if (frozenAt) return;
        frozenAt = Date.now();
        if (timerTick) { clearTimeout(timerTick); timerTick = null; }
        stopTick();
        if (guestTimer) { clearInterval(guestTimer); guestTimer = null; }
    }
    function thawTimers() {
        if (!frozenAt) return;
        const shift = Date.now() - frozenAt;
        frozenAt = 0;
        timers.forEach((t) => { t.due += shift; });
        if (online) lastSync += shift;
        ensureTimer();
        startTick();
        if (online && !room.isHost && !guestTimer) guestTimer = setInterval(renderClocks, TICK_MS);
    }
    const syncFreeze = () => { if (frozen()) freezeTimers(); else thawTimers(); };

    /* ---------- internal How to play (first run only) ---------- */
    let seenHelp = true;
    try { seenHelp = localStorage.getItem("wordBuilderHelpSeen") === "1"; } catch (_) { seenHelp = true; }
    if (!seenHelp) {
        showHelp = true;
        try { localStorage.setItem("wordBuilderHelpSeen", "1"); } catch (_) { /* storage blocked */ }
    }

    /* ---------- markup (single HUD + fill-height board) ---------- */
    root.innerHTML = `
<style>
.wb-app{--wb-ink:#17181c;--wb-mut:#7a7f8a;--wb-line:#e7e7ea;--wb-card:#ffffff;--wb-bg:#fbfbfc;--wb-acc:#4f46e5;--wb-rose:#e11d48;--wb-good:#059669;--wb-bad:#dc2626;
  width:100%;max-width:680px;margin:0 auto;display:flex;flex-direction:column;gap:10px;color:var(--wb-ink);
  font:14px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
.wb-app *{box-sizing:border-box}
.wb-app [hidden]{display:none!important}
.wb-app button:focus-visible{outline:2px solid var(--wb-acc);outline-offset:2px}

/* --- one HUD bar: info left, icon buttons right --- */
.wb-hud{display:flex;align-items:center;gap:7px;flex-wrap:wrap;font:600 10px/1 ui-monospace,SFMono-Regular,Menlo,monospace}
.wb-hud-info,.wb-hud-actions{display:flex;align-items:center;gap:6px;flex-wrap:wrap;min-width:0}
.wb-hud-actions{margin-left:auto}
.wb-spacer{flex:1 1 auto}
.wb-chip{display:inline-flex;align-items:center;gap:5px;padding:5px 8px;border:1px solid var(--wb-line);border-radius:999px;background:var(--wb-card);color:var(--wb-mut);white-space:nowrap}
.wb-chip b{color:var(--wb-ink);font-weight:700;font-variant-numeric:tabular-nums}
.wb-chip.wb-active{border-color:var(--wb-acc);box-shadow:0 1px 5px rgba(79,70,229,.12)}
.wb-dot{width:7px;height:7px;border-radius:50%;flex:none}
.wb-low{color:var(--wb-bad)!important;animation:wb-pulse 1s ease-in-out infinite}
.wb-btn{appearance:none;border:1px solid var(--wb-line);background:var(--wb-card);color:var(--wb-ink);border-radius:8px;padding:7px 11px;min-height:34px;font:inherit;font-size:11px;font-weight:700;cursor:pointer;transition:background .12s,border-color .12s,transform .12s}
.wb-btn:hover:not(:disabled){border-color:#c9cbd4;transform:translateY(-1px)}
.wb-btn:disabled{opacity:.4;cursor:default}
.wb-btn.wb-primary{background:var(--wb-ink);border-color:var(--wb-ink);color:#fff}
.wb-btn.wb-primary:hover:not(:disabled){background:#000}
.wb-btn.wb-on{border-color:var(--wb-acc);color:var(--wb-acc);background:#eef2ff}
.wb-icon-btn{display:inline-flex;align-items:center;gap:6px}
.wb-icon-btn svg{flex:none;display:block}

/* --- board fills the remaining height, content stays proportional --- */
.wb-board{position:relative;display:flex;align-items:center;justify-content:center;width:100%;min-height:0;padding:14px;background:var(--wb-bg);border:1px solid var(--wb-line);border-radius:14px;overflow:hidden}
.wb-play{display:flex;flex-direction:column;gap:12px;width:100%;max-width:600px;max-height:100%;margin:auto;overflow:auto;padding:2px}
.wb-rack{display:flex;gap:8px;flex-wrap:wrap;justify-content:center;padding:4px 0 0}
.wb-tile{position:relative;width:clamp(46px,7vw,56px);height:clamp(54px,8vw,62px);border-radius:10px;background:var(--wb-card);border:1px solid var(--wb-line);display:grid;place-items:center;font-size:24px;font-weight:800;color:var(--wb-ink);cursor:pointer;box-shadow:0 2px 6px rgba(0,0,0,.05);transition:transform .12s,border-color .12s,opacity .12s;font-family:inherit}
.wb-tile:hover:not(:disabled){transform:translateY(-3px);border-color:var(--wb-acc)}
.wb-tile:active:not(:disabled){transform:translateY(0)}
.wb-tile:disabled{cursor:default}
.wb-tile.wb-used{opacity:.28}
.wb-tile.wb-lock{opacity:.55}
.wb-idx{position:absolute;top:4px;right:7px;font-size:9px;font-style:normal;font-weight:700;color:var(--wb-mut)}
.wb-tray{display:flex;gap:8px;align-items:center;justify-content:center;flex-wrap:wrap;min-height:52px;border:1px dashed var(--wb-line);border-radius:10px;background:var(--wb-card);padding:8px 10px}
.wb-ghost{color:var(--wb-mut);font-size:13px}
.wb-chip-in{display:inline-flex;align-items:center;gap:6px;background:#eef2ff;color:#3730a3;border:1px solid #c7d2fe;border-radius:8px;padding:8px 12px;font-size:17px;font-weight:800;cursor:pointer;font-family:inherit;animation:wb-pop .18s ease-out}
.wb-chip-in:focus-visible{outline:2px solid var(--wb-acc);outline-offset:2px}
.wb-chip-in i{font-style:normal;font-size:11px;opacity:.45}
.wb-chip-in:hover i{opacity:1;color:var(--wb-bad)}
.wb-keys{display:flex;gap:8px;justify-content:center;flex-wrap:wrap}
.wb-msg{min-height:20px;text-align:center;font-size:13px;font-weight:600;color:var(--wb-mut)}
.wb-msg.wb-good{color:var(--wb-good)} .wb-msg.wb-bad{color:var(--wb-bad)}
.wb-hint{text-align:center;font-size:13px;font-weight:700;color:#92400e;background:#fffbeb;border:1px solid #fde68a;border-radius:10px;padding:8px 12px;letter-spacing:.08em}
.wb-hint small{display:block;font-weight:600;letter-spacing:0;color:#b45309;margin-top:4px}
.wb-found{display:flex;gap:8px;flex-wrap:wrap;justify-content:center;min-height:30px}
.wb-chip-found{display:inline-block;border-radius:999px;padding:6px 12px;font-size:12.5px;font-weight:700;letter-spacing:.05em;animation:wb-pop .22s ease-out}
.wb-chip-found.p0{background:#eef2ff;color:#3730a3} .wb-chip-found.p1{background:#fff1f2;color:#9f1239}

/* --- overlay modal: fixed head/foot, scrollable body --- */
.wb-ov{position:absolute;inset:0;z-index:5;display:grid;place-items:center;padding:12px;background:rgba(251,251,252,.94);backdrop-filter:blur(3px)}
.wb-ov[data-ov="help"]{z-index:50}
.wb-card{display:flex;flex-direction:column;width:min(470px,100%);max-height:100%;padding:16px 18px;background:var(--wb-card);border:1px solid var(--wb-line);border-radius:12px;box-shadow:0 4px 16px rgba(0,0,0,.06);overflow:hidden}
.wb-head{display:flex;align-items:center;justify-content:space-between;gap:10px;flex:none;margin-bottom:8px}
.wb-head h3{margin:0;font-size:19px}
.wb-head h3.wb-win{color:var(--wb-good)} .wb-head h3.wb-lose{color:var(--wb-bad)}
.wb-body{flex:1 1 auto;min-height:0;overflow:auto}
.wb-foot{flex:none;display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:12px}
.wb-note{font-size:11px;color:var(--wb-mut)}
.wb-sub{margin:0 0 12px;font-size:13.5px;color:var(--wb-mut);line-height:1.5}
.wb-rules{margin:0 0 12px;padding-left:18px;font-size:13px;line-height:1.65;color:var(--wb-ink)}
.wb-info{font-size:12.5px;color:var(--wb-mut);background:var(--wb-bg);border:1px solid var(--wb-line);border-radius:8px;padding:8px 10px;margin:0 0 12px}
.wb-ovbtns{display:flex;gap:8px;flex-wrap:wrap}
.wb-help h4{margin:12px 0 4px;font-size:13px;text-transform:uppercase;letter-spacing:.06em;color:var(--wb-mut)}
.wb-help ul{margin:0;padding-left:18px;font-size:13px;line-height:1.65}
.wb-help kbd{background:var(--wb-bg);border:1px solid var(--wb-line);border-bottom-width:2px;border-radius:5px;padding:0 5px;font-size:11.5px;font-family:inherit;font-weight:700}
.wb-results{display:flex;flex-direction:column;gap:8px;margin-bottom:12px}
.wb-res{border:1px solid var(--wb-line);border-radius:8px;padding:10px 12px;font-size:12.5px}
.wb-res b{display:block;font-size:13.5px}
.wb-res span{color:var(--wb-mut)}
.wb-res em{display:block;font-style:normal;margin-top:4px;letter-spacing:.04em;font-weight:600}
.wb-res.p0{border-left:3px solid var(--wb-acc)} .wb-res.p1{border-left:3px solid var(--wb-rose)}
.wb-cheatgrid{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.wb-answer{max-height:170px;overflow:auto;border:1px solid var(--wb-line);border-radius:8px;padding:10px;margin-bottom:12px;background:var(--wb-bg)}
.wb-answer p{margin:0 0 8px;font-size:12px;color:var(--wb-mut)}
.wb-wordpick{display:inline-flex;gap:6px;align-items:baseline;margin:0 8px 8px 0;border:1px solid var(--wb-line);background:var(--wb-card);border-radius:8px;padding:6px 10px;min-height:40px;font:inherit;font-size:12.5px;font-weight:700;cursor:pointer}
.wb-wordpick:hover{border-color:var(--wb-acc);color:var(--wb-acc)}
.wb-wordpick small{color:var(--wb-mut);font-weight:600}
@keyframes wb-pop{from{transform:scale(.5);opacity:0}to{transform:scale(1);opacity:1}}
@keyframes wb-pulse{0%,100%{opacity:1}50%{opacity:.35}}
@media (pointer:coarse){
  .wb-app .wb-tile{width:56px;height:64px;font-size:26px}
  .wb-app .wb-idx{display:none}
  .wb-app .wb-keys .wb-btn{min-height:48px;padding:10px 18px;font-size:15px}
  .wb-app .wb-chip-in{padding:10px 13px;font-size:19px}
}
@media (max-width:520px){
  .wb-app .wb-board{padding:10px}
  .wb-app .wb-tile{width:clamp(42px,12vw,52px);height:56px;font-size:21px}
  .wb-app .wb-hud-info{gap:5px}
  .wb-app .wb-cheatgrid{grid-template-columns:1fr}
}
@media (max-width:390px){.wb-app .wb-tile{width:clamp(38px,11vw,46px);height:52px;font-size:19px}}
@media (prefers-reduced-motion:reduce){.wb-app *{animation:none!important;transition:none!important}}

/* --- fill height + mobile refinements (PALING AKHIR) --- */
.wb-icon-btn svg{flex:none;display:block}
.wb-card{overflow:hidden}
.wb-head,.wb-foot{flex:none}
.wb-body{flex:1 1 auto;min-height:0;overflow:auto}
@media (max-width:640px){
.wb-app.game-fill > .wb-board:not(:has(.wb-ov:not([hidden]))){flex:1 1 auto;min-height:0}
.wb-app.game-fill > .wb-board:has(.wb-ov:not([hidden])){flex:0 0 auto;min-height:min(70dvh,620px)}
.wb-app .wb-hud{gap:5px;margin-bottom:0}
.wb-app .wb-hud .wb-hud-info,
.wb-app .wb-hud .wb-hud-actions{gap:5px}
.wb-app .wb-hud .wb-hud-actions{margin-left:auto}
.wb-app .wb-hud .wb-chip{padding:4px 6px;font-size:9px;min-height:0}
.wb-app .wb-hud .wb-chip[data-hud="bestchip"]{display:none}
.wb-app .wb-hud .wb-btn{min-height:32px;padding:5px 8px;font-size:9px}
.wb-app .wb-hud .wb-btn-label,
.wb-app .wb-hud .wb-spacer{display:none}
.wb-app .wb-ov{padding:8px}
.wb-app .wb-card{width:100%;height:100%;max-height:100%;padding:12px;border-radius:12px}
.wb-app .wb-body{scrollbar-width:none}
.wb-app .wb-body::-webkit-scrollbar{display:none}
.wb-app .wb-foot{position:static;margin:0;padding:10px 0 0;border-top:1px solid var(--wb-line)}
.wb-app .wb-note{display:none}
}
</style>
<div class="game-app wb-app game-fill" data-wb>
  <div class="wb-hud">
    <div class="wb-hud-info">
      <span class="wb-chip"><i class="wb-dot" data-dot></i><b data-hud="status">Ready</b></span>
      <span class="wb-chip">LV <b data-hud="level">1</b></span>
      <span class="wb-chip">YOU <b data-hud="seat">P1</b></span>
      <span class="wb-chip" data-pchip="0">P1 <b data-hud="words0">0/${TARGET}</b> · <b data-hud="score0">0</b> · <b data-clock="0">${TIME_MS / 1000}s</b></span>
      <span class="wb-chip" data-pchip="1">P2 <b data-hud="words1">0/${TARGET}</b> · <b data-hud="score1">0</b> · <b data-clock="1">${TIME_MS / 1000}s</b></span>
      <span class="wb-chip" data-hud="bestchip">BEST <b data-hud="best">0</b></span>
    </div>
    <span class="wb-spacer"></span>
    <div class="wb-hud-actions">
      <button class="wb-btn wb-icon-btn" type="button" data-act="shuffle" aria-label="Shuffle rack" title="Shuffle rack (Space)">${iconSVG("repeat", { size: 14 })}<span class="wb-btn-label">Shuffle</span></button>
      <button class="wb-btn wb-icon-btn" type="button" data-act="pass" data-passbtn aria-label="Pass turn" title="Pass turn (−5s)">${iconSVG("skipForward", { size: 14 })}<span class="wb-btn-label">Pass</span></button>
      <button class="wb-btn wb-icon-btn" type="button" data-help aria-label="How to play" title="How to play (H)">${iconSVG("helpCircle", { size: 14 })}<span class="wb-btn-label">Help</span></button>
      <button class="wb-btn wb-icon-btn" type="button" data-cheats aria-label="Cheats" title="Cheats (C)">${iconSVG("wrench", { size: 14 })}<span class="wb-btn-label">Cheats</span></button>
      <button class="wb-btn wb-icon-btn" type="button" data-pause aria-label="Pause" title="Pause (P / Esc)">${iconSVG("pause", { size: 14 })}<span class="wb-btn-label">Pause</span></button>
      <button class="wb-btn wb-icon-btn" type="button" data-restart aria-label="Restart" title="New rack (R)">${iconSVG("refresh", { size: 14 })}<span class="wb-btn-label">Restart</span></button>
      <button class="wb-btn wb-icon-btn" type="button" data-exit aria-label="Exit game" title="Exit game">${iconSVG("logOut", { size: 14 })}<span class="wb-btn-label">Exit game</span></button>
    </div>
  </div>
  <section class="game-panel wb-board" data-board>
    <div class="wb-play">
      <div class="wb-rack" data-tiles></div>
      <div class="wb-tray" data-tray></div>
      <div class="wb-keys">
        <button type="button" class="wb-btn" data-act="back" title="Backspace">⌫</button>
        <button type="button" class="wb-btn" data-act="clear">Clear</button>
        <button type="button" class="wb-btn wb-primary" data-act="submit" title="Enter">Submit ↵</button>
      </div>
      <div class="wb-msg" data-msg aria-live="polite"></div>
      <div class="wb-hint" data-hint hidden></div>
      <div class="wb-found" data-found></div>
    </div>

    <div class="wb-ov" data-ov="start">
      <div class="wb-card" role="dialog" aria-label="Start game">
        <div class="wb-head"><h3>Word Builder</h3><span class="wb-note">LV <span data-startlevel>1</span></span></div>
        <div class="wb-body">
          <p class="wb-sub">A turn-based word duel. Same seven tiles, two players — first to <b>${TARGET} words</b> wins.</p>
          <ul class="wb-rules">
            <li>Build words of <b>${MIN_LEN}+ letters</b> from the rack; each tile at most once per word.</li>
            <li>The rack is shared — every word can be claimed <b>only once</b> per round.</li>
            <li>Each side has a <b>${TIME_MS / 1000}s</b> clock. Passing costs ${PASS_COST_MS / 1000}s. Longer words score more.</li>
            <li>Two wrong guesses unlock a <b>hint</b> — more misses reveal more letters.</li>
          </ul>
          <p class="wb-info" data-startinfo></p>
        </div>
        <div class="wb-foot">
          <span class="wb-note">Press H for the guide</span>
          <div class="wb-ovbtns">
            <button type="button" class="wb-btn wb-primary" data-act="start">Start game</button>
            <button type="button" class="wb-btn" data-act="help">How to play</button>
          </div>
        </div>
      </div>
    </div>
    <div class="wb-ov" data-ov="wait" hidden>
      <div class="wb-card">
        <div class="wb-head"><h3>Waiting for host…</h3></div>
        <div class="wb-body"><p class="wb-sub">The host will start the round. Seats and the first move are drawn randomly.</p></div>
      </div>
    </div>
    <div class="wb-ov" data-ov="over" hidden>
      <div class="wb-card" role="dialog" aria-label="Round results">
        <div class="wb-head"><h3 data-overtitle>Game over</h3><span class="wb-note">LV <span data-overlevel>1</span></span></div>
        <div class="wb-body">
          <p class="wb-sub" data-overreason></p>
          <div class="wb-results" data-overresults></div>
          <p class="wb-info" data-overbest></p>
        </div>
        <div class="wb-foot">
          <span class="wb-note">Best is kept on this device</span>
          <div class="wb-ovbtns">
            <button type="button" class="wb-btn wb-primary" data-act="next">Next level</button>
            <button type="button" class="wb-btn" data-act="restart">Replay level</button>
          </div>
        </div>
      </div>
    </div>
    <div class="wb-ov" data-ov="pause" hidden>
      <div class="wb-card">
        <div class="wb-head"><h3>Paused</h3></div>
        <div class="wb-body"><p class="wb-sub">Clocks, the bot and pending timers are frozen. Online rounds never pause.</p></div>
        <div class="wb-foot"><span class="wb-note">Press P or Esc to resume</span><button type="button" class="wb-btn wb-primary" data-act="resume">Resume</button></div>
      </div>
    </div>
    <div class="wb-ov" data-ov="help" hidden>
      <div class="wb-card wb-help" role="dialog" aria-label="How to play">
        <div class="wb-head"><h3>How to play</h3><button type="button" class="wb-btn" data-act="helpclose" aria-label="Close help">${iconSVG("x", { size: 14 })}</button></div>
        <div class="wb-body wb-help">
          <h4>Goal</h4>
          <ul>
            <li>Take turns building words (≥ ${MIN_LEN} letters) from the shared 7-tile rack. Each tile once per word, each word once per round.</li>
            <li>First to <b>${TARGET} words</b> wins. If the rack runs dry, the higher word count (then score) wins. If your ${TIME_MS / 1000}s clock empties, you lose.</li>
            <li>Score = letters × 10. <b>Pass</b> skips your turn and costs ${PASS_COST_MS / 1000}s.</li>
          </ul>
          <h4>Hints</h4>
          <ul><li>After <b>2 wrong guesses in a row</b>, a hint appears: the length + first letter of an easy remaining word. Every extra miss reveals one more letter. A correct word resets the streak.</li></ul>
          <h4>Desktop — keyboard &amp; mouse</h4>
          <ul>
            <li>Type <kbd>A</kbd>–<kbd>Z</kbd> to add letters, or press <kbd>1</kbd>–<kbd>7</kbd> / click a tile.</li>
            <li><kbd>Enter</kbd> submit · <kbd>Backspace</kbd> delete · <kbd>Space</kbd> shuffle · <kbd>Esc</kbd> close panels · <kbd>?</kbd> this guide.</li>
            <li><kbd>H</kbd> help · <kbd>C</kbd> cheats · <kbd>P</kbd> pause · <kbd>R</kbd> new rack — hold <kbd>Shift</kbd> for these while it is your turn, since letters are game input.</li>
            <li>Click a letter chip in the tray to remove it.</li>
          </ul>
          <h4>Mobile — virtual keys</h4>
          <ul><li>Tap the letter tiles as your keyboard, then use the on-screen <b>⌫ / Clear / Submit</b> buttons. Tap a tray chip to remove a letter. Shuffle, Pass and the other controls live in the HUD.</li></ul>
          <h4>Levels &amp; fairness</h4>
          <ul>
            <li>Every rack is randomly generated and <b>verified solvable</b> (≥ ${MIN_WORDS} valid words). Next level = fresh rack.</li>
            <li>VS bot: a coin flip decides who starts. Multiplayer: seats (P1/P2) <b>and</b> the first move are re-drawn every round.</li>
            <li>Solo play pauses while this guide, the cheat console or the pause panel is open. Online play never pauses.</li>
          </ul>
          <h4>Cheats</h4>
          <ul><li>The cheat console works in solo/vs-bot only — it is disabled in online rooms.</li></ul>
        </div>
        <div class="wb-foot"><span class="wb-note">Press H to reopen this guide</span><button type="button" class="wb-btn wb-primary" data-act="helpclose">Got it</button></div>
      </div>
    </div>
    <div class="wb-ov" data-ov="cheats" hidden>
      <div class="wb-card" role="dialog" aria-label="Cheat console">
        <div class="wb-head"><h3>Cheat console</h3><button type="button" class="wb-btn" data-act="cheatclose" aria-label="Close cheats">${iconSVG("x", { size: 14 })}</button></div>
        <div class="wb-body">
          <p class="wb-sub">Solo only. The clock is paused while this panel is open.</p>
          <div class="wb-cheatgrid">
            <button type="button" class="wb-btn" data-act="cheat-reveal" data-cheat="reveal">Reveal answers</button>
            <button type="button" class="wb-btn" data-act="cheat-freeze" data-cheat="freeze">Freeze my clock</button>
            <button type="button" class="wb-btn" data-act="cheat-time" data-cheat="needplay">+30s clock</button>
            <button type="button" class="wb-btn" data-act="cheat-auto" data-cheat="needplay">Auto-play best word</button>
            <button type="button" class="wb-btn" data-act="cheat-turn" data-cheat="needplay">Force my turn</button>
            <button type="button" class="wb-btn" data-act="cheat-win" data-cheat="needplay">Win instantly</button>
          </div>
          <div class="wb-answer" data-answers hidden></div>
        </div>
        <div class="wb-foot"><span class="wb-note">Solo only</span><button type="button" class="wb-btn" data-act="cheatclose">Close</button></div>
      </div>
    </div>
  </section>
</div>`;

    /* ---------- refs ---------- */
    const $ = (s, r) => (r || root).querySelector(s);
    const hud = {
        status: $('[data-hud="status"]'), dot: $('[data-dot]'),
        level: $('[data-hud="level"]'), seat: $('[data-hud="seat"]'),
        words: [$('[data-hud="words0"]'), $('[data-hud="words1"]')],
        score: [$('[data-hud="score0"]'), $('[data-hud="score1"]')],
        best: $('[data-hud="best"]'), bestChip: $('[data-hud="bestchip"]'),
        pchip: [$('[data-pchip="0"]'), $('[data-pchip="1"]')],
    };
    const tilesEl = $("[data-tiles]"), trayEl = $("[data-tray]");
    const msgEl = $("[data-msg]"), hintEl = $("[data-hint]"), foundEl = $("[data-found]");
    const ovStart = $('[data-ov="start"]'), ovWait = $('[data-ov="wait"]'), ovOver = $('[data-ov="over"]');
    const ovPause = $('[data-ov="pause"]'), ovHelp = $('[data-ov="help"]'), ovCheats = $('[data-ov="cheats"]');
    const startInfo = $("[data-startinfo]"), startLevel = $("[data-startlevel]");
    const overTitle = $("[data-overtitle]"), overLevel = $("[data-overlevel]");
    const overReason = $("[data-overreason]"), overResults = $("[data-overresults]"), overBest = $("[data-overbest]");
    const answersEl = $("[data-answers]");
    const btnSubmit = $('[data-act="submit"]'), btnBack = $('[data-act="back"]');
    const btnClear = $('[data-act="clear"]'), btnShuffle = $('[data-act="shuffle"]');
    const btnPass = $("[data-passbtn]"), btnRestart = $("[data-restart]");
    const btnCheats = $("[data-cheats]"), btnPause = $("[data-pause]");

    /* ---------- small helpers ---------- */
    const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
    const mySeat = () => !online ? 0 : !state ? (room.isHost ? 0 : 1) : (room.isHost ? state.seats.hostSeat : 1 - state.seats.hostSeat);
    const myTurn = () => Boolean(state && state.phase === "playing" && state.turn === mySeat());
    const playing = () => Boolean(state && state.phase === "playing");
    const trayWord = () => tray.map((i) => state.letters[i]).join("");
    const nameOf = (i) => (state ? state.players[i].name : "…");

    function bestScore() { try { return Number(localStorage.getItem(META.bestKey)) || 0; } catch { return 0; } }
    function saveBest() {
        try {
            const my = state.players[mySeat()]?.score || 0;
            if (my > bestScore()) localStorage.setItem(META.bestKey, String(my));
        } catch { /* storage unavailable */ }
    }
    function msgLocal(text, mood) {
        localMsg = { text, mood };
        later(() => { localMsg = null; renderMsg(); }, 1900);
        renderMsg();
    }
    function remainingWords(s) {
        const used = new Set([...s.players[0].words, ...s.players[1].words]);
        return buildableWords(s.letters)
            .filter((w) => !used.has(w))
            .sort((a, b) => a.length - b.length || (a < b ? -1 : 1));
    }
    function reasonText(reason, word) {
        return reason === "short" ? `Words need at least ${MIN_LEN} letters.`
            : reason === "dict" ? `“${word}” is not in the game dictionary.`
                : reason === "used" ? `“${word}” was already claimed — try another.`
                    : "Your tiles cannot spell that word.";
    }

    /* ---------- tray (tile-index based: duplicate letters are safe) ---------- */
    function addTile(i) {
        if (!playing() || frozen()) return;
        if (!myTurn()) { msgLocal("Wait for your turn.", "bad"); return; }
        if (tray.includes(i)) { msgLocal("That tile is already used.", "bad"); return; }
        if (tray.length >= state.letters.length) return;
        tray.push(i);
        render();
    }
    function addLetter(ch) {
        if (!playing() || !myTurn() || frozen()) { if (playing() && !frozen()) msgLocal("Wait for your turn.", "bad"); return; }
        for (let i = 0; i < state.letters.length; i++) {
            if (state.letters[i] === ch && !tray.includes(i)) { tray.push(i); render(); return; }
        }
        msgLocal(`No free “${ch}” tile left.`, "bad");
    }
    function removeAt(pos) {
        if (pos < 0 || pos >= tray.length || frozen()) return;
        tray.splice(pos, 1);
        render();
    }
    function fillTray(word) {
        const next = [], used = new Set();
        for (const ch of word) {
            let found = -1;
            for (let i = 0; i < state.letters.length; i++) {
                if (state.letters[i] === ch && !used.has(i)) { found = i; break; }
            }
            if (found < 0) return false;
            used.add(found); next.push(found);
        }
        tray = next;
        return true;
    }
    function remapTray(oldL, newL) {
        const selected = tray.map((i) => oldL[i]);
        const used = new Set(), next = [];
        for (const ch of selected) {
            for (let i = 0; i < newL.length; i++) {
                if (newL[i] === ch && !used.has(i)) { used.add(i); next.push(i); break; }
            }
        }
        tray = next;
    }

    /* ---------- state factory / lifecycle ---------- */
    function nameForSeat(seat, hostSeat) {
        if (!online) return seat === 0 ? (playerName || "Player") : "Bot";
        const players = Array.isArray(roomData?.players) ? roomData.players : [];
        const hostName = room.isHost ? (playerName || "Host") : (players.find((p) => p?.isHost)?.name || "Host");
        const guestName = room.isHost ? (players.find((p) => p && !p.isHost)?.name || "Guest") : (playerName || "Guest");
        return seat === hostSeat ? hostName : guestName;
    }
    function buildInitialState(level) {
        const levelSeed = (Math.random() * 0x7fffffff) | 0;
        const gen = generateLevel(levelSeed);
        const hostSeat = online ? (Math.random() < 0.5 ? 0 : 1) : 0; // random seat draw (multiplayer)
        const first = Math.random() < 0.5 ? 0 : 1;                    // random first move (coin flip)
        return {
            v: 1, seq: 0, phase: "ready", level, levelSeed,
            letters: gen.letters, seedWord: gen.seedWord,
            seats: { hostSeat }, first, turn: first,
            players: [0, 1].map((i) => ({ name: nameForSeat(i, hostSeat), words: [], score: 0, timeMs: TIME_MS, wrong: 0 })),
            log: [], hint: null, lastMove: null, winner: null, endReason: "",
        };
    }
    function newGame(next) {
        const level = next ? (state ? state.level + 1 : 1) : (state ? state.level : 1);
        state = buildInitialState(level);
        state.phase = "playing";
        tray = []; lastLetters = state.letters; seenSeq = state.seq; pendingWord = null;
        commit();
    }
    function endByExhausted() {
        const [a, b] = state.players;
        const w = a.words.length !== b.words.length ? (a.words.length > b.words.length ? 0 : 1)
            : a.score !== b.score ? (a.score > b.score ? 0 : 1) : -1;
        endGame(w, "exhausted");
    }
    function endGame(winner, reason) {
        state.phase = "over";
        state.winner = winner;
        state.endReason = reason;
        state.seq++;
        if (botTimer) { cancelLater(botTimer); botTimer = null; }
        saveBest();
        commit();
    }

    /* ---------- authoritative action handling (host / solo) ---------- */
    function applyAction(action, actor) {
        if (!state || !action || typeof action !== "object") return;
        const cheat = action.cheat === true && !online;
        switch (action.type) {
            case "start": {
                if (state.phase !== "ready") return;
                if (online && actor !== state.seats.hostSeat) return;
                state.phase = "playing";
                state.lastMove = null;
                state.seq++;
                break;
            }
            case "submit": {
                if (state.phase !== "playing") return;
                if (actor !== state.turn && !cheat) return;
                const word = String(action.word || "").toUpperCase().replace(/[^A-Z]/g, "").slice(0, state.letters.length);
                const all = [...state.players[0].words, ...state.players[1].words];
                const v = isFind(all, word, state.letters);
                state.seq++;
                if (!v.ok) {
                    const p = state.players[actor];
                    p.wrong++;
                    state.lastMove = { ok: false, by: actor, word, reason: v.reason };
                    /* hint after 2 consecutive wrong guesses; more misses reveal more letters */
                    if (p.wrong >= 2) {
                        const rem = remainingWords(state);
                        if (rem.length) {
                            const target = rem[0]; // shortest = easiest
                            state.hint = { for: actor, word: target, reveal: Math.min(p.wrong - 1, target.length - 1) };
                        }
                    }
                    break;
                }
                const p = state.players[actor];
                p.words.push(word);
                p.score += wordScore(word);
                p.wrong = 0;
                if (state.hint && state.hint.for === actor) state.hint = null;
                state.log.push({ by: actor, word, pts: wordScore(word) });
                state.lastMove = { ok: true, by: actor, word };
                if (p.words.length >= TARGET) { endGame(actor, "target"); return; }
                if (remainingWords(state).length === 0) { endByExhausted(); return; }
                state.turn = 1 - state.turn;
                break;
            }
            case "shuffle": {
                if (state.phase !== "playing") return;
                if (actor !== state.turn && !cheat) return;
                state.letters = shuffle(state.letters.split(""), rng((Math.random() * 1e9) | 0)).join("");
                state.seq++;
                break;
            }
            case "pass": {
                if (state.phase !== "playing") return;
                if (actor !== state.turn && !cheat) return;
                state.players[actor].timeMs = Math.max(0, state.players[actor].timeMs - PASS_COST_MS);
                state.seq++;
                state.lastMove = { ok: true, pass: true, by: actor };
                if (state.players[actor].timeMs <= 0) { endGame(1 - actor, "time"); return; }
                state.turn = 1 - state.turn;
                break;
            }
            case "restart": {
                if (online && actor !== state.seats.hostSeat && state.phase !== "over") return;
                newGame(action.next === true);
                return;
            }
            case "cheat": {
                if (online) return;
                applyCheat(action.op, actor);
                return;
            }
            default: return;
        }
        commit();
    }
    function applyCheat(op, actor) {
        switch (op) {
            case "time": state.players[actor].timeMs += 30000; state.seq++; commit(); break;
            case "turn": if (playing()) { state.turn = actor; state.seq++; commit(); } break;
            case "win": if (playing()) endGame(actor, "cheat"); break;
            case "auto": {
                if (!playing()) return;
                const rem = remainingWords(state);
                if (!rem.length) { endByExhausted(); return; }
                state.turn = actor;
                applyAction({ type: "submit", word: rem[rem.length - 1], cheat: true }, actor);
                break;
            }
        }
    }
    function submitAction(action) {
        if (!action || typeof action !== "object") return;
        if (frozen() && ["submit", "shuffle", "pass", "start"].indexOf(action.type) >= 0) return;
        if (online && !room.isHost) { room.sendAction(action).catch(console.warn); return; }
        applyAction(action, mySeat());
    }
    function trySubmit() {
        const word = trayWord();
        if (!word || !playing() || frozen()) return;
        if (!myTurn()) { msgLocal("Wait for your turn.", "bad"); return; }
        if (pendingWord) return;
        if (online && !room.isHost) {
            pendingWord = word;
            later(() => { pendingWord = null; render(); }, 3000); // safety net if host never confirms
        }
        submitAction({ type: "submit", word });
    }

    /* ---------- sync local UI with (possibly remote) state ---------- */
    function syncLocal() {
        if (!state) return;
        if (state.letters !== lastLetters) {
            const sameBag = lastLetters && lastLetters.split("").sort().join("") === state.letters.split("").sort().join("");
            if (sameBag) remapTray(lastLetters, state.letters); else tray = [];
            lastLetters = state.letters;
        }
        if (state.seq !== seenSeq) {
            seenSeq = state.seq;
            pendingWord = null;
            const lm = state.lastMove;
            if (lm && lm.ok && lm.by === mySeat() && lm.word && lm.word === trayWord()) tray = [];
        }
    }
    function commit() {
        syncLocal();
        render();
        if (online && room.isHost) room.publishState(state).catch(console.warn);
        if (!online) scheduleBot();
    }

    /* ---------- bot ---------- */
    function pickBotWord() {
        const rem = remainingWords(state);
        if (!rem.length) return null;
        const p = Math.min(2.4, 1.2 + state.level * 0.15); // higher level → prefers longer words
        let best = null, bestW = -1;
        for (const w of rem) {
            const weight = Math.pow(w.length, p) * (0.5 + Math.random());
            if (weight > bestW) { bestW = weight; best = w; }
        }
        return best;
    }
    function scheduleBot() {
        if (botTimer) { cancelLater(botTimer); botTimer = null; }
        if (online || !state || state.phase !== "playing" || state.turn !== BOT) return;
        const delay = Math.max(700, 1400 + Math.random() * 2200 - state.level * 60);
        botTimer = later(() => {
            botTimer = null;
            if (!state || state.phase !== "playing" || state.turn !== BOT) return;
            if (frozen()) { scheduleBot(); return; } // solo pause while panels are open
            const w = pickBotWord();
            if (!w) { endByExhausted(); return; }
            applyAction({ type: "submit", word: w }, BOT);
        }, delay);
    }

    /* ---------- clocks ---------- */
    function startTick() {
        if (tickTimer || frozen()) return;
        stopTick();
        tickTimer = setInterval(() => {
            if (!state || state.phase !== "playing") return;
            if (frozen()) return;
            const i = state.turn;
            if (!online && freezeClock && i === mySeat()) { renderClocks(); return; }
            state.players[i].timeMs = Math.max(0, state.players[i].timeMs - TICK_MS);
            if (state.players[i].timeMs <= 0) { endGame(1 - i, "time"); return; }
            pubAcc += TICK_MS;
            if (online) {
                if (pubAcc >= 1000) { pubAcc = 0; commit(); } else renderClocks();
            } else renderClocks();
        }, TICK_MS);
    }
    function stopTick() { if (tickTimer) { clearInterval(tickTimer); tickTimer = null; } }
    function renderClocks() {
        if (!state) return;
        const now = performance.now();
        for (let i = 0; i < 2; i++) {
            const el = $(`[data-clock="${i}"]`);
            if (!el) continue;
            let ms = state.players[i].timeMs;
            if (online && !room.isHost && state.phase === "playing" && i === state.turn) {
                ms = Math.max(0, ms - (now - lastSync)); // guest-side interpolation between syncs
            }
            el.textContent = Math.ceil(ms / 1000) + "s";
            el.classList.toggle("wb-low", ms <= 15000 && ms > 0);
        }
    }

    /* ---------- rendering ---------- */
    function renderStatus() {
        let text = "Ready", color = "#9ca3af";
        if (!state) { text = "Connecting…"; }
        else if (state.phase === "ready") { text = online && !room.isHost ? "Waiting for host" : "Ready — press Start"; }
        else if (state.phase === "playing") {
            if (myTurn()) { text = "Your turn"; color = "#10b981"; }
            else { text = online ? "Opponent's turn" : "Bot is thinking…"; color = "#f59e0b"; }
        } else {
            const w = state.winner;
            text = w === -1 ? "Draw" : w === mySeat() ? "You win!" : "You lose";
            color = w === mySeat() ? "#10b981" : w === -1 ? "#9ca3af" : "#ef4444";
        }
        hud.status.textContent = text;
        hud.dot.style.background = color;
    }
    function renderScore() {
        const me = mySeat();
        hud.level.textContent = String(state.level);
        hud.seat.textContent = "P" + (me + 1);
        for (let i = 0; i < 2; i++) {
            const p = state.players[i];
            if (hud.words[i]) hud.words[i].textContent = `${p.words.length}/${TARGET}`;
            if (hud.score[i]) hud.score[i].textContent = String(p.score);
            const chip = hud.pchip[i];
            if (chip) chip.classList.toggle("wb-active", state.phase === "playing" && state.turn === i);
        }
        const b = bestScore();
        if (hud.best) hud.best.textContent = b > 0 ? String(b) : "0";
        if (hud.bestChip) hud.bestChip.hidden = b <= 0;
        renderClocks();
    }
    function renderTiles() {
        const locked = !myTurn() || frozen();
        tilesEl.innerHTML = state.letters.split("").map((ch, i) => {
            const used = tray.includes(i);
            const dis = used || locked;
            return `<button type="button" class="wb-tile${used ? " wb-used" : ""}${locked && !used ? " wb-lock" : ""}" data-tile="${i}" ${dis ? "disabled" : ""} aria-label="Letter ${ch}"><span>${ch}</span><i class="wb-idx">${i + 1}</i></button>`;
        }).join("");
    }
    function renderTray() {
        trayEl.innerHTML = tray.length
            ? tray.map((ti, pos) => `<button type="button" class="wb-chip-in" data-traychip="${pos}" title="Remove ${state.letters[ti]}">${state.letters[ti]}<i>×</i></button>`).join("")
            : `<span class="wb-ghost">${myTurn() ? "Tap tiles or type a word…" : "Waiting…"}</span>`;
        const locked = !myTurn() || frozen();
        btnSubmit.disabled = locked || !tray.length || Boolean(pendingWord);
        btnBack.disabled = locked || !tray.length;
        btnClear.disabled = locked || !tray.length;
        btnShuffle.disabled = locked;
        btnPass.disabled = locked;
        btnRestart.disabled = online && !room.isHost && state.phase !== "over";
    }
    function renderMsg() {
        let text = "", mood = "";
        if (localMsg) { text = localMsg.text; mood = localMsg.mood || ""; }
        else if (!state) text = "Connecting to room…";
        else if (state.phase === "ready") text = "Press Start — a coin flip picks the first move.";
        else if (state.phase === "over") text = state.winner === mySeat() ? "Round won. Ready for the next rack?" : state.winner === -1 ? "A perfectly balanced duel." : "Round lost. Redemption is one rack away.";
        else {
            const lm = state.lastMove;
            if (!lm) text = `Coin flip: ${nameOf(state.first)} goes first. You are P${mySeat() + 1}.`;
            else if (lm.pass) text = `${nameOf(lm.by)} passed (−${PASS_COST_MS / 1000}s).`;
            else if (lm.ok) { text = `${nameOf(lm.by)} played ${lm.word} (+${wordScore(lm.word)}).`; mood = lm.by === mySeat() ? "good" : ""; }
            else if (lm.by === mySeat()) { text = reasonText(lm.reason, lm.word); mood = "bad"; }
            else text = `${nameOf(lm.by)} is searching…`;
        }
        msgEl.textContent = text;
        msgEl.className = "wb-msg" + (mood ? " wb-" + mood : "");
    }
    function renderHint() {
        const h = state.hint;
        const show = Boolean(h && h.for === mySeat() && state.phase === "playing");
        hintEl.hidden = !show;
        if (show) hintEl.innerHTML = `Hint · ${h.word.length} letters: ${hintPattern(h.word, h.reveal)}<small>Wrong guesses reveal more letters. A correct word clears the streak.</small>`;
    }
    function renderFound() {
        foundEl.innerHTML = state.log.length
            ? state.log.map((m) => `<span class="wb-chip-found p${m.by}">${m.word} +${m.pts}</span>`).join("")
            : `<span class="wb-ghost">No words claimed yet — first to ${TARGET} wins.</span>`;
    }
    function renderOverlays() {
        const ready = Boolean(state && state.phase === "ready");
        const solo = !online || room.isHost;
        ovStart.hidden = !ready || !solo || showHelp || showCheats || paused;
        ovWait.hidden = !(online && !room.isHost && (!state || ready)) || showHelp || showCheats || paused;
        ovOver.hidden = !(state && state.phase === "over") || showHelp || showCheats || paused;
        ovPause.hidden = !paused || showHelp || showCheats;
        ovCheats.hidden = !showCheats || showHelp || paused;
        ovHelp.hidden = !showHelp;
        if (!ovStart.hidden) {
            startLevel.textContent = String(state.level);
            startInfo.innerHTML = `You are <b>P${mySeat() + 1}</b> (${esc(nameOf(mySeat()))}). Coin flip: <b>${esc(nameOf(state.first))}</b> starts.${online ? " Seats &amp; first move are re-drawn every round." : ""}`;
        }
        if (!ovOver.hidden) {
            const w = state.winner, me = mySeat();
            overTitle.textContent = w === -1 ? "Draw" : w === me ? "You win!" : "You lose";
            overTitle.className = w === -1 ? "" : w === me ? "wb-win" : "wb-lose";
            overLevel.textContent = String(state.level);
            const r = state.endReason;
            overReason.textContent =
                r === "target" ? (w === me ? `You reached ${TARGET} words first.` : `${nameOf(w)} reached ${TARGET} words first.`)
                    : r === "time" ? (w === me ? "Your rival's clock ran out." : "Your clock ran out.")
                        : r === "exhausted" ? "Every possible word was claimed — highest count (then score) wins."
                            : "The cheat console decided this one. No judgment.";
            overResults.innerHTML = [0, 1].map((i) => {
                const p = state.players[i];
                return `<div class="wb-res p${i}"><b>${esc(p.name)}${i === me ? " (you)" : ""}</b><span>${p.score} pts · ${p.words.length} words · ${Math.ceil(p.timeMs / 1000)}s left</span><em>${p.words.join(", ") || "—"}</em></div>`;
            }).join("");
            overBest.textContent = bestScore() > 0 ? `Best score so far: ${bestScore()} pts` : "";
        }
    }
    function renderCheats() {
        btnCheats.disabled = online;
        btnCheats.title = online ? "Cheats are disabled in online rooms" : "Open the cheat console";
        btnCheats.classList.toggle("wb-on", showCheats);
        if (!showCheats || !state) return;
        const revealBtn = $('[data-cheat="reveal"]'), freezeBtn = $('[data-cheat="freeze"]');
        revealBtn.textContent = `Reveal answers: ${cheatReveal ? "ON" : "OFF"}`;
        revealBtn.classList.toggle("wb-on", cheatReveal);
        freezeBtn.textContent = `Freeze my clock: ${freezeClock ? "ON" : "OFF"}`;
        freezeBtn.classList.toggle("wb-on", freezeClock);
        root.querySelectorAll('[data-cheat="needplay"]').forEach((b) => { b.disabled = !playing(); });
        answersEl.hidden = !cheatReveal;
        if (cheatReveal) {
            const rem = remainingWords(state);
            answersEl.innerHTML = `<p>Seed word: <b>${state.seedWord}</b> (rack = shuffle, possibly ±1 letter). ${rem.length} words left — tap one to fill your tray:</p>` +
                (rem.map((w) => `<button type="button" class="wb-wordpick" data-wordpick="${w}">${w}<small>${w.length}</small></button>`).join("") || "<p>Nothing left!</p>");
        }
    }
    function syncHudButtons() {
        const label = btnPause.querySelector(".wb-btn-label");
        if (label) label.textContent = paused ? "Resume" : "Pause";
        btnPause.setAttribute("aria-label", paused ? "Resume" : "Pause");
        btnPause.disabled = online;
    }
    function render() {
        renderStatus();
        syncHudButtons();
        if (!state) {
            ovStart.hidden = true;
            ovWait.hidden = !(online && !room.isHost) || showHelp || showCheats || paused;
            ovOver.hidden = true;
            ovPause.hidden = !paused || showHelp || showCheats;
            ovCheats.hidden = !showCheats || showHelp;
            ovHelp.hidden = !showHelp;
            btnSubmit.disabled = btnBack.disabled = btnClear.disabled = btnShuffle.disabled = btnPass.disabled = true;
            return;
        }
        renderScore();
        renderTiles();
        renderTray();
        renderMsg();
        renderHint();
        renderFound();
        renderOverlays();
        renderCheats();
    }

    /* ---------- overlay toggles (mutually exclusive, freeze-aware) ---------- */
    function toggleHelp(on) {
        showHelp = typeof on === "boolean" ? on : !showHelp;
        if (showHelp) { showCheats = false; paused = false; }
        syncFreeze();
        render();
    }
    function toggleCheats(on) {
        if (online) return;
        showCheats = typeof on === "boolean" ? on : !showCheats;
        if (showCheats) { showHelp = false; paused = false; }
        syncFreeze();
        render();
    }
    function setPaused(on) {
        if (online) return;
        paused = typeof on === "boolean" ? on : !paused;
        if (paused) { showHelp = false; showCheats = false; }
        syncFreeze();
        render();
    }

    /* ---------- input: mouse / touch (delegated) ---------- */
    function handleClick(event) {
        const el = event.target.closest("[data-exit],[data-act],[data-tile],[data-traychip],[data-wordpick],[data-help],[data-cheats],[data-pause],[data-restart]");
        if (!el || !root.contains(el)) return;
        if (el.hasAttribute("data-exit")) { onExit(); return; }
        if (el.hasAttribute("data-help")) { toggleHelp(); return; }
        if (el.hasAttribute("data-cheats")) { toggleCheats(); return; }
        if (el.hasAttribute("data-pause")) { setPaused(); return; }
        if (el.hasAttribute("data-restart")) { submitAction({ type: "restart", next: false }); return; }
        if (el.dataset.tile !== undefined) { addTile(Number(el.dataset.tile)); return; }
        if (el.dataset.traychip !== undefined) { removeAt(Number(el.dataset.traychip)); return; }
        if (el.dataset.wordpick) {
            if (myTurn() && !paused && !showHelp && fillTray(el.dataset.wordpick)) { showCheats = false; syncFreeze(); render(); }
            else msgLocal("Wait for your turn.", "bad");
            return;
        }
        switch (el.dataset.act) {
            case "start": submitAction({ type: "start" }); break;
            case "resume": setPaused(false); break;
            case "submit": trySubmit(); break;
            case "back": removeAt(tray.length - 1); break;
            case "clear": tray = []; render(); break;
            case "shuffle": submitAction({ type: "shuffle" }); break;
            case "pass": submitAction({ type: "pass" }); break;
            case "restart": submitAction({ type: "restart", next: false }); break;
            case "next": submitAction({ type: "restart", next: true }); break;
            case "help": toggleHelp(); break;
            case "helpclose": toggleHelp(false); break;
            case "cheats": toggleCheats(); break;
            case "cheatclose": toggleCheats(false); break;
            case "cheat-reveal": cheatReveal = !cheatReveal; render(); break;
            case "cheat-freeze": freezeClock = !freezeClock; render(); break;
            case "cheat-time": submitAction({ type: "cheat", op: "time" }); break;
            case "cheat-turn": submitAction({ type: "cheat", op: "turn" }); break;
            case "cheat-auto": submitAction({ type: "cheat", op: "auto" }); break;
            case "cheat-win": submitAction({ type: "cheat", op: "win" }); break;
        }
    }

    /* ---------- input: physical keyboard (desktop) ---------- */
    function onKey(event) {
        if (!root.isConnected) return;
        const t = event.target;
        if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
        if (event.ctrlKey || event.metaKey || event.altKey) return;
        if ((event.key === "Enter" || event.key === " ") && t && t.closest && t.closest("button")) return;
        const k = event.key, c = event.code;
        /* Letters are gameplay input on the player's turn; Shift (or any
           non-typing context) turns H/C/P/R into HUD shortcuts. */
        const typing = Boolean(state && state.phase === "playing" && myTurn() && !frozen());
        const shortcut = () => event.shiftKey || !typing;
        /* priority: help → cheats → pause/Escape → restart → game actions */
        if (c === "KeyH" && shortcut()) { toggleHelp(); event.preventDefault(); return; }
        if (k === "?") { toggleHelp(); event.preventDefault(); return; }
        if (c === "KeyC" && shortcut()) { toggleCheats(); event.preventDefault(); return; }
        if (c === "KeyP" && shortcut()) {
            if (showHelp) toggleHelp(false);
            else if (showCheats) toggleCheats(false);
            else setPaused();
            event.preventDefault(); return;
        }
        if (k === "Escape") {
            if (showHelp) toggleHelp(false);
            else if (showCheats) toggleCheats(false);
            else if (paused) setPaused(false);
            event.preventDefault(); return;
        }
        if (c === "KeyR" && shortcut()) { submitAction({ type: "restart", next: false }); event.preventDefault(); return; }
        if (frozen()) {
            if (k === "Enter" || k === " ") {
                if (showHelp) toggleHelp(false);
                else if (showCheats) toggleCheats(false);
                else if (paused) setPaused(false);
                event.preventDefault();
            }
            return;
        }
        if (!state) return;
        if (state.phase === "ready") {
            if (k === "Enter" && (!online || room.isHost)) { submitAction({ type: "start" }); event.preventDefault(); }
            return;
        }
        if (state.phase === "over") {
            if (k === "Enter") { submitAction({ type: "restart", next: true }); event.preventDefault(); }
            return;
        }
        if (k === "Enter") { event.preventDefault(); trySubmit(); return; }
        if (k === "Backspace") { event.preventDefault(); removeAt(tray.length - 1); return; }
        if (k === " ") { event.preventDefault(); if (myTurn()) submitAction({ type: "shuffle" }); return; }
        if (k.length === 1 && /[a-z]/i.test(k)) { event.preventDefault(); addLetter(k.toUpperCase()); return; }
        if (/^[1-9]$/.test(k)) {
            const i = Number(k) - 1;
            if (i < state.letters.length) { event.preventDefault(); addTile(i); }
        }
    }

    root.addEventListener("click", handleClick);
    document.addEventListener("keydown", onKey);

    /* ---------- boot: room host / room guest / solo-vs-bot ---------- */
    if (online) {
        room.onRoom((nextRoom) => {
            roomData = nextRoom;
            if (state && room.isHost) {
                const hs = state.seats.hostSeat;
                const n0 = nameForSeat(0, hs), n1 = nameForSeat(1, hs);
                if (state.players[0].name !== n0 || state.players[1].name !== n1) {
                    state.players[0].name = n0; state.players[1].name = n1;
                    commit();
                    return;
                }
            }
            render();
        });
        if (room.isHost) {
            state = buildInitialState(1);
            lastLetters = state.letters; seenSeq = state.seq;
            commit();
            room.onAction((action) => applyAction(action, 1 - state.seats.hostSeat));
            startTick();
        } else {
            render();
            room.onState((nextState) => {
                state = nextState;
                lastSync = performance.now();
                syncLocal();
                render();
            });
            guestTimer = setInterval(renderClocks, TICK_MS);
        }
    } else {
        state = buildInitialState(1);
        lastLetters = state.letters; seenSeq = state.seq;
        commit();
        startTick();
    }
    syncFreeze();

    return {
        destroy() {
            root.removeEventListener("click", handleClick);
            document.removeEventListener("keydown", onKey);
            stopTick();
            if (guestTimer) { clearInterval(guestTimer); guestTimer = null; }
            clearTimers();
        },
    };
}
