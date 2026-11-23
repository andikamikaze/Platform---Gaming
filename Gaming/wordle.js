/* ==== GAME: wordle.js ==== */

/* =============================================================
WORDLE RACE - tebak kata 5 huruf, adu cepat vs bot / pemain lain.
Kompatibel template baru: export META + mount(root, context).
Setelah mengubah file ini, jalankan: node tools/build-games-manifest.mjs
============================================================= */

export const META = {
    id: "wordle", // harus sama dengan nama file: wordle.js
    name: "Wordle",
    category: "words",
    catLabel: "Kata",
    desc: "Tebak kata 5 huruf dalam 6 kesempatan. Hijau = tepat, kuning = ada di posisi lain, abu = tidak ada. Adu cepat melawan bot atau teman.",
    art: '<svg viewBox="0 0 48 48" width="54" height="54" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="6" y="6" width="10" height="10" rx="2.5" fill="#16a34a" stroke="none"/><rect x="19" y="6" width="10" height="10" rx="2.5" fill="#d97706" stroke="none"/><rect x="32" y="6" width="10" height="10" rx="2.5" fill="#a8a29e" stroke="none"/><rect x="6" y="19" width="10" height="10" rx="2.5"/><rect x="19" y="19" width="10" height="10" rx="2.5" fill="#16a34a" stroke="none"/><rect x="32" y="19" width="10" height="10" rx="2.5"/><rect x="6" y="32" width="10" height="10" rx="2.5"/><rect x="19" y="32" width="10" height="10" rx="2.5"/><rect x="32" y="32" width="10" height="10" rx="2.5" fill="#d97706" stroke="none"/></svg>',
    bg: ["#d1fae5", "#6ee7b7"],
    bestKey: "wordleBest",
};

/* ---------- kamus: semua tebakan valid harus ada di sini ---------- */
const WORDS = `about above actor adopt after again agent agree alarm album
alert alike alive allow alone along angel anger angle ankle apple apply arena
argue arise array aside asset audio avoid awake award aware badge baker basic
basin batch beach beard beast begin being belly below bench berry birth black
blade blame blank blast blend bless blind block blood board boost booth bound
brain brake brand brass brave bread break breed brick bride brief bring brisk
broad brown brush build bunch burst cabin cable candy cargo carry catch cause
chain chair chalk charm chart chase cheap check cheek cheer chess chest chief
child chill choir chord civic civil claim clash clean clear clerk click cliff
climb cloak clock close cloth cloud coach coast color comet coral couch count
court cover crack craft crane crash cream creek crest crime crisp cross crowd
crown crush curve cycle daily dairy dance diary dirty drift drive eager eagle
earth eight enjoy equal error event every fancy feast fence field first flame
flash fleet floor fluid focus force forge fresh fruit funny ghost giant glass
globe grace grade grain grand grape grass great green greet group guard guess
guide happy heart heavy honey horse hotel house human humor index inner input
joint juice kneel label large laser later laugh layer learn lemon light limit
local lucky lunch magic major mango maple march match medal metal meter might
minor model money month moral motor mount mouse mouth music night noble north
novel nurse ocean offer often olive onion orbit order otter ounce outer paint
panda party peach pearl piano pizza place plain plant plate plaza point polar
pound power press price pride prime prize proud prove queen quick quiet radar
radio raise ranch range rapid reach ready refer relax reply rider right rival
river roast robot rocky`
    .split(/\s+/)
    .filter((w) => /^[a-z]{5}$/.test(w));

const LEN = 5;
const BASE_TRIES = 6;
const MAX_TRIES = 10; // batas atas setelah cheat tambah kesempatan

/* ---------- util murni (mudah diuji) ---------- */
function rng(seed) {
    let a = seed >>> 0;
    return function () {
        a |= 0;
        a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/* Skor tebakan: "ok" hijau, "near" kuning, "no" abu.
   Dua lintasan agar huruf duplikat ditangani benar. */
function scoreGuess(g, answer) {
    const res = new Array(LEN).fill("no");
    const rest = {};
    for (let i = 0; i < LEN; i++) {
        if (g[i] === answer[i]) res[i] = "ok";
        else rest[answer[i]] = (rest[answer[i]] || 0) + 1;
    }
    for (let i = 0; i < LEN; i++) {
        if (res[i] !== "ok" && rest[g[i]] > 0) {
            res[i] = "near";
            rest[g[i]]--;
        }
    }
    return res;
}

function sameScore(a, b) {
    for (let i = 0; i < LEN; i++) if (a[i] !== b[i]) return false;
    return true;
}

/* Semua kata yang masih konsisten dengan riwayat tebakan + skornya.
   Jawaban asli dijamin selalu ada di daftar ini. */
function candidatesFor(rows) {
    return WORDS.filter((w) =>
        rows.every((r) => sameScore(scoreGuess(r.word, w), r.score)),
    );
}

/* Bot bermain adil: hanya memakai umpan warna dari tebakannya sendiri. */
function botPick(rows, rnd) {
    const c = candidatesFor(rows);
    if (!c.length) return WORDS[Math.floor(rnd() * WORDS.length)];
    return c[Math.floor(rnd() * c.length)];
}

/* Jaminan level bisa diselesaikan: simulasikan solver acak-konsisten;
   level diterima hanya jika ada jalur penyelesaian <= BASE_TRIES tebakan. */
function solvableIn(answer, rnd, tries) {
    const rows = [];
    for (let i = 0; i < tries; i++) {
        const w = botPick(rows, rnd);
        if (w === answer) return true;
        rows.push({ word: w, score: scoreGuess(w, answer) });
    }
    return false;
}

/* Generator level acak: kata baru (tidak sama dengan ronde sebelumnya),
   lolos uji solvable, posisi Pemain 1/2 diacak, giliran pertama diacak. */
function makeLevel(prevAnswer, rand) {
    const r = rand || Math.random;
    for (let attempt = 0; attempt < 40; attempt++) {
        const seed = (r() * 4294967296) >>> 0;
        const rr = rng(seed);
        const answer = WORDS[Math.floor(rr() * WORDS.length)];
        if (answer === prevAnswer) continue;
        if (!solvableIn(answer, rng((seed ^ 0x9e3779b9) >>> 0), BASE_TRIES)) continue;
        return {
            seed,
            answer,
            seats: rr() < 0.5 ? [0, 1] : [1, 0],
            first: rr() < 0.5 ? 0 : 1,
        };
    }
    // fallback sangat jarang: tetap ambil kata valid dari kamus
    const seed = (r() * 4294967296) >>> 0;
    const rr = rng(seed);
    return {
        seed,
        answer: WORDS[Math.floor(rr() * WORDS.length)],
        seats: [0, 1],
        first: 0,
    };
}

function countVowels(w) {
    return (w.match(/[aeiou]/g) || []).length;
}

/* Petunjuk bertahap setelah tebakan salah: 2x = huruf awal + jumlah vokal,
   4x = tambahan huruf akhir. */
function hintText(answer, wrong) {
    const parts = [];
    if (wrong >= 2) {
        parts.push('Diawali huruf "' + answer[0].toUpperCase() + '"');
        parts.push(countVowels(answer) + " huruf vokal");
    }
    if (wrong >= 4) parts.push('Diakhiri huruf "' + answer[LEN - 1].toUpperCase() + '"');
    return parts.join(" - ");
}

/* =============================================================
   MOUNT - sesuai template (mode "ai" = vs bot, mode "room" = online)
   Indeks transport: 0 = host / manusia, 1 = guest / bot.
   state.seats memetakan indeks transport -> label Pemain 1 / Pemain 2
   (diacak tiap ronde). state.turn / state.first = indeks transport.
   ============================================================= */
export function mount(root, context = {}) {
    const { mode = "ai", room = null, playerName = "Player", onExit = () => { } } = context;
    const online = mode === "room" && Boolean(room);
    const me = online && !room.isHost ? 1 : 0;
    const opp = 1 - me;
    let roomData = room?.room || null;
    let state = null;

    /* state lokal (tidak perlu disinkronkan) */
    let cur = "";
    let lastLevel = -1;
    let resultClosed = -1;
    let bestSaved = -1;
    let peeked = false;
    let deadMarked = false;
    let botTimer = null;
    let msgTimer = null;
    const unsubs = [];

    function readBest() {
        try {
            const v = parseInt(localStorage.getItem(META.bestKey), 10);
            return Number.isFinite(v) && v > 0 ? v : null;
        } catch (err) {
            return null;
        }
    }
    function saveBest(v) {
        try {
            localStorage.setItem(META.bestKey, String(v));
        } catch (err) {
            /* abaikan: storage mungkin diblokir */
        }
    }
    let best = readBest();

    /* ---------- shell UI minimalis ---------- */
    root.innerHTML = `
<style>
.wl-scope{--wl-bg:#fafaf9;--wl-panel:#ffffff;--wl-ink:#1c1917;--wl-mut:#78716c;--wl-line:#e7e5e4;--wl-key:#f5f5f4;--wl-ok:#16a34a;--wl-near:#d97706;--wl-no:#a8a29e;--wl-bad:#dc2626;color:var(--wl-ink);font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;-webkit-tap-highlight-color:transparent}
@media (prefers-color-scheme: dark){.wl-scope{--wl-bg:#1c1917;--wl-panel:#292524;--wl-ink:#fafaf9;--wl-mut:#a8a29e;--wl-line:#44403c;--wl-key:#44403c;--wl-no:#57534e}}
.wl-scope [hidden]{display:none!important}
.wl-scope .game-intro{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;margin:0 0 10px}
.wl-scope .game-intro h2{margin:0;font-size:20px;letter-spacing:-.01em}
.wl-scope .game-intro p{margin:4px 0 0;font-size:13px;color:var(--wl-mut)}
.wl-scope .game-status{display:inline-flex;align-items:center;gap:7px;font-size:12px;font-weight:600;color:var(--wl-mut);border:1px solid var(--wl-line);border-radius:999px;padding:6px 12px;background:var(--wl-panel);white-space:nowrap}
.wl-scope .game-status-dot{width:8px;height:8px;border-radius:50%;background:var(--wl-ok);display:inline-block}
.wl-scope[data-thinking="1"] .game-status-dot{animation:wl-pulse 1s ease-in-out infinite}
@keyframes wl-pulse{50%{opacity:.25}}
.wl-bar{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin:0 0 12px}
.wl-chip{font-size:12px;color:var(--wl-mut);border:1px solid var(--wl-line);background:var(--wl-panel);border-radius:999px;padding:5px 11px}
.wl-chip b{color:var(--wl-ink)}
.wl-flex{flex:1}
.wl-btn{border:1px solid var(--wl-line);background:var(--wl-panel);color:var(--wl-ink);border-radius:999px;padding:7px 14px;font-size:12.5px;font-weight:600;cursor:pointer;touch-action:manipulation;user-select:none;transition:background .15s}
.wl-btn:hover{background:var(--wl-key)}
.wl-btn:focus-visible,.wl-key:focus-visible{outline:2px solid var(--wl-ok);outline-offset:2px}
.wl-btn.primary{background:var(--wl-ink);color:var(--wl-panel);border-color:var(--wl-ink)}
.wl-btn.on{border-color:var(--wl-near);color:var(--wl-near)}
.wl-btn.wide{display:block;width:100%;text-align:left;margin:6px 0}
.wl-panel{position:relative;border:1px solid var(--wl-line);background:var(--wl-bg);border-radius:18px;padding:16px}
.wl-main{display:grid;gap:16px}
@media(min-width:760px){.wl-main{grid-template-columns:minmax(0,1fr) 240px;align-items:start}}
.wl-board{display:grid;gap:6px;width:min(100%,330px);margin:0 auto}
.wl-row{display:grid;grid-template-columns:repeat(5,1fr);gap:6px}
.wl-tile{aspect-ratio:1;display:grid;place-items:center;border:2px solid var(--wl-line);border-radius:10px;background:var(--wl-panel);font-weight:800;font-size:clamp(18px,4.5vw,25px);text-transform:uppercase;transition:background .15s,border-color .15s,color .15s}
.wl-tile.fill{border-color:var(--wl-mut)}
.wl-tile.ok{background:var(--wl-ok);border-color:var(--wl-ok);color:#fff}
.wl-tile.near{background:var(--wl-near);border-color:var(--wl-near);color:#fff}
.wl-tile.no{background:var(--wl-no);border-color:var(--wl-no);color:#fff}
.wl-msg{min-height:20px;margin:10px auto 0;font-size:12.5px;font-weight:600;color:var(--wl-near);text-align:center;max-width:360px}
.wl-side{display:grid;gap:10px}
.wl-card{border:1px solid var(--wl-line);background:var(--wl-panel);border-radius:14px;padding:12px}
.wl-card-t{display:flex;justify-content:space-between;align-items:center;font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--wl-mut);margin:0 0 8px}
.wl-tag{border:1px solid var(--wl-line);border-radius:999px;padding:2px 8px;font-size:10px}
.wl-mini{display:grid;gap:4px}
.wl-mrow{display:flex;gap:4px}
.wl-mt{width:24px;height:24px;display:grid;place-items:center;border-radius:6px;font-size:12px;font-weight:800;text-transform:uppercase;border:1.5px solid var(--wl-line)}
.wl-mt.ok{background:var(--wl-ok);border-color:var(--wl-ok);color:#fff}
.wl-mt.near{background:var(--wl-near);border-color:var(--wl-near);color:#fff}
.wl-mt.no{background:var(--wl-no);border-color:var(--wl-no);color:#fff}
.wl-mempty{font-size:12px;color:var(--wl-mut)}
.wl-hint{margin:0;font-size:13px;line-height:1.5}
.wl-pattern{display:flex;gap:5px;margin-top:8px}
.wl-pc{width:26px;height:26px;border:1.5px dashed var(--wl-mut);border-radius:7px;display:grid;place-items:center;font-weight:800;font-size:13px;text-transform:uppercase;color:var(--wl-mut)}
.wl-pc.on{border-style:solid;border-color:var(--wl-ok);color:var(--wl-ok)}
.wl-leg{display:flex;align-items:center;gap:8px;font-size:12px;color:var(--wl-mut);margin:4px 0}
.wl-dot{width:12px;height:12px;border-radius:4px;display:inline-block}
.wl-dot.ok{background:var(--wl-ok)}
.wl-dot.near{background:var(--wl-near)}
.wl-dot.no{background:var(--wl-no)}
.wl-kb{display:grid;gap:6px;width:min(100%,520px);margin:14px auto 0}
.wl-krow{display:flex;justify-content:center;gap:5px}
.wl-key{flex:1;max-width:46px;height:48px;border:0;border-radius:9px;background:var(--wl-key);color:var(--wl-ink);font-weight:700;font-size:13px;text-transform:uppercase;cursor:pointer;touch-action:manipulation;user-select:none;transition:background .12s,transform .05s}
.wl-key:hover{background:var(--wl-line)}
.wl-key:active{transform:scale(.94)}
.wl-key.wide{flex:1.7;max-width:74px;font-size:10.5px}
.wl-key.ok{background:var(--wl-ok);color:#fff}
.wl-key.near{background:var(--wl-near);color:#fff}
.wl-key.no{background:var(--wl-no);color:#fff;opacity:.75}
@media(pointer:coarse){.wl-key{height:52px;font-size:14px}.wl-key.wide{font-size:11px}}
.wl-foot{margin:10px 0 0;text-align:center;font-size:11px;color:var(--wl-mut)}
.wl-ov{position:absolute;inset:0;z-index:6;display:flex;align-items:center;justify-content:center;padding:14px;background:rgba(250,250,249,.9);backdrop-filter:blur(5px);border-radius:18px;overflow:auto}
@media (prefers-color-scheme: dark){.wl-ov{background:rgba(28,25,23,.9)}}
.wl-ovcard{background:var(--wl-panel);border:1px solid var(--wl-line);border-radius:16px;padding:20px;width:min(100%,430px);max-height:100%;overflow:auto;box-shadow:0 14px 40px rgba(0,0,0,.10)}
.wl-ovcard h3{margin:0 0 8px;font-size:18px}
.wl-ovcard p,.wl-ovcard li{font-size:13px;line-height:1.55;color:var(--wl-mut)}
.wl-ovcard ol{margin:8px 0;padding-left:18px}
.wl-exrow{display:flex;gap:5px;margin:10px 0 4px}
.wl-ex{width:34px;height:34px;display:grid;place-items:center;border-radius:8px;font-weight:800;border:2px solid var(--wl-line);text-transform:uppercase}
.wl-ex.ok{background:var(--wl-ok);border-color:var(--wl-ok);color:#fff}
.wl-ex.near{background:var(--wl-near);border-color:var(--wl-near);color:#fff}
.wl-ex.no{background:var(--wl-no);border-color:var(--wl-no);color:#fff}
.wl-note{font-size:12px;color:var(--wl-near);margin:6px 0 10px}
.wl-peek{font-size:22px;font-weight:800;letter-spacing:.35em;text-transform:uppercase;text-align:center;margin:6px 0;color:var(--wl-ok)}
.wl-rowbtns{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}
.wl-res-title.win{color:var(--wl-ok)}
.wl-res-title.lose{color:var(--wl-bad)}
.wl-scope .game-actions{display:flex;justify-content:flex-end;margin-top:12px}
.wl-scope .game-action-button{border:1px solid var(--wl-line);background:var(--wl-panel);color:var(--wl-mut);border-radius:999px;padding:8px 16px;font-size:12.5px;font-weight:600;cursor:pointer}
.wl-scope .game-action-button:hover{background:var(--wl-key)}
.wl-shake{animation:wl-shake .32s ease}
@keyframes wl-shake{25%{transform:translateX(-6px)}75%{transform:translateX(6px)}}
.wl-pop{animation:wl-pop .16s ease}
@keyframes wl-pop{from{transform:scale(.85)}}
</style>
<div class="game-app wl-scope" data-scope data-thinking="0">
  <div class="game-intro">
    <div><h2>Wordle</h2><p>Tebak kata 5 huruf dalam 6 kesempatan - adu cepat dengan lawan.</p></div>
    <span class="game-status"><i class="game-status-dot"></i><span data-status>Siap</span></span>
  </div>
  <div class="wl-bar">
    <span class="wl-chip">Level <b data-hud="level">1</b></span>
    <span class="wl-chip">Coba <b data-hud="try">1/6</b></span>
    <span class="wl-chip">Posisi <b data-hud="seat">P1</b></span>
    <span class="wl-chip" data-bestwrap>Terbaik <b data-hud="best">-</b></span>
    <span class="wl-flex"></span>
    <button class="wl-btn" type="button" data-act="help">Panduan</button>
    <button class="wl-btn" type="button" data-act="cheats" data-cheatbtn>Cheat</button>
    <button class="wl-btn" type="button" data-act="restart">Ronde baru</button>
  </div>
  <section class="game-panel wl-panel" data-board>
    <div class="wl-main">
      <div class="wl-left">
        <div class="wl-board" data-grid></div>
        <div class="wl-msg" data-msg role="status" aria-live="polite"></div>
      </div>
      <aside class="wl-side">
        <div class="wl-card">
          <div class="wl-card-t"><span data-oppname>Lawan</span><span class="wl-tag" data-opptag>P2</span></div>
          <div class="wl-mini" data-mini></div>
        </div>
        <div class="wl-card" data-hintcard hidden>
          <div class="wl-card-t">Petunjuk</div>
          <p class="wl-hint" data-hinttext></p>
          <div class="wl-pattern" data-hintpattern hidden></div>
        </div>
        <div class="wl-card">
          <div class="wl-card-t">Legenda</div>
          <div class="wl-leg"><i class="wl-dot ok"></i> huruf dan posisi benar</div>
          <div class="wl-leg"><i class="wl-dot near"></i> ada, posisi salah</div>
          <div class="wl-leg"><i class="wl-dot no"></i> tidak ada di kata</div>
        </div>
      </aside>
    </div>
    <div class="wl-kb" data-kb>
      <div class="wl-krow" data-krow="0"></div>
      <div class="wl-krow" data-krow="1"></div>
      <div class="wl-krow" data-krow="2"></div>
    </div>
    <p class="wl-foot">Ketik di keyboard atau tap tombol. Enter = kirim, Backspace = hapus, Esc = tutup panel.</p>

    <div class="wl-ov" data-ov="help" hidden>
      <div class="wl-ovcard" role="dialog" aria-label="Cara bermain">
        <h3>Cara bermain</h3>
        <ol>
          <li>Tebak kata bahasa Inggris 5 huruf yang tersembunyi. Kamu punya 6 kesempatan.</li>
          <li>Hijau = huruf dan posisi benar. Kuning = huruf ada tapi posisinya salah. Abu = huruf tidak ada di kata.</li>
          <li>Kamu bermain bergantian dengan lawan (bot atau pemain lain). Yang menebak benar lebih dulu menang. Giliran pertama dan posisi Pemain 1 / Pemain 2 diacak setiap ronde.</li>
          <li>Setelah 2 tebakan salah, petunjuk tentang kata muncul otomatis (huruf awal dan jumlah vokal; huruf akhir setelah 4 salah).</li>
          <li>Tombol Cheat membuka bantuan ekstra. Ronde yang memakai cheat tidak dicatat sebagai rekor.</li>
        </ol>
        <div class="wl-exrow"><span class="wl-ex ok">C</span><span class="wl-ex no">R</span><span class="wl-ex near">A</span><span class="wl-ex near">N</span><span class="wl-ex no">E</span></div>
        <p>Contoh: jawaban CABIN, tebakan CRANE. C hijau (tepat), A dan N kuning (ada tapi pindah posisi), R dan E abu (tidak ada).</p>
        <p>Kontrol: keyboard fisik (huruf, Enter, Backspace), klik mouse, atau tap keyboard virtual di layar. Tombol ? membuka panduan ini.</p>
        <div class="wl-rowbtns"><button class="wl-btn primary" type="button" data-act="close-help">Mulai bermain</button></div>
      </div>
    </div>

    <div class="wl-ov" data-ov="cheats" hidden>
      <div class="wl-ovcard" role="dialog" aria-label="Cheat">
        <h3>Cheat</h3>
        <p class="wl-note">Memakai cheat membuat ronde ini tidak dihitung untuk skor terbaik.</p>
        <button class="wl-btn wide" type="button" data-cheat="peek">Intip jawaban</button>
        <div class="wl-peek" data-peek hidden></div>
        <button class="wl-btn wide" type="button" data-cheat="reveal">Bocorkan 1 huruf pada posisinya</button>
        <div class="wl-pattern" data-cheatpattern></div>
        <button class="wl-btn wide" type="button" data-cheat="dead">Tandai huruf yang tidak ada di keyboard</button>
        <button class="wl-btn wide" type="button" data-cheat="fill">Isi jawaban ke baris aktif (tetap tekan Enter)</button>
        <button class="wl-btn wide" type="button" data-cheat="tries">Tambah 2 kesempatan</button>
        <div class="wl-rowbtns"><button class="wl-btn" type="button" data-act="close-cheats">Tutup</button></div>
      </div>
    </div>

    <div class="wl-ov" data-ov="result" hidden>
      <div class="wl-ovcard" role="dialog" aria-label="Hasil ronde">
        <h3 class="wl-res-title" data-res-title>Hasil</h3>
        <p data-res-sub></p>
        <div class="wl-rowbtns">
          <button class="wl-btn primary" type="button" data-act="restart">Ronde berikutnya</button>
          <button class="wl-btn" type="button" data-act="close-result">Lihat papan</button>
        </div>
      </div>
    </div>
  </section>
  <div class="game-actions"><button class="game-action-button" type="button" data-exit>Keluar game</button></div>
</div>`;

    const $ = (s, r) => (r || root).querySelector(s);
    const scopeEl = $("[data-scope]");
    const statusEl = $("[data-status]");
    const gridEl = $("[data-grid]");
    const msgEl = $("[data-msg]");
    const miniEl = $("[data-mini]");
    const oppNameEl = $("[data-oppname]");
    const oppTagEl = $("[data-opptag]");
    const hudLevel = $('[data-hud="level"]');
    const hudTry = $('[data-hud="try"]');
    const hudSeat = $('[data-hud="seat"]');
    const hudBest = $('[data-hud="best"]');
    const bestWrap = $("[data-bestwrap]");
    const hintCard = $("[data-hintcard]");
    const hintTextEl = $("[data-hinttext]");
    const hintPattern = $("[data-hintpattern]");
    const cheatPattern = $("[data-cheatpattern]");
    const peekEl = $("[data-peek]");
    const cheatBtn = $("[data-cheatbtn]");
    const helpOv = $('[data-ov="help"]');
    const cheatOv = $('[data-ov="cheats"]');
    const resultOv = $('[data-ov="result"]');
    const resTitle = $("[data-res-title]");
    const resSub = $("[data-res-sub]");

    /* ---------- keyboard virtual (mobile + klik mouse) ---------- */
    const KEYS = [
        "qwertyuiop".split(""),
        "asdfghjkl".split(""),
        ["enter"].concat("zxcvbnm".split("")).concat(["back"]),
    ];
    const keyEls = {};
    let tileEls = [];

    function buildKb() {
        KEYS.forEach((row, i) => {
            const rowEl = $('[data-krow="' + i + '"]');
            rowEl.innerHTML = "";
            row.forEach((k) => {
                const b = document.createElement("button");
                b.type = "button";
                b.className = "wl-key" + (k === "enter" || k === "back" ? " wide" : "");
                b.dataset.key = k;
                b.textContent = k === "enter" ? "ENTER" : k === "back" ? "HAPUS" : k.toUpperCase();
                b.setAttribute("aria-label", k === "back" ? "Hapus huruf" : k === "enter" ? "Kirim tebakan" : "Huruf " + k.toUpperCase());
                keyEls[k] = b;
                rowEl.appendChild(b);
            });
        });
    }

    function ensureBoard(n) {
        if (tileEls.length === n) return;
        gridEl.innerHTML = "";
        tileEls = [];
        for (let r = 0; r < n; r++) {
            const row = document.createElement("div");
            row.className = "wl-row";
            const tiles = [];
            for (let c = 0; c < LEN; c++) {
                const t = document.createElement("div");
                t.className = "wl-tile";
                row.appendChild(t);
                tiles.push(t);
            }
            gridEl.appendChild(row);
            tileEls.push(tiles);
        }
    }

    /* ---------- util UI ---------- */
    function setMsg(text) {
        msgEl.textContent = text;
        if (msgTimer) clearTimeout(msgTimer);
        msgTimer = text ? setTimeout(() => { msgEl.textContent = ""; }, 2600) : null;
    }

    function setStatus(text, thinking) {
        statusEl.textContent = text;
        scopeEl.dataset.thinking = thinking ? "1" : "0";
    }

    function anyOverlayOpen() {
        return !helpOv.hidden || !cheatOv.hidden || !resultOv.hidden;
    }
    function openOv(el) {
        helpOv.hidden = el !== helpOv;
        cheatOv.hidden = el !== cheatOv;
    }
    function closeOverlays() {
        helpOv.hidden = true;
        cheatOv.hidden = true;
    }

    function shake() {
        const row = tileEls[state.rows[me].length];
        if (!row) return;
        row.forEach((t) => {
            t.classList.remove("wl-shake");
            void t.offsetWidth;
            t.classList.add("wl-shake");
        });
    }

    function patternHtml(reveals, answer) {
        let h = "";
        for (let i = 0; i < LEN; i++) {
            const on = reveals.indexOf(i) >= 0;
            h += '<span class="wl-pc' + (on ? " on" : "") + '">' + (on ? answer[i].toUpperCase() : "-") + "</span>";
        }
        return h;
    }

    /* ---------- state & aksi (pola template) ---------- */
    function createRound(level, names, prevAnswer) {
        const lv = makeLevel(prevAnswer);
        return {
            level,
            seed: lv.seed,
            answer: lv.answer,
            seats: lv.seats,
            names: names.slice(),
            first: lv.first,
            turn: lv.first,
            rows: [[], []],
            tries: [BASE_TRIES, BASE_TRIES],
            reveals: [[], []],
            cheated: [false, false],
            status: "playing",
            winner: null,
        };
    }

    function render() {
        if (!state) {
            setStatus("Menunggu host...", false);
            return;
        }
        const playing = state.status === "playing";
        const myRows = state.rows[me];
        const opRows = state.rows[opp];
        const myTries = state.tries[me];

        /* ronde baru: reset tampilan lokal + umumkan hasil acak */
        if (state.level !== lastLevel) {
            lastLevel = state.level;
            cur = "";
            peeked = false;
            deadMarked = false;
            resultOv.hidden = true;
            cheatOv.hidden = true;
            const firstName = state.names[state.first] || "Lawan";
            setMsg("Ronde " + state.level + ": kamu " + (state.seats[me] === 0 ? "Pemain 1" : "Pemain 2") + ", " + firstName + " jalan duluan.");
        }

        /* papan sendiri */
        ensureBoard(myTries);
        for (let r = 0; r < myTries; r++) {
            const done = r < myRows.length;
            const word = done ? myRows[r].word : r === myRows.length ? cur : "";
            for (let c = 0; c < LEN; c++) {
                const t = tileEls[r][c];
                t.textContent = word[c] ? word[c].toUpperCase() : "";
                t.className = "wl-tile" + (word[c] ? " fill" : "") + (done ? " " + myRows[r].score[c] : "");
            }
        }

        /* warna keyboard: ok > near > no, lalu overlay cheat huruf mati */
        const keyState = {};
        myRows.forEach((row) => {
            row.word.split("").forEach((ch, i) => {
                const s = row.score[i];
                const prev = keyState[ch];
                if (s === "ok" || (s === "near" && prev !== "ok") || (s === "no" && !prev)) keyState[ch] = s;
            });
        });
        Object.keys(keyEls).forEach((k) => {
            if (k === "enter" || k === "back") return;
            let cls = "wl-key";
            const s = keyState[k];
            if (s) cls += " " + s;
            else if (deadMarked && state.answer.indexOf(k) < 0) cls += " no";
            keyEls[k].className = cls;
        });

        /* papan mini lawan */
        oppNameEl.textContent = state.names[opp] || (online ? "Pemain lain" : "Bot");
        oppTagEl.textContent = "P" + (state.seats[opp] + 1);
        miniEl.innerHTML = opRows.length
            ? opRows.map((row) =>
                '<div class="wl-mrow">' + row.word.split("").map((ch, i) =>
                    '<span class="wl-mt ' + row.score[i] + '">' + ch + "</span>").join("") + "</div>").join("")
            : '<span class="wl-mempty">Belum menebak.</span>';

        /* HUD */
        hudLevel.textContent = state.level;
        hudTry.textContent = (playing ? Math.min(myRows.length + 1, myTries) : myRows.length) + "/" + myTries;
        hudSeat.textContent = "P" + (state.seats[me] + 1);
        bestWrap.hidden = online;
        hudBest.textContent = best ? best + " tebakan" : "-";
        cheatBtn.className = "wl-btn" + (state.cheated[me] ? " on" : "");
        cheatBtn.textContent = state.cheated[me] ? "Cheat aktif" : "Cheat";

        /* petunjuk setelah 2 salah + pola huruf hasil cheat */
        const wrong = myRows.length;
        const showHint = playing && wrong >= 2;
        const hasReveal = state.reveals[me].length > 0;
        hintCard.hidden = !showHint && !hasReveal;
        hintTextEl.hidden = !showHint;
        hintTextEl.textContent = showHint ? hintText(state.answer, wrong) : "";
        hintPattern.hidden = !hasReveal;
        hintPattern.innerHTML = patternHtml(state.reveals[me], state.answer);
        cheatPattern.innerHTML = patternHtml(state.reveals[me], state.answer);
        peekEl.hidden = !peeked;
        peekEl.textContent = peeked ? state.answer.toUpperCase() : "";

        /* status giliran / hasil akhir */
        if (!playing) {
            setStatus("Ronde selesai", false);
            if (!online && state.winner === me && !state.cheated[me] && bestSaved !== state.level) {
                bestSaved = state.level;
                const used = myRows.length;
                if (!best || used < best) {
                    best = used;
                    saveBest(best);
                    hudBest.textContent = best + " tebakan";
                }
            }
            if (resultClosed !== state.level) {
                const ans = state.answer.toUpperCase();
                if (state.winner === -1) {
                    resTitle.textContent = "Seri";
                    resTitle.className = "wl-res-title";
                    resSub.textContent = "Keduanya kehabisan kesempatan. Jawabannya: " + ans + ".";
                } else if (state.winner === me) {
                    resTitle.textContent = "Kamu menang!";
                    resTitle.className = "wl-res-title win";
                    resSub.textContent = "Kata " + ans + " ditemukan dalam " + myRows.length + " tebakan." + (state.cheated[me] ? " Ronde ini memakai cheat, jadi tidak dicatat sebagai rekor." : "");
                } else {
                    resTitle.textContent = (state.names[state.winner] || "Lawan") + " menang";
                    resTitle.className = "wl-res-title lose";
                    resSub.textContent = "Lawan menemukan " + ans + " dalam " + state.rows[state.winner].length + " tebakan. Coba lagi di ronde berikutnya.";
                }
                resultOv.hidden = false;
            }
        } else if (state.turn === me) {
            const exhausted = myRows.length >= myTries;
            setStatus(exhausted ? "Kesempatan habis - menunggu lawan" : "Giliranmu", exhausted);
        } else {
            setStatus(online ? "Giliran " + (state.names[opp] || "lawan") : "Bot berpikir...", true);
        }

        scheduleBot();
    }

    function publish() {
        render();
        // Hanya host yang menulis state kanonik ke Firebase.
        if (online && room.isHost) room.publishState(state).catch(console.warn);
    }

    function applyAction(action, actor) {
        if (!state || !action || typeof action !== "object") return;
        if (actor !== 0 && actor !== 1) return;

        if (action.type === "hello") {
            if (!online) return;
            const n = String(action.name || "").trim().slice(0, 16);
            if (n && n !== state.names[actor]) {
                state.names[actor] = n;
                publish();
            }
            return;
        }

        if (action.type === "guess") {
            if (state.status !== "playing" || state.turn !== actor) return;
            const w = String(action.word || "").toLowerCase();
            if (!/^[a-z]{5}$/.test(w) || WORDS.indexOf(w) < 0) return;
            if (state.rows[actor].length >= state.tries[actor]) return;
            state.rows[actor].push({ word: w, score: scoreGuess(w, state.answer) });
            if (w === state.answer) {
                state.status = "over";
                state.winner = actor;
            } else {
                const other = 1 - actor;
                const otherLeft = state.rows[other].length < state.tries[other];
                const actorLeft = state.rows[actor].length < state.tries[actor];
                if (!otherLeft && !actorLeft) {
                    state.status = "over";
                    state.winner = -1; // seri
                } else {
                    state.turn = otherLeft ? other : actor;
                }
            }
            publish();
            return;
        }

        if (action.type === "restart") {
            state = createRound(state.level + 1, state.names, state.answer);
            publish();
            return;
        }

        if (action.type === "cheat") {
            if (state.status !== "playing") return;
            state.cheated[actor] = true;
            if (action.kind === "reveal") {
                const left = [];
                for (let i = 0; i < LEN; i++) if (state.reveals[actor].indexOf(i) < 0) left.push(i);
                if (left.length) {
                    const rr = rng((state.seed + state.level * 101 + state.reveals[actor].length * 7) >>> 0);
                    state.reveals[actor].push(left[Math.floor(rr() * left.length)]);
                }
            } else if (action.kind === "tries") {
                state.tries[actor] = Math.min(MAX_TRIES, state.tries[actor] + 2);
            }
            publish();
            return;
        }
    }

    function submitAction(action) {
        if (online && !room.isHost) {
            room.sendAction(action).catch(console.warn);
            return;
        }
        applyAction(action, me);
    }

    /* ---------- bot lokal (mode ai) ---------- */
    function scheduleBot() {
        if (online || !state || state.status !== "playing" || state.turn !== 1) return;
        if (botTimer || anyOverlayOpen()) return;
        const lv = state.level;
        botTimer = setTimeout(() => {
            botTimer = null;
            if (!state || state.level !== lv || state.status !== "playing" || state.turn !== 1) return;
            if (anyOverlayOpen()) { render(); return; } // tunda selama panel terbuka
            const w = botPick(state.rows[1], Math.random);
            applyAction({ type: "guess", word: w }, 1);
        }, 1000 + Math.random() * 900);
    }

    /* ---------- input ---------- */
    function press(k) {
        if (!state || state.status !== "playing") return;
        if (k === "enter") {
            if (state.turn !== me) { setMsg("Tunggu giliranmu."); return; }
            if (state.rows[me].length >= state.tries[me]) { setMsg("Kesempatanmu sudah habis."); return; }
            if (cur.length < LEN) { setMsg("Kurang " + (LEN - cur.length) + " huruf lagi."); shake(); return; }
            if (WORDS.indexOf(cur) < 0) { setMsg("Kata tidak ada di kamus."); shake(); return; }
            const w = cur;
            cur = "";
            setMsg("");
            submitAction({ type: "guess", word: w });
            render();
            return;
        }
        if (state.turn !== me) { setMsg("Tunggu giliranmu."); return; }
        if (state.rows[me].length >= state.tries[me]) { setMsg("Kesempatanmu sudah habis - tunggu lawan."); return; }
        if (k === "back") {
            cur = cur.slice(0, -1);
            render();
            return;
        }
        if (/^[a-z]$/.test(k) && cur.length < LEN) {
            cur += k;
            render();
            const row = tileEls[state.rows[me].length];
            const t = row && row[cur.length - 1];
            if (t) {
                t.classList.remove("wl-pop");
                void t.offsetWidth;
                t.classList.add("wl-pop");
            }
        }
    }

    function doCheat(kind) {
        if (!state) return;
        const playing = state.status === "playing";
        if (kind === "peek") {
            peeked = !peeked;
            if (peeked && playing) submitAction({ type: "cheat", kind: "flag" });
            render();
            return;
        }
        if (!playing) { setMsg("Cheat hanya aktif selama ronde berjalan."); return; }
        if (kind === "dead") {
            deadMarked = true;
            submitAction({ type: "cheat", kind: "flag" });
            render();
            setMsg("Huruf yang tidak ada ditandai di keyboard.");
            return;
        }
        if (kind === "fill") {
            if (state.turn !== me || state.rows[me].length >= state.tries[me]) {
                setMsg("Isi otomatis hanya bisa saat giliranmu.");
                return;
            }
            cur = state.answer;
            submitAction({ type: "cheat", kind: "flag" });
            render();
            setMsg("Jawaban diisi ke baris aktif - tekan ENTER.");
            return;
        }
        if (kind === "reveal" || kind === "tries") {
            submitAction({ type: "cheat", kind });
            render();
        }
    }

    /* ---------- event: mouse / touch (delegasi klik) ---------- */
    function handleClick(event) {
        const t = event.target;
        if (!t || !t.closest) return;
        if (t.closest("[data-exit]")) { onExit(); return; }
        const key = t.closest("[data-key]");
        if (key) { press(key.dataset.key); return; }
        const cheat = t.closest("[data-cheat]");
        if (cheat) { doCheat(cheat.dataset.cheat); return; }
        const act = t.closest("[data-act]");
        if (act) {
            const a = act.dataset.act;
            if (a === "help") openOv(helpOv);
            else if (a === "cheats") { openOv(cheatOv); render(); }
            else if (a === "close-help" || a === "close-cheats") { closeOverlays(); render(); }
            else if (a === "close-result") { resultClosed = state ? state.level : -1; resultOv.hidden = true; render(); }
            else if (a === "restart") {
                resultOv.hidden = true;
                cheatOv.hidden = true;
                cur = "";
                submitAction({ type: "restart" });
                render();
            }
            return;
        }
        if (t === helpOv || t === cheatOv) { closeOverlays(); render(); } // klik area luar kartu
    }

    /* ---------- event: keyboard fisik (desktop) ---------- */
    function onKey(e) {
        if (!root.isConnected) return;
        const tgt = e.target;
        if (tgt && tgt.closest && tgt.closest("input, textarea, select, [contenteditable]")) return;
        if (e.ctrlKey || e.metaKey || e.altKey) return;
        if (e.key === "Escape") {
            if (!helpOv.hidden || !cheatOv.hidden) { e.preventDefault(); closeOverlays(); render(); }
            else if (!resultOv.hidden) { resultClosed = state ? state.level : -1; resultOv.hidden = true; render(); }
            return;
        }
        if (!helpOv.hidden || !cheatOv.hidden) {
            if (e.key === "Enter") { e.preventDefault(); closeOverlays(); render(); }
            return;
        }
        if (!resultOv.hidden) {
            if (e.key === "Enter") { e.preventDefault(); resultOv.hidden = true; submitAction({ type: "restart" }); render(); }
            return;
        }
        if (e.key === "?") { openOv(helpOv); return; }
        if (/^[a-zA-Z]$/.test(e.key)) press(e.key.toLowerCase());
        else if (e.key === "Enter") { e.preventDefault(); press("enter"); }
        else if (e.key === "Backspace") { e.preventDefault(); press("back"); }
    }

    /* ---------- init sesuai template ---------- */
    buildKb();
    root.addEventListener("click", handleClick);
    document.addEventListener("keydown", onKey);

    if (online) {
        const offRoom = room.onRoom && room.onRoom((nextRoom) => { roomData = nextRoom; render(); });
        if (typeof offRoom === "function") unsubs.push(offRoom);
        if (room.isHost) {
            state = createRound(1, [String(playerName || "Pemain 1").slice(0, 16), "Pemain 2"], null);
            publish();
            const offAct = room.onAction && room.onAction((action) => applyAction(action, 1));
            if (typeof offAct === "function") unsubs.push(offAct);
        } else {
            const offState = room.onState && room.onState((nextState) => { state = nextState; render(); });
            if (typeof offState === "function") unsubs.push(offState);
            if (room.sendAction) room.sendAction({ type: "hello", name: String(playerName || "Pemain 2").slice(0, 16) }).catch(console.warn);
            render(); // tampilan menunggu sampai state host tiba
        }
    } else {
        state = createRound(1, ["Kamu", "Bot"], null);
        render();
    }
    openOv(helpOv); // panduan tampil sekali di awal; bot menunggu panduan ditutup

    return {
        destroy() {
            root.removeEventListener("click", handleClick);
            document.removeEventListener("keydown", onKey);
            if (botTimer) clearTimeout(botTimer);
            if (msgTimer) clearTimeout(msgTimer);
            botTimer = null;
            msgTimer = null;
            unsubs.forEach((off) => { try { off(); } catch (err) { console.warn(err); } });
            unsubs.length = 0;
        },
    };
}