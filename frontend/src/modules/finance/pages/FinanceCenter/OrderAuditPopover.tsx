import React, { useMemo } from 'react';
import { Popover, Tag } from 'antd';
import { CheckCircleOutlined, WarningOutlined, CloseCircleOutlined } from '@ant-design/icons';

/* ===== 类型定义 ===== */
interface OrderData {
  orderQuantity: number;
  warehousedQuantity: number;
  defectQuantity: number;
  profitMargin: number;
  profit: number;
  materialCost: number;
  productionCost: number;
  totalAmount: number;
  styleFinalPrice: number;
  defectLoss: number;
}

interface CheckItem {
  label: string;
  status: 'ok' | 'warn' | 'danger';
  detail: string;
}

interface AnalysisResult {
  risk: string;
  suggestion: string;
  suggestionText: string;
  checks: CheckItem[];
}

/* ===== 核心分析逻辑 ===== */
function analyzeOrder(row: OrderData): AnalysisResult {
  const checks: CheckItem[] = [];
  let dangerCount = 0;
  let warnCount = 0;

  // ① 数量核验
  const oq = row.orderQuantity || 0;
  const wq = row.warehousedQuantity || 0;
  if (oq > 0 && wq > oq * 1.1) {
    checks.push({ label: '数量核验', status: 'warn', detail: `入库${wq} 超出下单${oq}` });
    warnCount++;
  } else if (oq > 0) {
    checks.push({ label: '数量核验', status: 'ok', detail: `入库${wq} / 下单${oq}` });
  }

  // ② 利润率
  const pm = row.profitMargin;
  if (pm != null && pm !== undefined) {
    if (pm < 0) {
      checks.push({ label: '利润率', status: 'danger', detail: `${pm.toFixed(1)}% 亏损` });
      dangerCount++;
    } else if (pm < 5) {
      checks.push({ label: '利润率', status: 'warn', detail: `${pm.toFixed(1)}% 偏低` });
      warnCount++;
    } else if (pm > 50) {
      checks.push({ label: '利润率', status: 'warn', detail: `${pm.toFixed(1)}% 异常高` });
      warnCount++;
    } else {
      checks.push({ label: '利润率', status: 'ok', detail: `${pm.toFixed(1)}%` });
    }
  }

  // ③ 次品率
  const dq = row.defectQuantity || 0;
  const totalQty = wq + dq;
  if (totalQty > 0) {
    const defectRate = (dq / totalQty) * 100;
    if (defectRate > 10) {
      checks.push({ label: '次品控制', status: 'danger', detail: `${defectRate.toFixed(1)}% 严重` });
      dangerCount++;
    } else if (defectRate > 5) {
      checks.push({ label: '次品控制', status: 'warn', detail: `${defectRate.toFixed(1)}% 偏高` });
      warnCount++;
    } else {
      checks.push({ label: '次品控制', status: 'ok', detail: `${defectRate.toFixed(1)}%` });
    }
  }

  // ④ 成本结构
  const mc = row.materialCost || 0;
  const pc = row.productionCost || 0;
  const ta = row.totalAmount || 0;
  if (ta > 0) {
    const costRatio = ((mc + pc) / ta) * 100;
    if (costRatio > 100) {
      checks.push({ label: '成本结构', status: 'danger', detail: '成本超出收入' });
      dangerCount++;
    } else if (costRatio > 90) {
      checks.push({ label: '成本结构', status: 'warn', detail: `占收入${costRatio.toFixed(0)}%` });
      warnCount++;
    } else {
      checks.push({ label: '成本结构', status: 'ok', detail: `占收入${costRatio.toFixed(0)}%` });
    }
  }

  // ⑤ 报废损失
  const dl = row.defectLoss || 0;
  if (dl > 0 && ta > 0) {
    const lossRatio = (dl / ta) * 100;
    if (lossRatio > 5) {
      checks.push({ label: '报废损失', status: 'danger', detail: `¥${dl.toFixed(0)} (占${lossRatio.toFixed(1)}%)` });
      dangerCount++;
    } else if (lossRatio > 2) {
      checks.push({ label: '报废损失', status: 'warn', detail: `¥${dl.toFixed(0)} (占${lossRatio.toFixed(1)}%)` });
      warnCount++;
    } else {
      checks.push({ label: '报废损失', status: 'ok', detail: `¥${dl.toFixed(0)}` });
    }
  }

  // 风险判定 + 建议
  let risk = 'LOW';
  let suggestion = 'APPROVE';
  let suggestionText = '各项指标正常，建议通过';
  if (dangerCount >= 2) {
    risk = 'HIGH'; suggestion = 'REJECT';
    suggestionText = `发现${dangerCount}项严重异常，建议驳回`;
  } else if (dangerCount >= 1) {
    risk = 'HIGH'; suggestion = 'REVIEW';
    suggestionText = '存在高风险项，建议人工复核';
  } else if (warnCount >= 2) {
    risk = 'MEDIUM'; suggestion = 'REVIEW';
    suggestionText = `发现${warnCount}项预警，建议关注`;
  } else if (warnCount >= 1) {
    risk = 'LOW'; suggestion = 'APPROVE';
    suggestionText = '有轻微预警，整体风险可控';
  }
  return { risk, suggestion, suggestionText, checks };
}

/* ===== 样式常量 ===== */
const statusIcon: Record<string, React.ReactNode> = {
  ok: <CheckCircleOutlined />, warn: <WarningOutlined />, danger: <CloseCircleOutlined />,
};
const statusColor: Record<string, string> = { ok: '#52c41a', warn: '#faad14', danger: '#ff4d4f' };
const riskTagColor: Record<string, string> = { LOW: 'green', MEDIUM: 'orange', HIGH: 'red' };
const suggestionLabel: Record<string, string> = { APPROVE: '建议通过', REVIEW: '需复核', REJECT: '建议驳回' };

/* ===== 组件 ===== */
const OrderAuditPopover: React.FC<{ record: OrderData; children: React.ReactNode }> = ({ record, children }) => {
  const analysis = useMemo(() => analyzeOrder(record), [record]);

  const content = (
    <div style={{ width: 270, fontSize: 13 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <span style={{ fontWeight: 600, fontSize: 14 }}>🔍 AI 智能审核</span>
        <Tag color={riskTagColor[analysis.risk]}>{suggestionLabel[analysis.suggestion]}</Tag>
      </div>
      {analysis.checks.map((c, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', padding: '3px 0', gap: 6 }}>
          <span style={{ color: statusColor[c.status], flexShrink: 0 }}>{statusIcon[c.status]}</span>
          <span style={{ width: 60, flexShrink: 0, color: '#595959' }}>{c.label}</span>
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

export default OrderAuditPopover;
