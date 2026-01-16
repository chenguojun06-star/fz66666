import React, { useState, useEffect } from 'react';
import { Button, Card, Input, Select, Space, Tag, Form, Row, Col, message } from 'antd';
import { CheckOutlined, PlusOutlined, RollbackOutlined, SearchOutlined, SendOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import Layout from '../../components/Layout';
import ResizableModal from '../../components/ResizableModal';
import ResizableTable from '../../components/ResizableTable';
import RowActions from '../../components/RowActions';
import { MaterialReconciliation as MaterialReconType, MaterialReconQueryParams } from '../../types/finance';
import api, { updateFinanceReconciliationStatus } from '../../utils/api';
import { formatDateTime } from '../../utils/datetime';
import './styles.css';

const { Option } = Select;

const getMaterialReconStatusConfig = (status: any) => {
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

// 物料对账弹窗内容组件
interface MaterialReconModalContentProps {
  currentRecon: MaterialReconType | null;
  onSubmit: (values: any) => Promise<void>;
  onSave: (saveFn: () => Promise<void>) => void;
}

const MaterialReconModalContent: React.FC<MaterialReconModalContentProps> = ({
  currentRecon,
  onSubmit,
  onSave
}) => {
  const [form] = Form.useForm();

  // 当前对账单变化时，更新表单数据
  useEffect(() => {
    if (currentRecon) {
      form.setFieldsValue(currentRecon);
    } else {
      form.resetFields();
    }
  }, [currentRecon, form]);

  // 暴露保存方法给父组件
  useEffect(() => {
    if (onSave) {
      onSave(() => {
        return form.validateFields().then(values => {
          return onSubmit(values);
        });
      });
    }
  }, [form, onSubmit, onSave]);

  return (
    <Form form={form} layout="vertical">
      {currentRecon ? (
        <div className="modal-detail-header">
          <div className="modal-detail-cover" />
          <div className="modal-detail-grid">
            <div className="modal-detail-item"><span className="modal-detail-label">对账单号：</span><span className="modal-detail-value">{String(currentRecon.reconciliationNo || '').trim() || '-'}</span></div>
            <div className="modal-detail-item"><span className="modal-detail-label">供应商：</span><span className="modal-detail-value">{String((currentRecon as any).supplierName || '').trim() || '-'}</span></div>
            <div className="modal-detail-item"><span className="modal-detail-label">订单号：</span><span className="modal-detail-value">{String((currentRecon as any).orderNo || '').trim() || '-'}</span></div>
            <div className="modal-detail-item"><span className="modal-detail-label">款号：</span><span className="modal-detail-value">{String((currentRecon as any).styleNo || '').trim() || '-'}</span></div>
            <div className="modal-detail-item"><span className="modal-detail-label">采购单号：</span><span className="modal-detail-value">{String((currentRecon as any).purchaseNo || '').trim() || '-'}</span></div>
            <div className="modal-detail-item"><span className="modal-detail-label">物料编码：</span><span className="modal-detail-value">{String((currentRecon as any).materialCode || '').trim() || '-'}</span></div>
            <div className="modal-detail-item"><span className="modal-detail-label">物料名称：</span><span className="modal-detail-value">{String((currentRecon as any).materialName || '').trim() || '-'}</span></div>
            <div className="modal-detail-item"><span className="modal-detail-label">数量：</span><span className="modal-detail-value">{String((currentRecon as any).quantity ?? '-')}</span></div>
            <div className="modal-detail-item"><span className="modal-detail-label">生产完成数：</span><span className="modal-detail-value">{String((currentRecon as any).productionCompletedQuantity ?? '-')}</span></div>
            <div className="modal-detail-item"><span className="modal-detail-label">单价：</span><span className="modal-detail-value">{Number((currentRecon as any).unitPrice || 0).toFixed(2)} 元</span></div>
            <div className="modal-detail-item"><span className="modal-detail-label">总金额：</span><span className="modal-detail-value">{Number((currentRecon as any).totalAmount || 0).toFixed(2)} 元</span></div>
            <div className="modal-detail-item"><span className="modal-detail-label">扣款项：</span><span className="modal-detail-value">{Number((currentRecon as any).deductionAmount || 0).toFixed(2)} 元</span></div>
            <div className="modal-detail-item"><span className="modal-detail-label">最终金额：</span><span className="modal-detail-value">{Number((currentRecon as any).finalAmount || 0).toFixed(2)} 元</span></div>
            <div className="modal-detail-item"><span className="modal-detail-label">对账日期：</span><span className="modal-detail-value">{formatDateTime((currentRecon as any).reconciliationDate)}</span></div>
            <div className="modal-detail-item"><span className="modal-detail-label">状态：</span><span className="modal-detail-value">{getMaterialReconStatusConfig((currentRecon as any).status).text}</span></div>
          </div>
        </div>
      ) : (
        <Row gutter={16}>
          <Col span={8}>
            <Form.Item name="reconciliationNo" label="对账单号">
              <Input placeholder="自动生成" disabled />
            </Form.Item>
            <Form.Item name="supplierId" label="供应商" rules={[{ required: true, message: '请选择供应商' }]}>
              <Select placeholder="请选择供应商">
                <Option value="1">纺织有限公司</Option>
                <Option value="2">拉链厂</Option>
              </Select>
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item name="purchaseId" label="采购单号" rules={[{ required: true, message: '请选择采购单号' }]}>
              <Select placeholder="请选择采购单号">
                <Option value="1">MC2024001</Option>
                <Option value="2">MC2024002</Option>
              </Select>
            </Form.Item>
            <Form.Item name="reconciliationDate" label="对账日期" rules={[{ required: true, message: '请选择对账日期' }]}>
              <Input type="date" style={{ width: '100%' }} />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item name="remark" label="备注">
              <Input placeholder="请输入备注" />
            </Form.Item>
          </Col>
        </Row>
      )}
    </Form>
  );
};

const MaterialReconciliation: React.FC = () => {
  const navigate = useNavigate();
  const [visible, setVisible] = useState(false);
  const [currentRecon, setCurrentRecon] = useState<MaterialReconType | null>(null);
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
  const [queryParams, setQueryParams] = useState<MaterialReconQueryParams>({
    page: 1,
    pageSize: 10
  });
  const [filterForm] = Form.useForm();
  const saveFormRef = React.useRef<(() => Promise<void>) | null>(null);

  // 真实数据状态
  const [reconciliationList, setReconciliationList] = useState<MaterialReconType[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [submitLoading, setSubmitLoading] = useState(false);
  const [approvalSubmitting, setApprovalSubmitting] = useState(false);

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

  // 获取物料对账列表
  const fetchReconciliationList = async () => {
    setLoading(true);
    try {
      const response = await api.get<any>('/finance/material-reconciliation/list', { params: queryParams });
      const result = response as any;
      if (result.code === 200) {
        setReconciliationList(result.data.records || []);
        setTotal(result.data.total || 0);
      } else {
        message.error(result.message || '获取物料对账列表失败');
      }
    } catch (error) {
      message.error('获取物料对账列表失败');
    } finally {
      setLoading(false);
    }
  };

  // 页面加载时获取物料对账列表
  useEffect(() => {
    fetchReconciliationList();
  }, [queryParams]);

  const openDialog = (recon?: MaterialReconType) => {
    setCurrentRecon(recon || null);
    setVisible(true);
  };

  const closeDialog = () => {
    setVisible(false);
    setCurrentRecon(null);
  };

  // 表单提交
  const handleSubmit = async (values: any) => {
    try {
      setSubmitLoading(true);
      let response;
      if (currentRecon?.id) {
        // 编辑物料对账
        response = await api.put('/finance/material-reconciliation', { ...values, id: currentRecon.id });
      } else {
        // 新增物料对账
        response = await api.post('/finance/material-reconciliation', values);
      }

      const result = response as any;
      if (result.code === 200) {
        message.success(currentRecon?.id ? '编辑物料对账成功' : '新增物料对账成功');
        // 关闭弹窗
        closeDialog();
        // 刷新物料对账列表
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

  const MaterialThumb: React.FC = () => {
    return (
      <div style={{ width: 40, height: 40, borderRadius: 6, overflow: 'hidden', background: '#f5f5f5', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ color: '#ccc', fontSize: 12 }}>无图</span>
      </div>
    );
  };

  // 表格列定义
  const columns = [
    {
      title: '图片',
      key: 'cover',
      width: 72,
      render: () => <MaterialThumb />,
    },
    {
      title: '对账单号',
      dataIndex: 'reconciliationNo',
      key: 'reconciliationNo',
      width: 140,
      render: (_: any, record: MaterialReconType) => (
        <Button type="link" size="small" onClick={() => openDialog(record)} style={{ padding: 0 }}>
          {String(record.reconciliationNo || '').trim() || '-'}
        </Button>
      ),
    },
    {
      title: '供应商',
      dataIndex: 'supplierName',
      key: 'supplierName',
      width: 120,
    },
    {
      title: '物料编码',
      dataIndex: 'materialCode',
      key: 'materialCode',
      width: 100,
    },
    {
      title: '物料名称',
      dataIndex: 'materialName',
      key: 'materialName',
      ellipsis: true,
    },
    {
      title: '采购单号',
      dataIndex: 'purchaseNo',
      key: 'purchaseNo',
      width: 120,
    },
    {
      title: '订单号',
      dataIndex: 'orderNo',
      key: 'orderNo',
      width: 140,
    },
    {
      title: '款号',
      dataIndex: 'styleNo',
      key: 'styleNo',
      width: 110,
    },
    {
      title: '数量',
      dataIndex: 'quantity',
      key: 'quantity',
      width: 80,
      align: 'right' as const,
    },
    {
      title: '生产完成数',
      dataIndex: 'productionCompletedQuantity',
      key: 'productionCompletedQuantity',
      width: 110,
      align: 'right' as const,
      render: (v: any) => {
        const n = typeof v === 'number' ? v : Number(v);
        return Number.isFinite(n) ? n : '-';
      },
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
      render: (status: MaterialReconType['status']) => {
        const { text, color } = getMaterialReconStatusConfig(status);
        return <Tag color={color}>{text}</Tag>;
      },
    },
    {
      title: '操作',
      key: 'action',
      width: 110,
      render: (_: any, record: MaterialReconType) => {
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
                  navigate('/finance/payment-approval', { state: { defaultTab: 'material', defaultStatus: target } });
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
      <div className="material-recon-page">
        <Card className="page-card">
          {/* 页面标题和操作区 */}
          <div className="page-header">
            <h2 className="page-title">物料对账</h2>
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
                  navigate('/finance/payment-approval', { state: { defaultTab: 'material' } });
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
                新增物料对账
              </Button>
            </Space>
          </div>

          {/* 筛选区 */}
          <Card size="small" className="filter-card mb-sm">
            <Form form={filterForm} layout="inline" size="small">
              <Form.Item label="对账单号">
                <Input
                  placeholder="请输入对账单号"
                  onChange={(e) => setQueryParams({ ...queryParams, reconciliationNo: e.target.value })}
                  style={{ width: 150 }}
                />
              </Form.Item>
              <Form.Item label="供应商">
                <Input
                  placeholder="请输入供应商"
                  onChange={(e) => setQueryParams({ ...queryParams, supplierName: e.target.value })}
                  style={{ width: 150 }}
                />
              </Form.Item>
              <Form.Item label="物料编码">
                <Input
                  placeholder="请输入物料编码"
                  onChange={(e) => setQueryParams({ ...queryParams, materialCode: e.target.value })}
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
              getCheckboxProps: (record: MaterialReconType) => ({
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

        {/* 物料对账详情弹窗 */}
        <ResizableModal
          title={currentRecon ? '物料对账详情' : '新增物料对账'}
          open={visible}
          onCancel={closeDialog}
          onOk={() => { }}
          okText="保存"
          cancelText="取消"
          footer={currentRecon ? null : [
            <Button key="cancel" onClick={closeDialog}>
              取消
            </Button>,
            <Button key="submit" type="primary" onClick={() => {
              if (saveFormRef.current) {
                saveFormRef.current();
              }
            }}
              loading={submitLoading}>
              保存
            </Button>
          ]}
          width="60vw"
        >
          <MaterialReconModalContent
            currentRecon={currentRecon}
            onSubmit={handleSubmit}
            onSave={(saveFn) => {
              saveFormRef.current = saveFn;
            }}
          />
        </ResizableModal>
      </div>
    </Layout>
  );
};

export default MaterialReconciliation;
