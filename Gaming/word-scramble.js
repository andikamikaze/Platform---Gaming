/* ==== GAME: word-scramble.js ==== */

/*
  - File game mengikuti template baru: export META + export mount(root, context).
  - id harus sama dengan nama file tanpa .js ("word-scramble").
  - Setelah mengubah META, jalankan: node tools/build-games-manifest.mjs
  - Mode:
      mode "ai"   -> solo vs Bot (giliran jalan diundi, cheat tersedia).
      mode "room" -> multiplayer online (host authoritative; posisi P1/P2
                     dan giliran pertama diundi acak setiap match).
*/

export const META = {
    id: "word-scramble",
    name: "Word Scramble",
    category: "words",
    catLabel: "Word",
    desc: "Unscramble the tiles before the clock runs out. Face a bot or a friend across eight random, always-solvable levels.",
    art: '<svg viewBox="0 0 48 48" width="54" height="54" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="9" width="11" height="14" rx="3" transform="rotate(-9 10.5 16)"/><rect x="18.5" y="7" width="11" height="14" rx="3" transform="rotate(7 24 14)"/><rect x="32" y="10" width="11" height="14" rx="3" transform="rotate(-5 37.5 17)"/><path d="M14 36c3 4 8 5 12 3"/><path d="M26.5 39l.7-4.4-4.4-.7"/></svg>',
    bg: ["#fef3c7", "#fbbf24"],
    bestKey: "wordScrambleBest",
};

/* ============================================================
   PURE LOGIC
============================================================ */
const ROUNDS = 8;
const TIME_MS = 25000;
const SKIPS = 2;
const REVEAL_MS = 1200;
const WRONG_FOR_HINT = 2;

/* [word, hint] — dibucket berdasarkan panjang untuk difficulty ramp */
const POOL = {
    short: [
        ["LAMP", "It gives light on a desk."],
        ["MOON", "It glows in the night sky."],
        ["STAR", "A bright point in the sky."],
        ["FROG", "A green animal that hops."],
        ["MILK", "A white drink from cows."],
        ["GOLD", "A precious yellow metal."],
        ["WIND", "Moving air you can feel."],
        ["LEAF", "A green part of a tree."],
        ["MANGO", "A sweet tropical fruit with a flat seed."],
        ["CLOUD", "White or grey, floating in the sky."],
        ["STONE", "A small piece of rock."],
        ["BRAVE", "Showing courage."],
        ["LEMON", "A sour yellow citrus fruit."],
        ["NIGHT", "The dark part of the day."],
        ["PIANO", "A large keyboard instrument."],
        ["RIVER", "Water flowing toward the sea."],
        ["BEACH", "The sandy edge of the sea."],
        ["CHAIR", "A seat for one person."],
        ["DREAM", "Images while you sleep."],
        ["FROST", "Thin ice on a cold morning."],
        ["GRAPE", "Small fruit grown in bunches."],
        ["HOUSE", "A building people live in."],
        ["LIGHT", "What lets you see."],
        ["MUSIC", "Organized sound."],
        ["OCEAN", "A vast body of salt water."],
        ["PEARL", "A gem from an oyster."],
        ["STORM", "Violent weather with wind and rain."],
        ["SUGAR", "Sweet white crystals."],
        ["WATER", "H2O."],
        ["ZEBRA", "A striped African animal."],
        ["BREAD", "Baked food made from flour."],
        ["CANDY", "A sweet treat."],
        ["WITCH", "A woman with magic powers."],
    ],
    mid: [
        ["SUNSET", "When the sun goes down."],
        ["GARDEN", "Where flowers are grown."],
        ["ORCHID", "An elegant exotic flower."],
        ["JUNGLE", "Dense tropical forest."],
        ["ROCKET", "It flies to space."],
        ["PLANET", "Earth is one."],
        ["WINTER", "The coldest season."],
        ["MARKET", "Where goods are sold."],
        ["CASTLE", "A fortified royal home."],
        ["DRAGON", "A fire-breathing legend."],
        ["FOREST", "Many trees together."],
        ["ISLAND", "Land surrounded by water."],
        ["SILVER", "A shiny grey metal."],
        ["TUNNEL", "A passage underground."],
        ["WALLET", "It holds your cards and cash."],
        ["PUZZLE", "A problem to solve."],
    ],
    long: [
        ["BALCONY", "A platform outside an upper window."],
        ["CRYSTAL", "Clear like quartz."],
        ["DIAMOND", "The hardest gem."],
        ["EMPEROR", "Ruler of an empire."],
        ["GIRAFFE", "The tallest animal."],
        ["HARVEST", "Gathering the crops."],
        ["ICEBERG", "Floating ice, mostly hidden."],
        ["LIBRARY", "A home for books."],
        ["MYSTERY", "Something unexplained."],
        ["OCTOPUS", "Eight-armed sea creature."],
        ["PILGRIM", "A traveler to a holy place."],
        ["THUNDER", "The sound after lightning."],
        ["VOLCANO", "A mountain that erupts."],
    ],
};
const ALL_WORDS = new Set([...POOL.short, ...POOL.mid, ...POOL.long].map((p) => p[0]));

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
/* Scramble dijamin: permutasi huruf (selalu solvable), berbeda dari kata asli,
   dan bukan kata lain di pool (tidak ambigu). Fallback: rotasi huruf. */
function scramble(word, rnd) {
    const letters = word.split("");
    for (let g = 0; g < 60; g++) {
        const out = shuffle(letters, rnd).join("");
        if (out !== word && !ALL_WORDS.has(out)) return out;
    }
    for (let k = 1; k < word.length; k++) {
        const out = word.slice(k) + word.slice(0, k);
        if (out !== word && !ALL_WORDS.has(out)) return out;
    }
    return letters.reverse().join("");
}
/* Random level generator: 3 kata pendek, 3 sedang, 2 panjang (makin sulit). */
function pickLevel(rnd) {
    const plan = [["short", 3], ["mid", 3], ["long", 2]];
    const out = [];
    for (const [bucket, n] of plan) {
        for (const [w, hint] of shuffle(POOL[bucket], rnd).slice(0, n)) {
            out.push({ w, hint, s: scramble(w, rnd) });
        }
    }
    return out;
}
function roundScore(msLeft) {
    return 100 + Math.max(0, Math.floor(msLeft / 1000)) * 4;
}
function botPlan(len) {
    const p = len <= 4 ? 0.8 : len === 5 ? 0.74 : len === 6 ? 0.58 : 0.44;
    const delay = Math.min(20000, 4000 + Math.random() * (len >= 6 ? 14000 : 11000));
    return { p, delay };
}
const esc = (s) =>
    String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const clean = (s) => String(s || "").toUpperCase().replace(/[^A-Z]/g, "");

/* ============================================================
   MOUNT
============================================================ */
export function mount(root, context = {}) {
    const { mode = "ai", room = null, playerName = "Player", onExit = () => { } } = context;
    const online = mode === "room" && Boolean(room);
    const isHost = !online || Boolean(room.isHost); // AI mode bertindak sebagai "host" lokal
    const vsBot = !online;
    let roomData = room?.room || null;

    let state = null;
    let entry = [];            // index tile yang dipakai untuk jawaban (UI lokal)
    let openOverlay = null;    // "howto" | "cheats" | null
    let localToast = null;     // feedback lokal (mis. jawaban belum lengkap)
    let shakeNow = false;
    let timers = [], botTm = null, tick = null;
    let lastKey = "", lastWrongSeen = 0;
    const offs = [];

    const later = (fn, ms) => {
        const tm = setTimeout(() => {
            timers = timers.filter((x) => x !== tm);
            fn();
        }, ms);
        timers.push(tm);
        return tm;
    };
    const clearTimers = () => {
        timers.forEach(clearTimeout);
        timers = [];
        botTm = null;
    };
    const mySeat = () =>
        !online ? 0 : room.isHost ? (state ? state.hostSeat : 0) : state ? 1 - state.hostSeat : 1;
    const cur = () => state.words[Math.min(state.idx, ROUNDS - 1)];
    const remaining = () =>
        !state || state.phase !== "playing"
            ? 0
            : state.frozen
                ? state.frozenLeft
                : Math.max(0, state.deadline - Date.now());
    const canEdit = () => Boolean(state) && state.phase === "playing" && state.turn === mySeat() && !openOverlay;

    /* ---------- skeleton + scoped styles (minimalist) ---------- */
    root.innerHTML = `
<style>
.ws-root{font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:#1c1917}
.ws-root .game-intro h2{margin:0 0 4px;font-size:20px;font-weight:800;letter-spacing:-.01em}
.ws-root .game-intro p{margin:0;font-size:13.5px;color:#78716c;max-width:56ch}
.ws-app{--ink:#1c1917;--muted:#78716c;--line:#e7e5e4;--accent:#4f46e5;--good:#16a34a;--bad:#dc2626;--warn:#b45309;
  background:#fafaf9;border:1px solid var(--line);border-radius:16px;padding:16px;width:100%}
.ws-stage{position:relative;display:flex;flex-direction:column;gap:14px;min-height:460px}
.ws-min{display:grid;place-items:center}
.ws-scores{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.ws-score{border:1px solid var(--line);background:#fff;border-radius:12px;padding:10px 14px;display:flex;flex-direction:column;gap:2px;transition:border-color .2s,box-shadow .2s}
.ws-score.ws-active{border-color:var(--accent);box-shadow:0 0 0 3px #4f46e51a}
.ws-tag{font-size:10.5px;font-weight:800;letter-spacing:.08em;color:var(--muted)}
.ws-name{font-size:13.5px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ws-pts{font-size:24px;font-weight:800;letter-spacing:-.02em}
.ws-sub{font-size:11.5px;color:var(--muted)}
.ws-meta{display:flex;flex-wrap:wrap;gap:8px;justify-content:center}
.ws-chip{border:1px solid var(--line);background:#fff;border-radius:999px;padding:4px 12px;font-size:12.5px;color:var(--muted)}
.ws-chip b{color:var(--ink);font-weight:800}
.ws-chip.ws-flag{border-color:#fde68a;background:#fffbeb;color:var(--warn);font-weight:700}
.ws-chip.ws-pulse{animation:ws-pulse 1.2s ease-in-out infinite}
@keyframes ws-pulse{0%,100%{opacity:1}50%{opacity:.45}}
.ws-track{height:4px;border-radius:999px;background:var(--line);overflow:hidden}
.ws-track i{display:block;height:100%;width:100%;background:var(--accent);border-radius:999px;transition:width .25s linear}
.ws-track i.ws-low{background:var(--bad)}
b[data-time].ws-low{color:var(--bad)}
.ws-dots{display:flex;gap:7px;justify-content:center}
.ws-dot{width:10px;height:10px;border-radius:50%;background:var(--line);transition:transform .2s,background .2s}
.ws-dot.ws-ok{background:var(--good)}
.ws-dot.ws-skip{background:#d97706}
.ws-dot.ws-miss{background:#fca5a5}
.ws-dot.ws-now{transform:scale(1.35);background:var(--accent);box-shadow:0 0 0 3px #4f46e522}
.ws-hint{border:1px solid #fde68a;background:#fffbeb;color:#92400e;border-radius:10px;padding:8px 12px;font-size:13px;text-align:center;line-height:1.45}
.ws-hint-cheat{border-color:#bbf7d0;background:#f0fdf4;color:#166534}
.ws-bank{display:flex;gap:8px;flex-wrap:wrap;justify-content:center}
.ws-bank.ws-dim{opacity:.35}
.ws-tile{width:clamp(42px,10vw,52px);height:clamp(50px,12vw,60px);border:1.5px solid #d6d3d1;border-radius:12px;background:#fff;
  display:grid;place-items:center;font-size:clamp(18px,4.5vw,22px);font-weight:800;color:var(--ink);cursor:pointer;
  transition:transform .12s,border-color .12s,opacity .12s;font-family:inherit}
.ws-tile:not(:disabled):hover{transform:translateY(-2px);border-color:var(--accent)}
.ws-tile.ws-used{opacity:.22}
.ws-tile:disabled{cursor:default}
.ws-answer{display:flex;gap:8px;flex-wrap:wrap;justify-content:center}
.ws-answer.ws-shake{animation:ws-shake .3s}
@keyframes ws-shake{0%,100%{transform:translateX(0)}25%{transform:translateX(-7px)}75%{transform:translateX(7px)}}
.ws-slot{width:clamp(38px,9vw,46px);height:clamp(46px,11vw,54px);border:2px dashed #d6d3d1;border-radius:10px;background:transparent;
  display:grid;place-items:center;font-size:clamp(16px,4vw,20px);font-weight:800;color:var(--accent);cursor:default;font-family:inherit}
.ws-slot.ws-full{border-style:solid;border-color:#c7d2fe;background:#eef2ff;cursor:pointer}
.ws-slot.ws-slot-ok{border-style:solid;border-color:#86efac;background:#f0fdf4;color:var(--good)}
.ws-controls{display:flex;gap:8px;flex-wrap:wrap;justify-content:center}
.ws-btn{border:1.5px solid #d6d3d1;background:#fff;color:var(--ink);border-radius:10px;padding:10px 16px;font:inherit;font-size:14px;font-weight:700;cursor:pointer;transition:border-color .12s,transform .12s}
.ws-btn:not(:disabled):hover{border-color:var(--accent);transform:translateY(-1px)}
.ws-btn:disabled{opacity:.4;cursor:default}
.ws-btn.ws-primary{background:var(--accent);border-color:var(--accent);color:#fff}
.ws-toast{min-height:20px;text-align:center;font-size:13.5px;font-weight:600;color:var(--muted)}
.ws-toast.ws-good{color:var(--good)}
.ws-toast.ws-bad{color:var(--bad)}
.ws-keys{text-align:center;font-size:12px;color:var(--muted)}
.ws-keys-m{display:none}
.ws-ov{position:absolute;inset:0;background:#fafaf9eb;backdrop-filter:blur(3px);display:grid;place-items:center;padding:14px;z-index:5;border-radius:12px}
.ws-card{background:#fff;border:1px solid var(--line);border-radius:16px;padding:22px;max-width:430px;width:100%;text-align:center;box-shadow:0 8px 30px #0000000d}
.ws-card h3{margin:0 0 8px;font-size:18px;font-weight:800;letter-spacing:-.01em}
.ws-card p{margin:0 0 6px;font-size:13.5px;color:var(--muted);line-height:1.55}
.ws-card ul{margin:8px 0;padding-left:18px;text-align:left;font-size:13px;color:#44403c;line-height:1.6}
.ws-card .ws-row{display:flex;gap:8px;justify-content:center;flex-wrap:wrap;margin-top:14px}
.ws-cheats{display:flex;flex-direction:column;gap:8px;margin-top:10px}
.ws-cheat{border:1.5px solid var(--line);background:#fff;border-radius:10px;padding:9px 12px;font:inherit;cursor:pointer;text-align:left;display:flex;flex-direction:column;gap:1px}
.ws-cheat b{font-size:13.5px}
.ws-cheat span{font-size:11.5px;color:var(--muted)}
.ws-cheat:not(:disabled):hover{border-color:var(--accent)}
.ws-cheat:disabled{opacity:.4;cursor:default}
@media (pointer:coarse){
  .ws-keys-d{display:none}
  .ws-keys-m{display:inline}
  .ws-btn{min-height:44px}
}
@media (max-width:560px){
  .ws-app{padding:12px}
  .ws-pts{font-size:20px}
  .ws-controls .ws-btn{flex:1 1 auto}
}
@media (prefers-reduced-motion:reduce){
  .ws-app *{animation:none!important;transition:none!important}
}
</style>
<div class="game-app ws-root">
  <div class="game-intro">
    <div><h2>Word Scramble</h2><p>${META.desc}</p></div>
    <span class="game-status"><i class="game-status-dot"></i><span data-status>Ready</span></span>
  </div>
  <section class="game-panel" data-board></section>
  <div class="game-actions">
    <button class="game-action-button" type="button" data-act="howto">How to play</button>
    ${vsBot ? '<button class="game-action-button" type="button" data-act="cheats">Cheats</button>' : ""}
    <button class="game-action-button" type="button" data-exit>Exit game</button>
  </div>
</div>`;

    const boardEl = root.querySelector("[data-board]");
    const statusEl = root.querySelector("[data-status]");

    /* ---------- state factory ---------- */
    function freshState(names, hostSeat) {
        const r = rng((Math.random() * 1e9) | 0);
        return {
            phase: "ready", // ready | playing | reveal | over
            words: pickLevel(r),
            idx: 0, first: 0, turn: 0,
            hostSeat, names,
            scores: [0, 0], solved: [0, 0], skips: [SKIPS, SKIPS],
            wrong: 0, deadline: null, frozen: false, frozenLeft: 0,
            last: null, revealWord: null, results: [],
            cheated: false, cheatReveal: false,
        };
    }
    function resetGame() {
        clearTimers();
        const old = state;
        // Random posisi: host bisa menjadi P1 atau P2 setiap match (online).
        const hostSeat = online ? (Math.random() < 0.5 ? 0 : 1) : 0;
        let names;
        if (!online) {
            names = old ? old.names : [playerName || "You", "Bot"];
        } else {
            const hName = old ? old.names[old.hostSeat] : playerName || "Host";
            const gName = old ? old.names[1 - old.hostSeat] : "Guest";
            names = [null, null];
            names[hostSeat] = hName;
            names[1 - hostSeat] = gName;
        }
        state = freshState(names, hostSeat);
        entry = [];
        openOverlay = null;
        localToast = null;
        publish();
    }

    /* ---------- best score (solo, tanpa cheat) ---------- */
    function bestScore() {
        try { return Number(localStorage.getItem(META.bestKey)) || 0; } catch (e) { return 0; }
    }
    function saveBest() {
        if (online || !state || state.cheated || !META.bestKey) return;
        try {
            if (state.scores[0] > bestScore()) localStorage.setItem(META.bestKey, String(state.scores[0]));
        } catch (e) { }
    }

    /* ---------- round flow (host-authoritative) ---------- */
    function doSolve(seat) {
        const pts = roundScore(remaining());
        state.scores[seat] += pts;
        state.solved[seat]++;
        state.results[state.idx] = { seat, kind: "ok", pts };
        toReveal({ kind: "solve", seat, pts });
    }
    function toReveal(last) {
        state.phase = "reveal";
        state.revealWord = cur().w;
        state.last = last;
        state.deadline = null;
        state.frozen = false;
        publish();
        later(advance, REVEAL_MS);
    }
    function advance() {
        if (!state || state.phase !== "reveal") return;
        state.idx++;
        state.revealWord = null;
        state.last = null;
        state.wrong = 0;
        state.cheatReveal = false;
        if (state.idx >= ROUNDS) {
            state.phase = "over";
            state.deadline = null;
            saveBest();
            publish();
            return;
        }
        state.turn = (state.first + state.idx) % 2;
        state.deadline = Date.now() + TIME_MS;
        state.phase = "playing";
        publish();
    }

    /* ---------- actions ---------- */
    function applyAction(action, actor) {
        if (!state || !action || typeof action.type !== "string") return;
        if (actor !== 0 && actor !== 1) return;
        const t = action.type;

        if (t === "hello") {
            if (online && actor !== state.hostSeat) {
                state.names[actor] = String(action.name || "Guest").slice(0, 18) || "Guest";
                publish();
            }
            return;
        }
        if (t === "start") {
            if (state.phase !== "ready") return;
            // Random siapa yang jalan duluan (coin flip) setiap match.
            state.first = Math.random() < 0.5 ? 0 : 1;
            state.turn = state.first;
            state.deadline = Date.now() + TIME_MS;
            state.phase = "playing";
            state.last = { kind: "coin", seat: state.first };
            publish();
            return;
        }
        if (t === "restart") { resetGame(); return; }

        if (state.phase !== "playing") return;

        if (t === "guess") {
            if (actor !== state.turn) return;
            const v = clean(action.word);
            const { w } = cur();
            if (v.length !== w.length) return;
            if (v === w) { doSolve(actor); return; }
            state.wrong++;
            state.last = { kind: "wrong", seat: actor, n: state.wrong, guess: v };
            publish();
            return;
        }
        if (t === "skip") {
            if (actor !== state.turn || state.skips[actor] <= 0) return;
            state.skips[actor]--;
            state.results[state.idx] = { seat: actor, kind: "skip", pts: 0 };
            toReveal({ kind: "skip", seat: actor });
            return;
        }
        if (t === "timeout") {
            if (state.frozen) return;
            if (state.deadline && Date.now() < state.deadline - 300) return;
            state.results[state.idx] = { seat: state.turn, kind: "miss", pts: 0 };
            toReveal({ kind: "timeout", seat: state.turn });
            return;
        }
        if (t === "botfail") {
            if (!vsBot || actor !== 1 || state.turn !== 1) return;
            state.results[state.idx] = { seat: 1, kind: "miss", pts: 0 };
            toReveal({ kind: "botfail", seat: 1 });
            return;
        }
    }
    function submitAction(action) {
        if (online && !room.isHost) {
            room.sendAction(action).catch(console.warn);
            return;
        }
        applyAction(action, mySeat());
    }

    /* ---------- bot (hanya mode AI, dijadwalkan sisi "host") ---------- */
    function scheduleBot() {
        if (botTm) { clearTimeout(botTm); botTm = null; }
        if (!vsBot || !state || state.phase !== "playing" || state.turn !== 1 || state.frozen) return;
        const { w } = cur();
        const plan = botPlan(w.length);
        botTm = later(() => {
            botTm = null;
            if (!state || state.phase !== "playing" || state.turn !== 1) return;
            if (Math.random() < plan.p) applyAction({ type: "guess", word: w }, 1);
            else applyAction({ type: "botfail" }, 1);
        }, plan.delay);
    }

    /* ---------- cheats (solo saja; menandai run sebagai cheated) ---------- */
    function applyCheat(kind) {
        if (online || !state || state.phase !== "playing") return;
        const me = mySeat();
        if (kind === "reveal") {
            state.cheated = true; state.cheatReveal = true;
        } else if (kind === "solve") {
            if (state.turn !== me) return;
            state.cheated = true;
            applyAction({ type: "guess", word: cur().w }, me);
            return;
        } else if (kind === "time") {
            state.cheated = true;
            if (state.frozen) state.frozenLeft += 15000;
            else state.deadline += 15000;
        } else if (kind === "freeze") {
            state.cheated = true;
            if (state.frozen) {
                state.deadline = Date.now() + state.frozenLeft;
                state.frozen = false;
            } else {
                state.frozenLeft = remaining();
                state.frozen = true;
                if (botTm) { clearTimeout(botTm); botTm = null; }
            }
        } else if (kind === "skips") {
            state.cheated = true; state.skips[me] = 99;
        } else if (kind === "hint") {
            state.cheated = true; state.wrong = Math.max(state.wrong, WRONG_FOR_HINT);
        }
        publish();
    }

    /* ---------- rendering ---------- */
    function publish() {
        localToast = null;
        render();
        scheduleBot();
        if (online && room.isHost) room.publishState(state).catch(console.warn);
    }

    function toastFromState(me) {
        const L = state.last;
        const nm = (seat) => (seat === me ? "You" : esc(state.names[seat]));
        if (!L) {
            if (state.phase === "ready") return { msg: "Press start when you are ready.", mood: "" };
            if (state.phase === "over") return { msg: "Match complete.", mood: "" };
            return {
                msg: state.turn === me ? "Your turn — unscramble the tiles." : vsBot ? "Bot is thinking…" : esc(state.names[state.turn]) + " is thinking…",
                mood: "",
            };
        }
        if (L.kind === "coin") return { msg: "Coin flip: " + (L.seat === me ? "you start!" : nm(L.seat) + " starts!"), mood: "good" };
        if (L.kind === "wrong") {
            const base = L.seat === me ? '"' + esc(L.guess) + '" is not it — try again.' : nm(L.seat) + " missed (attempt " + L.n + ").";
            return { msg: state.wrong === WRONG_FOR_HINT ? base + " Hint unlocked!" : base, mood: "bad" };
        }
        if (L.kind === "solve") return { msg: nm(L.seat) + " solved it! +" + L.pts + " points", mood: "good" };
        if (L.kind === "skip") return { msg: nm(L.seat) + " skipped — it was " + state.revealWord + ".", mood: "bad" };
        if (L.kind === "timeout") return { msg: "Time is up — it was " + state.revealWord + ".", mood: "bad" };
        if (L.kind === "botfail") return { msg: "Bot gave up — it was " + state.revealWord + ".", mood: "bad" };
        return { msg: "", mood: "" };
    }

    function startOv(me) {
        const best = bestScore();
        return `<div class="ws-ov"><div class="ws-card">
      <h3>Word Scramble</h3>
      <p>The tiles hide a real word with its letters mixed up. Build the answer from the letter buttons (or type it) and submit before the 25-second clock empties. Eight rounds, turns alternate, faster solves earn more points.</p>
      <p>${online
                ? "You are <b>P" + (me + 1) + "</b> this match. Seats and the opening turn are drawn at random; either player can press start."
                : "A coin flip decides whether you or the bot moves first."}</p>
      ${!online && best > 0 ? "<p>Best score: <b>" + best + "</b></p>" : ""}
      <div class="ws-row">
        <button type="button" class="ws-btn ws-primary" data-act="start">Start game</button>
        <button type="button" class="ws-btn" data-act="howto">How to play</button>
      </div>
    </div></div>`;
    }
    function overOv(me) {
        const a = state.scores[0], b = state.scores[1];
        let title;
        if (a === b) title = "It's a draw";
        else {
            const winSeat = a > b ? 0 : 1;
            title = winSeat === me ? "You win!" : vsBot ? "Bot wins" : esc(state.names[winSeat]) + " wins";
        }
        return `<div class="ws-ov"><div class="ws-card">
      <h3>${title}</h3>
      <p>${esc(state.names[0])} <b>${a}</b> — <b>${b}</b> ${esc(state.names[1])}.<br/>
      You solved ${state.solved[me]} of ${ROUNDS / 2} turns.</p>
      ${state.cheated ? "<p>Cheats were used — best score was not saved.</p>" : !online && bestScore() > 0 ? "<p>Best score: <b>" + bestScore() + "</b></p>" : ""}
      <div class="ws-row">
        <button type="button" class="ws-btn ws-primary" data-act="restart">Play again</button>
        <button type="button" class="ws-btn" data-exit>Exit game</button>
      </div>
    </div></div>`;
    }
    function howtoOv() {
        return `<div class="ws-ov"><div class="ws-card">
      <h3>How to play</h3>
      <ul>
        <li>Unscramble the tiles into the hidden word before the 25-second timer empties.</li>
        <li>Turns alternate; a coin flip decides who starts. Each side plays 4 of the 8 rounds.</li>
        <li>Score: 100 points + 4 per second left. Wrong guesses cost only time.</li>
        <li>After ${WRONG_FOR_HINT} wrong guesses a hint appears: a clue plus the first letter.</li>
        <li>Each player has ${SKIPS} skips. Skipping reveals the word but scores 0.</li>
        <li>Every level is generated from a real word and is always solvable; words get longer in later rounds.</li>
        <li>Desktop: type A–Z, Backspace deletes, Enter submits, Esc clears. Mouse: click tiles to add, click a filled slot to remove.</li>
        <li>Mobile: tap the letter buttons, then Submit. No keyboard needed.</li>
        ${vsBot ? "<li>The Cheats button opens helpers (reveal, auto-solve, extra time, freeze, skips, hint). Using them flags the run.</li>" : "<li>Cheats are disabled in online matches for fairness.</li>"}
      </ul>
      <div class="ws-row"><button type="button" class="ws-btn ws-primary" data-act="close">Got it</button></div>
    </div></div>`;
    }
    function cheatsOv(me) {
        const dis = state.phase !== "playing" ? "disabled" : "";
        const solveDis = state.phase !== "playing" || state.turn !== me ? "disabled" : "";
        const row = (id, name, desc, d) =>
            `<button type="button" class="ws-cheat" data-cheat="${id}" ${d}><b>${name}</b><span>${desc}</span></button>`;
        return `<div class="ws-ov"><div class="ws-card">
      <h3>Cheats</h3>
      <p>Solo mode only. Using any cheat flags this run and disables best-score saving.</p>
      <div class="ws-cheats">
        ${row("reveal", "Reveal word", "Show the answer for this round.", dis)}
        ${row("solve", "Auto-solve", "Instantly submit the correct word (your turn only).", solveDis)}
        ${row("time", "+15 seconds", "Add time to the current round.", dis)}
        ${row("freeze", state.frozen ? "Unfreeze timer" : "Freeze timer", "Pause or resume the clock (also pauses the bot).", dis)}
        ${row("skips", "Unlimited skips", "Set your skips to 99.", dis)}
        ${row("hint", "Instant hint", "Unlock the clue and first letter right away.", dis)}
      </div>
      <div class="ws-row"><button type="button" class="ws-btn ws-primary" data-act="close">Close</button></div>
    </div></div>`;
    }

    function render() {
        if (!state) {
            boardEl.innerHTML = `<div class="ws-app"><div class="ws-stage ws-min"><div class="ws-card"><h3>Waiting for host…</h3><p>The match state has not arrived yet.</p></div></div></div>`;
            if (statusEl) statusEl.textContent = "Waiting…";
            return;
        }
        const me = mySeat();
        const { phase, idx, turn, names, scores, solved, skips, wrong } = state;
        const results = state.results || [];
        const { w, hint, s } = cur();
        const myTurn = phase === "playing" && turn === me;
        const reveal = phase === "reveal" || phase === "over";

        const key = [idx, turn, phase, state.hostSeat].join("|");
        if (key !== lastKey) { lastKey = key; entry = []; lastWrongSeen = 0; }

        const shake =
            myTurn && (shakeNow || (state.last && state.last.kind === "wrong" && state.last.seat === me && state.last.n !== lastWrongSeen));
        if (state.last && state.last.kind === "wrong") lastWrongSeen = Math.max(lastWrongSeen, state.last.n);
        shakeNow = false;

        const toast = localToast || toastFromState(me);
        const botThinking = vsBot && phase === "playing" && turn === 1;
        const turnLabel =
            phase === "ready" ? "Coin flip on start"
                : phase === "reveal" ? "Round over"
                    : phase === "over" ? "Match over"
                        : myTurn ? "Your turn"
                            : botThinking ? "Bot thinking…"
                                : esc(names[turn]) + "'s turn";

        const scoreCard = (seat) => {
            const active = phase === "playing" && turn === seat;
            const label = seat === me ? "You" : esc(names[seat]);
            return `<div class="ws-score${active ? " ws-active" : ""}">
        <span class="ws-tag">P${seat + 1}${seat === me ? " · YOU" : ""}</span>
        <span class="ws-name">${label}</span>
        <span class="ws-pts">${scores[seat]}</span>
        <span class="ws-sub">solved ${solved[seat]} · skips ${skips[seat]}</span>
      </div>`;
        };

        const dots = Array.from({ length: ROUNDS }, (_, i) => {
            const r = results[i];
            let cls = "ws-dot";
            if (r) cls += r.kind === "ok" ? " ws-ok" : r.kind === "skip" ? " ws-skip" : " ws-miss";
            if (i === idx && phase !== "over") cls += " ws-now";
            return `<span class="${cls}"></span>`;
        }).join("");

        let hintBar = "";
        if (state.cheatReveal && phase === "playing") {
            hintBar = `<div class="ws-hint ws-hint-cheat">Cheat reveal: the word is <b>${w}</b>.</div>`;
        } else if (phase === "playing" && wrong >= WRONG_FOR_HINT) {
            hintBar = `<div class="ws-hint">Hint: ${esc(hint)} It starts with <b>${w[0]}</b>.</div>`;
        }

        const bank = s.split("").map((ch, i) => {
            const used = entry.includes(i);
            return `<button type="button" class="ws-tile${used ? " ws-used" : ""}" data-tile="${i}" ${!myTurn || used || reveal ? "disabled" : ""}>${ch}</button>`;
        }).join("");

        const slots = w.split("").map((_, j) => {
            if (reveal) {
                const rw = state.revealWord || w;
                return `<span class="ws-slot ws-slot-ok">${rw[j]}</span>`;
            }
            const filled = j < entry.length;
            return `<button type="button" class="ws-slot${filled ? " ws-full" : ""}" data-slot="${j}" ${!myTurn || !filled ? "disabled" : ""}>${filled ? s[entry[j]] : ""}</button>`;
        }).join("");

        const dis = myTurn ? "" : "disabled";
        const skipDis = !myTurn || skips[me] <= 0 ? "disabled" : "";

        const ov =
            openOverlay === "howto" ? howtoOv()
                : openOverlay === "cheats" ? cheatsOv(me)
                    : phase === "ready" ? startOv(me)
                        : phase === "over" ? overOv(me)
                            : "";

        boardEl.innerHTML = `
<div class="ws-app"><div class="ws-stage">
  <div class="ws-scores">${scoreCard(0)}${scoreCard(1)}</div>
  <div class="ws-meta">
    <span class="ws-chip">Round <b>${Math.min(idx + 1, ROUNDS)}/${ROUNDS}</b></span>
    <span class="ws-chip">Time <b data-time>25s</b></span>
    <span class="ws-chip${botThinking ? " ws-pulse" : ""}">${turnLabel}</span>
    ${state.cheated ? '<span class="ws-chip ws-flag">Cheats on</span>' : ""}
  </div>
  <div class="ws-track"><i data-bar></i></div>
  <div class="ws-dots">${dots}</div>
  ${hintBar}
  <div class="ws-bank${reveal ? " ws-dim" : ""}">${bank}</div>
  <div class="ws-answer${shake ? " ws-shake" : ""}">${slots}</div>
  <div class="ws-controls">
    <button type="button" class="ws-btn" data-act="del" ${dis}>Delete</button>
    <button type="button" class="ws-btn" data-act="clear" ${dis}>Clear</button>
    <button type="button" class="ws-btn ws-primary" data-act="submit" ${dis}>Submit</button>
    <button type="button" class="ws-btn" data-act="skip" ${skipDis}>Skip (${skips[me]})</button>
  </div>
  <div class="ws-toast${toast.mood ? " ws-" + toast.mood : ""}">${toast.msg}</div>
  <div class="ws-keys">
    <span class="ws-keys-d">Keyboard: A–Z add · Backspace delete · Enter submit · Esc clear — or click tiles and slots.</span>
    <span class="ws-keys-m">Tap letters to build the word, then Submit. Tap a filled slot to remove it.</span>
  </div>
  ${ov}
</div></div>`;

        if (statusEl) {
            statusEl.textContent =
                phase === "ready" ? "Ready"
                    : phase === "reveal" ? "Revealing…"
                        : phase === "over" ? "Finished"
                            : myTurn ? "Your turn"
                                : botThinking ? "Bot is thinking…"
                                    : names[turn] + "'s turn";
        }
        updateClock();
    }

    function updateClock() {
        const tEl = root.querySelector("[data-time]");
        const bEl = root.querySelector("[data-bar]");
        if (!tEl || !state) return;
        let ms = 0, label = "—";
        if (state.phase === "ready") ms = TIME_MS;
        else if (state.phase === "playing") ms = state.frozen ? state.frozenLeft : Math.max(0, state.deadline - Date.now());
        if (state.phase === "ready" || state.phase === "playing") {
            label = Math.ceil(ms / 1000) + "s" + (state.frozen ? " (paused)" : "");
        }
        tEl.textContent = label;
        const low = state.phase === "playing" && ms <= 6000;
        tEl.classList.toggle("ws-low", low);
        if (bEl) {
            bEl.style.width = (state.phase === "over" ? 0 : (ms / TIME_MS) * 100) + "%";
            bEl.classList.toggle("ws-low", low);
        }
    }

    /* ---------- input: mouse + virtual buttons ---------- */
    function addLetter(ch) {
        if (!canEdit()) return;
        const { w, s } = cur();
        if (entry.length >= w.length) return;
        for (let i = 0; i < s.length; i++) {
            if (s[i] === ch && !entry.includes(i)) { entry.push(i); render(); return; }
        }
    }
    function submitGuess() {
        if (!canEdit()) return;
        const { w, s } = cur();
        if (entry.length < w.length) {
            localToast = { msg: "Use all the letters first.", mood: "bad" };
            shakeNow = true;
            render();
            return;
        }
        submitAction({ type: "guess", word: entry.map((i) => s[i]).join("") });
    }
    function handleClick(event) {
        const el = event.target;
        if (el.closest("[data-exit]")) { onExit(); return; }
        const cheat = el.closest("[data-cheat]");
        if (cheat) { applyCheat(cheat.dataset.cheat); return; }
        const act = el.closest("[data-act]");
        if (act) {
            const a = act.dataset.act;
            if (a === "howto") { openOverlay = "howto"; render(); return; }
            if (a === "cheats") { openOverlay = "cheats"; render(); return; }
            if (a === "close") { openOverlay = null; render(); return; }
            if (a === "start") { submitAction({ type: "start" }); return; }
            if (a === "restart") { submitAction({ type: "restart" }); return; }
            if (a === "submit") { submitGuess(); return; }
            if (a === "skip") { submitAction({ type: "skip" }); return; }
            if (a === "del") { if (canEdit()) { entry.pop(); render(); } return; }
            if (a === "clear") { if (canEdit()) { entry = []; render(); } return; }
            return;
        }
        const tile = el.closest("[data-tile]");
        if (tile && canEdit()) {
            const i = Number(tile.dataset.tile);
            if (!entry.includes(i) && entry.length < cur().w.length) { entry.push(i); render(); }
            return;
        }
        const slot = el.closest("[data-slot]");
        if (slot && canEdit()) {
            const j = Number(slot.dataset.slot);
            if (j < entry.length) { entry.splice(j, 1); render(); }
            return;
        }
    }

    /* ---------- input: keyboard fisik (desktop) ---------- */
    function handleKey(e) {
        if (!root.isConnected || e.defaultPrevented) return;
        const t = e.target;
        if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) return;
        if (e.ctrlKey || e.metaKey || e.altKey) return;
        if (openOverlay) {
            if (e.key === "Escape") { e.preventDefault(); openOverlay = null; render(); }
            return;
        }
        if (!state) return;
        if (state.phase === "ready" && e.key === "Enter") { e.preventDefault(); submitAction({ type: "start" }); return; }
        if (state.phase === "over" && e.key === "Enter") { e.preventDefault(); submitAction({ type: "restart" }); return; }
        if (!canEdit()) return;
        if (/^[a-zA-Z]$/.test(e.key)) { e.preventDefault(); addLetter(e.key.toUpperCase()); return; }
        if (e.key === "Backspace") { e.preventDefault(); entry.pop(); render(); return; }
        if (e.key === "Enter") { e.preventDefault(); submitGuess(); return; }
        if (e.key === "Escape") { e.preventDefault(); entry = []; render(); return; }
    }

    /* ---------- wiring ---------- */
    root.addEventListener("click", handleClick);
    document.addEventListener("keydown", handleKey);
    const sub = (fn) => { const off = fn(); if (typeof off === "function") offs.push(off); };

    if (online) {
        sub(() => room.onRoom((nextRoom) => { roomData = nextRoom; render(); }));
        if (room.isHost) {
            resetGame(); // bikin state awal (seat acak) lalu publish
            sub(() => room.onAction((action) => applyAction(action, 1 - state.hostSeat)));
        } else {
            sub(() => room.onState((nextState) => { state = nextState; render(); }));
            room.sendAction({ type: "hello", name: playerName }).catch(console.warn);
            render(); // tampilan menunggu sampai state host tiba
        }
    } else {
        resetGame();
    }

    tick = setInterval(() => {
        if (!state) return;
        updateClock();
        // Hanya host/AI yang menegakkan timeout (authoritative).
        if (isHost && state.phase === "playing" && !state.frozen && state.deadline && Date.now() >= state.deadline) {
            applyAction({ type: "timeout" }, state.turn);
        }
    }, 250);

    return {
        destroy() {
            root.removeEventListener("click", handleClick);
            document.removeEventListener("keydown", handleKey);
            clearTimers();
            if (tick) { clearInterval(tick); tick = null; }
            offs.forEach((off) => { try { off(); } catch (e) { } });
            state = null;
        },
    };
}