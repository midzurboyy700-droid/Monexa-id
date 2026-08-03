/* =========================================================================
   SAKUKU — Personal Expense Tracker
   File: script.js (ES Module)
   -------------------------------------------------------------------------
   Semua data transaksi disimpan & dibaca dari Firebase Realtime Database
   (lihat firebase.js). Tidak ada lagi penyimpanan data di localStorage.
   localStorage hanya dipakai untuk: tema (dark mode) & bulan terpilih
   (preferensi tampilan).
   ========================================================================= */
import {
  FIREBASE_CONFIG, isConfigured, initFirebase,
  onAuthChanged, signInWithGoogle, signOutUser,
  subscribeTransactions, addTransactionToDb, updateTransactionInDb,
  deleteTransactionFromDb, watchConnection
} from './firebase.js';

/* =====================================================================
   KONFIGURASI & STATE APLIKASI
   ===================================================================== */
const THEME_KEY = 'sakuku_theme_v1';        // kunci localStorage utk tema
const MONTH_KEY = 'sakuku_month_v1';        // kunci localStorage utk bulan terpilih
const LEGACY_KEY = 'sakuku_transactions_v1'; // kunci localStorage data lama (untuk migrasi sekali)

// Daftar kategori berdasarkan tipe transaksi
const CAT_EXPENSE = [
  'Makanan & Minuman', 'Transportasi', 'Belanja',
  'Tagihan/Utilitas', 'Hiburan', 'Tabungan/Investasi', 'Lain-lain'
];
const CAT_INCOME = ['Awal Bulan', 'Tengah Bulan', 'Event/Kerja', 'Investasi', 'Lain-lain'];

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

// Nama bulan Bahasa Indonesia (untuk dropdown & judul)
const MONTHS_ID = ['Januari','Februari','Maret','April','Mei','Juni',
                   'Juli','Agustus','September','Oktober','November','Desember'];

// State aplikasi
let transactions = [];        // data transaksi akun yang sedang login (dari Firebase)
let selectedMonth = '';       // format 'YYYY-MM' (preferensi tampilan)
let txType = 'expense';       // tipe transaksi pada form
let filterCategory = 'all';   // filter kategori riwayat
let filterKeyword = '';       // kata kunci pencarian riwayat
let editingId = null;         // autoId transaksi yang sedang diedit (null = mode baru)

let donutChart = null;        // objek grafik donut
let barChart = null;          // objek grafik bar

let fbUser = null;            // objek user yang sedang login (dari Firebase Auth)
let fbOnline = false;         // status koneksi ke server Firebase
let unsubTx = null;           // fungsi un-subscribe listener data transaksi
let unsubConn = null;         // fungsi un-subscribe listener koneksi

/* =====================================================================
   UTILITAS
   ===================================================================== */
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
   FIREBASE: AUTH & SINKRONISASI DATA
   ===================================================================== */
// Dipanggil oleh onAuthStateChanged setiap kali status login berubah.
function handleAuthChange(user) {
  fbUser = user;
  renderAuthUI();

  // Lepas listener data akun lama
  if (unsubTx) { unsubTx(); unsubTx = null; }

  // Tampilkan data akun baru (atau kosong jika keluar)
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

// Berlangganan data transaksi & status koneksi (jika akun login)
function subscribeIfNeeded() {
  if (!fbUser) return;
  if (!unsubTx) {
    unsubTx = subscribeTransactions(fbUser.uid, handleRemoteData);
  }
  if (!unsubConn) {
    unsubConn = watchConnection(handleConnection);
  }
}

// Dipanggil setiap kali data cloud akun berubah (realtime, termasuk perangkat lain)
function handleRemoteData(val) {
  if (val === null) {
    // Node akun masih kosong -> coba migrasi data lama dari localStorage
    // (aplikasi versi sebelumnya), lalu bersihkan.
    migrateLegacyData();
    transactions = [];
    renderAll();
    return;
  }
  // Firebase jadi sumber kebenaran
  transactions = Object.entries(val).map(([key, t]) => ({
    id: key,                              // autoId dari Firebase
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

// Migrasi satu kali: unggah data lama (localStorage) ke cloud akun, lalu hapus kunci
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

// Hubungkan ulang (dipanggil dari tombol di modal pengaturan)
function connectFirebase() {
  if (!isConfigured()) return setStatus('offline');
  subscribeIfNeeded();
  setStatus(fbOnline ? (fbUser ? 'connected' : 'signedout') : 'connecting');
}

// Putuskan langganan data cloud (konfigurasi & login tetap tersimpan)
function disconnectFirebase() {
  if (unsubTx) { unsubTx(); unsubTx = null; }
  if (unsubConn) { unsubConn(); unsubConn = null; }
  setStatus('offline');
}

// Login dengan akun Google (membutuhkan HTTPS atau localhost)
function signInGoogle() {
  if (!isConfigured()) return toast('Tempel konfigurasi Firebase di firebase.js terlebih dahulu.', 'error');
  try { initFirebase(); } catch (e) { return toast(e.message, 'error'); }
  signInWithGoogle()
    .then(() => toast('Berhasil masuk.'))
    .catch(err => {
      const hint = (err.code === 'auth/popup-blocked' || err.code === 'auth/popup-closed-by-user')
        ? 'Popup login diblokir/ditutup. Pastikan halaman dibuka via HTTPS atau localhost (bukan file://).'
        : err.message;
      toast('Gagal masuk: ' + hint, 'error');
    });
}

// Keluar dari akun (data di cloud tetap tersimpan)
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

  // ---- Donut: pengeluaran per kategori ----
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

  let list = transactions
    .filter(t => ymOf(t.date) === selectedMonth)
    .filter(t => filterCategory === 'all' || t.category === filterCategory);

  if (filterKeyword) {
    const kw = filterKeyword.toLowerCase();
    list = list.filter(t =>
      t.category.toLowerCase().includes(kw) || t.note.toLowerCase().includes(kw)
    );
  }

  list.sort((a, b) => (a.date === b.date ? (a.id < b.id ? 1 : -1) : (a.date < b.date ? 1 : -1)));
  count.textContent = list.length;

  const tbody = document.getElementById('history-body');

  if (!list.length) {
    // Pesan berbeda saat belum login vs filter tidak cocok
    const msg = !fbUser
      ? 'Masuk terlebih dahulu (klik ikon gerigi di kanan atas) untuk melihat data Anda.'
      : 'Tidak ada transaksi yang cocok. Coba ubah filter, atau tambahkan transaksi baru.';
    tbody.innerHTML =
      '<tr><td colspan="5" class="px-4 py-10 text-center text-sm text-slate-400">' + msg + '</td></tr>';
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

      // Nominal
      '<td class="px-4 py-3 text-right font-semibold whitespace-nowrap ' +
      (isIncome ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400') + '">' +
      (isIncome ? '+ ' : '− ') + formatRupiah(t.amount) + '</td>' +

      // Aksi: edit + hapus
      '<td class="px-4 py-3 text-center whitespace-nowrap">' +
        '<button class="btn-icon" title="Edit transaksi" aria-label="Edit" onclick="editTransaction(\'' + esc(t.id) + '\')">' +
        '<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">' +
        '<path stroke-linecap="round" stroke-linejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>' +
        '</button>' +
        '<button class="btn-icon" title="Hapus transaksi" aria-label="Hapus" onclick="deleteTransaction(\'' + esc(t.id) + '\')">' +
        '<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">' +
        '<path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>' +
        '</button>' +
      '</td></tr>';
  }).join('');
}

/* =====================================================================
   AKSI: TAMBAH, EDIT, HAPUS TRANSAKSI (semua via Firebase)
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
    // --- EDIT: perbarui transaksi yang ada ---
    updateTransactionInDb(fbUser.uid, editingId, payload)
      .then(() => {
        resetForm();
        toast('Transaksi diperbarui.');
      })
      .catch(err => toast('Gagal memperbarui: ' + err.message, 'error'));
  } else {
    // --- TAMBAH: transaksi baru (autoId dibuat oleh Firebase) ---
    addTransactionToDb(fbUser.uid, payload)
      .then(() => {
        resetForm();
        // Pindah ke bulan transaksi baru agar langsung terlihat
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

// Isi form dengan data transaksi untuk diedit
function editTransaction(id) {
  const t = transactions.find(x => x.id === id);
  if (!t) return;

  setActiveType(t.type);
  document.getElementById('tx-date').value = t.date;
  document.getElementById('tx-amount').value = t.amount;
  document.getElementById('tx-note').value = t.note || '';
  document.getElementById('tx-category').value = t.category; // setelah setActiveType

  editingId = id;
  document.getElementById('submit-label').textContent = 'Update Transaksi';
  document.getElementById('cancel-edit').classList.remove('hidden');
  document.getElementById('tx-form').scrollIntoView({ behavior: 'smooth', block: 'center' });
}

// Kembalikan form ke mode "tambah baru"
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
   FILTER RIWAYAT
   ===================================================================== */
function renderFilterOptions() {
  const cats = [...new Set(transactions.map(t => t.category))];
  const sel = document.getElementById('filter-category');
  sel.innerHTML = '<option value="all">Semua Kategori</option>' +
    cats.map(c => '<option value="' + c + '">' + c + '</option>').join('');
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
   TEMA (DARK / LIGHT) — localStorage dipakai hanya di sini (preferensi)
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
  document.getElementById('fb-config').value = JSON.stringify(FIREBASE_CONFIG, null, 2);
  renderAuthUI();
  document.getElementById('settings-modal').classList.remove('hidden');
}

function closeSettings() {
  document.getElementById('settings-modal').classList.add('hidden');
}

// Tombol "Hubungkan" di modal — konfigurasi dibaca dari firebase.js
function saveFirebaseConfig() {
  closeSettings();
  connectFirebase();
  updateLoginBanner();
  toast(isConfigured() ? 'Terhubung ke cloud.' : 'Konfigurasi belum diisi di firebase.js.', isConfigured() ? 'success' : 'error');
}

// Tombol "Migrasi Data Lama" — unggah data localStorage versi lama ke akun
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

// Tampilkan info akun / tombol login di modal pengaturan
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
  renderHistory();
}

/* =====================================================================
   INISIALISASI
   ===================================================================== */
function init() {
  // 1. Preferensi tampilan (tema & bulan terpilih) dari localStorage
  applyTheme(localStorage.getItem(THEME_KEY) || 'dark');
  selectedMonth = localStorage.getItem(MONTH_KEY) || ymOf(todayISO());

  // 2. Siapkan UI
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

  // 3. Pasang event listener
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

  document.getElementById('filter-category').addEventListener('change', e => {
    filterCategory = e.target.value;
    renderHistory();
  });

  document.getElementById('filter-search').addEventListener('input', e => {
    filterKeyword = e.target.value.trim();
    renderHistory();
  });

  document.getElementById('theme-toggle').addEventListener('click', () => {
    const dark = document.documentElement.classList.contains('dark');
    applyTheme(dark ? 'light' : 'dark');
  });

  document.getElementById('settings-btn').addEventListener('click', openSettings);
  document.getElementById('settings-backdrop').addEventListener('click', closeSettings);
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeSettings(); });

  // 4. Firebase: init jika sudah dikonfigurasi, lalu pantau status login
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

// Jalankan saat DOM siap (module script sudah deferred, DOM pasti tersedia)
document.addEventListener('DOMContentLoaded', init);

/* =====================================================================
   FUNGSI GLOBAL untuk event handler inline di HTML (onclick=...)
   Karena script.js adalah ES Module (tidak global), fungsi berikut
   diekspos ke window secara eksplisit.
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
