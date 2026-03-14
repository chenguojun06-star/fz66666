import React, { useMemo } from 'react';
import { Popover, Tag } from 'antd';
import DecisionInsightCard, { SMART_CARD_CONTENT_WIDTH, SMART_CARD_OVERLAY_WIDTH, type DecisionInsight } from '@/components/common/DecisionInsightCard';

const choose = (seed: number, variants: string[]) => {
  if (!variants.length) return '';
  return variants[Math.abs(seed) % variants.length];
};

/* ===== 类型 ===== */
export interface WorkerSummaryRow {
  operatorName: string;
  totalQuantity: number;
  totalAmount: number;
  recordCount: number;
  orderCount: number;
}

interface CheckItem { label: string; status: 'ok' | 'warn' | 'danger'; detail: string; }
interface AnalysisResult {
  risk: string; suggestion: string; suggestionText: string;
  checks: CheckItem[];
  breakdown: { label: string; value: string }[];
}

/* ===== AI 分析逻辑 ===== */
function analyzeWorker(record: WorkerSummaryRow, grandTotal: number, workerCount: number): AnalysisResult {
  const checks: CheckItem[] = [];
  const breakdown: { label: string; value: string }[] = [];
  let dangerCount = 0, warnCount = 0;
  const { totalAmount: amount, totalQuantity, recordCount, orderCount } = record;

  // — 明细摘要 —
  if (totalQuantity > 0) breakdown.push({ label: '完成件数', value: `${totalQuantity} 件` });
  if (recordCount > 0)   breakdown.push({ label: '扫码次数', value: `${recordCount} 次` });
  if (orderCount > 0)    breakdown.push({ label: '涉及订单', value: `${orderCount} 单` });

  // ① 金额核验
  if (amount <= 0) {
    checks.push({ label: '金额核验', status: 'danger', detail: '工资为0，请确认是否漏记' });
    dangerCount++;
  } else if (amount > 30000) {
    checks.push({ label: '金额核验', status: 'warn', detail: `¥${amount.toLocaleString()} 较高` });
    warnCount++;
  } else {
    checks.push({ label: '金额核验', status: 'ok', detail: `¥${amount.toFixed(2)}` });
  }

  // ② 件均工资（行业参考：服装1.5~80元/件）
  if (totalQuantity > 0) {
    const perPiece = amount / totalQuantity;
    if (perPiece < 1.5) {
      checks.push({ label: '件均工资', status: 'warn', detail: `¥${perPiece.toFixed(2)}/件，偏低` });
      warnCount++;
    } else if (perPiece > 200) {
      checks.push({ label: '件均工资', status: 'warn', detail: `¥${perPiece.toFixed(1)}/件，偏高` });
      warnCount++;
    } else {
      checks.push({ label: '件均工资', status: 'ok', detail: `${totalQuantity}件 · 均¥${perPiece.toFixed(2)}` });
    }
  }

  // ③ 团队占比（本人÷全员合计）
  if (grandTotal > 0 && workerCount > 1) {
    const ratio = (amount / grandTotal) * 100;
    const avgShare = 100 / workerCount;
    if (ratio > Math.min(avgShare * 3, 60)) {
      checks.push({ label: '团队占比', status: 'warn', detail: `${ratio.toFixed(0)}%，远高于人均${Math.round(avgShare)}%` });
      warnCount++;
    } else {
      checks.push({ label: '团队占比', status: 'ok', detail: `${ratio.toFixed(0)}%（人均约${Math.round(avgShare)}%）` });
    }
  }

  // ④ 扫码密度（件/次）
  if (recordCount > 0 && totalQuantity > 0) {
    const density = totalQuantity / recordCount;
    if (density > 800) {
      checks.push({ label: '扫码密度', status: 'warn', detail: `均${Math.round(density)}件/次，数量异常大` });
      warnCount++;
    } else if (density < 1) {
      checks.push({ label: '扫码密度', status: 'warn', detail: '有零件数扫码记录' });
      warnCount++;
    } else {
      checks.push({ label: '扫码密度', status: 'ok', detail: `均${Math.round(density)}件/次` });
    }
  }

  // 风险判定
  let risk = 'LOW', suggestion = 'APPROVE', suggestionText = '各项指标正常，建议审核通过';
  if (dangerCount >= 1) {
    risk = 'HIGH'; suggestion = 'REVIEW';
    suggestionText = '存在高风险项，请人工复核后审核';
  } else if (warnCount >= 2) {
    risk = 'MEDIUM'; suggestion = 'REVIEW';
    suggestionText = `发现${warnCount}项预警，请核实后审核`;
  } else if (warnCount >= 1) {
    risk = 'LOW'; suggestion = 'APPROVE';
    suggestionText = '有轻微预警，整体风险可控';
  }

  return { risk, suggestion, suggestionText, checks, breakdown };
}

/* ===== 样式常量 ===== */
const riskTagColor: Record<string, string> = { LOW: 'green', MEDIUM: 'orange', HIGH: 'red' };
const suggestionLabel: Record<string, string> = { APPROVE: '建议通过', REVIEW: '需复核', REJECT: '建议驳回' };

function mapRiskLevel(risk: string): DecisionInsight['level'] {
  if (risk === 'HIGH') return 'danger';
  if (risk === 'MEDIUM') return 'warning';
  return 'success';
}

function buildWorkerInsight(record: WorkerSummaryRow, analysis: AnalysisResult): DecisionInsight {
  const abnormalChecks = analysis.checks.filter((item) => item.status !== 'ok');
  const focusChecks = (abnormalChecks.length > 0 ? abnormalChecks : analysis.checks).slice(0, 3);
  const primaryIssue = abnormalChecks[0]?.detail;
  const seed = Math.round(record.totalAmount || 0) + (record.recordCount || 0) * 9 + abnormalChecks.length * 17;

  const summary = analysis.suggestion === 'APPROVE'
    ? choose(seed, [
      '工资与产量匹配，可提审。',
      '数据无异常，可推进。',
      '汇总稳定，可通过。',
    ])
    : choose(seed, [
      '存在异常指标，建议复核。',
      '需人工确认异常点。',
      '先核异常再决定。',
    ]);

  const execute = analysis.suggestion === 'APPROVE'
    ? choose(seed + 3, [
      '核对身份和区间后提审。',
      '确认金额后推进。',
      '提交审核并保留记录。',
    ])
    : choose(seed + 7, [
      '核对件均工资和扫码密度。',
      '复核异常指标后继续。',
      '人工复核后再提审。',
    ]);

  return {
    level: mapRiskLevel(analysis.risk),
    title: '工资审核建议',
    summary,
    painPoint: primaryIssue || '无明显异常',
    execute,
    evidence: focusChecks.map((item) => `${item.label}：${item.detail}`),
    note: `${record.operatorName || '员工'} · 总工资 ¥${(record.totalAmount || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`,
    source: '工资数据推演',
    confidence: analysis.risk === 'HIGH' ? '建议人工确认' : '可执行建议',
    labels: {
      summary: '现状',
      painPoint: '关注点',
      execute: '下一步',
      evidence: '数据',
      note: '补充',
    },
  };
}

/* ===== 组件 ===== */
const WorkerPayrollAuditPopover: React.FC<{
  record: WorkerSummaryRow;
  grandTotal: number;
  workerCount: number;
  children: React.ReactNode;
}> = ({ record, grandTotal, workerCount, children }) => {
  const analysis = useMemo(
    () => analyzeWorker(record, grandTotal, workerCount),
    [record, grandTotal, workerCount],
  );
  const insight = useMemo(() => buildWorkerInsight(record, analysis), [record, analysis]);

  const content = (
    <div style={{ width: SMART_CARD_CONTENT_WIDTH, fontSize: 13, boxSizing: 'border-box' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <span style={{ fontWeight: 600, fontSize: 14 }}>🔍 工资审核</span>
        <Tag color={riskTagColor[analysis.risk]}>{suggestionLabel[analysis.suggestion]}</Tag>
      </div>
      <DecisionInsightCard compact insight={insight} />

      {analysis.breakdown.length > 0 && (
        <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: '4px 10px', padding: '6px 8px', background: '#fafafa', borderRadius: 6 }}>
          {analysis.breakdown.slice(0, 6).map((b, i) => (
            <span key={i} style={{ whiteSpace: 'nowrap', color: '#595959', fontSize: 12 }}>
              <span style={{ color: '#8c8c8c' }}>{b.label}：</span>
              <span style={{ fontWeight: 500 }}>{b.value}</span>
            </span>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <Popover content={content} trigger="hover" placement="right" mouseEnterDelay={0.3} overlayStyle={{ width: SMART_CARD_OVERLAY_WIDTH, maxWidth: SMART_CARD_OVERLAY_WIDTH }}>
      {children}
    </Popover>
  );
};

export default WorkerPayrollAuditPopover;
