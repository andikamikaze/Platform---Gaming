/* ==== emoji-guess.js ==== */
/*
  Emoji Guess - pictogram word duel.
  Format template: export META + export mount(root, context).
  1. id META = nama file tanpa .js  -> "emoji-guess"
  2. Setelah menaruh file ini, jalankan: node tools/build-games-manifest.mjs
  Tidak ada karakter emoji: semua ikon adalah inline SVG buatan tangan.
  Layout: HUD bar (info + tombol ikon), board penuh tinggi, overlay
  help/cheats/pause/result di dalam board. Bantuan internal sekali jalan.
*/

import { iconSVG } from "../JS/icons.js";

export const META = {
    id: "emoji-guess",
    name: "Emoji Guess",
    category: "trivia",
    catLabel: "Trivia",
    desc: "Two pictograms, one word - outscore your rival.",
    art: '<svg viewBox="0 0 48 48" width="54" height="54" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="17" cy="17" r="10"/><circle cx="33" cy="29" r="8"/><path d="M25 21l4 4"/><path d="M37 17c1 3 0 5-2 7M40 13c2 5 1 9-3 12"/></svg>',
    bg: ["#fed7aa", "#f97316"],
    bestKey: "emojiGuessWins",
};

/* ---------------- rules ---------------- */
const ROUNDS = 8;   // total kartu per match (bergantian, 4 per pemain)
const TRIES = 5;    // kesempatan tebak per kartu
const HINTS = 2;    // hint per pemain per match
const BOT = 1;      // seat bot pada mode AI

/* ---------------- pictogram library (48x48 stroke icons) ---------------- */
const PIC = {
    sun: '<circle cx="24" cy="24" r="8"/><path d="M24 8v5m0 22v5M8 24h5m22 0h5M12 12l3.5 3.5m17 17l3.5 3.5m0-24l-3.5 3.5m-17 17L12 36"/>',
    flower: '<circle cx="24" cy="24" r="5"/><circle cx="24" cy="12" r="5"/><circle cx="35" cy="20" r="5"/><circle cx="31" cy="33" r="5"/><circle cx="17" cy="33" r="5"/><circle cx="13" cy="20" r="5"/>',
    snowflake: '<path d="M24 6v36M9 15l30 18M39 15L9 33"/><path d="M19 9l5 5 5-5M19 39l5-5 5 5M8 20l6 4-6 4M40 20l-6 4 6 4"/>',
    person: '<circle cx="24" cy="13" r="6"/><path d="M14 40c0-8 4-13 10-13s10 5 10 13"/>',
    raincloud: '<path d="M14 26a8 8 0 0 1 2-15.8A10 10 0 0 1 35 13a7 7 0 0 1 1 13z"/><path d="M17 31l-2 6m8-6l-2 6m8-6l-2 6"/>',
    arc: '<path d="M6 34a18 18 0 0 1 36 0"/><path d="M13 34a11 11 0 0 1 22 0"/><path d="M20 34a4 4 0 0 1 8 0"/>',
    star: '<path d="M24 6l5.2 11.4 12.1 1.1-9.1 8.2 2.7 12L24 32.2 13.1 38.7l2.7-12-9.1-8.2 12.1-1.1z"/>',
    fish: '<path d="M8 24c6-8 14-11 22-8l8-6-2 9 2 9-8-6c-8 3-16 0-22-8z"/><circle cx="15" cy="22" r="1.4"/>',
    drop: '<path d="M24 8s10 12 10 19a10 10 0 0 1-20 0C14 20 24 8 24 8z"/>',
    falldown: '<path d="M24 8v24"/><path d="M15 25l9 9 9-9"/><path d="M12 42h24"/>',
    earth: '<circle cx="24" cy="24" r="15"/><ellipse cx="24" cy="24" rx="7" ry="15"/><path d="M9 24h30"/>',
    crack: '<path d="M8 10l10 8-6 6 12 6-5 7 9 5"/><path d="M4 24h6"/>',
    bulb: '<path d="M24 8a10 10 0 0 1 6 18c-1.4 1-2 2.4-2 4h-8c0-1.6-.6-3-2-4a10 10 0 0 1 6-18z"/><path d="M20 34h8m-7 4h6"/>',
    house: '<path d="M8 22L24 8l16 14"/><path d="M12 20v20h24V20"/><path d="M20 40v-9h8v9"/>',
    dunes: '<path d="M4 34c6-8 12-8 18-4s14 4 22-4"/><path d="M4 40c7-6 13-6 19-2s13 2 21-4"/>',
    castle: '<path d="M10 40V16l4 3 4-3 4 3 4-3 4 3 4-3 4 3v24z"/><path d="M10 40h28"/><path d="M20 40v-8h8v8"/><path d="M14 22h4m12 0h4"/>',
    key: '<circle cx="17" cy="17" r="7"/><path d="M22 22l14 14m-5-1l4-4m-9 3l4-4"/>',
    board: '<rect x="8" y="12" width="32" height="24" rx="3"/><path d="M14 18h8m8 0h4M14 25h4m8 0h10M14 31h14"/>',
    glasses: '<circle cx="14" cy="26" r="7"/><circle cx="34" cy="26" r="7"/><path d="M21 26c1.5-2 4.5-2 6 0M7 24L4 20m37 4l3-4"/>',
    pine: '<path d="M24 6l8 11h-5l7 10h-5l6 9H13l6-9h-5l7-10h-5z"/><path d="M24 36v6"/>',
    apple: '<circle cx="24" cy="28" r="13"/><path d="M24 15c1-5 5-7 8-7-1 5-4 7-8 7z"/>',
    melon: '<path d="M6 28a18 18 0 0 0 36 0z"/><path d="M11 28a13 13 0 0 0 26 0"/><circle cx="19" cy="32" r="1.2"/><circle cx="26" cy="34" r="1.2"/><circle cx="30" cy="30" r="1.2"/>',
    flame: '<path d="M24 6c2 7 10 10 10 19a10 10 0 0 1-20 0c0-5 3-7 5-11 1 3 3 4 5 4-2-4-2-8 0-12z"/>',
    bug: '<ellipse cx="24" cy="27" rx="6" ry="9"/><path d="M18 20c-5-3-9-2-11 1 3 2 7 2 11 1m18-2c5-3 9-2 11 1-3 2-7 2-11 1"/><path d="M20 36l-3 5m11-5l3 5M18 27h-5m16 0h5"/>',
    moon: '<path d="M30 8a14 14 0 1 0 10 24A16 16 0 0 1 30 8z"/>',
    ball: '<circle cx="24" cy="24" r="15"/><path d="M9 24c8-6 22-6 30 0M24 9c-6 8-6 22 0 30"/>',
    lightning: '<path d="M26 6L14 28h8l-4 14 16-24h-9z"/>',
    sword: '<path d="M21 28V12l3-6 3 6v16"/><path d="M15 28h18"/><path d="M24 28v10"/><circle cx="24" cy="41" r="2.5"/>',
    shell: '<path d="M24 40C13 33 8 24 11 15a14 14 0 0 1 26 0c3 9-2 18-13 25z"/><path d="M24 40V9M24 40L14 13M24 40l10-27"/>',
    worm: '<path d="M8 34c4-8 8-8 12-2s8 6 12-2 6-8 8-4"/><circle cx="38" cy="25" r="1.3"/>',
    book: '<path d="M24 12c-4-3-10-4-16-3v26c6-1 12 0 16 3 4-3 10-4 16-3V9c-6-1-12 0-16 3z"/><path d="M24 12v26"/>',
    bed: '<path d="M6 14v24"/><path d="M6 30h36v8"/><path d="M20 30v-5h15a7 7 0 0 1 7 7"/><circle cx="13" cy="25" r="3.5"/>',
    bird: '<path d="M12 30c0-9 6-15 14-15 7 0 11 5 11 11 0 8-6 12-14 12H8l6-6z"/><path d="M37 22l6 2-6 2"/><circle cx="31" cy="20" r="1.3"/><path d="M22 38v4m6-4v4"/>',
    door: '<rect x="14" y="8" width="20" height="32" rx="2"/><circle cx="29" cy="25" r="1.6"/><path d="M10 40h28"/>',
    bell: '<path d="M24 8c-7 0-11 5-11 12v8l-4 6h30l-4-6v-8c0-7-4-12-11-12z"/><path d="M20 38a4 4 0 0 0 8 0"/><path d="M24 5v3"/>',
    ring: '<circle cx="24" cy="28" r="11"/><path d="M18 12l6-6 6 6-6 7z"/>',
    hole: '<ellipse cx="24" cy="30" rx="14" ry="7"/><ellipse cx="24" cy="30" rx="7" ry="3.5"/>',
    cup: '<path d="M10 16h24v12a10 10 0 0 1-10 10h-4a10 10 0 0 1-10-10z"/><path d="M34 18h4a5 5 0 0 1 0 10h-4"/>',
    cake: '<path d="M12 40V26h24v14"/><path d="M8 40h32"/><path d="M12 31c2 2.5 4 2.5 6 0s4-2.5 6 0 4 2.5 6 0 4-2.5 6 0"/><path d="M24 22v-4"/><circle cx="24" cy="14" r="2"/>',
    pan: '<path d="M8 26h26v4a8 8 0 0 1-8 8H16a8 8 0 0 1-8-8z"/><path d="M34 28h10"/>',
    cone: '<path d="M24 8L34 36H14z"/><path d="M10 40h28"/><path d="M19 22h10"/>',
    coat: '<path d="M18 8l6 4 6-4 8 6-4 8-2-2v20H16V20l-2 2-4-8z"/><path d="M24 12v28"/>',
    tent: '<path d="M24 10L6 38h36z"/><path d="M24 18l8 20h-16z"/>',
    bone: '<path d="M16 21c-6-4-12 2-8 7-4 5 2 11 8 7h16c6 4 12-2 8-7 4-5-2-11-8-7z"/>',
    stone: '<path d="M14 38L6 28l6-12 14-6 12 8 4 12-8 8z"/><path d="M12 16l10 8 16-6M22 24l-4 14"/>',
    paper: '<path d="M14 6h14l8 8v28H14z"/><path d="M28 6v8h8"/><path d="M19 22h12M19 28h12M19 34h8"/>',
    wave: '<path d="M8 36c0-14 10-24 22-24 8 0 12 6 12 11s-4 9-9 9c-4 0-7-3-7-7 0-3 2-5 5-5"/><path d="M6 40h36"/>',
    bowl: '<path d="M8 22h32c0 9-7 16-16 16S8 31 8 22z"/><path d="M18 42h12"/><path d="M24 38v4"/>',
    wheel: '<circle cx="24" cy="24" r="15"/><circle cx="24" cy="24" r="4"/><path d="M24 9v11m0 8v11M9 24h11m8 0h11M13 13l8 8m6 6l8 8M35 13l-8 8m-6 6l-8 8"/>',
    sail: '<path d="M22 6v30"/><path d="M22 8c10 4 14 14 14 26H22"/><path d="M22 14c-6 3-9 9-9 20h9"/>',
    boat: '<path d="M8 30h32l-6 10H14z"/><path d="M18 30v-8h12v8"/><path d="M24 22v-6l6 2-6 2"/>',
};

/* ---------------- word bank: word + 2 pictogram keys + category ---------------- */
const BANK = [
    { word: "sunflower", pics: ["sun", "flower"], cat: "Nature" },
    { word: "snowman", pics: ["snowflake", "person"], cat: "Nature" },
    { word: "rainbow", pics: ["raincloud", "arc"], cat: "Nature" },
    { word: "starfish", pics: ["star", "fish"], cat: "Nature" },
    { word: "waterfall", pics: ["drop", "falldown"], cat: "Nature" },
    { word: "earthquake", pics: ["earth", "crack"], cat: "Nature" },
    { word: "firefly", pics: ["flame", "bug"], cat: "Nature" },
    { word: "moonlight", pics: ["moon", "bulb"], cat: "Nature" },
    { word: "lighthouse", pics: ["bulb", "house"], cat: "Places" },
    { word: "sandcastle", pics: ["dunes", "castle"], cat: "Places" },
    { word: "keyboard", pics: ["key", "board"], cat: "Things" },
    { word: "sunglasses", pics: ["sun", "glasses"], cat: "Things" },
    { word: "pineapple", pics: ["pine", "apple"], cat: "Food" },
    { word: "watermelon", pics: ["drop", "melon"], cat: "Food" },
    { word: "raindrop", pics: ["raincloud", "drop"], cat: "Nature" },
    { word: "snowfall", pics: ["snowflake", "falldown"], cat: "Nature" },
    { word: "rainfall", pics: ["raincloud", "falldown"], cat: "Nature" },
    { word: "snowball", pics: ["snowflake", "ball"], cat: "Nature" },
    { word: "fireball", pics: ["flame", "ball"], cat: "Nature" },
    { word: "sunlight", pics: ["sun", "bulb"], cat: "Nature" },
    { word: "starlight", pics: ["star", "bulb"], cat: "Nature" },
    { word: "flashlight", pics: ["lightning", "bulb"], cat: "Things" },
    { word: "sunfish", pics: ["sun", "fish"], cat: "Nature" },
    { word: "swordfish", pics: ["sword", "fish"], cat: "Nature" },
    { word: "shellfish", pics: ["shell", "fish"], cat: "Nature" },
    { word: "earthworm", pics: ["earth", "worm"], cat: "Nature" },
    { word: "bookworm", pics: ["book", "worm"], cat: "Things" },
    { word: "bedbug", pics: ["bed", "bug"], cat: "Nature" },
    { word: "housefly", pics: ["house", "bug"], cat: "Nature" },
    { word: "birdhouse", pics: ["bird", "house"], cat: "Places" },
    { word: "treehouse", pics: ["pine", "house"], cat: "Places" },
    { word: "firehouse", pics: ["flame", "house"], cat: "Places" },
    { word: "doorbell", pics: ["door", "bell"], cat: "Things" },
    { word: "keyring", pics: ["key", "ring"], cat: "Things" },
    { word: "keyhole", pics: ["key", "hole"], cat: "Things" },
    { word: "cupcake", pics: ["cup", "cake"], cat: "Food" },
    { word: "pancake", pics: ["pan", "cake"], cat: "Food" },
    { word: "mooncake", pics: ["moon", "cake"], cat: "Food" },
    { word: "pinecone", pics: ["pine", "cone"], cat: "Nature" },
    { word: "raincoat", pics: ["raincloud", "coat"], cat: "Things" },
    { word: "flowerbed", pics: ["flower", "bed"], cat: "Nature" },
    { word: "campfire", pics: ["tent", "flame"], cat: "Nature" },
    { word: "bonfire", pics: ["bone", "flame"], cat: "Nature" },
    { word: "rockstar", pics: ["stone", "star"], cat: "Things" },
    { word: "moonstone", pics: ["moon", "stone"], cat: "Things" },
    { word: "sandstone", pics: ["dunes", "stone"], cat: "Nature" },
    { word: "sandpaper", pics: ["dunes", "paper"], cat: "Things" },
    { word: "surfboard", pics: ["wave", "board"], cat: "Things" },
    { word: "fishbowl", pics: ["fish", "bowl"], cat: "Things" },
    { word: "waterwheel", pics: ["drop", "wheel"], cat: "Things" },
    { word: "sailboat", pics: ["sail", "boat"], cat: "Things" },
    { word: "houseboat", pics: ["house", "boat"], cat: "Places" },
    { word: "nightfall", pics: ["moon", "falldown"], cat: "Nature" },
    { word: "snowdrop", pics: ["snowflake", "drop"], cat: "Nature" },
];

/* ---------------- pure helpers ---------------- */
function shuffle(a) {
    const arr = a.slice();
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}
function norm(s) {
    return String(s).toLowerCase().replace(/[^a-z0-9]/g, "");
}
/* Kartu dianggap "bisa diselesaikan" bila kedua ikonnya ada, jawabannya
   berupa huruf a-z dengan panjang wajar, dan hurufnya bisa diungkap hint. */
function isSolvable(c) {
    return (
        Array.isArray(c.pics) && c.pics.length === 2 &&
        c.pics.every((k) => PIC[k]) &&
        /^[a-z]{4,14}$/.test(c.word) &&
        new Set(c.word).size >= 3
    );
}
/* Random level generator: tiap match menyusun ROUNDS kartu acak yang
   dijamin valid + solvable, pasangan ikon unik, kategori tidak monoton. */
function generateDeck(n) {
    const pool = shuffle(BANK.filter(isSolvable));
    const out = [];
    const pairs = new Set();
    for (const c of pool) {
        const key = c.pics.join("+");
        if (pairs.has(key)) continue;
        const L = out.length;
        if (L >= 2 && out[L - 1].cat === c.cat && out[L - 2].cat === c.cat) continue;
        pairs.add(key);
        out.push({ word: c.word, pics: c.pics.slice(), cat: c.cat });
        if (out.length === n) break;
    }
    for (const c of pool) {
        if (out.length >= n) break;
        const key = c.pics.join("+");
        if (pairs.has(key)) continue;
        pairs.add(key);
        out.push({ word: c.word, pics: c.pics.slice(), cat: c.cat });
    }
    while (out.length < n && pool.length) {
        const c = pool[out.length % pool.length];
        out.push({ word: c.word, pics: c.pics.slice(), cat: c.cat });
    }
    return out;
}
/* Kata pengecoh untuk tebakan salah bot: berbagi ikon dengan kartu aktif. */
function decoyFor(card) {
    const near = BANK.filter((c) => c.word !== card.word && c.pics.some((p) => card.pics.includes(p)));
    const src = near.length ? near : BANK.filter((c) => c.word !== card.word);
    return src[Math.floor(Math.random() * src.length)].word;
}
function picSvg(key) {
    return '<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + PIC[key] + "</svg>";
}

/* ================================================================ */
export function mount(root, context = {}) {
    const { mode = "ai", room = null, playerName = "Player", onExit = () => { } } = context;
    const online = mode === "room" && Boolean(room);
    const authority = !online || room.isHost; // hanya host/AI yang memutasi state
    let roomData = room?.room || null;
    const subs = [];

    const coarse = typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches;
    let virtualOpen = coarse; // keyboard virtual otomatis terbuka di perangkat sentuh
    let cheatOpen = false;
    let helpOpen = false;
    let paused = false;
    let frozen = false;
    let freezeAt = 0;
    let freezePerfAt = 0;
    let state = null;
    let botPlan = null;
    let lastKey = "";
    let wins = 0;
    try { wins = Number(localStorage.getItem(META.bestKey)) || 0; } catch (e) { }
    function saveWins() { try { localStorage.setItem(META.bestKey, String(wins)); } catch (e) { } }

    /* bantuan internal: tampil sekali per perangkat, dibuka lagi lewat H / tombol Help */
    let seenHelp = true;
    try { seenHelp = localStorage.getItem("emojiGuessHelpSeen") === "1"; } catch (e) { seenHelp = true; }
    if (!seenHelp) {
        helpOpen = true;
        try { localStorage.setItem("emojiGuessHelpSeen", "1"); } catch (e) { /* storage blocked */ }
    }

    /* ---------------- skeleton: HUD bar + fill board + overlays ---------------- */
    root.innerHTML = `
<style>
.eg-app{--eg-line:#ffffff1f;--eg-panel:#141a30;--eg-mut:#8b93a7;--eg-acc:#818cf8;position:relative;display:flex;flex-direction:column;gap:10px;width:100%;height:100%;min-height:0;color:#e7eaf2;font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
.eg-app *{box-sizing:border-box}
.eg-app [hidden]{display:none!important}
.eg-app button{font:inherit;color:inherit;cursor:pointer;touch-action:manipulation}
.eg-app :is(button,input):focus-visible{outline:2px solid #a5b4fc;outline-offset:2px}
.eg-hud{display:flex;align-items:center;gap:5px 6px;flex-wrap:wrap;font:600 11px/1 ui-monospace,SFMono-Regular,Menlo,monospace}
.eg-chip{display:inline-flex;align-items:center;gap:6px;padding:5px 8px;border:1px solid var(--eg-line);border-radius:999px;background:#ffffff08;color:var(--eg-mut);white-space:nowrap}
.eg-chip b{color:#e7eaf2;font-weight:700;font-variant-numeric:tabular-nums}
.eg-chip [data-name]{display:inline-block;max-width:110px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:700}
.eg-seat.on{border-color:var(--eg-acc)}
.eg-seat.on [data-name]{color:#a5b4fc}
.eg-dotstat{width:7px;height:7px;border-radius:50%;background:#34d399;flex:none}
.eg-cat{color:#fbbf24}
.eg-spacer{flex:1 1 auto}
.eg-btn{min-height:44px;background:transparent;border:1px solid #ffffff2c;color:#c9cfdd;border-radius:9px;padding:8px 14px;font-size:13px;font-weight:600;transition:border-color .15s,color .15s,background .15s}
.eg-btn:hover:not(:disabled){border-color:#818cf8;color:#fff}
.eg-btn:disabled{opacity:.4;cursor:default}
.eg-btn.primary{background:#818cf8;border-color:#818cf8;color:#0d1024}
.eg-btn.primary:hover:not(:disabled){background:#a5b4fc;border-color:#a5b4fc;color:#0d1024}
.eg-btn[aria-pressed="true"]{border-color:#818cf8;color:#a5b4fc}
.eg-icon-btn{display:inline-flex;align-items:center;gap:6px}
.eg-icon-btn svg{flex:none;display:block}
.eg-app .eg-hud .eg-btn{min-height:32px;padding:5px 8px;font-size:10px}
.eg-app .eg-hud .eg-icon-btn[data-hint] .eg-btn-label,
.eg-app .eg-hud .eg-icon-btn[data-keys] .eg-btn-label{display:none}
.eg-board{position:relative;width:100%;flex:1 1 auto;min-height:0;display:flex;align-items:center;justify-content:center;padding:12px;background:#0b0e1c;border:1px solid var(--eg-line);border-radius:12px;overflow:hidden}
.eg-play{display:flex;flex-direction:column;align-items:center;gap:12px;width:100%;max-width:560px;margin:auto;padding:4px 2px 2px}
.eg-pics{display:flex;align-items:center;justify-content:center;gap:12px;flex-wrap:wrap;width:100%}
.eg-pic{width:96px;height:96px;border:1px solid #ffffff22;border-radius:12px;display:grid;place-items:center;background:#ffffff08}
.eg-pic svg{width:54px;height:54px;color:#c7d2fe}
.eg-plus{color:#5b6478;font-size:22px;font-weight:600}
.eg-mask{display:flex;flex-wrap:wrap;justify-content:center;gap:6px;min-height:30px}
.eg-slot{width:20px;height:28px;border-bottom:2px solid #ffffff2e;display:grid;place-items:center;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:17px;font-weight:700;text-transform:uppercase;color:#e7eaf2}
.eg-slot.on{border-color:var(--eg-acc)}
.eg-tries{display:flex;gap:6px;min-height:8px}
.eg-dot{width:7px;height:7px;border-radius:50%;background:#ffffff26}
.eg-dot.on{background:#818cf8}
.eg-row{display:flex;gap:8px;width:100%;max-width:400px}
.eg-input{flex:1;min-width:0;min-height:44px;background:transparent;border:1px solid #ffffff2c;border-radius:9px;color:#fff;font-size:16px;font-weight:600;padding:8px 12px;text-align:center;letter-spacing:1px}
.eg-input:focus{border-color:#818cf8}
.eg-input:disabled{opacity:.45}
.eg-fb{min-height:18px;font-size:13px;font-weight:600;line-height:1.4;text-align:center;color:#8b93a7}
.eg-fb.good{color:#34d399}
.eg-fb.bad{color:#f87171}
.eg-keys{display:flex;flex-direction:column;gap:6px;width:100%;max-width:420px}
.eg-krow{display:flex;gap:5px;justify-content:center}
.eg-key{flex:1;min-width:0;max-width:38px;min-height:44px;border:1px solid #ffffff22;background:#ffffff08;color:#dfe3ee;border-radius:8px;font-size:14px;font-weight:600;text-transform:uppercase}
.eg-key.wide{max-width:64px;flex:1.6}
.eg-key:hover{border-color:#818cf8}
.eg-keys.off .eg-key{opacity:.35;pointer-events:none}
.eg-ov{position:absolute;inset:0;padding:12px;overflow:auto;background:rgba(9,11,24,.94);display:grid;place-items:center;border-radius:12px;z-index:5}
.eg-ovcard{display:flex;flex-direction:column;gap:8px;width:min(360px,100%);max-height:100%;overflow:hidden;padding:16px;background:var(--eg-panel);border:1px solid var(--eg-line);border-radius:12px}
.eg-ovcard.center{width:min(320px,100%);align-items:center;text-align:center}
.eg-ovhead{display:flex;justify-content:space-between;align-items:center;gap:8px;font-size:11px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--eg-mut)}
.eg-cheats,.eg-help{flex:1 1 auto;min-height:0;overflow:auto}
.eg-cheats{display:flex;flex-direction:column;gap:6px}
.eg-help{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:12px;align-items:start}
.eg-help b{display:block;margin-bottom:5px;font:700 10px/1 ui-monospace,monospace;letter-spacing:.1em;text-transform:uppercase;color:var(--eg-mut)}
.eg-help ul{margin:0 0 10px;padding-left:16px;font:600 11px/1.6 ui-monospace,monospace;color:#c9cfdd}
.eg-kbd{display:inline-block;padding:1px 5px;border:1px solid var(--eg-line);border-bottom-width:2px;border-radius:5px;background:#0b0e1c;font:inherit;color:#e7eaf2}
.eg-foot{display:flex;align-items:center;justify-content:space-between;gap:10px;flex:none;margin-top:auto;padding-top:10px;border-top:1px solid var(--eg-line)}
.eg-note{font-size:10px;line-height:1.5;color:var(--eg-mut)}
.eg-cheat{display:flex;justify-content:space-between;align-items:center;gap:10px;min-height:44px;background:transparent;border:1px solid #ffffff22;border-radius:9px;color:#dfe3ee;padding:8px 12px;font-size:13px;font-weight:600;text-align:left}
.eg-cheat em{font-style:normal;font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:#5b6478}
.eg-cheat:hover:not(:disabled){border-color:#f472b6;color:#fff}
.eg-cheat:disabled{opacity:.35;cursor:default}
.eg-ovtitle{margin:0;font-size:22px;font-weight:700}
.eg-ovscore{margin:0;font-size:14px;color:#c9cfdd;font-variant-numeric:tabular-nums}
.eg-ovsub{margin:0;font-size:12px;line-height:1.5;color:#8b93a7;min-height:14px}
@media (prefers-reduced-motion:reduce){.eg-app *{animation:none!important;transition:none!important}}
/* --- layout overrides (keep last: beat pointer:coarse + design polish) --- */
.eg-app.game-fill > .eg-board{flex:1 1 auto;min-height:0;aspect-ratio:auto}
@media (max-width:640px){
.eg-app.game-fill > .eg-board:not(:has(.eg-ov:not([hidden]))){flex:0 0 auto;min-height:0;aspect-ratio:auto}
.eg-app.game-fill > .eg-board:has(.eg-ov:not([hidden])){flex:0 0 auto;min-height:min(70dvh,620px);aspect-ratio:auto}
.eg-app .eg-hud{gap:5px}
.eg-app .eg-hud .eg-chip{padding:4px 6px;font-size:9px}
.eg-app .eg-hud .eg-chip[data-hud="status"],
.eg-app .eg-hud .eg-chip[data-hud="cat"],
.eg-app .eg-hud .eg-chip[data-hud="wins"]{display:none}
.eg-app .eg-hud .eg-btn{min-height:32px;padding:5px 9px;font-size:9px}
.eg-app .eg-hud .eg-btn-label,
.eg-app .eg-hud .eg-spacer{display:none}
.eg-app .eg-play{gap:8px}
.eg-app .eg-pics{gap:8px}
.eg-app .eg-pic{width:80px;height:80px;border-radius:10px}
.eg-app .eg-pic svg{width:46px;height:46px}
.eg-app .eg-ov{padding:8px}
.eg-app .eg-ovcard{width:100%;height:100%;max-height:100%;padding:12px;border-radius:12px}
.eg-app .eg-cheats,.eg-app .eg-help{scrollbar-width:none}
.eg-app .eg-cheats::-webkit-scrollbar,.eg-app .eg-help::-webkit-scrollbar{display:none}
.eg-app .eg-foot{position:static;margin:0;padding:10px 0 0;border-top:1px solid var(--eg-line)}
.eg-app .eg-note{display:none}
}
</style>
<div class="game-app eg-app game-fill" data-eg>
  <div class="eg-hud">
    <span class="eg-chip eg-seat" data-seat="0"><span data-name="0">You</span> <b data-score="0">0</b></span>
    <span class="eg-chip">ROUND <b data-round>1 / 8</b></span>
    <span class="eg-chip">TRIES <b data-tries-num>5</b></span>
    <span class="eg-chip">HINTS <b data-hints>2</b></span>
    <span class="eg-chip" data-hud="cat"><span class="eg-cat" data-cat>&nbsp;</span></span>
    <span class="eg-chip" data-hud="status"><i class="eg-dotstat"></i><span data-status>Ready</span></span>
    <span class="eg-chip eg-seat" data-seat="1"><span data-name="1">Bot</span> <b data-score="1">0</b></span>
    <span class="eg-chip" data-hud="wins">WINS <b data-wins>0</b></span>
    <span class="eg-spacer"></span>
    <button class="eg-btn eg-icon-btn" type="button" data-hint aria-label="Hint" title="Reveal a letter (?)">${iconSVG("lightbulb", { size: 14 })}<span class="eg-btn-label">Hint</span></button>
    <button class="eg-btn eg-icon-btn" type="button" data-keys aria-pressed="false" aria-label="Toggle on-screen keyboard" title="On-screen keyboard">${iconSVG("keyboard", { size: 14 })}<span class="eg-btn-label">Keys</span></button>
    <button class="eg-btn eg-icon-btn" type="button" data-help aria-label="How to play" title="How to play (H)">${iconSVG("helpCircle", { size: 14 })}<span class="eg-btn-label">Help</span></button>
    <button class="eg-btn eg-icon-btn" type="button" data-cheats aria-label="Cheats" title="Cheats (C)">${iconSVG("wrench", { size: 14 })}<span class="eg-btn-label">Cheats</span></button>
    <button class="eg-btn eg-icon-btn" type="button" data-pause aria-label="Pause" title="Pause (P)">${iconSVG("pause", { size: 14 })}<span class="eg-btn-label">Pause</span></button>
    <button class="eg-btn eg-icon-btn" type="button" data-restart aria-label="Restart" title="Restart (R)">${iconSVG("refresh", { size: 14 })}<span class="eg-btn-label">Restart</span></button>
    <button class="eg-btn eg-icon-btn" type="button" data-exit aria-label="Exit game" title="Exit game">${iconSVG("logOut", { size: 14 })}<span class="eg-btn-label">Exit</span></button>
  </div>
  <section class="game-panel eg-board" data-board>
    <div class="eg-play" data-play>
      <div class="eg-pics" data-pics></div>
      <div class="eg-mask" data-mask></div>
      <div class="eg-tries" data-tries aria-label="Tries left"></div>
      <div class="eg-row">
        <input class="eg-input" data-input maxlength="24" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="answer" aria-label="Your guess">
        <button class="eg-btn primary" type="button" data-act="submit">Guess</button>
      </div>
      <div class="eg-fb" data-fb></div>
      <div class="eg-keys" data-kbd hidden></div>
    </div>
    <div class="eg-ov" data-ov="cheat" hidden>
      <div class="eg-ovcard">
        <div class="eg-ovhead"><span>Cheats</span><button class="eg-btn" type="button" data-cheats-close aria-label="Close cheats">Close</button></div>
        <div class="eg-cheats">
          <button class="eg-cheat" type="button" data-cheat="reveal">Reveal answer<em>turn</em></button>
          <button class="eg-cheat" type="button" data-cheat="solve">Solve this card<em>turn</em></button>
          <button class="eg-cheat" type="button" data-cheat="hint">Free letter<em>turn</em></button>
          <button class="eg-cheat" type="button" data-cheat="tries">Refill tries<em>turn</em></button>
          <button class="eg-cheat" type="button" data-cheat="nerf" data-nerf>Weaken bot<em>bot</em></button>
        </div>
        <div class="eg-foot"><span class="eg-note">Cheats apply to your seat only</span><button class="eg-btn" type="button" data-cheats-close>Close</button></div>
      </div>
    </div>
    <div class="eg-ov" data-ov="over" hidden>
      <div class="eg-ovcard center">
        <h3 class="eg-ovtitle" data-ovtitle>Match over</h3>
        <p class="eg-ovscore" data-ovscore></p>
        <p class="eg-ovsub" data-ovsub></p>
        <div class="eg-foot"><span class="eg-note">Wins are saved in this browser</span><button class="eg-btn primary" type="button" data-act="restart">Play again</button></div>
      </div>
    </div>
    <div class="eg-ov" data-ov="pause" hidden>
      <div class="eg-ovcard center">
        <h3 class="eg-ovtitle">Paused</h3>
        <p class="eg-ovsub">Timers and the bot are frozen.</p>
        <div class="eg-foot"><span class="eg-note">Press P or Esc to resume</span><button class="eg-btn primary" type="button" data-resume>Resume</button></div>
      </div>
    </div>
    <div class="eg-ov" data-ov="help" hidden>
      <div class="eg-ovcard">
        <div class="eg-ovhead"><span>How to play</span><button class="eg-btn" type="button" data-help-close aria-label="Close help">Close</button></div>
        <div class="eg-help">
          <div>
            <b>Desktop</b>
            <ul>
              <li>Guess the word from the two pictograms. Type it in the input and press <span class="eg-kbd">Enter</span> or Guess.</li>
              <li><span class="eg-kbd">?</span> reveals a letter &middot; <span class="eg-kbd">Backspace</span> deletes a character.</li>
              <li><span class="eg-kbd">H</span> help &middot; <span class="eg-kbd">C</span> cheats &middot; <span class="eg-kbd">P</span>/<span class="eg-kbd">Esc</span> pause &middot; <span class="eg-kbd">R</span> restart.</li>
            </ul>
            <b>Mobile</b>
            <ul>
              <li>Tap <span class="eg-kbd">Keys</span> to toggle the on-screen keyboard, then tap letters and Go.</li>
            </ul>
          </div>
          <div>
            <b>Rules</b>
            <ul>
              <li>${ROUNDS} cards per match, alternating turns (${ROUNDS / 2} per player).</li>
              <li>${TRIES} guesses per card and ${HINTS} hints per player. A missed card reveals the answer.</li>
              <li>Score a point for each correct word; most points after ${ROUNDS} cards wins.</li>
              <li>Career wins are saved in this browser and shown in the HUD and result screen.</li>
            </ul>
          </div>
        </div>
        <div class="eg-foot"><span class="eg-note">Press H to reopen this guide</span><button class="eg-btn primary" type="button" data-help-close>Got it</button></div>
      </div>
    </div>
  </section>
</div>`;

    /* ---------------- refs ---------------- */
    const $ = (s) => root.querySelector(s);
    const statusEl = $("[data-status]");
    const seatEls = [$('[data-seat="0"]'), $('[data-seat="1"]')];
    const nameEls = [$('[data-name="0"]'), $('[data-name="1"]')];
    const scoreEls = [$('[data-score="0"]'), $('[data-score="1"]')];
    const roundEl = $("[data-round]"), catEl = $("[data-cat]");
    const triesNumEl = $("[data-tries-num]"), hintsEl = $("[data-hints]"), winsEl = $("[data-wins]");
    const picsEl = $("[data-pics]"), maskEl = $("[data-mask]"), triesEl = $("[data-tries]");
    const inputEl = $("[data-input]"), guessBtn = $('[data-act="submit"]'), fbEl = $("[data-fb]");
    const kbdEl = $("[data-kbd]"), hintBtn = $("[data-hint]"), keysBtn = $("[data-keys]"), restartBtn = $("[data-restart]");
    const pauseBtnEl = $("[data-pause]");
    const ov = {
        cheat: $('[data-ov="cheat"]'), over: $('[data-ov="over"]'),
        pause: $('[data-ov="pause"]'), help: $('[data-ov="help"]'),
    };
    const ovTitle = $("[data-ovtitle]"), ovScore = $("[data-ovscore]"), ovSub = $("[data-ovsub]");
    const cheatBtns = {
        reveal: $('[data-cheat="reveal"]'), solve: $('[data-cheat="solve"]'),
        hint: $('[data-cheat="hint"]'), tries: $('[data-cheat="tries"]'),
    };
    const nerfBtn = $("[data-nerf]");
    if (online) nerfBtn.hidden = true; // cheat bot hanya tersedia di mode AI

    /* keyboard virtual (tombol layar untuk perangkat mobile) */
    kbdEl.innerHTML = ["qwertyuiop", "asdfghjkl", "zxcvbnm"].map((row, i) => {
        const keys = row.split("").map((ch) => '<button type="button" class="eg-key" data-key="' + ch + '">' + ch + "</button>").join("");
        const extra = i === 2
            ? '<button type="button" class="eg-key wide" data-key="back" aria-label="Backspace">&larr;</button><button type="button" class="eg-key wide" data-key="enter" aria-label="Guess">Go</button>'
            : "";
        return '<div class="eg-krow">' + keys + extra + "</div>";
    }).join("");

    /* ---------------- timers (bisa dibekukan saat pause/help/cheats) ---------------- */
    const timers = new Map();
    let timerSeq = 0;
    function armTimer(rec) {
        rec.startedAt = Date.now();
        rec.handle = setTimeout(() => {
            timers.delete(rec.id);
            rec.handle = 0;
            if (!frozen) rec.fn();
        }, Math.max(0, rec.remaining));
    }
    function after(ms, fn) {
        const id = ++timerSeq;
        const rec = { id, fn, remaining: ms, startedAt: 0, handle: 0 };
        timers.set(id, rec);
        if (!frozen) armTimer(rec); // saat beku, timer baru dipasang saat resume
    }
    function clearTimers() {
        for (const rec of timers.values()) if (rec.handle) clearTimeout(rec.handle);
        timers.clear();
    }
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
    function shiftClock(ms) {
        if (!authority || !ms || ms < 0) return;
        if (botPlan && botPlan.at) botPlan.at += ms;
    }
    function syncFreeze() {
        const next = paused || helpOpen || cheatOpen;
        if (next === frozen) return;
        frozen = next;
        if (frozen) {
            freezeAt = Date.now();
            freezePerfAt = performance.now();
            freezeTimers();
        } else {
            const shift = freezeAt ? Date.now() - freezeAt : 0;
            const perfShift = freezePerfAt ? performance.now() - freezePerfAt : 0;
            freezeAt = 0;
            freezePerfAt = 0;
            void perfShift; /* penanda performa: engine berbasis setTimeout */
            shiftClock(shift);
            resumeTimers();
        }
    }

    /* ---------------- overlay / mode toggles ---------------- */
    function toggleHelp(on) {
        helpOpen = typeof on === "boolean" ? on : !helpOpen;
        if (helpOpen) cheatOpen = false;
        syncFreeze();
        render();
    }
    function toggleCheats(on) {
        cheatOpen = typeof on === "boolean" ? on : !cheatOpen;
        if (cheatOpen) { helpOpen = false; paused = false; }
        syncFreeze();
        render();
    }
    function togglePause(on) {
        paused = typeof on === "boolean" ? on : !paused;
        if (paused) { cheatOpen = false; helpOpen = false; }
        syncFreeze();
        render();
    }
    function syncOverlays() {
        const over = Boolean(state && state.phase === "over");
        ov.over.hidden = !over || cheatOpen || helpOpen || paused;
        ov.cheat.hidden = !cheatOpen || helpOpen || paused;
        ov.pause.hidden = !paused || cheatOpen || helpOpen;
        ov.help.hidden = !helpOpen;
        keysBtn.setAttribute("aria-pressed", virtualOpen ? "true" : "false");
        const label = pauseBtnEl.querySelector(".eg-btn-label");
        if (label) label.textContent = paused ? "Resume" : "Pause";
        pauseBtnEl.setAttribute("aria-label", paused ? "Resume" : "Pause");
        pauseBtnEl.title = paused ? "Resume (P)" : "Pause (P)";
    }
    function restartGame() {
        paused = false;
        helpOpen = false;
        cheatOpen = false;
        syncFreeze();
        submitAction({ type: "restart" });
    }

    /* ---------------- seats & labels ---------------- */
    // Posisi pemain diacak per match oleh host (state.seats), bukan fix host=0.
    function mySeat() {
        if (!online) return 0;
        if (state && state.seats) return room.isHost ? state.seats.host : state.seats.guest;
        return room.isHost ? 0 : 1;
    }
    function seatLabel(s) { return online ? "Player " + (s + 1) : (s === 0 ? "You" : "Bot"); }

    /* ---------------- render ---------------- */
    function render() {
        kbdEl.hidden = !virtualOpen;
        if (!state) {
            statusEl.textContent = "Waiting for host…";
            triesNumEl.textContent = "—";
            hintsEl.textContent = "—";
            winsEl.textContent = String(wins);
            inputEl.disabled = true; guessBtn.disabled = true; hintBtn.disabled = true;
            restartBtn.disabled = true;
            kbdEl.classList.add("off");
            syncOverlays();
            return;
        }
        const me = mySeat();
        const card = state.deck[Math.min(state.round, ROUNDS - 1)];
        const mine = state.phase === "play" && !state.lock && state.turn === me && !frozen;

        statusEl.textContent = frozen ? "Paused"
            : state.phase === "over" ? "Match over"
                : state.lock ? "Next card…"
                    : mine ? "Your turn"
                        : online ? "Opponent's turn"
                            : "Bot is thinking…";

        for (let i = 0; i < 2; i++) {
            nameEls[i].textContent = seatLabel(i) + (online && me === i ? " · you" : "");
            scoreEls[i].textContent = String(state.scores[i]);
            seatEls[i].classList.toggle("on", state.phase === "play" && state.turn === i);
        }
        triesNumEl.textContent = String(state.tries);
        hintsEl.textContent = String(state.hints[me]);
        winsEl.textContent = String(wins);
        roundEl.textContent = Math.min(state.round + 1, ROUNDS) + " / " + ROUNDS;
        catEl.textContent = card.cat;
        picsEl.innerHTML =
            '<div class="eg-pic">' + picSvg(card.pics[0]) + "</div>" +
            '<div class="eg-plus">+</div>' +
            '<div class="eg-pic">' + picSvg(card.pics[1]) + "</div>";

        const rev = new Set(state.revealed);
        maskEl.innerHTML = card.word.split("").map((ch) =>
            '<span class="eg-slot' + (rev.has(ch) ? " on" : "") + '">' + (rev.has(ch) ? ch : "") + "</span>"
        ).join("");
        triesEl.innerHTML = Array.from({ length: TRIES }, (_, i) =>
            '<span class="eg-dot' + (i < state.tries ? " on" : "") + '"></span>'
        ).join("");

        inputEl.disabled = !mine;
        inputEl.placeholder = mine ? "answer" : "—";
        guessBtn.disabled = !mine;
        hintBtn.disabled = !mine || state.hints[me] <= 0;
        const hintLabel = hintBtn.querySelector(".eg-btn-label");
        if (hintLabel) hintLabel.textContent = "Hint · " + state.hints[me];
        hintBtn.setAttribute("aria-label", "Reveal a letter, " + state.hints[me] + " left");
        hintBtn.title = "Reveal a letter, " + state.hints[me] + " left (?)";
        restartBtn.disabled = online ? state.phase !== "over" : false;
        kbdEl.classList.toggle("off", !mine);
        for (const k in cheatBtns) cheatBtns[k].disabled = !mine;
        nerfBtn.disabled = state.phase !== "play";

        fbEl.textContent = state.fb ? state.fb.text : "";
        fbEl.className = "eg-fb" + (state.fb && state.fb.tone !== "info" ? " " + state.fb.tone : "");

        const key = state.nonce + ":" + state.round;
        if (key !== lastKey) {
            lastKey = key;
            inputEl.value = "";
            if (mine && !coarse) { try { inputEl.focus({ preventScroll: true }); } catch (e) { } }
        }

        if (state.phase === "over") {
            if (cheatOpen || paused) { cheatOpen = false; paused = false; syncFreeze(); }
            ovTitle.textContent =
                state.winner === -1 ? "Draw"
                    : state.winner === me ? "You win"
                        : online ? "You lose" : "Bot wins";
            ovScore.textContent = seatLabel(0) + " " + state.scores[0] + " — " + state.scores[1] + " " + seatLabel(1);
            ovSub.textContent = !online
                ? "Career wins: " + wins + (state.cheated ? " · cheats used" : "")
                : (state.cheated ? "Cheats were used" : "");
        }
        syncOverlays();
    }

    function publish() {
        render();
        // Hanya host yang menulis state kanonik ke Firebase (salinan agar immutable).
        if (online && room.isHost) room.publishState(JSON.parse(JSON.stringify(state))).catch(console.warn);
        if (!online) scheduleBot();
    }

    /* ---------------- game setup (random starter + random seats) ---------------- */
    function newGame() {
        clearTimers();
        botPlan = null;
        const starter = Math.random() < 0.5 ? 0 : 1;      // acak siapa jalan duluan
        const hostSeat = Math.random() < 0.5 ? 0 : 1;     // acak posisi player saat multiplayer
        state = {
            nonce: Math.random().toString(36).slice(2),
            phase: "play",
            round: 0,
            starter,
            seats: online ? { host: hostSeat, guest: 1 - hostSeat } : null,
            turn: starter,
            deck: generateDeck(ROUNDS),
            tries: TRIES,
            revealed: [],
            scores: [0, 0],
            hints: [HINTS, HINTS],
            lock: false,
            fb: { tone: "info", text: "First move — " + seatLabel(starter) },
            winner: null,
            botSkill: 1,
            cheated: false,
        };
        publish();
    }

    function advanceRound() {
        if (!state || state.phase !== "play") return;
        state.round++;
        if (state.round >= ROUNDS) { finish(); return; }
        state.turn = (state.starter + state.round) % 2;
        state.tries = TRIES;
        state.revealed = [];
        state.lock = false;
        state.fb = { tone: "info", text: "Turn — " + seatLabel(state.turn) };
        botPlan = null;
        publish();
    }

    function finish() {
        state.phase = "over";
        state.lock = false;
        const a = state.scores[0], b = state.scores[1];
        state.winner = a === b ? -1 : a > b ? 0 : 1;
        if (!online && state.winner === 0) { wins++; saveWins(); }
        publish();
    }

    function revealLetter(card) {
        const hidden = [...new Set(card.word)].filter((ch) => !state.revealed.includes(ch));
        if (!hidden.length) return false;
        state.revealed.push(hidden[Math.floor(Math.random() * hidden.length)]);
        return true;
    }

    function failCard(card, text) {
        state.tries = 0;
        state.revealed = [...card.word];
        state.lock = true;
        state.fb = { tone: "bad", text };
        publish();
        if (authority) after(1600, advanceRound);
    }

    /* ---------------- reducer (host-authoritative) ---------------- */
    function applyAction(action, actor) {
        if (!state || !action || typeof action !== "object") return;
        if (actor !== 0 && actor !== 1) return; // validasi actor
        if (action.type === "restart") {
            if (online && state.phase !== "over") return;
            newGame();
            return;
        }
        if (state.phase !== "play") return;
        const card = state.deck[Math.min(state.round, ROUNDS - 1)];
        if (action.type === "cheat") { applyCheat(action.id, actor, card); return; }
        if (state.lock || actor !== state.turn) return; // hanya pemain aktif yang boleh bertindak

        if (action.type === "guess") {
            const v = norm(action.value);
            if (!v) return;
            if (v === norm(card.word)) {
                state.scores[actor]++;
                state.revealed = [...card.word];
                state.lock = true;
                state.fb = { tone: "good", text: seatLabel(actor) + " solved “" + card.word + "”" };
                publish();
                if (authority) after(1100, advanceRound);
            } else {
                state.tries--;
                if (state.tries <= 0) {
                    failCard(card, seatLabel(actor) + " missed — it was “" + card.word + "”");
                } else {
                    state.fb = { tone: "bad", text: seatLabel(actor) + ": not it — " + state.tries + " left" };
                    publish();
                }
            }
        } else if (action.type === "hint") {
            if (state.hints[actor] <= 0) return;
            if (!revealLetter(card)) return;
            state.hints[actor]--;
            state.fb = { tone: "info", text: seatLabel(actor) + " revealed a letter" };
            publish();
        } else if (action.type === "giveup") {
            failCard(card, seatLabel(actor) + " gave up — it was “" + card.word + "”");
        }
    }

    function applyCheat(id, actor, card) {
        if (id === "nerf") {
            if (online || actor !== 0) return;
            state.botSkill = 0;
            state.cheated = true;
            state.fb = { tone: "info", text: "Cheat: bot weakened" };
            publish();
            return;
        }
        if (actor !== state.turn || state.lock) return;
        if (id === "reveal") {
            state.revealed = [...card.word];
        } else if (id === "hint") {
            if (!revealLetter(card)) return;
        } else if (id === "tries") {
            state.tries = TRIES;
        } else if (id === "solve") {
            state.scores[actor]++;
            state.revealed = [...card.word];
            state.lock = true;
            state.cheated = true;
            state.fb = { tone: "good", text: seatLabel(actor) + " solved “" + card.word + "” (cheat)" };
            publish();
            if (authority) after(1100, advanceRound);
            return;
        } else {
            return;
        }
        state.cheated = true;
        const label = { reveal: "answer revealed", hint: "free letter", tries: "tries refilled" }[id];
        state.fb = { tone: "info", text: "Cheat: " + label };
        publish();
    }

    function submitAction(action) {
        if (online && !room.isHost) { room.sendAction(action).catch(console.warn); return; }
        applyAction(action, mySeat());
    }

    /* ---------------- bot (mode AI) ---------------- */
    function scheduleBot() {
        if (!state || state.phase !== "play" || state.lock || state.turn !== BOT) return;
        if (botPlan && botPlan.round === state.round) return;
        const round = state.round;
        botPlan = { round };
        const card = state.deck[round];
        const ok = () => state && state.phase === "play" && !state.lock && state.turn === BOT && state.round === round;
        if (state.hints[BOT] > 0 && Math.random() < 0.45) {
            after(800, () => { if (ok()) applyAction({ type: "hint" }, BOT); });
        }
        after(1500 + Math.random() * 1100, () => {
            if (!ok()) return;
            const chance = Math.max(0.25, Math.min(0.85, 0.82 - (card.word.length - 6) * 0.05)) * state.botSkill;
            if (Math.random() < chance) {
                applyAction({ type: "guess", value: card.word }, BOT);
            } else {
                applyAction({ type: "guess", value: decoyFor(card) }, BOT);
                after(900, () => { if (ok()) applyAction({ type: "giveup" }, BOT); });
            }
        });
    }

    /* ---------------- input helpers ---------------- */
    function typeChar(ch) {
        if (frozen || inputEl.disabled) return;
        if (inputEl.value.length < 24) inputEl.value += ch;
        if (!coarse) { try { inputEl.focus({ preventScroll: true }); } catch (e) { } }
    }
    function syncInputMode() {
        // Saat keyboard virtual aktif di layar sentuh, sembunyikan keyboard OS.
        inputEl.readOnly = coarse && virtualOpen;
        inputEl.setAttribute("inputmode", coarse && virtualOpen ? "none" : "text");
    }
    function handleEscape() {
        if (helpOpen) toggleHelp(false);
        else if (cheatOpen) toggleCheats(false);
        else if (paused) togglePause(false);
        else if (virtualOpen && coarse) { virtualOpen = false; syncInputMode(); render(); }
        else { try { inputEl.blur(); } catch (e) { } }
    }

    /* ---------------- events: mouse + keyboard fisik + tombol virtual ---------------- */
    function handleClick(event) {
        const t = event.target;
        if (!t || !t.closest) return;
        if (t.closest("[data-exit]")) { onExit(); return; }
        if (t.closest("[data-help]")) { toggleHelp(); return; }
        if (t.closest("[data-help-close]")) { toggleHelp(false); return; }
        if (t.closest("[data-cheats]")) { toggleCheats(); return; }
        if (t.closest("[data-cheats-close]")) { toggleCheats(false); return; }
        if (t.closest("[data-pause]")) { togglePause(); return; }
        if (t.closest("[data-resume]")) { togglePause(false); return; }
        if (t.closest("[data-restart]")) { restartGame(); return; }
        if (t.closest("[data-hint]")) { submitAction({ type: "hint" }); return; }
        if (t.closest("[data-keys]")) { virtualOpen = !virtualOpen; syncInputMode(); render(); return; }
        const kb = t.closest("[data-key]");
        if (kb) {
            if (!inputEl.disabled && !frozen) {
                const k = kb.dataset.key;
                if (k === "enter") submitAction({ type: "guess", value: inputEl.value });
                else if (k === "back") inputEl.value = inputEl.value.slice(0, -1);
                else typeChar(k);
            }
            return;
        }
        const ch = t.closest("[data-cheat]");
        if (ch) { if (!frozen) submitAction({ type: "cheat", id: ch.dataset.cheat }); return; }
        const btn = t.closest("[data-act]");
        if (!btn) return;
        const a = btn.dataset.act;
        if (a === "submit") submitAction({ type: "guess", value: inputEl.value });
        else if (a === "restart") submitAction({ type: "restart" });
    }

    function onInputKey(e) {
        if (e.key === "Enter") {
            e.preventDefault();
            if (!frozen) submitAction({ type: "guess", value: inputEl.value });
        } else if (e.key === "Escape") {
            e.preventDefault();
            handleEscape();
        } else if (inputEl.readOnly && e.key.length === 1 && /[a-z0-9 ]/i.test(e.key)) {
            e.preventDefault();
            typeChar(e.key.toLowerCase());
        }
    }

    function onDocKey(e) {
        if (e.target === inputEl) return; // input owns typing + its own Enter/Esc
        if (e.ctrlKey || e.metaKey || e.altKey) return;
        const k = e.key, code = e.code || "";
        const is = (letter) => code === "Key" + letter || k === letter.toLowerCase() || k === letter.toUpperCase();
        /* prioritas: help -> cheats -> pause/Escape -> aksi game */
        if (is("H")) { e.preventDefault(); toggleHelp(); return; }
        if (is("C")) { e.preventDefault(); if (!helpOpen && !paused) toggleCheats(); return; }
        if (is("P") || k === "Escape") {
            e.preventDefault();
            if (k === "Escape") handleEscape();
            else togglePause();
            return;
        }
        if (is("R")) { e.preventDefault(); restartGame(); return; }
        if (!state || frozen) return;
        if (state.phase === "over") {
            if (k === "Enter") { e.preventDefault(); submitAction({ type: "restart" }); }
            return;
        }
        if (k === "?") { e.preventDefault(); submitAction({ type: "hint" }); return; }
        if (inputEl.disabled) return;
        if (k === "Enter") { e.preventDefault(); submitAction({ type: "guess", value: inputEl.value }); }
        else if (k === "Backspace") { e.preventDefault(); inputEl.value = inputEl.value.slice(0, -1); }
        else if (k.length === 1 && /[a-z0-9 ]/i.test(k)) {
            e.preventDefault();
            typeChar(k.toLowerCase());
        }
    }

    root.addEventListener("click", handleClick);
    inputEl.addEventListener("keydown", onInputKey);
    document.addEventListener("keydown", onDocKey);
    syncInputMode();

    /* ---------------- wiring: room (multiplayer) / AI ---------------- */
    syncFreeze(); // bantuan first-run ikut membekukan timer sebelum state dibuat
    if (online) {
        subs.push(room.onRoom((nextRoom) => { roomData = nextRoom; render(); }));
        if (room.isHost) {
            newGame();
            subs.push(room.onAction((action) => applyAction(action, state ? state.seats.guest : 1)));
        } else {
            subs.push(room.onState((nextState) => { state = nextState; render(); }));
        }
    } else {
        newGame();
    }
    render();

    return {
        destroy() {
            clearTimers();
            botPlan = null;
            root.removeEventListener("click", handleClick);
            inputEl.removeEventListener("keydown", onInputKey);
            document.removeEventListener("keydown", onDocKey);
            for (const u of subs) { try { if (typeof u === "function") u(); } catch (e) { } }
        },
    };
}