/**
 * GAME UI KIT — satu component bersama untuk seluruh game ESM.
 *
 * Komposisi HUD ditentukan oleh preset kategori (CATEGORY_PRESETS), sehingga
 * semua game dalam kategori yang sama menampilkan chip yang sama. Game hanya
 * mengisi nilai lewat `data-hud="<key>"`; stat khusus game diletakkan di panel
 * info terpisah tepat di bawah HUD / di atas board (gameInfoPanelHTML).
 *
 * Seluruh elemen memakai prefix `gui-` dan token warna shell, sehingga tampilan
 * konsisten di light/dark tanpa bergantung pada transformer <style> per game.
 */
import { iconSVG } from "./icons.js";

/** Chip kanonik per kategori. Urutan di sini = urutan tampil di HUD. */
export const CATEGORY_PRESETS = Object.freeze({
  action: [
    { key: "level", label: "LEVEL" },
    { key: "score", label: "SCORE" },
    { key: "hp", label: "HP", type: "bar" },
    { key: "lives", label: "LIVES" },
    { key: "combo", label: "COMBO", priority: "low" },
  ],
  adventure: [
    { key: "level", label: "LEVEL" },
    { key: "score", label: "SCORE" },
    { key: "hp", label: "HP", type: "bar" },
    { key: "items", label: "ITEMS" },
    { key: "time", label: "TIME", priority: "low" },
  ],
  arcade: [
    { key: "level", label: "LEVEL" },
    { key: "score", label: "SCORE" },
    { key: "best", label: "BEST" },
    { key: "wave", label: "WAVE" },
    { key: "hp", label: "HP", type: "bar", priority: "low" },
  ],
  board: [
    { key: "turn", label: "TURN" },
    { key: "round", label: "ROUND" },
    { key: "score", label: "SCORE" },
    { key: "best", label: "BEST", priority: "low" },
  ],
  cards: [
    { key: "level", label: "LEVEL" },
    { key: "score", label: "SCORE" },
    { key: "best", label: "BEST" },
    { key: "turn", label: "TURN", priority: "low" },
  ],
  casino: [
    { key: "bet", label: "BET" },
    { key: "score", label: "SCORE" },
    { key: "best", label: "BEST" },
    { key: "turn", label: "TURN", priority: "low" },
  ],
  casual: [
    { key: "level", label: "LEVEL" },
    { key: "score", label: "SCORE" },
    { key: "best", label: "BEST" },
    { key: "left", label: "LEFT", priority: "low" },
  ],
  educational: [
    { key: "round", label: "ROUND" },
    { key: "score", label: "SCORE" },
    { key: "lives", label: "LIVES" },
    { key: "time", label: "TIME", priority: "low" },
  ],
  words: [
    { key: "level", label: "LEVEL" },
    { key: "score", label: "SCORE" },
    { key: "best", label: "BEST" },
    { key: "time", label: "TIME", priority: "low" },
  ],
  kids: [
    { key: "round", label: "ROUND" },
    { key: "score", label: "SCORE" },
    { key: "best", label: "BEST" },
    { key: "turn", label: "TURN", priority: "low" },
  ],
  music: [
    { key: "mode", label: "MODE" },
    { key: "score", label: "SCORE" },
    { key: "best", label: "BEST" },
    { key: "step", label: "STEP", priority: "low" },
  ],
  puzzle: [
    { key: "level", label: "LEVEL" },
    { key: "score", label: "SCORE" },
    { key: "best", label: "BEST" },
    { key: "time", label: "TIME" },
    { key: "moves", label: "MOVES", priority: "low" },
  ],
  racing: [
    { key: "lap", label: "LAP" },
    { key: "time", label: "TIME" },
    { key: "pos", label: "POS" },
    { key: "pen", label: "PEN", priority: "low" },
  ],
  rpg: [
    { key: "act", label: "ACT" },
    { key: "hero", label: "HERO" },
    { key: "score", label: "SCORE" },
    { key: "gold", label: "GOLD", priority: "low" },
  ],
  simulation: [
    { key: "day", label: "DAY" },
    { key: "score", label: "SCORE" },
    { key: "best", label: "BEST" },
    { key: "target", label: "TARGET", priority: "low" },
  ],
  sports: [
    { key: "round", label: "ROUND" },
    { key: "score", label: "SCORE" },
    { key: "best", label: "BEST" },
    { key: "time", label: "TIME", priority: "low" },
  ],
  strategy: [
    { key: "turn", label: "TURN" },
    { key: "gold", label: "GOLD", priority: "low" },
    { key: "score", label: "SCORE" },
    { key: "best", label: "BEST" },
  ],
  trivia: [
    { key: "round", label: "ROUND" },
    { key: "score", label: "SCORE" },
    { key: "tries", label: "TRIES" },
    { key: "best", label: "BEST", priority: "low" },
  ],
});

/** Lima tombol standar. Urutan ini tidak boleh diubah antar game. */
const HUD_BUTTONS = Object.freeze([
  { action: "help", icon: "helpCircle", label: "Help", aria: "How to play", title: "How to play (H)" },
  { action: "cheats", icon: "wrench", label: "Cheats", aria: "Cheats", title: "Cheats (C)" },
  { action: "pause", icon: "pause", label: "Pause", aria: "Pause", title: "Pause (P)" },
  { action: "restart", icon: "refresh", label: "Restart", aria: "Restart", title: "Restart" },
  { action: "exit", icon: "logOut", label: "Exit game", aria: "Exit game", title: "Exit game" },
]);

const escapeHTML = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
})[char]);

function chipHTML(chip, values = {}) {
  const key = chip.key;
  const value = values[key] !== undefined ? values[key] : (chip.value ?? (chip.type === "bar" ? 0 : "—"));
  const priority = chip.priority === "low" ? " low" : "";
  const hidden = chip.hidden ? " hidden" : "";
  const elAttr = chip.el ? ` data-el="${escapeHTML(chip.el)}"` : "";
  const attrs = chip.attrs || "";
  const label = chip.label ? `<span class="gui-chip-label">${escapeHTML(chip.label)}</span> ` : "";
  if (chip.type === "bar") {
    const width = Math.max(0, Math.min(100, Number(value) || 0));
    return `<span class="gui-chip${priority}" data-chip="${escapeHTML(key)}"${hidden}${attrs}>${label}<span class="gui-bar"><i data-hud="${escapeHTML(key)}"${elAttr}${attrs} style="width:${width}%"></i></span></span>`;
  }
  if (chip.type === "dot") {
    return `<span class="gui-chip${priority}" data-chip="${escapeHTML(key)}"${hidden}${attrs}>${label}<i class="gui-dot" data-hud="${escapeHTML(key)}"${elAttr}${attrs}></i></span>`;
  }
  if (chip.type === "badge") {
    return `<span class="gui-chip gui-badge${priority}" data-chip="${escapeHTML(key)}"${elAttr}${attrs}${hidden || (value ? "" : " hidden")}>${escapeHTML(chip.label || key.toUpperCase())}</span>`;
  }
  return `<span class="gui-chip${priority}" data-chip="${escapeHTML(key)}"${hidden}${attrs}>${label}<b data-hud="${escapeHTML(key)}"${elAttr}${attrs}>${escapeHTML(value)}</b></span>`;
}

/**
 * Bar HUD tunggal: chip preset kategori + spacer + 5 tombol ikon.
 * `chips` dapat dipakai untuk override; `values` mengisi nilai awal.
 */
export function gameHUDHTML({
  category = "arcade",
  chips,
  values = {},
  labels = {},
  keys = {},
  hiddenChips = [],
  disabledActions = [],
  hiddenActions = [],
} = {}) {
  const preset = chips || CATEGORY_PRESETS[category] || CATEGORY_PRESETS.arcade;
  const list = preset.filter((chip) => !hiddenChips.includes(chip.key));
  const buttons = HUD_BUTTONS
    .filter((button) => !hiddenActions.includes(button.action))
    .map((button) => {
      const label = labels[button.action] ?? button.label;
      const aria = labels[`${button.action}Aria`] ?? button.aria;
      const title = labels[`${button.action}Title`] ?? button.title;
      const disabled = disabledActions.includes(button.action) ? " disabled" : "";
      return `<button class="gui-btn gui-icon-btn" type="button" data-ui-action="${button.action}"` +
        ` data-${button.action} aria-label="${escapeHTML(aria)}" title="${escapeHTML(title)}"${disabled}>` +
        `${iconSVG(button.icon, { size: 14 })}<span class="gui-btn-label">${escapeHTML(label)}</span></button>`;
    })
    .join("");
  return `<div class="gui-hud" data-gui-hud>${list.map((chip) => chipHTML({ ...chip, key: keys[chip.key] || chip.key }, values)).join("")}` +
    `<span class="gui-spacer"></span>${buttons}</div>`;
}

/**
 * Panel info (baris kedua, di bawah HUD / di atas board) untuk stat khusus game
 * yang tidak masuk preset. Memakai data-hud yang sama, sehingga selector lama
 * game tetap bekerja. Ditempatkan di luar board agar tidak tertutup canvas
 * saat canvas diposisikan absolut ketika overlay terbuka.
 */
export function gameInfoPanelHTML({ chips = [], values = {} } = {}) {
  if (!chips.length) return "";
  return `<div class="gui-info" data-gui-info>${chips.map((chip) => chip.raw || chipHTML(chip, values)).join("")}</div>`;
}

/**
 * Kerangka overlay yang sama untuk help / cheats / pause / game-over / lobby.
 * `bodyClass` menerima mis. "gui-grid", "gui-cheats", "gui-stats", "gui-help".
 */
export function gameOverlayHTML({
  name,
  title,
  tag = "",
  body = "",
  bodyClass = "",
  note = "",
  noteAttrs = "",
  primary = "",
  primaryAction = "",
  primaryAttrs = "",
  actions = [],
  footHTML = "",
  closeLabel = "Close",
  closeAction = "",
  headExtra = "",
  bodyAttrs = "",
  wide = false,
} = {}) {
  const headRight = closeAction
    ? `<button class="gui-btn gui-btn-small" type="button" data-ui-action="${escapeHTML(closeAction)}" data-${escapeHTML(closeAction)}>${escapeHTML(closeLabel)}</button>`
    : (headExtra || (tag ? `<span class="gui-tag">${escapeHTML(tag)}</span>` : ""));
  const actionButtons = actions.map((action) =>
    `<button class="gui-btn${action.variant ? ` ${action.variant}` : ""}" type="button"${action.attrs || ""}>` +
    `${escapeHTML(action.label)}${action.icon ? iconSVG(action.icon, { size: 14 }) : ""}</button>`
  ).join("");
  const foot = footHTML || ((note || noteAttrs || primary || actionButtons)
    ? `<div class="gui-foot">` +
      ((note || noteAttrs) ? `<span class="gui-note"${noteAttrs}>${escapeHTML(note)}</span>` : "") +
      (primary ? `<button class="gui-btn gui-primary" type="button" data-ui-action="${escapeHTML(primaryAction)}" data-${escapeHTML(primaryAction)}${primaryAttrs}>${escapeHTML(primary)}</button>` : "") +
      (actionButtons ? `<div class="gui-actions">${actionButtons}</div>` : "") +
      `</div>`
    : "");
  return `<div class="gui-ov" data-ov="${escapeHTML(name)}" hidden>` +
    `<div class="gui-card${wide ? " gui-wide" : ""}">` +
    `<div class="gui-head"><h3>${title}</h3>${headRight}</div>` +
    `<div class="gui-body${bodyClass ? ` ${bodyClass}` : ""}"${bodyAttrs}>${body}</div>${foot}</div></div>`;
}

/** Akses idiomatik ke elemen HUD/overlay setelah markup dipasang. */
export function createGameUI(root, { actions = {} } = {}) {
  const app = root?.querySelector?.(".game-app");
  app?.classList.add("gui");
  const hud = root?.querySelector?.("[data-gui-hud]");
  const chip = (key) => root?.querySelector?.(`[data-chip="${CSS.escape(key)}"]`);
  const value = (key) => root?.querySelector?.(`[data-hud="${CSS.escape(key)}"]`);

  function setChip(key, next, options = {}) {
    const node = value(key);
    if (!node) return;
    if (node.tagName === "I" && node.parentElement?.classList.contains("gui-bar")) {
      node.style.width = `${Math.max(0, Math.min(100, Number(next) || 0))}%`;
    } else {
      node.textContent = next;
    }
    if (options.hidden !== undefined) chip(key)?.toggleAttribute("hidden", options.hidden);
  }

  function setButton(action, { label, icon, disabled, active } = {}) {
    const button = root?.querySelector?.(`[data-ui-action="${CSS.escape(action)}"]`);
    if (!button) return;
    if (label !== undefined) {
      const span = button.querySelector(".gui-btn-label");
      if (span) span.textContent = label;
      button.setAttribute("aria-label", label);
    }
    if (icon !== undefined) button.querySelector("svg")?.replaceWith(iconSVG(icon, { size: 14 }));
    if (disabled !== undefined) button.disabled = disabled;
    if (active !== undefined) button.classList.toggle("on", active);
  }

  function overlay(name) {
    return root?.querySelector?.(`[data-ov="${CSS.escape(name)}"]`);
  }

  function show(name) {
    const node = overlay(name);
    if (node) node.hidden = false;
  }

  function hide(name) {
    const node = overlay(name);
    if (node) node.hidden = true;
  }

  function handleKey(event) {
    const key = event.code || event.key;
    if (key === "KeyH" && actions.onHelp) { actions.onHelp(); event.preventDefault(); return true; }
    if (key === "KeyC" && actions.onCheats) { actions.onCheats(); event.preventDefault(); return true; }
    return false;
  }

  return { hud, chip, value, setChip, setButton, overlay, show, hide, handleKey };
}

/* =============================================================
 * GAME SHELL — bangun seluruh DOM statis game dari data.
 * File game tidak lagi menulis `root.innerHTML` / markup shell.
 * ============================================================= */

const SVG_TAGS = new Set([
  "svg", "g", "rect", "circle", "ellipse", "path", "line", "polyline",
  "polygon", "text", "tspan", "defs", "linearGradient", "stop", "use", "clipPath",
]);

/** Pembuat elemen DOM/SVG untuk board builder (tanpa string HTML). */
export function mk(tag, attrs = {}, parent) {
  const node = SVG_TAGS.has(tag)
    ? document.createElementNS("http://www.w3.org/2000/svg", tag)
    : document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === null || value === undefined) continue;
    if (key === "class") node.setAttribute("class", value);
    else if (key === "text") node.textContent = value;
    else node.setAttribute(key, value);
  }
  if (parent) parent.appendChild(node);
  return node;
}

/** Panel aksi game (Undo, Roll, Shoot, Hint, …) — bukan tombol HUD standar. */
export function gameControlsHTML(controls = []) {
  if (!controls.length) return "";
  const buttons = controls.map((control) => {
    const attrs = typeof control.attrs === "string"
      ? control.attrs
      : Object.entries(control.attrs || {})
        .map(([key, value]) => ` ${key}="${escapeHTML(value)}"`).join("");
    const variant = control.variant ? ` ${control.variant}` : "";
    return `<button class="gui-btn gui-btn-small${variant}" type="button"${attrs}${control.hidden ? " hidden" : ""}>` +
      (control.icon ? iconSVG(control.icon, { size: 14 }) : "") +
      (control.label ? `<span class="gui-btn-label">${escapeHTML(control.label)}</span>` : "") +
      `</button>`;
  }).join("");
  return `<div class="gui-controls" data-gui-controls>${buttons}</div>`;
}

/** Touch pad standar: D-pad + tombol aksi. */
export function gameTouchPadHTML(pad) {
  if (!pad || pad.enabled === false) return "";
  const arrows = pad.dpad === false ? "" : [
    '<div class="gui-dpad">',
    `<button class="gui-key" type="button" data-pad="u" aria-label="Up">${iconSVG("arrowUp", { size: 18 })}</button>`,
    `<button class="gui-key" type="button" data-pad="l" aria-label="Left">${iconSVG("arrowLeft", { size: 18 })}</button>`,
    `<button class="gui-key" type="button" data-pad="r" aria-label="Right">${iconSVG("arrowRight", { size: 18 })}</button>`,
    `<button class="gui-key" type="button" data-pad="d" aria-label="Down">${iconSVG("arrowDown", { size: 18 })}</button>`,
    "</div>",
  ].join("");
  const acts = (pad.actions || []).map((action) =>
    `<button class="gui-key${action.variant ? ` ${action.variant}` : ""}" type="button" ` +
    `data-pad="${escapeHTML(action.pad)}" aria-label="${escapeHTML(action.label || action.pad)}">` +
    (action.icon ? iconSVG(action.icon, { size: 18 }) : escapeHTML(action.label || action.pad)) +
    `</button>`
  ).join("");
  return `<div class="gui-pad" data-gui-pad>${arrows}<div class="gui-acts">${acts}</div></div>`;
}

function overlayBody(config) {
  if (config.body !== undefined) return config.body;
  const intro = (config.paragraphs || []).map((text) => `<p>${text}</p>`).join("");
  if (config.sections) {
    return '<div class="gui-help">' + config.sections.map((section) => {
      const paragraphs = (section.paragraphs || []).map((text) => `<p>${text}</p>`).join("");
      const items = (section.items || []).length
        ? `<ul>${section.items.map((item) => `<li>${item}</li>`).join("")}</ul>`
        : "";
      return `<div><b>${escapeHTML(section.title)}</b>${paragraphs}${items}</div>`;
    }).join("") + "</div>";
  }
  if (config.toggles || config.cardActions) {
    const attr = (item) => item.value !== undefined
      ? `="${escapeHTML(item.value)}"${item.attrs || ""}`
      : `${item.attrs || ""}`;
    const toggles = (config.toggles || []).map((toggle) =>
      `<button type="button" class="gui-toggle${toggle.on ? " on" : ""}" ` +
      `data-${escapeHTML(toggle.key)}${attr(toggle)}>${escapeHTML(toggle.label)}<em>${toggle.on ? "ON" : "OFF"}</em></button>`
    ).join("");
    const actions = (config.cardActions || []).map((action) =>
      `<button type="button" class="gui-toggle" data-${escapeHTML(action.key)}${attr(action)}>` +
      `${escapeHTML(action.label)}<em>${escapeHTML(action.hint || "RUN")}</em></button>`
    ).join("");
    return intro +
      (toggles ? `<div class="gui-cheats"${config.cheatsAttrs || ""}>${toggles}</div>` : "") +
      (actions ? (toggles ? '<div class="gui-sep">Quick actions</div>' : "") +
        `<div class="gui-cheats"${config.actionsAttrs || ""}>${actions}</div>` : "");
  }
  if (config.stats) {
    return intro + '<div class="gui-stats">' + config.stats.map((stat) =>
      `<div class="gui-stat-box"><u>${escapeHTML(stat.label)}</u>` +
      `<b data-out="${escapeHTML(stat.key)}">${escapeHTML(stat.value ?? 0)}</b></div>`
    ).join("") + "</div>";
  }
  return intro;
}

/** Semua overlay standar dari data (help / cheats / pause / over / lobby). */
export function gameOverlaysHTML(overlays = {}) {
  return Object.entries(overlays).map(([name, config]) => gameOverlayHTML({
    name,
    title: config.title || name,
    tag: config.tag || "",
    body: overlayBody(config),
    bodyClass: config.bodyClass || "",
    note: config.note || "",
    noteAttrs: config.noteAttrs || "",
    primary: config.primary || "",
    primaryAction: config.primaryAction || "",
    primaryAttrs: config.primaryAttrs || "",
    actions: config.actions || [],
    footHTML: config.footHTML || "",
    headExtra: config.headExtra || "",
    bodyAttrs: config.bodyAttrs || "",
    closeLabel: config.closeLabel || "Close",
    closeAction: config.closeAction || "",
    wide: Boolean(config.wide),
  })).join("");
}

function buildBoard(boardEl, board, create) {
  const type = board.type || "canvas";
  const refs = {};
  if (type === "canvas") {
    const canvas = document.createElement("canvas");
    canvas.className = board.className || "board-canvas";
    canvas.width = board.width || 960;
    canvas.height = board.height || 540;
    canvas.dataset.canvas = "";
    boardEl.append(canvas);
    refs.canvas = canvas;
  } else if (type === "svg") {
    refs.svg = create("svg", {
      viewBox: board.viewBox || "0 0 960 540",
      preserveAspectRatio: board.preserveAspectRatio || "xMidYMid meet",
      class: board.className || "board-svg",
    }, boardEl);
    for (const layer of board.layers || []) {
      const attrs = { ...(layer.attrs || {}) };
      if (layer.class) attrs.class = layer.class;
      if (layer.ref) attrs["data-el"] = layer.ref;
      refs[layer.ref] = create(layer.tag || "g", attrs, refs.svg);
    }
  } else if (type === "builder") {
    Object.assign(refs, board.build(boardEl, { mk: create }) || {});
  } else {
    const content = document.createElement("div");
    content.className = board.className || "board-content";
    if (board.ref) content.dataset.el = board.ref;
    boardEl.append(content);
    refs.content = content;
  }
  return refs;
}

/**
 * Bangun seluruh shell game. Satu-satunya tempat yang menyentuh DOM statis;
 * modul game hanya mengirim data + logika.
 */
export function createGameShell(root, config = {}) {
  const {
    prefix = "game",
    dataKey,
    boardClass,
    category = "arcade",
    hud = {},
    info = [],
    controls = [],
    board = {},
    overlays = {},
    pad = null,
    onBuild,
  } = config;

  const app = document.createElement("div");
  app.className = `game-app ${prefix} gui game-fill`;
  app.setAttribute(`data-${dataKey || prefix}`, "");
  app.insertAdjacentHTML("beforeend", gameHUDHTML({ category, ...hud }));
  app.insertAdjacentHTML("beforeend", gameInfoPanelHTML({ chips: info }));
  app.insertAdjacentHTML("beforeend", gameControlsHTML(controls));

  const boardEl = document.createElement("section");
  boardEl.className = `game-panel ${boardClass || `${prefix}-board`}`;
  boardEl.dataset.board = "";
  const boardRefs = buildBoard(boardEl, board, mk);
  boardEl.insertAdjacentHTML("beforeend", gameOverlaysHTML(overlays));
  app.append(boardEl);
  if (pad && typeof pad.build === "function") {
    const padEl = document.createElement("div");
    padEl.className = "gui-pad custom-pad";
    padEl.dataset.guiPad = "";
    pad.build(padEl, { mk });
    app.append(padEl);
  } else {
    app.insertAdjacentHTML("beforeend", gameTouchPadHTML(pad));
  }

  root.replaceChildren(app);

  const ui = createGameUI(root, {});
  Object.assign(ui, { app, board: boardEl, mk, ...boardRefs });
  onBuild?.(ui);
  return ui;
}
