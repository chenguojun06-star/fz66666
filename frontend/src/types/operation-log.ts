// 操作日志类型定义

export interface OperationLog {
  id?: string;
  module: string;          // 模块名称：样衣开发、下单管理等
  operation: string;       // 操作类型：删除、新增、修改等
  operatorId: string;      // 操作人ID
  operatorName: string;    // 操作人姓名
  targetType: string;      // 目标类型：款式、订单、物料等
  targetId: string;        // 目标ID
  targetName?: string;     // 目标名称：款号、订单号等
  reason?: string;         // 操作原因
  details?: string;        // 详细信息（JSON格式）
  ip?: string;            // 操作IP
  userAgent?: string;     // 浏览器信息
  operationTime: string;  // 操作时间
  status: 'success' | 'failure';  // 操作状态
  errorMessage?: string;  // 错误信息（失败时）
}

export interface OperationLogQueryParams {
  module?: string;         // 模块筛选
  operation?: string;      // 操作类型筛选
  operatorName?: string;   // 操作人筛选
  targetType?: string;     // 目标类型筛选
  startDate?: string;      // 开始日期
  endDate?: string;        // 结束日期
  page: number;
  pageSize: number;
}
