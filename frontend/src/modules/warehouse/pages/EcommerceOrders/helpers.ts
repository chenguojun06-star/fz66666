export const STATUS_MAP: Record<number, { label: string; color: string }> = {
  0: { label: '待付款', color: 'default' },
  1: { label: '待发货', color: 'orange' },
  2: { label: '已发货', color: 'blue' },
  3: { label: '已完成', color: 'green' },
  4: { label: '已取消', color: 'red' },
  5: { label: '退款中', color: 'magenta' },
};

export const WH_MAP: Record<number, { label: string; color: string }> = {
  0: { label: '待拣货', color: 'default' },
  1: { label: '备货中', color: 'orange' },
  2: { label: '已出库', color: 'green' },
};

export const EXPRESS_COMPANIES = [
  '顺丰', '中通', '圆通', '韵达', '申通',
  '极兔', '百世汇通', '京东快递', '德邦物流', 'EMS', '其他',
];
