// Cockpit 看板组件的常量、类型与纯函数

export const STORAGE_KEY = 'cockpit-widgets';

export interface WidgetPosition {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface WidgetState {
  overview: { placed: boolean } & WidgetPosition;
  order: { placed: boolean } & WidgetPosition;
  sample: { placed: boolean } & WidgetPosition;
  production: { placed: boolean } & WidgetPosition;
  procurement: { placed: boolean } & WidgetPosition;
  warehouse: { placed: boolean } & WidgetPosition;
}

export type WidgetKey = keyof WidgetState;

export const DEFAULT_POSITION: WidgetPosition = {
  x: 20,
  y: 20,
  width: 520,
  height: 560,
};

export const DEFAULT_WIDGETS: WidgetState = {
  overview: { placed: false, ...DEFAULT_POSITION, x: 20 },
  order: { placed: false, ...DEFAULT_POSITION, x: 540, y: 20 },
  sample: { placed: false, ...DEFAULT_POSITION, x: 20, y: 600 },
  production: { placed: false, ...DEFAULT_POSITION, x: 540, y: 600 },
  procurement: { placed: false, ...DEFAULT_POSITION, x: 1060, y: 600 },
  warehouse: { placed: false, ...DEFAULT_POSITION, x: 20, y: 1200 },
};

export const loadWidgetState = (): WidgetState => {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      return { ...DEFAULT_WIDGETS, ...parsed };
    }
  } catch (e) {
    console.warn('[Cockpit] localStorage 读取失败:', e);
  }
  return DEFAULT_WIDGETS;
};

// 模块标题映射
export const MODULE_TITLES: Record<WidgetKey, string> = {
  overview: '业务概览',
  order: '下单管理',
  sample: '样衣开发',
  production: '大货生产',
  procurement: '物料采购',
  warehouse: '成品仓库',
};
