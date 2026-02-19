/**
 * k6 快速验证测试 - 订单列表查询 (GET)
 * 用途：快速验证 API 连通性和基本性能
 * 测试时间：约 2 分钟
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

const errorRate = new Rate('errors');
const queryDuration = new Trend('query_duration');

export const options = {
  stages: [
    { duration: '15s', target: 5 },    // 预热：5 用户
    { duration: '30s', target: 20 },   // 压力：20 用户
    { duration: '30s', target: 50 },   // 高压：50 用户
    { duration: '15s', target: 100 },  // 峰值：100 用户
    { duration: '10s', target: 0 },    // 冷却
  ],
  thresholds: {
    'http_req_duration': ['p(95)<500'],
    'http_req_failed': ['rate<0.05'],
    'errors': ['rate<0.05'],
  },
};

const BASE_URL = 'http://localhost:8088';
const TOKEN = __ENV.JWT_TOKEN;

const STATUSES = ['DRAFT', 'PENDING', 'IN_PROGRESS', 'COMPLETED'];

export default function () {
  if (!TOKEN) {
    throw new Error('JWT_TOKEN not set');
  }

  const page = Math.floor(Math.random() * 10) + 1;
  const size = 20;

  // 构建 URL 查询参数（GET 方法）
  let url = BASE_URL + '/api/production/order/list?page=' + page + '&size=' + size;

  // 50% 概率添加状态过滤
  if (Math.random() > 0.5) {
    url += '&status=' + STATUSES[Math.floor(Math.random() * STATUSES.length)];
  }

  // 30% 概率添加订单号模糊搜索
  if (Math.random() > 0.7) {
    url += '&orderNo=PO2026';
  }

  const params = {
    headers: {
      'Authorization': 'Bearer ' + TOKEN,
    },
    timeout: '10s',
  };

  const res = http.get(url, params);

  const ok = check(res, {
    'status 200': (r) => r.status === 200,
    'biz code 200': (r) => {
      try { return JSON.parse(r.body).code === 200; } catch(e) { return false; }
    },
    'has records': (r) => {
      try { return JSON.parse(r.body).data.records !== undefined; } catch(e) { return false; }
    },
    'under 500ms': (r) => r.timings.duration < 500,
  });

  errorRate.add(!ok);
  queryDuration.add(res.timings.duration);

  if (__ITER % 50 === 0) {
    try {
      const body = JSON.parse(res.body);
      const total = body.data ? body.data.total : 'N/A';
      console.log('[VU:' + __VU + ' Iter:' + __ITER + '] status=' + res.status + ' total=' + total + ' time=' + Math.round(res.timings.duration) + 'ms');
    } catch(e) {
      console.log('[VU:' + __VU + ' Iter:' + __ITER + '] status=' + res.status + ' time=' + Math.round(res.timings.duration) + 'ms');
    }
  }

  sleep(Math.random() * 0.5 + 0.3);
}

export function setup() {
  console.log('Quick order list test starting... Server: ' + BASE_URL);
  const h = http.get(BASE_URL + '/actuator/health');
  if (h.status !== 200) throw new Error('Server not healthy');
  console.log('Server OK');
  return {};
}

export function teardown() {
  console.log('Quick test done!');
}
