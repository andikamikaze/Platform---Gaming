/*
 * pesta-bintang.js — "Pesta Bintang"
 * Party board game ala Mario Party Superstars (aset & karakter 100% orisinal).
 * Layout mengikuti sistem game-layout-redesign (HUD + board fill + overlay internal).
 */
import { iconSVG } from "../JS/icons.js";

export const META = {
    id: "pesta-bintang",
    name: "Pesta Bintang",
    category: "board",
    catLabel: "Board Game",
    desc: "Pesta papan 2-4 pemain: lempar dadu 1-10, kumpulkan koin, beli Bintang (20 koin), lalu adu skill di 10 minigame. Bintang bonus di akhir bisa membalikkan keadaan!",
    bg: ["#fcd34d", "#f472b6"],
    bestKey: "pestaBintangBest",
};

/* ---------- Data statis (sama di semua klien, tidak perlu disinkron) ---------- */
const CHARS = [
    { name: "Pip", emoji: "\u{1F98A}", color: "#f97316" },
    { name: "Momo", emoji: "\u{1F430}", color: "#14b8a6" },
    { name: "Bubu", emoji: "\u{1F43B}", color: "#8b5cf6" },
    { name: "Kiki", emoji: "\u{1F438}", color: "#ec4899" },
];
const ITEMS = [
    { id: "double", name: "Dadu Ganda", emoji: "\u{1F3B2}", desc: "Lempar 2 dadu di giliran ini" },
    { id: "magnet", name: "Magnet Koin", emoji: "\u{1F9F2}", desc: "Curi 5 koin dari pemain berikutnya" },
    { id: "swap", name: "Tukar Tempat", emoji: "\u{1F500}", desc: "Tukar posisi dengan pemain pilihan" },
];
const MEMO = ["\u{1F34E}", "\u{1F34B}", "\u{1F347}", "\u{1F340}"];
const KEYLABEL = ["A", "L", "\u25C0", "\u25B6"];
const PRESSKEYS = ["a", "l", "arrowleft", "arrowright"];

/* dur dalam tick (1 tick = 100ms) */
const GAMES = [
    { id: "coin-catch", name: "Coin Catch", type: "ffa", engine: "coin", dur: 200, icon: "\u{1FA99}", how: "Tekan saat penanda masuk zona hijau untuk menangkap koin. Tangkapan terbanyak menang!" },
    { id: "button-dash", name: "Button Dash", type: "ffa", engine: "mash", dur: 150, icon: "\u{1F3C3}", how: "Tekan tombol secepat mungkin! Pelari terjauh saat waktu habis menang." },
    { id: "dodge-spikes", name: "Dodge the Spikes", type: "ffa", engine: "spike", dur: 200, icon: "\u{1F335}", how: "Lompat tepat sebelum rintangan merah tiba (zona hijau). Punya 3 nyawa. Hindari terbanyak menang!" },
    { id: "memory-match", name: "Memory Match", type: "ffa", engine: "memory", dur: 200, icon: "\u{1F9E0}", how: "Hafalkan urutan 4 buah, lalu ulangi lewat tombolmu. 2 ronde. Benar terbanyak & salah tersedikit menang!" },
    { id: "tug-rope", name: "Tug of Rope", type: "2v2", engine: "mash", dur: 150, icon: "\u{1FAA2}", how: "Tim: tekan bergantian secepatnya! Tarik tali 15 langkah ke sisi timmu, atau unggul saat waktu habis." },
    { id: "paint-zone", name: "Paint Zone", type: "2v2", engine: "paint", dur: 180, icon: "\u{1F3A8}", how: "Tekan untuk mengecat petak netral dengan warna timmu (petak musuh bisa direbut). Area terluas menang!" },
    { id: "relay-run", name: "Relay Run", type: "2v2", engine: "mash", dur: 160, icon: "\u{1F3C1}", how: "Estafet! Paruh pertama: pelari 1 tiap tim menekan. Paruh kedua: pelari 2. Total langkah tim terbanyak menang." },
    { id: "boss-chase", name: "Boss Chase", type: "1v3", engine: "lane", dur: 180, icon: "\u{1F479}", how: "6 gelombang. Solo (bos): pilih jalur untuk menangkap. Trio: pindah jalur untuk menghindari bos. Solo menang jika semua tertangkap!" },
    { id: "fortress", name: "Fortress Defense", type: "1v3", engine: "lane", dur: 180, icon: "\u{1F3F0}", how: "6 gelombang. Solo: pilih gerbang untuk menyerang (gol jika tak dijaga). Trio: jaga gerbang. Solo butuh 4 gol; 3 gol = seri." },
    { id: "bomb-pass", name: "Bomb Pass", type: "1v3", engine: "bomb", dur: 150, icon: "\u{1F4A3}", how: "Trio: oper bom terus agar tak tertebak! Solo: tebak siapa pemegang bom saat meledak. Tebakan tepat = solo menang." },
];

/* Papan: 44 petak lingkaran luar + 6 petak jalur pintas = 50 petak. */
const N_OUT = 44, FORK = 10, JOIN = 18, N_BRANCH = 6;
const BOARD = (() => {
    const cx = 480, cy = 310, rx = 408, ry = 242, pts = [];
    for (let i = 0; i < N_OUT; i++) {
        const a = (-90 + (i * 360) / N_OUT) * Math.PI / 180;
        pts.push({ x: Math.round(cx + rx * Math.cos(a)), y: Math.round(cy + ry * Math.sin(a)) });
    }
    const A = pts[FORK], B = pts[JOIN], branch = [];
    for (let k = 1; k <= N_BRANCH; k++) {
        const t = k / (N_BRANCH + 1);
        const bx = A.x + (B.x - A.x) * t, by = A.y + (B.y - A.y) * t;
        branch.push({ x: Math.round(bx + (cx - bx) * 0.5), y: Math.round(by + (cy - by) * 0.5) });
    }
    const red = new Set([3, 7, 13, 17, 22, 27, 31, 36, 40, 45]);
    const evt = new Set([5, 15, 24, 33, 38, 46]);
    const itm = new Set([9, 20, 29, 41, 48]);
    const spaces = [];
    for (let i = 0; i < N_OUT + N_BRANCH; i++) {
        const p = i < N_OUT ? pts[i] : branch[i - N_OUT];
        const type = i === 0 ? "start" : red.has(i) ? "red" : evt.has(i) ? "event" : itm.has(i) ? "item" : "blue";
        let next;
        if (i === FORK) next = [FORK + 1, N_OUT];
        else if (i === N_OUT - 1) next = [0];
        else if (i === N_OUT + N_BRANCH - 1) next = [JOIN];
        else next = [i + 1];
        spaces.push({ x: p.x, y: p.y, type, next });
    }
    return spaces;
})();

const CSS = `
.ps-app.game-fill{display:flex;flex-direction:column;gap:8px;height:100%;min-height:0;color:#e2e8f0;font:14px/1.45 system-ui,sans-serif}
.ps-app.game-fill > .ps-board{flex:1 1 auto;min-height:0;aspect-ratio:auto;position:relative;overflow:auto;border:1px solid rgba(148,163,184,.22);border-radius:12px;padding:0;background:linear-gradient(160deg,#0b1220,#131c33)}
.ps-root{position:relative;min-height:100%;padding:14px;background:linear-gradient(160deg,#0b1220,#131c33);border-radius:12px}
.ps-root *{box-sizing:border-box}
.ps-hud{display:flex;align-items:center;gap:8px;flex-wrap:wrap;font:600 11px/1 ui-monospace,SFMono-Regular,Menlo,monospace}
.ps-chip{display:inline-flex;align-items:center;gap:4px;padding:5px 8px;border:1px solid rgba(148,163,184,.25);border-radius:8px;background:rgba(15,23,42,.55);font-size:10px;white-space:nowrap}
.ps-chip b{color:#fbbf24;font-weight:700}
.ps-spacer{flex:1 1 auto}
.ps-icon-btn{display:inline-flex;align-items:center;gap:6px}
.ps-icon-btn svg{flex:none;display:block}
.ps-btn{border:0;border-radius:10px;padding:8px 14px;font-weight:700;cursor:pointer;background:#334155;color:#fff;font-size:14px}
.ps-btn:disabled{opacity:.45;cursor:default}
.ps-btn.primary{background:linear-gradient(135deg,#f59e0b,#ec4899)}
.ps-btn.big{font-size:17px;padding:12px 22px}
.ps-btn.small{padding:4px 9px;font-size:13px}
.ps-btn.seg{background:#1e293b}
.ps-btn.seg.on{background:#f59e0b;color:#111}
.ps-btn.char{font-size:20px;padding:4px 8px;background:#1e293b;border:2px solid transparent}
.ps-btn.char.on{border-color:#f59e0b}
.ps-dim{opacity:.65;font-size:12px}
.ps-main{display:flex;gap:12px;flex-wrap:wrap}
.ps-boardcol{flex:1 1 460px;min-width:290px}
.ps-side{flex:1 1 250px;max-width:340px;display:flex;flex-direction:column;gap:8px}
.ps-svg{width:100%;height:auto;display:block;border-radius:16px}
.ps-topbar{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:6px}
.ps-round b{color:#fbbf24}
.ps-ordchip{font-size:17px;opacity:.45}
.ps-ordchip.on{opacity:1}
.ps-starhint{font-size:12px;opacity:.8}
.ps-banner{background:rgba(245,158,11,.15);border:1px solid #f59e0b;border-radius:10px;padding:6px 10px;margin:6px 0;font-size:13px}
.ps-pcard{background:#1e293b;border-radius:12px;padding:8px 10px;border-left:4px solid var(--pc)}
.ps-pcard.on{outline:2px solid #f59e0b}
.ps-pchead{display:flex;gap:6px;align-items:center}
.ps-av{font-size:20px}
.ps-pstats{margin:3px 0}
.ps-items{display:flex;gap:4px;align-items:center;min-height:26px}
.ps-item{font-size:16px}
.ps-itembtn{background:#0f172a;border:1px solid #f59e0b;border-radius:8px;font-size:16px;padding:2px 6px;cursor:pointer}
.ps-badge{background:#334155;border-radius:6px;padding:1px 6px;font-size:10px}
.ps-badge.you{background:#f59e0b;color:#111}
.ps-turnbox{background:#1e293b;border-radius:12px;padding:10px;display:flex;flex-direction:column;gap:8px}
.ps-dice{display:flex;gap:8px}
.ps-die{width:44px;height:44px;border-radius:10px;background:#fff;color:#111;font-size:24px;font-weight:800;display:grid;place-items:center}
.ps-dice.roll .ps-die{animation:ps-shake .25s infinite}
.ps-log{font-size:12px;opacity:.85;display:flex;flex-direction:column;gap:3px;max-height:120px;overflow:hidden}
.ps-legend{font-size:11px;opacity:.75;margin-top:4px}
.ps-overlay{position:absolute;inset:0;background:rgba(2,6,23,.75);display:flex;align-items:center;justify-content:center;z-index:30;border-radius:12px;padding:14px}
.ps-overlay[hidden]{display:none}
.ps-modal{background:#1e293b;border-radius:14px;padding:18px;max-width:460px;text-align:center;max-height:100%;overflow:auto}
.ps-card{width:min(620px,100%);max-height:100%;padding:16px;border-radius:14px;background:#1e293b;box-shadow:0 10px 30px rgba(2,6,23,.45);display:flex;flex-direction:column;overflow:hidden}
.ps-head,.ps-foot{flex:none}
.ps-help,.ps-cheats{flex:1 1 auto;min-height:0;overflow:auto}
.ps-foot{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:10px;padding-top:10px;border-top:1px solid #334155}
.ps-note{font-size:11px;opacity:.7}
.ps-lobrow{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:8px 0}
.ps-slots{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:8px}
.ps-slot{background:#1e293b;border-radius:12px;padding:10px;border-left:4px solid var(--pc)}
.ps-chars{display:flex;gap:4px;margin:6px 0}
.ps-resrow,.ps-bonusrow{display:flex;justify-content:space-between;gap:10px;padding:6px;border-bottom:1px solid #334155}
.ps-mghead{display:flex;gap:10px;align-items:center;margin-bottom:8px}
.ps-mgicon{font-size:30px}
.ps-mgtimer{flex:1;position:relative;height:16px;background:#0f172a;border-radius:8px;min-width:90px}
.ps-mgtimebar{height:100%;background:linear-gradient(90deg,#22c55e,#f59e0b);border-radius:8px;width:100%}
.ps-mgtimer span{position:absolute;right:6px;top:0;font-size:11px}
.ps-mgintro{text-align:center;padding:16px}
.ps-bigcount{font-size:56px;font-weight:800;color:#fbbf24}
.ps-mgpanels{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:8px}
.ps-mgpanel{background:#1e293b;border-radius:12px;padding:10px;border-top:4px solid #64748b}
.ps-mgphead{display:flex;justify-content:space-between;gap:6px;align-items:center;margin-bottom:6px}
.ps-mgphead b{font-size:18px;color:#fbbf24}
.ps-mash{width:100%;padding:13px;font-size:16px}
.ps-bar{height:18px;background:#0f172a;border-radius:9px;position:relative;overflow:hidden;margin:6px 0}
.ps-zone{position:absolute;left:42%;width:16%;height:100%;background:rgba(34,197,94,.5)}
.ps-marker{position:absolute;top:0;width:6px;height:100%;background:#fbbf24;border-radius:3px}
.ps-spikefill{height:100%;background:#ef4444;width:0}
.ps-spikefill.hot{background:#22c55e}
.ps-lives{font-size:12px;min-height:16px}
.ps-seqbtns{display:flex;gap:6px;justify-content:center;margin:6px 0;flex-wrap:wrap}
.ps-memseq{font-size:34px;text-align:center;margin:10px 0;letter-spacing:8px}
.ps-grid{display:grid;grid-template-columns:repeat(7,1fr);gap:4px;margin:8px 0}
.ps-cell{aspect-ratio:1;background:#334155;border-radius:6px}
.ps-cell.t0{background:#3b82f6}
.ps-cell.t1{background:#ef4444}
.ps-lanes{display:flex;gap:8px;margin:8px 0}
.ps-lanebox{flex:1;background:#1e293b;border-radius:10px;padding:8px;text-align:center}
.ps-laneocc{font-size:22px;min-height:32px}
.ps-rope{height:26px;background:#1e293b;border-radius:13px;position:relative;margin:14px 0}
.ps-ropemid{position:absolute;left:50%;width:2px;height:100%;background:#64748b}
.ps-ropemark{position:absolute;top:-6px;font-size:22px;transform:translateX(-50%);left:50%}
.ps-track{position:relative;background:#1e293b;border-radius:10px;padding:6px 36px 6px 6px;margin:8px 0}
.ps-trackrow{height:26px;position:relative}
.ps-runner{position:absolute;font-size:20px;transition:left .2s;left:0}
.ps-finish{position:absolute;right:6px;top:6px;bottom:6px;font-size:18px}
.ps-mgflash{text-align:center;min-height:22px;font-size:15px;font-weight:700;color:#fbbf24;margin-top:6px}
.ps-bombbadge{font-size:12px;font-weight:700;color:#f87171;min-height:16px}
.ps-teamsinfo{margin:8px 0}
.ps-podium{display:flex;gap:10px;align-items:flex-end;justify-content:center;margin:12px 0}
.ps-podcol{text-align:center;flex:1;max-width:120px}
.ps-podemoji{font-size:30px}
.ps-podname{font-size:12px;margin-bottom:4px;overflow:hidden;text-overflow:ellipsis}
.ps-podbar{border-radius:8px 8px 0 0;display:flex;align-items:flex-start;justify-content:center;color:#fff;font-size:20px;font-weight:800;padding-top:4px}
.ps-table{width:100%;border-collapse:collapse;font-size:13px;margin:8px 0}
.ps-table td,.ps-table th{padding:5px;border-bottom:1px solid #334155;text-align:left}
.ps-starpulse{animation:ps-pulse 1.2s infinite}
.ps-tokenon{filter:drop-shadow(0 0 6px #fbbf24)}
.ps-wait{padding:30px;text-align:center}
.ps-rules h4{margin:10px 0 4px}
.ps-rules ul{margin:4px 0;padding-left:18px;text-align:left}
@keyframes ps-pulse{50%{opacity:.5}}
@keyframes ps-shake{25%{transform:rotate(-8deg)}75%{transform:rotate(8deg)}}
@media(max-width:640px){.ps-side{max-width:none}.ps-mgpanels{grid-template-columns:repeat(auto-fit,minmax(150px,1fr))}}

/* --- layout overrides: HARUS di akhir (lebih spesifik dari pointer:coarse) --- */
@media(max-width:640px){
.ps-app.game-fill > .ps-board:not(:has(.ps-overlay:not([hidden]))){flex:1 1 auto;min-height:0;aspect-ratio:auto}
.ps-app.game-fill > .ps-board:has(.ps-overlay:not([hidden])){flex:0 0 auto;min-height:min(70dvh,620px);aspect-ratio:auto}
.ps-app .ps-hud{gap:5px;margin-bottom:0}
.ps-app .ps-hud .ps-chip{padding:4px 6px;font-size:9px}
.ps-app .ps-hud .ps-chip[data-chip="players"]{display:none}
.ps-app .ps-hud .ps-btn{min-height:32px;padding:5px 9px;font-size:9px}
.ps-app .ps-hud .ps-btn-label,.ps-app .ps-hud .ps-spacer{display:none}
.ps-app .ps-overlay{padding:8px}
.ps-app .ps-card{width:100%;height:100%;max-height:100%;padding:12px;border-radius:12px}
.ps-app .ps-help,.ps-app .ps-cheats{scrollbar-width:none}
.ps-app .ps-help::-webkit-scrollbar,.ps-app .ps-cheats::-webkit-scrollbar{display:none}
.ps-app .ps-foot{position:static;margin:8px 0 0;padding:10px 0 0;border-top:1px solid #334155}
.ps-app .ps-note{display:none}
}
`;

/* ---------- Mount ---------- */
export function mount(root, context = {}) {
    const { mode = "ai", room = null, playerName = "Player", onExit = () => { } } = context;
    const online = mode === "room" && Boolean(room);
    const playerIndex = online && !room.isHost ? 1 : 0;
    let roomData = room?.room || null;
    let state = null;
    let destroyed = false, waiter = null, renderKey = "";
    let epoch = 0; /* setiap restart menaikkan epoch: loop lama berhenti setelah sleep-nya selesai */
    let helpOpen = false, cheatsOpen = false;
    let unRoom = null, unAction = null, unState = null;
    const HELP_FLAG = "pestaBintangHelpSeen";
    const prefs = { sfx: 0.8, music: 0.3 };
    const timers = new Set();

    /* Bantuan internal: tampil sekali pada peluncuran pertama. */
    try {
        if (localStorage.getItem(HELP_FLAG) !== "1") {
            helpOpen = true;
            localStorage.setItem(HELP_FLAG, "1");
        }
    } catch (_) { /* localStorage diblokir; bantuan tetap bisa dibuka dengan H */ }

    root.innerHTML = `
    <div class="game-app ps-app game-fill" data-ps>
      <style>${CSS}</style>
      <div class="ps-hud">
        <span class="ps-chip">PUTARAN <b data-hud="round">0/15</b></span>
        <span class="ps-chip">GILIRAN <b data-hud="turn">&mdash;</b></span>
        <span class="ps-chip" data-chip="players">PEMAIN <b data-hud="players">4</b></span>
        <span class="ps-chip">BINTANG <b data-hud="stars">0</b></span>
        <span class="ps-chip">KOIN <b data-hud="coins">10</b></span>
        <span class="ps-chip">STATUS <b data-hud="status">Lobi</b></span>
        <span class="ps-spacer"></span>
        <button class="ps-btn ps-icon-btn" type="button" data-help aria-label="Cara main" title="Cara main (H)">${iconSVG("helpCircle", { size: 14 })}<span class="ps-btn-label">Bantuan</span></button>
        <button class="ps-btn ps-icon-btn" type="button" data-cheats aria-label="Cheat" title="Cheat (C)">${iconSVG("wrench", { size: 14 })}<span class="ps-btn-label">Cheat</span></button>
        <button class="ps-btn ps-icon-btn" type="button" data-pause aria-label="Jeda" title="Jeda (P / Esc)"><span data-hud="pauseicon">${iconSVG("pause", { size: 14 })}</span><span class="ps-btn-label">Jeda</span></button>
        <button class="ps-btn ps-icon-btn" type="button" data-restart aria-label="Ulangi" title="Ulangi (R)">${iconSVG("refresh", { size: 14 })}<span class="ps-btn-label">Ulangi</span></button>
        <button class="ps-btn ps-icon-btn" type="button" data-exit aria-label="Keluar game" title="Keluar game">${iconSVG("logOut", { size: 14 })}<span class="ps-btn-label">Keluar</span></button>
      </div>
      <section class="game-panel ps-board" data-board></section>
    </div>`;
    const boardEl = root.querySelector("[data-board]");

    /* ---------- Util ---------- */
    const esc = (t) => String(t).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
    const ri = (n) => Math.floor(Math.random() * n);
    const gameDef = (id) => GAMES.find((g) => g.id === id);
    function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = ri(i + 1);[a[i], a[j]] = [a[j], a[i]]; } return a; }
    /* Timer mentah (tidak ikut jeda) — dipakai gatePause agar tetap menunggu saat game dijeda. */
    function rawSleep(ms) {
        return new Promise((res) => {
            if (destroyed) { res(); return; }
            const rec = { t: null, res };
            rec.t = setTimeout(() => { timers.delete(rec); res(); }, ms);
            timers.add(rec);
        });
    }
    /* Timer sadar-jeda: sisa waktu dibekukan saat state.paused, dilanjutkan saat resume. */
    function sleep(ms) {
        return new Promise((res) => {
            const rec = { t: null, res, left: ms, started: 0, pausedAt: 0 };
            const finish = () => { if (rec.t) clearTimeout(rec.t); rec.t = null; timers.delete(rec); res(); };
            const arm = () => {
                if (destroyed) { finish(); return; }
                if (state && state.paused) { rec.pausedAt = Date.now(); return; }
                if (rec.pausedAt) { rec.left = Math.max(0, rec.left - (Date.now() - rec.pausedAt)); rec.pausedAt = 0; }
                rec.started = Date.now();
                rec.t = setTimeout(() => { rec.t = null; finish(); }, rec.left);
            };
            rec.pause = () => {
                if (rec.pausedAt || destroyed) return;
                if (rec.t) { clearTimeout(rec.t); rec.t = null; rec.left = Math.max(0, rec.left - (Date.now() - rec.started)); }
                rec.pausedAt = Date.now();
            };
            rec.resume = () => { if (rec.pausedAt) arm(); };
            timers.add(rec);
            arm();
        });
    }
    function pauseSleeps(on) {
        timers.forEach((r) => {
            if (on && typeof r.pause === "function") r.pause();
            else if (!on && typeof r.resume === "function") r.resume();
        });
    }
    function note(t) { state.log.push(t); if (state.log.length > 6) state.log.shift(); }
    function gain(pi, n) { const p = state.players[pi]; p.coins += n; p.stats.gained += n; }
    function lose(pi, n) { const p = state.players[pi]; p.coins = Math.max(0, p.coins - n); }
    function canAct(pi) {
        const p = state?.players[pi];
        if (!p || !p.human || p.cpu) return false;
        return online ? pi === playerIndex : true;
    }
    /* Cheat hanya untuk host / mode lokal. Tamu room tidak boleh memakainya. */
    function canCheat() { return !online || Boolean(room?.isHost); }
    function active(ep) { return !destroyed && epoch === ep; }
    function restartSession() {
        epoch++;
        timers.forEach((r) => { if (r.t) clearTimeout(r.t); r.t = null; r.res(); });
        timers.clear();
        if (waiter) waiter.done(null);
    }
    async function gatePause() { while (state?.paused && !destroyed) await rawSleep(150); }

    /* ---------- Audio (sintetis, orisinal, tanpa aset) ---------- */
    let AC = null, musicTimer = null, musicStep = 0;
    const MELODY = [523, 659, 784, 659, 880, 784, 659, 523, 587, 698, 880, 698, 784, 659, 587, 494];
    function beep(f, t, d, type, vol) {
        const C = window.AudioContext || window.webkitAudioContext;
        if (!C || vol <= 0) return;
        try {
            AC = AC || new C();
            if (AC.state === "suspended") AC.resume().catch(() => { });
            const o = AC.createOscillator(), g = AC.createGain(), now = AC.currentTime + t;
            o.type = type; o.frequency.value = f;
            g.gain.setValueAtTime(vol, now);
            g.gain.exponentialRampToValueAtTime(0.0001, now + d);
            o.connect(g); g.connect(AC.destination);
            o.start(now); o.stop(now + d + 0.02);
        } catch { }
    }
    function sfx(kind) {
        if (prefs.sfx <= 0) return;
        const S = {
            roll: [[220, 0, .05], [330, .06, .05], [440, .12, .06]],
            coin: [[880, 0, .07], [1320, .07, .09]],
            star: [[523, 0, .1], [659, .1, .1], [784, .2, .1], [1047, .3, .18]],
            bad: [[180, 0, .15], [120, .12, .2]],
            step: [[300, 0, .03]],
            item: [[660, 0, .08], [990, .08, .1]],
            go: [[440, 0, .1], [660, .12, .15]],
            win: [[523, 0, .12], [659, .12, .12], [784, .24, .12], [1047, .36, .25]],
            jump: [[500, 0, .05], [700, .05, .06]],
            hit: [[150, 0, .12]],
            pass: [[600, 0, .05]],
        }[kind];
        if (S) S.forEach(([f, t, d]) => beep(f, t, d, "square", 0.12 * prefs.sfx));
    }
    function ensureAudio() {
        if (musicTimer || prefs.music <= 0) return;
        musicTimer = setInterval(() => {
            if (destroyed || !state || state.paused || state.phase === "lobby" || prefs.music <= 0) return;
            beep(MELODY[musicStep++ % MELODY.length], 0, 0.18, "triangle", 0.05 * prefs.music);
        }, 250);
    }

    /* ---------- State ---------- */
    function lobbyState(prev) {
        const players = [0, 1, 2, 3].map((i) => {
            const human = prev ? prev.players[i].human : i === 0 || (online && i === 1);
            const char = prev ? prev.players[i].char : i;
            return {
                name: i === 0 ? (playerName || "Kamu") : online && i === 1 ? "Tamu" : CHARS[char].name,
                char, human, cpu: !human, coins: 10, stars: 0, pos: 0, items: [],
                stats: { mg: 0, gained: 0, events: 0 },
            };
        });
        return {
            phase: "lobby", count: prev ? prev.count : 4,
            settings: { turns: prev ? prev.settings.turns : 15 },
            players, order: [], orderRolls: [], round: 0, turnIdx: 0, current: null,
            sub: "pre", dice: null, prompt: null, stepsLeft: 0, itemUsed: false, double: false,
            star: 25, banner: null, log: [], mg: null, bonus: [], ranking: [], shared: false,
            paused: false, lastMG: null,
        };
    }
    function setChar(i, c) {
        if (i == null || c == null || i < 0 || i > 3 || c < 0 || c > 3) return;
        const ps = state.players;
        const other = ps.findIndex((p, j) => j !== i && p.char === c);
        if (other >= 0) ps[other].char = ps[i].char;
        ps[i].char = c;
        if (i > 0 && !(online && i === 1)) ps[i].name = CHARS[c].name;
    }
    function relocateStar(excl) {
        const cand = BOARD.map((s, i) => i).filter((i) => BOARD[i].type !== "start" && i !== excl);
        return cand[ri(cand.length)];
    }

    function publish() {
        render();
        if (online && room.isHost) room.publishState(state).catch(console.warn);
    }

    /* ---------- Render ---------- */
    function syncUI() {
        const s = state;
        const set = (key, val) => {
            const el = root.querySelector(`[data-hud="${key}"]`);
            if (el && el.textContent !== String(val)) el.textContent = String(val);
        };
        const focus = s && s.current != null ? s.players[s.current] : s?.players?.[0];
        set("round", s ? `${s.round}/${s.settings.turns}` : "0/0");
        set("turn", s && s.current != null ? `P${s.current + 1} ${s.players[s.current].name}` : "\u2014");
        set("players", s ? s.count : 4);
        set("stars", focus ? focus.stars : 0);
        set("coins", focus ? focus.coins : 10);
        set("status", !s ? "Lobi" :
            s.phase === "lobby" ? "Lobi" :
                s.phase === "order" ? "Undian urutan" :
                    s.phase === "mg" ? "Minigame" :
                        s.phase === "bonus" ? "Bintang bonus" :
                            s.phase === "results" ? "Hasil" :
                                `Putaran ${s.round}/${s.settings.turns}`);
        const pbtn = root.querySelector("[data-pause]");
        if (pbtn) {
            const paused = !!s?.paused;
            const label = pbtn.querySelector(".ps-btn-label");
            if (label) label.textContent = paused ? "Lanjut" : "Jeda";
            pbtn.setAttribute("aria-label", paused ? "Lanjut" : "Jeda");
            pbtn.setAttribute("title", paused ? "Lanjut (P / Esc)" : "Jeda (P / Esc)");
            const icon = pbtn.querySelector('[data-hud="pauseicon"]');
            if (icon && icon.dataset.icon !== (paused ? "play" : "pause")) {
                icon.innerHTML = iconSVG(paused ? "play" : "pause", { size: 14 });
                icon.dataset.icon = paused ? "play" : "pause";
            }
            pbtn.disabled = (online && !room.isHost) || s?.phase === "lobby" || s?.phase === "results";
            const cbtn = root.querySelector("[data-cheats]");
            if (cbtn) cbtn.disabled = !canCheat() || s?.phase === "lobby" || s?.phase === "results";
            const rbtn = root.querySelector("[data-restart]");
            if (rbtn) rbtn.disabled = online && !room.isHost;
        }
    }
    function render() {
        syncUI();
        if (!boardEl) return;
        if (!state) { boardEl.innerHTML = '<div class="ps-root"><div class="ps-wait">Menghubungkan ke room\u2026</div></div>'; return; }
        const s = state;
        let html;
        if (s.phase === "lobby") html = vLobby();
        else if (s.phase === "order") html = vOrder();
        else if (s.phase === "mg") html = vMG();
        else if (s.phase === "bonus") html = vBonus();
        else if (s.phase === "results") html = vResults();
        else html = vBoard();
        /* Overlay internal selalu hadir; help menimpa semua overlay lainnya. */
        html += vHelp();
        html += vCheats();
        if (s.paused && s.phase !== "lobby" && s.phase !== "results" && !helpOpen && !cheatsOpen) html += vPause();
        /* Saat minigame berlangsung, patch DOM (bukan re-render) agar tombol mash tidak hilang di tengah klik. */
        if (s.phase === "mg" && s.mg && s.mg.phase === "play") {
            const key = `mgplay:${s.mg.id}:${s.mg.round ?? 0}:${s.mg.stage ?? ""}:${s.paused}:${helpOpen}:${cheatsOpen}`;
            if (key !== renderKey) { boardEl.innerHTML = `<div class="ps-root">${html}</div>`; renderKey = key; }
            patchMG();
        } else {
            boardEl.innerHTML = `<div class="ps-root">${html}</div>`;
            renderKey = "";
        }
    }

    function vLobby() {
        const s = state, host = !online || room.isHost;
        return `<div class="ps-lobby">
      <h3>\u{1F389} Lobi Pesta</h3>
      <div class="ps-lobrow"><label>Pemain:</label>${[2, 3, 4].map((n) => `<button class="ps-btn seg ${s.count === n ? "on" : ""}" data-act="lobby" data-k="count" data-v="${n}" ${host ? "" : "disabled"}>${n}</button>`).join("")}
      <label>Putaran:</label>${[10, 15, 20].map((n) => `<button class="ps-btn seg ${s.settings.turns === n ? "on" : ""}" data-act="lobby" data-k="turns" data-v="${n}" ${host ? "" : "disabled"}>${n}</button>`).join("")}</div>
      <div class="ps-slots">${s.players.slice(0, s.count).map((p, i) => slotRow(p, i, host)).join("")}</div>
      <div class="ps-lobrow"><label>\u{1F50A} SFX</label><input type="range" min="0" max="100" value="${Math.round(prefs.sfx * 100)}" data-vol="sfx">
      <label>\u{1F3B5} Musik</label><input type="range" min="0" max="100" value="${Math.round(prefs.music * 100)}" data-vol="music"></div>
      <div class="ps-lobrow"><button class="ps-btn" data-act="rules">\u{1F4D6} Cara Main</button>
      ${host ? '<button class="ps-btn primary big" data-act="start">\u25B6\uFE0F Mulai Pesta!</button>' : '<span class="ps-dim">Menunggu host memulai\u2026</span>'}</div>
      <p class="ps-dim">Mode lokal: semua slot bisa Manusia (hotseat) atau CPU. Mode room: host = P1, tamu = P2, sisanya CPU.</p>
    </div>`;
    }
    function slotRow(p, i, host) {
        const c = CHARS[p.char];
        const charEditable = !online || i === playerIndex;
        return `<div class="ps-slot" style="--pc:${c.color}">
      <div><b>P${i + 1}</b> ${esc(p.name)} ${online ? (i === 0 ? '<span class="ps-badge you">Host</span>' : i === 1 ? '<span class="ps-badge you">Tamu</span>' : '<span class="ps-badge">CPU</span>') : ""}</div>
      <div class="ps-chars">${CHARS.map((ch, j) => `<button class="ps-btn char ${p.char === j ? "on" : ""}" data-act="lobby" data-k="char" data-p="${i}" data-v="${j}" ${charEditable ? "" : "disabled"}>${ch.emoji}</button>`).join("")}</div>
      ${!online ? `<button class="ps-btn small" data-act="lobby" data-k="human" data-p="${i}" ${host ? "" : "disabled"}>${p.human ? "\u{1F464} Manusia" : "\u{1F916} CPU"}</button>` : ""}
    </div>`;
    }
    function vOrder() {
        const s = state;
        return `<div><h3>\u{1F3B2} Undian Urutan Main</h3>
      ${s.players.slice(0, s.count).map((p, i) => `<div class="ps-resrow"><span>${CHARS[p.char].emoji} ${esc(p.name)}</span><b>${s.orderRolls[i] ?? "\u2026"}</b></div>`).join("")}
      ${s.order.length ? `<p>Urutan: ${s.order.map((pi) => CHARS[s.players[pi].char].emoji).join(" \u2192 ")}</p>` : '<p class="ps-dim">Dadu tertinggi jalan duluan. Seri = ulang.</p>'}</div>`;
    }
    function vBoard() {
        const s = state;
        return `<div>
      <div class="ps-topbar">
        <span class="ps-round">Putaran <b>${s.round}/${s.settings.turns}</b></span>
        <span>${s.order.map((pi, i) => `<span class="ps-ordchip ${i === s.turnIdx ? "on" : ""}">${CHARS[s.players[pi].char].emoji}</span>`).join("")}</span>
        <span class="ps-starhint">\u2B50 di petak #${s.star}</span>
        <button class="ps-btn small" data-act="rules">\u{1F4D6}</button>
      </div>
      ${s.banner ? `<div class="ps-banner">${esc(s.banner)}</div>` : ""}
      <div class="ps-main">
        <div class="ps-boardcol">${boardSVG()}<div class="ps-legend">\u{1F535} +3 \u00B7 \u{1F534} \u22123 \u00B7 \u{1F7E2} ! event \u00B7 \u{1F7E3} \u{1F381} item \u00B7 \u{1F6A9} aman \u00B7 \u2B50 toko Bintang (pindah setelah dibeli)</div></div>
        <aside class="ps-side">${s.players.slice(0, s.count).map((p, i) => playerCard(p, i)).join("")}${turnBox()}${logBox()}</aside>
      </div>
      ${promptOverlay()}
    </div>`;
    }
    function boardSVG() {
        const s = state;
        const outer = BOARD.slice(0, N_OUT).map((sp) => `${sp.x},${sp.y}`).join(" ");
        const branchPts = [BOARD[FORK], ...BOARD.slice(N_OUT), BOARD[JOIN]].map((sp) => `${sp.x},${sp.y}`).join(" ");
        const fill = { blue: "#3b82f6", red: "#ef4444", event: "#22c55e", item: "#a855f7", start: "#f59e0b" };
        const icon = { blue: "+", red: "\u2212", event: "!", item: "\u{1F381}", start: "\u{1F6A9}" };
        const spaces = BOARD.map((sp, i) => `<g><circle cx="${sp.x}" cy="${sp.y}" r="17" fill="${fill[sp.type]}" stroke="#fff" stroke-width="2"/><text x="${sp.x}" y="${sp.y + 5}" text-anchor="middle" font-size="${sp.type === "item" || sp.type === "start" ? 13 : 16}" fill="#fff" font-weight="bold">${icon[sp.type]}</text></g>`).join("");
        const star = BOARD[s.star];
        const offs = [[-11, -13], [11, -13], [-11, 13], [11, 13]];
        const tokens = s.players.slice(0, s.count).map((p, i) => {
            const sp = BOARD[p.pos], c = CHARS[p.char];
            return `<g class="${i === s.current ? "ps-tokenon" : ""}"><circle cx="${sp.x + offs[i][0]}" cy="${sp.y + offs[i][1]}" r="13" fill="${c.color}" stroke="#fff" stroke-width="2"/><text x="${sp.x + offs[i][0]}" y="${sp.y + offs[i][1] + 5}" text-anchor="middle" font-size="14">${c.emoji}</text></g>`;
        }).join("");
        return `<svg class="ps-svg" viewBox="0 0 960 620" role="img" aria-label="Papan permainan">
      <rect width="960" height="620" rx="24" fill="#0f172a"/>
      <ellipse cx="480" cy="310" rx="330" ry="170" fill="#1e293b"/>
      <polygon points="${outer}" fill="none" stroke="#475569" stroke-width="10" stroke-linejoin="round"/>
      <polyline points="${branchPts}" fill="none" stroke="#475569" stroke-width="8" stroke-dasharray="8 7"/>
      <text x="480" y="300" text-anchor="middle" font-size="30" fill="#334155" font-weight="bold">PESTA BINTANG</text>
      <text x="480" y="330" text-anchor="middle" font-size="14" fill="#64748b">\u2B50 = lokasi Bintang saat ini</text>
      ${spaces}
      <text x="${star.x}" y="${star.y - 24}" text-anchor="middle" font-size="26" class="ps-starpulse">\u2B50</text>
      ${tokens}
    </svg>`;
    }
    function playerCard(p, i) {
        const s = state, c = CHARS[p.char];
        const on = i === s.current && s.phase === "board";
        const usable = on && s.sub === "pre" && !s.itemUsed && canAct(i);
        return `<div class="ps-pcard ${on ? "on" : ""}" style="--pc:${c.color}">
      <div class="ps-pchead"><span class="ps-av">${c.emoji}</span><b>${esc(p.name)}</b>${p.cpu ? '<span class="ps-badge">CPU</span>' : online && i === playerIndex ? '<span class="ps-badge you">Kamu</span>' : !online && p.human ? `<span class="ps-badge you">P${i + 1}</span>` : ""}</div>
      <div class="ps-pstats">\u{1FA99} <b>${p.coins}</b> \u00B7 \u2B50 <b>${p.stars}</b></div>
      <div class="ps-items">${p.items.map((it, j) => { const I = ITEMS.find((x) => x.id === it); return usable ? `<button class="ps-itembtn" title="${I.name}: ${I.desc}" data-act="item" data-v="${j}">${I.emoji}</button>` : `<span class="ps-item" title="${I.name}">${I.emoji}</span>`; }).join("") || '<span class="ps-dim">tas kosong</span>'}</div>
    </div>`;
    }
    function turnBox() {
        const s = state;
        if (s.current == null) return "";
        const p = s.players[s.current], c = CHARS[p.char];
        const dice = `<div class="ps-dice ${s.sub === "rolling" ? "roll" : ""}">${(s.dice || ["?"]).map((d) => `<span class="ps-die">${d}</span>`).join("")}</div>`;
        let inner;
        if (s.sub === "pre") inner = canAct(s.current)
            ? `<button class="ps-btn primary big" data-act="roll">\u{1F3B2} Lempar Dadu${s.double ? " \u00D72" : ""}</button><div class="ps-dim">Spasi / Enter \u00B7 boleh pakai 1 item dulu</div>`
            : `<div class="ps-dim">${p.cpu ? "\u{1F916} CPU berpikir\u2026" : "Menunggu " + esc(p.name) + "\u2026"}</div>`;
        else if (s.sub === "rolling") inner = '<div class="ps-dim">Mengocok dadu\u2026</div>';
        else if (s.sub === "moving") inner = `<div class="ps-dim">Melangkah\u2026 sisa ${s.stepsLeft}</div>`;
        else inner = '<div class="ps-dim">Giliran selesai</div>';
        return `<div class="ps-turnbox"><div>${c.emoji} Giliran <b>${esc(p.name)}</b></div>${dice}${inner}</div>`;
    }
    function logBox() { return `<div class="ps-log">${state.log.slice().reverse().map((t) => `<div>${esc(t)}</div>`).join("")}</div>`; }
    const shopBtns = () => '<div class="ps-lobrow"><button class="ps-btn primary" data-act="shop" data-v="buy">\u2B50 Beli (\u221220 \u{1FA99})</button><button class="ps-btn" data-act="shop" data-v="skip">Lewati</button></div>';
    const waitMsg = () => `<p class="ps-dim">Menunggu pilihan ${esc(state.players[state.current].name)}\u2026</p>`;
    function promptOverlay() {
        const s = state, pr = s.prompt;
        if (!pr || helpOpen || cheatsOpen) return "";
        const act = canAct(s.current);
        let body = "";
        if (pr.kind === "fork") body = `<h3>\u{1F531} Percabangan!</h3><p>Pilih jalur:</p>${act ? `<div class="ps-lobrow">${pr.opts.map((o) => `<button class="ps-btn primary" data-act="fork" data-v="${o}">${o >= N_OUT ? "\u2197\uFE0F Jalur Pintas" : "\u2B06\uFE0F Jalur Luar"}</button>`).join("")}</div>` : waitMsg()}`;
        else if (pr.kind === "shopPass") body = `<h3>\u2B50 Melewati Bintang!</h3><p>Berhenti di sini dan beli Bintang (20 \u{1FA99})? Sisa langkahmu hangus.</p>${act ? shopBtns() : waitMsg()}`;
        else if (pr.kind === "shop") body = `<h3>\u2B50 Toko Bintang</h3><p>Beli 1 Bintang seharga 20 \u{1FA99}? Koinmu: ${s.players[s.current].coins}</p>${act ? shopBtns() : waitMsg()}`;
        else if (pr.kind === "swap") body = `<h3>\u{1F500} Tukar Tempat</h3><p>Pilih pemain:</p>${act ? `<div class="ps-lobrow">${[...Array(s.count).keys()].filter((i) => i !== s.current).map((i) => `<button class="ps-btn" data-act="itemTarget" data-v="${i}">${CHARS[s.players[i].char].emoji} ${esc(s.players[i].name)}</button>`).join("")}</div>` : waitMsg()}`;
        return `<div class="ps-overlay"><div class="ps-modal">${body}</div></div>`;
    }

    /* ---------- Tampilan minigame ---------- */
    function typeLabel(G, mg) {
        if (G.type === "ffa") return "Semua vs Semua";
        if (G.type === "2v2") return `Tim ${mg.teams[0].length}v${mg.teams[1].length}`;
        return `1 vs ${mg.group.length}`;
    }
    function teamInfo(mg) {
        const s = state;
        if (mg.teams) return `<div class="ps-teamsinfo"><span style="color:#60a5fa">\u{1F535} ${mg.teams[0].map((pi) => esc(s.players[pi].name)).join(" & ")}</span> vs <span style="color:#f87171">\u{1F534} ${mg.teams[1].map((pi) => esc(s.players[pi].name)).join(" & ")}</span></div>`;
        if (mg.solo != null) return `<div class="ps-teamsinfo">Solo: <b>${esc(s.players[mg.solo].name)}</b> vs ${mg.group.map((pi) => esc(s.players[pi].name)).join(", ")}</div>`;
        return "";
    }
    function rewardHint(G) {
        if (G.type === "ffa") return "Juara +10 \u{1FA99} \u00B7 Runner-up +5 \u{1FA99} (seri dibagi rata)";
        if (G.type === "2v2") return "Tim menang: +10 \u{1FA99}/pemain \u00B7 seri: +5";
        return "Solo menang +10 \u00B7 Trio menang +10/pemain";
    }
    function rowResult(r) {
        const p = state.players[r.p];
        return `<div class="ps-resrow"><span>${["\u{1F947}", "\u{1F948}", "\u{1F949}", "4\uFE0F\u20E3"][r.place - 1] || "\u25AA\uFE0F"}</span><span>${CHARS[p.char].emoji} ${esc(p.name)}</span><b>${r.coins > 0 ? `+${r.coins} \u{1FA99}` : "\u2014"}</b></div>`;
    }
    function vMG() {
        const s = state, mg = s.mg, G = gameDef(mg.id);
        const head = `<div class="ps-mghead"><span class="ps-mgicon">${G.icon}</span><div><b>${G.name}</b><br><small class="ps-dim">${typeLabel(G, mg)}${mg.sudden ? " \u00B7 \u26A1 SUDDEN DEATH" : ""}</small></div><div class="ps-mgtimer"><div class="ps-mgtimebar" data-mg="timebar"></div><span data-mg="time"></span></div></div>`;
        if (mg.phase === "intro") return `<div>${head}<div class="ps-mgintro"><div class="ps-bigcount">${mg.count}</div><p>${G.how}</p>${teamInfo(mg)}<p class="ps-dim">${rewardHint(G)}</p></div></div>`;
        if (mg.phase === "done") return `<div>${head}<div><h3>${esc(mg.headline || "")}</h3>${(mg.results || []).map(rowResult).join("")}<p class="ps-dim">Kembali ke papan\u2026</p></div></div>`;
        let arena = "";
        if (G.engine === "paint") arena = `<div class="ps-grid">${mg.grid.map((v, k) => `<div class="ps-cell" data-mg="cell-${k}"></div>`).join("")}</div>`;
        else if (G.engine === "lane") arena = `<div class="ps-lanes">${[0, 1, 2].map((l) => `<div class="ps-lanebox"><small>${["Kiri", "Tengah", "Kanan"][l]}</small><div class="ps-laneocc" data-mg="lane-${l}"></div></div>`).join("")}</div>`;
        else if (G.engine === "memory") arena = `<div class="ps-memseq">${mg.stage === "show" ? mg.seq.map((v) => MEMO[v]).join(" ") : "\u{1F914} Ulangi urutannya!"}</div>`;
        else if (G.engine === "mash" && G.id === "tug-rope") arena = `<div class="ps-rope"><div class="ps-ropemid"></div><div class="ps-ropemark" data-mg="rope">\u{1FAA2}</div></div><div class="ps-teamsinfo"><span style="color:#60a5fa">\u{1F535} ${mg.teams[0].map((pi) => esc(s.players[pi].name)).join(" & ")}</span> vs <span style="color:#f87171">\u{1F534} ${mg.teams[1].map((pi) => esc(s.players[pi].name)).join(" & ")}</span></div>`;
        else if (G.engine === "mash") arena = `<div class="ps-track">${mg.players.map((pi, i) => `<div class="ps-trackrow"><div class="ps-runner" data-mg="run-${i}">${CHARS[s.players[pi].char].emoji}</div></div>`).join("")}<div class="ps-finish">\u{1F3C1}</div></div><div class="ps-dim" data-mg="leg"></div>`;
        else if (G.engine === "bomb") arena = `<div class="ps-teamsinfo">\u{1F4A3} Bom meledak saat waktu habis. Solo menebak <b>sekali</b>; trio boleh mengoper kapan saja saat memegang bom.</div>`;
        const panels = mg.players.map((pi, i) => mgPanel(G, mg, pi, i)).join("");
        return `<div>${head}${arena}<div class="ps-mgpanels">${panels}</div><div class="ps-mgflash" data-mg="flash"></div></div>`;
    }
    function mgPanel(G, mg, pi, i) {
        const s = state, p = s.players[pi], c = CHARS[p.char];
        const team = mg.teams ? mg.teams.findIndex((t) => t.includes(pi)) : -1;
        const tcol = team === 0 ? "#3b82f6" : team === 1 ? "#ef4444" : pi === mg.solo ? "#f59e0b" : c.color;
        const act = canAct(pi);
        const keyHint = act ? `<small class="ps-dim">\u2328\uFE0F ${online ? "Spasi" : KEYLABEL[i]}</small>` : "";
        let body = "";
        if (G.engine === "mash" || G.engine === "coin" || G.engine === "spike" || G.engine === "paint") {
            let viz = "";
            if (G.engine === "coin") viz = '<div class="ps-bar"><div class="ps-zone"></div><div class="ps-marker" data-mg="mk-' + i + '"></div></div>';
            if (G.engine === "spike") viz = `<div class="ps-bar"><div class="ps-spikefill" data-mg="sp-${i}"></div></div><div data-mg="lv-${i}" class="ps-lives"></div>`;
            const lbl = { mash: "TEKAN!", coin: "Tangkap! \u{1FA99}", spike: "Lompat! \u2934\uFE0F", paint: "Cat! \u{1F58C}\uFE0F" }[G.engine];
            body = `${viz}<button class="ps-btn primary ps-mash" data-act="mg" data-k="press" data-p="${pi}" data-mg="press-${i}" ${act ? "" : "disabled"}>${lbl}</button>${keyHint}`;
        } else if (G.engine === "memory") {
            body = mg.stage === "show"
                ? '<div class="ps-dim">Hafalkan urutan di atas\u2026</div>'
                : `<div class="ps-seqbtns">${MEMO.map((m, v) => `<button class="ps-btn char" data-act="mg" data-k="seq" data-v="${v}" data-p="${pi}" ${act ? "" : "disabled"}>${m}</button>`).join("")}</div><div data-mg="sq-${i}" class="ps-dim"></div>`;
        } else if (G.engine === "lane") {
            const role = pi === mg.solo ? (mg.mode === "chase" ? "\u{1F479} Bos" : "\u2694\uFE0F Penyerang") : (mg.mode === "chase" ? "\u{1F3C3} Pelari" : "\u{1F6E1}\uFE0F Penjaga");
            body = `<div class="ps-dim">${role}</div><div class="ps-seqbtns">${[0, 1, 2].map((l) => `<button class="ps-btn char" data-act="mg" data-k="lane" data-v="${l}" data-p="${pi}" data-mg="lane-${i}-${l}" ${act ? "" : "disabled"}>${["\u2B05\uFE0F", "\u2B06\uFE0F", "\u27A1\uFE0F"][l]}</button>`).join("")}</div>`;
        } else if (G.engine === "bomb") {
            if (pi === mg.solo) body = `<div class="ps-dim">\u{1F3AF} Tebak pemegang bom terakhir:</div><div class="ps-seqbtns">${mg.group.map((q) => `<button class="ps-btn char" data-act="mg" data-k="guess" data-v="${q}" data-p="${pi}" data-mg="guess-${q}" ${act ? "" : "disabled"}>${CHARS[s.players[q].char].emoji}</button>`).join("")}</div><div data-mg="gtxt" class="ps-dim"></div>`;
            else body = `<div data-mg="bomb-${i}" class="ps-bombbadge"></div><button class="ps-btn primary" data-act="mg" data-k="press" data-p="${pi}" data-mg="press-${i}" ${act ? "" : "disabled"}>Oper! \u{1F4A3}</button>${keyHint}`;
        }
        return `<div class="ps-mgpanel" style="border-top-color:${tcol}">
      <div class="ps-mgphead"><span>${c.emoji} ${esc(p.name)}</span>${p.cpu ? '<span class="ps-badge">CPU</span>' : online && pi === playerIndex ? '<span class="ps-badge you">Kamu</span>' : ""}<b data-mg="sc-${i}">0</b></div>${body}</div>`;
    }
    const markerPos = (mg, i) => (mg.tick * 3 + mg.off[i]) % 100;
    function teamScores(mg) {
        return mg.teams.map((t) => t.reduce((a, pi) => a + mg.scores[mg.players.indexOf(pi)], 0));
    }
    function patchMG() {
        const s = state, mg = s.mg;
        if (!mg) return;
        const G = gameDef(mg.id);
        const q = (k) => boardEl.querySelector(`[data-mg="${k}"]`);
        const tb = q("timebar"); if (tb) tb.style.width = (100 * (1 - mg.tick / mg.dur)) + "%";
        const tm = q("time"); if (tm) tm.textContent = Math.max(0, Math.ceil((mg.dur - mg.tick) / 10)) + "s";
        const fl = q("flash"); if (fl) fl.textContent = mg.flash || "";
        mg.players.forEach((pi, i) => {
            const sc = q("sc-" + i); if (sc) sc.textContent = mg.scores[i];
            const pr = q("press-" + i);
            if (G.engine === "coin") { const mk = q("mk-" + i); if (mk) mk.style.left = markerPos(mg, i) + "%"; }
            if (G.engine === "spike") {
                const sp = q("sp-" + i);
                if (sp) { const d = mg.arr[i] - mg.tick; sp.style.width = Math.max(0, Math.min(100, 100 - (d / 48) * 100)) + "%"; sp.className = "ps-spikefill" + (d <= 4 && d >= 0 ? " hot" : ""); }
                const lv = q("lv-" + i); if (lv) lv.textContent = mg.dead[i] ? "\u{1F480}" : "\u2764\uFE0F".repeat(Math.max(0, mg.lives[i]));
                if (pr) pr.disabled = !canAct(pi) || !!mg.dead[i];
            }
            if (G.engine === "mash" && G.id === "relay-run" && pr) {
                const leg = mg.tick < mg.dur / 2 ? 0 : 1;
                const team = mg.teams.findIndex((t) => t.includes(pi));
                pr.disabled = !canAct(pi) || mg.teams[team].indexOf(pi) !== leg;
            }
            if (G.engine === "memory") { const sq = q("sq-" + i); if (sq) sq.textContent = `${mg.idx[i]}/4 \u00B7 \u2714\uFE0F${mg.ok[i]} \u2716\uFE0F${mg.miss[i]}`; }
            if (G.engine === "lane") [0, 1, 2].forEach((l) => { const b = q(`lane-${i}-${l}`); if (b) b.className = "ps-btn char" + (mg.lane[i] === l ? " on" : ""); });
            if (G.engine === "bomb") {
                const bb = q("bomb-" + i); if (bb) bb.textContent = mg.group[mg.holder] === pi ? "\u{1F4A3} PEMEGANG BOM" : "";
                if (pr && pi !== mg.solo) pr.disabled = !canAct(pi) || mg.group[mg.holder] !== pi;
                if (pi === mg.solo) {
                    mg.group.forEach((gp) => { const gb = q("guess-" + gp); if (gb) gb.disabled = !canAct(pi) || mg.guess >= 0; });
                    const gt = q("gtxt"); if (gt) gt.textContent = mg.guess >= 0 ? `Tebakan: ${CHARS[s.players[mg.guess].char].emoji} ${s.players[mg.guess].name}` : "";
                }
            }
        });
        if (G.engine === "paint") mg.grid.forEach((v, k) => { const c = q("cell-" + k); if (c) c.className = "ps-cell" + (v === 0 ? " t0" : v === 1 ? " t1" : ""); });
        if (G.engine === "lane") [0, 1, 2].forEach((l) => {
            const box = q("lane-" + l);
            if (box) box.innerHTML = mg.players.map((pi, i) => mg.lane[i] === l ? (mg.out[i] ? "\u{1F480}" : CHARS[s.players[pi].char].emoji) : "").join(" ");
        });
        if (G.engine === "mash" && G.id === "tug-rope") {
            const [a, b] = teamScores(mg);
            const rp = q("rope"); if (rp) rp.style.left = Math.max(4, Math.min(96, 50 + ((a - b) / 15) * 46)) + "%";
        }
        if (G.engine === "mash" && G.id !== "tug-rope") {
            mg.players.forEach((pi, i) => { const r = q("run-" + i); if (r) r.style.left = Math.min(94, (mg.scores[i] / 45) * 94) + "%"; });
            const lg = q("leg"); if (lg) lg.textContent = G.id === "relay-run" ? (mg.tick < mg.dur / 2 ? "\u{1F3C3} Leg 1: pelari pertama tiap tim" : "\u{1F3C3} Leg 2: pelari kedua tiap tim") : "";
        }
    }
    function vBonus() {
        const s = state;
        return `<div><h3>\u2B50 Bintang Bonus</h3>
      ${s.bonus.map((b) => `<div class="ps-bonusrow"><b>${b.label}</b><span>${b.none ? '<span class="ps-dim">tidak ada pemenang</span>' : b.winners.map((pi) => `${CHARS[s.players[pi].char].emoji} ${esc(s.players[pi].name)} +1\u2B50`).join(", ")}</span></div>`).join("")}
      <p class="ps-dim">Menghitung hasil akhir\u2026</p></div>`;
    }
    function vResults() {
        const s = state, rank = s.ranking;
        const places = {}; let pl = 1;
        rank.forEach((pi, i) => {
            if (i > 0) { const a = s.players[rank[i - 1]], b = s.players[pi]; if (!(a.stars === b.stars && a.coins === b.coins && a.stats.mg === b.stats.mg)) pl = i + 1; }
            places[pi] = pl;
        });
        const winners = rank.filter((pi) => places[pi] === 1);
        const heights = [120, 92, 70, 54];
        return `<div>
      <h3>\u{1F3C6} ${winners.map((pi) => esc(s.players[pi].name)).join(" & ")} menang!${s.shared ? " (gelar bersama)" : ""}</h3>
      <div class="ps-podium">${rank.map((pi) => { const p = s.players[pi], c = CHARS[p.char]; return `<div class="ps-podcol"><div class="ps-podemoji">${c.emoji}</div><div class="ps-podname">${esc(p.name)}</div><div class="ps-podbar" style="height:${heights[places[pi] - 1] || 50}px;background:${c.color}"><b>${places[pi]}</b></div><div class="ps-dim">\u2B50${p.stars} \u00B7 \u{1FA99}${p.coins}</div></div>`; }).join("")}</div>
      <table class="ps-table"><tr><th>#</th><th>Pemain</th><th>\u2B50</th><th>\u{1FA99}</th><th>\u{1F3AE} Menang</th><th>\u2757 Event</th></tr>
      ${rank.map((pi) => { const p = s.players[pi]; return `<tr><td>${places[pi]}</td><td>${CHARS[p.char].emoji} ${esc(p.name)}${p.cpu ? " \u{1F916}" : ""}</td><td>${p.stars}</td><td>${p.coins}</td><td>${p.stats.mg}</td><td>${p.stats.events}</td></tr>`; }).join("")}</table>
      <p class="ps-dim">Rekor tersimpan: \u2B50 ${readBest().stars} \u00B7 \u{1F3C6} ${readBest().wins} kemenangan</p>
      <div class="ps-lobrow">
        ${!online || room.isHost ? '<button class="ps-btn primary" data-act="again">\u{1F501} Main Lagi</button><button class="ps-btn" data-act="again">\u2699\uFE0F Ubah Pengaturan</button>' : '<span class="ps-dim">Menunggu host untuk main lagi\u2026</span>'}
        <button class="ps-btn" data-act="menu">\u{1F3E0} Menu Utama</button>
      </div></div>`;
    }
    function helpBody() {
        return `<ul>
        <li>\u{1F3B2} Tiap giliran: boleh pakai <b>1 item</b>, lalu lempar dadu <b>1\u201310</b> dan melangkah. Di percabangan, pilih jalur.</li>
        <li>\u{1F535} Biru +3 koin \u00B7 \u{1F534} Merah \u22123 \u00B7 \u{1F7E2} ! = event acak \u00B7 \u{1F7E3} \u{1F381} = item (maks 3) \u00B7 \u{1F6A9} aman.</li>
        <li>\u2B50 Mendarat / melewati lokasi Bintang: beli 1 Bintang <b>20 koin</b>. Setelah dibeli, Bintang pindah.</li>
        <li>\u{1F3AE} Setelah semua pemain jalan, ada <b>minigame</b>: juara +10 koin, runner-up +5 (tim menang +10/pemain).</li>
        <li>\u{1F3C6} Setelah putaran terakhir: 3 <b>Bintang Bonus</b> (minigame terbanyak, koin terkumpul, event terbanyak). Bintang terbanyak menang!</li>
        <li>\u2696\uFE0F Seri? Adu koin \u2192 adu kemenangan minigame \u2192 sudden death.</li>
      </ul>
      <h4>\u{1F392} Item</h4>
      <ul><li>\u{1F3B2} Dadu Ganda: 2 dadu giliran ini.</li><li>\u{1F9F2} Magnet Koin: curi 5 koin dari pemain berikutnya.</li><li>\u{1F500} Tukar Tempat: tukar posisi dengan pemain pilihan.</li></ul>
      <h4>\u2328\uFE0F Kontrol</h4>
      <ul><li>Papan: klik tombol / Spasi / Enter. Bantuan: H \u00B7 Cheat: C \u00B7 Jeda: P / Esc \u00B7 Ulangi: R.</li><li>Minigame hotseat: P1=A, P2=L, P3=\u25C0, P4=\u25B6 (atau tap tombol masing-masing).</li><li>Online: Spasi / tap tombolmu sendiri. Tombol Aturan di papan membuka panduan ini lagi.</li></ul>`;
    }
    function vHelp() {
        return `<div class="ps-overlay" data-ov="help" ${helpOpen ? "" : "hidden"}>
      <div class="ps-card">
        <div class="ps-head"><h3>\u{1F4D6} Cara Main (1 menit)</h3><button class="ps-btn small" type="button" data-help-close aria-label="Tutup bantuan">Tutup</button></div>
        <div class="ps-help ps-rules">${helpBody()}</div>
        <div class="ps-foot"><span class="ps-note">Tekan H untuk membuka lagi</span><button class="ps-btn primary" type="button" data-help-close>Mengerti</button></div>
      </div>
    </div>`;
    }
    function vCheats() {
        const ok = canCheat();
        const b = (k, label) => `<button class="ps-btn" type="button" data-act="cheat" data-k="${k}" ${ok ? "" : "disabled"}>${label}</button>`;
        return `<div class="ps-overlay" data-ov="cheat" ${cheatsOpen && ok && !helpOpen ? "" : "hidden"}>
      <div class="ps-card">
        <div class="ps-head"><h3>\u{1F527} Cheat (host / lokal)</h3><button class="ps-btn small" type="button" data-cheat-close aria-label="Tutup cheat">Tutup</button></div>
        <div class="ps-cheats">
          <p class="ps-dim">Cheat aman: hanya pemain host / lokal yang boleh memakainya. Tamu room tidak bisa.</p>
          <div class="ps-lobrow">${b("coins", "+20 \u{1FA99}")}${b("star", "+1 \u2B50")}${b("mg", "\u26A1 Paksa Minigame")}${b("skip", "\u23ED\uFE0F Lewati Giliran")}</div>
          <p class="ps-dim">Paksa minigame &amp; lewati giliran berlaku pada putaran/giliran berjalan. Tekan C untuk menutup.</p>
        </div>
        <div class="ps-foot"><span class="ps-note">Hanya untuk bermain santai</span><button class="ps-btn primary" type="button" data-cheat-close>Selesai</button></div>
      </div>
    </div>`;
    }
    function vPause() {
        return `<div class="ps-overlay" data-ov="pause"><div class="ps-card">
      <div class="ps-head"><h3>\u23F8\uFE0F Jeda</h3></div>
      <div class="ps-cheats">
        <div class="ps-lobrow"><label>\u{1F50A} SFX</label><input type="range" min="0" max="100" value="${Math.round(prefs.sfx * 100)}" data-vol="sfx"></div>
        <div class="ps-lobrow"><label>\u{1F3B5} Musik</label><input type="range" min="0" max="100" value="${Math.round(prefs.music * 100)}" data-vol="music"></div>
      </div>
      <div class="ps-foot"><button class="ps-btn primary" data-act="pause" data-v="0">\u25B6\uFE0F Lanjut</button><button class="ps-btn" data-act="rules">\u{1F4D6} Aturan</button><button class="ps-btn" data-act="menu">\u{1F3E0} Menu</button></div>
    </div></div>`;
    }

    /* ---------- Aksi & validasi ---------- */
    function submitAction(a) {
        if (online && !room.isHost) { room.sendAction(a).catch(console.warn); return; }
        let actor = playerIndex;
        if (!online) {
            if (a.t === "mg") actor = a.p;
            else if (["roll", "item", "fork", "shop", "itemTarget"].includes(a.t)) actor = state?.current ?? 0;
            else actor = 0;
        }
        applyAction(a, actor);
    }
    function cheatAction(a, actor) {
        const s = state;
        if (!canCheat() || actor !== playerIndex) return;
        if (!["coins", "star", "mg", "skip"].includes(a.k)) return;
        if (s.phase === "lobby" || s.phase === "results") return;
        const pi = s.current != null ? s.current : playerIndex;
        const p = s.players[pi];
        if (!p) return;
        if (a.k === "coins") { gain(pi, 20); note(`\u{1F527} ${p.name} +20 \u{1FA99} (cheat)`); sfx("coin"); }
        else if (a.k === "star") { p.stars++; note(`\u{1F527} ${p.name} +1 \u2B50 (cheat)`); sfx("star"); }
        else if (a.k === "mg") {
            if (s.phase !== "board" || s.paused) return;
            s.forceMG = true;
            note(`\u{1F527} Minigame dipaksa setelah putaran ini`);
        } else if (a.k === "skip") {
            if (s.paused) return;
            s.skipTurn = true; s.skipTarget = pi;
            if (waiter && waiter.p === s.current) waiter.done({ t: "skip" });
        }
        publish();
    }
    function applyAction(a, actor) {
        if (!state || destroyed || !a || typeof a !== "object") return;
        if (a.t === "cheat") { cheatAction(a, actor); return; }
        if (a.t === "pause") {
            if ((!online || actor === 0) && state.phase !== "lobby" && state.phase !== "results") {
                state.paused = !!a.v;
                pauseSleeps(state.paused);
                publish();
            }
            return;
        }
        if (a.t === "restart") {
            if (helpOpen || cheatsOpen) return;
            if (!online || actor === 0) { restartSession(); state = lobbyState(state); renderKey = ""; publish(); }
            return;
        }
        if (state.paused) return;
        if (state.phase === "lobby") { lobbyAction(a, actor); return; }
        if (state.phase === "results") { if (a.t === "again" && (!online || actor === 0)) { restartSession(); state = lobbyState(state); renderKey = ""; publish(); } return; }
        if (a.t === "mg") { mgInput(a, actor); return; }
        if (waiter && waiter.kinds.includes(a.t) && actor === waiter.p) {
            if (a.t === "fork" && (!state.prompt || state.prompt.kind !== "fork" || !state.prompt.opts.includes(a.v))) return;
            if (a.t === "shop" && a.v !== "buy" && a.v !== "skip") return;
            if (a.t === "item") {
                if (state.sub !== "pre" || state.itemUsed) return;
                const p = state.players[actor];
                if (!p || a.v == null || a.v < 0 || a.v >= p.items.length) return;
            }
            if (a.t === "itemTarget" && (a.v == null || a.v === actor || !state.players[a.v] || a.v >= state.count)) return;
            if (a.t === "roll" && state.sub !== "pre") return;
            waiter.done(a);
        }
    }
    function lobbyAction(a, actor) {
        if (online && actor !== 0) {
            if (a.t === "lobby" && a.k === "char" && a.p === 1) { setChar(1, a.v); publish(); }
            return;
        }
        if (a.t === "start") { startGame(); return; }
        if (a.t !== "lobby") return;
        const s = state;
        if (a.k === "count" && [2, 3, 4].includes(a.v)) s.count = a.v;
        else if (a.k === "turns" && [10, 15, 20].includes(a.v)) s.settings.turns = a.v;
        else if (a.k === "human" && !online && a.p >= 0 && a.p < 4) s.players[a.p].human = !s.players[a.p].human;
        else if (a.k === "char") setChar(a.p, a.v);
        else return;
        publish();
    }
    /* Menunggu aksi pemain manusia; timeout 30 dtk -> digantikan CPU (fair-play). */
    function waitTurn(p, kinds, ms = 30000) {
        return new Promise((res) => {
            const w = {
                p, kinds, timer: null,
                done(v) { if (waiter !== w) return; waiter = null; clearTimeout(w.timer); res(v); },
            };
            const arm = () => {
                w.timer = setTimeout(() => {
                    if (destroyed) { w.done(null); return; }
                    if (state && state.paused) { arm(); return; }
                    w.done(null);
                }, ms);
            };
            waiter = w; arm();
        });
    }

    /* ---------- Alur permainan (hanya host / lokal yang menjalankan) ---------- */
    async function startGame() {
        if (!state || state.phase !== "lobby" || state.count < 2) return;
        const ep = epoch, s = state;
        s.phase = "order"; s.paused = false; s.order = []; s.orderRolls = []; s.log = []; s.ranking = []; s.bonus = []; s.shared = false;
        for (let i = 0; i < s.count; i++) {
            const p = s.players[i];
            p.coins = 10; p.stars = 0; p.pos = 0; p.items = []; p.cpu = !p.human;
            p.stats = { mg: 0, gained: 0, events: 0 };
        }
        s.star = relocateStar(-1);
        publish();
        let rolls, guard = 0;
        do { rolls = Array.from({ length: s.count }, () => 1 + ri(10)); guard++; } while (new Set(rolls).size !== rolls.length && guard < 60);
        for (let i = 0; i < s.count; i++) {
            s.orderRolls[i] = rolls[i]; sfx("roll"); publish();
            await sleep(500); if (!active(ep)) return;
        }
        s.order = [...Array(s.count).keys()].sort((a, b) => rolls[b] - rolls[a]);
        note("\u{1F3B2} Urutan: " + s.order.map((i) => s.players[i].name).join(" \u2192 "));
        publish(); await sleep(1400); if (!active(ep)) return;
        await mainLoop();
    }
    async function mainLoop() {
        const ep = epoch, s = state;
        for (let r = 1; r <= s.settings.turns; r++) {
            s.round = r; s.banner = null;
            const rem = s.settings.turns - r + 1;
            if (rem === 5) s.banner = "\u26A0\uFE0F 5 putaran tersisa \u2014 Bintang bonus masih bisa membalikkan keadaan!";
            if (rem === 1) s.banner = "\u{1F3C1} PUTARAN TERAKHIR!";
            for (let t = 0; t < s.order.length; t++) {
                s.turnIdx = t; publish();
                await doTurn(s.order[t]); if (!active(ep)) return;
            }
            if (s.forceMG) {
                s.forceMG = false;
                let fg;
                do { fg = GAMES[ri(GAMES.length)]; } while (fg.id === s.lastMG);
                s.lastMG = fg.id;
                note(`\u26A1 Minigame paksa: ${fg.name}`);
                publish();
                await runMinigame(fg.id, [...Array(s.count).keys()]); if (!active(ep)) return;
            }
            let g;
            do { g = GAMES[ri(GAMES.length)]; } while (g.id === s.lastMG);
            s.lastMG = g.id;
            await runMinigame(g.id, [...Array(s.count).keys()]); if (!active(ep)) return;
        }
        await bonusPhase(); if (!active(ep)) return;
        await finish();
    }
    async function doTurn(pi) {
        const ep = epoch, s = state, p = s.players[pi];
        s.current = pi; s.sub = "pre"; s.dice = null; s.prompt = null; s.itemUsed = false; s.double = false; s.stepsLeft = 0;
        publish();
        let rolled = false, skipped = false;
        while (!rolled && !skipped && active(ep)) {
            await gatePause(); if (!active(ep)) return;
            if (s.skipTurn && s.skipTarget === pi) { s.skipTurn = false; skipped = true; break; }
            if (p.cpu) { await sleep(650); if (!active(ep)) return; cpuItem(pi); rolled = true; break; }
            const a = await waitTurn(pi, ["roll", "item"]); if (!active(ep)) return;
            if (!a) { p.cpu = true; note(`\u23F1\uFE0F ${p.name} tidak aktif \u2014 digantikan CPU`); publish(); continue; }
            if (a.t === "skip") { skipped = true; break; }
            if (a.t === "roll") { rolled = true; break; }
            if (a.t === "item") { await useItem(pi, a.v); if (!active(ep)) return; s.itemUsed = true; publish(); }
        }
        if (!active(ep)) return;
        if (skipped) {
            s.skipTurn = false; s.sub = "done"; s.prompt = null; s.dice = null;
            note(`\u23ED\uFE0F Giliran ${p.name} dilewati (cheat)`);
            publish(); await sleep(350); return;
        }
        s.sub = "rolling";
        for (let i = 0; i < 7; i++) {
            s.dice = s.double ? [1 + ri(10), 1 + ri(10)] : [1 + ri(10)];
            publish(); await sleep(80); if (!active(ep)) return;
        }
        const d1 = 1 + ri(10), d2 = s.double ? 1 + ri(10) : 0;
        s.dice = d2 ? [d1, d2] : [d1];
        sfx("roll");
        note(`\u{1F3B2} ${p.name} melempar ${d2 ? `${d1}+${d2}=${d1 + d2}` : d1}`);
        publish(); await sleep(650); if (!active(ep)) return;
        s.sub = "moving";
        await moveSteps(pi, d1 + d2); if (!active(ep)) return;
        await resolveLanding(pi, 0); if (!active(ep)) return;
        s.sub = "done"; s.prompt = null;
        publish(); await sleep(450);
    }
    function applyItem(pi, it, target) {
        const s = state, p = s.players[pi];
        if (it === "double") { s.double = true; note(`\u{1F3B2} ${p.name} memakai Dadu Ganda!`); }
        else if (it === "magnet") {
            const oi = s.order[(s.order.indexOf(pi) + 1) % s.order.length];
            const t = s.players[oi], st = Math.min(5, t.coins);
            t.coins -= st; gain(pi, st);
            note(`\u{1F9F2} ${p.name} mencuri ${st} \u{1FA99} dari ${t.name}`); sfx("coin");
        } else if (it === "swap") {
            const t = s.players[target];
            [p.pos, t.pos] = [t.pos, p.pos];
            note(`\u{1F500} ${p.name} \u21C4 ${t.name} bertukar posisi`);
        }
    }
    async function useItem(pi, idx) {
        const ep = epoch, s = state, p = s.players[pi];
        const it = p.items[idx];
        if (!it) return;
        p.items.splice(idx, 1);
        if (it === "swap") {
            let target = null;
            s.prompt = { kind: "swap" }; publish();
            const a = await waitTurn(pi, ["itemTarget"]); if (!active(ep)) return;
            if (!a) p.cpu = true; else target = a.v;
            s.prompt = null;
            if (target == null) { const others = [...Array(s.count).keys()].filter((i) => i !== pi); target = others[ri(others.length)]; }
            applyItem(pi, it, target);
        } else applyItem(pi, it);
        publish(); await sleep(450);
    }
    function cpuItem(pi) {
        const s = state, p = s.players[pi];
        let idx = p.items.indexOf("double");
        if (idx >= 0) { p.items.splice(idx, 1); applyItem(pi, "double"); publish(); return; }
        idx = p.items.indexOf("magnet");
        if (idx >= 0) {
            const oi = s.order[(s.order.indexOf(pi) + 1) % s.order.length];
            if (s.players[oi].coins >= 5) { p.items.splice(idx, 1); applyItem(pi, "magnet"); publish(); return; }
        }
        idx = p.items.indexOf("swap");
        if (idx >= 0 && Math.random() < 0.35) {
            p.items.splice(idx, 1);
            const others = [...Array(s.count).keys()].filter((i) => i !== pi);
            applyItem(pi, "swap", others[ri(others.length)]); publish();
        }
    }
    function distToStar(start, max = 12) {
        let frontier = [start], d = 0;
        while (d < max) {
            const nf = [];
            for (const i of frontier) { if (i === state.star) return d; nf.push(...BOARD[i].next); }
            frontier = nf; d++;
        }
        return 99;
    }
    function cpuFork(opts) {
        const ds = opts.map((o) => distToStar(o));
        const best = Math.min(...ds);
        return best < 99 ? opts[ds.indexOf(best)] : opts[ri(opts.length)];
    }
    async function moveSteps(pi, n) {
        const ep = epoch, s = state, p = s.players[pi];
        let left = n;
        while (left > 0 && active(ep)) {
            await gatePause(); if (!active(ep)) return;
            const opts = BOARD[p.pos].next;
            let nx = opts[0];
            if (opts.length > 1) {
                if (!p.cpu) {
                    s.prompt = { kind: "fork", opts }; publish();
                    const a = await waitTurn(pi, ["fork"]); if (!active(ep)) return;
                    if (!a) { p.cpu = true; nx = cpuFork(opts); } else nx = a.v;
                    s.prompt = null;
                } else nx = cpuFork(opts);
            }
            if (nx === s.star && p.coins >= 20 && left > 1) {
                let stop = true;
                if (!p.cpu) {
                    s.prompt = { kind: "shopPass" }; publish();
                    const a = await waitTurn(pi, ["shop"]); if (!active(ep)) return;
                    if (!a) p.cpu = true; else stop = a.v === "buy";
                    s.prompt = null;
                }
                if (stop) { p.pos = nx; s.stepsLeft = 0; publish(); sfx("step"); await sleep(260); return; }
            }
            p.pos = nx; left--; s.stepsLeft = left;
            publish(); sfx("step"); await sleep(260);
        }
    }
    async function resolveLanding(pi, depth) {
        const ep = epoch, s = state, p = s.players[pi], sp = BOARD[p.pos];
        if (sp.type === "blue") { gain(pi, 3); note(`\u{1F535} ${p.name} +3 \u{1FA99}`); sfx("coin"); }
        else if (sp.type === "red") { lose(pi, 3); note(`\u{1F534} ${p.name} \u22123 \u{1FA99}`); sfx("bad"); }
        else if (sp.type === "item") {
            if (p.items.length < 3) { const I = ITEMS[ri(ITEMS.length)]; p.items.push(I.id); note(`\u{1F381} ${p.name} mendapat ${I.name}`); sfx("item"); }
            else note(`\u{1F381} Tas ${p.name} penuh!`);
        }
        else if (sp.type === "event" && depth === 0) {
            p.stats.events++;
            publish(); await sleep(400); if (!active(ep)) return;
            await doEvent(pi); if (!active(ep)) return;
        }
        else if (sp.type === "start") note(`\u{1F6A9} ${p.name} di petak aman`);
        publish(); await sleep(650); if (!active(ep)) return;
        if (p.pos === s.star) await starShop(pi);
    }
    async function starShop(pi) {
        const ep = epoch, s = state, p = s.players[pi];
        if (p.coins < 20) { note(`\u2B50 ${p.name} tak mampu membeli Bintang (butuh 20 \u{1FA99})`); publish(); return; }
        let buy = true;
        if (!p.cpu) {
            s.prompt = { kind: "shop" }; publish();
            const a = await waitTurn(pi, ["shop"]); if (!active(ep)) return;
            if (!a) p.cpu = true; else buy = a.v === "buy";
            s.prompt = null;
        }
        if (buy) {
            p.coins -= 20; p.stars++;
            sfx("star"); note(`\u2B50 ${p.name} membeli Bintang! Total ${p.stars}\u2B50`);
            s.star = relocateStar(s.star);
            publish(); await sleep(900);
        } else { note(`${p.name} melewati Bintang`); publish(); }
    }
    async function doEvent(pi) {
        const ep = epoch, s = state, p = s.players[pi], ev = ri(5);
        if (ev === 0) { for (let i = 0; i < s.count; i++) gain(i, 2); s.banner = "\u{1F327}\uFE0F Hujan Koin! Semua pemain +2 \u{1FA99}"; sfx("coin"); }
        else if (ev === 1) { gain(pi, 5); s.banner = `\u{1F340} Hari Beruntung! ${p.name} +5 \u{1FA99}`; sfx("coin"); }
        else if (ev === 2) { lose(pi, 5); s.banner = `\u{1F99D} Pencuri! ${p.name} \u22125 \u{1FA99}`; sfx("bad"); }
        else if (ev === 3) {
            p.pos = ri(BOARD.length);
            s.banner = `\u{1F300} Teleport! ${p.name} pindah ke petak #${p.pos}`;
            publish(); await sleep(800); if (!active(ep)) return;
            await resolveLanding(pi, 1);
        }
        else { s.star = relocateStar(s.star); s.banner = `\u2B50 Bintang berpindah ke petak #${s.star}!`; sfx("item"); }
        note(s.banner);
        publish(); await sleep(900);
    }

    /* ---------- Mesin minigame ---------- */
    function buildMG(id, parts, opts = {}) {
        const G = gameDef(id);
        const mg = { id, phase: "intro", tick: 0, dur: G.dur, players: [...parts], scores: parts.map(() => 0), count: 5, sudden: !!opts.sudden, early: false, flash: "" };
        const sh = shuffle([...parts]);
        if (G.type === "2v2") { const h = Math.ceil(sh.length / 2); mg.teams = [sh.slice(0, h), sh.slice(h)]; }
        if (G.type === "1v3") { mg.solo = sh[0]; mg.group = sh.slice(1); }
        if (G.engine === "coin") { mg.off = parts.map(() => ri(100)); mg.lock = parts.map(() => 0); }
        if (G.engine === "spike") { mg.arr = parts.map(() => 30 + ri(25)); mg.lives = parts.map(() => 3); mg.dead = parts.map(() => 0); mg.dodge = parts.map(() => 0); }
        if (G.engine === "memory") { mg.round = 0; mg.stage = "show"; mg.seq = Array.from({ length: 4 }, () => ri(4)); mg.idx = parts.map(() => 0); mg.miss = parts.map(() => 0); mg.ok = parts.map(() => 0); mg.next = parts.map(() => 0); }
        if (G.engine === "paint") mg.grid = Array(35).fill(-1);
        if (G.engine === "lane") { mg.mode = id === "boss-chase" ? "chase" : "defend"; mg.lane = parts.map(() => ri(3)); mg.out = parts.map(() => false); mg.goals = 0; mg.pulse = 0; }
        if (G.engine === "bomb") { mg.holder = 0; mg.guess = -1; mg.passes = 0; }
        mg.last = parts.map(() => -9);
        return mg;
    }
    async function runMinigame(id, parts, opts = {}) {
        const ep = epoch, s = state, G = gameDef(id);
        s.mg = buildMG(id, parts, opts);
        s.phase = "mg"; publish();
        for (let c = 5; c > 0; c--) {
            s.mg.count = c; publish();
            await sleep(1000); if (!active(ep)) return null;
            await gatePause(); if (!active(ep)) return null;
        }
        s.mg.phase = "play"; sfx("go"); publish();
        while (s.mg.tick < s.mg.dur && !s.mg.early && active(ep)) {
            await sleep(100); if (!active(ep)) return null;
            if (s.paused) continue;
            s.mg.tick++;
            engineTick(G, s.mg);
            if (s.mg.tick % 2 === 0) publish();
        }
        if (!active(ep)) return null;
        s.mg.phase = "done";
        const res = mgResults(G, s.mg, opts);
        s.mg.results = res.rows; s.mg.headline = res.headline;
        if (!opts.sudden) {
            for (const r of res.rows) {
                if (r.coins > 0) gain(r.p, r.coins);
                if (r.win) s.players[r.p].stats.mg++;
            }
            note("\u{1F3AE} " + res.headline);
        }
        publish(); sfx("win");
        await sleep(3600); if (!active(ep)) return null;
        s.mg = null; s.phase = "board"; publish();
        return res;
    }
    function seqInput(mg, slot, v) {
        if (mg.idx[slot] >= 4 || ![0, 1, 2, 3].includes(v)) return;
        if (v === mg.seq[mg.idx[slot]]) mg.ok[slot]++; else mg.miss[slot]++;
        mg.idx[slot]++;
    }
    function doPress(G, mg, slot) {
        const s = state;
        if (G.engine === "mash") {
            if (G.id === "relay-run") {
                const leg = mg.tick < mg.dur / 2 ? 0 : 1;
                const team = mg.teams.findIndex((t) => t.includes(mg.players[slot]));
                if (mg.teams[team].indexOf(mg.players[slot]) !== leg) return;
            }
            mg.scores[slot]++;
            if (G.id === "tug-rope") { const [a, b] = teamScores(mg); if (Math.abs(a - b) >= 15) mg.early = true; }
        } else if (G.engine === "coin") {
            if (mg.tick < mg.lock[slot]) return;
            const pos = markerPos(mg, slot);
            if (pos >= 42 && pos <= 58) { mg.scores[slot]++; mg.off[slot] = ri(100); }
            else mg.lock[slot] = mg.tick + 5;
        } else if (G.engine === "spike") {
            if (mg.dead[slot]) return;
            const d = mg.arr[slot] - mg.tick;
            if (d >= 0 && d <= 4) { mg.dodge[slot]++; mg.scores[slot]++; mg.arr[slot] = mg.tick + 22 + ri(26); }
        } else if (G.engine === "paint") {
            const team = mg.teams.findIndex((t) => t.includes(mg.players[slot]));
            const neutral = mg.grid.map((v, i) => (v < 0 ? i : -1)).filter((i) => i >= 0);
            let cell;
            if (neutral.length) cell = neutral[ri(neutral.length)];
            else {
                const enemy = mg.grid.map((v, i) => (v >= 0 && v !== team ? i : -1)).filter((i) => i >= 0);
                if (!enemy.length) return;
                cell = enemy[ri(enemy.length)];
            }
            mg.grid[cell] = team;
            const c0 = mg.grid.filter((v) => v === 0).length, c1 = mg.grid.filter((v) => v === 1).length;
            mg.teams[0].forEach((pi) => { mg.scores[mg.players.indexOf(pi)] = c0; });
            mg.teams[1].forEach((pi) => { mg.scores[mg.players.indexOf(pi)] = c1; });
        } else if (G.engine === "bomb") {
            if (mg.players[slot] === mg.group[mg.holder]) { mg.holder = (mg.holder + 1) % mg.group.length; mg.passes++; }
        }
    }
    function mgInput(a, actor) {
        const s = state, mg = s.mg;
        if (!mg || mg.phase !== "play" || s.paused) return;
        const slot = mg.players.indexOf(actor);
        if (slot < 0) return;
        if (s.players[actor].cpu) return;
        if (mg.tick - mg.last[slot] < 1) return;
        mg.last[slot] = mg.tick;
        const G = gameDef(mg.id);
        if (a.k === "press") doPress(G, mg, slot);
        else if (a.k === "lane" && G.engine === "lane" && [0, 1, 2].includes(a.v) && !mg.out[slot]) mg.lane[slot] = a.v;
        else if (a.k === "seq" && G.engine === "memory" && mg.stage === "input") seqInput(mg, slot, a.v);
        else if (a.k === "guess" && G.engine === "bomb" && actor === mg.solo && mg.guess < 0 && mg.group.includes(a.v)) mg.guess = a.v;
        else return;
        publish();
    }
    function engineTick(G, mg) {
        const s = state, n = mg.players.length;
        const isCPU = (i) => s.players[mg.players[i]].cpu;
        if (G.engine === "mash") {
            for (let i = 0; i < n; i++) {
                if (G.id === "relay-run") {
                    const leg = mg.tick < mg.dur / 2 ? 0 : 1;
                    const team = mg.teams.findIndex((t) => t.includes(mg.players[i]));
                    if (mg.teams[team].indexOf(mg.players[i]) !== leg) continue;
                }
                if (isCPU(i) && Math.random() < 0.34) doPress(G, mg, i);
            }
        } else if (G.engine === "coin") {
            for (let i = 0; i < n; i++) {
                if (!isCPU(i)) continue;
                const pos = markerPos(mg, i);
                if (pos >= 44 && pos <= 56 && mg.tick >= mg.lock[i] && Math.random() < 0.5) doPress(G, mg, i);
            }
        } else if (G.engine === "spike") {
            for (let i = 0; i < n; i++) {
                if (mg.dead[i]) continue;
                if (mg.tick > mg.arr[i]) {
                    mg.lives[i]--;
                    mg.arr[i] = mg.tick + 22 + ri(26);
                    if (mg.lives[i] <= 0) mg.dead[i] = mg.tick;
                } else if (isCPU(i) && mg.arr[i] - mg.tick === 2 && Math.random() < 0.86) doPress(G, mg, i);
            }
        } else if (G.engine === "memory") {
            const t = mg.tick;
            const round = t < 100 ? 0 : 1;
            if (round !== mg.round) { mg.round = round; mg.seq = Array.from({ length: 4 }, () => ri(4)); mg.idx = mg.players.map(() => 0); }
            mg.stage = t % 100 < 30 ? "show" : "input";
            if (mg.stage === "input") for (let i = 0; i < n; i++) {
                if (isCPU(i) && mg.idx[i] < 4 && t >= mg.next[i]) {
                    mg.next[i] = t + 6;
                    const want = mg.seq[mg.idx[i]];
                    seqInput(mg, i, Math.random() < 0.85 ? want : (want + 1 + ri(3)) % 4);
                }
            }
        } else if (G.engine === "paint") {
            for (let i = 0; i < n; i++) if (isCPU(i) && Math.random() < 0.3) doPress(G, mg, i);
        } else if (G.engine === "lane") {
            if (mg.tick % 30 === 0 && mg.tick > 0) {
                mg.pulse++;
                if (mg.mode === "chase") {
                    const bl = mg.lane[mg.players.indexOf(mg.solo)];
                    let caught = 0;
                    mg.players.forEach((pi, i) => { if (pi !== mg.solo && !mg.out[i] && mg.lane[i] === bl) { mg.out[i] = true; caught++; } });
                    mg.flash = caught ? `\u{1F479} ${caught} tertangkap!` : "\u{1F4A8} Semua lolos!";
                } else {
                    const al = mg.lane[mg.players.indexOf(mg.solo)];
                    const blocked = mg.players.some((pi, i) => pi !== mg.solo && mg.lane[i] === al);
                    if (!blocked) { mg.goals++; mg.flash = `\u26BD GOL! (${mg.goals})`; } else mg.flash = "\u{1F6E1}\uFE0F Diblokir!";
                }
            } else if (mg.tick % 30 === 20) {
                mg.players.forEach((pi, i) => {
                    if (!isCPU(i) || mg.out[i]) return;
                    if (mg.mode === "chase" && pi === mg.solo) {
                        const alive = mg.players.map((q, j) => ({ q, j })).filter((o) => o.q !== mg.solo && !mg.out[o.j]);
                        if (alive.length && Math.random() < 0.5) {
                            const cnt = [0, 1, 2].map((l) => alive.filter((o) => mg.lane[o.j] === l).length);
                            mg.lane[i] = cnt.indexOf(Math.max(...cnt));
                        } else mg.lane[i] = ri(3);
                    } else mg.lane[i] = ri(3);
                });
            }
            if (mg.mode === "chase" && mg.players.every((pi, i) => pi === mg.solo || mg.out[i])) mg.early = true;
        } else if (G.engine === "bomb") {
            if (mg.tick % 20 === 0) mg.holder = (mg.holder + 1) % mg.group.length;
            mg.group.forEach((pi) => {
                if (s.players[pi].cpu && mg.group[mg.holder] === pi && Math.random() < 0.07) doPress(G, mg, mg.players.indexOf(pi));
            });
            if (s.players[mg.solo].cpu && mg.guess < 0 && mg.tick === 90) mg.guess = mg.group[ri(mg.group.length)];
        }
    }
    function mgResults(G, mg, opts) {
        const s = state, parts = mg.players, rows = [];
        let headline = "";
        if (G.type === "ffa") {
            const val = parts.map((pi, i) =>
                G.engine === "spike" ? mg.dodge[i] * 1000 + (mg.dead[i] || mg.dur) :
                    G.engine === "memory" ? mg.ok[i] * 10 - mg.miss[i] * 3 :
                        mg.scores[i]);
            const order = parts.map((pi, i) => ({ pi, v: val[i] })).sort((a, b) => b.v - a.v);
            const pot = [10, 5, 0, 0];
            let i = 0, place = 1;
            while (i < order.length) {
                let j = i;
                while (j + 1 < order.length && order[j + 1].v === order[i].v) j++;
                const k = j - i + 1;
                let sum = 0;
                for (let r = i; r <= j; r++) sum += pot[r] || 0;
                const each = Math.floor(sum / k);
                for (let r = i; r <= j; r++) rows.push({ p: order[r].pi, place, coins: opts.sudden ? 0 : each, win: place === 1, score: order[r].v });
                i = j + 1; place += k;
            }
            headline = `${G.icon} ${G.name}: juara ${rows.filter((r) => r.win).map((r) => s.players[r.p].name).join(" & ")}`;
        } else if (G.type === "2v2") {
            const ts = G.engine === "paint"
                ? [mg.grid.filter((v) => v === 0).length, mg.grid.filter((v) => v === 1).length]
                : teamScores(mg);
            const win = ts[0] === ts[1] ? -1 : ts[0] > ts[1] ? 0 : 1;
            mg.teams.forEach((t, ti) => t.forEach((pi) => rows.push({
                p: pi, place: win < 0 ? 1 : ti === win ? 1 : 2,
                coins: opts.sudden ? 0 : win < 0 ? 5 : ti === win ? 10 : 0,
                win: win < 0 || ti === win, score: ts[ti],
            })));
            headline = win < 0 ? `${G.icon} ${G.name}: seri!` : `${G.icon} ${G.name}: Tim ${win === 0 ? "Biru \u{1F535}" : "Merah \u{1F534}"} menang!`;
        } else {
            let outcome;
            if (G.engine === "lane" && mg.mode === "chase") outcome = parts.every((pi, i) => pi === mg.solo || mg.out[i]) ? "solo" : "group";
            else if (G.engine === "lane") outcome = mg.goals >= 4 ? "solo" : mg.goals === 3 ? "draw" : "group";
            else outcome = mg.guess === mg.group[mg.holder] ? "solo" : "group";
            rows.push({ p: mg.solo, place: outcome === "group" ? 2 : 1, coins: opts.sudden ? 0 : outcome === "solo" ? 10 : outcome === "draw" ? 5 : 0, win: outcome === "solo" });
            mg.group.forEach((pi) => rows.push({ p: pi, place: outcome === "solo" ? 2 : 1, coins: opts.sudden ? 0 : outcome === "group" ? 10 : outcome === "draw" ? 3 : 0, win: outcome === "group" }));
            headline = outcome === "draw" ? `${G.icon} ${G.name}: seri!` : `${G.icon} ${G.name}: ${outcome === "solo" ? s.players[mg.solo].name + " (solo) menang!" : "Tim trio menang!"}`;
        }
        return { rows, headline };
    }

    /* ---------- Akhir permainan ---------- */
    async function bonusPhase() {
        const ep = epoch, s = state;
        s.phase = "bonus"; s.bonus = []; publish();
        await sleep(800); if (!active(ep)) return;
        const cats = [["\u{1F3AE} Bintang Minigame", "mg"], ["\u{1FA99} Bintang Koin", "gained"], ["\u2757 Bintang Event", "events"]];
        for (const [label, key] of cats) {
            let best = -1, winners = [];
            for (let i = 0; i < s.count; i++) {
                const v = s.players[i].stats[key];
                if (v > best) { best = v; winners = [i]; }
                else if (v === best) winners.push(i);
            }
            if (best <= 0) s.bonus.push({ label, winners: [], none: true });
            else { winners.forEach((i) => s.players[i].stars++); s.bonus.push({ label, winners }); sfx("star"); }
            publish(); await sleep(1400); if (!active(ep)) return;
        }
    }
    function readBest() {
        try {
            const v = JSON.parse(localStorage.getItem(META.bestKey) || "{}") || {};
            return { stars: +v.stars || 0, wins: +v.wins || 0 };
        } catch (_) { return { stars: 0, wins: 0 }; }
    }
    function saveBest() {
        if (!META.bestKey || !state || state.phase !== "results") return;
        try {
            const prev = readBest();
            const top = state.ranking[0] != null ? state.players[state.ranking[0]] : null;
            const best = {
                stars: Math.max(prev.stars, top ? top.stars : 0),
                wins: prev.wins + (state.ranking[0] === playerIndex ? 1 : 0),
            };
            localStorage.setItem(META.bestKey, JSON.stringify(best));
        } catch (_) { /* storage blocked */ }
    }
    async function finish() {
        const ep = epoch, s = state;
        const cmp = (a, b) => { const A = s.players[a], B = s.players[b]; return B.stars - A.stars || B.coins - A.coins || B.stats.mg - A.stats.mg; };
        let idx = [...Array(s.count).keys()].sort(cmp);
        const top = idx.filter((i) => cmp(i, idx[0]) === 0);
        if (top.length > 1) {
            s.banner = "\u26A1 Sudden Death!"; publish();
            await sleep(1200); if (!active(ep)) return;
            const res = await runMinigame("button-dash", top, { sudden: true });
            if (!active(ep) || !res) return;
            const winners = res.rows.filter((r) => r.win).map((r) => r.p);
            idx = [...winners, ...idx.filter((i) => !winners.includes(i))];
            s.shared = winners.length > 1;
        }
        s.ranking = idx; s.phase = "results";
        sfx("win"); saveBest(); publish();
    }

    /* ---------- Input DOM ---------- */
    function toggleHelp(on) {
        helpOpen = typeof on === "boolean" ? on : !helpOpen;
        if (helpOpen) cheatsOpen = false;
        render();
    }
    function handleClick(event) {
        const t = event.target;
        if (!t || !t.closest) return;
        if (t.closest("[data-exit]")) { onExit(); return; }
        if (t.closest("[data-help]")) { toggleHelp(); return; }
        if (t.closest("[data-help-close]")) { toggleHelp(false); return; }
        if (t.closest("[data-cheats]")) {
            if (!canCheat()) return;
            cheatsOpen = !cheatsOpen;
            if (cheatsOpen) helpOpen = false;
            render(); return;
        }
        if (t.closest("[data-cheat-close]")) { cheatsOpen = false; render(); return; }
        if (t.closest("[data-pause]")) {
            if ((!online || room.isHost) && state && state.phase !== "lobby" && state.phase !== "results") submitAction({ t: "pause", v: !state.paused });
            return;
        }
        if (t.closest("[data-restart]")) { if (!helpOpen && !cheatsOpen) submitAction({ t: "restart" }); return; }
        const el = t.closest("[data-act]");
        if (!el) return;
        ensureAudio();
        const d = el.dataset;
        if (d.act === "rules") { toggleHelp(true); return; }
        if (d.act === "menu") { onExit(); return; }
        const v = d.v != null && d.v !== "" ? (/^-?\d+$/.test(d.v) ? +d.v : d.v) : undefined;
        submitAction({ t: d.act, k: d.k, v, p: d.p != null ? +d.p : undefined });
    }
    function handleInput(event) {
        const key = event.target?.dataset?.vol;
        if (!key) return;
        prefs[key] = Math.max(0, Math.min(1, (+event.target.value || 0) / 100));
        if (key === "music" && prefs.music > 0) ensureAudio();
    }
    function onKey(e) {
        if (destroyed || !state) return;
        const c = e.code;
        /* Prioritas: H → C → P/Esc → R → aksi game. */
        if (c === "KeyH") { toggleHelp(); e.preventDefault(); return; }
        if (c === "KeyC") {
            if (!helpOpen && canCheat()) { cheatsOpen = !cheatsOpen; if (cheatsOpen) { /* biarkan state apa adanya */ } render(); }
            e.preventDefault(); return;
        }
        if (c === "KeyP" || c === "Escape") {
            if (helpOpen) toggleHelp(false);
            else if (cheatsOpen) { cheatsOpen = false; render(); }
            else if ((!online || room.isHost) && state.phase !== "lobby" && state.phase !== "results") submitAction({ t: "pause", v: !state.paused });
            e.preventDefault(); return;
        }
        if (c === "KeyR") { if (!helpOpen && !cheatsOpen) submitAction({ t: "restart" }); e.preventDefault(); return; }
        if (helpOpen || cheatsOpen || state.paused) return;
        const s = state;
        if (s.phase === "mg" && s.mg && s.mg.phase === "play") {
            const G = gameDef(s.mg.id);
            if (["mash", "coin", "spike", "paint", "bomb"].includes(G.engine)) {
                if (online) {
                    if (e.key === " " || e.key === "Enter") { ensureAudio(); submitAction({ t: "mg", k: "press" }); e.preventDefault(); }
                } else {
                    const i = PRESSKEYS.indexOf(e.key.toLowerCase());
                    if (i >= 0 && i < s.mg.players.length) { ensureAudio(); submitAction({ t: "mg", k: "press", p: s.mg.players[i] }); e.preventDefault(); }
                }
            }
            return;
        }
        if ((c === "Space" || e.key === " " || e.key === "Enter") && s.phase === "board" && s.sub === "pre" && s.current != null && canAct(s.current)) {
            ensureAudio(); submitAction({ t: "roll" }); e.preventDefault();
        }
    }

    /* ---------- Wiring (mengikuti template library) ---------- */
    root.addEventListener("click", handleClick);
    root.addEventListener("input", handleInput);
    document.addEventListener("keydown", onKey);
    if (online) {
        unRoom = room.onRoom((nextRoom) => { if (destroyed) return; roomData = nextRoom; render(); });
        if (room.isHost) {
            state = lobbyState();
            publish();
            unAction = room.onAction((action) => applyAction(action, 1));
        } else {
            unState = room.onState((nextState) => { if (destroyed) return; state = nextState; render(); });
        }
    } else {
        state = lobbyState();
        render();
    }

    return {
        destroy() {
            destroyed = true;
            root.removeEventListener("click", handleClick);
            root.removeEventListener("input", handleInput);
            document.removeEventListener("keydown", onKey);
            /* Berhentikan subscription room (onRoom/onAction/onState mengembalikan unsubscribe). */
            [unRoom, unAction, unState].forEach((fn) => {
                if (typeof fn === "function") { try { fn(); } catch (_) { /* abaikan */ } }
            });
            unRoom = unAction = unState = null;
            /* Selesaikan semua sleep yang tertunda agar async loop tidak menggantung. */
            timers.forEach((r) => { if (r.t) clearTimeout(r.t); r.t = null; r.res(); });
            timers.clear();
            if (waiter) waiter.done(null);
            if (musicTimer) { clearInterval(musicTimer); musicTimer = null; }
            if (AC) { try { AC.close(); } catch { } AC = null; }
        },
    };
}