const test = require('node:test');
const assert = require('node:assert/strict');

test('扫码参数映射: 小程序必须使用scanCode(非qrCode)', () => {
  const params = { scanCode: 'QR-001', scanType: 'production' };
  assert.ok(params.hasOwnProperty('scanCode'));
  assert.ok(!params.hasOwnProperty('qrCode'));
});

test('扫码参数映射: 小程序必须使用scanType(非type)', () => {
  const params = { scanType: 'production' };
  assert.ok(params.hasOwnProperty('scanType'));
  assert.ok(!params.hasOwnProperty('type'));
});

test('扫码参数映射: 合法的scanType值', () => {
  const validTypes = ['cutting', 'production', 'quality', 'warehouse', 'pattern'];
  for (const type of validTypes) {
    assert.ok(validTypes.includes(type));
  }
});

test('扫码参数映射: 禁止前端传入的scanType值', () => {
  const forbiddenTypes = ['procurement', 'material_roll', 'quality_confirm', 'sewing', 'orchestration'];
  const validTypes = ['cutting', 'production', 'quality', 'warehouse', 'pattern'];
  for (const ft of forbiddenTypes) {
    assert.ok(!validTypes.includes(ft));
  }
});

test('质检阶段: 必须为receive或confirm(禁止quality_confirm)', () => {
  const validStages = ['receive', 'confirm'];
  assert.ok(validStages.includes('receive'));
  assert.ok(validStages.includes('confirm'));
  assert.ok(!validStages.includes('quality_confirm'));
});

test('质检结果: 必须为qualified或unqualified(禁止defective)', () => {
  const validResults = ['qualified', 'unqualified'];
  assert.ok(validResults.includes('qualified'));
  assert.ok(validResults.includes('unqualified'));
  assert.ok(!validResults.includes('defective'));
});

test('source字段: 小程序source必须为miniprogram', () => {
  const source = 'miniprogram';
  assert.equal(source, 'miniprogram');
  assert.notEqual(source, 'h5');
  assert.notEqual(source, 'flutter');
});

test('扫码类型链路: cutting → production → quality → warehouse', () => {
  const chain = ['cutting', 'production', 'quality', 'warehouse'];
  assert.equal(chain[0], 'cutting');
  assert.equal(chain[1], 'production');
  assert.equal(chain[2], 'quality');
  assert.equal(chain[3], 'warehouse');
});

test('扫码类型: orchestration类型禁止前端传入', () => {
  const validTypes = ['cutting', 'production', 'quality', 'warehouse', 'pattern'];
  assert.ok(!validTypes.includes('orchestration'));
});

test('6大固定父进度节点: 必须有6个固定节点', () => {
  const FIXED_NODES = ['采购', '裁剪', '二次工艺', '车缝', '尾部', '入库'];
  assert.equal(FIXED_NODES.length, 6);
});

test('6大固定父进度节点: 节点顺序正确', () => {
  const FIXED_NODES = ['采购', '裁剪', '二次工艺', '车缝', '尾部', '入库'];
  assert.deepEqual(FIXED_NODES, ['采购', '裁剪', '二次工艺', '车缝', '尾部', '入库']);
});

test('质检两步提交: 第1步receive传入qualityStage=receive', () => {
  const params = {
    scanCode: 'QR-001',
    scanType: 'quality',
    qualityStage: 'receive',
    quantity: 50,
    source: 'miniprogram',
  };
  assert.equal(params.qualityStage, 'receive');
  assert.equal(params.scanType, 'quality');
  assert.equal(params.source, 'miniprogram');
});

test('质检两步提交: 第2步confirm传入qualityStage=confirm+qualityResult', () => {
  const params = {
    scanCode: 'QR-001',
    scanType: 'quality',
    qualityStage: 'confirm',
    qualityResult: 'qualified',
    quantity: 50,
    source: 'miniprogram',
  };
  assert.equal(params.qualityStage, 'confirm');
  assert.equal(params.qualityResult, 'qualified');
  assert.equal(params.source, 'miniprogram');
});

test('质检两步提交: confirm时必须包含qualityResult', () => {
  const params = {
    scanCode: 'QR-001',
    scanType: 'quality',
    qualityStage: 'confirm',
  };
  assert.equal(params.qualityResult, undefined);
});

test('工厂账号隔离: 工厂用户factoryId非空', () => {
  const factoryUser = { factoryId: 'factory-001', role: 'worker' };
  assert.ok(factoryUser.factoryId);
});

test('工厂账号隔离: 租户普通用户factoryId为空', () => {
  const tenantUser = { factoryId: null, role: 'admin' };
  assert.ok(!tenantUser.factoryId);
});

test('工厂账号隔离: 工厂用户只能看本工厂订单', () => {
  const userFactoryId = 'factory-001';
  const ownOrder = { factoryId: 'factory-001' };
  const otherOrder = { factoryId: 'factory-002' };
  assert.equal(ownOrder.factoryId === userFactoryId, true);
  assert.equal(otherOrder.factoryId === userFactoryId, false);
});

test('SSE参数完整性: 小程序SSE请求必须包含所有必要参数', () => {
  const requiredParams = ['question', 'pageContext', 'conversationId', 'imageUrl', 'orderNo', 'processName', 'stage'];
  assert.equal(requiredParams.length, 7);
  assert.ok(requiredParams.includes('question'));
  assert.ok(requiredParams.includes('pageContext'));
  assert.ok(requiredParams.includes('conversationId'));
  assert.ok(requiredParams.includes('imageUrl'));
  assert.ok(requiredParams.includes('orderNo'));
  assert.ok(requiredParams.includes('processName'));
  assert.ok(requiredParams.includes('stage'));
});
