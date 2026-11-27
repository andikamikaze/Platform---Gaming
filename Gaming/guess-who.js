/* ==== GAME: guess-who.js ==== */

/* =============================================================== */
/* Guess Who - educational game (MGP module)                        */
/* Deduce the hidden animal from progressive clues. Wrong guesses   */
/* unlock extra clues but cost a life; solve all 6 to win.          */
/* =============================================================== */
(() => {
    "use strict";

    /* ---------- icons (classic MGP module: no ESM import available) ---------- */
    /* Paths mirror JS/icons.js so HUD buttons use the shared icon set.        */
    const ICON_PATHS = {
        helpCircle: [
            "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z",
            "M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3",
            "M12 17h.01",
        ],
        wrench: [
            "M14.7 6.3a4 4 0 0 0 5 5l-9 9a2.8 2.8 0 0 1-4-4z",
            "M6 16l-3 3",
            "M14.5 4.5 19 9",
        ],
        pause: ["M7 4h3v16H7z", "M14 4h3v16h-3z"],
        play: ["m6 3 14 9-14 9V3z"],
        refresh: [
            "M21 2v6h-6",
            "M3 12a9 9 0 0 1 15-6.7L21 8",
            "M3 22v-6h6",
            "M21 12a9 9 0 0 1-15 6.7L3 16",
        ],
        logOut: [
            "m16 17 5-5-5-5",
            "M21 12H9",
            "M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4",
        ],
        lightbulb: [
            "M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5",
            "M9 18h6",
            "M10 22h4",
        ],
        eye: [
            "M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0",
            "M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z",
        ],
        x: ["M18 6 6 18", "M6 6l12 12"],
    };
    function iconSVG(name, options = {}) {
        const size = options.size == null ? "" : ` width="${options.size}" height="${options.size}"`;
        const segments = (ICON_PATHS[name] || []).map((d) => `<path d="${d}"/>`).join("");
        return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"' + size + ' aria-hidden="true" focusable="false">' + segments + "</svg>";
    }

    /* ---------- clue bank: name + 3 clues (easy -> dead giveaway) ---------- */
    const DECK = [
        {
            name: "Elephant",
            clues: [
                "I am the largest animal on land.",
                "I drink with my long trunk.",
                "My big ears flap to keep me cool.",
            ],
        },
        {
            name: "Penguin",
            clues: [
                "I am a bird, but I cannot fly.",
                "My feathers look like a black-and-white tuxedo.",
                "I waddle across the ice of Antarctica.",
            ],
        },
        {
            name: "Giraffe",
            clues: [
                "I am the tallest animal in the world.",
                "My neck is long but has only 7 bones.",
                "I snack on leaves at the top of trees.",
            ],
        },
        {
            name: "Dolphin",
            clues: [
                "I live in the sea, yet I am not a fish.",
                "I am playful and love to surf the waves.",
                "I breathe air through a blowhole on my head.",
            ],
        },
        {
            name: "Bat",
            clues: [
                "I am the only mammal that can truly fly.",
                "I sleep hanging upside down.",
                "I find my way in the dark using echoes.",
            ],
        },
        {
            name: "Kangaroo",
            clues: [
                "I carry my baby in a pouch.",
                "I move by hopping, not walking.",
                "I come from Australia.",
            ],
        },
        {
            name: "Octopus",
            clues: [
                "I have eight arms and no bones.",
                "When scared, I shoot a cloud of ink.",
                "I can change color to hide.",
            ],
        },
        {
            name: "Cheetah",
            clues: [
                "I am the fastest runner on land.",
                "My golden coat is covered in spots.",
                "I sprint across the African savanna.",
            ],
        },
        {
            name: "Owl",
            clues: [
                "I hunt when the sun goes down.",
                "My head turns almost all the way around.",
                "My silent wings swoop on mice at night.",
            ],
        },
        {
            name: "Camel",
            clues: [
                "I store fat in my hump, not water.",
                "I can close my nostrils in a sandstorm.",
                "I am called the ship of the desert.",
            ],
        },
    ];
    const ROUNDS = 6,
        LIVES = 3;

    function shuffleFn(a) {
        const arr = a.slice();
        for (let i = arr.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [arr[i], arr[j]] = [arr[j], arr[i]];
        }
        return arr;
    }
    function pickRound(i, deck) {
        const target = deck[i];
        const others = shuffleFn(DECK.filter((d) => d.name !== target.name))
            .slice(0, 3)
            .map((d) => d.name);
        return {
            target: target,
            options: shuffleFn([target.name].concat(others)),
        };
    }
    const TEST = { ROUNDS, LIVES, DECK, pickRound, shuffleFn };

    MGP_REGISTER({
        id: "guess-who",
        name: "Guess Who",
        category: "educational",
        catLabel: "Educational",
        desc: "Read the clues and name the hidden animal - 3 lives only.",
        art: '<svg viewBox="0 0 48 48" width="54" height="54" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="24" cy="24" r="16"/><path d="M24 17v9l6 4"/><path d="M24 34v6M24 8V4M38 24h5M5 24h5M34 14l3-3M11 34l-3 3M37 34l3 3M11 14l-3-3"/></svg>',
        bg: ["#ddd6fe", "#8b5cf6"],
        _test: TEST,

        build(app) {
            const $ = (s) => app.querySelector(s);

            app.innerHTML = `
<style>
#guess-who-app [hidden]{display:none!important}
#guess-who-app button:focus-visible{outline:2px solid #818cf8;outline-offset:2px}
#guess-who-app .gw-app{display:flex;flex:1 1 auto;flex-direction:column;gap:10px;width:100%;height:100%;min-height:0}
/* ---- HUD bar ---- */
#guess-who-app .gw-hud{display:flex;align-items:center;flex-wrap:wrap;gap:7px;padding:8px 10px;border:1px solid #ffffff14;border-radius:12px;background:#111a33;font:600 11px/1.2 "DM Sans",system-ui,sans-serif}
#guess-who-app .gw-chip{display:inline-flex;align-items:center;gap:5px;padding:5px 9px;border-radius:999px;background:#ffffff10;color:#c3cde2;font-size:11px;font-variant-numeric:tabular-nums;white-space:nowrap;letter-spacing:.03em}
#guess-who-app .gw-chip b{color:#fff;font-weight:800}
#guess-who-app .gw-status{color:#a5b4fc}
#guess-who-app .gw-spacer{flex:1 1 auto}
#guess-who-app .gw-btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;border:1px solid #ffffff24;border-radius:8px;background:#182148;color:#dbe1ea;padding:6px 9px;font:700 11px/1 "DM Sans",system-ui,sans-serif;cursor:pointer;-webkit-tap-highlight-color:transparent;touch-action:manipulation;white-space:nowrap}
#guess-who-app .gw-btn:hover:not(:disabled){border-color:#818cf8;color:#fff;background:#232e58}
#guess-who-app .gw-btn:disabled{opacity:.42;cursor:default}
#guess-who-app .gw-icon-btn svg{flex:none;display:block}
#guess-who-app .gw-btn.primary{background:#4f46e5;border-color:#6366f1;color:#fff}
#guess-who-app .gw-btn.primary:hover:not(:disabled){background:#6366f1}
/* ---- board ---- */
#guess-who-app .gw-app.game-fill>.gw-board{flex:1 1 auto;min-height:0;aspect-ratio:auto}
#guess-who-app .gw-board{position:relative;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;border:1px solid #ffffff14;border-radius:12px;background:#0d142b;padding:14px;min-height:0;overflow:hidden}
#guess-who-app .gw-wrap{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;width:100%;max-width:540px;min-width:0;min-height:0;margin:auto}
#guess-who-app .gw-card{width:120px;height:120px;border-radius:14px;background:#182148;border:1px solid #ffffff24;display:flex;align-items:center;justify-content:center;position:relative;overflow:hidden;flex:none}
#guess-who-app .gw-card svg{width:64px;height:64px;color:#818cf8}
#guess-who-app .gw-card.solved{background:#14532d;border-color:#34d399}
#guess-who-app .gw-card.solved svg{color:#34d399}
#guess-who-app .gw-clues{display:flex;flex-direction:column;gap:8px;width:100%;max-width:460px;min-height:96px}
#guess-who-app .gw-clue{background:#151d38;border:1px solid #ffffff1a;border-radius:10px;padding:10px 12px;color:#dbe1ea;font-size:14.5px;line-height:1.45;display:flex;gap:10px;align-items:flex-start;animation:gw-in .18s ease-out}
#guess-who-app .gw-clue .gw-n{flex:0 0 22px;height:22px;border-radius:999px;background:#4f46e5;color:#fff;font-size:12px;font-weight:800;display:grid;place-items:center;margin-top:1px}
#guess-who-app .gw-clue.new{border-color:#818cf8}
@keyframes gw-in{from{opacity:0;transform:translateY(-4px)}to{opacity:1;transform:none}}
#guess-who-app .gw-opts{display:grid;grid-template-columns:repeat(2,minmax(0,180px));gap:8px;justify-content:center;width:100%}
#guess-who-app .gw-opt{border:1px solid #ffffff24;border-radius:10px;background:#182148;color:#e5e7eb;font-size:16.5px;font-weight:700;min-height:56px;padding:12px 10px;transition:border-color .16s,background .16s;-webkit-tap-highlight-color:transparent;touch-action:manipulation}
#guess-who-app .gw-opt:not(:disabled):hover{border-color:#6366f1}
#guess-who-app .gw-opt:focus-visible{outline:2px solid #818cf8;outline-offset:2px}
#guess-who-app .gw-opt.good{background:#14532d;border-color:#34d399}
#guess-who-app .gw-opt.bad{background:#7f1d1d;border-color:#f87171}
#guess-who-app .gw-opt:disabled{cursor:default;opacity:.9}
#guess-who-app .gw-feedback{min-height:24px;font-weight:800;font-size:14px;text-align:center;line-height:1.4}
#guess-who-app .gw-feedback.good{color:#34d399}
#guess-who-app .gw-feedback.bad{color:#f87171}
/* ---- overlays ---- */
#guess-who-app .gw-ov{position:absolute;inset:0;z-index:3;display:grid;place-items:center;padding:14px;background:rgba(11,16,32,.9);backdrop-filter:blur(3px)}
#guess-who-app .gw-ovcard{width:min(460px,100%);max-height:100%;display:flex;flex-direction:column;gap:10px;overflow:hidden;border:1px solid #ffffff1f;border-radius:14px;background:#111a33;padding:18px;box-shadow:0 16px 40px #0006}
#guess-who-app .gw-ovcard.center{text-align:center}
#guess-who-app .gw-ovhead{flex:none;display:flex;align-items:center;justify-content:space-between;gap:10px;color:#fff;font-size:14px;font-weight:800}
#guess-who-app .gw-ovtitle{margin:0;color:#fff;font-family:Manrope,sans-serif;font-size:1.35rem;font-weight:800}
#guess-who-app .gw-ovtitle.mgp-win{color:#34d399}
#guess-who-app .gw-ovtitle.mgp-lose{color:#fb7185}
#guess-who-app .gw-ovsub{margin:0;color:#94a3b8;font-size:.86rem;line-height:1.55}
#guess-who-app .gw-help,#guess-who-app .gw-cheats{flex:1 1 auto;min-height:0;overflow:auto;color:#c3cde2;font-size:12.5px;line-height:1.5}
#guess-who-app .gw-help b{display:block;margin:8px 0 4px;color:#a5b4fc}
#guess-who-app .gw-help ul{margin:0;padding-left:18px}
#guess-who-app .gw-help li{margin:3px 0}
#guess-who-app .gw-kbd{display:inline-block;min-width:18px;padding:1px 5px;border:1px solid #ffffff2b;border-radius:4px;background:#ffffff12;color:#fff;font-size:11px;text-align:center}
#guess-who-app .gw-cheats{display:flex;flex-direction:column;gap:8px}
#guess-who-app .gw-cheat{display:flex;align-items:center;justify-content:space-between;gap:10px;min-height:42px;border:1px solid #ffffff22;border-radius:9px;background:#182148;color:#dfe3ee;padding:8px 12px;font-size:12.5px;font-weight:600;text-align:left;cursor:pointer}
#guess-who-app .gw-cheat:hover:not(:disabled){border-color:#818cf8;color:#fff}
#guess-who-app .gw-cheat:disabled{opacity:.4;cursor:default}
#guess-who-app .gw-cheat em{font-style:normal;font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:#5b6478}
#guess-who-app .gw-foot{flex:none;display:flex;align-items:center;justify-content:space-between;gap:10px;padding-top:10px;border-top:1px solid #ffffff1a}
#guess-who-app .gw-ovcard.center .gw-foot{justify-content:center}
#guess-who-app .gw-note{color:#8b93a7;font-size:10px}
@media (prefers-reduced-motion:reduce){#guess-who-app *{animation-duration:.01ms!important;animation-delay:0s!important;transition-duration:.01ms!important}}
/* ---- layout overrides (keep last: beat pointer:coarse + design polish) ---- */
@media (max-width:640px){
#guess-who-app{min-height:0}
#guess-who-app .gw-app{height:auto}
#guess-who-app .gw-app.game-fill>.gw-board:not(:has(.gw-ov:not([hidden]))){flex:0 0 auto;min-height:0;aspect-ratio:auto}
#guess-who-app .gw-app.game-fill>.gw-board:has(.gw-ov:not([hidden])){flex:0 0 auto;min-height:min(70dvh,620px);aspect-ratio:auto}
#guess-who-app .gw-app .gw-hud{gap:5px}
#guess-who-app .gw-app .gw-hud .gw-chip{padding:4px 6px;font-size:9px}
#guess-who-app .gw-app .gw-hud .gw-status,
#guess-who-app .gw-app .gw-hud [data-hud="clue-chip"]{display:none}
#guess-who-app .gw-app .gw-hud .gw-btn{min-height:32px;padding:5px 9px;font-size:9px}
#guess-who-app .gw-app .gw-hud .gw-btn-label,
#guess-who-app .gw-app .gw-hud .gw-spacer{display:none}
#guess-who-app .gw-app .gw-card{width:104px;height:104px}
#guess-who-app .gw-app .gw-card svg{width:56px;height:56px}
#guess-who-app .gw-app .gw-clue{font-size:13.5px;padding:8px 12px}
#guess-who-app .gw-app .gw-opts{grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}
#guess-who-app .gw-app .gw-opt{font-size:15px;min-height:56px;padding:12px 8px}
#guess-who-app .gw-app .gw-ov{padding:8px}
#guess-who-app .gw-app .gw-ovcard{width:100%;height:100%;max-height:100%;padding:12px;border-radius:12px}
#guess-who-app .gw-app .gw-help,
#guess-who-app .gw-app .gw-cheats{scrollbar-width:none}
#guess-who-app .gw-app .gw-help::-webkit-scrollbar,
#guess-who-app .gw-app .gw-cheats::-webkit-scrollbar{display:none}
#guess-who-app .gw-app .gw-foot{position:static;margin:0;padding-top:8px}
#guess-who-app .gw-app .gw-note{display:none}
}
</style>
<div class="game-app gw-app game-fill" data-gw>
  <div class="gw-hud">
    <span class="gw-chip">SOLVED <b data-hud="solved">0/${ROUNDS}</b></span>
    <span class="gw-chip">LIVES <b data-hud="lives">${LIVES}</b></span>
    <span class="gw-chip" data-hud="clue-chip">CLUE <b data-hud="clue">1</b>/3</span>
    <span class="gw-chip gw-status" data-hud="status">Ready</span>
    <span class="gw-spacer"></span>
    <button class="gw-btn gw-icon-btn" type="button" data-more aria-label="More clues" title="Reveal the next clue (M)" disabled>${iconSVG("lightbulb", { size: 14 })}<span class="gw-btn-label">More clues</span></button>
    <button class="gw-btn gw-icon-btn" type="button" data-help aria-label="How to play" title="How to play (H)">${iconSVG("helpCircle", { size: 14 })}<span class="gw-btn-label">Help</span></button>
    <button class="gw-btn gw-icon-btn" type="button" data-cheats aria-label="Cheats" title="Cheats (C)">${iconSVG("wrench", { size: 14 })}<span class="gw-btn-label">Cheats</span></button>
    <button class="gw-btn gw-icon-btn" type="button" data-pause aria-label="Pause" title="Pause (P)"><span class="gw-ic">${iconSVG("pause", { size: 14 })}</span><span class="gw-btn-label">Pause</span></button>
    <button class="gw-btn gw-icon-btn" type="button" data-restart aria-label="Restart" title="Restart (R)">${iconSVG("refresh", { size: 14 })}<span class="gw-btn-label">Restart</span></button>
    <button class="gw-btn gw-icon-btn" type="button" data-exit aria-label="Exit game" title="Exit game">${iconSVG("logOut", { size: 14 })}<span class="gw-btn-label">Exit</span></button>
  </div>
  <section class="game-panel gw-board" data-board>
    <div class="gw-wrap">
      <div class="gw-card" data-el="card">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-4.2-4.2"/><path d="M8.5 11h5M11 8.5v5"/></svg>
      </div>
      <div class="gw-clues" data-el="clues"></div>
      <div class="gw-opts" data-el="opts"></div>
      <div class="gw-feedback" data-el="fb"></div>
    </div>
    <div class="gw-ov" data-ov="start">
      <div class="gw-ovcard center">
        <h2 class="gw-ovtitle">Guess Who</h2>
        <p class="gw-ovsub">A hidden animal leaves clues. Name it from the four options - each wrong guess (or extra clue) uses up one of your ${LIVES} lives. Solve ${ROUNDS} animals to win.</p>
        <div class="gw-foot"><button class="gw-btn" type="button" data-help>How to play</button><button class="gw-btn primary" type="button" data-act="start">Start game</button></div>
      </div>
    </div>
    <div class="gw-ov" data-ov="over" hidden>
      <div class="gw-ovcard center">
        <h2 class="gw-ovtitle" data-ov="title">Game over</h2>
        <p class="gw-ovsub" data-ov="reason"></p>
        <div class="gw-foot"><span class="gw-note">Press R to restart</span><button class="gw-btn primary" type="button" data-act="start">Play again</button></div>
      </div>
    </div>
    <div class="gw-ov" data-ov="pause" hidden>
      <div class="gw-ovcard center">
        <h2 class="gw-ovtitle">Paused</h2>
        <p class="gw-ovsub">Clues, timers and all input are frozen.</p>
        <div class="gw-foot"><span class="gw-note">Press P or Esc to resume</span><button class="gw-btn primary" type="button" data-resume>Resume</button></div>
      </div>
    </div>
    <div class="gw-ov" data-ov="cheat" hidden>
      <div class="gw-ovcard">
        <div class="gw-ovhead"><span>Cheats</span><button class="gw-btn" type="button" data-cheats-close aria-label="Close cheats">${iconSVG("x", { size: 14 })}</button></div>
        <div class="gw-cheats">
          <button class="gw-cheat" type="button" data-cheat="clue">Reveal all clues<em>round</em></button>
          <button class="gw-cheat" type="button" data-cheat="answer">Mark the right answer<em>round</em></button>
          <button class="gw-cheat" type="button" data-cheat="skip">Solve this animal<em>round</em></button>
          <button class="gw-cheat" type="button" data-cheat="life">Restore one life<em>session</em></button>
        </div>
        <div class="gw-foot"><span class="gw-note">Cheats affect this session only</span><button class="gw-btn" type="button" data-cheats-close>Close</button></div>
      </div>
    </div>
    <div class="gw-ov" data-ov="help" hidden>
      <div class="gw-ovcard">
        <div class="gw-ovhead"><span>How to play</span><button class="gw-btn" type="button" data-help-close aria-label="Close help">${iconSVG("x", { size: 14 })}</button></div>
        <div class="gw-help">
          <div>
            <b>Desktop</b>
            <ul>
              <li>Click an animal name or press <span class="gw-kbd">1</span>-<span class="gw-kbd">4</span> to guess.</li>
              <li>Press <span class="gw-kbd">M</span> or use <b>More clues</b> to reveal the next hint at the cost of one life.</li>
              <li><span class="gw-kbd">H</span> help &middot; <span class="gw-kbd">C</span> cheats &middot; <span class="gw-kbd">P</span>/<span class="gw-kbd">Esc</span> pause &middot; <span class="gw-kbd">R</span> restart &middot; <span class="gw-kbd">Space</span> start.</li>
            </ul>
            <b>Mobile</b>
            <ul>
              <li>Tap a name to guess and use the icon buttons in the HUD for clues, help, cheats and pause.</li>
            </ul>
          </div>
          <div>
            <b>Rules</b>
            <ul>
              <li>Each round shows one clue about a hidden animal and four possible names.</li>
              <li>A wrong guess or an extra clue costs one life; you have ${LIVES} lives.</li>
              <li>Solve all ${ROUNDS} animals before running out of lives to win.</li>
            </ul>
          </div>
        </div>
        <div class="gw-foot"><span class="gw-note">Press H to reopen this guide</span><button class="gw-btn primary" type="button" data-help-close>Got it</button></div>
      </div>
    </div>
  </section>
</div>`;

            /* ---------------- refs ---------------- */
            const cardEl = $('[data-el="card"]'),
                cluesEl = $('[data-el="clues"]'),
                optsEl = $('[data-el="opts"]'),
                fbEl = $('[data-el="fb"]');
            const moreBtn = $("[data-more]"),
                pauseBtn = $("[data-pause]");
            const hudSolved = $('[data-hud="solved"]'),
                hudLives = $('[data-hud="lives"]'),
                hudClue = $('[data-hud="clue"]'),
                hudStatus = $('[data-hud="status"]');
            const ov = {
                start: $('[data-ov="start"]'),
                over: $('[data-ov="over"]'),
                pause: $('[data-ov="pause"]'),
                cheat: $('[data-ov="cheat"]'),
                help: $('[data-ov="help"]'),
            };
            const ovTitle = $('[data-ov="title"]'),
                ovReason = $('[data-ov="reason"]');
            const cheatBtns = {
                clue: $('[data-cheat="clue"]'),
                answer: $('[data-cheat="answer"]'),
                skip: $('[data-cheat="skip"]'),
                life: $('[data-cheat="life"]'),
            };

            /* ---------------- state ---------------- */
            let active = false,
                started = false,
                over = false,
                paused = false,
                helpOpen = false,
                cheatOpen = false;
            let deck = [],
                roundIdx = 0,
                solved = 0,
                lives = LIVES,
                clueCount = 1,
                lock = false;
            let cur = null;

            /* first-run internal help */
            let seenHelp = true;
            try { seenHelp = localStorage.getItem("guessWhoHelpSeen") === "1"; } catch (_) { }
            if (!seenHelp) {
                helpOpen = true;
                try { localStorage.setItem("guessWhoHelpSeen", "1"); } catch (_) { /* storage blocked */ }
            }

            /* ---------------- timers (freezable) ---------------- */
            const timers = new Map();
            let timerSeq = 0;
            let freezeAt = 0, freezePerfAt = 0;
            function armTimer(rec) {
                rec.startedAt = Date.now();
                rec.handle = setTimeout(() => {
                    timers.delete(rec.id);
                    rec.handle = 0;
                    rec.fn();
                }, Math.max(0, rec.remaining));
            }
            function after(ms, fn) {
                const id = ++timerSeq;
                const rec = { id, fn, remaining: ms, startedAt: 0, handle: 0 };
                timers.set(id, rec);
                if (!frozen()) armTimer(rec);
            }
            function clearTimers() {
                for (const rec of timers.values()) if (rec.handle) clearTimeout(rec.handle);
                timers.clear();
            }
            function frozen() { return paused || helpOpen || cheatOpen; }
            function freezeTimers() {
                for (const rec of timers.values()) {
                    if (!rec.handle) continue;
                    clearTimeout(rec.handle);
                    rec.handle = 0;
                    rec.remaining = Math.max(0, rec.remaining - (Date.now() - rec.startedAt));
                }
            }
            function resumeTimers() {
                for (const rec of timers.values()) if (!rec.handle) armTimer(rec);
            }
            function syncFreeze() {
                const next = frozen();
                if (next === wasFrozen) return;
                wasFrozen = next;
                if (next) {
                    freezeAt = Date.now();
                    freezePerfAt = performance.now();
                    freezeTimers();
                } else {
                    const shift = freezeAt ? Date.now() - freezeAt : 0;
                    const perfShift = freezePerfAt ? performance.now() - freezePerfAt : 0;
                    freezeAt = 0;
                    freezePerfAt = 0;
                    void shift; void perfShift; /* engine berbasis setTimeout: anchor digeser saat resume */
                    resumeTimers();
                }
            }
            let wasFrozen = frozen();

            /* ---------------- UI sync ---------------- */
            function syncUI() {
                hudSolved.textContent = String(solved) + "/" + ROUNDS;
                hudLives.textContent = String(lives);
                hudClue.textContent = String(clueCount);
                hudStatus.textContent = frozen() ? "Paused" : !started ? "Ready" : over ? "Over" : "Playing";
                moreBtn.disabled = clueCount >= 3 || over || !started || frozen();
                ov.start.hidden = started || helpOpen || cheatOpen || paused;
                ov.over.hidden = !over || helpOpen || cheatOpen || paused;
                ov.cheat.hidden = !cheatOpen || helpOpen || paused;
                ov.pause.hidden = !paused || helpOpen || cheatOpen;
                ov.help.hidden = !helpOpen;
                const label = pauseBtn.querySelector(".gw-btn-label");
                if (label) label.textContent = paused ? "Resume" : "Pause";
                pauseBtn.setAttribute("aria-label", paused ? "Resume" : "Pause");
                pauseBtn.title = paused ? "Resume (P)" : "Pause (P)";
                const ic = pauseBtn.querySelector(".gw-ic");
                if (ic) ic.innerHTML = iconSVG(paused ? "play" : "pause", { size: 14 });
                const canCheat = started && !over && !frozen();
                cheatBtns.clue.disabled = !canCheat || clueCount >= 3;
                cheatBtns.answer.disabled = !canCheat || !cur || lock;
                cheatBtns.skip.disabled = !canCheat || !cur || lock;
                cheatBtns.life.disabled = !started || over;
            }

            function toggleHelp(on) {
                helpOpen = typeof on === "boolean" ? on : !helpOpen;
                if (helpOpen) { cheatOpen = false; paused = false; }
                syncFreeze(); syncUI();
            }
            function toggleCheats(on) {
                cheatOpen = typeof on === "boolean" ? on : !cheatOpen;
                if (cheatOpen) { helpOpen = false; paused = false; }
                syncFreeze(); syncUI();
            }
            function togglePause(on) {
                paused = typeof on === "boolean" ? on : !paused;
                if (paused) { helpOpen = false; cheatOpen = false; }
                syncFreeze(); syncUI();
            }
            function exitGame() {
                const close = document.getElementById("closeGameButton");
                if (close) close.click();
            }

            function clueNode(i, text, fresh) {
                return (
                    '<div class="gw-clue' +
                    (fresh ? " new" : "") +
                    '"><span class="gw-n">' +
                    (i + 1) +
                    "</span><span>" +
                    text +
                    "</span></div>"
                );
            }

            /* ---------------- round flow ---------------- */
            function startRound() {
                if (over) return;
                lock = false;
                cur = pickRound(roundIdx, deck);
                clueCount = 1;
                cardEl.classList.remove("solved");
                cluesEl.innerHTML = clueNode(0, cur.target.clues[0], true);
                fbEl.textContent = "";
                fbEl.className = "gw-feedback";
                let html = "";
                cur.options.forEach((o, i) => {
                    html +=
                        '<button class="gw-opt" data-i="' +
                        i +
                        '">' +
                        o +
                        "</button>";
                });
                optsEl.innerHTML = html;
                syncUI();
            }

            function revealClue() {
                if (clueCount >= 3 || over || !started || frozen()) return;
                clueCount++;
                cluesEl.insertAdjacentHTML(
                    "beforeend",
                    clueNode(clueCount - 1, cur.target.clues[clueCount - 1], true),
                );
                syncUI();
            }

            function guess(i) {
                if (lock || over || !started || frozen() || !cur) return;
                lock = true;
                const chosen = cur.options[i];
                const btns = Array.from(optsEl.children);
                btns.forEach((b) => (b.disabled = true));
                const good = chosen === cur.target.name;
                btns[i].classList.add(good ? "good" : "bad");
                if (good) {
                    cardEl.classList.add("solved");
                    solved++;
                    fbEl.textContent = "It was a " + cur.target.name + "!";
                    fbEl.className = "gw-feedback good";
                    syncUI();
                    if (solved >= ROUNDS) {
                        after(900, win);
                        return;
                    }
                    roundIdx++;
                    after(1100, () => {
                        if (started && !over) startRound();
                    });
                } else {
                    lives--;
                    syncUI();
                    fbEl.textContent =
                        "Not " +
                        (/^[aeiou]/i.test(chosen) ? "an" : "a") +
                        " " +
                        chosen +
                        "...";
                    fbEl.className = "gw-feedback bad";
                    if (lives <= 0) {
                        after(900, lose);
                        return;
                    }
                    revealClue();
                    after(900, () => {
                        if (over || !started) return;
                        lock = false;
                        btns.forEach((b) => (b.disabled = false));
                        btns[i].classList.remove("bad");
                        syncUI();
                    });
                }
            }

            function win() {
                over = true;
                ovTitle.textContent = "Master detective!";
                ovTitle.className = "gw-ovtitle mgp-win";
                ovReason.textContent =
                    "All " +
                    ROUNDS +
                    " animals unmasked with " +
                    lives +
                    (lives === 1 ? " life" : " lives") +
                    " to spare.";
                syncUI();
            }
            function lose() {
                over = true;
                ovTitle.textContent = "Out of lives";
                ovTitle.className = "gw-ovtitle mgp-lose";
                ovReason.textContent =
                    "The animal was a " +
                    cur.target.name +
                    ". You solved " +
                    solved +
                    " of " +
                    ROUNDS +
                    " - try again, detective.";
                syncUI();
            }

            function startGame() {
                clearTimers();
                deck = shuffleFn(DECK);
                roundIdx = 0;
                solved = 0;
                lives = LIVES;
                over = false;
                started = true;
                paused = false;
                helpOpen = false;
                cheatOpen = false;
                syncFreeze();
                startRound();
            }

            function restartGame() {
                startGame();
            }

            function runCheat(kind) {
                if (!started || over || frozen() || !cur) return;
                if (kind === "clue") {
                    while (clueCount < 3) revealClue();
                } else if (kind === "answer") {
                    const idx = cur.options.indexOf(cur.target.name);
                    if (idx >= 0 && optsEl.children[idx]) optsEl.children[idx].classList.add("good");
                } else if (kind === "skip") {
                    const idx = cur.options.indexOf(cur.target.name);
                    if (idx >= 0) guess(idx);
                } else if (kind === "life") {
                    lives = Math.min(LIVES + 2, lives + 1);
                    syncUI();
                }
            }

            /* ---------------- events ---------------- */
            optsEl.addEventListener("pointerdown", (e) => {
                const el = e.target.closest ? e.target.closest(".gw-opt") : null;
                if (el) guess(Number(el.dataset.i));
            });
            const onKey = (e) => {
                if (!active) return;
                if (e.key === "Escape") {
                    if (helpOpen) toggleHelp(false);
                    else if (cheatOpen) toggleCheats(false);
                    else if (paused) togglePause(false);
                    return;
                }
                if (e.key === "h" || e.key === "H") { toggleHelp(); return; }
                if (helpOpen) return;
                if (e.key === "c" || e.key === "C") { toggleCheats(); return; }
                if (cheatOpen) return;
                if (e.key === "p" || e.key === "P") { togglePause(); return; }
                if (paused) return;
                if (e.key === "r" || e.key === "R") { restartGame(); return; }
                if (e.key >= "1" && e.key <= "4") guess(Number(e.key) - 1);
                else if (e.key === "m" || e.key === "M" || e.key === "?") revealClue();
                else if (e.key === " " || e.key === "Enter") {
                    e.preventDefault();
                    if (!started || over) startGame();
                }
            };
            document.addEventListener("keydown", onKey);
            app.addEventListener("click", (e) => {
                if (!active) return;
                const el = e.target.closest
                    ? e.target.closest("[data-help],[data-help-close],[data-cheats],[data-cheats-close],[data-pause],[data-resume],[data-restart],[data-exit],[data-cheat],[data-act],[data-more]")
                    : null;
                if (!el) return;
                if (el.hasAttribute("data-help") || el.hasAttribute("data-help-close")) { toggleHelp(el.hasAttribute("data-help-close") ? false : undefined); return; }
                if (el.hasAttribute("data-cheats") || el.hasAttribute("data-cheats-close")) { toggleCheats(el.hasAttribute("data-cheats-close") ? false : undefined); return; }
                if (el.hasAttribute("data-pause")) { togglePause(); return; }
                if (el.hasAttribute("data-resume")) { togglePause(false); return; }
                if (el.hasAttribute("data-restart")) { restartGame(); return; }
                if (el.hasAttribute("data-exit")) { exitGame(); return; }
                if (el.hasAttribute("data-more")) { revealClue(); return; }
                if (el.hasAttribute("data-cheat")) { runCheat(el.dataset.cheat); return; }
                const a = el.dataset.act;
                if (a === "start") startGame();
            });

            /* ---------------- open / close ---------------- */
            function open() {
                active = true;
                syncUI();
            }
            function close() {
                active = false;
                clearTimers();
            }

            syncUI();
            return { open, close };
        },
    });
})();
