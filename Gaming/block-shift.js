/*
  Block Shift — puzzle geser blok (vs Bot / multiplayer room).
  - Simpan sebagai JS/games/block-shift.js (id harus sama dengan nama file).
  - Jalankan: node tools/build-games-manifest.mjs
*/

export const META = {
  id: "block-shift",
  name: "Block Shift",
  category: "puzzle",
  catLabel: "Puzzle",
  desc: "Geser blok ke ruang kosong sampai polanya sama dengan target, lebih cepat dari lawan.",
  art: '<svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="6" y="6" width="16" height="16" rx="4" fill="#fff"/><rect x="26" y="6" width="16" height="16" rx="4" fill="#fff" fill-opacity=".55"/><rect x="6" y="26" width="16" height="16" rx="4" fill="#fff" fill-opacity=".55"/><rect x="26" y="26" width="16" height="16" rx="4" stroke="#fff" stroke-width="2" stroke-dasharray="3 3"/></svg>',
  bg: ["#5eead4", "#0d9488"],
  bestKey: "blockShiftBest",
};

/* ---------- Data & helper murni ---------- */

// '.' = kosong, '#' = dinding, A-E = warna blok
const COLORS = {
  A: { c: "#e07a4f", g: "●" },
  B: { c: "#3f95a1", g: "▲" },
  C: { c: "#d9b448", g: "■" },
  D: { c: "#8f7fc7", g: "◆" },
  E: { c: "#5fa873", g: "★" },
};
const KEYS = "ABCDE";
const LEVELS = {
  easy: { label: "Mudah", n: 3, walls: 0, colors: 3, scr: 14, slip: 0.35 },
  normal: { label: "Sedang", n: 4, walls: 1, colors: 4, scr: 30, slip: 0.2 },
  hard: { label: "Sulit", n: 5, walls: 3, colors: 5, scr: 50, slip: 0.08 },
};

const isBlock = (ch) => Object.prototype.hasOwnProperty.call(COLORS, ch);
const rand = (n) => Math.floor(Math.random() * n);
const pick = (a) => a[rand(a.length)];
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) { const j = rand(i + 1); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
function nbrs(i, n) {
  const r = (i / n) | 0, c = i % n, o = [];
  if (r > 0) o.push(i - n);
  if (r < n - 1) o.push(i + n);
  if (c > 0) o.push(i - 1);
  if (c < n - 1) o.push(i + 1);
  return o;
}
function legal(b, n) {
  const m = [];
  for (let i = 0; i < b.length; i++) if (isBlock(b[i])) for (const j of nbrs(i, n)) if (b[j] === ".") m.push([i, j]);
  return m;
}
function swap(b, i, j) { const a = b.split(""); [a[i], a[j]] = [a[j], a[i]]; return a.join(""); }
function wrongCount(b, t) {
  let k = 0;
  for (let i = 0; i < b.length; i++) if (isBlock(b[i]) && b[i] !== t[i]) k++;
  return k;
}

/* Level acak yang pasti bisa diselesaikan: mulai dari pola target,
   lalu acak dengan langkah legal (semua langkah bisa dibalik). */
function generate(cfg) {
  const n = cfg.n, N = n * n;
  let res = null;
  for (let tries = 0; tries < 200; tries++) {
    const idx = shuffle([...Array(N).keys()]);
    const cells = Array(N).fill(".");
    for (let k = 0; k < cfg.walls; k++) cells[idx[k]] = "#";
    idx.slice(cfg.walls + 2).forEach((c, k) => { cells[c] = KEYS[k % cfg.colors]; }); // 2 ruang kosong
    const target = cells.join("");
    let b = target, last = null;
    const st = [];
    for (let s = 0; s < cfg.scr; s++) {
      const mv = legal(b, n).filter((m) => !(last && m[0] === last[1] && m[1] === last[0]));
      if (!mv.length) break;
      const m = pick(mv);
      b = swap(b, m[0], m[1]);
      last = m;
      const top = st[st.length - 1];
      if (top && top[0] === m[1] && top[1] === m[0]) st.pop(); else st.push(m);
    }
    // path = langkah penyelesaian (kebalikan dari acakan)
    res = { target, start: b, path: st.reverse().map(([a, c]) => [c, a]) };
    if (wrongCount(b, target) >= Math.max(3, n)) break;
  }
  return res;
}

// Jaga jalur solusi tetap valid: langkah sesuai jalur -> dihapus, selain itu -> tambahkan langkah pembatal.
function trackPath(path, from, to) {
  const p = path[0];
  if (p && p[0] === from && p[1] === to) path.shift(); else path.unshift([to, from]);
}

/* ---------- Game ---------- */

export function mount(root, context = {}) {
  const { mode = "ai", room = null, playerName = "Player", onExit = () => { } } = context;
  const online = mode === "room" && Boolean(room);
  const playerIndex = online && !room.isHost ? 1 : 0;
  let roomData = room?.room || null;
  let state = null;

  const ui = { diff: "normal", sel: 0, round: 0, overlay: null, cheatOn: false, cheated: false, saved: 0 };
  const cheats = { hint: false, wrong: false, ghost: false, freeze: false };
  let myPath = [], botPath = [], history = [], botTimer = null;

  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* abaikan */ } },
  };
  const best = store.get(META.bestKey, {});

  root.innerHTML = `
    <div class="game-app bs">
      <style>
        .bs{--line:rgba(127,127,127,.3);--soft:rgba(127,127,127,.1)}
        .bs *{box-sizing:border-box}
        .bs [hidden]{display:none!important}
        .bs-banner{display:flex;gap:12px;align-items:center;justify-content:space-between;min-height:38px;padding:8px 12px;margin-bottom:14px;border:1px solid var(--line);border-radius:10px;font-size:14px}
        .bs-banner:empty{display:none}
        .bs-stage{display:grid;grid-template-columns:minmax(0,1fr) 150px;gap:20px;align-items:start}
        .bs-side{display:flex;flex-direction:column;gap:16px}
        .bs-mini small{display:block;margin-bottom:6px;font-size:12px;opacity:.7}
        .bs-mini-grid{display:grid;grid-template-columns:repeat(var(--n),1fr);gap:3px;padding:5px;border:1px solid var(--line);border-radius:8px;background:var(--soft);aspect-ratio:1}
        .bs-mini-grid i{border-radius:3px;border:1px dashed var(--line)}
        .bs-mini-grid i.b{border:0}
        .bs-mini-grid i.w{border:0;background:rgba(127,127,127,.45)}
        .bs-pcard{display:flex;flex-wrap:wrap;align-items:baseline;gap:4px 10px;margin-bottom:8px;font-size:13px}
        .bs-pcard .bs-dot{width:8px;height:8px;border-radius:50%;background:var(--line);align-self:center}
        .bs-pcard.is-turn .bs-dot{background:#22c55e}
        .bs-pcard em{font-style:normal;opacity:.6}
        .bs-pcard span{opacity:.75}
        .bs-grid{display:grid;grid-template-columns:repeat(var(--n),1fr);gap:6px;width:min(100%,420px);aspect-ratio:1;padding:8px;border:1px solid var(--line);border-radius:14px;background:var(--soft)}
        .bs-cell{position:relative;display:grid;place-items:center;min-width:0;padding:0;border:0;border-radius:10px;font:inherit;font-size:clamp(14px,4vw,22px);color:#fff;touch-action:manipulation;cursor:pointer}
        .bs-block{background:var(--c);transition:transform .12s}
        .bs-block:active{transform:scale(.94)}
        .bs-block.is-movable{box-shadow:inset 0 0 0 2px rgba(255,255,255,.55)}
        .bs-block.is-wrong{box-shadow:inset 0 0 0 3px #e11d48}
        .bs-empty{background:transparent;border:1.5px dashed var(--line)}
        .bs-empty.is-target{border-color:currentColor;background:var(--soft)}
        .bs-wall{background:repeating-linear-gradient(45deg,rgba(127,127,127,.5) 0 4px,rgba(127,127,127,.28) 4px 8px);cursor:default}
        .bs-cell.is-sel{outline:2px solid currentColor;outline-offset:2px;z-index:1}
        .bs-cell.is-last{animation:bs-pop .18s ease-out}
        .bs-cell.is-hint-from,.bs-cell.is-hint-to{outline:3px solid #22c55e;outline-offset:2px}
        .bs-cell.has-ghost::after{content:"";position:absolute;right:5px;bottom:5px;width:9px;height:9px;border-radius:50%;background:var(--g);border:1.5px solid #fff}
        .bs-note{margin:10px 0 0;font-size:13px;opacity:.75}
        .bs-wait{padding:40px 0;text-align:center;opacity:.7}
        .bs-pad{display:none;grid-template-columns:repeat(3,58px);grid-template-rows:repeat(2,52px);gap:6px;justify-content:center;margin:16px auto 0}
        .bs-key{display:grid;place-items:center;padding:0;font-size:18px;touch-action:manipulation}
        @media (pointer:coarse),(max-width:640px){.bs-pad{display:grid}}
        @media (max-width:640px){.bs-stage{grid-template-columns:1fr}.bs-side{flex-direction:row}.bs-side .bs-mini{flex:1}}
        .bs-overlay{position:fixed;inset:0;z-index:50;display:grid;place-items:center;padding:16px;background:rgba(0,0,0,.5)}
        .bs-sheet{width:min(100%,460px);max-height:88vh;overflow:auto;padding:20px;border-radius:14px;background:var(--surface,Canvas);color:var(--text,CanvasText)}
        .bs-sheet h3{margin:0 0 10px}
        .bs-sheet ul{margin:0 0 12px;padding-left:18px;font-size:14px;line-height:1.55}
        .bs-sheet h4{margin:14px 0 4px;font-size:14px}
        .bs-cheats{display:grid;gap:8px;margin:12px 0}
        .bs-cheats button{display:flex;justify-content:space-between;gap:10px;text-align:left}
        @keyframes bs-pop{from{transform:scale(.82)}to{transform:scale(1)}}
        @media (prefers-reduced-motion:reduce){.bs-cell,.bs-cell.is-last{animation:none;transition:none}}
      </style>
      <div class="game-intro">
        <div><h2>Block Shift</h2><p>Geser blok ke ruang kosong sampai sama dengan pola target.</p></div>
        <span class="game-status"><i class="game-status-dot"></i><span data-status>Siap</span></span>
      </div>
      <section class="game-panel" data-board></section>
      <div class="bs-pad" data-pad aria-label="Kontrol virtual">
        <button class="game-action-button bs-key" type="button" data-dir="-1,0" style="grid-column:2" aria-label="Atas">▲</button>
        <button class="game-action-button bs-key" type="button" data-dir="0,-1" style="grid-column:1;grid-row:2" aria-label="Kiri">◀</button>
        <button class="game-action-button bs-key" type="button" data-dir="1,0" style="grid-column:2;grid-row:2" aria-label="Bawah">▼</button>
        <button class="game-action-button bs-key" type="button" data-dir="0,1" style="grid-column:3;grid-row:2" aria-label="Kanan">▶</button>
      </div>
      <div class="game-actions">
        <select class="game-action-button" data-diff data-host-only aria-label="Tingkat kesulitan">
          ${Object.entries(LEVELS).map(([k, v]) => `<option value="${k}"${k === ui.diff ? " selected" : ""}>${v.label}</option>`).join("")}
        </select>
        <button class="game-action-button" type="button" data-new data-host-only>Level baru</button>
        <button class="game-action-button" type="button" data-help>Cara main</button>
        <button class="game-action-button" type="button" data-cheat-open data-ai-only>Cheat</button>
        <button class="game-action-button" type="button" data-exit>Exit game</button>
      </div>
      <div class="bs-overlay" data-overlay hidden></div>
    </div>`;

  root.querySelectorAll("[data-host-only]").forEach((el) => { el.hidden = online && !room.isHost; });
  root.querySelectorAll("[data-ai-only]").forEach((el) => { el.hidden = online; });

  /* ----- state ----- */

  const mySeat = () => (!online || room.isHost ? state.hostSeat : 1 - state.hostSeat);
  const canAct = () => Boolean(state) && state.winner < 0 && state.turn === mySeat();

  function newState(diff) {
    const cfg = LEVELS[diff] || LEVELS.normal;
    const g = generate(cfg);
    myPath = g.path.map((m) => m.slice());
    botPath = g.path.map((m) => m.slice());
    history = [];
    Object.keys(cheats).forEach((k) => { cheats[k] = false; });
    ui.cheated = false;
    const limit = cfg.scr * 2 + 10;
    const hostSeat = online ? rand(2) : 0;       // multiplayer: posisi P1/P2 diundi
    const turn = online ? 0 : rand(2);           // vs Bot: siapa jalan duluan diundi
    const note = online ? "" : turn === 0 ? "Undian: kamu jalan lebih dulu." : "Undian: Bot jalan lebih dulu.";
    return {
      diff, n: cfg.n, target: g.target, boards: [g.start, g.start], moves: [0, 0],
      limits: [limit, limit], turn, winner: -1, hostSeat, round: (state?.round || 0) + 1, last: [-1, -1], note,
    };
  }

  const can = (s) => state.moves[s] < state.limits[s] && legal(state.boards[s], state.n).length > 0;

  function advance(just) {
    const other = 1 - just;
    if (!can(just) && !can(other)) {
      const a = wrongCount(state.boards[0], state.target), c = wrongCount(state.boards[1], state.target);
      state.winner = a === c ? 2 : a < c ? 0 : 1;
      state.note = "Batas langkah habis. Pemenang ditentukan dari jumlah blok yang paling benar.";
      return;
    }
    let next = can(other) ? other : just;
    if (!online && cheats.freeze && next === 1 && can(0)) {
      next = 0;
      state.note = "Bot dibekukan. Giliranmu lagi.";
    } else if (next === just) {
      state.note = `P${other + 1} tidak bisa melangkah. Giliran dilewati.`;
    }
    state.turn = next;
  }

  function applyAction(action, actor) {
    if (!state || !action) return;
    if (action.type === "new") {
      if (online && actor !== 0) return;
      clearTimeout(botTimer);
      state = newState(LEVELS[action.diff] ? action.diff : state.diff);
      publish();
      scheduleBot();
      return;
    }
    if (action.type !== "move" || state.winner >= 0) return;
    const seat = actor === 0 ? state.hostSeat : 1 - state.hostSeat;
    if (seat !== state.turn) return;
    const { from, to } = action, b = state.boards[seat], n = state.n;
    if (!Number.isInteger(from) || !Number.isInteger(to) || !isBlock(b[from]) || b[to] !== "." || !nbrs(from, n).includes(to)) return;
    if (!online) {
      if (seat === 0) history.push({ b, p: myPath.map((m) => m.slice()) });
      trackPath(seat === 0 ? myPath : botPath, from, to);
    }
    const nb = swap(b, from, to);
    state.boards[seat] = nb;
    state.moves[seat]++;
    state.last[seat] = to;
    state.note = "";
    if (nb === state.target) state.winner = seat; else advance(seat);
    publish();
    scheduleBot();
  }

  function publish() {
    render();
    // Hanya host yang menulis state kanonik ke Firebase.
    if (online && room.isHost) room.publishState(state).catch(console.warn);
  }

  function submitAction(action) {
    if (online && !room.isHost) {
      room.sendAction(action).catch(console.warn);
      return;
    }
    applyAction(action, playerIndex);
  }

  /* ----- bot (mode vs Bot) ----- */

  function scheduleBot() {
    if (online || !state || state.winner >= 0 || state.turn !== 1) return;
    clearTimeout(botTimer);
    botTimer = setTimeout(botMove, 650 + Math.random() * 500);
  }

  function botMove() {
    if (!state || state.winner >= 0 || state.turn !== 1) return;
    const b = state.boards[1], mv = legal(b, state.n);
    if (!mv.length) return;
    const p = botPath[0];
    const ok = p && isBlock(b[p[0]]) && b[p[1]] === ".";
    const m = !ok || Math.random() < LEVELS[state.diff].slip ? pick(mv) : p; // sesekali salah langkah
    applyAction({ type: "move", from: m[0], to: m[1] }, 1);
  }

  /* ----- kontrol pemain ----- */

  function step(dr, dc) {
    if (!state) return;
    const n = state.n, r = ((ui.sel / n) | 0) + dr, c = (ui.sel % n) + dc;
    if (r < 0 || c < 0 || r >= n || c >= n) return;
    const t = r * n + c, b = state.boards[mySeat()];
    if (isBlock(b[ui.sel]) && b[t] === "." && canAct()) {
      const from = ui.sel;
      ui.sel = t;
      submitAction({ type: "move", from, to: t });
      return;
    }
    ui.sel = t;
    render();
  }

  function pickCell(i) {
    if (!state) return;
    const n = state.n, b = state.boards[mySeat()], ch = b[i];
    if (isBlock(ch)) {
      ui.sel = i;
      const em = nbrs(i, n).filter((j) => b[j] === ".");
      if (em.length === 1 && canAct()) {
        ui.sel = em[0];
        submitAction({ type: "move", from: i, to: em[0] });
        return;
      }
    } else if (ch === "." && isBlock(b[ui.sel]) && nbrs(ui.sel, n).includes(i) && canAct()) {
      const from = ui.sel;
      ui.sel = i;
      submitAction({ type: "move", from, to: i });
      return;
    } else {
      ui.sel = i;
    }
    render();
  }

  /* ----- cheat (hanya mode vs Bot) ----- */

  function hintMove() {
    if (online || !state || state.winner >= 0) return null;
    const m = myPath[0], b = state.boards[0];
    return m && isBlock(b[m[0]]) && b[m[1]] === "." ? m : null;
  }

  function cheat(name) {
    if (online || !state) return;
    ui.cheated = true;
    if (name === "hint") cheats.hint = !cheats.hint;
    else if (name === "wrong") cheats.wrong = !cheats.wrong;
    else if (name === "ghost") cheats.ghost = !cheats.ghost;
    else if (name === "freeze") cheats.freeze = !cheats.freeze;
    else if (name === "auto") {
      const h = hintMove();
      if (h && canAct()) { ui.sel = h[1]; submitAction({ type: "move", from: h[0], to: h[1] }); return; }
    } else if (name === "undo") undoMove();
    else if (name === "limit") state.limits[0] += 15;
    else if (name === "solve" && state.winner < 0) { state.boards[0] = state.target; state.winner = 0; }
    render();
  }

  function undoMove() {
    if (online || !state || state.winner >= 0 || state.turn !== 0 || !history.length) return;
    const h = history.pop();
    state.boards[0] = h.b;
    myPath = h.p;
    state.moves[0]--;
    state.last[0] = -1;
  }

  /* ----- render ----- */

  function miniHTML(b, n) {
    return `<div class="bs-mini-grid" style="--n:${n}">${[...b].map((ch) =>
      isBlock(ch) ? `<i class="b" style="background:${COLORS[ch].c}"></i>` : ch === "#" ? '<i class="w"></i>' : "<i></i>").join("")}</div>`;
  }

  function render() {
    const panel = root.querySelector("[data-board]"), st = root.querySelector("[data-status]");
    if (!state) {
      st.textContent = "Menunggu host…";
      panel.innerHTML = '<p class="bs-wait">Menunggu host menyiapkan level…</p>';
      return;
    }
    const me = mySeat(), opp = 1 - me, n = state.n, b = state.boards[me], t = state.target;
    const over = state.winner >= 0, oppName = online ? "Lawan" : "Bot";
    if (ui.round !== state.round) {
      ui.round = state.round;
      const f = legal(b, n)[0];
      ui.sel = f ? f[0] : 0;
    }
    if (state.winner === me && ui.saved !== state.round) {
      ui.saved = state.round;
      if (!ui.cheated && (!best[state.diff] || state.moves[me] < best[state.diff])) {
        best[state.diff] = state.moves[me];
        store.set(META.bestKey, best);
      }
    }

    st.textContent = over
      ? state.winner === 2 ? "Seri" : state.winner === me ? "Kamu menang!" : `${oppName} menang`
      : state.turn === me ? "Giliranmu" : online ? "Giliran lawan" : "Bot berpikir…";

    let note = state.note || "";
    if (online && !note && state.moves[0] + state.moves[1] === 0) note = `Undian posisi: kamu P${me + 1}. P1 jalan lebih dulu.`;
    if (over) note = (state.winner === 2 ? "Seri." : state.winner === me ? "Pola selesai, kamu menang." : `${oppName} lebih dulu menyelesaikan pola.`) + (state.note ? ` ${state.note}` : "");
    const newBtn = !online || room.isHost ? '<button class="game-action-button" type="button" data-new>Level baru</button>' : "<span>Menunggu host…</span>";
    const banner = note ? `<div class="bs-banner"><span>${esc(note)}</span>${over ? newBtn : ""}</div>` : "";

    const movable = new Set(legal(b, n).map((m) => m[0]));
    const selTargets = new Set(isBlock(b[ui.sel]) ? nbrs(ui.sel, n).filter((j) => b[j] === ".") : []);
    const hint = cheats.hint ? hintMove() : null;
    const cells = [...b].map((ch, i) => {
      if (ch === "#") return '<div class="bs-cell bs-wall" aria-label="Dinding"></div>';
      const cls = ["bs-cell"];
      if (i === ui.sel) cls.push("is-sel");
      if (state.last[me] === i) cls.push("is-last");
      let style = "";
      if (cheats.ghost && isBlock(t[i])) { cls.push("has-ghost"); style += `--g:${COLORS[t[i]].c};`; }
      if (ch === ".") {
        cls.push("bs-empty");
        if (selTargets.has(i)) cls.push("is-target");
        if (hint && hint[1] === i) cls.push("is-hint-to");
        return `<button class="${cls.join(" ")}" type="button" data-cell="${i}" style="${style}" aria-label="Kotak kosong"></button>`;
      }
      cls.push("bs-block");
      if (movable.has(i)) cls.push("is-movable");
      if (cheats.wrong && ch !== t[i]) cls.push("is-wrong");
      if (hint && hint[0] === i) cls.push("is-hint-from");
      return `<button class="${cls.join(" ")}" type="button" data-cell="${i}" style="--c:${COLORS[ch].c};${style}" aria-label="Blok ${ch}">${COLORS[ch].g}</button>`;
    }).join("");

    const card = (s) => {
      const bt = s === me && best[state.diff] ? `<span>Terbaik ${best[state.diff]}</span>` : "";
      return `<div class="bs-pcard${state.turn === s && !over ? " is-turn" : ""}"><i class="bs-dot"></i><b>${s === me ? esc(playerName) : oppName}</b><em>P${s + 1}</em><span>${state.moves[s]}/${state.limits[s]} langkah</span><span>${wrongCount(state.boards[s], t)} salah</span>${bt}</div>`;
    };
    const risk = movable.size <= 1 && !over ? " · hati-hati, hampir buntu!" : "";

    panel.innerHTML = `${banner}
      <div class="bs-stage">
        <div>
          ${card(me)}
          <div class="bs-grid" style="--n:${n}">${cells}</div>
          <p class="bs-note">${LEVELS[state.diff].label} · ${movable.size} blok bisa digeser${risk}</p>
        </div>
        <div class="bs-side">
          <div class="bs-mini"><small>Target pola</small>${miniHTML(t, n)}</div>
          <div class="bs-mini"><small>${oppName} · ${state.moves[opp]}/${state.limits[opp]} langkah</small>${miniHTML(state.boards[opp], n)}</div>
        </div>
      </div>`;
    renderOverlay();
  }

  function renderOverlay() {
    const ov = root.querySelector("[data-overlay]");
    ov.hidden = !ui.overlay;
    if (ui.overlay === "help") {
      ov.innerHTML = `<div class="bs-sheet" role="dialog" aria-label="Cara main">
        <h3>Cara main</h3>
        <ul>
          <li>Tujuan: susun blok persis seperti <b>Target pola</b> lebih dulu dari lawan.</li>
          <li>Setiap giliran, geser <b>satu blok</b> ke kotak kosong di sebelahnya (atas, bawah, kiri, kanan). Dinding tidak bisa digeser.</li>
          <li>Ada batas langkah. Jika batas habis, pemenang adalah yang blok salahnya paling sedikit.</li>
        </ul>
        <h4>Kontrol</h4>
        <ul>
          <li>Mouse / sentuh: klik blok untuk menggesernya. Jika ada lebih dari satu kotak kosong di sekitarnya, klik blok lalu klik kotak tujuan.</li>
          <li>Keyboard: tombol panah atau WASD menggeser blok terpilih, atau memindahkan pilihan jika arahnya tidak kosong. H = cara main, N = level baru, Esc = tutup.</li>
          <li>Mobile: pakai tombol panah virtual di bawah papan.</li>
        </ul>
        <h4>Hindari buntu</h4>
        <ul>
          <li>Jangan biarkan ruang kosong terkurung dinding atau sudut. Blok yang berbingkai putih masih bisa digeser.</li>
          <li>Kalau yang bisa digeser tinggal 1 blok, langkahmu hampir habis.</li>
        </ul>
        <h4>Undian</h4>
        <ul>
          <li>Lawan Bot: siapa yang jalan duluan diundi.</li>
          <li>Multiplayer: posisi P1 / P2 diundi, P1 jalan lebih dulu.</li>
        </ul>
        <button class="game-action-button" type="button" data-close>Mengerti</button>
      </div>`;
    } else if (ui.overlay === "cheat") {
      const on = (v) => (v ? "ON" : "OFF");
      ov.innerHTML = `<div class="bs-sheet" role="dialog" aria-label="Cheat">
        <h3>Cheat</h3>
        <p style="margin:0;font-size:13px;opacity:.7">Hanya untuk mode vs Bot. Rekor terbaik tidak dicatat setelah memakai cheat.</p>
        <div class="bs-cheats">
          <button class="game-action-button" type="button" data-cheat="hint"><span>Petunjuk langkah</span><b>${on(cheats.hint)}</b></button>
          <button class="game-action-button" type="button" data-cheat="auto"><span>Jalankan langkah terbaik</span><b>1×</b></button>
          <button class="game-action-button" type="button" data-cheat="undo"><span>Urungkan langkah (Z)</span><b>${history.length}</b></button>
          <button class="game-action-button" type="button" data-cheat="wrong"><span>Tandai blok salah</span><b>${on(cheats.wrong)}</b></button>
          <button class="game-action-button" type="button" data-cheat="ghost"><span>Tampilkan target di papan</span><b>${on(cheats.ghost)}</b></button>
          <button class="game-action-button" type="button" data-cheat="freeze"><span>Bekukan Bot</span><b>${on(cheats.freeze)}</b></button>
          <button class="game-action-button" type="button" data-cheat="limit"><span>Tambah batas langkah</span><b>+15</b></button>
          <button class="game-action-button" type="button" data-cheat="solve"><span>Selesaikan sekarang</span><b>✓</b></button>
        </div>
        <button class="game-action-button" type="button" data-close>Tutup</button>
      </div>`;
    } else {
      ov.innerHTML = "";
    }
  }

  /* ----- event ----- */

  function handleClick(event) {
    const t = event.target;
    if (t.closest("[data-exit]")) { onExit(); return; }
    if (t.closest("[data-help]")) { ui.overlay = "help"; renderOverlay(); return; }
    if (t.closest("[data-cheat-open]")) { ui.overlay = "cheat"; ui.cheatOn = true; renderOverlay(); return; }
    if (t.closest("[data-close]") || t.matches(".bs-overlay")) { ui.overlay = null; renderOverlay(); return; }
    const ch = t.closest("[data-cheat]");
    if (ch) { cheat(ch.dataset.cheat); return; }
    if (t.closest("[data-new]")) { submitAction({ type: "new", diff: ui.diff }); return; }
    const d = t.closest("[data-dir]");
    if (d) { const [r, c] = d.dataset.dir.split(",").map(Number); step(r, c); return; }
    const cell = t.closest("[data-cell]");
    if (cell) pickCell(Number(cell.dataset.cell));
  }

  function handleChange(event) {
    if (event.target.matches("[data-diff]")) ui.diff = event.target.value;
  }

  const DIRS = {
    ArrowUp: [-1, 0], w: [-1, 0], W: [-1, 0],
    ArrowDown: [1, 0], s: [1, 0], S: [1, 0],
    ArrowLeft: [0, -1], a: [0, -1], A: [0, -1],
    ArrowRight: [0, 1], d: [0, 1], D: [0, 1],
  };

  function handleKey(event) {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.target.closest?.("input,textarea,select")) return;
    const k = event.key;
    if (k === "Escape") {
      if (ui.overlay) { ui.overlay = null; renderOverlay(); event.preventDefault(); }
      return;
    }
    if (ui.overlay) return;
    if (DIRS[k]) { event.preventDefault(); step(...DIRS[k]); return; }
    if (k === "h" || k === "H" || k === "?") { ui.overlay = "help"; renderOverlay(); return; }
    if ((k === "n" || k === "N") && (!online || room.isHost)) { submitAction({ type: "new", diff: ui.diff }); return; }
    if ((k === "c" || k === "C") && !online) { ui.overlay = "cheat"; ui.cheatOn = true; renderOverlay(); return; }
    if ((k === "z" || k === "Z") && !online && ui.cheatOn) { cheat("undo"); }
  }

  root.addEventListener("click", handleClick);
  root.addEventListener("change", handleChange);
  document.addEventListener("keydown", handleKey);

  if (!store.get("blockShiftHelpSeen", false)) {
    store.set("blockShiftHelpSeen", true);
    ui.overlay = "help";
  }

  if (online) {
    room.onRoom((nextRoom) => { roomData = nextRoom; render(); });
    if (room.isHost) {
      state = newState(ui.diff);
      publish();
      room.onAction((action) => applyAction(action, 1));
    } else {
      render();
      room.onState((nextState) => { state = nextState; render(); });
    }
  } else {
    state = newState(ui.diff);
    render();
    scheduleBot();
  }

  return {
    destroy() {
      clearTimeout(botTimer);
      root.removeEventListener("click", handleClick);
      root.removeEventListener("change", handleChange);
      document.removeEventListener("keydown", handleKey);
    },
  };
}
