import { iconSVG } from "../JS/icons.js";

/* ================================================================ */
/*  freecell.js - FreeCell                                          */
/*  Template: export META + mount(root, context)                    */
/*  - Deals: Microsoft FreeCell #1-32000 (minus #11982), all        */
/*    proven solvable. Deal number is shown and replayable.         */
/*  - Modes: solo / vs bot (local), turn-based duel (online room).  */
/* ================================================================ */

export const META = {
    id: "freecell",
    name: "FreeCell",
    category: "cards",
    catLabel: "Cards",
    desc: "Solvable deals. Play solo, race a bot, or duel a friend online.",
    art: '<svg viewBox="0 0 48 48" width="54" height="54" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><g stroke-width="2.5"><rect x="3" y="10" width="9" height="9" rx="2"/><rect x="14" y="10" width="9" height="9" rx="2"/><rect x="3" y="21" width="9" height="9" rx="2"/><rect x="14" y="21" width="9" height="9" rx="2"/></g><rect x="28" y="8" width="17" height="30" rx="3"/><path d="M36.5 14.5c-1.7-2.1-4.9-1.4-4.9 1.1 0 1.9 2.3 3.8 4.9 6.1 2.6-2.3 4.9-4.2 4.9-6.1 0-2.5-3.2-3.2-4.9-1.1z" fill="currentColor" stroke="none"/></svg>',
    bg: ["#bfdbfe", "#60a5fa"],
};

export function mount(root, context = {}) {
    const { mode = "ai", room = null, playerName = "Player", onExit = () => { } } = context;
    const online = mode === "room" && Boolean(room);
    let roomData = (room && room.room) || null;
    let state = null;
    let dead = false;
    const unsubs = [];

    /* ---------- constants ---------- */
    const SUIT_KEYS = ["spade", "heart", "diamond", "club"];
    const SUIT_CHAR = ["\u2660", "\u2665", "\u2666", "\u2663"];
    const SUIT_MARK = {
        spade: '<path d="M12 2C8 7.5 4 10 4 13.7c0 2.5 2 4.3 4.3 4.3 1.2 0 2.3-.5 3-1.3-.2 1.9-1 3.3-2.3 4.3h6c-1.3-1-2.1-2.4-2.3-4.3.7.8 1.8 1.3 3 1.3 2.3 0 4.3-1.8 4.3-4.3C20 10 16 7.5 12 2z"/>',
        heart: '<path d="M12 21C5.5 15.5 2 11.6 2 7.8 2 4.9 4.2 3 6.8 3c1.9 0 3.7 1 5.2 3C13.5 4 15.3 3 17.2 3 19.8 3 22 4.9 22 7.8c0 3.8-3.5 7.7-10 13.2z"/>',
        diamond: '<path d="M12 2l7.5 10L12 22 4.5 12z"/>',
        club: '<circle cx="12" cy="6.8" r="4.3"/><circle cx="7" cy="13.5" r="4.3"/><circle cx="17" cy="13.5" r="4.3"/><path d="M10.8 12h2.4c.2 4 .9 6.9 2.6 9H8.2c1.7-2.1 2.4-5 2.6-9z"/>',
    };
    const RED = "#d64560", BLK = "#2c3644";
    const ICONS = {
        undo: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 14L4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/></svg>',
        home: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/></svg>',
        auto: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 13l6-6 6 6"/><path d="M6 19l6-6 6 6"/></svg>',
        clear: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>',
        restart: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/></svg>',
        fresh: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="4"/><path d="M12 8v8M8 12h8"/></svg>',
        cheat: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 19L15 9"/><path d="M14 6l4 4"/><path d="M18 3v2M21 6h-2M8 3v2M5 6h2M19 15v2M17 18h2"/></svg>',
    };

    /* ---------- pure rules ---------- */
    function isRed(s) { return s === 1 || s === 2; }
    function rankLabel(r) { return r === 1 ? "A" : r === 11 ? "J" : r === 12 ? "Q" : r === 13 ? "K" : String(r); }
    function canTableau(moving, onto) {
        if (!onto) return true;
        return moving.r === onto.r - 1 && isRed(moving.s) !== isRed(onto.s);
    }
    function canFoundation(card, top) {
        if (!top) return card.r === 1;
        return card.s === top.s && card.r === top.r + 1;
    }
    function maxMovable(freeCells, emptyCols) { return (1 + freeCells) * Math.pow(2, emptyCols); }
    function foundTotal(p) { let n = 0; for (const f of p.found) n += f ? f.r : 0; return n; }
    function fitFound(p, card) { for (let i = 0; i < 4; i++) if (canFoundation(card, p.found[i])) return i; return -1; }
    function suitSlot(p, s) { for (let i = 0; i < 4; i++) if (p.found[i] && p.found[i].s === s) return i; return -1; }
    function firstEmptyFound(p) { for (let i = 0; i < 4; i++) if (!p.found[i]) return i; return -1; }
    function freeCount(p) { let n = 0; for (const f of p.free) if (!f) n++; return n; }
    function emptyColCount(p) { let n = 0; for (const c of p.cols) if (!c.length) n++; return n; }
    function moveLimit(p, destCol) {
        let e = emptyColCount(p);
        if (destCol >= 0 && !p.cols[destCol].length) e--;
        return maxMovable(freeCount(p), e);
    }
    function isStuck(p) {
        const cols = p.cols, free = p.free;
        const has = (c) => c && c.length > 0;
        const anyCol = cols.some(has), anyFree = free.some((f) => !!f);
        if (!anyCol && !anyFree) return false;
        const fc = freeCount(p), ec = emptyColCount(p);
        if (anyCol && fc > 0) return false;
        if (ec > 0) return false;
        for (const col of cols) if (has(col) && fitFound(p, col[col.length - 1]) >= 0) return false;
        for (const f of free) if (f && fitFound(p, f) >= 0) return false;
        for (const f of free) {
            if (!f) continue;
            for (const col of cols) if (has(col) && canTableau(f, col[col.length - 1])) return false;
        }
        const lim = maxMovable(fc, ec);
        for (let i = 0; i < cols.length; i++) {
            const col = cols[i];
            if (!has(col)) continue;
            let m = col.length - 1;
            while (m > 0) {
                const b = col[m - 1], c = col[m];
                if (c.r !== b.r - 1 || isRed(c.s) === isRed(b.s)) break;
                m--;
            }
            for (let s = m; s < col.length; s++) {
                if (col.length - s > lim) continue;
                const head = col[s];
                for (let d = 0; d < cols.length; d++) {
                    if (d === i) continue;
                    const dest = cols[d];
                    if (!dest.length || canTableau(head, dest[dest.length - 1])) return false;
                }
            }
        }
        return true;
    }

    /* ---------- solvable dealer (Microsoft FreeCell LCG) ---------- */
    function dealFromNumber(n) {
        let seed = n >>> 0;
        const cards = [];
        for (let i = 0; i < 52; i++) cards.push(i);
        const cols = [[], [], [], [], [], [], [], []];
        for (let i = 0; i < 52; i++) {
            seed = (seed * 214013 + 2531011) % 2147483648;
            const j = (seed >>> 16) % (52 - i);
            const c = cards[j];
            cards[j] = cards[51 - i];
            cols[i % 8].push({ s: 3 - (c % 4), r: (c >> 2) + 1 });
        }
        return cols;
    }
    function randomDeal() {
        let n;
        do { n = 1 + ((Math.random() * 32000) | 0); } while (n === 11982);
        return n;
    }

    /* ---------- shell ---------- */
    root.innerHTML = `
<style>
.fc{--bg:#f2f4f7;--panel:#fff;--line:#dfe4ea;--ink:#243040;--mut:#8a94a3;--acc:#4c6fff;--amber:#e9a23b;color:var(--ink);width:100%;height:100%;min-height:0;margin:0 auto;padding:2px;display:flex;flex-direction:column;gap:8px;min-width:0;outline:none;font:14px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
.fc *{box-sizing:border-box}
.fc [hidden]{display:none!important}
.fc :is(button,[tabindex]):focus-visible{outline:2px solid var(--acc);outline-offset:2px}
/* --- single HUD bar: all info + controls above the board --- */
.fc-hud{display:flex;align-items:center;gap:6px;flex-wrap:wrap;font:600 10.5px/1 ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:.02em}
.fc-chip{display:inline-flex;align-items:center;gap:5px;padding:5px 9px;min-height:28px;border:1px solid var(--line);border-radius:999px;background:var(--panel);color:var(--mut);white-space:nowrap}
.fc-chip b{color:var(--ink);font-weight:700;font-variant-numeric:tabular-nums}
.fc-turn{color:var(--acc);font-weight:700}
.fc-status{color:var(--mut)}
.fc-cheatflag{color:var(--amber);font-weight:700}
.fc-msg{color:var(--ink);max-width:34ch;white-space:normal;font-weight:600}
.fc-spacer{flex:1 1 auto;min-width:6px}
.fc-seg{display:flex;border:1px solid var(--line);border-radius:9px;overflow:hidden;background:var(--panel)}
.fc-seg button{border:0;background:var(--panel);color:var(--mut);font:inherit;font-size:10px;padding:6px 10px;min-height:30px;cursor:pointer}
.fc-seg button.on{background:var(--ink);color:#fff}
.fc-btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;min-height:32px;padding:6px 10px;border:1px solid var(--line);border-radius:9px;background:var(--panel);color:var(--ink);font:inherit;font-size:10px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;cursor:pointer;transition:border-color .15s,color .15s,background .15s}
.fc-btn:hover:not(:disabled){border-color:var(--acc);color:var(--acc)}
.fc-btn:disabled{opacity:.4;cursor:default}
.fc-btn.armed{border-color:var(--amber);color:var(--amber)}
.fc-btn.primary{background:var(--acc);border-color:var(--acc);color:#fff}
.fc-btn.primary:hover:not(:disabled){color:#fff;opacity:.92}
.fc-icon-btn svg{flex:none;display:block;width:14px;height:14px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
.fc-btn-label{white-space:nowrap}
/* --- board fills remaining height; content stays proportional & centered --- */
.fc.game-fill>.game-panel[data-board]{flex:1 1 auto;min-height:0;aspect-ratio:auto;min-width:0;position:relative;display:flex;flex-direction:column;padding:0;border:1px solid var(--line);border-radius:12px;background:var(--bg);overflow:hidden}
.fc-opp{flex:none;background:var(--panel);border-bottom:1px solid var(--line);padding:8px 12px;font-size:11px;color:var(--mut)}
.fc-opp-head{display:flex;align-items:center;flex-wrap:wrap;gap:6px 12px;margin-bottom:6px}
.fc-opp-head b{color:var(--ink)}
.fc-opp-head b.on{color:var(--acc)}
.fc-opp-bar{height:4px;border-radius:2px;background:var(--line);overflow:hidden;margin-bottom:8px}
.fc-opp-bar i{display:block;height:100%;background:var(--acc);border-radius:2px}
.fc-mini{display:flex;gap:4px;align-items:flex-start}
.fc-mini-col{position:relative;flex:1;min-width:0}
.fc-mini-card{position:absolute;left:0;right:0;background:#fff;border:1px solid var(--line);border-radius:3px;font-size:9px;line-height:1.2;padding:1px 2px;font-weight:600;white-space:nowrap;overflow:hidden}
.fc-wrap{position:relative;flex:1 1 auto;min-height:0;min-width:0;display:flex;align-items:center;justify-content:center;overflow:hidden}
.fc-board{position:relative;flex:none;background:var(--bg);user-select:none;-webkit-user-select:none;outline:none;touch-action:manipulation;border-radius:10px}
.fc .slot{position:absolute;box-sizing:border-box;border:1px dashed var(--line);border-radius:6px;cursor:pointer}
.fc .slot .lab{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:#c3cad4;font-weight:700}
.fc .slot.colbase{border-color:transparent}
.fc .slot.colbase.empty{border-color:var(--line)}
.fc .card{position:absolute;box-sizing:border-box;background:#fff;border:1px solid var(--line);border-radius:6px;box-shadow:0 1px 2px rgba(20,30,50,.06);cursor:pointer;transition:box-shadow .16s,transform .16s}
@media(hover:hover){.fc .card:hover{transform:translateY(-1px);box-shadow:0 3px 8px rgba(20,30,50,.12)}}
.fc .card .rk{position:absolute;font-weight:700;line-height:1}
.fc .card .cs{position:absolute;line-height:0}
.fc .card .pip{position:absolute;left:50%;top:58%;transform:translate(-50%,-50%);opacity:.13;line-height:0}
.fc .card.sel{box-shadow:0 0 0 2px var(--acc),0 4px 10px rgba(20,30,50,.16);transform:translateY(-2px)}
.fc .card.hint,.fc .slot.hint{box-shadow:0 0 0 2px var(--amber)}
.fc .card.cur,.fc .slot.cur{outline:2px dashed var(--acc);outline-offset:2px}
.fc .fc-board.wild .card.sel{box-shadow:0 0 0 2px var(--amber),0 4px 10px rgba(20,30,50,.16)}
/* --- overlays: cheats / result / wait / pause / help, mutually exclusive --- */
.fc-ov{position:absolute;inset:0;z-index:6;display:flex;align-items:center;justify-content:center;padding:12px;background:rgba(242,244,247,.9);backdrop-filter:blur(3px);border-radius:12px}
.fc-card{display:flex;flex-direction:column;overflow:hidden;width:min(440px,100%);max-height:100%;background:var(--panel);border:1px solid var(--line);border-radius:12px;box-shadow:0 12px 28px rgba(20,30,50,.14)}
.fc-head{flex:none;display:flex;align-items:center;justify-content:space-between;gap:10px;padding:14px 16px 8px}
.fc-head h3{margin:0;font-size:16px;line-height:1.25}
.fc-head h3.win{color:var(--acc)}
.fc-body{flex:1 1 auto;min-height:0;overflow:auto;padding:0 16px 8px;font-size:12px;line-height:1.5;color:var(--mut)}
.fc-body p{margin:0}
.fc-foot{flex:none;display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;padding:10px 16px 14px;border-top:1px solid var(--line)}
.fc-note{font:600 10px/1.4 ui-monospace,monospace;color:var(--mut)}
.fc-cheat{display:block;width:100%;text-align:left;border:1px solid var(--line);background:#fff;border-radius:8px;padding:8px 12px;min-height:44px;margin-bottom:6px;cursor:pointer;font:inherit;color:var(--ink)}
.fc-cheat:hover{background:#f4f6fa}
.fc-cheat b{display:block;font-size:12px}
.fc-cheat span{display:block;font-size:10px;color:var(--mut)}
.fc-cheat.armed{background:#fdf3e3;border-color:var(--amber)}
.fc-help{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}
.fc-help b{display:block;margin-bottom:5px;font:700 9px/1 ui-monospace,monospace;letter-spacing:.1em;color:var(--mut);text-transform:uppercase}
.fc-help ul{margin:0 0 10px;padding-left:16px;font-size:11px;line-height:1.6}
.fc-kbd{display:inline-block;padding:1px 5px;border:1px solid var(--line);border-bottom-width:2px;border-radius:5px;background:var(--bg);color:var(--ink);font:600 10px/1.4 ui-monospace,monospace}
@media(prefers-reduced-motion:reduce){.fc *{transition:none!important;animation:none!important}}
/* --- layout overrides last (beat pointer:coarse 44px defaults) --- */
@media(max-width:640px){
.fc.game-fill>.game-panel[data-board]:not(:has(.fc-ov:not([hidden]))){flex:0 0 auto;aspect-ratio:auto}
.fc.game-fill>.game-panel[data-board]:has(.fc-ov:not([hidden])){flex:0 0 auto;min-height:min(70dvh,620px);aspect-ratio:auto}
.fc .fc-hud{gap:4px}
.fc .fc-hud .fc-chip{padding:3px 5px;font-size:8px;min-height:0}
.fc .fc-hud .fc-chip[data-hud="cheatflag"],.fc .fc-hud .fc-chip[data-hud="seat"]{display:none}
.fc .fc-hud .fc-btn{min-width:22px;width:22px;min-height:28px;padding:3px;font-size:8px;gap:0}
.fc .fc-hud .fc-icon-btn svg{width:11px;height:11px}
.fc .fc-hud .fc-seg button{min-width:28px;min-height:28px;padding:4px 5px;font-size:8px}
.fc .fc-hud .fc-btn-label,.fc .fc-hud .fc-spacer,.fc .fc-hud .fc-msg{display:none}
.fc .fc-opp{padding:6px 8px}
.fc-ov{padding:8px}
.fc-card{width:100%;height:100%;max-height:100%;padding:0}
.fc .fc-head{padding:10px 12px 6px}
.fc .fc-body{padding:0 12px 8px;scrollbar-width:none}
.fc .fc-body::-webkit-scrollbar{display:none}
.fc-help{grid-template-columns:1fr;gap:8px}
.fc-foot{padding:8px 12px 10px}
.fc-note{display:none}
}
@media(pointer:coarse){
.fc .fc-hud .fc-btn{min-width:24px;width:24px;min-height:28px;padding:4px;font-size:8px;gap:0}
.fc .fc-hud .fc-seg button{min-width:30px;min-height:28px;padding:4px 6px;font-size:8px}
.fc .fc-card .fc-btn{min-height:44px}
}
</style>
<div class="game-app fc game-fill" data-fc>
  <div class="fc-hud">
    <span class="fc-chip">DEAL <b data-hud="deal">\u2013</b></span>
    <span class="fc-chip">MOVES <b data-hud="moves">0</b></span>
    <span class="fc-chip">HOME <b data-hud="home">0</b>/52</span>
    <span class="fc-chip fc-turn" data-hud="turn">\u2013</span>
    <span class="fc-chip fc-status" data-status>Ready</span>
    <span class="fc-chip fc-cheatflag" data-hud="cheatflag" hidden>\u2605 cheats</span>
    <span class="fc-chip" data-hud="seat" hidden></span>
    <span class="fc-chip fc-msg" data-msg aria-live="polite" hidden></span>
    <span class="fc-spacer"></span>
    <div class="fc-seg" data-seg>
      <button type="button" data-mode="solo">Solo</button>
      <button type="button" data-mode="bot">Bot</button>
    </div>
    <button type="button" class="fc-btn fc-icon-btn" data-act="undo" title="Undo (U)" aria-label="Undo">${ICONS.undo}<span class="fc-btn-label">Undo</span></button>
    <button type="button" class="fc-btn fc-icon-btn" data-act="home" title="Send to foundation (F, double-click, right-click)" aria-label="Send home">${ICONS.home}<span class="fc-btn-label">Home</span></button>
    <button type="button" class="fc-btn fc-icon-btn" data-act="auto" title="Auto home (A)" aria-label="Auto home">${ICONS.auto}<span class="fc-btn-label">Auto</span></button>
    <button type="button" class="fc-btn fc-icon-btn" data-act="clear" title="Deselect (Esc)" aria-label="Deselect">${ICONS.clear}<span class="fc-btn-label">Clear</span></button>
    <button type="button" class="fc-btn fc-icon-btn" data-act="new" title="New solvable deal (N)" aria-label="New deal">${ICONS.fresh}<span class="fc-btn-label">New</span></button>
    <button class="fc-btn fc-icon-btn" type="button" data-help aria-label="How to play" title="How to play (H)">${iconSVG("helpCircle", { size: 14 })}<span class="fc-btn-label">Help</span></button>
    <button class="fc-btn fc-icon-btn" type="button" data-cheats aria-label="Cheats" title="Cheats (C)">${iconSVG("wrench", { size: 14 })}<span class="fc-btn-label">Cheats</span></button>
    <button class="fc-btn fc-icon-btn" type="button" data-pause aria-label="Pause" title="Pause (P)" ${online ? "disabled" : ""}>${iconSVG("pause", { size: 14 })}<span class="fc-btn-label">Pause</span></button>
    <button class="fc-btn fc-icon-btn" type="button" data-restart aria-label="Restart" title="Replay deal (R)">${iconSVG("refresh", { size: 14 })}<span class="fc-btn-label">Restart</span></button>
    <button class="fc-btn fc-icon-btn" type="button" data-exit aria-label="Exit game" title="Exit game">${iconSVG("logOut", { size: 14 })}<span class="fc-btn-label">Exit game</span></button>
  </div>
  <section class="game-panel fc-panel" data-board>
    <div class="fc-opp" data-opp hidden></div>
    <div class="fc-wrap" data-wrap>
      <div class="fc-board" data-fcboard tabindex="0" aria-label="FreeCell board"></div>
    </div>
    <div class="fc-ov" data-ov="cheat" hidden>
      <div class="fc-card">
        <div class="fc-head"><h3>Cheats</h3><button class="fc-btn" type="button" data-cheat-close aria-label="Close cheats">Close</button></div>
        <div class="fc-body">
          <button type="button" class="fc-cheat" data-cheat="wild"><b>Wild move</b><span>Your next placement ignores the rules.</span></button>
          <button type="button" class="fc-cheat" data-cheat="pull"><b>Pull next cards</b><span>Send each suit's next card home, even if buried.</span></button>
          <button type="button" class="fc-cheat" data-cheat="hint"><b>Hint</b><span>Highlight a strong move (G).</span></button>
          <button type="button" class="fc-cheat" data-cheat="win"><b>Instant win</b><span>Finish this deal immediately.</span></button>
        </div>
        <div class="fc-foot"><span class="fc-note">Press C or Esc to close</span></div>
      </div>
    </div>
    <div class="fc-ov" data-ov="over" hidden>
      <div class="fc-card">
        <div class="fc-head"><h3 data-el="ovTitle">You win</h3></div>
        <div class="fc-body"><p data-el="ovReason"></p></div>
        <div class="fc-foot">
          <span class="fc-note">New deal: N \u00b7 Replay: R</span>
          <button type="button" class="fc-btn primary" data-act="new">New deal</button>
          <button type="button" class="fc-btn" data-act="restart">Replay deal</button>
          <button type="button" class="fc-btn" data-act="undo" data-el="ovUndo">Undo</button>
        </div>
      </div>
    </div>
    <div class="fc-ov" data-ov="wait" hidden><div class="fc-card"><div class="fc-head"><h3>Waiting for host\u2026</h3></div></div></div>
    <div class="fc-ov" data-ov="pause" hidden>
      <div class="fc-card">
        <div class="fc-head"><h3>Paused</h3></div>
        <div class="fc-body"><p>The board, bot and timers are frozen.</p></div>
        <div class="fc-foot"><span class="fc-note">Press P or Esc to resume</span><button class="fc-btn primary" type="button" data-resume>Resume</button></div>
      </div>
    </div>
    <div class="fc-ov" data-ov="help" hidden>
      <div class="fc-card">
        <div class="fc-head"><h3>How to play</h3><button class="fc-btn" type="button" data-help-close aria-label="Close">Close</button></div>
        <div class="fc-body fc-help">
          <div>
            <b>Desktop</b>
            <ul>
              <li>Click a card or run, then click a cell, foundation or column to place it.</li>
              <li>Double-click / right-click a top card to send it home.</li>
              <li><span class="fc-kbd">\u2190 \u2191 \u2192 \u2193</span> move the cursor, <span class="fc-kbd">Enter</span> select / place, <span class="fc-kbd">1\u20138</span> jump to a column.</li>
              <li><span class="fc-kbd">U</span> undo \u00b7 <span class="fc-kbd">F</span> send home \u00b7 <span class="fc-kbd">A</span> auto home \u00b7 <span class="fc-kbd">G</span> hint</li>
              <li><span class="fc-kbd">N</span> new deal \u00b7 <span class="fc-kbd">R</span> replay \u00b7 <span class="fc-kbd">Esc</span> deselect</li>
              <li><span class="fc-kbd">H</span> help \u00b7 <span class="fc-kbd">C</span> cheats \u00b7 <span class="fc-kbd">P</span> pause</li>
            </ul>
            <b>Mobile</b>
            <ul>
              <li>Tap a card then a destination; use the HUD icons for actions.</li>
              <li>Use the Solo / Bot switch in the HUD to change mode.</li>
            </ul>
          </div>
          <div>
            <b>Rules</b>
            <ul>
              <li>Build the four foundations from Ace to King, one per suit.</li>
              <li>Tableau columns build down in alternating red / black.</li>
              <li>Only a top card, or a correctly ordered run, may move. A run's size is limited by free cells and empty columns.</li>
              <li>Deals #1\u201332000 (except #11982) are all solvable; the deal number is shown in the HUD.</li>
              <li>Play solo, race the bot, or duel a friend in an online room. Pause freezes the bot and all timers.</li>
            </ul>
            <div class="fc-foot"><span class="fc-note">Press H to reopen this guide</span><button class="fc-btn primary" type="button" data-help-close>Got it</button></div>
          </div>
        </div>
      </div>
    </div>
  </section>
</div>`;

    /* ---------- refs ---------- */
    const $ = (s) => root.querySelector(s);
    const $$ = (s) => Array.from(root.querySelectorAll(s));
    const boardEl = $("[data-fcboard]");
    const wrapEl = $("[data-wrap]");
    const oppEl = $("[data-opp]");
    const statusEl = $("[data-status]");
    const msgEl = $("[data-msg]");
    const hudDeal = $('[data-hud="deal"]');
    const hudMoves = $('[data-hud="moves"]');
    const hudHome = $('[data-hud="home"]');
    const hudTurn = $('[data-hud="turn"]');
    const cheatFlag = $('[data-hud="cheatflag"]');
    const seatChip = $('[data-hud="seat"]');
    const segEl = $("[data-seg]");
    const segBtns = $$("[data-mode]");
    const cheatsEl = $('[data-ov="cheat"]');
    const wildRow = $('[data-cheat="wild"]');
    const overEl = $('[data-ov="over"]');
    const waitEl = $('[data-ov="wait"]');
    const pauseOvEl = $('[data-ov="pause"]');
    const helpEl = $('[data-ov="help"]');
    const ovTitle = $('[data-el="ovTitle"]');
    const ovReason = $('[data-el="ovReason"]');
    const ovUndo = $('[data-el="ovUndo"]');
    const undoBtns = $$('[data-act="undo"]');
    const newBtns = $$('[data-act="new"]');
    const restartBtns = $$('[data-act="restart"]');
    const btnAuto = $('[data-act="auto"]');
    const btnHome = $('[data-act="home"]');
    const btnClear = $('[data-act="clear"]');
    const btnCheats = $("[data-cheats]");
    const pauseBtn = $("[data-pause]");
    const restartBtn = $("[data-restart]");
    function esc(s) {
        return String(s).replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
    }

    /* ---------- state ---------- */
    let localMode = mode === "solo" ? "solo" : "bot";
    let histories = [[], []];
    const botMem = { visited: new Set(), idle: 0, found: 0 };
    let rafId = 0;
    let sel = null, hint = null, wildArmed = false, kbActive = false;
    let cheatsOpen = false, helpOpen = false, paused = false;
    let cursor = { row: "col", col: 0, idx: 0 };
    let lastKey = "";

    /* Pause-aware timers: keep Date.now() due anchors and replay only the
       remaining delay on resume so the bot / hint / toast never jump ahead. */
    const timers = new Map();
    let deferredTimers = [];
    let pauseStart = 0, pauseOffset = 0;
    const perfNow = () => performance.now() - pauseOffset;
    function setT(key, fn, ms) {
        clearT(key);
        if (paused) { deferredTimers.push({ key, fn, wait: Math.max(0, ms) }); return; }
        const id = setTimeout(() => {
            timers.delete(key);
            if (!dead && !paused) fn();
        }, ms);
        timers.set(key, { id, due: Date.now() + ms, fn });
    }
    function clearT(key) {
        const rec = timers.get(key);
        if (rec) { clearTimeout(rec.id); timers.delete(key); }
        deferredTimers = deferredTimers.filter((t) => t.key !== key);
    }
    function pauseTimers() {
        const now = Date.now();
        for (const [key, rec] of timers) {
            clearTimeout(rec.id);
            deferredTimers.push({ key, fn: rec.fn, wait: Math.max(0, rec.due - now) });
        }
        timers.clear();
    }
    function resumeTimers() {
        const queue = deferredTimers;
        deferredTimers = [];
        for (const t of queue) setT(t.key, t.fn, t.wait);
    }
    function clearAllTimers() {
        for (const rec of timers.values()) clearTimeout(rec.id);
        timers.clear();
        deferredTimers = [];
    }

    let seenHelp = true;
    try { seenHelp = localStorage.getItem("freecellHelpSeen") === "1"; } catch (_) { seenHelp = true; }
    if (!seenHelp) {
        helpOpen = true;
        try { localStorage.setItem("freecellHelpSeen", "1"); } catch (_) { /* storage blocked */ }
    }

    function freshPlayer(deal) {
        return {
            cols: dealFromNumber(deal), free: [null, null, null, null], found: [null, null, null, null],
            moves: 0, stuck: false, resigned: false, cheated: false,
        };
    }
    function initState(deal, m) {
        const first = Math.random() < 0.5 ? 0 : 1;                   /* random first mover */
        const hostSeat = online ? (Math.random() < 0.5 ? 0 : 1) : 0; /* random seats online */
        return {
            deal, mode: m, hostSeat, first, turn: first, phase: "play", winner: null, reason: "",
            players: [freshPlayer(deal), m === "solo" ? null : freshPlayer(deal)],
        };
    }
    function mySeat() {
        if (!online) return 0;
        if (!state) return room.isHost ? 0 : 1;
        return room.isHost ? state.hostSeat : 1 - state.hostSeat;
    }
    function turnBased() { return !!state && state.mode !== "solo"; }
    function myTurn() { return !!state && state.phase === "play" && (!turnBased() || state.turn === mySeat()); }
    function canNew() { return !!state && (!online || state.phase === "over" || mySeat() === state.hostSeat); }
    function canUndo() {
        if (!state) return false;
        const seat = mySeat();
        const p = state.players[seat];
        const have = online && !room.isHost ? !!(p && p.moves > 0) : histories[seat].length > 0;
        if (!have) return false;
        if (state.phase === "over") return !online && state.winner !== 0;
        return state.mode === "solo" || state.turn === seat || !!(p && p.stuck);
    }
    function dealKey(s) { return s ? s.deal + ":" + s.first + ":" + s.hostSeat + ":" + s.mode : ""; }
    function pushHist(seat) {
        const p = state.players[seat];
        histories[seat].push({
            cols: p.cols.map((c) => c.slice()), free: p.free.slice(), found: p.found.slice(),
            moves: p.moves, stuck: p.stuck, resigned: p.resigned, cheated: p.cheated,
        });
        if (histories[seat].length > 200) histories[seat].shift();
    }
    function resetClient() {
        sel = null; hint = null; wildArmed = false; cheatsOpen = false;
        const me = state ? state.players[mySeat()] : null;
        cursor = { row: "col", col: 0, idx: me ? Math.max(0, me.cols[0].length - 1) : 0 };
        clearT("hint");
        clearT("msg");
        msgEl.textContent = "";
        msgEl.hidden = true;
        cheatsEl.hidden = true;
    }
    function flash(text) {
        msgEl.textContent = text;
        msgEl.hidden = !text;
        clearT("msg");
        setT("msg", () => { msgEl.textContent = ""; msgEl.hidden = true; }, 2400);
    }
    function announce() {
        if (!state) return;
        if (state.mode === "solo") { flash("Deal #" + state.deal); return; }
        const first = state.first;
        const who = first === mySeat() ? "you" : state.mode === "bot" ? "the bot" : "Player " + (first + 1);
        let t = "Coin flip: " + who + (who === "you" ? " start" : " starts");
        if (online) t += " \u00b7 you are P" + (mySeat() + 1);
        flash(t);
    }

    /* ---------- move plumbing ---------- */
    function cardsAt(p, from, wild) {
        if (!from) return null;
        if (from.zone === "col") {
            const col = p.cols[from.col];
            if (!col || from.idx < 0 || from.idx >= col.length) return null;
            if (!wild) {
                for (let j = from.idx; j < col.length - 1; j++) {
                    const a = col[j], b = col[j + 1];
                    if (b.r !== a.r - 1 || isRed(b.s) === isRed(a.s)) return null;
                }
            }
            return col.slice(from.idx);
        }
        if (from.zone === "cell") {
            const c = p.free[from.cell];
            return c ? [c] : null;
        }
        return null;
    }
    function destOk(p, from, cards, to, wild) {
        if (!to || !cards || !cards.length) return false;
        if (to.zone === "col") {
            if (from.zone === "col" && from.col === to.col) return false;
            const dest = p.cols[to.col];
            if (!dest) return false;
            if (!wild && cards.length > moveLimit(p, to.col)) return false;
            return wild || canTableau(cards[0], dest.length ? dest[dest.length - 1] : null);
        }
        if (to.zone === "cell") return cards.length === 1 && !p.free[to.cell];
        if (to.zone === "found") {
            if (cards.length !== 1) return false;
            if (to.fi >= 0) return canFoundation(cards[0], p.found[to.fi]);
            return fitFound(p, cards[0]) >= 0;
        }
        return false;
    }
    function removeFrom(p, from, count) {
        if (from.zone === "col") p.cols[from.col].splice(from.idx, count);
        else if (from.zone === "cell") p.free[from.cell] = null;
    }
    function placeTo(p, to, cards) {
        if (to.zone === "col") { for (const c of cards) p.cols[to.col].push(c); }
        else if (to.zone === "cell") p.free[to.cell] = cards[0];
        else if (to.zone === "found") {
            let fi = to.fi;
            if (fi < 0) fi = fitFound(p, cards[0]);
            p.found[fi] = cards[0];
        }
    }
    function scoreEnd() {
        const a = state.players[0], b = state.players[1];
        const fa = foundTotal(a), fb = foundTotal(b);
        let w;
        if (fa !== fb) w = fa > fb ? 0 : 1;
        else if (a.moves !== b.moves) w = a.moves < b.moves ? 0 : 1;
        else w = -1;
        state.phase = "over";
        state.winner = w;
        state.reason = "Both boards locked \u2014 home " + fa + " vs " + fb + ".";
    }
    function afterMove(actor) {
        const p = state.players[actor];
        if (foundTotal(p) === 52) {
            state.phase = "over"; state.winner = actor; state.reason = "All 52 cards are home.";
            return;
        }
        if (state.mode === "solo") {
            p.stuck = isStuck(p);
            if (p.stuck) { state.phase = "over"; state.winner = 1; state.reason = "No legal move remains."; }
            return;
        }
        const opp = state.players[1 - actor];
        p.stuck = isStuck(p);
        opp.stuck = opp.resigned || isStuck(opp);
        const meOut = p.stuck || p.resigned, oppOut = opp.stuck || opp.resigned;
        if (meOut && oppOut) { scoreEnd(); return; }
        state.turn = oppOut ? actor : 1 - actor;
    }

    /* ---------- host-authoritative actions ---------- */
    function applyAction(a, actor) {
        if (dead || !state || !a) return;
        const t = a.t;
        if (t === "new" || t === "restart") {
            if (online && state.phase !== "over" && actor !== state.hostSeat) return;
            const deal = t === "restart" ? state.deal : randomDeal();
            const m = online ? "duel" : localMode;
            histories = [[], []];
            botMem.visited = new Set(); botMem.idle = 0; botMem.found = 0;
            state = initState(deal, m);
            lastKey = dealKey(state);
            resetClient();
            publish();
            announce();
            return;
        }
        if (t === "undo") {
            const overLocal = state.phase === "over" && !online && state.winner !== 0;
            if (state.phase === "play") {
                const p = state.players[actor];
                if (turnBased() && actor !== state.turn && !(p && p.stuck)) return;
            } else if (!overLocal) return;
            const h = histories[actor];
            if (!h || !h.length) return;
            state.players[actor] = h.pop();
            state.phase = "play"; state.winner = null; state.reason = "";
            if (turnBased()) state.turn = actor;
            publish();
            return;
        }
        if (state.phase !== "play") return;
        if (t === "pass") {
            if (state.mode !== "bot" || actor !== 1) return;
            state.players[1].resigned = true;
            state.turn = 0;
            if (isStuck(state.players[0])) scoreEnd();
            publish();
            return;
        }
        if (turnBased() && actor !== state.turn) return;
        if (state.mode === "solo" && actor !== 0) return;
        const p = state.players[actor];
        if (!p) return;
        if (t === "move") {
            const cards = cardsAt(p, a.from, a.wild);
            if (!cards || !destOk(p, a.from, cards, a.to, a.wild)) return;
            pushHist(actor);
            removeFrom(p, a.from, cards.length);
            placeTo(p, a.to, cards);
            p.moves++;
            if (a.wild) p.cheated = true;
            afterMove(actor);
            publish();
            return;
        }
        if (t === "auto") {
            pushHist(actor);
            let n = 0;
            for (; ;) {
                let moved = false;
                for (let c = 0; c < 8; c++) {
                    const col = p.cols[c];
                    if (!col.length) continue;
                    const card = col[col.length - 1], fi = fitFound(p, card);
                    if (fi >= 0) { col.pop(); p.found[fi] = card; n++; moved = true; }
                }
                for (let i = 0; i < 4; i++) {
                    const card = p.free[i];
                    if (!card) continue;
                    const fi = fitFound(p, card);
                    if (fi >= 0) { p.free[i] = null; p.found[fi] = card; n++; moved = true; }
                }
                if (!moved) break;
            }
            if (!n) { histories[actor].pop(); return; }
            p.moves += n;
            afterMove(actor);
            publish();
            return;
        }
        if (t === "pull") {
            pushHist(actor);
            let n = 0;
            for (let s = 0; s < 4; s++) {
                const si = suitSlot(p, s);
                const need = si >= 0 ? p.found[si].r + 1 : 1;
                if (need > 13) continue;
                let got = false;
                for (let c = 0; c < 8 && !got; c++) {
                    const col = p.cols[c];
                    for (let i = 0; i < col.length; i++) {
                        if (col[i].s === s && col[i].r === need) { col.splice(i, 1); got = true; break; }
                    }
                }
                if (!got) {
                    for (let i = 0; i < 4; i++) {
                        const f = p.free[i];
                        if (f && f.s === s && f.r === need) { p.free[i] = null; got = true; break; }
                    }
                }
                if (!got) continue;
                const slot = si >= 0 ? si : firstEmptyFound(p);
                if (slot < 0) continue;
                p.found[slot] = { s, r: need };
                n++;
            }
            if (!n) { histories[actor].pop(); return; }
            p.moves += n;
            p.cheated = true;
            afterMove(actor);
            publish();
            return;
        }
        if (t === "win") {
            pushHist(actor);
            for (let s = 0; s < 4; s++) {
                const si = suitSlot(p, s);
                const slot = si >= 0 ? si : firstEmptyFound(p);
                if (slot >= 0) p.found[slot] = { s, r: 13 };
            }
            p.moves++;
            p.cheated = true;
            afterMove(actor);
            publish();
            return;
        }
    }
    function publish() {
        render();
        if (online && room.isHost) {
            const r = room.publishState(state);
            if (r && typeof r.catch === "function") r.catch(console.warn);
        }
        maybeBot();
    }
    function submitAction(a) {
        if (dead) return;
        if (online && !room.isHost) {
            const r = room.sendAction(a);
            if (r && typeof r.catch === "function") r.catch(console.warn);
            return;
        }
        applyAction(a, mySeat());
    }

    /* ---------- bot ---------- */
    function maybeBot() {
        clearT("bot");
        if (dead || online || !state || state.mode !== "bot" || state.phase !== "play" || state.turn !== 1) return;
        setT("bot", () => botStep(), 550 + Math.random() * 450);
    }
    function botStep() {
        if (dead || !state || state.mode !== "bot" || state.phase !== "play" || state.turn !== 1) return;
        const p = state.players[1];
        const f = foundTotal(p);
        if (f > botMem.found) { botMem.found = f; botMem.idle = 0; } else botMem.idle++;
        if (botMem.visited.size > 5000) botMem.visited.clear();
        if (botMem.idle > 120) { applyAction({ t: "pass" }, 1); return; }
        const mv = botChoose(p, botMem.visited);
        if (!mv) { applyAction({ t: "pass" }, 1); return; }
        applyAction(mv, 1);
    }
    /* Compact card ids for the bot: id = s*13 + (r-1). */
    const RANKS = [], SUITS = [], REDS = [];
    for (let i = 0; i < 52; i++) { RANKS.push(i % 13 + 1); SUITS.push((i / 13) | 0); REDS.push(SUITS[i] === 1 || SUITS[i] === 2); }
    function cid(c) { return c.s * 13 + (c.r - 1); }
    function canTabI(m, o) { return o < 0 || (RANKS[m] === RANKS[o] - 1 && REDS[m] !== REDS[o]); }
    function canFndI(c, t) { return t < 0 ? RANKS[c] === 1 : (SUITS[c] === SUITS[t] && RANKS[c] === RANKS[t] + 1); }
    function fitFndI(found, c) { for (let i = 0; i < 4; i++) if (canFndI(c, found[i])) return i; return -1; }
    function ftotalI(found) { let n = 0; for (const f of found) if (f >= 0) n += RANKS[f]; return n; }
    function compact(p) {
        return {
            cols: p.cols.map((col) => col.map(cid)),
            free: p.free.map((c) => (c ? cid(c) : -1)),
            found: p.found.map((c) => (c ? cid(c) : -1)),
        };
    }
    function cloneI(st) { return { cols: st.cols.map((c) => c.slice()), free: st.free.slice(), found: st.found.slice() }; }
    function sigI(st) { return st.cols.map((c) => c.join(",")).join("|") + ";" + st.free.join(",") + ";" + st.found.join(","); }
    function applyI(st, m) {
        const q = cloneI(st);
        const fz = m[0], fi = m[1], tz = m[2], ti = m[3], idx = m[4];
        let cards;
        if (fz === 0) cards = q.cols[fi].splice(idx);
        else { cards = [q.free[fi]]; q.free[fi] = -1; }
        if (tz === 0) { for (const c of cards) q.cols[ti].push(c); }
        else if (tz === 1) q.free[ti] = cards[0];
        else q.found[ti] = cards[0];
        return q;
    }
    function sweepI(st) {
        for (; ;) {
            let moved = false;
            for (let c = 0; c < 8; c++) {
                const col = st.cols[c];
                if (!col.length) continue;
                const card = col[col.length - 1], fi = fitFndI(st.found, card);
                if (fi >= 0) { col.pop(); st.found[fi] = card; moved = true; break; }
            }
            if (moved) continue;
            for (let i = 0; i < 4; i++) {
                const card = st.free[i];
                if (card < 0) continue;
                const fi = fitFndI(st.found, card);
                if (fi >= 0) { st.free[i] = -1; st.found[fi] = card; moved = true; break; }
            }
            if (!moved) break;
        }
        return st;
    }
    function genI(st) {
        const cols = st.cols, free = st.free, found = st.found, out = [];
        let fc = 0, ec = 0;
        for (const f of free) if (f < 0) fc++;
        for (const c of cols) if (!c.length) ec++;
        const tops = [];
        for (let c = 0; c < 8; c++) if (cols[c].length) tops.push([c, cols[c][cols[c].length - 1]]);
        for (const t of tops) { const fi = fitFndI(found, t[1]); if (fi >= 0) out.push([0, t[0], 2, fi, cols[t[0]].length - 1]); }
        for (let i = 0; i < 4; i++) if (free[i] >= 0) { const fi = fitFndI(found, free[i]); if (fi >= 0) out.push([1, i, 2, fi, -1]); }
        for (const t of tops) {
            const c = t[0], col = cols[c];
            let m0 = col.length - 1;
            while (m0 > 0) { const b = col[m0 - 1], a = col[m0]; if (RANKS[a] !== RANKS[b] - 1 || REDS[a] === REDS[b]) break; m0--; }
            for (let idx = m0; idx < col.length; idx++) {
                const head = col[idx], rl = col.length - idx;
                for (let d = 0; d < 8; d++) {
                    if (d === c) continue;
                    const onto = cols[d].length ? cols[d][cols[d].length - 1] : -1;
                    if (!canTabI(head, onto)) continue;
                    const eff = ec - (cols[d].length ? 0 : 1);
                    if (rl > (1 + fc) * Math.pow(2, eff)) continue;
                    if (onto < 0 && idx === 0) continue;
                    out.push([0, c, 0, d, idx]);
                }
            }
        }
        for (let i = 0; i < 4; i++) {
            if (free[i] < 0) continue;
            for (let d = 0; d < 8; d++) { const onto = cols[d].length ? cols[d][cols[d].length - 1] : -1; if (canTabI(free[i], onto)) out.push([1, i, 0, d, -1]); }
        }
        if (fc > 0) {
            let cell = -1;
            for (let i = 0; i < 4; i++) if (free[i] < 0) { cell = i; break; }
            for (const t of tops) out.push([0, t[0], 1, cell, cols[t[0]].length - 1]);
        }
        return out;
    }
    function scoreI(st) {
        let fc = 0, ec = 0;
        for (const f of st.free) if (f < 0) fc++;
        for (const c of st.cols) if (!c.length) ec++;
        return ftotalI(st.found) * 100 + fc * 10 + ec * 15;
    }
    function toAction(m) {
        const from = m[0] === 0 ? { zone: "col", col: m[1], idx: m[4] } : { zone: "cell", cell: m[1] };
        const to = m[2] === 0 ? { zone: "col", col: m[3] } : m[2] === 1 ? { zone: "cell", cell: m[3] } : { zone: "found", fi: m[3] };
        return { t: "move", from, to };
    }
    /* Casual heuristic bot: 1-ply lookahead + foundation sweep + loop avoidance.
       Replace botChoose with a full FreeCell solver for a stronger opponent. */
    function botChoose(p, visited) {
        const st = compact(p);
        const cands = genI(st);
        for (let i = cands.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; const t = cands[i]; cands[i] = cands[j]; cands[j] = t; }
        let best = null, bestSc = -Infinity, bestKey = "";
        for (const m of cands) {
            const q0 = applyI(st, m);
            const key = sigI(q0);
            if (visited && visited.has(key)) continue;
            const sc = scoreI(sweepI(q0));
            if (sc > bestSc) { bestSc = sc; best = m; bestKey = key; }
        }
        if (!best) return null;
        if (visited) visited.add(bestKey);
        return toAction(best);
    }

    /* ---------- client input helpers ---------- */
    function selFrom() { return sel.src === "col" ? { zone: "col", col: sel.col, idx: sel.idx } : { zone: "cell", cell: sel.cell }; }
    function tryMove(from, to) {
        if (!myTurn()) { flash("Wait for your turn."); return false; }
        const p = state.players[mySeat()];
        const cards = cardsAt(p, from, wildArmed);
        if (!cards) { flash("A run must descend in alternating colors."); return false; }
        if (!destOk(p, from, cards, to, wildArmed)) {
            if (to.zone === "cell" && cards.length > 1) flash("A free cell holds a single card.");
            else if (to.zone === "found") flash("Foundations build up by suit from the Ace.");
            else if (to.zone === "col" && !wildArmed && cards.length > moveLimit(p, to.col)) flash("You can move at most " + moveLimit(p, to.col) + " card(s) right now.");
            else flash("That spot does not accept these cards.");
            return false;
        }
        const wild = wildArmed;
        sel = null; wildArmed = false; hint = null;
        submitAction({ t: "move", from, to, wild });
        render();
        return true;
    }
    function sendHome(from) {
        if (!myTurn()) { flash("Wait for your turn."); return; }
        const p = state.players[mySeat()];
        const cards = cardsAt(p, from, false);
        if (!cards || cards.length !== 1) { flash("Only a single top card can go home."); return; }
        const fi = fitFound(p, cards[0]);
        if (fi < 0) { flash("That card cannot go home yet."); return; }
        sel = null; wildArmed = false; hint = null;
        submitAction({ t: "move", from, to: { zone: "found", fi } });
        render();
    }
    function doAuto() {
        if (!myTurn()) { flash("Wait for your turn."); return; }
        const p = state.players[mySeat()];
        let any = false;
        for (const col of p.cols) if (col.length && fitFound(p, col[col.length - 1]) >= 0) any = true;
        for (const f of p.free) if (f && fitFound(p, f) >= 0) any = true;
        if (!any) { flash("Nothing can go home yet."); return; }
        sel = null; hint = null;
        submitAction({ t: "auto" });
        render();
    }
    function selectRun(ci, idx) {
        const col = state.players[mySeat()].cols[ci];
        if (idx < 0 || idx >= col.length) return;
        if (!wildArmed) {
            for (let j = idx; j < col.length - 1; j++) {
                const a = col[j], b = col[j + 1];
                if (b.r !== a.r - 1 || isRed(b.s) === isRed(a.s)) { flash("A run must descend in alternating colors."); return; }
            }
        }
        sel = { src: "col", col: ci, idx, cell: -1, cards: col.slice(idx) };
        render();
    }
    function cellClick(i) {
        const p = state.players[mySeat()];
        if (p.free[i]) {
            if (sel && sel.src === "cell" && sel.cell === i) sel = null;
            else sel = { src: "cell", col: -1, idx: -1, cell: i, cards: [p.free[i]] };
            render();
            return;
        }
        if (sel) tryMove(selFrom(), { zone: "cell", cell: i });
    }
    function foundationClick(fi) { if (sel) tryMove(selFrom(), { zone: "found", fi }); }
    function colCardClick(ci, idx) {
        if (sel) {
            const sameCol = sel.src === "col" && sel.col === ci;
            if (sameCol && sel.idx === idx) { sel = null; render(); return; }
            if (!sameCol && tryMove(selFrom(), { zone: "col", col: ci })) return;
            selectRun(ci, idx);
        } else selectRun(ci, idx);
    }
    function colBaseClick(ci) {
        if (!sel) return;
        if (sel.src === "col" && sel.col === ci) { sel = null; render(); return; }
        tryMove(selFrom(), { zone: "col", col: ci });
    }
    function homeFromSelOrCursor() {
        if (!state || state.phase !== "play") return;
        if (sel) { sendHome(selFrom()); return; }
        const p = state.players[mySeat()];
        if (cursor.row === "col") {
            const col = p.cols[cursor.col];
            if (col.length) sendHome({ zone: "col", col: cursor.col, idx: col.length - 1 });
        } else if (cursor.col < 4 && p.free[cursor.col]) {
            sendHome({ zone: "cell", cell: cursor.col });
        }
    }
    function doHint() {
        if (!state || state.phase !== "play") return;
        const mv = botChoose(state.players[mySeat()], null);
        if (!mv) { flash("No productive move found \u2014 try undo."); return; }
        hint = { from: mv.from, to: mv.to };
        clearT("hint");
        setT("hint", () => { hint = null; render(); }, 2000);
        render();
    }
    function runCheat(kind) {
        if (!state || state.phase !== "play") { cheatsOpen = false; cheatsEl.hidden = true; return; }
        if (kind === "wild") {
            wildArmed = !wildArmed;
            cheatsOpen = false; cheatsEl.hidden = true;
            flash(wildArmed ? "Wild move armed \u2014 your next placement ignores the rules." : "Wild move cancelled.");
            render();
            return;
        }
        cheatsOpen = false; cheatsEl.hidden = true;
        if (kind === "hint") { doHint(); return; }
        if (!myTurn()) { flash("Wait for your turn."); return; }
        if (kind === "pull") { sel = null; submitAction({ t: "pull" }); render(); return; }
        if (kind === "win") { sel = null; submitAction({ t: "win" }); render(); return; }
    }

    /* ---------- rendering ---------- */
    function metrics(maxN) {
        const w = Math.max(280, wrapEl.clientWidth || 640);
        const availH = wrapEl.clientHeight || 0;
        const pad = w < 460 ? 8 : 14;
        const gap = w < 460 ? 5 : 8;
        let cw = Math.floor((w - pad * 2 - gap * 7) / 8);
        cw = Math.max(30, Math.min(78, cw));
        const n = Math.max(1, maxN || 1);
        const heightFor = (width) => {
            const ch = Math.round(width * 1.42);
            const stackH = n ? stackOffset(n, ch) * (n - 1) + ch : ch;
            return pad * 2 + ch + Math.round(gap * 1.6) + stackH;
        };
        /* Keep the whole 8-column layout proportional and inside the flex board. */
        if (availH > 240) {
            for (let i = 0; i < 4 && heightFor(cw) > availH - 8; i++) {
                cw = Math.max(18, Math.floor(cw * ((availH - 8) / heightFor(cw))));
            }
        }
        const ch = Math.round(cw * 1.42);
        return { pad, gap, cw, ch, pitch: cw + gap, topY: pad, colY: pad + ch + Math.round(gap * 1.6), boardW: pad * 2 + cw * 8 + gap * 7 };
    }
    function suitSVG(s, size) {
        return '<svg viewBox="0 0 24 24" width="' + size + '" height="' + size + '" aria-hidden="true"><g fill="currentColor">' + SUIT_MARK[SUIT_KEYS[s]] + "</g></svg>";
    }
    function cardHTML(card, x, y, m, attrs, cls) {
        const color = isRed(card.s) ? RED : BLK;
        const rk = Math.max(10, Math.round(m.cw * 0.26));
        const cs = Math.round(m.cw * 0.24);
        const pip = Math.round(m.cw * 0.6);
        const left = Math.max(3, Math.round(m.cw * 0.07));
        const top = Math.round(m.ch * 0.05);
        return '<div class="card ' + (cls || "") + '" style="left:' + x + "px;top:" + y + "px;width:" + m.cw + "px;height:" + m.ch + "px;color:" + color + '"' + (attrs || "") + ">"
            + '<span class="rk" style="left:' + left + "px;top:" + top + "px;font-size:" + rk + 'px">' + rankLabel(card.r) + "</span>"
            + '<span class="cs" style="left:' + left + "px;top:" + (top + rk + 2) + 'px">' + suitSVG(card.s, cs) + "</span>"
            + '<span class="pip">' + suitSVG(card.s, pip) + "</span></div>";
    }
    function slotHTML(x, y, w, h, attrs, lab, cls) {
        return '<div class="slot ' + (cls || "") + '" style="left:' + x + "px;top:" + y + "px;width:" + w + "px;height:" + h + 'px"' + (attrs || "") + ">"
            + (lab ? '<span class="lab">' + lab + "</span>" : "") + "</div>";
    }
    function hintFrom(zone, col, idx, cell) {
        if (!hint || !hint.from) return false;
        const f = hint.from;
        if (zone === "col") return f.zone === "col" && f.col === col && idx >= f.idx;
        if (zone === "cell") return f.zone === "cell" && f.cell === cell;
        return false;
    }
    function hintTo(zone, col, fi, cell) {
        if (!hint || !hint.to) return false;
        const t = hint.to;
        if (zone === "col") return t.zone === "col" && t.col === col;
        if (zone === "found") return t.zone === "found" && (t.fi === fi || t.fi < 0);
        if (zone === "cell") return t.zone === "cell" && t.cell === cell;
        return false;
    }
    function curMatch(zone, col, idx) {
        if (!kbActive) return false;
        if (cursor.row === "top") {
            return (zone === "cell" && cursor.col < 4 && col === cursor.col) || (zone === "found" && cursor.col >= 4 && col === cursor.col - 4);
        }
        return zone === "col" && col === cursor.col && idx === cursor.idx;
    }
    function stackOffset(n, ch) {
        if (n < 2) return 0;
        return Math.min(Math.round(ch * 0.3), Math.max(Math.round(ch * 0.16), Math.floor((ch * 2.7) / (n - 1))));
    }
    function renderBoard() {
        if (!state) { boardEl.innerHTML = ""; boardEl.style.width = "100%"; boardEl.style.height = "320px"; return; }
        const p = state.players[mySeat()];
        const maxN = p.cols.reduce((n, col) => Math.max(n, col.length), 1);
        const m = metrics(maxN);
        let h = "";
        const cellIcon = '<svg viewBox="0 0 24 24" width="' + Math.round(m.cw * 0.34) + '" height="' + Math.round(m.cw * 0.34) + '" fill="none" stroke="currentColor" stroke-width="2"><rect x="5" y="5" width="14" height="14" rx="3"/></svg>';
        for (let i = 0; i < 4; i++) {
            const x = m.pad + i * m.pitch;
            const at = ' data-zone="cell" data-cell="' + i + '"';
            if (p.free[i]) {
                const cls = (sel && sel.src === "cell" && sel.cell === i ? "sel " : "") + (hintFrom("cell", -1, -1, i) ? "hint " : "") + (curMatch("cell", i, -1) ? "cur" : "");
                h += cardHTML(p.free[i], x, m.topY, m, at, cls);
            } else {
                const cls = (hintTo("cell", -1, -1, i) ? "hint " : "") + (curMatch("cell", i, -1) ? "cur" : "");
                h += slotHTML(x, m.topY, m.cw, m.ch, at, cellIcon, cls);
            }
        }
        for (let i = 0; i < 4; i++) {
            const x = m.pad + (4 + i) * m.pitch;
            const at = ' data-zone="found" data-fi="' + i + '"';
            const cls = (hintTo("found", -1, i, -1) ? "hint " : "") + (curMatch("found", i, -1) ? "cur" : "");
            if (p.found[i]) h += cardHTML(p.found[i], x, m.topY, m, at, cls);
            else h += slotHTML(x, m.topY, m.cw, m.ch, at, "A", cls);
        }
        let maxBottom = m.ch;
        for (let c = 0; c < 8; c++) {
            const col = p.cols[c], x = m.pad + c * m.pitch, n = col.length;
            const off = stackOffset(n, m.ch);
            const stackH = n ? off * (n - 1) + m.ch : m.ch;
            if (stackH > maxBottom) maxBottom = stackH;
            let baseCls = "colbase" + (n ? "" : " empty");
            if (hintTo("col", c, -1, -1)) baseCls += " hint";
            if (!n && kbActive && cursor.row === "col" && cursor.col === c) baseCls += " cur";
            h += slotHTML(x, m.colY, m.cw, stackH, ' data-zone="colbase" data-col="' + c + '"', "", baseCls);
            for (let i = 0; i < n; i++) {
                const inSel = sel && sel.src === "col" && sel.col === c && i >= sel.idx;
                const cls = (inSel ? "sel " : "") + (hintFrom("col", c, i, -1) ? "hint " : "") + (i === n - 1 && hintTo("col", c, -1, -1) ? "hint " : "") + (curMatch("col", c, i) ? "cur" : "");
                h += cardHTML(col[i], x, m.colY + off * i, m, ' data-zone="col" data-col="' + c + '" data-idx="' + i + '"', cls);
            }
        }
        boardEl.style.width = m.boardW + "px";
        boardEl.style.height = m.colY + maxBottom + m.pad + "px";
        boardEl.classList.toggle("wild", wildArmed);
        boardEl.innerHTML = h;
    }
    function renderOpp() {
        if (!state || state.mode === "solo" || !state.players[1]) { oppEl.hidden = true; return; }
        oppEl.hidden = false;
        const seat = 1 - mySeat();
        const p = state.players[seat];
        const label = state.mode === "bot" ? "Bot" : "Player " + (seat + 1);
        const home = foundTotal(p);
        const active = state.phase === "play" && state.turn === seat;
        const tag = p.resigned ? "resigned" : p.stuck ? "locked" : "";
        const w = Math.max(280, wrapEl.clientWidth || 640);
        const mcw = Math.max(18, Math.min(30, Math.floor((w - 16 - 28) / 8)));
        const mh = Math.round(mcw * 1.35);
        let mini = "";
        for (let c = 0; c < 8; c++) {
            const col = p.cols[c];
            const off = col.length > 1 ? Math.min(Math.round(mh * 0.34), Math.max(7, Math.floor(72 / (col.length - 1)))) : 0;
            const hgt = col.length ? off * (col.length - 1) + mh : mh;
            let cards = "";
            for (let i = 0; i < col.length; i++) {
                const cd = col[i];
                cards += '<span class="fc-mini-card" style="top:' + off * i + "px;color:" + (isRed(cd.s) ? RED : BLK) + '">' + rankLabel(cd.r) + SUIT_CHAR[cd.s] + "</span>";
            }
            mini += '<div class="fc-mini-col" style="height:' + hgt + 'px">' + cards + "</div>";
        }
        oppEl.innerHTML = '<div class="fc-opp-head"><b class="' + (active ? "on" : "") + '">' + esc(label) + (active ? " \u25cf" : "") + "</b><span>Home " + home + "/52</span><span>Moves " + p.moves + "</span><span>Cells " + freeCount(p) + "/4</span>"
            + (tag ? "<span>" + tag + "</span>" : "") + (p.cheated ? "<span>\u2605</span>" : "")
            + '</div><div class="fc-opp-bar"><i style="width:' + Math.round((home / 52) * 100) + '%"></i></div><div class="fc-mini">' + mini + "</div>";
    }
    function statusText() {
        if (!state) return "Waiting for host";
        if (state.phase === "over") {
            if (state.mode === "solo") return state.winner === 0 ? "You win" : "No more moves";
            if (state.winner === -1) return "Draw";
            return state.winner === mySeat() ? "You win" : state.mode === "bot" ? "Bot wins" : "Opponent wins";
        }
        if (state.mode === "solo") return "Playing";
        if (state.turn === mySeat()) return "Your turn";
        return state.mode === "bot" ? "Bot is thinking" : "Opponent's turn";
    }
    function turnText() {
        if (!state) return "\u2013";
        if (state.phase === "over") return "Finished";
        if (state.mode === "solo") return "Solo";
        return state.turn === mySeat() ? "Your turn" : state.mode === "bot" ? "Bot's turn" : "P" + (state.turn + 1) + "'s turn";
    }
    function fillOver() {
        const win = state.winner === mySeat() || (state.mode === "solo" && state.winner === 0);
        ovTitle.textContent = statusText();
        ovTitle.className = win ? "win" : "";
        const me = state.players[mySeat()];
        let r = state.reason + " You made " + me.moves + " moves on deal #" + state.deal + ".";
        if (me.cheated) r += " (cheats used)";
        ovReason.textContent = r;
        ovUndo.hidden = !canUndo();
    }
    function render() {
        if (dead) return;
        const me = state ? state.players[mySeat()] : null;
        hudDeal.textContent = state ? "#" + state.deal : "\u2013";
        hudMoves.textContent = me ? String(me.moves) : "0";
        hudHome.textContent = me ? String(foundTotal(me)) : "0";
        hudTurn.textContent = turnText();
        cheatFlag.hidden = !(me && me.cheated);
        segEl.hidden = online;
        segBtns.forEach((b) => b.classList.toggle("on", b.getAttribute("data-mode") === localMode));
        seatChip.hidden = !online;
        if (online) { seatChip.textContent = "You \u00b7 P" + (mySeat() + 1); seatChip.title = esc(playerName); }
        statusEl.textContent = statusText();
        const play = !!state && state.phase === "play";
        const cn = canNew();
        newBtns.forEach((b) => { b.disabled = !cn; });
        restartBtns.forEach((b) => { b.disabled = !cn; });
        undoBtns.forEach((b) => { b.disabled = !canUndo(); });
        btnAuto.disabled = !myTurn();
        btnHome.disabled = !myTurn();
        btnClear.disabled = !sel && !wildArmed;
        btnCheats.disabled = !play;
        btnCheats.classList.toggle("armed", wildArmed || cheatsOpen);
        restartBtn.disabled = !cn;
        wildRow.classList.toggle("armed", wildArmed);
        renderOpp();
        renderBoard();
        syncUI();
    }

    /* Overlays suppress each other: help > cheats > pause > result/wait.
       Pause labels update the span only, so the icon is never destroyed. */
    function syncUI() {
        const isOver = !!state && state.phase === "over";
        if (isOver && cheatsOpen) cheatsOpen = false;
        if (isOver) fillOver();
        overEl.hidden = !isOver || cheatsOpen || helpOpen || paused;
        waitEl.hidden = !(online && !state) || cheatsOpen || helpOpen || paused;
        pauseOvEl.hidden = !paused || cheatsOpen || helpOpen;
        cheatsEl.hidden = !cheatsOpen || helpOpen;
        helpEl.hidden = !helpOpen;
        if (pauseBtn) {
            const label = pauseBtn.querySelector(".fc-btn-label");
            if (label) label.textContent = paused ? "Resume" : "Pause";
            pauseBtn.setAttribute("aria-label", paused ? "Resume" : "Pause");
        }
    }

    function toggleHelp(on) {
        helpOpen = typeof on === "boolean" ? on : !helpOpen;
        if (helpOpen) cheatsOpen = false;
        render();
    }

    function togglePause(on) {
        if (online) return;
        const next = typeof on === "boolean" ? on : !paused;
        if (next === paused) return;
        paused = next;
        if (paused) { pauseStart = performance.now(); pauseTimers(); }
        else {
            if (pauseStart) pauseOffset += performance.now() - pauseStart;
            pauseStart = 0;
            resumeTimers();
        }
        render();
    }

    /* ---------- events ---------- */
    function zoneClick(el) {
        const z = el.getAttribute("data-zone");
        if (z === "cell") cellClick(+el.getAttribute("data-cell"));
        else if (z === "found") foundationClick(+el.getAttribute("data-fi"));
        else if (z === "col") colCardClick(+el.getAttribute("data-col"), +el.getAttribute("data-idx"));
        else if (z === "colbase") colBaseClick(+el.getAttribute("data-col"));
    }
    function handleClick(e) {
        const t = e.target;
        const blocked = () => helpOpen || cheatsOpen || paused;
        if (t.closest("[data-exit]")) { onExit(); return; }
        if (t.closest("[data-help]")) { toggleHelp(); return; }
        if (t.closest("[data-help-close]")) { toggleHelp(false); return; }
        if (t.closest("[data-cheats]")) {
            if (!blocked() && state && state.phase === "play") { cheatsOpen = true; render(); }
            return;
        }
        if (t.closest("[data-cheat-close]")) { cheatsOpen = false; render(); return; }
        if (t.closest("[data-pause]")) { togglePause(); return; }
        if (t.closest("[data-resume]")) { togglePause(false); return; }
        if (t.closest("[data-restart]")) {
            if (!blocked() && canNew()) submitAction({ t: "restart" });
            return;
        }
        const actEl = t.closest("[data-act]");
        if (actEl) {
            if (actEl.disabled) return;
            const act = actEl.getAttribute("data-act");
            if (act === "undo") { if (blocked()) return; submitAction({ t: "undo" }); sel = null; render(); return; }
            if (act === "new") { if (blocked()) return; submitAction({ t: "new" }); return; }
            if (act === "restart") { if (blocked()) return; submitAction({ t: "restart" }); return; }
            if (act === "auto") { if (blocked()) return; doAuto(); return; }
            if (act === "home") { if (blocked()) return; homeFromSelOrCursor(); return; }
            if (act === "clear") { if (blocked()) return; sel = null; wildArmed = false; render(); return; }
            return;
        }
        const cheatEl = t.closest("[data-cheat]");
        if (cheatEl) { if (blocked()) return; runCheat(cheatEl.getAttribute("data-cheat")); return; }
        const modeEl = t.closest("[data-mode]");
        if (modeEl) {
            if (online || blocked()) return;
            const m = modeEl.getAttribute("data-mode");
            if (m === localMode) return;
            localMode = m;
            applyAction({ t: "new" }, 0);
            return;
        }
        if (blocked()) return;
        const zoneEl = t.closest("[data-zone]");
        if (zoneEl) {
            if (!state || state.phase !== "play") return;
            kbActive = false;
            zoneClick(zoneEl);
            return;
        }
        if (t === boardEl && sel) { sel = null; render(); }
    }
    function handleDbl(e) {
        if (!state || state.phase !== "play") return;
        const el = e.target.closest("[data-zone]");
        if (!el) return;
        const z = el.getAttribute("data-zone");
        if (z === "cell") {
            const i = +el.getAttribute("data-cell");
            if (state.players[mySeat()].free[i]) sendHome({ zone: "cell", cell: i });
        } else if (z === "col") {
            const ci = +el.getAttribute("data-col"), idx = +el.getAttribute("data-idx");
            const col = state.players[mySeat()].cols[ci];
            if (idx === col.length - 1) sendHome({ zone: "col", col: ci, idx });
        }
    }
    function handleCtx(e) {
        if (!state || state.phase !== "play") return;
        const el = e.target.closest("[data-zone]");
        if (!el) return;
        const z = el.getAttribute("data-zone");
        if (z === "col" || z === "cell") { e.preventDefault(); handleDbl(e); }
    }
    function handleKey(e) {
        if (dead || !root.contains(document.activeElement)) return;
        if (e.metaKey || e.ctrlKey || e.altKey) return;
        const tag = e.target && e.target.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
        const k = e.key;
        const code = e.code || "";
        const lower = k.length === 1 ? k.toLowerCase() : k;
        if ((lower === "Enter" || lower === " ") && tag === "BUTTON") return;
        /* priority: help -> cheats -> pause -> Escape -> restart -> game actions */
        if (code === "KeyH" || k === "?") { e.preventDefault(); toggleHelp(); return; }
        if (code === "KeyC") {
            e.preventDefault();
            if (!helpOpen && state && state.phase === "play") { cheatsOpen = !cheatsOpen; render(); }
            return;
        }
        if (code === "KeyP") { e.preventDefault(); if (!helpOpen && !cheatsOpen) togglePause(); return; }
        if (k === "Escape") {
            e.preventDefault();
            if (helpOpen) toggleHelp(false);
            else if (cheatsOpen) { cheatsOpen = false; render(); }
            else if (paused) togglePause(false);
            else { sel = null; wildArmed = false; render(); }
            return;
        }
        if (code === "KeyR") {
            e.preventDefault();
            if (!helpOpen && !cheatsOpen && !paused && canNew()) submitAction({ t: "restart" });
            return;
        }
        if (helpOpen || cheatsOpen || paused || !state) return;
        const play = state.phase === "play";
        const nav = (fn) => { e.preventDefault(); kbActive = true; fn(); render(); };
        if (lower === "u") { e.preventDefault(); if (canUndo()) { submitAction({ t: "undo" }); sel = null; render(); } return; }
        if (lower === "n") { e.preventDefault(); if (canNew()) submitAction({ t: "new" }); else flash("Only the host can deal during a game."); return; }
        if (lower === "a") { e.preventDefault(); doAuto(); return; }
        if (lower === "g") { e.preventDefault(); doHint(); return; }
        if (lower === "f") { e.preventDefault(); homeFromSelOrCursor(); return; }
        if (!play) return;
        const p = state.players[mySeat()];
        const clampIdx = () => { cursor.idx = Math.max(0, Math.min(cursor.idx, p.cols[cursor.col].length - 1)); };
        if (lower === "ArrowLeft") { nav(() => { cursor.col = (cursor.col + 7) % 8; clampIdx(); }); return; }
        if (lower === "ArrowRight") { nav(() => { cursor.col = (cursor.col + 1) % 8; clampIdx(); }); return; }
        if (lower === "ArrowUp") { nav(() => { if (cursor.row === "col") { if (cursor.idx <= 0) cursor.row = "top"; else cursor.idx--; } }); return; }
        if (lower === "ArrowDown") {
            nav(() => {
                if (cursor.row === "top") { cursor.row = "col"; cursor.idx = Math.max(0, p.cols[cursor.col].length - 1); }
                else cursor.idx = Math.min(p.cols[cursor.col].length - 1, cursor.idx + 1);
            });
            return;
        }
        if (k >= "1" && k <= "8") { nav(() => { cursor.row = "col"; cursor.col = +k - 1; cursor.idx = Math.max(0, p.cols[cursor.col].length - 1); }); return; }
        if (lower === "Enter" || lower === " ") {
            nav(() => {
                if (cursor.row === "top") { if (cursor.col < 4) cellClick(cursor.col); else foundationClick(cursor.col - 4); }
                else {
                    const col = p.cols[cursor.col];
                    if (col.length) colCardClick(cursor.col, Math.min(cursor.idx, col.length - 1));
                    else colBaseClick(cursor.col);
                }
            });
            return;
        }
    }
    root.addEventListener("click", handleClick);
    boardEl.addEventListener("dblclick", handleDbl);
    boardEl.addEventListener("contextmenu", handleCtx);
    document.addEventListener("keydown", handleKey);
    let ro = null;
    const onResize = () => {
        if (rafId) cancelAnimationFrame(rafId);
        rafId = requestAnimationFrame(() => { rafId = 0; renderBoard(); renderOpp(); });
    };
    if (typeof ResizeObserver === "function") { ro = new ResizeObserver(onResize); ro.observe(wrapEl); }
    else window.addEventListener("resize", onResize);

    /* ---------- boot ---------- */
    function newLocal(m) {
        histories = [[], []];
        botMem.visited = new Set(); botMem.idle = 0; botMem.found = 0;
        state = initState(randomDeal(), m);
        lastKey = dealKey(state);
        resetClient();
        publish();
        announce();
    }
    function listen(reg, cb) {
        if (typeof reg !== "function") return;
        try {
            const u = reg(cb);
            if (typeof u === "function") unsubs.push(u);
        } catch (err) { console.warn(err); }
    }
    if (online) {
        wrapEl.dataset.room = (roomData && roomData.id) || "";
        listen(room.onRoom && room.onRoom.bind(room), (r) => { if (dead) return; roomData = r; render(); });
        if (room.isHost) {
            listen(room.onAction && room.onAction.bind(room), (a) => { if (dead) return; applyAction(a, state ? 1 - state.hostSeat : 1); });
            newLocal("duel");
        } else {
            listen(room.onState && room.onState.bind(room), (s) => {
                if (dead || !s) return;
                const key = dealKey(s);
                state = s;
                if (key !== lastKey) { lastKey = key; resetClient(); announce(); }
                render();
            });
            render();
        }
    } else {
        newLocal(localMode);
    }
    try { boardEl.focus({ preventScroll: true }); } catch (err) { /* older browsers */ }

    return {
        destroy() {
            dead = true;
            root.removeEventListener("click", handleClick);
            boardEl.removeEventListener("dblclick", handleDbl);
            boardEl.removeEventListener("contextmenu", handleCtx);
            document.removeEventListener("keydown", handleKey);
            if (ro) ro.disconnect();
            else window.removeEventListener("resize", onResize);
            clearAllTimers();
            if (rafId) cancelAnimationFrame(rafId);
            unsubs.forEach((u) => { try { u(); } catch (err) { console.warn(err); } });
        },
    };
}