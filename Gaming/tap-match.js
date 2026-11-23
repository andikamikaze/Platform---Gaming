/* ==== GAME: tap-match.js ==== */
/*
  Tap Match - template baru (export META + mount).
  - Mode "ai"   : lawan bot lokal, undian siapa jalan duluan.
  - Mode "room" : multiplayer Firebase, host = pemilik state kanonik,
                  posisi P1/P2 diacak saat mulai.
  - Level acak diverifikasi bisa diselesaikan (simulasi greedy >= TARGET).
  - Animasi jatuh & pecah berbasis diff id tile (CSS transform transition).
  Jalankan: node tools/build-games-manifest.mjs setelah mengubah META.
*/

export const META = {
    id: "tap-match", // harus sama dengan nama file (tanpa .js)
    name: "Tap Match",
    category: "puzzle",
    catLabel: "Puzzle",
    desc: "Ketuk grup 2+ balok sewarna yang terhubung untuk membersihkannya. Balok jatuh, yang baru turun dari atas. Capai target skor lebih dulu - lawan bot atau pemain lain.",
    art: '<svg viewBox="0 0 48 48" width="54" height="54" aria-hidden="true"><rect x="6" y="6" width="16" height="16" rx="5" fill="currentColor"/><rect x="26" y="6" width="16" height="16" rx="5" fill="currentColor" opacity=".35"/><rect x="6" y="26" width="16" height="16" rx="5" fill="currentColor" opacity=".35"/><rect x="26" y="26" width="16" height="16" rx="5" fill="currentColor"/></svg>',
    bg: ["#fef3c7", "#fde68a"],
    bestKey: "tapMatchBest",
};

/* ================= logika murni (tanpa DOM) ================= */

const SIZE = 8;            // papan lebih luas: 8x8
const COLORS = 4;
const MOVES_EACH = 10;     // langkah per pemain
const TARGET = 850;        // target skor (race)
const GROUP_MIN = 2;

/* mulberry32 dengan state numerik -> bisa disimpan di state room */
function rngNext(a) {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return [((t ^ (t >>> 14)) >>> 0) / 4294967296, a];
}
function randInt(env, n) {
    const [v, a] = rngNext(env.rng);
    env.rng = a;
    return Math.floor(v * n);
}
function groupPoints(n) {
    const b = Math.max(0, n - 2);
    return n * 10 + b * b * 5;
}

/* flood-fill grup 4-connected sewarna (tile = {id, k}) */
function findGroup(board, r, c) {
    const t0 = board[r] && board[r][c];
    if (!t0) return [];
    const v = t0.k;
    const seen = new Set([r * SIZE + c]);
    const stack = [[r, c]];
    const out = [];
    while (stack.length) {
        const cur = stack.pop();
        out.push(cur);
        const rr = cur[0], cc = cur[1];
        const nb = [[rr - 1, cc], [rr + 1, cc], [rr, cc - 1], [rr, cc + 1]];
        for (const [nr, nc] of nb) {
            if (nr < 0 || nc < 0 || nr >= SIZE || nc >= SIZE) continue;
            const key = nr * SIZE + nc;
            if (seen.has(key)) continue;
            const t = board[nr][nc];
            if (!t || t.k !== v) continue;
            seen.add(key);
            stack.push([nr, nc]);
        }
    }
    out.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    return out;
}

function allGroups(board) {
    const seen = new Set();
    const groups = [];
    for (let r = 0; r < SIZE; r++) {
        for (let c = 0; c < SIZE; c++) {
            const key = r * SIZE + c;
            if (seen.has(key) || !board[r][c]) continue;
            const g = findGroup(board, r, c);
            g.forEach(([gr, gc]) => seen.add(gr * SIZE + gc));
            if (g.length >= GROUP_MIN) groups.push(g);
        }
    }
    groups.sort((a, b) => b.length - a.length);
    return groups;
}

function hasMove(board) {
    for (let r = 0; r < SIZE; r++) {
        for (let c = 0; c < SIZE; c++) {
            const t = board[r][c];
            if (!t) continue;
            if (r + 1 < SIZE && board[r + 1][c] && board[r + 1][c].k === t.k) return true;
            if (c + 1 < SIZE && board[r][c + 1] && board[r][c + 1].k === t.k) return true;
        }
    }
    return false;
}

/* hapus grup -> gravitasi (tile lama dipertahankan, id stabil untuk animasi)
   -> isi ulang dari atas dengan tile baru. Mengembalikan poin. */
function collapse(board, group, env) {
    const gone = new Set(group.map(([r, c]) => r * SIZE + c));
    for (let c = 0; c < SIZE; c++) {
        let w = SIZE - 1;
        for (let r = SIZE - 1; r >= 0; r--) {
            if (!gone.has(r * SIZE + c)) {
                board[w][c] = board[r][c];
                w--;
            }
        }
        for (; w >= 0; w--) board[w][c] = { id: env.nextId++, k: randInt(env, COLORS) };
    }
    return groupPoints(group.length);
}

function reshuffleBoard(board, env) {
    const tiles = [];
    for (let r = 0; r < SIZE; r++)
        for (let c = 0; c < SIZE; c++)
            if (board[r][c]) tiles.push(board[r][c]);
    for (let tries = 0; tries < 60; tries++) {
        for (let i = tiles.length - 1; i > 0; i--) {
            const j = randInt(env, i + 1);
            const tmp = tiles[i]; tiles[i] = tiles[j]; tiles[j] = tmp;
        }
        let i = 0;
        for (let r = 0; r < SIZE; r++)
            for (let c = 0; c < SIZE; c++) board[r][c] = tiles[i++];
        if (hasMove(board)) return;
    }
    for (let r = 0; r < SIZE; r++)
        for (let c = 0; c < SIZE; c++) board[r][c].k = randInt(env, COLORS);
    if (!hasMove(board)) board[0][1].k = board[0][0].k;
}

function cloneBoard(board) {
    return board.map((row) => row.map((t) => (t ? { id: t.id, k: t.k } : null)));
}

/* simulasi pemain greedy: bukti level bisa mencapai TARGET */
function simulateGreedy(board, env, moves) {
    const b = cloneBoard(board);
    const e = { rng: env.rng, nextId: env.nextId };
    let total = 0;
    for (let i = 0; i < moves; i++) {
        let gs = allGroups(b);
        if (!gs.length) { reshuffleBoard(b, e); gs = allGroups(b); }
        if (!gs.length) break;
        total += collapse(b, gs[0], e);
    }
    return total;
}

/* generator level acak yang terverifikasi bisa diselesaikan */
function generateLevel(seed) {
    let best = null, fallback = null;
    for (let attempt = 0; attempt < 40; attempt++) {
        const s = (seed === undefined
            ? Math.floor(Math.random() * 4294967296)
            : (seed + attempt * 0x9e3779b1)) >>> 0;
        const env = { rng: s, nextId: 1 };
        const board = [];
        for (let r = 0; r < SIZE; r++) {
            const row = [];
            for (let c = 0; c < SIZE; c++) row.push({ id: env.nextId++, k: randInt(env, COLORS) });
            board.push(row);
        }
        const cand = { board, rng: env.rng, nextId: env.nextId, seed: s, potential: 0 };
        fallback = cand;
        if (!hasMove(board)) continue;
        cand.potential = simulateGreedy(board, env, MOVES_EACH);
        if (cand.potential >= TARGET) return cand;
        if (!best || cand.potential > best.potential) best = cand;
    }
    if (!best) { fallback.board[0][1].k = fallback.board[0][0].k; best = fallback; }
    return best;
}

function newGameState(online) {
    const level = generateLevel();
    const seats = [0, 1];
    // multiplayer: acak siapa duduk sebagai P1 / P2
    if (online && Math.random() < 0.5) { seats[0] = 1; seats[1] = 0; }
    // undian siapa jalan duluan (vs bot maupun multiplayer)
    const starter = Math.random() < 0.5 ? 0 : 1;
    return {
        v: 1,
        seed: level.seed,
        rng: level.rng,
        nextId: level.nextId,
        board: level.board,
        seats,             // seats[indexKoneksi] = nomor kursi (0/1)
        turn: starter,
        starter,
        scores: [0, 0],
        moves: [MOVES_EACH, MOVES_EACH],
        target: TARGET,
        phase: "playing",  // "ready" | "playing" | "over"
        winner: null,      // 0 | 1 | -1 (seri)
        cheated: false,
        seq: 0,
        lastEvent: null,
    };
}

/* ================= mount ================= */

export function mount(root, context = {}) {
    const { mode = "ai", room = null, playerName = "Player", onExit = () => { } } = context;
    const online = mode === "room" && Boolean(room);
    const playerIndex = online && !room.isHost ? 1 : 0;
    let roomData = room?.room || null;
    let state = null;
    let disposed = false;

    /* ---------- UI lokal (tidak diserialisasi) ---------- */
    let cursor = { r: 3, c: 3 };
    let showCursor = false;
    let hover = null;
    let showHelp = !online;
    let showCheats = false;
    let padForced = false;
    let hintCells = null;
    let localMsg = null;
    let prevSeq = -1;
    let prevScores = [0, 0];
    let best = 0;
    try { best = Number(localStorage.getItem(META.bestKey)) || 0; } catch (e) { /* abaikan */ }

    let timers = [];
    function later(fn, ms) {
        const t = setTimeout(() => {
            timers = timers.filter((x) => x !== t);
            if (!disposed) fn();
        }, ms);
        timers.push(t);
        return t;
    }
    function clearTimers() { timers.forEach(clearTimeout); timers = []; }
    let botTimer = null;

    /* ---------- markup + CSS (minimalis, scoped .tm) ---------- */
    root.innerHTML = `
<style>
.tm{--tm-bg:#fafafa;--tm-card:#fff;--tm-ink:#18181b;--tm-mut:#71717a;--tm-line:#e4e4e7;--tm-acc:#2563eb;--tm-acc2:#d97706;--tm-good:#059669;--tm-bad:#dc2626;color:var(--tm-ink)}
.tm [hidden]{display:none!important}
.tm-panel{background:var(--tm-bg);border:1px solid var(--tm-line);border-radius:18px;padding:16px}
.tm-grid{display:grid;grid-template-columns:minmax(0,1fr);gap:16px}
@media(min-width:980px){.tm-grid{grid-template-columns:minmax(0,1fr) 264px;align-items:start}}
.tm-main{display:flex;flex-direction:column;gap:10px;min-width:0}
.tm-hud{display:grid;grid-template-columns:1fr auto 1fr;gap:10px;align-items:stretch}
.tm-score{background:var(--tm-card);border:1px solid var(--tm-line);border-radius:14px;padding:10px 12px;transition:border-color .2s,box-shadow .2s;min-width:0}
.tm-score[data-seat="0"]{--seatc:#2563eb}
.tm-score[data-seat="1"]{--seatc:#d97706}
.tm-score.active{border-color:var(--seatc);box-shadow:0 0 0 1px var(--seatc)}
.tm-score-top{display:flex;align-items:center;gap:6px;font-size:12px;color:var(--tm-mut);font-weight:600}
.tm-seat-tag{flex:none;font-size:10px;font-weight:800;letter-spacing:.06em;color:#fff;background:var(--seatc);border-radius:5px;padding:2px 5px}
.tm-name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.tm-you{font-style:normal;color:var(--seatc);font-weight:700}
.tm-turnpill{margin-left:auto;flex:none;font-size:10px;color:var(--seatc);border:1px solid currentColor;border-radius:99px;padding:1px 7px;opacity:0;transition:opacity .2s}
.tm-score.active .tm-turnpill{opacity:1}
.tm-score-num{font-size:clamp(20px,4.5vw,26px);font-weight:800;font-variant-numeric:tabular-nums;line-height:1.15}
.tm-score-num.bump{animation:tm-bump .3s ease}
@keyframes tm-bump{40%{transform:scale(1.12)}}
.tm-score-sub{font-size:11.5px;color:var(--tm-mut)}
.tm-bar{height:4px;background:var(--tm-line);border-radius:99px;margin-top:7px;overflow:hidden}
.tm-bar i{display:block;height:100%;background:var(--seatc);border-radius:99px;transition:width .35s ease}
.tm-target{align-self:center;text-align:center;font-size:11px;color:var(--tm-mut);font-weight:600;padding:0 4px}
.tm-target b{display:block;font-size:17px;color:var(--tm-ink);font-variant-numeric:tabular-nums}
.tm-stage{position:relative;width:100%;max-width:640px;margin:0 auto}
.tm-board{position:relative;width:100%;aspect-ratio:1/1;background:var(--tm-card);border:1px solid var(--tm-line);border-radius:14px;overflow:hidden;touch-action:manipulation;outline:none;cursor:pointer;user-select:none;-webkit-user-select:none;background-image:linear-gradient(to right,rgba(24,24,27,.05) 1px,transparent 1px),linear-gradient(to bottom,rgba(24,24,27,.05) 1px,transparent 1px);background-size:${100 / SIZE}% ${100 / SIZE}%}
.tm-board:focus-visible{box-shadow:0 0 0 2px var(--tm-acc)}
.tm-tiles{position:absolute;inset:0}
.tm-tile{position:absolute;left:0;top:0;width:${100 / SIZE}%;height:${100 / SIZE}%;transform:translate(var(--tx,0%),var(--ty,0%));transition:transform .34s cubic-bezier(.22,.9,.32,1.12);will-change:transform}
.tm-face{position:absolute;inset:8%;border-radius:26%;background:var(--k,#d4d4d8);box-shadow:inset 0 -3px 0 rgba(0,0,0,.14),inset 0 1px 0 rgba(255,255,255,.25);transition:transform .18s ease,opacity .18s ease,filter .15s ease,box-shadow .15s ease}
.tm-face.k0{--k:#f87171}.tm-face.k1{--k:#fbbf24}.tm-face.k2{--k:#34d399}.tm-face.k3{--k:#60a5fa}
.tm-tile.hl .tm-face{filter:brightness(1.07) saturate(1.05);transform:scale(1.05);box-shadow:inset 0 0 0 3px rgba(255,255,255,.85),inset 0 -3px 0 rgba(0,0,0,.14)}
.tm-tile.pop{z-index:3}
.tm-tile.pop .tm-face{transform:scale(1.35);opacity:0}
.tm-cursor{position:absolute;left:0;top:0;width:${100 / SIZE}%;height:${100 / SIZE}%;transform:translate(var(--tx,0%),var(--ty,0%));transition:transform .12s ease;pointer-events:none;z-index:4}
.tm-cursor::after{content:"";position:absolute;inset:4%;border:2px dashed var(--tm-ink);border-radius:26%;opacity:.7}
.tm-fx{position:absolute;inset:0;pointer-events:none;z-index:5}
.tm-float{position:absolute;transform:translate(-50%,-50%);font-weight:800;font-size:clamp(15px,3.4vw,22px);color:var(--fc,#18181b);text-shadow:0 1px 0 #fff,0 0 8px #fff;animation:tm-rise .85s ease-out forwards;white-space:nowrap}
.tm-float.big{font-size:clamp(16px,3.8vw,24px)}
@keyframes tm-rise{0%{opacity:0;transform:translate(-50%,-30%) scale(.8)}15%{opacity:1;transform:translate(-50%,-50%) scale(1.05)}100%{opacity:0;transform:translate(-50%,-160%) scale(1)}}
.tm-ov{position:absolute;inset:0;z-index:10;display:flex;align-items:center;justify-content:center;background:rgba(250,250,250,.78);backdrop-filter:blur(5px);border-radius:14px;padding:14px;animation:tm-fade .22s ease both}
@keyframes tm-fade{from{opacity:0}to{opacity:1}}
.tm-ovcard{background:var(--tm-card);border:1px solid var(--tm-line);border-radius:16px;box-shadow:0 12px 32px rgba(24,24,27,.1);padding:18px;max-width:430px;width:100%;max-height:100%;overflow:auto;animation:tm-up .28s ease both}
@keyframes tm-up{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}
.tm-ovcard h3{margin:0 0 8px;font-size:19px}
.tm-ovcard p{margin:0 0 10px;font-size:13.5px;color:var(--tm-mut);line-height:1.55}
.tm-steps{margin:0 0 10px;padding:0;list-style:none;display:flex;flex-direction:column;gap:7px;font-size:13px;line-height:1.5}
.tm-steps li{display:flex;gap:8px}
.tm-stepno{flex:none;width:20px;height:20px;border-radius:6px;background:var(--tm-ink);color:#fff;font-size:11px;font-weight:700;display:flex;align-items:center;justify-content:center;margin-top:1px}
.tm-scoretable{display:flex;flex-wrap:wrap;gap:6px;margin:0 0 12px}
.tm-scoretable span{font-size:11.5px;font-weight:700;background:var(--tm-bg);border:1px solid var(--tm-line);border-radius:8px;padding:3px 7px;font-variant-numeric:tabular-nums}
.tm-keys{font-size:12px;color:var(--tm-mut);line-height:1.8;margin:0 0 12px}
.tm-keys kbd{background:var(--tm-bg);border:1px solid var(--tm-line);border-bottom-width:2px;border-radius:5px;padding:1px 5px;font-size:11px;font-family:inherit}
.tm-ovbtns{display:flex;gap:8px;flex-wrap:wrap}
.tm-btn{appearance:none;display:inline-flex;align-items:center;justify-content:center;gap:7px;border:1px solid var(--tm-line);background:var(--tm-card);color:var(--tm-ink);font:inherit;font-size:13px;font-weight:600;border-radius:10px;padding:8px 13px;cursor:pointer;transition:background .15s,border-color .15s,transform .05s;touch-action:manipulation}
.tm-btn:hover{background:#f4f4f5}
.tm-btn:active{transform:translateY(1px)}
.tm-btn:focus-visible{outline:2px solid var(--tm-acc);outline-offset:2px}
.tm-btn.primary{background:var(--tm-ink);border-color:var(--tm-ink);color:#fff}
.tm-btn.primary:hover{background:#27272a}
.tm-btn svg{flex:none}
.tm-btn.block{width:100%}
.tm-cheats{display:flex;flex-direction:column;gap:7px;margin:0 0 12px}
.tm-cheat{display:flex;align-items:center;gap:10px;text-align:left;width:100%;padding:9px 11px}
.tm-cheat b{display:block;font-size:13px}
.tm-cheat small{display:block;color:var(--tm-mut);font-weight:500;font-size:11.5px}
.tm-msgline{display:flex;align-items:center;justify-content:space-between;gap:10px;min-height:22px;max-width:640px;margin:0 auto;width:100%}
.tm-msg{font-size:13px;font-weight:600;color:var(--tm-mut)}
.tm-msg.good{color:var(--tm-good)}
.tm-msg.bad{color:var(--tm-bad)}
.tm-msg.turn{color:var(--tm-acc)}
.tm-preview{font-size:12px;font-weight:700;color:var(--tm-mut);font-variant-numeric:tabular-nums;white-space:nowrap}
.tm-pad{display:none;align-items:center;justify-content:center;gap:18px;max-width:640px;margin:2px auto 0;width:100%;user-select:none;-webkit-user-select:none}
.tm-pad.on{display:flex}
@media (hover:none) and (pointer:coarse){.tm-pad{display:flex}}
@media (max-width:760px){.tm-pad{display:flex}}
.tm-dpad{display:grid;grid-template-columns:repeat(3,48px);grid-template-rows:repeat(3,48px);gap:6px}
.tm-pbtn{padding:0;border-radius:12px}
.tm-up{grid-area:1/2}.tm-left{grid-area:2/1}.tm-center{grid-area:2/2}.tm-right{grid-area:2/3}.tm-down{grid-area:3/2}
.tm-pad-side{display:flex;flex-direction:column;gap:8px}
.tm-side{display:flex;flex-direction:column;gap:12px;min-width:0}
.tm-card{background:var(--tm-card);border:1px solid var(--tm-line);border-radius:14px;padding:13px 14px}
.tm-card h4{margin:0 0 8px;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:var(--tm-mut)}
.tm-howto p{margin:0 0 8px;font-size:12.5px;color:var(--tm-mut);line-height:1.6}
.tm-howto .tm-scoretable{margin:0 0 8px}
.tm-tools{display:flex;flex-direction:column;gap:8px}
.tm-best{font-size:12px;color:var(--tm-mut);display:flex;justify-content:space-between;gap:8px}
.tm-best b{color:var(--tm-ink);font-variant-numeric:tabular-nums}
@media(max-width:979px){.tm-howto{display:none}.tm-tools{flex-direction:row;flex-wrap:wrap}.tm-tools .tm-btn{flex:1 1 auto}.tm-best{flex:1 1 100%}}
</style>
<div class="game-app tm">
  <div class="game-intro">
    <div><h2>Tap Match</h2><p>Grup 2+ balok sewarna, ${MOVES_EACH} langkah per pemain, target ${TARGET} poin. Undian menentukan siapa jalan duluan.</p></div>
    <span class="game-status"><i class="game-status-dot"></i><span data-status>Siap</span></span>
  </div>

  <section class="game-panel tm-panel" data-board>
    <div class="tm-grid">
      <div class="tm-main">
        <div class="tm-hud">
          <div class="tm-score" data-seat="0"></div>
          <div class="tm-target"><span>Target</span><b>${TARGET}</b></div>
          <div class="tm-score" data-seat="1"></div>
        </div>

        <div class="tm-stage">
          <div class="tm-board" data-boardgrid role="application" aria-label="Papan Tap Match" tabindex="0">
            <div class="tm-tiles" data-tiles></div>
            <div class="tm-cursor" data-cursor hidden></div>
            <div class="tm-fx" data-fx></div>
          </div>

          <div class="tm-ov" data-ov="help" hidden>
            <div class="tm-ovcard">
              <h3>Cara Main</h3>
              <ol class="tm-steps">
                <li><span class="tm-stepno">1</span><span>Ketuk grup berisi <b>${GROUP_MIN}+ balok sewarna</b> yang terhubung (atas/bawah/kiri/kanan) untuk membersihkannya.</span></li>
                <li><span class="tm-stepno">2</span><span>Balok di atasnya <b>jatuh</b>, lalu balok baru turun dari atas. Grup besar memberi poin jauh lebih besar.</span></li>
                <li><span class="tm-stepno">3</span><span>Pemain bergiliran, masing-masing <b>${MOVES_EACH} langkah</b>. Pertama mencapai <b>${TARGET} poin</b> menang; jika langkah habis, skor tertinggi menang.</span></li>
                <li><span class="tm-stepno">4</span><span>Setiap level dibangkitkan acak dan <b>dijamin bisa diselesaikan</b>. Undian menentukan giliran pertama (dan posisi P1/P2 saat multiplayer).</span></li>
              </ol>
              <div class="tm-scoretable"><span>2 = 20</span><span>3 = 35</span><span>4 = 60</span><span>5 = 95</span><span>6 = 140</span><span>8 = 260</span></div>
              <p>Rumus poin: n x 10 + (n - 2)&sup2; x 5.</p>
              <p class="tm-keys"><b>Desktop:</b> <kbd>panah</kbd>/<kbd>WASD</kbd> gerak &middot; <kbd>Enter</kbd>/<kbd>Spasi</kbd> ketuk &middot; <kbd>H</kbd> hint &middot; <kbd>R</kbd> ulangi &middot; <kbd>C</kbd> cheat &middot; <kbd>?</kbd> bantuan. Mouse: arahkan untuk pratinjau grup, klik untuk ketuk.<br><b>Mobile:</b> gunakan D-pad dan tombol Ketuk di bawah papan.</p>
              <div class="tm-ovbtns">
                <button class="tm-btn primary" type="button" data-act="start">Mulai game</button>
                <button class="tm-btn" type="button" data-act="help-close">Tutup</button>
              </div>
            </div>
          </div>

          <div class="tm-ov" data-ov="cheats" hidden>
            <div class="tm-ovcard">
              <h3>Cheat</h3>
              <p>Hanya tersedia saat melawan bot. Jika cheat dipakai, skor terbaik tidak disimpan.</p>
              <div class="tm-cheats">
                <button class="tm-btn tm-cheat" type="button" data-cheat="points"><span><b>+150 poin</b><small>Tambah skor kamu langsung</small></span></button>
                <button class="tm-btn tm-cheat" type="button" data-cheat="moves"><span><b>+3 langkah</b><small>Tambah jatah langkah kamu</small></span></button>
                <button class="tm-btn tm-cheat" type="button" data-cheat="shuffle"><span><b>Acak papan</b><small>Sebar ulang semua balok</small></span></button>
                <button class="tm-btn tm-cheat" type="button" data-cheat="paint"><span><b>Kurangi jadi 2 warna</b><small>Grup raksasa jadi mudah dibuat</small></span></button>
                <button class="tm-btn tm-cheat" type="button" data-cheat="skip"><span><b>Lewati giliran bot</b><small>Rebut giliran saat bot berpikir</small></span></button>
                <button class="tm-btn tm-cheat" type="button" data-cheat="hint"><span><b>Sorot grup terbaik</b><small>Gratis, tidak dihitung cheat</small></span></button>
                <button class="tm-btn tm-cheat" type="button" data-cheat="win"><span><b>Menang instan</b><small>Akhiri ronde sekarang</small></span></button>
              </div>
              <div class="tm-ovbtns"><button class="tm-btn" type="button" data-act="cheats-close">Tutup</button></div>
            </div>
          </div>

          <div class="tm-ov" data-ov="over" hidden>
            <div class="tm-ovcard">
              <h3 data-over="title">Selesai</h3>
              <p data-over="body"></p>
              <p data-over="wait" hidden>Menunggu host memulai ulang&hellip;</p>
              <div class="tm-ovbtns">
                <button class="tm-btn primary" type="button" data-act="restart" data-over="again">Main lagi</button>
                <button class="tm-btn" type="button" data-exit>Keluar</button>
              </div>
            </div>
          </div>

          <div class="tm-ov" data-ov="wait" hidden>
            <div class="tm-ovcard">
              <h3>Menunggu host&hellip;</h3>
              <p>Papan akan muncul begitu host menyiarkan state permainan.</p>
            </div>
          </div>
        </div>

        <div class="tm-msgline"><span class="tm-msg" data-msg aria-live="polite"></span><span class="tm-preview" data-preview></span></div>

        <div class="tm-pad" data-pad>
          <div class="tm-dpad">
            <button class="tm-btn tm-pbtn tm-up" type="button" data-act="pad-up" aria-label="Atas"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6 14l6-6 6 6"/></svg></button>
            <button class="tm-btn tm-pbtn tm-left" type="button" data-act="pad-left" aria-label="Kiri"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14 6l-6 6 6 6"/></svg></button>
            <button class="tm-btn tm-pbtn tm-center primary" type="button" data-act="pad-tap" aria-label="Ketuk grup"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="2.4" fill="currentColor" stroke="none"/></svg></button>
            <button class="tm-btn tm-pbtn tm-right" type="button" data-act="pad-right" aria-label="Kanan"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10 6l6 6-6 6"/></svg></button>
            <button class="tm-btn tm-pbtn tm-down" type="button" data-act="pad-down" aria-label="Bawah"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6 10l6 6 6-6"/></svg></button>
          </div>
          <div class="tm-pad-side">
            <button class="tm-btn" type="button" data-act="hint">Hint</button>
            <button class="tm-btn" type="button" data-act="help">Cara main</button>
          </div>
        </div>
      </div>

      <aside class="tm-side">
        <div class="tm-card tm-howto">
          <h4>Cara main</h4>
          <p>Ketuk grup 2+ balok sewarna yang terhubung. Balok jatuh dan diisi ulang dari atas. Bergiliran dengan lawan; pertama mencapai target menang.</p>
          <div class="tm-scoretable"><span>2 = 20</span><span>3 = 35</span><span>5 = 95</span><span>8 = 260</span></div>
          <p>Grup besar = poin kuadratik. Rangkai klaster sebelum mengetuk.</p>
        </div>
        <div class="tm-card tm-tools">
          <button class="tm-btn block" type="button" data-act="help"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M9.6 9.2a2.5 2.5 0 1 1 3.5 2.3c-.8.4-1.1 1-1.1 1.8"/><circle cx="12" cy="16.6" r=".4" fill="currentColor"/></svg>Bantuan</button>
          <button class="tm-btn block" type="button" data-act="cheats"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 4V2M15 8V6M11 6h2M17 6h2M20 20L9 9M5 21l3-3"/></svg>Cheat</button>
          <button class="tm-btn block" type="button" data-act="restart"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/></svg>Ulangi</button>
          <button class="tm-btn block" type="button" data-act="pad-toggle" aria-pressed="false"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="7" width="20" height="11" rx="5"/><path d="M7 11v3M5.5 12.5h3"/><circle cx="16" cy="11.5" r=".5" fill="currentColor"/><circle cx="18.5" cy="13.5" r=".5" fill="currentColor"/></svg>Kontrol virtual</button>
          <span class="tm-best" data-bestrow>Skor terbaik <b data-best>0</b></span>
        </div>
      </aside>
    </div>
  </section>

  <div class="game-actions"><button class="game-action-button" type="button" data-exit>Keluar game</button></div>
</div>`;

    /* ---------- refs ---------- */
    const $ = (s) => root.querySelector(s);
    const boardEl = $("[data-boardgrid]");
    const tilesEl = $("[data-tiles]");
    const cursorEl = $("[data-cursor]");
    const fxEl = $("[data-fx]");
    const msgEl = $("[data-msg]");
    const previewEl = $("[data-preview]");
    const statusEl = $("[data-status]");
    const dotEl = $(".game-status-dot");
    const seatEls = [$('[data-seat="0"]'), $('[data-seat="1"]')];
    const ovHelp = $('[data-ov="help"]');
    const ovCheats = $('[data-ov="cheats"]');
    const ovOver = $('[data-ov="over"]');
    const ovWait = $('[data-ov="wait"]');
    const helpStartBtn = $('[data-act="start"]');
    const helpCloseBtn = $('[data-act="help-close"]');
    const overTitle = $('[data-over="title"]');
    const overBody = $('[data-over="body"]');
    const overAgain = $('[data-over="again"]');
    const overWait = $('[data-over="wait"]');
    const bestEl = $("[data-best]");
    const bestRow = $("[data-bestrow]");
    const padEl = $("[data-pad]");
    const cheatBtn = $('[data-act="cheats"]');
    const restartBtn = $('.tm-tools [data-act="restart"]');
    const padToggleBtn = $('[data-act="pad-toggle"]');

    /* ---------- util ---------- */
    function esc(s) {
        return String(s).split("&").join("&amp;").split("<").join("&lt;")
            .split(">").join("&gt;").split('"').join("&quot;").split("'").join("&#39;");
    }
    function mySeat() {
        return online ? (state && state.seats ? state.seats[playerIndex] : playerIndex) : 0;
    }
    function oppName() {
        const ps = roomData && (roomData.players || roomData.members);
        if (ps) {
            const arr = Array.isArray(ps) ? ps : Object.values(ps);
            const other = arr[playerIndex === 0 ? 1 : 0];
            const nm = other && (other.name || other.playerName);
            if (nm) return String(nm);
        }
        return "Lawan";
    }
    function seatName(seat) {
        if (!online) return seat === 0 ? "Kamu" : "Bot";
        return seat === mySeat() ? (playerName || "Kamu") : oppName();
    }
    function seatColor(seat) { return seat === 0 ? "#2563eb" : "#d97706"; }
    function setPos(el, r, c) {
        el.style.setProperty("--tx", c * 100 + "%");
        el.style.setProperty("--ty", r * 100 + "%");
    }
    function flashMsg(text, mood) {
        localMsg = { text, mood };
        renderMsg();
        later(() => { localMsg = null; renderMsg(); }, 1600);
    }

    /* ---------- render: papan (diff id tile -> animasi jatuh & pecah) ---------- */
    const pool = new Map(); // id -> {el, face, r, c, k, popping}

    function renderBoard() {
        if (!state) { tilesEl.innerHTML = ""; pool.clear(); return; }
        const desired = new Set();
        const newPerCol = new Array(SIZE).fill(0);
        for (let r = 0; r < SIZE; r++) {
            for (let c = 0; c < SIZE; c++) {
                const t = state.board[r][c];
                if (!t) continue;
                desired.add(t.id);
                if (!pool.has(t.id)) newPerCol[c]++;
            }
        }
        let removed = false;
        pool.forEach((rec, id) => {
            if (desired.has(id) || rec.popping) return;
            rec.popping = true;
            removed = true;
            rec.el.classList.add("pop"); // animasi destroy
            later(() => {
                if (rec.el.parentNode) rec.el.parentNode.removeChild(rec.el);
                pool.delete(id);
            }, 260);
        });
        const fallDelay = removed ? 120 : 0; // pecah dulu, baru jatuh
        for (let r = 0; r < SIZE; r++) {
            for (let c = 0; c < SIZE; c++) {
                const t = state.board[r][c];
                if (!t) continue;
                let rec = pool.get(t.id);
                if (!rec) {
                    const el = document.createElement("div");
                    el.className = "tm-tile";
                    const face = document.createElement("div");
                    face.className = "tm-face k" + t.k;
                    el.appendChild(face);
                    const spawnRow = r - newPerCol[c]; // mulai dari atas papan
                    setPos(el, spawnRow, c);
                    tilesEl.appendChild(el);
                    rec = { el, face, r: spawnRow, c, k: t.k, popping: false };
                    pool.set(t.id, rec);
                    const target = rec, rr = r, cc = c;
                    later(() => { setPos(target.el, rr, cc); target.r = rr; target.c = cc; }, 130 + fallDelay);
                } else {
                    if (rec.k !== t.k) { rec.face.className = "tm-face k" + t.k; rec.k = t.k; }
                    if (rec.r !== r || rec.c !== c) {
                        const target = rec, rr = r, cc = c;
                        if (fallDelay) later(() => { setPos(target.el, rr, cc); target.r = rr; target.c = cc; }, fallDelay);
                        else { setPos(rec.el, r, c); rec.r = r; rec.c = c; }
                    }
                }
            }
        }
    }

    function renderHighlight() {
        pool.forEach((rec) => rec.el.classList.remove("hl"));
        previewEl.textContent = "";
        if (!state || state.phase !== "playing") { cursorEl.hidden = true; return; }
        cursorEl.hidden = !showCursor;
        if (showCursor) setPos(cursorEl, cursor.r, cursor.c);
        let cells = hintCells;
        if (!cells) {
            const src = hover || (showCursor ? cursor : null);
            if (src) {
                const g = findGroup(state.board, src.r, src.c);
                if (g.length >= GROUP_MIN) cells = g;
            }
        }
        if (!cells) return;
        let n = 0;
        cells.forEach(([r, c]) => {
            const t = state.board[r] && state.board[r][c];
            if (!t) return;
            const rec = pool.get(t.id);
            if (rec && !rec.popping) { rec.el.classList.add("hl"); n++; }
        });
        if (n >= GROUP_MIN) previewEl.textContent = "Grup " + n + " -> +" + groupPoints(n);
    }

    function renderHud() {
        for (let s = 0; s < 2; s++) {
            const el = seatEls[s];
            const active = !!state && state.phase === "playing" && state.turn === s;
            el.classList.toggle("active", active);
            const sc = state ? state.scores[s] : 0;
            const mv = state ? state.moves[s] : MOVES_EACH;
            const pct = state ? Math.min(100, Math.round((sc / state.target) * 100)) : 0;
            const you = !!state && s === mySeat();
            const bump = sc > prevScores[s];
            el.innerHTML =
                '<div class="tm-score-top"><span class="tm-seat-tag">P' + (s + 1) + '</span>' +
                '<span class="tm-name">' + esc(seatName(s)) + (you ? ' <em class="tm-you">&middot; kamu</em>' : "") + "</span>" +
                '<span class="tm-turnpill">giliran</span></div>' +
                '<div class="tm-score-num' + (bump ? " bump" : "") + '">' + sc + "</div>" +
                '<div class="tm-score-sub">' + mv + " langkah tersisa</div>" +
                '<div class="tm-bar"><i style="width:' + pct + '%"></i></div>';
            prevScores[s] = sc;
        }
    }

    function renderStatus() {
        let st = "Siap", dot = "#a1a1aa";
        if (!state) st = online ? "Menunggu host..." : "Siap";
        else if (state.phase === "ready") st = "Siap";
        else if (state.phase === "over") st = "Selesai";
        else if (state.turn === mySeat()) { st = "Giliranmu"; dot = "#10b981"; }
        else { st = online ? "Giliran lawan" : "Bot berpikir..."; dot = "#f59e0b"; }
        statusEl.textContent = st;
        if (dotEl) dotEl.style.background = dot;
    }

    function renderMsg() {
        let text = "", mood = "";
        if (localMsg) { text = localMsg.text; mood = localMsg.mood || ""; }
        else if (!state) text = online ? "Menunggu state dari host..." : "";
        else if (state.phase === "ready") text = "Baca cara main, lalu tekan Mulai.";
        else if (state.phase === "over") text = "Permainan selesai.";
        else if (state.seq === 0) { text = "Undian: " + seatName(state.starter) + " jalan duluan."; mood = "turn"; }
        else {
            const ev = state.lastEvent;
            if (ev && ev.t === "clear") {
                text = seatName(ev.seat) + " membersihkan " + ev.n + " balok: +" + ev.pts +
                    (ev.shuffled ? " & papan diacak" : "");
                mood = ev.seat === mySeat() ? "good" : "";
            } else if (ev && ev.t === "cheat") { text = ev.text; mood = "turn"; }
            else { text = state.turn === mySeat() ? "Giliranmu: ketuk grup sewarna." : "Menunggu lawan..."; }
        }
        msgEl.textContent = text;
        msgEl.className = "tm-msg" + (mood ? " " + mood : "");
    }

    function floatText(cx, cy, text, seat, big) {
        const el = document.createElement("div");
        el.className = "tm-float" + (big ? " big" : "");
        el.style.left = ((cx + 0.5) / SIZE) * 100 + "%";
        el.style.top = ((cy + 0.5) / SIZE) * 100 + "%";
        el.style.setProperty("--fc", seatColor(seat));
        el.textContent = text;
        fxEl.appendChild(el);
        later(() => { if (el.parentNode) el.parentNode.removeChild(el); }, 950);
    }

    function renderFx() {
        if (!state) { prevSeq = -1; return; }
        if (state.seq === prevSeq) return;
        const ev = state.lastEvent;
        if (ev && ev.t === "clear") floatText(ev.cx, ev.cy, "+" + ev.pts, ev.seat, false);
        if (prevSeq === -1 || state.seq === 0) {
            const me = mySeat();
            const mid = (SIZE - 1) / 2;
            floatText(mid, mid - 0.9,
                state.starter === me ? "Kamu duluan!" : seatName(state.starter) + " duluan!",
                state.starter, true);
            if (online) later(() => floatText(mid, mid + 0.4, "Kamu bermain sebagai P" + (me + 1), me, true), 380);
        }
        prevSeq = state.seq;
    }

    function renderOver() {
        const over = !!state && state.phase === "over";
        ovOver.hidden = !over;
        if (!over) return;
        const w = state.winner, me = mySeat();
        let title;
        if (w === -1) title = "Seri!";
        else if (!online) title = w === 0 ? "Kamu menang!" : "Bot menang";
        else title = w === me ? "Kamu menang!" : "Lawan menang";
        overTitle.textContent = title;
        overTitle.style.color = w === -1 ? "" : seatColor(w);
        const reason = w !== -1 && state.scores[w] >= state.target
            ? "Target " + state.target + " poin tercapai."
            : "Semua langkah habis.";
        overBody.innerHTML = esc(reason) + "<br>P1: <b>" + state.scores[0] + "</b> &middot; P2: <b>" + state.scores[1] + "</b>" +
            (state.cheated ? "<br>Cheat digunakan - skor terbaik tidak disimpan." : "");
        overAgain.hidden = online && !room.isHost;
        overWait.hidden = !(online && !room.isHost);
        if (!online && !state.cheated && state.scores[0] > best) {
            best = state.scores[0];
            try { localStorage.setItem(META.bestKey, String(best)); } catch (e) { /* abaikan */ }
        }
    }

    function render() {
        if (disposed) return;
        renderHud();
        renderBoard();
        renderHighlight();
        renderMsg();
        renderFx();
        renderOver();
        renderStatus();
        ovHelp.hidden = !showHelp;
        ovCheats.hidden = !showCheats;
        helpStartBtn.hidden = !state || state.phase !== "ready";
        helpCloseBtn.hidden = !!state && state.phase === "ready";
        ovWait.hidden = !(online && !state);
        cheatBtn.hidden = online;
        restartBtn.hidden = online && !room.isHost;
        bestRow.hidden = online;
        bestEl.textContent = best;
        padEl.classList.toggle("on", padForced);
        padToggleBtn.setAttribute("aria-pressed", padForced ? "true" : "false");
        scheduleBot();
    }

    function publish() {
        render();
        if (online && room.isHost) room.publishState(state).catch(console.warn);
    }

    /* ---------- aksi (kanonik di host / lokal) ---------- */
    function applyAction(action, actor) {
        if (disposed || !state || !action || typeof action !== "object") return;
        const seat = online ? state.seats[actor] : actor;

        if (action.type === "start") {
            if (online || state.phase !== "ready") return;
            state.phase = "playing";
            showHelp = false;
            publish();
            return;
        }
        if (action.type === "restart") {
            if (online && actor !== 0) return; // hanya host
            state = newGameState(online);
            showHelp = false; showCheats = false; hintCells = null; localMsg = null;
            publish();
            return;
        }
        if (action.type === "cheat") {
            if (!online) applyCheat(action.cheat);
            return;
        }
        if (action.type !== "tap") return;
        if (state.phase !== "playing" || seat !== state.turn) return;
        if (state.moves[seat] <= 0) return;
        const r = Math.floor(action.r), c = Math.floor(action.c);
        if (!(r >= 0 && r < SIZE && c >= 0 && c < SIZE)) return;
        const group = findGroup(state.board, r, c);
        if (group.length < GROUP_MIN) {
            if (actor === playerIndex) flashMsg("Pilih grup " + GROUP_MIN + "+ balok sewarna yang terhubung.", "bad");
            return;
        }
        let sr = 0, sc = 0;
        group.forEach(([gr, gc]) => { sr += gr; sc += gc; });
        const env = { rng: state.rng, nextId: state.nextId };
        const pts = collapse(state.board, group, env);
        state.scores[seat] += pts;
        state.moves[seat] -= 1;
        state.seq += 1;
        let shuffled = false;
        if (!hasMove(state.board)) { reshuffleBoard(state.board, env); shuffled = true; }
        state.rng = env.rng;
        state.nextId = env.nextId;
        state.lastEvent = { t: "clear", seat, n: group.length, pts, cx: sc / group.length, cy: sr / group.length, shuffled };
        localMsg = null;
        hintCells = null;
        if (state.scores[seat] >= state.target) { state.phase = "over"; state.winner = seat; }
        else if (state.moves[0] + state.moves[1] <= 0) {
            state.phase = "over";
            state.winner = state.scores[0] === state.scores[1] ? -1 : (state.scores[0] > state.scores[1] ? 0 : 1);
        } else {
            const other = 1 - seat;
            state.turn = state.moves[other] > 0 ? other : seat;
        }
        publish();
    }

    function submitAction(action) {
        if (online && !room.isHost) { room.sendAction(action).catch(console.warn); return; }
        applyAction(action, playerIndex);
    }

    function submitTap(r, c) {
        if (!state) return;
        if (state.phase === "ready") { showHelp = true; render(); return; }
        if (state.phase !== "playing") return;
        if (state.turn !== mySeat()) {
            flashMsg(online ? "Tunggu giliranmu." : "Bot sedang berpikir...", "bad");
            return;
        }
        cursor = { r, c };
        const g = findGroup(state.board, r, c);
        if (g.length < GROUP_MIN) {
            flashMsg("Pilih grup " + GROUP_MIN + "+ balok sewarna yang terhubung.", "bad");
            renderHighlight();
            return;
        }
        submitAction({ type: "tap", r, c });
        renderHighlight();
    }

    /* ---------- cheat (solo saja) ---------- */
    function applyCheat(kind) {
        if (!state || state.phase !== "playing") { flashMsg("Mulai permainan dulu.", "bad"); return; }
        const me = 0;
        const env = { rng: state.rng, nextId: state.nextId };
        let label = "";
        if (kind === "points") { state.scores[me] += 150; label = "+150 poin"; }
        else if (kind === "moves") { state.moves[me] += 3; label = "+3 langkah"; }
        else if (kind === "shuffle") { reshuffleBoard(state.board, env); label = "papan diacak"; }
        else if (kind === "paint") {
            for (let r = 0; r < SIZE; r++)
                for (let c = 0; c < SIZE; c++)
                    if (state.board[r][c]) state.board[r][c].k = state.board[r][c].k % 2;
            if (!hasMove(state.board)) reshuffleBoard(state.board, env);
            label = "warna dipangkas jadi 2";
        }
        else if (kind === "skip") {
            if (state.turn !== 1) { flashMsg("Sekarang sudah giliranmu.", "bad"); return; }
            if (state.moves[0] <= 0) { flashMsg("Langkahmu sudah habis.", "bad"); return; }
            state.turn = 0; label = "giliran bot dilewati";
        }
        else if (kind === "win") { state.phase = "over"; state.winner = me; label = "menang instan"; }
        else if (kind === "hint") { showCheats = false; doHint(); render(); return; }
        else return;
        state.rng = env.rng;
        state.nextId = env.nextId;
        state.cheated = true;
        state.seq += 1;
        state.lastEvent = { t: "cheat", text: "Cheat: " + label };
        if (kind !== "win" && state.scores[me] >= state.target) { state.phase = "over"; state.winner = me; }
        showCheats = false;
        publish();
    }

    function doHint() {
        if (!state || state.phase !== "playing") return;
        const gs = allGroups(state.board);
        if (!gs.length) { flashMsg("Tidak ada grup di papan.", "bad"); return; }
        hintCells = gs[0];
        renderHighlight();
        later(() => { hintCells = null; renderHighlight(); }, 2200);
    }

    /* ---------- bot (mode ai) ---------- */
    function scheduleBot() {
        if (botTimer) { clearTimeout(botTimer); botTimer = null; }
        if (online || disposed || !state) return;
        if (state.phase !== "playing" || state.turn !== 1 || showHelp || showCheats) return;
        botTimer = setTimeout(() => { botTimer = null; if (!disposed) botMove(); }, 750 + Math.random() * 650);
    }
    function botMove() {
        if (!state || state.phase !== "playing" || state.turn !== 1) return;
        const gs = allGroups(state.board);
        if (!gs.length) return;
        // 65% grup terbaik, 35% acak -> bot bisa dikalahkan
        const pick = Math.random() < 0.65 ? gs[0] : gs[Math.floor(Math.random() * gs.length)];
        const cell = pick[Math.floor(Math.random() * pick.length)];
        applyAction({ type: "tap", r: cell[0], c: cell[1] }, 1);
    }

    /* ---------- input: mouse / klik / tombol virtual ---------- */
    function moveCursor(dr, dc) {
        showCursor = true;
        cursor = {
            r: Math.min(SIZE - 1, Math.max(0, cursor.r + dr)),
            c: Math.min(SIZE - 1, Math.max(0, cursor.c + dc)),
        };
        renderHighlight();
    }

    function handleClick(event) {
        if (event.target.closest("[data-exit]")) { onExit(); return; }
        const cheatEl = event.target.closest("[data-cheat]");
        if (cheatEl) { applyCheat(cheatEl.dataset.cheat); return; }
        const actEl = event.target.closest("[data-act]");
        if (actEl) {
            const act = actEl.dataset.act;
            if (act === "start") submitAction({ type: "start" });
            else if (act === "restart") submitAction({ type: "restart" });
            else if (act === "help") { showHelp = !showHelp; showCheats = false; render(); }
            else if (act === "help-close") { showHelp = false; render(); }
            else if (act === "cheats") { if (!online) { showCheats = !showCheats; showHelp = false; render(); } }
            else if (act === "cheats-close") { showCheats = false; render(); }
            else if (act === "hint") doHint();
            else if (act === "pad-toggle") { padForced = !padForced; render(); }
            else if (act === "pad-up") moveCursor(-1, 0);
            else if (act === "pad-down") moveCursor(1, 0);
            else if (act === "pad-left") moveCursor(0, -1);
            else if (act === "pad-right") moveCursor(0, 1);
            else if (act === "pad-tap") { showCursor = true; submitTap(cursor.r, cursor.c); }
            return;
        }
        if (event.target.closest("[data-boardgrid]")) {
            const rect = boardEl.getBoundingClientRect();
            const c = Math.floor(((event.clientX - rect.left) / rect.width) * SIZE);
            const r = Math.floor(((event.clientY - rect.top) / rect.height) * SIZE);
            if (r >= 0 && r < SIZE && c >= 0 && c < SIZE) { hover = { r, c }; submitTap(r, c); }
        }
    }

    function handleMove(event) {
        if (!state) return;
        const rect = boardEl.getBoundingClientRect();
        const c = Math.floor(((event.clientX - rect.left) / rect.width) * SIZE);
        const r = Math.floor(((event.clientY - rect.top) / rect.height) * SIZE);
        if (r < 0 || c < 0 || r >= SIZE || c >= SIZE) {
            if (hover) { hover = null; renderHighlight(); }
            return;
        }
        if (!hover || hover.r !== r || hover.c !== c) { hover = { r, c }; renderHighlight(); }
    }
    function handleLeave() { hover = null; renderHighlight(); }

    /* ---------- input: keyboard ---------- */
    function handleKey(event) {
        if (disposed || !root.isConnected) return;
        const t = event.target;
        if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
        const k = event.key;
        if (k === "Escape") {
            if (showCheats) { showCheats = false; render(); event.preventDefault(); }
            else if (showHelp && state && state.phase !== "ready") { showHelp = false; render(); event.preventDefault(); }
            return;
        }
        if (showHelp || showCheats) {
            if ((k === "Enter" || k === " ") && showHelp && state && state.phase === "ready") {
                event.preventDefault();
                submitAction({ type: "start" });
            }
            return;
        }
        let handled = true;
        switch (k) {
            case "ArrowUp": case "w": case "W": moveCursor(-1, 0); break;
            case "ArrowDown": case "s": case "S": moveCursor(1, 0); break;
            case "ArrowLeft": case "a": case "A": moveCursor(0, -1); break;
            case "ArrowRight": case "d": case "D": moveCursor(0, 1); break;
            case "Enter": case " ": showCursor = true; submitTap(cursor.r, cursor.c); break;
            case "h": case "H": doHint(); break;
            case "r": case "R": if (!online || room.isHost) submitAction({ type: "restart" }); break;
            case "c": case "C": if (!online) { showCheats = !showCheats; render(); } break;
            case "?": showHelp = !showHelp; render(); break;
            default: handled = false;
        }
        if (handled) event.preventDefault();
    }

    root.addEventListener("click", handleClick);
    boardEl.addEventListener("pointermove", handleMove);
    boardEl.addEventListener("pointerleave", handleLeave);
    document.addEventListener("keydown", handleKey);

    /* ---------- init: online (host / guest) atau ai ---------- */
    const unsubs = [];
    if (online) {
        const u1 = room.onRoom((nextRoom) => { if (disposed) return; roomData = nextRoom; render(); });
        if (typeof u1 === "function") unsubs.push(u1);
        if (room.isHost) {
            state = newGameState(true); // host: undian kursi + giliran pertama
            publish();
            const u2 = room.onAction((action) => { if (!disposed) applyAction(action, 1); });
            if (typeof u2 === "function") unsubs.push(u2);
        } else {
            const u3 = room.onState((nextState) => { if (disposed) return; state = nextState; render(); });
            if (typeof u3 === "function") unsubs.push(u3);
            render();
        }
    } else {
        state = newGameState(false);
        state.phase = "ready"; // tutorial dulu, bot menunggu
        showHelp = true;
        render();
    }

    return {
        destroy() {
            disposed = true;
            clearTimers();
            if (botTimer) { clearTimeout(botTimer); botTimer = null; }
            root.removeEventListener("click", handleClick);
            boardEl.removeEventListener("pointermove", handleMove);
            boardEl.removeEventListener("pointerleave", handleLeave);
            document.removeEventListener("keydown", handleKey);
            unsubs.forEach((u) => { try { u(); } catch (e) { /* abaikan */ } });
            pool.clear();
            root.innerHTML = "";
        },
    };
}