/**
 * styleImageColumns — 电商/仓库列表统一的「款式图」「款号」列工厂
 *
 * 背景：电商各列表原本靠 `skuCode.split('-')[0]` 猜款号，而真实 SKU 编码是
 * 「款号直接拼颜色尺码、没有分隔符」（如 `BR24XQ0098E草绿色L(170/84A)`），
 * 于是款号列显示整串编码、款式图列永远空白 —— 用户反馈"看不出是什么订单"。
 *
 * 现在统一：数据由后端 `POST /style/sku/brief` 权威解析（t_product_sku），
 * 列则由本文件的工厂生成，保证全站列宽、占位、预览、缺数据降级口径一致。
 *
 * 用法：
 *   const cols = [
 *     styleImageColumn<EcOrder>({ imageMap, skuCode: r => r.skuCode }),
 *     styleNoColumn<EcOrder>({ briefBySku, skuCode: r => r.skuCode }),
 *     ...原有列,
 *   ];
 */
import React from 'react';
import { Tooltip, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import StyleImageCell from './StyleImageCell';
import type { StyleImageMap, SkuBriefMap, OrderBriefMap } from '@/hooks/useStyleCoverImages';

const { Text } = Typography;

/** 从一行记录里取商品编码 */
type SkuCodeGetter<T> = (record: T) => string | null | undefined;
/** 从一行记录里取款号（已有权威款号时才传，否则交给 skuCode 解析） */
type StyleNoGetter<T> = (record: T) => string | null | undefined;

export interface StyleImageColumnArgs<T> {
  imageMap: StyleImageMap;
  /** 商品编码（与 styleNo 至少给一个） */
  skuCode?: SkuCodeGetter<T>;
  /** 款号（已确定款号时给，取款级封面；与 skuCode 可同时给，先查款号） */
  styleNo?: StyleNoGetter<T>;
  title?: string;
  width?: number;
}

/** 「款式图」列：skuCode/styleNo → 图片，无图显示占位灰块 */
export function styleImageColumn<T>(args: StyleImageColumnArgs<T>): ColumnsType<T>[number] {
  const { imageMap, skuCode, styleNo, title = '款式图', width = 68 } = args;
  return {
    title,
    width,
    align: 'center' as const,
    render: (_: unknown, record: T) => (
      <StyleImageCell
        skuCode={skuCode ? skuCode(record) : undefined}
        styleNo={styleNo ? styleNo(record) : undefined}
        imageMap={imageMap}
      />
    ),
  };
}

export interface StyleNoColumnArgs<T> {
  briefBySku: SkuBriefMap;
  skuCode: SkuCodeGetter<T>;
  title?: string;
  width?: number;
  /** 解析不到款号时是否退回显示原始商品编码（默认 true，避免整列空白） */
  fallbackToSkuCode?: boolean;
}

/**
 * 「款号」列：显示权威款号 + 颜色/尺码，解析不到时退回原始编码（灰字）。
 *
 * **不做任何字符串猜测**：款号只来自后端解析结果，查不到就如实显示编码本身。
 */
export function styleNoColumn<T>(args: StyleNoColumnArgs<T>): ColumnsType<T>[number] {
  const { briefBySku, skuCode, title = '款号', width = 150, fallbackToSkuCode = true } = args;
  return {
    title,
    width,
    render: (_: unknown, record: T) => {
      const code = (skuCode(record) || '').trim();
      if (!code) return <Text type="secondary">-</Text>;
      const brief = briefBySku[code];
      const styleNo = (brief?.styleNo || '').trim();
      if (!styleNo) {
        return fallbackToSkuCode
          ? <Text type="secondary" style={{ fontSize: 13, fontFamily: 'monospace' }}>{code}</Text>
          : <Text type="secondary">-</Text>;
      }
      const spec = [brief?.color, brief?.size].filter(Boolean).join(' / ');
      return (
        <Tooltip title={code}>
          <div>
            <Text strong style={{ fontSize: 14, fontFamily: 'monospace' }}>{styleNo}</Text>
            {spec && (
              <div className="u-fs-13" style={{ color: 'var(--color-text-muted)' }}>{spec}</div>
            )}
          </div>
        </Tooltip>
      );
    },
  };
}

// ==================== 订单级列表（只有 orderNo，没有 skuCode） ====================
//
// 物流异常、平台账单等表只有订单号；后端 `POST /ecommerce/orders/brief`
// 会回查 t_ecommerce_order 取 skuCode 再解析，返回 orderNo → 摘要。
// 下面两个工厂是上面两个的薄封装，只是把"键"从 skuCode 换成 orderNo，
// 保证列宽/占位/预览/降级口径与商品级列表完全一致。

export interface OrderImageColumnArgs<T> {
  /** orderNo → 图片 URL（useStyleCoverImages().orderImageMap） */
  orderImageMap: StyleImageMap;
  orderNo: SkuCodeGetter<T>;
  title?: string;
  width?: number;
}

/** 「款式图」列（订单级） */
export function orderImageColumn<T>(args: OrderImageColumnArgs<T>): ColumnsType<T>[number] {
  const { orderImageMap, orderNo, ...rest } = args;
  return styleImageColumn<T>({ imageMap: orderImageMap, skuCode: orderNo, ...rest });
}

export interface OrderStyleNoColumnArgs<T> {
  /** orderNo → SKU 摘要（useStyleCoverImages().briefByOrderNo） */
  briefByOrderNo: OrderBriefMap;
  orderNo: SkuCodeGetter<T>;
  title?: string;
  width?: number;
  /** 解析不到时是否退回显示订单号（默认 true，避免整列空白） */
  fallbackToSkuCode?: boolean;
}

/** 「款号」列（订单级）：解析不到时退回显示订单号（灰字） */
export function orderStyleNoColumn<T>(args: OrderStyleNoColumnArgs<T>): ColumnsType<T>[number] {
  const { briefByOrderNo, orderNo, ...rest } = args;
  return styleNoColumn<T>({ briefBySku: briefByOrderNo, skuCode: orderNo, ...rest });
}
