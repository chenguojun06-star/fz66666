import React, { useEffect, useState } from 'react';
import { Table, Tag, Button, Space, Input, Modal, message, Card, Row, Col, Statistic } from 'antd';
import { CheckCircleOutlined, CloseCircleOutlined, MessageOutlined } from '@ant-design/icons';
import { wagePaymentApi } from '@/services/finance/wagePaymentApi';
import { formatDateTime } from '@/utils/datetime';

const STATUS_MAP: Record<string, { text: string; color: string }> = {
  PENDING: { text: '待处理', color: 'orange' },
  RESOLVED: { text: '已解决', color: 'green' },
  REJECTED: { text: '已驳回', color: 'red' },
};

const TYPE_MAP: Record<string, { text: string; color: string }> = {
  CONFIRM: { text: '确认', color: 'green' },
  OBJECTION: { text: '异议', color: 'orange' },
};

const WageFeedbackTab: React.FC = () => {
  const [list, setList] = useState<any[]>([]);
  const [stats, setStats] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(false);
  const [resolveModal, setResolveModal] = useState<{ id: string; action: string } | null>(null);
  const [resolveRemark, setResolveRemark] = useState('');

  const loadData = async () => {
    setLoading(true);
    try {
      const [listRes, statsRes] = await Promise.all([
        wagePaymentApi.listFeedback(),
        wagePaymentApi.getFeedbackStats(),
      ]);
      setList((listRes as any)?.data?.data ?? (listRes as any)?.data ?? []);
      setStats((statsRes as any)?.data?.data ?? (statsRes as any)?.data ?? {});
    } catch {
      setList([]);
      setStats({});
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, []);

  const handleResolve = async () => {
    if (!resolveModal) return;
    try {
      await wagePaymentApi.resolveFeedback(resolveModal.id, resolveModal.action, resolveRemark);
      message.success(resolveModal.action === 'RESOLVED' ? '已解决' : '已驳回');
      setResolveModal(null);
      setResolveRemark('');
      loadData();
    } catch {
      message.error('操作失败');
    }
  };

  const columns = [
    { title: '反馈人', dataIndex: 'operatorName', key: 'operatorName', width: 100 },
    { title: '结算单ID', dataIndex: 'settlementId', key: 'settlementId', width: 160, ellipsis: true },
    {
      title: '类型', dataIndex: 'feedbackType', key: 'feedbackType', width: 80,
      render: (v: string) => {
        const t = TYPE_MAP[v] || { text: v, color: 'default' };
        return <Tag color={t.color}>{t.text}</Tag>;
      },
    },
    { title: '反馈内容', dataIndex: 'feedbackContent', key: 'feedbackContent', ellipsis: true },
    {
      title: '状态', dataIndex: 'status', key: 'status', width: 90,
      render: (v: string) => {
        const s = STATUS_MAP[v] || { text: v, color: 'default' };
        return <Tag color={s.color}>{s.text}</Tag>;
      },
    },
    {
      title: '处理结果', dataIndex: 'resolveRemark', key: 'resolveRemark', width: 150, ellipsis: true,
      render: (v: string, r: any) => v ? (
        <div>
          <div>{v}</div>
          {r.resolverName && <div style={{ fontSize: 12, color: '#999' }}>处理人: {r.resolverName}</div>}
        </div>
      ) : '-',
    },
    { title: '提交时间', dataIndex: 'createTime', key: 'createTime', width: 160, render: (v: string) => formatDateTime(v) },
    {
      title: '操作', key: 'action', width: 140,
      render: (_: any, r: any) => r.status === 'PENDING' ? (
        <Space size={4}>
          <Button type="link" size="small" icon={<CheckCircleOutlined />}
            onClick={() => { setResolveModal({ id: r.id, action: 'RESOLVED' }); setResolveRemark(''); }}>
            解决
          </Button>
          <Button type="link" size="small" danger icon={<CloseCircleOutlined />}
            onClick={() => { setResolveModal({ id: r.id, action: 'REJECTED' }); setResolveRemark(''); }}>
            驳回
          </Button>
        </Space>
      ) : '-',
    },
  ];

  return (
    <div>
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={6}>
          <Card size="small"><Statistic title="总反馈" value={stats.totalCount ?? 0} prefix={<MessageOutlined />} /></Card>
        </Col>
        <Col span={6}>
          <Card size="small"><Statistic title="待处理" value={stats.pendingCount ?? 0} styles={{ content: { color: '#faad14' } }} /></Card>
        </Col>
        <Col span={6}>
          <Card size="small"><Statistic title="已解决" value={stats.resolvedCount ?? 0} styles={{ content: { color: '#52c41a' } }} /></Card>
        </Col>
        <Col span={6}>
          <Card size="small"><Statistic title="已驳回" value={stats.rejectedCount ?? 0} styles={{ content: { color: '#ff4d4f' } }} /></Card>
        </Col>
      </Row>

      <Table
        columns={columns}
        dataSource={list}
        rowKey="id"
        size="small"
        loading={loading}
        pagination={{ pageSize: 20 }}
      />

      <Modal
        title={resolveModal?.action === 'RESOLVED' ? '确认解决' : '确认驳回'}
        open={!!resolveModal}
        onOk={handleResolve}
        onCancel={() => setResolveModal(null)}
        okText="确认"
      >
        <Input.TextArea
          placeholder="处理备注（可选）"
          value={resolveRemark}
          onChange={e => setResolveRemark(e.target.value)}
          rows={3}
          maxLength={500}
        />
      </Modal>
    </div>
  );
};

export default WageFeedbackTab;
