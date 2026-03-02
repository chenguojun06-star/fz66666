/**
 * 生产进度智能分析 v1.0 (2026-03)
 *
 * 基于订单进度球数据做深层洞察：
 * 1. 🔍 瓶颈识别 — 哪个工序卡住了全链路？
 * 2. 👥 人员分析 — 各节点人员配置是否合理？
 * 3. 📊 资源建议 — 应该在哪里加人/减人？
 * 4. 📋 跟进要点 — 跟单员最该关注什么？
 * 5. ⚡ 风险预测 — 按当前趋势会出什么问题？
 */
import React from 'react';
import dayjs from 'dayjs';
import type { ProductionOrder } from '@/types/production';

/** 工序流水线顺序（越靠前越上游） */
const PIPELINE = ['采购', '裁剪', '二次工艺', '车缝', '尾部', '质检', '入库'] as const;

/** 各阶段的字段映射 */
const STAGE_FIELDS: Record<string, { rate: string; operator: string; start: string; end: string }> = {
  '采购': { rate: 'procurementCompletionRate', operator: 'procurementOperatorName', start: 'procurementStartTime', end: 'procurementEndTime' },
  '裁剪': { rate: 'cuttingCompletionRate',     operator: 'cuttingOperatorName',     start: 'cuttingStartTime',     end: 'cuttingEndTime' },
  '车缝': { rate: 'sewingCompletionRate',      operator: 'sewingOperatorName',      start: 'sewingStartTime',      end: 'sewingEndTime' },
  '质检': { rate: 'qualityCompletionRate',      operator: 'qualityOperatorName',     start: 'qualityStartTime',     end: 'qualityEndTime' },
  '入库': { rate: 'warehousingCompletionRate',  operator: 'warehousingOperatorName', start: 'warehousingStartTime', end: 'warehousingEndTime' },
};

export interface StageSnapshot {
  name: string;
  qty: number;
  pct: number;
  lastTime: string | null;
}

export interface ProgressInsight {
  bottleneck: { stage: string; reason: string; gap: number } | null;
  personnelNotes: string[];
  resourceSuggestions: string[];
  followUpPoints: string[];
  riskPredictions: string[];
  verdict: 'good' | 'warn' | 'critical';
}

/**
 * 核心分析函数 — 从订单 + boardStats/Times 中提取智能洞察
 */
export function analyzeProgress(
  order: ProductionOrder,
  stages: StageSnapshot[],
  boardTimes: Record<string, string>,
  speed: number,
): ProgressInsight {
  const now = dayjs();
  const total = Number(order.orderQuantity) || 0;
  const planEnd = order.plannedEndDate ? dayjs(order.plannedEndDate) : null;
  const daysLeft = planEnd ? planEnd.diff(now, 'day') : null;
  const prog = Number(order.productionProgress) || 0;
  const isUrgent = order.urgencyLevel === 'urgent';
  const o = order as Record<string, unknown>;

  const personnelNotes: string[] = [];
  const resourceSuggestions: string[] = [];
  const followUpPoints: string[] = [];
  const riskPredictions: string[] = [];
  let verdict: 'good' | 'warn' | 'critical' = 'good';
  let bottleneck: ProgressInsight['bottleneck'] = null;

  // ── 1. 构建工序快照（按流水线顺序） ──
  const pipelineStages = PIPELINE.map(name => {
    const found = stages.find(s => s.name === name);
    const qty = found?.qty ?? 0;
    const pct = found?.pct ?? 0;
    const lastTime = found?.lastTime ?? null;
    return { name, qty, pct, lastTime };
  }).filter(s => {
    // 只分析有数据或者有字段定义的工序
    return s.qty > 0 || s.pct > 0 || STAGE_FIELDS[s.name];
  });

  // ── 2. 瓶颈检测（流水线中进度落差最大的环节） ──
  let maxGap = 0;
  let bnStage = '';
  let bnReason = '';
  for (let i = 1; i < pipelineStages.length; i++) {
    const upstream = pipelineStages[i - 1];
    const current = pipelineStages[i];
    if (upstream.pct <= 0) continue; // 上游没开始，不算瓶颈
    const gap = upstream.pct - current.pct;
    if (gap > maxGap && gap >= 20) {
      maxGap = gap;
      bnStage = current.name;
      bnReason = `${upstream.name} ${upstream.pct}% → ${current.name} ${current.pct}%，落差 ${gap}%`;
    }
  }
  if (bnStage) {
    bottleneck = { stage: bnStage, reason: bnReason, gap: maxGap };
    if (maxGap >= 50) verdict = 'critical';
    else if (maxGap >= 30) verdict = 'warn';
  }

  // ── 3. 人员分析 ──
  const operators = new Map<string, string[]>(); // operatorName → stages[]
  for (const [stage, fields] of Object.entries(STAGE_FIELDS)) {
    const opName = String(o[fields.operator] || '').trim();
    if (!opName) {
      // 该阶段有进度但无操作人，标记
      const stageData = pipelineStages.find(s => s.name === stage);
      if (stageData && stageData.pct > 0 && stageData.pct < 100) {
        personnelNotes.push(`${stage}进行中但未记录操作人员`);
      }
      continue;
    }
    const prev = operators.get(opName) ?? [];
    prev.push(stage);
    operators.set(opName, prev);
  }

  // 同一人员负责多阶段 → 可能是产能瓶颈
  operators.forEach((stageList, name) => {
    if (stageList.length >= 3) {
      personnelNotes.push(`"${name}" 同时负责 ${stageList.join('/')}（${stageList.length}个环节），工作量可能过重`);
      if (verdict === 'good') verdict = 'warn';
    } else if (stageList.length === 2) {
      personnelNotes.push(`"${name}" 负责 ${stageList.join('+')}（可能需要协调优先级）`);
    }
  });

  // 人员覆盖率
  const activeStages = pipelineStages.filter(s => s.pct > 0 && s.pct < 100);
  const coveredStages = activeStages.filter(s => {
    const f = STAGE_FIELDS[s.name];
    return f && String(o[f.operator] || '').trim();
  });
  if (activeStages.length > 0 && coveredStages.length === 0) {
    personnelNotes.push('当前所有进行中环节均无操作人员记录');
  }

  // ── 4. 资源建议 ──
  if (bottleneck) {
    resourceSuggestions.push(`${bottleneck.stage} 是当前瓶颈 — 建议优先增派人手或延长该工序工时`);

    // 上游是否可以减人？
    const upIdx = PIPELINE.indexOf(bottleneck.stage as any) - 1;
    if (upIdx >= 0) {
      const upStage = pipelineStages.find(s => s.name === PIPELINE[upIdx]);
      if (upStage && upStage.pct >= 90) {
        resourceSuggestions.push(`${upStage.name} 已近完工(${upStage.pct}%)，可将人力调配至 ${bottleneck.stage}`);
      }
    }
  }

  // 速度不足判断
  if (daysLeft !== null && daysLeft > 0 && speed > 0 && total > 0) {
    const remaining = total - Math.round(prog / 100 * total);
    const neededSpeed = remaining / daysLeft;
    if (neededSpeed > speed * 1.5) {
      resourceSuggestions.push(`当前速度 ${speed.toFixed(1)} 件/天，交期需要 ${neededSpeed.toFixed(1)} 件/天 — 缺口 ${Math.round((neededSpeed - speed) / speed * 100)}%`);
      if (verdict === 'good') verdict = 'warn';
    }
  }

  // ── 5. 跟进要点 ──
  // 未开工的上游工序
  const notStarted = pipelineStages.filter(s => s.pct === 0 && s.qty === 0);
  if (notStarted.length > 0 && pipelineStages.some(s => s.pct > 0)) {
    followUpPoints.push(`${notStarted.map(s => s.name).join('/')} 尚未开始 — 确认前序是否完成`);
  }

  // 长时间无扫码的节点
  const staleNodes = pipelineStages.filter(s => {
    if (s.pct >= 100 || s.pct === 0) return false;
    const t = boardTimes[s.name];
    return t && now.diff(dayjs(t), 'day') >= 2;
  });
  if (staleNodes.length > 0) {
    staleNodes.forEach(s => {
      const days = now.diff(dayjs(boardTimes[s.name]), 'day');
      followUpPoints.push(`${s.name} 已 ${days} 天无新扫码（${s.pct}%），需确认是否停工`);
    });
  }

  // 急单额外关注
  if (isUrgent && prog < 80) {
    followUpPoints.push('⚡ 急单！总进度不足80%，建议每日跟进');
  }

  // ── 6. 风险预测 ──
  // 交期风险
  if (daysLeft !== null) {
    if (daysLeft < 0) {
      riskPredictions.push(`已逾期 ${-daysLeft} 天，需立即制定补救计划`);
      verdict = 'critical';
    } else if (daysLeft <= 3 && prog < 70) {
      riskPredictions.push(`3天内交货但进度仅 ${prog}%，极大可能逾期`);
      verdict = 'critical';
    } else if (daysLeft <= 7 && prog < 50) {
      riskPredictions.push(`7天内交货但进度仅 ${prog}%，逾期风险较高`);
      if (verdict === 'good') verdict = 'warn';
    }
  }

  // 质量连锁风险
  if (bottleneck && bottleneck.gap >= 40 && daysLeft !== null && daysLeft <= 7) {
    riskPredictions.push(`${bottleneck.stage} 严重滞后且交期临近 — 赶工可能导致质量下降`);
  }

  // 首单风险
  if (order.plateType === 'FIRST' && prog < 30 && daysLeft !== null && daysLeft <= 14) {
    riskPredictions.push('首翻单工艺磨合期，进度偏慢属正常但仍需密切关注');
  }

  // 全链路顺畅正面反馈
  if (verdict === 'good' && prog > 0 && pipelineStages.every(s => s.pct === 0 || s.pct >= 50)) {
    riskPredictions.push('各环节推进均衡，按当前节奏可正常交付');
  }

  return { bottleneck, personnelNotes, resourceSuggestions, followUpPoints, riskPredictions, verdict };
}

const V_COLOR = { good: '#52c41a', warn: '#fa8c16', critical: '#ff4d4f' } as const;
const V_LABEL = { good: '进展良好', warn: '需关注', critical: '风险预警' } as const;

/** 渲染智能分析区块（嵌入 SmartOrderHoverCard 底部） */
export function renderProgressInsight(insight: ProgressInsight): React.ReactNode | null {
  const { bottleneck, personnelNotes, resourceSuggestions, followUpPoints, riskPredictions, verdict } = insight;
  const hasContent = bottleneck || personnelNotes.length || resourceSuggestions.length
    || followUpPoints.length || riskPredictions.length;
  if (!hasContent) return null;

  return (
    <div style={{ borderTop: '1px dashed #e8e8e8', marginTop: 6, paddingTop: 6, fontSize: 11, lineHeight: 1.6 }}>
      {/* 标题 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 4, fontWeight: 600 }}>
        <span>🤖 智能分析</span>
        <span style={{
          fontSize: 9, padding: '0 5px', borderRadius: 3,
          background: V_COLOR[verdict], color: '#fff',
        }}>{V_LABEL[verdict]}</span>
      </div>

      {/* 瓶颈 */}
      {bottleneck && (
        <div style={{ color: '#ff7875', marginBottom: 3 }}>
          🔍 <b>瓶颈</b>：{bottleneck.stage} — {bottleneck.reason}
        </div>
      )}

      {/* 人员分析 */}
      {personnelNotes.length > 0 && personnelNotes.map((n, i) => (
        <div key={`p${i}`} style={{ color: '#d4b106' }}>👥 {n}</div>
      ))}

      {/* 资源建议 */}
      {resourceSuggestions.length > 0 && resourceSuggestions.map((s, i) => (
        <div key={`rs${i}`} style={{ color: '#69b1ff' }}>📊 {s}</div>
      ))}

      {/* 跟进要点 */}
      {followUpPoints.length > 0 && followUpPoints.map((f, i) => (
        <div key={`f${i}`} style={{ color: '#b37feb' }}>📋 {f}</div>
      ))}

      {/* 风险预测 */}
      {riskPredictions.length > 0 && riskPredictions.map((r, i) => (
        <div key={`rp${i}`} style={{ color: verdict === 'good' ? '#95de64' : '#ff7875' }}>⚡ {r}</div>
      ))}
    </div>
  );
}
