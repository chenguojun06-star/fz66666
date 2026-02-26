/* eslint-disable no-console */
const path = require('path');

const ROOT = '/Volumes/macoo2/Users/guojunmini4/Documents/服装66666';
const StageDetector = require(path.join(ROOT, 'miniprogram/pages/scan/services/StageDetector'));
const api = require(path.join(ROOT, 'miniprogram/utils/api'));
const ProcurementHandler = require(path.join(ROOT, 'miniprogram/pages/scan/handlers/ProcurementHandler'));
const CuttingHandler = require(path.join(ROOT, 'miniprogram/pages/scan/handlers/CuttingHandler'));

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function makeApiForStage({ processConfig, scans, warehousingRecords = [], warehousingRecordsByPage = null, bundleInfo = { id: 'bundle-1', quantity: 30 } }) {
  return {
    production: {
      getProcessConfig: async () => processConfig,
      listScans: async () => ({ records: scans }),
      getCuttingBundle: async () => bundleInfo,
      listWarehousing: async params => {
        const page = Number(params && params.page) || 1;
        if (warehousingRecordsByPage && typeof warehousingRecordsByPage === 'object') {
          return { records: warehousingRecordsByPage[page] || [] };
        }
        return { records: warehousingRecords };
      },
    },
  };
}

async function testStageDetectorFlow() {
  const config = [
    { processName: '采购', progressStage: '采购', sortOrder: 1, price: 0 },
    { processName: '裁剪', progressStage: '裁剪', sortOrder: 2, price: 0 },
    { processName: '车缝', progressStage: '车缝', sortOrder: 3, price: 1.2 },
    { processName: '质检', progressStage: '质检', sortOrder: 4, price: 0.8 },
    { processName: '入库', progressStage: '入库', sortOrder: 5, price: 0 },
  ];

  // 场景1：无扫码记录 -> 应到车缝（采购/裁剪自动跳过菲号工序）
  const d1 = new StageDetector(makeApiForStage({ processConfig: config, scans: [] }));
  const s1 = await d1.detectByBundle('PO001', 'B001', 30, {});
  assert(s1.processName === '车缝', `场景1失败: 预期车缝, 实际${s1.processName}`);

  // 场景2：车缝成功后 -> 应到质检（receive）
  const d2 = new StageDetector(makeApiForStage({
    processConfig: config,
    scans: [{ processName: '车缝', scanType: 'production', scanResult: 'success', requestId: '' }],
  }));
  const s2 = await d2.detectByBundle('PO001', 'B001', 30, {});
  assert(s2.processName === '质检', `场景2失败: 预期质检, 实际${s2.processName}`);
  assert(s2.qualityStage === 'receive', `场景2失败: 预期qualityStage=receive, 实际${s2.qualityStage}`);

  // 场景3：质检已领取未确认 -> 仍在质检（confirm）
  const d3 = new StageDetector(makeApiForStage({
    processConfig: config,
    scans: [
      { processName: '车缝', scanType: 'production', scanResult: 'success', requestId: '' },
      { processName: '质检', scanType: 'quality', processCode: 'quality_receive', scanResult: 'success', requestId: '' },
    ],
  }));
  const s3 = await d3.detectByBundle('PO001', 'B001', 30, {});
  assert(s3.processName === '质检', `场景3失败: 预期质检, 实际${s3.processName}`);
  assert(s3.qualityStage === 'confirm', `场景3失败: 预期qualityStage=confirm, 实际${s3.qualityStage}`);

  // 场景4：质检确认完成 -> 应到入库
  const d4 = new StageDetector(makeApiForStage({
    processConfig: config,
    scans: [
      { processName: '车缝', scanType: 'production', scanResult: 'success', requestId: '' },
      {
        processName: '质检',
        scanType: 'quality',
        processCode: 'quality_receive',
        scanResult: 'success',
        requestId: '',
        confirmTime: '2026-02-27 10:00:00',
      },
    ],
  }));
  const s4 = await d4.detectByBundle('PO001', 'B001', 30, {});
  assert(s4.scanType === 'warehouse', `场景4失败: 预期warehouse, 实际${s4.scanType}`);

  // 场景4b：质检存在多条receive记录，只要任一条已confirm应判定done并进入入库
  const d4b = new StageDetector(makeApiForStage({
    processConfig: config,
    scans: [
      { processName: '车缝', scanType: 'production', scanResult: 'success', requestId: '' },
      { processName: '质检', scanType: 'quality', processCode: 'quality_receive', scanResult: 'success', requestId: '' },
      {
        processName: '质检',
        scanType: 'quality',
        processCode: 'quality_receive',
        scanResult: 'success',
        requestId: '',
        confirmTime: '2026-02-27 11:00:00',
      },
    ],
  }));
  const s4b = await d4b.detectByBundle('PO001', 'B001', 30, {});
  assert(s4b.scanType === 'warehouse', `场景4b失败: 多记录含confirm时应进入入库, 实际${s4b.scanType}`);

  // 场景4c：部分入库（仅10/30）不应判定完成，仍应停留入库
  const d4c = new StageDetector(makeApiForStage({
    processConfig: config,
    scans: [
      { processName: '车缝', scanType: 'production', scanResult: 'success', requestId: '' },
      {
        processName: '质检',
        scanType: 'quality',
        processCode: 'quality_receive',
        scanResult: 'success',
        requestId: '',
        confirmTime: '2026-02-27 10:00:00',
      },
    ],
    warehousingRecords: [{ qualifiedQuantity: 10 }],
    bundleInfo: { id: 'bundle-1', quantity: 30 },
  }));
  const s4c = await d4c.detectByBundle('PO001', 'B001', 30, {});
  assert(s4c.scanType === 'warehouse', `场景4c失败: 部分入库不应完成, 实际${s4c.scanType}`);

  // 场景4d：次品返修应按 defectQty 判断入库完成（5/5后应不再提示入库）
  const d4d = new StageDetector(makeApiForStage({
    processConfig: config,
    scans: [
      { processName: '车缝', scanType: 'production', scanResult: 'success', requestId: '' },
      {
        processName: '质检',
        scanType: 'quality',
        processCode: 'quality_receive',
        scanResult: 'success',
        requestId: '',
        confirmTime: '2026-02-27 10:00:00',
        quantity: 30,
        remark: 'unqualified|跳线|返修|defectQty=5',
      },
    ],
    warehousingRecords: [{ qualifiedQuantity: 5 }],
    bundleInfo: { id: 'bundle-1', quantity: 30 },
  }));
  const s4d = await d4d.detectByBundle('PO001', 'B001', 30, {});
  assert(!!s4d.isCompleted, `场景4d失败: 次品5件入库后应完成, 实际scanType=${s4d.scanType}`);

  // 场景4e：入库记录跨多页（>200条）时，累计满足数量应判定完成
  const page1 = Array.from({ length: 200 }).map(() => ({ qualifiedQuantity: 1 }));
  const page2 = Array.from({ length: 100 }).map(() => ({ qualifiedQuantity: 1 }));
  const d4e = new StageDetector(makeApiForStage({
    processConfig: config,
    scans: [
      { processName: '车缝', scanType: 'production', scanResult: 'success', requestId: '' },
      {
        processName: '质检',
        scanType: 'quality',
        processCode: 'quality_receive',
        scanResult: 'success',
        requestId: '',
        confirmTime: '2026-02-27 12:00:00',
      },
    ],
    warehousingRecordsByPage: {
      1: page1,
      2: page2,
      3: [],
    },
    bundleInfo: { id: 'bundle-1', quantity: 300 },
  }));
  const s4e = await d4e.detectByBundle('PO001', 'B001', 300, {});
  assert(!!s4e.isCompleted, `场景4e失败: 跨页累计满足数量时应完成, 实际scanType=${s4e.scanType}`);

  // 场景5：生产失败记录不应跳过 -> 仍在车缝
  const d5 = new StageDetector(makeApiForStage({
    processConfig: config,
    scans: [{ processName: '车缝', scanType: 'production', scanResult: 'fail', requestId: '' }],
  }));
  const s5 = await d5.detectByBundle('PO001', 'B001', 30, {});
  assert(s5.processName === '车缝', `场景5失败: 预期车缝, 实际${s5.processName}`);

  // 场景6：订单模式 completed -> isCompleted=true
  const d6 = new StageDetector(makeApiForStage({ processConfig: config, scans: [] }));
  const s6 = await d6.detectNextStage({ orderNo: 'PO001', status: 'completed', productionProgress: 100 });
  assert(!!s6.isCompleted, '场景6失败: completed订单应标记isCompleted=true');

  return [
    'StageDetector: 采购/裁剪跳过正常',
    'StageDetector: 生产->质检推进正常',
    'StageDetector: 质检receive/confirm分支正常',
    'StageDetector: 质检完成后入库正常',
    'StageDetector: 质检多记录含confirm判定正常',
    'StageDetector: 部分入库不会误判完成',
    'StageDetector: 次品返修按defectQty判定完成',
    'StageDetector: 多页入库累计判定正常',
    'StageDetector: fail记录不误跳过正常',
    'StageDetector: completed订单拦截正常',
  ];
}

async function testProcurementHandlerFiltering() {
  const original = {
    receivePurchase: api.production.receivePurchase,
    updateArrivedQuantity: api.production.updateArrivedQuantity,
  };

  const receiveCalls = [];
  const updateCalls = [];

  api.production.receivePurchase = async payload => {
    receiveCalls.push(payload);
    return { ok: true };
  };

  api.production.updateArrivedQuantity = async payload => {
    updateCalls.push(payload);
    return { ok: true };
  };

  const originalGetStorageSync = global.wx && global.wx.getStorageSync;
  const originalShowToast = global.wx && global.wx.showToast;

  global.wx = global.wx || {};
  global.wx.getStorageSync = key => {
    if (key !== 'user_info') return '';
    return { id: '1001', username: 'u1001', realName: '测试员A' };
  };
  global.wx.showToast = () => {};

  const ctx = {
    loadMyPanel: () => {},
    setData: () => {},
  };

  try {
    await ProcurementHandler.processProcurementSubmit(ctx, {
      materialPurchases: [
        { id: 'p1', status: 'pending', arrivedQuantity: 0, purchaseQuantity: 10, inputQuantity: 2, remarkInput: '分批到货' },
        { id: 'p2', status: 'received', receiverId: '1001', arrivedQuantity: 1, purchaseQuantity: 10, inputQuantity: 1, remarkInput: '补货中' },
        { id: 'p3', status: 'received', receiverId: '2002', receiverName: '他人', arrivedQuantity: 1, purchaseQuantity: 10, inputQuantity: 1, remarkInput: '他人处理' },
        { id: 'p4', status: 'completed', arrivedQuantity: 10, purchaseQuantity: 10, inputQuantity: 1, remarkInput: '已完成' },
      ],
    });

    const receiveIds = receiveCalls.map(x => x.purchaseId).sort();
    const updateIds = updateCalls.map(x => x.id).sort();

    assert(receiveIds.includes('p1'), '采购过滤失败: pending任务应触发receive');
    assert(!receiveIds.includes('p2'), '采购过滤失败: 当前用户已领取任务不应重复receive');
    assert(!receiveIds.includes('p3'), '采购过滤失败: 他人已领取任务不应receive');
    assert(!receiveIds.includes('p4'), '采购过滤失败: completed任务不应receive');

    assert(updateIds.includes('p1'), '采购过滤失败: pending且有输入应update');
    assert(updateIds.includes('p2'), '采购过滤失败: 当前用户已领取且有输入应update');
    assert(!updateIds.includes('p3'), '采购过滤失败: 他人已领取任务不应update');
    assert(!updateIds.includes('p4'), '采购过滤失败: completed任务不应update');

    return ['ProcurementHandler: 已完成/他人领取过滤正常', 'ProcurementHandler: 当前用户已领取仅更新不重复领取正常'];
  } finally {
    api.production.receivePurchase = original.receivePurchase;
    api.production.updateArrivedQuantity = original.updateArrivedQuantity;

    if (originalGetStorageSync) {
      global.wx.getStorageSync = originalGetStorageSync;
    }
    if (originalShowToast) {
      global.wx.showToast = originalShowToast;
    }
  }
}

async function testCuttingHandlerSelection() {
  const original = {
    getCuttingTaskByOrderId: api.production.getCuttingTaskByOrderId,
    receiveCuttingTaskById: api.production.receiveCuttingTaskById,
  };

  const receiveCalls = [];

  api.production.getCuttingTaskByOrderId = async () => ({
    records: [
      { id: 't1', status: 'received', receiverId: '2002', receiverName: '他人' },
      { id: 't2', status: 'pending' },
      { id: 't3', status: 'received', receiverId: '1001', receiverName: '测试员A' },
      { id: 't4', status: 'bundled' },
    ],
  });

  api.production.receiveCuttingTaskById = async (taskId, receiverId, receiverName) => {
    receiveCalls.push({ taskId, receiverId, receiverName });
    return { ok: true };
  };

  const ctx = {
    setData: () => {},
    loadMyPanel: () => {},
  };

  try {
    await CuttingHandler.receiveCuttingTask(
      ctx,
      { orderNo: 'PO001', orderDetail: { orderNo: 'PO001' } },
      { id: '1001', userId: '1001', username: 'u1001', realName: '测试员A' },
    );

    assert(receiveCalls.length === 1, '裁剪过滤失败: 应仅发起一次领取');
    assert(receiveCalls[0].taskId === 't3', `裁剪过滤失败: 应优先命中本人已领取任务t3, 实际${receiveCalls[0].taskId}`);

    return ['CuttingHandler: 优先本人已领取任务正常', 'CuttingHandler: 不会误选他人/已打菲任务正常'];
  } finally {
    api.production.getCuttingTaskByOrderId = original.getCuttingTaskByOrderId;
    api.production.receiveCuttingTaskById = original.receiveCuttingTaskById;
  }
}

(async () => {
  const lines = [];

  const r1 = await testStageDetectorFlow();
  lines.push(...r1);

  const r2 = await testProcurementHandlerFiltering();
  lines.push(...r2);

  const r3 = await testCuttingHandlerSelection();
  lines.push(...r3);

  console.log('--- Scan Flow Regression Smoke ---');
  lines.forEach(item => console.log('PASS:', item));
  console.log('RESULT=PASS');
})().catch(err => {
  console.error('RESULT=FAIL');
  console.error(err && err.stack ? err.stack : err);
  process.exit(1);
});
