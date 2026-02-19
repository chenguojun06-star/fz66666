import React, { useState } from 'react';
import { Modal, Button, Space, Radio, message as antdMessage } from 'antd';
import type { CuttingBundleRow } from '@/modules/production/pages/Production/Cutting/hooks';
import { getFullAuthedFileUrl } from '@/utils/fileUrl';

interface CuttingSheetPrintModalProps {
  open: boolean;
  onCancel: () => void;
  bundles: CuttingBundleRow[];
  styleImageUrl?: string;
}

/**
 * 裁剪单打印组件
 * 功能：批量打印裁剪单（每张A4纸显示一个裁剪单的所有批次）
 * 打印内容：款式图、订单号、款号、菲号、颜色、码数、数量、床号
 */
const CuttingSheetPrintModal: React.FC<CuttingSheetPrintModalProps> = ({
  open,
  onCancel,
  bundles,
  styleImageUrl,
}) => {
  const [orientation, setOrientation] = useState<'portrait' | 'landscape'>('portrait');

  const handlePrint = () => {
    if (!bundles.length) {
      antdMessage.warning('没有可打印的裁剪单');
      return;
    }

    // 按订单分组（每个订单打印一张裁剪单）
    const groupedByOrder = bundles.reduce((acc, bundle) => {
      const orderNo = bundle.productionOrderNo || '';
      if (!acc[orderNo]) {
        acc[orderNo] = [];
      }
      acc[orderNo].push(bundle);
      return acc;
    }, {} as Record<string, CuttingBundleRow[]>);

    const orderKeys = Object.keys(groupedByOrder);
    if (!orderKeys.length) {
      antdMessage.warning('没有有效的订单数据');
      return;
    }

    // 生成打印HTML（每个订单一页）
    const pagesHtml = orderKeys.map((orderNo) => {
      const orderBundles = groupedByOrder[orderNo];
      const firstBundle = orderBundles[0];

      // 获取床号列表
      const bedNos = orderBundles
        .map(b => b.bedNo)
        .filter((no): no is number => no !== null && no !== undefined)
        .sort((a, b) => a - b);
      const bedNoDisplay = bedNos.length > 0 ? bedNos.join(', ') : '-';

      // 获取操作人信息（优先显示最后操作人，否则显示创建人）
      const operatorName = firstBundle.operatorName || firstBundle.creatorName || '-';
      const creatorName = firstBundle.creatorName || '-';

      // 款式图片URL
      const imageUrl = styleImageUrl ? getFullAuthedFileUrl(styleImageUrl) : '';

      // 统计码数和总数量
      const sizes = [...new Set(orderBundles.map(b => b.size).filter(Boolean))];
      const sizeDisplay = sizes.length > 0 ? sizes.join(', ') : '-';
      const totalQuantity = orderBundles.reduce((sum, b) => sum + (b.quantity || 0), 0);

      // 生成表格行（新格式：款号、菲号、颜色、数量）
      const tableRows = orderBundles.map((bundle) => `
        <tr>
          <td style="text-align: center;">${bundle.styleNo || '-'}</td>
          <td style="text-align: center; font-weight: 600; color: #2D7FF9;">${bundle.bundleNo || '-'}</td>
          <td style="text-align: center;">${bundle.color || '-'}</td>
          <td style="text-align: center; font-weight: 600;">${bundle.quantity || 0}</td>
        </tr>
      `).join('');

      return `
        <div class="cutting-sheet-page">
          <!-- 顶部：左边款式图 + 右边信息 -->
          <div class="header-container">
            <!-- 左边：款式图片 -->
            <div class="header-left">
              ${imageUrl ? `
                <img src="${imageUrl}" alt="款式图" class="style-image" />
              ` : '<div class="no-image">无图片</div>'}
            </div>

            <!-- 右边：公司、订单号、款号、码数、数量、床号 -->
            <div class="header-right">
              <div class="company-name">服装供应链管理系统</div>
              <div class="info-grid">
                <div class="info-item">
                  <span class="info-label">订单号：</span>
                  <span class="info-value">${orderNo}</span>
                </div>
                <div class="info-item">
                  <span class="info-label">款号：</span>
                  <span class="info-value">${firstBundle.styleNo || '-'}</span>
                </div>
                <div class="info-item">
                  <span class="info-label">码数：</span>
                  <span class="info-value">${sizeDisplay}</span>
                </div>
                <div class="info-item">
                  <span class="info-label">数量：</span>
                  <span class="info-value highlight">${totalQuantity}件</span>
                </div>
                <div class="info-item bed-no-item">
                  <span class="info-label">床号：</span>
                  <span class="info-value bed-no-value">${bedNoDisplay}</span>
                </div>
              </div>
            </div>
          </div>

          <!-- 裁剪明细表格 -->
          <table class="detail-table">
            <thead>
              <tr>
                <th style="width: 25%;">款号</th>
                <th style="width: 25%;">菲号</th>
                <th style="width: 25%;">颜色</th>
                <th style="width: 25%;">数量</th>
              </tr>
            </thead>
            <tbody>
              ${tableRows}
            </tbody>
            <tfoot>
              <tr>
                <td colspan="3" style="text-align: right; font-weight: 600;">合计：</td>
                <td style="text-align: center; font-weight: 600; font-size: 16px;">${totalQuantity}</td>
              </tr>
            </tfoot>
          </table>

          <!-- 签名栏 -->
          <div class="signature-section">
            <div class="signature-item">
              <span>创建人：</span>
              <span class="signature-value">${creatorName}</span>
            </div>
            <div class="signature-item">
              <span>操作人：</span>
              <span class="signature-value">${operatorName}</span>
            </div>
            <div class="signature-item">
              <span>裁床：</span>
              <span class="signature-line">__________________</span>
            </div>
            <div class="signature-item">
              <span>质检：</span>
              <span class="signature-line">__________________</span>
            </div>
            <div class="signature-item">
              <span>日期：</span>
              <span class="signature-line">__________________</span>
            </div>
          </div>
        </div>
      `;
    }).join('');

    const printHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>裁剪单打印</title>
        <style>
          @page {
            size: A4 ${orientation};
            margin: 15mm;
          }
          * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
          }
          html, body {
            font-family: "Microsoft YaHei", Arial, sans-serif;
            font-size: 12px;
            color: #000;
            background: white;
          }
          .cutting-sheet-page {
            width: 100%;
            page-break-after: always;
            position: relative;
          }
          .cutting-sheet-page:last-child {
            page-break-after: auto;
          }

          /* 顶部容器：左边图片 + 右边信息 */
          .header-container {
            display: flex;
            gap: 20px;
            margin-bottom: 20px;
            padding-bottom: 16px;
            border-bottom: 2px solid #000;
          }
          .header-left {
            flex: 0 0 200px;
            display: flex;
            align-items: center;
            justify-content: center;
            border: 1px solid #ddd;
            border-radius: 4px;
            overflow: hidden;
            background: #fafafa;
          }
          .style-image {
            width: 100%;
            height: 100%;
            object-fit: contain;
            max-height: 200px;
          }
          .no-image {
            width: 200px;
            height: 150px;
            display: flex;
            align-items: center;
            justify-content: center;
            color: #999;
            font-size: 14px;
          }
          .header-right {
            flex: 1;
            display: flex;
            flex-direction: column;
            gap: 8px;
          }
          .company-name {
            font-size: 20px;
            font-weight: 700;
            color: #000;
            margin-bottom: 8px;
          }
          .info-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 10px 16px;
          }
          .info-item {
            display: flex;
            align-items: center;
            font-size: 13px;
          }
          .info-label {
            font-weight: 600;
            color: #333;
            min-width: 60px;
          }
          .info-value {
            color: #000;
            flex: 1;
          }
          .info-value.highlight {
            font-size: 16px;
            font-weight: 700;
            color: #2D7FF9;
          }
          .bed-no-item {
            grid-column: 1 / -1;
            border: 2px solid #2D7FF9;
            padding: 8px 12px;
            border-radius: 4px;
            background: #f0f7ff;
            margin-top: 4px;
          }
          .bed-no-value {
            font-size: 18px;
            font-weight: 700;
            color: #2D7FF9 !important;
          }

          /* 明细表格 */
          .detail-table {
            width: 100%;
            border-collapse: collapse;
            margin: 16px 0;
            font-size: 12px;
          }
          .detail-table th,
          .detail-table td {
            border: 1px solid #333;
            padding: 8px;
            text-align: left;
          }
          .detail-table thead th {
            background-color: #f5f5f5;
            font-weight: 700;
            text-align: center;
          }
          .detail-table tbody tr:nth-child(even) {
            background-color: #fafafa;
          }
          .detail-table tfoot td {
            background-color: #f0f0f0;
            font-weight: 600;
          }

          /* 签名栏 */
          .signature-section {
            margin-top: 32px;
            display: flex;
            justify-content: space-around;
            align-items: center;
          }
          .signature-item {
            font-size: 13px;
          }
          .signature-line {
            display: inline-block;
            min-width: 120px;
            border-bottom: 1px solid #000;
            margin-left: 8px;
          }
          .signature-value {
            display: inline-block;
            min-width: 80px;
            margin-left: 8px;
            font-weight: 600;
            color: #2D7FF9;
          }

          @media print {
            body {
              -webkit-print-color-adjust: exact;
              print-color-adjust: exact;
            }
          }
        </style>
      </head>
      <body>
        ${pagesHtml}
      </body>
      </html>
    `;

    // 使用iframe打印
    const iframe = document.createElement('iframe');
    iframe.style.cssText = 'position:fixed;left:-9999px;top:-9999px;width:0;height:0;border:none;';
    document.body.appendChild(iframe);

    const iframeDoc = iframe.contentWindow?.document;
    if (iframeDoc) {
      iframeDoc.open();
      iframeDoc.write(printHtml);
      iframeDoc.close();

      // 等待图片加载后打印
      const images = iframeDoc.querySelectorAll('img');
      if (images.length > 0) {
        let loadedCount = 0;
        const doPrint = () => {
          iframe.contentWindow?.focus();
          iframe.contentWindow?.print();
          setTimeout(() => {
            try { document.body.removeChild(iframe); } catch {}
          }, 1000);
        };

        images.forEach((img) => {
          if (img.complete) {
            loadedCount++;
          } else {
            img.onload = () => {
              loadedCount++;
              if (loadedCount >= images.length) {
                setTimeout(doPrint, 100);
              }
            };
            img.onerror = () => {
              loadedCount++;
              if (loadedCount >= images.length) {
                setTimeout(doPrint, 100);
              }
            };
          }
        });

        if (loadedCount >= images.length) {
          setTimeout(doPrint, 100);
        }
      } else {
        setTimeout(() => {
          iframe.contentWindow?.focus();
          iframe.contentWindow?.print();
          setTimeout(() => {
            try { document.body.removeChild(iframe); } catch {}
          }, 1000);
        }, 100);
      }
    }

    onCancel();
  };

  return (
    <Modal
      title="打印裁剪单"
      open={open}
      onCancel={onCancel}
      width={500}
      footer={
        <Space>
          <Button onClick={onCancel}>取消</Button>
          <Button type="primary" onClick={handlePrint}>
            打印
          </Button>
        </Space>
      }
    >
      <div style={{ padding: '16px 0' }}>
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontWeight: 600, marginBottom: 8 }}>打印内容</div>
          <div style={{ color: 'var(--neutral-text-secondary)', fontSize: 'var(--font-size-sm)' }}>
            已选择 {bundles.length} 个批次，将按订单分组打印裁剪单
          </div>
        </div>

        <div>
          <div style={{ fontWeight: 600, marginBottom: 8 }}>纸张方向</div>
          <Radio.Group
            value={orientation}
            onChange={(e) => setOrientation(e.target.value)}
          >
            <Radio value="portrait">纵向（竖版）</Radio>
            <Radio value="landscape">横向（横版）</Radio>
          </Radio.Group>
        </div>

        <div style={{ marginTop: 20, padding: 12, background: 'var(--neutral-bg)', borderRadius: 4 }}>
          <div style={{ fontWeight: 600, marginBottom: 8 }}>打印说明</div>
          <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--neutral-text-secondary)', lineHeight: 1.6 }}>
            • 每张A4纸打印一个订单的所有批次明细<br/>
            • 顶部左边显示款式图片，右边显示公司、订单号、款号、码数、数量汇总、床号<br/>
            • 表格显示：款号、菲号、颜色、数量<br/>
            • 床号高亮显示在右上角，方便裁剪工序对照<br/>
            • 建议使用A4纸打印
          </div>
        </div>
      </div>
    </Modal>
  );
};

export default CuttingSheetPrintModal;
