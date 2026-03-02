import React, { useMemo } from 'react';
import { Popover, Tag, Divider } from 'antd';
import { CheckCircleOutlined, WarningOutlined, CloseCircleOutlined } from '@ant-design/icons';

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
const statusIcon: Record<string, React.ReactNode> = {
  ok: <CheckCircleOutlined />, warn: <WarningOutlined />, danger: <CloseCircleOutlined />,
};
const statusColor: Record<string, string> = { ok: '#52c41a', warn: '#faad14', danger: '#ff4d4f' };
const riskTagColor: Record<string, string> = { LOW: 'green', MEDIUM: 'orange', HIGH: 'red' };
const suggestionLabel: Record<string, string> = { APPROVE: '建议通过', REVIEW: '需复核', REJECT: '建议驳回' };

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

  const content = (
    <div style={{ width: 280, fontSize: 13 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <span style={{ fontWeight: 600, fontSize: 14 }}>🔍 AI 工资审核</span>
        <Tag color={riskTagColor[analysis.risk]}>{suggestionLabel[analysis.suggestion]}</Tag>
      </div>

      {/* 明细摘要 */}
      {analysis.breakdown.length > 0 && (
        <>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2px 10px', padding: '4px 6px', background: '#fafafa', borderRadius: 4, marginBottom: 6 }}>
            {analysis.breakdown.map((b, i) => (
              <span key={i} style={{ whiteSpace: 'nowrap', color: '#595959', fontSize: 12 }}>
                <span style={{ color: '#8c8c8c' }}>{b.label}：</span>
                <span style={{ fontWeight: 500 }}>{b.value}</span>
              </span>
            ))}
          </div>
          <Divider style={{ margin: '4px 0' }} />
        </>
      )}

      {/* 审核检查项 */}
      {analysis.checks.map((c, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', padding: '3px 0', gap: 6 }}>
          <span style={{ color: statusColor[c.status], flexShrink: 0 }}>{statusIcon[c.status]}</span>
          <span style={{ width: 64, flexShrink: 0, color: '#595959' }}>{c.label}</span>
          <span style={{ color: statusColor[c.status], fontWeight: 500 }}>{c.detail}</span>
        </div>
      ))}

      <div style={{ borderTop: '1px solid #f0f0f0', marginTop: 6, paddingTop: 6, color: '#8c8c8c', fontSize: 12 }}>
        💡 {analysis.suggestionText}
      </div>
    </div>
  );

  return (
    <Popover content={content} trigger="hover" placement="right" mouseEnterDelay={0.3}>
      {children}
    </Popover>
  );
};

export default WorkerPayrollAuditPopover;
