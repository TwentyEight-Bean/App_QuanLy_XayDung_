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
function getLocalDateVN(dateInput) {
  const date = dateInput ? (dateInput instanceof Date ? dateInput : new Date(dateInput)) : new Date();
  if (isNaN(date.getTime())) return "";
  // en-CA format chuẩn hóa chính xác ra YYYY-MM-DD theo đúng múi giờ Asia/Ho_Chi_Minh
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });
  return formatter.format(date);
}

function getTodayVN() {
  return getLocalDateVN(new Date());
}

// Tính toán tuần ISO (Thứ 2 đến Chủ nhật) dựa trên ngày địa phương VN
function getWeekRange(dateStr) {
  if (!dateStr) dateStr = getTodayVN();
  const [y, m, d] = dateStr.split("-").map(Number);
  // Dùng UTC date để tránh cộng trừ lệch giờ DST/OS
  const date = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  const day = date.getUTCDay(); // 0: CN, 1: T2, ..., 6: T7
  const diffToMonday = day === 0 ? -6 : 1 - day;

  const monday = new Date(date);
  monday.setUTCDate(date.getUTCDate() + diffToMonday);

  const sunday = new Date(monday);
  sunday.setUTCDate(monday.getUTCDate() + 6);

  const fmt = dt => {
    const yr = dt.getUTCFullYear();
    const mo = String(dt.getUTCMonth() + 1).padStart(2, "0");
    const da = String(dt.getUTCDate()).padStart(2, "0");
    return `${yr}-${mo}-${da}`;
  };

  return {
    start: fmt(monday),
    end: fmt(sunday),
    displayStart: `${String(monday.getUTCDate()).padStart(2, "0")}/${String(monday.getUTCMonth() + 1).padStart(2, "0")}`,
    displayEnd: `${String(sunday.getUTCDate()).padStart(2, "0")}/${String(sunday.getUTCMonth() + 1).padStart(2, "0")}/${sunday.getUTCFullYear()}`
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

// ================= HÀM PARSE KHÓA LƯƠNG CŨ V1 CHÍNH XÁC =================
// V1 format: ${projectId}_${workerId}_${YYYY-MM} (ví dụ PRJ_NINH_KIEU_W_LEG_01_2026-10)
// Tuyệt đối không giả định ID không chứa dấu '_'
function parseLegacyPayrollKey(key, projects = [], workers = [], defaultPeriod = "2026-10") {
  if (!key || typeof key !== "string") {
    return { projectId: projects[0]?.id || "PRJ_UNKNOWN", workerId: "W_UNKNOWN", periodId: defaultPeriod };
  }

  // 1. Tách phần kỳ thời gian ở đuôi: _YYYY-MM
  const periodMatch = key.match(/_(\d{4}-\d{2})$/);
  let periodId = defaultPeriod;
  let prefix = key;
  if (periodMatch) {
    periodId = periodMatch[1];
    prefix = key.slice(0, -periodMatch[0].length);
  }

  // 2. Tìm kiếm chính xác cặp projectId và workerId có thật
  // Sắp xếp ID dài trước để ưu tiên khớp chuỗi dài nhất tránh nhầm lẫn prefix/suffix
  const sortedProjects = [...projects].sort((a, b) => (b.id?.length || 0) - (a.id?.length || 0));
  const sortedWorkers = [...workers].sort((a, b) => (b.id?.length || 0) - (a.id?.length || 0));

  let matchedProj = null;
  let matchedWorker = null;

  // Thử khớp chính xác: prefix === `${p.id}_${w.id}`
  for (const p of sortedProjects) {
    for (const w of sortedWorkers) {
      if (prefix === `${p.id}_${w.id}`) {
        matchedProj = p.id;
        matchedWorker = w.id;
        break;
      }
    }
    if (matchedWorker) break;
  }

  // Nếu chưa tìm thấy, thử xem prefix có bắt đầu bằng `${p.id}_` không
  if (!matchedWorker) {
    for (const p of sortedProjects) {
      if (prefix.startsWith(p.id + "_")) {
        const rem = prefix.slice(p.id.length + 1);
        const w = sortedWorkers.find(x => x.id === rem);
        matchedProj = p.id;
        matchedWorker = w ? w.id : rem;
        break;
      }
    }
  }

  // Nếu chưa tìm thấy, thử xem prefix có kết thúc bằng `_${w.id}` không
  if (!matchedWorker) {
    for (const w of sortedWorkers) {
      if (prefix.endsWith("_" + w.id)) {
        const rem = prefix.slice(0, -(w.id.length + 1));
        const p = sortedProjects.find(x => x.id === rem);
        matchedProj = p ? p.id : rem;
        matchedWorker = w.id;
        break;
      }
    }
  }

  // Nếu prefix chỉ chứa workerId (không có projectId)
  if (!matchedWorker) {
    const w = sortedWorkers.find(x => x.id === prefix);
    if (w) {
      matchedWorker = w.id;
      matchedProj = w.projectId || (sortedProjects[0]?.id || "PRJ_NINH_KIEU");
    }
  }

  // Fallback an toàn nếu cả projectId và workerId đều chưa từng khai báo
  if (!matchedWorker) {
    const idx = prefix.indexOf("_");
    if (idx > 0) {
      matchedProj = prefix.slice(0, idx);
      matchedWorker = prefix.slice(idx + 1);
    } else {
      matchedWorker = prefix;
      matchedProj = sortedProjects[0]?.id || "PRJ_NINH_KIEU";
    }
  }

  return {
    projectId: matchedProj || (sortedProjects[0]?.id || "PRJ_NINH_KIEU"),
    workerId: matchedWorker,
    periodId
  };
}

// ================= DỮ LIỆU MẪU KHỞI TẠO & MIGRATION =================
function createDefaultStore() {
  const today = getTodayVN();
  const currentMonth = today.slice(0, 7);
  return {
    version: 2,
    revision: 0,
    isDefaultStore: true,
    updatedAt: new Date().toISOString(),
    settings: {
      selectedProjectId: "PRJ_NINH_KIEU", // "ALL" hoặc ID công trình
      periodMode: "month",                // "week" | "month" | "year" (bộ lọc báo cáo)
      selectedMonth: currentMonth,        // YYYY-MM
      selectedDate: today,
      payrollPeriod: currentMonth,        // YYYY-MM (định danh kỳ quyết toán lương ổn định)
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
      {
        id: "W01",
        name: "Nguyễn Văn Ba",
        role: "Thợ cả (Thợ chính)",
        dailyRate: 500000,
        projectId: "PRJ_NINH_KIEU",
        assignments: [{ projectId: "PRJ_NINH_KIEU", startDate: "2025-01-01", endDate: null }]
      },
      {
        id: "W02",
        name: "Trần Văn Tư",
        role: "Thợ xây chính",
        dailyRate: 450000,
        projectId: "PRJ_NINH_KIEU",
        assignments: [{ projectId: "PRJ_NINH_KIEU", startDate: "2025-01-01", endDate: null }]
      },
      {
        id: "W03",
        name: "Lê Hoàng Nam",
        role: "Thợ sắt / Cốt pha",
        dailyRate: 450000,
        projectId: "PRJ_NINH_KIEU",
        assignments: [{ projectId: "PRJ_NINH_KIEU", startDate: "2025-01-01", endDate: null }]
      },
      {
        id: "W04",
        name: "Phạm Văn Út",
        role: "Thợ hồ phụ",
        dailyRate: 330000,
        projectId: "PRJ_NINH_KIEU",
        assignments: [{ projectId: "PRJ_NINH_KIEU", startDate: "2025-01-01", endDate: null }]
      },
      {
        id: "W05",
        name: "Võ Minh Tâm",
        role: "Thợ điện nước",
        dailyRate: 480000,
        projectId: "PRJ_CAI_RANG",
        assignments: [{ projectId: "PRJ_CAI_RANG", startDate: "2025-01-01", endDate: null }]
      },
      {
        id: "W06",
        name: "Đặng Văn Hùng",
        role: "Thợ hồ phụ",
        dailyRate: 340000,
        projectId: "PRJ_CAI_RANG",
        assignments: [{ projectId: "PRJ_CAI_RANG", startDate: "2025-01-01", endDate: null }]
      }
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
        signatureType: "digital_ink", // Chữ ký viết tay số hóa qua S-Pen (digital ink), không phải chữ ký số PKI
        signatureDataUrl: null,
        signedAt: today,
        docVersion: 1,
        docRef: "REF_ADV_PRJ_NINH_KIEU_W01_" + today,
        signatureHash: "REF_ADV_PRJ_NINH_KIEU_W01_" + today,
        adjustments: []
      },
      {
        id: "ADV_2",
        projectId: "PRJ_NINH_KIEU",
        workerId: "W04",
        amountVnd: 200000,
        date: today,
        note: "Gửi tiền về quê (Chưa ký)",
        signedStatus: "unsigned",
        signatureType: null,
        signatureDataUrl: null,
        signedAt: null,
        docVersion: 1,
        docRef: "REF_ADV_PRJ_NINH_KIEU_W04_" + today,
        signatureHash: null,
        adjustments: []
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

  // Phân biệt store mặc định chưa sửa đổi với dữ liệu người dùng thật
  const hasUserRecords = (rawStore.projects && rawStore.projects.length > 0) ||
                         (rawStore.workers && rawStore.workers.length > 0) ||
                         (rawStore.attendance && rawStore.attendance.length > 0) ||
                         (rawStore.advances && rawStore.advances.length > 0) ||
                         (rawStore.cashTransactions && rawStore.cashTransactions.length > 0) ||
                         (rawStore.materials && rawStore.materials.length > 0) ||
                         (rawStore.payrollStatus && Object.keys(rawStore.payrollStatus).length > 0);

  if (rawStore.isDefaultStore === true && (Number(rawStore.revision) === 0 || !rawStore.revision)) {
    d.isDefaultStore = true;
    d.revision = 0;
  } else {
    d.isDefaultStore = false;
    d.revision = Number(rawStore.revision) || (hasUserRecords ? 1 : 0);
  }

  // 1. Đảm bảo mảng tồn tại
  if (!Array.isArray(d.projects)) d.projects = [];
  if (!Array.isArray(d.workers)) d.workers = [];
  if (!Array.isArray(d.attendance)) d.attendance = [];
  if (!Array.isArray(d.advances)) d.advances = [];
  if (!Array.isArray(d.materials)) d.materials = [];
  if (!Array.isArray(d.cashTransactions)) d.cashTransactions = [];
  if (!Array.isArray(d.wagePayments)) d.wagePayments = [];
  if (!Array.isArray(d.auditLogs)) d.auditLogs = [];

  // Metadata phiên bản & timestamp
  d.updatedAt = d.updatedAt || new Date().toISOString();
  if (!d.settings) d.settings = {};
  d.settings.payrollPeriod = d.settings.payrollPeriod || d.settings.selectedMonth || getTodayVN().slice(0, 7);

  // 2. Bảo toàn lịch sử phân công thợ (assignments)
  d.workers = d.workers.map(w => {
    let assignments = Array.isArray(w.assignments) ? [...w.assignments] : [];
    if (assignments.length === 0 && w.projectId) {
      assignments = [
        {
          projectId: w.projectId,
          startDate: "2025-01-01",
          endDate: null
        }
      ];
    }
    return {
      ...w,
      assignments
    };
  });

  // 3. Migration vật tư: chuyển đổi cấu trúc cũ sang có payments
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

  // 4. Migration chấm công: đảm bảo rateSnapshot luôn tồn tại
  d.attendance = d.attendance.map(a => {
    if (a.rateSnapshot == null) {
      const w = d.workers.find(x => x.id === a.workerId);
      a.rateSnapshot = w ? w.dailyRate : 450000;
    }
    return a;
  });

  // 5. Migration tạm ứng: bảo toàn chứng từ S-Pen & đối soát
  d.advances = d.advances.map(a => {
    const isSigned = a.signedStatus === "signed";
    return {
      ...a,
      signatureType: a.signatureType || (isSigned ? "digital_ink" : null),
      docVersion: Number(a.docVersion) || 1,
      docRef: a.docRef || a.signatureHash || ("REF_ADV_" + a.projectId + "_" + a.workerId + "_" + a.date),
      signatureHash: a.docRef || a.signatureHash || ("REF_ADV_" + a.projectId + "_" + a.workerId + "_" + a.date),
      adjustments: Array.isArray(a.adjustments) ? a.adjustments : []
    };
  });

  // 6. Migration dữ liệu lương cũ: payrollStatus sang wagePayments
  // Parse chính xác dựa trên danh sách projectId và workerId có thật
  // Tuyệt đối không tạo chứng từ tiền mặt giả 0 đ vào sổ quỹ
  if (rawStore && rawStore.payrollStatus && typeof rawStore.payrollStatus === "object") {
    Object.entries(rawStore.payrollStatus).forEach(([key, status]) => {
      if (status === "paid") {
        const parsed = parseLegacyPayrollKey(key, d.projects, d.workers, d.settings.payrollPeriod || "2026-10");
        const exists = d.wagePayments.some(
          wp => wp.workerId === parsed.workerId && wp.periodId === parsed.periodId && wp.projectId === parsed.projectId
        );
        if (!exists) {
          d.wagePayments.push({
            id: "WPAY_MIG_" + key,
            projectId: parsed.projectId,
            workerId: parsed.workerId,
            periodId: parsed.periodId,
            grossWage: null,
            advanceDeducted: null,
            netPaid: null, // Không tạo chứng từ 0 đ giả trong sổ quỹ
            paidDate: d.settings.selectedDate || getTodayVN(),
            status: "paid",
            isLegacyMigration: true,
            requiresHistoricalReconciliation: true,
            note: "Đã chi trả ở phiên bản V1 (Cần đối soát lịch sử số tiền thực chi)"
          });
        }
      }
    });
  }

  // Quét cả worker có thuộc tính payrollStatus hoặc paidStatus
  d.workers.forEach(w => {
    if (w.payrollStatus === "paid" || w.paidStatus === "paid") {
      const pId = d.settings.payrollPeriod || "2026-10";
      const prjId = w.projectId || (d.projects[0]?.id || "PRJ_NINH_KIEU");
      const exists = d.wagePayments.some(
        wp => wp.workerId === w.id && wp.periodId === pId && wp.projectId === prjId
      );
      if (!exists) {
        d.wagePayments.push({
          id: "WPAY_MIG_W_" + w.id + "_" + pId,
          projectId: prjId,
          workerId: w.id,
          periodId: pId,
          grossWage: null,
          advanceDeducted: null,
          netPaid: null,
          paidDate: d.settings.selectedDate || getTodayVN(),
          status: "paid",
          isLegacyMigration: true,
          requiresHistoricalReconciliation: true,
          note: "Đã chi trả (Di chuyển từ trạng thái thợ cũ, cần đối soát lịch sử)"
        });
      }
    }
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
      if (!raw) {
        const def = createDefaultStore();
        def.isDefaultStore = true;
        def.revision = 0;
        return def;
      }
      return migrateStore(JSON.parse(raw));
    } catch (e) {
      console.warn("LocalStorage read error, fallback to temporary default store:", e);
      const def = createDefaultStore();
      def.isDefaultStore = true;
      def.revision = 0;
      return def;
    }
  }

  static async save(data) {
    if (!data) return;
    // Đánh dấu đây là dữ liệu người dùng thật (không phải store mặc định ban đầu)
    data.isDefaultStore = false;
    data.revision = (Number(data.revision) || 0) + 1;
    data.updatedAt = new Date().toISOString();

    // 1. Lưu LocalStorage an toàn (xử lý QuotaExceededError khi có ảnh chữ ký Base64 lớn)
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (e) {
      console.warn("LocalStorage save warning / QuotaExceeded (dữ liệu vẫn được lưu an toàn vào IndexedDB):", e);
    }

    // 2. Lưu IndexedDB với đầy đủ xử lý onerror, onabort, quota
    if (AppStorage.db) {
      try {
        const tx = AppStorage.db.transaction(STORE_NAME, "readwrite");
        tx.onerror = (err) => console.error("IndexedDB transaction error:", err);
        tx.onabort = (err) => console.error("IndexedDB transaction aborted (quota exceeded):", err);
        const req = tx.objectStore(STORE_NAME).put(data, "current_state");
        req.onerror = (err) => console.error("IndexedDB put request error:", err);
      } catch (err) {
        console.warn("IndexedDB save exception:", err);
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

  static async syncWithIndexedDB() {
    try {
      const idbData = await AppStorage.loadFromIndexedDB();
      if (!idbData) {
        // IDB chưa có dữ liệu -> Chỉ lưu nếu store hiện tại là dữ liệu người dùng thật
        if (AppStorage.db && store && !store.isDefaultStore) {
          const tx = AppStorage.db.transaction(STORE_NAME, "readwrite");
          tx.objectStore(STORE_NAME).put(store, "current_state");
        }
        return;
      }

      const isIdbReal = !idbData.isDefaultStore && (Number(idbData.revision) > 0 || (Array.isArray(idbData.projects) && idbData.projects.length > 0));
      const isLocalReal = !store.isDefaultStore && Number(store.revision) > 0;

      // TRƯỜNG HỢP 1: IDB CÓ DỮ LIỆU THẬT MÀ LOCALSTORAGE BỊ MẤT/HỎNG/STORE MẶC ĐỊNH
      // Phục hồi 100% từ IDB sang LocalStorage, TUYỆT ĐỐI KHÔNG GHI ĐÈ IDB!
      if (isIdbReal && !isLocalReal) {
        console.log("Phát hiện IndexedDB có dữ liệu người dùng thật còn LocalStorage bị trống/hỏng. Phục hồi 100% từ IndexedDB!");
        store = idbData;
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
        } catch (e) {}
        renderAll();
        return;
      }

      // TRƯỜNG HỢP 2: CẢ HAI ĐỀU CÓ DỮ LIỆU THẬT -> SO SÁNH REVISION & TIMESTAMP
      if (isIdbReal && isLocalReal) {
        const idbRev = Number(idbData.revision) || 0;
        const localRev = Number(store.revision) || 0;

        if (idbRev > localRev) {
          console.log(`IndexedDB mới hơn (rev ${idbRev} > ${localRev}). Cập nhật store từ IDB.`);
          store = idbData;
          try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
          } catch (e) {}
          renderAll();
        } else if (localRev > idbRev) {
          console.log(`LocalStorage mới hơn (rev ${localRev} > ${idbRev}). Cập nhật IDB từ LocalStorage.`);
          if (AppStorage.db && store) {
            const tx = AppStorage.db.transaction(STORE_NAME, "readwrite");
            tx.objectStore(STORE_NAME).put(store, "current_state");
          }
        } else {
          // Revision bằng nhau: so sánh timestamp
          const idbTime = new Date(idbData.updatedAt || 0).getTime();
          const localTime = new Date(store.updatedAt || 0).getTime();
          if (idbTime > localTime) {
            store = idbData;
            try { localStorage.setItem(STORAGE_KEY, JSON.stringify(store)); } catch (e) {}
            renderAll();
          } else if (localTime > idbTime) {
            if (AppStorage.db && store) {
              const tx = AppStorage.db.transaction(STORE_NAME, "readwrite");
              tx.objectStore(STORE_NAME).put(store, "current_state");
            }
          }
        }
        return;
      }

      // TRƯỜNG HỢP 3: LOCALSTORAGE CÓ DỮ LIỆU THẬT MÀ IDB CHƯA CÓ HOẶC LÀ STORE MẶC ĐỊNH
      if (!isIdbReal && isLocalReal) {
        if (AppStorage.db && store) {
          const tx = AppStorage.db.transaction(STORE_NAME, "readwrite");
          tx.objectStore(STORE_NAME).put(store, "current_state");
        }
      }
    } catch (e) {
      console.warn("Storage sync warning:", e);
    }
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
let activeWagePaymentProjectId = null;
let activeWagePaymentPeriodId = null;

function saveStore() {
  AppStorage.save(store);
}

function matchesProject(itemProjectId) {
  const sel = store.settings.selectedProjectId;
  return sel === "ALL" || itemProjectId === sel;
}

// ================= KIỂM TRA THỢ THUỘC CÔNG TRÌNH THEO THỜI GIAN =================
// Đảm bảo khi thợ chuyển công trình, dữ liệu cũ tại công trình cũ vẫn tra cứu được đầy đủ
function isWorkerActiveInProject(worker, targetProjectId, periodOrDate = null) {
  if (!worker) return false;
  if (!targetProjectId || targetProjectId === "ALL") return true;

  const period = periodOrDate || store.settings.payrollPeriod || store.settings.selectedMonth || "";
  const periodMonth = period.slice(0, 7);

  // 1. Kiểm tra xem thợ có phát sinh dữ liệu thực tế tại targetProjectId trong kỳ/ngày này không
  const hasAttendance = store.attendance.some(a =>
    a.workerId === worker.id && a.projectId === targetProjectId && (!periodMonth || a.date.startsWith(periodMonth))
  );
  if (hasAttendance) return true;

  const hasAdvance = store.advances.some(a =>
    a.workerId === worker.id && a.projectId === targetProjectId && (!periodMonth || a.date.startsWith(periodMonth))
  );
  if (hasAdvance) return true;

  const hasWage = store.wagePayments.some(wp =>
    wp.workerId === worker.id && wp.projectId === targetProjectId && (!periodMonth || wp.periodId === periodMonth)
  );
  if (hasWage) return true;

  // 2. Kiểm tra theo lịch sử phân công assignments (nếu có)
  if (Array.isArray(worker.assignments) && worker.assignments.length > 0) {
    return worker.assignments.some(asn => {
      if (asn.projectId !== targetProjectId) return false;
      if (!period) return !asn.endDate; // Không có bộ lọc ngày -> kiểm tra assignment đang active
      const pStart = period.length === 7 ? (period + "-01") : period;
      const pEnd = period.length === 7 ? (period + "-31") : period;
      const aStart = asn.startDate || "2000-01-01";
      const aEnd = asn.endDate || "2099-12-31";
      return aStart <= pEnd && aEnd >= pStart;
    });
  }

  // 3. Fallback: nếu chưa có assignments và không có period lọc, so sánh worker.projectId
  if (!period) return worker.projectId === targetProjectId;
  return false;
}

// Chuyển thợ sang công trình mới an toàn, bảo toàn 100% lịch sử công trình cũ
window.transferWorker = function(workerId, newProjectId, effectiveDate = null) {
  const w = store.workers.find(x => x.id === workerId);
  if (!w) return false;
  if (w.projectId === newProjectId) return true;

  const oldProjectId = w.projectId;
  const effDate = effectiveDate || getTodayVN();

  if (!Array.isArray(w.assignments)) {
    w.assignments = [];
    if (oldProjectId) {
      w.assignments.push({
        projectId: oldProjectId,
        startDate: "2025-01-01",
        endDate: effDate
      });
    }
  } else {
    // Đóng assignment đang mở
    w.assignments.forEach(a => {
      if (!a.endDate || a.endDate > effDate) {
        a.endDate = effDate;
      }
    });
  }

  w.assignments.push({
    projectId: newProjectId,
    startDate: effDate,
    endDate: null
  });

  w.projectId = newProjectId;

  store.auditLogs.push({
    id: "LOG_TRANS_" + Date.now(),
    time: new Date().toISOString(),
    action: `Chuyển thợ ${w.name} từ công trình ${oldProjectId} sang ${newProjectId} từ ngày ${effDate}`
  });

  saveStore();
  renderAll();
  return true;
};

// ================= SỔ QUỸ TIỀN MẶT THỐNG NHẤT (UNIFIED CASH LEDGER) =================
// Nguồn đơn nhất (Single Source of Truth) kết hợp: Sổ thu chi + Tạm ứng + Lương thợ + Vật tư
function getUnifiedCashLedger(projectId = "ALL") {
  const ledger = [];

  // 1. Thu chi tiền mặt từ sổ thu chi
  store.cashTransactions.forEach(t => {
    if (projectId !== "ALL" && t.projectId !== projectId) return;
    const prj = store.projects.find(p => p.id === t.projectId);
    ledger.push({
      id: t.id,
      date: t.date,
      projectId: t.projectId,
      projectName: prj ? prj.name : t.projectId,
      category: t.type === "in" ? "Thu tiền mặt" : "Chi tiền mặt",
      partner: t.category || "Giao dịch quỹ",
      source: "Sổ thu chi",
      type: t.type,
      amountIn: t.type === "in" ? Number(t.amountVnd || 0) : 0,
      amountOut: t.type === "out" ? Number(t.amountVnd || 0) : 0,
      note: t.category || ""
    });
  });

  // 2. Tiền tạm ứng thợ (Chi tiền mặt từ quỹ)
  store.advances.forEach(a => {
    if (projectId !== "ALL" && a.projectId !== projectId) return;
    const w = store.workers.find(x => x.id === a.workerId);
    const prj = store.projects.find(p => p.id === a.projectId);
    ledger.push({
      id: a.id,
      date: a.date,
      projectId: a.projectId,
      projectName: prj ? prj.name : a.projectId,
      category: "Chi tạm ứng thợ",
      partner: w ? w.name : a.workerId,
      source: "Tạm ứng thợ",
      type: "out",
      amountIn: 0,
      amountOut: Number(a.amountVnd || 0),
      note: a.note || "Tạm ứng tiền mặt"
    });
  });

  // 3. Chi trả lương thực tế (quyết toán tiền mặt)
  store.wagePayments.forEach(wp => {
    if (projectId !== "ALL" && wp.projectId !== projectId) return;
    // Bỏ qua chứng từ migration chưa rõ số tiền thực chi để KHÔNG TẠO CHỨNG TỪ TIỀN MẶT GIẢ 0 Đ TRONG SỔ QUỸ
    if (wp.isLegacyMigration && (wp.netPaid == null || wp.requiresHistoricalReconciliation)) {
      return;
    }
    const w = store.workers.find(x => x.id === wp.workerId);
    const prj = store.projects.find(p => p.id === wp.projectId);
    ledger.push({
      id: wp.id,
      date: wp.paidDate,
      projectId: wp.projectId,
      projectName: prj ? prj.name : wp.projectId,
      category: `Quyết toán lương (Kỳ ${wp.periodId})`,
      partner: w ? w.name : wp.workerId,
      source: "Lương thợ",
      type: "out",
      amountIn: 0,
      amountOut: Number(wp.netPaid || 0),
      note: wp.note || `Quyết toán lương kỳ ${wp.periodId}`
    });
  });

  // 4. Thanh toán tiền mặt cho vật tư (theo ngày thanh toán thực tế paidDate)
  store.materials.forEach(m => {
    if (projectId !== "ALL" && m.projectId !== projectId) return;
    const prj = store.projects.find(p => p.id === m.projectId);
    (m.payments || []).forEach(p => {
      ledger.push({
        id: p.paymentId || ("MPAY_" + m.id),
        date: p.paidDate,
        projectId: m.projectId,
        projectName: prj ? prj.name : m.projectId,
        category: `Thanh toán vật tư (${m.name})`,
        partner: m.vendor || "Đại lý VLXD",
        source: "Trả nợ vật tư",
        type: "out",
        amountIn: 0,
        amountOut: Number(p.amount || 0),
        note: p.note || `Thanh toán vật tư ${m.name}`
      });
    });
  });

  // Sắp xếp ngày tăng dần (chronological) để tính số dư lũy kế
  ledger.sort((a, b) => (a.date > b.date ? 1 : (a.date < b.date ? -1 : 0)));

  let running = 0;
  ledger.forEach(item => {
    running += (item.amountIn - item.amountOut);
    item.runningBalance = running;
  });

  return ledger;
}

// ================= TÍNH TOÁN LƯƠNG & DƯ ỨNG CHUYỂN KỲ CÓ ĐỐI SOÁT =================
// Cơ chế Carry-forward: Dư ứng kỳ trước chuyển sang khấu trừ kỳ sau, chống khấu trừ 2 lần
function calculateWorkerPayrollForPeriod(workerId, projectId = null, targetPeriod = null) {
  const w = store.workers.find(x => x.id === workerId);
  if (!w) return null;

  const targetProj = projectId || w.projectId;
  const targetMo = targetPeriod || store.settings.payrollPeriod || store.settings.selectedMonth || getTodayVN().slice(0, 7);

  // Thu thập tất cả các tháng phát sinh dữ liệu của thợ tại công trình này
  const monthsSet = new Set();
  monthsSet.add(targetMo);

  store.attendance.forEach(a => {
    if (a.workerId === workerId && a.projectId === targetProj && a.date) {
      const ym = a.date.slice(0, 7);
      if (ym <= targetMo) monthsSet.add(ym);
    }
  });

  store.advances.forEach(adv => {
    if (adv.workerId === workerId && adv.projectId === targetProj && adv.date) {
      const ym = adv.date.slice(0, 7);
      if (ym <= targetMo) monthsSet.add(ym);
    }
  });

  store.wagePayments.forEach(wp => {
    if (wp.workerId === workerId && wp.projectId === targetProj && wp.periodId) {
      if (wp.periodId <= targetMo) monthsSet.add(wp.periodId);
    }
  });

  const sortedMonths = Array.from(monthsSet).sort();

  let openingSurplus = 0;
  let result = null;

  for (const m of sortedMonths) {
    // 1. Chấm công trong tháng m
    const attList = store.attendance.filter(
      a => a.workerId === workerId && a.projectId === targetProj && a.date && a.date.startsWith(m)
    );
    const totalUnits = attList.reduce((s, r) => s + Number(r.units || 0), 0);
    const grossWage = attList.reduce(
      (s, r) => s + Number(r.units || 0) * Number(r.rateSnapshot != null ? r.rateSnapshot : w.dailyRate),
      0
    );

    // 2. Tạm ứng trong tháng m
    const advList = store.advances.filter(
      a => a.workerId === workerId && a.projectId === targetProj && a.date && a.date.startsWith(m)
    );
    const periodAdvance = advList.reduce((s, r) => s + Number(r.amountVnd || 0), 0);

    // 3. Khấu trừ khả dụng = Dư ứng chuyển sang từ tháng trước + Ứng trong tháng
    const carryForwardIn = openingSurplus;
    const totalDeductible = carryForwardIn + periodAdvance;

    // 4. Kiểm tra xem tháng m đã được quyết toán chi tiền chưa
    const existingPayment = store.wagePayments.find(
      wp => wp.workerId === workerId && wp.projectId === targetProj && wp.periodId === m
    );

    let advanceDeducted = 0;
    let netPayable = 0;
    let closingSurplus = 0;

    if (existingPayment) {
      // Đã quyết toán: lấy theo chứng từ thanh toán đã lưu
      const isLegacyWithoutAmount = existingPayment.isLegacyMigration && (existingPayment.netPaid == null || existingPayment.requiresHistoricalReconciliation);
      if (isLegacyWithoutAmount) {
        advanceDeducted = Math.min(grossWage, totalDeductible);
        netPayable = 0; // Đã trả lương trong lịch sử, không chi trả lần 2
        closingSurplus = Math.max(0, totalDeductible - grossWage);
      } else {
        advanceDeducted = existingPayment.advanceDeducted != null ? existingPayment.advanceDeducted : Math.min(grossWage, totalDeductible);
        netPayable = Number(existingPayment.netPaid || 0);
        closingSurplus = Math.max(0, totalDeductible - grossWage);
      }
    } else {
      // Chưa quyết toán
      if (grossWage >= totalDeductible) {
        advanceDeducted = totalDeductible;
        netPayable = grossWage - totalDeductible;
        closingSurplus = 0;
      } else {
        advanceDeducted = grossWage;
        netPayable = 0;
        closingSurplus = totalDeductible - grossWage;
      }
    }

    if (m === targetMo) {
      result = {
        worker: w,
        projectId: targetProj,
        periodId: targetMo,
        totalUnits,
        grossWage,
        periodAdvance,
        carryForwardIn,
        totalDeductible,
        advanceDeducted,
        netPayable,
        closingSurplus,
        isPaid: !!existingPayment,
        wagePayment: existingPayment || null,
        attRecords: attList,
        advRecords: advList
      };
      break;
    }

    // Chuyển số dư ứng còn lại sang tháng kế tiếp
    openingSurplus = closingSurplus;
  }

  return result;
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

  const selProj = store.settings.selectedProjectId;
  const selMo = store.settings.selectedMonth;
  const activeWorkers = store.workers.filter(w => isWorkerActiveInProject(w, selProj, selMo)).length;
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
    const wCount = store.workers.filter(w => isWorkerActiveInProject(w, p.id, selMo)).length;
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

  const targetProjId = store.settings.selectedProjectId;
  const workers = store.workers.filter(w => isWorkerActiveInProject(w, targetProjId, dateStr));
  let count1 = 0, count05 = 0, count15 = 0, count0 = 0, countUnset = 0;

  const listHtml = workers.map(w => {
    const rec = store.attendance.find(
      a => (targetProjId === "ALL" || a.projectId === targetProjId) && a.workerId === w.id && a.date === dateStr
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
  const targetProjId = (store.settings.selectedProjectId && store.settings.selectedProjectId !== "ALL")
    ? store.settings.selectedProjectId
    : w.projectId;
  const prj = store.projects.find(p => p.id === targetProjId);
  if (prj && prj.status === "completed") {
    showToast("Công trình này đã hoàn thành (Chỉ xem lịch sử). Không thể sửa công!");
    return;
  }

  const dateStr = store.settings.selectedDate;
  const existingIdx = store.attendance.findIndex(
    a => a.projectId === targetProjId && a.workerId === w.id && a.date === dateStr
  );

  if (existingIdx >= 0) {
    store.attendance[existingIdx].units = units;
  } else {
    store.attendance.push({
      id: "ATT_" + Date.now() + "_" + Math.random().toString(36).slice(2, 6),
      projectId: targetProjId,
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
  const workers = store.workers.filter(w => isWorkerActiveInProject(w, prjId, dateStr));
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

  // 2. Bảng lương tự động theo kỳ quyết toán ổn định (tách khỏi bộ lọc xem báo cáo)
  const settlementMonthInput = document.getElementById("payrollSettlementMonth");
  const targetPeriod = store.settings.payrollPeriod || store.settings.selectedMonth || getTodayVN().slice(0, 7);
  if (settlementMonthInput) {
    settlementMonthInput.value = targetPeriod;
    settlementMonthInput.onchange = e => {
      store.settings.payrollPeriod = e.target.value || targetPeriod;
      saveStore();
      renderMoneyTab();
    };
  }

  const targetProjId = store.settings.selectedProjectId;
  const workers = store.workers.filter(w => isWorkerActiveInProject(w, targetProjId, targetPeriod));
  document.getElementById("payrollWorkerList").innerHTML = workers.map(w => {
    const effProjId = targetProjId === "ALL" ? w.projectId : targetProjId;
    const prj = store.projects.find(p => p.id === effProjId);
    const payroll = calculateWorkerPayrollForPeriod(w.id, effProjId, targetPeriod);
    if (!payroll) return "";

    const { totalUnits, grossWage, periodAdvance, carryForwardIn, advanceDeducted, netPayable, closingSurplus, isPaid, wagePayment } = payroll;
    const isLegacyAudit = isPaid && wagePayment && (wagePayment.requiresHistoricalReconciliation || wagePayment.isLegacyMigration);

    return `
      <div class="item-card">
        <div class="item-card-row">
          <div>
            <div class="item-title">${escapeHTML(w.name)}</div>
            <div class="item-sub">🏗️ ${escapeHTML(prj ? prj.name : '')} • ${escapeHTML(w.role)} • <strong>${totalUnits} công</strong> (${formatVND(w.dailyRate)}/công)</div>
          </div>
          <span class="badge ${isPaid ? (isLegacyAudit ? 'badge-amber' : 'badge-green') : (closingSurplus > 0 && netPayable === 0 ? 'badge-red' : 'badge-blue')}">
            ${isPaid ? (isLegacyAudit ? '⚠️ Đã trả (Cần đối soát)' : '✅ Đã chi trả') : (closingSurplus > 0 && netPayable === 0 ? 'Dư ứng sang kỳ sau' : 'Chờ tất toán')}
          </span>
        </div>
        <div style="margin: 10px 0; font-size:13.5px; display:flex; flex-direction:column; gap:4px; color:var(--text-secondary);">
          <div style="display:flex; justify-content:space-between;">
            <span>Lương gộp: <strong>${formatVND(grossWage)}</strong></span>
            <span>Ứng trong kỳ: <strong style="color:var(--amber-warn);">-${formatVND(periodAdvance)}</strong></span>
          </div>
          ${carryForwardIn > 0 ? `
            <div style="display:flex; justify-content:space-between; font-size:12.5px; color:var(--danger-debt); background:var(--amber-soft); padding:3px 8px; border-radius:6px;">
              <span>Số dư ứng kỳ trước chuyển sang:</span>
              <strong>-${formatVND(carryForwardIn)}</strong>
            </div>
          ` : ''}
        </div>
        <div style="display:flex; justify-content:space-between; align-items:center; padding-top:10px; border-top:1px dashed var(--border-subtle);">
          <div>
            <div style="font-size:11px; font-weight:700; color:var(--text-muted); text-transform:uppercase;">
              ${netPayable > 0 || isPaid ? 'Thực lĩnh' : 'Dư ứng khấu trừ kỳ sau'}
            </div>
            <div style="font-size:20px; font-weight:800; color:${isPaid ? (isLegacyAudit ? 'var(--amber-warn)' : 'var(--brand-primary)') : (netPayable > 0 ? 'var(--brand-primary)' : 'var(--danger-debt)')}; font-variant-numeric:tabular-nums;">
              ${isPaid 
                ? (isLegacyAudit ? 'Đã trả (Lịch sử)' : formatVND(wagePayment.netPaid)) 
                : (netPayable > 0 ? formatVND(netPayable) : 'Âm ' + formatVND(closingSurplus))}
            </div>
            ${isPaid ? (isLegacyAudit
              ? `<small style="color:var(--amber-warn); font-size:11.5px; font-weight:600;">(Di chuyển từ V1: Cần đối soát số tiền thực chi)</small>`
              : `<small style="color:var(--brand-primary); font-size:11.5px; font-weight:600;">(Đã chi ngày ${wagePayment.paidDate})</small>`
            ) : ''}
          </div>
          <div style="display:flex; gap:6px;">
            <button class="date-step-btn" onclick="openVisualPayslip('${w.id}', '${effProjId}')">📤 Phiếu Zalo</button>
            ${!isPaid && netPayable > 0 ? `<button class="date-step-btn" style="background:var(--brand-primary); color:#FFF; border:none;" onclick="openWagePaymentSheet('${w.id}', '${effProjId}')">Chốt trả</button>` : ''}
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

  // 4. Sổ quỹ thu chi tổng hợp từ nguồn ledger đơn nhất
  renderCashflowList();
}

function renderCashflowList() {
  const listEl = document.getElementById("cashflowHistoryList");
  const fullLedger = getUnifiedCashLedger(store.settings.selectedProjectId);
  const periodLedger = fullLedger.filter(item => isInSelectedPeriod(item.date));

  // Sắp xếp ngày mới nhất lên đầu để hiển thị trên UI
  periodLedger.sort((a, b) => (b.date > a.date ? 1 : (b.date < a.date ? -1 : 0)));

  listEl.innerHTML = periodLedger.map(item => {
    return `
      <div class="item-card">
        <div class="item-card-row">
          <div>
            <div class="item-title">${escapeHTML(item.partner ? `${item.category}: ${item.partner}` : item.category)}</div>
            <div class="item-sub">📅 ${item.date} • 🏗️ ${escapeHTML(item.projectName)} • <span class="badge ${item.source === 'Sổ thu chi' ? 'badge-blue' : 'badge-amber'}">${escapeHTML(item.source)}</span></div>
          </div>
          <strong style="font-size:16.5px; font-variant-numeric:tabular-nums; color:${item.amountIn > 0 ? 'var(--brand-primary)' : 'var(--danger-debt)'}">
            ${item.amountIn > 0 ? '+' : '-'}${formatVND(item.amountIn > 0 ? item.amountIn : item.amountOut)}
          </strong>
        </div>
      </div>
    `;
  }).join("") || `<div class="item-card" style="text-align:center; padding:20px; color:var(--text-muted);">Không có giao dịch dòng tiền trong kỳ này.</div>`;
}

// ================= CHI TRẢ LƯƠNG CHUẨN KẾ TOÁN =================
window.openWagePaymentSheet = function(workerId, projectId = null) {
  const w = store.workers.find(x => x.id === workerId);
  if (!w) return;
  activeWagePaymentWorkerId = workerId;

  const targetProjId = projectId || (store.settings.selectedProjectId !== "ALL" ? store.settings.selectedProjectId : w.projectId);
  activeWagePaymentProjectId = targetProjId;

  const targetPeriod = store.settings.payrollPeriod || store.settings.selectedMonth || getTodayVN().slice(0, 7);
  activeWagePaymentPeriodId = targetPeriod;
  const prj = store.projects.find(p => p.id === targetProjId);

  // Kiểm tra chống chi trả trùng
  const alreadyPaid = store.wagePayments.find(
    wp => wp.projectId === targetProjId && wp.workerId === w.id && wp.periodId === targetPeriod
  );
  if (alreadyPaid) {
    showToast(`Lương kỳ ${targetPeriod} của thợ đã được quyết toán trước đó!`);
    return;
  }

  const calc = calculateWorkerPayrollForPeriod(w.id, targetProjId, targetPeriod);
  if (!calc || calc.netPayable <= 0) {
    showToast(calc && calc.closingSurplus > 0
      ? `Thợ đang dư ứng ${formatVND(calc.closingSurplus)}. Không có số tiền cần chi trả tiền mặt!`
      : "Không có số tiền cần chi trả trong kỳ này!"
    );
    return;
  }

  const box = document.getElementById("wagePaymentReviewBox");
  box.innerHTML = `
    <div class="review-row"><span class="review-label">Họ tên thợ:</span><span class="review-val">${escapeHTML(w.name)}</span></div>
    <div class="review-row"><span class="review-label">Công trình:</span><span class="review-val">${escapeHTML(prj ? prj.name : '')}</span></div>
    <div class="review-row"><span class="review-label">Kỳ quyết toán:</span><span class="review-val">${targetPeriod}</span></div>
    <div class="review-row"><span class="review-label">Tổng công trong kỳ:</span><span class="review-val">${calc.totalUnits} công</span></div>
    <div class="review-row"><span class="review-label">Lương gộp:</span><span class="review-val">${formatVND(calc.grossWage)}</span></div>
    <div class="review-row"><span class="review-label">Khấu trừ tiền ứng trong kỳ:</span><span class="review-val" style="color:var(--amber-warn);">-${formatVND(calc.periodAdvance)}</span></div>
    ${calc.carryForwardIn > 0 ? `
      <div class="review-row"><span class="review-label">Khấu trừ dư ứng kỳ trước:</span><span class="review-val" style="color:var(--danger-debt);">-${formatVND(calc.carryForwardIn)}</span></div>
    ` : ''}
    <div class="review-row" style="padding-top:6px; border-top:1px dashed var(--border-subtle);"><span class="review-label"><strong>THỰC CHI TIỀN MẶT:</strong></span><span class="review-val" style="font-size:18px; color:var(--brand-primary);">${formatVND(calc.netPayable)}</span></div>
  `;

  document.getElementById("wagePaymentDate").value = getTodayVN();
  document.getElementById("sheetWagePayment").hidden = false;
};

document.getElementById("btnConfirmWagePayout").addEventListener("click", () => {
  if (!activeWagePaymentWorkerId) return;
  const w = store.workers.find(x => x.id === activeWagePaymentWorkerId);
  if (!w) return;

  const targetPeriod = activeWagePaymentPeriodId || store.settings.payrollPeriod || store.settings.selectedMonth || getTodayVN().slice(0, 7);
  const targetProjId = activeWagePaymentProjectId || (store.settings.selectedProjectId !== "ALL" ? store.settings.selectedProjectId : w.projectId);

  // Kiểm tra chống chi trả trùng ngay lập tức trong hàm xác nhận
  const alreadyPaid = store.wagePayments.find(
    wp => wp.projectId === targetProjId && wp.workerId === w.id && wp.periodId === targetPeriod
  );
  if (alreadyPaid) {
    showToast(`Lương kỳ ${targetPeriod} của thợ đã được quyết toán trước đó! Không thể chi trả trùng.`);
    document.getElementById("sheetWagePayment").hidden = true;
    return;
  }

  const calc = calculateWorkerPayrollForPeriod(w.id, targetProjId, targetPeriod);
  if (!calc || calc.netPayable <= 0) {
    showToast("Không có số tiền cần chi trả tiền mặt!");
    document.getElementById("sheetWagePayment").hidden = true;
    return;
  }

  const paidDate = document.getElementById("wagePaymentDate").value || getTodayVN();
  const note = document.getElementById("wagePaymentNote").value.trim() || `Quyết toán lương kỳ ${targetPeriod}`;

  store.wagePayments.push({
    id: "WPAY_" + Date.now() + "_" + Math.random().toString(36).slice(2, 6),
    projectId: targetProjId,
    workerId: w.id,
    periodId: targetPeriod,
    grossWage: calc.grossWage,
    periodAdvanceDeducted: calc.periodAdvance,
    carryForwardDeducted: calc.carryForwardIn,
    advanceDeducted: calc.advanceDeducted,
    netPaid: calc.netPayable,
    paidDate,
    note
  });

  store.auditLogs.push({
    time: new Date().toISOString(),
    action: `Quyết toán chi lương ${formatVND(calc.netPayable)} cho ${w.name} (kỳ ${targetPeriod})`
  });

  saveStore();
  document.getElementById("sheetWagePayment").hidden = true;
  renderAll();
  showToast(`Đã ghi nhận chi trả ${formatVND(calc.netPayable)} cho ${w.name}!`);
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
  adv.signatureType = "digital_ink"; // Chữ ký viết tay số hóa qua S-Pen (digital ink), không phải chữ ký số PKI
  adv.signatureDataUrl = suppCanvas.toDataURL("image/png");
  adv.signedAt = nowIso;
  adv.docVersion = (Number(adv.docVersion) || 1) + 1;
  adv.docRef = adv.docRef || ("REF_ADV_" + adv.projectId + "_" + adv.workerId + "_" + adv.date);
  adv.signatureHash = adv.docRef; // Giữ alias tương thích
  if (!Array.isArray(adv.adjustments)) adv.adjustments = [];
  adv.adjustments.push({
    action: "supplemental_sign",
    time: nowIso,
    note: "Ký bổ sung chữ ký viết tay số hóa qua bút S-Pen"
  });

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
  const advDate = document.getElementById("advDateInput")?.value || getTodayVN();
  const workers = store.workers.filter(w => isWorkerActiveInProject(w, prjId, advDate));
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
  const targetProjId = document.getElementById("advProjectSelect")?.value || (store.settings.selectedProjectId !== "ALL" ? store.settings.selectedProjectId : w.projectId);
  const sigUrl = hasSignatureInk ? spenCanvas.toDataURL("image/png") : null;
  const nowIso = new Date().toISOString();
  const docRef = "REF_ADV_" + targetProjId + "_" + w.id + "_" + advDate.replace(/-/g, "") + "_" + Date.now().toString(36);

  store.advances.push({
    id: "ADV_" + Date.now(),
    projectId: targetProjId,
    workerId: w.id,
    amountVnd: currentAdvanceAmount,
    date: advDate,
    note: document.getElementById("advNoteInput").value.trim() || "Tạm ứng tiền",
    signedStatus: hasSignatureInk ? "signed" : "unsigned",
    signatureType: hasSignatureInk ? "digital_ink" : null,
    signatureDataUrl: sigUrl,
    signedAt: hasSignatureInk ? nowIso : null,
    docVersion: 1,
    docRef: docRef,
    signatureHash: docRef,
    adjustments: []
  });

  saveStore();
  document.getElementById("sheetAdvanceForm").hidden = true;
  renderAll();
  showToast(`Đã lưu phiếu ứng ${formatVND(currentAdvanceAmount)} cho ${w.name}!`);
});

// ================= PHIẾU LƯƠNG ẢNH ĐỐI SOÁT (ZALO SHARING) =================
window.openVisualPayslip = function(workerId, projectId = null) {
  const w = store.workers.find(x => x.id === workerId);
  if (!w) return;
  activePayslipWorker = w;

  const targetPeriod = store.settings.payrollPeriod || store.settings.selectedMonth || getTodayVN().slice(0, 7);
  const targetProjId = projectId || (store.settings.selectedProjectId !== "ALL" ? store.settings.selectedProjectId : w.projectId);
  const prj = store.projects.find(p => p.id === targetProjId);

  const calc = calculateWorkerPayrollForPeriod(w.id, targetProjId, targetPeriod);
  if (!calc) return;

  const { totalUnits, grossWage, periodAdvance, carryForwardIn, advanceDeducted, netPayable, closingSurplus, isPaid, wagePayment, advRecords } = calc;

  const canvas = document.getElementById("payslipRenderCanvas");
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Header xanh công trình
  ctx.fillStyle = "#117D70";
  ctx.fillRect(0, 0, canvas.width, 110);
  ctx.fillStyle = "#FFFFFF";
  ctx.font = "bold 24px sans-serif";
  ctx.fillText("PHIẾU QUYẾT TOÁN LƯƠNG THỢ", 30, 48);
  ctx.font = "15px sans-serif";
  ctx.fillText(`Công trình: ${prj ? prj.name : 'Xây dựng'} • Kỳ: ${targetPeriod}`, 30, 82);

  // Thông tin thợ
  ctx.fillStyle = "#18312E";
  ctx.font = "bold 20px sans-serif";
  ctx.fillText(`Họ tên thợ: ${w.name}`, 30, 155);
  ctx.font = "15px sans-serif";
  ctx.fillStyle = "#4A6360";
  ctx.fillText(`Vai trò: ${w.role}  |  Đơn giá: ${formatVND(w.dailyRate)}/công`, 30, 185);

  // Khung tổng kết công & khấu trừ
  ctx.fillStyle = "#F5F7F6";
  ctx.fillRect(30, 205, canvas.width - 60, 145);
  ctx.strokeStyle = "#DFE5E3";
  ctx.strokeRect(30, 205, canvas.width - 60, 145);

  ctx.fillStyle = "#18312E";
  ctx.font = "bold 16px sans-serif";
  ctx.fillText(`1. Tổng ngày công trong kỳ: ${totalUnits} công`, 50, 240);
  ctx.fillText(`2. Lương gộp thành tiền: ${formatVND(grossWage)}`, 50, 272);
  ctx.fillStyle = "#A36A16";
  ctx.fillText(`3. Tạm ứng trong kỳ: -${formatVND(periodAdvance)} (${advRecords.length} lần)`, 50, 304);
  if (carryForwardIn > 0) {
    ctx.fillStyle = "#C0392B";
    ctx.fillText(`4. Dư ứng kỳ trước chuyển sang: -${formatVND(carryForwardIn)}`, 50, 336);
  }

  // Chi tiết tạm ứng
  ctx.fillStyle = "#18312E";
  ctx.font = "bold 16px sans-serif";
  ctx.fillText("Chi tiết các khoản tạm ứng:", 30, 380);

  let yPos = 410;
  if (advRecords.length === 0) {
    ctx.font = "15px sans-serif";
    ctx.fillStyle = "#7E9592";
    ctx.fillText("Không có khoản tạm ứng nào trong kỳ này.", 50, yPos);
  } else {
    advRecords.slice(0, 4).forEach(adv => {
      ctx.font = "14px sans-serif";
      ctx.fillStyle = "#18312E";
      const statusTxt = adv.signedStatus === "signed" ? "[Đã ký S-Pen]" : "[Chưa ký]";
      ctx.fillText(`• Ngày ${adv.date}: ${formatVND(adv.amountVnd)} (${adv.note || 'Ứng tiền'}) ${statusTxt}`, 40, yPos);
      yPos += 28;
    });
  }

  // Ghi chú chứng từ đối soát
  ctx.fillStyle = "#7E9592";
  ctx.font = "italic 13px sans-serif";
  ctx.fillText("Chứng từ đối soát nội bộ — Chữ ký viết tay số hóa qua S-Pen (Digital Ink)", 30, 625);

  // Khung thực lĩnh
  ctx.fillStyle = "#D9F3EB";
  ctx.fillRect(30, 650, canvas.width - 60, 120);
  ctx.strokeStyle = "#117D70";
  ctx.lineWidth = 2.5;
  ctx.strokeRect(30, 650, canvas.width - 60, 120);

  ctx.fillStyle = "#0E685D";
  ctx.font = "bold 17px sans-serif";
  ctx.fillText(netPayable > 0 || isPaid ? "THỰC LĨNH CÒN NHẬN:" : "DƯ ỨNG KHẤU TRỪ KỲ SAU:", 50, 690);
  ctx.font = "bold 34px sans-serif";
  ctx.fillText(
    isPaid ? formatVND(wagePayment.netPaid) : (netPayable > 0 ? formatVND(netPayable) : "Âm " + formatVND(closingSurplus)),
    50,
    740
  );

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
    const wCount = store.workers.filter(w => isWorkerActiveInProject(w, p.id, store.settings.selectedMonth)).length;
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
  const today = getTodayVN();

  store.workers.push({
    id: "W" + (store.workers.length + 1) + "_" + Date.now().toString(36).slice(-4),
    name,
    role,
    dailyRate: rate,
    projectId: prjId,
    assignments: [
      {
        projectId: prjId,
        startDate: today,
        endDate: null
      }
    ]
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
window.generateExcelWorkbook = function() {
  if (typeof XLSX === "undefined") return null;
  const wb = XLSX.utils.book_new();

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
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(store.projects), "DanhSach_CongTrinh");

  const workersExport = store.workers.map(w => ({
    MaTho: w.id,
    HoTen: w.name,
    VaiTro: w.role,
    DonGiaNgay: w.dailyRate,
    CongTrinhHienTai: w.projectId,
    LichSuPhanCong: (w.assignments || []).map(a => `${a.projectId} (${a.startDate || ''} ~ ${a.endDate || 'nay'})`).join("; ")
  }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(workersExport), "DoiTho");

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
      HinhThucKy: a.signedStatus === "signed" ? "Chữ ký viết tay số hóa qua S-Pen (Digital Ink)" : "Chưa ký",
      MaDoiSoatChungTu: a.docRef || a.id,
      ThoiDiemKy: a.signedAt || "",
      PhienBanChungTu: a.docVersion || 1
    };
  });
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(advExport), "TamUng_ChuKy");

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

  const cashLedger = getUnifiedCashLedger(store.settings.selectedProjectId);
  const soQuyExport = cashLedger.map(item => ({
    Ngay: item.date,
    CongTrinh: item.projectName,
    LoaiGiaoDich: item.category,
    DoiTuong: item.partner,
    NguonGiaoDich: item.source,
    SoTienThu_VND: item.amountIn,
    SoTienChi_VND: item.amountOut,
    SoDuLuyKe_VND: item.runningBalance,
    GhiChu: item.note
  }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(soQuyExport), "SoQuy_TienMat");

  return wb;
};

document.getElementById("btnExportExcel").addEventListener("click", () => {
  if (typeof XLSX === "undefined") {
    exportBackupJson();
    return;
  }
  const wb = window.generateExcelWorkbook();
  if (!wb) return;
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

// Khởi tạo IndexedDB và đồng bộ an toàn (Single Source of Truth, IDB cũ không bao giờ ghi đè LocalStorage mới hơn)
AppStorage.initDB().then(() => {
  AppStorage.syncWithIndexedDB();
});

renderAll();
