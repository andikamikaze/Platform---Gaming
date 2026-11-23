/* ==== GAME: cooking-simulator.js ==== */
/* Cooking Simulator - minimalist race-cooking game.
   Fill the customer order (any order), stop one timing bar, dish is served
   automatically. First to the level target wins the level. 5 random levels.
   AI mode: race vs Bot (random coin toss decides who cooks first).
   Room mode: race vs a friend (random seat assignment P1/P2 + coin toss). */

/*
- Metadata wajib: dibaca oleh tools/build-games-manifest.mjs.
- id harus sama dengan nama file tanpa .js.
*/
export const META = {
    id: "cooking-simulator",
    name: "Cooking Simulator",
    category: "simulation",
    catLabel: "Simulation",
    desc: "Race to cook: fill the order, nail one timing tap, reach the target first.",
    art: '<svg viewBox="0 0 48 48" width="54" height="54" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 20h24a10 10 0 0 1-10 10h-4A10 10 0 0 1 7 20z"/><path d="M31 25h11"/><path d="M16 14c0-2 2-3 2-5"/><path d="M25 14c0-2 2-3 2-5"/></svg>',
    bg: ["#ffedd5", "#ea580c"],
    bestKey: "cookingSimBestLevel",
};

export function mount(root, context = {}) {
    const { mode = "ai", room = null, playerName = "Player", onExit = () => { } } = context;
    const online = mode === "room" && Boolean(room);
    let roomData = room?.room || null;
    let state = null;

    /* ---------------- data ---------------- */
    const MAX_LEVEL = 5;
    const TRAY_MAX = 6;

    const INGREDIENTS = {
        tomato: "Tomato",
        cheese: "Cheese",
        lettuce: "Lettuce",
        bun: "Bun",
        patty: "Patty",
        fish: "Fish",
        rice: "Rice",
        egg: "Egg",
    };
    const ING_IDS = Object.keys(INGREDIENTS);

    const RECIPES = [
        { id: "omelet", name: "Cheese Omelet", ingredients: ["egg", "cheese", "tomato"], tier: 1 },
        { id: "salad", name: "Garden Salad", ingredients: ["lettuce", "tomato", "cheese"], tier: 1 },
        { id: "sushi", name: "Sushi Plate", ingredients: ["rice", "fish", "egg"], tier: 1 },
        { id: "rice-bowl", name: "Rice Bowl", ingredients: ["rice", "egg", "patty"], tier: 1 },
        { id: "burger", name: "Classic Burger", ingredients: ["bun", "patty", "cheese", "tomato"], tier: 2 },
        { id: "fish-burger", name: "Fish Burger", ingredients: ["bun", "fish", "lettuce", "tomato"], tier: 2 },
    ];

    const ICONS = {
        tomato: '<svg viewBox="0 0 24 24"><circle cx="12" cy="14" r="8" fill="#ef4444"/><path d="M12 6c0-2 2-3 4-3M12 6c0-2-2-3-4-3M12 6V4" fill="none" stroke="#22c55e" stroke-width="2" stroke-linecap="round"/></svg>',
        cheese: '<svg viewBox="0 0 24 24"><path d="M2 18v-5L20 6l2 5v7z" fill="#fbbf24"/><circle cx="8" cy="15" r="1.5" fill="#d97706"/><circle cx="14" cy="15" r="1.2" fill="#d97706"/><circle cx="18" cy="12" r="1" fill="#d97706"/></svg>',
        lettuce: '<svg viewBox="0 0 24 24"><path d="M5 15c-3-7 4-13 10-11 6 2 7 9 3 13-3 3-10 3-13-2z" fill="#4ade80"/><path d="M9 16c1-3 5-6 8-6" fill="none" stroke="#15803d" stroke-width="2" stroke-linecap="round"/></svg>',
        bun: '<svg viewBox="0 0 24 24"><path d="M4 13a8 8 0 0 1 16 0z" fill="#fbbf24"/><rect x="4" y="15" width="16" height="4" rx="2" fill="#f59e0b"/><circle cx="9" cy="9" r="0.9" fill="#fff7ed"/><circle cx="13" cy="8" r="0.9" fill="#fff7ed"/><circle cx="16" cy="10" r="0.9" fill="#fff7ed"/></svg>',
        patty: '<svg viewBox="0 0 24 24"><rect x="3" y="9" width="18" height="7" rx="3.5" fill="#92400e"/><path d="M7 11h10" stroke="#78350f" stroke-width="2" stroke-linecap="round"/></svg>',
        fish: '<svg viewBox="0 0 24 24"><path d="M3 12c3-4 8-6 12-3l5-3-1 6 1 6-5-3c-4 3-9 1-12-3z" fill="#60a5fa"/><circle cx="8" cy="11" r="1.1" fill="#0f172a"/></svg>',
        rice: '<svg viewBox="0 0 24 24"><path d="M5 12h14c0 4-3 7-7 7s-7-3-7-7z" fill="#cbd5e1"/><path d="M6 12c0-4 3-7 6-7s6 3 6 7z" fill="#f8fafc"/></svg>',
        egg: '<svg viewBox="0 0 24 24"><path d="M12 4c4 0 8 3 8 7 0 4-3 9-8 9s-8-5-8-9c0-4 4-7 8-7z" fill="#f8fafc"/><circle cx="12" cy="12" r="3.4" fill="#fbbf24"/></svg>',
    };

    /* local (per-client) cheat flags */
    const cheat = { perfect: false, slowBot: false };
    let cheatOpen = false;

    /* ---------------- pure helpers ---------------- */
    const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
    const randInt = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
    const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

    function poolFor(level) {
        return RECIPES.filter((r) => (level >= 3 ? true : r.tier === 1));
    }
    function makeOrder(level) {
        const pool = poolFor(level);
        const r = pool[randInt(0, pool.length - 1)];
        return { id: r.id, name: r.name, ingredients: r.ingredients.slice() };
    }
    /* random level generator - always beatable: target ~3-6 dishes, speed ramps gently */
    function genLevel(level) {
        return {
            level,
            target: 200 + level * 60 + randInt(-2, 2) * 10,
            speed: +(1.0 + 0.18 * level).toFixed(2),
        };
    }
    /* one simple score: ingredient match (any order) 50% + one timing tap 50% */
    function dishQuality(order, tray, pos) {
        const counts = {};
        order.ingredients.forEach((i) => { counts[i] = (counts[i] || 0) + 1; });
        let matched = 0;
        let extra = 0;
        tray.forEach((i) => {
            if (counts[i] > 0) { counts[i]--; matched++; } else { extra++; }
        });
        const ing = clamp(Math.round((matched / order.ingredients.length) * 100 - extra * 15), 0, 100);
        const timing = clamp(Math.round(100 - Math.abs(pos - 0.5) * 200), 0, 100);
        return { quality: Math.round(ing * 0.5 + timing * 0.5), ing, timing };
    }

    /* ---------------- skeleton (minimalist, no tutorial text) ---------------- */
    root.innerHTML = `
<style>
.cs-scope{--ink:#1c1917;--mut:#78716c;--line:#e7e5e4;--acc:#ea580c;--soft:#fafaf9;color:var(--ink)}
.cs-scope [hidden]{display:none!important}
.cs-scope .cs-panel{position:relative;background:var(--soft);border:1px solid var(--line);border-radius:14px;padding:14px;display:flex;flex-direction:column;gap:12px}
.cs-scope .cs-top{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.cs-scope .cs-chip{font-size:12px;font-weight:600;color:var(--mut);border:1px solid var(--line);background:#fff;border-radius:999px;padding:4px 10px}
.cs-scope .cs-turn{color:var(--acc);border-color:#fed7aa;background:#fff7ed}
.cs-scope .cs-mini{margin-left:auto;font-size:12px;font-weight:600;color:var(--mut);background:#fff;border:1px solid var(--line);border-radius:8px;padding:4px 10px;cursor:pointer}
.cs-scope .cs-mini:hover{border-color:var(--acc);color:var(--acc)}
.cs-scope .cs-score{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.cs-scope .cs-player{background:#fff;border:1px solid var(--line);border-radius:12px;padding:10px 12px}
.cs-scope .cs-player.on{border-color:var(--acc)}
.cs-scope .cs-player-top{display:flex;justify-content:space-between;align-items:center;gap:8px;font-size:13px;font-weight:600;margin-bottom:6px}
.cs-scope .cs-pname{display:inline-flex;align-items:center;gap:6px;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.cs-scope .cs-you{font-style:normal;font-size:9px;font-weight:700;letter-spacing:.5px;color:var(--acc);border:1px solid #fed7aa;border-radius:4px;padding:1px 4px}
.cs-scope .cs-prog{height:6px;border-radius:3px;background:#f5f5f4;overflow:hidden}
.cs-scope .cs-prog i{display:block;height:100%;background:var(--acc);border-radius:3px;transition:width .3s}
.cs-scope .cs-grid{display:grid;grid-template-columns:minmax(220px,300px) 1fr;gap:12px;align-items:start}
.cs-scope .cs-col{display:flex;flex-direction:column;gap:12px;min-width:0}
.cs-scope .cs-card{background:#fff;border:1px solid var(--line);border-radius:12px;padding:12px}
.cs-scope .cs-label{font-size:11px;font-weight:700;letter-spacing:.6px;text-transform:uppercase;color:var(--mut);margin-bottom:8px}
.cs-scope .cs-order-name{font-size:16px;font-weight:700;margin-bottom:8px}
.cs-scope .cs-order-ings{display:flex;flex-wrap:wrap;gap:6px}
.cs-scope .cs-ing-chip{display:inline-flex;align-items:center;gap:5px;font-size:12px;font-weight:600;border:1px solid var(--line);border-radius:999px;padding:3px 9px 3px 5px;background:var(--soft)}
.cs-scope .cs-ing-chip svg{width:18px;height:18px}
.cs-scope .cs-recipes{display:flex;flex-direction:column;gap:4px}
.cs-scope .cs-recipe{display:flex;align-items:center;justify-content:space-between;gap:8px;font-size:12.5px;font-weight:600;border-radius:8px;padding:5px 7px}
.cs-scope .cs-recipe.now{background:#fff7ed;outline:1px solid #fed7aa}
.cs-scope .cs-recipe-ings{display:flex;gap:3px;flex:none}
.cs-scope .cs-recipe-ings svg{width:16px;height:16px}
.cs-scope .cs-tray{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px}
.cs-scope .cs-slot{width:44px;height:52px;border:1.5px dashed var(--line);border-radius:10px;display:flex;align-items:center;justify-content:center;background:var(--soft)}
.cs-scope .cs-slot.filled{border-style:solid;border-color:var(--acc);background:#fff7ed}
.cs-scope .cs-slot svg{width:26px;height:26px}
.cs-scope .cs-barwrap{margin-bottom:10px}
.cs-scope .cs-bar{position:relative;height:26px;border-radius:8px;background:#f5f5f4;border:1px solid var(--line);overflow:hidden;cursor:pointer}
.cs-scope .cs-zone{position:absolute;top:0;bottom:0;left:35%;width:30%;background:#dcfce7}
.cs-scope .cs-zone::after{content:"";position:absolute;left:50%;top:0;bottom:0;width:2px;margin-left:-1px;background:#22c55e}
.cs-scope .cs-marker{position:absolute;top:0;bottom:0;width:4px;margin-left:-2px;background:var(--acc);border-radius:2px;left:0}
.cs-scope .cs-shimmer{position:absolute;top:0;bottom:0;width:30%;background:linear-gradient(90deg,transparent,#fdba74,transparent);animation:cs-slide 1s linear infinite}
@keyframes cs-slide{0%{left:-30%}100%{left:100%}}
.cs-scope .cs-actions{display:flex;gap:8px}
.cs-scope .cs-btn{flex:1;display:inline-flex;align-items:center;justify-content:center;gap:6px;font-size:14px;font-weight:600;color:var(--ink);background:#fff;border:1px solid var(--line);border-radius:10px;padding:10px 12px;cursor:pointer;touch-action:manipulation}
.cs-scope .cs-btn:hover:not(:disabled){border-color:var(--acc)}
.cs-scope .cs-btn:disabled{opacity:.45;cursor:default}
.cs-scope .cs-btn.cs-primary{background:var(--acc);border-color:var(--acc);color:#fff}
.cs-scope .cs-btn.cs-primary:disabled{background:#fdba74;border-color:#fdba74}
.cs-scope .cs-btn kbd{font-size:10px;font-weight:600;font-family:inherit;border:1px solid currentColor;border-radius:4px;padding:0 4px;opacity:.7}
.cs-scope .cs-pulse{animation:cs-pulse 1s ease-in-out infinite}
@keyframes cs-pulse{0%,100%{transform:scale(1)}50%{transform:scale(1.03)}}
.cs-scope .cs-note{margin-top:10px;font-size:13px;color:var(--mut);min-height:18px}
.cs-scope .cs-pantry{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}
.cs-scope .cs-ing{position:relative;display:flex;flex-direction:column;align-items:center;gap:4px;padding:10px 4px;border:1px solid var(--line);border-radius:10px;background:var(--soft);font-size:11.5px;font-weight:600;color:var(--ink);cursor:pointer;touch-action:manipulation}
.cs-scope .cs-ing:hover:not(:disabled){border-color:var(--acc)}
.cs-scope .cs-ing:disabled{opacity:.45;cursor:default}
.cs-scope .cs-ing svg{width:26px;height:26px}
.cs-scope .cs-ing kbd{position:absolute;top:3px;right:5px;font-size:9px;font-family:inherit;color:var(--mut)}
.cs-scope .cs-overlay{position:absolute;inset:0;background:rgba(250,250,249,.92);display:flex;align-items:center;justify-content:center;border-radius:14px;z-index:5}
.cs-scope .cs-dialog{background:#fff;border:1px solid var(--line);border-radius:14px;padding:20px;max-width:320px;width:calc(100% - 40px);display:flex;flex-direction:column;gap:10px;text-align:center;box-shadow:0 10px 30px rgba(0,0,0,.06)}
.cs-scope .cs-dialog-title{font-size:18px;font-weight:700}
.cs-scope .cs-dialog-sub{font-size:13px;color:var(--mut)}
.cs-scope .cs-cheat-row{display:flex;justify-content:space-between;align-items:center;gap:10px;font-size:13px;font-weight:600;border:1px solid var(--line);border-radius:10px;padding:9px 12px;cursor:pointer;text-align:left}
.cs-scope .cs-cheat-row input{accent-color:var(--acc);width:16px;height:16px;flex:none}
@media (max-width:720px){
.cs-scope .cs-grid{grid-template-columns:1fr}
}
@media (pointer:coarse){
.cs-scope .cs-btn{min-height:52px;font-size:15px}
.cs-scope .cs-ing{min-height:64px}
.cs-scope .cs-btn kbd,.cs-scope .cs-ing kbd{display:none}
.cs-scope .cs-bar{height:34px}
}
</style>
<div class="game-app cs-scope">
  <div class="game-intro">
    <div><h2>Cooking Simulator</h2></div>
    <span class="game-status"><i class="game-status-dot"></i><span data-status>Ready</span></span>
  </div>
  <section class="game-panel cs-panel" data-board>
    <div class="cs-top">
      <span class="cs-chip" data-level>Level 1/${MAX_LEVEL}</span>
      <span class="cs-chip" data-target>Target -</span>
      <span class="cs-chip cs-turn" data-turn>-</span>
      <button class="cs-mini" type="button" data-cheats>Cheats</button>
    </div>
    <div class="cs-score" data-score></div>
    <div class="cs-grid">
      <div class="cs-col">
        <div class="cs-card">
          <div class="cs-label">Customer order <span data-order-for></span></div>
          <div data-order></div>
        </div>
        <div class="cs-card">
          <div class="cs-label">Recipe book</div>
          <div class="cs-recipes" data-recipes></div>
        </div>
      </div>
      <div class="cs-col">
        <div class="cs-card">
          <div class="cs-label">Kitchen</div>
          <div class="cs-tray" data-tray></div>
          <div class="cs-barwrap" data-barwrap hidden>
            <div class="cs-bar" data-bar>
              <div class="cs-zone"></div>
              <div class="cs-marker" data-marker></div>
              <div class="cs-shimmer" data-shimmer hidden></div>
            </div>
          </div>
          <div class="cs-actions">
            <button class="cs-btn" type="button" data-act="undo">Undo <kbd>Bksp</kbd></button>
            <button class="cs-btn cs-primary" type="button" data-act="main"><span data-main-label>Cook</span> <kbd>Space</kbd></button>
            <button class="cs-btn" type="button" data-act="clear">Clear <kbd>C</kbd></button>
          </div>
          <div class="cs-note" data-note></div>
        </div>
        <div class="cs-card">
          <div class="cs-label">Pantry</div>
          <div class="cs-pantry" data-pantry></div>
        </div>
      </div>
    </div>
    <div class="cs-overlay" data-overlay hidden>
      <div class="cs-dialog">
        <div class="cs-dialog-title" data-ov-title></div>
        <div class="cs-dialog-sub" data-ov-sub></div>
        <button class="cs-btn cs-primary" type="button" data-act="restart">Play again</button>
      </div>
    </div>
    <div class="cs-overlay" data-cheat-overlay hidden>
      <div class="cs-dialog">
        <div class="cs-dialog-title">Cheats</div>
        <label class="cs-cheat-row"><span>Perfect timing (always 100)</span><input type="checkbox" data-cheat="perfect"></label>
        <label class="cs-cheat-row" data-slowbot-row><span>Slow &amp; sloppy bot</span><input type="checkbox" data-cheat="slowBot"></label>
        <button class="cs-btn" type="button" data-act="fill">Auto-fill tray</button>
        <button class="cs-btn" type="button" data-act="points">+100 points</button>
        <button class="cs-btn cs-primary" type="button" data-act="closeCheats">Close</button>
      </div>
    </div>
  </section>
  <div class="game-actions"><button class="game-action-button" type="button" data-exit>Exit game</button></div>
</div>`;

    /* ---------------- refs ---------------- */
    const q = (s) => root.querySelector(s);
    const statusEl = q("[data-status]");
    const levelEl = q("[data-level]");
    const targetEl = q("[data-target]");
    const turnEl = q("[data-turn]");
    const scoreEl = q("[data-score]");
    const orderForEl = q("[data-order-for]");
    const orderEl = q("[data-order]");
    const recipesEl = q("[data-recipes]");
    const trayEl = q("[data-tray]");
    const barWrap = q("[data-barwrap]");
    const markerEl = q("[data-marker]");
    const shimmerEl = q("[data-shimmer]");
    const mainBtn = q('[data-act="main"]');
    const mainLabel = q("[data-main-label]");
    const undoBtn = q('[data-act="undo"]');
    const clearBtn = q('[data-act="clear"]');
    const noteEl = q("[data-note]");
    const pantryEl = q("[data-pantry]");
    const overlayEl = q("[data-overlay]");
    const ovTitle = q("[data-ov-title]");
    const ovSub = q("[data-ov-sub]");
    const ovRestart = q('[data-act="restart"]');
    const cheatOverlay = q("[data-cheat-overlay]");
    const fillBtn = q('[data-act="fill"]');
    const pointsBtn = q('[data-act="points"]');
    const slowRow = q("[data-slowbot-row]");
    const perfectBox = q('[data-cheat="perfect"]');
    const slowBox = q('[data-cheat="slowBot"]');

    pantryEl.innerHTML = ING_IDS.map(
        (id, i) =>
            '<button class="cs-ing" type="button" data-ing="' + id + '"><kbd>' + (i + 1) + "</kbd>" + ICONS[id] + "<span>" + INGREDIENTS[id] + "</span></button>"
    ).join("");
    const pantryBtns = Array.from(pantryEl.querySelectorAll("[data-ing]"));
    if (slowRow && online) slowRow.hidden = true;

    /* ---------------- timers ---------------- */
    let pendId = 0;
    let botTimers = [];
    let rafId = 0;
    let markerT = 0;
    let markerDir = 1;
    let lastTs = 0;
    let cookKey = "";

    function later(fn, ms) {
        clearPending();
        pendId = setTimeout(() => { pendId = 0; fn(); }, ms);
    }
    function clearPending() {
        if (pendId) clearTimeout(pendId);
        pendId = 0;
    }
    function clearBotTimers() {
        botTimers.forEach((t) => clearTimeout(t));
        botTimers = [];
    }

    /* ---------------- identity (random seats in multiplayer) ---------------- */
    function myIndex() {
        if (!online) return 0;
        if (state && Array.isArray(state.seats)) {
            const i = state.seats.indexOf(room.isHost ? "host" : "guest");
            if (i >= 0) return i;
        }
        return room.isHost ? 0 : 1;
    }
    function labelFor(i) {
        if (!online) return i === 0 ? playerName || "You" : "Bot";
        return i === myIndex() ? playerName || "You" : "Opponent";
    }

    /* ---------------- game setup ---------------- */
    function newGame() {
        clearBotTimers();
        clearPending();
        /* random seat assignment: either player can be P1 or P2 */
        const seats = online
            ? (Math.random() < 0.5 ? ["host", "guest"] : ["guest", "host"])
            : ["you", "bot"];
        /* random coin toss: either side can cook first */
        const first = Math.random() < 0.5 ? 0 : 1;
        const lv = genLevel(1);
        state = {
            seats,
            level: lv.level,
            target: lv.target,
            speed: lv.speed,
            turn: first,
            phase: "prep", /* prep | cook | between | levelup | over */
            over: false,
            winner: null,
            cookAt: 0,
            players: [
                { points: 0, tray: [], order: makeOrder(1) },
                { points: 0, tray: [], order: makeOrder(1) },
            ],
            last: { kind: "toss", player: first },
        };
        publish();
        maybeBot();
    }

    function nextLevel() {
        if (!state || state.over) return;
        const lv = genLevel(state.level + 1);
        state.level = lv.level;
        state.target = lv.target;
        state.speed = lv.speed;
        state.turn = Math.random() < 0.5 ? 0 : 1; /* fresh coin toss each level */
        state.players.forEach((p) => {
            p.points = 0;
            p.tray = [];
            p.order = makeOrder(state.level);
        });
        state.phase = "prep";
        state.last = { kind: "toss", player: state.turn };
        publish();
        maybeBot();
    }

    function advance() {
        if (!state || state.over) return;
        clearBotTimers();
        const t = state.turn;
        if (state.players[t].points >= state.target) {
            if (state.level >= MAX_LEVEL) {
                state.over = true;
                state.winner = t;
                state.phase = "over";
                state.last = { kind: "win", player: t };
                publish();
                return;
            }
            state.phase = "levelup";
            state.last = { kind: "level", player: t };
            publish();
            later(nextLevel, 1400);
            return;
        }
        state.turn = 1 - t;
        const np = state.players[state.turn];
        np.tray = [];
        np.order = makeOrder(state.level);
        state.phase = "prep";
        publish();
        maybeBot();
    }

    /* ---------------- bot (AI mode, host-side only) ---------------- */
    function maybeBot() {
        if (online || !state || state.over) return;
        if (state.turn !== 1 || state.phase !== "prep") return;
        clearBotTimers();
        const slow = cheat.slowBot ? 2.3 : 1;
        const order = state.players[1].order;
        const errP = Math.max(0.04, 0.14 - state.level * 0.015) * (cheat.slowBot ? 2 : 1);
        let delay = randInt(600, 1000) * slow;
        order.ingredients.forEach((id) => {
            botTimers.push(setTimeout(() => {
                const pick = Math.random() < errP ? ING_IDS[randInt(0, ING_IDS.length - 1)] : id;
                applyAction({ type: "pick", id: pick }, 1);
            }, delay));
            delay += randInt(320, 620) * slow;
        });
        botTimers.push(setTimeout(() => applyAction({ type: "cook" }, 1), delay + 300 * slow));
        const skill = (cheat.slowBot ? 42 : 66) + state.level * 4;
        const timing = clamp(Math.round(skill + (Math.random() * 2 - 1) * 26), 15, 100);
        const pos = 0.5 + (Math.random() < 0.5 ? -1 : 1) * (100 - timing) / 200;
        botTimers.push(setTimeout(() => applyAction({ type: "stop", pos }, 1), delay + 300 * slow + randInt(650, 1400) * slow));
    }

    /* ---------------- canonical state (host / local only) ---------------- */
    function applyAction(a, actor) {
        if (!state || !a || typeof a !== "object") return;
        if (actor !== 0 && actor !== 1) return;
        if (a.type === "restart") {
            if (state.over) newGame();
            return;
        }
        if (state.over) return;
        const p = state.players[actor];
        const mine = actor === state.turn;

        if (a.type === "cheatPoints") {
            if (!mine || (state.phase !== "prep" && state.phase !== "cook")) return;
            p.points += 100;
            state.last = { kind: "cheat", player: actor };
            if (p.points >= state.target) {
                state.phase = "between";
                publish();
                later(advance, 600);
            } else {
                publish();
            }
            return;
        }
        if (a.type === "fill") {
            if (state.phase === "prep" && mine) {
                p.tray = p.order.ingredients.slice();
                publish();
            }
            return;
        }
        if (a.type === "pick") {
            if (state.phase === "prep" && mine && INGREDIENTS[a.id] && p.tray.length < TRAY_MAX) {
                p.tray.push(a.id);
                publish();
            }
            return;
        }
        if (a.type === "undo") {
            if (state.phase === "prep" && mine && p.tray.length) {
                p.tray.pop();
                publish();
            }
            return;
        }
        if (a.type === "clear") {
            if (state.phase === "prep" && mine && p.tray.length) {
                p.tray = [];
                publish();
            }
            return;
        }
        if (a.type === "cook") {
            if (state.phase === "prep" && mine && p.tray.length) {
                state.phase = "cook";
                state.cookAt = Date.now();
                publish();
            }
            return;
        }
        if (a.type === "stop") {
            if (state.phase !== "cook" || !mine) return;
            const pos = clamp(Number(a.pos) || 0, 0, 1);
            const res = dishQuality(p.order, p.tray, pos);
            p.points += res.quality;
            p.tray = [];
            state.last = { kind: "result", player: actor, quality: res.quality, ing: res.ing, timing: res.timing };
            state.phase = "between";
            publish();
            later(advance, 950);
        }
    }

    function publish() {
        render();
        if (online && room.isHost) room.publishState(state).catch(console.warn);
    }

    function submitAction(action) {
        if (online && !room.isHost) {
            room.sendAction(action).catch(console.warn);
            return;
        }
        applyAction(action, myIndex());
    }

    /* ---------------- timing marker (only your own cook animates) ---------------- */
    function syncMarker() {
        const want = Boolean(state && !state.over && state.phase === "cook" && state.turn === myIndex());
        const key = want ? String(state.cookAt) : "";
        if (want && key !== cookKey) {
            cookKey = key;
            markerT = 0;
            markerDir = 1;
            lastTs = 0;
            if (markerEl) markerEl.style.left = "0%";
        }
        if (want && !rafId) rafId = requestAnimationFrame(markerLoop);
        if (!want && rafId) {
            cancelAnimationFrame(rafId);
            rafId = 0;
            cookKey = "";
        }
    }
    function markerLoop(ts) {
        rafId = 0;
        if (!(state && !state.over && state.phase === "cook" && state.turn === myIndex())) return;
        if (!lastTs) lastTs = ts;
        const dt = Math.min(0.05, (ts - lastTs) / 1000);
        lastTs = ts;
        markerT += markerDir * state.speed * dt;
        if (markerT >= 1) { markerT = 1; markerDir = -1; }
        else if (markerT <= 0) { markerT = 0; markerDir = 1; }
        if (markerEl) markerEl.style.left = (markerT * 100).toFixed(2) + "%";
        rafId = requestAnimationFrame(markerLoop);
    }

    /* ---------------- render ---------------- */
    function statusText() {
        if (!state) return online ? "Waiting for host..." : "Ready";
        if (state.over) return state.winner === myIndex() ? "You win!" : "Game over";
        if (state.phase === "levelup") return "Level up";
        if (state.phase === "between") return "Serving...";
        if (state.turn === myIndex()) return state.phase === "cook" ? "Stop the marker!" : "Your turn";
        return labelFor(state.turn) + (state.phase === "cook" ? " is cooking..." : " is prepping...");
    }
    function noteText() {
        if (!state) return "";
        const L = state.last || {};
        const name = (i) => (i === myIndex() ? "You" : labelFor(i));
        if (state.over) return "";
        if (state.phase === "levelup") return name(L.player) + " won level " + state.level + ". Next level incoming...";
        if (L.kind === "result") return name(L.player) + ": +" + L.quality + " pts (ingredients " + L.ing + " / timing " + L.timing + ").";
        if (L.kind === "cheat") return name(L.player) + " added +100 (cheat).";
        if (L.kind === "toss") {
            const verb = L.player === myIndex() ? "cook" : "cooks";
            return "You are P" + (myIndex() + 1) + ". " + name(L.player) + " " + verb + " first.";
        }
        return "";
    }
    function saveBest() {
        try {
            const prev = Number(localStorage.getItem(META.bestKey)) || 0;
            if (state.level > prev) localStorage.setItem(META.bestKey, String(state.level));
        } catch (_) { /* storage unavailable */ }
    }

    function render() {
        statusEl.textContent = statusText();
        if (!state) {
            mainBtn.disabled = true;
            undoBtn.disabled = true;
            clearBtn.disabled = true;
            pantryBtns.forEach((b) => { b.disabled = true; });
            return;
        }
        const me = myIndex();
        const t = state.turn;
        const mine = t === me && !state.over;
        const active = state.players[t];
        const prepMine = mine && state.phase === "prep";
        const cookMine = mine && state.phase === "cook";

        levelEl.textContent = "Level " + state.level + "/" + MAX_LEVEL;
        targetEl.textContent = "Target " + state.target + " pts";
        turnEl.textContent = state.over ? "Finished" : mine ? "Your turn" : "P" + (t + 1) + " - " + labelFor(t);

        scoreEl.innerHTML = state.players.map((p, i) => {
            const pct = clamp(Math.round((p.points / state.target) * 100), 0, 100);
            return (
                '<div class="cs-player' + (i === t && !state.over ? " on" : "") + '">' +
                '<div class="cs-player-top"><span class="cs-pname">P' + (i + 1) + " " + esc(labelFor(i)) +
                (i === me ? ' <em class="cs-you">YOU</em>' : "") + "</span><b>" + p.points + "</b></div>" +
                '<div class="cs-prog"><i style="width:' + pct + '%"></i></div></div>'
            );
        }).join("");

        orderForEl.textContent = "- P" + (t + 1);
        orderEl.innerHTML =
            '<div class="cs-order-name">' + esc(active.order.name) + '</div><div class="cs-order-ings">' +
            active.order.ingredients.map((id) => '<span class="cs-ing-chip">' + ICONS[id] + INGREDIENTS[id] + "</span>").join("") +
            "</div>";

        recipesEl.innerHTML = poolFor(state.level).map((r) =>
            '<div class="cs-recipe' + (r.id === active.order.id ? " now" : "") + '"><span>' + esc(r.name) +
            '</span><span class="cs-recipe-ings">' + r.ingredients.map((id) => ICONS[id]).join("") + "</span></div>"
        ).join("");

        let trayHtml = "";
        for (let k = 0; k < TRAY_MAX; k++) {
            const id = active.tray[k];
            trayHtml += '<div class="cs-slot' + (id ? " filled" : "") + '">' + (id ? ICONS[id] : "") + "</div>";
        }
        trayEl.innerHTML = trayHtml;

        barWrap.hidden = state.phase !== "cook";
        markerEl.hidden = !cookMine;
        shimmerEl.hidden = cookMine;

        mainLabel.textContent = state.phase === "cook" ? "Stop!" : "Cook";
        mainBtn.disabled = !(prepMine ? active.tray.length > 0 : cookMine);
        mainBtn.classList.toggle("cs-pulse", cookMine);
        undoBtn.disabled = !(prepMine && active.tray.length > 0);
        clearBtn.disabled = !(prepMine && active.tray.length > 0);
        pantryBtns.forEach((b) => { b.disabled = !prepMine || active.tray.length >= TRAY_MAX; });

        fillBtn.disabled = !(prepMine);
        pointsBtn.disabled = !(mine && (state.phase === "prep" || state.phase === "cook"));

        noteEl.textContent = noteText();

        if (state.over) {
            saveBest();
            overlayEl.hidden = false;
            ovRestart.hidden = false;
            ovTitle.textContent = state.winner === me ? "You win!" : labelFor(state.winner) + " wins";
            ovSub.textContent = "Level " + state.level + " - " + state.players[0].points + " : " + state.players[1].points;
        } else if (state.phase === "levelup") {
            overlayEl.hidden = false;
            ovRestart.hidden = true;
            ovTitle.textContent = "Level " + state.level + " complete";
            ovSub.textContent = "New random level incoming...";
        } else {
            overlayEl.hidden = true;
        }

        syncMarker();
    }

    /* ---------------- input ---------------- */
    function tryMain() {
        if (!state || state.over || state.turn !== myIndex()) return;
        if (state.phase === "prep" && state.players[state.turn].tray.length) {
            submitAction({ type: "cook" });
        } else if (state.phase === "cook") {
            submitAction({ type: "stop", pos: cheat.perfect ? 0.5 : markerT });
        }
    }
    function toggleCheats(open) {
        cheatOpen = open;
        cheatOverlay.hidden = !open;
        if (open) {
            perfectBox.checked = cheat.perfect;
            if (slowBox) slowBox.checked = cheat.slowBot;
        }
    }

    function handleClick(event) {
        const el = event.target;
        if (!el || !el.closest) return;
        if (el.closest("[data-exit]")) { onExit(); return; }
        if (el.closest("[data-cheats]")) { toggleCheats(!cheatOpen); return; }
        if (el.closest('[data-act="closeCheats"]')) { toggleCheats(false); return; }
        const ing = el.closest("[data-ing]");
        if (ing) { submitAction({ type: "pick", id: ing.dataset.ing }); return; }
        if (el.closest("[data-bar]")) { tryMain(); return; }
        const btn = el.closest("[data-act]");
        if (!btn || btn.disabled) return;
        const act = btn.dataset.act;
        if (act === "main") tryMain();
        else if (act === "undo") submitAction({ type: "undo" });
        else if (act === "clear") submitAction({ type: "clear" });
        else if (act === "restart") submitAction({ type: "restart" });
        else if (act === "fill") submitAction({ type: "fill" });
        else if (act === "points") submitAction({ type: "cheatPoints" });
    }

    function handleChange(event) {
        const box = event.target;
        if (!box || !box.dataset || !box.dataset.cheat) return;
        const key = box.dataset.cheat;
        if (key === "perfect") cheat.perfect = Boolean(box.checked);
        if (key === "slowBot") {
            cheat.slowBot = Boolean(box.checked);
            if (!online && state && !state.over && state.turn === 1 && state.phase === "prep") {
                clearBotTimers();
                maybeBot();
            }
        }
    }

    function handleKey(event) {
        if (event.ctrlKey || event.metaKey || event.altKey) return;
        const tag = event.target && event.target.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
        if (event.key === "Escape") { toggleCheats(false); return; }
        if (cheatOpen) return;
        if (event.key === " " || event.code === "Space" || event.key === "Enter") {
            event.preventDefault();
            if (event.repeat) return;
            if (state && state.over) { submitAction({ type: "restart" }); return; }
            tryMain();
            return;
        }
        if (event.key === "Backspace") { event.preventDefault(); submitAction({ type: "undo" }); return; }
        if (event.key === "c" || event.key === "C") { submitAction({ type: "clear" }); return; }
        const n = Number(event.key);
        if (n >= 1 && n <= ING_IDS.length) submitAction({ type: "pick", id: ING_IDS[n - 1] });
    }

    root.addEventListener("click", handleClick);
    root.addEventListener("change", handleChange);
    document.addEventListener("keydown", handleKey);

    /* ---------------- wiring: room mode vs AI mode ---------------- */
    const unsubs = [];
    if (online) {
        unsubs.push(room.onRoom((nextRoom) => { roomData = nextRoom; render(); }));
        if (room.isHost) {
            newGame();
            unsubs.push(room.onAction((action) => {
                const guestIdx = state && Array.isArray(state.seats) ? Math.max(0, state.seats.indexOf("guest")) : 1;
                applyAction(action, guestIdx);
            }));
        } else {
            unsubs.push(room.onState((nextState) => { state = nextState; render(); }));
        }
    } else {
        newGame();
    }
    render();

    return {
        destroy() {
            root.removeEventListener("click", handleClick);
            root.removeEventListener("change", handleChange);
            document.removeEventListener("keydown", handleKey);
            clearBotTimers();
            clearPending();
            if (rafId) cancelAnimationFrame(rafId);
            rafId = 0;
            unsubs.forEach((u) => { if (typeof u === "function") u(); });
        },
    };
}