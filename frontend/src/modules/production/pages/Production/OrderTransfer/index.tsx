import React, { useEffect, useState, useMemo } from 'react';
import { Button, Table, Modal, Tag, Space, Input, App } from 'antd';
import { CheckOutlined, CloseOutlined } from '@ant-design/icons';
import SortableColumnTitle from '@/components/common/SortableColumnTitle';
import Layout from '@/components/Layout';
import api from '@/utils/api';
import errorHandler from '@/utils/errorHandler';
import './styles.css';

const { TextArea } = Input;

interface OrderTransfer {
  id: number;
  orderId: string;
  orderNo: string;
  fromUserId: number;
  fromUserName: string;
  toUserId: number;
  toUserName: string;
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
        setTransfers(result.data?.records || []);
      } else {
        errorHandler.handleError(new Error(result.message || '获取转移列表失败'), '获取转移列表失败');
      }
    } catch (error) {
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
            message.error(result.message || '接受转移失败');
          }
        } catch (error) {
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
        message.error(result.message || '拒绝转移失败');
      }
    } catch (error) {
      errorHandler.handleError(error, '拒绝转移失败');
    }
  };

  const getStatusTag = (status: string) => {
    const statusMap: Record<string, { color: string; text: string }> = {
      pending: { color: 'orange', text: '待处理' },
      accepted: { color: 'green', text: '已接受' },
      rejected: { color: 'red', text: '已拒绝' },
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
            <Space>
              <Button
                type="primary"
                size="small"
                icon={<CheckOutlined />}
                onClick={() => handleAccept(record)}
              >
                接受
              </Button>
              <Button
                danger
                size="small"
                icon={<CloseOutlined />}
                onClick={() => handleReject(record)}
              >
                拒绝
              </Button>
            </Space>
          );
        }
        if (record.status === 'rejected' && record.rejectReason) {
          return <span style={{ color: '#999' }}>拒绝原因: {record.rejectReason}</span>;
        }
        return <span style={{ color: '#999' }}>-</span>;
      },
    },
  ];

  return (
    <Layout>
      <div className="page-container">
        <div className="page-header">
          <h2 className="page-title">订单转移管理</h2>
          <Button onClick={fetchTransfers}>刷新</Button>
        </div>

        <Table
          columns={columns}
          dataSource={sortedTransfers}
          rowKey="id"
          loading={loading}
          pagination={{
            showSizeChanger: true,
            showQuickJumper: true,
            showTotal: (total) => `共 ${total} 条`,
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
      </div>
    </Layout>
  );
};

export default OrderTransferPage;
