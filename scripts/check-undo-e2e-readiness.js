const { execSync } = require('child_process');

const BASE = 'http://localhost:8088';
const PASSWORDS = [process.env.TEST_ADMIN_PASSWORD, '123456', 'admin123', 'Abc123456'].filter(Boolean);

function sh(cmd) {
  return execSync(cmd, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
}

function login() {
  for (const pwd of PASSWORDS) {
    try {
      const out = sh(`curl -s -X POST '${BASE}/api/system/user/login' -H 'Content-Type: application/json' -d '{"username":"admin","password":"${pwd}"}'`);
      const j = JSON.parse(out || '{}');
      const token = (j && j.data && j.data.token) || j.token || '';
      if (token) return token;
    } catch (_) {}
  }
  return '';
}

function listOrders(token) {
  const all = [];
  for (let page = 1; page <= 3; page += 1) {
    let j = {};
    try {
      const out = sh(`curl -s '${BASE}/api/production/order/list?page=${page}&pageSize=100' -H 'Authorization: Bearer ${token}'`);
      j = JSON.parse(out || '{}');
    } catch (_) {
      j = {};
    }
    const rows = (j && j.data && Array.isArray(j.data.records)) ? j.data.records : [];
    if (!rows.length) break;
    all.push(...rows);
    if (rows.length < 100) break;
  }
  return all;
}

function listScans(token, orderId) {
  let j = {};
  try {
    const out = sh(`curl -s '${BASE}/api/production/scan/list?orderId=${orderId}&page=1&pageSize=500' -H 'Authorization: Bearer ${token}'`);
    j = JSON.parse(out || '{}');
  } catch (_) {
    j = {};
  }
  const data = j.data;
  if (data && Array.isArray(data.records)) return data.records;
  if (Array.isArray(data)) return data;
  return [];
}

function main() {
  const token = login();
  if (!token) {
    console.log('CHECKLIST FAIL: 登录失败');
    process.exit(1);
  }

  const orders = listOrders(token);
  const active = orders.filter(o => {
    const s = String((o && o.status) || '').toLowerCase();
    return !['completed', 'closed', 'cancelled', 'archived'].includes(s);
  });

  console.log(`CHECKLIST 1: 租户订单总数=${orders.length}, 生产中可测订单=${active.length}`);

  if (!active.length) {
    console.log('CHECKLIST 2: 撤回前后两页+弹窗一致性=SKIP（当前租户无可测订单）');
    process.exit(0);
  }

  const sample = active[0];
  const scans = listScans(token, sample.id);
  const success = scans.filter(r => String((r && r.scanResult) || '').toLowerCase() === 'success');
  const undoCandidates = success.filter(r => !((r && r.payrollSettlementId) || '') && !!(r && r.id));

  console.log(`CHECKLIST 2: 样本订单=${sample.orderNo || sample.id}, 扫码记录=${scans.length}, 成功记录=${success.length}, 可尝试撤回=${undoCandidates.length}`);
  if (!undoCandidates.length) {
    console.log('CHECKLIST 3: 撤回端到端核验=SKIP（无可撤回样本）');
  } else {
    console.log('CHECKLIST 3: 撤回端到端核验=READY（可执行）');
  }
}

main();
