import { useMemo, type Dispatch, type SetStateAction } from 'react';
import { Modal } from 'antd';
import { NavigateFunction } from 'react-router-dom';
import { StyleInfo } from '@/types/style';
import api, { withQuery } from '@/utils/api';
import {
  SmartStage, StageQuickAction, StyleRecord,
  isScrappedStyle, isScrappedPatternSnapshot,
  resolveStageTag, buildStageInsight, resolveStageActionPath, isRiskReviewStatus,
} from './styleTableViewUtils';
import type useSampleStage from './useSampleStage';
import type useConfirmStage from './useConfirmStage';

type MessageInstance = { success: (msg: string) => void; error: (msg: string) => void };

interface UseStagePanelParams {
  selectedStage: { record: StyleInfo; stage: SmartStage } | null;
  setSelectedStage: Dispatch<SetStateAction<{ record: StyleInfo; stage: SmartStage } | null>>;
  navigate: NavigateFunction;
  message: MessageInstance;
  sampleHook: ReturnType<typeof useSampleStage>;
  confirmHook: ReturnType<typeof useConfirmStage>;
}

export default function useStagePanel({
  selectedStage, setSelectedStage, navigate, message,
  sampleHook, confirmHook,
}: UseStagePanelParams) {
  const selectedStageTag = selectedStage ? resolveStageTag(selectedStage.stage) : null;

  const selectedStageInsight = selectedStage ? buildStageInsight(selectedStage.stage, sampleHook.sampleSnapshot) : '';

  const selectedStageRecordScrapped = useMemo(
    () => (selectedStage ? isScrappedStyle(selectedStage.record) : false),
    [selectedStage],
  );

  const selectedStageInsightText = useMemo(() => {
    if (!selectedStage) return selectedStageInsight;
    if (selectedStage.stage.key === 'sample') {
      if (selectedStageRecordScrapped || isScrappedPatternSnapshot(sampleHook.sampleSnapshot)) {
        return '开发样已报废，样衣生产已停止。';
      }
      if (sampleHook.isSampleSnapshotCompleted) {
        return '样衣生产已经完成，可以继续做审核与入库确认。';
      }
      if (sampleHook.isSampleSnapshotReceived) {
        return sampleHook.sampleReceiverLabel !== '-'
          ? `样衣已由 ${sampleHook.sampleReceiverLabel} 领取，当前按实际节点进度推进。`
          : '样衣已经领取，当前按实际节点进度推进。';
      }
      return '当前还没有领取样衣生产，节点进度会在领取并推进后更新。';
    }
    if (selectedStage.stage.key === 'confirm') {
      if (selectedStageRecordScrapped) {
        return '开发样已报废，审核 / 入库流程已停止。';
      }
      if (confirmHook.isConfirmReviewPassed && confirmHook.isConfirmInboundCompleted) {
        return '样衣已审核通过并完成入库，确认链路已经闭环。';
      }
      if (isRiskReviewStatus(confirmHook.confirmReviewStatus)) {
        return confirmHook.confirmReviewStatus === 'REWORK'
          ? '样衣审核要求返修，返修完成后再继续审核 / 入库。'
          : '样衣审核未通过，需要先处理异常后再继续。';
      }
      if (confirmHook.isConfirmReviewPassed) {
        return '样衣审核已通过，当前只差入库动作即可闭环。';
      }
      if (confirmHook.confirmReviewStatus === 'PENDING') {
        return '样衣已经完成，当前等待审核结论。';
      }
      const confirmSampleStatus = String(selectedStage.record.sampleStatus || '').trim().toUpperCase();
      const isSampleProductionDone = Boolean(selectedStage.record.productionCompletedTime)
        || Boolean(selectedStage.record.sampleCompletedTime)
        || ['PRODUCTION_COMPLETED', 'COMPLETED'].includes(confirmSampleStatus);
      if (isSampleProductionDone) {
        return '样衣生产已完成，可以记录审核结论。';
      }
      return '当前还没有进入审核 / 入库，请先完成样衣生产。';
    }
    return selectedStageInsight;
  }, [confirmHook, sampleHook, selectedStage, selectedStageInsight, selectedStageRecordScrapped]);

  // --- buildStageQuickActions ---

  const selectedStageActions = useMemo(() => {
    if (!selectedStage) return [] as StageQuickAction[];

    const actions: StageQuickAction[] = [];
    const scrapped = isScrappedStyle(selectedStage.record) || isScrappedPatternSnapshot(sampleHook.sampleSnapshot);
    const sampleStageCompleted = selectedStage.stage.key === 'sample'
      ? sampleHook.isSampleSnapshotCompleted || sampleHook.sampleCompletedTimeLabel !== '待启动'
      : selectedStage.stage.status === 'done';

    if (!scrapped && selectedStage.stage.actionKey && selectedStage.stage.actionKey !== 'detail') {
      actions.push({
        key: 'stage-entry', label: selectedStage.stage.actionLabel || '进入环节', type: 'primary',
        onClick: () => { navigate(resolveStageActionPath(selectedStage.record, selectedStage.stage)); setSelectedStage(null); },
      });
    }

    if (!scrapped && selectedStage.stage.key === 'sample') {
      if (sampleHook.sampleSnapshot?.status === 'PENDING' || !sampleHook.sampleSnapshot?.receiveTime || sampleHook.sampleSnapshot.receiveTime === '待启动') {
        actions.push({
          key: 'receive-sample', label: '领取生产', type: 'primary',
          onClick: () => { void sampleHook.handleReceiveSample(); },
        });
      } else if (sampleHook.sampleSnapshot?.receiveTime && sampleHook.sampleSnapshot.receiveTime !== '待启动' && !sampleStageCompleted && !selectedStage.record.sampleCompletedTime) {
        actions.push({
          key: 'complete-sample', label: '标记完成', type: 'primary',
          onClick: () => {
            Modal.confirm({
              title: '确认完成样衣生产？', content: '完成后样衣进入审核阶段', okText: '确认完成', cancelText: '取消',
              onOk: async () => {
                try {
                  await api.post(`/production/pattern/${sampleHook.sampleSnapshot!.id}/workflow-action`, {}, { params: { action: 'complete' } });
                  message.success('样衣生产已完成');
                  await sampleHook.reloadSampleStage();
                } catch (error: unknown) {
                  message.error(typeof error === 'object' && error !== null && 'response' in error ? (error as any).response?.data?.message : (error instanceof Error ? error.message : '完成失败'));
                }
              },
            });
          },
        });
      }

      if (sampleStageCompleted || selectedStage.record.sampleCompletedTime) {
        actions.push({
          key: 'review',
          label: selectedStage.record.sampleReviewStatus ? '修改审核结论' : '记录审核结论',
          type: selectedStage.record.sampleReviewStatus ? 'default' : 'primary',
          disabled: selectedStage.stage.status === 'done',
          onClick: confirmHook.handleOpenReviewModal,
        });
      }
    }

    if (!scrapped && selectedStage.stage.key === 'confirm') {
      const confirmSampleStatus = String((selectedStage.record as StyleRecord).sampleStatus || '').trim().toUpperCase();
      const isSampleProductionDone = Boolean(selectedStage.record.productionCompletedTime)
        || Boolean(selectedStage.record.sampleCompletedTime)
        || ['PRODUCTION_COMPLETED', 'COMPLETED'].includes(confirmSampleStatus);
      if (isSampleProductionDone) {
        actions.push({
          key: 'review',
          label: selectedStage.record.sampleReviewStatus ? '修改审核结论' : '记录审核结论',
          type: selectedStage.record.sampleReviewStatus ? 'default' : 'primary',
          disabled: selectedStage.stage.status === 'done',
          onClick: confirmHook.handleOpenReviewModal,
        });
      }

      if (String(selectedStage.record.sampleReviewStatus || '').trim().toUpperCase() === 'PASS'
          && selectedStage.stage.status !== 'done'
          && !(selectedStage.record as StyleRecord).completedTime) {
        // completedTime 有值说明已完成入库，避免重复入库
        actions.push({
          key: 'inventory', label: '样衣入库', type: 'primary',
          onClick: () => {
            navigate(withQuery('/warehouse/sample', {
              styleId: (selectedStage.record as StyleRecord).id,
              styleNo: (selectedStage.record as StyleRecord).styleNo,
              action: 'inbound', styleName: selectedStage.record.styleName,
              color: selectedStage.record.color, size: selectedStage.record.size,
              quantity: selectedStage.record.sampleQuantity, sampleType: 'development',
            }));
            setSelectedStage(null);
          },
        });
      }
    }

    const hasPushedOrder = Boolean((selectedStage.record as any).pushedToOrder);
    if (!scrapped && selectedStage.stage.key === 'confirm' && String(selectedStage.record.sampleReviewStatus || '').trim().toUpperCase() === 'PASS') {
      actions.push(hasPushedOrder
        ? {
            key: 'order-view', label: '生产订单',
            onClick: () => {
              navigate(`/production?keyword=${encodeURIComponent((selectedStage.record as any).orderNo || (selectedStage.record as StyleRecord).styleNo || '')}`);
              setSelectedStage(null);
            },
          }
        : {
            key: 'order-push', label: '资料推送', type: 'default',
            onClick: () => {
              navigate(`/style-info/${selectedStage.record.id}`);
              setSelectedStage(null);
            },
          });
    }

    return actions.filter((action, index, list) => list.findIndex((item) => item.key === action.key) === index);
  }, [confirmHook, message, navigate, sampleHook, selectedStage, setSelectedStage]);

  return {
    selectedStageTag,
    selectedStageInsight,
    selectedStageRecordScrapped,
    selectedStageInsightText,
    selectedStageActions,
  };
}
