/* ==== GAME: count-the-cube.js ==== */
/* Count the Cube — turn-based cube counting (solo vs bot / 1v1 room).
   Random starter, random seats, wireframe verification before next round. */

import { iconSVG } from "../JS/icons.js";

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

    /* ---------------- shell: HUD + fill board + overlays ---------------- */
    root.innerHTML = `
<style>
.cc-app{--line:#e2e8f0;--ink:#0f172a;--mut:#64748b;--acc:#4f46e5;--good:#059669;--bad:#dc2626;color:var(--ink);font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;display:flex;flex-direction:column;gap:10px;width:100%;height:100%;min-height:0}
.cc-app *{box-sizing:border-box}
.cc-app [hidden]{display:none!important}
.cc-app h3{margin:0;font-size:18px;font-weight:700}
.cc-hud{display:flex;align-items:center;gap:6px 10px;flex-wrap:wrap;font:600 11px/1 ui-monospace,SFMono-Regular,Menlo,monospace}
.cc-chip{display:inline-flex;align-items:center;gap:6px;padding:5px 9px;border:1px solid var(--line);border-radius:999px;background:#fff;color:var(--mut);white-space:nowrap}
.cc-chip b{color:var(--ink);font-weight:700;font-variant-numeric:tabular-nums}
.cc-side{gap:5px}
.cc-side .nm{max-width:84px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.cc-dot{width:7px;height:7px;border-radius:50%;background:var(--acc);flex:none}
.cc-dot.off{background:var(--line)}
.cc-status-dot{width:7px;height:7px;border-radius:50%;background:var(--good);flex:none}
.cc-spacer{flex:1 1 auto}
.cc-btn{appearance:none;border:1px solid var(--line);background:#fff;color:var(--ink);border-radius:8px;min-height:44px;padding:8px 12px;font-size:13px;font-weight:600;cursor:pointer;transition:border-color .16s,background .16s;touch-action:manipulation;font-family:inherit}
.cc-btn:hover{border-color:var(--acc)}
.cc-btn:focus-visible{outline:2px solid var(--acc);outline-offset:2px}
.cc-btn:disabled{opacity:.45;cursor:default}
.cc-btn.primary{background:var(--acc);border-color:var(--acc);color:#fff}
.cc-btn.primary:hover{background:#4338ca}
.cc-icon-btn{display:inline-flex;align-items:center;gap:6px}
.cc-icon-btn svg{flex:none;display:block}
.cc-btn.on{border-color:var(--acc);color:var(--acc);background:#eef2ff}
.cc-board{position:relative;width:100%;flex:1 1 auto;min-height:0;overflow:hidden;background:#f8fafc;border:1px solid var(--line);border-radius:12px}
.cc-scene{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;padding:8px;touch-action:none;user-select:none;cursor:grab;overflow:hidden}
.cc-scene:active{cursor:grabbing}
.cc-scene svg{max-width:100%;max-height:100%}
.cc-reveal{position:absolute;top:8px;right:8px;font-size:12px;font-weight:700;color:var(--acc);background:#eef2ff;border:1px solid #c7d2fe;border-radius:999px;padding:4px 12px;z-index:2}
.cc-controls{display:flex;align-items:center;justify-content:center;gap:10px;flex-wrap:wrap;flex:none}
.cc-answer{display:flex;align-items:center;gap:8px}
.cc-input{width:110px;min-height:48px;text-align:center;font-size:26px;font-weight:700;color:var(--ink);background:#fff;border:1px solid var(--line);border-radius:8px;padding:8px 12px;letter-spacing:2px;outline:none;font-family:inherit}
.cc-input:focus{border-color:var(--acc);outline:2px solid var(--acc);outline-offset:1px}
.cc-input:disabled{background:#f8fafc;color:var(--mut)}
.cc-pad{display:grid;grid-template-columns:repeat(3,minmax(50px,64px));gap:6px}
.cc-key{height:44px;border:1px solid var(--line);border-radius:8px;background:#fff;font-size:18px;font-weight:700;color:var(--ink);cursor:pointer;touch-action:manipulation;font-family:inherit}
.cc-key:focus-visible{outline:2px solid var(--acc);outline-offset:2px}
.cc-key:active{background:#eef2ff;border-color:var(--acc)}
.cc-key:disabled{opacity:.45}
.cc-feedback{flex:1 1 100%;min-height:20px;text-align:center;font-size:14px;font-weight:600;color:var(--mut);line-height:1.4}
.cc-feedback.good{color:var(--good)}
.cc-feedback.bad{color:var(--bad)}
.cc-overlay{position:absolute;inset:0;z-index:5;display:flex;align-items:center;justify-content:center;padding:12px;background:rgba(248,250,252,.94);border-radius:inherit}
.cc-card{width:min(92%,420px);max-height:100%;overflow:hidden;border:1px solid var(--line);border-radius:12px;background:#fff;padding:16px;display:flex;flex-direction:column;gap:12px;box-shadow:0 4px 12px rgba(15,23,42,.06)}
.cc-head{display:flex;align-items:center;justify-content:space-between;gap:10px;flex:none}
.cc-head h3{font-size:15px}
.cc-foot{display:flex;align-items:center;justify-content:space-between;gap:10px;flex:none;margin-top:auto;padding-top:10px;border-top:1px solid var(--line)}
.cc-note{font-size:11px;color:var(--mut);line-height:1.5}
.cc-cheats,.cc-help,.cc-stats{flex:1 1 auto;min-height:0;overflow:auto}
.cc-cheat-row{display:flex;align-items:center;justify-content:space-between;gap:12px;min-height:44px;font-size:13px;font-weight:600}
.cc-switch{position:relative;width:44px;height:26px;border-radius:999px;border:1px solid var(--line);background:#e2e8f0;cursor:pointer;transition:background .16s;flex:none;margin:0;padding:0}
.cc-switch:focus-visible{outline:2px solid var(--acc);outline-offset:2px}
.cc-switch::after{content:"";position:absolute;top:3px;left:3px;width:18px;height:18px;border-radius:50%;background:#fff;transition:transform .16s}
.cc-switch[aria-pressed="true"]{background:var(--acc);border-color:var(--acc)}
.cc-switch[aria-pressed="true"]::after{transform:translateX(18px)}
.cc-help{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:14px}
.cc-help b{display:block;margin-bottom:6px;font-size:10px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--mut)}
.cc-help ul{margin:0 0 12px;padding-left:16px;font-size:12px;line-height:1.7;color:var(--mut)}
.cc-kbd{display:inline-block;padding:1px 5px;border:1px solid var(--line);border-bottom-width:2px;border-radius:5px;background:#f8fafc;color:var(--ink);font:inherit}
.cc-stats p{margin:0;font-size:13px;color:var(--mut);line-height:1.5}
@media (hover:hover) and (pointer:fine){.cc-app .cc-pad{display:none}}
@media (max-width:480px){
.cc-app .cc-controls{gap:8px}
.cc-app .cc-input{width:92px;font-size:22px}
}
@media (pointer:coarse){
.cc-app .cc-switch{width:52px;height:44px}
.cc-app .cc-switch::after{top:11px;width:20px;height:20px}
.cc-app .cc-switch[aria-pressed="true"]::after{transform:translateX(26px)}
}
@media (prefers-reduced-motion:reduce){.cc-app *{animation-duration:.01ms!important;animation-delay:0s!important;transition-duration:.01ms!important}}
/* --- layout redesign overrides (keep last) --- */
.cc-app.game-fill > .cc-board{flex:1 1 auto;min-height:0;aspect-ratio:auto}
@media (max-width:640px){
.cc-app.game-fill > .cc-board:not(:has(.cc-overlay:not([hidden]))){aspect-ratio:16/10;flex:0 0 auto}
.cc-app.game-fill > .cc-board:has(.cc-overlay:not([hidden])){flex:0 0 auto;min-height:min(70dvh,620px);aspect-ratio:auto}
.cc-app .cc-hud{gap:5px}
.cc-app .cc-hud .cc-chip{padding:4px 6px;font-size:9px}
.cc-app .cc-hud .cc-chip[data-hud="status"]{display:none}
.cc-app .cc-hud .cc-side .nm{max-width:46px}
.cc-app .cc-hud .cc-btn{min-height:32px;padding:5px 7px;font-size:9px}
.cc-app .cc-hud .cc-btn-label,.cc-app .cc-hud .cc-spacer{display:none}
.cc-app .cc-overlay{padding:8px}
.cc-app .cc-card{width:100%;height:100%;max-height:100%;padding:12px;border-radius:12px}
.cc-app .cc-cheats,.cc-app .cc-help,.cc-app .cc-stats{scrollbar-width:none}
.cc-app .cc-cheats::-webkit-scrollbar,.cc-app .cc-help::-webkit-scrollbar,.cc-app .cc-stats::-webkit-scrollbar{display:none}
.cc-app .cc-foot{position:static;margin:0;padding:10px 0 0;border-top:1px solid var(--line)}
.cc-app .cc-note{display:none}
.cc-app .cc-controls{gap:6px}
.cc-app .cc-input{width:82px;min-height:40px;font-size:20px;padding:4px 8px}
.cc-app .cc-key{height:40px;font-size:16px}
}
</style>
<div class="game-app cc-app game-fill" data-cc>
  <div class="cc-hud">
    <span class="cc-chip">ROUND <b data-round>1</b>/${ROUNDS}</span>
    <span class="cc-chip cc-side" data-side="0"><i class="cc-dot" data-lv></i><span class="nm" data-nm></span><b data-sc>0</b></span>
    <span class="cc-chip cc-side" data-side="1"><i class="cc-dot" data-lv></i><span class="nm" data-nm></span><b data-sc>0</b></span>
    <span class="cc-chip" data-hud="status"><i class="cc-status-dot"></i><span data-status aria-live="polite">Your turn</span></span>
    <span class="cc-spacer"></span>
    <button class="cc-btn cc-icon-btn" type="button" data-act="rotate" aria-label="Rotate view" title="Rotate view (Q/E)">${iconSVG("rotateCw", { size: 14 })}<span class="cc-btn-label">Rotate</span></button>
    <button class="cc-btn cc-icon-btn" type="button" data-help aria-label="How to play" title="How to play (H)">${iconSVG("helpCircle", { size: 14 })}<span class="cc-btn-label">Help</span></button>
    <button class="cc-btn cc-icon-btn" type="button" data-cheats aria-label="Cheats" title="Cheats (C)">${iconSVG("wrench", { size: 14 })}<span class="cc-btn-label">Cheats</span></button>
    <button class="cc-btn cc-icon-btn" type="button" data-pause aria-label="Pause" title="Pause (P)">${iconSVG("pause", { size: 14 })}<span class="cc-btn-label">Pause</span></button>
    <button class="cc-btn cc-icon-btn" type="button" data-restart aria-label="Restart" title="Restart (R)">${iconSVG("refresh", { size: 14 })}<span class="cc-btn-label">Restart</span></button>
    <button class="cc-btn cc-icon-btn" type="button" data-exit aria-label="Exit game" title="Exit game">${iconSVG("logOut", { size: 14 })}<span class="cc-btn-label">Exit game</span></button>
  </div>
  <section class="game-panel cc-board" data-board>
    <div class="cc-scene" data-scene></div>
    <span class="cc-reveal" data-reveal hidden></span>
    <div class="cc-overlay" data-ov="over" hidden>
      <div class="cc-card">
        <div class="cc-head"><h3 data-over-title>Game over</h3></div>
        <div class="cc-stats"><p data-over-reason></p></div>
        <div class="cc-foot"><span class="cc-note">Better luck next round</span><button class="cc-btn primary" type="button" data-act="restart">Play again</button></div>
      </div>
    </div>
    <div class="cc-overlay" data-ov="pause" hidden>
      <div class="cc-card">
        <div class="cc-head"><h3>Paused</h3></div>
        <div class="cc-foot"><span class="cc-note">Press P or Esc to resume</span><button class="cc-btn primary" type="button" data-resume>Resume</button></div>
      </div>
    </div>
    <div class="cc-overlay" data-ov="cheat" hidden>
      <div class="cc-card">
        <div class="cc-head"><h3>Cheats</h3><button class="cc-btn" type="button" data-act="close-cheats">Close</button></div>
        <div class="cc-cheats">
          <div class="cc-cheat-row"><span>Show total</span><button type="button" class="cc-switch" data-cheat="reveal" aria-pressed="false" aria-label="Show total"></button></div>
          <div class="cc-cheat-row"><span>X-ray wireframe</span><button type="button" class="cc-switch" data-cheat="xray" aria-pressed="false" aria-label="X-ray wireframe"></button></div>
          <div class="cc-cheat-row"><span>Auto-fill answer</span><button type="button" class="cc-btn" data-act="autofill">Fill</button></div>
          <div class="cc-cheat-row" data-cheat-bot><span>Bot always wrong</span><button type="button" class="cc-switch" data-cheat="botBlunder" aria-pressed="false" aria-label="Bot always wrong"></button></div>
        </div>
        <div class="cc-foot"><span class="cc-note">Cheats are local to this device</span><button class="cc-btn" type="button" data-act="close-cheats">Close</button></div>
      </div>
    </div>
    <div class="cc-overlay" data-ov="help" hidden>
      <div class="cc-card">
        <div class="cc-head"><h3>How to play</h3><button class="cc-btn" type="button" data-help-close>Close</button></div>
        <div class="cc-help">
          <div>
            <b>Desktop</b>
            <ul>
              <li>Type the number of cubes, then press <span class="cc-kbd">Enter</span> or click Check.</li>
              <li><span class="cc-kbd">Q</span>/<span class="cc-kbd">E</span> or <span class="cc-kbd">&#8592;</span>/<span class="cc-kbd">&#8594;</span> rotate the stack; drag or scroll the scene too.</li>
              <li><span class="cc-kbd">Backspace</span> deletes a digit; <span class="cc-kbd">Enter</span> submits or advances.</li>
              <li><span class="cc-kbd">H</span> help &middot; <span class="cc-kbd">C</span> cheats &middot; <span class="cc-kbd">P</span>/<span class="cc-kbd">Esc</span> pause &middot; <span class="cc-kbd">R</span> restart.</li>
            </ul>
            <b>Mobile</b>
            <ul>
              <li>Tap the number pad, then Check. Rotate with the Rotate button or drag the stack.</li>
            </ul>
          </div>
          <div>
            <b>Rules</b>
            <ul>
              <li>Count every cube in the stack, including hidden ones.</li>
              <li>Players take turns; a correct answer scores, a wrong one costs a life.</li>
              <li>After each answer the wireframe view reveals the exact column counts.</li>
              <li>First to run the other out of lives &mdash; or leading after ${ROUNDS} rounds &mdash; wins.</li>
            </ul>
          </div>
        </div>
        <div class="cc-foot"><span class="cc-note">Press H to reopen this guide</span><button class="cc-btn primary" type="button" data-help-close>Got it</button></div>
      </div>
    </div>
  </section>
  <div class="cc-controls">
    <div class="cc-answer">
      <input class="cc-input" data-input inputmode="numeric" pattern="[0-9]*" maxlength="3" autocomplete="off" placeholder="0" aria-label="Your answer" disabled>
      <button type="button" class="cc-btn primary" data-act="submit" disabled>Check</button>
      <button type="button" class="cc-btn primary" data-act="next" hidden>Next round</button>
    </div>
    <div class="cc-pad" data-pad></div>
    <div class="cc-feedback" data-fb aria-live="polite"></div>
  </div>
</div>`;

    /* ---------------- refs ---------------- */
    const $ = (s) => root.querySelector(s);
    const board = $("[data-board]");
    const statusEl = $("[data-status]"),
        roundEl = $("[data-round]"),
        sceneEl = $("[data-scene]"),
        revealEl = $("[data-reveal]"),
        inputEl = $("[data-input]"),
        submitBtn = $('[data-act="submit"]'),
        nextBtn = $('[data-act="next"]'),
        padEl = $("[data-pad]"),
        fbEl = $("[data-fb]"),
        pauseBtn = $("[data-pause]"),
        overTitleEl = $("[data-over-title]"),
        overReasonEl = $("[data-over-reason]");
    const ov = {
        over: $('[data-ov="over"]'),
        pause: $('[data-ov="pause"]'),
        cheat: $('[data-ov="cheat"]'),
        help: $('[data-ov="help"]'),
    };
    const sideEls = [root.querySelector('[data-side="0"]'), root.querySelector('[data-side="1"]')];
    if (online) $("[data-cheat-bot]").hidden = true;

    /* ---------------- local (non-synced) state ---------------- */
    let viewRot = 0,
        puzzleKey = "",
        botTimer = null,
        cheatsOpen = false,
        helpOpen = false,
        paused = false,
        frozen = false,
        freezeAt = 0,
        freezePerfAt = 0,
        wheelAt = 0,
        wheelPerfAt = 0;
    let seenHelp = true;
    try { seenHelp = localStorage.getItem("countTheCubeHelpSeen") === "1"; } catch (_) { seenHelp = true; }
    if (!seenHelp) {
        helpOpen = true;
        try { localStorage.setItem("countTheCubeHelpSeen", "1"); } catch (_) { /* storage blocked */ }
    }
    const cheats = { reveal: false, xray: false, botBlunder: false };
    const unsubs = [];

    /* random seat assignment: host draws a seat, guest gets the other one */
    function mySeat() {
        if (!online) return 0;
        if (!state) return room.isHost ? 0 : 1;
        return room.isHost ? state.hostSeat : 1 - state.hostSeat;
    }
    function canPlay() {
        return !frozen && Boolean(state) && state.phase === "play" && state.turn === mySeat();
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

    /* ---------------- freeze / overlays ---------------- */
    function syncFreeze() {
        const next = paused || helpOpen || cheatsOpen;
        if (next === frozen) return;
        frozen = next;
        if (frozen) {
            freezeAt = Date.now();
            freezePerfAt = performance.now();
            if (botTimer) { clearTimeout(botTimer); botTimer = null; }
        } else {
            const shift = freezeAt ? Date.now() - freezeAt : 0;
            const perfShift = freezePerfAt ? performance.now() - freezePerfAt : 0;
            freezeAt = 0;
            freezePerfAt = 0;
            wheelAt += shift;
            wheelPerfAt += perfShift;
            scheduleBot();
        }
    }
    function toggleHelp(on) {
        helpOpen = typeof on === "boolean" ? on : !helpOpen;
        if (helpOpen) cheatsOpen = false;
        syncFreeze();
        render();
    }
    function toggleCheats(on) {
        cheatsOpen = typeof on === "boolean" ? on : !cheatsOpen;
        if (cheatsOpen) { helpOpen = false; paused = false; }
        syncFreeze();
        render();
    }
    function togglePause(on) {
        paused = typeof on === "boolean" ? on : !paused;
        if (paused) { cheatsOpen = false; helpOpen = false; }
        syncFreeze();
        render();
    }
    function syncOverlays() {
        ov.over.hidden = !state || state.phase !== "over" || cheatsOpen || helpOpen || paused;
        ov.pause.hidden = !paused || cheatsOpen || helpOpen;
        ov.cheat.hidden = !cheatsOpen || helpOpen || paused;
        ov.help.hidden = !helpOpen;
        const label = pauseBtn.querySelector(".cc-btn-label");
        if (label) label.textContent = paused ? "Resume" : "Pause";
        pauseBtn.setAttribute("aria-label", paused ? "Resume" : "Pause");
        pauseBtn.title = paused ? "Resume (P)" : "Pause (P)";
    }

    /* ---------------- render ---------------- */
    function render() {
        if (!state) {
            statusEl.textContent = "Waiting for host…";
            syncOverlays();
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
            const card = sideEls[s],
                p = state.players[s];
            card.classList.toggle("active", state.phase === "play" && state.turn === s);
            card.querySelector("[data-nm]").textContent = p.name + (s === me ? " (you)" : "");
            card.querySelector("[data-sc]").textContent = String(p.score);
            card.querySelector("[data-lv]").innerHTML = Array.from(
                { length: LIVES },
                (_, i) => '<i class="cc-dot' + (i < p.lives ? "" : " off") + '"></i>',
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

        if (state.phase === "over") {
            const w = state.winner;
            overTitleEl.textContent =
                w === -1 ? "Draw" : w === me ? "You win!" : state.players[w].name + " wins";
            const [a, b] = state.players;
            overReasonEl.textContent =
                a.name + " " + a.score + " — " + b.score + " " + b.name +
                (state.endReason === "lives" ? " · out of lives" : "");
        }
        syncOverlays();
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
        if (online || !state || frozen) return;
        if (botTimer) {
            clearTimeout(botTimer);
            botTimer = null;
        }
        if (state.phase !== "play" || state.turn !== 1) return;
        botTimer = setTimeout(() => {
            botTimer = null;
            if (!state || frozen || state.phase !== "play" || state.turn !== 1) return;
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
        if (frozen || !state || state.phase === "over") return;
        viewRot = (viewRot + dir + 4) % 4;
        render(); /* view-only: never published, answer unchanged */
    }
    function check() {
        if (!canPlay() || inputEl.value === "") return;
        submitAction({ type: "answer", value: parseInt(inputEl.value, 10) });
    }
    function advanceOrCheck() {
        if (frozen || !state) return;
        if (state.phase === "verify") submitAction({ type: "next" });
        else if (state.phase === "over") submitAction({ type: "restart" });
        else check();
    }
    function restartGame() {
        cheatsOpen = false;
        helpOpen = false;
        paused = false;
        syncFreeze();
        submitAction({ type: "restart" });
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
        const t = event.target;
        if (!t || !t.closest) return;
        if (t.closest("[data-exit]")) { onExit(); return; }
        if (t.closest("[data-help]")) { toggleHelp(); return; }
        if (t.closest("[data-help-close]")) { toggleHelp(false); return; }
        if (t.closest("[data-cheats]")) { toggleCheats(); return; }
        if (t.closest("[data-pause]")) { togglePause(); return; }
        if (t.closest("[data-resume]")) { togglePause(false); return; }
        if (t.closest("[data-restart]")) { restartGame(); return; }
        const sw = t.closest("[data-cheat]");
        if (sw) {
            const k = sw.dataset.cheat;
            cheats[k] = !cheats[k];
            sw.setAttribute("aria-pressed", String(cheats[k]));
            render();
            return;
        }
        const btn = t.closest("[data-act]");
        if (!btn) return;
        const a = btn.dataset.act;
        if (a === "close-cheats") { toggleCheats(false); return; }
        if (a === "restart") { restartGame(); return; }
        if (a === "autofill") {
            if (state && state.phase === "play" && state.turn === mySeat()) {
                inputEl.value = String(state.answer);
                inputEl.focus();
            }
            return;
        }
        if (frozen) return;
        if (a === "rotate") rotate(1);
        else if (a === "submit") check();
        else if (a === "next") submitAction({ type: "next" });
    }
    function onPad(e) {
        if (frozen) return;
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
        if (e.ctrlKey || e.metaKey || e.altKey) return;
        const code = e.code;
        const tag = e.target && e.target.tagName;
        const typing = tag === "INPUT" || tag === "TEXTAREA";

        if (code === "KeyH") { toggleHelp(); e.preventDefault(); return; }
        if (code === "KeyC") { if (!helpOpen && !paused) toggleCheats(); e.preventDefault(); return; }
        if (code === "KeyP" || e.key === "Escape") {
            if (helpOpen) toggleHelp(false);
            else if (cheatsOpen) toggleCheats(false);
            else togglePause();
            e.preventDefault();
            return;
        }
        if (code === "KeyR" && !typing) { restartGame(); e.preventDefault(); return; }
        if (typing) {
            if (e.key === "Enter") { e.preventDefault(); advanceOrCheck(); }
            return;
        }
        if (frozen) { e.preventDefault(); return; }
        if (code === "ArrowRight" || code === "KeyE") { e.preventDefault(); rotate(1); return; }
        if (code === "ArrowLeft" || code === "KeyQ") { e.preventDefault(); rotate(-1); return; }
        if (e.key >= "0" && e.key <= "9") pressKey(e.key);
        else if (e.key === "Backspace") {
            e.preventDefault();
            if (canPlay()) inputEl.value = inputEl.value.slice(0, -1);
        } else if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            advanceOrCheck();
        }
    }
    /* mouse: drag + wheel rotation on the scene */
    let dragX = null,
        dragAcc = 0;
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
        const now = Date.now(), pnow = performance.now();
        if (now - wheelAt < 160 || pnow - wheelPerfAt < 160) return;
        wheelAt = now;
        wheelPerfAt = pnow;
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
    syncFreeze();
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
