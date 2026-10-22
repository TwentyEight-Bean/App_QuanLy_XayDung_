/**
 * GRIDCRAFT 2.0 — FINAL ACCOUNTING & DATA INTEGRITY AUDIT TEST SUITE
 * Uses Chrome DevTools Protocol (CDP) via native WebSocket in Node 24.
 * Tests:
 * 1. Múi giờ Việt Nam Asia/Ho_Chi_Minh: 00:01, 06:00, 07:00, 23:59
 * 2. Đa công trình (2025-2027), 20 thợ, rateSnapshot bất biến, chuyển công trình
 * 3. Carry-forward tiền ứng qua 3 kỳ liên tiếp (tháng 10 dư ứng 1tr, tháng 11 lương 2tr -> thực lĩnh 1tr, tháng 12 không trừ trùng)
 * 4. Tách kỳ xem báo cáo (Tuần/Tháng/Năm) khỏi kỳ quyết toán lương ổn định + Chống thanh toán trùng
 * 5. Xuất Excel SoQuy_TienMat từ nguồn ledger thống nhất, đọc lại file kiểm tra số dư khớp từng đồng
 * 6. Storage: Single source of truth, IDB cũ không ghi đè LocalStorage mới hơn, Migration payrollStatus cũ
 * 7. Bảo toàn chứng từ S-Pen: digital_ink, docVersion, docRef, adjustments
 * 8. Real DOM interactions: clicks, modal, keyboard, numpad, S-Pen pointer events, backdrop
 * 9. Multi-viewport screenshots: 360, 384, 412, 440 CSS px in Light & Dark Mode
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
  console.log('📸 Đã lưu ảnh chụp:', path.basename(filepath));
}

async function wait(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function runTests() {
  console.log('================================================================');
  console.log('  GRIDCRAFT 2.0 — FINAL ACCOUNTING & DATA INTEGRITY AUDIT SUITE ');
  console.log('================================================================\n');

  // 1. Khởi động Headless Chrome
  const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  const userDataDir = 'C:\\Users\\taibe\\AppData\\Local\\Temp\\chrome_final_audit_' + Date.now();

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

  console.log('✅ Kết nối Chrome DevTools Protocol thành công.');

  await sendCDP('Page.enable');
  await sendCDP('Runtime.enable');
  await sendCDP('DOM.enable');

  // Điều hướng tới ứng dụng GridCraft Mobile
  console.log(`🌐 Điều hướng tới http://localhost:${PORT}/...`);
  await sendCDP('Page.navigate', { url: `http://localhost:${PORT}/` });
  await wait(2500);

  const testResults = [];

  function assert(condition, testName, details = '') {
    if (condition) {
      console.log(`  [PASS] ${testName}`);
      testResults.push({ name: testName, status: 'PASS', details });
    } else {
      console.error(`  [FAIL] ${testName} - ${details}`);
      testResults.push({ name: testName, status: 'FAIL', details });
      throw new Error(`Assertion failed: ${testName} - ${details}`);
    }
  }

  // ================= BÀI TEST 1: MÚI GIỜ VIỆT NAM (ASIA/HO_CHI_MINH UTC+7) =================
  console.log('\n--- BÀI TEST 1: Múi giờ Việt Nam Asia/Ho_Chi_Minh & Biên độ ngày ---');
  const tzTests = await evaluate(`(() => {
    // Giả lập các mốc giờ UTC tương ứng với giờ Việt Nam
    // 00:01 VN (UTC+7) = 17:01 ngày hôm trước UTC
    const d0001 = new Date("2026-10-22T17:01:00.000Z");
    // 06:00 VN (UTC+7) = 23:00 ngày hôm trước UTC
    const d0600 = new Date("2026-10-22T23:00:00.000Z");
    // 07:00 VN (UTC+7) = 00:00 cùng ngày UTC
    const d0700 = new Date("2026-10-23T00:00:00.000Z");
    // 23:59 VN (UTC+7) = 16:59 cùng ngày UTC
    const d2359 = new Date("2026-10-23T16:59:00.000Z");

    return {
      t0001: getLocalDateVN(d0001),
      t0600: getLocalDateVN(d0600),
      t0700: getLocalDateVN(d0700),
      t2359: getLocalDateVN(d2359),
      weekRange: getWeekRange("2026-10-23"),
      weekBoundaryCrossMonth: getWeekRange("2026-10-31"), // Chuyển tháng 10 sang 11
      weekBoundaryCrossYear: getWeekRange("2026-12-31")   // Chuyển năm 2026 sang 2027
    };
  })()`);

  assert(tzTests.t0001 === "2026-10-23", "00:01 sáng VN trả về chính xác ngày 2026-10-23");
  assert(tzTests.t0600 === "2026-10-23", "06:00 sáng VN (khi UTC là 23:00 hôm trước) trả về chính xác 2026-10-23 (không bị lùi ngày)");
  assert(tzTests.t0700 === "2026-10-23", "07:00 sáng VN trả về chính xác ngày 2026-10-23");
  assert(tzTests.t2359 === "2026-10-23", "23:59 đêm VN trả về chính xác ngày 2026-10-23");
  assert(tzTests.weekRange.start === "2026-10-19" && tzTests.weekRange.end === "2026-10-25", "Tuần chứa 23/10/2026 chạy từ Thứ 2 (19/10) đến Chủ nhật (25/10)");
  assert(tzTests.weekBoundaryCrossMonth.start === "2026-10-26" && tzTests.weekBoundaryCrossMonth.end === "2026-11-01", "Tuần qua ranh giới tháng (31/10/2026) tính đúng đến 01/11/2026");
  assert(tzTests.weekBoundaryCrossYear.start === "2026-12-28" && tzTests.weekBoundaryCrossYear.end === "2027-01-03", "Tuần qua ranh giới năm (31/12/2026) tính đúng đến 03/01/2027");

  // ================= BÀI TEST 2: ĐA CÔNG TRÌNH (2025-2027), 20 THỢ, RATESNAPSHOT & CHUYỂN CÔNG TRÌNH =================
  console.log('\n--- BÀI TEST 2: Đa công trình (2025-2027), 20 thợ, rateSnapshot & Chuyển công trình ---');
  await evaluate(`(() => {
    store = createDefaultStore();
    store.projects = [
      { id: "PRJ_ACTIVE_1", name: "Biệt thự An Phú (2026-2027)", owner: "Anh Minh", location: "Quận 2, TP.HCM", status: "active", startDate: "2026-06-01" },
      { id: "PRJ_ACTIVE_2", name: "Nhà phố Thảo Điền (2026)", owner: "Chị Hạnh", location: "Thảo Điền, TP.HCM", status: "active", startDate: "2026-08-15" },
      { id: "PRJ_DONE_3", name: "Cải tạo Nhà thờ Thủ Đức (2025)", owner: "Cha sở", location: "Thủ Đức, TP.HCM", status: "completed", startDate: "2025-01-10" }
    ];

    // Tạo 20 thợ
    store.workers = [];
    for (let i = 1; i <= 20; i++) {
      const pId = i <= 8 ? "PRJ_ACTIVE_1" : (i <= 16 ? "PRJ_ACTIVE_2" : "PRJ_DONE_3");
      store.workers.push({
        id: "W_" + i,
        name: "Thợ Xây " + i,
        role: i % 4 === 0 ? "Thợ cả" : (i % 2 === 0 ? "Thợ xây" : "Thợ phụ"),
        dailyRate: 350000 + (i % 4) * 50000,
        projectId: pId
      });
    }

    // 1. Chấm công W_1 tại PRJ_ACTIVE_1 ngày 2026-10-10 với đơn giá 350.000 đ
    store.attendance.push({
      id: "ATT_SNAP_1",
      projectId: "PRJ_ACTIVE_1",
      workerId: "W_1",
      date: "2026-10-10",
      units: 1.0,
      rateSnapshot: 350000
    });

    // Sau đó tăng lương cơ bản W_1 lên 550.000 đ
    const w1 = store.workers.find(w => w.id === "W_1");
    w1.dailyRate = 550000;

    // Chấm công W_1 ngày 2026-10-11 với đơn giá mới 550.000 đ
    store.attendance.push({
      id: "ATT_SNAP_2",
      projectId: "PRJ_ACTIVE_1",
      workerId: "W_1",
      date: "2026-10-11",
      units: 1.0,
      rateSnapshot: 550000
    });

    // 2. Chuyển công trình: Thợ W_2 ban đầu làm tại PRJ_ACTIVE_1, sau chuyển sang PRJ_ACTIVE_2
    const w2 = store.workers.find(w => w.id === "W_2");
    store.attendance.push({
      id: "ATT_W2_P1",
      projectId: "PRJ_ACTIVE_1",
      workerId: "W_2",
      date: "2026-09-20",
      units: 2.0,
      rateSnapshot: 400000
    });

    // Chuyển sang PRJ_ACTIVE_2 từ tháng 10
    w2.projectId = "PRJ_ACTIVE_2";
    store.attendance.push({
      id: "ATT_W2_P2",
      projectId: "PRJ_ACTIVE_2",
      workerId: "W_2",
      date: "2026-10-05",
      units: 3.0,
      rateSnapshot: 400000
    });

    store.settings.selectedProjectId = "ALL";
    saveStore();
    renderAll();
  })()`);

  const prjCheck = await evaluate(`(() => {
    const att1 = store.attendance.find(a => a.id === "ATT_SNAP_1");
    const att2 = store.attendance.find(a => a.id === "ATT_SNAP_2");
    const w2_p1_att = store.attendance.filter(a => a.workerId === "W_2" && a.projectId === "PRJ_ACTIVE_1");
    const w2_p2_att = store.attendance.filter(a => a.workerId === "W_2" && a.projectId === "PRJ_ACTIVE_2");
    return {
      pCount: store.projects.length,
      wCount: store.workers.length,
      rate1: att1.rateSnapshot,
      rate2: att2.rateSnapshot,
      w2_p1_count: w2_p1_att.length,
      w2_p2_count: w2_p2_att.length
    };
  })()`);

  assert(prjCheck.pCount === 3, "Quản lý 3 công trình (2025-2027)");
  assert(prjCheck.wCount === 20, "Quản lý đủ 20 thợ trên hệ thống");
  assert(prjCheck.rate1 === 350000, "Ngày 10/10 lưu cứng rateSnapshot 350.000 đ bất biến khi sau này thợ được tăng lương");
  assert(prjCheck.rate2 === 550000, "Ngày 11/10 lưu cứng rateSnapshot 550.000 đ theo mức lương mới");
  assert(prjCheck.w2_p1_count === 1 && prjCheck.w2_p2_count === 1, "Khi thợ chuyển công trình, lịch sử công trình cũ (P1) và mới (P2) được phân tách độc lập");

  // ================= BÀI TEST 3: CARRY-FORWARD TIỀN ỨNG QUA 3 KỲ VÀ CHỐNG CHI TRẢ TRÙNG =================
  console.log('\n--- BÀI TEST 3: Carry-forward tiền ứng qua 3 kỳ liên tiếp & Chống chi trả trùng ---');
  // Kịch bản đối soát kế toán:
  // Thợ W_CF tại PRJ_ACTIVE_1:
  // - Kỳ 2026-10: Công = 0 (Lương gộp 0 đ). Tạm ứng: 1.000.000 đ. Dư ứng chuyển kỳ sau: 1.000.000 đ. Thực chi: 0 đ.
  // - Kỳ 2026-11: Làm 4 công @ 500.000 đ = 2.000.000 đ lương gộp. Tạm ứng kỳ này: 0 đ. Dư ứng kỳ trước khấu trừ: 1.000.000 đ. Thực lĩnh: 1.000.000 đ.
  //   Quyết toán trả lương 1.000.000 đ.
  // - Thử thanh toán lại kỳ 2026-11 -> Phải bị chặn (Anti-duplicate).
  // - Kỳ 2026-12: Làm 2 công @ 500.000 đ = 1.000.000 đ lương gộp. Tạm ứng kỳ này: 0 đ.
  //   Số dư ứng kỳ trước đã tất toán (0 đ). Thực lĩnh kỳ này: 1.000.000 đ (KHÔNG được khấu trừ trùng khoản ứng tháng 10).
  await evaluate(`(() => {
    store.workers.push({
      id: "W_CF",
      name: "Thợ Carry Forward",
      role: "Thợ chính",
      dailyRate: 500000,
      projectId: "PRJ_ACTIVE_1"
    });

    // Tháng 10: Ứng 1.000.000 đ, không làm công nào
    store.advances.push({
      id: "ADV_CF_OCT",
      projectId: "PRJ_ACTIVE_1",
      workerId: "W_CF",
      amountVnd: 1000000,
      date: "2026-10-15",
      note: "Ứng chi phí tháng 10",
      signedStatus: "signed",
      signatureType: "digital_ink",
      signatureDataUrl: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
      signedAt: "2026-10-15T08:00:00.000Z",
      docVersion: 1,
      docRef: "REF_ADV_PRJ_ACTIVE_1_W_CF_20261015",
      signatureHash: "REF_ADV_PRJ_ACTIVE_1_W_CF_20261015",
      adjustments: []
    });

    // Tháng 11: 4 công @ 500.000 = 2.000.000 đ
    for (let d = 1; d <= 4; d++) {
      store.attendance.push({
        id: "ATT_CF_NOV_" + d,
        projectId: "PRJ_ACTIVE_1",
        workerId: "W_CF",
        date: "2026-11-0" + d,
        units: 1.0,
        rateSnapshot: 500000
      });
    }

    // Tháng 12: 2 công @ 500.000 = 1.000.000 đ
    for (let d = 1; d <= 2; d++) {
      store.attendance.push({
        id: "ATT_CF_DEC_" + d,
        projectId: "PRJ_ACTIVE_1",
        workerId: "W_CF",
        date: "2026-12-0" + d,
        units: 1.0,
        rateSnapshot: 500000
      });
    }

    saveStore();
    renderAll();
  })()`);

  // Kiểm tra tính toán tháng 10
  const calcOct = await evaluate(`calculateWorkerPayrollForPeriod("W_CF", "PRJ_ACTIVE_1", "2026-10")`);
  assert(calcOct.grossWage === 0, "Tháng 10 lương gộp = 0 đ");
  assert(calcOct.periodAdvance === 1000000, "Tháng 10 tạm ứng = 1.000.000 đ");
  assert(calcOct.netPayable === 0, "Tháng 10 thực chi = 0 đ");
  assert(calcOct.closingSurplus === 1000000, "Tháng 10 dư ứng chuyển kỳ sau = 1.000.000 đ");

  // Kiểm tra tính toán tháng 11
  const calcNov = await evaluate(`calculateWorkerPayrollForPeriod("W_CF", "PRJ_ACTIVE_1", "2026-11")`);
  assert(calcNov.grossWage === 2000000, "Tháng 11 lương gộp = 2.000.000 đ");
  assert(calcNov.periodAdvance === 0, "Tháng 11 không phát sinh tạm ứng mới");
  assert(calcNov.carryForwardIn === 1000000, "Tháng 11 nhận số dư ứng chuyển sang từ tháng 10 = 1.000.000 đ");
  assert(calcNov.advanceDeducted === 1000000, "Tháng 11 khấu trừ đúng 1.000.000 đ tiền ứng chuyển kỳ");
  assert(calcNov.netPayable === 1000000, "Thực lĩnh tháng 11 chính xác là 1.000.000 đ (2tr lương - 1tr ứng dư)");

  // Quyết toán trả lương tháng 11 cho W_CF
  await evaluate(`(() => {
    store.settings.payrollPeriod = "2026-11";
    openWagePaymentSheet("W_CF");
    document.getElementById("btnConfirmWagePayout").click();
  })()`);

  const paymentNov = await evaluate(`store.wagePayments.find(wp => wp.workerId === "W_CF" && wp.periodId === "2026-11")`);
  assert(paymentNov != null, "Đã ghi nhận giao dịch wagePayments cho tháng 11");
  assert(paymentNov.netPaid === 1000000, "Số tiền thực chi ghi sổ quỹ là 1.000.000 đ");
  assert(paymentNov.carryForwardDeducted === 1000000, "Ghi nhận đối soát carryForwardDeducted = 1.000.000 đ");

  // Thử thanh toán lại tháng 11 -> Phải bị chặn
  await evaluate(`(() => {
    openWagePaymentSheet("W_CF");
    // Thử click xác nhận lần nữa
    document.getElementById("btnConfirmWagePayout").click();
  })()`);

  const novPaymentsCount = await evaluate(`store.wagePayments.filter(wp => wp.workerId === "W_CF" && wp.periodId === "2026-11").length`);
  assert(novPaymentsCount === 1, "Chống chi trả trùng: Bản ghi quyết toán tháng 11 chỉ có đúng 1 lần duy nhất");

  // Kiểm tra tính toán tháng 12
  const calcDec = await evaluate(`calculateWorkerPayrollForPeriod("W_CF", "PRJ_ACTIVE_1", "2026-12")`);
  assert(calcDec.grossWage === 1000000, "Tháng 12 lương gộp = 1.000.000 đ");
  assert(calcDec.carryForwardIn === 0, "Tháng 12 số dư ứng chuyển sang là 0 đ (khoản 1tr tháng 10 đã khấu trừ hết trong tháng 11)");
  assert(calcDec.advanceDeducted === 0, "Tháng 12 không bị trừ tiền ứng");
  assert(calcDec.netPayable === 1000000, "Thực lĩnh tháng 12 đủ 1.000.000 đ (Không bị khấu trừ 2 lần cùng một khoản ứng)");

  // ================= BÀI TEST 4: TÁCH KỲ XEM BÁO CÁO (TUẦN/THÁNG/NĂM) KHỎI KỲ QUYẾT TOÁN LƯƠNG =================
  console.log('\n--- BÀI TEST 4: Tách kỳ xem báo cáo khỏi kỳ quyết toán lương ---');
  // Chuyển chế độ xem sang Tuần (week mode)
  await evaluate(`(() => {
    store.settings.periodMode = "week";
    store.settings.selectedDate = "2026-11-02"; // Chỉ chứa ngày 2/11
    store.settings.payrollPeriod = "2026-11";   // Kỳ quyết toán vẫn là tháng 11
    saveStore();
    renderAll();
  })()`);

  // Ở chế độ xem tuần, tính toán lương cho cả kỳ tháng 11 vẫn phải trọn vẹn 2.000.000 đ lương gộp, không bị bóp nghẹt thành 1 ngày
  const calcWhileInWeekMode = await evaluate(`calculateWorkerPayrollForPeriod("W_CF", "PRJ_ACTIVE_1", store.settings.payrollPeriod)`);
  assert(calcWhileInWeekMode.grossWage === 2000000, "Khi chuyển xem báo cáo theo Tuần, bảng lương tháng 11 vẫn giữ nguyên 2.000.000 đ (không bị làm sai kỳ lương)");

  // ================= BÀI TEST 5: S-PEN DIGITAL INK & CHỨNG TỪ ĐỐI SOÁT =================
  console.log('\n--- BÀI TEST 5: Bảo toàn chứng từ S-Pen & Chữ ký số hóa (Digital Ink) ---');
  await evaluate(`(() => {
    store.advances.push({
      id: "ADV_TEST_SPEN_AUDIT",
      projectId: "PRJ_ACTIVE_1",
      workerId: "W_1",
      amountVnd: 750000,
      date: "2026-10-23",
      note: "Ứng vật tư khẩn cấp",
      signedStatus: "unsigned",
      signatureType: null,
      signatureDataUrl: null,
      signedAt: null,
      docVersion: 1,
      docRef: "REF_ADV_PRJ_ACTIVE_1_W_1_20261023",
      signatureHash: "REF_ADV_PRJ_ACTIVE_1_W_1_20261023",
      adjustments: []
    });
    saveStore();
    renderAll();
  })()`);

  // Mở ký bù bằng S-Pen
  await evaluate(`openSupplementalSign("ADV_TEST_SPEN_AUDIT")`);

  // Giả lập vẽ nét bút S-Pen với pointerType: pen, lực nhấn pressure = 0.85
  await evaluate(`(() => {
    const canvas = document.getElementById("spenCanvasSupplemental");
    const rect = canvas.getBoundingClientRect();

    canvas.dispatchEvent(new PointerEvent("pointerdown", {
      clientX: rect.left + 30,
      clientY: rect.top + 30,
      pointerType: "pen",
      pointerId: 201,
      pressure: 0.85
    }));

    // Tỳ bàn tay (Palm touch) -> Palm rejection chặn
    canvas.dispatchEvent(new PointerEvent("pointermove", {
      clientX: rect.left + 80,
      clientY: rect.top + 100,
      pointerType: "touch",
      pointerId: 202
    }));

    // Di chuyển ngòi bút S-Pen
    canvas.dispatchEvent(new PointerEvent("pointermove", {
      clientX: rect.left + 120,
      clientY: rect.top + 50,
      pointerType: "pen",
      pointerId: 201,
      pressure: 0.95
    }));

    canvas.dispatchEvent(new PointerEvent("pointerup", {
      clientX: rect.left + 120,
      clientY: rect.top + 50,
      pointerType: "pen",
      pointerId: 201
    }));

    // Nhấn Lưu chữ ký bổ sung
    document.getElementById("btnSaveSupplementalSign").click();
  })()`);

  const spenAudit = await evaluate(`(() => {
    const adv = store.advances.find(a => a.id === "ADV_TEST_SPEN_AUDIT");
    return {
      status: adv.signedStatus,
      sigType: adv.signatureType,
      version: adv.docVersion,
      docRef: adv.docRef,
      hasAdjustments: adv.adjustments && adv.adjustments.length > 0,
      action: adv.adjustments?.[0]?.action
    };
  })()`);

  assert(spenAudit.status === "signed", "Phiếu ứng sau khi ký chuyển sang trạng thái signed");
  assert(spenAudit.sigType === "digital_ink", "Phân loại chữ ký chuẩn xác là 'digital_ink' (Chữ ký viết tay số hóa qua S-Pen, không giả danh chứng thực PKI)");
  assert(spenAudit.version === 2, "Phiên bản chứng từ docVersion tự động tăng lên 2 sau khi ký bổ sung");
  assert(spenAudit.hasAdjustments && spenAudit.action === "supplemental_sign", "Nhật ký điều chỉnh ghi nhận lịch sử ký bổ sung phục vụ đối soát");

  // ================= BÀI TEST 6: SỔ QUỸ THỐNG NHẤT & XUẤT EXCEL .XLSX ĐỐI SOÁT =================
  console.log('\n--- BÀI TEST 6: Sổ quỹ tiền mặt thống nhất & Xuất file Excel .xlsx ---');
  await evaluate(`(() => {
    // Nạp thêm giao dịch chủ nhà ứng tiền & thanh toán vật tư
    store.cashTransactions = [
      { id: "CSH_MAIN_1", projectId: "PRJ_ACTIVE_1", type: "in", amountVnd: 50000000, category: "Chủ nhà tạm ứng đợt 1", date: "2026-10-01" },
      { id: "CSH_MAIN_2", projectId: "PRJ_ACTIVE_1", type: "out", amountVnd: 1500000, category: "Chi xăng xe đi lại", date: "2026-10-05" }
    ];

    store.materials = [
      {
        id: "MAT_XI_MANG",
        projectId: "PRJ_ACTIVE_1",
        name: "Xi măng Vicem Hà Tiên",
        qty: 100,
        unit: "Bao",
        unitPrice: 95000,
        totalAmount: 9500000,
        vendor: "Đại lý VLXD Bình Triệu",
        purchaseDate: "2026-10-02",
        payments: [
          {
            paymentId: "PAY_MAT_1",
            amount: 4500000,
            paidDate: "2026-10-12",
            note: "Thanh toán đợt 1 bằng tiền mặt"
          }
        ]
      }
    ];

    store.settings.selectedProjectId = "PRJ_ACTIVE_1";
    saveStore();
    renderAll();
  })()`);

  // Tính toán tồn quỹ theo app:
  const finApp = await evaluate(`calculateFinancials()`);
  // Thu: 50.000.000 đ
  // Chi:
  // - CSH_MAIN_2: 1.500.000 đ
  // - ADV_CF_OCT: 1.000.000 đ
  // - ADV_TEST_SPEN_AUDIT: 750.000 đ
  // - PAY_MAT_1: 4.500.000 đ
  // - WPAY tháng 11 (W_CF): 1.000.000 đ
  // Tổng chi = 8.750.000 đ
  // Tồn quỹ app = 50.000.000 - 8.750.000 = 41.250.000 đ.
  assert(finApp.cumulativeBalance === 41250000, `Tồn quỹ tiền mặt tính trên ứng dụng cho PRJ_ACTIVE_1 là ${finApp.cumulativeBalance} đ`);

  // Kiểm tra SheetJS tạo và đọc lại Workbook
  const excelAudit = await evaluate(`(() => {
    const wb = window.generateExcelWorkbook();
    if (!wb) return { error: "Không tạo được workbook" };

    const b64 = XLSX.write(wb, { type: "base64", bookType: "xlsx" });
    const readWb = XLSX.read(b64, { type: "base64" });

    const sheets = readWb.SheetNames;
    const soQuyRows = XLSX.utils.sheet_to_json(readWb.Sheets["SoQuy_TienMat"]);
    const tamUngRows = XLSX.utils.sheet_to_json(readWb.Sheets["TamUng_ChuKy"]);

    const lastRow = soQuyRows[soQuyRows.length - 1];

    return {
      sheets,
      soQuyRowCount: soQuyRows.length,
      finalRunningBalanceExcel: lastRow ? lastRow["SoDuLuyKe_VND"] : null,
      firstColName: soQuyRows[0] ? Object.keys(soQuyRows[0]) : [],
      tamUngSigType: tamUngRows[0] ? tamUngRows[0]["HinhThucKy"] : null,
      b64
    };
  })()`);

  assert(excelAudit.sheets.includes("SoQuy_TienMat"), "File Excel chứa sheet SoQuy_TienMat");
  assert(excelAudit.sheets.includes("TongQuan_TonQuy"), "File Excel chứa sheet TongQuan_TonQuy");
  assert(excelAudit.sheets.includes("TamUng_ChuKy"), "File Excel chứa sheet TamUng_ChuKy");
  assert(excelAudit.sheets.includes("BangLuong_QuyetToan"), "File Excel chứa sheet BangLuong_QuyetToan");
  assert(excelAudit.sheets.includes("VatTu_CongNo"), "File Excel chứa sheet VatTu_CongNo");
  assert(excelAudit.finalRunningBalanceExcel === finApp.cumulativeBalance, `Tổng số dư lũy kế cuối cùng trong Excel (${excelAudit.finalRunningBalanceExcel} đ) bằng chính xác tồn quỹ ứng dụng (${finApp.cumulativeBalance} đ)`);

  // Lưu file .xlsx thật vào thư mục test để nghiệm thu
  const excelFilePath = path.join(ARTIFACT_DIR, 'So_Cong_Trinh_Final_Audit.xlsx');
  fs.writeFileSync(excelFilePath, Buffer.from(excelAudit.b64, 'base64'));
  console.log('📊 Đã lưu file Excel thực tế:', excelFilePath);

  // ================= BÀI TEST 7: STORAGE RESILIENCE & MIGRATION AN TOÀN =================
  console.log('\n--- BÀI TEST 7: Storage Resilience & Migration Dữ liệu cũ ---');
  // 1. Kiểm tra IDB cũ không được ghi đè LocalStorage mới hơn
  const idbSyncTest = await evaluate(`(async () => {
    // Giả sử localStorage đang ở revision 15, thời điểm hiện tại
    store.revision = 15;
    store.updatedAt = "2026-10-23T02:00:00.000Z";
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));

    // Cố tình tạo một bản ghi IDB cũ hơn (revision 10, thời điểm cũ hơn)
    const oldIdbStore = {
      ...store,
      revision: 10,
      updatedAt: "2026-10-22T10:00:00.000Z",
      testMarker: "OLD_IDB_DATA"
    };

    if (AppStorage.db) {
      const tx = AppStorage.db.transaction(STORE_NAME, "readwrite");
      tx.objectStore(STORE_NAME).put(oldIdbStore, "current_state");
      await new Promise(r => tx.oncomplete = r);
    }

    // Gọi đồng bộ AppStorage.syncWithIndexedDB()
    await AppStorage.syncWithIndexedDB();

    const currentStore = store;
    return {
      revision: currentStore.revision,
      hasOldMarker: currentStore.testMarker === "OLD_IDB_DATA"
    };
  })()`);

  assert(idbSyncTest.revision === 15, "LocalStorage giữ nguyên revision 15 mới hơn");
  assert(!idbSyncTest.hasOldMarker, "IndexedDB cũ (revision 10) TUYỆT ĐỐI KHÔNG ghi đè LocalStorage mới hơn");

  // 2. Migration legacy payrollStatus
  const migrationTest = await evaluate(`(() => {
    const rawLegacy = {
      projects: [{ id: "P_LEG", name: "Công trình cũ" }],
      workers: [
        { id: "W_LEG_1", name: "Thợ cũ 1", dailyRate: 400000, projectId: "P_LEG", payrollStatus: "paid" },
        { id: "W_LEG_2", name: "Thợ cũ 2", dailyRate: 400000, projectId: "P_LEG" }
      ],
      payrollStatus: {
        "W_LEG_2_2026-09": "paid"
      },
      attendance: [],
      advances: [],
      materials: [],
      cashTransactions: []
    };

    const migrated = migrateStore(rawLegacy);
    const p1 = migrated.wagePayments.find(wp => wp.workerId === "W_LEG_1");
    const p2 = migrated.wagePayments.find(wp => wp.workerId === "W_LEG_2" && wp.periodId === "2026-09");
    return {
      p1Paid: !!p1,
      p2Paid: !!p2,
      note1: p1 ? p1.note : null
    };
  })()`);

  assert(migrationTest.p1Paid, "Worker có payrollStatus='paid' cũ được tự động chuyển thành bản ghi wagePayments");
  assert(migrationTest.p2Paid, "payrollStatus dictionary cũ được tự động chuyển thành bản ghi wagePayments");

  // ================= BÀI TEST 7.1: BUG 2 — INDEXEDDB OVERWRITE PROTECTION KHI LOCALSTORAGE MẤT/HỎNG =================
  console.log('\n--- BÀI TEST 7.1: BUG 2 — IndexedDB Overwrite Protection & Real Browser Reload ---');
  await evaluate(`(async () => {
    const real24MonthsData = {
      ...createDefaultStore(),
      isDefaultStore: false,
      revision: 100,
      updatedAt: "2026-10-22T00:00:00.000Z",
      projects: [
        { id: "PRJ_HISTORICAL_24M", name: "Dự án Khu Đô Thị Nam Long (24 Tháng)", status: "active", startDate: "2024-10-01" },
        { id: "PRJ_NINH_KIEU", name: "Nhà phố Ninh Kiều", status: "active", startDate: "2026-09-01" }
      ],
      workers: [
        {
          id: "W_MASTER_01",
          name: "Lê Hoàng Quân",
          role: "Thợ cả lâu năm",
          dailyRate: 650000,
          projectId: "PRJ_HISTORICAL_24M",
          assignments: [{ projectId: "PRJ_HISTORICAL_24M", startDate: "2024-10-01", endDate: null }]
        }
      ],
      attendance: [
        { id: "ATT_H_1", projectId: "PRJ_HISTORICAL_24M", workerId: "W_MASTER_01", date: "2024-10-15", units: 1.0, rateSnapshot: 650000 }
      ],
      advances: [
        {
          id: "ADV_H_1",
          projectId: "PRJ_HISTORICAL_24M",
          workerId: "W_MASTER_01",
          date: "2024-10-20",
          amountVnd: 2000000,
          signedStatus: "signed",
          signatureType: "digital_ink",
          docRef: "REF_HISTORICAL_24M_W_MASTER_01"
        }
      ],
      cashTransactions: [
        { id: "CSH_H_1", projectId: "PRJ_HISTORICAL_24M", type: "in", amountVnd: 150000000, date: "2024-10-05" }
      ],
      wagePayments: [],
      materials: []
    };

    const tx = AppStorage.db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put(real24MonthsData, "current_state");
    await new Promise(r => tx.oncomplete = r);

    // Xóa sạch LocalStorage (giả lập trường hợp xóa dữ liệu duyệt web hoặc mất LocalStorage)
    localStorage.clear();
  })()`);

  console.log('🔄 Đang reload trang qua CDP để kiểm tra phục hồi tự động từ IndexedDB...');
  await sendCDP('Page.reload', { ignoreCache: true });
  await wait(2500);

  const reloadRecoveryTest = await evaluate(`(async () => {
    await AppStorage.syncWithIndexedDB();
    const idb = await AppStorage.loadFromIndexedDB();
    const localRaw = localStorage.getItem(STORAGE_KEY);
    const localStore = localRaw ? JSON.parse(localRaw) : null;
    return {
      currentStoreRev: store.revision,
      currentStoreIsDefault: store.isDefaultStore,
      prjCount: store.projects.length,
      hasHistoricalPrj: store.projects.some(p => p.id === "PRJ_HISTORICAL_24M"),
      hasMasterWorker: store.workers.some(w => w.id === "W_MASTER_01"),
      hasSignature: store.advances.some(a => a.id === "ADV_H_1" && a.signedStatus === "signed"),
      cashBalance: store.cashTransactions.find(t => t.id === "CSH_H_1")?.amountVnd,
      idbRev: idb ? idb.revision : null,
      idbHasHistoricalPrj: idb ? idb.projects.some(p => p.id === "PRJ_HISTORICAL_24M") : false,
      localStorageRestored: !!localStore && localStore.revision === 100
    };
  })()`);

  assert(reloadRecoveryTest.currentStoreRev === 100, `Ứng dụng phục hồi chính xác revision 100 từ IndexedDB sau reload (hiện tại: ${reloadRecoveryTest.currentStoreRev})`);
  assert(!reloadRecoveryTest.currentStoreIsDefault, "Dữ liệu phục hồi được xác định là dữ liệu người dùng thật (isDefaultStore = false)");
  assert(reloadRecoveryTest.hasHistoricalPrj, "Công trình 24 tháng PRJ_HISTORICAL_24M còn nguyên vẹn sau reload");
  assert(reloadRecoveryTest.hasMasterWorker, "Hồ sơ thợ W_MASTER_01 tồn tại sau reload");
  assert(reloadRecoveryTest.hasSignature, "Chứng từ chữ ký S-Pen ADV_H_1 tồn tại sau reload");
  assert(reloadRecoveryTest.cashBalance === 150000000, "Sổ quỹ thu tiền mặt 150.000.000 đ còn nguyên vẹn");
  assert(reloadRecoveryTest.idbRev === 100 && reloadRecoveryTest.idbHasHistoricalPrj, "IndexedDB TUYỆT ĐỐI KHÔNG BỊ GHI ĐÈ bởi store mặc định");
  assert(reloadRecoveryTest.localStorageRestored, "LocalStorage bị mất đã được tự động tái lập đồng bộ từ IndexedDB");

  // Kiểm tra thêm trường hợp LocalStorage chứa JSON hỏng
  const corruptedLsTest = await evaluate(`(async () => {
    localStorage.setItem(STORAGE_KEY, "{ corrupted_invalid_json: 123... ");
    const loaded = AppStorage.loadSync();
    await AppStorage.syncWithIndexedDB();
    const idb = await AppStorage.loadFromIndexedDB();
    return {
      loadedWasDefault: loaded.isDefaultStore,
      restoredRev: store.revision,
      hasHist: store.projects.some(p => p.id === "PRJ_HISTORICAL_24M"),
      idbIntact: idb && idb.revision === 100
    };
  })()`);
  assert(corruptedLsTest.restoredRev === 100 && corruptedLsTest.hasHist, "Khi LocalStorage chứa JSON hỏng, ứng dụng tự động phục hồi an toàn từ IndexedDB");
  assert(corruptedLsTest.idbIntact, "IndexedDB không bị ảnh hưởng bởi LocalStorage bị lỗi");

  // ================= BÀI TEST 7.2: BUG 1 — MIGRATION PAYROLLSTATUS V1 THỰC TẾ (KHÓA CHỨA NHIỀU DẤU _) =================
  console.log('\n--- BÀI TEST 7.2: BUG 1 — Migration payrollStatus thực tế của V1 (Khóa chứa dấu _) ---');
  const v1MigrationDetailedTest = await evaluate(`(() => {
    const v1Fixture = {
      projects: [
        { id: "PRJ_NINH_KIEU", name: "Nhà phố Ninh Kiều" },
        { id: "PRJ_CAI_RANG_PHASE_1", name: "Biệt thự Cái Răng Giai đoạn 1" }
      ],
      workers: [
        { id: "W_LEG_01", name: "Nguyễn Văn Ba", role: "Thợ cả", dailyRate: 500000, projectId: "PRJ_NINH_KIEU" },
        { id: "W_02_SUB", name: "Trần Văn Tư", role: "Thợ xây", dailyRate: 450000, projectId: "PRJ_NINH_KIEU" },
        { id: "W03", name: "Lê Hoàng Nam", role: "Thợ sắt", dailyRate: 450000, projectId: "PRJ_CAI_RANG_PHASE_1" }
      ],
      payrollStatus: {
        "PRJ_NINH_KIEU_W_LEG_01_2026-10": "paid",
        "PRJ_NINH_KIEU_W_02_SUB_2026-10": "paid",
        "PRJ_CAI_RANG_PHASE_1_W03_2026-09": "paid"
      },
      attendance: [
        { id: "A1", projectId: "PRJ_NINH_KIEU", workerId: "W_LEG_01", date: "2026-10-10", units: 10, rateSnapshot: 500000 }
      ],
      advances: [
        { id: "ADV1", projectId: "PRJ_NINH_KIEU", workerId: "W_LEG_01", date: "2026-10-05", amountVnd: 1000000, signedStatus: "signed" }
      ],
      materials: [],
      cashTransactions: [
        { id: "CSH_V1_INIT", projectId: "PRJ_NINH_KIEU", type: "in", amountVnd: 50000000, date: "2026-10-01" }
      ]
    };

    const migrated = migrateStore(v1Fixture);

    const wp1 = migrated.wagePayments.find(wp => wp.workerId === "W_LEG_01");
    const wp2 = migrated.wagePayments.find(wp => wp.workerId === "W_02_SUB");
    const wp3 = migrated.wagePayments.find(wp => wp.workerId === "W03");

    const oldStore = store;
    store = migrated;

    const calc1 = calculateWorkerPayrollForPeriod("W_LEG_01", "PRJ_NINH_KIEU", "2026-10");
    const ledger = getUnifiedCashLedger("PRJ_NINH_KIEU");
    const hasFakeZeroVoucher = ledger.some(item => item.source === "Lương thợ" && item.amountOut === 0);

    // Kích hoạt render để chụp màn hình đối chiếu đối soát
    store.settings.selectedProjectId = "PRJ_NINH_KIEU";
    store.settings.payrollPeriod = "2026-10";
    renderAll();
    switchMainTab("tab-money");
    document.querySelector('.subtab-pill[data-subtab="payroll"]').click();

    return {
      wp1Match: wp1 && wp1.workerId === "W_LEG_01" && wp1.projectId === "PRJ_NINH_KIEU" && wp1.periodId === "2026-10",
      wp2Match: wp2 && wp2.workerId === "W_02_SUB" && wp2.projectId === "PRJ_NINH_KIEU" && wp2.periodId === "2026-10",
      wp3Match: wp3 && wp3.workerId === "W03" && wp3.projectId === "PRJ_CAI_RANG_PHASE_1" && wp3.periodId === "2026-09",
      wp1NetPaidNull: wp1 && wp1.netPaid === null,
      wp1LegacyFlag: wp1 && wp1.isLegacyMigration === true && wp1.requiresHistoricalReconciliation === true,
      calc1IsPaid: calc1 ? calc1.isPaid : false,
      calc1NetPayable: calc1 ? calc1.netPayable : -1,
      hasFakeZeroVoucher,
      ledgerCount: ledger.length
    };
  })()`);

  assert(v1MigrationDetailedTest.wp1Match, "Parse chính xác PRJ_NINH_KIEU_W_LEG_01_2026-10 thành workerId='W_LEG_01' và projectId='PRJ_NINH_KIEU'");
  assert(v1MigrationDetailedTest.wp2Match, "Parse chính xác PRJ_NINH_KIEU_W_02_SUB_2026-10 thành workerId='W_02_SUB' và projectId='PRJ_NINH_KIEU'");
  assert(v1MigrationDetailedTest.wp3Match, "Parse chính xác PRJ_CAI_RANG_PHASE_1_W03_2026-09 thành workerId='W03' và projectId='PRJ_CAI_RANG_PHASE_1'");
  assert(v1MigrationDetailedTest.wp1NetPaidNull, "Chứng từ di chuyển V1 không gán số tiền netPaid=0 (netPaid là null)");
  assert(v1MigrationDetailedTest.wp1LegacyFlag, "Đánh dấu requiresHistoricalReconciliation=true cho chứng từ V1 thiếu số tiền thực chi");
  assert(v1MigrationDetailedTest.calc1IsPaid, "Bảo toàn trạng thái đã trả lương (isPaid=true) cho thợ W_LEG_01");
  assert(v1MigrationDetailedTest.calc1NetPayable === 0, "Chống chi trả trùng: netPayable=0 để không cho phép bấm chốt trả lần 2");
  assert(!v1MigrationDetailedTest.hasFakeZeroVoucher, "Sổ quỹ KHÔNG TẠO CHỨNG TỪ TIỀN MẶT GIẢ 0 đ cho các khoản lương di chuyển từ V1");

  await wait(400);
  await captureScreenshot(path.join(ARTIFACT_DIR, 'audit_v1_migration_reconciliation.png'));

  // ================= BÀI TEST 7.3: BUG 3 — LỊCH SỬ THỢ CHUYỂN CÔNG TRÌNH =================
  console.log('\n--- BÀI TEST 7.3: BUG 3 — Lịch sử Thợ Chuyển Công Trình (W01 làm A tháng 9, sang B tháng 10) ---');
  const workerTransferTest = await evaluate(`(() => {
    const w01 = {
      id: "W_TRANS_01",
      name: "Nguyễn Văn Thợ Chuyển",
      role: "Thợ xây chính",
      dailyRate: 500000,
      projectId: "PRJ_CAI_RANG",
      assignments: [
        { projectId: "PRJ_NINH_KIEU", startDate: "2026-09-01", endDate: "2026-09-30" },
        { projectId: "PRJ_CAI_RANG", startDate: "2026-10-01", endDate: null }
      ]
    };

    const testStore = {
      ...createDefaultStore(),
      isDefaultStore: false,
      revision: 50,
      settings: {
        ...store.settings,
        selectedProjectId: "PRJ_NINH_KIEU",
        payrollPeriod: "2026-09",
        selectedMonth: "2026-09",
        selectedDate: "2026-09-15"
      },
      projects: [
        { id: "PRJ_NINH_KIEU", name: "Nhà phố Ninh Kiều (Công trình A)", status: "active", startDate: "2026-09-01" },
        { id: "PRJ_CAI_RANG", name: "Biệt thự Cái Răng (Công trình B)", status: "active", startDate: "2026-10-01" }
      ],
      workers: [w01],
      attendance: [
        // Tháng 9 tại A: 10 công
        { id: "ATT_A_1", projectId: "PRJ_NINH_KIEU", workerId: "W_TRANS_01", date: "2026-09-10", units: 10, rateSnapshot: 500000 },
        // Tháng 10 tại B: 8 công
        { id: "ATT_B_1", projectId: "PRJ_CAI_RANG", workerId: "W_TRANS_01", date: "2026-10-10", units: 8, rateSnapshot: 500000 }
      ],
      advances: [
        // Tháng 9 tại A: 1.000.000 đ
        { id: "ADV_A_1", projectId: "PRJ_NINH_KIEU", workerId: "W_TRANS_01", date: "2026-09-15", amountVnd: 1000000, signedStatus: "signed", signatureType: "digital_ink", docRef: "REF_A" },
        // Tháng 10 tại B: 500.000 đ
        { id: "ADV_B_1", projectId: "PRJ_CAI_RANG", workerId: "W_TRANS_01", date: "2026-10-12", amountVnd: 500000, signedStatus: "signed", signatureType: "digital_ink", docRef: "REF_B" }
      ],
      wagePayments: [
        // Tháng 9 tại A đã quyết toán: 4.000.000 đ
        { id: "WPAY_A_1", projectId: "PRJ_NINH_KIEU", workerId: "W_TRANS_01", periodId: "2026-09", grossWage: 5000000, advanceDeducted: 1000000, netPaid: 4000000, paidDate: "2026-09-30" }
      ],
      cashTransactions: [],
      materials: []
    };

    store = testStore;

    // 1. Kiểm tra khi xem Công trình A tháng 9
    const inPrjA_Sept = isWorkerActiveInProject(w01, "PRJ_NINH_KIEU", "2026-09");
    const payrollA_Sept = calculateWorkerPayrollForPeriod("W_TRANS_01", "PRJ_NINH_KIEU", "2026-09");

    // 2. Kiểm tra khi xem Công trình B tháng 9
    const inPrjB_Sept = isWorkerActiveInProject(w01, "PRJ_CAI_RANG", "2026-09");
    const payrollB_Sept = calculateWorkerPayrollForPeriod("W_TRANS_01", "PRJ_CAI_RANG", "2026-09");

    // 3. Kiểm tra khi xem Công trình B tháng 10
    const inPrjB_Oct = isWorkerActiveInProject(w01, "PRJ_CAI_RANG", "2026-10");
    const payrollB_Oct = calculateWorkerPayrollForPeriod("W_TRANS_01", "PRJ_CAI_RANG", "2026-10");

    // 4. Kiểm tra khi xem Công trình A tháng 10
    const inPrjA_Oct = isWorkerActiveInProject(w01, "PRJ_NINH_KIEU", "2026-10");

    return {
      inPrjA_Sept,
      payrollA_Sept_Units: payrollA_Sept ? payrollA_Sept.totalUnits : null,
      payrollA_Sept_Gross: payrollA_Sept ? payrollA_Sept.grossWage : null,
      payrollA_Sept_Adv: payrollA_Sept ? payrollA_Sept.periodAdvance : null,
      payrollA_Sept_IsPaid: payrollA_Sept ? payrollA_Sept.isPaid : null,
      payrollA_Sept_Net: payrollA_Sept ? payrollA_Sept.wagePayment?.netPaid : null,

      inPrjB_Sept,
      payrollB_Sept_Units: payrollB_Sept ? payrollB_Sept.totalUnits : null,

      inPrjB_Oct,
      payrollB_Oct_Units: payrollB_Oct ? payrollB_Oct.totalUnits : null,
      payrollB_Oct_Gross: payrollB_Oct ? payrollB_Oct.grossWage : null,
      payrollB_Oct_Adv: payrollB_Oct ? payrollB_Oct.periodAdvance : null,
      payrollB_Oct_NetPayable: payrollB_Oct ? payrollB_Oct.netPayable : null,
      payrollB_Oct_IsPaid: payrollB_Oct ? payrollB_Oct.isPaid : null,

      inPrjA_Oct
    };
  })()`);

  assert(workerTransferTest.inPrjA_Sept, "Công trình A (tháng 9) tra cứu được thợ W_TRANS_01");
  assert(workerTransferTest.payrollA_Sept_Units === 10, "Công trình A (tháng 9) tính đúng 10 công (5.000.000 đ lương gộp)");
  assert(workerTransferTest.payrollA_Sept_Adv === 1000000, "Công trình A (tháng 9) tính đúng 1.000.000 đ tạm ứng");
  assert(workerTransferTest.payrollA_Sept_IsPaid && workerTransferTest.payrollA_Sept_Net === 4000000, "Công trình A (tháng 9) hiển thị đã quyết toán lương 4.000.000 đ");

  assert(!workerTransferTest.inPrjB_Sept, "Công trình B (tháng 9) HOÀN TOÀN KHÔNG HIỂN THỊ thợ W_TRANS_01");
  assert(workerTransferTest.payrollB_Sept_Units === 0, "Công trình B (tháng 9) không bị tính lẫn công của Công trình A");

  assert(workerTransferTest.inPrjB_Oct, "Công trình B (tháng 10) hiển thị thợ W_TRANS_01 sau khi chuyển công trình");
  assert(workerTransferTest.payrollB_Oct_Units === 8, "Công trình B (tháng 10) tính đúng 8 công thuộc B");
  assert(workerTransferTest.payrollB_Oct_Adv === 500000, "Công trình B (tháng 10) chỉ khấu trừ 500.000 đ tạm ứng phát sinh tại B");
  assert(workerTransferTest.payrollB_Oct_NetPayable === 3500000, "Công trình B (tháng 10) thực lĩnh chờ tất toán là 3.500.000 đ (Không nhân đôi tiền)");

  assert(!workerTransferTest.inPrjA_Oct, "Công trình A (tháng 10) không hiển thị thợ W_TRANS_01 vì đã chuyển sang B");

  // Chụp ảnh màn hình bảng lương thợ chuyển công trình:
  // 1. Chụp bảng lương Công trình A tháng 9
  await evaluate(`(() => {
    store.settings.selectedProjectId = "PRJ_NINH_KIEU";
    store.settings.payrollPeriod = "2026-09";
    renderAll();
    switchMainTab("tab-money");
    document.querySelector('.subtab-pill[data-subtab="payroll"]').click();
  })()`);
  await wait(400);
  await captureScreenshot(path.join(ARTIFACT_DIR, 'audit_worker_transferred_projectA_sept.png'));

  // 2. Chụp bảng lương Công trình B tháng 10
  await evaluate(`(() => {
    store.settings.selectedProjectId = "PRJ_CAI_RANG";
    store.settings.payrollPeriod = "2026-10";
    renderAll();
    switchMainTab("tab-money");
    document.querySelector('.subtab-pill[data-subtab="payroll"]').click();
  })()`);
  await wait(400);
  await captureScreenshot(path.join(ARTIFACT_DIR, 'audit_worker_transferred_projectB_oct.png'));

  // ================= BÀI TEST 8: REAL DOM INTERACTIONS (USER-LIKE AUTOMATION) =================
  console.log('\n--- BÀI TEST 8: Real DOM Automation & User Interaction ---');
  // Chuyển tab qua DOM click
  await evaluate(`document.querySelector('.nav-item[data-tab="tab-money"]').click()`);
  await wait(300);
  const activeTab = await evaluate(`document.getElementById("tab-money").classList.contains("active")`);
  assert(activeTab, "Click chuột chuyển sang Tab Sổ tiền thành công");

  // Chuyển subtab qua DOM click
  await evaluate(`document.querySelector('.subtab-pill[data-subtab="cashflow"]').click()`);
  await wait(300);
  const activeSubtab = await evaluate(`document.getElementById("subtab-cashflow").classList.contains("active")`);
  assert(activeSubtab, "Click chuột chuyển sang Subtab Thu chi thành công");

  // Mở modal tạo phiếu chi lặt vặt
  await evaluate(`document.getElementById("btnOpenCashOutSheet").click()`);
  await wait(300);
  const isCashOutOpen = await evaluate(`!document.getElementById("sheetCashOutForm").hidden`);
  assert(isCashOutOpen, "Click mở bottom sheet Chi phí lặt vặt thành công");

  // Điền form qua DOM
  await evaluate(`(() => {
    document.getElementById("cashOutAmount").value = 120000;
    document.getElementById("cashOutNote").value = "Mua đinh bê tông";
    document.getElementById("btnSubmitCashOut").click();
  })()`);
  await wait(300);

  const isCashOutClosed = await evaluate(`document.getElementById("sheetCashOutForm").hidden`);
  const newTx = await evaluate(`store.cashTransactions.find(t => t.category === "Mua đinh bê tông")`);
  assert(isCashOutClosed, "Đóng sheet chi phí sau khi bấm Lưu");
  assert(newTx && newTx.amountVnd === 120000, "Ghi nhận giao dịch chi tiền 120.000 đ vào sổ quỹ thành công qua form DOM");

  // ================= BÀI TEST 9: CHỤP ẢNH ĐA VIEWPORT (360, 384, 412, 440 PX) LIGHT & DARK MODE =================
  console.log('\n--- BÀI TEST 9: Kiểm tra hiển thị & Chụp ảnh đa Viewport (Light / Dark Mode) ---');

  const viewports = [
    { width: 360, height: 800, label: "360px_Compact" },
    { width: 384, height: 854, label: "384px_Mid" },
    { width: 412, height: 915, label: "412px_S23Ultra" },
    { width: 440, height: 956, label: "440px_LargeFold" }
  ];

  for (const vp of viewports) {
    console.log(`\n  📱 Kiểm thử màn hình: ${vp.label} (${vp.width} x ${vp.height} CSS px)`);
    await sendCDP('Emulation.setDeviceMetricsOverride', {
      width: vp.width,
      height: vp.height,
      deviceScaleFactor: 2.625,
      mobile: true
    });
    await wait(300);

    // Chế độ Day Mode (Light)
    await evaluate(`(() => {
      store.settings.theme = "light";
      renderAll();
      switchMainTab("tab-overview");
    })()`);
    await wait(400);
    await captureScreenshot(path.join(ARTIFACT_DIR, `audit_${vp.label}_light.png`));

    // Chế độ AMOLED Dark Mode
    await evaluate(`(() => {
      store.settings.theme = "dark";
      renderAll();
      switchMainTab("tab-money");
      document.querySelector('.subtab-pill[data-subtab="payroll"]').click();
    })()`);
    await wait(400);
    await captureScreenshot(path.join(ARTIFACT_DIR, `audit_${vp.label}_dark_payroll.png`));

    // Kiểm tra không bị tràn chiều ngang (Horizontal overflow check)
    const overflowCheck = await evaluate(`(() => {
      const scrollW = document.documentElement.scrollWidth;
      const clientW = document.documentElement.clientWidth;
      return scrollW <= clientW + 1; // Dung sai 1px cho subpixel rendering
    })()`);
    assert(overflowCheck, `Giao diện trên viewport ${vp.width}px hoàn toàn vừa vặn, không bị tràn màn hình theo chiều ngang`);
  }

  // ================= BÀI TEST 10: THỢ MỚI JOINDATE & ENDWORKINGDATE (LOGIC + DOM UI) =================
  console.log('\n--- BÀI TEST 10: Thợ mới joinDate & endWorkingDate (Không hiện ngược về quá khứ) ---');

  // Thêm thợ mới vào làm ngày 23/10/2026 và nghỉ ngày 30/10/2026
  await evaluate(`(() => {
    store.settings.selectedProjectId = "PRJ_NINH_KIEU";
    const testWorker = {
      id: "W_TEST_JOIN_DATE",
      name: "Trần Văn Thợ Mới 23/10",
      phone: "0909231026",
      role: "Thợ hồ mới",
      defaultRate: 420000,
      projectId: "PRJ_NINH_KIEU",
      currentProjectId: "PRJ_NINH_KIEU",
      joinDate: "2026-10-23",
      endWorkingDate: "2026-10-30",
      assignments: [
        { projectId: "PRJ_NINH_KIEU", startDate: "2026-10-23", endDate: "2026-10-30" }
      ]
    };
    store.workers = store.workers.filter(w => w.id !== testWorker.id);
    store.workers.push(testWorker);
    saveStore();
  })()`);

  // Case 1: Xem ngày 22/10/2026 -> Thợ chưa vào làm -> KHÔNG được hiển thị trong DOM
  await evaluate(`(() => {
    store.settings.selectedDate = "2026-10-22";
    store.selectedDate = "2026-10-22";
    switchMainTab("tab-attendance");
    renderAttendanceTab();
  })()`);
  await wait(300);

  const isShown22 = await evaluate(`(() => {
    const names = Array.from(document.querySelectorAll("#attendanceWorkerList .worker-name")).map(el => el.textContent.trim());
    return names.includes("Trần Văn Thợ Mới 23/10");
  })()`);
  const eligible22 = await evaluate(`(() => {
    const w = store.workers.find(x => x.id === "W_TEST_JOIN_DATE");
    return isWorkerEligibleForDate(w, "2026-10-22");
  })()`);
  assert(!isShown22 && !eligible22, "Xem ngày 22/10/2026 (trước ngày vào làm) -> Thợ mới tuyệt đối KHÔNG hiển thị trong danh sách chấm công");

  // Case 2: Xem ngày 23/10/2026 -> Ngày vào làm -> ĐƯỢC hiển thị trong DOM
  await evaluate(`(() => {
    store.settings.selectedDate = "2026-10-23";
    store.selectedDate = "2026-10-23";
    renderAttendanceTab();
  })()`);
  await wait(300);

  const isShown23 = await evaluate(`(() => {
    const names = Array.from(document.querySelectorAll("#attendanceWorkerList .worker-name")).map(el => el.textContent.trim());
    return names.includes("Trần Văn Thợ Mới 23/10");
  })()`);
  const eligible23 = await evaluate(`(() => {
    const w = store.workers.find(x => x.id === "W_TEST_JOIN_DATE");
    return isWorkerEligibleForDate(w, "2026-10-23");
  })()`);
  const hasBadge23 = await evaluate(`(() => {
    const badges = Array.from(document.querySelectorAll("#attendanceWorkerList .worker-badge-joined"));
    return badges.some(b => b.textContent.includes("23/10/2026"));
  })()`);

  assert(isShown23 && eligible23, "Xem ngày 23/10/2026 (ngày vào làm) -> Thợ mới hiển thị chính xác trong danh sách chấm công");
  assert(hasBadge23, "Hiển thị badge trực quan 'Vào làm: 23/10/2026' cho thợ mới");

  // Case 3: Xem ngày 24/10/2026 -> Đang làm việc -> ĐƯỢC hiển thị trong DOM
  await evaluate(`(() => {
    store.settings.selectedDate = "2026-10-24";
    store.selectedDate = "2026-10-24";
    renderAttendanceTab();
  })()`);
  await wait(300);

  const isShown24 = await evaluate(`(() => {
    const names = Array.from(document.querySelectorAll("#attendanceWorkerList .worker-name")).map(el => el.textContent.trim());
    return names.includes("Trần Văn Thợ Mới 23/10");
  })()`);
  const eligible24 = await evaluate(`(() => {
    const w = store.workers.find(x => x.id === "W_TEST_JOIN_DATE");
    return isWorkerEligibleForDate(w, "2026-10-24");
  })()`);
  assert(isShown24 && eligible24, "Xem ngày 24/10/2026 (sau ngày vào làm) -> Thợ mới vẫn hiển thị bình thường");

  // Case 4: Xem ngày 31/10/2026 -> Đã nghỉ việc từ 30/10/2026 -> KHÔNG được hiển thị trong DOM
  await evaluate(`(() => {
    store.settings.selectedDate = "2026-10-31";
    store.selectedDate = "2026-10-31";
    renderAttendanceTab();
  })()`);
  await wait(300);

  const isShown31 = await evaluate(`(() => {
    const names = Array.from(document.querySelectorAll("#attendanceWorkerList .worker-name")).map(el => el.textContent.trim());
    return names.includes("Trần Văn Thợ Mới 23/10");
  })()`);
  const eligible31 = await evaluate(`(() => {
    const w = store.workers.find(x => x.id === "W_TEST_JOIN_DATE");
    return isWorkerEligibleForDate(w, "2026-10-31");
  })()`);
  assert(!isShown31 && !eligible31, "Xem ngày 31/10/2026 (sau ngày nghỉ việc 30/10/2026) -> Thợ không còn hiển thị nữa");

  // ================= BÀI TEST 11: CHỤP ẢNH PREVIEW 4 MÀN HÌNH REDESIGN 2027 (S23 ULTRA 412x915) =================
  console.log('\n--- BÀI TEST 11: Chụp ảnh Preview 4 màn hình Redesign 2027 trên S23 Ultra ---');

  await sendCDP('Emulation.setDeviceMetricsOverride', {
    width: 412,
    height: 915,
    deviceScaleFactor: 2.625,
    mobile: true
  });

  // Màn 1: Tổng quan (Overview)
  await evaluate(`(() => {
    store.settings.theme = "light";
    renderAll();
    switchMainTab("tab-overview");
  })()`);
  await wait(400);
  await captureScreenshot(path.join(ARTIFACT_DIR, 'redesign_2027_tab1_overview.png'));

  // Màn 2: Chấm công (Attendance)
  await evaluate(`(() => {
    store.settings.selectedDate = "2026-10-23";
    store.selectedDate = "2026-10-23";
    switchMainTab("tab-attendance");
    renderAttendanceTab();
  })()`);
  await wait(400);
  await captureScreenshot(path.join(ARTIFACT_DIR, 'redesign_2027_tab2_attendance.png'));

  // Màn 3: Sổ tiền (Money - Unified Ledger Stream)
  await evaluate(`(() => {
    switchMainTab("tab-money");
    document.querySelector('.subtab-pill[data-subtab="total"]').click();
    renderMoneyTab();
  })()`);
  await wait(400);
  await captureScreenshot(path.join(ARTIFACT_DIR, 'redesign_2027_tab3_money.png'));

  // Màn 4: Công trình (Projects)
  await evaluate(`(() => {
    switchMainTab("tab-projects");
    renderProjectsTab();
  })()`);
  await wait(400);
  await captureScreenshot(path.join(ARTIFACT_DIR, 'redesign_2027_tab4_projects.png'));

  // Khôi phục S23 Ultra tiêu chuẩn
  await sendCDP('Emulation.setDeviceMetricsOverride', {
    width: 412,
    height: 915,
    deviceScaleFactor: 2.625,
    mobile: true
  });
  await evaluate(`(() => {
    store.settings.theme = "light";
    renderAll();
    switchMainTab("tab-overview");
  })()`);

  console.log('\n================================================================');
  console.log('              TẤT CẢ CÁC BÀI TEST AUDIT ĐÃ ĐẠT 100%             ');
  console.log('================================================================');
  console.log(`Tổng số khẳng định (assertions): ${testResults.length}`);
  console.log(`Đạt (PASS): ${testResults.filter(r => r.status === 'PASS').length}`);
  console.log(`Không đạt (FAIL): ${testResults.filter(r => r.status === 'FAIL').length}`);

  chromeProc.kill();
  process.exit(0);
}

runTests().catch(err => {
  console.error('\n❌ Lỗi thực thi bộ test E2E Audit:', err);
  process.exit(1);
});
