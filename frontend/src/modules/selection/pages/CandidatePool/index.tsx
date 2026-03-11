import React, { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Button,
  Table,
  Tag,
  Space,
  Modal,
  Form,
  Input,
  InputNumber,
  Select,
  message,
  Rate,
  Descriptions,
  Popconfirm,
  Tooltip,
  Drawer,
  Spin,
  Divider,
} from 'antd';
import {
  PlusOutlined,
  RobotOutlined,
  CheckOutlined,
  CloseOutlined,
  PauseOutlined,
  ExperimentOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import {
  candidateList,
  candidateSave,
  candidateUpdate,
  candidateReview,
  candidateGetReviews,
  candidateStageAction,
  candidateCreateStyle,
  candidateAiScore,
  candidateDelete,
} from '@/services/selection/selectionApi';

interface Candidate {
  id: number;
  candidateNo: string;
  styleName: string;
  category: string;
  colorFamily: string;
  fabricType: string;
  sourceType: string;
  costEstimate: number;
  targetPrice: number;
  targetQty: number;
  status: string;
  trendScore: number;
  trendScoreReason: string;
  avgReviewScore: number;
  reviewCount: number;
  rejectReason: string;
  createdStyleNo: string;
  createTime: string;
}

interface Review {
  id: number;
  reviewerName: string;
  score: number;
  decision: string;
  comment: string;
  reviewTime: string;
}

const STATUS_COLORS: Record<string, string> = {
  PENDING: 'processing',
  APPROVED: 'success',
  REJECTED: 'error',
  HOLD: 'warning',
};
const STATUS_LABELS: Record<string, string> = {
  PENDING: '待评审',
  APPROVED: '已通过',
  REJECTED: '未通过',
  HOLD: '待定',
};

const CATEGORY_OPTIONS = ['上装', '下装', '外套', '连衣裙', '针织', '配件', '其他'];
const SOURCE_OPTIONS = [
  { label: '内部设计', value: 'INTERNAL' },
  { label: '供应商推荐', value: 'SUPPLIER' },
  { label: '客户指定', value: 'CLIENT' },
];

export default function CandidatePool() {
  const [searchParams] = useSearchParams();
  const batchId = Number(searchParams.get('batchId') ?? 0);
  const batchName = searchParams.get('batchName') ?? '';

  const [data, setData] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form] = Form.useForm();

  const [reviewDrawerOpen, setReviewDrawerOpen] = useState(false);
  const [reviewTarget, setReviewTarget] = useState<Candidate | null>(null);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [reviewsLoading, setReviewsLoading] = useState(false);
  const [reviewForm] = Form.useForm();
  const [aiScoring, setAiScoring] = useState<number | null>(null);
  const [rejectReasonTarget, setRejectReasonTarget] = useState<number | null>(null);
  const [rejectInput, setRejectInput] = useState('');

  const load = useCallback(async () => {
    if (!batchId) return;
    setLoading(true);
    try {
      const res = await candidateList({ batchId, page: 1, pageSize: 200 });
      setData(res?.data?.records ?? res?.data ?? []);
    } catch {
      message.error('加载失败');
    } finally {
      setLoading(false);
    }
  }, [batchId]);

  useEffect(() => {
    load();
  }, [load]);

  const openCreate = () => {
    setEditId(null);
    form.resetFields();
    setModalOpen(true);
  };

  const openEdit = (r: Candidate) => {
    setEditId(r.id);
    form.setFieldsValue(r);
    setModalOpen(true);
  };

  const handleSave = async () => {
    const values = await form.validateFields();
    try {
      if (editId) {
        await candidateUpdate(editId, values);
        message.success('更新成功');
      } else {
        await candidateSave({ ...values, batchId });
        message.success('创建成功');
      }
      setModalOpen(false);
      load();
    } catch (e: unknown) {
      const err = e as { response?: { data?: { message?: string } } };
      message.error(err?.response?.data?.message ?? '操作失败');
    }
  };

  const openReviewDrawer = async (r: Candidate) => {
    setReviewTarget(r);
    setReviewDrawerOpen(true);
    setReviewsLoading(true);
    try {
      const res = await candidateGetReviews(r.id);
      setReviews(res?.data ?? []);
    } finally {
      setReviewsLoading(false);
    }
    reviewForm.resetFields();
  };

  const submitReview = async () => {
    if (!reviewTarget) return;
    const values = await reviewForm.validateFields();
    try {
      await candidateReview({ ...values, candidateId: reviewTarget.id });
      message.success('评审提交成功');
      // 刷新评审列表
      const res = await candidateGetReviews(reviewTarget.id);
      setReviews(res?.data ?? []);
      reviewForm.resetFields();
      load();
    } catch (e: unknown) {
      const err = e as { response?: { data?: { message?: string } } };
      message.error(err?.response?.data?.message ?? '提交失败');
    }
  };

  const handleStageAction = async (id: number, action: string, label: string, reason?: string) => {
    try {
      await candidateStageAction(id, action, reason);
      message.success(`${label}成功`);
      load();
    } catch (e: unknown) {
      const err = e as { response?: { data?: { message?: string } } };
      message.error(err?.response?.data?.message ?? `${label}失败`);
    }
  };

  const handleReject = async (id: number) => {
    if (!rejectInput.trim()) {
      message.warning('请输入拒绝理由');
      return;
    }
    await handleStageAction(id, 'reject', '拒绝', rejectInput.trim());
    setRejectReasonTarget(null);
    setRejectInput('');
  };

  const handleCreateStyle = async (id: number) => {
    try {
      await candidateCreateStyle(id);
      message.success('款式已创建，进入样衣开发流程');
      load();
    } catch (e: unknown) {
      const err = e as { response?: { data?: { message?: string } } };
      message.error(err?.response?.data?.message ?? '创建款式失败');
    }
  };

  const handleAiScore = async (id: number) => {
    setAiScoring(id);
    try {
      await candidateAiScore(id);
      message.success('AI 评分完成');
      load();
    } catch {
      message.error('AI 评分失败');
    } finally {
      setAiScoring(null);
    }
  };

  const columns: ColumnsType<Candidate> = [
    { title: '候选款号', dataIndex: 'candidateNo', width: 160, fixed: 'left' },
    { title: '款式名称', dataIndex: 'styleName', width: 140 },
    { title: '品类', dataIndex: 'category', width: 90 },
    { title: '色系', dataIndex: 'colorFamily', width: 90 },
    {
      title: '来源',
      dataIndex: 'sourceType',
      width: 100,
      render: (v) => SOURCE_OPTIONS.find(o => o.value === v)?.label ?? v,
    },
    { title: '成本估算', dataIndex: 'costEstimate', width: 90, render: (v) => v ? `¥${v}` : '-' },
    { title: '目标售价', dataIndex: 'targetPrice', width: 90, render: (v) => v ? `¥${v}` : '-' },
    {
      title: 'AI 趋势分',
      dataIndex: 'trendScore',
      width: 100,
      render: (v, r) => v ? (
        <Tooltip title={r.trendScoreReason}>
          <Tag color={v >= 80 ? 'red' : v >= 60 ? 'orange' : 'default'}>{v}分</Tag>
        </Tooltip>
      ) : '-',
    },
    {
      title: '均评/次数',
      width: 100,
      render: (_, r) => r.reviewCount > 0 ? `${r.avgReviewScore?.toFixed(1)}/★ × ${r.reviewCount}` : '-',
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 90,
      render: (v) => <Tag color={STATUS_COLORS[v] ?? 'default'}>{STATUS_LABELS[v] ?? v}</Tag>,
    },
    {
      title: '关联款号',
      dataIndex: 'createdStyleNo',
      width: 110,
      render: (v) => v ? <Tag color="blue">{v}</Tag> : '-',
    },
    {
      title: '操作',
      key: 'actions',
      width: 260,
      fixed: 'right',
      render: (_, r) => (
        <Space size={4} wrap>
          <Button size="small" onClick={() => openReviewDrawer(r)}>评审</Button>
          <Tooltip title="AI 趋势评分">
            <Button
              size="small"
              icon={<RobotOutlined />}
              loading={aiScoring === r.id}
              onClick={() => handleAiScore(r.id)}
            >AI评分</Button>
          </Tooltip>
          {r.status === 'PENDING' && (
            <Button size="small" icon={<CheckOutlined />} type="primary" onClick={() => handleStageAction(r.id, 'approve', '通过')}>通过</Button>
          )}
          {r.status === 'PENDING' && (
            rejectReasonTarget === r.id ? (
              <Space size={4}>
                <Input
                  size="small"
                  placeholder="拒绝理由"
                  value={rejectInput}
                  onChange={e => setRejectInput(e.target.value)}
                  style={{ width: 110 }}
                />
                <Button size="small" type="primary" danger onClick={() => handleReject(r.id)}>确认</Button>
                <Button size="small" onClick={() => setRejectReasonTarget(null)}>取消</Button>
              </Space>
            ) : (
              <Button size="small" icon={<CloseOutlined />} danger onClick={() => setRejectReasonTarget(r.id)}>拒绝</Button>
            )
          )}
          {r.status === 'PENDING' && (
            <Button size="small" icon={<PauseOutlined />} onClick={() => handleStageAction(r.id, 'hold', '待定')}>待定</Button>
          )}
          {r.status === 'APPROVED' && !r.createdStyleNo && (
            <Tooltip title="创建为样衣款式">
              <Button size="small" icon={<ExperimentOutlined />} type="primary" onClick={() => handleCreateStyle(r.id)}>建款</Button>
            </Tooltip>
          )}
          {r.status === 'REJECTED' && (
            <Button size="small" onClick={() => handleStageAction(r.id, 'reset', '重置')}>重置</Button>
          )}
          {r.status === 'PENDING' && (
            <Button size="small" onClick={() => openEdit(r)}>编辑</Button>
          )}
          {(r.status === 'PENDING' || r.status === 'HOLD') && (
            <Popconfirm title="确认删除？" onConfirm={() => candidateDelete(r.id).then(() => { message.success('删除成功'); load(); }).catch(() => message.error('删除失败'))}>
              <Button size="small" danger>删除</Button>
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ];

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2 style={{ margin: 0 }}>候选款评审池 {batchName ? `— ${batchName}` : ''}</h2>
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreate} disabled={!batchId}>新增候选款</Button>
      </div>

      <Table<Candidate>
        columns={columns}
        dataSource={data}
        rowKey="id"
        loading={loading}
        scroll={{ x: 1600 }}
        pagination={{ pageSize: 20, showSizeChanger: true }}
        size="small"
      />

      {/* 新增/编辑候选款 */}
      <Modal
        title={editId ? '编辑候选款' : '新增候选款'}
        open={modalOpen}
        onOk={handleSave}
        onCancel={() => setModalOpen(false)}
        width="40vw"
        destroyOnClose
      >
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item name="styleName" label="款式名称" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="category" label="品类">
            <Select options={CATEGORY_OPTIONS.map(c => ({ label: c, value: c }))} />
          </Form.Item>
          <Form.Item name="colorFamily" label="色系">
            <Input placeholder="如：大地色、蓝白、撞色" />
          </Form.Item>
          <Form.Item name="fabricType" label="面料">
            <Input placeholder="如：纯棉、雪纺、羊毛" />
          </Form.Item>
          <Form.Item name="sourceType" label="来源">
            <Select options={SOURCE_OPTIONS} />
          </Form.Item>
          <Form.Item name="costEstimate" label="成本估算（元）">
            <InputNumber min={0} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="targetPrice" label="目标售价（元）">
            <InputNumber min={0} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="targetQty" label="目标数量（件）">
            <InputNumber min={1} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="remark" label="备注">
            <Input.TextArea rows={2} />
          </Form.Item>
        </Form>
      </Modal>

      {/* 评审抽屉 */}
      <Drawer
        title={`评审 — ${reviewTarget?.styleName ?? ''}`}
        open={reviewDrawerOpen}
        onClose={() => setReviewDrawerOpen(false)}
        width={500}
      >
        {reviewTarget && (
          <Descriptions column={2} size="small" style={{ marginBottom: 16 }}>
            <Descriptions.Item label="候选款号">{reviewTarget.candidateNo}</Descriptions.Item>
            <Descriptions.Item label="品类">{reviewTarget.category}</Descriptions.Item>
            <Descriptions.Item label="成本估算">{reviewTarget.costEstimate ? `¥${reviewTarget.costEstimate}` : '-'}</Descriptions.Item>
            <Descriptions.Item label="目标售价">{reviewTarget.targetPrice ? `¥${reviewTarget.targetPrice}` : '-'}</Descriptions.Item>
          </Descriptions>
        )}

        <Divider>提交我的评审</Divider>
        <Form form={reviewForm} layout="vertical">
          <Form.Item name="score" label="评分（1-5）" rules={[{ required: true }]}>
            <Rate count={5} />
          </Form.Item>
          <Form.Item name="decision" label="意见" rules={[{ required: true }]}>
            <Select
              options={[
                { label: '✅ 推荐通过', value: 'APPROVE' },
                { label: '❌ 建议拒绝', value: 'REJECT' },
                { label: '⏸ 待定', value: 'HOLD' },
              ]}
            />
          </Form.Item>
          <Form.Item name="comment" label="点评">
            <Input.TextArea rows={3} placeholder="可填写款式优缺点、市场潜力等" />
          </Form.Item>
          <Button type="primary" block onClick={submitReview}>提交评审</Button>
        </Form>

        <Divider>历史评审记录</Divider>
        {reviewsLoading ? (
          <Spin />
        ) : reviews.length === 0 ? (
          <div style={{ color: '#999', textAlign: 'center' }}>暂无评审记录</div>
        ) : (
          reviews.map(r => (
            <div key={r.id} style={{ marginBottom: 12, padding: '8px 12px', background: '#fafafa', borderRadius: 6 }}>
              <Space>
                <strong>{r.reviewerName}</strong>
                <Rate disabled value={r.score} count={5} style={{ fontSize: 12 }} />
                <Tag color={r.decision === 'APPROVE' ? 'success' : r.decision === 'REJECT' ? 'error' : 'warning'}>
                  {r.decision === 'APPROVE' ? '推荐' : r.decision === 'REJECT' ? '拒绝' : '待定'}
                </Tag>
                <span style={{ color: '#999', fontSize: 12 }}>{r.reviewTime?.slice(0, 16)}</span>
              </Space>
              {r.comment && <div style={{ marginTop: 4, color: '#555' }}>{r.comment}</div>}
            </div>
          ))
        )}
      </Drawer>
    </div>
  );
}
