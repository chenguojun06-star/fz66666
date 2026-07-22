import type { PayableItem } from '@/services/finance/wagePaymentApi';
import { formatMoney } from '@/utils/format';
import type { AnalysisResult, CheckItem } from './types';

function parseDescriptionFields(desc: string) {
  const m = desc.match(/(\d+)\s*个订单.*?共\s*(\d+)\s*件/);
  const orderCount = m ? parseInt(m[1], 10) : 0;
  const totalQty = m ? parseInt(m[2], 10) : 0;

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

function parsePayrollDescription(desc: string) {
  const scanMatch = desc.match(/(\d+)\s*次扫码/);
  const qtyMatch = desc.match(/共\s*(\d+)\s*件/);
  return {
    scanCount: scanMatch ? parseInt(scanMatch[1], 10) : 0,
    totalQty: qtyMatch ? parseInt(qtyMatch[1], 10) : 0,
  };
}

export function analyzePayable(item: PayableItem): AnalysisResult {
  const checks: CheckItem[] = [];
  const breakdown: { label: string; value: string }[] = [];
  let dangerCount = 0;
  let warnCount = 0;

  const amount = Number(item.amount) || 0;
  const paidAmount = Number(item.paidAmount) || 0;

  if (amount <= 0) {
    checks.push({ label: '金额核验', status: 'danger', detail: '应付金额为0或负数' });
    dangerCount++;
  } else if (amount > 100000) {
    checks.push({ label: '金额核验', status: 'warn', detail: `¥${amount.toLocaleString()} 大额付款` });
    warnCount++;
  } else {
    checks.push({ label: '金额核验', status: 'ok', detail: formatMoney(amount) });
  }

  if (paidAmount > 0) {
    if (paidAmount >= amount) {
      checks.push({ label: '付款状态', status: 'danger', detail: `已付${formatMoney(paidAmount)}，已全额付清` });
      dangerCount++;
    } else {
      const remaining = amount - paidAmount;
      checks.push({ label: '付款状态', status: 'warn', detail: `已付${formatMoney(paidAmount)}，剩余${formatMoney(remaining)}` });
      warnCount++;
    }
  } else {
    checks.push({ label: '付款状态', status: 'ok', detail: '首次付款' });
  }

  if (item.bizType === 'ORDER_SETTLEMENT' && item.description) {
    const p = parseDescriptionFields(item.description);

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

    if (p.orderCount > 0) {
      const avgPerOrder = amount / p.orderCount;
      if (avgPerOrder > 50000) {
        checks.push({ label: '单均金额', status: 'warn', detail: `${p.orderCount}单 · 均¥${avgPerOrder.toLocaleString(undefined, { maximumFractionDigits: 0 })}` });
        warnCount++;
      } else {
        checks.push({ label: '单均金额', status: 'ok', detail: `${p.orderCount}单 · 均¥${avgPerOrder.toLocaleString(undefined, { maximumFractionDigits: 0 })}` });
      }
    }

    const baseQty = p.warehousedQty || p.totalQty;
    if (baseQty > 0) {
      const avgPerPiece = amount / baseQty;
      if (avgPerPiece > 200) {
        checks.push({ label: '件均成本', status: 'warn', detail: `${baseQty.toLocaleString()}件 · 均¥${avgPerPiece.toFixed(1)} 偏高` });
        warnCount++;
      } else if (avgPerPiece < 1 && avgPerPiece > 0) {
        checks.push({ label: '件均成本', status: 'warn', detail: `${baseQty.toLocaleString()}件 · 均${formatMoney(avgPerPiece)} 偏低` });
        warnCount++;
      } else {
        checks.push({ label: '件均成本', status: 'ok', detail: `${baseQty.toLocaleString()}件 · 均¥${avgPerPiece.toFixed(1)}` });
      }
    }

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

    if (p.warehousedQty > 0 && p.orderQty > 0) {
      const warehouseRate = (p.warehousedQty / p.orderQty) * 100;
      if (warehouseRate < 80) {
        checks.push({ label: '入库率', status: 'warn', detail: `${warehouseRate.toFixed(0)}%（${p.warehousedQty}/${p.orderQty}件）` });
        warnCount++;
      } else {
        checks.push({ label: '入库率', status: 'ok', detail: `${warehouseRate.toFixed(0)}%` });
      }
    }

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
    const pp = parsePayrollDescription(item.description || '');
    if (pp.scanCount > 0) breakdown.push({ label: '扫码次数', value: `${pp.scanCount} 次` });
    if (pp.totalQty > 0) breakdown.push({ label: '完成件数', value: `${pp.totalQty} 件` });
    if (pp.totalQty > 0 && amount > 0) {
      const avgPerPiece = amount / pp.totalQty;
      if (avgPerPiece < 2) {
        checks.push({ label: '件均工资', status: 'warn', detail: `${formatMoney(avgPerPiece)}/件，偏低` });
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
      checks.push({ label: '报销审查', status: 'ok', detail: `${formatMoney(amount)} 金额正常` });
    }
    if (/餐饮|招待|接待/.test(desc) && amount > 2000) {
      checks.push({ label: '合规提示', status: 'warn', detail: '接待费用建议附签字审批单' });
      warnCount++;
    }

  } else if (item.bizType === 'RECONCILIATION') {
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
      checks.push({ label: '对账审查', status: 'ok', detail: `${formatMoney(amount)} 金额核实` });
    }
  }

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
