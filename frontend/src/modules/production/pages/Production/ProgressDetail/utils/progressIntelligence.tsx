/**
 * 生产进度智能分析 v2.0 (2026-03)
 *
 * ★ 全动态：不硬编码任何节点名称，完全基于传入的 stages 数组分析
 *   工厂自定义工序（如 烫衣/包装/贴标/水洗 等）同样被分析
 *
 * 1. 🔍 瓶颈识别 — 相邻工序进度落差最大的环节
 * 2. 👥 人员分析 — 各节点人员配置是否合理（已知字段 + 动态推断）
 * 3. 📊 资源建议 — 应该在哪里加人/减人？
 * 4. 📋 跟进要点 — 跟单员最该关注什么？
 * 5. ⚡ 风险预测 — 按当前趋势会出什么问题？
 */
import React from 'react';
import dayjs from 'dayjs';
import type { ProductionOrder } from '@/types/production';
import DecisionInsightCard from '@/components/common/DecisionInsightCard';

/**
 * 已知阶段→订单字段映射（best-effort 人员查询）
 * 没在此表中的自定义节点会被安全跳过，不影响其他分析维度
 */
const KNOWN_OPERATOR_FIELDS: Record<string, string> = {
  '采购': 'procurementOperatorName',
  '裁剪': 'cuttingOperatorName',
  '车缝': 'sewingOperatorName',
  '质检': 'qualityOperatorName',
  '入库': 'warehousingOperatorName',
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
 * 核心分析函数 — 完全动态，基于传入的 stages 数组做智能洞察
 *
 * @param stages 已按流水线顺序排列的工序快照（由 SmartOrderHoverCard 动态构建）
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

  // ── 直接使用传入的动态 stages（已排序），过滤掉无数据节点 ──
  const activeStages = stages.filter(s => s.qty > 0 || s.pct > 0);
  // 全量节点（含未开始的），用于跟进分析
  const allStages = stages;

  // ── 1. 瓶颈检测（相邻工序进度落差最大的环节，完全动态） ──
  let maxGap = 0;
  let bnStage = '';
  let bnReason = '';
  for (let i = 1; i < allStages.length; i++) {
    const upstream = allStages[i - 1];
    const current = allStages[i];
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

  // ── 2. 人员分析（best-effort：已知字段查 + 动态节点标记） ──
  const operators = new Map<string, string[]>(); // operatorName → stages[]

  for (const s of allStages) {
    const fieldName = KNOWN_OPERATOR_FIELDS[s.name];
    if (!fieldName) {
      // 自定义工序无对应字段 — 不报缺人（因为本身无法查到）
      continue;
    }
    const opName = String(o[fieldName] || '').trim();
    if (!opName) {
      if (s.pct > 0 && s.pct < 100) {
        personnelNotes.push(`${s.name} 进行中但未记录操作人员`);
      }
      continue;
    }
    const prev = operators.get(opName) ?? [];
    prev.push(s.name);
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

  // 进行中工序的人员覆盖率（仅统计有对应字段的工序）
  const inProgressStages = allStages.filter(s => s.pct > 0 && s.pct < 100);
  const checkableInProgress = inProgressStages.filter(s => KNOWN_OPERATOR_FIELDS[s.name]);
  const coveredCount = checkableInProgress.filter(s => {
    const f = KNOWN_OPERATOR_FIELDS[s.name];
    return f && String(o[f] || '').trim();
  }).length;
  if (checkableInProgress.length > 0 && coveredCount === 0) {
    personnelNotes.push('当前所有进行中环节均无操作人员记录');
  }

  // ── 3. 资源建议（动态定位瓶颈上下游） ──
  if (bottleneck) {
    resourceSuggestions.push(`${bottleneck.stage} 是当前严重卡点 — 建议优先增派该道工序的人手或安排突击加班。`);

    // 动态查找瓶颈的上游节点
    const bnIdx = allStages.findIndex(s => s.name === bottleneck!.stage);
    if (bnIdx > 0) {
      const upStage = allStages[bnIdx - 1];
      if (upStage.pct >= 90) {
        resourceSuggestions.push(`上游前道工序 [${upStage.name}] 已近完工(${upStage.pct}%)，若车间实行柔性生产，可立即抽出该组人手支援 ${bottleneck.stage} 环节。`);
      }
    }
  }

  // 速度不足判断 (产能监控)
  if (daysLeft !== null && daysLeft > 0 && speed > 0 && total > 0) {
    const remaining = total - Math.round(prog / 100 * total);
    const neededSpeed = remaining / daysLeft;
    if (neededSpeed > speed * 1.5) {
      resourceSuggestions.push(`当前产能 ${speed.toFixed(1)} 件/天 无法满足交期目标(需 ${neededSpeed.toFixed(1)} 件/天) — 产能缺口 ${Math.round((neededSpeed - speed) / speed * 100)}%，建议及早安排转厂外发或延长开机工时。`);
      if (verdict === 'good') verdict = 'warn';
    }
  }

  // ── 4. 跟进要点（完全动态） ──
  // 未开工的工序（在有活跃工序的情况下）
  // ★ 智能推断：若某工序的下游已有进度，说明该工序已完成（可能无扫码记录），不应报"尚未开始"
  //   例：入库 25% → 采购必然已完成，即使 procurementCompletionRate=0 也不报
  const notStarted = allStages.filter((s, idx) => {
    if (s.pct > 0 || s.qty > 0) return false;
    const hasDownstreamProgress = allStages.slice(idx + 1).some(d => d.pct > 0 || d.qty > 0);
    return !hasDownstreamProgress; // 下游有进度 → 上游已完成，跳过
  });
  if (notStarted.length > 0 && activeStages.length > 0) {
    followUpPoints.push(`${notStarted.map(s => s.name).join('/')} 尚未开始 — 确认前序是否完成`);
  }

  // 长时间无扫码的节点（动态遍历所有节点）
  let maxStagnantDays = 0;
  let stagnantStage = '';
  for (const s of allStages) {
    if (s.pct >= 100 || s.pct === 0) continue;
    const t = boardTimes[s.name];
    if (!t) continue;
    const days = now.diff(dayjs(t), 'day');
    if (days >= 2) {
      followUpPoints.push(`${s.name} 已 ${days} 天无新扫码（${s.pct}%），需确认是否停工`);
      if (days > maxStagnantDays) {
        maxStagnantDays = days;
        stagnantStage = s.name;
      }
    }
  }

  // 急单额外关注
  if (isUrgent && prog < 80) {
    followUpPoints.push('⚡ 急单！总进度不足80%，建议每日跟进');
  }

  // ── 5. 风险预测 ──
  // 交期风险（结合实际情况组合智能化建议）
  if (daysLeft !== null) {
    if (daysLeft < 0) {
      verdict = 'critical';
      let msg = `已逾期 ${-daysLeft} 天 (总进度 ${prog}%)`;
      if (stagnantStage && maxStagnantDays >= 2) {
        msg += `，主因是 ${stagnantStage} 环节已停滞 ${maxStagnantDays} 天，建议立刻派员下厂核实异常。`;
      } else if (bottleneck) {
        msg += `，当前严重卡在 ${bottleneck.stage}，建议全线加急或外发分流。`;
      } else if (speed > 0) {
        msg += `，按目前 ${speed.toFixed(1)}件/天 的速度存在较大违约风险，需立即组织补救。`;
      } else {
        msg += `，需立即约谈相关负责人明确最终交付计划。`;
      }
      riskPredictions.push(msg);
    } else if (daysLeft === 0 && prog < 100) {
      verdict = 'critical';
      riskPredictions.push(`今日需交货，但当前进度仅 ${prog}%，请立即确认是否需要安排加班突击！`);
    } else if (daysLeft <= 3 && prog < 70) {
      verdict = 'critical';
      let msg = `极高危！仅剩 ${daysLeft} 天交货，进度才 ${prog}%`;
      if (bottleneck) {
        msg += `，且 ${bottleneck.stage} 形成明显堆积，导致连带逾期概率高。`;
      } else {
        msg += `，可能面临空运或违约赔偿风险。`;
      }
      riskPredictions.push(msg);
    } else if (daysLeft <= 7 && prog < 50) {
      if (verdict === 'good') verdict = 'warn';
      riskPredictions.push(`风险单：距交期 ${daysLeft} 天但进度未过半(${prog}%)，建议提升下线优先级。`);
    } else if (daysLeft <= 2 && prog >= 90 && prog < 100) {
      riskPredictions.push(`临近尾声(${prog}%)，距交期 ${daysLeft}天，请催促尾部及质检尽快手工收尾清点。`);
    }
  }

  // 质量连锁风险
  if (bottleneck && bottleneck.gap >= 40 && daysLeft !== null && daysLeft <= 7 && daysLeft > 0) {
    riskPredictions.push(`${bottleneck.stage} 严重滞后且交期临近 — 后续赶工可能导致次品率飙升，请前置通知质检把关。`);
  }

  // 首单风险
  if (order.plateType === 'FIRST' && prog < 30 && daysLeft !== null && daysLeft <= 14) {
    riskPredictions.push('首单工艺磨合期较长，当前进度偏慢属正常现象，但仍需跟密以防前道工序踩坑。');
  }

  // 全链路顺畅正面反馈
  if (verdict === 'good' && prog > 0 && allStages.every(s => s.pct === 0 || s.pct >= 50)) {
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

  const summary = verdict === 'critical'
    ? '当前这张单不是普通跟进问题，而是已经进入需要优先干预的状态。'
    : verdict === 'warn'
    ? '当前不是立即爆雷，但已经出现会拖慢交付的信号。'
    : '整体推进还算顺，但仍要盯住关键节点别突然掉速。';
  const painPoint = bottleneck
    ? `${bottleneck.stage} 是当前主卡点，前后工序节奏已经拉开。`
    : riskPredictions[0] || personnelNotes[0] || followUpPoints[0] || '当前未发现明显主卡点。';
  const execute = resourceSuggestions[0] || followUpPoints[0] || '继续按当前节奏推进，并保持对关键节点的抽查。';
  const evidence = [
    bottleneck ? `瓶颈 ${bottleneck.stage}，落差 ${bottleneck.gap}%` : null,
    personnelNotes[0] || null,
    riskPredictions[0] || null,
  ].filter(Boolean) as string[];

  return (
    <div style={{ borderTop: '1px dashed #e8e8e8', marginTop: 6, paddingTop: 6 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 6, fontWeight: 600, fontSize: 11 }}>
        <span>🤖 智能判断</span>
        <span style={{
          fontSize: 9, padding: '0 5px', borderRadius: 3,
          background: V_COLOR[verdict], color: '#fff',
        }}>{V_LABEL[verdict]}</span>
      </div>
      <DecisionInsightCard
        compact
        insight={{
          level: verdict === 'critical' ? 'danger' : verdict === 'warn' ? 'warning' : 'success',
          title: verdict === 'critical' ? '这单要优先干预' : verdict === 'warn' ? '这单要重点盯' : '这单节奏正常',
          summary,
          painPoint,
          evidence,
          execute,
          source: '进度判断',
          confidence: verdict === 'critical' ? '中高置信' : '中置信',
          note: bottleneck?.reason,
        }}
      />
    </div>
  );
}
