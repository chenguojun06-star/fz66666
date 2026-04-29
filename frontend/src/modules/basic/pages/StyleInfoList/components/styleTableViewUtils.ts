import dayjs from 'dayjs';
import { StyleInfo } from '@/types/style';
import { getStyleCardColorText, getStyleCardQuantityText, getStyleCardSizeText } from '@/utils/cardSizeQuantity';

// ── Types ──────────────────────────────────────────────

export type StageStatus = 'done' | 'active' | 'waiting' | 'risk' | 'scrapped';
export type DeliveryTone = 'normal' | 'warning' | 'danger' | 'success' | 'scrapped';
export type StageActionKey = 'detail' | 'pattern' | 'sizePrice' | 'secondary';

export type StyleRecord = StyleInfo & Record<string, unknown>;

export interface SmartStage {
  key: string;
  label: string;
  helper: string;
  startTimeLabel: string;
  timeLabel: string;
  status: StageStatus;
  progress: number;
  details: string[];
  actionKey?: StageActionKey;
  actionLabel?: string;
}

export type StageBuilder = (record: StyleRecord) => SmartStage | null;

export interface PatternProductionSnapshot {
  id: string;
  status: string;
  receiver: string;
  releaseTime: string;
  receiveTime: string;
  completeTime: string;
  updateTime: string;
  reviewStatus: string;
  reviewTime: string;
  procurementProgress: number;
  progressNodes: Record<string, number>;
}

export interface StageQuickAction {
  key: string;
  label: string;
  type?: 'primary' | 'default' | 'link' | 'text' | 'dashed';
  danger?: boolean;
  disabled?: boolean;
  onClick: () => void;
}

// ── Constants ──────────────────────────────────────────

export const REVIEW_STATUS_OPTIONS = [
  { label: '审核通过', value: 'PASS' },
  { label: '需返修', value: 'REWORK' },
  { label: '审核不通过', value: 'REJECT' },
];

export const CATEGORY_MAP: Record<string, string> = {
  WOMAN: '女装',
  WOMEN: '女装',
  MAN: '男装',
  MEN: '男装',
  KID: '童装',
  KIDS: '童装',
  WCMAN: '女童装',
  UNISEX: '男女同款',
};

export const SEASON_MAP: Record<string, string> = {
  SPRING: '春季',
  SUMMER: '夏季',
  AUTUMN: '秋季',
  WINTER: '冬季',
  SPRING_SUMMER: '春夏',
  AUTUMN_WINTER: '秋冬',
};

export const STAGE_MIN_SLOT_WIDTH = 128;

export const SAMPLE_PARENT_STAGES = [
  { key: 'procurement', label: '采购' },
  { key: 'cutting', label: '裁剪' },
  { key: 'secondary', label: '二次工艺' },
  { key: 'sewing', label: '车缝' },
  { key: 'tail', label: '尾部' },
  { key: 'warehousing', label: '入库' },
];
export const SAMPLE_PROGRESS_NODE_ALIASES: Record<string, string[]> = {
  procurement: ['procurement', '采购'],
  cutting: ['cutting', '裁剪', '下板'],
  secondary: ['secondary', '二次工艺'],
  sewing: ['sewing', '车缝', '缝制'],
  tail: ['tail', '尾部', '后整'],
  warehousing: ['warehousing', '入库'],
};

// ── Utility Functions ──────────────────────────────────

export const clampPercent = (value: number) => Math.max(0, Math.min(100, Math.round(value)));

export const resolveDisplayColor = (record: StyleRecord) => {
  return getStyleCardColorText(record) || '';
};

export const resolveDisplaySize = (record: StyleRecord) => {
  return getStyleCardSizeText(record) || '';
};

export const resolveDisplayQuantity = (record: StyleRecord) => {
  return getStyleCardQuantityText(record) || '';
};

export const formatNodeTime = (value?: unknown) => {
  if (!value) return '待启动';
  const instance = dayjs(value as string | number | Date | null | undefined);
  if (instance.isValid()) {
    return instance.format('MM-DD');
  }
  return String(value);
};

export const getLatestTimeLabel = (values: unknown[]) => {
  const valid = values
    .map((item) => dayjs(item as string | number | Date | null | undefined))
    .filter((item) => item.isValid())
    .sort((a, b) => b.valueOf() - a.valueOf());

  if (!valid.length) return '待启动';
  return valid[0].format('MM-DD');
};

export const getStyleCompletedTime = (record: StyleRecord) => {
  const finalCompletedTime = dayjs(record.completedTime as string | number | Date | null | undefined);
  return finalCompletedTime.isValid() ? finalCompletedTime : null;
};

export const getStyleLifecycleCompletedTime = (record: StyleRecord) => {
  const candidates = [
    record.completedTime,
    record.sampleReviewTime,
    record.sampleCompletedTime,
    record.productionCompletedTime,
    record.secondaryCompletedTime,
    record.sizePriceCompletedTime,
    record.patternCompletedTime,
    record.processCompletedTime,
    record.bomCompletedTime,
  ]
    .map((value) => dayjs(value as string | number | Date | null | undefined))
    .filter((value) => value.isValid())
    .sort((a, b) => b.valueOf() - a.valueOf());
  return candidates[0] || null;
};

export const isMaintainedAfterCompletion = (record: StyleRecord, completed: boolean) => {
  const maintenanceRemark = String(record.maintenanceRemark || '').trim();
  const maintenanceTime = dayjs(record.maintenanceTime as string | number | Date | null | undefined);
  if (!maintenanceRemark || !maintenanceTime.isValid()) {
    return false;
  }

  const hasCompletedEvidence = completed
    || isPassedReviewStatus(record.sampleReviewStatus)
    || Boolean(record.sampleReviewTime)
    || Boolean(record.completedTime);
  if (!hasCompletedEvidence) {
    return false;
  }

  const lifecycleCompletedTime = getStyleLifecycleCompletedTime(record);
  if (!lifecycleCompletedTime) {
    return false;
  }

  return maintenanceTime.isAfter(lifecycleCompletedTime);
};

export const formatStageTimeRange = (startTime: unknown, endTime: unknown) => {
  const start = formatNodeTime(startTime);
  const end = formatNodeTime(endTime);
  if (start !== '待启动' && end !== '待启动') {
    const startInstance = dayjs(startTime as string | number | Date | null | undefined);
    const endInstance = dayjs(endTime as string | number | Date | null | undefined);
    if (startInstance.isValid() && endInstance.isValid() && startInstance.isSame(endInstance, 'day')) {
      return start;
    }
    return `${start} → ${end}`;
  }
  return end !== '待启动' ? end : start;
};

export const getDeliveryMeta = (record: StyleRecord, completed = false): { tone: DeliveryTone; label: string } => {
  const sampleStatus = String((record as any)?.sampleStatus || '').trim().toUpperCase();
  if (sampleStatus === 'SCRAPPED' || isScrappedStyle(record as any)) {
    return { tone: 'scrapped', label: '已报废' };
  }
  if (sampleStatus === 'CLOSED') {
    return { tone: 'scrapped', label: '已关单' };
  }
  if (completed) {
    const completedTime = getStyleCompletedTime(record);
    const createdTime = record.createTime ? dayjs(record.createTime) : null;
    const createdLabel = createdTime?.isValid() ? createdTime.format('MM-DD') : '';
    const completedLabel = completedTime?.isValid() ? completedTime.format('MM-DD') : '';
    const rangeLabel = createdLabel && completedLabel
      ? `${createdLabel} → ${completedLabel} 已完成`
      : completedLabel
        ? `${completedLabel} 已完成`
        : '已完成';
    return {
      tone: 'success',
      label: rangeLabel,
    };
  }

  const deliveryDate = record.deliveryDate;
  if (!deliveryDate) {
    return { tone: 'normal', label: '待补交期' };
  }

  const diffDays = dayjs(deliveryDate).startOf('day').diff(dayjs().startOf('day'), 'day');
  if (diffDays < 0) {
    return { tone: 'danger', label: `延期 ${Math.abs(diffDays)} 天` };
  }
  if (diffDays <= 3) {
    return { tone: 'warning', label: `${diffDays} 天内交板` };
  }
  return { tone: 'normal', label: `${diffDays} 天后交板` };
};

export const buildStageDetails = (...values: Array<string | null | undefined | false>) =>
  values.filter(Boolean) as string[];

export const isPassedReviewStatus = (status?: unknown) => ['PASS', 'APPROVED'].includes(String(status || '').trim().toUpperCase());

export const isRiskReviewStatus = (status?: unknown) => ['REJECT', 'REJECTED', 'REWORK'].includes(String(status || '').trim().toUpperCase());

export const getReviewStatusLabel = (status?: unknown) => {
  const normalized = String(status || '').trim().toUpperCase();
  if (normalized === 'PASS' || normalized === 'APPROVED') return '审核通过';
  if (normalized === 'PENDING') return '待审核';
  if (normalized === 'REWORK') return '需返修';
  if (normalized === 'REJECT' || normalized === 'REJECTED') return '审核不通过';
  return '未开始';
};

export const getProgressNodeColor = (node: string) => {
  if (/开发样报废|样衣报废|已报废/.test(node)) return 'default';
  if (/报废|驳回|不通过|异常|失败/.test(node)) return 'error';
  if (/返修|紧急/.test(node)) return 'warning';
  if (/完成|通过/.test(node)) return 'success';
  if (/中|待审|确认/.test(node)) return 'processing';
  return 'default';
};

export const isScrappedStyle = (record?: Partial<StyleInfo> | null) => {
  if (!record) return false;
  return String(record.status || '').trim().toUpperCase() === 'SCRAPPED'
    || String((record as Record<string, unknown>).progressNode || '').trim() === '开发样报废';
};

export const isScrappedPatternSnapshot = (snapshot?: PatternProductionSnapshot | null) => (
  String(snapshot?.status || '').trim().toUpperCase() === 'SCRAPPED'
);

export const resolveStageTag = (stage: SmartStage) => {
  if (stage.status === 'done') return { color: 'success' as const, text: '已完成' };
  if (stage.status === 'active') return { color: 'processing' as const, text: '进行中' };
  if (stage.status === 'scrapped') return { color: 'default' as const, text: '已停止' };
  if (stage.status === 'risk') {
    return { color: 'error' as const, text: /报废|停止/.test(stage.helper) ? '已停止' : '风险中' };
  }
  return { color: 'default' as const, text: '未开始' };
};

export const normalizePatternProductionSnapshot = (item: Record<string, unknown>): PatternProductionSnapshot => {
  const rawProgressNodes = item.progressNodes;
  let progressNodes: Record<string, number> = {};

  if (typeof rawProgressNodes === 'string' && rawProgressNodes.trim()) {
    try {
      progressNodes = JSON.parse(rawProgressNodes) as Record<string, number>;
    } catch {
      progressNodes = {};
    }
  } else if (rawProgressNodes && typeof rawProgressNodes === 'object') {
    progressNodes = rawProgressNodes as Record<string, number>;
  }

  return {
    id: String(item.id || ''),
    status: String(item.status || ''),
    receiver: String(item.receiver || ''),
    releaseTime: formatNodeTime(item.releaseTime),
    receiveTime: formatNodeTime(item.receiveTime),
    completeTime: formatNodeTime(item.completeTime),
    updateTime: formatNodeTime(item.updateTime),
    reviewStatus: String(item.reviewStatus || ''),
    reviewTime: formatNodeTime(item.reviewTime),
    procurementProgress: clampPercent(Number((item.procurementProgress as Record<string, unknown> | undefined)?.percent || 0)),
    progressNodes,
  };
};

export const getSampleNodeProgress = (snapshot: PatternProductionSnapshot, key: string) => {
  const aliases = SAMPLE_PROGRESS_NODE_ALIASES[key] || [key];
  for (const alias of aliases) {
    const value = snapshot.progressNodes[alias];
    if (value !== undefined && value !== null) {
      return clampPercent(Number(value));
    }
  }
  return 0;
};

export const isSampleSnapshotFullyCompleted = (snapshot?: PatternProductionSnapshot | null) => {
  if (!snapshot) return false;
  return SAMPLE_PARENT_STAGES.every((item) => {
    return getSampleNodeProgress(snapshot, item.key) >= 100;
  });
};

export const applyScrappedStageState = (record: StyleRecord, stage: SmartStage): SmartStage => {
  if (!isScrappedStyle(record) || stage.status === 'done') {
    return stage;
  }

  const helper = stage.key === 'confirm'
    ? '开发样已报废，不再进入审核 / 入库'
    : stage.key === 'sample'
      ? '开发样已报废，样衣生产已停止'
      : '开发样已报废，当前环节已停止';

  return {
    ...stage,
    helper,
    timeLabel: stage.timeLabel === '待启动' ? '已停止' : stage.timeLabel,
    status: 'scrapped',
    details: Array.from(new Set([
      '当前状态：开发样报废',
      stage.key === 'confirm' ? '审核 / 入库已终止' : '后续推进已停止',
      ...stage.details.filter(Boolean),
    ])),
  };
};

export const buildStageInsight = (stage: SmartStage, snapshot: PatternProductionSnapshot | null) => {
  if (/报废|已停止/.test(stage.helper) || isScrappedPatternSnapshot(snapshot)) {
    return '开发样已报废，当前节点已停止，不再继续后续审核或入库。';
  }

  if (stage.key === 'sample' && snapshot) {
    if (snapshot.status === 'COMPLETED') return '样衣生产、入库与库存链路已经闭环，可继续做审核与流转。';
    if (snapshot.status === 'PRODUCTION_COMPLETED') return '生产动作已经完成，当前重点转入审核与入库确认。';
    if (snapshot.status === 'IN_PROGRESS') return `已由 ${snapshot.receiver || '负责人'} 领取，系统正在跟踪工序推进与完工节奏。`;
  }

  if (stage.key === 'confirm' && snapshot) {
    if (snapshot.status === 'COMPLETED') {
      return '样衣已审核并完成入库，确认链路已经闭环。';
    }
    if (snapshot.reviewStatus === 'APPROVED') {
      return '样衣审核已经通过，但还差入库动作，入库后才算真正闭环。';
    }
    if (snapshot.reviewStatus === 'REJECTED') {
      return '样衣审核未通过，需要先返修或重新处理后再继续。';
    }
  }

  if (stage.status === 'done') return '当前环节已经闭环，可以继续推进后续节点。';
  if (stage.status === 'scrapped') return '开发样已报废，当前环节已经停止，页面改为静态灰色展示。';
  if (stage.status === 'risk') return '当前环节存在异常或返修，需要优先处理。';
  if (stage.status === 'active') return '当前环节正在推进，建议优先跟踪负责人与关键时间。';
  return '当前环节尚未启动，可从快捷动作直接进入处理。';
};

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
    helper: patternDone ? '纸样已完成' : record.patternAssignee ? `负责人 ${String(record.patternAssignee)}` : '等待处理',
    startTimeLabel: formatNodeTime(record.patternStartTime),
    timeLabel: patternDone
      ? formatStageTimeRange(record.patternStartTime, record.patternCompletedTime)
      : formatNodeTime(record.patternStartTime),
    status: patternDone ? 'done' : patternStarted ? 'active' : 'waiting',
    progress: patternDone ? 100 : patternStarted ? 58 : 0,
    actionKey: 'pattern',
    actionLabel: '进入纸样',
    details: buildStageDetails(
      record.patternAssignee ? `负责人：${String(record.patternAssignee)}` : '负责人待分配',
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
    helper: done ? '单价已锁定' : record.sizePriceAssignee ? `负责人 ${String(record.sizePriceAssignee)}` : '等待维护',
    startTimeLabel: formatNodeTime(record.sizePriceStartTime),
    timeLabel: done
      ? formatStageTimeRange(record.sizePriceStartTime, record.sizePriceCompletedTime)
      : formatNodeTime(record.sizePriceStartTime),
    status: done ? 'done' : started ? 'active' : 'waiting',
    progress: done ? 100 : started ? 56 : 0,
    actionKey: 'sizePrice',
    actionLabel: '进入单价',
    details: buildStageDetails(
      record.sizePriceAssignee ? `负责人：${String(record.sizePriceAssignee)}` : '负责人待分配',
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
    helper: done ? '工艺已锁定' : record.secondaryAssignee ? `负责人 ${String(record.secondaryAssignee)}` : '待安排',
    startTimeLabel: formatNodeTime(record.secondaryStartTime),
    timeLabel: done
      ? formatStageTimeRange(record.secondaryStartTime, record.secondaryCompletedTime)
      : formatNodeTime(record.secondaryStartTime),
    status: done ? 'done' : started ? 'active' : 'waiting',
    progress: done ? 100 : started ? 52 : 0,
    actionKey: 'secondary',
    actionLabel: '进入工艺',
    details: buildStageDetails(
      record.secondaryAssignee ? `负责人：${String(record.secondaryAssignee)}` : '负责人待分配',
      done ? '二次工艺资料已完成' : '当前正在推进二次工艺'
    ),
  };
};

export const buildSampleStage: StageBuilder = (record) => {
  // 注意：productionStartTime/productionCompletedTime 是「生产制单」阶段的时间，不是样衣生产的时间。
  // 样衣生产状态应只依赖 sampleStatus 和 sampleCompletedTime。
  const sampleStatus = String(record.sampleStatus || '').trim().toUpperCase();
  const sampleProgress = clampPercent(Number(record.sampleProgress || 0));
  // started：样衣已领取并进入制作（IN_PROGRESS）、制作完成待审（PRODUCTION_COMPLETED）或全流程完成（COMPLETED）
  const started = ['IN_PROGRESS', 'PRODUCTION_COMPLETED', 'COMPLETED'].includes(sampleStatus);
  // done：样衣制作本身完成（PRODUCTION_COMPLETED 或 COMPLETED），进度满100%或时间字段有值时优先校验
  const done = Boolean(record.sampleCompletedTime)
    || sampleProgress >= 100
    || ['PRODUCTION_COMPLETED', 'COMPLETED'].includes(sampleStatus);

  return {
    key: 'sample',
    label: '样衣生产',
    helper: done
      ? '生产完成'
      : sampleProgress > 0
        ? `进度 ${sampleProgress}%`
        : started
          ? '已领取生产'
          : '等待纸样',
    startTimeLabel: '',
    timeLabel: done
      ? (record.sampleCompletedTime
          ? formatNodeTime(record.sampleCompletedTime)
          : '已完成')
      : '',
    status: done ? 'done' : started ? 'active' : 'waiting',
    progress: done ? 100 : (started && sampleProgress > 0 ? sampleProgress : started ? 36 : 0),
    actionKey: 'detail',
    actionLabel: '查看详情',
    details: buildStageDetails(
      started ? '样衣制作中' : '领取时间待更新',
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
