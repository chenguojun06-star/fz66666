const test = require('node:test');
const assert = require('node:assert/strict');

const {
  handlePatternScan,
  getPatternDetail,
  getPatternScanRecords,
} = require('../pages/scan/handlers/PatternScanProcessor');

function createHandler(overrides = {}) {
  const calls = [];
  const handler = {
    SCAN_MODE: { PATTERN: 'PATTERN' },
    _errorResult(message) {
      return { success: false, message };
    },
    api: {
      production: {
        getPatternDetail: async () => null,
        getPatternScanRecords: async () => [],
        reviewPattern: async () => ({ reviewed: true }),
        submitPatternScan: async payload => {
          calls.push({ type: 'submit', payload });
          return { saved: true, payload };
        },
      },
    },
    _calls: calls,
  };

  if (overrides.production) {
    Object.assign(handler.api.production, overrides.production);
  }

  return handler;
}

test('patternScanProcessor: should reject styles without process config (D-165)', async () => {
  const handler = createHandler({
    production: {
      getPatternDetail: async (id) => ({
        id: id,
        styleNo: 'ST-NO-CONFIG',
        status: 'PENDING',
      }),
      getPatternScanRecords: async () => [],
    },
  });

  const result = await handlePatternScan(handler, { patternId: 'P-NO-CONFIG' }, null);
  assert.equal(result.success, false);
  assert.ok(result.message.includes('未配置开发工序'));
});

test('patternScanProcessor: should reject invalid or missing pattern detail', async () => {
  const handler = createHandler();

  const invalid = await handlePatternScan(handler, {}, 'plate');
  assert.deepEqual(invalid, { success: false, message: '无效的样衣二维码' });

  const missing = await handlePatternScan(handler, { patternId: 'P-1' }, 'plate');
  assert.deepEqual(missing, { success: false, message: '样衣记录不存在' });
});

test('patternScanProcessor: should handle getPatternDetail correctly', async () => {
  const handler = createHandler({
    production: {
      getPatternDetail: async (id) => ({
        id: id,
        styleNo: 'ST-1',
        color: '黑色',
        quantity: 2,
        status: 'IN_PROGRESS',
      }),
    },
  });

  const detail = await getPatternDetail(handler, 'P-100');
  assert.equal(detail.id, 'P-100');
  assert.equal(detail.styleNo, 'ST-1');
  assert.equal(detail.color, '黑色');
  assert.equal(detail.quantity, 2);
  assert.equal(detail.status, 'IN_PROGRESS');
});

test('patternScanProcessor: should get pattern scan records', async () => {
  const handler = createHandler({
    production: {
      getPatternScanRecords: async () => [
        { operationType: 'RECEIVE', success: true },
        { operationType: 'PLATE', success: true },
      ],
    },
  });

  const records = await getPatternScanRecords(handler, 'P-200');
  assert.ok(Array.isArray(records));
  assert.equal(records.length, 2);
  assert.equal(records[0].operationType, 'RECEIVE');
  assert.equal(records[1].operationType, 'PLATE');
});

test('patternScanProcessor: should handle complete scan flow', async () => {
  // D-165 起「未配置工序直接拦截」，默认四步流程（RECEIVE→PLATE→…）已删除。
  // 因此「完整流程」= PC 端已配工序 → 按工序配置生成可操作项，不再有默认首步。
  const handler = createHandler({
    production: {
      getPatternDetail: async () => ({
        id: 'P-300',
        styleNo: 'ST-300',
        color: '红色',
        quantity: 1,
        status: 'PENDING',
      }),
      getPatternScanRecords: async () => [],
      getPatternProcessConfig: async () => ([
        { processName: '车缝', progressStage: '车缝', scanType: 'production', status: 'PENDING', sortOrder: 0 },
        { processName: '整烫', progressStage: '整烫', scanType: 'production', status: 'PENDING', sortOrder: 1 },
      ]),
    },
  });

  const result = await handlePatternScan(handler, { patternId: 'P-300' }, null);

  assert.equal(result.success, true);
  assert.equal(result.needConfirm, true);
  assert.equal(result.scanMode, 'PATTERN');
  assert.equal(result.data.patternId, 'P-300');
  assert.equal(result.data.hasProcessSystem, true);
  assert.equal(result.data.styleNo, 'ST-300');
  // D-172：样衣按件统计，扫码默认数量 1 件（计划数量仅作上限）
  assert.equal(result.data.quantity, 1);
  // 未指定手动扫码类型 → 默认选第一道工序，不再是已删除的 RECEIVE
  assert.equal(result.data.operationType, '车缝');
  assert.deepEqual(
    result.data.operationOptions.map(function (o) { return o.value; }),
    ['车缝', '整烫'],
  );
});

test('patternScanProcessor: should pick the operation matching manual scan type (D-165)', async () => {
  const handler = createHandler({
    production: {
      getPatternDetail: async () => ({
        id: 'P-400',
        styleNo: 'ST-400',
        color: '蓝色',
        quantity: 1,
        status: 'PENDING',
      }),
      getPatternScanRecords: async () => [],
      getPatternProcessConfig: async () => ([
        { processName: '车缝', status: 'PENDING', sortOrder: 0 },
        { processName: '整烫', status: 'PENDING', sortOrder: 1 },
      ]),
    },
  });

  const result = await handlePatternScan(handler, { patternId: 'P-400' }, '整烫');

  assert.equal(result.success, true);
  assert.equal(result.data.operationType, '整烫');
});

test('patternScanProcessor: should return no-action error when all operations are unavailable', async () => {
  const handler = createHandler({
    production: {
      getPatternDetail: async () => ({
        id: 'P-500',
        styleNo: 'ST-500',
        status: 'PENDING',
      }),
      getPatternScanRecords: async () => [],
      // 配了工序但列表为空 → hasProcessSystem 为 true，operationOptions 为空
      getPatternProcessConfig: async () => [],
    },
  });

  const result = await handlePatternScan(handler, { patternId: 'P-500' }, null);
  assert.equal(result.success, false);
});
