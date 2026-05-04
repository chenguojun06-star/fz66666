import { useState, useCallback } from 'react';
import api from '@/utils/api';
import { message } from '@/utils/antdStatic';

export interface ConnectorStatus {
  platformCode: string;
  configured: boolean;
  status: string;
  shopName?: string;
  appKey?: string;
}

export interface TestResult {
  platformCode: string;
  success: boolean;
  message: string;
  shops?: Array<{ shopId: string; shopName: string; platform: string; status: string }>;
  supportedActions?: string[];
}

export interface SyncResult {
  synced: number;
  skipped: number;
  totalPages: number;
}

export interface ShopStats {
  platformCode: string;
  configured: boolean;
  totalOrders: number;
  todayOrders: number;
  todaySales: string;
  totalSales: string;
  avgOrderValue: string;
  shopCount: number;
  lastSyncTime?: string;
  pendingPick: number;
  preparing: number;
  shippedToday: number;
  pendingShip: number;
  noStockWarn: number;
}

export function usePlatformConnector() {
  const [loading, setLoading] = useState(false);
  const [testing, setTesting] = useState(false);
  const [syncing, setSyncing] = useState(false);

  /** 保存平台凭证 */
  const saveConfig = useCallback(async (platformCode: string, appKey: string, appSecret: string, shopName?: string, callbackUrl?: string) => {
    setLoading(true);
    try {
      const res = await api.post('/platform-connector/save-config', {
        platformCode, appKey, appSecret, shopName, callbackUrl,
      });
      if (res.code === 200) return res.data;
      throw new Error(res.message || '保存失败');
    } finally {
      setLoading(false);
    }
  }, []);

  /** 获取配置状态 */
  const getStatus = useCallback(async (platformCode: string): Promise<ConnectorStatus> => {
    const res = await api.get('/platform-connector/config-status', { params: { platformCode } });
    if (res.code === 200) return res.data;
    throw new Error(res.message);
  }, []);

  /** 获取店铺数据统计 */
  const getShopStats = useCallback(async (platformCode: string): Promise<ShopStats> => {
    const res = await api.get('/platform-connector/shop-stats', { params: { platformCode } });
    if (res.code === 200) return res.data;
    throw new Error(res.message);
  }, []);

  /** 连接测试 */
  const testConnection = useCallback(async (platformCode: string): Promise<TestResult> => {
    setTesting(true);
    try {
      const res = await api.post('/platform-connector/test-connection', { platformCode });
      if (res.code === 200) return res.data;
      throw new Error(res.message || '测试失败');
    } finally {
      setTesting(false);
    }
  }, []);

  /** 手动同步 */
  const syncNow = useCallback(async (platformCode: string): Promise<SyncResult> => {
    setSyncing(true);
    try {
      const res = await api.post('/platform-connector/sync-now', { platformCode });
      if (res.code === 200) {
        message.success('同步完成');
        return res.data;
      }
      throw new Error(res.message || '同步失败');
    } finally {
      setSyncing(false);
    }
  }, []);

  return { loading, testing, syncing, saveConfig, getStatus, getShopStats, testConnection, syncNow };
}
