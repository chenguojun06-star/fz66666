import api from '../../utils/api';
import type { ApiResponse, PaginatedData } from '../../types/api';

/**
 * 生产异常报告（D-417）
 *
 * 让 PC 端与手机端共用同一套接口，保证「一端处理、另一端状态同步」：
 *   GET  /production/exception/list            分页列表
 *   POST /production/exception/{id}/handle     处理（resolve 已解决 / reopen 重新打开）
 *   POST /production/exception/report          上报（既有）
 *
 * 权限：处理动作后端限制「主管及以上」（UserContext.isSupervisorOrAbove）。
 */
export interface ProductionExceptionReport {
  id: number;
  tenantId?: number;
  orderNo?: string;
  processName?: string;
  workerId?: string;
  workerName?: string;
  /** MATERIAL_SHORTAGE=缺面料/辅料, MACHINE_FAULT=车床故障, NEED_HELP=需指导/协助 */
  exceptionType?: string;
  description?: string;
  /** PENDING=待处理, RESOLVED=已解决 */
  status?: string;
  /** D-417 处理人 */
  handlerId?: string;
  handlerName?: string;
  handleNote?: string;
  handleTime?: string;
  createTime?: string;
  updateTime?: string;
}

export interface ExceptionReportQueryParams {
  status?: string;
  orderNo?: string;
  keyword?: string;
  page?: number;
  pageSize?: number;
}

export const exceptionReportApi = {
  /**
   * 异常报告分页列表
   * 工厂账号后端自动只返回本工厂订单的异常。
   */
  list: (params: ExceptionReportQueryParams) =>
    api.get<ApiResponse<PaginatedData<ProductionExceptionReport>>>('/production/exception/list', { params }),

  /**
   * 处理异常报告
   * @param id 异常报告 id
   * @param action resolve=标记已解决 / reopen=重新打开
   * @param note 处理说明
   */
  handle: (id: number | string, action: 'resolve' | 'reopen', note?: string) =>
    api.post<ApiResponse<ProductionExceptionReport>>(
      `/production/exception/${encodeURIComponent(String(id))}/handle`,
      undefined,
      { params: { action, ...(note ? { note } : {}) } },
    ),
};

export default exceptionReportApi;
