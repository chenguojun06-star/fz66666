import React, { useMemo } from 'react';
import { Alert } from 'antd';
import XiaoyunCloudAvatar from '@/components/common/XiaoyunCloudAvatar';
import type { WarehousingStats } from '../hooks/useProductWarehousing';
import type { ProductWarehousing } from '@/types/production';

interface WarehousingAuditBannerProps {
  stats: WarehousingStats;
  /** 当前已加载的入库记录列表（按 queryParams 过滤后的） */
  warehousingList?: ProductWarehousing[];
  /** 当前筛选的订单号；有值时展示该订单维度分析，否则展示全局汇总 */
  currentOrderNo?: string;
}

/**
 * 质检入库 AI 洞察横幅
 * - 存在 currentOrderNo 时：基于 warehousingList 实时计算该订单的质检/入库明细
 * - 否则：使用全局 stats 展示积压建议（不依赖后端额外 API）
 */
const WarehousingAuditBanner: React.FC<WarehousingAuditBannerProps> = ({
  stats,
  warehousingList,
  currentOrderNo,
}) => {
  // ── 订单维度分析（筛选了订单号时启用）──────────────────────────────
  const orderInsight = useMemo(() => {
    if (!currentOrderNo || !warehousingList || warehousingList.length === 0) return null;

    const records = warehousingList.filter(r => r.orderNo === currentOrderNo);
    if (records.length === 0) return null;

    // 按尺码汇总
    const sizeMap = new Map<string, { qualified: number; unqualified: number; warehoused: number }>();
    let totalQualified = 0;
    let totalUnqualified = 0;
    let totalWarehoused = 0;

    for (const r of records) {
      const sz = r.size || '通码';
      const prev = sizeMap.get(sz) ?? { qualified: 0, unqualified: 0, warehoused: 0 };
      const q = Number(r.qualifiedQuantity) || 0;
      const uq = Number(r.unqualifiedQuantity) || 0;
      const w = Number(r.warehousingQuantity) || 0;
      sizeMap.set(sz, { qualified: prev.qualified + q, unqualified: prev.unqualified + uq, warehoused: prev.warehoused + w });
      totalQualified += q;
      totalUnqualified += uq;
      totalWarehoused += w;
    }

    const totalProcessed = totalQualified + totalUnqualified;
    const passRate = totalProcessed > 0 ? Math.round((totalQualified / totalProcessed) * 100) : 0;

    // 找出有不合格件的尺码
    const badSizes = Array.from(sizeMap.entries())
      .filter(([, v]) => v.unqualified > 0)
      .map(([sz, v]) => `${sz}码 ${v.unqualified} 件不合格`);

    let msg: string;
    let alertType: 'success' | 'warning' | 'error' | 'info';

    if (totalUnqualified === 0) {
      msg = `订单 ${currentOrderNo}：共 ${totalProcessed} 件全部合格（合格率 100%），` +
        `已入库 ${totalWarehoused} 件，入库流程完成 ✅`;
      alertType = 'success';
    } else if (passRate >= 85) {
      msg = `订单 ${currentOrderNo}：${totalProcessed} 件中 ${totalQualified} 件合格（${passRate}%），` +
        `${badSizes.join('、')} 需返工重检。已入库 ${totalWarehoused} 件，建议跟进不合格件处理。`;
      alertType = 'info';
    } else if (passRate >= 60) {
      msg = `订单 ${currentOrderNo}：⚠️ 合格率仅 ${passRate}%，${totalUnqualified} 件不合格（${badSizes.join('、')}）。` +
        `已入库 ${totalWarehoused} 件，需重点跟进质量问题。`;
      alertType = 'warning';
    } else {
      msg = `订单 ${currentOrderNo}：🚨 质检合格率 ${passRate}% 偏低！${totalUnqualified} 件不合格（${badSizes.join('、')}），` +
        `已入库 ${totalWarehoused} 件。建议立即排查工序问题，避免延误交货。`;
      alertType = 'error';
    }

    return { type: alertType, message: `🤖 AI 质检入库：${msg}` };
  }, [currentOrderNo, warehousingList]);

  // ── 全局积压分析（无订单筛选时使用）────────────────────────────────
  const globalInsight = useMemo(() => {
    if (currentOrderNo) return null; // 有订单筛选时由 orderInsight 处理

    const { pendingQcBundles, pendingQcQuantity, pendingWarehouseBundles, pendingWarehouseQuantity, pendingPackagingBundles, totalOrders, totalQuantity } = stats;
    const packaging = pendingPackagingBundles ?? 0;
    const total = (pendingQcBundles ?? 0) + packaging + (pendingWarehouseBundles ?? 0);

    if (total === 0) {
      if ((totalOrders ?? 0) === 0) return null;
      return {
        type: 'success' as const,
        message: `✅ AI 质检入库分析：当前无积压菲号，累计已完成 ${totalOrders} 个订单 · ${totalQuantity} 件，入库流程畅通。`,
      };
    }

    const bottlenecks: Array<{ label: string; bundles: number; qty: number }> = [];
    if ((pendingQcBundles ?? 0) > 0) bottlenecks.push({ label: '待质检', bundles: pendingQcBundles ?? 0, qty: pendingQcQuantity ?? 0 });
    if (packaging > 0) bottlenecks.push({ label: '待包装', bundles: packaging, qty: 0 });
    if ((pendingWarehouseBundles ?? 0) > 0) bottlenecks.push({ label: '待入库', bundles: pendingWarehouseBundles ?? 0, qty: pendingWarehouseQuantity ?? 0 });

    bottlenecks.sort((a, b) => b.bundles - a.bundles);
    const top = bottlenecks[0];
    const rest = bottlenecks.slice(1);

    let mainAdvice = `当前瓶颈在「${top.label}」阶段，积压 ${top.bundles} 个菲号` +
      (top.qty > 0 ? `（${top.qty} 件）` : '') + `，建议优先安排处理。`;

    const restDesc = rest.map(r => `${r.label} ${r.bundles} 个菲号`).join('、');
    if (restDesc) mainAdvice += ` 另有 ${restDesc} 等待跟进。`;
    if ((totalOrders ?? 0) > 0) mainAdvice += ` 累计已入库 ${totalOrders} 订单 · ${totalQuantity} 件。`;

    const alertType = top.bundles >= 20 ? 'error' : top.bundles >= 10 ? 'warning' : 'info';
    return { type: alertType as 'error' | 'warning' | 'info', message: `🤖 AI 质检入库分析：${mainAdvice}` };
  }, [stats, currentOrderNo]);

  const insight = orderInsight ?? globalInsight;
  if (!insight) return null;

  return (
    <Alert
      icon={<XiaoyunCloudAvatar size={18} active />}
      showIcon
      type={insight.type}
      title={insight.message}
      style={{ marginBottom: 12, fontSize: 13 }}
      closable
    />
  );
};

export default WarehousingAuditBanner;
