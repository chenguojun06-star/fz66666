import { useState, useEffect, useCallback } from 'react';
import { App, Form } from 'antd';
import { DEFAULT_PAGE_SIZE } from '@/utils/pageSizeStore';
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
import type { Candidate, CandidateReviewItem, CandidateListResponse } from './selectionCenterUtils';
import { CANDIDATE_FETCH_BATCH_SIZE, canDeleteCandidate } from './selectionCenterUtils';

export function useSelectionCenter() {
  const { message, modal } = App.useApp();
  const [loading, setLoading] = useState(false);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [aiLoadingIds, setAiLoadingIds] = useState<Set<number>>(new Set());
  const [addOpen, setAddOpen] = useState(false);
  const [addForm] = Form.useForm();
  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewTarget, setReviewTarget] = useState<Candidate | null>(null);
  const [reviewSubmitting, setReviewSubmitting] = useState(false);
  const [reviewForm] = Form.useForm();
  const [reviewMap, setReviewMap] = useState<Record<number, CandidateReviewItem | null>>({});
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);

  const fetchList = useCallback(async () => {
    setLoading(true);
    try {
      const allRecords: Candidate[] = [];
      let page = 1;
      let total = 0;
      do {
        const res = await candidateList({ page, pageSize: CANDIDATE_FETCH_BATCH_SIZE }) as CandidateListResponse | Candidate[];
        const data = Array.isArray(res) ? res : (res.records ?? res.list ?? []);
        const records = Array.isArray(data) ? data : [];
        total = Array.isArray(res) ? records.length : Number(res?.total || 0);
        allRecords.push(...records);
        if (!records.length || Array.isArray(res)) break;
        page += 1;
      } while (!total || allRecords.length < total);
      setCandidates(allRecords);
    } catch {
      message.error('加载失败');
    } finally {
      setLoading(false);
    }
  }, [message]);

  useEffect(() => { fetchList(); }, [fetchList]);

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
    reviewForm.setFieldsValue({ decision: 'APPROVE', score: record.trendScore ?? undefined, comment: '' });
    setReviewOpen(true);
  };

  const submitReview = async () => {
    if (!reviewTarget) return;
    try {
      const values = await reviewForm.validateFields();
      setReviewSubmitting(true);
      const decision = values.decision === 'APPROVE' ? 'approve' : 'reject';
      await candidateReview({ candidateId: reviewTarget.id, score: values.score, decision: values.decision, comment: values.comment });
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

  const handleAddSave = async () => {
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

  const categories = [...new Set(candidates.map(c => c.category).filter(Boolean))];
  const filtered = candidates.filter(c => {
    if (search && !c.styleName?.includes(search) && !c.candidateNo?.includes(search)) return false;
    if (statusFilter && c.status !== statusFilter) return false;
    if (categoryFilter && c.category !== categoryFilter) return false;
    return true;
  });
  const pagedCandidates = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  useEffect(() => { setCurrentPage(1); }, [search, statusFilter, categoryFilter]);

  return {
    loading, candidates, search, setSearch, statusFilter, setStatusFilter,
    categoryFilter, setCategoryFilter, aiLoadingIds, addOpen, setAddOpen,
    addForm, reviewOpen, setReviewOpen, reviewTarget, reviewSubmitting,
    reviewForm, reviewMap, currentPage, setCurrentPage, pageSize, setPageSize,
    fetchList, handleAiScore, openReviewModal, submitReview,
    handleCreateStyle, handleAddSave, ensureLatestReview,
    handleDeleteCandidate, canDeleteCandidate, categories, filtered, pagedCandidates,
  };
}
