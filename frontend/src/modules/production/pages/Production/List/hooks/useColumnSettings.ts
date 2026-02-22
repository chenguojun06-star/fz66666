import { useState, useEffect } from 'react';

// === 列显示/隐藏配置 ===

/** 默认显示的核心列 */
export const defaultVisibleColumns: Record<string, boolean> = {
  styleCover: true,
  styleNo: true,
  styleName: true,
  category: false,
  companyName: false,
  attachments: true,
  factoryName: true,
  merchandiser: false,
  patternMaker: false,
  orderQuantity: true,
  factoryUnitPrice: true,
  orderOperatorName: true,
  createTime: false,
  remarks: false,
  expectedShipDate: true,
  procurementSummary: true,
  cuttingSummary: true,
  secondaryProcessSummary: true,
  carSewingSummary: true,
  tailProcessSummary: true,
  cuttingQuantity: false,
  cuttingBundleCount: false,
  completedQuantity: false,
  warehousingQualifiedQuantity: true,
  unqualifiedQuantity: false,
  repairQuantity: false,
  inStockQuantity: false,
  productionProgress: true,
  status: true,
  plannedEndDate: true,
};

/** 列设置选项 */
export const columnOptions = [
  { key: 'styleCover', label: '图片' },
  { key: 'styleNo', label: '款号' },
  { key: 'styleName', label: '款名' },
  { key: 'category', label: '品类' },
  { key: 'companyName', label: '公司' },
  { key: 'attachments', label: '附件' },
  { key: 'factoryName', label: '加工厂' },
  { key: 'merchandiser', label: '跟单员' },
  { key: 'patternMaker', label: '版师' },
  { key: 'orderQuantity', label: '订单数量' },
  { key: 'factoryUnitPrice', label: '单价' },
  { key: 'orderOperatorName', label: '下单人' },
  { key: 'createTime', label: '下单时间' },
  { key: 'remarks', label: '备注' },
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
  { key: 'productionProgress', label: '生产进度' },
  { key: 'status', label: '状态' },
  { key: 'plannedEndDate', label: '订单交期' },
];

const STORAGE_KEY = 'production-list-visible-columns';

/**
 * 列显示/隐藏管理 Hook
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

  // 保存到 localStorage
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(visibleColumns));
  }, [visibleColumns]);

  const toggleColumnVisible = (key: string) => {
    setVisibleColumns(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const resetColumnSettings = () => {
    setVisibleColumns(defaultVisibleColumns);
    localStorage.removeItem(STORAGE_KEY);
  };

  return {
    visibleColumns,
    toggleColumnVisible,
    resetColumnSettings,
    columnOptions,
  };
}
