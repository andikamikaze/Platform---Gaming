/* ==== GAME: pac-man.js ==== */
/* Pac-Man — mengikuti template game (export META + mount).
 * Fitur: maze acak yang dijamin bisa diselesaikan, mode Solo / VS Bot / VS online,
 * overlay cheat, tutorial, D-pad mobile + keyboard & mouse, coin-flip giliran pertama,
 * posisi spawn acak saat multiplayer, animasi makan, mekanik makan hantu (power pellet).
 */

export const META = {
    id: "pac-man", // harus sama dengan nama file: pac-man.js
    name: "Pac-Man",
    category: "arcade",
    catLabel: "Arcade",
    desc: "Eat every dot in a freshly generated maze. Dodge four ghosts, grab power pellets to hunt them back. Solo, vs bot, or 2-player online.",
    art: '<svg viewBox="0 0 48 48" width="54" height="54" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 24L36 15a16 16 0 1 0 0 18z"/><circle cx="33" cy="24" r="1.6" fill="currentColor" stroke="none"/><circle cx="40" cy="24" r="1.6" fill="currentColor" stroke="none"/></svg>',
    bg: ["#1e3a8a", "#312e81"],
    bestKey: "pacManBest",
};

/* ================= helper murni (tanpa DOM) ================= */
const COLS = 19, ROWS = 15, CELL = 16;
const W = COLS * CELL, H = ROWS * CELL;
const DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
const OPP = { up: "down", down: "up", left: "right", right: "left" };
const ROT = { right: 0, down: 90, left: 180, up: 270 };
const DIR_KEYS = ["up", "left", "down", "right"];
const MODES = [["scatter", 6], ["chase", 18]];
const PAC_COLORS = ["#facc15", "#34d399"];
const GHOST_DEFS = [
    { name: "Blinky", color: "#f87171", scatter: [COLS - 2, 1], exit: 0, home: [9, 5] },
    { name: "Pinky", color: "#f9a8d4", scatter: [1, 1], exit: 2.2, home: [9, 7] },
    { name: "Inky", color: "#67e8f9", scatter: [COLS - 2, ROWS - 2], exit: 5, home: [8, 7] },
    { name: "Clyde", color: "#fbbf24", scatter: [1, ROWS - 2], exit: 8, home: [10, 7] },
];

function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
        a |= 0; a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/* Siapa boleh menginjak sel apa:
 * pac & hantu "out" tidak boleh masuk rumah/pintu; eyes & hantu "house" boleh. */
function passTile(tiles, x, y, who) {
    if (x < 0 || y < 0 || x >= COLS || y >= ROWS) return false;
    const c = tiles[y][x];
    if (c === "#") return false;
    if (c === "G" || c === "-") return who === "eyes" || who === "house";
    return true;
}

/* BFS multi-sumber -> jarak ke sumber terdekat untuk tiap sel (-1 = tak terjangkau). */
function bfsField(tiles, sources, who) {
    const dist = new Int16Array(COLS * ROWS).fill(-1);
    const q = [];
    for (let i = 0; i < sources.length; i++) {
        const j = sources[i][1] * COLS + sources[i][0];
        if (dist[j] < 0) { dist[j] = 0; q.push(j); }
    }
    let head = 0;
    while (head < q.length) {
        const i = q[head++];
        const x = i % COLS, y = (i / COLS) | 0;
        for (let k = 0; k < 4; k++) {
            const d = DIRS[DIR_KEYS[k]];
            const nx = x + d[0], ny = y + d[1];
            if (!passTile(tiles, nx, ny, who)) continue;
            const j = ny * COLS + nx;
            if (dist[j] >= 0) continue;
            dist[j] = dist[i] + 1; q.push(j);
        }
    }
    return dist;
}

/* Generator maze acak, simetris, dan DIJAMIN selesai:
 * 1) DFS maze di setengah kiri (termasuk kolom tengah) -> semua sel terhubung.
 * 2) "Braid": buka sebagian dead-end supaya banyak loop (gaya Pac-Man).
 * 3) Cermin ke kanan. 4) Rumah hantu + pintu di tengah.
 * 5) Flood-fill dari sel atas pintu; sel lantai yang tak terjangkau jadi tembok,
 *    jadi SEMUA dot pasti bisa dimakan. Spawn & pellet dipilih dari sel terjangkau. */
function genMaze(seed) {
    const rnd = mulberry32(seed);
    let best = null;
    for (let attempt = 0; attempt < 24; attempt++) {
        const t = [];
        for (let y = 0; y < ROWS; y++) t.push(new Array(COLS).fill("#"));
        const open = function (x, y) { t[y][x] = " "; };
        const seen = new Set(["1,1"]);
        const stack = [[1, 1]];
        open(1, 1);
        while (stack.length) {
            const cur = stack[stack.length - 1];
            const x = cur[0], y = cur[1];
            const nb = [];
            for (let k = 0; k < 4; k++) {
                const d = DIRS[DIR_KEYS[k]];
                const nx = x + d[0] * 2, ny = y + d[1] * 2;
                if (nx >= 1 && nx <= 9 && ny >= 1 && ny <= 13 && !seen.has(nx + "," + ny))
                    nb.push([nx, ny, x + d[0], y + d[1]]);
            }
            if (!nb.length) { stack.pop(); continue; }
            const pick = nb[(rnd() * nb.length) | 0];
            open(pick[2], pick[3]); open(pick[0], pick[1]);
            seen.add(pick[0] + "," + pick[1]); stack.push([pick[0], pick[1]]);
        }
        for (let x = 1; x <= 9; x += 2) for (let y = 1; y <= 13; y += 2) {
            const openNb = [], closed = [];
            for (let k = 0; k < 4; k++) {
                const d = DIRS[DIR_KEYS[k]];
                const wx = x + d[0], wy = y + d[1], nx = x + d[0] * 2, ny = y + d[1] * 2;
                if (nx < 1 || nx > 9 || ny < 1 || ny > 13) continue;
                (t[wy][wx] !== "#" ? openNb : closed).push([wx, wy]);
            }
            if (openNb.length === 1 && closed.length && rnd() < 0.9) {
                const w = closed[(rnd() * closed.length) | 0];
                open(w[0], w[1]);
            }
        }
        for (let y = 0; y < ROWS; y++) for (let x = 0; x < 9; x++) t[y][COLS - 1 - x] = t[y][x];
        t[6][9] = "-";
        t[7][8] = "G"; t[7][9] = "G"; t[7][10] = "G";
        t[6][8] = "#"; t[6][10] = "#"; t[8][8] = "#"; t[8][9] = "#"; t[8][10] = "#";
        const reach = new Set(["9,5"]);
        const q = [[9, 5]];
        let head = 0;
        while (head < q.length) {
            const x = q[head][0], y = q[head][1]; head++;
            for (let k = 0; k < 4; k++) {
                const d = DIRS[DIR_KEYS[k]];
                const nx = x + d[0], ny = y + d[1], key = nx + "," + ny;
                if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS || reach.has(key)) continue;
                const c = t[ny][nx];
                if (c === "#" || c === "G" || c === "-") continue;
                reach.add(key); q.push([nx, ny]);
            }
        }
        let n = 0;
        for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
            if (t[y][x] === " ") { if (reach.has(x + "," + y)) n++; else t[y][x] = "#"; }
        }
        if (!best || n > best.n) best = { t: t, n: n, reach: reach };
        if (n >= 118) break;
    }
    const t = best.t, cells = [];
    best.reach.forEach(function (key) {
        const p = key.split(","); cells.push([+p[0], +p[1]]);
    });
    cells.sort(function (a, b) { return a[1] - b[1] || a[0] - b[0]; });
    const used = new Set(["9,5"]);
    const nearest = function (tx, ty) {
        let bc = null, bd = 1e9;
        for (let i = 0; i < cells.length; i++) {
            const x = cells[i][0], y = cells[i][1];
            if (used.has(x + "," + y)) continue;
            const d = (x - tx) * (x - tx) + (y - ty) * (y - ty);
            if (d < bd) { bd = d; bc = [x, y]; }
        }
        used.add(bc[0] + "," + bc[1]);
        return bc;
    };
    const sA = nearest(5, 11), sB = nearest(13, 11);
    const pellets = [nearest(1, 1), nearest(COLS - 2, 1), nearest(1, ROWS - 2), nearest(COLS - 2, ROWS - 2)];
    let dots = 0;
    for (let i = 0; i < cells.length; i++) {
        const x = cells[i][0], y = cells[i][1];
        if (used.has(x + "," + y)) continue;
        t[y][x] = "."; dots++;
    }
    for (let i = 0; i < pellets.length; i++) t[pellets[i][1]][pellets[i][0]] = "o";
    return {
        tiles: t.map(function (r) { return r.join(""); }),
        spawns: [sA, sB],
        dots: dots + pellets.length,
    };
}

/* ============================ mount ============================ */
export function mount(root, context) {
    context = context || {};
    const mode = context.mode || "ai";
    const room = context.room || null;
    const playerName = context.playerName || "Player";
    const onExit = context.onExit || function () { };
    const online = mode === "room" && Boolean(room);
    const playerIndex = online && !room.isHost ? 1 : 0;
    const authority = !online || room.isHost; // host = sumber kebenaran simulasi
    let roomData = (room && room.room) || null;
    let state = null;
    let destroyed = false;
    const ui = { paused: false, help: false, cheats: false, modeChoice: "solo" };
    const offs = [];
    let dirty = false, lastPub = 0;
    let builtLevel = -1, builtDots = -1;
    const fx = [];
    const chomp = [0, 0];
    let best = 0;
    try { best = parseInt(localStorage.getItem(META.bestKey) || "0", 10) || 0; } catch (e) { }

    /* ---------- DOM + gaya (minimalis, ter-scope .pm-app) ---------- */
    root.innerHTML =
        '<div class="game-app pm-app">' +
        '<div class="game-intro"><div><h2>Pac-Man</h2>' +
        "<p>Maze baru setiap level — selalu bisa diselesaikan. Makan semua dot, hindari 4 hantu, dan balikkan keadaan dengan power pellet.</p></div>" +
        '<span class="game-status"><i class="game-status-dot" data-status-dot></i><span data-status>Ready</span></span></div>' +
        '<div class="pm-hud">' +
        '<span class="pm-chip"><i class="pm-dot" data-you-dot></i><span data-you-label>You</span>&nbsp;<b data-hud="you">0</b></span>' +
        '<span class="pm-chip" data-rival-chip hidden><i class="pm-dot" data-rival-dot></i><span data-rival-label>Bot</span>&nbsp;<b data-hud="rival">0</b></span>' +
        '<span class="pm-chip">Dots <b data-hud="dots">0</b></span>' +
        '<span class="pm-chip">Level <b data-hud="level">1</b></span>' +
        '<span class="pm-chip">Best <b data-hud="best">0</b></span>' +
        '<span class="pm-chip">Lives <span class="pm-lives" data-hud="lives"></span></span>' +
        '<span class="pm-spacer"></span>' +
        '<button class="pm-btn" type="button" data-act="pause" data-pause-btn>Pause</button>' +
        '<button class="pm-btn" type="button" data-act="help">How to play</button>' +
        '<button class="pm-btn" type="button" data-act="cheats" data-cheats-btn>Cheats</button>' +
        '<button class="pm-btn" type="button" data-act="restart" data-restart-btn>Restart</button>' +
        "</div>" +
        '<section class="game-panel pm-panel" data-board><div class="pm-board">' +
        '<svg class="pm-svg" viewBox="0 0 ' + W + " " + H + '" preserveAspectRatio="xMidYMid meet" aria-label="Pac-Man board"></svg>' +
        '<div class="pm-msg" data-msg></div>' +
        '<div class="pm-ov" data-ov="lobby"><div class="pm-card">' +
        "<h3>Pac-Man</h3>" +
        '<p data-lobby-sub>Makan semua dot untuk naik level. Pellet membuat hantu biru selama beberapa detik — makan mereka untuk poin bonus.</p>' +
        '<div class="pm-row" data-mode-row>' +
        '<button class="pm-btn" type="button" data-act="solo">Solo</button>' +
        '<button class="pm-btn" type="button" data-act="bot">VS Bot</button></div>' +
        '<div class="pm-row"><button class="pm-btn primary" type="button" data-act="start" data-start-btn>Start game</button>' +
        '<button class="pm-btn" type="button" data-act="help">How to play</button></div>' +
        '<p class="pm-fine">Arrow / WASD · klik papan untuk belok · D-pad di layar sentuh</p>' +
        "</div></div>" +
        '<div class="pm-ov" data-ov="pause" hidden><div class="pm-card"><h3>Paused</h3>' +
        "<p>Hantu-hantu sedang menunggu.</p>" +
        '<div class="pm-row"><button class="pm-btn primary" type="button" data-act="resume">Resume</button></div></div></div>' +
        '<div class="pm-ov" data-ov="clear" hidden><div class="pm-card"><h3 data-clear-title>Level clear!</h3>' +
        '<p data-clear-sub></p>' +
        '<div class="pm-row"><button class="pm-btn primary" type="button" data-act="next" data-next-btn>Next level</button></div></div></div>' +
        '<div class="pm-ov" data-ov="over" hidden><div class="pm-card"><h3 data-over-title>Game over</h3>' +
        '<p data-over-sub></p>' +
        '<div class="pm-row"><button class="pm-btn primary" type="button" data-act="again">Play again</button>' +
        '<button class="pm-btn" type="button" data-act="menu" data-menu-btn>Menu</button></div></div></div>' +
        '<div class="pm-ov" data-ov="help" hidden><div class="pm-card pm-help-card">' +
        "<h3>How to play</h3>" +
        '<div class="pm-help">' +
        "<div><h4>Tujuan</h4><ul><li>Makan semua dot &amp; pellet untuk naik level. Setiap level = maze acak baru yang dijamin bisa diselesaikan.</li><li>Kamu punya 3 nyawa. Tersentuh hantu normal = kehilangan 1 nyawa.</li></ul></div>" +
        "<div><h4>Kontrol</h4><ul><li>Keyboard: Arrow / WASD, <b>P</b> pause, <b>R</b> restart, <b>C</b> cheats, <b>H</b> bantuan, <b>Space</b> mulai / lanjut.</li><li>Mouse: klik / tahan-drag di papan — Pac-Man belok ke arah kursor.</li><li>Mobile: gunakan D-pad di bawah papan.</li></ul></div>" +
        "<div><h4>Item &amp; poin</h4><ul><li>Dot = 10 poin. Power pellet = 50 poin.</li><li>Pellet membuat hantu biru (7 detik, makin singkat tiap level). Makan hantu biru: 200 / 400 / 800 / 1600 poin berantai.</li><li>Hantu yang dimakan kembali ke rumah sebagai mata, lalu hidup lagi.</li></ul></div>" +
        "<div><h4>Mode</h4><ul><li><b>Solo</b>: kejar skor terbaik (tersimpan di perangkat).</li><li><b>VS Bot / VS Player</b>: rebutan dot. Lawan kehilangan semua nyawa = kamu menang. Coin-flip menentukan siapa jalan duluan (yang kalah tunggu 2,2 detik), dan posisi spawn diacak.</li></ul></div>" +
        "<div><h4>Cheats</h4><ul><li>Tombol <b>Cheats</b> membuka panel: kebal, kecepatan, bekukan hantu, hantu biru terus, +1000 poin, +1 nyawa, lewati level. Saat online, hanya host yang bisa memakai cheat.</li></ul></div>" +
        "</div>" +
        '<div class="pm-row"><button class="pm-btn primary" type="button" data-act="close-help">Got it</button></div>' +
        "</div></div>" +
        '<div class="pm-ov" data-ov="cheats" hidden><div class="pm-card">' +
        "<h3>Cheats</h3><p class=\"pm-fine\" data-cheat-note>Panel bantuan — pakai sesukamu.</p>" +
        '<label class="pm-cheat-row">God mode (kamu kebal)<input class="pm-switch" type="checkbox" data-cheat="god"></label>' +
        '<label class="pm-cheat-row">Speed boost (kamu)<input class="pm-switch" type="checkbox" data-cheat="speed"></label>' +
        '<label class="pm-cheat-row">Bekukan hantu<input class="pm-switch" type="checkbox" data-cheat="freeze"></label>' +
        '<label class="pm-cheat-row">Hantu biru terus<input class="pm-switch" type="checkbox" data-cheat="fright"></label>' +
        '<div class="pm-row"><button class="pm-btn" type="button" data-act="cheat-score">+1000</button>' +
        '<button class="pm-btn" type="button" data-act="cheat-life">+1 nyawa</button>' +
        '<button class="pm-btn" type="button" data-act="cheat-skip">Skip level</button></div>' +
        '<div class="pm-row"><button class="pm-btn primary" type="button" data-act="close-cheats">Close</button></div>' +
        "</div></div>" +
        "</div></section>" +
        '<div class="pm-foot"><div class="pm-dpad">' +
        '<button class="pm-dbtn" type="button" data-dir="up" style="grid-column:2;grid-row:1" aria-label="Up"><svg viewBox="0 0 24 24"><path d="M5 15l7-7 7 7"/></svg></button>' +
        '<button class="pm-dbtn" type="button" data-dir="left" style="grid-column:1;grid-row:2" aria-label="Left"><svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></svg></button>' +
        '<button class="pm-dbtn" type="button" data-dir="down" style="grid-column:2;grid-row:2" aria-label="Down"><svg viewBox="0 0 24 24"><path d="M5 9l7 7 7-7"/></svg></button>' +
        '<button class="pm-dbtn" type="button" data-dir="right" style="grid-column:3;grid-row:2" aria-label="Right"><svg viewBox="0 0 24 24"><path d="M9 5l7 7-7 7"/></svg></button>' +
        "</div>" +
        '<div class="pm-hint">Arrow / WASD · klik papan untuk belok · P pause · C cheats · H bantuan</div></div>' +
        '<div class="game-actions"><button class="game-action-button" type="button" data-act="exit">Exit game</button></div>' +
        "</div>";

    const st = document.createElement("style");
    st.textContent = [
        ".pm-app{display:flex;flex-direction:column;gap:10px;color:#e5e7eb;font-variant-numeric:tabular-nums}",
        ".pm-app *{box-sizing:border-box}",
        ".pm-app [hidden]{display:none!important}",
        ".pm-app .pm-hud{display:flex;flex-wrap:wrap;align-items:center;gap:6px}",
        ".pm-app .pm-chip{display:inline-flex;align-items:center;gap:5px;padding:4px 10px;border:1px solid #ffffff14;border-radius:999px;background:#ffffff08;font-size:12px;color:#94a3b8}",
        ".pm-app .pm-chip b{color:#e5e7eb;font-weight:600}",
        ".pm-app .pm-dot{width:8px;height:8px;border-radius:50%;background:#facc15;flex:none}",
        ".pm-app .pm-lives{display:inline-flex;gap:3px;margin-left:2px}",
        ".pm-app .pm-life{width:14px;height:14px;display:block}",
        ".pm-app .pm-spacer{flex:1}",
        ".pm-app .pm-btn{appearance:none;border:1px solid #ffffff1c;background:#ffffff0a;color:#cbd5e1;border-radius:10px;padding:6px 12px;font-size:12.5px;font-weight:500;cursor:pointer;transition:background .15s,border-color .15s,color .15s}",
        ".pm-app .pm-btn:hover{background:#ffffff14;color:#f8fafc}",
        ".pm-app .pm-btn.primary{background:#facc15;border-color:transparent;color:#111827;font-weight:600}",
        ".pm-app .pm-btn.primary:hover{background:#fde047}",
        ".pm-app .pm-btn.active{border-color:#facc15;color:#facc15}",
        ".pm-app .pm-panel{position:relative;padding:0;border:none;background:none}",
        ".pm-app .pm-board{position:relative;width:100%;max-width:560px;margin:0 auto}",
        ".pm-app .pm-svg{display:block;width:100%;height:auto;aspect-ratio:304/240;background:#070b18;border:1px solid #ffffff12;border-radius:14px;touch-action:none;cursor:crosshair}",
        ".pm-app .pm-msg{position:absolute;top:10px;left:50%;transform:translateX(-50%);padding:4px 12px;border-radius:999px;background:#0b1220ee;border:1px solid #ffffff1a;color:#fbbf24;font-size:12px;font-weight:600;opacity:0;transition:opacity .2s;pointer-events:none;white-space:nowrap;z-index:4}",
        ".pm-app .pm-msg.show{opacity:1}",
        ".pm-app .pm-ov{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:#05081499;backdrop-filter:blur(3px);border-radius:14px;z-index:5}",
        ".pm-app .pm-card{width:min(92%,330px);max-height:94%;overflow:auto;background:#0b1220f5;border:1px solid #ffffff14;border-radius:14px;padding:18px;text-align:center;display:flex;flex-direction:column;gap:10px}",
        ".pm-app .pm-card h3{margin:0;font-size:18px;color:#f8fafc}",
        ".pm-app .pm-card p{margin:0;font-size:12.5px;line-height:1.55;color:#94a3b8}",
        ".pm-app .pm-fine{font-size:11px;color:#64748b}",
        ".pm-app .pm-row{display:flex;gap:8px;justify-content:center;flex-wrap:wrap}",
        ".pm-app .pm-help-card{width:min(94%,380px);text-align:left}",
        ".pm-app .pm-help{display:flex;flex-direction:column;gap:9px;font-size:12.5px;color:#94a3b8}",
        ".pm-app .pm-help h4{margin:0 0 3px;color:#e5e7eb;font-size:11px;text-transform:uppercase;letter-spacing:.07em}",
        ".pm-app .pm-help ul{margin:0;padding-left:16px;display:flex;flex-direction:column;gap:3px;line-height:1.5}",
        ".pm-app .pm-help b{color:#cbd5e1}",
        ".pm-app .pm-cheat-row{display:flex;justify-content:space-between;align-items:center;gap:8px;font-size:12.5px;color:#cbd5e1;padding:7px 0;border-bottom:1px dashed #ffffff10;cursor:pointer}",
        ".pm-app .pm-switch{appearance:none;flex:none;width:34px;height:20px;border-radius:999px;background:#1e293b;border:1px solid #ffffff22;position:relative;cursor:pointer;transition:background .15s;margin:0}",
        ".pm-app .pm-switch::after{content:'';position:absolute;top:2px;left:2px;width:14px;height:14px;border-radius:50%;background:#94a3b8;transition:left .15s,background .15s}",
        ".pm-app .pm-switch:checked{background:#facc15;border-color:transparent}",
        ".pm-app .pm-switch:checked::after{left:16px;background:#111827}",
        ".pm-app .pm-foot{display:flex;align-items:center;justify-content:space-between;gap:10px}",
        ".pm-app .pm-dpad{display:none;grid-template-columns:repeat(3,52px);grid-template-rows:repeat(2,52px);gap:6px;touch-action:none}",
        ".pm-app.pm-touch .pm-dpad{display:grid}",
        ".pm-app .pm-dbtn{appearance:none;border:1px solid #ffffff1c;background:#ffffff0a;color:#cbd5e1;border-radius:12px;cursor:pointer;display:flex;align-items:center;justify-content:center;padding:0;touch-action:none;-webkit-tap-highlight-color:transparent}",
        ".pm-app .pm-dbtn:active{background:#facc1522;border-color:#facc15;color:#facc15;transform:scale(.94)}",
        ".pm-app .pm-dbtn svg{width:22px;height:22px;fill:none;stroke:currentColor;stroke-width:2.4;stroke-linecap:round;stroke-linejoin:round;pointer-events:none}",
        ".pm-app .pm-hint{font-size:11px;color:#64748b;text-align:right}",
        ".pm-app .pm-pellet{animation:pmPulse 1s ease-in-out infinite;transform-box:fill-box;transform-origin:center}",
        "@keyframes pmPulse{0%,100%{transform:scale(1)}50%{transform:scale(1.35)}}",
        "@media (max-width:560px){.pm-app .pm-hint{display:none}.pm-app .pm-dpad{display:grid}.pm-app .pm-foot{justify-content:center}}",
        "@media (prefers-reduced-motion:reduce){.pm-app .pm-pellet{animation:none}}",
    ].join("\n");
    root.appendChild(st);

    const appEl = root.querySelector(".pm-app");
    const touch = (window.matchMedia && window.matchMedia("(pointer: coarse)").matches) || "ontouchstart" in window;
    if (touch) appEl.classList.add("pm-touch");
    const $ = function (s) { return root.querySelector(s); };
    const svg = $(".pm-svg");
    const NS = "http://www.w3.org/2000/svg";
    const el = function (t, at, parent) {
        const n = document.createElementNS(NS, t);
        for (const k in at) n.setAttribute(k, at[k]);
        if (parent) parent.appendChild(n);
        return n;
    };
    const gStatic = el("g", {}, svg);
    const gDots = el("g", {}, svg);
    const gFx = el("g", {}, svg);
    const gActors = el("g", {}, svg);
    const readyText = el("text", { x: W / 2, y: H * 0.665, "text-anchor": "middle", fill: "#facc15", "font-size": 12, "font-weight": 700, "letter-spacing": "2", opacity: 0 }, svg);
    readyText.textContent = "READY!";

    const ghostNodes = GHOST_DEFS.map(function (d) {
        const g = el("g", {}, gActors);
        const body = el("path", { fill: d.color, d: "M-7 -1a7 7 0 0 1 14 0v7l-2.3-2.6-2.4 2.6-2.3-2.6-2.3 2.6-2.4-2.6L-7 6z" }, g);
        const eL = el("circle", { cx: -2.6, cy: -2, r: 2.1, fill: "#fff" }, g);
        const eR = el("circle", { cx: 2.6, cy: -2, r: 2.1, fill: "#fff" }, g);
        const pL = el("circle", { cx: -2.6, cy: -2, r: 1.05, fill: "#1e293b" }, g);
        const pR = el("circle", { cx: 2.6, cy: -2, r: 1.05, fill: "#1e293b" }, g);
        const mouth = el("path", { stroke: "#fff", "stroke-width": 1, fill: "none", opacity: 0, d: "M-3.5 3l1.2-1.6 1.2 1.6 1.2-1.6 1.2 1.6 1.2-1.6 1.2 1.6" }, g);
        return { g: g, body: body, eL: eL, eR: eR, pL: pL, pR: pR, mouth: mouth };
    });
    const pacNodes = [0, 1].map(function (i) {
        const g = el("g", {}, gActors);
        const path = el("path", { fill: PAC_COLORS[i] }, g);
        return { g: g, path: path };
    });

    const hudYou = $('[data-hud="you"]'), hudRival = $('[data-hud="rival"]'),
        hudDots = $('[data-hud="dots"]'), hudLevel = $('[data-hud="level"]'),
        hudBest = $('[data-hud="best"]'), hudLives = $('[data-hud="lives"]');
    const youLabel = $("[data-you-label]"), rivalLabel = $("[data-rival-label]"),
        youDot = $("[data-you-dot]"), rivalDot = $("[data-rival-dot]"),
        rivalChip = $("[data-rival-chip]");
    const statusEl = $("[data-status]"), statusDot = $("[data-status-dot]");
    const msgEl = $("[data-msg]");
    const ov = {
        lobby: $('[data-ov="lobby"]'), pause: $('[data-ov="pause"]'),
        clear: $('[data-ov="clear"]'), over: $('[data-ov="over"]'),
        help: $('[data-ov="help"]'), cheats: $('[data-ov="cheats"]'),
    };
    const lobbySub = $("[data-lobby-sub]"), modeRow = $("[data-mode-row]"), startBtn = $("[data-start-btn]");
    const clearTitle = $("[data-clear-title]"), clearSub = $("[data-clear-sub]"), nextBtn = $("[data-next-btn]");
    const overTitle = $("[data-over-title]"), overSub = $("[data-over-sub]"), menuBtn = $("[data-menu-btn]");
    const pauseBtn = $("[data-pause-btn]"), cheatsBtn = $("[data-cheats-btn]"), restartBtn = $("[data-restart-btn]");
    const cheatNote = $("[data-cheat-note]");
    const pacIcon = '<svg class="pm-life" viewBox="0 0 16 16"><path d="M8 8L14 4.5a7 7 0 1 0 0 7z" fill="#facc15"/></svg>';
    const hudCache = {};

    /* ---------- state (serializable, dikirim apa adanya ke room) ---------- */
    function makePlayer(i) {
        return { i: i, x: 0, y: 0, fx: 0, fy: 0, prog: 1, dir: "left", next: "left", score: 0, lives: 3, alive: true, frozenT: 0 };
    }
    function makeGhost(d, i) {
        return { i: i, x: d.home[0], y: d.home[1], fx: d.home[0], fy: d.home[1], prog: 1, dir: "left", state: d.exit === 0 ? "out" : "house", exitT: d.exit, fright: false };
    }
    function placeActors(s) {
        s.players.forEach(function (p, i) {
            const sp = s.spawns[(i + (s.spawnSwap ? 1 : 0)) % 2]; // posisi spawn acak utk multiplayer
            p.x = sp[0]; p.y = sp[1]; p.fx = sp[0]; p.fy = sp[1];
            p.prog = 1; p.dir = "left"; p.next = "left"; p.frozenT = 0;
        });
        s.ghosts.forEach(function (g, i) {
            const d = GHOST_DEFS[i];
            g.x = d.home[0]; g.y = d.home[1]; g.fx = g.x; g.fy = g.y;
            g.prog = 1; g.dir = "left";
            g.state = d.exit === 0 ? "out" : "house";
            g.exitT = Math.max(0, d.exit - (s.level - 1) * 0.4);
            g.fright = false;
        });
        s.frightT = 0; s.chain = 0; s.modeIdx = 0; s.modeT = 0;
    }
    function createMatch(m) {
        const prev = state;
        const seed = (Math.random() * 1e9) | 0;
        const mz = genMaze(seed);
        const s = {
            seq: 0,
            levelSeq: prev ? prev.levelSeq + 1 : 1,
            dotsVersion: prev ? prev.dotsVersion + 1 : 1,
            mode: m, phase: "lobby", level: 1, seed: seed,
            tiles: mz.tiles, dotsLeft: mz.dots, spawns: mz.spawns,
            spawnSwap: m !== "solo" && Math.random() < 0.5,
            firstMover: 0,
            players: [], ghosts: GHOST_DEFS.map(makeGhost),
            frightT: 0, chain: 0, modeIdx: 0, modeT: 0,
            readyT: 0, deadT: 0, deadIdx: 0, clearT: 0, winner: -1,
            cheats: { god: false, speed: false, freeze: false, fright: false },
            msg: { text: "", t: 0 },
        };
        const n = m === "solo" ? 1 : 2;
        for (let i = 0; i < n; i++) s.players.push(makePlayer(i));
        placeActors(s);
        return s;
    }
    function say(text) { state.msg = { text: text, t: 1.8 }; }
    function labelOf(i) {
        if (state.mode === "bot") return i === 0 ? "You" : "Bot";
        if (state.mode === "versus") return i === playerIndex ? "You" : "Rival";
        return "You";
    }
    function rollFirst() {
        if (state.mode === "solo") { state.firstMover = 0; return; }
        state.firstMover = Math.random() < 0.5 ? 0 : 1; // coin-flip giliran pertama
        state.players.forEach(function (p) { p.frozenT = p.i === state.firstMover ? 0 : 2.2; });
        say(labelOf(state.firstMover) + " move" + (labelOf(state.firstMover) === "You" ? "" : "s") + " first!");
    }
    function startMatch(m) {
        state = createMatch(m);
        state.phase = "ready"; state.readyT = 2.2;
        rollFirst();
        ui.paused = false;
        publish(true);
    }
    function nextLevel() {
        state.level++;
        state.seed = (Math.random() * 1e9) | 0;
        const mz = genMaze(state.seed + state.level * 7919);
        state.tiles = mz.tiles; state.spawns = mz.spawns; state.dotsLeft = mz.dots;
        state.levelSeq++; state.dotsVersion++;
        if (state.mode !== "solo") state.spawnSwap = Math.random() < 0.5;
        placeActors(state);
        state.phase = "ready"; state.readyT = 2;
        rollFirst();
        say("Level " + state.level + " — maze baru!");
        publish(true);
    }
    function respawn() {
        placeActors(state);
        state.phase = "ready"; state.readyT = 1.5;
        rollFirst();
        publish(true);
    }
    function updateBest() {
        const me = state.players[playerIndex] || state.players[0];
        if (me && me.score > best) {
            best = me.score;
            try { localStorage.setItem(META.bestKey, String(best)); } catch (e) { }
        }
    }
    function finish(winner) {
        state.phase = "over"; state.winner = winner;
        updateBest();
        publish(true);
    }
    function afterDeath() {
        if (state.mode === "solo") {
            if (!state.players[0].alive) finish(-1); else respawn();
            return;
        }
        const a = state.players[0].alive, b = state.players[1].alive;
        if (!a || !b) {
            if (a && !b) finish(0);
            else if (b && !a) finish(1);
            else finish(state.players[0].score === state.players[1].score ? -2 : (state.players[0].score > state.players[1].score ? 0 : 1));
        } else respawn();
    }
    function doClear() {
        state.phase = "clear"; state.clearT = 6;
        state.players.forEach(function (p) { if (p.alive) p.score += 500; });
        say("Level " + state.level + " clear! +500");
        publish(true);
    }

    /* ---------- gerak: satu langkah per kedatangan di tengah sel ----------
     * (memperbaiki bug lama: tryTurn + stepPlayer menggeser 2 sel sekaligus
     *  sehingga karakter menembus tembok / tidak bergerak di area playable) */
    function floatPos(e) {
        const p = Math.min(1, e.prog);
        return { x: e.fx + (e.x - e.fx) * p, y: e.fy + (e.y - e.fy) * p };
    }
    function reverseNow(e) {
        if (e.prog > 0 && e.prog < 1) {
            const tx = e.x, ty = e.y;
            e.x = e.fx; e.y = e.fy; e.fx = tx; e.fy = ty;
            e.prog = 1 - e.prog;
        }
        e.dir = OPP[e.dir];
    }
    function setDir(p, d) {
        if (!DIRS[d]) return;
        p.next = d;
        if (d === OPP[p.dir] && p.prog > 0 && p.prog < 1 && state.phase === "playing" && p.frozenT <= 0) reverseNow(p);
    }
    function advance(e, ms, dt, who, decide, arrive) {
        e.prog += (dt * 1000) / ms;
        let guard = 0;
        while (e.prog >= 1 && guard++ < 5) {
            if (arrive) arrive(e);
            if (state.phase !== "playing") { e.prog = 1; e.fx = e.x; e.fy = e.y; break; }
            const d = decide(e);
            if (d) {
                const v = DIRS[d], nx = e.x + v[0], ny = e.y + v[1];
                if (passTile(state.tiles, nx, ny, who)) {
                    e.dir = d; e.fx = e.x; e.fy = e.y; e.x = nx; e.y = ny;
                    e.prog -= 1;
                    continue;
                }
            }
            e.prog = 1; e.fx = e.x; e.fy = e.y;
            break;
        }
    }
    function pacMs(p) {
        if (p.i === 1 && state.mode === "bot") return 172;
        if (p.i === 0 && state.cheats.speed) return 112;
        return 160;
    }
    function ghostMs(g) {
        if (g.state === "eyes") return 80;
        if (g.state === "house") return 150;
        const base = Math.max(118, 190 - (state.level - 1) * 7);
        return g.fright ? base * 1.5 : base;
    }
    function frightDur() { return Math.max(2.5, 7 - (state.level - 1) * 0.6); }

    function setTile(x, y, c) {
        const row = state.tiles[y];
        state.tiles[y] = row.slice(0, x) + c + row.slice(x + 1);
        state.dotsVersion++;
    }
    function startFright() {
        state.frightT = frightDur(); state.chain = 0;
        state.ghosts.forEach(function (g) { if (g.state === "out") { g.fright = true; reverseNow(g); } });
        say("Power up! Buru hantunya!");
    }
    function arrivePac(p) {
        const c = state.tiles[p.y][p.x];
        if (c !== "." && c !== "o") return;
        setTile(p.x, p.y, " ");
        state.dotsLeft--;
        p.score += c === "o" ? 50 : 10;
        pop(p.x, p.y, c === "o");
        if (c === "o") startFright();
        if (state.dotsLeft <= 0) doClear();
    }
    function decidePac(p) {
        if (p.i === 1 && state.mode === "bot") return botDir(p);
        const tryD = function (d) {
            const v = DIRS[d];
            return passTile(state.tiles, p.x + v[0], p.y + v[1], "pac") ? d : null;
        };
        return tryD(p.next) || tryD(p.dir);
    }

    /* Bot rival: BFS ke dot/pellet terdekat + hindari hantu; saat fright, buru hantu. */
    function botDir(p) {
        const opts = DIR_KEYS.filter(function (k) {
            const v = DIRS[k];
            return passTile(state.tiles, p.x + v[0], p.y + v[1], "pac");
        });
        if (!opts.length) return null;
        const src = [];
        if (state.frightT > 0) state.ghosts.forEach(function (g) { if (g.state === "out" && g.fright) src.push([g.x, g.y]); });
        if (!src.length) {
            for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
                const c = state.tiles[y][x];
                if (c === "." || c === "o") src.push([x, y]);
            }
        }
        const field = bfsField(state.tiles, src, "pac");
        const danger = function (x, y) {
            let s = 0;
            for (let i = 0; i < state.ghosts.length; i++) {
                const g = state.ghosts[i];
                if (g.state !== "out" || g.fright) continue;
                const d = Math.max(Math.abs(g.x - x), Math.abs(g.y - y));
                if (d <= 2) s += (3 - d) * 6;
                const gp = floatPos(g);
                if (Math.hypot(gp.x - x, gp.y - y) < 1.6) s += 30;
            }
            return s;
        };
        let bestScore = 1e9, pick = opts[0];
        for (let i = 0; i < opts.length; i++) {
            const k = opts[i], v = DIRS[k], nx = p.x + v[0], ny = p.y + v[1];
            const f = field[ny * COLS + nx];
            const score = (f < 0 ? 500 : f) + danger(nx, ny) + (k === OPP[p.dir] ? 1.2 : 0) + Math.random() * 0.4;
            if (score < bestScore) { bestScore = score; pick = k; }
        }
        return pick;
    }

    function anchorPlayer(g) {
        let bp = null, bd = 1e9;
        for (let i = 0; i < state.players.length; i++) {
            const p = state.players[i];
            if (!p.alive) continue;
            const d = Math.abs(p.x - g.x) + Math.abs(p.y - g.y);
            if (d < bd) { bd = d; bp = p; }
        }
        return bp || state.players[0];
    }
    function ghostTarget(g) {
        const d = GHOST_DEFS[g.i];
        const modeName = MODES[state.modeIdx][0];
        const a = anchorPlayer(g);
        if (modeName === "scatter" && g.i !== 2) return { x: d.scatter[0], y: d.scatter[1] };
        if (g.i === 0) return { x: a.x, y: a.y };
        if (g.i === 1) { const v = DIRS[a.dir]; return { x: a.x + v[0] * 4, y: a.y + v[1] * 4 }; }
        if (g.i === 2) {
            const corners = [[COLS - 2, 1], [COLS - 2, ROWS - 2], [1, ROWS - 2], [1, 1]];
            const c = corners[Math.floor(state.modeT / 4) % 4];
            return { x: c[0], y: c[1] };
        }
        const dist = Math.abs(g.x - a.x) + Math.abs(g.y - a.y);
        return dist > 7 ? { x: a.x, y: a.y } : { x: d.scatter[0], y: d.scatter[1] };
    }
    function arriveGhost(g) {
        if (g.state === "eyes" && state.tiles[g.y][g.x] === "G") {
            g.state = "house"; g.exitT = 1.2; g.fright = false; g.dir = "up";
        } else if (g.state === "house" && g.y <= 5) {
            g.state = "out"; g.fright = state.cheats.fright;
            g.dir = Math.random() < 0.5 ? "left" : "right";
        }
    }
    function decideGhost(g) {
        if (g.state === "eyes") {
            if (g.x === 9 && (g.y === 5 || g.y === 6)) return "down";
            const field = bfsField(state.tiles, [[9, 5]], "eyes");
            let bd = 1e9, pick = null;
            for (let i = 0; i < 4; i++) {
                const k = DIR_KEYS[i], v = DIRS[k], nx = g.x + v[0], ny = g.y + v[1];
                if (!passTile(state.tiles, nx, ny, "eyes")) continue;
                const f = field[ny * COLS + nx];
                if (f >= 0 && f < bd) { bd = f; pick = k; }
            }
            return pick || OPP[g.dir];
        }
        if (g.state === "house") {
            if (g.exitT > 0) return null;
            if (g.x < 9) return "right";
            if (g.x > 9) return "left";
            return "up";
        }
        const opts = DIR_KEYS.filter(function (k) {
            if (k === OPP[g.dir]) return false;
            const v = DIRS[k];
            return passTile(state.tiles, g.x + v[0], g.y + v[1], "out");
        });
        let list = opts;
        if (!list.length) list = DIR_KEYS.filter(function (k) {
            const v = DIRS[k];
            return passTile(state.tiles, g.x + v[0], g.y + v[1], "out");
        });
        if (!list.length) return null;
        if (g.fright) return list[(Math.random() * list.length) | 0];
        const t = ghostTarget(g);
        let bd = 1e9, pick = list[0];
        for (let i = 0; i < list.length; i++) {
            const k = list[i], v = DIRS[k];
            const d = Math.abs(g.x + v[0] - t.x) + Math.abs(g.y + v[1] - t.y);
            if (d < bd) { bd = d; pick = k; }
        }
        return pick;
    }

    function killPac(p) {
        p.lives--;
        if (p.lives <= 0) { p.lives = 0; p.alive = false; }
        state.phase = "dead"; state.deadT = 1.35; state.deadIdx = p.i;
        publish(true);
    }
    function collide() {
        for (let i = 0; i < state.players.length; i++) {
            const p = state.players[i];
            if (!p.alive) continue;
            const pp = floatPos(p);
            for (let j = 0; j < state.ghosts.length; j++) {
                const g = state.ghosts[j];
                if (g.state !== "out") continue;
                const gp = floatPos(g);
                if (Math.abs(pp.x - gp.x) >= 0.58 || Math.abs(pp.y - gp.y) >= 0.58) continue;
                if (g.fright) {
                    state.chain = Math.min(4, state.chain + 1);
                    const pts = 200 * Math.pow(2, state.chain - 1);
                    p.score += pts;
                    g.state = "eyes"; g.fright = false;
                    floatText(gp.x, gp.y, "+" + pts);
                    say("+" + pts + " — " + labelOf(p.i) + " ate a ghost!");
                    dirty = true;
                } else if (!(state.cheats.god && p.i === 0)) {
                    killPac(p);
                    return;
                }
            }
        }
    }

    /* ---------- simulasi (hanya dijalankan oleh authority) ---------- */
    function sim(dt) {
        if (!state) return;
        if (state.msg.t > 0) state.msg.t -= dt;
        if (state.phase === "ready") {
            state.readyT -= dt;
            if (state.readyT <= 0) { state.phase = "playing"; say("Go!"); publish(true); }
            return;
        }
        if (state.phase === "dead") {
            state.deadT -= dt;
            if (state.deadT <= 0) afterDeath();
            return;
        }
        if (state.phase === "clear") {
            state.clearT -= dt;
            if (state.clearT <= 0) nextLevel();
            return;
        }
        if (state.phase !== "playing") return;

        if (state.cheats.fright) {
            state.frightT = Math.max(state.frightT, 5);
            state.ghosts.forEach(function (g) { if (g.state === "out") g.fright = true; });
        } else if (state.frightT > 0) {
            state.frightT -= dt;
            if (state.frightT <= 0) {
                state.frightT = 0; state.chain = 0;
                state.ghosts.forEach(function (g) { g.fright = false; });
            }
        }
        if (state.frightT <= 0) {
            state.modeT += dt;
            if (state.modeT >= MODES[state.modeIdx][1]) {
                state.modeT = 0;
                state.modeIdx = (state.modeIdx + 1) % MODES.length;
                state.ghosts.forEach(function (g) { if (g.state === "out") reverseNow(g); });
            }
        }
        if (!state.cheats.freeze) state.ghosts.forEach(function (g) {
            if (g.state === "house" && g.exitT > 0) g.exitT -= dt;
        });
        for (let i = 0; i < state.players.length; i++) {
            if (state.phase !== "playing") break;
            const p = state.players[i];
            if (!p.alive) continue;
            if (p.frozenT > 0) { p.frozenT -= dt; continue; }
            advance(p, pacMs(p), dt, "pac", decidePac, arrivePac);
        }
        if (state.phase === "playing" && !state.cheats.freeze) {
            for (let j = 0; j < state.ghosts.length; j++) {
                const g = state.ghosts[j];
                advance(g, ghostMs(g), dt, g.state === "out" ? "out" : g.state, decideGhost, arriveGhost);
            }
        }
        if (state.phase === "playing") collide();
        dirty = true;
    }

    /* Guest: interpolasi ringan di antara snapshot (dead-reckoning prog). */
    function guestAdvance(dt) {
        if (!state) return;
        if (state.msg.t > 0) state.msg.t -= dt;
        if (state.phase === "ready") { state.readyT = Math.max(0, state.readyT - dt); return; }
        if (state.phase === "dead") { state.deadT = Math.max(0, state.deadT - dt); return; }
        if (state.phase === "clear") { state.clearT = Math.max(0, state.clearT - dt); return; }
        if (state.phase !== "playing") return;
        if (state.frightT > 0) state.frightT = Math.max(0, state.frightT - dt);
        state.players.forEach(function (p) {
            if (!p.alive) return;
            if (p.frozenT > 0) { p.frozenT = Math.max(0, p.frozenT - dt); return; }
            p.prog = Math.min(1, p.prog + (dt * 1000) / pacMs(p));
        });
        if (!state.cheats.freeze) state.ghosts.forEach(function (g) {
            if (g.state === "house" && g.exitT > 0) g.exitT = Math.max(0, g.exitT - dt);
            g.prog = Math.min(1, g.prog + (dt * 1000) / ghostMs(g));
        });
    }

    /* ---------- aksi & sinkronisasi room ---------- */
    function applyCheat(key, value) {
        const c = state.cheats;
        if (key === "god" || key === "speed" || key === "freeze") c[key] = !!value;
        else if (key === "fright") {
            c.fright = !!value;
            if (!value) { state.frightT = 0; state.ghosts.forEach(function (g) { g.fright = false; }); }
        } else if (key === "score") { state.players[0].score += 1000; say("+1000 (cheat)"); }
        else if (key === "life") {
            const p = state.players[0];
            p.lives = Math.min(6, p.lives + 1); p.alive = true;
            say("+1 nyawa (cheat)");
        } else if (key === "skip") {
            if (state.phase === "playing" || state.phase === "ready") {
                for (let y = 0; y < ROWS; y++) {
                    const row = state.tiles[y];
                    if (row.indexOf(".") >= 0 || row.indexOf("o") >= 0)
                        state.tiles[y] = row.split(".").join(" ").split("o").join(" ");
                }
                state.dotsLeft = 0; state.dotsVersion++;
                doClear();
            }
        }
        publish(true);
    }
    function applyAction(action, actor) {
        if (!state || !action || typeof action !== "object") return;
        const t = action.type;
        if (t === "dir") {
            const p = state.players[actor];
            if (p && p.alive && (state.phase === "playing" || state.phase === "ready")) setDir(p, action.dir);
        } else if (t === "start") {
            if (actor !== 0) return;
            if (state.phase === "lobby" || state.phase === "over")
                startMatch(online ? "versus" : (action.mode === "bot" ? "bot" : "solo"));
        } else if (t === "next") {
            if (actor !== 0) return;
            if (state.phase === "clear") nextLevel();
        } else if (t === "again") {
            if (state.phase === "over" && (actor === 0 || !online)) startMatch(state.mode);
        } else if (t === "menu") {
            if (actor !== 0) return;
            if (state.phase === "over") { state = createMatch(state.mode); publish(true); }
        } else if (t === "cheat") {
            if (actor !== 0) return; // cheat hanya untuk host / pemain lokal
            applyCheat(action.key, action.value);
        }
        dirty = true;
    }
    function submitAction(action) {
        if (online && !room.isHost) {
            if (action.type === "dir" && state && state.players[playerIndex])
                setDir(state.players[playerIndex], action.dir); // prediksi lokal agar responsif
            room.sendAction(action).catch(console.warn);
            return;
        }
        applyAction(action, playerIndex);
    }
    function publish(force) {
        dirty = true;
        if (!online || !room.isHost || !state) return;
        const now = performance.now();
        if (!force && now - lastPub < 120) return; // ~8 snapshot/detik
        lastPub = now; dirty = false; state.seq++;
        room.publishState(JSON.parse(JSON.stringify(state))).catch(console.warn);
    }

    /* ---------- efek visual lokal ---------- */
    function pop(x, y, big) { fx.push({ kind: "pop", x: x, y: y, t: 0, ttl: big ? 0.45 : 0.3, big: big, node: null }); }
    function floatText(x, y, text) { fx.push({ kind: "text", x: x, y: y, t: 0, ttl: 0.9, text: text, node: null }); }
    function updateFx(dt) {
        for (let i = fx.length - 1; i >= 0; i--) {
            const f = fx[i];
            f.t += dt;
            if (f.t >= f.ttl) { if (f.node) f.node.remove(); fx.splice(i, 1); }
        }
    }
    function diffPops(prevTiles, tiles) {
        for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
            const a = prevTiles[y][x], b = tiles[y][x];
            if ((a === "." || a === "o") && b === " ") pop(x, y, a === "o");
        }
    }

    /* ---------- render ---------- */
    function buildStatic() {
        gStatic.textContent = "";
        for (let y = 0; y < ROWS; y++) {
            let x = 0;
            while (x < COLS) {
                if (state.tiles[y][x] !== "#") { x++; continue; }
                let x2 = x;
                while (x2 + 1 < COLS && state.tiles[y][x2 + 1] === "#") x2++;
                el("rect", {
                    x: x * CELL + 1, y: y * CELL + 1,
                    width: (x2 - x + 1) * CELL - 2, height: CELL - 2,
                    rx: 4, fill: "#131f47", stroke: "#2b3f8c", "stroke-width": 1,
                }, gStatic);
                x = x2 + 1;
            }
        }
        el("rect", { x: 8 * CELL + 1.5, y: 6 * CELL + 1.5, width: 3 * CELL - 3, height: 2 * CELL - 3, rx: 5, fill: "none", stroke: "#f9a8d440", "stroke-width": 1 }, gStatic);
        el("rect", { x: 9 * CELL + 2, y: 6 * CELL + 6, width: CELL - 4, height: 2.5, rx: 1.25, fill: "#fbbf24" }, gStatic);
    }
    function buildDots() {
        gDots.textContent = "";
        for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
            const c = state.tiles[y][x];
            if (c === ".") el("circle", { cx: x * CELL + 8, cy: y * CELL + 8, r: 1.7, fill: "#fcd34d", opacity: 0.85 }, gDots);
            else if (c === "o") el("circle", { cx: x * CELL + 8, cy: y * CELL + 8, r: 4.3, fill: "#fde68a", class: "pm-pellet" }, gDots);
        }
    }
    function pacD(m) {
        const r = 7, a = Math.max(0.04, Math.min(3.1, m));
        const x1 = (r * Math.cos(a)).toFixed(2), y1 = (r * Math.sin(a)).toFixed(2);
        const x2 = (r * Math.cos(-a)).toFixed(2), y2 = (r * Math.sin(-a)).toFixed(2);
        return "M0 0L" + x1 + " " + y1 + "A" + r + " " + r + " 0 1 1 " + x2 + " " + y2 + "Z";
    }
    function renderActors(dt, now) {
        for (let i = 0; i < 2; i++) {
            const n = pacNodes[i], p = state.players[i];
            if (!p || (!p.alive && state.phase !== "dead")) { n.g.setAttribute("opacity", 0); continue; }
            const pos = floatPos(p);
            const px = pos.x * CELL + 8, py = pos.y * CELL + 8;
            let rot = ROT[p.dir] || 0, scale = 1, mouth = 0.22;
            const moving = state.phase === "playing" && p.alive && p.frozenT <= 0 && p.prog < 1 && !ui.paused;
            if (moving) { chomp[i] += dt * 13; mouth = 0.08 + 0.45 * Math.abs(Math.sin(chomp[i])); }
            if (state.phase === "dead" && state.deadIdx === i) {
                const pr = 1 - Math.max(0, state.deadT) / 1.35;
                scale = Math.max(0.001, 1 - pr);
                rot += pr * 540;
                mouth = 0.1 + pr * 2.9;
            }
            const frozen = p.frozenT > 0 && (state.phase === "playing" || state.phase === "ready");
            n.g.setAttribute("opacity", frozen ? (0.55 + 0.25 * Math.sin(now * 6)).toFixed(2) : 1);
            n.g.setAttribute("transform", "translate(" + px.toFixed(1) + " " + py.toFixed(1) + ") rotate(" + rot.toFixed(0) + ") scale(" + scale.toFixed(3) + ")");
            n.path.setAttribute("d", pacD(mouth));
        }
        state.ghosts.forEach(function (g, i) {
            const n = ghostNodes[i];
            if (state.phase === "dead") { n.g.setAttribute("opacity", 0); return; }
            n.g.setAttribute("opacity", 1);
            const pos = floatPos(g);
            const gx = pos.x * CELL + 8;
            let gy = pos.y * CELL + 8;
            if (g.state === "house" && g.exitT > 0) gy += Math.sin(now * 4 + i * 1.7) * 1.6;
            n.g.setAttribute("transform", "translate(" + gx.toFixed(1) + " " + gy.toFixed(1) + ")");
            const eyesOnly = g.state === "eyes";
            const fr = g.fright && !eyesOnly;
            const flashing = fr && state.frightT < 2 && Math.floor(state.frightT * 6) % 2 === 0;
            n.body.setAttribute("opacity", eyesOnly ? 0 : 1);
            n.body.setAttribute("fill", fr ? (flashing ? "#e5e7eb" : "#3b82f6") : GHOST_DEFS[i].color);
            const d = DIRS[g.dir] || [0, 0];
            const er = fr ? 1.3 : 2.1;
            const efill = fr ? (flashing ? "#3b82f6" : "#fff") : "#fff";
            n.eL.setAttribute("r", er); n.eR.setAttribute("r", er);
            n.eL.setAttribute("fill", efill); n.eR.setAttribute("fill", efill);
            n.pL.setAttribute("opacity", fr ? 0 : 1); n.pR.setAttribute("opacity", fr ? 0 : 1);
            if (!fr) {
                n.pL.setAttribute("cx", -2.6 + d[0] * 0.9); n.pL.setAttribute("cy", -2 + d[1] * 0.9);
                n.pR.setAttribute("cx", 2.6 + d[0] * 0.9); n.pR.setAttribute("cy", -2 + d[1] * 0.9);
            }
            n.mouth.setAttribute("opacity", fr ? 1 : 0);
            n.mouth.setAttribute("stroke", flashing ? "#3b82f6" : "#fff");
        });
    }
    function renderFx() {
        for (let i = 0; i < fx.length; i++) {
            const f = fx[i], p = f.t / f.ttl;
            if (f.kind === "pop") {
                if (!f.node) f.node = el("circle", { fill: "none", stroke: f.big ? "#fde68a" : "#fcd34d", "stroke-width": 1.4 }, gFx);
                f.node.setAttribute("cx", f.x * CELL + 8);
                f.node.setAttribute("cy", f.y * CELL + 8);
                f.node.setAttribute("r", (2 + p * (f.big ? 9 : 5)).toFixed(1));
                f.node.setAttribute("opacity", (1 - p).toFixed(2));
            } else {
                if (!f.node) {
                    f.node = el("text", { "text-anchor": "middle", fill: "#fde68a", "font-size": 8, "font-weight": 700 }, gFx);
                    f.node.textContent = f.text;
                }
                f.node.setAttribute("x", f.x * CELL + 8);
                f.node.setAttribute("y", f.y * CELL + 4 - p * 9);
                f.node.setAttribute("opacity", (1 - p).toFixed(2));
            }
        }
    }
    function setText(elm, key, val) {
        val = String(val);
        if (hudCache[key] !== val) { hudCache[key] = val; elm.textContent = val; }
    }
    function render(dt) {
        dt = dt || 1 / 60;
        if (!state) {
            setText(statusEl, "status", "Connecting…");
            ov.lobby.hidden = false;
            lobbySub.textContent = "Menunggu host menyiapkan pertandingan…";
            modeRow.hidden = true; startBtn.hidden = true;
            return;
        }
        if (builtLevel !== state.levelSeq) { buildStatic(); builtLevel = state.levelSeq; builtDots = -1; }
        if (builtDots !== state.dotsVersion) { buildDots(); builtDots = state.dotsVersion; }
        renderActors(dt, performance.now() / 1000);
        renderFx();

        const me = state.players[playerIndex] || state.players[0];
        const rival = state.players.length > 1 ? state.players[1 - playerIndex] : null;
        setText(hudYou, "you", me.score);
        setText(hudDots, "dots", state.dotsLeft);
        setText(hudLevel, "level", state.level);
        setText(hudBest, "best", best);
        const livesKey = "lives" + me.lives + "_" + playerIndex;
        if (hudCache.lives !== livesKey) {
            hudCache.lives = livesKey;
            hudLives.innerHTML = pacIcon.repeat(Math.max(0, me.lives));
        }
        youDot.style.background = PAC_COLORS[playerIndex];
        rivalChip.hidden = !rival;
        if (rival) {
            setText(hudRival, "rival", rival.score);
            rivalDot.style.background = PAC_COLORS[1 - playerIndex];
            setText(rivalLabel, "rlabel", state.mode === "bot" ? "Bot" : "Rival (P" + (2 - playerIndex) + ")");
        }
        setText(youLabel, "ylabel", state.mode === "versus" ? "You (P" + (playerIndex + 1) + ")" : "You");

        let status = "Ready", dotColor = "#64748b";
        if (state.phase === "playing") { status = online ? "Online · Level " + state.level : "Level " + state.level; dotColor = "#34d399"; }
        else if (state.phase === "ready") { status = "Get ready…"; dotColor = "#fbbf24"; }
        else if (state.phase === "dead") { status = "Ouch!"; dotColor = "#f87171"; }
        else if (state.phase === "clear") { status = "Level clear"; dotColor = "#34d399"; }
        else if (state.phase === "over") { status = "Game over"; dotColor = "#f87171"; }
        if (ui.paused) { status = "Paused"; dotColor = "#fbbf24"; }
        setText(statusEl, "status", status);
        statusDot.style.background = dotColor;

        if (state.msg.t > 0) { msgEl.textContent = state.msg.text; msgEl.classList.add("show"); }
        else msgEl.classList.remove("show");
        readyText.setAttribute("opacity", state.phase === "ready" ? 1 : 0);

        ov.lobby.hidden = state.phase !== "lobby";
        if (state.phase === "lobby") {
            modeRow.hidden = online;
            startBtn.hidden = online && !room.isHost;
            lobbySub.textContent = online
                ? (room.isHost
                    ? "Match 2 pemain. Posisi spawn dan giliran pertama diacak. Kamu: " + playerName + " (P1). Mulai jika kedua pemain sudah masuk."
                    : "Menunggu host memulai pertandingan… Kamu: " + playerName + " (P2).")
                : "Makan semua dot untuk naik level. Pellet membuat hantu biru — makan mereka untuk poin bonus. Lawan bot? Pilih VS Bot.";
            const soloBtn = root.querySelector('[data-act="solo"]'), botBtn = root.querySelector('[data-act="bot"]');
            soloBtn.classList.toggle("active", ui.modeChoice === "solo");
            botBtn.classList.toggle("active", ui.modeChoice === "bot");
            startBtn.textContent = online ? "Start match" : "Start game";
        }
        ov.pause.hidden = !(ui.paused && !online);
        ov.clear.hidden = state.phase !== "clear";
        if (state.phase === "clear") {
            clearTitle.textContent = "Level " + state.level + " clear!";
            clearSub.textContent = "+500 bonus. Maze baru dalam " + Math.max(0, Math.ceil(state.clearT)) + "s…";
            nextBtn.hidden = !authority;
        }
        ov.over.hidden = state.phase !== "over";
        if (state.phase === "over") {
            let title;
            if (state.mode === "solo") title = "Game over";
            else if (state.winner === -2) title = "Draw!";
            else if (state.winner === playerIndex) title = "You win!";
            else title = state.mode === "bot" ? "Bot wins!" : "Rival wins!";
            overTitle.textContent = title;
            overSub.textContent = rival
                ? "You " + me.score + " · " + (state.mode === "bot" ? "Bot" : "Rival") + " " + rival.score + " · Best " + best
                : "Score " + me.score + " · Best " + best + " · Level " + state.level;
            menuBtn.hidden = !authority;
        }
        ov.help.hidden = !ui.help;
        ov.cheats.hidden = !(ui.cheats && authority);
        pauseBtn.hidden = online;
        restartBtn.hidden = !authority;
        cheatsBtn.hidden = !authority;
        if (online) cheatNote.textContent = "Hanya host yang bisa memakai cheat (berlaku untuk semua pemain).";
        const boxes = root.querySelectorAll("[data-cheat]");
        for (let i = 0; i < boxes.length; i++) boxes[i].checked = !!state.cheats[boxes[i].dataset.cheat];
    }

    /* ---------- input: keyboard, mouse, sentuh ---------- */
    function setPaused(v) {
        if (online || !state) return;
        if (state.phase !== "playing" && state.phase !== "ready") return;
        ui.paused = v;
    }
    function handleClick(event) {
        const b = event.target.closest("[data-act]");
        if (!b) return;
        const act = b.dataset.act;
        if (act === "exit") { onExit(); return; }
        if (act === "solo" || act === "bot") { ui.modeChoice = act; render(); return; }
        if (act === "start") { submitAction({ type: "start", mode: online ? "versus" : ui.modeChoice }); return; }
        if (act === "next") { submitAction({ type: "next" }); return; }
        if (act === "again") { submitAction({ type: "again" }); return; }
        if (act === "menu") { submitAction({ type: "menu" }); return; }
        if (act === "resume") { setPaused(false); return; }
        if (act === "pause") { setPaused(!ui.paused); return; }
        if (act === "restart") { if (authority && state) startMatch(state.mode); return; }
        if (act === "help") { ui.help = !ui.help; ui.cheats = false; return; }
        if (act === "cheats") { if (authority) { ui.cheats = !ui.cheats; ui.help = false; } return; }
        if (act === "close-help") { ui.help = false; return; }
        if (act === "close-cheats") { ui.cheats = false; return; }
        if (act === "cheat-score") { submitAction({ type: "cheat", key: "score" }); return; }
        if (act === "cheat-life") { submitAction({ type: "cheat", key: "life" }); return; }
        if (act === "cheat-skip") { submitAction({ type: "cheat", key: "skip" }); return; }
    }
    function handleChange(event) {
        const c = event.target.closest("[data-cheat]");
        if (!c) return;
        submitAction({ type: "cheat", key: c.dataset.cheat, value: c.checked });
    }
    let steering = false;
    function steer(event) {
        if (!state) return;
        const me = state.players[playerIndex];
        if (!me || !me.alive) return;
        const r = svg.getBoundingClientRect();
        if (!r.width || !r.height) return;
        const scale = Math.min(r.width / W, r.height / H);
        const ox = (r.width - W * scale) / 2, oy = (r.height - H * scale) / 2;
        const cx = (event.clientX - r.left - ox) / scale / CELL - 0.5;
        const cy = (event.clientY - r.top - oy) / scale / CELL - 0.5;
        const pos = floatPos(me);
        const dx = cx - pos.x, dy = cy - pos.y;
        if (Math.abs(dx) < 0.25 && Math.abs(dy) < 0.25) return;
        const d = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : (dy > 0 ? "down" : "up");
        submitAction({ type: "dir", dir: d });
    }
    function handlePointerDown(event) {
        const db = event.target.closest("[data-dir]");
        if (db) { event.preventDefault(); submitAction({ type: "dir", dir: db.dataset.dir }); return; }
        if (event.target.closest(".pm-svg")) {
            steering = true;
            try { svg.setPointerCapture(event.pointerId); } catch (e) { }
            steer(event);
        }
    }
    function handlePointerMove(event) { if (steering) steer(event); }
    function handlePointerUp() { steering = false; }
    const KEYS = {
        ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right",
        w: "up", s: "down", a: "left", d: "right", W: "up", S: "down", A: "left", D: "right",
    };
    function onKey(e) {
        if (destroyed) return;
        const tag = (e.target && e.target.tagName) || "";
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
        const k = e.key;
        if (KEYS[k]) { e.preventDefault(); submitAction({ type: "dir", dir: KEYS[k] }); return; }
        if (k === " " || k === "Enter") {
            if (!state) return;
            e.preventDefault();
            if (ui.paused) { setPaused(false); return; }
            if (state.phase === "lobby" && authority) submitAction({ type: "start", mode: online ? "versus" : ui.modeChoice });
            else if (state.phase === "clear" && authority) submitAction({ type: "next" });
            else if (state.phase === "over") submitAction({ type: "again" });
            return;
        }
        if (k === "p" || k === "P") { setPaused(!ui.paused); return; }
        if (k === "c" || k === "C") { if (authority) { ui.cheats = !ui.cheats; ui.help = false; } return; }
        if (k === "h" || k === "H") { ui.help = !ui.help; ui.cheats = false; return; }
        if (k === "r" || k === "R") { if (authority && state) startMatch(state.mode); return; }
        if (k === "Escape") {
            if (ui.help || ui.cheats) { ui.help = false; ui.cheats = false; }
            else if (state && state.phase === "playing") setPaused(!ui.paused);
        }
    }
    root.addEventListener("click", handleClick);
    root.addEventListener("change", handleChange);
    root.addEventListener("pointerdown", handlePointerDown);
    svg.addEventListener("pointermove", handlePointerMove);
    svg.addEventListener("pointerup", handlePointerUp);
    svg.addEventListener("pointercancel", handlePointerUp);
    document.addEventListener("keydown", onKey);

    /* ---------- loop utama ---------- */
    let raf = 0, last = performance.now();
    function frame(ts) {
        if (destroyed) return;
        const dt = Math.min(0.05, (ts - last) / 1000 || 0);
        last = ts;
        if (state) {
            if (authority) { if (!ui.paused) sim(dt); }
            else guestAdvance(dt);
        }
        updateFx(dt);
        render(dt);
        if (authority && online && dirty) publish(false);
        raf = requestAnimationFrame(frame);
    }

    /* ---------- inisialisasi sesuai template ---------- */
    if (online) {
        const offRoom = room.onRoom(function (nextRoom) { roomData = nextRoom; });
        if (typeof offRoom === "function") offs.push(offRoom);
        if (room.isHost) {
            state = createMatch("versus");
            publish(true);
            const offAction = room.onAction(function (action) { applyAction(action, 1); });
            if (typeof offAction === "function") offs.push(offAction);
        } else {
            const offState = room.onState(function (nextState) {
                if (!nextState) return;
                const prev = state;
                state = nextState;
                if (prev && prev.levelSeq === state.levelSeq) diffPops(prev.tiles, state.tiles);
                if (prev && prev.phase !== "over" && state.phase === "over") updateBest();
            });
            if (typeof offState === "function") offs.push(offState);
        }
    } else {
        state = createMatch("solo"); // preview maze di belakang overlay lobby
    }
    render();
    raf = requestAnimationFrame(frame);

    return {
        destroy() {
            destroyed = true;
            if (raf) cancelAnimationFrame(raf);
            document.removeEventListener("keydown", onKey);
            root.removeEventListener("click", handleClick);
            root.removeEventListener("change", handleChange);
            root.removeEventListener("pointerdown", handlePointerDown);
            svg.removeEventListener("pointermove", handlePointerMove);
            svg.removeEventListener("pointerup", handlePointerUp);
            svg.removeEventListener("pointercancel", handlePointerUp);
            for (let i = 0; i < offs.length; i++) { try { offs[i](); } catch (e) { } }
        },
    };
}