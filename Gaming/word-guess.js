/* ==== GAME: word-guess.js ==== */
/*
  Word Guess - duel tebak kata (vs Bot / multiplayer room).
  Format template baru (ES module):
    1. META di bawah dibaca oleh tools/build-games-manifest.mjs
    2. mount(root, context) berisi seluruh logika game
  Simpan file ini sebagai games/word-guess.js (id META = nama file),
  lalu jalankan: node tools/build-games-manifest.mjs

  Fitur:
  - UI minimalis (kartu putih, garis tipis, satu warna aksen, tanpa emoji).
  - Overlay "How to play" + ringkasan aturan di layar start.
  - Level generator acak ber-seed; tiap kata DIVERIFIKASI bisa diselesaikan
    oleh solver internal dalam 6 salah (kata asli + kategori + hint).
  - Tombol Cheats (offline): reveal letter, peek word, erase miss, new word,
    stun bot. Hasil ditandai "assisted" dan tidak masuk skor terbaik.
  - Virtual letter pad untuk mobile (target sentuh >= 44px) + keyboard fisik
    A-Z, Enter (start), Esc (tutup panel) dan mouse untuk desktop.
  - Giliran pertama dilempar koin (acak) saat vs bot.
  - Posisi pemain (seat P1/P2) diacak tiap game saat multiplayer.
  - Hint kata terbuka otomatis setelah 2 tebakan salah.
*/

export const META = {
    id: "word-guess", // harus sama dengan nama file (tanpa .js)
    name: "Word Guess",
    category: "words",
    catLabel: "Word",
    desc: "A turn-based hangman duel. Guess letters, score points, and outscore your rival across five hidden words.",
    art: '<svg viewBox="0 0 48 48" width="54" height="54" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="15" width="11" height="16" rx="3"/><path d="M7 23h5"/><rect x="18.5" y="15" width="11" height="16" rx="3"/><path d="M21.5 23h5"/><rect x="33" y="15" width="11" height="16" rx="3" stroke-dasharray="4 4"/><path d="M38.5 20.5a2.4 2.4 0 1 1 2.4 2.4v1.4"/><circle cx="38.5" cy="26.8" r="1" fill="currentColor" stroke="none"/></svg>',
    bg: ["#e0e7ff", "#a5b4fc"],
    bestKey: "wordGuessBest",
};

/* ---------- pure logic ---------- */
const LIVES = 6; // salah maksimal per kata ( shared antar pemain )
const ROUNDS = 5; // jumlah kata per game
const HINT_AT = 2; // hint terbuka setelah 2 salah
const SOLVE_BONUS = 2; // bonus poin penyelesaian kata
const FREQ = "ETAOINSHRDLUCMFYWGPBVKXQJZ"; // frekuensi huruf Inggris

/* Bank kata: { w: kata, h: hint, c: kategori }.
   Tier kesulitan diturunkan dari panjang kata (4-5 / 6 / 7-8). */
const BANK = [
    { w: "MOON", h: "Earth's night light", c: "space" },
    { w: "STAR", h: "It twinkles at night", c: "space" },
    { w: "LION", h: "King of the jungle", c: "animal" },
    { w: "BEAR", h: "Honey-loving mammal", c: "animal" },
    { w: "WOLF", h: "Pack hunter that howls", c: "animal" },
    { w: "FROG", h: "Pond jumper", c: "animal" },
    { w: "CAKE", h: "Birthday dessert", c: "food" },
    { w: "BOOK", h: "Pages to read", c: "object" },
    { w: "LAMP", h: "Desk light", c: "object" },
    { w: "KITE", h: "Flies on a string", c: "object" },
    { w: "DRUM", h: "Hit it with sticks", c: "music" },
    { w: "SNOW", h: "White winter fall", c: "weather" },
    { w: "LEAF", h: "It falls in autumn", c: "nature" },
    { w: "RAIN", h: "Water from clouds", c: "weather" },
    { w: "GOLD", h: "Yellow precious metal", c: "material" },
    { w: "MILK", h: "White dairy drink", c: "food" },
    { w: "DOOR", h: "Room entrance", c: "object" },
    { w: "RING", h: "Finger jewelry", c: "object" },
    { w: "SHIP", h: "Ocean vessel", c: "travel" },
    { w: "TREE", h: "Tall wooden plant", c: "nature" },
    { w: "TIGER", h: "Striped big cat", c: "animal" },
    { w: "CLOUD", h: "Sky cotton", c: "weather" },
    { w: "BREAD", h: "Baked loaf", c: "food" },
    { w: "CHAIR", h: "Seat with a back", c: "object" },
    { w: "STORM", h: "Wild weather", c: "weather" },
    { w: "PIANO", h: "Keyboard instrument", c: "music" },
    { w: "BEACH", h: "Sandy shore", c: "place" },
    { w: "TRAIN", h: "Rail cars", c: "travel" },
    { w: "APPLE", h: "Red or green fruit", c: "food" },
    { w: "RIVER", h: "Flowing water", c: "nature" },
    { w: "HOUSE", h: "Place to live", c: "place" },
    { w: "STONE", h: "Small rock", c: "nature" },
    { w: "LIGHT", h: "It ends the dark", c: "nature" },
    { w: "DREAM", h: "Sleep movie", c: "mind" },
    { w: "EARTH", h: "Our planet", c: "space" },
    { w: "HONEY", h: "Bee-made sweet", c: "food" },
    { w: "OCEAN", h: "Vast salt water", c: "nature" },
    { w: "PEARL", h: "Gem from an oyster", c: "material" },
    { w: "ROBIN", h: "Red-breasted bird", c: "animal" },
    { w: "TULIP", h: "Cup-shaped flower", c: "nature" },
    { w: "ZEBRA", h: "Striped horse cousin", c: "animal" },
    { w: "PLANET", h: "It orbits a star", c: "space" },
    { w: "GUITAR", h: "Six-string instrument", c: "music" },
    { w: "CASTLE", h: "Fortified royal home", c: "place" },
    { w: "ROCKET", h: "It blasts into space", c: "space" },
    { w: "SILVER", h: "Grey precious metal", c: "material" },
    { w: "WINTER", h: "Coldest season", c: "weather" },
    { w: "BRIDGE", h: "It crosses a river", c: "place" },
    { w: "PUZZLE", h: "Problem made for fun", c: "game" },
    { w: "GALAXY", h: "Island of stars", c: "space" },
    { w: "ENGINE", h: "Motor of a machine", c: "machine" },
    { w: "FLOWER", h: "Blooming plant part", c: "nature" },
    { w: "SHADOW", h: "It follows you in sunlight", c: "nature" },
    { w: "ORANGE", h: "Citrus fruit and a color", c: "food" },
    { w: "MARKET", h: "Place to buy goods", c: "place" },
    { w: "LADDER", h: "Climbing rungs", c: "object" },
    { w: "CANDLE", h: "Wax light source", c: "object" },
    { w: "PIRATE", h: "Sails and plunders", c: "person" },
    { w: "MEADOW", h: "Grassy open field", c: "nature" },
    { w: "BASKET", h: "Woven carrier", c: "object" },
    { w: "TUNNEL", h: "Passage under ground", c: "place" },
    { w: "FROZEN", h: "Turned to ice", c: "weather" },
    { w: "SPIDER", h: "Eight-legged spinner", c: "animal" },
    { w: "VELVET", h: "Soft plush fabric", c: "material" },
    { w: "ANCHOR", h: "It holds a ship", c: "object" },
    { w: "DOMINO", h: "Falling tile game", c: "game" },
    { w: "MOSAIC", h: "Picture made of tiles", c: "art" },
    { w: "MAGNET", h: "It attracts iron", c: "object" },
    { w: "GARDEN", h: "Where plants are grown", c: "place" },
    { w: "POCKET", h: "Small sewn pouch", c: "object" },
    { w: "WALLET", h: "Money holder", c: "object" },
    { w: "JUNGLE", h: "Dense wild forest", c: "nature" },
    { w: "ISLAND", h: "Land ringed by water", c: "place" },
    { w: "SUNSET", h: "Evening sky show", c: "weather" },
    { w: "HARVEST", h: "Gathering the crops", c: "farm" },
    { w: "DOLPHIN", h: "Clever ocean mammal", c: "animal" },
    { w: "THUNDER", h: "Sound after lightning", c: "weather" },
    { w: "COMPASS", h: "It points north", c: "object" },
    { w: "FEATHER", h: "Light bird covering", c: "animal" },
    { w: "LIBRARY", h: "Home of books", c: "place" },
    { w: "JOURNEY", h: "A long trip", c: "travel" },
    { w: "PYRAMID", h: "Pharaoh's tomb", c: "place" },
    { w: "VOLCANO", h: "Mountain that erupts", c: "nature" },
    { w: "CRYSTAL", h: "Clear shining mineral", c: "material" },
    { w: "LANTERN", h: "Portable lamp", c: "object" },
    { w: "ORCHARD", h: "Fruit-tree farm", c: "farm" },
    { w: "WHISTLE", h: "Shrill pipe sound", c: "music" },
    { w: "BLANKET", h: "Warm bed cover", c: "object" },
    { w: "DIAMOND", h: "Hardest gem", c: "material" },
    { w: "GLACIER", h: "Slow river of ice", c: "nature" },
    { w: "HORIZON", h: "Where sky meets land", c: "nature" },
    { w: "KINGDOM", h: "A king's realm", c: "place" },
    { w: "OCTOPUS", h: "Eight-armed swimmer", c: "animal" },
    { w: "PENGUIN", h: "Tuxedo bird that swims", c: "animal" },
    { w: "RAINBOW", h: "Arc of colors", c: "weather" },
    { w: "SUNRISE", h: "Morning sky show", c: "weather" },
    { w: "TREASURE", h: "Hidden riches", c: "object" },
    { w: "UNIVERSE", h: "All of space", c: "space" },
    { w: "MOUNTAIN", h: "Very tall land", c: "nature" },
    { w: "ELEPHANT", h: "Trunk and tusks", c: "animal" },
    { w: "SANDWICH", h: "Filling between bread", c: "food" },
    { w: "COMPUTER", h: "Thinking machine", c: "machine" },
    { w: "DINOSAUR", h: "Ancient giant reptile", c: "animal" },
    { w: "FESTIVAL", h: "Big celebration", c: "event" },
    { w: "HOSPITAL", h: "Place of healing", c: "place" },
    { w: "KANGAROO", h: "Pouch jumper", c: "animal" },
    { w: "MIDNIGHT", h: "Twelve at night", c: "time" },
    { w: "LANGUAGE", h: "Words we speak", c: "mind" },
].filter((r) => /^[A-Z]{4,8}$/.test(r.w) && r.h && r.c);

function tierOf(w) {
    return w.length <= 5 ? 1 : w.length === 6 ? 2 : 3;
}
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
        const t = a[i];
        a[i] = a[j];
        a[j] = t;
    }
    return a;
}

/* Solver internal: strategi pemain kompeten (pola kata + frekuensi kandidat).
   Dipakai untuk MENJAMIN setiap level yang dihasilkan bisa diselesaikan
   dalam batas LIVES tebakan salah. Hasil di-cache per kata. */
const SOLVE_CACHE = new Map();
function isSolvable(word) {
    if (SOLVE_CACHE.has(word)) return SOLVE_CACHE.get(word);
    const g = new Set();
    const wr = new Set();
    const done = () => {
        for (const ch of word) if (!g.has(ch)) return false;
        return true;
    };
    let guard = 0;
    while (!done() && wr.size < LIVES && guard++ < 40) {
        const cands = BANK.filter((r) => {
            const w = r.w;
            if (w.length !== word.length) return false;
            for (let i = 0; i < w.length; i++) {
                const ch = w[i];
                if (g.has(word[i])) {
                    if (ch !== word[i]) return false;
                } else if (g.has(ch) || wr.has(ch)) return false;
            }
            return true;
        }).map((r) => r.w);
        const pool = cands.length ? cands : [word];
        const cnt = {};
        for (const w of pool)
            for (const ch of new Set(w))
                if (!g.has(ch) && !wr.has(ch)) cnt[ch] = (cnt[ch] || 0) + 1;
        let best = null;
        let bestN = -1;
        for (const ch of FREQ)
            if (cnt[ch] && cnt[ch] > bestN) {
                best = ch;
                bestN = cnt[ch];
            }
        if (!best) break;
        if (word.indexOf(best) >= 0) g.add(best);
        else wr.add(best);
    }
    const ok = done();
    SOLVE_CACHE.set(word, ok);
    return ok;
}

/* Level generator acak ber-seed: 5 kata unik, kesulitan menanjak,
   semuanya lolos verifikasi solver (dijamin bisa diselesaikan). */
function generateLevels(seed) {
    const rnd = rng(seed);
    const pools = { 1: [], 2: [], 3: [] };
    for (const rec of BANK) pools[tierOf(rec.w)].push(rec);
    for (const k of [1, 2, 3]) pools[k] = shuffle(pools[k], rnd);
    const pattern = [1, 1, 2, 2, 3];
    const ptr = { 1: 0, 2: 0, 3: 0 };
    const used = new Set();
    const out = [];
    for (const t of pattern) {
        let pick = null;
        while (ptr[t] < pools[t].length) {
            const cand = pools[t][ptr[t]++];
            if (!used.has(cand.w) && isSolvable(cand.w)) {
                pick = cand;
                break;
            }
        }
        if (!pick) {
            const rest = shuffle(
                BANK.filter((r) => !used.has(r.w) && isSolvable(r.w)),
                rnd,
            );
            pick = rest[0];
        }
        used.add(pick.w);
        out.push({ w: pick.w, h: pick.h, c: pick.c });
    }
    return out;
}
function pickFreshWord(words) {
    const used = new Set(words.map((r) => r.w));
    const rest = BANK.filter((r) => !used.has(r.w) && isSolvable(r.w));
    if (!rest.length) return null;
    const rec = rest[Math.floor(Math.random() * rest.length)];
    return { w: rec.w, h: rec.h, c: rec.c };
}
function maskWord(word, guessed) {
    let out = "";
    for (const ch of word) out += guessed.indexOf(ch) >= 0 ? ch : "_";
    return out;
}
function applyGuess(word, guessed, letter) {
    if (word.indexOf(letter) < 0)
        return { wrong: true, solved: false, guessed: guessed.slice() };
    const g2 =
        guessed.indexOf(letter) >= 0 ? guessed.slice() : guessed.concat([letter]);
    let solved = true;
    for (const ch of word)
        if (g2.indexOf(ch) < 0) {
            solved = false;
            break;
        }
    return { wrong: false, solved, guessed: g2 };
}

/* Bot: frekuensi huruf + sedikit "insight", sengaja dibuat bisa dikalahkan.
   stunned (cheat) -> bot dipaksa menebak huruf yang salah. */
function botPickLetter(word, guessed, wrongs, stunned) {
    const used = new Set(guessed.concat(wrongs));
    const avail = [];
    for (const ch of FREQ) if (!used.has(ch)) avail.push(ch);
    if (!avail.length) return null;
    if (stunned) {
        const safe = avail.filter((c) => word.indexOf(c) < 0);
        return safe.length ? safe[safe.length - 1] : avail[avail.length - 1];
    }
    if (Math.random() < 0.08)
        return avail[Math.floor(Math.random() * avail.length)];
    const good = avail.filter((c) => word.indexOf(c) >= 0);
    if (good.length && Math.random() < 0.36)
        return good[Math.floor(Math.random() * good.length)];
    const pool = avail.slice(0, 6);
    return pool[Math.floor(Math.random() * pool.length)];
}
/* ---------- end pure logic ---------- */

export function mount(root, context = {}) {
    const {
        mode = "ai",
        room = null,
        playerName = "Player",
        onExit = () => { },
    } = context;
    const online = mode === "room" && Boolean(room);
    let roomData = room?.room || null;
    let state = null;

    /* ---------- util lokal ---------- */
    const offs = [];
    let timers = [];
    let botTimer = null;
    let nagAt = 0;
    let helloSent = false;
    let bestSavedSeed = -1;
    let prev = { seed: -1, phase: "", round: -1, wrongs: 0 };
    let slotSig = "";
    let prevGuessed = [];
    const track = (off) => {
        if (typeof off === "function") offs.push(off);
    };
    const later = (fn, ms) => {
        const t = setTimeout(() => {
            timers = timers.filter((x) => x !== t);
            fn();
        }, ms);
        timers.push(t);
        return t;
    };
    const clearTimers = () => {
        timers.forEach(clearTimeout);
        timers = [];
        if (botTimer) {
            clearTimeout(botTimer);
            botTimer = null;
        }
    };
    const cleanName = (n) =>
        String(n || "")
            .replace(/[<>&"']/g, "")
            .trim()
            .slice(0, 18);

    /* Firebase RTDB bisa menghapus array kosong -> normalisasi state masuk. */
    function normalizeState(s) {
        if (!s) return null;
        return {
            v: 1,
            seed: s.seed || 0,
            phase: s.phase || "lobby",
            round: s.round || 0,
            words: s.words || [],
            guessed: s.guessed || [],
            wrongs: s.wrongs || [],
            starter: s.starter || 0,
            turn: s.turn || 0,
            scores: s.scores || [0, 0],
            hostSeat: s.hostSeat || 0,
            names: s.names || ["Player 1", "Player 2"],
            last: s.last || null,
            between: s.between || null,
            botStun: s.botStun || 0,
            cheatsUsed: Boolean(s.cheatsUsed),
            solvedCount: s.solvedCount || 0,
            winner: s.winner === undefined ? null : s.winner,
        };
    }

    /* ---------- markup + gaya (minimalis, scoped .wg) ---------- */
    root.innerHTML = `
<style>
.wg{--wg-ink:#0f172a;--wg-mut:#64748b;--wg-line:#e2e8f0;--wg-bg:#f8fafc;--wg-acc:#4f46e5;--wg-hit:#059669;--wg-miss:#dc2626;color:var(--wg-ink)}
.wg [hidden]{display:none!important}
.wg .wg-panel{position:relative;background:var(--wg-bg);border:1px solid var(--wg-line);border-radius:16px;padding:18px;min-height:440px;overflow:hidden}
.wg .wg-top{display:flex;flex-wrap:wrap;gap:10px;align-items:center;justify-content:space-between;margin-bottom:16px}
.wg .wg-chips{display:flex;gap:8px;flex-wrap:wrap}
.wg .wg-chip{font-size:12px;color:var(--wg-mut);border:1px solid var(--wg-line);background:#fff;border-radius:999px;padding:4px 11px}
.wg .wg-chip b{color:var(--wg-ink)}
.wg .wg-scores{display:flex;gap:8px;flex-wrap:wrap}
.wg .wg-seat{display:flex;align-items:center;gap:8px;border:1px solid var(--wg-line);background:#fff;border-radius:12px;padding:6px 12px;font-size:13px;transition:border-color .2s,box-shadow .2s}
.wg .wg-seat .wg-dot{width:7px;height:7px;border-radius:50%;background:var(--wg-line)}
.wg .wg-seat .wg-score{font-weight:800;font-size:16px}
.wg .wg-seat.wg-turn{border-color:var(--wg-acc);box-shadow:0 0 0 3px rgba(79,70,229,.12)}
.wg .wg-seat.wg-turn .wg-dot{background:var(--wg-acc)}
.wg .wg-main{display:flex;gap:24px;align-items:flex-start;justify-content:center;flex-wrap:wrap}
.wg .wg-left{display:flex;flex-direction:column;align-items:center;gap:12px;width:200px}
.wg svg.wg-fig{width:168px;height:auto;max-height:44vh}
.wg .wg-part{opacity:0;transition:opacity .3s}
.wg .wg-part.wg-on{opacity:1}
.wg .wg-hintbox{width:100%;background:#fff;border:1px solid var(--wg-line);border-radius:12px;padding:10px 12px;font-size:12.5px;color:var(--wg-mut);line-height:1.55}
.wg .wg-hintbox b{color:var(--wg-ink)}
.wg .wg-hintbox .wg-unlocked{color:var(--wg-acc)}
.wg .wg-right{flex:1;min-width:280px;max-width:560px;display:flex;flex-direction:column;align-items:center;gap:14px}
.wg .wg-slots{display:flex;gap:8px;flex-wrap:wrap;justify-content:center;min-height:52px}
.wg .wg-slot{width:34px;height:48px;border-bottom:2px solid #cbd5e1;display:grid;place-items:center;font-size:24px;font-weight:800}
.wg .wg-slot span{opacity:0;transform:translateY(4px);transition:opacity .18s,transform .18s}
.wg .wg-slot.wg-in{border-color:var(--wg-ink)}
.wg .wg-slot.wg-in span{opacity:1;transform:none}
.wg .wg-slot.wg-new span{animation:wg-pop .25s ease-out}
.wg .wg-slot.wg-reveal span{opacity:1;transform:none;color:var(--wg-miss)}
@keyframes wg-pop{0%{transform:scale(.4)}60%{transform:scale(1.15)}100%{transform:scale(1)}}
.wg .wg-last{font-size:12.5px;color:var(--wg-mut);min-height:18px;text-align:center}
.wg .wg-keys{display:grid;grid-template-columns:repeat(9,1fr);gap:6px;width:100%;max-width:430px}
.wg .wg-key{height:42px;border:1px solid var(--wg-line);border-radius:10px;background:#fff;color:var(--wg-ink);font-weight:700;font-size:15px;cursor:pointer;transition:background .15s,border-color .15s,color .15s,transform .05s;touch-action:manipulation;-webkit-tap-highlight-color:transparent}
.wg .wg-key:hover:not(:disabled){border-color:var(--wg-acc);color:var(--wg-acc)}
.wg .wg-key:active:not(:disabled){transform:scale(.94)}
.wg .wg-key:focus-visible{outline:2px solid var(--wg-acc);outline-offset:2px}
.wg .wg-key:disabled{cursor:default}
.wg .wg-key.wg-off{opacity:.45}
.wg .wg-key.wg-hit{background:#ecfdf5;border-color:#a7f3d0;color:var(--wg-hit);opacity:1}
.wg .wg-key.wg-miss{background:#fef2f2;border-color:#fecaca;color:#f87171;text-decoration:line-through;opacity:.75}
@media (pointer:coarse){.wg .wg-key{height:46px;font-size:16px}}
.wg .wg-banner{margin-top:16px;background:#fff;border:1px solid var(--wg-line);border-radius:12px;padding:10px 14px;text-align:center;font-size:13px;color:var(--wg-mut)}
.wg .wg-banner b{color:var(--wg-ink)}
.wg .wg-toast{position:absolute;top:12px;left:50%;transform:translateX(-50%);background:#0f172a;color:#f8fafc;padding:6px 14px;border-radius:999px;font-size:12px;font-weight:600;opacity:0;transition:opacity .25s;z-index:7;pointer-events:none;white-space:nowrap;max-width:92%;overflow:hidden;text-overflow:ellipsis}
.wg .wg-toast.wg-on{opacity:1}
.wg .wg-ov{position:absolute;inset:0;background:rgba(248,250,252,.93);backdrop-filter:blur(3px);display:grid;place-items:center;z-index:5;padding:16px}
.wg .wg-card{background:#fff;border:1px solid var(--wg-line);border-radius:16px;padding:22px;max-width:430px;width:100%;box-shadow:0 10px 30px rgba(15,23,42,.08);text-align:center;max-height:100%;overflow:auto}
.wg .wg-card h3{margin:0 0 8px;font-size:20px}
.wg .wg-card p{margin:0 0 12px;font-size:13.5px;color:var(--wg-mut);line-height:1.6}
.wg .wg-btn{display:block;width:100%;margin-top:8px;border:0;border-radius:10px;background:var(--wg-acc);color:#fff;font-weight:700;font-size:14px;padding:11px 14px;cursor:pointer;touch-action:manipulation}
.wg .wg-btn:hover{filter:brightness(1.08)}
.wg .wg-btn.ghost{background:#fff;color:var(--wg-ink);border:1px solid var(--wg-line)}
.wg .wg-mode{font-size:12.5px;color:var(--wg-acc);font-weight:600}
.wg .wg-wait{font-style:italic}
.wg ol.wg-help{text-align:left;font-size:13px;color:var(--wg-mut);line-height:1.65;padding-left:18px;margin:0 0 12px}
.wg ol.wg-help b{color:var(--wg-ink)}
.wg .wg-final{font-size:15px;color:var(--wg-ink);font-weight:700}
.wg .wg-badge{display:inline-block;font-size:11.5px;color:#b45309;background:#fffbeb;border:1px solid #fde68a;border-radius:999px;padding:3px 10px;margin:0 0 10px}
.wg .wg-cheats{display:flex;flex-direction:column;gap:8px;margin-bottom:12px}
.wg .wg-cheat-btn{display:flex;justify-content:space-between;align-items:center;gap:10px;border:1px solid var(--wg-line);background:#fff;border-radius:10px;padding:10px 12px;font-size:13px;font-weight:600;color:var(--wg-ink);cursor:pointer;text-align:left;touch-action:manipulation}
.wg .wg-cheat-btn:hover{border-color:var(--wg-acc)}
.wg .wg-cheat-btn small{color:var(--wg-mut);font-weight:400}
.wg .wg-peek-word{font-size:30px;font-weight:800;letter-spacing:6px;margin:10px 0;color:var(--wg-acc)}
.wg .wg-actions{display:flex;gap:8px;flex-wrap:wrap}
@media (max-width:640px){
  .wg .wg-panel{padding:14px;min-height:0}
  .wg .wg-main{flex-direction:column;align-items:center}
  .wg .wg-left{width:100%;max-width:300px}
  .wg svg.wg-fig{width:130px}
  .wg .wg-keys{grid-template-columns:repeat(7,1fr)}
  .wg .wg-top{justify-content:center}
}
</style>
<div class="game-app wg">
  <div class="game-intro">
    <div>
      <h2>Word Guess</h2>
      <p>A minimalist hangman duel - five hidden words, shared misses, highest score wins.</p>
    </div>
    <span class="game-status"><i class="game-status-dot"></i><span data-status>Ready</span></span>
  </div>

  <section class="game-panel wg-panel" data-board>
    <div class="wg-top">
      <div class="wg-chips">
        <span class="wg-chip">Round <b data-chip-round>-</b></span>
        <span class="wg-chip">Misses <b data-chip-miss>-</b></span>
        <span class="wg-chip" data-chip-seat hidden>You are <b data-seatno>-</b></span>
      </div>
      <div class="wg-scores">
        <div class="wg-seat" data-seat="0"><i class="wg-dot"></i><span data-name>Player 1</span><b class="wg-score" data-score>0</b></div>
        <div class="wg-seat" data-seat="1"><i class="wg-dot"></i><span data-name>Player 2</span><b class="wg-score" data-score>0</b></div>
      </div>
    </div>

    <div class="wg-main">
      <div class="wg-left">
        <svg class="wg-fig" viewBox="0 0 220 250" role="img" aria-label="Miss figure">
          <g stroke="#cbd5e1" stroke-width="6" stroke-linecap="round" fill="none">
            <line x1="20" y1="238" x2="130" y2="238"/>
            <line x1="50" y1="238" x2="50" y2="18"/>
            <line x1="50" y1="18" x2="152" y2="18"/>
            <line x1="50" y1="62" x2="92" y2="18"/>
            <line x1="152" y1="18" x2="152" y2="44" stroke-width="4"/>
          </g>
          <g stroke="#0f172a" stroke-width="4" stroke-linecap="round" fill="none">
            <circle class="wg-part" cx="152" cy="62" r="18"/>
            <line class="wg-part" x1="152" y1="80" x2="152" y2="140"/>
            <line class="wg-part" x1="152" y1="96" x2="122" y2="122"/>
            <line class="wg-part" x1="152" y1="96" x2="182" y2="122"/>
            <line class="wg-part" x1="152" y1="140" x2="128" y2="186"/>
            <line class="wg-part" x1="152" y1="140" x2="176" y2="186"/>
          </g>
        </svg>
        <div class="wg-hintbox" data-hintbox></div>
      </div>
      <div class="wg-right">
        <div class="wg-slots" data-slots></div>
        <div class="wg-last" data-last></div>
        <div class="wg-keys" data-keys></div>
      </div>
    </div>

    <div class="wg-banner" data-banner hidden></div>
    <div class="wg-toast" data-toast></div>

    <div class="wg-ov" data-ov-start>
      <div class="wg-card">
        <h3>Word Guess</h3>
        <p>Take turns guessing the hidden word. A correct letter scores points and keeps your turn; a miss draws the figure and passes the turn. Six shared misses end the round. The category is always shown, and the hint unlocks after two misses.</p>
        <p class="wg-mode" data-start-mode></p>
        <button class="wg-btn" type="button" data-act="start">Start game</button>
        <p class="wg-wait" data-start-wait hidden>Waiting for the host to start...</p>
        <button class="wg-btn ghost" type="button" data-act="help">How to play</button>
      </div>
    </div>

    <div class="wg-ov" data-ov-over hidden>
      <div class="wg-card">
        <h3 data-over-title>Game over</h3>
        <p data-over-reason></p>
        <p class="wg-final" data-over-scores></p>
        <span class="wg-badge" data-over-badge hidden>Assisted run - cheats were used</span>
        <button class="wg-btn" type="button" data-act="again">Play again</button>
        <p class="wg-wait" data-over-wait hidden>Waiting for the host to restart...</p>
      </div>
    </div>

    <div class="wg-ov" data-ov-help hidden>
      <div class="wg-card">
        <h3>How to play</h3>
        <ol class="wg-help">
          <li><b>Five rounds.</b> Each round hides one real word, randomly generated and verified to be solvable within six misses.</li>
          <li><b>Turns.</b> A coin toss decides who starts. A correct letter keeps your turn; a miss passes it. The starting player alternates each round.</li>
          <li><b>Scoring.</b> +1 point per revealed letter, +2 bonus for completing the word. Highest total after five rounds wins.</li>
          <li><b>Misses.</b> Six shared misses end the round and reveal the word. Nobody gets the bonus.</li>
          <li><b>Hints.</b> The category is shown from the start; the hint unlocks automatically after two wrong guesses.</li>
          <li><b>Cheats.</b> Offline only. Open the Cheats panel for assists; using them tags the result as assisted.</li>
        </ol>
        <p>Controls: tap or click the letter pad, or type A-Z on a physical keyboard. Enter starts a game, Esc closes panels.</p>
        <button class="wg-btn" type="button" data-act="close-help">Got it</button>
      </div>
    </div>

    <div class="wg-ov" data-ov-cheat hidden>
      <div class="wg-card">
        <h3>Cheats</h3>
        <p>Assists for offline play. Using any of them tags the final result as assisted and blocks the best score.</p>
        <div class="wg-cheats">
          <button class="wg-cheat-btn" type="button" data-cheat="reveal"><span>Reveal a letter</span><small>free correct letter, no points</small></button>
          <button class="wg-cheat-btn" type="button" data-cheat="peek"><span>Peek at the word</span><small>shown for 2.5 seconds</small></button>
          <button class="wg-cheat-btn" type="button" data-cheat="erase"><span>Erase a miss</span><small>remove one wrong guess</small></button>
          <button class="wg-cheat-btn" type="button" data-cheat="skip"><span>New word</span><small>redeal this round</small></button>
          <button class="wg-cheat-btn" type="button" data-cheat="stun"><span>Stun the bot</span><small>bot misses its next 2 guesses</small></button>
        </div>
        <button class="wg-btn ghost" type="button" data-act="close-cheat">Close</button>
      </div>
    </div>

    <div class="wg-ov" data-ov-peek hidden>
      <div class="wg-card">
        <h3>Peek</h3>
        <div class="wg-peek-word" data-peek-word></div>
        <p>Memorize it - this panel closes automatically.</p>
        <button class="wg-btn ghost" type="button" data-act="close-peek">Close now</button>
      </div>
    </div>
  </section>

  <div class="game-actions wg-actions">
    <button class="game-action-button" type="button" data-act="help">How to play</button>
    <button class="game-action-button" type="button" data-act="cheat">Cheats</button>
    <button class="game-action-button" type="button" data-act="restart">Restart</button>
    <button class="game-action-button" type="button" data-exit>Exit game</button>
  </div>
</div>`;

    /* ---------- refs ---------- */
    const $ = (s, r) => (r || root).querySelector(s);
    const statusEl = $("[data-status]");
    const chipRound = $("[data-chip-round]");
    const chipMiss = $("[data-chip-miss]");
    const chipSeat = $("[data-chip-seat]");
    const seatNo = $("[data-seatno]");
    const slotsEl = $("[data-slots]");
    const keysEl = $("[data-keys]");
    const hintEl = $("[data-hintbox]");
    const lastEl = $("[data-last]");
    const bannerEl = $("[data-banner]");
    const toastEl = $("[data-toast]");
    const figParts = Array.from(root.querySelectorAll(".wg-part"));
    const seatEls = [0, 1].map((i) => {
        const el = $('[data-seat="' + i + '"]');
        return { el, name: $("[data-name]", el), score: $("[data-score]", el) };
    });
    const ovStart = $("[data-ov-start]");
    const ovOver = $("[data-ov-over]");
    const ovHelp = $("[data-ov-help]");
    const ovCheat = $("[data-ov-cheat]");
    const ovPeek = $("[data-ov-peek]");
    const startBtn = $('[data-act="start"]', ovStart);
    const startWait = $("[data-start-wait]");
    const startMode = $("[data-start-mode]");
    const overTitle = $("[data-over-title]");
    const overReason = $("[data-over-reason]");
    const overScores = $("[data-over-scores]");
    const overBadge = $("[data-over-badge]");
    const againBtn = $('[data-act="again"]');
    const overWait = $("[data-over-wait]");
    const peekWord = $("[data-peek-word]");
    const cheatBtn = $('[data-act="cheat"]');
    const restartBtn = $('[data-act="restart"]');

    /* ---------- virtual letter pad (mobile + mouse) ---------- */
    const keyBtns = {};
    for (let i = 0; i < 26; i++) {
        const ch = String.fromCharCode(65 + i);
        const b = document.createElement("button");
        b.type = "button";
        b.className = "wg-key";
        b.textContent = ch;
        b.setAttribute("data-letter", ch);
        keysEl.appendChild(b);
        keyBtns[ch] = b;
    }

    /* ---------- helpers ---------- */
    function mySeat() {
        if (!online) return 0;
        if (!state) return null;
        return room.isHost ? state.hostSeat : 1 - state.hostSeat;
    }
    const canStart = () => !online || room.isHost;
    function nameFor(seat) {
        if (seat === mySeat()) return "You";
        if (state && state.names && state.names[seat]) return state.names[seat];
        return "Player " + (seat + 1);
    }
    function toast(msg) {
        toastEl.textContent = msg;
        toastEl.classList.add("wg-on");
        later(() => toastEl.classList.remove("wg-on"), 1500);
    }
    function localOverlayOpen() {
        return !ovHelp.hidden || !ovCheat.hidden || !ovPeek.hidden;
    }
    function closeLocalOverlays() {
        ovHelp.hidden = true;
        ovCheat.hidden = true;
        ovPeek.hidden = true;
    }
    function announceStart(s) {
        const who = s.turn === mySeat() ? "You start" : nameFor(s.turn) + " starts";
        if (online)
            toast("You are Player " + (mySeat() + 1) + " - " + who + " (coin toss)");
        else toast(who + " (coin toss)");
    }

    /* ---------- render ---------- */
    function render() {
        const s = state;
        const me = mySeat();
        const rec = s && s.words && s.words[s.round] ? s.words[s.round] : null;
        const word = rec ? rec.w : "";
        const playing = Boolean(s && s.phase === "playing");
        const myTurn = playing && me !== null && s.turn === me;
        const revealAll = Boolean(s && (s.phase === "between" || s.phase === "over"));

        /* status */
        let st = "Ready";
        if (!s) st = "Connecting...";
        else if (s.phase === "lobby")
            st = canStart() ? "Ready - press start" : "Waiting for host...";
        else if (s.phase === "between")
            st = s.between && s.between.type === "solved" ? "Word solved" : "Round failed";
        else if (s.phase === "over") st = "Game over";
        else if (myTurn) st = "Your turn - pick a letter";
        else st = online ? "Opponent is thinking..." : s.botStun > 0 ? "Bot is stunned..." : "Bot is thinking...";
        statusEl.textContent = st;

        /* chips + skor */
        chipRound.textContent = s && s.phase !== "lobby" ? Math.min(s.round + 1, ROUNDS) + "/" + ROUNDS : "-";
        chipMiss.textContent = s && s.phase !== "lobby" ? s.wrongs.length + "/" + LIVES : "-";
        chipSeat.hidden = !online || !s;
        if (online && me !== null) seatNo.textContent = "P" + (me + 1);
        for (let i = 0; i < 2; i++) {
            seatEls[i].name.textContent = nameFor(i);
            seatEls[i].score.textContent = s ? s.scores[i] : 0;
            seatEls[i].el.classList.toggle("wg-turn", playing && s.turn === i);
        }

        /* figure */
        figParts.forEach((p, i) =>
            p.classList.toggle("wg-on", Boolean(s && i < s.wrongs.length)),
        );

        /* slots (rebuilt hanya saat berubah, animasi huruf baru) */
        const sig = word + "|" + (s ? s.guessed.join("") : "") + "|" + (s ? s.phase : "");
        if (sig !== slotSig) {
            slotSig = sig;
            slotsEl.innerHTML = "";
            if (word) {
                for (const ch of word) {
                    const d = document.createElement("div");
                    d.className = "wg-slot";
                    const sp = document.createElement("span");
                    sp.textContent = ch;
                    d.appendChild(sp);
                    const known = s.guessed.indexOf(ch) >= 0;
                    if (known) {
                        d.classList.add("wg-in");
                        if (prevGuessed.indexOf(ch) < 0) d.classList.add("wg-new");
                    } else if (revealAll) d.classList.add("wg-reveal");
                    slotsEl.appendChild(d);
                }
            }
            prevGuessed = s ? s.guessed.slice() : [];
        }

        /* hint: kategori selalu tampil, hint terbuka setelah HINT_AT salah */
        if (!rec) {
            hintEl.innerHTML = s ? "Press start to begin." : "Connecting to the room...";
        } else {
            const cat = rec.c.charAt(0).toUpperCase() + rec.c.slice(1);
            const unlocked = s.wrongs.length >= HINT_AT || revealAll;
            hintEl.innerHTML =
                "<div><b>Category:</b> " + cat + " - " + word.length + " letters</div>" +
                (unlocked
                    ? '<div class="wg-unlocked"><b>Hint:</b> ' + rec.h + "</div>"
                    : "<div>Hint unlocks after " + HINT_AT + " misses.</div>");
        }

        /* baris event terakhir */
        let lastTxt = "";
        if (s && s.last) {
            const L = s.last;
            lastTxt = L.hit
                ? nameFor(L.by) + " guessed " + L.letter + " - " + L.count + " letter" + (L.count > 1 ? "s" : "") + (L.cheat ? " (cheat)" : "")
                : "No " + L.letter + " - turn passes";
        } else if (playing) lastTxt = myTurn ? "Pick a letter." : "Waiting for the other player...";
        lastEl.textContent = lastTxt;

        /* keyboard */
        for (const ch in keyBtns) {
            const b = keyBtns[ch];
            const hit = Boolean(s && s.guessed.indexOf(ch) >= 0);
            const miss = Boolean(s && s.wrongs.indexOf(ch) >= 0);
            b.disabled = !myTurn || hit || miss;
            b.classList.toggle("wg-hit", hit);
            b.classList.toggle("wg-miss", miss);
            b.classList.toggle("wg-off", !myTurn && !hit && !miss);
        }

        /* banner antar ronde */
        if (s && s.phase === "between" && s.between) {
            const b = s.between;
            bannerEl.hidden = false;
            bannerEl.innerHTML =
                b.type === "solved"
                    ? "<b>" + nameFor(b.by) + "</b> solved <b>" + b.word + "</b>" + (b.bonus ? " (+" + b.bonus + " bonus)" : "") + " - next round starting..."
                    : "Six misses - the word was <b>" + b.word + "</b> - next round starting...";
        } else bannerEl.hidden = true;

        /* overlay start / over */
        ovStart.hidden = Boolean(s && s.phase !== "lobby");
        if (!ovStart.hidden) {
            startMode.textContent = online
                ? "Online duel - seats and first turn are randomized each game."
                : "You vs Bot - a coin toss decides who starts.";
            startBtn.hidden = !canStart() || !s;
            startWait.hidden = canStart() && Boolean(s);
            startWait.textContent = s ? "Waiting for the host to start..." : "Connecting to the room...";
        }
        ovOver.hidden = !(s && s.phase === "over");
        if (s && s.phase === "over") {
            overTitle.textContent =
                s.winner === -1 || s.winner === null ? "Draw" : s.winner === me ? "You win" : nameFor(s.winner) + " wins";
            overReason.textContent = s.solvedCount + "/" + ROUNDS + " words were solved this run.";
            overScores.textContent = nameFor(0) + " " + s.scores[0] + " - " + s.scores[1] + " " + nameFor(1);
            overBadge.hidden = !s.cheatsUsed;
            againBtn.hidden = !canStart();
            overWait.hidden = canStart();
            if (META.bestKey && bestSavedSeed !== s.seed) {
                bestSavedSeed = s.seed;
                if (!s.cheatsUsed && me !== null) {
                    try {
                        const old = Number(localStorage.getItem(META.bestKey)) || 0;
                        if (s.scores[me] > old)
                            localStorage.setItem(META.bestKey, String(s.scores[me]));
                    } catch (err) { /* storage tidak tersedia */ }
                }
            }
        }

        /* tombol aksi */
        cheatBtn.disabled = online;
        cheatBtn.title = online ? "Cheats are disabled in online rooms" : "Open cheat panel";
        restartBtn.disabled = !canStart();

        /* pengumuman transisi (berlaku untuk host, guest, dan lokal) */
        if (s) {
            const newRun = prev.seed !== s.seed && s.phase !== "lobby";
            const began = prev.phase === "lobby" && s.phase === "playing";
            if (newRun || began) announceStart(s);
            if (
                playing && prev.seed === s.seed && prev.round === s.round &&
                prev.wrongs < HINT_AT && s.wrongs.length >= HINT_AT
            )
                toast("Hint unlocked");
            prev = { seed: s.seed, phase: s.phase, round: s.round, wrongs: s.wrongs.length };
        }
    }

    /* ---------- publish (host menulis state kanonik) ---------- */
    function publish() {
        render();
        if (online && room.isHost) room.publishState(state).catch(console.warn);
        syncBot();
    }

    /* ---------- alur ronde ---------- */
    function enterBetween(info) {
        state.phase = "between";
        state.between = Object.assign({ word: state.words[state.round].w }, info);
        later(advanceRound, 2000);
    }
    function advanceRound() {
        if (!state || state.phase !== "between") return;
        if (state.round + 1 >= ROUNDS) {
            state.phase = "over";
            state.winner =
                state.scores[0] === state.scores[1] ? -1 : state.scores[0] > state.scores[1] ? 0 : 1;
        } else {
            state.round++;
            state.starter = 1 - state.starter;
            state.turn = state.starter;
            state.guessed = [];
            state.wrongs = [];
            state.last = null;
            state.between = null;
            state.phase = "playing";
        }
        publish();
    }
    function lobbyState() {
        const hostSeat = online ? (Math.random() < 0.5 ? 0 : 1) : 0;
        const names = ["Player 1", "Player 2"];
        if (online) names[hostSeat] = cleanName(playerName) || "Player " + (hostSeat + 1);
        else {
            names[0] = cleanName(playerName) || "You";
            names[1] = "Bot";
        }
        return normalizeState({ phase: "lobby", hostSeat, names });
    }
    function startGame() {
        clearTimers();
        closeLocalOverlays();
        const seed = (Math.random() * 1e9) | 0;
        const r = rng(seed);
        const words = generateLevels(seed);
        const starter = r() < 0.5 ? 0 : 1; // koin: siapa jalan duluan
        const hostSeat = online ? (r() < 0.5 ? 0 : 1) : 0; // acak posisi pemain
        const names = ["Player 1", "Player 2"];
        if (online) {
            names[hostSeat] = cleanName(playerName) || "Player " + (hostSeat + 1);
            if (state && state.names) {
                const g = 1 - state.hostSeat;
                if (state.names[g]) names[1 - hostSeat] = state.names[g];
            }
        } else {
            names[0] = cleanName(playerName) || "You";
            names[1] = "Bot";
        }
        state = normalizeState({
            seed,
            phase: "playing",
            round: 0,
            words,
            starter,
            turn: starter,
            hostSeat,
            names,
            scores: [0, 0],
        });
        slotSig = "";
        prevGuessed = [];
        publish();
    }

    /* ---------- cheats (offline) ---------- */
    function applyCheat(kind) {
        if (!state || state.phase !== "playing") {
            toast("Start a game first");
            return;
        }
        const rec = state.words[state.round];
        if (kind === "reveal") {
            const rest = [];
            for (const ch of new Set(rec.w))
                if (state.guessed.indexOf(ch) < 0) rest.push(ch);
            if (!rest.length) return;
            const ch = rest[Math.floor(Math.random() * rest.length)];
            const res = applyGuess(rec.w, state.guessed, ch);
            state.guessed = res.guessed;
            state.cheatsUsed = true;
            state.last = { letter: ch, by: state.turn, hit: true, count: rec.w.split(ch).length - 1, cheat: true };
            if (res.solved) enterBetween({ type: "solved", by: state.turn, bonus: 0 });
            publish();
            toast("Cheat: revealed " + ch);
        } else if (kind === "erase") {
            if (!state.wrongs.length) {
                toast("No misses to erase");
                return;
            }
            const ch = state.wrongs.pop();
            state.cheatsUsed = true;
            publish();
            toast("Cheat: erased miss " + ch);
        } else if (kind === "skip") {
            const fresh = pickFreshWord(state.words);
            if (!fresh) {
                toast("No replacement word available");
                return;
            }
            state.words[state.round] = fresh;
            state.guessed = [];
            state.wrongs = [];
            state.last = null;
            state.cheatsUsed = true;
            slotSig = "";
            prevGuessed = [];
            publish();
            toast("Cheat: new word dealt");
        } else if (kind === "stun") {
            state.botStun += 2;
            state.cheatsUsed = true;
            publish();
            toast("Cheat: the bot will miss twice");
        }
    }
    function doPeek() {
        if (!state || state.phase !== "playing") {
            toast("Start a game first");
            return;
        }
        state.cheatsUsed = true;
        publish();
        ovCheat.hidden = true;
        peekWord.textContent = state.words[state.round].w;
        ovPeek.hidden = false;
        later(() => {
            ovPeek.hidden = true;
        }, 2500);
    }

    /* ---------- reducer kanonik ---------- */
    function applyAction(action, actor) {
        if (!action || typeof action !== "object") return;
        const t = action.type;
        if (t === "hello") {
            if (online && state && actor !== state.hostSeat) {
                const n = cleanName(action.name);
                if (n) {
                    state.names[actor] = n;
                    publish();
                }
            }
            return;
        }
        if (!state) return;
        if (t === "start") {
            if (online && actor !== state.hostSeat) return;
            startGame();
            return;
        }
        if (t === "cheat") {
            if (online) return; // cheat hanya offline
            applyCheat(action.kind);
            return;
        }
        if (t !== "guess") return;
        if (state.phase !== "playing" || actor !== state.turn) return;
        const letter = String(action.letter || "").toUpperCase();
        if (!/^[A-Z]$/.test(letter)) return;
        if (state.guessed.indexOf(letter) >= 0 || state.wrongs.indexOf(letter) >= 0) return;
        const rec = state.words[state.round];
        const res = applyGuess(rec.w, state.guessed, letter);
        if (!online && actor === 1 && state.botStun > 0) state.botStun--;
        if (res.wrong) {
            state.wrongs.push(letter);
            state.last = { letter, by: actor, hit: false };
            if (state.wrongs.length >= LIVES) enterBetween({ type: "fail" });
            else state.turn = 1 - actor;
        } else {
            const count = rec.w.split(letter).length - 1;
            state.guessed = res.guessed;
            state.scores[actor] += count;
            state.last = { letter, by: actor, hit: true, count };
            if (res.solved) {
                state.scores[actor] += SOLVE_BONUS;
                state.solvedCount++;
                enterBetween({ type: "solved", by: actor, bonus: SOLVE_BONUS });
            }
        }
        publish();
    }
    function submitAction(action) {
        if (online && !room.isHost) {
            room.sendAction(action).catch(console.warn);
            return;
        }
        applyAction(action, online ? state.hostSeat : 0);
    }
    function tryGuess(letter) {
        if (!state || state.phase !== "playing") return;
        if (state.turn !== mySeat()) {
            const now = Date.now();
            if (now - nagAt > 1200) {
                nagAt = now;
                toast("Wait for your turn");
            }
            return;
        }
        submitAction({ type: "guess", letter });
    }

    /* ---------- bot (hanya mode ai, dijalankan sisi lokal) ---------- */
    function syncBot() {
        if (botTimer) {
            clearTimeout(botTimer);
            botTimer = null;
        }
        if (online || !state || state.phase !== "playing" || state.turn !== 1) return;
        botTimer = setTimeout(() => {
            botTimer = null;
            if (!state || state.phase !== "playing" || state.turn !== 1) return;
            const rec = state.words[state.round];
            const letter = botPickLetter(rec.w, state.guessed, state.wrongs, state.botStun > 0);
            if (letter) applyAction({ type: "guess", letter }, 1);
        }, 800 + Math.random() * 700);
    }

    /* ---------- input: mouse / sentuh (delegasi) ---------- */
    function handleClick(event) {
        const el = event.target.closest("[data-act],[data-letter],[data-cheat],[data-exit]");
        if (!el) return;
        if (el.hasAttribute("data-exit")) {
            onExit();
            return;
        }
        if (el.disabled) return;
        const letter = el.getAttribute("data-letter");
        if (letter) {
            tryGuess(letter);
            return;
        }
        const cheat = el.getAttribute("data-cheat");
        if (cheat) {
            if (online) return;
            if (cheat === "peek") doPeek();
            else submitAction({ type: "cheat", kind: cheat });
            return;
        }
        const act = el.getAttribute("data-act");
        if (act === "start" || act === "restart" || act === "again") submitAction({ type: "start" });
        else if (act === "help") ovHelp.hidden = false;
        else if (act === "cheat") {
            if (!online) ovCheat.hidden = false;
        } else if (act === "close-help") ovHelp.hidden = true;
        else if (act === "close-cheat") ovCheat.hidden = true;
        else if (act === "close-peek") ovPeek.hidden = true;
    }

    /* ---------- input: keyboard fisik (desktop) ---------- */
    function handleKey(event) {
        if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
        const k = event.key;
        if (k === "Escape") {
            closeLocalOverlays();
            return;
        }
        if (k === "Enter") {
            if (event.target && event.target.closest && event.target.closest("button")) return;
            if (localOverlayOpen()) return;
            if (state && (state.phase === "lobby" || state.phase === "over") && canStart())
                submitAction({ type: "start" });
            return;
        }
        if (/^[a-zA-Z]$/.test(k)) {
            if (localOverlayOpen()) return;
            tryGuess(k.toUpperCase());
        }
    }

    root.addEventListener("click", handleClick);
    document.addEventListener("keydown", handleKey);

    /* ---------- wiring mode ---------- */
    if (online) {
        track(room.onRoom((nextRoom) => {
            roomData = nextRoom;
            render();
        }));
        if (room.isHost) {
            state = lobbyState();
            publish();
            // seat guest = kebalikan seat host (posisi diacak tiap game)
            track(room.onAction((action) => applyAction(action, state ? 1 - state.hostSeat : 1)));
        } else {
            track(room.onState((nextState) => {
                state = normalizeState(nextState);
                if (state && !helloSent) {
                    helloSent = true;
                    submitAction({ type: "hello", name: playerName });
                }
                render();
            }));
        }
    } else {
        state = lobbyState();
        render();
    }

    return {
        destroy() {
            root.removeEventListener("click", handleClick);
            document.removeEventListener("keydown", handleKey);
            clearTimers();
            offs.forEach((off) => {
                try {
                    off();
                } catch (err) { /* abaikan */ }
            });
            root.innerHTML = "";
        },
    };
}