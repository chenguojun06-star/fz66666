import React, { useState, useEffect } from 'react';
import { Button, Card, Input, Select, Space, Tag, Form, Row, Col, InputNumber, message } from 'antd';
import { CheckOutlined, PlusOutlined, RollbackOutlined, SearchOutlined, SendOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import Layout from '../../components/Layout';
import ResizableModal from '../../components/ResizableModal';
import ResizableTable from '../../components/ResizableTable';
import RowActions from '../../components/RowActions';
import { FactoryReconciliation, FinanceQueryParams } from '../../types/finance';
import api, { updateFinanceReconciliationStatus } from '../../utils/api';
import { StyleAttachmentsButton, StyleCoverThumb } from '../../components/StyleAssets';
import { formatDateTime } from '../../utils/datetime';
import './styles.css';

const { Option } = Select;

const FactoryReconciliationList: React.FC = () => {
  const navigate = useNavigate();
  // 状态管理
  const [visible, setVisible] = useState(false);
  const [currentReconciliation, setCurrentReconciliation] = useState<FactoryReconciliation | null>(null);
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
  const [queryParams, setQueryParams] = useState<FinanceQueryParams>({
    page: 1,
    pageSize: 10
  });
  const [form] = Form.useForm();

  // 真实数据状态
  const [reconciliationList, setReconciliationList] = useState<FactoryReconciliation[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [submitLoading, setSubmitLoading] = useState(false);
  const [approvalSubmitting, setApprovalSubmitting] = useState(false);

  // 获取加工厂对账列表
  const fetchReconciliationList = async () => {
    setLoading(true);
    try {
      const response = await api.get<any>('/finance/factory-reconciliation/list', { params: queryParams });
      const result = response as any;
      if (result.code === 200) {
        setReconciliationList(result.data.records || []);
        setTotal(result.data.total || 0);
      } else {
        message.error(result.message || '获取工厂对账列表失败');
      }
    } catch (error) {
      message.error('获取工厂对账列表失败');
    } finally {
      setLoading(false);
    }
  };

  // 页面加载时获取加工厂对账列表
  useEffect(() => {
    fetchReconciliationList();
  }, [queryParams]);

  // 打开弹窗
  const openDialog = (reconciliation?: FactoryReconciliation) => {
    setCurrentReconciliation(reconciliation || null);
    if (reconciliation) {
      form.setFieldsValue(reconciliation);
    } else {
      form.resetFields();
    }
    setVisible(true);
  };

  // 关闭弹窗
  const closeDialog = () => {
    setVisible(false);
    setCurrentReconciliation(null);
    form.resetFields();
  };

  // 表单提交
  const handleSubmit = async () => {
    try {
      setSubmitLoading(true);
      const values = await form.validateFields();
      let response;
      if (currentReconciliation?.id) {
        // 编辑加工厂对账
        response = await api.put('/finance/factory-reconciliation', { ...values, id: currentReconciliation.id });
      } else {
        // 新增加工厂对账
        response = await api.post('/finance/factory-reconciliation', values);
      }

      const result = response as any;
      if (result.code === 200) {
        message.success(currentReconciliation?.id ? '编辑工厂对账成功' : '新增工厂对账成功');
        // 关闭弹窗
        closeDialog();
        // 刷新加工厂对账列表
        fetchReconciliationList();
      } else {
        message.error(result.message || '保存失败');
      }
    } catch (error) {
      // 处理表单验证错误
      if ((error as any).errorFields) {
        const firstError = (error as any).errorFields[0];
        message.error(firstError.errors[0] || '表单验证失败');
      } else {
        message.error((error as Error).message || '保存失败');
      }
    } finally {
      setSubmitLoading(false);
    }
  };

  const updateStatusBatch = async (pairs: Array<{ id: string; status: string }>, successText: string) => {
    const normalized = pairs
      .map((p) => ({ id: String(p.id || '').trim(), status: String(p.status || '').trim() }))
      .filter((p) => p.id && p.status);
    if (!normalized.length) return;
    setApprovalSubmitting(true);
    try {
      const settled = await Promise.allSettled(
        normalized.map((p) => updateFinanceReconciliationStatus(p.id, p.status)),
      );
      const okCount = settled.filter((r) => r.status === 'fulfilled' && (r.value as any)?.code === 200).length;
      const failed = normalized.length - okCount;
      if (okCount <= 0) {
        message.error('操作失败');
        return;
      }
      if (failed) message.error(`部分操作失败（${failed}/${normalized.length}）`);
      else message.success(successText);
      setSelectedRowKeys([]);
      fetchReconciliationList();
    } catch (e: any) {
      message.error(e?.message || '操作失败');
    } finally {
      setApprovalSubmitting(false);
    }
  };

  const getStatusConfig = (status: FactoryReconciliation['status'] | string | undefined | null) => {
    const statusMap: Record<string, { text: string; color: string }> = {
      pending: { text: '待审核', color: 'blue' },
      verified: { text: '已验证', color: 'green' },
      approved: { text: '已批准', color: 'cyan' },
      paid: { text: '已付款', color: 'success' },
      rejected: { text: '已拒绝', color: 'error' },
    };
    const key = String(status || '').trim();
    return statusMap[key] || { text: '未知', color: 'default' };
  };

  // 表格列定义
  const columns = [
    {
      title: '图片',
      key: 'cover',
      width: 72,
      render: (_: any, record: FactoryReconciliation) => (
        <StyleCoverThumb styleNo={(record as any).styleNo} src={(record as any).cover || null} />
      )
    },
    {
      title: '对账单号',
      dataIndex: 'reconciliationNo',
      key: 'reconciliationNo',
      width: 140,
      render: (_: any, record: FactoryReconciliation) => (
        <Button type="link" size="small" onClick={() => openDialog(record)} style={{ padding: 0 }}>
          {String(record.reconciliationNo || '').trim() || '-'}
        </Button>
      ),
    },
    {
      title: '加工厂',
      dataIndex: 'factoryName',
      key: 'factoryName',
      width: 120,
    },
    {
      title: '款号',
      dataIndex: 'styleNo',
      key: 'styleNo',
      width: 100,
    },
    {
      title: '款名',
      dataIndex: 'styleName',
      key: 'styleName',
      ellipsis: true,
    },
    {
      title: '附件',
      key: 'attachments',
      width: 100,
      render: (_: any, record: FactoryReconciliation) => (
        <StyleAttachmentsButton
          styleNo={(record as any).styleNo}
          modalTitle={(record as any).styleNo ? `附件（${(record as any).styleNo}）` : '附件'}
        />
      )
    },
    {
      title: '订单号',
      dataIndex: 'orderNo',
      key: 'orderNo',
      width: 120,
    },
    {
      title: '数量',
      dataIndex: 'quantity',
      key: 'quantity',
      width: 80,
      align: 'right' as const,
    },
    {
      title: '单价(元)',
      dataIndex: 'unitPrice',
      key: 'unitPrice',
      width: 100,
      align: 'right' as const,
      render: (value: number) => value?.toFixed(2) || '0.00',
    },
    {
      title: '总金额(元)',
      dataIndex: 'totalAmount',
      key: 'totalAmount',
      width: 120,
      align: 'right' as const,
      render: (value: number) => value?.toFixed(2) || '0.00',
    },
    {
      title: '扣款项(元)',
      dataIndex: 'deductionAmount',
      key: 'deductionAmount',
      width: 120,
      align: 'right' as const,
      render: (value: number) => value?.toFixed(2) || '0.00',
    },
    {
      title: '最终金额(元)',
      dataIndex: 'finalAmount',
      key: 'finalAmount',
      width: 120,
      align: 'right' as const,
      render: (value: number) => <span className="final-amount">{value?.toFixed(2) || '0.00'}</span>,
    },
    {
      title: '对账日期',
      dataIndex: 'reconciliationDate',
      key: 'reconciliationDate',
      width: 120,
      render: (value: any) => formatDateTime(value),
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (status: FactoryReconciliation['status']) => {
        const { text, color } = getStatusConfig(status);
        return <Tag color={color}>{text}</Tag>;
      },
    },
    {
      title: '操作',
      key: 'action',
      width: 110,
      render: (_: any, record: FactoryReconciliation) => {
        const id = String(record.id || '').trim();
        const st = String(record.status || '').trim();
        const canAudit = Boolean(id) && st === 'pending';
        const canSubmit = Boolean(id) && (st === 'verified' || st === 'rejected');
        const canReturn = Boolean(id) && (st === 'pending' || st === 'verified' || st === 'approved');
        return (
          <RowActions
            className="table-actions"
            maxInline={3}
            actions={[
              {
                key: 'audit',
                label: '审核',
                title: canAudit ? '审核' : '审核(不可用)',
                icon: <CheckOutlined />,
                disabled: !canAudit,
                onClick: () => updateStatusBatch([{ id, status: 'verified' }], '审核成功'),
                primary: true,
              },
              {
                key: 'submit',
                label: '提交',
                title: canSubmit ? '提交' : '提交(不可用)',
                icon: <SendOutlined />,
                disabled: !canSubmit,
                onClick: async () => {
                  const target = st === 'verified' ? 'approved' : 'pending';
                  await updateStatusBatch([{ id, status: target }], '提交成功');
                  navigate('/finance/payment-approval', { state: { defaultTab: 'factory', defaultStatus: target } });
                },
                primary: true,
              },
              {
                key: 'return',
                label: '退回',
                title: canReturn ? '退回' : '退回(不可用)',
                icon: <RollbackOutlined />,
                disabled: !canReturn,
                onClick: () => updateStatusBatch([{ id, status: 'rejected' }], '退回成功'),
                danger: true,
              },
            ]}
          />
        );
      },
    },
  ];

  return (
    <Layout>
      <div className="finance-reconciliation-page">
        <Card className="page-card">
          {/* 页面标题和操作区 */}
          <div className="page-header">
            <h2 className="page-title">工厂对账</h2>
            <Space>
              <Button
                disabled={!selectedRowKeys.length || !reconciliationList.some((r) => selectedRowKeys.includes(String(r.id)) && r.status === 'pending')}
                loading={approvalSubmitting}
                onClick={() => {
                  const ids = reconciliationList
                    .filter((r) => selectedRowKeys.includes(String(r.id)) && r.status === 'pending')
                    .map((r) => String(r.id || ''));
                  if (ids.length !== selectedRowKeys.length) message.warning('仅可批量审核状态为“待审核”的对账单');
                  updateStatusBatch(ids.map((id) => ({ id, status: 'verified' })), '审核成功');
                }}
              >
                批量审核
              </Button>
              <Button
                disabled={!selectedRowKeys.length || !reconciliationList.some((r) => selectedRowKeys.includes(String(r.id)) && (r.status === 'verified' || r.status === 'rejected'))}
                loading={approvalSubmitting}
                onClick={async () => {
                  const picked = reconciliationList.filter((r) => selectedRowKeys.includes(String(r.id)));
                  const eligible = picked.filter((r) => r.status === 'verified' || r.status === 'rejected');
                  if (!eligible.length) return;
                  if (eligible.length !== picked.length) message.warning('仅可批量提交状态为“已验证/已拒绝”的对账单');
                  const pairs = eligible.map((r) => ({ id: String(r.id || ''), status: r.status === 'verified' ? 'approved' : 'pending' }));
                  await updateStatusBatch(pairs, '提交成功');
                  navigate('/finance/payment-approval', { state: { defaultTab: 'factory' } });
                }}
              >
                批量提交
              </Button>
              <Button
                disabled={!selectedRowKeys.length || !reconciliationList.some((r) => selectedRowKeys.includes(String(r.id)) && (r.status === 'pending' || r.status === 'verified' || r.status === 'approved'))}
                loading={approvalSubmitting}
                onClick={() => {
                  const picked = reconciliationList.filter((r) => selectedRowKeys.includes(String(r.id)));
                  const eligible = picked.filter((r) => r.status === 'pending' || r.status === 'verified' || r.status === 'approved');
                  if (!eligible.length) return;
                  if (eligible.length !== picked.length) message.warning('仅可批量退回状态为“待审核/已验证/已批准”的对账单');
                  updateStatusBatch(eligible.map((r) => ({ id: String(r.id || ''), status: 'rejected' })), '退回成功');
                }}
              >
                批量退回
              </Button>
              <Button type="primary" icon={<PlusOutlined />} onClick={() => openDialog()}>
                新增工厂对账
              </Button>
            </Space>
          </div>

          {/* 筛选区 */}
          <Card size="small" className="filter-card mb-sm">
            <Form layout="inline" size="small">
              <Form.Item label="对账单号">
                <Input
                  placeholder="请输入对账单号"
                  onChange={(e) => setQueryParams({ ...queryParams, reconciliationNo: e.target.value })}
                  style={{ width: 150 }}
                />
              </Form.Item>
              <Form.Item label="加工厂">
                <Input
                  placeholder="请输入加工厂名称"
                  onChange={(e) => setQueryParams({ ...queryParams, factoryName: e.target.value })}
                  style={{ width: 150 }}
                />
              </Form.Item>
              <Form.Item label="款号">
                <Input
                  placeholder="请输入款号"
                  onChange={(e) => setQueryParams({ ...queryParams, styleNo: e.target.value })}
                  style={{ width: 120 }}
                />
              </Form.Item>
              <Form.Item label="状态">
                <Select
                  placeholder="请选择状态"
                  onChange={(value) => setQueryParams({ ...queryParams, status: value })}
                  style={{ width: 100 }}
                >
                  <Option value="">全部</Option>
                  <Option value="pending">待审核</Option>
                  <Option value="verified">已验证</Option>
                  <Option value="approved">已批准</Option>
                  <Option value="paid">已付款</Option>
                  <Option value="rejected">已拒绝</Option>
                </Select>
              </Form.Item>
              <Form.Item className="filter-actions">
                <Space>
                  <Button type="primary" icon={<SearchOutlined />} onClick={() => fetchReconciliationList()}>
                    查询
                  </Button>
                  <Button onClick={() => {
                    setQueryParams({ page: 1, pageSize: 10 });
                    fetchReconciliationList();
                  }}>
                    重置
                  </Button>
                </Space>
              </Form.Item>
            </Form>
          </Card>

          {/* 表格区 */}
          <ResizableTable
            columns={columns}
            dataSource={reconciliationList}
            rowKey="id"
            loading={loading}
            allowFixedColumns
            rowSelection={{
              selectedRowKeys,
              onChange: (keys) => setSelectedRowKeys(keys),
              getCheckboxProps: (record: FactoryReconciliation) => ({
                disabled: record.status === 'paid',
              }),
            }}
            pagination={{
              current: queryParams.page,
              pageSize: queryParams.pageSize,
              total: total,
              onChange: (page, pageSize) => setQueryParams({ ...queryParams, page, pageSize })
            }}
          />
        </Card>

        {/* 加工厂对账详情弹窗 */}
        <ResizableModal
          title={currentReconciliation ? '工厂对账详情' : '新增工厂对账'}
          open={visible}
          onCancel={closeDialog}
          onOk={handleSubmit}
          okText="保存"
          cancelText="取消"
          footer={currentReconciliation ? null : [
            <Button key="cancel" onClick={closeDialog}>
              取消
            </Button>,
            <Button key="submit" type="primary" onClick={() => handleSubmit()} loading={submitLoading}>
              保存
            </Button>
          ]}
          width="60vw"
        >
          {currentReconciliation ? (
            <Form form={form} layout="vertical">
              <div className="modal-detail-header">
                <div className="modal-detail-cover">
                  <StyleCoverThumb styleNo={String((currentReconciliation as any).styleNo || '').trim()} size={160} borderRadius={10} />
                </div>
                <div className="modal-detail-grid">
                  <div className="modal-detail-item"><span className="modal-detail-label">对账单号：</span><span className="modal-detail-value">{String((currentReconciliation as any).reconciliationNo || '').trim() || '-'}</span></div>
                  <div className="modal-detail-item"><span className="modal-detail-label">加工厂：</span><span className="modal-detail-value">{String((currentReconciliation as any).factoryName || '').trim() || '-'}</span></div>
                  <div className="modal-detail-item"><span className="modal-detail-label">订单号：</span><span className="modal-detail-value">{String((currentReconciliation as any).orderNo || '').trim() || '-'}</span></div>
                  <div className="modal-detail-item"><span className="modal-detail-label">款号：</span><span className="modal-detail-value">{String((currentReconciliation as any).styleNo || '').trim() || '-'}</span></div>
                  <div className="modal-detail-item"><span className="modal-detail-label">款名：</span><span className="modal-detail-value">{String((currentReconciliation as any).styleName || '').trim() || '-'}</span></div>
                  <div className="modal-detail-item"><span className="modal-detail-label">数量：</span><span className="modal-detail-value">{String((currentReconciliation as any).quantity ?? '-')}</span></div>
                  <div className="modal-detail-item"><span className="modal-detail-label">单价：</span><span className="modal-detail-value">{Number((currentReconciliation as any).unitPrice || 0).toFixed(2)} 元</span></div>
                  <div className="modal-detail-item"><span className="modal-detail-label">总金额：</span><span className="modal-detail-value">{Number((currentReconciliation as any).totalAmount || 0).toFixed(2)} 元</span></div>
                  <div className="modal-detail-item"><span className="modal-detail-label">扣款项：</span><span className="modal-detail-value">{Number((currentReconciliation as any).deductionAmount || 0).toFixed(2)} 元</span></div>
                  <div className="modal-detail-item"><span className="modal-detail-label">最终金额：</span><span className="modal-detail-value">{Number((currentReconciliation as any).finalAmount || 0).toFixed(2)} 元</span></div>
                  <div className="modal-detail-item"><span className="modal-detail-label">对账日期：</span><span className="modal-detail-value">{formatDateTime((currentReconciliation as any).reconciliationDate)}</span></div>
                  <div className="modal-detail-item"><span className="modal-detail-label">状态：</span><span className="modal-detail-value">{getStatusConfig((currentReconciliation as any).status).text}</span></div>
                </div>
              </div>

              {/* 扣款项详情 */}
              <div className="deduction-section mt-md">
                <h3 className="section-title">扣款项详情</h3>
                <ResizableTable
                  columns={[
                    {
                      title: '扣款类型',
                      dataIndex: 'type',
                      key: 'type',
                    },
                    {
                      title: '扣款金额(元)',
                      dataIndex: 'amount',
                      key: 'amount',
                      align: 'right' as const,
                    },
                    {
                      title: '描述',
                      dataIndex: 'description',
                      key: 'description',
                    },
                  ]}
                  dataSource={[
                    { key: 'quality', type: '质量扣款', amount: 3000.0, description: '部分产品质量不达标' },
                    { key: 'delay', type: '延期扣款', amount: 2000.0, description: '交货延期5天' },
                  ]}
                  rowKey="key"
                  pagination={false}
                  size="small"
                  scroll={{ x: 'max-content' }}
                />
              </div>
              <Row gutter={16} className="mt-md">
                <Col span={12}>
                  <h3 className="section-title">发票信息</h3>
                  <Form layout="inline" component={false}>
                    <Form.Item label="发票编号">
                      <Input placeholder="请输入发票编号" style={{ width: 200 }} />
                    </Form.Item>
                    <Form.Item label="发票金额(元)">
                      <InputNumber placeholder="请输入发票金额" style={{ width: 150 }} step="0.01" />
                    </Form.Item>
                  </Form>
                </Col>
                <Col span={12}>
                  <h3 className="section-title">审核动作</h3>
                  <Space>
                    <Button
                      type="primary"
                      disabled={currentReconciliation.status !== 'pending'}
                      onClick={async () => {
                        try {
                          const res = await updateFinanceReconciliationStatus(String(currentReconciliation.id || ''), 'verified');
                          const result = res as any;
                          if (result.code === 200) {
                            message.success('已验证');
                            setVisible(false);
                            fetchReconciliationList();
                          } else {
                            message.error(result.message || '操作失败');
                          }
                        } catch (e) {
                          message.error('操作失败');
                        }
                      }}
                    >
                      验证
                    </Button>
                    <Button
                      disabled={currentReconciliation.status !== 'verified'}
                      onClick={async () => {
                        try {
                          const res = await updateFinanceReconciliationStatus(String(currentReconciliation.id || ''), 'approved');
                          const result = res as any;
                          if (result.code === 200) {
                            message.success('已批准');
                            setVisible(false);
                            fetchReconciliationList();
                          } else {
                            message.error(result.message || '操作失败');
                          }
                        } catch (e) {
                          message.error('操作失败');
                        }
                      }}
                    >
                      批准
                    </Button>
                    <Button
                      disabled={currentReconciliation.status !== 'approved'}
                      onClick={async () => {
                        try {
                          const res = await updateFinanceReconciliationStatus(String(currentReconciliation.id || ''), 'paid');
                          const result = res as any;
                          if (result.code === 200) {
                            message.success('已付款');
                            setVisible(false);
                            fetchReconciliationList();
                          } else {
                            message.error(result.message || '操作失败');
                          }
                        } catch (e) {
                          message.error('操作失败');
                        }
                      }}
                    >
                      标记付款
                    </Button>
                    <Button
                      danger
                      disabled={currentReconciliation.status === 'rejected' || currentReconciliation.status === 'paid'}
                      onClick={async () => {
                        try {
                          const res = await updateFinanceReconciliationStatus(String(currentReconciliation.id || ''), 'rejected');
                          const result = res as any;
                          if (result.code === 200) {
                            message.success('已拒绝');
                            setVisible(false);
                            fetchReconciliationList();
                          } else {
                            message.error(result.message || '操作失败');
                          }
                        } catch (e) {
                          message.error('操作失败');
                        }
                      }}
                    >
                      拒绝
                    </Button>
                  </Space>
                </Col>
              </Row>
            </Form>
          ) : (
            <Form form={form} layout="vertical">
              <Row gutter={16}>
                <Col span={8}>
                  <Form.Item name="reconciliationNo" label="对账单号">
                    <Input placeholder="自动生成" disabled />
                  </Form.Item>
                  <Form.Item name="factoryId" label="加工厂" rules={[{ required: true, message: '请选择加工厂' }]}>
                    <Select placeholder="请选择加工厂">
                      <Option value="1">广州服装厂</Option>
                      <Option value="2">深圳服装厂</Option>
                    </Select>
                  </Form.Item>
                  <Form.Item name="styleId" label="款号" rules={[{ required: true, message: '请选择款号' }]}>
                    <Select placeholder="请选择款号">
                      <Option value="1">ST2024001 - 时尚连衣裙</Option>
                      <Option value="2">ST2024002 - 休闲牛仔裤</Option>
                    </Select>
                  </Form.Item>
                </Col>
                <Col span={8}>
                  <Form.Item name="orderId" label="订单号" rules={[{ required: true, message: '请选择订单号' }]}>
                    <Select placeholder="请选择订单号">
                      <Option value="1">PO2024001</Option>
                      <Option value="2">PO2024002</Option>
                    </Select>
                  </Form.Item>
                  <Form.Item name="quantity" label="数量" rules={[{ required: true, message: '请输入数量' }]}>
                    <InputNumber placeholder="请输入数量" style={{ width: '100%' }} min={1} />
                  </Form.Item>
                  <Form.Item name="unitPrice" label="单价(元)" rules={[{ required: true, message: '请输入单价' }]}>
                    <InputNumber placeholder="请输入单价" style={{ width: '100%' }} min={0} step="0.01" />
                  </Form.Item>
                </Col>
                <Col span={8}>
                  <Form.Item name="reconciliationDate" label="对账日期" rules={[{ required: true, message: '请选择对账日期' }]}>
                    <Input type="date" style={{ width: '100%' }} />
                  </Form.Item>
                  <Form.Item name="remark" label="备注">
                    <Input placeholder="请输入备注" />
                  </Form.Item>
                </Col>
              </Row>

              {/* 扣款项表单 */}
              <div className="deduction-form-section mt-md">
                <h3 className="section-title">扣款项</h3>
                <ResizableTable
                  columns={[
                    {
                      title: '扣款类型',
                      dataIndex: 'type',
                      key: 'type',
                      render: () => <Input placeholder="请输入扣款类型" />
                    },
                    {
                      title: '扣款金额(元)',
                      dataIndex: 'amount',
                      key: 'amount',
                      align: 'right' as const,
                      render: () => <InputNumber placeholder="请输入扣款金额" style={{ width: '100%' }} step="0.01" />
                    },
                    {
                      title: '描述',
                      dataIndex: 'description',
                      key: 'description',
                      render: () => <Input placeholder="请输入扣款描述" />
                    },
                    {
                      title: '操作',
                      key: 'action',
                      render: () => <Button type="link" danger>删除</Button>
                    },
                  ]}
                  dataSource={[{ key: '1' }]}
                  pagination={false}
                  size="small"
                />
                <div className="deduction-form-actions mt-sm">
                  <Button type="dashed" block>
                    + 新增扣款项
                  </Button>
                </div>
              </div>
            </Form>
          )}
        </ResizableModal>
      </div>
    </Layout>
  );
};

export default FactoryReconciliationList;
