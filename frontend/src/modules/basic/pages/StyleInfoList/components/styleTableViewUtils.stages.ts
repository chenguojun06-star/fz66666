import dayjs from 'dayjs';
import { StyleInfo } from '@/types/style';
import { SmartStage, StageBuilder, StyleRecord } from './styleTableViewUtils.types';
import {
  applyScrappedStageState,
  buildStageDetails,
  clampPercent,
  formatNodeTime,
  formatStageTimeRange,
  getLatestTimeLabel,
  getReviewStatusLabel,
  isPassedReviewStatus,
  isRiskReviewStatus,
} from './styleTableViewUtils.helpers';

// ── Stage Builders ─────────────────────────────────────

export const buildDevelopmentStage: StageBuilder = (record) => {
  const checkpoints = [
    { label: 'BOM', done: Boolean(record.bomCompletedTime), time: record.bomCompletedTime },
    { label: '尺寸', done: Boolean(record.sizeCompletedTime), time: record.sizeCompletedTime },
    { label: '工序', done: Boolean(record.processCompletedTime), time: record.processCompletedTime },
    { label: '制单', done: Boolean(record.productionCompletedTime), time: record.productionCompletedTime },
  ];
  const doneCount = checkpoints.filter((item) => item.done).length;
  const pendingLabels = checkpoints.filter((item) => !item.done).map((item) => item.label);

  return {
    key: 'development',
    label: '开发资料',
    helper: doneCount === checkpoints.length ? '资料齐套' : `待补 ${pendingLabels.slice(0, 2).join(' / ') || '资料'}`,
    startTimeLabel: '',
    timeLabel: getLatestTimeLabel(checkpoints.map((item) => item.time)),
    status: doneCount === checkpoints.length ? 'done' : doneCount > 0 ? 'active' : 'waiting',
    progress: doneCount === checkpoints.length ? 100 : Math.max(clampPercent((doneCount / checkpoints.length) * 100), doneCount > 0 ? 24 : 0),
    actionKey: 'detail',
    actionLabel: '打开详情',
    details: buildStageDetails(
      `已完成 ${doneCount}/${checkpoints.length}`,
      pendingLabels.length ? `待补节点：${pendingLabels.join('、')}` : '开发资料已锁定',
      record.deliveryDate ? `交板时间：${dayjs(record.deliveryDate).format('YYYY-MM-DD')}` : '交板时间待补'
    ),
  };
};

export const buildPatternStage: StageBuilder = (record) => {
  const progressNode = String(record.progressNode || '').trim();
  const patternStatus = String(record.patternStatus || '').trim().toUpperCase();
  const patternDone = patternStatus === 'COMPLETED' || Boolean(record.patternCompletedTime);
  const patternStarted = patternDone || Boolean(record.patternStartTime) || /纸样/.test(progressNode);

  return {
    key: 'pattern',
    label: '纸样开发',
    helper: patternDone ? '纸样已完成' : record.patternAssignee ? `领取人 ${String(record.patternAssignee)}` : '等待处理',
    startTimeLabel: formatNodeTime(record.patternStartTime),
    timeLabel: patternDone
      ? formatStageTimeRange(record.patternStartTime, record.patternCompletedTime)
      : formatNodeTime(record.patternStartTime),
    status: patternDone ? 'done' : patternStarted ? 'active' : 'waiting',
    progress: patternDone ? 100 : patternStarted ? 58 : 0,
    actionKey: 'pattern',
    actionLabel: '进入纸样',
    details: buildStageDetails(
      record.patternAssignee ? `领取人：${String(record.patternAssignee)}` : '领取人待分配',
      patternDone ? '纸样文件已完成' : patternStarted ? '纸样开发推进中' : '尚未启动纸样开发'
    ),
  };
};

export const buildSizePriceStage: StageBuilder = (record) => {
  const hasStage = Boolean(record.sizePriceStartTime || record.sizePriceCompletedTime || record.sizePriceAssignee);
  if (!hasStage) return null;

  const done = Boolean(record.sizePriceCompletedTime);
  const started = done || Boolean(record.sizePriceStartTime);

  return {
    key: 'sizePrice',
    label: '码数单价',
    helper: done ? '单价已锁定' : record.sizePriceAssignee ? `领取人 ${String(record.sizePriceAssignee)}` : '等待维护',
    startTimeLabel: formatNodeTime(record.sizePriceStartTime),
    timeLabel: done
      ? formatStageTimeRange(record.sizePriceStartTime, record.sizePriceCompletedTime)
      : formatNodeTime(record.sizePriceStartTime),
    status: done ? 'done' : started ? 'active' : 'waiting',
    progress: done ? 100 : started ? 56 : 0,
    actionKey: 'sizePrice',
    actionLabel: '进入单价',
    details: buildStageDetails(
      record.sizePriceAssignee ? `领取人：${String(record.sizePriceAssignee)}` : '领取人待分配',
      done ? '码数单价已确认' : '当前仍可调整码数单价'
    ),
  };
};

export const buildSecondaryStage: StageBuilder = (record) => {
  const hasStage = Boolean(record.secondaryStartTime || record.secondaryCompletedTime || record.secondaryAssignee || /二次工艺/.test(String(record.progressNode || '')));
  if (!hasStage) return null;

  const done = Boolean(record.secondaryCompletedTime);
  const started = done || Boolean(record.secondaryStartTime) || /二次工艺/.test(String(record.progressNode || ''));

  return {
    key: 'secondary',
    label: '二次工艺',
    helper: done ? '工艺已锁定' : record.secondaryAssignee ? `领取人 ${String(record.secondaryAssignee)}` : '待安排',
    startTimeLabel: formatNodeTime(record.secondaryStartTime),
    timeLabel: done
      ? formatStageTimeRange(record.secondaryStartTime, record.secondaryCompletedTime)
      : formatNodeTime(record.secondaryStartTime),
    status: done ? 'done' : started ? 'active' : 'waiting',
    progress: done ? 100 : started ? 52 : 0,
    actionKey: 'secondary',
    actionLabel: '进入工艺',
    details: buildStageDetails(
      record.secondaryAssignee ? `领取人：${String(record.secondaryAssignee)}` : '领取人待分配',
      done ? '二次工艺资料已完成' : '当前正在推进二次工艺'
    ),
  };
};

export const buildSampleStage: StageBuilder = (record) => {
  const sampleStatus = String(record.sampleStatus || '').trim().toUpperCase();
  const sampleProgress = clampPercent(Number(record.sampleProgress || 0));
  const started = ['IN_PROGRESS', 'PRODUCTION_COMPLETED', 'COMPLETED'].includes(sampleStatus);
  // 样衣生产 done 的唯一判定：sampleStatus=COMPLETED 或 sampleCompletedTime 存在
  // PRODUCTION_COMPLETED 仅代表样板制作完成，样衣开发流程仍在进行（还有审核/入库等环节）
  const done = sampleStatus === 'COMPLETED' || Boolean(record.sampleCompletedTime);
  // 样板制作完成（PRODUCTION_COMPLETED）单独标记，用于 helper 文案区分
  const productionDone = sampleStatus === 'PRODUCTION_COMPLETED';

  return {
    key: 'sample',
    label: '样衣生产',
    helper: done
      ? '样衣完成'
      : productionDone
        ? '样板制作完成，待审核入库'
        : sampleProgress > 0
          ? `进度 ${sampleProgress}%`
          : started
            ? '已领取生产'
            : '等待纸样',
    startTimeLabel: formatNodeTime(record.sampleStartTime),
    timeLabel: done
      ? (record.sampleCompletedTime
          ? formatNodeTime(record.sampleCompletedTime)
          : '已完成')
      : started
        ? formatNodeTime(record.sampleStartTime)
        : '',
    status: done ? 'done' : started ? 'active' : 'waiting',
    progress: done ? 100 : (started && sampleProgress > 0 ? sampleProgress : started ? 36 : 0),
    actionKey: 'detail',
    actionLabel: '查看详情',
    details: buildStageDetails(
      done ? '样衣已完成' : productionDone ? '样板制作完成，待审核入库' : started ? '样衣制作中' : '领取时间待更新',
      done && record.sampleCompletedTime ? `完成时间：${dayjs(record.sampleCompletedTime as string | number | Date).format('YYYY-MM-DD')}` : false
    ),
  };
};

export const buildConfirmStage: StageBuilder = (record) => {
  const progressNode = String(record.progressNode || '').trim();
  const reviewStatus = String(record.sampleReviewStatus || '').trim().toUpperCase();
  const latestPatternStatus = String(record.latestPatternStatus || '').trim().toUpperCase();
  const sampleStatus = String(record.sampleStatus || '').trim().toUpperCase();
  const reviewPassed = isPassedReviewStatus(reviewStatus);
  const inboundCompleted = latestPatternStatus === 'COMPLETED' || sampleStatus === 'COMPLETED';
  const done = reviewPassed && inboundCompleted;
  const risk = isRiskReviewStatus(reviewStatus) || progressNode === '开发样报废';
  const started = done || risk || reviewStatus === 'PENDING' || reviewPassed || latestPatternStatus === 'PRODUCTION_COMPLETED';

  return {
    key: 'confirm',
    label: '审核 / 入库',
    helper: done
      ? '已入库闭环'
      : reviewPassed
        ? '审核通过，待入库'
      : reviewStatus === 'PENDING'
        ? '待审核'
        : reviewStatus === 'REWORK'
          ? '需返修'
          : reviewStatus === 'REJECT'
            ? '未通过'
            : started
              ? '等待结果'
              : '未开始',
    startTimeLabel: formatNodeTime(record.sampleReviewTime),
    timeLabel: done
      ? formatStageTimeRange(record.sampleReviewTime, record.completedTime)
      : formatNodeTime(record.sampleReviewTime || record.sampleCompletedTime),
    status: done ? 'done' : risk ? 'risk' : started ? 'active' : 'waiting',
    progress: done ? 100 : risk ? 66 : reviewPassed ? 90 : started ? 72 : 0,
    actionKey: 'detail',
    actionLabel: '查看详情',
    details: buildStageDetails(
      record.sampleReviewer ? `审核人：${String(record.sampleReviewer)}` : false,
      record.sampleReviewComment ? `审核意见：${String(record.sampleReviewComment)}` : false,
      reviewStatus ? `审核状态：${getReviewStatusLabel(reviewStatus)}` : '审核状态待更新',
      reviewPassed ? (inboundCompleted ? '入库状态：已入库' : '入库状态：待入库') : false
    ),
  };
};

// ── Stage Builder Pipeline ─────────────────────────────

export const STAGE_BUILDERS: StageBuilder[] = [
  buildDevelopmentStage,
  buildPatternStage,
  buildSizePriceStage,
  buildSecondaryStage,
  buildSampleStage,
  buildConfirmStage,
];

export const buildSmartStages = (record: StyleInfo) => STAGE_BUILDERS
  .map((builder) => {
    const stage = builder(record as StyleRecord);
    return stage ? applyScrappedStageState(record as StyleRecord, stage) : null;
  })
  .filter(Boolean) as SmartStage[];

export const resolveStageActionPath = (record: StyleInfo, stage: SmartStage) => {
  if (stage.actionKey === 'pattern') return `/style-info/${record.id}?tab=7&section=files`;
  if (stage.actionKey === 'sizePrice') return `/style-info/${record.id}?tab=10`;
  if (stage.actionKey === 'secondary') return `/style-info/${record.id}?tab=9`;
  return `/style-info/${record.id}`;
};
