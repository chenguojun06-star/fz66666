// 仓库仓位管理 - Hook 辅助纯函数
import type { LocationSkuItem, OutboundItem } from './types';

// 生成出库追踪ID
export const generateOutboundTraceId = (): string => {
  return 'TR-' + Date.now().toString(36).toUpperCase() + Math.random().toString(36).substring(2, 6).toUpperCase();
};

// 从库位物品构建出库列表
export const buildOutboundItems = (locationItems: LocationSkuItem[]): OutboundItem[] => {
  return locationItems.map(item => ({
    ...item,
    outboundQty: 0,
    selected: false,
    adjustedPrice: item.salesPrice,
  }));
};

// 校验出库选择，返回错误消息或 null
export const validateOutboundSelection = (items: OutboundItem[]): string | null => {
  const selectedItems = items.filter(item => item.selected && item.outboundQty > 0);
  if (selectedItems.length === 0) {
    return '请至少选择一项并填写出库数量';
  }
  for (const item of selectedItems) {
    if (item.outboundQty > item.stockQuantity) {
      return `${item.styleNo} ${item.color} ${item.size} 出库数量不能超过库存 ${item.stockQuantity}`;
    }
  }
  return null;
};

// 获取选中的出库物品
export const getSelectedOutboundItems = (items: OutboundItem[]): OutboundItem[] => {
  return items.filter(item => item.selected && item.outboundQty > 0);
};
