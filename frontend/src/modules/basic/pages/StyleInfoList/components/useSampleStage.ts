import { useCallback, useEffect, useMemo, useState } from 'react';
import { StyleInfo } from '@/types/style';
import api from '@/utils/api';
import {
  SmartStage, PatternProductionSnapshot, StyleRecord, SAMPLE_PARENT_STAGES,
  isScrappedStyle, isSampleSnapshotFullyCompleted, getSampleNodeProgress,
  formatStageTimeRange, normalizePatternProductionSnapshot, isScrappedPatternSnapshot,
  clampPercent, formatNodeTime,
} from './styleTableViewUtils';

type MessageInstance = { success: (msg: string) => void; error: (msg: string) => void };

interface UseSampleStageParams {
  selectedStage: { record: StyleInfo; stage: SmartStage } | null;
  message: MessageInstance;
  onRefresh: () => void;
}

export default function useSampleStage({ selectedStage, message, onRefresh }: UseSampleStageParams) {
  const [sampleSnapshot, setSampleSnapshot] = useState<PatternProductionSnapshot | null>(null);
  const [sampleSnapshotLoading, setSampleSnapshotLoading] = useState(false);
  const [sampleActionLoading, setSampleActionLoading] = useState(false);
  const [progressEditorOpen, setProgressEditorOpen] = useState(false);
  const [progressDraft, setProgressDraft] = useState<Record<string, number>>({});

  const selectedStageRecordScrapped = useMemo(
    () => (selectedStage ? isScrappedStyle(selectedStage.record) : false),
    [selectedStage],
  );

  // --- 9 sample useMemos ---

  const isSampleSnapshotCompleted = useMemo(() => {
    if (!sampleSnapshot) return false;
    const status = String(sampleSnapshot.status || '').trim().toUpperCase();
    return isSampleSnapshotFullyCompleted(sampleSnapshot)
      && ['PRODUCTION_COMPLETED', 'COMPLETED'].includes(status);
  }, [sampleSnapshot]);

  const isSampleSnapshotReceived = useMemo(() => {
    if (!sampleSnapshot) return false;
    const status = String(sampleSnapshot.status || '').trim().toUpperCase();
    return ['IN_PROGRESS', 'PRODUCTION_COMPLETED', 'COMPLETED'].includes(status)
      || Boolean(sampleSnapshot.receiver)
      || sampleSnapshot.receiveTime !== '待启动';
  }, [sampleSnapshot]);

  const sampleCompletedTimeLabel = useMemo(() => {
    if (!selectedStage || selectedStage.stage.key !== 'sample') return '待启动';
    if (!isSampleSnapshotCompleted) {
      return selectedStageRecordScrapped || isScrappedPatternSnapshot(sampleSnapshot) ? '已停止' : '待启动';
    }
    if (sampleSnapshot?.completeTime && sampleSnapshot.completeTime !== '待启动') {
      return sampleSnapshot.completeTime;
    }
    const finalCompletedTime = (selectedStage.record as StyleRecord).completedTime;
    if (finalCompletedTime) return formatNodeTime(finalCompletedTime);
    return selectedStageRecordScrapped || isScrappedPatternSnapshot(sampleSnapshot) ? '已停止' : '待启动';
  }, [isSampleSnapshotCompleted, sampleSnapshot, selectedStage, selectedStageRecordScrapped]);

  const sampleReceiveTimeLabel = useMemo(() => {
    if (!selectedStage || selectedStage.stage.key !== 'sample') return '待启动';
    if (sampleSnapshot?.receiveTime && sampleSnapshot.receiveTime !== '待启动') return sampleSnapshot.receiveTime;
    const productionStartTime = (selectedStage.record as StyleRecord).productionStartTime;
    if (sampleSnapshot?.receiver && productionStartTime) return formatNodeTime(productionStartTime);
    return selectedStageRecordScrapped || isScrappedPatternSnapshot(sampleSnapshot) ? '已停止' : '待启动';
  }, [sampleSnapshot, selectedStage, selectedStageRecordScrapped]);

  const sampleCompletedRangeLabel = useMemo(() => {
    if (sampleCompletedTimeLabel === '待启动' || sampleCompletedTimeLabel === '已停止') {
      return sampleCompletedTimeLabel;
    }
    if (sampleReceiveTimeLabel === '待启动' || sampleReceiveTimeLabel === '已停止') {
      return sampleCompletedTimeLabel;
    }
    return formatStageTimeRange(sampleReceiveTimeLabel, sampleCompletedTimeLabel);
  }, [sampleCompletedTimeLabel, sampleReceiveTimeLabel]);

  const sampleReceiverLabel = useMemo(() => {
    if (!sampleSnapshot?.receiver) return '-';
    return sampleSnapshot.receiver;
  }, [sampleSnapshot]);

  const sampleStageProgressItems = useMemo(() => {
    if (!sampleSnapshot) return [];
    const status = String(sampleSnapshot.status || '').trim().toUpperCase();
    const completed = isSampleSnapshotFullyCompleted(sampleSnapshot);
    const received = ['IN_PROGRESS', 'PRODUCTION_COMPLETED', 'COMPLETED'].includes(status)
      || Boolean(sampleSnapshot.receiver)
      || sampleSnapshot.receiveTime !== '待启动';
    return SAMPLE_PARENT_STAGES.map((item) => ({
      key: item.key,
      label: item.label,
      percent: completed
        ? 100
        : item.key === 'procurement'
          ? sampleSnapshot.procurementProgress
          : received
            ? getSampleNodeProgress(sampleSnapshot, item.key)
            : 0,
    }));
  }, [sampleSnapshot]);

  const shouldShowSampleStageProgress = useMemo(() => (
    sampleStageProgressItems.some((item) => item.percent > 0) || isSampleSnapshotReceived || isSampleSnapshotCompleted
  ), [isSampleSnapshotCompleted, isSampleSnapshotReceived, sampleStageProgressItems]);

  const sampleStageSummary = useMemo(() => {
    if (!selectedStage || selectedStage.stage.key !== 'sample') return null;
    if (selectedStageRecordScrapped || isScrappedPatternSnapshot(sampleSnapshot)) {
      return { tag: { color: 'error' as const, text: '已停止' }, helper: '样衣生产已停止', time: sampleCompletedRangeLabel };
    }
    if (isSampleSnapshotCompleted) {
      return { tag: { color: 'success' as const, text: '已完成' }, helper: '样衣生产已完成', time: sampleCompletedRangeLabel };
    }
    if (isSampleSnapshotReceived) {
      return {
        tag: { color: 'processing' as const, text: '进行中' },
        helper: sampleReceiverLabel !== '-' ? `已由 ${sampleReceiverLabel} 领取生产` : '样衣生产进行中',
        time: sampleReceiveTimeLabel,
      };
    }
    return { tag: { color: 'default' as const, text: '未开始' }, helper: '尚未领取样衣生产', time: '待领取' };
  }, [isSampleSnapshotCompleted, isSampleSnapshotReceived, sampleCompletedTimeLabel, sampleCompletedRangeLabel, sampleReceiveTimeLabel, sampleReceiverLabel, sampleSnapshot, selectedStage, selectedStageRecordScrapped]);

  // --- callbacks ---

  const loadSampleSnapshot = useCallback(async (record: StyleInfo) => {
    const response: any = await api.get('/production/pattern/list', {
      params: { page: 1, pageSize: 20, keyword: record.styleNo },
    });
    const records = Array.isArray(response?.data?.records) ? response.data.records : [];
    const matched = records.find((item: Record<string, unknown>) => String(item.styleId || '') === String(record.id || ''))
      || records.find((item: Record<string, unknown>) => String(item.styleNo || '') === String(record.styleNo || ''));
    return matched ? normalizePatternProductionSnapshot(matched) : null;
  }, []);

  const reloadSampleStage = useCallback(async () => {
    if (!selectedStage || selectedStage.stage.key !== 'sample') return;
    setSampleSnapshotLoading(true);
    try {
      const snapshot = await loadSampleSnapshot(selectedStage.record);
      setSampleSnapshot(snapshot);
      await onRefresh();
    } finally {
      setSampleSnapshotLoading(false);
    }
  }, [loadSampleSnapshot, onRefresh, selectedStage]);

  const handleReceiveSample = useCallback(async () => {
    if (!sampleSnapshot?.id) return;
    setSampleActionLoading(true);
    try {
      await api.post(`/production/pattern/${sampleSnapshot.id}/workflow-action`, {}, { params: { action: 'receive' } });
      message.success('样衣已领取');
      await reloadSampleStage();
    } catch (error: unknown) {
      message.error(typeof error === 'object' && error !== null && 'response' in error ? (error as any).response?.data?.message : (error instanceof Error ? error.message : '领取失败'));
    } finally {
      setSampleActionLoading(false);
    }
  }, [message, reloadSampleStage, sampleSnapshot?.id]);

  const handleSaveSampleProgress = useCallback(async () => {
    if (!sampleSnapshot?.id) return;
    setSampleActionLoading(true);
    try {
      await api.post(`/production/pattern/${sampleSnapshot.id}/progress`, {
        procurement: clampPercent(Number(progressDraft.procurement || 0)),
        cutting: clampPercent(Number(progressDraft.cutting || 0)),
        secondary: clampPercent(Number(progressDraft.secondary || 0)),
        sewing: clampPercent(Number(progressDraft.sewing || 0)),
        tail: clampPercent(Number(progressDraft.tail || 0)),
        warehousing: clampPercent(Number(progressDraft.warehousing || 0)),
      });
      message.success('样衣进度已更新');
      setProgressEditorOpen(false);
      await reloadSampleStage();
    } catch (error: unknown) {
      message.error(typeof error === 'object' && error !== null && 'response' in error ? (error as any).response?.data?.message : (error instanceof Error ? error.message : '进度更新失败'));
    } finally {
      setSampleActionLoading(false);
    }
  }, [message, progressDraft, reloadSampleStage, sampleSnapshot?.id]);

  // --- effects ---

  useEffect(() => {
    let active = true;
    if (!selectedStage || selectedStage.stage.key !== 'sample') {
      setSampleSnapshot(null);
      setSampleSnapshotLoading(false);
      setProgressEditorOpen(false);
      return () => { active = false; };
    }
    setSampleSnapshotLoading(true);
    setSampleSnapshot(null);
    void loadSampleSnapshot(selectedStage.record).then((snapshot) => {
      if (active) setSampleSnapshot(snapshot);
    }).catch(() => {
      if (active) setSampleSnapshot(null);
    }).finally(() => {
      if (active) setSampleSnapshotLoading(false);
    });
    return () => { active = false; };
  }, [loadSampleSnapshot, selectedStage]);

  useEffect(() => {
    if (!progressEditorOpen || !sampleSnapshot) return;
    setProgressDraft({
      procurement: sampleSnapshot.procurementProgress,
      cutting: clampPercent(Number(sampleSnapshot.progressNodes.cutting || 0)),
      secondary: clampPercent(Number(sampleSnapshot.progressNodes.secondary || 0)),
      sewing: clampPercent(Number(sampleSnapshot.progressNodes.sewing || 0)),
      tail: clampPercent(Number(sampleSnapshot.progressNodes.tail || 0)),
      warehousing: clampPercent(Number(sampleSnapshot.progressNodes.warehousing || 0)),
    });
  }, [progressEditorOpen, sampleSnapshot]);

  return {
    sampleSnapshot,
    sampleSnapshotLoading,
    sampleActionLoading,
    progressEditorOpen,
    setProgressEditorOpen,
    progressDraft,
    setProgressDraft,
    isSampleSnapshotCompleted,
    isSampleSnapshotReceived,
    sampleCompletedTimeLabel,
    sampleReceiveTimeLabel,
    sampleCompletedRangeLabel,
    sampleReceiverLabel,
    sampleStageProgressItems,
    shouldShowSampleStageProgress,
    sampleStageSummary,
    reloadSampleStage,
    handleReceiveSample,
    handleSaveSampleProgress,
  };
}
