import { useCallback } from 'react';
import api from '@/utils/api';

/**
 * 用户偏好 Hook
 * 持久化用户级表格列显隐/列顺序/分页大小等显示偏好
 * 替代散落的 localStorage（与后端 t_user_preference 对齐）
 */

export type UserPreferenceItem = {
  id?: number;
  bizType: string;
  pageKey: string;
  preferenceType: string;
  preferenceValue: string;
};

type SavePreferenceParams = {
  bizType?: string;
  pageKey: string;
  preferenceType: string;
  preferenceValue: unknown;
};

export function useUserPreference() {
  const listByPage = useCallback(async (pageKey: string): Promise<UserPreferenceItem[]> => {
    try {
      const res = await api.get<{ code: number; data: UserPreferenceItem[] }>(
        '/api/system/user-preference',
        { params: { pageKey } }
      );
      if (res?.code === 200 && Array.isArray(res.data)) return res.data;
    } catch (e) {
      console.warn('[useUserPreference] 拉取偏好失败', e);
    }
    return [];
  }, []);

  const save = useCallback(async (params: SavePreferenceParams) => {
    try {
      await api.put('/api/system/user-preference', {
        bizType: params.bizType || 'common',
        pageKey: params.pageKey,
        preferenceType: params.preferenceType,
        preferenceValue: typeof params.preferenceValue === 'string'
          ? params.preferenceValue
          : JSON.stringify(params.preferenceValue),
      });
    } catch (e) {
      console.warn('[useUserPreference] 保存偏好失败', e);
    }
  }, []);

  const remove = useCallback(async (pageKey: string, preferenceType: string) => {
    try {
      await api.delete('/api/system/user-preference', {
        params: { pageKey, preferenceType },
      });
    } catch (e) {
      console.warn('[useUserPreference] 删除偏好失败', e);
    }
  }, []);

  return { listByPage, save, remove };
}
