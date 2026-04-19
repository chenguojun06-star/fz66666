import { useState } from 'react';
import QRCode from 'qrcode';
import type { CuttingBundleRow } from './useCuttingBundles';

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

  // 打印配置：自由输入纸张宽高（单位：cm），默认 7×4
  const [printConfig, setPrintConfig] = useState<{
    paperWidth: number;
    paperHeight: number;
    qrSize: number;
  }>({
    paperWidth: 7,
    paperHeight: 4,
    qrSize: 84,
  });

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

    const labelW = Math.round(printConfig.paperWidth * 10);   // cm → mm
    const labelH = Math.round(printConfig.paperHeight * 10);
    const pageSize = `${labelW}mm ${labelH}mm`;
    const qrSize = printConfig.qrSize;
    const minDim = Math.min(labelW, labelH);
    const fontSize = minDim <= 35 ? 5.5 : minDim <= 50 ? 7 : minDim <= 80 ? 8.5 : 10;

    // 本地生成 QR 码 DataURL（替代外部 api.qrserver.com，防止业务数据泄露）
    const qrDataUrls: Record<string, string> = {};
    for (const b of printBundles) {
      const code = b.qrCode || '';
      if (code && !qrDataUrls[code]) {
        try {
          qrDataUrls[code] = await QRCode.toDataURL(code, {
            width: qrSize,
            margin: 1,
            errorCorrectionLevel: 'M',
          });
        } catch {
          qrDataUrls[code] = '';
        }
      }
    }

    const getQRUrl = (code: string) => {
      if (!code) return '';
      return qrDataUrls[code] || '';
    };

    const labelsHtml = printBundles.map((b) => `
      <div class="print-page">
        <div class="label">
          <div class="qr">
            <img src="${getQRUrl(b.qrCode || '')}" width="${qrSize}" height="${qrSize}" />
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
            font-family: Arial, "Microsoft YaHei", sans-serif;
          }
          .qr { flex: 0 0 auto; display: flex; align-items: center; }
          .qr img { display: block; max-width: ${labelH * 0.6}mm; max-height: ${labelH * 0.7}mm; }
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

    const iframe = document.createElement('iframe');
    iframe.style.cssText = 'position:fixed;left:-9999px;top:-9999px;width:210mm;height:297mm;border:none;';
    iframe.srcdoc = printHtml;
    document.body.appendChild(iframe);

    iframe.onload = () => {
      const doc = iframe.contentDocument;
      if (!doc) return;
      const imgs = doc.querySelectorAll('img');
      const waitForImages = () => new Promise<void>((resolve) => {
        if (imgs.length === 0) { resolve(); return; }
        let loaded = 0;
        const onLoad = () => { loaded++; if (loaded >= imgs.length) resolve(); };
        imgs.forEach((img) => {
          if ((img as HTMLImageElement).complete) { onLoad(); }
          else { img.addEventListener('load', onLoad); img.addEventListener('error', onLoad); }
        });
        setTimeout(resolve, 5000);
      });
      waitForImages().then(() => {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
        setTimeout(() => { try { document.body.removeChild(iframe); } catch {} }, 1000);
      });
    };

    setPrintPreviewOpen(false);
  };

  return {
    printPreviewOpen, setPrintPreviewOpen,
    printBundles, setPrintBundles,
    highlightedBundleIds, setHighlightedBundleIds,
    printUnlocked, setPrintUnlocked,
    printConfig, setPrintConfig,
    openBatchPrint, triggerPrint,
  };
}

export type CuttingPrintState = ReturnType<typeof useCuttingPrint>;
