/**
 * 批量打印执行服务（D-611）
 *
 * 流程：逐款装载数据（fetchStylePrintData，与单一打印同源）→ 生成各单二维码 →
 * 共享正文组件静态渲染（renderToStaticMarkup）→ buildBatchPrintHtml 合并 → safePrint 一次打印。
 * 单款失败只跳过并记录，不整批失败；结果由调用方（StyleBatchPrintModal）汇总提示。
 */
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import QRCodeLib from 'qrcode';

import { parseProductionOrderLines } from '@/utils/api';
import { getStyleCardColorText, getStyleCardQuantityText } from '@/utils/cardSizeQuantity';

import { safePrint } from '@/utils/safePrint';
import { PrintOptions } from './types';
import { getModePageTitle } from './helpers';
import { parseSizeColorMatrix } from './printDataTransform';
import { fetchStylePrintData } from './fetchStylePrintData';
import StylePrintDocBody from './StylePrintDocBody';
import { buildBatchPrintHtml } from './batchPrintTemplate';

/** 批量单据条目：由列表行映射而来，字段与 StylePrintModal 单一打印入参同形 */
export interface StyleBatchPrintItem {
  key: string | number;
  mode: 'sample' | 'order' | 'production';
  styleId?: string | number;
  styleNo?: string;
  styleName?: string;
  cover?: string;
  color?: string;
  quantity?: number;
  category?: string;
  season?: string;
  orderId?: string;
  orderNo?: string;
  extraInfo?: Record<string, any>;
  sizeDetails?: Array<{ color: string; size: string; quantity: number }>;
  sizeColorConfig?: string;
  patternProductionId?: string | number | null;
}

export interface BatchPrintResult {
  okCount: number;
  failed: string[];
  total: number;
}

/** 单批上限：防止合并文档过大导致打印 iframe 卡顿（超出请分批勾选） */
export const BATCH_PRINT_MAX = 30;
/** 批量合并文档含全部款式图片，图片等待预算放宽（safePrint 单打默认 1.5s） */
const BATCH_IMAGE_WAIT_MS = 6000;
/** 数据装载并发数：过高会给后端瞬时压力，过低拉长准备时间 */
const BATCH_CONCURRENCY = 3;

/** 大货订单列表行 → 批量打印条目（与 ProductionModals/StylePrintModalSection 单一打印映射同口径） */
export function mapProductionOrdersToBatchItems(rows: Array<Record<string, any>>): StyleBatchPrintItem[] {
  return rows
    .filter((r) => r && (r.styleId || r.styleNo))
    .map((r) => ({
      key: r.id,
      mode: 'production' as const,
      styleId: r.styleId,
      styleNo: r.styleNo,
      styleName: r.styleName,
      cover: r.styleCover,
      color: r.color,
      quantity: r.orderQuantity,
      category: r.category,
      orderId: r.id != null ? String(r.id) : undefined,
      orderNo: r.orderNo,
      extraInfo: {
        '订单号': r.orderNo,
        '订单数量': r.orderQuantity,
        '加工厂': r.factoryName,
        '跟单员': r.merchandiser,
        '交期': r.plannedEndDate,
      },
      sizeDetails: parseProductionOrderLines(r),
    }));
}

/** 样衣开发列表行 → 批量打印条目（与 StylePrintPreviewModal 单一打印映射同口径） */
export function mapStyleRowsToBatchItems(rows: Array<Record<string, any>>): StyleBatchPrintItem[] {
  return rows
    .filter((r) => r && (r.id || r.styleNo))
    .map((r) => ({
      key: r.id ?? r.styleNo,
      mode: 'sample' as const,
      styleId: r.id,
      styleNo: r.styleNo,
      styleName: r.styleName,
      cover: r.cover,
      color: getStyleCardColorText(r),
      quantity: Number(getStyleCardQuantityText(r) || '0') || undefined,
      category: r.category,
      season: r.season,
      sizeColorConfig: (r as any).sizeColorConfig,
    }));
}

export async function runBatchStylePrint(opts: {
  items: StyleBatchPrintItem[];
  options: PrintOptions;
  fontScale: number;
  tenantName?: string;
  user: any;
  printerInfo: string;
  onProgress?: (done: number, total: number, currentStyleNo: string) => void;
}): Promise<BatchPrintResult> {
  const { items, options, fontScale, tenantName, user, printerInfo, onProgress } = opts;
  const total = items.length;
  const docs: Array<{ styleNo: string; pageTitle: string; bodyHtml: string; printerInfo: string; printDate: string }> = [];
  const failed: string[] = [];
  const printDate = new Date().toLocaleString('zh-CN');
  let done = 0;

  const runOne = async (item: StyleBatchPrintItem) => {
    try {
      const bundle = await fetchStylePrintData({
        styleId: item.styleId,
        styleNo: item.styleNo,
        styleName: item.styleName,
        mode: item.mode,
        orderId: item.orderId,
        orderNo: item.orderNo,
        cover: item.cover,
        patternProductionId: item.patternProductionId,
      });
      const qrPngDataUrl = await QRCodeLib
        .toDataURL(bundle.qrValue, { width: 640, margin: 2, errorCorrectionLevel: 'H' })
        .catch(() => '');
      const sizeColorMatrix = parseSizeColorMatrix(item.sizeColorConfig || item.extraInfo?.sizeColorConfig);
      const bodyHtml = renderToStaticMarkup(
        <StylePrintDocBody
          options={options}
          data={bundle.data}
          sizeColorMatrix={sizeColorMatrix}
          sizeDetails={item.sizeDetails || []}
          styleNo={item.styleNo || ''}
          styleName={item.styleName || ''}
          category={item.category}
          season={item.season}
          mode={item.mode}
          orderNo={item.orderNo}
          orderCreatorName={bundle.orderCreatorName}
          extraInfo={item.extraInfo || {}}
          resolvedCover={bundle.resolvedCover}
          qrPngDataUrl={qrPngDataUrl}
          qrValue={bundle.qrValue}
          user={user}
        />,
      );
      docs.push({
        styleNo: item.styleNo || '',
        pageTitle: getModePageTitle(item.mode),
        bodyHtml,
        printerInfo,
        printDate,
      });
    } catch (e) {
      console.error('[批量打印] 单据准备失败:', item.styleNo || item.key, e);
      failed.push(item.styleNo || String(item.key));
    } finally {
      done += 1;
      onProgress?.(done, total, item.styleNo || '');
    }
  };

  // 简易并发池：按 BATCH_CONCURRENCY 分批跑，批间串行
  for (let i = 0; i < items.length; i += BATCH_CONCURRENCY) {
    await Promise.all(items.slice(i, i + BATCH_CONCURRENCY).map(runOne));
  }

  if (docs.length === 0) {
    return { okCount: 0, failed, total };
  }

  const html = buildBatchPrintHtml({ docs, tenantName, fontScale });
  safePrint(html, '批量打印', { imageWaitMs: BATCH_IMAGE_WAIT_MS });
  return { okCount: docs.length, failed, total };
}
