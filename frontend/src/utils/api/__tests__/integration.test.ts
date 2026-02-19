/**
 * Legacy API Adapter 集成测试
 *
 * 测试实际HTTP请求场景
 *
 * @version 1.0.0
 * @date 2026-02-01
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import axios from 'axios';
import { createApiClient } from '../core';

describe('Legacy API Adapter Integration', () => {
  let apiClient: any;
  let mockServer: any;

  beforeAll(() => {
    // 创建测试用API客户端（已自动启用适配器）
    apiClient = createApiClient();

    // Mock axios 适配器
    mockServer = {
      '/api/production/order/list': vi.fn(() => ({ code: 200, data: [] })),
      '/api/production/order/123': vi.fn(() => ({ code: 200, data: { id: 123 } })),
      '/api/style/info/123/stage-action': vi.fn(() => ({ code: 200, message: '操作成功' })),
    };

    // 模拟响应
    vi.spyOn(axios, 'create').mockReturnValue({
      ...apiClient,
      interceptors: {
        request: apiClient.interceptors.request,
        response: apiClient.interceptors.response,
      },
      get: vi.fn((url) => {
        const handler = Object.entries(mockServer).find(([path]) =>
          url.includes(path)
        )?.[1];
        return Promise.resolve({ data: (handler as any)?.() || { code: 200, data: null } });
      }),
      post: vi.fn((url) => {
        const handler = Object.entries(mockServer).find(([path]) =>
          url.includes(path)
        )?.[1];
        return Promise.resolve({ data: (handler as any)?.() || { code: 200, message: 'success' } });
      }),
    } as any);
  });

  describe('生产订单查询场景', () => {
    it('应该能通过旧端点查询订单', async () => {
      const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => { });

      // 使用废弃端点
      await apiClient.get('/production/order/by-order-no/PO20260122001');

      // 验证警告
      expect(consoleWarn).toHaveBeenCalledWith(
        expect.stringContaining('/by-order-no/PO20260122001')
      );

      // 验证请求被正确重定向
      expect(mockServer['/api/production/order/list']).toHaveBeenCalled();

      consoleWarn.mockRestore();
    });

    it('应该能通过新端点查询订单（无警告）', async () => {
      const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => { });

      // 使用新端点
      await apiClient.get('/production/order/list', {
        params: { orderNo: 'PO20260122001' }
      });

      // 验证无警告
      expect(consoleWarn).not.toHaveBeenCalled();

      consoleWarn.mockRestore();
    });
  });

  describe('款式状态机场景', () => {
    it('应该能通过旧端点启动纸样阶段', async () => {
      const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => { });

      // 使用废弃端点
      await apiClient.post('/style/info/123/pattern/start');

      // 验证警告
      expect(consoleWarn).toHaveBeenCalledWith(
        expect.stringContaining('/pattern/start')
      );

      // 验证请求被正确重定向到状态机端点
      expect(mockServer['/api/style/info/123/stage-action']).toHaveBeenCalled();

      consoleWarn.mockRestore();
    });

    it('应该能通过新端点启动纸样阶段（无警告）', async () => {
      const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => { });

      // 使用新端点
      await apiClient.post('/style/info/123/stage-action', null, {
        params: { stage: 'pattern', action: 'start' }
      });

      // 验证无警告
      expect(consoleWarn).not.toHaveBeenCalled();

      consoleWarn.mockRestore();
    });
  });

  describe('混合使用场景', () => {
    it('应该能混合使用新旧端点', async () => {
      const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => { });

      // 1. 使用废弃端点查询订单（应该警告）
      await apiClient.get('/production/order/by-order-no/PO123');
      expect(consoleWarn).toHaveBeenCalledTimes(1);

      // 2. 使用新端点查询订单（不应该警告）
      await apiClient.get('/production/order/list', { params: { orderNo: 'PO456' } });
      expect(consoleWarn).toHaveBeenCalledTimes(1); // 还是1次

      // 3. 再次使用废弃端点（应该警告）
      await apiClient.post('/style/info/123/pattern/start');
      expect(consoleWarn).toHaveBeenCalledTimes(2);

      consoleWarn.mockRestore();
    });
  });

  describe('错误处理', () => {
    it('应该正确处理废弃端点的错误响应', async () => {
      const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => { });

      // Mock 错误响应
      vi.spyOn(apiClient, 'get').mockRejectedValueOnce({
        response: {
          status: 404,
          data: { code: 404, message: '订单不存在' }
        }
      });

      try {
        await apiClient.get('/production/order/by-order-no/INVALID');
        expect.fail('应该抛出错误');
      } catch (error: any) {
        expect(error.response.status).toBe(404);
      }

      // 仍然应该有警告
      expect(consoleWarn).toHaveBeenCalled();

      consoleWarn.mockRestore();
    });
  });

  afterAll(() => {
    vi.restoreAllMocks();
  });
});
