import React, { useEffect, useState } from 'react';
import { Button, Card, Form, Input, Select, Space, Tag, message } from 'antd';
import { CheckOutlined, PlusOutlined, RollbackOutlined, SearchOutlined, SendOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import Layout from '../../components/Layout';
import ResizableModal from '../../components/ResizableModal';
import ResizableTable from '../../components/ResizableTable';
import RowActions from '../../components/RowActions';
import { ShipmentReconciliation, ShipmentReconQueryParams } from '../../types/finance';
import { formatDateTime } from '../../utils/datetime';
import { StyleCoverThumb } from '../../components/StyleAssets';
import api, { updateFinanceReconciliationStatus } from '../../utils/api';
import './styles.css';

const { Option } = Select;

const ShipmentReconciliationList: React.FC = () => {
  const navigate = useNavigate();
  const [reconciliationList, setReconciliationList] = useState<ShipmentReconciliation[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [approvalSubmitting, setApprovalSubmitting] = useState(false);
  const [visible, setVisible] = useState(false);
  const [currentRecon, setCurrentRecon] = useState<ShipmentReconciliation | null>(null);
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
  const [queryParams, setQueryParams] = useState<ShipmentReconQueryParams>({
    page: 1,
    pageSize: 10,
  });

  const [filterForm] = Form.useForm();

  const fetchReconciliationList = async () => {
    setLoading(true);
    try {
      const response = await api.get<any>('/finance/shipment-reconciliation/list', { params: queryParams });
      const result = response as any;
      if (result.code === 200) {
        setReconciliationList((result.data?.records || []) as ShipmentReconciliation[]);
        setTotal(Number(result.data?.total || 0));
      } else {
        message.error(result.message || '获取出货对账列表失败');
      }
    } catch (e: any) {
      message.error(e?.message || '获取出货对账列表失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setSelectedRowKeys([]);
    fetchReconciliationList();
  }, [
    queryParams.page,
    queryParams.pageSize,
    queryParams.reconciliationNo,
    queryParams.customerName,
    queryParams.orderNo,
    queryParams.styleNo,
    queryParams.status,
    queryParams.startDate,
    queryParams.endDate,
  ]);

  const openDialog = (recon?: ShipmentReconciliation) => {
    setCurrentRecon(recon || null);
    setVisible(true);
  };

  const closeDialog = () => {
    setVisible(false);
    setCurrentRecon(null);
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

  const getStatusConfig = (status: ShipmentReconciliation['status'] | string | undefined | null) => {
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

  const columns = [
    {
      title: '图片',
      key: 'cover',
      width: 72,
      render: (_: any, record: ShipmentReconciliation) => (
        <StyleCoverThumb styleNo={(record as any).styleNo} src={(record as any).cover || null} />
      ),
    },
    {
      title: '对账单号',
      dataIndex: 'reconciliationNo',
      key: 'reconciliationNo',
      width: 140,
      render: (_: any, record: ShipmentReconciliation) => (
        <Button type="link" size="small" onClick={() => openDialog(record)} style={{ padding: 0 }}>
          {String(record.reconciliationNo || '').trim() || '-'}
        </Button>
      ),
    },
    {
      title: '客户',
      dataIndex: 'customerName',
      key: 'customerName',
      width: 140,
      ellipsis: true,
      render: (v: any) => String(v || '').trim() || '-',
    },
    {
      title: '订单号',
      dataIndex: 'orderNo',
      key: 'orderNo',
      width: 120,
      render: (v: any) => String(v || '').trim() || '-',
    },
    {
      title: '款号',
      dataIndex: 'styleNo',
      key: 'styleNo',
      width: 110,
      render: (v: any) => String(v || '').trim() || '-',
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
      render: (value: any) => Number(value || 0).toFixed(2),
    },
    {
      title: '总金额(元)',
      dataIndex: 'totalAmount',
      key: 'totalAmount',
      width: 120,
      align: 'right' as const,
      render: (value: any) => Number(value || 0).toFixed(2),
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
      render: (status: ShipmentReconciliation['status']) => {
        const cfg = getStatusConfig(status);
        return <Tag color={cfg.color}>{cfg.text}</Tag>;
      },
    },
    {
      title: '操作',
      key: 'action',
      width: 110,
      render: (_: any, record: ShipmentReconciliation) => {
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
                  navigate('/finance/payment-approval', { state: { defaultTab: 'shipment', defaultStatus: target } });
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
          <div className="page-header">
            <h2 className="page-title">成品结算</h2>
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
                  navigate('/finance/payment-approval', { state: { defaultTab: 'shipment' } });
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
                新增成品结算
              </Button>
            </Space>
          </div>

          <Card size="small" className="filter-card mb-sm">
            <Form form={filterForm} layout="inline" size="small">
              <Form.Item label="对账单号">
                <Input
                  placeholder="请输入对账单号"
                  onChange={(e) => setQueryParams((prev) => ({ ...prev, reconciliationNo: e.target.value, page: 1 }))}
                  style={{ width: 150 }}
                  allowClear
                />
              </Form.Item>
              <Form.Item label="客户">
                <Input
                  placeholder="请输入客户"
                  onChange={(e) => setQueryParams((prev) => ({ ...prev, customerName: e.target.value, page: 1 }))}
                  style={{ width: 150 }}
                  allowClear
                />
              </Form.Item>
              <Form.Item label="订单号">
                <Input
                  placeholder="请输入订单号"
                  onChange={(e) => setQueryParams((prev) => ({ ...prev, orderNo: e.target.value, page: 1 }))}
                  style={{ width: 140 }}
                  allowClear
                />
              </Form.Item>
              <Form.Item label="款号">
                <Input
                  placeholder="请输入款号"
                  onChange={(e) => setQueryParams((prev) => ({ ...prev, styleNo: e.target.value, page: 1 }))}
                  style={{ width: 120 }}
                  allowClear
                />
              </Form.Item>
              <Form.Item label="状态">
                <Select
                  placeholder="请选择状态"
                  onChange={(value) => setQueryParams((prev) => ({ ...prev, status: value || undefined, page: 1 }))}
                  style={{ width: 120 }}
                  allowClear
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
                  <Button type="primary" icon={<SearchOutlined />} onClick={() => fetchReconciliationList()} loading={loading}>
                    查询
                  </Button>
                  <Button onClick={() => setQueryParams({ page: 1, pageSize: 10 })}>
                    重置
                  </Button>
                </Space>
              </Form.Item>
            </Form>
          </Card>

          <ResizableTable
            columns={columns}
            dataSource={reconciliationList}
            rowKey="id"
            loading={loading}
            allowFixedColumns
            rowSelection={{
              selectedRowKeys,
              onChange: (keys) => setSelectedRowKeys(keys),
              getCheckboxProps: (record: ShipmentReconciliation) => ({
                disabled: record.status === 'paid',
              }),
            }}
            pagination={{
              current: queryParams.page,
              pageSize: queryParams.pageSize,
              total,
              onChange: (page, pageSize) => setQueryParams((prev) => ({ ...prev, page, pageSize })),
            }}
          />
        </Card>
      </div>

      <ResizableModal
        open={visible}
        title={currentRecon ? '成品结算详情' : '新增成品结算'}
        onCancel={closeDialog}
        footer={null}
        width="60vw"
      >
        {currentRecon ? (
          <>
            <div className="modal-detail-header">
              <div className="modal-detail-cover">
                <StyleCoverThumb styleNo={String(currentRecon.styleNo || '').trim()} size={160} borderRadius={10} />
              </div>
              <div className="modal-detail-grid">
                <div className="modal-detail-item"><span className="modal-detail-label">对账单号：</span><span className="modal-detail-value">{currentRecon.reconciliationNo}</span></div>
                <div className="modal-detail-item"><span className="modal-detail-label">客户：</span><span className="modal-detail-value">{currentRecon.customerName || '-'}</span></div>
                <div className="modal-detail-item"><span className="modal-detail-label">订单号：</span><span className="modal-detail-value">{currentRecon.orderNo}</span></div>
                <div className="modal-detail-item"><span className="modal-detail-label">款号：</span><span className="modal-detail-value">{currentRecon.styleNo}</span></div>
                <div className="modal-detail-item"><span className="modal-detail-label">数量：</span><span className="modal-detail-value">{currentRecon.quantity}</span></div>
                <div className="modal-detail-item"><span className="modal-detail-label">单价：</span><span className="modal-detail-value">{Number(currentRecon.unitPrice || 0).toFixed(2)} 元</span></div>
                <div className="modal-detail-item"><span className="modal-detail-label">总金额：</span><span className="modal-detail-value">{Number(currentRecon.totalAmount || 0).toFixed(2)} 元</span></div>
                <div className="modal-detail-item"><span className="modal-detail-label">对账日期：</span><span className="modal-detail-value">{formatDateTime(currentRecon.reconciliationDate)}</span></div>
                <div className="modal-detail-item"><span className="modal-detail-label">状态：</span><span className="modal-detail-value">{getStatusConfig(currentRecon.status).text}</span></div>
                <div className="modal-detail-item"><span className="modal-detail-label">创建时间：</span><span className="modal-detail-value">{formatDateTime(currentRecon.createTime)}</span></div>
              </div>
            </div>

            <div className="audit-actions-section" style={{ marginTop: 24, paddingTop: 24, borderTop: '1px solid #f0f0f0' }}>
              <h3 className="section-title" style={{ marginBottom: 16, fontWeight: 600 }}>审核动作</h3>
              <Space>
                <Button
                  type="primary"
                  disabled={currentRecon.status !== 'pending'}
                  onClick={async () => {
                    try {
                      const res = await updateFinanceReconciliationStatus(String(currentRecon.id || ''), 'verified');
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
                  disabled={currentRecon.status !== 'verified'}
                  onClick={async () => {
                    try {
                      const res = await updateFinanceReconciliationStatus(String(currentRecon.id || ''), 'approved');
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
                  disabled={currentRecon.status !== 'approved'}
                  onClick={async () => {
                    try {
                      const res = await updateFinanceReconciliationStatus(String(currentRecon.id || ''), 'paid');
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
                  disabled={currentRecon.status === 'rejected' || currentRecon.status === 'paid'}
                  onClick={async () => {
                    try {
                      const res = await updateFinanceReconciliationStatus(String(currentRecon.id || ''), 'rejected');
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
            </div>
          </>
        ) : (
          <div className="recon-form" style={{ padding: 12 }}>
            <div style={{ color: '#999' }}>请在业务流程中创建成品结算单。</div>
          </div>
        )}
      </ResizableModal>
    </Layout>
  );
};

export default ShipmentReconciliationList;
