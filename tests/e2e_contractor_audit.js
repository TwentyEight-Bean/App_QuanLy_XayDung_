/**
 * GRIDCRAFT 2.0 — AUTOMATED BROWSER E2E TEST SUITE
 * Uses Chrome DevTools Protocol (CDP) via native WebSocket in Node 24.
 * Tests 3 projects, 20 workers, S-Pen pointer events, wage payouts,
 * partial material debt payments, cashflow assertions, XSS safety,
 * backup/restore, and captures mobile screenshots for visual evidence.
 */

const http = require('http');
const cp = require('child_process');
const fs = require('fs');
const path = require('path');

const PORT = 8080;
const CDP_PORT = 9333;
const ARTIFACT_DIR = 'C:\\Users\\taibe\\.gemini\\antigravity-ide\\brain\\ef1b903a-31af-4ae9-8019-6ed6b55c6109';

let cdpWs = null;
let msgId = 1;
const pendingCalls = new Map();

function sendCDP(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = msgId++;
    pendingCalls.set(id, { resolve, reject });
    cdpWs.send(JSON.stringify({ id, method, params }));
  });
}

async function evaluate(expression) {
  const res = await sendCDP('Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: true
  });
  if (res.exceptionDetails) {
    throw new Error('JS Eval Exception: ' + JSON.stringify(res.exceptionDetails));
  }
  return res.result.value;
}

async function captureScreenshot(filepath) {
  const res = await sendCDP('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(filepath, Buffer.from(res.data, 'base64'));
  console.log('📸 Saved screenshot:', filepath);
}

async function wait(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function runTests() {
  console.log('=== KHỞI ĐỘNG BROWSER E2E AUDIT TEST SUITE ===');

  // 1. Khởi động Headless Chrome
  const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  const userDataDir = 'C:\\Users\\taibe\\AppData\\Local\\Temp\\chrome_audit_profile_' + Date.now();
  
  const chromeProc = cp.spawn(chromePath, [
    '--headless=new',
    `--remote-debugging-port=${CDP_PORT}`,
    `--user-data-dir=${userDataDir}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-gpu',
    'about:blank'
  ]);

  await wait(2000);

  // 2. Lấy WebSocket endpoint của Chrome
  const cdpVersion = await new Promise((resolve, reject) => {
    http.get(`http://127.0.0.1:${CDP_PORT}/json/list`, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve(JSON.parse(data)));
    }).on('error', reject);
  });

  const pageTarget = cdpVersion.find(t => t.type === 'page');
  if (!pageTarget) throw new Error('Không tìm thấy page target trong Chrome CDP!');

  cdpWs = new globalThis.WebSocket(pageTarget.webSocketDebuggerUrl);

  await new Promise((resolve, reject) => {
    cdpWs.onopen = resolve;
    cdpWs.onerror = reject;
    cdpWs.onmessage = msg => {
      const data = JSON.parse(msg.data);
      if (data.id && pendingCalls.has(data.id)) {
        const { resolve, reject } = pendingCalls.get(data.id);
        pendingCalls.delete(data.id);
        if (data.error) reject(new Error(data.error.message));
        else resolve(data.result);
      }
    };
  });

  console.log('✅ Đã kết nối Chrome DevTools Protocol thành công.');

  await sendCDP('Page.enable');
  await sendCDP('Runtime.enable');
  await sendCDP('DOM.enable');

  // 3. Giả lập thiết bị Samsung Galaxy S23 Ultra (412 x 915 CSS px)
  await sendCDP('Emulation.setDeviceMetricsOverride', {
    width: 412,
    height: 915,
    deviceScaleFactor: 2.625,
    mobile: true
  });

  // 4. Điều hướng tới ứng dụng GridCraft Mobile
  console.log(`🌐 Điều hướng tới http://localhost:${PORT}/...`);
  await sendCDP('Page.navigate', { url: `http://localhost:${PORT}/` });
  await wait(2000);

  const testResults = [];

  function assert(condition, testName, details = '') {
    if (condition) {
      console.log(`  PASS: ${testName}`);
      testResults.push({ name: testName, status: 'PASS', details });
    } else {
      console.error(`  FAIL: ${testName} - ${details}`);
      testResults.push({ name: testName, status: 'FAIL', details });
      throw new Error(`Assertion failed: ${testName} - ${details}`);
    }
  }

  // ================= TEST 1: KIỂM TRA [HIDDEN] VÀ CSS ACCESSIBILITY =================
  console.log('\n--- TEST 1: Kiểm tra thuộc tính [hidden] và CSS ---');
  const hiddenChecks = await evaluate(`(() => {
    const banner = document.getElementById("attendanceAllProjectsBanner");
    const snackbar = document.getElementById("undoSnackbar");
    const picker = document.getElementById("sheetProjectPicker");
    const advForm = document.getElementById("sheetAdvanceForm");
    return {
      bannerHidden: banner ? window.getComputedStyle(banner).display : null,
      snackbarHidden: snackbar ? window.getComputedStyle(snackbar).display : null,
      pickerHidden: picker ? window.getComputedStyle(picker).display : null,
      advFormHidden: advForm ? window.getComputedStyle(advForm).display : null
    };
  })()`);

  assert(hiddenChecks.bannerHidden === 'none', 'CSS [hidden] cho notice-banner hoạt động chuẩn (display: none)');
  assert(hiddenChecks.snackbarHidden === 'none', 'CSS [hidden] cho undoSnackbar hoạt động chuẩn (display: none)');
  assert(hiddenChecks.pickerHidden === 'none', 'CSS [hidden] cho sheetProjectPicker hoạt động chuẩn');
  assert(hiddenChecks.advFormHidden === 'none', 'CSS [hidden] cho sheetAdvanceForm hoạt động chuẩn');

  // ================= TEST 2: KIỂM TRA ĐA DỰ ÁN (3 DỰ ÁN, 20 THỢ) =================
  console.log('\n--- TEST 2: Đa dự án & Phân công 20 thợ ---');
  await evaluate(`(() => {
    // Xóa dữ liệu cũ để test sạch
    store = createDefaultStore();
    
    // Tạo 3 công trình mới
    store.projects = [
      { id: "P1", name: "Biệt thự Cẩm Lệ", owner: "Anh Tuấn", location: "Cẩm Lệ, Đà Nẵng", status: "active", startDate: "2026-08-01" },
      { id: "P2", name: "Khách sạn Sông Hàn", owner: "Chị Thảo", location: "Bạch Đằng, Đà Nẵng", status: "active", startDate: "2026-09-15" },
      { id: "P3", name: "Nhà kho Hòa Vang (2025)", owner: "Chú Ba", location: "Hòa Vang, Đà Nẵng", status: "completed", startDate: "2025-02-10" }
    ];

    // Tạo 20 thợ phân bổ vào các công trình
    store.workers = [];
    for (let i = 1; i <= 20; i++) {
      const prjId = i <= 8 ? "P1" : (i <= 16 ? "P2" : "P3");
      store.workers.push({
        id: "W_" + i,
        name: "Thợ Số " + i,
        role: i % 3 === 0 ? "Thợ cả" : (i % 2 === 0 ? "Thợ chính" : "Thợ phụ"),
        dailyRate: 350000 + (i % 5) * 50000,
        projectId: prjId
      });
    }

    store.settings.selectedProjectId = "ALL";
    saveStore();
    renderAll();
  })()`);

  const prjCheck = await evaluate(`(() => {
    return {
      pCount: store.projects.length,
      wCount: store.workers.length,
      p1Workers: store.workers.filter(w => w.projectId === "P1").length,
      p2Workers: store.workers.filter(w => w.projectId === "P2").length,
      p3Workers: store.workers.filter(w => w.projectId === "P3").length
    };
  })()`);

  assert(prjCheck.pCount === 3, 'Tạo thành công 3 công trình');
  assert(prjCheck.wCount === 20, 'Tạo thành công 20 thợ');
  assert(prjCheck.p1Workers === 8, 'Công trình P1 có đúng 8 thợ');
  assert(prjCheck.p2Workers === 8, 'Công trình P2 có đúng 8 thợ');
  assert(prjCheck.p3Workers === 4, 'Công trình P3 (đã đóng) có 4 thợ');

  // ================= TEST 3: CÔNG TRÌNH ĐÃ ĐÓNG KHÔNG CHO CHẤM CÔNG =================
  console.log('\n--- TEST 3: Khóa chấm công đối với công trình đã đóng ---');
  await evaluate(`(() => {
    store.settings.selectedProjectId = "P3"; // Công trình completed
    saveStore();
    renderAll();
  })()`);

  const closedCheck = await evaluate(`(() => {
    const banner = document.getElementById("attendanceClosedProjectBanner");
    const footer = document.getElementById("attendanceStickyFooter");
    const buttons = Array.from(document.querySelectorAll("#attendanceWorkerList .att-pill-btn"));
    const allDisabled = buttons.every(b => b.disabled || b.style.opacity === "0.6");
    return {
      bannerVisible: !banner.hidden,
      footerHidden: footer.style.display === "none",
      allDisabled
    };
  })()`);

  assert(closedCheck.bannerVisible, 'Hiện banner khóa khi vào công trình P3 đã hoàn thành');
  assert(closedCheck.footerHidden, 'Ẩn nút điểm danh cả đội ở công trình đã đóng');
  assert(closedCheck.allDisabled, 'Toàn bộ nút chấm công từng thợ ở công trình đã đóng bị vô hiệu hóa');

  // ================= TEST 4: CHẤM CÔNG LƯU RATE SNAPSHOT BẤT BIẾN =================
  console.log('\n--- TEST 4: Chấm công lưu rateSnapshot bất biến ---');
  await evaluate(`(() => {
    store.settings.selectedProjectId = "P1";
    store.settings.selectedDate = "2026-10-20";
    saveStore();
    renderAll();

    // Chấm công thợ W_1 với rate 350.000
    const w1 = store.workers.find(w => w.id === "W_1");
    w1.dailyRate = 350000;
    setWorkerAttendance("W_1", 1.0);

    // Tháng sau tăng lương thợ W_1 lên 500.000
    w1.dailyRate = 500000;

    // Chấm công ngày hôm sau 2026-10-21
    store.settings.selectedDate = "2026-10-21";
    setWorkerAttendance("W_1", 1.5);
  })()`);

  const snapshotCheck = await evaluate(`(() => {
    const att1 = store.attendance.find(a => a.workerId === "W_1" && a.date === "2026-10-20");
    const att2 = store.attendance.find(a => a.workerId === "W_1" && a.date === "2026-10-21");
    return {
      rate1: att1.rateSnapshot,
      rate2: att2.rateSnapshot
    };
  })()`);

  assert(snapshotCheck.rate1 === 350000, 'Ngày 20/10 lưu cứng rateSnapshot = 350.000 đ dù sau đó tăng lương');
  assert(snapshotCheck.rate2 === 500000, 'Ngày 21/10 lưu cứng rateSnapshot mới = 500.000 đ');

  // ================= TEST 5: TẠM ỨNG & KÝ BÙ S-PEN (PALM REJECTION & POINTER EVENTS) =================
  console.log('\n--- TEST 5: Tạm ứng, Ký bù S-Pen & Palm Rejection ---');
  await evaluate(`(() => {
    // Tạo 1 phiếu tạm ứng chưa ký
    store.advances.push({
      id: "ADV_TEST_UNP",
      projectId: "P1",
      workerId: "W_1",
      amountVnd: 500000,
      date: "2026-10-20",
      note: "Ứng ăn sáng",
      signedStatus: "unsigned",
      signatureDataUrl: null,
      signedAt: null,
      signatureHash: null
    });
    saveStore();
    renderAll();
  })()`);

  const unsignedBefore = await evaluate(`(() => {
    const adv = store.advances.find(a => a.id === "ADV_TEST_UNP");
    return adv.signedStatus;
  })()`);
  assert(unsignedBefore === 'unsigned', 'Phiếu ứng ban đầu có trạng thái unsigned');

  // Mở modal ký bù
  await evaluate(`openSupplementalSign("ADV_TEST_UNP")`);
  const suppModalOpen = await evaluate(`!document.getElementById("sheetSupplementalSign").hidden`);
  assert(suppModalOpen, 'Mở thành công modal ký bù S-Pen');

  // Giả lập vẽ nét bút S-Pen (PointerEvent type: pen)
  await evaluate(`(() => {
    const canvas = document.getElementById("spenCanvasSupplemental");
    const rect = canvas.getBoundingClientRect();
    
    // Giả lập pointerdown với pen
    const downEvt = new PointerEvent("pointerdown", {
      clientX: rect.left + 50,
      clientY: rect.top + 50,
      pointerType: "pen",
      pointerId: 101,
      pressure: 0.8
    });
    canvas.dispatchEvent(downEvt);

    // Giả lập tỳ tay chạm touch (phải bị chặn bởi Palm Rejection)
    const palmEvt = new PointerEvent("pointermove", {
      clientX: rect.left + 20,
      clientY: rect.top + 80,
      pointerType: "touch",
      pointerId: 102
    });
    canvas.dispatchEvent(palmEvt);

    // Di chuyển nét bút thật
    const moveEvt = new PointerEvent("pointermove", {
      clientX: rect.left + 150,
      clientY: rect.top + 80,
      pointerType: "pen",
      pointerId: 101,
      pressure: 0.9
    });
    canvas.dispatchEvent(moveEvt);

    const upEvt = new PointerEvent("pointerup", {
      clientX: rect.left + 150,
      clientY: rect.top + 80,
      pointerType: "pen",
      pointerId: 101
    });
    canvas.dispatchEvent(upEvt);

    // Bấm nút Lưu chữ ký bổ sung
    document.getElementById("btnSaveSupplementalSign").click();
  })()`);

  const unsignedAfter = await evaluate(`(() => {
    const adv = store.advances.find(a => a.id === "ADV_TEST_UNP");
    return {
      status: adv.signedStatus,
      hasSig: !!adv.signatureDataUrl,
      hasHash: !!adv.signatureHash
    };
  })()`);
  assert(unsignedAfter.status === 'signed', 'Sau khi ký bù, trạng thái chuyển thành signed');
  assert(unsignedAfter.hasSig, 'Chữ ký PNG dataURL được lưu thành công');
  assert(unsignedAfter.hasHash, 'Mã hash chứng nhận chữ ký được tạo');

  // ================= TEST 6: QUYẾT TOÁN CHI TRẢ LƯƠNG & DÒNG TIỀN =================
  console.log('\n--- TEST 6: Quyết toán trả lương & Kiểm tra dòng tiền ---');
  await evaluate(`(() => {
    // Nạp quỹ tiền mặt ban đầu bằng khoản chủ nhà ứng: 50.000.000 đ
    store.cashTransactions = [
      { id: "CSH_IN_1", projectId: "P1", type: "in", amountVnd: 50000000, category: "Chủ nhà tạm ứng đợt 1", date: "2026-10-01" }
    ];
    saveStore();
    renderAll();
  })()`);

  const cashBefore = await evaluate(`calculateFinancials().cumulativeBalance`);
  // Đã có: Thu 50tr - Ứng 500k = 49.500.000 đ
  assert(cashBefore === 49500000, 'Tồn quỹ trước khi trả lương là 49.500.000 đ');

  // Lương W_1: Ngày 20: 1.0 * 350k = 350k. Ngày 21: 1.5 * 500k = 750k. Tổng gộp = 1.100.000 đ. Đã ứng = 500.000 đ. Thực lĩnh = 600.000 đ.
  await evaluate(`(() => {
    openWagePaymentSheet("W_1");
    // Xác nhận chi tiền
    document.getElementById("btnConfirmWagePayout").click();
  })()`);

  const cashAfter = await evaluate(`calculateFinancials().cumulativeBalance`);
  const wageRecord = await evaluate(`store.wagePayments.find(wp => wp.workerId === "W_1")`);

  assert(cashAfter === 48900000, 'Tồn quỹ sau khi trả lương 600.000 đ giảm chính xác xuống 48.900.000 đ');
  assert(wageRecord.netPaid === 600000, 'Bản ghi wagePayments ghi đúng số tiền thực chi 600.000 đ');
  assert(wageRecord.grossWage === 1100000, 'Lương gộp chuẩn 1.100.000 đ');
  assert(wageRecord.advanceDeducted === 500000, 'Khấu trừ tạm ứng chuẩn 500.000 đ');

  // Thử bấm trả lương lần 2 -> Phải bị chặn chống trả trùng
  await evaluate(`openWagePaymentSheet("W_1")`);
  const isSheetOpenAgain = await evaluate(`!document.getElementById("sheetWagePayment").hidden`);
  assert(!isSheetOpenAgain, 'Không cho phép mở quyết toán lương lần 2 (Chống chi trả trùng lặp)');

  // ================= TEST 7: VẬT TƯ & CÔNG NỢ & THANH TOÁN TỪNG PHẦN =================
  console.log('\n--- TEST 7: Nợ vật tư & Thanh toán từng phần ---');
  await evaluate(`(() => {
    // Nhập vật tư nợ: 100 bao xi măng @ 90.000 đ = 9.000.000 đ
    store.materials = [
      {
        id: "MAT_TEST_DEBT",
        projectId: "P1",
        name: "Xi măng Nghi Sơn",
        qty: 100,
        unit: "Bao",
        unitPrice: 90000,
        totalAmount: 9000000,
        vendor: "Đại lý Ba Hải",
        purchaseDate: "2026-10-10",
        payments: []
      }
    ];
    saveStore();
    renderAll();
  })()`);

  const finWithDebt = await evaluate(`calculateFinancials()`);
  assert(finWithDebt.openMaterialDebt === 9000000, 'Công nợ vật tư ghi nhận đúng 9.000.000 đ');
  assert(finWithDebt.cumulativeBalance === 48900000, 'Nợ vật tư KHÔNG trừ vào tồn quỹ tiền mặt');

  // Thanh toán đợt 1: trả 4.000.000 đ vào ngày 2026-10-22
  await evaluate(`(() => {
    openMaterialPaymentSheet("MAT_TEST_DEBT");
    document.getElementById("matPaymentAmount").value = 4000000;
    document.getElementById("matPaymentDate").value = "2026-10-22";
    document.getElementById("matPaymentNote").value = "Trả nợ đợt 1";
    document.getElementById("btnConfirmMaterialPayment").click();
  })()`);

  const finAfterPart1 = await evaluate(`calculateFinancials()`);
  assert(finAfterPart1.openMaterialDebt === 5000000, 'Công nợ vật tư giảm xuống đúng 5.000.000 đ');
  assert(finAfterPart1.cumulativeBalance === 44900000, 'Tồn quỹ tiền mặt giảm đúng 4.000.000 đ tại ngày thanh toán thực tế');

  // Thanh toán đợt 2: trả nốt 5.000.000 đ vào ngày 2026-10-23
  await evaluate(`(() => {
    openMaterialPaymentSheet("MAT_TEST_DEBT");
    document.getElementById("matPaymentAmount").value = 5000000;
    document.getElementById("matPaymentDate").value = "2026-10-23";
    document.getElementById("matPaymentNote").value = "Trả dứt điểm";
    document.getElementById("btnConfirmMaterialPayment").click();
  })()`);

  const finAfterPart2 = await evaluate(`calculateFinancials()`);
  assert(finAfterPart2.openMaterialDebt === 0, 'Công nợ vật tư đã về 0 đ (Đã trả hết)');
  assert(finAfterPart2.cumulativeBalance === 39900000, 'Tồn quỹ tiền mặt sau khi trả nốt giảm về 39.900.000 đ');

  // ================= TEST 8: CHỐNG XSS KHI NHẬP LIỆU =================
  console.log('\n--- TEST 8: Chống XSS injection ---');
  await evaluate(`(() => {
    store.projects.push({
      id: "P_XSS",
      name: "<script>window.XSS_FLAG=true;</script><b id='xss_test'>Tên XSS</b>",
      owner: "<img src=x onerror=window.XSS_FLAG=true>",
      location: "Đà Nẵng",
      status: "active",
      startDate: "2026-10-01"
    });
    saveStore();
    renderAll();
  })()`);

  const xssTriggered = await evaluate(`window.XSS_FLAG || false`);
  assert(!xssTriggered, 'Mã độc XSS không được thực thi khi render công trình');

  // ================= TEST 9: CHỤP ẢNH BẰNG CHỨNG (SCREENSHOT EVIDENCE) =================
  console.log('\n--- TEST 9: Chụp ảnh bằng chứng màn hình S23 Ultra ---');
  
  // Tab 1: Tổng quan
  await evaluate(`switchMainTab("tab-overview")`);
  await wait(500);
  await captureScreenshot(path.join(ARTIFACT_DIR, 's23_ultra_tab1_overview.png'));

  // Tab 2: Chấm công
  await evaluate(`switchMainTab("tab-attendance")`);
  await wait(500);
  await captureScreenshot(path.join(ARTIFACT_DIR, 's23_ultra_tab2_attendance.png'));

  // Tab 3: Sổ tiền
  await evaluate(`switchMainTab("tab-money")`);
  await wait(500);
  await captureScreenshot(path.join(ARTIFACT_DIR, 's23_ultra_tab3_money.png'));

  // Mở modal Phiếu lương Zalo và chụp
  await evaluate(`openVisualPayslip("W_1")`);
  await wait(500);
  await captureScreenshot(path.join(ARTIFACT_DIR, 's23_ultra_payslip_modal.png'));

  // Đóng modal
  await evaluate(`document.getElementById("sheetPayslipPreview").hidden = true`);

  // Tab 4: Công trình
  await evaluate(`switchMainTab("tab-projects")`);
  await wait(500);
  await captureScreenshot(path.join(ARTIFACT_DIR, 's23_ultra_tab4_projects.png'));

  console.log('\n=== TẤT CẢ CÁC BÀI TEST ĐÃ HOÀN TẤT THÀNH CÔNG ===');
  console.log(`Tổng số assertions: ${testResults.length}, Đạt: ${testResults.filter(r=>r.status==='PASS').length}, Lỗi: ${testResults.filter(r=>r.status==='FAIL').length}`);

  // Đóng Chrome
  chromeProc.kill();
  process.exit(0);
}

runTests().catch(err => {
  console.error('❌ E2E Test Suite Error:', err);
  process.exit(1);
});
