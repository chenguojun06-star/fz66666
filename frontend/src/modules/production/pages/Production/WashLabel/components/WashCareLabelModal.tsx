import { useState, useEffect } from 'react';
import { Alert, Radio, Button, Spin } from 'antd';
import { PrinterOutlined } from '@ant-design/icons';
import ResizableModal from '@/components/common/ResizableModal';
import { parseProductionOrderLines } from '@/utils/api';
import type { ProductionOrder } from '@/types/production';
import { buildWashLabelSections, getDisplayWashCareCodes } from '@/utils/washLabel';
import { getStyleInfoByRef } from '@/services/style/styleApi';

type PaperSize = '30x80' | '40x60' | '50x80' | '60x90';

const PAPER_OPTS: { value: PaperSize; label: string; w: number; h: number }[] = [
  { value: '30x80', label: '30×80mm（默认水唛）',  w: 30, h: 80 },
  { value: '40x60', label: '40×60mm（小水唛）',  w: 40, h: 60 },
  { value: '50x80', label: '50×80mm（标准水唛）', w: 50, h: 80 },
  { value: '60x90', label: '60×90mm（大水唛）',   w: 60, h: 90 },
];

interface StyleData {
  fabricComposition?: string;
  /** 多部位成分 JSON：[{part,materials}]，两件套/拼接款使用 */
  fabricCompositionParts?: string;
  washInstructions?: string;
  /** 洗涤温度代码：W30/W40/W60/W95/HAND/NO */
  washTempCode?: string;
  /** 漂白代码：ANY/NON_CHL/NO */
  bleachCode?: string;
  /** 烘干代码：NORMAL/LOW/NO */
  tumbleDryCode?: string;
  /** 熨烫代码：LOW/MED/HIGH/NO */
  ironCode?: string;
  /** 干洗代码：YES/NO */
  dryCleanCode?: string;
}
interface Props { open: boolean; onCancel: () => void; order: ProductionOrder | null; }

// ─── ISO 3758 洗护图标 SVG（内联，打印安全）─────────────────────────────────
function tubSvg(inner: string): string {
  return `<svg viewBox="0 0 20 20" width="22" height="22" xmlns="http://www.w3.org/2000/svg"><path d="M2,9 L2,17 Q2,19 4,19 L16,19 Q18,19 18,17 L18,9 Z" fill="none" stroke="#000" stroke-width="1.5" stroke-linejoin="round"/><line x1="1" y1="9" x2="19" y2="9" stroke="#000" stroke-width="1.5"/>${inner}</svg>`;
}
function triSvg(inner: string): string {
  return `<svg viewBox="0 0 20 20" width="22" height="22" xmlns="http://www.w3.org/2000/svg"><polygon points="10,2 19,18 1,18" fill="none" stroke="#000" stroke-width="1.5"/>${inner}</svg>`;
}
function sqSvg(inner: string): string {
  return `<svg viewBox="0 0 20 20" width="22" height="22" xmlns="http://www.w3.org/2000/svg"><rect x="2" y="2" width="16" height="16" fill="none" stroke="#000" stroke-width="1.5"/>${inner}</svg>`;
}
function ironSvg(dots: number, cross = false): string {
  const ds = Array.from({ length: dots }, (_, i) => `<circle cx="${7 + i * 3.5}" cy="13" r="1" fill="#000"/>`).join('');
  const cx = cross ? '<line x1="5" y1="9" x2="17" y2="16" stroke="#000" stroke-width="1.5"/><line x1="17" y1="9" x2="5" y2="16" stroke="#000" stroke-width="1.5"/>' : '';
  return `<svg viewBox="0 0 24 20" width="26" height="22" xmlns="http://www.w3.org/2000/svg"><path d="M2,17 L20,17 L22,11 C20,7 15,7 10,7 L5,7 Q3,7 2,10 Z" fill="none" stroke="#000" stroke-width="1.5" stroke-linejoin="round"/>${ds}${cx}</svg>`;
}
function circSvg(inner: string): string {
  return `<svg viewBox="0 0 20 20" width="22" height="22" xmlns="http://www.w3.org/2000/svg"><circle cx="10" cy="10" r="8" fill="none" stroke="#000" stroke-width="1.5"/>${inner}</svg>`;
}
const _X = '<line x1="5" y1="5" x2="15" y2="15" stroke="#000" stroke-width="1.5"/><line x1="15" y1="5" x2="5" y2="15" stroke="#000" stroke-width="1.5"/>';
const numTxt = (n: string) => `<text x="10" y="17" text-anchor="middle" font-size="6" fill="#000" font-family="Arial,sans-serif" font-weight="bold">${n}</text>`;
const CARE_SVGS: Record<string, string> = {
  wash_W30: tubSvg(numTxt('30°')), wash_W40: tubSvg(numTxt('40°')),
  wash_W60: tubSvg(numTxt('60°')), wash_W95: tubSvg(numTxt('95°')),
  wash_HAND: tubSvg('<path d="M7,17 L7,12 L9.5,12 L9.5,10.5 L12,10.5 L12,12 L14,12 L14,15 Q14,17 12,17 Z" fill="none" stroke="#000" stroke-width="1"/>'),
  wash_NO: tubSvg('<line x1="5" y1="10" x2="15" y2="17" stroke="#000" stroke-width="1.5"/><line x1="15" y1="10" x2="5" y2="17" stroke="#000" stroke-width="1.5"/>'),
  bleach_ANY: triSvg(''),
  bleach_NON_CHL: triSvg('<line x1="7" y1="18" x2="11" y2="10" stroke="#000" stroke-width="1.5"/>'),
  bleach_NO: triSvg(_X),
  dry_NORMAL: sqSvg('<circle cx="10" cy="10" r="5" fill="none" stroke="#000" stroke-width="1.2"/>'),
  dry_LOW: sqSvg('<circle cx="10" cy="10" r="5" fill="none" stroke="#000" stroke-width="1.2"/><circle cx="10" cy="10" r="1.5" fill="#000"/>'),
  dry_NO: sqSvg(_X),
  iron_LOW: ironSvg(1), iron_MED: ironSvg(2), iron_HIGH: ironSvg(3), iron_NO: ironSvg(0, true),
  dryclean_YES: circSvg('<text x="10" y="14.5" text-anchor="middle" font-size="9" fill="#000" font-family="Arial,sans-serif" font-style="italic">A</text>'),
  dryclean_NO: circSvg(_X),
};
function buildCareIconsHtml(s: StyleData): string {
  const codes = getDisplayWashCareCodes(s, s.washInstructions);
  const icons = [
    codes.washTempCode ? (CARE_SVGS[`wash_${codes.washTempCode}`] ?? '') : '',
    codes.bleachCode ? (CARE_SVGS[`bleach_${codes.bleachCode}`] ?? '') : '',
    codes.tumbleDryCode ? (CARE_SVGS[`dry_${codes.tumbleDryCode}`] ?? '') : '',
    codes.ironCode ? (CARE_SVGS[`iron_${codes.ironCode}`] ?? '') : '',
    codes.dryCleanCode ? (CARE_SVGS[`dryclean_${codes.dryCleanCode}`] ?? '') : '',
  ].filter(Boolean);
  if (!icons.length) return '';
  return `<div class="icons">${icons.map(icon => `<span class="icon-cell">${icon}</span>`).join('')}</div>`;
}

export default function WashCareLabelModal({ open, onCancel, order }: Props) {
  const [loading, setLoading]     = useState(false);
  const [styleData, setStyleData] = useState<StyleData>({});
  const [paperSize, setPaperSize] = useState<PaperSize>('30x80');
  const [printing, setPrinting]   = useState(false);

  const styleId = (order as any)?.styleId as string | undefined;

  useEffect(() => {
    if (!open || !styleId) { setStyleData({}); return; }
    setLoading(true);
    getStyleInfoByRef(styleId, order?.styleNo)
      .then((styleInfo: any) => {
        const d = styleInfo ?? {};
        setStyleData({
          fabricComposition:      d.fabricComposition,
          fabricCompositionParts: d.fabricCompositionParts,
          washInstructions:       d.washInstructions,
          washTempCode:   d.washTempCode,
          bleachCode:     d.bleachCode,
          tumbleDryCode:  d.tumbleDryCode,
          ironCode:       d.ironCode,
          dryCleanCode:   d.dryCleanCode,
        });
      })
      .catch(() => setStyleData({}))
      .finally(() => setLoading(false));
  }, [open, order?.styleNo, styleId]);

  const noInfo = !styleData.fabricComposition && !styleData.fabricCompositionParts && !styleData.washInstructions;
  const paper  = PAPER_OPTS.find(p => p.value === paperSize)!;
  const colorSummary = order
    ? (() => {
        const colors = Array.from(new Set(
          parseProductionOrderLines(order)
            .map((item) => String(item.color || '').trim())
            .filter(Boolean),
        ));
        if (colors.length > 0) return colors.join(' / ');
        return String(order.color || '').trim() || '-';
      })()
    : '-';

  const handlePrint = () => {
    if (!order) return;
    setPrinting(true);
    const { w, h } = paper;

    // ── 多部位成分 ─────────────────────────────────────────────────────────
    const sections = buildWashLabelSections(styleData.fabricCompositionParts, styleData.fabricComposition);
    const showPartTitle = sections.length > 1;
    const compositionHtml = sections.map(section =>
      `<div class="comp-block">${showPartTitle && section.key !== 'other' ? `<span class="comp-name">${section.label}:</span>` : ''}` +
      `<div class="comp-mats">${section.items.join('<br/>')}</div></div>`
    ).join('') || '<div class="comp-mats">（成分未填写）</div>';

    // ── 图标行 ─────────────────────────────────────────────────────────────
    const careIconRow = buildCareIconsHtml(styleData);

    // ── 日期（YYYYMMDD 格式）──────────────────────────────────────────────
    const now     = new Date();
    const dateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;

    const washText = (styleData.washInstructions || '').replace(/^洗涤说明[（(]水洗标专用[）)]\s*/u, '').trim();
    const html = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>洗水唛</title><style>
@page{size:${w}mm ${h}mm;margin:0}
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:${w}mm;min-height:${h}mm;font-family:Arial,"Microsoft YaHei",sans-serif}
.lbl{position:relative;width:${w}mm;height:${h}mm;padding:0 2.2mm}
.top-block{position:absolute;left:2.2mm;right:2.2mm;top:15mm;text-align:center}
.style-no{font-size:${w <= 30 ? 5.8 : 6.2}pt;font-weight:bold;line-height:1.35;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.style-name{font-size:${w <= 30 ? 5.1 : 5.5}pt;line-height:1.35;margin-top:.8mm;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.content-block{position:absolute;left:2.2mm;right:2.2mm;top:24mm;bottom:24mm;overflow:hidden}
.comp-block{margin:.3mm 0}
.comp-name{font-size:${w <= 30 ? 6.1 : 7}pt;font-weight:bold;display:block;margin-bottom:.6mm}
.comp-mats{font-size:${w <= 30 ? 7.1 : 6.5}pt;line-height:1.55;white-space:pre-wrap;padding-left:${w <= 30 ? 0 : 3}mm;font-weight:bold}
.wash-title{font-size:${w <= 30 ? 5.2 : 6}pt;line-height:1.5;color:#444;margin-bottom:.6mm}
.care-wash{font-size:${w <= 30 ? 5.2 : 6}pt;line-height:1.6;color:#444;white-space:pre-wrap;margin-top:1.6mm}
.bottom-block{position:absolute;left:2.2mm;right:2.2mm;bottom:6.5mm;display:flex;flex-direction:column;align-items:center}
.icons{display:flex;gap:.45mm;align-items:center;justify-content:center;flex-wrap:nowrap;width:100%;margin:1.8mm auto 0;min-height:6mm}
.icon-cell{width:4.8mm;height:4.8mm;display:flex;align-items:center;justify-content:center;flex:0 0 auto}
.icons svg{width:100%;height:100%}
.footer{margin-top:2.1mm;font-size:${w <= 30 ? 5.4 : 5.8}pt;font-weight:bold;letter-spacing:.6mm;line-height:1.3;text-align:center;white-space:nowrap}
.date{margin-top:2.2mm;font-size:${w <= 30 ? 5.2 : 6}pt;color:#777;text-align:center}
</style></head><body><div class="lbl">
  <div class="top-block">
    <div class="style-no">款号：${order.styleNo || '-'}</div>
    <div class="style-name">款名：${order.styleName || '-'}</div>
  </div>
  <div class="content-block">
    ${compositionHtml}
    ${washText ? `<div class="wash-title">洗涤说明</div><div class="care-wash">${washText}</div>` : ''}
  </div>
  <div class="bottom-block">
    ${careIconRow || ''}
    <div class="footer">MADE IN CHINA</div>
    <div class="date">${dateStr}</div>
  </div>
</div></body></html>`;

    const iframe = document.createElement('iframe');
    iframe.style.cssText = 'position:fixed;left:-9999px;top:-9999px;width:0;height:0;border:none;';
    document.body.appendChild(iframe);
    const doc = iframe.contentWindow?.document;
    if (doc) {
      doc.open(); doc.write(html); doc.close();
      setTimeout(() => {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
        setTimeout(() => { try { document.body.removeChild(iframe); } catch { /**/ } }, 1000);
        setPrinting(false);
      }, 200);
    } else {
      setPrinting(false);
    }
  };

  return (
    <ResizableModal title="打印洗水唛" open={open} onCancel={onCancel} width="40vw" footer={null} destroyOnHidden>
      <Spin spinning={loading}>
        {noInfo && !loading && (
          <Alert
            title="面料成分或洗涤说明未填写"
            description="请先在款式基本信息中完善面料成分和洗涤说明后再打印洗水唛"
            type="warning" showIcon style={{ marginBottom: 16 }}
          />
        )}
        {order && (
          <div style={{ background: '#f8f9fa', borderRadius: 6, padding: '10px 14px', marginBottom: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#666', marginBottom: 4 }}>款式信息</div>
            <div style={{ fontSize: 13 }}>
              款号：{order.styleNo || '-'}&nbsp;&nbsp;
              颜色：{colorSummary}
            </div>
            {buildWashLabelSections(styleData.fabricCompositionParts, styleData.fabricComposition).map(section => (
              <div key={section.key} style={{ fontSize: 12, color: '#555', marginTop: 4 }}>
                {section.key !== 'other' ? <b>{section.label}:</b> : null} {section.items.join(' / ')}
              </div>
            ))}
            {styleData.washInstructions && (
              <div style={{ fontSize: 12, color: '#555', marginTop: 2 }}>洗涤：{styleData.washInstructions}</div>
            )}
          </div>
        )}
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 8 }}>纸张规格</div>
          <Radio.Group value={paperSize} onChange={e => setPaperSize(e.target.value as PaperSize)}>
            {PAPER_OPTS.map(p => <Radio key={p.value} value={p.value}>{p.label}</Radio>)}
          </Radio.Group>
        </div>
        <div style={{ fontSize: 12, color: '#999', marginBottom: 16 }}>
          提示：建议使用专用标签打印机，或A4纸打印后裁剪。
        </div>
      </Spin>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
        <Button onClick={onCancel}>取消</Button>
        <Button type="primary" icon={<PrinterOutlined />} loading={printing} onClick={handlePrint}>
          打印标签
        </Button>
      </div>
    </ResizableModal>
  );
}
