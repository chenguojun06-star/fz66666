// 系统日志模块的纯函数与常量

/** 把后端返回的登录状态归一化为 'success' | 'failure' */
export const normalizeLoginStatus = (raw: string | null | undefined): 'success' | 'failure' => {
  const v = String(raw ?? '').trim().toLowerCase();
  return v === 'success' ? 'success' : 'failure';
};

/** 登录状态文案 */
export const getStatusText = (status: 'success' | 'failure') => {
  return status === 'success' ? '成功' : '失败';
};

/** 登录状态筛选选项 */
export const loginStatusOptions = [
  { value: 'SUCCESS', label: '成功' },
  { value: 'FAILED', label: '失败' },
];

/** 操作日志-模块筛选选项 */
export const moduleOptions = [
  { value: '样衣开发', label: '样衣开发' },
  { value: '下单管理', label: '下单管理' },
  { value: '大货生产', label: '大货生产' },
  { value: '物料采购', label: '物料采购' },
  { value: '成品管理', label: '成品管理' },
  { value: '财务管理', label: '财务管理' },
  { value: '系统设置', label: '系统设置' },
];

/** 操作日志-操作类型筛选选项 */
export const operationTypeOptions = [
  { value: '删除', label: '删除' },
  { value: '新增', label: '新增' },
  { value: '修改', label: '修改' },
  { value: '审批', label: '审批' },
  { value: '导出', label: '导出' },
];

/** 操作日志-目标类型筛选选项 */
export const targetTypeOptions = [
  { value: '款式', label: '款式' },
  { value: '订单', label: '订单' },
  { value: '裁剪单', label: '裁剪单' },
  { value: '物料', label: '物料' },
  { value: '采购单', label: '采购单' },
  { value: '用户', label: '用户' },
  { value: '角色', label: '角色' },
];

/** 操作类型 -> Tag 颜色映射 */
export const OPERATION_COLOR_MAP: Record<string, string> = {
  '删除': 'red',
  '新增': 'green',
  '修改': 'orange',
  '审批': 'purple',
  '导出': 'cyan',
};
