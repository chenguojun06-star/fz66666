import { useState, useRef } from 'react';
import QRCode from 'qrcode';
import type { CuttingBundleRow } from './useCuttingBundles';
import { safePrint } from '@/utils/safePrint';

interface UseCuttingPrintOptions {
  message: any;
}

/**
 * 裁剪打印管理 Hook
 * 管理打印预览、纸张配置、iframe打印（QR码标签模式：每扎一张独立标签）
 */
export function useCuttingPrint({ message }: UseCuttingPrintOptions) {
  const [printPreviewOpen, setPrintPreviewOpen] = useState(false);
  const [printBundles, setPrintBundles] = useState<CuttingBundleRow[]>([]);
  const [highlightedBundleIds, setHighlightedBundleIds] = useState<string[]>([]);
  const [printUnlocked, setPrintUnlocked] = useState(false);

  const qrCacheRef = useRef<{ qrSize: number; urls: Record<string, string> }>({ qrSize: 0, urls: {} });

  const [printConfig, setPrintConfig] = useState<{
    orientation: 'horizontal' | 'vertical';
    paperWidth: number;
    paperHeight: number;
    qrSize: number;
  }>({
    orientation: 'horizontal',
    paperWidth: 7,
    paperHeight: 4,
    qrSize: 84,
  });

  const setOrientation = (orientation: 'horizontal' | 'vertical') => {
    setPrintConfig(prev => {
      if (prev.orientation === orientation) return prev;
      if (orientation === 'vertical') {
        return { ...prev, orientation, paperWidth: 4, paperHeight: 6, qrSize: 72 };
      }
      return { ...prev, orientation, paperWidth: 7, paperHeight: 4, qrSize: 84 };
    });
    qrCacheRef.current = { qrSize: 0, urls: {} };
  };

  const openBatchPrint = (selectedBundles: CuttingBundleRow[], options?: { highlightedBundleIds?: string[] }) => {
    if (!printUnlocked) {
      message.warning('请先保存生成裁剪单后再打印');
      return;
    }
    if (!selectedBundles.length) {
      message.warning('请先勾选要打印的扎号');
      return;
    }
    setPrintBundles(selectedBundles.slice());
    setHighlightedBundleIds((options?.highlightedBundleIds || []).filter(Boolean));
    setPrintPreviewOpen(true);

    const qrSize = printConfig.qrSize;
    qrCacheRef.current = { qrSize, urls: {} };
    const codes = [...new Set(selectedBundles.map(b => b.qrCode).filter(Boolean))] as string[];
    if (codes.length) {
      Promise.all(codes.map(async (code) => {
        try {
          qrCacheRef.current.urls[code] = await QRCode.toDataURL(code, {
            width: qrSize,
            margin: 1,
            errorCorrectionLevel: 'M',
          });
        } catch (e) {
          console.error('[print] QR预生成失败:', code.substring(0, 50), e);
          qrCacheRef.current.urls[code] = '';
        }
      })).catch(() => { /* 并行生成中的个别失败已由 per-code catch 处理 */ });
    }
  };

  const triggerPrint = async () => {
    if (!printUnlocked) {
      message.warning('请先保存生成裁剪单后再打印');
      return;
    }
    if (!printBundles.length) {
      message.warning('没有可打印的内容');
      return;
    }

    const labelW = Math.round(printConfig.paperWidth * 10);
    const labelH = Math.round(printConfig.paperHeight * 10);
    const pageSize = `${labelW}mm ${labelH}mm`;
    const qrSize = printConfig.qrSize;
    const minDim = Math.min(labelW, labelH);
    const fontSize = minDim <= 35 ? 5.5 : minDim <= 50 ? 7 : minDim <= 80 ? 8.5 : 10;

    const cache = qrCacheRef.current;
    let useCache = cache.qrSize === qrSize;
    if (useCache) {
      for (const b of printBundles) {
        const code = b.qrCode || '';
        if (code && cache.urls[code] === undefined) { useCache = false; break; }
      }
    }

    const qrDataUrls: Record<string, string> = useCache ? { ...cache.urls } : {};
    if (!useCache) {
      qrCacheRef.current = { qrSize, urls: {} };
      const codes = [...new Set(printBundles.map(b => b.qrCode).filter(Boolean))] as string[];
      await Promise.all(codes.map(async (code) => {
        try {
          qrDataUrls[code] = await QRCode.toDataURL(code, {
            width: qrSize,
            margin: 1,
            errorCorrectionLevel: 'M',
          });
          qrCacheRef.current.urls[code] = qrDataUrls[code];
        } catch (e) {
          console.error('[print] QR生成失败:', code.substring(0, 50), e);
          qrDataUrls[code] = '';
          qrCacheRef.current.urls[code] = '';
        }
      }));
    }

    const getQRUrl = (code: string) => {
      if (!code) return '';
      return qrDataUrls[code] || '';
    };

    const labelsHtml = printBundles.map((b) => `
      <div class="print-page">
        <div class="label ${printConfig.orientation === 'vertical' ? 'label--vertical' : ''}">
          <div class="qr">
            <img src="${getQRUrl(b.qrCode || '')}" width="${qrSize}" height="${qrSize}" onerror="this.outerHTML='<span style=display:flex;align-items:center;justify-content:center;width:'+this.width+'px;height:'+this.height+'px;font-size:10px;color:#999>QR错误</span>'" />
          </div>
          <div class="text">
            <div>订单：${String(b.productionOrderNo || '').trim() || '-'}</div>
            <div>款号：${String(b.styleNo || '').trim() || '-'}</div>
            <div>颜色：${String(b.color || '').trim() || '-'}</div>
            <div>码数：${String(b.size || '').trim() || '-'}</div>
            <div>数量：${Number(b.quantity || 0)}</div>
            <div>扎号：${String(b.bundleLabel || '').trim() || Number(b.bundleNo || 0) || '-'}</div>
          </div>
        </div>
      </div>
    `).join('');

    const printHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>菲号标签打印</title>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          @page { size: ${pageSize}; margin: 0; }
          html, body { width: ${labelW}mm; height: ${labelH}mm; color: #000; background: #fff; }
          .print-page {
            width: ${labelW}mm;
            height: ${labelH}mm;
            display: flex;
            justify-content: center;
            align-items: center;
            page-break-after: always;
          }
          .label {
            width: 90%;
            height: 90%;
            border: 1px solid #000;
            padding: 3mm;
            display: flex;
            gap: 3mm;
            font-family: system-ui, -apple-system, BlinkMacSystemFont, "'Segoe UI'", Roboto, "'Helvetica Neue'", Arial, "'Noto Sans'", "'Microsoft YaHei'", "'PingFang SC'", serif;
          }
          .label:not(.label--vertical) { flex-direction: row; }
          .label--vertical { flex-direction: column; align-items: center; }
          .qr { flex: 0 0 auto; display: flex; align-items: center; }
          .label:not(.label--vertical) .qr img { max-width: ${labelH * 0.6}mm; max-height: ${labelH * 0.7}mm; }
          .label--vertical .qr img { max-width: ${labelW * 0.7}mm; max-height: ${labelW * 0.7}mm; }
          .text {
            flex: 1 1 auto;
            font-size: ${fontSize}pt;
            line-height: 1.5;
            color: #000;
            display: flex;
            flex-direction: column;
            justify-content: space-around;
            overflow: hidden;
            min-width: 0;
          }
          .label--vertical .text { align-items: center; text-align: center; }
          .text div {
            color: #000;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
          }
        </style>
      </head>
      <body>
        ${labelsHtml}
      </body>
      </html>
    `;

    safePrint(printHtml);
    setPrintPreviewOpen(false);
  };

  return {
    printPreviewOpen, setPrintPreviewOpen,
    printBundles, setPrintBundles,
    highlightedBundleIds, setHighlightedBundleIds,
    printUnlocked, setPrintUnlocked,
    printConfig, setPrintConfig,
    setOrientation,
    openBatchPrint, triggerPrint,
  };
}

export type CuttingPrintState = ReturnType<typeof useCuttingPrint>;
