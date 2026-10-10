const test = require('node:test');
const assert = require('node:assert/strict');

function resolveQuantity(orderDetail, parsedData) {
  return parsedData.quantity
    || orderDetail.cuttingQty || orderDetail.quantity || orderDetail.totalQuantity
    || orderDetail.totalNum || orderDetail.orderQuantity || 0;
}

test('cuttingQty fallback: cuttingQty优先于orderQuantity', () => {
  const orderDetail = { cuttingQty: 80, orderQuantity: 100, totalQuantity: 100 };
  const result = resolveQuantity(orderDetail, {});
  assert.equal(result, 80);
});

test('cuttingQty fallback: cuttingQty为空时使用orderQuantity', () => {
  const orderDetail = { orderQuantity: 100, totalQuantity: 100 };
  const result = resolveQuantity(orderDetail, {});
  assert.equal(result, 100);
});

test('cuttingQty fallback: cuttingQty和orderQuantity都为空时使用totalQuantity', () => {
  const orderDetail = { totalQuantity: 90 };
  const result = resolveQuantity(orderDetail, {});
  assert.equal(result, 90);
});

test('cuttingQty fallback: 所有字段为空时使用totalNum', () => {
  const orderDetail = { totalNum: 70 };
  const result = resolveQuantity(orderDetail, {});
  assert.equal(result, 70);
});

test('cuttingQty fallback: 全部为空时返回0', () => {
  const orderDetail = {};
  const result = resolveQuantity(orderDetail, {});
  assert.equal(result, 0);
});

test('cuttingQty fallback: parsedData.quantity覆盖cuttingQty', () => {
  const orderDetail = { cuttingQty: 80, orderQuantity: 100 };
  const parsedData = { quantity: 50 };
  const result = resolveQuantity(orderDetail, parsedData);
  assert.equal(result, 50);
});

test('cuttingQty fallback: cuttingQty为0时fallback到orderQuantity', () => {
  const orderDetail = { cuttingQty: 0, orderQuantity: 100 };
  const result = resolveQuantity(orderDetail, {});
  assert.equal(result, 100);
});

test('cuttingQty fallback: cuttingQty为null时fallback到orderQuantity', () => {
  const orderDetail = { cuttingQty: null, orderQuantity: 100 };
  const result = resolveQuantity(orderDetail, {});
  assert.equal(result, 100);
});

test('cuttingQty fallback: cuttingQty为undefined时fallback到orderQuantity', () => {
  const orderDetail = { orderQuantity: 100 };
  const result = resolveQuantity(orderDetail, {});
  assert.equal(result, 100);
});
