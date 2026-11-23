/* ==== GAME: dice-roller.js ==== */
/*
 * Dice Roller — duel dadu bergiliran (You vs Bot / Player 1 vs Player 2).
 * Setelah mengubah file ini, jalankan: node tools/build-games-manifest.mjs
 */

export const META = {
    id: "dice-roller", // harus sama dengan nama file (tanpa .js)
    name: "Dice Roller",
    category: "casino",
    catLabel: "Casino",
    desc: "Dice duel vs bot or online — chase combos, first to 250 wins.",
    art: '<svg viewBox="0 0 48 48" width="54" height="54" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 6C2 13 2 27 8 34"/><path d="M40 6c6 7 6 21 0 28"/><rect x="14" y="11" width="24" height="26" rx="6"/><circle cx="21" cy="18" r="2.2" fill="currentColor" stroke="none"/><circle cx="27" cy="24" r="2.2" fill="currentColor" stroke="none"/><circle cx="33" cy="30" r="2.2" fill="currentColor" stroke="none"/></svg>',
    bg: ["#c7d2fe", "#6366f1"],
};

export function mount(root, context = {}) {
    const { mode = "ai", room = null, playerName = "Player", onExit = () => { } } = context;
    const online = mode === "room" && Boolean(room);
    const isHost = online ? Boolean(room.isHost) : true;
    let roomData = room?.room || null;

    /* ---------------- pure rules ---------------- */
    const TARGET = 250;
    const MAX_ROLLS = 15;

    const PIP = {
        0: [],
        1: [[30, 30]],
        2: [[20, 20], [40, 40]],
        3: [[20, 20], [30, 30], [40, 40]],
        4: [[20, 20], [40, 20], [20, 40], [40, 40]],
        5: [[20, 20], [40, 20], [30, 30], [20, 40], [40, 40]],
        6: [[20, 20], [40, 20], [20, 30], [40, 30], [20, 40], [40, 40]],
    };

    function rollDice(n) {
        const a = [];
        for (let i = 0; i < n; i++) a.push(1 + ((Math.random() * 6) | 0));
        return a;
    }

    /* sum pips + satu bonus kombo: N of a kind = 50 x N, straight 1..N = 40, three pairs = 30 */
    function scoreRoll(dice) {
        const n = dice.length;
        const c = [0, 0, 0, 0, 0, 0, 0];
        let sum = 0;
        for (let i = 0; i < n; i++) {
            const v = dice[i];
            if (v >= 1 && v <= 6) { c[v] += 1; sum += v; }
        }
        let bonus = 0, bonusName = "";
        if (n >= 2) {
            if (c[dice[0]] === n) {
                bonus = 50 * n; bonusName = n + " of a kind";
            } else {
                let straight = n <= 6;
                for (let f = 1; f <= n; f++) if (c[f] !== 1) straight = false;
                if (straight) {
                    bonus = 40; bonusName = "straight 1-" + n;
                } else {
                    let pairs = 0;
                    for (let f = 1; f <= 6; f++) pairs += (c[f] / 2) | 0;
                    if (pairs >= 3) { bonus = 30; bonusName = "three pairs"; }
                }
            }
        }
        return { sum, bonus, total: sum + bonus, bonusName };
    }

    /* ---------------- shell (minimalist) ---------------- */
    root.innerHTML = `
<style>
.dd-app [hidden]{display:none!important}
.dd-app .dd-panel{position:relative;display:flex;flex-direction:column;align-items:center;gap:20px;padding:20px 16px 24px}
.dd-app .dd-score{display:grid;grid-template-columns:1fr 1fr;gap:10px;width:100%;max-width:520px}
.dd-app .dd-seat{display:flex;flex-direction:column;gap:7px;padding:12px 14px;border:1px solid #ffffff14;border-radius:14px;background:#ffffff06;transition:border-color .18s ease,background .18s ease}
.dd-app .dd-seat.on{border-color:#818cf8;background:#6366f11f}
.dd-app .dd-seat-top{display:flex;align-items:baseline;justify-content:space-between;gap:8px}
.dd-app .dd-seat-name{font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#9ca3af;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.dd-app .dd-seat.on .dd-seat-name{color:#c7d2fe}
.dd-app .dd-seat-left{font-size:11px;color:#6b7280;font-variant-numeric:tabular-nums;white-space:nowrap}
.dd-app .dd-seat-score{font-size:28px;font-weight:800;line-height:1;color:#e5e7eb;font-variant-numeric:tabular-nums}
.dd-app .dd-seat-score small{font-size:12px;font-weight:600;color:#6b7280}
.dd-app .dd-bar{height:3px;border-radius:99px;background:#ffffff12;overflow:hidden}
.dd-app .dd-bar i{display:block;height:100%;width:0;background:#6366f1;border-radius:99px;transition:width .35s ease}
.dd-app .dd-stage{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;min-height:136px}
.dd-app .dd-rolled{font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:#6b7280;min-height:14px}
.dd-app .dd-dice{display:flex;gap:10px;flex-wrap:wrap;justify-content:center;min-height:52px}
.dd-app .dd-die{width:52px;height:52px}
.dd-app .dd-die svg{display:block;width:100%;height:100%}
.dd-app .dd-die-bg{fill:#f8fafc;stroke:#94a3b8;stroke-width:2}
.dd-app .dd-pip{fill:#1e293b}
.dd-app .dd-die.rolling{animation:ddTumble .22s linear infinite}
.dd-app .dd-result{display:flex;align-items:baseline;gap:10px;min-height:32px}
.dd-app .dd-total{font-size:28px;font-weight:800;color:#a5b4fc;line-height:1;font-variant-numeric:tabular-nums}
.dd-app .dd-bonus{font-size:11.5px;font-weight:700;color:#fcd34d;border:1px solid #fcd34d33;border-radius:999px;padding:2px 9px}
.dd-app .dd-controls{display:flex;flex-direction:column;align-items:center;gap:12px}
.dd-app .dd-chips{display:flex;gap:7px;flex-wrap:wrap;justify-content:center}
.dd-app .dd-chip{min-width:38px;height:38px;padding:0 10px;border-radius:10px;border:1px solid #ffffff1c;background:transparent;color:#9ca3af;font-size:13.5px;font-weight:700;cursor:pointer;font-variant-numeric:tabular-nums;transition:background .15s ease,color .15s ease,border-color .15s ease}
.dd-app .dd-chip.on{background:#6366f1;border-color:#818cf8;color:#fff}
.dd-app .dd-chip:disabled{opacity:.4;cursor:default}
.dd-app .dd-roll{min-width:150px;height:44px;padding:0 26px;border-radius:12px;border:1px solid #818cf8;background:#6366f1;color:#fff;font-size:14.5px;font-weight:700;cursor:pointer;transition:opacity .15s ease,transform .05s ease}
.dd-app .dd-roll:active{transform:translateY(1px)}
.dd-app .dd-roll:disabled{opacity:.35;cursor:default;border-color:#ffffff22;background:#ffffff10;color:#9ca3af}
.dd-app .dd-flags{display:flex;gap:6px;min-height:18px}
.dd-app .dd-flag{font-size:10.5px;font-weight:700;letter-spacing:.06em;color:#fcd34d;border:1px dashed #fcd34d55;border-radius:999px;padding:2px 8px;text-transform:uppercase}
.dd-app .dd-overlay{position:absolute;inset:0;z-index:6;display:flex;align-items:center;justify-content:center;background:#0b0e1ac9;backdrop-filter:blur(3px);border-radius:inherit;padding:16px}
.dd-app .dd-card{display:flex;flex-direction:column;align-items:center;gap:12px;width:100%;max-width:300px;padding:22px 20px;border:1px solid #ffffff16;border-radius:16px;background:#131725;text-align:center}
.dd-app .dd-card h3{margin:0;font-size:20px;font-weight:800;color:#e5e7eb}
.dd-app .dd-card h3.win{color:#86efac}
.dd-app .dd-card h3.lose{color:#fca5a5}
.dd-app .dd-card p{margin:0;font-size:12.5px;color:#9ca3af;font-variant-numeric:tabular-nums}
.dd-app .dd-card button{height:40px;padding:0 18px;border-radius:10px;border:1px solid #ffffff22;background:#ffffff10;color:#e5e7eb;font-size:13px;font-weight:700;cursor:pointer}
.dd-app .dd-card button.primary{background:#6366f1;border-color:#818cf8;color:#fff}
.dd-app .dd-card button:disabled{opacity:.4;cursor:default}
.dd-app .dd-cheats{display:grid;grid-template-columns:1fr 1fr;gap:8px;width:100%}
@keyframes ddTumble{0%{transform:rotate(0) translateY(0)}25%{transform:rotate(-10deg) translateY(-6px)}50%{transform:rotate(7deg) translateY(-3px)}75%{transform:rotate(-5deg) translateY(-7px)}100%{transform:rotate(0) translateY(0)}}
@media (max-width:560px){
.dd-app .dd-panel{padding:14px 10px 18px;gap:16px}
.dd-app .dd-die{width:44px;height:44px}
.dd-app .dd-seat-score{font-size:24px}
.dd-app .dd-chip{min-width:40px;height:40px}
}
</style>
<div class="game-app dd-app">
  <div class="game-intro">
    <div><h2>Dice Roller</h2><p data-mode></p></div>
    <span class="game-status"><i class="game-status-dot"></i><span data-status>Ready</span></span>
  </div>
  <section class="game-panel dd-panel" data-board>
    <div class="dd-score">
      <div class="dd-seat" data-seat="0">
        <div class="dd-seat-top"><span class="dd-seat-name" data-name></span><span class="dd-seat-left" data-left></span></div>
        <div class="dd-seat-score"><span data-score>0</span><small> / ${TARGET}</small></div>
        <div class="dd-bar"><i data-bar></i></div>
      </div>
      <div class="dd-seat" data-seat="1">
        <div class="dd-seat-top"><span class="dd-seat-name" data-name></span><span class="dd-seat-left" data-left></span></div>
        <div class="dd-seat-score"><span data-score>0</span><small> / ${TARGET}</small></div>
        <div class="dd-bar"><i data-bar></i></div>
      </div>
    </div>
    <div class="dd-stage">
      <div class="dd-rolled" data-rolled></div>
      <div class="dd-dice" data-dice></div>
      <div class="dd-result" data-result hidden>
        <span class="dd-total" data-total></span>
        <span class="dd-bonus" data-bonus hidden></span>
      </div>
    </div>
    <div class="dd-controls">
      <div class="dd-chips" data-chips></div>
      <button class="dd-roll" type="button" data-act="roll">Roll</button>
      <div class="dd-flags" data-flags></div>
    </div>
    <div class="dd-overlay" data-ov="over" hidden>
      <div class="dd-card">
        <h3 data-ovtitle></h3>
        <p data-ovsub></p>
        <button class="primary" type="button" data-act="restart">Play again</button>
      </div>
    </div>
    <div class="dd-overlay" data-ov="cheat" hidden>
      <div class="dd-card">
        <h3>Cheats</h3>
        <div class="dd-cheats">
          <button type="button" data-cheat="points">+25 points</button>
          <button type="button" data-cheat="rolls">+3 rolls</button>
          <button type="button" data-cheat="lucky">Lucky roll</button>
          <button type="button" data-cheat="skip">Skip bot</button>
        </div>
        <button type="button" data-act="cheat-close">Close</button>
      </div>
    </div>
  </section>
  <div class="game-actions">
    <button class="game-action-button" type="button" data-act="restart">Restart</button>
    <button class="game-action-button" type="button" data-act="cheat-toggle" data-cheatbtn hidden>Cheats</button>
    <button class="game-action-button" type="button" data-exit>Exit game</button>
  </div>
</div>`;

    /* ---------------- refs ---------------- */
    const $ = (s) => root.querySelector(s);
    const modeEl = $("[data-mode]");
    const statusEl = $("[data-status]");
    const diceBox = $("[data-dice]");
    const rolledEl = $("[data-rolled]");
    const resultBox = $("[data-result]");
    const totalEl = $("[data-total]");
    const bonusEl = $("[data-bonus]");
    const chipsBox = $("[data-chips]");
    const flagsBox = $("[data-flags]");
    const rollBtn = $('[data-act="roll"]');
    const overOv = $('[data-ov="over"]');
    const cheatOv = $('[data-ov="cheat"]');
    const ovTitle = $("[data-ovtitle]");
    const ovSub = $("[data-ovsub]");
    const cheatBtn = $("[data-cheatbtn]");
    const cheatBtns = [...root.querySelectorAll("[data-cheat]")];
    const seatEls = [...root.querySelectorAll(".dd-seat")].map((el) => ({
        el,
        name: el.querySelector("[data-name]"),
        score: el.querySelector("[data-score]"),
        left: el.querySelector("[data-left]"),
        bar: el.querySelector("[data-bar]"),
    }));

    const dieEls = [];
    for (let i = 0; i < 6; i++) {
        const d = document.createElement("div");
        d.className = "dd-die";
        d.innerHTML =
            '<svg viewBox="0 0 60 60" aria-hidden="true"><rect class="dd-die-bg" x="3" y="3" width="54" height="54" rx="13"></rect><g class="dd-pips"></g></svg>';
        diceBox.appendChild(d);
        dieEls.push(d);
    }
    function setFace(el, v) {
        el.querySelector(".dd-pips").innerHTML = (PIP[v] || [])
            .map((p) => '<circle class="dd-pip" cx="' + p[0] + '" cy="' + p[1] + '" r="5"></circle>')
            .join("");
    }
    function showFaces(arr) {
        dieEls.forEach((el, i) => {
            el.style.display = i < arr.length ? "" : "none";
            el.classList.remove("rolling");
            setFace(el, arr[i] || 0);
        });
    }

    const chipEls = [];
    for (let n = 1; n <= 6; n++) {
        const c = document.createElement("button");
        c.type = "button";
        c.className = "dd-chip";
        c.textContent = String(n);
        c.dataset.n = String(n);
        c.setAttribute("aria-label", n + (n === 1 ? " die" : " dice"));
        chipsBox.appendChild(c);
        chipEls.push(c);
    }

    /* ---------------- state ---------------- */
    let state = null;
    let shownLastId = 0, animId = 0, booted = false, rolling = false, gen = 0;
    let botTimer = null, cheatOpen = false;
    const timers = new Set();
    const youName = (playerName && String(playerName).trim()) || "You";

    function later(fn, ms) {
        const t = setTimeout(() => { timers.delete(t); fn(); }, ms);
        timers.add(t);
        return t;
    }
    function clearTimers() {
        timers.forEach((t) => clearTimeout(t));
        timers.clear();
    }
    function cancelBot() {
        if (botTimer) { clearTimeout(botTimer); timers.delete(botTimer); botTimer = null; }
    }

    /* Giliran pertama acak tiap game; posisi host (Player 1 / Player 2) acak per sesi. */
    function freshState(hostSeat) {
        const first = Math.random() < 0.5 ? 0 : 1;
        return {
            hostSeat, first, turn: first,
            phase: "play", winner: null,
            scores: [0, 0], left: [MAX_ROLLS, MAX_ROLLS], counts: [5, 5],
            last: null, rollId: 0,
            lucky: false, skipBot: false, // cheat flags (mode AI saja)
        };
    }

    function localSeat() {
        if (!online) return 0;
        if (!state) return null;
        return isHost ? state.hostSeat : 1 - state.hostSeat;
    }
    function seatName(s) {
        return online ? "Player " + (s + 1) : (s === 0 ? youName : "Bot");
    }
    function canAct() {
        const me = localSeat();
        return !!state && state.phase === "play" && !rolling &&
            me != null && state.turn === me && state.left[me] > 0;
    }

    /* ---------------- rules engine (host / lokal saja yang menghitung) ---------------- */
    function checkEnd(actor) {
        if (state.scores[actor] >= TARGET) {
            state.phase = "over"; state.winner = actor; return true;
        }
        if (state.left[0] <= 0 && state.left[1] <= 0) {
            state.phase = "over";
            state.winner = state.scores[0] === state.scores[1] ? "draw"
                : (state.scores[0] > state.scores[1] ? 0 : 1);
            return true;
        }
        return false;
    }
    function advance(actor) {
        const other = 1 - actor;
        if (!online && state.skipBot && other === 1) {
            state.skipBot = false;
            if (state.left[actor] > 0) { state.turn = actor; return; }
        }
        state.turn = state.left[other] > 0 ? other : actor;
    }

    function applyAction(action, actor) {
        if (!state || !action || (actor !== 0 && actor !== 1)) return;
        const t = action.type;
        if (t === "restart") {
            state = freshState(state.hostSeat);
            publish();
            return;
        }
        if (state.phase !== "play") return;
        if (t === "count") {
            const n = Math.floor(+action.n);
            if (state.turn !== actor || !(n >= 1 && n <= 6) || state.counts[actor] === n) return;
            state.counts[actor] = n;
            publish();
            return;
        }
        if (t === "roll") {
            if (state.turn !== actor || state.left[actor] <= 0) return;
            let dice = rollDice(state.counts[actor]);
            if (!online && actor === 0 && state.lucky) {
                const f = 1 + ((Math.random() * 6) | 0);
                dice = dice.map(() => f);
                state.lucky = false;
            }
            const res = scoreRoll(dice);
            state.scores[actor] += res.total;
            state.left[actor] -= 1;
            state.rollId += 1;
            state.last = {
                id: state.rollId, seat: actor, dice,
                sum: res.sum, bonus: res.bonus, total: res.total, bonusName: res.bonusName,
            };
            if (!checkEnd(actor)) advance(actor);
            publish();
            return;
        }
        if (t === "cheat" && !online && actor === 0) {
            const k = action.kind;
            if (k === "points") { state.scores[0] += 25; checkEnd(0); }
            else if (k === "rolls") { state.left[0] += 3; }
            else if (k === "lucky") { state.lucky = true; }
            else if (k === "skip") { state.skipBot = true; }
            else return;
            publish();
        }
    }

    function publish() {
        syncView();
        if (online && isHost) room.publishState(state).catch(console.warn);
    }
    function submitAction(action) {
        if (online && !isHost) { room.sendAction(action).catch(console.warn); return; }
        const me = localSeat();
        if (me == null) return;
        applyAction(action, me);
    }
    function tryRoll() { if (canAct()) submitAction({ type: "roll" }); }
    function tryCount(n) { if (canAct() && n >= 1 && n <= 6) submitAction({ type: "count", n }); }

    /* ---------------- bot (mode AI) ---------------- */
    function scheduleBot() {
        cancelBot();
        if (online || !state || state.phase !== "play" || state.turn !== 1 || rolling) return;
        const g = gen;
        botTimer = later(() => {
            botTimer = null;
            if (g !== gen || !state || state.phase !== "play" || state.turn !== 1 || rolling) return;
            const n = Math.random() < 0.6 ? 6 : 5;
            if (state.counts[1] !== n) applyAction({ type: "count", n }, 1);
            applyAction({ type: "roll" }, 1);
        }, 850 + Math.random() * 650);
    }

    /* ---------------- render ---------------- */
    function winnerText() {
        if (state.winner === "draw") return "Draw";
        return state.winner === localSeat() ? "You win!" : seatName(state.winner) + " wins";
    }
    function render() {
        const st = state;
        const me = localSeat();
        modeEl.textContent = online
            ? (st ? "Online · you are " + seatName(me) : "Online · connecting…")
            : "You vs Bot";

        for (let s = 0; s < 2; s++) {
            const r = seatEls[s];
            r.name.textContent = seatName(s) + (online && s === me ? " · you" : "");
            r.score.textContent = st ? String(st.scores[s]) : "0";
            r.left.textContent = st ? st.left[s] + " left" : "–";
            r.bar.style.width = st ? Math.min(100, (st.scores[s] / TARGET) * 100) + "%" : "0%";
            r.el.classList.toggle("on", !!st && st.phase === "play" && st.turn === s);
        }

        if (!rolling) {
            const arr = st && st.last ? st.last.dice
                : new Array(st && me != null ? st.counts[me] : 5).fill(0);
            showFaces(arr);
        }
        if (st && st.last && !rolling) {
            rolledEl.textContent = seatName(st.last.seat) + " rolled";
            resultBox.hidden = false;
            totalEl.textContent = "+" + st.last.total;
            bonusEl.hidden = st.last.bonus <= 0;
            if (st.last.bonus > 0) bonusEl.textContent = "+" + st.last.bonus + " " + st.last.bonusName;
        } else {
            rolledEl.textContent = rolling && st && st.last ? seatName(st.last.seat) + " rolling…" : "";
            resultBox.hidden = true;
        }

        const myCount = st && me != null ? st.counts[me] : 5;
        const ok = canAct();
        chipEls.forEach((c) => {
            const n = +c.dataset.n;
            c.classList.toggle("on", n === myCount);
            c.disabled = !ok;
        });
        rollBtn.disabled = !ok;

        flagsBox.innerHTML = st && !online
            ? (st.lucky ? '<span class="dd-flag">lucky</span>' : "") +
            (st.skipBot ? '<span class="dd-flag">bot skip</span>' : "")
            : "";

        statusEl.textContent = !st ? "Connecting…"
            : st.phase === "over" ? winnerText()
                : rolling ? seatName(st.last.seat) + " rolling…"
                    : st.turn === me ? "Your turn" : seatName(st.turn) + "'s turn";

        const showOver = !!st && st.phase === "over" && !rolling;
        overOv.hidden = !showOver;
        if (showOver) {
            ovTitle.textContent = winnerText();
            ovTitle.className = st.winner === "draw" ? "" : (st.winner === me ? "win" : "lose");
            ovSub.textContent = seatName(0) + " " + st.scores[0] + " — " + st.scores[1] + " " + seatName(1);
        }
        cheatBtn.hidden = online;
        cheatOv.hidden = online || !cheatOpen;
        cheatBtns.forEach((b) => { b.disabled = !st || st.phase !== "play"; });
    }

    /* ---------------- animasi (kosmetik, tidak mengubah state) ---------------- */
    function animateLast(done) {
        const my = ++gen;
        rolling = true;
        render();
        const finals = state.last.dice;
        dieEls.forEach((el, i) => {
            el.style.display = i < finals.length ? "" : "none";
            el.classList.remove("rolling");
        });
        const els = dieEls.slice(0, finals.length);
        els.forEach((el, j) => {
            el.classList.add("rolling");
            const t0 = j * 60;
            for (let s = 1; s <= 4; s++) {
                later(() => { if (gen === my) setFace(el, 1 + ((Math.random() * 6) | 0)); }, t0 + s * 80);
            }
            later(() => {
                if (gen !== my) return;
                el.classList.remove("rolling");
                setFace(el, finals[j]);
            }, t0 + 400);
        });
        later(() => { if (gen === my) done(); }, finals.length * 60 + 430);
    }

    function syncView() {
        cancelBot();
        if (!state) { render(); return; }
        if (!state.last) { // game baru / restart
            gen += 1;
            clearTimers();
            botTimer = null;
            rolling = false;
            animId = 0;
            shownLastId = 0;
            render();
            booted = true;
            scheduleBot();
            return;
        }
        if (state.last.id !== shownLastId && state.last.id !== animId) {
            if (!booted) { // join di tengah game: langsung tampilkan, tanpa animasi
                shownLastId = state.last.id;
                render();
                scheduleBot();
            } else {
                const id = state.last.id;
                animId = id;
                animateLast(() => {
                    animId = 0;
                    shownLastId = id;
                    rolling = false;
                    render();
                    scheduleBot();
                });
            }
        } else {
            render();
            if (!rolling) scheduleBot();
        }
        booted = true;
    }

    /* ---------------- input: mouse / tap ---------------- */
    function handleClick(event) {
        if (event.target.closest("[data-exit]")) { onExit(); return; }
        if (event.target === cheatOv) { cheatOpen = false; render(); return; }
        const chip = event.target.closest(".dd-chip");
        if (chip && !chip.disabled) { tryCount(+chip.dataset.n); return; }
        const cheat = event.target.closest("[data-cheat]");
        if (cheat && !cheat.disabled) { submitAction({ type: "cheat", kind: cheat.dataset.cheat }); return; }
        const b = event.target.closest("[data-act]");
        if (!b || b.disabled) return;
        const act = b.dataset.act;
        if (act === "roll") tryRoll();
        else if (act === "restart") submitAction({ type: "restart" });
        else if (act === "cheat-toggle" && !online) { cheatOpen = !cheatOpen; render(); }
        else if (act === "cheat-close") { cheatOpen = false; render(); }
    }
    root.addEventListener("click", handleClick);

    /* ---------------- input: keyboard (desktop) ---------------- */
    function onKey(e) {
        if (!root.isConnected || e.ctrlKey || e.metaKey || e.altKey) return;
        const t = e.target;
        if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
        if (e.code === "Escape") {
            if (cheatOpen) { cheatOpen = false; render(); }
            return;
        }
        if (cheatOpen) {
            if (e.code === "KeyC" && !online) { cheatOpen = false; render(); }
            return;
        }
        const onButton = t && t.closest && t.closest("button");
        if (e.code === "Space" || e.code === "Enter") {
            if (onButton) return; // biarkan tombol yang ter-focus menangani sendiri
            e.preventDefault();
            if (!e.repeat) tryRoll();
        } else if (/^(Digit|Numpad)[1-6]$/.test(e.code)) {
            tryCount(+e.code.slice(-1));
        } else if (e.code === "KeyR") {
            submitAction({ type: "restart" });
        } else if (e.code === "KeyC" && !online) {
            cheatOpen = true;
            render();
        }
    }
    document.addEventListener("keydown", onKey);

    /* ---------------- wiring mode ---------------- */
    const offs = [];
    if (online) {
        offs.push(room.onRoom((nextRoom) => { roomData = nextRoom; render(); }));
        if (isHost) {
            // Posisi host diacak: bisa jadi Player 1 atau Player 2.
            state = freshState(Math.random() < 0.5 ? 0 : 1);
            publish();
            offs.push(room.onAction((action) => applyAction(action, 1 - state.hostSeat)));
        } else {
            offs.push(room.onState((nextState) => { state = nextState; syncView(); }));
        }
    } else {
        state = freshState(0);
        syncView();
    }

    return {
        destroy() {
            gen += 1;
            cancelBot();
            clearTimers();
            document.removeEventListener("keydown", onKey);
            root.removeEventListener("click", handleClick);
            offs.forEach((off) => { if (typeof off === "function") off(); });
            state = null;
        },
    };
}