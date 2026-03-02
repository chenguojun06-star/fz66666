import React, { useMemo } from 'react';
import { Alert } from 'antd';
import { RobotOutlined } from '@ant-design/icons';
import type { WarehousingStats } from '../hooks/useProductWarehousing';

interface WarehousingAuditBannerProps {
  stats: WarehousingStats;
}

/**
 * 质检入库 AI 洞察横幅
 * 根据当前各环节积压数量，自动生成优先行动建议，无需后端 API 调用。
 */
const WarehousingAuditBanner: React.FC<WarehousingAuditBannerProps> = ({ stats }) => {
  const insight = useMemo(() => {
    const { pendingQcBundles, pendingQcQuantity, pendingWarehouseBundles, pendingWarehouseQuantity, pendingPackagingBundles, totalOrders, totalQuantity } = stats;
    const packaging = pendingPackagingBundles ?? 0;
    const total = (pendingQcBundles ?? 0) + packaging + (pendingWarehouseBundles ?? 0);

    // 无待处理数据
    if (total === 0) {
      if ((totalOrders ?? 0) === 0) return null; // 没有任何数据，不展示
      return {
        type: 'success' as const,
        message: `✅ AI 质检入库分析：当前无积压菲号，累计已完成 ${totalOrders} 个订单 · ${totalQuantity} 件，入库流程畅通。`,
      };
    }

    // 找出最大瓶颈
    const bottlenecks: Array<{ label: string; bundles: number; qty: number }> = [];
    if ((pendingQcBundles ?? 0) > 0) bottlenecks.push({ label: '待质检', bundles: pendingQcBundles ?? 0, qty: pendingQcQuantity ?? 0 });
    if (packaging > 0) bottlenecks.push({ label: '待包装', bundles: packaging, qty: 0 });
    if ((pendingWarehouseBundles ?? 0) > 0) bottlenecks.push({ label: '待入库', bundles: pendingWarehouseBundles ?? 0, qty: pendingWarehouseQuantity ?? 0 });

    // 排序：菲号最多的在前
    bottlenecks.sort((a, b) => b.bundles - a.bundles);
    const top = bottlenecks[0];
    const rest = bottlenecks.slice(1);

    // 生成主要建议
    let mainAdvice = `当前瓶颈在「${top.label}」阶段，积压 ${top.bundles} 个菲号` +
      (top.qty > 0 ? `（${top.qty} 件）` : '') +
      `，建议优先安排处理。`;

    // 附加次级建议
    const restDesc = rest.map(r => `${r.label} ${r.bundles} 个菲号`).join('、');
    if (restDesc) {
      mainAdvice += ` 另有 ${restDesc} 等待跟进。`;
    }

    // 累计数据
    if ((totalOrders ?? 0) > 0) {
      mainAdvice += ` 累计已入库 ${totalOrders} 订单 · ${totalQuantity} 件。`;
    }

    // 判断整体压力等级
    const alertType = top.bundles >= 20 ? 'error' : top.bundles >= 10 ? 'warning' : 'info';

    return {
      type: alertType as 'error' | 'warning' | 'info',
      message: `🤖 AI 质检入库分析：${mainAdvice}`,
    };
  }, [stats]);

  if (!insight) return null;

  return (
    <Alert
      icon={<RobotOutlined />}
      showIcon
      type={insight.type}
      message={insight.message}
      style={{ marginBottom: 12, fontSize: 13 }}
      closable
    />
  );
};

export default WarehousingAuditBanner;
