import type { DetailBlock } from '../../types';

/**
 * D-835：详情长图逐页编辑器（对齐竞品「批量编辑图片」的编辑方式）。
 *
 * <p><b>编辑模型</b>：每张详情图是一个独立「页面」，画布一次只编辑当前页；
 * 文字 / 尺码表 / 形状以「覆盖元素」的形态摆在页面上，可点选、拖拽、调层级。
 * 保存时把每页烘焙成最终图片（html2canvas），详情仍是一组图片 ——
 * C 端渲染链路零改动，老数据（图+文交错块）打开时自动映射成页面+覆盖文字。
 */

export type ElementKind = 'text' | 'shape' | 'sizeTable';

export interface ElementBase {
  id: string;
  kind: ElementKind;
  /** 页面坐标系（= 底图自然尺寸），与缩放无关 */
  x: number;
  y: number;
  w: number;
  /** 文字元素高度随内容自适应，不存 h */
  h?: number;
  /** 0-100 */
  opacity: number;
  /** 锁定后不可拖拽/缩放/删除 */
  locked?: boolean;
}

export interface TextElement extends ElementBase {
  kind: 'text';
  content: string;
  fontSize: number;
  color: string;
  bold?: boolean;
  align?: 'left' | 'center' | 'right';
  /** 旧数据迁移标记：底图加载后统一重排到页面底部（排完即清除） */
  anchorBottom?: boolean;
}

export interface ShapeElement extends ElementBase {
  kind: 'shape';
  shape: 'rect' | 'circle' | 'line';
  color: string;
  h: number;
}

export interface SizeTableElement extends ElementBase {
  kind: 'sizeTable';
  cols: string[];
  rows: string[][];
  fontSize: number;
}

export type EditorElement = TextElement | ShapeElement | SizeTableElement;

export interface EditorPage {
  id: string;
  bgUrl: string | null;
  /** 页面坐标系（底图加载后 = 原图自然尺寸） */
  bgW: number;
  bgH: number;
  /** 底图透明度 0-100 */
  bgOpacity: number;
  /** 底图模糊 px 0-20 */
  bgBlur: number;
  elements: EditorElement[];
}

/** 「保存模版」存的当前页元素组合（不含底图，换图也能套版式） */
export interface PageTemplate {
  name: string;
  savedAt: number;
  elements: EditorElement[];
}

/** 平台硬上限沿用 D-808：描述模块最多 20 个 */
export const MAX_PAGES = 20;
export const DEFAULT_PAGE_W = 750;
export const DEFAULT_PAGE_H = 1000;

export const uid = (prefix: string) =>
  `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

export type EditorBlock = DetailBlock;
