import React, { useState, useEffect } from 'react';
import { Card, Form, InputNumber, Button, Row, Col, Statistic, Divider, Space, App, Table } from 'antd';
import { SaveOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { StyleQuotation, StyleBom, StyleProcess } from '@/types/style';
import api, { toNumberSafe } from '@/utils/api';
import { getMaterialTypeLabel } from '@/utils/materialType';

interface Props {
  styleId: string | number;
  readOnly?: boolean;
  onSaved?: () => void;
}

const StyleQuotationTab: React.FC<Props> = ({ styleId, readOnly, onSaved }) => {
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const [_loading, setLoading] = useState(false);
  const [quotation, setQuotation] = useState<StyleQuotation | null>(null);
  const [bomList, setBomList] = useState<StyleBom[]>([]);
  const [processList, setProcessList] = useState<StyleProcess[]>([]);

  const materialCost = Number(Form.useWatch('materialCost', form)) || 0;
  const processCost = Number(Form.useWatch('processCost', form)) || 0;
  const otherCost = Number(Form.useWatch('otherCost', form)) || 0;
  const totalPrice = Number(Form.useWatch('totalPrice', form)) || 0;
  const profit = totalPrice - (materialCost + processCost + otherCost);

  const calcBomCost = (items: unknown[]) => {
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

  // 获取报价单及关联成本
  const fetchData = async () => {
    setLoading(true);
    try {
      // 1. 获取现有报价单
      const quoteRes = await api.get<StyleQuotation>(`/style/quotation?styleId=${styleId}`);
      const quoteResult = quoteRes as Record<string, unknown>;
      const existing = quoteResult.code === 200 ? (quoteResult.data as Record<string, unknown>) : null;

      // 2. 自动计算物料清单成本
      const bomRes = await api.get<StyleBom[]>(`/style/bom/list?styleId=${styleId}`);
      const bomResult = bomRes as Record<string, unknown>;
      let bomCost = 0;
      let bomData: StyleBom[] = [];
      if (bomResult.code === 200) {
        bomData = (bomResult.data || []) as StyleBom[];
        bomCost = calcBomCost(bomData);
        setBomList(bomData);
      }

      // 3. 自动计算工序成本
      const processRes = await api.get<StyleProcess[]>(`/style/process/list?styleId=${styleId}`);
      const processResult = processRes as Record<string, unknown>;
      let procCost = 0;
      let processData: StyleProcess[] = [];
      if (processResult.code === 200) {
        processData = (processResult.data || []) as StyleProcess[];
        procCost = processData.reduce((sum: number, item: any) => sum + (Number(item.price) || 0), 0);
        setProcessList(processData);
      }

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
        processCost: Number(procCost.toFixed(2)),
      };

      setQuotation(existing ? nextValues : null);
      form.setFieldsValue(nextValues);
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
        styleId
      };
      const res = await api.post('/style/quotation', data);
      const result = res as Record<string, unknown>;
      if (result.code === 200) {
        message.success('保存成功');
        onSaved?.();
        fetchData();
      } else {
        message.error(result.message || '保存失败');
      }
    } catch (error) {
      message.error('保存失败');
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
    { title: '规格/描述', dataIndex: 'specifications', key: 'specifications', width: 140, ellipsis: true,
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
        return <span style={{ color: '#1890ff', fontWeight: 600 }}>¥{total.toFixed(2)}</span>;
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
      render: (v: unknown) => <span style={{ color: '#52c41a', fontWeight: 600 }}>¥{toNumberSafe(v).toFixed(2)}</span> },
  ];

  return (
    <div className="style-quotation" style={{ padding: '0 4px' }}>
      {/* 1. 成本核算 - 顶部 */}
      <Row gutter={8} style={{ marginBottom: 8 }}>
        <Col span={18}>
          <Card title="💰 成本核算" size="small" style={{ height: '100%' }} styles={{ body: { padding: '8px' } }}>
            <Form form={form} layout="vertical" onValuesChange={calculateTotal} size="small">
              <Row gutter={8}>
                <Col span={8}>
                  <Form.Item label={<span style={{ fontSize: '12px' }}>物料总成本 (自动)</span>} style={{ marginBottom: 4 }}>
                    <Space.Compact style={{ width: '100%' }}>
                      <Form.Item name="materialCost" noStyle>
                        <InputNumber size="small" style={{ width: '100%', fontSize: '12px' }} prefix="¥" readOnly />
                      </Form.Item>
                      {!readOnly && <Button type="link" size="small" onClick={fetchData} style={{ fontSize: '11px' }}>刷新</Button>}
                    </Space.Compact>
                  </Form.Item>
                </Col>
                <Col span={8}>
                  <Form.Item label={<span style={{ fontSize: '12px' }}>工序总成本 (自动)</span>} style={{ marginBottom: 4 }}>
                    <Space.Compact style={{ width: '100%' }}>
                      <Form.Item name="processCost" noStyle>
                        <InputNumber size="small" style={{ width: '100%', fontSize: '12px' }} prefix="¥" readOnly />
                      </Form.Item>
                      {!readOnly && <Button type="link" size="small" onClick={fetchData} style={{ fontSize: '11px' }}>刷新</Button>}
                    </Space.Compact>
                  </Form.Item>
                </Col>
                <Col span={8}>
                  <Form.Item label={<span style={{ fontSize: '12px' }}>其他费用</span>} name="otherCost" style={{ marginBottom: 4 }}>
                    <InputNumber size="small" style={{ width: '100%', fontSize: '12px' }} prefix="¥" min={0} />
                  </Form.Item>
                </Col>
              </Row>
              <Row gutter={8}>
                <Col span={8}>
                  <Form.Item label={<span style={{ fontSize: '12px' }}>目标利润率 (%)</span>} name="profitRate" style={{ marginBottom: 4 }}>
                    <InputNumber size="small" style={{ width: '100%', fontSize: '12px' }} min={0} max={100} />
                  </Form.Item>
                </Col>
                <Col span={8}>
                  <Form.Item label={<span style={{ fontSize: '12px' }}>总成本</span>} name="totalCost" style={{ marginBottom: 4 }}>
                    <InputNumber size="small" style={{ width: '100%', fontSize: '12px' }} prefix="¥" readOnly precision={2} />
                  </Form.Item>
                </Col>
                <Col span={8}>
                  <Form.Item label={<span style={{ fontSize: '12px' }}>最终报价</span>} name="totalPrice" style={{ marginBottom: 4 }}>
                    <InputNumber
                      size="small"
                      style={{ width: '100%', fontSize: '12px', fontWeight: 'bold' }}
                      prefix="¥"
                      readOnly
                      precision={2}
                    />
                  </Form.Item>
                </Col>
              </Row>
              {!readOnly && (
                <Row>
                  <Col span={24}>
                    <Button
                      type="primary"
                      icon={<SaveOutlined />}
                      onClick={handleSave}
                      size="small"
                      block
                      style={{ fontSize: '12px', marginTop: '4px' }}
                    >
                      保存报价单
                    </Button>
                  </Col>
                </Row>
              )}
            </Form>
          </Card>
        </Col>
        <Col span={6}>
          <Card title="成本结构" size="small" style={{ height: '100%' }} styles={{ body: { padding: '8px' } }}>
            <div style={{ textAlign: 'center', marginBottom: 8 }}>
              <Statistic
                title="预估毛利"
                value={profit}
                precision={2}
                styles={{ value: { fontSize: '16px', color: '#3f8600' } }}
                prefix="¥"
              />
            </div>
            <Divider style={{ margin: '6px 0' }} />
            <div style={{ fontSize: '11px' }}>
              <div style={{ marginBottom: 4 }}>
                <span>物料占比：</span>
                <span style={{ float: 'right' }}>
                  {((totalPrice ? (materialCost / totalPrice) * 100 : 0) || 0).toFixed(1)}%
                </span>
                <div style={{ height: 3, background: '#f0f0f0', marginTop: 4, borderRadius: 2 }}>
                  <div style={{
                    width: `${totalPrice ? (materialCost / totalPrice) * 100 : 0}%`,
                    height: '100%',
                    background: '#1890ff',
                    borderRadius: 2
                  }} />
                </div>
              </div>
              <div>
                <span>工费占比：</span>
                <span style={{ float: 'right' }}>
                  {((totalPrice ? (processCost / totalPrice) * 100 : 0) || 0).toFixed(1)}%
                </span>
                <div style={{ height: 3, background: '#f0f0f0', marginTop: 4, borderRadius: 2 }}>
                  <div style={{
                    width: `${totalPrice ? (processCost / totalPrice) * 100 : 0}%`,
                    height: '100%',
                    background: '#52c41a',
                    borderRadius: 2
                  }} />
                </div>
              </div>
            </div>
          </Card>
        </Col>
      </Row>

      {/* 2. BOM 物料清单 - 中部 */}
      <Card
        title={<span style={{ fontSize: '13px' }}>📦 BOM物料清单 ({bomList.length}项) - 总成本: ¥{materialCost.toFixed(2)}</span>}
        size="small"
        style={{ marginBottom: 8 }}
        styles={{ body: { padding: '8px' } }}
      >
        <Table
          size="small"
          columns={bomColumns}
          dataSource={bomList}
          rowKey={(r) => String((r as Record<string, unknown>)?.id || Math.random())}
          pagination={{ pageSize: 5, size: 'small', showSizeChanger: false, simple: true }}
          scroll={{ x: 1100 }}
          style={{ fontSize: '12px' }}
          summary={() => (
            <Table.Summary fixed>
              <Table.Summary.Row>
                <Table.Summary.Cell index={0} colSpan={8} align="right">
                  <strong style={{ fontSize: '12px' }}>物料总成本：</strong>
                </Table.Summary.Cell>
                <Table.Summary.Cell index={8} align="right">
                  <strong style={{ color: '#1890ff', fontSize: '13px' }}>
                    ¥{materialCost.toFixed(2)}
                  </strong>
                </Table.Summary.Cell>
              </Table.Summary.Row>
            </Table.Summary>
          )}
        />
      </Card>

      {/* 3. 工序明细 - 底部 */}
      <Card
        title={<span style={{ fontSize: '13px' }}>🔧 工序明细 ({processList.length}项) - 总成本: ¥{processCost.toFixed(2)}</span>}
        size="small"
        styles={{ body: { padding: '8px' } }}
      >
        <Table
          size="small"
          columns={processColumns}
          dataSource={processList}
          rowKey={(r) => String((r as Record<string, unknown>)?.id || Math.random())}
          pagination={{ pageSize: 5, size: 'small', showSizeChanger: false, simple: true }}
          scroll={{ x: 700 }}
          style={{ fontSize: '12px' }}
          summary={() => (
            <Table.Summary fixed>
              <Table.Summary.Row>
                <Table.Summary.Cell index={0} colSpan={3} align="right">
                  <strong style={{ fontSize: '12px' }}>工序总成本：</strong>
                </Table.Summary.Cell>
                <Table.Summary.Cell index={3} align="right">
                  <strong style={{ color: '#52c41a', fontSize: '13px' }}>
                    ¥{processCost.toFixed(2)}
                  </strong>
                </Table.Summary.Cell>
              </Table.Summary.Row>
            </Table.Summary>
          )}
        />
      </Card>
    </div>
  );
};

export default StyleQuotationTab;
