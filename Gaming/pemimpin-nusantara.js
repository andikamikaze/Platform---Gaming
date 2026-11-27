/*
 * Pemimpin Nusantara — simulasi kepemimpinan RT → Presiden.
 * Modul ESM: mount(root, context) -> { destroy }.
 * Jalankan `node tools/build-games-manifest.mjs` setelah mengubah file ini.
 */

import { iconSVG } from "../JS/icons.js";

export const META = {
    id: "pemimpin-nusantara",
    name: "Pemimpin Nusantara",
    category: "strategy",
    catLabel: "Strategi",
    desc: "Dari RT sampai Presiden: keluhan warga, kabinet, anggaran, kampanye, debat, dan duel AI/online.",
    art: '<svg viewBox="0 0 48 48" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M8 40h32M13 40V23M24 40V14M35 40V27M8 23l16-11 16 11"/></svg>',
    bg: ["#64748b", "#1e293b"],
    bestKey: "pemimpinNusantaraBest",
};

/* ---------- Konstanta dasar ---------- */
const ST = [
    ["Kepercayaan", "Per"],
    ["Kas", "Kas"],
    ["Stabilitas", "Stb"],
    ["Kesejahteraan", "Ksj"],
    ["Integritas", "Itg"],
];
const START = [50, 50, 50, 50, 70];
const HELP_KEY = "pemimpinNusantaraHelp";
const CAREER_KEY = "pemimpinNusantaraCareer";
const RANK_KEY = "pemimpinNusantaraRank";
const BEAM = 400;
const TAB = ["desk", "aspirasi", "tim"];

// Urutan hierarki sesuai tata pemerintahan Indonesia.
const TIERS = [
    "Ketua RT",
    "Ketua RW",
    "Lurah / Kades",
    "Camat",
    "Wali Kota / Bupati",
    "Gubernur",
    "Presiden",
];
// Fase A = tokoh masyarakat, B = birokrasi wilayah, C = pemimpin politik.
const TIER_CFG = [
    { f: "A", term: 36, staff: 0, naik: "Musyawarah Warga RW", syarat: "1 periode · Per ≥65 · Kas surplus · dukungan 2 RT" },
    { f: "A", term: 36, staff: 0, naik: "Musyawarah RW", syarat: "1 krisis tertangani · Integritas >60 · jaringan RT" },
    { f: "B", term: 36, staff: 1, naik: "Pilkades / Penunjukan", syarat: "Integritas >60 · jaringan birokrasi" },
    { f: "B", term: 36, staff: 1, naik: "Promosi Kepala Daerah", syarat: "Ksj ≥70 · program unggulan · audit bersih" },
    { f: "C", term: 24, staff: 2, naik: "Pilkada", syarat: "Modal politik · koalisi ≥20% DPRD atau independen" },
    { f: "C", term: 24, staff: 3, naik: "Pilgub", syarat: "1 periode sukses · Ekonomi & Stb >70 · media provinsi" },
    { f: "C", term: 24, staff: 4, naik: "Pilpres", syarat: "Tokoh nasional · 2 prestasi ikonik · koalisi · Cawapres" },
];

const REG = [
    ["Kota Metropolitan", [3, 2, 4, 2, 0]],
    ["Kabupaten Agraris", [2, 2, 3, 4, 0]],
    ["Wilayah Pesisir", [3, 3, 2, 2, 0]],
];

// Tipe bawahan: efek pasif per giliran [Per, Kas, Stb, Ksj, Itg].
const STAFF = [
    { ty: "Teknokrat", d: [-1, 0, 0, 2, 0], info: "Efektif infra, kaku, sering memicu protes" },
    { ty: "Penjilat", d: [0, 0, 2, 0, 0], info: "Loyal 100%, kompetensi rendah, rawan korupsi" },
    { ty: "Populis", d: [2, -1, 0, 0, 0], info: "Jago meredam demo, lemah merencanakan anggaran" },
];
const POS = ["Sekretaris", "Kepala Dinas", "Keuangan", "Hukum", "Kominfo"];
const NAMES = ["Budi", "Sari", "Agus", "Dewi", "Rudi", "Wulan", "Joko", "Rina", "Tono", "Yanti"];
const SECT = ["Infrastruktur", "Bansos", "Keamanan", "Gaji pegawai"];

const JANJI = [
    { l: "Sekolah dan kesehatan gratis", i: 3, bold: false, g: 16, b: 10 },
    { l: "Jalan mulus 100%", i: 3, bold: true, g: 26, b: 14 },
    { l: "Pemerintahan bersih", i: 4, bold: false, g: 16, b: 10 },
    { l: "Kas daerah surplus", i: 1, bold: false, g: 16, b: 10 },
    { l: "Daerah aman dan tertib", i: 2, bold: true, g: 26, b: 14 },
    { l: "Rakyat percaya penuh", i: 0, bold: true, g: 26, b: 14 },
    { l: "Bansos tepat sasaran", i: 3, bold: false, g: 16, b: 10 },
    { l: "Layanan publik cepat", i: 0, bold: false, g: 16, b: 10 },
    { l: "Investasi masuk, warga sejahtera", i: 1, bold: true, g: 26, b: 14 },
    { l: "Beban pungli ditekan", i: 4, bold: true, g: 26, b: 14 },
];

const SHADY = /komisi|Hambat|Tutup mata|Percepat izin|Menangkan perusahaan|Setuju cepat|bagian untuk kas|Salurkan lewat ormas|Titip ke lurah|Buang ke lahan|Kerahkan aparat|Ambil proyek strategis/;
const CLEAN = /laporkan|Buka semua|terbuka|Verifikasi|Audit|Digitalisasi|Papan APBDes|Mediasi|Musyawarah|Transparan/;

const DEBATE = [
    {
        q: "Panelis: bagaimana rekam jejak integritasmu?",
        a: [["Saya bersih, tak ada komisi", 4, 60], ["Semua sesuai prosedur", 2, 55]],
    },
    {
        q: "Panelis: bagaimana kondisi keuangan daerah?",
        a: [["Kas sehat dan surplus", 1, 55], ["Kepercayaan investor tinggi", 0, 60]],
    },
    {
        q: "Panelis: apa hasil nyata untuk rakyat?",
        a: [["Kesejahteraan naik pesat", 3, 60], ["Daerah aman dan stabil", 2, 60]],
    },
];

const O = (l, t, k, s, w) => ({ l, e: [t, k, s, w] });
const E = (h, ...o) => ({ h, o });

/* ---------- Bank kejadian per jabatan ---------- */
const TIER_EV = [
    [
        // RT
        E("Got mampet, air masuk rumah warga tiap hujan.",
            O("Kerja bakti massal", 6, -2, 2, 8), O("Sewa jasa sedot got", 2, -12, 0, 10), O("Tunggu kelurahan", -8, 0, -3, -4)),
        E("Tetangga parkir di gang sempit, ambulans tak bisa lewat.",
            O("Tegur & atur zona parkir", 4, 0, 8, 2), O("Portal parkir berbayar", -4, 8, 3, 0), O("Abaikan", -6, 0, -8, 0)),
        E("Iuran sampah banyak yang menunggak.",
            O("Datangi satu per satu", 5, 8, 0, -1), O("Denda keterlambatan", -8, 10, -2, 0), O("Talangi dari kas RT", 8, -12, 0, 3)),
        E("Warga cemburu soal pembagian bansos.",
            O("Musyawarah terbuka", 8, 0, 5, 0), O("Bagi rata semua", 3, -10, 2, 4), O("Serahkan ke data pusat", -6, 2, -4, 0)),
        E("Hajatan blok B pakai sound horeg sampai tengah malam.",
            O("Mediasi jadwal & volume", 5, 0, 6, 1), O("Larang keras hajatan", -6, 0, 4, -2), O("Biarkan saja", -3, 0, -7, 0)),
        E("Ayam tetangga buang kotoran, sampah plastik dibakar tiap sore.",
            O("Kampanye lingkungan bersama", 5, -3, 5, 5), O("Tegur keras pemilik", -2, 0, 3, 0), O("Tunggu instruksi kelurahan", -5, 0, -4, -2)),
    ],
    [
        // RW
        E("Sengketa batas lahan antar-RT memanas.",
            O("Mediasi dengan peta resmi", 7, -2, 6, 1), O("Libatkan kelurahan", 1, -4, 3, 0), O("Biarkan mereka urus sendiri", -7, 0, -9, 0)),
        E("Ronda sepi peminat, motor mulai hilang.",
            O("Honor kecil petugas ronda", 4, -8, 8, 0), O("Patungan CCTV", 3, -6, 6, 2), O("Wajib ronda bergilir", -5, 0, 5, 0)),
        E("Panitia 17-an minta dana besar.",
            O("Setujui penuh", 8, -12, 2, 3), O("Potong separuh, cari sponsor", 3, -4, 1, 3), O("Tolak", -9, 4, -2, -2)),
        E("Karang taruna dan warga senior berseteru.",
            O("Forum bersama", 6, -2, 7, 1), O("Dukung karang taruna", 3, -3, -5, 2), O("Dukung warga senior", -2, 0, 3, -2)),
        E("Dua RT berebut jatah air bersih saat musim kering.",
            O("Jadwal bergilir transparan", 6, -2, 7, 2), O("Beli tangki air bersama", 4, -10, 4, 3), O("Serahkan ke kelurahan", -5, 0, -5, 0)),
        E("Proposal dana lingkungan RT disagarkan banyak pihak.",
            O("Rapat terbuka & kuorum", 7, -2, 4, 2), O("Tandatangani saja", -3, 6, -4, -3), O("Tunda sampai jelas", -4, 0, 1, 0)),
    ],
    [
        // Lurah / Kades
        E("Banjir lokal, warga mengungsi.",
            O("Normalisasi saluran", 5, -12, 4, 10), O("Posko & dapur umum", 9, -8, 5, 0), O("Ajukan proposal ke kecamatan", -6, 0, -4, -2)),
        E("PKL memadati trotoar jalan utama.",
            O("Relokasi dengan dialog", 4, -6, 8, 6), O("Tertibkan paksa", -10, 0, 6, -3), O("Biarkan saja", 5, 2, -8, 3)),
        E("Urus KTP lambat, ada pungli di loket.",
            O("Sidak & ganti staf", 8, 0, 4, 0), O("Digitalisasi layanan", 4, -9, 3, 7), O("Tutup mata", -9, 5, -4, 0)),
        E("Warga menuntut transparansi Dana Desa.",
            O("Papan APBDes terbuka", 8, -1, 4, 3), O("Rapat tertutup", -9, 0, -3, 0), O("Alihkan ke balai desa", 1, -6, 0, 8)),
        E("Menara BTS dibangun di permukiman tanpa izin lingkungan.",
            O("Audit izin & dengar pendapat", 5, -3, 7, 2), O("Setuju cepat demi sinyal", -5, 9, -5, 3), O("Bekukan pembangunan", 2, 0, 3, -5)),
        E("Surat domisili warga terkatung-katung di meja staf.",
            O("Percepat dengan sistem antrean", 6, -4, 3, 5), O("Lemburkan staf", 3, -7, 2, 2), O("Tambah persyaratan", -7, 2, -3, 0)),
    ],
    [
        // Camat
        E("Pasar kecamatan macet total tiap pagi.",
            O("Atur jam bongkar muat", 4, -1, 7, 5), O("Bangun lahan parkir", 5, -12, 4, 6), O("Pindahkan pasar", -8, -8, -3, 4)),
        E("Sengketa izin bangunan di permukiman.",
            O("Audit izin & mediasi", 5, -3, 7, 0), O("Percepat izin investor", -5, 10, -4, 4), O("Bekukan semua izin", -4, 0, 3, -6)),
        E("Bantuan bencana datang, rawan salah sasaran.",
            O("Verifikasi data lapangan", 6, -4, 3, 5), O("Salurkan lewat ormas", 7, -2, -3, 2), O("Titip ke lurah", -3, 0, -4, -2)),
        E("Dua desa berebut air irigasi.",
            O("Jadwal giliran air", 5, -1, 8, 5), O("Bangun sumur bor", 4, -10, 5, 8), O("Serahkan ke polisi", -5, 0, -2, -3)),
        E("Bupati minta target serapan dana kecamatan dipercepat.",
            O("Serap dengan proyek nyata", 4, -6, 4, 7), O("Cairkan ke rekening desa", -4, 8, -3, -2), O("Tolak halus", -2, 0, 2, -4)),
        E("Warga desa dan investor bentrok soal lahan garapan.",
            O("Mediasi tiga pihak", 6, -3, 8, 2), O("Menangkan investor", -8, 10, -6, 3), O("Usir investor", 4, -2, -6, -4)),
    ],
    [
        // Wali Kota / Bupati
        E("Buruh menuntut UMK naik, pengusaha ancam pindah.",
            O("Naik moderat", 3, -4, 4, 6), O("Naik sesuai tuntutan", 8, -6, -3, 6), O("Tahan UMK", -9, 6, -8, -2)),
        E("Jalan rusak parah, warga tanam pohon pisang.",
            O("Aspal ulang prioritas", 7, -14, 3, 12), O("Tambal sulam", 3, -4, 0, 3), O("Salahkan provinsi", -8, 2, -2, -2)),
        E("TPA penuh, truk sampah mogok.",
            O("Bangun TPST modern", 3, -13, 5, 9), O("Kerja sama swasta", 1, -3, 3, 6), O("Buang ke lahan kosong", -9, 5, -6, -5)),
        E("Sopir angkot demo tolak bus kota.",
            O("Rekrut sopir jadi awak bus", 6, -6, 6, 5), O("Tunda proyek bus", 3, 2, 3, -5), O("Jalan terus", -7, -1, -8, 8)),
        E("Irigasi pertanian rusak, petani ancam mogok tanam.",
            O("Perbaiki jaringan irigasi", 5, -12, 3, 12), O("Bantu pompa sementara", 6, -6, 2, 3), O("Tunggu anggaran provinsi", -7, 0, -4, -5)),
        E("Pabrik baru diminta warga karena bau limbah.",
            O("Audit limbah & syarat ketat", 4, -4, 6, 6), O("Setuju cepat", -4, 12, -6, 7), O("Tolak investasi", 3, -2, 3, -6)),
    ],
    [
        // Gubernur
        E("Banjir kiriman dari kabupaten hulu.",
            O("Normalisasi sungai lintas daerah", 4, -14, 5, 11), O("Moratorium alih fungsi lahan", 3, -5, 4, 4), O("Bantuan darurat saja", 5, -7, 1, -2)),
        E("Petani bentrok dengan perusahaan tambang.",
            O("Mediasi tiga pihak", 5, -3, 8, 2), O("Menangkan perusahaan", -9, 9, -6, 3), O("Cabut sebagian izin", 8, -5, 2, -3)),
        E("Bupati terpencil mengancam pemekaran.",
            O("Dana khusus daerah", 5, -10, 6, 6), O("Dialog langsung", 5, -1, 5, 0), O("Abaikan", -6, 0, -9, 0)),
        E("Saatnya lobi anggaran ke pusat.",
            O("Kirim tim lobi", 2, 5, 0, 3), O("Ambil proyek strategis", -1, 11, -3, 7), O("Jaga jarak", 4, -6, 3, 0)),
        E("Jalan provinsi penghubung antarkabupaten putus.",
            O("Perbaikan bertahap terbuka", 4, -10, 4, 9), O("Pinjam ke kontraktor", 1, 6, -4, 6), O("Serahkan ke kabupaten", -7, 2, -5, -4)),
        E("Kebakaran lahan di satu kabupaten mengepul ke kota.",
            O("Satgas lintas daerah", 5, -9, 6, 7), O("Minta bantuan pusat", 3, 0, 3, 2), O("Salahkan cuaca", -8, 0, -6, -3)),
    ],
    [
        // Presiden
        E("Subsidi BBM bikin defisit, ekonom minta dicabut.",
            O("Cabut bertahap", -5, 12, -2, -2), O("Pertahankan subsidi", 8, -14, 4, 2), O("Subsidi tepat sasaran", 2, 3, 1, 4)),
        E("Harga beras dan cabai melonjak jelang hari raya.",
            O("Operasi pasar", 6, -8, 4, 5), O("Impor pangan", 2, -5, 2, 5), O("Serahkan ke pasar", -9, 2, -5, -3)),
        E("Karhutla: asap menyebar ke negara tetangga.",
            O("Satgas & water bombing", 5, -12, 5, 8), O("Diplomasi & minta maaf", 1, -2, 1, 0), O("Salahkan cuaca", -9, 0, -7, -4)),
        E("Mahasiswa se-nasional demo tolak kebijakan.",
            O("Undang dialog", 7, -1, 6, 0), O("Kerahkan aparat", -8, 0, 5, -2), O("Cabut kebijakan", 8, -5, 2, -2)),
        E("TKA masuk proyek strategis di tengah pengangguran sarjana.",
            O("Wajib transfer keahlian", 5, -3, 5, 5), O("Setuju cepat", -6, 9, -6, 4), O("Tolak semua TKA", 6, -2, -5, -3)),
        E("Sekutu koalisi minta jatah menteri lebih banyak.",
            O("Bagi proporsional", 3, -4, 4, 2), O("Tolak, utamakan profesional", -4, 2, 3, 6), O("Setujui semua", -2, -6, -3, -5)),
    ],
];

const SHARED = [
    E("Keluhan warga viral di medsos!",
        O("Sidak & klarifikasi", 7, -4, -1, 2), O("Disposisi ke dinas", -2, 0, 3, 5), O("Diamkan", -8, 0, -2, 0)),
    E("Bawahan menawarkan 'komisi proyek'.",
        O("Tolak & laporkan", 5, -2, 3, 0), O("Ambil komisi", -8, 14, -5, -3), O("Minta bagian untuk kas", -3, 8, -2, 2)),
    E("Audit mendadak datang.",
        O("Buka semua dokumen", 6, -3, 3, 0), O("Rapikan dulu", -2, -6, 0, 1), O("Hambat auditor", -9, 2, -6, 0)),
    E("Demo besar di depan kantor.",
        O("Temui pendemo", 8, -2, 3, 0), O("Bubarkan", -8, 0, 5, -1), O("Janji manis", 3, -1, -4, 0)),
    E("Bencana alam melanda wilayah.",
        O("Tanggap darurat cepat", 7, -10, 6, 3), O("Minta bantuan atasan", 3, 0, 2, 2), O("Tunggu data lengkap", -9, 3, -5, -3)),
    E("Investor menawarkan pabrik baru.",
        O("Setuju + syarat lingkungan", 3, 6, 2, 8), O("Setuju cepat", -3, 10, -5, 9), O("Tolak", 3, -2, 3, -6)),
    E("Warga menagih janji kampanye lama lewat media.",
        O("Tunjukkan realisasi", 7, -3, 2, 3), O("Janji lagi di masa depan", -3, 0, -3, 0), O("Salahkan pemerintah sebelumnya", -7, 1, -4, -2)),
    E("Staf kunci mengundurkan diri mendadak.",
        O("Cari pengganti sementara", 4, -5, 3, 2), O("Tangani sendiri", 2, 0, -4, 3), O("Biarkan kosong", -6, 2, -5, -4)),
    E("Wacana pemekaran daerah menguat di dewan.",
        O("Kajian bersama", 5, -4, 5, 2), O("Dukung demi suara", 2, -6, -3, 4), O("Tolak tegas", -3, 0, 3, -5)),
    E("Harga kebutuhan pokok naik di pasar tradisional.",
        O("Operasi pasar murah", 6, -7, 3, 4), O("Berikan subsidi lokal", 5, -9, 1, 3), O("Tunggu pasar stabil", -6, 1, -4, -2)),
    E("Ormas minta perlindungan proyek kecil.",
        O("Berikan dengan syarat audit", 3, -4, 5, 2), O("Berikan tanpa syarat", -4, -6, -5, -3), O("Tolak", -2, 2, 2, 4)),
    E("Laporan keuangan daerah jadi sorotan publik.",
        O("Publikasikan terbuka", 6, -2, 3, 3), O("Tutup akses sementara", -8, 0, -4, -2), O("Serahkan ke auditor", 4, -3, 2, 2)),
];

/* ---------- Aspirasi warga & instruksi atasan ---------- */
const REPORTS = [
    { h: "Mobil tetangga parkir di gang, ambulans tak lewat", b: "Pak RT, gang depan rumah sudah tidak bisa dilalui. Kalau ada orang sakit, ambulans tidak bisa masuk.", u: 2, min: 0, max: 1, reg: -1 },
    { h: "Sound horeg hajatan sampai tengah malam", b: "Warga blok B pasang tenda 3 hari. Anak-anak tidak bisa tidur, tapi kalau ditegur takut ribut.", u: 2, min: 0, max: 1, reg: -1 },
    { h: "Bansos janda tua ujung gang belum dapat", b: "Rumah yang punya motor dua malah dapat beras, sedangkan janda tua di ujung gang tidak pernah dilapor.", u: 3, min: 0, max: 2, reg: -1 },
    { h: "Kucing dan ayam tetangga buang kotoran", b: "Sampah plastik juga dibakar tiap sore, bau dan asapnya masuk ke rumah.", u: 1, min: 0, max: 1, reg: -1 },
    { h: "Pos kamling jadi tempat nongkrong pemuda luar", b: "Warga takut motor hilang. Ronda malam jadi tidak jalan.", u: 2, min: 0, max: 2, reg: -1 },
    { h: "Batas lahan dua RT belum jelas", b: "Pagar sudah mulai dipasang, kedua belah pihak mengaku punya peta resmi.", u: 3, min: 1, max: 2, reg: -1 },
    { h: "Pungli 'uang rokok' di loket KTP", b: "Surat pengantar dipersulit kalau tidak kasih uang. Warga sudah capek bolak-balik.", u: 3, min: 2, max: 3, reg: -1 },
    { h: "PKL tumpah ke trotoar depan pasar", b: "Tiap pagi macet total. Pedagang bilang tidak ada tempat lain.", u: 2, min: 2, max: 3, reg: -1 },
    { h: "Got mampet, hujan 1 jam air masuk rumah", b: "Tumpukan sampah dan bangunan liar menyumbat saluran.", u: 3, min: 2, max: 3, reg: -1 },
    { h: "Bangunan BTS tanpa izin lingkungan", b: "Warga khawatir radiasi dan nilai tanah turun, tapi pembangunan sudah jalan.", u: 2, min: 2, max: 4, reg: -1 },
    { h: "Jalan berlubang, warga tanam pohon pisang", b: "Video warga memancing lele di genangan ditonton 2 juta kali. Akun pemkot mulai ditandai.", u: 3, min: 4, max: 4, reg: 0 },
    { h: "Ribuan buruh kepung balai kota", b: "Menuntut UMK naik. Pengusaha mengancam memindahkan pabrik kalau upah naik terlalu tinggi.", u: 3, min: 4, max: 4, reg: 0 },
    { h: "Truk sampah mogok, TPA over-kapasitas", b: "Sampah menumpuk di pinggir jalan dan bau busuk sudah masuk ke permukiman.", u: 3, min: 4, max: 4, reg: -1 },
    { h: "Sopir angkot demo tolak bus kota", b: "Mereka khawatir mati rezeki. Penumpang justru makin susah dapat transportasi.", u: 2, min: 4, max: 4, reg: 0 },
    { h: "Irigasi pertanian rusak, petani ancam mogok", b: "Jaringan irigasi sudah lama tidak diperbaiki. Musim tanam berikutnya terancam gagal.", u: 3, min: 4, max: 4, reg: 1 },
    { h: "Jalan kabupaten rusak, truk panen tidak bisa lewat", b: "Hasil panen terhambat dan harga di tingkat petani jatuh.", u: 2, min: 4, max: 4, reg: 1 },
    { h: "Logistik pesisir mahal, harga ikan naik", b: "Cuaca ekstrem membuat kapal tidak bisa keluar. Warga minta bantuan cold storage.", u: 2, min: 4, max: 5, reg: 2 },
    { h: "Abrasi makin mendekati rumah warga", b: "Pantai terus tergerus. Warga minta tanggul, tapi anggaran terbatas.", u: 3, min: 4, max: 5, reg: 2 },
    { h: "Banjir kiriman dari kabupaten hulu", b: "Warga ibu kota provinsi menuntut penanganan alih fungsi lahan hijau di hulu.", u: 3, min: 5, max: 5, reg: -1 },
    { h: "Masyarakat adat bentrok dengan perusahaan tambang", b: "Sungai dicurigai tercemar. Demonstran sudah mendekati kantor gubernur.", u: 3, min: 5, max: 5, reg: -1 },
    { h: "Bupati ancam pemekaran provinsi", b: "Wilayah terpencil merasa pembangunan hanya fokus di ibu kota provinsi.", u: 2, min: 5, max: 5, reg: -1 },
    { h: "Ibu-ibu menjerit harga beras dan minyak goreng", b: "Menjelang hari raya, harga cabai juga ikut melambung.", u: 3, min: 6, max: 6, reg: -1 },
    { h: "Mahasiswa nolak rencana kenaikan BBM", b: "Demonstrasi nasional sudah mulai di beberapa kota. Isu ini viral di media sosial.", u: 3, min: 6, max: 6, reg: -1 },
    { h: "Asap karhutla sampai ke negara tetangga", b: "Pemerintah negara sebelah mengirim protes diplomatik, warga mengeluh sesak.", u: 3, min: 6, max: 6, reg: -1 },
];

const INSTR = [
    { h: "Instruksi atasan: target serapan anggaran harus dipenuhi.", o: [
        { l: "Serap lewat proyek nyata", e: [2, -6, -1, 5, 0], sup: 8 },
        { l: "Tahan dulu, minta data", e: [-4, 3, 2, -3, 0], sup: -8 },
    ] },
    { h: "Instruksi atasan: amankan proyek strategis pusat.", o: [
        { l: "Dukung penuh", e: [-2, 7, -3, 4, -2], sup: 10 },
        { l: "Syarati dengan audit", e: [4, -3, 3, 2, 4], sup: -7 },
    ] },
    { h: "Instruksi atasan: program nasional wajib jalan di wilayahmu.", o: [
        { l: "Jalankan & sosialisasi", e: [4, -5, 3, 4, 0], sup: 7 },
        { l: "Sesuaikan dengan kebutuhan lokal", e: [2, -2, 1, 2, 2], sup: -5 },
    ] },
    { h: "Instruksi atasan: tekan program yang dianggap boros.", o: [
        { l: "Patuh, pangkas anggaran", e: [-5, 8, 2, -6, 0], sup: 9 },
        { l: "Bela program warga", e: [6, -5, -2, 5, 1], sup: -9 },
    ] },
    { h: "Instruksi atasan: kirim laporan tata ruang bulan ini.", o: [
        { l: "Kirim lengkap & terbuka", e: [3, -2, 2, 3, 3], sup: 6 },
        { l: "Kirim seadanya", e: [-2, 1, 1, -2, -4], sup: -6 },
    ] },
    { h: "Instruksi atasan: jangan sampai ada demo saat kunjungan.", o: [
        { l: "Amankan dengan dialog", e: [6, -3, 4, 1, 2], sup: 5 },
        { l: "Kerahkan aparat", e: [-7, 0, 6, -3, -3], sup: -4 },
    ] },
    { h: "Instruksi atasan: dana transfer daerah sedang dikaji.", o: [
        { l: "Lobi ke pusat", e: [1, -4, 0, 2, -2], sup: 9 },
        { l: "Tekan dengan kritik terbuka", e: [5, -1, -3, 1, 2], sup: -10 },
    ] },
    { h: "Instruksi atasan: target serapan dana desa/kelurahan naik.", o: [
        { l: "Percepat dengan musyawarah", e: [5, -7, 2, 5, 2], sup: 7 },
        { l: "Cairkan tanpa verifikasi", e: [-3, 9, -4, -2, -6], sup: -6 },
    ] },
];

const BOTS = [
    { n: "Teknokrat Populist", persona: "teknokrat", w: [0.9, 1, 1, 1.5, 1.2], noise: 4 },
    { n: "Politikus Licik", persona: "licik", w: [1.6, 0.7, 0.9, 0.8, 0.6], noise: 8 },
    { n: "Reaksioner Keras", persona: "keras", w: [1.2, 1, 1.5, 0.8, 0.8], noise: 10 },
];
const SEGMEN = ["Warga bawah", "Buruh", "Pelaku usaha", "Pedesaan"];
const CAMPAIGN = [
    { k: "blusukan", n: "Blusukan / Dialog Warga", d: "Murah, +suara bawah stabil" },
    { k: "akbar", n: "Kampanye Akbar & Baliho", d: "Mahal, +popularitas cepat" },
    { k: "isu", n: "Serangan Isu / Black Campaign", d: "Jatuhkan lawan, risiko integritas" },
    { k: "lobi", n: "Lobi Elit / Donatur", d: "+dana, tapi utang balas budi" },
];
const SURPRISE = [
    { l: "Serangan fajar di TPS desa", v: [-3, 3] },
    { l: "Isu viral H-1 soal pungli", v: [-5, 2] },
    { l: "Hujan deras, beberapa TPS terendam", v: [-4, -2] },
    { l: "Tokoh agama dukung kandidat", v: [4, -1] },
    { l: "Kabar baik: program bansos cair tepat waktu", v: [5, -2] },
];
const BADGES = [
    { id: "bersih", n: "Bersih & Berintegritas", c: (p) => p.s[4] >= 80 },
    { id: "blusukan", n: "Jago Blusukan", c: (p) => p.s[0] >= 80 },
    { id: "infra", n: "Tukang Aspal", c: (p) => p.s[3] >= 80 },
    { id: "licik", n: "Penakluk Politik Licik", c: (p, w) => w === 0 && p.assets.sosial >= 6 },
    { id: "nasional", n: "Tokoh Nasional", c: (p, w, lv) => w === 0 && lv.tier >= 6 },
];

/* ---------- Util ---------- */
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const rnd = (n) => Math.floor(Math.random() * n);
const shuffle = (a) => {
    a = [...a];
    for (let i = a.length - 1; i > 0; i--) {
        const j = rnd(i + 1);
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
};
const esc = (s) =>
    String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

const defaultCareer = () => ({
    tier: 0, sosial: 0, jaringan: [], logistik: 60, prestasi: [], skandal: [], cycle: 0, badge: [],
});
function loadCareer() {
    try {
        const c = JSON.parse(localStorage.getItem(CAREER_KEY) || "null");
        if (c && typeof c === "object") return { ...defaultCareer(), ...c };
    } catch { }
    return defaultCareer();
}
function saveCareer(c) {
    try { localStorage.setItem(CAREER_KEY, JSON.stringify(c)); } catch { }
}
function loadRank() {
    try { return +localStorage.getItem(RANK_KEY) || 0; } catch { return 0; }
}
function saveRank(r) {
    try { localStorage.setItem(RANK_KEY, String(r)); } catch { }
}

/* ---------- Generator level (beam search, aman untuk 36 giliran) ---------- */
function makeDeck(tier, n) {
    const pool = [...TIER_EV[tier], ...SHARED];
    const deck = [];
    let last = -1;
    for (let i = 0; i < n; i++) {
        let k = rnd(pool.length);
        if (pool.length > 1) while (k === last) k = rnd(pool.length);
        last = k;
        deck.push({
            h: pool[k].h,
            o: pool[k].o.map((o) => {
                const e = o.e.map((v) => (v ? v + rnd(5) - 2 : 0));
                e.push(SHADY.test(o.l) ? -12 : CLEAN.test(o.l) ? 3 : 0);
                return { l: o.l, e };
            }),
        });
    }
    return deck;
}

// Simpan state terbaik saja (kuantisasi 5 poin) agar kompleksitas tetap linear.
function beamSolve(deck, d) {
    let beam = [{ s: [...START], v: 0 }];
    for (const ev of deck) {
        const next = new Map();
        for (const st of beam) {
            for (const o of ev.o) {
                let s = st.s.map((x, j) => Math.min(100, x + o.e[j]));
                if (s.some((x) => x <= 0)) continue;
                let v = o.e[0] <= -6 ? 2 : st.v > 0 ? st.v : 0;
                s = s.map((x, j) => x - d[j] - (j === 0 && v ? 3 : 0));
                if (s.some((x) => x <= 0)) continue;
                if (v) v--;
                const key = s.map((x) => Math.round(x / 5) * 5).join(",") + ":" + v;
                const sc = s.reduce((a, b) => a + b, 0);
                const old = next.get(key);
                if (!old || sc > old.sc) next.set(key, { s, v, sc });
            }
        }
        if (!next.size) return [];
        beam = [...next.values()].sort((a, b) => b.sc - a.sc).slice(0, BEAM);
    }
    return beam.map((b) => b.s);
}

function genLevel(tier, regIdx) {
    const ri = regIdx == null ? rnd(REG.length) : regIdx;
    const [reg, d0] = REG[ri];
    const term = TIER_CFG[tier].term;
    // Drift diskalakan terhadap panjang jabatan: masa jabatan 36 giliran tidak boleh
    // memakai drift 8 giliran (kalau tidak, semua jalur pasti mati).
    const scale = 12 / term;
    const d = d0.map((x, j) => Math.max(1, Math.round(x * scale)) + (j === 4 ? 1 : 0));
    const gov = term - 6;
    let best = [];
    for (let tries = 0; tries < 20; tries++) {
        const deck = makeDeck(tier, gov);
        const fin = beamSolve(deck, d);
        if (fin.length > best.length) best = fin;
        if (fin.length < 8) continue;
        return finishLevel(tier, reg, d, deck, term, gov, fin);
    }
    return finishLevel(tier, reg, d, makeDeck(tier, gov), term, gov, best);
}

function finishLevel(tier, reg, d, deck, term, gov, fin) {
    // Beam menyimpan jalur terbaik, jadi persentilnya bias ke atas. Ambang dibatasi
    // agar misi tetap realistis sekaligus terjamin bisa dicapai (fin.length > 0).
    const q = (i, p, cap) => {
        const v = fin.map((x) => x[i]).sort((a, b) => a - b);
        return Math.min(cap, v.length ? Math.max(35, v[Math.floor(v.length * p)]) : 40);
    };
    const f = fin.length ? fin[Math.floor(fin.length * (0.12 + 0.45 * Math.random()))] : null;
    const i2 = 1 + rnd(3);
    const missions = f
        ? [{ i: 0, v: Math.min(75, Math.max(35, f[0] - 12)) }, { i: i2, v: Math.min(75, Math.max(35, f[i2] - 12)) }]
        : [{ i: 0, v: 40 }, { i: 1, v: 40 }];
    return {
        tier, name: TIERS[tier], reg, d, deck, term, gov,
        missions, paths: fin.length,
        jn: JANJI.map((j) => q(j.i, j.bold ? 0.85 : 0.5, j.bold ? 78 : 65)),
    };
}

/* ---------- CSS ---------- */
const CSS = `
.pn{--l:color-mix(in srgb,currentColor 16%,transparent);--m:color-mix(in srgb,currentColor 58%,transparent);width:100%;max-width:900px;margin:0 auto;padding:0 12px;font-size:14px;line-height:1.5}
.pn *{box-sizing:border-box}
.pn [hidden]{display:none!important}
.pn-hud{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:10px;font:600 11px/1 ui-monospace,SFMono-Regular,Menlo,monospace}
.pn-chip{display:inline-flex;align-items:center;gap:6px;padding:5px 9px;border:1px solid var(--l);border-radius:999px;color:var(--m);white-space:nowrap}
.pn-chip b{color:CanvasText;font-weight:700;font-variant-numeric:tabular-nums}
.pn-spacer{flex:1 1 auto}
.pn-icon-btn{display:inline-flex;align-items:center;gap:6px}
.pn-icon-btn svg{flex:none;display:block}
.pn.game-fill > .pn-board{flex:1 1 auto;min-height:0;aspect-ratio:auto;width:100%;padding:12px;border:1px solid var(--l);border-radius:12px;overflow:auto;overscroll-behavior:contain}
.pn-row{display:flex;justify-content:space-between;gap:8px;color:var(--m);font-size:12px;margin:8px 0}
.pn-pl{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.pn-p{border:1px solid var(--l);border-radius:10px;padding:12px}
.pn-p.me{border-color:currentColor}
.pn-ph{display:flex;justify-content:space-between;gap:8px;margin-bottom:4px}
.pn-ph span{color:var(--m);font-size:11px;white-space:nowrap}
.pn-s{display:grid;grid-template-columns:1fr auto;font-size:11px;color:var(--m);margin-top:8px}
.pn-bar{grid-column:1/3;height:4px;background:var(--l);border-radius:2px;overflow:hidden;margin-top:4px}
.pn-bar i{display:block;height:100%;background:currentColor;transition:width .18s}
.pn-bar i.lo{background:#e5484d}
.pn-tabs{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:12px 0 8px;position:sticky;top:0;background:Canvas;padding:8px 0;z-index:3}
.pn-tab{all:unset;box-sizing:border-box;text-align:center;cursor:pointer;border:1px solid var(--l);border-radius:8px;padding:12px 4px;min-height:44px;font-size:12px;color:var(--m)}
.pn-tab.on{border-color:currentColor;color:CanvasText;font-weight:600}
.pn-tab b{display:inline-block;min-width:16px;padding:0 4px;margin-left:3px;border-radius:8px;background:#e5484d;color:#fff;font-size:10px}
.pn-ev{margin-top:8px;border:1px solid var(--l);border-radius:12px;padding:16px}
.pn-ev small,.pn-m{color:var(--m)}
.pn-ev h3{margin:8px 0 12px;font-size:16px;line-height:1.35;font-weight:600}
.pn-op{display:grid;gap:8px}
.pn-o{all:unset;box-sizing:border-box;cursor:pointer;border:1px solid var(--l);border-radius:10px;padding:12px;min-height:44px;display:flex;justify-content:space-between;align-items:center;gap:12px}
.pn-o:hover:not(:disabled),.pn-o.on{border-color:currentColor}
.pn-o:disabled{opacity:.55;cursor:default}
.pn-o.hint{box-shadow:inset 3px 0 0 currentColor}
.pn-o.pk{opacity:1;border-style:dashed;border-color:currentColor}
.pn-o:focus-visible,.pn-tab:focus-visible,.pn-btn:focus-visible{outline:2px solid currentColor;outline-offset:2px}
.pn-fx{display:flex;gap:8px;flex-wrap:wrap;font-size:11px;white-space:nowrap}
.pn-fx u{text-decoration:none}.pn-fx .up{color:#2a9d5c}.pn-fx .dn{color:#e5484d}
.pn-log{list-style:none;margin:12px 0 0;padding:0;color:var(--m);font-size:12px;display:grid;gap:4px}
.pn-btn{border:1px solid var(--l);border-radius:8px;padding:10px 12px;min-height:44px;background:none;color:inherit;font:inherit;cursor:pointer;transition:border-color .15s}
.pn-btn:hover{border-color:currentColor}
.pn-btn:disabled{opacity:.5;cursor:default}
.pn-pad{display:none;gap:8px;position:sticky;bottom:8px;margin-top:12px}
.pn-pad .pn-btn{flex:1;padding:14px;background:Canvas}
.pn-pad .pn-btn[data-pad=ok]{flex:2;font-weight:600}
@media(pointer:coarse){.pn-pad{display:flex}.pn-kb{display:none}}
.pn-kb{color:var(--m);font-size:11px;margin:12px 0 0}
.pn-ov{position:fixed;inset:0;background:rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;padding:16px;z-index:50}
.pn-ov[hidden]{display:none}
.pn-bx{display:flex;flex-direction:column;overflow:hidden;background:Canvas;color:CanvasText;border-radius:14px;padding:16px 20px;max-width:560px;width:100%;max-height:min(85vh,85dvh);font-size:14px;line-height:1.5;box-shadow:0 16px 40px rgba(0,0,0,.25)}
.pn-head{display:flex;align-items:center;justify-content:space-between;gap:10px;flex:none}
.pn-bx .pn-head h3{margin:0;font-size:15px}
.pn-bx .pn-head .pn-btn{width:auto;margin:0;text-align:center;min-height:32px;padding:5px 9px;font-size:12px}
.pn-body{flex:1 1 auto;min-height:0;overflow:auto;padding-right:4px}
.pn-foot{display:flex;align-items:center;justify-content:space-between;gap:10px;flex:none;margin-top:12px;padding-top:12px;border-top:1px solid var(--l)}
.pn-bx .pn-foot .pn-btn{width:auto;margin:0;text-align:center}
.pn-note{color:var(--m);font-size:11px}
.pn-sl{display:grid;grid-template-columns:96px 1fr 40px;gap:8px;align-items:center;margin:10px 0 2px;font-size:13px}
.pn-sl input{accent-color:currentColor;width:100%}.pn-sl b{text-align:right;font-weight:500}
.pn-bx h3{margin:0 0 8px}.pn-bx ul{padding-left:18px;margin:8px 0}.pn-bx .pn-btn{display:block;width:100%;margin-top:8px;text-align:left}
.pn-rp{border:1px solid var(--l);border-radius:10px;padding:10px;margin-bottom:8px;font-size:13px}
.pn-rp.viral{border-color:#e5484d;box-shadow:inset 3px 0 0 #e5484d}
.pn-rp .pn-rh{display:flex;justify-content:space-between;gap:6px;font-weight:600}
.pn-rp .pn-rb{margin:5px 0;color:var(--m);font-size:12px;line-height:1.4}
.pn-rp .pn-ra{display:flex;gap:6px;flex-wrap:wrap;margin-top:6px}
.pn-rp .pn-ra .pn-btn{padding:6px 8px;font-size:12px}
.pn-rp select{background:Canvas;color:CanvasText;border:1px solid var(--l);border-radius:8px;padding:5px;font:inherit;font-size:12px;max-width:100%}
.pn-tag{font-size:10px;color:var(--m);border:1px solid var(--l);border-radius:6px;padding:1px 5px}
.pn-tag.hot{color:#e5484d;border-color:#e5484d}
.pn-mem{border:1px solid var(--l);border-radius:10px;padding:9px;margin-bottom:7px;display:grid;grid-template-columns:1fr auto;gap:4px;font-size:12px}
.pn-mem b{font-size:13px}
.pn-stat{display:flex;gap:8px;flex-wrap:wrap;font-size:12px;color:var(--m);margin:6px 0}
.pn-vote{display:grid;grid-template-columns:1fr auto 1fr;gap:8px;text-align:center;align-items:center;margin:8px 0}
.pn-vote b{font-size:22px}
@media(max-width:420px){.pn-pl{grid-template-columns:1fr}.pn-sl{grid-template-columns:72px 1fr 36px}.pn-bx{padding:16px}}
@media(prefers-reduced-motion:reduce){.pn *{transition-duration:.01ms!important}}
/* --- layout refinements: fill board + mobile HUD (must stay last) --- */
@media(max-width:640px){
.pn.game-fill > .pn-board{min-height:min(70dvh,620px)}
.pn .pn-hud{gap:5px;margin-bottom:8px}
.pn .pn-hud .pn-chip{padding:4px 6px;font-size:9px}
.pn .pn-hud .pn-chip[data-hud="mission"],.pn .pn-hud .pn-chip[data-hud="sidak"],.pn .pn-hud .pn-chip[data-hud="reg"]{display:none}
.pn .pn-hud .pn-btn{min-height:32px;padding:5px 9px;font-size:9px}
.pn .pn-hud .pn-btn-label,.pn .pn-hud .pn-spacer{display:none}
.pn .pn-ov{padding:8px}
.pn .pn-bx{width:100%;height:100%;max-width:100%;max-height:100%;padding:12px;border-radius:12px}
.pn .pn-body{scrollbar-width:none}
.pn .pn-body::-webkit-scrollbar{display:none}
.pn .pn-foot{position:static;margin:0;padding:10px 0 0}
.pn .pn-note{display:none}
}
`;

const HELP = `<p>Kamu memimpin wilayah dari <b>Ketua RT</b> sampai <b>Presiden</b>. Satu jabatan = 24–36 giliran (1 giliran = 1 bulan). 6 giliran terakhir adalah <b>Mode Pemilu</b>.</p>
<ul>
<li><b>3 tab bawah:</b> Meja Kerja (keputusan), Aspirasi & Medsos (keluhan warga), Jajaran Bawahan (delegasi & mutasi).</li>
<li>Tiap giliran pilih 1 dari 3 kebijakan. Jaga 5 indikator: Kepercayaan, Kas, Stabilitas, Kesejahteraan, Integritas. Salah satu menyentuh 0 = gagal (Integritas 0 = OTT KPK).</li>
<li><b>Aspirasi:</b> keluhan punya urgensi & timer 3 giliran. Diabaikan → <b>#ViralDiMedsos</b>, Kepercayaan terus turun, atasan menegur. <b>Respon Cepat</b> naikkan Kepercayaan instan tapi Stabilitas birokrasi turun; <b>Disposisi</b> ke staf selesai permanen 2–4 giliran, tapi warga mengeluh lamban. Salah staf (Penjilat mengurus dana) → penyelewengan.</li>
<li><b>Bawahan:</b> mulai Lurah/Camat kamu mengangkat tim. Atribut: Kompetensi, Loyalitas, Integritas. Loyalitas turun kalau porsi Gaji pegawai di musrenbang terlalu kecil → pelayanan lambat.</li>
<li><b>Musrenbang:</b> awal & tengah jabatan, bagi 100% anggaran ke Infrastruktur, Bansos, Keamanan, Gaji pegawai.</li>
<li><b>Sidak:</b> 2 aksi per giliran, gratis giliran, Kas −4, padamkan viral.</li>
<li><b>Instruksi atasan</b> tiap 6 giliran. Menolok menurunkan Dukungan Pusat (transfer anggaran dipotong).</li>
<li><b>Pemilu (6 giliran terakhir):</b> pilih kendaraan (koalisi dapat mesin tapi harus bagi jatah; independen butuh dana logistik), 4 giliran kampanye (Blusukan / Akbar / Isu / Lobi), debat 3 pertanyaan, lalu coblosan. Selisih &lt;2% → sengketa, diputus Integritas & bukti administrasi.</li>
<li>Janji kampanye (3) ditagih di akhir. Janji tercapai = poin, diingkar = poin minus.</li>
<li><b>Karier:</b> menang + memenuhi syarat = naik jabatan. Kalah = jeda 1 siklus, tapi Modal Sosial/Jaringan/Logistik tetap terbawa.</li>
<li>Mode Sandbox: pilih langsung jabatan & wilayah. Format koalisi 3–4 pemain dimainkan dengan mitra AI (room online mendukung 2 pemain).</li>
</ul>
<p class="pn-m">Desktop: klik, ← → atau 1–3 lalu Enter, S sidak, A aspirasi, T tim. H bantuan, C cheat, P jeda, R restart. Mobile: ketuk opsi lalu Pilih.</p>`;

/* ---------- Game ---------- */
export function mount(root, context = {}) {
    const {
        mode = "ai", room = null, playerName = "Player", onExit = () => { },
    } = context;
    const online = mode === "room" && Boolean(room);
    const playerIndex = online && !room.isHost ? 1 : 0;
    const me = playerIndex;
    const coarse = typeof matchMedia === "function" && matchMedia("(pointer:coarse)").matches;
    let state = null, sel = 0, lastKey = "", botTimer = 0, saved = false;
    let career = loadCareer();
    let rank = loadRank();
    const ui = {
        ov: null, tab: "desk", nums: false, hint: false,
        jn: [], bud: [25, 25, 25, 25],
        setup: { mode: "karier", tier: career.tier, reg: 0 },
    };

    root.innerHTML = `
    <div class="game-app pn game-fill" data-pn>
      <style>${CSS}</style>
      <div class="pn-hud">
        <span class="pn-chip">JABATAN <b data-hud="tier">${esc(TIERS[ui.setup.tier])}</b></span>
        <span class="pn-chip">GILIR <b data-hud="round">—</b></span>
        <span class="pn-chip">SKOR <b data-hud="score">0</b></span>
        <span class="pn-chip">MISI <b data-hud="mission">0/0</b></span>
        <span class="pn-chip">SIDAK <b data-hud="sidak">0</b></span>
        <span class="pn-chip">DAERAH <b data-hud="reg">—</b></span>
        <span class="pn-chip">STATUS <b data-hud="status">Ready</b></span>
        <span class="pn-spacer"></span>
        <button class="pn-btn pn-icon-btn" type="button" data-help aria-label="Cara bermain" title="Cara bermain (H)">${iconSVG("helpCircle", { size: 14 })}<span class="pn-btn-label">Help</span></button>
        <button class="pn-btn pn-icon-btn" type="button" data-cheats aria-label="Cheat" title="Cheat (C)">${iconSVG("wrench", { size: 14 })}<span class="pn-btn-label">Cheat</span></button>
        <button class="pn-btn pn-icon-btn" type="button" data-pause aria-label="Jeda" title="Jeda (P)">${iconSVG("pause", { size: 14 })}<span class="pn-btn-label">Pause</span></button>
        <button class="pn-btn pn-icon-btn" type="button" data-setup aria-label="Setup" title="Setup">${iconSVG("settings", { size: 14 })}<span class="pn-btn-label">Setup</span></button>
        <button class="pn-btn pn-icon-btn" type="button" data-restart aria-label="Restart" title="Restart (R)">${iconSVG("refresh", { size: 14 })}<span class="pn-btn-label">Restart</span></button>
        <button class="pn-btn pn-icon-btn" type="button" data-exit aria-label="Exit game" title="Exit game">${iconSVG("logOut", { size: 14 })}<span class="pn-btn-label">Exit game</span></button>
      </div>
      <section class="game-panel pn-board" data-board></section>
      <div class="pn-pad"><button class="pn-btn" type="button" data-pad="prev">◀</button><button class="pn-btn" type="button" data-pad="ok">Pilih</button><button class="pn-btn" type="button" data-pad="next">▶</button></div>
      <div class="pn-ov" data-ov hidden></div>
    </div>`;

    const $ = (s) => root.querySelector(s);
    const stat = (t) => { const n = $('[data-hud="status"]'); if (n) n.textContent = t; };
    const bestGet = () => { try { return +localStorage.getItem(META.bestKey) || 0; } catch { return 0; } };

    /* ---------- model ---------- */
    function mkP(name, useCareer = true) {
        const c = useCareer ? career : defaultCareer();
        return {
            name, s: [...START], cheat: false, shield: false, viral: 0,
            staff: [], loyal: 60, support: 50, sidak: 2,
            alloc: [25, 25, 25, 25], janji: null, deb: 0,
            assets: {
                sosial: c.sosial, jaringan: [...c.jaringan], logistik: c.logistik,
                prestasi: [...c.prestasi], skandal: [...c.skandal],
            },
            vehicle: null, cawapres: null, debt: 0,
        };
    }
    const score = (p) =>
        p.s.reduce((a, b) => a + b, 0) +
        20 * state.lv.missions.filter((m) => p.s[m.i] >= m.v).length +
        p.deb + JP(p) + Math.round(p.assets.sosial / 2);
    const JP = (p) =>
        (p.janji || []).reduce(
            (a, j) => a + (p.s[JANJI[j].i] >= state.lv.jn[j] ? JANJI[j].g : -JANJI[j].b), 0,
        );
    const jshort = (p) =>
        (p.janji || []).map((j) => `${ST[JANJI[j].i][1]}≥${state.lv.jn[j]}${p.s[JANJI[j].i] >= state.lv.jn[j] ? "✓" : "✗"}`).join(" ");

    const allocVec = (p) => {
        const r = (x) => Math.round((x - 25) / 10), a = p.alloc;
        return [r(a[1]), -Math.round((Math.max(0, r(a[1])) + Math.max(0, r(a[0]))) / 2), r(a[2]), r(a[0]), r(a[3])];
    };
    const teamVec = (p) => {
        const m = [0, 0, 0, 0, 0];
        const eff = p.loyal < 35 ? 0.5 : p.loyal > 75 ? 1.25 : 1;
        for (const g of p.staff) {
            const km = g.kom >= 7 ? 1.5 : g.kom <= 3 ? 0.6 : 1;
            const lm = g.loy <= 3 ? 0.6 : g.loy >= 8 ? 1.2 : 1;
            for (let j = 0; j < 4; j++) m[j] += g.d[j] * km * eff * lm;
            m[4] += g.int <= 3 ? -3 : g.int >= 8 ? 1 : 0;
        }
        return m.map((v) => Math.round(v));
    };
    const vecTxt = (v) => v.map((x, j) => (x ? `${ST[j][1]} ${x > 0 ? "+" : ""}${x}` : "")).filter(Boolean).join(" · ");
    const mover = () => {
        const f = state.round % 2 ? 1 - state.first : state.first;
        return state.step ? 1 - f : f;
    };
    const failIdx = (p) => p.s.findIndex((v) => v <= 0);
    const failMsg = (p, f) => f === 4 ? `${p.name} terjaring OTT KPK.` : `${p.name} gagal: ${ST[f][0]} habis.`;

    function pickReport(tier, reg) {
        const pool = REPORTS.filter((r) => tier >= r.min && tier <= r.max && (r.reg < 0 || r.reg === reg));
        const r = pool.length ? pool[rnd(pool.length)] : { h: "Keluhan warga meningkat", b: "Warga mengadu lewat grup RT dan media sosial.", u: 2 };
        return {
            id: Math.random().toString(36).slice(2, 8), h: r.h, b: r.b,
            u: clamp(r.u + (Math.random() < 0.25 ? 1 : 0), 1, 3),
            need: POS[rnd(POS.length)], timer: 3, viral: false,
            p: [null, null], staff: [null, null], eta: [null, null],
        };
    }
    function addReport() {
        if (state.reports.length >= 3) state.reports.shift();
        const r = pickReport(state.lv.tier, REG.findIndex((x) => x[0] === state.lv.reg));
        state.reports.push(r);
        state.log.push(`Laporan warga: ${r.h}`);
    }
    function finishDispose(r, k) {
        const q = state.p[k], g = q.staff[r.staff[k]];
        const good = g && g.pos === r.need && g.kom >= r.u + 2 && g.int >= 5;
        if (good) {
            q.s[0] += 3; q.s[3] += 2; q.assets.sosial += 1;
            state.log.push(`${q.name}: ${r.h} selesai rapi oleh ${g.n}.`);
        } else if (g && (g.ty === "Penjilat" || g.int < 4)) {
            q.s[1] -= 6; q.s[4] -= 5; q.assets.skandal.push(r.h);
            state.log.push(`Penyelewengan dana! ${g.n} menyalahi disposisi ${q.name}.`);
        } else {
            q.s[0] += 1;
            state.log.push(`${q.name}: ${r.h} selesai, tapi kurang rapi.`);
        }
        q.s = q.s.map((v) => clamp(v, 0, 100));
    }
    function tickReports() {
        for (const r of state.reports) {
            for (let k = 0; k < 2; k++) {
                if (r.p[k] == null && !r.viral) {
                    r.timer--;
                    if (r.timer <= 0) {
                        r.viral = true;
                        state.p[k].s[0] = clamp(state.p[k].s[0] - 6, 0, 100);
                        state.log.push(`#ViralDiMedsos: ${r.h} (${state.p[k].name} −6 Per).`);
                    }
                }
                if (r.p[k] === 1 && r.eta[k] > 0) {
                    r.eta[k]--;
                    if (r.eta[k] === 0) finishDispose(r, k);
                }
            }
        }
    }

    function newState() {
        const tier = clamp(ui.setup.tier || 0, 0, TIERS.length - 1);
        const regIdx = clamp(ui.setup.reg || 0, 0, REG.length - 1);
        const lv = genLevel(tier, regIdx);
        const bot = online ? null : BOTS[rnd(BOTS.length)];
        const p = [mkP(playerName), mkP(bot ? bot.n : state?.p[1].name || "Lawan", false)];
        const nm = shuffle(NAMES);
        const staffOpts = STAFF.flatMap((g, i) => [0, 1].map((k) => ({
            ty: g.ty, d: g.d, info: g.info,
            n: nm[(i * 2 + k) % nm.length],
            pos: POS[(i * 2 + k) % POS.length],
            kom: 3 + rnd(7),
            loy: g.ty === "Penjilat" ? 8 + rnd(3) : 3 + rnd(7),
            int: g.ty === "Penjilat" ? 1 + rnd(3) : g.ty === "Populis" ? 3 + rnd(6) : 5 + rnd(4),
        })));
        const seat = Math.random() < 0.5 ? [1, 2] : [2, 1];
        const first = seat.indexOf(1);
        const s = {
            lv, career: ui.setup.mode === "karier", phase: "staff", sub: "event",
            staffOpts, bd: [false, false], round: 0, step: 0, seat, first, p, bot,
            pick: [null, null], reports: [], instr: null, log: [],
            el: {
                vehicle: [null, null], turn: 0, suara: [0, 0], mesin: [0, 0],
                seg: [[0, 0, 0, 0], [0, 0, 0, 0]], debt: [0, 0], intel: [],
                surprise: null, margin: 0, votes: [0, 0],
            },
            dq: 0, dans: [null, null], over: null,
        };
        state = s;
        if (!TIER_CFG[tier].staff) { state.phase = "janji"; startRound(); }
        return s;
    }

    function checkFail() {
        for (let k = 0; k < 2; k++) {
            const f = failIdx(state.p[k]);
            if (f >= 0) { mkOver(1 - k, failMsg(state.p[k], f)); return true; }
        }
        return false;
    }

    function startRound() {
        state.sub = "event"; state.step = 0; state.pick = [null, null];
        state.instr = state.round % 6 === 5 ? INSTR[Math.floor(state.round / 6) % INSTR.length] : null;
        state.p.forEach((q) => { q.sidak = 2; });
        tickReports();
        addReport();
        if (!online && state.bot && Math.random() < 0.6) respondBotReport();
    }

    function endRound() {
        state.p.forEach((q) => {
            const pa = teamVec(q), av = allocVec(q);
            q.s = q.s.map((v, j) => clamp(v - state.lv.d[j] + pa[j] + av[j] - (j === 0 && q.viral ? 3 : 0), 0, 100));
            if (q.viral) q.viral--;
            q.loyal = clamp(q.loyal + Math.round((q.alloc[3] - 25) / 8), 0, 100);
            q.s[1] = clamp(q.s[1] + Math.round((q.support - 50) / 25), 0, 100);
            if (q.loyal < 35 && state.round % 3 === 0) {
                q.s[0] = clamp(q.s[0] - 2, 0, 100);
                state.log.push(`Pelayanan ${q.name} melambat (loyalitas rendah).`);
            }
        });
        if (checkFail()) return;
        state.round++;
        if (state.round >= state.lv.gov) {
            state.phase = "declare"; state.step = 0; state.pick = [null, null];
            state.log.push("Masa jabatan berakhir. Deklarasi pencalonan dimulai.");
        } else startRound();
    }

    /* ---------- AI ---------- */
    function evalOpt(p, o, w, noise, init) {
        const ns = p.s.map((v, i) => Math.min(100, v + (p.shield && o.e[i] < 0 ? 0 : o.e[i]) + (init && i === 0 ? 2 : 0)));
        let sc = ns.reduce((a, v, i) => a + v * (w[i] ?? 1) - (v < 30 ? (30 - v) * 3 : 0), 0);
        if (ns.some((v) => v <= 4)) sc -= 500;
        return sc + Math.random() * noise;
    }
    function botEventIdx() {
        const ev = state.lv.deck[state.round], p = state.p[1], init = state.step === 0;
        let b = 0, bs = -1e9;
        ev.o.forEach((o, i) => {
            let s = evalOpt(p, o, state.bot.w, state.bot.noise, init);
            if (state.bot.persona === "keras" && p.s.some((v) => v < 30)) s += o.e.some((v) => Math.abs(v) >= 10) ? 30 : 0;
            if (state.bot.persona === "licik" && o.e[4] < -8) s += 18;
            if (s > bs) { bs = s; b = i; }
        });
        return b;
    }
    function botInstrIdx() {
        const p = state.p[1], o = state.instr.o;
        return o[0].sup > 0 && p.support < 70 || p.s[1] < 40 ? 0 : 1;
    }
    function botDebate() {
        const p = state.p[1], i = DEBATE[state.dq].a.findIndex((an) => p.s[an[1]] >= an[2]);
        return i < 0 ? 2 : i;
    }
    function botNeeds() {
        const ph = state.phase, p = state.p[1], need = TIER_CFG[state.lv.tier].staff;
        return (
            (ph === "staff" && p.staff.length < need) ||
            (ph === "janji" && p.janji == null) ||
            (ph === "budget" && !state.bd[1]) ||
            (ph === "play" && mover() === 1) ||
            (ph === "declare" && p.vehicle == null) ||
            (ph === "campaign" && mover() === 1) ||
            (ph === "debat" && state.dans[1] == null) ||
            (ph === "sengketa" && state.pick[1] == null)
        );
    }
    function botBud() {
        const w = [3, 0, 2, 4].map((k) => state.p[1].s[k]);
        const m = w.indexOf(Math.min(...w));
        return w.map((_, k) => (k === m ? 40 : 20));
    }
    function botAct() {
        botTimer = 0;
        if (!state || state.over || ui.ov) return;
        const ph = state.phase, p = state.p[1];
        if (ph === "staff") {
            const used = new Set(p.staff.map((g) => g.n));
            const i = state.staffOpts.findIndex((g, k) => !used.has(g.n) && (g.ty !== "Penjilat" || state.bot.persona !== "teknokrat"));
            applyAction({ type: "staff", i: i < 0 ? 0 : i }, 1);
        } else if (ph === "janji")
            applyAction({ type: "janji", j: shuffle([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]).slice(0, 3) }, 1);
        else if (ph === "budget") applyAction({ type: "budget", b: botBud() }, 1);
        else if (ph === "play" && mover() === 1)
            applyAction({ type: "choose", i: state.sub === "instr" ? botInstrIdx() : botEventIdx() }, 1);
        else if (ph === "declare") {
            const canInd = p.assets.logistik >= 20;
            applyAction({ type: "declare", v: state.bot.persona === "licik" || !canInd ? 0 : 1 }, 1);
        }
        else if (ph === "campaign" && mover() === 1) applyAction({ type: "campaign", i: botCampaignIdx() }, 1);
        else if (ph === "debat" && state.dans[1] == null) applyAction({ type: "debate", i: botDebate() }, 1);
        else if (ph === "sengketa" && state.pick[1] == null)
            applyAction({ type: "sengketa", i: p.s[4] >= 60 ? 0 : 1 }, 1);
    }
    function botCampaignIdx() {
        const p = state.p[1], meP = state.p[0];
        if (state.bot.persona === "licik" && meP.s[0] > p.s[0] + 10 && p.assets.logistik >= 6) return 2;
        if (state.bot.persona === "keras" && p.assets.logistik >= 14) return 1;
        if (p.assets.logistik < 6) return 0;
        return state.el.turn % 3 === 2 ? 3 : 0;
    }
    function respondBotReport() {
        const p = state.p[1];
        for (const r of state.reports) {
            if (r.p[1] != null) continue;
            if (p.staff.length && r.u <= 2 && Math.random() < 0.5) {
                const g = p.staff.find((x) => x.pos === r.need) || p.staff[0];
                r.p[1] = 1; r.staff[1] = p.staff.indexOf(g); r.eta[1] = 2 + rnd(3);
            } else if (p.s[1] > 20) {
                r.p[1] = 0; r.viral = false;
                p.s[0] = clamp(p.s[0] + 4, 0, 100); p.s[2] = clamp(p.s[2] - 3, 0, 100);
            } else r.p[1] = 2;
        }
    }

    /* ---------- akhir pertandingan & karier ---------- */
    function gateMet(p, tier) {
        const s = p.s, a = p.assets;
        switch (tier) {
            case 0: return s[0] >= 65 && s[1] > 0 && a.sosial >= 2;
            case 1: return s[4] > 60 && a.jaringan.length >= 1;
            case 2: return s[4] > 60 && a.jaringan.length >= 2;
            case 3: return s[3] >= 70 && a.prestasi.length >= 1;
            case 4: return a.logistik >= 10 && p.vehicle != null;
            case 5: return s[1] >= 70 && s[2] >= 70;
            case 6: return a.prestasi.length >= 2 && p.vehicle != null && p.cawapres;
            default: return true;
        }
    }
    function mkOver(w, why) {
        const win = w === me;
        state.over = { w, why, sc: state.p.map(score) };
        state.phase = "end";
        const p = state.p[me];
        if (win && !saved) {
            saved = true;
            try { if (state.over.sc[me] > bestGet()) localStorage.setItem(META.bestKey, String(state.over.sc[me])); } catch { }
        }
        if (state.career) {
            const ok = win && gateMet(p, state.lv.tier);
            if (ok) career.tier = Math.min(TIERS.length - 1, state.lv.tier + 1);
            if (!win) career.cycle += 1;
            career.sosial = p.assets.sosial;
            career.jaringan = p.assets.jaringan;
            career.logistik = p.assets.logistik;
            career.prestasi = p.assets.prestasi;
            career.skandal = p.assets.skandal;
            for (const b of BADGES) if (b.c(p, win, state.lv) && !career.badge.includes(b.id)) career.badge.push(b.id);
            saveCareer(career);
            ui.setup.tier = career.tier;
        }
        rank = Math.max(0, rank + (win ? 10 : -3));
        saveRank(rank);
    }

    /* ---------- aksi ---------- */
    function applyAction(a, actor) {
        if (!state) return;
        if (a.type === "join") {
            if (actor === 1 && online) { state.p[1].name = String(a.name || "Lawan").slice(0, 20); publish(); }
            return;
        }
        if (state.over) return;
        const p = state.p[actor], ph = state.phase;
        if (a.type === "cheat") {
            if (a.c === "boost") p.s = p.s.map((v) => Math.min(100, v + 20));
            else if (a.c === "shield") p.shield = true;
            else if (a.c === "money") { p.assets.logistik += 30; }
            else return;
            p.cheat = true;
            state.log.push(`${p.name} memakai cheat.`);
        } else if (a.type === "staff") {
            const need = TIER_CFG[state.lv.tier].staff;
            if (ph !== "staff" || p.staff.length >= need || !(a.i >= 0 && a.i < state.staffOpts.length)) return;
            if (p.staff.some((g) => g.n === state.staffOpts[a.i].n)) return;
            p.staff.push(state.staffOpts[a.i]);
            state.log.push(`${p.name} mengangkat ${p.staff[p.staff.length - 1].n} (${p.staff[p.staff.length - 1].ty}).`);
            if (state.p.every((q) => q.staff.length >= need)) { state.phase = "janji"; state.log.push("Pilih 3 janji kampanye."); }
        } else if (a.type === "janji") {
            const j = a.j;
            if (ph !== "janji" || p.janji != null || !Array.isArray(j) || j.length !== 3 ||
                new Set(j).size !== 3 || !j.every((x) => Number.isInteger(x) && x >= 0 && x < JANJI.length)) return;
            p.janji = j;
            state.log.push(`${p.name} berjanji: ${j.map((x) => JANJI[x].l).join(", ")}.`);
            if (state.p.every((q) => q.janji != null)) { state.phase = "budget"; state.bd = [false, false]; }
        } else if (a.type === "budget") {
            const b = a.b;
            if (ph !== "budget" || state.bd[actor] || !Array.isArray(b) || b.length !== 4 ||
                !b.every((x) => Number.isInteger(x) && x >= 0) || b.reduce((x, y) => x + y, 0) !== 100) return;
            p.alloc = b; state.bd[actor] = true;
            state.log.push(`${p.name} menetapkan anggaran.`);
            if (state.bd.every(Boolean)) { state.phase = "play"; startRound(); }
        } else if (a.type === "respond") {
            const r = state.reports.find((x) => x.id === a.id);
            if (ph !== "play" || !r || r.p[actor] != null) return;
            if (a.how === 0) {
                if (p.sidak < 1 || p.s[1] <= 5) return;
                p.sidak--;
                r.p[actor] = 0; r.viral = false;
                p.s[0] = clamp(p.s[0] + 4, 0, 100);
                p.s[2] = clamp(p.s[2] - 3, 0, 100);
                p.s[1] = clamp(p.s[1] - 2, 0, 100);
                state.log.push(`${p.name} sidak cepat: ${r.h}.`);
            } else if (a.how === 1) {
                if (!p.staff.length || !(a.g >= 0 && a.g < p.staff.length)) return;
                r.p[actor] = 1; r.staff[actor] = a.g; r.eta[actor] = 2 + rnd(3);
                p.s[0] = clamp(p.s[0] - 1, 0, 100);
                state.log.push(`${p.name} mendisposisikan ${r.h} ke ${p.staff[a.g].n}.`);
            } else if (a.how === 2) {
                r.p[actor] = 2;
                state.log.push(`${p.name} mengabaikan ${r.h}.`);
            } else return;
            checkFail();
        } else if (a.type === "mutate") {
            if (ph !== "play" || p.staff.length < 2 || !(a.i >= 0 && a.i < p.staff.length)) return;
            const j = (a.i + 1) % p.staff.length;
            const tmp = p.staff[a.i].pos;
            p.staff[a.i].pos = p.staff[j].pos;
            p.staff[j].pos = tmp;
            state.log.push(`${p.name} memutasi ${p.staff[a.i].n} dan ${p.staff[j].n}.`);
        } else if (a.type === "choose") {
            if (ph !== "play" || actor !== mover() || !(a.i >= 0 && a.i < (state.sub === "instr" ? state.instr.o.length : 3))) return;
            if (state.sub === "instr") {
                const o = state.instr.o[a.i];
                p.s = p.s.map((v, j) => Math.min(100, v + (p.shield && o.e[j] < 0 ? 0 : o.e[j])));
                p.support = clamp(p.support + o.sup, 0, 100);
                p.shield = false;
                state.log.push(`${p.name}: ${o.l} (Dukungan Pusat ${p.support}).`);
            } else {
                const o = state.lv.deck[state.round].o[a.i], init = state.step === 0;
                const e = o.e.map((v) => (p.shield && v < 0 ? 0 : v));
                p.shield = false;
                if (init) e[0] += 2;
                if (e[0] <= -6) { p.viral = 2; state.log.push(`#Viral: kebijakan ${p.name} dihujat netizen.`); }
                p.s = p.s.map((v, j) => Math.min(100, v + e[j]));
                state.log.push(`${p.name}: ${o.l}`);
            }
            state.pick[actor] = a.i;
            if (checkFail()) return;
            if (++state.step === 2) {
                if (state.sub === "event" && state.instr) {
                    state.sub = "instr"; state.step = 0; state.pick = [null, null];
                } else endRound();
            }
        } else if (a.type === "declare") {
            const v = a.v;
            if (ph !== "declare" || p.vehicle != null || !(v >= 0 && v <= 2)) return;
            if (v === 1 && p.assets.logistik < 20) return;
            if (v === 0) { p.vehicle = { t: "koalisi", n: 2 + rnd(2) }; state.el.mesin[actor] += 12; }
            else if (v === 1) { p.assets.logistik -= 20; p.vehicle = { t: "independen", n: 0 }; state.el.mesin[actor] += 4; p.s[0] = clamp(p.s[0] + 4, 0, 100); }
            else { p.vehicle = { t: "koalisi besar", n: 4 + rnd(2) }; state.el.mesin[actor] += 20; p.debt += 2; }
            if (state.lv.tier === 6) p.cawapres = true;
            state.log.push(`${p.name} maju lewat ${p.vehicle.t}${p.vehicle.n ? " (" + p.vehicle.n + " partai)" : ""}.`);
            if (state.p.every((q) => q.vehicle != null)) {
                state.phase = "campaign"; state.step = 0; state.pick = [null, null]; state.el.turn = 0;
                state.el.surprise = SURPRISE[rnd(SURPRISE.length)];
            }
        } else if (a.type === "campaign") {
            const i = a.i;
            if (ph !== "campaign" || actor !== mover() || !(i >= 0 && i < CAMPAIGN.length)) return;
            const c = CAMPAIGN[i], other = 1 - actor, o = state.p[other];
            let dana = 0, suara = 0, fx = "";
            if (c.k === "blusukan") { dana = 4; suara = 5; state.el.seg[actor][0] += 3; o.s[0] = clamp(o.s[0] + 1, 0, 100); }
            else if (c.k === "akbar") { dana = 14; suara = p.assets.logistik >= 14 ? 11 : 6; state.el.seg[actor][1] += 3; }
            else if (c.k === "isu") {
                dana = 6; suara = 0;
                const ketahuan = Math.random() < (p.s[4] < 50 ? 0.55 : 0.35);
                if (ketahuan) { p.s[4] = clamp(p.s[4] - 6, 0, 100); p.s[0] = clamp(p.s[0] - 8, 0, 100); p.assets.skandal.push("black campaign"); fx = " (ketahuan!)"; }
                else { state.el.suara[other] -= 9; fx = " (lawan −9)"; }
            } else { suara = 3; state.el.mesin[actor] += 6; p.debt += 1; p.assets.logistik += 16; }
            p.assets.logistik = Math.max(0, p.assets.logistik - dana);
            state.el.suara[actor] += suara;
            state.log.push(`${p.name}: ${c.n}${fx}`);
            state.pick[actor] = i;
            if (++state.step === 2) {
                const rev = state.pick.map((x) => CAMPAIGN[x]?.n || "?");
                state.el.intel.push(`Giliran ${state.el.turn + 1}: lawan terlihat memakai ${rev[1 - me]}.`);
                state.el.turn++; state.step = 0; state.pick = [null, null];
                if (state.el.turn >= 4) { state.phase = "debat"; state.log.push("Debat kandidat dimulai."); }
            }
        } else if (a.type === "debate") {
            if (ph !== "debat" || state.dans[actor] != null || !(a.i >= 0 && a.i < 3)) return;
            state.dans[actor] = a.i;
            if (state.dans.every((x) => x != null)) {
                state.p.forEach((q, k) => {
                    const an = DEBATE[state.dq].a[state.dans[k]], ok = an ? q.s[an[1]] >= an[2] : null;
                    const pen = q.assets.skandal.length ? 12 : 8;
                    q.deb += an ? (ok ? 10 : -pen) : 3;
                    state.log.push(`${q.name}: ${an ? (ok ? "klaim terbukti (+10)" : `blunder disoraki (−${pen})`) : "jawaban normatif (+3)"}`);
                });
                state.dq++; state.dans = [null, null];
                if (state.dq >= DEBATE.length) countVotes();
            }
        } else if (a.type === "sengketa") {
            if (ph !== "sengketa" || state.pick[actor] != null || !(a.i >= 0 && a.i < 2)) return;
            state.pick[actor] = a.i;
            if (state.pick.every((x) => x != null)) resolveSengketa();
        } else return;
        state.log = state.log.slice(-7);
        publish();
    }

    function countVotes() {
        const el = state.el;
        el.votes = state.p.map((q, k) => Math.max(0, Math.round(
            el.suara[k] + q.s[0] * 0.35 + el.mesin[k] + q.debt * -2 + el.surprise.v[k],
        )));
        el.margin = Math.abs(el.votes[0] - el.votes[1]);
        state.log.push(`Coblosan: ${el.votes[0]} vs ${el.votes[1]} (selisih ${el.margin}%).`);
        if (el.margin < 2) {
            state.phase = "sengketa"; state.step = 0; state.pick = [null, null];
            state.log.push("Selisih <2%: gugatan sengketa pemilu diajukan.");
        } else {
            const w = el.votes[0] > el.votes[1] ? 0 : 1;
            mkOver(w, "Pemilu selesai.");
        }
    }
    function resolveSengketa() {
        const el = state.el;
        state.p.forEach((q, k) => {
            const administrasi = state.reports.filter((r) => r.p[k] === 1 && r.eta[k] === 0).length;
            const ok = state.pick[k] === 0 ? (q.s[4] >= 60 && administrasi >= 1) : (q.support >= 55 || q.assets.logistik >= 20);
            if (ok) el.votes[k] += 3;
            else { el.votes[k] = Math.max(0, el.votes[k] - 2); q.s[4] = clamp(q.s[4] - 4, 0, 100); }
            state.log.push(`${q.name}: ${ok ? "gugatan dikabulkan (+3)" : "gugatan ditolak (−2, Itg −4)"}.`);
        });
        const w = el.votes[0] > el.votes[1] ? 0 : el.votes[0] < el.votes[1] ? 1 : -1;
        mkOver(w, "Sengketa pemilu diputuskan.");
    }

    function submitAction(a) {
        if (online && !room.isHost) { room.sendAction(a).catch(console.warn); return; }
        applyAction(a, playerIndex);
    }
    function publish() { render(); if (online && room.isHost) room.publishState(state).catch(console.warn); }

    const canAct = () => {
        if (!state || state.over || ui.ov) return false;
        const P = state.p[me], ph = state.phase;
        return ph === "play" || ph === "campaign"
            ? mover() === me
            : ph === "staff" ? P.staff.length < TIER_CFG[state.lv.tier].staff
                : ph === "janji" ? P.janji == null
                    : ph === "budget" ? !state.bd[me]
                        : ph === "declare" ? P.vehicle == null
                            : ph === "debat" ? state.dans[me] == null
                                : ph === "sengketa" ? state.pick[me] == null : false;
    };
    const confirm = (i) => {
        if (!canAct()) return;
        document.activeElement?.blur?.();
        const ph = state.phase;
        if (ph === "janji") { if (ui.jn.length === 3) submitAction({ type: "janji", j: [...ui.jn] }); return; }
        if (ph === "budget") return submitAction({ type: "budget", b: [...ui.bud] });
        submitAction({ type: ph === "staff" ? "staff" : ph === "declare" ? "declare" : ph === "campaign" ? "campaign" : ph === "debat" ? "debate" : ph === "sengketa" ? "sengketa" : "choose", i });
    };
    function toggleJn(i) {
        if (!canAct() || state.phase !== "janji") return;
        const k = ui.jn.indexOf(i);
        if (k >= 0) ui.jn.splice(k, 1);
        else { if (ui.jn.length >= 3) ui.jn.shift(); ui.jn.push(i); }
        render();
    }
    function rebal(v, i, n) {
        const o = [0, 1, 2, 3].filter((j) => j !== i);
        const so = o.reduce((a, j) => a + v[j], 0), rest = 100 - n, nv = [...v];
        nv[i] = n;
        o.forEach((j) => { nv[j] = so ? Math.round((v[j] * rest) / so) : Math.round(rest / 3); });
        const jm = o.reduce((m, j) => (nv[j] > nv[m] ? j : m), o[0]);
        nv[jm] = Math.max(0, nv[jm] + 100 - nv.reduce((a, b) => a + b, 0));
        return nv;
    }
    function paintBud() {
        ui.bud.forEach((v, i) => {
            const sl = $(`[data-sl="${i}"]`), t = $(`[data-sv="${i}"]`);
            if (sl) sl.value = v;
            if (t) t.textContent = v + "%";
        });
        const f = $("[data-bf]");
        if (f) f.textContent = "Efek per giliran: " + (vecTxt(allocVec({ alloc: ui.bud })) || "netral");
    }
    function handleInput(e) {
        const sl = e.target.closest?.("[data-sl]");
        if (!sl || !state || state.phase !== "budget" || state.bd[me]) return;
        ui.bud = rebal(ui.bud, +sl.dataset.sl, +sl.value);
        paintBud();
    }
    function newGame() {
        if (online && !room.isHost) return;
        career = loadCareer();
        if (ui.setup.mode === "karier") ui.setup.tier = career.tier;
        state = null; sel = 0; saved = false; ui.jn = []; ui.bud = [25, 25, 25, 25]; ui.tab = "desk";
        newState();
        publish();
    }
    /* ---------- overlay & HUD wiring ---------- */
    function syncHud() {
        const set = (k, v) => {
            const n = $(`[data-hud="${k}"]`);
            if (n && n.textContent !== String(v)) n.textContent = String(v);
        };
        set("tier", state ? state.lv.name : TIERS[clamp(ui.setup.tier || 0, 0, TIERS.length - 1)]);
        set("round", state ? `${Math.min(state.round + 1, state.lv.term)}/${state.lv.term}` : "—");
        set("score", state ? score(state.p[me]) : 0);
        const P = state?.p[me];
        set("mission", state
            ? `${state.lv.missions.filter((m) => P.s[m.i] >= m.v).length}/${state.lv.missions.length} · ${state.lv.paths} jalur`
            : "0/0");
        set("sidak", P ? P.sidak : 0);
        set("reg", state ? state.lv.reg : "—");
        const label = $("[data-pause] .pn-btn-label");
        if (label) label.textContent = ui.ov === "pause" ? "Resume" : "Pause";
        const pbtn = $("[data-pause]");
        if (pbtn) {
            pbtn.setAttribute("aria-label", ui.ov === "pause" ? "Resume" : "Jeda");
            pbtn.setAttribute("title", ui.ov === "pause" ? "Lanjutkan (P)" : "Jeda (P)");
        }
    }

    // Prioritas: help > cheat > pause > setup. Help menutup overlay lain.
    function setOv(v) {
        if (v === "help") ui.ov = "help";
        else if (v === "cheat") { if (ui.ov !== "help") ui.ov = "cheat"; }
        else if (v === "pause") { if (ui.ov !== "help" && ui.ov !== "cheat") ui.ov = "pause"; }
        else if (v === "setup") { if (!ui.ov) ui.ov = "setup"; }
        else ui.ov = null;
        renderOv();
    }
    function toggleHelp(on) {
        const want = typeof on === "boolean" ? on : ui.ov !== "help";
        if (want) setOv("help");
        else { setOv(null); render(); }
    }
    function toggleCheat(on) {
        const want = typeof on === "boolean" ? on : ui.ov !== "cheat";
        if (want) {
            if (ui.ov === "help") return;
            setOv("cheat");
        } else { setOv(null); render(); }
    }
    function togglePause(on) {
        const want = typeof on === "boolean" ? on : ui.ov !== "pause";
        if (want) {
            if (ui.ov === "help" || ui.ov === "cheat") return;
            clearTimeout(botTimer); botTimer = 0; // hentikan bot; tidak ada anchor Date.now() di game ini
            setOv("pause");
        } else {
            if (ui.ov !== "pause") return;
            setOv(null); render(); // jadwalkan ulang bot tanpa loncatan waktu
        }
    }
    function closeTop() {
        if (ui.ov === "help") return toggleHelp(false);
        if (ui.ov === "cheat") return toggleCheat(false);
        if (ui.ov === "pause") return togglePause(false);
        if (ui.ov === "setup") { setOv(null); render(); return; }
    }
    function restartGame() {
        if (online && !room.isHost) return;
        setOv(null);
        newGame();
    }

    /* ---------- render ---------- */
    const fx = (e) => e.map((v, j) => v ? `<u class="${v > 0 ? "up" : "dn"}">${ST[j][1]} ${ui.nums ? (v > 0 ? "+" : "") + v : (v > 0 ? "▲" : "▼").repeat(Math.abs(v) >= 8 ? 2 : 1)}</u>` : "").join("");
    const pCard = (i) => {
        const p = state.p[i];
        const a = p.assets;
        return `<div class="pn-p${i === me ? " me" : ""}"><div class="pn-ph"><b>${esc(p.name)}${i === me ? " (kamu)" : ""}</b><span>P${state.seat[i]}${p.cheat ? " · cheat" : ""}</span></div>
      <div class="pn-m" style="font-size:11px">${p.staff.length ? p.staff.map((g) => esc(g.n) + "·" + g.ty).join(", ") : "tanpa bawahan"}${p.viral ? " · #viral" : ""}${p.janji ? "<br>Janji: " + jshort(p) : ""}</div>
      <div class="pn-stat"><span>🤝 ${a.sosial}</span><span>🔗 ${a.jaringan.length}</span><span>💰 ${a.logistik}</span><span>⚑ ${a.prestasi.length}</span><span>Dukungan ${p.support}</span></div>
      ${ST.map(([n], j) => `<div class="pn-s"><span>${n}</span><span>${p.s[j]}</span><div class="pn-bar"><i${p.s[j] < 25 ? ' class="lo"' : ""} style="width:${Math.max(0, p.s[j])}%"></i></div></div>`).join("")}</div>`;
    };

    function deskView() {
        const ph = state.phase, P = state.p[me], mv = mover();
        if (ph === "staff") {
            const need = TIER_CFG[state.lv.tier].staff;
            const used = new Set(P.staff.map((g) => g.n));
            return {
                small: P.staff.length >= need ? "Menunggu lawan memilih tim…" : `Awal jabatan · pilih ${need - P.staff.length} bawahan lagi`,
                h: "Siapa yang kamu angkat?", dis: P.staff.length >= need,
                pk: -1,
                items: state.staffOpts.filter((g) => !used.has(g.n)).map((g) => ({
                    l: `${g.n} · ${g.ty} · ${g.pos}`,
                    sub: `Kompetensi ${g.kom} · Loyalitas ${g.loy ?? 60} · Integritas ${g.int} · ${g.info}`,
                    fx: fx(g.d.map((v, j) => (j === 4 ? (g.int <= 3 ? -3 : 0) : v))),
                })),
            };
        }
        if (ph === "janji") {
            return {
                small: P.janji != null ? "Menunggu lawan…" : "Kampanye · pilih 3 janji yang ditagih di akhir",
                h: "Janji kampanye", dis: P.janji != null, pk: -1,
                items: JANJI.map((j, i) => ({ l: j.l, sub: `${ST[j.i][0]} ≥ ${state.lv.jn[i]} · ${ui.nums ? "" : ""}` })),
            };
        }
        if (ph === "budget") {
            return {
                small: state.bd[me] ? "Menunggu lawan…" : "Musrenbang · bagi 100% anggaran antar sektor",
                h: "Alokasi anggaran", dis: state.bd[me], pk: -1, items: [],
            };
        }
        if (ph === "declare") {
            const opts = [
                { l: "Koalisi partai", sub: "Mesin +12 · bagi 2–3 jatah kabinet" },
                { l: "Independen", sub: "Butuh 💰20 · verifikasi KTP · mesin +4 · Per +4" },
                { l: "Koalisi besar", sub: "Mesin +20 · utang 4–5 jatah kabinet" },
            ];
            return {
                small: P.vehicle ? "Menunggu lawan…" : "Deklarasi pencalonan · pilih kendaraan politik",
                h: "Kendaraan politik", dis: P.vehicle != null, pk: -1, items: opts,
            };
        }
        if (ph === "campaign") {
            return {
                small: `Kampanye ${state.el.turn + 1}/4 · ${mv === me ? "giliranmu" : "lawan berkampanye…"} · 💰 ${P.assets.logistik}`,
                h: "Strategi kampanye", dis: mv !== me,
                pk: mv === me && state.step === 1 ? state.pick[1 - me] : -1,
                items: CAMPAIGN.map((c) => ({ l: c.n, sub: c.d })),
            };
        }
        if (ph === "debat") {
            const q = DEBATE[state.dq];
            return {
                small: `Debat ${state.dq + 1}/${DEBATE.length} · ${state.dans[me] != null ? "menunggu lawan…" : "klaimmu diuji rekam jejak"}${P.assets.skandal.length ? " · skandal lama bisa diungkit" : ""}`,
                h: q.q, dis: state.dans[me] != null, pk: state.dans[me] ?? -1,
                items: [...q.a.map((an) => ({ l: an[0], sub: ui.nums ? `Butuh ${ST[an[1]][0]} ≥ ${an[2]}` : "Berisiko: +10 atau −8" })), { l: "Jawab normatif", sub: "Aman: +3" }],
            };
        }
        if (ph === "sengketa") {
            return {
                small: `Sengketa pemilu · selisih ${state.el.margin}% · bukti administrasi: ${state.reports.filter((r) => r.p[me] === 1 && r.eta[me] === 0).length}`,
                h: "Gugatan hasil pemilu", dis: state.pick[me] != null, pk: state.pick[me] ?? -1,
                items: [
                    { l: "Tunjukkan integritas & bukti administrasi", sub: "Butuh Integritas ≥60 dan minimal 1 disposisi rapi" },
                    { l: "Mobilisasi saksi & massa", sub: "Butuh Dukungan Pusat ≥55 atau dana logistik ≥20" },
                ],
            };
        }
        const ev = state.lv.deck[state.round];
        return {
            small: mv === me
                ? `Giliranmu${state.step === 0 ? " · Inisiatif +2 Kepercayaan" : " · lawan sudah memilih"}`
                : `${esc(state.p[mv].name)} sedang memilih…`,
            h: state.sub === "instr" ? state.instr.h : ev.h,
            dis: mv !== me,
            pk: mv === me && state.step === 1 ? state.pick[1 - me] : -1,
            items: state.sub === "instr"
                ? state.instr.o.map((o) => ({ l: o.l, sub: `Dukungan Pusat ${o.sup > 0 ? "+" : ""}${o.sup}`, fx: fx(o.e) }))
                : ev.o.map((x) => ({ l: x.l, fx: fx(x.e) })),
        };
    }

    function renderDesk(mid, v) {
        const ph = state.phase;
        let html = mid;
        if (ph === "staff" || ph === "declare" || ph === "campaign" || ph === "debat" || ph === "sengketa" || ph === "play") {
            const sd = ph === "play" && mover() === me
                ? `<button class="pn-btn" style="margin-top:10px;width:100%;text-align:left" type="button" data-sidak ${v.dis || state.p[me].sidak < 1 || state.p[me].s[1] <= 5 ? "disabled" : ""}>Sidak lapangan (sisa ${state.p[me].sidak}) · Per +4, Stb −3, Kas −2, padamkan viral</button>` : "";
            const best = ui.hint && ph === "play" && mover() === me ? bestIdx([1, 1, 1, 1, 1], 0) : -1;
            html = `<div class="pn-ev"><small>${v.small}</small><h3>${esc(v.h)}</h3><div class="pn-op">
        ${v.items.map((x, i) => `<button class="pn-o${!v.dis && sel === i ? " on" : ""}${best === i ? " hint" : ""}${v.pk === i ? " pk" : ""}" type="button" data-opt="${i}" ${v.dis ? "disabled" : ""}>
          <span>${esc(x.l)}${v.pk === i ? ' <small class="pn-m">· dipilih</small>' : ""}${x.sub ? `<br><small class="pn-m">${esc(x.sub)}</small>` : ""}</span><span class="pn-fx">${x.fx || ""}</span></button>`).join("")}</div>${sd}</div>`;
        }
        return html;
    }
    function bestIdx(w, noise) {
        const ev = state.lv.deck[state.round], p = state.p[mover()], init = state.step === 0;
        let b = 0, bs = -1e9;
        ev.o.forEach((o, i) => { const s = evalOpt(p, o, w, noise, init); if (s > bs) { bs = s; b = i; } });
        return b;
    }

    function render() {
        const b = $("[data-board]");
        if (!b) return;
        if (!state) {
            b.innerHTML = '<p class="pn-m">Menunggu host menyiapkan level…</p>';
            stat("Menunggu"); syncHud(); return;
        }
        const key = state.phase + state.round + ":" + state.step + ":" + state.dq + ":" + state.sub + ":" + ui.tab;
        if (key !== lastKey) { lastKey = key; sel = 0; if (state.phase === "budget") ui.bud = [...state.p[me].alloc]; }
        const L = state.lv, o = state.over, ph = state.phase, P = state.p[me], opp = 1 - me;
        let mid = "";
        if (o) {
            const best0 = bestGet(), win = o.w === me;
            if (win && !saved) {
                saved = true;
                try { if (o.sc[me] > best0) localStorage.setItem(META.bestKey, String(o.sc[me])); } catch { }
            }
            const naik = state.career && win && gateMet(P, L.tier);
            mid = `<div class="pn-ev"><h3>${o.w < 0 ? "Seri" : win ? "Kamu menang" : esc(state.p[o.w].name) + " menang"}</h3>
        <p class="pn-m">${esc(o.why)}${state.career ? (naik ? ` Naik ke ${TIERS[Math.min(TIERS.length - 1, L.tier + 1)]}.` : win ? " Syarat naik jabatan belum terpenuhi." : " Jeda 1 siklus, aset karier tetap.") : ""}</p>
        <p>${esc(P.name)}: <b>${o.sc[me]}</b> · ${esc(state.p[opp].name)}: <b>${o.sc[opp]}</b></p>
        <p class="pn-m">Janji: ${jshort(P) || "—"} (${JP(P) >= 0 ? "+" : ""}${JP(P)} poin)</p>
        <p class="pn-m">Modal: Sosial ${P.assets.sosial} · Jaringan ${P.assets.jaringan.length} · Logistik ${P.assets.logistik} · Prestasi ${P.assets.prestasi.length} · Skandal ${P.assets.skandal.length}</p>
        <p class="pn-m">Peringkat: ${rank} · Skor terbaik: ${Math.max(best0, win ? o.sc[me] : 0)}</p>
        ${!online || room.isHost ? '<button class="pn-btn" type="button" data-new>Main lagi</button>' : '<p class="pn-m">Menunggu host memulai level baru…</p>'}</div>`;
        } else if (ph === "janji") {
            const done = P.janji != null, pick = done ? P.janji : ui.jn;
            mid = `<div class="pn-ev"><small>${done ? "Menunggu lawan…" : "Pilih 3 janji kampanye, ditagih di akhir masa jabatan"}</small><h3>Janji kampanye</h3><div class="pn-op">
        ${JANJI.map((j, i) => `<button class="pn-o${pick.includes(i) ? " on" : ""}" type="button" data-jn="${i}" ${done ? "disabled" : ""}><span>${esc(j.l)}<br><small class="pn-m">${ST[j.i][0]} ≥ ${L.jn[i]}</small></span><span class="pn-fx"><u class="up">+${j.g}</u><u class="dn">−${j.b}</u></span></button>`).join("")}</div>
        ${done ? "" : `<button class="pn-btn" style="margin-top:10px;width:100%" type="button" data-janji ${ui.jn.length === 3 ? "" : "disabled"}>Umumkan janji</button>`}</div>`;
        } else if (ph === "budget") {
            const done = state.bd[me];
            mid = `<div class="pn-ev"><small>${done ? "Menunggu lawan…" : "Musrenbang · bagi 100% anggaran antar sektor"}</small><h3>Alokasi anggaran</h3>
        ${SECT.map((n, i) => `<label class="pn-sl"><span>${n}</span><input type="range" min="0" max="100" step="1" value="${ui.bud[i]}" data-sl="${i}" ${done ? "disabled" : ""}><b data-sv="${i}">${ui.bud[i]}%</b></label>`).join("")}
        <p class="pn-m" data-bf></p>
        <p class="pn-m">Loyalitas bawahan saat ini: ${P.loyal}% · efek tim: ${vecTxt(teamVec(P)) || "netral"}</p>
        ${done ? "" : '<button class="pn-btn" style="width:100%" type="button" data-budget>Tetapkan anggaran</button>'}</div>`;
        } else if (ui.tab === "aspirasi") {
            mid = `<div class="pn-ev"><small>Keluhan masuk, urgensi & bola salju viral</small><h3>Aspirasi & Medsos</h3>
        ${state.reports.length ? state.reports.map((r) => {
                const mine = r.p[me];
                const doneBy = r.p.map((x, k) => x != null ? state.p[k].name : null).filter(Boolean).join(", ");
                const opts = mine == null ? `<div class="pn-ra">
              <button class="pn-btn" type="button" data-resp="0" data-id="${r.id}" ${state.p[me].sidak < 1 || state.p[me].s[1] <= 5 ? "disabled" : ""}>Respon Cepat</button>
              ${P.staff.length ? `<select data-assign="${r.id}">${P.staff.map((g, i) => `<option value="${i}">${esc(g.n)} · ${g.pos}</option>`).join("")}</select><button class="pn-btn" type="button" data-resp="1" data-id="${r.id}">Disposisi</button>` : ""}
              <button class="pn-btn" type="button" data-resp="2" data-id="${r.id}">Abaikan</button></div>`
                    : `<p class="pn-m">Statusmu: ${mine === 0 ? "respon cepat" : mine === 1 ? `disposisi (${r.eta[me] > 0 ? r.eta[me] + " giliran lagi" : "selesai"})` : "diabaikan"}. ${doneBy ? "· " + esc(doneBy) : ""}</p>`;
                return `<div class="pn-rp${r.viral ? " viral" : ""}"><div class="pn-rh"><span>${esc(r.h)}</span><span class="pn-tag${r.viral ? " hot" : ""}">${r.viral ? "#VIRAL" : "⌛" + r.timer}</span></div>
            <div class="pn-rb">${esc(r.b)}</div>
            <div class="pn-stat"><span>Urgensi ${"▲".repeat(r.u)}</span><span>Kebutuhan: ${r.need}</span>${mine == null && !r.viral ? `<span>sisa ${r.timer} giliran</span>` : ""}</div>${opts}</div>`;
            }).join("") : '<p class="pn-m">Belum ada laporan warga masuk.</p>'}
        <p class="pn-m">Respon Cepat: Per +4, Stb −3, Kas −2. Disposisi: selesai permanen 2–4 giliran; cocokkan pos & kompetensi staf.</p></div>`;
        } else if (ui.tab === "tim") {
            mid = `<div class="pn-ev"><small>Manajemen bawahan</small><h3>Jajaran Bawahan</h3>
        <div class="pn-stat"><span>Loyalitas: <b>${P.loyal}%</b></span><span>Integritas rata-rata: ${P.staff.length ? Math.round(P.staff.reduce((a, g) => a + g.int, 0) / P.staff.length) : "—"}</span></div>
        ${P.staff.length ? P.staff.map((g, i) => `<div class="pn-mem"><div><b>${esc(g.n)}</b> · ${g.ty}<br><small class="pn-m">${esc(g.pos)} · Kom ${g.kom} · Loy ${g.loy ?? 60} · Itg ${g.int}</small></div><button class="pn-btn" type="button" data-mut="${i}" ${ph !== "play" || mover() !== me || P.staff.length < 2 ? "disabled" : ""}>Mutasi</button></div>`).join("") : '<p class="pn-m">Jabatan ini tidak punya bawahan. Kelola lingkungan sendiri.</p>'}
        <p class="pn-m">Loyalitas dipengaruhi porsi Gaji pegawai di musrenbang. Di bawah 35%, pelayanan melambat dan efek tim melemah. Salah disposisi ke Penjilat/Itg rendah memicu penyelewengan.</p></div>`;
        } else {
            const v = deskView();
            mid = renderDesk(mid, v);
        }

        b.innerHTML = `
      <div class="pn-pl">${pCard(me)}${pCard(opp)}</div>
      <p class="pn-m" style="margin:6px 0 0">Misi (+20): ${L.missions.map((m) => `${ST[m.i][0]} ≥ ${m.v}`).join(" dan ")} · ${L.paths} jalur</p>
      <div class="pn-tabs">${TAB.map((t, i) => `<button class="pn-tab${ui.tab === t ? " on" : ""}" type="button" data-tab="${t}">${["Meja Kerja", "Aspirasi", "Bawahan"][i]}${t === "aspirasi" ? `<b>${state.reports.filter((r) => r.p[me] == null).length}</b>` : ""}</button>`).join("")}</div>
      ${mid}
      ${state.el.intel.length && ph !== "end" ? `<ul class="pn-log">${state.el.intel.slice(-2).map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : ""}
      <ul class="pn-log">${state.log.slice(-3).map((t) => `<li>${esc(t)}</li>`).join("")}</ul>
      <p class="pn-kb">Keyboard: ← → pilih, Enter konfirmasi, Tab ganti tab, S sidak, H bantuan, C cheat, P jeda, R restart.</p>`;

        stat(o ? "Selesai" : ph === "staff" ? "Pilih tim" : ph === "janji" ? "Kampanye" : ph === "budget" ? "Musrenbang" : ph === "declare" ? "Deklarasi" : ph === "campaign" ? "Kampanye" : ph === "debat" ? "Debat" : ph === "sengketa" ? "Sengketa" : ph === "play" ? (mover() === me ? "Giliranmu" : "Menunggu lawan") : "Menunggu");
        syncHud();
        if (ph === "budget" && !o) paintBud();
        if (!online && !o && !ui.ov && !botTimer && botNeeds()) botTimer = setTimeout(botAct, 700);
    }

    function renderOv() {
        const n = $("[data-ov]");
        n.hidden = !ui.ov;
        const closeIcon = (attr) => `<button class="pn-btn pn-icon-btn" type="button" ${attr} aria-label="Tutup" title="Tutup">${iconSVG("x", { size: 14 })}</button>`;
        if (ui.ov === "help") {
            n.innerHTML = `<div class="pn-bx">
      <div class="pn-head"><h3>Cara bermain</h3>${closeIcon("data-help-close")}</div>
      <div class="pn-body">${HELP}</div>
      <div class="pn-foot"><span class="pn-note">Tekan H untuk membuka lagi</span><button class="pn-btn primary" type="button" data-help-close>Mulai bermain</button></div>
    </div>`;
            return syncHud();
        }
        if (ui.ov === "cheat") {
            n.innerHTML = `<div class="pn-bx">
      <div class="pn-head"><h3>Cheat</h3>${closeIcon("data-close")}</div>
      <div class="pn-body">
        <button class="pn-btn" type="button" data-ca="boost">Isi +20 semua indikator</button>
        <button class="pn-btn" type="button" data-ca="money">Tambah dana logistik +30</button>
        <button class="pn-btn" type="button" data-ca="shield">Perisai: abaikan efek negatif berikutnya</button>
        <button class="pn-btn" type="button" data-ca="nums">Tampilkan angka efek: ${ui.nums ? "ON" : "OFF"}</button>
        <button class="pn-btn" type="button" data-ca="hint">Sorot opsi terbaik: ${ui.hint ? "ON" : "OFF"}</button>
      </div>
      <div class="pn-foot"><span class="pn-note">Cheat mencatat nama pemain di log</span><button class="pn-btn primary" type="button" data-close>Tutup</button></div>
    </div>`;
            return syncHud();
        }
        if (ui.ov === "setup") {
            n.innerHTML = `<div class="pn-bx">
      <div class="pn-head"><h3>Setup pertandingan</h3>${closeIcon("data-close")}</div>
      <div class="pn-body">
        <p class="pn-m">Mode:</p>
        ${[["karier", "Karier (RT → Presiden)"], ["sandbox", "Sandbox (pilih jabatan & wilayah)"], ["acak", "Acak (duel seimbang)"]].map(([k, l]) => `<button class="pn-btn" type="button" data-md="${k}">${ui.setup.mode === k ? "● " : "○ "}${l}</button>`).join("")}
        <p class="pn-m">Jabatan:</p>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px">${TIERS.map((t, i) => `<button class="pn-btn" type="button" data-tr="${i}" style="font-size:12px">${ui.setup.tier === i ? "● " : ""}${esc(t)}</button>`).join("")}</div>
        <p class="pn-m">Wilayah:</p>
        ${REG.map((r, i) => `<button class="pn-btn" type="button" data-rg="${i}">${ui.setup.reg === i ? "● " : ""}${r[0]}</button>`).join("")}
        <p class="pn-m">Peringkat: ${rank} · Jabatan tersimpan: ${TIERS[career.tier]} · Siklus tunggu: ${career.cycle}</p>
      </div>
      <div class="pn-foot"><span class="pn-note">Ulangi pertandingan memakai pengaturan ini</span><button class="pn-btn primary" type="button" data-start>Mulai / ulangi</button></div>
    </div>`;
            return syncHud();
        }
        if (ui.ov === "pause") {
            n.innerHTML = `<div class="pn-bx">
      <div class="pn-head"><h3>Dijeda</h3></div>
      <div class="pn-body"><p class="pn-m">Giliran dan bot dihentikan sementara. Tekan P atau Esc untuk melanjutkan.</p></div>
      <div class="pn-foot"><span class="pn-note">Tekan R untuk restart</span><button class="pn-btn primary" type="button" data-resume>Lanjutkan</button></div>
    </div>`;
            return syncHud();
        }
        n.innerHTML = "";
        syncHud();
    }

    /* ---------- input ---------- */
    function handleClick(event) {
        const t = (s) => event.target.closest(s);
        if (t("[data-exit]")) return onExit();
        if (t("[data-help]")) return toggleHelp();
        if (t("[data-help-close]")) return toggleHelp(false);
        if (t("[data-cheats]") || t("[data-cheat]")) return toggleCheat();
        if (t("[data-pause]")) return togglePause();
        if (t("[data-resume]")) return togglePause(false);
        if (t("[data-restart]")) return restartGame();
        if (t("[data-setup]")) return setOv("setup");
        if (t("[data-close]") || event.target.matches(".pn-ov")) return closeTop();
        const ca = t("[data-ca]");
        if (ca) {
            const c = ca.dataset.ca;
            if (["boost", "money", "shield"].includes(c)) submitAction({ type: "cheat", c });
            else { ui[c] = !ui[c]; render(); }
            return renderOv();
        }
        const md = t("[data-md]"), tr = t("[data-tr]"), rg = t("[data-rg]");
        if (md) { ui.setup.mode = md.dataset.md; if (ui.setup.mode === "karier") ui.setup.tier = career.tier; renderOv(); return; }
        if (tr) { ui.setup.tier = +tr.dataset.tr; renderOv(); return; }
        if (rg) { ui.setup.reg = +rg.dataset.rg; renderOv(); return; }
        if (t("[data-start]")) { setOv(null); return newGame(); }
        const tab = t("[data-tab]");
        if (tab) { ui.tab = tab.dataset.tab; sel = 0; return render(); }
        const resp = t("[data-resp]");
        if (resp) {
            const sel2 = root.querySelector(`[data-assign="${resp.dataset.id}"]`);
            const how = +resp.dataset.resp;
            submitAction({ type: "respond", id: resp.dataset.id, how, g: how === 1 ? +(sel2?.value ?? 0) : undefined });
            return;
        }
        const mut = t("[data-mut]");
        if (mut) { submitAction({ type: "mutate", i: +mut.dataset.mut }); return; }
        const jn = t("[data-jn]");
        if (jn) return toggleJn(+jn.dataset.jn);
        if (t("[data-janji]") || t("[data-budget]")) return confirm(0);
        if (t("[data-new]")) return newGame();
        if (t("[data-sidak]")) { if (canAct() && state.phase === "play") submitAction({ type: "respond", how: 0, id: state.reports.find((r) => r.p[me] == null)?.id || "" }); return; }
        const op = t("[data-opt]");
        if (op && !op.disabled) {
            const i = +op.dataset.opt;
            if (coarse && sel !== i) { sel = i; return render(); }
            return confirm(i);
        }
        const pad = t("[data-pad]");
        if (pad && canAct()) {
            const a = pad.dataset.pad;
            if (a === "ok") return confirm(sel);
            sel = (sel + (a === "next" ? 1 : 2)) % Math.max(1, deskView().items.length);
            render();
        }
    }

    function handleKey(e) {
        if (e.ctrlKey || e.metaKey || e.altKey || !root.isConnected) return;
        if (/INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
        const k = e.key;
        const code = e.code || "";
        const isHelp = code === "KeyH" || k === "h" || k === "H" || k === "?";
        const isCheat = code === "KeyC" || k === "c" || k === "C";
        const isPause = code === "KeyP" || k === "p" || k === "P";
        // Prioritas: help → cheat → pause → Escape → aksi game.
        if (isHelp) { e.preventDefault(); return toggleHelp(); }
        if (isCheat) { e.preventDefault(); return toggleCheat(); }
        if (isPause) { e.preventDefault(); return togglePause(); }
        if (k === "Escape") { e.preventDefault(); return closeTop(); }
        if (ui.ov) {
            if (k === "Enter") { e.preventDefault(); return closeTop(); }
            return;
        }
        if (code === "KeyR" || k === "r" || k === "R") { e.preventDefault(); return restartGame(); }
        if (k === "Tab") {
            e.preventDefault();
            ui.tab = TAB[(TAB.indexOf(ui.tab) + 1) % TAB.length]; sel = 0; return render();
        }
        if (k === "a" || k === "A") { ui.tab = "aspirasi"; sel = 0; return render(); }
        if (k === "t" || k === "T") { ui.tab = "tim"; sel = 0; return render(); }
        if (!canAct()) return;
        if (state.phase === "janji" && /^[1-9]$|^10$/.test(k)) { e.preventDefault(); return toggleJn(+k - 1); }
        if (k === "s" || k === "S") {
            if (state.phase === "play") {
                e.preventDefault();
                const r = state.reports.find((x) => x.p[me] == null);
                if (r) submitAction({ type: "respond", how: 0, id: r.id });
            }
        } else if (k === "ArrowLeft" || k === "ArrowUp") {
            e.preventDefault(); sel = (sel + 2) % Math.max(1, deskView().items.length); render();
        } else if (k === "ArrowRight" || k === "ArrowDown") {
            e.preventDefault(); sel = (sel + 1) % Math.max(1, deskView().items.length); render();
        } else if (/^[1-9]$/.test(k)) { e.preventDefault(); confirm(+k - 1); }
        else if (k === "Enter" || k === " ") { e.preventDefault(); confirm(sel); }
    }

    root.addEventListener("click", handleClick);
    root.addEventListener("input", handleInput);
    document.addEventListener("keydown", handleKey);

    try {
        if (!localStorage.getItem(HELP_KEY)) { localStorage.setItem(HELP_KEY, "1"); ui.ov = "help"; }
    } catch { }
    renderOv();

    if (online) {
        room.onRoom(() => { render(); });
        if (room.isHost) {
            newState();
            publish();
            room.onAction((action) => applyAction(action, 1));
        } else {
            room.onState((nextState) => { state = nextState; render(); });
            room.sendAction({ type: "join", name: playerName }).catch(console.warn);
            render();
        }
    } else {
        newState();
        render();
    }

    return {
        destroy() {
            root.removeEventListener("click", handleClick);
            document.removeEventListener("keydown", handleKey);
            root.removeEventListener("input", handleInput);
            clearTimeout(botTimer);
        },
    };
}
