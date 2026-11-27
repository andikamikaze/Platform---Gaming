/* ==== GAME: snakes-and-ladders.js ==== */
/* =====================================================================
   SNAKES AND LADDERS — 10x10 race vs AI / online room
   Template: export META + mount(root, context)
   Setelah edit: node tools/build-games-manifest.mjs
===================================================================== */

import { iconSVG } from "../JS/icons.js";

export const META = {
    id: "snakes-and-ladders", // harus sama dengan nama file (tanpa .js)
    name: "Snakes and Ladders",
    category: "board",
    catLabel: "Board",
    desc: "Race to 100 on a random, always-solvable board. Ladders lift you, snakes drop you — land exactly on 100. Vs AI or a friend.",
    art: '<svg viewBox="0 0 48 48" width="54" height="54" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 7v20M18 7v20M10 13h8M10 19h8"/><path d="M28 42c9 0 5-9 12-11s6-12-2-14"/><circle cx="38" cy="17" r="2.6" fill="currentColor" stroke="none"/></svg>',
    bg: ["#dcfce7", "#bbf7d0"],
    bestKey: "snlBestRolls",
};

export function mount(root, context = {}) {
    const { mode = "ai", room = null, playerName = "Player", onExit = () => { } } = context;
    const online = mode === "room" && Boolean(room);
    const playerIndex = online && !room.isHost ? 1 : 0;
    let roomData = room?.room || null;
    let state = null;

    /* ---------------- konstanta ---------------- */
    const CELL = 44, M = 8;
    const SVGNS = "http://www.w3.org/2000/svg";
    const COLORS = ["#ef4444", "#3b82f6"];
    const COLOR_NAMES = ["Red", "Blue"];

    // Gaya map = variasi level (jumlah & panjang tangga/ular)
    const STYLES = {
        classic: { label: "Classic", ladders: 6, snakes: 7, mn: 10, mx: 35 },
        climb: { label: "Ladder Rush", ladders: 9, snakes: 4, mn: 14, mx: 42 },
        venom: { label: "Snake Pit", ladders: 4, snakes: 9, mn: 10, mx: 38 },
        chaos: { label: "Chaos", ladders: 8, snakes: 8, mn: 8, mx: 55 },
        giants: { label: "Giant Leaps", ladders: 5, snakes: 5, mn: 30, mx: 70 },
    };

    // Palet papan bervariasi per seed (tetap minimalis)
    const PALS = [
        { alt: "#f6f8fa", line: "#e6ebf1", num: "#94a3b8" },
        { alt: "#f7f6f2", line: "#e9e6dd", num: "#a3a094" },
        { alt: "#f4f8f5", line: "#e2ece5", num: "#8fa79a" },
        { alt: "#f6f5fa", line: "#e7e5f0", num: "#9d97b8" },
    ];
    const SNAKE_COLS = [
        { body: "#63b189", dark: "#2f6b4f" },
        { body: "#8fbf6a", dark: "#4c6b2f" },
        { body: "#5bb3ae", dark: "#2f6b68" },
        { body: "#a9b95c", dark: "#5f6b2f" },
    ];

    // Tempo permainan (default lebih lambat / "Chill"); speed 0.55 = "Fast"
    const T = {
        dice: 1000, diceTick: 100, afterDice: 300,
        hop: 250, preJump: 420, slide: 950, tail: 260,
        aiThink: 1300,
    };

    const PIPS = {
        1: [[32, 32]],
        2: [[21, 21], [43, 43]],
        3: [[21, 21], [32, 32], [43, 43]],
        4: [[21, 21], [43, 21], [21, 43], [43, 43]],
        5: [[21, 21], [43, 21], [32, 32], [21, 43], [43, 43]],
        6: [[21, 18], [43, 18], [21, 32], [43, 32], [21, 46], [43, 46]],
    };

    const CLASSIC = {
        ladders: [[4, 25], [13, 46], [33, 49], [42, 63], [50, 69], [62, 81], [74, 92]],
        snakes: [[27, 5], [40, 3], [43, 18], [54, 31], [66, 45], [76, 58], [89, 53], [99, 41]],
    };

    /* ---------------- util & generator level ---------------- */
    function mulberry32(a) {
        a |= 0;
        return function () {
            a = (a + 0x6d2b79f5) | 0;
            let t = Math.imul(a ^ (a >>> 15), a | 1);
            t = (t + Math.imul(t ^ (t >>> 7), t | 61)) ^ t;
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    }

    const cellXY = (n) => {
        const i = n - 1, r = Math.floor(i / 10);
        let c = i % 10;
        if (r % 2 === 1) c = 9 - c;
        return [M + c * CELL + CELL / 2, M + (9 - r) * CELL + CELL / 2];
    };

    function buildPath(from, v) {
        const target = from + v, path = [];
        for (let n = from + 1; n <= Math.min(target, 100); n++) path.push(n);
        if (target > 100) { const end = 200 - target; for (let n = 99; n >= end; n--) path.push(n); }
        return path;
    }

    // Cek "bisa diselesaikan": dari SELIAP petak, 100 harus reachable
    // (graf semua hasil dadu 1..6 + efek tangga/ular, BFS terbalik dari 100).
    function solvable(ladders, snakes) {
        const jump = new Map();
        for (const [a, b] of ladders) jump.set(a, b);
        for (const [a, b] of snakes) jump.set(a, b);
        const rev = Array.from({ length: 101 }, () => []);
        for (let n = 1; n <= 99; n++) {
            for (let d = 1; d <= 6; d++) {
                let t = n + d;
                if (t > 100) t = 200 - t;
                const f = t === 100 ? 100 : (jump.has(t) ? jump.get(t) : t);
                rev[f].push(n);
            }
        }
        const seen = new Uint8Array(101);
        seen[100] = 1;
        const q = [100];
        while (q.length) { const f = q.pop(); for (const n of rev[f]) if (!seen[n]) { seen[n] = 1; q.push(n); } }
        for (let n = 1; n <= 99; n++) if (!seen[n]) return false;
        return true;
    }

    // Generator map acak dari seed; endpoint unik (tanpa chain), tanpa 6 kepala
    // ular beruntun (selalu ada jalan lolos), lalu divalidasi solvable().
    function genBoard(seed, styleKey) {
        const cfg = STYLES[styleKey] || STYLES.classic;
        for (let attempt = 0; attempt < 60; attempt++) {
            const rnd = mulberry32((seed + attempt * 7919) >>> 0);
            const used = new Set([1, 100]);
            const ladders = [], snakes = [];
            let ok = true;
            const place = (count, isLadder) => {
                for (let i = 0; i < count && ok; i++) {
                    let placed = false;
                    for (let t = 0; t < 160 && !placed; t++) {
                        const len = cfg.mn + Math.floor(rnd() * (cfg.mx - cfg.mn + 1));
                        let a, b;
                        if (isLadder) { a = 2 + Math.floor(rnd() * 87); b = a + len; if (b > 98) continue; }
                        else { b = 2 + Math.floor(rnd() * 87); a = b + len; if (a > 99) continue; }
                        if (used.has(a) || used.has(b)) continue;
                        used.add(a); used.add(b);
                        (isLadder ? ladders : snakes).push([a, b]);
                        placed = true;
                    }
                    if (!placed) ok = false;
                }
            };
            place(cfg.ladders, true);
            if (ok) place(cfg.snakes, false);
            if (!ok) continue;
            const heads = new Set(snakes.map((s) => s[0]));
            let run = 0, blocked = false;
            for (let n = 2; n <= 99; n++) { run = heads.has(n) ? run + 1 : 0; if (run >= 6) { blocked = true; break; } }
            if (blocked) continue;
            if (!solvable(ladders, snakes)) continue;
            return { ladders, snakes };
        }
        return { ladders: CLASSIC.ladders.map((a) => a.slice()), snakes: CLASSIC.snakes.map((a) => a.slice()) };
    }

    function moveDur(lm, speed) {
        let ms = T.dice + T.afterDice + lm.path.length * T.hop + T.tail;
        if (lm.jump) ms += T.preJump + T.slide;
        return Math.round(ms * speed);
    }

    /* ---------------- state lokal (non-canonical) ---------------- */
    let destroyed = false;
    let animT = [];
    let busy = false;              // animasi lokal sedang jalan
    let viewPos = [1, 1];          // posisi yang dirender (animasi), bukan state.pos
    let lastAnimId = null;
    let curGameId = -1;
    let helpOpen = false, cheatOpen = false, winDismissed = false;
    let paused = false, pausedAt = 0, pausedTotal = 0;
    let flowTimer = null, aiTimer = null;
    let bestCountedGame = 0;
    let best = 0;
    try { best = parseInt(localStorage.getItem(META.bestKey) || "0", 10) || 0; } catch { }
    let seenHelp = true;
    try { seenHelp = localStorage.getItem("snakesAndLaddersHelpSeen") === "1"; } catch (_) { seenHelp = true; }
    if (!seenHelp) {
        helpOpen = true;
        try { localStorage.setItem("snakesAndLaddersHelpSeen", "1"); } catch (_) { /* storage blocked */ }
    }

    /* Jam game: berhenti saat pause. Semua timer memakai jam ini agar tidak loncat saat resume. */
    const gameNow = () => (pausedAt || Date.now()) - pausedTotal;
    const timers = new Set();

    function armTimer(rec) {
        if (rec.dead) return;
        const wait = Math.max(0, rec.due - gameNow());
        rec.id = setTimeout(() => {
            rec.id = null;
            if (rec.dead || !timers.has(rec)) return;
            if (paused) return;                              // ditunda sampai resume
            if (rec.due - gameNow() > 1) { armTimer(rec); return; }
            timers.delete(rec);
            if (!destroyed) rec.fn();
        }, wait);
    }
    function cancelTimer(rec) {
        if (!rec) return;
        rec.dead = true;
        if (rec.id) clearTimeout(rec.id);
        timers.delete(rec);
    }
    const later = (fn, ms) => {
        const rec = { fn, due: gameNow() + Math.max(0, ms), id: null, dead: false };
        timers.add(rec);
        if (!paused) armTimer(rec);
        return rec;
    };
    const alater = (fn, ms) => { const rec = later(fn, ms); animT.push(rec); return rec; };
    const clearFlow = () => {
        cancelTimer(flowTimer); flowTimer = null;
        cancelTimer(aiTimer); aiTimer = null;
    };
    function resetClock() {
        paused = false; pausedAt = 0; pausedTotal = 0;
    }
    function setPaused(on) {
        if (paused === on) return;
        if (on) {
            pausedAt = Date.now();
            paused = true;
            timers.forEach((rec) => { if (rec.id) { clearTimeout(rec.id); rec.id = null; } });
        } else {
            pausedTotal += Date.now() - pausedAt;
            pausedAt = 0;
            paused = false;
            timers.forEach((rec) => { if (!rec.id && !rec.dead) armTimer(rec); });
        }
        render();
    }

    /* ---------------- shell / UI minimalis ---------------- */
    const styleOptions = Object.entries(STYLES)
        .map(([k, v]) => `<option value="${k}">${v.label}</option>`)
        .join("");

    root.innerHTML = `
  <style>
/* Snakes & Ladders — HUD bar + fill-height board. */
.snl{--snl-hop:200ms;--snl-slide:950ms;width:100%;max-width:1100px;margin:0 auto;padding:10px 12px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:14px;color:#0f172a;font:14px/1.45 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
.snl *{box-sizing:border-box}
.snl [hidden]{display:none!important}
.snl :is(button,select,input):focus-visible{outline:2px solid #2563eb;outline-offset:2px}
.snl-hud{display:flex;align-items:center;gap:7px;flex-wrap:wrap;margin-bottom:8px;font:600 11px/1 ui-monospace,SFMono-Regular,Menlo,monospace}
.snl-hudinfo,.snl-hudctl{display:flex;align-items:center;gap:7px;flex-wrap:wrap;min-width:0}
.snl-chip{display:inline-flex;align-items:center;gap:6px;padding:5px 9px;border:1px solid #e2e8f0;border-radius:999px;background:#fff;color:#64748b;white-space:nowrap}
.snl-chip b{color:#0f172a;font-weight:700;font-variant-numeric:tabular-nums}
.snl-chip.warn{color:#b45309;border-color:#fde68a;background:#fffbeb}
.snl-dot{width:9px;height:9px;border-radius:50%;display:inline-block;flex:none;background:#cbd5e1}
.snl-dot.on{background:#22c55e;animation:snlPulse 1.6s ease infinite}
@keyframes snlPulse{0%,100%{box-shadow:0 0 0 0 rgba(34,197,94,.35)}50%{box-shadow:0 0 0 5px rgba(34,197,94,0)}}
.snl-die{width:26px;height:26px;flex:none;cursor:pointer;filter:drop-shadow(0 1px 2px rgba(15,23,42,.12))}
.snl-die.rolling{animation:snlShake .16s linear infinite}
@keyframes snlShake{0%{transform:rotate(0)}25%{transform:rotate(-8deg)}75%{transform:rotate(8deg)}100%{transform:rotate(0)}}
.snl-hud select{font:600 10px/1 ui-monospace,monospace;padding:5px 7px;min-height:30px;border:1px solid #d8dfe8;border-radius:8px;background:#fff;color:#334155;max-width:130px}
.snl input[type=number],.snl input[type=text]{font:inherit;font-size:13px;padding:9px 10px;min-height:40px;border:1px solid #d8dfe8;border-radius:9px;background:#fff;color:#0f172a;width:100%}
.snl-row{display:flex;gap:8px;flex-wrap:wrap}
.snl-row>*{flex:1 1 80px}
.snl-spacer{flex:1 1 auto}
.snl-btn{appearance:none;border:1px solid #d8dfe8;background:#fff;color:#0f172a;border-radius:9px;padding:8px 12px;min-height:38px;font:inherit;font-size:11px;font-weight:600;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:6px;transition:background .15s,border-color .15s;touch-action:manipulation;-webkit-tap-highlight-color:transparent}
.snl-btn:hover:not(:disabled){background:#f1f5f9}
.snl-btn:disabled{opacity:.45;cursor:default}
.snl-btn.primary{background:#0f172a;border-color:#0f172a;color:#fff}
.snl-btn.primary:hover:not(:disabled){background:#1e293b}
.snl-btn.danger{color:#b91c1c;border-color:#fecaca}
.snl-icon-btn{display:inline-flex;align-items:center;gap:6px}
.snl-icon-btn svg{flex:none;display:block}
.snl-hud .snl-btn{min-height:32px;padding:6px 10px;font-size:10px}
.snl-btn.on{border-color:#2563eb;color:#2563eb;background:#eff6ff}
.snl-board{position:relative;width:100%;min-width:0;background:#fff;border:1px solid #e2e8f0;border-radius:14px;padding:10px;overflow:hidden;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px}
.snl.game-fill>.snl-board{flex:1 1 auto;min-height:0;aspect-ratio:auto}
.snl-boardsvg{display:block;width:100%;height:100%;min-height:0;flex:1 1 auto;user-select:none;-webkit-tap-highlight-color:transparent;touch-action:manipulation}
.snl-msg{min-height:18px;margin:0;text-align:center;font-size:12px;font-weight:600;color:#334155;flex:none}
.snl-caption{min-height:16px;text-align:center;font-size:11px;color:#94a3b8;flex:none}
.snl kbd{font:700 10px/1 ui-monospace,monospace;border:1px solid #cbd5e1;border-bottom-width:2px;border-radius:5px;padding:2px 5px;background:#fff;color:#64748b}
.snl-ov{position:absolute;inset:0;z-index:40;display:flex;align-items:center;justify-content:center;padding:12px;background:rgba(248,250,252,.85);backdrop-filter:blur(5px);border-radius:14px}
.snl-ovcard{background:#fff;border:1px solid #e2e8f0;border-radius:14px;box-shadow:0 12px 32px rgba(15,23,42,.10);padding:18px;width:100%;max-width:520px;max-height:100%;display:flex;flex-direction:column;overflow:hidden}
.snl-head{display:flex;align-items:center;justify-content:space-between;gap:10px;flex:none;margin-bottom:8px}
.snl-head h3{margin:0;font-size:17px}
.snl-ovbody{flex:1 1 auto;min-height:0;overflow:auto}
.snl-ovcard h4{margin:12px 0 4px;font-size:12px;text-transform:uppercase;letter-spacing:.05em;color:#64748b}
.snl-ovcard p,.snl-ovcard li{font-size:13px;color:#475569;line-height:1.55;margin:4px 0}
.snl-ovcard ul{margin:4px 0;padding-left:18px}
.snl-foot{display:flex;align-items:center;justify-content:space-between;gap:10px;flex:none;margin-top:12px}
.snl-ovbtns{display:flex;gap:8px;flex-wrap:wrap}
.snl-ovbtns .snl-btn{flex:1 1 140px;min-height:44px}
.snl-win{color:#15803d}
.snl-lose{color:#b91c1c}
.snl-cheatgrid{display:grid;grid-template-columns:repeat(6,1fr);gap:6px}
.snl-cheatgrid .snl-btn{padding:8px 0;min-height:44px}
.snl-check{display:flex;align-items:center;gap:8px;font-size:13px;color:#334155;font-weight:600;min-height:44px}
.snl-check input{width:18px;height:18px;accent-color:#0f172a}
.snl-note{font-size:11.5px;color:#94a3b8}
.snl-token{transition:transform var(--snl-hop) cubic-bezier(.33,.66,.4,1)}
.snl-token.slide{transition:transform var(--snl-slide) cubic-bezier(.45,.05,.35,1)}
.snl-token.snap{transition:none!important}
.snl.is-paused *{animation-play-state:paused!important}
/* Mobile overrides — keep LAST so they beat the design blocks and pointer:coarse. */
@media (max-width:640px){
.snl{padding:10px}
.snl.game-fill>.snl-board:not(:has(.snl-ov:not([hidden]))){flex:0 0 auto;aspect-ratio:auto;min-height:0}
.snl-boardsvg{height:auto;aspect-ratio:1;flex:none}
.snl.game-fill>.snl-board:has(.snl-ov:not([hidden])){flex:0 0 auto;min-height:min(70dvh,620px);aspect-ratio:auto}
.snl.game-fill>.snl-board:has(.snl-ov:not([hidden])) .snl-boardsvg{height:100%;aspect-ratio:auto;flex:1 1 auto}
.snl .snl-hud{gap:5px;margin-bottom:8px}
.snl .snl-hudinfo,.snl .snl-hudctl{width:100%;gap:5px}
.snl .snl-hudctl{flex-wrap:nowrap;overflow-x:auto;scrollbar-width:none;padding-bottom:2px}
.snl .snl-hudctl::-webkit-scrollbar{display:none}
.snl .snl-hudctl>*{flex:none}
.snl .snl-hud .snl-chip{padding:4px 6px;font-size:9px}
.snl .snl-hud .snl-chip[data-hud="first"],.snl .snl-hud .snl-chip[data-seed]{display:none}
.snl .snl-hud .snl-btn{min-height:32px;padding:5px 9px;font-size:9px}
.snl .snl-hud .snl-btn-label{display:none}
.snl .snl-hud .snl-spacer{display:none}
.snl .snl-hud .snl-die{width:22px;height:22px}
.snl .snl-hud select{max-width:92px;min-height:32px;font-size:9px}
.snl-ov{padding:8px}
.snl .snl-ovcard{width:100%;height:100%;max-height:100%;padding:12px;border-radius:12px}
.snl .snl-ovbody{scrollbar-width:none}
.snl .snl-ovbody::-webkit-scrollbar{display:none}
.snl .snl-foot{position:static;margin:10px 0 0;padding:10px 0 0;border-top:1px solid #e2e8f0}
.snl .snl-note{display:none}
.snl-cheatgrid{grid-template-columns:repeat(3,1fr)}
}
@media (pointer:coarse){.snl .snl-hud .snl-btn{min-height:32px;padding:5px 9px;font-size:9px}}
@media (prefers-reduced-motion:reduce){.snl *{animation-duration:.01ms!important;animation-iteration-count:1!important;transition-duration:.01ms!important;scroll-behavior:auto!important}}
</style>
  <div class="game-app snl game-fill" data-snl>
    <div class="snl-hud">
      <div class="snl-hudinfo">
        <span class="snl-chip"><i class="snl-dot" data-dot></i><b data-status>Ready</b></span>
        <span class="snl-chip"><i class="snl-dot" style="background:${COLORS[0]}"></i><span data-n0>You</span>&nbsp;<b data-p0>1</b></span>
        <span class="snl-chip"><i class="snl-dot" style="background:${COLORS[1]}"></i><span data-n1>Bot</span>&nbsp;<b data-p1>1</b></span>
        <span class="snl-chip">Rolls <b data-rolls>0</b></span>
        <span class="snl-chip" data-hud="first">First <b data-first>—</b></span>
        <span class="snl-chip" data-bestchip hidden>Best <b data-best>0</b></span>
        <span class="snl-chip warn" data-cheatedchip hidden>Assisted</span>
        <span class="snl-chip" data-seed>—</span>
      </div>
      <span class="snl-spacer"></span>
      <div class="snl-hudctl">
        <svg class="snl-die" data-die viewBox="0 0 64 64" role="img" aria-label="Die"></svg>
        <button class="snl-btn snl-icon-btn snl-roll" type="button" data-roll disabled aria-label="Roll die" title="Roll die (Space)">${iconSVG("playCircle", { size: 14 })}<span class="snl-btn-label">Roll</span></button>
        <select data-style aria-label="Map style">${styleOptions}</select>
        <button class="snl-btn snl-icon-btn" type="button" data-newmap aria-label="New random map" title="New random map (N)">${iconSVG("spark", { size: 14 })}<span class="snl-btn-label">New map</span></button>
        <button class="snl-btn snl-icon-btn" type="button" data-speed aria-label="Speed" title="Toggle speed">${iconSVG("forward", { size: 14 })}<span class="snl-btn-label" data-speedlabel>Chill</span></button>
        <button class="snl-btn snl-icon-btn" type="button" data-help aria-label="How to play" title="How to play (H)">${iconSVG("helpCircle", { size: 14 })}<span class="snl-btn-label">Help</span></button>
        <button class="snl-btn snl-icon-btn" type="button" data-cheats aria-label="Cheats" title="Cheats (C)">${iconSVG("wrench", { size: 14 })}<span class="snl-btn-label">Cheats</span></button>
        <button class="snl-btn snl-icon-btn" type="button" data-pause aria-label="Pause" title="Pause (P)">${iconSVG("pause", { size: 14 })}<span class="snl-btn-label">Pause</span></button>
        <button class="snl-btn snl-icon-btn" type="button" data-restart aria-label="Restart" title="Restart (R)">${iconSVG("refresh", { size: 14 })}<span class="snl-btn-label">Restart</span></button>
        <button class="snl-btn snl-icon-btn" type="button" data-exit aria-label="Exit game" title="Exit game">${iconSVG("logOut", { size: 14 })}<span class="snl-btn-label">Exit game</span></button>
      </div>
    </div>

    <section class="game-panel snl-board" data-board>
      <svg class="snl-boardsvg" viewBox="0 0 456 456" font-family="inherit" role="img" aria-label="Snakes and ladders board"></svg>
      <p class="snl-msg" data-msg aria-live="polite">Press Start to begin.</p>
      <div class="snl-caption" data-caption>Hover a square to see what it hides.</div>

      <div class="snl-ov" data-ov="intro">
        <div class="snl-ovcard" role="dialog" aria-modal="true" aria-label="Start game">
          <div class="snl-head"><h3>Snakes and Ladders</h3></div>
          <div class="snl-ovbody">
            <p>Race from square 1 to square 100 on a fresh, always-solvable random map.</p>
            <ul>
              <li>Roll the die, hop forward — <b>ladders</b> climb up, <b>snakes</b> slide down.</li>
              <li>Land <b>exactly</b> on 100 to win; an overshoot bounces you back.</li>
              <li>First move is a coin toss${online ? ", and player colors are randomized too" : ""}.</li>
            </ul>
          </div>
          <div class="snl-foot"><span class="snl-note">Space/Enter to roll</span><div class="snl-ovbtns"><button class="snl-btn primary" type="button" data-start>Start game</button><button class="snl-btn" type="button" data-help>How to play</button></div></div>
          <p class="snl-note" data-waitstart hidden>Waiting for the host to start…</p>
        </div>
      </div>

      <div class="snl-ov" data-ov="help" hidden>
        <div class="snl-ovcard" role="dialog" aria-modal="true" aria-label="How to play">
          <div class="snl-head"><h3>How to play</h3><button class="snl-btn" type="button" data-help-close aria-label="Close">${iconSVG("x", { size: 14 })}</button></div>
          <div class="snl-ovbody">
            <h4>Goal</h4>
            <p>Be the first to land <b>exactly</b> on square 100. Overshooting bounces you back (98 + 5 → 97).</p>
            <h4>Turns</h4>
            <p>A coin toss picks who starts, then turns alternate. Roll 1–6 and your token hops cell by cell. Landing on a ladder's base climbs it instantly; landing on a snake's head slides you down.</p>
            <h4>Maps</h4>
            <p>Every map is generated from a seed and verified solvable from every square. Pick a style (Classic, Ladder Rush, Snake Pit, Chaos, Giant Leaps) and press <b>New map</b> for a fresh layout.</p>
            <h4>Controls — desktop</h4>
            <ul>
              <li><kbd>Space</kbd> / <kbd>Enter</kbd> — roll (or click the board / the die)</li>
              <li><kbd>R</kbd> — restart · <kbd>N</kbd> — new map · <kbd>H</kbd> — help</li>
              <li><kbd>C</kbd> — cheats · <kbd>P</kbd> — pause · <kbd>Esc</kbd> — close</li>
              <li><b>Mouse hover</b> — inspect a square's secret</li>
            </ul>
            <h4>Controls — mobile</h4>
            <p>Tap the <b>Roll</b> button in the HUD, or tap the board itself. The other HUD buttons open help, cheats, pause, restart and exit.</p>
            <h4>Cheats</h4>
            <p>Offline practice only (hidden in online rooms). Any cheat tags the run as <i>assisted</i> — assisted wins don't count for your personal best.</p>
          </div>
          <div class="snl-foot"><span class="snl-note">Press H to reopen this guide</span><button class="snl-btn primary" type="button" data-help-close>Got it</button></div>
        </div>
      </div>

      <div class="snl-ov" data-ov="cheat" hidden>
        <div class="snl-ovcard" role="dialog" aria-modal="true" aria-label="Cheats">
          <div class="snl-head"><h3>Cheats <span class="snl-note">· practice mode</span></h3><button class="snl-btn" type="button" data-close aria-label="Close">${iconSVG("x", { size: 14 })}</button></div>
          <div class="snl-ovbody">
            <p class="snl-note">Offline only. Using any cheat marks this run as assisted.</p>
            <h4>Next roll — <span data-nextlabel>random</span></h4>
            <div class="snl-cheatgrid">
              <button class="snl-btn" type="button" data-cheat-op="next" data-val="1">1</button>
              <button class="snl-btn" type="button" data-cheat-op="next" data-val="2">2</button>
              <button class="snl-btn" type="button" data-cheat-op="next" data-val="3">3</button>
              <button class="snl-btn" type="button" data-cheat-op="next" data-val="4">4</button>
              <button class="snl-btn" type="button" data-cheat-op="next" data-val="5">5</button>
              <button class="snl-btn" type="button" data-cheat-op="next" data-val="6">6</button>
            </div>
            <button class="snl-btn" type="button" data-cheat-op="clear">Back to random</button>
            <h4>Defense</h4>
            <label class="snl-check"><input type="checkbox" data-shield> Snake shield (you ignore snakes)</label>
            <h4>Teleport (1–99)</h4>
            <div class="snl-row">
              <input type="number" min="1" max="99" value="50" data-tp aria-label="Teleport target">
              <button class="snl-btn" type="button" data-cheat-op="tp" data-tpgo>Go</button>
            </div>
            <h4>Shortcuts</h4>
            <div class="snl-row">
              <button class="snl-btn" type="button" data-cheat-op="skip" data-skip>Skip bot turn</button>
              <button class="snl-btn danger" type="button" data-cheat-op="win" data-cwin>Instant win</button>
            </div>
            <h4>Load map seed</h4>
            <div class="snl-row">
              <input type="text" placeholder="e.g. 1a2b3c" data-seedinput aria-label="Map seed">
              <button class="snl-btn" type="button" data-cheat-op="seed">Load</button>
            </div>
          </div>
          <div class="snl-foot"><span class="snl-note"></span><button class="snl-btn primary" type="button" data-close>Close</button></div>
        </div>
      </div>

      <div class="snl-ov" data-ov="pause" hidden>
        <div class="snl-ovcard" role="dialog" aria-modal="true" aria-label="Paused">
          <div class="snl-head"><h3>Paused</h3></div>
          <div class="snl-ovbody"><p class="snl-note">The board, animations and bot are frozen. Press P or Esc to resume.</p></div>
          <div class="snl-foot"><span class="snl-note"></span><button class="snl-btn primary" type="button" data-resume>Resume</button></div>
        </div>
      </div>

      <div class="snl-ov" data-ov="win" hidden>
        <div class="snl-ovcard" role="dialog" aria-modal="true" aria-label="Game over">
          <div class="snl-head"><h3 data-wintitle>Game over</h3></div>
          <div class="snl-ovbody">
            <p data-winsub></p>
            <p class="snl-note" data-waitrematch hidden>Waiting for the host to start a rematch…</p>
          </div>
          <div class="snl-foot"><div class="snl-ovbtns"><button class="snl-btn primary" type="button" data-rematch>Play again</button><button class="snl-btn" type="button" data-viewboard>View board</button></div></div>
        </div>
      </div>
    </section>
  </div>`;

    /* ---------------- referensi DOM ---------------- */
    const snlRoot = root.querySelector(".snl");
    const board = root.querySelector("[data-board]");
    const statusEl = root.querySelector("[data-status]");
    const dotEl = root.querySelector("[data-dot]");
    const msgEl = root.querySelector("[data-msg]");
    const captionEl = root.querySelector("[data-caption]");
    const boardSvg = root.querySelector(".snl-boardsvg");
    const dieSvg = root.querySelector("[data-die]");
    const rollBtns = [...root.querySelectorAll("[data-roll]")];
    const cheatBtns = [...root.querySelectorAll("[data-cheat]")];
    const styleSel = root.querySelector("[data-style]");
    const newMapBtn = root.querySelector("[data-newmap]");
    const speedBtn = root.querySelector("[data-speed]");
    const speedLabel = root.querySelector("[data-speedlabel]");
    const pauseBtn = root.querySelector("[data-pause]");
    const restartBtn = root.querySelector("[data-restart]");
    const seedEl = root.querySelector("[data-seed]");
    const n0 = root.querySelector("[data-n0]"), n1 = root.querySelector("[data-n1]");
    const p0 = root.querySelector("[data-p0]"), p1 = root.querySelector("[data-p1]");
    const rollsEl = root.querySelector("[data-rolls]");
    const firstEl = root.querySelector("[data-first]");
    const bestChip = root.querySelector("[data-bestchip]"), bestEl = root.querySelector("[data-best]");
    const cheatedChip = root.querySelector("[data-cheatedchip]");
    const introOv = root.querySelector('[data-ov="intro"]');
    const helpOv = root.querySelector('[data-ov="help"]');
    const cheatOv = root.querySelector('[data-ov="cheat"]');
    const pauseOv = root.querySelector('[data-ov="pause"]');
    const winOv = root.querySelector('[data-ov="win"]');
    const startBtn = root.querySelector("[data-start]");
    const waitStart = root.querySelector("[data-waitstart]");
    const winTitle = root.querySelector("[data-wintitle]");
    const winSub = root.querySelector("[data-winsub]");
    const rematchBtn = root.querySelector("[data-rematch]");
    const waitRematch = root.querySelector("[data-waitrematch]");
    const nextLabel = root.querySelector("[data-nextlabel]");
    const shieldChk = root.querySelector("[data-shield]");
    const tpInput = root.querySelector("[data-tp]");
    const tpGo = root.querySelector("[data-tpgo]");
    const skipBtn = root.querySelector("[data-skip]");
    const winCheatBtn = root.querySelector("[data-cwin]");
    const seedInput = root.querySelector("[data-seedinput]");

    let hlRect = null;
    const tokenEls = [];

    /* ---------------- gambar papan (minimalis) ---------------- */
    function catmull(p) {
        let d = "M" + p[0][0].toFixed(1) + "," + p[0][1].toFixed(1);
        for (let i = 0; i < p.length - 1; i++) {
            const p0 = p[Math.max(0, i - 1)], p1 = p[i], p2 = p[i + 1], p3 = p[Math.min(p.length - 1, i + 2)];
            const c1x = p1[0] + (p2[0] - p0[0]) / 6, c1y = p1[1] + (p2[1] - p0[1]) / 6;
            const c2x = p2[0] - (p3[0] - p1[0]) / 6, c2y = p2[1] - (p3[1] - p1[1]) / 6;
            d += "C" + c1x.toFixed(1) + "," + c1y.toFixed(1) + " " + c2x.toFixed(1) + "," + c2y.toFixed(1) + " " + p2[0].toFixed(1) + "," + p2[1].toFixed(1);
        }
        return d;
    }

    function ladderStr(a, b) {
        const [ax, ay] = cellXY(a), [bx, by] = cellXY(b);
        const dx = bx - ax, dy = by - ay, L = Math.hypot(dx, dy) || 1;
        const px = -dy / L, py = dx / L, off = 5.5;
        let s = "";
        for (const sgn of [1, -1]) {
            s += `<line x1="${(ax + px * off * sgn).toFixed(1)}" y1="${(ay + py * off * sgn).toFixed(1)}" x2="${(bx + px * off * sgn).toFixed(1)}" y2="${(by + py * off * sgn).toFixed(1)}" stroke="#c98a3d" stroke-width="2.6" stroke-linecap="round" opacity="0.9"/>`;
        }
        const rungs = Math.max(3, Math.round(L / 26));
        for (let k = 1; k < rungs; k++) {
            const t = k / rungs;
            s += `<line x1="${(ax + dx * t + px * off).toFixed(1)}" y1="${(ay + dy * t + py * off).toFixed(1)}" x2="${(ax + dx * t - px * off).toFixed(1)}" y2="${(ay + dy * t - py * off).toFixed(1)}" stroke="#e0a35c" stroke-width="2.2" stroke-linecap="round" opacity="0.9"/>`;
        }
        return s;
    }

    function snakeStr(a, b, col) {
        const [hx, hy] = cellXY(a), [tx, ty] = cellXY(b);
        const dx = tx - hx, dy = ty - hy, L = Math.hypot(dx, dy) || 1;
        const px = -dy / L, py = dx / L;
        const waves = Math.max(2, Math.round(L / 90));
        const segs = 6 + waves * 2;
        const pts = [];
        for (let k = 0; k <= segs; k++) {
            const t = k / segs;
            const w = Math.sin(t * Math.PI * waves) * 10 * (0.5 + 0.5 * Math.sin(t * Math.PI));
            pts.push([hx + dx * t + px * w, hy + dy * t + py * w]);
        }
        const d = catmull(pts);
        let s = `<path d="${d}" fill="none" stroke="${col.dark}" stroke-width="7.5" stroke-linecap="round" opacity="0.9"/>`;
        s += `<path d="${d}" fill="none" stroke="${col.body}" stroke-width="4.6" stroke-linecap="round"/>`;
        s += `<path d="${d}" fill="none" stroke="#ffffff" stroke-width="1.3" stroke-linecap="round" stroke-dasharray="1 8" opacity="0.7"/>`;
        const ang = (Math.atan2(pts[1][1] - pts[0][1], pts[1][0] - pts[0][0]) * 180) / Math.PI;
        s += `<g transform="translate(${hx},${hy}) rotate(${ang.toFixed(1)})"><ellipse rx="8" ry="6.2" fill="${col.body}" stroke="${col.dark}" stroke-width="1.8"/><circle cx="2.6" cy="-2.9" r="1.7" fill="#fff"/><circle cx="2.6" cy="2.9" r="1.7" fill="#fff"/><circle cx="3.2" cy="-2.9" r="0.85" fill="${col.dark}"/><circle cx="3.2" cy="2.9" r="0.85" fill="${col.dark}"/></g>`;
        s += `<circle cx="${tx}" cy="${ty}" r="2.6" fill="${col.body}" stroke="${col.dark}" stroke-width="1.3"/>`;
        return s;
    }

    function drawBoard() {
        const pal = PALS[state.seed % PALS.length];
        let s = `<rect x="1" y="1" width="454" height="454" rx="14" fill="#ffffff" stroke="${pal.line}" stroke-width="2"/>`;
        for (let n = 1; n <= 100; n++) {
            const i = n - 1, r = Math.floor(i / 10);
            let c = i % 10;
            if (r % 2 === 1) c = 9 - c;
            const x = M + c * CELL, y = M + (9 - r) * CELL;
            let fill = (r + c) % 2 ? pal.alt : "#ffffff";
            if (n === 1) fill = "#e9f7ef";
            if (n === 100) fill = "#fdeeee";
            s += `<rect x="${x}" y="${y}" width="${CELL}" height="${CELL}" fill="${fill}" stroke="${pal.line}" stroke-width="1"/>`;
            s += `<text x="${x + CELL / 2}" y="${y + 12}" font-size="9.5" text-anchor="middle" fill="${pal.num}">${n}</text>`;
        }
        s += `<text x="30" y="443" font-size="7.5" text-anchor="middle" fill="#15803d" font-weight="700" letter-spacing="1">START</text>`;
        s += `<text x="30" y="47" font-size="7.5" text-anchor="middle" fill="#b91c1c" font-weight="700" letter-spacing="1">FINISH</text>`;
        const rnd = mulberry32(state.seed ^ 0x9e3779b9);
        state.ladders.forEach(([a, b]) => { s += ladderStr(a, b); });
        state.snakes.forEach(([a, b]) => { s += snakeStr(a, b, SNAKE_COLS[Math.floor(rnd() * SNAKE_COLS.length)]); });
        s += `<rect data-hl x="0" y="0" width="${CELL}" height="${CELL}" rx="7" fill="rgba(59,130,246,.07)" stroke="#3b82f6" stroke-width="1.5" visibility="hidden" pointer-events="none"/>`;
        boardSvg.innerHTML = s;
        hlRect = boardSvg.querySelector("[data-hl]");
        tokenEls.length = 0;
        for (let pl = 0; pl < 2; pl++) {
            const g = document.createElementNS(SVGNS, "g");
            g.setAttribute("class", "snl-token");
            g.innerHTML = `<circle r="10.5" fill="${COLORS[pl]}" stroke="#ffffff" stroke-width="2.5"/><circle r="3.6" fill="#ffffff" opacity="0.9"/>`;
            boardSvg.appendChild(g);
            tokenEls.push(g);
        }
        paintTokens();
    }

    function paintTokens() {
        if (!state || tokenEls.length < 2) return;
        const same = viewPos[0] === viewPos[1];
        for (let pl = 0; pl < 2; pl++) {
            const [x, y] = cellXY(viewPos[pl]);
            const dx = same ? (pl === 0 ? -7 : 7) : 0;
            tokenEls[pl].style.transform = `translate(${x + dx}px, ${y}px)`;
        }
    }

    function snapTokens() {
        tokenEls.forEach((t) => t.classList.add("snap"));
        paintTokens();
        later(() => tokenEls.forEach((t) => t.classList.remove("snap")), 30);
    }

    function showDie(v) {
        dieSvg.innerHTML =
            `<rect x="2" y="2" width="60" height="60" rx="14" fill="#ffffff" stroke="#cbd5e1" stroke-width="2"/>` +
            PIPS[v].map((p) => `<circle cx="${p[0]}" cy="${p[1]}" r="4.6" fill="#0f172a"/>`).join("");
    }

    /* ---------------- helper seat / nama ---------------- */
    const localSeat = () => (online ? (room.isHost ? state.hostSeat : 1 - state.hostSeat) : 0);
    const roleName = (seat) => (online ? (seat === state.hostSeat ? "Host" : "Guest") : seat === 0 ? "You" : "Bot");
    const dispName = (seat) => (seat === localSeat() ? "You" : roleName(seat));
    const canRollNow = () => !!state && state.phase === "roll" && state.turn === localSeat() && !busy;
    const seedHex = () => (state.seed >>> 0).toString(16);

    function turnMsg() {
        const t = state.turn;
        if (!online) return t === 0 ? "Your turn — roll the die." : "Bot is thinking…";
        return roleName(t) + "'s turn.";
    }
    function defaultCaption() {
        return canRollNow() ? "Your move — click / tap the board, or press Space." : "Hover a square to see what it hides.";
    }

    /* ---------------- render ---------------- */
    function render() {
        if (!state) {
            statusEl.textContent = "Connecting…";
            dotEl.className = "snl-dot";
            rollBtns.forEach((b) => (b.disabled = true));
            introOv.hidden = false;
            startBtn.hidden = true;
            waitStart.hidden = false;
            helpOv.hidden = !helpOpen;
            cheatOv.hidden = true; pauseOv.hidden = true; winOv.hidden = true;
            return;
        }

        // Game baru (start / rematch / new map): reset tampilan & animasi
        if (state.gameId !== curGameId) {
            const firstPaint = curGameId === -1;
            curGameId = state.gameId;
            cancelAnim();
            drawBoard();
            lastAnimId = state.lastMove ? state.lastMove.id : null; // jangan animasikan riwayat
            viewPos = state.pos.slice();
            // Jangan menutup modal help saat render pertama (first-run guide).
            if (!firstPaint) { winDismissed = false; helpOpen = false; cheatOpen = false; }
            resetClock();
            snapTokens();
        }

        // Gerakan baru dari state canonical → animasikan secara lokal
        const lm = state.lastMove;
        if (lm && lm.id !== lastAnimId) {
            lastAnimId = lm.id;
            animateMove(lm);
        } else if (!busy) {
            viewPos = state.pos.slice();
        }

        snlRoot.style.setProperty("--snl-hop", Math.round(T.hop * state.speed) + "ms");
        snlRoot.style.setProperty("--snl-slide", Math.round(T.slide * state.speed) + "ms");
        paintTokens();
        if (!busy) showDie(state.die);

        // HUD
        const mine = localSeat();
        n0.textContent = dispName(0); n1.textContent = dispName(1);
        p0.textContent = viewPos[0]; p1.textContent = viewPos[1];
        rollsEl.textContent = state.rolls[0] + state.rolls[1];
        firstEl.textContent = dispName(state.first);
        bestChip.hidden = !best; bestEl.textContent = best;
        cheatedChip.hidden = !state.cheated;
        msgEl.textContent = state.msg;
        seedEl.textContent = "Map #" + seedHex() + " · " + STYLES[state.style].label + " · solvable ✓";

        let sTxt;
        if (state.phase === "idle") sTxt = "Ready";
        else if (state.phase === "over") sTxt = "Finished";
        else if (state.phase === "anim" || busy) sTxt = "Moving…";
        else sTxt = state.turn === mine ? "Your turn" : dispName(state.turn) + "'s turn";
        statusEl.textContent = paused ? "Paused" : sTxt;
        dotEl.className = "snl-dot" + (canRollNow() && !paused ? " on" : "");
        snlRoot.classList.toggle("is-paused", paused);

        // Kontrol
        const hostOnly = online && !room.isHost;
        rollBtns.forEach((b) => (b.disabled = !canRollNow() || paused || helpOpen || cheatOpen));
        boardSvg.style.cursor = canRollNow() && !paused ? "pointer" : "default";
        styleSel.value = state.style;
        styleSel.disabled = hostOnly || paused;
        newMapBtn.disabled = hostOnly || paused;
        speedBtn.disabled = hostOnly || state.phase === "anim" || paused;
        speedLabel.textContent = state.speed === 1 ? "Chill" : "Fast";
        cheatBtns.forEach((b) => (b.style.display = online ? "none" : ""));
        if (pauseBtn) {
            const label = pauseBtn.querySelector(".snl-btn-label");
            if (label) label.textContent = paused ? "Resume" : "Pause";
            pauseBtn.setAttribute("aria-label", paused ? "Resume" : "Pause");
            const icon = pauseBtn.querySelector("svg");
            if (icon) icon.outerHTML = iconSVG(paused ? "play" : "pause", { size: 14 });
            pauseBtn.disabled = online;
        }
        if (restartBtn) restartBtn.disabled = hostOnly;

        // Overlay — saling menekan: help → cheats → pause → result
        introOv.hidden = state.phase !== "idle" || helpOpen || cheatOpen || paused;
        startBtn.hidden = hostOnly;
        waitStart.hidden = !hostOnly;
        helpOv.hidden = !helpOpen;
        cheatOv.hidden = !cheatOpen || online;
        pauseOv.hidden = !paused || helpOpen || cheatOpen;
        const showWin = state.phase === "over" && !winDismissed && !busy && !helpOpen && !cheatOpen && !paused;
        winOv.hidden = !showWin;
        if (showWin) {
            const w = state.winner;
            const iWon = w === mine;
            winTitle.textContent = iWon ? "You win!" : dispName(w) + " wins";
            winTitle.className = iWon ? "snl-win" : "snl-lose";
            let sub = `${state.rolls[w]} rolls · Map ${STYLES[state.style].label} #${seedHex()} · First move: ${dispName(state.first)}`;
            if (state.cheated) sub += " · assisted run";
            else if (iWon && best) sub += ` · personal best: ${best} rolls`;
            if (iWon) sub = `Nice race, ${playerName}! ` + sub;
            winSub.textContent = sub;
            rematchBtn.hidden = hostOnly;
            waitRematch.hidden = !hostOnly;
        }

        // Personal best (menang sendiri, tanpa cheat)
        if (state.phase === "over" && state.winner === mine && !state.cheated && bestCountedGame !== state.gameId) {
            bestCountedGame = state.gameId;
            const r = state.rolls[state.winner];
            if (!best || r < best) {
                best = r;
                try { localStorage.setItem(META.bestKey, String(r)); } catch { }
            }
            bestChip.hidden = !best; bestEl.textContent = best;
        }

        // Panel cheat dinamis
        if (!online) {
            nextLabel.textContent = state.nextRoll ? "forced " + state.nextRoll : "random";
            shieldChk.checked = state.shield;
            tpGo.disabled = state.phase !== "roll";
            skipBtn.disabled = !(state.phase === "roll" && state.turn === 1);
            winCheatBtn.disabled = state.phase === "anim" || state.phase === "over";
        }

        if (!hlRect || hlRect.getAttribute("visibility") === "hidden") captionEl.textContent = defaultCaption();
    }

    /* ---------------- animasi lokal (host & guest sama) ---------------- */
    function cancelAnim() {
        animT.forEach(cancelTimer);
        animT = [];
        busy = false;
        dieSvg.classList.remove("rolling");
        tokenEls.forEach((t) => t.classList.remove("slide"));
    }

    function animateMove(lm) {
        cancelAnim();
        busy = true;
        const sp = state.speed;
        const tok = tokenEls[lm.pl];
        dieSvg.classList.add("rolling");
        let ticks = 0;
        const total = Math.max(4, Math.round(T.dice / T.diceTick));
        const tick = () => {
            ticks++;
            showDie(1 + Math.floor(Math.random() * 6));
            if (ticks < total) alater(tick, T.diceTick * sp);
            else {
                dieSvg.classList.remove("rolling");
                showDie(lm.die);
                alater(hopStart, T.afterDice * sp);
            }
        };
        const hopStart = () => {
            let i = 0;
            const step = () => {
                viewPos[lm.pl] = lm.path[i]; i++;
                paintTokens();
                if (i < lm.path.length) alater(step, T.hop * sp);
                else alater(afterHop, T.hop * sp);
            };
            step();
        };
        const afterHop = () => {
            if (lm.jump) {
                alater(() => {
                    tok.classList.add("slide");
                    viewPos[lm.pl] = lm.jump.to;
                    paintTokens();
                    alater(() => { tok.classList.remove("slide"); finishAnim(); }, T.slide * sp);
                }, T.preJump * sp);
            } else alater(finishAnim, T.tail * sp);
        };
        tick();
    }

    function finishAnim() {
        busy = false;
        if (state) viewPos = state.pos.slice();
        paintTokens();
        render();
    }

    /* ---------------- alur permainan (canonical, host-driven) ---------------- */
    function publish() {
        render();
        if (online && room.isHost) room.publishState(state).catch(console.warn);
        if (!online) maybeAI();
    }

    function newGame({ style = "classic", seed = null, autostart = true } = {}) {
        clearFlow();
        cancelAnim();
        timers.forEach(cancelTimer);
        timers.clear();
        resetClock();
        const st = STYLES[style] ? style : "classic";
        const sd = seed === null ? (Math.random() * 4294967296) >>> 0 : seed >>> 0;
        const board = genBoard(sd, st);
        const first = Math.random() < 0.5 ? 0 : 1;                    // siapa jalan dulu: acak
        const hostSeat = online ? (Math.random() < 0.5 ? 0 : 1) : 0;  // warna/seat multiplayer: acak
        const speed = state ? state.speed : 1;
        const gid = state ? state.gameId + 1 : 1;
        state = {
            v: 2, gameId: gid, seed: sd, style: st,
            ladders: board.ladders, snakes: board.snakes,
            pos: [1, 1], rolls: [0, 0], die: 6,
            turn: first, first, hostSeat,
            phase: autostart ? "roll" : "idle",
            winner: null, msg: "", speed,
            lastMove: null, seq: 0,
            shield: false, nextRoll: null, cheated: false,
        };
        state.msg = autostart
            ? "Coin toss: " + roleName(first) + " goes first" + (online ? " — you play " + COLOR_NAMES[localSeat()] + "." : ".")
            : "Press Start to begin.";
        publish();
    }

    function doRoll(seat) {
        if (!state || state.phase !== "roll" || state.turn !== seat) return;
        const forced = !online && seat === 0 && state.nextRoll ? state.nextRoll : null;
        const v = forced || 1 + Math.floor(Math.random() * 6);
        if (forced) state.nextRoll = null;

        const from = state.pos[seat];
        const path = buildPath(from, v);
        const landing = path[path.length - 1];
        const bounced = from + v > 100;
        let jump = null, shielded = false;
        if (landing !== 100) {
            const lad = state.ladders.find((l) => l[0] === landing);
            const sn = state.snakes.find((s) => s[0] === landing);
            if (lad) jump = { type: "ladder", to: lad[1] };
            else if (sn) {
                if (!online && seat === 0 && state.shield) shielded = true;
                else jump = { type: "snake", to: sn[1] };
            }
        }
        const final = jump ? jump.to : landing;
        state.pos[seat] = final;
        state.rolls[seat]++;
        state.die = v;
        state.seq++;
        state.lastMove = { id: state.seq, pl: seat, die: v, path, jump, bounced };

        let m = roleName(seat) + " rolled " + v + ".";
        if (bounced) m += " Overshot — bounced back to " + landing + ".";
        if (jump) m += jump.type === "ladder" ? " Ladder! Up to " + jump.to + "." : " Snake! Down to " + jump.to + ".";
        if (shielded) m += " Snake shield blocked the bite.";
        state.msg = m;
        if (final === 100) state.winner = seat;
        state.turn = 1 - seat;
        state.phase = "anim";
        publish();

        // Host membuka giliran berikutnya setelah durasi animasi selesai
        const id = state.seq, dur = moveDur(state.lastMove, state.speed);
        flowTimer = later(() => {
            flowTimer = null;
            if (!state || state.phase !== "anim" || !state.lastMove || state.lastMove.id !== id) return;
            if (state.winner !== null) {
                state.phase = "over";
                state.msg = roleName(state.winner) + " wins in " + state.rolls[state.winner] + " rolls!";
            } else {
                state.phase = "roll";
                state.msg = turnMsg();
            }
            publish();
        }, dur + 140);
    }

    function maybeAI() {
        if (online || destroyed || !state) return;
        if (aiTimer) { cancelTimer(aiTimer); aiTimer = null; }
        if (state.phase === "roll" && state.turn === 1) {
            aiTimer = later(() => {
                aiTimer = null;
                if (state && state.phase === "roll" && state.turn === 1) doRoll(1);
            }, T.aiThink * state.speed);
        }
    }

    /* ---------------- cheat (offline saja) ---------------- */
    function applyCheat(a) {
        if (online || !state) return;
        const op = a.op;
        if (op === "next") {
            state.nextRoll = Math.max(1, Math.min(6, a.val | 0));
            state.cheated = true; publish();
        } else if (op === "clear") {
            state.nextRoll = null; publish();
        } else if (op === "shield") {
            state.shield = !!a.val;
            if (state.shield) state.cheated = true;
            publish();
        } else if (op === "tp") {
            if (state.phase !== "roll") return;
            const v = Math.max(1, Math.min(99, a.val | 0));
            state.pos[0] = v; state.cheated = true;
            state.msg = "Teleported to " + v + ".";
            publish();
        } else if (op === "skip") {
            if (state.phase !== "roll" || state.turn !== 1) return;
            state.turn = 0; state.cheated = true;
            state.msg = "Bot turn skipped — roll again.";
            publish();
        } else if (op === "win") {
            if (state.phase === "anim" || state.phase === "over") return;
            state.pos[0] = 100; state.winner = 0; state.phase = "over"; state.cheated = true;
            state.msg = "You win! (assisted)";
            publish();
        } else if (op === "seed") {
            const raw = String(a.val || "").trim();
            const n = /^[0-9a-f]+$/i.test(raw) ? parseInt(raw, 16) : parseInt(raw, 10);
            if (!Number.isFinite(n)) return;
            newGame({ style: state.style, seed: n >>> 0, autostart: true });
        }
    }

    /* ---------------- aksi (template pattern) ---------------- */
    function applyAction(action, actor) {
        if (!state || !action || typeof action.type !== "string") return;
        if (online && actor !== 0 && ["start", "map", "speed"].includes(action.type)) return; // host-only
        if (action.type === "cheat" && online) return;
        const seat = online ? (actor === 0 ? state.hostSeat : 1 - state.hostSeat) : actor;
        switch (action.type) {
            case "start":
                if (state.phase !== "idle" && state.phase !== "over") return;
                newGame({ style: state.style, autostart: true });
                break;
            case "map":
                newGame({ style: STYLES[action.style] ? action.style : state.style, autostart: true });
                break;
            case "speed":
                if (state.phase === "anim") return;
                state.speed = state.speed === 1 ? 0.55 : 1;
                publish();
                break;
            case "roll":
                if (state.phase !== "roll" || seat !== state.turn) return;
                doRoll(seat);
                break;
            case "cheat":
                applyCheat(action);
                break;
        }
    }

    function submitAction(action) {
        if (online && !room.isHost) {
            room.sendAction(action).catch(console.warn);
            return;
        }
        applyAction(action, playerIndex);
    }

    function toggleHelp(on) {
        helpOpen = typeof on === "boolean" ? on : !helpOpen;
        if (helpOpen) cheatOpen = false;
        render();
    }
    function toggleCheats(on) {
        if (online) return;
        cheatOpen = typeof on === "boolean" ? on : !cheatOpen;
        if (cheatOpen) helpOpen = false;
        render();
    }
    function restartGame() {
        if (online && !room.isHost) return;
        helpOpen = false; cheatOpen = false;
        if (paused) { pausedTotal += Date.now() - pausedAt; pausedAt = 0; paused = false; }
        newGame({ style: state ? state.style : "classic", autostart: true });
    }

    function tryRoll() {
        if (!canRollNow() || helpOpen || cheatOpen || paused) return;
        submitAction({ type: "roll" });
    }

    /* ---------------- input: mouse / touch / keyboard ---------------- */
    function handleClick(event) {
        const t = event.target;
        if (!t || !t.closest) return;
        if (t.closest("[data-help-close]")) { toggleHelp(false); return; }
        if (t.closest("[data-help]")) { toggleHelp(); return; }
        if (t.closest("[data-exit]")) return onExit();
        if (t.closest("[data-roll]")) return tryRoll();
        if (t.closest("[data-cheats]")) { toggleCheats(); return; }
        if (t.closest("[data-pause]")) { if (!online) setPaused(!paused); return; }
        if (t.closest("[data-resume]")) { if (paused) setPaused(false); return; }
        if (t.closest("[data-restart]")) return restartGame();
        if (t.closest("[data-start]") || t.closest("[data-rematch]")) return submitAction({ type: "start" });
        if (t.closest("[data-newmap]")) {
            if (!paused && (!online || room.isHost)) submitAction({ type: "map", style: styleSel.value });
            return;
        }
        if (t.closest("[data-speed]")) {
            if (!paused && !busy && (!online || room.isHost)) submitAction({ type: "speed" });
            return;
        }
        if (t.closest("[data-viewboard]")) { winDismissed = true; render(); return; }
        if (t.closest("[data-close]")) { toggleCheats(false); return; }
        const opEl = t.closest("[data-cheat-op]");
        if (opEl) {
            const op = opEl.dataset.cheatOp;
            if (op === "next") submitAction({ type: "cheat", op, val: +opEl.dataset.val });
            else if (op === "tp") submitAction({ type: "cheat", op, val: parseInt(tpInput.value, 10) || 1 });
            else if (op === "seed") submitAction({ type: "cheat", op, val: seedInput.value });
            else submitAction({ type: "cheat", op });
            return;
        }
        // Klik papan atau dadu = roll (mouse & tap)
        if (t.closest(".snl-boardsvg") || t.closest(".snl-die")) tryRoll();
    }

    function handleChange(event) {
        if (event.target === styleSel) submitAction({ type: "map", style: styleSel.value });
        else if (event.target === shieldChk) submitAction({ type: "cheat", op: "shield", val: shieldChk.checked });
    }

    function handlePointerMove(event) {
        if (!state || !hlRect) return;
        const svgEl = event.target.closest ? event.target.closest(".snl-boardsvg") : null;
        if (!svgEl) { hideHl(); return; }
        const r = svgEl.getBoundingClientRect();
        // SVG memakai preserveAspectRatio: petak 456x456 berada di tengah kotak (letterbox).
        const side = Math.min(r.width, r.height);
        if (!side) return;
        const scale = side / 456;
        const ox = r.left + (r.width - side) / 2;
        const oy = r.top + (r.height - side) / 2;
        const x = (event.clientX - ox) / scale;
        const y = (event.clientY - oy) / scale;
        const c = Math.floor((x - M) / CELL), rr = Math.floor((y - M) / CELL);
        if (c < 0 || c > 9 || rr < 0 || rr > 9) { hideHl(); return; }
        const row = 9 - rr;
        const col = row % 2 === 1 ? 9 - c : c;
        const n = row * 10 + col + 1;
        hlRect.setAttribute("x", M + c * CELL);
        hlRect.setAttribute("y", M + rr * CELL);
        hlRect.setAttribute("visibility", "visible");
        const lad = state.ladders.find((l) => l[0] === n);
        const sn = state.snakes.find((s) => s[0] === n);
        let info = "Square " + n;
        if (n === 1) info += " — start";
        else if (n === 100) info += " — finish (land exactly)";
        else if (lad) info += " — ladder up to " + lad[1];
        else if (sn) info += " — snake down to " + sn[1];
        captionEl.textContent = info;
    }

    function hideHl() {
        if (hlRect) hlRect.setAttribute("visibility", "hidden");
        if (state) captionEl.textContent = defaultCaption();
    }

    function handleKey(e) {
        if (destroyed || !state) return;
        const t = e.target;
        if (t && ((t.closest && t.closest("input,select,textarea")) || t.isContentEditable)) return;
        const k = e.code;
        // Prioritas: help → cheats → pause/Escape → aksi game.
        if (k === "KeyH") { toggleHelp(); e.preventDefault(); return; }
        if (k === "KeyC") { if (!helpOpen) toggleCheats(); e.preventDefault(); return; }
        if (k === "KeyR") { restartGame(); e.preventDefault(); return; }
        if (k === "KeyP" || k === "Escape") {
            if (helpOpen) toggleHelp(false);
            else if (cheatOpen) toggleCheats(false);
            else if (k === "Escape" && !winOv.hidden) { winDismissed = true; render(); }
            else if (!online) setPaused(!paused);
            e.preventDefault();
            return;
        }
        if (k === "KeyN") {
            if (!helpOpen && !cheatOpen && !paused && (!online || room.isHost)) {
                submitAction({ type: "map", style: styleSel.value });
            }
            e.preventDefault();
            return;
        }
        if (k === "Space" || k === "Enter") {
            if (e.repeat) { e.preventDefault(); return; }
            if (helpOpen) { toggleHelp(false); e.preventDefault(); return; }
            if (cheatOpen) { toggleCheats(false); e.preventDefault(); return; }
            if (paused) { setPaused(false); e.preventDefault(); return; }
            if (state.phase === "idle" || (state.phase === "over" && !winOv.hidden)) {
                if (!online || room.isHost) submitAction({ type: "start" });
                e.preventDefault();
                return;
            }
            if (k === "Space") { tryRoll(); e.preventDefault(); }
        }
    }

    /* ---------------- lifecycle ---------------- */
    root.addEventListener("click", handleClick);
    root.addEventListener("change", handleChange);
    root.addEventListener("pointermove", handlePointerMove);
    root.addEventListener("pointerleave", hideHl);
    document.addEventListener("keydown", handleKey);
    showDie(6);

    const subs = [];
    const keep = (u) => { if (typeof u === "function") subs.push(u); };

    if (online) {
        keep(room.onRoom((nextRoom) => { roomData = nextRoom; render(); }));
        if (room.isHost) {
            newGame({ autostart: false }); // host pemilik state canonical
            keep(room.onAction((action) => applyAction(action, 1)));
        } else {
            render(); // "Connecting…" sampai state pertama tiba
            keep(room.onState((nextState) => { state = nextState; render(); }));
        }
    } else {
        newGame({ autostart: false }); // mode AI lokal, tanpa room/database
    }

    return {
        destroy() {
            destroyed = true;
            clearFlow();
            cancelAnim();
            timers.forEach(cancelTimer);
            timers.clear();
            root.removeEventListener("click", handleClick);
            root.removeEventListener("change", handleChange);
            root.removeEventListener("pointermove", handlePointerMove);
            root.removeEventListener("pointerleave", hideHl);
            document.removeEventListener("keydown", handleKey);
            subs.forEach((u) => { try { u(); } catch { } });
        },
    };
}