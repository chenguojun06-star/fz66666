/**
 * Legacy API Adapter 集成测试
 *
 * 测试实际HTTP请求场景
 *
 * @version 1.0.0
 * @date 2026-02-01
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import axios from 'axios';
import { createApiClient, requestWithPathFallback } from '../core';

type MockAxiosInstance = {
  interceptors: {
    request: { use: ReturnType<typeof vi.fn> };
    response: { use: ReturnType<typeof vi.fn> };
  };
  get: ReturnType<typeof vi.fn>;
  post: ReturnType<typeof vi.fn>;
  put: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
};

const createMockAxiosInstance = (): MockAxiosInstance => ({
  interceptors: {
    request: { use: vi.fn() },
    response: { use: vi.fn() },
  },
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  delete: vi.fn(),
});

describe('api core integration', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('requestWithPathFallback 在 GET 主路径失败时会回退到备用路径', async () => {
    const mockClient = createMockAxiosInstance();
    mockClient.get
      .mockRejectedValueOnce(new Error('primary failed'))
      .mockResolvedValueOnce({ code: 200, data: [{ id: 1 }] });

    vi.spyOn(axios, 'create').mockReturnValue(mockClient as any);

    const result = await requestWithPathFallback<{ code: number; data: Array<{ id: number }> }>(
      'get',
      '/system/role/list',
      '/auth/role/list',
      undefined,
      { params: { page: 1 } },
    );

    expect(result).toEqual({ code: 200, data: [{ id: 1 }] });
    expect(mockClient.get).toHaveBeenNthCalledWith(1, '/system/role/list', { params: { page: 1 } });
    expect(mockClient.get).toHaveBeenNthCalledWith(2, '/auth/role/list', { params: { page: 1 } });
  });

  it('requestWithPathFallback 在 POST 主路径失败时会回退到备用路径', async () => {
    const mockClient = createMockAxiosInstance();
    mockClient.post
      .mockRejectedValueOnce(new Error('primary failed'))
      .mockResolvedValueOnce({ code: 200, message: 'ok' });

    vi.spyOn(axios, 'create').mockReturnValue(mockClient as any);

    const payload = { name: 'admin' };
    const config = { params: { source: 'test' } };

    const result = await requestWithPathFallback<{ code: number; message: string }>(
      'post',
      '/system/role',
      '/auth/role',
      payload,
      config,
    );

    expect(result).toEqual({ code: 200, message: 'ok' });
    expect(mockClient.post).toHaveBeenNthCalledWith(1, '/system/role', payload, config);
    expect(mockClient.post).toHaveBeenNthCalledWith(2, '/auth/role', payload, config);
  });

  it('createApiClient 的响应拦截器在缺少 config 时不会崩溃', async () => {
    const mockClient = createMockAxiosInstance();
    vi.spyOn(axios, 'create').mockReturnValue(mockClient as any);

    createApiClient();

    const responseErrorHandler = mockClient.interceptors.response.use.mock.calls[0][1] as (error: any) => Promise<never>;

    await expect(
      responseErrorHandler({
        request: {},
        message: 'network failed',
      }),
    ).rejects.toMatchObject({
      message: '服务器无响应',
    });
  });

  it('createApiClient 的响应拦截器会保留后端错误消息', async () => {
    const mockClient = createMockAxiosInstance();
    vi.spyOn(axios, 'create').mockReturnValue(mockClient as any);

    createApiClient();

    const responseErrorHandler = mockClient.interceptors.response.use.mock.calls[0][1] as (error: any) => Promise<never>;

    await expect(
      responseErrorHandler({
        config: { method: 'post' },
        response: {
          status: 404,
          data: { message: '订单不存在' },
        },
      }),
    ).rejects.toMatchObject({
      message: '订单不存在',
    });
  });

  it('createApiClient 的响应拦截器不会对 404 的 GET 请求自动重试', async () => {
    const mockClient = createMockAxiosInstance();
    vi.spyOn(axios, 'create').mockReturnValue(mockClient as any);

    createApiClient();

    const responseErrorHandler = mockClient.interceptors.response.use.mock.calls[0][1] as (error: any) => Promise<never>;

    await expect(
      responseErrorHandler({
        config: { method: 'get', retry: 2, __retryCount: 0 },
        response: {
          status: 404,
          data: { message: '资源不存在' },
        },
      }),
    ).rejects.toMatchObject({
      message: '资源不存在',
    });

    expect(mockClient.get).not.toHaveBeenCalled();
  });

  it('createApiClient 的请求拦截器会注入请求头', async () => {
    const mockClient = createMockAxiosInstance();
    vi.spyOn(axios, 'create').mockReturnValue(mockClient as any);

    const localStorageMock = {
      getItem: vi.fn((key: string) => {
        if (key === 'authToken') return 'token-123';
        if (key === 'userId') return 'user-456';
        return null;
      }),
    };
    vi.stubGlobal('localStorage', localStorageMock);

    createApiClient();

    const requestHandler = mockClient.interceptors.request.use.mock.calls[0][0] as (config: any) => any;
    const nextConfig = requestHandler({
      headers: {},
      data: { ok: true },
    });

    expect(nextConfig.headers.Authorization).toBe('Bearer token-123');
    expect(nextConfig.headers['X-User-Id']).toBe('user-456');
    expect(typeof nextConfig.headers['X-Request-Id']).toBe('string');
    expect(String(nextConfig.headers['X-Request-Id']).length).toBeGreaterThan(0);
  });

  it('createApiClient 的请求拦截器会移除 FormData 的 Content-Type', async () => {
    const mockClient = createMockAxiosInstance();
    vi.spyOn(axios, 'create').mockReturnValue(mockClient as any);

    createApiClient();

    const requestHandler = mockClient.interceptors.request.use.mock.calls[0][0] as (config: any) => any;
    const formData = new FormData();
    const nextConfig = requestHandler({
      headers: {
        'Content-Type': 'application/json',
      },
      data: formData,
    });

    expect(nextConfig.headers['Content-Type']).toBeUndefined();
  });
});
