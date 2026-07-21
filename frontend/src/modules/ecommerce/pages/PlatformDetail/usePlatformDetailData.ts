import { useState, useEffect, useCallback, useRef } from 'react';
import { Form } from 'antd';
import { usePlatformConnector, type ShopStats } from '../../../integration/pages/IntegrationCenter/usePlatformConnector';
import api, { type ApiResult } from '@/utils/api';
import { message } from '@/utils/antdStatic';
import { readPageSize } from '@/utils/pageSizeStore';
import { useDebouncedValue } from '@/hooks/usePerformance';
import type { EcOrder } from './types';

export interface UsePlatformDetailDataReturn {
  loading: boolean;
  testing: boolean;
  syncing: boolean;
  stats: ShopStats | null;
  configured: boolean;
  activeTab: string;
  showGuide: boolean;
  orders: EcOrder[];
  orderTotal: number;
  orderLoading: boolean;
  orderPage: number;
  orderPageSize: number;
  filterStatus: number | undefined;
  keyword: string;
  expressOrderTarget: EcOrder | null;
  expressModalOpen: boolean;
  configForm: ReturnType<typeof Form.useForm>[0];
  testResult: { success: boolean; message: string } | null;
  setActiveTab: React.Dispatch<React.SetStateAction<string>>;
  setShowGuide: React.Dispatch<React.SetStateAction<boolean>>;
  setFilterStatus: React.Dispatch<React.SetStateAction<number | undefined>>;
  setKeyword: React.Dispatch<React.SetStateAction<string>>;
  setOrderPage: React.Dispatch<React.SetStateAction<number>>;
  setOrderPageSize: React.Dispatch<React.SetStateAction<number>>;
  setDetail: React.Dispatch<React.SetStateAction<EcOrder | null>>;
  setLinkTarget: React.Dispatch<React.SetStateAction<EcOrder | null>>;
  setOutboundTarget: React.Dispatch<React.SetStateAction<EcOrder | null>>;
  setExpressOrderTarget: React.Dispatch<React.SetStateAction<EcOrder | null>>;
  setExpressModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
  loadOrders: () => Promise<void>;
  handleSaveConfig: () => Promise<void>;
  handleTestConnection: () => Promise<void>;
  handleSync: () => Promise<void>;
}

export function usePlatformDetailData(platformCode: string | undefined): UsePlatformDetailDataReturn {
  const { loading, testing, syncing, saveConfig, getStatus, getShopStats, testConnection, syncNow } = usePlatformConnector();

  const [stats, setStats] = useState<ShopStats | null>(null);
  const [configured, setConfigured] = useState(false);
  const [activeTab, setActiveTab] = useState<string>('config');
  const [showGuide, setShowGuide] = useState(false);

  const [orders, setOrders] = useState<EcOrder[]>([]);
  const [orderTotal, setOrderTotal] = useState(0);
  const [orderLoading, setOrderLoading] = useState(false);
  const [orderPage, setOrderPage] = useState(1);
  const [orderPageSize, setOrderPageSize] = useState(readPageSize(20));
  const [filterStatus, setFilterStatus] = useState<number | undefined>();
  const [keyword, setKeyword] = useState('');
  const debouncedKeyword = useDebouncedValue(keyword, 300);
  const prevDebouncedKeywordRef = useRef(debouncedKeyword);
  if (debouncedKeyword !== prevDebouncedKeywordRef.current) {
    prevDebouncedKeywordRef.current = debouncedKeyword;
    setOrderPage(1);
  }
  const [_detail, setDetail] = useState<EcOrder | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [linkTarget, setLinkTarget] = useState<EcOrder | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [outboundTarget, setOutboundTarget] = useState<EcOrder | null>(null);
  const [expressOrderTarget, setExpressOrderTarget] = useState<EcOrder | null>(null);
  const [expressModalOpen, setExpressModalOpen] = useState(false);

  const [configForm] = Form.useForm();
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  const loadPlatformData = useCallback(async () => {
    if (!platformCode) return;
    try {
      const s = await getStatus(platformCode);
      setConfigured(s.configured);
      if (s.configured) {
        const st = await getShopStats(platformCode);
        setStats(st);
      }
    } catch {
      setConfigured(false);
    }
  }, [platformCode, getStatus, getShopStats]);

  const loadOrders = useCallback(async () => {
    if (!platformCode || !configured) return;
    setOrderLoading(true);
    try {
      const params: Record<string, unknown> = { page: orderPage, pageSize: orderPageSize, platform: platformCode };
      if (filterStatus !== undefined) params.status = filterStatus;
      if (debouncedKeyword) params.keyword = debouncedKeyword;
      const res = await api.post<ApiResult>('/ecommerce/orders/list', params);
      const d = (res?.data ?? {}) as Record<string, unknown>;
      setOrders((d.records as EcOrder[]) ?? []);
      setOrderTotal((d.total as number) ?? 0);
    } catch (err: unknown) { message.error(err instanceof Error ? err.message : '加载失败'); }
    finally { setOrderLoading(false); }
  }, [platformCode, configured, orderPage, orderPageSize, filterStatus, debouncedKeyword]);

  useEffect(() => { loadPlatformData(); }, [loadPlatformData]);
  useEffect(() => { if (configured) loadOrders(); }, [loadOrders, configured]);
  useEffect(() => { setActiveTab(configured ? 'orders' : 'config'); }, [configured]);

  const handleSaveConfig = async () => {
    if (!platformCode) return;
    try {
      const values = await configForm.validateFields();
      await saveConfig(platformCode, values.appKey, values.appSecret, values.shopName, values.callbackUrl);
      message.success('凭证已保存');
      loadPlatformData();
    } catch (e: any) {
      if (e?.errorFields) return;
      message.error('保存失败');
    }
  };

  const handleTestConnection = async () => {
    if (!platformCode) return;
    try {
      const values = await configForm.validateFields();
      await saveConfig(platformCode, values.appKey, values.appSecret, values.shopName, values.callbackUrl);
    } catch (e: any) {
      if (e?.errorFields) { message.warning('请先填写凭证'); return; }
    }
    const result = await testConnection(platformCode);
    setTestResult({ success: result.success, message: result.message });
    loadPlatformData();
  };

  const handleSync = async () => {
    if (!platformCode) return;
    try {
      await syncNow(platformCode);
      loadPlatformData();
      loadOrders();
    } catch { /* handled in hook */ }
  };

  return {
    loading, testing, syncing,
    stats, configured, activeTab, showGuide,
    orders, orderTotal, orderLoading, orderPage, orderPageSize,
    filterStatus, keyword,
    expressOrderTarget, expressModalOpen,
    configForm, testResult,
    setActiveTab, setShowGuide, setFilterStatus, setKeyword,
    setOrderPage, setOrderPageSize,
    setDetail, setLinkTarget, setOutboundTarget,
    setExpressOrderTarget, setExpressModalOpen,
    loadOrders,
    handleSaveConfig, handleTestConnection, handleSync,
  };
}
