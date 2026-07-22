export const ORDER_STATUS: Record<string, { label: string; color: string }> = {
  PENDING: { label: '待处理', color: 'orange' },
  PAID: { label: '已激活', color: 'green' },
  ACTIVATED: { label: '已激活', color: 'green' },
  TRIAL: { label: '免费试用', color: 'cyan' },
  CANCELED: { label: '已取消', color: 'default' },
  REFUNDED: { label: '已退款', color: 'red' },
};

export const SUB_TYPE: Record<string, { label: string; color: string }> = {
  TRIAL: { label: '免费试用', color: 'default' },
  MONTHLY: { label: '月付', color: 'blue' },
  YEARLY: { label: '年付', color: 'gold' },
  PERPETUAL: { label: '永久', color: 'purple' },
};
