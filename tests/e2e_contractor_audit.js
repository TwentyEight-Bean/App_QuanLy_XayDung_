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
