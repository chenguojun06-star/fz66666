import api from '@/utils/api';

export interface PlatformAnnouncement {
  id: number;
  title: string;
  content: string | null;
  type: 'info' | 'warning' | 'important';
  active: number;
  startTime: string | null;
  endTime: string | null;
  createdBy: string | null;
  tenantId: number | null;
  createdAt: string;
}

export const announcementApi = {
  /** 获取当前生效的未读公告 */
  getActive: () => api.post<PlatformAnnouncement[]>('/system/announcement/active', {}),
  /** 标记已读 */
  markRead: (id: number) => api.post(`/system/announcement/${id}/read`, {}),
  /**
   * 发布公告（D-513 新增）
   * 后端权限：SUPER_ADMIN（可发全局）或 TENANT_OWNER（强制归属本租户，忽略传入 tenantId）
   */
  create: (payload: { title: string; content?: string; type?: 'info' | 'warning' | 'important' }) =>
    api.post<PlatformAnnouncement>('/system/announcement/', payload),
};
