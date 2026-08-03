/* =========================================================================
   SAKUKU — Personal Expense Tracker
   File: script.js
   Logika aplikasi: penyimpanan (localStorage), render ringkasan, grafik
   (Chart.js), riwayat transaksi, serta event handler.
   Di-load dari index.html SETELAH Chart.js dan elemen DOM tersedia.
   ========================================================================= */

/* =====================================================================
   KONFIGURASI & STATE APLIKASI
   ===================================================================== */
const STORAGE_KEY = 'sakuku_transactions_v1'; // kunci localStorage utk data transaksi
const THEME_KEY   = 'sakuku_theme_v1';        // kunci localStorage utk tema
const MONTH_KEY   = 'sakuku_month_v1';        // kunci localStorage utk bulan terpilih

// Daftar kategori berdasarkan tipe transaksi
const CAT_EXPENSE = [
  'Makanan & Minuman', 'Transportasi', 'Belanja',
  'Tagihan/Utilitas', 'Hiburan', 'Tabungan/Investasi', 'Lain-lain'
];
const CAT_INCOME = ['Awal Bulan', 'Tengah Bulan', 'Event/Volunteer', 'Kerja', 'Lain-lain'];

// Warna tiap kategori (dipakai di badge & grafik donut)
const CAT_COLORS = {
  'Makanan & Minuman': '#10b981',
  'Transportasi':      '#0ea5e9',
  'Belanja':           '#8b5cf6',
  'Tagihan/Utilitas':  '#f59e0b',
  'Hiburan':           '#ec4899',
  'Tabungan/Investasi':'#14b8a6',
  'Awal Bulan':        '#10b981',
  'Tengah Bulan':      '#0ea5e9',
  'Event/Volunteer':   '#8b5cf6',
  'Kerja':             '#14b8a6',
  'Lain-lain':         '#64748b'  
};

// Nama bulan Bahasa Indonesia (untuk dropdown & judul)
const MONTHS_ID = ['Januari','Februari','Maret','April','Mei','Juni',
                   'Juli','Agustus','September','Oktober','November','Desember'];

// State aplikasi (data transaksi & filter aktif)
let transactions = [];
let selectedMonth = '';       // format 'YYYY-MM'
let txType = 'expense';       // tipe transaksi pada form
let filterCategory = 'all';   // filter kategori riwayat
let filterKeyword = '';       // kata kunci pencarian riwayat

let donutChart = null;        // objek grafik donut
let barChart = null;          // objek grafik bar

/* =====================================================================
   UTILITAS
   ===================================================================== */
// Ambil tanggal hari ini dalam format ISO (YYYY-MM-DD)
function todayISO() {
  const d = new Date();
  return d.getFullYear() + '-' +
         String(d.getMonth() + 1).padStart(2, '0') + '-' +
         String(d.getDate()).padStart(2, '0');
}

// Format angka Rupiah: 1250000 -> Rp 1.250.000
function formatRupiah(n) {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency', currency: 'IDR', maximumFractionDigits: 0
  }).format(Math.round(n));
}

// Format singkat untuk sumbu Y chart: 1500000 -> "1,5 jt"
function rupiahShort(n) {
  if (n >= 1e6) return (n / 1e6).toLocaleString('id-ID', { maximumFractionDigits: 1 }) + ' jt';
  if (n >= 1e3) return (n / 1e3).toLocaleString('id-ID', { maximumFractionDigits: 0 }) + ' rb';
  return String(Math.round(n));
}

// Ambil 'YYYY-MM' dari tanggal ISO
function ymOf(iso) { return iso.slice(0, 7); }

// Format label bulan Indonesia: '2026-08' -> 'Agustus 2026'
function monthLabel(ym) {
  const [y, m] = ym.split('-');
  return MONTHS_ID[parseInt(m, 10) - 1] + ' ' + y;
}

// Escape HTML agar input pengguna aman saat dirender
function esc(s) {
  return String(s).replace(/[&<>"']/g, m => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[m]));
}

// Warna teks menyesuaikan tema (untuk Chart.js)
function chartTextColor() {
  return document.documentElement.classList.contains('dark') ? '#94a3b8' : '#64748b';
}
function chartTextStrong() {
  return document.documentElement.classList.contains('dark') ? '#f1f5f9' : '#0f172a';
}

/* =====================================================================
   DATA DUMMY (dipakai saat localStorage masih kosong)
   ===================================================================== */
function seedData() {
  // dayOffset = berapa hari lalu transaksi terjadi (0 = hari ini)
  const iso = dayOffset => {
    const d = new Date();
    d.setDate(d.getDate() - dayOffset);
    return d.getFullYear() + '-' +
           String(d.getMonth() + 1).padStart(2, '0') + '-' +
           String(d.getDate()).padStart(2, '0');
  };

  const rows = [
    // --- Pengeluaran ---
    ['expense', 0,  25000,  'Makanan & Minuman', 'Nasi padang + es teh'],
    ['expense', 1,  185000, 'Transportasi',      'Isi bensin motor'],
    ['expense', 2,  750000, 'Tagihan/Utilitas',  'Listrik bulanan'],
    ['expense', 3,  150000, 'Belanja',           'Kebutuhan dapur'],
    ['expense', 5,  48000,  'Makanan & Minuman', 'Kopi & snack meeting'],
    ['expense', 7,  120000, 'Hiburan',           'Nonton bioskop'],
    ['expense', 9,  350000, 'Belanja',           'Baju & aksesoris'],
    ['expense', 12, 60000,  'Transportasi',      'Gojek & parkir'],
    ['expense', 16, 500000, 'Tabungan/Investasi','Pembelian reksadana'],
    ['expense', 20, 90000,  'Makanan & Minuman', 'Makan malam keluarga'],
    ['expense', 24, 300000, 'Tagihan/Utilitas',  'Internet & pulsa'],
    ['expense', 28, 70000,  'Lain-lain',         'Donasi'],
    ['expense', 32, 130000, 'Hiburan',           'Langganan streaming'],
    ['expense', 35, 200000, 'Belanja',           'Perlengkapan rumah'],
    // --- Pemasukan ---
    ['income', 1,  4500000, 'Gaji',       'Gaji bulanan'],
    ['income', 4,  250000,  'Bonus/THR',  'Bonus project freelance'],
    ['income', 15, 1500000, 'Investasi',  'Dividen & hasil trading'],
    ['income', 26, 300000,  'Bisnis/Usaha','Penjualan online']
  ];

  return rows.map((r, i) => ({
    id: i + 1,
    type: r[0],
    date: iso(r[1]),
    amount: r[2],
    category: r[3],
    note: r[4]
  }));
}

/* =====================================================================
   PENYIMPANAN (localStorage)
   ===================================================================== */
function loadData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    transactions = raw ? JSON.parse(raw) : [];
  } catch (e) {
    transactions = [];
  }
  // Jika kosong, isi data dummy lalu simpan
  if (!transactions.length) {
    transactions = seedData();
    saveData();
  }
}

function saveData() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(transactions));
}

/* =====================================================================
   SELECTOR BULAN
   ===================================================================== */
// Ambil daftar bulan yang tersedia dari data (+ bulan berjalan)
function availableMonths() {
  const set = new Set();
  set.add(ymOf(todayISO())); // selalu sertakan bulan berjalan
  transactions.forEach(t => set.add(ymOf(t.date)));
  return [...set].sort().reverse(); // urut menurun (terbaru dulu)
}

// Isi opsi dropdown bulan/tahun
function renderMonthSelector() {
  const sel = document.getElementById('month-selector');
  const months = availableMonths();

  if (!selectedMonth || !months.includes(selectedMonth)) {
    selectedMonth = months[0] || ymOf(todayISO());
  }

  sel.innerHTML = months.map(m =>
    '<option value="' + m + '"' + (m === selectedMonth ? ' selected' : '') + '>' +
    monthLabel(m) + '</option>'
  ).join('');
}

/* =====================================================================
   RENDER: RINGKASAN FINANSIAL
   ===================================================================== */
function renderSummary() {
  // Filter transaksi milik bulan terpilih
  const list = transactions.filter(t => ymOf(t.date) === selectedMonth);
  const income  = list.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
  const expense = list.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
  const balance = income - expense;

  document.getElementById('card-income').textContent  = formatRupiah(income);
  document.getElementById('card-expense').textContent = formatRupiah(expense);

  const balEl = document.getElementById('card-balance');
  balEl.textContent = formatRupiah(balance);
  // Ubah warna saldo: hijau jika surplus, merah jika defisit
  balEl.className = 'mt-3 text-2xl font-extrabold ' +
    (balance >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400');

  // Subtitle: nama bulan + jumlah transaksi
  const sub = document.getElementById('summary-subtitle');
  sub.textContent = monthLabel(selectedMonth) + ' · ' + list.length + ' transaksi';
}

/* =====================================================================
   RENDER: GRAFIK (CHART.JS)
   ===================================================================== */
// Plugin Chart.js: tulisan "Total Pengeluaran" di tengah donut
const centerTextPlugin = {
  id: 'centerText',
  afterDraw(chart) {
    if (chart.config.type !== 'doughnut') return;
    const meta = chart.getDatasetMeta(0);
    if (!meta.data.length) return;
    const { ctx } = chart;
    const x = meta.data[0].x;
    const y = meta.data[0].y;
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '700 18px Inter, sans-serif';
    ctx.fillStyle = chartTextStrong();
    ctx.fillText(window._donutCenter || 'Rp 0', x, y - 9);
    ctx.font = '500 11px Inter, sans-serif';
    ctx.fillStyle = chartTextColor();
    ctx.fillText('Total Pengeluaran', x, y + 14);
    ctx.restore();
  }
};
Chart.register(centerTextPlugin);

// Data pengeluaran per kategori (untuk donut)
function expenseByCategory(list) {
  const map = {};
  list.forEach(t => {
    if (t.type !== 'expense') return;
    map[t.category] = (map[t.category] || 0) + t.amount;
  });
  return map;
}

// Total pengeluaran per minggu (untuk bar chart)
function expenseByWeek(list, ym) {
  const [y, m] = ym.split('-').map(Number);
  const daysInMonth = new Date(y, m, 0).getDate();
  const weeks = Math.ceil(daysInMonth / 7);
  const totals = new Array(weeks).fill(0);

  list.forEach(t => {
    if (t.type !== 'expense') return;
    const day = parseInt(t.date.slice(8, 10), 10);
    const week = Math.ceil(day / 7) - 1;
    if (week >= 0 && week < weeks) totals[week] += t.amount;
  });

  // Label "Minggu 1..N"
  const labels = totals.map((_, i) => 'Minggu ' + (i + 1));
  return { labels, totals };
}

// Buat / perbarui kedua grafik
function renderCharts() {
  const list = transactions.filter(t => ymOf(t.date) === selectedMonth);

  // ---- Donut: pengeluaran per kategori ----
  const byCat = expenseByCategory(list);
  const donutLabels = Object.keys(byCat);
  const donutData = donutLabels.map(k => byCat[k]);
  const donutTotal = donutData.reduce((s, n) => s + n, 0);
  window._donutCenter = formatRupiah(donutTotal);

  // Tampilkan pesan kosong bila tak ada data
  document.getElementById('donut-empty').classList.toggle('hidden', donutData.length > 0);

  if (!donutChart) {
    donutChart = new Chart(document.getElementById('donut-chart'), {
      type: 'doughnut',
      data: { labels: [], datasets: [{ data: [], backgroundColor: [], borderWidth: 2, borderColor: 'transparent' }] },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '66%',
        plugins: {
          legend: { position: 'bottom', labels: { usePointStyle: true, boxWidth: 8, padding: 14, font: { family: 'Inter', size: 11 } } },
          tooltip: {
            callbacks: {
              label: ctx => {
                const pct = donutTotal ? Math.round((ctx.parsed / donutTotal) * 100) : 0;
                return ' ' + ctx.label + ': ' + formatRupiah(ctx.parsed) + ' (' + pct + '%)';
              }
            }
          }
        }
      }
    });
  }

  donutChart.data.labels = donutLabels;
  donutChart.data.datasets[0].data = donutData;
  donutChart.data.datasets[0].backgroundColor = donutLabels.map(k => CAT_COLORS[k] || '#64748b');
  donutChart.options.plugins.legend.labels.color = chartTextColor();
  donutChart.update();

  // ---- Bar: pengeluaran per minggu ----
  const weekly = expenseByWeek(list, selectedMonth);
  document.getElementById('bar-empty').classList.toggle('hidden', weekly.totals.some(v => v > 0));

  if (!barChart) {
    barChart = new Chart(document.getElementById('bar-chart'), {
      type: 'bar',
      data: { labels: [], datasets: [{ data: [], backgroundColor: '#f43f5e', borderRadius: 8, maxBarThickness: 42 }] },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: ctx => ' ' + formatRupiah(ctx.parsed.y) } }
        },
        scales: {
          y: {
            beginAtZero: true,
            grid: { color: 'rgba(148,163,184,0.12)' },
            ticks: { color: chartTextColor(), callback: v => rupiahShort(v) }
          },
          x: { grid: { display: false }, ticks: { color: chartTextColor() } }
        }
      }
    });
  }

  barChart.data.labels = weekly.labels;
  barChart.data.datasets[0].data = weekly.totals;
  barChart.options.scales.y.ticks.color = chartTextColor();
  barChart.options.scales.x.ticks.color = chartTextColor();
  barChart.update();
}

/* =====================================================================
   RENDER: RIWAYAT TRANSAKSI
   ===================================================================== */
function renderHistory() {
  const count = document.getElementById('history-count');

  // Ambil transaksi bulan terpilih, lalu terapkan filter
  let list = transactions
    .filter(t => ymOf(t.date) === selectedMonth)
    .filter(t => filterCategory === 'all' || t.category === filterCategory);

  if (filterKeyword) {
    const kw = filterKeyword.toLowerCase();
    list = list.filter(t =>
      t.category.toLowerCase().includes(kw) || t.note.toLowerCase().includes(kw)
    );
  }

  // Urutkan dari terbaru (tanggal lalu id)
  list.sort((a, b) => (a.date === b.date ? b.id - a.id : (a.date < b.date ? 1 : -1)));
  count.textContent = list.length;

  const tbody = document.getElementById('history-body');

  if (!list.length) {
    // State kosong (tidak ada data setelah filter)
    tbody.innerHTML =
      '<tr><td colspan="5" class="px-4 py-10 text-center text-sm text-slate-400">' +
      'Tidak ada transaksi yang cocok. Coba ubah filter, atau tambahkan transaksi baru.</td></tr>';
    return;
  }

  tbody.innerHTML = list.map(t => {
    const color = CAT_COLORS[t.category] || '#64748b';
    const isIncome = t.type === 'income';
    const dateTxt = new Date(t.date + 'T00:00:00').toLocaleDateString('id-ID', {
      weekday: 'short', day: 'numeric', month: 'short'
    });

    return '<tr class="border-b border-slate-100 dark:border-slate-800/60 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition">' +

      // Tanggal
      '<td class="px-5 sm:px-4 py-3 whitespace-nowrap text-slate-500 dark:text-slate-400">' + dateTxt + '</td>' +

      // Kategori (badge berwarna) + ikon tipe
      '<td class="px-4 py-3"><span class="badge" style="background:' + color + '1a;color:' + color + '">' +
      '<span class="h-1.5 w-1.5 rounded-full" style="background:' + color + '"></span>' +
      esc(t.category) + '</span></td>' +

      // Catatan
      '<td class="px-4 py-3 max-w-[200px] truncate text-slate-600 dark:text-slate-300">' +
      (t.note ? esc(t.note) : '<span class="text-slate-400">—</span>') + '</td>' +

      // Nominal (warna hijau = pemasukan, merah = pengeluaran)
      '<td class="px-4 py-3 text-right font-semibold whitespace-nowrap ' +
      (isIncome ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400') + '">' +
      (isIncome ? '+ ' : '− ') + formatRupiah(t.amount) + '</td>' +

      // Tombol hapus
      '<td class="px-4 py-3 text-center">' +
      '<button class="btn-icon" title="Hapus transaksi" aria-label="Hapus" onclick="deleteTransaction(' + t.id + ')">' +
      '<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">' +
      '<path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>' +
      '</button></td></tr>';
  }).join('');
}

/* =====================================================================
   AKSI: TAMBAH & HAPUS TRANSAKSI
   ===================================================================== */
// Ambil nilai dari form dan simpan
function addTransaction(e) {
  e.preventDefault();

  const date = document.getElementById('tx-date').value;
  const amount = parseFloat(document.getElementById('tx-amount').value);
  const category = document.getElementById('tx-category').value;
  const note = document.getElementById('tx-note').value.trim();

  // Validasi input
  if (!date)       return toast('Tanggal wajib diisi.', 'error');
  if (!amount || amount <= 0) return toast('Jumlah harus lebih dari 0.', 'error');
  if (!category)   return toast('Silakan pilih kategori.', 'error');

  transactions.push({
    id: Date.now(),              // id unik
    type: txType,
    date: date,
    amount: Math.round(amount * 100) / 100,
    category: category,
    note: note
  });
  saveData();

  // Pindah ke bulan transaksi baru agar langsung terlihat
  selectedMonth = ymOf(date);

  // Reset form (tanggal tetap hari ini, nominal & catatan dikosongkan)
  document.getElementById('tx-amount').value = '';
  document.getElementById('tx-note').value = '';
  document.getElementById('tx-date').value = todayISO();

  renderAll();
  toast((txType === 'income' ? 'Pemasukan' : 'Pengeluaran') + ' berhasil dicatat.');
}

// Hapus transaksi berdasarkan id
function deleteTransaction(id) {
  if (!confirm('Hapus transaksi ini?')) return;
  const tx = transactions.find(t => t.id === id);
  transactions = transactions.filter(t => t.id !== id);
  saveData();
  renderAll();
  toast(tx ? 'Transaksi dihapus.' : '', 'error');
}

/* =====================================================================
   FILTER RIWAYAT
   ===================================================================== */
// Isi dropdown filter kategori (semua + daftar kategori unik)
function renderFilterOptions() {
  const cats = [...new Set(transactions.map(t => t.category))];
  const sel = document.getElementById('filter-category');
  sel.innerHTML = '<option value="all">Semua Kategori</option>' +
    cats.map(c => '<option value="' + c + '">' + c + '</option>').join('');
}

/* =====================================================================
   FORM: TOGGLE TIPE & KATEGORI
   ===================================================================== */
// Atur tampilan tombol Pemasukan / Pengeluaran
function setActiveType(type) {
  txType = type;
  document.getElementById('tx-type').value = type;
  const inc = document.getElementById('btn-income');
  const exp = document.getElementById('btn-expense');

  const active = 'border-emerald-500 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 shadow-sm shadow-emerald-500/10';
  const inactive = 'border-slate-300 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:border-emerald-500/60';

  inc.className = 'rounded-xl border px-3 py-2.5 text-sm font-semibold flex items-center justify-center gap-1.5 transition ' +
    (type === 'income' ? active : inactive);
  exp.className = 'rounded-xl border px-3 py-2.5 text-sm font-semibold flex items-center justify-center gap-1.5 transition ' +
    (type === 'expense' ? active : inactive);

  renderCategoryOptions(); // opsi kategori menyesuaikan tipe
}

// Isi dropdown kategori sesuai tipe transaksi
function renderCategoryOptions() {
  const cats = txType === 'income' ? CAT_INCOME : CAT_EXPENSE;
  document.getElementById('tx-category').innerHTML =
    '<option value="">— Pilih Kategori —</option>' +
    cats.map(c => '<option value="' + c + '">' + c + '</option>').join('');
}

/* =====================================================================
   TEMA (DARK / LIGHT)
   ===================================================================== */
function applyTheme(theme) {
  const dark = theme === 'dark';
  document.documentElement.classList.toggle('dark', dark);
  document.getElementById('icon-sun').classList.toggle('hidden', !dark);
  document.getElementById('icon-moon').classList.toggle('hidden', dark);
  // Perbarui warna teks pada grafik agar sesuai tema
  if (donutChart) donutChart.update();
  if (barChart) barChart.update();
  localStorage.setItem(THEME_KEY, theme);
}

/* =====================================================================
   TOAST (NOTIFIKASI)
   ===================================================================== */
let toastTimer = null;
function toast(msg, type) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = 'toast show ' + (type === 'error' ? 'error' : 'success');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
}

/* =====================================================================
   RENDER SEMUA
   ===================================================================== */
function renderAll() {
  renderMonthSelector();
  renderSummary();
  renderCharts();
  renderHistory();
}

/* =====================================================================
   INISIALISASI & EVENT LISTENER
   ===================================================================== */
function init() {
  // 1. Muat data dari localStorage (atau seed dummy)
  loadData();

  // 2. Pulihkan tema tersimpan (default: dark)
  applyTheme(localStorage.getItem(THEME_KEY) || 'dark');

  // 3. Pulihkan bulan terpilih (default: bulan berjalan)
  selectedMonth = localStorage.getItem(MONTH_KEY) || ymOf(todayISO());

  // 4. Siapkan UI
  renderMonthSelector();
  renderFilterOptions();
  renderCategoryOptions();
  setActiveType('expense');
  document.getElementById('tx-date').value = todayISO(); // tanggal default: hari ini
  renderSummary();
  renderCharts();
  renderHistory();

  // 5. Pasang event listener

  // Dropdown bulan
  document.getElementById('month-selector').addEventListener('change', e => {
    selectedMonth = e.target.value;
    localStorage.setItem(MONTH_KEY, selectedMonth);
    renderSummary();
    renderCharts();
    renderHistory();
  });

  // Form tambah transaksi
  document.getElementById('tx-form').addEventListener('submit', addTransaction);

  // Toggle tipe pemasukan / pengeluaran
  document.getElementById('btn-income').addEventListener('click', () => setActiveType('income'));
  document.getElementById('btn-expense').addEventListener('click', () => setActiveType('expense'));

  // Filter kategori riwayat
  document.getElementById('filter-category').addEventListener('change', e => {
    filterCategory = e.target.value;
    renderHistory();
  });

  // Pencarian riwayat (dengan debounce ringan)
  document.getElementById('filter-search').addEventListener('input', e => {
    filterKeyword = e.target.value.trim();
    renderHistory();
  });

  // Tombol tema
  document.getElementById('theme-toggle').addEventListener('click', () => {
    const dark = document.documentElement.classList.contains('dark');
    applyTheme(dark ? 'light' : 'dark');
  });
}

// Jalankan aplikasi saat DOM siap
document.addEventListener('DOMContentLoaded', init);
