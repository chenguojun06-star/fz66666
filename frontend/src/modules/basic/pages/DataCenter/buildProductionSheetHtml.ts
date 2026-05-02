import { getFullAuthedFileUrl } from '@/utils/fileUrl';
import { toCategoryCn } from '@/utils/styleCategory';

export const buildProductionSheetHtml = (payload: any) => {
  const style = payload?.style || {};
  const sizeList = Array.isArray(payload?.sizeList) ? payload.sizeList : [];
  const attachments = Array.isArray(payload?.attachments) ? payload.attachments : [];

  const resolveUrl = (u: any) => {
    const s = String(u ?? '').trim();
    if (!s) return '';
    if (/^https?:\/\//i.test(s)) return s;
    return getFullAuthedFileUrl(s);
  };

  const esc = (v: unknown) => String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

  const toSeasonCn = (value: unknown): string => {
    const raw = String(value ?? '').trim();
    if (!raw) return '-';
    const upper = raw.toUpperCase();

    if (upper === 'SPRING' || raw === '春' || raw === '春季') return '春季';
    if (upper === 'SUMMER' || raw === '夏' || raw === '夏季') return '夏季';
    if (upper === 'AUTUMN' || upper === 'FALL' || raw === '秋' || raw === '秋季') return '秋季';
    if (upper === 'WINTER' || raw === '冬' || raw === '冬季') return '冬季';
    if (upper === 'SS' || upper === 'SPRING/SUMMER' || upper === 'SPRING_SUMMER') return '春夏';
    if (upper === 'FW' || upper === 'AW' || upper === 'FALL/WINTER' || upper === 'AUTUMN/WINTER' || upper === 'FALL_WINTER' || upper === 'AUTUMN_WINTER') return '秋冬';
    if (raw === '春夏' || raw === '秋冬') return raw;
    return raw;
  };

  const collator = new Intl.Collator('zh-Hans-CN');
  const parseSizeKey = (input: any) => {
    const raw = String(input ?? '').trim();
    const upper = raw.toUpperCase();
    if (!upper || upper === '-') return { rank: 9999, num: 0, raw: upper };
    if (upper === '均码' || upper === 'ONE SIZE' || upper === 'ONESIZE') return { rank: 55, num: 0, raw: upper };

    if (/^\d+(\.\d+)?$/.test(upper)) {
      const n = Number.parseFloat(upper);
      return { rank: 0, num: Number.isFinite(n) ? n : 0, raw: upper };
    }

    const mNumXL = upper.match(/^(\d+)XL$/);
    if (mNumXL) {
      const n = Number.parseInt(mNumXL[1], 10);
      const rank = 70 + Math.max(0, (Number.isFinite(n) ? n : 1) - 1) * 10;
      return { rank, num: 0, raw: upper };
    }

    const mXS = upper.match(/^(X{0,4})S$/);
    if (mXS) {
      const len = (mXS[1] || '').length;
      return { rank: 40 - len * 10, num: 0, raw: upper };
    }

    if (upper === 'M') return { rank: 50, num: 0, raw: upper };

    const mXL = upper.match(/^(X{1,4})L$/);
    if (mXL) {
      const len = (mXL[1] || '').length;
      return { rank: 60 + len * 10, num: 0, raw: upper };
    }

    if (upper === 'L') return { rank: 60, num: 0, raw: upper };
    return { rank: 5000, num: 0, raw: upper };
  };

  const compareSizeAsc = (a: any, b: any) => {
    const ka = parseSizeKey(a);
    const kb = parseSizeKey(b);
    if (ka.rank !== kb.rank) return ka.rank - kb.rank;
    if (ka.num !== kb.num) return ka.num - kb.num;
    return collator.compare(ka.raw, kb.raw);
  };

  const sizeNames = Array.from(new Set(sizeList.map((s: any) => String(s.sizeName || '').trim()).filter(Boolean)));
  const sortedSizeNames = [...sizeNames].sort(compareSizeAsc);
  const partNames = Array.from(new Set(sizeList.map((s: any) => String(s.partName || '').trim()).filter(Boolean)));
  const sizeCellMap: Record<string, unknown> = {};
  const partMethodMap: Record<string, string> = {};
  for (const row of sizeList) {
    const key = `${String(row.partName || '').trim()}__${String(row.sizeName || '').trim()}`;
    sizeCellMap[key] = row;
    const part = String(row.partName || '').trim();
    if (part && partMethodMap[part] == null) {
      partMethodMap[part] = String(row.measureMethod || '').trim();
    }
  }

  const sizeHeader = `<tr><th>部位(cm)</th><th>度量方式</th>${sortedSizeNames.map((s) => `<th>${esc(s)}</th>`).join('')}<th>公差(+/-)</th></tr>`;
  const sizeRows = (partNames as string[]).map((part) => {
    const partKey = String(part);
    let toleranceVal: string | null = null;
    const tds = sortedSizeNames.map((sn) => {
      const key = `${partKey}__${sn}`;
      const cell = sizeCellMap[key] as any;
      if (toleranceVal == null && cell?.tolerance != null) toleranceVal = String(cell.tolerance);
      const v = cell?.standardValue != null ? String(cell.standardValue) : '';
      return `<td>${esc(v)}</td>`;
    }).join('');
    const toleranceTd = toleranceVal != null ? `<td style="text-align:center">±${esc(toleranceVal)}</td>` : `<td style="text-align:center">-</td>`;
    return `<tr><td>${esc(partKey)}</td><td>${esc(partMethodMap[partKey] || '')}</td>${tds}${toleranceTd}</tr>`;
  }).join('');

  const coverFromAttachments = (attachments.find((a: any) => String(a?.fileType || '').includes('image')) as any)?.fileUrl;
  const coverUrl = resolveUrl(style.cover || coverFromAttachments || '');

  const rawReqText = String(style.description ?? '');
  const productionReqHtml = rawReqText
    ? rawReqText.split('\n').map(line => {
        const escaped = esc(line);
        if (line.trim() && !/^\s*\d/.test(line)) {
          return `<strong style="font-weight:700">${escaped}</strong>`;
        }
        return escaped;
      }).join('<br>')
    : '';

  const categoryText = toCategoryCn(style.category);
  const seasonText = toSeasonCn(style.season);

  const reviewStatusLabel = (s: unknown) => {
    if (s === 'PASS')   return '<span style="color:#52c41a;font-weight:600"> 通过</span>';
    if (s === 'REWORK') return '<span style="color:#faad14;font-weight:600"> 需修改</span>';
    if (s === 'REJECT') return '<span style="color:#ff4d4f;font-weight:600"> 不通过</span>';
    return '<span style="color:#aaa">未审核</span>';
  };
  const sampleReviewHtml = style.sampleReviewStatus ? `
    <div class="section">
      <div class="section-title">样衣审核</div>
      <table>
        <tbody>
          <tr><td style="width:100px">审核结论</td><td>${reviewStatusLabel(style.sampleReviewStatus)}</td></tr>
          <tr><td>审核人</td><td>${esc(style.sampleReviewer || '-')}</td></tr>
          <tr><td>审核时间</td><td>${esc(String(style.sampleReviewTime || '-').replace('T', ' ').slice(0, 16))}</td></tr>
          ${style.sampleReviewComment ? `<tr><td style="vertical-align:top">审核评语</td><td style="white-space:pre-wrap">${esc(style.sampleReviewComment)}</td></tr>` : ''}
        </tbody>
      </table>
    </div>` : '';

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>生产制单-${esc(style.styleNo || '')}</title>
  <style>
    @page { margin: 10mm; }
    body { font-family: system-ui, -apple-system, BlinkMacSystemFont, "'Segoe UI'", Roboto, "'Helvetica Neue'", Arial, "'Noto Sans'", "'Microsoft YaHei'", "'PingFang SC'", serif; color: #111; }
    .page { max-width: 980px; margin: 0 auto; padding: 0; }
    .header { display: grid; grid-template-columns: 220px 1fr; gap: 16px; align-items: start; }
    .cover { width: 220px; height: 220px; object-fit: cover; border-radius: 10px; border: 1px solid rgba(0,0,0,0.08); }
    .h1 { font-size: 22px; font-weight: 700; margin: 0 0 8px; }
    .meta { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6px 16px; }
    .meta div { font-size: 13px; color: rgba(0,0,0,0.85); }
    .muted { color: rgba(0,0,0,0.55); }
    .btn { height: 32px; padding: 4px 14px; border-radius: 6px; border: 1px solid rgba(0,0,0,0.15); background: #fff; font-size: 14px; font-weight: 600; cursor: pointer; }
    .btn:hover { border-color: #2D7FF9; color: #2D7FF9; }
    .btn:active { transform: translateY(0.5px); }
    .section { margin-top: 18px; }
    .section-title { font-weight: 700; font-size: 14px; margin-bottom: 8px; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; table-layout: fixed; }
    th, td { border: 1px solid #d1d5db; padding: 6px 8px; vertical-align: middle; text-align: center; overflow-wrap: anywhere; word-break: break-word; }
    th { background: rgba(0,0,0,0.03); text-align: center; }
    .no { width: 60px; text-align: center; }
    .req { white-space: pre-wrap; text-align: left; }
    @media print {
      .no-print { display: none; }
      .page { padding: 0; max-width: none; }
    }
  </style>
</head>
<body>
  <div class="page">
    <div class="no-print" style="display:flex; gap:8px; justify-content:flex-end; margin-bottom:10px;">
      <button class="btn" onclick="window.print()">打印</button>
    </div>
    <div class="header">
      <img loading="lazy" class="cover" src="${esc(coverUrl)}" onerror="this.style.display='none'" />
      <div>
        <div class="h1">生产制单</div>
        <div class="meta">
          <div>款号：${esc(style.styleNo || '')}</div>
          <div>款名：${esc(style.styleName || '')}</div>
          <div>品类：${esc(categoryText)}</div>
          <div>季节：${esc(seasonText)}</div>
          <div>颜色：${esc(style.color || '')}</div>
          <div>码数：${esc(style.size || '')}</div>
        </div>
      </div>
    </div>

    <div class="section">
      <div class="section-title">生产要求</div>
      <div style="line-height:1.8;padding:8px 10px;border:1px solid #d9d9d9;border-radius:4px;min-height:40px;font-size:13px">${productionReqHtml || '<span style="color:#bfbfbf">暂无生产要求</span>'}</div>
    </div>

    ${sampleReviewHtml}

    <div class="section">
      <div class="section-title">尺寸表</div>
      <table>
        <thead>${sizeHeader}</thead>
        <tbody>${sizeRows}</tbody>
      </table>
    </div>
  </div>
</body>
</html>`;
};
