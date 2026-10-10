const test = require('node:test');
const assert = require('node:assert/strict');

const { parseProductionOrderLines } = require('../utils/orderParser');

test('orderParser: should parse JSON array lines', () => {
  const lines = parseProductionOrderLines({
    orderDetails: JSON.stringify([
      { color: '黑色', size: 'L', quantity: 12 },
      { color: '白色', size: 'M', quantity: 8 },
    ]),
  });

  assert.deepEqual(lines, [
    { color: '黑色', size: 'L', quantity: 12 },
    { color: '白色', size: 'M', quantity: 8 },
  ]);
});

test('orderParser: should parse nested lines payloads', () => {
  const lines = parseProductionOrderLines({
    orderDetails: JSON.stringify({
      lines: [{ colorName: '红色', sizeName: 'XL', qty: '20' }],
    }),
  });

  assert.deepEqual(lines, [{ color: '红色', size: 'XL', quantity: 20 }]);
});

test('orderParser: should fall back to top-level order fields when JSON is invalid', () => {
  const lines = parseProductionOrderLines({
    orderDetails: '{bad-json',
    color: '蓝色',
    size: 'S',
    orderQuantity: '5',
  });

  assert.deepEqual(lines, [{ color: '蓝色', size: 'S', quantity: 5 }]);
});

test('orderParser: should ignore invalid detail rows', () => {
  const lines = parseProductionOrderLines({
    orderDetails: JSON.stringify([
      { color: '黑色', size: '', quantity: 12 },
      { color: '白色', size: 'M', quantity: 0 },
    ]),
  });

  assert.deepEqual(lines, []);
});
