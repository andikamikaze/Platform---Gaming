/* ==== GAME: sorry.js ==== */
import { iconSVG } from "../JS/icons.js";

/* =====================================================================
   SORRY! — Ludo x UNO hybrid (template baru: META + mount)
   - Mode "ai"  : kamu (human) vs bot Blue, giliran pertama acak.
   - Mode "room": multiplayer. Host = pemegang state kanonik.
                  Kursi Red/Blue diacak oleh host saat game mulai.
   ===================================================================== */

export const META = {
    id: "sorry", // harus sama dengan nama file (tanpa .js)
    name: "Sorry",
    category: "board",
    catLabel: "Board",
    desc: "Draw cards to race 3 pawns home: move, swap, kill, split. Play vs AI or a friend.",
    art: '<svg viewBox="0 0 48 48" width="54" height="54" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="8" y="9" width="20" height="30" rx="3" transform="rotate(-8 18 24)"/><rect x="22" y="8" width="20" height="30" rx="3" transform="rotate(8 32 23)"/><path d="M30 17l4 3-4 3"/><circle cx="32" cy="30" r="2.4" fill="currentColor" stroke="none"/></svg>',
    bg: ["#ede9fe", "#ddd6fe"],
};

export function mount(root, context = {}) {
    const { mode = "ai", room = null, playerName = "Player", onExit = () => { } } = context;
    const online = mode === "room" && Boolean(room);
    const isHost = !online || room.isHost; // hanya host yang menjalankan logika + timer
    let roomData = room?.room || null;
    let state = null;

    const youName = playerName || "You";
    const ui = { help: false, cheats: false, paused: false }; // overlay lokal per-klien (tidak diserialisasi)
    let seenHelp = true;
    try { seenHelp = localStorage.getItem("sorryHelpSeen") === "1"; } catch (_) { seenHelp = true; }
    if (!seenHelp) {
        ui.help = true;
        try { localStorage.setItem("sorryHelpSeen", "1"); } catch (_) { /* storage blocked */ }
    }

    /* ---------------- konstanta papan ---------------- */
    const CELL = 36;
    const SVGNS = "http://www.w3.org/2000/svg";
    const LOOP = [];
    for (let c = 0; c <= 12; c++) LOOP.push([c, 8]);
    for (let r = 7; r >= 1; r--) LOOP.push([12, r]);
    for (let c = 12; c >= 0; c--) LOOP.push([c, 0]);
    for (let r = 1; r <= 7; r++) LOOP.push([0, r]);
    const START = [0, 20];
    const BRANCH = [
        [[1, 7], [2, 7], [3, 7]],   // cabang home Red
        [[11, 1], [10, 1], [9, 1]], // cabang home Blue
    ];
    const PEN = [
        [[150, 234], [210, 234], [270, 234]],
        [[198, 90], [258, 90], [318, 90]],
    ];
    const COLS = ["#ef4444", "#3b82f6"];
    const PALE = ["#fee2e2", "#dbeafe"];
    const DARK = ["#b91c1c", "#1d4ed8"];
    const COLOR_NAME = ["Red", "Blue"];
    /* encoding progres: -1 = pen, 0..39 = loop, 40..41 = cabang, 42 = home */

    /* ---------------- shell (design minimalis) ---------------- */
    root.innerHTML = `
  <style>
/* Sorry! — indigo/violet accents and card colors kept; board and rail reflow. */
.sorry-app{--ink:#0f172a;--mut:#64748b;--line:#e2e8f0;--acc:#4f46e5;--soft:#f8fafc;color:var(--ink);width:100%;max-width:900px;margin:0 auto;padding:2px;display:flex;flex-direction:column;gap:12px;font:14px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
.sorry-app *{box-sizing:border-box}
.sorry-app [hidden]{display:none!important}
.sorry-app :is(button,input,select):focus-visible{outline:2px solid var(--acc);outline-offset:2px}
.sorry-app .s-hud{display:flex;flex-wrap:wrap;gap:8px;align-items:center;row-gap:8px;margin-bottom:8px}
.sorry-app .s-chip{display:inline-flex;align-items:center;gap:6px;font-size:12px;color:var(--mut);padding:5px 11px;min-height:28px;border:1px solid var(--line);border-radius:999px;background:#fff;white-space:nowrap}
.sorry-app .s-chip b{color:var(--ink);font-weight:600}
.sorry-app .s-dot{width:8px;height:8px;border-radius:50%;background:#94a3b8;flex:none}
.sorry-app .s-msg{font-size:12.5px;color:var(--mut);min-height:18px;margin:0 0 8px}
.sorry-app .s-wrap{display:flex;gap:16px;flex-wrap:wrap;align-items:flex-start;min-width:0}
.sorry-app .s-board{flex:1 1 340px;min-width:0;max-width:540px;user-select:none;-webkit-user-select:none;touch-action:manipulation}
.sorry-app .s-board svg{display:block;width:100%;height:auto;border-radius:12px;border:1px solid var(--line)}
.sorry-app .s-side{flex:0 0 208px;display:flex;flex-direction:column;gap:10px;max-width:100%;min-width:0}
.sorry-app .s-deck{display:flex;gap:10px;align-items:center;min-height:56px;padding:10px 12px;border-radius:12px;background:#fff;border:1px solid var(--line);cursor:default;user-select:none;transition:border-color .2s, box-shadow .2s}
.sorry-app .s-deck svg{width:26px;height:26px;flex:none;color:var(--mut)}
.sorry-app .s-deck b{display:block;font-size:13.5px}
.sorry-app .s-deck span{font-size:11px;color:var(--mut)}
.sorry-app .s-deck.hot{cursor:pointer;border-color:var(--acc);animation:sDeck 1.2s ease-in-out infinite}
.sorry-app .s-deck.hot svg{color:var(--acc)}
.sorry-app .s-card{display:flex;gap:10px;align-items:center;border:1px solid var(--line);border-radius:12px;padding:9px 11px;background:#fff;min-height:62px}
.sorry-app .s-ic{flex:none;width:40px;height:40px;border-radius:10px;display:grid;place-items:center;background:#eef2ff;color:var(--acc)}
.sorry-app .s-ic svg{width:24px;height:24px}
.sorry-app .s-c-swipe .s-ic{background:#fef3c7;color:#b45309}
.sorry-app .s-c-sorry .s-ic{background:#fee2e2;color:#b91c1c}
.sorry-app .s-c-split .s-ic{background:#ccfbf1;color:#0f766e}
.sorry-app .s-tx b{display:block;font-size:12.5px;line-height:1.3}
.sorry-app .s-tx span{color:var(--mut);font-size:11px;line-height:1.35;display:block}
.sorry-app .s-split{display:flex;gap:8px}
.sorry-app .s-split .s-btn{flex:1}
.sorry-app .s-btn{appearance:none;border:1px solid var(--line);background:#fff;color:var(--ink);border-radius:9px;padding:8px 12px;min-height:36px;font:inherit;font-size:13px;font-weight:600;cursor:pointer;transition:border-color .15s, background .15s}
.sorry-app .s-btn:hover:not(:disabled){border-color:var(--acc);color:var(--acc)}
.sorry-app .s-btn:disabled{opacity:.4;cursor:default}
.sorry-app .s-btn.primary{background:var(--acc);border-color:var(--acc);color:#fff}
.sorry-app .s-btn.primary:hover:not(:disabled){background:#4338ca;color:#fff}
.sorry-app .s-btn:focus-visible{outline:2px solid var(--acc);outline-offset:2px}
.sorry-app .s-tip{color:var(--mut);font-size:11px;line-height:1.5}
.sorry-app .s-keys{color:var(--mut);font-size:11px;line-height:2}
.sorry-app .s-kbd{border:1px solid var(--line);border-bottom-width:2px;border-radius:5px;padding:0 5px;font-size:10.5px;background:var(--soft);font-family:inherit}
.sorry-app .sorry-pawn{transition:transform .45s cubic-bezier(.4,.1,.2,1)}
.sorry-app .sorry-pawn.hopping{transition:transform .16s linear}
.sorry-app .sorry-pawn .ring{opacity:0}
.sorry-app .sorry-pawn.movable,.sorry-app .sorry-pawn.target{cursor:pointer}
.sorry-app .sorry-pawn.movable .ring,.sorry-app .sorry-pawn.target .ring{opacity:1;animation:sPulse .95s ease-in-out infinite;transform-box:fill-box;transform-origin:center}
.sorry-app .sorry-pawn.target .ring{stroke-dasharray:4 4}
.sorry-app .sorry-pawn.movable:hover .body,.sorry-app .sorry-pawn.target:hover .body{filter:brightness(1.12)}
/* virtual pad: touch / narrow screens only */
.sorry-app .s-pad{display:none;grid-template-columns:repeat(4,1fr);gap:8px;margin-top:12px}
.sorry-app .s-pad .s-btn{min-height:48px;font-size:13px}
.sorry-app .s-pad-split{display:none;grid-template-columns:1fr 1fr;gap:8px;margin-top:8px}
@media (pointer:coarse),(max-width:720px){
  .sorry-app .s-pad{display:grid}
  .sorry-app .s-pad-split.on{display:grid}
  .sorry-app .s-keys{display:none}
  .sorry-app .s-side{flex:1 1 100%}
}
/* overlay / modal */
.sorry-app .s-ov{position:absolute;inset:0;display:grid;place-items:center;background:rgba(15,23,42,.42);backdrop-filter:blur(2px);z-index:30;border-radius:12px;padding:12px}
.sorry-app .s-modal{background:#fff;border:1px solid var(--line);border-radius:14px;padding:20px;max-width:340px;width:100%;box-shadow:0 10px 30px rgba(15,23,42,.14);text-align:center;max-height:100%;overflow:auto}
.sorry-app .s-modal.wide{max-width:430px;text-align:left;max-height:min(72dvh,540px);overflow:auto}
.sorry-app .s-modal h3{margin:0 0 6px;font-size:18px}
.sorry-app .s-modal p{margin:0 0 14px;font-size:12.5px;color:var(--mut);line-height:1.55}
.sorry-app .s-bigic{width:64px;height:64px;border-radius:16px;display:grid;place-items:center;margin:0 auto 12px;background:#eef2ff;color:var(--acc)}
.sorry-app .s-bigic svg{width:42px;height:42px}
.sorry-app .s-modal h4{margin:12px 0 6px;font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:var(--mut)}
.sorry-app .s-modal ul{margin:0;padding-left:18px;font-size:12.5px;line-height:1.7;color:var(--ink)}
.sorry-app .s-cheatgrid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:10px}
.sorry-app .s-cheatgrid .s-btn{padding:8px 4px;font-size:12px}
.sorry-app .s-row{display:flex;gap:8px;justify-content:center;flex-wrap:wrap}
.sorry-app .s-win{color:#15803d}
.sorry-app .s-lose{color:#b91c1c}
@keyframes sDeck{0%,100%{box-shadow:0 0 0 0 rgba(79,70,229,.35)}50%{box-shadow:0 0 0 7px rgba(79,70,229,0)}}
@keyframes sPulse{0%,100%{opacity:.25;transform:scale(1)}50%{opacity:1;transform:scale(1.28)}}
@media (pointer:coarse){
  .sorry-app .s-btn{min-height:44px}
  .sorry-app .s-chip{min-height:44px;padding:8px 12px}
}
@media (prefers-reduced-motion:reduce){.sorry-app *{animation-duration:.01ms!important;animation-iteration-count:1!important;transition-duration:.01ms!important}}

/* --- layout redesign: HUD bar + fill board + overlay modals (last) --- */
.sorry-app.game-fill > .s-board-area{flex:1 1 auto;min-height:0;aspect-ratio:auto;display:flex;flex-direction:column;gap:8px;padding:10px;border:1px solid var(--line);border-radius:12px;background:var(--soft);position:relative;min-width:0;overflow:hidden}
.sorry-app .s-board-area > .s-msg{flex:none;margin:0;min-height:17px}
.sorry-app .s-wrap{flex:1 1 auto;min-height:0;align-items:center;justify-content:center;gap:14px}
.sorry-app .s-board svg{aspect-ratio:468/324;height:auto;background:#fff}
.sorry-app .s-spacer{flex:1 1 auto}
.sorry-app .s-icon-btn{display:inline-flex;align-items:center;gap:6px}
.sorry-app .s-icon-btn svg{flex:none;display:block}
.sorry-app .s-hud .s-btn{min-height:30px;padding:6px 8px;font-size:10px}
.sorry-app .s-hud .s-chip{padding:5px 8px;font-size:11px;min-height:26px}
.sorry-app .s-hud-actions{display:flex;align-items:center;gap:6px;flex:none}
.sorry-app .s-chip[data-el="statusChip"]{max-width:190px;overflow:hidden;text-overflow:ellipsis}
.sorry-app .s-modal{display:flex;flex-direction:column;overflow:hidden;max-height:100%}
.sorry-app .s-modal.wide{max-width:460px;max-height:100%;overflow:hidden}
.sorry-app .s-head{display:flex;align-items:center;justify-content:space-between;gap:10px;flex:none}
.sorry-app .s-head h3{margin:0}
.sorry-app .s-scroll{flex:1 1 auto;min-height:0;overflow:auto}
.sorry-app .s-foot{display:flex;align-items:center;justify-content:space-between;gap:10px;flex:none;margin-top:12px}
.sorry-app .s-foot .s-btn{min-height:36px}
.sorry-app .s-note{font-size:11px;color:var(--mut)}
@media (max-width:640px){
  .sorry-app.game-fill > .s-board-area:not(:has(.s-ov:not([hidden]))){aspect-ratio:auto;flex:1 1 auto}
  .sorry-app.game-fill > .s-board-area:has(.s-ov:not([hidden])){flex:1 1 auto;min-height:min(70dvh,620px);aspect-ratio:auto}
  .sorry-app .s-hud{gap:5px;row-gap:5px;margin-bottom:0}
  .sorry-app .s-hud .s-chip{padding:4px 6px;font-size:9px;min-height:0}
  .sorry-app .s-hud .s-chip[data-hud="seat"],
  .sorry-app .s-hud .s-chip[data-hud="h1"],
  .sorry-app .s-hud .s-chip[data-hud="level"],
  .sorry-app .s-hud .s-chip[data-el="statusChip"]{display:none}
  .sorry-app .s-hud .s-btn{min-height:32px;padding:5px 7px;font-size:9px}
  .sorry-app .s-hud .s-btn-label,
  .sorry-app .s-hud .s-spacer{display:none}
  .sorry-app .s-ov{padding:8px}
  .sorry-app .s-modal{max-width:100%;max-height:100%;padding:14px;border-radius:12px}
  .sorry-app .s-modal.wide{width:100%;height:100%;max-height:100%}
  .sorry-app .s-scroll{scrollbar-width:none}
  .sorry-app .s-scroll::-webkit-scrollbar{display:none}
  .sorry-app .s-foot{margin-top:8px;padding-top:8px;border-top:1px solid var(--line)}
  .sorry-app .s-note{display:none}
  .sorry-app .s-pad,.sorry-app .s-pad-split{margin-top:8px}
}
</style>
  <div class="game-app sorry-app game-fill" data-sorry>
    <div class="s-hud">
      <span class="s-chip" data-hud="turn"><i class="s-dot" data-el="turndot"></i>TURN <b data-el="turn">–</b></span>
      <span class="s-chip" data-hud="seat">YOU <b data-el="seat">–</b></span>
      <span class="s-chip" data-hud="h0">HOME <b data-el="h0">0/3</b></span>
      <span class="s-chip" data-hud="h1">FOE <b data-el="h1">0/3</b></span>
      <span class="s-chip" data-hud="cards">CARDS <b data-el="cards">0</b></span>
      <span class="s-chip" data-hud="level">LV <b data-el="level">–</b></span>
      <span class="s-chip" data-el="statusChip"><span data-status>Ready</span></span>
      <span class="s-spacer"></span>
      <div class="s-hud-actions">
        <button class="s-btn s-icon-btn" type="button" data-help aria-label="How to play" title="How to play (H)">${iconSVG("helpCircle", { size: 14 })}<span class="s-btn-label">Help</span></button>
        <button class="s-btn s-icon-btn" type="button" data-cheats data-el="cheatBtn" aria-label="Cheats" title="Cheats (C)">${iconSVG("wrench", { size: 14 })}<span class="s-btn-label">Cheats</span></button>
        <button class="s-btn s-icon-btn" type="button" data-pause aria-label="Pause" title="Pause or Resume (P)">${iconSVG("pause", { size: 14 })}<span class="s-btn-label">Pause</span></button>
        <button class="s-btn s-icon-btn" type="button" data-restart aria-label="Restart" title="Restart (R)">${iconSVG("refresh", { size: 14 })}<span class="s-btn-label">Restart</span></button>
        <button class="s-btn s-icon-btn" type="button" data-newlevel aria-label="New level" title="New level (N)">${iconSVG("sparkles", { size: 14 })}<span class="s-btn-label">New level</span></button>
        <button class="s-btn s-icon-btn" type="button" data-exit aria-label="Exit game" title="Exit game">${iconSVG("logOut", { size: 14 })}<span class="s-btn-label">Exit</span></button>
      </div>
    </div>
    <section class="game-panel s-board-area" data-board>
      <p class="s-msg" data-el="msg"></p>
        <div class="s-wrap">
          <div class="s-board"><svg viewBox="0 0 468 324" font-family="inherit" role="img" aria-label="Sorry board"></svg></div>
          <aside class="s-side">
            <div class="s-deck" data-act="draw" data-el="deck" role="button" tabindex="0" aria-label="Draw a card">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="3.5" width="14" height="17" rx="2.5"/><path d="M8.5 8h7M8.5 12h7M8.5 16h4"/></svg>
              <div><b>Draw a card</b><span>click / Space</span></div>
            </div>
            <div data-el="cardslot"></div>
            <div class="s-split" data-el="split" hidden>
              <button class="s-btn" type="button" data-split="1+3">1 + 3</button>
              <button class="s-btn" type="button" data-split="2+2">2 + 2</button>
            </div>
            <div class="s-tip">Kartu angka menggerakkan pawn (dari pen, langkah 1 masuk track). Harus mendarat tepat di bendera — kelebihan langkah memantul mundur.</div>
            <div class="s-keys">
              <span class="s-kbd">Space</span> draw / play &nbsp;<span class="s-kbd">1–3</span> pilih pawn<br>
              <span class="s-kbd">Z</span>/<span class="s-kbd">X</span> split 1+3 / 2+2 &nbsp;<span class="s-kbd">H</span> help<br>
              <span class="s-kbd">C</span> cheats &nbsp;<span class="s-kbd">R</span> restart &nbsp;<span class="s-kbd">N</span> level baru
            </div>
          </aside>
        </div>
        <div class="s-ov" data-ov="wait" hidden><div class="s-modal"><h3>Menunggu host…</h3><p>Host sedang menyiapkan level dan mengacak kursi.</p></div></div>

        <div class="s-ov" data-ov="card" hidden>
          <div class="s-modal">
            <div class="s-bigic" data-el="cardIcon"></div>
            <h3 data-el="cardTitle">You drew</h3>
            <p><b data-el="cardName"></b><br><span data-el="cardHint"></span></p>
            <button class="s-btn primary" type="button" data-act="play" data-el="cardBtn">Play card</button>
            <p data-el="cardWait" hidden style="margin:0">Menunggu lawan memainkan kartu… (otomatis lanjut)</p>
          </div>
        </div>

        <div class="s-ov" data-ov="help" hidden>
          <div class="s-modal wide">
            <div class="s-head"><h3>How to play</h3><button class="s-btn" type="button" data-help-close aria-label="Close help">${iconSVG("x", { size: 14 })}</button></div>
            <div class="s-scroll">
              <p>Bawa ketiga pawn kamu dari pen ke bendera HOME sebelum lawan. Setiap giliran: draw 1 kartu, lalu mainkan.</p>
              <h4>Kartu</h4>
              <ul>
                <li><b>Move 1–4</b> — majukan 1 pawn sejumlah angka. Dari pen, langkah pertama masuk track.</li>
                <li><b>Swipe</b> — tukar posisi pawn kamu di track dengan pawn lawan terdekat.</li>
                <li><b>Sorry</b> — kirim 1 pawn lawan (track / cabang) kembali ke pen.</li>
                <li><b>Split</b> — bagi 4 langkah: 1+3 atau 2+2, boleh pada pawn yang sama.</li>
              </ul>
              <h4>Aturan gerak</h4>
              <ul>
                <li>Masuk jalur HOME hanya lewat gate berwarna kamu.</li>
                <li>Harus mendarat <b>tepat</b> di bendera; kelebihan langkah memantul mundur.</li>
                <li>Kartu tanpa sasaran valid otomatis dibuang (giliran lewat).</li>
              </ul>
              <h4>Level</h4>
              <ul>
                <li>Tiap level = seed acak: komposisi deck, posisi awal, dan giliran pertama.</li>
                <li>Generator memvalidasi via BFS bahwa semua pawn <b>pasti bisa</b> mencapai HOME.</li>
                <li>Tekan <span class="s-kbd">N</span> / tombol <b>New level</b> untuk level baru.</li>
              </ul>
              <h4>Kontrol</h4>
              <ul>
                <li>Desktop: klik deck / pawn, <span class="s-kbd">Space</span> draw, <span class="s-kbd">1–3</span> pilih pawn (pawn lawan saat Sorry), <span class="s-kbd">Z</span>/<span class="s-kbd">X</span> split.</li>
                <li><span class="s-kbd">H</span> help · <span class="s-kbd">C</span> cheats · <span class="s-kbd">P</span> pause · <span class="s-kbd">R</span> restart · <span class="s-kbd">Esc</span> tutup overlay.</li>
                <li>Mobile: gunakan virtual button di bawah papan.</li>
                <li>Multiplayer: kursi Red/Blue diacak; giliran pertama acak. Cheat hanya untuk mode AI.</li>
              </ul>
            </div>
            <div class="s-foot"><span class="s-note">Press H to reopen this guide</span><button class="s-btn primary" type="button" data-help-close>Got it</button></div>
          </div>
        </div>

        <div class="s-ov" data-ov="cheats" hidden>
          <div class="s-modal wide">
            <div class="s-head"><h3>Cheats <span style="font-size:11px;color:var(--mut)">(mode AI saja)</span></h3><button class="s-btn" type="button" data-close-cheats aria-label="Close cheats">${iconSVG("x", { size: 14 })}</button></div>
            <div class="s-scroll">
              <p>Menggunakan cheat menandai hasil akhir sebagai "cheated".</p>
              <h4>Kartu berikutnya (draw kamu)</h4>
              <div class="s-cheatgrid">
                <button class="s-btn" type="button" data-cheat="next-1">Move 1</button>
                <button class="s-btn" type="button" data-cheat="next-2">Move 2</button>
                <button class="s-btn" type="button" data-cheat="next-3">Move 3</button>
                <button class="s-btn" type="button" data-cheat="next-4">Move 4</button>
                <button class="s-btn" type="button" data-cheat="next-swipe">Swipe</button>
                <button class="s-btn" type="button" data-cheat="next-sorry">Sorry</button>
                <button class="s-btn" type="button" data-cheat="next-split">Split</button>
              </div>
              <h4>Aksi instan</h4>
              <div class="s-cheatgrid">
                <button class="s-btn" type="button" data-cheat="home-0">Pawn 1 → Home</button>
                <button class="s-btn" type="button" data-cheat="home-1">Pawn 2 → Home</button>
                <button class="s-btn" type="button" data-cheat="home-2">Pawn 3 → Home</button>
                <button class="s-btn" type="button" data-cheat="resetfoe">Reset Blue</button>
                <button class="s-btn" type="button" data-cheat="skipfoe">Skip giliran Blue</button>
                <button class="s-btn" type="button" data-cheat="win">Instant win</button>
              </div>
            </div>
            <div class="s-foot"><span class="s-note">Press C to toggle cheats</span><button class="s-btn" type="button" data-close-cheats>Close</button></div>
          </div>
        </div>

        <div class="s-ov" data-ov="over" hidden>
          <div class="s-modal">
            <h3 data-el="ovTitle">Game over</h3>
            <p data-el="ovSub"></p>
            <div class="s-row">
              <button class="s-btn primary" type="button" data-act="restart" data-el="ovRestart">Play again</button>
              <button class="s-btn" type="button" data-act="newlevel" data-el="ovNew">New level</button>
            </div>
            <p data-el="ovWait" hidden style="margin:10px 0 0">Host yang mengontrol restart.</p>
          </div>
        </div>

        <div class="s-ov" data-ov="pause" hidden>
          <div class="s-modal">
            <h3>Paused</h3>
            <p>Timer, bot, dan animasi dihentikan. Lanjutkan saat siap.</p>
            <div class="s-row"><button class="s-btn primary" type="button" data-resume>Resume</button></div>
          </div>
        </div>
    </section>
    <div class="s-pad" data-el="pad">
      <button class="s-btn primary" type="button" data-pad="draw" data-el="padDraw">Draw</button>
      <button class="s-btn" type="button" data-pad="0" data-el="pad0">Pawn 1</button>
      <button class="s-btn" type="button" data-pad="1" data-el="pad1">Pawn 2</button>
      <button class="s-btn" type="button" data-pad="2" data-el="pad2">Pawn 3</button>
    </div>
    <div class="s-pad-split" data-el="padSplit" hidden>
      <button class="s-btn" type="button" data-split="1+3">Split 1 + 3</button>
      <button class="s-btn" type="button" data-split="2+2">Split 2 + 2</button>
    </div>
  </div>`;

    /* ---------------- referensi DOM ---------------- */
    const $ = (sel) => root.querySelector(sel);
    const app = $("[data-sorry]");
    const board = $("[data-board]");
    const svg = $(".s-board svg");
    const deckEl = $('[data-el="deck"]');
    const cardSlot = $('[data-el="cardslot"]');
    const splitBox = $('[data-el="split"]');
    const padSplit = $('[data-el="padSplit"]');
    const statusEl = $("[data-status]");
    const pbtn = $("[data-pause]");
    const ov = {
        wait: $('[data-ov="wait"]'), card: $('[data-ov="card"]'),
        help: $('[data-ov="help"]'), cheats: $('[data-ov="cheats"]'), over: $('[data-ov="over"]'),
        pause: $('[data-ov="pause"]'),
    };
    const el = {};
    ["turn", "turndot", "seat", "h0", "h1", "cards", "level", "msg", "cardIcon", "cardTitle", "cardName", "cardHint",
        "cardBtn", "cardWait", "ovTitle", "ovSub", "ovRestart", "ovNew", "ovWait", "padDraw", "pad0", "pad1", "pad2", "cheatBtn"]
        .forEach((k) => (el[k] = $('[data-el="' + k + '"]')));

    /* ---------------- timer (logika hanya di host, pause-aware) ---------------- */
    let logicTimer = null;
    const timers = new Map(); // id -> { fn, kind, remaining, startedAt, handle }
    let timerSeq = 0;
    const fireTimer = (id) => {
        const rec = timers.get(id);
        if (!rec || ui.paused) return;
        timers.delete(id);
        rec.fn();
    };
    const arm = (fn, ms, kind) => {
        const id = ++timerSeq;
        const rec = { id, fn, kind, remaining: Math.max(0, ms), startedAt: Date.now(), handle: null };
        timers.set(id, rec);
        if (!ui.paused) rec.handle = setTimeout(() => fireTimer(id), rec.remaining);
        return id;
    };
    const disarm = (id) => {
        const rec = timers.get(id);
        if (!rec) return;
        if (rec.handle) clearTimeout(rec.handle);
        timers.delete(id);
    };
    const clearLogic = () => {
        timers.forEach((rec, id) => { if (rec.kind === "logic") disarm(id); });
        logicTimer = null;
    };
    const schedule = (fn, ms) => {
        clearLogic();
        logicTimer = arm(() => { logicTimer = null; fn(); }, ms, "logic");
    };
    const visTimers = new Set(); // timer animasi visual (per klien, tidak memengaruhi state)
    const later = (fn, ms) => {
        const id = arm(() => { visTimers.delete(id); fn(); }, ms, "vis");
        visTimers.add(id);
        return id;
    };
    const pauseTimers = () => {
        const now = Date.now();
        timers.forEach((rec) => {
            if (rec.handle) clearTimeout(rec.handle);
            rec.remaining = Math.max(0, rec.remaining - (now - rec.startedAt));
            rec.handle = null;
        });
    };
    const resumeTimers = () => {
        const now = Date.now();
        timers.forEach((rec) => {
            rec.startedAt = now;
            rec.handle = setTimeout(() => fireTimer(rec.id), rec.remaining);
        });
    };
    const clearAllTimers = () => { timers.forEach((_, id) => disarm(id)); };

    /* ---------------- util papan ---------------- */
    const cellStr = (c, r, fill, stroke, sw) =>
        '<rect x="' + c * CELL + '" y="' + r * CELL + '" width="' + CELL + '" height="' + CELL +
        '" fill="' + fill + '" stroke="' + (stroke || "#e2e8f0") + '" stroke-width="' + (sw || 1) + '"/>';
    const chev = (x, y, rot, color, w) =>
        '<path d="M-4,-4.5 L3.5,0 L-4,4.5" fill="none" stroke="' + color + '" stroke-width="' + (w || 2.5) +
        '" stroke-linecap="round" stroke-linejoin="round" transform="translate(' + x + "," + y + ") rotate(" + rot + ')"/>';
    const txt = (x, y, size, color, str, weight, extra) =>
        '<text x="' + x + '" y="' + y + '" font-size="' + size + '" text-anchor="middle" fill="' + color + '"' +
        (weight ? ' font-weight="' + weight + '"' : "") + (extra || "") + ">" + str + "</text>";

    function drawBoard() {
        let s = '<rect x="1" y="1" width="466" height="322" rx="12" fill="#ffffff" stroke="#e2e8f0" stroke-width="2"/>';
        LOOP.forEach(([c, r]) => { s += cellStr(c, r, "#ffffff"); });
        s += cellStr(0, 8, PALE[0]) + cellStr(12, 0, PALE[1]);
        s += cellStr(0, 7, "#ffffff", COLS[0], 2.5) + cellStr(12, 1, "#ffffff", COLS[1], 2.5);
        BRANCH.forEach((cells, pl) => cells.forEach(([c, r], k) => {
            s += k < 2 ? cellStr(c, r, PALE[pl], COLS[pl]) : cellStr(c, r, COLS[pl], DARK[pl], 2);
        }));
        BRANCH.forEach((cells) => {
            const [c, r] = cells[2];
            s += '<path d="M0,-7 L0,7 M0,-7 L7,-4.5 L0,-2" fill="none" stroke="#ffffff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" transform="translate(' + (c * CELL + 18) + "," + (r * CELL + 18) + ')"/>';
        });
        s += txt(18, 299, 6.5, DARK[0], "START", 700) + chev(18, 311, 0, DARK[0]);
        s += txt(450, 12, 6.5, DARK[1], "START", 700) + chev(450, 24, 180, DARK[1]);
        s += txt(18, 261, 6, DARK[0], "HOME", 700) + chev(18, 274, 0, DARK[0]);
        s += txt(450, 46, 6, DARK[1], "HOME", 700) + chev(450, 59, 180, DARK[1]);
        s += chev(234, 306, 0, "#cbd5e1", 2) + chev(450, 162, -90, "#cbd5e1", 2) +
            chev(234, 18, 180, "#cbd5e1", 2) + chev(18, 162, 90, "#cbd5e1", 2);
        s += '<rect x="126" y="216" width="192" height="36" rx="10" fill="#fef2f2" stroke="#fecaca" stroke-width="1.5"/>';
        s += '<rect x="174" y="72" width="168" height="36" rx="10" fill="#eff6ff" stroke="#bfdbfe" stroke-width="1.5"/>';
        PEN.forEach((pen, pl) => pen.forEach(([x, y]) => {
            s += '<circle cx="' + x + '" cy="' + y + '" r="12" fill="#ffffff" stroke="' + COLS[pl] + '" stroke-width="1.5" stroke-dasharray="3 3"/>';
        }));
        s += txt(118, 238, 9, DARK[0], "RED", 800) + txt(166, 94, 9, DARK[1], "BLUE", 800);
        s += '<rect x="144" y="108" width="180" height="108" rx="14" fill="#f8fafc" stroke="#e2e8f0" stroke-width="1.5"/>';
        s += txt(234, 150, 26, "#0f172a", "SORRY", 800);
        s += txt(234, 172, 9.5, "#64748b", "Ludo meets cards");
        s += txt(234, 194, 9.5, "#64748b", "", 600, ' data-el="lvScenario"');
        s += txt(234, 207, 9.5, "#94a3b8", "", 400, ' data-el="lvSeed"');
        svg.innerHTML = s;
    }

    const pawnEls = [];
    function buildPawns() {
        for (let pl = 0; pl < 2; pl++) for (let i = 0; i < 3; i++) {
            const g = document.createElementNS(SVGNS, "g");
            g.setAttribute("class", "sorry-pawn");
            g.dataset.p = pl; g.dataset.i = i;
            g.innerHTML =
                '<circle class="ring" r="14" fill="none" stroke="' + COLS[pl] + '" stroke-width="2.8"/>' +
                '<circle class="body" r="10.5" fill="' + COLS[pl] + '" stroke="#ffffff" stroke-width="2.4"/>' +
                '<circle r="3.6" fill="#ffffff" opacity="0.9"/>' +
                '<circle r="15" fill="#ffffff" opacity="0" pointer-events="all"/>';
            svg.appendChild(g);
            pawnEls.push(g);
        }
    }
    const homeSlot = (pl, i) => {
        const [c, r] = BRANCH[pl][2];
        const off = [[-11, -9], [11, -9], [0, 10]][i];
        return [c * CELL + 18 + off[0], r * CELL + 18 + off[1]];
    };
    function progressPos(pl, i, p) {
        if (p === -1) return PEN[pl][i];
        if (p === 42) return homeSlot(pl, i);
        const [c, r] = p <= 39 ? LOOP[(START[pl] + p) % 40] : BRANCH[pl][p - 40];
        return [c * CELL + 18, r * CELL + 18];
    }
    const locKey = (pl, i, p) => {
        if (p === -1 || p === 42) return "u" + pl + "-" + i;
        if (p <= 39) return "L" + ((START[pl] + p) % 40);
        return "B" + pl + "-" + p;
    };
    function offsets(n) {
        if (n <= 1) return [[0, 0]];
        const R = n === 2 ? 8 : 10, out = [];
        for (let k = 0; k < n; k++) {
            const a = -Math.PI / 2 + (k * 2 * Math.PI) / n;
            out.push([Math.cos(a) * R, Math.sin(a) * R]);
        }
        return out;
    }

    /* ---------------- animasi hop visual (per klien) ---------------- */
    let lastMoveId = 0;
    const hopActive = {}; // id pawn -> token
    const hopTok = {};
    function cancelHops() {
        visTimers.forEach(disarm); visTimers.clear();
        Object.keys(hopActive).forEach((id) => delete hopActive[id]);
        pawnEls.forEach((g) => g.classList.remove("hopping"));
    }
    function startHop(pl, pi, path) {
        const id = pl * 3 + pi;
        const tok = (hopTok[id] = (hopTok[id] || 0) + 1);
        hopActive[id] = tok;
        const g = pawnEls[id];
        g.classList.add("hopping");
        let k = 0;
        const step = () => {
            if (hopActive[id] !== tok) return;
            const [x, y] = progressPos(pl, pi, path[k]);
            g.style.transform = "translate(" + x + "px," + y + "px)";
            k++;
            if (k < path.length) later(step, 170);
            else later(() => {
                if (hopActive[id] !== tok) return;
                delete hopActive[id];
                g.classList.remove("hopping");
                paintPawns();
            }, 180);
        };
        step();
    }
    function paintPawns() {
        if (!state) return;
        const groups = {};
        for (let pl = 0; pl < 2; pl++) for (let i = 0; i < 3; i++) {
            const k = locKey(pl, i, state.pawns[pl][i]);
            (groups[k] || (groups[k] = [])).push(pl * 3 + i);
        }
        Object.keys(groups).forEach((k) => {
            const list = groups[k], off = offsets(list.length);
            list.forEach((id, idx) => {
                if (hopActive[id]) return; // sedang dianimasikan step-by-step
                const pl = Math.floor(id / 3), i = id % 3;
                const [x, y] = progressPos(pl, i, state.pawns[pl][i]);
                pawnEls[id].style.transform = "translate(" + (x + off[idx][0]) + "px," + (y + off[idx][1]) + "px)";
            });
        });
    }

    /* ---------------- kartu ---------------- */
    const cardName = (c) => c.t === "n" ? "Move " + c.v : c.t === "swipe" ? "Swipe" : c.t === "sorry" ? "Sorry" : "Split";
    const cardHint = (c) => {
        if (c.t === "n") return "Majukan satu pawn " + c.v + " langkah. Dari pen, langkah 1 masuk track.";
        if (c.t === "swipe") return "Tukar posisi pawn kamu dengan pawn lawan terdekat di track.";
        if (c.t === "sorry") return "Kirim satu pawn lawan kembali ke pen.";
        return "Bagi 4 langkah antara dua pawn: 1+3 atau 2+2 (boleh pawn sama).";
    };
    function cardIcon(c) {
        if (c.t === "n") {
            const pos = { 1: [[12, 12]], 2: [[7, 7], [17, 17]], 3: [[6, 6], [12, 12], [18, 18]], 4: [[7, 7], [17, 7], [7, 17], [17, 17]] }[c.v];
            return '<svg viewBox="0 0 24 24" aria-hidden="true">' + pos.map((p) => '<circle cx="' + p[0] + '" cy="' + p[1] + '" r="3" fill="currentColor"/>').join("") + "</svg>";
        }
        if (c.t === "swipe") return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h13"/><path d="M14 3.5L17.5 7 14 10.5"/><path d="M20 17H7"/><path d="M10 13.5L6.5 17l3.5 3.5"/></svg>';
        if (c.t === "sorry") return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="6.5"/><path d="M12 2.5v4M12 17.5v4M2.5 12h4M17.5 12h4"/><circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none"/></svg>';
        return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 21v-8"/><path d="M12 13L6 6"/><path d="M12 13l6-7"/><path d="M6 6h3M6 6v3"/><path d="M18 6h-3M18 6v3"/></svg>';
    }
    function miniCard(c, prefix) {
        cardSlot.innerHTML = '<div class="s-card s-c-' + c.t + '"><div class="s-ic">' + cardIcon(c) +
            '</div><div class="s-tx"><b>' + prefix + ": " + cardName(c) + "</b><span>" + cardHint(c) + "</span></div></div>";
    }
    function cardPlaceholder() {
        cardSlot.innerHTML = '<div class="s-card"><div class="s-tx"><b>Draw a card</b><span>Klik deck atau tekan Space.</span></div></div>';
    }

    /* ---------------- aturan gerak ---------------- */
    function movePath(pos, n) {
        const path = [];
        if (pos === -1) { path.push(0); pos = 0; n--; }
        if (n <= 0) return path;
        const target = pos + n;
        const end = target <= 42 ? target : 84 - target;
        for (let p = pos + 1; p <= Math.min(target, 42); p++) path.push(p);
        if (target > 42) for (let p = 41; p >= end; p--) path.push(p);
        return path;
    }
    const hasLoopPawns = (pl) => state.pawns[pl].some((p) => p >= 0 && p <= 39);
    const isWin = (pl) => state.pawns[pl].every((p) => p === 42);
    const countHome = (pl) => state.pawns[pl].filter((p) => p === 42).length;

    /* ---------------- random level generator (dijamin solvable) ---------------- */
    function mulberry32(a) {
        return function () {
            a |= 0; a = (a + 0x6D2B79F5) | 0;
            let t = Math.imul(a ^ (a >>> 15), 1 | a);
            t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    }
    // BFS: apakah posisi start bisa mencapai 42 dengan himpunan langkah yang tersedia?
    function reachable(start, steps) {
        const seen = new Set([start]), q = [start];
        while (q.length) {
            const p = q.shift();
            for (const n of steps) {
                const np = p === -1 ? n - 1 : (p + n <= 42 ? p + n : 84 - (p + n));
                if (np === 42) return true;
                if (!seen.has(np)) { seen.add(np); q.push(np); }
            }
        }
        return false;
    }
    function genLevel(seed) {
        const rnd = mulberry32(seed);
        const ri = (a, b) => a + Math.floor(rnd() * (b - a + 1));
        const scenarios = ["classic", "headstart", "midfield", "scatter", "sprint"];
        const scenario = scenarios[Math.floor(rnd() * scenarios.length)];
        let rel;
        if (scenario === "classic") rel = [-1, -1, -1];
        else if (scenario === "headstart") rel = [0, -1, -1];
        else if (scenario === "midfield") rel = [ri(6, 18), -1, -1];
        else if (scenario === "scatter") rel = [ri(0, 12), ri(16, 30), -1];
        else rel = [ri(28, 37), ri(16, 26), ri(4, 12)];
        // fairness: kedua pemain mendapat multiset posisi relatif yang sama (urutan diacak)
        const starts = [rel.slice(), rel.slice().sort(() => rnd() - 0.5)];
        const deck = [];
        [1, 2, 3, 4].forEach((v) => { deck.push({ t: "n", v }); deck.push({ t: "n", v }); });
        ["swipe", "sorry", "split"].forEach((t) => { deck.push({ t }); if (rnd() < 0.5) deck.push({ t }); });
        const pool = [{ t: "n", v: 1 }, { t: "n", v: 2 }, { t: "n", v: 3 }, { t: "n", v: 4 }, { t: "swipe" }, { t: "sorry" }, { t: "split" }];
        const extra = Math.floor(rnd() * 5);
        for (let k = 0; k < extra; k++) deck.push(pool[Math.floor(rnd() * pool.length)]);
        for (let i = deck.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1));[deck[i], deck[j]] = [deck[j], deck[i]]; }
        // validator solvability: pastikan setiap pawn bisa mencapai HOME; tambal kartu "1" bila perlu
        const stepSet = () => [...new Set(deck.flatMap((c) => c.t === "n" ? [c.v] : c.t === "split" ? [1, 2, 3] : []))];
        let guard = 0;
        while (guard++ < 8) {
            const steps = stepSet();
            if (starts.every((arr) => arr.every((p) => reachable(p, steps)))) break;
            deck.push({ t: "n", v: 1 });
        }
        const first = rnd() < 0.5 ? 0 : 1; // giliran pertama acak (coin flip)
        const label = "#" + (seed >>> 0).toString(36).toUpperCase().padStart(4, "0").slice(-4);
        return { seed, scenario, starts, deck, first, label, deckSize: deck.length };
    }
    const newSeed = () => (Math.random() * 0x7fffffff) | 0;

    /* ---------------- identitas pemain ---------------- */
    const mySeat = () => {
        if (!state) return 0;
        if (!online) return 0;
        return room.isHost ? state.seats.host : state.seats.guest;
    };
    const nameOf = (seat) => seat === mySeat() ? youName : (online ? "Opponent" : "Blue");

    /* ---------------- alur giliran (mutator state, host-only) ---------------- */
    function startGame(seed) {
        clearLogic(); cancelHops(); lastMoveId = 0;
        const level = genLevel(seed);
        const hostSeat = online ? (Math.random() < 0.5 ? 0 : 1) : 0; // kursi multiplayer diacak
        state = {
            seq: 0, level,
            pawns: [level.starts[0].slice(), level.starts[1].slice()],
            turn: level.first, phase: "draw", pick: null,
            card: null, cardBy: null,
            legs: [2, 2], legIdx: 0, afterAnim: null,
            moves: null, moveId: 0,
            cards: [0, 0], kills: [0, 0], swaps: [0, 0],
            winner: null,
            seats: { host: hostSeat, guest: 1 - hostSeat },
            forcedCard: null, extraTurn: false, cheated: false,
            msg: "Coin flip — " + COLOR_NAME[level.first] + " jalan duluan.",
        };
        ui.cheats = false;
        publish();
    }

    function doDraw(seat) {
        let c;
        if (!online && seat === 0 && state.forcedCard) { c = state.forcedCard; state.forcedCard = null; }
        else c = state.level.deck[Math.floor(Math.random() * state.level.deck.length)];
        state.cards[seat]++;
        state.card = { ...c }; state.cardBy = seat;
        state.phase = "reveal"; state.pick = null; state.moves = null;
        state.msg = COLOR_NAME[seat] + " drew " + cardName(c) + ".";
        publish();
    }
    function discard(reason) {
        state.phase = "discard"; state.pick = null;
        state.msg = reason + " — kartu dibuang.";
        publish();
    }
    function doPlay() {
        const c = state.card, seat = state.cardBy;
        if (c.t === "n") {
            state.phase = "choose"; state.pick = { kind: "n", v: c.v };
            state.msg = COLOR_NAME[seat] + ": pilih pawn untuk maju " + c.v + ".";
        } else if (c.t === "swipe") {
            if (hasLoopPawns(seat) && hasLoopPawns(1 - seat)) {
                state.phase = "choose"; state.pick = { kind: "swipe" };
                state.msg = "Swipe — pilih pawn kamu untuk ditukar dengan lawan terdekat.";
            } else return discard("Swipe butuh pawn kedua pihak di track");
        } else if (c.t === "sorry") {
            if (state.pawns[1 - seat].some((p) => p >= 0 && p <= 41)) {
                state.phase = "choose"; state.pick = { kind: "sorry" };
                state.msg = "Sorry — pilih pawn lawan untuk dipulangkan ke pen.";
            } else return discard("Sorry butuh pawn lawan di papan");
        } else {
            state.phase = "splitpick";
            state.msg = "Split 4 — pilih 1+3 atau 2+2.";
        }
        publish();
    }
    function setLegs(mode) {
        state.legs = mode === "1+3" ? [1, 3] : mode === "3+1" ? [3, 1] : [2, 2];
        state.legIdx = 0; state.phase = "leg";
        state.msg = "Split — pilih pawn pertama (maju " + state.legs[0] + ").";
        publish();
    }
    function commitMove(seat, pi, path, after, msg) {
        state.pawns[seat][pi] = path[path.length - 1];
        state.moves = { id: ++state.moveId, list: [{ pl: seat, pi, path }] };
        state.afterAnim = after; state.phase = "anim"; state.pick = null; state.msg = msg;
        publish();
    }
    function performSwap(seat, pi, j) {
        const op = 1 - seat;
        const myAbs = (START[seat] + state.pawns[seat][pi]) % 40;
        const oAbs = (START[op] + state.pawns[op][j]) % 40;
        const a = (oAbs - START[seat] + 40) % 40;
        const b = (myAbs - START[op] + 40) % 40;
        state.pawns[seat][pi] = a; state.pawns[op][j] = b;
        state.swaps[seat]++;
        state.moves = { id: ++state.moveId, list: [{ pl: seat, pi, path: [a] }, { pl: op, pi: j, path: [b] }] };
        state.afterAnim = "end"; state.phase = "anim"; state.pick = null;
        state.msg = "Swipe — " + COLOR_NAME[seat] + " bertukar posisi dengan " + COLOR_NAME[op] + ".";
        publish();
    }
    function performKill(seat, j) {
        const op = 1 - seat;
        state.pawns[op][j] = -1; state.kills[seat]++;
        state.moves = { id: ++state.moveId, list: [{ pl: op, pi: j, path: [-1] }] };
        state.afterAnim = "end"; state.phase = "anim"; state.pick = null;
        state.msg = "Sorry — pawn " + COLOR_NAME[op] + " kembali ke pen.";
        publish();
    }
    function handlePick(seat, pl, pi) {
        if (!(pi >= 0 && pi <= 2)) return;
        if (state.phase === "choose" && state.pick) {
            const kind = state.pick.kind;
            if (kind === "sorry") {
                if (pl !== 1 - seat) return;
                const p = state.pawns[pl][pi];
                if (p >= 0 && p <= 41) performKill(seat, pi);
                return;
            }
            if (pl !== seat) return;
            const p = state.pawns[seat][pi];
            if (kind === "n") {
                if (p === 42) return;
                commitMove(seat, pi, movePath(p, state.pick.v), "end", COLOR_NAME[seat] + " maju " + state.pick.v + ".");
            } else if (kind === "swipe") {
                if (p < 0 || p > 39) return;
                const myAbs = (START[seat] + p) % 40;
                let bj = -1, bd = 99;
                for (let j = 0; j < 3; j++) {
                    const o = state.pawns[1 - seat][j];
                    if (o >= 0 && o <= 39) {
                        const oa = (START[1 - seat] + o) % 40;
                        const d = Math.min((myAbs - oa + 40) % 40, (oa - myAbs + 40) % 40);
                        if (d < bd) { bd = d; bj = j; }
                    }
                }
                if (bj >= 0) performSwap(seat, pi, bj);
            }
        } else if (state.phase === "leg") {
            if (pl !== seat || state.pawns[seat][pi] === 42) return;
            const amt = state.legs[state.legIdx];
            state.legIdx++;
            commitMove(seat, pi, movePath(state.pawns[seat][pi], amt), state.legIdx < 2 ? "leg" : "end",
                COLOR_NAME[seat] + " split: maju " + amt + ".");
        }
    }
    function endAnim() {
        const mover = state.turn;
        if (isWin(mover)) return gameOver(mover);
        if (state.afterAnim === "leg") {
            state.phase = "leg";
            state.msg = "Split — pilih pawn berikutnya (maju " + state.legs[state.legIdx] + ").";
            publish();
        } else endTurn();
    }
    function endTurn() {
        if (state.extraTurn && state.turn === 0) {
            state.extraTurn = false;
            state.msg = "Cheat — giliran ekstra untuk kamu!";
        } else {
            state.turn = 1 - state.turn;
            state.msg = "Giliran " + COLOR_NAME[state.turn] + " — draw kartu.";
        }
        state.phase = "draw"; state.card = null; state.cardBy = null;
        state.pick = null; state.moves = null; state.afterAnim = null;
        publish();
    }
    function gameOver(pl) {
        state.phase = "over"; state.winner = pl; state.pick = null;
        state.msg = COLOR_NAME[pl] + " menang!";
        publish();
    }

    /* ---------------- AI (mode ai, bot = seat 1) ---------------- */
    function aiBest(arr, n) {
        let best = null;
        for (let pi = 0; pi < 3; pi++) {
            const pos = arr[pi];
            if (pos === 42) continue;
            const path = movePath(pos, n);
            const fin = path[path.length - 1];
            let sc = pos === -1 ? 8 : fin - pos;
            if (fin === 42) sc += 60;
            if (pos > -1 && pos < 40 && fin >= 40) sc += 15;
            if (pos >= 40) sc += 5;
            sc += Math.random() * 3;
            if (!best || sc > best.sc) best = { pi, path, fin, sc };
        }
        return best;
    }
    function aiSwipe() {
        let best = null;
        for (let pi = 0; pi < 3; pi++) {
            const p = state.pawns[1][pi];
            if (p < 0 || p > 39) continue;
            for (let j = 0; j < 3; j++) {
                const o = state.pawns[0][j];
                if (o < 0 || o > 39) continue;
                const gain = ((o - 20 + 40) % 40) - p;
                if (!best || gain > best.gain) best = { pi, j, gain };
            }
        }
        return best && best.gain > 1 ? best : null;
    }
    function aiSplitMode() {
        let bestMode = [2, 2], bestSc = -1e9;
        [[1, 3], [3, 1], [2, 2]].forEach((mode) => {
            const st = state.pawns[1].slice();
            let sc = 0, ok = true;
            mode.forEach((amt) => {
                const r = aiBest(st, amt);
                if (!r) { ok = false; return; }
                sc += r.sc; st[r.pi] = r.fin;
            });
            if (ok && sc > bestSc) { bestSc = sc; bestMode = mode; }
        });
        return bestMode;
    }
    function aiChoose() {
        const kind = state.pick?.kind;
        if (kind === "n") {
            const r = aiBest(state.pawns[1], state.pick.v);
            if (r) handlePick(1, 1, r.pi); else endTurn();
        } else if (kind === "swipe") {
            const r = aiSwipe();
            if (r) performSwap(1, r.pi, r.j); else discard("Blue: tidak ada swap menguntungkan");
        } else if (kind === "sorry") {
            let bj = -1, bp = -1;
            for (let j = 0; j < 3; j++) {
                const p = state.pawns[0][j];
                if (p >= 0 && p <= 41 && p > bp) { bp = p; bj = j; }
            }
            if (bj >= 0) performKill(1, bj); else discard("Blue: tidak ada target");
        }
    }
    function aiSplitPick() { setLegs(aiSplitMode().join("+")); }
    function aiLegPick() {
        const r = aiBest(state.pawns[1], state.legs[state.legIdx]);
        if (r) handlePick(1, 1, r.pi); else endTurn();
    }

    /* ---------------- cheat (mode AI saja) ---------------- */
    function doCheat(op) {
        if (!state || state.phase === "over") return;
        state.cheated = true;
        cancelHops();
        if (op.startsWith("next-")) {
            const k = op.slice(5);
            state.forcedCard = k === "swipe" ? { t: "swipe" } : k === "sorry" ? { t: "sorry" } : k === "split" ? { t: "split" } : { t: "n", v: +k };
            state.msg = "Cheat — kartu berikutnya: " + cardName(state.forcedCard) + ".";
            return publish();
        }
        if (op.startsWith("home-")) {
            const i = +op.slice(5);
            state.pawns[0][i] = 42;
            state.moves = { id: ++state.moveId, list: [{ pl: 0, pi: i, path: [42] }] };
            if (isWin(0)) return gameOver(0);
            state.msg = "Cheat — pawn " + (i + 1) + " langsung Home.";
            return publish();
        }
        if (op === "resetfoe") {
            state.pawns[1] = [-1, -1, -1];
            state.moves = { id: ++state.moveId, list: [0, 1, 2].map((j) => ({ pl: 1, pi: j, path: [-1] })) };
            if (state.phase === "choose" && state.pick?.kind === "sorry") return discard("Tidak ada pawn Blue tersisa");
            state.msg = "Cheat — semua pawn Blue kembali ke pen.";
            return publish();
        }
        if (op === "skipfoe") {
            if (state.turn !== 1 || state.phase === "anim") return;
            state.msg = "Cheat — giliran Blue dilewati.";
            return endTurn();
        }
        if (op === "win") { state.pawns[0] = [42, 42, 42]; return gameOver(0); }
    }

    /* ---------------- aksi & validasi (host kanonik) ---------------- */
    function applyAction(action, slot) {
        if (!state || !action) return;
        // slot: 0 = host / lokal, 1 = guest. Petakan ke kursi logis (Red/Blue).
        const seat = online ? (slot === 0 ? state.seats.host : state.seats.guest) : 0;
        switch (action.type) {
            case "restart":
                if (online && slot !== 0) return; // hanya host yang boleh restart
                startGame(action.newLevel ? newSeed() : state.level.seed);
                return;
            case "cheat":
                if (online) return;
                doCheat(String(action.op || ""));
                return;
            case "draw":
                if (state.phase !== "draw" || state.turn !== seat) return;
                doDraw(seat); return;
            case "play":
                if (state.phase !== "reveal" || state.cardBy !== seat) return;
                doPlay(); return;
            case "split":
                if (state.phase !== "splitpick" || state.turn !== seat) return;
                if (action.mode === "1+3" || action.mode === "2+2") setLegs(action.mode);
                return;
            case "pick":
                if (state.turn !== seat) return;
                handlePick(seat, action.pl | 0, action.pi | 0);
                return;
        }
    }
    function submitAction(action) {
        if (online && !room.isHost) { room.sendAction(action).catch(console.warn); return; }
        applyAction(action, 0);
    }
    function publish() {
        state.seq++;
        render();
        if (online && room.isHost) room.publishState(state).catch(console.warn);
        if (isHost) drive();
    }
    // Penjadwal fase: bot berpikir, fallback modal, animasi, discard. Hanya host.
    function drive() {
        clearLogic();
        if (!state || state.phase === "over") return;
        const bot = !online && state.turn === 1;
        const ph = state.phase;
        if (ph === "anim") {
            const len = Math.max(...state.moves.list.map((m) => m.path.length), 1);
            schedule(endAnim, 170 * len + 320);
        } else if (ph === "discard") schedule(endTurn, 1100);
        else if (ph === "reveal") schedule(doPlay, state.cardBy === 1 && bot ? 1300 : 6000);
        else if (bot) {
            if (ph === "draw") schedule(() => doDraw(1), 900);
            else if (ph === "choose") schedule(aiChoose, 850);
            else if (ph === "splitpick") schedule(aiSplitPick, 750);
            else if (ph === "leg") schedule(aiLegPick, 750);
        }
    }

    /* ---------------- render (murni dari state) ---------------- */
    function highlightSet() {
        const set = {};
        if (!state || state.turn !== mySeat()) return set;
        const me = mySeat(), foe = 1 - me;
        const add = (pl, i, cls) => { set[pl + "-" + i] = cls; };
        if (state.phase === "choose" && state.pick) {
            const k = state.pick.kind;
            for (let i = 0; i < 3; i++) {
                const p = state.pawns[me][i];
                if (k === "n" && p !== 42) add(me, i, "movable");
                if (k === "swipe" && p >= 0 && p <= 39) add(me, i, "movable");
                if (k === "sorry") {
                    const o = state.pawns[foe][i];
                    if (o >= 0 && o <= 41) add(foe, i, "target");
                }
            }
        } else if (state.phase === "leg") {
            for (let i = 0; i < 3; i++) if (state.pawns[me][i] !== 42) add(me, i, "movable");
        }
        return set;
    }
    function render() {
        const blocked = ui.help || ui.cheats || ui.paused;
        ov.wait.hidden = !online || Boolean(state) || blocked;
        ov.help.hidden = !ui.help;
        ov.cheats.hidden = !ui.cheats || online || ui.help;
        ov.pause.hidden = !ui.paused || ui.help || ui.cheats;
        if (pbtn) {
            const label = pbtn.querySelector(".s-btn-label");
            if (label) label.textContent = ui.paused ? "Resume" : "Pause";
            pbtn.setAttribute("aria-label", ui.paused ? "Resume" : "Pause");
            pbtn.disabled = !state || (online && !isHost);
        }
        el.cheatBtn.disabled = online;
        el.cheatBtn.title = online ? "Cheat dinonaktifkan di multiplayer" : "Buka cheat overlay (C)";
        if (!state) {
            ov.card.hidden = true;
            ov.over.hidden = true;
            statusEl.textContent = online ? "Menunggu host…" : "Ready";
            return;
        }
        const me = mySeat(), foe = 1 - me, mine = state.turn === me;
        const sorryMode = state.phase === "choose" && state.pick?.kind === "sorry";

        // animasi hop baru?
        if (state.moves && state.moves.id !== lastMoveId) {
            lastMoveId = state.moves.id;
            state.moves.list.forEach((m) => { if (m.path.length > 1) startHop(m.pl, m.pi, m.path); });
        }
        paintPawns();
        const hi = highlightSet();
        pawnEls.forEach((g, id) => {
            const cls = hi[Math.floor(id / 3) + "-" + (id % 3)];
            g.classList.toggle("movable", cls === "movable");
            g.classList.toggle("target", cls === "target");
        });

        // HUD
        el.turn.textContent = nameOf(state.turn) + " · " + COLOR_NAME[state.turn];
        el.turndot.style.background = COLS[state.turn];
        el.seat.textContent = COLOR_NAME[me];
        el.seat.style.color = DARK[me];
        el.h0.textContent = countHome(me) + "/3";
        el.h1.textContent = countHome(foe) + "/3";
        el.cards.textContent = state.cards[0] + state.cards[1];
        el.level.textContent = state.level.label + " · " + state.level.scenario;
        el.msg.textContent = state.msg;
        const lvS = svg.querySelector('[data-el="lvScenario"]');
        const lvN = svg.querySelector('[data-el="lvSeed"]');
        if (lvS) lvS.textContent = "Level " + state.level.label + " · " + state.level.scenario;
        if (lvN) lvN.textContent = "deck " + state.level.deckSize + " cards · solvable ✓";
        statusEl.textContent = online
            ? (room.isHost ? "Room · host · " : "Room · guest · ") + "You are " + COLOR_NAME[me]
            : "Solo vs AI · You are " + COLOR_NAME[me];

        // deck & kartu mini
        deckEl.classList.toggle("hot", state.phase === "draw" && mine);
        if (state.card) miniCard(state.card, COLOR_NAME[state.cardBy] + " drew");
        else cardPlaceholder();

        // tombol split HANYA saat dibutuhkan (fase splitpick & giliran saya)
        const showSplit = state.phase === "splitpick" && mine;
        splitBox.hidden = !showSplit;
        padSplit.hidden = !showSplit;
        padSplit.classList.toggle("on", showSplit);

        // virtual pad
        el.padDraw.disabled = !(state.phase === "draw" && mine);
        for (let i = 0; i < 3; i++) {
            const b = el["pad" + i];
            b.textContent = (sorryMode ? COLOR_NAME[foe] + " " : "Pawn ") + (i + 1);
            let ok = false;
            if (mine) {
                const pl = sorryMode ? foe : me;
                const p = state.pawns[pl][i];
                if (state.phase === "choose" && state.pick) {
                    const k = state.pick.kind;
                    ok = k === "n" ? p !== 42 : k === "swipe" ? p >= 0 && p <= 39 : p >= 0 && p <= 41;
                } else if (state.phase === "leg") ok = state.pawns[me][i] !== 42;
            }
            b.disabled = !ok;
        }

        // modal draw card
        const reveal = state.phase === "reveal" && state.card;
        ov.card.hidden = !reveal || blocked;
        if (reveal) {
            const c = state.card;
            el.cardIcon.innerHTML = cardIcon(c);
            el.cardIcon.style.background = c.t === "swipe" ? "#fef3c7" : c.t === "sorry" ? "#fee2e2" : c.t === "split" ? "#ccfbf1" : "#eef2ff";
            el.cardIcon.style.color = c.t === "swipe" ? "#b45309" : c.t === "sorry" ? "#b91c1c" : c.t === "split" ? "#0f766e" : "#4f46e5";
            el.cardTitle.textContent = state.cardBy === me ? "You drew" : nameOf(state.cardBy) + " drew";
            el.cardName.textContent = cardName(c);
            el.cardHint.textContent = cardHint(c);
            const iAmDrawer = state.cardBy === me;
            el.cardBtn.hidden = !iAmDrawer;
            el.cardWait.hidden = iAmDrawer;
        }

        // overlay menang / kalah
        const over = state.phase === "over";
        ov.over.hidden = !over || blocked;
        if (over) {
            const win = state.winner === me;
            el.ovTitle.textContent = win ? "You win!" : nameOf(state.winner) + " wins!";
            el.ovTitle.className = win ? "s-win" : "s-lose";
            el.ovSub.textContent = "Level " + state.level.label + " (" + state.level.scenario + "). " +
                "Kartu: " + COLOR_NAME[me] + " " + state.cards[me] + " – " + COLOR_NAME[foe] + " " + state.cards[foe] +
                ". Kills " + state.kills[me] + "–" + state.kills[foe] +
                ". Swaps " + state.swaps[me] + "–" + state.swaps[foe] +
                (state.cheated ? " · (cheats used)" : "");
            const guestLocked = online && !room.isHost;
            el.ovRestart.disabled = guestLocked;
            el.ovNew.disabled = guestLocked;
            el.ovWait.hidden = !guestLocked;
        }
    }

    /* ---------------- input: mouse / touch (delegasi) ---------------- */
    const currentPickPl = () => {
        const sorry = state?.phase === "choose" && state.pick?.kind === "sorry";
        return sorry ? 1 - mySeat() : mySeat();
    };
    /* ---------------- overlay toggle: help > cheats > pause ---------------- */
    function toggleHelp(on) {
        ui.help = typeof on === "boolean" ? on : !ui.help;
        if (ui.help) ui.cheats = false;
        render();
    }
    function toggleCheats(on) {
        if (online || ui.help) return;
        ui.cheats = typeof on === "boolean" ? on : !ui.cheats;
        if (ui.cheats) ui.help = false;
        render();
    }
    function togglePause(on) {
        if (!state || (online && !isHost)) return;
        const next = typeof on === "boolean" ? on : !ui.paused;
        if (next === ui.paused) return;
        if (next) pauseTimers(); else resumeTimers();
        ui.paused = next;
        render();
    }
    function restartGame(newLevel) {
        ui.help = ui.cheats = ui.paused = false;
        clearAllTimers();
        submitAction({ type: "restart", newLevel: Boolean(newLevel) });
    }

    function handleClick(e) {
        const t = e.target;
        if (t.closest("[data-help]")) return toggleHelp();
        if (t.closest("[data-help-close]")) return toggleHelp(false);
        if (t.closest("[data-exit]")) { onExit(); return; }
        if (t.closest("[data-cheats]")) return toggleCheats();
        if (t.closest("[data-close-cheats]")) return toggleCheats(false);
        if (t.closest("[data-pause]") || t.closest("[data-resume]")) return togglePause();
        if (t.closest("[data-restart]")) return restartGame(false);
        if (t.closest("[data-newlevel]")) return restartGame(true);
        if (ui.help || ui.cheats || ui.paused) return;
        const act = t.closest("[data-act]");
        if (act) {
            const a = act.dataset.act;
            if (a === "draw") return submitAction({ type: "draw" });
            if (a === "play") return submitAction({ type: "play" });
            if (a === "restart") return restartGame(false);
            if (a === "newlevel") return restartGame(true);
        }
        const sp = t.closest("[data-split]");
        if (sp) return submitAction({ type: "split", mode: sp.dataset.split });
        const pad = t.closest("[data-pad]");
        if (pad) {
            const v = pad.dataset.pad;
            if (v === "draw") return submitAction({ type: "draw" });
            return submitAction({ type: "pick", pl: currentPickPl(), pi: +v });
        }
        const ch = t.closest("[data-cheat]");
        if (ch) { if (!online) submitAction({ type: "cheat", op: ch.dataset.cheat }); return; }
        const pawn = t.closest(".sorry-pawn");
        if (pawn) return submitAction({ type: "pick", pl: +pawn.dataset.p, pi: +pawn.dataset.i });
    }

    /* ---------------- input: keyboard (desktop) ---------------- */
    function routePrimary() {
        if (!state) return;
        if (state.phase === "draw" && state.turn === mySeat()) submitAction({ type: "draw" });
        else if (state.phase === "reveal" && state.cardBy === mySeat()) submitAction({ type: "play" });
        else if (state.phase === "over") submitAction({ type: "restart" });
    }
    function onKey(e) {
        if (!root.isConnected) return;
        if (e.ctrlKey || e.metaKey || e.altKey) return;
        const c = e.code;
        if (c === "KeyH") { toggleHelp(); e.preventDefault(); return; }
        if (c === "KeyC") { toggleCheats(); e.preventDefault(); return; }
        if (c === "KeyP" || c === "Escape") {
            if (ui.help) toggleHelp(false);
            else if (ui.cheats) toggleCheats(false);
            else if (c === "KeyP") togglePause();
            else if (ui.paused) togglePause(false);
            e.preventDefault(); return;
        }
        if (ui.help || ui.cheats || ui.paused || !state) return;
        if (c === "KeyR") { e.preventDefault(); return restartGame(false); }
        if (c === "KeyN") { e.preventDefault(); return restartGame(true); }
        if (c === "Space") { e.preventDefault(); return routePrimary(); }
        if (c === "Enter" && (e.target === document.body || e.target === deckEl)) { e.preventDefault(); return routePrimary(); }
        if (state.phase === "reveal" || state.phase === "over") return;
        const k = e.key;
        if (k >= "1" && k <= "3") return submitAction({ type: "pick", pl: currentPickPl(), pi: +k - 1 });
        if (state.phase === "splitpick") {
            if (c === "KeyZ") return submitAction({ type: "split", mode: "1+3" });
            if (c === "KeyX") return submitAction({ type: "split", mode: "2+2" });
        }
    }

    /* ---------------- lifecycle ---------------- */
    drawBoard();
    buildPawns();
    root.addEventListener("click", handleClick);
    document.addEventListener("keydown", onKey);

    const subs = [];
    const keep = (u) => { if (typeof u === "function") subs.push(u); };
    if (online) {
        keep(room.onRoom?.((nextRoom) => { roomData = nextRoom; render(); }));
        if (room.isHost) {
            keep(room.onAction?.((action) => applyAction(action, 1)));
            startGame(newSeed()); // host: acak kursi + giliran pertama, lalu publish
        } else {
            keep(room.onState?.((nextState) => { state = nextState; render(); }));
            render(); // tampilkan "menunggu host"
        }
    } else {
        startGame(newSeed()); // mode AI: giliran pertama acak (coin flip)
    }

    return {
        destroy() {
            clearAllTimers();
            cancelHops();
            root.removeEventListener("click", handleClick);
            document.removeEventListener("keydown", onKey);
            subs.forEach((u) => { try { u(); } catch (_) { } });
        },
    };
}