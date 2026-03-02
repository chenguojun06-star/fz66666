import React, { useMemo } from 'react';
import { Popover, Tag } from 'antd';
import { CheckCircleOutlined, WarningOutlined, CloseCircleOutlined } from '@ant-design/icons';
import type { PayableItem } from '@/services/finance/wagePaymentApi';

/* ===== 类型定义 ===== */
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

/* ===== 核心分析逻辑（针对 PayableItem 数据） ===== */
function analyzePayable(item: PayableItem): AnalysisResult {
  const checks: CheckItem[] = [];
  let dangerCount = 0;
  let warnCount = 0;

  const amount = Number(item.amount) || 0;
  const paidAmount = Number(item.paidAmount) || 0;

  // ① 金额核验
  if (amount <= 0) {
    checks.push({ label: '金额核验', status: 'danger', detail: '应付金额为0或负数' });
    dangerCount++;
  } else if (amount > 100000) {
    checks.push({ label: '金额核验', status: 'warn', detail: `¥${amount.toLocaleString()} 大额付款` });
    warnCount++;
  } else {
    checks.push({ label: '金额核验', status: 'ok', detail: `¥${amount.toFixed(2)}` });
  }

  // ② 重复/超额付款检查
  if (paidAmount > 0) {
    if (paidAmount >= amount) {
      checks.push({ label: '付款状态', status: 'danger', detail: `已付¥${paidAmount.toFixed(2)}，已全额付清` });
      dangerCount++;
    } else {
      const remaining = amount - paidAmount;
      checks.push({ label: '付款状态', status: 'warn', detail: `已付¥${paidAmount.toFixed(2)}，剩余¥${remaining.toFixed(2)}` });
      warnCount++;
    }
  } else {
    checks.push({ label: '付款状态', status: 'ok', detail: '首次付款' });
  }

  // ③ 业务类型细化分析
  if (item.bizType === 'ORDER_SETTLEMENT' && item.description) {
    // 解析描述：格式 "工厂订单结算：X个订单，共Y件"
    const match = item.description.match(/(\d+)\s*个订单.*?共\s*(\d+)\s*件/);
    if (match) {
      const orderCount = parseInt(match[1]);
      const totalQty = parseInt(match[2]);
      const avgPerOrder = orderCount > 0 ? amount / orderCount : 0;
      const avgPerPiece = totalQty > 0 ? amount / totalQty : 0;

      // 单均金额检查
      if (avgPerOrder > 50000) {
        checks.push({ label: '单均金额', status: 'warn', detail: `${orderCount}单 · 均¥${avgPerOrder.toLocaleString(undefined, { maximumFractionDigits: 0 })}` });
        warnCount++;
      } else {
        checks.push({ label: '单均金额', status: 'ok', detail: `${orderCount}单 · 均¥${avgPerOrder.toLocaleString(undefined, { maximumFractionDigits: 0 })}` });
      }

      // 件均成本检查
      if (totalQty > 0) {
        if (avgPerPiece > 200) {
          checks.push({ label: '件均成本', status: 'warn', detail: `${totalQty.toLocaleString()}件 · 均¥${avgPerPiece.toFixed(1)}` });
          warnCount++;
        } else if (avgPerPiece < 1 && avgPerPiece > 0) {
          checks.push({ label: '件均成本', status: 'warn', detail: `${totalQty.toLocaleString()}件 · 均¥${avgPerPiece.toFixed(2)} 偏低` });
          warnCount++;
        } else {
          checks.push({ label: '件均成本', status: 'ok', detail: `${totalQty.toLocaleString()}件 · 均¥${avgPerPiece.toFixed(1)}` });
        }
      }
    }
  } else if (item.bizType === 'PAYROLL_SETTLEMENT' && item.description) {
    // 解析工资结算描述
    const match = item.description.match(/(\d+)\s*人/);
    if (match) {
      const workerCount = parseInt(match[1]);
      const avgPerWorker = workerCount > 0 ? amount / workerCount : 0;
      if (avgPerWorker > 20000) {
        checks.push({ label: '人均金额', status: 'warn', detail: `${workerCount}人 · 均¥${avgPerWorker.toLocaleString(undefined, { maximumFractionDigits: 0 })}` });
        warnCount++;
      } else {
        checks.push({ label: '人均金额', status: 'ok', detail: `${workerCount}人 · 均¥${avgPerWorker.toLocaleString(undefined, { maximumFractionDigits: 0 })}` });
      }
    }
  } else if (item.bizType === 'REIMBURSEMENT') {
    // 报销金额检查
    if (amount > 10000) {
      checks.push({ label: '报销审查', status: 'warn', detail: `¥${amount.toLocaleString()} 大额报销需审批` });
      warnCount++;
    } else {
      checks.push({ label: '报销审查', status: 'ok', detail: '金额在正常范围' });
    }
  }

  // ④ 时效检查
  if (item.createTime) {
    const createDate = new Date(item.createTime);
    const now = new Date();
    const daysDiff = Math.floor((now.getTime() - createDate.getTime()) / (1000 * 60 * 60 * 24));
    if (daysDiff > 30) {
      checks.push({ label: '时效检查', status: 'warn', detail: `已挂${daysDiff}天，建议尽快处理` });
      warnCount++;
    } else if (daysDiff > 7) {
      checks.push({ label: '时效检查', status: 'ok', detail: `${daysDiff}天前创建` });
    } else {
      checks.push({ label: '时效检查', status: 'ok', detail: '近期创建' });
    }
  }

  // 风险判定
  let risk = 'LOW';
  let suggestion = 'APPROVE';
  let suggestionText = '各项指标正常，建议付款';
  if (dangerCount >= 2) {
    risk = 'HIGH'; suggestion = 'REJECT';
    suggestionText = `发现${dangerCount}项严重异常，建议暂停付款`;
  } else if (dangerCount >= 1) {
    risk = 'HIGH'; suggestion = 'REVIEW';
    suggestionText = '存在高风险项，建议人工复核后付款';
  } else if (warnCount >= 2) {
    risk = 'MEDIUM'; suggestion = 'REVIEW';
    suggestionText = `发现${warnCount}项预警，请核实后付款`;
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
const suggestionLabel: Record<string, string> = { APPROVE: '建议付款', REVIEW: '需复核', REJECT: '建议暂停' };

/* ===== 组件 ===== */
const PaymentAuditPopover: React.FC<{ record: PayableItem; children: React.ReactNode }> = ({ record, children }) => {
  const analysis = useMemo(() => analyzePayable(record), [record]);

  const content = (
    <div style={{ width: 280, fontSize: 13 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <span style={{ fontWeight: 600, fontSize: 14 }}>🔍 AI 付款审核</span>
        <Tag color={riskTagColor[analysis.risk]}>{suggestionLabel[analysis.suggestion]}</Tag>
      </div>
      {analysis.checks.map((c, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', padding: '3px 0', gap: 6 }}>
          <span style={{ color: statusColor[c.status], flexShrink: 0 }}>{statusIcon[c.status]}</span>
          <span style={{ width: 68, flexShrink: 0, color: '#595959' }}>{c.label}</span>
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

export default PaymentAuditPopover;
