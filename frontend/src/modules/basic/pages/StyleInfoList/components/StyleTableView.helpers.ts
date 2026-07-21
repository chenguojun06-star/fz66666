import dayjs from 'dayjs';
import { StyleInfo } from '@/types/style';
import { getStyleSourceMeta } from '@/utils/styleSource';
import { getFieldValue, renderCellValue } from '@/hooks/useExtColumns';
import type { FieldConfigItem } from '@/hooks/useFieldConfig';
import {
  SmartStage, StageQuickAction, StyleRecord,
  CATEGORY_MAP, SEASON_MAP, STAGE_MIN_SLOT_WIDTH,
  buildConfirmStage, isScrappedStyle, resolveDisplayColor, resolveDisplaySize, resolveDisplayQuantity,
  buildSmartStages, isMaintainedAfterCompletion, getDeliveryMeta,
  clampPercent, isStyleInfoCompleted,
} from './styleTableViewUtils';

// ── Types ──────────────────────────────────────────────

export interface CategoryOption {
  label: string;
  value: string;
}

export interface StyleTableRowData {
  deliveryMeta: ReturnType<typeof getDeliveryMeta>;
  maintainedAfterCompletion: boolean;
  metaItems: { label: string; value: string }[];
  overallProgress: number;
  progressNode: string;
  record: StyleInfo;
  rowState: string;
  stages: SmartStage[];
  rowKey: string;
  timelineMinWidth: number;
  trackInset: string;
  progressWidth: string;
}

// ── 字典转换 ─────────────────────────────────────────────

export const toCategoryCn = (value: unknown, categoryOptions?: CategoryOption[]) => {
  const code = String(value || '').trim().toUpperCase();
  if (!code) return '-';
  if (categoryOptions && categoryOptions.length > 0) {
    const found = categoryOptions.find(opt => opt.value === code);
    if (found) return found.label;
  }
  return CATEGORY_MAP[code] ?? '未知';
};

export const toSeasonCn = (value: unknown) => {
  const code = String(value || '').trim().toUpperCase();
  if (!code) return '-';
  return SEASON_MAP[code] ?? '未知';
};

// ── 状态判定 ─────────────────────────────────────────────

export const isStageDoneRow = (record: StyleInfo) => {
  return buildConfirmStage(record as StyleRecord)?.status === 'done';
};

export const hasPushedOrder = (record: StyleInfo) => Boolean((record as Record<string, unknown>).pushedToOrder);

export const isScrappedRow = (record: StyleInfo) => isScrappedStyle(record);

// ── 行数据构建 ───────────────────────────────────────────

export interface BuildRowDataOptions {
  stockStateMap: Record<string, boolean>;
  categoryOptions?: CategoryOption[];
  customFields: FieldConfigItem[];
  dateSortAsc: boolean;
}

export const buildRowData = (data: StyleInfo[], options: BuildRowDataOptions): StyleTableRowData[] => {
  const { stockStateMap, categoryOptions, customFields, dateSortAsc } = options;
  const mapped = data.map((record) => {
    const stockKey = `${String((record as StyleRecord).styleNo || '').trim().toUpperCase()}|${resolveDisplayColor(record as StyleRecord).trim().toUpperCase()}`;
    const normalizedRecord = stockStateMap[stockKey]
      ? { ...(record as StyleRecord), latestPatternStatus: 'COMPLETED' }
      : record;
    const sourceMeta = getStyleSourceMeta(record);
    const progressNode = String((normalizedRecord as StyleRecord).progressNode || '未开始').trim() || '未开始';
    const stages = buildSmartStages(normalizedRecord as StyleInfo);
    const allStagesCompleted = stages.length > 0 && stages.every((item) => item.status === 'done');
    const completed = allStagesCompleted || isStyleInfoCompleted(normalizedRecord as StyleRecord);
    const maintainedAfterCompletion = isMaintainedAfterCompletion(normalizedRecord as StyleRecord, completed);
    const deliveryMeta = getDeliveryMeta(normalizedRecord as StyleRecord, completed);
    const baseProgress = clampPercent(
      stages.reduce((sum, item) => sum + item.progress, 0) / Math.max(stages.length, 1),
    );
    const overallProgress = completed ? 100 : baseProgress;
    const rowState = isScrappedRow(record) ? 'scrapped' : deliveryMeta.tone;
    const metaItems = [
      { label: '来源', value: sourceMeta.label },
      { label: '品类', value: toCategoryCn(record.category, categoryOptions) },
      { label: '季节', value: toSeasonCn(record.season) },
      { label: '颜色', value: resolveDisplayColor(record as StyleRecord) || '-' },
      { label: '码数', value: resolveDisplaySize(record as StyleRecord) || '-' },
      { label: '数量', value: `${resolveDisplayQuantity(record as StyleRecord) || '0'} 件` },
      { label: '交板', value: record.deliveryDate ? dayjs(record.deliveryDate).format('YYYY-MM-DD') : '-' },
      { label: '客户', value: String((record as StyleRecord).customer || '-') },
      // 自定义字段（来自字段配置 isSystem=0）
      ...customFields.map(f => {
        const raw = getFieldValue(record, f.fieldKey);
        const node = renderCellValue(raw, f.fieldType);
        const text = node === '-' || node === undefined || node === null ? '-' : String(node);
        return { label: f.label, value: text };
      }),
    ].filter((item) => item.value && item.value !== '-');

    const timelineMinWidth = stages.length * STAGE_MIN_SLOT_WIDTH;
    const trackInset = `calc((100% / ${stages.length}) / 2)`;
    const progressWidth = stages.length > 1
      ? `calc((100% - ((${trackInset}) * 2)) * ${overallProgress / 100})`
      : '0px';

    return {
      deliveryMeta,
      maintainedAfterCompletion,
      metaItems,
      overallProgress,
      progressNode,
      record: normalizedRecord as StyleInfo,
      rowState,
      stages,
      rowKey: String(record.id || record.styleNo || '').trim(),
      timelineMinWidth,
      trackInset,
      progressWidth,
    };
  });

  // 报废 > 已完成 > 进行中，各组内按日期排序（报废始终最后，不受日期方向影响）
  mapped.sort((a, b) => {
    const aPriority = isScrappedStyle(a.record) ? 2 : a.overallProgress >= 100 ? 1 : 0;
    const bPriority = isScrappedStyle(b.record) ? 2 : b.overallProgress >= 100 ? 1 : 0;
    if (aPriority !== bPriority) return aPriority - bPriority;
    // 同组内按时间排序
    const aTime = new Date((a.record.updatedAt || a.record.createdAt || 0) as string | number).getTime();
    const bTime = new Date((b.record.updatedAt || b.record.createdAt || 0) as string | number).getTime();
    return dateSortAsc ? aTime - bTime : bTime - aTime;
  });

  return mapped;
};

// ── 操作按钮构建 ─────────────────────────────────────────

export interface BuildActionButtonsCallbacks {
  navigate: (path: string) => void;
  onPrint: (record: StyleInfo) => void;
  onScrap: (id: string) => void;
  onMaintenance: (record: StyleInfo) => void;
  setRemarkTarget: (target: { open: boolean; styleNo: string; defaultRole?: string }) => void;
  setCopySource: (record: StyleInfo | null) => void;
  setCopyModalOpen: (open: boolean) => void;
}

/**
 * 构建行操作按钮列表。
 * 三种场景：已报废 / 已完成 / 进行中，按钮组合不同。
 */
export const buildActionButtons = (
  record: StyleInfo,
  isSupervisorOrAbove: boolean,
  callbacks: BuildActionButtonsCallbacks,
): StageQuickAction[] => {
  if (isScrappedRow(record)) {
    return [
      { key: 'detail', label: '详情', type: 'primary', onClick: () => callbacks.navigate(`/style-info/${record.id}`) },
      { key: 'print', label: '打印', type: 'default', onClick: () => callbacks.onPrint(record) },
      { key: 'remark', label: '备注', type: 'default', onClick: () => callbacks.setRemarkTarget({ open: true, styleNo: (record as Record<string, unknown>).styleNo as string || '' }) },
    ];
  }

  if (isStageDoneRow(record)) {
    const items: StageQuickAction[] = [
      { key: 'detail', label: '详情', type: 'primary', onClick: () => callbacks.navigate(`/style-info/${record.id}`) },
      hasPushedOrder(record)
        ? { key: 'order-view', label: '生产订单', type: 'default', onClick: () => callbacks.navigate(`/production?keyword=${encodeURIComponent(((record as Record<string, unknown>).orderNo as string) || (record as Record<string, unknown>).styleNo as string || '')}`) }
        : { key: 'order-push', label: '资料推送', type: 'default', onClick: () => callbacks.navigate(`/style-info/${record.id}`) },
      { key: 'print', label: '打印', type: 'default', onClick: () => callbacks.onPrint(record) },
    ];

    if (isSupervisorOrAbove) {
      items.push({ key: 'maintenance', label: '维护', type: 'default', onClick: () => callbacks.onMaintenance(record) });
    }
    items.push({ key: 'copy', label: '复制', type: 'default', onClick: () => { callbacks.setCopySource(record); callbacks.setCopyModalOpen(true); } });
    items.push({ key: 'remark', label: '备注', type: 'default', onClick: () => callbacks.setRemarkTarget({ open: true, styleNo: (record as Record<string, unknown>).styleNo as string || '' }) });

    return items;
  }

  return [
    { key: 'detail', label: '详情', type: 'primary', onClick: () => callbacks.navigate(`/style-info/${record.id}`) },
    { key: 'print', label: '打印', type: 'default', onClick: () => callbacks.onPrint(record) },
    { key: 'scrap', label: '报废', type: 'default', danger: true, onClick: () => callbacks.onScrap(String(record.id!)) },
    { key: 'copy', label: '复制', type: 'default', onClick: () => { callbacks.setCopySource(record); callbacks.setCopyModalOpen(true); } },
    { key: 'remark', label: '备注', type: 'default', onClick: () => callbacks.setRemarkTarget({ open: true, styleNo: (record as Record<string, unknown>).styleNo as string || '' }) },
  ];
};
