/* ==== GAME: escape-room.js ==== */
/* Escape Room — balapan keluar ruangan (solo vs bot / online 2 pemain).
   Level dibangkitkan acak & divalidasi selalu bisa diselesaikan.        */

export const META = {
    id: "escape-room", // harus sama dengan nama file (tanpa .js)
    name: "Escape Room",
    category: "adventure",
    catLabel: "Adventure",
    desc: "Ruang terkunci dengan kode acak — balapan melawan bot atau teman untuk keluar lebih dulu.",
    art: '<svg viewBox="0 0 48 48" width="54" height="54" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="26" y="8" width="16" height="32" rx="2"/><circle cx="38" cy="26" r="1.6"/><path d="M26 14H8M6 14v-4h2v4"/><circle cx="16" cy="28" r="8"/><path d="M16 24v4l3 2"/></svg>',
    bg: ["#99f6e4", "#2dd4bf"],
    bestKey: "escapeRoomBest",
};

/* ---------------- aturan murni ---------------- */
const AP_TURN = 3;
const MAX_ROUNDS = 30;
const LEVELS = 5;
const LEVEL_NAME = ["Ruang Belajar", "Kantor", "Arsip", "Galeri", "Brankas Bawah Tanah"];
const CARRIER_LABEL = { clock: "Jam", books: "Buku merah", blooms: "Bunga", desk: "Laci meja", vent: "Ventilasi", safe: "Brankas", poster: "Poster" };
const CARRIER_ICON = { clock: "◷", books: "▤", blooms: "✿", desk: "▭", vent: "▦", safe: "▣", poster: "▧" };
const OBJ_LABEL = { door: "pintu", painting: "lukisan", poster: "poster", clock: "jam", books: "rak buku", blooms: "tanaman", desk: "laci meja", vent: "ventilasi", safe: "brankas", rug: "karpet", sofa: "sofa", bin: "tempat sampah" };
const ITEM_LABEL = { key: "Kunci", screwdriver: "Obeng", crowbar: "Linggis", uv: "Senter UV" };
const CONTAINER_REQ = { desk: "key", vent: "screwdriver", safe: "crowbar" };
const FREE_SOURCES = ["rug", "sofa", "bin"];
const FREE_CARRIERS = ["clock", "books", "blooms"];
const NAV_ORDER = ["painting", "poster", "clock", "books", "vent", "desk", "safe", "blooms", "sofa", "bin", "rug", "door"];
const BLOOM_POS = [[524, 262], [548, 252], [572, 254], [596, 264], [536, 240], [566, 236], [590, 242], [548, 228], [578, 226]];

function mulberry32(a) {
    return function () {
        a |= 0; a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
const ri = (rng, n) => Math.floor(rng() * n);
const pick = (rng, arr) => arr[ri(rng, arr.length)];
function shuffle(rng, arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) { const j = ri(rng, i + 1);[a[i], a[j]] = [a[j], a[i]]; }
    return a;
}

/* Teks petunjuk: level tinggi memakai sandi aritmetika, bukan angka langsung. */
function clueFor(rng, carrier, digit, level) {
    if (carrier === "clock") return { digit, text: "Jam berhenti tepat di angka " + digit + "." };
    if (carrier === "books") return { digit, text: digit + " punggung buku berwarna merah." };
    if (carrier === "blooms") return { digit, text: digit + " bunga sedang mekar." };
    if (carrier === "poster") {
        return level >= 5
            ? { digit, text: "Coretan UV: " + "|".repeat(digit) + " (" + digit + " goresan)." }
            : { digit, text: "Tinta UV memunculkan angka " + digit + "." };
    }
    if (level <= 1) return { digit, text: "Secarik kertas: angka " + digit + "." };
    const r = rng();
    if (r < 0.45) { const a = ri(rng, digit + 1); return { digit, text: "Catatan: '" + a + " + " + (digit - a) + "'." }; }
    if (r < 0.8 || level < 3) { const b = 1 + ri(rng, 9); return { digit, text: "Catatan: '" + (digit + b) + " − " + b + "'." }; }
    return { digit, text: "Catatan: 'setengah dari " + digit * 2 + "'." };
}

/* Generator level: rantai item dibangun mundur sehingga pasti solvable. */
function genLayout(level, seed) {
    const rng = mulberry32(seed);
    const containers = ["desk"];
    if (level >= 2) containers.push("vent");
    if (level >= 3) containers.push("safe");
    const poster = level >= 4;
    const contents = { desk: {}, vent: {}, safe: {} };
    if (level >= 2) contents.desk.item = "screwdriver";
    if (level >= 3) contents.vent.item = "crowbar";
    if (poster) contents.safe.item = "uv";
    const lockedPool = containers.concat(poster ? ["poster"] : []);
    let carriers = poster ? ["poster"] : [];
    carriers.push(pick(rng, containers)); // minimal satu digit di dalam wadah
    const rest = shuffle(rng, FREE_CARRIERS.concat(lockedPool.filter((c) => !carriers.includes(c))));
    for (const c of rest) { if (carriers.length >= 4) break; carriers.push(c); }
    carriers = shuffle(rng, carriers);
    const order = shuffle(rng, carriers);
    const clues = {};
    for (const c of carriers) clues[c] = clueFor(rng, c, 1 + ri(rng, 9), level);
    const code = order.map((c) => clues[c].digit).join("");
    const orderLoc = level === 1 ? "painting" : pick(rng, containers);
    for (const c of containers) {
        if (c === orderLoc) contents[c].order = true;
        if (carriers.includes(c)) contents[c].clue = true;
    }
    return { level, seed, containers, poster, contents, carriers, order, clues, code, orderLoc, keySource: pick(rng, FREE_SOURCES) };
}

/* Validator: simulasi ambil item & buka wadah; semua petunjuk + urutan wajib terjangkau. */
function validateLayout(L) {
    const items = new Set(["key"]);
    const open = {};
    for (const c of ["desk", "vent", "safe"]) {
        if (!L.containers.includes(c)) continue;
        if (items.has(CONTAINER_REQ[c])) {
            open[c] = true;
            const it = L.contents[c].item;
            if (it) items.add(it);
        }
    }
    const acc = (id) =>
        id === "painting" || FREE_CARRIERS.includes(id) ? true
            : id === "poster" ? L.poster && items.has("uv")
                : Boolean(open[id]);
    return L.carriers.every(acc) && acc(L.orderLoc);
}

function makeState(level, seatMap) {
    let seed = 0, layout = null, tries = 0;
    do { seed = (Math.random() * 0xffffffff) >>> 0; layout = genLayout(level, seed); }
    while (!validateLayout(layout) && ++tries < 25);
    const turn = Math.random() < 0.5 ? 0 : 1; // lempar koin: siapa jalan duluan
    return {
        phase: "play", level, seatMap, layout, turn,
        ap: AP_TURN, halfTurns: 0, turnsTaken: [0, 0],
        known: [{}, {}], orderKnown: [false, false],
        items: { key: false, screwdriver: false, crowbar: false, uv: false },
        keyFound: false,
        open: { desk: false, vent: false, safe: false },
        looted: { rug: false, sofa: false, bin: false },
        revealed: { poster: false },
        botMem: {},
        winner: null, cheated: false, cheatFreeze: false,
        startedAt: Date.now(),
        fx: { n: 1, kind: "coin", id: null, actor: -1, pub: "Lempar koin: P" + (turn + 1) + " jalan duluan.", priv: "" },
    };
}

/* ================================================================ */
export function mount(root, context = {}) {
    const { mode = "ai", room = null, playerName = "Player", onExit = () => { } } = context;
    const online = mode === "room" && Boolean(room);
    const playerIndex = online && !room.isHost ? 1 : 0;
    let roomData = room?.room || null;
    let state = null;

    /* UI lokal (tidak disinkronkan) */
    let uiOverlay = null;      // null | "keypad" | "notes" | "cheats"
    let uiLevel = 1;
    let padVal = "";
    let armedItem = null;
    let sel = 0;
    let lastFxN = 0;
    let cheatCodeShown = false;
    let destroyed = false;
    let botTimer = 0, toastTimer = 0;
    let best = readBest();
    const offs = [];

    const mySeat = () => (online && state && state.seatMap ? state.seatMap[playerIndex] : 0);
    const seatLabel = (s) => (s === mySeat() ? (online ? playerName : "Kamu") : online ? "Lawan" : "Bot");

    /* ---------------- shell (minimalis) ---------------- */
    root.innerHTML = `
<div class="game-app er-root">
<style>
.er-root{--bg:#0f1216;--panel:#14181f;--line:#2a3140;--txt:#e6e9ef;--sub:#8b93a7;--ac:#5eead4;--warn:#f87171;color:var(--txt);font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
.er-root [hidden]{display:none!important}
.er-root .er-intro p{margin:2px 0 0;color:var(--sub);font-size:13px}
.er-root .er-hud{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin:10px 0}
.er-root .er-chip{display:inline-flex;align-items:center;gap:6px;padding:5px 11px;border:1px solid var(--line);border-radius:999px;background:var(--panel);font-size:12px;color:var(--sub)}
.er-root .er-chip b{color:var(--txt);font-weight:600}
.er-root .er-ap i{display:inline-block;width:7px;height:7px;border-radius:50%;background:var(--line);margin-left:3px}
.er-root .er-ap i.on{background:var(--ac)}
.er-root .er-spacer{flex:1}
.er-root .er-items{display:flex;gap:6px;flex-wrap:wrap}
.er-root .er-item{border:1px solid var(--line);background:var(--panel);color:var(--txt);border-radius:999px;padding:5px 12px;font-size:12px;cursor:pointer;transition:border-color .2s,box-shadow .2s}
.er-root .er-item.armed{border-color:var(--ac);box-shadow:0 0 0 1px var(--ac);color:var(--ac)}
.er-root .er-none{color:var(--sub);font-size:12px}
.er-root .er-panel{position:relative;background:var(--bg);border:1px solid var(--line);border-radius:16px;overflow:hidden;min-height:300px}
.er-root .er-scene{display:block;width:100%;height:auto;max-height:62vh}
.er-root .er-obj{cursor:pointer;transform-box:fill-box;transform-origin:center;transition:filter .15s}
.er-root .er-obj *{transform-box:fill-box;transform-origin:center}
.er-root .er-obj:hover{filter:brightness(1.3)}
.er-root .er-sel{filter:drop-shadow(0 0 5px rgba(94,234,212,.55))}
.er-root .er-lab{fill:#667089;font-size:10px;font-family:inherit}
.er-root .er-sel .er-lab{fill:var(--ac)}
.er-root .er-tiny{fill:var(--ac);font-size:10px;letter-spacing:2px;font-family:inherit}
.er-root .er-locki{stroke:#8b93a7;stroke-width:1.5;fill:none}
.er-root .er-dot{fill:var(--ac);animation:erPulse 2s ease-in-out infinite}
.er-root .er-drawer,.er-root .er-cushion,.er-root .er-ventgrid,.er-root .er-doorpanel{transition:transform .5s ease,opacity .5s}
.er-root .er-open .er-drawer{transform:translateX(16px)}
.er-root .er-looted .er-cushion{transform:rotate(-9deg) translateY(-3px)}
.er-root .er-open .er-ventgrid{transform:rotate(-14deg) translate(4px,6px);opacity:.45}
.er-root .er-toast{position:absolute;top:10px;left:50%;transform:translateX(-50%);max-width:88%;background:#111831ee;border:1px solid var(--line);border-radius:999px;padding:6px 16px;font-size:12.5px;color:var(--txt);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;pointer-events:none;opacity:0;transition:opacity .35s;z-index:5}
.er-root .er-toast.show{opacity:1}
.er-root .er-ov{position:absolute;inset:0;display:grid;place-items:center;background:rgba(10,12,16,.78);backdrop-filter:blur(3px);z-index:6;animation:erFade .25s ease}
.er-root .er-card{background:var(--panel);border:1px solid var(--line);border-radius:16px;padding:22px 26px;max-width:400px;width:calc(100% - 40px);text-align:center}
.er-root .er-card h2{margin:0 0 6px;font-size:20px;font-weight:700}
.er-root .er-card p{margin:0 0 14px;color:var(--sub);font-size:13px;line-height:1.5}
.er-root .er-btn,.er-root .er-lv{border:1px solid var(--line);background:transparent;color:var(--txt);border-radius:10px;padding:9px 16px;font-size:13px;font-weight:600;cursor:pointer;transition:background .15s,border-color .15s}
.er-root .er-btn:hover,.er-root .er-lv:hover{border-color:var(--ac)}
.er-root .er-btn.primary{background:var(--ac);border-color:var(--ac);color:#06231f}
.er-root .er-btn:disabled{opacity:.4;cursor:default}
.er-root .er-lvrow{display:flex;gap:6px;justify-content:center;margin:0 0 14px}
.er-root .er-lv{width:38px;padding:8px 0}
.er-root .er-lv.on{border-color:var(--ac);color:var(--ac)}
.er-root .er-win{color:var(--ac)}.er-root .er-lose{color:var(--warn)}
.er-root .er-digitbar{display:flex;gap:8px;justify-content:center;margin-bottom:4px}
.er-root .er-digitbar span{width:40px;height:48px;border-radius:10px;background:var(--bg);border:1px solid var(--line);display:grid;place-items:center;font-size:22px;font-weight:700}
.er-root .er-padgrid{display:grid;grid-template-columns:repeat(3,64px);gap:8px;justify-content:center;margin:12px 0}
.er-root .er-padgrid button{height:44px;border:1px solid var(--line);border-radius:10px;background:transparent;color:var(--txt);font-weight:700;font-size:15px;cursor:pointer}
.er-root .er-padgrid button:hover{border-color:var(--ac)}
.er-root .er-list{text-align:left;margin:0 0 14px;padding:0;list-style:none;font-size:13px;line-height:1.9;color:var(--txt)}
.er-root .er-list b{color:var(--ac);font-weight:600}
.er-root .er-list .dim{color:var(--sub)}
.er-root .er-cheatgrid{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px}
.er-root .er-cheatgrid .er-btn{padding:8px 6px;font-size:12px}
.er-root .er-code{font-size:15px;color:var(--ac);letter-spacing:4px;margin-bottom:12px;font-weight:700}
.er-root .er-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px}
.er-root .er-touch{display:none;gap:6px;padding:8px;border-top:1px solid var(--line);background:var(--panel);flex-wrap:wrap;justify-content:center}
.er-root .er-touch button{flex:1;min-width:56px;min-height:44px;border:1px solid var(--line);border-radius:10px;background:transparent;color:var(--txt);font-size:11px;font-weight:700;cursor:pointer}
.er-root .er-touch button:active{border-color:var(--ac);color:var(--ac)}
@media (pointer:coarse),(max-width:720px){.er-root .er-touch{display:flex}}
.er-root .er-fx-clue,.er-root .er-fx-item{animation:erPop .55s ease}
.er-root .er-fx-unlock{animation:erUnlock .6s ease}
.er-root .er-fx-deny{animation:erShake .4s ease}
.er-root .er-fx-uv{animation:erGlow 1s ease}
.er-root .er-fx-win .er-doorpanel{animation:erDoor 1s ease forwards}
.er-root .er-fx-badcode{animation:erShake .4s ease}
.er-root .er-fx-coin{animation:erPop .6s ease}
@keyframes erPop{0%{transform:scale(.92)}45%{transform:scale(1.06)}100%{transform:scale(1)}}
@keyframes erShake{0%,100%{transform:translateX(0)}25%{transform:translateX(-5px)}75%{transform:translateX(5px)}}
@keyframes erUnlock{0%{transform:rotate(0)}35%{transform:rotate(-2.5deg)}70%{transform:rotate(1.5deg)}100%{transform:rotate(0)}}
@keyframes erGlow{0%,100%{filter:none}50%{filter:drop-shadow(0 0 10px rgba(94,234,212,.9))}}
@keyframes erDoor{to{transform:perspective(600px) rotateY(-62deg);opacity:.55}}
@keyframes erFade{from{opacity:0}to{opacity:1}}
@keyframes erPulse{0%,100%{opacity:.35}50%{opacity:1}}
@media (prefers-reduced-motion:reduce){.er-root *{animation:none!important;transition:none!important}}
</style>
<div class="game-intro er-intro">
  <div><h2>Escape Room</h2><p data-sub>—</p></div>
  <span class="game-status"><i class="game-status-dot"></i><span data-status>Siap</span></span>
</div>
<div class="er-hud">
  <span class="er-chip">Level <b data-hud="level">–</b></span>
  <span class="er-chip">Ronde <b data-hud="round">–</b>/${MAX_ROUNDS}</span>
  <span class="er-chip">Waktu <b data-hud="time">0:00</b></span>
  <span class="er-chip">Giliran <b data-hud="turn">–</b><span class="er-ap" data-hud="ap"></span></span>
  <span class="er-chip" data-el="bestChip">Best <b data-hud="best">–</b></span>
  <span class="er-spacer"></span>
  <div class="er-items" data-el="items"></div>
</div>
<section class="game-panel er-panel" data-board>
  <svg class="er-scene" viewBox="0 0 720 440" preserveAspectRatio="xMidYMid meet" aria-label="Ruang escape room" data-el="scene"><g data-el="world"></g></svg>
  <div class="er-toast" data-el="toast"></div>
  <div class="er-ov" data-ov="start">
    <div class="er-card">
      <h2>Escape Room</h2>
      <p data-el="startInfo"></p>
      <div class="er-lvrow" data-el="levels">
        <button class="er-lv" type="button" data-level="1">1</button><button class="er-lv" type="button" data-level="2">2</button><button class="er-lv" type="button" data-level="3">3</button><button class="er-lv" type="button" data-level="4">4</button><button class="er-lv" type="button" data-level="5">5</button>
      </div>
      <button class="er-btn primary" type="button" data-act="start" data-el="startBtn">Mulai</button>
    </div>
  </div>
  <div class="er-ov" data-ov="over" hidden>
    <div class="er-card">
      <h2 data-el="ovTitle"></h2>
      <p data-el="ovSub"></p>
      <div class="er-actions" style="justify-content:center">
        <button class="er-btn primary" type="button" data-act="next" data-el="nextBtn">Level berikutnya</button>
        <button class="er-btn" type="button" data-act="replay">Ulangi level</button>
      </div>
    </div>
  </div>
  <div class="er-ov" data-ov="keypad" hidden>
    <div class="er-card" data-el="padCard">
      <h2>Keypad pintu</h2>
      <p data-el="padMsg">Masukkan 4 digit.</p>
      <div class="er-digitbar"><span data-d="0"></span><span data-d="1"></span><span data-d="2"></span><span data-d="3"></span></div>
      <div class="er-padgrid" data-el="pad">
        <button type="button" data-k="1">1</button><button type="button" data-k="2">2</button><button type="button" data-k="3">3</button>
        <button type="button" data-k="4">4</button><button type="button" data-k="5">5</button><button type="button" data-k="6">6</button>
        <button type="button" data-k="7">7</button><button type="button" data-k="8">8</button><button type="button" data-k="9">9</button>
        <button type="button" data-k="clr">CLR</button><button type="button" data-k="0">0</button><button type="button" data-k="ok">OK</button>
      </div>
      <button class="er-btn" type="button" data-act="close">Tutup</button>
    </div>
  </div>
  <div class="er-ov" data-ov="notes" hidden>
    <div class="er-card">
      <h2>Catatan</h2>
      <ul class="er-list" data-el="noteList"></ul>
      <button class="er-btn" type="button" data-act="close">Tutup</button>
    </div>
  </div>
  <div class="er-ov" data-ov="cheats" hidden>
    <div class="er-card">
      <h2>Cheat</h2>
      <p>Hanya tersedia saat bermain melawan bot.</p>
      <div class="er-cheatgrid">
        <button class="er-btn" type="button" data-cheat="clues">Semua petunjuk</button>
        <button class="er-btn" type="button" data-cheat="order">Buka urutan</button>
        <button class="er-btn" type="button" data-cheat="items">Semua item</button>
        <button class="er-btn" type="button" data-cheat="unlock">Buka semua wadah</button>
        <button class="er-btn" type="button" data-cheat="code">Lihat kode</button>
        <button class="er-btn" type="button" data-cheat="autofill">Isi keypad otomatis</button>
        <button class="er-btn" type="button" data-cheat="ap">AP penuh</button>
        <button class="er-btn" type="button" data-cheat="freeze" data-el="freezeBtn">Bekukan bot</button>
        <button class="er-btn" type="button" data-cheat="win">Menang instan</button>
      </div>
      <div class="er-code" data-el="cheatCode" hidden></div>
      <button class="er-btn" type="button" data-act="close">Tutup</button>
    </div>
  </div>
  <div class="er-touch">
    <button type="button" data-virt="prev">◀</button>
    <button type="button" data-virt="act">AKSI</button>
    <button type="button" data-virt="next">▶</button>
    <button type="button" data-virt="item">ITEM</button>
    <button type="button" data-virt="pad">PAD</button>
    <button type="button" data-virt="notes">CAT</button>
    <button type="button" data-virt="end">GILIRAN</button>
    <button type="button" data-virt="cheat" data-el="touchCheat">CHEAT</button>
  </div>
</section>
<div class="game-actions er-actions">
  <button class="er-btn" type="button" data-act="end" data-el="endBtn" title="E">Akhiri giliran</button>
  <button class="er-btn" type="button" data-act="notes" title="N">Catatan</button>
  <button class="er-btn" type="button" data-act="cheats" data-el="cheatBtn" title="C">Cheat</button>
  <button class="er-btn" type="button" data-act="restart" data-el="restartBtn">Ulang</button>
  <button class="game-action-button" type="button" data-exit>Exit game</button>
</div>
</div>`;

    /* ---------------- refs ---------------- */
    const $ = (s) => root.querySelector(s);
    const world = $('[data-el="world"]');
    const sceneSvg = $('[data-el="scene"]');
    const toast = $('[data-el="toast"]');
    const statusEl = $("[data-status]");
    const subEl = $("[data-sub]");
    const hud = {
        level: $('[data-hud="level"]'), round: $('[data-hud="round"]'), time: $('[data-hud="time"]'),
        turn: $('[data-hud="turn"]'), ap: $('[data-hud="ap"]'), best: $('[data-hud="best"]'),
    };
    const itemsEl = $('[data-el="items"]');
    const ov = { start: $('[data-ov="start"]'), over: $('[data-ov="over"]'), keypad: $('[data-ov="keypad"]'), notes: $('[data-ov="notes"]'), cheats: $('[data-ov="cheats"]') };
    const show = (el) => el.removeAttribute("hidden");
    const hide = (el) => el.setAttribute("hidden", "");

    /* ---------------- best score ---------------- */
    function readBest() { try { return parseInt(localStorage.getItem(META.bestKey) || "0", 10) || 0; } catch { return 0; } }
    function saveBest(n) { try { if (!best || n < best) { best = n; localStorage.setItem(META.bestKey, String(n)); } } catch { /* abaikan */ } }

    const fmtTime = (s) => Math.floor(s / 60) + ":" + String(Math.floor(s % 60)).padStart(2, "0");
    const orderText = () => "Urutan: " + state.layout.order.map((c) => CARRIER_LABEL[c]).join(" → ") + ".";

    function setFx(kind, id, actor, pub, priv) {
        state.fx = { n: (state.fx?.n || 0) + 1, kind, id, actor, pub: pub || "", priv: priv || "" };
    }
    function revealContainer(actor, c) {
        const k = state.layout.contents[c]; const bits = [];
        if (k.clue) { state.known[actor][c] = true; bits.push(state.layout.clues[c].text); }
        if (k.order) { state.orderKnown[actor] = true; bits.push(orderText()); }
        return bits.join(" ");
    }
    function passTurn(actor) {
        state.turnsTaken[actor]++;
        state.halfTurns++;
        if (state.halfTurns >= MAX_ROUNDS * 2) {
            state.phase = "over"; state.winner = -1;
            setFx("look", null, -1, "Mekanisme kunci macet — permainan seri.", "");
            return;
        }
        state.turn = 1 - state.turn;
        state.ap = AP_TURN;
    }

    /* ---------------- cheat (solo saja) ---------------- */
    function applyCheat(key) {
        const L = state.layout;
        switch (key) {
            case "clues": L.carriers.forEach((c) => { state.known[0][c] = true; }); setFx("clue", null, 0, "Cheat: semua petunjuk terbuka.", ""); break;
            case "order": state.orderKnown[0] = true; setFx("clue", null, 0, "Cheat: urutan terbuka.", orderText()); break;
            case "items": Object.keys(state.items).forEach((k) => { state.items[k] = true; }); state.keyFound = true; setFx("item", null, 0, "Cheat: semua item didapatkan.", ""); break;
            case "unlock":
                L.containers.forEach((c) => { state.open[c] = true; const it = L.contents[c].item; if (it) state.items[it] = true; });
                setFx("unlock", null, 0, "Cheat: semua wadah terbuka.", ""); break;
            case "code": cheatCodeShown = true; setFx("look", null, 0, "Cheat: kode ditampilkan.", "Kode: " + L.code); break;
            case "autofill": padVal = L.code; uiOverlay = "keypad"; setFx("look", null, 0, "Cheat: keypad diisi otomatis.", ""); break;
            case "ap": state.ap = 9; setFx("look", null, 0, "Cheat: AP diisi penuh.", ""); break;
            case "freeze": state.cheatFreeze = !state.cheatFreeze; setFx("look", null, 0, state.cheatFreeze ? "Cheat: bot dibekukan." : "Cheat: bot aktif kembali.", ""); break;
            case "win": state.winner = 0; state.phase = "over"; setFx("win", "door", 0, "Cheat: pintu terbuka paksa.", ""); break;
        }
    }

    /* ---------------- aksi kanonik (host / solo) ---------------- */
    function applyAction(action, actor) {
        if (!state || !action || typeof action !== "object") return;
        const t = action.type;

        if (t === "start") {
            if (state.phase === "play") return;
            if (online && actor !== state.seatMap[0] && state.phase !== "over") return;
            const lv = Math.min(LEVELS, Math.max(1, parseInt(action.level, 10) || 1));
            // posisi pemain diacak tiap game: host tidak selalu P1
            const seatMap = online ? (Math.random() < 0.5 ? [0, 1] : [1, 0]) : [0, 1];
            state = makeState(lv, seatMap);
            uiOverlay = null; padVal = ""; armedItem = null; cheatCodeShown = false; sel = 0;
            publish(); scheduleBot(); return;
        }
        if (t === "cheat") {
            if (online || actor !== 0 || state.phase !== "play") return;
            applyCheat(String(action.key || "")); state.cheated = true;
            publish(); return;
        }
        if (state.phase !== "play") return;
        if (t === "end") {
            if (actor !== state.turn) return;
            passTurn(actor);
            if (state.phase === "play") setFx("look", null, actor, seatLabel(actor) + " mengakhiri giliran.", "");
            publish(); scheduleBot(); return;
        }
        if (actor !== state.turn || state.ap <= 0) return;

        const L = state.layout;
        const id = String(action.id || "");

        if (t === "inspect") {
            if (!NAV_ORDER.includes(id) || id === "door") return;
            state.ap--;
            if (actor === 1) state.botMem[id] = true;
            if (FREE_SOURCES.includes(id)) {
                state.looted[id] = true;
                if (L.keySource === id && !state.keyFound) {
                    state.keyFound = true; state.items.key = true;
                    setFx("item", id, actor, seatLabel(actor) + " menemukan kunci kecil di " + OBJ_LABEL[id] + "!", "Kunci kuningan masuk inventaris bersama.");
                } else setFx("look", id, actor, seatLabel(actor) + " memeriksa " + OBJ_LABEL[id] + " — kosong.", "");
            } else if (FREE_CARRIERS.includes(id)) {
                if (L.carriers.includes(id)) {
                    state.known[actor][id] = true;
                    setFx("clue", id, actor, seatLabel(actor) + " mencatat sesuatu dari " + OBJ_LABEL[id] + ".", L.clues[id].text);
                } else setFx("look", id, actor, "Tidak ada yang istimewa di " + OBJ_LABEL[id] + ".", "");
            } else if (L.containers.includes(id)) {
                if (state.open[id]) {
                    const txt = revealContainer(actor, id);
                    setFx("clue", id, actor, seatLabel(actor) + " membaca isi " + OBJ_LABEL[id] + ".", txt || "Wadah itu kosong.");
                } else setFx("look", id, actor, OBJ_LABEL[id] + " terkunci.", "");
            } else if (id === "poster" && L.poster) {
                if (state.revealed.poster) {
                    state.known[actor].poster = true;
                    setFx("clue", id, actor, seatLabel(actor) + " membaca poster.", L.clues.poster.text);
                } else setFx("look", id, actor, "Poster itu tampak kosong.", "");
            } else if (id === "painting") {
                if (L.orderLoc === "painting") {
                    state.orderKnown[actor] = true;
                    setFx("clue", id, actor, seatLabel(actor) + " menemukan goresan di balik lukisan.", orderText());
                } else setFx("look", id, actor, "Hanya lukisan pantai biasa.", "");
            } else return;
        } else if (t === "use") {
            const item = String(action.item || "");
            if (!ITEM_LABEL[item] || !state.items[item] || !NAV_ORDER.includes(id)) return;
            state.ap--;
            if (id === "poster" && item === "uv" && L.poster && !state.revealed.poster) {
                state.revealed.poster = true; state.known[actor].poster = true;
                setFx("uv", id, actor, "Sinar UV menyapu poster — tulisan tersembunyi muncul!", L.clues.poster.text);
            } else if (L.containers.includes(id) && CONTAINER_REQ[id] === item && !state.open[id]) {
                state.open[id] = true; state.items[item] = false;
                const c = L.contents[id];
                if (c.item) state.items[c.item] = true;
                const txt = revealContainer(actor, id);
                setFx("unlock", id, actor,
                    seatLabel(actor) + " membuka " + OBJ_LABEL[id] + (c.item ? " — ada " + ITEM_LABEL[c.item] + " di dalam!" : "!"),
                    txt || (c.item ? ITEM_LABEL[c.item] + " masuk inventaris bersama." : ""));
            } else {
                setFx("deny", id, actor, ITEM_LABEL[item] + " tidak cocok dengan " + (OBJ_LABEL[id] || "itu") + ".", "");
            }
        } else if (t === "code") {
            const v = String(action.value || "");
            if (!/^\d{4}$/.test(v)) return;
            if (v === L.code) {
                state.winner = actor; state.phase = "over"; state.turnsTaken[actor]++;
                setFx("win", "door", actor, "Kode benar — kunci terbuka. " + seatLabel(actor) + " lolos!", "");
                if (!online && actor === 0 && !state.cheated) saveBest(state.turnsTaken[0]);
            } else {
                state.ap = Math.max(0, state.ap - 2);
                setFx("badcode", null, actor, "Kode salah. Keypad menolak (−2 AP).", "");
            }
        } else return;

        if (state.phase === "play" && state.ap <= 0) passTurn(actor);
        publish(); scheduleBot();
    }

    function submitAction(action) {
        if (online && !room.isHost) { room.sendAction(action).catch(console.warn); return; }
        applyAction(action, mySeat());
    }

    /* ---------------- bot (mode ai, dijalankan host lokal) ---------------- */
    function botChoose() {
        const L = state.layout, k = state.known[1];
        if (L.carriers.every((c) => k[c]) && state.orderKnown[1]) return { type: "code", value: L.code };
        if (state.cheatFreeze) return { type: "end" };
        for (const c of L.containers) if (!state.open[c] && state.items[CONTAINER_REQ[c]]) return { type: "use", item: CONTAINER_REQ[c], id: c };
        if (L.poster && !state.revealed.poster && state.items.uv) return { type: "use", item: "uv", id: "poster" };
        if (!state.keyFound) {
            const s = FREE_SOURCES.filter((x) => !state.botMem[x]);
            if (s.length) return { type: "inspect", id: s[Math.floor(Math.random() * s.length)] };
        }
        const free = FREE_CARRIERS.filter((c) => !state.botMem[c]);
        if (free.length) return { type: "inspect", id: free[Math.floor(Math.random() * free.length)] };
        for (const c of L.containers) {
            if (state.open[c] && ((L.contents[c].clue && !k[c]) || (L.contents[c].order && !state.orderKnown[1]))) return { type: "inspect", id: c };
        }
        if (L.poster && state.revealed.poster && !k.poster) return { type: "inspect", id: "poster" };
        if (!state.orderKnown[1]) {
            const loc = L.orderLoc;
            if (loc === "painting" && !state.botMem.painting) return { type: "inspect", id: "painting" };
            if (state.open[loc]) return { type: "inspect", id: loc };
        }
        return { type: "end" };
    }
    function botStep() {
        if (destroyed || online || !state || state.phase !== "play" || state.turn !== 1) return;
        const hesitate = state.level <= 2 ? 0.25 : 0.15; // bot kadang ragu → bisa dikalahkan
        const a = Math.random() < hesitate ? { type: "end" } : botChoose();
        applyAction(a, 1);
    }
    function scheduleBot() {
        clearTimeout(botTimer);
        if (!online && state && state.phase === "play" && state.turn === 1)
            botTimer = setTimeout(botStep, 650 + Math.random() * 700);
    }

    /* ---------------- render ---------------- */
    function publish() {
        render();
        if (online && room.isHost) room.publishState(state).catch(console.warn);
    }

    function presentIds() {
        if (!state || !state.layout) return ["door"];
        const L = state.layout;
        return NAV_ORDER.filter((id) =>
            id === "vent" || id === "safe" ? L.containers.includes(id) : id === "poster" ? L.poster : true);
    }

    function lockIcon(x, y) {
        return '<path class="er-locki" d="M' + x + " " + y + " h10 v8 h-10 z M" + (x + 2) + " " + y + " v-3 a3 3 0 0 1 6 0 v3\"/>";
    }
    function knownDot(x, y) { return '<circle class="er-dot" cx="' + x + '" cy="' + y + '" r="3"/>'; }

    function sceneSVG() {
        if (!state || !state.layout)
            return '<rect x="2" y="2" width="716" height="436" rx="14" fill="#10151d" stroke="#2a3140"/><text x="360" y="220" fill="#667089" font-size="14" text-anchor="middle">Menghubungkan…</text>';
        const L = state.layout, me = mySeat(), k = state.known[me];
        const ids = presentIds();
        if (sel >= ids.length) sel = 0;
        const selId = ids[sel];
        const cls = (id, extra) => "er-obj" + (id === selId ? " er-sel" : "") + (extra ? " " + extra : "");
        const p = [];
        p.push('<rect x="2" y="2" width="716" height="436" rx="14" fill="#10151d" stroke="#2a3140" stroke-width="2"/>');
        p.push('<path d="M2 352 H718" stroke="#1c2333" stroke-width="2"/>');

        /* pintu */
        p.push('<g data-obj="door" class="' + cls("door") + '"><rect x="606" y="90" width="96" height="262" rx="8" fill="#161c28" stroke="#2a3140" stroke-width="2"/><rect class="er-doorpanel" x="614" y="98" width="80" height="246" rx="6" fill="#1b2130" stroke="#2a3140" stroke-width="2"/><rect x="628" y="120" width="52" height="26" rx="4" fill="#0b0f16" stroke="#5eead4" stroke-width="1.5"/><text x="654" y="138" class="er-tiny" text-anchor="middle">••••</text><circle cx="682" cy="230" r="4" fill="#8b93a7"/><text x="654" y="368" class="er-lab" text-anchor="middle">pintu</text></g>');

        /* lukisan */
        p.push('<g data-obj="painting" class="' + cls("painting") + '"><rect x="64" y="64" width="128" height="86" rx="6" fill="#161c28" stroke="#2a3140" stroke-width="2"/><path d="M76 128 q26 -26 52 -6 q22 16 52 -14" fill="none" stroke="#3b4a63" stroke-width="3" stroke-linecap="round"/>' +
            (state.orderKnown[me] && L.orderLoc === "painting" ? '<text x="128" y="98" class="er-tiny" text-anchor="middle">' + L.order.map((c) => CARRIER_ICON[c]).join(" ") + "</text>" : "") +
            '<text x="128" y="166" class="er-lab" text-anchor="middle">lukisan</text></g>');

        /* poster (level 4+) */
        if (L.poster) {
            p.push('<g data-obj="poster" class="' + cls("poster") + '"><rect x="214" y="66" width="74" height="100" rx="4" fill="#161c28" stroke="#2a3140" stroke-width="2"/>' +
                (state.revealed.poster ? '<path d="M226 100 h50 M226 116 h38 M226 132 h46" stroke="#5eead4" stroke-width="2" stroke-linecap="round" opacity=".8"/><text x="251" y="156" class="er-tiny" text-anchor="middle">✶</text>' : (!state.items.uv ? lockIcon(246, 108) : "")) +
                (k.poster ? knownDot(282, 72) : "") +
                '<text x="251" y="182" class="er-lab" text-anchor="middle">poster</text></g>');
        }

        /* jam — jarum hanya menunjukkan digit bagi yang sudah memeriksa */
        const cd = k.clock ? L.clues.clock.digit : null;
        p.push('<g data-obj="clock" class="' + cls("clock") + '"><circle cx="332" cy="112" r="36" fill="#161c28" stroke="#2a3140" stroke-width="2"/><circle cx="332" cy="82" r="1.5" fill="#3b4a63"/><circle cx="362" cy="112" r="1.5" fill="#3b4a63"/><circle cx="332" cy="142" r="1.5" fill="#3b4a63"/><circle cx="302" cy="112" r="1.5" fill="#3b4a63"/><path d="M332 112 L332 86" stroke="' + (cd ? "#5eead4" : "#8b93a7") + '" stroke-width="3" stroke-linecap="round" transform="rotate(' + (cd ? cd * 30 : 0) + ' 332 112)"/><circle cx="332" cy="112" r="3" fill="#8b93a7"/>' +
            (cd ? "" : '<text x="332" y="128" class="er-lab" text-anchor="middle">?</text>') +
            (cd ? knownDot(362, 84) : "") +
            '<text x="332" y="166" class="er-lab" text-anchor="middle">jam</text></g>');

        /* rak buku — jumlah spine merah hanya tampak bagi penemunya */
        const bd = k.books ? L.clues.books.digit : 0;
        let spines = "";
        for (let i = 0; i < 9; i++) spines += '<rect x="' + (440 + i * 18) + '" y="72" width="13" height="92" rx="2" fill="' + (i < bd ? "#f87171" : "#232b3d") + '"/>';
        p.push('<g data-obj="books" class="' + cls("books") + '"><rect x="430" y="64" width="176" height="108" rx="6" fill="#161c28" stroke="#2a3140" stroke-width="2"/>' + spines +
            (k.books ? knownDot(600, 70) : "") +
            '<text x="518" y="188" class="er-lab" text-anchor="middle">rak buku</text></g>');

        /* ventilasi (level 2+) */
        if (L.containers.includes("vent")) {
            p.push('<g data-obj="vent" class="' + cls("vent", state.open.vent ? "er-open" : "") + '"><rect x="64" y="196" width="88" height="54" rx="6" fill="' + (state.open.vent ? "#0b0f16" : "#161c28") + '" stroke="#2a3140" stroke-width="2"/><g class="er-ventgrid"><path d="M74 208 h68 M74 220 h68 M74 232 h68 M74 244 h68" stroke="#3b4a63" stroke-width="3" stroke-linecap="round"/></g>' +
                (state.open.vent ? "" : lockIcon(140, 190)) +
                (k.vent ? knownDot(146, 202) : "") +
                '<text x="108" y="266" class="er-lab" text-anchor="middle">ventilasi</text></g>');
        }

        /* meja + laci */
        p.push('<g data-obj="desk" class="' + cls("desk", state.open.desk ? "er-open" : "") + '"><rect x="150" y="268" width="190" height="14" rx="4" fill="#232b3d"/><path d="M162 282 v62 M328 282 v62" stroke="#232b3d" stroke-width="8" stroke-linecap="round"/><rect class="er-drawer" x="196" y="230" width="100" height="38" rx="6" fill="' + (state.open.desk ? "#0b0f16" : "#1b2130") + '" stroke="#2a3140" stroke-width="2"/><circle class="er-drawer" cx="246" cy="249" r="4" fill="' + (state.open.desk ? "#5eead4" : "#8b93a7") + '"/>' +
            (state.open.desk ? "" : lockIcon(276, 240)) +
            (k.desk ? knownDot(290, 236) : "") +
            '<text x="245" y="360" class="er-lab" text-anchor="middle">meja &amp; laci</text></g>');

        /* brankas (level 3+) */
        if (L.containers.includes("safe")) {
            p.push('<g data-obj="safe" class="' + cls("safe", state.open.safe ? "er-open" : "") + '"><rect x="468" y="292" width="84" height="76" rx="8" fill="#161c28" stroke="#2a3140" stroke-width="2"/><rect x="478" y="302" width="64" height="56" rx="4" fill="' + (state.open.safe ? "#0b0f16" : "#1b2130") + '" stroke="#2a3140" stroke-width="1.5"/><circle cx="510" cy="330" r="11" fill="none" stroke="#3b4a63" stroke-width="2.5"/><path d="M510 330 L510 321" stroke="#8b93a7" stroke-width="2.5" stroke-linecap="round"/>' +
                (state.open.safe ? "" : lockIcon(534, 286)) +
                (k.safe ? knownDot(546, 298) : "") +
                '<text x="510" y="384" class="er-lab" text-anchor="middle">brankas</text></g>');
        }

        /* tanaman — bunga mekar hanya bagi penemunya */
        const fd = k.blooms ? L.clues.blooms.digit : 0;
        let blooms = "";
        BLOOM_POS.forEach((pos, i) => {
            blooms += '<circle cx="' + pos[0] + '" cy="' + pos[1] + '" r="' + (i < fd ? 7 : 3.5) + '" fill="' + (i < fd ? "#f472b6" : "#232b3d") + '"/>';
        });
        p.push('<g data-obj="blooms" class="' + cls("blooms") + '"><path d="M560 330 q-6 -50 -30 -64 M560 330 q0 -58 6 -70 M560 330 q8 -48 32 -60" fill="none" stroke="#2f4a3a" stroke-width="4" stroke-linecap="round"/>' + blooms +
            '<path d="M534 330 h52 l-7 30 h-38 z" fill="#232b3d" stroke="#2a3140" stroke-width="1.5"/>' +
            (k.blooms ? knownDot(602, 232) : "") +
            '<text x="560" y="384" class="er-lab" text-anchor="middle">tanaman</text></g>');

        /* sofa */
        p.push('<g data-obj="sofa" class="' + cls("sofa", state.looted.sofa ? "er-looted" : "") + '"><rect x="40" y="312" width="150" height="24" rx="8" fill="#1b2130" stroke="#2a3140" stroke-width="2"/><rect x="40" y="330" width="150" height="44" rx="8" fill="#161c28" stroke="#2a3140" stroke-width="2"/><rect class="er-cushion" x="52" y="336" width="60" height="18" rx="6" fill="#232b3d"/><rect x="118" y="336" width="60" height="18" rx="6" fill="#232b3d"/><text x="115" y="392" class="er-lab" text-anchor="middle">sofa</text></g>');

        /* tempat sampah */
        p.push('<g data-obj="bin" class="' + cls("bin", state.looted.bin ? "er-looted" : "") + '"><path d="M400 340 h36 l-5 46 h-26 z" fill="#161c28" stroke="#2a3140" stroke-width="2"/><path d="M396 340 h44" stroke="#2a3140" stroke-width="3" stroke-linecap="round"' + (state.looted.bin ? ' transform="rotate(14 418 340)"' : "") + "/>" +
            (state.looted.bin ? '<path d="M400 340 h36 l-5 46 h-26 z" fill="none" stroke="#2a3140" stroke-width="1" opacity=".4" transform="rotate(10 418 386)"/>' : "") +
            '<text x="418" y="402" class="er-lab" text-anchor="middle">sampah</text></g>');

        /* karpet */
        p.push('<g data-obj="rug" class="' + cls("rug") + '">' +
            (state.looted.rug
                ? '<ellipse cx="320" cy="402" rx="112" ry="20" fill="none" stroke="#2a3140" stroke-width="1.5" stroke-dasharray="4 5"/><ellipse cx="352" cy="400" rx="78" ry="15" fill="#1b2130" stroke="#2a3140" stroke-width="2"/>'
                : '<ellipse cx="320" cy="402" rx="112" ry="20" fill="#1b2130" stroke="#2a3140" stroke-width="2"/><ellipse cx="320" cy="402" rx="80" ry="13" fill="none" stroke="#232b3d" stroke-width="2"/>') +
            '<text x="320" y="432" class="er-lab" text-anchor="middle">karpet</text></g>');

        return p.join("");
    }

    function renderNotes() {
        if (!state || !state.layout) return;
        const L = state.layout, me = mySeat(), k = state.known[me];
        const rows = [];
        ["clock", "books", "blooms", "desk", "vent", "safe", "poster"].forEach((c) => {
            if (!L.carriers.includes(c)) return;
            rows.push(k[c]
                ? "<li>" + CARRIER_LABEL[c] + " — <b>" + L.clues[c].text + "</b></li>"
                : '<li class="dim">' + CARRIER_LABEL[c] + " — belum ditemukan</li>");
        });
        rows.push(state.orderKnown[me]
            ? "<li>Urutan: <b>" + L.order.map((c) => CARRIER_LABEL[c]).join(" → ") + "</b></li>"
            : '<li class="dim">Urutan: belum diketahui</li>');
        const its = Object.keys(state.items).filter((i) => state.items[i]).map((i) => ITEM_LABEL[i]);
        rows.push('<li class="dim">Inventaris bersama: ' + (its.length ? its.join(", ") : "kosong") + "</li>");
        $('[data-el="noteList"]').innerHTML = rows.join("");
    }

    function updatePad() {
        root.querySelectorAll(".er-digitbar span").forEach((el, i) => { el.textContent = padVal[i] || ""; });
    }

    function render() {
        if (destroyed) return;
        const me = mySeat();
        const phase = state ? state.phase : "ready";
        if (phase !== "play" && uiOverlay) uiOverlay = null;

        subEl.textContent = state && state.layout
            ? LEVEL_NAME[state.level - 1] + " · Kamu P" + (me + 1) + (online ? "" : " · vs Bot")
            : "Pilih level";
        statusEl.textContent = !state ? "Menghubungkan…"
            : phase === "ready" ? "Siap"
                : phase === "over" ? (state.winner === me ? "Kamu lolos!" : state.winner < 0 ? "Seri" : "Kalah")
                    : state.turn === me ? "Giliranmu" : "Giliran " + seatLabel(state.turn);

        hud.level.textContent = state ? String(state.level) : "–";
        hud.round.textContent = state && state.layout ? String(Math.min(MAX_ROUNDS, Math.floor(state.halfTurns / 2) + 1)) : "–";
        hud.turn.textContent = state && phase === "play" ? "P" + (state.turn + 1) : "–";
        hud.best.textContent = best ? best + " giliran" : "–";
        if (online) hide($('[data-el="bestChip"]'));
        const ap = state && phase === "play" ? state.ap : 0;
        hud.ap.innerHTML = [0, 1, 2].map((i) => '<i class="' + (i < ap ? "on" : "") + '"></i>').join("");

        /* inventaris */
        if (state && state.layout) {
            const its = Object.keys(state.items).filter((i) => state.items[i]);
            itemsEl.innerHTML = its.length
                ? its.map((i) => '<button type="button" class="er-item' + (armedItem === i ? " armed" : "") + '" data-item="' + i + '">' + ITEM_LABEL[i] + "</button>").join("")
                : '<span class="er-none">inventaris kosong</span>';
            if (armedItem && !state.items[armedItem]) armedItem = null;
        } else itemsEl.innerHTML = "";

        /* scene */
        world.innerHTML = sceneSVG();

        /* overlay */
        phase === "ready" || !state ? show(ov.start) : hide(ov.start);
        phase === "over" ? show(ov.over) : hide(ov.over);
        uiOverlay === "keypad" ? show(ov.keypad) : hide(ov.keypad);
        uiOverlay === "notes" ? (renderNotes(), show(ov.notes)) : hide(ov.notes);
        uiOverlay === "cheats" ? show(ov.cheats) : hide(ov.cheats);

        if (phase === "ready" || !state) {
            const guestWaiting = online && !room.isHost;
            $('[data-el="startInfo"]').textContent = guestWaiting ? "Menunggu host memulai…" : "Level " + uiLevel + " — " + LEVEL_NAME[uiLevel - 1];
            guestWaiting ? hide($('[data-el="startBtn"]')) : show($('[data-el="startBtn"]'));
            root.querySelectorAll("[data-level]").forEach((b) => {
                b.classList.toggle("on", +b.dataset.level === uiLevel);
                b.disabled = guestWaiting;
            });
        }
        if (phase === "over") {
            const win = state.winner === me;
            const title = $('[data-el="ovTitle"]');
            title.textContent = state.winner < 0 ? "Seri — kunci macet" : win ? "Kamu lolos!" : seatLabel(state.winner) + " lolos duluan";
            title.className = state.winner < 0 ? "" : win ? "er-win" : "er-lose";
            const secs = Math.max(0, (Date.now() - state.startedAt) / 1000);
            $('[data-el="ovSub"]').textContent = "Giliranmu: " + state.turnsTaken[me] + " · Waktu: " + fmtTime(secs) + (state.cheated ? " · (cheat aktif)" : "");
            $('[data-el="nextBtn"]').disabled = state.level >= LEVELS;
        }
        if (uiOverlay === "cheats") {
            $('[data-el="freezeBtn"]').textContent = state && state.cheatFreeze ? "Aktifkan bot" : "Bekukan bot";
            const cc = $('[data-el="cheatCode"]');
            cheatCodeShown && state && state.layout ? (cc.textContent = state.layout.code, show(cc)) : hide(cc);
        }
        updatePad();

        /* tombol */
        $('[data-el="endBtn"]').disabled = !state || phase !== "play" || state.turn !== me;
        online ? hide($('[data-el="cheatBtn"]')) : show($('[data-el="cheatBtn"]'));
        online ? hide($('[data-el="touchCheat"]')) : show($('[data-el="touchCheat"]'));
        online && !room.isHost ? hide($('[data-el="restartBtn"]')) : show($('[data-el="restartBtn"]'));

        /* fx + toast (sekali per event) */
        const fx = state && state.fx;
        if (fx && fx.n !== lastFxN) {
            lastFxN = fx.n;
            if (fx.id) {
                const g = world.querySelector('[data-obj="' + fx.id + '"]');
                if (g) g.classList.add("er-fx-" + fx.kind);
            }
            if (fx.kind === "badcode") {
                $('[data-el="padCard"]').classList.add("er-fx-badcode");
                setTimeout(() => $('[data-el="padCard"]')?.classList.remove("er-fx-badcode"), 450);
                padVal = ""; updatePad();
                $('[data-el="padMsg"]').textContent = "Kode salah. Coba lagi.";
            }
            if (fx.kind === "win") { padVal = ""; updatePad(); }
            if (fx.kind === "coin") { statusEl.classList.add("er-fx-coin"); setTimeout(() => statusEl?.classList.remove("er-fx-coin"), 650); }
            const text = fx.actor === me && fx.priv ? fx.priv : fx.pub;
            if (text) {
                toast.textContent = text;
                toast.classList.add("show");
                clearTimeout(toastTimer);
                toastTimer = setTimeout(() => toast.classList.remove("show"), 2800);
            }
        }
    }

    /* ---------------- input ---------------- */
    function padPress(k) {
        if (k === "clr") padVal = "";
        else if (k === "ok") {
            if (padVal.length === 4) {
                $('[data-el="padMsg"]').textContent = "Memeriksa…";
                submitAction({ type: "code", value: padVal });
            } else $('[data-el="padMsg"]').textContent = "Butuh 4 digit.";
        } else if (padVal.length < 4) padVal += k;
        updatePad();
    }

    function actOn(id, forceInspect) {
        if (!state || state.phase !== "play") return;
        if (id === "door") { uiOverlay = "keypad"; padVal = ""; $('[data-el="padMsg"]').textContent = "Masukkan 4 digit."; render(); return; }
        if (state.turn !== mySeat()) return;
        if (armedItem && !forceInspect) { submitAction({ type: "use", item: armedItem, id }); armedItem = null; }
        else submitAction({ type: "inspect", id });
    }

    function handleAct(act) {
        switch (act) {
            case "start": submitAction({ type: "start", level: uiLevel }); break;
            case "replay": submitAction({ type: "start", level: state ? state.level : uiLevel }); break;
            case "next": submitAction({ type: "start", level: Math.min(LEVELS, (state ? state.level : uiLevel) + 1) }); break;
            case "restart": submitAction({ type: "start", level: state && state.layout ? state.level : uiLevel }); break;
            case "end": if (state && state.phase === "play" && state.turn === mySeat()) submitAction({ type: "end" }); break;
            case "notes": uiOverlay = uiOverlay === "notes" ? null : "notes"; render(); break;
            case "cheats": if (!online) { uiOverlay = uiOverlay === "cheats" ? null : "cheats"; render(); } break;
            case "close": uiOverlay = null; render(); break;
        }
    }

    function handleVirt(v) {
        const ids = presentIds();
        switch (v) {
            case "prev": sel = (sel - 1 + ids.length) % ids.length; render(); break;
            case "next": sel = (sel + 1) % ids.length; render(); break;
            case "act": actOn(ids[sel]); break;
            case "item": {
                if (!state) break;
                const its = Object.keys(state.items).filter((i) => state.items[i]);
                armedItem = !its.length ? null : its[(its.indexOf(armedItem) + 1) % its.length];
                render(); break;
            }
            case "pad": actOn("door"); break;
            case "notes": handleAct("notes"); break;
            case "end": handleAct("end"); break;
            case "cheat": handleAct("cheats"); break;
        }
    }

    function handleClick(event) {
        const el = event.target.closest("[data-exit],[data-act],[data-obj],[data-k],[data-item],[data-level],[data-cheat],[data-virt]");
        if (!el) return;
        if (el.hasAttribute("data-exit")) { onExit(); return; }
        if (el.dataset.act) { handleAct(el.dataset.act); return; }
        if (el.dataset.level) { if (!online || room.isHost) { uiLevel = +el.dataset.level; render(); } return; }
        if (el.dataset.k) { padPress(el.dataset.k); return; }
        if (el.dataset.item) { armedItem = armedItem === el.dataset.item ? null : el.dataset.item; render(); return; }
        if (el.dataset.cheat) { submitAction({ type: "cheat", key: el.dataset.cheat }); return; }
        if (el.dataset.virt) { handleVirt(el.dataset.virt); return; }
        if (el.dataset.obj) {
            const ids = presentIds();
            const idx = ids.indexOf(el.dataset.obj);
            if (idx >= 0) sel = idx;
            actOn(el.dataset.obj);
        }
    }

    function onKey(e) {
        if (destroyed || !state || e.ctrlKey || e.metaKey || e.altKey) return;
        const k = e.key;
        if (uiOverlay === "keypad") {
            if (/^[0-9]$/.test(k)) { e.preventDefault(); padPress(k); }
            else if (k === "Enter") { e.preventDefault(); padPress("ok"); }
            else if (k === "Backspace") { e.preventDefault(); padPress("clr"); }
            else if (k === "Escape") { e.preventDefault(); uiOverlay = null; render(); }
            return;
        }
        if (k === "Escape") { if (uiOverlay) uiOverlay = null; else armedItem = null; render(); return; }
        if (state.phase === "ready" && (k === "Enter" || k === " ")) {
            if (!online || room.isHost) { e.preventDefault(); submitAction({ type: "start", level: uiLevel }); }
            return;
        }
        if (state.phase !== "play") return;
        const ids = presentIds();
        if (k === "ArrowLeft" || k === "ArrowRight") {
            e.preventDefault();
            sel = (sel + (k === "ArrowRight" ? 1 : -1) + ids.length) % ids.length;
            render(); return;
        }
        if (k === "Enter" || k === " ") { e.preventDefault(); actOn(ids[sel]); return; }
        const low = k.toLowerCase();
        if (low === "i") actOn(ids[sel], true);
        else if (low === "u") { if (armedItem) actOn(ids[sel]); }
        else if (low === "n") handleAct("notes");
        else if (low === "k") actOn("door");
        else if (low === "e") handleAct("end");
        else if (low === "c") handleAct("cheats");
    }

    function onWheel(e) {
        if (!state || state.phase !== "play" || uiOverlay) return;
        e.preventDefault();
        const ids = presentIds();
        sel = (sel + (e.deltaY > 0 ? 1 : -1) + ids.length) % ids.length;
        render();
    }
    function onHover(e) {
        const g = e.target.closest ? e.target.closest("[data-obj]") : null;
        if (!g) return;
        const idx = presentIds().indexOf(g.dataset.obj);
        if (idx >= 0 && idx !== sel) { sel = idx; render(); }
    }

    root.addEventListener("click", handleClick);
    document.addEventListener("keydown", onKey);
    sceneSvg.addEventListener("wheel", onWheel, { passive: false });
    sceneSvg.addEventListener("pointerover", onHover);

    /* jam kosmetik (tidak memengaruhi state) */
    const clockTimer = setInterval(() => {
        if (state && state.phase === "play") hud.time.textContent = fmtTime((Date.now() - state.startedAt) / 1000);
    }, 500);

    /* ---------------- inisialisasi mode ---------------- */
    if (online) {
        const offRoom = room.onRoom((nextRoom) => { roomData = nextRoom; render(); });
        if (typeof offRoom === "function") offs.push(offRoom);
        if (room.isHost) {
            state = { phase: "ready", level: 1, seatMap: [0, 1], fx: { n: 0 } };
            publish();
            const offAction = room.onAction((action) => applyAction(action, state.seatMap ? state.seatMap[1] : 1));
            if (typeof offAction === "function") offs.push(offAction);
        } else {
            const offState = room.onState((nextState) => { state = nextState; render(); });
            if (typeof offState === "function") offs.push(offState);
        }
    } else {
        state = { phase: "ready", level: 1, seatMap: [0, 1], fx: { n: 0 } };
        render();
    }

    return {
        destroy() {
            destroyed = true;
            root.removeEventListener("click", handleClick);
            document.removeEventListener("keydown", onKey);
            sceneSvg.removeEventListener("wheel", onWheel);
            sceneSvg.removeEventListener("pointerover", onHover);
            clearTimeout(botTimer); clearTimeout(toastTimer); clearInterval(clockTimer);
            offs.forEach((off) => { try { off(); } catch { /* abaikan */ } });
        },
    };
}