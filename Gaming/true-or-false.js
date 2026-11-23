/* ==== true-or-false.js ==== */
/*
  True or False — trivia "fakta vs mitos" (template META + mount).
  - id META harus sama dengan nama file tanpa .js  -> true-or-false.js
  - Setelah mengubah META, jalankan: node tools/build-games-manifest.mjs
*/

export const META = {
    id: "true-or-false",
    name: "True or False",
    category: "trivia",
    catLabel: "Trivia",
    desc: "Fakta atau mitos? Jawab bergiliran melawan bot atau teman: 10 soal acak, 3 nyawa, level makin menantang.",
    art: '<svg viewBox="0 0 48 48" width="54" height="54" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="24" cy="24" r="17"/><path d="M16 24l6 6 11-11"/></svg>',
    bg: ["#99f6e4", "#0d9488"],
    bestKey: "trueOrFalseBestLevel",
};

/* ---------- Bank soal ----------
   q = pernyataan, a = kunci (true = fakta), d = kesulitan 1-3,
   c = kategori, t = tag anti-topik-kembar (opsional), w = penjelasan singkat */
const BANK = [
    // Antariksa
    { q: "Matahari adalah sebuah bintang.", a: true, d: 1, c: "Antariksa", w: "Matahari adalah bola plasma raksasa yang menghasilkan energi lewat fusi nuklir — persis definisi sebuah bintang." },
    { q: "Bulan memancarkan cahayanya sendiri.", a: false, d: 1, c: "Antariksa", w: "Bulan hanya memantulkan cahaya Matahari; permukaannya sebenarnya gelap, mirip aspal." },
    { q: "Merkurius adalah planet terdekat dari Matahari.", a: true, d: 1, c: "Antariksa", w: "Urutannya: Merkurius, Venus, Bumi, Mars. Meski paling dekat, Merkurius bukan yang terpanas." },
    { q: "Pluto masih dihitung sebagai planet utama tata surya.", a: false, d: 2, c: "Antariksa", w: "Sejak 2006 IAU mengklasifikasikan Pluto sebagai planet kerdil, bukan planet utama." },
    { q: "Venus adalah planet terpanas di tata surya.", a: true, d: 2, c: "Antariksa", t: "venus", w: "Atmosfer CO2 Venus yang tebal memicu efek rumah kaca ekstrem hingga sekitar 465°C — lebih panas dari Merkurius." },
    { q: "Merkurius adalah planet terpanas karena paling dekat Matahari.", a: false, d: 2, c: "Antariksa", t: "venus", w: "Merkurius nyaris tanpa atmosfer sehingga panasnya mudah lolos; Venus lebih panas berkat efek rumah kaca." },
    { q: "Satu hari di Venus lebih lama daripada satu tahunnya.", a: true, d: 3, c: "Antariksa", t: "venus", w: "Rotasi Venus butuh sekitar 243 hari Bumi, sedangkan satu orbit mengelilingi Matahari hanya sekitar 225 hari." },
    { q: "Matahari akan meledak menjadi supernova.", a: false, d: 3, c: "Antariksa", w: "Massa Matahari terlalu kecil untuk supernova; ia akan menggembung jadi raksasa merah lalu mengerut menjadi katai putih." },
    { q: "Saturnus akan mengapung jika ada bak air sebesar itu.", a: true, d: 3, c: "Antariksa", w: "Massa jenis rata-rata Saturnus sekitar 0,7 g/cm³ — lebih ringan daripada air." },
    { q: "Tahun cahaya adalah satuan waktu.", a: false, d: 1, c: "Antariksa", w: "Tahun cahaya adalah satuan jarak: sejauh yang ditempuh cahaya dalam setahun, sekitar 9,46 triliun km." },
    { q: "Astronot di ISS melayang karena tidak ada gravitasi.", a: false, d: 3, c: "Antariksa", w: "Gravitasi di orbit ISS masih sekitar 90% dari permukaan Bumi; astronot melayang karena terus jatuh bebas bersama stasiunnya." },
    { q: "Bulan selalu memperlihatkan sisi yang sama ke Bumi.", a: true, d: 2, c: "Antariksa", t: "moon", w: "Rotasi Bulan terkunci pasang surut: periode rotasinya sama persis dengan periode orbitnya mengelilingi Bumi." },
    { q: "Sisi jauh Bulan tidak pernah terkena sinar Matahari.", a: false, d: 3, c: "Antariksa", t: "moon", w: "Sisi jauh Bulan tetap mengalami siang dan malam; ia hanya tidak pernah terlihat dari Bumi." },
    { q: "Gerhana Matahari terjadi saat Bumi berada di antara Matahari dan Bulan.", a: false, d: 2, c: "Antariksa", w: "Posisi itu menghasilkan gerhana Bulan. Gerhana Matahari terjadi saat Bulan berada di antara Matahari dan Bumi." },
    { q: "Mars berwarna merah karena karat di permukaannya.", a: true, d: 2, c: "Antariksa", w: "Debu Mars kaya oksida besi — senyawa yang sama dengan karat pada besi di Bumi." },
    { q: "Jejak kaki astronot di Bulan bisa bertahan jutaan tahun.", a: true, d: 2, c: "Antariksa", w: "Bulan tanpa angin dan hujan, jadi jejak hanya terkikis sangat perlahan oleh mikrometeorit." },
    { q: "Ekor komet terbentuk karena esnya menguap dihantam panas Matahari.", a: true, d: 2, c: "Antariksa", w: "Panas Matahari menyublimkan es komet; gas dan debunya tertiup angin surya sehingga ekor selalu menjauhi Matahari." },
    { q: "Bintang di alam semesta lebih banyak daripada butir pasir di seluruh pantai Bumi.", a: true, d: 2, c: "Antariksa", w: "Perkiraan jumlah bintang 10²²–10²⁴, jauh melampaui estimasi butir pasir pantai yang sekitar 10¹⁹." },
    { q: "Langit berwarna biru karena memantulkan warna laut.", a: false, d: 2, c: "Antariksa", w: "Warna biru berasal dari hamburan Rayleigh: atmosfer menghamburkan cahaya biru lebih kuat daripada merah." },
    // Sains & fisika
    { q: "Suara merambat lebih cepat di air daripada di udara.", a: true, d: 2, c: "Sains", t: "sound", w: "Di air kecepatannya sekitar 1.480 m/detik, kira-kira 4 kali lipat kecepatannya di udara (343 m/detik)." },
    { q: "Suara bisa merambat di ruang hampa udara.", a: false, d: 1, c: "Sains", t: "sound", w: "Suara butuh medium seperti udara, air, atau benda padat; ruang hampa tidak punya medium untuk bergetar." },
    { q: "Suara bergerak lebih cepat daripada cahaya.", a: false, d: 1, c: "Sains", t: "sound", w: "Cahaya sekitar 300.000 km/detik, suara hanya 0,34 km/detik di udara — itu sebabnya kilat terlihat dulu sebelum guruh terdengar." },
    { q: "Petir tidak pernah menyambar tempat yang sama dua kali.", a: false, d: 1, c: "Sains", t: "lightning", w: "Menara dan gedung tinggi bisa tersambar puluhan kali setahun; tidak ada aturan 'sekali saja' untuk petir." },
    { q: "Sambaran petir bisa lebih panas daripada permukaan Matahari.", a: true, d: 3, c: "Sains", t: "lightning", w: "Kanal petir bisa mencapai sekitar 30.000 K — kira-kira 5 kali suhu permukaan Matahari (5.500°C)." },
    { q: "Air di puncak gunung mendidih pada suhu lebih rendah daripada di pantai.", a: true, d: 2, c: "Sains", t: "boil", w: "Tekanan udara lebih rendah di ketinggian, sehingga air mendidih di bawah 100°C — masakan pun lebih lama matang." },
    { q: "Air selalu mendidih tepat pada 100°C di mana pun.", a: false, d: 1, c: "Sains", t: "boil", w: "100°C hanya berlaku pada tekanan 1 atmosfer; di dataran tinggi titik didihnya turun." },
    { q: "Air laut membeku pada 0°C seperti air tawar.", a: false, d: 3, c: "Sains", w: "Kandungan garam menurunkan titik beku air laut menjadi sekitar -1,9°C." },
    { q: "Pada titik tripel, air bisa mendidih dan membeku bersamaan.", a: true, d: 3, c: "Sains", w: "Pada suhu 0,01°C dan tekanan 611 Pa, fase es, cair, dan uap air dapat hidup berdampingan sekaligus." },
    { q: "Nol mutlak setara dengan -273,15°C.", a: true, d: 3, c: "Sains", w: "Itu batas suhu terendah teoretis saat gerak termal partikel minimum; tidak ada yang bisa lebih dingin." },
    { q: "Menghirup helium membuat suara jadi lebih berat.", a: false, d: 2, c: "Sains", w: "Helium lebih ringan dari udara sehingga resonansi saluran suara naik — suara jadi melengking tinggi, bukan berat." },
    { q: "Elektron di dalam kabel mengalir secepat cahaya.", a: false, d: 3, c: "Sains", w: "Gerak hanyut elektron hanya beberapa mm/detik; yang merambat hampir secepat cahaya adalah medan listriknya." },
    { q: "Kaca adalah cairan yang mengalir sangat lambat.", a: false, d: 3, c: "Sains", w: "Kaca adalah padatan amorf. Kaca jendela kuno yang tebal sebelah berasal dari teknik pembuatan, bukan aliran." },
    { q: "Berlian terbentuk dari batu bara yang tertekan.", a: false, d: 3, c: "Sains", w: "Sebagian besar berlian terbentuk di mantel Bumi dari karbon purba — jauh lebih tua daripada tumbuhan pembentuk batu bara." },
    { q: "Es mengapung karena massa jenisnya lebih kecil daripada air.", a: true, d: 1, c: "Sains", w: "Saat membeku, molekul air menyusun kristal yang lebih renggang sehingga es sekitar 9% lebih ringan per volume." },
    { q: "Pelangi sebenarnya berbentuk lingkaran penuh.", a: true, d: 3, c: "Sains", w: "Dari pesawat, pelangi bisa terlihat bulat utuh; dari tanah, cakrawala memotong setengahnya menjadi busur." },
    { q: "Musim panas terjadi karena Bumi paling dekat dengan Matahari.", a: false, d: 2, c: "Sains", w: "Musim disebabkan kemiringan sumbu Bumi 23,5°. Belahan utara justru mengalami musim panas saat Bumi paling jauh dari Matahari." },
    { q: "Gravitasi Bulan sekitar seperenam gravitasi Bumi.", a: true, d: 2, c: "Sains", w: "Itu sebabnya astronot bisa melompat tinggi dan langkahnya memantul di permukaan Bulan." },
    { q: "Bumi berbentuk bulat sempurna.", a: false, d: 1, c: "Sains", w: "Rotasi membuat Bumi pepat di kutub dan menggembung di ekuator — bentuknya sferoida pepat, bukan bola sempurna." },
    { q: "Madu yang ditemukan di makam Mesir kuno masih bisa dimakan.", a: true, d: 2, c: "Sains", w: "Kadar airnya sangat rendah dan sifatnya asam, sehingga mikroba sulit hidup; madu murni praktis tidak basi." },
    { q: "Dalam kondisi tertentu, air panas bisa membeku lebih cepat daripada air dingin.", a: true, d: 3, c: "Sains", w: "Fenomena ini disebut efek Mpemba; penguapan, konveksi, dan pendinginan berlebih diduga berperan — masih aktif diteliti." },
    // Hewan
    { q: "Gurita punya tiga jantung.", a: true, d: 2, c: "Hewan", w: "Dua jantung memompa darah ke insang, satu ke seluruh tubuh; jantung utama justru berhenti saat gurita berenang." },
    { q: "Kelelawar itu buta total.", a: false, d: 1, c: "Hewan", t: "bat", w: "Kelelawar bisa melihat; ekolokasi hanyalah 'sonar' tambahan untuk berburu dalam gelap." },
    { q: "Kelelawar adalah satu-satunya mamalia yang benar-benar bisa terbang.", a: true, d: 2, c: "Hewan", t: "bat", w: "Tupai terbang dan kukang hanya meluncur; hanya kelelawar yang mengepakkan sayap untuk terbang aktif." },
    { q: "Penguin hidup liar di Kutub Utara.", a: false, d: 1, c: "Hewan", w: "Semua penguin liar hidup di belahan bumi selatan; di Kutub Utara tidak ada penguin." },
    { q: "Ikan mas hanya punya ingatan tiga detik.", a: false, d: 1, c: "Hewan", w: "Penelitian menunjukkan ikan mas bisa mengingat sesuatu hingga berbulan-bulan, termasuk pola pemberian makan." },
    { q: "Hiu sudah ada sebelum pohon muncul di Bumi.", a: true, d: 3, c: "Hewan", t: "shark", w: "Hiu muncul sekitar 450 juta tahun lalu, sedangkan pohon paling awal sekitar 385 juta tahun lalu." },
    { q: "Hiu tidak bisa terkena kanker.", a: false, d: 3, c: "Hewan", t: "shark", w: "Hiu tetap bisa mengembangkan tumor; mitos ini sempat dipakai untuk menjual suplemen tulang rawan hiu." },
    { q: "Semua jenis hiu akan mati jika berhenti berenang.", a: false, d: 3, c: "Hewan", t: "shark", w: "Hiu perawat dan hiu karang bisa beristirahat di dasar sambil memompa air melewati insangnya." },
    { q: "Punuk unta berisi cadangan air.", a: false, d: 1, c: "Hewan", w: "Punuk unta berisi lemak — cadangan energi, bukan air. Airnya disimpan dalam darah dan jaringan tubuh." },
    { q: "Burung unta mengubur kepalanya di pasir saat ketakutan.", a: false, d: 2, c: "Hewan", w: "Unta hanya menundukkan kepala ke sarang atau merendahkan tubuh; dari jauh tampak seperti 'mengubur' kepala." },
    { q: "Bunglon berubah warna terutama untuk menyamar.", a: false, d: 3, c: "Hewan", w: "Perubahan warna lebih untuk komunikasi suasana hati dan mengatur suhu tubuh; menyamar hanyalah bonus." },
    { q: "Kuda nil adalah perenang yang handal.", a: false, d: 3, c: "Hewan", w: "Tubuhnya terlalu padat untuk mengapung; kuda nil sebenarnya 'berlari' dan memantul di dasar sungai." },
    { q: "Sidik jari koala nyaris tak bisa dibedakan dari sidik jari manusia.", a: true, d: 3, c: "Hewan", w: "Koala berevolusi menghasilkan pola sidik jari yang sangat mirip manusia — contoh evolusi konvergen." },
    { q: "Kupu-kupu mengecap rasa dengan kakinya.", a: true, d: 2, c: "Hewan", w: "Reseptor rasa di kaki kupu-kupu membantunya mengenali tanaman inang yang tepat sebelum bertelur." },
    { q: "Nyamuk jantan mengisap darah manusia.", a: false, d: 2, c: "Hewan", w: "Hanya nyamuk betina yang butuh protein darah untuk telur; yang jantan minum nektar bunga." },
    { q: "Laba-laba adalah serangga.", a: false, d: 1, c: "Hewan", w: "Serangga berkaki enam; laba-laba berkaki delapan dan tergolong arachnida bersama kalajengking dan kutu." },
    { q: "Ubur-ubur tidak punya otak.", a: true, d: 2, c: "Hewan", w: "Ubur-ubur hanya punya jaringan saraf sederhana — tanpa otak, jantung, maupun tulang." },
    { q: "Paus biru adalah hewan terbesar yang pernah hidup di Bumi.", a: true, d: 2, c: "Hewan", w: "Panjangnya bisa 30 m dengan bobot sekitar 180 ton — melebihi dinosaurus mana pun yang diketahui." },
    { q: "Axolotl bisa menumbuhkan kembali kaki, ekor, bahkan sebagian jantungnya.", a: true, d: 2, c: "Hewan", w: "Axolotl adalah juara regenerasi: jaringan tubuhnya bisa tumbuh ulang nyaris tanpa bekas luka." },
    { q: "Tardigrada bisa bertahan hidup di ruang hampa luar angkasa.", a: true, d: 3, c: "Hewan", w: "'Beruang air' ini masuk kondisi kriptobiosis dan lolos eksperimen paparan langsung vakum luar angkasa." },
    { q: "Bintang laut adalah sejenis ikan.", a: false, d: 1, c: "Hewan", w: "Bintang laut adalah echinodermata — kerabat bulu babi dan teripang, bukan ikan." },
    { q: "Gajah adalah satu-satunya hewan yang tidak bisa melompat.", a: false, d: 3, c: "Hewan", w: "Kuda nil dan badak juga tidak bisa melompat, jadi gajah bukan satu-satunya." },
    { q: "Kuda tidak pernah tidur sambil berbaring.", a: false, d: 2, c: "Hewan", w: "Kuda bisa tidur ringan sambil berdiri, tetapi tidur REM yang dalam hanya terjadi saat berbaring." },
    { q: "Burung kolibri bisa terbang mundur.", a: true, d: 2, c: "Hewan", w: "Sendi bahu kolibri memutar sayapnya membentuk pola angka delapan, memungkinkannya mundur dan melayang di tempat." },
    { q: "Lumba-lumba tidur dengan setengah otak tetap sadar.", a: true, d: 3, c: "Hewan", w: "Otaknya bergantian istirahat per belahan agar tetap bisa naik ke permukaan untuk bernapas." },
    // Tubuh & kesehatan
    { q: "Manusia hanya menggunakan 10% otaknya.", a: false, d: 1, c: "Tubuh", w: "Pemindaian otak menunjukkan hampir semua area aktif setiap hari, bahkan saat kita tidur." },
    { q: "Jantung berhenti berdetak saat kita bersin.", a: false, d: 2, c: "Tubuh", w: "Tekanan di dada memang mengubah irama sesaat, tetapi jantung tidak berhenti saat bersin." },
    { q: "Rambut dan kuku terus tumbuh setelah seseorang meninggal.", a: false, d: 2, c: "Tubuh", w: "Itu ilusi: kulit mengering dan mengerut sehingga rambut dan kuku tampak lebih panjang." },
    { q: "Lidah punya zona rasa terpisah: manis di ujung, pahit di belakang.", a: false, d: 2, c: "Tubuh", w: "'Peta lidah' berasal dari salah terjemahan riset lama; semua area lidah bisa merasakan semua rasa." },
    { q: "Membunyikan sendi jari menyebabkan radang sendi.", a: false, d: 2, c: "Tubuh", w: "Bunyi 'kretek' berasal dari gelembung gas di cairan sendi; penelitian jangka panjang tidak menemukan kaitan dengan artritis." },
    { q: "Permen karet yang tertelan bertahan 7 tahun di perut.", a: false, d: 2, c: "Tubuh", w: "Karet memang tak tercerna, tetapi tetap lewat bersama sisa makanan dalam hitungan hari." },
    { q: "Makan banyak wortel membuatmu bisa melihat dalam gelap total.", a: false, d: 2, c: "Tubuh", w: "Vitamin A menjaga kesehatan mata, bukan memberi penglihatan malam super — itu propaganda radar era Perang Dunia II." },
    { q: "Otot bisa berubah menjadi lemak kalau berhenti berolahraga.", a: false, d: 2, c: "Tubuh", w: "Otot dan lemak adalah jaringan berbeda; otot mengecil dan lemak bertambah adalah dua proses terpisah." },
    { q: "Panas tubuh paling banyak hilang lewat kepala.", a: false, d: 3, c: "Tubuh", w: "Kepala hanya sekitar 7–10% luas permukaan tubuh; panas hilang merata dari bagian tubuh yang terbuka." },
    { q: "Bayi lahir dengan lebih banyak tulang daripada orang dewasa.", a: true, d: 2, c: "Tubuh", w: "Bayi punya sekitar 300 tulang yang sebagian menyatu seiring tumbuh; orang dewasa tersisa 206." },
    { q: "Manusia punya lebih dari lima indra.", a: true, d: 2, c: "Tubuh", w: "Selain lima indra klasik, kita punya keseimbangan, propriosepsi (posisi tubuh), suhu, nyeri, dan lainnya." },
    { q: "Antibiotik bisa menyembuhkan flu.", a: false, d: 1, c: "Tubuh", w: "Flu disebabkan virus; antibiotik hanya bekerja pada bakteri dan tidak mempan pada virus." },
    { q: "Vitamin C dosis besar terbukti mencegah flu.", a: false, d: 2, c: "Tubuh", w: "Riset menunjukkan efek pencegahannya nyaris nol pada populasi umum; durasi flu mungkin hanya sedikit lebih pendek." },
    { q: "Golongan darah menentukan kepribadian seseorang.", a: false, d: 2, c: "Tubuh", w: "Kepercayaan populer ini tidak didukung bukti ilmiah kuat dari penelitian psikologi yang ketat." },
    { q: "DNA manusia dan simpanse sekitar 98–99% identik.", a: true, d: 3, c: "Tubuh", w: "Kedekatan genetik ini menjadikan simpanse kerabat terdekat manusia yang masih hidup." },
    { q: "Banteng mengamuk karena warna merah kain matador.", a: false, d: 1, c: "Tubuh", w: "Sapi buta warna terhadap merah; yang memancing serangannya adalah gerakan kain, bukan warnanya." },
    { q: "Ular pawang menari mengikuti musik seruling.", a: false, d: 2, c: "Tubuh", w: "Ular tak mendengar musik seruling dengan baik; ia mengikuti gerakan seruling dan pawang, bukan melodinya." },
    { q: "Vaksin menyebabkan autisme.", a: false, d: 1, c: "Tubuh", w: "Studi besar berulang kali membantahnya; paper pemicu mitos ini telah dicabut karena manipulasi data." },
    // Bumi & geografi
    { q: "Everest adalah gunung tertinggi jika diukur dari dasarnya.", a: false, d: 3, c: "Bumi", w: "Dari dasar laut, Mauna Kea di Hawaii tingginya sekitar 10.200 m — melampaui Everest yang diukur dari muka laut." },
    { q: "Sahara adalah gurun terbesar di dunia.", a: false, d: 3, c: "Bumi", w: "Gurun terbesar adalah Antarktika (gurun dingin); Sahara hanya gurun panas terbesar." },
    { q: "Amazon adalah hutan hujan tropis terbesar di dunia.", a: true, d: 1, c: "Bumi", w: "Amazon membentang sekitar 5,5 juta km² di Amerika Selatan, rumah bagi sekitar 10% spesies yang dikenal." },
    { q: "Danau Baikal di Rusia adalah danau terdalam di dunia.", a: true, d: 3, c: "Bumi", w: "Kedalamannya sekitar 1.642 m dan menyimpan kira-kira 20% air tawar cair permukaan Bumi." },
    { q: "Awan putih kecil di langit hanya berbobot beberapa kilogram.", a: false, d: 2, c: "Bumi", w: "Awan kumulus berukuran sedang bisa mengandung ratusan ton air yang tersebar sebagai droplet super kecil." },
    // Sejarah
    { q: "Tembok Besar Cina terlihat dari Bulan dengan mata telanjang.", a: false, d: 2, c: "Sejarah", w: "Temboknya panjang tetapi sempit; para astronot memastikan tak terlihat dari Bulan, dari orbit rendah pun sulit." },
    { q: "Napoleon jauh lebih pendek daripada rata-rata pria zamannya.", a: false, d: 3, c: "Sejarah", w: "Tingginya sekitar 1,69 m — rata-rata Prancis saat itu. Mitos lahir dari beda satuan inci dan propaganda Inggris." },
    { q: "Viking memakai helm bertanduk saat bertempur.", a: false, d: 2, c: "Sejarah", w: "Tidak ada helm tempur Viking bertanduk yang ditemukan; citra itu populer lewat kostum opera abad ke-19." },
    { q: "Einstein gagal pelajaran matematika di sekolah.", a: false, d: 2, c: "Sejarah", w: "Einstein justru menguasai kalkulus sebelum usia 15 tahun; ia hanya tidak cocok dengan gaya sekolah yang kaku." },
    { q: "Manusia purba pernah hidup sezaman dengan dinosaurus.", a: false, d: 1, c: "Sejarah", w: "Dinosaurus non-unggas punah 66 juta tahun lalu, manusia baru muncul ratusan ribu tahun lalu — terpaut sangat jauh." },
    { q: "Patung Liberty sejak awal berwarna hijau.", a: false, d: 2, c: "Sejarah", w: "Ia terbuat dari tembaga yang awalnya cokelat mengilap; lapisan patina hijau terbentuk setelah puluhan tahun." },
    { q: "Titanic membawa sekoci cukup untuk semua penumpangnya.", a: false, d: 2, c: "Sejarah", w: "Sekocinya hanya cukup untuk sekitar separuh orang di kapal — aturan lama yang tragisnya terbukti fatal." },
    { q: "Cleopatra hidup lebih dekat ke pendaratan Bulan daripada ke pembangunan Piramida Giza.", a: true, d: 3, c: "Sejarah", w: "Piramida Giza berdiri sekitar 2560 SM, Cleopatra sekitar 30 SM, pendaratan Bulan 1969 — jaraknya memang lebih dekat ke 1969." },
    { q: "Piramida Giza dibangun oleh pasukan budak.", a: false, d: 3, c: "Sejarah", w: "Bukti arkeologi menunjukkan para pembangun adalah pekerja terlatih yang digaji dan dimakamkan dengan hormat." },
    { q: "Menara Eiffel bertambah tinggi belasan sentimeter saat musim panas.", a: true, d: 3, c: "Sejarah", w: "Logam memuai saat panas; struktur besinya bisa 'tumbuh' hingga sekitar 15 cm di hari terik." },
    { q: "Kata 'robot' berasal dari bahasa Ceko.", a: true, d: 3, c: "Sejarah", w: "Dari kata 'robota' (kerja paksa), dipopulerkan drama R.U.R. karya Karel Čapek tahun 1920." },
    // Teknologi
    { q: "Microwave memasak makanan dari dalam ke luar.", a: false, d: 3, c: "Teknologi", w: "Gelombang mikro hanya menembus beberapa cm; bagian tengah matang lewat rambatan panas dari lapisan luar." },
    { q: "Wi-Fi adalah singkatan dari Wireless Fidelity.", a: false, d: 3, c: "Teknologi", w: "Wi-Fi hanyalah merek dagang yang dibuat tim pemasaran — tidak merupakan singkatan apa pun." },
    { q: "Mode incognito menyembunyikan aktivitasmu dari penyedia internet.", a: false, d: 2, c: "Teknologi", w: "Incognito hanya tidak menyimpan riwayat lokal; penyedia internet dan situs yang dikunjungi tetap bisa melihatmu." },
    { q: "File yang dihapus langsung lenyap permanen dari penyimpanan.", a: false, d: 2, c: "Teknologi", w: "Biasanya hanya ruangnya ditandai 'kosong'; data masih bisa dipulihkan sampai tertimpa data baru." },
    { q: "RAM menyimpan data secara permanen.", a: false, d: 1, c: "Teknologi", w: "RAM bersifat volatil: isinya hilang begitu listrik dimatikan; penyimpanan permanen ada di SSD/HDD." },
    { q: "Kamera dengan megapiksel lebih besar pasti menghasilkan foto lebih bagus.", a: false, d: 2, c: "Teknologi", w: "Ukuran sensor, lensa, dan pemrosesan gambar jauh lebih menentukan daripada angka megapiksel." },
    { q: "Sinyal ponsel di pom bensin mudah memicu ledakan.", a: false, d: 2, c: "Teknologi", w: "Investigasi tidak menemukan kasus nyata; risiko sebenarnya adalah listrik statis dari tubuh, bukan sinyal." },
    // Indonesia
    { q: "Danau Toba terbentuk dari letusan gunung api purba.", a: true, d: 1, c: "Indonesia", w: "Letusan super Toba sekitar 74.000 tahun lalu meninggalkan kaldera raksasa yang kini menjadi danau." },
    { q: "Komodo adalah kadal terbesar yang masih hidup.", a: true, d: 1, c: "Indonesia", w: "Komodo bisa mencapai 3 m dan 70 kg; ia hanya ditemukan liar di beberapa pulau di Nusa Tenggara." },
    { q: "Borobudur adalah candi Buddha terbesar di dunia.", a: true, d: 2, c: "Indonesia", w: "Monumen abad ke-9 di Jawa Tengah ini tersusun dari sekitar 2 juta balok batu andesit." },
    { q: "Indonesia berada di jalur Cincin Api Pasifik.", a: true, d: 1, c: "Indonesia", w: "Pertemuan lempeng membuat Indonesia punya ratusan gunung api dan gempa yang sering — bagian dari Ring of Fire." },
    { q: "Bahasa Indonesia berakar dari bahasa Melayu.", a: true, d: 1, c: "Indonesia", w: "Bahasa Melayu Riau menjadi dasar bahasa persatuan yang diikrarkan dalam Sumpah Pemuda 1928." },
];

const TOTAL = 10;
const LIVES = 3;
const MAX_LEVEL = 9;
const DIFF_NAME = { 1: "Mudah", 2: "Sedang", 3: "Sulit" };
const DIFF_PLAN = [
    [1, 1, 1, 1, 1, 1, 1, 2, 2, 2], // level 1
    [1, 1, 1, 1, 2, 2, 2, 2, 2, 3], // level 2
    [1, 1, 2, 2, 2, 2, 3, 3, 3, 3], // level 3
    [1, 2, 2, 2, 3, 3, 3, 3, 3, 3], // level 4
    [2, 2, 2, 3, 3, 3, 3, 3, 3, 3], // level 5+
];

function shuffle(src) {
    const a = src.slice();
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}
function timeFor(level) { return level <= 2 ? 10 : Math.max(6, 11 - level); }
function botAccuracy(d, level) {
    return Math.min(0.93, ({ 1: 0.86, 2: 0.74, 3: 0.62 }[d] || 0.7) + (level - 1) * 0.02);
}

/* Generator level acak yang DIJAMIN bisa diselesaikan & adil:
   - 10 soal unik, tanpa topik kembar (tag)
   - tepat 5 fakta + 5 mitos per pertandingan
   - tiap pemain dapat 5 soal dengan komposisi 2-3 fakta (seimbang)
   - kesulitan mengikuti level; menang selalu mungkin (jawab sempurna = 0 salah) */
function generateDeck(level, firstSeat) {
    const diffs = shuffle(DIFF_PLAN[Math.min(level, DIFF_PLAN.length) - 1]);
    const kTrue = 2 + Math.floor(Math.random() * 2);
    const mk = (k) => shuffle(Array.from({ length: 5 }, (_, i) => i < k));
    const patterns = [mk(kTrue), mk(5 - kTrue)]; // [pemain jalan dulu, pemain kedua]
    const used = new Set(), tags = new Set(), deck = [];
    for (let i = 0; i < TOTAL; i++) {
        const seat = (firstSeat + i) % 2;
        const want = patterns[seat === firstSeat ? 0 : 1].pop();
        const pref = diffs[i];
        let pool = BANK.filter((it) => !used.has(it) && it.a === want && it.d === pref && (!it.t || !tags.has(it.t)));
        if (!pool.length) pool = BANK.filter((it) => !used.has(it) && it.a === want && (!it.t || !tags.has(it.t)));
        if (!pool.length) pool = BANK.filter((it) => !used.has(it) && it.a === want);
        if (!pool.length) pool = BANK.filter((it) => !used.has(it));
        const pick = pool[Math.floor(Math.random() * pool.length)];
        used.add(pick);
        if (pick.t) tags.add(pick.t);
        deck.push({ q: pick.q, a: pick.a, d: pick.d, c: pick.c, w: pick.w });
    }
    return { deck, timeLimit: timeFor(level) };
}

export function mount(root, context = {}) {
    const { mode = "ai", room = null, playerName = "Player", onExit = () => { } } = context;
    const online = mode === "room" && Boolean(room);
    const myActor = online && !room.isHost ? 1 : 0; // 0 = host/lokal, 1 = tamu/bot
    const authority = !online || room.isHost;       // pemegang otoritas timer & transisi
    let roomData = room?.room || null;
    let state = null;
    let dead = false;

    const ui = { help: false, cheat: false };
    const cheats = { reveal: false, freeze: false, lives: false, auto: false };
    let cheatUsed = false, frozenLeft = null, engineKey = "";
    let best = 0;
    try { best = Number(localStorage.getItem(META.bestKey)) || 0; } catch (_) { }

    const timers = new Set();
    const unsubs = [];
    const READY_SUB = "Pisahkan fakta dari mitos! " + TOTAL + " soal bergiliran, " + LIVES +
        " nyawa per pemain, waktu makin singkat tiap level. Posisi pemain & giliran pertama diundi.";

    root.innerHTML = `
<div class="game-app tf-app">
<style>
.tf-app{--tf-bg:#0b1120;--tf-panel:#0f172a;--tf-line:#ffffff14;--tf-ink:#e7ecf5;--tf-mut:#8fa0b8;--tf-ok:#34d399;--tf-no:#fb7185;--tf-warn:#fbbf24;--tf-acc:#5eead4;color:var(--tf-ink)}
.tf-app [hidden]{display:none!important}
.tf-app .tf-panel{position:relative;display:flex;flex-direction:column;gap:14px;background:var(--tf-panel);border:1px solid var(--tf-line);border-radius:20px;padding:20px;min-height:480px;overflow:hidden}
.tf-app .tf-tools{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.tf-app .tf-chip{font-size:10.5px;letter-spacing:.09em;text-transform:uppercase;color:var(--tf-mut);border:1px solid var(--tf-line);border-radius:999px;padding:4px 10px;white-space:nowrap}
.tf-app .tf-chip b{color:var(--tf-ink)}
.tf-app .tf-grow{flex:1}
.tf-app .tf-ghost{border:1px solid var(--tf-line);background:transparent;color:var(--tf-mut);font-size:11.5px;font-weight:700;border-radius:999px;padding:5px 12px;cursor:pointer;transition:color .15s,border-color .15s}
.tf-app .tf-ghost:hover:not(:disabled){color:var(--tf-ink);border-color:#ffffff3a}
.tf-app .tf-ghost:disabled{opacity:.4;cursor:not-allowed}
.tf-app .tf-players{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.tf-app .tf-pc{border:1px solid var(--tf-line);border-radius:14px;padding:10px 12px;display:flex;flex-direction:column;gap:3px;transition:border-color .2s,box-shadow .2s;min-width:0}
.tf-app .tf-pc.on{border-color:var(--tf-acc);box-shadow:0 0 0 1px var(--tf-acc) inset}
.tf-app .tf-plabel{font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:var(--tf-mut)}
.tf-app .tf-pname{font-weight:800;font-size:15px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.tf-app .tf-pstats{display:flex;justify-content:space-between;align-items:center;gap:6px;font-size:12px;color:var(--tf-mut)}
.tf-app .hp{color:var(--tf-no);letter-spacing:2px}
.tf-app .hp.off{color:#ffffff22}
.tf-app .tf-notice{font-size:11.5px;color:var(--tf-mut);text-align:center}
.tf-app .tf-timer{height:6px;border-radius:999px;background:#ffffff10;overflow:hidden}
.tf-app .tf-fill{height:100%;width:100%;border-radius:999px;background:var(--tf-ok);transition:width .15s linear,background .3s,opacity .3s}
.tf-app .tf-fill.warn{background:var(--tf-warn)}
.tf-app .tf-fill.danger{background:var(--tf-no)}
.tf-app .tf-fill.idle{opacity:.35}
.tf-app .tf-meta{display:flex;align-items:center;gap:8px}
.tf-app .tf-dots{font-size:10px;color:var(--tf-acc);letter-spacing:2px}
.tf-app .tf-secs{margin-left:auto;font-variant-numeric:tabular-nums;font-size:12px;font-weight:800;color:var(--tf-mut)}
.tf-app .tf-st{min-height:96px;display:flex;align-items:center;justify-content:center;text-align:center;font-size:clamp(18px,3.3vw,24px);font-weight:700;line-height:1.5;letter-spacing:-.01em;padding:2px 6px}
.tf-app .tf-btns{display:flex;gap:12px;justify-content:center}
.tf-app .tf-btn{flex:1;max-width:230px;display:flex;align-items:center;justify-content:center;gap:10px;padding:15px 16px;border-radius:14px;border:1px solid var(--tf-line);background:#ffffff07;color:var(--tf-ink);font-size:16px;font-weight:800;cursor:pointer;transition:border-color .15s,background .15s,transform .1s,color .15s}
.tf-app .tf-btn svg{width:20px;height:20px;flex:none}
.tf-app .tf-btn:hover:not(:disabled){transform:translateY(-1px)}
.tf-app .tf-btn.true:hover:not(:disabled){border-color:var(--tf-ok);color:var(--tf-ok)}
.tf-app .tf-btn.false:hover:not(:disabled){border-color:var(--tf-no);color:var(--tf-no)}
.tf-app .tf-btn.good{background:#34d39922;border-color:var(--tf-ok);color:var(--tf-ok)}
.tf-app .tf-btn.bad{background:#fb718522;border-color:var(--tf-no);color:var(--tf-no)}
.tf-app .tf-btn.hint{border-style:dashed;border-color:var(--tf-acc)}
.tf-app .tf-btn:disabled{cursor:default;opacity:.75}
.tf-app .tf-btn.good:disabled,.tf-app .tf-btn.bad:disabled{opacity:1}
.tf-app .tf-kbd{border:1px solid var(--tf-line);border-bottom-width:2px;border-radius:6px;padding:0 6px;font-size:10.5px;color:var(--tf-mut);font-family:ui-monospace,SFMono-Regular,monospace}
.tf-app .tf-fb{min-height:20px;text-align:center;font-size:13.5px;font-weight:700;color:var(--tf-mut)}
.tf-app .tf-fb.good{color:var(--tf-ok)}
.tf-app .tf-fb.bad{color:var(--tf-no)}
.tf-app .tf-why{border:1px solid var(--tf-line);border-left:3px solid var(--tf-acc);border-radius:12px;background:#ffffff06;padding:11px 13px;font-size:13px;line-height:1.65;color:#c7d2e2}
.tf-app .tf-why b{display:block;font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:var(--tf-acc);margin-bottom:3px}
.tf-app .tf-next{align-self:center;border:1px solid var(--tf-acc);background:transparent;color:var(--tf-acc);font-weight:800;font-size:13px;border-radius:999px;padding:8px 18px;cursor:pointer}
.tf-app .tf-next:hover{background:#5eead41a}
.tf-app .tf-touch{display:none;gap:10px;position:sticky;bottom:0;z-index:4;padding:10px 0 calc(10px + env(safe-area-inset-bottom,0px));background:linear-gradient(180deg,transparent,var(--tf-bg) 40%)}
.tf-app .tf-tbtn{flex:1;min-height:64px;display:flex;align-items:center;justify-content:center;gap:10px;font-size:18px;font-weight:800;border-radius:16px;border:1px solid var(--tf-line);cursor:pointer;touch-action:manipulation;-webkit-tap-highlight-color:transparent;transition:transform .08s,opacity .15s}
.tf-app .tf-tbtn:active:not(:disabled){transform:scale(.97)}
.tf-app .tf-tbtn.true{background:#34d3991c;color:var(--tf-ok);border-color:#34d39955}
.tf-app .tf-tbtn.false{background:#fb71851c;color:var(--tf-no);border-color:#fb718555}
.tf-app .tf-tbtn.good{background:#34d39944}
.tf-app .tf-tbtn.bad{background:#fb718544}
.tf-app .tf-tbtn.hint{border-style:dashed;border-color:var(--tf-acc)}
.tf-app .tf-tbtn:disabled{opacity:.45;cursor:default}
.tf-app .tf-tbtn.good:disabled,.tf-app .tf-tbtn.bad:disabled{opacity:1}
.tf-app .tf-tbtn svg{width:22px;height:22px}
.tf-app .tf-ov{position:absolute;inset:0;z-index:6;display:flex;align-items:center;justify-content:center;padding:16px;background:#0b1120d9;backdrop-filter:blur(5px)}
.tf-app .tf-card{width:100%;max-width:440px;max-height:100%;overflow:auto;display:flex;flex-direction:column;gap:12px;background:#111b31;border:1px solid var(--tf-line);border-radius:18px;padding:22px;text-align:center}
.tf-app .tf-card h3{margin:0;font-size:20px;font-weight:800;letter-spacing:-.01em}
.tf-app .tf-card .sub{margin:0;font-size:13px;line-height:1.65;color:var(--tf-mut)}
.tf-app .tf-main{border:0;border-radius:12px;background:var(--tf-acc);color:#062a22;font-size:14.5px;font-weight:800;padding:12px 16px;cursor:pointer;transition:filter .15s}
.tf-app .tf-main:hover:not(:disabled){filter:brightness(1.08)}
.tf-app .tf-main:disabled{opacity:.5;cursor:default}
.tf-app .tf-sec{border:1px solid var(--tf-line);border-radius:12px;background:transparent;color:var(--tf-ink);font-size:13px;font-weight:700;padding:10px 16px;cursor:pointer}
.tf-app .tf-sec:hover:not(:disabled){border-color:#ffffff3a}
.tf-app .tf-sec:disabled{opacity:.45;cursor:default}
.tf-app .tf-help{text-align:left;display:flex;flex-direction:column;gap:10px;font-size:12.5px;line-height:1.7;color:#c7d2e2}
.tf-app .tf-help h4{margin:0;font-size:10.5px;letter-spacing:.12em;text-transform:uppercase;color:var(--tf-acc)}
.tf-app .tf-help ul{margin:0;padding-left:18px}
.tf-app .tf-cheatrow{display:flex;align-items:center;justify-content:space-between;gap:12px;text-align:left;border:1px solid var(--tf-line);border-radius:12px;padding:10px 12px}
.tf-app .tf-cheatrow .t{font-size:13px;font-weight:700}
.tf-app .tf-cheatrow .d{font-size:11px;color:var(--tf-mut);line-height:1.5}
.tf-app .tf-cheatrow input{width:18px;height:18px;accent-color:var(--tf-acc);flex:none;cursor:pointer}
.tf-app .tf-note{font-size:11px;color:var(--tf-warn);margin:0}
.tf-app .tf-score-line{font-size:14px;font-weight:800}
.tf-app :is(button,input):focus-visible{outline:2px solid var(--tf-acc);outline-offset:2px}
@media (pointer:coarse),(max-width:640px){
.tf-app .tf-btns{display:none}
.tf-app .tf-touch{display:flex}
.tf-app .tf-kbd{display:none}
.tf-app .tf-panel{padding:14px;min-height:440px}
}
@media (prefers-reduced-motion:reduce){.tf-app *{transition:none!important}}
</style>
<div class="game-intro">
  <div><h2>True or False</h2><p>Fakta atau mitos? Jawab bergiliran melawan bot atau teman — cepat, tepat, dan tahu alasannya.</p></div>
  <span class="game-status"><i class="game-status-dot"></i><span data-status>Siap</span></span>
</div>
<section class="game-panel tf-panel" data-board>
  <div class="tf-tools">
    <span class="tf-chip">Level <b data-hud="lv">1</b></span>
    <span class="tf-chip">Soal <b data-hud="q">–</b>/${TOTAL}</span>
    <span class="tf-chip" data-best>Rekor: —</span>
    <span class="tf-grow"></span>
    <button class="tf-ghost" type="button" data-act="help" title="Cara bermain (H)">? Bantuan</button>
    <button class="tf-ghost" type="button" data-act="cheat" data-cheatbtn title="Cheat (C) — offline">Cheat</button>
    <button class="tf-ghost" type="button" data-act="restart" title="Ulangi level (R)">&#8635; Ulang</button>
  </div>
  <div class="tf-players">
    <div class="tf-pc" data-pc="0"><span class="tf-plabel" data-plabel>Pemain 1</span><span class="tf-pname" data-pname>—</span><span class="tf-pstats"><span data-phearts></span><span data-pscore>0 benar</span></span></div>
    <div class="tf-pc" data-pc="1"><span class="tf-plabel" data-plabel>Pemain 2</span><span class="tf-pname" data-pname>—</span><span class="tf-pstats"><span data-phearts></span><span data-pscore>0 benar</span></span></div>
  </div>
  <div class="tf-notice" data-notice></div>
  <div class="tf-timer"><div class="tf-fill" data-timer></div></div>
  <div class="tf-meta"><span class="tf-chip" data-cat>Trivia</span><span class="tf-dots" data-diff></span><span class="tf-secs" data-secs>—</span></div>
  <div class="tf-st" data-st aria-live="polite">Siap?</div>
  <div class="tf-btns">
    <button class="tf-btn true" type="button" data-act="ans" data-v="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6L9 17l-5-5"/></svg>BENAR <span class="tf-kbd">T</span></button>
    <button class="tf-btn false" type="button" data-act="ans" data-v="false"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 6L6 18M6 6l12 12"/></svg>SALAH <span class="tf-kbd">F</span></button>
  </div>
  <div class="tf-fb" data-fb aria-live="polite"></div>
  <div class="tf-why" data-why hidden><b>&#128161; Kenapa begitu?</b><span data-whytext></span></div>
  <button class="tf-next" type="button" data-act="next" data-nextbtn hidden>Lanjut &#9656; <span class="tf-kbd">Spasi</span></button>

  <div class="tf-ov" data-ov="ready">
    <div class="tf-card">
      <h3>True or False</h3>
      <p class="sub" data-readysub>${READY_SUB}</p>
      <button class="tf-main" type="button" data-act="start">Mulai pertandingan</button>
      <button class="tf-sec" type="button" data-act="help">Cara bermain</button>
    </div>
  </div>
  <div class="tf-ov" data-ov="over" hidden>
    <div class="tf-card">
      <h3 data-ovt>Selesai</h3>
      <p class="sub" data-ovr></p>
      <div class="tf-score-line" data-ovs></div>
      <p class="tf-note" data-ovn hidden>&#9873; Cheat dipakai — level ini tidak dicatat sebagai rekor.</p>
      <button class="tf-main" type="button" data-act="start" data-startlabel>Main lagi</button>
      <button class="tf-sec" type="button" data-act="restart">Ulangi level ini</button>
    </div>
  </div>
  <div class="tf-ov" data-ov="help" hidden>
    <div class="tf-card">
      <h3>Cara bermain</h3>
      <div class="tf-help">
        <div><h4>Tujuan</h4><ul>
          <li>Jawab <b>BENAR</b> (fakta) atau <b>SALAH</b> (mitos) untuk tiap pernyataan.</li>
          <li>${TOTAL} soal per pertandingan — masing-masing pemain mendapat 5 soal, bergiliran.</li>
        </ul></div>
        <div><h4>Aturan</h4><ul>
          <li>Waktu per soal: 10 detik di level awal, turun sampai 6 detik di level tinggi.</li>
          <li>Jawaban benar +1 poin. Salah / kehabisan waktu = kehilangan 1 dari ${LIVES} nyawa.</li>
          <li>Kehabisan nyawa = langsung kalah. Jika semua soal selesai, poin tertinggi menang (bisa seri).</li>
          <li>Setiap jawaban dilengkapi penjelasan singkat — menang sambil belajar.</li>
        </ul></div>
        <div><h4>Level acak yang adil</h4><ul>
          <li>Tiap level disusun acak dari ${BANK.length} soal: dijamin 5 fakta + 5 mitos, tanpa topik kembar.</li>
          <li>Komposisi soal kedua pemain seimbang — selalu bisa dimenangkan dengan jawaban sempurna.</li>
          <li>Menang membuka level berikutnya: soal lebih sulit, waktu lebih singkat, bot lebih pintar.</li>
        </ul></div>
        <div><h4>Giliran &amp; posisi acak</h4><ul>
          <li>Siapa yang jalan duluan diundi setiap pertandingan — termasuk saat melawan bot.</li>
          <li>Di multiplayer, posisi Pemain 1 / Pemain 2 juga diacak untuk kedua sisi.</li>
        </ul></div>
        <div><h4>Kontrol</h4><ul>
          <li>Desktop: klik tombol, atau <span class="tf-kbd">T</span>/<span class="tf-kbd">&#8592;</span> = benar, <span class="tf-kbd">F</span>/<span class="tf-kbd">&#8594;</span> = salah, <span class="tf-kbd">Spasi</span> = mulai/lanjut, <span class="tf-kbd">R</span> = ulang, <span class="tf-kbd">H</span> = bantuan, <span class="tf-kbd">C</span> = cheat, <span class="tf-kbd">Esc</span> = tutup panel.</li>
          <li>Mobile: gunakan tombol virtual besar di bagian bawah layar.</li>
        </ul></div>
        <div><h4>Cheat</h4><ul>
          <li>Hanya tersedia di mode offline (lawan bot). Saat cheat dipakai, level tidak dicatat sebagai rekor.</li>
          <li>Waktu tetap berjalan saat panel bantuan dibuka — buka sebelum mulai, ya.</li>
        </ul></div>
      </div>
      <button class="tf-main" type="button" data-act="close">Paham, tutup</button>
    </div>
  </div>
  <div class="tf-ov" data-ov="cheat" hidden>
    <div class="tf-card">
      <h3>Panel cheat</h3>
      <p class="sub">Hanya mode offline. Rekor level tidak dicatat selama cheat dipakai.</p>
      <label class="tf-cheatrow"><span><span class="t">Bocorkan jawaban</span><br><span class="d">Tombol berjawaban benar diberi garis putus-putus.</span></span><input type="checkbox" data-cheat="reveal"></label>
      <label class="tf-cheatrow"><span><span class="t">Bekukan waktu</span><br><span class="d">Timer berhenti menghitung sampai dimatikan.</span></span><input type="checkbox" data-cheat="freeze"></label>
      <label class="tf-cheatrow"><span><span class="t">Nyawa tak terbatas</span><br><span class="d">Jawaban salahmu tidak mengurangi nyawa.</span></span><input type="checkbox" data-cheat="lives"></label>
      <label class="tf-cheatrow"><span><span class="t">Auto-jawab benar</span><br><span class="d">Giliranmu dijawab otomatis dengan benar.</span></span><input type="checkbox" data-cheat="auto"></label>
      <button class="tf-sec" type="button" data-act="skip" data-skip>Lewati soal ini (tanpa poin)</button>
      <button class="tf-main" type="button" data-act="close">Tutup</button>
    </div>
  </div>
</section>
<div class="tf-touch">
  <button class="tf-tbtn false" type="button" data-act="ans" data-v="false"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 6L6 18M6 6l12 12"/></svg>SALAH</button>
  <button class="tf-tbtn true" type="button" data-act="ans" data-v="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6L9 17l-5-5"/></svg>BENAR</button>
</div>
<div class="game-actions"><button class="game-action-button" type="button" data-exit>Exit game</button></div>
</div>`;

    /* ---------------- refs ---------------- */
    const $ = (s) => root.querySelector(s);
    const $$ = (s) => Array.from(root.querySelectorAll(s));
    const statusEl = $("[data-status]"), stEl = $("[data-st]"), fbEl = $("[data-fb]"),
        whyEl = $("[data-why]"), whyText = $("[data-whytext]"), nextBtn = $("[data-nextbtn]"),
        noticeEl = $("[data-notice]"), timerFill = $("[data-timer]"), secsEl = $("[data-secs]"),
        catEl = $("[data-cat]"), diffEl = $("[data-diff]"),
        hudLv = $('[data-hud="lv"]'), hudQ = $('[data-hud="q"]'), bestEl = $("[data-best]"),
        ovReady = $('[data-ov="ready"]'), readySub = $("[data-readysub]"),
        ovOver = $('[data-ov="over"]'), ovTitle = $("[data-ovt]"), ovReason = $("[data-ovr]"),
        ovScore = $("[data-ovs]"), ovNote = $("[data-ovn]"), startLabel = $("[data-startlabel]"),
        ovHelp = $('[data-ov="help"]'), ovCheat = $('[data-ov="cheat"]'),
        cheatBtn = $("[data-cheatbtn]"), skipBtn = $("[data-skip]");
    const startBtns = $$('[data-act="start"]');
    const ansBtns = $$('[data-act="ans"]').map((b) => ({ b, v: b.dataset.v === "true" }));
    const pcEls = [$('[data-pc="0"]'), $('[data-pc="1"]')];
    const cheatInputs = $$("[data-cheat]");

    /* ---------------- helpers ---------------- */
    function later(ms, fn) {
        const id = setTimeout(() => { timers.delete(id); if (!dead) fn(); }, ms);
        timers.add(id);
    }
    function turnActor() { return state ? state.seatMap[state.turn] : 0; }
    function myTurn() { return !!state && turnActor() === myActor; }
    function nameOf(actor) {
        return actor === myActor ? (playerName || "Kamu") : (online ? "Lawan" : "Bot");
    }
    function heartHtml(l) {
        let s = "";
        for (let i = 0; i < LIVES; i++) s += '<span class="hp' + (i < l ? "" : " off") + '">&#9829;</span>';
        return s;
    }
    function readyState() {
        return {
            phase: "ready", level: 1, m: 0, seatMap: [0, 1], turn: 0, first: 0,
            deck: [], timeLimit: 10, q: 0, correct: [0, 0], lives: [LIVES, LIVES],
            picked: null, lastGood: null, po: null, winner: null, reason: "", deadline: 0,
        };
    }

    /* ---------------- state machine (otoritas: lokal / host) ---------------- */
    function startMatch(level) {
        const turn = Math.floor(Math.random() * 2); // giliran pertama acak (vs bot & online)
        const seatMap = shuffle([0, 1]);            // posisi Pemain 1/2 acak (host & tamu)
        const g = generateDeck(level, turn);
        state = {
            phase: "ask", level, m: (state ? state.m : 0) + 1,
            seatMap, turn, first: turn,
            deck: g.deck, timeLimit: g.timeLimit, q: 0,
            correct: [0, 0], lives: [LIVES, LIVES],
            picked: null, lastGood: null, po: null,
            winner: null, reason: "", deadline: Date.now() + g.timeLimit * 1000,
        };
        cheatUsed = false; frozenLeft = null; engineKey = ""; ui.help = false;
    }
    function resolve(v) {
        const it = state.deck[state.q], actor = turnActor();
        const good = v === it.a;
        state.picked = v; state.lastGood = good;
        if (good) state.correct[actor]++;
        else if (!(cheats.lives && !online && actor === myActor)) state.lives[actor] = Math.max(0, state.lives[actor] - 1);
        state.phase = "reveal"; state.deadline = 0;
        if (state.lives[actor] <= 0) state.po = actor; // kalah karena nyawa, diputuskan setelah reveal
    }
    function advance() {
        if (state.po !== null) { finish(1 - state.po, "lives"); return; }
        if (state.q >= TOTAL - 1) {
            const a = state.correct[0], b = state.correct[1];
            finish(a === b ? "draw" : (a > b ? 0 : 1), "score");
            return;
        }
        state.q++; state.turn = 1 - state.turn;
        state.picked = null; state.lastGood = null;
        state.phase = "ask"; state.deadline = Date.now() + state.timeLimit * 1000;
    }
    function finish(winner, reason) {
        state.winner = winner; state.reason = reason; state.phase = "over"; state.deadline = 0;
        if (!online && winner === 0 && !cheatUsed && state.level > best) {
            best = state.level;
            try { localStorage.setItem(META.bestKey, String(best)); } catch (_) { }
        }
    }

    function applyAction(action, actor) {
        if (dead || !state || !action || (actor !== 0 && actor !== 1)) return;
        const t = action.type;
        if (t === "start") {
            if (state.phase !== "ready" && state.phase !== "over") return;
            const won = state.phase === "over" && state.winner !== null && state.winner !== "draw";
            startMatch(won ? Math.min(state.level + 1, MAX_LEVEL) : state.level);
        } else if (t === "restart") {
            startMatch(state.level);
        } else if (t === "answer") {
            if (state.phase !== "ask" || actor !== turnActor() || typeof action.value !== "boolean") return;
            resolve(action.value);
        } else if (t === "timeout") {
            if (state.phase !== "ask" || actor !== turnActor()) return;
            resolve(null);
        } else if (t === "next") {
            if (state.phase !== "reveal" || actor !== turnActor()) return;
            advance();
        } else if (t === "skip") {
            if (online || state.phase !== "ask" || actor !== turnActor()) return;
            cheatUsed = true;
            advance();
        } else return;
        publish();
    }

    function submitAction(action) {
        if (online && !room.isHost) { room.sendAction(action).catch(console.warn); return; }
        applyAction(action, myActor);
    }

    function publish() {
        render();
        syncEngine();
        if (online && room.isHost) room.publishState(state).catch(console.warn);
    }

    /* ---------------- mesin lokal: bot, auto-cheat, transisi reveal ---------------- */
    function syncEngine() {
        if (dead || !state) return;
        const key = state.m + ":" + state.phase + ":" + state.q;
        if (key === engineKey) return;
        engineKey = key;
        for (const id of timers) clearTimeout(id);
        timers.clear();
        if (state.phase === "ask") {
            frozenLeft = (!online && cheats.freeze) ? state.timeLimit * 1000 : null;
            if (!online && turnActor() === 1) { // giliran bot
                const it = state.deck[state.q];
                const delay = Math.min(1300 + Math.random() * 2500, state.timeLimit * 1000 - 1500);
                later(delay, () => {
                    if (state && state.phase === "ask" && turnActor() === 1) {
                        const ok = Math.random() < botAccuracy(it.d, state.level);
                        applyAction({ type: "answer", value: ok ? it.a : !it.a }, 1);
                    }
                });
            }
            if (!online && cheats.auto && turnActor() === myActor) { // cheat auto-jawab
                later(900, () => {
                    if (state && state.phase === "ask" && turnActor() === myActor)
                        applyAction({ type: "answer", value: state.deck[state.q].a }, myActor);
                });
            }
        } else if (state.phase === "reveal" && authority) {
            const wait = (!online && turnActor() === 1) ? 2600 : 6000;
            later(wait, () => { if (state && state.phase === "reveal") applyAction({ type: "next" }, turnActor()); });
        }
    }

    function paintTimer(ms, idle) {
        const total = (state ? state.timeLimit : 10) * 1000;
        const pct = Math.max(0, Math.min(100, (ms / total) * 100));
        timerFill.style.width = pct + "%";
        timerFill.classList.toggle("warn", !idle && ms <= total * 0.6 && ms > total * 0.3);
        timerFill.classList.toggle("danger", !idle && ms <= total * 0.3);
        timerFill.classList.toggle("idle", !!idle);
        secsEl.textContent = idle ? "—" : Math.ceil(ms / 1000) + "s";
    }

    function heartbeat() {
        if (dead || !state) return;
        if (state.phase === "ask") {
            const now = Date.now();
            if (!online && cheats.freeze) { // cheat: bekukan waktu (hanya offline)
                if (frozenLeft == null) frozenLeft = Math.max(0, state.deadline - now);
                state.deadline = now + frozenLeft;
            }
            const left = Math.max(0, state.deadline - now);
            paintTimer(left, false);
            if (authority && left <= 0) applyAction({ type: "timeout" }, turnActor());
        } else {
            paintTimer(state.phase === "reveal" ? 0 : state.timeLimit * 1000, true);
        }
        syncEngine();
    }

    /* ---------------- render ---------------- */
    function render() {
        if (dead) return;
        ovHelp.hidden = !ui.help;
        ovCheat.hidden = !ui.cheat || online;
        cheatBtn.disabled = online;
        cheatBtn.title = online ? "Cheat hanya tersedia di mode offline" : "Cheat (C) — offline";
        for (const inp of cheatInputs) { inp.checked = cheats[inp.dataset.cheat]; inp.disabled = online; }
        bestEl.hidden = online;
        bestEl.textContent = "Rekor: " + (best > 0 ? "Level " + best : "—");
        if (!state) { // tamu online menunggu state pertama dari host
            statusEl.textContent = "Menunggu host…";
            ovReady.hidden = false;
            readySub.textContent = "Menunggu host menyiapkan permainan. Pertandingan akan muncul otomatis.";
            for (const b of startBtns) b.disabled = true;
            for (const { b } of ansBtns) b.disabled = true;
            ovOver.hidden = true;
            return;
        }
        for (const b of startBtns) b.disabled = false;
        const ph = state.phase, it = state.deck[state.q] || null;
        const tActor = turnActor(), mine = tActor === myActor;
        hudLv.textContent = String(state.level);
        hudQ.textContent = ph === "ready" ? "–" : String(Math.min(state.q + 1, TOTAL));
        for (let s = 0; s < 2; s++) {
            const a = state.seatMap[s], el = pcEls[s];
            el.classList.toggle("on", (ph === "ask" || ph === "reveal") && state.turn === s);
            el.querySelector("[data-plabel]").textContent =
                "Pemain " + (s + 1) + (a === myActor ? " · Kamu" : "") +
                ((ph === "ask" || ph === "reveal") && state.turn === s ? " · giliran" : "");
            el.querySelector("[data-pname]").textContent = nameOf(a);
            el.querySelector("[data-pscore]").textContent = state.correct[a] + " benar";
            el.querySelector("[data-phearts]").innerHTML = heartHtml(state.lives[a]);
        }
        noticeEl.textContent = ph === "ready"
            ? "Posisi pemain & giliran pertama diundi setiap pertandingan."
            : "Kamu: Pemain " + (state.seatMap.indexOf(myActor) + 1) +
            " · Jalan dulu: " + nameOf(state.seatMap[state.first]);
        catEl.textContent = it ? it.c : "Trivia";
        diffEl.textContent = it ? "●".repeat(it.d) + "○".repeat(3 - it.d) + " " + DIFF_NAME[it.d] : "";
        stEl.textContent =
            ph === "ready" ? "Siap memisahkan fakta dari mitos?" :
                ph === "over" ? "Pertandingan selesai." :
                    "\u201C" + (it ? it.q : "") + "\u201D";
        const canAns = ph === "ask" && mine && !ui.help && !ui.cheat;
        for (const { b, v } of ansBtns) {
            b.disabled = !canAns;
            b.classList.remove("good", "bad", "hint");
            if (ph === "reveal" && it) {
                if (it.a === v) b.classList.add("good");
                else if (state.picked === v) b.classList.add("bad");
            } else if (canAns && !online && cheats.reveal && it && it.a === v) {
                b.classList.add("hint");
            }
        }
        fbEl.className = "tf-fb";
        if (ph === "ask") {
            fbEl.textContent = mine ? "Giliranmu — jawab sebelum waktu habis!" : nameOf(tActor) + " sedang menjawab…";
        } else if (ph === "reveal" && it) {
            const truth = it.a ? "FAKTA (BENAR)" : "MITOS (SALAH)";
            if (state.picked === null) { fbEl.textContent = "Waktu habis! Jawabannya: " + truth + "."; fbEl.classList.add("bad"); }
            else if (state.lastGood) { fbEl.textContent = "Benar! +1 poin untuk " + nameOf(tActor) + "."; fbEl.classList.add("good"); }
            else { fbEl.textContent = "Salah. Jawabannya: " + truth + "."; fbEl.classList.add("bad"); }
            whyText.textContent = it.w;
        } else {
            fbEl.textContent = "";
        }
        whyEl.hidden = ph !== "reveal";
        nextBtn.hidden = !(ph === "reveal" && mine);
        skipBtn.disabled = !(ph === "ask" && mine && !online);
        ovReady.hidden = ph !== "ready";
        if (ph === "ready") readySub.textContent = READY_SUB;
        ovOver.hidden = ph !== "over";
        if (ph === "over") {
            const win = state.winner;
            ovTitle.textContent =
                win === "draw" ? "Seri!" :
                    win === myActor ? (online ? "Kamu menang! 🎉" : "Level " + state.level + " tuntas! 🎉") :
                        "Kamu kalah";
            ovReason.textContent =
                state.reason === "lives" ? nameOf(state.po) + " kehabisan nyawa." :
                    win === "draw" ? "Poin kedua pemain imbang — tidak ada yang kalah." :
                        "Poin tertinggi menang setelah " + TOTAL + " soal.";
            ovScore.textContent = nameOf(0) + " " + state.correct[0] + " — " + state.correct[1] + " " + nameOf(1);
            ovNote.hidden = !(!online && cheatUsed);
            startLabel.textContent = (win !== null && win !== "draw")
                ? (state.level < MAX_LEVEL ? "Lanjut ke Level " + (state.level + 1) : "Main lagi (level maks)")
                : "Main lagi";
        }
        statusEl.textContent =
            ph === "ready" ? "Siap bermain" :
                ph === "ask" ? (mine ? "Giliranmu — jawab!" : (online ? "Giliran lawan…" : "Bot berpikir…")) :
                    ph === "reveal" ? (state.lastGood ? "Benar!" : "Meleset!") :
                        (state.winner === "draw" ? "Seri" : state.winner === myActor ? "Kamu menang 🎉" : "Kamu kalah");
        if (!online && cheats.freeze && ph === "ask") statusEl.textContent += " · ⏸ waktu beku";
    }

    /* ---------------- events: mouse / touch ---------------- */
    function handleClick(event) {
        const t = event.target;
        if (t instanceof Element && t.classList.contains("tf-ov")) { // klik backdrop panel
            ui.help = false; ui.cheat = false; render(); return;
        }
        const btn = t instanceof Element ? t.closest("[data-act],[data-exit]") : null;
        if (!btn) return;
        if (btn.hasAttribute("data-exit")) { onExit(); return; }
        const a = btn.dataset.act;
        if (a === "start") submitAction({ type: "start" });
        else if (a === "restart") submitAction({ type: "restart" });
        else if (a === "ans") submitAction({ type: "answer", value: btn.dataset.v === "true" });
        else if (a === "next") submitAction({ type: "next" });
        else if (a === "skip") submitAction({ type: "skip" });
        else if (a === "help") { ui.help = !ui.help; ui.cheat = false; render(); }
        else if (a === "cheat") { if (!online) { ui.cheat = !ui.cheat; ui.help = false; render(); } }
        else if (a === "close") { ui.help = false; ui.cheat = false; render(); }
    }
    function handleChange(event) {
        const el = event.target;
        if (!(el instanceof HTMLInputElement) || !el.dataset.cheat || online) return;
        cheats[el.dataset.cheat] = el.checked;
        if (el.checked) cheatUsed = true;
        if (el.dataset.cheat === "freeze") frozenLeft = null;
        if (el.dataset.cheat === "auto") engineKey = "";
        render();
        syncEngine();
    }
    /* ---------------- events: keyboard (desktop) ---------------- */
    function onKey(e) {
        if (dead || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
        if (e.key === "Escape") {
            if (ui.help || ui.cheat) { ui.help = false; ui.cheat = false; render(); }
            return;
        }
        const tag = (e.target && e.target.tagName) || "";
        if (/INPUT|TEXTAREA|SELECT/.test(tag)) return;
        const k = e.key.toLowerCase();
        if (k === "h" || k === "?") { ui.help = !ui.help; ui.cheat = false; render(); return; }
        if (k === "c" && !online) { ui.cheat = !ui.cheat; ui.help = false; render(); return; }
        if (ui.help || ui.cheat || !state) return;
        if (k === "t" || e.key === "ArrowLeft") {
            if (state.phase === "ask" && myTurn()) { e.preventDefault(); submitAction({ type: "answer", value: true }); }
            return;
        }
        if (k === "f" || e.key === "ArrowRight") {
            if (state.phase === "ask" && myTurn()) { e.preventDefault(); submitAction({ type: "answer", value: false }); }
            return;
        }
        if (k === "r") { submitAction({ type: "restart" }); return; }
        if (e.key === " " || e.key === "Enter") {
            if (e.target instanceof Element && e.target.closest("button")) return; // biarkan aktivasi native
            e.preventDefault();
            if (state.phase === "ready" || state.phase === "over") submitAction({ type: "start" });
            else if (state.phase === "reveal" && myTurn()) submitAction({ type: "next" });
        }
    }

    root.addEventListener("click", handleClick);
    root.addEventListener("change", handleChange);
    document.addEventListener("keydown", onKey);

    /* ---------------- wiring mode: online (room) / offline (bot) ---------------- */
    const sub = (fn) => { if (typeof fn === "function") unsubs.push(fn); };
    if (online) {
        sub(room.onRoom((nextRoom) => { if (dead) return; roomData = nextRoom; render(); }));
        if (room.isHost) {
            state = readyState();
            publish();
            sub(room.onAction((action) => { if (!dead) applyAction(action, 1); }));
        } else {
            sub(room.onState((nextState) => {
                if (dead || !nextState) return;
                state = nextState; render(); syncEngine();
            }));
        }
    } else {
        state = readyState();
        render();
    }
    const beat = setInterval(heartbeat, 150);

    return {
        destroy() {
            dead = true;
            clearInterval(beat);
            for (const id of timers) clearTimeout(id);
            timers.clear();
            root.removeEventListener("click", handleClick);
            root.removeEventListener("change", handleChange);
            document.removeEventListener("keydown", onKey);
            for (const fn of unsubs) { try { fn(); } catch (_) { } }
        },
    };
}