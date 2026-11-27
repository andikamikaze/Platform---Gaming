/* ==== GAME: dice-roller.js ==== */
/*
 * Dice Roller — duel dadu bergiliran (You vs Bot / Player 1 vs Player 2).
 * Setelah mengubah file ini, jalankan: node tools/build-games-manifest.mjs
 */

import { iconSVG } from "../JS/icons.js";

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

    /* ---------------- local UI state ---------------- */
    let cheatOpen = false;
    let helpOpen = false;
    let paused = false;
    let destroyed = false;

    /* panduan internal sekali per game (global how-to tidak dipakai) */
    let seenHelp = true;
    try { seenHelp = localStorage.getItem("diceRollerHelpSeen") === "1"; } catch (err) { seenHelp = true; }
    if (!seenHelp) {
        helpOpen = true;
        try { localStorage.setItem("diceRollerHelpSeen", "1"); } catch (err) { /* storage blocked */ }
    }

    /* ---------------- shell: HUD + fill-height board + overlay modal ---------------- */
    root.innerHTML = `
<style>
.dd-app{--line:#ffffff14;--mut:#9ca3af;--ink:#e5e7eb;--acc:#818cf8;display:flex;flex-direction:column;gap:10px;min-width:0;min-height:100%;color:#e5e7eb}
.dd-app [hidden]{display:none!important}
/* HUD bar */
.dd-app .dd-hud{display:flex;align-items:center;gap:8px;flex-wrap:wrap;font:600 11px/1 ui-monospace,SFMono-Regular,Menlo,monospace}
.dd-app .dd-chip{display:inline-flex;align-items:center;gap:6px;padding:6px 9px;border:1px solid var(--line);border-radius:999px;background:#ffffff06;color:var(--mut);white-space:nowrap}
.dd-app .dd-chip b{color:var(--ink);font-weight:700;font-variant-numeric:tabular-nums}
.dd-app .dd-status i{width:6px;height:6px;border-radius:50%;background:#34d399;flex:none}
.dd-app .dd-chip[data-hud="flags"]{color:#fcd34d;border-color:#fcd34d55}
.dd-app .dd-spacer{flex:1 1 auto}
.dd-app .dd-callset{display:flex;align-items:center;gap:4px}
.dd-app .dd-num{min-width:30px;height:30px;padding:0;border-radius:7px;border:1px solid #ffffff1c;background:transparent;color:#9ca3af;font-size:12px;font-weight:700;cursor:pointer;font-variant-numeric:tabular-nums;transition:background .15s ease,color .15s ease,border-color .15s ease}
.dd-app .dd-num.on{background:#6366f1;border-color:#818cf8;color:#fff}
.dd-app .dd-num:disabled{opacity:.4;cursor:default}
.dd-app .dd-roll{min-height:32px;padding:0 14px;border-radius:8px;border:1px solid #818cf8;background:#6366f1;color:#fff;font-size:10px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;cursor:pointer;transition:opacity .15s ease,transform .08s ease}
.dd-app .dd-roll:active{transform:translateY(1px)}
.dd-app .dd-roll:disabled{opacity:.35;cursor:default;border-color:#ffffff22;background:#ffffff10;color:#9ca3af}
.dd-app .dd-btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;min-height:32px;padding:6px 10px;border:1px solid var(--line);border-radius:9px;background:#ffffff10;color:#e5e7eb;font-size:10px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;cursor:pointer;white-space:nowrap}
.dd-app .dd-btn:hover{border-color:var(--acc);color:#fff}
.dd-app .dd-btn.on{border-color:#fcd34d;color:#fcd34d;background:#fcd34d12}
.dd-app .dd-btn svg{flex:none;display:block}
.dd-app .dd-btn:disabled{opacity:.4;cursor:default}
/* board = arena + overlays */
.dd-app .dd-panel{position:relative;display:flex;flex-direction:column;align-items:center;justify-content:space-evenly;gap:12px;padding:16px 12px;min-width:0;overflow:hidden;border-color:var(--line);background:#0f1424}
.dd-app .dd-score{display:grid;grid-template-columns:1fr 1fr;gap:12px;width:100%;max-width:520px;flex:none}
.dd-app .dd-seat{display:flex;flex-direction:column;gap:8px;padding:12px 14px;border:1px solid var(--line);border-radius:12px;background:#ffffff06;min-width:0;transition:border-color .16s ease,background .16s ease}
.dd-app .dd-seat.on{border-color:#818cf8;background:#6366f11f}
.dd-app .dd-seat-top{display:flex;align-items:baseline;justify-content:space-between;gap:8px;min-width:0}
.dd-app .dd-seat-name{font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#9ca3af;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.dd-app .dd-seat.on .dd-seat-name{color:#c7d2fe}
.dd-app .dd-seat-left{font-size:11px;color:#6b7280;font-variant-numeric:tabular-nums;white-space:nowrap}
.dd-app .dd-seat-score{font-size:28px;font-weight:800;line-height:1;color:#e5e7eb;font-variant-numeric:tabular-nums}
.dd-app .dd-seat-score small{font-size:12px;font-weight:600;color:#6b7280}
.dd-app .dd-bar{height:4px;border-radius:99px;background:#ffffff12;overflow:hidden}
.dd-app .dd-bar i{display:block;height:100%;width:0;background:#6366f1;border-radius:99px;transition:width .2s ease}
.dd-app .dd-rolled{font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:#6b7280;min-height:14px;text-align:center}
.dd-app .dd-dice{display:flex;gap:12px;flex-wrap:wrap;justify-content:center;min-height:52px;max-width:100%}
.dd-app .dd-die{width:52px;height:52px;flex:none}
.dd-app .dd-die svg{display:block;width:100%;height:100%}
.dd-app .dd-die-bg{fill:#f8fafc;stroke:#94a3b8;stroke-width:2}
.dd-app .dd-pip{fill:#1e293b}
.dd-app .dd-die.rolling{animation:ddTumble .22s linear infinite}
.dd-app .dd-result{display:flex;align-items:baseline;justify-content:center;gap:12px;min-height:32px;flex-wrap:wrap}
.dd-app .dd-total{font-size:28px;font-weight:800;color:#a5b4fc;line-height:1;font-variant-numeric:tabular-nums}
.dd-app .dd-bonus{font-size:11.5px;font-weight:700;color:#fcd34d;border:1px solid #fcd34d33;border-radius:999px;padding:4px 10px}
/* overlays (help / cheats / pause / result) */
.dd-app .dd-ov{position:absolute;inset:0;z-index:6;display:flex;align-items:center;justify-content:center;background:#0b0e1ac9;backdrop-filter:blur(3px);border-radius:inherit;padding:16px}
.dd-app .dd-card{display:flex;flex-direction:column;align-items:stretch;gap:12px;width:100%;max-width:340px;padding:18px;border:1px solid #ffffff16;border-radius:12px;background:#131725;text-align:center;max-height:100%;overflow:hidden}
.dd-app .dd-head{flex:none;display:flex;align-items:center;justify-content:space-between;gap:10px}
.dd-app .dd-head h3{margin:0;font-size:19px;font-weight:800;color:#e5e7eb}
.dd-app .dd-head h3.win{color:#86efac}
.dd-app .dd-head h3.lose{color:#fca5a5}
.dd-app .dd-body,.dd-app .dd-cheats,.dd-app .dd-help{flex:1 1 auto;min-height:0;overflow:auto}
.dd-app .dd-body p{margin:0;font-size:12.5px;color:#9ca3af;line-height:1.5;font-variant-numeric:tabular-nums}
.dd-app .dd-foot{flex:none;display:flex;align-items:center;justify-content:flex-end;gap:8px;flex-wrap:wrap;padding-top:10px;border-top:1px solid var(--line)}
.dd-app .dd-note{margin-right:auto;font-size:10px;color:#6b7280;line-height:1.4}
.dd-app .dd-card .dd-btn{min-height:44px;padding:0 18px;font-size:12px}
.dd-app .dd-card .dd-btn.primary{background:#6366f1;border-color:#818cf8;color:#fff}
.dd-app .dd-cheats{display:grid;grid-template-columns:1fr 1fr;gap:8px;text-align:left}
.dd-app .dd-cheat{min-height:44px;padding:8px 10px;border-radius:9px;border:1px solid #ffffff1c;background:#ffffff0a;color:#e5e7eb;font-size:11px;font-weight:700;cursor:pointer}
.dd-app .dd-cheat:hover{border-color:var(--acc)}
.dd-app .dd-cheat.on{border-color:#fcd34d;color:#fcd34d;background:#fcd34d12}
.dd-app .dd-cheat:disabled{opacity:.4;cursor:default}
.dd-app .dd-help{display:grid;grid-template-columns:repeat(auto-fit,minmax(175px,1fr));gap:14px;text-align:left}
.dd-app .dd-help b{display:block;margin-bottom:6px;font-size:10px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:#a5b4fc}
.dd-app .dd-help ul{margin:0 0 12px;padding-left:16px;font-size:11px;line-height:1.65;color:#9ca3af}
.dd-app kbd{display:inline-block;padding:1px 5px;border:1px solid #ffffff26;border-bottom-width:2px;border-radius:5px;background:#ffffff0a;color:#e5e7eb;font:inherit}
.dd-app button:focus-visible{outline:2px solid #a5b4fc;outline-offset:2px}
@keyframes ddTumble{0%{transform:rotate(0) translateY(0)}25%{transform:rotate(-10deg) translateY(-6px)}50%{transform:rotate(7deg) translateY(-3px)}75%{transform:rotate(-5deg) translateY(-7px)}100%{transform:rotate(0) translateY(0)}}
@media (prefers-reduced-motion:reduce){.dd-app .dd-die.rolling{animation:none}.dd-app .dd-bar i,.dd-app .dd-num,.dd-app .dd-roll,.dd-app .dd-seat{transition:none}}
/* --- layout overrides (keep last: beat pointer:coarse min-height:44px) --- */
.dd-app.game-fill > .dd-panel{flex:1 1 auto;min-height:0;aspect-ratio:auto}
@media (pointer:coarse){.dd-app button:not(:disabled){min-height:44px}}
@media (max-width:640px){
.dd-app.game-fill > .dd-panel:not(:has(.dd-ov:not([hidden]))){flex:1 1 auto;min-height:0;aspect-ratio:auto}
.dd-app.game-fill > .dd-panel:has(.dd-ov:not([hidden])){flex:0 0 auto;min-height:min(70dvh,620px);aspect-ratio:auto}
.dd-app .dd-hud{gap:5px}
.dd-app .dd-hud .dd-chip{padding:4px 6px;font-size:9px}
.dd-app .dd-hud .dd-chip[data-hud="first"],.dd-app .dd-hud .dd-chip[data-hud="mode"],.dd-app .dd-hud .dd-chip[data-hud="left-chip"]{display:none}
.dd-app .dd-hud .dd-btn{min-height:30px;padding:4px 6px;font-size:9px}
.dd-app .dd-hud .dd-btn-label,.dd-app .dd-spacer{display:none}
.dd-app .dd-hud .dd-num{min-width:24px;height:28px;font-size:11px}
.dd-app .dd-hud .dd-callset{gap:4px}
.dd-app .dd-hud .dd-status span{display:none}
.dd-app .dd-hud .dd-roll{min-height:30px;padding:0 10px;font-size:9px}
.dd-app .dd-panel{padding:12px 8px;gap:10px}
.dd-app .dd-die{width:44px;height:44px}
.dd-app .dd-dice{gap:8px}
.dd-app .dd-seat-score{font-size:24px}
.dd-app .dd-ov{padding:8px}
.dd-app .dd-card{width:100%;height:100%;max-height:100%;padding:12px;border-radius:12px}
.dd-app .dd-body,.dd-app .dd-cheats,.dd-app .dd-help{scrollbar-width:none}
.dd-app .dd-body::-webkit-scrollbar,.dd-app .dd-cheats::-webkit-scrollbar,.dd-app .dd-help::-webkit-scrollbar{display:none}
.dd-app .dd-note{display:none}
}
</style>
<div class="game-app dd-app game-fill" data-dd>
  <div class="dd-hud">
    <span class="dd-chip dd-status"><i></i><span data-status>Ready</span></span>
    <span class="dd-chip">YOU <b data-hud="you">0/${TARGET}</b></span>
    <span class="dd-chip"><span data-hud="rival-label">BOT</span> <b data-hud="rival">0/${TARGET}</b></span>
    <span class="dd-chip" data-hud="left-chip">LEFT <b data-hud="left">${MAX_ROLLS}</b></span>
    <span class="dd-chip" data-hud="first">FIRST —</span>
    <span class="dd-chip" data-hud="mode">vs Bot</span>
    <span class="dd-chip" data-hud="flags" hidden></span>
    <span class="dd-spacer"></span>
    <div class="dd-callset" data-chips role="group" aria-label="Choose dice count"></div>
    <button class="dd-roll" type="button" data-act="roll">Roll</button>
    <button class="dd-btn dd-icon-btn" type="button" data-help aria-label="How to play" title="How to play (H)">${iconSVG("helpCircle", { size: 14 })}<span class="dd-btn-label">Help</span></button>
    <button class="dd-btn dd-icon-btn" type="button" data-cheats aria-label="Cheats" title="Cheats (C)">${iconSVG("wrench", { size: 14 })}<span class="dd-btn-label">Cheats</span></button>
    <button class="dd-btn dd-icon-btn" type="button" data-pause aria-label="Pause" title="Pause (P)"><span class="dd-icon">${iconSVG("pause", { size: 14 })}</span><span class="dd-btn-label">Pause</span></button>
    <button class="dd-btn dd-icon-btn" type="button" data-act="restart" aria-label="Restart" title="Restart (R)">${iconSVG("refresh", { size: 14 })}<span class="dd-btn-label">Restart</span></button>
    <button class="dd-btn dd-icon-btn" type="button" data-exit aria-label="Exit game" title="Exit game">${iconSVG("logOut", { size: 14 })}<span class="dd-btn-label">Exit game</span></button>
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
    <div class="dd-rolled" data-rolled></div>
    <div class="dd-dice" data-dice></div>
    <div class="dd-result" data-result hidden>
      <span class="dd-total" data-total></span>
      <span class="dd-bonus" data-bonus hidden></span>
    </div>
    <div class="dd-ov" data-ov="over" hidden>
      <div class="dd-card">
        <div class="dd-head"><h3 data-ovtitle></h3></div>
        <div class="dd-body"><p data-ovsub></p></div>
        <div class="dd-foot"><span class="dd-note">R to restart</span><button class="dd-btn primary" type="button" data-act="restart">Play again</button></div>
      </div>
    </div>
    <div class="dd-ov" data-ov="pause" hidden>
      <div class="dd-card">
        <div class="dd-head"><h3>Paused</h3></div>
        <div class="dd-body"><p>Timers, bot moves and the dice animation are frozen.</p></div>
        <div class="dd-foot"><span class="dd-note">P or Esc to resume</span><button class="dd-btn primary" type="button" data-act="resume">Resume</button></div>
      </div>
    </div>
    <div class="dd-ov" data-ov="cheat" hidden>
      <div class="dd-card">
        <div class="dd-head"><h3>Cheats</h3><button class="dd-btn" type="button" data-act="cheats-close" aria-label="Close cheats">Close</button></div>
        <div class="dd-cheats">
          <button class="dd-cheat" type="button" data-cheat="points">+25 points</button>
          <button class="dd-cheat" type="button" data-cheat="rolls">+3 rolls</button>
          <button class="dd-cheat" type="button" data-cheat="lucky">Lucky roll</button>
          <button class="dd-cheat" type="button" data-cheat="skip">Skip bot</button>
        </div>
        <div class="dd-foot"><span class="dd-note">C to close</span><button class="dd-btn primary" type="button" data-act="cheats-close">Done</button></div>
      </div>
    </div>
    <div class="dd-ov" data-ov="help" hidden>
      <div class="dd-card">
        <div class="dd-head"><h3>How to play</h3><button class="dd-btn" type="button" data-act="help-close" aria-label="Close help">Close</button></div>
        <div class="dd-help">
          <div>
            <b>Desktop</b>
            <ul>
              <li><kbd>1</kbd>–<kbd>6</kbd> choose how many dice to roll.</li>
              <li><kbd>Space</kbd> / <kbd>Enter</kbd> roll · <kbd>R</kbd> restart.</li>
              <li><kbd>H</kbd> help · <kbd>C</kbd> cheats · <kbd>P</kbd> / <kbd>Esc</kbd> pause.</li>
            </ul>
            <b>Mobile</b>
            <ul>
              <li>Tap a number in the HUD, then tap Roll.</li>
            </ul>
          </div>
          <div>
            <b>Rules</b>
            <ul>
              <li>First to 250 points wins; each player gets 15 rolls.</li>
              <li>Bonuses: N of a kind = 50 × N, straight 1–N = 40, three pairs = 30.</li>
              <li>A coin flip decides who starts; turns alternate.</li>
              <li>Cheats are available in solo mode only.</li>
            </ul>
          </div>
        </div>
        <div class="dd-foot"><span class="dd-note">Press H to reopen this guide</span><button class="dd-btn primary" type="button" data-act="help-close">Got it</button></div>
      </div>
    </div>
  </section>
</div>`;

    /* ---------------- refs ---------------- */
    const $ = (s) => root.querySelector(s);
    const statusEl = $("[data-status]");
    const diceBox = $("[data-dice]");
    const rolledEl = $("[data-rolled]");
    const resultBox = $("[data-result]");
    const totalEl = $("[data-total]");
    const bonusEl = $("[data-bonus]");
    const chipsBox = $("[data-chips]");
    const rollBtn = $('[data-act="roll"]');
    const overOv = $('[data-ov="over"]');
    const cheatOv = $('[data-ov="cheat"]');
    const pauseOv = $('[data-ov="pause"]');
    const helpOv = $('[data-ov="help"]');
    const ovTitle = $("[data-ovtitle]");
    const ovSub = $("[data-ovsub]");
    const pauseBtn = $("[data-pause]");
    const cheatBtns = [...root.querySelectorAll("[data-cheat]")];
    const hud = {
        you: $('[data-hud="you"]'),
        rival: $('[data-hud="rival"]'),
        rivalLabel: $('[data-hud="rival-label"]'),
        left: $('[data-hud="left"]'),
        first: $('[data-hud="first"]'),
        mode: $('[data-hud="mode"]'),
        flags: $('[data-hud="flags"]'),
    };
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
        c.className = "dd-num";
        c.textContent = String(n);
        c.dataset.n = String(n);
        c.setAttribute("aria-label", n + (n === 1 ? " die" : " dice"));
        chipsBox.appendChild(c);
        chipEls.push(c);
    }

    /* ---------------- state ---------------- */
    let state = null;
    let shownLastId = 0, animId = 0, booted = false, rolling = false, gen = 0;
    let botTimer = null;
    const youName = (playerName && String(playerName).trim()) || "You";

    /* timer sadar-pause: semua deadline memakai anchor Date.now() yang digeser
       saat resume sehingga bot/animasi tidak loncat setelah freeze. */
    const timers = new Set();
    let freezeAt = 0;
    function later(fn, ms) {
        const rec = { fn, due: (freezeAt || Date.now()) + ms, id: 0 };
        rec.arm = () => {
            rec.id = setTimeout(() => {
                rec.id = 0;
                if (freezeAt) return;
                timers.delete(rec);
                if (!destroyed) fn();
            }, Math.max(0, rec.due - Date.now()));
        };
        timers.add(rec);
        if (!freezeAt) rec.arm();
        return rec;
    }
    function cancelLater(rec) {
        if (!rec) return;
        if (rec.id) clearTimeout(rec.id);
        rec.id = 0;
        timers.delete(rec);
    }
    function clearTimers() {
        timers.forEach((rec) => {
            if (rec.id) clearTimeout(rec.id);
            rec.id = 0;
        });
        timers.clear();
    }
    function cancelBot() {
        if (botTimer) { cancelLater(botTimer); botTimer = null; }
    }
    function frozen() { return paused || helpOpen || cheatOpen || destroyed; }
    function freezeTimers() {
        if (freezeAt) return;
        freezeAt = Date.now();
        timers.forEach((rec) => { if (rec.id) { clearTimeout(rec.id); rec.id = 0; } });
    }
    function thawTimers() {
        if (!freezeAt) return;
        const shift = Date.now() - freezeAt;
        freezeAt = 0;
        timers.forEach((rec) => { rec.due += shift; rec.arm(); });
    }
    function syncFreeze() {
        if (frozen()) freezeTimers();
        else thawTimers();
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
        return !!state && state.phase === "play" && !rolling && !frozen() &&
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
        if (frozen() || online || !state || state.phase !== "play" || state.turn !== 1 || rolling) return;
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

        hud.you.textContent = (st ? st.scores[0] : 0) + "/" + TARGET;
        hud.rival.textContent = (st ? st.scores[1] : 0) + "/" + TARGET;
        hud.rivalLabel.textContent = online ? "P" + (me === 0 ? 2 : 1) : "BOT";
        hud.left.textContent = st && me != null ? String(st.left[me]) : "–";
        hud.first.textContent = "FIRST " + (st && me != null
            ? (st.first === me ? "YOU" : seatName(st.first)) : "—");
        hud.mode.textContent = online
            ? "Online · you are " + (me != null ? seatName(me) : "…") : "vs Bot";
        const flags = st && !online
            ? (st.lucky ? "LUCKY" : "") + (st.lucky && st.skipBot ? " · " : "") + (st.skipBot ? "BOT SKIP" : "")
            : "";
        hud.flags.textContent = flags;
        hud.flags.hidden = !flags;

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

        statusEl.textContent = paused ? "Paused" : !st ? "Connecting…"
            : st.phase === "over" ? winnerText()
                : rolling ? seatName(st.last.seat) + " rolling…"
                    : st.turn === me ? "Your turn" : seatName(st.turn) + "'s turn";

        const showOver = !!st && st.phase === "over" && !rolling;
        overOv.hidden = !showOver || helpOpen || cheatOpen || paused;
        if (showOver) {
            ovTitle.textContent = winnerText();
            ovTitle.className = st.winner === "draw" ? "" : (st.winner === me ? "win" : "lose");
            ovSub.textContent = seatName(0) + " " + st.scores[0] + " — " + st.scores[1] + " " + seatName(1);
        }
        pauseOv.hidden = !paused || helpOpen || cheatOpen;
        cheatOv.hidden = online || !cheatOpen || helpOpen;
        helpOv.hidden = !helpOpen;
        cheatBtns.forEach((b) => { b.disabled = !st || st.phase !== "play" || frozen(); });

        const cbtn = root.querySelector("[data-cheats]");
        if (cbtn) {
            const active = st && !online
                ? (st.lucky ? 1 : 0) + (st.skipBot ? 1 : 0) : 0;
            cbtn.classList.toggle("on", active > 0);
            const label = cbtn.querySelector(".dd-btn-label");
            if (label) label.textContent = active > 0 ? "Cheats " + active : "Cheats";
            cbtn.disabled = online;
        }
        if (pauseBtn) {
            const label = pauseBtn.querySelector(".dd-btn-label");
            if (label) label.textContent = paused ? "Resume" : "Pause";
            const icon = pauseBtn.querySelector(".dd-icon");
            if (icon) icon.innerHTML = iconSVG(paused ? "play" : "pause", { size: 14 });
            pauseBtn.setAttribute("aria-label", paused ? "Resume" : "Pause");
            pauseBtn.setAttribute("title", paused ? "Resume (P)" : "Pause (P)");
            pauseBtn.disabled = online;
        }
        if (!frozen()) scheduleBot();
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

    /* ---------------- UI toggles ---------------- */
    function toggleHelp(on) {
        helpOpen = typeof on === "boolean" ? on : !helpOpen;
        if (helpOpen) cheatOpen = false;
        syncFreeze();
        render();
    }
    function toggleCheats(on) {
        if (online) return;
        cheatOpen = typeof on === "boolean" ? on : !cheatOpen;
        if (cheatOpen) helpOpen = false;
        syncFreeze();
        render();
    }
    function togglePause(on) {
        if (online) return;
        paused = typeof on === "boolean" ? on : !paused;
        syncFreeze();
        render();
    }
    function restartGame() {
        paused = false;
        helpOpen = false;
        cheatOpen = false;
        syncFreeze();
        submitAction({ type: "restart" });
    }

    /* ---------------- input: mouse / tap ---------------- */
    function handleClick(event) {
        if (destroyed) return;
        const t = event.target;
        if (!t || !t.closest) return;
        if (t.closest("[data-help]")) { toggleHelp(); return; }
        if (t.closest("[data-act='help-close']")) { toggleHelp(false); return; }
        if (t.closest("[data-exit]")) { onExit(); return; }
        if (t.closest("[data-cheats]")) { toggleCheats(); return; }
        if (t.closest("[data-act='cheats-close']")) { toggleCheats(false); return; }
        if (t.closest("[data-pause]")) { togglePause(); return; }
        if (t === cheatOv) { toggleCheats(false); return; }
        if (t === helpOv) { toggleHelp(false); return; }
        const chip = t.closest(".dd-num");
        if (chip && !chip.disabled) { tryCount(+chip.dataset.n); return; }
        const cheat = t.closest("[data-cheat]");
        if (cheat && !cheat.disabled && !frozen()) { submitAction({ type: "cheat", kind: cheat.dataset.cheat }); return; }
        const b = t.closest("[data-act]");
        if (!b || b.disabled) return;
        const act = b.dataset.act;
        if (act === "roll") tryRoll();
        else if (act === "restart") restartGame();
        else if (act === "resume") togglePause(false);
    }
    root.addEventListener("click", handleClick);

    /* ---------------- input: keyboard (desktop) ---------------- */
    function onKey(e) {
        if (!root.isConnected || destroyed) return;
        if (e.ctrlKey || e.metaKey || e.altKey) return;
        const t = e.target;
        if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
        const code = e.code || "";
        const k = (e.key || "").toLowerCase();
        if (e.repeat) return;

        /* prioritas UI: help → cheats → pause/Escape → restart → aksi game */
        if (code === "KeyH" || k === "h") { toggleHelp(); e.preventDefault(); return; }
        if (code === "KeyC" || k === "c") { if (!helpOpen) toggleCheats(); e.preventDefault(); return; }
        if (code === "KeyP" || code === "Escape" || k === "p" || k === "escape") {
            if (helpOpen) toggleHelp(false);
            else if (cheatOpen) toggleCheats(false);
            else if (!online) togglePause();
            e.preventDefault(); return;
        }
        if (code === "KeyR" || k === "r") { if (state) restartGame(); e.preventDefault(); return; }
        if (helpOpen || cheatOpen || paused || !state) return;
        if (code === "Space" || code === "Enter") {
            if (t && t.closest && t.closest("button")) return; // tombol ter-focus menangani sendiri
            e.preventDefault();
            tryRoll();
        } else if (/^(Digit|Numpad)[1-6]$/.test(code)) {
            tryCount(+code.slice(-1));
        }
    }
    document.addEventListener("keydown", onKey);

    /* ---------------- wiring mode ---------------- */
    const offs = [];
    syncFreeze();
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
            destroyed = true;
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
