/**
 * DOM/browser shim ringan untuk mengeksekusi modul game di Node.
 *
 * Dipakai dua tempat:
 *  - tools/build-games-manifest.mjs (ekstraksi metadata MGP di VM)
 *  - tools/lib/mount-one.mjs (smoke test mount()/build() tiap game)
 *
 * Shim ini sengaja "permissive": selector selalu mengembalikan elemen stub,
 * bukan null. Tujuannya adalah mendeteksi exception nyata (TypeError,
 * ReferenceError, logika yang throw), bukan mensimulasikan layout browser.
 * Pemeriksaan render/UI yang sesungguhnya ada di check-browser.mjs.
 */

export const NOOP = () => {};

// Timer asli Node, ditangkap sebelum installGlobals() menimpa global.
const REAL_TIMERS = {
  setTimeout: globalThis.setTimeout.bind(globalThis),
  clearTimeout: globalThis.clearTimeout.bind(globalThis),
  setInterval: globalThis.setInterval.bind(globalThis),
  clearInterval: globalThis.clearInterval.bind(globalThis),
};

/* ------------------------------------------------------------------ */
/* Resource tracker                                                    */
/* ------------------------------------------------------------------ */

export function makeResourceTracker() {
  const timers = new Map();
  const listeners = new Map();
  let seq = 0;

  function setTimeout(fn, ms, ...args) {
    const token = ++seq;
    const handle = REAL_TIMERS.setTimeout(() => {
      timers.delete(token);
      fn(...args);
    }, ms);
    timers.set(token, handle);
    return handle;
  }
  function clearTimeout(handle) {
    for (const [token, value] of timers) {
      if (value === handle) { timers.delete(token); break; }
    }
    return REAL_TIMERS.clearTimeout(handle);
  }
  function setInterval(fn, ms, ...args) {
    const token = ++seq;
    const handle = REAL_TIMERS.setInterval(fn, ms, ...args);
    timers.set(token, handle);
    return handle;
  }
  function clearInterval(handle) {
    for (const [token, value] of timers) {
      if (value === handle) { timers.delete(token); break; }
    }
    return REAL_TIMERS.clearInterval(handle);
  }
  function addListener(key, type) {
    const id = `${key}:${type}`;
    listeners.set(id, (listeners.get(id) || 0) + 1);
  }
  function removeListener(key, type) {
    const id = `${key}:${type}`;
    const next = (listeners.get(id) || 0) - 1;
    if (next <= 0) listeners.delete(id);
    else listeners.set(id, next);
  }
  function snapshot() {
    return { timers: timers.size, listeners: [...listeners.entries()].map(([k, n]) => `${k}x${n}`) };
  }
  function diff(before, after) {
    return {
      timers: after.timers - before.timers,
      listeners: after.listeners.filter((entry) => !before.listeners.includes(entry)),
    };
  }

  return { setTimeout, clearTimeout, setInterval, clearInterval, addListener, removeListener, snapshot, diff, timers };
}

/* ------------------------------------------------------------------ */
/* Element stub                                                        */
/* ------------------------------------------------------------------ */

function makeStyle() {
  const store = {
    setProperty(name, value) { store[name] = value; },
    removeProperty(name) { delete store[name]; },
    getPropertyValue(name) { return store[name] ?? ""; },
    get cssText() { return ""; },
  };
  return new Proxy(store, {
    get(target, prop) {
      if (prop in target) return target[prop];
      return "";
    },
    set(target, prop, value) { target[prop] = value; return true; },
  });
}

function makeClassList(element) {
  const classes = new Set();
  return {
    add(...names) { names.forEach((name) => { if (name) classes.add(String(name)); }); element.className = [...classes].join(" "); },
    remove(...names) { names.forEach((name) => classes.delete(String(name))); element.className = [...classes].join(" "); },
    toggle(name, force) {
      const key = String(name);
      const shouldAdd = force === undefined ? !classes.has(key) : Boolean(force);
      if (shouldAdd) classes.add(key); else classes.delete(key);
      element.className = [...classes].join(" ");
      return shouldAdd;
    },
    contains(name) { return classes.has(String(name)); },
    replace(oldName, newName) { this.remove(oldName); this.add(newName); return true; },
    get length() { return classes.size; },
    get value() { return [...classes].join(" "); },
    [Symbol.iterator]() { return classes[Symbol.iterator](); },
  };
}

function makeCanvasContext(canvas) {
  const ctx = {
    canvas,
    fillStyle: "#000000", strokeStyle: "#000000", lineWidth: 1,
    font: "10px sans-serif", textAlign: "start", textBaseline: "alphabetic",
    globalAlpha: 1, globalCompositeOperation: "source-over",
    lineCap: "butt", lineJoin: "miter", miterLimit: 10,
    shadowBlur: 0, shadowColor: "transparent", shadowOffsetX: 0, shadowOffsetY: 0,
    imageSmoothingEnabled: true, filter: "none",
    createLinearGradient() { return { addColorStop: NOOP }; },
    createRadialGradient() { return { addColorStop: NOOP }; },
    createConicGradient() { return { addColorStop: NOOP }; },
    createPattern() { return { setTransform: NOOP }; },
    measureText(text) {
      const size = String(text ?? "").length * 6;
      return { width: size, actualBoundingBoxAscent: 8, actualBoundingBoxDescent: 2 };
    },
    getImageData(x, y, w, h) {
      const width = Math.max(1, w | 0), height = Math.max(1, h | 0);
      return { width, height, data: new Uint8ClampedArray(width * height * 4) };
    },
    createImageData(w, h) {
      const width = Math.max(1, w | 0), height = Math.max(1, h | 0);
      return { width, height, data: new Uint8ClampedArray(width * height * 4) };
    },
    putImageData: NOOP,
    getLineDash() { return []; },
    setLineDash: NOOP,
    drawFocusIfNeeded: NOOP,
    isPointInPath() { return false; },
    isPointInStroke() { return false; },
  };
  return new Proxy(ctx, {
    get(target, prop) { return prop in target ? target[prop] : NOOP; },
    set(target, prop, value) { target[prop] = value; return true; },
  });
}

export function makeStubElement(tag = "div", tracker = null, key = null) {
  const tagName = String(tag || "div").toUpperCase();
  const element = {
    tagName,
    nodeName: tagName,
    nodeType: 1,
    localName: tagName.toLowerCase(),
    style: makeStyle(),
    classList: null,
    dataset: {},
    attributes: {},
    children: [],
    childNodes: [],
    parentNode: null,
    parentElement: null,
    firstChild: null,
    lastChild: null,
    nextSibling: null,
    previousSibling: null,
    innerHTML: "",
    outerHTML: "",
    textContent: "",
    innerText: "",
    className: "",
    id: "",
    value: "",
    checked: false,
    disabled: false,
    hidden: false,
    readOnly: false,
    selected: false,
    selectedIndex: 0,
    multiple: false,
    type: "text",
    name: "",
    href: "",
    src: "",
    alt: "",
    title: "",
    placeholder: "",
    width: 300,
    height: 150,
    clientWidth: 800,
    clientHeight: 500,
    offsetWidth: 800,
    offsetHeight: 500,
    scrollWidth: 800,
    scrollHeight: 500,
    scrollTop: 0,
    scrollLeft: 0,
    files: [],
    _key: key || tagName,
    _listeners: new Map(),
    _cache: new Map(),
    _context: null,

    appendChild(child) {
      if (!child) return child;
      child.parentNode = this;
      child.parentElement = this;
      this.children.push(child);
      this.childNodes.push(child);
      this.firstChild = this.children[0];
      this.lastChild = this.children[this.children.length - 1];
      return child;
    },
    append(...nodes) { nodes.forEach((node) => this.appendChild(node)); },
    prepend(...nodes) { nodes.reverse().forEach((node) => this.appendChild(node)); },
    insertBefore(child, ref) {
      const index = ref ? this.children.indexOf(ref) : -1;
      if (index < 0) return this.appendChild(child);
      child.parentNode = this;
      child.parentElement = this;
      this.children.splice(index, 0, child);
      this.childNodes.splice(index, 0, child);
      this.firstChild = this.children[0];
      return child;
    },
    replaceChild(child, old) {
      const index = this.children.indexOf(old);
      if (index < 0) return this.appendChild(child);
      this.children[index] = child;
      this.childNodes[index] = child;
      child.parentNode = this;
      child.parentElement = this;
      return old;
    },
    removeChild(child) {
      const index = this.children.indexOf(child);
      if (index >= 0) { this.children.splice(index, 1); this.childNodes.splice(index, 1); }
      child.parentNode = null;
      child.parentElement = null;
      return child;
    },
    remove() { this.parentNode?.removeChild(this); },
    hasChildNodes() { return this.children.length > 0; },
    contains() { return false; },
    cloneNode() { return makeStubElement(tagName, tracker); },
    insertAdjacentHTML: NOOP,
    getAttribute(name) { return this.attributes[String(name)] ?? null; },
    setAttribute(name, value) { this.attributes[String(name)] = String(value); },
    removeAttribute(name) { delete this.attributes[String(name)]; },
    hasAttribute(name) { return String(name) in this.attributes; },
    toggleAttribute(name, force) {
      const has = this.hasAttribute(name);
      const shouldAdd = force === undefined ? !has : Boolean(force);
      if (shouldAdd) this.setAttribute(name, ""); else this.removeAttribute(name);
      return shouldAdd;
    },
    querySelector(selector) {
      const key = String(selector);
      if (!this._cache.has(key)) this._cache.set(key, makeStubElement("div", tracker, `${this._key}>${key}`));
      return this._cache.get(key);
    },
    querySelectorAll(selector) {
      const key = `all:${selector}`;
      if (this._cache.has(key)) return this._cache.get(key);
      const list = Array.from({ length: 16 }, (_, i) => makeStubElement("div", tracker, `${this._key}>${key}[${i}]`));
      const proxy = new Proxy(list, {
        get(target, prop) {
          if (prop === "length") return target.length;
          if (typeof prop === "string" && /^\d+$/.test(prop)) {
            const index = Number(prop);
            while (target.length <= index) target.push(makeStubElement("div", tracker));
            return target[index];
          }
          return target[prop];
        },
      });
      this._cache.set(key, proxy);
      return proxy;
    },
    getElementsByClassName() { return this.querySelectorAll("class"); },
    getElementsByTagName() { return this.querySelectorAll("tag"); },
    matches() { return false; },
    closest() { return this; },
    getBoundingClientRect() {
      return {
        x: 0, y: 0, left: 0, top: 0,
        right: this.clientWidth, bottom: this.clientHeight,
        width: this.clientWidth, height: this.clientHeight,
        toJSON() { return { left: 0, top: 0, width: this.width, height: this.height }; },
      };
    },
    getClientRects() { return [this.getBoundingClientRect()]; },
    getContext(type) {
      if (!this._context) this._context = makeCanvasContext(this);
      return this._context;
    },
    toDataURL() { return "data:,"; },
    toBlob(callback) { callback?.(null); },
    createSVGPoint() {
      return { x: 0, y: 0, matrixTransform() { return { x: 0, y: 0 }; } };
    },
    getScreenCTM() { return { inverse() { return {}; } }; },
    animate() { return { finished: Promise.resolve(), cancel: NOOP, onfinish: null }; },
    getAnimations() { return []; },
    scrollIntoView: NOOP,
    setPointerCapture: NOOP,
    releasePointerCapture: NOOP,
    hasPointerCapture() { return false; },
    focus: NOOP,
    blur: NOOP,
    select: NOOP,
    setSelectionRange: NOOP,
    click() { this.dispatchEvent({ type: "click", target: this, currentTarget: this }); },
    addEventListener(type, handler) {
      if (typeof handler !== "function") return;
      const handlers = this._listeners.get(type) || [];
      handlers.push(handler);
      this._listeners.set(type, handlers);
      tracker?.addListener(this._key, type);
    },
    removeEventListener(type, handler) {
      const handlers = this._listeners.get(type) || [];
      const index = handlers.indexOf(handler);
      if (index >= 0) handlers.splice(index, 1);
      tracker?.removeListener(this._key, type);
    },
    dispatchEvent(event = {}) {
      const payload = {
        type: event.type || "event",
        target: this,
        currentTarget: this,
        preventDefault: NOOP,
        stopPropagation: NOOP,
        ...event,
      };
      (this._listeners.get(payload.type) || []).slice().forEach((handler) => {
        try { handler(payload); } catch (_) { /* event handler errors are checked in browser phase */ }
      });
      return true;
    },
  };

  element.classList = makeClassList(element);

  return new Proxy(element, {
    get(target, prop) { return prop in target ? target[prop] : NOOP; },
    set(target, prop, value) { target[prop] = value; return true; },
  });
}

/* ------------------------------------------------------------------ */
/* Storage / media / observers                                         */
/* ------------------------------------------------------------------ */

export function makeStorage() {
  const map = new Map();
  return {
    get length() { return map.size; },
    key(index) { return [...map.keys()][index] ?? null; },
    getItem(key) {
      const name = String(key);
      return map.has(name) ? map.get(name) : null;
    },
    setItem(key, value) { map.set(String(key), String(value)); },
    removeItem(key) { map.delete(String(key)); },
    clear() { map.clear(); },
  };
}

function makeAudioParam(value = 0) {
  return {
    value,
    defaultValue: value,
    setValueAtTime() { return this; },
    linearRampToValueAtTime() { return this; },
    exponentialRampToValueAtTime() { return this; },
    setTargetAtTime() { return this; },
    setValueCurveAtTime() { return this; },
    cancelScheduledValues() { return this; },
    cancelAndHoldAtTime() { return this; },
  };
}

function makeAudioNode(context) {
  const node = {
    context,
    connect(destination) { return destination; },
    disconnect: NOOP,
    start: NOOP,
    stop: NOOP,
    gain: makeAudioParam(1),
    frequency: makeAudioParam(440),
    detune: makeAudioParam(0),
    Q: makeAudioParam(1),
    playbackRate: makeAudioParam(1),
    pan: makeAudioParam(0),
    threshold: makeAudioParam(-24),
    knee: makeAudioParam(30),
    ratio: makeAudioParam(12),
    attack: makeAudioParam(0.003),
    release: makeAudioParam(0.25),
    delayTime: makeAudioParam(0),
    type: "sine",
    buffer: null,
    loop: false,
    onended: null,
    fftSize: 2048,
    frequencyBinCount: 1024,
    smoothingTimeConstant: 0.8,
    getByteFrequencyData: NOOP,
    getByteTimeDomainData: NOOP,
    getFloatFrequencyData: NOOP,
  };
  return new Proxy(node, {
    get(target, prop) { return prop in target ? target[prop] : NOOP; },
    set(target, prop, value) { target[prop] = value; return true; },
  });
}

export class FakeAudioContext {
  constructor() {
    this.currentTime = 0;
    this.sampleRate = 44100;
    this.state = "running";
    this.destination = makeAudioNode(this);
    this.listener = makeAudioNode(this);
  }
  createOscillator() { return makeAudioNode(this); }
  createGain() { return makeAudioNode(this); }
  createBiquadFilter() { return makeAudioNode(this); }
  createBufferSource() { return makeAudioNode(this); }
  createStereoPanner() { return makeAudioNode(this); }
  createDynamicsCompressor() { return makeAudioNode(this); }
  createDelay() { return makeAudioNode(this); }
  createConvolver() { return makeAudioNode(this); }
  createWaveShaper() { return makeAudioNode(this); }
  createAnalyser() { return makeAudioNode(this); }
  createChannelMerger() { return makeAudioNode(this); }
  createChannelSplitter() { return makeAudioNode(this); }
  createBuffer(channels, length, sampleRate = this.sampleRate) {
    const data = Array.from({ length: Math.max(1, channels | 0) }, () => new Float32Array(Math.max(1, length | 0)));
    return {
      numberOfChannels: Math.max(1, channels | 0),
      length: Math.max(1, length | 0),
      sampleRate,
      getChannelData(index) { return data[index] || data[0]; },
      copyFromChannel: NOOP,
      copyToChannel: NOOP,
    };
  }
  resume() { this.state = "running"; return Promise.resolve(); }
  suspend() { this.state = "suspended"; return Promise.resolve(); }
  close() { this.state = "closed"; return Promise.resolve(); }
}

class FakeObserver {
  constructor(callback) { this.callback = callback; }
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() { return []; }
}

export class FakeMutationObserver extends FakeObserver {}
export class FakeResizeObserver extends FakeObserver {}
export class FakeIntersectionObserver extends FakeObserver {}

/* ------------------------------------------------------------------ */
/* Sandbox assembly                                                    */
/* ------------------------------------------------------------------ */

export function makeSandbox({ onRegister = null, trackResources = false } = {}) {
  const tracker = trackResources ? makeResourceTracker() : null;
  const storage = makeStorage();
  const session = makeStorage();
  const timers = tracker || REAL_TIMERS;

  const documentStub = makeStubElement("#document", tracker, "document");
  const documentExtras = {
    documentElement: makeStubElement("html", tracker, "html"),
    head: makeStubElement("head", tracker, "head"),
    body: makeStubElement("body", tracker, "body"),
    createElement(tag) { return makeStubElement(tag, tracker, `new:${tag}`); },
    createElementNS(_ns, tag) { return makeStubElement(tag, tracker, `ns:${tag}`); },
    createTextNode(text) { const node = makeStubElement("#text", tracker, "text"); node.textContent = String(text); return node; },
    createDocumentFragment() { return makeStubElement("#fragment", tracker, "fragment"); },
    getElementById() { return makeStubElement("div", tracker, "byId"); },
    getElementsByClassName() { return documentStub.querySelectorAll("class"); },
    getElementsByTagName() { return documentStub.querySelectorAll("tag"); },
    activeElement: null,
    hidden: false,
    visibilityState: "visible",
    readyState: "complete",
    title: "Game Space",
  };
  Object.assign(documentStub, documentExtras);

  const windowStub = {
    innerWidth: 1280,
    innerHeight: 800,
    outerWidth: 1280,
    outerHeight: 800,
    devicePixelRatio: 1,
    scrollX: 0,
    scrollY: 0,
    localStorage: storage,
    sessionStorage: session,
    location: { href: "http://localhost:8000/", origin: "http://localhost:8000", search: "", hash: "", host: "localhost:8000", pathname: "/" },
    navigator: {
      userAgent: "game-platform-check",
      language: "id-ID",
      languages: ["id-ID", "en"],
      maxTouchPoints: 0,
      vibrate: NOOP,
      clipboard: { writeText: () => Promise.resolve(), readText: () => Promise.resolve("") },
    },
    matchMedia(query) {
      return {
        media: String(query), matches: false, onchange: null,
        addEventListener: NOOP, removeEventListener: NOOP,
        addListener: NOOP, removeListener: NOOP,
        dispatchEvent: () => false,
      };
    },
    getComputedStyle() { return makeStyle(); },
    requestAnimationFrame: (callback) => timers.setTimeout(() => callback(performance.now()), 16),
    cancelAnimationFrame: (handle) => timers.clearTimeout(handle),
    AudioContext: FakeAudioContext,
    webkitAudioContext: FakeAudioContext,
    ResizeObserver: FakeResizeObserver,
    IntersectionObserver: FakeIntersectionObserver,
    MutationObserver: FakeMutationObserver,
    addEventListener: (type, handler) => documentStub.addEventListener(`window:${type}`, handler),
    removeEventListener: (type, handler) => documentStub.removeEventListener(`window:${type}`, handler),
    alert: NOOP,
    confirm: () => true,
    prompt: () => "",
    open: () => null,
    focus: NOOP,
    blur: NOOP,
  };

  const sandbox = {
    console,
    Math,
    Date,
    JSON,
    Number,
    String,
    Array,
    Object,
    Boolean,
    Set,
    Map,
    WeakSet,
    WeakMap,
    Intl,
    Promise,
    RegExp,
    Error,
    TypeError,
    RangeError,
    Symbol,
    BigInt,
    Uint8Array,
    Uint8ClampedArray,
    Uint16Array,
    Uint32Array,
    Int8Array,
    Int16Array,
    Int32Array,
    Float32Array,
    Float64Array,
    ArrayBuffer,
    DataView,
    Reflect,
    Proxy,
    isNaN,
    isFinite,
    parseInt,
    parseFloat,
    encodeURIComponent,
    decodeURIComponent,
    encodeURI,
    decodeURI,
    structuredClone: globalThis.structuredClone?.bind(globalThis) || ((value) => JSON.parse(JSON.stringify(value))),
    queueMicrotask: globalThis.queueMicrotask?.bind(globalThis) || ((fn) => Promise.resolve().then(fn)),
    performance: globalThis.performance,
    crypto: globalThis.crypto,
    Blob: globalThis.Blob,
    URL: globalThis.URL,
    localStorage: storage,
    sessionStorage: session,
    document: documentStub,
    window: windowStub,
    navigator: windowStub.navigator,
    location: windowStub.location,
    requestAnimationFrame: windowStub.requestAnimationFrame,
    cancelAnimationFrame: windowStub.cancelAnimationFrame,
    setTimeout: timers.setTimeout,
    clearTimeout: timers.clearTimeout,
    setInterval: timers.setInterval,
    clearInterval: timers.clearInterval,
    AudioContext: FakeAudioContext,
    webkitAudioContext: FakeAudioContext,
    ResizeObserver: FakeResizeObserver,
    IntersectionObserver: FakeIntersectionObserver,
    MutationObserver: FakeMutationObserver,
    Image: class FakeImage {
      constructor() {
        this.width = 0; this.height = 0; this._src = ""; this.complete = false;
        const self = this;
        Object.defineProperty(this, "src", {
          get() { return self._src; },
          set(value) {
            self._src = String(value);
            queueMicrotask(() => {
              self.complete = true;
              if (typeof self.onload === "function") self.onload({ target: self });
            });
          },
        });
      }
      addEventListener() {}
      removeEventListener() {}
    },
    MGP_REGISTER: onRegister || NOOP,
  };
  sandbox.globalThis = sandbox;
  sandbox.self = sandbox;
  sandbox.top = sandbox;
  sandbox.parent = sandbox;

  return { sandbox, tracker, document: documentStub, window: windowStub, localStorage: storage, sessionStorage: session };
}

/**
 * Pasang shim ke globalThis Node. Dipakai sebelum dynamic import modul ESM,
 * karena kode top-level module bisa langsung menyentuh document/window.
 */
/**
 * Bundle DOM sungguhan memakai happy-dom. Dipakai oleh smoke test mount()
 * karena banyak game membangun HTML string lalu query elemen turunannya —
 * shim stub tidak bisa mem-parse innerHTML.
 */
export async function makeHappyBundle() {
  const { Window } = await import("happy-dom");
  const window = new Window({ url: "http://localhost:8000/" });
  const tracker = makeResourceTracker();

  const canvasProto = window.HTMLCanvasElement?.prototype;
  if (canvasProto) {
    canvasProto.getContext = function getContext() {
      if (!this.__mgpContext) this.__mgpContext = makeCanvasContext(this);
      return this.__mgpContext;
    };
  }

  class FakePath2D {
    constructor() {}
    addPath() {}
    closePath() {}
    moveTo() {}
    lineTo() {}
    bezierCurveTo() {}
    quadraticCurveTo() {}
    arc() {}
    arcTo() {}
    ellipse() {}
    rect() {}
    roundRect() {}
  }

  window.Path2D = FakePath2D;
  window.AudioContext = FakeAudioContext;
  window.webkitAudioContext = FakeAudioContext;
  window.ResizeObserver = FakeResizeObserver;
  window.IntersectionObserver = FakeIntersectionObserver;
  window.MutationObserver = FakeMutationObserver;
  window.matchMedia = (query) => ({
    media: String(query), matches: false, onchange: null,
    addEventListener: NOOP, removeEventListener: NOOP,
    addListener: NOOP, removeListener: NOOP,
    dispatchEvent: () => false,
  });
  if (typeof window.getComputedStyle !== "function") {
    window.getComputedStyle = () => ({
      getPropertyValue: () => "",
      setProperty: NOOP,
      removeProperty: NOOP,
    });
  }

  for (const [key, value] of [
    ["setTimeout", tracker.setTimeout],
    ["clearTimeout", tracker.clearTimeout],
    ["setInterval", tracker.setInterval],
    ["clearInterval", tracker.clearInterval],
  ]) {
    try { Object.defineProperty(globalThis, key, { value, configurable: true, writable: true }); } catch (_) {}
  }

  return { window, document: window.document, tracker };
}

export function installHappyGlobals(bundle) {
  const window = bundle.window;
  const keys = [
    "window", "document", "navigator", "location", "localStorage", "sessionStorage",
    "HTMLElement", "HTMLCanvasElement", "SVGElement", "Element", "Node",
    "DocumentFragment", "Event", "CustomEvent", "MouseEvent", "KeyboardEvent",
    "PointerEvent", "getComputedStyle", "requestAnimationFrame", "cancelAnimationFrame",
    "matchMedia", "AudioContext", "webkitAudioContext", "Path2D",
    "ResizeObserver", "IntersectionObserver", "MutationObserver", "Image",
    "DOMParser", "XMLSerializer",
  ];
  for (const key of keys) {
    const value = key === "window" ? window : window[key];
    if (value === undefined) continue;
    try { Object.defineProperty(globalThis, key, { value, configurable: true, writable: true }); } catch (_) {}
  }
  return bundle;
}

export function installGlobals(bundle) {
  const keys = [
    "document", "window", "navigator", "location", "localStorage", "sessionStorage",
    "requestAnimationFrame", "cancelAnimationFrame", "setTimeout", "clearTimeout",
    "setInterval", "clearInterval", "AudioContext", "webkitAudioContext",
    "ResizeObserver", "IntersectionObserver", "MutationObserver", "Image",
  ];
  for (const key of keys) {
    const value = key === "window" ? bundle.window : bundle.sandbox[key];
    if (value === undefined) continue;
    try {
      Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
    } catch (_) {
      // Beberapa global Node (mis. navigator) bisa non-configurable; abaikan.
    }
  }
  return bundle;
}
