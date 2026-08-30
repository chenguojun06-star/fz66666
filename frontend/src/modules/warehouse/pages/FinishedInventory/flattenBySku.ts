import React from 'react';
import type { FinishedInventory } from './finishedInventoryTypes';

/**
 * D-228：成品仓库主表「一个商品编码一行」。
 *
 * 背景：原实现把一款下的所有商品编码纵向堆叠在同一个单元格里，
 * 遇到多码款（如 HYY202601111 有 15 个编码）行高被撑得极高，列表密密麻麻无法阅读。
 *
 * 方案：把款级记录展开成「编码级」扁平行，每个编码独占一行；
 * 图片 / 成品信息 / 库存状态 / 单价 / 入库 / 出库 / 操作等款级信息
 * 通过 AntD Table 的 rowSpan 纵向合并，视觉上一个款仍是一个整块。
 */
export interface FinishedInventoryRow extends FinishedInventory {
  /** 该行对应的商品编码（已拆分为独立行） */
  __skuCode: string;
  /** 是否为所属款式分组的首行——仅首行渲染款级信息并承载 rowSpan */
  __isGroupFirst: boolean;
  /** 单元格纵向合并行数：首行为该款编码总数，其余行传 0（由 AntD 跳过渲染） */
  __rowSpan: number;
  /** 展开后的唯一行 key（原 rowKey 在同一款的多个编码间会重复） */
  __rowKey: string;
  /**
   * D-241：所属款式在当前列表中的序号（从 0 开始）。
   * 序号要按「款」编号而不是按「编码行」编号——一款拆出 15 个编码时，
   * 若按行编号会出现 1~82 的序号，配合底部「共 19 条」看起来像是 82 个款。
   */
  __groupIndex: number;
}

/**
 * 把款级列表展开为编码级行。
 * 无任何编码的款保留一行（编码显示 '-'），保证不丢数据。
 */
export function flattenInventoryBySku(list: FinishedInventory[]): FinishedInventoryRow[] {
  const rows: FinishedInventoryRow[] = [];
  list.forEach((item, groupIndex) => {
    const codes = (item.skuCodes ?? []).filter((c): c is string => !!c && !!c.trim());
    const effective = codes.length > 0 ? codes : [item.sku || ''];
    effective.forEach((code, idx) => {
      rows.push({
        ...item,
        __skuCode: code,
        __isGroupFirst: idx === 0,
        __rowSpan: idx === 0 ? effective.length : 0,
        __rowKey: `${item.orderNo}_${item.styleNo}_${code || `idx${idx}`}`,
        __groupIndex: groupIndex,
      });
    });
  });
  return rows;
}

/**
 * 把款级单元格包装成跨行合并单元格。
 * 仅用于款级信息列（图片/成品信息/库存状态/单价/入库/出库/操作），
 * 商品编码列不要包——它就是每行各不相同的内容。
 */
export function mergeAcrossRows(
  children: React.ReactNode,
  record: FinishedInventoryRow
): { children: React.ReactNode; props: { rowSpan: number } } {
  return {
    children,
    props: { rowSpan: record.__rowSpan },
  };
}
