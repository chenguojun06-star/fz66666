import api, { unwrapApiData } from '@/utils/api';

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

export const userPreferenceApi = {
  /** 查询当前用户在指定页面的全部偏好 */
  list: async (pageKey: string) =>
    unwrapApiData<UserPreferenceItem[]>(await api.get('/system/user-preference', { params: { pageKey } }), '用户偏好请求失败'),

  /** 保存/更新单条偏好（按 tenant+user+pageKey+type 幂等） */
  save: async (pageKey: string, preferenceType: string, preferenceValue: string, bizType?: string) =>
    unwrapApiData<UserPreferenceItem>(await api.put('/system/user-preference', {
      pageKey, preferenceType, preferenceValue, bizType,
    }), '用户偏好请求失败'),

  remove: async (pageKey: string, preferenceType: string) =>
    unwrapApiData<void>(await api.delete('/system/user-preference', { params: { pageKey, preferenceType } }), '用户偏好请求失败'),
};
