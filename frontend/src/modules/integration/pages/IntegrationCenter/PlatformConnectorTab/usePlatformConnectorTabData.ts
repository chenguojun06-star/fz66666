import { useState, useEffect, useCallback, useMemo } from 'react';
import { Form } from 'antd';
import { message } from '@/utils/antdStatic';
import { usePlatformConnector } from '../usePlatformConnector';
import type { ShopStats } from '../usePlatformConnector';
import { PLATFORM_LIST, type PlatformMeta } from '../PlatformConnectorConstants';
import type {
  StatusMap, StatsMap, TestResultState, SyncResultState,
} from './types';

export function usePlatformConnectorTabData(active: boolean) {
  const { loading, testing, syncing, saveConfig, getStatus, getShopStats, testConnection, syncNow } = usePlatformConnector();

  const [statusMap, setStatusMap] = useState<StatusMap>({});
  const [shopStatsMap, setShopStatsMap] = useState<StatsMap>({});

  const [configModalOpen, setConfigModalOpen] = useState(false);
  const [testModalOpen, setTestModalOpen] = useState(false);
  const [statsModalOpen, setStatsModalOpen] = useState(false);
  const [activePlatform, setActivePlatform] = useState<PlatformMeta | null>(null);
  const [activeStats, setActiveStats] = useState<ShopStats | null>(null);

  const [testResult, setTestResult] = useState<TestResultState | null>(null);
  const [syncResult, setSyncResult] = useState<SyncResultState | null>(null);

  const [form] = Form.useForm();

  // 加载所有平台状态
  const loadAllStatus = useCallback(async () => {
    const map: StatusMap = {};
    const statsMap: StatsMap = {};
    for (const p of PLATFORM_LIST) {
      try {
        const s = await getStatus(p.code);
        map[p.code] = { configured: s.configured, status: s.status };
        if (s.configured) {
          try { statsMap[p.code] = await getShopStats(p.code); } catch { statsMap[p.code] = null; }
        }
      } catch {
        map[p.code] = { configured: false, status: 'DISCONNECTED' };
      }
    }
    setStatusMap(map);
    setShopStatsMap(statsMap);
  }, [getStatus, getShopStats]);

  useEffect(() => { if (active) { loadAllStatus(); } }, [active, loadAllStatus]);

  const stats = useMemo(() => {
    const total = PLATFORM_LIST.length;
    const connected = Object.values(statusMap).filter(s => s.configured).length;
    const todayOrders = Object.values(shopStatsMap).filter(Boolean).reduce((sum, s) => sum + (s?.todayOrders ?? 0), 0);
    const todaySales = Object.values(shopStatsMap).filter(Boolean).reduce((sum, s) => sum + (parseFloat(s?.todaySales ?? '0')), 0);
    return { total, connected, todayOrders, todaySales };
  }, [statusMap, shopStatsMap]);

  // 打开配置
  const handleConfig = useCallback((p: PlatformMeta) => {
    setActivePlatform(p);
    form.resetFields();
    form.setFieldsValue({ appKey: '', appSecret: '' });
    setTestResult(null);
    setConfigModalOpen(true);
  }, [form]);

  // 保存凭证
  const handleSave = useCallback(async () => {
    if (!activePlatform) return;
    try {
      const values = await form.validateFields();
      await saveConfig(activePlatform.code, values.appKey, values.appSecret, values.shopName, values.callbackUrl);
      message.success(`${activePlatform.name} 凭证已保存`);
      setConfigModalOpen(false);
      loadAllStatus();
    } catch (e: any) {
      if (e?.errorFields) return;
      message.error('保存失败');
    }
  }, [activePlatform, form, saveConfig, loadAllStatus]);

  // 连接测试
  const handleTest = useCallback(async () => {
    if (!activePlatform) return;
    try {
      const values = await form.validateFields();
      await saveConfig(activePlatform.code, values.appKey, values.appSecret, values.shopName, values.callbackUrl);
    } catch (e: any) {
      if (e?.errorFields) { message.warning('请先填写凭证'); return; }
    }
    const result = await testConnection(activePlatform.code);
    setTestResult(result);
    setTestModalOpen(true);
    loadAllStatus();
  }, [activePlatform, form, saveConfig, testConnection, loadAllStatus]);

  // 手动同步
  const handleSync = useCallback(async (p: PlatformMeta) => {
    setActivePlatform(p);
    setSyncResult(null);
    try {
      const r = await syncNow(p.code);
      setSyncResult(r);
      loadAllStatus();
    } catch { /* handled in hook */ }
  }, [syncNow, loadAllStatus]);

  // 查看店铺数据
  const handleViewStats = useCallback(async (p: PlatformMeta) => {
    setActivePlatform(p);
    setStatsModalOpen(true);
    try {
      const s = await getShopStats(p.code);
      setActiveStats(s);
      setShopStatsMap(prev => ({ ...prev, [p.code]: s }));
    } catch { setActiveStats(null); }
  }, [getShopStats]);

  // 卡片"连接测试"按钮：先设置平台/清空结果，再触发 handleTest
  const triggerTest = useCallback((p: PlatformMeta) => {
    setActivePlatform(p);
    setTestResult(null);
    handleTest();
  }, [handleTest]);

  return {
    // 状态
    loading, testing, syncing,
    statusMap, shopStatsMap,
    configModalOpen, testModalOpen, statsModalOpen,
    activePlatform, activeStats,
    testResult, syncResult,
    form, stats,
    // setter
    setConfigModalOpen, setTestModalOpen, setStatsModalOpen,
    setActiveStats, setTestResult, setSyncResult,
    // handlers
    handleConfig, handleSave, handleTest, handleSync, handleViewStats,
    triggerTest,
  };
}
