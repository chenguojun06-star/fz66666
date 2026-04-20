/**
 * 打印标签弹窗（双 Tab）
 *  Tab 1 — 打印洗水唛：按 SKU 展示可编辑打印数，生成洗水唛标签
 *  Tab 2 — 打印U编码：按 SKU 展示可编辑打印数，生成 U 编码 / QR 标签
 */
import { useCallback, useEffect, useState } from 'react';
import { Button, Checkbox, InputNumber, Radio, Space, Spin, Tabs, Tag } from 'antd';
import { PrinterOutlined } from '@ant-design/icons';
import QRCode from 'qrcode';
import ResizableModal from '@/components/common/ResizableModal';
import type { ApiResult } from '@/utils/api';
import ResizableTable from '@/components/common/ResizableTable';
import api, { parseProductionOrderLines } from '@/utils/api';
import type { ProductionOrder } from '@/types/production';
import type { ColumnsType } from 'antd/es/table';
import { StyleCoverThumb } from '@/components/StyleAssets';
import { buildWashLabelSections, getDisplayWashCareCodes, parseWashNotePerPart } from '@/utils/washLabel';
import { safePrint } from '@/utils/safePrint';

// ─── 共用类型 ─────────────────────────────────────────────────────────────────

export interface LabelStyleInfo {
  fabricComposition?: string;
  /** 套装多部位成分 JSON，格式：[{"part":"上装","materials":"棉80%..."},...] */
  fabricCompositionParts?: string;
  washInstructions?: string;
  uCode?: string;
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

// ─── 洗涤护理图标 SVG（ISO 3758 标准符号，内联 SVG，打印安全）─────────────────

function tubSvg(inner: string): string {
  return `<svg viewBox="0 0 20 20" width="20" height="20" xmlns="http://www.w3.org/2000/svg">
    <path d="M2,9 L2,17 Q2,19 4,19 L16,19 Q18,19 18,17 L18,9 Z" fill="none" stroke="#000" stroke-width="1.5" stroke-linejoin="round"/>
    <line x1="1" y1="9" x2="19" y2="9" stroke="#000" stroke-width="1.5"/>
    ${inner}</svg>`;
}
function triSvg(inner: string): string {
  return `<svg viewBox="0 0 20 20" width="20" height="20" xmlns="http://www.w3.org/2000/svg">
    <polygon points="10,2 19,18 1,18" fill="none" stroke="#000" stroke-width="1.5"/>
    ${inner}</svg>`;
}
function sqSvg(inner: string): string {
  return `<svg viewBox="0 0 20 20" width="20" height="20" xmlns="http://www.w3.org/2000/svg">
    <rect x="2" y="2" width="16" height="16" fill="none" stroke="#000" stroke-width="1.5"/>
    ${inner}</svg>`;
}
function ironSvg(dots: number, cross = false): string {
  const ds = Array.from({ length: dots }, (_, i) =>
    `<circle cx="${7 + i * 3.5}" cy="13" r="1" fill="#000"/>`).join('');
  const cx = cross
    ? '<line x1="5" y1="9" x2="17" y2="16" stroke="#000" stroke-width="1.5"/><line x1="17" y1="9" x2="5" y2="16" stroke="#000" stroke-width="1.5"/>'
    : '';
  return `<svg viewBox="0 0 24 20" width="24" height="20" xmlns="http://www.w3.org/2000/svg">
    <path d="M2,17 L20,17 L22,11 C20,7 15,7 10,7 L5,7 Q3,7 2,10 Z" fill="none" stroke="#000" stroke-width="1.5" stroke-linejoin="round"/>
    ${ds}${cx}</svg>`;
}
function circSvg(inner: string): string {
  return `<svg viewBox="0 0 20 20" width="20" height="20" xmlns="http://www.w3.org/2000/svg">
    <circle cx="10" cy="10" r="8" fill="none" stroke="#000" stroke-width="1.5"/>
    ${inner}</svg>`;
}

const X = '<line x1="5" y1="5" x2="15" y2="15" stroke="#000" stroke-width="1.5"/><line x1="15" y1="5" x2="5" y2="15" stroke="#000" stroke-width="1.5"/>';
const numTxt = (n: string) =>
  `<text x="10" y="17" text-anchor="middle" font-size="6" fill="#000" font-family="Arial,serif" font-weight="bold">${n}</text>`;

// 映射: 字段前缀_CODE → SVG 字符串
const CARE_SVGS: Record<string, string> = {
  wash_W30:  tubSvg(numTxt('30°')),
  wash_W40:  tubSvg(numTxt('40°')),
  wash_W60:  tubSvg(numTxt('60°')),
  wash_W95:  tubSvg(numTxt('95°')),
  wash_HAND: tubSvg('<path d="M7,17 L7,12 L9.5,12 L9.5,10.5 L12,10.5 L12,12 L14,12 L14,15 Q14,17 12,17 Z" fill="none" stroke="#000" stroke-width="1"/>'),
  wash_NO:   tubSvg('<line x1="5" y1="10" x2="15" y2="17" stroke="#000" stroke-width="1.5"/><line x1="15" y1="10" x2="5" y2="17" stroke="#000" stroke-width="1.5"/>'),
  bleach_ANY:     triSvg(''),
  bleach_NON_CHL: triSvg('<line x1="7" y1="18" x2="11" y2="10" stroke="#000" stroke-width="1.5"/>'),
  bleach_NO:      triSvg(X),
  dry_NORMAL: sqSvg('<circle cx="10" cy="10" r="5" fill="none" stroke="#000" stroke-width="1.2"/>'),
  dry_LOW:    sqSvg('<circle cx="10" cy="10" r="5" fill="none" stroke="#000" stroke-width="1.2"/><circle cx="10" cy="10" r="1.5" fill="#000"/>'),
  dry_NO:     sqSvg(X),
  iron_LOW:   ironSvg(1),
  iron_MED:   ironSvg(2),
  iron_HIGH:  ironSvg(3),
  iron_NO:    ironSvg(0, true),
  dryclean_YES: circSvg('<text x="10" y="14.5" text-anchor="middle" font-size="9" fill="#000" font-family="Arial,serif" font-style="italic">A</text>'),
  dryclean_NO:  circSvg(X),
};

// 默认固定5个洗护图标（适用于所有未配置护理代码的款式）
// 截图标准：30°水洗 / 不可漂白 / 可滚筒烘干 / 低温熨烫 / A干洗
const DEFAULT_CARE_ICONS: string[] = [
  CARE_SVGS['wash_W30'],
  CARE_SVGS['bleach_NO'],
  CARE_SVGS['dry_NORMAL'],
  CARE_SVGS['iron_LOW'],
  CARE_SVGS['dryclean_YES'],
];

function buildCareIconsHtml(s: LabelStyleInfo | null | undefined): string {
  let icons: string[] = [];
  if (s) {
    const codes = getDisplayWashCareCodes(s, s.washInstructions);
    icons = [
      codes.washTempCode ? (CARE_SVGS[`wash_${codes.washTempCode}`] ?? '') : '',
      codes.bleachCode ? (CARE_SVGS[`bleach_${codes.bleachCode}`] ?? '') : '',
      codes.tumbleDryCode ? (CARE_SVGS[`dry_${codes.tumbleDryCode}`] ?? '') : '',
      codes.ironCode ? (CARE_SVGS[`iron_${codes.ironCode}`] ?? '') : '',
      codes.dryCleanCode ? (CARE_SVGS[`dryclean_${codes.dryCleanCode}`] ?? '') : '',
    ].filter(Boolean);
  }
  // 款式未配置护理代码时，自动使用默认的通用5个标准图标
  const finalIcons = icons.length > 0 ? icons : DEFAULT_CARE_ICONS;
  return `<div class="icons">${finalIcons.map(icon => `<span class="icon-cell">${icon}</span>`).join('')}</div>`;
}

interface Props {
  open: boolean;
  onClose: () => void;
  order: ProductionOrder | null;
  styleInfo: LabelStyleInfo | null;
}

// ─── 共用：SKU 行类型 ─────────────────────────────────────────────────────────

interface SkuRow {
  key: string;
  color: string;
  size: string;
  quantity: number;   // 下单数
  printCount: number; // 打印数（可编辑，默认=下单数）
  sku: string;        // 款号-颜色-尺码
  styleImageUrl?: string; // 款式封面图
  styleId?: string;
  styleNo?: string;
}

// ─── 加载 SKU 列表 ────────────────────────────────────────────────────────────

async function loadSkuRows(order: ProductionOrder): Promise<SkuRow[]> {
  try {
    const res = await (api as any).get(
      `/production/scan/sku/query?type=list&orderNo=${encodeURIComponent(order.orderNo || '')}`
    );
    const list: any[] = Array.isArray(res) ? res : (Array.isArray(res?.data) ? res.data : []);
    if (list.length > 0) {
      return list.map((item: any) => {
        const color = String(item.color ?? '');
        const size = String(item.size ?? '');
        const quantity = Number(item.quantity ?? 0);
        const sku = String(item.sku ?? item.skuCode ?? `${order.styleNo || ''}-${color}-${size}`);
        return { key: `${color}__${size}`, color, size, quantity, printCount: quantity, sku, styleImageUrl: order.styleCover || '', styleId: order.styleId || '', styleNo: order.styleNo || '' };
      });
    }
  } catch { /* ignore */ }
  const detailLines = parseProductionOrderLines(order);
  if (detailLines.length > 0) {
    const grouped = new Map<string, SkuRow>();
    detailLines.forEach((item) => {
      const color = String(item.color || '').trim() || String(order.color || '').trim() || '-';
      const size = String(item.size || '').trim() || String(order.size || '').trim() || '-';
      const quantity = Number(item.quantity || 0) || 0;
      const key = `${color}__${size}`;
      const existing = grouped.get(key);
      if (existing) {
        existing.quantity += quantity;
        existing.printCount += quantity;
        return;
      }
      grouped.set(key, {
        key,
        color,
        size,
        quantity,
        printCount: quantity,
        sku: String(item.skuNo || `${order.styleNo || ''}-${color}-${size}`),
        styleImageUrl: order.styleCover || '',
        styleId: order.styleId || '',
        styleNo: order.styleNo || '',
      });
    });
    return Array.from(grouped.values());
  }
  return [{
    key: `${order.color ?? ''}__${order.size ?? ''}`,
    color: order.color || '-',
    size: order.size || '-',
    quantity: order.orderQuantity || 0,
    printCount: order.orderQuantity || 0,
    sku: `${order.styleNo || ''}-${order.color || ''}-${order.size || ''}`,
    styleImageUrl: order.styleCover || '',
    styleId: order.styleId || '',
    styleNo: order.styleNo || '',
  }];
}

// ─── 共用 SKU 表格组件 ────────────────────────────────────────────────────────

interface SkuTableProps {
  open: boolean;
  order: ProductionOrder | null;
  styleInfo: LabelStyleInfo | null;
  printColLabel: string;
  onPrint: (selected: SkuRow[], order: ProductionOrder, styleInfo: LabelStyleInfo | null) => Promise<void>;
  onClose: () => void;
}

function SkuTable({ open, order, styleInfo, printColLabel, onPrint, onClose }: SkuTableProps) {
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<SkuRow[]>([]);
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const [printing, setPrinting] = useState(false);

  useEffect(() => {
    if (!open || !order) { setRows([]); setSelectedKeys([]); return; }
    setLoading(true);
    void loadSkuRows(order).then(loaded => {
      setRows(loaded);
      setSelectedKeys(loaded.map(r => r.key));
    }).finally(() => setLoading(false));
  }, [open, order?.orderNo]);

  const allSelected = rows.length > 0 && rows.every(r => selectedKeys.includes(r.key));
  const partialSelected = rows.some(r => selectedKeys.includes(r.key)) && !allSelected;

  const toggleAll = () => {
    const keys = rows.map(r => r.key);
    if (allSelected) setSelectedKeys(prev => prev.filter(k => !keys.includes(k)));
    else setSelectedKeys(prev => [...new Set([...prev, ...keys])]);
  };

  const toggleRow = (key: string, checked: boolean) =>
    setSelectedKeys(prev => checked ? [...prev, key] : prev.filter(k => k !== key));

  const updatePrintCount = (key: string, val: number | null) =>
    setRows(prev => prev.map(r => r.key === key ? { ...r, printCount: Math.max(0, val ?? 0) } : r));

  const handlePrint = async () => {
    if (!order) return;
    const selected = rows.filter(r => selectedKeys.includes(r.key));
    if (!selected.length) return;
    setPrinting(true);
    try { await onPrint(selected, order, styleInfo); }
    finally { setPrinting(false); }
  };

  const columns: ColumnsType<SkuRow> = [
    {
      title: <Checkbox id="labelSelectAll" checked={allSelected} indeterminate={partialSelected} onChange={toggleAll} />,
      width: 36, key: 'chk',
      render: (_: unknown, r: SkuRow) =>
        <Checkbox id={`labelRow-${r.key}`} checked={selectedKeys.includes(r.key)} onChange={e => toggleRow(r.key, e.target.checked)} />,
    },
    {
      title: '款式图片', key: 'styleImage', width: 68,
      render: (_: unknown, r: SkuRow) => (
        <StyleCoverThumb src={r.styleImageUrl || null} styleId={r.styleId} styleNo={r.styleNo} size={48} borderRadius={4} />
      ),
    },
    {
      title: 'SKU', dataIndex: 'sku', key: 'sku', width: 160,
      render: (v: string) => <span style={{ fontSize: 12 }}>{v || '-'}</span>,
    },
    {
      title: '颜色', dataIndex: 'color', key: 'color', width: 100,
      render: (v: string) => <Tag color="blue">{v || '-'}</Tag>,
    },
    {
      title: '尺码', dataIndex: 'size', key: 'size', width: 90,
      render: (v: string) => <Tag>{v || '-'}</Tag>,
    },
    { title: '下单数', dataIndex: 'quantity', key: 'qty', width: 80, align: 'right' as const },
    {
      title: printColLabel, key: 'printCount', width: 140,
      render: (_: unknown, r: SkuRow) => (
        <InputNumber
          min={0} max={99999} value={r.printCount} size="small" style={{ width: 110 }}
          onChange={v => updatePrintCount(r.key, v)}
        />
      ),
    },
  ];

  return (
    <div>
      <Spin spinning={loading}>
        <ResizableTable
          dataSource={rows}
          columns={columns}
          pagination={false}
          rowKey="key"
          size="small"
          bordered
          scroll={{ y: 320 }}
        />
      </Spin>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
        <Button onClick={onClose}>关闭</Button>
        <Button
          type="primary" icon={<PrinterOutlined />} loading={printing}
          disabled={!selectedKeys.length}
          onClick={() => void handlePrint()}
        >
          网页批量打印
        </Button>
      </div>
    </div>
  );
}

// ─── 洗水唛打印函数 ────────────────────────────────────────────────────────────

async function printWashLabels(
  selected: SkuRow[],
  order: ProductionOrder,
  styleInfo: LabelStyleInfo | null,
  w: number,
  h: number,
  suitPart: string = 'all',
): Promise<void> {
  const fs = w >= 45 ? 6.5 : 5.5;

  // 面料成分：优先解析多部位 JSON（支持任意套装件数），否则取单行文本
  const allSections = buildWashLabelSections(styleInfo?.fabricCompositionParts, styleInfo?.fabricComposition);
  const sections = suitPart !== 'all' ? allSections.filter(s => s.key === suitPart) : allSections;
  const showPartTitle = sections.length > 1;
  let compositionHtml = sections.map(section => `
    <div class="comp-block">
      ${showPartTitle && section.key !== 'other' ? `<span class="comp-name">${section.label}</span>` : ''}
      <span class="comp-mats">${section.items.join('<br/>')}</span>
    </div>
  `).join('');
  if (!compositionHtml) {
    compositionHtml = '<div class="comp-mats" style="color:#aaa">（成分未填写）</div>';
  }

  const perPartWashNotes = parseWashNotePerPart(styleInfo?.fabricCompositionParts);
  const perPartNote = suitPart !== 'all' ? perPartWashNotes[suitPart] : undefined;
  const washRaw = (perPartNote !== undefined && perPartNote.trim()) ? perPartNote : (styleInfo?.washInstructions || '');
  const washText = washRaw.replace(/^洗涤说明[（(]水洗标专用[）)]\s*/u, '').trim();
  const washInstHtml = washText
    ? `<div class="care-wash">${washText.replace(/\n/g, '<br/>')}</div>`
    : '';
  const careIconsHtml = styleInfo ? buildCareIconsHtml(styleInfo) : '';
  const styleNo = order.styleNo || '-';
  const styleName = order.styleName || '-';

  const today = new Date();
  const dateStr = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}`;

  const oneLabelHtml = `
    <div class="label">
      <div class="dash-sep"></div>
      <div class="top-block">
        <div class="style-no">款号：${styleNo}</div>
        <div class="style-name">款名：${styleName}</div>
      </div>
      <div class="content-block">
        ${compositionHtml}
        ${washInstHtml ? `<div class="wash-title">洗涤说明</div>${washInstHtml}` : ''}
      </div>
      <div class="bottom-block">
        ${careIconsHtml || ''}
        <div class="footer">MADE IN CHINA</div>
        <div class="date">${dateStr}</div>
      </div>
      <div class="dash-sep"></div>
    </div>`;

  const pages = selected.flatMap(row =>
    Array.from({ length: Math.max(1, row.printCount) }, () =>
      `<div class="page">${oneLabelHtml}</div>`)
  ).join('\n');

  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
@page { size: ${w}mm ${h}mm; margin: 0; }
* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: system-ui, -apple-system, BlinkMacSystemFont, "'Segoe UI'", Roboto, "'Helvetica Neue'", Arial, "'Noto Sans'", "'Microsoft YaHei'", "'PingFang SC'", serif; color: #000; background: #fff; -webkit-font-smoothing: antialiased; }
.page { width: ${w}mm; min-height: ${h}mm; page-break-after: always; }
.page:last-child { page-break-after: auto; }
.label { position: relative; width: ${w}mm; height: ${h}mm; padding: 0 2.2mm; color: #000; }
.dash-sep { border: none; border-top: 0.8pt dashed #555; width: calc(100% + 6mm); margin-left: -3mm; }
.top-block { position: absolute; left: 2.2mm; right: 2.2mm; top: 15mm; text-align: center; }
.style-no { font-size: ${w <= 30 ? fs - 0.1 : fs + 0.2}pt; font-weight: bold; line-height: 1.35; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.style-name { font-size: ${w <= 30 ? fs - 0.6 : fs - 0.2}pt; line-height: 1.35; margin-top: 0.8mm; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.content-block { position: absolute; left: 2.2mm; right: 2.2mm; top: 24mm; bottom: 24mm; overflow: hidden; }
.comp-block { margin: 0.3mm 0 1.1mm; }
.comp-name { font-size: ${w <= 30 ? fs + 0.2 : fs}pt; font-weight: bold; display: block; margin-bottom: 0.6mm; }
.comp-mats { font-size: ${w <= 30 ? fs + 1.7 : fs}pt; line-height: 1.55; white-space: pre-wrap; display: block; font-weight: bold; }
.wash-title { font-size: ${w <= 30 ? fs - 0.1 : fs}pt; color: #444; line-height: 1.5; margin-bottom: 0.6mm; }
.care-wash { font-size: ${fs}pt; color: #444; line-height: 1.6; margin-top: 1.6mm; }
.bottom-block { position: absolute; left: 2.2mm; right: 2.2mm; bottom: 6.5mm; display: flex; flex-direction: column; align-items: center; }
.icons { display: flex; gap: 0.45mm; align-items: center; justify-content: center; flex-wrap: nowrap; width: 100%; margin: 1.8mm auto 0; min-height: 6mm; }
.icon-cell { width: 4.8mm; height: 4.8mm; display: flex; align-items: center; justify-content: center; flex: 0 0 auto; }
.icons svg { width: 100%; height: 100%; }
.footer { margin-top: 2.1mm; font-size: ${w <= 30 ? fs - 0.2 : fs}pt; font-weight: bold; letter-spacing: 0.6mm; line-height: 1.3; text-align: center; white-space: nowrap; }
.date { margin-top: 2.2mm; font-size: ${fs - 0.5}pt; color: #777; text-align: center; }
</style></head><body>${pages}</body></html>`;

  safePrint(html);
}

// ─── U编码打印函数（横版：左QR右文字，实线边框，均匀行距）────────────────────────

async function printUCodeLabels(
  selected: SkuRow[],
  order: ProductionOrder,
  factoryCode: string,
  w: number,   // 横版宽（70 或 100mm）
  h: number,   // 横版高（40 或 50mm）
): Promise<void> {
  const today = new Date();
  const dateStr = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}`;

  const styleNo = order.styleNo || '';
  const styleName = order.styleName || '';
  // qrMm: 固定 26mm，两种尺寸标签统一大小
  const qrMm = 26;
  const qrPx = 480;
  const fs = h >= 48 ? 6.2 : h >= 38 ? 5.4 : 4.9;

  // 每件独立生成标签：把每行 SKU 的 printCount 展开成 printCount 张标签
  // 每张标签有唯一 QR 码（款号-颜色-码数-序号），序号从 1 到 printCount
  type PieceEntry = { rowKey: string; color: string; size: string; seq: number; total: number; qrContent: string };
  const pieceList: PieceEntry[] = selected.flatMap(row => {
    const total = Math.max(1, row.printCount);
    return Array.from({ length: total }, (_, i) => ({
      rowKey: row.key,
      color: row.color,
      size: row.size,
      seq: i + 1,
      total,
      qrContent: [styleNo, row.color, row.size].filter(Boolean).join('-'),
    }));
  });

  // 并行生成所有 QR DataURL（data URL 不需要网络，速度快）
  const BATCH_SIZE = 20;
  const qrUrls: string[] = new Array(pieceList.length).fill('');
  for (let i = 0; i < pieceList.length; i += BATCH_SIZE) {
    const batchResults = await Promise.all(
      pieceList.slice(i, i + BATCH_SIZE).map(e =>
        QRCode.toDataURL(e.qrContent, { width: qrPx, margin: 0, errorCorrectionLevel: 'M' }).catch(() => '')
      )
    );
    batchResults.forEach((url, j) => { qrUrls[i + j] = url; });
  }

  const labelsHtml = pieceList.map((entry, idx) => {
    return `<div class="page">
      <div class="label">
        <div class="qr-col">
          <img src="${qrUrls[idx]}" style="width:${qrMm}mm;height:${qrMm}mm;display:block;"/>
        </div>
        <div class="info-col">
          <div class="ucode-row">${entry.qrContent}</div>
          <div class="info-row"><span class="lbl">款号</span><span class="val">${styleNo}</span></div>
          ${styleName ? `<div class="info-row"><span class="lbl">款名</span><span class="val">${styleName}</span></div>` : ''}
          <div class="info-row"><span class="lbl">颜色</span><span class="val">${entry.color || '-'}</span></div>
          <div class="info-row"><span class="lbl">码数</span><span class="val">${entry.size || '-'}</span></div>
          ${factoryCode ? `<div class="info-row"><span class="lbl">GC:</span><span class="val">${factoryCode}</span></div>` : ''}
          <div class="info-row date-row">${dateStr}</div>
        </div>
      </div>
    </div>`;
  }).join('\n');

  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
@page { size: ${w}mm ${h}mm; margin: 0; }
* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: system-ui, -apple-system, BlinkMacSystemFont, "'Segoe UI'", Roboto, "'Helvetica Neue'", Arial, "'Noto Sans'", "'Microsoft YaHei'", "'PingFang SC'", serif; color: #000; background: #fff; -webkit-font-smoothing: antialiased; }
.page { width: ${w}mm; height: ${h}mm; display: flex; align-items: center; justify-content: center; page-break-after: always; }
.page:last-child { page-break-after: auto; }
.label { width: calc(${w}mm - 3mm); height: calc(${h}mm - 3mm); border: 0.8pt solid #333; display: flex; flex-direction: row; align-items: stretch; padding: 1.5mm 2.5mm 1.5mm 2.5mm; gap: 1.5mm; color: #000; }
.qr-col { flex: 0 0 ${qrMm + 1}mm; display: flex; align-items: center; justify-content: center; }
.qr-col img { display: block; object-fit: contain; }
.info-col { flex: 1; display: flex; flex-direction: column; justify-content: center; min-width: 0; overflow: hidden; padding: 0 0 0 0.5mm; }
.ucode-row { font-size: ${fs + 0.9}pt; font-weight: bold; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; padding-bottom: 1mm; border-bottom: 0.8pt dashed #9a9a9a; margin-bottom: 1.1mm; }
.info-row { font-size: ${fs}pt; display: flex; align-items: baseline; flex-wrap: nowrap; min-width: 0; margin-bottom: 0.65mm; }
.lbl { color: #555; white-space: nowrap; }
.val { font-weight: 600; margin-left: 0.8mm; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; }
.seq-row { margin-top: 1.1mm; margin-bottom: 1mm; }
.seq-val { font-size: ${fs + 0.8}pt; font-weight: bold; color: #000; margin-left: 0.8mm; }
.date-row { color: #777; font-size: ${fs - 0.4}pt; margin-top: 2mm; padding-top: 0.4mm; }
</style></head><body>${labelsHtml}</body></html>`;

  safePrint(html);
}

// ─── 主组件 ──────────────────────────────────────────────────────────────────

export default function LabelPrintModal({ open, onClose, order, styleInfo }: Props) {
  const [orderFactoryCode, setOrderFactoryCode] = useState<string>('');
  /** 洗水唛自定义纸张尺寸（mm） */
  const [washW, setWashW] = useState<number>(30);
  const [washH, setWashH] = useState<number>(80);
  /** U码固定两档：40×70mm 或 50×100mm */
  const [uCodeSize, setUCodeSize] = useState<'40x70' | '50x100'>('40x70');
  /** 套装部位选择：仅在款式有上下装成分时显示 */
  const [suitPart, setSuitPart] = useState<string>('all');
  const _suitSections = buildWashLabelSections(styleInfo?.fabricCompositionParts, styleInfo?.fabricComposition);
  const isSuit = _suitSections.length > 1;

  useEffect(() => {
    if (!open || !order?.factoryId) { setOrderFactoryCode(''); return; }
    void (api as any).get(`/system/factory/${order.factoryId}`)
      .then((res: ApiResult<Record<string, any>>) => {
        const d = res?.data ?? res ?? {};
        setOrderFactoryCode(String(d.factoryCode || ''));
      })
      .catch(() => setOrderFactoryCode(''));
  }, [open, order?.factoryId]);

  const handleWashPrint = useCallback(
    (selected: SkuRow[], ord: ProductionOrder, si: LabelStyleInfo | null) =>
      printWashLabels(selected, ord, si, washW, washH, suitPart),
    [washW, washH, suitPart]
  );

  const handleUCodePrint = useCallback(
    (selected: SkuRow[], ord: ProductionOrder) => {
      // 横版：4×7cm → 70mm宽×40mm高；5×10cm → 100mm宽×50mm高
      const [uw, uh] = uCodeSize === '40x70' ? [70, 40] : [100, 50];
      return printUCodeLabels(selected, ord, orderFactoryCode, uw, uh);
    },
    [orderFactoryCode, uCodeSize]
  );

  return (
    <ResizableModal
      title={`打印标签 — ${order?.orderNo ?? ''}`}
      open={open}
      onCancel={onClose}
      width="60vw"
      footer={null}
      destroyOnHidden
    >
      <Tabs
        defaultActiveKey="wash"
        items={[
          {
            key: 'wash', label: '打印洗水唛',
            children: (
              <>
                <div style={{ marginBottom: 12 }}>
                  <Space wrap align="center">
                    <span style={{ color: '#555', fontSize: 13 }}>纸张宽</span>
                    <InputNumber
                      min={20} max={200} value={washW}
                      onChange={v => setWashW(v ?? 30)}
                      suffix="mm" style={{ width: 110 }} size="small"
                    />
                    <span style={{ color: '#555', fontSize: 13 }}>高</span>
                    <InputNumber
                      min={30} max={400} value={washH}
                      onChange={v => setWashH(v ?? 80)}
                      suffix="mm" style={{ width: 110 }} size="small"
                    />
                    {isSuit && (
                      <>
                        <span style={{ color: '#555', fontSize: 13, marginLeft: 4 }}>打印部位</span>
                        <Radio.Group
                          value={suitPart}
                          onChange={e => setSuitPart(e.target.value as string)}
                          size="small"
                        >
                          <Radio.Button value="all">全部</Radio.Button>
                          {_suitSections.map(s => (
                            <Radio.Button key={s.key} value={s.key}>{s.label}</Radio.Button>
                          ))}
                        </Radio.Group>
                      </>
                    )}
                  </Space>
                  <div style={{ fontSize: 12, color: '#999', marginTop: 4 }}>
                    上下虚线分割，内容距线 1.5cm；不含颜色/尺码，同款通用
                  </div>
                </div>
                <SkuTable
                  open={open} order={order} styleInfo={styleInfo}
                  printColLabel="洗水唛打印数"
                  onPrint={handleWashPrint}
                  onClose={onClose}
                />
              </>
            ),
          },
          {
            key: 'ucode', label: '打印U编码',
            children: (
              <>
                <div style={{ marginBottom: 12 }}>
                  <Radio.Group
                    value={uCodeSize}
                    onChange={e => setUCodeSize(e.target.value as '40x70' | '50x100')}
                  >
                    <Radio.Button value="40x70">4×7cm</Radio.Button>
                    <Radio.Button value="50x100">5×10cm</Radio.Button>
                  </Radio.Group>
                </div>
                <SkuTable
                  open={open} order={order} styleInfo={styleInfo}
                  printColLabel="打印数量"
                  onPrint={(sel, ord) => handleUCodePrint(sel, ord)}
                  onClose={onClose}
                />
              </>
            ),
          },
        ]}
      />
    </ResizableModal>
  );
}
