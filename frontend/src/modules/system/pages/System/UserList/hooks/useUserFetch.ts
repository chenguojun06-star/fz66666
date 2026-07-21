import { useEffect, useMemo, useState } from 'react';
import type { NavigateFunction } from 'react-router-dom';
import { User as UserType, UserQueryParams } from '@/types/system';
import api from '@/utils/api';
import tenantService from '@/services/tenantService';
import { useSync } from '@/utils/syncManager';
import { isSmartFeatureEnabled } from '@/smart/core/featureFlags';
import type { SmartErrorInfo } from '@/smart/core/types';
import { readPageSize } from '@/utils/pageSizeStore';

interface UseUserFetchParams {
  user: any;
  isSuperAdmin: boolean;
  userModalVisible: boolean;
  message: any;
  navigate: NavigateFunction;
}

/**
 * 用户列表数据获取与实时同步子 hook
 * 负责分页查询、列表加载、待审批数量同步
 */
export function useUserFetch({ user, isSuperAdmin, userModalVisible, message, navigate }: UseUserFetchParams) {
  const [queryParams, setQueryParams] = useState<UserQueryParams>({ page: 1, pageSize: readPageSize(20) });
  const [userList, setUserList] = useState<UserType[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [pendingUserCount, setPendingUserCount] = useState(0);

  const [smartError, setSmartError] = useState<SmartErrorInfo | null>(null);
  const showSmartErrorNotice = useMemo(() => isSmartFeatureEnabled('smart.production.precheck.enabled'), []);
  const reportSmartError = (title: string, reason?: string, code?: string) => {
    if (!showSmartErrorNotice) return;
    setSmartError({ title, reason, code });
  };

  const getUserList = async () => {
    setLoading(true);
    try {
      const tenantId = user?.tenantId ? Number(user.tenantId) : null;
      if (!isSuperAdmin && tenantId) {
        const response = await tenantService.listSubAccounts({
          page: queryParams.page, pageSize: queryParams.pageSize,
          name: queryParams.name, roleName: queryParams.roleName,
          orgUnitId: queryParams.orgUnitId || undefined,
          employmentStatus: queryParams.employmentStatus || undefined,
          roleId: queryParams.roleId || undefined,
          excludeFactoryUsers: true,
        });
        const result = response as any;
        if (result.code === 200) {
          setUserList(result.data?.records || []);
          setTotal(result.data?.total || 0);
          if (showSmartErrorNotice) setSmartError(null);
        } else {
          reportSmartError('用户列表加载失败', result.message || '服务返回异常，请稍后重试', 'SYSTEM_USER_LIST_FAILED');
          message.error(result.message || '获取用户列表失败');
        }
      } else {
        const response = await api.get<{ code: number; data: { records: any[]; total: number } }>('/system/user/list', {
          params: {
            page: queryParams.page, pageSize: queryParams.pageSize,
            username: queryParams.username, name: queryParams.name,
            roleName: queryParams.roleName, status: queryParams.status,
            employmentStatus: queryParams.employmentStatus || undefined,
            orgUnitId: queryParams.orgUnitId || undefined,
            excludeFactoryUsers: true,
          },
        });
        const result = response as any;
        if (result.code === 200) {
          setUserList(result.data.records || []);
          setTotal(result.data.total || 0);
          if (showSmartErrorNotice) setSmartError(null);
        } else {
          reportSmartError('用户列表加载失败', result.message || '服务返回异常，请稍后重试', 'SYSTEM_USER_LIST_FAILED');
          message.error(result.message || '获取用户列表失败');
        }
      }
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : '网络异常或服务不可用，请稍后重试';
      reportSmartError('用户列表加载失败', errMsg, 'SYSTEM_USER_LIST_EXCEPTION');
      message.error(error instanceof Error ? error.message : '获取用户列表失败');
    } finally {
      setLoading(false);
    }
  };

  // 用户身份变化时清空旧数据
  const currentUserId = user?.id;
  useEffect(() => { setUserList([]); setTotal(0); }, [currentUserId]);

  useEffect(() => {
    if (!currentUserId) return;
    getUserList();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryParams, currentUserId]);

  useSync(
    'user-list',
    async () => {
      try {
        const tenantId = user?.tenantId ? Number(user.tenantId) : null;
        if (!isSuperAdmin && tenantId) {
          const response = await tenantService.listSubAccounts({
            page: queryParams.page, pageSize: queryParams.pageSize,
            name: queryParams.name, roleName: queryParams.roleName,
            orgUnitId: queryParams.orgUnitId || undefined,
            employmentStatus: queryParams.employmentStatus || undefined,
            roleId: queryParams.roleId || undefined,
            excludeFactoryUsers: true,
          });
          if (response.code === 200) {
            return { records: response.data?.records || [], total: response.data?.total || 0 };
          }
          return null;
        }
        const response = await api.get<{ code: number; data: { records: any[]; total: number } }>('/system/user/list', {
          params: {
            page: queryParams.page, pageSize: queryParams.pageSize,
            username: queryParams.username, name: queryParams.name,
            roleName: queryParams.roleName, status: queryParams.status,
            employmentStatus: queryParams.employmentStatus || undefined,
            orgUnitId: queryParams.orgUnitId || undefined,
            excludeFactoryUsers: true,
          },
        });
        if (response.code === 200) {
          return { records: response.data.records || [], total: response.data.total || 0 };
        }
        return null;
      } catch (error: unknown) {
        const status = typeof error === 'object' && error !== null && 'response' in error ? (error as Record<string, any>).response?.status : (typeof error === 'object' && error !== null && 'status' in error ? (error as Record<string, any>).status : undefined);
        if (status !== 403) console.error('[实时同步] 获取用户列表失败', error);
        return null;
      }
    },
    (newData, oldData) => {
      if (oldData !== null && newData) {
        setUserList(newData.records);
        setTotal(newData.total);
      }
    },
    {
      interval: 60000,
      enabled: !loading && !userModalVisible,
      pauseOnHidden: true,
      onError: (error) => console.error('[实时同步] 用户列表同步错误', error),
    }
  );

  // 实时同步：待审批用户数量（替代手动 setInterval）
  useSync(
    'pending-user-count',
    async () => {
      try {
        const tenantId = user?.tenantId ? Number(user.tenantId) : null;
        if (!isSuperAdmin && tenantId) {
          const response = await tenantService.listPendingRegistrations({ page: 1, pageSize: 1 });
          const result = response as any;
          if (result.code === 200) {
            return { count: result.data?.total || 0 };
          }
          return { count: 0 };
        }
        const response = await api.get('/system/user/pending', { params: { page: 1, pageSize: 1 } });
        const result = response as any;
        if (result.code === 200) {
          return { count: result.data?.total || 0 };
        }
        return { count: 0 };
      } catch (error) {
        console.error('获取待审批用户数量失败', error);
        return null;
      }
    },
    (newData, oldData) => {
      if (!newData) return;
      const newCount = newData.count;
      const oldCount = oldData?.count ?? 0;
      if (newCount > oldCount && oldCount > 0) {
        message.info({
          content: `有 ${newCount - oldCount} 个新用户待审批`,
          duration: 5,
          onClick: () => { navigate('/system/user-approval'); },
        });
      }
      setPendingUserCount(newCount);
    },
    {
      interval: 30000,
      enabled: !!currentUserId && !loading && !userModalVisible,
      pauseOnHidden: true,
      onError: (error) => console.error('[实时同步] 待审批用户数同步错误', error),
    }
  );

  return {
    queryParams,
    setQueryParams,
    userList,
    setUserList,
    total,
    loading,
    pendingUserCount,
    smartError,
    showSmartErrorNotice,
    reportSmartError,
    getUserList,
  };
}
