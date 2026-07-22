import { useCallback } from 'react';
import { MaterialDatabase } from '@/types/production';
import { formatMoney } from '@/utils/format';
import { getMaterialTypeLabel } from '@/utils/materialType';

// ===== 打印 HTML 构建工具（从 index.tsx 抽取）=====
// 纯函数：根据 dataList 构建物料资料库打印 HTML
const buildMaterialPrintHtml = (dataList: MaterialDatabase[]): string => {
  const esc = (v: any) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  // 计算各类型数量
  const statsByType: Record<string, { count: number; totalQty: number }> = {};
  const rows = dataList.map((item: any, idx: number) => {
    const type = item.materialType || 'other';
    if (!statsByType[type]) statsByType[type] = { count: 0, totalQty: 0 };
    statsByType[type].count += 1;
    const qty = Number(item.quantity) || 0;
    statsByType[type].totalQty += qty;
    const unitPrice = Number(item.unitPrice) || 0;
    return `<tr>
        <td style="text-align:center">${idx + 1}</td>
        <td>${esc(item.materialCode)}</td>
        <td>${esc(item.materialName)}</td>
        <td>${esc(item.styleNo)}</td>
        <td style="text-align:center">${esc(getMaterialTypeLabel(item.materialType))}</td>
        <td>${esc(item.color)}</td>
        <td>${esc(item.specifications)}</td>
        <td style="text-align:center">${esc(item.unit)}</td>
        <td style="text-align:right">${qty.toFixed(2)}</td>
        <td style="text-align:right">${formatMoney(unitPrice)}</td>
        <td style="text-align:right;font-weight:600">${formatMoney(qty * unitPrice)}</td>
        <td>${esc(item.supplierName)}</td>
      </tr>`;
  }).join('');

  const totalCount = dataList.length;
  let totalQty = 0;
  let totalValue = 0;
  dataList.forEach((item: any) => {
    const qty = Number(item.quantity) || 0;
    const unitPrice = Number(item.unitPrice) || 0;
    totalQty += qty;
    totalValue += qty * unitPrice;
  });

  const now = new Date();
  const printDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

  // 按类型分组统计（仅用于汇总区展示）
  const typeStats: Record<string, { count: number; totalQty: number }> = {};
  dataList.forEach((item: any) => {
    const type = item.materialType || 'other';
    if (!typeStats[type]) typeStats[type] = { count: 0, totalQty: 0 };
    typeStats[type].count += 1;
    typeStats[type].totalQty += Number(item.quantity) || 0;
  });
  const typeRows = Object.keys(typeStats).map(t => {
    const s = typeStats[t];
    return `<div class="type-stat"><span class="type-name">${esc(getMaterialTypeLabel(t))}</span><span class="type-count">${s.count} 项</span><span class="type-qty">${s.totalQty.toFixed(2)}</span></div>`;
  }).join('');

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <title>物料资料库清单</title>
  <style>
    @page { margin: 12mm; }
    body { font-family: system-ui, -apple-system, "Microsoft YaHei", "PingFang SC", sans-serif; font-size: 13px; color: var(--color-text-primary); padding: 24px; background: var(--color-bg-base); line-height: 1.7; }
    .title { text-align: center; font-size: 26px; font-weight: 700; margin-bottom: 6px; letter-spacing: 3px; }
    .subtitle { text-align: center; font-size: 12px; color: #999; margin-bottom: 20px; }
    .info-bar { display: flex; justify-content: space-between; padding: 10px 16px; background: #f8f9fa; border: 1px solid #e8e8e8; margin-bottom: 20px; font-size: 12px; }
    /* ---- 汇总区 ---- */
    .summary-section { margin-bottom: 24px; }
    .summary-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 16px; }
    .summary-card { padding: 14px 16px; background: #f4f6f8; border: 1px solid #e0e0e0; text-align: center; border-radius: 6px; }
    .summary-card.highlight { background: linear-gradient(135deg, #F6FFED, #ffd4b8); border-color: #ff7a45; }
    .summary-card-label { font-size: 11px; color: #666; margin-bottom: 6px; }
    .summary-card-value { font-size: 18px; font-weight: 700; color: var(--color-text-primary); }
    .summary-card.highlight .summary-card-value { color: #d4380d; font-size: 20px; }
    .type-stats { display: flex; flex-wrap: wrap; gap: 8px; }
    .type-stat { display: flex; align-items: center; gap: 8px; padding: 6px 12px; background: #f0f7ff; border: 1px solid #91d5ff; border-radius: 4px; font-size: 12px; }
    .type-name { font-weight: 600; color: var(--color-info); }
    .type-count, .type-qty { color: #666; }
    .section { page-break-inside: avoid; }
    table { width: 100%; border-collapse: collapse; font-size: 11px; margin-top: 16px; }
    th, td { border: 1px solid #d0d0d0; padding: 6px 8px; vertical-align: middle; }
    th { background: #f4f6f8; font-weight: 600; color: #262626; text-align: center; }
    tbody tr:hover { background: #fafcff; }
    .footer { margin-top: 30px; text-align: center; font-size: 11px; color: #999; padding-top: 12px; border-top: 1px solid #eee; }
    .print-btn-bar { position: fixed; top: 10px; right: 10px; z-index: 999; }
    .print-btn { padding: 8px 16px; background: transparent; color: var(--color-primary); border: 1px solid var(--color-primary); border-radius: 4px; cursor: pointer; font-size: 13px; }
    @media print {
      .no-print { display: none !important; }
      .print-btn-bar { display: none; }
      .summary-card.highlight { background: #F6FFED !important; border-color: #999 !important; }
    }
  </style>
</head>
<body>
  <div class="print-btn-bar no-print">
    <button class="print-btn" onclick="window.print()">🖨️ 打印</button>
  </div>

  <div class="title">物 料 资 料 库</div>
  <div class="subtitle">Material Database Inventory</div>

  <div class="info-bar">
    <span>打印时间：<strong>${printDate}</strong></span>
    <span>共 <strong>${totalCount}</strong> 条物料记录</span>
  </div>

  <div class="summary-section">
    <div class="summary-grid">
      <div class="summary-card">
        <div class="summary-card-label">物料项数</div>
        <div class="summary-card-value">${totalCount}</div>
      </div>
      <div class="summary-card">
        <div class="summary-card-label">物料种类</div>
        <div class="summary-card-value">${Object.keys(typeStats).length}</div>
      </div>
      <div class="summary-card">
        <div class="summary-card-label">总数量</div>
        <div class="summary-card-value">${totalQty.toFixed(2)}</div>
      </div>
      <div class="summary-card highlight">
        <div class="summary-card-label">总金额（估算）</div>
        <div class="summary-card-value">${formatMoney(totalValue)}</div>
      </div>
    </div>
    ${typeRows ? `<div class="type-stats">${typeRows}</div>` : ''}
  </div>

  <div class="section">
    <table>
      <thead>
        <tr>
          <th style="width:35px">#</th>
          <th style="width:90px">物料编号</th>
          <th>物料名称</th>
          <th style="width:70px">款号</th>
          <th style="width:60px">类型</th>
          <th style="width:60px">颜色</th>
          <th style="width:80px">规格</th>
          <th style="width:45px">单位</th>
          <th style="width:65px">数量</th>
          <th style="width:70px">单价</th>
          <th style="width:85px">金额</th>
          <th style="width:100px">供应商</th>
        </tr>
      </thead>
      <tbody>
        ${rows || '<tr><td colspan="12" style="text-align:center;color:#999;padding:20px">暂无物料数据</td></tr>'}
      </tbody>
    </table>
  </div>

  <div class="footer">本清单数据仅供参考，实际数量以盘点为准 · 打印时间：${printDate}</div>
</body>
</html>`;
};

// ===== 打印 Hook =====
export function useMaterialPrint(dataList: MaterialDatabase[]) {
  const handlePrintMaterialDatabase = useCallback(() => {
    if (dataList.length === 0) {
      return;
    }
    const html = buildMaterialPrintHtml(dataList);
    const printWindow = window.open('', '_blank', 'width=1200,height=800');
    if (!printWindow) {
      return;
    }
    printWindow.document.write(html);
    printWindow.document.close();
  }, [dataList]);

  return { handlePrintMaterialDatabase };
}
