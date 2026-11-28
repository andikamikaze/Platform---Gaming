/*
  Water Sort — port dari modul MGP lama ke template game baru.
  - META.id harus sama dengan nama file tanpa .js  → water-sort.js
  - Setelah menaruh file ini, jalankan: node tools/build-games-manifest.mjs
*/

import { iconSVG } from "../JS/icons.js";
import { createGameShell } from "../JS/game-ui.js";

export const META = {
    id: "water-sort",
    name: "Water Sort",
    category: "puzzle",
    catLabel: "Puzzle",
    desc: "Tuang cairan antar botol sampai tiap botol satu warna. Level acak dijamin bisa selesai — solo, lawan bot, atau online.",
    art: '<svg viewBox="0 0 48 48" width="54" height="54" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 6h20M16 6v30a8 8 0 0 0 16 0V6"/><path d="M16 22h16v14a8 8 0 0 1-16 0z" fill="currentColor" opacity=".35"/><path d="M34 14l8-4v8z" fill="currentColor" stroke="none"/></svg>',
    bg: ["#a5f3fc", "#06b6d4"],
    bestKey: "waterSortBest",
};

/* ================= aturan murni (tanpa DOM) ================= */

const CAP = 4;
const EMPTIES = 2;
const MAX_COLORS = 7;
const VERSUS_LEVEL = 3; // level saat lawan bot / online (4 warna)
const HUES = ["#ef4444", "#3b82f6", "#facc15", "#a855f7", "#fb923c", "#22c55e", "#ec4899"];
const SEAT_COLORS = ["#0ea5e9", "#ec4899"];

const top = (b) => b[b.length - 1];

function topRun(b) {
    if (!b.length) return 0;
    let n = 1;
    for (let i = b.length - 2; i >= 0 && b[i] === top(b); i--) n++;
    return n;
}

function pourAmount(bottles, s, d) {
    if (s === d) return 0;
    const src = bottles[s], dst = bottles[d];
    if (!src || !dst || !src.length || dst.length >= CAP) return 0;
    if (dst.length && top(dst) !== top(src)) return 0;
    return Math.min(topRun(src), CAP - dst.length);
}

function applyPour(bottles, s, d, n) {
    const next = bottles.map((b) => b.slice());
    for (let i = 0; i < n; i++) next[d].push(next[s].pop());
    return next;
}

function bottleDone(b) {
    return b.length === 0 || (b.length === CAP && b.every((v) => v === b[0]));
}
function isSolved(bottles) { return bottles.every(bottleDone); }

function hasLegalMove(bottles) {
    for (let s = 0; s < bottles.length; s++)
        for (let d = 0; d < bottles.length; d++)
            if (pourAmount(bottles, s, d) > 0) return true;
    return false;
}

function legalMoves(bottles) {
    const out = [];
    for (let s = 0; s < bottles.length; s++)
        for (let d = 0; d < bottles.length; d++) {
            const n = pourAmount(bottles, s, d);
            if (n) out.push([s, d, n]);
        }
    return out;
}

const cloneBoards = (bs) => bs.map((b) => b.slice());
/* kunci kanonik: urutan botol tidak penting → dedupe jauh lebih besar */
const stateKey = (bs) => bs.map((b) => b.join("")).sort().join("|");

/* DFS solver + move ordering + pruning. Mengembalikan [[s,d,n],...] atau null. */
function solve(bottles, budget = 80000) {
    const start = cloneBoards(bottles);
    if (isSolved(start)) return [];
    const seen = new Set([stateKey(start)]);
    const path = [];
    let nodes = 0;

    function dfs(st, depth) {
        nodes++;
        if (depth > 120 || nodes > budget) return false;
        const cands = [];
        for (let s = 0; s < st.length; s++) {
            const src = st[s];
            if (!src.length) continue;
            const uniform = src.every((v) => v === src[0]);
            if (uniform && src.length === CAP) continue; // botol sudah jadi: jangan dibongkar
            for (let d = 0; d < st.length; d++) {
                const n = pourAmount(st, s, d);
                if (!n) continue;
                if (uniform && !st[d].length) continue; // pindah botol seragam ke kosong = no-op
                let score = 0;
                if (st[d].length) score += 2; // gabung ke warna sama dulu
                if (st[d].length + n === CAP && (!st[d].length || st[d].every((v) => v === st[d][0]))) score += 3;
                if (n === src.length) score += 1; // mengosongkan sumber itu bagus
                cands.push([score, s, d, n]);
            }
        }
        cands.sort((a, b) => b[0] - a[0]);
        for (const [, s, d, n] of cands) {
            const nx = applyPour(st, s, d, n);
            const k = stateKey(nx);
            if (seen.has(k)) continue;
            seen.add(k);
            path.push([s, d, n]);
            if (isSolved(nx)) return true;
            if (dfs(nx, depth + 1)) return true;
            path.pop();
        }
        return false;
    }
    return dfs(start, 0) ? path.slice() : null;
}

/* RNG ber-seed → deal bisa direproduksi (retry & sinkron multiplayer). */
function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
        a |= 0; a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function colorsForLevel(level) {
    return Math.min(3 + Math.floor((Math.max(1, level) - 1) / 2), MAX_COLORS);
}

/* Generator level acak YANG DIJAMIN bisa diselesaikan (verifikasi solver). */
function makeDeal(level, seed) {
    const rng = mulberry32(seed);
    const colors = colorsForLevel(level);
    for (let attempt = 0; attempt < 60; attempt++) {
        const pool = [];
        for (let c = 0; c < colors; c++) for (let k = 0; k < CAP; k++) pool.push(c);
        for (let i = pool.length - 1; i > 0; i--) {
            const j = Math.floor(rng() * (i + 1));
            const t = pool[i]; pool[i] = pool[j]; pool[j] = t;
        }
        const bottles = [];
        for (let b = 0; b < colors; b++) bottles.push(pool.slice(b * CAP, b * CAP + CAP));
        for (let b = 0; b < EMPTIES; b++) bottles.push([]);
        if (bottles.some((b) => b.length === CAP && b.every((v) => v === b[0]))) continue;
        const sol = solve(bottles);
        if (sol && sol.length >= colors + 2) return { bottles, colors, par: sol.length };
    }
    /* fallback: deal trivial yang pasti solvable */
    let bottles = [];
    for (let c = 0; c < colors; c++) bottles.push([c, c, c, c]);
    bottles.push([], []);
    bottles = applyPour(applyPour(bottles, 0, colors, 1), 1, colors + 1, 1);
    return { bottles, colors, par: 2 };
}

export const _test = {
    CAP, EMPTIES, topRun, pourAmount, applyPour, bottleDone,
    isSolved, hasLegalMove, legalMoves, solve, makeDeal, colorsForLevel,
};

/* ============================ GAME ============================ */

export function mount(root, context = {}) {
    const { mode = "ai", room = null, playerName = "Player", onExit = () => { } } = context;
    const online = mode === "room" && Boolean(room);
    const playerIndex = online && !room.isHost ? 1 : 0;
    let roomData = room?.room || null;
    let state = null;
    let destroyed = false;

    /* ---------- UI lokal (tidak disinkronkan) ---------- */
    let selected = -1, cursor = 0, showCursor = false, hint = null, bad = null;
    let showHelp = false, showCheat = false, paused = false;
    let autoTimer = null, botTimer = null, toastTimer = null, hintTimer = null, badTimer = null;
    const pending = new Set(); // timer yang ikut dibekukan saat pause
    let pauseAt = 0, clockShift = 0, pauseIcon = "pause";
    const now = () => Date.now() - clockShift;
    let toastMsg = "", lastNoteT = 0, lastSeed = null, lastFxT = 0;
    const solveCache = new Map();
    const subs = [];

    /* ---------- penyimpanan aman ---------- */
    const readBest = () => { try { return Math.max(0, parseInt(localStorage.getItem(META.bestKey) || "0", 10) || 0); } catch { return 0; } };
    const writeBest = (v) => { try { localStorage.setItem(META.bestKey, String(v)); } catch { } };
    const seenHelp = () => { try { return localStorage.getItem("waterSortHelpSeen") === "1"; } catch { return true; } };
    const markHelp = () => { try { localStorage.setItem("waterSortHelpSeen", "1"); } catch { } };
    let best = readBest();
    showHelp = !seenHelp(); // tutorial otomatis saat pertama kali main
    if (showHelp) markHelp(); // flag dicatat sekali, seperti game lain

    const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

    /* ---------- shell (dibangun sekali, region dinamis di-update) ---------- */
    root.classList.add("ws-root");

    createGameShell(root, {
      prefix: "ws-game",
      boardClass: "ws-board",
      category: META.category,
      keys: undefined,
      hud: { keys: { score: "done", best: "bestv", time: "parv" } },
      info: [
        { raw: '<span class="gui-chip"><i class="ws-dot" data-dot></i><b data-hud="status">Siap</b></span>' },
        { raw: '<span class="gui-chip" data-hud="par">PAR</span>' },
        { raw: '<span class="gui-chip" data-hud="best" hidden>REKOR</span>' },
        { raw: '<span class="gui-chip" data-hud="rival" hidden><i class="ws-dot" data-rival-dot></i><b data-hud="rivalname">Bot</b> <b data-hud="rivalmoves">0</b></span>' },
        { raw: '<span class="gui-chip" data-hud="cheat" hidden>CHEATS</span>' },
        { raw: '<span class="ws-seg" data-hud="modes"><button type="button" data-mode="solo" aria-label="Mode solo">Solo</button><button type="button" data-mode="bot" aria-label="Mode lawan bot">Bot</button></span>' },
      ],
      controls: [
        { label: "Undo", icon: "rotateCcw", attrs: ' data-act="undo" data-btn="undo"' },
        { label: "New", icon: "sparkles", attrs: ' data-act="new" data-btn="new"' },
        { label: "Resign", icon: "flag", attrs: ' data-act="resign" data-btn="resign"', hidden: true },
        { label: "Pad", icon: "gamepad2", attrs: ' data-act="pad"' },
      ],
      board: {
        type: "builder",
        build(board, { mk }) {
          mk("div", { class: "ws-boards", "data-boards": "" }, board);
          mk("div", { class: "ws-toast", "data-toast": "", hidden: "" }, board);
          return {};
        },
      },
      overlays: {
        help: {
          title: "Cara Bermain",
          closeLabel: "Tutup", closeAction: "help-close",
          sections: [
            { title: "Tujuan & aturan", paragraphs: [
              `Pisahkan semua warna: setiap botol berisi satu warna penuh (${CAP} unit) atau kosong.`,
            ], items: [
              "Ketuk/klik botol untuk <b>mengambil</b> cairan teratas, lalu ketuk botol <b>tujuan</b>.",
              `Tuang hanya boleh ke <b>warna yang sama</b> atau ke <b>botol kosong</b>. Kapasitas botol ${CAP} unit.`,
              "Salah langkah? Pakai <b>Undo</b>. Semua level dijamin punya solusi.",
            ] },
            { title: "Mode", paragraphs: [
              "<b>Solo</b>: kejar jumlah langkah ≤ par dan naik level (warna bertambah).",
              "<b>Lawan Bot / Online</b>: papan identik, giliran bergantian — siapa yang merapikan papannya duluan menang. Kalau lawan buntu, gilirannya dilewati.",
            ] },
            { title: "Desktop", items: [
              'Klik botol · <span class="gui-kbd">←/→</span> pilih · <span class="gui-kbd">Enter/Spasi</span> ambil–tuang · <span class="gui-kbd">1–9</span> pilih langsung · <span class="gui-kbd">U</span> undo · <span class="gui-kbd">I</span> hint · <span class="gui-kbd">N</span> baru · <span class="gui-kbd">R</span> ulangi · <span class="gui-kbd">H</span> bantuan · <span class="gui-kbd">C</span> cheat · <span class="gui-kbd">P</span> jeda · <span class="gui-kbd">Esc</span> jeda/tutup.',
            ] },
            { title: "Mobile", paragraphs: [
              "Ketuk botol langsung, atau pakai tombol virtual <b>◀ ▶ Pilih/Tuang ↩</b> di bawah papan.",
            ] },
            { title: "Cheat", paragraphs: [
              "Tombol Cheats membuka panel cheat (khusus Solo): hint, auto-solve, botol kosong ekstra, rapikan 1 warna, lewati level. Kemenangan dengan cheat tidak dicatat sebagai rekor.",
            ] },
          ],
          note: "Tekan H untuk membuka panduan ini lagi",
          primary: "Mengerti", primaryAction: "help-close",
        },
        cheat: {
          title: "Cheat",
          closeLabel: "Tutup", closeAction: "cheat-close",
          paragraphs: ['<span data-cheat-note></span>'],
          cardActions: [
            { key: "cheat", value: "hint", label: "Hint langkah terbaik" },
            { key: "cheat", value: "step", label: "Maju 1 langkah benar" },
            { key: "cheat", value: "auto", label: "Auto-solve", attrs: " data-auto-label" },
            { key: "cheat", value: "empty", label: "Botol kosong +1", attrs: " data-empty-label" },
            { key: "cheat", value: "color", label: "Rapikan 1 warna" },
            { key: "cheat", value: "win", label: "Lewati level" },
          ],
        },
        pause: {
          title: "Paused",
          primary: "Resume", primaryAction: "resume",
        },
        end: {
          title: '<span data-end-title></span>',
          body: '<p data-end-sub></p>',
          footHTML: '<div class="gui-foot" data-end-actions></div>',
        },
      },
      pad: {
        build(padEl, { mk }) {
          const pad = mk("div", { class: "ws-pad" }, padEl);
          mk("button", { class: "ws-btn ws-pad-btn", type: "button", "data-pad": "left", "aria-label": "Botol sebelumnya", text: "◀" }, pad);
          const act = mk("button", { class: "ws-btn ws-pad-btn primary", type: "button", "data-pad": "act" }, pad);
          mk("span", { "data-pad-act": "", text: "Pilih" }, act);
          mk("button", { class: "ws-btn ws-pad-btn", type: "button", "data-pad": "right", "aria-label": "Botol berikutnya", text: "▶" }, pad);
          mk("button", { class: "ws-btn ws-pad-btn", type: "button", "data-pad": "undo", "data-btn": "pad-undo", "aria-label": "Undo", text: "↩" }, pad);
        },
      },
    });




    const $ = (s) => root.querySelector(s);
    const btnAlias = { help: "help", cheats: "cheat", pause: "pause", restart: "retry", exit: "exit", "help-close": "close-help", "cheat-close": "close" };
    root.querySelectorAll("[data-ui-action]").forEach((b) => {
      const action = b.dataset.uiAction;
      b.dataset.btn = btnAlias[action] || action;
      b.dataset.act = btnAlias[action] || action;
      if (action === "cheat-close") b.dataset.cheat = "close";
    });
    const pauseIconWrap = document.createElement("span");
    pauseIconWrap.dataset.pauseIcon = "";
    const pauseSvg = root.querySelector('[data-ui-action="pause"] svg');
    if (pauseSvg) { pauseSvg.before(pauseIconWrap); pauseIconWrap.append(pauseSvg); }
    const statusEl = $("[data-hud='status']"), dotEl = $("[data-dot]");
    const hud = {
        level: $("[data-hud='level']"), moves: $("[data-hud='moves']"), done: $("[data-hud='done']"),
        par: $("[data-hud='par']"), parv: $("[data-hud='parv']"),
        best: $("[data-hud='best']"), bestv: $("[data-hud='bestv']"),
        rival: $("[data-hud='rival']"), rivalName: $("[data-hud='rivalname']"),
        rivalMoves: $("[data-hud='rivalmoves']"), rivalDot: $("[data-rival-dot]"),
        cheat: $("[data-hud='cheat']"), modes: $("[data-hud='modes']"),
    };
    const boardsEl = $("[data-boards]"), toastEl = $("[data-toast]");
    const ov = {
        help: $('[data-ov="help"]'), cheat: $('[data-ov="cheat"]'),
        pause: $('[data-ov="pause"]'), end: $('[data-ov="end"]'),
    };
    const cheatNote = $("[data-cheat-note]");
    const endTitle = $("[data-end-title]"), endSub = $("[data-end-sub]"), endActions = $("[data-end-actions]");
    const undoBtn = $('[data-btn="undo"]'), retryBtn = $('[data-btn="retry"]'), newBtn = $('[data-btn="new"]');
    const resignBtn = $('[data-btn="resign"]'), cheatBtn = $('[data-btn="cheat"]'), pauseBtn = $('[data-btn="pause"]');
    const padUndoBtn = $('[data-btn="pad-undo"]');
    const pauseIconEl = $("[data-pause-icon]"), pauseLabelEl = pauseBtn.querySelector(".gui-btn-label");
    const padActEl = $("[data-pad-act]"), padActBtn = $('[data-pad="act"]');
    const autoLabelEl = $("[data-auto-label]"), emptyLabelEl = $("[data-empty-label]");
    const setToggleLabel = (node, text) => {
        if (!node) return;
        const first = node.firstChild;
        if (first && first.nodeType === 3) first.nodeValue = text;
        else node.textContent = text;
    };

    /* ---------- timer yang ikut dibekukan saat pause ---------- */
    function armTimer(rec) {
        rec.startedAt = performance.now();
        rec.id = setTimeout(() => { pending.delete(rec); rec.id = null; rec.fn(); }, Math.max(0, rec.left));
    }
    function later(fn, ms) {
        const rec = { fn, ms, left: ms, startedAt: 0, id: null };
        pending.add(rec);
        if (!paused) armTimer(rec);
        return rec;
    }
    function cancelTimer(rec) {
        if (!rec) return;
        if (rec.id !== null) clearTimeout(rec.id);
        pending.delete(rec);
        rec.id = null;
    }
    function setPaused(on, doRender = true) {
        if (paused === on) return;
        if (on) {
            pauseAt = performance.now();
            for (const rec of pending) {
                if (rec.id === null) continue; // belum di-arm saat pause → sisa penuh
                clearTimeout(rec.id); rec.id = null;
                rec.left = Math.max(0, rec.left - (pauseAt - rec.startedAt));
            }
        } else {
            const shiftMs = performance.now() - pauseAt;
            clockShift += shiftMs; // penanda Date.now() ikut bergeser saat resume
            for (const rec of pending) { rec.startedAt += shiftMs; armTimer(rec); }
        }
        paused = on;
        if (!on) syncBot();
        if (doRender) render();
    }
    function togglePause() {
        if (!state || state.phase !== "playing") return;
        setPaused(!paused);
    }
    function startMode(mode) {
        if (online) return;
        if (paused) setPaused(false, false);
        stopAuto();
        for (const r of [botTimer, hintTimer, badTimer, toastTimer]) cancelTimer(r);
        botTimer = hintTimer = badTimer = toastTimer = null;
        toastMsg = "";
        showCheat = false;
        state = mode === "bot" ? freshVersus("bot") : freshSolo(Math.max(1, best + 1));
        resetLocal();
        render();
    }

    /* ---------- layout SVG ---------- */
    const BW = 40, BH = 150, GAP = 14, PAD = 10;
    const LH = (BH - 10) / CAP;
    const layerY = (j) => PAD + BH - 4 - (j + 1) * LH;

    /* ---------- state factory ---------- */
    function freshSolo(level) {
        const seed = (Math.random() * 0x7fffffff) | 0;
        const deal = makeDeal(level, seed);
        return {
            id: "water-sort", v: 1, mode: "solo", phase: "playing",
            level, seed, colors: deal.colors, par: deal.par,
            boards: [deal.bottles], moves: [0], history: [[]],
            turn: 0, first: 0, seatMap: [0],
            winner: null, cheated: false, extra: 0, note: null, fx: null,
        };
    }

    function freshVersus(kind) {
        const seed = (Math.random() * 0x7fffffff) | 0;
        const deal = makeDeal(VERSUS_LEVEL, seed);
        /* undian acak: posisi pemain (online) & siapa jalan duluan */
        const seatMap = kind === "online" ? (Math.random() < 0.5 ? [0, 1] : [1, 0]) : [0, 1];
        const first = Math.random() < 0.5 ? 0 : 1;
        return {
            id: "water-sort", v: 1, mode: kind, phase: "playing",
            level: VERSUS_LEVEL, seed, colors: deal.colors, par: deal.par,
            boards: [cloneBoards(deal.bottles), cloneBoards(deal.bottles)],
            moves: [0, 0], history: [[], []],
            turn: first, first, seatMap,
            winner: null, cheated: false, extra: 0, note: null, fx: null,
        };
    }

    const mySeat = () => (online ? (state?.seatMap?.[playerIndex] ?? 0) : 0);
    const seatActor = (seat) => (online ? (state?.seatMap?.indexOf(seat) ?? seat) : seat);
    function seatName(seat) {
        if (state?.mode === "bot") return seat === 0 ? "Kamu" : "Bot";
        if (online) {
            if (seat === mySeat()) return "Kamu";
            const p = roomData?.players?.[seatActor(seat)];
            return p?.name || `Pemain ${seat + 1}`;
        }
        return "Kamu";
    }

    function resetLocal() {
        selected = -1; cursor = 0; hint = null; bad = null; showCheat = false;
        stopAuto();
        cancelTimer(hintTimer); hintTimer = null;
        cancelTimer(badTimer); badTimer = null;
        cancelTimer(botTimer); botTimer = null;
        if (paused) setPaused(false, false);
    }

    function cachedSolve(board) {
        const k = JSON.stringify(board);
        if (solveCache.has(k)) return solveCache.get(k);
        const res = solve(board);
        if (solveCache.size > 300) solveCache.clear();
        solveCache.set(k, res);
        return res;
    }

    function toast(msg) {
        toastMsg = msg;
        cancelTimer(toastTimer);
        toastTimer = later(() => { toastMsg = ""; toastTimer = null; render(); }, 2600);
    }

    function noteText(note) {
        if (note.kind === "skip") return `${seatName(note.seat)} buntu — gilirannya dilewati`;
        if (note.kind === "resign") return `${seatName(note.seat)} menyerah`;
        return "";
    }

    /* ---------- rendering ---------- */
    function boardSVG(seat, st, fxActive) {
        const bs = st.boards[seat];
        const mine = seat === mySeat();
        const n = bs.length;
        const W = PAD * 2 + n * BW + (n - 1) * GAP;
        const H = PAD * 2 + BH + 18;
        let g = "";
        for (let i = 0; i < n; i++) {
            const x = PAD + i * (BW + GAP);
            const b = bs[i];
            const isSel = mine && st.phase === "playing" && selected === i;
            const isDone = b.length === CAP && bottleDone(b);
            let cls = "ws-bottle";
            if (isDone) cls += " done";
            if (isSel) cls += " sel";
            if (bad && bad.seat === seat && bad.i === i) cls += " bad";
            if (hint && mine && hint.s === i) cls += " hint-s";
            if (hint && mine && hint.d === i) cls += " hint-d";
            g += `<rect class="${cls}" x="${x}" y="${PAD}" width="${BW}" height="${BH}" rx="10"/>`;
            g += `<line class="ws-mouth" x1="${x + 6}" y1="${PAD + 6}" x2="${x + BW - 6}" y2="${PAD + 6}"/>`;
            const run = b.length ? topRun(b) : 0;
            for (let j = 0; j < b.length; j++) {
                const lift = isSel && j >= b.length - run ? 7 : 0;
                const isNew = fxActive && fxActive.seat === seat && fxActive.d === i && j >= b.length - fxActive.n;
                g += `<rect class="ws-layer${isNew ? " ws-new" : ""}" x="${x + 3}" y="${layerY(j) - lift}" width="${BW - 6}" height="${LH + 1}" rx="5" fill="${HUES[b[j]]}"/>`;
            }
            if (mine && showCursor && st.phase === "playing" && cursor === i)
                g += `<rect class="ws-cursor" x="${x - 3.5}" y="${PAD - 3.5}" width="${BW + 7}" height="${BH + 7}" rx="12"/>`;
            g += `<text class="ws-idx${isDone ? " ok" : ""}" x="${x + BW / 2}" y="${PAD + BH + 14}">${isDone ? "✓" : i < 9 ? i + 1 : "·"}</text>`;
            g += `<rect class="ws-hit" data-seat="${seat}" data-bottle="${i}" x="${x - 2}" y="${PAD - 4}" width="${BW + 4}" height="${BH + 22}" fill="transparent"/>`;
        }
        return `<svg class="ws-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="Papan ${esc(seatName(seat))}">${g}</svg>`;
    }

    function boardCard(seat, st, fxActive) {
        const b = st.boards[seat];
        const activeTurn = st.phase === "playing" && st.mode !== "solo" && st.turn === seat;
        const doneN = b.filter((x) => x.length && bottleDone(x)).length;
        return `<div class="ws-board-card${activeTurn ? " active" : ""}">
      <div class="ws-board-head">
        <span class="ws-seat-dot" style="background:${SEAT_COLORS[seat]}"></span>
        <b>${esc(seatName(seat))}</b>
        <span class="ws-mini">${st.moves[seat]} langkah · ${doneN}/${st.colors}</span>
        ${activeTurn ? '<span class="ws-turn-badge">Giliran</span>' : ""}
      </div>
      ${boardSVG(seat, st, fxActive)}
    </div>`;
    }

    function endContent(st) {
        const versus = st.mode !== "solo";
        const my = mySeat();
        const btn = (act, label, primary) =>
            `<button class="ws-btn${primary ? " primary" : ""}" type="button" data-act="${act}">${label}</button>`;
        if (st.phase === "won") {
            if (!versus) {
                endTitle.textContent = "Selesai! 🎉";
                endSub.textContent = `${st.moves[0]} langkah · par ${st.par}${st.cheated ? " · cheat aktif (rekor tidak dicatat)" : ""}`;
                endActions.innerHTML = btn("next", "▶ Level berikutnya", true) + btn("retry", "⟳ Ulangi") + btn("new", "🎲 Acak baru") + btn("menu", "☰ Menu");
            } else {
                endTitle.textContent = st.winner === my ? "Kamu menang! 🏆" : `${seatName(st.winner)} menang 🏆`;
                endSub.textContent = `Langkah — kamu ${st.moves[my]} · ${seatName(1 - my)} ${st.moves[1 - my]}.`;
                endActions.innerHTML = btn("new", "🎲 Rematch (undi ulang)", true) + (online ? "" : btn("menu", "☰ Menu"));
            }
        } else if (st.phase === "stuck") {
            endTitle.textContent = "Buntu 😅";
            endSub.textContent = "Tidak ada tuangan legal tersisa. Undo beberapa langkah atau mulai ulang.";
            endActions.innerHTML = btn("undo", "↩ Undo", true) + btn("retry", "⟳ Ulangi") + btn("new", "🎲 Acak baru");
        } else {
            endTitle.textContent = "Seri 🤝";
            endSub.textContent = "Dua-duanya buntu. Coba rematch dengan undian baru.";
            endActions.innerHTML = btn("new", "🎲 Rematch", true) + (online ? "" : btn("menu", "☰ Menu"));
        }
    }

    function canUndo() {
        if (!state) return false;
        const my = mySeat();
        const phaseOk = state.phase === "playing" || (state.mode === "solo" && state.phase === "stuck");
        if (!phaseOk) return false;
        if (state.mode !== "solo" && state.turn !== my) return false;
        return state.history[my].length > 0;
    }

    function render() {
        if (destroyed) return;
        const st = state;
        const my = st ? mySeat() : 0;
        const myB = st ? st.boards[my] : null;

        /* sanitasi UI lokal terhadap state terbaru */
        if (myB && myB.length) cursor = Math.min(Math.max(0, cursor), myB.length - 1);
        if (selected >= 0 && (!st || st.phase !== "playing" || !myB || !myB[selected]?.length || (st.mode !== "solo" && st.turn !== my))) selected = -1;
        if (bad && (!st || st.phase !== "playing")) bad = null;
        if (hint && (!st || st.phase !== "playing")) hint = null;

        /* notifikasi tersinkron & undian match baru */
        if (st?.note && st.note.t !== lastNoteT) { lastNoteT = st.note.t; toast(noteText(st.note)); }
        if (st && st.mode !== "solo" && st.seed !== lastSeed) {
            lastSeed = st.seed;
            toast(st.mode === "bot"
                ? `Undian: ${st.first === 0 ? "kamu" : "Bot"} jalan duluan 🎲`
                : `Undian: kamu Pemain ${my + 1} · ${st.first === my ? "kamu" : seatName(st.first)} jalan duluan 🎲`);
        }

        /* efek tuang (sekali per perubahan state) */
        let fxActive = null;
        if (st?.fx && st.fx.t !== lastFxT) { lastFxT = st.fx.t; fxActive = st.fx; }

        /* papan */
        if (!st) boardsEl.innerHTML = `<div class="ws-waiting">Menunggu host mengirim permainan…</div>`;
        else if (st.phase === "menu") boardsEl.innerHTML = `<div class="ws-waiting">Pilih mode di bilah atas untuk mulai — Solo atau Bot.</div>`;
        else {
            const order = st.mode === "solo" ? [0] : [my, 1 - my];
            boardsEl.innerHTML = order.map((seat) => boardCard(seat, st, fxActive)).join("");
        }

        syncUI();
    }

    function syncUI() {
        const st = state;
        const my = st ? mySeat() : 0;
        const myB = st ? st.boards[my] : null;
        const doneN = myB ? myB.filter((x) => x.length && bottleDone(x)).length : 0;

        /* status */
        let status = "Siap", dot = "var(--mut)";
        if (paused && st && st.phase === "playing") { status = "Dijeda"; dot = "var(--amber)"; }
        else if (!st) { status = online ? "Menghubungkan…" : "Siap"; }
        else if (st.phase === "menu") status = "Pilih mode";
        else if (st.phase === "playing") {
            status = st.mode === "solo" ? "Bermain" : (st.turn === my ? "Giliranmu" : `Giliran ${seatName(st.turn)}`);
            dot = "var(--green)";
        } else if (st.phase === "won") {
            status = st.mode === "solo" || st.winner === my ? "Selesai 🎉" : `${seatName(st.winner)} menang`;
            dot = "var(--acc)";
        } else if (st.phase === "stuck") { status = "Buntu"; dot = "var(--red)"; }
        else if (st.phase === "draw") { status = "Seri"; dot = "var(--amber)"; }
        statusEl.textContent = status;
        dotEl.style.background = dot;

        /* semua info di HUD */
        hud.level.textContent = st ? st.level : 1;
        hud.moves.textContent = st ? st.moves[my] : 0;
        hud.done.textContent = myB ? `${doneN}/${st.colors}` : "—";
        hud.par.hidden = !st || st.mode !== "solo" || st.phase === "menu";
        hud.parv.textContent = st ? st.par : 0;
        hud.best.hidden = best <= 0;
        hud.bestv.textContent = `Lv ${best}`;
        hud.rival.hidden = !st || st.mode === "solo" || st.phase === "menu";
        if (!hud.rival.hidden) {
            const rival = 1 - my;
            hud.rivalName.textContent = seatName(rival);
            hud.rivalMoves.textContent = st.moves[rival];
            hud.rivalDot.style.background = SEAT_COLORS[rival] || "var(--mut)";
        }
        hud.cheat.hidden = !(st && st.cheated);
        hud.modes.hidden = online || !st;
        for (const b of hud.modes.querySelectorAll("[data-mode]")) {
            b.classList.toggle("on", Boolean(st && b.dataset.mode === (st.mode === "solo" ? "solo" : "bot")));
        }

        /* overlay: help → cheat → pause → end saling menekan */
        ov.help.hidden = !showHelp;
        ov.cheat.hidden = !showCheat || showHelp;
        const cheatOk = Boolean(st && st.mode === "solo" && (st.phase === "playing" || st.phase === "stuck"));
        cheatNote.textContent = st && st.mode !== "solo"
            ? "Cheat hanya untuk mode Solo — fair play di Bot/Online."
            : "Kemenangan dengan cheat tidak dicatat sebagai rekor.";
        ov.cheat.querySelectorAll("[data-cheat]").forEach((b) => {
            if (b.dataset.cheat !== "close") b.disabled = !cheatOk;
        });
        setToggleLabel(autoLabelEl, autoTimer ? "Hentikan auto" : "Auto-solve");
        setToggleLabel(emptyLabelEl, `Botol kosong +1 (${Math.max(0, 2 - (st?.extra ?? 0))}x)`);
        const endVisible = Boolean(st && (st.phase === "won" || st.phase === "stuck" || st.phase === "draw"));
        ov.pause.hidden = !paused || showHelp || showCheat;
        ov.end.hidden = !endVisible || paused || showCheat || showHelp;
        if (endVisible) endContent(st);

        /* tombol HUD — label span tidak boleh ditimpa textContent */
        const menuPhase = !st || st.phase === "menu";
        undoBtn.disabled = !canUndo() || paused;
        padUndoBtn.disabled = !canUndo() || paused;
        newBtn.disabled = menuPhase;
        cheatBtn.classList.toggle("on", Boolean(st && st.cheated));
        resignBtn.hidden = !(st && st.mode !== "solo" && st.phase === "playing");
        const icon = paused ? "play" : "pause";
        if (pauseIcon !== icon) {
            pauseIcon = icon;
            pauseIconEl.innerHTML = iconSVG(icon, { size: 14 });
        }
        if (pauseLabelEl) pauseLabelEl.textContent = paused ? "Resume" : "Pause";
        pauseBtn.setAttribute("aria-label", paused ? "Resume" : "Pause");
        pauseBtn.title = paused ? "Lanjut (P)" : "Jeda (P)";
        padActEl.textContent = selected >= 0 ? "Tuang" : "Pilih";
        padActBtn.disabled = !(st && st.phase === "playing" && (st.mode === "solo" || st.turn === my)) || paused;

        /* toast */
        toastEl.hidden = !toastMsg;
        toastEl.textContent = toastMsg;
    }

    /* ---------- aksi kanonik (host / lokal) ---------- */
    function applyAction(action, actor = 0) {
        if (destroyed || !state || !action) return;
        const seat = online ? (state.seatMap?.[actor] ?? 0) : (state.mode === "bot" ? actor : 0);
        const versus = state.mode !== "solo";

        switch (action.type) {
            case "start": {
                if (online) return;
                state = action.mode === "bot" ? freshVersus("bot") : freshSolo(Math.max(1, best + 1));
                resetLocal();
                break;
            }
            case "menu": {
                if (online) return;
                state = freshSolo(Math.max(1, best + 1));
                state.phase = "menu";
                resetLocal();
                break;
            }
            case "pour": {
                if (state.phase !== "playing") return;
                if (versus && state.turn !== seat) return;
                const b = state.boards[seat];
                const s = action.s | 0, d = action.d | 0;
                if (!b || s < 0 || d < 0 || s >= b.length || d >= b.length) return;
                const n = pourAmount(b, s, d);
                if (!n) return;
                if (action.cheat && !versus) state.cheated = true;
                state.history[seat].push({ s, d, n });
                state.boards[seat] = applyPour(b, s, d, n);
                state.moves[seat]++;
                state.fx = { seat, d, n, t: now() };
                state.note = null;
                if (isSolved(state.boards[seat])) {
                    state.phase = "won";
                    state.winner = seat;
                    if (!versus && !state.cheated && state.level > best) { best = state.level; writeBest(best); }
                } else if (versus) {
                    const other = 1 - seat;
                    if (hasLegalMove(state.boards[other])) state.turn = other;
                    else if (hasLegalMove(state.boards[seat])) {
                        state.turn = seat;
                        state.note = { kind: "skip", seat: other, t: now() };
                    } else { state.phase = "draw"; state.winner = null; }
                } else if (!hasLegalMove(state.boards[seat])) {
                    state.phase = "stuck";
                }
                break;
            }
            case "undo": {
                const phaseOk = state.phase === "playing" || (!versus && state.phase === "stuck");
                if (!phaseOk) return;
                if (versus && state.turn !== seat) return;
                const h = state.history[seat];
                if (!h.length) return;
                stopAuto();
                const mv = h.pop();
                state.boards[seat] = applyPour(state.boards[seat], mv.d, mv.s, mv.n);
                state.moves[seat] = Math.max(0, state.moves[seat] - 1);
                /* vs bot: undo juga membatalkan langkah bot terakhir agar adil */
                if (state.mode === "bot" && seat === 0 && state.history[1].length) {
                    const bm = state.history[1].pop();
                    state.boards[1] = applyPour(state.boards[1], bm.d, bm.s, bm.n);
                    state.moves[1] = Math.max(0, state.moves[1] - 1);
                }
                state.turn = seat;
                state.phase = "playing";
                state.winner = null;
                break;
            }
            case "resign": {
                if (!versus || state.phase !== "playing") return;
                state.phase = "won";
                state.winner = 1 - seat;
                state.note = { kind: "resign", seat, t: now() };
                break;
            }
            case "retry": {
                if (state.phase === "menu") return;
                const deal = makeDeal(state.level, state.seed); // seed sama → deal identik
                state = {
                    ...state, phase: "playing",
                    boards: versus ? [cloneBoards(deal.bottles), cloneBoards(deal.bottles)] : [deal.bottles],
                    moves: versus ? [0, 0] : [0], history: versus ? [[], []] : [[]],
                    turn: state.first, winner: null, cheated: false, extra: 0, par: deal.par, note: null, fx: null,
                };
                resetLocal();
                break;
            }
            case "new": {
                if (state.phase === "menu") return;
                state = versus ? freshVersus(state.mode) : freshSolo(state.level);
                resetLocal();
                break;
            }
            case "next": {
                if (versus || state.phase !== "won") return;
                state = freshSolo(state.level + 1);
                resetLocal();
                break;
            }
            case "cheat": {
                if (versus || online) return;
                const kind = action.kind;
                if (kind === "flag") {
                    if (state.phase === "playing") state.cheated = true;
                } else if (kind === "empty") {
                    if (state.phase !== "playing" || state.extra >= 2) return;
                    state.boards[0].push([]);
                    state.extra++;
                    state.cheated = true;
                } else if (kind === "color") {
                    if (state.phase !== "playing") return;
                    const bs = state.boards[0];
                    let pick = -1, target = -1, bestCount = 0;
                    for (let c = 0; c < state.colors; c++) {
                        if (bs.some((b) => b.length === CAP && b.every((v) => v === c))) continue; // sudah jadi
                        let t = -1, cnt = 0;
                        for (let i = 0; i < bs.length; i++) {
                            const b = bs[i];
                            if (b.length && b.length < CAP && b.every((v) => v === c) && b.length > cnt) { t = i; cnt = b.length; }
                        }
                        if (t >= 0 && cnt > bestCount) { pick = c; target = t; bestCount = cnt; }
                    }
                    if (pick < 0) {
                        const emptyIdx = bs.findIndex((b) => !b.length);
                        if (emptyIdx >= 0) {
                            let spread = -1;
                            for (let c = 0; c < state.colors; c++) {
                                if (bs.some((b) => b.length === CAP && b.every((v) => v === c))) continue;
                                const n = bs.filter((b) => b.includes(c)).length;
                                if (n > spread) { spread = n; pick = c; }
                            }
                            target = emptyIdx;
                        }
                    }
                    if (pick < 0 || target < 0) { toast("Tidak ada target untuk cheat ini"); return; }
                    const nx = bs.map((b) => b.filter((v) => v !== pick));
                    nx[target] = Array(CAP).fill(pick);
                    if (!solve(nx)) { toast("Cheat itu membuat puzzle buntu — dibatalkan"); return; }
                    state.boards[0] = nx;
                    state.cheated = true;
                    if (isSolved(nx)) { state.phase = "won"; state.winner = 0; }
                    else if (!hasLegalMove(nx)) state.phase = "stuck";
                } else if (kind === "win") {
                    if (state.phase !== "playing" && state.phase !== "stuck") return;
                    state.cheated = true;
                    state.phase = "won";
                    state.winner = 0;
                } else return;
                break;
            }
            default:
                return;
        }
        publish();
    }

    function publish() {
        render();
        if (online && room.isHost) {
            try { room.publishState(state)?.catch?.(console.warn); } catch (e) { console.warn(e); }
        }
        syncBot();
    }

    function submitAction(action) {
        if (destroyed || paused) return;
        if (online && !room.isHost) {
            try { room.sendAction(action)?.catch?.(console.warn); } catch (e) { console.warn(e); }
            render();
            return;
        }
        applyAction(action, playerIndex);
    }

    /* ---------- bot ---------- */
    function syncBot() {
        cancelTimer(botTimer); botTimer = null;
        if (paused || destroyed || !state || state.mode !== "bot" || state.phase !== "playing" || state.turn !== 1) return;
        botTimer = later(botMove, 700 + Math.random() * 700);
    }

    function botMove() {
        if (paused || destroyed || !state || state.mode !== "bot" || state.phase !== "playing" || state.turn !== 1) return;
        const b = state.boards[1];
        let mv = null;
        const path = cachedSolve(b);
        if (path && path.length) {
            mv = path[0];
            /* sedikit randomness agar bot bisa dikalahkan */
            if (Math.random() < 0.18) {
                const alts = legalMoves(b).filter((m) => {
                    const nx = applyPour(b, m[0], m[1], m[2]);
                    return !isSolved(nx) && cachedSolve(nx);
                });
                if (alts.length) mv = alts[(Math.random() * alts.length) | 0];
            }
        } else {
            const alts = legalMoves(b);
            if (alts.length) mv = alts[0];
        }
        if (mv) applyAction({ type: "pour", s: mv[0], d: mv[1] }, 1);
        else applyAction({ type: "resign" }, 1);
    }

    /* ---------- cheat helpers ---------- */
    function stopAuto() { cancelTimer(autoTimer); autoTimer = null; }

    function autoStep() {
        autoTimer = null;
        if (paused || destroyed || !state || state.mode !== "solo" || state.phase !== "playing") { render(); return; }
        const p = cachedSolve(state.boards[0]);
        if (!p || !p.length) { stopAuto(); render(); return; }
        selected = -1;
        submitAction({ type: "pour", s: p[0][0], d: p[0][1], cheat: true });
        if (!paused && !destroyed && state && state.mode === "solo" && state.phase === "playing")
            autoTimer = later(autoStep, 380);
    }

    function toggleAuto() {
        if (autoTimer) { stopAuto(); render(); return; }
        if (paused || !state || state.mode !== "solo" || state.phase !== "playing") { toast("Auto-solve hanya saat bermain solo"); return; }
        submitAction({ type: "cheat", kind: "flag" });
        autoTimer = later(autoStep, 380);
        render();
    }

    function doHint() {
        if (paused || !state || state.mode !== "solo" || state.phase !== "playing") { toast("Hint hanya di mode Solo saat bermain"); render(); return; }
        const p = cachedSolve(state.boards[0]);
        if (!p || !p.length) { toast("Tidak ada solusi dari posisi ini — coba Undo"); render(); return; }
        hint = { s: p[0][0], d: p[0][1] };
        submitAction({ type: "cheat", kind: "flag" });
        cancelTimer(hintTimer);
        hintTimer = later(() => { hint = null; hintTimer = null; render(); }, 2600);
        render();
    }

    /* ---------- interaksi ---------- */
    function overlayOpen() { return showHelp || showCheat || paused; }

    function handleTap(seat, i) {
        if (overlayOpen() || !state || state.phase !== "playing") return;
        const my = mySeat();
        if (seat !== my) { toast("Itu papan lawan 🙂"); render(); return; }
        if (state.mode !== "solo" && state.turn !== my) { toast("Belum giliranmu — tunggu sebentar"); render(); return; }
        stopAuto();
        hint = null;
        const b = state.boards[seat];
        if (!b || !b[i]) return;
        if (selected < 0) {
            if (b[i].length) { selected = i; cursor = i; }
            render();
            return;
        }
        if (selected === i) { selected = -1; render(); return; }
        const n = pourAmount(b, selected, i);
        if (n > 0) {
            const s = selected;
            selected = -1;
            submitAction({ type: "pour", s, d: i });
        } else {
            bad = { seat, i };
            cancelTimer(badTimer);
            badTimer = later(() => { bad = null; badTimer = null; render(); }, 340);
            selected = b[i].length && b[i].length < CAP ? i : -1;
        }
        render();
    }

    function handlePad(kind) {
        if (overlayOpen() || !state || state.phase === "menu") return;
        const my = mySeat();
        const b = state.boards[my];
        if (!b || !b.length) return;
        if (kind === "left" || kind === "right") {
            cursor = (cursor + (kind === "left" ? b.length - 1 : 1)) % b.length;
            showCursor = true;
            render();
        } else if (kind === "act") {
            showCursor = true;
            handleTap(my, cursor);
        } else if (kind === "undo") {
            submitAction({ type: "undo" });
        }
    }

    function handleCheat(kind) {
        if (kind === "close") { showCheat = false; render(); return; }
        if (showHelp || paused) return;
        if (!state || state.mode !== "solo") { toast("Cheat hanya tersedia di mode Solo"); render(); return; }
        if (kind === "hint") doHint();
        else if (kind === "step") {
            if (state.phase !== "playing") return;
            const p = cachedSolve(state.boards[0]);
            if (p && p.length) { selected = -1; submitAction({ type: "pour", s: p[0][0], d: p[0][1], cheat: true }); }
            else toast("Tidak ada solusi dari posisi ini — coba Undo");
        }
        else if (kind === "auto") toggleAuto();
        else if (kind === "empty") submitAction({ type: "cheat", kind: "empty" });
        else if (kind === "color") submitAction({ type: "cheat", kind: "color" });
        else if (kind === "win") submitAction({ type: "cheat", kind: "win" });
    }

    function toggleHelp(on) {
        showHelp = typeof on === "boolean" ? on : !showHelp;
        if (showHelp) {
            showCheat = false; // help mematikan overlay lain
            if (paused) setPaused(false, false);
        }
        markHelp();
        render();
    }

    function handleAct(act, modeKind) {
        const menu = !state || state.phase === "menu";
        if (act === "help") { toggleHelp(); return; }
        if (act === "close-help") { toggleHelp(false); return; }
        if (act === "cheat") {
            if (menu) startMode("solo");
            if (!showHelp && !paused) { showCheat = !showCheat; render(); }
            return;
        }
        if (act === "pause") {
            if (menu) { startMode("solo"); togglePause(); return; }
            togglePause(); return;
        }
        if (act === "resume") { if (paused) setPaused(false); return; }
        if (act === "pad") { root.classList.toggle("ws-pad-on"); render(); return; }
        if (act === "start") { if (modeKind) startMode(modeKind); return; }
        if (["undo", "retry", "new", "next", "menu", "resign"].includes(act)) {
            if (menu) { startMode("solo"); return; }
            if (paused) setPaused(false, false);
            stopAuto();
            submitAction({ type: act });
        }
    }

    function handleClick(event) {
        const t = event.target;
        if (!t || !t.closest) return;
        if (t.closest("[data-exit]")) { onExit(); return; }
        const modeBtn = t.closest("[data-mode]");
        if (modeBtn) { startMode(modeBtn.dataset.mode); return; }
        const padBtn = t.closest("[data-pad]");
        if (padBtn) { handlePad(padBtn.dataset.pad); return; }
        const cheatBtnEl = t.closest("[data-cheat]");
        if (cheatBtnEl) { if (!cheatBtnEl.disabled) handleCheat(cheatBtnEl.dataset.cheat); return; }
        const actBtn = t.closest("[data-act]");
        if (actBtn) { if (!actBtn.disabled) handleAct(actBtn.dataset.act, actBtn.dataset.mode); return; }
        const bottle = t.closest("[data-bottle]");
        if (bottle) { handleTap(Number(bottle.dataset.seat), Number(bottle.dataset.bottle)); }
    }

    /* Prioritas keyboard: help → cheats → pause/Escape → aksi game. */
    function handleKey(e) {
        if (destroyed || !root.isConnected || e.ctrlKey || e.metaKey || e.altKey) return;
        const tag = e.target && e.target.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
        if (tag === "BUTTON" && (e.key === "Enter" || e.key === " ")) return; // biarkan tombol native
        const code = e.code, k = e.key.toLowerCase();
        if (code === "KeyH" || k === "t" || e.key === "?") { toggleHelp(); e.preventDefault(); return; }
        if (code === "KeyC") {
            if (!showHelp && !paused) { showCheat = !showCheat; render(); }
            e.preventDefault(); return;
        }
        if (code === "KeyP" || e.key === "Escape") {
            if (showHelp) toggleHelp(false);
            else if (showCheat) { showCheat = false; render(); }
            else togglePause();
            e.preventDefault(); return;
        }
        if (code === "KeyR") { handleAct("retry"); e.preventDefault(); return; }
        if (showHelp || showCheat || paused) return;
        if (!state) return;
        if (state.phase === "menu") {
            if (e.key === "Enter") { startMode("solo"); e.preventDefault(); }
            else if (code === "KeyB") { startMode("bot"); e.preventDefault(); }
            return;
        }
        if (code === "KeyN") { submitAction({ type: "new" }); e.preventDefault(); return; }
        if (code === "KeyU") { submitAction({ type: "undo" }); e.preventDefault(); return; }
        if (code === "KeyI") { doHint(); e.preventDefault(); return; }
        if (state.phase !== "playing") return;
        const my = mySeat();
        const b = state.boards[my];
        if (!b || !b.length) return;
        if (e.key === "ArrowLeft" || code === "KeyA") { cursor = (cursor + b.length - 1) % b.length; showCursor = true; render(); e.preventDefault(); }
        else if (e.key === "ArrowRight" || code === "KeyD") { cursor = (cursor + 1) % b.length; showCursor = true; render(); e.preventDefault(); }
        else if (e.key === "Enter" || e.key === " ") { showCursor = true; handleTap(my, cursor); e.preventDefault(); }
        else if (/^[1-9]$/.test(e.key)) {
            const i = Number(e.key) - 1;
            if (i < b.length) { cursor = i; showCursor = true; handleTap(my, i); }
            e.preventDefault();
        }
    }

    root.addEventListener("click", handleClick);
    document.addEventListener("keydown", handleKey);

    /* ---------- wiring room / lokal (struktur template yang sudah dibetulkan) ---------- */
    function sub(fn) {
        try { const u = fn(); if (typeof u === "function") subs.push(u); } catch (e) { console.warn(e); }
    }

    if (online) {
        sub(() => room.onRoom?.((nextRoom) => {
            if (destroyed) return;
            roomData = nextRoom || roomData;
            render();
        }));
        if (room.isHost) {
            state = freshVersus("online"); // undian posisi & giliran pertama di sini
            publish();
            sub(() => room.onAction?.((action) => { if (!destroyed) applyAction(action, 1); }));
        } else {
            sub(() => room.onState?.((nextState) => {
                if (destroyed || !nextState || nextState.id !== "water-sort") return;
                state = nextState;
                selected = -1;
                hint = null;
                stopAuto();
                render();
            }));
        }
    } else {
        state = freshSolo(Math.max(1, best + 1));
        state.phase = "menu";
        render();
    }

    return {
        destroy() {
            destroyed = true;
            stopAuto();
            for (const rec of Array.from(pending)) cancelTimer(rec);
            root.removeEventListener("click", handleClick);
            document.removeEventListener("keydown", handleKey);
            subs.forEach((u) => { try { u(); } catch { } });
            root.classList.remove("ws-root", "ws-pad-on");
        },
    };
}