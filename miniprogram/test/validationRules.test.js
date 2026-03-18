const test = require('node:test');
const assert = require('node:assert/strict');

const {
  getValidationRule,
  validateByRule,
  validateBatch,
  isValid,
  getAllRuleNames,
} = require('../utils/validationRules');

test('validationRules: should expose known rules', () => {
  const rule = getValidationRule('username');
  assert.equal(rule.name, '账号');
  assert.ok(getAllRuleNames().includes('orderNo'));
});

test('validationRules: should reject invalid required and length values', () => {
  const orderRule = getValidationRule('orderNo');
  assert.equal(validateByRule('', orderRule), '订单号 不能为空');
  assert.equal(validateByRule('1234', orderRule), '订单号 长度不能少于 5 位');
});

test('validationRules: should validate numeric and pattern fields', () => {
  const quantityRule = getValidationRule('quantity');
  assert.equal(validateByRule('0', quantityRule), '数量必须是 1-999999 之间的正整数');
  assert.equal(validateByRule('10.5', quantityRule), '数量必须是 1-999999 之间的正整数');
  assert.equal(validateByRule('15', quantityRule), null);
  assert.equal(isValid('13812345678', 'phone'), true);
  assert.equal(isValid('123', 'phone'), false);
});

test('validationRules: should validate batch payloads', () => {
  const result = validateBatch(
    {
      username: 'ok_user',
      phone: '13812345678',
      quantity: '0',
    },
    {
      username: 'username',
      phone: 'phone',
      quantity: 'quantity',
    },
  );

  assert.equal(result.valid, false);
  assert.equal(result.errors.quantity, '数量必须是 1-999999 之间的正整数');
  assert.equal(result.errors.phone, undefined);
});
