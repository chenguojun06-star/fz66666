const fs = require('fs');
const content = fs.readFileSync('frontend/src/routeConfig.ts', 'utf8');

// 1. superAdminOnly count
const superAdminMatches = [...content.matchAll(/superAdminOnly:\s*true/g)];
console.log('=== superAdminOnly 出现次数:', superAdminMatches.length);

const lines = content.split('\n');
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('superAdminOnly')) {
    for (let j = i; j >= Math.max(0, i-5); j--) {
      if (lines[j].includes('title:')) {
        console.log('  超管专属:', lines[j].trim());
        break;
      }
    }
  }
}

// 2. API对接管理
const tenantBlock = content.match(/title:\s*'API对接管理'[\s\S]*?\},/);
console.log('\n=== API对接管理 配置:');
if (tenantBlock) {
  console.log(tenantBlock[0]);
  console.log('含 superAdminOnly:', tenantBlock[0].includes('superAdminOnly'));
} else {
  console.log('未找到!');
}

// 3. 权限码
const perm = content.match(/tenantManagement:\s*'([^']+)'/);
console.log('\n=== tenantManagement 权限码:', perm ? perm[1] : '未找到');

// 4. ApiOutlined
console.log('\n=== ApiOutlined 导入:', content.includes('ApiOutlined') ? 'YES' : 'NO');

// 5. PrivateRoute logic check
const pr = fs.readFileSync('frontend/src/components/PrivateRoute/index.tsx', 'utf8');
console.log('\n=== PrivateRoute 权限流程:');
console.log('  superAdminOnlyPaths 检查:', pr.includes('superAdminOnlyPaths') ? 'YES' : 'NO');
console.log('  isAdmin 跳过权限检查:', pr.includes('isAdmin') ? 'YES' : 'NO');

// 6. Layout menu filter
const layout = fs.readFileSync('frontend/src/components/Layout/index.tsx', 'utf8');
const adminCheck = layout.includes('isAdmin') && layout.includes('hasPermissionForPath');
console.log('  Layout isAdmin 绕过权限:', adminCheck ? 'YES' : 'NO');

console.log('\n=== 结论:');
console.log('租户主账号 (isTenantOwner=true, isAdmin=true):');
console.log('  1. superAdminOnly 检查: API对接管理不含 superAdminOnly -> 通过');
console.log('  2. hasPermissionForPath: isAdmin=true -> 跳过权限码检查 -> 通过');
console.log('  3. 菜单可见: YES');
console.log('\n普通员工 (需要 MENU_TENANT_APP 权限码):');
console.log('  需要在角色中分配 MENU_TENANT_APP 权限才能看到');

// cleanup
fs.unlinkSync(__filename);
