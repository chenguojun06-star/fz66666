/**
 * k6 综合压力测试 - 混合场景高并发
 * 同时模拟订单查询 + 扫码查询 + 统计接口
 * 最大并发: 200 VU，测试时间约 5 分钟
 */

import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';

const errorRate = new Rate('errors');
const orderQueryTime = new Trend('order_query_time');
const scanQueryTime = new Trend('scan_query_time');
const totalRequests = new Counter('total_requests');

export const options = {
  stages: [
    { duration: '20s', target: 20 },   // 预热
    { duration: '40s', target: 50 },   // 低压
    { duration: '1m', target: 100 },   // 中压
    { duration: '40s', target: 150 },  // 高压
    { duration: '30s', target: 200 },  // 峰值
    { duration: '20s', target: 0 },    // 冷却
  ],
  thresholds: {
    'http_req_duration': ['p(95)<500', 'p(99)<1000'],
    'http_req_failed': ['rate<0.05'],
    'errors': ['rate<0.05'],
    'order_query_time': ['p(95)<500'],
    'scan_query_time': ['p(95)<500'],
  },
};

const BASE_URL = 'http://localhost:8088';
const TOKEN = __ENV.JWT_TOKEN;

const STATUSES = ['DRAFT', 'PENDING', 'IN_PROGRESS', 'COMPLETED'];
const PROCESSES = ['CUT', 'SEW', 'IRON', 'QC', 'PACK', 'WAREHOUSE'];

function getHeaders() {
  return { headers: { 'Authorization': 'Bearer ' + TOKEN }, timeout: '10s' };
}

export default function () {
  if (!TOKEN) throw new Error('JWT_TOKEN not set');

  // 随机选择场景：60% 订单查询，30% 扫码查询，10% 统计
  const r = Math.random();

  if (r < 0.6) {
    // 场景1：订单列表查询
    group('order_list', function() {
      const page = Math.floor(Math.random() * 20) + 1;
      let url = BASE_URL + '/api/production/order/list?page=' + page + '&size=20';
      if (Math.random() > 0.5) {
        url += '&status=' + STATUSES[Math.floor(Math.random() * STATUSES.length)];
      }

      const res = http.get(url, getHeaders());
      const ok = check(res, {
        'order status 200': (r) => r.status === 200,
        'order biz 200': (r) => { try { return JSON.parse(r.body).code === 200; } catch(e) { return false; } },
      });
      errorRate.add(!ok);
      orderQueryTime.add(res.timings.duration);
      totalRequests.add(1);
    });
  } else if (r < 0.9) {
    // 场景2：扫码记录查询
    group('scan_list', function() {
      const page = Math.floor(Math.random() * 50) + 1;
      let url = BASE_URL + '/api/production/scan/list?page=' + page + '&size=20';
      if (Math.random() > 0.6) {
        url += '&processCode=' + PROCESSES[Math.floor(Math.random() * PROCESSES.length)];
      }

      const res = http.get(url, getHeaders());
      const ok = check(res, {
        'scan status 200': (r) => r.status === 200,
        'scan biz 200': (r) => { try { return JSON.parse(r.body).code === 200; } catch(e) { return false; } },
      });
      errorRate.add(!ok);
      scanQueryTime.add(res.timings.duration);
      totalRequests.add(1);
    });
  } else {
    // 场景3：订单统计
    group('order_stats', function() {
      const res = http.get(BASE_URL + '/api/production/order/stats', getHeaders());
      const ok = check(res, {
        'stats status 200': (r) => r.status === 200,
      });
      errorRate.add(!ok);
      totalRequests.add(1);
    });
  }

  // 模拟用户思考时间
  sleep(Math.random() * 0.3 + 0.2);
}

export function setup() {
  console.log('=== Mixed Stress Test ===');
  console.log('Server: ' + BASE_URL);
  console.log('Max VUs: 200');
  const h = http.get(BASE_URL + '/actuator/health');
  if (h.status !== 200) throw new Error('Server not healthy');
  console.log('Server OK - Starting test...');
  return {};
}

export function teardown() {
  console.log('=== Mixed Stress Test Complete ===');
}
