/**
 * GRIDCRAFT 2.0 — SỔ CÔNG TRÌNH (SAMSUNG GALAXY S23 ULTRA EDITION)
 * Core Architecture & Business Logic Engine:
 * - Bảo toàn lịch sử đa công trình, đa thợ qua nhiều năm (2025 - 2027+)
 * - Kế toán tiền mặt chuẩn: Chốt trả lương ghi sổ quỹ thực tế, Nợ vật tư thanh toán từng phần
 * - Bộ lọc kỳ Tuần/Tháng/Năm chuẩn ISO và múi giờ Asia/Ho_Chi_Minh (UTC+7)
 * - Khung ký S-Pen Pointer Events, Pointer Capture, Palm Rejection & Ký bù
 * - Lưu trữ kết hợp IndexedDB + localStorage, Migration an toàn, Chống XSS
 * - Xuất Excel .xlsx 8 sheet toàn diện & Nhập/Xuất sao lưu
 */

const STORAGE_KEY = "GRIDCRAFT_SO_CONG_TRINH_V2";
const DB_NAME = "GridCraft_DB";
const DB_VERSION = 1;
const STORE_NAME = "app_state";

// ================= TIỆN ÍCH AN TOÀN & XSS =================
function escapeHTML(str) {
  if (str == null) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatVND(num) {
  const n = Math.round(Number(num) || 0);
  return n.toLocaleString("vi-VN") + " đ";
}

function readMoneyVietnamese(amount) {
  const n = Math.round(Number(amount) || 0);
  if (n === 0) return "Không đồng";
  if (n >= 1000000000) return (n / 1000000000).toFixed(2).replace(/\.00$/, "") + " tỷ đồng";
  const trieu = Math.floor(n / 1000000);
  const nghin = Math.floor((n % 1000000) / 1000);
  let parts = [];
  if (trieu > 0) parts.push(`${trieu} triệu`);
  if (nghin > 0) parts.push(`${nghin} nghìn`);
  return (parts.join(" ") + " đồng").replace(/^./, c => c.toUpperCase());
}

// ================= MÚI GIỜ ASIA/HO_CHI_MINH (UTC+7) & XỬ LÝ KỲ =================
function getTodayVN() {
  const now = new Date();
  const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
  const vnDate = new Date(utc + (7 * 3600000));
  return vnDate.toISOString().slice(0, 10);
}

// Tính toán tuần ISO (Thứ 2 đến Chủ nhật)
function getWeekRange(dateStr) {
  if (!dateStr) dateStr = getTodayVN();
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  const day = date.getDay(); // 0: CN, 1: T2, ..., 6: T7
  const diffToMonday = day === 0 ? -6 : 1 - day;

  const monday = new Date(date);
  monday.setDate(date.getDate() + diffToMonday);

  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);

  const fmt = dt => {
    const yr = dt.getFullYear();
    const mo = String(dt.getMonth() + 1).padStart(2, "0");
    const da = String(dt.getDate()).padStart(2, "0");
    return `${yr}-${mo}-${da}`;
  };

  return {
    start: fmt(monday),
    end: fmt(sunday),
    displayStart: `${String(monday.getDate()).padStart(2, "0")}/${String(monday.getMonth() + 1).padStart(2, "0")}`,
    displayEnd: `${String(sunday.getDate()).padStart(2, "0")}/${String(sunday.getMonth() + 1).padStart(2, "0")}/${sunday.getFullYear()}`
  };
}

function isInSelectedPeriod(dateStr) {
  if (!dateStr) return false;
  const mode = store.settings.periodMode;
  const selMonth = store.settings.selectedMonth; // YYYY-MM
  const selDate = store.settings.selectedDate;   // YYYY-MM-DD

  if (mode === "month") {
    return dateStr.startsWith(selMonth);
  }
  if (mode === "year") {
    return dateStr.startsWith(selMonth.slice(0, 4));
  }
  // Mode week
  const week = getWeekRange(selDate);
  return dateStr >= week.start && dateStr <= week.end;
}

// ================= DỮ LIỆU MẪU KHỞI TẠO & MIGRATION =================
function createDefaultStore() {
  const today = getTodayVN();
  const currentMonth = today.slice(0, 7);
  return {
    version: 2,
    settings: {
      selectedProjectId: "PRJ_NINH_KIEU", // "ALL" hoặc ID công trình
      periodMode: "month",                // "week" | "month" | "year"
      selectedMonth: currentMonth,        // YYYY-MM
      selectedDate: today,
      hideBalance: false,
      theme: "light"
    },
    projects: [
      {
        id: "PRJ_NINH_KIEU",
        name: "Nhà phố Ninh Kiều",
        owner: "Anh Hoàng",
        location: "Đường 30/4, Ninh Kiều, Cần Thơ",
        status: "active",
        startDate: "2026-09-01"
      },
      {
        id: "PRJ_CAI_RANG",
        name: "Biệt thự Cái Răng",
        owner: "Chị Lan",
        location: "KDC Nam Long, Cái Răng, Cần Thơ",
        status: "active",
        startDate: "2026-10-01"
      },
      {
        id: "PRJ_BINH_THUY",
        name: "Nhà trọ Bình Thủy (2025)",
        owner: "Chú Bảy",
        location: "Bình Thủy, Cần Thơ",
        status: "completed",
        startDate: "2025-03-10"
      }
    ],
    workers: [
      { id: "W01", name: "Nguyễn Văn Ba", role: "Thợ cả (Thợ chính)", dailyRate: 500000, projectId: "PRJ_NINH_KIEU" },
      { id: "W02", name: "Trần Văn Tư", role: "Thợ xây chính", dailyRate: 450000, projectId: "PRJ_NINH_KIEU" },
      { id: "W03", name: "Lê Hoàng Nam", role: "Thợ sắt / Cốt pha", dailyRate: 450000, projectId: "PRJ_NINH_KIEU" },
      { id: "W04", name: "Phạm Văn Út", role: "Thợ hồ phụ", dailyRate: 330000, projectId: "PRJ_NINH_KIEU" },
      { id: "W05", name: "Võ Minh Tâm", role: "Thợ điện nước", dailyRate: 480000, projectId: "PRJ_CAI_RANG" },
      { id: "W06", name: "Đặng Văn Hùng", role: "Thợ hồ phụ", dailyRate: 340000, projectId: "PRJ_CAI_RANG" }
    ],
    attendance: [
      { id: "ATT_1", projectId: "PRJ_NINH_KIEU", workerId: "W01", date: today, units: 1.0, rateSnapshot: 500000 },
      { id: "ATT_2", projectId: "PRJ_NINH_KIEU", workerId: "W02", date: today, units: 1.0, rateSnapshot: 450000 },
      { id: "ATT_3", projectId: "PRJ_NINH_KIEU", workerId: "W03", date: today, units: 1.5, rateSnapshot: 450000 },
      { id: "ATT_4", projectId: "PRJ_NINH_KIEU", workerId: "W04", date: today, units: 0.5, rateSnapshot: 330000 }
    ],
    advances: [
      {
        id: "ADV_1",
        projectId: "PRJ_NINH_KIEU",
        workerId: "W01",
        amountVnd: 500000,
        date: today,
        note: "Ứng ăn sáng & xăng xe",
        signedStatus: "signed",
        signatureDataUrl: null,
        signedAt: today,
        signatureHash: "PRJ_NINH_KIEU|W01|500000|" + today
      },
      {
        id: "ADV_2",
        projectId: "PRJ_NINH_KIEU",
        workerId: "W04",
        amountVnd: 200000,
        date: today,
        note: "Gửi tiền về quê (Chưa ký)",
        signedStatus: "unsigned",
        signatureDataUrl: null,
        signedAt: null,
        signatureHash: null
      }
    ],
    materials: [
      {
        id: "MAT_1",
        projectId: "PRJ_NINH_KIEU",
        name: "Xi măng Hà Tiên",
        qty: 50,
        unit: "Bao",
        unitPrice: 92000,
        totalAmount: 4600000,
        vendor: "Đại lý VLXD Tư Thành",
        purchaseDate: "2026-10-01",
        payments: [] // Đang nợ đại lý 100%
      },
      {
        id: "MAT_2",
        projectId: "PRJ_NINH_KIEU",
        name: "Cát vàng xây tô",
        qty: 6,
        unit: "Khối (m³)",
        unitPrice: 380000,
        totalAmount: 2280000,
        vendor: "Bãi cát Sông Hậu",
        purchaseDate: today,
        payments: [
          {
            paymentId: "MPAY_INIT_1",
            amount: 2280000,
            paidDate: today,
            note: "Thanh toán tiền mặt khi giao hàng"
          }
        ]
      }
    ],
    cashTransactions: [
      {
        id: "CSH_1",
        projectId: "PRJ_NINH_KIEU",
        type: "in",
        amountVnd: 50000000,
        category: "Chủ nhà tạm ứng đợt 1",
        date: today
      },
      {
        id: "CSH_2",
        projectId: "PRJ_CAI_RANG",
        type: "in",
        amountVnd: 30000000,
        category: "Chủ nhà ứng tiền móng",
        date: today
      }
    ],
    wagePayments: [], // Giao dịch chi trả lương thực tế: { id, projectId, workerId, periodId, grossWage, advanceDeducted, netPaid, paidDate, note }
    auditLogs: []
  };
}

function migrateStore(rawStore) {
  if (!rawStore || typeof rawStore !== "object") return createDefaultStore();
  const d = { ...createDefaultStore(), ...rawStore };

  // 1. Đảm bảo mảng tồn tại
  if (!Array.isArray(d.projects)) d.projects = [];
  if (!Array.isArray(d.workers)) d.workers = [];
  if (!Array.isArray(d.attendance)) d.attendance = [];
  if (!Array.isArray(d.advances)) d.advances = [];
  if (!Array.isArray(d.materials)) d.materials = [];
  if (!Array.isArray(d.cashTransactions)) d.cashTransactions = [];
  if (!Array.isArray(d.wagePayments)) d.wagePayments = [];
  if (!Array.isArray(d.auditLogs)) d.auditLogs = [];

  // 2. Migration vật tư: chuyển đổi cấu trúc cũ sang có payments
  d.materials = d.materials.map(m => {
    const qty = Number(m.qty) || 1;
    const price = Number(m.unitPrice) || 0;
    const total = m.totalAmount || (qty * price);
    let payments = Array.isArray(m.payments) ? m.payments : [];

    // Nếu dữ liệu cũ có paidStatus === 'paid' mà payments rỗng
    if (m.paidStatus === "paid" && payments.length === 0) {
      payments = [
        {
          paymentId: "MPAY_MIG_" + (m.id || Date.now()),
          amount: total,
          paidDate: m.date || d.settings.selectedDate || getTodayVN(),
          note: "Thanh toán tiền mặt (Di chuyển từ phiên bản cũ)"
        }
      ];
    }
    return {
      id: m.id || ("MAT_" + Date.now() + "_" + Math.random().toString(36).slice(2, 6)),
      projectId: m.projectId,
      name: m.name || "Vật tư xây dựng",
      qty,
      unit: m.unit || "Bao",
      unitPrice: price,
      totalAmount: total,
      vendor: m.vendor || "Đại lý VLXD",
      purchaseDate: m.purchaseDate || m.date || getTodayVN(),
      payments
    };
  });

  // 3. Migration chấm công: đảm bảo rateSnapshot luôn tồn tại
  d.attendance = d.attendance.map(a => {
    if (a.rateSnapshot == null) {
      const w = d.workers.find(x => x.id === a.workerId);
      a.rateSnapshot = w ? w.dailyRate : 450000;
    }
    return a;
  });

  d.version = 2;
  return d;
}

// ================= STORAGE LAYER: INDEXEDDB + LOCALSTORAGE =================
class AppStorage {
  static db = null;

  static async initDB() {
    if (typeof indexedDB === "undefined") return null;
    return new Promise(resolve => {
      try {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = e => {
          const db = e.target.result;
          if (!db.objectStoreNames.contains(STORE_NAME)) {
            db.createObjectStore(STORE_NAME);
          }
        };
        req.onsuccess = e => {
          AppStorage.db = e.target.result;
          resolve(AppStorage.db);
        };
        req.onerror = () => resolve(null);
      } catch (err) {
        resolve(null);
      }
    });
  }

  static loadSync() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return createDefaultStore();
      return migrateStore(JSON.parse(raw));
    } catch (e) {
      return createDefaultStore();
    }
  }

  static async save(data) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (e) {
      console.warn("LocalStorage save warning (có thể do dung lượng ảnh ký):", e);
    }

    if (AppStorage.db) {
      try {
        const tx = AppStorage.db.transaction(STORE_NAME, "readwrite");
        tx.objectStore(STORE_NAME).put(data, "current_state");
      } catch (err) {
        console.warn("IndexedDB save error:", err);
      }
    }
  }

  static async loadFromIndexedDB() {
    if (!AppStorage.db) await AppStorage.initDB();
    if (!AppStorage.db) return null;
    return new Promise(resolve => {
      try {
        const tx = AppStorage.db.transaction(STORE_NAME, "readonly");
        const req = tx.objectStore(STORE_NAME).get("current_state");
        req.onsuccess = e => {
          if (e.target.result) resolve(migrateStore(e.target.result));
          else resolve(null);
        };
        req.onerror = () => resolve(null);
      } catch (err) {
        resolve(null);
      }
    });
  }
}

let store = AppStorage.loadSync();
let undoSnapshot = null;
let undoTimer = null;
let currentAdvanceAmount = 500000;
let activePayslipWorker = null;
let activeSupplementalAdvanceId = null;
let activeMaterialDebtMatId = null;
let activeWagePaymentWorkerId = null;

function saveStore() {
  AppStorage.save(store);
}

function matchesProject(itemProjectId) {
  const sel = store.settings.selectedProjectId;
  return sel === "ALL" || itemProjectId === sel;
}

// ================= TÍNH TOÁN TÀI CHÍNH CHUẨN XÁC =================
function calculateFinancials() {
  let totalCashIn = 0;
  let totalCashOut = 0;

  let periodCashIn = 0;
  let periodCashOut = 0;
  let periodAttendanceUnits = 0;
  let periodAdvanceTotal = 0;
  let openMaterialDebt = 0;
  let periodWagePayoutTotal = 0;
  let periodMaterialPaidTotal = 0;

  // 1. Thu chi tiền mặt từ sổ thu chi
  store.cashTransactions.forEach(tx => {
    if (!matchesProject(tx.projectId)) return;
    const amt = Number(tx.amountVnd || 0);
    if (tx.type === "in") {
      totalCashIn += amt;
      if (isInSelectedPeriod(tx.date)) periodCashIn += amt;
    } else {
      totalCashOut += amt;
      if (isInSelectedPeriod(tx.date)) periodCashOut += amt;
    }
  });

  // 2. Tiền tạm ứng (là tiền mặt xuất từ quỹ tại ngày tạm ứng)
  store.advances.forEach(adv => {
    if (!matchesProject(adv.projectId)) return;
    const amt = Number(adv.amountVnd || 0);
    totalCashOut += amt;
    if (isInSelectedPeriod(adv.date)) {
      periodCashOut += amt;
      periodAdvanceTotal += amt;
    }
  });

  // 3. Chi trả lương thực tế (quyết toán cuối kỳ)
  store.wagePayments.forEach(wp => {
    if (!matchesProject(wp.projectId)) return;
    const amt = Number(wp.netPaid || 0);
    totalCashOut += amt;
    if (isInSelectedPeriod(wp.paidDate)) {
      periodCashOut += amt;
      periodWagePayoutTotal += amt;
    }
  });

  // 4. Vật tư: Công nợ đại lý và Tiền mặt đã chi theo ngày thanh toán thực tế (paidDate)
  store.materials.forEach(mat => {
    if (!matchesProject(mat.projectId)) return;
    const totalCost = Number(mat.totalAmount || (mat.qty * mat.unitPrice) || 0);
    const paidSum = (mat.payments || []).reduce((s, p) => s + Number(p.amount || 0), 0);
    const remaining = Math.max(0, totalCost - paidSum);

    // Công nợ còn mở (KHÔNG trừ tiền mặt)
    openMaterialDebt += remaining;

    // Chi tiền mặt cho vật tư: TÍNH THEO NGÀY THỰC TRẢ (paidDate), KHÔNG lấy purchaseDate!
    (mat.payments || []).forEach(p => {
      const pAmt = Number(p.amount || 0);
      totalCashOut += pAmt;
      if (isInSelectedPeriod(p.paidDate)) {
        periodCashOut += pAmt;
        periodMaterialPaidTotal += pAmt;
      }
    });
  });

  // 5. Tổng công trong kỳ
  store.attendance.forEach(att => {
    if (!matchesProject(att.projectId)) return;
    if (isInSelectedPeriod(att.date)) {
      periodAttendanceUnits += Number(att.units || 0);
    }
  });

  return {
    cumulativeBalance: totalCashIn - totalCashOut,
    periodCashIn,
    periodCashOut,
    periodAttendanceUnits,
    periodAdvanceTotal,
    openMaterialDebt,
    periodWagePayoutTotal,
    periodMaterialPaidTotal
  };
}

// ================= RENDER TOÀN BỘ GIAO DIỆN =================
function renderAll() {
  document.documentElement.setAttribute("data-theme", store.settings.theme);
  updateThemeIcons();
  renderHeaderAndPeriod();
  renderOverviewTab();
  renderAttendanceTab();
  renderMoneyTab();
  renderProjectsTab();
  populateFormProjectSelects();
}

function updateThemeIcons() {
  const isDark = store.settings.theme === "dark";
  const sun = document.getElementById("themeIconSun");
  const moon = document.getElementById("themeIconMoon");
  if (sun && moon) {
    sun.style.display = isDark ? "none" : "block";
    moon.style.display = isDark ? "block" : "none";
  }
}

function renderHeaderAndPeriod() {
  const selId = store.settings.selectedProjectId;
  const prj = store.projects.find(p => p.id === selId);
  const nameEl = document.getElementById("headerProjectName");
  const dotEl = document.getElementById("headerProjectDot");

  if (selId === "ALL" || !prj) {
    nameEl.textContent = `Tất cả công trình (${store.projects.length})`;
    dotEl.style.background = "#117D70";
  } else {
    nameEl.textContent = prj.name;
    dotEl.style.background = prj.status === "completed" ? "#7E9592" : "#117D70";
  }

  // Nhãn hiển thị kỳ
  const labelEl = document.getElementById("currentPeriodLabel");
  const [y, m] = store.settings.selectedMonth.split("-");
  if (store.settings.periodMode === "month") {
    labelEl.textContent = `Tháng ${m}/${y}`;
  } else if (store.settings.periodMode === "year") {
    labelEl.textContent = `Năm ${y}`;
  } else {
    const week = getWeekRange(store.settings.selectedDate);
    labelEl.textContent = `Tuần (${week.displayStart} - ${week.displayEnd})`;
  }

  document.querySelectorAll(".period-tab").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.mode === store.settings.periodMode);
  });
}

function renderOverviewTab() {
  const fin = calculateFinancials();
  const hide = store.settings.hideBalance;

  document.getElementById("privacyEyeIcon").textContent = hide ? "🙈 Đang ẩn" : "👁️ Ẩn số tiền";
  document.getElementById("heroCashBalance").textContent = hide
    ? "••••••••• đ"
    : formatVND(fin.cumulativeBalance);

  document.getElementById("heroPillIn").textContent = hide
    ? "Thu: ••••••••"
    : `Thu +${formatVND(fin.periodCashIn)}`;
  document.getElementById("heroPillOut").textContent = hide
    ? "Chi: ••••••••"
    : `Chi -${formatVND(fin.periodCashOut)}`;

  const activeWorkers = store.workers.filter(w => matchesProject(w.projectId)).length;
  document.getElementById("kpiTotalAttendance").textContent = `${fin.periodAttendanceUnits} công`;
  document.getElementById("kpiWorkerCount").textContent = `${activeWorkers} thợ đang phụ trách`;

  document.getElementById("kpiAdvancesAndDebt").textContent = hide
    ? "•••••••• đ"
    : formatVND(fin.periodAdvanceTotal + fin.openMaterialDebt);
  document.getElementById("kpiDebtDetail").textContent =
    `Ứng: ${(fin.periodAdvanceTotal / 1e6).toFixed(1)}tr • Nợ VT: ${(fin.openMaterialDebt / 1e6).toFixed(1)}tr`;

  // Nhắc việc thông minh
  const unsignedList = store.advances.filter(a => matchesProject(a.projectId) && a.signedStatus === "unsigned");
  const alertsEl = document.getElementById("overviewAlerts");
  alertsEl.innerHTML = "";
  if (unsignedList.length > 0) {
    alertsEl.innerHTML = `
      <div class="notice-banner">
        <span>⚠️</span>
        <div>
          Có <strong>${unsignedList.length} phiếu ứng tiền chưa ký nhận</strong>.
          Vào mục Sổ tiền để đưa máy cho thợ ký bổ sung bằng S-Pen.
        </div>
      </div>
    `;
  }

  // Danh sách tóm tắt công trình
  const listEl = document.getElementById("overviewProjectList");
  listEl.innerHTML = store.projects.map(p => {
    const wCount = store.workers.filter(w => w.projectId === p.id).length;
    const isSel = store.settings.selectedProjectId === p.id;
    return `
      <div class="item-card" onclick="selectProject('${p.id}')" style="cursor:pointer; ${isSel ? 'border-color: var(--brand-primary); border-width: 1.5px;' : ''}">
        <div class="item-card-row">
          <div>
            <div class="item-title">${escapeHTML(p.name)}</div>
            <div class="item-sub">📍 ${escapeHTML(p.location)} • 👤 Chủ: ${escapeHTML(p.owner)} • 👷 ${wCount} thợ</div>
          </div>
          <span class="badge ${p.status === 'active' ? 'badge-green' : 'badge-amber'}">
            ${p.status === 'active' ? 'Đang làm' : 'Đã xong'}
          </span>
        </div>
      </div>
    `;
  }).join("");
}

function renderAttendanceTab() {
  const isAll = store.settings.selectedProjectId === "ALL";
  const prj = store.projects.find(p => p.id === store.settings.selectedProjectId);
  const isCompleted = prj && prj.status === "completed";

  const allBanner = document.getElementById("attendanceAllProjectsBanner");
  const closedBanner = document.getElementById("attendanceClosedProjectBanner");
  const stickyFooter = document.getElementById("attendanceStickyFooter");

  allBanner.hidden = !isAll;
  closedBanner.hidden = isAll || !isCompleted;
  stickyFooter.style.display = (isAll || isCompleted) ? "none" : "flex";

  const dateStr = store.settings.selectedDate;
  document.getElementById("attendanceDateInput").value = dateStr;
  const todayStr = getTodayVN();
  document.getElementById("attendanceDateHuman").textContent =
    dateStr === todayStr ? "Hôm nay" : `Ngày ${dateStr.split("-").reverse().join("/")}`;

  const workers = store.workers.filter(w => matchesProject(w.projectId));
  let count1 = 0, count05 = 0, count15 = 0, count0 = 0, countUnset = 0;

  const listHtml = workers.map(w => {
    const rec = store.attendance.find(
      a => a.projectId === w.projectId && a.workerId === w.id && a.date === dateStr
    );
    const val = rec ? rec.units : null;
    if (val === 1.0) count1++;
    else if (val === 0.5) count05++;
    else if (val === 1.5) count15++;
    else if (val === 0) count0++;
    else countUnset++;

    const rateShown = rec ? rec.rateSnapshot : w.dailyRate;
    const initial = escapeHTML(w.name.split(" ").slice(-1)[0]?.slice(0, 2).toUpperCase() || "TH");

    return `
      <div class="worker-att-card">
        <div class="worker-att-top">
          <div class="worker-avatar">${initial}</div>
          <div class="worker-meta">
            <div class="worker-name">${escapeHTML(w.name)}</div>
            <div class="worker-role-rate">${escapeHTML(w.role)} • ${formatVND(rateShown)}/công</div>
          </div>
          <span class="badge ${val === null ? 'badge-amber' : 'badge-green'}">
            ${val === null ? 'Chưa ghi' : val + ' công'}
          </span>
        </div>
        <div class="att-pills-group">
          <button class="att-pill-btn ${val === 1.0 ? 'active-1' : ''}" ${isCompleted ? 'disabled style="opacity:0.6;"' : ''} onclick="setWorkerAttendance('${w.id}', 1.0)">
            <strong>1.0</strong>
            <small>Đủ</small>
          </button>
          <button class="att-pill-btn ${val === 0.5 ? 'active-05' : ''}" ${isCompleted ? 'disabled style="opacity:0.6;"' : ''} onclick="setWorkerAttendance('${w.id}', 0.5)">
            <strong>0.5</strong>
            <small>Nửa</small>
          </button>
          <button class="att-pill-btn ${val === 1.5 ? 'active-15' : ''}" ${isCompleted ? 'disabled style="opacity:0.6;"' : ''} onclick="setWorkerAttendance('${w.id}', 1.5)">
            <strong>1.5</strong>
            <small>Tăng ca</small>
          </button>
          <button class="att-pill-btn ${val === 0 ? 'active-0' : ''}" ${isCompleted ? 'disabled style="opacity:0.6;"' : ''} onclick="setWorkerAttendance('${w.id}', 0)">
            <strong>0.0</strong>
            <small>Nghỉ</small>
          </button>
        </div>
      </div>
    `;
  }).join("");

  document.getElementById("attendanceWorkerList").innerHTML =
    listHtml || `<div class="item-card" style="text-align:center; padding:24px; color:var(--text-muted);">Chưa có thợ nào trong công trình này. Bấm "+ Thêm thợ" để bổ sung.</div>`;

  document.getElementById("attendanceSummaryStrip").innerHTML = `
    <span>🟢 Đủ: ${count1}</span>
    <span>🟡 Nửa: ${count05}</span>
    <span>🔵 TC: ${count15}</span>
    <span>🔴 Nghỉ: ${count0}</span>
    ${countUnset > 0 ? `<span style="color:var(--amber-warn);">⚠️ Chưa chấm: ${countUnset}</span>` : ""}
  `;
}

// Chấm công 1 chạm cho từng thợ (Lưu rateSnapshot bất biến)
window.setWorkerAttendance = function(workerId, units) {
  const w = store.workers.find(x => x.id === workerId);
  if (!w) return;
  const prj = store.projects.find(p => p.id === w.projectId);
  if (prj && prj.status === "completed") {
    showToast("Công trình này đã hoàn thành (Chỉ xem lịch sử). Không thể sửa công!");
    return;
  }

  const dateStr = store.settings.selectedDate;
  const existingIdx = store.attendance.findIndex(
    a => a.projectId === w.projectId && a.workerId === w.id && a.date === dateStr
  );

  if (existingIdx >= 0) {
    store.attendance[existingIdx].units = units;
  } else {
    store.attendance.push({
      id: "ATT_" + Date.now() + "_" + Math.random().toString(36).slice(2, 6),
      projectId: w.projectId,
      workerId: w.id,
      date: dateStr,
      units,
      rateSnapshot: w.dailyRate
    });
  }
  saveStore();
  renderAll();
};

// Điểm danh cả đội
document.getElementById("btnMarkAllFullDay").addEventListener("click", () => {
  const prjId = store.settings.selectedProjectId;
  if (prjId === "ALL") {
    showToast("Vui lòng chọn 1 công trình cụ thể trước khi điểm danh!");
    openProjectPicker();
    return;
  }

  const prj = store.projects.find(p => p.id === prjId);
  if (prj && prj.status === "completed") {
    showToast("Công trình đã đóng, không thể điểm danh!");
    return;
  }

  const dateStr = store.settings.selectedDate;
  const workers = store.workers.filter(w => w.projectId === prjId);
  if (workers.length === 0) {
    showToast("Chưa có thợ trong công trình này!");
    return;
  }

  const hasSpecial = store.attendance.some(
    a => a.projectId === prjId && a.date === dateStr && a.units !== 1.0
  );

  const executeMarkAll = () => {
    undoSnapshot = JSON.parse(JSON.stringify(store.attendance));
    workers.forEach(w => {
      const idx = store.attendance.findIndex(
        a => a.projectId === prjId && a.workerId === w.id && a.date === dateStr
      );
      if (idx >= 0) {
        store.attendance[idx].units = 1.0;
      } else {
        store.attendance.push({
          id: "ATT_" + Date.now() + "_" + w.id,
          projectId: prjId,
          workerId: w.id,
          date: dateStr,
          units: 1.0,
          rateSnapshot: w.dailyRate
        });
      }
    });
    saveStore();
    renderAll();
    showUndoSnackbar(`Đã chấm 1.0 công cho cả đội (${workers.length} thợ)`);
  };

  if (hasSpecial) {
    showCustomConfirm(
      "Ghi đè cả đội thành 1.0 công?",
      "Hôm nay đã có thợ được chấm Nửa công / Tăng ca / Nghỉ. Bạn có muốn đổi toàn bộ thành 1.0 công không?",
      executeMarkAll
    );
  } else {
    executeMarkAll();
  }
});

function showUndoSnackbar(msg) {
  const bar = document.getElementById("undoSnackbar");
  document.getElementById("undoMessage").textContent = msg;
  bar.hidden = false;
  if (undoTimer) clearTimeout(undoTimer);
  undoTimer = setTimeout(() => {
    bar.hidden = true;
  }, 7000);
}

document.getElementById("btnUndoAction").addEventListener("click", () => {
  if (undoSnapshot) {
    store.attendance = undoSnapshot;
    undoSnapshot = null;
    saveStore();
    renderAll();
  }
  document.getElementById("undoSnackbar").hidden = true;
});

// ================= SỔ TIỀN (4 PHÂN MỤC) =================
function renderMoneyTab() {
  // 1. Tạm ứng
  const advList = store.advances
    .filter(a => matchesProject(a.projectId) && isInSelectedPeriod(a.date))
    .slice()
    .reverse();

  document.getElementById("advancesHistoryList").innerHTML = advList.map(a => {
    const w = store.workers.find(x => x.id === a.workerId);
    const prj = store.projects.find(p => p.id === a.projectId);
    return `
      <div class="item-card">
        <div class="item-card-row">
          <div>
            <div class="item-title">${escapeHTML(w ? w.name : 'Thợ')} — <span style="color:var(--amber-warn); font-weight:800;">${formatVND(a.amountVnd)}</span></div>
            <div class="item-sub">🏗️ ${escapeHTML(prj ? prj.name : '')} • 📅 ${a.date} • ${escapeHTML(a.note || 'Tạm ứng')}</div>
          </div>
          <span class="badge ${a.signedStatus === 'signed' ? 'badge-green' : 'badge-amber'}">
            ${a.signedStatus === 'signed' ? '✍️ Đã ký S-Pen' : '⚠️ Chưa ký'}
          </span>
        </div>
        ${a.signedStatus === 'unsigned' ? `
          <div style="margin-top:8px;">
            <button class="btn-sign-supplement" onclick="openSupplementalSign('${a.id}')">
              ✍️ Đưa S-Pen ký bổ sung ngay
            </button>
          </div>
        ` : ''}
        ${a.signatureDataUrl ? `<div style="margin-top:8px;"><img src="${a.signatureDataUrl}" alt="Chữ ký thợ" style="height:44px; border:1px solid var(--border-card); border-radius:6px; background:#FFF; padding:2px;" /></div>` : ''}
      </div>
    `;
  }).join("") || `<div class="item-card" style="text-align:center; padding:20px; color:var(--text-muted);">Chưa có phiếu tạm ứng nào trong kỳ này.</div>`;

  // 2. Bảng lương tự động
  const workers = store.workers.filter(w => matchesProject(w.projectId));
  document.getElementById("payrollWorkerList").innerHTML = workers.map(w => {
    const prj = store.projects.find(p => p.id === w.projectId);
    const attRecords = store.attendance.filter(
      a => a.workerId === w.id && a.projectId === w.projectId && isInSelectedPeriod(a.date)
    );
    const totalUnits = attRecords.reduce((s, r) => s + Number(r.units || 0), 0);
    const grossWage = attRecords.reduce((s, r) => s + Number(r.units || 0) * Number(r.rateSnapshot || w.dailyRate), 0);

    const advRecords = store.advances.filter(
      a => a.workerId === w.id && a.projectId === w.projectId && isInSelectedPeriod(a.date)
    );
    const totalAdv = advRecords.reduce((s, r) => s + Number(r.amountVnd || 0), 0);
    const netPay = grossWage - totalAdv;

    // Kiểm tra đã thanh toán lương thực tế chưa
    const periodId = store.settings.selectedMonth;
    const paidRec = store.wagePayments.find(
      wp => wp.projectId === w.projectId && wp.workerId === w.id && wp.periodId === periodId
    );

    return `
      <div class="item-card">
        <div class="item-card-row">
          <div>
            <div class="item-title">${escapeHTML(w.name)}</div>
            <div class="item-sub">🏗️ ${escapeHTML(prj ? prj.name : '')} • ${escapeHTML(w.role)} • <strong>${totalUnits} công</strong> (${formatVND(w.dailyRate)}/công)</div>
          </div>
          <span class="badge ${paidRec ? 'badge-green' : (netPay < 0 ? 'badge-red' : 'badge-blue')}">
            ${paidRec ? '✅ Đã chi trả' : (netPay < 0 ? 'Dư ứng sang kỳ sau' : 'Chờ tất toán')}
          </span>
        </div>
        <div style="margin: 10px 0; font-size:13.5px; display:flex; justify-content:space-between; color:var(--text-secondary);">
          <span>Lương gộp: <strong>${formatVND(grossWage)}</strong></span>
          <span>Đã ứng: <strong style="color:var(--amber-warn);">-${formatVND(totalAdv)}</strong></span>
        </div>
        <div style="display:flex; justify-content:space-between; align-items:center; padding-top:10px; border-top:1px dashed var(--border-subtle);">
          <div>
            <div style="font-size:11px; font-weight:700; color:var(--text-muted); text-transform:uppercase;">
              ${netPay >= 0 ? 'Thực lĩnh còn nhận' : 'Dư ứng khấu trừ sau'}
            </div>
            <div style="font-size:20px; font-weight:800; color:${netPay >= 0 ? 'var(--brand-primary)' : 'var(--danger-debt)'}; font-variant-numeric:tabular-nums;">
              ${netPay >= 0 ? formatVND(netPay) : 'Âm ' + formatVND(Math.abs(netPay))}
            </div>
            ${paidRec ? `<small style="color:var(--brand-primary); font-size:11.5px; font-weight:600;">(Đã chi ngày ${paidRec.paidDate})</small>` : ''}
          </div>
          <div style="display:flex; gap:6px;">
            <button class="date-step-btn" onclick="openVisualPayslip('${w.id}')">📤 Phiếu Zalo</button>
            ${!paidRec && netPay > 0 ? `<button class="date-step-btn" style="background:var(--brand-primary); color:#FFF; border:none;" onclick="openWagePaymentSheet('${w.id}')">Chốt trả</button>` : ''}
          </div>
        </div>
      </div>
    `;
  }).join("") || `<div class="item-card" style="text-align:center; padding:20px; color:var(--text-muted);">Không có thợ trong công trình này.</div>`;

  // 3. Vật tư & Nợ đại lý (Hỗ trợ trả từng phần)
  const mats = store.materials.filter(m => matchesProject(m.projectId));
  document.getElementById("materialsHistoryList").innerHTML = mats.map(m => {
    const prj = store.projects.find(p => p.id === m.projectId);
    const totalCost = Number(m.totalAmount || (m.qty * m.unitPrice) || 0);
    const paidSum = (m.payments || []).reduce((s, p) => s + Number(p.amount || 0), 0);
    const remaining = Math.max(0, totalCost - paidSum);
    const isFullyPaid = remaining <= 0;

    return `
      <div class="item-card">
        <div class="item-card-row">
          <div>
            <div class="item-title">${escapeHTML(m.name)} (${m.qty} ${escapeHTML(m.unit)})</div>
            <div class="item-sub">🏗️ ${escapeHTML(prj ? prj.name : '')} • 🏪 ${escapeHTML(m.vendor)} • Nhập: ${m.purchaseDate}</div>
            <div class="item-sub">Tổng tiền: <strong>${formatVND(totalCost)}</strong> • Đã trả: <strong style="color:var(--brand-primary);">${formatVND(paidSum)}</strong></div>
          </div>
          <span class="badge ${isFullyPaid ? 'badge-green' : (paidSum > 0 ? 'badge-amber' : 'badge-red')}">
            ${isFullyPaid ? 'Đã trả hết' : (paidSum > 0 ? 'Đang trả góp' : 'Nợ 100%')}
          </span>
        </div>
        ${!isFullyPaid ? `
          <div style="margin-top:10px; display:flex; justify-content:space-between; align-items:center; background:var(--amber-soft); padding:8px 12px; border-radius:8px;">
            <span style="font-size:13px; color:var(--amber-warn); font-weight:700;">Còn nợ đại lý: ${formatVND(remaining)}</span>
            <button class="date-step-btn" style="min-height:36px; padding:0 12px; background:var(--brand-primary); color:#FFF; border:none;" onclick="openMaterialPaymentSheet('${m.id}')">
              💵 Trả tiền
            </button>
          </div>
        ` : ''}
      </div>
    `;
  }).join("") || `<div class="item-card" style="text-align:center; padding:20px; color:var(--text-muted);">Chưa ghi nhập vật tư nào.</div>`;

  // 4. Sổ quỹ thu chi tổng hợp
  renderCashflowList();
}

function renderCashflowList() {
  const listEl = document.getElementById("cashflowHistoryList");
  let allLedger = [];

  // Thu chi thủ công
  store.cashTransactions.forEach(t => {
    if (!matchesProject(t.projectId)) return;
    if (!isInSelectedPeriod(t.date)) return;
    allLedger.push({
      date: t.date,
      title: t.category,
      type: t.type,
      amount: t.amountVnd,
      source: "Sổ thu chi",
      projectId: t.projectId
    });
  });

  // Tạm ứng tiền thợ
  store.advances.forEach(a => {
    if (!matchesProject(a.projectId)) return;
    if (!isInSelectedPeriod(a.date)) return;
    const w = store.workers.find(x => x.id === a.workerId);
    allLedger.push({
      date: a.date,
      title: `Thợ ${w ? w.name : ''} tạm ứng (${a.note || 'Ứng tiền'})`,
      type: "out",
      amount: a.amountVnd,
      source: "Tạm ứng thợ",
      projectId: a.projectId
    });
  });

  // Trả tiền vật tư
  store.materials.forEach(m => {
    if (!matchesProject(m.projectId)) return;
    (m.payments || []).forEach(p => {
      if (!isInSelectedPeriod(p.paidDate)) return;
      allLedger.push({
        date: p.paidDate,
        title: `Thanh toán vật tư: ${m.name} (${m.vendor})`,
        type: "out",
        amount: p.amount,
        source: "Trả nợ vật tư",
        projectId: m.projectId
      });
    });
  });

  // Chi trả lương quyết toán
  store.wagePayments.forEach(wp => {
    if (!matchesProject(wp.projectId)) return;
    if (!isInSelectedPeriod(wp.paidDate)) return;
    const w = store.workers.find(x => x.id === wp.workerId);
    allLedger.push({
      date: wp.paidDate,
      title: `Quyết toán lương: ${w ? w.name : ''} (Kỳ ${wp.periodId})`,
      type: "out",
      amount: wp.netPaid,
      source: "Lương thợ",
      projectId: wp.projectId
    });
  });

  // Sắp xếp ngày mới nhất lên đầu
  allLedger.sort((a, b) => (b.date > a.date ? 1 : -1));

  listEl.innerHTML = allLedger.map(item => {
    const prj = store.projects.find(p => p.id === item.projectId);
    return `
      <div class="item-card">
        <div class="item-card-row">
          <div>
            <div class="item-title">${escapeHTML(item.title)}</div>
            <div class="item-sub">📅 ${item.date} • 🏗️ ${escapeHTML(prj ? prj.name : '')} • <span class="badge ${item.source === 'Sổ thu chi' ? 'badge-blue' : 'badge-amber'}">${escapeHTML(item.source)}</span></div>
          </div>
          <strong style="font-size:16.5px; font-variant-numeric:tabular-nums; color:${item.type === 'in' ? 'var(--brand-primary)' : 'var(--danger-debt)'}">
            ${item.type === 'in' ? '+' : '-'}${formatVND(item.amount)}
          </strong>
        </div>
      </div>
    `;
  }).join("") || `<div class="item-card" style="text-align:center; padding:20px; color:var(--text-muted);">Không có giao dịch dòng tiền trong kỳ này.</div>`;
}

// ================= CHI TRẢ LƯƠNG CHUẨN KẾ TOÁN =================
window.openWagePaymentSheet = function(workerId) {
  const w = store.workers.find(x => x.id === workerId);
  if (!w) return;
  activeWagePaymentWorkerId = workerId;

  const prj = store.projects.find(p => p.id === w.projectId);
  const periodId = store.settings.selectedMonth;

  // Kiểm tra chống chi trả trùng
  const alreadyPaid = store.wagePayments.find(
    wp => wp.projectId === w.projectId && wp.workerId === w.id && wp.periodId === periodId
  );
  if (alreadyPaid) {
    showToast("Lương kỳ này của thợ đã được quyết toán trước đó!");
    return;
  }

  const attRecords = store.attendance.filter(
    a => a.workerId === w.id && a.projectId === w.projectId && isInSelectedPeriod(a.date)
  );
  const totalUnits = attRecords.reduce((s, r) => s + Number(r.units || 0), 0);
  const grossWage = attRecords.reduce((s, r) => s + Number(r.units || 0) * Number(r.rateSnapshot || w.dailyRate), 0);

  const advRecords = store.advances.filter(
    a => a.workerId === w.id && a.projectId === w.projectId && isInSelectedPeriod(a.date)
  );
  const totalAdv = advRecords.reduce((s, r) => s + Number(r.amountVnd || 0), 0);
  const netPay = grossWage - totalAdv;

  if (netPay <= 0) {
    showToast("Thợ đang dư ứng " + formatVND(Math.abs(netPay)) + ". Không có số tiền cần chi trả tiền mặt!");
    return;
  }

  const box = document.getElementById("wagePaymentReviewBox");
  box.innerHTML = `
    <div class="review-row"><span class="review-label">Họ tên thợ:</span><span class="review-val">${escapeHTML(w.name)}</span></div>
    <div class="review-row"><span class="review-label">Công trình:</span><span class="review-val">${escapeHTML(prj ? prj.name : '')}</span></div>
    <div class="review-row"><span class="review-label">Kỳ quyết toán:</span><span class="review-val">${periodId}</span></div>
    <div class="review-row"><span class="review-label">Tổng công:</span><span class="review-val">${totalUnits} công</span></div>
    <div class="review-row"><span class="review-label">Lương gộp:</span><span class="review-val">${formatVND(grossWage)}</span></div>
    <div class="review-row"><span class="review-label">Khấu trừ tiền ứng:</span><span class="review-val" style="color:var(--amber-warn);">-${formatVND(totalAdv)}</span></div>
    <div class="review-row" style="padding-top:6px; border-top:1px dashed var(--border-subtle);"><span class="review-label"><strong>THỰC CHI TIỀN MẶT:</strong></span><span class="review-val" style="font-size:18px; color:var(--brand-primary);">${formatVND(netPay)}</span></div>
  `;

  document.getElementById("wagePaymentDate").value = getTodayVN();
  document.getElementById("sheetWagePayment").hidden = false;
};

document.getElementById("btnConfirmWagePayout").addEventListener("click", () => {
  if (!activeWagePaymentWorkerId) return;
  const w = store.workers.find(x => x.id === activeWagePaymentWorkerId);
  if (!w) return;

  const paidDate = document.getElementById("wagePaymentDate").value || getTodayVN();
  const note = document.getElementById("wagePaymentNote").value.trim() || "Chi trả lương";
  const periodId = store.settings.selectedMonth;

  // Tính lại số tiền
  const attRecords = store.attendance.filter(
    a => a.workerId === w.id && a.projectId === w.projectId && isInSelectedPeriod(a.date)
  );
  const grossWage = attRecords.reduce((s, r) => s + Number(r.units || 0) * Number(r.rateSnapshot || w.dailyRate), 0);

  const advRecords = store.advances.filter(
    a => a.workerId === w.id && a.projectId === w.projectId && isInSelectedPeriod(a.date)
  );
  const totalAdv = advRecords.reduce((s, r) => s + Number(r.amountVnd || 0), 0);
  const netPay = grossWage - totalAdv;

  if (netPay <= 0) return;

  store.wagePayments.push({
    id: "WPAY_" + Date.now(),
    projectId: w.projectId,
    workerId: w.id,
    periodId,
    grossWage,
    advanceDeducted: totalAdv,
    netPaid: netPay,
    paidDate,
    note
  });

  store.auditLogs.push({
    time: new Date().toISOString(),
    action: `Quyết toán chi lương ${formatVND(netPay)} cho ${w.name} (kỳ ${periodId})`
  });

  saveStore();
  document.getElementById("sheetWagePayment").hidden = true;
  renderAll();
  showToast(`Đã ghi nhận chi trả ${formatVND(netPay)} cho ${w.name}!`);
});

// ================= THANH TOÁN NỢ VẬT TƯ (TỪNG PHẦN HOẶC TOÀN BỘ) =================
window.openMaterialPaymentSheet = function(matId) {
  const mat = store.materials.find(m => m.id === matId);
  if (!mat) return;
  activeMaterialDebtMatId = matId;

  const prj = store.projects.find(p => p.id === mat.projectId);
  const totalCost = Number(mat.totalAmount || (mat.qty * mat.unitPrice) || 0);
  const paidSum = (mat.payments || []).reduce((s, p) => s + Number(p.amount || 0), 0);
  const remaining = Math.max(0, totalCost - paidSum);

  const box = document.getElementById("matPaymentReviewBox");
  box.innerHTML = `
    <div class="review-row"><span class="review-label">Vật tư:</span><span class="review-val">${escapeHTML(mat.name)}</span></div>
    <div class="review-row"><span class="review-label">Đại lý:</span><span class="review-val">${escapeHTML(mat.vendor)}</span></div>
    <div class="review-row"><span class="review-label">Công trình:</span><span class="review-val">${escapeHTML(prj ? prj.name : '')}</span></div>
    <div class="review-row"><span class="review-label">Tổng hóa đơn:</span><span class="review-val">${formatVND(totalCost)}</span></div>
    <div class="review-row"><span class="review-label">Đã thanh toán:</span><span class="review-val">${formatVND(paidSum)}</span></div>
    <div class="review-row" style="padding-top:6px; border-top:1px dashed var(--border-subtle);"><span class="review-label"><strong>CÒN NỢ ĐẠI LÝ:</strong></span><span class="review-val" style="font-size:17px; color:var(--amber-warn);">${formatVND(remaining)}</span></div>
  `;

  document.getElementById("matPaymentAmount").value = remaining;
  document.getElementById("matPaymentDate").value = getTodayVN();
  document.getElementById("matPaymentNote").value = `Thanh toán tiền vật tư ${mat.name}`;
  document.getElementById("sheetMaterialPayment").hidden = false;
};

document.getElementById("btnConfirmMaterialPayment").addEventListener("click", () => {
  if (!activeMaterialDebtMatId) return;
  const mat = store.materials.find(m => m.id === activeMaterialDebtMatId);
  if (!mat) return;

  const payAmt = Number(document.getElementById("matPaymentAmount").value);
  if (!payAmt || payAmt <= 0) {
    showToast("Vui lòng nhập số tiền thanh toán hợp lệ!");
    return;
  }

  const totalCost = Number(mat.totalAmount || (mat.qty * mat.unitPrice) || 0);
  const paidSum = (mat.payments || []).reduce((s, p) => s + Number(p.amount || 0), 0);
  const remaining = Math.max(0, totalCost - paidSum);

  if (payAmt > remaining) {
    showToast("Số tiền thanh toán vượt quá số nợ còn lại (" + formatVND(remaining) + ")!");
    return;
  }

  const paidDate = document.getElementById("matPaymentDate").value || getTodayVN();
  const note = document.getElementById("matPaymentNote").value.trim() || "Thanh toán vật tư";

  if (!Array.isArray(mat.payments)) mat.payments = [];
  mat.payments.push({
    paymentId: "MPAY_" + Date.now(),
    amount: payAmt,
    paidDate,
    note
  });

  store.auditLogs.push({
    time: new Date().toISOString(),
    action: `Thanh toán ${formatVND(payAmt)} cho đại lý ${mat.vendor} (${mat.name})`
  });

  saveStore();
  document.getElementById("sheetMaterialPayment").hidden = true;
  renderAll();
  showToast(`Đã thanh toán ${formatVND(payAmt)} cho đại lý ${mat.vendor}!`);
});

// ================= KHUNG KÝ S-PEN & PALM REJECTION & KÝ BÙ =================
const spenCanvas = document.getElementById("spenCanvas");
const spenCtx = spenCanvas ? spenCanvas.getContext("2d") : null;
let isDrawing = false;
let hasSignatureInk = false;
let activePointerType = null;

const suppCanvas = document.getElementById("spenCanvasSupplemental");
const suppCtx = suppCanvas ? suppCanvas.getContext("2d") : null;
let isSuppDrawing = false;
let hasSuppInk = false;
let activeSuppPointerType = null;

function setupCanvasPointerEvents(canvas, ctx, onDrawStart, onDrawing, onDrawEnd) {
  if (!canvas || !ctx) return;

  canvas.addEventListener("pointerdown", e => {
    try {
      canvas.setPointerCapture(e.pointerId);
    } catch (err) {}
    onDrawStart(e);
  });

  canvas.addEventListener("pointermove", e => {
    onDrawing(e);
  });

  const stop = e => {
    try {
      if (canvas.hasPointerCapture(e.pointerId)) {
        canvas.releasePointerCapture(e.pointerId);
      }
    } catch (err) {}
    onDrawEnd(e);
  };

  canvas.addEventListener("pointerup", stop);
  canvas.addEventListener("pointercancel", stop);
}

function initSpenCanvas() {
  if (!spenCtx) return;
  spenCtx.fillStyle = "#FFFFFF";
  spenCtx.fillRect(0, 0, spenCanvas.width, spenCanvas.height);
  spenCtx.strokeStyle = "#18312E";
  spenCtx.lineWidth = 2.8;
  spenCtx.lineCap = "round";
  spenCtx.lineJoin = "round";
  hasSignatureInk = false;
  activePointerType = null;
}

function initSuppCanvas() {
  if (!suppCtx) return;
  suppCtx.fillStyle = "#FFFFFF";
  suppCtx.fillRect(0, 0, suppCanvas.width, suppCanvas.height);
  suppCtx.strokeStyle = "#18312E";
  suppCtx.lineWidth = 2.8;
  suppCtx.lineCap = "round";
  suppCtx.lineJoin = "round";
  hasSuppInk = false;
  activeSuppPointerType = null;
}

if (spenCanvas) {
  setupCanvasPointerEvents(
    spenCanvas,
    spenCtx,
    e => {
      if (e.pointerType === "pen") {
        activePointerType = "pen";
        document.getElementById("spenStatusText").textContent = "🖊️ Đang nhận nét S-Pen (Đã khóa tỳ tay)";
      } else if (activePointerType === "pen" && e.pointerType === "touch") {
        return; // Palm rejection
      }
      isDrawing = true;
      hasSignatureInk = true;
      const rect = spenCanvas.getBoundingClientRect();
      const scaleX = spenCanvas.width / rect.width;
      const scaleY = spenCanvas.height / rect.height;
      spenCtx.beginPath();
      spenCtx.moveTo((e.clientX - rect.left) * scaleX, (e.clientY - rect.top) * scaleY);
    },
    e => {
      if (!isDrawing) return;
      if (activePointerType === "pen" && e.pointerType === "touch") return;
      const rect = spenCanvas.getBoundingClientRect();
      const scaleX = spenCanvas.width / rect.width;
      const scaleY = spenCanvas.height / rect.height;
      spenCtx.lineTo((e.clientX - rect.left) * scaleX, (e.clientY - rect.top) * scaleY);
      spenCtx.stroke();
    },
    () => {
      isDrawing = false;
    }
  );

  document.getElementById("btnClearSignature").addEventListener("click", () => {
    initSpenCanvas();
    document.getElementById("spenStatusText").textContent = "🖊️ Sẵn sàng nhận bút S-Pen hoặc ngón tay";
  });
}

if (suppCanvas) {
  setupCanvasPointerEvents(
    suppCanvas,
    suppCtx,
    e => {
      if (e.pointerType === "pen") {
        activeSuppPointerType = "pen";
        document.getElementById("suppSignStatusText").textContent = "🖊️ Đang nhận nét S-Pen (Đã khóa tỳ tay)";
      } else if (activeSuppPointerType === "pen" && e.pointerType === "touch") {
        return; // Palm rejection
      }
      isSuppDrawing = true;
      hasSuppInk = true;
      const rect = suppCanvas.getBoundingClientRect();
      const scaleX = suppCanvas.width / rect.width;
      const scaleY = suppCanvas.height / rect.height;
      suppCtx.beginPath();
      suppCtx.moveTo((e.clientX - rect.left) * scaleX, (e.clientY - rect.top) * scaleY);
    },
    e => {
      if (!isSuppDrawing) return;
      if (activeSuppPointerType === "pen" && e.pointerType === "touch") return;
      const rect = suppCanvas.getBoundingClientRect();
      const scaleX = suppCanvas.width / rect.width;
      const scaleY = suppCanvas.height / rect.height;
      suppCtx.lineTo((e.clientX - rect.left) * scaleX, (e.clientY - rect.top) * scaleY);
      suppCtx.stroke();
    },
    () => {
      isSuppDrawing = false;
    }
  );

  document.getElementById("btnSuppClearSignature").addEventListener("click", () => {
    initSuppCanvas();
    document.getElementById("suppSignStatusText").textContent = "🖊️ Sẵn sàng nhận bút S-Pen hoặc ngón tay";
  });
}

// ================= KÝ BÙ PHIẾU CHƯA KÝ =================
window.openSupplementalSign = function(advanceId) {
  const adv = store.advances.find(a => a.id === advanceId);
  if (!adv) return;
  activeSupplementalAdvanceId = advanceId;

  const w = store.workers.find(x => x.id === adv.workerId);
  const prj = store.projects.find(p => p.id === adv.projectId);

  const box = document.getElementById("suppSignInfoBox");
  box.innerHTML = `
    <div class="review-row"><span class="review-label">Thợ nhận tiền:</span><span class="review-val">${escapeHTML(w ? w.name : '')}</span></div>
    <div class="review-row"><span class="review-label">Công trình:</span><span class="review-val">${escapeHTML(prj ? prj.name : '')}</span></div>
    <div class="review-row"><span class="review-label">Số tiền:</span><span class="review-val" style="color:var(--amber-warn); font-size:16px;">${formatVND(adv.amountVnd)}</span></div>
    <div class="review-row"><span class="review-label">Ngày ứng:</span><span class="review-val">${adv.date}</span></div>
    <div class="review-row"><span class="review-label">Ghi chú:</span><span class="review-val">${escapeHTML(adv.note || '')}</span></div>
  `;

  document.getElementById("suppSignLiveBanner").textContent =
    `Ký bổ sung: ${w ? w.name : 'Thợ'} — ${formatVND(adv.amountVnd)}`;

  initSuppCanvas();
  document.getElementById("sheetSupplementalSign").hidden = false;
};

document.getElementById("btnSaveSupplementalSign").addEventListener("click", () => {
  if (!activeSupplementalAdvanceId) return;
  const adv = store.advances.find(a => a.id === activeSupplementalAdvanceId);
  if (!adv) return;

  if (!hasSuppInk) {
    showToast("Vui lòng ký tên vào khung trước khi lưu!");
    return;
  }

  const nowIso = new Date().toISOString();
  adv.signedStatus = "signed";
  adv.signatureDataUrl = suppCanvas.toDataURL("image/png");
  adv.signedAt = nowIso;
  adv.signatureHash = `${adv.projectId}|${adv.workerId}|${adv.amountVnd}|${adv.date}|${nowIso}`;

  store.auditLogs.push({
    time: nowIso,
    action: `Ký bổ sung phiếu ứng tiền ${formatVND(adv.amountVnd)} của thợ ${adv.workerId}`
  });

  saveStore();
  document.getElementById("sheetSupplementalSign").hidden = true;
  renderAll();
  showToast("Đã bổ sung chữ ký S-Pen thành công!");
});

// ================= FORM TẠM ỨNG TIỀN MỚI =================
function updateAdvanceMoneyUI() {
  document.getElementById("advAmountFormatted").textContent = formatVND(currentAdvanceAmount);
  document.getElementById("advAmountWords").textContent = readMoneyVietnamese(currentAdvanceAmount);
  const workerSel = document.getElementById("advWorkerSelect");
  const wName = workerSel.options[workerSel.selectedIndex]?.text || "Thợ";
  document.getElementById("spenLiveBanner").textContent =
    `Ký nhận ứng tiền: ${wName} — ${formatVND(currentAdvanceAmount)}`;
}

function populateFormProjectSelects() {
  const activeProjects = store.projects.filter(p => p.status === "active");
  const optionsHtml = activeProjects.map(p =>
    `<option value="${p.id}" ${p.id === store.settings.selectedProjectId ? 'selected' : ''}>${escapeHTML(p.name)}</option>`
  ).join("");

  ["advProjectSelect", "matProjectSelect", "newWorkerProjectSelect", "cashInProjectSelect", "cashOutProjectSelect"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = optionsHtml;
  });

  updateAdvanceWorkerOptions();
}

function updateAdvanceWorkerOptions() {
  const prjId = document.getElementById("advProjectSelect")?.value || store.settings.selectedProjectId;
  const workers = store.workers.filter(w => prjId === "ALL" ? true : w.projectId === prjId);
  const sel = document.getElementById("advWorkerSelect");
  if (sel) {
    sel.innerHTML = workers.map(w => `<option value="${w.id}">${escapeHTML(w.name)} (${escapeHTML(w.role)})</option>`).join("") ||
      `<option value="">(Chưa có thợ nào trong công trình này)</option>`;
  }
}

document.getElementById("advProjectSelect")?.addEventListener("change", () => {
  updateAdvanceWorkerOptions();
  updateAdvanceMoneyUI();
});

function openAdvanceSheet() {
  populateFormProjectSelects();
  const workerSel = document.getElementById("advWorkerSelect");
  if (!workerSel || !workerSel.value) {
    showToast("Vui lòng tạo thợ cho công trình trước khi tạm ứng!");
    return;
  }
  currentAdvanceAmount = 500000;
  document.getElementById("advDateInput").value = getTodayVN();
  document.getElementById("chkAllowUnsigned").checked = false;
  initSpenCanvas();
  updateAdvanceMoneyUI();
  document.getElementById("sheetAdvanceForm").hidden = false;
}

document.getElementById("btnOpenAdvanceSheet").addEventListener("click", openAdvanceSheet);
document.getElementById("btnQuickAdvance").addEventListener("click", () => {
  switchMainTab("tab-money");
  openAdvanceSheet();
});
document.getElementById("advWorkerSelect").addEventListener("change", updateAdvanceMoneyUI);

document.querySelectorAll(".money-chip").forEach(chip => {
  chip.addEventListener("click", () => {
    currentAdvanceAmount += Number(chip.dataset.add);
    updateAdvanceMoneyUI();
  });
});

document.querySelectorAll(".custom-numpad button").forEach(btn => {
  btn.addEventListener("click", () => {
    const key = btn.dataset.digit;
    let str = String(currentAdvanceAmount);
    if (key === "BS") {
      str = str.length > 1 ? str.slice(0, -1) : "0";
    } else if (key === "000") {
      str = str === "0" ? "0" : str + "000";
    } else {
      str = str === "0" ? key : str + key;
    }
    currentAdvanceAmount = Math.min(Number(str), 500000000);
    updateAdvanceMoneyUI();
  });
});

document.getElementById("btnSaveAdvance").addEventListener("click", () => {
  const workerId = document.getElementById("advWorkerSelect").value;
  const w = store.workers.find(x => x.id === workerId);
  if (!w) {
    showToast("Vui lòng chọn thợ!");
    return;
  }

  const allowUnsigned = document.getElementById("chkAllowUnsigned").checked;
  if (!hasSignatureInk && !allowUnsigned) {
    showToast("Vui lòng đưa bút S-Pen cho thợ ký tên, hoặc tích chọn 'Chưa ký'!");
    return;
  }

  const advDate = document.getElementById("advDateInput").value || getTodayVN();
  const sigUrl = hasSignatureInk ? spenCanvas.toDataURL("image/png") : null;
  const nowIso = new Date().toISOString();

  store.advances.push({
    id: "ADV_" + Date.now(),
    projectId: w.projectId,
    workerId: w.id,
    amountVnd: currentAdvanceAmount,
    date: advDate,
    note: document.getElementById("advNoteInput").value.trim() || "Tạm ứng tiền",
    signedStatus: hasSignatureInk ? "signed" : "unsigned",
    signatureDataUrl: sigUrl,
    signedAt: hasSignatureInk ? nowIso : null,
    signatureHash: hasSignatureInk ? `${w.projectId}|${w.id}|${currentAdvanceAmount}|${advDate}|${nowIso}` : null
  });

  saveStore();
  document.getElementById("sheetAdvanceForm").hidden = true;
  renderAll();
  showToast(`Đã lưu phiếu ứng ${formatVND(currentAdvanceAmount)} cho ${w.name}!`);
});

// ================= PHIẾU LƯƠNG ẢNH ĐỐI SOÁT (ZALO SHARING) =================
window.openVisualPayslip = function(workerId) {
  const w = store.workers.find(x => x.id === workerId);
  if (!w) return;
  activePayslipWorker = w;

  const prj = store.projects.find(p => p.id === w.projectId);
  const attRecords = store.attendance.filter(
    a => a.workerId === w.id && a.projectId === w.projectId && isInSelectedPeriod(a.date)
  );
  const advRecords = store.advances.filter(
    a => a.workerId === w.id && a.projectId === w.projectId && isInSelectedPeriod(a.date)
  );

  const totalUnits = attRecords.reduce((s, r) => s + Number(r.units || 0), 0);
  const grossWage = attRecords.reduce((s, r) => s + Number(r.units || 0) * Number(r.rateSnapshot || w.dailyRate), 0);
  const totalAdv = advRecords.reduce((s, r) => s + Number(r.amountVnd || 0), 0);
  const netPay = grossWage - totalAdv;

  const canvas = document.getElementById("payslipRenderCanvas");
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Header xanh công trình
  ctx.fillStyle = "#117D70";
  ctx.fillRect(0, 0, canvas.width, 110);
  ctx.fillStyle = "#FFFFFF";
  ctx.font = "bold 26px sans-serif";
  ctx.fillText("PHIẾU QUYẾT TOÁN LƯƠNG THỢ", 30, 48);
  ctx.font = "16px sans-serif";
  ctx.fillText(`Công trình: ${prj ? prj.name : 'Xây dựng'} • Kỳ: ${store.settings.selectedMonth}`, 30, 82);

  // Thông tin thợ
  ctx.fillStyle = "#18312E";
  ctx.font = "bold 22px sans-serif";
  ctx.fillText(`Họ tên thợ: ${w.name}`, 30, 160);
  ctx.font = "16px sans-serif";
  ctx.fillStyle = "#4A6360";
  ctx.fillText(`Vai trò: ${w.role}  |  Đơn giá: ${formatVND(w.dailyRate)}/công`, 30, 192);

  // Khung tổng kết công
  ctx.fillStyle = "#F5F7F6";
  ctx.fillRect(30, 215, canvas.width - 60, 125);
  ctx.strokeStyle = "#DFE5E3";
  ctx.strokeRect(30, 215, canvas.width - 60, 125);

  ctx.fillStyle = "#18312E";
  ctx.font = "bold 18px sans-serif";
  ctx.fillText(`1. Tổng ngày công trong kỳ: ${totalUnits} công`, 50, 255);
  ctx.fillText(`2. Lương gộp thành tiền: ${formatVND(grossWage)}`, 50, 290);
  ctx.fillStyle = "#A36A16";
  ctx.fillText(`3. Tổng tạm ứng: -${formatVND(totalAdv)} (${advRecords.length} lần)`, 50, 325);

  // Chi tiết tạm ứng
  ctx.fillStyle = "#18312E";
  ctx.font = "bold 17px sans-serif";
  ctx.fillText("Chi tiết các khoản tạm ứng:", 30, 380);

  let yPos = 415;
  if (advRecords.length === 0) {
    ctx.font = "16px sans-serif";
    ctx.fillStyle = "#7E9592";
    ctx.fillText("Không có khoản tạm ứng nào trong kỳ này.", 50, yPos);
  } else {
    advRecords.slice(0, 4).forEach(adv => {
      ctx.font = "15px sans-serif";
      ctx.fillStyle = "#18312E";
      const statusTxt = adv.signedStatus === "signed" ? "[Đã ký S-Pen]" : "[Chưa ký]";
      ctx.fillText(`• Ngày ${adv.date}: ${formatVND(adv.amountVnd)} (${adv.note}) ${statusTxt}`, 40, yPos);
      yPos += 30;
    });
  }

  // Khung thực lĩnh
  ctx.fillStyle = "#D9F3EB";
  ctx.fillRect(30, 650, canvas.width - 60, 120);
  ctx.strokeStyle = "#117D70";
  ctx.lineWidth = 2.5;
  ctx.strokeRect(30, 650, canvas.width - 60, 120);

  ctx.fillStyle = "#0E685D";
  ctx.font = "bold 18px sans-serif";
  ctx.fillText("THỰC LĨNH CÒN NHẬN:", 50, 690);
  ctx.font = "bold 36px sans-serif";
  ctx.fillText(netPay >= 0 ? formatVND(netPay) : "Dư ứng " + formatVND(Math.abs(netPay)), 50, 740);

  document.getElementById("sheetPayslipPreview").hidden = false;
};

document.getElementById("btnSharePayslipImage").addEventListener("click", async () => {
  const canvas = document.getElementById("payslipRenderCanvas");
  canvas.toBlob(async blob => {
    if (!blob) return;
    const file = new File([blob], `Phieu_Luong_${activePayslipWorker?.name || 'Tho'}.png`, { type: "image/png" });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({
          title: "Phiếu Lương Công Trình",
          text: `Phiếu lương của ${activePayslipWorker?.name || ''}`,
          files: [file]
        });
        return;
      } catch (e) {}
    }
    downloadCanvasImage(canvas);
  });
});

function downloadCanvasImage(canvas) {
  const a = document.createElement("a");
  a.href = canvas.toDataURL("image/png");
  a.download = `Phieu_Luong_${activePayslipWorker?.name || 'Tho'}.png`;
  a.click();
}

document.getElementById("btnDownloadPayslipPng").addEventListener("click", () => {
  downloadCanvasImage(document.getElementById("payslipRenderCanvas"));
});

document.getElementById("btnCopyPayslipText").addEventListener("click", () => {
  if (!activePayslipWorker) return;
  const w = activePayslipWorker;
  const msg = `[PHIẾU LƯƠNG CÔNG TRÌNH]\nThợ: ${w.name}\nĐơn giá: ${formatVND(w.dailyRate)}/công\nKỳ: ${store.settings.selectedMonth}\nĐã đối soát trên Sổ Công Trình GridCraft.`;
  navigator.clipboard?.writeText(msg);
  showToast("Đã sao chép nội dung phiếu! Bạn có thể dán vào Zalo.");
});

// ================= QUẢN LÝ CÔNG TRÌNH =================
function renderProjectsTab() {
  const q = (document.getElementById("projectSearchInput")?.value || "").toLowerCase();
  const filterBtn = document.querySelector(".filter-chips .chip.active");
  const pstatus = filterBtn?.dataset.pstatus || "all";

  const list = store.projects.filter(p => {
    const matchText = p.name.toLowerCase().includes(q) ||
                      p.owner.toLowerCase().includes(q) ||
                      p.location.toLowerCase().includes(q);
    const matchStatus = pstatus === "all" || p.status === pstatus;
    return matchText && matchStatus;
  });

  document.getElementById("projectsManageList").innerHTML = list.map(p => {
    const wCount = store.workers.filter(w => w.projectId === p.id).length;
    return `
      <div class="item-card">
        <div class="item-card-row">
          <div>
            <div class="item-title">${escapeHTML(p.name)}</div>
            <div class="item-sub">👤 Chủ: ${escapeHTML(p.owner)} • 📍 ${escapeHTML(p.location)}</div>
            <div class="item-sub">📅 Khởi công: ${p.startDate} • 👷 ${wCount} thợ</div>
          </div>
          <span class="badge ${p.status === 'active' ? 'badge-green' : 'badge-amber'}">
            ${p.status === 'active' ? 'Đang làm' : 'Đã xong'}
          </span>
        </div>
        <div style="display:flex; gap:8px; margin-top:12px;">
          <button class="date-step-btn" style="flex:1; background:var(--brand-primary); color:#FFF; border:none;" onclick="selectProject('${p.id}')">🎯 Chọn làm việc</button>
          <button class="date-step-btn" onclick="toggleProjectArchive('${p.id}')">
            ${p.status === 'active' ? '🔒 Đóng công trình' : '🔓 Mở lại'}
          </button>
        </div>
      </div>
    `;
  }).join("") || `<div class="item-card" style="text-align:center; padding:20px; color:var(--text-muted);">Không tìm thấy công trình phù hợp.</div>`;
}

window.selectProject = function(prjId) {
  store.settings.selectedProjectId = prjId;
  saveStore();
  document.getElementById("sheetProjectPicker").hidden = true;
  renderAll();
  showToast("Đã chọn công trình!");
};

window.toggleProjectArchive = function(prjId) {
  const p = store.projects.find(x => x.id === prjId);
  if (!p) return;
  p.status = p.status === "active" ? "completed" : "active";
  store.auditLogs.push({
    time: new Date().toISOString(),
    action: `Đổi trạng thái công trình ${p.name} sang ${p.status}`
  });
  saveStore();
  renderAll();
};

function openProjectPicker() {
  const container = document.getElementById("projectPickerList");
  const isAll = store.settings.selectedProjectId === "ALL";
  let html = `
    <div class="item-card" onclick="selectProject('ALL')" style="cursor:pointer; ${isAll ? 'border-color:var(--brand-primary); border-width:2px;' : ''}">
      <div class="item-title">🌐 Xem Tất Cả Công Trình (${store.projects.length})</div>
      <div class="item-sub">Tổng hợp dòng tiền, thợ và công nợ trên toàn bộ dự án</div>
    </div>
  `;
  html += store.projects.map(p => {
    const active = store.settings.selectedProjectId === p.id;
    return `
      <div class="item-card" onclick="selectProject('${p.id}')" style="cursor:pointer; ${active ? 'border-color:var(--brand-primary); border-width:2px;' : ''}">
        <div class="item-card-row">
          <div>
            <div class="item-title">${escapeHTML(p.name)}</div>
            <div class="item-sub">${escapeHTML(p.location)} • Chủ: ${escapeHTML(p.owner)}</div>
          </div>
          <span class="badge ${p.status === 'active' ? 'badge-green' : 'badge-amber'}">
            ${p.status === 'active' ? 'Đang làm' : 'Đã xong'}
          </span>
        </div>
      </div>
    `;
  }).join("");
  container.innerHTML = html;
  document.getElementById("sheetProjectPicker").hidden = false;
}

document.getElementById("btnOpenProjectSheet").addEventListener("click", openProjectPicker);
document.getElementById("btnPickProjectForAtt").addEventListener("click", openProjectPicker);

// Tạo công trình mới
document.getElementById("btnOpenNewProjectSheet")?.addEventListener("click", () => {
  document.getElementById("newPrjName").value = "";
  document.getElementById("newPrjOwner").value = "";
  document.getElementById("newPrjLocation").value = "";
  document.getElementById("newPrjStartDate").value = getTodayVN();
  document.getElementById("sheetNewProjectForm").hidden = false;
});

document.getElementById("btnSubmitNewProject")?.addEventListener("click", () => {
  const name = document.getElementById("newPrjName").value.trim();
  if (!name) {
    showToast("Vui lòng nhập tên công trình!");
    return;
  }
  const owner = document.getElementById("newPrjOwner").value.trim() || "Chủ nhà";
  const location = document.getElementById("newPrjLocation").value.trim() || "Cần Thơ";
  const startDate = document.getElementById("newPrjStartDate").value || getTodayVN();

  const newPrj = {
    id: "PRJ_" + Date.now(),
    name,
    owner,
    location,
    status: "active",
    startDate
  };
  store.projects.push(newPrj);
  store.settings.selectedProjectId = newPrj.id;
  saveStore();
  document.getElementById("sheetNewProjectForm").hidden = true;
  renderAll();
  showToast(`Đã tạo công trình "${name}"!`);
});

// Thêm thợ mới
document.getElementById("btnOpenAddWorkerModal")?.addEventListener("click", () => {
  populateFormProjectSelects();
  document.getElementById("newWorkerName").value = "";
  document.getElementById("newWorkerRate").value = "450000";
  document.getElementById("sheetNewWorkerForm").hidden = false;
});

document.getElementById("btnSubmitNewWorker")?.addEventListener("click", () => {
  const name = document.getElementById("newWorkerName").value.trim();
  if (!name) {
    showToast("Vui lòng nhập họ tên thợ!");
    return;
  }
  const prjId = document.getElementById("newWorkerProjectSelect").value;
  if (!prjId) {
    showToast("Vui lòng chọn công trình phân công cho thợ!");
    return;
  }

  const role = document.getElementById("newWorkerRole").value;
  const rate = Number(document.getElementById("newWorkerRate").value) || 450000;

  store.workers.push({
    id: "W" + (store.workers.length + 1) + "_" + Date.now().toString(36).slice(-4),
    name,
    role,
    dailyRate: rate,
    projectId: prjId
  });
  saveStore();
  document.getElementById("sheetNewWorkerForm").hidden = true;
  renderAll();
  showToast(`Đã thêm thợ "${name}"!`);
});

// Thu chi tiền mặt
document.getElementById("btnOpenCashInSheet")?.addEventListener("click", () => {
  populateFormProjectSelects();
  document.getElementById("cashInDate").value = getTodayVN();
  document.getElementById("sheetCashInForm").hidden = false;
});

document.getElementById("btnSubmitCashIn")?.addEventListener("click", () => {
  const prjId = document.getElementById("cashInProjectSelect").value;
  if (!prjId) {
    showToast("Vui lòng chọn công trình!");
    return;
  }
  const amount = Number(document.getElementById("cashInAmount").value);
  if (!amount || amount <= 0) {
    showToast("Vui lòng nhập số tiền hợp lệ!");
    return;
  }
  const date = document.getElementById("cashInDate").value || getTodayVN();
  const note = document.getElementById("cashInNote").value.trim() || "Chủ nhà tạm ứng";

  store.cashTransactions.push({
    id: "CSH_" + Date.now(),
    projectId: prjId,
    type: "in",
    amountVnd: amount,
    category: note,
    date
  });
  saveStore();
  document.getElementById("sheetCashInForm").hidden = true;
  renderAll();
  showToast(`Đã lưu khoản thu ${formatVND(amount)}!`);
});

document.getElementById("btnOpenCashOutSheet")?.addEventListener("click", () => {
  populateFormProjectSelects();
  document.getElementById("cashOutDate").value = getTodayVN();
  document.getElementById("sheetCashOutForm").hidden = false;
});

document.getElementById("btnSubmitCashOut")?.addEventListener("click", () => {
  const prjId = document.getElementById("cashOutProjectSelect").value;
  if (!prjId) {
    showToast("Vui lòng chọn công trình!");
    return;
  }
  const amount = Number(document.getElementById("cashOutAmount").value);
  if (!amount || amount <= 0) {
    showToast("Vui lòng nhập số tiền chi!");
    return;
  }
  const date = document.getElementById("cashOutDate").value || getTodayVN();
  const note = document.getElementById("cashOutNote").value.trim() || "Chi phí phát sinh";

  store.cashTransactions.push({
    id: "CSH_" + Date.now(),
    projectId: prjId,
    type: "out",
    amountVnd: amount,
    category: note,
    date
  });
  saveStore();
  document.getElementById("sheetCashOutForm").hidden = true;
  renderAll();
  showToast(`Đã lưu chi phí ${formatVND(amount)}!`);
});

// Nhập vật tư
document.getElementById("btnOpenMaterialSheet").addEventListener("click", () => {
  populateFormProjectSelects();
  document.getElementById("matPurchaseDate").value = getTodayVN();
  document.getElementById("sheetMaterialForm").hidden = false;
});

document.getElementById("btnSaveMaterial").addEventListener("click", () => {
  const prjId = document.getElementById("matProjectSelect").value;
  if (!prjId) {
    showToast("Vui lòng chọn công trình!");
    return;
  }

  const name = document.getElementById("matNameInput").value.trim() || "Vật tư xây dựng";
  const qty = Number(document.getElementById("matQtyInput").value) || 1;
  const unit = document.getElementById("matUnitSelect").value;
  const price = Number(document.getElementById("matPriceInput").value) || 0;
  const total = qty * price;
  const vendor = document.getElementById("matVendorInput").value.trim() || "Đại lý VLXD";
  const pDate = document.getElementById("matPurchaseDate").value || getTodayVN();
  const initPaid = document.getElementById("matPaidStatus").value;

  let initialPayments = [];
  if (initPaid === "paid") {
    initialPayments.push({
      paymentId: "MPAY_" + Date.now(),
      amount: total,
      paidDate: pDate,
      note: "Thanh toán tiền mặt ngay lúc nhận hàng"
    });
  }

  store.materials.push({
    id: "MAT_" + Date.now(),
    projectId: prjId,
    name,
    qty,
    unit,
    unitPrice: price,
    totalAmount: total,
    vendor,
    purchaseDate: pDate,
    payments: initialPayments
  });

  saveStore();
  document.getElementById("sheetMaterialForm").hidden = true;
  renderAll();
  showToast(`Đã lưu phiếu vật tư: ${name}!`);
});

// ================= XUẤT EXCEL .XLSX ĐA SHEET & NHẬP SAO LƯU =================
document.getElementById("btnExportExcel").addEventListener("click", () => {
  if (typeof XLSX === "undefined") {
    exportBackupJson();
    return;
  }
  const wb = XLSX.utils.book_new();

  // 1. Sheet Tổng quan tồn quỹ
  const fin = calculateFinancials();
  const summaryData = [
    { Chỉ_Tiêu: "Tồn quỹ tiền mặt lũy kế", Giá_Trị_VND: fin.cumulativeBalance },
    { Chỉ_Tiêu: "Tổng thu trong kỳ", Giá_Trị_VND: fin.periodCashIn },
    { Chỉ_Tiêu: "Tổng chi trong kỳ", Giá_Trị_VND: fin.periodCashOut },
    { Chỉ_Tiêu: "Tổng ngày công trong kỳ", Giá_Trị_VND: fin.periodAttendanceUnits },
    { Chỉ_Tiêu: "Tổng tiền ứng trong kỳ", Giá_Trị_VND: fin.periodAdvanceTotal },
    { Chỉ_Tiêu: "Công nợ vật tư còn mở", Giá_Trị_VND: fin.openMaterialDebt }
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summaryData), "TongQuan_TonQuy");

  // 2. Sheet Danh sách công trình
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(store.projects), "DanhSach_CongTrinh");

  // 3. Sheet Danh sách thợ
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(store.workers), "DoiTho");

  // 4. Sheet Chấm công
  const attExport = store.attendance.map(a => {
    const w = store.workers.find(x => x.id === a.workerId);
    const p = store.projects.find(x => x.id === a.projectId);
    return {
      Ngay: a.date,
      CongTrinh: p ? p.name : a.projectId,
      Tho: w ? w.name : a.workerId,
      SoCong: a.units,
      DonGiaSnapshot: a.rateSnapshot,
      ThanhTien: (Number(a.units || 0) * Number(a.rateSnapshot || 0))
    };
  });
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(attExport), "ChamCong");

  // 5. Sheet Tạm ứng
  const advExport = store.advances.map(a => {
    const w = store.workers.find(x => x.id === a.workerId);
    const p = store.projects.find(x => x.id === a.projectId);
    return {
      Ngay: a.date,
      CongTrinh: p ? p.name : a.projectId,
      Tho: w ? w.name : a.workerId,
      SoTienUng: a.amountVnd,
      LyDo: a.note,
      TrangThaiKy: a.signedStatus === "signed" ? "Đã ký S-Pen" : "Chưa ký",
      MaHash: a.signatureHash || ""
    };
  });
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(advExport), "TamUng_ChuKy");

  // 6. Sheet Bảng lương quyết toán
  const wageExport = store.wagePayments.map(wp => {
    const w = store.workers.find(x => x.id === wp.workerId);
    const p = store.projects.find(x => x.id === wp.projectId);
    return {
      KyLuong: wp.periodId,
      CongTrinh: p ? p.name : wp.projectId,
      Tho: w ? w.name : wp.workerId,
      LuongGop: wp.grossWage,
      DaKhauTruUng: wp.advanceDeducted,
      ThucLinhDaChi: wp.netPaid,
      NgayChiTien: wp.paidDate,
      GhiChu: wp.note
    };
  });
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(wageExport), "BangLuong_QuyetToan");

  // 7. Sheet Vật tư và Công nợ
  const matExport = store.materials.map(m => {
    const p = store.projects.find(x => x.id === m.projectId);
    const total = Number(m.totalAmount || (m.qty * m.unitPrice) || 0);
    const paidSum = (m.payments || []).reduce((s, pay) => s + Number(pay.amount || 0), 0);
    return {
      NgayNhap: m.purchaseDate,
      CongTrinh: p ? p.name : m.projectId,
      VatTu: m.name,
      SoLuong: m.qty,
      DonVi: m.unit,
      DonGia: m.unitPrice,
      TongTien: total,
      DaThanhToan: paidSum,
      ConNo: Math.max(0, total - paidSum),
      DaiLy: m.vendor
    };
  });
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(matExport), "VatTu_CongNo");

  // 8. Sổ quỹ tiền mặt chi tiết
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(store.cashTransactions), "SoQuy_TienMat");

  XLSX.writeFile(wb, `So_Cong_Trinh_GridCraft_${store.settings.selectedDate}.xlsx`);
  showToast("Đã xuất file Excel .xlsx thành công!");
});

function exportBackupJson() {
  const blob = new Blob([JSON.stringify(store, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `SaoLuu_SoCongTrinh_${store.settings.selectedDate}.json`;
  a.click();
  showToast("Đã tải bản sao lưu JSON!");
}

document.getElementById("btnBackupRestore").addEventListener("click", exportBackupJson);

// Nhập sao lưu (Import Backup JSON)
const backupInput = document.getElementById("inputBackupFile");
document.getElementById("btnImportBackup")?.addEventListener("click", () => {
  backupInput.click();
});

backupInput?.addEventListener("change", e => {
  const file = e.target.files?.[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = evt => {
    try {
      const parsed = JSON.parse(evt.target.result);
      if (!parsed || typeof parsed !== "object") throw new Error("File không đúng cấu trúc!");
      if (!Array.isArray(parsed.projects) || !Array.isArray(parsed.workers)) {
        throw new Error("Tệp sao lưu thiếu danh mục công trình hoặc đội thợ!");
      }

      showCustomConfirm(
        "Khôi phục dữ liệu từ sao lưu?",
        `Tệp sao lưu chứa ${parsed.projects.length} công trình và ${parsed.workers.length} thợ. Dữ liệu hiện tại sẽ được cập nhật. Bạn có chắc chắn muốn khôi phục?`,
        () => {
          store = migrateStore(parsed);
          saveStore();
          renderAll();
          showToast("Đã khôi phục dữ liệu sao lưu thành công!");
        }
      );
    } catch (err) {
      alert("Lỗi nhập tệp sao lưu: " + err.message);
    }
    backupInput.value = "";
  };
  reader.readAsText(file);
});

// ================= CUSTOM CONFIRM DIALOG & TOAST =================
let confirmCallback = null;
function showCustomConfirm(title, msg, onConfirm) {
  document.getElementById("confirmDialogTitle").textContent = title;
  document.getElementById("confirmDialogMsg").textContent = msg;
  confirmCallback = onConfirm;
  document.getElementById("sheetConfirmDialog").hidden = false;
}

document.getElementById("btnConfirmAccept").addEventListener("click", () => {
  document.getElementById("sheetConfirmDialog").hidden = true;
  if (confirmCallback) {
    confirmCallback();
    confirmCallback = null;
  }
});

document.getElementById("btnConfirmReject").addEventListener("click", () => {
  document.getElementById("sheetConfirmDialog").hidden = true;
  confirmCallback = null;
});

document.getElementById("btnConfirmCancel").addEventListener("click", () => {
  document.getElementById("sheetConfirmDialog").hidden = true;
  confirmCallback = null;
});

function showToast(msg) {
  showUndoSnackbar(msg);
  document.getElementById("btnUndoAction").style.display = "none";
  setTimeout(() => {
    document.getElementById("btnUndoAction").style.display = "inline-block";
  }, 3500);
}

// ================= ĐIỀU HƯỚNG TABS & BỘ LỌC =================
function switchMainTab(tabId) {
  document.querySelectorAll(".tab-pane").forEach(p => p.classList.toggle("active", p.id === tabId));
  document.querySelectorAll(".nav-item").forEach(b => b.classList.toggle("active", b.dataset.tab === tabId));
  window.scrollTo({ top: 0, behavior: "smooth" });
}

document.querySelectorAll(".nav-item").forEach(btn => {
  btn.addEventListener("click", () => switchMainTab(btn.dataset.tab));
});

document.querySelectorAll(".subtab-pill").forEach(pill => {
  pill.addEventListener("click", () => {
    document.querySelectorAll(".subtab-pill").forEach(p => p.classList.remove("active"));
    document.querySelectorAll(".subtab-content").forEach(c => c.classList.remove("active"));
    pill.classList.add("active");
    document.getElementById("subtab-" + pill.dataset.subtab).classList.add("active");
  });
});

// Đóng sheet khi bấm nút close hoặc click vào backdrop bên ngoài sheet
document.querySelectorAll("[data-close]").forEach(btn => {
  btn.addEventListener("click", () => {
    document.getElementById(btn.dataset.close).hidden = true;
  });
});

document.querySelectorAll(".sheet-backdrop").forEach(bd => {
  bd.addEventListener("click", e => {
    if (e.target === bd) {
      bd.hidden = true;
    }
  });
});

document.getElementById("btnTogglePrivacy").addEventListener("click", () => {
  store.settings.hideBalance = !store.settings.hideBalance;
  saveStore();
  renderOverviewTab();
});

document.getElementById("btnThemeToggle").addEventListener("click", () => {
  store.settings.theme = store.settings.theme === "light" ? "dark" : "light";
  saveStore();
  renderAll();
});

document.getElementById("btnQuickAttendance").addEventListener("click", () => {
  switchMainTab("tab-attendance");
});

// Chuyển ngày chấm công
function stepDate(days) {
  const [y, m, d] = store.settings.selectedDate.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + days);
  const yr = dt.getFullYear();
  const mo = String(dt.getMonth() + 1).padStart(2, "0");
  const da = String(dt.getDate()).padStart(2, "0");
  store.settings.selectedDate = `${yr}-${mo}-${da}`;
  saveStore();
  renderAll();
}
document.getElementById("btnPrevDay").addEventListener("click", () => stepDate(-1));
document.getElementById("btnNextDay").addEventListener("click", () => stepDate(1));
document.getElementById("attendanceDateInput").addEventListener("change", e => {
  if (e.target.value) {
    store.settings.selectedDate = e.target.value;
    saveStore();
    renderAll();
  }
});

// Chuyển kỳ thời gian (< / >)
function stepPeriod(delta) {
  const mode = store.settings.periodMode;
  if (mode === "month") {
    const [y, m] = store.settings.selectedMonth.split("-").map(Number);
    let newD = new Date(y, m - 1 + delta, 1);
    const newY = newD.getFullYear();
    const newM = String(newD.getMonth() + 1).padStart(2, "0");
    store.settings.selectedMonth = `${newY}-${newM}`;
  } else if (mode === "year") {
    const [y, m] = store.settings.selectedMonth.split("-").map(Number);
    store.settings.selectedMonth = `${y + delta}-${String(m).padStart(2, "0")}`;
  } else if (mode === "week") {
    stepDate(delta * 7);
    return;
  }
  saveStore();
  renderAll();
}
document.getElementById("btnPrevPeriod")?.addEventListener("click", () => stepPeriod(-1));
document.getElementById("btnNextPeriod")?.addEventListener("click", () => stepPeriod(1));

// Chế độ kỳ: Tuần / Tháng / Năm
document.querySelectorAll(".period-tab").forEach(btn => {
  btn.addEventListener("click", () => {
    store.settings.periodMode = btn.dataset.mode;
    saveStore();
    renderAll();
  });
});

// Lọc công trình theo chip
document.querySelectorAll(".filter-chips .chip").forEach(chip => {
  chip.addEventListener("click", () => {
    document.querySelectorAll(".filter-chips .chip").forEach(c => c.classList.remove("active"));
    chip.classList.add("active");
    renderProjectsTab();
  });
});

document.getElementById("projectSearchInput")?.addEventListener("input", renderProjectsTab);

// Khởi tạo IndexedDB ở chế độ ngầm và render ban đầu
AppStorage.initDB().then(() => {
  AppStorage.loadFromIndexedDB().then(idbStore => {
    if (idbStore) {
      store = idbStore;
      renderAll();
    }
  });
});

renderAll();
