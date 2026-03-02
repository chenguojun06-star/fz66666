/**
 * 物料采购智能分析 — 从采购数据中挖掘关键路径、供应商风险、裁剪可行性
 *
 * 分析维度：
 * 1. 🔴 关键路径 — 面料是裁剪前提，面料没到=整单卡死
 * 2. 🏭 供应商维度 — 谁快谁慢？谁超期？该催谁？
 * 3. ⚡ 裁剪可行性 — 能不能先开裁？辅料能不能后补？
 * 4. 💡 行动建议 — 具体该催谁、做什么、优先级
 * 5. 📈 预计影响 — 对生产进度和成本的影响
 */
import React from 'react';
import { MaterialPurchase as MaterialPurchaseType } from '@/types/production';
import { getMaterialTypeCategory } from '@/utils/materialType';

export interface PurchaseInsight {
  totalMaterials: number;
  arrivalRate: number;
  totalCost: number;
  arrivedCost: number;
  canStartCutting: boolean;
  criticalPath: string;
  risks: string[];
  suggestions: string[];
  supplierIssues: string[];
  impact: string[];
  verdict: 'good' | 'warn' | 'critical';
}

/** 判断单条记录是否已到齐 */
const isFullyArrived = (r: MaterialPurchaseType) =>
  (Number(r.arrivedQuantity) || 0) >= (Number(r.purchaseQuantity) || 0) && (Number(r.purchaseQuantity) || 0) > 0;

/** 从同一订单的采购记录中提取智能洞察 */
export function analyzePurchase(orderRecs: MaterialPurchaseType[]): PurchaseInsight {
  const totalP = orderRecs.reduce((s, r) => s + (Number(r.purchaseQuantity) || 0), 0);
  const totalA = orderRecs.reduce((s, r) => s + (Number(r.arrivedQuantity) || 0), 0);
  const rate = totalP > 0 ? Math.round(totalA / totalP * 100) : 0;

  // 成本分析
  const totalCost = orderRecs.reduce((s, r) => s + (Number(r.totalAmount) || 0), 0);
  const arrivedCost = orderRecs.filter(r => isFullyArrived(r)).reduce((s, r) => s + (Number(r.totalAmount) || 0), 0);

  // 按物料类型分组
  const fabrics     = orderRecs.filter(r => getMaterialTypeCategory(r.materialType) === 'fabric');
  const linings     = orderRecs.filter(r => getMaterialTypeCategory(r.materialType) === 'lining');
  const accessories = orderRecs.filter(r => getMaterialTypeCategory(r.materialType) === 'accessory');

  const pendingFabrics = fabrics.filter(r => !isFullyArrived(r));
  const pendingLinings = linings.filter(r => !isFullyArrived(r));
  const pendingAccessories = accessories.filter(r => !isFullyArrived(r));

  const fabricsReady = pendingFabrics.length === 0 && fabrics.length > 0;
  const canStartCutting = fabrics.length === 0 || fabricsReady;

  const risks: string[] = [];
  const suggestions: string[] = [];
  const supplierIssues: string[] = [];
  const impact: string[] = [];
  let criticalPath = '';
  let verdict: 'good' | 'warn' | 'critical' = 'good';

  // ── 关键路径：面料 ──
  if (pendingFabrics.length > 0) {
    verdict = 'critical';
    criticalPath = '面料未齐 → 无法开裁 → 整单阻塞';
    pendingFabrics.forEach(r => {
      const gap = (Number(r.purchaseQuantity) || 0) - (Number(r.arrivedQuantity) || 0);
      risks.push(`面料「${r.materialName}」缺 ${gap} ${r.unit || ''}（${r.supplierName || '未指定供应商'}）`);
    });
    suggestions.push('🔥 面料是裁剪必要条件，建议立即催促面料供应商优先发货');
    if (pendingFabrics.length >= 2) {
      suggestions.push('多种面料同时缺货，考虑协调供应商合并发货降低物流成本');
    }
  } else if (fabricsReady) {
    if (pendingLinings.length > 0 || pendingAccessories.length > 0) {
      verdict = 'warn';
      criticalPath = '面料已齐可开裁，里料/辅料还在途';
      suggestions.push('✂️ 面料已到齐，建议先安排裁剪开工，辅料可边生产边等');
      const pendingNames = [...pendingLinings, ...pendingAccessories].slice(0, 3).map(r => r.materialName);
      if (pendingNames.length > 0) {
        suggestions.push(`待到物料：${pendingNames.join('、')}${[...pendingLinings, ...pendingAccessories].length > 3 ? ' 等' : ''}`);
      }
    } else {
      criticalPath = '全部到齐 ✅';
    }
  } else if (fabrics.length === 0 && orderRecs.length > 0) {
    // 没有面料记录（可能是辅料单独采购）
    const pendingAll = orderRecs.filter(r => !isFullyArrived(r));
    if (pendingAll.length > 0) {
      verdict = 'warn';
      criticalPath = `${pendingAll.length} 种物料待到`;
    } else {
      criticalPath = '全部到齐 ✅';
    }
  }

  // ── 供应商维度分析 ──
  const bySupplier = new Map<string, { total: number; arrived: number; pending: string[] }>();
  orderRecs.forEach(r => {
    const supplier = r.supplierName || '未指定';
    const prev = bySupplier.get(supplier) ?? { total: 0, arrived: 0, pending: [] };
    prev.total++;
    if (isFullyArrived(r)) {
      prev.arrived++;
    } else {
      prev.pending.push(r.materialName);
    }
    bySupplier.set(supplier, prev);
  });

  bySupplier.forEach((v, supplier) => {
    if (v.pending.length > 0) {
      supplierIssues.push(`${supplier}：${v.pending.length}/${v.total} 种未到（${v.pending.slice(0, 2).join('、')}${v.pending.length > 2 ? '等' : ''}）`);
    }
  });

  // ── 超期检测 ──
  const now = new Date();
  const overdue = orderRecs.filter(r => {
    if (isFullyArrived(r)) return false;
    const expected = r.expectedArrivalDate || r.expectedShipDate;
    if (!expected) return false;
    return new Date(expected) < now;
  });
  if (overdue.length > 0) {
    overdue.forEach(r => {
      const expected = r.expectedArrivalDate || r.expectedShipDate;
      const days = Math.ceil((now.getTime() - new Date(expected!).getTime()) / 86400000);
      risks.push(`「${r.materialName}」超期 ${days} 天（${r.supplierName || ''}）`);
    });
    suggestions.push(`${overdue.length} 种物料已超预期到货日，建议立即联系供应商确认发货状态`);
    if (verdict === 'good') verdict = 'warn';
  }

  // ── 长期未处理检测 ──
  const longPending = orderRecs.filter(r => {
    if (r.status !== 'pending' || !r.createTime) return false;
    return (now.getTime() - new Date(r.createTime).getTime()) > 7 * 86400000;
  });
  if (longPending.length > 0) {
    const days = Math.ceil((now.getTime() - new Date(longPending[0].createTime!).getTime()) / 86400000);
    risks.push(`${longPending.length} 项采购单创建 ${days} 天仍未处理`);
    suggestions.push('长期未处理采购单建议尽快安排采购或确认是否取消');
    if (verdict === 'good') verdict = 'warn';
  }

  // ── 预计影响 ──
  const pendingAll = orderRecs.filter(r => !isFullyArrived(r));
  if (pendingAll.length > 0 && !canStartCutting) {
    impact.push(`${pendingAll.length} 种物料未到，裁剪无法启动`);
    const orderQty = orderRecs[0]?.orderQuantity || 0;
    if (orderQty > 0) impact.push(`直接影响 ${orderQty} 件订单的生产进度`);
  } else if (pendingAll.length > 0 && canStartCutting) {
    impact.push(`可先开裁，${pendingAll.length} 种辅料/里料待到不阻塞主流程`);
  } else if (pendingAll.length === 0) {
    impact.push('全部物料到齐，生产无阻塞');
  }

  if (totalCost > 0) {
    const costRate = Math.round(arrivedCost / totalCost * 100);
    impact.push(`采购总额 ¥${totalCost.toFixed(0)}，已到货占 ${costRate}%`);
  }

  // ── 正面反馈 ──
  if (verdict === 'good' && pendingAll.length === 0 && orderRecs.length > 0) {
    suggestions.push('所有物料已备齐，建议尽快安排裁剪和生产排期');
  }

  return {
    totalMaterials: orderRecs.length, arrivalRate: rate, totalCost, arrivedCost,
    canStartCutting, criticalPath, risks, suggestions, supplierIssues, impact, verdict,
  };
}

const VERDICT_COLOR = { good: '#52c41a', warn: '#fa8c16', critical: '#ff4d4f' } as const;
const VERDICT_LABEL = { good: '可开工', warn: '需关注', critical: '阻塞中' } as const;

/** 渲染智能分析 Tooltip 内容 */
export function renderPurchaseTooltip(insight: PurchaseInsight, orderNo: string): React.ReactNode {
  return (
    <div style={{ fontSize: 12, maxWidth: 360, lineHeight: 1.7 }}>
      {/* 标题 + 状态 */}
      <div style={{ fontWeight: 600, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
        <span>🤖 智能采购分析</span>
        <span style={{
          fontSize: 10, padding: '1px 6px', borderRadius: 4,
          background: VERDICT_COLOR[insight.verdict], color: '#fff',
        }}>{VERDICT_LABEL[insight.verdict]}</span>
      </div>

      {/* 核心数据 */}
      <div style={{ marginBottom: 6, padding: '4px 8px', background: 'rgba(255,255,255,0.08)', borderRadius: 4 }}>
        {insight.totalMaterials} 种物料 · 到货率 {insight.arrivalRate}%
        {insight.canStartCutting ? ' · ✂️ 可开裁' : ' · 🚫 不可开裁'}
      </div>

      {/* 关键路径 */}
      {insight.criticalPath && (
        <div style={{ marginBottom: 6, fontWeight: 500 }}>
          🎯 {insight.criticalPath}
        </div>
      )}

      {/* 风险 */}
      {insight.risks.length > 0 && (
        <div style={{ marginBottom: 6 }}>
          {insight.risks.map((r, i) => (
            <div key={`r${i}`} style={{ color: '#ff7875' }}>⚠ {r}</div>
          ))}
        </div>
      )}

      {/* 供应商情况 */}
      {insight.supplierIssues.length > 0 && (
        <div style={{ marginBottom: 6 }}>
          {insight.supplierIssues.map((s, i) => (
            <div key={`sp${i}`} style={{ color: '#d9d9d9' }}>🏭 {s}</div>
          ))}
        </div>
      )}

      {/* 预计影响 */}
      {insight.impact.length > 0 && (
        <div style={{ marginBottom: 6 }}>
          {insight.impact.map((line, i) => (
            <div key={`i${i}`} style={{ color: '#69b1ff' }}>📈 {line}</div>
          ))}
        </div>
      )}

      {/* 建议 */}
      {insight.suggestions.length > 0 && (
        <div>
          {insight.suggestions.map((s, i) => (
            <div key={`s${i}`} style={{ color: '#95de64' }}>💡 {s}</div>
          ))}
        </div>
      )}
    </div>
  );
}
