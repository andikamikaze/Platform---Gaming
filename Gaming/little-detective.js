/* ==== GAME: little-detective.js ==== */
/* =============================================================
LITTLE DETECTIVE - seven-stage investigation rebuild.
Single-player detective campaign built around a persistent Main
Detective Board: WHERE -> WHAT -> WHEN -> WHO -> HOW -> WHY ->
FINAL ACCUSATION. Every case is procedurally built and validated
to be uniquely solvable. Pure inline SVG + CSS, no canvas, no
emoji, ASCII text only.
============================================================= */

import { iconSVG } from "../JS/icons.js";

export const META = {
    id: "little-detective",
    name: "Little Detective",
    category: "puzzle",
    catLabel: "Puzzle",
    desc: "Work a case across seven stages: map deduction, hidden objects, timelines, interrogations, elimination grids and motive linking.",
    art: '<svg viewBox="0 0 48 48" width="54" height="54" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><ellipse cx="21" cy="17" rx="3.4" ry="5" fill="currentColor" stroke="none"/><circle cx="21" cy="25.5" r="2.6" fill="currentColor" stroke="none"/><circle cx="20" cy="20" r="11.5"/><path d="M28.5 28.5L40 40"/></svg>',
    bg: ["#eef2f7", "#d7dfe9"],
    bestKey: "littleDetectiveBest",
};

/* ---------- tuning ---------- */
const CASE_TIME = 300;
const CASE_COUNT = 3;
const STAGE_IDS = ["where", "what", "when", "who", "how", "why"];
const PLAYER_HUE = "#2563eb";
const SUSPECT_HUES = ["#2563eb", "#7c3aed", "#dc2626", "#059669"];

/* ---------- helpers ---------- */
function mulberry32(a) {
    let t0 = a >>> 0;
    return function () {
        t0 = (t0 + 0x6d2b79f5) >>> 0;
        let t = t0;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
const ri = (r, n) => Math.floor(r() * n);
const pickR = (r, a) => a[ri(r, a.length)];
function shuffleR(r, a) {
    const b = a.slice();
    for (let i = b.length - 1; i > 0; i--) {
        const j = ri(r, i + 1);
        const tmp = b[i]; b[i] = b[j]; b[j] = tmp;
    }
    return b;
}
const esc = (s) => String(s).replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
const rxTok = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const hasTok = (text, tok) => new RegExp("\\b" + rxTok(tok) + "\\b").test(text);
const susTokens = (s) => [s.name, s.trait, s.mark];
const refsSuspect = (text, s) => susTokens(s).some((t) => hasTok(text, t));
const fmtTime = (t) => Math.floor(t / 60) + ":" + String(t % 60).padStart(2, "0");

/* ---------- suspect pool ---------- */
const POOL = [
    { id: "sam", name: "Sam", trait: "blue beanie", phrase: "the blue beanie", mark: "blue wool fibers", role: "night-shift baker", habit: "hums old radio tunes", item: "a dented flour tin", look: 0 },
    { id: "theo", name: "Theo", trait: "round glasses", phrase: "the round glasses", mark: "lens-cloth lint", role: "puzzle editor", habit: "counts his steps", item: "a pocket notebook", look: 1 },
    { id: "mia", name: "Mia", trait: "red scarf", phrase: "the red scarf", mark: "red scarf threads", role: "drama student", habit: "quotes stage plays", item: "a theatre tote", look: 3 },
    { id: "priya", name: "Priya", trait: "silver anklet", phrase: "the silver anklet", mark: "silver polish residue", role: "chess captain", habit: "taps out rhythms", item: "a chess bag", look: 2 },
    { id: "ben", name: "Ben", trait: "green cap", phrase: "the green cap", mark: "green cap fibers", role: "skate club regular", habit: "spins a coin", item: "a skate backpack", look: 0 },
    { id: "nora", name: "Nora", trait: "left-handed swing", phrase: "the left-handed swing", mark: "left-handed smear marks", role: "softball pitcher", habit: "practices dry swings", item: "a sports duffel", look: 2 },
    { id: "jax", name: "Jax", trait: "football boots", phrase: "the football boots", mark: "studded sole prints", role: "team goalie", habit: "jogs on the spot", item: "a kit bag", look: 0 },
    { id: "ivy", name: "Ivy", trait: "bubblegum", phrase: "the bubblegum habit", mark: "bubblegum wrappers", role: "comic artist", habit: "doodles in margins", item: "a pink pencil case", look: 2 },
    { id: "ava", name: "Ava", trait: "purple gloves", phrase: "the purple gloves", mark: "purple glove prints", role: "plant keeper", habit: "names every plant", item: "a pruning pouch", look: 3 },
    { id: "omar", name: "Omar", trait: "cat allergy", phrase: "the cat allergy", mark: "mint tea droplets", role: "tea critic", habit: "sniffs every cup", item: "a mint tea tin", look: 1 },
    { id: "gigi", name: "Gigi", trait: "glitter nails", phrase: "the glitter nails", mark: "fine nail glitter", role: "party planner", habit: "snaps to the beat", item: "a confetti pouch", look: 2 },
    { id: "ravi", name: "Ravi", trait: "magic tricks", phrase: "the magic tricks", mark: "coarse stage glitter", role: "street magician", habit: "shuffles a deck", item: "a black top hat", look: 1 },
];

/* ---------- hotspot slots on the shared scene ---------- */
const SLOTS = {
    sofa: { x: 436, y: 248, w: 98, h: 70 },
    table: { x: 464, y: 318, w: 156, h: 74 },
    cat: { x: 534, y: 262, w: 96, h: 58 },
    window: { x: 78, y: 40, w: 164, h: 122 },
    shelf: { x: 304, y: 122, w: 114, h: 174 },
    prints: { x: 676, y: 304, w: 46, h: 54 },
    clock: { x: 576, y: 60, w: 64, h: 64 },
    papers: { x: 360, y: 382, w: 72, h: 26 },
    door: { x: 664, y: 56, w: 112, h: 120 },
    plant: { x: 28, y: 286, w: 56, h: 96 },
    picture: { x: 484, y: 58, w: 88, h: 70 },
    lamp: { x: 238, y: 200, w: 66, h: 100 },
};

/* ---------- floor plans: three detailed 8x7 variants ---------- */
const MAP_VARIANTS = [
    [
        { id: "kitchen", name: "KITCHEN", col: 1, row: 1, cw: 2, ch: 2, fill: "#dbeafe", pattern: "stripe", items: ["door", "table", "safe"], zone: "food preparation area", mark: "flour dust", detail: "Flour dust lies by the door and the cake stand was wiped clean." },
        { id: "pantry", name: "PANTRY", col: 3, row: 1, cw: 2, ch: 2, fill: "#fef3c7", pattern: "dots", items: ["bookshelf", "door"], zone: "dry storage area", mark: "empty spice jar", detail: "An empty spice jar sits on the shelf; nothing was carried out." },
        { id: "dining", name: "DINING", col: 5, row: 1, cw: 2, ch: 2, fill: "#dcfce7", pattern: "stripe", items: ["table", "plant", "rug"], zone: "long table area", mark: "polished glass", detail: "One glass is still polished and a chair is pushed back." },
        { id: "living", name: "LIVING ROOM", col: 7, row: 1, cw: 2, ch: 2, fill: "#ede9fe", pattern: "dots", items: ["sofa", "TV", "rug"], zone: "sitting area", mark: "warm cushion", detail: "The cushion is still warm and the projector cable is unplugged." },
        { id: "study", name: "STUDY", col: 1, row: 3, cw: 2, ch: 2, fill: "#fee2e2", pattern: "hatch", items: ["bookshelf", "lamp", "clock"], zone: "desk corner", mark: "lamp shade", detail: "The desk lamp is warm and a page is still turning." },
        { id: "hall", name: "HALLWAY", col: 3, row: 3, cw: 2, ch: 2, fill: "#fef9c3", pattern: "dots", items: ["door", "window"], zone: "camera corridor", mark: "checkered tile", detail: "The camera saw three people cross, none carrying a parcel." },
        { id: "bedroom", name: "BEDROOM", col: 5, row: 3, cw: 2, ch: 2, fill: "#fce7f3", pattern: "stripe", items: ["armchair", "plant", "lamp"], zone: "sleeping area", mark: "unmade bed", detail: "The bed is unmade and a dressing gown is on the chair." },
        { id: "bath", name: "BATHROOM", col: 7, row: 3, cw: 2, ch: 2, fill: "#e0f2fe", pattern: "hatch", items: ["window", "plant"], zone: "tiled washroom", mark: "wet floor", detail: "Wet tiles near the basin; no trace was washed away here." },
        { id: "lounge", name: "LOUNGE", col: 1, row: 5, cw: 2, ch: 3, fill: "#ede9fe", pattern: "dots", items: ["bookshelf", "armchair", "rug"], zone: "quiet reading area", mark: "red bookmark", detail: "A red bookmark lies open in a novel nobody finished." },
        { id: "storage", name: "STORAGE", col: 3, row: 5, cw: 2, ch: 3, fill: "#fef3c7", pattern: "hatch", items: ["door", "table", "safe"], zone: "locked supply room", mark: "padlock", detail: "The padlock is closed and the key is still on its hook." },
        { id: "garden", name: "GARDEN", col: 5, row: 5, cw: 4, ch: 3, fill: "#d9f99d", pattern: "stripe", items: ["plant", "door"], zone: "outdoor path", mark: "wet soil", detail: "Wet soil by the gate, but the door was locked from inside." },
    ],
    [
        { id: "entry", name: "ENTRY", col: 1, row: 1, cw: 2, ch: 2, fill: "#fef3c7", pattern: "dots", items: ["door", "plant", "rug"], zone: "front entrance", mark: "doormat", detail: "The doormat is undisturbed; nobody entered this way." },
        { id: "kitchen", name: "KITCHEN", col: 3, row: 1, cw: 2, ch: 2, fill: "#dbeafe", pattern: "stripe", items: ["table", "door", "safe"], zone: "food preparation area", mark: "flour dust", detail: "Flour dust marks the worktop but no one stayed here." },
        { id: "dining", name: "DINING", col: 5, row: 1, cw: 2, ch: 2, fill: "#dcfce7", pattern: "stripe", items: ["table", "plant", "rug"], zone: "long table area", mark: "polished glass", detail: "The glasses are arranged neatly; the meal was barely touched." },
        { id: "study", name: "STUDY", col: 7, row: 1, cw: 2, ch: 2, fill: "#fee2e2", pattern: "hatch", items: ["bookshelf", "TV", "clock"], zone: "desk corner", mark: "lamp shade", detail: "The desk clock ticked on; nothing here was interrupted." },
        { id: "hall", name: "HALLWAY", col: 1, row: 3, cw: 2, ch: 2, fill: "#fef9c3", pattern: "dots", items: ["door", "window"], zone: "camera corridor", mark: "checkered tile", detail: "The hall camera logged everyone passing at 8:02 PM." },
        { id: "pantry", name: "PANTRY", col: 3, row: 3, cw: 2, ch: 2, fill: "#fef3c7", pattern: "hatch", items: ["bookshelf", "door"], zone: "dry storage area", mark: "empty spice jar", detail: "The spice jar is empty; no one reached the back shelf." },
        { id: "living", name: "LIVING ROOM", col: 5, row: 3, cw: 4, ch: 2, fill: "#ede9fe", pattern: "dots", items: ["sofa", "TV", "plant", "rug"], zone: "sitting area", mark: "warm cushion", detail: "Cushions are bunched up beside the lamp that shattered." },
        { id: "bedroom", name: "BEDROOM", col: 1, row: 5, cw: 2, ch: 3, fill: "#fce7f3", pattern: "stripe", items: ["armchair", "lamp"], zone: "sleeping area", mark: "unmade bed", detail: "The bedroom light was off and the bed was untouched." },
        { id: "bath", name: "BATHROOM", col: 3, row: 5, cw: 2, ch: 3, fill: "#e0f2fe", pattern: "hatch", items: ["window", "plant"], zone: "tiled washroom", mark: "wet floor", detail: "The floor is dry; the lamp could not have fallen in here." },
        { id: "garden", name: "GARDEN", col: 5, row: 5, cw: 4, ch: 3, fill: "#d9f99d", pattern: "stripe", items: ["plant", "door"], zone: "outdoor path", mark: "wet soil", detail: "The cat flap was used at 7:58, before the lamp broke." },
    ],
    [
        { id: "kitchen", name: "KITCHEN", col: 1, row: 1, cw: 2, ch: 2, fill: "#dbeafe", pattern: "stripe", items: ["table", "door", "safe"], zone: "food preparation area", mark: "flour dust", detail: "The cake stand was clean; nothing was taken from here." },
        { id: "study", name: "STUDY", col: 3, row: 1, cw: 2, ch: 2, fill: "#fee2e2", pattern: "hatch", items: ["bookshelf", "TV", "clock"], zone: "desk corner", mark: "lamp shade", detail: "The desk clock still runs; this room was not disturbed." },
        { id: "living", name: "LIVING ROOM", col: 5, row: 1, cw: 2, ch: 2, fill: "#ede9fe", pattern: "dots", items: ["sofa", "TV", "rug"], zone: "sitting area", mark: "warm cushion", detail: "Everyone watched the movie from this room." },
        { id: "hall", name: "HALLWAY", col: 7, row: 1, cw: 2, ch: 2, fill: "#fef9c3", pattern: "dots", items: ["door", "window"], zone: "camera corridor", mark: "checkered tile", detail: "The hall camera recorded three guests at eight o'clock." },
        { id: "pantry", name: "PANTRY", col: 1, row: 3, cw: 2, ch: 2, fill: "#fef3c7", pattern: "hatch", items: ["bookshelf", "door"], zone: "dry storage area", mark: "empty spice jar", detail: "The pantry door was shut; nobody went in during dinner." },
        { id: "dining", name: "DINING", col: 3, row: 3, cw: 4, ch: 2, fill: "#dcfce7", pattern: "stripe", items: ["table", "plant", "armchair", "rug"], zone: "long table area", mark: "polished glass", detail: "The side table by the loud story is where the ring disappeared." },
        { id: "bath", name: "BATHROOM", col: 7, row: 3, cw: 2, ch: 2, fill: "#e0f2fe", pattern: "hatch", items: ["window", "plant"], zone: "tiled washroom", mark: "wet floor", detail: "No water was disturbed; the ring was never here." },
        { id: "bedroom", name: "BEDROOM", col: 1, row: 5, cw: 2, ch: 3, fill: "#fce7f3", pattern: "stripe", items: ["armchair", "lamp"], zone: "sleeping area", mark: "unmade bed", detail: "The guest bedroom was empty throughout dinner." },
        { id: "lounge", name: "LOUNGE", col: 3, row: 5, cw: 2, ch: 3, fill: "#ede9fe", pattern: "dots", items: ["bookshelf", "armchair", "rug"], zone: "quiet reading area", mark: "red bookmark", detail: "A guest dozed here with a book, away from the table." },
        { id: "garden", name: "GARDEN", col: 5, row: 5, cw: 4, ch: 3, fill: "#d9f99d", pattern: "stripe", items: ["plant", "door"], zone: "outdoor path", mark: "wet soil", detail: "The garden gate stayed locked; no one slipped outside." },
    ],
];

const MAP_LEGEND = [
    { id: "plant", label: "Plant" }, { id: "door", label: "Door" },
    { id: "bookshelf", label: "Bookshelf" }, { id: "armchair", label: "Armchair" },
    { id: "table", label: "Table" }, { id: "TV", label: "TV" }, { id: "window", label: "Window" },
    { id: "sofa", label: "Sofa" }, { id: "rug", label: "Rug" }, { id: "clock", label: "Clock" },
    { id: "safe", label: "Safe" }, { id: "lamp", label: "Lamp" }
];

function mapItemSvg(id) {
    const p = {
        plant: '<path d="M8 14 q-4 -6 0 -9 q4 3 0 9 M8 14 q5 -5 8 -2 q-3 4 -8 2 M8 14 q-5 -4 -7 -1 q2 3 7 1" fill="#3f8f4f" stroke="#256b3a" stroke-width="1"/><rect x="5" y="13" width="6" height="4" rx="1" fill="#b5724a"/>',
        door: '<rect x="4" y="2" width="10" height="14" fill="#c98a5f" stroke="#7b5138" stroke-width="1"/><circle cx="12" cy="9" r="1" fill="#5e3c28"/>',
        bookshelf: '<rect x="3" y="2" width="12" height="14" fill="#8a5a2b"/><rect x="4" y="4" width="3" height="4" fill="#d1495b"/><rect x="8" y="4" width="3" height="4" fill="#3f7ac2"/><rect x="4" y="10" width="3" height="4" fill="#48a35e"/><rect x="8" y="10" width="3" height="4" fill="#e0a83c"/>',
        armchair: '<rect x="3" y="6" width="12" height="8" rx="3" fill="#b65440"/><rect x="4" y="3" width="10" height="5" rx="2" fill="#a34a38"/>',
        table: '<rect x="3" y="6" width="12" height="7" rx="2" fill="#9a6b40"/><rect x="4" y="13" width="2" height="3" fill="#6f4b2a"/><rect x="12" y="13" width="2" height="3" fill="#6f4b2a"/>',
        TV: '<rect x="3" y="4" width="12" height="8" rx="1" fill="#232733"/><rect x="4" y="5" width="10" height="6" fill="#bfe0ee"/><path d="M8 12v3 M5 15h6" stroke="#232733" stroke-width="1"/>',
        window: '<rect x="4" y="2" width="10" height="12" fill="#bfe0ee" stroke="#c9a06c" stroke-width="2"/><path d="M9 2v12 M4 8h10" stroke="#c9a06c" stroke-width="1"/>',
        sofa: '<rect x="2" y="7" width="15" height="7" rx="3" fill="#b65440"/><rect x="3" y="4" width="13" height="5" rx="2" fill="#a34a38"/><path d="M9 7v7" stroke="#8a3a2b" stroke-width="1"/>',
        rug: '<ellipse cx="9" cy="10" rx="8" ry="5" fill="#c08497" opacity="0.75"/><ellipse cx="9" cy="10" rx="5" ry="3" fill="none" stroke="#fff" stroke-width="1" opacity="0.8"/>',
        clock: '<circle cx="9" cy="9" r="7" fill="#f2ecd8" stroke="#6b4a32" stroke-width="1.5"/><path d="M9 9V5 M9 9l4 2" stroke="#3d3d3d" stroke-width="1.5" stroke-linecap="round"/>',
        safe: '<rect x="3" y="3" width="12" height="12" rx="2" fill="#5b6472"/><circle cx="9" cy="9" r="3" fill="none" stroke="#e8c25e" stroke-width="1.5"/><path d="M9 6v6 M6 9h6" stroke="#e8c25e" stroke-width="1"/>',
        lamp: '<polygon points="6,3 12,3 15,8 3,8" fill="#e8b04b" stroke="#8a5a2b" stroke-width="1"/><rect x="8" y="8" width="2" height="6" fill="#6b7280"/><rect x="5" y="14" width="8" height="2" rx="1" fill="#4b5563"/>'
    }[id] || "";
    return '<svg viewBox="0 0 18 18" width="40" height="40" aria-hidden="true">' + p + "</svg>";
}

function floorMapSvg(c, selected, picked, st, placements, activeSid) {
    const GX = 50, GY = 44, CW = 80, CH = 66;
    const cols = "ABCDEFGH".split("");
    const head = cols.map((letter, i) => '<text x="' + (GX + i * CW + CW / 2) + '" y="28" font-size="11" font-weight="700" fill="#4a3a2a" text-anchor="middle" font-family="monospace">' + letter + "</text>").join("");
    const rows = [1, 2, 3, 4, 5, 6, 7].map((n, i) => '<text x="26" y="' + (GY + i * CH + CH / 2 + 4) + '" font-size="11" font-weight="700" fill="#4a3a2a" text-anchor="middle" font-family="monospace">' + n + "</text>").join("");
    const anchors = [
        { x: 0.08, y: 0.05 }, { x: 0.60, y: 0.05 },
        { x: 0.08, y: 0.62 }, { x: 0.60, y: 0.62 }
    ];
    const wallItemIds = ["door", "window", "bookshelf", "safe", "clock"];
    const rooms = c.map.rooms.map((room) => {
        const x = GX + (room.col - 1) * CW;
        const y = GY + (room.row - 1) * CH;
        const w = room.cw * CW;
        const h = room.ch * CH;
        const cls = "ldx-mroom" + (selected === room.id ? " selected" : "") + (picked === room.id ? " picked" : "");
        const usedAnchors = [];
        const items = room.items.map((item) => {
            const preference = wallItemIds.indexOf(item) >= 0 ? [0, 1, 3, 2] : [2, 3, 0, 1];
            let idx = preference.find((n) => usedAnchors.indexOf(n) < 0);
            if (idx === undefined) idx = [0, 1, 2, 3].find((n) => usedAnchors.indexOf(n) < 0);
            if (idx === undefined) idx = 0;
            usedAnchors.push(idx);
            const a = anchors[idx];
            return '<g transform="translate(' + (x + a.x * w) + ',' + (y + a.y * h) + ')">' + mapItemSvg(item) + "</g>";
        }).join("");
        const mark = picked === room.id ? '<g transform="translate(' + (x + w - 20) + ',' + (y + 18) + ')"><circle r="11" fill="#fff" stroke="#b42318" stroke-width="2"/><path d="M-5 -5l10 10 M5 -5l-10 10" stroke="#b42318" stroke-width="2.5" stroke-linecap="round"/></g>' : "";
        return '<g class="' + cls + '" data-act="room-detail" data-room="' + room.id + '">' +
            '<rect class="ldx-mfill" x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" fill="' + room.fill + '"/>' +
            '<rect class="ldx-mpattern" x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" fill="url(#ldx-' + room.pattern + ')"/>' +
            '<text class="ldx-mlabel" x="' + (x + w / 2) + '" y="' + (y + h / 2 + 4) + '" font-size="10" font-weight="700" fill="#2b1a12" text-anchor="middle" pointer-events="none">' + room.name + "</text>" +
            '<g pointer-events="none">' + items + "</g>" + mark +
            '<rect class="ldx-mhit" x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" fill="transparent"/>' +
            "<title>" + room.name + "</title></g>";
    }).join("");
    const reveal = st && (st.stages.where.status === "completed" || st.stages.where.status === "confirmed");
    const spots = c.suspects.map((s, i) => {
        const roomId = reveal ? (c.map.suspectSpots.filter((x) => x.sid === s.id)[0] || {}).roomId : (placements || {})[s.id];
        if (!roomId) return "";
        const room = c.map.rooms.filter((r) => r.id === roomId)[0];
        if (!room) return "";
        const cx = GX + (room.col - 1) * CW + (room.cw * CW) / 2 + ((i % 2) ? 16 : -16);
        const cy = GY + (room.row - 1) * CH + (room.ch * CH) / 2 + (i > 1 ? 12 : -8);
        const fill = SUSPECT_HUES[i % SUSPECT_HUES.length];
        const correct = reveal || (st && st.positionsChecked && (c.map.suspectSpots.filter((x) => x.sid === s.id)[0] || {}).roomId === roomId);
        const wrong = !correct && st && st.positionsChecked;
        const stroke = correct ? "#16803C" : wrong ? "#DC2626" : "#fff";
        const cls = "ldx-msus" + (activeSid === s.id ? " active" : "");
        return '<g class="' + cls + '" pointer-events="none"><circle cx="' + cx + '" cy="' + cy + '" r="12" fill="' + fill + '" stroke="' + stroke + '" stroke-width="' + (activeSid === s.id ? 4 : 2) + '"/>' +
            '<text x="' + cx + '" y="' + (cy + 4) + '" font-size="10" font-weight="700" fill="#fff" text-anchor="middle">' + esc(s.name.charAt(0)) + "</text>" +
            '<text x="' + cx + '" y="' + (cy + 26) + '" font-size="9" font-weight="700" fill="#2b1a12" text-anchor="middle">' + esc(s.name) + "</text></g>";
    }).join("");
    return '<svg class="ldx-wmapsvg" viewBox="0 0 730 540" role="img" aria-label="Case floor map">' +
        '<defs>' +
        '<pattern id="ldx-stripe" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="8" stroke="#8a7a68" stroke-width="1" opacity="0.35"/></pattern>' +
        '<pattern id="ldx-dots" width="8" height="8" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r="1" fill="#8a7a68" opacity="0.35"/></pattern>' +
        '<pattern id="ldx-hatch" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="8" stroke="#8a7a68" stroke-width="1" opacity="0.28"/><line x1="4" y1="0" x2="4" y2="8" stroke="#8a7a68" stroke-width="1" opacity="0.28"/></pattern>' +
        "</defs>" + head + rows +
        '<rect x="' + GX + '" y="' + GY + '" width="' + (8 * CW) + '" height="' + (7 * CH) + '" fill="none" stroke="#4a3a2a" stroke-width="3"/>' +
        rooms + spots + "</svg>";
}
/* ---------- stage definitions ---------- */
const STAGES = [
    { id: "where", n: "01", label: "WHERE", title: "Map & Location Deduction", desc: "Read the scene clues and mark the crime location on the floor plan.", out: "Crime Location" },
    { id: "what", n: "02", label: "WHAT", title: "Hidden Object Search", desc: "Sweep the scene for mystery objects and collect physical evidence.", out: "Evidence & Objects" },
    { id: "when", n: "03", label: "WHEN", title: "Timeline Reconstruction", desc: "Order the evening's events using clocks, logs and schedules.", out: "Crime Time & Sequence" },
    { id: "who", n: "04", label: "WHO", title: "Interrogation & Alibis", desc: "Question each suspect, then compare their story with time and place.", out: "Suspect Identity" },
    { id: "how", n: "05", label: "HOW", title: "Elimination Grid", desc: "Cross out methods that cannot fit the trace, the timing and the access.", out: "Method & Weapon" },
    { id: "why", n: "06", label: "WHY", title: "Motive & Evidence Linking", desc: "Connect the trace, the person and the reason into one clear motive.", out: "Motive & Reason" },
    { id: "final", n: "07", label: "FINAL ACCUSATION", title: "Case Resolution", desc: "Review all six answers, attach supporting evidence and name the culprit.", out: "Case Closed" },
];

/* ---------- case themes ---------- */
const THEMES = [
    {
        id: "cake", title: "The Vanishing Cake", time: "8:15 PM", sceneNoun: "kitchen door", mapRoom: "kitchen",
        brief: "A chocolate cake vanished from the kitchen during movie night. Four friends stayed in this living room the whole time. Work the board, connect the evidence and close the case.",
        fiveW1H: {
            what: "A chocolate cake disappeared from the kitchen during movie night.",
            where: "The kitchen, near the kitchen door.",
            why: "A craving for chocolate.",
            how: "The cake was carried toward the kitchen door while everyone watched the movie.",
            whatDecoys: ["The movie projector was stolen.", "The cat escaped through the window."],
            whyDecoys: ["A plan to frame the cat.", "A broken kitchen appliance."],
            howDecoys: ["The cake melted under the lights.", "A stranger entered through the locked window."]
        },
        timeline: [
            { time: "7:50 PM", text: "The movie started and the lights dimmed." },
            { time: "8:05 PM", text: "A figure stepped away from the sofa." },
            { time: "8:15 PM", text: "The wall clock stopped and the cake vanished." },
            { time: "8:30 PM", text: "The empty cake stand was noticed." }
        ],
        slots: ["window", "shelf", "clock", "sofa", "table", "cat", "prints", "papers"],
        keySlots: ["sofa", "table", "papers"], logTitle: "Kitchen log",
        labels: { sofa: "Sofa armrest", table: "Coffee table", papers: "Old papers", cat: "Sleeping cat", window: "Window", shelf: "Bookshelf", prints: "Footprints", clock: "Wall clock" },
        fillers: {
            cat: ["Warm cushion", "Muffin the cat napped through the whole movie. Cat hair on every cushion, none on the cake stand."],
            window: ["Fogged glass", "A small hand print on the glass, too smudged to size. The latch has not moved in weeks."],
            shelf: ["Dog-eared recipe", "The cookbook falls open at the chocolate cake page, dusted with cocoa. Anyone could have browsed it."],
            prints: ["Light steps", "Small, light footprints lead toward the kitchen. No heavy boots, no slow drag marks."],
            clock: ["Stopped at 8:15", "The clock stopped at 8:15 PM, the exact minute the lights went out for the movie."],
        },
        claims: ["rewinding the movie", "making popcorn", "feeding the cat", "watching from the balcony"],
        props: '<g><ellipse cx="566" cy="331" rx="24" ry="5" fill="#d9dee7"/><rect x="562" y="318" width="8" height="13" fill="#c3cad6"/><ellipse cx="566" cy="318" rx="20" ry="4.5" fill="#eef1f6"/><circle cx="552" cy="334" r="1.6" fill="#6b4a32"/><circle cx="578" cy="335" r="1.4" fill="#6b4a32"/><circle cx="566" cy="336" r="1.2" fill="#6b4a32"/></g>',
    },
    {
        id: "lamp", title: "The Broken Lamp", time: "8:02 PM", sceneNoun: "broken lamp", mapRoom: "living",
        brief: "Grandma's favourite lamp lies in pieces. Everyone blames the cat, but the flap log says otherwise. Someone swung at something indoors. Work the board and find out who.",
        fiveW1H: {
            what: "Grandma's favourite lamp was broken by an indoor practice swing.",
            where: "The living room, beside the coffee table.",
            why: "An urge to practise a swing indoors.",
            how: "Someone stood on the sofa and swung a practice bat.",
            whatDecoys: ["The potted plant was knocked over.", "The cat flap was broken."],
            whyDecoys: ["A sudden earthquake.", "The cat was chasing a moth."],
            howDecoys: ["The lamp fell because of a power surge.", "The cat pushed the lamp from the shelf."]
        },
        timeline: [
            { time: "7:45 PM", text: "Grandma switched on the favourite lamp." },
            { time: "7:58 PM", text: "The cat flap rattled and the cat went outside." },
            { time: "8:02 PM", text: "The lamp shattered beside the coffee table." },
            { time: "8:10 PM", text: "A practice bat was found behind the door." }
        ],
        slots: ["door", "clock", "shelf", "plant", "sofa", "table", "lamp", "prints"],
        keySlots: ["lamp", "table", "shelf"], logTitle: "Practice log",
        labels: { lamp: "Broken lamp", table: "Coffee table", shelf: "Bookshelf", prints: "Footprints", sofa: "Sofa cushions", door: "Behind the door", plant: "Potted plant", clock: "Wall clock" },
        fillers: {
            prints: ["Smooth soles", "The floor prints are smooth-soled and light. No sports cleats, no heavy heels."],
            sofa: ["Scrambled cushions", "The cushions are bunched up - someone stood on the sofa to swing at something."],
            door: ["Behind the door", "A practice bat leans behind the door, far higher than a cat could ever reach."],
            plant: ["Snapped leaves", "Two leaves are snapped off as if something flew across the room."],
            clock: ["Two minutes apart", "The cat flap rattled at 7:58 PM and the lamp shattered at 8:02 PM. The cat was already outside."],
        },
        claims: ["doing homework at the desk", "stretching by the door", "watering the plant", "reading on the sofa"],
        props: '<g><path d="M262 214 l10 12 M282 210 l-8 14" stroke="#8a5a2b" stroke-width="2.5" fill="none"/><polygon points="246,306 300,306 288,276 258,276" fill="#e8b04b" transform="rotate(24 272 292)"/><polygon points="252,352 262,344 266,354" fill="#f2c66a"/><polygon points="284,350 294,342 298,352" fill="#f2c66a"/><polygon points="270,360 278,354 282,362" fill="#e8b04b"/></g>',
    },
    {
        id: "ring", title: "The Missing Ring", time: "8:00 PM", sceneNoun: "side table", mapRoom: "dining",
        brief: "During a cozy dinner party, Aunt Rose's ring vanished from the side table. The door was locked and the window shut. One of the four guests is hiding a trick.",
        fiveW1H: {
            what: "Aunt Rose's ring disappeared from the side table during dinner.",
            where: "The side table in the dinner-party room.",
            why: "To keep a valuable ring for personal use.",
            how: "The ring was palmed during a loud story and hidden in a personal item.",
            whatDecoys: ["The picture frame was stolen.", "The window latch was damaged."],
            whyDecoys: ["The ring was planted as a joke.", "The cat wanted a shiny toy."],
            howDecoys: ["The ring fell into the plant pot.", "A visitor took it through the locked window."]
        },
        timeline: [
            { time: "7:40 PM", text: "Guests sat down for dinner." },
            { time: "7:55 PM", text: "A loud story drew every eye away from the side table." },
            { time: "8:00 PM", text: "The clock chimed and the ring was gone." },
            { time: "8:12 PM", text: "Aunt Rose noticed the empty velvet box." }
        ],
        slots: ["window", "clock", "picture", "shelf", "plant", "sofa", "table", "cat"],
        keySlots: ["shelf", "sofa", "picture"], logTitle: "Guest log",
        labels: { shelf: "Top shelf", sofa: "Between cushions", picture: "Picture frame", table: "Coffee table", window: "Window", cat: "Sleeping cat", clock: "Wall clock", plant: "Potted plant" },
        fillers: {
            table: ["Loud story", "Right before the ring vanished someone told a booming story about a rabbit. Every eye left the side table."],
            window: ["Locked tight", "The latch is locked from the inside. Nobody came in or out that way."],
            cat: ["Clean cat", "Muffin is spotless - no ring hidden in that fur. One guest kept sneezing on the far sofa."],
            clock: ["The chime", "The clock chimed eight as the lights flickered. The ring was gone seconds later."],
            plant: ["Stirred soil", "The soil was stirred up but nothing is buried. A decoy - classic misdirection."],
        },
        claims: ["admiring the picture frame", "refilling drinks at the sideboard", "petting the cat", "checking the window latch"],
        props: '<g><rect x="330" y="86" width="44" height="26" rx="3" fill="#232733"/><rect x="330" y="102" width="44" height="6" fill="#7c3aed"/><rect x="322" y="110" width="60" height="7" rx="3" fill="#1a1d27"/><ellipse cx="566" cy="331" rx="14" ry="4" fill="#d9dee7"/><ellipse cx="566" cy="329" rx="10" ry="3" fill="#f4f6fa"/></g>',
    },
];

/* ---------- case generation ---------- */
function keyText(t, c, label, th) {
    if (t === 0) return "Traces of " + c.mark + " on the " + label.toLowerCase() + ". Only " + c.name + " - " + c.phrase + " - leaves that signature.";
    if (t === 1) return "The sign-in log places " + c.name + " beside the " + th.sceneNoun + " at " + th.time + ", minutes before it happened.";
    return "A witness sketch shows " + c.mark + " near the " + th.sceneNoun + ". The initials beneath: " + c.name.charAt(0) + ".";
}
const KEY_TITLES = ["Trace evidence", "", "Witness doodle"];

function buildCase(rngSeed, idx) {
    const r = mulberry32(rngSeed);
    const th = THEMES[idx % THEMES.length];
    const variantIdx = idx % MAP_VARIANTS.length;
    const variant = MAP_VARIANTS[variantIdx];
    const answerRoomData = variant.filter((room) => room.id === th.mapRoom)[0];
    const cast = shuffleR(r, POOL).slice(0, 4).map((s, i) => Object.assign({}, s, { hue: SUSPECT_HUES[i], claim: "" }));
    const claims = shuffleR(r, th.claims);
    cast.forEach((s, i) => { s.claim = claims[i]; });
    const cul = pickR(r, cast);
    const others = cast.filter((s) => s.id !== cul.id);
    const keyT = shuffleR(r, [0, 1, 2]);

    const hotspots = th.slots.map((sid) => {
        const pos = SLOTS[sid];
        const label = th.labels[sid];
        const ki = th.keySlots.indexOf(sid);
        if (ki >= 0) {
            const t = keyT[ki];
            const title = t === 1 ? th.logTitle : KEY_TITLES[t];
            return { id: sid, x: pos.x, y: pos.y, w: pos.w, h: pos.h, label: label, clue: { title: title, text: keyText(t, cul, label, th), key: true } };
        }
        const f = th.fillers[sid];
        return { id: sid, x: pos.x, y: pos.y, w: pos.w, h: pos.h, label: label, clue: { title: f[0], text: f[1], key: false } };
    });
    const fillerIds = th.slots.filter((s) => th.keySlots.indexOf(s) < 0);
    const exonSlots = shuffleR(r, fillerIds).slice(0, 2);
    const exonSus = shuffleR(r, others).slice(0, 2);
    exonSlots.forEach((sid, i) => {
        const h = hotspots.filter((x) => x.id === sid)[0];
        const o = exonSus[i];
        h.clue = { title: "Cleared: " + o.name, text: o.name + " shows up on the porch camera at " + th.time + " - " + o.phrase + " is unmistakable. Ruled out.", key: false };
    });

    const specialWhen = th.slots.includes("clock") ? "clock" : th.slots[0];
    const specialWhy = th.slots.includes("papers") ? "papers" : th.slots.includes("door") ? "door" : th.slots.includes("picture") ? "picture" : th.slots[1];
    const targetIds = Array.from(new Set([specialWhen, specialWhy].concat(shuffleR(r, th.slots)))).slice(0, 5);

    const timeline = th.timeline.map((e, i) => ({ id: "t" + i, time: e.time, text: e.text, order: i }));
    const timelineDisplay = shuffleR(r, timeline).map((e) => e.id);

    const interrogation = cast.map((s) => ({
        sid: s.id,
        alibi: '"' + s.claim + '" - camera log at ' + th.time + (s.id === cul.id ? " shows no matching trace." : " confirms this."),
        whereabouts: "I spent the evening " + s.habit + ".",
        item: "I always carry " + s.item + "."
    }));

    const methods = shuffleR(r, [th.fiveW1H.how].concat(th.fiveW1H.howDecoys.slice(0, 2)));
    const grid = {
        rows: cast.map((s) => ({ id: s.id, label: s.name })),
        cols: methods.map((m, i) => ({ id: "m" + i, label: m })),
        answerRow: cul.id,
        answerCol: "m" + methods.indexOf(th.fiveW1H.how),
        rules: [
            "Trace: " + cul.mark + " belongs to " + cul.name + " alone.",
            "Camera: the other three were away from " + th.sceneNoun + " at " + th.time + ".",
            "Method: the incident fits only one description of what happened."
        ]
    };

    const motive = {
        nodes: [
            { id: "trace", label: "Trace: " + cul.mark, kind: "evidence" },
            { id: "item", label: "Carries: " + cul.item, kind: "evidence" },
            { id: "person", label: cul.name + " (" + cul.trait + ")", kind: "person" },
            { id: "motive", label: th.fiveW1H.why, kind: "motive" },
            { id: "d1", label: th.fiveW1H.whyDecoys[0], kind: "motive" },
            { id: "d2", label: th.fiveW1H.whyDecoys[1], kind: "motive" }
        ],
        links: [{ a: "trace", b: "person" }, { a: "person", b: "motive" }, { a: "item", b: "motive" }],
        answer: th.fiveW1H.why
    };

    const evidence = [
        { id: "e-loc", label: "Scene log", text: "A scene log was filed for this evening's incident.", stage: "where", key: false },
        { id: "e-clock", label: "Wall clock", text: "The wall clock stopped at " + th.time + ".", stage: "when", key: true },
        { id: "e-cam", label: "Porch camera", text: others.slice(0, 2).map((s) => s.name).join(" and ") + " appear away from the scene at " + th.time + ".", stage: "who", key: false },
        { id: "e-trace", label: "Trace sample", text: "A trace sample was recovered near the scene. Match pending.", stage: "how", key: true },
        { id: "e-item", label: "Personal item", text: "A personal item was found at the scene. Owner unconfirmed.", stage: "why", key: false }
    ];
    hotspots.filter((h) => h.clue.key).forEach((h, i) => {
        evidence.push({ id: "e-key" + i, label: h.clue.title, text: h.clue.text, stage: "what", key: true });
    });

    const answers = {
        where: th.fiveW1H.where,
        what: th.fiveW1H.what,
        when: th.time,
        who: cul.name,
        how: th.fiveW1H.how,
        why: th.fiveW1H.why
    };

    const room = answerRoomData || variant[0];
    const firstItem = (room.items[0] || "door");
    const itemLabel = (MAP_LEGEND.filter((l) => l.id === firstItem)[0] || { label: firstItem }).label;
    const clueDefs = [
        { id: "c-foot", label: "FOOTPRINTS", text: "Small, light footprints lead toward the " + room.zone + ".", pointsTo: room.zone, why: "Only one room is logged as the " + room.zone + "." },
        { id: "c-log", label: "SIGN-IN LOG", text: "The sign-in log places a figure beside the " + room.mark + " at " + th.time + ".", pointsTo: room.mark, why: "The " + room.mark + " is recorded in a single room." },
        { id: "c-clock", label: "BROKEN CLOCK", text: "The wall clock stopped at " + th.time + " in the room with a " + itemLabel.toLowerCase() + ".", pointsTo: itemLabel, why: "Several rooms have one, so this clue needs a partner." },
        { id: "c-trace", label: "FRESH TRACE", text: "A fresh trace was found on the " + room.mark + ".", pointsTo: room.mark, why: "The " + room.mark + " narrows the search to one room." },
        { id: "c-window", label: "WINDOW LATCH", text: "The window latch has not moved; the route stayed indoors, near the " + room.zone + ".", pointsTo: room.zone, why: "Too broad on its own, but useful with a second clue." }
    ];
    const supportClueIds = shuffleR(r, ["c-foot", "c-log", "c-trace"]).slice(0, 2);
    clueDefs.forEach((cl) => {
        if (supportClueIds.indexOf(cl.id) < 0) {
            cl.text = "This observation is too general to identify a single room on its own.";
            cl.pointsTo = "a broad part of the house";
            cl.why = "Too vague to identify one room on its own.";
        }
    });
    const otherRoomIds = shuffleR(r, variant.filter((x) => x.id !== room.id).map((x) => x.id)).slice(0, 3);
    let spotIndex = 0;
    const suspectSpots = cast.map((s) => ({
        sid: s.id,
        name: s.name,
        look: s.look,
        roomId: s.id === cul.id ? room.id : otherRoomIds[spotIndex++]
    }));

    return {
        themeId: th.id, title: th.title, brief: th.brief, time: th.time, sceneNoun: th.sceneNoun,
        props: th.props, suspects: cast, culpritId: cul.id, hotspots, specialWhen, specialWhy, targetIds,
        timeline: timeline, timelineDisplay: timelineDisplay, interrogation: interrogation,
        clearedIds: others.map((s) => s.id), grid: grid, motive: motive, evidence: evidence, answers: answers,
        map: {
            variant: variantIdx,
            rooms: variant,
            answerRoom: room.id,
            caseNo: "CASE #00" + (idx + 1) + "120",
            stamp: ["Monday, August 4, 1980 - 2:44 AM", "Thursday, March 12, 1981 - 8:02 PM", "Sunday, June 7, 1981 - 8:00 PM"][idx % 3],
            sceneText: "Six hundred gold bars, that's where it all began. The scene was sealed before anyone could search it.",
            victim: "Last seen near the " + th.sceneNoun + " at " + th.time + ".",
            clues: clueDefs,
            supportClueIds: supportClueIds,
            suspectSpots: suspectSpots,
            evidence: [
                { label: "Morse code", text: "An unidentified Morse code message was found near the " + th.sceneNoun + "." },
                { label: "Stuck compass", text: "A compass with a stuck needle points toward the " + th.sceneNoun + "." }
            ],
            statements: cast.map((s) => {
                const spot = suspectSpots.filter((x) => x.sid === s.id)[0];
                const spotRoom = variant.filter((x) => x.id === spot.roomId)[0];
                return {
                    sid: s.id, name: s.name, role: s.role, look: s.look,
                    hint: "Camera at " + th.time + ": " + s.name + " was logged in the " + spotRoom.zone + ", beside the " + spotRoom.mark + ".",
                    quote: '"I kept to the ' + spotRoom.zone + ', right by the ' + spotRoom.mark + ', the whole evening."'
                };
            }),
            legend: MAP_LEGEND
        },
        cctv: "Playback " + th.time + ": a figure crosses the room - " + cul.phrase + ". Build and gait match " + cul.name + "."
    };
}

/* uniqueness: exactly one suspect may be referenced by >=2 key clues */
function solveCase(c) {
    const counts = {};
    c.suspects.forEach((s) => { counts[s.id] = 0; });
    c.hotspots.forEach((h) => {
        if (!h.clue.key) return;
        const t = h.clue.title + " " + h.clue.text;
        c.suspects.forEach((s) => { if (refsSuspect(t, s)) counts[s.id]++; });
    });
    const winners = Object.keys(counts).filter((id) => counts[id] >= 2);
    const ok = winners.length === 1 && winners[0] === c.culpritId &&
        Object.keys(counts).every((id) => id === c.culpritId || counts[id] === 0);
    return { ok: ok, counts: counts };
}

function checkCaseData(c) {
    const errors = [];
    const ids = c.suspects.map((s) => s.id);
    if (c.suspects.length !== 4 || new Set(ids).size !== 4) errors.push("suspects must be 4 unique");
    if (ids.indexOf(c.culpritId) < 0) errors.push("culpritId not in suspects");
    if (c.hotspots.length !== 8 || new Set(c.hotspots.map((h) => h.id)).size !== 8) errors.push("hotspots must be 8 unique");
    const keys = c.hotspots.filter((h) => h.clue.key);
    if (keys.length !== 3) errors.push("need exactly 3 key clues");
    const cul = c.suspects.filter((s) => s.id === c.culpritId)[0];
    if (cul) {
        keys.forEach((h) => {
            const t = h.clue.title + " " + h.clue.text;
            if (!refsSuspect(t, cul)) errors.push("key clue without culprit ref: " + h.id);
            c.suspects.forEach((s) => {
                if (s.id !== cul.id && refsSuspect(t, s)) errors.push("key clue refs other suspect " + s.id + ": " + h.id);
            });
        });
        c.hotspots.forEach((h) => { if (!h.clue.key && refsSuspect(h.clue.title + " " + h.clue.text, cul)) errors.push("filler refs culprit: " + h.id); });
    }
    if (!c.map.rooms || !c.map.rooms.some((room) => room.id === c.map.answerRoom)) errors.push("invalid map answer");
    if (!c.map.rooms || c.map.rooms.length < 8 || new Set(c.map.rooms.map((room) => room.id)).size !== c.map.rooms.length) errors.push("need at least eight unique map rooms");
    if (!c.map.rooms || c.map.rooms.some((room) => !(room.col >= 1 && room.col <= 8) || !(room.row >= 1 && room.row <= 7) || !(room.cw >= 1) || !(room.ch >= 1) || room.col + room.cw - 1 > 8 || room.row + room.ch - 1 > 7)) errors.push("invalid map grid rooms");
    if (!c.map.caseNo || !c.map.stamp || !c.map.sceneText || !c.map.victim) errors.push("incomplete case file sheet");
    if (!c.map.clues || c.map.clues.length !== 5) errors.push("need five map clues");
    if (!c.map.supportClueIds || c.map.supportClueIds.length !== 2 || !c.map.supportClueIds.every((id) => c.map.clues.some((cl) => cl.id === id))) errors.push("need two valid supporting clue ids");
    if (!c.map.suspectSpots || c.map.suspectSpots.length !== 4 || !c.map.suspectSpots.every((spot) => c.map.rooms.some((room) => room.id === spot.roomId))) errors.push("invalid suspect positions");
    if (c.map.suspectSpots && !c.map.suspectSpots.some((spot) => spot.sid === c.culpritId && spot.roomId === c.map.answerRoom)) errors.push("culprit position mismatch");
    if (!c.map.evidence || c.map.evidence.length !== 2) errors.push("need two case-file evidence items");
    if (!c.map.statements || c.map.statements.length !== 4 || !c.map.statements.every((s) => s.sid && s.hint && s.quote)) errors.push("need four suspect statements with hints");
    if (c.map.statements && c.map.statements.some((s) => {
        const spot = c.map.suspectSpots.filter((x) => x.sid === s.sid)[0];
        const room = c.map.rooms.filter((x) => x.id === spot.roomId)[0];
        return s.hint.indexOf(room.zone) < 0 || s.quote.indexOf(room.zone) < 0 || s.hint.indexOf(room.mark) < 0 || s.quote.indexOf(room.mark) < 0;
    })) errors.push("suspect statement does not match the mapped position");
    if (!c.map.legend || c.map.legend.length !== 12) errors.push("need twelve map legend entries");
    if (c.timeline.length !== 4 || new Set(c.timeline.map((e) => e.id)).size !== 4) errors.push("need four timeline events");
    if (c.timelineDisplay.length !== 4 || new Set(c.timelineDisplay).size !== 4) errors.push("invalid timeline display order");
    if (c.grid.rows.length !== 4 || c.grid.cols.length !== 3) errors.push("invalid elimination grid");
    if (!c.grid.rows.some((row) => row.id === c.grid.answerRow) || !c.grid.cols.some((col) => col.id === c.grid.answerCol)) errors.push("grid answer invalid");
    if (c.motive.nodes.length < 5 || c.motive.links.length !== 3) errors.push("invalid motive node set");
    if (c.evidence.length < 6) errors.push("need an evidence pool");
    if (!c.answers || STAGE_IDS.some((id) => !c.answers[id])) errors.push("need six stage answers");
    if (!solveCase(c).ok) errors.push("case is not uniquely solvable");
    return { ok: errors.length === 0, errors: errors };
}

const caseCache = new Map();
function generateCase(seed, idx) {
    const ck = (seed >>> 0) + "|" + idx;
    if (caseCache.has(ck)) return caseCache.get(ck);
    let c = null;
    for (let attempt = 0; attempt < 96; attempt++) {
        c = buildCase((seed + attempt * 7919) >>> 0, idx);
        if (checkCaseData(c).ok) break;
    }
    if (caseCache.size > 240) caseCache.clear();
    caseCache.set(ck, c);
    return c;
}
const caseOf = (st) => generateCase((st.seed + st.salt * 104729) >>> 0, st.caseIdx);

/* ---------- state + reducer ---------- */
function newStageMap() {
    const m = {};
    STAGES.forEach((s) => { m[s.id] = { status: "locked", answer: null, tries: 0, started: false }; });
    m.where.status = "available";
    return m;
}
function initialState() {
    return {
        v: 3, seed: (Math.random() * 4294967296) >>> 0, salt: 0, caseIdx: 0, phase: "lobby",
        view: "hub", activeStage: null, stages: newStageMap(),
        found: [], readClues: [], mapPickedClues: [], suspectPlacements: {}, positionsChecked: false, positionsOk: false, timelineOrder: [], whoAsked: {}, whoMarks: {}, gridMarks: {},
        motiveLinks: [], motiveSel: null, links: {}, pairLinks: [], finalPick: null, hints: { when: false, why: false },
        score: 0, timeLeft: CASE_TIME, cheats: { reveal: false, keys: false, freeze: false, unlock: false, whereHints: false },
        cheated: false, banner: null, log: [], result: null, rev: 0,
    };
}
function pushLog(st, msg) { st.log.push(msg); st.log = st.log.slice(-8); }
function setupCase(st, idx, salt) {
    st.caseIdx = idx; st.salt = salt;
    st.view = "hub"; st.activeStage = null; st.stages = newStageMap();
    st.found = []; st.readClues = []; st.mapPickedClues = []; st.suspectPlacements = {}; st.positionsChecked = false; st.positionsOk = false; st.timelineOrder = []; st.whoAsked = {}; st.whoMarks = {};
    st.gridMarks = {}; st.motiveLinks = []; st.motiveSel = null; st.links = {}; st.pairLinks = [];
    st.finalPick = null; st.hints = { when: false, why: false }; st.timeLeft = CASE_TIME;
    st.banner = null; st.result = null; st.phase = "brief";
}
function resetMatch(st) {
    st.seed = (Math.random() * 4294967296) >>> 0;
    st.salt = 0; st.caseIdx = 0; st.score = 0;
    st.cheats = { reveal: false, keys: false, freeze: false, unlock: false, whereHints: false };
    st.cheated = false; st.log = [];
    setupCase(st, 0, 0);
    st.phase = "lobby";
}
function refreshUnlocks(st, c) {
    const s = st.stages;
    const avail = (id) => { if (s[id].status === "locked") s[id].status = "available"; };
    const conf = (id) => s[id].status === "confirmed";
    if (conf("where")) avail("what");
    if (conf("what") || st.hints.when) avail("when");
    if (conf("when")) avail("who");
    if (conf("who")) avail("how");
    if (conf("how") || (st.hints.why && conf("what"))) avail("why");
    if (STAGE_IDS.every(conf)) avail("final");
    if (st.cheats.unlock) STAGES.forEach((x) => avail(x.id));
}
function isOpen(st, id) { return st.stages[id] && st.stages[id].status !== "locked"; }
function completeStage(st, id, answer, reveal, c) {
    const s = st.stages[id];
    if (!s || s.status === "confirmed") return;
    s.status = "completed"; s.answer = answer; s.tries = 0;
    st.score += 25;
    st.banner = { tag: "SOLVED", text: reveal + " Link supporting evidence, then confirm this deduction.", stage: id };
    pushLog(st, id.toUpperCase() + " solved (+25).");
    refreshUnlocks(st, c);
}
function markIncorrect(st, id, msg) {
    const s = st.stages[id];
    if (!s || s.status === "confirmed") return;
    s.status = "incorrect"; s.tries++;
    st.score = Math.max(0, st.score - 5);
    st.banner = { tag: "INCORRECT", text: msg + " Review the clues and try again.", stage: id };
    pushLog(st, id.toUpperCase() + " answer rejected (-5).");
}
function winCase(st, c) {
    const timeB = Math.floor(st.timeLeft / 5);
    const pts = 100 + timeB + 50;
    st.score += pts;
    st.result = { ok: true, pts: pts, timeB: timeB, culpritId: c.culpritId };
    st.phase = "result"; st.view = "hub"; st.activeStage = null;
    pushLog(st, "Case closed (+" + pts + ").");
}
function failCase(st, c) {
    st.result = { ok: false, reason: "Out of time - the trail went cold.", culpritId: c.culpritId };
    st.phase = "result"; st.view = "hub"; st.activeStage = null;
    pushLog(st, "Case failed: out of time.");
}
function evidenceLinked(st, stageId) {
    return Object.keys(st.links).some((eid) => (st.links[eid] || []).indexOf(stageId) >= 0);
}

function applyToState(st, a, seat, env) {
    if (!st || !a) return false;
    const t = a.t;
    const c = caseOf(st);
    const ph = st.phase;

    if (t === "hello") return true;
    if (t === "restart" || (t === "replay" && ph === "final")) return "reset";

    if (t === "cheat") {
        if (!Object.prototype.hasOwnProperty.call(st.cheats, a.key)) return false;
        st.cheats[a.key] = !st.cheats[a.key];
        if (st.cheats[a.key]) st.cheated = true;
        pushLog(st, "Cheat " + a.key + (st.cheats[a.key] ? " on." : " off."));
        refreshUnlocks(st, c);
        return true;
    }
    if (t === "cheat-collect") {
        if (ph !== "play") return false;
        c.hotspots.forEach((h) => { if (!st.found.some((f) => f.id === h.id)) st.found.push({ id: h.id }); });
        st.hints.when = true; st.hints.why = true; st.cheated = true;
        st.banner = { tag: "INFO", text: "Cheat: all scene objects collected." };
        refreshUnlocks(st, c);
        return true;
    }
    if (t === "cheat-solve") {
        if (ph !== "play") return false;
        st.cheated = true;
        winCase(st, c);
        return true;
    }
    if (t === "cheat-autofill") {
        if (ph !== "play" || st.activeStage !== "where") return false;
        st.cheated = true;
        st.mapPickedClues = c.map.supportClueIds.slice();
        st.suspectPlacements = {};
        c.map.suspectSpots.forEach((spot) => { st.suspectPlacements[spot.sid] = spot.roomId; });
        st.positionsChecked = true;
        st.positionsOk = true;
        st.banner = { tag: "INFO", text: "Cheat: WHERE answers filled. Mark the highlighted room to continue." };
        return true;
    }
    if (t === "tick") {
        if (ph !== "play" || st.cheats.freeze) return false;
        st.timeLeft--;
        if (st.timeLeft <= 0) { st.timeLeft = 0; failCase(st, c); return true; }
        return true;
    }

    if (ph === "lobby") { if (t !== "start") return false; st.phase = "brief"; return true; }
    if (ph === "brief") { if (t !== "begin") return false; st.phase = "play"; st.view = "hub"; return true; }
    if (ph === "result") {
        if (t === "next" && st.result && st.result.ok) {
            if (st.caseIdx + 1 < CASE_COUNT) setupCase(st, st.caseIdx + 1, st.salt);
            else st.phase = "final";
            return true;
        }
        if (t === "retry" && st.result && !st.result.ok) { setupCase(st, st.caseIdx, st.salt + 1); return true; }
        return false;
    }
    if (ph !== "play") return false;

    if (t === "banner-x") { st.banner = null; return true; }
    if (t === "back") { st.view = "hub"; st.activeStage = null; return true; }
    if (t === "open-view") {
        if (a.view !== "hub" && a.view !== "evidence") return false;
        st.view = a.view; st.activeStage = null;
        return true;
    }
    if (t === "stage-start") {
        const s = st.stages[a.id];
        if (!s || s.status !== "available") return false;
        s.status = "in-progress"; s.started = true;
        st.view = "stage"; st.activeStage = a.id;
        st.banner = null;
        if (a.id === "what") st.readClues = c.map.clues.slice();
        return true;
    }
    if (t === "stage-open") {
        if (!isOpen(st, a.id)) return false;
        if (st.stages[a.id].status === "available") st.stages[a.id].status = "in-progress";
        st.view = "stage"; st.activeStage = a.id;
        st.banner = null;
        if (a.id === "what") st.readClues = c.map.clues.slice();
        return true;
    }

    const active = st.activeStage;
    if (t === "confirm-stage") {
        const id = a.id;
        if (!isOpen(st, id) || st.stages[id].status !== "completed") return false;
        if (!evidenceLinked(st, id)) {
            st.banner = { tag: "INFO", text: "Link at least one evidence item to " + id.toUpperCase() + " on the Evidence Board first.", stage: id };
            return true;
        }
        st.stages[id].status = "confirmed";
        st.score += 15;
        st.banner = { tag: "CONFIRMED", text: id.toUpperCase() + " is now confirmed with supporting evidence." };
        pushLog(st, id.toUpperCase() + " confirmed (+15).");
        refreshUnlocks(st, c);
        return true;
    }

    if (t === "place-suspect") {
        if (active !== "where" || !isOpen(st, "where")) return false;
        if (!c.suspects.some((s) => s.id === a.sid)) return false;
        if (!c.map.rooms.some((room) => room.id === a.room)) return false;
        st.suspectPlacements[a.sid] = a.room;
        st.positionsChecked = false;
        st.positionsOk = false;
        return true;
    }
    if (t === "check-positions") {
        if (active !== "where" || !isOpen(st, "where")) return false;
        if (c.suspects.some((s) => !st.suspectPlacements[s.id])) return false;
        const correct = c.map.suspectSpots.filter((spot) => st.suspectPlacements[spot.sid] === spot.roomId).length;
        st.positionsChecked = true;
        st.positionsOk = correct === 4;
        st.banner = { tag: correct === 4 ? "CONFIRMED" : "INFO", text: correct === 4 ? "All four suspect positions match the alibis and clues." : correct + " of 4 positions match the alibis. Review the whereabouts and try again." };
        return true;
    }
    if (t === "clue-toggle") {
        if (active !== "where" || !isOpen(st, "where")) return false;
        if (!c.map.clues.some((cl) => cl.id === a.cid)) return false;
        const i = st.mapPickedClues.indexOf(a.cid);
        if (i >= 0) st.mapPickedClues.splice(i, 1);
        else {
            if (st.mapPickedClues.length >= 2) return false;
            st.mapPickedClues.push(a.cid);
        }
        return true;
    }
    if (t === "map-pick") {
        if (active !== "where" || !isOpen(st, "where")) return false;
        if (st.mapPickedClues.length !== 2 || !st.positionsOk) return false;
        const pickedClues = st.mapPickedClues.slice().sort().join(",");
        const support = c.map.supportClueIds.slice().sort().join(",");
        const roomName = c.map.rooms.filter((x) => x.id === a.room)[0].name;
        if (a.room === c.map.answerRoom && pickedClues === support) {
            completeStage(st, "where", c.map.answerRoom, "Crime location identified: " + roomName + ". Suspect positions are now revealed.", c);
        } else if (a.room !== c.map.answerRoom) {
            markIncorrect(st, "where", "That room does not match the two clues you marked.");
        } else {
            markIncorrect(st, "where", "The room fits, but those two clues do not support it. Choose the specific clues.");
        }
        return true;
    }

    if (t === "hidden-search") {
        if (active !== "what" || !isOpen(st, "what")) return false;
        const h = c.hotspots.filter((x) => x.id === a.hid)[0];
        if (!h || st.found.some((f) => f.id === h.id)) return false;
        st.found.push({ id: h.id });
        st.score += h.clue.key ? 25 : 10;
        if (h.id === c.specialWhen) st.hints.when = true;
        if (h.id === c.specialWhy) st.hints.why = true;
        if (c.targetIds.every((id) => st.found.some((f) => f.id === id))) {
            completeStage(st, "what", c.targetIds.length + " objects", "All " + c.targetIds.length + " mystery objects recovered.", c);
        } else {
            st.banner = { tag: "CLUE", text: h.clue.title + " - " + h.clue.text, stage: "what" };
        }
        pushLog(st, "Found " + h.clue.title + ".");
        refreshUnlocks(st, c);
        return true;
    }

    if (t === "timeline-pick") {
        if (active !== "when" || !isOpen(st, "when")) return false;
        if (st.timelineOrder.indexOf(a.eid) >= 0) return false;
        st.timelineOrder.push(a.eid);
        return true;
    }
    if (t === "timeline-reset") { if (active !== "when") return false; st.timelineOrder = []; return true; }
    if (t === "timeline-submit") {
        if (active !== "when" || !isOpen(st, "when")) return false;
        const correct = c.timeline.slice().sort((x, y) => x.order - y.order).map((e) => e.id);
        if (st.timelineOrder.length !== 4 || st.timelineOrder.join(",") !== correct.join(",")) {
            markIncorrect(st, "when", "That order conflicts with the clock and the log.");
        } else {
            completeStage(st, "when", c.time, "Timeline reconstructed: the incident happened at " + c.time + ".", c);
        }
        return true;
    }

    if (t === "who-ask") {
        if (active !== "who" || !isOpen(st, "who")) return false;
        const q = st.whoAsked[a.sid] || [];
        if (q.indexOf(a.q) >= 0) return false;
        q.push(a.q);
        st.whoAsked[a.sid] = q;
        st.score += 2;
        return true;
    }
    if (t === "who-mark") {
        if (active !== "who" || !isOpen(st, "who")) return false;
        if (!c.suspects.some((s) => s.id === a.sid)) return false;
        st.whoMarks[a.sid] = a.mark;
        const ok = c.suspects.every((s) => s.id === c.culpritId ? st.whoMarks[s.id] === "suspect" : st.whoMarks[s.id] === "cleared");
        if (ok) {
            const cul = c.suspects.filter((s) => s.id === c.culpritId)[0];
            completeStage(st, "who", cul.id, "Interrogation complete: " + cul.name + " is the only suspect left.", c);
        } else if (c.suspects.every((s) => !!st.whoMarks[s.id])) {
            markIncorrect(st, "who", "That reading does not fit the camera log.");
        }
        return true;
    }

    if (t === "grid-mark") {
        if (active !== "how" || !isOpen(st, "how")) return false;
        const k = a.row + ":" + a.col;
        const cur = st.gridMarks[k] || "?";
        st.gridMarks[k] = cur === "?" ? "Y" : cur === "Y" ? "N" : "?";
        return true;
    }
    if (t === "grid-check") {
        if (active !== "how" || !isOpen(st, "how")) return false;
        let ok = true;
        c.grid.rows.forEach((row) => {
            c.grid.cols.forEach((col) => {
                const want = row.id === c.grid.answerRow && col.id === c.grid.answerCol ? "Y" : "N";
                if ((st.gridMarks[row.id + ":" + col.id] || "?") !== want) ok = false;
            });
        });
        if (ok) {
            const answer = c.grid.cols.filter((x) => x.id === c.grid.answerCol)[0].label;
            completeStage(st, "how", answer, "Method reconstructed: " + answer, c);
        } else markIncorrect(st, "how", "The grid still has cells that conflict with the evidence.");
        return true;
    }

    if (t === "motive-pick") {
        if (active !== "why" || !isOpen(st, "why")) return false;
        if (!c.motive.nodes.some((n) => n.id === a.nid)) return false;
        if (!st.motiveSel) { st.motiveSel = a.nid; return true; }
        if (st.motiveSel === a.nid) { st.motiveSel = null; return true; }
        const pair = { a: st.motiveSel, b: a.nid };
        if (!st.motiveLinks.some((l) => (l.a === pair.a && l.b === pair.b) || (l.a === pair.b && l.b === pair.a))) st.motiveLinks.push(pair);
        st.motiveSel = null;
        return true;
    }
    if (t === "motive-unlink") {
        if (active !== "why") return false;
        st.motiveLinks = st.motiveLinks.filter((_, i) => i !== a.idx);
        return true;
    }
    if (t === "motive-check") {
        if (active !== "why" || !isOpen(st, "why")) return false;
        const ok = c.motive.links.every((need) => st.motiveLinks.some((l) => (l.a === need.a && l.b === need.b) || (l.a === need.b && l.b === need.a)));
        if (ok) completeStage(st, "why", c.motive.answer, "Motive identified: " + c.motive.answer, c);
        else markIncorrect(st, "why", "Those links do not connect the trace, the person and the reason.");
        return true;
    }

    if (t === "link-stage") {
        if (!c.evidence.some((e) => e.id === a.eid)) return false;
        if (!STAGE_IDS.includes(a.sid)) return false;
        const list = st.links[a.eid] || [];
        if (list.indexOf(a.sid) < 0) {
            list.push(a.sid);
            st.score += 5;
        }
        st.links[a.eid] = list;
        return true;
    }
    if (t === "link-pair") {
        if (!c.evidence.some((e) => e.id === a.eid)) return false;
        if (!st.pairSel) { st.pairSel = a.eid; return true; }
        if (st.pairSel === a.eid) { st.pairSel = null; return true; }
        const key = [st.pairSel, a.eid].sort().join("|");
        if (!st.pairLinks.some((p) => p.key === key)) st.pairLinks.push({ key: key, a: st.pairSel, b: a.eid });
        st.pairSel = null;
        return true;
    }
    if (t === "unlink-pair") {
        st.pairLinks = st.pairLinks.filter((p) => p.key !== a.key);
        return true;
    }

    if (t === "final-close") {
        if (active !== "final" || !isOpen(st, "final")) return false;
        if (a.sid !== c.culpritId) { markIncorrect(st, "final", "That person is not supported by the evidence."); return true; }
        if (!STAGE_IDS.every((id) => st.stages[id].status === "confirmed" && evidenceLinked(st, id))) {
            st.banner = { tag: "INFO", text: "Every deduction must be confirmed and linked to evidence before you close the case." };
            return true;
        }
        winCase(st, c);
        return true;
    }
    return false;
}

/* ---------- living-room scene ---------- */
const SCENE = `
<g>
  <rect x="0" y="0" width="800" height="300" fill="#5b6884"/><rect x="0" y="258" width="800" height="42" fill="#4e5a73"/><rect x="0" y="300" width="800" height="140" fill="#8a6b4d"/>
  <g stroke="#7a5b40" stroke-width="2">
    <line x1="0" y1="332" x2="800" y2="332"/><line x1="0" y1="366" x2="800" y2="366"/><line x1="0" y1="402" x2="800" y2="402"/><line x1="130" y1="300" x2="118" y2="332"/><line x1="420" y1="300" x2="408" y2="332"/><line x1="690" y1="300" x2="678" y2="332"/>
    <line x1="260" y1="332" x2="248" y2="366"/><line x1="560" y1="332" x2="572" y2="366"/><line x1="120" y1="366" x2="132" y2="402"/><line x1="500" y1="366" x2="488" y2="402"/><line x1="720" y1="366" x2="708" y2="402"/>
  </g>
  <ellipse cx="440" cy="382" rx="235" ry="46" fill="#a8435a"/><ellipse cx="440" cy="382" rx="186" ry="35" fill="#c05a72"/><ellipse cx="440" cy="382" rx="120" ry="22" fill="#a8435a" opacity="0.6"/>
  <rect x="72" y="34" width="176" height="134" rx="6" fill="#1c2542"/>
  <g fill="#f8fafc" opacity="0.85"><circle cx="104" cy="58" r="1.6"/><circle cx="132" cy="48" r="1.3"/><circle cx="158" cy="66" r="1.5"/><circle cx="122" cy="92" r="1.3"/><circle cx="96" cy="118" r="1.4"/><circle cx="182" cy="120" r="1.4"/><circle cx="146" cy="140" r="1.2"/><circle cx="236" cy="94" r="1.4"/></g>
  <circle cx="206" cy="72" r="15" fill="#f2ecd8"/><circle cx="211" cy="67" r="4" fill="#ddd6bd"/>
  <line x1="160" y1="34" x2="160" y2="168" stroke="#c9a06c" stroke-width="7"/><line x1="72" y1="101" x2="248" y2="101" stroke="#c9a06c" stroke-width="7"/>
  <rect x="72" y="34" width="176" height="134" rx="6" fill="none" stroke="#c9a06c" stroke-width="9"/><rect x="60" y="166" width="200" height="12" rx="4" fill="#b08a55"/>
  <rect x="300" y="118" width="122" height="182" rx="6" fill="#6b4a32"/><rect x="312" y="130" width="98" height="158" rx="3" fill="#57391f"/>
  <rect x="316" y="152" width="11" height="24" fill="#d1495b"/><rect x="329" y="148" width="10" height="28" fill="#3f7ac2"/><rect x="341" y="154" width="12" height="22" fill="#48a35e"/><rect x="355" y="150" width="9" height="26" fill="#e0a83c"/><rect x="366" y="156" width="13" height="20" fill="#8a5fbf"/><rect x="381" y="150" width="10" height="26" fill="#c96a52"/><rect x="393" y="155" width="11" height="21" fill="#3f8fa3"/><rect x="312" y="176" width="98" height="5" fill="#3d2814"/>
  <rect x="316" y="202" width="10" height="24" fill="#48a35e"/><rect x="328" y="198" width="12" height="28" fill="#d1495b"/><rect x="342" y="204" width="9" height="22" fill="#e0a83c"/><rect x="353" y="200" width="11" height="26" fill="#3f7ac2"/><rect x="366" y="206" width="12" height="20" fill="#8a5fbf"/><rect x="380" y="199" width="10" height="27" fill="#c96a52"/><rect x="392" y="203" width="12" height="23" fill="#3f8fa3"/><rect x="312" y="226" width="98" height="5" fill="#3d2814"/>
  <rect x="316" y="252" width="12" height="24" fill="#e0a83c"/><rect x="330" y="256" width="10" height="20" fill="#3f7ac2"/><rect x="342" y="250" width="11" height="26" fill="#48a35e"/><rect x="355" y="254" width="9" height="22" fill="#d1495b"/><rect x="370" y="252" width="10" height="24" fill="#8a5fbf" transform="rotate(-14 375 276)"/><rect x="392" y="262" width="12" height="14" fill="#e0a83c"/><rect x="312" y="276" width="98" height="5" fill="#3d2814"/>
  <rect x="486" y="62" width="84" height="64" rx="4" fill="#8a6b4d"/><rect x="494" y="70" width="68" height="48" fill="#bfe0ee"/><circle cx="530" cy="82" r="7" fill="#f5c542"/>
  <polygon points="494,118 514,94 536,118" fill="#6f9ec9"/><polygon points="518,118 540,98 562,118" fill="#5b8bbd"/>
  <circle cx="608" cy="92" r="30" fill="#f4ead5" stroke="#6b4a32" stroke-width="6"/><circle cx="608" cy="92" r="24" fill="none" stroke="#d9c9a3" stroke-width="2"/>
  <line x1="608" y1="92" x2="608" y2="75" stroke="#3d3d3d" stroke-width="3" stroke-linecap="round"/><line x1="608" y1="92" x2="621" y2="99" stroke="#3d3d3d" stroke-width="3" stroke-linecap="round"/><circle cx="608" cy="92" r="2.6" fill="#3d3d3d"/>
  <rect x="668" y="56" width="106" height="244" rx="5" fill="#7b5138"/><rect x="682" y="74" width="78" height="84" rx="4" fill="none" stroke="#5e3c28" stroke-width="5"/><rect x="682" y="182" width="78" height="86" rx="4" fill="none" stroke="#5e3c28" stroke-width="5"/><circle cx="678" cy="164" r="5" fill="#e8c25e"/><circle cx="678" cy="174" r="2.2" fill="#5e3c28"/>
  <ellipse cx="270" cy="240" rx="36" ry="9" fill="#f5d78a" opacity="0.45"/><polygon points="242,240 298,240 286,204 254,204" fill="#e8b04b"/><polygon points="247,240 293,240 284,209 256,209" fill="#f2c66a"/>
  <rect x="266" y="240" width="8" height="106" fill="#4a4a55"/><ellipse cx="270" cy="348" rx="27" ry="7" fill="#4a4a55"/>
  <ellipse cx="56" cy="312" rx="10" ry="27" fill="#3f8f4f"/><ellipse cx="42" cy="318" rx="9" ry="22" fill="#4a9c5a" transform="rotate(-18 42 318)"/><ellipse cx="70" cy="318" rx="9" ry="22" fill="#357a44" transform="rotate(16 70 318)"/>
  <polygon points="38,334 74,334 68,378 44,378" fill="#b5724a"/><rect x="33" y="326" width="46" height="12" rx="3" fill="#c98a5f"/>
  <rect x="418" y="224" width="230" height="58" rx="12" fill="#b65440"/><rect x="402" y="246" width="32" height="72" rx="12" fill="#a34a38"/><rect x="632" y="246" width="32" height="72" rx="12" fill="#a34a38"/>
  <rect x="440" y="276" width="90" height="40" rx="10" fill="#c96a52"/><rect x="534" y="276" width="90" height="40" rx="10" fill="#c96a52"/><rect x="446" y="250" width="36" height="36" rx="9" fill="#e8c25e" transform="rotate(-8 464 268)"/>
  <rect x="412" y="316" width="10" height="16" fill="#5e3c28"/><rect x="644" y="316" width="10" height="16" fill="#5e3c28"/>
  <path d="M552 292 q-16 -2 -12 -18" fill="none" stroke="#8a8fa3" stroke-width="6" stroke-linecap="round"/><ellipse cx="578" cy="292" rx="27" ry="13" fill="#8a8fa3"/><circle cx="602" cy="281" r="10" fill="#8a8fa3"/>
  <polygon points="595,273 597,263 603,272" fill="#8a8fa3"/><polygon points="604,272 609,263 611,273" fill="#8a8fa3"/><path d="M598 281 q2 2 4 0 M605 281 q2 2 4 0" fill="none" stroke="#3d3d4a" stroke-width="1.4" stroke-linecap="round"/>
  <rect x="468" y="336" width="148" height="11" rx="4" fill="#9a6b40"/><rect x="480" y="347" width="9" height="42" fill="#82582f"/><rect x="594" y="347" width="9" height="42" fill="#82582f"/>
  <rect x="522" y="321" width="15" height="15" rx="3" fill="#d1495b"/><path d="M537 325 q8 3 0 8" fill="none" stroke="#d1495b" stroke-width="3"/><circle cx="505" cy="330" r="6" fill="#c98a5f"/><circle cx="503" cy="328" r="1.6" fill="#8a5a2b"/>
  <g transform="rotate(-4 396 394)"><rect x="364" y="390" width="64" height="11" rx="2" fill="#e8e4da"/><rect x="371" y="385" width="50" height="8" rx="2" fill="#f6f3ea"/><rect x="378" y="380" width="38" height="6" rx="2" fill="#e8e4da"/></g>
  <g fill="#5f4630"><ellipse cx="702" cy="318" rx="7" ry="12"/><ellipse cx="688" cy="342" rx="6" ry="10" opacity="0.7"/><ellipse cx="714" cy="346" rx="5.5" ry="9" opacity="0.55"/></g>
</g>`;

function portraitSvg(look, pal, w) {
    const n = ((pal % 4) + 4) % 4;
    const L = ((look % 4) + 4) % 4;
    const w0 = w || 52;
    const skin = ["#f1c27d", "#ffdbac", "#e0ac69", "#a9713f"][n];
    const hairC = ["#4a3728", "#22232a", "#b06a2c", "#3a3f4a"][n];
    const suit = ["#3f5878", "#6a4a6e", "#7a4a3a", "#2f6a52"][n];
    let lookSvg = "";
    if (L === 0) {
        lookSvg = '<rect x="19" y="6" width="22" height="13" rx="3" fill="' + hairC + '"/><rect x="19" y="14" width="22" height="3.5" fill="#b91c1c"/><ellipse cx="30" cy="19" rx="19" ry="4.5" fill="' + hairC + '"/>';
    } else if (L === 1) {
        lookSvg = '<path d="M14 27 a16 16 0 0 1 32 0 q-6 -5 -16 -5 q-10 0 -16 5 z" fill="' + hairC + '"/><circle cx="24" cy="28" r="5" fill="none" stroke="#263238" stroke-width="1.8"/><circle cx="36" cy="28" r="5" fill="none" stroke="#263238" stroke-width="1.8"/><path d="M29 28h2" stroke="#263238" stroke-width="1.8"/>';
    } else if (L === 2) {
        lookSvg = '<path d="M30 11 A17 17 0 0 0 13 28 V40 H19 V31 A11 11 0 0 1 41 31 V40 H47 V28 A17 17 0 0 0 30 11 Z" fill="' + hairC + '"/><circle cx="15" cy="41.5" r="1.8" fill="#fbbf24"/><circle cx="45" cy="41.5" r="1.8" fill="#fbbf24"/>';
    } else {
        lookSvg = '<path d="M23 35 q7 5 14 0" fill="none" stroke="' + hairC + '" stroke-width="3" stroke-linecap="round"/><path d="M15 46 Q30 38 45 46 L45 56 Q30 66 15 56 Z" fill="#b91c1c"/><path d="M20 50h20M19 55h22" stroke="#7f1d1d" stroke-width="2"/>';
    }
    return '<svg viewBox="0 0 60 64" width="' + w0 + '" height="' + Math.round((w0 * 64) / 60) + '" role="img" aria-hidden="true">' +
        '<path d="M10 63 Q30 44 50 63 Z" fill="' + suit + '"/><polygon points="26,62 30,52 34,62" fill="#e8e8ee"/>' +
        '<circle cx="30" cy="29" r="16" fill="' + skin + '"/><circle cx="24" cy="28" r="1.9" fill="#263238"/><circle cx="36" cy="28" r="1.9" fill="#263238"/>' +
        '<path d="M21 24 q3 -2 6 0 M33 24 q3 -2 6 0" fill="none" stroke="' + hairC + '" stroke-width="1.6" stroke-linecap="round"/>' +
        '<path d="M26 37 q4 3 8 0" fill="none" stroke="#8a4a3a" stroke-width="2" stroke-linecap="round"/>' +
        lookSvg + "</svg>";
}

function hl(text, c) {
    if (!c._hl) {
        const map = {};
        const toks = [];
        c.suspects.forEach((s) => { susTokens(s).forEach((t) => { map[t] = s.hue; toks.push(t); }); });
        toks.sort((a, b) => b.length - a.length);
        c._hl = { re: new RegExp("\\b(" + toks.map(rxTok).join("|") + ")\\b", "g"), map: map };
    }
    return esc(text).replace(c._hl.re, (m) => {
        const hue = c._hl.map[m] || "#b45309";
        return '<mark class="ldx-m" style="background:' + hue + '1f;color:' + hue + '">' + m + "</mark>";
    });
}

/* =============================================================
mount
============================================================= */
export function mount(root, context = {}) {
    const { onExit = () => { } } = context;
    let state = null;
    let destroyed = false;
    let timerId = null;
    let best = 0;
    try { best = Number(localStorage.getItem(META.bestKey)) || 0; } catch (e) { best = 0; }

    const ui = { help: false, cheats: false, paused: false, brief: false, evTab: "stage", pairSel: null, whereDetail: null, whereModal: null, activeSuspect: null, dismissedRev: -1, lastTickAt: 0 };

    let seenHelp = true;
    try { seenHelp = localStorage.getItem("littleDetectiveHelpSeen") === "1"; } catch (e) { seenHelp = true; }
    if (!seenHelp) {
        ui.help = true;
        try { localStorage.setItem("littleDetectiveHelpSeen", "1"); } catch (e) { /* storage blocked */ }
    }

    root.innerHTML = `
<style>
.ldx{--panel:var(--color-surface);--panel-muted:var(--color-surface-muted);--ink:var(--color-text);--mut:var(--color-text-muted);--line:var(--color-border);--acc:var(--color-primary);--acc-hover:var(--color-primary-hover);--ok:var(--color-success);--bad:var(--color-danger);--warn:var(--color-warning);color:var(--ink);font:14px/1.45 system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;display:flex;flex-direction:column;gap:8px;width:100%;max-width:1120px;margin:0 auto;padding:10px;min-width:0;-webkit-tap-highlight-color:transparent}
.ldx *{box-sizing:border-box}
.ldx button{font:inherit;color:inherit;touch-action:manipulation}
.ldx :where(svg,img){max-width:100%;height:auto}
.ldx :where(button,[role="button"]):focus-visible{outline:2px solid var(--acc);outline-offset:2px}
.ldx-hud{display:flex;align-items:center;gap:7px;flex-wrap:wrap;font:600 11px/1 ui-monospace,SFMono-Regular,Menlo,monospace;min-width:0}
.ldx-spacer{flex:1 1 auto}
.ldx-chip{font-size:10px;text-transform:uppercase;letter-spacing:.5px;color:var(--mut);white-space:nowrap}
.ldx-chip b{color:var(--ink);font-size:11.5px;margin-left:3px}
.ldx-status{display:inline-flex;align-items:center;gap:6px;font-size:10px;color:var(--mut);white-space:nowrap}
.ldx .game-status-dot{width:8px;height:8px;border-radius:50%;background:var(--ok);display:inline-block;animation:ldxBlink 2s infinite}
@keyframes ldxBlink{0%,100%{opacity:1}50%{opacity:.35}}
.ldx-btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;background:var(--panel);border:1px solid var(--line);border-radius:9px;padding:7px 12px;font-size:12px;font-weight:600;cursor:pointer;transition:background .18s,border-color .18s}
.ldx-btn:hover:not(:disabled){background:var(--panel-muted);border-color:var(--line-strong)}
.ldx-btn:disabled{opacity:.45;cursor:default}
.ldx-btn.pri,.ldx-btn.acc{background:var(--acc);border-color:var(--acc);color:var(--color-on-primary)}
.ldx-btn.pri:hover:not(:disabled),.ldx-btn.acc:hover:not(:disabled){background:var(--acc-hover);border-color:var(--acc-hover)}
.ldx-btn.icon{min-width:32px;padding:5px 8px;font-size:11px}
.ldx-btn.icon svg{flex:none;display:block}
.ldx-btn.on{border-color:var(--acc);color:var(--acc)}
.ldx-timebar{height:3px;background:var(--line);border-radius:2px;overflow:hidden;flex:0 0 auto}
.ldx-timebar i{display:block;height:100%;background:var(--acc);width:100%;transition:width .5s linear}
.ldx-board{position:relative;background:transparent;border:0;padding:0;display:flex;flex-direction:column;min-height:0;overflow:hidden}
.ldx.game-fill>.ldx-board{flex:1 1 auto;min-height:0}
.ldx-view{flex:1 1 auto;min-height:0;overflow:auto;display:flex;flex-direction:column;gap:10px;padding-right:2px}
.ldx-banner{display:flex;align-items:flex-start;gap:8px;background:var(--color-warning-soft);border:1px solid var(--color-warning);border-radius:10px;padding:8px 10px;font-size:12.5px;line-height:1.45;flex:0 0 auto}
.ldx-banner.inc{background:var(--color-danger-soft);border-color:var(--bad)}
.ldx-banner.ok{background:var(--color-success-soft);border-color:var(--ok)}
.ldx-btag{flex:0 0 auto;font-size:10px;font-weight:700;letter-spacing:.6px;color:var(--warn);border:1px solid currentColor;border-radius:6px;padding:2px 6px;background:var(--panel)}
.ldx-banner.inc .ldx-btag{color:var(--bad)}
.ldx-banner.ok .ldx-btag{color:var(--ok)}
.ldx-btxt{flex:1;min-width:0}
.ldx-bx{flex:0 0 auto;border:0;background:none;color:var(--mut);cursor:pointer;font-weight:700;padding:0 2px}
.ldx-m{padding:0 3px;border-radius:4px;font-weight:600}
.ldx-casehead{display:flex;gap:12px;align-items:flex-start;justify-content:space-between;background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:12px 14px;flex:0 0 auto;flex-wrap:wrap}
.ldx-kicker{display:block;font-size:10px;font-weight:700;letter-spacing:.8px;text-transform:uppercase;color:var(--acc)}
.ldx-casehead h2{margin:3px 0 4px;font-size:20px;line-height:1.25;letter-spacing:-.01em}
.ldx-casehead p{margin:0;font-size:12.5px;color:var(--mut);max-width:680px;line-height:1.5}
.ldx-prog{display:flex;flex-direction:column;align-items:flex-end;gap:5px;min-width:150px}
.ldx-prog b{font-size:20px}
.ldx-prog span{font-size:10px;text-transform:uppercase;letter-spacing:.6px;color:var(--mut)}
.ldx-pbar{width:160px;height:4px;border-radius:4px;background:var(--line);overflow:hidden}
.ldx-pbar i{display:block;height:100%;background:var(--ok)}
.ldx-pinboard{position:relative;width:100%;min-height:560px;flex:1 1 auto;background:var(--color-surface-muted);border:1px solid var(--line);border-radius:12px;overflow:hidden}
.ldx-wire{position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:1}
.ldx-wire line{stroke-width:1;vector-effect:non-scaling-stroke}
.ldx-pinned{position:absolute;left:calc(var(--x)*1%);top:calc(var(--y)*1%);width:calc(var(--w)*1%);background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:10px 11px;transform:rotate(var(--rot,0deg));z-index:2;transition:border-color .18s}
.ldx-pinned:hover{border-color:var(--acc);z-index:4}
.ldx-pin{position:absolute;top:-8px;left:-8px;width:17px;height:17px;border-radius:50%;background:var(--panel);border:1px solid var(--acc);color:var(--acc);display:flex;align-items:center;justify-content:center}
.ldx-pin svg{width:10px;height:10px}
.ldx-pinned :where(h2,h3){margin:0 0 6px;font-size:12px;line-height:1.3}
.ldx-pinned p{margin:0;font-size:11px;color:var(--mut);line-height:1.4}
.ldx-pinned .ldx-prog{align-items:flex-start;min-width:0;margin-top:8px}
.ldx-snum{font:700 11px/1 ui-monospace,SFMono-Regular,Menlo,monospace;color:var(--mut);border:1px solid var(--line);border-radius:6px;padding:5px 7px}
.ldx-pstage{display:flex;flex-direction:column;align-items:flex-start;gap:5px;width:100%;text-align:left;background:none;border:0;padding:0;cursor:pointer}
.ldx-pstage:disabled{cursor:default}
.ldx-pstage.current .ldx-snum{color:var(--acc);border-color:var(--acc)}
.ldx-steplabel{font-size:10px;font-weight:800;letter-spacing:.6px;color:var(--ink)}
.ldx-steptitle{font-size:11px;color:var(--mut);line-height:1.35}
.ldx-pstage .ldx-sstatus{margin-top:2px}
.ldx-susgrid{display:grid;grid-template-columns:1fr 1fr;gap:6px}
.ldx-susgrid .ldx-suscard{padding:6px 7px;border-radius:8px;flex-wrap:wrap;gap:4px}
.ldx-susgrid .ldx-suscard>svg{width:26px;height:auto}
.ldx-susgrid .ldx-suscard>div{flex:1 1 70px}
.ldx-susgrid .ldx-suscard .ldx-wstat{margin-left:0}
.ldx-sstatus{display:inline-flex;align-items:center;gap:4px;font-size:9.5px;font-weight:700;text-transform:uppercase;letter-spacing:.4px;border:1px solid var(--line);border-radius:6px;padding:3px 6px;color:var(--mut);background:var(--panel-muted);white-space:nowrap}
.ldx-sstatus svg{width:12px;height:12px;flex:none}
.ldx-sstatus.available{color:var(--warn);border-color:var(--warn);background:var(--color-warning-soft)}
.ldx-sstatus.in-progress{color:var(--acc);border-color:var(--acc);background:var(--color-primary-soft)}
.ldx-sstatus.completed{color:var(--ok);border-color:var(--ok);background:var(--color-success-soft)}
.ldx-sstatus.confirmed{color:var(--ok);border-color:var(--ok);background:var(--color-success-soft)}
.ldx-sstatus.incorrect{color:var(--bad);border-color:var(--bad);background:var(--color-danger-soft)}
.ldx-sec{display:flex;justify-content:space-between;align-items:center;font-size:10.5px;font-weight:700;letter-spacing:.8px;text-transform:uppercase;color:var(--mut);margin-top:2px}
.ldx-suscard{display:flex;align-items:center;gap:8px;background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:9px 10px;min-width:0}
.ldx-suscard>div{flex:1;min-width:0}
.ldx-suscard b{display:block;font-size:12.5px}
.ldx-suscard span{font-size:10.5px;color:var(--mut)}
.ldx-suscard .ldx-wstat{margin-left:auto}
.ldx-nextstep{display:flex;align-items:flex-start;gap:8px;background:var(--panel);border:1px solid var(--line);border-left:3px solid var(--acc);border-radius:10px;padding:8px 10px;font-size:11.5px;line-height:1.4;color:var(--ink)}
.ldx-nextstep svg{flex:none;color:var(--acc);margin-top:1px}
.ldx-pinned .ldx-file{border:0;padding:0;background:none}
.ldx-file{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:10px;display:flex;flex-direction:column;gap:6px}
.ldx-file h3{margin:0;font-size:13px}
.ldx-file p{margin:0;font-size:11.5px;color:var(--mut);line-height:1.45}
.ldx-evsum{display:flex;flex-direction:column;gap:5px}
.ldx-evrow{display:flex;align-items:center;gap:6px;font-size:11px;padding:3px 6px;border:1px solid var(--line);border-radius:8px;background:var(--panel-muted)}
.ldx-evrow b{min-width:84px;font-size:10px;letter-spacing:.5px}
.ldx-evrow span{color:var(--mut)}
.ldx-evrow svg{color:var(--acc);flex:none}
.ldx-evrow.done b{color:var(--ok)}
.ldx-stage{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:14px;display:flex;flex-direction:column;gap:11px;flex:1 1 auto}
.ldx-stagehead{display:flex;align-items:flex-start;gap:10px 8px;flex-wrap:wrap}
.ldx-stagehead>div{flex:1 1 180px;min-width:0}
.ldx-stagehead h2{margin:2px 0 3px;font-size:18px;line-height:1.25;overflow-wrap:anywhere}
.ldx-stagehead p{margin:0;font-size:12px;color:var(--mut)}
.ldx-stagehead .ldx-sstatus{margin-left:auto}
.ldx-stagebody{display:flex;flex-direction:column;gap:10px;min-width:0}
.ldx-stagefoot{display:flex;gap:8px;align-items:center;flex-wrap:wrap;border-top:1px solid var(--line);padding-top:10px}
.ldx-statusline{font-size:11px;color:var(--mut);margin-right:auto}
.ldx-clues{display:flex;flex-direction:column;gap:5px}
.ldx-clue{background:var(--panel-muted);border:1px solid var(--line);border-radius:9px;padding:7px 9px;font-size:11.5px;color:var(--mut);line-height:1.45}
.ldx-clue b{display:block;font-size:12px;color:var(--ink);margin-bottom:2px}
.ldx-floor{width:100%;max-width:600px;border:1px solid var(--line);border-radius:12px;background:var(--panel-muted)}
.ldx-room{cursor:pointer}
.ldx-room rect{fill-opacity:.85;stroke:var(--line-strong);stroke-width:2;transition:fill-opacity .18s,stroke .18s}
.ldx-room:hover rect{fill-opacity:1;stroke:var(--acc);stroke-width:3}
.ldx-room.picked rect{stroke:var(--acc);stroke-width:4;fill-opacity:1}
.ldx-room text{font-size:12px;font-weight:700;fill:var(--ink);text-anchor:middle;pointer-events:none}
.ldx-answer{font-size:12px;color:var(--ok);font-weight:600}
.ldx-scenebox{border-radius:12px;overflow:hidden;border:1px solid var(--line);background:#1c2542;max-width:800px;width:100%;margin:0 auto}
.ldx-scene{display:block;width:100%;height:auto;aspect-ratio:800/440}
.ldx-checklist{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:6px}
.ldx-chk{display:flex;align-items:center;gap:6px;font-size:11.5px;background:var(--panel-muted);border:1px solid var(--line);border-radius:8px;padding:6px 8px}
.ldx-chk.got{border-color:var(--ok);background:var(--color-success-soft);color:var(--ok);font-weight:600}
.ldx-chk i{width:8px;height:8px;border-radius:50%;background:var(--line-strong);flex:0 0 auto}
.ldx-chk.got i{background:var(--ok)}
.ldx-hot{cursor:pointer}
.ldx-hot .ldx-box{fill:transparent;stroke:transparent;stroke-width:2.5;transition:fill .18s,stroke .18s}
.ldx-hot:hover .ldx-box{fill:var(--color-warning-soft);stroke:var(--warn)}
.ldx-hot.pulse .ldx-box{animation:ldxPulse 2.4s ease-in-out infinite}
.ldx-hot.found{cursor:default}
.ldx-hot.found .ldx-box{fill:var(--color-success-soft);stroke:var(--ok);animation:none}
.ldx-hot.keyhint .ldx-box{stroke:var(--warn);stroke-dasharray:6 4;fill:var(--color-warning-soft)}
@keyframes ldxPulse{0%,100%{fill:transparent}50%{fill:var(--color-warning-soft)}}
.ldx-tag circle{fill:var(--panel);stroke:var(--line-strong);stroke-width:1.5}
.ldx-tag text{font-size:10px;font-weight:700;fill:var(--ink);text-anchor:middle;dominant-baseline:central}
.ldx-hot.found .ldx-tag circle{fill:var(--ok);stroke:var(--ok)}
.ldx-hot.found .ldx-tag text{opacity:0}
.ldx-tick{fill:none;stroke:var(--color-on-primary);stroke-width:2.2;stroke-linecap:round;stroke-linejoin:round;opacity:0}
.ldx-hot.found .ldx-tick{opacity:1}
.ldx-tline{display:flex;gap:6px;flex-wrap:wrap;min-height:38px;align-items:center;background:var(--panel-muted);border:1px dashed var(--line-strong);border-radius:10px;padding:6px}
.ldx-slot{font-size:10px;font-weight:700;color:var(--mut);border:1px dashed var(--line-strong);border-radius:6px;padding:6px 8px;min-width:48px;text-align:center}
.ldx-tcard{display:flex;flex-direction:column;gap:2px;text-align:left;background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:8px 10px;cursor:pointer;flex:1 1 150px;min-width:130px}
.ldx-tcard:hover:not(:disabled){border-color:var(--acc)}
.ldx-tcard:disabled{opacity:.5;cursor:default}
.ldx-tcard b{font-size:12px;color:var(--acc)}
.ldx-tcard span{font-size:11px;color:var(--mut);line-height:1.35}
.ldx-tcards{display:flex;gap:7px;flex-wrap:wrap}
.ldx-who{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:8px}
.ldx-wcard{border:1px solid var(--line);border-radius:12px;background:var(--panel);padding:9px;display:flex;flex-direction:column;gap:6px}
.ldx-wh{display:flex;align-items:center;gap:7px}
.ldx-wh>div{flex:1;min-width:0}
.ldx-wh b{display:block;font-size:13px}
.ldx-wh span{font-size:10.5px;color:var(--mut)}
.ldx-wstat{font-size:9.5px;font-weight:700;border-radius:5px;padding:2px 5px;border:1px solid var(--line);color:var(--mut);white-space:nowrap}
.ldx-wstat.cleared{color:var(--ok);border-color:var(--ok);background:var(--color-success-soft)}
.ldx-wstat.suspect{color:var(--bad);border-color:var(--bad);background:var(--color-danger-soft)}
.ldx-wstat.cul{color:var(--warn);border-color:var(--warn);background:var(--color-warning-soft)}
.ldx-wsays{font-size:10.5px;color:var(--mut);line-height:1.4;background:var(--panel-muted);border-radius:7px;padding:5px 7px}
.ldx-wasks{display:flex;gap:4px;flex-wrap:wrap}
.ldx-mini{font-size:10px;padding:4px 7px;border-radius:6px;border:1px solid var(--line);background:var(--panel);cursor:pointer}
.ldx-mini:hover:not(:disabled){border-color:var(--acc)}
.ldx-mini:disabled{opacity:.5;cursor:default}
.ldx-mini.on{border-color:var(--ok);color:var(--ok);background:var(--color-success-soft)}
.ldx-grid{width:100%;border-collapse:collapse;font-size:11px}
.ldx-grid th,.ldx-grid td{border:1px solid var(--line);padding:7px 5px;text-align:center}
.ldx-grid th{background:var(--panel-muted);font-size:10.5px;color:var(--mut);font-weight:600;vertical-align:bottom}
.ldx-grid th:first-child{text-align:left}
.ldx-grid td:first-child{text-align:left;font-weight:600}
.ldx-cell{width:100%;border:0;background:none;cursor:pointer;font:700 13px/1 ui-monospace,Menlo,monospace;color:var(--mut);padding:5px}
.ldx-cell.Y{color:var(--ok)}
.ldx-cell.N{color:var(--bad)}
.ldx-rules{display:flex;flex-direction:column;gap:4px}
.ldx-rule{font-size:11px;color:var(--mut);padding-left:14px;position:relative}
.ldx-rule::before{content:'';position:absolute;left:2px;top:5px;width:5px;height:5px;border-radius:50%;background:var(--acc)}
.ldx-nodes{display:flex;gap:7px;flex-wrap:wrap}
.ldx-node{border:1px solid var(--line);border-radius:10px;background:var(--panel-muted);padding:8px 10px;font-size:11.5px;cursor:pointer;text-align:left;flex:1 1 130px}
.ldx-node:hover:not(:disabled){border-color:var(--acc)}
.ldx-node.sel{border-color:var(--acc);background:var(--color-primary-soft)}
.ldx-node small{display:block;font-size:9px;text-transform:uppercase;letter-spacing:.5px;color:var(--mut);margin-bottom:2px}
.ldx-links{display:flex;flex-wrap:wrap;gap:5px}
.ldx-link{display:inline-flex;align-items:center;gap:5px;font-size:10.5px;border:1px solid var(--acc);background:var(--color-primary-soft);color:var(--acc);border-radius:7px;padding:4px 7px}
.ldx-link button{border:0;background:none;color:inherit;cursor:pointer;font-weight:700}
.ldx-summary{width:100%;border-collapse:collapse;font-size:11.5px}
.ldx-summary td,.ldx-summary th{border:1px solid var(--line);padding:7px 9px;text-align:left;vertical-align:top}
.ldx-summary th{width:90px;background:var(--panel-muted);font-size:10px;letter-spacing:.6px;color:var(--mut)}
.ldx-summary a{color:var(--acc);font-weight:700;cursor:pointer}
.ldx-lineup{display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:8px}
.ldx-pick{display:flex;flex-direction:column;align-items:center;gap:3px;border:1px solid var(--line);border-radius:12px;background:var(--panel-muted);padding:10px 6px;cursor:pointer}
.ldx-pick:hover:not(:disabled){border-color:var(--ink)}
.ldx-pick:disabled{opacity:.5;cursor:default}
.ldx-pick.on{border-color:var(--acc);background:var(--color-primary-soft)}
.ldx-pick b{font-size:12px}
.ldx-pick span{font-size:10px;color:var(--mut)}
.ldx-evtabs{display:flex;gap:6px}
.ldx-evtabs button{display:inline-flex;align-items:center;gap:5px;font-size:11px;padding:6px 10px;border:1px solid var(--line);border-radius:8px;background:var(--panel);cursor:pointer}
.ldx-evtabs button.on{border-color:var(--acc);background:var(--color-primary-soft);color:var(--acc)}
.ldx-evlist{display:flex;flex-direction:column;gap:7px}
.ldx-evi{border:1px solid var(--line);border-radius:11px;background:var(--panel);padding:9px 10px;display:flex;flex-direction:column;gap:6px}
.ldx-evi.key{border-color:var(--warn);background:var(--color-warning-soft)}
.ldx-evi.sel{border-color:var(--acc)}
.ldx-evi b{font-size:12.5px}
.ldx-evi p{margin:0;font-size:11px;color:var(--mut);line-height:1.45}
.ldx-evchips{display:flex;gap:4px;flex-wrap:wrap}
.ldx-evchip{font-size:9.5px;font-weight:700;border:1px solid var(--line);border-radius:5px;padding:3px 6px;background:var(--panel-muted);color:var(--mut);cursor:pointer}
.ldx-evchip.on{background:var(--acc);border-color:var(--acc);color:var(--color-on-primary)}
.ldx-keyicon{font-size:9px;font-weight:700;color:var(--warn);border:1px solid var(--warn);border-radius:4px;padding:0 4px}
.ldx-ov{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(16,24,40,.55);z-index:30;padding:14px}
.ldx-card{display:flex;flex-direction:column;gap:8px;background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:20px 22px;width:min(560px,100%);max-height:100%;overflow:hidden;box-shadow:var(--shadow);text-align:center}
.ldx-card h3{margin:0 0 6px;font-size:19px;line-height:1.25}
.ldx-card h3.win{color:var(--ok)}
.ldx-card h3.lose{color:var(--bad)}
.ldx-card .sub{margin:0 0 12px;font-size:13px;color:var(--mut);line-height:1.55}
.ldx-ovline{font-size:12.5px;color:var(--acc);font-weight:600;margin:4px 0}
.ldx-note{font-size:11px;color:var(--mut);margin:0 0 10px}
.ldx-scroll{flex:1 1 auto;min-height:0;overflow:auto;text-align:left}
.ldx-row{display:flex;gap:8px;justify-content:center;flex-wrap:wrap;margin-top:12px;flex:0 0 auto}
.ldx-guide{text-align:left;font-size:12.5px;color:var(--mut);line-height:1.55}
.ldx-guide h4{margin:10px 0 3px;font-size:11px;text-transform:uppercase;letter-spacing:.7px;color:var(--ink)}
.ldx-guide p{margin:0 0 4px}
.ldx-keys{display:grid;grid-template-columns:auto 1fr;gap:3px 10px;font-size:11.5px}
.ldx-cheat{display:flex;align-items:center;justify-content:space-between;width:100%;background:var(--panel-muted);border:1px solid var(--line);border-radius:10px;padding:9px 12px;font-size:13px;font-weight:600;cursor:pointer;margin-bottom:6px}
.ldx-sw{width:30px;height:17px;border-radius:9px;background:var(--line-strong);position:relative;flex:0 0 auto;transition:background .18s}
.ldx-sw::after{content:'';position:absolute;top:2px;left:2px;width:13px;height:13px;border-radius:50%;background:var(--panel);transition:left .18s}
.ldx-sw.on{background:var(--acc)}
.ldx-sw.on::after{left:15px}
.ldx-wait{padding:40px;text-align:center;color:var(--mut)}
@media (max-width:880px){
  .ldx-pinboard{min-height:0;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;padding:10px;overflow:visible}
  .ldx-wire{display:none}
  .ldx-pinned{position:static;width:auto;transform:none}
  .ldx .ldx-board>.ldx-view{overflow:auto}
}
@media (max-width:640px){.ldx-pinboard{grid-template-columns:1fr}}
@media (pointer:coarse){.ldx-btn{min-height:44px}.ldx-mini{min-height:32px}}
@media (prefers-reduced-motion:reduce){.ldx *{animation-duration:.01ms!important;animation-iteration-count:1!important;transition-duration:.01ms!important}}
/* ==== WHERE: case file + map sheets ==== */
.ldx{--wpCream:#f7f1e3;--wpCream2:#fffaf0;--wpBox:#efe4cd;--wpBox2:#f3e6cc;--wpBox3:#f4ead6;--wpMap:#fbf6ea;--wpSepia:#2b1a12;--wpFaded:#7b5a3a;--wpCrimson:#7b2d2d;--wpNavy:#16233a;--wpNavy2:#0f1828;--wpEdge:#2c3e5c;--wpRule:#cbb99a;--wdDark:#171b23;--wdAlt:#222833;--wdLight:#e8ecf3;--wdFaint:#9aa4b5;--wdEdge:#2b3340}
.ldx-where{position:relative;background:var(--wpNavy);border:1px solid var(--wpEdge);border-radius:12px;padding:14px;display:flex;flex-direction:column;gap:12px;color:#f8ead2}
.ldx-wtitle{margin:0;text-align:center;font-size:21px;line-height:1.2;letter-spacing:.05em;color:#fff;font-weight:800}
.ldx-wsheets{display:grid;grid-template-columns:minmax(0,.92fr) minmax(0,1.08fr);gap:12px;align-items:start}
.ldx-wpaper{background:var(--wpCream);color:var(--wpSepia);border-radius:3px;padding:12px;box-shadow:0 2px 7px rgba(0,0,0,.32);display:flex;flex-direction:column;gap:9px;min-width:0}
.ldx-wpaper-map{background:var(--wpCream2)}
.ldx-wpaperhead{display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;border-bottom:1px solid var(--wpRule);padding-bottom:7px;font-size:10px;text-transform:uppercase;letter-spacing:.5px}
.ldx-wpaperhead b{font-size:10px}
.ldx-wbadge{display:inline-flex;align-items:center;justify-content:center;width:30px;height:30px;border-radius:50%;background:var(--wpNavy);color:#fff;font-size:8px;font-weight:800;letter-spacing:.4px;flex:none}
.ldx-wpaper h4{margin:0;font-size:15px;line-height:1.25}
.ldx-wstamp{font:600 9px/1.3 ui-monospace,SFMono-Regular,Menlo,monospace;color:var(--wpFaded)}
.ldx-wpaper p{margin:0;font-size:11px;line-height:1.5}
.ldx-wevidence{border:1px solid var(--wpRule);border-radius:6px;padding:7px 9px;background:var(--wpBox);color:var(--wpSepia)}
.ldx-wevidence b{font-size:9px;letter-spacing:.7px}
.ldx-wevidence ul{margin:5px 0 0;padding-left:16px;font-size:10.5px;line-height:1.45}
.ldx-wclues{display:flex;flex-direction:column;gap:4px}
.ldx-wclue{display:flex;gap:7px;font-size:10.5px;line-height:1.4;border-bottom:1px dotted var(--wpRule);padding-bottom:4px}
.ldx-wclue b{flex:0 0 76px;font:700 9px/1.4 ui-monospace,SFMono-Regular,Menlo,monospace;color:var(--wpCrimson)}
.ldx-wsusgrid{display:grid;grid-template-columns:1fr 1fr;gap:6px}
.ldx-wsus{border:1px solid var(--wpRule);border-radius:6px;padding:6px;background:var(--wpBox3)}
.ldx-wsushead{display:flex;align-items:center;gap:6px}
.ldx-wsushead b{font-size:11px;display:block}
.ldx-wsushead small{font-size:9px;color:var(--wpFaded);display:block;line-height:1.25}
.ldx-wsus p{margin:5px 0 0;font-size:9.5px;line-height:1.4;font-style:italic}
.ldx-wnote{font:600 8px/1.3 ui-monospace,SFMono-Regular,Menlo,monospace;color:var(--wpFaded);text-align:right;max-width:230px}
.ldx-wmapsvg{width:100%;height:auto;display:block;background:var(--wpMap);border:1px solid var(--wpRule);border-radius:4px}
.ldx-mroom{cursor:pointer}
.ldx-mroom .ldx-mfill,.ldx-mroom .ldx-mpattern{stroke:#6b5a45;stroke-width:2.5;transition:stroke .15s}
.ldx-mroom:hover .ldx-mfill,.ldx-mroom:hover .ldx-mpattern{stroke:#b42318;stroke-width:2}
.ldx-mroom.selected .ldx-mfill,.ldx-mroom.selected .ldx-mpattern{stroke:#b42318;stroke-width:3}
.ldx-mroom.picked .ldx-mfill{stroke:#b42318;stroke-width:3}
.ldx-wlegend{display:flex;gap:7px;flex-wrap:wrap;border-top:1px solid var(--wpRule);padding-top:7px}
.ldx-wleg{display:inline-flex;align-items:center;gap:3px;font-size:9px;color:var(--wpSepia)}
.ldx-wleg svg{width:24px;height:24px}
.ldx-wleg i{font-style:normal}
.ldx-wvictim{font-size:10.5px;font-weight:600;background:var(--wpBox);border:1px solid var(--wpRule);border-radius:5px;padding:6px 8px}
.ldx-wanswer{display:flex;justify-content:space-between;align-items:center;gap:8px;font-size:10px;border:1px dashed #b42318;border-radius:5px;padding:6px 8px}
.ldx-wanswer strong{font-size:11px;color:var(--wpCrimson)}
.ldx-wdetail{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(9,14,22,.72);z-index:6;padding:14px}
.ldx-wdetailcard{position:relative;width:min(360px,100%);max-height:100%;overflow:auto;background:var(--wdDark);color:var(--wdLight);border:1px solid var(--wdEdge);border-radius:12px;padding:16px;box-shadow:var(--shadow);display:flex;flex-direction:column;gap:8px}
.ldx-wdetailcard h4{margin:0;font-size:17px}
.ldx-wdetailcard p{margin:0;font-size:12px;line-height:1.5;color:var(--wdLight)}
.ldx-wdetailcard .ldx-note{color:var(--wdFaint)}
.ldx-wdetailitems{display:flex;gap:8px;flex-wrap:wrap}
.ldx-wdetailitems span{display:inline-flex;align-items:center;gap:4px;border:1px solid var(--wdEdge);background:var(--wdAlt);border-radius:8px;padding:4px 6px;font-size:10px;color:var(--wdLight)}
.ldx-wdetailitems span svg{width:26px;height:26px}
.ldx-wdetailcard .ldx-bx{position:absolute;top:8px;right:9px;color:var(--wdFaint)}
@media (max-width:880px){.ldx-wsheets{grid-template-columns:1fr}}
@media (max-width:640px){.ldx-where{padding:10px;gap:9px}.ldx-wtitle{font-size:16px}.ldx-wnote{max-width:none;text-align:left}}
/* ==== WHERE deduction table + suspect reveal ==== */
.ldx-wcluetitle{display:flex;justify-content:space-between;align-items:center;gap:8px;font-size:9px;font-weight:800;letter-spacing:.6px;color:var(--wpFaded)}
.ldx-wcluetitle b{color:var(--wpCrimson);font-size:9px}
.ldx-wcluetable{width:100%;border-collapse:collapse;font-size:10px;color:var(--wpSepia)}
.ldx-wcluetable th,.ldx-wcluetable td{border:1px solid var(--wpRule);padding:5px 6px;text-align:left;vertical-align:top;line-height:1.35}
.ldx-wcluetable th{background:var(--wpBox);font-size:8.5px;letter-spacing:.4px;text-transform:uppercase}
.ldx-wcluetable td:first-child{width:28px;text-align:center}
.ldx-wcluetable td span{color:var(--wpFaded)}
.ldx-cluebtn{width:20px;height:20px;display:inline-flex;align-items:center;justify-content:center;border:1px solid var(--wpRule);border-radius:5px;background:var(--wpCream2);cursor:pointer;padding:0}
.ldx-cluebtn.on{border-color:var(--color-primary);background:var(--color-primary);color:#fff}
.ldx-wreveal{margin-top:6px;font-size:10px;font-weight:700;color:var(--color-success);border:1px solid var(--color-success);border-radius:6px;padding:5px 7px;background:var(--color-success-soft)}
.ldx-msus text{font-family:system-ui,sans-serif}
/* ==== WHERE suspect placement ==== */
.ldx-wsus{width:100%;text-align:left;cursor:pointer;transition:border-color .18s,background .18s}
.ldx-wsus:hover{border-color:var(--acc)}
.ldx-wsus.active{border-color:var(--acc);background:var(--color-primary-soft);box-shadow:var(--focus-ring)}
.ldx-wsusplace{margin-top:5px;font-size:9px;font-weight:700;color:var(--wpCrimson);border-top:1px dotted var(--wpRule);padding-top:4px}
.ldx-wsushint{font-style:normal!important;color:var(--wpSepia)!important;font-weight:700}
.ldx-wsusquote{font-size:9px!important;color:var(--wpFaded)!important;margin-top:3px!important}
.ldx-wcluetable tr.hint td{background:var(--color-success-soft);color:var(--color-success)}
.ldx-clueanswer{display:inline-block;font-size:8px;font-weight:800;letter-spacing:.4px;color:var(--color-success);border:1px solid var(--color-success);border-radius:4px;padding:0 3px;margin-left:3px}
.ldx-wsusanswer{margin-top:3px;font-size:9px;font-weight:700;color:var(--color-success)}
.ldx .ldx-wsus-check{width:100%;margin-top:2px;background:var(--wdDark);color:var(--wdLight);border-color:var(--wdEdge)}
.ldx .ldx-wsus-check:hover:not(:disabled){background:var(--wdAlt);color:var(--wdLight);border-color:var(--wdEdge)}
.ldx .ldx-wsus-check:disabled{color:var(--wdFaint);opacity:.6}
.ldx-msus.active circle{filter:drop-shadow(0 0 5px var(--color-primary))}
/* ==== LAYOUT REDESIGN · final overrides (must stay last) ==== */
.ldx.game-fill>.ldx-board{flex:1 1 auto;min-height:0;aspect-ratio:auto}
.ldx .ldx-hud .ldx-btn{min-height:32px;min-width:0;padding:5px 8px;font-size:10px;border-radius:8px}
.ldx .ldx-hud .ldx-btn svg{width:14px;height:14px}
.ldx .ldx-card .ldx-scroll{scrollbar-width:none}
.ldx .ldx-card .ldx-scroll::-webkit-scrollbar{display:none}
@media (max-width:640px){
  .ldx .ldx-hud{gap:5px}
  .ldx .ldx-hud .ldx-chip{padding:3px 5px;font-size:9px}
  .ldx .ldx-hud .ldx-chip[data-hud="mode"],
  .ldx .ldx-hud .ldx-chip[data-hud="best"],
  .ldx .ldx-hud .ldx-chip[data-chip="prog"],
  .ldx .ldx-hud .ldx-chip[data-chip="ev"],
  .ldx .ldx-hud .ldx-chip[data-chip="status"]{display:none}
  .ldx .ldx-hud .ldx-btn{min-height:32px;padding:5px 7px;font-size:9px}
  .ldx .ldx-hud .ldx-btn-label{display:none}
  .ldx .ldx-ov{padding:8px}
  .ldx .ldx-card{width:100%;height:100%;max-height:100%;padding:14px;border-radius:12px}
  .ldx .ldx-card .ldx-row{position:sticky;bottom:0;background:var(--panel);padding:8px 0 0;border-top:1px solid var(--line)}
  .ldx .ldx-casehead{padding:12px}
  .ldx .ldx-casehead h2{font-size:18px}
}
</style>
<div class="game-app ldx game-fill">
  <div class="ldx-hud">
    <span class="ldx-chip" data-hud="mode">Mode <b>Solo</b></span>
    <span class="ldx-chip">Case <b data-hud="case">1/3</b></span>
    <span class="ldx-chip" data-chip="prog">Progress <b data-hud="prog">0/6</b></span>
    <span class="ldx-chip" data-chip="ev">Evidence <b data-hud="ev">0/8</b></span>
    <span class="ldx-chip">Score <b data-hud="score">0</b></span>
    <span class="ldx-chip">Time <b data-hud="time">5:00</b></span>
    <span class="ldx-chip" data-hud="best">Best <b data-hud="bestv">—</b></span>
    <span class="ldx-status ldx-chip" data-chip="status"><i class="game-status-dot"></i><span data-hud="status">Ready</span></span>
    <span class="ldx-spacer"></span>
    <button class="ldx-btn icon" type="button" data-help aria-label="How to play" title="How to play (H)">${iconSVG("helpCircle", { size: 14 })}<span class="ldx-btn-label">Help</span></button>
    <button class="ldx-btn icon" type="button" data-cheats aria-label="Cheats" title="Cheats (C)">${iconSVG("wrench", { size: 14 })}<span class="ldx-btn-label">Cheats</span></button>
    <button class="ldx-btn icon" type="button" data-pause aria-label="Pause" title="Pause (P)">${iconSVG("pause", { size: 14 })}<span class="ldx-btn-label">Pause</span></button>
    <button class="ldx-btn icon" type="button" data-restart aria-label="Restart" title="Restart (R)">${iconSVG("refresh", { size: 14 })}<span class="ldx-btn-label">Restart</span></button>
    <button class="ldx-btn icon" type="button" data-exit aria-label="Exit game" title="Exit game">${iconSVG("logOut", { size: 14 })}<span class="ldx-btn-label">Exit</span></button>
  </div>
  <div class="ldx-timebar"><i data-el="timefill"></i></div>
  <section class="game-panel ldx-board" data-board>
    <div class="ldx-view" data-el="view"></div>
    <div data-el="ov"></div>
  </section>
</div>`;

    const $ = (s, r) => (r || root).querySelector(s);
    const viewEl = $('[data-el="view"]'), ovEl = $('[data-el="ov"]');
    const statusEl = $('[data-hud="status"]'), bestEl = $('[data-hud="bestv"]');
    const timeFill = $('[data-el="timefill"]'), cheatBtn = $('[data-cheats]'), pauseBtn = $('[data-pause]');
    const hud = { case: $('[data-hud="case"]'), prog: $('[data-hud="prog"]'), ev: $('[data-hud="ev"]'), score: $('[data-hud="score"]'), time: $('[data-hud="time"]') };

    function syncClock() {
        if (!state) return;
        hud.time.textContent = fmtTime(state.timeLeft) + (state.cheats.freeze ? " *" : "");
        timeFill.style.width = Math.max(0, (state.timeLeft / CASE_TIME) * 100) + "%";
    }
    function submit(a) {
        if (destroyed || !state) return;
        const res = applyToState(state, a, 0, {});
        if (a.t === "tick") {
            if (res) state.rev++;
            if (state.phase === "play") { syncClock(); return; }
            render();
            return;
        }
        if (res === "reset") { resetMatch(state); state.rev++; }
        else if (res) state.rev++;
        render();
    }

    /* ---------- view builders ---------- */
    function bannerCard(st, c) {
        const tag = st.banner.tag;
        const icon = tag === "INCORRECT" ? "alertCircle" : tag === "SOLVED" || tag === "CONFIRMED" ? "checkCircle" : "info";
        const cls = tag === "INCORRECT" ? "lose" : tag === "SOLVED" || tag === "CONFIRMED" ? "win" : "";
        return ovWrap('<h3 class="' + cls + '">' + esc(tag) + " - investigation update</h3>" +
            '<p class="sub">' + iconSVG(icon, { size: 16 }) + " " + hl(st.banner.text, c) + "</p>" +
            '<div class="ldx-row"><button class="ldx-btn pri" type="button" data-act="banner-x">Got it</button></div>');
    }
    function bannerVisible(st) {
        return !!st && !!st.banner && st.phase === "play" && ui.dismissRev !== st.rev;
    }
    function statusLabel(s) {
        return { locked: "Locked", available: "Available", "in-progress": "In Progress", completed: "Completed", confirmed: "Confirmed", incorrect: "Incorrect" }[s] || s;
    }
    function statusIcon(s) {
        const name = { locked: "lock", available: "clock", "in-progress": "clock", completed: "check", confirmed: "checkCircle", incorrect: "alertCircle" }[s] || "info";
        return iconSVG(name, { size: 12 });
    }
    function statusChip(s) {
        return '<span class="ldx-sstatus ' + s + '">' + statusIcon(s) + "<span>" + esc(statusLabel(s)) + "</span></span>";
    }
    function requirement(id, st, c) {
        if (id === "what") return "Confirm WHERE to open this stage.";
        if (id === "when") return st.hints.when ? "Unlocked early by the broken clock you found." : "Confirm WHAT to open this stage.";
        if (id === "who") return "Confirm WHEN to open this stage.";
        if (id === "how") return "Confirm WHO to open this stage.";
        if (id === "why") return st.hints.why ? "A hidden note gave you a head start - confirm WHAT, or finish HOW." : "Confirm HOW to open this stage.";
        if (id === "final") return "Confirm all six deductions to open the accusation.";
        return "";
    }
    function renderHub(st, c) {
        const done = STAGE_IDS.filter((id) => st.stages[id].status === "confirmed").length;
        const POS = {
            case: { x: 3, y: 3, w: 24, rot: -0.4 },
            where: { x: 3, y: 38, w: 19, rot: -1 },
            what: { x: 30, y: 4, w: 18, rot: 0.8 },
            when: { x: 52, y: 4, w: 18, rot: -0.6 },
            who: { x: 74, y: 5, w: 23, rot: 0.7 },
            how: { x: 79, y: 38, w: 18, rot: -0.8 },
            why: { x: 60, y: 72, w: 20, rot: 0.9 },
            final: { x: 26, y: 80, w: 20, rot: -0.5 },
            sus: { x: 37, y: 28, w: 28, rot: 0.3 },
            ev: { x: 3, y: 54, w: 22, rot: 0.4 },
            next: { x: 30, y: 62, w: 23, rot: -0.5 }
        };
        const pinCard = (key, inner) => {
            const p = POS[key];
            return '<div class="ldx-pinned" style="--x:' + p.x + ';--y:' + p.y + ';--w:' + p.w + ';--rot:' + p.rot + 'deg">' +
                '<span class="ldx-pin">' + iconSVG("pin", { size: 10 }) + "</span>" + inner + "</div>";
        };
        const wire = (a, b, color, dashed) => '<line x1="' + a.x + '" y1="' + a.y + '" x2="' + b.x + '" y2="' + b.y +
            '" stroke="' + color + '"' + (dashed ? ' stroke-dasharray="2 2" opacity="0.5"' : ' opacity="0.75"') + "/>";
        const center = { x: 51, y: 35 };
        const evPin = { x: 14, y: 55 };
        const lineColor = (s) => {
            if (s === "locked") return "var(--color-border)";
            if (s === "incorrect") return "var(--color-danger)";
            if (s === "completed" || s === "confirmed") return "var(--color-success)";
            return "var(--color-primary)";
        };
        let wires = "";
        STAGES.forEach((s) => {
            const ss = st.stages[s.id];
            if (ss.status === "locked") return;
            wires += wire({ x: POS[s.id].x, y: POS[s.id].y }, center, lineColor(ss.status));
        });
        STAGE_IDS.forEach((id) => {
            const n = Object.keys(st.links).filter((eid) => (st.links[eid] || []).indexOf(id) >= 0).length;
            if (n) wires += wire(evPin, { x: POS[id].x, y: POS[id].y }, "var(--color-success)", true);
        });

        const caseCard = pinCard("case", '<span class="ldx-kicker">CASE #00' + (st.caseIdx + 1) + "</span><h2>" + esc(c.title) + "</h2><p>" + esc(c.brief) + "</p>" +
            '<div class="ldx-prog"><b>' + done + ' / 6</b><span>Confirmed</span><div class="ldx-pbar"><i style="width:' + Math.round((done / 6) * 100) + '%"></i></div>' +
            '<button class="ldx-btn" type="button" data-act="brief">Case briefing</button></div>');

        const stageCards = STAGES.map((s) => {
            const ss = st.stages[s.id];
            const open = ss.status !== "locked";
            const current = ss.status === "available" || ss.status === "in-progress" || ss.status === "incorrect";
            const body = '<button class="ldx-pstage' + (current ? " current" : "") + '" type="button" data-act="stage" data-id="' + s.id + '"' + (open ? "" : " disabled") +
                ' title="' + esc(open ? s.title : requirement(s.id, st, c)) + '">' +
                '<span class="ldx-snum">' + s.n + "</span>" +
                '<span class="ldx-steplabel">' + s.label + "</span>" +
                '<span class="ldx-steptitle">' + esc(s.title) + "</span>" + statusChip(ss.status) + "</button>";
            return pinCard(s.id, body);
        }).join("");

        const suspects = c.suspects.map((s, i) => {
            const mark = st.whoMarks[s.id];
            const reveal = st.cheats.reveal && s.id === c.culpritId;
            const cls = reveal ? " cul" : mark === "cleared" ? " cleared" : mark === "suspect" ? " suspect" : "";
            const label = reveal ? "Culprit" : mark === "cleared" ? "Cleared" : mark === "suspect" ? "Suspect" : "Unverified";
            return '<div class="ldx-suscard">' + portraitSvg(s.look, i, 34) + "<div><b>" + esc(s.name) + "</b><span>" + esc(s.trait) + "</span></div>" +
                '<span class="ldx-wstat' + cls + '">' + label + "</span></div>";
        }).join("");
        const susCard = pinCard("sus", "<h3>Suspect Dossiers</h3><div class=\"ldx-susgrid\">" + suspects + "</div>");

        const evRows = STAGE_IDS.map((id) => {
            const n = Object.keys(st.links).filter((eid) => (st.links[eid] || []).indexOf(id) >= 0).length;
            const meta = STAGES.filter((s) => s.id === id)[0];
            const ok = st.stages[id].status === "confirmed";
            return '<div class="ldx-evrow' + (ok ? " done" : "") + '">' +
                (ok ? iconSVG("checkCircle", { size: 12 }) : iconSVG(n ? "link" : "unlink", { size: 12 })) +
                "<b>" + meta.label + "</b><span>" + (n ? n + (n === 1 ? " evidence link" : " evidence links") : "no evidence linked") + "</span></div>";
        }).join("");
        const evCard = pinCard("ev", "<h3>Case File</h3><div class=\"ldx-file\"><p>Link evidence to confirm each deduction.</p>" +
            '<h3>Evidence Links</h3><div class="ldx-evsum">' + evRows + '</div>' +
            '<button class="ldx-btn pri" type="button" data-act="evidence">' + iconSVG("link", { size: 14 }) + " Open Evidence Board</button></div>");

        const next = STAGES.filter((s) => st.stages[s.id].status === "available" || st.stages[s.id].status === "incorrect")[0];
        const nextCard = next ? pinCard("next", '<div class="ldx-nextstep">' + iconSVG("info", { size: 14 }) +
            "<span><b>Next: " + next.label + " - " + esc(next.title) + "</b><br>" + esc(requirement(next.id, st, c)) + "</span></div>") : "";

        return '<div class="ldx-pinboard"><svg class="ldx-wire" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">' + wires + "</svg>" +
            caseCard + stageCards + susCard + evCard + nextCard + "</div>";
    }

    function renderWhere(st, c) {
        const picked = st.stages.where.answer;
        const status = st.stages.where.status;
        const detailRoom = ui.whereDetail ? c.map.rooms.filter((room) => room.id === ui.whereDetail)[0] : null;
        const clueCount = st.mapPickedClues.length;
        const clueHtml = '<div class="ldx-wcluetitle"><span>DEDUCTION TABLE</span><b>' + clueCount + ' / 2 clues selected</b></div>' +
            '<table class="ldx-wcluetable"><thead><tr><th>USE</th><th>CLUE</th><th>POINTS TO</th><th>WHY</th></tr></thead><tbody>' +
            c.map.clues.map((cl) => {
                const on = st.mapPickedClues.indexOf(cl.id) >= 0;
                const answer = st.cheats.whereHints && c.map.supportClueIds.indexOf(cl.id) >= 0;
                return '<tr' + (answer ? ' class="hint"' : "") + '><td><button class="ldx-cluebtn' + (on ? " on" : "") + '" type="button" data-act="clue-toggle" data-cid="' + cl.id + '" aria-pressed="' + on + '">' + (on ? iconSVG("check", { size: 12 }) : "&nbsp;") + "</button></td>" +
                    "<td><b>" + cl.label + "</b><br><span>" + esc(cl.text) + "</span></td><td>" + esc(cl.pointsTo) + (answer ? ' <span class="ldx-clueanswer">USE THIS</span>' : "") + "</td><td>" + esc(cl.why) + "</td></tr>";
            }).join("") + "</tbody></table>";
        const placedCount = c.suspects.filter((s) => st.suspectPlacements[s.id]).length;
        const placeReady = placedCount === 4 && st.positionsOk;
        const statements = '<div class="ldx-wcluetitle"><span>PLACE SUSPECTS</span><b>' + placedCount + " / 4 placed</b></div>" +
            '<div class="ldx-wsusgrid">' + c.map.statements.map((s, i) => {
                const active = ui.activeSuspect === s.sid;
                const roomId = st.suspectPlacements[s.sid];
                const room = roomId ? c.map.rooms.filter((r) => r.id === roomId)[0] : null;
                const correctRoom = st.cheats.whereHints ? c.map.suspectSpots.filter((x) => x.sid === s.sid)[0].roomId : null;
                const correctName = correctRoom ? c.map.rooms.filter((r) => r.id === correctRoom)[0].name : "";
                return '<button class="ldx-wsus' + (active ? " active" : "") + '" type="button" data-act="select-suspect" data-sid="' + s.sid + '">' +
                    '<div class="ldx-wsushead">' + portraitSvg(s.look, i, 30) + "<div><b>" + esc(s.name) + "</b><small>" + esc(s.role) + "</small></div></div>" +
                    '<p class="ldx-wsushint">' + esc(s.hint) + '</p><p class="ldx-wsusquote"><small>' + esc(s.quote) + "</small></p>" +
                    '<div class="ldx-wsusplace">' + (room ? "At " + esc(room.name) : active ? "Choose a room on the map" : "Click, then choose a room") + "</div>" +
                    (correctName ? '<div class="ldx-wsusanswer">Correct: ' + esc(correctName) + "</div>" : "") + "</button>";
            }).join("") + "</div>" +
            '<button class="ldx-btn ldx-wsus-check" type="button" data-act="check-positions"' + (placedCount < 4 ? " disabled" : "") + ">Check positions</button>" +
            (st.positionsChecked ? '<div class="ldx-note">' + (st.positionsOk ? "All positions match. Now choose the two strongest clues." : "Some positions do not match the alibis. Move the pins and check again.") + "</div>" : "");
        const legend = c.map.legend.map((l) => '<span class="ldx-wleg">' + mapItemSvg(l.id) + "<i>" + esc(l.label) + "</i></span>").join("");
        const pickedName = picked ? c.map.rooms.filter((room) => room.id === picked)[0].name : "Choose a room on the map";
        const lockedMark = status === "completed" || status === "confirmed";
        const detailHtml = detailRoom ? '<div class="ldx-wdetail"><div class="ldx-wdetailcard"><button class="ldx-bx" type="button" data-act="room-close" aria-label="Close room details">x</button>' +
            '<span class="ldx-kicker">MAP DETAIL - ' + esc(detailRoom.name) + "</span><h4>" + esc(detailRoom.name) + "</h4>" +
            "<p>" + esc(detailRoom.detail) + "</p><div class=\"ldx-wdetailitems\">" +
            detailRoom.items.map((id) => '<span>' + mapItemSvg(id) + esc((c.map.legend.filter((l) => l.id === id)[0] || { label: id }).label) + "</span>").join("") +
            '</div><p class="ldx-note">' + (lockedMark ? "Location already marked." : placedCount < 4 ? "Place all four suspects first." : !st.positionsOk ? "Verify the suspect positions first." : clueCount < 2 ? "Select 2 clues in the deduction table to enable this action." : "Two clues and four positions are ready. Confirm this room or choose another.") + "</p>" +
            '<button class="ldx-btn pri" type="button" data-act="map-pick" data-room="' + detailRoom.id + '"' + (lockedMark || clueCount < 2 || !placeReady ? " disabled" : "") + ">" +
            (lockedMark ? "Location already marked" : placedCount < 4 ? "Place suspects first" : !st.positionsOk ? "Check positions first" : clueCount < 2 ? "Select 2 clues first" : "Mark as crime location") + "</button></div></div>" : "";
        return '<div class="ldx-where"><h3 class="ldx-wtitle">ONE CASE. TWO PAGES. ONE KILLER.</h3><div class="ldx-wsheets">' +
            '<section class="ldx-wpaper"><div class="ldx-wpaperhead"><span class="ldx-wbadge">DETECTIVE</span><b>' + esc(c.map.caseNo) + " - CONFIDENTIAL</b></div>" +
            "<h4>" + esc(c.title) + '</h4><div class="ldx-wstamp">' + esc(c.map.stamp) + "</div><p>" + esc(c.map.sceneText) + "</p>" +
            '<div class="ldx-wclues">' + clueHtml + "</div>" + statements + "</section>" +
            '<section class="ldx-wpaper ldx-wpaper-map"><div class="ldx-wpaperhead"><b>CASE ' + (st.caseIdx + 1) + " &bull; THE MAP</b>" +
            '<span class="ldx-wnote">Store right on the map, cross (X) a circle (O) as pencil</span></div>' +
            floorMapSvg(c, ui.whereDetail, picked, st, st.suspectPlacements, ui.activeSuspect) + '<div class="ldx-wlegend">' + legend + "</div>" +
            '<div class="ldx-wvictim">' + esc(c.map.victim) + '</div><div class="ldx-wanswer"><span>The crime scene is:</span><strong>' + esc(pickedName) + "</strong></div>" +
            ((status === "completed" || status === "confirmed" || st.positionsOk) ? '<div class="ldx-wreveal">Suspect positions confirmed on the map.</div>' : "") + "</section>" +
            "</div>" + detailHtml + "</div>";
    }
    function renderWhat(st, c) {
        const hots = c.hotspots.map((h, i) => {
            const found = st.found.some((f) => f.id === h.id);
            const hint = st.cheats.keys && h.clue.key && !found;
            return '<g class="ldx-hot' + (found ? " found" : " pulse") + (hint ? " keyhint" : "") + '" data-act="hot" data-hid="' + h.id + '">' +
                '<rect class="ldx-hit" x="' + (h.x - 10) + '" y="' + (h.y - 10) + '" width="' + (h.w + 20) + '" height="' + (h.h + 20) + '" rx="12" fill="transparent"/>' +
                '<rect class="ldx-box" x="' + h.x + '" y="' + h.y + '" width="' + h.w + '" height="' + h.h + '" rx="8"/>' +
                '<g class="ldx-tag" transform="translate(' + (h.x + 13) + ',' + (h.y + 13) + ')"><circle r="9.5"/><text y="0.5">' + (i + 1) + '</text><path class="ldx-tick" d="M-3.6 0.2 l2.6 3 l4.6 -6"/></g>' +
                '<title>' + esc(h.label) + '</title></g>';
        }).join("");
        const evHtml = c.map.evidence.map((e) => "<li><b>" + esc(e.label) + "</b> - " + esc(e.text) + "</li>").join("");
        return '<div class="ldx-wevidence"><b>EVIDENCE</b><ul>' + evHtml + "</ul></div>" +
            '<div class="ldx-checklist">' + c.targetIds.map((id) => {
            const h = c.hotspots.filter((x) => x.id === id)[0];
            const got = st.found.some((f) => f.id === id);
            return '<div class="ldx-chk' + (got ? " got" : "") + '"><i></i>' + esc(h ? h.label : id) + '</div>';
        }).join("") + '</div>' +
            '<div class="ldx-scenebox"><svg class="ldx-scene" viewBox="0 0 800 440" role="img" aria-label="Living room scene">' + SCENE + c.props + hots + '</svg></div>' +
            (st.hints.when || st.hints.why ? '<div class="ldx-answer">New lead: ' + (st.hints.when ? "the broken clock points to WHEN" : "") + (st.hints.when && st.hints.why ? " and " : "") + (st.hints.why ? "a hidden note points to WHY" : "") + '.</div>' : "");
    }
    function renderWhen(st, c) {
        const used = st.timelineOrder;
        const slots = [0, 1, 2, 3].map((i) => {
            const e = used[i] ? c.timeline.filter((x) => x.id === used[i])[0] : null;
            return '<span class="ldx-slot">' + (e ? esc(e.time) : "?") + '</span>';
        }).join("");
        const cards = c.timelineDisplay.map((eid) => {
            const e = c.timeline.filter((x) => x.id === eid)[0];
            const on = used.indexOf(eid) >= 0;
            return '<button class="ldx-tcard" type="button" data-act="tpick" data-eid="' + eid + '"' + (on ? " disabled" : "") + '><b>' + esc(e.time) + '</b><span>' + esc(e.text) + '</span></button>';
        }).join("");
        return '<div class="ldx-tline">' + slots + '</div><div class="ldx-tcards">' + cards + '</div>' +
            '<div class="ldx-stagefoot"><button class="ldx-btn" type="button" data-act="treset">Reset order</button><button class="ldx-btn pri" type="button" data-act="tsubmit"' + (used.length !== 4 ? " disabled" : "") + '>Submit timeline</button></div>';
    }
    function renderWho(st, c) {
        const cards = c.suspects.map((s, i) => {
            const asked = st.whoAsked[s.id] || [];
            const mark = st.whoMarks[s.id];
            const reveal = st.cheats.reveal && s.id === c.culpritId;
            const says = asked.length ? asked.map((q) => {
                const row = c.interrogation.filter((x) => x.sid === s.id)[0];
                return '<div class="ldx-wsays"><b>' + ({ alibi: "Alibi", whereabouts: "Evening", item: "Item" })[q] + ':</b> ' + hl(row[q], c) + '</div>';
            }).join("") : '<div class="ldx-wsays">No statement taken yet. Ask a question below.</div>';
            const mcls = reveal ? " cul" : mark ? " " + mark : "";
            return '<div class="ldx-wcard"><div class="ldx-wh">' + portraitSvg(s.look, i, 32) + '<div><b>' + esc(s.name) + '</b><span>' + esc(s.trait) + '</span></div><span class="ldx-wstat' + mcls + '">' + (reveal ? "Culprit" : mark ? statusLabel(mark) : "Unasked") + '</span></div>' +
                says + '<div class="ldx-wasks">' + ['alibi', 'whereabouts', 'item'].map((q) => '<button class="ldx-mini' + (asked.indexOf(q) >= 0 ? " on" : "") + '" type="button" data-act="ask" data-sid="' + s.id + '" data-q="' + q + '"' + (asked.indexOf(q) >= 0 ? " disabled" : "") + '>Ask ' + ({ alibi: "alibi", whereabouts: "evening", item: "item" })[q] + '</button>').join("") +
                '</div><div class="ldx-wasks"><button class="ldx-mini' + (mark === "cleared" ? " on" : "") + '" type="button" data-act="wmark" data-sid="' + s.id + '" data-mark="cleared">Clear</button><button class="ldx-mini' + (mark === "suspect" ? " on" : "") + '" type="button" data-act="wmark" data-sid="' + s.id + '" data-mark="suspect">Suspect</button></div></div>';
        }).join("");
        return '<div class="ldx-who">' + cards + '</div>';
    }
    function renderHow(st, c) {
        const head = '<tr><th>Suspect / Method</th>' + c.grid.cols.map((col) => '<th>' + esc(col.label) + '</th>').join("") + '</tr>';
        const rows = c.grid.rows.map((row) => '<tr><td>' + esc(row.label) + '</td>' + c.grid.cols.map((col) => {
            const v = st.gridMarks[row.id + ":" + col.id] || "?";
            return '<td><button class="ldx-cell ' + v + '" type="button" data-act="cell" data-row="' + row.id + '" data-col="' + col.id + '">' + v + '</button></td>';
        }).join("") + '</tr>').join("");
        return '<div class="ldx-rules">' + c.grid.rules.map((rule) => '<div class="ldx-rule">' + esc(rule) + '</div>').join("") + '</div>' +
            '<table class="ldx-grid"><thead>' + head + '</thead><tbody>' + rows + '</tbody></table>' +
            '<div class="ldx-note">Click a cell to cycle ? / Y / N. One cell should stay Y.</div>';
    }
    function renderWhy(st, c) {
        const nodeLabel = (id) => {
            const n = c.motive.nodes.filter((x) => x.id === id)[0];
            return n ? n.label : id;
        };
        const nodes = c.motive.nodes.map((n) => '<button class="ldx-node' + (st.motiveSel === n.id ? " sel" : "") + '" type="button" data-act="mnode" data-nid="' + n.id + '"><small>' + n.kind + '</small>' + esc(n.label) + '</button>').join("");
        const links = st.motiveLinks.length ? st.motiveLinks.map((l, i) => '<span class="ldx-link">' + esc(nodeLabel(l.a)) + ' -> ' + esc(nodeLabel(l.b)) + '<button type="button" data-act="munlink" data-idx="' + i + '" aria-label="Remove link">x</button></span>').join("") : '<span class="ldx-note">No links yet. Pick two nodes to connect them.</span>';
        return '<div class="ldx-nodes">' + nodes + '</div><div class="ldx-links">' + links + '</div>';
    }
    function renderFinal(st, c) {
        const rows = STAGE_IDS.map((id) => {
            const meta = STAGES.filter((s) => s.id === id)[0];
            const ss = st.stages[id];
            const linked = evidenceLinked(st, id);
            return '<tr><th>' + meta.label + '</th><td>' + esc(st.answers[id] || "Not answered") + '</td><td><a data-act="goto" data-id="' + id + '">' + statusLabel(ss.status) + '</a>' + (linked ? " / linked" : " / no evidence") + '</td></tr>';
        }).join("");
        const picks = c.suspects.map((s, i) => '<button class="ldx-pick' + (st.finalPick === s.id ? " on" : "") + '" type="button" data-act="fpick" data-sid="' + s.id + '">' + portraitSvg(s.look, i, 46) + '<b>' + esc(s.name) + '</b><span>' + esc(s.trait) + '</span></button>').join("");
        return '<table class="ldx-summary"><tbody>' + rows + '</tbody></table>' +
            '<div class="ldx-sec"><span>Name the culprit</span></div><div class="ldx-lineup">' + picks + '</div>' +
            '<button class="ldx-btn acc" type="button" data-act="fclose"' + (st.finalPick ? "" : " disabled") + '>Close the case</button>';
    }

    function renderStage(st, c) {
        const id = st.activeStage;
        const meta = STAGES.filter((s) => s.id === id)[0];
        const ss = st.stages[id];
        if (!meta || !ss) { st.view = "hub"; return renderHub(st, c); }
        let body = "";
        if (id === "where") body = renderWhere(st, c);
        else if (id === "what") body = renderWhat(st, c);
        else if (id === "when") body = renderWhen(st, c);
        else if (id === "who") body = renderWho(st, c);
        else if (id === "how") body = renderHow(st, c);
        else if (id === "why") body = renderWhy(st, c);
        else body = renderFinal(st, c);
        const checkBtn = (id === "how" && (ss.status === "in-progress" || ss.status === "incorrect"))
            ? '<button class="ldx-btn pri" type="button" data-act="gridcheck">Check grid</button>' : "";
        const whyBtn = (id === "why" && (ss.status === "in-progress" || ss.status === "incorrect"))
            ? '<button class="ldx-btn pri" type="button" data-act="motivecheck">Check links</button>' : "";
        const linkCount = Object.keys(st.links).filter((eid) => (st.links[eid] || []).indexOf(id) >= 0).length;
        const statusLine = id === "where"
            ? '<span class="ldx-statusline">' + (linkCount ? linkCount + (linkCount === 1 ? " evidence item" : " evidence items") + " linked" : "No evidence linked yet") + "</span>"
            : '<span class="ldx-statusline">Status: <b>' + statusLabel(ss.status) + '</b> - Output: ' + esc(meta.out) + '</span>';
        const stageIndex = STAGES.findIndex((s) => s.id === id);
        const nextStage = STAGES[stageIndex + 1];
        const nextBtn = ss.status === "confirmed" && nextStage && st.stages[nextStage.id].status !== "locked"
            ? '<button class="ldx-btn pri" type="button" data-act="stage" data-id="' + nextStage.id + '">Next: ' + nextStage.label + "</button>" : "";
        const foot = id === "final" ? "" :
            '<div class="ldx-stagefoot">' + statusLine +
            '<button class="ldx-btn" type="button" data-act="evidence">' + iconSVG("link", { size: 14 }) + ' Evidence Board</button>' +
            checkBtn + whyBtn +
            (ss.status === "completed" ? '<button class="ldx-btn pri" type="button" data-act="confirm" data-id="' + id + '">Confirm with evidence</button>' : "") +
            (ss.status === "confirmed" ? '<span class="ldx-statusline">Confirmed - you can review or continue.</span>' : "") +
            nextBtn +
            '</div>';
        return '<div class="ldx-stage"><div class="ldx-stagehead">' +
            '<button class="ldx-btn" type="button" data-act="back">&lt; Detective Board</button>' +
            '<div><span class="ldx-kicker">' + meta.n + ' - ' + meta.out + '</span><h2>' + esc(meta.title) + '</h2><p>' + esc(meta.desc) + '</p></div>' +
            statusChip(ss.status) + '</div>' +
            (ss.status === "in-progress" ? '<div class="ldx-stagefoot" style="border-top:0;padding-top:0">' +
            (id === "how" ? '<button class="ldx-btn pri" type="button" data-act="gridcheck">Check grid</button>' : "") +
            (id === "why" ? '<button class="ldx-btn pri" type="button" data-act="motivecheck">Check links</button>' : "") +
            '</div>' : "") +
            '<div class="ldx-stagebody">' + body + '</div>' + foot + '</div>';
    }

    function renderEvidence(st, c) {
        const stageTab = ui.evTab === "stage";
        const tabs = '<div class="ldx-evtabs"><button type="button" data-act="evtab" data-tab="stage" class="' + (stageTab ? "on" : "") + '">By Stage</button><button type="button" data-act="evtab" data-tab="pairs" class="' + (stageTab ? "" : "on") + '">Connections</button></div>';
        const pending = STAGE_IDS.filter((id) => st.stages[id].status === "completed");
        const pendingHtml = pending.length ? '<div class="ldx-banner ok"><span class="ldx-btag">READY</span><span class="ldx-btxt">Solved deductions waiting for confirmation: ' +
            pending.map((id) => '<button class="ldx-mini" type="button" data-act="confirm" data-id="' + id + '">Confirm ' + id.toUpperCase() + '</button>').join(" ") + '</span></div>' : "";
        let list = "";
        if (stageTab) {
            list = '<div class="ldx-evlist">' + c.evidence.map((e) => {
                const on = st.links[e.id] || [];
                const chips = STAGE_IDS.map((sid) => '<button class="ldx-evchip' + (on.indexOf(sid) >= 0 ? " on" : "") + '" type="button" data-act="lstage" data-eid="' + e.id + '" data-sid="' + sid + '">' + STAGES.filter((s) => s.id === sid)[0].label + '</button>').join("");
                return '<div class="ldx-evi' + (e.key ? " key" : "") + '"><div><b>' + (e.key ? '<span class="ldx-keyicon">KEY</span> ' : "") + esc(e.label) + '</b><p>' + hl(e.text, c) + '</p></div><div class="ldx-evchips">' + chips + '</div></div>';
            }).join("") + '</div>';
        } else {
            const pairs = st.pairLinks.length ? st.pairLinks.map((p) => {
                const a = c.evidence.filter((e) => e.id === p.a)[0], b = c.evidence.filter((e) => e.id === p.b)[0];
                return '<span class="ldx-link">' + esc(a.label) + ' <-> ' + esc(b.label) + '<button type="button" data-act="unpair" data-key="' + p.key + '" aria-label="Remove connection">x</button></span>';
            }).join("") : '<span class="ldx-note">No connections yet.</span>';
            list = '<div class="ldx-note">Click two evidence cards to connect them. Connections reveal relationships between clues.</div>' +
                '<div class="ldx-evlist">' + c.evidence.map((e) => '<div class="ldx-evi' + (e.key ? " key" : "") + (ui.pairSel === e.id ? " sel" : "") + '" data-act="pair" data-eid="' + e.id + '" style="cursor:pointer"><b>' + esc(e.label) + '</b><p>' + hl(e.text, c) + '</p></div>').join("") + '</div>' +
                '<div class="ldx-links">' + pairs + '</div>';
        }
        return '<div class="ldx-stage"><div class="ldx-stagehead"><button class="ldx-btn" type="button" data-act="back">&lt; Detective Board</button><div><span class="ldx-kicker">GLOBAL TOOL</span><h2>Evidence Board</h2><p>Link evidence to a deduction to confirm it, or connect two clues to reveal a relationship.</p></div></div>' +
            tabs + pendingHtml + list + '</div>';
    }

    /* ---------- overlays ---------- */
    const ovWrap = (inner) => '<div class="ldx-ov"><div class="ldx-card">' + inner + '</div></div>';
    function guideCard() {
        return ovWrap('<h3>How to play</h3><div class="ldx-scroll ldx-guide">' +
            '<h4>Goal</h4><p>Close three cases. Each case has seven stages in the order WHERE, WHAT, WHEN, WHO, HOW, WHY and FINAL ACCUSATION.</p>' +
            '<h4>Main Detective Board</h4><p>The board is your hub. Open any available stage, read the case file and jump into the Evidence Board at any time. Completed stages stay open for review.</p>' +
            '<h4>Statuses</h4><p>Locked, Available, In Progress, Completed, Confirmed and Incorrect. A correct puzzle answer marks a stage Completed. Link at least one evidence item to it and press Confirm to make it Confirmed.</p>' +
            '<h4>Non-linear clues</h4><p>Finding the broken clock during WHAT opens WHEN early. Finding a hidden note opens a lead on WHY. Earlier stages can be revisited at any time.</p>' +
            '<h4>Evidence Board</h4><p>Two modes: By Stage attaches evidence to a deduction; Connections links one clue to another. Both are available from the very first stage.</p>' +
            '<h4>Controls</h4><div class="ldx-keys"><span>1 - 7</span><span>open a stage from the board</span><span>Esc</span><span>back to the board / close a panel</span><span>H / C / P / R</span><span>help / cheats / pause / restart</span></div>' +
            '<h4>Fair play</h4><p>Cheats work offline only and disable best-score saving.</p>' +
            '</div><div class="ldx-row"><button class="ldx-btn pri" type="button" data-act="help-close">Got it</button></div>');
    }
    function cheatsCard(st) {
        const rows = [["reveal", "Reveal the culprit"], ["keys", "Mark key scene spots"], ["freeze", "Freeze the case clock"], ["unlock", "Unlock all stages"], ["whereHints", "Show WHERE clue answers"]];
        const canFill = st && st.phase === "play" && st.activeStage === "where";
        return ovWrap('<h3>Cheat console</h3><p class="ldx-note">Using cheats disables best-score saving.</p><div class="ldx-scroll">' +
            rows.map((r) => '<button class="ldx-cheat" type="button" data-act="cheat-toggle" data-key="' + r[0] + '"><span>' + r[1] + '</span><i class="ldx-sw' + (st.cheats[r[0]] ? " on" : "") + '"></i></button>').join("") + '</div>' +
            '<div class="ldx-row"><button class="ldx-btn" type="button" data-act="cheat-collect"' + (st.phase !== "play" ? " disabled" : "") + '>Collect all objects</button>' +
            '<button class="ldx-btn" type="button" data-act="cheat-autofill"' + (canFill ? "" : " disabled") + '>Fill WHERE answers</button>' +
            '<button class="ldx-btn" type="button" data-act="cheat-solve"' + (st.phase !== "play" ? " disabled" : "") + '>Solve case</button>' +
            '<button class="ldx-btn pri" type="button" data-act="cheats-close">Close</button></div>');
    }
    function pauseCard() {
        return ovWrap('<h3>Paused</h3><p class="sub">The case clock is on hold. Nothing advances until you resume.</p><div class="ldx-row"><button class="ldx-btn pri" type="button" data-act="pause">Resume</button><button class="ldx-btn" type="button" data-act="help">How to play</button><button class="ldx-btn" type="button" data-act="restart">Restart</button></div>');
    }
    function briefCard(st, c) {
        return ovWrap('<h3>Case ' + (st.caseIdx + 1) + ': ' + esc(c.title) + '</h3><p class="sub">' + esc(c.brief) + '</p>' +
            '<p class="ldx-ovline">7 stages - 4 suspects - 5 minutes on the clock</p>' +
            '<div class="ldx-row"><button class="ldx-btn pri" type="button" data-act="begin">Open Detective Board</button></div>');
    }
    function resultCard(st, c) {
        const r = st.result;
        if (r && r.ok) {
            const cul = c.suspects.filter((s) => s.id === c.culpritId)[0];
            return ovWrap('<h3 class="win">Case solved</h3><p class="sub">The culprit was ' + esc(cul.name) + ' (' + esc(cul.trait) + ').</p>' +
                '<p class="ldx-ovline">+' + r.pts + ' points (100 case + ' + r.timeB + ' time + 50 final)</p>' +
                '<p class="ldx-ovline">Score: ' + st.score + '</p>' +
                (st.cheated ? '<p class="ldx-note">Cheats were used this match.</p>' : "") +
                '<div class="ldx-row"><button class="ldx-btn pri" type="button" data-act="next">' + (st.caseIdx + 1 < CASE_COUNT ? "Next case" : "See final score") + '</button></div>');
        }
        return ovWrap('<h3 class="lose">Case failed</h3><p class="sub">' + esc(r ? r.reason : "The trail went cold.") + '</p>' +
            '<div class="ldx-row"><button class="ldx-btn pri" type="button" data-act="retry">Try a fresh layout</button></div>');
    }
    function finalCard(st) {
        if (!st.cheated && st.score > best) {
            best = st.score;
            try { localStorage.setItem(META.bestKey, String(best)); } catch (e) { /* storage blocked */ }
        }
        return ovWrap('<h3 class="win">Match over</h3><p class="sub">All ' + CASE_COUNT + ' cases are closed.</p>' +
            '<p class="ldx-ovline">Final score: ' + st.score + '</p>' +
            (best === st.score ? '<p class="ldx-ovline">New personal best!</p>' : best > 0 ? '<p class="ldx-note">Best: ' + best + '</p>' : "") +
            (st.cheated ? '<p class="ldx-note">Cheats were used - best score not saved.</p>' : "") +
            '<div class="ldx-row"><button class="ldx-btn pri" type="button" data-act="replay">Play again</button></div>');
    }
    function whereResultCard(c) {
        const r = ui.whereModal;
        const room = c.map.rooms.filter((x) => x.id === r.room)[0];
        const ok = !!r.ok;
        return ovWrap('<h3 class="' + (ok ? "win" : "lose") + '">' + (ok ? "Location confirmed" : "Incorrect location") + "</h3>" +
            '<p class="sub">' + (ok
                ? "You marked " + esc(room ? room.name : r.room) + ". The map clues point to this room."
                : "That room does not match the footprints, the sign-in log and the fresh trace. Review the clues and try again.") + "</p>" +
            '<p class="ldx-ovline">Status: ' + (ok ? "Completed" : "Incorrect") + " - Output: Crime Location</p>" +
            '<div class="ldx-row"><button class="ldx-btn pri" type="button" data-act="where-modal-close">' + (ok ? "Continue" : "Try again") + "</button></div>");
    }
    function overlayHtml(st, c) {
        if (ui.help) return guideCard();
        if (ui.cheats && st) return cheatsCard(st);
        if (ui.paused) return pauseCard();
        if (ui.brief && st && st.phase === "play") return briefCard(st, c).replace('data-act="begin">Open Detective Board', 'data-act="brief-close">Back to board');
        if (ui.whereModal && st && st.phase === "play") return whereResultCard(c);
        if (bannerVisible(st)) return bannerCard(st, c);
        if (!st) return ovWrap('<h3>Little Detective</h3><div class="ldx-wait">Preparing the case...</div>');
        if (st.phase === "lobby") return ovWrap('<h3>Little Detective</h3><p class="sub">A seven-stage investigation. Work the Main Detective Board, connect the evidence and accuse with confidence.</p>' +
            (best > 0 ? '<p class="ldx-ovline">Best score: ' + best + '</p>' : "") +
            '<div class="ldx-row"><button class="ldx-btn pri" type="button" data-act="start">Start match</button><button class="ldx-btn" type="button" data-act="help">How to play</button></div>');
        if (st.phase === "brief") return briefCard(st, c);
        if (st.phase === "result") return resultCard(st, c);
        if (st.phase === "final") return finalCard(st);
        return "";
    }

    function statusText(st) {
        if (st.phase === "lobby") return "Ready";
        if (st.phase === "brief") return "Briefing";
        if (st.phase === "result") return st.result && st.result.ok ? "Case solved" : "Case failed";
        if (st.phase === "final") return "Match over";
        if (st.view === "evidence") return "Evidence Board";
        if (st.view === "stage") return statusLabel(st.stages[st.activeStage] ? st.stages[st.activeStage].status : "available");
        return "Investigating";
    }

    function render() {
        if (destroyed) return;
        if (!state) { statusEl.textContent = "Loading"; ovEl.innerHTML = overlayHtml(null, null); return; }
        const st = state, c = caseOf(st);
        if (st.view !== "stage" || st.activeStage !== "where") { ui.whereDetail = null; ui.whereModal = null; ui.activeSuspect = null; }
        hud.case.textContent = (st.caseIdx + 1) + "/" + CASE_COUNT;
        hud.prog.textContent = STAGE_IDS.filter((id) => st.stages[id].status === "confirmed").length + "/6";
        hud.ev.textContent = st.found.length + "/8";
        hud.score.textContent = String(st.score);
        hud.time.textContent = fmtTime(st.timeLeft) + (st.cheats.freeze ? " *" : "");
        bestEl.textContent = best > 0 ? String(best) : "—";
        statusEl.textContent = statusText(st);
        timeFill.style.width = Math.max(0, (st.timeLeft / CASE_TIME) * 100) + "%";
        cheatBtn.hidden = false;
        cheatBtn.classList.toggle("on", Object.keys(st.cheats).some((k) => st.cheats[k]));
        const cl = cheatBtn.querySelector(".ldx-btn-label");
        if (cl) cl.textContent = Object.keys(st.cheats).some((k) => st.cheats[k]) ? "Cheats on" : "Cheats";
        const pl = pauseBtn.querySelector(".ldx-btn-label");
        if (pl) pl.textContent = ui.paused ? "Resume" : "Pause";
        pauseBtn.setAttribute("aria-label", ui.paused ? "Resume" : "Pause");

        let html = "";
        if (st.phase === "play") {
            if (st.view === "evidence") html = renderEvidence(st, c);
            else if (st.view === "stage") html += renderStage(st, c);
            else html += renderHub(st, c);
        } else {
            html = renderHub(st, c);
        }
        viewEl.innerHTML = html;
        ovEl.innerHTML = overlayHtml(st, c);
    }

    /* ---------- input ---------- */
    function toggleHelp(on) {
        ui.help = typeof on === "boolean" ? on : !ui.help;
        if (ui.help) { ui.cheats = false; ui.picker = null; }
        render();
    }
    function toggleCheats(on) {
        ui.cheats = typeof on === "boolean" ? on : !ui.cheats;
        if (ui.cheats) ui.help = false;
        render();
    }
    function setPaused(on) {
        const next = typeof on === "boolean" ? on : !ui.paused;
        if (next === ui.paused) return;
        ui.paused = next;
        render();
    }
    function handleClick(e) {
        const el = e.target && e.target.closest ? e.target.closest("[data-act],[data-help],[data-cheats],[data-pause],[data-restart],[data-exit]") : null;
        if (!el) return;
        let act = el.getAttribute("data-act");
        if (!act) {
            if (el.hasAttribute("data-help")) act = "help";
            else if (el.hasAttribute("data-cheats")) act = "cheats";
            else if (el.hasAttribute("data-pause")) act = "pause";
            else if (el.hasAttribute("data-restart")) act = "restart";
            else if (el.hasAttribute("data-exit")) act = "exit";
        }
        if (act === "exit") { onExit(); return; }
        if (!state && act !== "help" && act !== "help-close") return;
        switch (act) {
            case "help": toggleHelp(); break;
            case "help-close": toggleHelp(false); break;
            case "cheats": toggleCheats(); break;
            case "cheats-close": toggleCheats(false); break;
            case "pause": setPaused(); break;
            case "restart": submit({ t: "restart" }); break;
            case "banner-x": ui.dismissRev = state.rev; submit({ t: "banner-x" }); break;
            case "start": case "begin": case "next": case "retry": case "replay": submit({ t: act }); break;
            case "brief": ui.brief = true; render(); break;
            case "brief-close": ui.brief = false; render(); break;
            case "evidence": submit({ t: "open-view", view: "evidence" }); break;
            case "back": submit({ t: "back" }); break;
            case "stage": submit({ t: "stage-open", id: el.getAttribute("data-id") }); break;
            case "goto": submit({ t: "stage-open", id: el.getAttribute("data-id") }); break;
            case "confirm": submit({ t: "confirm-stage", id: el.getAttribute("data-id") }); break;
            case "clue-toggle": submit({ t: "clue-toggle", cid: el.getAttribute("data-cid") }); break;
            case "select-suspect": {
                const sid = el.getAttribute("data-sid");
                ui.activeSuspect = ui.activeSuspect === sid ? null : sid;
                ui.whereDetail = null;
                render();
                break;
            }
            case "check-positions": submit({ t: "check-positions" }); break;
            case "room-detail": {
                const room = el.getAttribute("data-room");
                if (ui.activeSuspect) submit({ t: "place-suspect", sid: ui.activeSuspect, room: room });
                else { ui.whereDetail = room; render(); }
                break;
            }
            case "room-close": ui.whereDetail = null; render(); break;
            case "map-pick": {
                const room = el.getAttribute("data-room");
                ui.whereDetail = null;
                const beforeRev = state ? state.rev : -1;
                submit({ t: "map-pick", room: room });
                const accepted = !!state && state.rev !== beforeRev;
                const after = state ? state.stages.where.status : null;
                if (accepted && (after === "completed" || after === "incorrect")) {
                    ui.whereModal = { ok: after === "completed", room: room };
                    ui.dismissRev = state.rev;
                    render();
                }
                break;
            }
            case "where-modal-close": ui.whereModal = null; render(); break;
            case "hot": submit({ t: "hidden-search", hid: el.getAttribute("data-hid") }); break;
            case "tpick": submit({ t: "timeline-pick", eid: el.getAttribute("data-eid") }); break;
            case "treset": submit({ t: "timeline-reset" }); break;
            case "tsubmit": submit({ t: "timeline-submit" }); break;
            case "ask": submit({ t: "who-ask", sid: el.getAttribute("data-sid"), q: el.getAttribute("data-q") }); break;
            case "wmark": submit({ t: "who-mark", sid: el.getAttribute("data-sid"), mark: el.getAttribute("data-mark") }); break;
            case "cell": submit({ t: "grid-mark", row: el.getAttribute("data-row"), col: el.getAttribute("data-col") }); break;
            case "gridcheck": submit({ t: "grid-check" }); break;
            case "mnode": submit({ t: "motive-pick", nid: el.getAttribute("data-nid") }); break;
            case "munlink": submit({ t: "motive-unlink", idx: Number(el.getAttribute("data-idx")) }); break;
            case "motivecheck": submit({ t: "motive-check" }); break;
            case "lstage": submit({ t: "link-stage", eid: el.getAttribute("data-eid"), sid: el.getAttribute("data-sid") }); break;
            case "pair": submit({ t: "link-pair", eid: el.getAttribute("data-eid") }); break;
            case "unpair": submit({ t: "unlink-pair", key: el.getAttribute("data-key") }); break;
            case "evtab": ui.evTab = el.getAttribute("data-tab"); state.pairSel = null; render(); break;
            case "fpick": state.finalPick = el.getAttribute("data-sid"); render(); break;
            case "fclose": submit({ t: "final-close", sid: state.finalPick }); break;
            case "cheat-toggle": submit({ t: "cheat", key: el.getAttribute("data-key") }); break;
            case "cheat-collect": submit({ t: "cheat-collect" }); break;
            case "cheat-autofill": {
                submit({ t: "cheat-autofill" });
                if (state && state.activeStage === "where") ui.whereDetail = caseOf(state).map.answerRoom;
                render();
                break;
            }
            case "cheat-solve": submit({ t: "cheat-solve" }); break;
            default: break;
        }
    }
    function onKey(e) {
        if (destroyed || !state) return;
        if (e.metaKey || e.ctrlKey || e.altKey) return;
        const k = e.key, lower = typeof k === "string" ? k.toLowerCase() : "";
        if (lower === "h" || k === "?") { e.preventDefault(); toggleHelp(); return; }
        if (ui.help) { if (k === "Escape" || k === "Enter") { e.preventDefault(); toggleHelp(false); } return; }
        if (lower === "c") { e.preventDefault(); toggleCheats(); return; }
        if (ui.cheats) { if (k === "Escape" || k === "Enter") { e.preventDefault(); toggleCheats(false); } return; }
        if (lower === "p") { e.preventDefault(); setPaused(); return; }
        if (ui.paused) { if (k === "Escape" || k === "Enter") { e.preventDefault(); setPaused(false); } return; }
        if (ui.whereModal) { if (k === "Escape" || k === "Enter") { e.preventDefault(); ui.whereModal = null; render(); } return; }
        if (bannerVisible(state)) {
            if (k === "Escape" || k === "Enter") { e.preventDefault(); ui.dismissRev = state.rev; submit({ t: "banner-x" }); }
            return;
        }
        if (lower === "r") { e.preventDefault(); submit({ t: "restart" }); return; }
        if (k === "Escape") {
            e.preventDefault();
            if (ui.brief) { ui.brief = false; render(); return; }
            if (state.phase === "play" && state.view !== "hub") submit({ t: "back" });
            return;
        }
        const ph = state.phase;
        if (ph === "lobby" || ph === "brief" || ph === "result" || ph === "final") {
            if (k === "Enter" || k === " ") {
                e.preventDefault();
                if (ph === "lobby") submit({ t: "start" });
                else if (ph === "brief") submit({ t: "begin" });
                else if (ph === "result") submit({ t: state.result && state.result.ok ? "next" : "retry" });
                else submit({ t: "replay" });
            }
            return;
        }
        if (state.view === "hub" && k >= "1" && k <= "7") {
            const s = STAGES[Number(k) - 1];
            if (s && state.stages[s.id].status !== "locked") { e.preventDefault(); submit({ t: "stage-open", id: s.id }); }
            return;
        }
        if (state.view === "stage" && state.activeStage === "how" && k === "Enter") { e.preventDefault(); submit({ t: "grid-check" }); return; }
        if (state.view === "stage" && state.activeStage === "why" && k === "Enter") { e.preventDefault(); submit({ t: "motive-check" }); return; }
    }

    root.addEventListener("click", handleClick);
    document.addEventListener("keydown", onKey);
    timerId = setInterval(() => {
        if (destroyed || !state) return;
        if (ui.paused || ui.help || ui.cheats || document.hidden) return;
        const now = Date.now();
        if (ui.lastTickAt && now - ui.lastTickAt < 900) return;
        ui.lastTickAt = now;
        if (state.phase === "play") submit({ t: "tick" });
    }, 1000);

    state = initialState();
    render();

    return {
        destroy() {
            destroyed = true;
            root.removeEventListener("click", handleClick);
            document.removeEventListener("keydown", onKey);
            if (timerId) { clearInterval(timerId); timerId = null; }
        },
        _test: { generateCase, checkCaseData, solveCase, applyToState, initialState, buildCase },
    };
}
