import React, { useMemo } from 'react';
import { Alert } from 'antd';
import XiaoyunCloudAvatar from '@/components/common/XiaoyunCloudAvatar';
import type { MaterialPurchase } from '@/types/production';
import { getMaterialTypeLabel } from '@/utils/materialType';
import { formatMaterialQuantity, normalizeMaterialQuantity, subtractMaterialQuantity } from '../utils';

interface MaterialPurchaseAIBannerProps {
  /** 当前已加载的采购记录（由 queryParams 过滤后） */
  purchaseList: MaterialPurchase[];
  /** 当前筛选的订单号；有值时展示该订单维度分析，否则展示全局汇总 */
  currentOrderNo?: string;
}

/**
 * 物料采购 AI 洞察横幅
 * - 存在 currentOrderNo 时，展示该订单的到货情况与裁剪可行性判断
 * - 否则，展示所有采购记录的整体到货状态统计
 */
const MaterialPurchaseAIBanner: React.FC<MaterialPurchaseAIBannerProps> = ({
  purchaseList,
  currentOrderNo,
}) => {
  const insight = useMemo(() => {
    if (purchaseList.length === 0) return null;

    // ── 订单维度分析 ──────────────────────────────────────────────────
    if (currentOrderNo) {
      const orderRecords = purchaseList.filter(r => r.orderNo === currentOrderNo);
      if (orderRecords.length === 0) {
        return {
          type: 'info' as const,
          message: ` AI 采购分析：订单 ${currentOrderNo} 暂无采购记录，请确认是否已录入面辅料采购单。`,
        };
      }

      // 过滤有效记录（未取消）
      const active = orderRecords.filter(r => r.status !== 'cancelled');

      // 统计各面料的到货情况
      interface MatSummary {
        name: string;
        purchaseQuantity: number;
        arrivedQuantity: number;
        unit: string;
        supplier: string;
        status: MaterialPurchase['status'];
      }
      const matList: MatSummary[] = active.map(r => ({
        name: r.materialName,
        purchaseQuantity: normalizeMaterialQuantity(r.purchaseQuantity),
        arrivedQuantity: normalizeMaterialQuantity(r.arrivedQuantity),
        unit: r.unit || '',
        supplier: r.supplierName || '',
        status: r.status,
      }));

      const totalPurchase = matList.reduce((s, m) => s + m.purchaseQuantity, 0);
      const totalArrived = matList.reduce((s, m) => s + m.arrivedQuantity, 0);

      // 未到货（0件）
      const notArrived = matList.filter(m => m.arrivedQuantity === 0 && m.purchaseQuantity > 0);
      // 部分到货（到货但不足）
      const partial = matList.filter(m => m.arrivedQuantity > 0 && m.arrivedQuantity < m.purchaseQuantity);
      // 全到货
      const fullArrived = matList.filter(m => m.arrivedQuantity >= m.purchaseQuantity && m.purchaseQuantity > 0);

      // 按物料类型分组展示
      const typeGroupMap = new Map<string, { arrived: number; total: number }>();
      for (const r of active) {
        const typeLabel = getMaterialTypeLabel(r.materialType) || '其他';
        const key = typeLabel.slice(0, 2); // 面料/里料/辅料
        const prev = typeGroupMap.get(key) ?? { arrived: 0, total: 0 };
        typeGroupMap.set(key, {
          arrived: prev.arrived + (Number(r.arrivedQuantity) || 0),
          total: prev.total + (Number(r.purchaseQuantity) || 0),
        });
      }

      const typeDesc = Array.from(typeGroupMap.entries())
        .map(([type, { arrived, total }]) => {
          const rate = total > 0 ? Math.round((arrived / total) * 100) : 0;
          const icon = arrived >= total ? '' : arrived > 0 ? '' : '';
          return `${type} ${formatMaterialQuantity(arrived)}/${formatMaterialQuantity(total)}${icon}(${rate}%)`;
        })
        .join('  ');

      let msg: string;
      let alertType: 'success' | 'warning' | 'error' | 'info';

      if (notArrived.length === 0 && partial.length === 0) {
        // 全部到齐
        msg = `订单 ${currentOrderNo} 面辅料全部到货（共 ${formatMaterialQuantity(totalArrived)}/${formatMaterialQuantity(totalPurchase)} 单位）。` +
          `${typeDesc}  材料已备齐，可安排裁剪 `;
        alertType = 'success';
      } else if (notArrived.length > 0) {
        // 有物料未到
        const missingDesc = notArrived.slice(0, 3)
          .map(m => `${m.name}（${m.purchaseQuantity}${m.unit}，供应商：${m.supplier || '未知'}）`)
          .join('、');
        const more = notArrived.length > 3 ? `等共 ${notArrived.length} 种` : '';
        msg = `订单 ${currentOrderNo} 材料未齐，裁剪暂不可开始 \n` +
          `未到货：${missingDesc}${more}。` +
          (partial.length > 0 ? ` 另有 ${partial.length} 种物料部分到货。` : '') +
          ` 整体到货率 ${totalPurchase > 0 ? Math.round((totalArrived / totalPurchase) * 100) : 0}%，建议催促相关供应商。`;
        alertType = 'error';
      } else {
        // 仅有部分到货
        const partDesc = partial.slice(0, 2)
          .map(m => `${m.name} ${formatMaterialQuantity(m.arrivedQuantity)}/${formatMaterialQuantity(m.purchaseQuantity)}${m.unit}`)
          .join('、');
        msg = `订单 ${currentOrderNo} 部分物料在途 \n` +
          `部分到货：${partDesc}${partial.length > 2 ? `等 ${partial.length} 种` : ''}。` +
          ` 全量到货 ${fullArrived.length} 种，整体到货率 ${totalPurchase > 0 ? Math.round((totalArrived / totalPurchase) * 100) : 0}%。` +
          ` 建议确认是否可先开始已到材料部分裁剪。`;
        alertType = 'warning';
      }

      return { type: alertType, message: ` AI 采购分析：${msg}` };
    }

    // ── 全局汇总（未指定订单号）─────────────────────────────────────
    const active = purchaseList.filter(r => r.status !== 'cancelled');
    const pending = active.filter(r => r.status === 'pending').length;
    const received = active.filter(r => r.status === 'received' || r.status === 'completed').length;
    const partial = active.filter(r => r.status === 'partial').length;
    const totalRecords = active.length;

    if (totalRecords === 0) return null;

    // 统计到货率
    const totalPurchaseQty = active.reduce((s, r) => s + normalizeMaterialQuantity(r.purchaseQuantity), 0);
    const totalArrivedQty = active.reduce((s, r) => s + normalizeMaterialQuantity(r.arrivedQuantity), 0);
    const overallRate = totalPurchaseQty > 0 ? Math.round((totalArrivedQty / totalPurchaseQty) * 100) : 0;

    // 找出未到货最多的订单（分组按 orderNo 统计缺口）
    const orderGapMap = new Map<string, number>();
    for (const r of active) {
      if (!r.orderNo || r.arrivedQuantity >= r.purchaseQuantity) continue;
      const gap = subtractMaterialQuantity(r.purchaseQuantity, r.arrivedQuantity);
      orderGapMap.set(String(r.orderNo), normalizeMaterialQuantity((orderGapMap.get(String(r.orderNo)) ?? 0) + gap));
    }
    const topMissingOrders = Array.from(orderGapMap.entries())
      .sort(([, a], [, b]) => b - a)
      .slice(0, 3)
      .map(([no]) => no);

    let msg: string;
    let alertType: 'success' | 'warning' | 'error' | 'info';

    if (pending === 0 && partial === 0) {
      msg = `当前 ${totalRecords} 条采购记录全部到货（到货率 ${overallRate}%）。材料状态良好，可推进生产 `;
      alertType = 'success';
    } else {
      msg = `全局采购：共 ${totalRecords} 条记录 | ` +
        `已完成 ${received} 条 · 部分到货 ${partial} 条 · 未到货 ${pending} 条 · ` +
        `整体到货率 ${overallRate}%。`;
      if (topMissingOrders.length > 0) {
        msg += ` 缺口最大的订单：${topMissingOrders.join('、')}，建议优先跟进。`;
      }
      alertType = pending >= 5 ? 'warning' : 'info';
    }

    return { type: alertType, message: ` AI 采购分析：${msg}` };
  }, [purchaseList, currentOrderNo]);

  if (!insight) return null;

  return (
    <Alert
      icon={<XiaoyunCloudAvatar size={18} active />}
      showIcon
      type={insight.type}
      title={insight.message}
      style={{ marginBottom: 12, fontSize: 13, whiteSpace: 'pre-line' }}
      closable
    />
  );
};

export default MaterialPurchaseAIBanner;
