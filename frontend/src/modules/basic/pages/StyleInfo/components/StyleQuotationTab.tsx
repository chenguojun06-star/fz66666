import React, { useState, useEffect } from 'react';
import { Card, Form, InputNumber, Button, Row, Col, Statistic, Divider, App, Table } from 'antd';
import { SaveOutlined, LockOutlined, EditOutlined } from '@ant-design/icons';
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
  const [secondaryProcessList, setSecondaryProcessList] = useState<any[]>([]);
  const [isLocked, setIsLocked] = useState(false); // 锁定状态

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

      // 4. 自动计算二次工艺费用
      const secondaryProcessRes = await api.get<any[]>(`/style/secondary-process/list?styleId=${styleId}`);
      const secondaryProcessResult = secondaryProcessRes as Record<string, unknown>;
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
      const result = res as Record<string, unknown>;
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
      render: (v: unknown) => <span style={{ color: '#fa8c16', fontWeight: 600 }}>¥{toNumberSafe(v).toFixed(2)}</span> },
  ];

  return (
    <div className="style-quotation" style={{ padding: '0 4px' }}>
      {/* 1. 成本核算 - 顶部 */}
      <Row gutter={8} style={{ marginBottom: 8 }}>
        <Col span={18}>
          <Card title="� 成本核算" size="small" style={{ height: '100%' }} styles={{ body: { padding: '8px' } }}>
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
                          backgroundColor: '#f5f5f5',
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
                          backgroundColor: '#f5f5f5',
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
                      valueStyle={{ fontSize: '16px', color: '#1890ff' }}
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
                      valueStyle={{ fontSize: '18px', fontWeight: 'bold', color: '#ff4d4f' }}
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
                        backgroundColor: isLocked ? '#d9d9d9' : undefined,
                        borderColor: isLocked ? '#d9d9d9' : undefined,
                        color: isLocked ? '#8c8c8c' : undefined,
                      }}
                    >
                      {isLocked ? '已保存（已锁定）' : '保存报价单'}
                    </Button>
                  </Col>
                  {isLocked && (
                    <Col span={12}>
                      <Button
                        type="default"
                        icon={<EditOutlined />}
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
        <Col span={6}>
          <Card title="💰 成本结构" size="small" style={{ height: '100%' }} styles={{ body: { padding: '12px' } }}>
            <div style={{ textAlign: 'center', marginBottom: 12 }}>
              <Statistic
                title="预估毛利"
                value={profit}
                precision={2}
                valueStyle={{ fontSize: '22px', color: '#3f8600', fontWeight: 700 }}
                prefix="¥"
              />
            </div>
            <Divider style={{ margin: '8px 0' }} />
            <div style={{ fontSize: '13px', lineHeight: 1.8 }}>
              <div style={{ marginBottom: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ fontWeight: 600, color: '#1890ff' }}>物料占比：</span>
                  <span style={{ fontWeight: 700, fontSize: '14px', color: '#1890ff' }}>
                    {totalCost > 0 ? ((materialCost / totalCost) * 100).toFixed(1) : '0.0'}%
                  </span>
                </div>
                <div style={{ height: 6, background: '#f0f0f0', borderRadius: 3 }}>
                  <div style={{
                    width: `${totalCost > 0 ? (materialCost / totalCost) * 100 : 0}%`,
                    height: '100%',
                    background: 'linear-gradient(90deg, #1890ff, #40a9ff)',
                    borderRadius: 3,
                    transition: 'width 0.3s ease'
                  }} />
                </div>
              </div>
              <div style={{ marginBottom: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ fontWeight: 600, color: '#52c41a' }}>工序占比：</span>
                  <span style={{ fontWeight: 700, fontSize: '14px', color: '#52c41a' }}>
                    {totalCost > 0 ? ((processCost / totalCost) * 100).toFixed(1) : '0.0'}%
                  </span>
                </div>
                <div style={{ height: 6, background: '#f0f0f0', borderRadius: 3 }}>
                  <div style={{
                    width: `${totalCost > 0 ? (processCost / totalCost) * 100 : 0}%`,
                    height: '100%',
                    background: 'linear-gradient(90deg, #52c41a, #73d13d)',
                    borderRadius: 3,
                    transition: 'width 0.3s ease'
                  }} />
                </div>
              </div>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ fontWeight: 600, color: '#fa8c16' }}>利润率：</span>
                  <span style={{ fontWeight: 700, fontSize: '14px', color: '#fa8c16' }}>
                    {totalPrice > 0 ? ((profit / totalPrice) * 100).toFixed(1) : '0.0'}%
                  </span>
                </div>
                <div style={{ height: 6, background: '#f0f0f0', borderRadius: 3 }}>
                  <div style={{
                    width: `${totalPrice > 0 ? (profit / totalPrice) * 100 : 0}%`,
                    height: '100%',
                    background: 'linear-gradient(90deg, #fa8c16, #ffa940)',
                    borderRadius: 3,
                    transition: 'width 0.3s ease'
                  }} />
                </div>
              </div>
            </div>
          </Card>
        </Col>
      </Row>

      {/* 2. BOM 物料清单 - 中部 */}
      <Card
        title={<span style={{ fontSize: '15px', fontWeight: 600 }}>📦 BOM物料清单 ({bomList.length}项) - 总成本: ¥{materialCost.toFixed(2)}</span>}
        size="small"
        style={{ marginBottom: 8 }}
        styles={{ body: { padding: '8px' } }}
      >
        <Table
          size="middle"
          columns={bomColumns}
          dataSource={bomList}
          rowKey={(r) => String((r as Record<string, unknown>)?.id || Math.random())}
          pagination={false}
          scroll={{ x: 1100 }}
          style={{ fontSize: '14px' }}
          summary={() => (
            <Table.Summary fixed>
              <Table.Summary.Row>
                <Table.Summary.Cell index={0} colSpan={8} align="right">
                  <strong style={{ fontSize: '15px' }}>物料总成本：</strong>
                </Table.Summary.Cell>
                <Table.Summary.Cell index={8} align="right">
                  <strong style={{ color: '#1890ff', fontSize: '16px', fontWeight: 700 }}>
                    ¥{materialCost.toFixed(2)}
                  </strong>
                </Table.Summary.Cell>
              </Table.Summary.Row>
            </Table.Summary>
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
        <Table
          size="middle"
          columns={processColumns}
          dataSource={processList}
          rowKey={(r) => String((r as Record<string, unknown>)?.id || Math.random())}
          pagination={false}
          scroll={{ x: 700 }}
          style={{ fontSize: '14px' }}
          summary={() => {
            const processTotal = processList.reduce((sum: number, item: any) => sum + (Number(item.price) || 0), 0);
            return (
              <Table.Summary fixed>
                <Table.Summary.Row>
                  <Table.Summary.Cell index={0} colSpan={3} align="right">
                    <strong style={{ fontSize: '15px' }}>工序小计：</strong>
                  </Table.Summary.Cell>
                  <Table.Summary.Cell index={3} align="right">
                    <strong style={{ color: '#52c41a', fontSize: '16px', fontWeight: 700 }}>
                      ¥{processTotal.toFixed(2)}
                    </strong>
                  </Table.Summary.Cell>
                </Table.Summary.Row>
              </Table.Summary>
            );
          }}
        />
      </Card>

      {/* 4. 二次工艺明细 */}
      {secondaryProcessList.length > 0 && (
        <Card
          title={<span style={{ fontSize: '15px', fontWeight: 600 }}>✨ 二次工艺明细 ({secondaryProcessList.length}项) - 总费用: ¥{secondaryProcessList.reduce((sum, item) => sum + (Number(item.unitPrice) || 0), 0).toFixed(2)}</span>}
          size="small"
          styles={{ body: { padding: '8px' } }}
        >
          <Table
            size="middle"
            columns={secondaryProcessColumns}
            dataSource={secondaryProcessList}
            rowKey={(r) => String((r as Record<string, unknown>)?.id || Math.random())}
            pagination={false}
            scroll={{ x: 960 }}
            style={{ fontSize: '14px' }}
            summary={() => {
              const secondaryTotal = secondaryProcessList.reduce((sum, item) => sum + (Number(item.unitPrice) || 0), 0);
              return (
                <Table.Summary fixed>
                  <Table.Summary.Row>
                    <Table.Summary.Cell index={0} colSpan={5} align="right">
                      <strong style={{ fontSize: '15px' }}>二次工艺总费用：</strong>
                    </Table.Summary.Cell>
                    <Table.Summary.Cell index={5} align="right">
                      <strong style={{ color: '#fa8c16', fontSize: '16px', fontWeight: 700 }}>
                        ¥{secondaryTotal.toFixed(2)}
                      </strong>
                    </Table.Summary.Cell>
                  </Table.Summary.Row>
                </Table.Summary>
              );
            }}
          />
        </Card>
      )}

      {/* 5. 工序成本汇总 */}
      {secondaryProcessList.length > 0 && (
        <Card
          size="small"
          styles={{ body: { padding: '12px', background: '#f6ffed' } }}
        >
          <Row justify="space-between" align="middle">
            <Col>
              <span style={{ fontSize: '15px', fontWeight: 600 }}>
                💰 工序总成本（普通工序 + 二次工艺）
              </span>
            </Col>
            <Col>
              <span style={{ fontSize: '20px', fontWeight: 700, color: '#52c41a' }}>
                ¥{processCost.toFixed(2)}
              </span>
              <span style={{ fontSize: '13px', color: '#8c8c8c', marginLeft: 8 }}>
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
