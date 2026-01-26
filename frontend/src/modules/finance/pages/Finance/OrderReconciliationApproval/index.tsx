import React, { useEffect, useMemo, useState } from 'react';
import { Button, Card, Descriptions, Form, Input, Modal, Select, Space, Tag, message } from 'antd';
import { CheckOutlined, CloseCircleOutlined, DollarOutlined, RollbackOutlined, SafetyCertificateOutlined } from '@ant-design/icons';
import Layout from '@/components/Layout';
import ResizableTable from '@/components/common/ResizableTable';
import ResizableModal from '@/components/common/ResizableModal';
import RowActions from '@/components/common/RowActions';
import api from '@/utils/api';
import { formatDateTime } from '@/utils/datetime';
import { useAuth } from '@/utils/authContext';
import { useViewport } from '@/utils/useViewport';

// 订单结算审批记录类型
interface OrderReconciliationApprovalRecord {
  id: string;
  factoryName: string;
  isOwnFactory: number; // 0=加工厂, 1=本厂
  orderCount: number;
  totalQuantity: number;
  totalAmount: number;
  reconciliationIds?: string;
  status: 'pending' | 'verified' | 'approved' | 'paid' | 'rejected';
  approvalTime?: string;
  approvalBy?: string;
  paymentTime?: string;
  paymentBy?: string;
  paymentMethod?: string;
  reReviewTime?: string;
  reReviewReason?: string;
  remark?: string;
  createTime?: string;
  updateTime?: string;
}

interface QueryParams {
  factoryName?: string;
  status?: string;
  page: number;
  pageSize: number;
}

type ReconStatus = 'pending' | 'verified' | 'approved' | 'paid' | 'rejected';

const { Option } = Select;

const toArray = <T,>(value: unknown): T[] => {
  if (Array.isArray(value)) return value as T[];
  return [];
};

const getStatusConfig = (status: ReconStatus | string | undefined) => {
  const statusMap: Record<string, { text: string; color: string }> = {
    pending: { text: '待审核', color: 'default' },
    verified: { text: '已核验', color: 'processing' },
    approved: { text: '已批准', color: 'success' },
    paid: { text: '已付款', color: 'cyan' },
    rejected: { text: '已拒绝', color: 'error' },
  };
  return statusMap[String(status || '')] || { text: '未知', color: 'default' };
};

const formatMoney = (value: unknown) => {
  const n = Number(value);
  return Number.isFinite(n) ? n.toFixed(2) : '-';
};

const OrderReconciliationApproval: React.FC = () => {
  const { user } = useAuth();
  const { modalWidth } = useViewport();

  const [list, setList] = useState<OrderReconciliationApprovalRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState<QueryParams>({ page: 1, pageSize: 10, status: 'pending' });

  const [detailOpen, setDetailOpen] = useState(false);
  const [detailRecord, setDetailRecord] = useState<OrderReconciliationApprovalRecord | null>(null);

  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [paymentId, setPaymentId] = useState<string>('');
  const [paymentMethod, setPaymentMethod] = useState<string>('银行转账');

  const [returnModalOpen, setReturnModalOpen] = useState(false);
  const [returnId, setReturnId] = useState<string>('');
  const [returnReason, setReturnReason] = useState<string>('');

  // 获取审批付款列表
  const fetchList = async () => {
    setLoading(true);
    try {
      const res = await api.get<{ code: number; message: string; data: { records: OrderReconciliationApprovalRecord[]; total: number } }>(
        '/finance/order-reconciliation-approval/list',
        { params: query }
      );
      if (res.code === 200) {
        setList(toArray<OrderReconciliationApprovalRecord>(res.data?.records));
        setTotal(Number(res.data?.total || 0));
      } else {
        message.error(res.message || '获取审批付款列表失败');
      }
    } catch (e: unknown) {
      message.error((e as Error)?.message || '获取审批付款列表失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchList();
  }, [query]);

  // 核验
  const handleVerify = async (id: string) => {
    try {
      const res = await api.post<{ code: number; message: string }>('/finance/order-reconciliation-approval/verify', { id });
      if (res.code === 200) {
        message.success('核验成功');
        fetchList();
        if (detailRecord?.id === id) {
          setDetailRecord((prev) => prev ? { ...prev, status: 'verified' } : prev);
        }
      } else {
        message.error(res.message || '核验失败');
      }
    } catch (e: unknown) {
      message.error((e as Error)?.message || '核验失败');
    }
  };

  // 批准
  const handleApprove = async (id: string) => {
    try {
      const res = await api.post<{ code: number; message: string }>('/finance/order-reconciliation-approval/approve', { id });
      if (res.code === 200) {
        message.success('批准成功');
        fetchList();
        if (detailRecord?.id === id) {
          setDetailRecord((prev) => prev ? { ...prev, status: 'approved' } : prev);
        }
      } else {
        message.error(res.message || '批准失败');
      }
    } catch (e: unknown) {
      message.error((e as Error)?.message || '批准失败');
    }
  };

  // 打开付款弹窗
  const openPaymentModal = (id: string) => {
    setPaymentId(id);
    setPaymentMethod('银行转账');
    setPaymentModalOpen(true);
  };

  // 付款
  const handlePay = async () => {
    if (!paymentId) return;
    try {
      const res = await api.post<{ code: number; message: string }>('/finance/order-reconciliation-approval/pay', {
        id: paymentId,
        paymentMethod,
      });
      if (res.code === 200) {
        message.success('付款成功');
        setPaymentModalOpen(false);
        fetchList();
        if (detailRecord?.id === paymentId) {
          setDetailRecord((prev) => prev ? { ...prev, status: 'paid', paymentMethod } : prev);
        }
      } else {
        message.error(res.message || '付款失败');
      }
    } catch (e: unknown) {
      message.error((e as Error)?.message || '付款失败');
    }
  };

  // 打开退回弹窗
  const openReturnModal = (id: string) => {
    setReturnId(id);
    setReturnReason('');
    setReturnModalOpen(true);
  };

  // 退回
  const handleReturn = async () => {
    if (!returnId || !returnReason.trim()) {
      message.error('请填写退回原因');
      return;
    }
    try {
      const res = await api.post<{ code: number; message: string }>('/finance/order-reconciliation-approval/return', {
        id: returnId,
        reason: returnReason,
      });
      if (res.code === 200) {
        message.success('退回成功');
        setReturnModalOpen(false);
        fetchList();
        if (detailRecord?.id === returnId) {
          setDetailRecord((prev) => prev ? { ...prev, status: 'pending' } : prev);
        }
      } else {
        message.error(res.message || '退回失败');
      }
    } catch (e: unknown) {
      message.error((e as Error)?.message || '退回失败');
    }
  };

  const columns = [
    {
      title: '工厂名称',
      dataIndex: 'factoryName',
      key: 'factoryName',
      width: 150,
      render: (text: string, record: OrderReconciliationApprovalRecord) => (
        <Space>
          <span>{text || '-'}</span>
          {record.isOwnFactory === 1 && <Tag color="blue">本厂</Tag>}
        </Space>
      ),
    },
    {
      title: '订单数',
      dataIndex: 'orderCount',
      key: 'orderCount',
      width: 100,
      render: (val: number) => val?.toLocaleString() || '-',
    },
    {
      title: '总件数',
      dataIndex: 'totalQuantity',
      key: 'totalQuantity',
      width: 100,
      render: (val: number) => val?.toLocaleString() || '-',
    },
    {
      title: '总金额(元)',
      dataIndex: 'totalAmount',
      key: 'totalAmount',
      width: 120,
      render: (val: number) => formatMoney(val),
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (status: ReconStatus) => {
        const config = getStatusConfig(status);
        return <Tag color={config.color}>{config.text}</Tag>;
      },
    },
    {
      title: '批准时间',
      dataIndex: 'approvalTime',
      key: 'approvalTime',
      width: 160,
      render: (val: string) => formatDateTime(val) || '-',
    },
    {
      title: '付款时间',
      dataIndex: 'paymentTime',
      key: 'paymentTime',
      width: 160,
      render: (val: string) => formatDateTime(val) || '-',
    },
    {
      title: '操作',
      key: 'action',
      width: 200,
      fixed: 'right' as const,
      render: (_: unknown, record: OrderReconciliationApprovalRecord) => (
        <RowActions
          actions={[
            { label: '核验', onClick: () => handleVerify(record.id), hidden: record.status !== 'pending' },
            { label: '批准', onClick: () => handleApprove(record.id), hidden: record.status !== 'verified' },
            { label: '付款', onClick: () => openPaymentModal(record.id), hidden: record.status !== 'approved' },
            { label: '退回', onClick: () => openReturnModal(record.id), hidden: record.status === 'paid' || record.status === 'pending' },
            { label: '详情', onClick: () => { setDetailRecord(record); setDetailOpen(true); } },
          ]}
        />
      ),
    },
  ];

  return (
    <Layout>
      <Card title="订单结算审批付款" bordered={false}>
        <Space style={{ marginBottom: 16 }} wrap>
          <Input
            placeholder="搜索工厂名称"
            allowClear
            style={{ width: 200 }}
            onChange={(e) => setQuery((prev) => ({ ...prev, factoryName: e.target.value, page: 1 }))}
          />
          <Select
            placeholder="状态"
            allowClear
            style={{ width: 150 }}
            value={query.status}
            onChange={(val) => setQuery((prev) => ({ ...prev, status: val, page: 1 }))}
          >
            <Option value="">全部</Option>
            <Option value="pending">待审核</Option>
            <Option value="verified">已核验</Option>
            <Option value="approved">已批准</Option>
            <Option value="paid">已付款</Option>
            <Option value="rejected">已拒绝</Option>
          </Select>
          <Button onClick={() => fetchList()}>刷新</Button>
        </Space>

        <ResizableTable
          columns={columns}
          dataSource={list}
          rowKey="id"
          loading={loading}
          pagination={{
            current: query.page,
            pageSize: query.pageSize,
            total: total,
            showSizeChanger: true,
            showQuickJumper: true,
            showTotal: (total) => `共 ${total} 条`,
            onChange: (page, pageSize) => setQuery((prev) => ({ ...prev, page, pageSize })),
          }}
        />
      </Card>

      {/* 详情弹窗 */}
      <ResizableModal
        title="订单结算审批详情"
        open={detailOpen}
        onCancel={() => setDetailOpen(false)}
        defaultWidth={modalWidth}
        defaultHeight={window.innerHeight * 0.85}
        footer={null}
      >
        {detailRecord && (
          <>
            <Card size="small" title="基本信息" style={{ marginBottom: 16 }}>
              <Descriptions bordered column={2} size="small">
                <Descriptions.Item label="工厂名称">
                  <Space>
                    {detailRecord.factoryName || '-'}
                    {detailRecord.isOwnFactory === 1 && <Tag color="blue">本厂</Tag>}
                  </Space>
                </Descriptions.Item>
                <Descriptions.Item label="状态">
                  {(() => {
                    const config = getStatusConfig(detailRecord.status);
                    return <Tag color={config.color}>{config.text}</Tag>;
                  })()}
                </Descriptions.Item>
                <Descriptions.Item label="订单数">{detailRecord.orderCount?.toLocaleString() || '-'}</Descriptions.Item>
                <Descriptions.Item label="总件数">{detailRecord.totalQuantity?.toLocaleString() || '-'}</Descriptions.Item>
                <Descriptions.Item label="总金额(元)">{formatMoney(detailRecord.totalAmount)}</Descriptions.Item>
                <Descriptions.Item label="批准时间">{formatDateTime(detailRecord.approvalTime) || '-'}</Descriptions.Item>
                <Descriptions.Item label="批准人">{detailRecord.approvalBy || '-'}</Descriptions.Item>
                <Descriptions.Item label="付款时间">{formatDateTime(detailRecord.paymentTime) || '-'}</Descriptions.Item>
                <Descriptions.Item label="付款人">{detailRecord.paymentBy || '-'}</Descriptions.Item>
                <Descriptions.Item label="付款方式">{detailRecord.paymentMethod || '-'}</Descriptions.Item>
                <Descriptions.Item label="创建时间">{formatDateTime(detailRecord.createTime) || '-'}</Descriptions.Item>
                <Descriptions.Item label="更新时间">{formatDateTime(detailRecord.updateTime) || '-'}</Descriptions.Item>
                {detailRecord.reReviewReason && (
                  <Descriptions.Item label="退回原因" span={2}>{detailRecord.reReviewReason}</Descriptions.Item>
                )}
                {detailRecord.remark && (
                  <Descriptions.Item label="备注" span={2}>{detailRecord.remark}</Descriptions.Item>
                )}
              </Descriptions>
            </Card>

            <Card size="small" title="操作">
              <Space wrap>
                {detailRecord.status === 'pending' && (
                  <Button type="primary" icon={<CheckOutlined />} onClick={() => handleVerify(detailRecord.id)}>
                    核验
                  </Button>
                )}
                {detailRecord.status === 'verified' && (
                  <Button type="primary" icon={<SafetyCertificateOutlined />} onClick={() => handleApprove(detailRecord.id)}>
                    批准
                  </Button>
                )}
                {detailRecord.status === 'approved' && (
                  <Button type="primary" icon={<DollarOutlined />} onClick={() => openPaymentModal(detailRecord.id)}>
                    付款
                  </Button>
                )}
                {detailRecord.status !== 'paid' && detailRecord.status !== 'pending' && (
                  <Button icon={<RollbackOutlined />} onClick={() => openReturnModal(detailRecord.id)}>
                    退回
                  </Button>
                )}
              </Space>
            </Card>
          </>
        )}
      </ResizableModal>

      {/* 付款弹窗 */}
      <Modal
        title="付款确认"
        open={paymentModalOpen}
        onCancel={() => setPaymentModalOpen(false)}
        onOk={handlePay}
      >
        <Form layout="vertical">
          <Form.Item label="付款方式">
            <Select value={paymentMethod} onChange={setPaymentMethod}>
              <Option value="银行转账">银行转账</Option>
              <Option value="现金">现金</Option>
              <Option value="微信">微信</Option>
              <Option value="支付宝">支付宝</Option>
            </Select>
          </Form.Item>
        </Form>
      </Modal>

      {/* 退回弹窗 */}
      <Modal
        title="退回重审"
        open={returnModalOpen}
        onCancel={() => setReturnModalOpen(false)}
        onOk={handleReturn}
      >
        <Form layout="vertical">
          <Form.Item label="退回原因" required>
            <Input.TextArea
              rows={4}
              value={returnReason}
              onChange={(e) => setReturnReason(e.target.value)}
              placeholder="请填写退回原因"
            />
          </Form.Item>
        </Form>
      </Modal>
    </Layout>
  );
};

export default OrderReconciliationApproval;
