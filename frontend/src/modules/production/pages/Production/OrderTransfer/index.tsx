import React, { useEffect, useState, useMemo } from 'react';
import { Button, Modal, Tag, Input, App } from 'antd';
import SortableColumnTitle from '@/components/common/SortableColumnTitle';
import RowActions from '@/components/common/RowActions';
import ResizableTable from '@/components/common/ResizableTable';
import Layout from '@/components/Layout';
import api from '@/utils/api';
import { errorHandler } from '@/utils/errorHandling';
import SmartErrorNotice from '@/smart/components/SmartErrorNotice';
import { isSmartFeatureEnabled } from '@/smart/core/featureFlags';
import type { SmartErrorInfo } from '@/smart/core/types';
import '../../../styles.css';

const { TextArea } = Input;

interface OrderTransfer {
  id: number;
  orderId: string;
  orderNo: string;
  fromUserId: number;
  fromUserName: string;
  transferType: string; // 'user' | 'factory'
  toUserId: number;
  toUserName: string;
  toFactoryId?: string;
  toFactoryName?: string;
  status: string;
  message: string;
  rejectReason?: string;
  createdTime: string;
  handledTime?: string;
}

const OrderTransferPage: React.FC = () => {
  const { message } = App.useApp();
  const [transfers, setTransfers] = useState<OrderTransfer[]>([]);
  const [loading, setLoading] = useState(false);
  const [rejectModalVisible, setRejectModalVisible] = useState(false);
  const [selectedTransfer, setSelectedTransfer] = useState<OrderTransfer | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [sortField, setSortField] = useState<string>('createdTime');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [smartError, setSmartError] = useState<SmartErrorInfo | null>(null);
  const showSmartErrorNotice = useMemo(() => isSmartFeatureEnabled('smart.production.precheck.enabled'), []);

  const reportSmartError = (title: string, reason?: string, code?: string) => {
    if (!showSmartErrorNotice) return;
    setSmartError({ title, reason, code });
  };

  const handleSort = (field: string, order: 'asc' | 'desc') => {
    setSortField(field);
    setSortOrder(order);
  };

  const fetchTransfers = async () => {
    setLoading(true);
    try {
      const response = await api.get('/production/order/transfer/received', {
        params: { page: 1, pageSize: 100 }
      });
      const result = response as Record<string, unknown>;
      if (result.code === 200) {
        setTransfers((result.data as any)?.records || []);
        if (showSmartErrorNotice) setSmartError(null);
      } else {
        reportSmartError('订单转移列表加载失败', (result.message as string) || '服务返回异常，请稍后重试', 'ORDER_TRANSFER_LIST_FAILED');
        errorHandler.handleError(new Error((result.message as string) || '获取转移列表失败'), '获取转移列表失败');
      }
    } catch (error) {
      reportSmartError('订单转移列表加载失败', (error as Error)?.message || '网络异常或服务不可用，请稍后重试', 'ORDER_TRANSFER_LIST_EXCEPTION');
      errorHandler.handleError(error, '获取转移列表失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTransfers();
  }, []);

  const handleAccept = async (transfer: OrderTransfer) => {
    Modal.confirm({
      title: '确认接受转移',
      content: `确定要接受订单 ${transfer.orderNo} 的转移吗？`,
      onOk: async () => {
        try {
          const response = await api.post(`/production/order/transfer/accept/${transfer.id}`, {});
          const result = response as Record<string, unknown>;
          if (result.code === 200) {
            message.success('已接受转移');
            fetchTransfers();
          } else {
            reportSmartError('接受转移失败', (result.message as string) || '服务返回异常，请稍后重试', 'ORDER_TRANSFER_ACCEPT_FAILED');
            message.error((result.message as string) || '接受转移失败');
          }
        } catch (error) {
          reportSmartError('接受转移失败', (error as Error)?.message || '网络异常或服务不可用，请稍后重试', 'ORDER_TRANSFER_ACCEPT_EXCEPTION');
          errorHandler.handleError(error, '接受转移失败');
        }
      }
    });
  };

  const handleReject = (transfer: OrderTransfer) => {
    setSelectedTransfer(transfer);
    setRejectReason('');
    setRejectModalVisible(true);
  };

  // 添加排序逻辑
  const sortedTransfers = useMemo(() => {
    const sorted = [...transfers];
    sorted.sort((a: OrderTransfer, b: OrderTransfer) => {
      const aVal = a[sortField as keyof OrderTransfer];
      const bVal = b[sortField as keyof OrderTransfer];

      // 时间字段排序
      if (sortField === 'createdTime' || sortField === 'handledTime') {
        const aTime = aVal ? new Date(aVal as string).getTime() : 0;
        const bTime = bVal ? new Date(bVal as string).getTime() : 0;
        return sortOrder === 'desc' ? bTime - aTime : aTime - bTime;
      }

      return 0;
    });
    return sorted;
  }, [transfers, sortField, sortOrder]);

  const submitReject = async () => {
    if (!rejectReason.trim()) {
      message.warning('请输入拒绝原因');
      return;
    }

    try {
      const response = await api.post(`/production/order/transfer/reject/${selectedTransfer!.id}`, {
        rejectReason: rejectReason.trim()
      });
      const result = response as Record<string, unknown>;
      if (result.code === 200) {
        message.success('已拒绝转移');
        setRejectModalVisible(false);
        setSelectedTransfer(null);
        setRejectReason('');
        fetchTransfers();
      } else {
        reportSmartError('拒绝转移失败', (result.message as string) || '服务返回异常，请稍后重试', 'ORDER_TRANSFER_REJECT_FAILED');
        message.error((result.message as string) || '拒绝转移失败');
      }
    } catch (error) {
      reportSmartError('拒绝转移失败', (error as Error)?.message || '网络异常或服务不可用，请稍后重试', 'ORDER_TRANSFER_REJECT_EXCEPTION');
      errorHandler.handleError(error, '拒绝转移失败');
    }
  };

  const getStatusTag = (status: string) => {
    const statusMap: Record<string, { color: string; text: string }> = {
      pending: { color: 'default', text: '待处理' },
      accepted: { color: 'success', text: '已接受' },
      rejected: { color: 'error', text: '已拒绝' },
    };
    const config = statusMap[status] || { color: 'default', text: status };
    return <Tag color={config.color}>{config.text}</Tag>;
  };

  const columns = [
    {
      title: '订单号',
      dataIndex: 'orderNo',
      key: 'orderNo',
      width: 150,
    },
    {
      title: '发起人',
      dataIndex: 'fromUserName',
      key: 'fromUserName',
      width: 100,
    },
    {
      title: '转移类型',
      dataIndex: 'transferType',
      key: 'transferType',
      width: 100,
      render: (type: string) => (
        <Tag color={type === 'factory' ? 'blue' : 'default'}>
          {type === 'factory' ? '转工厂' : '转人员'}
        </Tag>
      ),
    },
    {
      title: '转移目标',
      key: 'transferTarget',
      width: 130,
      render: (_: any, record: OrderTransfer) => {
        if (record.transferType === 'factory') {
          return record.toFactoryName || record.toFactoryId || '-';
        }
        return record.toUserName || '-';
      },
    },
    {
      title: '转移留言',
      dataIndex: 'message',
      key: 'message',
      ellipsis: true,
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (status: string) => getStatusTag(status),
    },
    {
      title: <SortableColumnTitle
        title="创建时间"
        sortField={sortField}
        fieldName="createdTime"
        sortOrder={sortOrder}
        onSort={handleSort}
        align="left"
      />,
      dataIndex: 'createdTime',
      key: 'createdTime',
      width: 180,
    },
    {
      title: <SortableColumnTitle
        title="处理时间"
        sortField={sortField}
        fieldName="handledTime"
        sortOrder={sortOrder}
        onSort={handleSort}
        align="left"
      />,
      dataIndex: 'handledTime',
      key: 'handledTime',
      width: 180,
      render: (time: string) => time || '-',
    },
    {
      title: '操作',
      key: 'action',
      width: 180,
      render: (_: any, record: OrderTransfer) => {
        if (record.status === 'pending') {
          return (
            <RowActions
              actions={[
                {
                  key: 'accept',
                  label: '接受',
                  primary: true,
                  onClick: () => handleAccept(record)
                },
                {
                  key: 'reject',
                  label: '拒绝',
                  danger: true,
                  onClick: () => handleReject(record)
                }
              ]}
            />
          );
        }
        if (record.status === 'rejected' && record.rejectReason) {
          return <span style={{ color: 'var(--neutral-text-disabled)' }}>拒绝原因: {record.rejectReason}</span>;
        }
        return <span style={{ color: 'var(--neutral-text-disabled)' }}>-</span>;
      },
    },
  ];

  return (
    <Layout>
        <div className="page-header">
          <h2 className="page-title">订单转移管理</h2>
          <Button onClick={fetchTransfers}>刷新</Button>
        </div>

        {showSmartErrorNotice && smartError ? (
          <div style={{ marginBottom: 12 }}>
            <SmartErrorNotice error={smartError} onFix={fetchTransfers} />
          </div>
        ) : null}

        <ResizableTable
          storageKey="order-transfer"
          columns={columns}
          dataSource={sortedTransfers}
          rowKey="id"
          loading={loading}
          pagination={{
            showSizeChanger: true,
            showQuickJumper: true,
            showTotal: (total) => `共 ${total} 条`,
            pageSizeOptions: ['10', '20', '50', '100'],
          }}
        />

        <Modal
          title="拒绝转移"
          open={rejectModalVisible}
          onOk={submitReject}
          onCancel={() => {
            setRejectModalVisible(false);
            setSelectedTransfer(null);
            setRejectReason('');
          }}
          okText="确认拒绝"
          cancelText="取消"
        >
          <div style={{ marginBottom: 16 }}>
            <strong>订单号:</strong> {selectedTransfer?.orderNo}
          </div>
          <div style={{ marginBottom: 16 }}>
            <strong>发起人:</strong> {selectedTransfer?.fromUserName}
          </div>
          <div>
            <strong>拒绝原因:</strong>
            <TextArea
              rows={4}
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="请输入拒绝原因"
              style={{ marginTop: 8 }}
            />
          </div>
        </Modal>
    </Layout>
  );
};

export default OrderTransferPage;
