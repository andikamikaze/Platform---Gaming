import { GAME_MODES } from "./game-modes.js";

/* Detail tambahan untuk kartu game.
 * Entri khusus dipakai bila tersedia; sisanya diisi oleh template per kategori
 * lewat resolveGameInfo(), supaya setiap dialog selalu punya:
 * deskripsi, Musuh / rintangan, Mode, dan Kontrol. */
export const GAME_INFO = Object.freeze({
  "alien-siege": {
    overview:
      "Bangun markas, pasang turret, dan kerahkan pasukan darat, laut, udara, serta robot untuk menahan invasi. Setiap level dibuat acak tetapi selalu bisa diselesaikan.",
    enemies: ["Alien serangga", "Robot penyerang", "Pasukan darat", "Unit laut dan udara"],
    modes: ["Solo vs AI", "Co-op 2 pemain"],
    controls: "Klik kiri untuk memilih atau menyeret kotak, klik kanan untuk bergerak/serang. WASD/panah menggeser kamera dan roda mouse zoom. Di layar sentuh, tap unit lalu tap target; tombol virtual muncul otomatis.",
  },
  "cave-explorer": {
    overview:
      "Jelajahi gua yang dibuat secara acak. Kumpulkan permata, hindari jebakan, dan capai pintu keluar lebih cepat dari lawan.",
    challenges: ["Spike", "Gergaji berputar", "Kelelawar", "Stalaktit jatuh"],
    modes: ["Balapan solo", "Lawan bot atau teman"],
    controls: "Gunakan panah/WASD atau tombol arah di layar untuk bergerak. Ambil permata dengan menyentuhnya dan hindari jebakan yang terlihat.",
  },
  "count-master": {
    overview:
      "Arahkan kerumunan angka melewati gerbang matematika yang lebih menguntungkan. Hindari rintangan dan kalahkan bos di akhir lintasan.",
    challenges: ["Gerbang operasi hitung", "Palu", "Bos di akhir level"],
    modes: ["Solo", "Lawan rival"],
    controls: "Geser atau gesek kerumunan ke gerbang pilihan. Hindari palu dan serangan musuh dengan mengubah arah lintasan.",
  },
  "fruit-slice": {
    overview:
      "Tebas buah yang beterbangan dengan gerakan mengiris. Rantai kombo untuk skor lebih tinggi, tetapi jangan pernah menyentuh bom.",
    enemies: ["Bom"],
    modes: ["Solo"],
    controls: "Geser atau gesek layar mengikuti arah datangnya buah. Lepaskan saat pisau melewati buah, dan menjauh dari bom.",
  },
  "knife-throw": {
    overview:
      "Lempar pisau bergantian ke balok yang berputar. Setiap pisau harus menancap tanpa saling bertabrakan.",
    challenges: ["Balok berputar", "Pisau yang sudah tertanam"],
    modes: ["Solo"],
    controls: "Klik atau tap pada posisi balok untuk melempar pisau berikutnya. Perhatikan rotasi dan celah di antara pisau lama.",
  },
  "haunted-house": {
    overview:
      "Jelajahi rumah gelap, kumpulkan empat petunjuk kode, dan keluar sebelum hantu menangkapmu. Cahayamu terus menipis sehingga pintu harus ditemukan dengan cepat.",
    enemies: ["Hantu penjaga rumah", "Kegelapan"],
    modes: ["Solo", "Lawan bot atau teman"],
    controls: "Gunakan panah/WASD atau tombol layar untuk berjalan. Dekati petunjuk atau pintu lalu klik/tap untuk berinteraksi.",
  },
  "mini-dungeon": {
    overview:
      "Lorong bawah tanah bertema irama. Ambil kunci emas, menghindari makhluk yang tidak bisa disentuh, lalu keluar dari ruang bawah tanah.",
    enemies: ["Makhluk mati yang berkeliaran"],
    modes: ["Solo"],
    controls: "Geser karakter mengikuti irama menuju kunci dan pintu keluar. Hindari makhluk yang lewat di lorong.",
  },
  "maze-escape": {
    overview:
      "Telusuri labirin buatan tangan, ambil kunci dan permata, lalu keluar sebelum hantu menangkapmu.",
    enemies: ["Hantu pengejar"],
    modes: ["Solo", "Lawan bot atau teman"],
    controls: "Gunakan panah/WASD atau tombol arah di layar untuk bergerak di labirin. Ambil kunci untuk membuka pintu keluar.",
  },
  "cat-crash": {
    overview:
      "Lempar kucing ke kennel untuk meruntuhkannya. Singkirkan semua anjing di tiga arena yang berbeda.",
    enemies: ["Anjing penjaga", "Kennel"],
    modes: ["Solo", "Tiga arena"],
    controls: "Tarik kucing lalu lepas untuk menembakkan. Atur sudut dan kekuatan sebelum melepas, lalu amati pantulan di arena.",
  },
  "mob-control": {
    overview:
      "Geser meriam dan alirkan pasukan kecil melalui gerbang pengali. Hancurkan markas musuh lebih dulu dari rivalmu.",
    enemies: ["Markas musuh", "Rival"],
    challenges: ["Gerbang pengali yang bergerak"],
    modes: ["Solo", "Lawan rival"],
    controls: "Geser meriam ke kiri/kanan untuk mengatur arah, lepas pasukan, dan pilih gerbang pengali yang paling menguntungkan.",
  },
  "airport-manager": {
    overview:
      "Atur lalu lintas bandara: arahkan pesawat untuk mendarat, kelola landasan dan gerbang, lalu selesaikan sepuluh penerbangan.",
    challenges: ["Sepuluh penerbangan", "Landasan dan gerbang terbatas"],
    modes: ["Solo · 1P"],
    controls: "Klik atau tap pesawat untuk memilihnya, lalu pilih landasan atau gerbang yang kosong. Gunakan tombol aksi untuk mengatur antrean.",
  },
  "mini-soccer": {
    overview:
      "Sepak bola arcade dengan hingga lima pemain per tim, termasuk kiper. Dribble, slide tackle, dan tendangan bertenaga melawan bot atau teman.",
    challenges: ["Lawan bot atau teman", "Level acak"],
    modes: ["Solo vs bot", "Multiplayer"],
    controls: "Pilih pemain dengan klik/tap, lalu gunakan tombol arah untuk bergerak dan tombol aksi untuk tackle, oper, atau tendang.",
  },
});

/* Game yang sudah punya tombol bantuan di dalam game-nya sendiri.
 * Tombol "How to play" global disembunyikan untuk game-game ini. */
export const GAMES_WITH_INTERNAL_HELP = Object.freeze([
  "alien-siege", "airport-manager", "alphabet-learning", "alphabet-match", "arrow-maze", "atom-merge", "badminton", "balloon-pop", "basketball-shot", "battleship", "beat-maker", "blackjack", "block-fill", "block-paint", "block-shift", "border-desk",
  "bowling", "boat-slalom", "bubble-shooter", "bunker-prepper", "carrom", "cat-crash", "cat-vs-dog", "cave-explorer", "checkers", "chess", "circuit-sprint", "city-take-over", "clash-village", "coin-flip", "color-block", "color-sort", "connect-four", "cooking-simulator", "count-master", "count-the-cube", "counting-farm", "crossword-mini", "dice-roller", "domino", "dont-blink", "dots-and-boxes", "drag-strip", "emoji-guess", "escape-room", "farkle", "freecell", "fruit-slice", "geography-quiz", "golf-mini", "guess-who", "hill-climb", "hole-io", "jigsaw-puzzle", "knife-throw", "lane-rush", "lost-island", "lucky-wheel", "ludo", "mahjong", "marble-blast", "math-challenge", "maze-escape", "minesweeper", "mini-dungeon", "music-memory", "nonogram", "cats-wars", "edm-pad", "farming-mini", "food-match-swipe",
  "haunted-house", "hexa-polis", "little-detective", "mini-city-builder", "mini-gta",
  "mini-soccer", "mob-control", "monopoly", "number-connect", "number-hunt", "number-learning", "one-page-quest", "pairs-memory", "paper-io", "reversi", "rock-paper-scissors", "sliding-puzzle", "sprout-defense", "stickman-war", "sword-master", "target-24", "tic-tac-toe", "virtual-piano", "arena-battle", "mini-battle-royale", "number-link", "pesta-bintang", "who-is-it",
  "number-merge", "odd-one-out", "pac-man", "parking-jam", "pattern-party",
  "pemimpin-nusantara", "periodic-quiz", "petdoku", "piano-tiles", "pipe-connect",
  "poker", "poly-tribes", "pong", "pool", "rally-racer", "remember-where",
  "rise-of-empires", "road-crossing", "roulette", "screw-out", "shape-sorter",
  "shikaku", "ship-combat", "sling-puck", "slot-machine", "snake",
  "snakes-and-ladders", "snakes-io", "solitaire", "sorry", "space-invaders",
  "space-shooter", "stack-tower", "star-catcher", "stickman-beat-em-up",
  "stickman-fighter", "stickman-hack-slash", "stickman-ninja", "stickman-shooter",
  "sudoku", "tank-battle", "tank-combat", "tap-match", "tennis", "tetris",
  "tower-guard", "traffic-control", "true-or-false", "uno", "war-of-survivors",
  "water-sort", "whack-a-mole", "word-builder", "word-chain", "word-guess",
  "wordle", "word-scramble", "word-search", "yahtzee", "zombie-survival",
]);

/* Tujuan dan kondisi menang khusus untuk game yang punya entri kurasi. */
const GAME_GOALS = Object.freeze({
  "alien-siege": { goal: "Lindungi HQ dan selesaikan misi yang ditampilkan di atas layar.", win: "Misi selesai sambil HQ tetap berdiri; HQ hancur berarti kalah." },
  "cave-explorer": { goal: "Kumpulkan permata lalu capai pintu keluar gua.", win: "Keluar lebih cepat dari lawan; tertangkap jebakan atau makhluk berarti kalah." },
  "count-master": { goal: "Arahkan kerumunan melewati gerbang terbaik dan kalahkan bos.", win: "Bos dikalahkan dengan sisa angka lebih banyak dari lawan; kerumunan habis berarti kalah." },
  "fruit-slice": { goal: "Iris buah sebanyak mungkin tanpa menyentuh bom.", win: "Skor target tercapai sebelum nyawa habis; bom yang terkena mengakhiri sesi." },
  "knife-throw": { goal: "Tancapkan semua pisau ke balok berputar.", win: "Semua pisau berhasil tertancap tanpa bertabrakan; tabrakan berarti kalah." },
  "haunted-house": { goal: "Temukan empat petunjuk kode dan buka pintu keluar.", win: "Keluar dari rumah sebelum hantu menangkapmu atau cahaya habis." },
  "mini-dungeon": { goal: "Ambil kunci emas dan keluar dari ruang bawah tanah.", win: "Kunci didapat dan pintu tercapai; menyentuh makhluk berarti kalah." },
  "maze-escape": { goal: "Ambil kunci dan permata lalu keluar dari labirin.", win: "Pintu keluar terbuka dan tercapai sebelum hantu menangkapmu." },
  "cat-crash": { goal: "Runtuhkan kennel dan singkirkan semua anjing di arena.", win: "Semua anjing tersingkir dalam batas tembakan yang tersedia." },
  "mob-control": { goal: "Alirkan pasukan melalui gerbang pengali dan hancurkan markas musuh.", win: "Markas musuh hancur lebih dulu dari rival." },
  "airport-manager": { goal: "Arahkan pesawat mendarat dan kelola landasan/gerbang untuk 10 penerbangan.", win: "Sepuluh penerbangan selesai tanpa tabrakan; antrean yang gagal berarti kalah." },
  "mini-soccer": { goal: "Cetak gol lebih banyak dari lawan.", win: "Skor akhir lebih tinggi ketika pertandingan selesai." },
});

/* Template per kategori. Dipakai bila sebuah game tidak punya entri khusus. */
const CATEGORY_INFO = Object.freeze({
  arcade: {
    obstacles: ["Gelombang musuh atau rintangan yang muncul berulang", "Batas waktu, nyawa, atau target skor"],
    controls: "Gunakan mouse, keyboard, atau tombol di layar untuk menggerakkan karakter dan melakukan aksi utama.",
  },
  simulation: {
    obstacles: ["Sumber daya dan antrean yang terus bertambah", "Rival yang mengejar target yang sama"],
    controls: "Klik/tap objek untuk memilih, lalu gunakan panel atau tombol aksi untuk mengatur, membeli, atau memperbaiki.",
  },
  strategy: {
    obstacles: ["Lawan yang mengembangkan pasukan atau basis", "Sumber daya dan wilayah yang terbatas"],
    controls: "Pilih unit atau bangunan, lalu tentukan target/lokasi lewat klik atau tap. Gunakan panel aksi untuk perintah lanjutan.",
  },
  educational: {
    obstacles: ["Jawaban yang salah", "Batas waktu atau nyawa pada beberapa level"],
    controls: "Pilih jawaban atau pasangan yang tepat dengan klik/tap. Beberapa game juga menerima input keyboard.",
  },
  puzzle: {
    obstacles: ["Tata letak atau urutan yang harus dipecahkan", "Batas gerak, waktu, atau skor target"],
    controls: "Klik, geser, atau seret elemen di layar untuk menyusun, menghubungkan, atau memindahkan bagian.",
  },
  sports: {
    obstacles: ["Lawan, baik bot maupun pemain lain", "Aturan pertandingan serta batas skor/waktu"],
    controls: "Arahkan bidikan atau gerakan dengan mouse/keyboard, lalu klik/tap untuk memukul, melempar, atau menendang.",
  },
  kids: {
    obstacles: ["Pilihan yang salah", "Waktu terbatas pada beberapa level"],
    controls: "Klik/tap pilihan yang benar atau ikuti petunjuk yang ditampilkan di layar.",
  },
  board: {
    obstacles: ["Lawan, baik bot maupun pemain lain", "Aturan giliran dan kondisi kemenangan"],
    controls: "Klik/tap bidak atau kartu untuk memilih, lalu pilih langkah atau posisi tujuan yang tersedia.",
  },
  music: {
    obstacles: ["Pola target yang harus diulang", "Ritme dan urutan nada"],
    controls: "Klik/tap pad atau tombol nada sesuai urutan. Gunakan keyboard bila kontrol tersebut tersedia di layar.",
  },
  casino: {
    obstacles: ["Dealer atau lawan taruhan", "Keberuntungan serta batas taruhan/koin"],
    controls: "Pilih taruhan atau aksi lewat tombol yang tersedia, lalu konfirmasi giliranmu.",
  },
  racing: {
    obstacles: ["Rintangan lintasan dan lawan balapan", "Penalti, waktu, atau batas kerusakan"],
    controls: "Gunakan panah/WASD atau tombol kemudi di layar untuk mengarahkan kendaraan.",
  },
  casual: {
    obstacles: ["Rival yang mengejar skor lebih tinggi", "Target skor atau batas percobaan"],
    controls: "Ikuti petunjuk di layar dan klik/tap elemen untuk mengambil keputusan atau melakukan aksi.",
  },
  adventure: {
    obstacles: ["Musuh, jebakan, atau makhluk penjaga", "Petunjuk dan objek yang harus dikumpulkan"],
    controls: "Gunakan panah/WASD atau tombol layar untuk menjelajah, lalu klik/tap objek untuk berinteraksi.",
  },
  words: {
    obstacles: ["Lawan yang menyusun kata lebih cepat", "Batas waktu atau jumlah kata"],
    controls: "Ketik atau klik huruf untuk menyusun kata, lalu kirimkan jawaban.",
  },
  trivia: {
    obstacles: ["Jawaban yang salah", "Waktu atau jumlah nyawa terbatas"],
    controls: "Pilih jawaban dengan klik/tap sebelum waktu habis.",
  },
  cards: {
    obstacles: ["Lawan, baik bot maupun pemain lain", "Aturan kartu dan urutan giliran"],
    controls: "Klik/tap kartu untuk memilih, lalu letakkan atau mainkan di area yang ditentukan.",
  },
  action: {
    obstacles: ["Musuh atau proyektil yang datang", "Bahaya yang harus dihindari"],
    controls: "Arahkan gerakan atau bidikan dengan mouse/sentuhan, lalu klik/tap untuk menyerang.",
  },
  rpg: {
    obstacles: ["Monster dan bos pada setiap act", "Sumber daya, deck, atau nyawa yang terbatas"],
    controls: "Pilih aksi, kartu, atau kombinasi lewat panel yang tersedia, lalu konfirmasi giliranmu.",
  },
});

/* Tujuan dan kondisi menang berdasarkan mekanik tiap kategori. */
const CATEGORY_GOALS = Object.freeze({
  arcade: { goal: "Capai skor tertinggi atau selesaikan seluruh gelombang yang tersedia.", win: "Skor target tercapai atau semua gelombang selesai; nyawa habis berarti kalah." },
  simulation: { goal: "Kelola sumber daya dan selesaikan target sebelum rival melakukannya.", win: "Target selesai lebih dulu; pengelolaan yang buruk membuatmu tertinggal." },
  strategy: { goal: "Kembangkan basis dan pasukan untuk menguasai peta.", win: "Lawan dikalahkan atau misi tercapai; markas hancur berarti kalah." },
  educational: { goal: "Jawab atau cocokkan semua pertanyaan dengan tepat.", win: "Jumlah jawaban benar memenuhi target; nyawa atau waktu habis berarti kalah." },
  puzzle: { goal: "Selesaikan teka-teki sesuai aturan level.", win: "Tata letak atau target tercapai; kebuntuan atau waktu habis berarti kalah." },
  sports: { goal: "Kumpulkan poin lebih banyak dari lawan.", win: "Skor akhir lebih tinggi atau target poin tercapai saat pertandingan berakhir." },
  kids: { goal: "Pilih jawaban atau objek yang diminta.", win: "Semua pilihan benar terkumpul; waktu habis atau salah pilih mengurangi kesempatan." },
  board: { goal: "Gunakan giliranmu untuk mencapai kondisi kemenangan.", win: "Aturan kemenangan game terpenuhi lebih dulu dari lawan." },
  music: { goal: "Bangun atau ulangi pola nada yang diminta.", win: "Pola target berhasil dibuat atau diulang tanpa kesalahan." },
  casino: { goal: "Kumpulkan koin atau skor melalui taruhan dan kombinasi.", win: "Skor/koin target tercapai; kehabisan koin berarti kalah." },
  racing: { goal: "Selesaikan lintasan secepat atau sebersih mungkin.", win: "Waktu dan penalti terbaik; lawan tiba duluan atau kerusakan maksimal berarti kalah." },
  casual: { goal: "Capai target skor atau selesaikan serangkaian aksi.", win: "Target tercapai sebelum lawan atau sebelum percobaan habis." },
  adventure: { goal: "Kumpulkan objek/petunjuk lalu keluar dari area.", win: "Objek terkumpul dan pintu keluar tercapai; tertangkap musuh berarti kalah." },
  words: { goal: "Susun kata atau jawab teka-teki kata.", win: "Jumlah kata atau target tercapai lebih dulu dari lawan." },
  trivia: { goal: "Jawab pertanyaan dengan benar.", win: "Skor minimum tercapai; nyawa atau waktu habis berarti kalah." },
  cards: { goal: "Mainkan kartu sesuai aturan untuk mengalahkan lawan.", win: "Lawan kalah atau tumpukan/posisi target selesai lebih dulu." },
  action: { goal: "Serang musuh dan hindari bahaya yang datang.", win: "Musuh/bos dikalahkan atau skor target tercapai; nyawa habis berarti kalah." },
  rpg: { goal: "Bangun deck/kombinasi dan kalahkan monster di setiap act.", win: "Bos terakhir dikalahkan; nyawa atau deck habis berarti kalah." },
});

const DEFAULT_GOAL = Object.freeze({
  goal: "Selesaikan tantangan level dan capai skor target.",
  win: "Target tercapai; kehabisan nyawa/waktu atau lawan menang duluan berarti kalah.",
});

const DEFAULT_INFO = Object.freeze({
  obstacles: ["Rintangan dan aturan yang berubah sesuai level", "Target skor atau batas waktu"],
  controls: "Gunakan klik/tap atau tombol yang tersedia di layar untuk berinteraksi.",
});

const asList = (value) => (Array.isArray(value) ? value.filter(Boolean) : []);

function inferGameModes(game) {
  const text = (game?.description || "").toLowerCase();
  const modes = [];
  const coop = /co-?op/.test(text);
  if (coop) modes.push("Co-op 2 pemain");
  if (!coop && /2 pemain|two.player|friend|versus|\bvs\b|duel/.test(text)) modes.push("2 pemain / lawan teman");
  if (/online|realtime|room/.test(text)) modes.push("Online");
  if (/\bbot\b|\bai\b/.test(text)) modes.push("Lawan bot / AI");
  if (!modes.length || /solo|single/.test(text)) modes.unshift("Solo");
  return modes;
}

/** Satu titik resolusi detail game, dipakai app.js. */
export function resolveGameInfo(game) {
  const info = GAME_INFO[game?.id] || {};
  const fallback = CATEGORY_INFO[game?.category] || DEFAULT_INFO;
  const goals = GAME_GOALS[game?.id] || CATEGORY_GOALS[game?.category] || DEFAULT_GOAL;
  const curated = [...asList(info.enemies), ...asList(info.challenges)];
  return {
    overview: info.overview || game?.description || "Belum ada deskripsi tambahan untuk game ini.",
    obstacles: curated.length ? curated : fallback.obstacles,
    modes: GAME_MODES[game?.id] || inferGameModes(game),
    controls: info.controls || fallback.controls,
    goal: goals.goal,
    win: goals.win,
  };
}
