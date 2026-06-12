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
};
