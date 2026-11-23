/* ==== GAME: little-detective.js ==== */
/* =============================================================
LITTLE DETECTIVE - template-compliant rebuild (export META + mount).
Turn-based deduction race: vs bot (mode "ai") or 1v1 (mode "room").
Host-authoritative serializable state; procedural cases are
validated to be uniquely solvable before they are dealt.
Pure inline SVG + CSS. No canvas, no emoji, ASCII text.
============================================================= */

export const META = {
    id: "little-detective",
    name: "Little Detective",
    category: "puzzle",
    catLabel: "Puzzle",
    desc: "Race a rival detective: search the scene, run forensics, test alibis and accuse first.",
    art: '<svg viewBox="0 0 48 48" width="54" height="54" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><ellipse cx="21" cy="17" rx="3.4" ry="5" fill="currentColor" stroke="none"/><circle cx="21" cy="25.5" r="2.6" fill="currentColor" stroke="none"/><circle cx="20" cy="20" r="11.5"/><path d="M28.5 28.5L40 40"/></svg>',
    bg: ["#eef2f7", "#d7dfe9"],
    bestKey: "littleDetectiveBest",
};

/* ---------- tuning ---------- */
const CASE_TIME = 180;      // seconds per case (extended for six 5W1H deductions)
const TURN_TIME = 30;       // seconds per turn
const CASE_COUNT = 3;
const MIN_CLUES = 4;        // shared clues needed before accusing
const MAX_ATT = 2;          // accusation attempts per detective per case
const BUDGET = { cctv: 1, lab: 1, alibi: 2 }; // tool uses per detective per case
const PLAYER_HUES = ["#2563eb", "#db2777"];
const SUSPECT_HUES = ["#2563eb", "#7c3aed", "#dc2626", "#059669"];

/* ---------- small helpers ---------- */
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

/* ---------- suspect pool (12 characters, 4 drawn per case) ---------- */
const POOL = [
    { id: "sam", name: "Sam", trait: "blue beanie", phrase: "the blue beanie", mark: "blue wool fibers", role: "night-shift baker", habit: "hums old radio tunes", item: "a dented flour tin", look: 0 },
    { id: "theo", name: "Theo", trait: "round glasses", phrase: "the round glasses", mark: "lens-cloth lint", role: "puzzle editor", habit: "counts his steps", item: "a pocket notebook", look: 1 },
    { id: "mia", name: "Mia", trait: "red scarf", phrase: "the red scarf", mark: "red scarf threads", role: "drama student", habit: "quotes stage plays", item: "a theatre tote", look: 3 },
    { id: "priya", name: "Priya", trait: "silver anklet", phrase: "the silver anklet", mark: "silver polish residue", role: "chess captain", habit: "taps out rhythms", item: "a chess bag", look: 2 },
    { id: "ben", name: "Ben", trait: "green cap", phrase: "the green cap", mark: "green cap fibers", role: "skate club regular", habit: "spins a coin", item: "a skate backpack", look: 0 },
    { id: "nora", name: "Nora", trait: "left-handed", phrase: "the left-handed swing", mark: "left-handed smear marks", role: "softball pitcher", habit: "practices dry swings", item: "a sports duffel", look: 2 },
    { id: "jax", name: "Jax", trait: "football boots", phrase: "the football boots", mark: "studded sole prints", role: "team goalie", habit: "jogs on the spot", item: "a kit bag", look: 0 },
    { id: "ivy", name: "Ivy", trait: "bubblegum", phrase: "the bubblegum habit", mark: "bubblegum wrappers", role: "comic artist", habit: "doodles in margins", item: "a pink pencil case", look: 2 },
    { id: "ava", name: "Ava", trait: "purple gloves", phrase: "the purple gloves", mark: "purple glove prints", role: "plant keeper", habit: "names every plant", item: "a pruning pouch", look: 3 },
    { id: "omar", name: "Omar", trait: "cat allergy", phrase: "the cat allergy", mark: "mint tea droplets", role: "tea critic", habit: "sniffs every cup", item: "a mint tea tin", look: 1 },
    { id: "gigi", name: "Gigi", trait: "glitter nails", phrase: "the glitter nails", mark: "fine nail glitter", role: "party planner", habit: "snaps to the beat", item: "a confetti pouch", look: 2 },
    { id: "ravi", name: "Ravi", trait: "magic tricks", phrase: "the magic tricks", mark: "coarse stage glitter", role: "street magician", habit: "shuffles a deck", item: "a black top hat", look: 1 },
];

/* ---------- hotspot slots on the shared living-room scene ---------- */
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

/* ---------- case themes ---------- */
const THEMES = [
    {
        id: "cake", title: "The Vanishing Cake", time: "8:15 PM", sceneNoun: "kitchen door",
        brief: "A chocolate cake vanished from the kitchen during movie night. Four friends stayed in this living room the whole time. Search the scene, weigh the evidence, and accuse before your rival does.",
        fiveW1H: {
            what: "A chocolate cake disappeared from the kitchen during movie night.",
            where: "The kitchen, near the kitchen door.",
            why: "A craving for chocolate.",
            how: "The cake was carried toward the kitchen door while everyone watched the movie.",
            whatDecoys: ["The movie projector was stolen.", "The cat escaped through the window."],
            whyDecoys: ["A plan to frame the cat.", "A broken kitchen appliance."],
            howDecoys: ["The cake melted under the lights.", "A stranger entered through the locked window."]
        },
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
        q: "Why did the cake vanish?",
        motive: (c) => c.name + " could not resist the chocolate",
        decoys: ["A plot to frame the cat", "A midnight bake-sale heist"],
        props: '<g><ellipse cx="566" cy="331" rx="24" ry="5" fill="#d9dee7"/><rect x="562" y="318" width="8" height="13" fill="#c3cad6"/><ellipse cx="566" cy="318" rx="20" ry="4.5" fill="#eef1f6"/><circle cx="552" cy="334" r="1.6" fill="#6b4a32"/><circle cx="578" cy="335" r="1.4" fill="#6b4a32"/><circle cx="566" cy="336" r="1.2" fill="#6b4a32"/></g>',
    },
    {
        id: "lamp", title: "The Broken Lamp", time: "8:02 PM", sceneNoun: "broken lamp",
        brief: "Grandma's favourite lamp lies in pieces. Everyone blames the cat, but the cat flap log says otherwise. Someone swung at something indoors. Beat your rival to the truth.",
        fiveW1H: {
            what: "Grandma's favourite lamp was broken by an indoor practice swing.",
            where: "The living room, beside the coffee table.",
            why: "An urge to practise a swing indoors.",
            how: "Someone stood on the sofa and swung a practice bat.",
            whatDecoys: ["The potted plant was knocked over.", "The cat flap was broken."],
            whyDecoys: ["A sudden earthquake.", "The cat was chasing a moth."],
            howDecoys: ["The lamp fell because of a power surge.", "The cat pushed the lamp from the shelf."]
        },
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
        q: "How did the lamp really break?",
        motive: (c) => c.name + " took a wild practice swing",
        decoys: ["The cat knocked it over", "A midnight tremor shook it down"],
        props: '<g><path d="M262 214 l10 12 M282 210 l-8 14" stroke="#8a5a2b" stroke-width="2.5" fill="none"/><polygon points="246,306 300,306 288,276 258,276" fill="#e8b04b" transform="rotate(24 272 292)"/><polygon points="252,352 262,344 266,354" fill="#f2c66a"/><polygon points="284,350 294,342 298,352" fill="#f2c66a"/><polygon points="270,360 278,354 282,362" fill="#e8b04b"/></g>',
    },
    {
        id: "ring", title: "The Missing Ring", time: "8:00 PM", sceneNoun: "side table",
        brief: "During a cozy dinner party, Aunt Rose's ring vanished from the side table. The door was locked and the window shut. One of the four guests is hiding a trick. Name them before your rival does.",
        fiveW1H: {
            what: "Aunt Rose's ring disappeared from the side table during dinner.",
            where: "The side table in the dinner-party room.",
            why: "To keep a valuable ring for personal use.",
            how: "The ring was palmed during a loud story and hidden in a personal item.",
            whatDecoys: ["The picture frame was stolen.", "The window latch was damaged."],
            whyDecoys: ["The ring was planted as a joke.", "The cat wanted a shiny toy."],
            howDecoys: ["The ring fell into the plant pot.", "A visitor took it through the locked window."]
        },
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
        q: "Where did the ring go?",
        motive: (c) => c.name + " tucked it into " + c.item,
        decoys: ["Swallowed by the cat", "Buried in the plant pot"],
        props: '<g><rect x="330" y="86" width="44" height="26" rx="3" fill="#232733"/><rect x="330" y="102" width="44" height="6" fill="#7c3aed"/><rect x="322" y="110" width="60" height="7" rx="3" fill="#1a1d27"/><ellipse cx="566" cy="331" rx="14" ry="4" fill="#d9dee7"/><ellipse cx="566" cy="329" rx="10" ry="3" fill="#f4f6fa"/></g>',
    },
];

/* ---------- procedural, guaranteed-solvable case generator ---------- */
function keyText(t, c, label, th) {
    if (t === 0) return "Traces of " + c.mark + " on the " + label.toLowerCase() + ". Only " + c.name + " - " + c.phrase + " - leaves that signature.";
    if (t === 1) return "The sign-in log places " + c.name + " beside the " + th.sceneNoun + " at " + th.time + ", minutes before it happened.";
    return "A witness sketch shows " + c.mark + " near the " + th.sceneNoun + ". The initials beneath: " + c.name.charAt(0) + ".";
}
const KEY_TITLES = ["Trace evidence", "", "Witness doodle"];
const FIVE_W1H = [
    { id: "what", label: "WHAT", title: "What happened?", prompt: "Identify the incident and the object involved." },
    { id: "who", label: "WHO", title: "Who is cleared?", prompt: "Select the pair of suspects confirmed away from the scene by the porch camera." },
    { id: "when", label: "WHEN", title: "When did it happen?", prompt: "Match the incident to the time supported by the scene evidence." },
    { id: "where", label: "WHERE", title: "Where did it happen?", prompt: "Identify the place connected to the incident." },
    { id: "why", label: "WHY", title: "Why did it happen?", prompt: "Choose the explanation that best fits the evidence." },
    { id: "how", label: "HOW", title: "How was it done?", prompt: "Reconstruct the method using the available clues." },
];

function buildFiveW1HTasks(r, th, cast, clearedSuspects) {
    const spec = th.fiveW1H;
    const allPairs = [];
    for (let i = 0; i < cast.length; i++) {
        for (let j = i + 1; j < cast.length; j++) {
            const pair = [cast[i], cast[j]];
            allPairs.push({ label: pair.map((person) => person.name).join(" + "), ids: pair.map((person) => person.id) });
        }
    }
    const whoTarget = allPairs.filter((pair) => pair.ids.every((id) => clearedSuspects.some((person) => person.id === id)))[0];
    const whoDecoys = shuffleR(r, allPairs.filter((pair) => pair.label !== whoTarget.label)).slice(0, 2).map((pair) => pair.label);
    const rows = [
        { id: "what", answer: spec.what, options: shuffleR(r, [spec.what].concat(spec.whatDecoys)), reveal: "The incident is now identified." },
        { id: "who", answer: whoTarget.label, options: shuffleR(r, [whoTarget.label].concat(whoDecoys)), eliminateSids: whoTarget.ids, reveal: whoTarget.label.replace(" + ", " and ") + " are confirmed away from the scene and are cleared." },
        { id: "when", answer: th.time, options: shuffleR(r, [th.time, "7:45 PM", "9:10 PM"]), reveal: "The incident time is " + th.time + "." },
        { id: "where", answer: spec.where, options: shuffleR(r, [spec.where, "The upstairs bedroom.", "The garden near the gate."]), reveal: "The relevant location is identified." },
        { id: "why", answer: spec.why, options: shuffleR(r, [spec.why].concat(spec.whyDecoys)), reveal: "The likely motive is identified." },
        { id: "how", answer: spec.how, options: shuffleR(r, [spec.how].concat(spec.howDecoys)), reveal: "The method is reconstructed." },
    ];
    return rows.map((row) => {
        const meta = FIVE_W1H.filter((x) => x.id === row.id)[0];
        return Object.assign({}, meta, row);
    });
}

function buildCase(rngSeed, idx) {
    const r = mulberry32(rngSeed);
    const th = THEMES[idx % THEMES.length];
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
    const fiveW1HTasks = buildFiveW1HTasks(r, th, cast, exonSus);
    const answer = th.motive(cul);
    const options = shuffleR(r, [answer].concat(th.decoys));
    const verdicts = cast.map((s) => {
        if (s.id === cul.id) {
            return { sid: s.id, broken: true, text: cul.name + "'s alibi collapses: no camera trace of \"" + cul.claim + "\" at " + th.time + ", and " + cul.mark + " near the " + th.sceneNoun + "." };
        }
        return { sid: s.id, broken: false, text: s.name + "'s alibi holds: the hall camera confirms \"" + s.claim + "\" at " + th.time + "." };
    });
    return {
        themeId: th.id, title: th.title, brief: th.brief, time: th.time, sceneNoun: th.sceneNoun, props: th.props,
        suspects: cast, culpritId: cul.id, hotspots: hotspots,
        clearedSuspectIds: exonSus.map((s) => s.id),
        investigations: fiveW1HTasks,
        finalQuestion: { q: th.q, options: options, answer: answer },
        verdicts: verdicts,
        cctv: "Playback " + th.time + ": a figure crosses the room - " + cul.phrase + ". Build and gait match " + cul.name + ".",
    };
}

/* uniqueness solver: exactly one suspect may be referenced by >=2 key clues */
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
    keys.forEach((h) => {
        const t = h.clue.title + " " + h.clue.text;
        if (!refsSuspect(t, cul)) errors.push("key clue without culprit ref: " + h.id);
        c.suspects.forEach((s) => {
            if (s.id !== cul.id && refsSuspect(t, s)) errors.push("key clue refs other suspect " + s.id + ": " + h.id);
        });
    });
    c.hotspots.forEach((h) => {
        if (h.clue.key) return;
        if (refsSuspect(h.clue.title + " " + h.clue.text, cul)) errors.push("filler refs culprit: " + h.id);
    });
    const fq = c.finalQuestion;
    if (fq.options.indexOf(fq.answer) < 0 || new Set(fq.options).size !== 3) errors.push("final question invalid");
    if (!Array.isArray(c.investigations) || c.investigations.length !== 6 || new Set(c.investigations.map((x) => x.id)).size !== 6) errors.push("need six unique 5W1H tasks");
    (c.investigations || []).forEach((task) => {
        if (!task.options || task.options.length !== 3 || new Set(task.options).size !== 3 || task.options.indexOf(task.answer) < 0) errors.push("invalid 5W1H options: " + task.id);
        if (task.id === "who" && (!Array.isArray(task.eliminateSids) || task.eliminateSids.length !== 2 || !task.eliminateSids.every((id) => c.clearedSuspectIds.includes(id) && id !== c.culpritId))) errors.push("WHO task must clear two verified non-culprit suspects");
    });
    const broken = c.verdicts.filter((v) => v.broken).map((v) => v.sid);
    if (broken.length !== 1 || broken[0] !== c.culpritId) errors.push("alibi verdicts inconsistent");
    if (!hasTok(c.cctv, cul.name)) errors.push("cctv does not name culprit");
    if (!solveCase(c).ok) errors.push("case is not uniquely solvable");
    return { ok: errors.length === 0, errors: errors };
}

const caseCache = new Map();
function generateCase(seed, idx) {
    const ck = (seed >>> 0) + "|" + idx;
    if (caseCache.has(ck)) return caseCache.get(ck);
    let c = null;
    for (let attempt = 0; attempt < 64; attempt++) {
        c = buildCase((seed + attempt * 7919) >>> 0, idx);
        if (checkCaseData(c).ok) break;
    }
    if (caseCache.size > 240) caseCache.clear();
    caseCache.set(ck, c);
    return c;
}
const caseOf = (st) => generateCase((st.seed + st.salt * 104729) >>> 0, st.caseIdx);

/* ---------- serializable match state + pure reducer ---------- */
function initialState(opts) {
    const online = !!opts.online;
    const seatOf = online ? shuffleR(Math.random, [0, 1]) : [0, 1]; // random seat draw in multiplayer
    const first = Math.random() < 0.5 ? 0 : 1;                        // random coin flip for first move
    const names = ["Detective A", "Detective B"];
    names[seatOf[0]] = String(opts.hostName || "Detective A").slice(0, 18);
    return {
        v: 2, seed: (Math.random() * 4294967296) >>> 0, salt: 0,
        seatOf: seatOf, first: first, turn: first, caseIdx: 0, phase: "lobby",
        timeLeft: CASE_TIME, turnLeft: TURN_TIME,
        found: [], intel: [], investigations: [], eliminated: [], tools: [Object.assign({}, BUDGET), Object.assign({}, BUDGET)],
        attempts: [MAX_ATT, MAX_ATT], scores: [0, 0],
        accuse: null, result: null, banner: null, log: [],
        cheats: { reveal: false, keys: false, freeze: false, infinite: false },
        cheated: false, rev: 0, names: names,
    };
}
function pushLog(st, msg) { st.log.push(msg); st.log = st.log.slice(-8); }
function setupCase(st, idx, salt) {
    st.caseIdx = idx; st.salt = salt;
    st.found = []; st.intel = []; st.investigations = []; st.eliminated = [];
    st.tools = [Object.assign({}, BUDGET), Object.assign({}, BUDGET)];
    st.attempts = [MAX_ATT, MAX_ATT];
    st.timeLeft = CASE_TIME; st.turnLeft = TURN_TIME;
    st.accuse = null; st.result = null; st.banner = null; st.phase = "brief";
}
function resetMatch(st, online) {
    st.seed = (Math.random() * 4294967296) >>> 0;
    st.seatOf = online ? shuffleR(Math.random, [0, 1]) : [0, 1];
    st.first = Math.random() < 0.5 ? 0 : 1;
    st.turn = st.first;
    st.scores = [0, 0];
    st.cheats = { reveal: false, keys: false, freeze: false, infinite: false };
    st.cheated = false;
    st.log = [];
    setupCase(st, 0, 0);
    st.phase = "lobby";
}
function endTurn(st) { st.turn = 1 - st.turn; st.turnLeft = TURN_TIME; }
function winCase(st, seat, quizOk, c) {
    const timeB = Math.floor(st.timeLeft / 2);
    const quizB = quizOk ? 50 : 0;
    const pts = 100 + timeB + quizB;
    st.scores[seat] += pts;
    st.result = { ok: true, by: seat, pts: pts, quizOk: quizOk, culpritId: c.culpritId, timeB: timeB, quizB: quizB };
    st.phase = "result"; st.accuse = null;
    pushLog(st, st.names[seat] + " closed the case (+" + pts + ").");
}
function failCase(st, reason, c) {
    st.result = { ok: false, reason: reason, culpritId: c.culpritId };
    st.phase = "result"; st.accuse = null;
    pushLog(st, "Case failed: " + reason);
}
/* how many hard references to the culprit are on the table (shared knowledge) */
function culpritRefs(st, c) {
    let n = 0;
    st.found.forEach((f) => {
        const h = c.hotspots.filter((x) => x.id === f.id)[0];
        if (h && h.clue.key) n++;
    });
    st.intel.forEach((i) => {
        if (i.kind === "cctv" || (i.kind === "alibi" && i.broken) || (i.kind === "lab" && i.hit)) n++;
    });
    return n;
}

/* returns true when state changed, "reset" for a fresh match, false when rejected */
function applyToState(st, a, seat, env) {
    if (!st || !a || (seat !== 0 && seat !== 1)) return false;
    const online = !!(env && env.online);
    const t = a.t;
    const c = caseOf(st);
    const ph = st.phase;

    if (t === "hello") {
        const nm = String(a.name || "").replace(/[<>]/g, "").slice(0, 18);
        if (nm) st.names[seat] = nm;
        return true;
    }
    if (t === "restart" || (t === "replay" && ph === "final")) return "reset";

    if (t === "cheat") {
        if (online || !Object.prototype.hasOwnProperty.call(st.cheats, a.key)) return false;
        st.cheats[a.key] = !st.cheats[a.key];
        if (st.cheats[a.key]) st.cheated = true;
        pushLog(st, "Cheat " + a.key + (st.cheats[a.key] ? " on." : " off."));
        return true;
    }
    if (t === "cheat-collect") {
        if (online || ph !== "play") return false;
        c.hotspots.forEach((h) => {
            if (st.found.some((f) => f.id === h.id)) return;
            st.found.push({ id: h.id, by: 0 });
            st.scores[0] += h.clue.key ? 25 : 10;
        });
        st.cheated = true;
        st.banner = { tag: "INFO", text: "Cheat: all clues collected.", by: 0 };
        return true;
    }
    if (t === "cheat-solve") {
        if (online || !(ph === "play" || (ph === "accuse" && st.accuse && st.accuse.by === 0))) return false;
        st.cheated = true;
        winCase(st, 0, true, c);
        return true;
    }

    if (t === "tick") {
        if (ph !== "play" || st.cheats.freeze) return false;
        st.timeLeft--; st.turnLeft--;
        if (st.timeLeft <= 0) {
            st.timeLeft = 0;
            failCase(st, "Out of time - the trail went cold.", c);
            return true;
        }
        if (st.turnLeft <= 0) {
            pushLog(st, st.names[st.turn] + " hesitated - turn passed.");
            endTurn(st);
        }
        return true;
    }

    if (ph === "lobby") {
        if (t !== "start") return false;
        st.phase = "brief";
        pushLog(st, "Coin flip: " + st.names[st.turn] + " moves first.");
        return true;
    }
    if (ph === "brief") {
        if (t !== "begin") return false;
        st.phase = "play"; st.banner = null;
        return true;
    }
    if (ph === "result") {
        if (t === "next" && st.result.ok) {
            if (st.caseIdx + 1 < CASE_COUNT) setupCase(st, st.caseIdx + 1, st.salt);
            else st.phase = "final";
            return true;
        }
        if (t === "retry" && !st.result.ok) {
            setupCase(st, st.caseIdx, st.salt + 1); // fresh, still solvable, layout
            return true;
        }
        return false;
    }
    if (ph === "accuse") {
        const acc = st.accuse;
        if (!acc || seat !== acc.by) return false;
        if (t === "cancel" && acc.stage === "lineup") { st.accuse = null; st.phase = "play"; return true; }
        if (t === "pick" && acc.stage === "lineup") {
            const s = c.suspects.filter((x) => x.id === a.sid)[0];
            if (!s) return false;
            if (s.id === c.culpritId) { acc.stage = "quiz"; return true; }
            if (!(st.cheats.infinite && seat === 0 && !online)) st.attempts[seat]--;
            if (st.attempts[0] <= 0 && st.attempts[1] <= 0) {
                failCase(st, "Both detectives burned their accusations.", c);
                return true;
            }
            const left = st.attempts[seat];
            st.banner = { tag: "INFO", text: "Not " + s.name + ". " + left + (left === 1 ? " attempt" : " attempts") + " left for " + st.names[seat] + ".", by: seat };
            pushLog(st, st.names[seat] + " accused " + s.name + " - wrong.");
            st.accuse = null; st.phase = "play";
            endTurn(st);
            return true;
        }
        if (t === "quiz" && acc.stage === "quiz") {
            const opts = c.finalQuestion.options;
            const i = a.idx;
            if (typeof i !== "number" || i < 0 || i >= opts.length) return false;
            winCase(st, seat, opts[i] === c.finalQuestion.answer, c);
            return true;
        }
        return false;
    }
    if (ph === "play") {
        if (seat !== st.turn) return false;
        if (t === "search") {
            const h = c.hotspots.filter((x) => x.id === a.hid)[0];
            if (!h || st.found.some((f) => f.id === h.id)) return false;
            const pts = h.clue.key ? 25 : 10;
            st.found.push({ id: h.id, by: seat });
            st.scores[seat] += pts;
            st.banner = { tag: "CLUE", text: h.clue.title + " - " + h.clue.text, by: seat };
            pushLog(st, st.names[seat] + " found \"" + h.clue.title + "\" (+" + pts + ").");
            endTurn(st);
            return true;
        }
        if (t === "investigate") {
            const task = c.investigations.filter((x) => x.id === a.id)[0];
            if (!task || st.investigations.some((x) => x.id === task.id)) return false;
            if (!Number.isInteger(a.idx) || a.idx < 0 || a.idx >= task.options.length) return false;
            const selected = task.options[a.idx];
            if (selected === task.answer) {
                st.investigations.push({ id: task.id, by: seat, answer: task.answer });
                (task.eliminateSids || (task.eliminateSid ? [task.eliminateSid] : [])).forEach((sid) => {
                    if (!st.eliminated.includes(sid)) st.eliminated.push(sid);
                });
                st.scores[seat] += 25;
                st.banner = { tag: "5W1H", text: task.label + " solved. " + task.reveal, by: seat };
                pushLog(st, st.names[seat] + " solved " + task.label + " (+25).");
            } else {
                st.scores[seat] = Math.max(0, st.scores[seat] - 5);
                st.banner = { tag: "DEDUCTION", text: "That deduction does not fit the evidence. Try this category again on a later turn. (-5)", by: seat };
                pushLog(st, st.names[seat] + " made an incorrect " + task.label + " deduction (-5).");
            }
            endTurn(st);
            return true;
        }
        if (t === "tool") {
            const tools = st.tools[seat];
            const kind = a.kind;
            if (kind === "cctv") {
                if (tools.cctv <= 0) return false;
                tools.cctv--;
                st.intel.push({ kind: "cctv", by: seat, text: c.cctv });
                st.banner = { tag: "INTEL", text: c.cctv, by: seat };
            } else if (kind === "alibi") {
                const s = c.suspects.filter((x) => x.id === a.sid)[0];
                if (tools.alibi <= 0 || !s) return false;
                if (st.intel.some((i) => i.kind === "alibi" && i.sid === a.sid)) return false;
                const v = c.verdicts.filter((x) => x.sid === a.sid)[0];
                tools.alibi--;
                st.intel.push({ kind: "alibi", by: seat, sid: a.sid, broken: v.broken, text: v.text });
                st.banner = { tag: "INTEL", text: v.text, by: seat };
            } else if (kind === "lab") {
                const f = st.found.filter((x) => x.id === a.hid)[0];
                if (tools.lab <= 0 || !f) return false;
                if (st.intel.some((i) => i.kind === "lab" && i.hid === a.hid)) return false;
                const h = c.hotspots.filter((x) => x.id === a.hid)[0];
                const cul = c.suspects.filter((x) => x.id === c.culpritId)[0];
                const hit = h.clue.key;
                const text = hit
                    ? "Lab on \"" + h.clue.title + "\": " + cul.mark + " confirmed. Match: " + cul.name + "."
                    : "Lab on \"" + h.clue.title + "\": no usable suspect match. Rule it out.";
                tools.lab--;
                st.intel.push({ kind: "lab", by: seat, hid: a.hid, hit: hit, text: text });
                st.banner = { tag: "INTEL", text: text, by: seat };
            } else return false;
            st.scores[seat] += 5;
            pushLog(st, st.names[seat] + " used " + kind.toUpperCase() + " (+5).");
            endTurn(st);
            return true;
        }
        if (t === "pass") {
            pushLog(st, st.names[seat] + " passes.");
            endTurn(st);
            return true;
        }
        if (t === "accuse-open") {
            if (st.found.length < MIN_CLUES || st.investigations.length < FIVE_W1H.length || st.attempts[seat] <= 0) return false;
            st.phase = "accuse";
            st.accuse = { by: seat, stage: "lineup" };
            return true;
        }
        return false;
    }
    return false;
}

/* ---------- bot policy (seat 1 in offline mode) ---------- */
function botChoose(st, c, rnd) {
    const ph = st.phase;
    if (ph === "accuse" && st.accuse && st.accuse.by === 1) {
        if (st.accuse.stage === "lineup") {
            if (culpritRefs(st, c) >= 2 && rnd() < 0.9) return { t: "pick", sid: c.culpritId };
            return { t: "pick", sid: c.suspects[Math.floor(rnd() * 4)].id };
        }
        const opts = c.finalQuestion.options;
        if (rnd() < 0.85) return { t: "quiz", idx: opts.indexOf(c.finalQuestion.answer) };
        const wrong = opts.map((o, i) => i).filter((i) => opts[i] !== c.finalQuestion.answer);
        return { t: "quiz", idx: wrong[Math.floor(rnd() * wrong.length)] };
    }
    if (ph !== "play" || st.turn !== 1) return null;
    const refs = culpritRefs(st, c);
    const unresolved = c.investigations.filter((task) => !st.investigations.some((done) => done.id === task.id));
    const readyToAccuse = st.found.length >= MIN_CLUES && unresolved.length === 0 && st.attempts[1] > 0;
    if (readyToAccuse) {
        const p = refs >= 2 ? 0.78 : refs === 1 ? 0.4 : 0.16;
        if (rnd() < p) return { t: "accuse-open" };
    }
    // The bot alternates scene searches and 5W1H deductions; it becomes more focused on deductions after four clues.
    if (unresolved.length && (st.found.length >= MIN_CLUES || rnd() < 0.68)) {
        const task = unresolved[Math.floor(rnd() * unresolved.length)];
        const correctIdx = task.options.indexOf(task.answer);
        let idx = correctIdx;
        if (rnd() > 0.82) {
            const wrong = task.options.map((o, i) => i).filter((i) => i !== correctIdx);
            idx = wrong[Math.floor(rnd() * wrong.length)];
        }
        return { t: "investigate", id: task.id, idx: idx };
    }
    const unfound = c.hotspots.filter((h) => !st.found.some((f) => f.id === h.id));
    const roll = rnd();
    if (roll < 0.1 && st.tools[1].cctv > 0) return { t: "tool", kind: "cctv" };
    if (roll < 0.2 && st.tools[1].alibi > 0) {
        const un = c.suspects.filter((sus) => !st.intel.some((i) => i.kind === "alibi" && i.sid === sus.id));
        if (un.length) return { t: "tool", kind: "alibi", sid: un[Math.floor(rnd() * un.length)].id };
    }
    if (roll < 0.28 && st.tools[1].lab > 0) {
        const cand = st.found.filter((f) => !st.intel.some((i) => i.kind === "lab" && i.hid === f.id));
        if (cand.length) return { t: "tool", kind: "lab", hid: cand[Math.floor(rnd() * cand.length)].id };
    }
    if (unfound.length) {
        const keys = unfound.filter((h) => h.clue.key);
        const pool = keys.length && rnd() < 0.55 ? keys : unfound;
        return { t: "search", hid: pool[Math.floor(rnd() * pool.length)].id };
    }
    if (unresolved.length) {
        const task = unresolved[Math.floor(rnd() * unresolved.length)];
        return { t: "investigate", id: task.id, idx: task.options.indexOf(task.answer) };
    }
    return { t: "pass" };
}

/* ---------- living-room scene (one SVG, shapes only) ---------- */
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

/* ---------- icons + portraits ---------- */
const KEY_ICON = '<svg viewBox="0 0 24 24" width="13" height="13" aria-hidden="true"><circle cx="7.5" cy="12" r="4" fill="none" stroke="#b45309" stroke-width="2.6"/><path d="M11.5 12h9M17 12v-3.4M20.5 12v-2.6" fill="none" stroke="#b45309" stroke-width="2.6" stroke-linecap="round"/></svg>';
const ICO = {
    cctv: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2" y="6" width="13" height="10" rx="2"/><path d="M15 10l6-3v10l-6-3"/></svg>',
    lab: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 3h6M10 3v5l-5 9a3 3 0 0 0 2.6 4.5h8.8A3 3 0 0 0 19 17l-5-9V3"/></svg>',
    alibi: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 5h16v11H9l-5 4z"/></svg>',
    pass: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 5l7 7-7 7M13 5l7 7-7 7"/></svg>',
    fivewh: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 1 1 4.3 1.8c-1 .9-1.8 1.2-1.8 2.7M12 17h.01"/></svg>',
    accuse: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v6M12 16.5v.5"/></svg>',
};

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

/* ---------- clue word highlighting (names / traits / trace marks) ---------- */
function hl(text, c) {
    if (!c._hl) {
        const map = {};
        const toks = [];
        c.suspects.forEach((s) => {
            susTokens(s).forEach((t) => { map[t] = s.hue; toks.push(t); });
        });
        toks.sort((a, b) => b.length - a.length);
        c._hl = { re: new RegExp("\\b(" + toks.map(rxTok).join("|") + ")\\b", "g"), map: map };
    }
    return esc(text).replace(c._hl.re, (m) => {
        const hue = c._hl.map[m] || "#b45309";
        return '<mark class="ldx-m" style="background:' + hue + '1f;color:' + hue + '">' + m + "</mark>";
    });
}

/* =============================================================
mount - template entry point
============================================================= */
export function mount(root, context = {}) {
    const { mode = "ai", room = null, playerName = "Player", onExit = () => { } } = context;
    const online = mode === "room" && Boolean(room);
    const conn = online && !room.isHost ? 1 : 0; // connection index (template playerIndex)
    let roomData = room && room.room ? room.room : null;
    let state = null;
    let destroyed = false;
    let timerId = null;
    let botTimer = null;
    const unsubs = [];

    const ui = {
        caseKey: "", focusHid: null, guide: false, cheats: false, picker: null,
        openSus: new Set(), dismissRev: -1, savedSeed: 0, helloSeed: 0,
    };
    let best = 0;
    try { best = Number(localStorage.getItem(META.bestKey)) || 0; } catch (e) { best = 0; }

    /* ---------- shell (minimalist light UI) ---------- */
    root.innerHTML = `
<style>
.ldx{--bg:#f4f6f9;--panel:#fff;--ink:#101828;--mut:#667085;--line:#e4e7ec;--acc:#b45309;--ok:#067647;--bad:#b42318;color:var(--ink);font:14px/1.45 system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;display:flex;flex-direction:column;gap:10px;width:100%;max-width:1060px;margin:0 auto;padding:10px}
.ldx *{box-sizing:border-box}
.ldx button{font:inherit;color:inherit}
.ldx-top{display:flex;align-items:center;gap:14px;flex-wrap:wrap}
.ldx-brand h2{margin:0;font-size:17px;letter-spacing:.2px}
.ldx-sub{font-size:10.5px;color:var(--mut);text-transform:uppercase;letter-spacing:.7px}
.ldx-chips{display:flex;gap:12px;flex-wrap:wrap}
.ldx-chip{font-size:11px;text-transform:uppercase;letter-spacing:.6px;color:var(--mut)}
.ldx-chip b{color:var(--ink);font-size:12.5px;margin-left:3px}
.ldx-status{display:inline-flex;align-items:center;gap:6px;font-size:12px;color:var(--mut);margin-left:auto}
.ldx .game-status-dot{width:8px;height:8px;border-radius:50%;background:var(--ok);display:inline-block;animation:ldxBlink 2s infinite}
@keyframes ldxBlink{0%,100%{opacity:1}50%{opacity:.35}}
.ldx-topbtns{display:flex;gap:6px}
.ldx-btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:7px 12px;font-size:12.5px;font-weight:600;cursor:pointer;transition:background .15s,border-color .15s;touch-action:manipulation}
.ldx-btn:hover:not(:disabled){background:#f9fafb;border-color:#d0d5dd}
.ldx-btn:disabled{opacity:.45;cursor:default}
.ldx-btn.pri{background:var(--ink);border-color:var(--ink);color:#fff}
.ldx-btn.pri:hover:not(:disabled){background:#1d2939}
.ldx-btn.acc{background:var(--acc);border-color:var(--acc);color:#fff}
.ldx-btn.acc:hover:not(:disabled){background:#92400e}
.ldx-btn.icon{width:32px;padding:7px 0}
.ldx-btn kbd{font-size:10px;font-weight:600;border:1px solid var(--line);border-radius:4px;padding:1px 4px;color:var(--mut);background:#f9fafb}
.ldx-btn.acc kbd,.ldx-btn.pri kbd{background:rgba(255,255,255,.15);border-color:rgba(255,255,255,.3);color:#fff}
.ldx-timebar{height:3px;background:var(--line);border-radius:2px;overflow:hidden}
.ldx-timebar i{display:block;height:100%;background:var(--acc);width:100%;transition:width .5s linear}
.ldx-board{position:relative;background:transparent;border:0;padding:0}
.ldx-grid{display:grid;grid-template-columns:minmax(0,1fr) 300px;gap:12px;align-items:start}
.ldx-left{display:flex;flex-direction:column;gap:8px;min-width:0}
.ldx-banner{display:flex;align-items:flex-start;gap:8px;background:#fffbeb;border:1px solid #fde68a;border-radius:10px;padding:8px 10px;font-size:12.5px;line-height:1.45}
.ldx-btag{flex:0 0 auto;font-size:10px;font-weight:700;letter-spacing:.6px;color:var(--acc);border:1px solid #fcd34d;border-radius:6px;padding:2px 6px;background:#fff}
.ldx-btxt{flex:1;min-width:0}
.ldx-bx{flex:0 0 auto;border:0;background:none;color:var(--mut);cursor:pointer;font-weight:700;padding:0 2px}
.ldx-by{flex:0 0 auto;font-style:normal;font-size:9.5px;font-weight:700;color:#fff;border-radius:5px;padding:2px 5px;line-height:1.2}
.ldx-scenebox{border-radius:14px;overflow:hidden;border:1px solid var(--line);background:#1c2542;box-shadow:0 1px 2px rgba(16,24,40,.06)}
.ldx-scene{display:block;width:100%;height:auto}
.ldx-hoverline{font-size:11.5px;color:var(--mut);min-height:16px;letter-spacing:.3px}
.ldx-actions{display:flex;gap:6px;flex-wrap:wrap;align-items:center}
.ldx-act b{font-size:11px;color:var(--acc)}
.ldx-act.acc b{color:#fff}
.ldx-turnchip{margin-left:auto;font-size:11px;color:var(--mut)}
.ldx-side{display:flex;flex-direction:column;gap:7px;min-width:0}
.ldx-players{display:grid;grid-template-columns:1fr 1fr;gap:7px}
.ldx-pc{border:1px solid var(--line);border-radius:12px;padding:8px 9px;background:var(--panel)}
.ldx-pc.on{border-color:var(--pc);box-shadow:0 0 0 1px var(--pc)}
.ldx-pc-top{display:flex;align-items:center;gap:5px;font-size:12px}
.ldx-pc-top b{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ldx-dot{width:7px;height:7px;border-radius:50%;background:var(--pc);flex:0 0 auto}
.ldx-you{font-size:9px;font-weight:700;color:var(--pc);border:1px solid var(--pc);border-radius:4px;padding:0 3px;flex:0 0 auto}
.ldx-seat{margin-left:auto;font-size:9.5px;color:var(--mut);flex:0 0 auto}
.ldx-pc-score{font-size:20px;font-weight:700;margin:2px 0}
.ldx-pc-meta{display:flex;flex-direction:column;gap:2px;font-size:10px;color:var(--mut)}
.ldx-att{display:inline-block;width:7px;height:7px;border-radius:2px;background:var(--pc);margin-right:2px}
.ldx-att.off{background:var(--line)}
.ldx-turn{font-size:10.5px;font-weight:700;color:var(--pc);margin-top:3px}
.ldx-sec{display:flex;justify-content:space-between;align-items:center;font-size:10.5px;font-weight:700;letter-spacing:.8px;text-transform:uppercase;color:var(--mut);margin-top:3px}
.ldx-ev,.ldx-intel{display:flex;flex-direction:column;gap:5px;overflow-y:auto;max-height:170px;padding-right:2px}
.ldx-intel{max-height:120px}
.ldx-empty{font-size:11px;color:var(--mut);padding:4px 2px}
.ldx-evi{display:flex;gap:7px;align-items:flex-start;background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:6px 8px}
.ldx-evi.key{border-color:#fcd34d;background:#fffbeb}
.ldx-evi b{display:block;font-size:12px}
.ldx-evi span{font-size:11px;color:#475467;line-height:1.4}
.ldx-evi>div{flex:1;min-width:0}
.ldx-5wh{display:grid;grid-template-columns:1fr 1fr;gap:5px}
.ldx-witem{display:flex;align-items:center;gap:6px;min-width:0;border:1px solid var(--line);border-radius:8px;padding:5px 6px;background:var(--panel);font-size:10px;color:var(--mut)}
.ldx-witem b{font-size:9px;letter-spacing:.45px;color:var(--ink);min-width:38px}
.ldx-witem span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ldx-witem.done{border-color:#a6f4c5;background:#ecfdf3;color:var(--ok)}
.ldx-witem.done b{color:var(--ok)}
.ldx-achip.cleared{color:var(--ok);border-color:#a6f4c5;background:#ecfdf3}
.ldx-itag{flex:0 0 auto;font-size:9px;font-weight:700;letter-spacing:.5px;color:var(--mut);border:1px solid var(--line);border-radius:5px;padding:2px 4px;background:#f9fafb}
.ldx-m{padding:0 3px;border-radius:4px;font-weight:600}
.ldx-sus{display:flex;flex-direction:column;gap:6px}
.ldx-sc{position:relative;border:1px solid var(--line);border-radius:12px;background:var(--panel);padding:7px 9px;cursor:pointer}
.ldx-sc:hover{border-color:#d0d5dd}
.ldx-sc.cul{border-color:var(--acc);box-shadow:0 0 0 1px var(--acc)}
.ldx-sc-head{display:flex;align-items:center;gap:8px}
.ldx-sc-id{flex:1;min-width:0}
.ldx-sc-id b{display:block;font-size:12.5px}
.ldx-trait{font-size:10.5px;color:var(--sc);font-weight:600}
.ldx-achip{font-size:9px;font-weight:700;border-radius:5px;padding:2px 5px;border:1px solid var(--line);color:var(--mut);flex:0 0 auto}
.ldx-achip.ok{color:var(--ok);border-color:#a6f4c5;background:#ecfdf3}
.ldx-achip.bad{color:var(--bad);border-color:#fecdca;background:#fef3f2}
.ldx-chev{color:var(--mut);font-size:11px;flex:0 0 auto}
.ldx-sc-body{margin-top:6px;border-top:1px dashed var(--line);padding-top:6px;display:flex;flex-direction:column;gap:3px}
.ldx-sc-body p{margin:0;font-size:11px;color:#475467;line-height:1.4}
.ldx-sc-body em{font-style:normal;font-weight:700;color:var(--mut);font-size:9.5px;text-transform:uppercase;letter-spacing:.5px;margin-right:5px}
.ldx-verdict.ok{color:var(--ok)}
.ldx-verdict.bad{color:var(--bad)}
.ldx-cultag{position:absolute;top:-7px;right:8px;font-size:9px;font-weight:700;background:var(--acc);color:#fff;border-radius:5px;padding:1px 5px;letter-spacing:.5px}
.ldx-log{display:flex;flex-direction:column;gap:2px;font-size:10.5px;color:var(--mut);max-height:88px;overflow-y:auto}
.ldx-foot{display:flex;align-items:center;gap:10px}
.ldx-best{font-size:11px;color:var(--mut)}
.ldx-wait{padding:40px;text-align:center;color:var(--mut)}
.ldx-ov{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(16,24,40,.45);backdrop-filter:blur(2px);z-index:30;padding:14px}
.ldx-card{background:var(--panel);border:1px solid var(--line);border-radius:16px;padding:20px 22px;width:min(560px,100%);max-height:100%;overflow-y:auto;box-shadow:0 20px 50px rgba(16,24,40,.25);text-align:center}
.ldx-card h3{margin:0 0 6px;font-size:19px}
.ldx-card h3.win{color:var(--ok)}
.ldx-card h3.lose{color:var(--bad)}
.ldx-card .sub{margin:0 0 12px;font-size:13px;color:#475467;line-height:1.55}
.ldx-ovline{font-size:12.5px;color:var(--acc);font-weight:600;margin:4px 0}
.ldx-row{display:flex;gap:8px;justify-content:center;flex-wrap:wrap;margin-top:12px}
.ldx-lineup{display:grid;grid-template-columns:1fr 1fr;gap:9px;margin:12px 0}
.ldx-pick{position:relative;display:flex;flex-direction:column;align-items:center;gap:3px;background:#f9fafb;border:1px solid var(--line);border-radius:12px;padding:12px 8px 10px;cursor:pointer}
.ldx-pick:hover:not(:disabled){border-color:var(--ink)}
.ldx-pick:disabled{opacity:.6;cursor:default}
.ldx-pick b{font-size:13.5px}
.ldx-pick span{font-size:10.5px;color:var(--mut)}
.ldx-num{position:absolute;top:6px;left:6px;width:18px;height:18px;border-radius:6px;background:#fff;border:1px solid var(--line);font-style:normal;font-size:10.5px;font-weight:700;display:flex;align-items:center;justify-content:center;color:var(--mut)}
.ldx-opts{display:flex;flex-direction:column;gap:7px;margin:12px 0}
.ldx-opt{display:flex;align-items:center;gap:9px;background:#f9fafb;border:1px solid var(--line);border-radius:10px;padding:9px 12px;font-weight:600;font-size:13px;cursor:pointer;text-align:left}
.ldx-opt:hover:not(:disabled){border-color:var(--ink)}
.ldx-opt:disabled{opacity:.6;cursor:default}
.ldx-opt .ldx-num{position:static;flex:0 0 auto}
.ldx-guide{text-align:left;font-size:12.5px;color:#475467;line-height:1.55}
.ldx-guide h4{margin:10px 0 3px;font-size:11px;text-transform:uppercase;letter-spacing:.7px;color:var(--ink)}
.ldx-guide p{margin:0 0 4px}
.ldx-keys{display:grid;grid-template-columns:auto 1fr;gap:3px 10px;font-size:11.5px}
.ldx-cheat{display:flex;align-items:center;justify-content:space-between;width:100%;background:#f9fafb;border:1px solid var(--line);border-radius:10px;padding:9px 12px;font-size:13px;font-weight:600;cursor:pointer;margin-bottom:6px}
.ldx-sw{width:30px;height:17px;border-radius:9px;background:var(--line);position:relative;transition:background .15s;flex:0 0 auto}
.ldx-sw::after{content:'';position:absolute;top:2px;left:2px;width:13px;height:13px;border-radius:50%;background:#fff;transition:left .15s}
.ldx-sw.on{background:var(--acc)}
.ldx-sw.on::after{left:15px}
.ldx-note{font-size:11px;color:var(--mut);margin:0 0 10px}
.ldx-hot{cursor:pointer}
.ldx-hot .ldx-box{fill:rgba(250,204,21,0);stroke:rgba(250,204,21,0);stroke-width:2.5;transition:fill .18s,stroke .18s}
.ldx-hot:hover .ldx-box{fill:rgba(250,204,21,.14);stroke:rgba(250,204,21,.85)}
.ldx-hot.pulse .ldx-box{animation:ldxPulse 2.4s ease-in-out infinite}
.ldx-hot.focus .ldx-box{fill:rgba(250,204,21,.18);stroke:#facc15;stroke-width:3}
.ldx-hot.found{cursor:default}
.ldx-hot.found .ldx-box{fill:rgba(52,211,153,.08);stroke:rgba(52,211,153,.55);animation:none}
.ldx-hot.found.mine .ldx-box{stroke:#60a5fa}
.ldx-hot.found.theirs .ldx-box{stroke:#f472b6}
.ldx-hot.keyhint .ldx-box{stroke:#fbbf24;stroke-dasharray:6 4;fill:rgba(251,191,36,.1)}
@keyframes ldxPulse{0%,100%{fill:rgba(250,204,21,0)}50%{fill:rgba(250,204,21,.14)}}
.ldx-tag circle{fill:#fff;stroke:#cbd5e1;stroke-width:1.5}
.ldx-tag text{font-size:10px;font-weight:700;fill:#334155;text-anchor:middle;dominant-baseline:central}
.ldx-hot.found.mine .ldx-tag circle{fill:#2563eb;stroke:#2563eb}
.ldx-hot.found.theirs .ldx-tag circle{fill:#db2777;stroke:#db2777}
.ldx-hot.found .ldx-tag text{opacity:0}
.ldx-tick{fill:none;stroke:#fff;stroke-width:2.2;stroke-linecap:round;stroke-linejoin:round;opacity:0}
.ldx-hot.found .ldx-tick{opacity:1}
@media (max-width:880px){.ldx-grid{grid-template-columns:1fr}.ldx-actions{position:sticky;bottom:6px;background:rgba(244,246,249,.92);backdrop-filter:blur(4px);padding:6px;border:1px solid var(--line);border-radius:12px;z-index:10}}
@media (pointer:coarse){.ldx-btn{min-height:44px}.ldx-btn kbd{display:none}.ldx-pick{min-height:96px}.ldx-opt{min-height:46px}.ldx-hot .ldx-box{stroke-width:3.5}}
@media (prefers-reduced-motion:reduce){.ldx-hot.pulse .ldx-box{animation:none}.ldx .game-status-dot{animation:none}}
</style>
<div class="game-app ldx">
  <div class="game-intro ldx-top">
    <div class="ldx-brand"><h2>Little Detective</h2><span class="ldx-sub" data-el="mode">Vs bot</span></div>
    <div class="ldx-chips">
      <span class="ldx-chip">Case <b data-hud="case">1/3</b></span>
      <span class="ldx-chip">Clues <b data-hud="clues">0/8</b></span>
      <span class="ldx-chip">5W1H <b data-hud="fivewh">0/6</b></span>
      <span class="ldx-chip">Time <b data-hud="time">2:00</b></span>
    </div>
    <span class="game-status ldx-status"><i class="game-status-dot"></i><span data-status>Ready</span></span>
    <div class="ldx-topbtns">
      <button class="ldx-btn icon" type="button" data-act="guide" title="How to play (G)" aria-label="How to play">?</button>
      <button class="ldx-btn icon" type="button" data-act="cheats" data-el="cheatbtn" title="Cheat console (X)" aria-label="Cheats">${ICO.lab}</button>
      <button class="ldx-btn" type="button" data-act="restart" title="Restart match (Shift+R)">Restart</button>
    </div>
  </div>
  <div class="ldx-timebar"><i data-el="timefill"></i></div>
  <section class="game-panel ldx-board" data-board>
    <div class="ldx-grid">
      <div class="ldx-left">
        <div class="ldx-banner" data-el="banner" hidden></div>
        <div class="ldx-scenebox"><svg class="ldx-scene" data-el="scene" viewBox="0 0 800 440" role="img" aria-label="Living room crime scene"></svg></div>
        <div class="ldx-hoverline" data-el="hover">Search the room</div>
        <div class="ldx-actions" data-el="actions"></div>
      </div>
      <aside class="ldx-side">
        <div class="ldx-players" data-el="players"></div>
        <div class="ldx-sec"><span>Evidence</span><b data-hud="clues2">0/8</b></div>
        <div class="ldx-ev" data-el="ev"></div>
        <div class="ldx-sec"><span>5W + 1H Deduction</span><b data-el="fivewh-count">0/6</b></div>
        <div class="ldx-5wh" data-el="fivewh"></div>
        <div class="ldx-sec"><span>Intel - CCTV / Lab / Alibi</span></div>
        <div class="ldx-intel" data-el="intel"></div>
        <div class="ldx-sec"><span>Suspects</span></div>
        <div class="ldx-sus" data-el="sus"></div>
        <div class="ldx-sec"><span>Log</span></div>
        <div class="ldx-log" data-el="log"></div>
      </aside>
    </div>
    <div data-el="ov"></div>
  </section>
  <div class="game-actions ldx-foot">
    <button class="game-action-button ldx-btn" type="button" data-exit data-act="exit">Exit game</button>
    <span class="ldx-best" data-el="best"></span>
  </div>
</div>`;

    /* ---------- refs ---------- */
    const $ = (s, r) => (r || root).querySelector(s);
    const sceneEl = $('[data-el="scene"]'), bannerEl = $('[data-el="banner"]'), hoverEl = $('[data-el="hover"]');
    const actionsEl = $('[data-el="actions"]'), playersEl = $('[data-el="players"]'), evEl = $('[data-el="ev"]');
    const intelEl = $('[data-el="intel"]'), fivewhEl = $('[data-el="fivewh"]'), fivewhCountEl = $('[data-el="fivewh-count"]');
    const susEl = $('[data-el="sus"]'), logEl = $('[data-el="log"]'), ovEl = $('[data-el="ov"]');
    const statusEl = $("[data-status]"), modeEl = $('[data-el="mode"]'), bestEl = $('[data-el="best"]');
    const timeFill = $('[data-el="timefill"]'), cheatBtn = $('[data-el="cheatbtn"]');
    const hud = { case: $('[data-hud="case"]'), clues: $('[data-hud="clues"]'), clues2: $('[data-hud="clues2"]'), fivewh: $('[data-hud="fivewh"]'), time: $('[data-hud="time"]') };

    const mySeat = () => (state ? state.seatOf[conn] : 0);
    const display = (st, seat) => (seat === mySeat() ? String(playerName || "You").slice(0, 18) : st.names[seat]);

    /* ---------- scene hotspots ---------- */
    function hotsMarkup(c) {
        return c.hotspots.map((h, i) => {
            return '<g class="ldx-hot" data-act="hot" data-hid="' + h.id + '">' +
                '<rect class="ldx-hit" x="' + (h.x - 10) + '" y="' + (h.y - 10) + '" width="' + (h.w + 20) + '" height="' + (h.h + 20) + '" rx="12" fill="transparent"/>' +
                '<rect class="ldx-box" x="' + h.x + '" y="' + h.y + '" width="' + h.w + '" height="' + h.h + '" rx="8"/>' +
                '<g class="ldx-tag" transform="translate(' + (h.x + 13) + "," + (h.y + 13) + ')"><circle r="9.5"/><text y="0.5">' + (i + 1) + '</text><path class="ldx-tick" d="M-3.6 0.2 l2.6 3 l4.6 -6"/></g>' +
                "<title>" + esc(h.label) + "</title></g>";
        }).join("");
    }
    function updateHots(c, st, my, myTurn, play) {
        sceneEl.querySelectorAll(".ldx-hot").forEach((g) => {
            const hid = g.getAttribute("data-hid");
            const h = c.hotspots.filter((x) => x.id === hid)[0];
            const f = st.found.filter((x) => x.id === hid)[0];
            g.classList.toggle("found", !!f);
            g.classList.toggle("mine", !!f && f.by === my);
            g.classList.toggle("theirs", !!f && f.by !== my);
            g.classList.toggle("pulse", play && myTurn && !f);
            g.classList.toggle("keyhint", !online && st.cheats.keys && !!h && h.clue.key && !f);
            g.classList.toggle("focus", play && myTurn && !f && ui.focusHid === hid);
        });
    }

    /* ---------- panel builders ---------- */
    function attDots(n) {
        let s = "";
        for (let i = 0; i < MAX_ATT; i++) s += '<i class="ldx-att' + (i < n ? "" : " off") + '"></i>';
        return s;
    }
    function playersHtml(st, my) {
        return [0, 1].map((seat) => {
            const isMe = seat === my;
            const active = (st.phase === "play" && st.turn === seat) || (st.phase === "accuse" && st.accuse && st.accuse.by === seat);
            const tl = st.tools[seat];
            return '<div class="ldx-pc' + (active ? " on" : "") + '" style="--pc:' + PLAYER_HUES[seat] + '">' +
                '<div class="ldx-pc-top"><i class="ldx-dot"></i><b>' + esc(display(st, seat)) + "</b>" + (isMe ? '<span class="ldx-you">YOU</span>' : "") + '<span class="ldx-seat">P' + (seat + 1) + "</span></div>" +
                '<div class="ldx-pc-score">' + st.scores[seat] + "</div>" +
                '<div class="ldx-pc-meta"><span>Accuses ' + attDots(st.attempts[seat]) + "</span><span>CCTV " + tl.cctv + " - Lab " + tl.lab + " - Alibi " + tl.alibi + "</span></div>" +
                (active ? '<div class="ldx-turn">' + (isMe ? "Your move" : online ? "Thinking..." : "Bot thinking...") + "</div>" : "") +
                "</div>";
        }).join("");
    }
    function actBtn(act, kind, label, icon, count, kbd, disabled, cls) {
        return '<button class="ldx-btn ldx-act' + (cls ? " " + cls : "") + '" type="button" data-act="' + act + '"' + (kind ? ' data-kind="' + kind + '"' : "") + (disabled ? " disabled" : "") + ">" +
            icon + "<span>" + label + "</span>" + (count !== null ? "<b>" + count + "</b>" : "") + "<kbd>" + kbd + "</kbd></button>";
    }
    function actionsHtml(st, my, myTurn, play) {
        const tl = st.tools[my];
        const solved = st.investigations.length;
        const canAccuse = myTurn && st.found.length >= MIN_CLUES && solved === FIVE_W1H.length && st.attempts[my] > 0;
        return actBtn("fivewh", "", "5W1H", ICO.fivewh, solved + "/6", "W", !myTurn || solved >= FIVE_W1H.length, "") +
            actBtn("tool", "cctv", "CCTV", ICO.cctv, tl.cctv, "C", !myTurn || tl.cctv <= 0, "") +
            actBtn("tool", "lab", "Lab", ICO.lab, tl.lab, "F", !myTurn || tl.lab <= 0 || st.found.length === 0, "") +
            actBtn("tool", "alibi", "Alibi", ICO.alibi, tl.alibi, "L", !myTurn || tl.alibi <= 0, "") +
            actBtn("pass", "", "Pass", ICO.pass, null, "P", !myTurn, "") +
            actBtn("accuse", "", "Accuse", ICO.accuse, null, "A", !canAccuse, "acc") +
            '<span class="ldx-turnchip">' + (play ? "Turn " + st.turnLeft + "s" : "") + "</span>";
    }
    function byChip(st, by) {
        return '<i class="ldx-by" style="background:' + PLAYER_HUES[by] + '" title="' + esc(st.names[by]) + '">P' + (by + 1) + "</i>";
    }
    function evidenceHtml(st, c) {
        if (!st.found.length) return '<div class="ldx-empty">No clues yet. Search the glowing spots.</div>';
        return st.found.map((f) => {
            const h = c.hotspots.filter((x) => x.id === f.id)[0];
            if (!h) return "";
            return '<div class="ldx-evi' + (h.clue.key ? " key" : "") + '">' + (h.clue.key ? KEY_ICON : "") +
                "<div><b>" + esc(h.clue.title) + "</b><span>" + hl(h.clue.text, c) + "</span></div>" + byChip(st, f.by) + "</div>";
        }).join("");
    }
    function intelHtml(st, c) {
        if (!st.intel.length) return '<div class="ldx-empty">No forensic intel yet.</div>';
        return st.intel.map((i) => {
            return '<div class="ldx-evi"><span class="ldx-itag">' + i.kind.toUpperCase() + "</span>" +
                "<div><span>" + hl(i.text, c) + "</span></div>" + byChip(st, i.by) + "</div>";
        }).join("");
    }
    function fiveW1HHtml(st, c) {
        return c.investigations.map((task) => {
            const solved = st.investigations.filter((x) => x.id === task.id)[0];
            const status = solved ? "Solved" : "Pending";
            const owner = solved ? "P" + (solved.by + 1) : "Awaiting deduction";
            return '<div class="ldx-witem' + (solved ? " done" : "") + '" title="' + esc(task.title + " - " + status + " - " + owner) + '"><b>' + task.label + '</b><span>' + (solved ? "Solved · " + owner : "Pending") + '</span></div>';
        }).join("");
    }
    function suspectsHtml(st, c) {
        return c.suspects.map((s, i) => {
            const open = ui.openSus.has(s.id);
            const intel = st.intel.filter((x) => x.kind === "alibi" && x.sid === s.id)[0];
            const clearedByScene = c.hotspots.some((h) => h.clue.title === "Cleared: " + s.name && st.found.some((f) => f.id === h.id));
            const cleared = st.eliminated.includes(s.id) || clearedByScene;
            const chip = cleared ? '<span class="ldx-achip cleared">Cleared</span>' : intel ? (intel.broken ? '<span class="ldx-achip bad">Broken</span>' : '<span class="ldx-achip ok">Verified</span>') : '<span class="ldx-achip">Unverified</span>';
            const reveal = !online && st.cheats.reveal && s.id === c.culpritId;
            return '<div class="ldx-sc' + (open ? " open" : "") + (reveal ? " cul" : "") + '" data-act="dossier" data-sid="' + s.id + '" style="--sc:' + s.hue + '">' +
                '<div class="ldx-sc-head">' + portraitSvg(s.look, i, 34) +
                '<div class="ldx-sc-id"><b>' + esc(s.name) + '</b><span class="ldx-trait">' + esc(s.trait) + "</span></div>" +
                chip + '<span class="ldx-chev">' + (open ? "-" : "+") + "</span></div>" +
                (open ? '<div class="ldx-sc-body">' +
                    "<p><em>Role</em>" + esc(s.role) + "</p>" +
                    "<p><em>Habit</em>" + esc(s.habit) + "</p>" +
                    "<p><em>Carries</em>" + esc(s.item) + "</p>" +
                    "<p><em>Status</em>" + (cleared ? "Cleared from the suspect list" : "Still under investigation") + "</p>" +
                    '<p><em>Alibi</em>"' + esc(s.claim) + '"</p>' +
                    (intel ? '<p class="ldx-verdict' + (intel.broken ? " bad" : " ok") + '">' + hl(intel.text, c) + "</p>" : "") +
                    "</div>" : "") +
                (reveal ? '<span class="ldx-cultag">CULPRIT</span>' : "") +
                "</div>";
        }).join("");
    }

    /* ---------- overlays ---------- */
    const ovWrap = (inner) => '<div class="ldx-ov"><div class="ldx-card">' + inner + "</div></div>";
    function guideCard() {
        return ovWrap('<h3>How to play</h3><div class="ldx-guide">' +
            "<h4>Goal</h4><p>Close 3 cases before your rival. Searching earns points; the detective who names the culprit takes the big case bonus.</p>" +
            "<h4>Your turn</h4><p>Search one glowing spot, solve a 5W1H deduction, or spend a tool: CCTV replay, Lab analysis of a collected clue, or an Alibi check. Every action ends your turn (30s limit, 180s per case).</p>" +
            "<h4>5W + 1H</h4><p>Complete What, Who, When, Where, Why and How. Correct answers earn 25 points. The WHO deduction clears a suspect with a verified porch-camera alibi. A wrong answer costs 5 points and passes the turn.</p>" +
            "<h4>Accusing</h4><p>Accusation unlocks after you collect at least 4 scene clues and complete all six 5W1H deductions. Each detective gets 2 attempts. The right suspect unlocks one bonus question, then the case closes.</p>" +
            "<h4>Evidence</h4><p>Names, traits and trace marks are highlighted in the suspect's color. Key evidence carries a key icon and always points at the culprit - every case is generated to be solvable.</p>" +
            "<h4>Desktop controls</h4><div class=\"ldx-keys\"><span>1-8</span><span>search a numbered spot</span><span>W</span><span>open 5W1H deductions</span><span>1-6 / 1-3</span><span>choose category / answer</span><span>A / C / F / L / P</span><span>accuse / CCTV / lab / alibi / pass</span><span>G, X, Esc</span><span>guide, cheats, close</span><span>Shift+R</span><span>restart match</span></div>" +
            "<h4>Mouse & touch</h4><p>Hover a spot to read its label, click to search. On touch devices use the same spots plus the action bar under the scene.</p>" +
            "<h4>Fair play</h4><p>Cheats exist offline only and disable best-score saving.</p>" +
            '</div><div class="ldx-row"><button class="ldx-btn pri" type="button" data-act="guide-close">Close</button></div>');
    }
    function cheatsCard(st) {
        const rows = [["reveal", "Reveal the culprit"], ["keys", "Mark key evidence spots"], ["freeze", "Freeze both timers"], ["infinite", "Infinite accusation attempts"]];
        return ovWrap('<h3>Cheat console</h3><p class="ldx-note">Offline only. Using cheats disables best-score saving.</p>' +
            rows.map((r) => '<button class="ldx-cheat" type="button" data-act="cheat-toggle" data-key="' + r[0] + '"><span>' + r[1] + '</span><i class="ldx-sw' + (st.cheats[r[0]] ? " on" : "") + '"></i></button>').join("") +
            '<div class="ldx-row"><button class="ldx-btn" type="button" data-act="cheat-collect"' + (st.phase !== "play" ? " disabled" : "") + '>Collect all clues</button>' +
            '<button class="ldx-btn" type="button" data-act="cheat-solve"' + (st.phase === "play" || (st.phase === "accuse" && st.accuse && st.accuse.by === 0) ? "" : " disabled") + '>Solve this case</button>' +
            '<button class="ldx-btn pri" type="button" data-act="cheats-close">Close</button></div>');
    }
    function pickerItems(st, c) {
        if (ui.picker === "lab") {
            return st.found.filter((f) => !st.intel.some((i) => i.kind === "lab" && i.hid === f.id)).map((f) => {
                const h = c.hotspots.filter((x) => x.id === f.id)[0];
                return h ? { hid: h.id, title: h.clue.title, key: h.clue.key } : null;
            }).filter(Boolean);
        }
        if (ui.picker === "alibi") {
            return c.suspects.filter((s) => !st.intel.some((i) => i.kind === "alibi" && i.sid === s.id)).map((s) => ({ sid: s.id, name: s.name, claim: s.claim, look: s.look }));
        }
        return [];
    }
    function pickerCard(st, c) {
        const activeTurn = st.phase === "play" && st.turn === mySeat();
        if (ui.picker === "fivewh") {
            const rows = c.investigations.map((task, i) => {
                const done = st.investigations.some((x) => x.id === task.id);
                return '<button class="ldx-opt" type="button" data-act="select-question" data-qid="' + task.id + '"' + (done || !activeTurn ? " disabled" : "") + '><i class="ldx-num">' + (i + 1) + '</i><span><b>' + task.label + ' - ' + esc(task.title) + '</b><br><small>' + (done ? "Completed" : esc(task.prompt)) + '</small></span></button>';
            }).join("");
            return ovWrap('<h3>5W + 1H Investigation</h3><p class="sub">' + (activeTurn ? "Choose one unresolved deduction. Correct answers earn 25 points; wrong answers cost 5 points and pass the turn." : "Waiting for your turn. The other detective is investigating.") + '</p><div class="ldx-opts">' + rows + '</div><div class="ldx-row"><button class="ldx-btn" type="button" data-act="picker-close">Back</button></div>');
        }
        if (ui.picker && ui.picker.indexOf("question:") === 0) {
            const qid = ui.picker.slice("question:".length);
            const task = c.investigations.filter((x) => x.id === qid)[0];
            if (!task || st.investigations.some((x) => x.id === qid)) return ovWrap('<h3>Deduction completed</h3><p class="sub">This 5W1H category has already been solved.</p><div class="ldx-row"><button class="ldx-btn pri" type="button" data-act="picker-close">Close</button></div>');
            return ovWrap('<h3>' + task.label + ' - ' + esc(task.title) + '</h3><p class="sub">' + esc(task.prompt) + '</p>' + (activeTurn ? '' : '<p class="ldx-note">Waiting for your turn.</p>') + '<div class="ldx-opts">' + task.options.map((option, i) => '<button class="ldx-opt" type="button" data-act="answer-question" data-qid="' + task.id + '" data-idx="' + i + '"' + (activeTurn ? '' : ' disabled') + '><i class="ldx-num">' + (i + 1) + '</i>' + esc(option) + '</button>').join("") + '</div><div class="ldx-row"><button class="ldx-btn" type="button" data-act="picker-back">All categories</button></div>');
        }
        const items = pickerItems(st, c);
        const lab = ui.picker === "lab";
        const list = items.length
            ? items.map((it, i) => '<button class="ldx-opt" type="button" data-act="' + (lab ? "pick-lab" : "pick-alibi") + '" data-hid="' + (it.hid || "") + '" data-sid="' + (it.sid || "") + '"><i class="ldx-num">' + (i + 1) + "</i>" + (lab ? (it.key ? KEY_ICON + " " : "") + esc(it.title) : esc(it.name) + ' - "' + esc(it.claim) + '"') + "</button>").join("")
            : '<div class="ldx-empty">Nothing left to analyze.</div>';
        return ovWrap('<h3>' + (lab ? "Lab analysis" : "Alibi check") + '</h3><p class="sub">' + (lab ? "Pick a collected clue to analyze. Key samples name the culprit." : "Pick a suspect to verify against the camera log.") + '</p><div class="ldx-opts">' + list + '</div><div class="ldx-row"><button class="ldx-btn" type="button" data-act="picker-close">Back</button></div>');
    }
    function lineupHtml(c, disabled) {
        return '<div class="ldx-lineup">' + c.suspects.map((s, i) =>
            '<button class="ldx-pick" type="button" data-act="suspect" data-sid="' + s.id + '"' + (disabled ? " disabled" : "") + '><i class="ldx-num">' + (i + 1) + "</i>" + portraitSvg(s.look, i, 52) + "<b>" + esc(s.name) + "</b><span>" + esc(s.trait) + "</span></button>"
        ).join("") + "</div>";
    }
    function overlayHtml(st, c, my) {
        if (ui.guide) return guideCard();
        if (ui.cheats && !online) return cheatsCard(st);
        if (ui.picker && st.phase === "play") return pickerCard(st, c);
        const cul = c.suspects.filter((s) => s.id === c.culpritId)[0];
        if (st.phase === "lobby") {
            return ovWrap('<h3>Little Detective</h3>' +
                '<p class="sub">' + (online ? "Online duel. Seats were drawn at random - you are Detective " + (my + 1) + "." : "Offline duel against the bot.") + "<br>Coin flip: " + esc(display(st, st.first)) + " investigates first.</p>" +
                (best > 0 ? '<p class="ldx-ovline">Best score: ' + best + "</p>" : "") +
                '<div class="ldx-row"><button class="ldx-btn pri" type="button" data-act="start">Start match</button><button class="ldx-btn" type="button" data-act="guide">How to play</button></div>');
        }
        if (st.phase === "brief") {
            return ovWrap('<h3>Case ' + (st.caseIdx + 1) + ": " + esc(c.title) + '</h3><p class="sub">' + esc(c.brief) + "</p>" +
                '<p class="ldx-ovline">8 search spots - 4 suspects - 6 deductions - ' + CASE_TIME + "s on the clock</p>" +
                '<div class="ldx-row"><button class="ldx-btn pri" type="button" data-act="begin">Start investigating</button></div>');
        }
        if (st.phase === "accuse" && st.accuse) {
            const acc = st.accuse;
            const mine = acc.by === my;
            if (acc.stage === "quiz") {
                const fq = c.finalQuestion;
                return ovWrap('<h3>One last question</h3><p class="sub">' + esc(fq.q) + "</p>" +
                    '<div class="ldx-opts">' + fq.options.map((o, i) => '<button class="ldx-opt" type="button" data-act="quiz" data-idx="' + i + '"' + (mine ? "" : " disabled") + '><i class="ldx-num">' + (i + 1) + "</i>" + esc(o) + "</button>").join("") + "</div>" +
                    (mine ? "" : '<p class="ldx-note">' + esc(display(st, acc.by)) + " is answering...</p>"));
            }
            return ovWrap('<h3>' + (mine ? "Name the culprit" : esc(display(st, acc.by)) + " is accusing") + '</h3>' +
                '<p class="sub">' + (mine ? "Study the evidence, then pick one suspect. Keys 1-4 also work." : "Waiting for the verdict...") + "</p>" +
                lineupHtml(c, !mine) +
                (mine ? '<div class="ldx-row"><button class="ldx-btn" type="button" data-act="cancel">Back to the scene</button></div>' : ""));
        }
        if (st.phase === "result" && st.result) {
            const r = st.result;
            if (r.ok) {
                const keys = c.hotspots.filter((h) => h.clue.key).map((h) => h.clue.title).join(", ");
                return ovWrap('<h3 class="win">Case solved</h3>' +
                    '<p class="sub">The culprit was ' + esc(cul.name) + " (" + esc(cul.trait) + "). " + esc(display(st, r.by)) + " closed it.</p>" +
                    '<p class="ldx-ovline">Key evidence: ' + esc(keys) + "</p>" +
                    '<p class="ldx-ovline">5W1H deductions completed: ' + st.investigations.length + '/6</p>' +
                    '<p class="ldx-ovline">+' + r.pts + " points (100 case + " + r.timeB + " time + " + r.quizB + " quiz)</p>" +
                    '<p class="sub">Score ' + esc(display(st, 0)) + " " + st.scores[0] + " - " + esc(display(st, 1)) + " " + st.scores[1] + "</p>" +
                    (st.cheated ? '<p class="ldx-note">Cheats were used this match.</p>' : "") +
                    '<div class="ldx-row"><button class="ldx-btn pri" type="button" data-act="next">' + (st.caseIdx + 1 < CASE_COUNT ? "Next case" : "See final score") + "</button></div>");
            }
            return ovWrap('<h3 class="lose">Case failed</h3>' +
                '<p class="sub">' + esc(r.reason) + " The real culprit was " + esc(cul.name) + " (" + esc(cul.trait) + ").</p>" +
                '<div class="ldx-row"><button class="ldx-btn pri" type="button" data-act="retry">Try a fresh layout</button></div>');
        }
        if (st.phase === "final") {
            const s0 = st.scores[0], s1 = st.scores[1];
            const winner = s0 === s1 ? -1 : s0 > s1 ? 0 : 1;
            if (!st.cheated && st.scores[my] > best) {
                best = st.scores[my];
                ui.savedSeed = st.seed;
                try { localStorage.setItem(META.bestKey, String(best)); } catch (e) { /* storage unavailable */ }
            }
            return ovWrap('<h3 class="win">Match over</h3>' +
                '<p class="sub">' + (winner < 0 ? "Dead heat - both detectives tied." : esc(display(st, winner)) + " takes the match.") + "</p>" +
                '<p class="ldx-ovline">' + esc(display(st, 0)) + ": " + s0 + " - " + esc(display(st, 1)) + ": " + s1 + "</p>" +
                (ui.savedSeed === st.seed ? '<p class="ldx-ovline">New personal best!</p>' : best > 0 ? '<p class="ldx-note">Best: ' + best + "</p>" : "") +
                (st.cheated ? '<p class="ldx-note">Cheats were used - best score not saved.</p>' : "") +
                '<div class="ldx-row"><button class="ldx-btn pri" type="button" data-act="replay">Play again</button></div>');
        }
        return "";
    }

    /* ---------- render ---------- */
    function statusText(st, my) {
        if (st.phase === "lobby") return "Ready";
        if (st.phase === "brief") return "Briefing";
        if (st.phase === "play") return st.turn === my ? "Your turn" : online ? display(st, st.turn) + " is investigating" : "Bot is thinking";
        if (st.phase === "accuse" && st.accuse) return st.accuse.by === my ? "Name the culprit" : display(st, st.accuse.by) + " is accusing";
        if (st.phase === "result") return st.result && st.result.ok ? "Case solved" : "Case failed";
        return "Match over";
    }
    function render() {
        if (destroyed) return;
        if (!state) {
            statusEl.textContent = "Connecting";
            ovEl.innerHTML = '<div class="ldx-wait">Waiting for the host to deal the first case...</div>';
            return;
        }
        const st = state, c = caseOf(st), my = mySeat();
        const play = st.phase === "play";
        const myTurn = play && st.turn === my;
        hud.case.textContent = (st.caseIdx + 1) + "/" + CASE_COUNT;
        hud.clues.textContent = st.found.length + "/8";
        hud.clues2.textContent = st.found.length + "/8";
        hud.fivewh.textContent = st.investigations.length + "/6";
        fivewhCountEl.textContent = st.investigations.length + "/6";
        hud.time.textContent = fmtTime(st.timeLeft) + (st.cheats.freeze ? " *" : "");
        timeFill.style.width = Math.max(0, (st.timeLeft / CASE_TIME) * 100) + "%";
        modeEl.textContent = online ? "Online duel" : "Vs bot";
        statusEl.textContent = statusText(st, my);
        bestEl.textContent = best > 0 ? "Best: " + best : "";
        cheatBtn.hidden = online;
        const key = st.seed + "|" + st.salt + "|" + st.caseIdx;
        if (ui.caseKey !== key) {
            ui.caseKey = key;
            ui.focusHid = null;
            ui.openSus.clear();
            ui.picker = null;
            sceneEl.innerHTML = SCENE + c.props + hotsMarkup(c);
        }
        updateHots(c, st, my, myTurn, play);
        if (st.banner && ui.dismissRev !== st.rev) {
            bannerEl.hidden = false;
            bannerEl.innerHTML = '<span class="ldx-btag">' + st.banner.tag + "</span>" + byChip(st, st.banner.by) +
                '<span class="ldx-btxt">' + hl(st.banner.text, c) + '</span><button class="ldx-bx" type="button" data-act="banner-x" aria-label="Dismiss">x</button>';
        } else bannerEl.hidden = true;
        hoverEl.textContent = myTurn ? "Your move - search a glowing spot or use a tool" : "Search the room";
        playersEl.innerHTML = playersHtml(st, my);
        actionsEl.innerHTML = actionsHtml(st, my, myTurn, play);
        evEl.innerHTML = evidenceHtml(st, c);
        fivewhEl.innerHTML = fiveW1HHtml(st, c);
        intelEl.innerHTML = intelHtml(st, c);
        susEl.innerHTML = suspectsHtml(st, c);
        logEl.innerHTML = st.log.slice(-5).map((l) => "<span>" + esc(l) + "</span>").join("");
        ovEl.innerHTML = overlayHtml(st, c, my);
    }

    /* ---------- host-authoritative action flow ---------- */
    function publish() {
        render();
        if (online && room.isHost) {
            try {
                const p = room.publishState(state);
                if (p && p.catch) p.catch(console.warn);
            } catch (err) { console.warn(err); }
        }
        scheduleBot();
    }
    function applyAction(a, actorConn) {
        if (destroyed || !state) return;
        const seat = state.seatOf[actorConn];
        const res = applyToState(state, a, seat, { online: online });
        if (res === "reset") {
            resetMatch(state, online);
            if (!online) state.names[1] = "Bot";
            state.rev++;
            publish();
        } else if (res) {
            state.rev++;
            publish();
        }
    }
    function submitAction(a) {
        if (online && !room.isHost) {
            try {
                const p = room.sendAction(a);
                if (p && p.catch) p.catch(console.warn);
            } catch (err) { console.warn(err); }
            return;
        }
        applyAction(a, conn);
    }

    /* ---------- bot scheduling (offline, seat 1) ---------- */
    function scheduleBot() {
        if (destroyed || online || !state) return;
        const st = state;
        const need = (st.phase === "play" && st.turn === 1) || (st.phase === "accuse" && st.accuse && st.accuse.by === 1);
        if (!need) {
            if (botTimer) { clearTimeout(botTimer); botTimer = null; }
            return;
        }
        if (botTimer) return;
        const token = st.rev;
        const delay = st.phase === "accuse" ? 650 + Math.random() * 650 : 900 + Math.random() * 1300;
        botTimer = setTimeout(() => {
            botTimer = null;
            if (destroyed || !state || state.rev !== token) return;
            const a = botChoose(state, caseOf(state), Math.random);
            if (a) applyAction(a, 1);
        }, delay);
    }

    /* ---------- mouse / touch ---------- */
    function handleClick(e) {
        const el = e.target && e.target.closest ? e.target.closest("[data-act]") : null;
        if (!el) return;
        const act = el.getAttribute("data-act");
        if (act === "exit") { onExit(); return; }
        if (!state && act !== "guide" && act !== "guide-close") return;
        switch (act) {
            case "guide": ui.guide = !ui.guide; ui.cheats = false; ui.picker = null; render(); break;
            case "guide-close": ui.guide = false; render(); break;
            case "cheats": if (!online) { ui.cheats = !ui.cheats; ui.guide = false; ui.picker = null; render(); } break;
            case "cheats-close": ui.cheats = false; render(); break;
            case "picker-close": ui.picker = null; render(); break;
            case "picker-back": ui.picker = "fivewh"; render(); break;
            case "fivewh": ui.picker = "fivewh"; render(); break;
            case "select-question": ui.picker = "question:" + el.getAttribute("data-qid"); render(); break;
            case "answer-question": {
                const qid = el.getAttribute("data-qid");
                const idx = Number(el.getAttribute("data-idx"));
                ui.picker = null;
                submitAction({ t: "investigate", id: qid, idx: idx });
                render();
                break;
            }
            case "banner-x": ui.dismissRev = state.rev; render(); break;
            case "dossier": {
                const sid = el.getAttribute("data-sid");
                if (ui.openSus.has(sid)) ui.openSus.delete(sid); else ui.openSus.add(sid);
                render();
                break;
            }
            case "hot": submitAction({ t: "search", hid: el.getAttribute("data-hid") }); break;
            case "tool": {
                const kind = el.getAttribute("data-kind");
                if (kind === "cctv") submitAction({ t: "tool", kind: "cctv" });
                else { ui.picker = kind; render(); }
                break;
            }
            case "pick-lab": { const hid = el.getAttribute("data-hid"); ui.picker = null; submitAction({ t: "tool", kind: "lab", hid: hid }); render(); break; }
            case "pick-alibi": { const sid = el.getAttribute("data-sid"); ui.picker = null; submitAction({ t: "tool", kind: "alibi", sid: sid }); render(); break; }
            case "suspect": submitAction({ t: "pick", sid: el.getAttribute("data-sid") }); break;
            case "quiz": submitAction({ t: "quiz", idx: Number(el.getAttribute("data-idx")) }); break;
            case "cheat-toggle": submitAction({ t: "cheat", key: el.getAttribute("data-key") }); break;
            case "cheat-collect": submitAction({ t: "cheat-collect" }); break;
            case "cheat-solve": submitAction({ t: "cheat-solve" }); break;
            case "accuse": submitAction({ t: "accuse-open" }); break;
            case "start": case "begin": case "next": case "retry": case "replay": case "restart": case "pass": case "cancel":
                submitAction({ t: act });
                break;
            default: break;
        }
    }
    function onHover(e) {
        if (!state) return;
        const g = e.target && e.target.closest ? e.target.closest(".ldx-hot") : null;
        if (!g) return;
        if (e.type === "mouseover") {
            const h = caseOf(state).hotspots.filter((x) => x.id === g.getAttribute("data-hid"))[0];
            if (h) hoverEl.textContent = "Search: " + h.label;
        } else hoverEl.textContent = "Search the room";
    }

    /* ---------- keyboard (desktop) ---------- */
    function moveFocus(dx, dy) {
        const c = caseOf(state);
        const list = c.hotspots.slice().sort((a, b) => (dx ? a.x - b.x : a.y - b.y));
        let idx = list.findIndex((h) => h.id === ui.focusHid);
        if (idx < 0) idx = dx > 0 || dy > 0 ? -1 : 0;
        idx = (idx + (dx || dy) + list.length) % list.length;
        ui.focusHid = list[idx].id;
        render();
    }
    function onKey(e) {
        if (destroyed || !state) return;
        if (e.metaKey || e.ctrlKey || e.altKey) return;
        const k = e.key;
        const lower = typeof k === "string" ? k.toLowerCase() : "";
        if (ui.guide) {
            if (k === "Escape" || k === "Enter" || lower === "g") { ui.guide = false; e.preventDefault(); render(); }
            return;
        }
        if (ui.cheats) {
            if (k === "Escape" || lower === "x") { ui.cheats = false; e.preventDefault(); render(); }
            return;
        }
        if (ui.picker) {
            if (k === "Escape") { ui.picker = null; e.preventDefault(); render(); return; }
            if (ui.picker === "fivewh" && k >= "1" && k <= "6") {
                const task = caseOf(state).investigations[Number(k) - 1];
                if (task && !state.investigations.some((x) => x.id === task.id)) { ui.picker = "question:" + task.id; e.preventDefault(); render(); }
                return;
            }
            if (ui.picker.indexOf("question:") === 0 && k >= "1" && k <= "3") {
                const qid = ui.picker.slice("question:".length);
                const task = caseOf(state).investigations.filter((x) => x.id === qid)[0];
                if (task) { ui.picker = null; e.preventDefault(); submitAction({ t: "investigate", id: qid, idx: Number(k) - 1 }); render(); }
                return;
            }
            if (k >= "1" && k <= "9") {
                const items = pickerItems(state, caseOf(state));
                const it = items[Number(k) - 1];
                if (it) {
                    const a = ui.picker === "lab" ? { t: "tool", kind: "lab", hid: it.hid } : { t: "tool", kind: "alibi", sid: it.sid };
                    ui.picker = null;
                    e.preventDefault();
                    submitAction(a);
                    render();
                }
            }
            return;
        }
        if (lower === "g" || k === "?") { ui.guide = true; e.preventDefault(); render(); return; }
        if (lower === "w" && state.phase === "play" && state.turn === mySeat() && state.investigations.length < FIVE_W1H.length) { ui.picker = "fivewh"; e.preventDefault(); render(); return; }
        if (lower === "x" && !online) { ui.cheats = true; e.preventDefault(); render(); return; }
        if (lower === "r" && e.shiftKey) { e.preventDefault(); submitAction({ t: "restart" }); return; }
        const st = state, my = mySeat(), ph = st.phase;
        if (ph === "lobby" || ph === "brief" || ph === "result" || ph === "final") {
            if (k === "Enter" || k === " ") {
                e.preventDefault();
                if (ph === "lobby") submitAction({ t: "start" });
                else if (ph === "brief") submitAction({ t: "begin" });
                else if (ph === "result") submitAction({ t: st.result && st.result.ok ? "next" : "retry" });
                else submitAction({ t: "replay" });
            }
            return;
        }
        if (ph === "accuse") {
            if (!st.accuse || st.accuse.by !== my) return;
            if (st.accuse.stage === "lineup") {
                if (k >= "1" && k <= "4") {
                    const s = caseOf(st).suspects[Number(k) - 1];
                    if (s) { e.preventDefault(); submitAction({ t: "pick", sid: s.id }); }
                } else if (k === "Escape") { e.preventDefault(); submitAction({ t: "cancel" }); }
            } else if (k >= "1" && k <= "3") {
                e.preventDefault();
                submitAction({ t: "quiz", idx: Number(k) - 1 });
            }
            return;
        }
        if (ph === "play") {
            const c = caseOf(st);
            if (k === "ArrowLeft" || k === "ArrowRight" || k === "ArrowUp" || k === "ArrowDown") {
                e.preventDefault();
                if (st.turn === my) moveFocus(k === "ArrowLeft" ? -1 : k === "ArrowRight" ? 1 : 0, k === "ArrowUp" ? -1 : k === "ArrowDown" ? 1 : 0);
                return;
            }
            if (st.turn !== my) return;
            if (k >= "1" && k <= "8") {
                const h = c.hotspots[Number(k) - 1];
                if (h) { e.preventDefault(); submitAction({ t: "search", hid: h.id }); }
                return;
            }
            if (k === "Enter" || k === " ") {
                if (ui.focusHid) { e.preventDefault(); submitAction({ t: "search", hid: ui.focusHid }); }
                return;
            }
            if (lower === "a") { e.preventDefault(); submitAction({ t: "accuse-open" }); return; }
            if (lower === "c") { e.preventDefault(); submitAction({ t: "tool", kind: "cctv" }); return; }
            if (lower === "f") { e.preventDefault(); ui.picker = "lab"; render(); return; }
            if (lower === "l") { e.preventDefault(); ui.picker = "alibi"; render(); return; }
            if (lower === "p") { e.preventDefault(); submitAction({ t: "pass" }); return; }
        }
    }

    /* ---------- wiring ---------- */
    root.addEventListener("click", handleClick);
    root.addEventListener("mouseover", onHover);
    root.addEventListener("mouseout", onHover);
    document.addEventListener("keydown", onKey);

    if (!online || room.isHost) {
        timerId = setInterval(() => {
            if (destroyed || !state) return;
            if (!online && (ui.guide || ui.cheats || ui.picker || document.hidden)) return; // pause while reading overlays offline
            if (state.phase === "play") applyAction({ t: "tick" }, 0);
        }, 1000);
    }

    if (online) {
        const u1 = room.onRoom((nextRoom) => { roomData = nextRoom; render(); });
        if (typeof u1 === "function") unsubs.push(u1);
        if (room.isHost) {
            state = initialState({ online: true, hostName: playerName });
            publish();
            const u2 = room.onAction((action) => applyAction(action, 1));
            if (typeof u2 === "function") unsubs.push(u2);
        } else {
            const u3 = room.onState((nextState) => {
                state = nextState;
                if (state && ui.helloSeed !== state.seed) {
                    ui.helloSeed = state.seed;
                    submitAction({ t: "hello", name: playerName });
                }
                render();
            });
            if (typeof u3 === "function") unsubs.push(u3);
        }
    } else {
        state = initialState({ online: false, hostName: playerName });
        state.names[0] = String(playerName || "You").slice(0, 18);
        state.names[1] = "Bot";
    }
    render();

    return {
        destroy() {
            destroyed = true;
            root.removeEventListener("click", handleClick);
            root.removeEventListener("mouseover", onHover);
            root.removeEventListener("mouseout", onHover);
            document.removeEventListener("keydown", onKey);
            if (timerId) { clearInterval(timerId); timerId = null; }
            if (botTimer) { clearTimeout(botTimer); botTimer = null; }
            unsubs.forEach((u) => { try { u(); } catch (e) { /* already gone */ } });
        },
        _test: { generateCase: generateCase, checkCaseData: checkCaseData, solveCase: solveCase, applyToState: applyToState, initialState: initialState, botChoose: botChoose },
    };
}