import React, { useMemo } from 'react';
import { Popover, Tag, Divider } from 'antd';
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
  breakdown: { label: string; value: string }[];   // 明细摘要行
}

/* ===== 从 description 解析结构化字段 ===== */
function parseDescriptionFields(desc: string) {
  const m = desc.match(/(\d+)\s*个订单.*?共\s*(\d+)\s*件/);
  const orderCount = m ? parseInt(m[1]) : 0;
  const totalQty = m ? parseInt(m[2]) : 0;

  const extract = (key: string) => {
    const r = desc.match(new RegExp(key + ':\\s*([\\d.]+)'));
    return r ? parseFloat(r[1]) : 0;
  };

  return {
    orderCount,
    totalQty,
    materialCost: extract('面料'),
    productionCost: extract('工费'),
    profit: extract('利润'),
    defectQty: extract('次品'),
    warehousedQty: extract('入库'),
    orderQty: extract('订单量'),
  };
}

/* ===== 核心分析逻辑（针对 PayableItem 数据，细化版） ===== */
function analyzePayable(item: PayableItem): AnalysisResult {
  const checks: CheckItem[] = [];
  const breakdown: { label: string; value: string }[] = [];
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

  // ③ 业务类型细化分析 — ORDER_SETTLEMENT（订单结算，核心审核场景）
  if (item.bizType === 'ORDER_SETTLEMENT' && item.description) {
    const p = parseDescriptionFields(item.description);

    // — 明细摘要 —
    if (p.orderCount > 0) {
      breakdown.push({ label: '订单数', value: `${p.orderCount} 单` });
    }
    if (p.totalQty > 0) {
      breakdown.push({ label: '入库件数', value: `${p.warehousedQty || p.totalQty} 件` });
    }
    if (p.materialCost > 0) {
      breakdown.push({ label: '面料成本', value: `¥${p.materialCost.toLocaleString()}` });
    }
    if (p.productionCost > 0) {
      breakdown.push({ label: '生产工费', value: `¥${p.productionCost.toLocaleString()}` });
    }
    if (p.profit !== 0) {
      breakdown.push({ label: '利润', value: `¥${p.profit.toLocaleString()}` });
    }
    if (p.defectQty > 0) {
      breakdown.push({ label: '次品数', value: `${p.defectQty} 件` });
    }

    // — 单均金额 —
    if (p.orderCount > 0) {
      const avgPerOrder = amount / p.orderCount;
      if (avgPerOrder > 50000) {
        checks.push({ label: '单均金额', status: 'warn', detail: `${p.orderCount}单 · 均¥${avgPerOrder.toLocaleString(undefined, { maximumFractionDigits: 0 })}` });
        warnCount++;
      } else {
        checks.push({ label: '单均金额', status: 'ok', detail: `${p.orderCount}单 · 均¥${avgPerOrder.toLocaleString(undefined, { maximumFractionDigits: 0 })}` });
      }
    }

    // — 件均成本 —
    const baseQty = p.warehousedQty || p.totalQty;
    if (baseQty > 0) {
      const avgPerPiece = amount / baseQty;
      if (avgPerPiece > 200) {
        checks.push({ label: '件均成本', status: 'warn', detail: `${baseQty.toLocaleString()}件 · 均¥${avgPerPiece.toFixed(1)} 偏高` });
        warnCount++;
      } else if (avgPerPiece < 1 && avgPerPiece > 0) {
        checks.push({ label: '件均成本', status: 'warn', detail: `${baseQty.toLocaleString()}件 · 均¥${avgPerPiece.toFixed(2)} 偏低` });
        warnCount++;
      } else {
        checks.push({ label: '件均成本', status: 'ok', detail: `${baseQty.toLocaleString()}件 · 均¥${avgPerPiece.toFixed(1)}` });
      }
    }

    // — 利润率检查 —
    if (amount > 0 && p.profit !== 0) {
      const profitRate = (p.profit / amount) * 100;
      if (profitRate < 0) {
        checks.push({ label: '利润率', status: 'danger', detail: `${profitRate.toFixed(1)}% 亏损` });
        dangerCount++;
      } else if (profitRate < 5) {
        checks.push({ label: '利润率', status: 'warn', detail: `${profitRate.toFixed(1)}% 偏低` });
        warnCount++;
      } else {
        checks.push({ label: '利润率', status: 'ok', detail: `${profitRate.toFixed(1)}%` });
      }
    }

    // — 次品率检查 —
    if (p.defectQty > 0 && (p.orderQty || p.totalQty) > 0) {
      const defectRate = (p.defectQty / (p.orderQty || p.totalQty)) * 100;
      if (defectRate > 5) {
        checks.push({ label: '次品率', status: 'danger', detail: `${p.defectQty}件 / ${p.orderQty || p.totalQty}件 = ${defectRate.toFixed(1)}%` });
        dangerCount++;
      } else if (defectRate > 2) {
        checks.push({ label: '次品率', status: 'warn', detail: `${defectRate.toFixed(1)}%（${p.defectQty}件）` });
        warnCount++;
      } else {
        checks.push({ label: '次品率', status: 'ok', detail: `${defectRate.toFixed(1)}%` });
      }
    }

    // — 入库率检查 —
    if (p.warehousedQty > 0 && p.orderQty > 0) {
      const warehouseRate = (p.warehousedQty / p.orderQty) * 100;
      if (warehouseRate < 80) {
        checks.push({ label: '入库率', status: 'warn', detail: `${warehouseRate.toFixed(0)}%（${p.warehousedQty}/${p.orderQty}件）` });
        warnCount++;
      } else {
        checks.push({ label: '入库率', status: 'ok', detail: `${warehouseRate.toFixed(0)}%` });
      }
    }

    // — 面料/工费比重分析 —
    if (p.materialCost > 0 && p.productionCost > 0) {
      const materialRatio = (p.materialCost / amount) * 100;
      const productionRatio = (p.productionCost / amount) * 100;
      if (materialRatio > 70) {
        checks.push({ label: '成本结构', status: 'warn', detail: `面料占比${materialRatio.toFixed(0)}% 偏高` });
        warnCount++;
      } else if (productionRatio > 60) {
        checks.push({ label: '成本结构', status: 'warn', detail: `工费占比${productionRatio.toFixed(0)}% 偏高` });
        warnCount++;
      } else {
        checks.push({ label: '成本结构', status: 'ok', detail: `面料${materialRatio.toFixed(0)}% · 工费${productionRatio.toFixed(0)}%` });
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
  } else if (item.bizType === 'RECONCILIATION') {
    // 对账类型
    checks.push({ label: '对账审查', status: 'ok', detail: `¥${amount.toLocaleString()}` });
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
  } else if (warnCount >= 3) {
    risk = 'MEDIUM'; suggestion = 'REVIEW';
    suggestionText = `发现${warnCount}项预警，请核实后付款`;
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
const suggestionLabel: Record<string, string> = { APPROVE: '建议付款', REVIEW: '需复核', REJECT: '建议暂停' };

/* ===== 组件 ===== */
const PaymentAuditPopover: React.FC<{ record: PayableItem; children: React.ReactNode }> = ({ record, children }) => {
  const analysis = useMemo(() => analyzePayable(record), [record]);

  const content = (
    <div style={{ width: 300, fontSize: 13 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <span style={{ fontWeight: 600, fontSize: 14 }}>🔍 AI 付款审核</span>
        <Tag color={riskTagColor[analysis.risk]}>{suggestionLabel[analysis.suggestion]}</Tag>
      </div>

      {/* 明细摘要区（仅订单结算有数据） */}
      {analysis.breakdown.length > 0 && (
        <>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2px 12px', padding: '4px 0', background: '#fafafa', borderRadius: 4, marginBottom: 6, paddingLeft: 6, paddingRight: 6 }}>
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
