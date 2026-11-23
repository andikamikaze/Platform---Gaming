/*
 * Border Desk — jaga gerbang perbatasan.
 * Letakkan file ini sebagai JS/games/border-desk.js lalu jalankan:
 *   node tools/build-games-manifest.mjs
 *
 * Isi file:
 *   1. META            : metadata kartu game
 *   2. DATA            : dokumen, aturan, nama (edit di sini untuk menambah aturan baru)
 *   3. ENGINE          : generator pelamar, evaluasi aturan, pemalsuan (tanpa DOM)
 *   4. mount()         : UI, mode Solo, mode VS (Bot / Online), input, cheat
 */

export const META = {
    id: "border-desk",
    name: "Border Desk",
    category: "puzzle",
    catLabel: "Puzzle",
    desc: "Periksa dokumen di gerbang perbatasan. Mainkan shift harian, lawan bot, atau bertanding online: bergantian jadi Inspektur dan Penyelundup.",
    art: '<svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="11" y="6" width="26" height="36" rx="3" fill="#fff"/><circle cx="20" cy="17" r="4" fill="#0f766e"/><rect x="27" y="14" width="7" height="2" rx="1" fill="#94a3b8"/><rect x="27" y="19" width="7" height="2" rx="1" fill="#94a3b8"/><rect x="16" y="26" width="16" height="2" rx="1" fill="#94a3b8"/><path d="M17 35l4 4 9-9" stroke="#0f766e" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    bg: ["#5eead4", "#0f766e"],
    bestKey: "borderDeskBest",
};

/* ========================================================================== */
/* DATA — semua konten permainan ada di sini                                  */
/* ========================================================================== */

const SEEN_KEY = "borderDeskSeenHelp";
const BASE_DATE = "2031-03-01";

const COUNTRIES = ["Altaria", "Cresten", "Ostrel", "Maravia", "Sundara", "Veldoria", "Pelmora", "Karsa"];
const FIRST = ["Arin", "Bela", "Corin", "Dara", "Elio", "Fenna", "Gavri", "Hana", "Ilan", "Joss", "Kira", "Lior", "Mara", "Nico", "Orla", "Pavel", "Quin", "Rhea", "Soren", "Talia"];
const LAST = ["Voss", "Halden", "Marek", "Orsin", "Pell", "Quill", "Rask", "Sable", "Tarn", "Ulric", "Varga", "Wren", "Yarrow", "Zeller"];
const PURPOSES = ["Wisata", "Kerja", "Transit", "Keluarga"];
const EMPLOYERS = ["Pabrik Orsa", "Galangan Tamen", "Kebun Lumo", "Tambang Reda"];
const FACE = {
    skin: ["#f3d5b5", "#e2ac82", "#b97a52", "#7b4b2e"],
    hairColor: ["#2a1f18", "#6b4423", "#c8a05a", "#9ca3af"],
    hair: ["short", "long", "bun", "curly", "bald"],
};

/* Dokumen dirender dari definisi ini (bukan digambar manual). */
const DOC_TYPES = {
    passport: {
        title: "Paspor", issuer: "Federasi", minDay: 1, photo: true,
        fields: [
            { k: "name", l: "Nama" }, { k: "country", l: "Negara" }, { k: "dob", l: "Lahir" },
            { k: "number", l: "Nomor" }, { k: "expiry", l: "Berlaku s/d" },
        ],
    },
    permit: {
        title: "Izin Masuk", issuer: "Brevia", minDay: 3,
        fields: [
            { k: "name", l: "Nama" }, { k: "passportNo", l: "No. paspor" }, { k: "purpose", l: "Tujuan" },
            { k: "validFrom", l: "Mulai" }, { k: "validTo", l: "Sampai" },
        ],
    },
    workcard: {
        title: "Kartu Kerja", issuer: "Brevia", minDay: 6,
        fields: [{ k: "name", l: "Nama" }, { k: "employer", l: "Pemberi kerja" }],
    },
};

/*
 * ATURAN — cukup tambah objek baru di array ini.
 *   type : notExpired | notIn | match | dateInRange | requireDoc   (lihat CHECKERS & FORGERS)
 *   minDay: hari pertama aturan aktif   level: kehalusan pemalsuan (1-3, dipakai bot)
 *   pick : {max} → daftar nilai ({list}) diundi ulang tiap hari
 * "doc: person" berarti pemohon yang berdiri di loket (wajahnya).
 */
const RULES = [
    {
        id: "expiry", minDay: 1, level: 1, type: "notExpired", doc: "passport", field: "expiry",
        text: "Paspor tidak boleh kedaluwarsa (bandingkan dengan tanggal hari ini).",
        reason: "Paspor kedaluwarsa", flaw: "Paspor kedaluwarsa"
    },
    {
        id: "banned", minDay: 2, level: 1, type: "notIn", doc: "passport", field: "country", pick: { max: 3 },
        text: "Tolak pemegang paspor dari: {list}.",
        reason: "Negara terlarang", flaw: "Negara terlarang"
    },
    {
        id: "name", minDay: 3, level: 2, type: "match",
        a: { doc: "passport", field: "name" }, b: { doc: "permit", field: "name" },
        text: "Nama di paspor harus sama dengan nama di izin masuk.",
        reason: "Nama tidak cocok", flaw: "Nama tidak cocok"
    },
    {
        id: "photo", minDay: 4, level: 2, type: "match",
        a: { doc: "passport", field: "face" }, b: { doc: "person", field: "face" },
        text: "Foto di paspor harus cocok dengan wajah pemohon.",
        reason: "Foto tidak cocok", flaw: "Foto tidak cocok"
    },
    {
        id: "permitDate", minDay: 5, level: 2, type: "dateInRange", doc: "permit", from: "validFrom", to: "validTo",
        text: "Izin masuk harus berlaku hari ini (antara tanggal Mulai dan Sampai).",
        reason: "Izin tidak berlaku hari ini", flaw: "Izin tidak berlaku"
    },
    {
        id: "workcard", minDay: 6, level: 1, type: "requireDoc", doc: "workcard",
        when: { doc: "permit", field: "purpose", equals: "Kerja" },
        text: "Tujuan \"Kerja\" wajib membawa Kartu Kerja.",
        reason: "Kartu Kerja tidak ada", flaw: "Tanpa Kartu Kerja"
    },
    {
        id: "passNo", minDay: 7, level: 3, type: "match",
        a: { doc: "passport", field: "number" }, b: { doc: "permit", field: "passportNo" },
        text: "Nomor paspor di izin harus sama dengan nomor di paspor.",
        reason: "Nomor paspor tidak cocok", flaw: "Nomor paspor beda"
    },
];

/* Ekonomi & mode */
const START_MONEY = 40;
const MISTAKE_FINE = 10;
const PERFECT_BONUS = 10;
const MATCH = { day: 6, count: 5, maxFlaws: 3, limit: 35 };
const BOT_LEVELS = { easy: 0.55, normal: 0.78, hard: 0.93 };

/* ========================================================================== */
/* ENGINE                                                                     */
/* ========================================================================== */

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const signed = (n) => (n > 0 ? "+" + n : String(n));
const lsGet = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch { /* abaikan */ } };

function mulberry32(a) {
    return function () {
        a |= 0; a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
const pick = (r, arr) => arr[Math.floor(r() * arr.length)];
const int = (r, a, b) => a + Math.floor(r() * (b - a + 1));
function shuffle(r, arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1));[a[i], a[j]] = [a[j], a[i]]; }
    return a;
}
const pad2 = (n) => String(n).padStart(2, "0");
function addDays(iso, n) {
    const d = new Date(iso + "T00:00:00Z");
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
}
const dateForDay = (day) => addDays(BASE_DATE, day - 1);

function instantiateRules(day, rng) {
    return RULES.filter((r) => r.minDay <= day).map((r) => {
        const o = { ...r };
        if (r.pick) {
            const n = Math.min(r.pick.max, 1 + Math.floor((day - r.minDay) / 3));
            o.list = shuffle(rng, COUNTRIES).slice(0, n);
        }
        o.textResolved = r.text.replace("{list}", (o.list || []).join(", "));
        return o;
    });
}
const ruleById = (rules, id) => rules.find((r) => r.id === id);

const getVal = (app, doc, field) => (doc === "person" ? app.person?.[field] : app.docs?.[doc]?.[field]);
const keyOf = (v) => (v && typeof v === "object" ? JSON.stringify(v) : String(v));

/* Pemeriksa: kembalikan daftar {doc, field} yang dilanggar, atau null. */
const CHECKERS = {
    notExpired: (r, app, c) => {
        const v = getVal(app, r.doc, r.field);
        return v != null && v < c.today ? [{ doc: r.doc, field: r.field }] : null;
    },
    notIn: (r, app) => {
        const v = getVal(app, r.doc, r.field);
        return v != null && (r.list || []).includes(v) ? [{ doc: r.doc, field: r.field }] : null;
    },
    match: (r, app) => {
        const a = getVal(app, r.a.doc, r.a.field);
        const b = getVal(app, r.b.doc, r.b.field);
        return a != null && b != null && keyOf(a) !== keyOf(b)
            ? [{ doc: r.a.doc, field: r.a.field }, { doc: r.b.doc, field: r.b.field }] : null;
    },
    dateInRange: (r, app, c) => {
        const d = app.docs[r.doc];
        if (!d) return null;
        return c.today < d[r.from] || c.today > d[r.to]
            ? [{ doc: r.doc, field: r.from }, { doc: r.doc, field: r.to }] : null;
    },
    requireDoc: (r, app) => {
        const w = r.when;
        if (w && getVal(app, w.doc, w.field) !== w.equals) return null;
        return app.docs[r.doc] ? null : (w ? [{ doc: w.doc, field: w.field }] : []);
    },
};

function mutateFace(f, c) {
    const n = { ...f };
    const t = pick(c.rng, ["skin", "hairColor", "hair", "glasses", "beard"]);
    if (t === "glasses" || t === "beard") n[t] = !n[t];
    else n[t] = pick(c.rng, FACE[t].filter((x) => x !== f[t]));
    return n;
}
function mutate(cur, c) {
    if (cur && typeof cur === "object") return mutateFace(cur, c);
    if (/^[A-Z]{2}\d{6}$/.test(cur)) {
        const i = int(c.rng, 2, 7);
        return cur.slice(0, i) + String((+cur[i] + int(c.rng, 1, 9)) % 10) + cur.slice(i + 1);
    }
    if (c.subtle) return cur.slice(0, -1) + (cur.slice(-1) === "n" ? "m" : "n");
    let n = makeName(c.rng);
    while (n === cur) n = makeName(c.rng);
    return n;
}

/* Pemalsu: ubah pelamar bersih supaya melanggar aturan. */
const FORGERS = {
    notExpired: (r, app, c) => { app.docs[r.doc][r.field] = addDays(c.today, -(c.subtle ? int(c.rng, 1, 4) : int(c.rng, 20, 500))); },
    notIn: (r, app, c) => { app.docs[r.doc][r.field] = pick(c.rng, r.list); },
    match: (r, app, c) => {
        const t = r.b.doc === "person" ? r.a : r.b;
        const d = t.doc === "person" ? app.person : app.docs[t.doc];
        if (d) d[t.field] = mutate(d[t.field], c);
    },
    dateInRange: (r, app, c) => {
        const d = app.docs[r.doc];
        if (!d) return;
        if (c.rng() < 0.5) d[r.to] = addDays(c.today, -(c.subtle ? 1 : int(c.rng, 5, 60)));
        else d[r.from] = addDays(c.today, c.subtle ? 1 : int(c.rng, 3, 40));
    },
    requireDoc: (r, app) => {
        if (r.when && app.docs[r.when.doc]) app.docs[r.when.doc][r.when.field] = r.when.equals;
        delete app.docs[r.doc];
    },
};

function evaluate(app, rules, ctx) {
    const out = [];
    for (const r of rules) {
        const chk = CHECKERS[r.type];
        const refs = chk && chk(r, app, ctx);
        if (refs) out.push({ id: r.id, reason: r.reason, refs });
    }
    return out;
}
function judge(app, rules, today) {
    const v = evaluate(app, rules, { today });
    return {
        bad: v.length > 0,
        reasons: v.map((x) => x.reason),
        ids: v.map((x) => x.id),
        refs: v.flatMap((x) => x.refs).filter((x) => x.doc),
    };
}

const makeName = (rng) => pick(rng, FIRST) + " " + pick(rng, LAST);
const makeFace = (rng) => ({
    skin: pick(rng, FACE.skin), hairColor: pick(rng, FACE.hairColor), hair: pick(rng, FACE.hair),
    glasses: rng() < 0.3, beard: rng() < 0.25,
});
let uidc = 0;

function generateApplicant(rng, ctx, flawIds = [], opts = {}) {
    const { day, today, rules } = ctx;
    const banned = rules.filter((r) => r.type === "notIn" && r.field === "country").flatMap((r) => r.list || []);
    const name = makeName(rng);
    const face = makeFace(rng);
    const L = "ABCDEFGHJKLMNPRSTUVWXYZ";
    const number = pick(rng, [...L]) + pick(rng, [...L]) + String(int(rng, 100000, 999999));
    const purpose = pick(rng, PURPOSES);
    const app = { id: "a" + ++uidc, person: { face }, docs: {}, revealed: false };
    app.docs.passport = {
        name, country: pick(rng, COUNTRIES.filter((c) => !banned.includes(c))),
        dob: `${int(rng, 1950, 2005)}-${pad2(int(rng, 1, 12))}-${pad2(int(rng, 1, 28))}`,
        number, expiry: addDays(today, int(rng, 30, 1200)), face: { ...face },
    };
    if (day >= DOC_TYPES.permit.minDay) {
        app.docs.permit = {
            name, passportNo: number, purpose,
            validFrom: addDays(today, -int(rng, 1, 60)), validTo: addDays(today, int(rng, 1, 90)),
        };
    }
    if (day >= DOC_TYPES.workcard.minDay && purpose === "Kerja") {
        app.docs.workcard = { name, employer: pick(rng, EMPLOYERS) };
    }
    for (const id of flawIds) {
        const r = ruleById(rules, id);
        if (r) FORGERS[r.type](r, app, { rng, today, subtle: !!opts.subtle });
    }
    app.truth = judge(app, rules, today);
    app.truth.subtle = !!opts.subtle && app.truth.bad;
    return app;
}

/* Pastikan hasil sesuai niat (bersih/cacat) — dasar jaminan level bisa diselesaikan. */
function genChecked(rng, ctx, flawIds, subtle) {
    let app;
    for (let i = 0; i < 8; i++) {
        app = generateApplicant(rng, ctx, flawIds, { subtle });
        if ((flawIds.length > 0) === app.truth.bad) return app;
    }
    return app;
}

function planEconomy(day) {
    const count = Math.min(14, 7 + day);
    let pay = 6 + Math.floor(day / 5);
    const expenses = 20 + 3 * (day - 1);
    while (count * pay + PERFECT_BONUS - expenses < 10) pay++; // permainan sempurna selalu menghasilkan untung
    return { count, pay, expenses };
}

/* Generator level acak. Aturan penentu keputusan selalu terlihat di dokumen,
 * jadi setiap pelamar pasti bisa diputuskan dengan benar sebelum waktu habis. */
function generateDay(day, seed) {
    const rng = mulberry32(seed);
    const rules = instantiateRules(day, rng);
    const today = dateForDay(day);
    const eco = planEconomy(day);
    const flawRate = Math.min(0.55, 0.35 + 0.02 * day);
    const subtleChance = Math.min(0.6, day * 0.06);
    const ctx = { day, today, rules };
    const apps = [];
    for (let i = 0; i < eco.count; i++) {
        let flaws = [];
        if (rng() < flawRate) {
            const k = day >= 5 && rng() < 0.25 ? 2 : 1;
            flaws = shuffle(rng, rules.map((r) => r.id)).slice(0, k);
        }
        apps.push(genChecked(rng, ctx, flaws, rng() < subtleChance));
    }
    for (let t = 0; t < 20 && !apps.some((a) => a.truth.bad); t++) {
        apps[apps.length - 1] = genChecked(rng, ctx, [pick(rng, rules).id], false);
    }
    for (let t = 0; t < 20 && !apps.some((a) => !a.truth.bad); t++) {
        apps[0] = genChecked(rng, ctx, [], false);
    }
    const timeLimit = Math.round(Math.max(20, 46 - 2 * day) + 1.5 * rules.length);
    return { day, today, rules, apps, timeLimit, ...eco };
}

/* ========================================================================== */
/* TAMPILAN (SVG wajah, dokumen)                                              */
/* ========================================================================== */

function faceSVG(f, size = 64) {
    const hc = f.hairColor, sk = f.skin;
    const back = f.hair === "long" ? `<rect x="14" y="12" width="36" height="42" rx="15" fill="${hc}"/>` : "";
    let front = "";
    if (f.hair === "short" || f.hair === "long" || f.hair === "bun") {
        front = `<path d="M18 27C18 12 26 9 32 9s14 3 14 18c-3-6-8-9-14-9s-11 3-14 9z" fill="${hc}"/>`;
    }
    if (f.hair === "bun") front += `<circle cx="32" cy="6" r="5" fill="${hc}"/>`;
    if (f.hair === "curly") {
        front = [[20, 19], [26, 12], [32, 10], [38, 12], [44, 19]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="6.5" fill="${hc}"/>`).join("");
    }
    const beard = f.beard ? `<path d="M19 31q1 15 13 15t13-15q-5 8-13 8t-13-8z" fill="${hc}"/>` : "";
    const glasses = f.glasses
        ? `<g fill="none" stroke="#1f2933" stroke-width="1.4"><circle cx="26" cy="28" r="4.6"/><circle cx="38" cy="28" r="4.6"/><path d="M30.6 28h2.8"/></g>` : "";
    return `<svg viewBox="0 0 64 64" width="${size}" height="${size}" aria-hidden="true"><rect width="64" height="64" fill="#e6ebf0"/>`
        + `<path d="M6 64q2-16 26-16t26 16z" fill="#8896a6"/>${back}<rect x="27" y="40" width="10" height="10" fill="${sk}"/>`
        + `<ellipse cx="32" cy="29" rx="13" ry="15" fill="${sk}"/>${front}${beard}`
        + `<circle cx="26" cy="28" r="1.4" fill="#1f2933"/><circle cx="38" cy="28" r="1.4" fill="#1f2933"/>${glasses}`
        + `<path d="M28 37q4 2.4 8 0" stroke="#6a3b2a" stroke-width="1.3" fill="none" stroke-linecap="round"/></svg>`;
}

const CSS = `
.bd{--ink:#16202a;--mute:#64748b;--line:#d8dee6;--bg:#eef1f4;--surf:#fff;--acc:#0f766e;--ok:#1f7a4d;--bad:#b3402f;--warn:#a16207;
 position:relative;min-height:480px;color:var(--ink);font:14px/1.45 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;background:var(--bg);
 border:1px solid var(--line);border-radius:12px;overflow:hidden;-webkit-user-select:none;user-select:none}
.bd *{box-sizing:border-box}
.bd button{font:inherit;color:inherit;cursor:pointer}
.bd h3,.bd h4,.bd p{margin:0}
.bd-top{display:flex;align-items:center;gap:14px;padding:10px 14px;background:var(--surf);border-bottom:1px solid var(--line);flex-wrap:wrap}
.bd-brand{font-weight:700}
.bd-stats{display:flex;gap:14px;flex:1;flex-wrap:wrap;color:var(--mute)}
.bd-stats b{color:var(--ink);font-weight:600;font-variant-numeric:tabular-nums}
.bd-tools{display:flex;gap:6px}
.bd-ghost{background:transparent;border:1px solid var(--line);border-radius:8px;padding:5px 10px}
.bd-ghost:hover,.bd-ghost.on{border-color:var(--acc);color:var(--acc)}
.bd-timer{height:6px;background:var(--line)}
.bd-timer i{display:block;height:100%;width:100%;background:var(--acc)}
.bd-timer.low i{background:var(--bad)}
.bd-main{display:grid;grid-template-columns:230px 1fr;min-height:390px}
.bd-rules{background:var(--surf);border-right:1px solid var(--line);padding:14px;overflow:auto}
.bd-rules h4{margin:12px 0 6px}
.bd-rules ul{margin:0;padding:0;list-style:none;display:grid;gap:8px}
.bd-rules li{padding-left:10px;border-left:2px solid var(--acc)}
.bd-date{color:var(--mute)}.bd-date b{display:block;color:var(--ink);font-size:16px}
.bd-new{font-style:normal;color:var(--acc);font-weight:600}
.bd-note{margin-top:12px;color:var(--mute);font-size:12px}
.bd-desk{display:grid;grid-template-columns:150px 1fr;gap:12px;padding:12px}
.bd-side{display:flex;flex-direction:column;gap:10px}
.bd-booth{display:flex;flex-direction:column;align-items:center;gap:6px;background:var(--surf);border:1px solid var(--line);border-radius:10px;padding:10px}
.bd-person{border-radius:8px;overflow:hidden;line-height:0;cursor:pointer;outline:2px solid transparent}
.bd-person.mark{outline-color:#f59e0b}.bd-person.hint{outline-color:#dc2626}
.bd-ptag{color:var(--mute);font-size:12px}
.bd-tray{display:flex;flex-direction:column;gap:6px}
.bd-card{background:var(--surf);border:1px solid var(--line);border-radius:8px;padding:8px 10px;cursor:grab;touch-action:none;display:flex;flex-direction:column}
.bd-card small{color:var(--mute)}
.bd-card.on{opacity:.45}.bd-card:focus-visible,.bd-btn:focus-visible,.bd-ghost:focus-visible{outline:2px solid var(--acc);outline-offset:2px}
.bd-table{position:relative;min-height:340px;background:#dde3ea;border:1px dashed #b4bfcc;border-radius:10px;overflow:hidden}
.bd-table:empty::before{content:"Seret dokumen ke meja";position:absolute;inset:0;display:grid;place-items:center;color:var(--mute)}
.bd-doc{position:absolute;width:228px;background:var(--surf);border:1px solid #c7d0db;border-radius:8px;box-shadow:0 2px 8px rgba(22,32,42,.12);cursor:grab;touch-action:none}
.bd-doc.out{opacity:.5}
.bd-ghostdoc{position:fixed;z-index:60;pointer-events:none;opacity:.92}
.bd-doc-h{display:flex;justify-content:space-between;align-items:baseline;padding:7px 10px;border-bottom:1px solid var(--line);border-left:4px solid var(--acc);border-radius:8px 8px 0 0}
.bd-doc.permit .bd-doc-h{border-left-color:#475569}.bd-doc.workcard .bd-doc-h{border-left-color:#a16207}
.bd-doc-h span{color:var(--mute);font-size:11px}
.bd-doc-b{display:flex;gap:8px;padding:8px}
.bd-photo{width:52px;height:52px;flex:none;border-radius:6px;overflow:hidden;line-height:0;cursor:pointer;outline:2px solid transparent}
.bd-photo.mark{outline-color:#f59e0b}.bd-photo.hint{outline-color:#dc2626}
.bd-doc dl{margin:0;flex:1;display:grid;gap:1px;min-width:0}
.bd-f{display:flex;justify-content:space-between;gap:8px;padding:1px 4px;border-radius:4px;cursor:pointer}
.bd-f dt{color:var(--mute);font-size:11px;white-space:nowrap}
.bd-f dd{margin:0;font-weight:600;font-size:12px;text-align:right;font-variant-numeric:tabular-nums}
.bd-f.mark{background:#fef3c7}.bd-f.hint{outline:2px solid #dc2626}
.bd-pad{display:flex;gap:10px;align-items:center;flex-wrap:wrap;padding:10px 14px;background:var(--surf);border-top:1px solid var(--line)}
.bd-pad-docs{display:flex;gap:6px;flex-wrap:wrap;flex:1}
.bd-pad-main{display:flex;gap:10px}
.bd-btn{min-width:116px;padding:10px 18px;border-radius:10px;border:1px solid transparent;font-weight:600;color:#fff}
.bd-btn.approve{background:var(--ok)}.bd-btn.deny{background:var(--bad)}
.bd-primary{background:var(--acc);color:#fff;border:0;border-radius:10px;padding:10px 20px;font-weight:600}
.bd-primary:disabled{opacity:.4;cursor:not-allowed}
.bd-link{background:none;border:0;color:var(--acc);text-decoration:underline;padding:4px}
.bd kbd{font:11px ui-monospace,Menlo,monospace;border:1px solid currentColor;border-radius:4px;padding:0 4px;opacity:.7}
.bd-fb{padding:8px 14px;border-top:1px solid var(--line);color:var(--mute);background:var(--bg);min-height:36px}
.bd-fb.ok{color:var(--ok)}.bd-fb.bad{color:var(--bad)}
.bd-advice{padding:8px 14px;background:#fef3c7;color:#713f12;border-top:1px solid #fde68a}
.bd-center{display:grid;place-items:center;padding:24px 14px;min-height:400px}
.bd-sheet{background:var(--surf);border:1px solid var(--line);border-radius:12px;padding:20px;max-width:480px;width:100%;display:grid;gap:12px}
.bd-sheet h3{font-size:18px}
.bd-muted{color:var(--mute)}
.bd-kv{margin:0;display:grid;gap:4px}
.bd-kv div{display:flex;justify-content:space-between;border-bottom:1px solid var(--line);padding:3px 0}
.bd-kv dt{color:var(--mute)}.bd-kv dd{margin:0;font-weight:600;font-variant-numeric:tabular-nums}
.bd-kv .tot{border-bottom:0;font-size:15px}
.bd-cards{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.bd-mode{text-align:left;background:var(--surf);border:1px solid var(--line);border-radius:10px;padding:14px;display:grid;gap:4px}
.bd-mode:hover{border-color:var(--acc)}.bd-mode b{font-size:15px}.bd-mode span{color:var(--mute)}
.bd-seg{display:flex;gap:6px;align-items:center;flex-wrap:wrap}
.bd-seg .bd-ghost.on{background:#e6f4f1}
.bd-plan{display:grid;grid-template-columns:230px 1fr;min-height:390px}
.bd-plan-body{padding:16px;display:grid;gap:12px;align-content:start}
.bd-slots{display:grid;gap:8px}
.bd-slot{display:flex;align-items:center;gap:10px}
.bd-slot span{width:80px;color:var(--mute)}
.bd-slot select{flex:1;min-width:0;padding:8px;border:1px solid var(--line);border-radius:8px;background:var(--surf);font:inherit;color:inherit}
.bd-plan-foot{display:flex;gap:10px;align-items:center;flex-wrap:wrap}
.bd-plan-foot .bd-muted.err{color:var(--bad)}
.bd-feed{list-style:none;margin:0;padding:0;display:grid;gap:6px}
.bd-feed li{display:grid;grid-template-columns:34px 1fr auto 40px;gap:8px;padding:8px 10px;background:var(--surf);border:1px solid var(--line);border-radius:8px;align-items:center}
.bd-feed li.ok{border-left:3px solid var(--ok)}.bd-feed li.bad{border-left:3px solid var(--bad)}
.bd-feed em{font-style:normal;text-align:right;font-variant-numeric:tabular-nums}
.bd-ov{position:absolute;inset:0;background:rgba(22,32,42,.45);display:flex;align-items:center;justify-content:center;padding:14px;z-index:40}
.bd-panel{background:var(--surf);border-radius:12px;max-width:580px;width:100%;max-height:92%;overflow:auto;padding:18px;display:grid;gap:10px;border:1px solid var(--line)}
.bd-panel h3{font-size:18px}.bd-panel h4{margin-top:6px}
.bd-panel ul{margin:0;padding-left:18px;display:grid;gap:3px}
.bd-cheats{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.bd-cheats .bd-ghost{text-align:left;padding:9px 10px}
@media (max-width:760px){
 .bd-main,.bd-plan{grid-template-columns:1fr}
 .bd-rules{display:none}
 .bd.show-rules .bd-rules{display:block;position:absolute;left:0;right:0;top:0;bottom:0;z-index:30;border:0}
 .bd-desk{grid-template-columns:1fr;padding:8px}
 .bd-side{flex-direction:row}.bd-booth{flex:none}.bd-tray{flex:1;flex-direction:row;flex-wrap:wrap;align-content:flex-start}
 .bd-table{min-height:300px}
 .bd-cards,.bd-cheats{grid-template-columns:1fr}
 .bd-slot span{width:64px}
}
@media (pointer:coarse){
 .bd-pad{position:sticky;bottom:0;z-index:10}
 .bd-pad-main{flex:1 1 100%}.bd-btn{flex:1;padding:16px 12px;font-size:16px}
 .bd-ghost{padding:9px 12px}
}
@media (hover:none){.bd kbd{display:none}}
@media (prefers-reduced-motion:reduce){.bd *{transition:none!important}}
`;

/* ========================================================================== */
/* MOUNT                                                                      */
/* ========================================================================== */

export function mount(root, context = {}) {
    const { mode = "ai", room = null, playerName = "Player", onExit = () => { } } = context;
    const online = mode === "room" && Boolean(room);
    const playerIndex = online && !room.isHost ? 1 : 0;
    const me = playerIndex;
    let roomData = room?.room || null;
    let state = null;          // state match (serializable, dibagikan ke room)
    let solo = null;           // kampanye solo (lokal)
    let view = online ? "match" : "menu";
    const settings = { diff: "normal", rounds: 4 };
    const bot = { thorough: BOT_LEVELS.normal, seen: 0, caught: 0, missed: 0 };
    const timers = new Set();
    let botKey = null;
    let drag = null;

    const ui = {
        docs: {}, marks: {}, z: 1, rulesOpen: false, help: !lsGet(SEEN_KEY), cheat: false, cheated: false,
        hint: false, advice: false, freeze: false, noPenalty: false,
        remaining: 0, total: 1, timeoutFired: false, timerKey: null, lock: 0, justDragged: 0, last: Date.now(),
        bannerSeen: false, matchId: null, roundKey: null, planDraft: Array(MATCH.count).fill(""), myPlan: null, planSent: false, planMsg: "",
    };

    root.innerHTML = `
    <div class="game-app">
      <div class="game-intro">
        <div><h2>Border Desk</h2><p>Periksa dokumen di gerbang, atau selundupkan yang palsu.</p></div>
        <span class="game-status"><i class="game-status-dot"></i><span data-status>Siap</span></span>
      </div>
      <style>${CSS}</style>
      <section class="game-panel" data-board></section>
      <div class="game-actions"><button class="game-action-button" type="button" data-exit>Keluar</button></div>
    </div>`;
    const board = root.querySelector("[data-board]");
    const statusEl = root.querySelector("[data-status]");

    const later = (fn, ms) => { const id = setTimeout(() => { timers.delete(id); fn(); }, ms); timers.add(id); return id; };

    /* ---------- role & helper match ---------- */
    const inspectorOf = (s) => (s.firstInspector + s.round) % 2;
    const smugglerOf = (s) => 1 - inspectorOf(s);
    function opName() {
        if (!online) return "Bot";
        const p = roomData?.players;
        let n = null;
        if (Array.isArray(p)) n = p[1 - playerIndex]?.name;
        else if (p && typeof p === "object") n = Object.values(p).find((x) => x && x.name && x.name !== playerName)?.name;
        return n || "Lawan";
    }
    const flawLabel = (id) => RULES.find((r) => r.id === id)?.flaw || id;

    function newMatch(opts) {
        const seed = (Math.random() * 2 ** 31) | 0;
        const rules = instantiateRules(MATCH.day, mulberry32(seed));
        return {
            kind: "match", seed, rules, today: dateForDay(MATCH.day), rounds: opts.rounds, diff: opts.diff,
            round: 0, firstInspector: Math.random() < 0.5 ? 0 : 1, // undian: siapa jadi Inspektur lebih dulu
            phase: "plan", scores: [0, 0], apps: [], idx: 0, results: [], ack: [false, false], last: null, limitMs: MATCH.limit * 1000,
        };
    }
    function publicState(s) {
        const c = JSON.parse(JSON.stringify(s));
        (c.apps || []).forEach((a) => { if (!a.revealed) delete a.truth; });
        return c;
    }

    /* ---------- status & timer ---------- */
    function updateStatus() {
        let t = "Siap";
        if (view === "solo" && solo) t = `Hari ${solo.day} · ${solo.phase === "work" ? `Pelamar ${solo.idx + 1}/${solo.plan.apps.length}` : "Jeda"}`;
        else if (view === "match") t = state ? `Ronde ${Math.min(state.round + 1, state.rounds)}/${state.rounds} · ${state.phase === "final" ? "Selesai" : inspectorOf(state) === me ? "Inspektur" : "Penyelundup"}` : "Menghubungkan";
        statusEl.textContent = t;
    }
    function resetTimer(ms) { ui.total = ui.remaining = ms; ui.timeoutFired = false; }
    function timerActive() {
        return (view === "solo" && solo?.phase === "work") || (view === "match" && state?.phase === "inspect");
    }
    function paintTimer() {
        const bar = board.querySelector("[data-timer-bar]");
        const txt = board.querySelector("[data-timer-txt]");
        const f = ui.total ? clamp(ui.remaining / ui.total, 0, 1) : 0;
        if (bar) { bar.style.width = f * 100 + "%"; bar.parentElement.classList.toggle("low", f < 0.25); }
        if (txt) txt.textContent = Math.max(0, Math.ceil(ui.remaining / 1000)) + " dtk";
    }
    function tick() {
        const now = Date.now();
        const dt = Math.min(250, now - ui.last);
        ui.last = now;
        if (!timerActive()) return;
        if (!ui.freeze) ui.remaining -= dt;
        paintTimer();
        if (ui.remaining <= 0 && !ui.timeoutFired) {
            ui.timeoutFired = true;
            if (view === "solo") soloResolve("timeout");
            else if (!online || room.isHost) matchApply({ t: "timeout" }, 0, true);
        }
    }
    const tickId = setInterval(tick, 100);

    /* sinkronkan timer & sisa UI lokal setiap pelamar/ronde baru */
    function syncLocal() {
        const s = state;
        if (!s) return;
        if (ui.matchId !== s.seed) { ui.matchId = s.seed; ui.bannerSeen = false; ui.roundKey = null; }
        if (ui.roundKey !== s.round) { ui.roundKey = s.round; ui.planDraft = Array(MATCH.count).fill(""); ui.myPlan = null; ui.planSent = false; ui.planMsg = ""; }
        const key = `${s.round}:${s.phase}:${s.idx}`;
        if (ui.timerKey !== key) {
            ui.timerKey = key;
            ui.docs = {}; ui.marks = {}; ui.z = 1; ui.lock = Date.now() + 350;
            resetTimer(s.limitMs || MATCH.limit * 1000);
        }
    }

    /* ---------- render ---------- */
    function render() {
        if (view === "match") syncLocal();
        board.innerHTML = view === "menu" ? menuView() : view === "solo" ? soloView() : matchView();
        updateStatus();
        paintTimer();
    }
    function publish() {
        render();
        if (online && room.isHost) room.publishState(publicState(state)).catch(console.warn);
        botAct();
    }

    const stat = (l, v) => `<span>${l} <b>${v}</b></span>`;
    const timerStat = '<span>Waktu <b data-timer-txt>--</b></span>';
    function shell(stats, body, withTimer) {
        return `<div class="bd${ui.rulesOpen ? " show-rules" : ""}">
      <div class="bd-top"><span class="bd-brand">Border Desk</span><div class="bd-stats">${stats}${ui.cheated ? '<span style="color:var(--warn)">cheat aktif</span>' : ""}</div>
        <div class="bd-tools"><button class="bd-ghost" data-act="help" title="Cara bermain (H)">Bantuan</button><button class="bd-ghost${ui.cheat ? " on" : ""}" data-act="cheat" title="Cheat (C)">Cheat</button></div></div>
      ${withTimer ? '<div class="bd-timer"><i data-timer-bar></i></div>' : ""}
      ${body}${ui.help ? helpOverlay() : ""}${ui.cheat ? cheatOverlay() : ""}</div>`;
    }

    /* ---------- menu ---------- */
    function menuView() {
        const best = lsGet(META.bestKey);
        const seg = (act, items, cur) => items.map(([v, l]) => `<button class="bd-ghost${String(cur) === String(v) ? " on" : ""}" data-act="${act}" data-v="${v}">${l}</button>`).join("");
        return shell("", `<div class="bd-center"><div class="bd-sheet">
      <h3>Pilih mode</h3>
      <div class="bd-cards">
        <button class="bd-mode" data-act="start-solo"><b>Shift harian</b><span>Periksa pelamar, bayar biaya hidup, bertahan hari demi hari.${best ? ` Skor terbaik: ${esc(best)}.` : ""}</span></button>
        <button class="bd-mode" data-act="start-bot"><b>VS Bot</b><span>Bergantian jadi Inspektur dan Penyelundup. Siapa yang jalan duluan diundi.</span></button>
      </div>
      <div class="bd-seg"><span class="bd-muted">Ketelitian bot</span>${seg("set-diff", [["easy", "Rendah"], ["normal", "Sedang"], ["hard", "Tinggi"]], settings.diff)}</div>
      <div class="bd-seg"><span class="bd-muted">Jumlah ronde</span>${seg("set-rounds", [[2, "2"], [4, "4"], [6, "6"]], settings.rounds)}</div>
      <button class="bd-link" data-act="help">Cara bermain</button>
    </div></div>`);
    }

    /* ---------- komponen bersama ---------- */
    function rulesAside(rules, today, day) {
        return `<aside class="bd-rules"><div class="bd-date">Tanggal hari ini<b>${today}</b></div><h4>Buku aturan</h4><ul>${rules.map((r) =>
            `<li>${esc(r.textResolved)}${day && day > 1 && r.minDay === day ? ' <em class="bd-new">baru</em>' : ""}</li>`).join("")}</ul>
      <p class="bd-note">Klik kolom dokumen untuk menandainya.</p></aside>`;
    }
    const refsOf = (app) => (ui.hint && app.truth ? new Set(app.truth.refs.map((r) => r.doc + ":" + r.field)) : null);
    function fcls(doc, field, refs) {
        const k = doc + ":" + field;
        return (ui.marks[k] ? " mark" : "") + (refs && refs.has(k) ? " hint" : "");
    }
    function docHTML(app, key, refs, ghost) {
        const t = DOC_TYPES[key], d = app.docs[key], pos = ui.docs[key];
        const style = ghost ? "" : ` style="left:${pos?.x ?? 12}px;top:${pos?.y ?? 10}px;z-index:${pos?.z ?? 1}"`;
        const photo = t.photo ? `<div class="bd-photo${fcls(key, "face", refs)}" data-field="${key}:face">${faceSVG(d.face, 52)}</div>` : "";
        const rows = t.fields.map((f) => `<div class="bd-f${fcls(key, f.k, refs)}" data-field="${key}:${f.k}"><dt>${f.l}</dt><dd>${esc(d[f.k])}</dd></div>`).join("");
        return `<div class="bd-doc ${key}" data-doc="${key}"${style}><div class="bd-doc-h"><b>${t.title}</b><span>${t.issuer}</span></div><div class="bd-doc-b">${photo}<dl>${rows}</dl></div></div>`;
    }
    function deskHTML(app, label) {
        const keys = Object.keys(app.docs);
        const refs = refsOf(app);
        const tray = keys.map((k) => `<div class="bd-card${ui.docs[k] ? " on" : ""}" data-card="${k}" tabindex="0" role="button"><b>${DOC_TYPES[k].title}</b><small>${ui.docs[k] ? "di meja" : "seret ke meja"}</small></div>`).join("");
        const open = keys.filter((k) => ui.docs[k]).map((k) => docHTML(app, k, refs)).join("");
        return `<div class="bd-desk"><div class="bd-side"><div class="bd-booth"><div class="bd-person${fcls("person", "face", refs)}" data-field="person:face">${faceSVG(app.person.face, 92)}</div><div class="bd-ptag">${label}</div></div><div class="bd-tray">${tray}</div></div><div class="bd-table" data-table>${open}</div></div>`;
    }
    function padHTML(app) {
        const docs = Object.keys(app.docs).map((k, i) => `<button class="bd-ghost${ui.docs[k] ? " on" : ""}" data-act="toggle-doc" data-doc="${k}">${DOC_TYPES[k].title} <kbd>${i + 1}</kbd></button>`).join("");
        return `<div class="bd-pad"><div class="bd-pad-docs">${docs}<button class="bd-ghost" data-act="rules">Aturan <kbd>R</kbd></button></div>
      <div class="bd-pad-main"><button class="bd-btn deny" data-act="decide" data-d="deny">Tolak <kbd>D</kbd></button><button class="bd-btn approve" data-act="decide" data-d="approve">Setujui <kbd>A</kbd></button></div></div>`;
    }
    const fbHTML = (fb) => `<div class="bd-fb${fb ? (fb.ok ? " ok" : " bad") : ""}" role="status" aria-live="polite">${fb ? esc(fb.text) : "Periksa dokumen, cocokkan dengan aturan, lalu putuskan."}</div>`;
    function adviceHTML(app) {
        if (!ui.advice || !app?.truth) return "";
        return `<div class="bd-advice">Saran cheat: ${app.truth.bad ? "TOLAK — " + esc(app.truth.reasons.join(", ")) : "SETUJUI — semua aturan terpenuhi"}.</div>`;
    }

    /* ---------- SOLO ---------- */
    function startSolo() {
        solo = { phase: "brief", day: 1, money: START_MONEY, score: 0, plan: null, idx: 0, correct: 0, mistakes: 0, fb: null, report: null };
        prepDay();
        view = "solo";
        render();
    }
    function prepDay() {
        solo.plan = generateDay(solo.day, (Math.random() * 2 ** 31) | 0);
        solo.idx = 0; solo.correct = 0; solo.mistakes = 0; solo.fb = null; solo.report = null;
    }
    function beginDay() { solo.phase = "work"; solo.idx = 0; startApplicant(); }
    function startApplicant() {
        ui.docs = {}; ui.marks = {}; ui.z = 1; ui.lock = Date.now() + 350;
        resetTimer(solo.plan.timeLimit * 1000);
        render();
    }
    function soloResolve(d) {
        if (view !== "solo" || solo.phase !== "work") return;
        const app = solo.plan.apps[solo.idx];
        const bad = app.truth.bad;
        const ok = d !== "timeout" && (d === "deny") === bad;
        if (ok) {
            solo.correct++;
            solo.score += 10 + Math.floor(Math.max(0, ui.remaining) / 4000);
            solo.fb = { ok: true, text: bad ? `Benar. Ditolak: ${app.truth.reasons.join(", ")}.` : "Benar. Semua dokumen sah." };
        } else {
            solo.mistakes++;
            if (!ui.noPenalty) solo.score -= 15;
            solo.fb = { ok: false, text: d === "timeout" ? "Waktu habis." : bad ? `Salah. Seharusnya ditolak: ${app.truth.reasons.join(", ")}.` : "Salah. Dokumen sah, seharusnya disetujui." };
        }
        solo.idx++;
        if (solo.idx >= solo.plan.apps.length) endDay();
        else startApplicant();
    }
    function endDay() {
        const p = solo.plan;
        const wage = solo.correct * p.pay;
        const penalty = ui.noPenalty ? 0 : solo.mistakes * MISTAKE_FINE;
        const bonus = solo.mistakes === 0 ? PERFECT_BONUS : 0;
        const net = wage - penalty + bonus - p.expenses;
        solo.money += net;
        solo.report = { wage, penalty, bonus, expenses: p.expenses, net };
        if (solo.money < 0) {
            solo.phase = "over";
            if (!ui.cheated) { const best = +lsGet(META.bestKey) || 0; if (solo.score > best) lsSet(META.bestKey, String(solo.score)); }
        } else {
            solo.score += 20 * solo.day;
            solo.phase = "dayEnd";
        }
        render();
    }
    function soloView() {
        const s = solo, p = s.plan;
        let stats = stat("Hari", s.day) + stat("Kredit", s.money) + stat("Skor", s.score);
        let body = "";
        if (s.phase === "work") {
            stats += stat("Salah", s.mistakes) + timerStat;
            const app = p.apps[s.idx];
            body = `<div class="bd-main">${rulesAside(p.rules, p.today, s.day)}${deskHTML(app, `Pelamar ${s.idx + 1}/${p.apps.length}`)}</div>${padHTML(app)}${fbHTML(s.fb)}${adviceHTML(app)}`;
        } else if (s.phase === "brief") {
            body = `<div class="bd-center"><div class="bd-sheet"><h3>Hari ${s.day}</h3><p class="bd-muted">${p.today}</p>
        <h4>Aturan hari ini</h4><ul style="margin:0;padding-left:18px">${p.rules.map((r) => `<li>${esc(r.textResolved)}${r.minDay === s.day && s.day > 1 ? ' <em class="bd-new">baru</em>' : ""}</li>`).join("")}</ul>
        <dl class="bd-kv"><div><dt>Pelamar</dt><dd>${p.apps.length}</dd></div><div><dt>Waktu per pelamar</dt><dd>${p.timeLimit} dtk</dd></div><div><dt>Upah per keputusan benar</dt><dd>${p.pay}</dd></div><div><dt>Denda per kesalahan</dt><dd>${MISTAKE_FINE}</dd></div><div><dt>Biaya hidup hari ini</dt><dd>${p.expenses}</dd></div></dl>
        <button class="bd-primary" data-act="begin-day">Mulai shift <kbd>Spasi</kbd></button></div></div>`;
        } else {
            const r = s.report, over = s.phase === "over";
            body = `<div class="bd-center"><div class="bd-sheet"><h3>${over ? "Kredit habis — permainan berakhir" : `Hari ${s.day} selesai`}</h3>
        <dl class="bd-kv"><div><dt>Keputusan benar</dt><dd>${s.correct}</dd></div><div><dt>Kesalahan</dt><dd>${s.mistakes}</dd></div><div><dt>Upah</dt><dd>${signed(r.wage)}</dd></div><div><dt>Denda</dt><dd>${signed(-r.penalty)}</dd></div><div><dt>Bonus tanpa salah</dt><dd>${signed(r.bonus)}</dd></div><div><dt>Biaya hidup</dt><dd>${signed(-r.expenses)}</dd></div><div class="tot"><dt>Saldo kredit</dt><dd>${s.money} (${signed(r.net)})</dd></div></dl>
        <p class="bd-muted">Skor: ${s.score}${over ? ` · Bertahan ${s.day - 1} hari` : ""}</p>
        ${over ? '<div class="bd-seg"><button class="bd-primary" data-act="start-solo">Main lagi</button><button class="bd-ghost" data-act="to-menu">Menu</button></div>'
                    : '<button class="bd-primary" data-act="next-day">Hari berikutnya <kbd>Spasi</kbd></button>'}</div></div>`;
        }
        return shell(stats, body, s.phase === "work");
    }

    /* ---------- MATCH (VS Bot & Online) ---------- */
    function startBot() {
        state = newMatch({ rounds: settings.rounds, diff: settings.diff });
        bot.thorough = BOT_LEVELS[settings.diff]; bot.seen = bot.caught = bot.missed = 0;
        botKey = null; view = "match";
        publish();
    }

    function matchApply(a, actor, internal = false) {
        const s = state;
        if (!s || s.kind !== "match" || !a) return;
        const ins = inspectorOf(s), smu = 1 - ins;
        if (a.t === "plan") {
            if (s.phase !== "plan" || actor !== smu || !Array.isArray(a.flaws) || a.flaws.length !== MATCH.count) return;
            const ids = new Set(s.rules.map((r) => r.id));
            const flaws = a.flaws.map((f) => (ids.has(f) ? f : ""));
            const n = flaws.filter(Boolean).length;
            if (n < 1 || n > MATCH.maxFlaws) return;
            const rng = mulberry32(s.seed + s.round * 977 + 13);
            const ctx = { day: MATCH.day, today: s.today, rules: s.rules };
            s.apps = flaws.map((f) => genChecked(rng, ctx, f ? [f] : [], a.subtle === true ? true : a.subtle === false ? false : rng() < 0.35));
            s.phase = "inspect"; s.idx = 0; s.results = []; s.last = null;
            return publish();
        }
        if (a.t === "decide" || a.t === "timeout") {
            if (s.phase !== "inspect") return;
            if (a.t === "timeout" && !internal) return;
            if (a.t === "decide" && (actor !== ins || a.i !== s.idx || !["approve", "deny"].includes(a.d))) return;
            return matchResolve(a.t === "timeout" ? "timeout" : a.d);
        }
        if (a.t === "ack") {
            if (s.phase !== "roundEnd") return;
            s.ack[actor] = true;
            if (s.ack[0] && s.ack[1]) {
                s.round++; s.ack = [false, false]; s.apps = []; s.results = []; s.last = null; s.idx = 0;
                s.phase = s.round >= s.rounds ? "final" : "plan";
            }
            return publish();
        }
        if (a.t === "rematch") {
            if (s.phase !== "final" || (online && actor !== 0)) return;
            state = newMatch({ rounds: s.rounds, diff: s.diff });
            if (!online) { bot.thorough = BOT_LEVELS[state.diff]; bot.seen = bot.caught = bot.missed = 0; }
            botKey = null;
            return publish();
        }
    }

    function matchResolve(d) {
        const s = state, ins = inspectorOf(s), smu = 1 - ins;
        const app = s.apps[s.idx], bad = app.truth.bad;
        let i = 0, m = 0;
        if (d === "timeout") i = -10;
        else if (bad && d === "deny") { i = 10; m = -5; }
        else if (bad) { i = -20; m = 20; }
        else if (d === "approve") i = 5;
        else { i = -10; m = 5; }
        s.scores[ins] += i; s.scores[smu] += m;
        const res = { i: s.idx, d, bad, reasons: app.truth.reasons, ins: i, smu: m };
        s.results.push(res); s.last = res; app.revealed = true;
        if (bad && !online) { // bot belajar dari hasil
            bot.seen++;
            if (d === "deny") bot.caught++; else bot.missed++;
            if (ins === 1 && d !== "deny") bot.thorough = Math.min(0.98, bot.thorough + 0.03);
        }
        s.idx++;
        if (s.idx >= s.apps.length) { s.phase = "roundEnd"; s.ack = [false, false]; }
        publish();
    }

    /* ---------- AI bot ---------- */
    function botPlanFlaws() {
        const s = state;
        const catchRate = bot.seen ? bot.caught / bot.seen : 0.5;
        const k = clamp(Math.round(1 + 2 * (1 - catchRate)), 1, MATCH.maxFlaws); // makin sering tertangkap → makin sedikit
        const subtle = catchRate > 0.55;                                          // ...dan makin halus
        const slots = shuffle(Math.random, [...Array(MATCH.count).keys()]).slice(0, k);
        const flaws = Array(MATCH.count).fill("");
        for (const i of slots) {
            const bag = s.rules.flatMap((r) => Array(subtle ? r.level : 1).fill(r.id));
            flaws[i] = pick(Math.random, bag);
        }
        return { flaws, subtle };
    }
    function botDecide(app) {
        const th = bot.thorough;
        if (app.truth.bad) {
            const hit = app.truth.ids.some((id) => {
                const lvl = ruleById(state.rules, id)?.level || 1;
                return Math.random() < th * (1 - 0.12 * (lvl - 1)) * (app.truth.subtle ? 0.85 : 1);
            });
            return hit ? "deny" : "approve";
        }
        return Math.random() < 0.03 + (1 - th) * 0.07 ? "deny" : "approve";
    }
    function botAct() {
        if (online || view !== "match" || !state) return;
        const s = state;
        const key = `${s.seed}:${s.round}:${s.phase}:${s.idx}:${s.ack}`;
        if (key === botKey) return;
        botKey = key;
        if (s.phase === "plan" && smugglerOf(s) === 1) {
            later(() => { const p = botPlanFlaws(); matchApply({ t: "plan", flaws: p.flaws, subtle: p.subtle }, 1); }, 1200 + Math.random() * 1000);
        } else if (s.phase === "inspect" && inspectorOf(s) === 1) {
            const i = s.idx;
            later(() => { if (state === s && s.phase === "inspect" && s.idx === i) matchApply({ t: "decide", i, d: botDecide(s.apps[i]) }, 1); }, 1400 + Math.random() * 1800);
        } else if (s.phase === "roundEnd" && !s.ack[1]) {
            later(() => matchApply({ t: "ack" }, 1), 700);
        }
    }

    /* ---------- tampilan match ---------- */
    function lastFb(r) {
        if (!r) return null;
        if (r.d === "timeout") return { ok: false, text: `Waktu habis (${signed(r.ins)}).` };
        return { ok: r.ins > 0, text: `${r.ins > 0 ? "Benar" : "Salah"} (${signed(r.ins)}). ${r.bad ? "Pelanggaran: " + (r.reasons || []).join(", ") + "." : "Dokumen sah."}` };
    }
    function planHTML(s, aside) {
        const n = ui.planDraft.filter(Boolean).length;
        if (ui.planSent) return waitHTML("Rencana terkirim. Gerbang sedang dibuka…", aside);
        const slots = ui.planDraft.map((v, i) => `<label class="bd-slot"><span>Pelamar ${i + 1}</span><select data-slot="${i}"><option value="">Bersih</option>${s.rules.map((r) => `<option value="${r.id}"${v === r.id ? " selected" : ""}>${esc(r.flaw)}</option>`).join("")}</select></label>`).join("");
        return `<div class="bd-plan">${aside}<div class="bd-plan-body"><h3>Giliranmu menyelundup</h3>
      <p class="bd-muted">Pilih pelamar yang membawa dokumen cacat (1–${MATCH.maxFlaws}). Inspektur harus menemukannya. Lolos +20, tertangkap −5.</p>
      <div class="bd-slots">${slots}</div>
      <div class="bd-plan-foot"><span class="bd-muted${n > MATCH.maxFlaws || ui.planMsg ? " err" : ""}" data-plan-count>${ui.planMsg || `Pemalsuan ${n}/${MATCH.maxFlaws}`}</span>
        <button class="bd-ghost" data-act="plan-random">Acak <kbd>G</kbd></button><button class="bd-primary" data-act="plan-send">Kirim ke gerbang <kbd>S</kbd></button></div></div></div>`;
    }
    const waitHTML = (msg, aside) => `<div class="bd-plan">${aside}<div class="bd-plan-body"><h3>${esc(msg)}</h3><p class="bd-muted">Pelajari buku aturan sambil menunggu.</p></div></div>`;
    function feedHTML(s, aside) {
        const rows = s.apps.map((a, i) => {
            const r = (s.results || [])[i];
            const mine = ui.myPlan ? ui.myPlan[i] : undefined;
            const label = mine !== undefined ? (mine ? flawLabel(mine) : "Bersih") : r ? (r.bad ? (r.reasons || []).join(", ") : "Bersih") : "…";
            const status = r ? (r.d === "timeout" ? "Waktu habis" : r.d === "approve" ? "Disetujui" : "Ditolak") : i === s.idx ? "Diperiksa" : "Menunggu";
            return `<li class="${r ? (r.smu > 0 ? "ok" : r.smu < 0 ? "bad" : "") : ""}"><span>#${i + 1}</span><span>${esc(label)}</span><b>${status}</b><em>${r ? signed(r.smu) : ""}</em></li>`;
        }).join("");
        return `<div class="bd-plan">${aside}<div class="bd-plan-body"><h3>Inspektur sedang bekerja</h3><ul class="bd-feed">${rows}</ul></div></div>`;
    }
    function roundEndHTML(s) {
        const ins = inspectorOf(s);
        const rows = (s.results || []).map((r) => `<li class="${r.smu > 0 ? "ok" : r.smu < 0 ? "bad" : ""}"><span>#${r.i + 1}</span><span>${r.bad ? esc((r.reasons || []).join(", ")) : "Bersih"}</span><b>${r.d === "timeout" ? "Waktu habis" : r.d === "approve" ? "Disetujui" : "Ditolak"}</b><em>${signed(me === ins ? r.ins : r.smu)}</em></li>`).join("");
        const last = s.round + 1 >= s.rounds;
        return `<div class="bd-center"><div class="bd-sheet"><h3>Ronde ${s.round + 1} selesai</h3>
      <ul class="bd-feed">${rows}</ul>
      <p>Skor — Kamu <b>${s.scores[me]}</b> · ${esc(opName())} <b>${s.scores[1 - me]}</b></p>
      ${s.ack[me] ? '<p class="bd-muted">Menunggu lawan…</p>' : `<button class="bd-primary" data-act="ack">${last ? "Lihat hasil akhir" : "Ronde berikutnya"} <kbd>Spasi</kbd></button>`}</div></div>`;
    }
    function finalHTML(s) {
        const a = s.scores[me], b = s.scores[1 - me];
        const t = a > b ? "Kamu menang" : a < b ? `${esc(opName())} menang` : "Seri";
        const again = !online || room.isHost ? '<button class="bd-primary" data-act="rematch">Main lagi</button>' : '<p class="bd-muted">Menunggu host memulai ulang…</p>';
        return `<div class="bd-center"><div class="bd-sheet"><h3>${t}</h3>
      <dl class="bd-kv"><div><dt>Kamu</dt><dd>${a}</dd></div><div><dt>${esc(opName())}</dt><dd>${b}</dd></div></dl>
      <div class="bd-seg">${again}${online ? "" : '<button class="bd-ghost" data-act="to-menu">Menu</button>'}</div></div></div>`;
    }
    const bannerOpen = () => view === "match" && state && state.round === 0 && state.phase === "plan" && !ui.bannerSeen;
    function bannerHTML(s) {
        const mineIns = inspectorOf(s) === me;
        return `<div class="bd-ov"><div class="bd-panel"><h3>Undian peran</h3>
      <p>Ronde 1: kamu menjadi <b>${mineIns ? "Inspektur" : "Penyelundup"}</b>. ${mineIns ? `${esc(opName())} jalan duluan menyiapkan pelamar, lalu kamu memeriksanya.` : "Kamu jalan duluan: siapkan pelamar, lalu Inspektur memeriksanya."}</p>
      <p class="bd-muted">Peran bertukar setiap ronde. Skor tertinggi setelah ${s.rounds} ronde menang.</p>
      <button class="bd-primary" data-act="banner-ok">Mulai <kbd>Spasi</kbd></button></div></div>`;
    }
    function matchView() {
        const s = state;
        if (!s) return shell("", '<div class="bd-center"><div class="bd-sheet"><p>Menunggu host menyiapkan pertandingan…</p></div></div>');
        const meIns = inspectorOf(s) === me;
        let stats = stat("Ronde", `${Math.min(s.round + 1, s.rounds)}/${s.rounds}`) + stat("Peran", s.phase === "final" ? "-" : meIns ? "Inspektur" : "Penyelundup") + stat("Kamu", s.scores[me]) + stat(esc(opName()), s.scores[1 - me]);
        const aside = rulesAside(s.rules, s.today, null);
        let body = "";
        const withTimer = s.phase === "inspect" && meIns;
        if (s.phase === "plan") body = !meIns ? planHTML(s, aside) : waitHTML("Penyelundup sedang menyiapkan pelamar…", aside);
        else if (s.phase === "inspect") {
            if (meIns) {
                stats += timerStat;
                const app = s.apps[s.idx];
                body = `<div class="bd-main">${aside}${deskHTML(app, `Pelamar ${s.idx + 1}/${s.apps.length}`)}</div>${padHTML(app)}${fbHTML(lastFb(s.last))}${adviceHTML(app)}`;
            } else body = feedHTML(s, aside);
        } else if (s.phase === "roundEnd") body = roundEndHTML(s);
        else body = finalHTML(s);
        if (bannerOpen()) body += bannerHTML(s);
        return shell(stats, body, withTimer);
    }

    /* ---------- overlay bantuan & cheat ---------- */
    function helpOverlay() {
        return `<div class="bd-ov"><div class="bd-panel" role="dialog" aria-label="Cara bermain"><h3>Cara bermain</h3>
      <h4>Tujuan</h4><p>Kamu penjaga gerbang negara Brevia. Putuskan siapa boleh masuk berdasarkan buku aturan hari ini.</p>
      <h4>Sebagai Inspektur</h4>
      <ul><li>Seret dokumen dari rak kiri ke meja agar terbuka. Seret keluar meja untuk menutupnya.</li>
        <li>Klik kolom dokumen atau foto untuk menandainya saat membandingkan.</li>
        <li><b>Setujui</b> hanya bila semua aturan terpenuhi. Jika ada satu saja pelanggaran, <b>Tolak</b>.</li>
        <li>Perhatikan tanggal hari ini, wajah pemohon, dan dokumen yang tidak ada.</li></ul>
      <h4>Mode Shift harian</h4>
      <p>Tiap keputusan benar menambah upah, tiap kesalahan didenda, dan biaya hidup dipotong di akhir hari. Kredit di bawah 0 berarti permainan berakhir. Aturan bertambah dan waktu makin ketat setiap hari. Level dibuat acak tetapi selalu bisa diselesaikan.</p>
      <h4>Mode VS (Bot atau Online)</h4>
      <ul><li>Peran bertukar tiap ronde; siapa yang mulai lebih dulu diundi.</li>
        <li><b>Penyelundup</b> memilih 1–3 dari 5 pelamar untuk dipalsukan. Lolos +20, tertangkap −5.</li>
        <li><b>Inspektur</b>: benar menolak +10, benar menyetujui +5, meloloskan pemalsu −20, salah menolak −10.</li></ul>
      <h4>Kontrol</h4>
      <ul><li>Mouse: seret dokumen, klik tombol dan kolom.</li>
        <li>Keyboard: <kbd>A</kbd> setujui · <kbd>D</kbd> tolak · <kbd>1</kbd>–<kbd>4</kbd> buka/tutup dokumen · <kbd>R</kbd> aturan · <kbd>S</kbd> kirim rencana · <kbd>G</kbd> acak · <kbd>Spasi</kbd> lanjut · <kbd>H</kbd> bantuan · <kbd>C</kbd> cheat · <kbd>Esc</kbd> tutup.</li>
        <li>Layar sentuh: seret dokumen atau pakai tombol besar di bagian bawah.</li></ul>
      <button class="bd-primary" data-act="help-close">Mengerti</button></div></div>`;
    }
    function cheatOverlay() {
        const close = '<button class="bd-primary" data-act="cheat">Tutup</button>';
        if (online) return `<div class="bd-ov"><div class="bd-panel"><h3>Cheat</h3><p class="bd-muted">Cheat dinonaktifkan di multiplayer agar adil.</p>${close}</div></div>`;
        const t = (act, label, on) => `<button class="bd-ghost${on ? " on" : ""}" data-act="${act}">${label}</button>`;
        const inSolo = view === "solo" && solo?.phase === "work";
        const inInspect = view === "match" && state?.phase === "inspect" && inspectorOf(state) === me;
        const inPlan = view === "match" && state?.phase === "plan" && smugglerOf(state) === me;
        let list = "";
        if (inSolo || inInspect) {
            list += t("c-time", "+15 detik") + t("c-freeze", "Bekukan timer", ui.freeze) + t("c-hint", "Sorot petunjuk", ui.hint) + t("c-advice", "Tampilkan saran", ui.advice) + t("c-auto", "Putuskan otomatis");
        }
        if (inSolo) list += t("c-money", "+100 kredit") + t("c-nopen", "Tanpa denda", ui.noPenalty) + t("c-skip", "Lewati hari");
        if (view === "match") {
            list += t("c-points", "+50 skor") + t("c-weakbot", "Bot lengah") + t("c-botinfo", "Intip bot");
            if (inPlan) list += t("c-autoplan", "Isi rencana otomatis");
        }
        if (!list) list = '<p class="bd-muted">Tidak ada cheat untuk layar ini.</p>';
        const info = ui.botInfo && view === "match" ? `<p class="bd-muted">Ketelitian bot ${Math.round(bot.thorough * 100)}% · tertangkap ${bot.caught}, lolos ${bot.missed}.</p>` : "";
        return `<div class="bd-ov"><div class="bd-panel" role="dialog" aria-label="Cheat"><h3>Cheat</h3><p class="bd-muted">Dipakai untuk mencoba permainan. Skor terbaik tidak disimpan saat cheat aktif.</p><div class="bd-cheats">${list}</div>${info}${close}</div></div>`;
    }

    /* ---------- aksi ---------- */
    function submitAction(action) {
        if (online && !room.isHost) { room.sendAction(action).catch(console.warn); return; }
        applyAction(action, playerIndex);
    }
    function applyAction(action, actor) {
        if (!action || typeof action !== "object") return;
        if (state?.kind === "match") matchApply(action, actor);
    }
    const currentApp = () => (view === "solo" && solo?.phase === "work" ? solo.plan.apps[solo.idx] : view === "match" && state?.phase === "inspect" ? state.apps[state.idx] : null);
    const canInspect = () => (view === "solo" && solo?.phase === "work") || (view === "match" && state?.phase === "inspect" && inspectorOf(state) === me);
    const canPlan = () => view === "match" && state?.phase === "plan" && smugglerOf(state) === me && !ui.planSent && !bannerOpen();

    function decideNow(d) {
        if (view === "solo") soloResolve(d);
        else if (view === "match" && canInspect()) submitAction({ t: "decide", i: state.idx, d });
    }
    function decide(d) {
        if (!canInspect() || Date.now() < ui.lock) return;
        decideNow(d);
    }
    function openDoc(key) {
        const table = board.querySelector("[data-table]");
        const w = table ? table.getBoundingClientRect().width : 400;
        const n = Object.keys(ui.docs).length;
        ui.docs[key] = { x: Math.max(0, Math.min(12 + n * 36, w - 236)), y: 10 + n * 30, z: ++ui.z };
        render();
    }
    function toggleDoc(key) { if (ui.docs[key]) { delete ui.docs[key]; render(); } else openDoc(key); }
    function toggleDocIdx(i) { const app = currentApp(); const k = app && Object.keys(app.docs)[i]; if (k) toggleDoc(k); }

    function sendPlan() {
        const n = ui.planDraft.filter(Boolean).length;
        if (n < 1 || n > MATCH.maxFlaws) { ui.planMsg = `Pilih 1–${MATCH.maxFlaws} pelamar untuk dipalsukan.`; render(); return; }
        ui.myPlan = ui.planDraft.slice(); ui.planSent = true; ui.planMsg = "";
        render();
        submitAction({ t: "plan", flaws: ui.planDraft.slice() });
    }
    function randomPlan() {
        const k = 1 + Math.floor(Math.random() * MATCH.maxFlaws);
        const slots = shuffle(Math.random, [...Array(MATCH.count).keys()]).slice(0, k);
        ui.planDraft = Array(MATCH.count).fill("");
        slots.forEach((i) => { ui.planDraft[i] = pick(Math.random, state.rules).id; });
        ui.planMsg = "";
        render();
    }

    function primaryAction() {
        if (ui.help) return () => doAct("help-close", {});
        if (bannerOpen()) return () => doAct("banner-ok", {});
        if (view === "solo") {
            if (solo.phase === "brief") return beginDay;
            if (solo.phase === "dayEnd") return () => doAct("next-day", {});
        }
        if (view === "match" && state) {
            if (state.phase === "roundEnd" && !state.ack[me]) return () => submitAction({ t: "ack" });
        }
        return null;
    }

    function doAct(act, d) {
        switch (act) {
            case "help": ui.help = !ui.help; ui.cheat = false; if (!ui.help) lsSet(SEEN_KEY, "1"); return render();
            case "help-close": ui.help = false; lsSet(SEEN_KEY, "1"); return render();
            case "cheat": ui.cheat = !ui.cheat; ui.help = false; return render();
            case "banner-ok": ui.bannerSeen = true; return render();
            case "start-solo": ui.cheated = false; ui.hint = ui.advice = ui.freeze = ui.noPenalty = false; return startSolo();
            case "start-bot": ui.cheated = false; ui.hint = ui.advice = ui.freeze = false; return startBot();
            case "set-diff": settings.diff = d.v; return render();
            case "set-rounds": settings.rounds = +d.v; return render();
            case "to-menu": view = "menu"; state = null; solo = null; timers.forEach(clearTimeout); timers.clear(); botKey = null; return render();
            case "begin-day": return beginDay();
            case "next-day": solo.day++; prepDay(); solo.phase = "brief"; return render();
            case "decide": return decide(d.d);
            case "toggle-doc": return toggleDoc(d.doc);
            case "rules": ui.rulesOpen = !ui.rulesOpen; return render();
            case "plan-send": return sendPlan();
            case "plan-random": return randomPlan();
            case "ack": return submitAction({ t: "ack" });
            case "rematch": return submitAction({ t: "rematch" });
            default:
                if (act.startsWith("c-")) return doCheat(act);
        }
    }

    function doCheat(act) {
        if (online) return;
        ui.cheated = true;
        switch (act) {
            case "c-time": ui.remaining += 15000; ui.total = Math.max(ui.total, ui.remaining); ui.timeoutFired = false; break;
            case "c-freeze": ui.freeze = !ui.freeze; break;
            case "c-hint": ui.hint = !ui.hint; break;
            case "c-advice": ui.advice = !ui.advice; break;
            case "c-auto": { const a = currentApp(); if (a?.truth) { ui.cheat = false; return decideNow(a.truth.bad ? "deny" : "approve"); } break; }
            case "c-money": if (solo) solo.money += 100; break;
            case "c-nopen": ui.noPenalty = !ui.noPenalty; break;
            case "c-skip":
                if (solo?.phase === "work") { const rem = solo.plan.apps.length - solo.idx; solo.correct += rem; solo.score += rem * 10; solo.idx = solo.plan.apps.length; ui.cheat = false; return endDay(); }
                break;
            case "c-points": if (state) { state.scores[me] += 50; return publish(); } break;
            case "c-weakbot": bot.thorough = 0.25; break;
            case "c-botinfo": ui.botInfo = !ui.botInfo; break;
            case "c-autoplan": {
                const hard = [...state.rules].sort((a, b) => b.level - a.level).slice(0, MATCH.maxFlaws);
                const slots = shuffle(Math.random, [...Array(MATCH.count).keys()]).slice(0, hard.length);
                ui.planDraft = Array(MATCH.count).fill("");
                slots.forEach((s, i) => { ui.planDraft[s] = hard[i].id; });
                break;
            }
            default: break;
        }
        render();
    }

    /* ---------- event: klik, ganti pilihan, keyboard, drag ---------- */
    function handleClick(event) {
        if (event.target.closest("[data-exit]")) { onExit(); return; }
        if (Date.now() < ui.justDragged) return;
        const actEl = event.target.closest("[data-act]");
        if (actEl) { doAct(actEl.dataset.act, actEl.dataset); return; }
        const f = event.target.closest("[data-field]");
        if (f) {
            const k = f.dataset.field;
            ui.marks[k] = !ui.marks[k];
            f.classList.toggle("mark", !!ui.marks[k]);
        }
    }
    function handleChange(e) {
        const sel = e.target.closest?.("[data-slot]");
        if (!sel) return;
        const i = +sel.dataset.slot;
        ui.planDraft[i] = sel.value;
        const n = ui.planDraft.filter(Boolean).length;
        if (n > MATCH.maxFlaws) { ui.planDraft[i] = ""; sel.value = ""; ui.planMsg = `Maksimal ${MATCH.maxFlaws} pemalsuan.`; }
        else ui.planMsg = "";
        const c = board.querySelector("[data-plan-count]");
        if (c) { c.textContent = ui.planMsg || `Pemalsuan ${ui.planDraft.filter(Boolean).length}/${MATCH.maxFlaws}`; c.classList.toggle("err", !!ui.planMsg); }
    }
    function onKey(e) {
        if (!root.isConnected || e.ctrlKey || e.metaKey || e.altKey) return;
        const t = e.target;
        const tag = t?.tagName || "";
        const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
        if (k === "Escape") { if (ui.help || ui.cheat || ui.rulesOpen) { ui.help = ui.cheat = ui.rulesOpen = false; render(); } return; }
        if (/^(INPUT|TEXTAREA|SELECT)$/.test(tag)) return;
        if (t?.dataset?.card !== undefined && (k === "Enter" || k === " ")) { e.preventDefault(); toggleDoc(t.dataset.card); return; }
        if (k === "h" || k === "?") { doAct("help", {}); return; }
        if (k === "c") { doAct("cheat", {}); return; }
        if ((k === " " || k === "Enter") && tag !== "BUTTON") {
            const p = primaryAction();
            if (p) { e.preventDefault(); p(); return; }
        }
        if (ui.help || ui.cheat || bannerOpen()) return;
        if (k === "r") { ui.rulesOpen = !ui.rulesOpen; render(); return; }
        if (canInspect()) {
            if (k === "a") decide("approve");
            else if (k === "d") decide("deny");
            else if (/^[1-4]$/.test(k)) toggleDocIdx(+k - 1);
        } else if (canPlan()) {
            if (k === "s") sendPlan();
            else if (k === "g") randomPlan();
        }
    }

    const inside = (x, y, r) => x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
    function onPointerDown(e) {
        if ((e.button !== undefined && e.button > 0) || ui.help || ui.cheat) return;
        const table = board.querySelector("[data-table]");
        if (!table) return;
        const open = e.target.closest("[data-doc]");
        const card = !open && e.target.closest("[data-card]");
        if (!open && !card) return;
        const el = open || card;
        drag = { key: el.dataset.doc || el.dataset.card, fromCard: !!card, el: open || null, sx: e.clientX, sy: e.clientY, moved: false, rect: table.getBoundingClientRect(), ox: open ? parseFloat(open.style.left) || 0 : 0, oy: open ? parseFloat(open.style.top) || 0 : 0 };
        if (open) { ui.docs[drag.key].z = ++ui.z; open.style.zIndex = ui.z; }
        document.addEventListener("pointermove", onPointerMove);
        document.addEventListener("pointerup", onPointerUp);
        document.addEventListener("pointercancel", onPointerUp);
    }
    function onPointerMove(e) {
        if (!drag) return;
        const dx = e.clientX - drag.sx, dy = e.clientY - drag.sy;
        if (!drag.moved) {
            if (Math.hypot(dx, dy) < 5) return;
            drag.moved = true;
            if (drag.fromCard) {
                const app = currentApp();
                if (!app) { drag = null; return; }
                const tmp = document.createElement("div");
                tmp.innerHTML = docHTML(app, drag.key, null, true);
                drag.el = tmp.firstElementChild;
                drag.el.classList.add("bd-ghostdoc");
                board.querySelector(".bd").appendChild(drag.el);
            }
        }
        if (drag.fromCard) {
            drag.el.style.left = e.clientX - 114 + "px";
            drag.el.style.top = e.clientY - 20 + "px";
        } else {
            const r = drag.rect;
            drag.el.style.left = clamp(drag.ox + dx, -20, r.width - 70) + "px";
            drag.el.style.top = clamp(drag.oy + dy, -10, r.height - 40) + "px";
            drag.el.classList.toggle("out", !inside(e.clientX, e.clientY, r));
        }
        if (e.cancelable) e.preventDefault();
    }
    function onPointerUp(e) {
        document.removeEventListener("pointermove", onPointerMove);
        document.removeEventListener("pointerup", onPointerUp);
        document.removeEventListener("pointercancel", onPointerUp);
        const d = drag; drag = null;
        if (!d) return;
        if (!d.moved) { if (d.fromCard && e.type !== "pointercancel") toggleDoc(d.key); return; }
        ui.justDragged = Date.now() + 120;
        const ok = e.type !== "pointercancel" && inside(e.clientX, e.clientY, d.rect);
        if (d.fromCard) {
            d.el?.remove();
            if (ok) ui.docs[d.key] = { x: clamp(e.clientX - d.rect.left - 114, 0, Math.max(0, d.rect.width - 232)), y: clamp(e.clientY - d.rect.top - 20, 0, Math.max(0, d.rect.height - 120)), z: ++ui.z };
            render();
        } else if (ok) {
            ui.docs[d.key].x = parseFloat(d.el.style.left) || 0;
            ui.docs[d.key].y = parseFloat(d.el.style.top) || 0;
            d.el.classList.remove("out");
        } else { delete ui.docs[d.key]; render(); }
    }

    root.addEventListener("click", handleClick);
    root.addEventListener("change", handleChange);
    root.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKey);

    /* ---------- inisialisasi (pola template) ---------- */
    if (online) {
        room.onRoom((nextRoom) => { roomData = nextRoom; render(); });
        if (room.isHost) {
            state = newMatch({ rounds: 4, diff: "normal" });
            publish();
            room.onAction((action) => applyAction(action, 1));
        } else {
            render();
            room.onState((nextState) => { state = nextState; render(); });
        }
    } else {
        render(); // menu: pilih Shift harian atau VS Bot (AI lokal, tanpa room/database)
    }

    return {
        destroy() {
            root.removeEventListener("click", handleClick);
            root.removeEventListener("change", handleChange);
            root.removeEventListener("pointerdown", onPointerDown);
            document.removeEventListener("keydown", onKey);
            document.removeEventListener("pointermove", onPointerMove);
            document.removeEventListener("pointerup", onPointerUp);
            document.removeEventListener("pointercancel", onPointerUp);
            clearInterval(tickId);
            timers.forEach(clearTimeout);
            timers.clear();
        },
    };
}