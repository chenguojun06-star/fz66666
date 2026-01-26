import React, { useState, useEffect } from 'react';
import { Card, Form, InputNumber, Button, Row, Col, Statistic, Divider, Space, App } from 'antd';
import { SaveOutlined } from '@ant-design/icons';
import { StyleQuotation, StyleBom, StyleProcess } from '../../../../../types/style';
import api from '../../../../../utils/api';

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
      if (bomResult.code === 200) {
        bomCost = calcBomCost(bomResult.data || []);
      }

      // 3. 自动计算工序成本
      const processRes = await api.get<StyleProcess[]>(`/style/process/list?styleId=${styleId}`);
      const processResult = processRes as Record<string, unknown>;
      let procCost = 0;
      if (processResult.code === 200) {
        procCost = (processResult.data || []).reduce((sum: number, item: any) => sum + (Number(item.price) || 0), 0);
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

  return (
    <div className="style-quotation">
      <Row gutter={24}>
        {/* 左侧：输入表单 */}
        <Col span={16}>
          <Card title="成本核算" variant="borderless">
            <Form form={form} layout="vertical" onValuesChange={calculateTotal}>
              <Row gutter={16}>
                <Col span={12}>
                  <Form.Item label="物料总成本 (自动计算)">
                    <Space.Compact style={{ width: '100%' }}>
                      <Form.Item name="materialCost" noStyle>
                        <InputNumber style={{ width: '100%' }} prefix="¥" readOnly />
                      </Form.Item>
                      <Button type="link" size="small" onClick={fetchData}>
                        刷新
                      </Button>
                    </Space.Compact>
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item label="工序总成本 (自动计算)">
                    <Space.Compact style={{ width: '100%' }}>
                      <Form.Item name="processCost" noStyle>
                        <InputNumber style={{ width: '100%' }} prefix="¥" readOnly />
                      </Form.Item>
                      <Button type="link" size="small" onClick={fetchData}>
                        刷新
                      </Button>
                    </Space.Compact>
                  </Form.Item>
                </Col>
              </Row>

              <Row gutter={16}>
                <Col span={12}>
                  <Form.Item label="其他费用 (包装/运输/管理)" name="otherCost">
                    <InputNumber style={{ width: '100%' }} prefix="¥" min={0} />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item label="目标利润率 (%)">
                    <Space.Compact style={{ width: '100%' }}>
                      <Form.Item name="profitRate" noStyle>
                        <InputNumber style={{ width: '100%' }} min={0} max={100} />
                      </Form.Item>
                      <Button type="primary" onClick={handleSave}>
                        保存
                      </Button>
                    </Space.Compact>
                  </Form.Item>
                </Col>
              </Row>

              <Divider />

              <Row gutter={16}>
                <Col span={12}>
                  <Form.Item label="总成本" name="totalCost">
                    <InputNumber
                      style={{ width: '100%', fontSize: 'var(--font-size-lg)' }}
                      prefix="¥"
                      readOnly
                      precision={2}
                    />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item label="最终报价" name="totalPrice">
                    <InputNumber
                      style={{ width: '100%', fontSize: 'var(--font-size-xl)', fontWeight: 'bold' }}
                      prefix="¥"
                      readOnly
                      precision={2}
                    />
                  </Form.Item>
                </Col>
                <Col span={12} style={{ display: 'flex', alignItems: 'flex-end' }}>
                  <Button type="primary" icon={<SaveOutlined />} onClick={handleSave} size="large" block disabled={Boolean(readOnly)}>
                    保存报价单
                  </Button>
                </Col>
              </Row>
            </Form>
          </Card>
        </Col>

        {/* 右侧：统计看板 */}
        <Col span={8}>
          <Card title="成本结构分析" variant="borderless">
            <div style={{ textAlign: 'center', marginBottom: 24 }}>
              <Statistic
                title="预估毛利"
                value={profit}
                precision={2}
                styles={{ content: { color: '#3f8600' } }}
                prefix="¥"
              />
            </div>
            <Divider />
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <span>物料占比：</span>
                <span style={{ float: 'right' }}>
                  {((totalPrice ? (materialCost / totalPrice) * 100 : 0) || 0).toFixed(1)}%
                </span>
                <div style={{ height: 4, background: '#f0f0f0', marginTop: 4, borderRadius: 2 }}>
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
                <div style={{ height: 4, background: '#f0f0f0', marginTop: 4, borderRadius: 2 }}>
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
    </div>
  );
};

export default StyleQuotationTab;
