/**
 * StylePrintModal 工具函数与常量
 * 提取自 index.tsx，纯函数无副作用
 */
import type { StylePrintModalProps } from './types';

/** 板类翻译：数据库存码值，打印显示中文 */
export const PLATE_TYPE_MAP: Record<string, string> = {
  FIRST: '首单',
  REORDER: '翻单',
  首单: '首单',
  翻单: '翻单',
  首板: '首单',
  首翻单: '首单',
  复板: '翻单',
};

/** 板类码值翻译为中文 */
export const translatePlateType = (v?: string | null) => (v ? (PLATE_TYPE_MAP[v] ?? '未知') : '-');

/** 商品类型翻译：FINISHED=成品，SEMI_FINISHED=半成品（与 StyleBasicInfoForm/constants.ts PRODUCT_TYPE_OPTIONS 对齐） */
export const translateProductType = (v?: string | null): string => {
  const raw = String(v ?? '').trim();
  if (!raw) return '-';
  const map: Record<string, string> = { FINISHED: '成品', SEMI_FINISHED: '半成品', 成品: '成品', 半成品: '半成品' };
  return map[raw.toUpperCase()] || raw;
};

/** 模式 → 中文标题（用于按钮/标签等） */
export const getModeTitle = (mode: StylePrintModalProps['mode']): string => {
  switch (mode) {
    case 'sample': return '样衣';
    case 'order': return '下单';
    case 'production': return '生产';
    default: return '';
  }
};

/** 模式 → 打印页面标题（用于打印 HTML 的 pageTitle） */
export const getModePageTitle = (mode: StylePrintModalProps['mode']): string => {
  switch (mode) {
    case 'sample': return '样衣开发单';
    case 'production': return '大货生产单';
    default: return '下单管理单';
  }
};
