const test = require('node:test');
const assert = require('node:assert/strict');

const {
  handlePatternScan,
  determinePatternOperation,
  submitPatternScan,
  getPatternSuccessMessage,
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
        getPatternProcessConfig: async () => [],
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

test('patternScanProcessor: should respect manual and status-based operation mapping', () => {
  assert.equal(determinePatternOperation({ status: 'PENDING' }), 'RECEIVE');
  assert.equal(determinePatternOperation({ status: 'PRODUCTION_COMPLETED' }, 'warehouse'), 'WAREHOUSE_IN');
  assert.equal(
    determinePatternOperation({ status: 'PRODUCTION_COMPLETED', reviewStatus: 'APPROVED' }),
    'WAREHOUSE_IN',
  );
});

test('patternScanProcessor: should reject invalid or missing pattern detail', async () => {
  const handler = createHandler();

  const invalid = await handlePatternScan(handler, {}, 'plate');
  assert.deepEqual(invalid, { success: false, message: '无效的样板生产二维码' });

  const missing = await handlePatternScan(handler, { patternId: 'P-1' }, 'plate');
  assert.deepEqual(missing, { success: false, message: '样板生产记录不存在' });
});

test('patternScanProcessor: should build review confirmation for completed but unreviewed pattern', async () => {
  const handler = createHandler({
    production: {
      getPatternDetail: async () => ({
        id: 'P-100',
        styleNo: 'ST-1',
        color: '黑色',
        quantity: 2,
        status: 'PRODUCTION_COMPLETED',
        reviewStatus: 'PENDING',
      }),
    },
  });

  const result = await handlePatternScan(handler, { patternId: 'P-100' }, 'review');

  assert.equal(result.success, true);
  assert.equal(result.needConfirm, true);
  assert.equal(result.data.operationType, 'REVIEW');
  assert.equal(result.data.operationOptions.length >= 1, true);
});

test('patternScanProcessor: should submit review and warehouse-in flows', async () => {
  const reviewCalls = [];
  const handler = createHandler({
    production: {
      getPatternDetail: async () => ({ reviewStatus: 'PENDING', reviewResult: 'PENDING' }),
      reviewPattern: async (patternId, result, remark) => {
        reviewCalls.push({ type: 'review', patternId, result, remark });
        return { ok: true };
      },
      submitPatternScan: async payload => {
        reviewCalls.push({ type: 'submit', payload });
        return { ok: true };
      },
    },
  });

  const reviewRes = await submitPatternScan(handler, {
    patternId: 'P-200',
    operationType: 'REVIEW',
    remark: '通过',
  });
  assert.equal(reviewRes.success, true);
  assert.equal(reviewRes.message, '✅ 样衣审核通过');

  const warehouseRes = await submitPatternScan(handler, {
    patternId: 'P-200',
    operationType: 'WAREHOUSE_IN',
    quantity: 3,
    remark: '入库',
  });
  assert.equal(warehouseRes.success, true);
  assert.equal(reviewCalls.filter(item => item.type === 'review').length, 2);
  assert.equal(reviewCalls.some(item => item.type === 'submit'), true);
});

test('patternScanProcessor: should surface submission errors and fallback messages', async () => {
  const handler = createHandler({
    production: {
      submitPatternScan: async () => {
        throw new Error('提交异常');
      },
    },
  });

  const result = await submitPatternScan(handler, {
    patternId: 'P-300',
    operationType: 'PLATE',
    quantity: 1,
  });

  assert.deepEqual(result, { success: false, message: '提交异常' });
  assert.equal(getPatternSuccessMessage('UNKNOWN'), '✅ 操作成功');
});
