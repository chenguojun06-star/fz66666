// CRM 仪表盘 - 常量与纯函数

// 订阅检测别名
export const CRM_APP_CODE_ALIASES = ['CRM_MODULE', 'CRM'];

// 初始统计
export const INITIAL_STATS = { total: 0, activeCount: 0, newThisMonth: 0, vip: 0 };

// 应收账款状态配置（详情弹窗使用）
export const RECEIVABLE_STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  PENDING:  { label: '待收款', color: 'blue' },
  PARTIAL:  { label: '部分到账', color: 'orange' },
  PAID:     { label: '已全额到账', color: 'green' },
  OVERDUE:  { label: '已逾期', color: 'red' },
};

// 客户列表状态过滤项
export const CUSTOMER_STATUS_OPTIONS = [
  { value: '', label: '全部状态' },
  { value: 'ACTIVE', label: '合作中' },
  { value: 'INACTIVE', label: '已停合作' },
];

// 客户等级选项（表单）
export const CUSTOMER_LEVEL_OPTIONS = [
  { value: 'NORMAL', label: '普通客户' },
  { value: 'VIP', label: 'VIP客户' },
];

// 客户状态选项（表单）
export const CUSTOMER_FORM_STATUS_OPTIONS = [
  { value: 'ACTIVE', label: '合作中' },
  { value: 'INACTIVE', label: '已停合作' },
];

// 锁定页功能列表
export const LOCKED_FEATURES = [
  { icon: '', title: '客户档案管理', desc: '统一管理B端客户信息、联系人、合作历史' },
  { icon: '', title: '应收账款追踪', desc: '发货即自动生成应收单，逾期自动提醒催款' },
  { icon: '', title: '客户查询门户', desc: '生成专属二维码，客户扫码即可查看订单进度' },
  { icon: '', title: '历史订单汇总', desc: '按客户维度查看所有合作款式、金额、周期' },
  { icon: '', title: '出货提醒', desc: '出货前3天自动微信提醒对接人，降低漏货风险' },
  { icon: '', title: '报价单生成', desc: '一键生成带款式图、价格、工艺描述的PDF报价单' },
];

// 订阅检测：判断 app/subscription 是否属于 CRM 模块且处于有效订阅状态
export const hasActiveSubscription = (item: any, appCodeAliases: string[]) => {
  const code = String(item?.appCode || '').trim().toUpperCase();
  if (!appCodeAliases.includes(code)) return false;
  const status = String(item?.status || '').trim().toUpperCase();
  const isStatusActive = status === '' || status === 'ACTIVE' || status === 'TRIAL';
  if (item?.isExpired === true) return false;
  const endTime = item?.endTime ? new Date(item.endTime).getTime() : null;
  const notExpired = endTime == null || Number.isNaN(endTime) || endTime > Date.now();
  return isStatusActive && notExpired;
};
