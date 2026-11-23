/* ==== GAME: count-the-cube.js ==== */
/* Count the Cube — turn-based cube counting (solo vs bot / 1v1 room).
   Random starter, random seats, wireframe verification before next round. */

export const META = {
    id: "count-the-cube", // harus sama dengan nama file (tanpa .js)
    name: "Count the Cube",
    category: "educational",
    catLabel: "Educational",
    desc: "Count every cube in the 3D stack - rotate to check your math.",
    art: '<svg viewBox="0 0 48 48" width="54" height="54" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M24 6l14 8-14 8-14-8z"/><path d="M10 14v16l14 8V22z" fill="#ffffff22"/><path d="M38 14v16l-14 8V22z"/><path d="M17 19l5 3v6m9-9l-5 3"/></svg>',
    bg: ["#c7d2fe", "#6366f1"],
};

export function mount(root, context = {}) {
    const { mode = "ai", room = null, playerName = "Player", onExit = () => { } } = context;
    const online = mode === "room" && Boolean(room);
    let roomData = room?.room || null;
    let state = null;

    /* ---------------- constants & pure helpers ---------------- */
    const ROUNDS = 5,
        LIVES = 3;
    const HW = 22,
        Q = 11,
        SH = 24; /* iso geometry */

    const rnd = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
    const total = (h) => h.reduce((a, b) => a + b, 0);

    function roundCfg(i) {
        if (i < 2) return { n: 3, maxH: 3 };
        if (i < 4) return { n: 4, maxH: 4 };
        return { n: 4, maxH: 5 };
    }
    function rotateHeights(h, n) {
        const out = new Array(n * n).fill(0);
        for (let x = 0; x < n; x++)
            for (let y = 0; y < n; y++) out[y * n + (n - 1 - x)] = h[x * n + y];
        return out;
    }
    function rotated(h, n, t) {
        let out = h;
        const k = ((t % 4) + 4) % 4;
        for (let i = 0; i < k; i++) out = rotateHeights(out, n);
        return out;
    }
    /* at least one column partially occluded from the default view */
    function hasHidden(h, n) {
        for (let x = 0; x < n; x++)
            for (let y = 0; y < n; y++) {
                const v = h[x * n + y];
                if (!v) continue;
                const f1 = x + 1 < n ? h[(x + 1) * n + y] : 0;
                const f2 = y + 1 < n ? h[x * n + y + 1] : 0;
                if (f1 >= v || f2 >= v) return true;
            }
        return false;
    }
    /* constrained random generator: always solvable & verifiable */
    function makeHeights(n, maxH) {
        for (let t = 0; t < 80; t++) {
            const h = [];
            for (let i = 0; i < n * n; i++) h.push(rnd(0, maxH));
            const tot = total(h);
            const filled = h.filter((v) => v > 0).length;
            const tall = h.filter((v) => v >= 2).length;
            if (
                tot >= n * n &&
                tot <= 99 &&
                filled >= Math.ceil(n * n * 0.55) &&
                tall >= 2 &&
                hasHidden(h, n)
            )
                return h;
        }
        const h = new Array(n * n).fill(2); /* deterministic fallback */
        const c = Math.floor(n / 2);
        h[c * n + c] = maxH;
        return h;
    }

    /* ---------------- SVG renderers ---------------- */
    const pts = (a) => a.map((p) => p[0].toFixed(1) + "," + p[1].toFixed(1)).join(" ");

    function bounds() {
        let minX = 1e9, minY = 1e9, maxX = -1e9, maxY = -1e9;
        return {
            note(x, y) {
                if (x < minX) minX = x;
                if (x > maxX) maxX = x;
                if (y < minY) minY = y;
                if (y > maxY) maxY = y;
            },
            vb(pad) {
                return (
                    minX - pad + " " + (minY - pad) + " " +
                    (maxX - minX + pad * 2) + " " + (maxY - minY + pad * 2)
                );
            },
        };
    }
    function svgOpen(vb) {
        return (
            '<svg viewBox="' + vb +
            '" width="100%" height="100%" preserveAspectRatio="xMidYMid meet" aria-hidden="true">'
        );
    }
    function faces(bx, tcy) {
        return {
            top: [[bx, tcy - Q], [bx + HW, tcy], [bx, tcy + Q], [bx - HW, tcy]],
            left: [[bx - HW, tcy], [bx, tcy + Q], [bx, tcy + Q + SH], [bx - HW, tcy + SH]],
            right: [[bx, tcy + Q], [bx + HW, tcy], [bx + HW, tcy + SH], [bx, tcy + Q + SH]],
        };
    }
    function sortedCells(n) {
        const cells = [];
        for (let x = 0; x < n; x++) for (let y = 0; y < n; y++) cells.push([x, y]);
        cells.sort((a, b) => a[0] + a[1] - (b[0] + b[1]));
        return cells;
    }

    function renderStack(h, n) {
        const B = bounds();
        const polys = [];
        sortedCells(n).forEach(([x, y]) => {
            const hgt = h[x * n + y];
            const bx = x * HW - y * HW,
                by = x * Q + y * Q;
            for (let k = 0; k < hgt; k++) {
                const f = faces(bx, by - (k + 1) * SH);
                [f.top, f.left, f.right].forEach((fc) => fc.forEach(([px, py]) => B.note(px, py)));
                polys.push({ p: f.left, fill: "#a5b4fc" });
                polys.push({ p: f.right, fill: "#6366f1" });
                polys.push({ p: f.top, fill: "#e0e7ff" });
            }
        });
        const body = polys
            .map(
                (o) =>
                    '<polygon points="' + pts(o.p) + '" fill="' + o.fill +
                    '" stroke="#1e1b4b" stroke-width="0.8" stroke-linejoin="round"/>',
            )
            .join("");
        return svgOpen(B.vb(8)) + body + "</svg>";
    }

    /* wireframe verification view: every cube visible + per-column counts */
    function renderWireframe(h, n) {
        const B = bounds();
        const parts = [];
        for (let x = 0; x < n; x++)
            for (let y = 0; y < n; y++) {
                const bx = x * HW - y * HW,
                    by = x * Q + y * Q;
                const cell = [[bx, by - Q], [bx + HW, by], [bx, by + Q], [bx - HW, by]];
                cell.forEach(([px, py]) => B.note(px, py));
                parts.push(
                    '<polygon points="' + pts(cell) +
                    '" fill="none" stroke="#cbd5e1" stroke-width="0.8" stroke-dasharray="3 3"/>',
                );
            }
        sortedCells(n).forEach(([x, y]) => {
            const hgt = h[x * n + y];
            const bx = x * HW - y * HW,
                by = x * Q + y * Q;
            for (let k = 0; k < hgt; k++) {
                const f = faces(bx, by - (k + 1) * SH);
                [f.top, f.left, f.right].forEach((fc) => fc.forEach(([px, py]) => B.note(px, py)));
                parts.push('<polygon points="' + pts(f.left) + '" fill="none" stroke="#64748b" stroke-width="0.9"/>');
                parts.push('<polygon points="' + pts(f.right) + '" fill="none" stroke="#64748b" stroke-width="0.9"/>');
                parts.push('<polygon points="' + pts(f.top) + '" fill="rgba(79,70,229,0.07)" stroke="#64748b" stroke-width="0.9"/>');
            }
            if (hgt > 0) {
                const ly = by - hgt * SH - Q - 5;
                B.note(bx - 10, ly - 10);
                B.note(bx + 10, ly + 4);
                parts.push(
                    '<text x="' + bx + '" y="' + ly +
                    '" text-anchor="middle" font-size="10" font-weight="700" fill="#0f172a" stroke="#ffffff" stroke-width="3" paint-order="stroke">' +
                    hgt + "</text>",
                );
            }
        });
        return svgOpen(B.vb(10)) + parts.join("") + "</svg>";
    }

    /* ---------------- shell (minimalist, no tutorial) ---------------- */
    root.innerHTML = `
<style>
.cc-app{--line:#e2e8f0;--ink:#0f172a;--mut:#64748b;--acc:#4f46e5;--good:#059669;--bad:#dc2626;color:var(--ink);font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
.cc-app [hidden]{display:none!important}
.cc-app h2{margin:0;font-size:18px;font-weight:700}
.cc-app .cc-panel{position:relative;display:flex;flex-direction:column;gap:14px;padding:16px;background:#fff;border:1px solid var(--line);border-radius:16px;overflow:hidden}
.cc-hud{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}
.cc-round{font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:var(--mut)}
.cc-round b{color:var(--ink)}
.cc-players{display:flex;gap:8px}
.cc-player{min-width:104px;padding:8px 12px;border:1px solid var(--line);border-radius:12px;background:#fff;transition:border-color .15s,background .15s}
.cc-player.active{border-color:var(--acc);background:#eef2ff}
.cc-player .nm{font-size:11px;color:var(--mut);max-width:130px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.cc-player .sc{font-size:20px;font-weight:700;line-height:1.15}
.cc-player .lv{display:flex;gap:4px;margin-top:4px}
.cc-dot{width:7px;height:7px;border-radius:50%;background:var(--acc)}
.cc-dot.off{background:var(--line)}
.cc-tools{display:flex;gap:8px}
.cc-btn{appearance:none;border:1px solid var(--line);background:#fff;color:var(--ink);border-radius:10px;padding:8px 12px;font-size:13px;font-weight:600;cursor:pointer;transition:border-color .15s,background .15s}
.cc-btn:hover{border-color:var(--acc)}
.cc-btn:disabled{opacity:.45;cursor:default}
.cc-btn.primary{background:var(--acc);border-color:var(--acc);color:#fff}
.cc-btn.primary:hover{background:#4338ca}
.cc-scene-box{position:relative;width:100%}
.cc-scene{width:100%;height:min(44vh,320px);background:#f8fafc;border:1px solid var(--line);border-radius:14px;display:flex;align-items:center;justify-content:center;touch-action:none;user-select:none;cursor:grab}
.cc-scene:active{cursor:grabbing}
.cc-reveal{position:absolute;top:8px;right:10px;font-size:12px;font-weight:700;color:var(--acc);background:#eef2ff;border:1px solid #c7d2fe;border-radius:999px;padding:3px 10px}
.cc-answer{display:flex;align-items:center;justify-content:center;gap:10px;flex-wrap:wrap}
.cc-input{width:110px;text-align:center;font-size:26px;font-weight:700;color:var(--ink);background:#fff;border:1px solid var(--line);border-radius:12px;padding:8px 10px;letter-spacing:2px;outline:none}
.cc-input:focus{border-color:var(--acc)}
.cc-input:disabled{background:#f8fafc;color:var(--mut)}
.cc-pad{display:grid;grid-template-columns:repeat(3,minmax(56px,72px));gap:8px;justify-content:center}
.cc-key{height:48px;border:1px solid var(--line);border-radius:12px;background:#fff;font-size:18px;font-weight:700;color:var(--ink);cursor:pointer}
.cc-key:active{background:#eef2ff;border-color:var(--acc)}
.cc-key:disabled{opacity:.45}
.cc-feedback{min-height:22px;text-align:center;font-size:14px;font-weight:600;color:var(--mut)}
.cc-feedback.good{color:var(--good)}
.cc-feedback.bad{color:var(--bad)}
.cc-overlay{position:absolute;inset:0;background:rgba(255,255,255,.96);display:flex;align-items:center;justify-content:center;padding:20px;z-index:5}
.cc-card{width:min(92%,340px);border:1px solid var(--line);border-radius:16px;background:#fff;padding:20px;display:flex;flex-direction:column;gap:12px;box-shadow:0 12px 32px rgba(15,23,42,.08)}
.cc-card h3{margin:0;font-size:18px}
.cc-card p{margin:0;font-size:13px;color:var(--mut)}
.cc-cheat-row{display:flex;align-items:center;justify-content:space-between;gap:10px;font-size:13px;font-weight:600}
.cc-switch{position:relative;width:38px;height:22px;border-radius:999px;border:1px solid var(--line);background:#e2e8f0;cursor:pointer;transition:background .15s;flex:none}
.cc-switch::after{content:"";position:absolute;top:2px;left:2px;width:16px;height:16px;border-radius:50%;background:#fff;box-shadow:0 1px 2px rgba(0,0,0,.15);transition:transform .15s}
.cc-switch[aria-pressed="true"]{background:var(--acc);border-color:var(--acc)}
.cc-switch[aria-pressed="true"]::after{transform:translateX(16px)}
@media (hover:hover) and (pointer:fine){.cc-app .cc-pad{display:none}}
@media (max-width:480px){.cc-app .cc-tools{width:100%;justify-content:flex-end}.cc-app .cc-scene{height:min(40vh,300px)}}
</style>
<div class="game-app cc-app">
  <div class="game-intro">
    <div><h2>Count the Cube</h2></div>
    <span class="game-status"><i class="game-status-dot"></i><span data-status aria-live="polite">Ready</span></span>
  </div>
  <section class="game-panel cc-panel" data-board>
    <div class="cc-hud">
      <span class="cc-round">Round <b data-round>1</b>/${ROUNDS}</span>
      <div class="cc-players">
        <div class="cc-player" data-seat="0"><div class="nm" data-nm></div><div class="sc" data-sc>0</div><div class="lv" data-lv></div></div>
        <div class="cc-player" data-seat="1"><div class="nm" data-nm></div><div class="sc" data-sc>0</div><div class="lv" data-lv></div></div>
      </div>
      <div class="cc-tools">
        <button type="button" class="cc-btn" data-act="rotate">Rotate</button>
        <button type="button" class="cc-btn" data-act="cheats">Cheats</button>
        <button type="button" class="cc-btn" data-act="restart">Restart</button>
      </div>
    </div>
    <div class="cc-scene-box">
      <div class="cc-scene" data-scene></div>
      <span class="cc-reveal" data-reveal hidden></span>
    </div>
    <div class="cc-answer">
      <input class="cc-input" data-input inputmode="numeric" pattern="[0-9]*" maxlength="3" autocomplete="off" placeholder="0" aria-label="Your answer" disabled>
      <button type="button" class="cc-btn primary" data-act="submit" disabled>Check</button>
      <button type="button" class="cc-btn primary" data-act="next" hidden>Next round</button>
    </div>
    <div class="cc-pad" data-pad></div>
    <div class="cc-feedback" data-fb aria-live="polite"></div>
    <div class="cc-overlay" data-cheats hidden>
      <div class="cc-card">
        <h3>Cheats</h3>
        <div class="cc-cheat-row"><span>Show total</span><button type="button" class="cc-switch" data-cheat="reveal" aria-pressed="false" aria-label="Show total"></button></div>
        <div class="cc-cheat-row"><span>X-ray wireframe</span><button type="button" class="cc-switch" data-cheat="xray" aria-pressed="false" aria-label="X-ray wireframe"></button></div>
        <div class="cc-cheat-row"><span>Auto-fill answer</span><button type="button" class="cc-btn" data-act="autofill">Fill</button></div>
        <div class="cc-cheat-row" data-cheat-bot><span>Bot always wrong</span><button type="button" class="cc-switch" data-cheat="botBlunder" aria-pressed="false" aria-label="Bot always wrong"></button></div>
        <button type="button" class="cc-btn" data-act="close-cheats">Close</button>
      </div>
    </div>
    <div class="cc-overlay" data-over hidden>
      <div class="cc-card">
        <h3 data-over-title>Game over</h3>
        <p data-over-reason></p>
        <button type="button" class="cc-btn primary" data-act="restart">Play again</button>
      </div>
    </div>
  </section>
  <div class="game-actions"><button class="game-action-button" type="button" data-exit>Exit game</button></div>
</div>`;

    /* ---------------- refs ---------------- */
    const $ = (s) => root.querySelector(s);
    const statusEl = $("[data-status]"),
        roundEl = $("[data-round]"),
        sceneEl = $("[data-scene]"),
        revealEl = $("[data-reveal]"),
        inputEl = $("[data-input]"),
        submitBtn = $('[data-act="submit"]'),
        nextBtn = $('[data-act="next"]'),
        padEl = $("[data-pad]"),
        fbEl = $("[data-fb]"),
        cheatsEl = $("[data-cheats]"),
        overEl = $("[data-over]"),
        overTitleEl = $("[data-over-title]"),
        overReasonEl = $("[data-over-reason]");
    const seatEls = [root.querySelector('[data-seat="0"]'), root.querySelector('[data-seat="1"]')];
    if (online) $("[data-cheat-bot]").hidden = true;

    /* ---------------- local (non-synced) state ---------------- */
    let viewRot = 0,
        puzzleKey = "",
        botTimer = null;
    const cheats = { reveal: false, xray: false, botBlunder: false };
    const unsubs = [];

    /* random seat assignment: host draws a seat, guest gets the other one */
    function mySeat() {
        if (!online) return 0;
        if (!state) return room.isHost ? 0 : 1;
        return room.isHost ? state.hostSeat : 1 - state.hostSeat;
    }
    function canPlay() {
        return Boolean(state) && state.phase === "play" && state.turn === mySeat();
    }

    function freshState() {
        const cfg = roundCfg(0);
        const h = makeHeights(cfg.n, cfg.maxH);
        const starter = rnd(0, 1); /* random first turn */
        return {
            phase: "play",
            round: 1,
            starter,
            turn: starter,
            hostSeat: online ? rnd(0, 1) : 0, /* random player position */
            players: [
                { name: online ? "Player 1" : playerName || "You", score: 0, lives: LIVES },
                { name: online ? "Player 2" : "Bot", score: 0, lives: LIVES },
            ],
            n: cfg.n,
            heights: h,
            answer: total(h),
            last: null,
            winner: null,
            endReason: null,
        };
    }

    /* ---------------- render ---------------- */
    function render() {
        if (!state) {
            statusEl.textContent = "Waiting for host…";
            return;
        }
        const key = state.round + "|" + state.heights.join(",");
        if (key !== puzzleKey) {
            puzzleKey = key;
            viewRot = 0;
            inputEl.value = "";
        }
        roundEl.textContent = String(state.round);
        const me = mySeat();
        for (let s = 0; s < 2; s++) {
            const card = seatEls[s],
                p = state.players[s];
            card.classList.toggle("active", state.phase === "play" && state.turn === s);
            card.querySelector("[data-nm]").textContent = p.name + (s === me ? " (you)" : "");
            card.querySelector("[data-sc]").textContent = String(p.score);
            card.querySelector("[data-lv]").innerHTML = Array.from(
                { length: LIVES },
                (_, i) => '<span class="cc-dot' + (i < p.lives ? "" : " off") + '"></span>',
            ).join("");
        }
        const h = rotated(state.heights, state.n, viewRot);
        const wire = state.phase === "verify" || (cheats.xray && state.phase === "play");
        sceneEl.innerHTML = wire ? renderWireframe(h, state.n) : renderStack(h, state.n);

        revealEl.hidden = !(cheats.reveal && state.phase === "play");
        revealEl.textContent = "Total " + state.answer;

        const mine = canPlay();
        inputEl.disabled = !mine;
        submitBtn.disabled = !mine;
        padEl.hidden = state.phase !== "play";
        padEl.querySelectorAll(".cc-key").forEach((b) => (b.disabled = !mine));
        nextBtn.hidden = state.phase !== "verify";
        if (state.phase === "verify") {
            const ending = state.players.some((p) => p.lives <= 0) || state.round >= ROUNDS;
            nextBtn.textContent = ending ? "See results" : "Next round";
        }
        if (state.phase === "verify" && state.last) {
            const { actor, value, correct } = state.last;
            const nm = state.players[actor].name;
            fbEl.textContent = correct
                ? nm + ": " + value + " — correct. Total " + state.answer + " cubes."
                : nm + ": " + value + " — off by " + Math.abs(value - state.answer) +
                ". Total " + state.answer + " cubes.";
            fbEl.className = "cc-feedback " + (correct ? "good" : "bad");
        } else {
            fbEl.textContent = "";
            fbEl.className = "cc-feedback";
        }
        if (state.phase === "over") statusEl.textContent = "Game over";
        else if (state.phase === "verify") statusEl.textContent = "Verify the count";
        else
            statusEl.textContent =
                state.turn === me ? "Your turn" : state.players[state.turn].name + " is counting…";

        overEl.hidden = state.phase !== "over";
        if (state.phase === "over") {
            const w = state.winner;
            overTitleEl.textContent =
                w === -1 ? "Draw" : w === me ? "You win!" : state.players[w].name + " wins";
            const [a, b] = state.players;
            overReasonEl.textContent =
                a.name + " " + a.score + " — " + b.score + " " + b.name +
                (state.endReason === "lives" ? " · out of lives" : "");
        }
    }

    function publish() {
        render();
        scheduleBot();
        if (online && room.isHost) room.publishState(state).catch(console.warn);
    }

    /* ---------------- canonical actions (host only mutates) ---------------- */
    function applyAction(action, actor) {
        if (!state || !action || typeof action !== "object") return;
        if (action.type === "answer") {
            if (state.phase !== "play" || actor !== state.turn) return;
            const v = Number(action.value);
            if (!Number.isInteger(v) || v < 0 || v > 999) return;
            const correct = v === state.answer;
            const p = state.players[actor];
            if (correct) p.score++;
            else p.lives = Math.max(0, p.lives - 1);
            state.last = { actor, value: v, correct };
            state.phase = "verify"; /* wireframe gate: never auto-advance */
        } else if (action.type === "next") {
            if (state.phase !== "verify") return;
            const dead = state.players.findIndex((p) => p.lives <= 0);
            if (dead !== -1) {
                state.winner = 1 - dead;
                state.endReason = "lives";
                state.phase = "over";
            } else if (state.round >= ROUNDS) {
                const [a, b] = state.players;
                state.winner = a.score === b.score ? -1 : a.score > b.score ? 0 : 1;
                state.endReason = "rounds";
                state.phase = "over";
            } else {
                state.round++;
                state.turn = (state.starter + state.round - 1) % 2;
                const cfg = roundCfg(state.round - 1);
                state.n = cfg.n;
                state.heights = makeHeights(cfg.n, cfg.maxH);
                state.answer = total(state.heights);
                state.last = null;
                state.phase = "play";
            }
        } else if (action.type === "restart") {
            state = freshState(); /* re-rolls starter + seats */
        } else return;
        publish();
    }

    function submitAction(action) {
        if (online && !room.isHost) {
            room.sendAction(action).catch(console.warn);
            return;
        }
        applyAction(action, mySeat());
    }

    /* ---------------- bot (AI mode only) ---------------- */
    function scheduleBot() {
        if (online || !state) return;
        if (botTimer) {
            clearTimeout(botTimer);
            botTimer = null;
        }
        if (state.phase !== "play" || state.turn !== 1) return;
        botTimer = setTimeout(() => {
            botTimer = null;
            if (!state || state.phase !== "play" || state.turn !== 1) return;
            let guess;
            if (!cheats.botBlunder && Math.random() < 0.7) guess = state.answer;
            else {
                const d = rnd(1, 3) * (Math.random() < 0.5 ? -1 : 1);
                guess = Math.min(999, Math.max(0, state.answer + d));
                if (guess === state.answer) guess = Math.min(999, guess + 1);
            }
            applyAction({ type: "answer", value: guess }, 1);
        }, rnd(1200, 2400));
    }

    /* ---------------- local controls ---------------- */
    function rotate(dir) {
        if (!state || state.phase === "over") return;
        viewRot = (viewRot + dir + 4) % 4;
        render(); /* view-only: never published, answer unchanged */
    }
    function check() {
        if (!canPlay() || inputEl.value === "") return;
        submitAction({ type: "answer", value: parseInt(inputEl.value, 10) });
    }
    function advanceOrCheck() {
        if (!state) return;
        if (state.phase === "verify") submitAction({ type: "next" });
        else if (state.phase === "over") submitAction({ type: "restart" });
        else check();
    }
    function pressKey(k) {
        if (!canPlay()) return;
        if (k >= "0" && k <= "9") {
            if (inputEl.value.length < 3) inputEl.value += k;
        } else if (k === "C") inputEl.value = "";
        else if (k === "OK") check();
    }
    function buildPad() {
        padEl.innerHTML = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "C", "0", "OK"]
            .map(
                (k) =>
                    '<button type="button" class="cc-key" data-k="' + k + '" disabled>' + k + "</button>",
            )
            .join("");
    }

    /* ---------------- events ---------------- */
    function handleClick(event) {
        if (event.target.closest("[data-exit]")) {
            onExit();
            return;
        }
        const sw = event.target.closest("[data-cheat]");
        if (sw) {
            const k = sw.dataset.cheat;
            cheats[k] = !cheats[k];
            sw.setAttribute("aria-pressed", String(cheats[k]));
            render();
            return;
        }
        const btn = event.target.closest("[data-act]");
        if (!btn) return;
        const a = btn.dataset.act;
        if (a === "rotate") rotate(1);
        else if (a === "cheats") cheatsEl.hidden = false;
        else if (a === "close-cheats") cheatsEl.hidden = true;
        else if (a === "autofill") {
            if (canPlay()) {
                inputEl.value = String(state.answer);
                inputEl.focus();
            }
        } else if (a === "submit") check();
        else if (a === "next") submitAction({ type: "next" });
        else if (a === "restart") {
            cheatsEl.hidden = true;
            submitAction({ type: "restart" });
        }
    }
    function onPad(e) {
        const k = e.target.closest(".cc-key");
        if (!k || k.disabled) return;
        e.preventDefault();
        pressKey(k.dataset.k);
    }
    function onInput() {
        inputEl.value = inputEl.value.replace(/[^0-9]/g, "").slice(0, 3);
    }
    function onKey(e) {
        if (!root.isConnected) return;
        if (e.key === "Escape") {
            cheatsEl.hidden = true;
            return;
        }
        if (!cheatsEl.hidden) return;
        if (e.target === inputEl) {
            if (e.key === "Enter") {
                e.preventDefault();
                advanceOrCheck();
            }
            return; /* digits/backspace handled natively by the input */
        }
        if (e.target && (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA")) return;
        if (e.key >= "0" && e.key <= "9") pressKey(e.key);
        else if (e.key === "Backspace") {
            e.preventDefault();
            if (canPlay()) inputEl.value = inputEl.value.slice(0, -1);
        } else if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            advanceOrCheck();
        } else if (e.key === "r" || e.key === "R") rotate(1);
        else if (e.key === "c" || e.key === "C") {
            if (canPlay()) inputEl.value = "";
        }
    }
    /* mouse: drag + wheel rotation on the scene */
    let dragX = null,
        dragAcc = 0,
        wheelAt = 0;
    function onSceneDown(e) {
        dragX = e.clientX;
        dragAcc = 0;
        if (sceneEl.setPointerCapture) sceneEl.setPointerCapture(e.pointerId);
    }
    function onSceneMove(e) {
        if (dragX === null) return;
        dragAcc += e.clientX - dragX;
        dragX = e.clientX;
        while (dragAcc >= 60) { dragAcc -= 60; rotate(1); }
        while (dragAcc <= -60) { dragAcc += 60; rotate(-1); }
    }
    function onSceneUp() { dragX = null; }
    function onWheel(e) {
        e.preventDefault();
        const now = Date.now();
        if (now - wheelAt < 160) return;
        wheelAt = now;
        rotate(e.deltaY > 0 ? 1 : -1);
    }

    root.addEventListener("click", handleClick);
    padEl.addEventListener("pointerdown", onPad);
    inputEl.addEventListener("input", onInput);
    document.addEventListener("keydown", onKey);
    sceneEl.addEventListener("pointerdown", onSceneDown);
    sceneEl.addEventListener("pointermove", onSceneMove);
    sceneEl.addEventListener("pointerup", onSceneUp);
    sceneEl.addEventListener("pointercancel", onSceneUp);
    sceneEl.addEventListener("wheel", onWheel, { passive: false });

    /* ---------------- boot: local / host / guest ---------------- */
    buildPad();
    if (online) {
        unsubs.push(room.onRoom((nextRoom) => { roomData = nextRoom; render(); }));
        if (room.isHost) {
            state = freshState();
            publish();
            unsubs.push(room.onAction((action) => applyAction(action, 1 - state.hostSeat)));
        } else {
            render();
            unsubs.push(room.onState((nextState) => { state = nextState; render(); }));
        }
    } else {
        state = freshState();
        publish();
    }

    return {
        destroy() {
            root.removeEventListener("click", handleClick);
            padEl.removeEventListener("pointerdown", onPad);
            inputEl.removeEventListener("input", onInput);
            document.removeEventListener("keydown", onKey);
            sceneEl.removeEventListener("pointerdown", onSceneDown);
            sceneEl.removeEventListener("pointermove", onSceneMove);
            sceneEl.removeEventListener("pointerup", onSceneUp);
            sceneEl.removeEventListener("pointercancel", onSceneUp);
            sceneEl.removeEventListener("wheel", onWheel);
            if (botTimer) clearTimeout(botTimer);
            unsubs.forEach((u) => { try { if (typeof u === "function") u(); } catch (_) { } });
        },
    };
}