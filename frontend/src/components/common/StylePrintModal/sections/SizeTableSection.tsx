/**
 * 尺寸表区块 — 分组+参考图布局（与纸样开发Tab保持一致）
 * 提取自 index.tsx
 */
import React from 'react';
import { Image } from 'antd';
import { sortSizeNames } from '@/utils/api/size';
import { getFullAuthedFileUrl } from '@/utils/fileUrl';

interface SizeTableSectionProps {
  sizes: any[];
}

const SizeTableSection: React.FC<SizeTableSectionProps> = ({ sizes }) => {
  if (!sizes || sizes.length === 0) return null;

  // ─── 分组辅助（与 StyleSizeTab 同逻辑）───
  const _inferGroup = (pn: string): string => {
    const n = String(pn || '').replace(/\s+/g, '').toLowerCase();
    if (!n) return '其他区';
    const upper = ['衣长','胸围','肩宽','袖长','袖口','袖肥','领围','领宽','领深','门襟','胸宽','摆围','下摆','前长','后长','前胸','后背','袖窿'];
    const lower = ['裤长','腰围','臀围','前浪','后浪','脚口','裤口','腿围','小腿围','大腿围','膝围','坐围','裆','裙长','裙摆'];
    if (upper.some(k => n.includes(k))) return '上装区';
    if (lower.some(k => n.includes(k))) return '下装区';
    return '其他区';
  };
  const _resolveGroup = (gName?: string, pName?: string) => {
    const g = String(gName || '').trim();
    return g || _inferGroup(String(pName || ''));
  };

  // ─── 收集所有尺码并排序 ───
  const sizeNames = [...new Set(sizes.map((s: any) => s.sizeName).filter(Boolean))];
  const sortedSizeNames = sortSizeNames([...sizeNames]);

  // ─── 按 sort 字段预排序，与 Tab 保持一致 ───
  const sortedSizes = [...sizes].sort((a: any, b: any) => (a.sort || 0) - (b.sort || 0));

  // ─── 构建部位矩阵行 ───
  type PrintRow = { resolvedGroupName: string; partName: string; measureMethod: string; tolerance: number | null; cells: Record<string, number | null>; };
  const partMap = new Map<string, PrintRow>();
  const groupOrder: string[] = [];
  const partOrderPerGroup = new Map<string, string[]>();

  sortedSizes.forEach((s: any) => {
    const rg = _resolveGroup(s.groupName, s.partName);
    const pk = `${rg}::${s.partName}`;
    if (!partMap.has(pk)) {
      partMap.set(pk, { resolvedGroupName: rg, partName: s.partName || '', measureMethod: s.measureMethod || '', tolerance: null, cells: {} });
      if (!groupOrder.includes(rg)) { groupOrder.push(rg); partOrderPerGroup.set(rg, []); }
      partOrderPerGroup.get(rg)!.push(s.partName || '');
    }
    const row = partMap.get(pk)!;
    row.cells[s.sizeName] = s.standardValue != null ? Number(s.standardValue) : null;
    if (row.tolerance === null && s.tolerance != null) row.tolerance = Number(s.tolerance);
  });

  // ─── 每分组取首条有图的记录作参考图（最多2张）───
  const groupImages = new Map<string, string[]>();
  sortedSizes.forEach((s: any) => {
    if (!s.imageUrls) return;
    const rg = _resolveGroup(s.groupName, s.partName);
    if (!groupImages.has(rg)) {
      try { const p: string[] = JSON.parse(s.imageUrls); if (p.length) groupImages.set(rg, p.slice(0, 2)); } catch { /* skip */ }
    }
  });

  // ─── 构建扁平展示行（含 rowspan 元数据）───
  type FlatRow = PrintRow & { key: string; isGroupStart: boolean; groupSpan: number; chunkImgs: string[]; isImgStart: boolean; imgSpan: number; };
  const flatRows: FlatRow[] = [];
  groupOrder.forEach(rg => {
    const parts = partOrderPerGroup.get(rg) || [];
    const imgs = groupImages.get(rg) || [];
    parts.forEach((pn, i) => {
      flatRows.push({ ...partMap.get(`${rg}::${pn}`)!, key: `${rg}::${pn}`, isGroupStart: i === 0, groupSpan: i === 0 ? parts.length : 0, chunkImgs: i === 0 ? imgs : [], isImgStart: i === 0, imgSpan: i === 0 ? parts.length : 0 });
    });
  });

  return (
    <table className="pt" style={{ marginBottom: 12, tableLayout: 'fixed' }}>
      <thead>
        <tr>
          <th style={{ width: 160 }}>参考图</th>
          <th style={{ width: 60 }}>分组</th>
          <th style={{ width: 60, textAlign: 'left' }}>部位(cm)</th>
          <th style={{ width: 100 }}>度量方式</th>
          {sortedSizeNames.map((sn: string) => <th key={sn} style={{ width: 60 }}>{sn}</th>)}
          <th style={{ width: 60 }}>公差(+/-)</th>
        </tr>
      </thead>
      <tbody>
        {flatRows.map(row => (
          <tr key={row.key}>
            {row.isImgStart && (
              <td rowSpan={row.imgSpan} style={{ verticalAlign: 'top', textAlign: 'center', padding: 6 }}>
                {row.chunkImgs.length > 0
                  ? <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'stretch' }}>
                      {row.chunkImgs.map((url: string) => (
                        <Image key={url} src={getFullAuthedFileUrl(url)} style={{ width: '100%', height: row.chunkImgs.length > 1 ? 120 : 220, objectFit: 'contain', borderRadius: 8, border: '1px solid #eee', background: 'var(--color-bg-base)', padding: 4, boxSizing: 'border-box' as const }} preview={{ cover: <span>预览</span> }} />
                      ))}
                    </div>
                  : <span style={{ color: '#ccc', fontSize: 12 }}>无图</span>
                }
              </td>
            )}
            {row.isGroupStart && (
              <td rowSpan={row.groupSpan} style={{ verticalAlign: 'top', textAlign: 'center', fontWeight: 600 }}>
                {row.resolvedGroupName}
              </td>
            )}
            <td>{row.partName}</td>
            <td style={{ textAlign: 'center' }}>{row.measureMethod || '平量'}</td>
            {sortedSizeNames.map((sn: string) => (
              <td key={sn} style={{ textAlign: 'center' }}>{row.cells[sn] != null ? row.cells[sn] : '-'}</td>
            ))}
            <td style={{ textAlign: 'center' }}>{row.tolerance != null ? `±${row.tolerance}` : '-'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
};

export default SizeTableSection;
