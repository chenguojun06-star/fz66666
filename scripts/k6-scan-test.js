/**
 * k6 压力测试脚本 - 扫码录入场景
 *
 * 用途：测试扫码录入 API 的并发性能
 * API 端点：POST /api/production/scan/execute
 *
 * 运行方式：
 * 1. 设置环境变量：export JWT_TOKEN="your_jwt_token"
 * 2. 执行测试：k6 run scripts/k6-scan-test.js
 * 3. 查看结果：k6 run --out json=scan-results.json scripts/k6-scan-test.js
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';

// 自定义指标
const errorRate = new Rate('errors');
const scanDuration = new Trend('scan_duration');
const successCount = new Counter('success_count');

// 测试配置
export const options = {
  // 场景配置：逐步增加负载
  stages: [
    { duration: '1m', target: 10 },   // 预热：10 并发用户
    { duration: '3m', target: 50 },   // 增压：50 并发用户
    { duration: '5m', target: 100 },  // 高压：100 并发用户
    { duration: '2m', target: 200 },  // 峰值：200 并发用户
    { duration: '1m', target: 0 },    // 冷却：停止
  ],

  // 性能阈值（不满足则测试失败）
  thresholds: {
    'http_req_duration': ['p(95)<500'],  // 95% 的请求 < 500ms
    'http_req_failed': ['rate<0.01'],    // 错误率 < 1%
    'errors': ['rate<0.01'],             // 业务错误率 < 1%
    'scan_duration': ['p(95)<500'],      // 扫码响应时间 < 500ms
  },
};

// 配置参数
const BASE_URL = 'http://localhost:8088';
const TOKEN = __ENV.JWT_TOKEN;

// 工序列表
const PROCESSES = [
  { code: 'CUT', name: '裁剪' },
  { code: 'SEW', name: '缝制' },
  { code: 'IRON', name: '大烫' },
  { code: 'QC', name: '质检' },
  { code: 'PACK', name: '包装' },
  { code: 'WAREHOUSE', name: '入库' },
];

// 颜色尺码列表
const COLORS = ['红色', '蓝色', '黑色', '白色', '灰色'];
const SIZES = ['S', 'M', 'L', 'XL', 'XXL'];

/**
 * 主测试函数（每个虚拟用户每次迭代都会执行）
 */
export default function () {
  // 检查 Token
  if (!TOKEN) {
    throw new Error('JWT_TOKEN 环境变量未设置！请运行：export JWT_TOKEN="your_token"');
  }

  // 生成动态测试数据
  const orderIndex = (__VU * 100 + __ITER) % 1000 + 1;
  const process = PROCESSES[Math.floor(Math.random() * PROCESSES.length)];
  const color = COLORS[Math.floor(Math.random() * COLORS.length)];
  const size = SIZES[Math.floor(Math.random() * SIZES.length)];

  const payload = JSON.stringify({
    orderNo: `PO202602${String(orderIndex).padStart(7, '0')}`,
    styleNo: 'FZ2024001',
    color: color,
    size: size,
    quantity: Math.floor(Math.random() * 50) + 10,
    bundleNo: `B${String(__VU).padStart(3, '0')}_${String(__ITER).padStart(4, '0')}`,
    processCode: process.code,
    processName: process.name,
    factoryCode: 'F001',
    operatorName: `员工${__VU}`,
  });

  const params = {
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${TOKEN}`,
    },
    timeout: '10s',
  };

  // 记录开始时间
  const startTime = new Date().getTime();

  // 执行扫码请求
  const res = http.post(`${BASE_URL}/api/production/scan/execute`, payload, params);

  // 记录响应时间
  const duration = new Date().getTime() - startTime;
  scanDuration.add(duration);

  // 检查响应
  const checkResult = check(res, {
    'HTTP状态200': (r) => r.status === 200,
    '业务代码200': (r) => {
      try {
        return JSON.parse(r.body).code === 200;
      } catch (e) {
        return false;
      }
    },
    '响应时间<500ms': (r) => r.timings.duration < 500,
    '响应时间<1000ms': (r) => r.timings.duration < 1000,
  });

  // 统计错误率
  errorRate.add(!checkResult);

  // 统计成功次数
  if (checkResult) {
    successCount.add(1);
  }

  // 打印详细错误日志
  if (res.status !== 200) {
    console.error(`❌ HTTP错误 [VU:${__VU}, Iter:${__ITER}]: ${res.status} ${res.body}`);
  } else {
    try {
      const body = JSON.parse(res.body);
      if (body.code !== 200) {
        console.error(`❌ 业务错误 [VU:${__VU}, Iter:${__ITER}]: ${body.message}`);
      }
    } catch (e) {
      console.error(`❌ 解析错误 [VU:${__VU}, Iter:${__ITER}]: ${e.message}`);
    }
  }

  // 模拟真实用户行为（每次扫码间隔 1-3 秒）
  sleep(Math.random() * 2 + 1);
}

/**
 * 设置阶段（仅执行一次）
 */
export function setup() {
  console.log('🚀 开始压力测试...');
  console.log(`📊 目标服务器: ${BASE_URL}`);
  console.log(`🔑 Token前缀: ${TOKEN ? TOKEN.substring(0, 20) + '...' : '未设置'}`);

  // 验证服务器连通性
  const healthCheck = http.get(`${BASE_URL}/actuator/health`);
  if (healthCheck.status !== 200) {
    throw new Error(`❌ 服务器健康检查失败: ${healthCheck.status}`);
  }

  console.log('✅ 服务器健康检查通过');
  return { startTime: new Date().toISOString() };
}

/**
 * 清理阶段（仅执行一次）
 */
export function teardown(data) {
  console.log('🏁 测试完成！');
  console.log(`⏱️  开始时间: ${data.startTime}`);
  console.log(`⏱️  结束时间: ${new Date().toISOString()}`);
}
