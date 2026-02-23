import { useState } from 'react';
import QRCode from 'qrcode';
import type { CuttingBundleRow } from './useCuttingBundles';

interface UseCuttingPrintOptions {
  message: any;
}

/**
 * 裁剪打印管理 Hook
 * 管理打印预览、纸张配置、iframe打印
 */
export function useCuttingPrint({ message }: UseCuttingPrintOptions) {
  const [printPreviewOpen, setPrintPreviewOpen] = useState(false);
  const [printBundles, setPrintBundles] = useState<CuttingBundleRow[]>([]);
  const [printUnlocked, setPrintUnlocked] = useState(false);

  // 打印配置：固定两种纸张规格
  const [printConfig, setPrintConfig] = useState<{
    paperSize: '7x4' | '10x5';
    qrSize: number;
  }>({
    paperSize: '7x4',
    qrSize: 84,
  });

  const openBatchPrint = (selectedBundles: CuttingBundleRow[]) => {
    if (!printUnlocked) {
      message.warning('请先保存生成裁剪单后再打印');
      return;
    }
    if (!selectedBundles.length) {
      message.warning('请先勾选要打印的扎号');
      return;
    }
    setPrintBundles(selectedBundles.slice());
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

    const labelW = printConfig.paperSize === '7x4' ? 70 : 100;
    const labelH = printConfig.paperSize === '7x4' ? 40 : 50;
    const pageSize = printConfig.paperSize === '7x4' ? '70mm 40mm' : '100mm 50mm';
    const qrSize = printConfig.qrSize;

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
            <div>扎号：${Number(b.bundleNo || 0) || '-'}</div>
          </div>
        </div>
      </div>
    `).join('');

    const printQrSize = Math.min(labelH - 8, qrSize * 0.28);

    const printHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>菲号标签打印</title>
        <style>
          @page {
            size: ${pageSize};
            margin: 0;
          }
          * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
          }
          html, body {
            width: ${labelW}mm;
            height: ${labelH}mm;
            font-family: Arial, "Microsoft YaHei", sans-serif;
          }
          .print-page {
            width: ${labelW}mm;
            height: ${labelH}mm;
            padding: 2mm;
            page-break-after: always;
            display: flex;
            justify-content: center;
            align-items: center;
          }
          .print-page:last-child {
            page-break-after: auto;
          }
          .label {
            width: ${labelW - 4}mm;
            height: ${labelH - 4}mm;
            border: 1px solid #000;
            display: flex;
            flex-direction: row;
            padding: 1.5mm;
            gap: 1.5mm;
            background: white;
          }
          .qr {
            flex: 0 0 auto;
            display: flex;
            align-items: center;
            justify-content: center;
          }
          .qr img {
            width: ${printQrSize}mm;
            height: ${printQrSize}mm;
          }
          .text {
            flex: 1;
            display: flex;
            flex-direction: column;
            justify-content: space-around;
            font-size: ${labelH > 45 ? '9pt' : '7pt'};
            font-weight: normal;
            line-height: 1.3;
            color: #000;
          }
          .text > div {
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
    iframe.style.cssText = 'position:fixed;left:-9999px;top:-9999px;width:0;height:0;border:none;';
    document.body.appendChild(iframe);

    const iframeDoc = iframe.contentWindow?.document;
    if (iframeDoc) {
      iframeDoc.open();
      iframeDoc.write(printHtml);
      iframeDoc.close();

      const images = iframeDoc.querySelectorAll('img');
      let loadedCount = 0;
      const totalImages = images.length;

      const doPrint = () => {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
        setTimeout(() => {
          try { document.body.removeChild(iframe); } catch {}
        }, 1000);
      };

      const onImageLoad = () => {
        loadedCount++;
        if (loadedCount >= totalImages) {
          setTimeout(doPrint, 100);
        }
      };

      if (totalImages === 0) {
        setTimeout(doPrint, 100);
      } else {
        images.forEach(img => {
          if (img.complete) {
            onImageLoad();
          } else {
            img.onload = onImageLoad;
            img.onerror = onImageLoad;
          }
        });
        setTimeout(() => {
          if (loadedCount < totalImages) {
            doPrint();
          }
        }, 5000);
      }
    }

    setPrintPreviewOpen(false);
  };

  return {
    printPreviewOpen, setPrintPreviewOpen,
    printBundles, setPrintBundles,
    printUnlocked, setPrintUnlocked,
    printConfig, setPrintConfig,
    openBatchPrint, triggerPrint,
  };
}

export type CuttingPrintState = ReturnType<typeof useCuttingPrint>;
