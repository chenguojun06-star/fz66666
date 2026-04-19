import React, { useState, useEffect } from 'react';
import { Form, Row, Col, App, Modal, Input } from 'antd';
import { StyleQuotation, StyleBom, StyleProcess } from '@/types/style';
import api from '@/utils/api';
import { useAuth, isAdmin } from '@/utils/AuthContext';
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

const StyleQuotationTab: React.FC<Props> = ({ styleId, styleNo, readOnly, onSaved, totalQty = 0 }) => {
  const { message } = App.useApp();
  const { user } = useAuth();
  const [form] = Form.useForm();
  const [unlockModalOpen, setUnlockModalOpen] = useState(false);
  const [unlockRemark, setUnlockRemark] = useState('');
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

  const fetchData = async () => {
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
        bomCost = bomColorInfo.avgCost;
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
  };

  useEffect(() => { fetchData(); }, [styleId]);

  const calculateTotal = () => {
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
  };

  const handleProcessRateChange = (adjustedTotal: number) => {
    const newProcessCost = Number((adjustedTotal + secBaseTotal).toFixed(2));
    form.setFieldValue('processCost', newProcessCost);
    calculateTotal();
  };

  const handleSave = async () => {
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

  return (
    <div className="style-quotation" style={{ padding: '0 8px' }}>
      {styleNo && (
        <div style={{ marginBottom: 12, fontWeight: 600, fontSize: 15, color: '#333' }}>
          款号：{styleNo}
        </div>
      )}
      <Modal
        title="解锁报价单"
        open={unlockModalOpen}
        onOk={handleUnlockConfirm}
        onCancel={() => { setUnlockModalOpen(false); setUnlockRemark(''); }}
        okText="确认解锁"
        cancelText="取消"
      >
        <div style={{ marginBottom: 8 }}>解锁原因/备注（必填）：</div>
        <Input.TextArea
          id="unlockRemark"
          value={unlockRemark}
          onChange={(e) => setUnlockRemark(e.target.value)}
          rows={3}
          placeholder="请填写解锁原因..."
        />
      </Modal>
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
