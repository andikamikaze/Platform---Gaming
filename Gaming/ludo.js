/* ==== GAME: ludo.js ==== */
/*
  Ludo — papan klasik, tampilan minimalis gelap.
  Mode AI  : Red (kamu) vs Blue AI, giliran pertama diundi.
  Mode room: host otoritatif, kursi Red/Blue diundi acak oleh host.
  Semua state serializable (aman untuk Firebase), animasi murni CSS.
*/

export const META = {
    id: "ludo", // harus sama dengan nama file (tanpa .js)
    name: "Ludo",
    category: "board",
    catLabel: "Board",
    desc: "Race 4 pawns home, capture foes, exact roll to finish. vs AI or a friend.",
    art: '<svg viewBox="0 0 48 48" width="54" height="54" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="17" y="5" width="14" height="38" rx="3"/><rect x="5" y="17" width="38" height="14" rx="3"/><circle cx="11" cy="11" r="2.4" fill="currentColor" stroke="none"/><circle cx="37" cy="11" r="2.4" fill="currentColor" stroke="none"/><circle cx="11" cy="37" r="2.4" fill="currentColor" stroke="none"/><circle cx="37" cy="37" r="2.4" fill="currentColor" stroke="none"/><circle cx="24" cy="24" r="3.4" fill="currentColor" stroke="none"/></svg>',
    bg: ["#fee2e2", "#fecaca"],
};

export function mount(root, context = {}) {
    const { mode = "ai", room = null, playerName = "Player", onExit = () => { } } = context;
    const online = mode === "room" && Boolean(room);
    const fallbackIndex = online && !room.isHost ? 1 : 0;
    let roomData = room?.room || null;
    let state = null;

    /* ---------------- geometri papan ---------------- */
    const CELL = 40;
    const SVGNS = "http://www.w3.org/2000/svg";
    const TRACK = [
        [1, 6], [2, 6], [3, 6], [4, 6], [5, 6],
        [6, 5], [6, 4], [6, 3], [6, 2], [6, 1], [6, 0],
        [7, 0], [8, 0],
        [8, 1], [8, 2], [8, 3], [8, 4], [8, 5],
        [9, 6], [10, 6], [11, 6], [12, 6], [13, 6], [14, 6],
        [14, 7], [14, 8],
        [13, 8], [12, 8], [11, 8], [10, 8], [9, 8],
        [8, 9], [8, 10], [8, 11], [8, 12], [8, 13], [8, 14],
        [7, 14], [6, 14],
        [6, 13], [6, 12], [6, 11], [6, 10], [6, 9],
        [5, 8], [4, 8], [3, 8], [2, 8], [1, 8], [0, 8],
        [0, 7], [0, 6],
    ];
    const SAFE = new Set([0, 8, 13, 21, 26, 34, 39, 47]);
    const STAR =
        "M0,-7.2L1.8,-2.5L6.9,-2.2L2.9,0.9L4.2,5.8L0,3.1L-4.2,5.8L-2.9,0.9L-6.9,-2.2L-1.8,-2.5Z";

    /* Palet gelap: papan tidak lagi terlalu cerah */
    const PL = [
        {
            label: "Red", color: "#ef4444",
            yard: "#2a1418", stretch: "#4c1d24", start: "#7f1d1d", tri: "#dc2626",
            startIdx: 0,
            slots: [[70, 70], [170, 70], [70, 170], [170, 170]],
            stretchCells: [[1, 7], [2, 7], [3, 7], [4, 7], [5, 7]],
            home: [[259, 300], [276, 287], [276, 313], [292, 300]],
        },
        {
            label: "Blue", color: "#3b82f6",
            yard: "#111a30", stretch: "#1c2f55", start: "#1e40af", tri: "#2563eb",
            startIdx: 26,
            slots: [[430, 430], [530, 430], [430, 530], [530, 530]],
            stretchCells: [[13, 7], [12, 7], [11, 7], [10, 7], [9, 7]],
            home: [[341, 300], [324, 287], [324, 313], [308, 300]],
        },
    ];
    const DECOR = [
        {
            color: "#22c55e", yard: "#0f2016", stretch: "#16351f", start: "#166534", tri: "#16a34a",
            yardXY: [360, 0], startIdx: 13,
            stretchCells: [[7, 1], [7, 2], [7, 3], [7, 4], [7, 5]],
        },
        {
            color: "#eab308", yard: "#221c0c", stretch: "#3a2f10", start: "#713f12", tri: "#ca8a04",
            yardXY: [0, 360], startIdx: 39,
            stretchCells: [[7, 13], [7, 12], [7, 11], [7, 10], [7, 9]],
        },
    ];
    const PIPS = {
        1: [[32, 32]],
        2: [[21, 21], [43, 43]],
        3: [[21, 21], [32, 32], [43, 43]],
        4: [[21, 21], [43, 21], [21, 43], [43, 43]],
        5: [[21, 21], [43, 21], [32, 32], [21, 43], [43, 43]],
        6: [[21, 18], [43, 18], [21, 32], [43, 32], [21, 46], [43, 46]],
    };

    /* ---------------- shell (minimalis, tanpa tutorial) ---------------- */
    root.innerHTML = `
<style>
.ludo-app{background:#0b1220;border:1px solid #16213a;border-radius:18px;padding:18px 18px 16px;color:#cbd5e1;}
.ludo-app .game-intro{display:flex;align-items:center;justify-content:space-between;gap:12px;margin:0 0 14px;}
.ludo-app .game-intro h2{margin:0;font-size:17px;font-weight:700;color:#e2e8f0;letter-spacing:.01em;}
.ludo-app .game-status{display:inline-flex;align-items:center;gap:7px;font-size:12px;color:#94a3b8;background:#0e1830;border:1px solid #1f2b45;border-radius:999px;padding:5px 11px;white-space:nowrap;}
.ludo-app .game-status-dot{width:8px;height:8px;border-radius:50%;background:#ef4444;flex:0 0 auto;}
.ludo-app .game-panel{margin:0;}
.ludo-stage{position:relative;display:flex;gap:22px;align-items:center;justify-content:center;flex-wrap:wrap;}
.ludo-board{flex:0 1 520px;min-width:250px;max-width:560px;}
.ludo-board svg{display:block;width:100%;height:auto;}
.ludo-rail{display:flex;flex-direction:column;gap:14px;width:196px;}
.ludo-die-wrap{display:flex;flex-direction:column;align-items:center;gap:5px;}
.ludo-die-btn{background:none;border:0;padding:0;border-radius:16px;cursor:pointer;transition:transform .15s ease,opacity .15s ease,box-shadow .2s ease;}
.ludo-die-btn:disabled{opacity:.38;cursor:default;}
.ludo-die-btn:not(:disabled):hover{transform:translateY(-2px);}
.ludo-die-btn.armed{box-shadow:0 0 0 2px #26334f,0 0 18px rgba(226,232,240,.14);}
.ludo-die-btn:focus-visible{outline:2px solid #64748b;outline-offset:3px;}
.ludo-die{display:block;width:68px;height:68px;}
.ludo-die-btn.pop .ludo-die{animation:ludoPop .34s ease;}
.ludo-force{font-size:11px;color:#fbbf24;letter-spacing:.04em;}
.ludo-players{display:flex;flex-direction:column;gap:8px;}
.ludo-pchip{display:flex;align-items:center;gap:8px;background:#0e1830;border:1px solid #1f2b45;border-radius:10px;padding:8px 10px;font-size:12px;color:#7c8aa5;transition:border-color .2s ease;}
.ludo-pchip.active{border-color:var(--pc);}
.ludo-pchip .ludo-dot{width:8px;height:8px;border-radius:50%;background:var(--pc);flex:0 0 auto;}
.ludo-pname{color:#e2e8f0;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:86px;}
.ludo-pstat{margin-left:auto;white-space:nowrap;}
.ludo-pstat b{color:#cbd5e1;font-weight:600;}
.ludo-msg{margin:0;font-size:12px;line-height:1.45;color:#8b93a7;min-height:2.9em;}
.ludo-pawn{transition:transform .3s cubic-bezier(.2,.8,.3,1);}
.ludo-pawn .ring{opacity:0;}
.ludo-pawn .num{display:none;pointer-events:none;}
.ludo-pawn.movable{cursor:pointer;}
.ludo-pawn.movable .ring{opacity:1;animation:ludoPulse .95s ease-in-out infinite;transform-box:fill-box;transform-origin:center;}
.ludo-pawn.movable .num{display:block;}
.ludo-pawn.movable .inner{display:none;}
.ludo-ov{position:absolute;inset:0;z-index:6;display:flex;align-items:center;justify-content:center;background:rgba(4,8,20,.72);backdrop-filter:blur(3px);border-radius:16px;padding:14px;}
.ludo-ov[hidden]{display:none;}
.ludo-card{background:#0f172a;border:1px solid #223052;border-radius:14px;padding:22px;max-width:330px;width:100%;text-align:center;display:flex;flex-direction:column;gap:12px;align-items:center;}
.ludo-ov-title{margin:0;font-size:19px;font-weight:700;color:#e2e8f0;}
.ludo-ov-sub{margin:0;font-size:12.5px;line-height:1.55;color:#8b93a7;}
.ludo-btn{background:#16223c;border:1px solid #26334f;color:#cbd5e1;border-radius:9px;padding:8px 13px;font-size:12.5px;font-family:inherit;cursor:pointer;transition:background .15s ease,border-color .15s ease,color .15s ease;}
.ludo-btn:hover{background:#1c2a49;border-color:#33436b;color:#e2e8f0;}
.ludo-btn:disabled{opacity:.4;cursor:default;}
.ludo-btn.primary{background:#e2e8f0;border-color:#e2e8f0;color:#0b1220;font-weight:600;}
.ludo-btn.primary:hover{background:#ffffff;}
.ludo-cheat-card{max-width:340px;gap:10px;}
.ludo-cheat-note{margin:-6px 0 0;font-size:11px;color:#64748b;}
.ludo-cheat-sec{width:100%;display:flex;flex-direction:column;gap:6px;align-items:flex-start;}
.ludo-cheat-label{font-size:10.5px;text-transform:uppercase;letter-spacing:.09em;color:#64748b;}
.ludo-dice-row{display:grid;grid-template-columns:repeat(6,1fr);gap:6px;width:100%;}
.ludo-dice-btn{padding:7px 0;text-align:center;}
.ludo-dice-btn.sel{border-color:#fbbf24;color:#fbbf24;}
.ludo-cheat-list{display:flex;flex-direction:column;gap:6px;width:100%;}
.ludo-cheat-list .ludo-btn{width:100%;text-align:left;}
.ludo-app .game-actions{display:flex;gap:8px;justify-content:center;flex-wrap:wrap;margin-top:16px;}
.ludo-app .game-action-button{background:transparent;border:1px solid #26334f;color:#94a3b8;border-radius:9px;padding:7px 14px;font-size:12.5px;font-family:inherit;cursor:pointer;transition:background .15s ease,color .15s ease,border-color .15s ease;}
.ludo-app .game-action-button:hover{background:#101c36;color:#e2e8f0;border-color:#33436b;}
@keyframes ludoPulse{0%,100%{opacity:.25;transform:scale(1);}50%{opacity:1;transform:scale(1.26);}}
@keyframes ludoPop{0%{transform:scale(1) rotate(0deg);}30%{transform:scale(.88) rotate(-9deg);}65%{transform:scale(1.09) rotate(7deg);}100%{transform:scale(1) rotate(0deg);}}
@media (max-width:760px){
  .ludo-stage{gap:14px;}
  .ludo-rail{order:-1;flex-direction:row;flex-wrap:wrap;align-items:center;justify-content:center;width:100%;max-width:560px;gap:12px;}
  .ludo-players{flex:1 1 170px;max-width:250px;}
  .ludo-msg{flex-basis:100%;text-align:center;min-height:1.5em;}
}
@media (prefers-reduced-motion:reduce){.ludo-app *{animation:none!important;transition:none!important;}}
</style>
<div class="game-app ludo-app">
  <div class="game-intro">
    <h2>Ludo</h2>
    <span class="game-status"><i class="game-status-dot" data-dot></i><span data-status>Ready</span></span>
  </div>
  <section class="game-panel">
    <div class="ludo-stage">
      <div class="ludo-board"><svg viewBox="0 0 600 600" font-family="inherit" role="img" aria-label="Ludo board"></svg></div>
      <div class="ludo-rail">
        <div class="ludo-die-wrap">
          <button class="ludo-die-btn" type="button" data-act="roll" aria-label="Roll die" disabled>
            <svg class="ludo-die" viewBox="0 0 64 64" aria-hidden="true"></svg>
          </button>
          <span class="ludo-force" data-force hidden></span>
        </div>
        <div class="ludo-players">
          <div class="ludo-pchip" data-chip="0" style="--pc:#ef4444"><span class="ludo-dot"></span><span class="ludo-pname" data-name="0">You</span><span class="ludo-pstat"><b data-home="0">0</b>/4 · <b data-cap="0">0</b> caps</span></div>
          <div class="ludo-pchip" data-chip="1" style="--pc:#3b82f6"><span class="ludo-dot"></span><span class="ludo-pname" data-name="1">Blue AI</span><span class="ludo-pstat"><b data-home="1">0</b>/4 · <b data-cap="1">0</b> caps</span></div>
        </div>
        <p class="ludo-msg" data-msg></p>
      </div>
      <div class="ludo-ov" data-ov="win" hidden>
        <div class="ludo-card">
          <h3 class="ludo-ov-title" data-win-title></h3>
          <p class="ludo-ov-sub" data-win-sub></p>
          <button class="ludo-btn primary" type="button" data-act="restart">Play again</button>
        </div>
      </div>
      <div class="ludo-ov" data-ov="cheat" hidden>
        <div class="ludo-card ludo-cheat-card">
          <h3 class="ludo-ov-title">Cheats</h3>
          <p class="ludo-cheat-note">Offline only · you are Red</p>
          <div class="ludo-cheat-sec">
            <span class="ludo-cheat-label">Next roll</span>
            <div class="ludo-dice-row">
              ${[1, 2, 3, 4, 5, 6].map((v) => `<button class="ludo-btn ludo-dice-btn" type="button" data-cheat="dice" data-value="${v}">${v}</button>`).join("")}
            </div>
          </div>
          <div class="ludo-cheat-list">
            <button class="ludo-btn" type="button" data-cheat="shield" data-shield-btn>Shield: Off</button>
            <button class="ludo-btn" type="button" data-cheat="release">Release all pawns</button>
            <button class="ludo-btn" type="button" data-cheat="warp">Warp a pawn home</button>
            <button class="ludo-btn" type="button" data-cheat="banish">Send foes to yard</button>
            <button class="ludo-btn" type="button" data-cheat="win">Win instantly</button>
          </div>
          <button class="ludo-btn primary" type="button" data-act="cheat-close">Close</button>
        </div>
      </div>
    </div>
  </section>
  <div class="game-actions">
    <button class="game-action-button" type="button" data-act="restart">Restart</button>
    <button class="game-action-button" type="button" data-act="cheat" data-cheat-toggle>Cheats</button>
    <button class="game-action-button" type="button" data-exit>Exit game</button>
  </div>
</div>`;

    /* ---------------- refs ---------------- */
    const svg = root.querySelector(".ludo-board svg");
    const dieSvg = root.querySelector(".ludo-die");
    const dieBtn = root.querySelector('[data-act="roll"]');
    const statusEl = root.querySelector("[data-status]");
    const statusDot = root.querySelector("[data-dot]");
    const msgEl = root.querySelector("[data-msg]");
    const forceEl = root.querySelector("[data-force]");
    const ovWin = root.querySelector('[data-ov="win"]');
    const winTitle = root.querySelector("[data-win-title]");
    const winSub = root.querySelector("[data-win-sub]");
    const ovCheat = root.querySelector('[data-ov="cheat"]');
    const shieldBtn = root.querySelector("[data-shield-btn]");
    const cheatToggleBtn = root.querySelector("[data-cheat-toggle]");
    const chips = [0, 1].map((pl) => ({
        el: root.querySelector(`[data-chip="${pl}"]`),
        name: root.querySelector(`[data-name="${pl}"]`),
        home: root.querySelector(`[data-home="${pl}"]`),
        cap: root.querySelector(`[data-cap="${pl}"]`),
    }));
    const diceBtns = Array.from(root.querySelectorAll(".ludo-dice-btn"));
    const cheatBtns = Array.from(root.querySelectorAll("[data-cheat]"));

    let aiTimer = null;
    let cheatOpen = false;
    let lastRollTotal = 0;
    const subs = [];
    const addSub = (u) => { if (typeof u === "function") subs.push(u); };

    /* ---------------- kursi pemain (undi acak saat online) ---------------- */
    function myIndex() {
        if (!online) return 0;
        if (state && Array.isArray(state.seats)) return room.isHost ? state.seats[0] : state.seats[1];
        return fallbackIndex;
    }
    function seatName(pl) {
        if (pl === myIndex()) return online ? (playerName || "You") : "You";
        return PL[pl].label + (online ? "" : " AI");
    }

    /* ---------------- state (serializable, aman Firebase) ---------------- */
    function normalize(s) {
        if (!s) return null;
        s.movable = Array.isArray(s.movable) ? s.movable : [];
        s.winner = s.winner === 0 || s.winner === 1 ? s.winner : null;
        s.forceDice = Number.isInteger(s.forceDice) && s.forceDice >= 1 && s.forceDice <= 6 ? s.forceDice : null;
        s.shield = Boolean(s.shield);
        s.msg = typeof s.msg === "string" ? s.msg : "";
        s.seats = Array.isArray(s.seats) ? s.seats : [0, 1];
        return s;
    }
    function freshState() {
        // Undi kursi Red/Blue (online) + undi siapa jalan duluan (semua mode).
        const seats = online ? (Math.random() < 0.5 ? [0, 1] : [1, 0]) : [0, 1];
        const first = Math.random() < 0.5 ? 0 : 1;
        return normalize({
            pawns: [[-1, -1, -1, -1], [-1, -1, -1, -1]],
            turn: first,
            phase: "roll", // roll | choose | over
            dice: 6,
            sixes: 0,
            rolls: [0, 0],
            caps: [0, 0],
            movable: [],
            winner: null,
            forceDice: null,
            shield: false,
            seats,
            msg: "Coin toss — " + PL[first].label + " starts.",
        });
    }

    /* ---------------- papan statis ---------------- */
    function boardMarkup() {
        let s = '<rect x="1" y="1" width="598" height="598" rx="16" fill="#0d1526" stroke="#243354" stroke-width="1.5"/>';
        const yard = (x, y, p) => {
            s += `<rect x="${x + 8}" y="${y + 8}" width="224" height="224" rx="16" fill="${p.yard}"/>`;
            s += `<rect x="${x + 36}" y="${y + 36}" width="168" height="168" rx="12" fill="#0e1830" stroke="${p.stretch}" stroke-width="1.5"/>`;
        };
        yard(0, 0, PL[0]);
        yard(360, 0, DECOR[0]);
        yard(0, 360, DECOR[1]);
        yard(360, 360, PL[1]);
        const cell = (c, r, fill) => {
            s += `<rect x="${c * CELL}" y="${r * CELL}" width="${CELL}" height="${CELL}" fill="${fill}" stroke="#243354" stroke-width="1"/>`;
        };
        for (let i = 0; i < 52; i++) {
            const [c, r] = TRACK[i];
            const fill =
                i === PL[0].startIdx ? PL[0].start :
                    i === PL[1].startIdx ? PL[1].start :
                        i === DECOR[0].startIdx ? DECOR[0].start :
                            i === DECOR[1].startIdx ? DECOR[1].start : "#131d33";
            cell(c, r, fill);
        }
        PL.forEach((p) => p.stretchCells.forEach(([c, r]) => cell(c, r, p.stretch)));
        DECOR.forEach((p) => p.stretchCells.forEach(([c, r]) => cell(c, r, p.stretch)));
        SAFE.forEach((i) => {
            const [c, r] = TRACK[i];
            const cx = c * CELL + 20, cy = r * CELL + 20;
            const col =
                i === PL[0].startIdx ? PL[0].color :
                    i === PL[1].startIdx ? PL[1].color :
                        i === DECOR[0].startIdx ? DECOR[0].color :
                            i === DECOR[1].startIdx ? DECOR[1].color : "#5b6b85";
            s += `<path d="${STAR}" transform="translate(${cx},${cy})" fill="#0d1526" stroke="${col}" stroke-width="1.4"/>`;
        });
        const tri = (color, pts) => {
            s += `<polygon points="${pts.map((p) => p.join(",")).join(" ")}" fill="${color}" stroke="#0b1220" stroke-width="2" opacity="0.92"/>`;
        };
        tri(PL[0].tri, [[240, 240], [240, 360], [300, 300]]);
        tri(DECOR[0].tri, [[240, 240], [360, 240], [300, 300]]);
        tri(PL[1].tri, [[360, 240], [360, 360], [300, 300]]);
        tri(DECOR[1].tri, [[240, 360], [360, 360], [300, 300]]);
        PL.forEach((p) => p.slots.forEach(([x, y]) => {
            s += `<circle cx="${x}" cy="${y}" r="17" fill="#0b1220" stroke="${p.start}" stroke-width="2"/>`;
        }));
        return s;
    }

    /* ---------------- pion ---------------- */
    const pawnEls = [];
    function buildPawns() {
        for (let pl = 0; pl < 2; pl++) {
            for (let i = 0; i < 4; i++) {
                const g = document.createElementNS(SVGNS, "g");
                g.setAttribute("class", "ludo-pawn");
                g.dataset.p = pl;
                g.dataset.i = i;
                const col = PL[pl].color;
                g.innerHTML =
                    `<circle class="ring" r="15.5" fill="none" stroke="${col}" stroke-width="3"/>` +
                    `<circle class="body" r="11.5" fill="${col}" stroke="#f1f5f9" stroke-width="2"/>` +
                    `<circle class="inner" r="3.6" fill="#ffffff" opacity="0.95"/>` +
                    `<text class="num" y="3.8" text-anchor="middle" font-size="10.5" font-weight="700" fill="#ffffff">${i + 1}</text>` +
                    `<circle class="hit" r="19" fill="#ffffff" opacity="0" pointer-events="all"/>`;
                g.style.transform = `translate(${PL[pl].slots[i][0]}px,${PL[pl].slots[i][1]}px)`;
                svg.appendChild(g);
                pawnEls.push(g);
            }
        }
    }
    function pawnPos(pl, i) {
        const pos = state.pawns[pl][i];
        if (pos === -1) return PL[pl].slots[i];
        if (pos === 56) return PL[pl].home[i];
        if (pos <= 50) {
            const [c, r] = TRACK[(PL[pl].startIdx + pos) % 52];
            return [c * CELL + 20, r * CELL + 20];
        }
        const [c, r] = PL[pl].stretchCells[pos - 51];
        return [c * CELL + 20, r * CELL + 20];
    }
    function locKey(pl, i) {
        const pos = state.pawns[pl][i];
        if (pos === -1 || pos === 56) return "u" + pl + "-" + i;
        if (pos <= 50) return "t" + ((PL[pl].startIdx + pos) % 52);
        return "s" + pl + "-" + pos;
    }
    function offsets(n) {
        if (n <= 1) return [[0, 0]];
        const R = n === 2 ? 7 : n <= 4 ? 8 : 10;
        const out = [];
        for (let k = 0; k < n; k++) {
            const a = -Math.PI / 2 + (k * 2 * Math.PI) / n;
            out.push([Math.cos(a) * R, Math.sin(a) * R]);
        }
        return out;
    }

    /* ---------------- dadu ---------------- */
    function showDie(v) {
        dieSvg.innerHTML =
            '<rect x="2" y="2" width="60" height="60" rx="14" fill="#e2e8f0"/>' +
            PIPS[v].map((p) => `<circle cx="${p[0]}" cy="${p[1]}" r="5" fill="#0f172a"/>`).join("");
    }

    /* ---------------- render ---------------- */
    function render() {
        if (!state) {
            statusEl.textContent = online ? "Waiting for host…" : "Ready";
            statusDot.style.background = "#64748b";
            dieBtn.disabled = true;
            msgEl.textContent = "";
            return;
        }
        const mine = myIndex();
        const over = state.winner !== null;

        statusEl.textContent = over
            ? (state.winner === mine ? "You win" : PL[state.winner].label + " wins")
            : (state.turn === mine ? "Your turn" : PL[state.turn].label + "'s turn");
        statusDot.style.background = PL[over ? state.winner : state.turn].color;

        for (let pl = 0; pl < 2; pl++) {
            chips[pl].el.classList.toggle("active", !over && state.turn === pl);
            chips[pl].name.textContent = seatName(pl);
            chips[pl].home.textContent = state.pawns[pl].filter((p) => p === 56).length;
            chips[pl].cap.textContent = state.caps[pl];
        }

        showDie(state.dice);
        const canRoll = !over && state.phase === "roll" && state.turn === mine;
        dieBtn.disabled = !canRoll;
        dieBtn.classList.toggle("armed", canRoll);
        forceEl.hidden = !state.forceDice;
        if (state.forceDice) forceEl.textContent = "next · " + state.forceDice;

        const total = state.rolls[0] + state.rolls[1];
        if (total !== lastRollTotal) {
            lastRollTotal = total;
            dieBtn.classList.remove("pop");
            void dieBtn.offsetWidth;
            dieBtn.classList.add("pop");
        }

        const groups = {};
        for (let pl = 0; pl < 2; pl++) {
            for (let i = 0; i < 4; i++) {
                const k = locKey(pl, i);
                (groups[k] || (groups[k] = [])).push(pl * 4 + i);
            }
        }
        Object.keys(groups).forEach((k) => {
            const list = groups[k];
            const off = offsets(list.length);
            list.forEach((id, idx) => {
                const pl = Math.floor(id / 4), i = id % 4;
                const p = pawnPos(pl, i);
                pawnEls[id].style.transform = `translate(${p[0] + off[idx][0]}px,${p[1] + off[idx][1]}px)`;
            });
        });
        const canPick = !over && state.phase === "choose" && state.turn === mine;
        pawnEls.forEach((g, id) => {
            const pl = Math.floor(id / 4), i = id % 4;
            g.classList.toggle("movable", canPick && pl === mine && state.movable.includes(i));
        });

        msgEl.textContent = state.msg;

        ovWin.hidden = !over;
        if (over) {
            const mineWin = state.winner === mine;
            winTitle.textContent = mineWin ? "You win" : PL[state.winner].label + " wins";
            winTitle.style.color = mineWin ? "#4ade80" : "#f87171";
            winSub.textContent =
                "Captures — Red " + state.caps[0] + " · Blue " + state.caps[1] +
                ". Rolls — Red " + state.rolls[0] + " · Blue " + state.rolls[1] + ".";
        }

        if (cheatOpen) {
            shieldBtn.textContent = "Shield: " + (state.shield ? "On" : "Off");
            diceBtns.forEach((b) => b.classList.toggle("sel", +b.dataset.value === state.forceDice));
            cheatBtns.forEach((b) => { b.disabled = over; });
        }
    }

    function publish() {
        render();
        if (online && room.isHost) room.publishState(state).catch(console.warn);
        if (!online) scheduleAI();
    }

    /* ---------------- aturan ---------------- */
    function movablePawns(pl, v) {
        const out = [];
        for (let i = 0; i < 4; i++) {
            const p = state.pawns[pl][i];
            if (p === -1 ? v === 6 : p + v <= 56) out.push(i);
        }
        return out;
    }
    function passTurn() {
        state.sixes = 0;
        state.turn = 1 - state.turn;
        state.phase = "roll";
        state.movable = [];
    }
    function execMove(pl, pi) {
        const v = state.dice;
        const pos = state.pawns[pl][pi];
        if (pos === -1 && v !== 6) return;
        if (pos !== -1 && pos + v > 56) return;
        const name = PL[pl].label;
        state.movable = [];
        state.pawns[pl][pi] = pos === -1 ? 0 : pos + v;
        const np = state.pawns[pl][pi];
        let captured = false;
        let extra = "";
        if (np <= 50) {
            const cell = (PL[pl].startIdx + np) % 52;
            const op = 1 - pl;
            const shielded = !online && op === 0 && state.shield;
            if (!SAFE.has(cell) && !shielded) {
                for (let j = 0; j < 4; j++) {
                    const o = state.pawns[op][j];
                    if (o >= 0 && o <= 50 && (PL[op].startIdx + o) % 52 === cell) {
                        state.pawns[op][j] = -1;
                        captured = true;
                        state.caps[pl]++;
                    }
                }
            }
        }
        if (captured) extra += name + " captured a pawn. ";
        if (np === 56) extra += name + " pawn reached home. ";
        else if (np === 51) extra += name + " entered the home stretch. ";

        if (state.pawns[pl].every((p) => p === 56)) {
            state.winner = pl;
            state.phase = "over";
            state.movable = [];
            state.msg = name + " wins!";
            return;
        }
        if (v === 6 || captured) {
            state.phase = "roll";
            state.msg = (extra + name + " rolls again.").trim();
        } else {
            state.msg = extra.trim() || name + " moved.";
            passTurn();
        }
    }

    /* ---------------- AI (hanya mode offline) ---------------- */
    function pickAI(mov, v) {
        let best = mov[0], bs = -Infinity;
        const active = state.pawns[1].filter((p) => p >= 0 && p < 56).length;
        for (const pi of mov) {
            const pos = state.pawns[1][pi];
            let sc;
            if (pos === -1) {
                sc = 55 + (active <= 1 ? 20 : 0);
            } else {
                const t = pos + v;
                sc = 14 + t * 0.45;
                if (t === 56) sc += 95;
                if (t >= 51 && pos < 51) sc += 26;
                if (t <= 50) {
                    const cell = (26 + t) % 52;
                    const safe = SAFE.has(cell);
                    if (safe) sc += 12;
                    for (let j = 0; j < 4; j++) {
                        const o = state.pawns[0][j];
                        if (o < 0 || o > 50) continue;
                        const oc = (PL[0].startIdx + o) % 52;
                        if (oc === cell && !safe && !state.shield) sc += 110;
                        if (!safe) {
                            const d = (cell - oc + 52) % 52;
                            if (d >= 1 && d <= 6) sc -= 7;
                        }
                    }
                }
            }
            sc += Math.random() * 5;
            if (sc > bs) { bs = sc; best = pi; }
        }
        return best;
    }
    function scheduleAI() {
        if (aiTimer) { clearTimeout(aiTimer); aiTimer = null; }
        if (online || !state || state.winner !== null || state.turn !== 1) return;
        if (state.phase === "roll") {
            aiTimer = setTimeout(() => { aiTimer = null; applyAction({ type: "roll" }, 1); }, 750);
        } else if (state.phase === "choose") {
            aiTimer = setTimeout(() => {
                aiTimer = null;
                const mov = state.movable || [];
                if (!mov.length) return;
                applyAction({ type: "move", pawn: pickAI(mov, state.dice) }, 1);
            }, 620);
        }
    }

    /* ---------------- cheat (offline saja) ---------------- */
    function applyCheat(action) {
        if (!state || state.winner !== null) return;
        const c = action.cheat;
        if (c === "dice") {
            const v = Number(action.value);
            if (Number.isInteger(v) && v >= 1 && v <= 6) {
                state.forceDice = v;
                state.msg = "Cheat armed — next roll is " + v + ".";
            }
        } else if (c === "shield") {
            state.shield = !state.shield;
            state.msg = "Cheat — shield " + (state.shield ? "on." : "off.");
        } else if (c === "release") {
            state.pawns[0] = state.pawns[0].map((p) => (p === -1 ? 0 : p));
            state.msg = "Cheat — all pawns released.";
        } else if (c === "warp") {
            let bi = -1, bp = -2;
            state.pawns[0].forEach((p, i) => { if (p < 56 && p > bp) { bp = p; bi = i; } });
            if (bi >= 0) { state.pawns[0][bi] = 56; state.msg = "Cheat — a pawn warped home."; }
            if (state.pawns[0].every((p) => p === 56)) {
                state.winner = 0; state.phase = "over"; state.movable = [];
                state.msg = "You win!";
                return;
            }
        } else if (c === "banish") {
            state.pawns[1] = state.pawns[1].map((p) => (p >= 0 && p < 56 ? -1 : p));
            state.msg = "Cheat — foes sent to the yard.";
        } else if (c === "win") {
            state.pawns[0] = [56, 56, 56, 56];
            state.winner = 0; state.phase = "over"; state.movable = [];
            state.msg = "You win!";
            return;
        } else {
            return;
        }
        if (state.phase === "choose") {
            const m = movablePawns(state.turn, state.dice);
            state.movable = m;
            if (!m.length) passTurn();
        }
    }
    function setCheatOpen(v) {
        cheatOpen = Boolean(v) && !online;
        ovCheat.hidden = !cheatOpen;
        if (cheatOpen) render();
    }

    /* ---------------- aksi (host otoritatif) ---------------- */
    function applyAction(action, actor) {
        if (!state || !action || typeof action.type !== "string") return;
        if (actor !== 0 && actor !== 1) return;
        switch (action.type) {
            case "restart": {
                state = freshState();
                publish();
                break;
            }
            case "roll": {
                if (state.winner !== null || state.phase !== "roll" || state.turn !== actor) return;
                let v;
                if (!online && actor === 0 && state.forceDice) {
                    v = state.forceDice;
                    state.forceDice = null;
                } else {
                    v = 1 + Math.floor(Math.random() * 6);
                }
                state.rolls[actor]++;
                state.dice = v;
                state.sixes = v === 6 ? state.sixes + 1 : 0;
                const name = PL[actor].label;
                if (state.sixes >= 3) {
                    state.msg = name + " rolled a third 6 — turn forfeited.";
                    passTurn();
                    publish();
                    break;
                }
                const mov = movablePawns(actor, v);
                if (!mov.length) {
                    state.msg = name + " rolled " + v + " — no possible move.";
                    passTurn();
                    publish();
                    break;
                }
                if (mov.length === 1) {
                    state.msg = name + " rolled " + v + ".";
                    execMove(actor, mov[0]);
                    publish();
                    break;
                }
                state.phase = "choose";
                state.movable = mov;
                state.msg = name + " rolled " + v + " — pick a pawn.";
                publish();
                break;
            }
            case "move": {
                if (state.winner !== null || state.phase !== "choose" || state.turn !== actor) return;
                const pi = action.pawn;
                if (!Number.isInteger(pi) || !state.movable.includes(pi)) return;
                execMove(actor, pi);
                publish();
                break;
            }
            case "cheat": {
                if (online || actor !== 0) return;
                applyCheat(action);
                publish();
                break;
            }
        }
    }

    function submitAction(action) {
        if (online && !room.isHost) {
            room.sendAction(action).catch(console.warn);
            return;
        }
        applyAction(action, myIndex());
    }

    /* ---------------- input: mouse + sentuh langsung + keyboard ---------------- */
    function tryRoll() {
        if (state && state.winner === null && state.phase === "roll" && state.turn === myIndex()) {
            submitAction({ type: "roll" });
        }
    }
    function tryMove(i) {
        if (state && state.winner === null && state.phase === "choose" &&
            state.turn === myIndex() && state.movable.includes(i)) {
            submitAction({ type: "move", pawn: i });
        }
    }
    function handleClick(event) {
        if (event.target.closest("[data-exit]")) { onExit(); return; }
        const act = event.target.closest("[data-act]");
        if (act) {
            const a = act.dataset.act;
            if (a === "roll") { if (!act.disabled) submitAction({ type: "roll" }); }
            else if (a === "restart") submitAction({ type: "restart" });
            else if (a === "cheat") setCheatOpen(!cheatOpen);
            else if (a === "cheat-close") setCheatOpen(false);
            return;
        }
        const ch = event.target.closest("[data-cheat]");
        if (ch) {
            submitAction({
                type: "cheat",
                cheat: ch.dataset.cheat,
                value: ch.dataset.value ? +ch.dataset.value : undefined,
            });
            return;
        }
        const pawn = event.target.closest(".ludo-pawn");
        if (pawn) {
            if (!state || state.winner !== null || state.phase !== "choose" || state.turn !== myIndex()) return;
            const pl = +pawn.dataset.p, pi = +pawn.dataset.i;
            if (pl !== myIndex() || !state.movable.includes(pi)) return;
            submitAction({ type: "move", pawn: pi });
        }
    }
    function onKey(e) {
        if (e.repeat) return;
        const k = e.key;
        if (k === "Escape") { if (cheatOpen) setCheatOpen(false); return; }
        if (cheatOpen) {
            if (!online && k >= "1" && k <= "6") submitAction({ type: "cheat", cheat: "dice", value: +k });
            else if ((k === "c" || k === "C") && !online) setCheatOpen(false);
            return;
        }
        if (e.code === "Space") { e.preventDefault(); tryRoll(); return; }
        if (k >= "1" && k <= "4") { tryMove(+k - 1); return; }
        if (k === "r" || k === "R") { submitAction({ type: "restart" }); return; }
        if ((k === "c" || k === "C") && !online) setCheatOpen(true);
    }

    /* ---------------- init ---------------- */
    svg.innerHTML = boardMarkup();
    buildPawns();
    showDie(6);
    cheatToggleBtn.hidden = online;
    root.addEventListener("click", handleClick);
    document.addEventListener("keydown", onKey);

    if (online) {
        if (typeof room.onRoom === "function") {
            addSub(room.onRoom((nextRoom) => { roomData = nextRoom; render(); }));
        }
        if (room.isHost) {
            state = freshState();
            publish();
            if (typeof room.onAction === "function") {
                // Aksi guest selalu diterapkan sebagai kursi guest hasil undian.
                addSub(room.onAction((action) =>
                    applyAction(action, state && Array.isArray(state.seats) ? state.seats[1] : 1)));
            }
        } else {
            render();
            if (typeof room.onState === "function") {
                addSub(room.onState((nextState) => { state = normalize(nextState); render(); }));
            }
        }
    } else {
        state = freshState();
        publish();
    }

    return {
        destroy() {
            if (aiTimer) { clearTimeout(aiTimer); aiTimer = null; }
            root.removeEventListener("click", handleClick);
            document.removeEventListener("keydown", onKey);
            subs.forEach((u) => { try { u(); } catch (_) { } });
            subs.length = 0;
        },
    };
}