/* ==== GAME: guess-who.js ==== */

/* =============================================================== */
/* Guess Who - educational game (MGP module)                        */
/* Deduce the hidden animal from progressive clues. Wrong guesses   */
/* unlock extra clues but cost a life; solve all 6 to win.          */
/* =============================================================== */
(() => {
    "use strict";

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
#guess-who-app .gw-wrap{display:flex;flex-direction:column;align-items:center;gap:14px;width:100%;max-width:540px}
#guess-who-app .gw-card{width:120px;height:120px;border-radius:20px;background:#182148;border:1px solid #ffffff24;display:flex;align-items:center;justify-content:center;position:relative;overflow:hidden}
#guess-who-app .gw-card svg{width:64px;height:64px;color:#818cf8}
#guess-who-app .gw-card.solved{background:#14532d;border-color:#34d399}
#guess-who-app .gw-card.solved svg{color:#34d399}
#guess-who-app .gw-clues{display:flex;flex-direction:column;gap:8px;width:100%;max-width:460px;min-height:96px}
#guess-who-app .gw-clue{background:#151d38;border:1px solid #ffffff1a;border-radius:12px;padding:10px 14px;color:#dbe1ea;font-size:14.5px;line-height:1.45;display:flex;gap:10px;align-items:flex-start;animation:gw-in .3s}
#guess-who-app .gw-clue .gw-n{flex:0 0 22px;height:22px;border-radius:999px;background:#4f46e5;color:#fff;font-size:12px;font-weight:800;display:grid;place-items:center;margin-top:1px}
#guess-who-app .gw-clue.new{border-color:#818cf8;box-shadow:0 0 0 2px #6366f133}
@keyframes gw-in{from{opacity:0;transform:translateY(-6px)}to{opacity:1;transform:none}}
#guess-who-app .gw-opts{display:grid;grid-template-columns:repeat(2,minmax(130px,180px));gap:12px;justify-content:center;width:100%}
#guess-who-app .gw-opt{border:1px solid #ffffff24;border-radius:14px;background:#182148;color:#e5e7eb;font-size:16.5px;font-weight:700;padding:13px 10px;transition:transform .1s,border-color .15s,background .15s}
#guess-who-app .gw-opt:hover{border-color:#6366f1;transform:translateY(-2px)}
#guess-who-app .gw-opt.good{background:#14532d;border-color:#34d399}
#guess-who-app .gw-opt.bad{background:#7f1d1d;border-color:#f87171}
#guess-who-app .gw-opt:disabled{cursor:default;opacity:.9}
#guess-who-app .gw-feedback{min-height:20px;font-weight:800;font-size:14px;text-align:center}
#guess-who-app .gw-feedback.good{color:#34d399}
#guess-who-app .gw-feedback.bad{color:#f87171}
</style>
<div class="mgp-hud">
  <span class="mgp-title">Guess Who</span>
  <span class="mgp-chip">Solved <b data-hud="solved">0</b>/${ROUNDS}</span>
  <span class="mgp-chip">Lives <b data-hud="lives">${LIVES}</b></span>
  <span class="mgp-chip">Clues <b data-hud="clue">1</b>/3</span>
  <span class="mgp-spacer"></span>
  <button class="mgp-btn ghost" data-act="more" data-el="more" disabled>More clues</button>
  <button class="mgp-btn ghost" data-act="restart">Restart</button>
</div>
<div class="mgp-stage">
  <div class="gw-wrap">
    <div class="gw-card" data-el="card">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-4.2-4.2"/><path d="M8.5 11h5M11 8.5v5"/></svg>
    </div>
    <div class="gw-clues" data-el="clues"></div>
    <div class="gw-opts" data-el="opts"></div>
    <div class="gw-feedback" data-el="fb"></div>
  </div>
  <div class="mgp-overlay" data-ov="start">
    <div class="mgp-card">
      <h2 class="mgp-ov-title">Guess Who</h2>
      <p class="mgp-ov-sub">A hidden animal leaves clues. Name it from the four options - each wrong guess (or extra clue) uses up one of your ${LIVES} lives. Solve ${ROUNDS} animals to win.</p>
      <button class="mgp-btn" data-act="start">Start game</button>
    </div>
  </div>
  <div class="mgp-overlay" data-ov="over" hidden>
    <div class="mgp-card">
      <h2 class="mgp-ov-title" data-ov="title">Game over</h2>
      <p class="mgp-ov-sub" data-ov="reason"></p>
      <button class="mgp-btn" data-act="start">Play again</button>
    </div>
  </div>
</div>
<div class="mgp-foot"><span class="mgp-hint">Click a name or press 1-4. Wrong answers reveal the next clue.</span></div>`;

            /* ---------------- refs ---------------- */
            const cardEl = $('[data-el="card"]'),
                cluesEl = $('[data-el="clues"]'),
                optsEl = $('[data-el="opts"]'),
                fbEl = $('[data-el="fb"]'),
                moreBtn = $('[data-el="more"]');
            const hudSolved = $('[data-hud="solved"]'),
                hudLives = $('[data-hud="lives"]'),
                hudClue = $('[data-hud="clue"]');
            const ovStart = $('[data-ov="start"]'),
                ovOver = $('[data-ov="over"]'),
                ovTitle = $('[data-ov="title"]'),
                ovReason = $('[data-ov="reason"]');

            /* ---------------- state ---------------- */
            let active = false,
                started = false,
                over = false;
            let deck = [],
                roundIdx = 0,
                solved = 0,
                lives = LIVES,
                clueCount = 1,
                lock = false;
            const timers = new Set();
            function after(ms, fn) {
                const id = setTimeout(() => {
                    timers.delete(id);
                    fn();
                }, ms);
                timers.add(id);
            }
            function clearTimers() {
                for (const id of timers) clearTimeout(id);
                timers.clear();
            }

            function updateHud() {
                hudSolved.textContent = String(solved);
                hudLives.textContent = String(lives);
                hudClue.textContent = String(clueCount);
                moreBtn.disabled = clueCount >= 3 || over || !started;
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
            let cur = null;
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
                updateHud();
            }

            function revealClue() {
                if (clueCount >= 3 || over || !started) return;
                clueCount++;
                cluesEl.insertAdjacentHTML(
                    "beforeend",
                    clueNode(clueCount - 1, cur.target.clues[clueCount - 1], true),
                );
                updateHud();
            }

            function guess(i) {
                if (lock || over || !started) return;
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
                    updateHud();
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
                    updateHud();
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
                    });
                }
            }

            function win() {
                over = true;
                ovTitle.textContent = "Master detective!";
                ovTitle.className = "mgp-ov-title mgp-win";
                ovReason.textContent =
                    "All " +
                    ROUNDS +
                    " animals unmasked with " +
                    lives +
                    (lives === 1 ? " life" : " lives") +
                    " to spare.";
                ovOver.removeAttribute("hidden");
            }
            function lose() {
                over = true;
                ovTitle.textContent = "Out of lives";
                ovTitle.className = "mgp-ov-title mgp-lose";
                ovReason.textContent =
                    "The animal was a " +
                    cur.target.name +
                    ". You solved " +
                    solved +
                    " of " +
                    ROUNDS +
                    " - try again, detective.";
                ovOver.removeAttribute("hidden");
            }

            function startGame() {
                clearTimers();
                deck = shuffleFn(DECK);
                roundIdx = 0;
                solved = 0;
                lives = LIVES;
                over = false;
                started = true;
                ovStart.setAttribute("hidden", "");
                ovOver.setAttribute("hidden", "");
                startRound();
            }

            /* ---------------- events ---------------- */
            optsEl.addEventListener("pointerdown", (e) => {
                const el = e.target.closest ? e.target.closest(".gw-opt") : null;
                if (el) guess(Number(el.dataset.i));
            });
            const onKey = (e) => {
                if (!active) return;
                if (e.key >= "1" && e.key <= "4") guess(Number(e.key) - 1);
                else if (e.key === "h" || e.key === "H") revealClue();
                else if (e.key === " " || e.code === "Space") {
                    e.preventDefault();
                    if (!started || over) startGame();
                }
            };
            document.addEventListener("keydown", onKey);
            app.addEventListener("click", (e) => {
                if (!active) return;
                const btn = e.target.closest
                    ? e.target.closest("[data-act]")
                    : null;
                if (!btn) return;
                const a = btn.dataset.act;
                if (a === "start" || a === "restart") startGame();
                else if (a === "more") revealClue();
            });

            /* ---------------- open / close ---------------- */
            function open() {
                active = true;
            }
            function close() {
                active = false;
                clearTimers();
            }

            return { open, close };
        },
    });
})();
