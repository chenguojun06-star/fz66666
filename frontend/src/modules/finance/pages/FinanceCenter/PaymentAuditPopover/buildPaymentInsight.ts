import type { DecisionInsight } from '@/components/common/DecisionInsightCard';
import type { PayableItem } from '@/services/finance/wagePaymentApi';
import type { AnalysisResult } from './types';

const choose = (seed: number, variants: string[]) => {
  if (!variants.length) return '';
  return variants[Math.abs(seed) % variants.length];
};

export const riskTagColor: Record<string, string> = { LOW: 'green', MEDIUM: 'orange', HIGH: 'red' };
export const suggestionLabel: Record<string, string> = { APPROVE: '建议付款', REVIEW: '需复核', REJECT: '建议暂停' };

function mapRiskLevel(risk: string): DecisionInsight['level'] {
  if (risk === 'HIGH') return 'danger';
  if (risk === 'MEDIUM') return 'warning';
  return 'success';
}

export function buildPaymentInsight(record: PayableItem, analysis: AnalysisResult): DecisionInsight {
  const abnormalChecks = analysis.checks.filter((item) => item.status !== 'ok');
  const focusChecks = (abnormalChecks.length > 0 ? abnormalChecks : analysis.checks).slice(0, 3);
  const amount = Number(record.amount) || 0;
  const bizType = record.bizType || 'UNKNOWN';
  const primaryIssue = abnormalChecks[0]?.detail;
  const seed = amount + abnormalChecks.length * 13 + analysis.checks.length * 7;

  const summary = analysis.suggestion === 'APPROVE'
    ? choose(seed, [
      '风险低，可按流程付款。',
      '无明显异常，可正常付款。',
      '数据正常，可执行付款。',
    ])
    : analysis.suggestion === 'REJECT'
      ? choose(seed, [
        '存在异常，建议暂停付款。',
        '风险较高，不建议直接付款。',
        '异常项较多，建议先止付。',
      ])
      : choose(seed, [
        '有异常项需确认，建议复核后付款。',
        '存在待确认项，先复核再付。',
        '建议先核实异常项再放行。',
      ]);

  const execute = analysis.suggestion === 'APPROVE'
    ? choose(seed + 3, [
      '核对金额和附件后付款。',
      '确认金额无误后执行。',
      '按流程付款并保留记录。',
    ])
    : analysis.suggestion === 'REJECT'
      ? choose(seed + 5, [
        '暂停付款，回查源单据。',
        '止付并核实异常明细。',
        '回查数据后重新提交。',
      ])
      : choose(seed + 7, [
        '先核实异常项，再决定付款。',
        '逐条核清异常后再放行。',
        '人工复核后再执行付款。',
      ]);

  return {
    level: mapRiskLevel(analysis.risk),
    title: '付款审核建议',
    summary,
    painPoint: primaryIssue || (analysis.risk === 'LOW' ? '无明显异常' : undefined),
    execute,
    evidence: focusChecks.map((item) => `${item.label}：${item.detail}`),
    note: `业务类型 ${bizType} · 本次应付 ¥${amount.toLocaleString(undefined, { maximumFractionDigits: 2 })}`,
    source: '付款数据推演',
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
