import { useState, useEffect } from 'react';
import { Alert, Radio, Button, Spin } from 'antd';
import { PrinterOutlined } from '@ant-design/icons';
import ResizableModal from '@/components/common/ResizableModal';
import { parseProductionOrderLines } from '@/utils/api';
import type { ProductionOrder } from '@/types/production';
import { buildWashLabelSections, getDisplayWashCareCodes, parseWashNotePerPart } from '@/utils/washLabel';
import { getStyleInfoByRef } from '@/services/style/styleApi';
import { safePrint } from '@/utils/safePrint';
import { parseCareIconCodes, CARE_ICONS } from '@/utils/careIcons';

type PaperSize = '30x80' | '40x60' | '50x80' | '60x90';

const PAPER_OPTS: { value: PaperSize; label: string; w: number; h: number }[] = [
  { value: '30x80', label: '30×80mm（默认水唛）',  w: 30, h: 80 },
  { value: '40x60', label: '40×60mm（小水唛）',  w: 40, h: 60 },
  { value: '50x80', label: '50×80mm（标准水唛）', w: 50, h: 80 },
  { value: '60x90', label: '60×90mm（大水唛）',   w: 60, h: 90 },
];

interface StyleData {
  fabricComposition?: string;
  fabricCompositionParts?: string;
  washInstructions?: string;
  washTempCode?: string;
  bleachCode?: string;
  tumbleDryCode?: string;
  ironCode?: string;
  dryCleanCode?: string;
  careIconCodes?: string;
}
interface Props { open: boolean; onCancel: () => void; order: ProductionOrder | null; }

function buildCareIconsHtml(s: StyleData): string {
  const explicitCodes = parseCareIconCodes(s.careIconCodes);
  let codes: string[] = explicitCodes.length > 0 ? explicitCodes : [];
  if (!codes.length) {
    const legacy = getDisplayWashCareCodes(s, s.washInstructions);
    codes = [
      legacy.washTempCode ? `wash_${legacy.washTempCode}` : '',
      legacy.bleachCode ? `bleach_${legacy.bleachCode}` : '',
      legacy.tumbleDryCode ? `dry_${legacy.tumbleDryCode}` : '',
      legacy.ironCode ? `iron_${legacy.ironCode}` : '',
      legacy.dryCleanCode ? `dryclean_${legacy.dryCleanCode}` : '',
    ].filter(Boolean);
  }
  if (!codes.length) return '';

  // 按类别分组：水洗 → 漂白 → 烘干 → 熨烫 → 干洗 → 自然晾干 → 特殊处理
  const categoryOrder = ['wash', 'bleach', 'dry', 'iron', 'dryclean', 'naturaldry', 'special'];
  const groups: Record<string, string[]> = {};
  codes.forEach(code => {
    const def = CARE_ICONS[code];
    if (!def) return;
    const cat = def.category;
    if (!groups[cat]) groups[cat] = [];
    groups[cat].push(def.svg);
  });

  const rows = categoryOrder
    .filter(cat => groups[cat]?.length)
    .map(cat => `<div class="icon-row">${groups[cat].map(svg => `<span class="icon-cell">${svg}</span>`).join('')}</div>`)
    .join('');

  return rows ? `<div class="icons">${rows}</div>` : '';
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
          careIconCodes:  d.careIconCodes,
        });
      })
      .catch((err) => { console.warn('[WashCare] 款式数据加载失败:', err?.message || err); setStyleData({}); })
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

    const washText = (() => {
      const perPartNotes = parseWashNotePerPart(styleData.fabricCompositionParts);
      const sectionKeys = sections.map(s => s.key);
      const firstPartNote = sectionKeys.length > 0 ? perPartNotes[sectionKeys[0]] : undefined;
      const raw = (firstPartNote !== undefined && firstPartNote.trim()) ? firstPartNote : (styleData.washInstructions || '');
      return raw.replace(/^洗涤说明[（(]水洗标专用[）)]\s*/u, '').trim();
    })();
    const html = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>洗水唛</title><style>
@page{size:${w}mm ${h}mm;margin:0}
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:${w}mm;min-height:${h}mm;font-family:'Microsoft YaHei','微软雅黑','PingFang SC','Heiti SC',Arial,serif}
.lbl{position:relative;width:${w}mm;height:${h}mm;padding:2mm 2.2mm;display:flex;flex-direction:column;align-items:center;justify-content:center}
.top-block{text-align:center;flex:0 0 auto;width:100%}
.style-no{font-size:${w <= 30 ? 5.8 : 6.2}pt;font-weight:bold;line-height:1.35;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;text-align:center}
.style-name{font-size:${w <= 30 ? 5.1 : 5.5}pt;line-height:1.35;margin-top:.8mm;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;text-align:center}
.content-block{flex:1 1 0;overflow:hidden;min-height:0;padding-top:1.5mm;width:100%;text-align:center}
.comp-block{margin:.3mm 0}
.comp-name{font-size:${w <= 30 ? 6.1 : 7}pt;font-weight:bold;display:block;margin-bottom:.6mm;text-align:center}
.comp-mats{font-size:${w <= 30 ? 7.1 : 6.5}pt;line-height:1.55;white-space:pre-wrap;font-weight:bold;text-align:center}
.wash-title{font-size:${w <= 30 ? 5.2 : 6}pt;line-height:1.5;color:#444;margin-bottom:.6mm;text-align:center}
.care-wash{font-size:${w <= 30 ? 5.2 : 6}pt;line-height:1.6;color:#444;white-space:pre-wrap;margin-top:1.6mm;text-align:center}
.bottom-block{flex:0 0 auto;display:flex;flex-direction:column;align-items:center;width:100%}
.icons{display:flex;flex-direction:column;gap:.8mm;align-items:center;width:100%;margin:1mm auto 0}
.icon-row{display:flex;gap:.6mm;align-items:center;justify-content:center;flex-wrap:wrap}
.icon-cell{width:5mm;height:5mm;display:flex;align-items:center;justify-content:center;flex:0 0 auto}
.icons svg{width:100%;height:100%}
.footer{margin-top:1.5mm;font-size:${w <= 30 ? 5.4 : 5.8}pt;font-weight:bold;letter-spacing:.6mm;line-height:1.3;text-align:center;white-space:nowrap}
.date{margin-top:1.5mm;font-size:${w <= 30 ? 5.2 : 6}pt;color:#777;text-align:center}
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

    safePrint(html);
    setPrinting(false);
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
            <div style={{ fontSize: 14, fontWeight: 600, color: '#666', marginBottom: 4 }}>款式信息</div>
            <div style={{ fontSize: 14 }}>
              款号：{order.styleNo || '-'}&nbsp;&nbsp;
              颜色：{colorSummary}
            </div>
            {buildWashLabelSections(styleData.fabricCompositionParts, styleData.fabricComposition).map(section => (
              <div key={section.key} style={{ fontSize: 14, color: '#555', marginTop: 4 }}>
                {section.key !== 'other' ? <b>{section.label}:</b> : null} {section.items.join(' / ')}
              </div>
            ))}
            {styleData.washInstructions && (
              <div style={{ fontSize: 14, color: '#555', marginTop: 2 }}>洗涤：{styleData.washInstructions}</div>
            )}
          </div>
        )}
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 8 }}>纸张规格</div>
          <Radio.Group id="washLabelPaperSize" value={paperSize} onChange={e => setPaperSize(e.target.value as PaperSize)}>
            {PAPER_OPTS.map(p => <Radio key={p.value} value={p.value}>{p.label}</Radio>)}
          </Radio.Group>
        </div>
        <div style={{ fontSize: 14, color: '#999', marginBottom: 16 }}>
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
