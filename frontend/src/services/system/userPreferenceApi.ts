import api from '@/utils/api';

/**
 * 用户统一偏好（t_user_preference）— 替代散落 localStorage
 * D-322: 列显隐等显示偏好跟随账号（换设备/换浏览器不丢）
 */
export interface UserPreferenceItem {
  id?: number;
  bizType?: string;
  pageKey: string;
  preferenceType: string;
  preferenceValue: string;
  updateTime?: string;
}

interface ApiResult<T> { code: number; data: T; message?: string; }

export const userPreferenceApi = {
  /** 查询当前用户在指定页面的全部偏好 */
  list: (pageKey: string) =>
    api.get<ApiResult<UserPreferenceItem[]>>('/system/user-preference', { params: { pageKey } }),

  /** 保存/更新单条偏好（按 tenant+user+pageKey+type 幂等） */
  save: (pageKey: string, preferenceType: string, preferenceValue: string, bizType?: string) =>
    api.put<ApiResult<UserPreferenceItem>>('/system/user-preference', {
      pageKey, preferenceType, preferenceValue, bizType,
    }),

  remove: (pageKey: string, preferenceType: string) =>
    api.delete<ApiResult<void>>('/system/user-preference', { params: { pageKey, preferenceType } }),
};
