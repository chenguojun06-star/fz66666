import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { App, Button, Empty, Form, Input, InputNumber, Modal, Pagination, Popover, Progress, Select, Skeleton, Tag } from 'antd';
import dayjs from 'dayjs';
import { SMART_CARD_OVERLAY_WIDTH } from '@/components/common/DecisionInsightCard';
import AttachmentThumb from '../components/AttachmentThumb';
import StyleDevelopmentWorkbench from './StyleDevelopmentWorkbench';
import SmartStyleHoverCard from './SmartStyleHoverCard';
import { StyleInfo } from '@/types/style';
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

type StageStatus = 'done' | 'active' | 'waiting' | 'risk';
type DeliveryTone = 'normal' | 'warning' | 'danger' | 'success';
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
const STYLE_COMPLETION_FIELDS = [
  'bomCompletedTime',
  'patternCompletedTime',
  'sizeCompletedTime',
  'processCompletedTime',
  'productionCompletedTime',
  'secondaryCompletedTime',
] as const;

const clampPercent = (value: number) => Math.max(0, Math.min(100, Math.round(value)));

const parseSizeColorConfig = (raw: unknown): { sizes: string[]; colors: string[]; quantities: number[] } => {
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw || '{}') : (raw || {});
    return {
      sizes: Array.isArray((parsed as any)?.sizes) ? (parsed as any).sizes.map((item: unknown) => String(item || '').trim()).filter(Boolean) : [],
      colors: Array.isArray((parsed as any)?.colors) ? (parsed as any).colors.map((item: unknown) => String(item || '').trim()).filter(Boolean) : [],
      quantities: Array.isArray((parsed as any)?.quantities) ? (parsed as any).quantities.map((item: unknown) => Number(item || 0)) : [],
    };
  } catch {
    return { sizes: [], colors: [], quantities: [] };
  }
};

const buildConfiguredSpecPairs = (record: StyleRecord) => {
  const config = parseSizeColorConfig(record.sizeColorConfig);
  const directColor = String(record.color || '').trim() || config.colors.find(Boolean) || '';
  const parsed = typeof record.sizeColorConfig === 'string' ? (() => {
    try {
      return JSON.parse(record.sizeColorConfig || '{}') as { matrixRows?: Array<{ color?: string; quantities?: unknown[] }>; sizes?: string[] };
    } catch {
      return {};
    }
  })() : ((record.sizeColorConfig as { matrixRows?: Array<{ color?: string; quantities?: unknown[] }>; sizes?: string[] }) || {});
  const matrixSizes = Array.isArray(parsed?.sizes)
    ? parsed.sizes.map((item) => String(item || '').trim()).filter(Boolean)
    : config.sizes;
  const matrixRows = Array.isArray(parsed?.matrixRows) ? parsed.matrixRows : [];
  const matrixPairs = matrixRows.flatMap((row) => {
    const rowColor = String(row?.color || '').trim();
    const quantities = Array.isArray(row?.quantities) ? row.quantities : [];
    return matrixSizes
      .map((size, index) => ({
        color: rowColor,
        size,
        quantity: Number(quantities[index] || 0),
      }))
      .filter((item) => item.color && item.size && item.quantity > 0);
  });
  if (matrixPairs.length) {
    return matrixPairs;
  }

  const topLevelPairs = config.sizes
    .map((size, index) => ({
      color: directColor,
      size,
      quantity: Number(config.quantities[index] || 0),
    }))
    .filter((item) => item.size && item.quantity > 0);
  if (topLevelPairs.length) {
    return topLevelPairs;
  }

  const fallbackSizes = String(record.size || '')
    .split(/[/,，\s]+/)
    .map((item) => item.trim())
    .filter(Boolean);
  const fallbackQuantity = Number(record.sampleQuantity || 0);
  if (directColor && fallbackSizes.length === 1 && fallbackQuantity > 0) {
    return [{ color: directColor, size: fallbackSizes[0], quantity: fallbackQuantity }];
  }

  return [];
};

const resolveDisplayColor = (record: StyleRecord) => {
  const pairs = buildConfiguredSpecPairs(record);
  if (pairs.length) {
    return Array.from(new Set(pairs.map((item) => item.color).filter(Boolean))).join(' / ');
  }
  return '';
};

const resolveDisplaySize = (record: StyleRecord) => {
  const pairs = buildConfiguredSpecPairs(record);
  if (pairs.length) {
    return pairs.map((item) => item.size).join(' / ');
  }
  return '';
};

const resolveDisplayQuantity = (record: StyleRecord) => {
  const pairs = buildConfiguredSpecPairs(record);
  if (pairs.length) {
    return pairs.map((item) => `${item.quantity}`).join(' / ');
  }
  return '';
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
  const preferred = [
    record.sampleCompletedTime,
    record.completedTime,
    ...STYLE_COMPLETION_FIELDS.map((field) => record[field]),
  ];
  const valid = preferred
    .map((value) => dayjs(value as string | number | Date | null | undefined))
    .filter((value) => value.isValid())
    .sort((a, b) => b.valueOf() - a.valueOf());

  return valid.length ? valid[0] : null;
};

const isStyleCompleted = (record: StyleRecord) => {
  const sampleStatus = String(record.sampleStatus || '').trim().toUpperCase();
  const progressNode = String(record.progressNode || '').trim();
  const latestPatternStatus = String(record.latestPatternStatus || '').trim().toUpperCase();
  const completedStageCount = STYLE_COMPLETION_FIELDS.filter((field) => Boolean(record[field])).length;

  return sampleStatus === 'COMPLETED'
    || latestPatternStatus === 'COMPLETED'
    || progressNode === '样衣完成'
    || Boolean(record.sampleCompletedTime)
    || Boolean(record.completedTime)
    || completedStageCount === STYLE_COMPLETION_FIELDS.length;
};

const getDeliveryMeta = (record: StyleRecord): { tone: DeliveryTone; label: string } => {
  if (isStyleCompleted(record)) {
    const completedTime = getStyleCompletedTime(record);
    return {
      tone: 'success',
      label: completedTime ? `${completedTime.format('MM-DD')} 已完成` : '已完成',
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

const getProgressNodeColor = (node: string) => {
  if (/报废|驳回|不通过|异常|失败/.test(node)) return 'error';
  if (/返修|紧急/.test(node)) return 'warning';
  if (/完成|通过/.test(node)) return 'success';
  if (/中|待审|确认/.test(node)) return 'processing';
  return 'default';
};

const resolveStageTag = (status: StageStatus) => {
  if (status === 'done') return { color: 'success' as const, text: '已完成' };
  if (status === 'active') return { color: 'processing' as const, text: '进行中' };
  if (status === 'risk') return { color: 'error' as const, text: '风险中' };
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
    reviewStatus: String(item.reviewStatus || ''),
    reviewTime: formatNodeTime(item.reviewTime),
    procurementProgress: clampPercent(Number((item.procurementProgress as Record<string, unknown> | undefined)?.percent || 0)),
    progressNodes,
  };
};

const buildStageInsight = (stage: SmartStage, snapshot: PatternProductionSnapshot | null) => {
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
    timeLabel: formatNodeTime(patternDone ? record.patternCompletedTime : record.patternStartTime),
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
    timeLabel: formatNodeTime(done ? record.sizePriceCompletedTime : record.sizePriceStartTime),
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
    timeLabel: formatNodeTime(done ? record.secondaryCompletedTime : record.secondaryStartTime),
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
  const sampleProgress = clampPercent(Number(record.sampleProgress || 0));
  const done = Boolean(record.productionCompletedTime);
  const started = done || sampleProgress > 0 || /样衣/.test(progressNode) || Boolean(record.productionStartTime);

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
    timeLabel: formatNodeTime(done ? record.productionCompletedTime : record.productionStartTime),
    status: done ? 'done' : started ? 'active' : 'waiting',
    progress: done ? 100 : sampleProgress > 0 ? sampleProgress : started ? 36 : 0,
    actionKey: 'detail',
    actionLabel: '查看详情',
    details: buildStageDetails(
      record.productionAssignee ? `负责人：${String(record.productionAssignee)}` : false,
      record.productionStartTime ? `领取时间：${dayjs(record.productionStartTime as string | number | Date).format('YYYY-MM-DD HH:mm')}` : '领取时间待更新',
      done && record.productionCompletedTime ? `完成时间：${dayjs(record.productionCompletedTime as string | number | Date).format('YYYY-MM-DD HH:mm')}` : false,
      `当前进度：${done ? 100 : sampleProgress}%`
    ),
  };
};

const buildConfirmStage: StageBuilder = (record) => {
  const progressNode = String(record.progressNode || '').trim();
  const reviewStatus = String(record.sampleReviewStatus || '').trim().toUpperCase();
  const latestPatternStatus = String(record.latestPatternStatus || '').trim().toUpperCase();
  const reviewPassed = reviewStatus === 'PASS';
  const inboundCompleted = latestPatternStatus === 'COMPLETED';
  const done = inboundCompleted;
  const risk = ['REJECT', 'REWORK'].includes(reviewStatus) || progressNode === '开发样报废';
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
    timeLabel: formatNodeTime(done ? (record.completedTime || record.sampleReviewTime) : (record.sampleReviewTime || record.sampleCompletedTime)),
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
  .map((builder) => builder(record as StyleRecord))
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

  const hasPushedOrder = (record: StyleInfo) => Boolean(String((record as any).orderNo || '').trim());

  const isScrappedRow = (record: StyleInfo) => {
    return String(record.status || '').trim().toUpperCase() === 'SCRAPPED'
      || String((record as any).progressNode || '').trim() === '开发样报废';
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
      const deliveryMeta = getDeliveryMeta(record);
      const sourceMeta = getStyleSourceMeta(record);
      const progressNode = String((normalizedRecord as StyleRecord).progressNode || '未开始').trim() || '未开始';
      const stages = buildSmartStages(normalizedRecord as StyleInfo);
      const baseProgress = clampPercent(
        stages.reduce((sum, item) => sum + item.progress, 0) / Math.max(stages.length, 1),
      );
      const overallProgress = stages.some((item) => item.key === 'confirm' && item.status === 'done') ? 100 : baseProgress;
      const rowState = isScrappedRow(record) ? 'danger' : deliveryMeta.tone;
      const metaItems = [
        { label: '品类', value: toCategoryCn(record.category) },
        { label: '季节', value: toSeasonCn(record.season) },
        { label: '颜色', value: resolveDisplayColor(record as StyleRecord) || '-' },
        { label: '来源', value: sourceMeta.label },
        { label: '码数', value: resolveDisplaySize(record as StyleRecord) || '-' },
        { label: '数量', value: `${resolveDisplayQuantity(record as StyleRecord) || '0'} 件` },
        { label: '交板', value: record.deliveryDate ? dayjs(record.deliveryDate).format('YYYY-MM-DD') : '-' },
        { label: '客户', value: String((record as StyleRecord).customer || '-') },
      ].filter((item) => item.value && item.value !== '-');

      return {
        deliveryMeta,
        metaItems,
        overallProgress,
        progressNode,
        record: normalizedRecord as StyleInfo,
        rowState,
        stages,
      };
    });
  }, [categoryOptions, data, stockStateMap]);

  const selectedStageTag = selectedStage ? resolveStageTag(selectedStage.stage.status) : null;
  const selectedStageInsight = selectedStage ? buildStageInsight(selectedStage.stage, sampleSnapshot) : '';
  const isSampleStageDone = useMemo(() => {
    if (!selectedStage || selectedStage.stage.key !== 'sample') return false;
    return selectedStage.stage.status === 'done'
      || selectedStage.stage.progress >= 100
      || Boolean((selectedStage.record as StyleRecord).productionCompletedTime);
  }, [selectedStage]);

  const isSampleSnapshotCompleted = useMemo(() => {
    if (!sampleSnapshot) return false;
    const status = String(sampleSnapshot.status || '').trim().toUpperCase();
    return ['PRODUCTION_COMPLETED', 'COMPLETED'].includes(status);
  }, [sampleSnapshot]);

  const sampleCompletedTimeLabel = useMemo(() => {
    if (!selectedStage || selectedStage.stage.key !== 'sample') return '待启动';
    if (sampleSnapshot?.completeTime && sampleSnapshot.completeTime !== '待启动') return sampleSnapshot.completeTime;
    return formatNodeTime((selectedStage.record as StyleRecord).productionCompletedTime);
  }, [sampleSnapshot, selectedStage]);

  const sampleStageProgressItems = useMemo(() => {
    if (!sampleSnapshot) return [];

    return SAMPLE_PARENT_STAGES.map((item) => ({
      key: item.key,
      label: item.label,
      percent: isSampleStageDone || isSampleSnapshotCompleted
        ? 100
        : item.key === 'procurement'
          ? sampleSnapshot.procurementProgress
          : clampPercent(Number(sampleSnapshot.progressNodes[item.key] || 0)),
    }));
  }, [isSampleSnapshotCompleted, isSampleStageDone, sampleSnapshot]);

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

    if (selected.stage.actionKey && selected.stage.actionKey !== 'detail') {
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

    if (selected.stage.key === 'sample') {
      if (sampleSnapshot?.status === 'PENDING' || !sampleSnapshot?.receiveTime || sampleSnapshot.receiveTime === '待启动') {
        actions.push({
          key: 'receive-sample',
          label: '领取生产',
          type: 'primary',
          onClick: () => {
            void handleReceiveSample();
          },
        });
      }

      actions.push({
        key: 'update-progress',
        label: '更新进度',
        onClick: () => setProgressEditorOpen(true),
      });

      if (selected.record.sampleCompletedTime) {
        actions.push({
          key: 'review',
          label: selected.record.sampleReviewStatus ? '修改审核结论' : '记录审核结论',
          type: selected.record.sampleReviewStatus ? 'default' : 'primary',
          onClick: handleOpenReviewModal,
        });
      }
    }

    if (selected.stage.key === 'confirm') {
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

    if (selected.stage.key === 'confirm' && String(selected.record.sampleReviewStatus || '').trim().toUpperCase() === 'PASS') {
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
    if (selected.stage.status !== 'done') {
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
        rows.map(({ deliveryMeta, metaItems, overallProgress, progressNode, record, rowState, stages }) => {
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
                  : { key: 'order-push', label: '下单', type: 'default' as const, onClick: () => navigate(withQuery('/order-management', { styleNo: (record as any).styleNo })) },
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
                      {record.maintenanceRemark ? <Tag color="gold">已维护</Tag> : null}
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
                        <span className={`style-smart-row__delivery style-smart-row__delivery--${deliveryMeta.tone}`}>
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
                      <Progress percent={overallProgress} showInfo={false} size="small" strokeColor="#2d7ff9" />
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
        <Pagination
          current={currentPage}
          pageSize={pageSize}
          total={total}
          showTotal={(value) => `共 ${value} 条`}
          showSizeChanger
          showQuickJumper
          pageSizeOptions={['10', '20', '50', '100']}
          onChange={onPageChange}
        />
      </div>
      </div>

      <Modal
        open={Boolean(selectedStage)}
        title={selectedStage ? `${selectedStage.record.styleNo} · ${selectedStage.stage.label}` : ''}
        onCancel={() => setSelectedStage(null)}
        width={760}
        footer={selectedStage ? [
          <Button key="close" onClick={() => setSelectedStage(null)}>
            关闭
          </Button>,
        ] : null}
      >
        {selectedStage && selectedStageTag ? (
          <div className="style-smart-stage-modal">
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
            <div className="style-smart-stage-modal__insight">{selectedStageInsight}</div>
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
            <div className="style-smart-stage-modal__details">
              {selectedStage.stage.details.map((item) => (
                <div key={item} className="style-smart-stage-modal__detail-item">
                  {item}
                </div>
              ))}
            </div>
            {selectedStage.stage.key === 'sample' ? (
              <div className="style-smart-stage-modal__panel">
                <div className="style-smart-stage-modal__panel-title">样衣生产快照</div>
                {sampleSnapshotLoading ? (
                  <Skeleton active paragraph={{ rows: 4 }} />
                ) : sampleSnapshot ? (
                  <>
                    <div className="style-smart-stage-modal__facts">
                      <div className="style-smart-stage-modal__fact">
                        <span>领取人</span>
                        <strong>{sampleSnapshot.receiver || '-'}</strong>
                      </div>
                      <div className="style-smart-stage-modal__fact">
                        <span>下板时间</span>
                        <strong>{sampleSnapshot.releaseTime}</strong>
                      </div>
                      <div className="style-smart-stage-modal__fact">
                        <span>领取时间</span>
                        <strong>{sampleSnapshot.receiveTime}</strong>
                      </div>
                      <div className="style-smart-stage-modal__fact">
                        <span>完成时间</span>
                        <strong>{sampleCompletedTimeLabel}</strong>
                      </div>
                    </div>
                    <div className="style-smart-stage-modal__processes">
                      {sampleStageProgressItems.map((item) => (
                        <div key={item.key} className="style-smart-stage-modal__process-item">
                          <div className="style-smart-stage-modal__process-head">
                            <span>{item.label}</span>
                            <strong>{item.percent}%</strong>
                          </div>
                          <Progress percent={item.percent} showInfo={false} size="small" strokeColor="#2d7ff9" />
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <div className="style-smart-stage-modal__empty">当前还没有同步到样衣生产快照数据</div>
                )}
              </div>
            ) : null}
          </div>
        ) : null}
      </Modal>

      <Modal
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
      </Modal>

      <Modal
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
      </Modal>
    </>
  );
};

export default StyleTableView;
