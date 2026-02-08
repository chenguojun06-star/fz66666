import React, { useEffect, useMemo, useState } from 'react';
import { Button, Card, Descriptions, Form, Input, Modal, Select, Space, Tag, message } from 'antd';
import { CheckOutlined, CloseCircleOutlined, DollarOutlined, RollbackOutlined, SafetyCertificateOutlined } from '@ant-design/icons';
import Layout from '@/components/Layout';
import ResizableTable from '@/components/common/ResizableTable';
import ResizableModal from '@/components/common/ResizableModal';
import RowActions from '@/components/common/RowActions';
import api from '@/utils/api';
import { formatDateTime } from '@/utils/datetime';
import { useAuth } from '@/utils/AuthContext';

// 订单结算审批记录类型
interface OrderReconciliationApprovalRecord {
  id: string;
  factoryName: string;
  isOwnFactory: number; // 0=加工厂, 1=本厂
  orderCount: number;
  totalQuantity: number;
  totalAmount: number;
  reconciliationIds?: string;
  status: 'pending' | 'approved' | 'paid' | 'rejected';
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

type ReconStatus = 'pending' | 'approved' | 'paid' | 'rejected';

const { Option } = Select;

// 审批金额阈值配置
const APPROVAL_AMOUNT_LIMITS = {
  NORMAL: 10000,      // 10000元以下：普通员工可审批
  MANAGER: 50000,     // 10000-50000元：需要经理权限
  DIRECTOR: 100000,   // 50000-100000元：需要总监权限
  CEO: Infinity,      // 100000元以上：需要CEO权限
};

// 审批备注要求
const REMARK_REQUIRED_AMOUNT = 10000; // 大于10000元时必须填写备注

const toArray = <T,>(value: unknown): T[] => {
  if (Array.isArray(value)) return value as T[];
  return [];
};

const getStatusConfig = (status: ReconStatus | string | undefined) => {
  const statusMap: Record<string, { text: string; color: string }> = {
    pending: { text: '待审批', color: 'default' },
    approved: { text: '已审批', color: 'success' },
    paid: { text: '已付款', color: 'cyan' },
    rejected: { text: '已驳回', color: 'error' },
  };
  return statusMap[String(status || '')] || { text: '未知', color: 'default' };
};

const formatMoney = (value: unknown) => {
  const n = Number(value);
  return Number.isFinite(n) ? n.toFixed(2) : '-';
};

const OrderReconciliationApproval: React.FC = () => {
  const { user } = useAuth();

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

  // 核验功能已删除（流程简化）

  // 审批 - 带金额校验和备注要求
  const handleApprove = async (id: string) => {
    // 查找对应的记录
    const record = list.find((item) => item.id === id);
    if (!record) {
      message.error('未找到对应的记录');
      return;
    }

    const amount = record.totalAmount || 0;

    // 金额校验 - 检查用户权限
    const userRole = user?.role || 'employee';

    // 权限等级检查
    const userMaxAmount = (() => {
      switch (userRole) {
        case 'ceo':
        case 'admin':
          return APPROVAL_AMOUNT_LIMITS.CEO;
        case 'director':
          return APPROVAL_AMOUNT_LIMITS.DIRECTOR;
        case 'manager':
          return APPROVAL_AMOUNT_LIMITS.MANAGER;
        default:
          return APPROVAL_AMOUNT_LIMITS.NORMAL;
      }
    })();

    if (amount > userMaxAmount) {
      message.error(`审批金额 ¥${amount.toFixed(2)} 超出您的权限上限 ¥${userMaxAmount.toFixed(2)}，请联系上级审批`);
      return;
    }

    // 大额审批需要备注
    if (amount > REMARK_REQUIRED_AMOUNT) {
      Modal.confirm({
        title: '大额审批确认',
        content: (
          <div>
            <p>审批金额：<strong style={{ color: '#ff4d4f', fontSize: '16px' }}>¥{amount.toFixed(2)}</strong></p>
            <p>工厂名称：{record.factoryName}</p>
            <p>订单数量：{record.orderCount} 个</p>
            <p>生产数量：{record.totalQuantity} 件</p>
            <div style={{ marginTop: 16 }}>
              <div style={{ marginBottom: 8 }}>审批备注（必填）：</div>
              <Input.TextArea
                id="approval-remark"
                placeholder="请输入审批备注（大额审批必须填写原因）"
                rows={3}
                maxLength={200}
              />
            </div>
          </div>
        ),
        okText: '确认审批',
        cancelText: '取消',
        width: 500,
        onOk: async () => {
          const remarkInput = document.getElementById('approval-remark') as HTMLTextAreaElement;
          const remark = remarkInput?.value?.trim();

          if (!remark) {
            message.error('大额审批必须填写备注');
            return Promise.reject();
          }

          try {
            const res = await api.post<{ code: number; message: string }>('/finance/order-reconciliation-approval/approve', {
              id,
              remark,
            });
            if (res.code === 200) {
              message.success('审批成功');
              fetchList();
              if (detailRecord?.id === id) {
                setDetailRecord((prev) => prev ? { ...prev, status: 'approved', remark } : prev);
              }
            } else {
              message.error(res.message || '审批失败');
            }
          } catch (e: unknown) {
            message.error((e as Error)?.message || '审批失败');
            throw e;
          }
        },
      });
    } else {
      // 小额审批直接确认
      Modal.confirm({
        title: '审批确认',
        content: (
          <div>
            <p>审批金额：<strong>¥{amount.toFixed(2)}</strong></p>
            <p>工厂名称：{record.factoryName}</p>
            <p>订单数量：{record.orderCount} 个</p>
            <p>生产数量：{record.totalQuantity} 件</p>
          </div>
        ),
        okText: '确认审批',
        cancelText: '取消',
        onOk: async () => {
          try {
            const res = await api.post<{ code: number; message: string }>('/finance/order-reconciliation-approval/approve', { id });
            if (res.code === 200) {
              message.success('审批成功');
              fetchList();
              if (detailRecord?.id === id) {
                setDetailRecord((prev) => prev ? { ...prev, status: 'approved' } : prev);
              }
            } else {
              message.error(res.message || '审批失败');
            }
          } catch (e: unknown) {
            message.error((e as Error)?.message || '审批失败');
            throw e;
          }
        },
      });
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

  // 驳回
  const handleReturn = async () => {
    if (!returnId || !returnReason.trim()) {
      message.error('请填写驳回原因');
      return;
    }
    try {
      const res = await api.post<{ code: number; message: string }>('/finance/order-reconciliation-approval/return', {
        id: returnId,
        reason: returnReason,
      });
      if (res.code === 200) {
        message.success('驳回成功');
        setReturnModalOpen(false);
        fetchList();
        if (detailRecord?.id === returnId) {
          setDetailRecord((prev) => prev ? { ...prev, status: 'pending' } : prev);
        }
      } else {
        message.error(res.message || '驳回失败');
      }
    } catch (e: unknown) {
      message.error((e as Error)?.message || '驳回失败');
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
            { label: '审批', onClick: () => handleApprove(record.id), hidden: record.status !== 'pending', primary: true },
            { label: '付款', onClick: () => openPaymentModal(record.id), hidden: record.status !== 'approved', primary: true },
            { label: '驳回', onClick: () => openReturnModal(record.id), hidden: record.status === 'paid' || record.status === 'pending', danger: true },
            { label: '详情', onClick: () => { setDetailRecord(record); setDetailOpen(true); } },
          ]}
        />
      ),
    },
  ];

  return (
    <Layout>
      <Card title="订单结算审批付款">
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
            <Option value="pending">待审批</Option>
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
            pageSizeOptions: ['10', '20', '50', '100'],
            onChange: (page, pageSize) => setQuery((prev) => ({ ...prev, page, pageSize })),
          }}
        />
      </Card>

      {/* 详情弹窗 */}
      <ResizableModal
        title="订单结算审批详情"
        open={detailOpen}
        onCancel={() => setDetailOpen(false)}
        defaultWidth="60vw"
        defaultHeight="60vh"
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
                  <Button type="primary" onClick={() => handleApprove(detailRecord.id)}>
                    审批
                  </Button>
                )}
                {detailRecord.status === 'approved' && (
                  <Button type="primary" onClick={() => openPaymentModal(detailRecord.id)}>
                    付款
                  </Button>
                )}
                {(detailRecord.status === 'approved' || detailRecord.status === 'paid') && (
                  <Button danger onClick={() => openReturnModal(detailRecord.id)}>
                    驳回
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

      {/* 驳回弹窗 */}
      <Modal
        title="驳回重审"
        open={returnModalOpen}
        onCancel={() => setReturnModalOpen(false)}
        onOk={handleReturn}
      >
        <Form layout="vertical">
          <Form.Item label="驳回原因" required>
            <Input.TextArea
              rows={4}
              value={returnReason}
              onChange={(e) => setReturnReason(e.target.value)}
              placeholder="请填写驳回原因"
            />
          </Form.Item>
        </Form>
      </Modal>
    </Layout>
  );
};

export default OrderReconciliationApproval;
