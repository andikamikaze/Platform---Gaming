/* ============================================================
 * drag-strip.js — Drag Strip (template META + mount)
 * 2D side-scrolling quarter-mile drag race, best of 3.
 * Mode: vs bot (AI) atau multiplayer room (host-authoritative).
 * Kontrol: Spasi / klik / tap area permainan (tanpa tombol virtual).
 * ============================================================ */

export const META = {
    id: "drag-strip",
    name: "Drag Strip",
    category: "racing",
    catLabel: "Racing",
    desc: "Drag race 2D side-scrolling seperempat mil, best of 3, dengan pilihan kendaraan.",
    art: '<svg viewBox="0 0 48 48" width="54" height="54" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 36h40"/><path d="M7 30l4-9h13l6 7h11l3 3v5H7z"/><circle cx="15" cy="36" r="3.5"/><circle cx="36" cy="36" r="3.5"/><path d="M6 14h7M3 20h7"/></svg>',
    bg: ["#e5e7eb", "#94a3b8"],
    bestKey: "dragStripBestEt",
};

/* ---------- data kendaraan (spesifikasi berbeda-beda) ---------- */
const VEHICLES = [
    {
        id: "sedan", name: "Street Sedan", tag: "Seimbang", color: "#3b82f6", body: "sedan",
        gears: 4, base: 9.10, top: 138, launch: 0.40, drop: 0.62, rise: [0.85, 0.55, 0.38, 0.26],
        band: [0.78, 0.88], green: [0.70, 0.92], pen: { good: 0.08, late: 0.25, bog: 0.40 }
    },
    {
        id: "muscle", name: "Muscle V8", tag: "Tenaga besar", color: "#ef4444", body: "muscle",
        gears: 4, base: 8.95, top: 152, launch: 0.45, drop: 0.58, rise: [1.05, 0.70, 0.50, 0.36],
        band: [0.80, 0.87], green: [0.72, 0.91], pen: { good: 0.10, late: 0.30, bog: 0.50 }
    },
    {
        id: "hatch", name: "Turbo Hatch", tag: "Mudah dikontrol", color: "#10b981", body: "hatch",
        gears: 5, base: 9.20, top: 141, launch: 0.40, drop: 0.66, rise: [0.95, 0.68, 0.50, 0.38, 0.30],
        band: [0.74, 0.90], green: [0.66, 0.94], pen: { good: 0.06, late: 0.18, bog: 0.30 }
    },
    {
        id: "dragster", name: "Dragster", tag: "Ekstrem, sulit", color: "#f59e0b", body: "dragster",
        gears: 3, base: 8.90, top: 168, launch: 0.50, drop: 0.55, rise: [1.30, 0.85, 0.55],
        band: [0.82, 0.875], green: [0.76, 0.90], pen: { good: 0.12, late: 0.35, bog: 0.60 }
    },
    {
        id: "ev", name: "EV Sprint", tag: "Torsi instan", color: "#8b5cf6", body: "ev",
        gears: 2, base: 9.05, top: 146, launch: 0.55, drop: 0.70, rise: [0.60, 0.34],
        band: [0.76, 0.90], green: [0.68, 0.94], pen: { good: 0.07, late: 0.22, bog: 0.35 }
    },
    {
        id: "roadster", name: "Roadster 60s", tag: "Santai, lambat", color: "#64748b", body: "roadster",
        gears: 4, base: 9.35, top: 128, launch: 0.38, drop: 0.64, rise: [0.75, 0.50, 0.34, 0.24],
        band: [0.75, 0.89], green: [0.68, 0.93], pen: { good: 0.05, late: 0.15, bog: 0.25 }
    },
];

/* ---------- konstanta dunia ---------- */
const VB_W = 1280, VB_H = 430;
const WORLD = 5300, START = 170, FINISH = 4650, SPAN = FINISH - START;
const NOSE_OFF = 56, CAM_LEAD = 430;
const LANE_TOP = [150, 276], GROUND = [236, 362];
const AMBERS = [600, 1100, 1600], GREEN_BASE = 2100;
const AUTO_SLEEP = 4000, PIN_MS = 400, RESULT_MS = 2400;

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

function mulberry32(a) {
    return function () {
        a |= 0; a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
function bandsOf(v, wide) {
    return wide ? { band: [0.68, 0.93], green: [0.62, 0.96] } : { band: v.band, green: v.green };
}
function shiftQuality(f, v, wide) {
    const b = bandsOf(v, wide);
    if (f >= b.band[0] && f <= b.band[1]) return "perfect";
    if (f >= b.green[0] && f <= b.green[1]) return "good";
    return f > b.green[1] ? "late" : "bog";
}

/* ============================================================ */
export function mount(root, context = {}) {
    const { mode = "ai", room = null, playerName = "Player", onExit = () => { } } = context;
    const online = mode === "room" && Boolean(room);
    const playerIndex = online && !room.isHost ? 1 : 0;
    const me = playerIndex, opp = 1 - me;
    const isHost = !online || room.isHost;
    let roomData = room?.room || null;
    let state = null;
    let view = { s: null, recv: 0 };
    let destroyed = false;

    /* ---------- markup kendaraan (dipakai kartu & lintasan) ---------- */
    function wheelSVG(x, r, ref) {
        return `<g transform="translate(${x},${-r})"><circle r="${r}" fill="#1f2937"/>` +
            `<g${ref ? ` data-el="${ref}"` : ""}><line x1="0" y1="${-(r - 3)}" x2="0" y2="${r - 3}" stroke="#9aa3af" stroke-width="2"/></g>` +
            `<circle r="2.4" fill="#9aa3af"/></g>`;
    }
    function carSVG(v, color, p) {
        const B = {
            sedan: {
                body: "M-54,-8 C-54,-16 -50,-20 -40,-21 L-26,-22 L-14,-32 L16,-32 L28,-22 L46,-19 C52,-18 54,-14 54,-8 Z",
                glass: "M-12,-30 L14,-30 L24,-22 L-22,-22 Z", wf: 34, wr: -34, rf: 9, rr: 9
            },
            muscle: {
                body: "M-56,-8 L-54,-20 L-34,-22 L-24,-30 L2,-30 L12,-22 L50,-18 L56,-8 Z",
                glass: "M-22,-28 L0,-28 L8,-22 L-30,-22 Z", wf: 36, wr: -36, rf: 9, rr: 10
            },
            hatch: {
                body: "M-46,-8 L-44,-24 L-30,-32 L8,-32 L20,-22 L44,-18 L48,-8 Z",
                glass: "M-28,-30 L6,-30 L16,-22 L-38,-22 Z", wf: 30, wr: -30, rf: 8.5, rr: 8.5
            },
            dragster: {
                body: "M-50,-10 L-46,-16 L-10,-16 L2,-22 L14,-22 L20,-16 L58,-12 L58,-8 Z",
                glass: "M2,-21 L12,-21 L16,-16 L-2,-16 Z", wf: 44, wr: -38, rf: 6, rr: 13
            },
            ev: {
                body: "M-50,-8 C-52,-20 -40,-30 -16,-31 L10,-31 C30,-30 44,-22 50,-12 L50,-8 Z",
                glass: "M-30,-27 L12,-27 L26,-19 L-38,-19 Z", wf: 32, wr: -32, rf: 9, rr: 9
            },
            roadster: {
                body: "M-52,-8 L-50,-16 L-20,-18 L-14,-24 L-2,-24 L4,-18 L44,-14 L52,-8 Z",
                glass: "M-12,-23 L-2,-23 L2,-18 L-16,-18 Z", wf: 34, wr: -34, rf: 8.5, rr: 8.5
            },
        }[v.body];
        let s = `<ellipse cx="0" cy="1" rx="56" ry="4" fill="#0b1220" opacity="0.06"/>`;
        if (p) s += `<g data-el="${p}lines" opacity="0" stroke="#c3c9d2" stroke-width="2" stroke-linecap="round"><line x1="-62" y1="-18" x2="-84" y2="-18"/><line x1="-60" y1="-10" x2="-92" y2="-10"/></g>`;
        s += `<g${p ? ` data-el="${p}tilt"` : ""}>`;
        s += `<path d="${B.body}" fill="${color}"/>`;
        s += `<path d="${B.glass}" fill="#ffffff" opacity="0.55"/>`;
        if (v.body === "dragster") s += `<rect x="-52" y="-30" width="16" height="3" rx="1.5" fill="${color}"/><rect x="-46" y="-27" width="3" height="12" fill="${color}"/>`;
        s += wheelSVG(B.wf, B.rf, p ? p + "wf" : "") + wheelSVG(B.wr, B.rr, p ? p + "wr" : "");
        s += `</g>`;
        if (p) s += `<text data-el="${p}lab" x="0" y="-46" font-size="10" font-weight="600" fill="#8a919c" text-anchor="middle"></text>`;
        return s;
    }

    /* ---------- dunia SVG (statis, di-scroll via transform) ---------- */
    function treeSVG(lane) {
        const top = LANE_TOP[lane] + 8, cx = 35;
        let s = `<rect x="24" y="${top}" width="22" height="90" rx="5" fill="#ffffff" stroke="#dfe3ea" stroke-width="1.5"/>`;
        const bulb = (cy, key) => `<circle data-el="t${lane}${key}" cx="${cx}" cy="${cy}" r="4.5" fill="#eceff3" stroke="#d3d8e0" stroke-width="1.5"/>`;
        s += bulb(top + 13, "a1") + bulb(top + 29, "a2") + bulb(top + 45, "a3") + bulb(top + 63, "g") + bulb(top + 79, "r");
        return s;
    }
    function trackSVG() {
        let s = `<rect x="0" y="0" width="${VB_W}" height="${VB_H}" fill="#fafbfc"/>`;
        s += `<g data-el="far">`;
        for (let i = 0; i < 40; i++) {
            const x = i * 160 + ((i * 53) % 70), w = 70 + ((i * 37) % 90), h = 26 + ((i * 29) % 78);
            s += `<rect x="${x}" y="${140 - h}" width="${w}" height="${h}" fill="#eef1f5"/>`;
        }
        s += `</g><line x1="0" y1="140" x2="${VB_W}" y2="140" stroke="#e3e7ee" stroke-width="2"/>`;
        s += `<g data-el="mid">`;
        for (let x = 80; x < 3600; x += 460)
            s += `<line x1="${x}" y1="150" x2="${x}" y2="78" stroke="#d8dde5" stroke-width="3"/><rect x="${x - 14}" y="72" width="28" height="7" rx="2" fill="#d8dde5"/>`;
        s += `</g>`;
        s += `<rect x="0" y="150" width="${VB_W}" height="102" fill="#eef0f4"/><rect x="0" y="276" width="${VB_W}" height="102" fill="#eef0f4"/>`;
        s += `<rect x="0" y="252" width="${VB_W}" height="24" fill="#f6f7f9"/><rect x="0" y="378" width="${VB_W}" height="52" fill="#f6f7f9"/>`;
        s += `<g data-el="world">`;
        [242, 368].forEach((y) => { for (let x = 0; x < WORLD; x += 64) s += `<rect x="${x}" y="${y}" width="30" height="3" rx="1.5" fill="#d9dde4"/>`; });
        [[60 / 1320, "60 FT"], [330 / 1320, "330 FT"], [0.5, "1/8 MI"], [1000 / 1320, "1000 FT"]].forEach((m) => {
            const x = (START + m[0] * SPAN).toFixed(1);
            s += `<line x1="${x}" y1="150" x2="${x}" y2="160" stroke="#b9c0cb" stroke-width="2"/><line x1="${x}" y1="276" x2="${x}" y2="286" stroke="#b9c0cb" stroke-width="2"/>`;
            s += `<text x="${x}" y="146" font-size="9" font-weight="600" fill="#9aa1ab" text-anchor="middle">${m[1]}</text>`;
        });
        s += `<rect x="${START - 4}" y="150" width="3" height="102" fill="#c6ccd6"/><rect x="${START - 4}" y="276" width="3" height="102" fill="#c6ccd6"/>`;
        s += treeSVG(0) + treeSVG(1);
        [[150, 252], [276, 378]].forEach((seg) => {
            for (let y = seg[0]; y < seg[1]; y += 12)
                for (let c = 0; c < 2; c++) {
                    const on = ((y - seg[0]) / 12 + c) % 2 === 0;
                    s += `<rect x="${FINISH + c * 9}" y="${y}" width="9" height="${Math.min(12, seg[1] - y)}" fill="${on ? "#111827" : "#ffffff"}"/>`;
                }
        });
        s += `<text x="${FINISH + 9}" y="146" font-size="9" font-weight="700" fill="#6b7280" text-anchor="middle">FINISH</text>`;
        for (let x = 200; x < WORLD; x += 300) s += `<rect x="${x}" y="386" width="4" height="12" fill="#e2e6ec"/>`;
        s += `</g>`;
        s += `<g data-el="carBox0"></g><g data-el="carBox1"></g>`;
        return s;
    }

    /* ---------- kartu kendaraan & baris cheat ---------- */
    const statRow = (label, f) =>
        `<span class="ds-stat"><i>${label}</i><span class="ds-stat-track"><span style="width:${Math.round(clamp(f, 0.08, 1) * 100)}%"></span></span></span>`;
    const vehCards = VEHICLES.map((v) =>
        `<button class="ds-veh" type="button" data-veh="${v.id}">
      <svg viewBox="-62 -44 124 50" aria-hidden="true">${carSVG(v, v.color, "")}</svg>
      <b>${v.name}</b><span class="ds-veh-tag">${v.tag}</span>
      ${statRow("AKSEL", v.rise[0] / 1.3)}${statRow("KONTROL", (v.band[1] - v.band[0]) / 0.16)}${statRow("TOP", (v.top - 118) / 52)}
      <em>ET ${v.base.toFixed(2)}s &middot; ${v.gears} gigi</em>
    </button>`).join("");
    const CHEATS = [
        ["autoLaunch", "Auto Launch", "Start otomatis ~0.10s setelah hijau"],
        ["autoShift", "Auto Shift", "Shift otomatis di tengah zona perfect"],
        ["slowRev", "Slow Revs", "RPM naik 45% lebih lambat"],
        ["wideBand", "Wide Band", "Zona perfect diperlebar"],
        ["nitro", "Nitro", "Potong ET 0.35s"],
    ];
    const cheatRows = CHEATS.map(([k, name, d]) =>
        `<label class="ds-cheat-row"><span><b>${name}</b><i>${d}</i></span><input type="checkbox" data-cheat="${k}"></label>`).join("");

    /* ---------- kerangka UI minimalis ---------- */
    root.innerHTML = `
<style>
.ds-app{color:#111827;-webkit-user-select:none;user-select:none}
.ds-app [hidden]{display:none!important}
.ds-app .ds-meta{margin:2px 0 0;font-size:12px;color:#6b7280}
.ds-app .ds-intro-right{display:flex;align-items:center;gap:10px}
.ds-app .ds-ghost{border:1px solid #e5e7eb;background:#fff;color:#6b7280;font-size:11px;font-weight:600;letter-spacing:.4px;padding:5px 10px;border-radius:8px;cursor:pointer}
.ds-app .ds-ghost:hover{border-color:#111827;color:#111827}
.ds-app .ds-ghost.on{border-color:#f59e0b;color:#b45309}
.ds-app .ds-panel{padding:0;overflow:hidden}
.ds-app .ds-track{position:relative;width:100%;aspect-ratio:1280/430;touch-action:manipulation;cursor:pointer;background:#fafbfc}
.ds-app .ds-track svg{display:block;width:100%;height:100%}
.ds-app .ds-banner{position:absolute;left:50%;top:42%;transform:translate(-50%,-50%);text-align:center;pointer-events:none;background:rgba(250,251,252,.85);padding:10px 20px;border-radius:12px}
.ds-app .ds-banner b{display:block;font-size:26px;font-weight:800;letter-spacing:.5px}
.ds-app .ds-banner span{font-size:12px;color:#6b7280}
.ds-app .ds-tele{display:flex;align-items:center;gap:16px;padding:10px 14px 0;flex-wrap:wrap}
.ds-app .ds-lab{display:block;font-size:9px;font-weight:700;letter-spacing:1px;color:#9aa1ab}
.ds-app .ds-cell b{font-size:17px;font-weight:700;font-variant-numeric:tabular-nums}
.ds-app .ds-rpm{flex:1;min-width:150px;display:flex;align-items:center;gap:8px}
.ds-app .ds-rpm-track{position:relative;flex:1;height:8px;border-radius:4px;background:#eef1f4;overflow:hidden}
.ds-app .ds-zone{position:absolute;top:0;height:100%}
.ds-app .ds-needle{position:absolute;top:-1px;width:2.5px;height:10px;background:#111827;border-radius:1px}
.ds-app .ds-rpm b{font-size:12px;font-variant-numeric:tabular-nums;color:#6b7280;min-width:34px;text-align:right}
.ds-app .ds-opp b{font-size:12px;color:#6b7280;font-weight:600}
.ds-app .ds-prog{position:relative;height:6px;margin:10px 14px 14px;border-radius:3px;background:#eef1f4}
.ds-app .ds-prog i{position:absolute;top:-2px;width:10px;height:10px;border-radius:50%;border:2px solid #fff;transform:translateX(-50%);box-shadow:0 0 0 1px #e5e7eb}
.ds-app .ds-ov{position:absolute;inset:0;z-index:5;display:flex;align-items:center;justify-content:center;background:rgba(250,251,252,.95);overflow:auto;padding:14px}
.ds-app .ds-modal{width:100%;max-width:760px;margin:auto}
.ds-app .ds-modal-sm{max-width:420px}
.ds-app .ds-modal-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:10px}
.ds-app .ds-modal-head b{font-size:15px;font-weight:800;letter-spacing:.3px}
.ds-app .ds-modal-head span{font-size:11px;color:#6b7280}
.ds-app .ds-veh-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}
.ds-app .ds-veh{text-align:left;border:1px solid #e5e7eb;background:#fff;border-radius:10px;padding:10px;cursor:pointer;font:inherit;color:inherit}
.ds-app .ds-veh:hover{border-color:#111827}
.ds-app .ds-veh.sel{border-color:#111827;box-shadow:inset 0 0 0 1px #111827}
.ds-app .ds-veh:disabled{opacity:.55;cursor:default}
.ds-app .ds-veh svg{width:100%;height:44px;display:block}
.ds-app .ds-veh b{font-size:12.5px}
.ds-app .ds-veh-tag{display:block;font-size:10px;color:#6b7280;margin:1px 0 6px}
.ds-app .ds-veh em{display:block;font-style:normal;font-size:9.5px;color:#9aa1ab;margin-top:6px;font-variant-numeric:tabular-nums}
.ds-app .ds-stat{display:flex;align-items:center;gap:6px;margin-top:3px}
.ds-app .ds-stat i{font-style:normal;font-size:8px;font-weight:700;letter-spacing:.5px;color:#9aa1ab;width:46px}
.ds-app .ds-stat-track{flex:1;height:4px;border-radius:2px;background:#eef1f4;overflow:hidden}
.ds-app .ds-stat-track span{display:block;height:100%;background:#111827;border-radius:2px}
.ds-app .ds-cheat-row{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:9px 2px;border-bottom:1px solid #f1f2f4;cursor:pointer}
.ds-app .ds-cheat-row b{display:block;font-size:12.5px}
.ds-app .ds-cheat-row i{font-style:normal;font-size:10.5px;color:#6b7280}
.ds-app .ds-cheat-row input{width:16px;height:16px;accent-color:#111827}
.ds-app .ds-note{font-size:10.5px;color:#9aa1ab;margin:10px 0 0}
.ds-app .ds-center{text-align:center}
.ds-app .ds-over-title{display:block;font-size:22px;font-weight:800;letter-spacing:.5px}
.ds-app .ds-over-score{display:block;font-size:13px;color:#6b7280;margin:4px 0 10px;font-variant-numeric:tabular-nums}
.ds-app .ds-log{list-style:none;margin:0 0 6px;padding:0;font-size:11.5px;color:#6b7280;font-variant-numeric:tabular-nums;line-height:1.8}
.ds-app .ds-log .w{color:#059669}.ds-app .ds-log .l{color:#dc2626}
.ds-app .ds-row{display:flex;gap:8px;justify-content:center;margin-top:12px}
.ds-app .ds-btn{border:1px solid #111827;background:#111827;color:#fff;font-size:12px;font-weight:600;padding:8px 16px;border-radius:8px;cursor:pointer}
.ds-app .ds-btn-ghost{background:#fff;color:#111827}
@media (max-width:640px){
  .ds-app .ds-track{aspect-ratio:16/9}
  .ds-app .ds-veh-grid{grid-template-columns:repeat(2,1fr)}
  .ds-app .ds-banner b{font-size:19px}
  .ds-app .ds-cell b{font-size:14px}
}
</style>
<div class="game-app ds-app">
  <div class="game-intro">
    <div><h2>Drag Strip</h2><p class="ds-meta" data-el="meta">Ronde 1/3</p></div>
    <div class="ds-intro-right">
      ${online ? "" : '<button class="ds-ghost" type="button" data-open-cheats>CHEAT</button>'}
      <span class="game-status"><i class="game-status-dot"></i><span data-status>Siap</span></span>
    </div>
  </div>
  <section class="game-panel ds-panel" data-board>
    <div class="ds-track" data-track>
      <svg viewBox="0 0 ${VB_W} ${VB_H}" preserveAspectRatio="xMinYMid slice" data-el="svg" aria-hidden="true"></svg>
      <div class="ds-banner" data-el="banner" hidden><b data-el="bTitle"></b><span data-el="bSub"></span></div>
      <div class="ds-ov" data-ov="pick" hidden>
        <div class="ds-modal">
          <div class="ds-modal-head"><b>Pilih Kendaraan</b><span data-el="pickWait"></span></div>
          <div class="ds-veh-grid">${vehCards}</div>
        </div>
      </div>
      ${online ? "" : `<div class="ds-ov" data-ov="cheat" hidden>
        <div class="ds-modal ds-modal-sm">
          <div class="ds-modal-head"><b>Cheat</b><button class="ds-ghost" type="button" data-close-cheats>TUTUP</button></div>
          ${cheatRows}
          <p class="ds-note">Hanya berlaku saat bermain melawan bot.</p>
        </div>
      </div>`}
      <div class="ds-ov" data-ov="over" hidden>
        <div class="ds-modal ds-modal-sm ds-center">
          <b class="ds-over-title" data-el="overTitle"></b>
          <span class="ds-over-score" data-el="overScore"></span>
          <ul class="ds-log" data-el="overLog"></ul>
          <span class="ds-note" data-el="overBest"></span>
          <div class="ds-row">
            <button class="ds-btn" type="button" data-rematch>Balapan lagi</button>
            <button class="ds-btn ds-btn-ghost" type="button" data-repick>Ganti kendaraan</button>
          </div>
        </div>
      </div>
    </div>
    <div class="ds-tele">
      <div class="ds-rpm"><span class="ds-lab">RPM</span>
        <div class="ds-rpm-track">
          <i class="ds-zone" data-el="zGood" style="background:#d1fae5"></i>
          <i class="ds-zone" data-el="zPerf" style="background:#34d399"></i>
          <i class="ds-zone" data-el="zRed" style="background:#fecaca"></i>
          <i class="ds-needle" data-el="needle"></i>
        </div><b data-el="rpmVal">0</b>
      </div>
      <div class="ds-cell"><span class="ds-lab">GEAR</span><b data-el="gearVal">&ndash;</b></div>
      <div class="ds-cell"><span class="ds-lab">RT</span><b data-el="rtVal">&ndash;</b></div>
      <div class="ds-cell"><span class="ds-lab">MPH</span><b data-el="mphVal">0</b></div>
      <div class="ds-cell"><span class="ds-lab">ET</span><b data-el="etVal">0.00</b></div>
      <div class="ds-cell ds-opp"><span class="ds-lab" data-el="oppLab">LAWAN</span><b data-el="oppVal">&ndash;</b></div>
    </div>
    <div class="ds-prog"><i data-el="dotMe"></i><i data-el="dotOpp"></i></div>
  </section>
  <div class="game-actions"><button class="game-action-button" type="button" data-exit>Exit game</button></div>
</div>`;

    /* ---------- refs ---------- */
    const $ = (s) => root.querySelector(s);
    const svgEl = $('[data-el="svg"]');
    svgEl.innerHTML = trackSVG();
    const E = {};
    root.querySelectorAll("[data-el]").forEach((n) => { E[n.dataset.el] = n; });
    const statusEl = $("[data-status]");
    const trackEl = $("[data-track]");
    const ovPick = $('[data-ov="pick"]'), ovOver = $('[data-ov="over"]');
    const ovCheat = online ? null : $('[data-ov="cheat"]');
    const vehBtns = Array.from(root.querySelectorAll("[data-veh]"));
    const now = () => performance.now();

    /* ---------- state lokal (non-network) ---------- */
    const cheats = { autoLaunch: false, autoShift: false, slowRev: false, wideBand: false, nitro: false };
    let cheatOpen = false;
    let botPlan = null;
    let resultTimer = null, raf = null, lastT = now(), lastPub = 0;
    let carRefs = [null, null], carSig = "";
    let disp = [{ p: 0, rpm: 0, mph: 0 }, { p: 0, rpm: 0, mph: 0 }];
    let wheelDeg = [0, 0];
    let bestEt = null, lastLogLen = 0;
    try { const b = parseFloat(localStorage.getItem(META.bestKey)); if (isFinite(b)) bestEt = b; } catch (e) { }

    const myName = (playerName || "KAMU").toUpperCase().slice(0, 10);
    const oppName = online ? "LAWAN" : "TURBO";
    const vehOf = (i, st) => VEHICLES.find((v) => v.id === (st || state).vehicles[i]) || null;
    const anyCheat = () => Object.values(cheats).some(Boolean);
    const wideFor = (i) => !online && i === 0 && cheats.wideBand;

    /* ---------- state pertandingan (serializable, host-authoritative) ---------- */
    function freshRun() {
        return { launched: false, fs: false, rt: null, gear: 1, rpm: 0, shifts: [], simMs: 0, ts: 1, pin: 0, et: null, p: 0, mph: 0, done: false };
    }
    function roundFields() {
        return {
            first: Math.random() < 0.5 ? 0 : 1,           // acak: siapa yang dapat hijau duluan
            stagger: 200 + Math.random() * 140,
            hold: Math.random() * 500,
            staged: [false, false], treeT0: 0, greenAt: [0, 0],
            run: [freshRun(), freshRun()], result: null,
        };
    }
    function newMatch(vehicles) {
        const seats = Math.random() < 0.5 ? [0, 1] : [1, 0]; // acak: posisi/lane & label P1/P2
        return Object.assign({
            v: 1, t: 0,
            phase: vehicles ? "stage" : "pick",
            round: 1, wins: [0, 0], log: [], seats,
            vehicles: vehicles ? vehicles.slice() : [null, online ? null : VEHICLES[(Math.random() * VEHICLES.length) | 0].id],
            ready: vehicles ? [true, true] : [false, !online],
        }, roundFields());
    }
    function makeBotPlan() {
        const v = vehOf(1); if (!v) return null;
        const rng = mulberry32((Math.random() * 0x7fffffff) | 0);
        const targets = [];
        for (let k = 0; k < v.gears - 1; k++) {
            const roll = rng(); let f;
            if (roll < 0.5) f = (v.band[0] + v.band[1]) / 2 + (rng() - 0.5) * 0.02;
            else if (roll < 0.82) f = rng() < 0.5 ? v.green[0] + 0.02 + rng() * 0.03 : v.green[1] - 0.02 - rng() * 0.03;
            else if (roll < 0.93) f = 0.955 + rng() * 0.04;
            else f = Math.max(0.5, v.green[0] - 0.05 - rng() * 0.07);
            targets.push(Math.min(0.999, f));
        }
        return { rt: 170 + rng() * 260, targets };
    }

    function publish(force) {
        if (!state) return;
        state.t = now();
        view = { s: state, recv: performance.now() };
        if (online && room.isHost && (force || state.t - lastPub > 90)) {
            lastPub = state.t;
            room.publishState(state).catch(console.warn);
        }
    }

    /* ---------- aturan ---------- */
    function etCalc(i) {
        const v = vehOf(i), r = state.run[i];
        let pen = 0;
        for (const q of r.shifts) pen += v.pen[q] || 0;
        const nitro = !online && i === 0 && cheats.nitro ? 0.35 : 0;
        return Math.max(7.6, v.base + Math.max(0, ((r.rt ?? 150) - 150) / 1000) + pen - nitro);
    }
    function beginTree() {
        state.treeT0 = now();
        const base = state.treeT0 + GREEN_BASE + state.hold;
        state.greenAt[state.first] = base;
        state.greenAt[1 - state.first] = base + state.stagger;
        botPlan = online ? null : makeBotPlan();
        state.phase = "tree";
        publish(true);
    }
    function doLaunch(i, rt) {
        const r = state.run[i], v = vehOf(i);
        r.launched = true; r.rt = rt; r.rpm = v.launch; r.gear = 1; r.simMs = 0; r.ts = 1; r.pin = 0;
        if (state.phase === "tree") state.phase = "run";
        publish(true);
    }
    function doShift(i, q) {
        const r = state.run[i], v = vehOf(i);
        if (r.shifts.length >= v.gears - 1) return;
        r.shifts.push(q); r.gear += 1; r.rpm = v.drop; r.pin = 0;
        if (r.shifts.length === v.gears - 1) r.et = etCalc(i);
        publish(true);
    }
    function endRound(winner, reason) {
        state.result = { winner, reason, ets: [state.run[0].et, state.run[1].et] };
        state.wins[winner] += 1;
        state.log.push({ r: state.round, e: [state.run[0].et, state.run[1].et], w: winner, fs: reason === "fs" ? 1 - winner : null });
        state.phase = "result";
        publish(true);
        if (isHost) {
            if (resultTimer) clearTimeout(resultTimer);
            resultTimer = setTimeout(() => { resultTimer = null; advance(); }, RESULT_MS);
        }
    }
    function falseStart(i) {
        state.run[i].fs = true;
        endRound(1 - i, "fs");
    }
    function finishRound() {
        endRound(state.run[0].et <= state.run[1].et ? 0 : 1, "et");
    }
    function advance() {
        if (!state || state.phase !== "result") return;
        if (resultTimer) { clearTimeout(resultTimer); resultTimer = null; }
        if (state.wins[0] >= 2 || state.wins[1] >= 2) state.phase = "over";
        else { state.round += 1; Object.assign(state, roundFields()); state.phase = "stage"; }
        publish(true);
    }

    function applyAction(a, actor) {
        if (!state || !a || typeof a.type !== "string") return;
        if (actor !== 0 && actor !== 1) return;
        const r = state.run[actor];
        switch (a.type) {
            case "pick": {
                if (state.phase !== "pick" || state.ready[actor]) return;
                if (!VEHICLES.some((v) => v.id === a.vehicle)) return;
                state.vehicles[actor] = a.vehicle; state.ready[actor] = true;
                if (state.ready[0] && state.ready[1]) state.phase = "stage";
                publish(true); break;
            }
            case "stage": {
                if (state.phase !== "stage" || state.staged[actor]) return;
                state.staged[actor] = true;
                if (!online) state.staged[1] = true; // bot langsung stage
                if (state.staged[0] && state.staged[1]) beginTree(); else publish(true);
                break;
            }
            case "launch": {
                if ((state.phase !== "tree" && state.phase !== "run") || r.launched || r.fs) return;
                const rt = now() - state.greenAt[actor];
                if (rt < 0) falseStart(actor); else doLaunch(actor, rt);
                break;
            }
            case "shift": {
                const v = vehOf(actor);
                if (state.phase !== "run" || !r.launched || r.done || !v) return;
                if (r.shifts.length >= v.gears - 1) return;
                doShift(actor, shiftQuality(r.rpm, v, wideFor(actor)));
                break;
            }
            case "next": if (state.phase === "result") advance(); break;
            case "rematch": if (state.phase === "over") { state = newMatch(state.vehicles); publish(true); } break;
            case "repick": if (state.phase === "over") { state = newMatch(null); publish(true); } break;
        }
    }
    function submitAction(a) {
        if (online && !room.isHost) { room.sendAction(a).catch(console.warn); return; }
        applyAction(a, playerIndex);
    }
    function contextAction() {
        const s = view.s;
        if (!s) return;
        const r = s.run[me];
        if (s.phase === "stage") submitAction({ type: "stage" });
        else if (s.phase === "tree" || (s.phase === "run" && !r.launched && !r.fs)) submitAction({ type: "launch" });
        else if (s.phase === "run") submitAction({ type: "shift" });
        else if (s.phase === "result") submitAction({ type: "next" });
    }

    /* ---------- simulasi (host / mode AI saja) ---------- */
    function stepRunner(i, dt) {
        const r = state.run[i], v = vehOf(i);
        if (!r.launched || r.fs || r.done || !v) return;
        if (r.et !== null) r.ts += (3.2 - r.ts) * Math.min(1, dt / 420);
        const sdt = dt * r.ts;
        r.simMs += sdt;
        const mul = !online && i === 0 && cheats.slowRev ? 0.55 : 1;
        if (r.shifts.length < v.gears - 1) {
            r.rpm = Math.min(1, r.rpm + (v.rise[r.gear - 1] * mul * sdt) / 1000);
            if (r.rpm >= 1) { r.pin += sdt; if (r.pin >= PIN_MS) doShift(i, "late"); }
            else r.pin = 0;
        } else {
            r.rpm = Math.min(1, r.rpm + (v.rise[v.gears - 1] * mul * sdt) / 1000);
        }
        const est = r.et !== null ? r.et : etCalc(i);
        r.p = Math.min(1, r.simMs / (est * 1000));
        const topAdj = Math.max(70, v.top - (est - v.base) * 8);
        r.mph = Math.round(22 + (topAdj - 22) * r.p);
        if (r.et !== null && r.simMs >= r.et * 1000) { r.done = true; r.p = 1; }
    }
    function simTick(dt) {
        const t = now();
        if (state.phase === "tree" || state.phase === "run") {
            for (let i = 0; i < 2; i++) {
                const r = state.run[i];
                if (r.launched || r.fs || !state.greenAt[i]) continue;
                if (!online && i === 1 && botPlan) {
                    if (t >= state.greenAt[1] + botPlan.rt) doLaunch(1, botPlan.rt);
                } else if (!online && i === 0 && cheats.autoLaunch) {
                    if (t >= state.greenAt[0] + 95) doLaunch(0, 95 + Math.random() * 40);
                } else if (t > state.greenAt[i] + AUTO_SLEEP) {
                    doLaunch(i, AUTO_SLEEP); // ketiduran di garis start
                }
            }
            for (let i = 0; i < 2; i++) {
                stepRunner(i, dt);
                const r = state.run[i], v = vehOf(i);
                if (!r.launched || r.done || !v || r.shifts.length >= v.gears - 1) continue;
                if (!online && i === 1 && botPlan && r.rpm >= botPlan.targets[r.shifts.length])
                    doShift(1, shiftQuality(r.rpm, v, false));
                else if (!online && i === 0 && cheats.autoShift && r.rpm >= (v.band[0] + v.band[1]) / 2)
                    doShift(0, "perfect");
            }
            if (state.phase === "run" && state.run[0].done && state.run[1].done) finishRound();
            publish(false);
        }
    }

    /* ---------- render ---------- */
    const setTxt = (el, s) => { if (el && el.__v !== s) { el.__v = s; el.textContent = s; } };
    const setAttr = (el, k, v) => { if (el) el.setAttribute(k, v); };
    const BULB = { a: "#f59e0b", g: "#10b981", r: "#ef4444" };
    function bulb(lane, key, on, kind) {
        const el = E["t" + lane + key];
        setAttr(el, "fill", on ? BULB[kind] : "#eceff3");
        setAttr(el, "stroke", on ? BULB[kind] : "#d3d8e0");
    }
    function rebuildCars(s) {
        const sig = s.vehicles.join("|");
        if (sig === carSig) return;
        carSig = sig;
        for (let i = 0; i < 2; i++) {
            const box = E["carBox" + i], v = vehOf(i, s);
            if (!v) { box.innerHTML = ""; carRefs[i] = null; continue; }
            const color = i === 1 && s.vehicles[1] === s.vehicles[0] ? "#9ca3af" : v.color;
            box.innerHTML = carSVG(v, color, "c" + i);
            const q = (n) => box.querySelector('[data-el="' + n + '"]');
            carRefs[i] = { tilt: q("c" + i + "tilt"), wf: q("c" + i + "wf"), wr: q("c" + i + "wr"), lines: q("c" + i + "lines"), lab: q("c" + i + "lab"), color };
        }
        lastLogLen = 0;
    }
    function updateZones(s) {
        const v = vehOf(me, s);
        const b = v ? bandsOf(v, wideFor(me)) : { band: [0.78, 0.88], green: [0.7, 0.92] };
        const put = (el, a, z) => { el.style.left = (a * 100).toFixed(1) + "%"; el.style.width = ((z - a) * 100).toFixed(1) + "%"; };
        put(E.zGood, b.green[0], b.green[1]);
        put(E.zPerf, b.band[0], b.band[1]);
        put(E.zRed, b.green[1], 1);
    }
    function render(dt) {
        const s = view.s;
        if (!s) { setTxt(statusEl, "Menghubungkan…"); return; }
        const estNow = s.t + (performance.now() - view.recv);
        rebuildCars(s);

        /* best ET lokal (dari log, host & client) */
        if (s.log.length < lastLogLen) lastLogLen = 0;
        if (s.log.length > lastLogLen) {
            for (let k = lastLogLen; k < s.log.length; k++) {
                const et = s.log[k].e[me];
                if (typeof et === "number" && (bestEt === null || et < bestEt)) {
                    bestEt = et;
                    try { localStorage.setItem(META.bestKey, String(bestEt)); } catch (e) { }
                }
            }
            lastLogLen = s.log.length;
        }

        /* interpolasi tampilan */
        const k = Math.min(1, dt / 110);
        for (let i = 0; i < 2; i++) {
            const r = s.run[i], d = disp[i];
            if (!r.launched && r.simMs === 0) { d.p = 0; d.rpm = 0; d.mph = 0; }
            else { d.p += (r.p - d.p) * k; d.rpm += (r.rpm - d.rpm) * k; d.mph += (r.mph - d.mph) * k; }
            wheelDeg[i] += (40 + disp[i].mph * 5.2) * dt / 1000;
        }

        /* kamera mengikuti mobil pemain lokal */
        const cam = clamp(START + disp[me].p * SPAN - NOSE_OFF - CAM_LEAD, 0, WORLD - VB_W);
        setAttr(E.far, "transform", `translate(${(-cam * 0.25).toFixed(1)},0)`);
        setAttr(E.mid, "transform", `translate(${(-cam * 0.55).toFixed(1)},0)`);
        setAttr(E.world, "transform", `translate(${(-cam).toFixed(1)},0)`);

        for (let i = 0; i < 2; i++) {
            const box = E["carBox" + i], cr = carRefs[i], r = s.run[i];
            if (!cr) { setAttr(box, "visibility", "hidden"); continue; }
            setAttr(box, "visibility", "visible");
            const lane = s.seats[i];
            const x = START + disp[i].p * SPAN - NOSE_OFF - cam;
            setAttr(box, "transform", `translate(${x.toFixed(1)},${GROUND[lane]})`);
            const tilt = r.launched && r.simMs < 600 ? -4 * (1 - r.simMs / 600) : 0;
            setAttr(cr.tilt, "transform", `rotate(${tilt.toFixed(2)} -34 0)`);
            setAttr(cr.wf, "transform", `rotate(${(wheelDeg[i] % 360).toFixed(0)})`);
            setAttr(cr.wr, "transform", `rotate(${((wheelDeg[i] * 0.94) % 360).toFixed(0)})`);
            setAttr(cr.lines, "opacity", r.launched && !r.done ? clamp((disp[i].mph - 60) / 160, 0, 0.6).toFixed(2) : "0");
            setTxt(cr.lab, (i === me ? myName : oppName) + " · P" + (s.seats[i] + 1));
        }

        /* lampu tree per lane */
        for (let i = 0; i < 2; i++) {
            const lane = s.seats[i], r = s.run[i];
            const live = s.phase === "tree" || s.phase === "run" || s.phase === "result";
            const amber = s.phase === "tree";
            bulb(lane, "a1", amber && estNow >= s.treeT0 + AMBERS[0], "a");
            bulb(lane, "a2", amber && estNow >= s.treeT0 + AMBERS[1], "a");
            bulb(lane, "a3", amber && estNow >= s.treeT0 + AMBERS[2], "a");
            bulb(lane, "g", live && !r.fs && s.greenAt[i] > 0 && estNow >= s.greenAt[i], "g");
            bulb(lane, "r", r.fs, "r");
        }

        /* telemetri pemain lokal */
        const mv = vehOf(me, s), mr = s.run[me], orr = s.run[opp];
        updateZones(s);
        E.needle.style.left = `calc(${(disp[me].rpm * 100).toFixed(1)}% - 1px)`;
        setTxt(E.rpmVal, String(Math.round(disp[me].rpm * 8000)));
        setTxt(E.gearVal, mv ? mr.gear + "/" + mv.gears : "–");
        setTxt(E.rtVal, mr.fs ? "FS" : mr.rt === null ? "–" : (mr.rt / 1000).toFixed(3) + "s");
        E.rtVal.style.color = mr.fs ? "#dc2626" : "";
        setTxt(E.mphVal, String(Math.round(disp[me].mph)));
        const simEst = mr.launched && !mr.done ? mr.simMs + (performance.now() - view.recv) * mr.ts : mr.simMs;
        const etShow = mr.et !== null ? Math.min(simEst, mr.et * 1000) : simEst;
        setTxt(E.etVal, mr.fs ? "FS" : (etShow / 1000).toFixed(2));
        setTxt(E.oppLab, oppName);
        setTxt(E.oppVal, orr.fs ? "FS" : orr.launched ? "G" + orr.gear + " · " + Math.round(disp[opp].mph) + " mph" : "–");
        E.dotMe.style.left = (disp[me].p * 100).toFixed(1) + "%";
        E.dotOpp.style.left = (disp[opp].p * 100).toFixed(1) + "%";
        E.dotMe.style.background = carRefs[me] ? carRefs[me].color : "#111827";
        E.dotOpp.style.background = carRefs[opp] ? carRefs[opp].color : "#9ca3af";

        /* meta & status */
        setTxt(E.meta, "Ronde " + s.round + "/3 · " + s.wins[me] + "–" + s.wins[opp] +
            (bestEt !== null ? " · Best " + bestEt.toFixed(2) + "s" : "") + (!online && anyCheat() ? " · CHEAT" : ""));
        let status = "Siap";
        if (s.phase === "pick") status = s.ready[me] ? "Menunggu lawan memilih…" : "Pilih kendaraan";
        else if (s.phase === "stage") status = s.staged[me] ? "Menunggu lawan stage…" : "Ketuk / Spasi: stage";
        else if (s.phase === "tree" || (s.phase === "run" && !mr.launched && !mr.fs))
            status = s.greenAt[me] > 0 && estNow >= s.greenAt[me] ? "GO!" : "Tunggu hijau…";
        else if (s.phase === "run") status = mr.fs ? "Red light" : mr.et !== null ? "Gas!" : "Shift!";
        else if (s.phase === "result") status = "Ronde selesai";
        else if (s.phase === "over") status = "Match selesai";
        setTxt(statusEl, status);

        /* banner */
        let bt = "", bs = "", bc = "#111827", show = false;
        if (s.phase === "stage") {
            show = true; bt = "RONDE " + s.round;
            const ov = vehOf(opp, s);
            bs = ov ? "vs " + oppName + " · " + ov.name : "";
        } else if (s.phase === "result" && s.result) {
            show = true;
            if (s.result.reason === "fs") { bt = "RED LIGHT"; bs = (s.result.winner === me ? myName : oppName) + " mengambil ronde ini"; bc = "#dc2626"; }
            else {
                const win = s.result.winner === me;
                bt = (win ? myName : oppName) + " MENANG";
                const e0 = s.result.ets[me], e1 = s.result.ets[opp];
                bs = (e0 !== null ? e0.toFixed(2) : "–") + "s vs " + (e1 !== null ? e1.toFixed(2) : "–") + "s";
                bc = win ? "#059669" : "#dc2626";
            }
        }
        E.banner.hidden = !show;
        if (show) { setTxt(E.bTitle, bt); setTxt(E.bSub, bs); E.bTitle.style.color = bc; }

        /* overlay pilih kendaraan */
        ovPick.hidden = s.phase !== "pick";
        if (s.phase === "pick") {
            setTxt(E.pickWait, s.ready[me] ? "Menunggu lawan…" : "");
            vehBtns.forEach((b) => {
                b.classList.toggle("sel", b.dataset.veh === s.vehicles[me]);
                b.disabled = s.ready[me];
            });
        }
        if (ovCheat) ovCheat.hidden = !cheatOpen;

        /* overlay hasil akhir */
        ovOver.hidden = s.phase !== "over";
        if (s.phase === "over") {
            const won = s.wins[me] >= 2;
            setTxt(E.overTitle, won ? "MATCH MENANG" : "MATCH KALAH");
            E.overTitle.style.color = won ? "#059669" : "#dc2626";
            setTxt(E.overScore, s.wins[me] + " – " + s.wins[opp] + " vs " + oppName);
            const logKey = s.log.map((l) => l.r + ":" + l.w).join(",");
            if (E.overLog.__k !== logKey) {
                E.overLog.__k = logKey;
                E.overLog.innerHTML = s.log.map((l) => {
                    const mine = l.e[me], theirs = l.e[opp];
                    const txt = "R" + l.r + " · " + (mine !== null ? mine.toFixed(2) : "FS") + " vs " + (theirs !== null ? theirs.toFixed(2) : "FS") + " · " + (l.w === me ? "M" : "K");
                    return '<li class="' + (l.w === me ? "w" : "l") + '">' + txt + "</li>";
                }).join("");
            }
            setTxt(E.overBest, bestEt !== null ? "Best ET " + bestEt.toFixed(2) + "s" : "");
        }
    }

    /* ---------- input: keyboard + mouse (desktop), tap area (mobile) ---------- */
    function handleClick(e) {
        const t = e.target;
        if (t.closest("[data-exit]")) { onExit(); return; }
        if (t.closest("[data-open-cheats]")) { cheatOpen = true; return; }
        if (t.closest("[data-close-cheats]")) { cheatOpen = false; return; }
        const vb = t.closest("[data-veh]");
        if (vb) { submitAction({ type: "pick", vehicle: vb.dataset.veh }); return; }
        if (t.closest("[data-rematch]")) { submitAction({ type: "rematch" }); return; }
        if (t.closest("[data-repick]")) { submitAction({ type: "repick" }); return; }
        const b = t.closest("button");
        if (b) b.blur();
    }
    function handleChange(e) {
        const c = e.target.closest ? e.target.closest("[data-cheat]") : null;
        if (c) cheats[c.dataset.cheat] = c.checked;
        const btn = root.querySelector("[data-open-cheats]");
        if (btn) btn.classList.toggle("on", anyCheat());
    }
    function handlePointer(e) {
        if (e.target.closest(".ds-ov") || e.target.closest("button")) return;
        e.preventDefault();
        contextAction();
    }
    function handleKey(e) {
        if (destroyed) return;
        const tag = e.target ? e.target.tagName : "";
        if (e.key === " " || e.code === "Space") {
            if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
            e.preventDefault();
            if (!e.repeat) contextAction();
        }
        else if ((e.key === "c" || e.key === "C") && !online) cheatOpen = !cheatOpen;
        else if (e.key === "Escape") cheatOpen = false;
    }
    root.addEventListener("click", handleClick);
    root.addEventListener("change", handleChange);
    trackEl.addEventListener("pointerdown", handlePointer);
    document.addEventListener("keydown", handleKey);

    /* ---------- init sesuai template ---------- */
    if (online) {
        room.onRoom((nextRoom) => { roomData = nextRoom; });
        if (room.isHost) {
            state = newMatch(null);
            publish(true);
            room.onAction((action) => { if (!destroyed) applyAction(action, 1); });
        } else {
            room.onState((nextState) => { if (!destroyed && nextState) view = { s: nextState, recv: performance.now() }; });
        }
    } else {
        state = newMatch(null);
        publish(true);
    }

    function frame(t) {
        if (destroyed) return;
        const dt = clamp(t - lastT, 0, 66);
        lastT = t;
        if (isHost && state && (state.phase === "tree" || state.phase === "run")) simTick(dt);
        render(dt);
        raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);

    return {
        destroy() {
            destroyed = true;
            if (raf !== null) cancelAnimationFrame(raf);
            if (resultTimer) clearTimeout(resultTimer);
            root.removeEventListener("click", handleClick);
            root.removeEventListener("change", handleChange);
            trackEl.removeEventListener("pointerdown", handlePointer);
            document.removeEventListener("keydown", handleKey);
        },
    };
}