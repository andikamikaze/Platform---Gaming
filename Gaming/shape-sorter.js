/*
  shape-sorter.js — Shape Sorter (kategori: kids)
  Mengikuti template: export const META + export function mount(root, context).
  Setelah menambah/mengubah file ini, jalankan: node tools/build-games-manifest.mjs

  Mode:
  - mode "ai"   : race melawan bot (giliran pertama diacak tiap match).
  - mode "room" : multiplayer host-authoritative (kursi P1/P2 diacak tiap match).
*/

export const META = {
    id: "shape-sorter", // harus sama dengan nama file (tanpa .js)
    name: "Shape Sorter",
    category: "kids",
    catLabel: "Kids",
    desc: "Race a rival: solve each shape puzzle and tap the matching bin. First to 8 points wins — wrong picks cost hearts!",
    art: '<svg viewBox="0 0 48 48" width="54" height="54" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="13" cy="14" r="8"/><rect x="29" y="6" width="16" height="16" rx="3"/><path d="M13 44l9-15 9 15z"/><path stroke-width="2.5" d="M38 31l2 5.3 5.6 .2 -4.4 3.5 1.5 5.4 -4.7 -3.1 -4.7 3.1 1.5 -5.4 -4.4 -3.5 5.6 -.2z"/></svg>',
    bg: ["#fbcfe8", "#f9a8d4"],
    bestKey: "shapeSorterBestStreak",
};

export function mount(root, context = {}) {
    const { mode = "ai", room = null, playerName = "Player", onExit = () => { } } = context;
    const online = mode === "room" && Boolean(room);
    /* roleIndex: 0 = host / pemain lokal, 1 = guest / bot (basis template).
       Kursi pertandingan (P1/P2) diacak oleh host di state.seats. */
    const roleIndex = online && !room.isHost ? 1 : 0;
    let roomData = (room && room.room) || null;
    let state = null;

    /* ================= aturan murni ================= */
    const SHAPES = ["circle", "square", "triangle", "star"];
    const GLYPH = { circle: "\u25CF", square: "\u25A0", triangle: "\u25B2", star: "\u2605" };
    const COLORS = [
        { name: "RED", hex: "#ef4444" },
        { name: "ORANGE", hex: "#f97316" },
        { name: "YELLOW", hex: "#eab308" },
        { name: "GREEN", hex: "#22c55e" },
        { name: "BLUE", hex: "#3b82f6" },
        { name: "PURPLE", hex: "#8b5cf6" },
    ];
    const NUM_WORD = ["ONE", "TWO", "THREE", "FOUR"];
    const TARGET = 8;      /* poin untuk menang */
    const HEARTS = 3;      /* nyawa awal tiap pemain */
    const LEVEL_STEP = 6;  /* tiap 6 puzzle = naik level (variasi bertambah) */
    const BOT_ACC = 0.78;  /* akurasi bot normal */
    const BOT_ACC_DIZZY = 0.12; /* saat cheat "Clumsy bot" aktif */

    const KIND_META = {
        shape: { label: "SHAPES", prompt: "MATCH THE SHAPE", hint: "Tap the bin with the same shape." },
        color: { label: "COLORS", prompt: "MATCH THE COLOR", hint: "Tap the bin with the same color." },
        word: { label: "WORDS", prompt: "FIND ITS NAME", hint: "Look at the shape, then tap its name." },
        count: { label: "COUNTING", prompt: "COUNT THE SHAPES", hint: "Count the shapes, then tap that number." },
        pattern: { label: "PATTERNS", prompt: "FINISH THE PATTERN", hint: "What comes next? Tap the missing shape." },
        odd: { label: "ODD ONE", prompt: "SPOT THE ODD ONE", hint: "Three are the same \u2014 tap the different one." },
    };
    const POOL_L1 = ["shape", "color"];
    const POOL_L2 = ["shape", "color", "word", "count"];
    const POOL_L3 = ["shape", "color", "word", "count", "pattern", "odd"];

    /* mulberry32 — PRNG deterministik kecil (dipakai bersama antar klien) */
    function mulberry32(a) {
        return function () {
            a |= 0;
            a = (a + 0x6d2b79f5) | 0;
            let t = Math.imul(a ^ (a >>> 15), 1 | a);
            t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    }
    const ri = (rnd, n) => Math.floor(rnd() * n) % n;
    function shuffle(arr, rnd) {
        const a = arr.slice();
        for (let i = a.length - 1; i > 0; i--) {
            const j = ri(rnd, i + 1);
            const tmp = a[i]; a[i] = a[j]; a[j] = tmp;
        }
        return a;
    }

    /* ---------- generator level acak, DIJAMIN bisa diselesaikan ----------
       Setiap puzzle dibangun dengan tepat SATU bin yang benar dari 4 bin unik,
       deterministik dari seed → host & guest melihat puzzle identik tanpa
       perlu mengirim data puzzle lewat jaringan. */
    let gen = null;
    function stream(seed) {
        if (!gen || gen.seed !== seed) gen = { seed: seed, rnd: mulberry32(seed), list: [] };
        return gen;
    }
    function puzzleAt(seed, index) {
        const g = stream(seed);
        while (g.list.length <= index) g.list.push(buildNext(g));
        return g.list[index];
    }
    function shapeBins(rnd) {
        return shuffle(SHAPES, rnd).map((s) => ({ type: "shape", value: s, label: s.toUpperCase() }));
    }
    function buildNext(g) {
        const rnd = g.rnd;
        const i = g.list.length;
        const level = Math.floor(i / LEVEL_STEP) + 1;
        const pool = level >= 3 ? POOL_L3 : level === 2 ? POOL_L2 : POOL_L1;
        let kind = pool[ri(rnd, pool.length)];
        if (i >= 2 && g.list[i - 1].kind === kind && g.list[i - 2].kind === kind) {
            kind = pool[(pool.indexOf(kind) + 1 + ri(rnd, pool.length - 1)) % pool.length];
        }
        const meta = KIND_META[kind];
        let bins, answer, item, ghost;

        if (kind === "shape") {
            bins = shapeBins(rnd);
            answer = ri(rnd, 4);
            const color = COLORS[ri(rnd, COLORS.length)].hex;
            item = { shape: bins[answer].value, color: color };
            ghost = { shape: item.shape, color: color };
        } else if (kind === "color") {
            bins = shuffle(COLORS, rnd).slice(0, 4).map((c) => ({ type: "color", value: c.hex, label: c.name }));
            answer = ri(rnd, 4);
            item = { shape: SHAPES[ri(rnd, SHAPES.length)], color: bins[answer].value };
            ghost = { shape: item.shape, color: item.color };
        } else if (kind === "word") {
            bins = shuffle(SHAPES, rnd).map((s) => ({ type: "word", value: s, label: s.toUpperCase() }));
            answer = ri(rnd, 4);
            item = { shape: bins[answer].value, color: "#334155" };
            ghost = { shape: item.shape, color: item.color };
        } else if (kind === "count") {
            bins = [1, 2, 3, 4].map((n) => ({ type: "count", value: n, label: String(n), sub: NUM_WORD[n - 1] }));
            const n = 1 + ri(rnd, 4);
            answer = n - 1;
            const color = COLORS[ri(rnd, COLORS.length)].hex;
            item = { n: n, shape: SHAPES[ri(rnd, SHAPES.length)], color: color };
            ghost = { shape: item.shape, color: color };
        } else if (kind === "pattern") {
            const picks = shuffle(SHAPES, rnd);
            const period = rnd() < 0.5 ? 2 : 3;
            const unit = picks.slice(0, period);
            const seq = [];
            for (let k = 0; k < 5; k++) seq.push(unit[k % period]);
            const next = unit[5 % period];
            bins = shapeBins(rnd);
            answer = bins.findIndex((b) => b.value === next);
            item = { seq: seq };
            ghost = { shape: next, color: "#334155" };
        } else { /* odd one out */
            const picks = shuffle(SHAPES, rnd);
            const common = picks[0], odd = picks[1];
            const cells = [common, common, common, odd];
            const oddPos = ri(rnd, 4);
            const tmp = cells[3]; cells[3] = cells[oddPos]; cells[oddPos] = tmp;
            bins = shapeBins(rnd);
            answer = bins.findIndex((b) => b.value === odd);
            const color = COLORS[ri(rnd, COLORS.length)].hex;
            item = { cells: cells, color: color };
            ghost = { shape: odd, color: color };
        }
        return { kind: kind, level: level, label: meta.label, prompt: meta.prompt, hint: meta.hint, bins: bins, answer: answer, item: item, ghost: ghost };
    }

    /* ================= util presentasi ================= */
    const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
    const cleanName = (s) => (String(s || "").trim().slice(0, 18) || "Player");
    const HEART_D = "M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z";
    const heartIcon = (filled) => '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path d="' + HEART_D + '" fill="' + (filled ? "#f87171" : "#dbe2ec") + '"/></svg>';

    function shapeNode(shape, color) {
        if (shape === "circle") return '<circle r="21" fill="' + color + '"/>';
        if (shape === "square") return '<rect x="-19" y="-19" width="38" height="38" rx="8" fill="' + color + '"/>';
        if (shape === "triangle") return '<path d="M0 -20 L20 15 L-20 15 Z" fill="' + color + '" stroke="' + color + '" stroke-width="7" stroke-linejoin="round"/>';
        return '<path d="M0 -24 L6.5 -8.9 L22.8 -7.4 L10.5 3.4 L14.1 19.4 L0 11 L-14.1 19.4 L-10.5 3.4 L-22.8 -7.4 L-6.5 -8.9 Z" fill="' + color + '" stroke="' + color + '" stroke-width="5" stroke-linejoin="round"/>';
    }
    function shapeOutline(shape) {
        if (shape === "circle") return '<circle r="16"/>';
        if (shape === "square") return '<rect x="-14" y="-14" width="28" height="28" rx="5"/>';
        if (shape === "triangle") return '<path d="M0 -16 L15 12 L-15 12 Z"/>';
        return '<path d="M0 -16 L4.3 -5.9 L15.2 -4.9 L7 2.3 L9.4 12.9 L0 7.3 L-9.4 12.9 L-7 2.3 L-15.2 -4.9 L-4.3 -5.9 Z"/>';
    }

    /* geometri papan (viewBox 560 x 360) */
    const BIN_W = 124, BIN_H = 112, BIN_GAP = 12, BIN_X0 = 14, BIN_Y = 232;
    const BIN_CX = [0, 1, 2, 3].map((i) => BIN_X0 + i * (BIN_W + BIN_GAP) + BIN_W / 2);
    const ITEM_X = 280, ITEM_Y = 124;

    function binSvg(bin, i, locked, revealed) {
        const x = BIN_X0 + i * (BIN_W + BIN_GAP);
        const cx = BIN_CX[i];
        let s = '<g class="ss-bin' + (locked ? " ss-locked" : "") + '" data-bin="' + i + '">';
        s += '<rect class="ss-bin-bg" x="' + x + '" y="' + BIN_Y + '" width="' + BIN_W + '" height="' + BIN_H + '" rx="16"/>';
        s += '<circle cx="' + (x + 17) + '" cy="' + (BIN_Y + 17) + '" r="9" fill="#f1f5f9" stroke="#e2e8f0"/>';
        s += '<text x="' + (x + 17) + '" y="' + (BIN_Y + 21) + '" font-size="10" font-weight="700" text-anchor="middle" fill="#64748b">' + (i + 1) + "</text>";
        if (bin.type === "shape") {
            s += '<g transform="translate(' + cx + " " + (BIN_Y + 46) + ')" fill="none" stroke="#475569" stroke-width="3.5" stroke-linejoin="round" stroke-linecap="round">' + shapeOutline(bin.value) + "</g>";
            s += '<text x="' + cx + '" y="' + (BIN_Y + 94) + '" font-size="12.5" font-weight="700" text-anchor="middle" letter-spacing="1" fill="#64748b">' + bin.label + "</text>";
        } else if (bin.type === "color") {
            s += '<circle cx="' + cx + '" cy="' + (BIN_Y + 46) + '" r="17" fill="' + bin.value + '"/>';
            s += '<text x="' + cx + '" y="' + (BIN_Y + 94) + '" font-size="12.5" font-weight="700" text-anchor="middle" letter-spacing="1" fill="#64748b">' + bin.label + "</text>";
        } else if (bin.type === "word") {
            s += '<text x="' + cx + '" y="' + (BIN_Y + 62) + '" font-size="19" font-weight="800" text-anchor="middle" letter-spacing="1" fill="#1e293b">' + bin.label + "</text>";
        } else { /* count */
            s += '<text x="' + cx + '" y="' + (BIN_Y + 56) + '" font-size="30" font-weight="800" text-anchor="middle" fill="#1e293b">' + bin.value + "</text>";
            const n = bin.value;
            for (let k = 0; k < n; k++) {
                s += '<circle cx="' + (cx + (k - (n - 1) / 2) * 11) + '" cy="' + (BIN_Y + 72) + '" r="3.2" fill="#94a3b8"/>';
            }
            s += '<text x="' + cx + '" y="' + (BIN_Y + 94) + '" font-size="11" font-weight="700" text-anchor="middle" letter-spacing="1" fill="#64748b">' + bin.sub + "</text>";
        }
        if (revealed) {
            s += '<rect class="ss-ring" x="' + (x - 4) + '" y="' + (BIN_Y - 4) + '" width="' + (BIN_W + 8) + '" height="' + (BIN_H + 8) + '" rx="20" fill="none" stroke="#6366f1" stroke-width="2.5" stroke-dasharray="7 6"/>';
        }
        s += "</g>";
        return s;
    }

    function itemSvg(p) {
        let inner = "";
        const it = p.item;
        if (p.kind === "count") {
            for (let k = 0; k < it.n; k++) {
                inner += '<g transform="translate(' + (ITEM_X + (k - (it.n - 1) / 2) * 58) + " " + ITEM_Y + ') scale(1.05)">' + shapeNode(it.shape, it.color) + "</g>";
            }
        } else if (p.kind === "pattern") {
            const w = 62, gap = 8, x0 = ITEM_X - (6 * w + 5 * gap) / 2, y = ITEM_Y - w / 2;
            for (let k = 0; k < 6; k++) {
                const x = x0 + k * (w + gap);
                if (k < 5) {
                    inner += '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + w + '" rx="12" fill="#ffffff" stroke="#e2e8f0" stroke-width="1.5"/>';
                    inner += '<g transform="translate(' + (x + w / 2) + " " + (y + w / 2) + ') scale(.82)">' + shapeNode(it.seq[k], "#334155") + "</g>";
                } else {
                    inner += '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + w + '" rx="12" fill="#eef2ff" stroke="#6366f1" stroke-width="1.5" stroke-dasharray="5 5"/>';
                    inner += '<text x="' + (x + w / 2) + '" y="' + (y + w / 2 + 9) + '" font-size="26" font-weight="800" text-anchor="middle" fill="#6366f1">?</text>';
                }
            }
        } else if (p.kind === "odd") {
            const w = 78, gap = 12, x0 = ITEM_X - (4 * w + 3 * gap) / 2, y = ITEM_Y - w / 2;
            for (let k = 0; k < 4; k++) {
                const x = x0 + k * (w + gap);
                inner += '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + w + '" rx="14" fill="#ffffff" stroke="#e2e8f0" stroke-width="1.5"/>';
                inner += '<g transform="translate(' + (x + w / 2) + " " + (y + w / 2) + ') scale(1.05)">' + shapeNode(it.cells[k], it.color) + "</g>";
            }
        } else {
            inner = '<g transform="translate(' + ITEM_X + " " + ITEM_Y + ') scale(1.8)">' + shapeNode(it.shape, it.color) + "</g>";
        }
        return '<g class="ss-item">' + inner + "</g>";
    }

    function boardSvg(st) {
        const playing = st && st.phase === "playing";
        const p = st && st.phase !== "lobby" ? puzzleAt(st.seed, st.qi) : null;
        const mySeat = st ? st.seats[roleIndex] : 0;
        const myTurn = playing && st.turn === mySeat;
        const bins = p ? p.bins : shapeBins(mulberry32(7));
        let s = "";
        const prompt = playing ? p.prompt : st && st.phase === "over" ? "MATCH COMPLETE" : "SHAPE SORTER";
        s += '<text x="280" y="38" font-size="15" font-weight="800" text-anchor="middle" letter-spacing="3" fill="#94a3b8">' + prompt + "</text>";
        s += '<line x1="70" y1="206" x2="490" y2="206" stroke="#e2e8f0" stroke-width="1.5"/>';
        if (p) s += itemSvg(p);
        else s += '<g transform="translate(280 124) scale(1.6)" opacity=".35">' + shapeNode("star", "#c7d2fe") + "</g>";
        for (let i = 0; i < 4; i++) {
            s += binSvg(bins[i], i, !myTurn, Boolean(playing && cheats.reveal && p && i === p.answer));
        }
        return s;
    }

    /* ================= state & aturan main ================= */
    function freshMatch(names, matchNo, phase) {
        return {
            phase: phase,                 /* lobby | playing | over */
            seed: (Math.random() * 0x7fffffff) | 0,
            qi: 0,
            target: TARGET,
            scores: [0, 0],
            hearts: [HEARTS, HEARTS],
            tries: [0, 0],
            hits: [0, 0],
            seats: Math.random() < 0.5 ? [0, 1] : [1, 0], /* acak posisi P1/P2 */
            first: Math.random() < 0.5 ? 0 : 1,           /* acak jalan duluan  */
            turn: 0,
            names: names,
            winner: null,
            reason: "",
            result: null,
            matchNo: matchNo,
        };
    }
    function beginMatch(st) { st.turn = st.first; st.phase = "playing"; }

    const CHEATS = [
        { key: "reveal", label: "Reveal answer", desc: "Draw a dashed ring around the correct bin.", toggle: true, online: true },
        { key: "auto", label: "Auto-play my turn", desc: "Automatically pick the right bin on your turn.", toggle: true, online: true },
        { key: "shield", label: "Heart shield", desc: "Your wrong picks never cost a heart.", toggle: true, online: false },
        { key: "dizzy", label: "Clumsy bot", desc: "Bot accuracy drops to about 12%.", toggle: true, online: false },
        { key: "heart", label: "+1 heart", desc: "Instantly gain a heart (max 5).", toggle: false, online: false },
        { key: "skip", label: "Skip puzzle", desc: "Jump to the next puzzle, no penalty.", toggle: false, online: false },
    ];
    const cheats = { reveal: false, auto: false, shield: false, dizzy: false };
    let cheatUsed = false;

    let best = 0, streak = 0;
    try { best = parseInt(localStorage.getItem(META.bestKey) || "0", 10) || 0; } catch (err) { best = 0; }
    function writeBest() { try { localStorage.setItem(META.bestKey, String(best)); } catch (err) { /* abaikan */ } }

    /* ================= shell (tema minimalis) ================= */
    const legendRows = [
        ["\u25CF \u25A0", "Shapes", "Tap the bin with the same shape."],
        ["\u25CF\u25CF\u25CF", "Colors", "Tap the bin with the same color."],
        ["Aa", "Words", "Look at the shape, tap its name."],
        ["123", "Counting", "Count the shapes, tap that number."],
        ["A B A ?", "Patterns", "Tap the shape that comes next."],
        ["\u25CF\u25CF\u25B2\u25CF", "Odd one out", "Three are the same \u2014 tap the different one."],
    ].map((r) => '<div class="ss-leg"><span class="ss-leg-ic">' + r[0] + '</span><span><b>' + r[1] + "</b> \u2014 " + r[2] + "</span></div>").join("");

    root.innerHTML = `
<style>
.ss-app{--bg:#f6f7fb;--card:#ffffff;--line:#e2e8f0;--ink:#1e293b;--mut:#64748b;--acc:#6366f1;--good:#10b981;--bad:#ef4444;
  max-width:680px;margin:0 auto;color:var(--ink);font-family:inherit}
.ss-app [hidden]{display:none!important}
.ss-app .game-intro{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}
.ss-app .game-intro h2{margin:0;font-size:20px;font-weight:800;letter-spacing:.2px}
.ss-app .game-intro p{margin:2px 0 0;font-size:12.5px;color:var(--mut)}
.ss-app .game-status{display:inline-flex;align-items:center;gap:7px;font-size:12.5px;font-weight:600;color:var(--mut);
  background:var(--card);border:1px solid var(--line);border-radius:999px;padding:6px 12px}
.ss-app .game-status-dot{width:8px;height:8px;border-radius:50%;background:#cbd5e1;display:inline-block}
.ss-app .game-status.ss-live .game-status-dot{background:var(--acc);animation:ssPulse 1.2s ease infinite}
.ss-panel{position:relative;background:var(--bg);border:1px solid var(--line);border-radius:20px;padding:14px;margin-top:12px}
.ss-hud{display:grid;grid-template-columns:1fr auto 1fr;gap:10px;align-items:stretch;margin-bottom:10px}
.ss-pcard{background:var(--card);border:1.5px solid var(--line);border-radius:14px;padding:9px 12px;min-width:0}
.ss-pcard.ss-turn{border-color:var(--acc);box-shadow:0 0 0 3px rgba(99,102,241,.12)}
.ss-pname{font-size:12px;font-weight:700;color:var(--mut);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ss-pname b{color:var(--ink)}
.ss-ptag{display:inline-block;font-size:9.5px;font-weight:800;letter-spacing:.5px;color:var(--acc);background:#eef2ff;border-radius:6px;padding:1px 5px;margin-right:5px;vertical-align:1px}
.ss-you{display:inline-block;font-size:9.5px;font-weight:800;color:#fff;background:var(--acc);border-radius:6px;padding:1px 5px;margin-left:5px;vertical-align:1px}
.ss-pscore{font-size:22px;font-weight:800;line-height:1.15}
.ss-pscore small{font-size:11px;font-weight:600;color:var(--mut)}
.ss-phearts{display:flex;gap:2px;align-items:center;margin:2px 0 5px}
.ss-bar{height:5px;border-radius:99px;background:#eef1f6;overflow:hidden}
.ss-bar i{display:block;height:100%;background:var(--acc);border-radius:99px;transition:width .3s ease}
.ss-chip{align-self:center;text-align:center;font-size:10.5px;font-weight:800;letter-spacing:1px;color:var(--mut);
  background:var(--card);border:1px solid var(--line);border-radius:999px;padding:6px 10px;white-space:nowrap}
.ss-boardwrap{position:relative;background:var(--card);border:1px solid var(--line);border-radius:16px;overflow:hidden}
.ss-boardwrap svg{display:block;width:100%;height:auto;user-select:none;-webkit-user-select:none;font-family:inherit}
.ss-boardwrap.ss-shake{animation:ssShake .4s ease}
.ss-bin{cursor:pointer;touch-action:manipulation}
.ss-bin .ss-bin-bg{fill:#ffffff;stroke:#e2e8f0;stroke-width:1.5;transition:stroke .15s ease,fill .15s ease}
.ss-bin:hover .ss-bin-bg{stroke:#6366f1;fill:#fafaff}
.ss-bin.ss-locked{cursor:default}
.ss-bin.ss-locked:hover .ss-bin-bg{stroke:#e2e8f0;fill:#ffffff}
.ss-bin.ss-good .ss-bin-bg{fill:#ecfdf5;stroke:#10b981;animation:ssFlash .55s ease}
.ss-bin.ss-bad .ss-bin-bg{fill:#fef2f2;stroke:#ef4444;animation:ssFlash .55s ease}
.ss-item{animation:ssIn .35s ease both}
.ss-ghost{animation:ssGhost .55s cubic-bezier(.45,.05,.7,.4) both;pointer-events:none}
.ss-ring{animation:ssRing 1.1s linear infinite}
.ss-toast{position:absolute;left:50%;top:10px;transform:translateX(-50%) translateY(-6px);opacity:0;pointer-events:none;
  background:#1e293b;color:#fff;font-size:12px;font-weight:700;border-radius:999px;padding:6px 14px;transition:all .25s ease;white-space:nowrap;max-width:92%;overflow:hidden;text-overflow:ellipsis}
.ss-toast.show{opacity:1;transform:translateX(-50%) translateY(0)}
.ss-hint{margin:10px 2px 0;font-size:12.5px;color:var(--mut);font-weight:600;text-align:center;min-height:18px}
.ss-hint b{color:var(--acc)}
.ss-vbar{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-top:10px}
.ss-vbtn{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;min-height:56px;
  background:var(--card);border:1.5px solid var(--line);border-radius:14px;cursor:pointer;font-family:inherit;
  touch-action:manipulation;-webkit-tap-highlight-color:transparent;transition:border-color .15s ease,transform .05s ease;padding:6px 4px}
.ss-vbtn:hover{border-color:var(--acc)}
.ss-vbtn:active{transform:translateY(1px)}
.ss-vbtn.ss-vlock{opacity:.55}
.ss-vkey{font-size:9.5px;font-weight:800;color:var(--mut);letter-spacing:.5px}
.ss-vlabel{font-size:13px;font-weight:800;color:var(--ink);letter-spacing:.5px;display:flex;align-items:center;gap:5px}
.ss-vdot{width:11px;height:11px;border-radius:50%;display:inline-block}
.ss-overlay{position:absolute;inset:0;background:rgba(246,247,251,.94);backdrop-filter:blur(3px);display:flex;align-items:center;justify-content:center;padding:16px;z-index:5;border-radius:20px}
.ss-card{background:var(--card);border:1px solid var(--line);border-radius:18px;padding:20px 22px;max-width:440px;width:100%;
  box-shadow:0 12px 32px rgba(15,23,42,.08);max-height:100%;overflow:auto}
.ss-card h3{margin:0 0 6px;font-size:19px;font-weight:800}
.ss-card p{margin:6px 0;font-size:13px;color:var(--mut);line-height:1.5}
.ss-card p b{color:var(--ink)}
.ss-card ul{margin:8px 0;padding-left:18px;font-size:13px;color:var(--mut);line-height:1.65}
.ss-card ul b{color:var(--ink)}
.ss-coin{background:#eef2ff;border-radius:10px;padding:8px 12px;font-size:12.5px;font-weight:700;color:var(--acc);margin:10px 0}
.ss-btnrow{display:flex;gap:8px;margin-top:14px;flex-wrap:wrap}
.ss-btn{border:none;border-radius:12px;padding:10px 18px;font-size:13.5px;font-weight:700;font-family:inherit;cursor:pointer;
  background:var(--acc);color:#fff;touch-action:manipulation;transition:filter .15s ease}
.ss-btn:hover{filter:brightness(1.08)}
.ss-btn.ghost{background:var(--card);color:var(--ink);border:1.5px solid var(--line)}
.ss-btn.ghost:hover{border-color:var(--acc);filter:none}
.ss-x{position:absolute;top:10px;right:12px;border:none;background:none;font-size:18px;color:var(--mut);cursor:pointer;font-family:inherit}
.ss-cardwrap{position:relative}
.ss-leg{display:flex;gap:10px;align-items:center;font-size:12.5px;color:var(--mut);padding:5px 0;line-height:1.4}
.ss-leg b{color:var(--ink)}
.ss-leg-ic{flex:0 0 74px;text-align:center;font-size:11px;font-weight:800;color:var(--acc);background:#eef2ff;border-radius:8px;padding:5px 2px;letter-spacing:1px}
.ss-sec{font-size:10.5px;font-weight:800;letter-spacing:1.5px;color:var(--mut);margin:12px 0 4px}
.ss-cheat{display:flex;align-items:center;justify-content:space-between;gap:10px;width:100%;text-align:left;
  background:var(--card);border:1.5px solid var(--line);border-radius:12px;padding:9px 12px;margin:6px 0;cursor:pointer;font-family:inherit;touch-action:manipulation}
.ss-cheat:disabled{opacity:.45;cursor:not-allowed}
.ss-cheat .ss-cl{font-size:13px;font-weight:700;color:var(--ink)}
.ss-cheat .ss-cd{font-size:11px;color:var(--mut);margin-top:1px}
.ss-switch{flex:0 0 34px;height:20px;border-radius:99px;background:#e2e8f0;position:relative;transition:background .15s ease}
.ss-switch:after{content:"";position:absolute;top:2.5px;left:3px;width:15px;height:15px;border-radius:50%;background:#fff;transition:left .15s ease;box-shadow:0 1px 2px rgba(0,0,0,.2)}
.ss-cheat.on .ss-switch{background:var(--acc)}
.ss-cheat.on .ss-switch:after{left:16px}
.ss-go{flex:0 0 auto;font-size:10px;font-weight:800;letter-spacing:.5px;color:var(--acc);background:#eef2ff;border-radius:8px;padding:4px 8px}
.ss-note{font-size:11px;color:var(--mut);margin-top:8px}
.ss-stats{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:10px 0}
.ss-stat{background:var(--bg);border:1px solid var(--line);border-radius:12px;padding:8px 10px;font-size:12px;color:var(--mut)}
.ss-stat b{display:block;font-size:16px;color:var(--ink)}
.ss-app .game-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}
.ss-app .game-action-button{border:1.5px solid var(--line);background:var(--card);color:var(--ink);border-radius:12px;
  padding:9px 14px;font-size:12.5px;font-weight:700;font-family:inherit;cursor:pointer;touch-action:manipulation}
.ss-app .game-action-button:hover{border-color:var(--acc)}
.ss-app .game-action-button.ss-cheatbtn{color:var(--acc)}
@keyframes ssPulse{50%{opacity:.35}}
@keyframes ssIn{from{transform:translateY(-14px);opacity:0}to{transform:translateY(0);opacity:1}}
@keyframes ssGhost{0%{transform:translate(0,0);opacity:1}40%{transform:translate(calc(var(--dx)*.5),-26px);opacity:1}100%{transform:translate(var(--dx),var(--dy));opacity:0}}
@keyframes ssFlash{0%{stroke-width:1.5}40%{stroke-width:4}100%{stroke-width:1.5}}
@keyframes ssShake{0%,100%{transform:translateX(0)}25%{transform:translateX(-7px)}55%{transform:translateX(6px)}80%{transform:translateX(-3px)}}
@keyframes ssRing{to{stroke-dashoffset:-26}}
@media (pointer:coarse){.ss-vbtn{min-height:66px}.ss-vlabel{font-size:14.5px}}
@media (max-width:560px){.ss-hud{grid-template-columns:1fr 1fr}.ss-chip{grid-column:1/-1;order:-1;justify-self:center}.ss-pscore{font-size:19px}}
@media (prefers-reduced-motion:reduce){.ss-app *{animation:none!important;transition:none!important}}
</style>
<div class="ss-app game-app">
  <div class="game-intro">
    <div><h2>Shape Sorter</h2><p>Read the puzzle, tap the matching bin. First to ${TARGET} points wins.</p></div>
    <span class="game-status" data-statuswrap><i class="game-status-dot"></i><span data-status>Ready</span></span>
  </div>
  <section class="game-panel ss-panel" data-board>
    <div class="ss-hud" data-hud></div>
    <div class="ss-boardwrap" data-boardwrap>
      <svg viewBox="0 0 560 360" data-svg aria-hidden="true"></svg>
      <div class="ss-toast" data-toast></div>
    </div>
    <div class="ss-hint" data-hint></div>
    <div class="ss-vbar" data-vbar></div>

    <div class="ss-overlay" data-ov="start">
      <div class="ss-card">
        <h3>Shape Sorter</h3>
        <p>A puzzle appears at the top. Send it to the right bin before your rival does!</p>
        <ul>
          <li>You and your rival <b>take turns</b> solving puzzles.</li>
          <li>Correct = <b>+1 point</b>. Wrong = <b>\u22121 heart</b> (${HEARTS} hearts each).</li>
          <li>First to <b>${TARGET} points</b> wins. Lose all hearts and you're out.</li>
          <li>New puzzle types unlock as the <b>level</b> goes up.</li>
        </ul>
        <div class="ss-coin" data-startcoin></div>
        <div class="ss-btnrow">
          <button class="ss-btn" type="button" data-act="start">Start game</button>
          <button class="ss-btn ghost" type="button" data-act="help">How to play</button>
        </div>
      </div>
    </div>

    <div class="ss-overlay" data-ov="help" hidden>
      <div class="ss-card ss-cardwrap">
        <button class="ss-x" type="button" data-act="close-help" aria-label="Close">\u2715</button>
        <h3>How to play</h3>
        <div class="ss-sec">GOAL</div>
        <p>Take turns with your rival. A correct bin gives <b>+1 point</b>; a wrong bin costs <b>1 heart</b>. First to <b>${TARGET} points</b> wins \u2014 run out of hearts and you lose. Every match re-rolls <b>who starts</b> and <b>who is P1 / P2</b>.</p>
        <div class="ss-sec">PUZZLE TYPES</div>
        ${legendRows}
        <div class="ss-sec">CONTROLS</div>
        <p><b>Mouse:</b> click a bin or the big buttons. <b>Touch:</b> use the big buttons under the board. <b>Keys:</b> <b>1\u20134</b> pick a bin, <b>H</b> help, <b>C</b> cheats, <b>Esc</b> close, <b>Enter</b> start / rematch.</p>
        <div class="ss-btnrow"><button class="ss-btn" type="button" data-act="close-help">Got it</button></div>
      </div>
    </div>

    <div class="ss-overlay" data-ov="cheats" hidden>
      <div class="ss-card ss-cardwrap">
        <button class="ss-x" type="button" data-act="close-cheats" aria-label="Close">\u2715</button>
        <h3>Cheat menu</h3>
        <p>Practice helpers. Using any cheat marks this match as <b>assisted</b> (win streak won't count).</p>
        <div data-cheatrows></div>
        <p class="ss-note" data-cheatnote></p>
        <div class="ss-btnrow">
          <button class="ss-btn ghost" type="button" data-act="cheats-off">Turn all off</button>
          <button class="ss-btn" type="button" data-act="close-cheats">Done</button>
        </div>
      </div>
    </div>

    <div class="ss-overlay" data-ov="over" hidden>
      <div class="ss-card">
        <h3 data-overtitle>Match complete</h3>
        <p data-overreason></p>
        <div class="ss-stats" data-overstats></div>
        <p class="ss-note" data-overstreak></p>
        <div class="ss-btnrow">
          <button class="ss-btn" type="button" data-act="restart">Play again</button>
          <button class="ss-btn ghost" type="button" data-act="help">How to play</button>
        </div>
        <p class="ss-note">\u{1F3B2} Seats and first turn are re-rolled every match.</p>
      </div>
    </div>
  </section>
  <div class="game-actions">
    <button class="game-action-button" type="button" data-act="help">? How to play</button>
    <button class="game-action-button ss-cheatbtn" type="button" data-act="cheats">\u2699 Cheats</button>
    <button class="game-action-button" type="button" data-act="restart">\u21BB Restart</button>
    <button class="game-action-button" type="button" data-exit>Exit game</button>
  </div>
</div>`;

    /* ================= refs ================= */
    const $ = (s) => root.querySelector(s);
    const statusEl = $("[data-status]");
    const statusWrap = $("[data-statuswrap]");
    const hudEl = $("[data-hud]");
    const boardWrap = $("[data-boardwrap]");
    const svgEl = $("[data-svg]");
    const vbarEl = $("[data-vbar]");
    const hintEl = $("[data-hint]");
    const toastEl = $("[data-toast]");
    const ovStart = $('[data-ov="start"]');
    const ovHelp = $('[data-ov="help"]');
    const ovCheats = $('[data-ov="cheats"]');
    const ovOver = $('[data-ov="over"]');

    /* baris cheat dibuat sekali */
    $("[data-cheatrows]").innerHTML = CHEATS.map((c) =>
        '<button class="ss-cheat" type="button" data-cheat="' + c.key + '">' +
        '<span><span class="ss-cl">' + c.label + '</span><span class="ss-cd" style="display:block">' + c.desc + "</span></span>" +
        (c.toggle ? '<span class="ss-switch"></span>' : '<span class="ss-go">USE</span>') +
        "</button>"
    ).join("");

    /* ================= UI lokal ================= */
    let helpOpen = false, cheatsOpen = false;
    let prevResultN = 0, prevPhase = "";
    let botTimer = null, autoTimer = null, toastTimer = null;
    const ghostTimers = [];
    const offs = [];

    function toast(msg) {
        toastEl.textContent = msg;
        toastEl.classList.add("show");
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => toastEl.classList.remove("show"), 1500);
    }
    function replay(el, cls) {
        el.classList.remove(cls);
        void el.getBoundingClientRect();
        el.classList.add(cls);
    }
    function mySeatNow() { return state ? state.seats[roleIndex] : 0; }
    function seatName(seat) {
        /* names[] diindeks berdasarkan role (0 host/lokal, 1 guest/bot) */
        return state.names[state.seats[0] === seat ? 0 : 1];
    }

    function cardHtml(seat) {
        const mine = seat === mySeatNow();
        const turn = state.phase === "playing" && state.turn === seat;
        const hearts = state.hearts[seat];
        let hh = "";
        for (let i = 0; i < Math.max(HEARTS, hearts); i++) hh += heartIcon(i < hearts);
        const pct = Math.min(100, Math.round((state.scores[seat] / state.target) * 100));
        return '<div class="ss-pcard' + (turn ? " ss-turn" : "") + '">' +
            '<div class="ss-pname"><span class="ss-ptag">P' + (seat + 1) + "</span><b>" + esc(seatName(seat)) + "</b>" + (mine ? '<span class="ss-you">YOU</span>' : "") + "</div>" +
            '<div class="ss-pscore">' + state.scores[seat] + " <small>/ " + state.target + "</small></div>" +
            '<div class="ss-phearts">' + hh + "</div>" +
            '<div class="ss-bar"><i style="width:' + pct + '%"></i></div></div>';
    }

    function virtualHtml(p, myTurn) {
        const bins = p ? p.bins : shapeBins(mulberry32(7));
        return bins.map((b, i) => {
            let label = esc(b.label);
            if (b.type === "shape") label = '<span aria-hidden="true">' + GLYPH[b.value] + "</span>" + label;
            if (b.type === "color") label = '<span class="ss-vdot" style="background:' + b.value + '"></span>' + label;
            if (b.type === "word") label = "Aa " + label;
            return '<button class="ss-vbtn' + (myTurn ? "" : " ss-vlock") + '" type="button" data-vbin="' + i + '" aria-label="Bin ' + (i + 1) + ": " + esc(b.label) + '">' +
                '<span class="ss-vkey">KEY ' + (i + 1) + '</span><span class="ss-vlabel">' + label + "</span></button>";
        }).join("");
    }

    function renderCheats() {
        CHEATS.forEach((c) => {
            const btn = root.querySelector('[data-cheat="' + c.key + '"]');
            if (!btn) return;
            const locked = online && !c.online;
            btn.disabled = locked;
            btn.classList.toggle("on", Boolean(c.toggle && cheats[c.key]));
            btn.setAttribute("aria-pressed", c.toggle ? String(Boolean(cheats[c.key])) : "false");
        });
        $("[data-cheatnote]").textContent = online
            ? "Online match: only Reveal & Auto-play are allowed; state cheats are locked."
            : "Offline match: all cheats available. Shield & Clumsy bot affect only this device.";
    }

    function render() {
        if (!state) {
            statusEl.textContent = "Waiting for host\u2026";
            hudEl.innerHTML = "";
            svgEl.innerHTML = '<text x="280" y="180" font-size="16" font-weight="700" text-anchor="middle" fill="#94a3b8">Waiting for host\u2026</text>';
            vbarEl.innerHTML = "";
            hintEl.textContent = "";
            ovStart.setAttribute("hidden", "");
            ovOver.setAttribute("hidden", "");
            if (helpOpen) ovHelp.removeAttribute("hidden"); else ovHelp.setAttribute("hidden", "");
            if (cheatsOpen) ovCheats.removeAttribute("hidden"); else ovCheats.setAttribute("hidden", "");
            return;
        }
        const mySeat = mySeatNow();
        const playing = state.phase === "playing";
        const over = state.phase === "over";
        const p = state.phase !== "lobby" ? puzzleAt(state.seed, state.qi) : null;
        const myTurn = playing && state.turn === mySeat;
        const oppSeat = 1 - mySeat;

        /* transisi fase: lempar koin & streak */
        if (prevPhase !== "playing" && playing) {
            toast("\u{1F3B2} " + seatName(state.first) + " goes first!");
        }
        if (prevPhase !== "over" && over) {
            if (!cheatUsed) {
                if (state.winner === mySeat) { streak++; if (streak > best) { best = streak; writeBest(); } }
                else streak = 0;
            }
        }
        prevPhase = state.phase;

        /* status */
        let status = "Ready";
        if (playing) status = myTurn ? "Your turn \u00B7 " + p.prompt.toLowerCase() : (online ? "Waiting for " + seatName(oppSeat) + "\u2026" : seatName(oppSeat) + " is thinking\u2026");
        else if (over) status = seatName(state.winner) + " wins!";
        statusEl.textContent = status;
        statusWrap.classList.toggle("ss-live", myTurn);

        /* HUD */
        const chip = playing
            ? "LV " + p.level + " \u00B7 #" + (state.qi + 1) + " \u00B7 " + p.label
            : over ? "MATCH " + state.matchNo + " DONE" : "FIRST TO " + TARGET + " \u00B7 " + HEARTS + " HEARTS";
        hudEl.innerHTML = cardHtml(0) + '<div class="ss-chip">' + chip + "</div>" + cardHtml(1);

        /* papan + tombol virtual + hint */
        svgEl.innerHTML = boardSvg(state);
        vbarEl.innerHTML = virtualHtml(p, myTurn);
        if (playing) {
            hintEl.innerHTML = esc(p.hint) + (cheats.reveal ? ' \u00B7 Answer: <b>' + esc(p.bins[p.answer].label) + "</b>" : "");
        } else {
            hintEl.textContent = "Click a bin, use the big buttons, or press keys 1\u20134.";
        }

        /* overlay */
        if (state.phase === "lobby") {
            $('[data-startcoin]').textContent = "\u{1F3B2} Coin flip: " + seatName(state.first) + " goes first \u00B7 you are P" + (mySeat + 1) + " this match.";
            ovStart.removeAttribute("hidden");
        } else ovStart.setAttribute("hidden", "");
        if (over) {
            const won = state.winner === mySeat;
            $("[data-overtitle]").textContent = won ? "You win! \u{1F389}" : seatName(state.winner) + " wins";
            $("[data-overreason]").textContent = state.reason === "hearts"
                ? seatName(1 - state.winner) + " ran out of hearts."
                : seatName(state.winner) + " reached " + state.target + " points first.";
            $("[data-overstats]").innerHTML = [0, 1].map((seat) => {
                const acc = state.tries[seat] ? Math.round((state.hits[seat] / state.tries[seat]) * 100) + "%" : "\u2014";
                return '<div class="ss-stat"><b>' + esc(seatName(seat)) + (seat === mySeat ? " (you)" : "") + "</b>" +
                    state.scores[seat] + " pts \u00B7 " + acc + " accuracy \u00B7 " + state.hearts[seat] + " \u2665 left</div>";
            }).join("");
            $("[data-overstreak]").textContent = "Win streak: " + streak + " \u00B7 Best: " + best + (cheatUsed ? " (assisted match \u2014 not counted)" : "");
            ovOver.removeAttribute("hidden");
        } else ovOver.setAttribute("hidden", "");
        if (helpOpen) ovHelp.removeAttribute("hidden"); else ovHelp.setAttribute("hidden", "");
        if (cheatsOpen) ovCheats.removeAttribute("hidden"); else ovCheats.setAttribute("hidden", "");
        renderCheats();

        /* efek hasil langkah terakhir (kosmetik, tidak menahan logika) */
        if (state.result && state.result.n !== prevResultN) {
            prevResultN = state.result.n;
            animateResult(state.result);
        }
        syncTimers();
    }

    function animateResult(res) {
        if (res.bin >= 0) {
            const binEl = svgEl.querySelector('[data-bin="' + res.bin + '"]');
            if (binEl) binEl.classList.add(res.ok ? "ss-good" : "ss-bad");
        }
        if (res.skip) { toast("Puzzle skipped"); return; }
        if (!res.ok) {
            replay(boardWrap, "ss-shake");
            toast(res.shielded ? "Shield saved a heart!" : "Miss! \u22121 \u2665");
            return;
        }
        toast("+1 " + seatName(res.seat));
        const g = puzzleAt(state.seed, res.qi).ghost;
        const dx = BIN_CX[res.bin] - ITEM_X, dy = BIN_Y + 46 - ITEM_Y;
        const ghost = document.createElementNS("http://www.w3.org/2000/svg", "g");
        ghost.setAttribute("class", "ss-ghost");
        ghost.setAttribute("style", "--dx:" + dx + "px;--dy:" + dy + "px");
        ghost.innerHTML = '<g transform="translate(' + ITEM_X + " " + ITEM_Y + ') scale(1.5)">' + shapeNode(g.shape, g.color) + "</g>";
        svgEl.appendChild(ghost);
        ghostTimers.push(setTimeout(() => { if (ghost.parentNode) ghost.parentNode.removeChild(ghost); }, 800));
    }

    /* ================= alur state (host-authoritative) ================= */
    function publish() {
        render();
        if (online && room.isHost) room.publishState(state).catch(console.warn);
    }

    function applyAction(action, role) {
        if (!state || !action) return;
        const t = action.type;
        if (t === "hello") {
            if (role === 1) { state.names[1] = cleanName(action.name); publish(); }
            return;
        }
        if (t === "start") {
            if (state.phase === "lobby") { beginMatch(state); publish(); }
            return;
        }
        if (t === "restart") {
            const next = freshMatch(state.names, state.matchNo + 1, "playing");
            beginMatch(next);
            state = next;
            prevResultN = 0;
            cheatUsed = false;
            publish();
            return;
        }
        if (t === "heart") { /* cheat lokal (offline) */
            if (!online && state.phase === "playing") {
                const seat = state.seats[role];
                state.hearts[seat] = Math.min(5, state.hearts[seat] + 1);
                publish();
            }
            return;
        }
        if (t === "skip") { /* cheat lokal (offline) */
            if (!online && state.phase === "playing") {
                const seat = state.seats[role];
                state.result = { n: (state.result ? state.result.n + 1 : 1), seat: seat, ok: true, bin: -1, qi: state.qi, skip: true };
                state.qi++;
                publish();
            }
            return;
        }
        if (t === "pick") {
            if (state.phase !== "playing") return;
            const seat = state.seats[role];
            if (state.turn !== seat) return;
            const bin = action.bin | 0;
            if (bin < 0 || bin > 3) return;
            const p = puzzleAt(state.seed, state.qi);
            const ok = bin === p.answer;
            const shielded = !ok && !online && role === 0 && cheats.shield;
            state.tries[seat]++;
            if (ok) { state.scores[seat]++; state.hits[seat]++; }
            else if (!shielded) state.hearts[seat]--;
            state.result = { n: (state.result ? state.result.n + 1 : 1), seat: seat, ok: ok, bin: bin, qi: state.qi, shielded: shielded };
            if (ok && state.scores[seat] >= state.target) {
                state.phase = "over"; state.winner = seat; state.reason = "target";
            } else if (!ok && state.hearts[seat] <= 0) {
                state.phase = "over"; state.winner = 1 - seat; state.reason = "hearts";
            } else {
                state.qi++;
                state.turn = 1 - state.turn;
            }
            publish();
        }
    }

    function submitAction(action) {
        if (online && !room.isHost) {
            room.sendAction(action).catch(console.warn);
            return;
        }
        applyAction(action, roleIndex);
    }

    /* ---------- bot & auto-play (timer lokal) ---------- */
    function syncTimers() {
        clearTimeout(botTimer); botTimer = null;
        clearTimeout(autoTimer); autoTimer = null;
        if (!state || state.phase !== "playing") return;
        const blocked = helpOpen || cheatsOpen; /* jeda bot saat overlay terbuka (offline) */
        if (!online && state.turn === state.seats[1] && !blocked) {
            botTimer = setTimeout(botMove, 900 + Math.random() * 900);
        }
        if (cheats.auto && state.turn === mySeatNow() && !blocked) {
            autoTimer = setTimeout(autoMove, 620);
        }
    }
    function botMove() {
        if (!state || state.phase !== "playing" || state.turn !== state.seats[1]) return;
        const p = puzzleAt(state.seed, state.qi);
        const acc = cheats.dizzy ? BOT_ACC_DIZZY : BOT_ACC;
        let bin = p.answer;
        if (Math.random() >= acc) {
            const wrong = [0, 1, 2, 3].filter((i) => i !== p.answer);
            bin = wrong[(Math.random() * wrong.length) | 0];
        }
        applyAction({ type: "pick", bin: bin }, 1);
    }
    function autoMove() {
        if (!state || state.phase !== "playing" || state.turn !== mySeatNow()) return;
        const p = puzzleAt(state.seed, state.qi);
        submitAction({ type: "pick", bin: p.answer });
    }

    /* ================= input ================= */
    function tryPick(i) {
        if (!state || state.phase !== "playing") return;
        if (state.turn !== mySeatNow()) { toast("Wait for your turn"); return; }
        submitAction({ type: "pick", bin: i });
    }
    function useCheat(key) {
        const def = CHEATS.find((c) => c.key === key);
        if (!def) return;
        if (online && !def.online) { toast("Locked in online play"); return; }
        if (def.toggle) {
            cheats[key] = !cheats[key];
            if (cheats[key]) cheatUsed = true;
            toast(def.label + (cheats[key] ? " ON" : " OFF"));
            render();
            return;
        }
        if (!state || state.phase !== "playing") { toast("Start a match first"); return; }
        cheatUsed = true;
        if (key === "heart") { submitAction({ type: "heart" }); toast("+1 \u2665"); }
        if (key === "skip") submitAction({ type: "skip" });
    }
    function handleClick(event) {
        const t = event.target;
        if (!t || !t.closest) return;
        if (t.closest("[data-exit]")) { onExit(); return; }
        const act = t.closest("[data-act]");
        if (act) {
            const a = act.dataset.act;
            if (a === "start" || a === "restart") submitAction({ type: a });
            else if (a === "help") { helpOpen = true; cheatsOpen = false; render(); }
            else if (a === "close-help") { helpOpen = false; render(); }
            else if (a === "cheats") { cheatsOpen = true; helpOpen = false; render(); }
            else if (a === "close-cheats") { cheatsOpen = false; render(); }
            else if (a === "cheats-off") {
                cheats.reveal = cheats.auto = cheats.shield = cheats.dizzy = false;
                toast("All cheats off");
                render();
            }
            return;
        }
        const ch = t.closest("[data-cheat]");
        if (ch) { useCheat(ch.dataset.cheat); return; }
        const vb = t.closest("[data-vbin]");
        if (vb) { tryPick(parseInt(vb.dataset.vbin, 10)); return; }
        const bin = t.closest("[data-bin]");
        if (bin) tryPick(parseInt(bin.dataset.bin, 10));
    }
    function handleKey(event) {
        if (event.repeat || event.metaKey || event.ctrlKey || event.altKey) return;
        const tag = (event.target && event.target.tagName) || "";
        if (/INPUT|TEXTAREA|SELECT/.test(tag)) return;
        const k = event.key;
        if (k === "Escape") { if (helpOpen || cheatsOpen) { helpOpen = false; cheatsOpen = false; render(); } return; }
        if (k === "h" || k === "H") { helpOpen = !helpOpen; cheatsOpen = false; render(); return; }
        if (k === "c" || k === "C") { cheatsOpen = !cheatsOpen; helpOpen = false; render(); return; }
        if (helpOpen || cheatsOpen) return;
        if (k === "Enter" && state) {
            if (state.phase === "lobby") submitAction({ type: "start" });
            else if (state.phase === "over") submitAction({ type: "restart" });
            return;
        }
        const i = ["1", "2", "3", "4"].indexOf(k);
        if (i >= 0) tryPick(i);
    }
    function handleAnimEnd(event) {
        const t = event.target;
        if (!t || !t.classList) return;
        if (t.classList.contains("ss-ghost")) { if (t.parentNode) t.parentNode.removeChild(t); return; }
        if (event.animationName === "ssFlash") {
            const binG = t.closest ? t.closest(".ss-bin") : null;
            if (binG) binG.classList.remove("ss-good", "ss-bad");
        } else if (event.animationName === "ssShake") t.classList.remove("ss-shake");
    }

    root.addEventListener("click", handleClick);
    root.addEventListener("animationend", handleAnimEnd);
    document.addEventListener("keydown", handleKey);

    /* ================= boot ================= */
    if (online) {
        const offRoom = room.onRoom((nextRoom) => { roomData = nextRoom; render(); });
        if (typeof offRoom === "function") offs.push(offRoom);
        if (room.isHost) {
            state = freshMatch([cleanName(playerName), "Player 2"], 1, "lobby");
            publish();
            const offAction = room.onAction((action) => applyAction(action, 1));
            if (typeof offAction === "function") offs.push(offAction);
        } else {
            state = null;
            render();
            const offState = room.onState((nextState) => { state = nextState; render(); });
            if (typeof offState === "function") offs.push(offState);
            submitAction({ type: "hello", name: playerName });
        }
    } else {
        state = freshMatch([cleanName(playerName), "Robo"], 1, "lobby");
        render();
    }

    return {
        destroy() {
            root.removeEventListener("click", handleClick);
            root.removeEventListener("animationend", handleAnimEnd);
            document.removeEventListener("keydown", handleKey);
            clearTimeout(botTimer);
            clearTimeout(autoTimer);
            clearTimeout(toastTimer);
            ghostTimers.forEach(clearTimeout);
            offs.forEach((off) => { try { off(); } catch (err) { /* abaikan */ } });
        },
    };
}