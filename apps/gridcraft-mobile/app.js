/**
 * GRIDCRAFT 2.0 — SỔ CÔNG TRÌNH (SAMSUNG GALAXY S23 ULTRA EDITION)
 * UI/UX Cải tổ toàn diện: Chuẩn One UI 6, Chống chói nắng công trường, S-Pen Palm Rejection,
 * Bảo toàn lịch sử đa dự án, Rate Snapshot bất biến, Xuất Excel .xlsx đa sheet.
 */

const STORAGE_KEY = "GRIDCRAFT_SO_CONG_TRINH_V2";

// Dữ liệu mẫu khởi tạo chuẩn thực tế
function createDefaultStore() {
  const today = new Date().toISOString().slice(0, 10);
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
    // Chấm công: Luôn gắn chặt rateSnapshot tại thời điểm chấm
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
        vendor: "Đại lý VLXD Tư Thành",
        paidStatus: "debt", // "debt" (Nợ đại lý - KHÔNG trừ tiền mặt) | "paid" (Đã trả tiền mặt)
        date: today
      },
      {
        id: "MAT_2",
        projectId: "PRJ_NINH_KIEU",
        name: "Cát vàng xây tô",
        qty: 6,
        unit: "Khối (m³)",
        unitPrice: 380000,
        vendor: "Bãi cát Sông Hậu",
        paidStatus: "paid",
        date: today
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
    payrollStatus: {}, // key: `${projectId}_${workerId}_${YYYY-MM}` -> "paid"
    auditLogs: []
  };
}

let store = loadStore();
let undoSnapshot = null;
let undoTimer = null;
let currentAdvanceAmount = 500000;
let activePayslipWorker = null;

function loadStore() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return createDefaultStore();
    const parsed = JSON.parse(raw);
    return { ...createDefaultStore(), ...parsed };
  } catch (e) {
    return createDefaultStore();
  }
}

function saveStore() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
}

// Định dạng tiền VND chuẩn hiển thị
function formatVND(num) {
  const n = Math.round(Number(num) || 0);
  return n.toLocaleString("vi-VN") + " đ";
}

// Đọc số tiền bằng chữ tiếng Việt (Chống bấm thừa số 0 trên công trường)
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

// Lọc ngày theo kỳ được chọn
function isInSelectedPeriod(dateStr) {
  if (!dateStr) return false;
  const mode = store.settings.periodMode;
  const selMonth = store.settings.selectedMonth; // YYYY-MM
  if (mode === "month") {
    return dateStr.startsWith(selMonth);
  }
  if (mode === "year") {
    return dateStr.startsWith(selMonth.slice(0, 4));
  }
  // Chế độ Tuần: +/- 3.5 ngày quanh selectedDate
  const target = new Date(store.settings.selectedDate).getTime();
  const cur = new Date(dateStr).getTime();
  const diffDays = Math.abs(cur - target) / (1000 * 3600 * 24);
  return diffDays <= 3.5;
}

function matchesProject(itemProjectId) {
  const sel = store.settings.selectedProjectId;
  return sel === "ALL" || itemProjectId === sel;
}

// Tính toán tài chính chuẩn xác theo bản đặc tả
function calculateFinancials() {
  let totalCashIn = 0;
  let totalCashOut = 0;

  let periodCashIn = 0;
  let periodCashOut = 0;
  let periodAttendanceUnits = 0;
  let periodAdvanceTotal = 0;
  let openMaterialDebt = 0;

  // 1. Giao dịch thu chi tiền mặt
  store.cashTransactions.forEach(tx => {
    if (!matchesProject(tx.projectId)) return;
    if (tx.type === "in") {
      totalCashIn += tx.amountVnd;
      if (isInSelectedPeriod(tx.date)) periodCashIn += tx.amountVnd;
    } else {
      totalCashOut += tx.amountVnd;
      if (isInSelectedPeriod(tx.date)) periodCashOut += tx.amountVnd;
    }
  });

  // 2. Tiền thợ tạm ứng (Là tiền mặt đã xuất từ quỹ)
  store.advances.forEach(adv => {
    if (!matchesProject(adv.projectId)) return;
    totalCashOut += adv.amountVnd;
    if (isInSelectedPeriod(adv.date)) {
      periodCashOut += adv.amountVnd;
      periodAdvanceTotal += adv.amountVnd;
    }
  });

  // 3. Vật tư: Phân định rõ nợ đại lý và đã trả tiền mặt
  store.materials.forEach(mat => {
    if (!matchesProject(mat.projectId)) return;
    const cost = mat.qty * mat.unitPrice;
    if (mat.paidStatus === "paid") {
      totalCashOut += cost;
      if (isInSelectedPeriod(mat.date)) periodCashOut += cost;
    } else {
      // Nợ gối đầu đại lý: KHÔNG trừ vào quỹ tiền mặt
      openMaterialDebt += cost;
    }
  });

  // 4. Ngày công trong kỳ
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
    openMaterialDebt
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
  const floatNameEl = document.getElementById("floatingProjectShortName");
  const dotEl = document.getElementById("headerProjectDot");

  if (selId === "ALL" || !prj) {
    nameEl.textContent = `Tất cả công trình (${store.projects.length})`;
    floatNameEl.textContent = "Tất cả CT";
    dotEl.style.background = "#117D70";
  } else {
    nameEl.textContent = prj.name;
    floatNameEl.textContent = prj.name.replace("Nhà phố ", "").replace("Biệt thự ", "");
    dotEl.style.background = prj.status === "completed" ? "#7E9592" : "#117D70";
  }

  // Nhãn hiển thị kỳ
  const [y, m] = store.settings.selectedMonth.split("-");
  const labelEl = document.getElementById("currentPeriodLabel");
  if (store.settings.periodMode === "month") labelEl.textContent = `Tháng ${m}/${y}`;
  else if (store.settings.periodMode === "year") labelEl.textContent = `Năm ${y}`;
  else labelEl.textContent = `Tuần (${store.settings.selectedDate.slice(5)})`;

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
  const unsignedCount = store.advances.filter(a => matchesProject(a.projectId) && a.signedStatus === "unsigned").length;
  const alertsEl = document.getElementById("overviewAlerts");
  alertsEl.innerHTML = "";
  if (unsignedCount > 0) {
    alertsEl.innerHTML = `
      <div class="notice-banner">
        <span>⚠️</span>
        <div>
          Có <strong>${unsignedCount} phiếu ứng tiền chưa ký nhận</strong>. Chạm vào mục Sổ tiền để đưa máy cho thợ ký bổ sung bằng S-Pen.
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
            <div class="item-title">${p.name}</div>
            <div class="item-sub">📍 ${p.location} • 👤 Chủ: ${p.owner} • 👷 ${wCount} thợ</div>
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
  document.getElementById("attendanceAllProjectsBanner").hidden = !isAll;
  document.getElementById("attendanceStickyFooter").style.display = isAll ? "none" : "flex";

  const dateStr = store.settings.selectedDate;
  document.getElementById("attendanceDateInput").value = dateStr;
  const todayStr = new Date().toISOString().slice(0, 10);
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
    const initial = w.name.split(" ").slice(-1)[0]?.slice(0, 2).toUpperCase() || "TH";

    return `
      <div class="worker-att-card">
        <div class="worker-att-top">
          <div class="worker-avatar">${initial}</div>
          <div class="worker-meta">
            <div class="worker-name">${w.name}</div>
            <div class="worker-role-rate">${w.role} • ${formatVND(rateShown)}/công</div>
          </div>
          <span class="badge ${val === null ? 'badge-amber' : 'badge-green'}">
            ${val === null ? 'Chưa ghi' : val + ' công'}
          </span>
        </div>
        <div class="att-pills-group">
          <button class="att-pill-btn ${val === 1.0 ? 'active-1' : ''}" onclick="setWorkerAttendance('${w.id}', 1.0)">
            <strong>1.0</strong>
            <small>Đủ</small>
          </button>
          <button class="att-pill-btn ${val === 0.5 ? 'active-05' : ''}" onclick="setWorkerAttendance('${w.id}', 0.5)">
            <strong>0.5</strong>
            <small>Nửa</small>
          </button>
          <button class="att-pill-btn ${val === 1.5 ? 'active-15' : ''}" onclick="setWorkerAttendance('${w.id}', 1.5)">
            <strong>1.5</strong>
            <small>Tăng ca</small>
          </button>
          <button class="att-pill-btn ${val === 0 ? 'active-0' : ''}" onclick="setWorkerAttendance('${w.id}', 0)">
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
    ${countUnset > 0 ? `<span style="color:var(--amber-warn);">⚠️ Chưa chấm: ${countUnset}</span>` : ''}
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

// Điểm danh cả đội (1.0 Công) có cảnh báo ghi đè & Hoàn tác
document.getElementById("btnMarkAllFullDay").addEventListener("click", () => {
  const prjId = store.settings.selectedProjectId;
  if (prjId === "ALL") return;
  const dateStr = store.settings.selectedDate;
  const workers = store.workers.filter(w => w.projectId === prjId);

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
    return `
      <div class="item-card">
        <div class="item-card-row">
          <div>
            <div class="item-title">${w ? w.name : 'Thợ'} — <span style="color:var(--amber-warn);">${formatVND(a.amountVnd)}</span></div>
            <div class="item-sub">📅 ${a.date} • ${a.note || 'Tạm ứng'}</div>
          </div>
          <span class="badge ${a.signedStatus === 'signed' ? 'badge-green' : 'badge-amber'}">
            ${a.signedStatus === 'signed' ? '✍️ Đã ký S-Pen' : '⚠️ Chưa ký'}
          </span>
        </div>
        ${a.signatureDataUrl ? `<div style="margin-top:8px;"><img src="${a.signatureDataUrl}" alt="Chữ ký thợ" style="height:44px; border:1px solid var(--border-card); border-radius:6px; background:#FFF; padding:2px;" /></div>` : ''}
      </div>
    `;
  }).join("") || `<div class="item-card" style="text-align:center; padding:20px; color:var(--text-muted);">Chưa có phiếu tạm ứng nào trong kỳ này.</div>`;

  // 2. Bảng lương tự động
  const workers = store.workers.filter(w => matchesProject(w.projectId));
  document.getElementById("payrollWorkerList").innerHTML = workers.map(w => {
    const attRecords = store.attendance.filter(
      a => a.workerId === w.id && matchesProject(a.projectId) && isInSelectedPeriod(a.date)
    );
    const totalUnits = attRecords.reduce((s, r) => s + Number(r.units || 0), 0);
    const grossWage = attRecords.reduce((s, r) => s + Number(r.units || 0) * Number(r.rateSnapshot || w.dailyRate), 0);

    const advRecords = store.advances.filter(
      a => a.workerId === w.id && matchesProject(a.projectId) && isInSelectedPeriod(a.date)
    );
    const totalAdv = advRecords.reduce((s, r) => s + Number(r.amountVnd || 0), 0);
    const netPay = grossWage - totalAdv;

    const payKey = `${w.projectId}_${w.id}_${store.settings.selectedMonth}`;
    const isPaid = store.payrollStatus[payKey] === "paid";

    return `
      <div class="item-card">
        <div class="item-card-row">
          <div>
            <div class="item-title">${w.name}</div>
            <div class="item-sub">${w.role} • <strong>${totalUnits} công</strong> (${formatVND(w.dailyRate)}/công)</div>
          </div>
          <span class="badge ${isPaid ? 'badge-green' : (netPay < 0 ? 'badge-red' : 'badge-blue')}">
            ${isPaid ? '✅ Đã trả' : (netPay < 0 ? 'Dư ứng sang kỳ sau' : 'Chờ tất toán')}
          </span>
        </div>
        <div style="margin: 10px 0; font-size:13.5px; display:flex; justify-content:space-between; color:var(--text-secondary);">
          <span>Lương gộp: <strong>${formatVND(grossWage)}</strong></span>
          <span>Đã ứng: <strong style="color:var(--amber-warn);">-${formatVND(totalAdv)}</strong></span>
        </div>
        <div style="display:flex; justify-content:space-between; align-items:center; padding-top:10px; border-top:1px dashed var(--border-subtle);">
          <div>
            <div style="font-size:10.5px; font-weight:700; color:var(--text-muted); text-transform:uppercase;">Thực lĩnh còn lại</div>
            <div style="font-size:20px; font-weight:800; color:var(--brand-primary); font-variant-numeric:tabular-nums;">
              ${netPay >= 0 ? formatVND(netPay) : 'Âm ' + formatVND(Math.abs(netPay))}
            </div>
          </div>
          <div style="display:flex; gap:6px;">
            <button class="date-step-btn" onclick="openVisualPayslip('${w.id}')">📤 Phiếu Zalo</button>
            ${!isPaid && netPay > 0 ? `<button class="date-step-btn" style="background:var(--brand-primary); color:#FFF; border:none;" onclick="markPayrollPaid('${w.id}')">Chốt trả</button>` : ''}
          </div>
        </div>
      </div>
    `;
  }).join("") || `<div class="item-card" style="text-align:center; padding:20px; color:var(--text-muted);">Không có thợ trong công trình này.</div>`;

  // 3. Vật tư & Nợ đại lý
  const mats = store.materials.filter(m => matchesProject(m.projectId));
  document.getElementById("materialsHistoryList").innerHTML = mats.map(m => {
    const total = m.qty * m.unitPrice;
    return `
      <div class="item-card">
        <div class="item-card-row">
          <div>
            <div class="item-title">${m.name} (${m.qty} ${m.unit})</div>
            <div class="item-sub">🏪 ${m.vendor} • <strong>${formatVND(total)}</strong></div>
          </div>
          <span class="badge ${m.paidStatus === 'paid' ? 'badge-green' : 'badge-red'}">
            ${m.paidStatus === 'paid' ? 'Đã trả tiền mặt' : 'Đang nợ đại lý'}
          </span>
        </div>
        ${m.paidStatus === 'debt' ? `
          <button class="date-step-btn" style="margin-top:10px; width:100%; background:var(--brand-tint); color:var(--brand-primary); border-color:var(--brand-soft);" onclick="settleMaterialDebt('${m.id}')">
            💵 Đánh dấu Đã thanh toán tiền mặt cho đại lý
          </button>
        ` : ''}
      </div>
    `;
  }).join("") || `<div class="item-card" style="text-align:center; padding:20px; color:var(--text-muted);">Chưa ghi nhập vật tư nào.</div>`;

  // 4. Thu chi
  const txs = store.cashTransactions.filter(t => matchesProject(t.projectId));
  document.getElementById("cashflowHistoryList").innerHTML = txs.map(t => `
    <div class="item-card">
      <div class="item-card-row">
        <div>
          <div class="item-title">${t.category}</div>
          <div class="item-sub">📅 ${t.date}</div>
        </div>
        <strong style="font-size:17px; font-variant-numeric:tabular-nums; color:${t.type === 'in' ? 'var(--brand-primary)' : 'var(--danger-debt)'}">
          ${t.type === 'in' ? '+' : '-'}${formatVND(t.amountVnd)}
        </strong>
      </div>
    </div>
  `).join("") || `<div class="item-card" style="text-align:center; padding:20px; color:var(--text-muted);">Chưa có giao dịch thu chi nào.</div>`;
}

window.markPayrollPaid = function(workerId) {
  const w = store.workers.find(x => x.id === workerId);
  if (!w) return;
  const payKey = `${w.projectId}_${w.id}_${store.settings.selectedMonth}`;
  store.payrollStatus[payKey] = "paid";
  saveStore();
  renderAll();
  showToast(`Đã chốt trả lương cho ${w.name}!`);
};

window.settleMaterialDebt = function(matId) {
  const mat = store.materials.find(m => m.id === matId);
  if (!mat) return;
  mat.paidStatus = "paid";
  saveStore();
  renderAll();
  showToast(`Đã thanh toán nợ cho ${mat.vendor}!`);
};

// ================= KHUNG KÝ S-PEN & PALM REJECTION =================
const spenCanvas = document.getElementById("spenCanvas");
const spenCtx = spenCanvas ? spenCanvas.getContext("2d") : null;
let isDrawing = false;
let hasSignatureInk = false;
let activePointerType = null;

function initSpenCanvas() {
  if (!spenCtx) return;
  spenCtx.fillStyle = "#FFFFFF";
  spenCtx.fillRect(0, 0, spenCanvas.width, spenCanvas.height);
  spenCtx.strokeStyle = "#18312E";
  spenCtx.lineWidth = 2.8;
  spenCtx.lineCap = "round";
  spenCtx.lineJoin = "round";
  hasSignatureInk = false;
}

if (spenCanvas) {
  spenCanvas.addEventListener("pointerdown", e => {
    if (e.pointerType === "pen") {
      activePointerType = "pen";
      document.getElementById("spenStatusText").textContent = "🖊️ Đang nhận nét S-Pen (Đã khóa tỳ tay)";
    } else if (activePointerType === "pen" && e.pointerType === "touch") {
      return; // Chặn cạnh bàn tay tỳ vào màn hình khi cầm bút
    }

    isDrawing = true;
    hasSignatureInk = true;
    const rect = spenCanvas.getBoundingClientRect();
    const scaleX = spenCanvas.width / rect.width;
    const scaleY = spenCanvas.height / rect.height;
    spenCtx.beginPath();
    spenCtx.moveTo((e.clientX - rect.left) * scaleX, (e.clientY - rect.top) * scaleY);
  });

  spenCanvas.addEventListener("pointermove", e => {
    if (!isDrawing) return;
    if (activePointerType === "pen" && e.pointerType === "touch") return;
    const rect = spenCanvas.getBoundingClientRect();
    const scaleX = spenCanvas.width / rect.width;
    const scaleY = spenCanvas.height / rect.height;
    spenCtx.lineTo((e.clientX - rect.left) * scaleX, (e.clientY - rect.top) * scaleY);
    spenCtx.stroke();
  });

  window.addEventListener("pointerup", () => {
    isDrawing = false;
  });

  document.getElementById("btnClearSignature").addEventListener("click", () => {
    activePointerType = null;
    initSpenCanvas();
    document.getElementById("spenStatusText").textContent = "🖊️ Sẵn sàng nhận bút S-Pen hoặc ngón tay";
  });
}

function updateAdvanceMoneyUI() {
  document.getElementById("advAmountFormatted").textContent = formatVND(currentAdvanceAmount);
  document.getElementById("advAmountWords").textContent = readMoneyVietnamese(currentAdvanceAmount);
  const workerSel = document.getElementById("advWorkerSelect");
  const wName = workerSel.options[workerSel.selectedIndex]?.text || "Thợ";
  document.getElementById("spenLiveBanner").textContent =
    `Ký nhận ứng tiền: ${wName} — ${formatVND(currentAdvanceAmount)}`;
}

function openAdvanceSheet() {
  const workers = store.workers.filter(w => matchesProject(w.projectId));
  if (workers.length === 0) {
    showToast("Vui lòng thêm thợ vào công trình trước khi tạm ứng!");
    return;
  }
  const sel = document.getElementById("advWorkerSelect");
  sel.innerHTML = workers.map(w => `<option value="${w.id}">${w.name} (${w.role})</option>`).join("");
  currentAdvanceAmount = 500000;
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

// Nút cộng tiền nhanh
document.querySelectorAll(".money-chip").forEach(chip => {
  chip.addEventListener("click", () => {
    currentAdvanceAmount += Number(chip.dataset.add);
    updateAdvanceMoneyUI();
  });
});

// Bàn phím số công trường (Numpad)
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
  if (!w) return;

  const allowUnsigned = document.getElementById("chkAllowUnsigned").checked;
  if (!hasSignatureInk && !allowUnsigned) {
    showToast("Vui lòng đưa bút S-Pen cho thợ ký tên, hoặc tích chọn 'Chưa ký'!");
    return;
  }

  const today = store.settings.selectedDate;
  const sigUrl = hasSignatureInk ? spenCanvas.toDataURL("image/png") : null;

  store.advances.push({
    id: "ADV_" + Date.now(),
    projectId: w.projectId,
    workerId: w.id,
    amountVnd: currentAdvanceAmount,
    date: today,
    note: document.getElementById("advNoteInput").value.trim() || "Tạm ứng tiền",
    signedStatus: hasSignatureInk ? "signed" : "unsigned",
    signatureDataUrl: sigUrl,
    signatureHash: `${w.projectId}|${w.id}|${currentAdvanceAmount}|${today}`
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
    a => a.workerId === w.id && isInSelectedPeriod(a.date)
  );
  const advRecords = store.advances.filter(
    a => a.workerId === w.id && isInSelectedPeriod(a.date)
  );

  const totalUnits = attRecords.reduce((s, r) => s + Number(r.units || 0), 0);
  const grossWage = attRecords.reduce((s, r) => s + Number(r.units || 0) * Number(r.rateSnapshot || w.dailyRate), 0);
  const totalAdv = advRecords.reduce((s, r) => s + Number(r.amountVnd || 0), 0);
  const netPay = grossWage - totalAdv;

  const canvas = document.getElementById("payslipRenderCanvas");
  const ctx = canvas.getContext("2d");

  // Nền trắng sạch
  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Header xanh công trình chuẩn PRD
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

  // Chi tiết các lần ứng kèm trạng thái ký
  ctx.fillStyle = "#18312E";
  ctx.font = "bold 17px sans-serif";
  ctx.fillText("Chi tiết các khoản tạm ứng:", 30, 380);

  let yPos = 415;
  if (advRecords.length === 0) {
    ctx.font = "16px sans-serif";
    ctx.fillStyle = "#7E9592";
    ctx.fillText("Không có khoản tạm ứng nào trong kỳ này.", 50, yPos);
    yPos += 30;
  } else {
    advRecords.slice(0, 4).forEach(adv => {
      ctx.font = "15px sans-serif";
      ctx.fillStyle = "#18312E";
      const statusTxt = adv.signedStatus === "signed" ? "[Đã ký S-Pen]" : "[Chưa ký]";
      ctx.fillText(
        `• Ngày ${adv.date}: ${formatVND(adv.amountVnd)} (${adv.note}) ${statusTxt}`,
        40,
        yPos
      );
      yPos += 30;
    });
  }

  // Khung thực lĩnh nổi bật
  ctx.fillStyle = "#D9F3EB";
  ctx.fillRect(30, 650, canvas.width - 60, 120);
  ctx.strokeStyle = "#117D70";
  ctx.lineWidth = 2.5;
  ctx.strokeRect(30, 650, canvas.width - 60, 120);

  ctx.fillStyle = "#0E685D";
  ctx.font = "bold 18px sans-serif";
  ctx.fillText("THỰC LĨNH CÒN NHẬN:", 50, 690);
  ctx.font = "bold 36px sans-serif";
  ctx.fillText(formatVND(netPay), 50, 740);

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
            <div class="item-title">${p.name}</div>
            <div class="item-sub">👤 Chủ: ${p.owner} • 📍 ${p.location}</div>
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
            <div class="item-title">${p.name}</div>
            <div class="item-sub">${p.location} • Chủ: ${p.owner}</div>
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
document.getElementById("btnFloatingProject").addEventListener("click", openProjectPicker);
document.getElementById("btnPickProjectForAtt").addEventListener("click", openProjectPicker);

// Bottom Sheet Tạo công trình mới (Không dùng prompt)
document.getElementById("btnOpenNewProjectSheet")?.addEventListener("click", () => {
  document.getElementById("newPrjName").value = "";
  document.getElementById("newPrjOwner").value = "";
  document.getElementById("newPrjLocation").value = "";
  document.getElementById("newPrjStartDate").value = new Date().toISOString().slice(0, 10);
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
  const startDate = document.getElementById("newPrjStartDate").value || new Date().toISOString().slice(0, 10);

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

// Bottom Sheet Thêm thợ mới (Không dùng prompt)
document.getElementById("btnOpenAddWorkerModal")?.addEventListener("click", () => {
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
  const role = document.getElementById("newWorkerRole").value;
  const rate = Number(document.getElementById("newWorkerRate").value) || 450000;
  const prjId = store.settings.selectedProjectId === "ALL" ? store.projects[0].id : store.settings.selectedProjectId;

  store.workers.push({
    id: "W" + (store.workers.length + 1),
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

// Thu chi nhanh (Không dùng prompt)
document.getElementById("btnOpenCashInSheet")?.addEventListener("click", () => {
  document.getElementById("sheetCashInForm").hidden = false;
});

document.getElementById("btnSubmitCashIn")?.addEventListener("click", () => {
  const amount = Number(document.getElementById("cashInAmount").value);
  if (!amount || amount <= 0) {
    showToast("Vui lòng nhập số tiền hợp lệ!");
    return;
  }
  const note = document.getElementById("cashInNote").value.trim() || "Chủ nhà tạm ứng";
  const prjId = store.settings.selectedProjectId === "ALL" ? store.projects[0].id : store.settings.selectedProjectId;

  store.cashTransactions.push({
    id: "CSH_" + Date.now(),
    projectId: prjId,
    type: "in",
    amountVnd: amount,
    category: note,
    date: store.settings.selectedDate
  });
  saveStore();
  document.getElementById("sheetCashInForm").hidden = true;
  renderAll();
  showToast(`Đã lưu khoản thu ${formatVND(amount)}!`);
});

document.getElementById("btnOpenCashOutSheet")?.addEventListener("click", () => {
  document.getElementById("sheetCashOutForm").hidden = false;
});

document.getElementById("btnSubmitCashOut")?.addEventListener("click", () => {
  const amount = Number(document.getElementById("cashOutAmount").value);
  if (!amount || amount <= 0) {
    showToast("Vui lòng nhập số tiền chi!");
    return;
  }
  const note = document.getElementById("cashOutNote").value.trim() || "Chi phí phát sinh";
  const prjId = store.settings.selectedProjectId === "ALL" ? store.projects[0].id : store.settings.selectedProjectId;

  store.cashTransactions.push({
    id: "CSH_" + Date.now(),
    projectId: prjId,
    type: "out",
    amountVnd: amount,
    category: note,
    date: store.settings.selectedDate
  });
  saveStore();
  document.getElementById("sheetCashOutForm").hidden = true;
  renderAll();
  showToast(`Đã lưu chi phí ${formatVND(amount)}!`);
});

// Nhập vật tư
document.getElementById("btnOpenMaterialSheet").addEventListener("click", () => {
  document.getElementById("sheetMaterialForm").hidden = false;
});

document.getElementById("btnSaveMaterial").addEventListener("click", () => {
  const prjId = store.settings.selectedProjectId === "ALL"
    ? store.projects[0].id
    : store.settings.selectedProjectId;

  const name = document.getElementById("matNameInput").value.trim() || "Vật tư xây dựng";
  const qty = Number(document.getElementById("matQtyInput").value) || 1;
  const unit = document.getElementById("matUnitSelect").value;
  const price = Number(document.getElementById("matPriceInput").value) || 0;
  const vendor = document.getElementById("matVendorInput").value.trim() || "Đại lý VLXD";
  const status = document.getElementById("matPaidStatus").value;

  store.materials.push({
    id: "MAT_" + Date.now(),
    projectId: prjId,
    name,
    qty,
    unit,
    unitPrice: price,
    vendor,
    paidStatus: status,
    date: store.settings.selectedDate
  });
  saveStore();
  document.getElementById("sheetMaterialForm").hidden = true;
  renderAll();
  showToast(`Đã lưu phiếu vật tư: ${name}!`);
});

// Xuất file Excel .xlsx thật đa sheet
document.getElementById("btnExportExcel").addEventListener("click", () => {
  if (typeof XLSX === "undefined") {
    exportBackupJson();
    return;
  }
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(store.projects), "CongTrinh");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(store.workers), "DoiTho");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(store.attendance), "ChamCong");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(store.advances.map(a => ({
    ...a,
    signatureDataUrl: a.signedStatus === "signed" ? "[Có chữ ký S-Pen]" : "Chưa ký"
  }))), "TamUng");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(store.materials), "VatTu");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(store.cashTransactions), "ThuChi");

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

document.querySelectorAll("[data-close]").forEach(btn => {
  btn.addEventListener("click", () => {
    document.getElementById(btn.dataset.close).hidden = true;
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
  const d = new Date(store.settings.selectedDate);
  d.setDate(d.getDate() + days);
  store.settings.selectedDate = d.toISOString().slice(0, 10);
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
  const [y, m] = store.settings.selectedMonth.split("-").map(Number);
  let newD = new Date(y, m - 1 + delta, 1);
  const newY = newD.getFullYear();
  const newM = String(newD.getMonth() + 1).padStart(2, '0');
  store.settings.selectedMonth = `${newY}-${newM}`;
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

// Khởi chạy
renderAll();
