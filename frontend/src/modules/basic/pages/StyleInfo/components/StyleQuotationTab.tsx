import React, { useState, useEffect, useCallback } from 'react';
import { Form, Row, Col, App, Input, Button } from 'antd';
import { PrinterOutlined } from '@ant-design/icons';
import ResizableModal from '@/components/common/ResizableModal';
import { StyleQuotation, StyleBom, StyleProcess } from '@/types/style';
import api from '@/utils/api';
import { formatMoney } from '@/utils/format';
import { useUser, isAdmin } from '@/utils/AuthContext';
import { getMaterialTypeLabel } from '@/utils/materialType';
import QuotationBomSection, { type BomColorCosts } from './styleQuotation/QuotationBomSection';
import QuotationProcessSection from './styleQuotation/QuotationProcessSection';
import QuotationSecondarySection from './styleQuotation/QuotationSecondarySection';
import QuotationAuditSection from './styleQuotation/QuotationAuditSection';
import QuotationCostPanel from './styleQuotation/QuotationCostPanel';

interface Props {
  styleId: string | number;
  styleNo?: string;
  readOnly?: boolean;
  onSaved?: () => void;
  totalQty?: number;
}

const calcBomCost = (items: any[]) => {
  return (items || []).reduce((sum: number, item: any) => {
    const rawTotalPrice = item?.totalPrice;
    const hasTotalPrice =
      rawTotalPrice !== undefined && rawTotalPrice !== null && String(rawTotalPrice).trim() !== '';
    if (hasTotalPrice) {
      const n = typeof rawTotalPrice === 'number' ? rawTotalPrice : Number(rawTotalPrice);
      if (Number.isFinite(n)) return sum + n;
    }
    const usageAmount = Number(item?.usageAmount) || 0;
    const lossRate = Number(item?.lossRate) || 0;
    const unitPrice = Number(item?.unitPrice) || 0;
    return sum + usageAmount * (1 + lossRate / 100) * unitPrice;
  }, 0);
};

const calcBomCostByColor = (items: any[]): BomColorCosts => {
  const colorGroups: Record<string, any[]> = {};
  (items || []).forEach((item: any) => {
    const color = String(item?.color || '默认').trim() || '默认';
    if (!colorGroups[color]) colorGroups[color] = [];
    colorGroups[color].push(item);
  });
  const colors = Object.keys(colorGroups);
  const costByColor: Record<string, number> = {};
  colors.forEach((color) => {
    costByColor[color] = calcBomCost(colorGroups[color]);
  });
  const costs = Object.values(costByColor);
  const avgCost = costs.length > 0 ? costs.reduce((a, b) => a + b, 0) / costs.length : 0;
  const maxCost = costs.length > 0 ? Math.max(...costs) : 0;
  return { costByColor, avgCost, maxCost, colors };
};

const StyleQuotationTab: React.FC<Props> = ({ styleId, styleNo, readOnly, onSaved, totalQty = 0 }) => {
  const { message } = App.useApp();
  const { user } = useUser();
  const [form] = Form.useForm();
  const [unlockModalOpen, setUnlockModalOpen] = useState(false);
  const [unlockRemark, setUnlockRemark] = useState('');
  const [unlockSubmitting, setUnlockSubmitting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [_loading, setLoading] = useState(false);
  const [quotation, setQuotation] = useState<StyleQuotation | null>(null);
  const [bomList, setBomList] = useState<StyleBom[]>([]);
  const [processList, setProcessList] = useState<StyleProcess[]>([]);
  const [secondaryProcessList, setSecondaryProcessList] = useState<any[]>([]);
  const [isLocked, setIsLocked] = useState(false);
  const [auditStatus, setAuditStatus] = useState<number>(0);
  const [auditRemark, setAuditRemark] = useState('');
  const [auditSubmitting, setAuditSubmitting] = useState(false);
  const [_procBaseTotal, setProcBaseTotal] = useState(0);
  const [secBaseTotal, setSecBaseTotal] = useState(0);
  const [bomColorCosts, setBomColorCosts] = useState<BomColorCosts>({
    costByColor: {},
    avgCost: 0,
    maxCost: 0,
    colors: [],
  });

  const materialCost = Number(Form.useWatch('materialCost', form)) || 0;
  const processCost = Number(Form.useWatch('processCost', form)) || 0;
  const otherCost = Number(Form.useWatch('otherCost', form)) || 0;
  void (Form.useWatch('profitRate', form));
  const totalCost = materialCost + processCost + otherCost;
  const totalPrice = Number(form.getFieldValue('totalPrice')) || 0;
  const profit = totalPrice - totalCost;
  const actualProfitRate = totalPrice > 0 ? ((profit / totalPrice) * 100).toFixed(1) : '0.0';
  const totalDevMaterialCost = bomList.reduce((sum: number, item: any) => {
    return sum + (Number(item.devUsageAmount) || 0) * (Number(item.unitPrice) || 0);
  }, 0);

  const calculateTotal = useCallback(() => {
    const values = form.getFieldsValue();
    const cost =
      (Number(values.materialCost) || 0) +
      (Number(values.processCost) || 0) +
      (Number(values.otherCost) || 0);
    const rate = Number(values.profitRate) || 0;
    form.setFieldsValue({
      totalCost: Number(cost.toFixed(2)),
      totalPrice: Number((cost * (1 + rate / 100)).toFixed(2)),
    });
  }, [form]);

  const fetchData = useCallback(async () => {
    if (!styleId || styleId === 'undefined') return;
    setLoading(true);
    try {
      const quoteRes = await api.get<StyleQuotation>(`/style/quotation?styleId=${styleId}`);
      const quoteResult = quoteRes as any;
      const existing = quoteResult.code === 200 ? (quoteResult.data as any) : null;

      const bomRes = await api.get<StyleBom[]>(`/style/bom/list?styleId=${styleId}`);
      const bomResult = bomRes as any;
      let bomCost = 0;
      let bomData: StyleBom[] = [];
      if (bomResult.code === 200) {
        bomData = (bomResult.data || []) as StyleBom[];
        const bomColorInfo = calcBomCostByColor(bomData);
        bomCost = calcBomCost(bomData);
        setBomList(bomData);
        setBomColorCosts(bomColorInfo);
      }

      const processRes = await api.get<StyleProcess[]>(`/style/process/list?styleId=${styleId}`);
      const processResult = processRes as any;
      let procCost = 0;
      let processData: StyleProcess[] = [];
      if (processResult.code === 200) {
        processData = (processResult.data || []) as StyleProcess[];
      }

      const secondaryRes = await api.get<any[]>(`/style/secondary-process/list?styleId=${styleId}`);
      const secondaryResult = secondaryRes as any;
      let secondaryCost = 0;
      let secondaryData: any[] = [];
      if (secondaryResult.code === 200) {
        secondaryData = (secondaryResult.data || []) as any[];
        secondaryCost = secondaryData.reduce(
          (sum: number, item: any) => sum + (Number(item.unitPrice) || 0),
          0,
        );
        setSecondaryProcessList(secondaryData);
      }

      // 过滤：二次工艺的 processName（如"绣花"）是父节点 key，
      // 主工序中凡 progressStage 命中该父节点的子工序全部排除（动态兼容新增子节点）
      // processName 直接命中作兜底（progressStage 未赋值时）
      const secondaryParentNames = new Set(
        secondaryData.map((s: any) => String(s.processName || '').trim()).filter(Boolean),
      );
      const primaryDisplayList = processData.filter((p: any) => {
        const stage = String((p as any).progressStage || '').trim();
        const name = String(p.processName || '').trim();
        return !(secondaryParentNames.has(stage) || secondaryParentNames.has(name));
      });
      // 按父进度阶段分组汇总（只展示父节点，不展示子工序）
      const stageMap = new Map<string, number>();
      primaryDisplayList.forEach((p: any) => {
        const stage = String(p.progressStage || p.processName || '').trim();
        const price = (Number(p.price) || 0) * (Number(p.rateMultiplier) || 1);
        stageMap.set(stage, (stageMap.get(stage) || 0) + price);
      });
      const groupedByStage = Array.from(stageMap.entries()).map(([stage, total], idx) => ({
        id: `stage-${idx}`,
        progressStage: stage,
        processName: stage,
        price: Number(total.toFixed(2)),
        rateMultiplier: 1,
      }));
      procCost = groupedByStage.reduce(
        (sum: number, item: any) => sum + (Number(item.price) || 0),
        0,
      );
      setProcessList(groupedByStage as any);

      setProcBaseTotal(procCost);
      setSecBaseTotal(secondaryCost);

      const totalProcessCost = procCost + secondaryCost;
      const baseValues = existing
        ? { ...existing, profitRate: existing.profitRate ?? 20, otherCost: existing.otherCost ?? 0 }
        : { profitRate: 20, otherCost: 0 };
      const nextValues = {
        ...baseValues,
        materialCost: Number(bomCost.toFixed(2)),
        processCost: Number(totalProcessCost.toFixed(2)),
      };
      setQuotation(existing ? nextValues : null);
      form.setFieldsValue(nextValues);
      if (existing && 'isLocked' in existing) {
        setIsLocked(existing.isLocked === 1);
      }
      if (existing && 'auditStatus' in existing) {
        setAuditStatus(existing.auditStatus ?? 0);
      }
      calculateTotal();
    } catch {
      message.error('获取报价信息失败');
    } finally {
      setLoading(false);
    }
  }, [styleId, message, form, calculateTotal]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleProcessRateChange = (adjustedTotal: number) => {
    const newProcessCost = Number((adjustedTotal + secBaseTotal).toFixed(2));
    form.setFieldValue('processCost', newProcessCost);
    calculateTotal();
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const values = await form.validateFields();
      const data = { ...(quotation || {}), ...values, styleId, isLocked: 1 };
      const res = (await api.post('/style/quotation', data)) as any;
      if (res.code === 200) {
        message.success('保存成功，报价单已锁定');
        setIsLocked(true);
        await fetchData();
        onSaved?.();
      } else {
        message.error(res.message || '保存失败');
      }
    } catch {
      message.error('保存失败');
    } finally {
      setSaving(false);
    }
  };

  const handleUnlockClick = () => {
    if (!isAdmin(user)) {
      message.error('权限不足，只有管理员以上才可以解锁');
      return;
    }
    setUnlockModalOpen(true);
  };

  const handleUnlockConfirm = async () => {
    if (!unlockRemark.trim()) {
      message.warning('请填写解锁备注');
      return;
    }
    setUnlockSubmitting(true);
    try {
      const res = (await api.post('/style/quotation/unlock', {
        styleId: Number(styleId),
        remark: unlockRemark,
      })) as any;
      if (res?.code === 200 || res?.data === true) {
        setIsLocked(false);
        setUnlockModalOpen(false);
        setUnlockRemark('');
        message.success('已解锁，可以编辑');
      } else {
        message.error(res?.message || '解锁失败');
      }
    } catch (error: unknown) {
      message.error(error instanceof Error ? error.message : '解锁失败');
    } finally {
      setUnlockSubmitting(false);
    }
  };

  const handleAudit = async (newStatus: number) => {
    setAuditSubmitting(true);
    try {
      const res = (await api.post('/style/quotation/audit', {
        styleId: Number(styleId),
        auditStatus: newStatus,
        auditRemark,
      })) as any;
      if (res.code === 200) {
        message.success(newStatus === 1 ? '审核通过' : '已驳回');
        setAuditRemark('');
        await fetchData();
      } else {
        message.error(res.message || '操作失败');
      }
    } catch {
      message.error('操作失败');
    } finally {
      setAuditSubmitting(false);
    }
  };

  // 审核通过后，非管理员禁止修改参数
  const isAuditLocked = auditStatus === 1 && !isAdmin(user);
  const effectiveLocked = isLocked || isAuditLocked;

  // ===== 打印功能 =====
  const buildQuotationPrintHtml = useCallback(() => {
    const esc = (v: any) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    // BOM表行
    const bomRows = bomList.length > 0 ? bomList.map((item: any, idx: number) => {
      const usage = Number(item.usageAmount) || 0;
      const loss = Number(item.lossRate) || 0;
      const unitPrice = Number(item.unitPrice) || 0;
      let rowTotal: number;
      const rawTotal = item.totalPrice;
      const hasTotal = rawTotal !== undefined && rawTotal !== null && String(rawTotal).trim() !== '';
      if (hasTotal) {
        const n = typeof rawTotal === 'number' ? rawTotal : Number(rawTotal);
        rowTotal = Number.isFinite(n) ? n : (usage * (1 + loss / 100) * unitPrice);
      } else {
        rowTotal = usage * (1 + loss / 100) * unitPrice;
      }
      return `<tr>
        <td style="text-align:center">${idx + 1}</td>
        <td>${esc(getMaterialTypeLabel(item.materialType))}</td>
        <td>${esc(item.materialCode)}</td>
        <td>${esc(item.materialName)}</td>
        <td>${esc(item.specification)}</td>
        <td>${esc(item.unit)}</td>
        <td style="text-align:right">${usage.toFixed(2)}</td>
        <td style="text-align:right">${loss.toFixed(1)}%</td>
        <td style="text-align:right">${formatMoney(unitPrice)}</td>
        <td style="text-align:right;font-weight:600">${formatMoney(rowTotal)}</td>
      </tr>`;
    }).join('') : `<tr><td colspan="10" style="text-align:center;color:#999;padding:16px">暂无物料明细</td></tr>`;

    // 工序表行
    const processRows = processList.length > 0 ? processList.map((item: any, idx: number) => {
      const price = (Number(item.price) || 0) * (Number(item.rateMultiplier) || 1);
      return `<tr>
        <td style="text-align:center">${idx + 1}</td>
        <td>${esc(item.progressStage || item.processName)}</td>
        <td style="text-align:right">${formatMoney(price)}</td>
      </tr>`;
    }).join('') : `<tr><td colspan="3" style="text-align:center;color:#999;padding:16px">暂无工序明细</td></tr>`;

    // 二次工艺表行
    const secRows = secondaryProcessList.length > 0 ? secondaryProcessList.map((item: any, idx: number) => {
      return `<tr>
        <td style="text-align:center">${idx + 1}</td>
        <td>${esc(item.processName)}</td>
        <td style="text-align:right">${formatMoney(Number(item.unitPrice) || 0)}</td>
      </tr>`;
    }).join('') : `<tr><td colspan="3" style="text-align:center;color:#999;padding:16px">暂无二次工艺明细</td></tr>`;

    const totalProcessCost = processList.reduce((s: number, i: any) => s + (Number(i.price) || 0) * (Number(i.rateMultiplier) || 1), 0);
    const totalSecCost = secondaryProcessList.reduce((s: number, i: any) => s + (Number(i.unitPrice) || 0), 0);

    const now = new Date();
    const printDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <title>报价单 - ${esc(styleNo || '')}</title>
  <style>
    @page { margin: 10mm; }
    body { font-family: system-ui, -apple-system, "Microsoft YaHei", "PingFang SC", sans-serif; font-size: 12px; color: #333; padding: 20px; background: #fff; line-height: 1.6; }
    .title { text-align: center; font-size: 22px; font-weight: 700; margin-bottom: 4px; letter-spacing: 2px; }
    .subtitle { text-align: center; font-size: 12px; color: #999; margin-bottom: 20px; }
    .info-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px 24px; margin-bottom: 20px; padding: 12px 16px; background: #fafafa; border: 1px solid #e8e8e8; }
    .info-item { display: flex; gap: 8px; }
    .info-label { color: #666; min-width: 80px; }
    .info-value { font-weight: 500; }
    .section { margin-bottom: 20px; page-break-inside: avoid; }
    .section-title { font-size: 14px; font-weight: 600; margin-bottom: 8px; padding-bottom: 6px; border-bottom: 2px solid #1890ff; color: #1a1a1a; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; }
    th, td { border: 1px solid #d9d9d9; padding: 6px 8px; vertical-align: middle; text-align: left; }
    th { background: #fafafa; font-weight: 600; color: #262626; text-align: center; }
    tr.summary-row td { background: #f5f5f5 !important; font-weight: 700; }
    .cost-summary { margin-top: 20px; padding: 16px; background: #f9f9f9; border: 1px solid #d9d9d9; }
    .cost-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px 16px; margin-bottom: 12px; }
    .cost-item { padding: 8px 12px; background: #fff; border: 1px solid #e8e8e8; }
    .cost-label { font-size: 11px; color: #666; margin-bottom: 4px; }
    .cost-value { font-size: 16px; font-weight: 700; color: #1a1a1a; }
    .cost-value.price { color: #f5222d; }
    .cost-value.profit { color: #52c41a; }
    .footer { margin-top: 30px; text-align: center; font-size: 11px; color: #999; }
    .print-btn-bar { position: fixed; top: 10px; right: 10px; z-index: 999; }
    .print-btn { padding: 8px 16px; background: #1890ff; color: #fff; border: none; border-radius: 4px; cursor: pointer; font-size: 13px; }
    @media print {
      .no-print { display: none !important; }
      .print-btn-bar { display: none; }
    }
  </style>
</head>
<body>
  <div class="print-btn-bar no-print">
    <button class="print-btn" onclick="window.print()">🖨️ 打印</button>
  </div>

  <div class="title">报 价 单</div>
  <div class="subtitle">Quotation Sheet</div>

  <div class="info-grid">
    <div class="info-item"><span class="info-label">款号：</span><span class="info-value">${esc(styleNo || '-')}</span></div>
    <div class="info-item"><span class="info-label">打印时间：</span><span class="info-value">${printDate}</span></div>
  </div>

  <div class="section">
    <div class="section-title">一、物料明细（BOM）</div>
    <table>
      <thead>
        <tr>
          <th style="width:50px">序号</th>
          <th style="width:80px">类型</th>
          <th style="width:110px">物料编码</th>
          <th>物料名称</th>
          <th style="width:100px">规格/幅宽</th>
          <th style="width:60px">单位</th>
          <th style="width:80px">用量</th>
          <th style="width:80px">损耗率</th>
          <th style="width:90px">单价</th>
          <th style="width:100px">总价</th>
        </tr>
      </thead>
      <tbody>
        ${bomRows}
        <tr class="summary-row">
          <td colspan="9" style="text-align:right">物料成本合计：</td>
          <td style="text-align:right">${formatMoney(materialCost)}</td>
        </tr>
      </tbody>
    </table>
  </div>

  <div class="section">
    <div class="section-title">二、工序明细</div>
    <table>
      <thead>
        <tr>
          <th style="width:50px">序号</th>
          <th>进度阶段</th>
          <th style="width:140px">工序合计</th>
        </tr>
      </thead>
      <tbody>
        ${processRows}
        <tr class="summary-row">
          <td colspan="2" style="text-align:right">工序成本合计：</td>
          <td style="text-align:right">${formatMoney(totalProcessCost)}</td>
        </tr>
      </tbody>
    </table>
  </div>

  ${secondaryProcessList.length > 0 ? `
  <div class="section">
    <div class="section-title">三、二次工艺明细</div>
    <table>
      <thead>
        <tr>
          <th style="width:50px">序号</th>
          <th>工艺名称</th>
          <th style="width:140px">单价</th>
        </tr>
      </thead>
      <tbody>
        ${secRows}
        <tr class="summary-row">
          <td colspan="2" style="text-align:right">二次工艺成本合计：</td>
          <td style="text-align:right">${formatMoney(totalSecCost)}</td>
        </tr>
      </tbody>
    </table>
  </div>` : ''}

  <div class="cost-summary">
    <div class="section-title" style="border-bottom-color:#52c41a">四、成本与报价汇总</div>
    <div class="cost-grid">
      <div class="cost-item">
        <div class="cost-label">物料成本</div>
        <div class="cost-value">${formatMoney(materialCost)}</div>
      </div>
      <div class="cost-item">
        <div class="cost-label">工序成本</div>
        <div class="cost-value">${formatMoney(processCost)}</div>
      </div>
      <div class="cost-item">
        <div class="cost-label">其他成本</div>
        <div class="cost-value">${formatMoney(otherCost)}</div>
      </div>
      <div class="cost-item">
        <div class="cost-label">单件总成本</div>
        <div class="cost-value">${formatMoney(totalCost)}</div>
      </div>
      <div class="cost-item">
        <div class="cost-label">单件利润</div>
        <div class="cost-value profit">${formatMoney(profit)}</div>
      </div>
      <div class="cost-item">
        <div class="cost-label">单件报价</div>
        <div class="cost-value price">${formatMoney(totalPrice)}</div>
      </div>
    </div>
    <div style="text-align:right;font-size:13px;color:#666;margin-top:8px">
      利润率：${actualProfitRate}%
    </div>
  </div>

  <div class="footer">
    —— 本报价单由系统自动生成，最终报价以双方确认为准 ——
  </div>
</body>
</html>`;
  }, [bomList, processList, secondaryProcessList, styleNo, materialCost, processCost, otherCost, totalCost, totalPrice, profit, actualProfitRate]);

  const handlePrintQuotation = useCallback(() => {
    if (bomList.length === 0 && processList.length === 0) {
      message.warning('暂无可打印的报价数据');
      return;
    }
    const html = buildQuotationPrintHtml();
    const printWindow = window.open('', '_blank', 'width=1000,height=800');
    if (!printWindow) {
      message.warning('请允许弹出窗口以进行打印');
      return;
    }
    printWindow.document.write(html);
    printWindow.document.close();
  }, [bomList, processList, message, buildQuotationPrintHtml]);

  return (
    <div className="style-quotation" style={{ padding: '0 8px' }}>
      {styleNo && (
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          marginBottom: 12,
        }}>
          <div style={{ fontWeight: 600, fontSize: 15, color: 'var(--color-text-primary)' }}>
            款号：{styleNo}
          </div>
          <Button icon={<PrinterOutlined />} onClick={handlePrintQuotation}>打印报价单</Button>
        </div>
      )}
      <ResizableModal
        title="解锁报价单"
        open={unlockModalOpen}
        onOk={handleUnlockConfirm}
        onCancel={() => { setUnlockModalOpen(false); setUnlockRemark(''); }}
        okText="确认解锁"
        cancelText="取消"
        confirmLoading={unlockSubmitting}
      >
        <div style={{ marginBottom: 8 }}>解锁原因/备注（必填）：</div>
        <Input.TextArea
          id="unlockRemark"
          value={unlockRemark}
          onChange={(e) => setUnlockRemark(e.target.value)}
          rows={3}
          placeholder="请填写解锁原因..."
        />
      </ResizableModal>
      <Row gutter={16} align="top">
        <Col span={24}>
          <QuotationBomSection
            bomList={bomList}
            bomColorCosts={bomColorCosts}
            materialCost={materialCost}
          />
          <QuotationProcessSection processList={processList} onRateChange={handleProcessRateChange} isLocked={effectiveLocked} />
          <QuotationSecondarySection
            secondaryProcessList={secondaryProcessList}
          />
          <QuotationCostPanel
            form={form}
            isLocked={effectiveLocked}
            canUnlock={isAdmin(user) && isLocked}
            readOnly={readOnly}
            totalCost={totalCost}
            totalPrice={totalPrice}
            materialCost={materialCost}
            processCost={processCost}
            profit={profit}
            actualProfitRate={actualProfitRate}
            totalQty={totalQty}
            totalDevMaterialCost={totalDevMaterialCost}
            onSave={handleSave}
            onUnlock={handleUnlockClick}
            onValuesChange={calculateTotal}
            saving={saving}
          />
          <QuotationAuditSection
            isLocked={effectiveLocked}
            quotation={quotation}
            auditRemark={auditRemark}
            onRemarkChange={setAuditRemark}
            auditSubmitting={auditSubmitting}
            onAudit={handleAudit}
          />
        </Col>
      </Row>
    </div>
  );
};

export default StyleQuotationTab;
