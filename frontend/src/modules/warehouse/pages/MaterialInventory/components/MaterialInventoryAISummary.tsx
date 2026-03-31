import React, { useMemo } from 'react';
import { Alert } from 'antd';
import XiaoyunCloudAvatar from '@/components/common/XiaoyunCloudAvatar';
import type { MaterialStockAlertItem } from './MaterialAlertRanking';

interface MaterialInventoryStats {
  totalValue: number;
  totalQty: number;
  lowStockCount: number;
  materialTypes: number;
}

interface MaterialInventoryAISummaryProps {
  stats: MaterialInventoryStats;
  alertList: MaterialStockAlertItem[];
}

/**
 * 面辅料库存 AI 智能摘要
 * 根据库存数据和预警列表，自动生成自然语言建议，无需后端 AI 调用。
 */
const MaterialInventoryAISummary: React.FC<MaterialInventoryAISummaryProps> = ({ stats, alertList }) => {
  const insight = useMemo(() => {
    const { lowStockCount, totalQty, materialTypes } = stats;

    // 无数据，不展示
    if (materialTypes === 0 && totalQty === 0) return null;

    // 所有物料充足
    if (lowStockCount === 0) {
      return {
        type: 'success' as const,
        message: `✅ AI 库存摘要：当前 ${materialTypes} 类物料库存全部高于安全水位，总库存 ${totalQty.toLocaleString()} 件/米，供应保障良好，无需补货。`,
      };
    }

    // 有预警：找出缺口最大的前2项
    const sorted = [...alertList]
      .map((item) => {
        const target = Number(item.suggestedSafetyStock ?? item.safetyStock ?? 0);
        const current = Number(item.quantity ?? 0);
        const gap = Math.max(0, target - current);
        return { name: item.materialName || item.materialCode || '未知物料', unit: item.unit || '件', gap };
      })
      .filter((i) => i.gap > 0)
      .sort((a, b) => b.gap - a.gap);

    const top2 = sorted.slice(0, 2);

    let urgentDesc = '';
    if (top2.length > 0) {
      urgentDesc = `最紧缺：${top2.map((i) => `${i.name}（缺口 ${i.gap.toLocaleString()}${i.unit}）`).join('、')}。`;
    }

    const alertType = lowStockCount >= 5 ? 'error' : lowStockCount >= 2 ? 'warning' : 'info';

    return {
      type: alertType as 'error' | 'warning' | 'info',
      message: `🤖 AI 库存摘要：${lowStockCount} 种物料低于安全库存，建议尽快补货以避免影响在手订单排产。${urgentDesc}其余 ${Math.max(0, materialTypes - lowStockCount)} 类物料充足。`,
    };
  }, [stats, alertList]);

  if (!insight) return null;

  return (
    <Alert
      icon={<XiaoyunCloudAvatar size={18} active />}
      showIcon
      type={insight.type}
      title={insight.message}
      style={{ marginBottom: 8, fontSize: 13 }}
      closable
    />
  );
};

export default MaterialInventoryAISummary;
