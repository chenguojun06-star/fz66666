import React, { useState, useEffect } from 'react';
import { Card, Form, InputNumber, Button, Row, Col, Statistic, Divider, App } from 'antd';
import ResizableTable from '@/components/common/ResizableTable';
import { SaveOutlined, LockOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { StyleQuotation, StyleBom, StyleProcess } from '@/types/style';
import api, { toNumberSafe } from '@/utils/api';
import { getMaterialTypeLabel } from '@/utils/materialType';
import ProcessStageSummary from './ProcessStageSummary';

interface Props {
  styleId: string | number;
  readOnly?: boolean;
  onSaved?: () => void;
  totalQty?: number;
}

const StyleQuotationTab: React.FC<Props> = ({ styleId, readOnly, onSaved, totalQty = 0 }) => {
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const [_loading, setLoading] = useState(false);
  const [quotation, setQuotation] = useState<StyleQuotation | null>(null);
  const [bomList, setBomList] = useState<StyleBom[]>([]);
  const [processList, setProcessList] = useState<StyleProcess[]>([]);
  const [secondaryProcessList, setSecondaryProcessList] = useState<any[]>([]);
  const [isLocked, setIsLocked] = useState(false);
  const [bomColorCosts, setBomColorCosts] = useState<{ costByColor: Record<string, number>; avgCost: number; maxCost: number; colors: string[] }>({
    costByColor: {},
    avgCost: 0,
    maxCost: 0,
    colors: [],
  });

  const materialCost = Number(Form.useWatch('materialCost', form)) || 0;
  const processCost = Number(Form.useWatch('processCost', form)) || 0;
  const otherCost = Number(Form.useWatch('otherCost', form)) || 0;
  const profitRate = Number(Form.useWatch('profitRate', form)) || 0;
  const totalCost = materialCost + processCost + otherCost;

  const getTotalPrice = () => {
    const val = form.getFieldValue('totalPrice');
    return Number(val) || 0;
  };
  const totalPrice = getTotalPrice();
  const profit = totalPrice - totalCost;
  const actualProfitRate = totalPrice > 0 ? ((profit / totalPrice) * 100).toFixed(1) : '0.0';

  const calcBomCost = (items: any[]) => {
    return (items || []).reduce((sum: number, item: any) => {
      const rawTotalPrice = item?.totalPrice;
      const hasTotalPrice = rawTotalPrice !== undefined && rawTotalPrice !== null && String(rawTotalPrice).trim() !== '';
      if (hasTotalPrice) {
        const n = typeof rawTotalPrice === 'number' ? rawTotalPrice : Number(rawTotalPrice);
        if (Number.isFinite(n)) return sum + n;
      }

      const usageAmount = Number(item?.usageAmount) || 0;
      const lossRate = Number(item?.lossRate) || 0;
      const unitPrice = Number(item?.unitPrice) || 0;
      const qty = usageAmount * (1 + lossRate / 100);
      return sum + qty * unitPrice;
    }, 0);
  };

  // 按颜色分组计算BOM成本（每个颜色单独计算一件的成本，取平均值或最大值）
  const calcBomCostByColor = (items: any[]): { costByColor: Record<string, number>; avgCost: number; maxCost: number; colors: string[] } => {
    const colorGroups: Record<string, any[]> = {};

    (items || []).forEach((item: any) => {
      const color = String(item?.color || '默认').trim() || '默认';
      if (!colorGroups[color]) {
        colorGroups[color] = [];
      }
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

  // 获取报价单及关联成本
  const fetchData = async () => {
    if (!styleId || styleId === 'undefined') {
      return;
    }
    setLoading(true);
    try {
      // 1. 获取现有报价单
      const quoteRes = await api.get<StyleQuotation>(`/style/quotation?styleId=${styleId}`);
      const quoteResult = quoteRes as any;
      const existing = quoteResult.code === 200 ? (quoteResult.data as any) : null;

      // 2. 自动计算物料清单成本（按颜色分组，取单件成本）
      const bomRes = await api.get<StyleBom[]>(`/style/bom/list?styleId=${styleId}`);
      const bomResult = bomRes as any;
      let bomCost = 0;
      let bomData: StyleBom[] = [];
      if (bomResult.code === 200) {
        bomData = (bomResult.data || []) as StyleBom[];
        // 按颜色分组计算，取平均成本作为单件物料成本
        const bomColorInfo = calcBomCostByColor(bomData);
        bomCost = bomColorInfo.avgCost; // 使用平均成本
        setBomList(bomData);
        setBomColorCosts(bomColorInfo);
      }

      // 3. 自动计算工序成本
      const processRes = await api.get<StyleProcess[]>(`/style/process/list?styleId=${styleId}`);
      const processResult = processRes as any;
      let procCost = 0;
      let processData: StyleProcess[] = [];
      if (processResult.code === 200) {
        processData = (processResult.data || []) as StyleProcess[];
        procCost = processData.reduce((sum: number, item: any) => sum + (Number(item.price) || 0), 0);
        setProcessList(processData);
      }

      // 4. 自动计算二次工艺费用（用 unitPrice 单价，报价单算单件成本）
      const secondaryProcessRes = await api.get<any[]>(`/style/secondary-process/list?styleId=${styleId}`);
      const secondaryProcessResult = secondaryProcessRes as any;
      let secondaryCost = 0;
      let secondaryData: any[] = [];
      if (secondaryProcessResult.code === 200) {
        secondaryData = (secondaryProcessResult.data || []) as any[];
        secondaryCost = secondaryData.reduce((sum: number, item: any) => sum + (Number(item.unitPrice) || 0), 0);
        setSecondaryProcessList(secondaryData);
      }

      // 工序总成本 = 普通工序 + 二次工艺
      const totalProcessCost = procCost + secondaryCost;

      const baseValues = existing
        ? {
          ...existing,
          profitRate: existing.profitRate ?? 20,
          otherCost: existing.otherCost ?? 0,
        }
        : {
          profitRate: 20,
          otherCost: 0,
        };

      const nextValues = {
        ...baseValues,
        materialCost: Number(bomCost.toFixed(2)),
        processCost: Number(totalProcessCost.toFixed(2)),
      };

      setQuotation(existing ? nextValues : null);
      form.setFieldsValue(nextValues);
      // 设置锁定状态
      if (existing && 'isLocked' in existing) {
        setIsLocked(existing.isLocked === 1);
      }
      calculateTotal();
    } catch (error) {
      message.error('获取报价信息失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [styleId]);

  // 计算总价
  const calculateTotal = () => {
    const values = form.getFieldsValue();
    const material = Number(values.materialCost) || 0;
    const process = Number(values.processCost) || 0;
    const other = Number(values.otherCost) || 0;
    const rate = Number(values.profitRate) || 0;

    const cost = material + process + other;
    const total = cost * (1 + rate / 100);

    form.setFieldsValue({
      totalCost: Number(cost.toFixed(2)),
      totalPrice: Number(total.toFixed(2))
    });
  };

  // 保存
  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      const data = {
        ...(quotation || {}),
        ...values,
        styleId,
        isLocked: 1, // 保存后锁定
      };
      const res = await api.post('/style/quotation', data);
      const result = res as any;
      if (result.code === 200) {
        message.success('保存成功，报价单已锁定');
        setIsLocked(true); // 保存后锁定
        // 保存后自动刷新，不触发页面跳转
        await fetchData();
        onSaved?.();
      } else {
        message.error(result.message || '保存失败');
      }
    } catch (error) {
      message.error('保存失败');
    }
  };

  // 维护（解锁）
  const handleUnlock = async () => {
    try {
      // 更新后端锁定状态
      const payload = {
        ...quotation,
        isLocked: 0, // 解锁
      };
      await api.put('/style/quotation', payload);
      setIsLocked(false);
      message.success('已解锁，可以编辑');
    } catch (error: any) {
      message.error(error.message || '解锁失败');
    }
  };

  // BOM 表格列定义
  const bomColumns: ColumnsType<StyleBom> = [
    { title: '物料类型', dataIndex: 'materialType', key: 'materialType', width: 100,
      render: (v: unknown) => getMaterialTypeLabel(v) || '-' },
    { title: '物料编码', dataIndex: 'materialCode', key: 'materialCode', width: 120,
      render: (v: unknown) => String(v || '').trim() || '-' },
    { title: '物料名称', dataIndex: 'materialName', key: 'materialName', width: 160, ellipsis: true,
      render: (v: unknown) => String(v || '').trim() || '-' },
    { title: '规格/幅宽', dataIndex: 'specifications', key: 'specifications', width: 140, ellipsis: true,
      render: (v: unknown) => String(v || '').trim() || '-' },
    { title: '单位', dataIndex: 'unit', key: 'unit', width: 70,
      render: (v: unknown) => String(v || '').trim() || '-' },
    { title: '用量', dataIndex: 'usageAmount', key: 'usageAmount', width: 90, align: 'right',
      render: (v: unknown) => toNumberSafe(v).toFixed(2) },
    { title: '损耗率%', dataIndex: 'lossRate', key: 'lossRate', width: 90, align: 'right',
      render: (v: unknown) => toNumberSafe(v).toFixed(1) },
    { title: '单价', dataIndex: 'unitPrice', key: 'unitPrice', width: 90, align: 'right',
      render: (v: unknown) => `¥${toNumberSafe(v).toFixed(2)}` },
    { title: '总价', dataIndex: 'totalPrice', key: 'totalPrice', width: 100, align: 'right',
      render: (_: unknown, record: StyleBom) => {
        const usageAmount = toNumberSafe(record.usageAmount);
        const lossRate = toNumberSafe(record.lossRate);
        const unitPrice = toNumberSafe(record.unitPrice);
        const qty = usageAmount * (1 + lossRate / 100);
        const total = qty * unitPrice;
        return <span style={{ color: 'var(--primary-color)', fontWeight: 600 }}>¥{total.toFixed(2)}</span>;
      }
    },
  ];

  // 工序表格列定义
  const processColumns: ColumnsType<StyleProcess> = [
    { title: '序号', dataIndex: 'sortOrder', key: 'sortOrder', width: 70, align: 'center',
      render: (v: unknown) => toNumberSafe(v) || '-' },
    { title: '工序名称', dataIndex: 'processName', key: 'processName', width: 140,
      render: (v: unknown) => String(v || '').trim() || '-' },
    { title: '工序描述', dataIndex: 'description', key: 'description', ellipsis: true,
      render: (v: unknown) => String(v || '').trim() || '-' },
    { title: '单价', dataIndex: 'price', key: 'price', width: 100, align: 'right',
      render: (v: unknown) => <span style={{ color: 'var(--color-success)', fontWeight: 600 }}>¥{toNumberSafe(v).toFixed(2)}</span> },
  ];

  // 二次工艺表格列定义
  const secondaryProcessColumns: ColumnsType<any> = [
    { title: '序号', dataIndex: 'sortOrder', key: 'sortOrder', width: 70, align: 'center',
      render: (v: unknown, _: any, index: number) => toNumberSafe(v) || index + 1 },
    { title: '工艺名称', dataIndex: 'processName', key: 'processName', width: 120,
      render: (v: unknown) => String(v || '').trim() || '-' },
    { title: '工艺描述', dataIndex: 'description', key: 'description', ellipsis: true,
      render: (v: unknown) => String(v || '').trim() || '-' },
    { title: '领取人', dataIndex: 'assignee', key: 'assignee', width: 100,
      render: (v: unknown) => String(v || '').trim() || '-' },
    { title: '完成时间', dataIndex: 'completedTime', key: 'completedTime', width: 160,
      render: (v: unknown) => v ? String(v) : '-' },
    { title: '单价', dataIndex: 'unitPrice', key: 'unitPrice', width: 100, align: 'right',
      render: (v: unknown) => <span style={{ color: 'var(--color-warning)', fontWeight: 600 }}>¥{toNumberSafe(v).toFixed(2)}</span> },
  ];

  return (
    <div className="style-quotation" style={{ padding: '0 4px' }}>
      {/* 1. 成本核算 - 顶部 */}
      <Row gutter={8} style={{ marginBottom: 8 }}>
        <Col span={14}>
          <Card title="📊 成本核算" size="small" style={{ height: '100%' }} styles={{ body: { padding: '8px' } }}>
            <Form form={form} layout="vertical" onValuesChange={calculateTotal} size="small">
              <Row gutter={8}>
                <Col span={8}>
                  <Form.Item label={<span style={{ fontSize: '14px', fontWeight: 600 }}>物料总成本 (自动)</span>} style={{ marginBottom: 4 }}>
                    <Form.Item name="materialCost" noStyle>
                      <InputNumber
                        size="middle"
                        style={{
                          width: '100%',
                          fontSize: '16px',
                          backgroundColor: 'var(--color-bg-subtle)',
                          cursor: 'not-allowed'
                        }}
                        prefix="¥"
                        readOnly
                        disabled
                      />
                    </Form.Item>
                  </Form.Item>
                </Col>
                <Col span={8}>
                  <Form.Item label={<span style={{ fontSize: '14px', fontWeight: 600 }}>工序总成本 (自动)</span>} style={{ marginBottom: 4 }}>
                    <Form.Item name="processCost" noStyle>
                      <InputNumber
                        size="middle"
                        style={{
                          width: '100%',
                          fontSize: '16px',
                          backgroundColor: 'var(--color-bg-subtle)',
                          cursor: 'not-allowed'
                        }}
                        prefix="¥"
                        readOnly
                        disabled
                      />
                    </Form.Item>
                  </Form.Item>
                </Col>
                <Col span={8}>
                  <Form.Item label={<span style={{ fontSize: '14px', fontWeight: 600 }}>其他费用</span>} name="otherCost" style={{ marginBottom: 4 }}>
                    <InputNumber size="middle" style={{ width: '100%', fontSize: '16px' }} prefix="￥" min={0} disabled={isLocked} />
                  </Form.Item>
                </Col>
              </Row>
              <Row gutter={8}>
                <Col span={8}>
                  <Form.Item label={<span style={{ fontSize: '14px', fontWeight: 600 }}>目标利润率 (%)</span>} name="profitRate" style={{ marginBottom: 4 }}>
                    <InputNumber size="middle" style={{ width: '100%', fontSize: '16px' }} min={0} max={100} disabled={isLocked} />
                  </Form.Item>
                </Col>
                <Col span={8}>
                  <div style={{ marginBottom: 4 }}>
                    <div style={{ fontSize: '14px', fontWeight: 600, marginBottom: 4, color: 'rgba(0, 0, 0, 0.88)' }}>总成本</div>
                    <Statistic
                      value={form.getFieldValue('totalCost') || 0}
                      precision={2}
                      prefix="¥"
                      style={{ fontSize: '16px', color: 'var(--primary-color)' }}
                    />
                  </div>
                </Col>
                <Col span={8}>
                  <div style={{ marginBottom: 4 }}>
                    <div style={{ fontSize: '14px', fontWeight: 600, marginBottom: 4, color: 'rgba(0, 0, 0, 0.88)' }}>最终报价</div>
                    <Statistic
                      value={form.getFieldValue('totalPrice') || 0}
                      precision={2}
                      prefix="¥"
                      style={{ fontSize: '18px', fontWeight: 'bold', color: 'var(--color-danger)' }}
                    />
                  </div>
                </Col>
              </Row>
              {!readOnly && (
                <Row gutter={8}>
                  <Col span={isLocked ? 12 : 24}>
                    <Button
                      type="primary"
                      icon={isLocked ? <LockOutlined /> : <SaveOutlined />}
                      onClick={handleSave}
                      size="middle"
                      block
                      disabled={isLocked}
                      style={{
                        fontSize: '14px',
                        marginTop: '4px',
                        height: '40px',
                        backgroundColor: isLocked ? 'var(--neutral-border)' : undefined,
                        borderColor: isLocked ? 'var(--neutral-border)' : undefined,
                        color: isLocked ? 'var(--neutral-text-disabled)' : undefined,
                      }}
                    >
                      {isLocked ? '已保存（已锁定）' : '保存报价单'}
                    </Button>
                  </Col>
                  {isLocked && (
                    <Col span={12}>
                      <Button
                        type="default"
                        onClick={handleUnlock}
                        size="middle"
                        block
                        danger
                        style={{ fontSize: '14px', marginTop: '4px', height: '40px' }}
                      >
                        维护
                      </Button>
                    </Col>
                  )}
                </Row>
              )}
            </Form>
          </Card>
        </Col>
        <Col span={4}>
          <Card title="🔧 工序单价拆解" size="small" style={{ height: '100%' }} styles={{ body: { padding: '8px' } }}>
            <ProcessStageSummary data={processList} />
          </Card>
        </Col>
        <Col span={6}>
          <Card title="💰 成本结构" size="small" style={{ height: '100%' }} styles={{ body: { padding: '12px' } }}>
            <div style={{ textAlign: 'center', marginBottom: 16 }}>
              <div style={{ fontSize: '13px', color: 'var(--neutral-text-disabled)', marginBottom: 8 }}>预计可赚</div>
              <div style={{
                fontSize: '20px',
                fontWeight: 700,
                color: profit >= 0 ? 'var(--success-color-dark)' : 'var(--color-danger)',
                marginBottom: 4
              }}>
                {profit >= 0 ? '+' : ''}¥{profit.toFixed(2)}
              </div>
              <div style={{ fontSize: '12px', color: profit >= 0 ? 'var(--color-success)' : 'var(--color-danger)' }}>
                {profit >= 0 ? `✓ 利润率 ${profitRate}%` : '✗ 报价低于成本'}
              </div>
            </div>
            <Divider style={{ margin: '12px 0' }} />
            <div style={{ fontSize: '13px', lineHeight: 1.8 }}>
              <div style={{ marginBottom: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ fontWeight: 600, color: 'var(--primary-color)' }}>物料占比：</span>
                  <span style={{ fontWeight: 700, fontSize: '14px', color: 'var(--primary-color)' }}>
                    {totalCost > 0 ? ((materialCost / totalCost) * 100).toFixed(1) : '0.0'}%
                  </span>
                </div>
                <div style={{ height: 6, background: 'var(--color-bg-subtle)' }}>
                  <div style={{
                    width: `${totalCost > 0 ? (materialCost / totalCost) * 100 : 0}%`,
                    height: '100%',
                    background: 'var(--primary-color)',
                    transition: 'width 0.3s ease'
                  }} />
                </div>
              </div>
              <div style={{ marginBottom: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ fontWeight: 600, color: 'var(--color-success)' }}>工序占比：</span>
                  <span style={{ fontWeight: 700, fontSize: '14px', color: 'var(--color-success)' }}>
                    {totalCost > 0 ? ((processCost / totalCost) * 100).toFixed(1) : '0.0'}%
                  </span>
                </div>
                <div style={{ height: 6, background: 'var(--color-bg-subtle)' }}>
                  <div style={{
                    width: `${totalCost > 0 ? (processCost / totalCost) * 100 : 0}%`,
                    height: '100%',
                    background: 'var(--color-success)',
                    transition: 'width 0.3s ease'
                  }} />
                </div>
              </div>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ fontWeight: 600, color: 'var(--color-warning)' }}>利润率：</span>
                  <span style={{ fontWeight: 700, fontSize: '14px', color: 'var(--color-warning)' }}>
                    {totalPrice > 0 ? ((profit / totalPrice) * 100).toFixed(1) : '0.0'}%
                  </span>
                </div>
                <div style={{ height: 6, background: 'var(--color-bg-subtle)' }}>
                  <div style={{
                    width: `${totalPrice > 0 ? (profit / totalPrice) * 100 : 0}%`,
                    height: '100%',
                    background: 'var(--color-warning)',
                    transition: 'width 0.3s ease'
                  }} />
                </div>
              </div>
            </div>
          </Card>
        </Col>
      </Row>

      {/* 实际批次报价汇总（按款式实际数量） */}
      {totalPrice > 0 && (
        <Card
          size="small"
          style={{ marginBottom: 8 }}
          styles={{ body: { padding: 0 } }}
        >
          {/* 标题栏 */}
          <div style={{
            padding: '10px 16px',
            borderBottom: '1px solid var(--neutral-border)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}>
            <span style={{ fontSize: '15px', fontWeight: 600 }}>💰 开发报价明细</span>
            {totalQty > 0 && (
              <span style={{ fontSize: '13px', color: 'var(--neutral-text-secondary)' }}>
                本批数量：<strong>{totalQty} 件</strong>
              </span>
            )}
          </div>

          {/* 成本明细区域 - 两行布局 */}
          <div style={{ padding: '16px' }}>
            {/* 第一行：成本构成 | 报价利润 */}
            <Row gutter={0}>
              <Col span={12} style={{ paddingRight: 24 }}>
                <div style={{ fontSize: '13px', fontWeight: 600, marginBottom: 12, color: 'var(--neutral-text-secondary)' }}>
                  大货成本（单件）
                </div>
                <Row gutter={12}>
                  <Col span={6}>
                    <div style={{ fontSize: '12px', color: 'var(--neutral-text-secondary)' }}>物料成本</div>
                    <div style={{ fontSize: '16px', fontWeight: 600 }}>¥{materialCost.toFixed(2)}</div>
                    {bomColorCosts.colors.length > 1 && (
                      <div style={{ fontSize: '11px', color: 'var(--neutral-text-disabled)' }}>{bomColorCosts.colors.length}色平均</div>
                    )}
                  </Col>
                  <Col span={6}>
                    <div style={{ fontSize: '12px', color: 'var(--neutral-text-secondary)' }}>工序成本</div>
                    <div style={{ fontSize: '16px', fontWeight: 600 }}>¥{processCost.toFixed(2)}</div>
                  </Col>
                  <Col span={6}>
                    <div style={{ fontSize: '12px', color: 'var(--neutral-text-secondary)' }}>其他费用</div>
                    <div style={{ fontSize: '16px', fontWeight: 600 }}>¥{otherCost.toFixed(2)}</div>
                  </Col>
                  <Col span={6}>
                    <div style={{ fontSize: '12px', color: 'var(--neutral-text-secondary)' }}>单件总成本</div>
                    <div style={{ fontSize: '16px', fontWeight: 700 }}>¥{totalCost.toFixed(2)}</div>
                  </Col>
                </Row>
              </Col>
              <Col span={12} style={{ paddingLeft: 24, borderLeft: '1px solid var(--neutral-border)' }}>
                <div style={{ fontSize: '13px', fontWeight: 600, marginBottom: 12, color: 'var(--neutral-text-secondary)' }}>
                  总开发成本
                </div>
                <Row gutter={12}>
                  <Col span={6}>
                    <div style={{ fontSize: '12px', color: 'var(--neutral-text-secondary)' }}>单件报价</div>
                    <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--color-danger)' }}>¥{totalPrice.toFixed(2)}</div>
                    <div style={{ fontSize: '11px', color: 'var(--neutral-text-disabled)' }}>利润率 {actualProfitRate}%</div>
                  </Col>
                  {totalQty > 0 ? (
                    <>
                      <Col span={6}>
                        <div style={{ fontSize: '12px', color: 'var(--neutral-text-secondary)' }}>本批总成本</div>
                        <div style={{ fontSize: '16px', fontWeight: 600 }}>¥{(totalCost * totalQty).toFixed(2)}</div>
                      </Col>
                      <Col span={6}>
                        <div style={{ fontSize: '12px', color: 'var(--neutral-text-secondary)' }}>本批订单总额</div>
                        <div style={{ fontSize: '16px', fontWeight: 600, color: 'var(--color-danger)' }}>¥{(totalPrice * totalQty).toFixed(2)}</div>
                      </Col>
                      <Col span={6}>
                        <div style={{ fontSize: '12px', color: 'var(--neutral-text-secondary)' }}>预计总利润</div>
                        <div style={{ fontSize: '16px', fontWeight: 700, color: (totalPrice - totalCost) * totalQty >= 0 ? 'var(--color-success)' : 'var(--color-danger)' }}>
                          {(totalPrice - totalCost) * totalQty >= 0 ? '+' : ''}¥{((totalPrice - totalCost) * totalQty).toFixed(2)}
                        </div>
                      </Col>
                    </>
                  ) : (
                    <Col span={6}>
                      <div style={{ fontSize: '12px', color: 'var(--neutral-text-secondary)' }}>单件利润</div>
                      <div style={{ fontSize: '16px', fontWeight: 700, color: profit >= 0 ? 'var(--color-success)' : 'var(--color-danger)' }}>
                        {profit >= 0 ? '+' : ''}¥{profit.toFixed(2)}
                      </div>
                    </Col>
                  )}
                </Row>
              </Col>
            </Row>
          </div>
        </Card>
      )}

      {/* 2. BOM 物料清单 - 中部 */}
      <Card
        title={
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '15px', fontWeight: 600 }}>📦 BOM物料清单 ({bomList.length}项)</span>
            <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--primary-color)' }}>
              单件物料成本: ¥{materialCost.toFixed(2)}
              {bomColorCosts.colors.length > 1 && (
                <span style={{ fontSize: '12px', color: 'var(--neutral-text-secondary)', marginLeft: 8 }}>
                  ({bomColorCosts.colors.length}个颜色平均)
                </span>
              )}
            </span>
          </div>
        }
        size="small"
        style={{ marginBottom: 8 }}
        styles={{ body: { padding: '8px' } }}
      >
        {/* 颜色成本明细 */}
        {bomColorCosts.colors.length > 1 && (
          <div style={{ marginBottom: 8, padding: '8px 12px', background: 'var(--color-bg-subtle)', borderRadius: 6 }}>
            <div style={{ fontSize: '12px', color: 'var(--neutral-text-secondary)', marginBottom: 4 }}>各颜色物料成本明细：</div>
            <Row gutter={16}>
              {bomColorCosts.colors.map((color) => (
                <Col key={color}>
                  <span style={{ fontSize: '13px', fontWeight: 500 }}>{color}：</span>
                  <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--primary-color)' }}>¥{(bomColorCosts.costByColor[color] || 0).toFixed(2)}</span>
                </Col>
              ))}
              <Col>
                <span style={{ fontSize: '13px', fontWeight: 500 }}>平均：</span>
                <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--color-danger)' }}>¥{bomColorCosts.avgCost.toFixed(2)}</span>
              </Col>
            </Row>
          </div>
        )}
        <ResizableTable
          storageKey="style-quotation-bom"
          size="middle"
          columns={bomColumns}
          dataSource={bomList}
          rowKey={(r) => String((r as any)?.id || Math.random())}
          pagination={false}
          scroll={{ x: 1100 }}
          style={{ fontSize: '14px' }}
          summary={() => (
            <ResizableTable.Summary fixed>
              <ResizableTable.Summary.Row>
                <ResizableTable.Summary.Cell index={0} colSpan={8} align="right">
                  <strong style={{ fontSize: '15px' }}>物料总成本：</strong>
                </ResizableTable.Summary.Cell>
                <ResizableTable.Summary.Cell index={8} align="right">
                  <strong style={{ color: 'var(--primary-color)', fontSize: '16px', fontWeight: 700 }}>
                    ¥{materialCost.toFixed(2)}
                  </strong>
                </ResizableTable.Summary.Cell>
              </ResizableTable.Summary.Row>
            </ResizableTable.Summary>
          )}
        />
      </Card>

      {/* 3. 工序明细 */}
      <Card
        title={<span style={{ fontSize: '15px', fontWeight: 600 }}>🔧 工序明细 ({processList.length}项) - 小计: ¥{processList.reduce((sum: number, item: any) => sum + (Number(item.price) || 0), 0).toFixed(2)}</span>}
        size="small"
        style={{ marginBottom: 8 }}
        styles={{ body: { padding: '8px' } }}
      >
        <ResizableTable
          storageKey="style-quotation-process"
          size="middle"
          columns={processColumns}
          dataSource={processList}
          rowKey={(r) => String((r as any)?.id || Math.random())}
          pagination={false}
          scroll={{ x: 700 }}
          style={{ fontSize: '14px' }}
          summary={() => {
            const processTotal = processList.reduce((sum: number, item: any) => sum + (Number(item.price) || 0), 0);
            return (
              <ResizableTable.Summary fixed>
                <ResizableTable.Summary.Row>
                  <ResizableTable.Summary.Cell index={0} colSpan={3} align="right">
                    <strong style={{ fontSize: '15px' }}>工序小计：</strong>
                  </ResizableTable.Summary.Cell>
                  <ResizableTable.Summary.Cell index={3} align="right">
                    <strong style={{ color: 'var(--color-success)', fontSize: '16px', fontWeight: 700 }}>
                      ¥{processTotal.toFixed(2)}
                    </strong>
                  </ResizableTable.Summary.Cell>
                </ResizableTable.Summary.Row>
              </ResizableTable.Summary>
            );
          }}
        />
      </Card>

      {/* 4. 二次工艺明细 */}
      {secondaryProcessList.length > 0 && (
        <Card
          title={<span style={{ fontSize: '15px', fontWeight: 600 }}>✨ 二次工艺明细 ({secondaryProcessList.length}项) - 单件小计: ¥{secondaryProcessList.reduce((sum, item) => sum + (Number(item.unitPrice) || 0), 0).toFixed(2)}</span>}
          size="small"
          styles={{ body: { padding: '8px' } }}
        >
          <ResizableTable
            storageKey="style-quotation-secondary"
            size="middle"
            columns={secondaryProcessColumns}
            dataSource={secondaryProcessList}
            rowKey={(r) => String((r as any)?.id || Math.random())}
            pagination={false}
            scroll={{ x: 960 }}
            style={{ fontSize: '14px' }}
            summary={() => {
              const secondaryTotal = secondaryProcessList.reduce((sum, item) => sum + (Number(item.unitPrice) || 0), 0);
              return (
                <ResizableTable.Summary fixed>
                  <ResizableTable.Summary.Row>
                    <ResizableTable.Summary.Cell index={0} colSpan={5} align="right">
                      <strong style={{ fontSize: '15px' }}>二次工艺总费用：</strong>
                    </ResizableTable.Summary.Cell>
                    <ResizableTable.Summary.Cell index={5} align="right">
                      <strong style={{ color: 'var(--color-warning)', fontSize: '16px', fontWeight: 700 }}>
                        ¥{secondaryTotal.toFixed(2)}
                      </strong>
                    </ResizableTable.Summary.Cell>
                  </ResizableTable.Summary.Row>
                </ResizableTable.Summary>
              );
            }}
          />
        </Card>
      )}

      {/* 5. 工序成本汇总 */}
      {secondaryProcessList.length > 0 && (
        <Card
          size="small"
          styles={{ body: { padding: '12px', background: 'rgba(34, 197, 94, 0.15)' } }}
        >
          <Row justify="space-between" align="middle">
            <Col>
              <span style={{ fontSize: '15px', fontWeight: 600 }}>
                💰 工序总成本（普通工序 + 二次工艺）
              </span>
            </Col>
            <Col>
              <span style={{ fontSize: '20px', fontWeight: 700, color: 'var(--color-success)' }}>
                ¥{processCost.toFixed(2)}
              </span>
              <span style={{ fontSize: '13px', color: 'var(--neutral-text-disabled)', marginLeft: 8 }}>
                = ¥{processList.reduce((sum: number, item: any) => sum + (Number(item.price) || 0), 0).toFixed(2)} + ¥{secondaryProcessList.reduce((sum, item) => sum + (Number(item.unitPrice) || 0), 0).toFixed(2)}
              </span>
            </Col>
          </Row>
        </Card>
      )}
    </div>
  );
};

export default StyleQuotationTab;
