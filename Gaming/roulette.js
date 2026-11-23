/* ==== GAME: roulette.js ==== */
/*
  Roulette Duel — European single-zero (37 pocket).
  Format baru: export const META + export function mount(root, context).
  Setelah menaruh file ini di JS/games/, jalankan:
    node tools/build-games-manifest.mjs
*/

export const META = {
    id: "roulette", // harus sama dengan nama file (tanpa .js)
    name: "Roulette Duel",
    category: "casino",
    catLabel: "Casino",
    desc: "Duel roulette melawan bot/pemain. Level acak: ubah modal awal menjadi target sebelum putaran habis.",
    art: '<svg viewBox="0 0 48 48" width="54" height="54" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="24" cy="26" r="17"/><circle cx="24" cy="26" r="5.5"/><path d="M24 9v6"/><path d="M24 37v6"/><path d="M7 26h6"/><path d="M35 26h6"/><path d="M12 14l4.2 4.2"/><path d="M36 14l-4.2 4.2"/><path d="M12 38l4.2-4.2"/><path d="M36 38l-4.2-4.2"/><circle cx="33" cy="11" r="2.6" fill="currentColor" stroke="none"/></svg>',
    bg: ["#fde68a", "#f59e0b"],
    bestKey: "rouletteBestBank",
};

/* ---------------- aturan murni (diekspos untuk test) ---------------- */
const WHEEL_ORDER = [
    0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10,
    5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26,
];
const REDS = [1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36];
const SPIN_MS = 4300;
const OUTSIDE = [
    { id: "red", label: "Merah", cls: "red" },
    { id: "black", label: "Hitam", cls: "black" },
    { id: "even", label: "Genap" },
    { id: "odd", label: "Ganjil" },
    { id: "low", label: "1–18" },
    { id: "high", label: "19–36" },
];

function pocketColor(n) {
    if (n === 0) return "green";
    return REDS.indexOf(n) >= 0 ? "red" : "black";
}

/* Pengembalian untuk taruhan betValue pada betType saat bola jatuh di n.
   Taruhan luar 1:1 (stake x2 kembali), angka tunggal mengembalikan 35x stake
   (dipertahankan sesuai rule kode asli). */
function payout(betType, betValue, n, betNum) {
    if (typeof n !== "number" || n < 0 || n > 36) return 0;
    const c = pocketColor(n);
    if (betType === "red") return c === "red" ? betValue * 2 : 0;
    if (betType === "black") return c === "black" ? betValue * 2 : 0;
    if (betType === "even") return n > 0 && n % 2 === 0 ? betValue * 2 : 0;
    if (betType === "odd") return n % 2 === 1 ? betValue * 2 : 0;
    if (betType === "low") return n >= 1 && n <= 18 ? betValue * 2 : 0;
    if (betType === "high") return n >= 19 && n <= 36 ? betValue * 2 : 0;
    if (betType === "number") {
        const picked = typeof betNum === "number" ? betNum : n;
        return n === picked ? betValue * 35 : 0;
    }
    return 0;
}

/* RNG ber-seed untuk level generator (deterministik per seed). */
function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
        a |= 0; a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/* Level acak yang DIJAMIN bisa diselesaikan:
   - target maksimal 3x modal,
   - budget putaran >= kebutuhan minimum strategi even-money (log2) + cadangan,
   - min bet <= 10% modal. */
function generateLevel(rng, seed) {
    for (let i = 0; i < 50; i++) {
        const start = [150, 200, 250, 300][Math.floor(rng() * 4)];
        const mult = [2, 2.5, 3][Math.floor(rng() * 3)];
        const target = Math.round((start * mult) / 25) * 25;
        const chips = [[5, 10, 25], [5, 10, 25, 50], [5, 10, 25, 50, 100]][Math.floor(rng() * 3)];
        const minBet = chips[0];
        let limit = 8 + Math.floor(rng() * 9); // 8..16 putaran per pemain
        const need = Math.ceil(Math.log2(target / start)) + 4;
        if (limit < need) limit = need;
        if (minBet <= start / 10 && target <= start * 3 && limit >= need) {
            return { seed, start, target, minBet, chips, limit };
        }
    }
    return { seed, start: 200, target: 500, minBet: 5, chips: [5, 10, 25, 50], limit: 12 };
}

function validSpot(spot) {
    if (typeof spot !== "string") return false;
    if (OUTSIDE.some((o) => o.id === spot)) return true;
    if (!/^n\d{1,2}$/.test(spot)) return false;
    const n = +spot.slice(1);
    return n >= 0 && n <= 36;
}

/* Pocket yang paling menguntungkan untuk kumpulan taruhan (untuk cheat rig). */
function bestPocket(betsObj) {
    let score = -1, picks = [];
    for (let n = 0; n <= 36; n++) {
        let s = 0;
        for (const k in betsObj) {
            const b = betsObj[k];
            s += payout(b.type, b.amount, n, b.num);
        }
        if (s > score) { score = s; picks = [n]; }
        else if (s === score) picks.push(n);
    }
    return picks[Math.floor(Math.random() * picks.length)];
}

const randPocket = () => WHEEL_ORDER[Math.floor(Math.random() * WHEEL_ORDER.length)];
const randSeed = () => (Math.random() * 0x7fffffff) | 0;

export const _test = { WHEEL_ORDER, REDS, pocketColor, payout, generateLevel, mulberry32, SPIN_MS };

/* State awal: posisi pemain (seats) dan giliran pertama diundi acak. */
function freshState(seed) {
    const rng = mulberry32(seed);
    const level = generateLevel(rng, seed);
    const seats = rng() < 0.5 ? [0, 1] : [1, 0]; // seats[actorIndex] = nomor kursi
    const first = rng() < 0.5 ? 0 : 1;           // undian siapa jalan duluan
    return {
        session: seed + "-" + Date.now(),
        level, seats, first,
        turn: first,
        phase: "bet", // bet | spinning | over
        banks: [level.start, level.start],
        spins: [0, 0],
        bets: [{}, {}],   // per kursi: spot -> {type, num, amount}
        hist: [[], []],   // riwayat penempatan chip per kursi (untuk undo)
        spinSeq: 0, spin: null, last: null,
        results: [],
        winner: null, reason: "",
        rig: null, nextN: randPocket(),
        cheated: false,
    };
}

export function mount(root, context = {}) {
    const { mode = "ai", room = null, playerName = "Player", onExit = () => { } } = context;
    const online = mode === "room" && Boolean(room);
    const playerIndex = online && !room.isHost ? 1 : 0;
    const canCheat = !online || room.isHost; // cheat hanya lokal / host
    let roomData = room?.room || null;
    let state = null;

    /* ---------------- state lokal (non-sync) ---------------- */
    let chip = 5;
    let cursor = { row: 1, col: 6 };
    let wheelRot = 0, ballRot = 0, lastSpinId = 0, lastSession = "";
    let prevBanks = null, shownBanks = [0, 0];
    const bankRaf = [0, 0];
    let settleTimer = 0, botTimer = 0;
    let lastChipsKey = "", helpOpen = false, cheatOpen = false, peekOn = false, savedSession = "";
    const offs = [];

    /* ---------------- shell (design minimalis) ---------------- */
    root.innerHTML = `
<style>
.rlt-app [hidden]{display:none!important}
.rlt-app{color:#111827}
.rlt-app .rlt-stage{position:relative;padding:14px;background:#fff;border:1px solid #e5e7eb;border-radius:14px}
.rlt-app .rlt-players{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:10px}
.rlt-app .rlt-pcard{position:relative;flex:1 1 180px;border:1px solid #e5e7eb;border-radius:12px;padding:10px 12px;background:#fafafa;transition:box-shadow .25s,border-color .25s}
.rlt-app .rlt-pcard.turn{border-color:#f59e0b;box-shadow:0 0 0 3px #f59e0b22;background:#fff}
.rlt-app .rlt-pname{display:flex;align-items:center;gap:7px;font-size:13px;font-weight:700}
.rlt-app .rlt-dot{width:9px;height:9px;border-radius:50%;flex:0 0 auto}
.rlt-app .rlt-pcard.s0 .rlt-dot{background:#f59e0b}
.rlt-app .rlt-pcard.s1 .rlt-dot{background:#3b82f6}
.rlt-app .rlt-ptag{font-style:normal;font-size:10px;font-weight:800;color:#6b7280;border:1px solid #e5e7eb;border-radius:999px;padding:1px 7px}
.rlt-app .rlt-pbank{font-size:24px;font-weight:800;letter-spacing:.01em;margin-top:2px;font-variant-numeric:tabular-nums}
.rlt-app .rlt-psub{font-size:11.5px;color:#6b7280;margin-top:2px}
.rlt-app .rlt-delta{position:absolute;right:12px;top:10px;pointer-events:none}
.rlt-app .rlt-delta span{display:block;font-weight:800;font-size:15px;animation:rltFloat 1.1s ease-out forwards}
.rlt-app .rlt-delta .pos{color:#059669}
.rlt-app .rlt-delta .neg{color:#dc2626}
@keyframes rltFloat{from{opacity:1;transform:translateY(0)}to{opacity:0;transform:translateY(-26px)}}
.rlt-app .rlt-meta{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;font-size:12px;color:#6b7280;margin-bottom:10px}
.rlt-app .rlt-results{display:flex;gap:4px;flex-wrap:wrap}
.rlt-app .rlt-r{font-style:normal;font-size:10.5px;font-weight:800;color:#fff;border-radius:6px;padding:2px 6px}
.rlt-app .rlt-r.red{background:#dc2626}.rlt-app .rlt-r.black{background:#1f2937}.rlt-app .rlt-r.green{background:#059669}
.rlt-app .rlt-layout{display:flex;flex-wrap:wrap;gap:18px;align-items:flex-start;justify-content:center}
.rlt-app .rlt-left{display:flex;flex-direction:column;align-items:center;gap:12px;flex:0 0 auto}
.rlt-app .rlt-wheel-wrap{position:relative;width:300px;max-width:100%;aspect-ratio:1/1}
.rlt-app .rlt-wheel{width:100%;height:100%;display:block;transition:transform 4.2s cubic-bezier(.17,.84,.26,1)}
.rlt-app .rlt-orbit{position:absolute;inset:0;pointer-events:none;transition:transform 4.2s cubic-bezier(.2,.65,.25,1)}
.rlt-app .rlt-ball{position:absolute;left:50%;top:4%;width:4.6%;aspect-ratio:1/1;margin-left:-2.3%;border-radius:50%;background:radial-gradient(circle at 35% 30%,#fff,#cbd5e1 75%);box-shadow:0 2px 5px rgba(0,0,0,.4)}
.rlt-app .rlt-pointer{position:absolute;top:-6px;left:50%;transform:translateX(-50%);z-index:3}
.rlt-app .rlt-banner{width:300px;max-width:100%;text-align:center;background:#fafafa;border:1px solid #e5e7eb;border-radius:12px;padding:10px 12px;box-sizing:border-box}
.rlt-app .rlt-bn{font-size:20px;font-weight:800;letter-spacing:.03em}
.rlt-app .rlt-bn.red{color:#dc2626}.rlt-app .rlt-bn.black{color:#111827}.rlt-app .rlt-bn.green{color:#059669}
.rlt-app .rlt-bpay{font-size:12.5px;color:#6b7280;margin-top:3px}
.rlt-app .rlt-right{display:flex;flex-direction:column;gap:10px;flex:1 1 320px;max-width:480px;min-width:280px}
.rlt-app .rlt-chips{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.rlt-app .rlt-chiplabel{font-size:11px;font-weight:800;letter-spacing:.09em;color:#9ca3af;text-transform:uppercase}
.rlt-app .rlt-chip{width:44px;height:44px;border-radius:50%;background:#fff;border:3px dashed #d1d5db;color:#111827;font-weight:800;font-size:13px;cursor:pointer;padding:0}
.rlt-app .rlt-chip.sel{outline:3px solid #f59e0b;outline-offset:2px}
.rlt-app .rlt-chip:disabled{opacity:.35;cursor:default}
.rlt-app .rlt-chip.c5{border-color:#f87171}.rlt-app .rlt-chip.c10{border-color:#60a5fa}
.rlt-app .rlt-chip.c25{border-color:#34d399}.rlt-app .rlt-chip.c50{border-color:#fbbf24}.rlt-app .rlt-chip.c100{border-color:#a78bfa}
.rlt-app .rlt-outside{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:4px}
.rlt-app .rlt-out{position:relative;background:#fff;border:1px solid #e5e7eb;border-radius:8px;color:#111827;font-weight:700;font-size:12px;padding:10px 2px;cursor:pointer}
.rlt-app .rlt-out.red{background:#dc2626;color:#fff;border-color:#dc2626}
.rlt-app .rlt-out.black{background:#1f2937;color:#fff;border-color:#1f2937}
.rlt-app .rlt-grid{display:grid;grid-template-columns:repeat(13,minmax(0,1fr));gap:3px}
.rlt-app .rlt-num{position:relative;background:#1f2937;border:1px solid transparent;border-radius:6px;color:#fff;font-weight:700;font-size:12.5px;min-height:36px;cursor:pointer;padding:0}
.rlt-app .rlt-num.red{background:#dc2626}
.rlt-app .rlt-num.zero{background:#059669;grid-column:1;grid-row:1/span 3}
.rlt-app .rlt-num.cur{outline:2px solid #3b82f6;outline-offset:1px}
.rlt-app .rlt-out:not(:disabled):hover,.rlt-app .rlt-num:not(:disabled):hover{filter:brightness(1.12)}
.rlt-app .rlt-amt{position:absolute;top:-7px;right:-4px;background:#f59e0b;color:#fff;font-size:10px;font-weight:800;font-style:normal;border-radius:999px;padding:1px 5px;z-index:1}
.rlt-app .rlt-ctl{display:flex;gap:8px}
.rlt-app .rlt-btn{flex:1;padding:11px 12px;border-radius:10px;border:1px solid #e5e7eb;background:#fff;color:#111827;font-weight:700;font-size:13.5px;cursor:pointer}
.rlt-app .rlt-btn:hover:not(:disabled){background:#f3f4f6}
.rlt-app .rlt-btn.primary{background:#111827;color:#fff;border-color:#111827}
.rlt-app .rlt-btn.primary:hover:not(:disabled){background:#1f2937}
.rlt-app .rlt-btn:disabled{opacity:.4;cursor:default}
.rlt-app .rlt-hint{font-size:11px;color:#9ca3af;line-height:1.6}
.rlt-app kbd{border:1px solid #e5e7eb;border-bottom-width:2px;border-radius:5px;padding:0 5px;font-size:10.5px;background:#fafafa;font-family:inherit}
.rlt-app .rlt-pad{display:none;grid-template-areas:". up ." "left bet right" ". down .";grid-template-columns:repeat(3,56px);gap:6px;justify-content:center;margin-top:4px}
.rlt-app .rlt-pad button{height:48px;border-radius:12px;border:1px solid #e5e7eb;background:#fff;font-size:16px;font-weight:800;cursor:pointer;color:#111827}
.rlt-app .rlt-pad button:disabled{opacity:.4}
.rlt-app .rlt-pad [data-pad="up"]{grid-area:up}.rlt-app .rlt-pad [data-pad="down"]{grid-area:down}
.rlt-app .rlt-pad [data-pad="left"]{grid-area:left}.rlt-app .rlt-pad [data-pad="right"]{grid-area:right}
.rlt-app .rlt-pad [data-pad="bet"]{grid-area:bet;background:#f59e0b;color:#fff;border-color:#f59e0b;font-size:12px}
@media (pointer:coarse),(max-width:720px){.rlt-app .rlt-pad{display:grid}.rlt-app .rlt-hint.desktop{display:none}}
.rlt-app .rlt-ov{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(17,24,39,.45);backdrop-filter:blur(2px);z-index:6;border-radius:14px}
.rlt-app .rlt-card{background:#fff;border-radius:14px;padding:20px;max-width:430px;width:calc(100% - 32px);max-height:92%;overflow:auto;box-shadow:0 10px 30px rgba(0,0,0,.18)}
.rlt-app .rlt-card h3{margin:0 0 10px;font-size:18px}
.rlt-app .rlt-card h4{margin:12px 0 4px;font-size:13px}
.rlt-app .rlt-card p,.rlt-app .rlt-card li{font-size:12.5px;color:#374151;line-height:1.65;margin:4px 0}
.rlt-app .rlt-card ul{padding-left:18px;margin:4px 0}
.rlt-app .rlt-cheats{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:10px}
.rlt-app .rlt-cheats button{padding:10px;border-radius:10px;border:1px solid #e5e7eb;background:#fafafa;font-weight:700;font-size:12px;cursor:pointer;color:#111827}
.rlt-app .rlt-cheats button:hover{background:#f3f4f6}
.rlt-app .rlt-peek{margin-top:10px;font-size:12.5px;color:#6b7280}
.rlt-app .rlt-ovbtns{display:flex;gap:8px;margin-top:14px}
.rlt-app .rlt-win{color:#059669}.rlt-app .rlt-lose{color:#dc2626}
</style>
<div class="game-app rlt-app">
  <div class="game-intro">
    <div><h2>Roulette Duel</h2><p data-level>Memuat level…</p></div>
    <span class="game-status"><i class="game-status-dot"></i><span data-status>Ready</span></span>
  </div>
  <section class="game-panel rlt-stage" data-board>
    <div class="rlt-players">
      <div class="rlt-pcard s0" data-pc="0">
        <div class="rlt-pname"><i class="rlt-dot"></i><b data-pname>P1</b><em class="rlt-ptag" data-ptag>P1</em></div>
        <div class="rlt-pbank"><span data-bank>0</span></div>
        <div class="rlt-psub">Putaran <span data-spins>0/0</span> · Di meja <span data-table>0</span></div>
        <span class="rlt-delta" data-delta></span>
      </div>
      <div class="rlt-pcard s1" data-pc="1">
        <div class="rlt-pname"><i class="rlt-dot"></i><b data-pname>P2</b><em class="rlt-ptag" data-ptag>P2</em></div>
        <div class="rlt-pbank"><span data-bank>0</span></div>
        <div class="rlt-psub">Putaran <span data-spins>0/0</span> · Di meja <span data-table>0</span></div>
        <span class="rlt-delta" data-delta></span>
      </div>
    </div>
    <div class="rlt-meta"><span data-flip></span><span class="rlt-results" data-results></span></div>
    <div class="rlt-layout">
      <div class="rlt-left">
        <div class="rlt-wheel-wrap">
          <svg class="rlt-wheel" viewBox="-200 -200 400 400" data-el="wheel" aria-label="Roda roulette"></svg>
          <div class="rlt-orbit" data-el="orbit"><div class="rlt-ball"></div></div>
          <div class="rlt-pointer"><svg viewBox="0 0 30 34" width="24" height="28" aria-hidden="true"><path d="M3 3h24L15 31z" fill="#f59e0b" stroke="#92400e" stroke-width="2.5" stroke-linejoin="round"/></svg></div>
        </div>
        <div class="rlt-banner">
          <div class="rlt-bn" data-el="bNum">Pasang taruhan</div>
          <div class="rlt-bpay" data-el="bPay">Pilih chip, klik meja, lalu putar</div>
        </div>
      </div>
      <div class="rlt-right">
        <div class="rlt-chips" data-el="chips"><span class="rlt-chiplabel">Chip</span></div>
        <div class="rlt-outside" data-el="outside"></div>
        <div class="rlt-grid" data-el="grid"></div>
        <div class="rlt-ctl">
          <button class="rlt-btn primary" type="button" data-act="spin" disabled>Putar</button>
          <button class="rlt-btn" type="button" data-act="undo" disabled>Undo</button>
          <button class="rlt-btn" type="button" data-act="clear" disabled>Bersihkan</button>
        </div>
        <div class="rlt-pad">
          <button type="button" data-pad="up">▲</button>
          <button type="button" data-pad="left">◀</button>
          <button type="button" data-pad="bet">Pasang</button>
          <button type="button" data-pad="right">▶</button>
          <button type="button" data-pad="down">▼</button>
        </div>
        <div class="rlt-hint desktop">Desktop: <kbd>1–4</kbd> chip · <kbd>R</kbd>/<kbd>B</kbd>/<kbd>E</kbd>/<kbd>O</kbd>/<kbd>L</kbd>/<kbd>H</kbd> taruhan luar · <kbd>←↑↓→</kbd>+<kbd>Enter</kbd> pasang di angka · <kbd>Spasi</kbd> putar · <kbd>U</kbd> undo · <kbd>C</kbd> bersihkan · <kbd>T</kbd> bantuan · <kbd>X</kbd> cheat · klik kanan = tarik chip.</div>
        <div class="rlt-hint">Mobile: gunakan D-pad untuk memilih angka, lalu tekan Pasang.</div>
      </div>
    </div>

    <div class="rlt-ov" data-ov="help" hidden>
      <div class="rlt-card">
        <h3>Cara main</h3>
        <h4>Tujuan</h4>
        <p>Setiap sesi memakai <b>level acak</b> (modal awal, target, chip, dan batas putaran). Capai <b>target</b> sebelum putaranmu habis. Lawan bangkrut (bankroll &lt; min bet) = kamu menang. Jika kedua pemain kehabisan putaran, bankroll tertinggi menang.</p>
        <h4>Taruhan &amp; bayaran</h4>
        <ul>
          <li>Merah / Hitam / Genap / Ganjil / 1–18 / 19–36 → 1:1 (stake ×2 kembali).</li>
          <li>Angka tunggal (0–36) → mengembalikan 35× stake.</li>
          <li>Angka 0 mengalahkan semua taruhan luar.</li>
        </ul>
        <h4>Giliran</h4>
        <p>Undian koin menentukan siapa jalan duluan, dan posisimu (P1/P2) juga diundi acak setiap game. Pemain bergantian memasang chip lalu memutar roda.</p>
        <h4>Kontrol</h4>
        <ul>
          <li>Mouse: klik chip → klik meja. Klik kanan pada kotak = tarik chip terakhir. Scroll di baris chip = ganti chip.</li>
          <li>Keyboard: 1–4 pilih chip, R/B/E/O/L/H taruhan luar, panah + Enter untuk angka, Spasi putar, U undo, C bersihkan, T bantuan, X cheat.</li>
          <li>Mobile: D-pad virtual + tombol Pasang muncul otomatis di layar sentuh / sempit.</li>
        </ul>
        <h4>Level yang adil</h4>
        <p>Generator menjamin target ≤ 3× modal dan budget putaran ≥ kebutuhan minimum + cadangan, jadi setiap level selalu bisa diselesaikan.</p>
        <div class="rlt-ovbtns"><button class="rlt-btn primary" type="button" data-act="close-help">Mengerti</button></div>
      </div>
    </div>

    <div class="rlt-ov" data-ov="cheat" hidden>
      <div class="rlt-card">
        <h3>Cheat 🃏</h3>
        <p>Hanya untuk mode lokal / host. memakai cheat menandai sesi ini sebagai "cheated".</p>
        <div class="rlt-cheats">
          <button type="button" data-cheat="cash">+100 chip</button>
          <button type="button" data-cheat="near">Bankroll ≈ target</button>
          <button type="button" data-cheat="rig">Rig putaran berikutnya</button>
          <button type="button" data-cheat="peek">Intip angka berikutnya</button>
          <button type="button" data-cheat="turn">Paksa giliranmu</button>
          <button type="button" data-cheat="win">Menang instan</button>
        </div>
        <div class="rlt-peek" data-el="peek"></div>
        <div class="rlt-ovbtns"><button class="rlt-btn" type="button" data-act="close-cheat">Tutup</button></div>
      </div>
    </div>

    <div class="rlt-ov" data-ov="over" hidden>
      <div class="rlt-card">
        <h3 data-el="ovTitle">Game over</h3>
        <p data-el="ovSub"></p>
        <div class="rlt-ovbtns"><button class="rlt-btn primary" type="button" data-act="restart">Main lagi (level baru)</button></div>
      </div>
    </div>
  </section>
  <div class="game-actions">
    <button class="game-action-button" type="button" data-act="help">Cara main</button>
    <button class="game-action-button" type="button" data-act="cheat" data-el="cheatBtn">Cheat</button>
    <button class="game-action-button" type="button" data-act="restart">Level baru</button>
    <button class="game-action-button" type="button" data-exit>Exit game</button>
  </div>
</div>`;

    /* ---------------- refs ---------------- */
    const $ = (s) => root.querySelector(s);
    const $$ = (s) => Array.prototype.slice.call(root.querySelectorAll(s));
    const statusEl = $("[data-status]"), levelEl = $("[data-level]"), flipEl = $("[data-flip]"), resultsEl = $("[data-results]");
    const wheelSvg = $('[data-el="wheel"]'), orbit = $('[data-el="orbit"]');
    const bNum = $('[data-el="bNum"]'), bPay = $('[data-el="bPay"]');
    const chipsEl = $('[data-el="chips"]'), outsideEl = $('[data-el="outside"]'), gridEl = $('[data-el="grid"]');
    const cardEls = $$("[data-pc]"), nameEls = $$("[data-pname]"), tagEls = $$("[data-ptag]");
    const bankEls = $$("[data-bank]"), spinsEls = $$("[data-spins]"), tableEls = $$("[data-table]"), deltaEls = $$("[data-delta]");
    const spinBtn = $('[data-act="spin"]'), undoBtn = $('[data-act="undo"]'), clearBtn = $('[data-act="clear"]');
    const padBetBtn = $('[data-pad="bet"]'), cheatBtn = $('[data-el="cheatBtn"]'), peekEl = $('[data-el="peek"]');
    const ovHelp = $('[data-ov="help"]'), ovCheat = $('[data-ov="cheat"]'), ovOver = $('[data-ov="over"]');
    const ovTitle = $('[data-el="ovTitle"]'), ovSub = $('[data-el="ovSub"]');
    const show = (el) => el.removeAttribute("hidden");
    const hide = (el) => el.setAttribute("hidden", "");
    if (!canCheat) hide(cheatBtn);

    /* ---------------- roda (SVG) ---------------- */
    const STEP = 360 / WHEEL_ORDER.length;
    {
        const P = (r, deg) => {
            const a = (deg * Math.PI) / 180;
            return (r * Math.sin(a)).toFixed(2) + " " + (-r * Math.cos(a)).toFixed(2);
        };
        let s = '<circle r="197" fill="#e5e7eb"/>';
        for (let i = 0; i < WHEEL_ORDER.length; i++) {
            const col = pocketColor(WHEEL_ORDER[i]);
            const fill = col === "green" ? "#059669" : col === "red" ? "#dc2626" : "#1f2937";
            s += '<path d="M0 0 L' + P(186, i * STEP - STEP / 2) + " A186 186 0 0 1 " + P(186, i * STEP + STEP / 2) + ' Z" fill="' + fill + '" stroke="#ffffff" stroke-width="1"/>';
        }
        s += '<circle r="186" fill="none" stroke="#9ca3af" stroke-width="3"/>';
        for (let i = 0; i < WHEEL_ORDER.length; i++) {
            s += '<g transform="rotate(' + (i * STEP).toFixed(3) + ')"><text x="0" y="-152" font-size="16" font-weight="700" text-anchor="middle" font-family="inherit" fill="#fff">' + WHEEL_ORDER[i] + "</text></g>";
        }
        s += '<circle r="100" fill="#f9fafb" stroke="#d1d5db" stroke-width="2"/>';
        for (let k = 0; k < 4; k++) {
            s += '<path d="M-6 -97h12l-3 50h-6z" fill="#e5e7eb" stroke="#9ca3af" stroke-width="1" transform="rotate(' + k * 90 + ')"/>';
        }
        s += '<circle r="40" fill="#fff" stroke="#f59e0b" stroke-width="3"/><circle r="15" fill="#f59e0b"/>';
        wheelSvg.innerHTML = s;
    }

    /* ---------------- meja taruhan ---------------- */
    {
        let oh = "";
        OUTSIDE.forEach((o) => {
            oh += '<button type="button" class="rlt-out ' + (o.cls || "") + '" data-spot="' + o.id + '">' + o.label + '<i class="rlt-amt" hidden></i></button>';
        });
        outsideEl.innerHTML = oh;
        let gh = '<button type="button" class="rlt-num zero" data-spot="n0">0<i class="rlt-amt" hidden></i></button>';
        for (let row = 0; row < 3; row++) {
            for (let col = 1; col <= 12; col++) {
                const n = col * 3 - row;
                gh += '<button type="button" class="rlt-num ' + pocketColor(n) + '" data-spot="n' + n + '">' + n + '<i class="rlt-amt" hidden></i></button>';
            }
        }
        gridEl.innerHTML = gh;
    }
    const spotBtns = {};
    $$("[data-spot]").forEach((b) => { spotBtns[b.dataset.spot] = { btn: b, amt: b.querySelector(".rlt-amt") }; });
    let chipBtns = [];

    /* ---------------- util ---------------- */
    const mySeat = () => state.seats[playerIndex];
    const seatName = (s) => (s === mySeat() ? "Kamu" : online ? "Lawan" : "Bot");
    const tableTotal = (s) => Object.values(state.bets[s]).reduce((t, b) => t + b.amount, 0);
    const cursorSpot = () => (cursor.col === 0 ? "n0" : "n" + (cursor.col * 3 - cursor.row));
    const canPlaySeat = (s) => state.banks[s] >= state.level.minBet && state.spins[s] < state.level.limit;

    function clearTimers() {
        if (settleTimer) { clearTimeout(settleTimer); settleTimer = 0; }
        if (botTimer) { clearTimeout(botTimer); botTimer = 0; }
    }

    /* ---------------- animasi uang ---------------- */
    function spawnDelta(seat, d) {
        const span = document.createElement("span");
        span.className = d > 0 ? "pos" : "neg";
        span.textContent = d > 0 ? "+" + d : "−" + -d;
        deltaEls[seat].appendChild(span);
        span.addEventListener("animationend", () => span.remove(), { once: true });
    }
    function tweenBank(seat, from, to) {
        cancelAnimationFrame(bankRaf[seat]);
        const t0 = performance.now(), dur = 650;
        const step = (t) => {
            const k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 3);
            shownBanks[seat] = Math.round(from + (to - from) * e);
            bankEls[seat].textContent = String(shownBanks[seat]);
            if (k < 1) bankRaf[seat] = requestAnimationFrame(step);
        };
        bankRaf[seat] = requestAnimationFrame(step);
    }

    /* ---------------- animasi roda ---------------- */
    function snapWheel() {
        wheelSvg.style.transition = "none"; orbit.style.transition = "none";
        wheelSvg.style.transform = "rotate(" + wheelRot + "deg)";
        orbit.style.transform = "rotate(" + ballRot + "deg)";
        wheelSvg.getBoundingClientRect(); orbit.getBoundingClientRect();
        wheelSvg.style.transition = ""; orbit.style.transition = "";
    }
    function animateSpin(idx) {
        const target = (360 - idx * STEP) % 360;
        const cur = ((wheelRot % 360) + 360) % 360;
        let delta = target - cur;
        if (delta <= 0) delta += 360;
        wheelRot += delta + 360 * 4;
        wheelSvg.style.transform = "rotate(" + wheelRot + "deg)";
        const curB = ((ballRot % 360) + 360) % 360;
        ballRot -= curB + 360 * 4;
        orbit.style.transform = "rotate(" + ballRot + "deg)";
    }

    /* ---------------- render ---------------- */
    function render() {
        if (!state) { statusEl.textContent = "Menunggu host…"; return; }
        const st = state, L = st.level, me = mySeat();
        const myTurn = st.phase === "bet" && st.turn === me;
        const myBets = st.bets[me];

        levelEl.textContent = "Level " + (L.seed % 1000) + " · Modal " + L.start + " → Target " + L.target + " · Min bet " + L.minBet + " · " + L.limit + " putaran/pemain";
        flipEl.textContent = "Undian: " + seatName(st.first) + " jalan duluan · Kamu " + (me === 0 ? "P1" : "P2");
        statusEl.textContent =
            st.phase === "over" ? (st.winner === -1 ? "Seri" : st.winner === me ? "Kamu menang!" : "Kamu kalah") :
                st.phase === "spinning" ? "Roda berputar…" :
                    myTurn ? "Giliranmu — pasang taruhan" : online ? "Giliran lawan…" : "Bot sedang berpikir…";

        /* chip (rebuild hanya jika level berubah) */
        const key = L.chips.join(",");
        if (key !== lastChipsKey) {
            let ch = '<span class="rlt-chiplabel">Chip</span>';
            L.chips.forEach((v) => { ch += '<button type="button" class="rlt-chip c' + v + '" data-chip="' + v + '">' + v + "</button>"; });
            chipsEl.innerHTML = ch;
            chipBtns = $$("[data-chip]");
            lastChipsKey = key;
        }
        if (L.chips.indexOf(chip) < 0) chip = L.chips[0];
        if (myTurn && st.banks[me] < chip) {
            const afford = L.chips.filter((v) => v <= st.banks[me]);
            if (afford.length) chip = afford[afford.length - 1];
        }
        chipBtns.forEach((b) => {
            b.classList.toggle("sel", +b.dataset.chip === chip);
            b.disabled = !myTurn || st.banks[me] < +b.dataset.chip;
        });

        /* badge taruhan milikku + kursor */
        const cur = cursorSpot();
        Object.keys(spotBtns).forEach((k) => {
            const ui = spotBtns[k], b = myBets[k];
            if (b && b.amount > 0) { ui.amt.textContent = String(b.amount); ui.amt.removeAttribute("hidden"); }
            else ui.amt.setAttribute("hidden", "");
            ui.btn.classList.toggle("cur", k === cur && k[0] === "n");
            ui.btn.disabled = !myTurn;
        });

        /* kartu pemain + animasi uang */
        const sessionSame = st.session === lastSession;
        for (let s = 0; s < 2; s++) {
            nameEls[s].textContent = seatName(s);
            tagEls[s].textContent = s === 0 ? "P1" : "P2";
            cardEls[s].classList.toggle("turn", st.phase === "bet" && st.turn === s);
            spinsEls[s].textContent = st.spins[s] + "/" + L.limit;
            tableEls[s].textContent = String(tableTotal(s));
            if (sessionSame && prevBanks && prevBanks[s] !== st.banks[s]) {
                spawnDelta(s, st.banks[s] - prevBanks[s]);
                tweenBank(s, shownBanks[s], st.banks[s]);
            } else if (!sessionSame || !prevBanks) {
                cancelAnimationFrame(bankRaf[s]);
                shownBanks[s] = st.banks[s];
                bankEls[s].textContent = String(st.banks[s]);
            }
        }
        prevBanks = st.banks.slice();

        /* roda & banner */
        if (!sessionSame) { wheelRot = 0; ballRot = 0; lastSpinId = 0; snapWheel(); }
        lastSession = st.session;
        if (st.spin && st.spin.id !== lastSpinId) { lastSpinId = st.spin.id; animateSpin(st.spin.idx); }
        if (st.phase === "spinning") {
            bNum.textContent = "No more bets"; bNum.className = "rlt-bn";
            bPay.textContent = "Roda berputar…";
        } else if (st.last) {
            const c = pocketColor(st.last.n);
            bNum.textContent = st.last.n + " " + (c === "red" ? "MERAH" : c === "black" ? "HITAM" : "HIJAU");
            bNum.className = "rlt-bn " + c;
            bPay.textContent = st.last.ret > 0
                ? seatName(st.last.seat) + " dibayar " + st.last.ret + " (net " + (st.last.delta >= 0 ? "+" : "") + st.last.delta + ")"
                : seatName(st.last.seat) + ": tidak ada taruhan menang";
        } else {
            bNum.textContent = "Pasang taruhan"; bNum.className = "rlt-bn";
            bPay.textContent = "Pilih chip, klik meja, lalu putar";
        }
        resultsEl.innerHTML = st.results.map((n) => '<i class="rlt-r ' + pocketColor(n) + '">' + n + "</i>").join("");

        /* tombol */
        const stake = tableTotal(me);
        spinBtn.disabled = !myTurn || stake === 0;
        spinBtn.textContent = stake > 0 ? "Putar · " + stake : "Putar";
        undoBtn.disabled = clearBtn.disabled = !myTurn || stake === 0;
        padBetBtn.disabled = !myTurn || st.banks[me] < chip;

        /* overlay */
        helpOpen ? show(ovHelp) : hide(ovHelp);
        cheatOpen && canCheat ? show(ovCheat) : hide(ovCheat);
        peekEl.textContent = peekOn ? "Angka berikutnya: " + st.nextN + " (" + pocketColor(st.nextN) + ")" : "";
        if (st.phase === "over") {
            ovTitle.textContent = st.winner === -1 ? "Seri 🤝" : st.winner === me ? "Kamu menang 🎉" : "Kamu kalah";
            ovTitle.className = st.winner === me ? "rlt-win" : "rlt-lose";
            ovSub.textContent = st.reason + " Bankroll akhir: kamu " + st.banks[me] + ", " + seatName(1 - me) + " " + st.banks[1 - me] + "." + (st.cheated ? " (cheat aktif)" : "");
            show(ovOver);
            if (savedSession !== st.session) {
                savedSession = st.session;
                try {
                    const best = +localStorage.getItem(META.bestKey) || 0;
                    if (st.banks[me] > best) localStorage.setItem(META.bestKey, String(st.banks[me]));
                } catch (_) { }
            }
        } else hide(ovOver);

        ensureBot();
    }

    function publish() {
        render();
        if (online && room.isHost) room.publishState(state).catch(console.warn);
    }

    /* ---------------- aksi (host-authoritative) ---------------- */
    function applyAction(a, actor) {
        if (!state || !a || typeof a.t !== "string") return;
        const seat = state.seats[actor];
        const L = state.level;

        if (a.t === "restart") {
            clearTimers();
            peekOn = false;
            state = freshState(typeof a.seed === "number" ? a.seed : randSeed());
            publish();
            return;
        }
        if (a.t === "settle") {
            if (actor !== 0 || state.phase !== "spinning" || !state.spin) return;
            const s = state.spin.seat, n = state.spin.n, b = state.bets[s];
            let ret = 0, stake = 0;
            Object.values(b).forEach((x) => { ret += payout(x.type, x.amount, n, x.num); stake += x.amount; });
            state.banks[s] += ret;
            state.spins[s]++;
            state.last = { n, seat: s, ret, stake, delta: ret - stake };
            state.results.unshift(n);
            state.results = state.results.slice(0, 12);
            state.bets[s] = {}; state.hist[s] = [];
            state.spin = null; state.phase = "bet";
            const other = 1 - s;
            const end = (w, reason) => { state.winner = w; state.reason = reason; state.phase = "over"; };
            if (state.banks[s] >= L.target) end(s, "P" + (s + 1) + " mencapai target " + L.target + ".");
            else if (state.banks[s] < L.minBet) end(other, "P" + (s + 1) + " bangkrut (bankroll < " + L.minBet + ").");
            else if (!canPlaySeat(s) && !canPlaySeat(other)) {
                const w = state.banks[0] === state.banks[1] ? -1 : state.banks[0] > state.banks[1] ? 0 : 1;
                end(w, "Budget putaran habis — bankroll tertinggi menang.");
            } else state.turn = canPlaySeat(other) ? other : s;
            publish();
            return;
        }
        if (a.t === "cheat") {
            if (actor !== 0 || !canCheat || state.phase === "over") return;
            const k = a.kind;
            if (k === "cash") state.banks[seat] += 100;
            else if (k === "near") state.banks[seat] = Math.max(state.banks[seat], L.target - 25);
            else if (k === "rig" && state.phase === "bet") state.rig = seat;
            else if (k === "turn" && state.phase === "bet") state.turn = seat;
            else if (k === "win") { state.winner = seat; state.reason = "Cheat: menang instan."; state.phase = "over"; }
            else return;
            state.cheated = true;
            publish();
            return;
        }

        /* aksi taruhan: hanya saat giliran sendiri & fase bet */
        if (state.phase !== "bet" || state.turn !== seat) return;

        if (a.t === "bet") {
            const cv = a.chip;
            if (!validSpot(a.spot) || L.chips.indexOf(cv) < 0 || cv > state.banks[seat]) return;
            const d = a.spot[0] === "n" ? { type: "number", num: +a.spot.slice(1) } : { type: a.spot, num: -1 };
            const b = state.bets[seat];
            if (b[a.spot]) b[a.spot].amount += cv;
            else b[a.spot] = { type: d.type, num: d.num, amount: cv };
            state.banks[seat] -= cv;
            state.hist[seat].push({ spot: a.spot, val: cv });
        } else if (a.t === "undo") {
            const h = state.hist[seat];
            if (!h.length) return;
            const last = h.pop(), b = state.bets[seat][last.spot];
            if (b) { b.amount -= last.val; if (b.amount <= 0) delete state.bets[seat][last.spot]; }
            state.banks[seat] += last.val;
        } else if (a.t === "remove") {
            const h = state.hist[seat];
            for (let i = h.length - 1; i >= 0; i--) {
                if (h[i].spot === a.spot) {
                    const val = h[i].val; h.splice(i, 1);
                    const b = state.bets[seat][a.spot];
                    if (b) { b.amount -= val; if (b.amount <= 0) delete state.bets[seat][a.spot]; }
                    state.banks[seat] += val;
                    break;
                }
            }
        } else if (a.t === "clear") {
            state.banks[seat] += tableTotal(seat);
            state.bets[seat] = {}; state.hist[seat] = [];
        } else if (a.t === "spin") {
            if (!Object.keys(state.bets[seat]).length) return;
            const n = state.rig === seat ? bestPocket(state.bets[seat]) : state.nextN;
            state.spinSeq++;
            state.spin = { id: state.spinSeq, n, idx: WHEEL_ORDER.indexOf(n), seat };
            state.rig = null;
            state.nextN = randPocket();
            state.phase = "spinning";
        } else return;

        publish();
        if (a.t === "spin" && state.phase === "spinning") {
            if (settleTimer) clearTimeout(settleTimer);
            settleTimer = setTimeout(() => { settleTimer = 0; applyAction({ t: "settle" }, 0); }, SPIN_MS);
        }
    }

    function submitAction(action) {
        if (online && !room.isHost) { room.sendAction(action).catch(console.warn); return; }
        applyAction(action, playerIndex);
    }

    /* ---------------- bot (mode AI) ---------------- */
    function ensureBot() {
        if (online || !state || botTimer) return;
        if (state.phase === "bet" && state.turn === state.seats[1]) {
            botTimer = setTimeout(botStep, 800 + Math.random() * 600);
        }
    }
    function botStep() {
        botTimer = 0;
        if (!state || state.phase !== "bet") return;
        const seat = state.seats[1];
        if (state.turn !== seat) return;
        const bank = state.banks[seat], staked = tableTotal(seat);
        const desired = Math.max(state.level.minBet, Math.min(bank + staked, Math.round((bank + staked) * 0.15 / state.level.minBet) * state.level.minBet));
        if (staked >= desired || staked >= bank) { applyAction({ t: "spin" }, 1); return; }
        const remain = Math.min(desired - staked, bank);
        const afford = state.level.chips.filter((v) => v <= remain);
        if (!afford.length) { applyAction({ t: "spin" }, 1); return; }
        const cv = afford[afford.length - 1];
        const spot = Math.random() < 0.65
            ? OUTSIDE[Math.floor(Math.random() * OUTSIDE.length)].id
            : "n" + Math.floor(Math.random() * 37);
        applyAction({ t: "bet", spot, chip: cv }, 1);
    }

    /* ---------------- input: mouse / touch ---------------- */
    function moveCursor(dx, dy) {
        cursor.col = Math.max(0, Math.min(12, cursor.col + dx));
        cursor.row = Math.max(0, Math.min(2, cursor.row + dy));
        render();
    }
    function handleClick(event) {
        const t = event.target;
        if (t.closest("[data-exit]")) { onExit(); return; }
        const pad = t.closest("[data-pad]");
        if (pad) {
            const d = pad.dataset.pad;
            if (d === "up") moveCursor(0, -1);
            else if (d === "down") moveCursor(0, 1);
            else if (d === "left") moveCursor(-1, 0);
            else if (d === "right") moveCursor(1, 0);
            else if (d === "bet" && state) submitAction({ t: "bet", spot: cursorSpot(), chip });
            return;
        }
        const spot = t.closest("[data-spot]");
        if (spot && !spot.disabled) { submitAction({ t: "bet", spot: spot.dataset.spot, chip }); return; }
        const cb = t.closest("[data-chip]");
        if (cb && !cb.disabled) { chip = +cb.dataset.chip; render(); return; }
        const ch = t.closest("[data-cheat]");
        if (ch && canCheat) {
            if (ch.dataset.cheat === "peek") { peekOn = !peekOn; render(); }
            else submitAction({ t: "cheat", kind: ch.dataset.cheat });
            return;
        }
        const b = t.closest("[data-act]");
        if (!b) return;
        const act = b.dataset.act;
        if (act === "help") { helpOpen = !helpOpen; cheatOpen = false; render(); }
        else if (act === "cheat" && canCheat) { cheatOpen = !cheatOpen; helpOpen = false; render(); }
        else if (act === "close-help") { helpOpen = false; render(); }
        else if (act === "close-cheat") { cheatOpen = false; render(); }
        else if (act === "restart") submitAction({ t: "restart" });
        else if (act === "spin") submitAction({ t: "spin" });
        else if (act === "undo") submitAction({ t: "undo" });
        else if (act === "clear") submitAction({ t: "clear" });
    }
    function handleContext(event) {
        const spot = event.target.closest("[data-spot]");
        if (spot) { event.preventDefault(); submitAction({ t: "remove", spot: spot.dataset.spot }); }
    }
    function handleWheel(event) {
        if (!state || !event.target.closest('[data-el="chips"]')) return;
        event.preventDefault();
        const arr = state.level.chips, i = arr.indexOf(chip);
        chip = arr[(i + (event.deltaY > 0 ? 1 : -1) + arr.length) % arr.length];
        render();
    }

    /* ---------------- input: keyboard ---------------- */
    function handleKey(e) {
        if (!root.isConnected || !state) return;
        const tag = (e.target.tagName || "").toLowerCase();
        if (tag === "input" || tag === "textarea") return;
        if (e.code === "Escape") { helpOpen = false; cheatOpen = false; render(); return; }
        if (e.code === "KeyT") { helpOpen = !helpOpen; cheatOpen = false; render(); return; }
        if (e.code === "KeyX" && canCheat) { cheatOpen = !cheatOpen; helpOpen = false; render(); return; }
        if (helpOpen || cheatOpen || state.phase === "over") return;
        const outsideKeys = { KeyR: "red", KeyB: "black", KeyE: "even", KeyO: "odd", KeyL: "low", KeyH: "high" };
        if (e.code === "Space") { e.preventDefault(); if (!e.repeat) submitAction({ t: "spin" }); return; }
        if (/^Digit[1-4]$/.test(e.code)) {
            const v = state.level.chips[+e.code.slice(5) - 1];
            if (v != null) { chip = v; render(); }
            return;
        }
        if (outsideKeys[e.code]) { submitAction({ t: "bet", spot: outsideKeys[e.code], chip }); return; }
        if (e.code === "KeyC") { submitAction({ t: "clear" }); return; }
        if (e.code === "KeyU" || e.code === "Backspace") { e.preventDefault(); submitAction({ t: "undo" }); return; }
        if (e.code === "ArrowLeft") { e.preventDefault(); moveCursor(-1, 0); return; }
        if (e.code === "ArrowRight") { e.preventDefault(); moveCursor(1, 0); return; }
        if (e.code === "ArrowUp") { e.preventDefault(); moveCursor(0, -1); return; }
        if (e.code === "ArrowDown") { e.preventDefault(); moveCursor(0, 1); return; }
        if (e.code === "Enter") { submitAction({ t: "bet", spot: cursorSpot(), chip }); }
    }

    root.addEventListener("click", handleClick);
    root.addEventListener("contextmenu", handleContext);
    root.addEventListener("wheel", handleWheel, { passive: false });
    document.addEventListener("keydown", handleKey);

    /* ---------------- wiring mode ---------------- */
    if (online) {
        offs.push(room.onRoom((nextRoom) => { roomData = nextRoom; render(); }));
        if (room.isHost) {
            state = freshState(randSeed());
            publish();
            offs.push(room.onAction((action) => applyAction(action, 1)));
        } else {
            offs.push(room.onState((nextState) => { state = nextState; render(); }));
        }
    } else {
        state = freshState(randSeed());
    }
    render();

    return {
        destroy() {
            root.removeEventListener("click", handleClick);
            root.removeEventListener("contextmenu", handleContext);
            root.removeEventListener("wheel", handleWheel);
            document.removeEventListener("keydown", handleKey);
            clearTimers();
            cancelAnimationFrame(bankRaf[0]);
            cancelAnimationFrame(bankRaf[1]);
            offs.forEach((off) => { if (typeof off === "function") off(); });
            state = null;
        },
    };
}