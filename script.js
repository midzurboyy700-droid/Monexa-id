/* =========================================================================
   MONEXA TRACKER — Personal Expense Tracker
   File: script.js (ES Module)
   ========================================================================= */
import {
  isConfigured,
  initFirebase,
  onAuthChanged,
  signInWithGoogle,
  signOutUser,
  subscribeTransactions,
  addTransactionToDb,
  updateTransactionInDb,
  deleteTransactionFromDb,
  watchConnection
} from './firebase.js';

/* =====================================================================
   KONFIGURASI & STATE APLIKASI
   ===================================================================== */
const THEME_KEY = 'sakuku_theme_v1';        // kunci localStorage utk tema
const MONTH_KEY = 'sakuku_month_v1';        // kunci localStorage utk bulan terpilih
const LEGACY_KEY = 'sakuku_transactions_v1'; // kunci localStorage data lama

// Daftar kategori berdasarkan tipe transaksi
const CAT_EXPENSE = [
  'Makanan & Minuman', 'Transportasi', 'Belanja',
  'Tagihan/Utilitas', 'Hiburan', 'Tabungan/Investasi', 'Lain-lain'
];
const CAT_INCOME = ['Awal Bulan', 'Tengah Bulan', 'Event/Kerja', 'Investasi', 'Lain-lain'];

// Map Icon Emoji untuk Kategori
/* =====================================================================
   HELPER SVG ICONS PER KATEGORI (STYLE MONEXA LOGO)
   ===================================================================== */
// Gradien & Soft Glow Shadow bergaya logo Monexa
const CAT_GRADIENTS = {
  'Makanan & Minuman': 'from-emerald-500 to-teal-600 shadow-emerald-500/25',
  'Transportasi':      'from-sky-500 to-blue-600 shadow-sky-500/25',
  'Belanja':           'from-purple-500 to-indigo-600 shadow-purple-500/25',
  'Tagihan/Utilitas':  'from-amber-500 to-orange-600 shadow-amber-500/25',
  'Hiburan':           'from-pink-500 to-rose-600 shadow-pink-500/25',
  'Tabungan/Investasi':'from-teal-500 to-emerald-600 shadow-teal-500/25',
  'Awal Bulan':        'from-emerald-500 to-teal-600 shadow-emerald-500/25',
  'Tengah Bulan':      'from-sky-500 to-cyan-600 shadow-sky-500/25',
  'Event/Kerja':       'from-violet-500 to-purple-600 shadow-violet-500/25',
  'Investasi':         'from-teal-500 to-emerald-600 shadow-teal-500/25',
  'Lain-lain':         'from-slate-500 to-slate-600 shadow-slate-500/25'
};

function getCategoryIconSvg(category) {
  const icons = {
    'Makanan & Minuman': `<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
      <!-- Gelas & Sedotan -->
      <path stroke-linecap="round" stroke-linejoin="round" d="M6 8l1 11a2 2 0 002 2h3a2 2 0 002-2l1-11M5 8h10M11 8L13 3" />
      <!-- Burger (Roti Atas, Daging, Roti Bawah) -->
      <path stroke-linecap="round" stroke-linejoin="round" d="M15 13a3 3 0 016 0h-6zM14 16h8M15 19a1 1 0 001 1h4a1 1 0 001-1v-1h-6v1z" />
    </svg>`,
    'Transportasi':      `<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" /></svg>`,
    'Belanja':           `<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" /></svg>`,
    'Tagihan/Utilitas':  `<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" /></svg>`,
    'Hiburan':           `<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M15 5v2m0 4v2m0 4v2M5 5a2 2 0 00-2 2v3a2 2 0 002 2h14a2 2 0 002-2V7a2 2 0 00-2-2H5z" /></svg>`,
    'Tabungan/Investasi':`<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /></svg>`,
    'Awal Bulan':        `<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>`,
    'Tengah Bulan':      `<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" /></svg>`,
    'Event/Kerja':       `<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>`,
    'Investasi':         `<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 8v13m0-13V6a2 2 0 112 2h-2zm0 0V5a2 2 0 10-2 2h2zm0 13C10.832 19.477 9.246 19 7.5 19S4.168 19.477 3 20.253V7.5C4.168 6.723 5.754 6.25 7.5 6.25s3.332.473 4.5 1.25" /></svg>`,
    'Lain-lain':         `<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" /></svg>`
  };

  const defaultIcon = `<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" /></svg>`;

  return icons[category] || defaultIcon;
}
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
  'Event/Kerja':       '#8b5cf6',
  'Investasi':         '#14b8a6',
  'Lain-lain':         '#64748b'
};

// Nama bulan Bahasa Indonesia
const MONTHS_ID = ['Januari','Februari','Maret','April','Mei','Juni',
                   'Juli','Agustus','September','Oktober','November','Desember'];

// State aplikasi
let transactions = [];        // data transaksi (dari Firebase)
let selectedMonth = '';       // format 'YYYY-MM'
let txType = 'expense';       // tipe transaksi pada form
let filterCategory = 'all';   // filter kategori riwayat
let filterKeyword = '';       // kata kunci pencarian riwayat
let editingId = null;         // autoId transaksi yang sedang diedit

let donutChart = null;        
let barChart = null;          

let fbUser = null;            
let fbOnline = false;         
let unsubTx = null;           
let unsubConn = null;         

/* =====================================================================
   UTILITAS
   ===================================================================== */
function todayISO() {
  const d = new Date();
  return d.getFullYear() + '-' +
         String(d.getMonth() + 1).padStart(2, '0') + '-' +
         String(d.getDate()).padStart(2, '0');
}

function formatRupiah(n) {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency', currency: 'IDR', maximumFractionDigits: 0
  }).format(Math.round(n));
}

function rupiahShort(n) {
  if (n >= 1e6) return (n / 1e6).toLocaleString('id-ID', { maximumFractionDigits: 1 }) + ' jt';
  if (n >= 1e3) return (n / 1e3).toLocaleString('id-ID', { maximumFractionDigits: 0 }) + ' rb';
  return String(Math.round(n));
}

function ymOf(iso) { return iso.slice(0, 7); }

function monthLabel(ym) {
  const [y, m] = ym.split('-');
  return MONTHS_ID[parseInt(m, 10) - 1] + ' ' + y;
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, m => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[m]));
}

function chartTextColor() {
  return document.documentElement.classList.contains('dark') ? '#94a3b8' : '#64748b';
}
function chartTextStrong() {
  return document.documentElement.classList.contains('dark') ? '#f1f5f9' : '#0f172a';
}

/* =====================================================================
   FIREBASE: AUTH & SINKRONISASI DATA
   ===================================================================== */
function handleAuthChange(user) {
  fbUser = user;
  renderAuthUI();

  if (unsubTx) { unsubTx(); unsubTx = null; }

  transactions = [];
  renderAll();
  cancelEdit();
  updateLoginBanner();

  if (user) {
    subscribeIfNeeded();
    setStatus(fbOnline ? 'connected' : 'connecting');
  } else {
    setStatus(fbOnline ? 'signedout' : 'offline');
  }
}

function subscribeIfNeeded() {
  if (!fbUser) return;
  if (!unsubTx) {
    unsubTx = subscribeTransactions(fbUser.uid, handleRemoteData);
  }
  if (!unsubConn) {
    unsubConn = watchConnection(handleConnection);
  }
}

function handleRemoteData(val) {
  if (val === null) {
    migrateLegacyData();
    transactions = [];
    renderAll();
    return;
  }
  transactions = Object.entries(val).map(([key, t]) => ({
    id: key,
    type: t.type,
    date: t.date,
    amount: t.amount,
    category: t.category,
    note: t.note || ''
  }));
  renderAll();
}

function handleConnection(online) {
  fbOnline = online;
  setStatus(fbOnline ? (fbUser ? 'connected' : 'signedout') : 'connecting');
}

function migrateLegacyData() {
  const legacy = localStorage.getItem(LEGACY_KEY);
  if (!legacy) return;
  let arr;
  try { arr = JSON.parse(legacy); } catch (e) { arr = null; }
  if (!Array.isArray(arr) || !arr.length) { localStorage.removeItem(LEGACY_KEY); return; }

  Promise.all(arr.map(t =>
    addTransactionToDb(fbUser.uid, {
      type: t.type, date: t.date, amount: t.amount, category: t.category, note: t.note || ''
    })
  ))
    .then(() => {
      localStorage.removeItem(LEGACY_KEY);
      toast('Data lama berhasil dimigrasi ke akun Anda.');
    })
    .catch(err => toast('Migrasi data gagal: ' + err.message, 'error'));
}

function connectFirebase() {
  if (!isConfigured()) return setStatus('offline');
  subscribeIfNeeded();
  setStatus(fbOnline ? (fbUser ? 'connected' : 'signedout') : 'connecting');
}

function disconnectFirebase() {
  if (unsubTx) { unsubTx(); unsubTx = null; }
  if (unsubConn) { unsubConn(); unsubConn = null; }
  setStatus('offline');
}

function signInGoogle() {
  if (!isConfigured()) return toast('Tempel konfigurasi Firebase di firebase.js terlebih dahulu.', 'error');
  try { initFirebase(); } catch (e) { return toast(e.message, 'error'); }
  signInWithGoogle()
    .then(() => toast('Berhasil masuk.'))
    .catch(err => {
      const hint = (err.code === 'auth/popup-blocked' || err.code === 'auth/popup-closed-by-user')
        ? 'Popup login diblokir/ditutup. Pastikan halaman dibuka via HTTPS atau localhost.'
        : err.message;
      toast('Gagal masuk: ' + hint, 'error');
    });
}

function signOutGoogle() {
  signOutUser()
    .then(() => toast('Berhasil keluar.'))
    .catch(err => toast('Gagal keluar: ' + err.message, 'error'));
}

/* =====================================================================
   RENDER: RINGKASAN FINANSIAL
   ===================================================================== */
function renderSummary() {
  const list = transactions.filter(t => ymOf(t.date) === selectedMonth);
  const income  = list.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
  const expense = list.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
  const balance = income - expense;

  document.getElementById('card-income').textContent  = formatRupiah(income);
  document.getElementById('card-expense').textContent = formatRupiah(expense);

  const balEl = document.getElementById('card-balance');
  balEl.textContent = formatRupiah(balance);
  balEl.className = 'mt-3 text-2xl font-extrabold ' +
    (balance >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400');

  const sub = document.getElementById('summary-subtitle');
  sub.textContent = monthLabel(selectedMonth) + ' · ' + list.length + ' transaksi';
}

/* =====================================================================
   RENDER: GRAFIK (CHART.JS)
   ===================================================================== */
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

function expenseByCategory(list) {
  const map = {};
  list.forEach(t => {
    if (t.type !== 'expense') return;
    map[t.category] = (map[t.category] || 0) + t.amount;
  });
  return map;
}

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

  const labels = totals.map((_, i) => 'Minggu ' + (i + 1));
  return { labels, totals };
}

function renderCharts() {
  const list = transactions.filter(t => ymOf(t.date) === selectedMonth);

  const byCat = expenseByCategory(list);
  const donutLabels = Object.keys(byCat);
  const donutData = donutLabels.map(k => byCat[k]);
  const donutTotal = donutData.reduce((s, n) => s + n, 0);
  window._donutCenter = formatRupiah(donutTotal);

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
   FILTER CHIPS (PERBAIKAN FITUR FILTER KATEGORI)
   ===================================================================== */
function renderFilterOptions() {
  const container = document.getElementById('filter-chips-container');
  if (!container) return;

  // Ambil kategori unik yang tersedia dari data transaksi
  const catsFromData = transactions.map(t => t.category);
  const defaultCats = txType === 'income' ? CAT_INCOME : CAT_EXPENSE;
  const cats = [...new Set([...defaultCats, ...catsFromData])];
  const allCats = ['all', ...cats];

  container.innerHTML = allCats.map(cat => {
    const isAll = cat === 'all';
    const label = isAll ? 'Semua' : cat;
    const isActive = filterCategory === cat;
    const iconSvg = isAll 
      ? `<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>`
      : getCategoryIconSvg(cat);

    // Menggunakan encodeURIComponent agar string kategori dengan karakter '&' atau spasi aman
    return `<button type="button" 
      class="chip-filter ${isActive ? 'active' : ''}" 
      onclick="setFilterCategory(decodeURIComponent('${encodeURIComponent(cat)}'))">
      <span class="shrink-0 pointer-events-none">${iconSvg}</span>
      <span class="pointer-events-none">${esc(label)}</span>
    </button>`;
  }).join('');
}

// Global Event Handler untuk Chip Filter
window.setFilterCategory = function(cat) {
  filterCategory = cat;
  renderFilterOptions(); // Re-render status aktif pada Chip
  renderHistory();       // Re-render riwayat transaksi terfilter
};

/* =====================================================================
   RENDER: RIWAYAT TRANSAKSI (MODERN TIMELINE REDESIGN)
   ===================================================================== */
function renderHistory() {
  const timelineEl = document.getElementById('history-timeline');
  if (!timelineEl) return;

  // 1. Filter transaksi
  let list = transactions
    .filter(t => ymOf(t.date) === selectedMonth)
    .filter(t => filterCategory === 'all' || t.category === filterCategory);

  if (filterKeyword) {
    const kw = filterKeyword.toLowerCase();
    list = list.filter(t =>
      t.category.toLowerCase().includes(kw) || t.note.toLowerCase().includes(kw)
    );
  }

  // Update statistik mini
  const totalCount = list.length;
  const incomeCount = list.filter(t => t.type === 'income').length;
  const expenseCount = list.filter(t => t.type === 'expense').length;

  const elTotal = document.getElementById('stat-total-count');
  const elInc = document.getElementById('stat-income-count');
  const elExp = document.getElementById('stat-expense-count');

  if (elTotal) elTotal.textContent = totalCount;
  if (elInc) elInc.textContent = incomeCount;
  if (elExp) elExp.textContent = expenseCount;

  // Render jika kosong
  if (!list.length) {
    const msg = !fbUser
      ? 'Masuk terlebih dahulu (klik ikon gerigi) untuk melihat data Anda.'
      : 'Belum ada transaksi pada periode atau filter ini.';
    
    timelineEl.innerHTML = `
      <div class="py-12 text-center card bg-slate-50/50 dark:bg-slate-900/30 border-dashed">
        <div class="text-3xl mb-2">📥</div>
        <p class="text-sm font-medium text-slate-500 dark:text-slate-400">${msg}</p>
      </div>`;
    return;
  }

  // 2. Kelompokkan transaksi berdasarkan Tanggal
  const grouped = {};
  list.forEach(t => {
    if (!grouped[t.date]) grouped[t.date] = [];
    grouped[t.date].push(t);
  });

  const sortedDates = Object.keys(grouped).sort((a, b) => (a < b ? 1 : -1));

  // 3. Render HTML Group Timeline
  timelineEl.innerHTML = sortedDates.map(dateStr => {
    const dayItems = grouped[dateStr];
    dayItems.sort((a, b) => (a.id < b.id ? 1 : -1));

    const dayIncome = dayItems.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
    const dayExpense = dayItems.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);

    const dateObj = new Date(dateStr + 'T00:00:00');
    const formattedDate = dateObj.toLocaleDateString('id-ID', {
      weekday: 'long', day: 'numeric', month: 'long'
    });

    // Render Kartu Per Transaksi pada Hari Tersebut
    const cardsHtml = dayItems.map(t => {
      const isIncome = t.type === 'income';
      const iconSvg = getCategoryIconSvg(t.category);
      const gradientClass = CAT_GRADIENTS[t.category] || 'from-slate-500 to-slate-600 shadow-slate-500/25';

      return `
        <div class="tx-card animate-tx-card">
          
          <!-- SISI KIRI: Icon + Nama Kategori + Catatan -->
          <div class="tx-card-body">
            <div class="h-10 w-10 shrink-0 rounded-xl bg-gradient-to-br ${gradientClass} flex items-center justify-center text-white shadow-md">
              ${iconSvg}
            </div>

            <div class="min-w-0 flex-1 text-left">
              <h4 class="text-sm font-bold text-slate-900 dark:text-slate-100 leading-snug">
                ${esc(t.category)}
              </h4>
              <p class="text-xs text-slate-500 dark:text-slate-400 mt-0.5 leading-relaxed tx-note-clamp">
                ${t.note ? esc(t.note) : '<span class="italic opacity-50">Tanpa catatan</span>'}
              </p>
            </div>
          </div>

          <!-- SISI KANAN: Nominal Transaksi & Menu ⋮ (Rata Kanan Presisi) -->
          <div class="tx-card-footer">
            <div class="text-right">
              <span class="text-base sm:text-lg font-extrabold tracking-tight ${isIncome ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}">
                ${isIncome ? '+' : '-'} ${formatRupiah(t.amount)}
              </span>
            </div>

            <!-- Tombol Menu ⋮ di Ujung Kanan -->
            <div class="relative shrink-0 tx-menu-container">
              <button type="button" 
                      class="btn-icon !p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg transition" 
                      title="Opsi Lainnya" 
                      aria-label="Opsi Lainnya"
                      onclick="toggleTxMenu(event, '${esc(t.id)}')">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
                </svg>
              </button>

              <!-- Popover Menu Dropdown -->
              <div id="tx-dropdown-${esc(t.id)}" class="tx-menu-dropdown">
                <button type="button" 
                        class="w-full px-3.5 py-2 text-left text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700/60 flex items-center gap-2 transition"
                        onclick="editTransaction('${esc(t.id)}'); closeAllTxMenus();">
                  <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                  Edit
                </button>
                <button type="button" 
                        class="w-full px-3.5 py-2 text-left text-xs font-semibold text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 flex items-center gap-2 transition"
                        onclick="deleteTransaction('${esc(t.id)}'); closeAllTxMenus();">
                  <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 text-rose-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                  Hapus
                </button>
              </div>
            </div>
          </div>

        </div>
      `;
    }).join('');
    
// --- CONCEPT REDESIGN: COMPACT HEADER TANGGAL ---
    return `
      <div class="space-y-3">
        <!-- Date Group Header: Kiri Tanggal & Badge, Kanan Subtotal Harian -->
        <div class="flex items-center justify-between gap-2 px-1 pb-1 border-b border-slate-200/60 dark:border-slate-800/60">
          
          <!-- Sisi Kiri: Tanggal + Jumlah Transaksi -->
          <div class="flex items-center gap-2 min-w-0">
            <h3 class="text-xs font-bold text-slate-800 dark:text-slate-200 tracking-wide uppercase truncate">
              ${formattedDate}
            </h3>
            <span class="px-2 py-0.5 rounded-full bg-slate-200/70 dark:bg-slate-800 text-[10px] font-bold text-slate-600 dark:text-slate-400 shrink-0">
              ${dayItems.length}
            </span>
          </div>
          
          <!-- Sisi Kanan: Net / Compact Ringkasan Harian -->
          <div class="text-[11px] font-bold shrink-0 flex items-center gap-2">
            ${dayIncome > 0 ? `
              <span class="text-emerald-600 dark:text-emerald-400 flex items-center gap-0.5">
                <span class="text-[9px]">↑</span>${formatRupiah(dayIncome)}
              </span>
            ` : ''}
            ${dayExpense > 0 ? `
              <span class="text-rose-600 dark:text-rose-400 flex items-center gap-0.5">
                <span class="text-[9px]">↓</span>${formatRupiah(dayExpense)}
              </span>
            ` : ''}
          </div>

        </div>

        <!-- Stack Kartu Transaksi -->
        <div class="space-y-2.5">
          ${cardsHtml}
        </div>
      </div>
    `;
    
  }).join('');
}

/* =====================================================================
   AKSI: TAMBAH, EDIT, HAPUS TRANSAKSI
   ===================================================================== */
function handleFormSubmit(e) {
  e.preventDefault();

  const date = document.getElementById('tx-date').value;
  const amount = parseFloat(document.getElementById('tx-amount').value);
  const category = document.getElementById('tx-category').value;
  const note = document.getElementById('tx-note').value.trim();

  if (!date)       return toast('Tanggal wajib diisi.', 'error');
  if (!amount || amount <= 0) return toast('Jumlah harus lebih dari 0.', 'error');
  if (!category)   return toast('Silakan pilih kategori.', 'error');
  if (!fbUser)     return toast('Masuk terlebih dahulu untuk menyimpan ke cloud.', 'error');

  const payload = {
    type: txType,
    date: date,
    amount: Math.round(amount * 100) / 100,
    category: category,
    note: note
  };

  if (editingId) {
    updateTransactionInDb(fbUser.uid, editingId, payload)
      .then(() => {
        resetForm();
        toast('Transaksi diperbarui.');
      })
      .catch(err => toast('Gagal memperbarui: ' + err.message, 'error'));
  } else {
    addTransactionToDb(fbUser.uid, payload)
      .then(() => {
        resetForm();
        selectedMonth = ymOf(date);
        localStorage.setItem(MONTH_KEY, selectedMonth);
        toast((txType === 'income' ? 'Pemasukan' : 'Pengeluaran') + ' berhasil dicatat.');
      })
      .catch(err => toast('Gagal menyimpan: ' + err.message, 'error'));
  }
}

function deleteTransaction(id) {
  if (!fbUser) return toast('Masuk terlebih dahulu.', 'error');
  if (!confirm('Hapus transaksi ini?')) return;
  deleteTransactionFromDb(fbUser.uid, id)
    .then(() => toast('Transaksi dihapus.', 'error'))
    .catch(err => toast('Gagal menghapus: ' + err.message, 'error'));
}

function editTransaction(id) {
  const t = transactions.find(x => x.id === id);
  if (!t) return;

  setActiveType(t.type);
  document.getElementById('tx-date').value = t.date;
  document.getElementById('tx-amount').value = t.amount;
  document.getElementById('tx-note').value = t.note || '';
  document.getElementById('tx-category').value = t.category;

  editingId = id;
  document.getElementById('submit-label').textContent = 'Update Transaksi';
  document.getElementById('cancel-edit').classList.remove('hidden');
  document.getElementById('tx-form').scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function resetForm() {
  editingId = null;
  document.getElementById('tx-amount').value = '';
  document.getElementById('tx-note').value = '';
  document.getElementById('tx-date').value = todayISO();
  document.getElementById('submit-label').textContent = 'Tambah Transaksi';
  document.getElementById('cancel-edit').classList.add('hidden');
}

function cancelEdit() {
  resetForm();
  toast('Edit dibatalkan.', 'error');
}

/* =====================================================================
   FORM: TOGGLE TIPE & KATEGORI
   ===================================================================== */
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

  renderCategoryOptions();
}

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
  if (donutChart) donutChart.update();
  if (barChart) barChart.update();
  localStorage.setItem(THEME_KEY, theme);
}

/* =====================================================================
   SELECTOR BULAN
   ===================================================================== */
function availableMonths() {
  const set = new Set();
  set.add(ymOf(todayISO()));
  transactions.forEach(t => set.add(ymOf(t.date)));
  return [...set].sort().reverse();
}

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
   STATUS KONEKSI & LOGIN BANNER
   ===================================================================== */
function setStatus(state) {
  const dot = document.getElementById('fb-status');
  const txt = document.getElementById('fb-status-text');
  const styles = {
    connected:  ['bg-emerald-500', 'Tersinkron otomatis'],
    signedout:  ['bg-slate-500',   'Belum masuk — klik "Masuk dengan Google"'],
    connecting: ['bg-amber-500',   'Menghubungkan…'],
    offline:    ['bg-slate-400',   'Tidak terhubung ke cloud']
  };
  const s = styles[state] || styles.offline;
  if (dot) dot.className = 'h-2.5 w-2.5 rounded-full ' + s[0];
  if (txt) txt.textContent = s[1];
}

function updateLoginBanner() {
  const banner = document.getElementById('login-banner');
  if (!banner) return;
  if (!isConfigured()) {
    banner.innerHTML = 'Tempel konfigurasi Firebase di file <b>firebase.js</b>, lalu muat ulang halaman.';
    banner.classList.remove('hidden');
  } else if (!fbUser) {
    banner.innerHTML = 'Belum masuk. Klik <b>ikon gerigi</b> di kanan atas lalu <b>Masuk dengan Google</b> untuk menyimpan &amp; menyinkronkan data.';
    banner.classList.remove('hidden');
  } else {
    banner.classList.add('hidden');
  }
}

/* =====================================================================
   MODAL PENGATURAN
   ===================================================================== */
function openSettings() {
  const configTextarea = document.getElementById('fb-config');
  if (configTextarea) {
    configTextarea.value = "Konfigurasi sudah tersimpan di firebase.js";
  }
  document.getElementById('settings-modal').classList.remove('hidden');
}

function closeSettings() {
  document.getElementById('settings-modal').classList.add('hidden');
}

function saveFirebaseConfig() {
  closeSettings();
  connectFirebase();
  updateLoginBanner();
  toast(isConfigured() ? 'Terhubung ke cloud.' : 'Konfigurasi belum diisi di firebase.js.', isConfigured() ? 'success' : 'error');
}

function uploadLocalToCloud() {
  const legacy = localStorage.getItem(LEGACY_KEY);
  if (!fbUser) return toast('Masuk terlebih dahulu.', 'error');
  if (!legacy) return toast('Tidak ada data lama di perangkat ini.', 'error');
  let arr;
  try { arr = JSON.parse(legacy); } catch (e) { arr = null; }
  if (!Array.isArray(arr) || !arr.length) { localStorage.removeItem(LEGACY_KEY); return toast('Tidak ada data lama.', 'error'); }

  Promise.all(arr.map(t =>
    addTransactionToDb(fbUser.uid, {
      type: t.type, date: t.date, amount: t.amount, category: t.category, note: t.note || ''
    })
  ))
    .then(() => {
      localStorage.removeItem(LEGACY_KEY);
      toast('Data lama berhasil diunggah ke cloud.');
    })
    .catch(err => toast('Gagal mengunggah: ' + err.message, 'error'));
}

function renderAuthUI() {
  const box = document.getElementById('auth-box');
  if (!box) return;

  if (fbUser) {
    const u = fbUser;
    box.innerHTML =
      '<div class="flex items-center justify-between gap-3 rounded-xl border border-emerald-500/40 bg-emerald-500/5 px-3 py-2.5">' +
        '<div class="flex items-center gap-3 min-w-0">' +
          '<img src="' + esc(u.photoURL || '') + '" alt="" class="h-10 w-10 rounded-full bg-slate-200 shrink-0" onerror="this.style.display=\'none\'" />' +
          '<div class="min-w-0">' +
            '<p class="text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">' + esc(u.displayName || 'Pengguna') + '</p>' +
            '<p class="text-xs text-slate-500 dark:text-slate-400 truncate">' + esc(u.email || '') + '</p>' +
          '</div>' +
        '</div>' +
        '<button onclick="signOutGoogle()" class="shrink-0 rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:border-rose-500/60 hover:text-rose-600 transition">Keluar</button>' +
      '</div>';
  } else {
    box.innerHTML =
      '<button onclick="signInGoogle()" class="w-full inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-3 text-sm font-semibold text-slate-700 dark:text-slate-200 hover:border-emerald-500/60 hover:text-emerald-600 dark:hover:text-emerald-400 transition">' +
        '<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 48 48"><path fill="#FFC107" d="M43.6 20.1H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3l5.7-5.7C34.3 6.1 29.4 4 24 4 13 4 4 13 4 24s9 20 20 20 20-9 20-20c0-1.3-.1-2.6-.4-3.9z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.9 1.2 8 3l5.7-5.7C34.3 6.1 29.4 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.1H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C36.9 39.2 44 34 44 24c0-1.3-.1-2.6-.4-3.9z"/></svg>' +
        'Masuk dengan Google' +
      '</button>';
  }
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
  renderFilterOptions();
  renderHistory();
}

/* =====================================================================
   INISIALISASI
   ===================================================================== */
function init() {
  applyTheme(localStorage.getItem(THEME_KEY) || 'dark');
  selectedMonth = localStorage.getItem(MONTH_KEY) || ymOf(todayISO());

  renderMonthSelector();
  renderFilterOptions();
  renderCategoryOptions();
  setActiveType('expense');
  document.getElementById('tx-date').value = todayISO();
  renderSummary();
  renderCharts();
  renderHistory();
  updateLoginBanner();
  setStatus(isConfigured() ? (fbUser ? 'connected' : 'signedout') : 'offline');

  document.getElementById('month-selector').addEventListener('change', e => {
    selectedMonth = e.target.value;
    localStorage.setItem(MONTH_KEY, selectedMonth);
    renderSummary();
    renderCharts();
    renderHistory();
  });

  document.getElementById('tx-form').addEventListener('submit', handleFormSubmit);

  document.getElementById('btn-income').addEventListener('click', () => setActiveType('income'));
  document.getElementById('btn-expense').addEventListener('click', () => setActiveType('expense'));

  const searchInput = document.getElementById('filter-search');
  if (searchInput) {
    searchInput.addEventListener('input', e => {
      filterKeyword = e.target.value.trim();
      renderHistory();
    });
  }

  document.getElementById('theme-toggle').addEventListener('click', () => {
    const dark = document.documentElement.classList.contains('dark');
    applyTheme(dark ? 'light' : 'dark');
  });

  document.getElementById('settings-btn').addEventListener('click', openSettings);
  document.getElementById('settings-backdrop').addEventListener('click', closeSettings);
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeSettings(); });

  if (isConfigured()) {
    try {
      initFirebase();
      onAuthChanged(handleAuthChange);
    } catch (e) {
      console.error(e);
      toast('Gagal inisialisasi Firebase: ' + e.message, 'error');
    }
  }
}

document.addEventListener('DOMContentLoaded', init);

/* =====================================================================
   EKSPOS FUNGSI KE WINDOW (GLOBAL EXPORT)
   ===================================================================== */
Object.assign(window, {
  deleteTransaction,
  editTransaction,
  cancelEdit,
  openSettings,
  closeSettings,
  saveFirebaseConfig,
  uploadLocalToCloud,
  disconnectFirebase,
  signInGoogle,
  signOutGoogle
});

/* =====================================================================
   HELPER DROPDOWN MENU "⋮" (MORE OPTIONS)
   ===================================================================== */
window.toggleTxMenu = function(e, id) {
  e.stopPropagation();
  const targetDropdown = document.getElementById(`tx-dropdown-${id}`);
  const isAlreadyOpen = targetDropdown?.classList.contains('show');

  closeAllTxMenus();

  if (targetDropdown && !isAlreadyOpen) {
    targetDropdown.classList.add('show');
  }
};

window.closeAllTxMenus = function() {
  document.querySelectorAll('.tx-menu-dropdown').forEach(el => {
    el.classList.remove('show');
  });
};

// Tutup menu dropdown jika pengguna mengklik area di luar card
document.addEventListener('click', () => {
  closeAllTxMenus();
});
