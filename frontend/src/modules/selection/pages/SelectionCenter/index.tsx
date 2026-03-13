import React, { useState, useEffect, useCallback } from 'react';
import {
  Row, Col, Tag, Button, Input, Select, Space, Spin, Empty,
  Popover, Typography, Divider, Progress, Modal, Form, App,
  InputNumber, Tooltip, Tabs, Pagination,
} from 'antd';
import Layout from '@/components/Layout';
import {
  PlusOutlined, DeleteOutlined, SendOutlined,
  ThunderboltOutlined, FireOutlined, CheckCircleOutlined,
} from '@ant-design/icons';
import {
  candidateDelete,
  candidateList,
  candidateAiScore,
  candidateCreateStyle,
  candidateGetReviews,
  candidateReview,
  candidateSave,
  candidateStageAction,
} from '@/services/selection/selectionApi';
import MarketHotItems from './MarketHotItems';
import StandardSearchBar from '@/components/common/StandardSearchBar';
import DecisionInsightCard, { SMART_CARD_CONTENT_WIDTH, SMART_CARD_OVERLAY_WIDTH, type DecisionInsight } from '@/components/common/DecisionInsightCard';

const { Text, Paragraph } = Typography;

interface Candidate {
  id: number;
  candidateNo: string;
  styleName: string;
  category: string;
  colorFamily: string;
  sourceType: string;
  referenceImages?: string;
  costEstimate?: number;
  targetPrice?: number;
  targetQty?: number;
  status: string;
  trendScore?: number;
  trendScoreReason?: string;
  aiEnabled?: boolean;
  scoringMode?: string;
  profitEstimate?: number;
  seasonTags?: string;
  avgReviewScore?: number;
  reviewCount?: number;
  createdStyleId?: number;
  createdStyleNo?: string;
  rejectReason?: string;
  createTime?: string;
  updateTime?: string;
  remark?: string;
}

const getScoreMeta = (record: Candidate) => {
  if (record.scoringMode === 'AI_MODEL') {
    return { label: '模型分析', color: 'purple' as const, title: '当前分数来自已启用的 AI 模型分析' };
  }
  if (record.scoringMode === 'RULE_GOOGLE_TRENDS') {
    return { label: '规则评分', color: 'geekblue' as const, title: '当前分数来自 Google Trends 热度 + 本地规则加权，不是大模型结论' };
  }
  if (record.scoringMode === 'RULE_LOCAL_FALLBACK') {
    return { label: '规则兜底', color: 'orange' as const, title: '当前分数来自本地规则兜底，不应当作 AI 结论' };
  }
  if (record.aiEnabled === true || record.trendScoreReason?.startsWith('AI模型分析：')) {
    return { label: '模型分析', color: 'purple' as const, title: '当前分数来自已启用的 AI 模型分析' };
  }
  if (record.trendScoreReason?.startsWith('规则评分：')) {
    return { label: '规则评分', color: 'geekblue' as const, title: '当前分数来自规则计算，不是大模型结论' };
  }
  return { label: '待分析', color: 'default' as const, title: '当前还没有评分来源信息' };
};

const trimReason = (reason?: string) => {
  if (!reason) return undefined;
  const normalized = reason.replace(/^AI模型分析：|^规则评分：/u, '').trim();
  return normalized.length > 78 ? `${normalized.slice(0, 78)}…` : normalized;
};

const choose = (seed: number, variants: string[]) => {
  if (!variants.length) return '';
  return variants[Math.abs(seed) % variants.length];
};

const buildCandidateInsight = (record: Candidate): DecisionInsight | null => {
  if (record.trendScore == null) return null;
  const scoreMeta = getScoreMeta(record);
  const score = record.trendScore;
  const seed = score + Math.round((record.profitEstimate || 0) * 10) + (record.targetQty || 0);
  const level = score >= 70 ? 'success' : score >= 50 ? 'warning' : 'danger';
  const title = score >= 70 ? '可推进下版' : score >= 50 ? '建议补证后再审' : '暂不建议推进';
  const summary = score >= 70
    ? choose(seed, [
      '这款在热度和利润空间上都比较扎实，可以进入下版验证。',
      '当前信号偏正向，适合从观察阶段进入打版阶段。',
      '这款的推进价值比较明确，可以继续往样衣验证走。',
    ])
    : score >= 50
    ? choose(seed, [
      '方向是对的，但证据还不够硬，先补渠道和价格带对比更稳。',
      '这款不差，但还没到“马上下版”的确定性，建议先补证。',
      '目前属于可关注区间，先把关键证据补齐再推进。',
    ])
    : choose(seed, [
      '当前趋势契合度偏弱，直接下版会占用样衣资源。',
      '这款更适合先观察，不建议现在就投入下版。',
      '眼下推进性价比不高，建议先作为参考样本保留。',
    ]);
  const evidence = [
    `趋势评分 ${score} 分（${scoreMeta.label}）`,
    record.profitEstimate != null ? `预估利润率 ${record.profitEstimate}%` : null,
    record.targetQty != null ? `预计下单 ${record.targetQty} 件` : null,
    record.avgReviewScore != null ? `评审均分 ${record.avgReviewScore} / 5` : null,
  ].filter(Boolean) as string[];
  return {
    level,
    title,
    summary,
    painPoint: score >= 70
      ? choose(seed + 3, [
        '真正的风险不在热度，而在后续样衣验证是否能跟上。',
        '关键不在“要不要做”，而在“能不能快速验证”。',
        '这款的主要挑战在执行速度，不在方向本身。',
      ])
      : score >= 50
      ? choose(seed + 5, [
        '方向不差，但证据强度还不够，容易变成拍脑袋推进。',
        '现在缺的是关键佐证，而不是想法。',
        '中位分的主要问题是确定性不足。',
      ])
      : choose(seed + 7, [
        '趋势、利润或需求预期都不够强，推进后容易占资源。',
        '当前信号偏弱，贸然推进会增加无效试错。',
        '这款暂时不具备优先推进条件。',
      ]),
    source: scoreMeta.label,
    confidence: score >= 70 ? '把握较高' : '建议复核',
    evidence,
    note: trimReason(record.trendScoreReason),
    execute: score >= 70
      ? choose(seed + 11, ['继续走审核并下版验证。', '按流程推进到打版环节。', '可进入下版与审款联动流程。'])
      : score >= 50
      ? choose(seed + 13, ['先补市场对比，再决定是否推进。', '先补证据再做推进决策。', '建议先核实渠道与价格带后再审。'])
      : choose(seed + 17, ['先保留观察，不要直接下版。', '先进入观察池，暂不投样衣资源。', '建议先观望，等待更强信号。']),
    actionLabel: score >= 70 ? '建议继续走审核与下版' : score >= 50 ? '建议补充市场对比后再决策' : '建议先保留观察',
    labels: {
      summary: '现状',
      painPoint: '关注点',
      execute: '下一步',
      evidence: '数据',
      note: '补充',
    },
  };
};

interface CandidateReviewItem {
  id: number;
  reviewerName?: string;
  score?: number;
  decision?: string;
  comment?: string;
  reviewTime?: string;
}

interface CandidateListResponse {
  records?: Candidate[];
  list?: Candidate[];
}

const STATUS_MAP: Record<string, { color: string; label: string }> = {
  PENDING:  { color: 'orange', label: '待评审' },
  APPROVED: { color: 'green',  label: '已通过' },
  REJECTED: { color: 'red',    label: '已拒绝' },
  HOLD:     { color: 'blue',   label: '待定'   },
};

const SOURCE_MAP: Record<string, string> = {
  INTERNAL: '自主开发',
  SUPPLIER: '供应商',
  CLIENT:   '客户定制',
  EXTERNAL: '外部市场',
};

/** 悬停时显示的 AI 分析浮层 */
function AiHoverCard({
  record,
  aiLoading,
  latestReview,
}: {
  record: Candidate;
  aiLoading: boolean;
  latestReview?: CandidateReviewItem | null;
}) {
  const hasScore = record.trendScore != null;
  const scoreMeta = getScoreMeta(record);
  const decisionInsight = buildCandidateInsight(record);
  return (
    <div style={{ width: SMART_CARD_CONTENT_WIDTH, boxSizing: 'border-box' }}>
      <div style={{ marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text strong style={{ fontSize: 14 }}>{record.styleName || '未命名'}</Text>
        <Tag color={STATUS_MAP[record.status]?.color} style={{ margin: 0 }}>
          {STATUS_MAP[record.status]?.label}
        </Tag>
      </div>

      {latestReview?.comment && (
        <div style={{
          marginBottom: 10,
          padding: '8px 10px',
          background: latestReview.decision === 'APPROVE' ? '#f6ffed' : '#fff2f0',
          border: `1px solid ${latestReview.decision === 'APPROVE' ? '#b7eb8f' : '#ffccc7'}`,
          borderRadius: 6,
          fontSize: 12,
        }}>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>
            审核意见
            {latestReview.reviewerName ? ` · ${latestReview.reviewerName}` : ''}
          </div>
          <div style={{ color: '#555', lineHeight: 1.6 }}>{latestReview.comment}</div>
        </div>
      )}

      {hasScore ? (
        <>
          <div style={{ marginBottom: 4 }}>
            <Space size={4}>
              <ThunderboltOutlined style={{ color: '#722ed1' }} />
              <Text type="secondary" style={{ fontSize: 12 }}>趋势评分</Text>
              <Tooltip title={scoreMeta.title}>
                <Tag color={scoreMeta.color} style={{ margin: 0, fontSize: 10 }}>{scoreMeta.label}</Tag>
              </Tooltip>
              <Text strong style={{
                color: record.trendScore! >= 75 ? '#52c41a' :
                       record.trendScore! >= 50 ? '#fa8c16' : '#ff4d4f',
              }}>
                {record.trendScore} 分
              </Text>
            </Space>
          </div>
          <Progress
            percent={record.trendScore}
            strokeColor={
              record.trendScore! >= 75 ? '#52c41a' :
              record.trendScore! >= 50 ? '#fa8c16' : '#ff4d4f'
            }
            size="small"
            style={{ marginBottom: 8 }}
          />
          {record.trendScoreReason && (
            <Paragraph style={{ fontSize: 11, color: '#555', marginBottom: 8, lineHeight: 1.5 }}>
              {record.trendScoreReason.slice(0, 150)}
              {record.trendScoreReason.length > 150 ? '…' : ''}
            </Paragraph>
          )}
        </>
      ) : (
        <div style={{ textAlign: 'center', padding: '12px 0 8px', color: '#888', fontSize: 12 }}>
          {aiLoading ? '正在生成 AI 分析...' : '悬停后自动分析趋势、价值与决策建议'}
        </div>
      )}

      <Divider style={{ margin: '8px 0' }} />

      <Row gutter={[8, 6]}>
        {record.costEstimate != null && (
          <Col span={12}>
            <Text type="secondary" style={{ fontSize: 11 }}>成本估算</Text>
            <div style={{ fontSize: 13, fontWeight: 600 }}>¥{record.costEstimate}</div>
          </Col>
        )}
        {record.targetPrice != null && (
          <Col span={12}>
            <Text type="secondary" style={{ fontSize: 11 }}>目标报价</Text>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#52c41a' }}>¥{record.targetPrice}</div>
          </Col>
        )}
        {record.profitEstimate != null && (
          <Col span={12}>
            <Text type="secondary" style={{ fontSize: 11 }}>预估利润率</Text>
            <div style={{
              fontSize: 13, fontWeight: 600,
              color: record.profitEstimate >= 30 ? '#52c41a' : '#fa8c16',
            }}>
              {record.profitEstimate}%
            </div>
          </Col>
        )}
        {record.targetQty != null && (
          <Col span={12}>
            <Text type="secondary" style={{ fontSize: 11 }}>预计下单</Text>
            <div style={{ fontSize: 13, fontWeight: 600 }}>{record.targetQty} 件</div>
          </Col>
        )}
      </Row>

      {record.seasonTags && (() => {
        try {
          const tags: string[] = JSON.parse(record.seasonTags);
          return tags.length > 0 ? (
            <div style={{ marginTop: 8 }}>
              {tags.map(t => <Tag key={t} style={{ fontSize: 11, marginBottom: 2 }}>{t}</Tag>)}
            </div>
          ) : null;
        } catch { return null; }
      })()}

      {hasScore && decisionInsight && (
        <div style={{ marginTop: 10 }}>
          <DecisionInsightCard compact insight={decisionInsight} />
        </div>
      )}
    </div>
  );
}

export default function SelectionCenter() {
  const { message, modal } = App.useApp();
  const [loading, setLoading] = useState(false);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [aiLoadingIds, setAiLoadingIds] = useState<Set<number>>(new Set());
  const [addOpen, setAddOpen] = useState(false);
  const [addForm] = Form.useForm();
  const [activeTab, setActiveTab] = useState<string>('market');
  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewTarget, setReviewTarget] = useState<Candidate | null>(null);
  const [reviewSubmitting, setReviewSubmitting] = useState(false);
  const [reviewForm] = Form.useForm();
  const [reviewMap, setReviewMap] = useState<Record<number, CandidateReviewItem | null>>({});
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(12);

  const fetchList = useCallback(async () => {
    setLoading(true);
    try {
      const res = await candidateList({ page: 1, pageSize: 100 }) as CandidateListResponse | Candidate[];
      const data = Array.isArray(res) ? res : (res.records ?? res.list ?? []);
      setCandidates(Array.isArray(data) ? data : []);
    } catch {
      message.error('加载失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchList(); }, [fetchList]);

  useEffect(() => {
    if (activeTab === 'mine') {
      fetchList();
    }
  }, [activeTab, fetchList]);

  const handleAiScore = async (id: number) => {
    setAiLoadingIds(prev => new Set(prev).add(id));
    try {
      const res = await candidateAiScore(id) as Partial<Candidate> | null;
      setCandidates(prev => prev.map(c => c.id === id ? { ...c, ...(res ?? {}) } : c));
      message.success('AI 评分完成');
    } catch {
      message.error('AI 评分失败');
    } finally {
      setAiLoadingIds(prev => { const s = new Set(prev); s.delete(id); return s; });
    }
  };

  const openReviewModal = (record: Candidate) => {
    setReviewTarget(record);
    reviewForm.setFieldsValue({
      decision: 'APPROVE',
      score: record.trendScore ?? undefined,
      comment: '',
    });
    setReviewOpen(true);
  };

  const submitReview = async () => {
    if (!reviewTarget) return;
    try {
      const values = await reviewForm.validateFields();
      setReviewSubmitting(true);
      const decision = values.decision === 'APPROVE' ? 'approve' : 'reject';
      await candidateReview({
        candidateId: reviewTarget.id,
        score: values.score,
        decision: values.decision,
        comment: values.comment,
      });
      await candidateStageAction(reviewTarget.id, decision, values.comment);
      message.success(values.decision === 'APPROVE' ? '审核通过，可下版到样衣' : '已记录审核不通过');
      setReviewOpen(false);
      setReviewTarget(null);
      reviewForm.resetFields();
      fetchList();
    } catch (e) {
      if ((e as { errorFields?: unknown })?.errorFields) return;
      message.error('提交审核失败');
    } finally {
      setReviewSubmitting(false);
    }
  };

  const handleCreateStyle = (id: number, styleName: string) => {
    modal.confirm({
      width: '30vw',
      title: '下版到样衣',
      content: `确认将「${styleName}」生成正式款式，进入样衣开发流程？`,
      okText: '确认下版',
      onOk: async () => {
        try {
          await candidateCreateStyle(id);
          message.success('已生成款式，请在「样衣管理」中查看');
          fetchList();
        } catch (e: unknown) {
          message.error((e as { message?: string })?.message ?? '下版失败');
        }
      },
    });
  };

  const ensureLatestReview = useCallback(async (candidateId: number) => {
    if (candidateId in reviewMap) return;
    try {
      const reviews = await candidateGetReviews(candidateId) as CandidateReviewItem[];
      setReviewMap(prev => ({ ...prev, [candidateId]: Array.isArray(reviews) && reviews.length > 0 ? reviews[0] : null }));
    } catch {
      setReviewMap(prev => ({ ...prev, [candidateId]: null }));
    }
  }, [reviewMap]);

  const canDeleteCandidate = useCallback((record: Candidate) => {
    if (record.status === 'REJECTED') return true;
    if (record.status !== 'APPROVED') return false;
    const baseTime = record.updateTime || record.createTime;
    if (!baseTime) return false;
    const diff = Date.now() - new Date(baseTime).getTime();
    return diff >= 10 * 24 * 60 * 60 * 1000;
  }, []);

  const handleDeleteCandidate = (record: Candidate) => {
    modal.confirm({
      width: '30vw',
      title: '删除候选款',
      content: `确认删除「${record.styleName}」？删除后不可恢复。`,
      okButtonProps: { danger: true, type: 'default' },
      onOk: async () => {
        try {
          await candidateDelete(record.id);
          message.success('已删除候选款');
          fetchList();
        } catch (e: unknown) {
          message.error((e as { message?: string })?.message ?? '删除失败');
        }
      },
    });
  };

  const getFirstImage = (images?: string): string | null => {
    if (!images) return null;
    try {
      const arr = JSON.parse(images);
      return Array.isArray(arr) && arr.length > 0 ? arr[0] : null;
    } catch { return images || null; }
  };

  const categories = [...new Set(candidates.map(c => c.category).filter(Boolean))];

  const filtered = candidates.filter(c => {
    if (search && !c.styleName?.includes(search) && !c.candidateNo?.includes(search)) return false;
    if (statusFilter && c.status !== statusFilter) return false;
    if (categoryFilter && c.category !== categoryFilter) return false;
    return true;
  });

  const pagedCandidates = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  useEffect(() => {
    setCurrentPage(1);
  }, [search, statusFilter, categoryFilter]);

  return (
    <Layout>
    <div style={{ padding: '16px 20px' }}>
      <Tabs
        activeKey={activeTab}
        onChange={setActiveTab}
        style={{ marginBottom: 16 }}
        items={[
          { key: 'market', label: <span><FireOutlined style={{ color: '#ff4d4f' }} /> 市场热品发现</span> },
          { key: 'mine',   label: <span><CheckCircleOutlined /> 我的选品库</span> },
        ]}
      />

      {/* 市场热品 Tab */}
      {activeTab === 'market' && (
        <MarketHotItems onAdded={() => {
          fetchList();
          setActiveTab('mine');
        }} />
      )}

      {/* 我的选品库 Tab */}
      {activeTab === 'mine' && (<>
      {/* 顶部工具栏 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <Space wrap>
          <StandardSearchBar
            searchValue={search}
            onSearchChange={setSearch}
            searchPlaceholder="搜索款式名 / 候选款号"
            showDate={false}
            showStatus={false}
          />
          <Select
            placeholder="全部状态"
            value={statusFilter || undefined}
            onChange={v => setStatusFilter(v ?? '')}
            allowClear
            style={{ width: 120 }}
            options={[
              { value: 'PENDING',  label: '待评审' },
              { value: 'APPROVED', label: '已通过' },
              { value: 'HOLD',     label: '待定'   },
              { value: 'REJECTED', label: '已拒绝' },
            ]}
          />
          {categories.length > 0 && (
            <Select
              placeholder="全部品类"
              value={categoryFilter || undefined}
              onChange={v => setCategoryFilter(v ?? '')}
              allowClear
              style={{ width: 120 }}
              options={categories.map(c => ({ value: c, label: c }))}
            />
          )}
                          <Text type="secondary" style={{ fontSize: 12 }}>
            共 {filtered.length} 款 · 鼠标悬停查看评分来源、分析依据与审核意见
          </Text>
        </Space>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setAddOpen(true)}>
          新增候选款
        </Button>
      </div>

      {/* 卡片墙 */}
      <Spin spinning={loading}>
        {filtered.length === 0 && !loading ? (
          <Empty
            description="暂无候选款，点击「新增候选款」开始选品"
            style={{ marginTop: 80 }}
          />
        ) : (
          <div>
            <Row gutter={[16, 16]}>
              {pagedCandidates.map(item => {
                const img = getFirstImage(item.referenceImages);
                const { color, label } = STATUS_MAP[item.status] ?? { color: 'default', label: item.status };
                const aiLoading = aiLoadingIds.has(item.id);
                const latestReview = reviewMap[item.id] ?? null;
                const scoreMeta = getScoreMeta(item);
                return (
                  <Col key={item.id} xs={24} sm={12} md={8} lg={6} xl={4}>
                    <Popover
                      content={
                        <AiHoverCard
                          record={item}
                          aiLoading={aiLoading}
                          latestReview={latestReview}
                        />
                      }
                      title={null}
                      trigger="hover"
                      placement="right"
                      mouseEnterDelay={0.4}
                      overlayStyle={{ width: SMART_CARD_OVERLAY_WIDTH, maxWidth: SMART_CARD_OVERLAY_WIDTH }}
                      onOpenChange={(open) => {
                        if (open) {
                          ensureLatestReview(item.id);
                        }
                        if (open && item.trendScore == null && !aiLoading) {
                          handleAiScore(item.id);
                        }
                      }}
                    >
                      <div
                        style={{
                          border: '1px solid #e8e8e8',
                          borderRadius: 8,
                          overflow: 'hidden',
                          background: '#fff',
                          cursor: 'pointer',
                          transition: 'box-shadow 0.2s',
                          boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
                        }}
                        onMouseEnter={e => (e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,0.14)')}
                        onMouseLeave={e => (e.currentTarget.style.boxShadow = '0 1px 4px rgba(0,0,0,0.06)')}
                      >
                        {/* 图片区 */}
                        <div style={{ position: 'relative', height: 260, background: '#f7f7f7', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 8 }}>
                          {img ? (
                            <img
                              src={img}
                              alt={item.styleName}
                              style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                            />
                          ) : (
                            <div style={{
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              height: '100%', flexDirection: 'column', color: '#ccc',
                            }}>
                              <FireOutlined style={{ fontSize: 36 }} />
                              <div style={{ fontSize: 11, marginTop: 6 }}>暂无参考图</div>
                            </div>
                          )}
                          {/* 状态角标 */}
                          <div style={{ position: 'absolute', top: 8, right: 8 }}>
                            <Tag color={color} style={{ margin: 0, fontSize: 11 }}>{label}</Tag>
                          </div>
                          {/* AI 分角标 */}
                          {item.trendScore != null && (
                            <div style={{
                              position: 'absolute', top: 8, left: 8,
                              background: 'rgba(114,46,209,0.88)', borderRadius: 4,
                              padding: '2px 8px', color: '#fff', fontSize: 12, fontWeight: 700,
                            }}>
                              <ThunderboltOutlined /> {item.trendScore}
                            </div>
                          )}
                        </div>

                        {/* 信息区 */}
                        <div style={{ padding: '10px 12px' }}>
                          <div style={{
                            fontWeight: 600, fontSize: 13, marginBottom: 2,
                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                          }}>
                            {item.styleName || '未命名'}
                          </div>
                          <div style={{ fontSize: 11, color: '#999', marginBottom: 10 }}>
                            {[item.category, item.colorFamily, SOURCE_MAP[item.sourceType] ?? item.sourceType]
                              .filter(Boolean).join(' · ')}
                          </div>
                          <div style={{ fontSize: 11, color: '#777', marginBottom: 8, minHeight: 18 }}>
                            {item.reviewCount ? `已评审 ${item.reviewCount} 次` : '待审核'}
                            {item.avgReviewScore != null ? ` · 平均分 ${item.avgReviewScore}` : ''}
                          </div>
                          <div style={{ marginBottom: 8, minHeight: 22 }}>
                            {item.status === 'APPROVED' && <Tag color="green" style={{ margin: 0 }}>通过</Tag>}
                            {item.status === 'REJECTED' && <Tag color="red" style={{ margin: 0 }}>未通过</Tag>}
                            {item.status === 'HOLD' && <Tag color="blue" style={{ margin: 0 }}>待定</Tag>}
                            {item.status === 'PENDING' && <Tag color="orange" style={{ margin: 0 }}>待评审</Tag>}
                            {item.trendScore != null && <Tag color={scoreMeta.color} style={{ marginLeft: 6, fontSize: 11 }}>{scoreMeta.label}</Tag>}
                          </div>
                          <div style={{ fontSize: 11, color: '#666', marginBottom: 10, minHeight: 34, lineHeight: 1.5 }}>
                            {latestReview?.comment || item.rejectReason || item.trendScoreReason || '悬停查看 AI 分析、趋势与价值建议'}
                          </div>

                          {/* 操作按钮 */}
                          <Space size={6} style={{ width: '100%' }}>
                            {(item.status === 'PENDING' || item.status === 'HOLD') && (
                              <Tooltip title="填写审核结果：通过或不通过">
                                <Button
                                  size="small"
                                  onClick={() => openReviewModal(item)}
                                  style={{ borderColor: '#1677ff', color: '#1677ff', fontSize: 11 }}
                                >
                                  审核
                                </Button>
                              </Tooltip>
                            )}
                            {item.status === 'APPROVED' && !item.createdStyleId && (
                              <Tooltip title="生成正式款式，进入样衣开发流程">
                                <Button
                                  size="small"
                                  type="primary"
                                  icon={<SendOutlined />}
                                  onClick={() => handleCreateStyle(item.id, item.styleName)}
                                  style={{ fontSize: 11 }}
                                >
                                  下版到样衣
                                </Button>
                              </Tooltip>
                            )}
                            {item.createdStyleId && (
                              <Tag color="green" style={{ fontSize: 11, margin: 0 }}>
                                ✓ 已下版 {item.createdStyleNo}
                              </Tag>
                            )}
                            {canDeleteCandidate(item) && (
                              <Tooltip title={item.status === 'APPROVED' ? '审核通过满 10 天后可手动删除候选款' : '审核不通过可直接删除'}>
                                <Button
                                  size="small"
                                  danger
                                  icon={<DeleteOutlined />}
                                  onClick={() => handleDeleteCandidate(item)}
                                  style={{ fontSize: 11 }}
                                >
                                  删除
                                </Button>
                              </Tooltip>
                            )}
                          </Space>
                        </div>
                      </div>
                    </Popover>
                  </Col>
                );
              })}
            </Row>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 18 }}>
              <Pagination
                current={currentPage}
                pageSize={pageSize}
                total={filtered.length}
                showSizeChanger
                pageSizeOptions={['12', '18', '24', '36']}
                onChange={(page, size) => {
                  setCurrentPage(page);
                  setPageSize(size);
                }}
                showTotal={(total) => `共 ${total} 款`}
              />
            </div>
          </div>
        )}
      </Spin>

      {/* 新增候选款弹窗 */}
      <Modal
        title="新增候选款"
        open={addOpen}
        onCancel={() => { setAddOpen(false); addForm.resetFields(); }}
        onOk={async () => {
          try {
            const values = await addForm.validateFields();
            await candidateSave(values);
            message.success('已添加');
            setAddOpen(false);
            addForm.resetFields();
            fetchList();
          } catch (e) {
            if ((e as { errorFields?: unknown })?.errorFields) return;
            message.error('添加失败');
          }
        }}
        width="40vw"
        okText="确认添加"
      >
        <Form form={addForm} layout="vertical" style={{ marginTop: 8 }}>
          <Form.Item name="styleName" label="款式名称" rules={[{ required: true, message: '请填写款式名称' }]}>
            <Input placeholder="如：春季碎花连衣裙" />
          </Form.Item>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="category" label="品类">
                <Input placeholder="如：连衣裙" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="colorFamily" label="主色系">
                <Input placeholder="如：蓝色系" />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="sourceType" label="来源" initialValue="INTERNAL">
                <Select
                  options={[
                    { value: 'INTERNAL', label: '自主开发' },
                    { value: 'SUPPLIER', label: '供应商' },
                    { value: 'CLIENT',   label: '客户定制' },
                  ]}
                />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="targetQty" label="预计下单量">
                <InputNumber min={1} style={{ width: '100%' }} placeholder="件" />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="costEstimate" label="成本估算 (¥)">
                <InputNumber min={0} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="targetPrice" label="目标报价 (¥)">
                <InputNumber min={0} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="remark" label="备注">
            <Input.TextArea rows={2} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={reviewTarget ? `审核候选款：${reviewTarget.styleName}` : '审核候选款'}
        open={reviewOpen}
        onCancel={() => {
          setReviewOpen(false);
          setReviewTarget(null);
          reviewForm.resetFields();
        }}
        onOk={submitReview}
        confirmLoading={reviewSubmitting}
        okText="提交审核"
        width="40vw"
      >
        <Form form={reviewForm} layout="vertical" style={{ marginTop: 12 }}>
          <Form.Item name="decision" label="审核结果" rules={[{ required: true, message: '请选择审核结果' }]}>
            <Select
              options={[
                { value: 'APPROVE', label: '通过' },
                { value: 'REJECT', label: '不通过' },
              ]}
            />
          </Form.Item>
          <Form.Item name="score" label="评审分数">
            <InputNumber min={0} max={100} style={{ width: '100%' }} placeholder="可选，0-100" />
          </Form.Item>
          <Form.Item name="comment" label="审核意见" rules={[{ required: true, message: '请填写审核意见' }]}>
            <Input.TextArea rows={4} placeholder="填写通过原因、不通过原因或后续建议" />
          </Form.Item>
        </Form>
      </Modal>
      </>)}
    </div>
    </Layout>
  );
}
