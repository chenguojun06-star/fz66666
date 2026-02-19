/**
 * k6 压力测试脚本 - 订单列表查询场景
 *
 * 用途：测试生产订单列表查询 API 的并发性能
 * API 端点：GET /api/production/order/list
 *
 * 运行方式：
 * 1. 设置环境变量：export JWT_TOKEN="your_jwt_token"
 * 2. 执行测试：k6 run scripts/k6-order-list-test.js
 * 3. 导出结果：k6 run --out json=order-list-results.json scripts/k6-order-list-test.js
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';

// 自定义指标
const errorRate = new Rate('errors');
const queryDuration = new Trend('query_duration');
const emptyResults = new Rate('empty_results');
const avgRecordCount = new Trend('avg_record_count');

// 测试配置
export const options = {
  stages: [
    { duration: '1m', target: 20 },   // 预热：20 用户
    { duration: '5m', target: 50 },   // 压力：50 用户
    { duration: '10m', target: 100 }, // 高压：100 用户
    { duration: '2m', target: 200 },  // 峰值：200 用户
    { duration: '1m', target: 0 },    // 冷却
  ],

  thresholds: {
    'http_req_duration': ['p(95)<300'],  // 95% 的请求 < 300ms
    'http_req_failed': ['rate<0.001'],   // 错误率 < 0.1%
    'errors': ['rate<0.001'],
    'query_duration': ['p(95)<300'],
    'empty_results': ['rate<0.1'],       // 空结果率 < 10%
  },
};

const BASE_URL = 'http://localhost:8088';
const TOKEN = __ENV.JWT_TOKEN;

// 订单状态列表
const STATUSES = ['DRAFT', 'PENDING', 'IN_PROGRESS', 'COMPLETED'];

// 排序字段列表
const SORT_FIELDS = [
  { field: 'createTime', order: 'descend' },
  { field: 'createTime', order: 'ascend' },
  { field: 'deliveryDate', order: 'descend' },
  { field: 'quantity', order: 'descend' },
];

/**
 * 主测试函数
 */
export default function () {
  if (!TOKEN) {
    throw new Error('JWT_TOKEN 环境变量未设置！');
  }

  // 生成随机查询条件
  const current = Math.floor(Math.random() * 50) + 1;  // 页码 1-50
  const useFilter = Math.random() > 0.3;  // 70% 概率使用过滤
  const useSorter = Math.random() > 0.2;  // 80% 概率使用排序

  const payload = {
    current: current,
    size: 20,
  };

  // 添加过滤条件
  if (useFilter) {
    payload.filters = {};

    // 50% 概率按状态过滤
    if (Math.random() > 0.5) {
      payload.filters.status = STATUSES[Math.floor(Math.random() * STATUSES.length)];
    }

    // 30% 概率按工厂过滤
    if (Math.random() > 0.7) {
      payload.filters.factoryCode = 'F001';
    }

    // 20% 概率按订单号模糊搜索
    if (Math.random() > 0.8) {
      payload.filters.orderNo = 'PO2026';
    }

    // 30% 概率按时间范围过滤
    if (Math.random() > 0.7) {
      payload.filters.startDate = '2026-02-01';
      payload.filters.endDate = '2026-02-16';
    }
  }

  // 添加排序
  if (useSorter) {
    const sorter = SORT_FIELDS[Math.floor(Math.random() * SORT_FIELDS.length)];
    payload.sorter = sorter;
  }

  const params = {
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${TOKEN}`,
    },
    timeout: '10s',
  };

  const startTime = new Date().getTime();

  // 执行查询
  const res = http.post(
    `${BASE_URL}/api/production/order/list`,
    JSON.stringify(payload),
    params
  );

  const duration = new Date().getTime() - startTime;
  queryDuration.add(duration);

  // 检查响应
  const checkResult = check(res, {
    'HTTP状态200': (r) => r.status === 200,
    '业务代码200': (r) => {
      try {
        const body = JSON.parse(r.body);
        return body.code === 200;
      } catch (e) {
        return false;
      }
    },
    '有数据结构': (r) => {
      try {
        const body = JSON.parse(r.body);
        return body.data && body.data.records !== undefined;
      } catch (e) {
        return false;
      }
    },
    '响应时间<300ms': (r) => r.timings.duration < 300,
    '响应时间<1000ms': (r) => r.timings.duration < 1000,
  });

  errorRate.add(!checkResult);

  // 统计记录数
  if (res.status === 200) {
    try {
      const body = JSON.parse(res.body);
      if (body.code === 200 && body.data && body.data.records) {
        const recordCount = body.data.records.length;
        avgRecordCount.add(recordCount);
        emptyResults.add(recordCount === 0);

        // 打印样本数据（每100次迭代打印一次）
        if (__ITER % 100 === 0) {
          console.log(`📊 [VU:${__VU}, Iter:${__ITER}] Page:${current}, Records:${recordCount}, Total:${body.data.total}, Time:${duration}ms`);
        }
      } else {
        emptyResults.add(true);
      }
    } catch (e) {
      console.error(`❌ 解析错误 [VU:${__VU}]: ${e.message}`);
    }
  } else {
    console.error(`❌ HTTP错误 [VU:${__VU}]: ${res.status}`);
  }

  // 模拟用户浏览行为（0.5-2秒间隔）
  sleep(Math.random() * 1.5 + 0.5);
}

export function setup() {
  console.log('🚀 开始订单列表查询压力测试...');
  console.log(`📊 目标服务器: ${BASE_URL}`);

  const healthCheck = http.get(`${BASE_URL}/actuator/health`);
  if (healthCheck.status !== 200) {
    throw new Error(`❌ 服务器健康检查失败: ${healthCheck.status}`);
  }

  console.log('✅ 服务器健康检查通过');
  return { startTime: new Date().toISOString() };
}

export function teardown(data) {
  console.log('🏁 测试完成！');
  console.log(`⏱️  开始时间: ${data.startTime}`);
  console.log(`⏱️  结束时间: ${new Date().toISOString()}`);
}
