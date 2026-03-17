import React, { useEffect, useState, useCallback } from 'react';
import { Badge, Button, Input, Modal, Tabs, Tag } from 'antd';
import Layout from '@/components/Layout';
import ResizableTable from '@/components/common/ResizableTable';
import RowActions from '@/components/common/RowActions';
import api from '@/utils/api';
import { formatDateTime } from '@/utils/datetime';
import { message } from '@/utils/antdStatic';

const { TextArea } = Input;

interface ApprovalRecord {
  id: string;
  operationType: string;
  targetId: string;
  targetNo: string;
  applicantName: string;
  orgUnitName: string;
  applyReason: string;
  status: string;
  reviewRemark: string;
  reviewTime: string;
  applyTime: string;
}

const OP_TYPE_LABELS: Record<string, string> = {
  ORDER_DELETE: '删除订单',
  ORDER_SCRAP: '报废订单',
  DATA_MODIFY: '修改数据',
};

const StatusTag: React.FC<{ status: string }> = ({ status }) => {
  const map: Record<string, { color: string; text: string }> = {
    PENDING:  { color: 'gold',    text: '待审批' },
    APPROVED: { color: 'green',   text: '已通过' },
    REJECTED: { color: 'red',     text: '已驳回' },
    CANCELLED:{ color: 'default', text: '已撤销' },
  };
  const cfg = map[status] ?? { color: 'default', text: status };
  return <Tag color={cfg.color}>{cfg.text}</Tag>;
};

const ApprovalCenter: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'pending' | 'my'>('pending');
  const [loading, setLoading] = useState(false);
  const [records, setRecords] = useState<ApprovalRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pendingCount, setPendingCount] = useState(0);

  // 审批弹窗
  const [reviewModalVisible, setReviewModalVisible] = useState(false);
  const [reviewAction, setReviewAction] = useState<'approve' | 'reject'>('approve');
  const [remark, setRemark] = useState('');
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const fetchPendingCount = useCallback(async () => {
    try {
      const res = await api.get('/system/approval/pending-count') as any;
      if (res?.code === 200) setPendingCount(res.data ?? 0);
    } catch {/* silent */}
  }, []);

  const fetchRecords = useCallback(async () => {
    setLoading(true);
    try {
      const url = activeTab === 'pending' ? '/system/approval/pending' : '/system/approval/my';
      const res = await api.get(url, { params: { page, pageSize: 15 } }) as any;
      if (res?.code === 200) {
        setRecords(res.data?.records ?? res.data ?? []);
        setTotal(res.data?.total ?? 0);
      }
    } catch {
      message.error('加载失败');
    } finally {
      setLoading(false);
    }
  }, [activeTab, page]);

  useEffect(() => {
    fetchPendingCount();
  }, [fetchPendingCount]);

  useEffect(() => {
    setPage(1);
  }, [activeTab]);

  useEffect(() => {
    fetchRecords();
  }, [fetchRecords]);

  const openReview = (id: string, action: 'approve' | 'reject') => {
    setReviewingId(id);
    setReviewAction(action);
    setRemark('');
    setReviewModalVisible(true);
  };

  const handleCancel = async (id: string) => {
    Modal.confirm({
      width: '30vw',
      title: '确认撤销申请？',
      onOk: async () => {
        try {
          await api.post(`/system/approval/${id}/cancel`);
          message.success('已撤销');
          fetchRecords();
        } catch {
          message.error('撤销失败');
        }
      },
    });
  };

  const handleReviewSubmit = async () => {
    if (!reviewingId) return;
    setSubmitting(true);
    try {
      const url = `/system/approval/${reviewingId}/${reviewAction}`;
      const body = reviewAction === 'approve' ? { remark } : { reason: remark };
      await api.post(url, body);
      message.success(reviewAction === 'approve' ? '已通过' : '已驳回');
      setReviewModalVisible(false);
      fetchRecords();
      fetchPendingCount();
    } catch {
      message.error('操作失败');
    } finally {
      setSubmitting(false);
    }
  };

  const pendingColumns = [
    { title: '操作类型', dataIndex: 'operationType', key: 'opType', width: 120,
      render: (v: string) => OP_TYPE_LABELS[v] ?? v },
    { title: '业务单号', dataIndex: 'targetNo', key: 'targetNo', width: 160,
      render: (v: string) => v || '—' },
    { title: '申请人', dataIndex: 'applicantName', key: 'applicant', width: 100 },
    { title: '所属组织', dataIndex: 'orgUnitName', key: 'orgUnit', width: 130 },
    { title: '申请原因', dataIndex: 'applyReason', key: 'reason', ellipsis: true },
    { title: '申请时间', dataIndex: 'applyTime', key: 'applyTime', width: 155,
      render: (v: string) => formatDateTime(v) },
    {
      title: '操作', key: 'actions', width: 140,
      render: (_: unknown, record: ApprovalRecord) => (
        <RowActions actions={[
          { key: 'approve', label: '通过', primary: true,
            onClick: () => openReview(record.id, 'approve') },
          { key: 'reject', label: '驳回', danger: true,
            onClick: () => openReview(record.id, 'reject') },
        ]} />
      ),
    },
  ];

  const myColumns = [
    { title: '操作类型', dataIndex: 'operationType', key: 'opType', width: 120,
      render: (v: string) => OP_TYPE_LABELS[v] ?? v },
    { title: '业务单号', dataIndex: 'targetNo', key: 'targetNo', width: 160,
      render: (v: string) => v || '—' },
    { title: '审批人', dataIndex: 'approverName', key: 'approver', width: 100 },
    { title: '申请原因', dataIndex: 'applyReason', key: 'reason', ellipsis: true },
    { title: '状态', dataIndex: 'status', key: 'status', width: 90,
      render: (v: string) => <StatusTag status={v} /> },
    { title: '审批意见', dataIndex: 'reviewRemark', key: 'remark', ellipsis: true,
      render: (v: string) => v || '—' },
    { title: '申请时间', dataIndex: 'applyTime', key: 'applyTime', width: 155,
      render: (v: string) => formatDateTime(v) },
    {
      title: '操作', key: 'actions', width: 100,
      render: (_: unknown, record: ApprovalRecord) =>
        record.status === 'PENDING' ? (
          <RowActions actions={[
            { key: 'cancel', label: '撤销', danger: true,
              onClick: () => handleCancel(record.id) },
          ]} />
        ) : null,
    },
  ];

  return (
    <Layout>
      <div style={{ padding: '16px 20px' }}>
        <Tabs
          activeKey={activeTab}
          onChange={(k) => setActiveTab(k as 'pending' | 'my')}
          items={[
            {
              key: 'pending',
              label: (
                <Badge count={pendingCount} offset={[10, 0]}>
                  <span>待我审批</span>
                </Badge>
              ),
            },
            { key: 'my', label: '我的申请' },
          ]}
        />

        <ResizableTable
          loading={loading}
          dataSource={records}
          columns={activeTab === 'pending' ? pendingColumns : myColumns}
          rowKey="id"
          pagination={{
            current: page,
            total,
            pageSize: 15,
            onChange: setPage,
            showTotal: (t) => `共 ${t} 条`,
          }}
        />
      </div>

      <Modal
        title={reviewAction === 'approve' ? '确认通过' : '驳回申请'}
        open={reviewModalVisible}
        onCancel={() => setReviewModalVisible(false)}
        width="30vw"
        footer={[
          <Button key="cancel" onClick={() => setReviewModalVisible(false)}>取消</Button>,
          <Button
            key="ok"
            type="primary"
            danger={reviewAction === 'reject'}
            loading={submitting}
            onClick={handleReviewSubmit}
          >
            确认{reviewAction === 'approve' ? '通过' : '驳回'}
          </Button>,
        ]}
      >
        <TextArea
          rows={3}
          placeholder={reviewAction === 'approve' ? '审批备注（选填）' : '驳回原因（选填）'}
          value={remark}
          onChange={(e) => setRemark(e.target.value)}
        />
      </Modal>
    </Layout>
  );
};

export default ApprovalCenter;
