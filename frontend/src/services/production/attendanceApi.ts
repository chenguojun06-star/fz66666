import api from '../../utils/api';
import type { ApiResponse } from '../../types/api';

/**
 * 考勤管理 API
 * - 员工自助打卡（手机端首页）
 * - 管理端：管理员补录/修改/作废/批量休假（PC 端管理页）
 *
 * 注意：后端管理端接口使用 @RequestParam，需通过 query string 传参。
 */

// ==================== 类型 ====================

export interface AttendanceRecord {
  id: number;
  userId: string;
  userName: string;
  workDate: string;
  clockInTime: string | null;
  clockOutTime: string | null;
  workMinutes: number;
  workHours: string;
  source: string;
  status: string;
  statusText: string;
  leaveType: string | null;
  leaveTypeText: string | null;
  operatorId: string | null;
  operatorName: string | null;
  operateTime: string | null;
  remark: string | null;
}

export interface AttendanceStats {
  total: number;
  normalCount: number;
  leaveCount: number;
  adjustedCount: number;
  cancelledCount: number;
  totalMinutes: number;
  totalHours: number;
}

export interface AdminListResp {
  startDate: string;
  endDate: string;
  stats: AttendanceStats;
  records: AttendanceRecord[];
  total: number;
}

export interface SupplementReq {
  targetUserId: string;
  targetUserName?: string;
  workDate: string; // yyyy-MM-dd
  clockInTime?: string; // yyyy-MM-dd HH:mm
  clockOutTime?: string;
  remark?: string;
}

export interface AdjustReq {
  id: number;
  clockInTime?: string;
  clockOutTime?: string;
  remark?: string;
}

export interface CancelReq {
  id: number;
  reason?: string;
}

export interface BatchLeaveReq {
  targetUserId: string;
  targetUserName?: string;
  startDate: string; // yyyy-MM-dd
  endDate: string;
  leaveType: string; // LEGAL_HOLIDAY/SICK/PERSONAL/ANNUAL/MATERNITY/OTHER
  remark?: string;
}

// ==================== 工具：把对象转为 query string ====================

const toSearchParams = (obj: Record<string, unknown>): URLSearchParams => {
  const sp = new URLSearchParams();
  Object.entries(obj).forEach(([k, v]) => {
    if (v === undefined || v === null || v === '') return;
    sp.append(k, String(v));
  });
  return sp;
};

// ==================== API ====================

const attendanceApi = {
  /** 管理端列表 */
  adminList: (params: { startDate?: string; endDate?: string; userId?: string; status?: string }) =>
    api.get<ApiResponse<AdminListResp>>('/production/attendance/admin/list', { params }),

  /** 管理员补录打卡 */
  supplement: (req: SupplementReq) =>
    api.post<ApiResponse<{ message: string }>>(
      `/production/attendance/admin/supplement?${toSearchParams(req as unknown as Record<string, unknown>).toString()}`,
    ),

  /** 管理员修改打卡 */
  adjust: (req: AdjustReq) =>
    api.post<ApiResponse<{ message: string }>>(
      `/production/attendance/admin/adjust?${toSearchParams(req as unknown as Record<string, unknown>).toString()}`,
    ),

  /** 管理员作废打卡 */
  cancel: (req: CancelReq) =>
    api.post<ApiResponse<{ message: string }>>(
      `/production/attendance/admin/cancel?${toSearchParams(req as unknown as Record<string, unknown>).toString()}`,
    ),

  /** 管理员批量标记休假 */
  batchLeave: (req: BatchLeaveReq) =>
    api.post<ApiResponse<{ message: string; created: number; skipped: number }>>(
      `/production/attendance/admin/batch-leave?${toSearchParams(req as unknown as Record<string, unknown>).toString()}`,
    ),
};

export default attendanceApi;
