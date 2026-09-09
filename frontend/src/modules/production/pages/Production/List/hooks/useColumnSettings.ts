import { useState, useEffect, useRef, useCallback } from 'react';
import { userPreferenceApi } from '@/services/system/userPreferenceApi';

// === 列显示/隐藏配置 ===

/** 默认显示的核心列（=「标准」预设） */
export const defaultVisibleColumns: Record<string, boolean> = {
  styleCover: true,
  styleNo: true,
  skc: false,
  styleName: true,
  category: false,
  companyName: false,
  attachments: false,
  factoryName: true,
  merchandiser: false,
  patternMaker: false,
  orderQuantity: true,
  factoryUnitPrice: false,
  orderOperatorName: false,
  createTime: false,
  expectedShipDate: false,
  procurementSummary: true,
  cuttingSummary: true,
  secondaryProcessSummary: false,
  carSewingSummary: true,
  tailProcessSummary: true,
  cuttingQuantity: false,
  cuttingBundleCount: false,
  completedQuantity: false,
  warehousingQualifiedQuantity: true,
  unqualifiedQuantity: false,
  repairQuantity: false,
  inStockQuantity: false,
  status: true,
};

/** 「精简」预设：只看是谁、多少、什么时候交 */
export const simpleVisibleColumns: Record<string, boolean> = {
  styleCover: true,
  styleNo: true,
  styleName: false,
  companyName: true,
  factoryName: true,
  orderQuantity: true,
  status: true,
  procurementSummary: false,
  cuttingSummary: false,
  carSewingSummary: false,
  tailProcessSummary: false,
  warehousingQualifiedQuantity: false,
};

/** 列设置选项 */
export const columnOptions = [
  { key: 'styleCover', label: '图片' },
  { key: 'styleNo', label: '款号' },
  { key: 'styleName', label: '款名' },
  { key: 'category', label: '商品分类' },
  { key: 'companyName', label: '客户' },
  { key: 'attachments', label: '附件' },
  { key: 'factoryName', label: '加工厂' },
  { key: 'merchandiser', label: '跟单员' },
  { key: 'patternMaker', label: '版师' },
  { key: 'orderQuantity', label: '订单数量' },
  { key: 'factoryUnitPrice', label: '单价' },
  { key: 'orderOperatorName', label: '下单人' },
  { key: 'createTime', label: '下单时间' },
  { key: 'expectedShipDate', label: '预计出货' },
  { key: 'procurementSummary', label: '采购进度' },
  { key: 'cuttingSummary', label: '裁剪进度' },
  { key: 'secondaryProcessSummary', label: '二次工艺' },
  { key: 'carSewingSummary', label: '车缝进度' },
  { key: 'tailProcessSummary', label: '尾部进度' },
  { key: 'cuttingQuantity', label: '裁剪数量' },
  { key: 'cuttingBundleCount', label: '扎数' },
  { key: 'completedQuantity', label: '完成数量' },
  { key: 'warehousingQualifiedQuantity', label: '入库' },
  { key: 'unqualifiedQuantity', label: '次品数' },
  { key: 'repairQuantity', label: '返修数' },
  { key: 'inStockQuantity', label: '库存' },
  { key: 'status', label: '状态/交期' },
];

function columnOptionList() {
  return columnOptions;
}

/** 「完整」预设：全部字段显示（勾选列表里出现的才生效） */
export const fullVisibleColumns: Record<string, boolean> = Object.fromEntries(
  columnOptionList().map((c) => [c.key, true]),
);

/** D-322: 字段分组——系统预设好全部字段并归类，用户只需按组勾选 */
export const columnGroups = [
  { title: '基本信息', keys: ['styleCover', 'styleNo', 'styleName', 'category', 'companyName', 'attachments', 'factoryName', 'merchandiser', 'patternMaker', 'factoryUnitPrice', 'orderOperatorName'] },
  { title: '数量与交期', keys: ['orderQuantity', 'completedQuantity', 'createTime', 'expectedShipDate', 'status'] },
  { title: '工序进度', keys: ['procurementSummary', 'cuttingSummary', 'secondaryProcessSummary', 'carSewingSummary', 'tailProcessSummary', 'cuttingQuantity', 'cuttingBundleCount'] },
  { title: '质检与库存', keys: ['warehousingQualifiedQuantity', 'unqualifiedQuantity', 'repairQuantity', 'inStockQuantity'] },
];

/** 一键预设方案：系统推荐组合，用户点一下即套用 */
export const columnPresets = [
  { key: 'simple', label: '精简', values: simpleVisibleColumns },
  { key: 'standard', label: '标准', values: defaultVisibleColumns },
  { key: 'full', label: '完整', values: fullVisibleColumns },
];

const STORAGE_KEY = 'production-list-visible-columns';
const PREFERENCE_PAGE_KEY = 'production-list';
const PREFERENCE_TYPE = 'visible_columns';

/**
 * 列显示/隐藏管理 Hook
 * D-322: localStorage 即时缓存 + 云端账号偏好（换设备生效）；预设一键套用
 */
export function useColumnSettings() {
  const [visibleColumns, setVisibleColumns] = useState<Record<string, boolean>>(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {
        return defaultVisibleColumns;
      }
    }
    return defaultVisibleColumns;
  });
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 本地即时缓存
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(visibleColumns));
  }, [visibleColumns]);

  // 首次挂载：拉取账号云端偏好（云端有则以云端为准，本地仅作缓存）
  useEffect(() => {
    let cancelled = false;
    userPreferenceApi.list(PREFERENCE_PAGE_KEY)
      .then((res) => {
        if (cancelled || res?.code !== 200 || !Array.isArray(res.data)) return;
        const pref = res.data.find((p) => p.preferenceType === PREFERENCE_TYPE);
        if (!pref?.preferenceValue) return;
        try {
          const parsed = JSON.parse(pref.preferenceValue) as Record<string, boolean>;
          if (parsed && typeof parsed === 'object' && Object.keys(parsed).length > 0) {
            setVisibleColumns(parsed);
          }
        } catch { /* 云端值损坏则沿用本地 */ }
      })
      .catch(() => { /* 云端不可用静默降级 localStorage */ });
    return () => { cancelled = true; };
  }, []);

  // 变更防抖同步到云端
  useEffect(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      userPreferenceApi.save(PREFERENCE_PAGE_KEY, PREFERENCE_TYPE, JSON.stringify(visibleColumns))
        .catch(() => { /* 离线时仅本地生效 */ });
    }, 800);
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [visibleColumns]);

  const toggleColumnVisible = (key: string) => {
    setVisibleColumns(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const applyPresetValues = useCallback((values: Record<string, boolean>) => {
    setVisibleColumns({ ...values });
  }, []);

  const resetColumnSettings = () => {
    setVisibleColumns(defaultVisibleColumns);
    localStorage.removeItem(STORAGE_KEY);
    userPreferenceApi.remove(PREFERENCE_PAGE_KEY, PREFERENCE_TYPE).catch(() => { /* 静默 */ });
  };

  return {
    visibleColumns,
    toggleColumnVisible,
    applyPresetValues,
    resetColumnSettings,
    columnOptions,
    columnGroups,
    columnPresets,
  };
}
