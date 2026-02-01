/**
 * Legacy API Adapter 测试套件
 *
 * 测试41个废弃端点的自动适配功能
 *
 * @version 1.0.0
 * @date 2026-02-01
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import axios, { AxiosRequestConfig } from 'axios';
import { setupLegacyApiAdapter, getDeprecatedEndpoints, isDeprecatedEndpoint } from '../legacyApiAdapter';

describe('Legacy API Adapter', () => {
  let mockAxios: any;

  beforeEach(() => {
    // 创建模拟的 axios 实例
    mockAxios = {
      interceptors: {
        request: {
          use: vi.fn((successHandler) => {
            mockAxios._requestInterceptor = successHandler;
          })
        }
      }
    };

    // 模拟 console.warn
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'info').mockImplementation(() => {});
  });

  describe('setupLegacyApiAdapter', () => {
    it('应该注册请求拦截器', () => {
      setupLegacyApiAdapter(mockAxios);

      expect(mockAxios.interceptors.request.use).toHaveBeenCalledTimes(1);
      expect(console.info).toHaveBeenCalledWith(
        expect.stringContaining('Legacy API Adapter')
      );
    });
  });

  describe('getDeprecatedEndpoints', () => {
    it('应该返回所有41个废弃端点', () => {
      const endpoints = getDeprecatedEndpoints();

      expect(endpoints.length).toBe(41);
      expect(endpoints).toContain('/api/production/order/by-order-no/:orderNo');
      expect(endpoints).toContain('POST /api/style/info/:id/pattern/start');
    });
  });

  describe('isDeprecatedEndpoint', () => {
    it('应该识别废弃的GET端点', () => {
      expect(isDeprecatedEndpoint('GET', '/api/production/order/by-order-no/PO123')).toBe(true);
      expect(isDeprecatedEndpoint('GET', '/api/production/order/list')).toBe(false);
    });

    it('应该识别废弃的POST端点', () => {
      expect(isDeprecatedEndpoint('POST', '/api/production/order/save')).toBe(true);
      expect(isDeprecatedEndpoint('POST', '/api/production/order/')).toBe(false);
    });
  });

  describe('Phase 1: ProductionOrderController', () => {
    beforeEach(() => {
      setupLegacyApiAdapter(mockAxios);
    });

    it('应该转换 /by-order-no/:orderNo → /list?orderNo=xxx', () => {
      const config: AxiosRequestConfig = {
        method: 'get',
        url: '/api/production/order/by-order-no/PO20260122001',
        params: {}
      };

      const result = mockAxios._requestInterceptor(config);

      expect(result.url).toBe('/api/production/order/list');
      expect(result.params.orderNo).toBe('PO20260122001');
      expect(console.warn).toHaveBeenCalledWith(
        expect.stringContaining('/by-order-no/PO20260122001')
      );
    });

    it('应该转换 /detail-dto/:id → /:id', () => {
      const config: AxiosRequestConfig = {
        method: 'get',
        url: '/api/production/order/detail-dto/123',
      };

      const result = mockAxios._requestInterceptor(config);

      expect(result.url).toBe('/api/production/order/123');
      expect(console.warn).toHaveBeenCalledWith(
        expect.stringContaining('/detail-dto/123')
      );
    });

    it('应该转换 POST /save → POST / (新建)', () => {
      const config: AxiosRequestConfig = {
        method: 'post',
        url: '/api/production/order/save',
        data: { orderNo: 'PO123' }
      };

      const result = mockAxios._requestInterceptor(config);

      expect(result.method).toBe('post');
      expect(result.url).toBe('/api/production/order/');
      expect(console.warn).toHaveBeenCalledWith(
        expect.stringContaining('POST /save')
      );
    });

    it('应该转换 POST /save → PUT / (更新)', () => {
      const config: AxiosRequestConfig = {
        method: 'post',
        url: '/api/production/order/save',
        data: { id: 123, orderNo: 'PO123' }
      };

      const result = mockAxios._requestInterceptor(config);

      expect(result.method).toBe('put');
      expect(result.url).toBe('/api/production/order/');
      expect(console.warn).toHaveBeenCalledWith(
        expect.stringContaining('POST /save')
      );
    });

    it('应该转换 /delete/:id → DELETE /:id', () => {
      const config: AxiosRequestConfig = {
        method: 'get',
        url: '/api/production/order/delete/123',
      };

      const result = mockAxios._requestInterceptor(config);

      expect(result.method).toBe('delete');
      expect(result.url).toBe('/api/production/order/123');
      expect(console.warn).toHaveBeenCalledWith(
        expect.stringContaining('GET /delete/123')
      );
    });
  });

  describe('Phase 1: ScanRecordController', () => {
    beforeEach(() => {
      setupLegacyApiAdapter(mockAxios);
    });

    it('应该转换 /query-by-xxx → /list?xxx', () => {
      const testCases = [
        {
          old: '/api/production/scan-record/query-by-order-no?orderNo=PO123',
          expectedParams: { orderNo: 'PO123' }
        },
        {
          old: '/api/production/scan-record/query-by-bundle-no?bundleNo=B001',
          expectedParams: { bundleNo: 'B001' }
        },
        {
          old: '/api/production/scan-record/query-by-worker?workerId=W001',
          expectedParams: { workerId: 'W001' }
        }
      ];

      testCases.forEach(({ old, expectedParams }) => {
        const config: AxiosRequestConfig = {
          method: 'get',
          url: old,
        };

        const result = mockAxios._requestInterceptor(config);

        expect(result.url).toContain('/list');
        Object.entries(expectedParams).forEach(([key, value]) => {
          expect(result.params[key]).toBe(value);
        });
      });
    });
  });

  describe('Phase 3: StyleInfoController 状态机', () => {
    beforeEach(() => {
      setupLegacyApiAdapter(mockAxios);
    });

    it('应该转换 /:id/pattern/start → /:id/stage-action?stage=pattern&action=start', () => {
      const config: AxiosRequestConfig = {
        method: 'post',
        url: '/api/style/info/123/pattern/start',
      };

      const result = mockAxios._requestInterceptor(config);

      expect(result.url).toBe('/api/style/info/123/stage-action');
      expect(result.params.stage).toBe('pattern');
      expect(result.params.action).toBe('start');
      expect(console.warn).toHaveBeenCalledWith(
        expect.stringContaining('/pattern/start')
      );
    });

    it('应该转换所有14个StyleInfo状态转换端点', () => {
      const testCases = [
        { path: '/123/pattern/start', stage: 'pattern', action: 'start' },
        { path: '/123/pattern/complete', stage: 'pattern', action: 'complete' },
        { path: '/123/pattern/reset', stage: 'pattern', action: 'reset' },
        { path: '/123/sample/start', stage: 'sample', action: 'start' },
        { path: '/123/sample/progress', stage: 'sample', action: 'progress' },
        { path: '/123/sample/complete', stage: 'sample', action: 'complete' },
        { path: '/123/sample/reset', stage: 'sample', action: 'reset' },
        { path: '/123/bom/start', stage: 'bom', action: 'start' },
        { path: '/123/bom/complete', stage: 'bom', action: 'complete' },
        { path: '/123/process/start', stage: 'process', action: 'start' },
        { path: '/123/process/complete', stage: 'process', action: 'complete' },
        { path: '/123/secondary/start', stage: 'secondary', action: 'start' },
        { path: '/123/secondary/complete', stage: 'secondary', action: 'complete' },
        { path: '/123/secondary/skip', stage: 'secondary', action: 'skip' },
      ];

      testCases.forEach(({ path, stage, action }) => {
        const config: AxiosRequestConfig = {
          method: 'post',
          url: `/api/style/info${path}`,
        };

        const result = mockAxios._requestInterceptor(config);

        expect(result.url).toBe('/api/style/info/123/stage-action');
        expect(result.params.stage).toBe(stage);
        expect(result.params.action).toBe(action);
      });
    });
  });

  describe('Phase 3: UserController 审批流程', () => {
    beforeEach(() => {
      setupLegacyApiAdapter(mockAxios);
    });

    it('应该转换 /:id/approve → /:id/approval-action?action=approve', () => {
      const config: AxiosRequestConfig = {
        method: 'post',
        url: '/api/user/123/approve',
        data: { reason: '同意' }
      };

      const result = mockAxios._requestInterceptor(config);

      expect(result.url).toBe('/api/user/123/approval-action');
      expect(result.params.action).toBe('approve');
      expect(result.data.reason).toBe('同意');
    });

    it('应该转换 /:id/reject → /:id/approval-action?action=reject', () => {
      const config: AxiosRequestConfig = {
        method: 'post',
        url: '/api/user/123/reject',
        data: { reason: '拒绝' }
      };

      const result = mockAxios._requestInterceptor(config);

      expect(result.url).toBe('/api/user/123/approval-action');
      expect(result.params.action).toBe('reject');
      expect(result.data.reason).toBe('拒绝');
    });
  });

  describe('Phase 4: StyleBomController', () => {
    beforeEach(() => {
      setupLegacyApiAdapter(mockAxios);
    });

    it('应该转换 /sync-material-database/async → /sync-material-database?async=true', () => {
      const config: AxiosRequestConfig = {
        method: 'post',
        url: '/api/style/bom/sync-material-database/async',
      };

      const result = mockAxios._requestInterceptor(config);

      expect(result.url).toBe('/api/style/bom/sync-material-database');
      expect(result.params.async).toBe(true);
      expect(console.warn).toHaveBeenCalledWith(
        expect.stringContaining('/async')
      );
    });
  });

  describe('Phase 4: PatternRevisionController 工作流', () => {
    beforeEach(() => {
      setupLegacyApiAdapter(mockAxios);
    });

    it('应该转换工作流端点到统一action参数', () => {
      const testCases = [
        { old: '/123/submit', action: 'submit' },
        { old: '/123/approve', action: 'approve' },
        { old: '/123/reject', action: 'reject' },
        { old: '/123/complete', action: 'complete' },
      ];

      testCases.forEach(({ old, action }) => {
        const config: AxiosRequestConfig = {
          method: 'post',
          url: `/api/pattern/revision${old}`,
        };

        const result = mockAxios._requestInterceptor(config);

        expect(result.url).toBe('/api/pattern/revision/123/workflow');
        expect(result.params.action).toBe(action);
      });
    });
  });

  describe('Phase 4: MaterialReconciliationController', () => {
    beforeEach(() => {
      setupLegacyApiAdapter(mockAxios);
    });

    it('应该转换 /update-status → /:id/status-action?action=update', () => {
      const config: AxiosRequestConfig = {
        method: 'post',
        url: '/api/finance/material-reconciliation/update-status',
        data: { id: '123', status: 'APPROVED' }
      };

      const result = mockAxios._requestInterceptor(config);

      expect(result.url).toBe('/api/finance/material-reconciliation/123/status-action');
      expect(result.params.action).toBe('update');
      expect(result.params.status).toBe('APPROVED');
    });

    it('应该转换 /return → /:id/status-action?action=return', () => {
      const config: AxiosRequestConfig = {
        method: 'post',
        url: '/api/finance/material-reconciliation/return',
        data: { id: '123', reason: '信息有误' }
      };

      const result = mockAxios._requestInterceptor(config);

      expect(result.url).toBe('/api/finance/material-reconciliation/123/status-action');
      expect(result.params.action).toBe('return');
      expect(result.params.reason).toBe('信息有误');
    });
  });

  describe('非废弃端点', () => {
    beforeEach(() => {
      setupLegacyApiAdapter(mockAxios);
    });

    it('应该保持新端点不变', () => {
      const newEndpoints = [
        { method: 'get', url: '/api/production/order/list?orderNo=PO123' },
        { method: 'post', url: '/api/production/order/' },
        { method: 'put', url: '/api/production/order/123' },
        { method: 'delete', url: '/api/production/order/123' },
        { method: 'post', url: '/api/style/info/123/stage-action' },
      ];

      newEndpoints.forEach(config => {
        const result = mockAxios._requestInterceptor(config);

        expect(result.url).toBe(config.url);
        expect(result.method).toBe(config.method);
        expect(console.warn).not.toHaveBeenCalled();

        // 清除 mock 计数
        vi.clearAllMocks();
      });
    });
  });

  describe('边界情况', () => {
    beforeEach(() => {
      setupLegacyApiAdapter(mockAxios);
    });

    it('应该处理缺少URL的config', () => {
      const config: AxiosRequestConfig = {
        method: 'get',
      };

      const result = mockAxios._requestInterceptor(config);

      expect(result).toBe(config);
    });

    it('应该处理空URL的config', () => {
      const config: AxiosRequestConfig = {
        method: 'get',
        url: '',
      };

      const result = mockAxios._requestInterceptor(config);

      expect(result).toBe(config);
    });

    it('应该保留原有params', () => {
      const config: AxiosRequestConfig = {
        method: 'get',
        url: '/api/production/order/by-order-no/PO123',
        params: { existingParam: 'value' }
      };

      const result = mockAxios._requestInterceptor(config);

      expect(result.params.existingParam).toBe('value');
      expect(result.params.orderNo).toBe('PO123');
    });
  });
});
