import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { App, Button, Empty, Form, Input, InputNumber, Modal, Popover, Progress, Select, Skeleton, Tag } from 'antd';
import dayjs from 'dayjs';
import { SMART_CARD_OVERLAY_WIDTH } from '@/components/common/DecisionInsightCard';
import AttachmentThumb from '@/components/common/AttachmentThumb';
import SmallModal from '@/components/common/SmallModal';
import StandardPagination from '@/components/common/StandardPagination';
import StyleDevelopmentWorkbench from './StyleDevelopmentWorkbench';
import SmartStyleHoverCard from './SmartStyleHoverCard';
import { StyleInfo } from '@/types/style';
import { getStyleCardColorText, getStyleCardQuantityText, getStyleCardSizeText } from '@/utils/cardSizeQuantity';
import { getStyleSourceMeta } from '@/utils/styleSource';
import { useNavigate } from 'react-router-dom';
import api, { withQuery } from '@/utils/api';
import { isSupervisorOrAboveUser, useAuth } from '@/utils/AuthContext';

interface StyleTableViewProps {
  data: StyleInfo[];
  stockStateMap?: Record<string, boolean>;
  loading: boolean;
  total: number;
  pageSize: number;
  currentPage: number;
  onPageChange: (page: number, pageSize: number) => void;
  onScrap: (id: string) => void;
  onPrint: (record: StyleInfo) => void;
  onMaintenance: (record: StyleInfo) => void;
  categoryOptions: { label: string; value: string }[];
  onRefresh: () => void;
  focusedStyleId?: string | null;
}

type StageStatus = 'done' | 'active' | 'waiting' | 'risk' | 'scrapped';
type DeliveryTone = 'normal' | 'warning' | 'danger' | 'success' | 'scrapped';
type StageActionKey = 'detail' | 'pattern' | 'sizePrice' | 'secondary';
type WorkbenchSection = 'bom' | 'pattern' | 'size' | 'process' | 'sizePrice' | 'secondary' | 'production' | 'quotation' | 'files';

type StyleRecord = StyleInfo & Record<string, unknown>;

interface SmartStage {
  key: string;
  label: string;
  helper: string;
  timeLabel: string;
  status: StageStatus;
  progress: number;
  details: string[];
  actionKey?: StageActionKey;
  actionLabel?: string;
}

type StageBuilder = (record: StyleRecord) => SmartStage | null;

interface PatternProductionSnapshot {
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

interface StageQuickAction {
  key: string;
  label: string;
  type?: 'default' | 'primary';
  danger?: boolean;
  disabled?: boolean;
  onClick: () => void;
}

const REVIEW_STATUS_OPTIONS = [
  { label: '审核通过', value: 'PASS' },
  { label: '需返修', value: 'REWORK' },
  { label: '审核不通过', value: 'REJECT' },
];

const CATEGORY_MAP: Record<string, string> = {
  WOMAN: '女装',
  WOMEN: '女装',
  MAN: '男装',
  MEN: '男装',
  KID: '童装',
  KIDS: '童装',
  WCMAN: '女童装',
  UNISEX: '男女同款',
};

const SEASON_MAP: Record<string, string> = {
  SPRING: '春季',
  SUMMER: '夏季',
  AUTUMN: '秋季',
  WINTER: '冬季',
  SPRING_SUMMER: '春夏',
  AUTUMN_WINTER: '秋冬',
};

const STAGE_MIN_SLOT_WIDTH = 128;
const SAMPLE_PARENT_STAGES = [
  { key: 'procurement', label: '采购' },
  { key: 'cutting', label: '裁剪' },
  { key: 'secondary', label: '二次工艺' },
  { key: 'sewing', label: '车缝' },
  { key: 'tail', label: '尾部' },
  { key: 'warehousing', label: '入库' },
];
const SAMPLE_PROGRESS_NODE_ALIASES: Record<string, string[]> = {
  procurement: ['procurement', '采购'],
  cutting: ['cutting', '裁剪', '下板'],
  secondary: ['secondary', '二次工艺'],
  sewing: ['sewing', '车缝', '缝制'],
  tail: ['tail', '尾部', '后整'],
  warehousing: ['warehousing', '入库'],
};

const clampPercent = (value: number) => Math.max(0, Math.min(100, Math.round(value)));

const resolveDisplayColor = (record: StyleRecord) => {
  return getStyleCardColorText(record) || '';
};

const resolveDisplaySize = (record: StyleRecord) => {
  return getStyleCardSizeText(record) || '';
};

const resolveDisplayQuantity = (record: StyleRecord) => {
  return getStyleCardQuantityText(record) || '';
};

const formatNodeTime = (value?: unknown) => {
  if (!value) return '待启动';
  const instance = dayjs(value as string | number | Date | null | undefined);
  if (instance.isValid()) {
    return instance.format('MM-DD HH:mm');
  }
  return String(value);
};

const getLatestTimeLabel = (values: unknown[]) => {
  const valid = values
    .map((item) => dayjs(item as string | number | Date | null | undefined))
    .filter((item) => item.isValid())
    .sort((a, b) => b.valueOf() - a.valueOf());

  if (!valid.length) return '待启动';
  return valid[0].format('MM-DD HH:mm');
};

const getStyleCompletedTime = (record: StyleRecord) => {
  const finalCompletedTime = dayjs(record.completedTime as string | number | Date | null | undefined);
  return finalCompletedTime.isValid() ? finalCompletedTime : null;
};

const getStyleLifecycleCompletedTime = (record: StyleRecord) => {
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

const isMaintainedAfterCompletion = (record: StyleRecord, completed: boolean) => {
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

const formatStageTimeRange = (startTime?: unknown, endTime?: unknown) => {
  const start = formatNodeTime(startTime);
  const end = formatNodeTime(endTime);
  if (start !== '待启动' && end !== '待启动') {
    const startInstance = dayjs(startTime as string | number | Date | null | undefined);
    const endInstance = dayjs(endTime as string | number | Date | null | undefined);
    if (startInstance.isValid() && endInstance.isValid() && startInstance.isSame(endInstance, 'day')) {
      return `${startInstance.format('MM-DD HH:mm')} → ${endInstance.format('HH:mm')}`;
    }
    return `${start} → ${end}`;
  }
  return end !== '待启动' ? end : start;
};

const getDeliveryMeta = (record: StyleRecord, completed = false): { tone: DeliveryTone; label: string } => {
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

const buildStageDetails = (...values: Array<string | null | undefined | false>) =>
  values.filter(Boolean) as string[];

const isPassedReviewStatus = (status?: unknown) => ['PASS', 'APPROVED'].includes(String(status || '').trim().toUpperCase());

const isRiskReviewStatus = (status?: unknown) => ['REJECT', 'REJECTED', 'REWORK'].includes(String(status || '').trim().toUpperCase());

const getReviewStatusLabel = (status?: unknown) => {
  const normalized = String(status || '').trim().toUpperCase();
  if (normalized === 'PASS' || normalized === 'APPROVED') return '审核通过';
  if (normalized === 'PENDING') return '待审核';
  if (normalized === 'REWORK') return '需返修';
  if (normalized === 'REJECT' || normalized === 'REJECTED') return '审核不通过';
  return '未开始';
};

const getProgressNodeColor = (node: string) => {
  if (/开发样报废|样衣报废|已报废/.test(node)) return 'default';
  if (/报废|驳回|不通过|异常|失败/.test(node)) return 'error';
  if (/返修|紧急/.test(node)) return 'warning';
  if (/完成|通过/.test(node)) return 'success';
  if (/中|待审|确认/.test(node)) return 'processing';
  return 'default';
};

const isScrappedStyle = (record?: Partial<StyleInfo> | null) => {
  if (!record) return false;
  return String(record.status || '').trim().toUpperCase() === 'SCRAPPED'
    || String((record as Record<string, unknown>).progressNode || '').trim() === '开发样报废';
};

const isScrappedPatternSnapshot = (snapshot?: PatternProductionSnapshot | null) => (
  String(snapshot?.status || '').trim().toUpperCase() === 'SCRAPPED'
);

const resolveStageTag = (stage: SmartStage) => {
  if (stage.status === 'done') return { color: 'success' as const, text: '已完成' };
  if (stage.status === 'active') return { color: 'processing' as const, text: '进行中' };
  if (stage.status === 'scrapped') return { color: 'default' as const, text: '已停止' };
  if (stage.status === 'risk') {
    return { color: 'error' as const, text: /报废|停止/.test(stage.helper) ? '已停止' : '风险中' };
  }
  return { color: 'default' as const, text: '未开始' };
};

const normalizePatternProductionSnapshot = (item: Record<string, unknown>): PatternProductionSnapshot => {
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

const getSampleNodeProgress = (snapshot: PatternProductionSnapshot, key: string) => {
  const aliases = SAMPLE_PROGRESS_NODE_ALIASES[key] || [key];
  for (const alias of aliases) {
    const value = snapshot.progressNodes[alias];
    if (value !== undefined && value !== null) {
      return clampPercent(Number(value));
    }
  }
  return 0;
};

const isSampleSnapshotFullyCompleted = (snapshot?: PatternProductionSnapshot | null) => {
  if (!snapshot) return false;
  return SAMPLE_PARENT_STAGES.every((item) => {
    if (item.key === 'procurement') {
      return clampPercent(Number(snapshot.procurementProgress || 0)) >= 100;
    }
    return getSampleNodeProgress(snapshot, item.key) >= 100;
  });
};

const applyScrappedStageState = (record: StyleRecord, stage: SmartStage): SmartStage => {
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

const buildStageInsight = (stage: SmartStage, snapshot: PatternProductionSnapshot | null) => {
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

const buildDevelopmentStage: StageBuilder = (record) => {
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

const buildPatternStage: StageBuilder = (record) => {
  const progressNode = String(record.progressNode || '').trim();
  const patternStatus = String(record.patternStatus || '').trim().toUpperCase();
  const patternDone = patternStatus === 'COMPLETED' || Boolean(record.patternCompletedTime);
  const patternStarted = patternDone || Boolean(record.patternStartTime) || /纸样/.test(progressNode);

  return {
    key: 'pattern',
    label: '纸样开发',
    helper: patternDone ? '纸样已完成' : record.patternAssignee ? `负责人 ${String(record.patternAssignee)}` : '等待处理',
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

const buildSizePriceStage: StageBuilder = (record) => {
  const hasStage = Boolean(record.sizePriceStartTime || record.sizePriceCompletedTime || record.sizePriceAssignee);
  if (!hasStage) return null;

  const done = Boolean(record.sizePriceCompletedTime);
  const started = done || Boolean(record.sizePriceStartTime);

  return {
    key: 'sizePrice',
    label: '码数单价',
    helper: done ? '单价已锁定' : record.sizePriceAssignee ? `负责人 ${String(record.sizePriceAssignee)}` : '等待维护',
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

const buildSecondaryStage: StageBuilder = (record) => {
  const hasStage = Boolean(record.secondaryStartTime || record.secondaryCompletedTime || record.secondaryAssignee || /二次工艺/.test(String(record.progressNode || '')));
  if (!hasStage) return null;

  const done = Boolean(record.secondaryCompletedTime);
  const started = done || Boolean(record.secondaryStartTime) || /二次工艺/.test(String(record.progressNode || ''));

  return {
    key: 'secondary',
    label: '二次工艺',
    helper: done ? '工艺已锁定' : record.secondaryAssignee ? `负责人 ${String(record.secondaryAssignee)}` : '待安排',
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

const buildSampleStage: StageBuilder = (record) => {
  const progressNode = String(record.progressNode || '').trim();
  const sampleStatus = String(record.sampleStatus || '').trim().toUpperCase();
  const sampleProgress = clampPercent(Number(record.sampleProgress || 0));
  const started = Boolean(record.productionStartTime) || /样衣/.test(progressNode) || ['IN_PROGRESS', 'PRODUCTION_COMPLETED', 'COMPLETED'].includes(sampleStatus);
  const done = Boolean(record.productionCompletedTime)
    || (started && ['PRODUCTION_COMPLETED', 'COMPLETED'].includes(sampleStatus));

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
    timeLabel: done
      ? formatStageTimeRange(record.productionStartTime, record.productionCompletedTime || record.sampleCompletedTime)
      : formatNodeTime(record.productionStartTime),
    status: done ? 'done' : started ? 'active' : 'waiting',
    progress: done ? 100 : (started && sampleProgress > 0 ? sampleProgress : started ? 36 : 0),
    actionKey: 'detail',
    actionLabel: '查看详情',
    details: buildStageDetails(
      record.productionStartTime ? `领取时间：${dayjs(record.productionStartTime as string | number | Date).format('YYYY-MM-DD HH:mm')}` : '领取时间待更新',
      done && record.productionCompletedTime ? `完成时间：${dayjs(record.productionCompletedTime as string | number | Date).format('YYYY-MM-DD HH:mm')}` : false
    ),
  };
};

const buildConfirmStage: StageBuilder = (record) => {
  const progressNode = String(record.progressNode || '').trim();
  const reviewStatus = String(record.sampleReviewStatus || '').trim().toUpperCase();
  const latestPatternStatus = String(record.latestPatternStatus || '').trim().toUpperCase();
  const reviewPassed = isPassedReviewStatus(reviewStatus);
  const inboundCompleted = latestPatternStatus === 'COMPLETED';
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
      reviewStatus ? `审核状态：${reviewStatus}` : '审核状态待更新',
      reviewPassed ? (inboundCompleted ? '入库状态：已入库' : '入库状态：待入库') : false
    ),
  };
};

const STAGE_BUILDERS: StageBuilder[] = [
  buildDevelopmentStage,
  buildPatternStage,
  buildSizePriceStage,
  buildSecondaryStage,
  buildSampleStage,
  buildConfirmStage,
];

const buildSmartStages = (record: StyleInfo) => STAGE_BUILDERS
  .map((builder) => {
    const stage = builder(record as StyleRecord);
    return stage ? applyScrappedStageState(record as StyleRecord, stage) : null;
  })
  .filter(Boolean) as SmartStage[];

const resolveStageActionPath = (record: StyleInfo, stage: SmartStage) => {
  if (stage.actionKey === 'pattern') return `/style-info/${record.id}?tab=7&section=files`;
  if (stage.actionKey === 'sizePrice') return `/style-info/${record.id}?tab=10`;
  if (stage.actionKey === 'secondary') return `/style-info/${record.id}?tab=9`;
  return `/style-info/${record.id}`;
};

const StyleTableView: React.FC<StyleTableViewProps> = ({
  data,
  stockStateMap = {},
  loading,
  total,
  pageSize,
  currentPage,
  onPageChange,
  onScrap,
  onPrint,
  onMaintenance,
  categoryOptions,
  onRefresh,
  focusedStyleId,
}) => {
  const { message } = App.useApp();
  const navigate = useNavigate();
  const { user } = useAuth();
  const isSupervisorOrAbove = isSupervisorOrAboveUser(user);
  const [selectedStage, setSelectedStage] = useState<{ record: StyleInfo; stage: SmartStage } | null>(null);
  const [developmentWorkbenchRecord, setDevelopmentWorkbenchRecord] = useState<StyleInfo | null>(null);
  const [developmentWorkbenchSection, setDevelopmentWorkbenchSection] = useState<WorkbenchSection>('bom');
  const [sampleSnapshot, setSampleSnapshot] = useState<PatternProductionSnapshot | null>(null);
  const [sampleSnapshotLoading, setSampleSnapshotLoading] = useState(false);
  const [sampleActionLoading, setSampleActionLoading] = useState(false);
  const [progressEditorOpen, setProgressEditorOpen] = useState(false);
  const [progressDraft, setProgressDraft] = useState<Record<string, number>>({});
  const [reviewModalOpen, setReviewModalOpen] = useState(false);
  const [reviewSaving, setReviewSaving] = useState(false);
  const [reviewForm] = Form.useForm();
  const viewportRestoreRef = useRef<{ x: number; y: number } | null>(null);

  const toCategoryCn = (value: unknown) => {
    const code = String(value || '').trim().toUpperCase();
    if (!code) return '-';
    if (categoryOptions && categoryOptions.length > 0) {
      const found = categoryOptions.find(opt => opt.value === code);
      if (found) return found.label;
    }
    return CATEGORY_MAP[code] || code;
  };

  const toSeasonCn = (value: unknown) => {
    const code = String(value || '').trim().toUpperCase();
    if (!code) return '-';
    return SEASON_MAP[code] || code;
  };

  const isStageDoneRow = (record: StyleInfo) => {
    return buildConfirmStage(record as StyleRecord).status === 'done';
  };

  const hasPushedOrder = (record: StyleInfo) => Boolean((record as any).pushedToOrder);

  const isScrappedRow = (record: StyleInfo) => {
    return isScrappedStyle(record);
  };

  const openDevelopmentWorkbench = useCallback((record: StyleInfo, section: WorkbenchSection) => {
    const isSameRecord = String(developmentWorkbenchRecord?.id || '') === String(record.id || '');
    const isSameSection = developmentWorkbenchSection === section;
    if (isSameRecord && isSameSection) {
      setDevelopmentWorkbenchRecord(null);
      return;
    }
    viewportRestoreRef.current = { x: window.scrollX, y: window.scrollY };
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    setDevelopmentWorkbenchSection(section);
    setDevelopmentWorkbenchRecord(record);
    requestAnimationFrame(() => {
      const viewport = viewportRestoreRef.current;
      if (!viewport) return;
      window.scrollTo({ left: viewport.x, top: viewport.y, behavior: 'auto' });
      requestAnimationFrame(() => {
        window.scrollTo({ left: viewport.x, top: viewport.y, behavior: 'auto' });
      });
    });
  }, [developmentWorkbenchRecord?.id, developmentWorkbenchSection]);

  const rows = useMemo(() => {
    return data.map((record) => {
      const stockKey = `${String((record as StyleRecord).styleNo || '').trim().toUpperCase()}|${resolveDisplayColor(record as StyleRecord).trim().toUpperCase()}`;
      const normalizedRecord = stockStateMap[stockKey]
        ? { ...(record as StyleRecord), latestPatternStatus: 'COMPLETED' }
        : record;
      const sourceMeta = getStyleSourceMeta(record);
      const progressNode = String((normalizedRecord as StyleRecord).progressNode || '未开始').trim() || '未开始';
      const stages = buildSmartStages(normalizedRecord as StyleInfo);
      const allStagesCompleted = stages.length > 0 && stages.every((item) => item.status === 'done');
      const maintainedAfterCompletion = isMaintainedAfterCompletion(normalizedRecord as StyleRecord, allStagesCompleted);
      const deliveryMeta = getDeliveryMeta(normalizedRecord as StyleRecord, allStagesCompleted);
      const baseProgress = clampPercent(
        stages.reduce((sum, item) => sum + item.progress, 0) / Math.max(stages.length, 1),
      );
      const overallProgress = allStagesCompleted ? 100 : baseProgress;
      const rowState = isScrappedRow(record) ? 'scrapped' : deliveryMeta.tone;
      const metaItems = [
        { label: '来源', value: sourceMeta.label },
        { label: '品类', value: toCategoryCn(record.category) },
        { label: '季节', value: toSeasonCn(record.season) },
        { label: '颜色', value: resolveDisplayColor(record as StyleRecord) || '-' },
        { label: '码数', value: resolveDisplaySize(record as StyleRecord) || '-' },
        { label: '数量', value: `${resolveDisplayQuantity(record as StyleRecord) || '0'} 件` },
        { label: '交板', value: record.deliveryDate ? dayjs(record.deliveryDate).format('YYYY-MM-DD') : '-' },
        { label: '客户', value: String((record as StyleRecord).customer || '-') },
      ].filter((item) => item.value && item.value !== '-');

      return {
        deliveryMeta,
        maintainedAfterCompletion,
        metaItems,
        overallProgress,
        progressNode,
        record: normalizedRecord as StyleInfo,
        rowState,
        stages,
      };
    });
  }, [categoryOptions, data, stockStateMap]);

  const selectedStageTag = selectedStage ? resolveStageTag(selectedStage.stage) : null;
  const selectedStageInsight = selectedStage ? buildStageInsight(selectedStage.stage, sampleSnapshot) : '';
  const selectedStageRecordScrapped = useMemo(() => selectedStage ? isScrappedStyle(selectedStage.record) : false, [selectedStage]);
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
      return {
        tag: { color: 'error' as const, text: '已停止' },
        helper: '样衣生产已停止',
        time: sampleCompletedRangeLabel,
      };
    }

    if (isSampleSnapshotCompleted) {
      return {
        tag: { color: 'success' as const, text: '已完成' },
        helper: '样衣生产已完成',
        time: sampleCompletedRangeLabel,
      };
    }

    if (isSampleSnapshotReceived) {
      return {
        tag: { color: 'processing' as const, text: '进行中' },
        helper: sampleReceiverLabel !== '-' ? `已由 ${sampleReceiverLabel} 领取生产` : '样衣生产进行中',
        time: sampleReceiveTimeLabel,
      };
    }

    return {
      tag: { color: 'default' as const, text: '未开始' },
      helper: '尚未领取样衣生产',
      time: '待领取',
    };
  }, [
    isSampleSnapshotCompleted,
    isSampleSnapshotReceived,
    sampleCompletedTimeLabel,
    sampleCompletedRangeLabel,
    sampleReceiveTimeLabel,
    sampleReceiverLabel,
    sampleSnapshot,
    selectedStage,
    selectedStageRecordScrapped,
  ]);

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
      return {
        tag: { color: 'error' as const, text: '已停止' },
        helper: '审核 / 入库已停止',
        time: confirmInboundTimeLabel,
      };
    }
    if (isConfirmReviewPassed && isConfirmInboundCompleted) {
      return {
        tag: { color: 'success' as const, text: '已完成' },
        helper: '审核通过，样衣已入库',
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
      return {
        tag: { color: 'processing' as const, text: '待入库' },
        helper: '审核已通过，等待入库',
        time: confirmReviewTimeLabel,
      };
    }
    if (confirmReviewStatus === 'PENDING') {
      return {
        tag: { color: 'processing' as const, text: '待审核' },
        helper: '样衣已完成，等待审核',
        time: confirmReviewTimeLabel,
      };
    }
    return {
      tag: { color: 'default' as const, text: '未开始' },
      helper: '尚未进入审核 / 入库',
      time: '待审核',
    };
  }, [
    confirmInboundTimeLabel,
    confirmReviewStatus,
    confirmReviewTimeLabel,
    isConfirmInboundCompleted,
    isConfirmReviewPassed,
    selectedStage,
    selectedStageRecordScrapped,
  ]);

  const selectedStageInsightText = useMemo(() => {
    if (!selectedStage) return selectedStageInsight;
    if (selectedStage.stage.key === 'sample') {
      if (selectedStageRecordScrapped || isScrappedPatternSnapshot(sampleSnapshot)) {
        return '开发样已报废，样衣生产已停止。';
      }
      if (isSampleSnapshotCompleted) {
        return '样衣生产已经完成，可以继续做审核与入库确认。';
      }
      if (isSampleSnapshotReceived) {
        return sampleReceiverLabel !== '-'
          ? `样衣已由 ${sampleReceiverLabel} 领取，当前按实际节点进度推进。`
          : '样衣已经领取，当前按实际节点进度推进。';
      }
      return '当前还没有领取样衣生产，节点进度会在领取并推进后更新。';
    }
    if (selectedStage.stage.key === 'confirm') {
      if (selectedStageRecordScrapped) {
        return '开发样已报废，审核 / 入库流程已停止。';
      }
      if (isConfirmReviewPassed && isConfirmInboundCompleted) {
        return '样衣已审核通过并完成入库，确认链路已经闭环。';
      }
      if (isRiskReviewStatus(confirmReviewStatus)) {
        return confirmReviewStatus === 'REWORK'
          ? '样衣审核要求返修，返修完成后再继续审核 / 入库。'
          : '样衣审核未通过，需要先处理异常后再继续。';
      }
      if (isConfirmReviewPassed) {
        return '样衣审核已通过，当前只差入库动作即可闭环。';
      }
      if (confirmReviewStatus === 'PENDING') {
        return '样衣已经完成，当前等待审核结论。';
      }
      return '当前还没有进入审核 / 入库，请先完成样衣生产。';
    }
    return selectedStageInsight;
  }, [
    confirmReviewStatus,
    isConfirmInboundCompleted,
    isConfirmReviewPassed,
    isSampleSnapshotCompleted,
    isSampleSnapshotReceived,
    sampleReceiverLabel,
    sampleSnapshot,
    selectedStage,
    selectedStageInsight,
    selectedStageRecordScrapped,
  ]);

  const loadSampleSnapshot = useCallback(async (record: StyleInfo) => {
    const response: any = await api.get('/production/pattern/list', {
      params: {
        page: 1,
        pageSize: 20,
        keyword: record.styleNo,
      },
    });
    const records = Array.isArray(response?.data?.records) ? response.data.records : [];
    const matched = records.find((item: Record<string, unknown>) => String(item.styleId || '') === String(record.id || ''))
      || records.find((item: Record<string, unknown>) => String(item.styleNo || '') === String(record.styleNo || ''));
    return matched ? normalizePatternProductionSnapshot(matched) : null;
  }, []);

  useEffect(() => {
    let active = true;

    if (!selectedStage || selectedStage.stage.key !== 'sample') {
      setSampleSnapshot(null);
      setSampleSnapshotLoading(false);
      setProgressEditorOpen(false);
      return () => {
        active = false;
      };
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

    return () => {
      active = false;
    };
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

  const reloadSampleStage = useCallback(async () => {
    if (!selectedStage || selectedStage.stage.key !== 'sample') return;

    setSampleSnapshotLoading(true);
    try {
      const snapshot = await loadSampleSnapshot(selectedStage.record);
      setSampleSnapshot(snapshot);
      onRefresh();
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
    } catch (error: any) {
      message.error(error?.response?.data?.message || error?.message || '领取失败');
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
    } catch (error: any) {
      message.error(error?.response?.data?.message || error?.message || '进度更新失败');
    } finally {
      setSampleActionLoading(false);
    }
  }, [message, progressDraft, reloadSampleStage, sampleSnapshot?.id]);

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
  }, [message, onRefresh, reviewForm, selectedStage]);

  const buildStageQuickActions = (selected: { record: StyleInfo; stage: SmartStage }): StageQuickAction[] => {
    const actions: StageQuickAction[] = [];
    const scrapped = isScrappedStyle(selected.record) || isScrappedPatternSnapshot(sampleSnapshot);
    const sampleStageCompleted = selected.stage.key === 'sample'
      ? isSampleSnapshotCompleted || sampleCompletedTimeLabel !== '待启动'
      : selected.stage.status === 'done';

    if (!scrapped && selected.stage.actionKey && selected.stage.actionKey !== 'detail') {
      actions.push({
        key: 'stage-entry',
        label: selected.stage.actionLabel || '进入环节',
        type: 'primary',
        onClick: () => {
          navigate(resolveStageActionPath(selected.record, selected.stage));
          setSelectedStage(null);
        },
      });
    }

    if (!scrapped && selected.stage.key === 'sample') {
      if (sampleSnapshot?.status === 'PENDING' || !sampleSnapshot?.receiveTime || sampleSnapshot.receiveTime === '待启动') {
        actions.push({
          key: 'receive-sample',
          label: '领取生产',
          type: 'primary',
          onClick: () => {
            void handleReceiveSample();
          },
        });
      } else if (sampleSnapshot?.receiveTime && sampleSnapshot.receiveTime !== '待启动' && !sampleStageCompleted && !selected.record.sampleCompletedTime) {
        // ✅ 已领取但未完成 → 显示"完成"按钮
        actions.push({
          key: 'complete-sample',
          label: '标记完成',
          type: 'primary',
          onClick: () => {
            Modal.confirm({
              title: '确认完成样衣生产？',
              content: '完成后样衣进入审核阶段',
              okText: '确认完成',
              cancelText: '取消',
              onOk: async () => {
                try {
                  await api.post(`/production/pattern/${sampleSnapshot.id}/workflow-action`, {}, { params: { action: 'complete' } });
                  message.success('样衣生产已完成');
                  await reloadSampleStage();
                } catch (error: any) {
                  message.error(error?.response?.data?.message || error?.message || '完成失败');
                }
              },
            });
          },
        });
      }

      // ❌ 移除：自动"更新进度"弹窗（用户投诉的主要问题）
      // 如果需要手动调整进度，可以通过 API 直接修改，但不弹窗

      if (sampleStageCompleted || selected.record.sampleCompletedTime) {
        actions.push({
          key: 'review',
          label: selected.record.sampleReviewStatus ? '修改审核结论' : '记录审核结论',
          type: selected.record.sampleReviewStatus ? 'default' : 'primary',
          onClick: handleOpenReviewModal,
        });
      }
    }

    if (!scrapped && selected.stage.key === 'confirm') {
      if (selected.record.sampleCompletedTime) {
        actions.push({
          key: 'review',
          label: selected.record.sampleReviewStatus ? '修改审核结论' : '记录审核结论',
          type: selected.record.sampleReviewStatus ? 'default' : 'primary',
          onClick: handleOpenReviewModal,
        });
      }

      if (String(selected.record.sampleReviewStatus || '').trim().toUpperCase() === 'PASS') {
        actions.push({
          key: 'inventory',
          label: '去做入库',
          type: 'primary',
          onClick: () => {
            navigate(withQuery('/warehouse/sample', {
              styleId: (selected.record as StyleRecord).id,
              styleNo: (selected.record as StyleRecord).styleNo,
              action: 'inbound',
              styleName: selected.record.styleName,
              color: selected.record.color,
              size: selected.record.size,
              quantity: selected.record.sampleQuantity,
              sampleType: 'development',
            }));
            setSelectedStage(null);
          },
        });
      }
    }

    if (!scrapped && selected.stage.key === 'confirm' && String(selected.record.sampleReviewStatus || '').trim().toUpperCase() === 'PASS') {
      actions.push(hasPushedOrder(selected.record)
        ? {
            key: 'order-view',
            label: '查看订单',
            onClick: () => {
              navigate(withQuery('/order-management', {
                styleNo: (selected.record as StyleRecord).styleNo,
                orderNo: (selected.record as any).orderNo,
              }));
              setSelectedStage(null);
            },
          }
        : {
            key: 'order-push',
            label: '推送下单',
            type: 'default',
            onClick: () => {
              navigate(withQuery('/order-management', { styleNo: (selected.record as StyleRecord).styleNo }));
              setSelectedStage(null);
            },
          });
    }

    actions.push({
      key: 'detail',
      label: '进入详情',
      onClick: () => {
        navigate(`/style-info/${selected.record.id}`);
        setSelectedStage(null);
      },
    });

    actions.push({
      key: 'print',
      label: '打印',
      onClick: () => {
        onPrint(selected.record);
        setSelectedStage(null);
      },
    });

    const uniqueActions = actions.filter((action, index, list) => list.findIndex((item) => item.key === action.key) === index);
    if (!sampleStageCompleted) {
      return uniqueActions;
    }

    return uniqueActions.map((action) => ({
      ...action,
      type: ['print', 'detail'].includes(action.key) ? action.type : 'default',
      danger: action.key === 'print' ? action.danger : false,
      disabled: !['print', 'detail'].includes(action.key),
    }));
  };

  const selectedStageActions = selectedStage ? buildStageQuickActions(selectedStage) : [];

  return (
    <>
      <div className="style-smart-list">
        {data.length === 0 && !loading ? (
        <div className="style-smart-list__empty">
          <Empty description="暂无样衣数据" />
        </div>
      ) : (
        rows.map(({ deliveryMeta, maintainedAfterCompletion, metaItems, overallProgress, progressNode, record, rowState, stages }) => {
          const actionButtons: StageQuickAction[] = (() => {
            if (isScrappedRow(record)) {
              return [
                { key: 'detail', label: '详情', type: 'primary' as const, onClick: () => navigate(`/style-info/${record.id}`) },
                { key: 'print', label: '打印', type: 'default' as const, onClick: () => onPrint(record) },
              ];
            }

            if (isStageDoneRow(record)) {
              const items = [
                { key: 'detail', label: '详情', type: 'primary' as const, onClick: () => navigate(`/style-info/${record.id}`) },
                hasPushedOrder(record)
                  ? { key: 'order-view', label: '订单', type: 'default' as const, onClick: () => navigate(withQuery('/order-management', { styleNo: (record as any).styleNo, orderNo: (record as any).orderNo })) }
                  : { key: 'order-push', label: '去推送', type: 'default' as const, onClick: () => navigate(`/style-info/${record.id}`) },
                { key: 'print', label: '打印', type: 'default' as const, onClick: () => onPrint(record) },
              ];

              if (isSupervisorOrAbove) {
                items.push({ key: 'maintenance', label: '维护', type: 'default' as const, onClick: () => onMaintenance(record) });
              }

              return items;
            }

            return [
              { key: 'detail', label: '详情', type: 'primary' as const, onClick: () => navigate(`/style-info/${record.id}`) },
              { key: 'print', label: '打印', type: 'default' as const, onClick: () => onPrint(record) },
              { key: 'scrap', label: '报废', type: 'default' as const, danger: true, onClick: () => onScrap(String(record.id!)) },
            ];
          })();
          const timelineMinWidth = stages.length * STAGE_MIN_SLOT_WIDTH;
          const trackInset = `calc((100% / ${stages.length}) / 2)`;
          const progressWidth = stages.length > 1
            ? `calc((100% - ((${trackInset}) * 2)) * ${overallProgress / 100})`
            : '0px';
          const rowKey = String(record.id || record.styleNo || '').trim();

          return (
            <div
              key={rowKey}
              id={`style-smart-row-${rowKey}`}
              className={`style-smart-row style-smart-row--${rowState}${focusedStyleId === rowKey ? ' style-smart-row--focused' : ''}`}
            >
              <div className="style-smart-row__cover">
                <AttachmentThumb
                  styleId={record.id!}
                  src={record.cover || null}
                  className="style-smart-row__thumb"
                  width="100%"
                  height="100%"
                  borderRadius={28}
                  imageStyle={{ objectFit: 'contain', padding: 14 }}
                />
              </div>

              <div className="style-smart-row__body">
                <div className="style-smart-row__layout">
                  <div className="style-smart-row__identity">
                    <div className="style-smart-row__tags">
                      <Tag color={getProgressNodeColor(progressNode)}>{progressNode}</Tag>
                      {maintainedAfterCompletion ? <Tag color="gold">已维护</Tag> : null}
                    </div>

                    <Popover
                      content={<SmartStyleHoverCard record={record} />}
                      trigger="hover"
                      placement="rightTop"
                      mouseEnterDelay={0.3}
                      overlayStyle={{ width: SMART_CARD_OVERLAY_WIDTH, maxWidth: SMART_CARD_OVERLAY_WIDTH }}
                    >
                      <div className="style-smart-row__title-wrap">
                        <button
                          type="button"
                          className="style-smart-row__title"
                          onClick={() => navigate(`/style-info/${record.id}`)}
                        >
                          {record.styleNo}
                        </button>
                        <div className="style-smart-row__title-name">{record.styleName || '未命名样衣'}</div>
                        <span className={`style-smart-row__delivery style-smart-row__delivery--${isScrappedRow(record) ? 'scrapped' : deliveryMeta.tone}`}>
                          {deliveryMeta.label}
                        </span>
                      </div>
                    </Popover>

                    <div className="style-smart-row__meta style-smart-row__meta--stacked">
                      {metaItems.map((item) => (
                        <span key={item.label} className="style-smart-row__meta-item">
                          <span className="style-smart-row__meta-label">{item.label}</span>
                          <span className="style-smart-row__meta-value">{item.value}</span>
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="style-smart-row__timeline-shell">
                    {stages.length > 1 ? (
                      <>
                        <div className="style-smart-row__timeline-track" style={{ left: trackInset, right: trackInset }} />
                        <div className="style-smart-row__timeline-progress" style={{ left: trackInset, width: progressWidth }} />
                      </>
                    ) : null}
                    <div
                      className="style-smart-row__timeline"
                      style={{
                        gridTemplateColumns: `repeat(${stages.length}, minmax(0, 1fr))`,
                        minWidth: `${timelineMinWidth}px`,
                      }}
                    >
                      {stages.map((stage) => (
                        <button
                          key={stage.key}
                          type="button"
                          className={`style-smart-stage style-smart-stage--${stage.status}`}
                          onClick={() => {
                            if (stage.key === 'development' || stage.key === 'pattern' || stage.key === 'sizePrice' || stage.key === 'secondary') {
                              if (stage.key === 'development') openDevelopmentWorkbench(record, 'bom');
                              if (stage.key === 'pattern') openDevelopmentWorkbench(record, 'pattern');
                              if (stage.key === 'sizePrice') openDevelopmentWorkbench(record, 'sizePrice');
                              if (stage.key === 'secondary') openDevelopmentWorkbench(record, 'secondary');
                              return;
                            }
                            setSelectedStage((prev) => (
                              prev
                                && String(prev.record.id || '') === String(record.id || '')
                                && prev.stage.key === stage.key
                                ? null
                                : { record, stage }
                            ));
                          }}
                        >
                          <div className="style-smart-stage__time">{stage.timeLabel}</div>
                          <div className="style-smart-stage__node">
                            <span className="style-smart-stage__ring" />
                            <span className="style-smart-stage__orbit" />
                            <span className="style-smart-stage__core" />
                            <span className="style-smart-stage__check" />
                          </div>
                          <div className="style-smart-stage__label">{stage.label}</div>
                          <div className="style-smart-stage__helper">{stage.helper}</div>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="style-smart-row__aside">
                    <div className="style-smart-row__overview">
                      <div className="style-smart-row__overview-value">{overallProgress}%</div>
                      <div className="style-smart-row__overview-label">总进度</div>
                      <Progress percent={overallProgress} showInfo={false} size="small" strokeColor={isScrappedRow(record) ? '#9ca3af' : '#2d7ff9'} />
                    </div>

                    <div className="style-smart-row__actions">
                      {actionButtons.map((action) => (
                        <Button
                          key={action.key}
                          size="small"
                          type={action.type}
                          danger={action.danger}
                          disabled={action.disabled}
                          onClick={action.onClick}
                        >
                          {action.label}
                        </Button>
                      ))}
                    </div>
                  </div>
                </div>
                {developmentWorkbenchRecord && String(developmentWorkbenchRecord.id || '') === String(record.id || '') ? (
                  <div className="style-smart-row__workbench">
                    <StyleDevelopmentWorkbench
                      record={developmentWorkbenchRecord}
                      onClose={() => setDevelopmentWorkbenchRecord(null)}
                      initialSection={developmentWorkbenchSection}
                      onSync={onRefresh}
                    />
                  </div>
                ) : null}
              </div>
            </div>
          );
        })
      )}

      <div className="style-smart-list__pagination">
        <StandardPagination
          current={currentPage}
          pageSize={pageSize}
          total={total}
          onChange={onPageChange}
        />
      </div>
      </div>

      <Modal
        open={Boolean(selectedStage)}
        title={selectedStage ? `${selectedStage.record.styleNo} · ${selectedStage.stage.label}` : ''}
        onCancel={() => setSelectedStage(null)}
        width={selectedStage?.stage.key === 'sample' || selectedStage?.stage.key === 'confirm' ? 680 : 760}
        footer={selectedStage ? [
          <Button key="close" onClick={() => setSelectedStage(null)}>
            关闭
          </Button>,
        ] : null}
      >
        {selectedStage && selectedStageTag ? (
          <div className="style-smart-stage-modal">
            {(selectedStage.stage.key === 'sample' && sampleStageSummary) || (selectedStage.stage.key === 'confirm' && confirmStageSummary) ? (
              <div className="style-smart-stage-modal__summary style-smart-stage-modal__summary--compact">
                <div className="style-smart-stage-modal__meta">
                  <Tag color={(selectedStage.stage.key === 'sample' ? sampleStageSummary : confirmStageSummary)?.tag.color}>
                    {(selectedStage.stage.key === 'sample' ? sampleStageSummary : confirmStageSummary)?.tag.text}
                  </Tag>
                  <div className="style-smart-stage-modal__helper">
                    {(selectedStage.stage.key === 'sample' ? sampleStageSummary : confirmStageSummary)?.helper}
                  </div>
                  <div className="style-smart-stage-modal__time">
                    {(selectedStage.stage.key === 'sample' ? sampleStageSummary : confirmStageSummary)?.time}
                  </div>
                </div>
              </div>
            ) : (
              <div className="style-smart-stage-modal__summary">
                <div className="style-smart-stage-modal__score">
                  <span>{selectedStage.stage.progress}%</span>
                  <Progress
                    percent={selectedStage.stage.progress}
                    showInfo={false}
                    size="small"
                    strokeColor="#2d7ff9"
                  />
                </div>
                <div className="style-smart-stage-modal__meta">
                  <Tag color={selectedStageTag.color}>{selectedStageTag.text}</Tag>
                  <div className="style-smart-stage-modal__helper">{selectedStage.stage.helper}</div>
                  <div className="style-smart-stage-modal__time">{selectedStage.stage.timeLabel}</div>
                </div>
              </div>
            )}
            <div className="style-smart-stage-modal__insight">{selectedStageInsightText}</div>
            <div className="style-smart-stage-modal__actions">
              {selectedStageActions.map((action) => (
                <Button
                  key={action.key}
                  type={action.type}
                  danger={action.danger}
                  disabled={action.disabled}
                  loading={(sampleActionLoading && ['receive-sample', 'update-progress'].includes(action.key)) || (reviewSaving && action.key === 'review')}
                  onClick={action.onClick}
                >
                  {action.label}
                </Button>
              ))}
            </div>
            {selectedStage.stage.key !== 'sample' && selectedStage.stage.key !== 'confirm' ? (
              <div className="style-smart-stage-modal__details">
                {selectedStage.stage.details.map((item) => (
                  <div key={item} className="style-smart-stage-modal__detail-item">
                    {item}
                  </div>
                ))}
              </div>
            ) : null}
            {selectedStage.stage.key === 'sample' ? (
              <div className="style-smart-stage-modal__panel">
                <div className="style-smart-stage-modal__panel-title">样衣生产信息</div>
                {sampleSnapshotLoading ? (
                  <Skeleton active paragraph={{ rows: 4 }} />
                ) : sampleSnapshot ? (
                  <>
                    <div className="style-smart-stage-modal__facts">
                      <div className="style-smart-stage-modal__fact">
                        <span>领取人</span>
                        <strong>{sampleReceiverLabel}</strong>
                      </div>
                      <div className="style-smart-stage-modal__fact">
                        <span>领取时间</span>
                        <strong>{sampleReceiveTimeLabel}</strong>
                      </div>
                      <div className="style-smart-stage-modal__fact">
                        <span>完成时间</span>
                        <strong>{sampleCompletedTimeLabel}</strong>
                      </div>
                    </div>
                    {shouldShowSampleStageProgress ? (
                      <div style={{ marginTop: '16px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                          <span style={{ fontSize: '14px', fontWeight: 500 }}>样衣生产进度</span>
                          <span style={{ fontSize: '14px', fontWeight: 600, color: '#2d7ff9' }}>
                            {Math.round(sampleStageProgressItems.reduce((sum, item) => sum + item.percent, 0) / sampleStageProgressItems.length)}%
                          </span>
                        </div>
                        <Progress
                          percent={Math.round(sampleStageProgressItems.reduce((sum, item) => sum + item.percent, 0) / sampleStageProgressItems.length)}
                          showInfo={false}
                          size={8}
                          strokeColor={sampleStageProgressItems.reduce((sum, item) => sum + item.percent, 0) / sampleStageProgressItems.length >= 100 ? '#52c41a' : '#2d7ff9'}
                        />
                      </div>
                    ) : (
                      <div className="style-smart-stage-modal__empty">尚未领取，暂无节点进度</div>
                    )}
                  </>
                ) : (
                  <div className="style-smart-stage-modal__empty">当前还没有同步到样衣生产快照数据</div>
                )}
              </div>
            ) : null}
            {selectedStage.stage.key === 'confirm' ? (
              <div className="style-smart-stage-modal__panel">
                <div className="style-smart-stage-modal__panel-title">审核 / 入库信息</div>
                <div className="style-smart-stage-modal__facts">
                  <div className="style-smart-stage-modal__fact">
                    <span>审核状态</span>
                    <strong>{confirmReviewStatusLabel}</strong>
                  </div>
                  <div className="style-smart-stage-modal__fact">
                    <span>审核人</span>
                    <strong>{confirmReviewerLabel}</strong>
                  </div>
                  <div className="style-smart-stage-modal__fact">
                    <span>审核时间</span>
                    <strong>{confirmReviewTimeLabel}</strong>
                  </div>
                  <div className="style-smart-stage-modal__fact">
                    <span>入库时间</span>
                    <strong>{confirmInboundTimeLabel}</strong>
                  </div>
                </div>
                {(selectedStage.record.sampleReviewComment || selectedStage.stage.details.length > 0) ? (
                  <div className="style-smart-stage-modal__details style-smart-stage-modal__details--compact">
                    {selectedStage.record.sampleReviewComment ? (
                      <div className="style-smart-stage-modal__detail-item">
                        审核意见：{String(selectedStage.record.sampleReviewComment)}
                      </div>
                    ) : null}
                    {!selectedStage.record.sampleReviewComment && selectedStage.stage.details.map((item) => (
                      <div key={item} className="style-smart-stage-modal__detail-item">
                        {item}
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}
      </Modal>

      <SmallModal
        open={progressEditorOpen}
        title="更新样衣进度"
        onCancel={() => setProgressEditorOpen(false)}
        onOk={() => void handleSaveSampleProgress()}
        okText="保存进度"
        confirmLoading={sampleActionLoading}
      >
        <div className="style-smart-progress-editor">
          {SAMPLE_PARENT_STAGES.map((item) => (
            <div key={item.key} className="style-smart-progress-editor__row">
              <div className="style-smart-progress-editor__label">{item.label}</div>
              <InputNumber
                min={0}
                max={100}
                value={progressDraft[item.key] ?? 0}
                onChange={(value) => setProgressDraft((prev) => ({
                  ...prev,
                  [item.key]: clampPercent(Number(value || 0)),
                }))}
              />
            </div>
          ))}
        </div>
      </SmallModal>

      <SmallModal
        open={reviewModalOpen}
        title="记录样衣审核结论"
        onCancel={() => setReviewModalOpen(false)}
        onOk={() => void handleSaveReview()}
        okText="保存结论"
        confirmLoading={reviewSaving}
      >
        <Form form={reviewForm} layout="vertical">
          <Form.Item
            name="reviewStatus"
            label="审核结论"
            rules={[{ required: true, message: '请选择审核结论' }]}
          >
            <Select options={REVIEW_STATUS_OPTIONS} placeholder="请选择审核结论" />
          </Form.Item>
          <Form.Item
            name="reviewComment"
            label="审核意见"
          >
            <Input.TextArea rows={4} placeholder="可填写审核意见或返修要求" />
          </Form.Item>
        </Form>
      </SmallModal>
    </>
  );
};

export default StyleTableView;
