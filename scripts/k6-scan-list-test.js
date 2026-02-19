/**
 * k6 压力测试 - 扫码记录查询场景
 * API: GET /api/production/scan/list
 * 测试时间：约 2 分钟（快速版）
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

const errorRate = new Rate('errors');
const queryDuration = new Trend('query_duration');

export const options = {
  stages: [
    { duration: '15s', target: 10 },
    { duration: '30s', target: 30 },
    { duration: '30s', target: 60 },
    { duration: '15s', target: 100 },
    { duration: '10s', target: 0 },
  ],
  thresholds: {
    'http_req_duration': ['p(95)<500'],
    'http_req_failed': ['rate<0.05'],
    'errors': ['rate<0.05'],
  },
};

const BASE_URL = 'http://localhost:8088';
const TOKEN = __ENV.JWT_TOKEN;

const PROCESS_CODES = ['CUT', 'SEW', 'IRON', 'QC', 'PACK', 'WAREHOUSE'];

export default function () {
  if (!TOKEN) throw new Error('JWT_TOKEN not set');

  const page = Math.floor(Math.random() * 50) + 1;
  const size = 20;

  let url = BASE_URL + '/api/production/scan/list?page=' + page + '&size=' + size;

  // 40% 概率按工序查询
  if (Math.random() > 0.6) {
    url += '&processCode=' + PROCESS_CODES[Math.floor(Math.random() * PROCESS_CODES.length)];
  }

  // 30% 概率按订单号查询
  if (Math.random() > 0.7) {
    const idx = Math.floor(Math.random() * 1000) + 1;
    url += '&orderNo=PO2026020' + String(idx).padStart(4, '0');
  }

  const params = {
    headers: { 'Authorization': 'Bearer ' + TOKEN },
    timeout: '10s',
  };

  const res = http.get(url, params);

  const ok = check(res, {
    'status 200': (r) => r.status === 200,
    'biz code 200': (r) => {
      try { return JSON.parse(r.body).code === 200; } catch(e) { return false; }
    },
    'has data': (r) => {
      try { return JSON.parse(r.body).data !== undefined; } catch(e) { return false; }
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
      console.log('[VU:' + __VU + '] status=' + res.status + ' time=' + Math.round(res.timings.duration) + 'ms');
    }
  }

  sleep(Math.random() * 0.5 + 0.3);
}

export function setup() {
  console.log('Scan record list test starting...');
  const h = http.get(BASE_URL + '/actuator/health');
  if (h.status !== 200) throw new Error('Server not healthy');
  console.log('Server OK');
  return {};
}

export function teardown() {
  console.log('Scan record test done!');
}
