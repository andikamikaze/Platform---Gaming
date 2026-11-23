/* ==== GAME: lucky-wheel.js ==== */
/* Lucky Wheel — minimalist casino race, template META + mount().
   - Fixed 8-wedge wheel (no level generator, no tutorial texts).
   - mode "ai": you vs Bot, random coin toss decides who spins first.
   - mode "room": random P1/P2 slot draw (host is NOT always P1),
     random first turn. Host is authoritative for all state.
   - Economy: start balance 100, each spin costs 10. Payouts add coins,
     Mystery can subtract. Collect all 6 prize types or hit Jackpot to win.
   - Controls: mouse click / tap on wheel or SPIN hub (no virtual pad),
     keyboard Space/Enter = spin, R = restart, C = cheats, Esc = close. */

const SEGMENTS = [
    { icon: "star", label: "Star", short: "Star", weight: 2, collect: "star", pay: 8 },
    { icon: "candy", label: "Candy", short: "Candy", weight: 2, collect: "candy", pay: 8 },
    { icon: "gem", label: "Gem", short: "Gem", weight: 2, collect: "gem", pay: 8 },
    { icon: "ticket", label: "Ticket", short: "Ticket", weight: 2, collect: "ticket", pay: 8 },
    { icon: "coin", label: "Coin x2", short: "x2", weight: 3, collect: "coin", pay: 20 },
    { icon: "coin", label: "Coin x5", short: "x5", weight: 1, collect: "coin", pay: 50 },
    { icon: "jackpot", label: "Jackpot", short: "JACKPOT", weight: 1, collect: null, pay: 100 },
    { icon: "mystery", label: "Mystery", short: "Mystery", weight: 3, collect: "mystery", pay: 0 },
];
const COLLECT_KEYS = ["star", "candy", "gem", "ticket", "coin", "mystery"];
const COLLECT_LABELS = { star: "Star", candy: "Candy", gem: "Gem", ticket: "Ticket", coin: "Coin", mystery: "Mystery" };
const TOTAL_SPINS = 12;
const START_BALANCE = 100;
const SPIN_COST = 10;
const SPIN_MS = 3700;
const BOT_DELAY = 1100;
/* Mystery: [delta, weight] — can grow or shrink the balance */
const MYSTERY_OUTCOMES = [[-20, 2], [-10, 3], [5, 3], [15, 2], [30, 1]];

function spinIndex(rng = Math.random) {
    let total = 0;
    for (const s of SEGMENTS) total += s.weight;
    let r = rng() * total;
    for (let i = 0; i < SEGMENTS.length; i++) {
        r -= SEGMENTS[i].weight;
        if (r < 0) return i;
    }
    return SEGMENTS.length - 1;
}

function mysteryDelta(rng = Math.random) {
    let total = 0;
    for (const [, w] of MYSTERY_OUTCOMES) total += w;
    let r = rng() * total;
    for (const [d, w] of MYSTERY_OUTCOMES) {
        r -= w;
        if (r < 0) return d;
    }
    return MYSTERY_OUTCOMES[MYSTERY_OUTCOMES.length - 1][0];
}

function collectionComplete(list) {
    const set = new Set(list);
    return COLLECT_KEYS.every((k) => set.has(k));
}

export const META = {
    id: "lucky-wheel", // harus sama dengan nama file (tanpa .js)
    name: "Lucky Wheel",
    category: "casino",
    catLabel: "Casino",
    desc: "Race a rival on the prize wheel: collect all 6 prizes or hit the Jackpot. Every spin costs coins.",
    art: '<svg viewBox="0 0 48 48" width="54" height="54" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="24" cy="27" r="15"/><path d="M24 12v30"/><path d="M9 27h30"/><path d="M13.4 16.4l21.2 21.2"/><path d="M34.6 16.4L13.4 37.6"/><circle cx="24" cy="27" r="3" fill="currentColor" stroke="none"/><path d="M18.5 2h11L24 9.5z" fill="currentColor" stroke="none"/></svg>',
    bg: ["#fde68a", "#fbbf24"],
    bestKey: "luckyWheelBest",
};

export function mount(root, context = {}) {
    const { mode = "ai", room = null, playerName = "Player", onExit = () => { } } = context;
    const online = mode === "room" && Boolean(room);
    let roomData = room?.room || null;
    let state = null;

    /* ---------------- shell (minimalist, no tutorial) ---------------- */
    root.innerHTML = `
<div class="game-app lw-app">
<style>
.lw-app [hidden]{display:none!important}
.lw-app{color:#e7eaf0;font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
.lw-app .lw-board{position:relative;padding:18px}
.lw-app .lw-layout{display:flex;flex-wrap:wrap;gap:26px;align-items:center;justify-content:center}
.lw-app .lw-wheel-wrap{position:relative;width:min(320px,86vw);aspect-ratio:1/1;flex:0 0 auto}
.lw-app .lw-wheel{width:100%;height:100%;display:block;transition:transform 3.6s cubic-bezier(.15,.85,.25,1);cursor:pointer;touch-action:manipulation}
.lw-app .lw-wheel.off{cursor:default}
.lw-app .lw-pointer{position:absolute;top:-6px;left:50%;transform:translateX(-50%);z-index:3}
.lw-app .lw-hub{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:34%;aspect-ratio:1/1;z-index:2}
.lw-app .lw-spin{width:100%;height:100%;border-radius:50%;border:1px solid #e3b34166;background:#141b2b;color:#e3b341;font-weight:800;font-size:15px;letter-spacing:.08em;cursor:pointer;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;touch-action:manipulation}
.lw-app .lw-spin small{font-weight:600;color:#8b93a7;font-size:10px;letter-spacing:0}
.lw-app .lw-spin:disabled{opacity:.45;cursor:default}
.lw-app .lw-spin:not(:disabled):hover{background:#1a2336}
.lw-app .lw-side{display:flex;flex-direction:column;gap:12px;width:300px;max-width:100%}
.lw-app .lw-player{border:1px solid #ffffff12;background:#121826;border-radius:14px;padding:12px 14px;display:flex;flex-direction:column;gap:8px}
.lw-app .lw-player.active{border-color:#e3b34188}
.lw-app .lw-p-head{display:flex;align-items:center;gap:8px;font-size:13px;font-weight:700}
.lw-app .lw-pos{font-size:10px;font-weight:600;color:#8b93a7;border:1px solid #ffffff1a;border-radius:6px;padding:1px 5px}
.lw-app .lw-tag{font-size:10px;color:#f87171}
.lw-app .lw-dot{width:6px;height:6px;border-radius:50%;background:#e3b341;margin-left:auto;opacity:0}
.lw-app .lw-player.active .lw-dot{opacity:1}
.lw-app .lw-nums{display:flex;gap:14px;align-items:baseline;font-size:12px;color:#8b93a7}
.lw-app .lw-nums b{color:#e7eaf0;font-size:13px}
.lw-app .lw-next{font-size:10px;color:#e3b341;margin-left:auto}
.lw-app .lw-coll{display:flex;gap:6px}
.lw-app .lw-cell{width:34px;height:34px;border-radius:9px;background:#0e1420;border:1px solid #ffffff0d;display:flex;align-items:center;justify-content:center}
.lw-app .lw-cell svg{opacity:.22;filter:grayscale(1)}
.lw-app .lw-cell.got{border-color:#e3b34155}
.lw-app .lw-cell.got svg{opacity:1;filter:none}
.lw-app .lw-banner{font-size:12.5px;color:#aeb6c8;text-align:center;border:1px dashed #ffffff14;border-radius:10px;padding:8px 10px;min-height:18px}
.lw-app .lw-over{position:absolute;inset:0;background:#0b101cd9;display:flex;align-items:center;justify-content:center;z-index:5;border-radius:inherit}
.lw-app .lw-over-card{background:#121826;border:1px solid #ffffff1a;border-radius:16px;padding:22px 26px;text-align:center;max-width:320px}
.lw-app .lw-over-card h3{margin:0 0 6px;font-size:22px}
.lw-app .lw-over-card p{margin:0 0 10px;font-size:13px;color:#9ca3af}
.lw-app .lw-over-stats{font-weight:700;color:#e7eaf0!important}
.lw-app .lw-cheats{position:absolute;top:10px;right:10px;z-index:6;background:#121826;border:1px solid #e3b34144;border-radius:12px;padding:10px;display:flex;flex-direction:column;gap:6px;width:196px}
.lw-app .lw-cheat-head{display:flex;align-items:center;justify-content:space-between;font-size:12px;color:#e3b341;margin-bottom:2px}
.lw-app .lw-cheat-head button{background:none;border:none;color:#8b93a7;cursor:pointer;font-size:13px;padding:2px 4px}
.lw-app .lw-cheats [data-cheat]{background:#0e1420;border:1px solid #ffffff14;color:#e7eaf0;border-radius:8px;padding:7px 9px;font-size:12px;text-align:left;cursor:pointer}
.lw-app .lw-cheats [data-cheat]:hover{border-color:#e3b34166}
.lw-app .lw-cheats [data-cheat]:disabled{opacity:.45;cursor:default}
.lw-app .lw-best{font-size:12px;color:#8b93a7;margin-left:auto;align-self:center}
</style>
  <div class="game-intro">
    <div><h2>Lucky Wheel</h2></div>
    <span class="game-status"><i class="game-status-dot"></i><span data-status>Ready</span></span>
  </div>
  <section class="game-panel lw-board" data-board>
    <div class="lw-layout">
      <div class="lw-wheel-wrap">
        <svg class="lw-wheel off" data-el="wheel" data-act="spin" viewBox="-200 -200 400 400" role="button" aria-label="Spin the wheel"></svg>
        <div class="lw-pointer"><svg viewBox="0 0 30 34" width="24" height="28" aria-hidden="true"><path d="M3 3h24L15 31z" fill="#e3b341" stroke="#0b1020" stroke-width="2.5" stroke-linejoin="round"/></svg></div>
        <div class="lw-hub"><button class="lw-spin" type="button" data-act="spin" disabled><b>SPIN</b><small>-${SPIN_COST}</small></button></div>
      </div>
      <div class="lw-side">
        <div data-el="players"></div>
        <div class="lw-banner" data-el="banner" aria-live="polite"></div>
      </div>
    </div>
    <div class="lw-over" data-el="over" hidden>
      <div class="lw-over-card">
        <h3 data-el="overTitle"></h3>
        <p data-el="overSub"></p>
        <p class="lw-over-stats" data-el="overStats"></p>
        <button class="game-action-button" type="button" data-act="restart">Play again</button>
      </div>
    </div>
    <div class="lw-cheats" data-el="cheats" hidden>
      <div class="lw-cheat-head"><b>Cheats</b><button type="button" data-act="cheats-close" aria-label="Close cheats">✕</button></div>
      <button type="button" data-cheat="coins">+100 coins</button>
      <button type="button" data-cheat="spins">+5 spins</button>
      <button type="button" data-cheat="grant">Grant missing prize</button>
      <button type="button" data-cheat="jackpot">Next spin: Jackpot</button>
      <button type="button" data-cheat="coin5">Next spin: Coin ×5</button>
    </div>
  </section>
  <div class="game-actions">
    <button class="game-action-button" type="button" data-act="restart">Restart</button>
    <button class="game-action-button" type="button" data-act="cheats">Cheats</button>
    <span class="lw-best" data-el="best"></span>
    <button class="game-action-button" type="button" data-exit>Exit game</button>
  </div>
</div>`;

    /* ---------------- refs ---------------- */
    const $ = (s) => root.querySelector(s);
    const wheelSvg = $('[data-el="wheel"]');
    const playersEl = $('[data-el="players"]');
    const bannerEl = $('[data-el="banner"]');
    const statusEl = $("[data-status]");
    const spinBtn = $(".lw-spin");
    const overEl = $('[data-el="over"]');
    const overTitle = $('[data-el="overTitle"]');
    const overSub = $('[data-el="overSub"]');
    const overStats = $('[data-el="overStats"]');
    const cheatPanel = $('[data-el="cheats"]');
    const bestEl = $('[data-el="best"]');

    /* ---------------- icons ---------------- */
    const ICONS = {
        star: '<polygon points="0,-12 2.8,-3.9 11.4,-3.7 4.6,1.5 7.1,9.7 0,4.8 -7.1,9.7 -4.6,1.5 -11.4,-3.7 -2.8,-3.9" fill="#fffbeb" stroke="#b45309" stroke-width="1.4" stroke-linejoin="round"/>',
        candy: '<path d="M-4 0l-9-5.5v11z" fill="#fff1f2" stroke="#be123c" stroke-width="1.4" stroke-linejoin="round"/><path d="M4 0l9-5.5v11z" fill="#fff1f2" stroke="#be123c" stroke-width="1.4" stroke-linejoin="round"/><circle r="7.5" fill="#fff1f2" stroke="#be123c" stroke-width="1.4"/><path d="M-4.5-2.6q4.5 5.2 9 0" fill="none" stroke="#be123c" stroke-width="1.4" stroke-linecap="round"/><path d="M-4.5 2q4.5-5.2 9 0" fill="none" stroke="#be123c" stroke-width="1.2" stroke-linecap="round"/>',
        gem: '<polygon points="0,-11 9,-4 5.5,10 -5.5,10 -9,-4" fill="#cffafe" stroke="#0e7490" stroke-width="1.4" stroke-linejoin="round"/><path d="M-9-4h18M0-11l-5.5 21M0-11l5.5 21" fill="none" stroke="#0e7490" stroke-width="1" opacity=".7"/>',
        ticket: '<rect x="-12" y="-7" width="24" height="14" rx="2.5" fill="#eef2ff" stroke="#4338ca" stroke-width="1.4"/><line x1="-4" y1="-7" x2="-4" y2="7" stroke="#4338ca" stroke-width="1.4" stroke-dasharray="2.4 2.2"/>',
        coin: '<circle r="11" fill="#fcd34d" stroke="#92400e" stroke-width="1.6"/><circle r="7.6" fill="none" stroke="#92400e" stroke-width="1.2" opacity=".8"/><text y="4" font-size="11" font-weight="800" text-anchor="middle" font-family="inherit" fill="#92400e">$</text>',
        jackpot: '<path d="M-11 7L-12.5-5-6-1 0-9 6-1 12.5-5 11 7z" fill="#fffbeb" stroke="#b45309" stroke-width="1.4" stroke-linejoin="round"/><circle cx="-12.5" cy="-6.5" r="1.6" fill="#fbbf24"/><circle cx="0" cy="-10.5" r="1.6" fill="#fbbf24"/><circle cx="12.5" cy="-6.5" r="1.6" fill="#fbbf24"/>',
        mystery: '<circle r="11" fill="#312e81" stroke="#a5b4fc" stroke-width="1.5"/><text y="4.5" font-size="14" font-weight="800" text-anchor="middle" font-family="inherit" fill="#e0e7ff">?</text>',
    };
    const icon = (key, size) =>
        '<svg viewBox="-14 -14 28 28" width="' + size + '" height="' + size + '" aria-hidden="true">' + ICONS[key] + "</svg>";

    /* ---------------- static wheel art (fixed layout, muted flat wedges) ---------------- */
    {
        const P = (r, deg) => {
            const a = (deg * Math.PI) / 180;
            return (r * Math.sin(a)).toFixed(2) + " " + (-r * Math.cos(a)).toFixed(2);
        };
        const R = 185;
        let s = '<circle r="193" fill="#0e1420"/>';
        for (let i = 0; i < 8; i++) {
            const fill = SEGMENTS[i].icon === "jackpot" ? "#3d2f12" : i % 2 ? "#1c2434" : "#242e42";
            s += '<path d="M0 0 L' + P(R, i * 45 - 22.5) + " A" + R + " " + R + " 0 0 1 " + P(R, i * 45 + 22.5) +
                ' Z" fill="' + fill + '" stroke="#0e1420" stroke-width="2"/>';
        }
        s += '<circle r="' + R + '" fill="none" stroke="#e3b341" stroke-width="3" opacity=".9"/>';
        for (let i = 0; i < 8; i++) {
            const seg = SEGMENTS[i];
            s += '<g transform="rotate(' + i * 45 + ')">' +
                '<g transform="translate(0,-141) scale(1.55)">' + ICONS[seg.icon] + "</g>" +
                '<text x="0" y="-100" font-size="13" font-weight="800" text-anchor="middle" font-family="inherit" fill="#dfe5f1" stroke="#0e1420" stroke-width="2.5" paint-order="stroke">' + seg.short + "</text></g>";
        }
        s += '<circle r="86" fill="#0e1420" stroke="#2a3550" stroke-width="2"/>';
        wheelSvg.innerHTML = s;
    }

    /* ---------------- timers / lifecycle ---------------- */
    let destroyed = false;
    let shownRot = 0;
    let spinTimer = null;
    let botTimer = null;
    const timers = new Set();
    const unsubs = [];
    function later(fn, ms) {
        const id = setTimeout(() => { timers.delete(id); if (!destroyed) fn(); }, ms);
        timers.add(id);
        return id;
    }
    function clearTimer(id) { if (id) { clearTimeout(id); timers.delete(id); } }

    let best = 0;
    try { best = Number(localStorage.getItem(META.bestKey)) || 0; } catch (_) { }
    let savedGame = null;

    /* ---------------- state (fully serializable for Firebase) ---------------- */
    function newPlayer() {
        return { coins: START_BALANCE, spins: TOTAL_SPINS, collected: [], forced: null };
    }
    function freshState() {
        const hostSlot = Math.random() < 0.5 ? 0 : 1; // random P1/P2 draw in rooms
        const first = Math.random() < 0.5 ? 0 : 1;    // random coin toss for first turn
        return {
            gameId: Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
            phase: "idle",            // idle | spinning | over
            turn: first,
            first,
            slots: { host: online ? hostSlot : 0, guest: online ? 1 - hostSlot : 1 },
            wheelRot: 0,
            spinId: 0,
            pending: null,            // { idx, slot } while the wheel turns
            last: null,               // { slot, idx, pay, isNew, label }
            winner: null,             // 0 | 1 | -1 (draw)
            reason: "",
            players: [newPlayer(), newPlayer()],
        };
    }
    function mySlot() {
        if (!online) return 0;
        if (!state) return room.isHost ? 0 : 1;
        return room.isHost ? state.slots.host : state.slots.guest;
    }
    function canSpin(p) { return p.spins > 0 && p.coins >= SPIN_COST; }
    function nameOf(slot, me) {
        return slot === me ? (playerName || "You") : online ? "Rival" : "Bot";
    }

    /* ---------------- rules engine (host / offline only) ---------------- */
    function startSpin(actor) {
        const p = state.players[actor];
        p.coins -= SPIN_COST;
        p.spins -= 1;
        const idx = p.forced != null ? p.forced : spinIndex();
        p.forced = null;
        const target = (360 - idx * 45) % 360;
        const cur = ((state.wheelRot % 360) + 360) % 360;
        let delta = target - cur;
        if (delta <= 0) delta += 360;
        state.wheelRot += delta + 360 * 3;
        state.spinId += 1;
        state.pending = { idx, slot: actor };
        state.phase = "spinning";
        state.last = null;
        publish();
        clearTimer(spinTimer);
        spinTimer = later(finalizeSpin, SPIN_MS);
    }

    function finalizeSpin() {
        if (!state || state.phase !== "spinning" || !state.pending) return;
        const { idx, slot } = state.pending;
        state.pending = null;
        const p = state.players[slot];
        const seg = SEGMENTS[idx];
        let pay = seg.icon === "mystery" ? mysteryDelta() : seg.pay;
        const before = p.coins;
        p.coins = Math.max(0, p.coins + pay); // balance can shrink but never below 0
        pay = p.coins - before;
        let isNew = false;
        if (seg.collect && !p.collected.includes(seg.collect)) {
            p.collected.push(seg.collect);
            isNew = true;
        }
        state.last = { slot, idx, pay, isNew, label: seg.label };
        state.phase = "idle";
        if (seg.icon === "jackpot") return endGame(slot, "Jackpot — instant grand prize.");
        if (collectionComplete(p.collected)) return endGame(slot, "Collection complete — all 6 prizes.");
        const other = 1 - slot;
        if (canSpin(state.players[other])) state.turn = other;
        else if (canSpin(p)) state.turn = slot; // rival is stuck, keep spinning
        else return decideByScore();
        publish();
    }

    function decideByScore() {
        const [a, b] = state.players;
        let w = -1;
        if (a.collected.length !== b.collected.length) w = a.collected.length > b.collected.length ? 0 : 1;
        else if (a.coins !== b.coins) w = a.coins > b.coins ? 0 : 1;
        endGame(w, "Both players are out of spins or coins — decided by prizes, then balance.");
    }

    function endGame(winner, reason) {
        state.phase = "over";
        state.winner = winner;
        state.reason = reason;
        publish();
    }

    function applyCheat(id, slot) {
        const p = state.players[slot];
        if (id === "coins") p.coins += 100;
        else if (id === "spins") p.spins += 5;
        else if (id === "grant") {
            const miss = COLLECT_KEYS.find((k) => !p.collected.includes(k));
            if (miss) {
                p.collected.push(miss);
                state.last = { slot, idx: -1, pay: 0, isNew: true, label: COLLECT_LABELS[miss] + " (cheat)" };
            }
        } else if (id === "jackpot") p.forced = 6;
        else if (id === "coin5") p.forced = 5;
    }

    function applyAction(action, actor) {
        if (!state || !action || typeof action !== "object") return;
        if (actor !== 0 && actor !== 1) return;
        if (action.type === "spin") {
            if (state.phase !== "idle" || actor !== state.turn || !canSpin(state.players[actor])) return;
            startSpin(actor);
        } else if (action.type === "restart") {
            clearTimer(spinTimer);
            clearTimer(botTimer);
            state = freshState();
            publish();
        } else if (action.type === "cheat") {
            if (state.phase !== "idle") return; // no cheats mid-spin / after game over
            applyCheat(action.cheat, actor);
            if (collectionComplete(state.players[actor].collected)) {
                endGame(actor, "Collection complete — all 6 prizes.");
            } else {
                publish();
            }
        }
    }

    function submitAction(action) {
        if (online && !room.isHost) {
            room.sendAction(action).catch(console.warn);
            return;
        }
        applyAction(action, mySlot());
    }

    function publish() {
        render();
        if (online && room.isHost) room.publishState(state).catch(console.warn);
        scheduleBot();
    }

    /* ---------------- bot (AI mode only) ---------------- */
    function scheduleBot() {
        clearTimer(botTimer);
        if (!online && state && state.phase === "idle" && state.turn === 1 && canSpin(state.players[1])) {
            botTimer = later(() => applyAction({ type: "spin" }, 1), BOT_DELAY);
        }
    }

    /* ---------------- render ---------------- */
    function snapWheel(rot) {
        wheelSvg.style.transition = "none";
        wheelSvg.style.transform = "rotate(" + rot + "deg)";
        void wheelSvg.getBoundingClientRect();
        wheelSvg.style.transition = "";
    }

    function panelHTML(p, i, me) {
        const active = state.phase !== "over" && state.turn === i;
        const stuck = state.phase !== "over" && !canSpin(p);
        const cells = COLLECT_KEYS.map((k) =>
            '<span class="lw-cell' + (p.collected.includes(k) ? " got" : "") + '">' + icon(k, 18) + "</span>"
        ).join("");
        const next = p.forced != null ? '<span class="lw-next">next: ' + SEGMENTS[p.forced].short + "</span>" : "";
        return '<div class="lw-player' + (active ? " active" : "") + '" style="margin-bottom:10px">' +
            '<div class="lw-p-head"><span class="lw-pos">P' + (i + 1) + "</span><span>" + nameOf(i, me) + "</span>" +
            (stuck ? '<span class="lw-tag">stuck</span>' : "") + '<span class="lw-dot"></span></div>' +
            '<div class="lw-nums"><span>Coins <b>' + p.coins + "</b></span><span>Spins <b>" + p.spins + "</b></span>" + next + "</div>" +
            '<div class="lw-coll">' + cells + "</div></div>";
    }

    function render() {
        if (destroyed) return;
        if (!state) {
            statusEl.textContent = "Waiting for host…";
            return;
        }
        const me = mySlot();

        /* status chip */
        if (state.phase === "over") {
            statusEl.textContent = state.winner === -1 ? "Draw" : state.winner === me ? "You win" : nameOf(state.winner, me) + " wins";
        } else if (state.phase === "spinning") {
            statusEl.textContent = state.pending && state.pending.slot === me ? "Spinning…" : nameOf(1 - me, me) + " spinning…";
        } else {
            statusEl.textContent = state.turn === me ? "Your turn" : nameOf(state.turn, me) + "'s turn";
        }

        /* player panels */
        playersEl.innerHTML = state.players.map((p, i) => panelHTML(p, i, me)).join("");

        /* banner: coin toss / last result — never a tutorial */
        if (state.phase === "spinning") {
            bannerEl.textContent = "Spinning…";
        } else if (state.last) {
            const L = state.last;
            const sign = L.pay > 0 ? "+" + L.pay : L.pay < 0 ? "−" + -L.pay : "±0";
            bannerEl.textContent = nameOf(L.slot, me) + " · " + L.label + " " + sign + (L.isNew ? " · NEW" : "");
        } else {
            const who = state.first === me ? "you" : nameOf(state.first, me);
            bannerEl.textContent = "Coin toss — " + who + (state.first === me ? " go" : " goes") + " first" +
                (online ? " · you are P" + (me + 1) : "");
        }

        /* wheel rotation (snap on restart, animate forward otherwise) */
        if (state.wheelRot !== shownRot) {
            if (state.wheelRot < shownRot) snapWheel(state.wheelRot);
            else wheelSvg.style.transform = "rotate(" + state.wheelRot + "deg)";
            shownRot = state.wheelRot;
        }

        /* controls */
        const mine = state.phase === "idle" && state.turn === me && canSpin(state.players[me]);
        spinBtn.disabled = !mine;
        wheelSvg.classList.toggle("off", !mine);
        cheatPanel.querySelectorAll("[data-cheat]").forEach((b) => { b.disabled = state.phase !== "idle"; });

        /* game over overlay + best score */
        if (state.phase === "over") {
            const p = state.players[me];
            overTitle.textContent = state.winner === -1 ? "Draw" : state.winner === me ? "You win" : nameOf(state.winner, me) + " wins";
            overSub.textContent = state.reason;
            overStats.textContent = "Balance " + p.coins + " · Prizes " + p.collected.length + "/6 · Spins used " + Math.max(0, TOTAL_SPINS - p.spins);
            overEl.removeAttribute("hidden");
            if (savedGame !== state.gameId) {
                savedGame = state.gameId;
                if (p.coins > best) {
                    best = p.coins;
                    try { localStorage.setItem(META.bestKey, String(best)); } catch (_) { }
                }
            }
        } else {
            overEl.setAttribute("hidden", "");
        }
        bestEl.textContent = best > 0 ? "Best " + best : "";
    }

    /* ---------------- input: mouse / touch / keyboard ---------------- */
    function trySpin() {
        if (!state || state.phase !== "idle") return;
        const me = mySlot();
        if (state.turn !== me || !canSpin(state.players[me])) return;
        submitAction({ type: "spin" });
    }
    function toggleCheats() {
        if (cheatPanel.hasAttribute("hidden")) cheatPanel.removeAttribute("hidden");
        else cheatPanel.setAttribute("hidden", "");
    }

    function handleClick(event) {
        const el = event.target.closest("[data-exit],[data-act],[data-cheat]");
        if (!el) return;
        if (el.hasAttribute("data-exit")) return onExit();
        if (el.dataset.cheat) return submitAction({ type: "cheat", cheat: el.dataset.cheat });
        const act = el.dataset.act;
        if (act === "spin") trySpin();
        else if (act === "restart") submitAction({ type: "restart" });
        else if (act === "cheats") toggleCheats();
        else if (act === "cheats-close") cheatPanel.setAttribute("hidden", "");
    }

    function handleKey(event) {
        if (destroyed || !root.isConnected) return;
        if (event.code === "Space" || event.code === "Enter") {
            event.preventDefault();
            if (!event.repeat) trySpin();
        } else if (event.code === "KeyR") {
            if (!event.repeat) submitAction({ type: "restart" });
        } else if (event.code === "KeyC") {
            if (!event.repeat) toggleCheats();
        } else if (event.code === "Escape") {
            cheatPanel.setAttribute("hidden", "");
        }
    }

    root.addEventListener("click", handleClick);
    document.addEventListener("keydown", handleKey);

    /* ---------------- boot ---------------- */
    if (online) {
        const offRoom = room.onRoom?.((nextRoom) => { roomData = nextRoom; render(); });
        if (typeof offRoom === "function") unsubs.push(offRoom);
        if (room.isHost) {
            state = freshState();
            publish();
            // guest connection maps to the randomly drawn guest slot
            const offAction = room.onAction?.((action) => applyAction(action, state ? state.slots.guest : 1));
            if (typeof offAction === "function") unsubs.push(offAction);
        } else {
            const offState = room.onState?.((nextState) => { if (nextState) { state = nextState; render(); } });
            if (typeof offState === "function") unsubs.push(offState);
        }
    } else {
        state = freshState();
        publish();
    }
    render();

    return {
        destroy() {
            destroyed = true;
            timers.forEach(clearTimeout);
            timers.clear();
            root.removeEventListener("click", handleClick);
            document.removeEventListener("keydown", handleKey);
            unsubs.forEach((fn) => { try { fn(); } catch (_) { } });
        },
    };
}