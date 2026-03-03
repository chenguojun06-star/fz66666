/**
 * 质检入库智能分析 — 从原始数据中挖掘风险、瓶颈、建议
 *
 * 不是傻白甜地堆数字，而是：
 * 1. 🔴 风险预判 — 质量异常在哪个尺码/颜色？对出货的影响？
 * 2. ⚡ 瓶颈识别 — 质检卡住了哪些件？裁剪与质检的进度差？
 * 3. 💡 行动建议 — 该查工艺？催质检？补裁？
 * 4. 📈 预计影响 — 按当前趋势，最终能入库多少件？
 */
import React from 'react';
import { ProductWarehousing as WarehousingType } from '@/types/production';

export interface QualityInsight {
  passRate: number;
  processed: number;
  totalQ: number;
  totalUQ: number;
  totalW: number;
  totalCut: number;
  risks: string[];
  suggestions: string[];
  impact: string[];
  verdict: 'good' | 'warn' | 'critical';
}

/** 从同一订单的质检记录中提取智能洞察 */
export function analyzeQuality(orderRecs: WarehousingType[], isUrgent: boolean): QualityInsight {
  const totalQ  = orderRecs.reduce((s, r) => s + (Number(r.qualifiedQuantity) || 0), 0);
  const totalUQ = orderRecs.reduce((s, r) => s + (Number(r.unqualifiedQuantity) || 0), 0);
  const totalW  = orderRecs.reduce((s, r) => s + (Number(r.warehousingQuantity) || 0), 0);
  // 按 cuttingBundleId 去重后累加，避免同一菲号被多条质检记录重复计入
  const seenBundles = new Set<string>();
  const totalCut = orderRecs.reduce((s, r) => {
    const bid = String(r.cuttingBundleId || '').trim();
    if (bid) {
      if (seenBundles.has(bid)) return s;
      seenBundles.add(bid);
    }
    return s + (Number(r.cuttingQuantity) || 0);
  }, 0);
  const processed = totalQ + totalUQ;
  const rate = processed > 0 ? Math.round(totalQ / processed * 100) : 0;

  const risks: string[] = [];
  const suggestions: string[] = [];
  const impact: string[] = [];
  let verdict: 'good' | 'warn' | 'critical' = 'good';

  // ── 尺码维度分析 ──
  const sizeMap = new Map<string, { q: number; uq: number }>();
  orderRecs.forEach(r => {
    const sz = String(r.size || '通码');
    const prev = sizeMap.get(sz) ?? { q: 0, uq: 0 };
    sizeMap.set(sz, {
      q: prev.q + (Number(r.qualifiedQuantity) || 0),
      uq: prev.uq + (Number(r.unqualifiedQuantity) || 0),
    });
  });
  const badSizes: { size: string; rate: number; count: number }[] = [];
  sizeMap.forEach((v, sz) => {
    const t = v.q + v.uq;
    if (t > 0 && v.uq > 0) badSizes.push({ size: sz, rate: Math.round(v.uq / t * 100), count: v.uq });
  });
  badSizes.sort((a, b) => b.rate - a.rate);

  // ── 颜色维度分析 ──
  const colorMap = new Map<string, { q: number; uq: number }>();
  orderRecs.forEach(r => {
    const c = String(r.color || '').trim();
    if (!c) return;
    const prev = colorMap.get(c) ?? { q: 0, uq: 0 };
    colorMap.set(c, {
      q: prev.q + (Number(r.qualifiedQuantity) || 0),
      uq: prev.uq + (Number(r.unqualifiedQuantity) || 0),
    });
  });
  const badColors: { color: string; rate: number }[] = [];
  colorMap.forEach((v, c) => {
    const t = v.q + v.uq;
    if (t > 0 && v.uq > 0) badColors.push({ color: c, rate: Math.round(v.uq / t * 100) });
  });
  badColors.sort((a, b) => b.rate - a.rate);

  // ── 综合风险判定 ──
  if (rate < 70 && processed > 0) {
    verdict = 'critical';
    risks.push(`合格率仅 ${rate}%，质量严重异常`);
    suggestions.push('建议暂停后续入库，立即排查生产工艺和面料品质');
  } else if (rate < 85 && processed > 0) {
    verdict = 'warn';
    risks.push(`合格率 ${rate}% 偏低，需重点关注`);
  }

  // ── 尺码集中问题 ──
  if (badSizes.length > 0 && badSizes[0].rate >= 25) {
    const worst = badSizes[0];
    risks.push(`${worst.size}码不合格率 ${worst.rate}%（${worst.count}件）— 可能裁剪版型偏差`);
    suggestions.push(`建议检查${worst.size}码的裁剪模板和缝制标准`);
    if (verdict === 'good') verdict = 'warn';
  }

  // ── 颜色集中问题 ──
  if (badColors.length > 0 && badColors[0].rate >= 20) {
    const worst = badColors[0];
    risks.push(`"${worst.color}" 不合格率最高 ${worst.rate}% — 可能存在染色/面料批次问题`);
    if (badColors.length >= 2) {
      suggestions.push(`优先检查"${worst.color}"面料来源，考虑更换供应商或面料批次`);
    }
  }

  // ── 裁剪 vs 质检进度差 ──
  if (totalCut > 0 && processed < totalCut * 0.5 && totalCut > 10) {
    const pending = totalCut - processed;
    risks.push(`裁剪已出 ${totalCut} 件，质检仅完成 ${processed} 件 — ${pending} 件积压`);
    suggestions.push('质检严重滞后于裁剪，建议增派质检人手或延长工时');
    if (verdict === 'good') verdict = 'warn';
  } else if (totalCut > 0 && processed < totalCut * 0.8 && totalCut > 10) {
    suggestions.push(`裁剪 ${totalCut} 件中已质检 ${processed} 件，还需加快质检节奏`);
  }

  // ── 缺码风险（影响齐码出货）──
  const zeroSizes = Array.from(sizeMap.entries())
    .filter(([, v]) => v.q === 0 && (v.q + v.uq) > 0)
    .map(([sz]) => sz);
  if (zeroSizes.length > 0) {
    risks.push(`${zeroSizes.join('、')}码无合格品 — 无法齐码出货`);
    suggestions.push(`${zeroSizes.join('、')}码需优先返修或补裁，否则整单出货受阻`);
    if (verdict === 'good') verdict = 'warn';
  }

  // ── 预计影响 ──
  if (totalCut > 0 && rate > 0 && processed > 5) {
    const estimatedFinal = Math.round(totalCut * rate / 100);
    impact.push(`按当前合格率 ${rate}%，预计最终可入库约 ${estimatedFinal} 件`);
    const shortfall = totalCut - estimatedFinal;
    if (shortfall > 0) {
      impact.push(`预计短缺 ${shortfall} 件，可能需要补裁或返修`);
    }
  }
  if (totalW > 0 && totalCut > 0) {
    const warehousingRate = Math.round(totalW / totalCut * 100);
    impact.push(`入库进度 ${warehousingRate}%（${totalW}/${totalCut}件）`);
  }

  // ── 急单特殊提示 ──
  if (isUrgent && verdict !== 'good') {
    suggestions.unshift('⚡ 急单！建议最高优先级安排质检和返修');
  }

  // ── 全部合格的正面反馈 ──
  if (processed > 0 && totalUQ === 0) {
    suggestions.push('质量表现优秀，可保持当前工艺标准');
  }

  return { passRate: rate, processed, totalQ, totalUQ, totalW, totalCut, risks, suggestions, impact, verdict };
}

const VERDICT_COLOR = { good: '#52c41a', warn: '#fa8c16', critical: '#ff4d4f' } as const;
const VERDICT_LABEL = { good: '质量良好', warn: '需关注', critical: '风险预警' } as const;

/** 渲染智能分析 Tooltip 内容 */
export function renderQualityTooltip(insight: QualityInsight, orderNo: string): React.ReactNode {
  return (
    <div style={{ fontSize: 12, maxWidth: 340, lineHeight: 1.7, color: '#333' }}>
      {/* 标题 + 状态标签 */}
      <div style={{ fontWeight: 600, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
        <span>🤖 智能质检分析</span>
        <span style={{
          fontSize: 10, padding: '1px 6px', borderRadius: 4,
          background: VERDICT_COLOR[insight.verdict], color: '#fff',
        }}>{VERDICT_LABEL[insight.verdict]}</span>
      </div>

      {/* 核心数据 */}
      <div style={{ marginBottom: 6, padding: '4px 8px', background: 'rgba(0,0,0,0.04)', borderRadius: 4, color: '#555' }}>
        质检 {insight.processed} 件 · 合格 {insight.totalQ} · 不合格 {insight.totalUQ} · 已入库 {insight.totalW}
        {insight.totalCut > 0 && ` · 裁剪 ${insight.totalCut}`}
      </div>

      {/* 风险 */}
      {insight.risks.length > 0 && (
        <div style={{ marginBottom: 6 }}>
          {insight.risks.map((r, i) => (
            <div key={`r${i}`} style={{ color: '#d4380d' }}>⚠ {r}</div>
          ))}
        </div>
      )}

      {/* 预计影响 */}
      {insight.impact.length > 0 && (
        <div style={{ marginBottom: 6 }}>
          {insight.impact.map((line, i) => (
            <div key={`i${i}`} style={{ color: '#1677ff' }}>📈 {line}</div>
          ))}
        </div>
      )}

      {/* 建议 */}
      {insight.suggestions.length > 0 && (
        <div>
          {insight.suggestions.map((s, i) => (
            <div key={`s${i}`} style={{ color: '#389e0d' }}>💡 {s}</div>
          ))}
        </div>
      )}
    </div>
  );
}
