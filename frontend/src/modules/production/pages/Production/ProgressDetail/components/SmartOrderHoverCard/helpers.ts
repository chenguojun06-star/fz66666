/**
 * SmartOrderHoverCard 辅助常量、类型与纯函数
 */
import type { ProductionOrder } from '@/types/production';
import { SENTINEL_KEY_MAP } from '@/modules/production/utils/calcOrderProgress';

/** 标准工序字段定义（boardStats 兜底用） */
export const STAGES_DEF = [
  { key: 'procurementCompletionRate', label: '采购' },
  { key: 'cuttingCompletionRate',     label: '裁剪' },
  { key: 'sewingCompletionRate',      label: '车缝' },
  { key: 'qualityCompletionRate',     label: '质检' },
  { key: 'warehousingCompletionRate', label: '入库' },
] as const;

/** 固定展示顺序（工厂有自定义工序时也按此排） */
export const STAGE_ORDER = ['采购', '裁剪', '二次工艺', '车缝', '尾部', '入库'];

/** 工序条目（进行中 / 未开始共用结构） */
export interface StageItem {
  label: string;
  stageName: string;
  qty: number;
  pct: number;
  lastTime: string | null;
  workerCount: number;
}

/**
 * 规范化节点显示名称：将冗长变体名简化为标准名，仅用于 UI 显示层
 * 例："仓库入库" / "成品入库" / "质检入库" / "入仓" → "入库"
 * 例："__procurement__" → "采购"（内部哨兵键映射）
 */
export const normalizeNodeLabel = (name: string): string => {
  if (!name) return name;
  if (SENTINEL_KEY_MAP[name]) return SENTINEL_KEY_MAP[name];
  if (name.includes('入库') || name.includes('入仓')) return '入库';
  return name;
};

/** 从订单字段读取 0-100 完成率，并夹紧到 [0,100] */
export function fieldRate(o: ProductionOrder, key: string): number {
  return Math.min(100, Math.max(0, Number((o as any)[key]) || 0));
}
