import dayjs from 'dayjs';
import { StyleInfo } from '@/types/style';
import { getStyleCardColorText, getStyleCardQuantityText, getStyleCardSizeText } from '@/utils/cardSizeQuantity';
import { DeliveryTone, PatternProductionSnapshot, SmartStage, StyleRecord } from './styleTableViewUtils.types';
import { SAMPLE_PARENT_STAGES, SAMPLE_PROGRESS_NODE_ALIASES } from './styleTableViewUtils.constants';

// ── Unified Completion Check ───────────────────────────

export const isStyleInfoCompleted = (record: StyleRecord | Partial<StyleInfo> | null | undefined): boolean => {
  if (!record) return false;

  // 样衣完成唯一权威判定：sampleStatus=COMPLETED 或 sampleCompletedTime 存在
  // 后端只有 StyleStageHelper.completeSample（前置校验通过后）才会设置这两个字段
  // 其他条件（审核通过/6阶段完成/progressNode）都不算完成，避免款号被误判完成而从列表消失
  const sampleStatus = String((record as StyleRecord).sampleStatus || '').trim().toUpperCase();
  const sampleCompletedTime = (record as StyleRecord).sampleCompletedTime;
  if (sampleStatus === 'COMPLETED' || sampleStatus === 'DONE') return true;
  if (sampleCompletedTime) return true;

  return false;
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
  if (!value) return '待领取';
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

  if (!valid.length) return '待领取';
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
  if (start !== '待领取' && end !== '待领取') {
    const startInstance = dayjs(startTime as string | number | Date | null | undefined);
    const endInstance = dayjs(endTime as string | number | Date | null | undefined);
    if (startInstance.isValid() && endInstance.isValid() && startInstance.isSame(endInstance, 'day')) {
      return start;
    }
    return `${start} → ${end}`;
  }
  return end !== '待领取' ? end : start;
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
      ? `${createdLabel} → ${completedLabel}`
      : completedLabel
        ? completedLabel
        : '完成';
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
  if (stage.status === 'done') return { color: 'success' as const, text: '完成' };
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

  const rawColors = item.colors;
  let colors: string[] = [];
  if (Array.isArray(rawColors)) {
    colors = rawColors.map(String).filter(Boolean);
  } else if (typeof rawColors === 'string' && rawColors.trim()) {
    try { colors = JSON.parse(rawColors); } catch { colors = []; }
  }

  if (colors.length === 0 && item.sizeColorConfig && typeof item.sizeColorConfig === 'string') {
    try {
      const config = JSON.parse(item.sizeColorConfig as string);
      if (Array.isArray(config.colors)) {
        colors = config.colors.map(String).filter(Boolean);
      } else if (Array.isArray(config.matrixRows)) {
        const colorSet = new Set<string>();
        for (const row of config.matrixRows as any[]) {
          if (row && row.color) colorSet.add(String(row.color));
        }
        colors = Array.from(colorSet);
      }
    } catch (e) { console.error('[styleTableViewUtils] 解析颜色矩阵失败:', e); }
  }

  if (colors.length === 0 && item.color && typeof item.color === 'string') {
    const c = String(item.color).trim();
    if (c) colors = [c];
  }

  let sizeColorConfig: string | undefined;
  if (typeof item.sizeColorConfig === 'string') {
    sizeColorConfig = item.sizeColorConfig;
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
    productionOrderId: item.productionOrderId ? String(item.productionOrderId) : undefined,
    color: item.color ? String(item.color) : undefined,
    quantity: item.quantity != null ? Number(item.quantity) : undefined,
    colors,
    sizeColorConfig,
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
    timeLabel: stage.timeLabel === '待领取' ? '已停止' : stage.timeLabel,
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
    if (snapshot.status === 'IN_PROGRESS') return `已由 ${snapshot.receiver || '领取人'} 领取，系统正在跟踪工序推进与完工节奏。`;
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
  if (stage.status === 'active') return '当前环节正在推进，建议优先跟踪领取人与关键时间。';
  return '当前环节尚未启动，可从快捷动作直接进入处理。';
};
