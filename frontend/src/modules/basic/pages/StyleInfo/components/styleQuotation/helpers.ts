import type { BomColorCosts } from './QuotationBomSection';

/**
 * 计算物料清单成本：优先使用 totalPrice，否则按 用量×(1+损耗率)×单价 计算
 */
export const calcBomCost = (items: any[]) => {
  return (items || []).reduce((sum: number, item: any) => {
    const rawTotalPrice = item?.totalPrice;
    const hasTotalPrice =
      rawTotalPrice !== undefined && rawTotalPrice !== null && String(rawTotalPrice).trim() !== '';
    if (hasTotalPrice) {
      const n = typeof rawTotalPrice === 'number' ? rawTotalPrice : Number(rawTotalPrice);
      if (Number.isFinite(n)) return sum + n;
    }
    const usageAmount = Number(item?.usageAmount) || 0;
    const lossRate = Number(item?.lossRate) || 0;
    const unitPrice = Number(item?.unitPrice) || 0;
    return sum + usageAmount * (1 + lossRate / 100) * unitPrice;
  }, 0);
};

/**
 * 按颜色分组计算 BOM 成本，返回各颜色成本、平均成本、最大成本
 */
export const calcBomCostByColor = (items: any[]): BomColorCosts => {
  const colorGroups: Record<string, any[]> = {};
  (items || []).forEach((item: any) => {
    const color = String(item?.color || '默认').trim() || '默认';
    if (!colorGroups[color]) colorGroups[color] = [];
    colorGroups[color].push(item);
  });
  const colors = Object.keys(colorGroups);
  const costByColor: Record<string, number> = {};
  colors.forEach((color) => {
    costByColor[color] = calcBomCost(colorGroups[color]);
  });
  const costs = Object.values(costByColor);
  const avgCost = costs.length > 0 ? costs.reduce((a, b) => a + b, 0) / costs.length : 0;
  const maxCost = costs.length > 0 ? Math.max(...costs) : 0;
  return { costByColor, avgCost, maxCost, colors };
};
