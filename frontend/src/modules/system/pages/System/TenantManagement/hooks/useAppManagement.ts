import { useState, useCallback, useEffect } from 'react';
import { Modal } from 'antd';
import { useAuth } from '@/utils/AuthContext';
import { useModal } from '@/hooks';
import tenantAppService from '@/services/tenantAppService';
import type { TenantAppInfo, TenantAppLogInfo } from '@/services/tenantAppService';
import { message } from '@/utils/antdStatic';
import { APP_TYPE_CONFIG } from '../constants';

export const useAppManagement = () => {
  const [apps, setApps] = useState<TenantAppInfo[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState({ total: 0, active: 0, disabled: 0, totalCalls: 0 });
  const [queryParams, setQueryParams] = useState({ page: 1, size: 20, appType: '', status: '' });
  const detailModal = useModal<TenantAppInfo>();
  const logModal = useModal<TenantAppInfo>();
  const [selectedApp, setSelectedApp] = useState<TenantAppInfo | null>(null);
  const [logs, setLogs] = useState<TenantAppLogInfo[]>([]);
  const [logsTotal, setLogsTotal] = useState(0);
  const [logsLoading, setLogsLoading] = useState(false);
  const [newSecret, setNewSecret] = useState<string | null>(null);
  const { user } = useAuth();
  const isSuperAdmin = user?.isSuperAdmin === true;

  const [editingUrlId, setEditingUrlId] = useState<string | null>(null);
  const [editingUrlField, setEditingUrlField] = useState<'callbackUrl' | 'externalApiUrl' | null>(null);
  const [editingUrlValue, setEditingUrlValue] = useState('');
  const [_savingUrl, setSavingUrl] = useState(false);

  const [detailEditCallbackUrl, setDetailEditCallbackUrl] = useState('');
  const [detailEditExternalApiUrl, setDetailEditExternalApiUrl] = useState('');
  const [savingDetailUrl, setSavingDetailUrl] = useState(false);

  const fetchApps = useCallback(async (autoActivate = false) => {
    setLoading(true);
    try {
      const res: any = await tenantAppService.listApps(queryParams);
      if (res?.code !== undefined && res.code !== 200) {
        message.error(res.message || '加载应用列表失败');
        setApps([]);
        setTotal(0);
        return;
      }
      const d = res?.data ?? res;
      const records: TenantAppInfo[] = d?.records || [];
      setApps(records);
      setTotal(d?.total || 0);

      if (autoActivate && isSuperAdmin) {
        const activated = new Set(records.map((a: TenantAppInfo) => a.appType));
        const missing = Object.entries(APP_TYPE_CONFIG).filter(([k]) => !activated.has(k));
        if (missing.length > 0) {
          await Promise.all(missing.map(([type, cfg]) =>
            tenantAppService.createApp({ appName: `${cfg.label}对接`, appType: type }).catch(() => null)
          ));
          const res2: any = await tenantAppService.listApps(queryParams);
          const d2 = res2?.data ?? res2;
          setApps(d2?.records || []);
          setTotal(d2?.total || 0);
        }
      }
    } catch {
      message.error('加载应用列表失败');
    } finally {
      setLoading(false);
    }
  }, [queryParams, isSuperAdmin]);
  const fetchStats = useCallback(async () => {
    try {
      const res: any = await tenantAppService.getStats();
      setStats(res?.data || res || { total: 0, active: 0, disabled: 0, totalCalls: 0 });
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { fetchApps(true); fetchStats(); }, [fetchApps, fetchStats]);

  const handleSaveUrl = async () => {
    if (!editingUrlId || !editingUrlField) return;
    setSavingUrl(true);
    try {
      await tenantAppService.updateApp(editingUrlId, { [editingUrlField]: editingUrlValue });
      message.success('地址已保存');
      setEditingUrlId(null);
      setEditingUrlField(null);
      fetchApps();
    } catch {
      message.error('保存失败');
    } finally {
      setSavingUrl(false);
    }
  };

  const startEditUrl = (record: TenantAppInfo, field: 'callbackUrl' | 'externalApiUrl') => {
    setEditingUrlId(record.id);
    setEditingUrlField(field);
    setEditingUrlValue((record as any)[field] || '');
  };

  const cancelEditUrl = () => {
    setEditingUrlId(null);
    setEditingUrlField(null);
    setEditingUrlValue('');
  };

  const handleToggleStatus = async (record: TenantAppInfo) => {
    try {
      await tenantAppService.toggleStatus(record.id);
      message.success(record.status === 'active' ? '已停用' : '已启用');
      fetchApps();
      fetchStats();
    } catch {
      message.error('操作失败');
    }
  };

  const handleResetSecret = async (record: TenantAppInfo) => {
    Modal.confirm({
      width: '30vw',
      title: '重置密钥',
      content: '重置后旧密钥立即失效，客户系统需要更新配置。确认重置？',
      okText: '确认重置',
      okButtonProps: { danger: true, type: 'default' },
      onOk: async () => {
        try {
          const res: any = await tenantAppService.resetSecret(record.id);
          const data = res?.data || res;
          setNewSecret(data?.appSecret || null);
          setSelectedApp(data);
          setDetailEditCallbackUrl(data?.callbackUrl || '');
          setDetailEditExternalApiUrl(data?.externalApiUrl || '');
          detailModal.open(data);
          message.success('密钥已重置');
          fetchApps();
        } catch {
          message.error('重置失败');
        }
      },
    });
  };
  const handleDelete = async (record: TenantAppInfo) => {
    Modal.confirm({
      width: '30vw',
      title: '删除应用',
      content: `确认删除应用"${record.appName}"？删除后无法恢复。`,
      okText: '确认删除',
      okButtonProps: { danger: true, type: 'default' },
      onOk: async () => {
        try {
          await tenantAppService.deleteApp(record.id);
          message.success('已删除');
          fetchApps();
          fetchStats();
        } catch {
          message.error('删除失败');
        }
      },
    });
  };

  const handleViewLogs = async (record: TenantAppInfo) => {
    setSelectedApp(record);
    logModal.open(record);
    setLogsLoading(true);
    try {
      const res: any = await tenantAppService.listLogs(record.id, { page: 1, size: 50 });
      const d = res?.data || res;
      setLogs(d?.records || []);
      setLogsTotal(d?.total || 0);
    } catch {
      message.error('加载日志失败');
    } finally {
      setLogsLoading(false);
    }
  };

  const handleViewDetail = async (record: TenantAppInfo) => {
    try {
      const res: any = await tenantAppService.getAppDetail(record.id);
      const data = res?.data || res;
      setSelectedApp(data);
      setNewSecret(null);
      setDetailEditCallbackUrl(data?.callbackUrl || '');
      setDetailEditExternalApiUrl(data?.externalApiUrl || '');
      detailModal.open(data);
    } catch {
      message.error('加载详情失败');
    }
  };

  const handleSaveDetailUrls = async () => {
    if (!selectedApp) return;
    setSavingDetailUrl(true);
    try {
      await tenantAppService.updateApp(selectedApp.id, {
        callbackUrl: detailEditCallbackUrl || undefined,
        externalApiUrl: detailEditExternalApiUrl || undefined,
      });
      message.success('配置已保存');
      setSelectedApp(prev => prev ? { ...prev, callbackUrl: detailEditCallbackUrl, externalApiUrl: detailEditExternalApiUrl } : prev);
      fetchApps();
    } catch {
      message.error('保存失败');
    } finally {
      setSavingDetailUrl(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      message.success('已复制到剪贴板');
    }).catch(() => {
      message.error('复制失败');
    });
  };

  return {
    apps, total, loading, stats, queryParams, setQueryParams,
    detailModal, logModal, selectedApp, logs, logsTotal, logsLoading, newSecret, setNewSecret,
    editingUrlId, editingUrlField, editingUrlValue, setEditingUrlValue,
    _savingUrl, detailEditCallbackUrl, setDetailEditCallbackUrl,
    detailEditExternalApiUrl, setDetailEditExternalApiUrl, savingDetailUrl,
    fetchApps, fetchStats, handleSaveUrl, startEditUrl, cancelEditUrl,
    handleToggleStatus, handleResetSecret, handleDelete, handleViewLogs,
    handleViewDetail, handleSaveDetailUrls, copyToClipboard, isSuperAdmin,
  };
};
