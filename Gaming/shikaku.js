/* ==== GAME: shikaku.js ==== */
/*
  Shikaku - puzzle module (template-compatible).
  1. META.id harus sama dengan nama file tanpa .js  -> "shikaku".
  2. Semua logika game ada di mount().
  3. Setelah menyalin file ini, jalankan: node tools/build-games-manifest.mjs

  Fitur:
  - Generator level acak yang DIJAMIN bisa diselesaikan (partisi grid konstruktif).
  - Variasi puzzle: ukuran papan, papan persegi panjang, parameter luas/sisi acak,
    gaya irisan rekursif & gaya "kincir" (non-guillotine), level tak terbatas.
  - Mode vs Bot (AI) & multiplayer (room): giliran bergantian, skor = sel yang dipasang.
  - Undian acak siapa mulai duluan + undian acak posisi pemain (P1/P2) per sesi.
  - Cheat overlay, tutorial, tombol virtual mobile, keyboard + mouse desktop,
    mode hapus per-kotak, undo, bersihkan papan.
*/

export const META = {
    id: "shikaku",
    name: "Shikaku",
    category: "puzzle",
    catLabel: "Puzzle",
    desc: "Iris grid menjadi persegi panjang. Setiap kotak memuat tepat satu angka dan luasnya harus sama dengan angka itu.",
    art: '<svg viewBox="0 0 48 48" width="54" height="54" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true"><rect x="5" y="5" width="38" height="38" rx="2"/><path stroke-width="1.3" opacity=".45" d="M14.5 5v38M24 5v38M33.5 5v38M5 14.5h38M5 24h38M5 33.5h38"/><rect x="5" y="5" width="28.5" height="19.5" rx="3" fill="rgba(255,255,255,.16)" stroke-width="3"/><text x="19.2" y="17.2" fill="currentColor" stroke="none" font-family="inherit" font-size="11" font-weight="700" text-anchor="middle">6</text></svg>',
    bg: ["#eef2ff", "#c7d2fe"],
};

/* ===================== pure logic (module scope) ===================== */

const NS = "http://www.w3.org/2000/svg";
const CS = 48; /* ukuran sel dalam koordinat SVG */
const SEAT_LABEL = ["P1", "P2"];
const SEAT_COLOR = ["#6366f1", "#f59e0b"];
const SEAT_FILL = ["rgba(99,102,241,.16)", "rgba(245,158,11,.16)"];

const rnd = (n) => (Math.random() * n) | 0;
const pick = (a) => a[rnd(a.length)];
function shuffle(a) {
    for (let i = a.length - 1; i > 0; i--) {
        const j = rnd(i + 1);
        const t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
}

const terminalOK = (w, h, cfg) => {
    const a = w * h;
    return a >= cfg.min && a <= cfg.max && Math.max(w, h) <= cfg.side;
};

/* Memo feasibility: bisakah W x H dipartisi jadi kotak valid (luas min..max, sisi <= side)? */
function makeFeas(cfg) {
    const memo = new Map();
    const feas = (w, h) => {
        const k = w + "x" + h;
        if (memo.has(k)) return memo.get(k);
        memo.set(k, false);
        const a = w * h;
        let ok = terminalOK(w, h, cfg);
        if (!ok && a >= cfg.min * 2) {
            for (let s = 1; s < w && !ok; s++) if (feas(s, h) && feas(w - s, h)) ok = true;
            for (let s = 1; s < h && !ok; s++) if (feas(w, s) && feas(w, h - s)) ok = true;
        }
        memo.set(k, ok);
        return ok;
    };
    return feas;
}

/* Partisi rekursif biner dengan bias acak per-puzzle (variasi bentuk). */
function splitPartition(w, h, cfg, feas) {
    feas = feas || makeFeas(cfg);
    const rects = [];
    const pT = 0.35 + Math.random() * 0.5;
    const niceB = 0.4 + Math.random() * 0.5;
    const opts = (W, H) => {
        const o = [];
        for (let s = 1; s < W; s++)
            if (feas(s, H) && feas(W - s, H))
                o.push({ vert: true, k: s, nice: terminalOK(s, H, cfg) && terminalOK(W - s, H, cfg) });
        for (let s = 1; s < H; s++)
            if (feas(W, s) && feas(W, H - s))
                o.push({ vert: false, k: s, nice: terminalOK(W, s, cfg) && terminalOK(W, H - s, cfg) });
        return o;
    };
    const rec = (x, y, W, H) => {
        const a = W * H;
        if (terminalOK(W, H, cfg)) {
            const p = a <= 5 ? 0.9 : a <= 8 ? 0.5 : pT;
            if (Math.random() < p) { rects.push({ x, y, w: W, h: H }); return; }
        }
        const O = opts(W, H);
        if (!O.length) { rects.push({ x, y, w: W, h: H }); return; }
        const nice = O.filter((t) => t.nice);
        const pool = nice.length && Math.random() < niceB ? nice : O;
        const s = pick(pool);
        if (s.vert) { rec(x, y, s.k, H); rec(x + s.k, y, W - s.k, H); }
        else { rec(x, y, W, s.k); rec(x, y + s.k, W, H - s.k); }
    };
    rec(0, 0, w, h);
    return rects;
}

/* Partisi "kincir" (pinwheel): 5 wilayah non-guillotine, tiap lengan dipartisi lagi. */
function pinwheelPartition(w, h, cfg, feas) {
    feas = feas || makeFeas(cfg);
    for (let t = 0; t < 80; t++) {
        const cx = 1 + rnd(w - 2), cw = 1 + rnd(w - 1 - cx);
        const cy = 1 + rnd(h - 2), ch = 1 + rnd(h - 1 - cy);
        if (!terminalOK(cw, ch, cfg)) continue;
        const arms = [
            { ox: 0, oy: 0, W: cx + cw, H: cy },
            { ox: cx + cw, oy: 0, W: w - cx - cw, H: cy + ch },
            { ox: cx, oy: cy + ch, W: w - cx, H: h - cy - ch },
            { ox: 0, oy: cy, W: cx, H: h - cy },
        ];
        if (!arms.every((a) => feas(a.W, a.H))) continue;
        const rects = [{ x: cx, y: cy, w: cw, h: ch }];
        for (const a of arms)
            for (const r of splitPartition(a.W, a.H, cfg, feas))
                rects.push({ x: a.ox + r.x, y: a.oy + r.y, w: r.w, h: r.h });
        return rects;
    }
    return null;
}

/* Konfigurasi level tetap (6 level pertama), lalu acak tanpa batas. */
const CONFIGS = [
    { w: 6, h: 6, min: 3, max: 12, side: 4, style: "split" },
    { w: 7, h: 7, min: 2, max: 12, side: 4, style: "split" },
    { w: 6, h: 8, min: 3, max: 15, side: 5, style: "split" },
    { w: 8, h: 8, min: 3, max: 16, side: 4, style: "pin" },
    { w: 9, h: 9, min: 3, max: 20, side: 5, style: "split" },
    { w: 7, h: 9, min: 2, max: 18, side: 6, style: "pin" },
];
function randomCfg() {
    const side = 4 + rnd(3);
    return {
        w: 6 + rnd(4), h: 6 + rnd(4),
        min: 2 + rnd(3),
        max: Math.min(12 + rnd(13), side * side),
        side,
        style: Math.random() < 0.35 ? "pin" : "split",
    };
}

/* Puzzle baru: partisi konstruktif => solusi pasti ada. */
function makePuzzle(level) {
    let cfg = level <= CONFIGS.length ? { ...CONFIGS[level - 1] } : randomCfg();
    let feas = makeFeas(cfg);
    let tries = 0;
    while (!feas(cfg.w, cfg.h) && tries++ < 25) { cfg = randomCfg(); feas = makeFeas(cfg); }
    if (!feas(cfg.w, cfg.h)) { cfg = { ...CONFIGS[0] }; feas = makeFeas(cfg); }
    let rects = null;
    if (cfg.style === "pin") rects = pinwheelPartition(cfg.w, cfg.h, cfg, feas);
    if (!rects) rects = splitPartition(cfg.w, cfg.h, cfg, feas);
    let sum = 0;
    for (const r of rects) sum += r.w * r.h;
    if (sum !== cfg.w * cfg.h) rects = splitPartition(cfg.w, cfg.h, cfg, feas);
    const clues = rects.map((rc) => ({
        r: rc.y + rnd(rc.h),
        c: rc.x + rnd(rc.w),
        n: rc.w * rc.h,
    }));
    return {
        pid: Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
        level, w: cfg.w, h: cfg.h,
        cfg: { min: cfg.min, max: cfg.max, side: cfg.side, style: cfg.style },
        clues, solution: rects,
    };
}

const sameRect = (a, b) => a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h;
const rectsOverlap = (a, b) =>
    a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const clueInRect = (cl, rc) =>
    cl.r >= rc.y && cl.r < rc.y + rc.h && cl.c >= rc.x && cl.c < rc.x + rc.w;

/* Validasi murni terhadap state (dipakai UI, host, dan bot). */
function validateRect(st, rc) {
    if (!rc || rc.w < 1 || rc.h < 1) return { ok: false, reason: "Kotak kosong." };
    if (rc.x < 0 || rc.y < 0 || rc.x + rc.w > st.w || rc.y + rc.h > st.h)
        return { ok: false, reason: "Kotak harus di dalam grid." };
    for (const p of st.placed)
        if (rectsOverlap(rc, p)) return { ok: false, reason: "Kotak tidak boleh tumpang tindih." };
    const inside = st.clues.filter((cl) => clueInRect(cl, rc));
    if (inside.length !== 1) return { ok: false, reason: "Kotak harus memuat tepat satu angka." };
    if (inside[0].n !== rc.w * rc.h) return { ok: false, reason: "Luas kotak harus sama dengan angkanya." };
    return { ok: true, reason: "" };
}

/* Semua langkah legal saat ini (untuk bot, petunjuk, cheat, deteksi buntu). */
function findMoves(st) {
    const res = [];
    for (const cl of st.clues) {
        if (st.placed.some((p) => clueInRect(cl, p))) continue;
        for (let w = 1; w <= cl.n; w++) {
            if (cl.n % w) continue;
            const h = cl.n / w;
            const x0 = Math.max(0, cl.c - w + 1), x1 = Math.min(cl.c, st.w - w);
            const y0 = Math.max(0, cl.r - h + 1), y1 = Math.min(cl.r, st.h - h);
            for (let x = x0; x <= x1; x++)
                for (let y = y0; y <= y1; y++) {
                    const rc = { x, y, w, h };
                    if (st.placed.some((p) => rectsOverlap(rc, p))) continue;
                    if (st.clues.filter((c2) => clueInRect(c2, rc)).length !== 1) continue;
                    res.push(rc);
                }
        }
    }
    return res;
}

function scoresOf(st) {
    const s = [0, 0];
    for (const p of st.placed) s[p.by] += p.w * p.h;
    return s;
}
function rectAt(st, r, c) {
    for (let i = st.placed.length - 1; i >= 0; i--)
        if (clueInRect({ r, c }, st.placed[i])) return i;
    return -1;
}

/* ===================== mount ===================== */

export function mount(root, context = {}) {
    const { mode = "ai", room = null, playerName = "Player", onExit = () => { } } = context;
    const online = mode === "room" && Boolean(room);
    const playerIndex = online && !room.isHost ? 1 : 0;
    let roomData = room?.room || null;

    /* Undian posisi pemain per sesi (P1/P2 diacak). Online: host yang mengundi,
       lalu dipublikasikan lewat state agar kedua pemain melihat hasil yang sama. */
    const seatOf = shuffle([0, 1]);

    let state = null;

    /* ---------- UI state (lokal, tidak disinkronkan) ---------- */
    let helpOpen = true, startedOnce = false, cheatsOpen = false, soloMode = false;
    let eraseMode = false, eraseHover = null;
    let pending = null, dragAnchor = null, dragging = false, previewRect = null;
    let cursor = { r: 0, c: 0 }, cursorOn = false;
    let hintRect = null, showSolution = false;
    let boardKey = null, overKeyNow = null, overDismissed = null, lastNote = "";
    let botTimer = null, clockId = null, msgTimer = null, fxTimers = [];
    let padHold1 = null, padHold2 = null;
    let padVisible =
        (window.matchMedia && window.matchMedia("(pointer: coarse)").matches) ||
        "ontouchstart" in window;
    const unsubs = [];

    const mySeat = () => (state ? state.seatOf[playerIndex] : 0);
    const oppSeat = () => 1 - mySeat();
    const oppName = () =>
        online ? (roomData?.players?.[1 - playerIndex]?.name || "P" + (oppSeat() + 1)) : "Bot";
    const seatName = (s) => (s === mySeat() ? "Kamu" : oppName());

    function newGame(level) {
        const p = makePuzzle(level);
        const first = rnd(2); /* undian acak siapa mulai duluan */
        return {
            ...p,
            placed: [],
            seatOf: seatOf.slice(),
            first, turn: first, passCount: 0,
            status: "playing", winner: null,
            assisted: false, note: "",
            startedAt: Date.now(), endedAt: null,
        };
    }

    /* ---------- scaffold ---------- */
    root.innerHTML = `
<style>
.shk{--ink:#0f172a;--muted:#64748b;--line:#e2e8f0;--card:#fff;--soft:#f8fafc;--bad:#ef4444;--ok:#10b981;color:var(--ink)}
.shk-panel{display:flex;flex-direction:column;gap:10px;align-items:center;padding:12px;background:var(--card);border:1px solid var(--line);border-radius:16px;box-shadow:0 1px 2px rgba(15,23,42,.05)}
.shk-chips{display:flex;flex-wrap:wrap;gap:6px;justify-content:center}
.shk-chip{display:inline-flex;align-items:center;gap:5px;font-size:12px;color:var(--muted);background:var(--soft);border:1px solid var(--line);border-radius:999px;padding:3px 10px;white-space:nowrap}
.shk-chip b{color:var(--ink);font-weight:600}
.shk-dot{width:8px;height:8px;border-radius:50%;background:#cbd5e1;display:inline-block;flex:none}
.shk-stage{position:relative;width:100%;display:flex;justify-content:center}
.shk-boardbox{width:min(440px,100%)}
.shk svg.shk-svg{display:block;width:100%;height:auto;max-height:62vh;touch-action:none;user-select:none;-webkit-user-select:none;cursor:crosshair}
.shk-msg{min-height:18px;font-size:12.5px;color:var(--muted);text-align:center}
.shk-msg.err{color:var(--bad);font-weight:600}
.shk-controls{display:flex;flex-wrap:wrap;gap:6px;justify-content:center}
.shk-btn{appearance:none;border:1px solid var(--line);background:var(--card);color:var(--ink);font:inherit;font-size:12.5px;font-weight:600;padding:7px 12px;border-radius:10px;cursor:pointer;transition:background .15s,border-color .15s}
.shk-btn:hover:not(:disabled){background:var(--soft)}
.shk-btn:active:not(:disabled){transform:translateY(1px)}
.shk-btn:disabled{opacity:.4;cursor:default}
.shk-btn.primary{background:var(--ink);border-color:var(--ink);color:#fff}
.shk-btn.primary:hover:not(:disabled){background:#1e293b}
.shk-btn.on{border-color:var(--ink);background:var(--ink);color:#fff}
.shk-ov{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(248,250,252,.9);backdrop-filter:blur(3px);z-index:5;padding:8px;overflow:auto}
.shk-card{position:relative;background:var(--card);border:1px solid var(--line);border-radius:16px;box-shadow:0 8px 24px rgba(15,23,42,.08);padding:16px;max-width:400px;width:100%;max-height:100%;overflow:auto;font-size:13px;line-height:1.55}
.shk-card h3{margin:0 0 8px;font-size:16px}
.shk-rules{margin:0 0 10px;padding-left:18px;display:flex;flex-direction:column;gap:4px}
.shk-keys{display:flex;flex-direction:column;gap:6px;font-size:12px;color:var(--muted);background:var(--soft);border:1px solid var(--line);border-radius:10px;padding:8px 10px;margin-bottom:10px}
.shk-toss{font-size:12.5px;font-weight:600;margin:0 0 10px}
.shk-x{position:absolute;top:8px;right:8px;border:none;background:none;font-size:18px;line-height:1;color:var(--muted);cursor:pointer;padding:4px}
.shk-fineprint{font-size:11.5px;color:var(--muted);margin:0 0 8px}
.shk-overbtns{display:flex;gap:6px;flex-wrap:wrap}
.shk-cheatlist{display:flex;flex-direction:column;gap:6px}
.shk-cheatrow{display:flex;align-items:center;justify-content:space-between;gap:8px;border:1px solid var(--line);border-radius:10px;padding:6px 10px}
.shk-cheatrow span{font-size:12.5px}
.shk-pad{display:flex;gap:14px;align-items:center;justify-content:center;padding:4px 0}
.shk-dpad{display:grid;grid-template-columns:repeat(3,44px);grid-template-rows:repeat(3,44px);gap:4px}
.shk-padbtn{border:1px solid var(--line);background:var(--card);border-radius:10px;font-size:16px;font-weight:700;color:var(--ink);cursor:pointer;touch-action:manipulation;user-select:none;-webkit-user-select:none}
.shk-padbtn:active{background:var(--soft)}
.shk-padbtn.on{background:var(--ink);color:#fff;border-color:var(--ink)}
.shk-padside{display:flex;flex-direction:column;gap:6px}
.shk-padside .shk-btn{min-height:44px;min-width:84px}
.shk-svg .shk-ln{stroke:#e2e8f0;stroke-width:1}
.shk-svg .shk-brd{stroke:#cbd5e1;stroke-width:2;fill:none}
.shk-svg text{pointer-events:none;user-select:none}
.shk-flash{fill:rgba(239,68,68,.3);stroke:#ef4444;stroke-width:2.5;animation:shkfade .5s forwards}
@keyframes shkfade{to{opacity:0}}
@media (max-width:480px){.shk-card{padding:12px}.shk-dpad{grid-template-columns:repeat(3,40px);grid-template-rows:repeat(3,40px)}}
</style>
<div class="game-app shk">
  <div class="game-intro">
    <div><h2>Shikaku</h2><p>Iris grid jadi persegi panjang sesuai angka petunjuk. Lawan bot atau pemain lain secara bergiliran.</p></div>
    <span class="game-status"><i class="game-status-dot" data-el="dot"></i><span data-el="status">Siap</span></span>
  </div>
  <section class="game-panel shk-panel" data-board>
    <div class="shk-chips">
      <span class="shk-chip">Level <b data-hud="level">1</b></span>
      <span class="shk-chip">Grid <b data-hud="size">6×6</b></span>
      <span class="shk-chip"><i class="shk-dot" data-el="turndot"></i><b data-hud="turn">-</b></span>
      <span class="shk-chip" title="Skor kamu : lawan (total sel)">Skor <b data-hud="score">0 : 0</b></span>
      <span class="shk-chip">Kotak <b data-hud="rects">0/0</b></span>
      <span class="shk-chip">Waktu <b data-hud="time">0:00</b></span>
      <span class="shk-chip">Mode <b data-hud="mode">vs Bot</b></span>
      <span class="shk-chip" data-hud="assisted" hidden>🧪 cheat</span>
    </div>
    <div class="shk-stage">
      <div class="shk-boardbox">
        <svg class="shk-svg" data-el="svg" viewBox="0 0 288 288" role="img" aria-label="Papan Shikaku">
          <g data-el="gghost"></g>
          <g data-el="gplaced"></g>
          <g data-el="ggrid"></g>
          <g data-el="gclues"></g>
          <g data-el="gfx"></g>
        </svg>
      </div>
      <div class="shk-ov" data-ov="help">
        <div class="shk-card">
          <h3>Cara bermain</h3>
          <ol class="shk-rules">
            <li>Bagi grid menjadi persegi panjang. Setiap kotak wajib memuat <b>tepat satu angka</b>, dan <b>luas kotak = angka itu</b> (jumlah sel).</li>
            <li>Gambar kotak: <b>seret dari satu sel sudut ke sudut berlawanan</b>, atau <b>klik dua sel sudut</b>. Pratinjau hijau/biru = valid, merah = tidak valid.</li>
            <li>Kotak tidak boleh tumpang tindih. Papan selesai bila seluruh grid tertutup.</li>
            <li><b>Mode lawan</b>: giliran bergantian (undian acak). Skor = total sel yang kamu pasang. Skor terbesar menang; bila buntu dua giliran berturut-turut, permainan berakhir.</li>
            <li>Menghapus: aktifkan <b>Hapus</b> lalu ketuk kotak <b>milikmu</b>, atau pakai <b>Undo</b> / <b>Bersihkan</b>.</li>
          </ol>
          <div class="shk-keys">
            <div><b>Desktop</b>: seret / klik dua sudut • klik kanan = batal • Panah/WASD = kursor • Enter/Spasi = tandai sudut • U = undo • X = mode hapus • P = lewati • H = petunjuk • C = bersihkan • Esc = batal/tutup</div>
            <div><b>Mobile</b>: seret langsung di grid, atau pakai tombol virtual (tombol 🎮 untuk menampilkan/menyembunyikan). ⊙ = tandai sudut.</div>
          </div>
          <p class="shk-toss" data-el="toss">Mengundi posisi pemain…</p>
          <button class="shk-btn primary" type="button" data-act="begin">Mulai bermain</button>
        </div>
      </div>
      <div class="shk-ov" data-ov="over" hidden>
        <div class="shk-card">
          <button class="shk-x" type="button" data-act="over-close" aria-label="Tutup">×</button>
          <h3 data-el="overtitle">Selesai</h3>
          <p data-el="oversub"></p>
          <div class="shk-overbtns">
            <button class="shk-btn primary" type="button" data-act="next">Level berikutnya</button>
            <button class="shk-btn" type="button" data-act="restart">Ulangi puzzle</button>
          </div>
          <p class="shk-fineprint" data-el="overnote"></p>
        </div>
      </div>
      <div class="shk-ov" data-ov="cheats" hidden>
        <div class="shk-card">
          <button class="shk-x" type="button" data-act="cheats-close" aria-label="Tutup">×</button>
          <h3>Cheat</h3>
          <p class="shk-fineprint">Aksi cheat menandai permainan sebagai "assisted". Lihat solusi & petunjuk hanya tampilan lokal.</p>
          <div class="shk-cheatlist">
            <div class="shk-cheatrow"><span>👁 Lihat garis solusi</span><button class="shk-btn" type="button" data-act="cheat-solution" data-el="cheatsol">Off</button></div>
            <div class="shk-cheatrow"><span>💡 Petunjuk satu langkah</span><button class="shk-btn" type="button" data-act="cheat-hint">Petunjuk</button></div>
            <div class="shk-cheatrow"><span>⚡ Pasang langkah terbaik</span><button class="shk-btn" type="button" data-act="cheat-auto">Pasang</button></div>
            <div class="shk-cheatrow"><span>🧩 Selesaikan papan</span><button class="shk-btn" type="button" data-act="cheat-solve" data-el="cheatsolve">Selesaikan</button></div>
            <div class="shk-cheatrow"><span>⏭ Lompati giliran lawan</span><button class="shk-btn" type="button" data-act="cheat-skip" data-el="cheatskip">Lompati</button></div>
            <div class="shk-cheatrow"><span>🧘 Mode santai (tanpa bot)</span><button class="shk-btn" type="button" data-act="cheat-solo" data-el="cheatsolo">Off</button></div>
          </div>
        </div>
      </div>
    </div>
    <div class="shk-msg" data-el="msg" aria-live="polite"></div>
    <div class="shk-controls">
      <button class="shk-btn" type="button" data-act="undo" title="Undo (U)">↩ Undo</button>
      <button class="shk-btn" type="button" data-act="erase" title="Mode hapus (X)">🧽 Hapus</button>
      <button class="shk-btn" type="button" data-act="pass" title="Lewati giliran (P)">⏭ Lewati</button>
      <button class="shk-btn" type="button" data-act="clear" title="Bersihkan papan (C)">🗑 Bersihkan</button>
      <button class="shk-btn" type="button" data-act="new" title="Puzzle baru, level sama (N)">🎲 Puzzle baru</button>
      <button class="shk-btn" type="button" data-act="restart" title="Ulangi puzzle ini">⟳ Ulangi</button>
      <button class="shk-btn" type="button" data-act="cheats" title="Buka cheat">🧪 Cheat</button>
      <button class="shk-btn" type="button" data-act="help" title="Cara bermain">❔ Bantuan</button>
      <button class="shk-btn" type="button" data-act="pad-toggle" title="Tombol virtual">🎮</button>
    </div>
    <div class="shk-pad" data-el="pad" hidden>
      <div class="shk-dpad">
        <span></span><button class="shk-padbtn" type="button" data-pad="up" aria-label="Atas">▲</button><span></span>
        <button class="shk-padbtn" type="button" data-pad="left" aria-label="Kiri">◀</button>
        <button class="shk-padbtn" type="button" data-pad="set" aria-label="Tandai sudut">⊙</button>
        <button class="shk-padbtn" type="button" data-pad="right" aria-label="Kanan">▶</button>
        <span></span><button class="shk-padbtn" type="button" data-pad="down" aria-label="Bawah">▼</button><span></span>
      </div>
      <div class="shk-padside">
        <button class="shk-btn" type="button" data-pad="cancel">✕ Batal</button>
        <button class="shk-btn" type="button" data-pad="erase" data-el="paderase">🧽 Hapus</button>
      </div>
    </div>
  </section>
  <div class="game-actions"><button class="game-action-button" type="button" data-exit>Keluar</button></div>
</div>`;

    const $ = (s, r) => (r || root).querySelector(s);
    const mk = (tag, attrs, parent) => {
        const el = document.createElementNS(NS, tag);
        for (const k in attrs) el.setAttribute(k, attrs[k]);
        if (parent) parent.appendChild(el);
        return el;
    };

    const svg = $('[data-el="svg"]');
    const gGhost = $('[data-el="gghost"]');
    const gPlaced = $('[data-el="gplaced"]');
    const gGrid = $('[data-el="ggrid"]');
    const gClues = $('[data-el="gclues"]');
    const gFx = $('[data-el="gfx"]');
    const msgEl = $('[data-el="msg"]');
    const dotEl = $('[data-el="dot"]');
    const statusEl = $('[data-el="status"]');
    const turnDot = $('[data-el="turndot"]');
    const hud = {
        level: $('[data-hud="level"]'), size: $('[data-hud="size"]'),
        turn: $('[data-hud="turn"]'), score: $('[data-hud="score"]'),
        rects: $('[data-hud="rects"]'), time: $('[data-hud="time"]'),
        mode: $('[data-hud="mode"]'), assisted: $('[data-hud="assisted"]'),
    };
    const ovHelp = $('[data-ov="help"]');
    const ovOver = $('[data-ov="over"]');
    const ovCheats = $('[data-ov="cheats"]');
    const tossEl = $('[data-el="toss"]');
    const overTitle = $('[data-el="overtitle"]');
    const overSub = $('[data-el="oversub"]');
    const overNote = $('[data-el="overnote"]');
    const btns = {
        undo: $('[data-act="undo"]'), erase: $('[data-act="erase"]'),
        pass: $('[data-act="pass"]'), clear: $('[data-act="clear"]'),
        new: $('[data-act="new"]'), restart: $('[data-act="restart"]'),
        next: $('[data-act="next"]'),
    };
    const cheatBtns = {
        sol: $('[data-el="cheatsol"]'), solve: $('[data-el="cheatsolve"]'),
        skip: $('[data-el="cheatskip"]'), solo: $('[data-el="cheatsolo"]'),
        auto: $('[data-act="cheat-auto"]'),
    };
    const padEl = $('[data-el="pad"]');
    const padErase = $('[data-el="paderase"]');
    let clueEls = [];

    const hintEl = mk("rect", { rx: 6, fill: "rgba(16,185,129,.08)", stroke: "#10b981", "stroke-width": 2.5, "stroke-dasharray": "5 4", display: "none" }, gFx);
    const eraseEl = mk("rect", { rx: 8, fill: "rgba(239,68,68,.10)", stroke: "#ef4444", "stroke-width": 2.5, display: "none" }, gFx);
    const previewEl = mk("rect", { rx: 6, "stroke-width": 2.5, "stroke-dasharray": "7 5", display: "none" }, gFx);
    const anchorEl = mk("rect", { rx: 6, fill: "rgba(15,23,42,.05)", stroke: "#0f172a", "stroke-width": 2.5, display: "none" }, gFx);
    const cursorEl = mk("rect", { rx: 6, fill: "none", stroke: "#94a3b8", "stroke-width": 2, "stroke-dasharray": "4 3", display: "none" }, gFx);

    const fmt = (sec) => ((sec / 60) | 0) + ":" + String(sec % 60).padStart(2, "0");
    const timeSec = () => {
        if (!state) return 0;
        const end = state.status === "done" && state.endedAt ? state.endedAt : Date.now();
        return Math.max(0, ((end - state.startedAt) / 1000) | 0);
    };

    function showMsg(text, err) {
        msgEl.textContent = text;
        msgEl.className = "shk-msg" + (err ? " err" : "");
        if (msgTimer !== null) { clearTimeout(msgTimer); msgTimer = null; }
        if (text) msgTimer = setTimeout(() => {
            msgTimer = null; msgEl.textContent = ""; msgEl.className = "shk-msg";
        }, 3200);
    }

    function flashRect(rc) {
        const el = mk("rect", {
            x: rc.x * CS + 2, y: rc.y * CS + 2,
            width: rc.w * CS - 4, height: rc.h * CS - 4, rx: 6, class: "shk-flash",
        }, gFx);
        const t = setTimeout(() => {
            fxTimers = fxTimers.filter((x) => x !== t);
            el.remove();
        }, 520);
        fxTimers.push(t);
    }

    /* ---------- board ---------- */
    function drawBoard() {
        const W = state.w, H = state.h, SW = W * CS, SH = H * CS;
        svg.setAttribute("viewBox", "0 0 " + SW + " " + SH);
        gGrid.innerHTML = "";
        for (let i = 1; i < W; i++)
            mk("line", { x1: i * CS, y1: 0, x2: i * CS, y2: SH, class: "shk-ln" }, gGrid);
        for (let i = 1; i < H; i++)
            mk("line", { x1: 0, y1: i * CS, x2: SW, y2: i * CS, class: "shk-ln" }, gGrid);
        mk("rect", { x: 1, y: 1, width: SW - 2, height: SH - 2, rx: 10, class: "shk-brd" }, gGrid);
        gClues.innerHTML = "";
        clueEls = state.clues.map((cl) => {
            const t = mk("text", {
                x: (cl.c + 0.5) * CS, y: (cl.r + 0.5) * CS + CS * 0.15,
                "font-size": Math.round(CS * 0.42), "text-anchor": "middle",
                "font-family": "inherit", "font-weight": 700, fill: "#0f172a",
            }, gClues);
            t.textContent = String(cl.n);
            return t;
        });
        gGhost.innerHTML = "";
        for (const rc of state.solution)
            mk("rect", {
                x: rc.x * CS + 3, y: rc.y * CS + 3,
                width: rc.w * CS - 6, height: rc.h * CS - 6, rx: 6,
                fill: "none", stroke: "#cbd5e1", "stroke-width": 1.5, "stroke-dasharray": "3 4",
            }, gGhost);
        boardKey = state.pid;
        cursor = { r: (H / 2) | 0, c: (W / 2) | 0 };
        cursorOn = false;
        pending = null; dragAnchor = null; dragging = false;
        previewRect = null; hintRect = null; eraseHover = null;
    }

    const setPreview = (rc) => { previewRect = rc; updateFx(); };

    function updateFx() {
        if (!state) return;
        const box = (el, rc, pad) => {
            el.setAttribute("x", rc.x * CS + pad);
            el.setAttribute("y", rc.y * CS + pad);
            el.setAttribute("width", Math.max(1, rc.w * CS - pad * 2));
            el.setAttribute("height", Math.max(1, rc.h * CS - pad * 2));
        };
        gGhost.setAttribute("display", showSolution ? "" : "none");
        if (hintRect) { box(hintEl, hintRect, 3); hintEl.setAttribute("display", ""); }
        else hintEl.setAttribute("display", "none");
        if (eraseHover) { box(eraseEl, eraseHover, 2); eraseEl.setAttribute("display", ""); }
        else eraseEl.setAttribute("display", "none");
        if (previewRect) {
            box(previewEl, previewRect, 2);
            const ok = validateRect(state, previewRect).ok;
            previewEl.setAttribute("stroke", ok ? SEAT_COLOR[mySeat()] : "#ef4444");
            previewEl.setAttribute("fill", ok ? SEAT_FILL[mySeat()] : "rgba(239,68,68,.12)");
            previewEl.setAttribute("display", "");
        } else previewEl.setAttribute("display", "none");
        if (pending) {
            box(anchorEl, { x: pending.c, y: pending.r, w: 1, h: 1 }, 2);
            anchorEl.setAttribute("display", "");
        } else anchorEl.setAttribute("display", "none");
        if (cursorOn && !helpOpen && !cheatsOpen) {
            box(cursorEl, { x: cursor.c, y: cursor.r, w: 1, h: 1 }, 3);
            cursorEl.setAttribute("display", "");
        } else cursorEl.setAttribute("display", "none");
    }

    function render() {
        const playing = !!state && state.status === "playing";
        const hostOnly = online && !room.isHost;
        if (!state) {
            statusEl.textContent = "Menunggu host…";
            tossEl.textContent = "Menunggu undian posisi dari host…";
            for (const k in btns) btns[k].disabled = true;
            ovHelp.hidden = !helpOpen;
            ovOver.hidden = true;
            ovCheats.hidden = !cheatsOpen;
            padEl.hidden = !padVisible;
            return;
        }
        if (boardKey !== state.pid) drawBoard();

        /* kotak terpasang */
        gPlaced.innerHTML = "";
        for (const p of state.placed) {
            const el = mk("rect", {
                x: p.x * CS + 2, y: p.y * CS + 2,
                width: p.w * CS - 4, height: p.h * CS - 4, rx: 8,
                fill: SEAT_FILL[p.by], stroke: SEAT_COLOR[p.by], "stroke-width": 2,
            }, gPlaced);
            const title = mk("title", {}, el);
            title.textContent = SEAT_LABEL[p.by] + " • " + p.w * p.h + " sel";
        }
        /* warna angka petunjuk */
        state.clues.forEach((cl, i) => {
            let fill = "#0f172a";
            for (const p of state.placed)
                if (clueInRect(cl, p)) { fill = SEAT_COLOR[p.by]; break; }
            clueEls[i].setAttribute("fill", fill);
        });

        const s = scoresOf(state);
        const mine = mySeat(), opp = oppSeat();
        const myTurn = playing && (state.turn === mine || (soloMode && !online));
        hud.level.textContent = String(state.level);
        hud.size.textContent = state.w + "×" + state.h;
        hud.score.textContent = s[mine] + " : " + s[opp];
        hud.rects.textContent = state.placed.length + "/" + state.solution.length;
        hud.time.textContent = fmt(timeSec());
        hud.mode.textContent = online ? "Online" : soloMode ? "Santai" : "vs Bot";
        hud.assisted.hidden = !state.assisted;

        let turnText, turnColor;
        if (!playing) { turnText = "Selesai"; turnColor = "#cbd5e1"; }
        else if (soloMode && !online) { turnText = "Santai"; turnColor = SEAT_COLOR[mine]; }
        else if (state.turn === mine) { turnText = "Giliranmu"; turnColor = SEAT_COLOR[mine]; }
        else { turnText = seatName(state.turn) + "…"; turnColor = SEAT_COLOR[state.turn]; }
        hud.turn.textContent = turnText;
        turnDot.style.background = turnColor;
        statusEl.textContent = turnText + " • Kamu = " + SEAT_LABEL[mine];
        dotEl.style.background = turnColor;

        tossEl.textContent =
            "Kamu = " + SEAT_LABEL[mine] + " (" + (mine === 0 ? "biru" : "kuning") + ") • Undian: " +
            seatName(state.first) + " mulai duluan.";

        /* tombol */
        const hasMine = state.placed.some((p) => p.by === mine);
        btns.undo.disabled = !playing || !hasMine;
        btns.erase.disabled = !playing;
        btns.erase.classList.toggle("on", eraseMode);
        padErase.classList.toggle("on", eraseMode);
        btns.pass.disabled = !playing || !myTurn || (soloMode && !online);
        btns.clear.disabled = !playing || !state.placed.length || hostOnly;
        btns.new.disabled = hostOnly;
        btns.restart.disabled = hostOnly;
        btns.next.disabled = hostOnly;
        btns.new.title = hostOnly ? "Hanya host" : "Puzzle baru, level sama (N)";
        btns.restart.title = hostOnly ? "Hanya host" : "Ulangi puzzle ini";
        btns.clear.title = hostOnly ? "Hanya host" : "Bersihkan papan (C)";
        cheatBtns.sol.textContent = showSolution ? "On" : "Off";
        cheatBtns.sol.classList.toggle("on", showSolution);
        cheatBtns.solo.textContent = soloMode ? "On" : "Off";
        cheatBtns.solo.classList.toggle("on", soloMode);
        cheatBtns.solve.disabled = online || !playing;
        cheatBtns.skip.disabled = online || !playing;
        cheatBtns.solo.disabled = online;
        cheatBtns.auto.disabled = !playing || (!myTurn && !(soloMode && !online));
        cheatBtns.solve.title = online ? "Hanya mode vs Bot" : "";
        cheatBtns.skip.title = online ? "Hanya mode vs Bot" : "";
        cheatBtns.solo.title = online ? "Hanya mode vs Bot" : "";

        /* overlay hasil */
        if (state.status === "done") {
            overKeyNow = state.pid + ":" + state.endedAt;
            const w = state.winner;
            overTitle.textContent =
                w === -1 ? "Seri!" : w === mine ? "Kamu menang! 🎉" : seatName(w) + " menang";
            overSub.textContent =
                "Skor " + s[mine] + " : " + s[opp] + " • " + state.placed.length +
                " kotak • waktu " + fmt(timeSec()) + ".";
            overNote.textContent =
                (state.assisted ? "Permainan dibantu cheat. " : "") +
                (hostOnly ? "Puzzle baru hanya bisa dimulai oleh host." : "");
            ovOver.hidden = overDismissed === overKeyNow;
        } else {
            overKeyNow = null;
            ovOver.hidden = true;
        }
        ovHelp.hidden = !helpOpen;
        ovCheats.hidden = !cheatsOpen;
        padEl.hidden = !padVisible;
        if (state.note && state.note !== lastNote) { showMsg(state.note, false); lastNote = state.note; }
        if (!state.note) lastNote = "";
        updateFx();
    }

    /* ---------- alur permainan (host / lokal otoritatif) ---------- */
    function finish(st) {
        st.status = "done";
        st.endedAt = Date.now();
        const s = scoresOf(st);
        st.winner = s[0] === s[1] ? -1 : s[0] > s[1] ? 0 : 1;
    }

    function afterPlace(st) {
        let area = 0;
        for (const p of st.placed) area += p.w * p.h;
        if (area === st.w * st.h) { finish(st); return; }
        st.turn = 1 - st.turn;
        if (!findMoves(st).length) {
            const skipped = st.turn;
            st.turn = 1 - st.turn;
            if (!findMoves(st).length) finish(st);
            else {
                st.note = SEAT_LABEL[skipped] + " tidak punya langkah valid — giliran dilewati.";
                st.passCount = 1;
            }
        }
    }

    function applyAction(action, actor) {
        if (!state || !action) { publish(); return; }
        const seat = state.seatOf[actor];
        const playing = state.status === "playing";
        const hostOnly = online && actor !== 0;
        const t = action.type;
        if (t === "place") {
            if (!playing) { publish(); return; }
            const free = !online && soloMode && action.free;
            if (!free && state.turn !== seat) { publish(); return; }
            const rc = action.rect;
            if (!validateRect(state, rc).ok) { publish(); return; }
            state.placed.push({ x: rc.x, y: rc.y, w: rc.w, h: rc.h, by: seat });
            if (action.cheat) state.assisted = true;
            state.note = "";
            state.passCount = 0;
            if (free) {
                state.turn = seat;
                let area = 0;
                for (const p of state.placed) area += p.w * p.h;
                if (area === state.w * state.h || !findMoves(state).length) finish(state);
            } else afterPlace(state);
        } else if (t === "pass") {
            if (!playing || state.turn !== seat) { publish(); return; }
            state.passCount += 1;
            state.note = "";
            if (state.passCount >= 2) finish(state);
            else {
                state.turn = 1 - seat;
                if (!findMoves(state).length) {
                    state.note = SEAT_LABEL[state.turn] + " tidak punya langkah — dilewati.";
                    state.turn = seat;
                }
            }
        } else if (t === "undo") {
            if (!playing) { publish(); return; }
            for (let i = state.placed.length - 1; i >= 0; i--)
                if (state.placed[i].by === seat) { state.placed.splice(i, 1); break; }
            state.passCount = 0;
            state.note = "";
        } else if (t === "remove") {
            if (!playing || !action.rc) { publish(); return; }
            const idx = state.placed.findIndex(
                (p) => p.by === seat && sameRect(p, action.rc)
            );
            if (idx >= 0) state.placed.splice(idx, 1);
            state.passCount = 0;
            state.note = "";
        } else if (t === "clear") {
            if (!playing || hostOnly) { publish(); return; }
            state.placed = [];
            state.turn = state.first;
            state.passCount = 0;
            state.assisted = false;
            state.startedAt = Date.now();
            state.note = "Papan dibersihkan.";
        } else if (t === "restart") {
            if (hostOnly) { publish(); return; }
            state.placed = [];
            state.turn = state.first;
            state.passCount = 0;
            state.status = "playing";
            state.winner = null;
            state.assisted = false;
            state.note = "";
            state.startedAt = Date.now();
            state.endedAt = null;
        } else if (t === "new" || t === "next") {
            if (hostOnly) { publish(); return; }
            state = newGame(t === "next" ? state.level + 1 : state.level);
        } else if (t === "forceTurn") {
            if (online || !playing) { publish(); return; }
            state.turn = seat;
            state.passCount = 0;
            state.assisted = true;
            state.note = "Giliran lawan dilompati (cheat).";
        } else if (t === "solve") {
            if (online || !playing) { publish(); return; }
            state.assisted = true;
            let guard = 0;
            while (guard++ < 400) {
                let area = 0;
                for (const p of state.placed) area += p.w * p.h;
                if (area === state.w * state.h) break;
                const mv = findMoves(state);
                if (!mv.length) break;
                const sol = mv.filter((m) => state.solution.some((sr) => sameRect(sr, m)));
                const rc = sol.length ? pick(sol) : mv.reduce((a, b) => (b.w * b.h > a.w * a.h ? b : a));
                state.placed.push({ x: rc.x, y: rc.y, w: rc.w, h: rc.h, by: seat });
            }
            let area = 0;
            for (const p of state.placed) area += p.w * p.h;
            state.passCount = 0;
            state.note = "Papan diselesaikan otomatis (cheat).";
            if (area === state.w * state.h || !findMoves(state).length) finish(state);
            else state.turn = 1 - seat;
        }
        publish();
    }

    function submitAction(action) {
        if (online && !room.isHost) {
            room.sendAction(action).catch(console.warn);
            return;
        }
        applyAction(action, playerIndex);
    }

    function publish() {
        render();
        if (online && room.isHost) room.publishState(state).catch(console.warn);
        scheduleBot();
    }

    /* ---------- bot (mode AI, lokal) ---------- */
    const inSolution = (rc) => state.solution.some((sr) => sameRect(sr, rc));
    function bestMove() {
        const mv = findMoves(state);
        if (!mv.length) return null;
        const sol = mv.filter(inSolution);
        if (sol.length) return pick(sol);
        let mx = 0;
        for (const m of mv) mx = Math.max(mx, m.w * m.h);
        return pick(mv.filter((m) => m.w * m.h === mx));
    }
    function scheduleBot() {
        if (botTimer !== null) { clearTimeout(botTimer); botTimer = null; }
        if (online || soloMode || !state) return;
        if (state.status !== "playing" || helpOpen || cheatsOpen) return;
        if (state.turn !== state.seatOf[1]) return;
        botTimer = setTimeout(botStep, 700 + Math.random() * 700);
    }
    function botStep() {
        botTimer = null;
        if (!state || state.status !== "playing" || helpOpen || cheatsOpen || soloMode) return;
        if (state.turn !== state.seatOf[1]) return;
        const mv = findMoves(state);
        if (!mv.length) { applyAction({ type: "pass" }, 1); return; }
        const sol = mv.filter(inSolution);
        let rc;
        if (sol.length && Math.random() < 0.6) rc = pick(sol);
        else if (Math.random() < 0.5) rc = mv.reduce((a, b) => (b.w * b.h > a.w * a.h ? b : a));
        else rc = pick(mv);
        applyAction({ type: "place", rect: rc }, 1);
    }

    /* ---------- input helpers ---------- */
    const normRect = (a, b) => ({
        x: Math.min(a.c, b.c), y: Math.min(a.r, b.r),
        w: Math.abs(a.c - b.c) + 1, h: Math.abs(a.r - b.r) + 1,
    });

    function cellFromEvent(e) {
        if (!state) return null;
        const r = svg.getBoundingClientRect();
        if (!r.width || !r.height) return null;
        const vw = state.w * CS, vh = state.h * CS;
        const sc = Math.min(r.width / vw, r.height / vh);
        const ox = (r.width - vw * sc) / 2, oy = (r.height - vh * sc) / 2;
        const x = (e.clientX - r.left - ox) / sc;
        const y = (e.clientY - r.top - oy) / sc;
        const c = Math.floor(x / CS), rr = Math.floor(y / CS);
        if (c < 0 || c >= state.w || rr < 0 || rr >= state.h) return null;
        return { r: rr, c };
    }

    function canDraw() {
        if (!state || state.status !== "playing" || helpOpen || cheatsOpen) return false;
        if (!soloMode || online) {
            if (state.turn !== mySeat()) { showMsg("Tunggu giliranmu.", true); return false; }
        }
        return true;
    }

    function tryPlace(rc) {
        if (!state || state.status !== "playing") return;
        const v = validateRect(state, rc);
        if (!v.ok) { flashRect(rc); showMsg(v.reason, true); return; }
        hintRect = null;
        setPreview(null);
        submitAction({ type: "place", rect: rc, free: !online && soloMode });
    }

    function removeAt(cell) {
        if (!state || state.status !== "playing") return;
        const idx = rectAt(state, cell.r, cell.c);
        if (idx < 0) { showMsg("Tidak ada kotak terpasang di sel itu.", false); return; }
        const p = state.placed[idx];
        if (p.by !== mySeat()) { showMsg("Itu kotak milik lawan — tidak bisa dihapus.", true); return; }
        submitAction({ type: "remove", rc: { x: p.x, y: p.y, w: p.w, h: p.h } });
        showMsg("Kotak dihapus.", false);
    }

    function tapCell(cell) {
        if (eraseMode) { removeAt(cell); return; }
        if (!canDraw()) return;
        if (pending) {
            const a = pending;
            pending = null;
            if (a.r === cell.r && a.c === cell.c) { setPreview(null); return; }
            setPreview(null);
            tryPlace(normRect(a, cell));
        } else {
            pending = cell;
            setPreview({ x: cell.c, y: cell.r, w: 1, h: 1 });
        }
    }

    function cancelDraw() {
        pending = null; dragAnchor = null; dragging = false;
        setPreview(null);
    }

    function moveCursor(dr, dc) {
        if (!state) return;
        cursorOn = true;
        cursor.r = Math.max(0, Math.min(state.h - 1, cursor.r + dr));
        cursor.c = Math.max(0, Math.min(state.w - 1, cursor.c + dc));
        if (pending) {
            if (pending.r === cursor.r && pending.c === cursor.c)
                setPreview({ x: cursor.c, y: cursor.r, w: 1, h: 1 });
            else setPreview(normRect(pending, cursor));
        }
        updateFx();
    }

    function padSet() {
        if (!state || helpOpen || cheatsOpen) return;
        cursorOn = true;
        tapCell({ r: cursor.r, c: cursor.c });
        updateFx();
    }

    function toggleErase() {
        if (!state || state.status !== "playing") return;
        eraseMode = !eraseMode;
        cancelDraw();
        eraseHover = null;
        render();
        showMsg(eraseMode ? "Mode hapus: ketuk kotak milikmu untuk menghapus." : "Mode hapus nonaktif.", false);
    }

    function doHint() {
        if (!state || state.status !== "playing") return;
        const mv = bestMove();
        if (!mv) { showMsg("Tidak ada langkah valid tersisa.", true); return; }
        hintRect = mv;
        updateFx();
        showMsg("Petunjuk: kotak bergaris hijau.", false);
    }

    function stopPadHold() {
        if (padHold1 !== null) { clearTimeout(padHold1); padHold1 = null; }
        if (padHold2 !== null) { clearInterval(padHold2); padHold2 = null; }
    }

    function closeHelp() {
        const firstBegin = !startedOnce;
        helpOpen = false;
        startedOnce = true;
        if (firstBegin && state && (!online || room.isHost)) {
            state.startedAt = Date.now();
            publish();
        } else {
            render();
            scheduleBot();
        }
    }
    function closeCheats() { cheatsOpen = false; render(); scheduleBot(); }

    /* ---------- pointer (mouse + sentuh) ---------- */
    function onPointerDown(e) {
        if (!state || helpOpen || cheatsOpen) return;
        const cell = cellFromEvent(e);
        if (!cell) return;
        e.preventDefault();
        cursorOn = false;
        if (e.button === 2) { cancelDraw(); return; }
        if (eraseMode) { removeAt(cell); return; }
        if (!canDraw()) return;
        if (pending) { tapCell(cell); return; }
        dragAnchor = cell;
        dragging = false;
        try { svg.setPointerCapture(e.pointerId); } catch (err) { /* abaikan */ }
    }
    function onPointerMove(e) {
        if (!state || helpOpen || cheatsOpen) return;
        const cell = cellFromEvent(e);
        if (eraseMode) {
            eraseHover = null;
            if (cell) {
                const idx = rectAt(state, cell.r, cell.c);
                if (idx >= 0 && state.placed[idx].by === mySeat()) eraseHover = state.placed[idx];
            }
            updateFx();
            return;
        }
        if (!cell) return;
        if (dragAnchor) {
            if (cell.r !== dragAnchor.r || cell.c !== dragAnchor.c) dragging = true;
            if (dragging) setPreview(normRect(dragAnchor, cell));
        } else if (pending && !(pending.r === cell.r && pending.c === cell.c)) {
            setPreview(normRect(pending, cell));
        }
    }
    function onPointerUp(e) {
        if (!dragAnchor) return;
        const cell = cellFromEvent(e);
        const a = dragAnchor;
        dragAnchor = null;
        if (cell && dragging && (cell.r !== a.r || cell.c !== a.c)) {
            dragging = false;
            setPreview(null);
            tryPlace(normRect(a, cell));
        } else if (cell && cell.r === a.r && cell.c === a.c) {
            pending = a;
            setPreview({ x: a.c, y: a.r, w: 1, h: 1 });
        } else {
            dragging = false;
            setPreview(null);
        }
    }
    function onPointerCancel() {
        dragAnchor = null; dragging = false; eraseHover = null;
        if (!pending) setPreview(null);
        updateFx();
    }
    function onContext(e) {
        if (pending || eraseMode) { e.preventDefault(); cancelDraw(); }
    }

    /* ---------- keyboard ---------- */
    function onKey(e) {
        if (!state) return;
        const tag = e.target && e.target.tagName ? e.target.tagName : "";
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
        const k = e.key;
        if (k === "Escape") {
            if (cheatsOpen) closeCheats();
            else if (helpOpen && startedOnce) closeHelp();
            else cancelDraw();
            return;
        }
        if (helpOpen || cheatsOpen) return;
        const lk = k.length === 1 ? k.toLowerCase() : k;
        if (lk === "ArrowUp" || lk === "w") { e.preventDefault(); moveCursor(-1, 0); }
        else if (lk === "ArrowDown" || lk === "s") { e.preventDefault(); moveCursor(1, 0); }
        else if (lk === "ArrowLeft" || lk === "a") { e.preventDefault(); moveCursor(0, -1); }
        else if (lk === "ArrowRight" || lk === "d") { e.preventDefault(); moveCursor(0, 1); }
        else if (k === "Enter" || k === " ") {
            if (tag === "BUTTON") return;
            e.preventDefault();
            padSet();
        }
        else if (lk === "u") { if (!btns.undo.disabled) submitAction({ type: "undo" }); }
        else if (lk === "x") toggleErase();
        else if (lk === "p") { if (!btns.pass.disabled) submitAction({ type: "pass" }); }
        else if (lk === "h") doHint();
        else if (lk === "c") { if (!btns.clear.disabled) submitAction({ type: "clear" }); }
        else if (lk === "n") { if (!btns.new.disabled) submitAction({ type: "new" }); }
    }

    /* ---------- klik tombol (delegasi) ---------- */
    function handleClick(e) {
        if (e.target.closest("[data-exit]")) { onExit(); return; }
        const padBtn = e.target.closest("[data-pad]");
        if (padBtn) {
            const v = padBtn.getAttribute("data-pad");
            if (padBtn.blur) padBtn.blur();
            if (v === "set") padSet();
            else if (v === "cancel") { cancelDraw(); updateFx(); }
            else if (v === "erase") toggleErase();
            return; /* panah diproses di pointerdown (repeat) */
        }
        const btn = e.target.closest("[data-act]");
        if (!btn || btn.disabled) return;
        if (btn.blur) btn.blur();
        const act = btn.getAttribute("data-act");
        if (act === "begin") closeHelp();
        else if (act === "help") { helpOpen = true; render(); scheduleBot(); }
        else if (act === "cheats") { cheatsOpen = true; render(); scheduleBot(); }
        else if (act === "cheats-close") closeCheats();
        else if (act === "over-close") { overDismissed = overKeyNow; ovOver.hidden = true; }
        else if (act === "undo") submitAction({ type: "undo" });
        else if (act === "erase") toggleErase();
        else if (act === "pass") submitAction({ type: "pass" });
        else if (act === "clear") submitAction({ type: "clear" });
        else if (act === "new") submitAction({ type: "new" });
        else if (act === "restart") submitAction({ type: "restart" });
        else if (act === "next") submitAction({ type: "next" });
        else if (act === "pad-toggle") { padVisible = !padVisible; render(); }
        else if (act === "cheat-solution") { showSolution = !showSolution; render(); }
        else if (act === "cheat-hint") doHint();
        else if (act === "cheat-auto") {
            if (!state || state.status !== "playing") return;
            if (state.turn !== mySeat() && !(soloMode && !online)) {
                showMsg("Tunggu giliranmu untuk memakai cheat ini.", true);
                return;
            }
            const mv = bestMove();
            if (!mv) { showMsg("Tidak ada langkah valid tersisa.", true); return; }
            hintRect = null;
            submitAction({ type: "place", rect: mv, cheat: true, free: !online && soloMode });
        }
        else if (act === "cheat-solve") submitAction({ type: "solve" });
        else if (act === "cheat-skip") submitAction({ type: "forceTurn" });
        else if (act === "cheat-solo") {
            soloMode = !soloMode;
            cancelDraw();
            render();
            scheduleBot();
            showMsg(soloMode ? "Mode santai aktif — bot dimatikan, main bebas." : "Mode santai nonaktif.", false);
        }
    }

    function onPadDown(e) {
        const btn = e.target.closest("[data-pad]");
        if (!btn) return;
        const v = btn.getAttribute("data-pad");
        const dirs = { up: [-1, 0], down: [1, 0], left: [0, -1], right: [0, 1] };
        if (!dirs[v]) return;
        e.preventDefault();
        moveCursor(dirs[v][0], dirs[v][1]);
        stopPadHold();
        padHold1 = setTimeout(() => {
            padHold2 = setInterval(() => moveCursor(dirs[v][0], dirs[v][1]), 110);
        }, 380);
    }
    function onRootOut(e) {
        if (e.target.closest && e.target.closest("[data-pad]")) stopPadHold();
    }
    function onDocUp() { stopPadHold(); }

    /* ---------- wiring ---------- */
    root.addEventListener("click", handleClick);
    root.addEventListener("pointerdown", onPadDown);
    root.addEventListener("pointerout", onRootOut);
    document.addEventListener("pointerup", onDocUp);
    document.addEventListener("pointercancel", onDocUp);
    document.addEventListener("keydown", onKey);
    svg.addEventListener("pointerdown", onPointerDown);
    svg.addEventListener("pointermove", onPointerMove);
    svg.addEventListener("pointerup", onPointerUp);
    svg.addEventListener("pointercancel", onPointerCancel);
    svg.addEventListener("pointerleave", onPointerCancel);
    svg.addEventListener("contextmenu", onContext);

    if (online) {
        const u1 = room.onRoom((nextRoom) => { roomData = nextRoom; render(); });
        if (typeof u1 === "function") unsubs.push(u1);
        if (room.isHost) {
            state = newGame(1);
            publish();
            const u2 = room.onAction((action) => applyAction(action, 1));
            if (typeof u2 === "function") unsubs.push(u2);
        } else {
            const u3 = room.onState((nextState) => {
                if (!nextState) return;
                const newPuzzle = !state || nextState.pid !== state.pid;
                state = nextState;
                if (newPuzzle) { eraseMode = false; overDismissed = null; }
                cancelDraw();
                hintRect = null;
                render();
            });
            if (typeof u3 === "function") unsubs.push(u3);
        }
    } else {
        state = newGame(1);
        render();
    }
    clockId = setInterval(() => {
        if (state) hud.time.textContent = fmt(timeSec());
    }, 500);

    return {
        destroy() {
            root.removeEventListener("click", handleClick);
            root.removeEventListener("pointerdown", onPadDown);
            root.removeEventListener("pointerout", onRootOut);
            document.removeEventListener("pointerup", onDocUp);
            document.removeEventListener("pointercancel", onDocUp);
            document.removeEventListener("keydown", onKey);
            svg.removeEventListener("pointerdown", onPointerDown);
            svg.removeEventListener("pointermove", onPointerMove);
            svg.removeEventListener("pointerup", onPointerUp);
            svg.removeEventListener("pointercancel", onPointerCancel);
            svg.removeEventListener("pointerleave", onPointerCancel);
            svg.removeEventListener("contextmenu", onContext);
            if (botTimer !== null) clearTimeout(botTimer);
            if (clockId !== null) clearInterval(clockId);
            if (msgTimer !== null) clearTimeout(msgTimer);
            fxTimers.forEach(clearTimeout);
            stopPadHold();
            unsubs.forEach((fn) => { try { fn(); } catch (err) { /* abaikan */ } });
            root.innerHTML = "";
        },
    };
}