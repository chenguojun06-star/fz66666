import {
  loadCertPersistedSettings,
  type CertificateSectionState,
} from '@/utils/certificateLabelPrintTemplate';
import type { OrderInfo } from './types';

/**
 * D-230：仓库「标签打印 → 吊牌」改用订单管理的合格证版式。
 *
 * 背景：原吊牌是一堆零散开关（showStyleNo / showColorSize / showComposition …），
 * 用户不知道每个开关对应什么、打印出来是什么样，也无法按颜色尺码批量出牌。
 * 现统一为合格证模式：标题 + 多行「标签/值」可编辑可勾选 + 底部 CODE128 条码，
 * 并支持按颜色 × 尺码勾选行、逐行设置打印张数。
 */

/** 吊牌打印行（颜色 × 尺码 组合） */
export interface HangtagSkuRow {
  key: string;
  color: string;
  size: string;
  printCount: number;
  sku: string;
}

/**
 * 默认行配置：与订单管理合格证保持一致（品名/款号/规格/颜色/成分/产品标准/
 * 安全类别/质量等级/检验证明/企业名称/企业地址/零售价）。
 * - 非空预填的行自动勾选；跨款固定项（标准/安全类别/企业名称等）从 localStorage 记忆恢复
 * - 规格/颜色留空时由打印模板自动带该页 SKU 的码数/颜色
 */
export function buildDefaultHangtagCert(order: OrderInfo | null): CertificateSectionState {
  const persisted = loadCertPersistedSettings();
  const priceNum = Number(order?.price);
  const priceText = Number.isFinite(priceNum) && priceNum > 0 ? priceNum.toFixed(2) : '';
  const inspector = (order?.inspector || '').trim();

  const defs: Array<{ key: string; label: string; value: string; remember?: boolean }> = [
    { key: 'pinming', label: '品名', value: (order?.styleName || '').trim() },
    { key: 'kuanhao', label: '款号', value: (order?.styleNo || '').trim() },
    { key: 'guige', label: '规格', value: '{码数}' },
    { key: 'yanse', label: '颜色', value: '{颜色}' },
    { key: 'chengfen', label: '成分', value: (order?.fabricComposition || '').trim() || '详情见洗水唛' },
    { key: 'biaozhun', label: '产品标准', value: (order?.executeStandard || persisted.biaozhun || '').trim(), remember: true },
    { key: 'anquan', label: '安全类别', value: (order?.safetyCategory || persisted.anquan || '').trim(), remember: true },
    { key: 'zhiliang', label: '质量等级', value: (order?.qualityGrade || persisted.zhiliang || '合格品').trim(), remember: true },
    { key: 'jianyan', label: '检验证明', value: persisted.jianyan ?? (inspector ? `检验员${inspector}` : ''), remember: true },
    { key: 'qiye', label: '企业名称', value: (persisted.qiye || '').trim(), remember: true },
    { key: 'dizhi', label: '企业地址', value: (persisted.dizhi || '').trim(), remember: true },
    { key: 'lingshou', label: '零售价', value: priceText ? `¥ ${priceText}` : '' },
  ];

  return {
    titleText: '合格证',
    rows: defs.map((d) => {
      const value = d.remember && persisted[d.key] != null ? String(persisted[d.key]) : d.value;
      return { key: d.key, show: !!String(value).trim(), labelText: d.label, valueText: value };
    }),
    showBarcode: true,
    barcodeTemplate: '{款号}{颜色}{码数}',
    showBarcodeText: true,
    fontScale: 1,
  };
}

/** 按颜色 × 尺码生成打印行（默认每码 1 张）：吊牌与洗水唛共用 */
export function buildSkuRows(order: OrderInfo | null): HangtagSkuRow[] {
  if (!order) return [];
  const rows: HangtagSkuRow[] = [];
  for (const color of order.colors || []) {
    for (const size of order.sizes || []) {
      rows.push({
        key: `${color}__${size}`,
        color,
        size,
        printCount: 1,
        sku: `${order.styleNo}${color}${size}`,
      });
    }
  }
  return rows;
}

/** @deprecated D-232：吊牌与洗水唛共用同一套行构造，直接用 buildSkuRows */
export const buildHangtagSkuRows = buildSkuRows;
