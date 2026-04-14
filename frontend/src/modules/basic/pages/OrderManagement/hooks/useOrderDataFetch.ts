import { useEffect, useState } from 'react';
import { useSync } from '@/utils/syncManager';
import api from '@/utils/api';
import type { StyleInfo, StyleQueryParams } from '@/types/style';
import type { Factory } from '@/types/system';
import { productionOrderApi, FactoryCapacityItem } from '@/services/production/productionApi';
import { organizationApi } from '@/services/system/organizationApi';
import type { SmartErrorInfo } from '@/smart/core/types';

interface UseOrderDataFetchParams {
  queryParams: StyleQueryParams;
  visible: boolean;
  showSmartErrorNotice: boolean;
  message: { error: (msg: string) => void };
}

export function useOrderDataFetch({ queryParams, visible, showSmartErrorNotice, message }: UseOrderDataFetchParams) {
  const [styles, setStyles] = useState<StyleInfo[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);

  const [factories, setFactories] = useState<Factory[]>([]);
  const [factoryCapacities, setFactoryCapacities] = useState<FactoryCapacityItem[]>([]);
  const [departments, setDepartments] = useState<Array<{ id: string; nodeName: string; nodeType: string; pathNames: string }>>([]);
  const [users, setUsers] = useState<Array<{ id: number; name: string; username: string }>>([]);
  const [smartError, setSmartError] = useState<SmartErrorInfo | null>(null);

  const reportSmartError = (title: string, reason?: string, code?: string) => {
    if (!showSmartErrorNotice) return;
    setSmartError({ title, reason, code });
  };

  const fetchStyles = async () => {
    setLoading(true);
    try {
      const response = await api.get<{ code: number; message: string; data: { records: StyleInfo[]; total: number } }>('/style/info/list', { params: queryParams });
      if (response.code === 200) {
        setStyles(response.data.records || []);
        setTotal(response.data.total || 0);
        if (showSmartErrorNotice) setSmartError(null);
      } else {
        reportSmartError('款号列表加载失败', response.message || '服务返回异常，请稍后重试', 'ORDER_STYLE_LIST_FAILED');
        message.error(response.message || '获取款号列表失败');
      }
    } catch (error: unknown) {
      reportSmartError('款号列表加载失败', error instanceof Error ? error.message : '网络异常或服务不可用，请稍后重试', 'ORDER_STYLE_LIST_EXCEPTION');
      message.error(error instanceof Error ? error.message : '获取款号列表失败');
    } finally {
      setLoading(false);
    }
  };

  const fetchFactories = async () => {
    try {
      const response = await api.get<{ code: number; data: { records: Factory[] } }>('/system/factory/list', { params: { page: 1, pageSize: 1000 } });
      if (response.code === 200) {
        setFactories(response.data.records || []);
      }
    } catch {
      setFactories([]);
    }
  };

  const fetchDepartments = async () => {
    try {
      const res = await api.get<{ code: number; data: Array<{ id: string; nodeName: string; nodeType: string; pathNames: string }> }>('/system/organization/production-groups');
      if (res.code === 200) {
        setDepartments(res.data || []);
      }
    } catch {
      setDepartments([]);
    }
  };

  const fetchUsers = async () => {
    try {
      const orgUsers = await organizationApi.assignableUsers();
      if (orgUsers.length > 0) {
        const mapped = orgUsers
          .filter(u => u.name || u.username)
          .map(u => ({ id: Number(u.id) || 0, name: u.name || u.username, username: u.username }));
        const seen = new Set<string>();
        setUsers(mapped.filter(u => {
          if (seen.has(u.name)) return false;
          seen.add(u.name);
          return true;
        }));
        return;
      }
    } catch { /* 组织成员加载失败，回退到用户列表 */ }
    try {
      const response = await api.get<{ code: number; data: { records: Array<{ id: number; name: string; username: string }> } }>('/system/user/list', { params: { page: 1, pageSize: 1000, status: 'active' } });
      if (response.code === 200) {
        setUsers(response.data.records || []);
      }
    } catch {
      setUsers([]);
    }
  };

  // 查询参数变化时重新获取款式列表
  useEffect(() => {
    fetchStyles();
  }, [queryParams]);

  // 实时同步：60秒自动轮询更新款式列表
  useSync(
    'order-management-styles',
    async () => {
      try {
        const response = await api.get<{ code: number; data: { records: StyleInfo[]; total: number } }>('/style/info/list', { params: queryParams });
        if (response.code === 200) {
          return {
            records: response.data.records || [],
            total: response.data.total || 0
          };
        }
        return null;
      } catch (error) {
        console.error('[实时同步] 获取款式列表失败', error);
        return null;
      }
    },
    (newData, oldData) => {
      if (oldData !== null && newData) {
        setStyles(newData.records);
        setTotal(newData.total);
      }
    },
    {
      interval: 60000,
      enabled: !loading && !visible,
      pauseOnHidden: true,
      onError: (error) => console.error('[实时同步] 订单管理款式同步错误', error)
    }
  );

  // 初始化加载工厂、用户、部门及产能数据
  useEffect(() => {
    fetchFactories();
    fetchUsers();
    void fetchDepartments();
    productionOrderApi.getFactoryCapacity().then(res => {
      if (res?.data) setFactoryCapacities(res.data);
    }).catch(() => {/* 静默失败，不影响主流程 */});
  }, []);

  return {
    styles, total, loading, factories, factoryCapacities, departments, users,
    smartError, setSmartError, reportSmartError, fetchStyles,
  };
}
