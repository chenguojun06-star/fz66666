const test = require('node:test');
const assert = require('node:assert/strict');

function loadPermission(userInfo) {
  global.wx = {
    getStorageSync(key) {
      if (key === 'user_info') {
        return userInfo;
      }
      return '';
    },
    setStorageSync() {},
    removeStorageSync() {},
  };

  const storagePath = require.resolve('../utils/storage');
  const permissionPath = require.resolve('../utils/permission');
  delete require.cache[storagePath];
  delete require.cache[permissionPath];
  return require('../utils/permission');
}

test('permission: cutter should only access cutting related nodes and scan types', () => {
  const permission = loadPermission({ roleCode: 'cutter', roleName: '裁剪员', id: 'u-1' });

  assert.equal(permission.canAccessNode('裁剪'), true);
  assert.equal(permission.canAccessNode('质检'), false);
  assert.deepEqual(permission.getAllowedScanTypes(), ['cutting']);
  assert.equal(permission.canAccessScanPage(), true);
});

test('permission: sewing role should filter orders by process name', () => {
  const permission = loadPermission({ roleCode: 'sewing', roleName: '车缝员', id: 'u-2' });
  const filtered = permission.filterOrders([
    { currentProcessName: '裁剪' },
    { currentProcessName: '车缝' },
    { currentProcessName: '整烫' },
    { currentProcessName: '质检' },
  ]);

  assert.deepEqual(filtered, [
    { currentProcessName: '车缝' },
    { currentProcessName: '整烫' },
  ]);
});

test('permission: team leader should get team data scope and filter by factory', () => {
  const permission = loadPermission({
    roleCode: 'worker',
    roleName: '裁剪组长',
    id: 'u-3',
    factoryId: 'f-1',
  });

  assert.equal(permission.getDataScope(), 'team');
  assert.deepEqual(
    permission.filterByDataScope([
      { id: 1, factoryId: 'f-1' },
      { id: 2, factoryId: 'f-2' },
    ]),
    [{ id: 1, factoryId: 'f-1' }],
  );
});

test('permission: own scope should filter by creator and build scoped params', () => {
  const permission = loadPermission({
    roleCode: 'quality',
    roleName: '质检员',
    id: 'u-4',
    userId: 'u-4',
    factoryId: 'f-9',
  });

  assert.equal(permission.getDataScope(), 'own');
  assert.deepEqual(
    permission.filterByDataScope([
      { id: 1, creatorId: 'u-4' },
      { id: 2, creatorId: 'u-5' },
    ]),
    [{ id: 1, creatorId: 'u-4' }],
  );
  assert.deepEqual(permission.buildScopedParams({ page: 1 }), {
    page: 1,
    _dataScope: 'own',
    _currentUserId: 'u-4',
    _currentFactoryId: 'f-9',
  });
});
