import React, { useMemo } from 'react';
import { Popover, Tag } from 'antd';
import DecisionInsightCard, { SMART_CARD_CONTENT_WIDTH, SMART_CARD_OVERLAY_WIDTH, type DecisionInsight } from '@/components/common/DecisionInsightCard';
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

/* ===== 从 description 解析工资结算字段 ===== */
function parsePayrollDescription(desc: string) {
  const scanMatch = desc.match(/(\d+)\s*次扫码/);
  const qtyMatch = desc.match(/共\s*(\d+)\s*件/);
  return {
    scanCount: scanMatch ? parseInt(scanMatch[1]) : 0,
    totalQty: qtyMatch ? parseInt(qtyMatch[1]) : 0,
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

  } else if (item.bizType === 'PAYROLL_SETTLEMENT' || item.bizType === 'PAYROLL') {
    // 工资结算：解析扫码次数 + 件数，计算件均工资
    const pp = parsePayrollDescription(item.description || '');
    if (pp.scanCount > 0) breakdown.push({ label: '扫码次数', value: `${pp.scanCount} 次` });
    if (pp.totalQty > 0) breakdown.push({ label: '完成件数', value: `${pp.totalQty} 件` });
    if (pp.totalQty > 0 && amount > 0) {
      const avgPerPiece = amount / pp.totalQty;
      if (avgPerPiece < 2) {
        checks.push({ label: '件均工资', status: 'warn', detail: `¥${avgPerPiece.toFixed(2)}/件，偏低` });
        warnCount++;
      } else if (avgPerPiece > 200) {
        checks.push({ label: '件均工资', status: 'warn', detail: `¥${avgPerPiece.toFixed(1)}/件，偏高` });
        warnCount++;
      } else {
        checks.push({ label: '件均工资', status: 'ok', detail: `${pp.totalQty}件 · 均¥${avgPerPiece.toFixed(1)}` });
      }
    }
    if (pp.scanCount > 0 && pp.totalQty > 0) {
      const avgPerScan = Math.round(pp.totalQty / pp.scanCount);
      if (avgPerScan > 300) {
        checks.push({ label: '扫码频次', status: 'warn', detail: `单次均${avgPerScan}件，数量较多` });
        warnCount++;
      } else {
        checks.push({ label: '扫码记录', status: 'ok', detail: `${pp.scanCount}次扫码，共${pp.totalQty}件` });
      }
    }

  } else if (item.bizType === 'REIMBURSEMENT') {
    // 费用报销：识别类型 + 大额检查
    const desc = item.description || '';
    let expenseType = '通用报销';
    if (/差旅|出差|交通|机票|高铁/.test(desc)) expenseType = '差旅费';
    else if (/设备|维修|保养|maintenance/.test(desc)) expenseType = '设备维修';
    else if (/面料|材料|辅料|原材料/.test(desc)) expenseType = '材料采购';
    else if (/水电|房租|物业/.test(desc)) expenseType = '运营费用';
    else if (/餐饮|招待|接待/.test(desc)) expenseType = '接待费用';
    breakdown.push({ label: '报销类型', value: expenseType });
    if (amount > 20000) {
      checks.push({ label: '报销审查', status: 'danger', detail: `¥${amount.toLocaleString()} 超大额，须专项审批` });
      dangerCount++;
    } else if (amount > 5000) {
      checks.push({ label: '报销审查', status: 'warn', detail: `¥${amount.toLocaleString()} 大额，建议核实凭证` });
      warnCount++;
    } else {
      checks.push({ label: '报销审查', status: 'ok', detail: `¥${amount.toFixed(2)} 金额正常` });
    }
    if (/餐饮|招待|接待/.test(desc) && amount > 2000) {
      checks.push({ label: '合规提示', status: 'warn', detail: '接待费用建议附签字审批单' });
      warnCount++;
    }

  } else if (item.bizType === 'RECONCILIATION') {
    // 物料对账：检测零金额 + 大额预警
    const desc = item.description || '';
    let reconType = '物料对账';
    if (/面料/.test(desc)) reconType = '面料对账';
    else if (/辅料/.test(desc)) reconType = '辅料对账';
    else if (/成品/.test(desc)) reconType = '成品对账';
    breakdown.push({ label: '对账类型', value: reconType });
    if (amount === 0) {
      checks.push({ label: '对账状态', status: 'warn', detail: '应付为零，请确认是否已线下结清' });
      warnCount++;
    } else if (amount > 50000) {
      checks.push({ label: '对账审查', status: 'warn', detail: `¥${amount.toLocaleString()} 大额，建议复核明细` });
      warnCount++;
    } else {
      checks.push({ label: '对账审查', status: 'ok', detail: `¥${amount.toFixed(2)} 金额核实` });
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
const riskTagColor: Record<string, string> = { LOW: 'green', MEDIUM: 'orange', HIGH: 'red' };
const suggestionLabel: Record<string, string> = { APPROVE: '建议付款', REVIEW: '需复核', REJECT: '建议暂停' };

function mapRiskLevel(risk: string): DecisionInsight['level'] {
  if (risk === 'HIGH') return 'danger';
  if (risk === 'MEDIUM') return 'warning';
  return 'success';
}

function buildPaymentInsight(record: PayableItem, analysis: AnalysisResult): DecisionInsight {
  const abnormalChecks = analysis.checks.filter((item) => item.status !== 'ok');
  const focusChecks = (abnormalChecks.length > 0 ? abnormalChecks : analysis.checks).slice(0, 3);
  const amount = Number(record.amount) || 0;
  const bizType = record.bizType || 'UNKNOWN';
  const primaryIssue = abnormalChecks[0]?.detail;

  return {
    level: mapRiskLevel(analysis.risk),
    title: '付款审核建议',
    summary: analysis.suggestionText,
    painPoint: primaryIssue || (analysis.risk === 'LOW' ? '当前未发现明显异常项，可按流程推进' : undefined),
    execute: analysis.suggestion === 'APPROVE'
      ? '核对付款对象与金额后可直接推进付款。'
      : analysis.suggestion === 'REJECT'
        ? '先暂停付款，回到业务单据核对异常来源，再决定是否重提。'
        : '先复核异常项、明细和附件，再决定是否付款。',
    evidence: focusChecks.map((item) => `${item.label}：${item.detail}`),
    note: `业务类型 ${bizType} · 本次应付 ¥${amount.toLocaleString(undefined, { maximumFractionDigits: 2 })}`,
    source: '规则审核',
    confidence: suggestionLabel[analysis.suggestion],
  };
}

/* ===== 组件 ===== */
const PaymentAuditPopover: React.FC<{ record: PayableItem; children: React.ReactNode }> = ({ record, children }) => {
  const analysis = useMemo(() => analyzePayable(record), [record]);
  const insight = useMemo(() => buildPaymentInsight(record, analysis), [record, analysis]);

  const content = (
    <div style={{ width: SMART_CARD_CONTENT_WIDTH, fontSize: 13, boxSizing: 'border-box' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <span style={{ fontWeight: 600, fontSize: 14 }}>🔍 付款审核</span>
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

export default PaymentAuditPopover;
