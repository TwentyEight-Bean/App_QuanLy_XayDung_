/**
 * GRIDCRAFT CONTRACTOR MOBILE — S23 ULTRA EDITION
 * Data management, S-Pen Signature, Attendance, Payroll, Material & Cashflow
 */

// ==========================================
// 1. STATE & SAMPLE DATA
// ==========================================
const DB_KEY = 'gridcraft_contractor_db_v1';

const DEFAULT_STATE = {
  theme: 'dark',
  currentDate: new Date().toISOString().split('T')[0],
  workers: [
    { id: 'w1', name: 'Anh Ba Hưng', phone: '0908123456', role: 'Thợ chính (Xây/Tô)', rate: 500000 },
    { id: 'w2', name: 'Chú Tám Đạt', phone: '0913987654', role: 'Thợ chính (Xây/Tô)', rate: 480000 },
    { id: 'w3', name: 'Tuấn Còi',    phone: '0977223344', role: 'Thợ phụ (Trộn hồ/Khuân vác)', rate: 350000 },
    { id: 'w4', name: 'Hùng Sắt',    phone: '0988556677', role: 'Thợ sắt cốt pha', rate: 450000 },
    { id: 'w5', name: 'Minh Điện',   phone: '0933445566', role: 'Thợ điện nước', rate: 500000 },
    { id: 'w6', name: 'Lộc Sơn',     phone: '0944112233', role: 'Thợ sơn nước', rate: 420000 },
    { id: 'w7', name: 'Văn Phụ',     phone: '0966778899', role: 'Thợ phụ', rate: 350000 },
    { id: 'w8', name: 'Khánh Phụ',   phone: '0909001122', role: 'Thợ phụ', rate: 350000 }
  ],
  // Map of "date_workerId": 1.0 | 0.5 | 1.5 | 0
  attendance: {
    // Generated dynamically or loaded
  },
  advances: [
    { id: 'a1', workerId: 'w3', workerName: 'Tuấn Còi', amount: 1000000, date: '2026-10-20', note: 'Ứng tiền đóng tiền nhà trọ', hasSig: true },
    { id: 'a2', workerId: 'w1', workerName: 'Anh Ba Hưng', amount: 2000000, date: '2026-10-21', note: 'Gửi tiền về quê cho vợ', hasSig: true },
    { id: 'a3', workerId: 'w4', workerName: 'Hùng Sắt', amount: 1500000, date: '2026-10-22', note: 'Ứng tiền sửa xe máy', hasSig: true }
  ],
  materials: [
    { id: 'm1', name: 'Xi măng Hà Tiên PCB40', qty: 50, unit: 'Bao', price: 92000, total: 4600000, supplier: 'Vựa Bảy Cường', status: 'paid', date: '2026-10-18' },
    { id: 'm2', name: 'Cát vàng tô trát', qty: 6, unit: 'Khối', price: 380000, total: 2280000, supplier: 'Vựa Bảy Cường', status: 'paid', date: '2026-10-19' },
    { id: 'm3', name: 'Thép Pomina phi 10', qty: 80, unit: 'Cây', price: 135000, total: 10800000, supplier: 'Công ty Thép Việt', status: 'debt', date: '2026-10-21' },
    { id: 'm4', name: 'Gạch tuynel 4 lỗ', qty: 4000, unit: 'Viên', price: 1200, total: 4800000, supplier: 'Lò gạch Tân Uyên', status: 'paid', date: '2026-10-22' }
  ],
  cashflow: {
    ownerAdvances: 120000000, // Tiền chủ nhà đưa
    otherExpenses: 1350000     // Xăng xe, ăn uống lặt vặt
  }
};

let appState = loadState();

function loadState() {
  try {
    const raw = localStorage.getItem(DB_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) {
    console.error('Failed to load localStorage', e);
  }
  return JSON.parse(JSON.stringify(DEFAULT_STATE));
}

function saveState() {
  try {
    localStorage.setItem(DB_KEY, JSON.stringify(appState));
  } catch (e) {
    console.error('Failed to save localStorage', e);
  }
  updateStats();
}

function formatVND(num) {
  return new Intl.NumberFormat('vi-VN').format(num) + 'đ';
}

function formatDateVN(dateStr) {
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
  return dateStr;
}

// ==========================================
// 2. DOM ELEMENTS
// ==========================================
const views = {
  attendance: document.getElementById('viewAttendance'),
  advance: document.getElementById('viewAdvance'),
  payroll: document.getElementById('viewPayroll'),
  materials: document.getElementById('viewMaterials'),
  excel: document.getElementById('viewExcel')
};

const navItems = document.querySelectorAll('.bottom-nav .nav-item');
const attendanceDateInput = document.getElementById('attendanceDate');
const displayDateText = document.getElementById('displayDateText');
const workerAttendanceList = document.getElementById('workerAttendanceList');
const advanceRecordsList = document.getElementById('advanceRecordsList');
const payrollList = document.getElementById('payrollList');
const materialsList = document.getElementById('materialsList');

// Modals
const advanceModal = document.getElementById('advanceModal');
const newWorkerModal = document.getElementById('newWorkerModal');
const newMaterialModal = document.getElementById('newMaterialModal');
const slipModal = document.getElementById('slipModal');

// S-Pen Signature Canvas
const sigCanvas = document.getElementById('signatureCanvas');
const sigCtx = sigCanvas ? sigCanvas.getContext('2d') : null;
let isDrawing = false;
let hasSignature = false;

// ==========================================
// 3. INITIALIZATION
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  initDate();
  initNavigation();
  initModals();
  initSignaturePad();
  initQuickCashNumpad();

  renderAllViews();
  updateStats();
});

function initTheme() {
  if (appState.theme === 'light') {
    document.body.classList.remove('dark-theme');
    document.body.classList.add('light-theme');
  }
  document.getElementById('btnToggleTheme').addEventListener('click', () => {
    if (document.body.classList.contains('dark-theme')) {
      document.body.classList.remove('dark-theme');
      document.body.classList.add('light-theme');
      appState.theme = 'light';
    } else {
      document.body.classList.remove('light-theme');
      document.body.classList.add('dark-theme');
      appState.theme = 'dark';
    }
    saveState();
  });
}

function initDate() {
  const today = new Date().toISOString().split('T')[0];
  appState.currentDate = today;
  attendanceDateInput.value = today;
  updateDateLabel(today);

  attendanceDateInput.addEventListener('change', (e) => {
    appState.currentDate = e.target.value;
    updateDateLabel(e.target.value);
    renderAttendanceList();
  });

  document.getElementById('btnPrevDate').addEventListener('click', () => {
    const d = new Date(appState.currentDate);
    d.setDate(d.getDate() - 1);
    const newStr = d.toISOString().split('T')[0];
    appState.currentDate = newStr;
    attendanceDateInput.value = newStr;
    updateDateLabel(newStr);
    renderAttendanceList();
  });

  document.getElementById('btnNextDate').addEventListener('click', () => {
    const d = new Date(appState.currentDate);
    d.setDate(d.getDate() + 1);
    const newStr = d.toISOString().split('T')[0];
    appState.currentDate = newStr;
    attendanceDateInput.value = newStr;
    updateDateLabel(newStr);
    renderAttendanceList();
  });
}

function updateDateLabel(dateStr) {
  const today = new Date().toISOString().split('T')[0];
  const parts = dateStr.split('-');
  const formatted = `${parts[2]}/${parts[1]}/${parts[0]}`;
  if (dateStr === today) {
    displayDateText.textContent = `Hôm nay, ${formatted}`;
  } else {
    displayDateText.textContent = formatted;
  }
}

// Navigation (One UI bottom tabs)
function initNavigation() {
  navItems.forEach(item => {
    item.addEventListener('click', () => {
      const targetTab = item.dataset.tab;
      navItems.forEach(n => n.classList.remove('active'));
      item.classList.add('active');

      Object.keys(views).forEach(k => {
        if (k === targetTab) {
          views[k].classList.add('active');
        } else {
          views[k].classList.remove('active');
        }
      });

      // Re-render when switching tabs
      if (targetTab === 'payroll') renderPayrollList();
      if (targetTab === 'advance') renderAdvanceList();
      if (targetTab === 'materials') renderMaterialsList();
      if (targetTab === 'excel') updateCashflowView();
    });
  });
}

// ==========================================
// 4. RENDERERS
// ==========================================
function renderAllViews() {
  renderAttendanceList();
  renderAdvanceList();
  renderPayrollList();
  renderMaterialsList();
  updateCashflowView();
}

// Render Attendance (Chấm Công)
function renderAttendanceList() {
  workerAttendanceList.innerHTML = '';
  const date = appState.currentDate;

  appState.workers.forEach(w => {
    const key = `${date}_${w.id}`;
    // Default to 1.0 (Full day) if not marked
    const currentVal = appState.attendance[key] !== undefined ? appState.attendance[key] : 1.0;
    
    // Save default if unset
    if (appState.attendance[key] === undefined) {
      appState.attendance[key] = 1.0;
    }

    const card = document.createElement('div');
    card.className = `worker-card ${currentVal > 0 ? 'active-working' : ''}`;
    card.innerHTML = `
      <div class="worker-card-header">
        <div class="worker-info">
          <div class="worker-avatar">${w.name.charAt(0)}</div>
          <div class="worker-name-group">
            <span class="worker-name">${w.name}</span>
            <span class="worker-role">${w.role} · ${w.phone}</span>
          </div>
        </div>
        <div class="worker-rate-badge">${formatVND(w.rate)}/ngày</div>
      </div>

      <!-- Segmented Buttons for S23 Ultra Thumb -->
      <div class="attendance-states">
        <button type="button" class="state-btn ${currentVal === 1.0 ? 'active-1' : ''}" data-val="1.0">
          <span class="val">1.0</span>
          <span>Đi làm</span>
        </button>
        <button type="button" class="state-btn ${currentVal === 0.5 ? 'active-05' : ''}" data-val="0.5">
          <span class="val">0.5</span>
          <span>Nửa ngày</span>
        </button>
        <button type="button" class="state-btn ${currentVal === 1.5 ? 'active-15' : ''}" data-val="1.5">
          <span class="val">1.5</span>
          <span>Tăng ca</span>
        </button>
        <button type="button" class="state-btn ${currentVal === 0.0 ? 'active-0' : ''}" data-val="0.0">
          <span class="val">0</span>
          <span>Nghỉ</span>
        </button>
      </div>

      <div class="worker-card-footer">
        <span>Tổng công tuần: <b>${getWorkerWeekDays(w.id)} công</b></span>
        <button type="button" class="btn-card-adv" data-wid="${w.id}">➕ Cho ứng tiền</button>
      </div>
    `;

    // State button clicks
    const btns = card.querySelectorAll('.state-btn');
    btns.forEach(btn => {
      btn.addEventListener('click', () => {
        const val = parseFloat(btn.dataset.val);
        appState.attendance[key] = val;
        saveState();
        renderAttendanceList();
      });
    });

    // Quick advance click
    card.querySelector('.btn-card-adv').addEventListener('click', () => {
      openAdvanceModalForWorker(w.id);
    });

    workerAttendanceList.appendChild(card);
  });

  // Batch Mark All
  document.getElementById('btnMarkAllFull').onclick = () => {
    appState.workers.forEach(w => {
      appState.attendance[`${date}_${w.id}`] = 1.0;
    });
    saveState();
    renderAttendanceList();
  };
}

function getWorkerWeekDays(workerId) {
  let count = 0;
  // Calculate total days for worker in current month/recorded period
  Object.keys(appState.attendance).forEach(k => {
    if (k.endsWith(`_${workerId}`)) {
      count += (appState.attendance[k] || 0);
    }
  });
  return count;
}

// Render Advances (Tạm Ứng)
function renderAdvanceList() {
  advanceRecordsList.innerHTML = '';
  let totalMonth = 0;

  if (appState.advances.length === 0) {
    advanceRecordsList.innerHTML = `<div style="text-align:center; padding: 30px; color: var(--text-muted);">Chưa có phiếu ứng tiền nào.</div>`;
    return;
  }

  // Newest first
  const sorted = [...appState.advances].reverse();
  sorted.forEach(adv => {
    totalMonth += adv.amount;
    const item = document.createElement('div');
    item.className = 'advance-card';
    item.innerHTML = `
      <div class="adv-card-left">
        <span class="adv-worker-name">${adv.workerName}</span>
        <span class="adv-meta">📅 ${formatDateVN(adv.date)} · ${adv.note || 'Tạm ứng tiền mặt'}</span>
      </div>
      <div class="adv-card-right">
        <span class="adv-amount">-${formatVND(adv.amount)}</span>
        <span class="sig-badge">✍️ Đã ký nhận</span>
      </div>
    `;
    advanceRecordsList.appendChild(item);
  });

  document.getElementById('totalAdvancesMonth').textContent = formatVND(totalMonth);
}

// Render Payroll (Tính Lương)
function renderPayrollList() {
  payrollList.innerHTML = '';
  let grandTotalDays = 0;
  let grandGross = 0;
  let grandAdvances = 0;

  appState.workers.forEach(w => {
    const totalDays = getWorkerWeekDays(w.id);
    const grossSalary = totalDays * w.rate;
    
    // Sum advances for this worker
    const workerAdvances = appState.advances
      .filter(a => a.workerId === w.id)
      .reduce((sum, a) => sum + a.amount, 0);

    const netSalary = Math.max(0, grossSalary - workerAdvances);

    grandTotalDays += totalDays;
    grandGross += grossSalary;
    grandAdvances += workerAdvances;

    const card = document.createElement('div');
    card.className = 'payroll-card';
    card.innerHTML = `
      <div class="payroll-card-header">
        <div>
          <h4 style="font-size: 16px; font-weight: 700;">${w.name}</h4>
          <span style="font-size: 12px; color: var(--text-muted);">${w.role}</span>
        </div>
        <div style="text-align: right;">
          <span style="font-size: 11px; color: var(--text-muted);">THỰC LĨNH:</span>
          <div style="font-size: 18px; font-weight: 800; font-family: var(--font-mono); color: var(--color-green);">
            ${formatVND(netSalary)}
          </div>
        </div>
      </div>

      <div class="payroll-math-grid">
        <div class="math-col">
          <span>Tổng công:</span>
          <strong>${totalDays} công</strong>
        </div>
        <div class="math-col">
          <span>Lương gộp:</span>
          <strong>${formatVND(grossSalary)}</strong>
        </div>
        <div class="math-col text-amber">
          <span>Đã ứng:</span>
          <strong>-${formatVND(workerAdvances)}</strong>
        </div>
      </div>

      <div class="payroll-actions">
        <button type="button" class="btn-zalo" data-wid="${w.id}">
          💬 Gửi Zalo Cho Thợ
        </button>
        <button type="button" class="btn-detail" data-wid="${w.id}">
          📄 Chi tiết
        </button>
      </div>
    `;

    // Gửi Zalo action
    card.querySelector('.btn-zalo').addEventListener('click', () => {
      sendZaloSlip(w, totalDays, grossSalary, workerAdvances, netSalary);
    });

    // Xem chi tiết
    card.querySelector('.btn-detail').addEventListener('click', () => {
      showSlipDetail(w, totalDays, grossSalary, workerAdvances, netSalary);
    });

    payrollList.appendChild(card);
  });

  // Update total banner
  document.getElementById('payrollTotalDays').textContent = `${grandTotalDays} công`;
  document.getElementById('payrollGross').textContent = formatVND(grandGross);
  document.getElementById('payrollAdvances').textContent = `- ${formatVND(grandAdvances)}`;
  document.getElementById('payrollNet').textContent = formatVND(Math.max(0, grandGross - grandAdvances));
}

// Render Materials (Vật Tư)
function renderMaterialsList() {
  materialsList.innerHTML = '';
  let totalCost = 0;
  let debtCost = 0;

  appState.materials.forEach(m => {
    totalCost += m.total;
    if (m.status === 'debt') debtCost += m.total;

    const card = document.createElement('div');
    card.className = 'material-card';
    card.innerHTML = `
      <div>
        <div style="font-weight: 700; font-size: 15px;">${m.name}</div>
        <div style="font-size: 12px; color: var(--text-muted);">
          ${m.qty} ${m.unit} x ${formatVND(m.price)} · ${m.supplier}
        </div>
      </div>
      <div style="text-align: right;">
        <div style="font-size: 15px; font-weight: 700; font-family: var(--font-mono); color: var(--color-blue);">
          ${formatVND(m.total)}
        </div>
        <span class="mat-status-tag ${m.status}">
          ${m.status === 'paid' ? '💵 Đã trả' : '📝 Đang nợ'}
        </span>
      </div>
    `;
    materialsList.appendChild(card);
  });

  document.getElementById('matTotalCost').textContent = formatVND(totalCost);
  document.getElementById('matDebtCost').textContent = formatVND(debtCost);
}

// Update Cashflow & Stats
function updateStats() {
  // Today attendance
  const today = new Date().toISOString().split('T')[0];
  let todayCount = 0;
  appState.workers.forEach(w => {
    if ((appState.attendance[`${today}_${w.id}`] || 0) > 0) todayCount++;
  });
  document.getElementById('statTodayWorkers').textContent = `${todayCount}/${appState.workers.length} Thợ`;

  // Advances this week
  const weekAdv = appState.advances.reduce((sum, a) => sum + a.amount, 0);
  document.getElementById('statWeekAdvances').textContent = formatVND(weekAdv);

  // Remaining Cash
  const totalPaidMaterials = appState.materials
    .filter(m => m.status === 'paid')
    .reduce((sum, m) => sum + m.total, 0);

  const totalPayrollPaid = appState.advances.reduce((sum, a) => sum + a.amount, 0);
  const remaining = appState.cashflow.ownerAdvances - totalPaidMaterials - totalPayrollPaid - appState.cashflow.otherExpenses;
  
  document.getElementById('statCashFund').textContent = formatVND(remaining);
  updateCashflowView();
}

function updateCashflowView() {
  const totalPaidMaterials = appState.materials
    .filter(m => m.status === 'paid')
    .reduce((sum, m) => sum + m.total, 0);

  const totalPayrollPaid = appState.advances.reduce((sum, a) => sum + a.amount, 0);
  const remaining = appState.cashflow.ownerAdvances - totalPaidMaterials - totalPayrollPaid - appState.cashflow.otherExpenses;

  const inEl = document.getElementById('cashIn');
  if (inEl) inEl.textContent = formatVND(appState.cashflow.ownerAdvances);

  const outPayEl = document.getElementById('cashOutPayroll');
  if (outPayEl) outPayEl.textContent = `- ${formatVND(totalPayrollPaid)}`;

  const outMatEl = document.getElementById('cashOutMat');
  if (outMatEl) outMatEl.textContent = `- ${formatVND(totalPaidMaterials)}`;

  const outOtherEl = document.getElementById('cashOutOther');
  if (outOtherEl) outOtherEl.textContent = `- ${formatVND(appState.cashflow.otherExpenses)}`;

  const remEl = document.getElementById('cashRemaining');
  if (remEl) remEl.textContent = formatVND(remaining);
}

// ==========================================
// 5. S-PEN SIGNATURE CANVAS
// ==========================================
function initSignaturePad() {
  if (!sigCanvas || !sigCtx) return;

  function resizeCanvas() {
    const rect = sigCanvas.getBoundingClientRect();
    sigCanvas.width = rect.width * window.devicePixelRatio;
    sigCanvas.height = rect.height * window.devicePixelRatio;
    sigCtx.scale(window.devicePixelRatio, window.devicePixelRatio);
    sigCtx.lineWidth = 2.5;
    sigCtx.lineCap = 'round';
    sigCtx.lineJoin = 'round';
    sigCtx.strokeStyle = '#22d3ee'; // Vibrant Cyan S-Pen color
  }

  window.addEventListener('resize', resizeCanvas);
  setTimeout(resizeCanvas, 300);

  function getPos(e) {
    const rect = sigCanvas.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return {
      x: clientX - rect.left,
      y: clientY - rect.top
    };
  }

  function startDraw(e) {
    e.preventDefault();
    isDrawing = true;
    hasSignature = true;
    document.getElementById('sigHint').style.opacity = '0';
    const pos = getPos(e);
    sigCtx.beginPath();
    sigCtx.moveTo(pos.x, pos.y);
  }

  function draw(e) {
    if (!isDrawing) return;
    e.preventDefault();
    const pos = getPos(e);
    sigCtx.lineTo(pos.x, pos.y);
    sigCtx.stroke();
  }

  function stopDraw() {
    isDrawing = false;
  }

  sigCanvas.addEventListener('mousedown', startDraw);
  sigCanvas.addEventListener('mousemove', draw);
  sigCanvas.addEventListener('mouseup', stopDraw);

  sigCanvas.addEventListener('touchstart', startDraw, { passive: false });
  sigCanvas.addEventListener('touchmove', draw, { passive: false });
  sigCanvas.addEventListener('touchend', stopDraw);

  document.getElementById('btnClearSig').addEventListener('click', () => {
    sigCtx.clearRect(0, 0, sigCanvas.width, sigCanvas.height);
    hasSignature = false;
    document.getElementById('sigHint').style.opacity = '1';
  });
}

// Quick Cash Numpad Chips
function initQuickCashNumpad() {
  const input = document.getElementById('advAmountInput');
  let currentVal = 0;

  document.querySelectorAll('.cash-chip[data-val]').forEach(chip => {
    chip.addEventListener('click', () => {
      const addVal = parseInt(chip.dataset.val, 10);
      currentVal += addVal;
      input.value = new Intl.NumberFormat('vi-VN').format(currentVal);
    });
  });

  document.getElementById('btnClearCash').addEventListener('click', () => {
    currentVal = 0;
    input.value = '';
  });
}

// ==========================================
// 6. MODALS & FORMS
// ==========================================
function initModals() {
  // Tạm ứng
  document.getElementById('btnOpenNewAdvanceModal').addEventListener('click', () => {
    openAdvanceModalForWorker();
  });
  document.getElementById('btnCloseAdvModal').addEventListener('click', () => {
    advanceModal.classList.remove('open');
  });

  // Thêm thợ
  document.getElementById('btnAddWorker').addEventListener('click', () => {
    newWorkerModal.classList.add('open');
  });
  document.getElementById('btnCloseWorkerModal').addEventListener('click', () => {
    newWorkerModal.classList.remove('open');
  });

  // Nhập vật tư
  document.getElementById('btnOpenNewMaterialModal').addEventListener('click', () => {
    newMaterialModal.classList.add('open');
  });
  document.getElementById('btnCloseMatModal').addEventListener('click', () => {
    newMaterialModal.classList.remove('open');
  });

  document.getElementById('btnCloseSlipModal').addEventListener('click', () => {
    slipModal.classList.remove('open');
  });

  // Payment radio toggle
  document.querySelectorAll('input[name="matPayment"]').forEach(r => {
    r.addEventListener('change', () => {
      document.querySelectorAll('.radio-chip').forEach(c => c.classList.remove('active'));
      r.closest('.radio-chip').classList.add('active');
    });
  });

  // Save worker
  document.getElementById('btnSaveWorker').addEventListener('click', () => {
    const name = document.getElementById('newWorkerName').value.trim();
    const phone = document.getElementById('newWorkerPhone').value.trim() || '090...';
    const role = document.getElementById('newWorkerRole').value;
    const rate = parseInt(document.getElementById('newWorkerRate').value, 10) || 450000;

    if (!name) {
      alert('Vui lòng nhập tên thợ!');
      return;
    }

    const newW = {
      id: 'w_' + Date.now(),
      name,
      phone,
      role,
      rate
    };

    appState.workers.push(newW);
    // Mark today as working by default
    appState.attendance[`${appState.currentDate}_${newW.id}`] = 1.0;

    saveState();
    renderAttendanceList();
    newWorkerModal.classList.remove('open');
    document.getElementById('newWorkerName').value = '';
    alert(`Đã thêm thợ "${name}" thành công!`);
  });

  // Save advance
  document.getElementById('btnSaveAdvance').addEventListener('click', () => {
    const workerId = document.getElementById('advWorkerSelect').value;
    const rawVal = document.getElementById('advAmountInput').value.replace(/\./g, '');
    const amount = parseInt(rawVal, 10);
    const note = document.getElementById('advNoteInput').value.trim() || 'Tạm ứng tiền mặt';

    if (!amount || amount <= 0) {
      alert('Vui lòng chọn số tiền ứng!');
      return;
    }

    const worker = appState.workers.find(w => w.id === workerId);
    const newAdv = {
      id: 'a_' + Date.now(),
      workerId,
      workerName: worker ? worker.name : 'Thợ',
      amount,
      date: new Date().toISOString().split('T')[0],
      note,
      hasSig: hasSignature
    };

    appState.advances.push(newAdv);
    saveState();
    renderAdvanceList();
    advanceModal.classList.remove('open');

    // Reset form
    document.getElementById('advAmountInput').value = '';
    document.getElementById('advNoteInput').value = '';
    if (sigCtx) sigCtx.clearRect(0, 0, sigCanvas.width, sigCanvas.height);
    hasSignature = false;
    document.getElementById('sigHint').style.opacity = '1';

    alert(`Đã lưu phiếu ứng ${formatVND(amount)} cho ${newAdv.workerName}!`);
  });

  // Save material
  document.getElementById('btnSaveMaterial').addEventListener('click', () => {
    const name = document.getElementById('matNameInput').value.trim();
    const qty = parseFloat(document.getElementById('matQtyInput').value) || 1;
    const unit = document.getElementById('matUnitInput').value.trim() || 'Bao';
    const price = parseFloat(document.getElementById('matPriceInput').value) || 0;
    const supplier = document.getElementById('matSupplierInput').value.trim() || 'Đại lý';
    const status = document.querySelector('input[name="matPayment"]:checked').value;

    if (!name) {
      alert('Vui lòng nhập tên vật tư!');
      return;
    }

    const total = qty * price;
    const newMat = {
      id: 'm_' + Date.now(),
      name,
      qty,
      unit,
      price,
      total,
      supplier,
      status,
      date: new Date().toISOString().split('T')[0]
    };

    appState.materials.push(newMat);
    saveState();
    renderMaterialsList();
    newMaterialModal.classList.remove('open');
    document.getElementById('matNameInput').value = '';
    alert(`Đã lưu phiếu vật tư: ${name} (${formatVND(total)})!`);
  });
}

function openAdvanceModalForWorker(selectedWorkerId = null) {
  const select = document.getElementById('advWorkerSelect');
  select.innerHTML = '';
  appState.workers.forEach(w => {
    const opt = document.createElement('option');
    opt.value = w.id;
    opt.textContent = `${w.name} (${w.role})`;
    if (selectedWorkerId && w.id === selectedWorkerId) {
      opt.selected = true;
    }
    select.appendChild(opt);
  });

  advanceModal.classList.add('open');
}

// ==========================================
// 7. ZALO SHARING & EXCEL EXPORT
// ==========================================
function sendZaloSlip(worker, totalDays, gross, advances, net) {
  const text = `📋 PHIẾU LƯƠNG CÔNG TRÌNH\n` +
    `👷 Thợ: ${worker.name} (${worker.role})\n` +
    `--------------------------------\n` +
    `▪️ Số ngày công: ${totalDays} công\n` +
    `▪️ Đơn giá: ${formatVND(worker.rate)}/ngày\n` +
    `▪️ Tổng lương gộp: ${formatVND(gross)}\n` +
    `▪️ Đã tạm ứng: -${formatVND(advances)}\n` +
    `================================\n` +
    `💰 THỰC LĨNH CÒN LẠI: ${formatVND(net)}\n` +
    `--------------------------------\n` +
    `Xin cảm ơn anh/chú đã đồng hành cùng công trình!`;

  if (navigator.clipboard) {
    navigator.clipboard.writeText(text).then(() => {
      alert(`Đã sao chép nội dung phiếu lương của ${worker.name} vào bộ nhớ tạm!\n\nBạn có thể mở Zalo và dán (Paste) để gửi cho thợ ngay.`);
    });
  } else {
    alert(text);
  }
}

function showSlipDetail(worker, totalDays, gross, advances, net) {
  const content = document.getElementById('slipContent');
  const workerAdvs = appState.advances.filter(a => a.workerId === worker.id);

  content.innerHTML = `
    <div style="background: var(--bg-card); padding: 16px; border-radius: var(--radius-md); margin-bottom: 14px;">
      <h4 style="font-size: 17px; margin-bottom: 4px;">${worker.name}</h4>
      <p style="font-size: 13px; color: var(--text-muted);">${worker.role} · SĐT: ${worker.phone}</p>
      
      <div style="margin-top: 12px; font-size: 14px;">
        <div style="display:flex; justify-content:space-between; margin-bottom: 6px;">
          <span>Tổng số công:</span>
          <b>${totalDays} công</b>
        </div>
        <div style="display:flex; justify-content:space-between; margin-bottom: 6px;">
          <span>Lương thỏa thuận:</span>
          <b>${formatVND(worker.rate)}/ngày</b>
        </div>
        <div style="display:flex; justify-content:space-between; margin-bottom: 6px;">
          <span>Tổng lương gộp:</span>
          <b>${formatVND(gross)}</b>
        </div>
        <div style="display:flex; justify-content:space-between; color: var(--color-amber); margin-bottom: 8px;">
          <span>Tổng tiền đã ứng:</span>
          <b>-${formatVND(advances)}</b>
        </div>
        <div style="height: 1px; background: var(--border-subtle); margin: 8px 0;"></div>
        <div style="display:flex; justify-content:space-between; font-size: 16px; font-weight: 800; color: var(--color-green);">
          <span>THỰC LĨNH:</span>
          <span>${formatVND(net)}</span>
        </div>
      </div>
    </div>

    <h5 style="margin-bottom: 8px; font-size: 14px;">Lịch sử tạm ứng của thợ này:</h5>
    <div style="display:flex; flex-direction:column; gap: 8px;">
      ${workerAdvs.length === 0 ? '<p style="color:var(--text-muted); font-size:13px;">Chưa tạm ứng khoản nào.</p>' : ''}
      ${workerAdvs.map(a => `
        <div style="background:var(--bg-card); padding: 10px 12px; border-radius:var(--radius-sm); display:flex; justify-content:space-between;">
          <span>📅 ${formatDateVN(a.date)}: ${a.note}</span>
          <b style="color:var(--color-amber);">-${formatVND(a.amount)}</b>
        </div>
      `).join('')}
    </div>
  `;

  slipModal.classList.add('open');
}

// Export to Excel / CSV
document.getElementById('btnExportExcel').addEventListener('click', exportExcel);
document.getElementById('btnDownloadBackup').addEventListener('click', exportExcel);

function exportExcel() {
  let csvContent = "\uFEFF"; // UTF-8 BOM for Excel
  csvContent += "BẢNG LƯƠNG & CHẤM CÔNG THỢ XÂY DỰNG\n";
  csvContent += `Công trình: Biệt thự Vườn - Nhà Chú Ba\n`;
  csvContent += `Ngày xuất: ${new Date().toLocaleDateString('vi-VN')}\n\n`;

  csvContent += "STT,Tên Thợ,Chức Vụ,Mức Lương/Ngày,Tổng Công,Tổng Lương Gộp,Tiền Đã Ứng,Thực Lĩnh Còn Lại\n";

  appState.workers.forEach((w, idx) => {
    const totalDays = getWorkerWeekDays(w.id);
    const gross = totalDays * w.rate;
    const adv = appState.advances.filter(a => a.workerId === w.id).reduce((s, a) => s + a.amount, 0);
    const net = Math.max(0, gross - adv);

    csvContent += `${idx + 1},"${w.name}","${w.role}",${w.rate},${totalDays},${gross},${adv},${net}\n`;
  });

  csvContent += "\n\nDANH SÁCH VẬT TƯ XÂY DỰNG\n";
  csvContent += "STT,Tên Vật Tư,Số Lượng,Đơn Vị,Đơn Giá,Thành Tiền,Nhà Cung Cấp,Trạng Thái\n";
  appState.materials.forEach((m, idx) => {
    csvContent += `${idx + 1},"${m.name}",${m.qty},"${m.unit}",${m.price},${m.total},"${m.supplier}","${m.status === 'paid' ? 'Đã thanh toán' : 'Đang nợ'}"\n`;
  });

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `BangLuong_VatTu_${new Date().toISOString().split('T')[0]}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  alert('Đã xuất file bảng tính thành công! Bạn có thể mở file này trực tiếp bằng Microsoft Excel, Google Sheets hoặc GridCraft.');
}

// Open GridCraft WASM
document.getElementById('btnOpenGridcraftWasm').addEventListener('click', () => {
  window.open('/?sample=sales', '_blank');
});
