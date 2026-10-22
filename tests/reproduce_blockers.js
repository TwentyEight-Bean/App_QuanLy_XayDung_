/**
 * REPRODUCTION SCRIPT FOR THE 3 BLOCKERS BEFORE FIX
 */
const http = require('http');
const cp = require('child_process');
const fs = require('fs');
const path = require('path');

const PORT = 8080;
const CDP_PORT = 9334;

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

async function wait(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function main() {
  console.log('=== TEST TÁI HIỆN 3 BLOCKER TRƯỚC KHI SỬA ===\n');

  const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  const userDataDir = 'C:\\Users\\taibe\\AppData\\Local\\Temp\\chrome_repro_' + Date.now();

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

  const cdpVersion = await new Promise((resolve, reject) => {
    http.get(`http://127.0.0.1:${CDP_PORT}/json/list`, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve(JSON.parse(data)));
    }).on('error', reject);
  });

  const pageTarget = cdpVersion.find(t => t.type === 'page');
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

  await sendCDP('Page.enable');
  await sendCDP('Runtime.enable');
  await sendCDP('Page.navigate', { url: `http://localhost:${PORT}/` });
  await wait(2000);

  // 1. TÁI HIỆN BUG 1: Migration payrollStatus thực tế của V1
  console.log('--- Kiểm tra BUG 1: V1 Key PRJ_NINH_KIEU_W_LEG_01_2026-10 ---');
  const bug1 = await evaluate(`(() => {
    const rawLegacy = {
      projects: [{ id: "PRJ_NINH_KIEU", name: "Ninh Kiều" }],
      workers: [
        { id: "W_LEG_01", name: "Nguyễn Văn Ba", role: "Thợ cả", dailyRate: 500000, projectId: "PRJ_NINH_KIEU" }
      ],
      payrollStatus: {
        "PRJ_NINH_KIEU_W_LEG_01_2026-10": "paid"
      },
      attendance: [{ id: "A1", projectId: "PRJ_NINH_KIEU", workerId: "W_LEG_01", date: "2026-10-10", units: 5, rateSnapshot: 500000 }],
      advances: [],
      materials: [],
      cashTransactions: []
    };

    const migrated = migrateStore(rawLegacy);
    // Xem wagePayment được tạo ra
    const wp = migrated.wagePayments[0];
    // Giả lập đưa vào store để tính payroll
    const tempStore = store;
    store = migrated;
    const calc = calculateWorkerPayrollForPeriod("W_LEG_01", "PRJ_NINH_KIEU", "2026-10");
    store = tempStore;

    return {
      wpWorkerId: wp ? wp.workerId : null,
      wpProjectId: wp ? wp.projectId : null,
      wpPeriodId: wp ? wp.periodId : null,
      wpNetPaid: wp ? wp.netPaid : null,
      isPaidInCalc: calc ? calc.isPaid : null
    };
  })()`);

  console.log('Kết quả Bug 1 hiện tại:', bug1);
  if (bug1.wpWorkerId !== 'W_LEG_01') {
    console.log('❌ BUG 1 TÁI HIỆN THÀNH CÔNG: wp.workerId bị sai thành:', bug1.wpWorkerId, '(Kỳ vọng: W_LEG_01)');
    console.log('❌ isPaidInCalc:', bug1.isPaidInCalc, '(Kỳ vọng: true, nhưng thực tế là false vì không tìm thấy wp!)');
  }

  // 2. TÁI HIỆN BUG 2: IndexedDB overwrite khi LocalStorage mất
  console.log('\n--- Kiểm tra BUG 2: IDB có dữ liệu thật (rev 100), LocalStorage bị mất/hỏng ---');
  const bug2 = await evaluate(`(async () => {
    // 1. Tạo dữ liệu thật trong IDB
    const realUserStore = {
      ...createDefaultStore(),
      revision: 100,
      updatedAt: "2026-10-22T08:00:00.000Z", // Ngày hôm qua
      projects: [{ id: "PRJ_REAL_24_MONTHS", name: "Dữ liệu thật 24 tháng" }],
      workers: [{ id: "W_REAL", name: "Thợ thật", dailyRate: 600000, projectId: "PRJ_REAL_24_MONTHS" }],
      testMarker: "REAL_24_MONTHS_USER_DATA"
    };

    const tx = AppStorage.db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put(realUserStore, "current_state");
    await new Promise(r => tx.oncomplete = r);

    // 2. Giả lập LocalStorage bị mất (trống)
    localStorage.removeItem(STORAGE_KEY);

    // 3. Giả lập mở lại app: store khởi tạo từ loadSync()
    store = AppStorage.loadSync(); // store sẽ có updatedAt = now, revision = 1
    const storeRevBeforeSync = store.revision;

    // 4. Chạy syncWithIndexedDB()
    await AppStorage.syncWithIndexedDB();

    // 5. Kiểm tra lại IDB xem có bị ghi đè không
    const idbAfterSync = await AppStorage.loadFromIndexedDB();

    return {
      storeRevBeforeSync,
      storeRevAfterSync: store.revision,
      idbHasRealMarker: idbAfterSync ? idbAfterSync.testMarker === "REAL_24_MONTHS_USER_DATA" : false,
      idbRevision: idbAfterSync ? idbAfterSync.revision : null,
      idbProjectId: idbAfterSync && idbAfterSync.projects[0] ? idbAfterSync.projects[0].id : null
    };
  })()`);

  console.log('Kết quả Bug 2 hiện tại:', bug2);
  if (!bug2.idbHasRealMarker || bug2.idbProjectId !== 'PRJ_REAL_24_MONTHS') {
    console.log('❌ BUG 2 TÁI HIỆN THÀNH CÔNG: Dữ liệu thật 24 tháng trong IDB đã BỊ GHI ĐÈ BỞI STORE MẶC ĐỊNH!');
    console.log('❌ IDB project hiện tại:', bug2.idbProjectId, '(Kỳ vọng: PRJ_REAL_24_MONTHS)');
  }

  // 3. TÁI HIỆN BUG 3: Thợ W01 chuyển công trình từ A (tháng 9) sang B (tháng 10)
  console.log('\n--- Kiểm tra BUG 3: Thợ chuyển công trình A -> B ---');
  const bug3 = await evaluate(`(() => {
    // Thợ W01 ban đầu làm PRJ_A ở tháng 9, sau đó được gán projectId = PRJ_B ở tháng 10
    const w01 = { id: "W01", name: "Nguyễn Văn Ba", role: "Thợ cả", dailyRate: 500000, projectId: "PRJ_B" };
    const tempStore = {
      ...createDefaultStore(),
      settings: {
        ...store.settings,
        selectedProjectId: "PRJ_A",
        payrollPeriod: "2026-09",
        selectedMonth: "2026-09"
      },
      projects: [
        { id: "PRJ_A", name: "Công trình A" },
        { id: "PRJ_B", name: "Công trình B" }
      ],
      workers: [w01],
      attendance: [
        { id: "ATT_A_1", projectId: "PRJ_A", workerId: "W01", date: "2026-09-15", units: 1.0, rateSnapshot: 500000 }
      ],
      advances: [
        { id: "ADV_A_1", projectId: "PRJ_A", workerId: "W01", date: "2026-09-15", amountVnd: 500000, signedStatus: "signed" }
      ],
      wagePayments: [],
      materials: [],
      cashTransactions: []
    };

    const oldStore = store;
    store = tempStore;

    // Logic cũ trước khi sửa:
    const oldFilterWorkersInPrjA = store.workers.filter(w => matchesProject(w.projectId));
    // Logic mới sau khi sửa:
    const newFilterWorkersInPrjA = store.workers.filter(w => isWorkerActiveInProject(w, "PRJ_A", "2026-09"));

    store = oldStore;

    return {
      beforeFix_workerFound: oldFilterWorkersInPrjA.some(w => w.id === "W01"),
      afterFix_workerFound: newFilterWorkersInPrjA.some(w => w.id === "W01"),
      workerCountInA_AfterFix: newFilterWorkersInPrjA.length
    };
  })()`);

  console.log('Kết quả Bug 3:', bug3);
  if (!bug3.beforeFix_workerFound) {
    console.log('  [TÁI HIỆN LỖI CŨ] Với logic cũ chỉ lọc theo w.projectId, thợ W01 biến mất khỏi Công trình A tháng 9!');
  }
  if (bug3.afterFix_workerFound) {
    console.log('  [XÁC NHẬN ĐÃ SỬA] Với isWorkerActiveInProject, thợ W01 được tìm thấy đầy đủ tại Công trình A tháng 9!');
  }

  console.log('\n=== HOÀN TẤT BÀI KIỂM THỬ ĐỐI CHIẾU 3 BUGS TRƯỚC VÀ SAU KHI SỬA ===');
  chromeProc.kill();
  process.exit(0);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
