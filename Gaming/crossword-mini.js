/* ==== GAME: crossword-mini.js ==== */
/*
- Mengikuti template game: export META + export mount(root, context).
- id META harus sama dengan nama file tanpa .js  ->  crossword-mini.js
- Setelah menaruh file ini, jalankan: node tools/build-games-manifest.mjs
*/

export const META = {
    id: "crossword-mini",
    name: "Mini Crossword",
    category: "words",
    catLabel: "Word",
    desc: "Race a bot or a friend to fill a randomly generated 5x5 mini crossword, one letter per turn.",
    art: '<svg viewBox="0 0 48 48" width="54" height="54" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="6" y="6" width="36" height="36" rx="3"/><path d="M18 6v36M30 6v36M6 18h36M6 30h36"/><rect x="18" y="18" width="12" height="12" fill="currentColor" stroke="none" opacity=".85"/><rect x="30" y="6" width="12" height="12" fill="currentColor" stroke="none" opacity=".85"/></svg>',
    bg: ["#e0e7ff", "#a5b4fc"],
};

/* =============================================================
   PURE LOGIC - kamus + generator crossword acak yang selalu
   bisa diselesaikan. Metode criss-cross: kata dari kamus dipasang
   saling menyilang di grid 5x5, sisanya kotak hitam, lalu diberi
   nomor & clue dengan aturan crossword sungguhan.
   ============================================================= */
const N = 5;
const DICT = [
    "HEART=Organ that pumps blood|EMBER=Glowing remnant of a fire|ABUSE=Misuse or mistreat|RESIN=Sticky substance from pines|TREND=General direction of change",
    "APPLE=Fruit that fell on Newton|BRAVE=Showing courage|CRANE=Long-necked wading bird|DREAM=Images during sleep|EAGLE=Majestic bird of prey",
    "FLAME=Tongue of fire|GRAPE=Wine-making fruit|HOUSE=Place to live|IMAGE=Picture or likeness|JOKER=Comic card in a deck",
    "KOALA=Eucalyptus-loving marsupial|LEMON=Sour yellow citrus|MUSIC=Organized sound|NIGHT=Time after sunset|OCEAN=Vast salt water body",
    "PIANO=Keyboard instrument|QUEEN=Female monarch|RIVER=Flowing watercourse|STONE=Small rock|TIGER=Striped big cat",
    "UNITY=State of being one|VOICE=Sound from the throat|WATER=H2O|YOUTH=Early years of life|ZEBRA=Striped African equine",
    "BREAD=Bakery staple|CHAIR=Seat with a back|DANCE=Move to music|EARTH=Our planet|FRUIT=Apple or orange, e.g.",
    "GLASS=Window material|HONEY=Bees' sweet product|IVORY=Tusk material|JUICE=Squeezed fruit drink|LIGHT=What lamps give",
    "MONEY=Cash and coins|NORTH=Direction to the pole|OLIVE=Martini garnish|PEARL=Gem from an oyster|QUIET=Making little noise",
    "ROBOT=Automated machine|SMILE=Happy expression|TRAIN=Railway vehicle|UNDER=Below|VIDEO=Moving pictures",
    "WHEEL=Round thing that rolls|CLOUD=Sky cotton|STORM=Violent weather|BEACH=Sandy shore|PLANT=Leafy organism",
    "SMELL=Odor|TASTE=Flavor sense|TOUCH=Sense of the fingers|SOUND=What ears detect|SPACE=The final frontier",
    "SUGAR=Sweet crystal|SPICE=Cumin or paprika|BRAIN=Thinking organ|BLOOD=Red bodily fluid|CHESS=Game of kings",
    "CLOCK=Time keeper|COAST=Where land meets sea|CORAL=Reef builder|CROWN=Royal headwear|DIARY=Private daily journal",
    "EIGHT=Number after seven|ELBOW=Arm joint|FAIRY=Tiny winged being|FEAST=Grand meal|FENCE=Boundary barrier",
    "FEVER=High body temperature|FIELD=Open country|FLOUR=Bread-making powder|GHOST=Spooky spirit|GIANT=Huge being",
    "GLOVE=Hand covering|GRASS=Lawn covering|GREEN=Color of leaves|GUEST=Visitor|HABIT=Routine behavior",
    "HASTE=Hurried speed|HORSE=Stable animal|HOTEL=Inn for travelers|IDEAL=Perfect|INDEX=Book's lookup list",
    "JELLY=Fruit spread|KNIFE=Cutting tool|LATER=After now|LASER=Focused light beam|LAUGH=Chuckling sound",
    "LAYER=One of many levels|LEARN=Acquire knowledge|LUNCH=Midday meal|MAGIC=Sorcery|MAPLE=Syrup-making tree",
    "MEDAL=Winner's award|METAL=Iron or copper|METER=Unit of length|MONTH=January or June|MOUSE=Small rodent or clicker",
    "MOUTH=Speaking opening|NURSE=Hospital caregiver|ONION=Tear-jerking vegetable|OPERA=Sung drama|ORBIT=Path around a planet",
    "OTTER=Playful river mammal|PAINT=Wall color coat|PANDA=Bamboo-eating bear|PAPER=Writing sheet|PARTY=Celebration",
    "PEACH=Fuzzy fruit|PENNY=One-cent coin|PHOTO=Camera output|PILOT=Plane driver|PIZZA=Cheesy pie",
    "PLATE=Dinner dish|POINT=Sharp tip|POWER=Strength or authority|PRICE=Cost|PRIDE=Lion group",
    "PRIZE=Contest reward|PROOF=Evidence|PROUD=Pleased with oneself|QUILT=Patchwork bed cover|RADIO=Broadcast receiver",
    "RANCH=Cattle farm|REPLY=Answer|ROBIN=Red-breasted bird|ROUND=Circular|ROYAL=Like a king",
    "RULER=Measuring stick|SALAD=Leafy dish|SAUCE=Gravy or dressing|SCARF=Neck warmer|SCENE=Part of a play",
    "SENSE=Sight or hearing|SHARK=Feared ocean fish|SHEEP=Woolly animal|SHEET=Bed linen|SHINE=Glow brightly",
    "SHIRT=Buttoned top|SHORE=Water's edge|SIGHT=Vision|SKILL=Ability|SLEEP=Nightly rest",
    "SLICE=Cut piece|SLOPE=Incline|SMART=Clever|SMOKE=Fire's gray plume|SNAKE=Legless reptile",
    "SOLAR=Of the sun|SOUTH=Opposite of north|SPARK=Tiny fire bit|SPEAK=Talk|SPEED=Rate of motion",
    "SPOON=Soup utensil|SPORT=Tennis or soccer|STAGE=Theater platform|STAIR=One step|STAMP=Postage sticker",
    "STEAM=Boiling vapor|STEEL=Strong iron alloy|STICK=Twig|STORY=Tale|STOVE=Kitchen cooker",
    "STRAW=Drinking tube|SWEET=Sugary|TABLE=Dining surface|TEACH=Instruct|TEMPO=Musical pace",
    "THICK=Not thin|THUMB=Thick short finger|TIMER=Countdown device|TOAST=Browned bread|TODAY=This day",
    "TOOTH=Chomper|TORCH=Portable flame|TOWEL=Drying cloth|TOWER=Tall structure|TRACK=Running path",
    "TRAIL=Hiking path|TREAT=Special indulgence|TRICK=Clever deception|TRUST=Faith in someone|TRUTH=What facts tell",
    "TULIP=Dutch bulb flower|UNCLE=Parent's brother|UPPER=Higher|URBAN=Of the city|VALUE=Worth",
    "VENUE=Event location|VIRUS=Microscopic invader|VISIT=Go see|VIVID=Bright and clear|WAGON=Four-wheeled cart",
    "WASTE=Squander|WATCH=Wrist timepiece|WEAVE=Interlace threads|WHALE=Huge ocean mammal|WHEAT=Grain for flour",
    "WHITE=Snow's color|WHOLE=Complete|WINDY=Blustery|WITCH=Broom rider|WOMAN=Adult female",
    "WORLD=The globe|WORRY=Feel anxious|WORTH=Value|WRITE=Put words on paper|YACHT=Luxury boat",
    "YEAST=Bread riser|YIELD=Produce or give way|STAR=Night sky twinkle|MOON=Earth's satellite|LAMP=Desk light",
    "TREE=Tall trunked plant|FROG=Pond hopper|BIRD=Feathered animal|FISH=Gilled swimmer|LION=Jungle king",
    "BEAR=Honey-loving mammal|WOLF=Pack hunter|CAVE=Rock hollow|SAND=Beach grains|WAVE=Ocean roller",
    "WIND=Moving air|RAIN=Cloud shower|SNOW=Winter flakes|FIRE=Blaze|GOLD=Precious yellow metal",
    "SALT=Sea seasoning|MILK=Dairy drink|CAKE=Birthday dessert|SOUP=Brothy dish|RICE=Sushi grain",
    "CORN=Yellow cob|PLUM=Purple fruit|PEAR=Bell-shaped fruit|LIME=Green citrus|MINT=Cool herb",
    "ROSE=Love's flower|LEAF=Tree blade|SEED=Plant starter|BOAT=Small vessel|SHIP=Large vessel",
    "ROAD=Route for cars|PATH=Narrow way|DOOR=Room entrance|ROOF=House top|WALL=Room divider",
    "ROOM=House space|DESK=Work table|BOOK=Bound pages|PAGE=Book sheet|WORD=Language unit",
    "SONG=Musical piece|DRUM=Beat keeper|BELL=Ringer|RING=Finger jewelry|KING=Male monarch",
    "CARD=Ace or queen|GAME=Chess or tag|BALL=Round plaything|GOAL=Score target|TEAM=Squad",
    "RACE=Speed contest|SWIM=Move through water|JUMP=Leap|NEST=Bird home|COAT=Outer garment",
    "SHOE=Footwear|SOCK=Foot warmer|BELT=Waist band|LOCK=Key's partner|TENT=Camper's shelter",
    "KITE=Wind flyer|DOLL=Toy figure|GIFT=Present|FLAG=Banner|KNOT=Tied tangle",
    "LACE=Shoe tie|MAIL=Letters and parcels|MARK=Spot or grade|MASK=Face cover|MAZE=Path puzzle",
    "MEAL=Breakfast or dinner|MEAT=Butcher's product|MIND=Thinking faculty|MINE=Ore source|MIST=Light fog",
    "NAIL=Hammer target|NAME=What you're called|NAVY=Deep blue fleet|NECK=Head connector|NEWS=Daily reports",
    "NOSE=Smelling organ|NOTE=Short message|OVEN=Baking chamber|PACK=Bundle|PARK=Green city space",
    "PART=Piece|PINE=Needle tree|PLAN=Scheme|PLAY=Stage show|PLOT=Story line",
    "POEM=Verse|POET=Verse writer|POOL=Swimming spot|PORT=Harbor|POST=Mail or pole",
    "PUMP=Air filler|QUIZ=Short test|RAFT=Floating platform|RAIL=Track bar|READ=Go through a book",
    "REST=Relax|ROCK=Stone or music genre|ROLL=Bread bun|ROPE=Thick cord|RUDE=Impolite",
    "RULE=Regulation|RUSH=Hurry|SAIL=Boat's canvas|SEAL=Ocean mammal or closure|SEAT=Chair",
    "SHED=Garden hut|SILK=Fine fabric|SKIN=Body cover|SOAP=Washing bar|SOFA=Couch",
    "SOIL=Garden earth|SPIN=Whirl|SPOT=Small mark|STEW=Slow-cooked dish|SURF=Ride waves",
    "TALE=Story|TALK=Speak|TAPE=Sticky strip|TASK=Job|TIDE=Sea's rise and fall",
    "TILE=Floor square|TUNE=Melody|VASE=Flower holder|VEST=Sleeveless garment|VOTE=Cast a ballot",
    "WARM=Mildly hot|WASH=Clean with water|WEST=Sunset direction|WING=Flight limb|WIRE=Metal thread",
    "WISH=Hope|WOOD=Tree material|WOOL=Sheep fiber|YARD=Lawn area|ZERO=Nothing numerically",
    "ZONE=Area|CAT=Purring pet|DOG=Barking pet|SUN=Day star|SKY=Blue expanse",
    "SEA=Ocean|ICE=Frozen water|AIR=What we breathe|ARM=Upper limb|EAR=Hearing organ",
    "EYE=Seeing organ|LEG=Walking limb|TOE=Foot digit|LIP=Mouth edge|JAW=Chin bone",
    "HIP=Side joint|RIB=Chest bone|FUR=Animal coat|PAW=Animal foot|ANT=Tiny worker insect",
    "BEE=Honey maker|OWL=Night bird|FOX=Sly canine|PIG=Farm oinker|COW=Milk giver",
    "HEN=Egg layer|EGG=Breakfast oval|OAK=Acorn tree|ELM=Shade tree|IVY=Climbing vine",
    "BUD=Flower-to-be|SAP=Tree fluid|TEA=Hot brewed drink|CUP=Drinking vessel|MUG=Handled cup",
    "POT=Cooking vessel|PAN=Frying dish|JAR=Glass container|BOX=Cardboard container|BAG=Carry sack",
    "HAT=Head cover|CAP=Brimless hat|TIE=Neckwear|KEY=Lock opener|MAP=Route guide",
    "PEN=Writing tool|INK=Pen fluid|ART=Creative work|TOY=Plaything|BAT=Night flyer or club",
    "NET=Mesh catcher|ROW=Line or paddle|SKI=Snow glide|GYM=Workout place|RUN=Sprint",
    "SIT=Take a seat|EAT=Have a meal|SIP=Drink slowly|NAP=Short sleep|BED=Sleep spot",
    "VAN=Minibus|CAR=Road vehicle|BUS=Public ride|CAB=Taxi|JET=Fast plane",
    "HUT=Crude shelter|LOG=Wood chunk|MUD=Wet earth|OIL=Lubricant|ORE=Mined rock",
    "PEA=Green veggie ball|PIE=Baked crust dish|RAT=Long-tailed rodent|RED=Stop-light color|RUG=Floor cover",
    "SAD=Down in the dumps|SHY=Bashful|SIX=Half a dozen|TEN=Two fives|TOP=Highest point",
    "WAX=Candle stuff|WEB=Spider's trap|WIN=Come first|ZOO=Animal park|ACE=Top card",
    "ADD=Sum up|AGE=Years lived|AID=Help|AIM=Point at a target|APE=Great primate",
    "ARC=Curved line|ASH=Fire remains|AXE=Chopping tool|BAD=Not good|BAR=Soap unit",
    "BAY=Coastal inlet|BET=Wager|BOW=Knot or bend|BUY=Purchase|CRY=Weep",
    "CUT=Slice|DAY=24 hours|DIG=Scoop earth|DIM=Not bright|DRY=Not wet",
    "END=Finish|FAN=Cooling device|FAR=Distant|FIT=In shape|FIX=Repair",
    "FLY=Soar|FOG=Thick mist|FUN=Amusement|GAS=Fuel state|GEM=Jewel",
    "GUM=Chewy treat|HAY=Dried grass|HIT=Strike|HOP=Small jump|HOT=Not cold",
    "HUG=Embrace|JAM=Fruit preserve|JOG=Slow run|JOY=Delight|KIT=Tool set",
    "LAP=Sitting shelf|LAW=Legal rule|LID=Cover|LIE=Untruth|LOT=Land parcel",
    "LOW=Not high|MAD=Angry|MAN=Adult male|MAT=Floor pad|MIX=Blend",
    "NOD=Agree with a dip|NUT=Bolt's partner|ODD=Strange|OLD=Aged|ONE=Single",
    "OUT=Not in|OWN=Possess|PAD=Cushion|PAL=Buddy|PAT=Light tap",
    "PAY=Settle a bill|PET=Furry companion|PIN=Fastener|PIT=Fruit center|POP=Soda or burst",
    "PUB=British bar|PUN=Word joke|PUT=Place|RAW=Uncooked|RAY=Light beam",
    "RIM=Edge|RIP=Tear|ROB=Steal|RUB=Massage|SAY=Speak",
    "SEE=View|SET=Group or place|SEW=Stitch|SIN=Wrongdoing|SIR=Formal address",
    "SLY=Sneaky|SOW=Plant seeds|SPY=Secret agent|SUM=Total|TAB=Bill",
    "TAG=Label|TAP=Light knock|TAX=Government levy|TIN=Metal can|TIP=Gratuity",
    "TON=Heavy weight|TOW=Pull along|TRY=Attempt|TUB=Bath|TUG=Yank",
    "TWO=Pair|USE=Employ|VET=Animal doctor|VOW=Promise|WAR=Conflict",
    "WAY=Route|WET=Soaked|WIG=False hair|WIT=Cleverness|YAK=Himalayan ox",
    "YAM=Sweet tuber|YES=Affirmative|ZIP=Fastener sound",
].join("|");

const WORDS = {};
const BY_LEN = { 3: [], 4: [], 5: [] };
const BY_LETTER = {};
DICT.split("|").forEach((pair) => {
    const eq = pair.indexOf("=");
    const w = pair.slice(0, eq), clue = pair.slice(eq + 1);
    WORDS[w] = clue;
    BY_LEN[w.length].push(w);
    Array.from(new Set(w)).forEach((ch) => {
        if (!BY_LETTER[ch]) BY_LETTER[ch] = [];
        BY_LETTER[ch].push(w);
    });
});

/* Puzzle cadangan (hasil generator, tervalidasi) bila generator
   kehabisan waktu - permainan selalu punya level yang valid. */
const FALLBACKS = [
    { sol: "HAY.UU...SGRAPE.U.A..BELT", words: [["GRAPE", "across", 2, 0], ["USE", "down", 0, 4], ["RUB", "down", 2, 1], ["PAL", "down", 2, 3], ["BELT", "across", 4, 1], ["HUG", "down", 0, 0], ["HAY", "across", 0, 0]] },
    { sol: "LEMONE..I.APPLER.I.ANIGHT", words: [["APPLE", "across", 2, 0], ["LEARN", "down", 0, 0], ["OIL", "down", 0, 3], ["NIGHT", "across", 4, 0], ["LEMON", "across", 0, 0], ["EAT", "down", 2, 4], ["PIG", "down", 2, 2]] },
    { sol: "..POPW.I.AOCEANO..I.D.ARM", words: [["OCEAN", "across", 2, 0], ["AIR", "down", 2, 3], ["ARM", "across", 4, 2], ["WOOD", "down", 1, 0], ["PIE", "down", 0, 2], ["PAN", "down", 0, 4], ["POP", "across", 0, 2]] },
];

function pick(arr, rng) { return arr[Math.floor(rng() * arr.length)]; }

/* Satu percobaan menyusun kata saling silang di grid 5x5. */
function crisscross(rng, maxWords) {
    const grid = new Array(N * N).fill(null);
    const orient = new Array(N * N).fill(0); // bitmask 1=across 2=down
    const placed = [];
    const used = new Set();

    function canPlace(word, r, c, horiz) {
        const L = word.length, dr = horiz ? 0 : 1, dc = horiz ? 1 : 0;
        const er = r + dr * (L - 1), ec = c + dc * (L - 1);
        if (r < 0 || c < 0 || er >= N || ec >= N) return null;
        const br = r - dr, bc = c - dc, ar = er + dr, ac = ec + dc;
        if (br >= 0 && bc >= 0 && grid[br * N + bc] !== null) return null;
        if (ar < N && ac < N && grid[ar * N + ac] !== null) return null;
        const bit = horiz ? 1 : 2;
        const cells = [];
        let crossings = 0;
        for (let k = 0; k < L; k++) {
            const rr = r + dr * k, cc = c + dc * k, i = rr * N + cc, cur = grid[i];
            if (cur === null) {
                if (horiz) {
                    if (rr > 0 && grid[i - N] !== null) return null;
                    if (rr < N - 1 && grid[i + N] !== null) return null;
                } else {
                    if (cc > 0 && grid[i - 1] !== null) return null;
                    if (cc < N - 1 && grid[i + 1] !== null) return null;
                }
            } else {
                if (cur !== word[k]) return null;
                if (orient[i] & bit) return null;
                crossings++;
            }
            cells.push(i);
        }
        return { cells, crossings };
    }

    function doPlace(word, r, c, horiz, cells) {
        const bit = horiz ? 1 : 2;
        cells.forEach((i, k) => { grid[i] = word[k]; orient[i] |= bit; });
        placed.push({ word, dir: horiz ? "across" : "down", r, c, cells });
        used.add(word);
    }

    const first = pick(BY_LEN[pick([4, 5], rng)], rng);
    const r0 = pick([1, 2, 3], rng);
    const c0 = Math.floor(rng() * (N + 1 - first.length));
    doPlace(first, r0, c0, true, canPlace(first, r0, c0, true).cells);

    while (placed.length < maxWords) {
        const options = [];
        for (const p of placed) {
            const horiz = p.dir === "down";
            for (const i of p.cells) {
                if (orient[i] === 3) continue;
                const ch = grid[i], r = Math.floor(i / N), c = i % N;
                for (const w of BY_LETTER[ch]) {
                    if (used.has(w)) continue;
                    for (let j = 0; j < w.length; j++) {
                        if (w[j] !== ch) continue;
                        const rr = horiz ? r : r - j, cc = horiz ? c - j : c;
                        const res = canPlace(w, rr, cc, horiz);
                        if (res && res.crossings >= 1) {
                            options.push({ w, r: rr, c: cc, horiz, cells: res.cells, score: res.crossings * 2 + w.length });
                        }
                    }
                }
            }
        }
        if (!options.length) break;
        let best = -1;
        for (const o of options) if (o.score > best) best = o.score;
        const top = options.filter((o) => o.score >= best - 2);
        const o = pick(top, rng);
        doPlace(o.w, o.r, o.c, o.horiz, o.cells);
    }
    let whites = 0;
    for (const g of grid) if (g !== null) whites++;
    return { grid, placed, whites };
}

/* Nomor & daftar clue standar crossword dari grid yang terisi. */
function buildPuzzle(grid) {
    const black = (i) => grid[i] === null;
    const numbers = new Array(N * N).fill(0);
    const across = [], down = [];
    const mk = (dir, n, cells) => {
        const word = cells.map((i) => grid[i]).join("");
        return { n, dir, cells, len: cells.length, word, clue: WORDS[word] || "?" };
    };
    let num = 0;
    for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
        const i = r * N + c;
        if (black(i)) continue;
        const sa = c === 0 || black(i - 1);
        const sd = r === 0 || black(i - N);
        let la = 0, ld = 0;
        if (sa) { let cc = c; while (cc < N && !black(r * N + cc)) { la++; cc++; } }
        if (sd) { let rr = r; while (rr < N && !black(rr * N + c)) { ld++; rr++; } }
        if ((sa && la >= 2) || (sd && ld >= 2)) {
            num++; numbers[i] = num;
            if (sa && la >= 2) { const cells = []; for (let x = c; x < c + la; x++) cells.push(r * N + x); across.push(mk("across", num, cells)); }
            if (sd && ld >= 2) { const cells = []; for (let x = r; x < r + ld; x++) cells.push(x * N + c); down.push(mk("down", num, cells)); }
        }
    }
    let total = 0;
    for (const g of grid) if (g !== null) total++;
    return { id: Math.random().toString(36).slice(2, 10), solution: grid.slice(), numbers, across, down, total };
}

/* Generator level acak: banyak percobaan cepat, ambil yang terbaik. */
function generatePuzzle(rng) {
    rng = rng || Math.random;
    const t0 = Date.now();
    let best = null, bestK = -1, bestW = -1;
    for (let t = 0; t < 40; t++) {
        const cand = crisscross(rng, 10);
        const na = cand.placed.filter((p) => p.dir === "across").length;
        const nd = cand.placed.length - na;
        const k = Math.min(cand.placed.length, 9);
        if (k > bestK || (k === bestK && cand.whites > bestW)) { bestK = k; bestW = cand.whites; best = cand; }
        if (cand.placed.length >= 7 && cand.whites >= 16 && na >= 2 && nd >= 2) break;
        if (Date.now() - t0 > 150) break;
    }
    if (best && best.placed.length >= 5 && best.whites >= 13) {
        const na = best.placed.filter((p) => p.dir === "across").length;
        if (na >= 2 && best.placed.length - na >= 2) return buildPuzzle(best.grid);
    }
    const fb = pick(FALLBACKS, rng);
    const grid = fb.sol.split("").map((ch) => (ch === "." ? null : ch));
    return buildPuzzle(grid);
}

/* Diekspos untuk pengujian (opsional, tidak dibaca oleh manifest). */
export const _test = { generatePuzzle, buildPuzzle, crisscross, WORDS, FALLBACKS };

/* =============================================================
   MOUNT - UI minimalis, mode vs bot (ai) & multiplayer (room).
   Aturan: isi kotak kosong bergantian, satu huruf per giliran.
   Huruf benar = +1 poin & terkunci; salah = giliran pindah.
   Semua kotak terisi -> skor tertinggi menang.
   ============================================================= */
export function mount(root, context = {}) {
    const { mode = "ai", room = null, playerName = "Player", onExit = () => { } } = context;
    const online = mode === "room" && Boolean(room);
    let roomData = (room && room.room) || null;
    let state = null;

    /* Posisi pemain (P1/P2) di multiplayer diacak host lewat state.seats;
       giliran pertama juga diacak. Di mode ai, pemain = P1, bot = P2. */
    let sel = 0;
    let dir = "across";
    let builtId = null;
    let announcedRound = 0;
    let cheatOpen = false;
    let peekUntil = 0;
    let peekTimer = null;
    let flashTimer = null;
    let botTimer = null;
    let destroyed = false;
    let timers = [];
    let waitToastAt = 0;
    const coarse = typeof window !== "undefined" && window.matchMedia && window.matchMedia("(pointer: coarse)").matches;
    let showKeys = Boolean(coarse);
    const offs = [];

    const later = (fn, ms) => {
        const t = setTimeout(() => { timers = timers.filter((x) => x !== t); fn(); }, ms);
        timers.push(t);
        return t;
    };

    root.innerHTML = `
<style>
.cw-app{--ink:#0f172a;--mut:#64748b;--line:#e2e8f0;--p0:#4f46e5;--p1:#e11d48;--sel:#c7d2fe;--word:#eef2ff;--cs:clamp(44px,13vw,60px)}
.cw-app [hidden]{display:none!important}
.cw-app .cw-panel{position:relative;background:#fff;border:1px solid var(--line);border-radius:16px;padding:16px;color:var(--ink)}
.cw-app .cw-top{display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:14px}
.cw-app .cw-scores{display:flex;align-items:center;gap:7px;font-size:13px}
.cw-app .cw-score{display:inline-flex;align-items:center;gap:6px;padding:4px 10px;border:1px solid var(--line);border-radius:999px;color:var(--ink);transition:border-color .15s,box-shadow .15s}
.cw-app .cw-score .cw-seat{font-size:10px;font-weight:700;color:var(--mut);letter-spacing:.05em}
.cw-app .cw-score b{font-size:14px}
.cw-app .cw-score.turn0{border-color:var(--p0);box-shadow:0 0 0 1px var(--p0)}
.cw-app .cw-score.turn1{border-color:var(--p1);box-shadow:0 0 0 1px var(--p1)}
.cw-app .cw-dot{width:8px;height:8px;border-radius:50%;flex:none}
.cw-app .cw-dot.d0{background:var(--p0)}
.cw-app .cw-dot.d1{background:var(--p1)}
.cw-app .cw-vs{font-size:11px;color:var(--mut)}
.cw-app .cw-tools{display:flex;gap:6px;flex-wrap:wrap}
.cw-app .cw-btn{font:inherit;font-size:12.5px;font-weight:600;padding:5px 12px;border-radius:8px;border:1px solid var(--line);background:#fff;color:var(--ink);cursor:pointer;transition:border-color .12s,background .12s}
.cw-app .cw-btn:hover{border-color:#94a3b8}
.cw-app .cw-btn.primary{background:var(--ink);border-color:var(--ink);color:#fff}
.cw-app .cw-main{display:flex;gap:24px;flex-wrap:wrap;align-items:flex-start;justify-content:center}
.cw-app .cw-boardwrap{position:relative;flex:none}
.cw-app .cw-board{display:grid;grid-template-columns:repeat(5,var(--cs));grid-auto-rows:var(--cs);gap:1px;background:var(--ink);border:2px solid var(--ink);user-select:none}
.cw-app .cw-cell{position:relative;background:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:calc(var(--cs)*.46);cursor:pointer;color:var(--ink);transition:background .1s}
.cw-app .cw-cell.black{background:var(--ink);cursor:default}
.cw-app .cw-cell.word{background:var(--word)}
.cw-app .cw-cell.sel{background:var(--sel)}
.cw-app .cw-cell .cw-num{position:absolute;top:2px;left:3px;font-size:9px;font-weight:600;line-height:1;color:var(--mut)}
.cw-app .cw-cell.own0{color:var(--p0)}
.cw-app .cw-cell.own1{color:var(--p1)}
.cw-app .cw-cell.bad{background:#fee2e2;color:#b91c1c}
.cw-app .cw-cell.ghost{color:#94a3b8}
.cw-app .cw-clues{display:flex;gap:20px;flex:1;min-width:230px;max-width:440px}
.cw-app .cw-clues>div{flex:1;min-width:0}
.cw-app .cw-clues h3{margin:0 0 6px;font-size:11px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:var(--mut)}
.cw-app .cw-clues ol{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:3px}
.cw-app .cw-clue{display:flex;gap:7px;align-items:baseline;font-size:12.5px;line-height:1.45;padding:3px 7px;border-radius:6px;cursor:pointer;color:#334155}
.cw-app .cw-clue b{min-width:14px;text-align:right;font-weight:700;color:var(--ink)}
.cw-app .cw-clue em{font-style:normal;font-size:10.5px;color:#94a3b8;margin-left:auto}
.cw-app .cw-clue:hover{background:#f8fafc}
.cw-app .cw-clue.active{background:var(--word)}
.cw-app .cw-clue.done{color:#94a3b8}
.cw-app .cw-clue.done b{color:#94a3b8}
.cw-app .cw-keys{margin-top:14px;display:flex;flex-direction:column;gap:5px;align-items:center}
.cw-app .cw-krow{display:flex;gap:5px;justify-content:center}
.cw-app .cw-key{min-width:clamp(26px,8vw,34px);height:38px;padding:0 7px;border-radius:7px;border:1px solid var(--line);background:#f8fafc;font:inherit;font-size:14px;font-weight:600;color:var(--ink);cursor:pointer}
.cw-app .cw-key:active{background:var(--sel)}
.cw-app .cw-key.wide{font-size:11px}
.cw-app .cw-key:disabled{opacity:.35;cursor:default}
.cw-app .cw-cheats{position:absolute;inset:0;z-index:6;display:flex;align-items:center;justify-content:center;background:rgba(248,250,252,.75);backdrop-filter:blur(2px);border-radius:16px}
.cw-app .cw-cheat-card{display:flex;flex-direction:column;gap:8px;min-width:210px;padding:16px;background:#fff;border:1px solid var(--line);border-radius:14px;box-shadow:0 12px 32px rgba(15,23,42,.14)}
.cw-app .cw-cheat-card>b{font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:var(--mut)}
.cw-app .cw-result{position:absolute;inset:0;z-index:5;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;text-align:center;background:rgba(255,255,255,.9)}
.cw-app .cw-result b{font-size:20px}
.cw-app .cw-result span{font-size:13px;color:var(--mut)}
.cw-app .cw-toast{position:absolute;left:50%;bottom:10px;transform:translateX(-50%);z-index:7;background:var(--ink);color:#fff;font-size:12px;font-weight:600;padding:5px 14px;border-radius:999px;white-space:nowrap;opacity:0;transition:opacity .25s;pointer-events:none}
.cw-app .cw-toast.on{opacity:1}
@media (max-width:600px){.cw-app .cw-main{gap:14px}.cw-app .cw-clues{max-width:none;width:100%}}
</style>
<div class="game-app cw-app">
  <div class="game-intro">
    <div><h2>Mini Crossword</h2></div>
    <span class="game-status"><i class="game-status-dot"></i><span data-status>Ready</span></span>
  </div>
  <section class="game-panel cw-panel">
    <div class="cw-top">
      <div class="cw-scores">
        <span class="cw-score" data-score="0"><i class="cw-dot d0"></i><span class="cw-seat">P1</span><span data-name="0">You</span><b data-pts="0">0</b></span>
        <span class="cw-vs">vs</span>
        <span class="cw-score" data-score="1"><i class="cw-dot d1"></i><span class="cw-seat">P2</span><span data-name="1">Bot</span><b data-pts="1">0</b></span>
      </div>
      <div class="cw-tools">
        <button class="cw-btn" type="button" data-act="dir" data-dirbtn>Across</button>
        <button class="cw-btn" type="button" data-act="keys">Keys</button>
        <button class="cw-btn" type="button" data-act="cheats">Cheats</button>
        <button class="cw-btn" type="button" data-act="restart">New</button>
      </div>
    </div>
    <div class="cw-main">
      <div class="cw-boardwrap">
        <div class="cw-board" data-board></div>
        <div class="cw-result" data-result hidden>
          <b data-result-title>You win</b>
          <span data-result-sub>0 - 0</span>
          <button class="cw-btn primary" type="button" data-act="restart">Play again</button>
        </div>
      </div>
      <div class="cw-clues">
        <div><h3>Across</h3><ol data-clues="across"></ol></div>
        <div><h3>Down</h3><ol data-clues="down"></ol></div>
      </div>
    </div>
    <div class="cw-keys" data-keys hidden></div>
    <div class="cw-cheats" data-cheats hidden>
      <div class="cw-cheat-card">
        <b>Cheats</b>
        <button class="cw-btn" type="button" data-cheat="letter">Reveal letter</button>
        <button class="cw-btn" type="button" data-cheat="word">Reveal word</button>
        <button class="cw-btn" type="button" data-cheat="peek">Peek (2s)</button>
        <button class="cw-btn" type="button" data-cheat="solve">Solve grid</button>
        <button class="cw-btn" type="button" data-act="close-cheats">Close</button>
      </div>
    </div>
    <div class="cw-toast" data-toast></div>
  </section>
  <div class="game-actions"><button class="game-action-button" type="button" data-exit>Exit game</button></div>
</div>`;

    const $ = (s) => root.querySelector(s);
    const boardEl = $("[data-board]");
    const statusEl = $("[data-status]");
    const keysEl = $("[data-keys]");
    const cheatsEl = $("[data-cheats]");
    const resultEl = $("[data-result]");
    const resultTitle = $("[data-result-title]");
    const resultSub = $("[data-result-sub]");
    const toastEl = $("[data-toast]");
    const dirBtn = $("[data-dirbtn]");
    const scoreEls = [root.querySelector('[data-score="0"]'), root.querySelector('[data-score="1"]')];
    const nameEls = [root.querySelector('[data-name="0"]'), root.querySelector('[data-name="1"]')];
    const ptsEls = [root.querySelector('[data-pts="0"]'), root.querySelector('[data-pts="1"]')];
    const clueEls = { across: root.querySelector('[data-clues="across"]'), down: root.querySelector('[data-clues="down"]') };

    /* ---------- DOM papan & keyboard virtual ---------- */
    const cellEls = [], letterEls = [], numEls = [];
    for (let i = 0; i < N * N; i++) {
        const d = document.createElement("div");
        d.className = "cw-cell";
        d.dataset.cell = String(i);
        const num = document.createElement("span");
        num.className = "cw-num";
        const letter = document.createElement("span");
        d.appendChild(num); d.appendChild(letter);
        boardEl.appendChild(d);
        cellEls.push(d); numEls.push(num); letterEls.push(letter);
    }
    function mkKey(k, label, wide) {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "cw-key" + (wide ? " wide" : "");
        b.dataset.key = k;
        b.textContent = label;
        return b;
    }
    ["QWERTYUIOP", "ASDFGHJKL", "ZXCVBNM"].forEach((row, ri) => {
        const r = document.createElement("div");
        r.className = "cw-krow";
        if (ri === 2) r.appendChild(mkKey("word", "Word", true));
        for (const ch of row) r.appendChild(mkKey(ch, ch, false));
        if (ri === 2) r.appendChild(mkKey("del", "Del", true));
        keysEl.appendChild(r);
    });

    /* ---------- state & aturan main ---------- */
    const cellSlots = { across: new Array(N * N).fill(-1), down: new Array(N * N).fill(-1) };
    const otherDir = (d) => (d === "across" ? "down" : "across");
    const mySlot = () => (online ? (state ? state.seats[room.isHost ? 0 : 1] : (room.isHost ? 0 : 1)) : 0);
    const slotName = (s) => (s === mySlot() ? (playerName || "You") : (online ? "Opponent" : "Bot"));
    const emptyCells = () => {
        const out = [];
        for (let i = 0; i < N * N; i++) if (state.puzzle.solution[i] !== null && !state.filled[i]) out.push(i);
        return out;
    };
    const isComplete = () => emptyCells().length === 0;

    function newRound() {
        return {
            puzzle: generatePuzzle(),
            filled: new Array(N * N).fill(""),
            owners: new Array(N * N).fill(-1),
            scores: [0, 0],
            seats: online ? (Math.random() < 0.5 ? [0, 1] : [1, 0]) : [0, 1],
            turn: Math.random() < 0.5 ? 0 : 1,
            over: false,
            winner: null,
            last: null,
            round: state ? state.round + 1 : 1,
        };
    }

    function finish() {
        state.over = true;
        state.winner = state.scores[0] > state.scores[1] ? 0 : state.scores[1] > state.scores[0] ? 1 : null;
    }

    function render() {
        if (!state || !state.puzzle) { statusEl.textContent = online ? "Waiting for host..." : "Ready"; return; }
        if (state.puzzle.id !== builtId) rebuildPuzzleDom();
        const me = mySlot();
        const myTurn = !state.over && state.turn === me;
        const slot = currentSlot();
        const wordSet = new Set(slot ? slot.cells : []);
        const peeking = Date.now() < peekUntil;
        const last = state.last;
        const flash = last && !last.ok && Date.now() - last.ts < 700;

        for (let i = 0; i < N * N; i++) {
            const d = cellEls[i], L = letterEls[i];
            const black = state.puzzle.solution[i] === null;
            d.classList.toggle("black", black);
            if (black) { L.textContent = ""; d.classList.remove("sel", "word", "own0", "own1", "bad", "ghost"); continue; }
            const v = state.filled[i];
            const ghost = !v && peeking;
            L.textContent = v || (ghost ? state.puzzle.solution[i] : "");
            d.classList.toggle("ghost", ghost);
            d.classList.toggle("sel", i === sel && !state.over);
            d.classList.toggle("word", wordSet.has(i) && i !== sel && !state.over);
            d.classList.toggle("own0", state.owners[i] === 0);
            d.classList.toggle("own1", state.owners[i] === 1);
            d.classList.toggle("bad", Boolean(flash) && last.i === i);
        }
        for (const d of ["across", "down"]) {
            const lis = clueEls[d].children;
            state.puzzle[d].forEach((s, si) => {
                const li = lis[si];
                if (!li) return;
                li.classList.toggle("active", slot === s && !state.over);
                li.classList.toggle("done", s.cells.every((i) => state.filled[i]));
            });
        }
        for (const s of [0, 1]) {
            nameEls[s].textContent = slotName(s);
            ptsEls[s].textContent = String(state.scores[s]);
            scoreEls[s].classList.toggle("turn0", !state.over && state.turn === s && s === 0);
            scoreEls[s].classList.toggle("turn1", !state.over && state.turn === s && s === 1);
        }
        statusEl.textContent = state.over
            ? (state.winner === null ? "Draw" : state.winner === me ? "You win" : online ? "Opponent wins" : "Bot wins")
            : (myTurn ? "Your turn" : online ? slotName(state.turn) + "'s turn" : "Bot is thinking...");
        dirBtn.textContent = dir === "across" ? "Across" : "Down";
        keysEl.hidden = !showKeys;
        keysEl.querySelectorAll("button").forEach((b) => { b.disabled = !myTurn; });
        cheatsEl.hidden = !cheatOpen;
        resultEl.hidden = !state.over;
        if (state.over) {
            resultTitle.textContent = state.winner === null ? "Draw" : state.winner === me ? "You win" : online ? "Opponent wins" : "Bot wins";
            resultSub.textContent = state.scores[0] + " - " + state.scores[1];
        }
        if (state.round !== announcedRound) {
            announcedRound = state.round;
            const starter = state.turn === me ? "you start" : online ? "P" + (state.turn + 1) + " starts" : "bot starts";
            toast("You are P" + (me + 1) + " - " + starter);
        }
        if (flash && !flashTimer) {
            flashTimer = later(() => { flashTimer = null; if (state && state.last === last) state.last = null; render(); }, 720);
        }
        if (peeking && !peekTimer) {
            peekTimer = later(() => { peekTimer = null; render(); }, Math.max(30, peekUntil - Date.now() + 30));
        }
        scheduleBot();
    }

    function rebuildPuzzleDom() {
        const p = state.puzzle;
        for (const d of ["across", "down"]) {
            cellSlots[d].fill(-1);
            p[d].forEach((s, si) => s.cells.forEach((i) => { cellSlots[d][i] = si; }));
        }
        for (let i = 0; i < N * N; i++) numEls[i].textContent = p.numbers[i] ? String(p.numbers[i]) : "";
        for (const d of ["across", "down"]) {
            const ul = clueEls[d];
            ul.innerHTML = "";
            p[d].forEach((s) => {
                const li = document.createElement("li");
                li.className = "cw-clue";
                li.dataset.clue = "1";
                li.dataset.dir = d;
                li.dataset.n = String(s.n);
                const b = document.createElement("b"); b.textContent = String(s.n);
                const span = document.createElement("span"); span.textContent = s.clue;
                const em = document.createElement("em"); em.textContent = String(s.len);
                li.appendChild(b); li.appendChild(span); li.appendChild(em);
                ul.appendChild(li);
            });
        }
        const first = p.solution.findIndex((v) => v !== null);
        sel = first >= 0 ? first : 0;
        dir = "across";
        selectCell(sel);
        builtId = p.id;
    }

    function publish() {
        render();
        if (online && room.isHost) room.publishState(state).catch(console.warn);
    }

    function applyAction(action, actor) {
        if (!state || !action || typeof action !== "object") return;
        if (action.type === "restart") { state = newRound(); publish(); return; }
        if (state.over || (actor !== 0 && actor !== 1)) return;
        if (action.type === "place") {
            if (actor !== state.turn) return;
            const i = action.i, ch = action.ch;
            if (!Number.isInteger(i) || i < 0 || i >= N * N) return;
            if (state.puzzle.solution[i] === null || state.filled[i]) return;
            if (typeof ch !== "string" || !/^[A-Z]$/.test(ch)) return;
            const ok = state.puzzle.solution[i] === ch;
            state.last = { i, ok, by: actor, ch, ts: Date.now() };
            if (ok) { state.filled[i] = ch; state.owners[i] = actor; state.scores[actor]++; }
            if (isComplete()) finish(); else state.turn = 1 - state.turn;
            publish();
        } else if (action.type === "cheat") {
            let targets = [];
            if (action.kind === "letter") {
                const i = Number.isInteger(action.i) ? action.i : -1;
                if (i >= 0 && i < N * N && state.puzzle.solution[i] !== null && !state.filled[i]) targets = [i];
                else { const e = emptyCells(); if (e.length) targets = [e[Math.floor(Math.random() * e.length)]]; }
            } else if (action.kind === "word") {
                const d = action.dir === "down" ? "down" : "across";
                const i = Number.isInteger(action.i) ? action.i : sel;
                const si = i >= 0 && i < N * N ? cellSlots[d][i] : -1;
                if (si >= 0) targets = state.puzzle[d][si].cells.filter((j) => !state.filled[j]);
                if (!targets.length) { const e = emptyCells(); if (e.length) targets = [e[Math.floor(Math.random() * e.length)]]; }
            } else if (action.kind === "solve") {
                targets = emptyCells();
            } else return;
            if (!targets.length) return;
            for (const i of targets) { state.filled[i] = state.puzzle.solution[i]; state.owners[i] = actor; state.scores[actor]++; }
            const li = targets[targets.length - 1];
            state.last = { i: li, ok: true, by: actor, ch: state.filled[li], ts: Date.now(), cheat: true };
            if (isComplete()) finish();
            publish();
        }
    }

    function submitAction(action) {
        if (online && !room.isHost) { room.sendAction(action).catch(console.warn); return; }
        applyAction(action, mySlot());
    }

    /* ---------- navigasi pilihan ---------- */
    function currentSlot() {
        if (!state) return null;
        const si = cellSlots[dir][sel];
        return si >= 0 ? state.puzzle[dir][si] : null;
    }
    function firstEmptyOf(slot) {
        for (const i of slot.cells) if (!state.filled[i]) return i;
        return slot.cells[0];
    }
    function selectCell(i, pref) {
        sel = i;
        if (pref && cellSlots[pref][i] >= 0) dir = pref;
        if (cellSlots[dir][i] < 0 && cellSlots[otherDir(dir)][i] >= 0) dir = otherDir(dir);
    }
    function toggleDir() {
        if (state && cellSlots[otherDir(dir)][sel] >= 0) dir = otherDir(dir);
    }
    function advance() {
        const s = currentSlot();
        if (!s) return;
        const k = s.cells.indexOf(sel);
        for (let step = 1; step <= s.cells.length; step++) {
            const i = s.cells[(k + step) % s.cells.length];
            if (!state.filled[i]) { sel = i; return; }
        }
    }
    function retreat() {
        const s = currentSlot();
        if (!s) return;
        const k = s.cells.indexOf(sel);
        sel = s.cells[(k - 1 + s.cells.length) % s.cells.length];
    }
    function moveSel(dr, dc) {
        if (!state) return;
        let r = Math.floor(sel / N), c = sel % N;
        for (let step = 0; step < N; step++) {
            r += dr; c += dc;
            if (r < 0 || r >= N || c < 0 || c >= N) return;
            const i = r * N + c;
            if (state.puzzle.solution[i] !== null) { selectCell(i, dr !== 0 ? "down" : "across"); return; }
        }
    }
    function nextWord(back) {
        if (!state) return;
        const list = state.puzzle[dir];
        if (!list.length) return;
        let si = cellSlots[dir][sel];
        if (si < 0) si = 0;
        si = (si + (back ? -1 : 1) + list.length) % list.length;
        sel = firstEmptyOf(list[si]);
    }

    /* ---------- input huruf ---------- */
    function flashWait() {
        const n = Date.now();
        if (n - waitToastAt > 1500) { waitToastAt = n; toast(online ? "Wait for your turn" : "Bot is playing..."); }
    }
    function tryPlace(ch) {
        if (!state || state.over) return;
        if (state.turn !== mySlot()) { flashWait(); return; }
        if (state.puzzle.solution[sel] === null) return;
        if (state.filled[sel]) {
            advance();
            if (state.filled[sel]) { const e = emptyCells(); if (!e.length) return; sel = e[0]; }
        }
        const i = sel;
        submitAction({ type: "place", i, ch });
        advance();
        render();
    }

    /* ---------- bot (mode ai) ---------- */
    function scheduleBot() {
        if (online || !state || state.over || state.turn !== 1 || botTimer || destroyed) return;
        botTimer = setTimeout(() => { botTimer = null; botMove(); }, 800 + Math.random() * 900);
    }
    function botMove() {
        if (destroyed || !state || state.over || state.turn !== 1) return;
        const empt = emptyCells();
        if (!empt.length) return;
        const weights = empt.map((i) => {
            let wgt = 1;
            for (const d of ["across", "down"]) {
                const si = cellSlots[d][i];
                if (si >= 0) for (const j of state.puzzle[d][si].cells) if (state.filled[j]) wgt++;
            }
            return wgt;
        });
        let tot = 0; for (const w of weights) tot += w;
        let x = Math.random() * tot, chosen = empt[0];
        for (let k = 0; k < empt.length; k++) { x -= weights[k]; if (x <= 0) { chosen = empt[k]; break; } }
        const sol = state.puzzle.solution[chosen];
        let ch = sol;
        if (Math.random() > 0.72) {
            const opts = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".replace(sol, "");
            ch = opts[Math.floor(Math.random() * opts.length)];
        }
        applyAction({ type: "place", i: chosen, ch }, 1);
    }

    /* ---------- toast ---------- */
    let toastTimer = null;
    function toast(msg) {
        toastEl.textContent = msg;
        toastEl.classList.add("on");
        if (toastTimer) clearTimeout(toastTimer);
        toastTimer = later(() => { toastEl.classList.remove("on"); toastTimer = null; }, 2400);
    }

    /* ---------- event: mouse / sentuh (delegasi) ---------- */
    function handleClick(event) {
        const t = event.target;
        if (!t || !t.closest) return;
        if (t.closest("[data-exit]")) { onExit(); return; }
        const act = t.closest("[data-act]");
        if (act) {
            const a = act.dataset.act;
            if (a === "restart") submitAction({ type: "restart" });
            else if (a === "cheats") { cheatOpen = !cheatOpen; render(); }
            else if (a === "close-cheats") { cheatOpen = false; render(); }
            else if (a === "keys") { showKeys = !showKeys; render(); }
            else if (a === "dir") { toggleDir(); render(); }
            return;
        }
        const cheat = t.closest("[data-cheat]");
        if (cheat) {
            const kind = cheat.dataset.cheat;
            cheatOpen = false;
            if (kind === "peek") { peekUntil = Date.now() + 2000; render(); return; }
            submitAction({ type: "cheat", kind, i: sel, dir });
            render();
            return;
        }
        const key = t.closest("[data-key]");
        if (key) {
            const k = key.dataset.key;
            if (k === "del") { retreat(); render(); }
            else if (k === "word") { nextWord(false); render(); }
            else tryPlace(k);
            return;
        }
        const clue = t.closest("[data-clue]");
        if (clue && state) {
            const d = clue.dataset.dir;
            const n = Number(clue.dataset.n);
            const slot = state.puzzle[d].find((s) => s.n === n);
            if (slot) { dir = d; sel = firstEmptyOf(slot); render(); }
            return;
        }
        const cell = t.closest("[data-cell]");
        if (cell && state) {
            const i = Number(cell.dataset.cell);
            if (state.puzzle.solution[i] === null) return;
            if (i === sel) toggleDir(); else selectCell(i);
            render();
        }
    }

    /* ---------- event: keyboard fisik (desktop) ---------- */
    function handleKey(e) {
        if (destroyed || !state) return;
        const t = e.target;
        if (t && t.closest && t.closest("input,textarea,select,[contenteditable=true]")) return;
        if (e.ctrlKey || e.metaKey || e.altKey) return;
        const k = e.key;
        if (k === "Escape") { if (cheatOpen) { cheatOpen = false; render(); } return; }
        if (state.over) { if (k === "Enter") submitAction({ type: "restart" }); return; }
        if (k === "ArrowLeft") { e.preventDefault(); moveSel(0, -1); render(); }
        else if (k === "ArrowRight") { e.preventDefault(); moveSel(0, 1); render(); }
        else if (k === "ArrowUp") { e.preventDefault(); moveSel(-1, 0); render(); }
        else if (k === "ArrowDown") { e.preventDefault(); moveSel(1, 0); render(); }
        else if (k === "Backspace") { e.preventDefault(); retreat(); render(); }
        else if (k === "Tab") { e.preventDefault(); nextWord(e.shiftKey); render(); }
        else if (k === "Enter" || k === " ") { e.preventDefault(); toggleDir(); render(); }
        else if (/^[a-zA-Z]$/.test(k)) { e.preventDefault(); tryPlace(k.toUpperCase()); }
    }

    root.addEventListener("click", handleClick);
    document.addEventListener("keydown", handleKey);

    /* ---------- wiring mode ---------- */
    const sub = (fn) => { const off = fn(); if (typeof off === "function") offs.push(off); };
    if (online) {
        sub(() => room.onRoom((nextRoom) => { roomData = nextRoom; render(); }));
        if (room.isHost) {
            state = newRound();
            publish();
            sub(() => room.onAction((action) => applyAction(action, state ? state.seats[1] : 1)));
        } else {
            sub(() => room.onState((nextState) => { if (nextState) { state = nextState; render(); } }));
            render();
        }
    } else {
        state = newRound();
        render();
    }

    return {
        destroy() {
            destroyed = true;
            root.removeEventListener("click", handleClick);
            document.removeEventListener("keydown", handleKey);
            if (botTimer) { clearTimeout(botTimer); botTimer = null; }
            timers.forEach(clearTimeout);
            timers = [];
            offs.forEach((f) => { try { f(); } catch (err) { /* noop */ } });
        },
    };
}