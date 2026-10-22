/**
 * GRIDCRAFT 2.0 — SỔ CÔNG TRÌNH (SAMSUNG GALAXY S23 ULTRA EDITION)
 * Bảo toàn lịch sử, hỗ trợ đa dự án, rate_snapshot, S-Pen Palm Rejection & Visual Payslip
 */

const STORAGE_KEY = "GRIDCRAFT_SO_CONG_TRINH_V2";

// Dữ liệu mẫu khởi tạo chuẩn thực tế (2 công trình đang làm, 1 đã hoàn thành)
function createDefaultStore() {
  const today = new Date().toISOString().slice(0, 10);
  const currentMonth = today.slice(0, 7);
  return {
    version: 2,
    settings: {
      selectedProjectId: "PRJ_NINH_KIEU", // Hoặc "ALL"
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
        location: "Q. Ninh Kiều, Cần Thơ",
        status: "active",
        startDate: "2026-09-01"
      },
      {
        id: "PRJ_CAI_RANG",
        name: "Biệt thự Cái Răng",
        owner: "Chị Lan",
        location: "KDC Nam Long, Cần Thơ",
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
      { id: "W04", name: "Phạm Văn Út", role: "Thợ phụ hồ", dailyRate: 330000, projectId: "PRJ_NINH_KIEU" },
      { id: "W05", name: "Võ Minh Tâm", role: "Thợ điện nước", dailyRate: 480000, projectId: "PRJ_CAI_RANG" },
      { id: "W06", name: "Đặng Văn Hùng", role: "Thợ phụ hồ", dailyRate: 340000, projectId: "PRJ_CAI_RANG" }
    ],
    // Chấm công: lưu cứng rateSnapshot tại thời điểm chấm
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
        note: "Ứng tiền xăng & ăn sáng",
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
        paidStatus: "debt", // "debt" (Nợ đại lý) | "paid" (Đã trả tiền mặt)
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
        type: "in", // "in" (Chủ nhà ứng) | "out" (Chi lặt vặt)
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

// Định dạng tiền VND chuẩn
function formatVND(num) {
  const n = Math.round(Number(num) || 0);
  return n.toLocaleString("vi-VN") + " đ";
}

// Đọc số tiền bằng chữ tiếng Việt (Chống bấm thừa số 0)
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

// Kiểm tra ngày có nằm trong kỳ đang chọn không
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
  // Chế độ Tuần: +/- 3 ngày quanh selectedDate
  const target = new Date(store.settings.selectedDate).getTime();
  const cur = new Date(dateStr).getTime();
  const diffDays = Math.abs(cur - target) / (1000 * 3600 * 24);
  return diffDays <= 3.5;
}

function matchesProject(itemProjectId) {
  const sel = store.settings.selectedProjectId;
  return sel === "ALL" || itemProjectId === sel;
}

// Tính toán tài chính chuẩn xác (Tách biệt Tồn quỹ tiền mặt và Công nợ vật tư)
function calculateFinancials() {
  // 1. Tồn quỹ lũy kế (Từ đầu đến nay của công trình đang chọn)
  let totalCashIn = 0;
  let totalCashOut = 0;

  // 2. Phát sinh trong kỳ
  let periodCashIn = 0;
  let periodCashOut = 0;
  let periodAttendanceUnits = 0;
  let periodAdvanceTotal = 0;
  let openMaterialDebt = 0;

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

  store.advances.forEach(adv => {
    if (!matchesProject(adv.projectId)) return;
    totalCashOut += adv.amountVnd;
    if (isInSelectedPeriod(adv.date)) {
      periodCashOut += adv.amountVnd;
      periodAdvanceTotal += adv.amountVnd;
    }
  });

  store.materials.forEach(mat => {
    if (!matchesProject(mat.projectId)) return;
    const cost = mat.qty * mat.unitPrice;
    if (mat.paidStatus === "paid") {
      totalCashOut += cost;
      if (isInSelectedPeriod(mat.date)) periodCashOut += cost;
    } else {
      // Nợ đại lý KHÔNG trừ vào tiền mặt
      openMaterialDebt += cost;
    }
  });

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
  renderHeaderAndPeriod();
  renderOverviewTab();
  renderAttendanceTab();
  renderMoneyTab();
  renderProjectsTab();
}

function renderHeaderAndPeriod() {
  const selId = store.settings.selectedProjectId;
  const prj = store.projects.find(p => p.id === selId);
  const nameEl = document.getElementById("headerProjectName");
  const floatNameEl = document.getElementById("floatingProjectShortName");
  const dotEl = document.getElementById("headerProjectDot");

  if (selId === "ALL" || !prj) {
    nameEl.textContent = "Tất cả công trình (" + store.projects.length + ")";
    floatNameEl.textContent = "Tất cả CT";
    dotEl.style.background = "#0D7A5F";
  } else {
    nameEl.textContent = prj.name;
    floatNameEl.textContent = prj.name.replace("Nhà phố ", "").replace("Biệt thự ", "");
    dotEl.style.background = prj.status === "completed" ? "#64748B" : "#0D7A5F";
  }

  // Nhãn kỳ
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

  document.getElementById("privacyEyeIcon").textContent = hide ? "🙈 Đang ẩn" : "👁️ Hiện";
  document.getElementById("heroCashBalance").textContent = hide
    ? "••••••••• đ"
    : formatVND(fin.cumulativeBalance);

  document.getElementById("heroPeriodSummary").textContent = hide
    ? "Trong kỳ: ••••••••"
    : `Trong kỳ: Thu +${formatVND(fin.periodCashIn)} • Chi -${formatVND(fin.periodCashOut)}`;

  const activeWorkers = store.workers.filter(w => matchesProject(w.projectId)).length;
  document.getElementById("kpiTotalAttendance").textContent = `${fin.periodAttendanceUnits} công`;
  document.getElementById("kpiWorkerCount").textContent = `${activeWorkers} thợ thuộc phạm vi`;

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
        ⚠️ Có <strong>${unsignedCount} phiếu ứng tiền chưa ký tên</strong>. Chạm vào Sổ tiền để thợ ký bổ sung bằng S-Pen.
      </div>
    `;
  }

  // Danh sách công trình gọn
  const listEl = document.getElementById("overviewProjectList");
  listEl.innerHTML = store.projects.map(p => {
    const wCount = store.workers.filter(w => w.projectId === p.id).length;
    const isSel = store.settings.selectedProjectId === p.id;
    return `
      <div class="item-card" style="${isSel ? 'border-color: var(--brand-primary); border-width:2px;' : ''}">
        <div class="item-card-row">
          <div>
            <div class="item-title">${p.name}</div>
            <div class="item-sub">📍 ${p.location} • Chủ: ${p.owner} • 👷 ${wCount} thợ</div>
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

    return `
      <div class="worker-att-card">
        <div class="worker-att-top">
          <div>
            <div class="worker-name">${w.name}</div>
            <div class="worker-role-rate">${w.role} • ${formatVND(rateShown)}/công</div>
          </div>
          <span class="badge ${val === null ? 'badge-amber' : 'badge-green'}">
            ${val === null ? 'Chưa ghi' : val + ' công'}
          </span>
        </div>
        <div class="att-pills-group">
          <button class="att-pill-btn ${val === 1.0 ? 'active-1' : ''}" onclick="setWorkerAttendance('${w.id}', 1.0)">1.0 Đủ</button>
          <button class="att-pill-btn ${val === 0.5 ? 'active-05' : ''}" onclick="setWorkerAttendance('${w.id}', 0.5)">0.5 Nửa</button>
          <button class="att-pill-btn ${val === 1.5 ? 'active-15' : ''}" onclick="setWorkerAttendance('${w.id}', 1.5)">1.5 TC</button>
          <button class="att-pill-btn ${val === 0 ? 'active-0' : ''}" onclick="setWorkerAttendance('${w.id}', 0)">Nghỉ</button>
        </div>
      </div>
    `;
  }).join("");

  document.getElementById("attendanceWorkerList").innerHTML =
    listHtml || `<div class="item-card">Chưa có thợ nào trong công trình này.</div>`;

  document.getElementById("attendanceSummaryStrip").textContent =
    `Đủ công: ${count1} • Nửa: ${count05} • Tăng ca: ${count15} • Nghỉ: ${count0}` +
    (countUnset > 0 ? ` • (Chưa chấm: ${countUnset})` : "");
}

// Chấm công 1 chạm cho từng thợ (Lưu cứng rateSnapshot)
window.setWorkerAttendance = function(workerId, units) {
  const w = store.workers.find(x => x.id === workerId);
  if (!w) return;
  const prj = store.projects.find(p => p.id === w.projectId);
  if (prj && prj.status === "completed") {
    alert("Công trình này đã hoàn thành (Chế độ chỉ đọc). Không thể sửa công!");
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

// Điểm danh cả đội 1 chạm + Cảnh báo ghi đè + Hoàn tác (Undo)
document.getElementById("btnMarkAllFullDay").addEventListener("click", () => {
  const prjId = store.settings.selectedProjectId;
  if (prjId === "ALL") return;
  const dateStr = store.settings.selectedDate;
  const workers = store.workers.filter(w => w.projectId === prjId);

  const alreadyMarked = store.attendance.some(
    a => a.projectId === prjId && a.date === dateStr && a.units !== 1.0
  );

  if (alreadyMarked) {
    const ok = confirm("Hôm nay đã có thợ được ghi Nửa công / Nghỉ / Tăng ca. Bạn có chắc muốn ghi đè tất cả thành 1.0 công?");
    if (!ok) return;
  }

  // Lưu snapshot để Hoàn tác
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

// ================= RENDER SỔ TIỀN (4 PHÂN MỤC) =================
function renderMoneyTab() {
  // 1. Danh sách Tạm ứng
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
            <div class="item-title">${w ? w.name : 'Thợ'} — <span class="text-amber">${formatVND(a.amountVnd)}</span></div>
            <div class="item-sub">📅 ${a.date} • ${a.note || 'Tạm ứng'}</div>
          </div>
          <span class="badge ${a.signedStatus === 'signed' ? 'badge-green' : 'badge-amber'}">
            ${a.signedStatus === 'signed' ? '✍️ Đã ký S-Pen' : '⚠️ Chưa ký'}
          </span>
        </div>
        ${a.signatureDataUrl ? `<img src="${a.signatureDataUrl}" alt="Chữ ký" style="height:48px; margin-top:8px; border:1px solid #CBD5E1; border-radius:6px; background:#FFF;" />` : ''}
      </div>
    `;
  }).join("") || `<div class="item-card">Chưa có phiếu ứng tiền nào trong kỳ này.</div>`;

  // 2. Bảng lương tự động theo rateSnapshot
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
            <div class="item-sub">${w.role} • Tổng: <strong>${totalUnits} công</strong></div>
          </div>
          <span class="badge ${isPaid ? 'badge-green' : (netPay < 0 ? 'badge-red' : 'badge-blue')}">
            ${isPaid ? '✅ Đã trả lương' : (netPay < 0 ? 'Dư ứng chuyển kỳ sau' : 'Chờ tất toán')}
          </span>
        </div>
        <div style="margin: 10px 0; font-size:14px; display:flex; justify-content:space-between;">
          <span>Lương gộp: <strong>${formatVND(grossWage)}</strong></span>
          <span>Đã ứng: <strong class="text-amber">-${formatVND(totalAdv)}</strong></span>
        </div>
        <div style="display:flex; justify-content:space-between; align-items:center; padding-top:8px; border-top:1px solid var(--border-subtle);">
          <div>
            <small style="color:var(--text-muted); font-weight:700;">THỰC LĨNH CÒN LẠI</small>
            <div style="font-size:22px; font-weight:900; color:var(--brand-primary);">
              ${netPay >= 0 ? formatVND(netPay) : 'Âm ' + formatVND(Math.abs(netPay))}
            </div>
          </div>
          <div style="display:flex; gap:6px;">
            <button class="date-Step-btn" onclick="openVisualPayslip('${w.id}')">📤 Phiếu Zalo</button>
            ${!isPaid && netPay > 0 ? `<button class="date-Step-btn" style="background:var(--brand-primary);color:#FFF;" onclick="markPayrollPaid('${w.id}')">Chốt trả</button>` : ''}
          </div>
        </div>
      </div>
    `;
  }).join("");

  // 3. Vật tư
  const mats = store.materials.filter(m => matchesProject(m.projectId));
  document.getElementById("materialsHistoryList").innerHTML = mats.map(m => {
    const total = m.qty * m.unitPrice;
    return `
      <div class="item-card">
        <div class="item-card-row">
          <div>
            <div class="item-title">${m.name} (${m.qty} ${m.unit})</div>
            <div class="item-sub">🏪 ${m.vendor} • ${formatVND(total)}</div>
          </div>
          <span class="badge ${m.paidStatus === 'paid' ? 'badge-green' : 'badge-red'}">
            ${m.paidStatus === 'paid' ? 'Đã trả TM' : 'Đang nợ đại lý'}
          </span>
        </div>
        ${m.paidStatus === 'debt' ? `
          <button class="date-Step-btn" style="margin-top:8px; width:100%;" onclick="settleMaterialDebt('${m.id}')">
            💵 Đánh dấu Đã trả tiền mặt cho đại lý
          </button>
        ` : ''}
      </div>
    `;
  }).join("");

  // 4. Thu chi
  const txs = store.cashTransactions.filter(t => matchesProject(t.projectId));
  document.getElementById("cashflowHistoryList").innerHTML = txs.map(t => `
    <div class="item-card">
      <div class="item-card-row">
        <div>
          <div class="item-title">${t.category}</div>
          <div class="item-sub">📅 ${t.date}</div>
        </div>
        <strong class="${t.type === 'in' ? 'text-brand' : 'text-danger'}" style="font-size:18px;">
          ${t.type === 'in' ? '+' : '-'}${formatVND(t.amountVnd)}
        </strong>
      </div>
    </div>
  `).join("");
}

window.markPayrollPaid = function(workerId) {
  const w = store.workers.find(x => x.id === workerId);
  if (!w) return;
  const payKey = `${w.projectId}_${w.id}_${store.settings.selectedMonth}`;
  store.payrollStatus[payKey] = "paid";
  saveStore();
  renderAll();
};

window.settleMaterialDebt = function(matId) {
  const mat = store.materials.find(m => m.id === matId);
  if (!mat) return;
  mat.paidStatus = "paid";
  saveStore();
  renderAll();
};

// ================= KHUNG KÝ S-PEN (PALM REJECTION) & BÀN PHÍM TIỀN =================
const spenCanvas = document.getElementById("spenCanvas");
const spenCtx = spenCanvas ? spenCanvas.getContext("2d") : null;
let isDrawing = false;
let hasSignatureInk = false;
let activePointerType = null;

function initSpenCanvas() {
  if (!spenCtx) return;
  spenCtx.fillStyle = "#FFFFFF";
  spenCtx.fillRect(0, 0, spenCanvas.width, spenCanvas.height);
  spenCtx.strokeStyle = "#0F1715";
  spenCtx.lineWidth = 2.6;
  spenCtx.lineCap = "round";
  spenCtx.lineJoin = "round";
  hasSignatureInk = false;
}

if (spenCanvas) {
  spenCanvas.addEventListener("pointerdown", e => {
    // Nếu phát hiện bút S-Pen, ưu tiên tuyệt đối và chặn tỳ tay
    if (e.pointerType === "pen") {
      activePointerType = "pen";
      document.getElementById("spenStatusText").textContent = "🖊️ Đang nhận nét bút S-Pen (Đã khóa chạm tay)";
    } else if (activePointerType === "pen" && e.pointerType === "touch") {
      return; // Chống chạm nhầm cạnh bàn tay khi đang cầm S-Pen
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
    `${wName} — Ký nhận ứng ${formatVND(currentAdvanceAmount)}`;
}

// Mở form ứng tiền
function openAdvanceSheet() {
  const workers = store.workers.filter(w => matchesProject(w.projectId));
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

// Xử lý phím cộng tiền nhanh
document.querySelectorAll(".money-chip").forEach(chip => {
  chip.addEventListener("click", () => {
    currentAdvanceAmount += Number(chip.dataset.add);
    updateAdvanceMoneyUI();
  });
});

// Xử lý bàn phím số công trường (Custom Numpad)
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
    alert("Vui lòng đưa bút S-Pen cho thợ ký nhận, hoặc tích chọn 'Chưa ký' nếu thợ vắng mặt!");
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
    note: document.getElementById("advNoteInput").value.trim() || "Ứng tiền giữa tuần",
    signedStatus: hasSignatureInk ? "signed" : "unsigned",
    signatureDataUrl: sigUrl,
    signatureHash: `${w.projectId}|${w.id}|${currentAdvanceAmount}|${today}`
  });

  saveStore();
  document.getElementById("sheetAdvanceForm").hidden = true;
  renderAll();
});

// ================= VẼ PHIẾU LƯƠNG ẢNH (VISUAL PAYSLIP CARD GỬI ZALO) =================
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

  // Nền phiếu trắng sạch
  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Header xanh công trình
  ctx.fillStyle = "#0D7A5F";
  ctx.fillRect(0, 0, canvas.width, 110);
  ctx.fillStyle = "#FFFFFF";
  ctx.font = "bold 28px sans-serif";
  ctx.fillText("PHIẾU QUYẾT TOÁN LƯƠNG THỢ", 28, 50);
  ctx.font = "18px sans-serif";
  ctx.fillText(`Công trình: ${prj ? prj.name : ''} • Kỳ: ${store.settings.selectedMonth}`, 28, 85);

  // Thông tin thợ
  ctx.fillStyle = "#0F1715";
  ctx.font = "bold 24px sans-serif";
  ctx.fillText(`Họ tên thợ: ${w.name}`, 28, 160);
  ctx.font = "18px sans-serif";
  ctx.fillStyle = "#334155";
  ctx.fillText(`Vai trò: ${w.role}  |  Đơn giá chuẩn: ${formatVND(w.dailyRate)}/công`, 28, 192);

  // Khung tổng hợp công
  ctx.fillStyle = "#F1F5F3";
  ctx.fillRect(28, 215, canvas.width - 56, 130);
  ctx.strokeStyle = "#CBD5E1";
  ctx.strokeRect(28, 215, canvas.width - 56, 130);

  ctx.fillStyle = "#0F1715";
  ctx.font = "bold 20px sans-serif";
  ctx.fillText(`1. Tổng ngày công trong kỳ: ${totalUnits} công`, 48, 255);
  ctx.fillText(`2. Thành tiền lương gộp: ${formatVND(grossWage)}`, 48, 290);
  ctx.fillStyle = "#B45309";
  ctx.fillText(`3. Tổng tiền đã tạm ứng: -${formatVND(totalAdv)} (${advRecords.length} lần)`, 48, 325);

  // Danh sách các lần ứng
  ctx.fillStyle = "#0F1715";
  ctx.font = "bold 18px sans-serif";
  ctx.fillText("Chi tiết các khoản đã tạm ứng:", 28, 385);

  let yPos = 420;
  advRecords.slice(0, 4).forEach((adv, idx) => {
    ctx.font = "17px sans-serif";
    ctx.fillStyle = "#1E293B";
    const statusTxt = adv.signedStatus === "signed" ? "[Đã ký S-Pen]" : "[Chưa ký]";
    ctx.fillText(
      `• Ngày ${adv.date}: ${formatVND(adv.amountVnd)} (${adv.note}) ${statusTxt}`,
      36,
      yPos
    );
    yPos += 34;
  });

  // Khung Thực lĩnh cuối cùng
  ctx.fillStyle = "#D1FAE5";
  ctx.fillRect(28, 640, canvas.width - 56, 120);
  ctx.strokeStyle = "#0D7A5F";
  ctx.lineWidth = 3;
  ctx.strokeRect(28, 640, canvas.width - 56, 120);

  ctx.fillStyle = "#065F46";
  ctx.font = "bold 20px sans-serif";
  ctx.fillText("THỰC LĨNH CÒN NHẬN:", 48, 682);
  ctx.font = "bold 38px sans-serif";
  ctx.fillText(formatVND(netPay), 48, 732);

  document.getElementById("sheetPayslipPreview").hidden = false;
};

// Chia sẻ ảnh Phiếu Lương qua Web Share API (Zalo) hoặc tải xuống
document.getElementById("btnSharePayslipImage").addEventListener("click", async () => {
  const canvas = document.getElementById("payslipRenderCanvas");
  canvas.toBlob(async blob => {
    if (!blob) return;
    const file = new File([blob], "Phieu_Luong_GridCraft.png", { type: "image/png" });
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
    // Fallback tải ảnh nếu trình duyệt không hỗ trợ share file trực tiếp
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
  alert("Đã sao chép nội dung phiếu lương! Bạn có thể dán vào Zalo.");
});

// ================= QUẢN LÝ CÔNG TRÌNH & CHUYỂN ĐỔI =================
function renderProjectsTab() {
  const q = (document.getElementById("projectSearchInput").value || "").toLowerCase();
  const list = store.projects.filter(p =>
    p.name.toLowerCase().includes(q) ||
    p.owner.toLowerCase().includes(q) ||
    p.location.toLowerCase().includes(q)
  );

  document.getElementById("projectsManageList").innerHTML = list.map(p => {
    const wCount = store.workers.filter(w => w.projectId === p.id).length;
    return `
      <div class="item-card">
        <div class="item-card-row">
          <div>
            <div class="item-title">${p.name}</div>
            <div class="item-sub">👤 Chủ nhà: ${p.owner} • 📍 ${p.location}</div>
            <div class="item-sub">📅 Bắt đầu: ${p.startDate} • 👷 ${wCount} thợ</div>
          </div>
          <span class="badge ${p.status === 'active' ? 'badge-green' : 'badge-amber'}">
            ${p.status === 'active' ? 'Đang làm' : 'Đã xong'}
          </span>
        </div>
        <div style="display:flex; gap:8px; margin-top:10px;">
          <button class="date-Step-btn" style="flex:1;" onclick="selectProject('${p.id}')">🎯 Chọn làm việc</button>
          <button class="date-Step-btn" onclick="toggleProjectArchive('${p.id}')">
            ${p.status === 'active' ? '🔒 Chốt hoàn thành' : '🔓 Mở khóa'}
          </button>
        </div>
      </div>
    `;
  }).join("");
}

window.selectProject = function(prjId) {
  store.settings.selectedProjectId = prjId;
  saveStore();
  document.getElementById("sheetProjectPicker").hidden = true;
  renderAll();
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

// Mở Sheet chọn công trình (1 tay)
function openProjectPicker() {
  const container = document.getElementById("projectPickerList");
  const isAll = store.settings.selectedProjectId === "ALL";
  let html = `
    <div class="item-card" onclick="selectProject('ALL')" style="cursor:pointer; ${isAll ? 'border:2px solid var(--brand-primary);' : ''}">
      <div class="item-title">🌐 Xem Tất Cả Công Trình (${store.projects.length})</div>
      <div class="item-sub">Tổng hợp dòng tiền, công nợ của toàn bộ công trình</div>
    </div>
  `;
  html += store.projects.map(p => {
    const active = store.settings.selectedProjectId === p.id;
    return `
      <div class="item-card" onclick="selectProject('${p.id}')" style="cursor:pointer; ${active ? 'border:2px solid var(--brand-primary);' : ''}">
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

// Thêm công trình mới
document.getElementById("btnOpenNewProjectSheet")?.addEventListener("click", () => {
  const name = prompt("Nhập tên công trình mới (VD: Nhà Chú Năm):");
  if (!name) return;
  const owner = prompt("Nhập tên chủ nhà:") || "Chủ nhà";
  const location = prompt("Nhập địa điểm công trình:") || "Địa chỉ";

  const newPrj = {
    id: "PRJ_" + Date.now(),
    name,
    owner,
    location,
    status: "active",
    startDate: new Date().toISOString().slice(0, 10)
  };
  store.projects.push(newPrj);
  store.settings.selectedProjectId = newPrj.id;
  saveStore();
  renderAll();
  alert(`Đã tạo công trình "${name}" thành công!`);
});

// Thêm thợ mới
document.getElementById("btnOpenAddWorkerModal")?.addEventListener("click", () => {
  const prjId = store.settings.selectedProjectId === "ALL" ? store.projects[0].id : store.settings.selectedProjectId;
  const name = prompt("Nhập tên thợ mới (VD: Anh Năm):");
  if (!name) return;
  const role = prompt("Nhập vai trò (Thợ chính, Thợ phụ, Thợ sơn...):") || "Thợ xây";
  const rateStr = prompt("Nhập mức lương 1 ngày công (VND):", "450000");
  const rate = Number(rateStr) || 450000;

  store.workers.push({
    id: "W" + (store.workers.length + 1),
    name,
    role,
    dailyRate: rate,
    projectId: prjId
  });
  saveStore();
  renderAll();
  alert(`Đã thêm thợ "${name}" thành công!`);
});

// Thu chi nhanh
document.getElementById("btnOpenCashInSheet")?.addEventListener("click", () => {
  const prjId = store.settings.selectedProjectId === "ALL" ? store.projects[0].id : store.settings.selectedProjectId;
  const amountStr = prompt("Nhập số tiền chủ nhà tạm ứng (VND):", "20000000");
  const amount = Number(amountStr);
  if (!amount) return;
  const note = prompt("Ghi chú đợt ứng:", "Chủ nhà ứng đợt mới") || "Chủ nhà ứng";

  store.cashTransactions.push({
    id: "CSH_" + Date.now(),
    projectId: prjId,
    type: "in",
    amountVnd: amount,
    category: note,
    date: store.settings.selectedDate
  });
  saveStore();
  renderAll();
  alert("Đã ghi nhận tiền chủ nhà ứng!");
});

document.getElementById("btnOpenCashOutSheet")?.addEventListener("click", () => {
  const prjId = store.settings.selectedProjectId === "ALL" ? store.projects[0].id : store.settings.selectedProjectId;
  const amountStr = prompt("Nhập số tiền chi phí phát sinh (VND):", "500000");
  const amount = Number(amountStr);
  if (!amount) return;
  const note = prompt("Lý do chi lặt vặt (Xăng xe, ăn uống, đồ điện...):", "Chi phí lặt vặt") || "Chi phát sinh";

  store.cashTransactions.push({
    id: "CSH_" + Date.now(),
    projectId: prjId,
    type: "out",
    amountVnd: amount,
    category: note,
    date: store.settings.selectedDate
  });
  saveStore();
  renderAll();
  alert("Đã ghi nhận chi phí!");
});

// ================= NHẬP VẬT TƯ & XUẤT EXCEL (.XLSX) =================
document.getElementById("btnOpenMaterialSheet").addEventListener("click", () => {
  document.getElementById("sheetMaterialForm").hidden = false;
});

document.getElementById("btnSaveMaterial").addEventListener("click", () => {
  const prjId = store.settings.selectedProjectId === "ALL"
    ? store.projects[0].id
    : store.settings.selectedProjectId;

  store.materials.push({
    id: "MAT_" + Date.now(),
    projectId: prjId,
    name: document.getElementById("matNameInput").value.trim() || "Vật tư xây dựng",
    qty: Number(document.getElementById("matQtyInput").value) || 1,
    unit: document.getElementById("matUnitSelect").value,
    unitPrice: Number(document.getElementById("matPriceInput").value) || 0,
    vendor: document.getElementById("matVendorInput").value.trim() || "Đại lý VLXD",
    paidStatus: document.getElementById("matPaidStatus").value,
    date: store.settings.selectedDate
  });
  saveStore();
  document.getElementById("sheetMaterialForm").hidden = true;
  renderAll();
});

// Xuất file Excel .xlsx thật với đa Sheet
document.getElementById("btnExportExcel").addEventListener("click", () => {
  if (typeof XLSX === "undefined") {
    alert("Đang ngoại tuyến hoặc chưa tải thư viện Excel. Đang xuất bản sao lưu JSON thay thế.");
    exportBackupJson();
    return;
  }
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(store.projects), "CongTrinh");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(store.workers), "DoiTho");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(store.attendance), "ChamCong");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(store.advances.map(a => ({
    ...a,
    signatureDataUrl: a.signedStatus === "signed" ? "[Đã có chữ ký S-Pen]" : "Chưa ký"
  }))), "TamUng");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(store.materials), "VatTu");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(store.cashTransactions), "ThuChi");

  XLSX.writeFile(wb, `So_Cong_Trinh_GridCraft_${store.settings.selectedDate}.xlsx`);
});

function exportBackupJson() {
  const blob = new Blob([JSON.stringify(store, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `SaoLuu_SoCongTrinh_${store.settings.selectedDate}.json`;
  a.click();
}

document.getElementById("btnBackupRestore").addEventListener("click", exportBackupJson);

// ================= SỰ KIỆN ĐIỀU HƯỚNG & TIỆN ÍCH =================
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

// Bộ lọc kỳ Tuần / Tháng / Năm
document.querySelectorAll(".period-tab").forEach(btn => {
  btn.addEventListener("click", () => {
    store.settings.periodMode = btn.dataset.mode;
    saveStore();
    renderAll();
  });
});

document.getElementById("projectSearchInput")?.addEventListener("input", renderProjectsTab);

// Khởi chạy lần đầu
renderAll();
