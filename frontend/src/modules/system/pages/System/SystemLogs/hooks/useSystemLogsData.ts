import { useState, useEffect, useCallback } from 'react';
import api from '@/utils/api';
import { message } from '@/utils/antdStatic';
import { LoginLog, LoginLogQueryParams } from '@/types/system';
import { OperationLog, OperationLogQueryParams } from '@/types/operation-log';
import { DEFAULT_PAGE_SIZE, readPageSizeByKey } from '@/utils/pageSizeStore';
import { usePersistentState } from '@/hooks/usePersistentState';

/** 系统日志页面数据 Hook：负责登录日志与操作日志的 state、查询、分页初始化 */
export const useSystemLogsData = () => {
  const [activeTab, setActiveTab] = usePersistentState<'login' | 'operation'>('system-logs-active-tab', 'login');

  // ==================== 登录日志 ====================
  const [loginQueryParams, setLoginQueryParams] = useState<LoginLogQueryParams>(() => {
    let page = 1;
    let pageSize = readPageSizeByKey('system-loginlog-pagination:size', DEFAULT_PAGE_SIZE);
    try {
      const raw = typeof window !== 'undefined' ? localStorage.getItem('system-loginlog-pagination') : null;
      if (raw) {
        const obj = JSON.parse(raw || '{}');
        if (Number.isFinite(Number(obj?.page))) page = Number(obj.page);
      }
    } catch { /* localStorage 不可用或JSON损坏，忽略 */ }
    return { page, pageSize } as LoginLogQueryParams;
  });
  const [loginLogs, setLoginLogs] = useState<LoginLog[]>([]);
  const [loginTotal, setLoginTotal] = useState(0);
  const [loginLoading, setLoginLoading] = useState(false);

  const fetchLoginLogs = useCallback(async () => {
    setLoginLoading(true);
    try {
      const response = await api.get<{ code: number; data: { records: LoginLog[]; total: number } }>(
        '/system/login-log/list',
        { params: loginQueryParams }
      );
      if (response.code === 200) {
        setLoginLogs(response.data.records || []);
        setLoginTotal(response.data.total || 0);
      }
    } catch (error) {
      message.error('获取登录日志失败');
    } finally {
      setLoginLoading(false);
    }
  }, [loginQueryParams]);

  useEffect(() => {
    if (activeTab === 'login') {
      fetchLoginLogs();
    }
  }, [activeTab, fetchLoginLogs]);

  // ==================== 操作日志 ====================
  const [operationQueryParams, setOperationQueryParams] = useState<OperationLogQueryParams>(() => {
    let page = 1;
    let pageSize = readPageSizeByKey('system-operationlog-pagination:size', DEFAULT_PAGE_SIZE);
    try {
      const raw = typeof window !== 'undefined' ? localStorage.getItem('system-operationlog-pagination') : null;
      if (raw) {
        const obj = JSON.parse(raw || '{}');
        if (Number.isFinite(Number(obj?.page))) page = Number(obj.page);
      }
    } catch { /* localStorage 不可用或JSON损坏，忽略 */ }
    return { page, pageSize } as OperationLogQueryParams;
  });
  const [operationLogs, setOperationLogs] = useState<OperationLog[]>([]);
  const [operationTotal, setOperationTotal] = useState(0);
  const [operationLoading, setOperationLoading] = useState(false);

  const fetchOperationLogs = useCallback(async () => {
    setOperationLoading(true);
    try {
      const response = await api.get<{ code: number; data: { records: OperationLog[]; total: number } }>(
        '/system/operation-log/list',
        { params: operationQueryParams }
      );
      if (response.code === 200) {
        setOperationLogs(response.data.records || []);
        setOperationTotal(response.data.total || 0);
      }
    } catch (error) {
      message.error('获取操作日志失败');
    } finally {
      setOperationLoading(false);
    }
  }, [operationQueryParams]);

  useEffect(() => {
    if (activeTab === 'operation') {
      fetchOperationLogs();
    }
  }, [activeTab, fetchOperationLogs]);

  return {
    activeTab,
    setActiveTab,
    // 登录日志
    loginQueryParams,
    setLoginQueryParams,
    loginLogs,
    loginTotal,
    loginLoading,
    fetchLoginLogs,
    // 操作日志
    operationQueryParams,
    setOperationQueryParams,
    operationLogs,
    operationTotal,
    operationLoading,
    fetchOperationLogs,
  };
};
