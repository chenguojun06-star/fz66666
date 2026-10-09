/**
 * 物料采购智能分析 — 从采购数据中挖掘关键路径、供应商风险、裁剪可行性
 *
 * 分析维度：
 * 1.  关键路径 — 面料是裁剪前提，面料没到=整单卡死
 * 2.  供应商维度 — 谁快谁慢？谁超期？该催谁？
 * 3.  裁剪可行性 — 能不能先开裁？辅料能不能后补？
 * 4.  行动建议 — 具体该催谁、做什么、优先级
 * 5.  预计影响 — 对生产进度和成本的影响
 */
import React from 'react';
import { MaterialPurchase as MaterialPurchaseType } from '@/types/production';
import { getMaterialTypeCategory } from '@/utils/materialType';
import { formatMaterialQuantity, normalizeMaterialQuantity } from './index';

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

/**
 * D-513：到齐判定引入「容差」。
 *
 * <p>布料按米计量，短码/多送属行业常态 —— 预采购 353.5 米、实际到货 353 米（缺 0.5 米）
 * 不该被判成"主料未到、无法开裁"。
 *
 * <p>修复前是 `到货量 >= 预采购数` 的**精确比较**：缺 0.001 米也阻塞。
 * 而「到货率」又用 `Math.round`（99.86% → 100%），于是同一个卡片出现
 * 「到货率 100%」+「阻塞中 · 主料未到」的自相矛盾，用户完全看不懂。
 *
 * <p>现在统一口径：**缺口在容差内即视为到齐**。
 * <ul>
 *   <li>容差 = max(绝对下限 1，预采购数 × 3%)</li>
 *   <li>353.5 米 → 容差 10.6 米（覆盖常见短码范围）</li>
 *   <li>1.5 米 → 容差 1 米</li>
 *   <li>多送（到货 &gt; 预采购）一直算到齐</li>
 * </ul>
 */
const ARRIVAL_TOLERANCE_ABS = 1;
const ARRIVAL_TOLERANCE_RATIO = 0.03;

/** 该采购单允许的到货缺口（正负差异都视为正常） */
export const arrivalTolerance = (planned: number) =>
  Math.max(ARRIVAL_TOLERANCE_ABS, planned * ARRIVAL_TOLERANCE_RATIO);

/** 判断单条记录是否已到齐（含容差） */
const isFullyArrived = (r: MaterialPurchaseType) => {
  const p = normalizeMaterialQuantity(r.purchaseQuantity);
  const a = normalizeMaterialQuantity(r.arrivedQuantity);
  if (p <= 0) return false;
  if (a >= p) return true;                        // 到齐或多送
  return (p - a) <= arrivalTolerance(p);          // 缺口在容差内
};

/** 缺口（仅用于展示；容差内不再算作"缺料"） */
const realGap = (r: MaterialPurchaseType) => {
  const p = normalizeMaterialQuantity(r.purchaseQuantity);
  const a = normalizeMaterialQuantity(r.arrivedQuantity);
  const gap = p - a;
  return gap > arrivalTolerance(p) ? gap : 0;
};

/** 从同一订单的采购记录中提取智能洞察 */
export function analyzePurchase(orderRecs: MaterialPurchaseType[]): PurchaseInsight {
  const totalP = orderRecs.reduce((s, r) => s + normalizeMaterialQuantity(r.purchaseQuantity), 0);
  const totalA = orderRecs.reduce((s, r) => s + normalizeMaterialQuantity(r.arrivedQuantity), 0);
  /*
   * D-513：到货率与「到齐判定」必须同一口径。
   * 修复前：率用 Math.round（353/353.5 = 99.86% → 显示 100%），
   * 判定用精确比较（353 < 353.5 → 未到齐）→ 卡片同时出现「100%」与「阻塞中」，自相矛盾。
   * 现在：只有真正到齐才显示 100%，否则向下取整并封顶 99%。
   */
  const allArrived = orderRecs.length > 0 && orderRecs.every(isFullyArrived);
  const rawRate = totalP > 0 ? (totalA / totalP) * 100 : 0;
  const rate = allArrived ? 100 : Math.min(99, Math.floor(rawRate));

  // 成本分析
  // totalCost = 采购计划金额（分母，用后端 totalAmount = 采购量×单价）
  const totalCost = orderRecs.reduce((s, r) => s + (Number(r.totalAmount) || 0), 0);
  // D-410：已到货金额必须按「实际到货数量 × 单价」逐条累加。
  // 此前只统计"已到齐"的订单（filter isFullyArrived），导致部分到货的采购单金额完全不计入，
  // "已到货 xx%" 明显偏低（例如 1.32 米到了 1 米，此前记 0）。
  const arrivedCost = orderRecs.reduce(
    (s, r) => s + normalizeMaterialQuantity(r.arrivedQuantity) * (Number(r.unitPrice) || 0), 0);

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
    criticalPath = '主料未到，无法开裁';
    pendingFabrics.forEach(r => {
      const gap = realGap(r);
      if (gap <= 0) return;   // 容差内的差异不算缺料
      risks.push(`${r.materialName} 缺 ${formatMaterialQuantity(gap)}${r.unit || ''}（${r.supplierName || '未分配'}）`);
    });
    suggestions.push('立即催面料供应商发货');
    if (pendingFabrics.length >= 2) {
      suggestions.push('多种主料缺货，建议启动备选供应商');
    }
  } else if (fabricsReady) {
    if (pendingLinings.length > 0 || pendingAccessories.length > 0) {
      verdict = 'warn';
      criticalPath = '面料已到，可先开裁';
      suggestions.push('面料到齐，建议先开裁，辅料车缝前补齐即可');
      const pendingNames = [...pendingLinings, ...pendingAccessories].slice(0, 3).map(r => r.materialName);
      if (pendingNames.length > 0) {
        suggestions.push(`待到：${pendingNames.join('、')}${[...pendingLinings, ...pendingAccessories].length > 3 ? '等' : ''}`);
      }
    } else {
      criticalPath = '全部到齐 ';
    }
  } else if (fabrics.length === 0 && orderRecs.length > 0) {
    // 没有面料记录（可能是辅料单独采购）
    const pendingAll = orderRecs.filter(r => !isFullyArrived(r));
    if (pendingAll.length > 0) {
      verdict = 'warn';
      criticalPath = `${pendingAll.length} 种物料未到`;
    } else {
      criticalPath = '全部到齐 ';
    }
  }

  // ── 容差说明：差异在容差内的不阻塞，但要让用户知道"这个差异被容忍了"，
  //    否则用户看到「到货 353 / 预采购 353.5」会以为系统算错了 ──
  const tolerated = orderRecs.filter(r => {
    const p = normalizeMaterialQuantity(r.purchaseQuantity);
    const a = normalizeMaterialQuantity(r.arrivedQuantity);
    return p > 0 && a < p && (p - a) <= arrivalTolerance(p);
  });
  if (tolerated.length > 0) {
    const names = tolerated.slice(0, 3).map(r => r.materialName).join('、');
    suggestions.push(`差异在容差内（±3%）视为已到齐：${names}${tolerated.length > 3 ? '等' : ''}`);
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
      risks.push(`${r.materialName} 超期 ${days} 天（${r.supplierName || ''}）`);
    });
    suggestions.push(`${overdue.length} 种物料超期，立即催货`);
    if (verdict === 'good') verdict = 'warn';
  }

  // ── 长期未处理检测 ──
  const longPending = orderRecs.filter(r => {
    if (r.status !== 'pending' || !r.createTime) return false;
    return (now.getTime() - new Date(r.createTime).getTime()) > 7 * 86400000;
  });
  if (longPending.length > 0) {
    const days = Math.ceil((now.getTime() - new Date(longPending[0].createTime!).getTime()) / 86400000);
    risks.push(`${longPending.length} 份采购单已挂起 ${days} 天`);
    suggestions.push('请核实挂起采购单状态，确认是否继续或作废');
    if (verdict === 'good') verdict = 'warn';
  }

  // ── 预计影响 ──
  const pendingAll = orderRecs.filter(r => !isFullyArrived(r));
  if (pendingAll.length > 0 && !canStartCutting) {
    impact.push(`${pendingAll.length} 种物料未到，裁剪无法开始`);
    const orderQty = orderRecs[0]?.orderQuantity || 0;
    if (orderQty > 0) impact.push(`影响 ${orderQty} 件成衣生产`);
  } else if (pendingAll.length > 0 && canStartCutting) {
    impact.push(`${pendingAll.length} 种辅料未到，不影响开裁`);
  } else if (pendingAll.length === 0) {
    impact.push('物料齐全，可正常生产');
  }

  if (totalCost > 0) {
    const costRate = Math.round(arrivedCost / totalCost * 100);
    impact.push(`已到货 ${costRate}%（¥${arrivedCost.toFixed(0)} / ¥${totalCost.toFixed(0)}）`);
  }

  // ── 正面反馈 ──
  if (verdict === 'good' && pendingAll.length === 0 && orderRecs.length > 0) {
    suggestions.push('物料齐全，可安排车缝排期');
  }

  return {
    totalMaterials: orderRecs.length, arrivalRate: rate, totalCost, arrivedCost,
    canStartCutting, criticalPath, risks, suggestions, supplierIssues, impact, verdict,
  };
}

const VERDICT_COLOR = { good: 'var(--color-success)', warn: 'var(--color-warning)', critical: 'var(--color-danger)' } as const;
const VERDICT_LABEL = { good: '可开工', warn: '需关注', critical: '阻塞中' } as const;

/** 渲染智能分析 Tooltip 内容 */
export function renderPurchaseTooltip(insight: PurchaseInsight, _orderNo: string): React.ReactNode {
  return (
    <div className="u-fs-14" style={{ maxWidth: 360, lineHeight: 1.7, color: 'var(--color-text-primary)' }}>
      {/* 标题 + 状态 */}
      <div className="u-fw-600 u-mb-6 u-d-flex u-ai-center u-gap-6">
        <span> 智能采购分析</span>
        <span style={{
          fontSize: 15, padding: '1px 6px', borderRadius: 4,
          background: VERDICT_COLOR[insight.verdict], color: 'var(--color-bg-base)',
        }}>{VERDICT_LABEL[insight.verdict]}</span>
      </div>

      {/* 核心数据 */}
      <div className="u-mb-6 u-br-4" style={{ padding: '4px 8px', background: 'rgba(0,0,0,0.04)', color: 'var(--color-text-secondary)' }}>
        {insight.totalMaterials} 种物料 · 到货率 {insight.arrivalRate}%
        {insight.canStartCutting ? ' ·  可开裁' : ' ·  不可开裁'}
      </div>

      {/* 关键路径 */}
      {insight.criticalPath && (
        <div className="u-mb-6 u-fw-500" style={{ color: 'var(--color-text-primary)' }}>
           {insight.criticalPath}
        </div>
      )}

      {/* 风险 */}
      {insight.risks.length > 0 && (
        <div className="u-mb-6">
          {insight.risks.map((r, i) => (
            <div key={`r${i}`} style={{ color: 'var(--color-orange-700)' }}> {r}</div>
          ))}
        </div>
      )}

      {/* 供应商情况 */}
      {insight.supplierIssues.length > 0 && (
        <div className="u-mb-6">
          {insight.supplierIssues.map((s, i) => (
            <div key={`sp${i}`} style={{ color: 'var(--color-gray-700)' }}> {s}</div>
          ))}
        </div>
      )}

      {/* 预计影响 */}
      {insight.impact.length > 0 && (
        <div className="u-mb-6">
          {insight.impact.map((line, i) => (
            <div key={`i${i}`} style={{ color: 'var(--color-primary)' }}> {line}</div>
          ))}
        </div>
      )}

      {/* 建议 */}
      {insight.suggestions.length > 0 && (
        <div>
          {insight.suggestions.map((s, i) => (
            <div key={`s${i}`} style={{ color: 'var(--color-success)' }}> {s}</div>
          ))}
        </div>
      )}
    </div>
  );
}
