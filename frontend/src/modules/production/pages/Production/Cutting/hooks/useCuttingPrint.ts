import { useState } from 'react';
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

  const triggerPrint = () => {
    if (!printUnlocked) {
      message.warning('请先保存生成裁剪单后再打印');
      return;
    }
    if (!printBundles.length) {
      message.warning('没有可打印的内容');
      return;
    }

    const orderNo = String(printBundles[0]?.productionOrderNo || '').trim() || '-';
    const styleNo = String(printBundles[0]?.styleNo || '').trim() || '-';

    // 按颜色 + 码数分组统计
    const groupedMap = new Map<string, { color: string; size: string; bundleCount: number; totalQty: number }>();
    for (const b of printBundles) {
      const color = String(b.color || '').trim() || '-';
      const size = String(b.size || '').trim() || '-';
      const key = `${color}|||${size}`;
      if (!groupedMap.has(key)) groupedMap.set(key, { color, size, bundleCount: 0, totalQty: 0 });
      const g = groupedMap.get(key)!;
      g.bundleCount++;
      g.totalQty += Number(b.quantity || 0);
    }

    const rows = [...groupedMap.values()];
    const totalBundles = printBundles.length;
    const totalQty = rows.reduce((s, r) => s + r.totalQty, 0);
    const printDate = new Date().toLocaleDateString('zh-CN');

    const tableRows = rows.map((r) => `
      <tr>
        <td>${r.color}</td>
        <td>${r.size}</td>
        <td>${r.bundleCount}</td>
        <td>${r.totalQty}</td>
      </tr>
    `).join('');

    const printHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>裁剪汇总 ${orderNo}</title>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { font-family: Arial, "Microsoft YaHei", sans-serif; padding: 20mm 16mm; font-size: 13pt; color: #000; }
          h2 { text-align: center; font-size: 18pt; margin-bottom: 14pt; letter-spacing: 2px; }
          .info { display: flex; gap: 32pt; margin-bottom: 14pt; font-size: 12pt; }
          .info .label { color: #555; }
          .info .val { font-weight: bold; }
          table { width: 100%; border-collapse: collapse; margin-bottom: 14pt; font-size: 12pt; }
          th, td { border: 1px solid #555; padding: 6pt 10pt; text-align: center; }
          th { background: #eeeeee; font-weight: bold; }
          tfoot td { font-weight: bold; background: #f5f5f5; }
          .footer { text-align: right; font-size: 10pt; color: #888; margin-top: 10pt; }
        </style>
      </head>
      <body>
        <h2>裁剪汇总单</h2>
        <div class="info">
          <div><span class="label">订单号：</span><span class="val">${orderNo}</span></div>
          <div><span class="label">款号：</span><span class="val">${styleNo}</span></div>
          <div><span class="label">打印日期：</span><span class="val">${printDate}</span></div>
        </div>
        <table>
          <thead>
            <tr><th>颜色</th><th>码数</th><th>扎数</th><th>数量合计</th></tr>
          </thead>
          <tbody>${tableRows}</tbody>
          <tfoot>
            <tr>
              <td colspan="2">合计</td>
              <td>${totalBundles}</td>
              <td>${totalQty}</td>
            </tr>
          </tfoot>
        </table>
        <div class="footer">共 ${totalBundles} 扎 · 共 ${totalQty} 件</div>
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
      setTimeout(() => {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
        setTimeout(() => { try { document.body.removeChild(iframe); } catch {} }, 1000);
      }, 100);
    }

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
