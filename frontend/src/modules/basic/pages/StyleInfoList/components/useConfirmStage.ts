import { useCallback, useMemo, useState } from 'react';
import { Form } from 'antd';
import dayjs from 'dayjs';
import { StyleInfo } from '@/types/style';
import api from '@/utils/api';
import {
  SmartStage, StyleRecord,
  isScrappedStyle, isPassedReviewStatus, getReviewStatusLabel,
  formatNodeTime, isRiskReviewStatus, formatStageTimeRange, buildSmartStages,
} from './styleTableViewUtils';

type MessageInstance = { success: (msg: string) => void; error: (msg: string) => void };

interface UseConfirmStageParams {
  selectedStage: { record: StyleInfo; stage: SmartStage } | null;
  setSelectedStage: React.Dispatch<React.SetStateAction<{ record: StyleInfo; stage: SmartStage } | null>>;
  message: MessageInstance;
  onRefresh: () => void;
}

export default function useConfirmStage({ selectedStage, setSelectedStage, message, onRefresh }: UseConfirmStageParams) {
  const [reviewModalOpen, setReviewModalOpen] = useState(false);
  const [reviewSaving, setReviewSaving] = useState(false);
  const [reviewForm] = Form.useForm();

  const selectedStageRecordScrapped = useMemo(
    () => (selectedStage ? isScrappedStyle(selectedStage.record) : false),
    [selectedStage],
  );

  // --- 8 confirm useMemos ---

  const confirmReviewStatus = useMemo(() => (
    selectedStage?.stage.key === 'confirm'
      ? String((selectedStage.record as StyleRecord).sampleReviewStatus || '').trim().toUpperCase()
      : ''
  ), [selectedStage]);

  const isConfirmReviewPassed = useMemo(() => isPassedReviewStatus(confirmReviewStatus), [confirmReviewStatus]);

  const isConfirmInboundCompleted = useMemo(() => (
    selectedStage?.stage.key === 'confirm'
      ? String((selectedStage.record as StyleRecord).latestPatternStatus || '').trim().toUpperCase() === 'COMPLETED'
      : false
  ), [selectedStage]);

  const confirmReviewStatusLabel = useMemo(() => getReviewStatusLabel(confirmReviewStatus), [confirmReviewStatus]);

  const confirmReviewerLabel = useMemo(() => {
    if (!selectedStage || selectedStage.stage.key !== 'confirm') return '-';
    return String((selectedStage.record as StyleRecord).sampleReviewer || '').trim() || '-';
  }, [selectedStage]);

  const confirmReviewTimeLabel = useMemo(() => {
    if (!selectedStage || selectedStage.stage.key !== 'confirm') return '待启动';
    const reviewTime = (selectedStage.record as StyleRecord).sampleReviewTime;
    if (reviewTime) return formatNodeTime(reviewTime);
    return selectedStageRecordScrapped ? '已停止' : '待启动';
  }, [selectedStage, selectedStageRecordScrapped]);

  const confirmInboundTimeLabel = useMemo(() => {
    if (!selectedStage || selectedStage.stage.key !== 'confirm') return '待启动';
    const completedTime = (selectedStage.record as StyleRecord).completedTime;
    if (completedTime) return formatNodeTime(completedTime);
    return selectedStageRecordScrapped ? '已停止' : '待启动';
  }, [selectedStage, selectedStageRecordScrapped]);

  const confirmStageSummary = useMemo(() => {
    if (!selectedStage || selectedStage.stage.key !== 'confirm') return null;
    if (selectedStageRecordScrapped) {
      return { tag: { color: 'error' as const, text: '已停止' }, helper: '审核 / 入库已停止', time: confirmInboundTimeLabel };
    }
    if (isConfirmReviewPassed && isConfirmInboundCompleted) {
      return {
        tag: { color: 'success' as const, text: '已完成' }, helper: '审核通过，样衣已入库',
        time: formatStageTimeRange((selectedStage.record as StyleRecord).sampleReviewTime, (selectedStage.record as StyleRecord).completedTime),
      };
    }
    if (isRiskReviewStatus(confirmReviewStatus)) {
      return {
        tag: { color: 'error' as const, text: '异常' },
        helper: confirmReviewStatus === 'REWORK' ? '审核需返修' : '审核未通过',
        time: confirmReviewTimeLabel,
      };
    }
    if (isConfirmReviewPassed) {
      return { tag: { color: 'processing' as const, text: '待入库' }, helper: '审核已通过，等待入库', time: confirmReviewTimeLabel };
    }
    if (confirmReviewStatus === 'PENDING') {
      return { tag: { color: 'processing' as const, text: '待审核' }, helper: '样衣已完成，等待审核', time: confirmReviewTimeLabel };
    }
    return { tag: { color: 'default' as const, text: '未开始' }, helper: '尚未进入审核 / 入库', time: '待审核' };
  }, [confirmInboundTimeLabel, confirmReviewStatus, confirmReviewTimeLabel, isConfirmInboundCompleted, isConfirmReviewPassed, selectedStage, selectedStageRecordScrapped]);

  // --- callbacks ---

  const handleOpenReviewModal = useCallback(() => {
    if (!selectedStage) return;
    reviewForm.setFieldsValue({
      reviewStatus: selectedStage.record.sampleReviewStatus || undefined,
      reviewComment: selectedStage.record.sampleReviewComment || '',
    });
    setReviewModalOpen(true);
  }, [reviewForm, selectedStage]);

  const handleSaveReview = useCallback(async () => {
    if (!selectedStage?.record.id) return;
    try {
      const values = await reviewForm.validateFields();
      setReviewSaving(true);
      await api.post(`/style/info/${selectedStage.record.id}/sample-review`, {
        reviewStatus: values.reviewStatus,
        reviewComment: values.reviewComment || null,
      });
      const now = dayjs().format('YYYY-MM-DD HH:mm:ss');
      const nextRecord = {
        ...selectedStage.record,
        sampleReviewStatus: values.reviewStatus,
        sampleReviewComment: values.reviewComment || null,
        sampleReviewTime: now,
      } as StyleInfo;
      const nextStage = buildSmartStages(nextRecord).find((item) => item.key === selectedStage.stage.key) || selectedStage.stage;
      setSelectedStage({ record: nextRecord, stage: nextStage });
      setReviewModalOpen(false);
      message.success('样衣审核结论已保存');
      onRefresh();
    } catch (error: any) {
      if (error?.errorFields) return;
      message.error(error?.response?.data?.message || error?.message || '审核保存失败');
    } finally {
      setReviewSaving(false);
    }
  }, [message, onRefresh, reviewForm, selectedStage, setSelectedStage]);

  return {
    reviewModalOpen,
    setReviewModalOpen,
    reviewSaving,
    reviewForm,
    confirmReviewStatus,
    isConfirmReviewPassed,
    isConfirmInboundCompleted,
    confirmReviewStatusLabel,
    confirmReviewerLabel,
    confirmReviewTimeLabel,
    confirmInboundTimeLabel,
    confirmStageSummary,
    handleOpenReviewModal,
    handleSaveReview,
  };
}
