/**
 * 打印标签弹窗（双 Tab）
 *  Tab 1 — 打印洗水唛：按 SKU 展示可编辑打印数，生成洗水唛标签
 *  Tab 2 — 打印U编码：按 SKU 展示可编辑打印数，生成 U 编码 / QR 标签
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, Checkbox, Input, InputNumber, Spin, Tabs, Tag } from 'antd';
import { PrinterOutlined, SearchOutlined } from '@ant-design/icons';
import QRCode from 'qrcode';
import ResizableModal from '@/components/common/ResizableModal';
import ResizableTable from '@/components/common/ResizableTable';
import api from '@/utils/api';
import type { ProductionOrder } from '@/types/production';
import type { ColumnsType } from 'antd/es/table';
import { StyleCoverThumb } from '@/components/StyleAssets';

// ─── 共用类型 ─────────────────────────────────────────────────────────────────

export interface LabelStyleInfo {
  fabricComposition?: string;
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
  `<text x="10" y="17" text-anchor="middle" font-size="6" fill="#000" font-family="Arial,sans-serif" font-weight="bold">${n}</text>`;

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
  dryclean_YES: circSvg('<text x="10" y="14.5" text-anchor="middle" font-size="9" fill="#000" font-family="Arial,sans-serif" font-style="italic">A</text>'),
  dryclean_NO:  circSvg(X),
};

function buildCareIconsHtml(s: LabelStyleInfo): string {
  const icons = [
    s.washTempCode    ? (CARE_SVGS[`wash_${s.washTempCode}`] ?? '')      : '',
    s.bleachCode      ? (CARE_SVGS[`bleach_${s.bleachCode}`] ?? '')      : '',
    s.tumbleDryCode   ? (CARE_SVGS[`dry_${s.tumbleDryCode}`] ?? '')      : '',
    s.ironCode        ? (CARE_SVGS[`iron_${s.ironCode}`] ?? '')          : '',
    s.dryCleanCode    ? (CARE_SVGS[`dryclean_${s.dryCleanCode}`] ?? '')  : '',
  ].filter(Boolean);
  if (!icons.length) return '';
  return `<div class="icons">${icons.join('')}</div>`;
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
  const [sizeFilter, setSizeFilter] = useState('');
  const [filtering, setFiltering] = useState(false);
  const [printing, setPrinting] = useState(false);

  useEffect(() => {
    if (!open || !order) { setRows([]); setSelectedKeys([]); return; }
    setLoading(true);
    void loadSkuRows(order).then(loaded => {
      setRows(loaded);
      setSelectedKeys(loaded.map(r => r.key));
    }).finally(() => setLoading(false));
  }, [open, order?.orderNo]);

  const displayRows = useMemo(() => {
    if (!filtering || !sizeFilter.trim()) return rows;
    return rows.filter(r => r.size.includes(sizeFilter.trim()));
  }, [rows, filtering, sizeFilter]);

  const handleFilter = () => setFiltering(true);

  const allSelected = displayRows.length > 0 && displayRows.every(r => selectedKeys.includes(r.key));
  const partialSelected = displayRows.some(r => selectedKeys.includes(r.key)) && !allSelected;

  const toggleAll = () => {
    const keys = displayRows.map(r => r.key);
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
      title: <Checkbox checked={allSelected} indeterminate={partialSelected} onChange={toggleAll} />,
      width: 36, key: 'chk',
      render: (_: unknown, r: SkuRow) =>
        <Checkbox checked={selectedKeys.includes(r.key)} onChange={e => toggleRow(r.key, e.target.checked)} />,
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
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, alignItems: 'center' }}>
        <span style={{ whiteSpace: 'nowrap', fontSize: 13 }}>尺码筛选：</span>
        <Input
          value={sizeFilter}
          onChange={e => { setSizeFilter(e.target.value); setFiltering(false); }}
          onPressEnter={handleFilter}
          placeholder="输入尺码" style={{ width: 160 }} size="small"
          allowClear onClear={() => { setSizeFilter(''); setFiltering(false); }}
        />
        <Button size="small" icon={<SearchOutlined />} onClick={handleFilter}>查询</Button>
      </div>
      <Spin spinning={loading}>
        <ResizableTable
          dataSource={displayRows}
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
): Promise<void> {
  const W = 50, H = 80;
  const labelsHtml = selected.flatMap(row => {
    const n = Math.max(1, row.printCount);
    const careIcons = styleInfo ? buildCareIconsHtml(styleInfo) : '';
    return Array.from({ length: n }, () => `
      <div class="page">
        <div class="lbl">
          <div class="ttl">${order.styleName || order.styleNo || ''}</div>
          <div class="hr"></div>
          <div class="row"><span class="muted">款号：</span>${order.styleNo || '-'}</div>
          <div class="row"><span class="muted">颜色：</span>${row.color}</div>
          <div class="row"><span class="muted">尺码：</span>${row.size}</div>
          ${styleInfo?.fabricComposition ? `<div class="hr"></div><div class="row"><span class="muted">成分：</span>${styleInfo.fabricComposition}</div>` : ''}
          ${styleInfo?.washInstructions ? `<div class="row" style="font-size:7pt">${styleInfo.washInstructions}</div>` : ''}
          ${careIcons ? `<div class="hr"></div>${careIcons}` : ''}
        </div>
      </div>`);
  }).join('');

  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
@page{size:${W}mm ${H}mm;margin:0}*{margin:0;padding:0;box-sizing:border-box}
html,body{width:${W}mm;height:${H}mm;font-family:Arial,"Microsoft YaHei",sans-serif}
.page{width:${W}mm;height:${H}mm;page-break-after:always}.page:last-child{page-break-after:auto}
.lbl{width:${W}mm;height:${H}mm;padding:3mm;border:1px solid #000;display:flex;flex-direction:column;justify-content:space-around}
.ttl{font-size:9pt;font-weight:bold;text-align:center}
.row{font-size:8pt;line-height:1.6}.hr{border-top:.5px solid #ccc;margin:1.5mm 0}.muted{color:#555}
.icons{display:flex;gap:2mm;justify-content:center;align-items:center;padding:1mm 0}
</style></head><body>${labelsHtml}</body></html>`;

  const iframe = document.createElement('iframe');
  iframe.style.cssText = 'position:fixed;left:-9999px;top:-9999px;width:0;height:0;border:none;';
  document.body.appendChild(iframe);
  const doc = iframe.contentWindow?.document;
  if (doc) {
    doc.open(); doc.write(html); doc.close();
    await new Promise<void>(resolve => {
      setTimeout(() => {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
        setTimeout(() => { try { document.body.removeChild(iframe); } catch { /**/ } }, 1000);
        resolve();
      }, 200);
    });
  }
}

// ─── U编码打印函数 ─────────────────────────────────────────────────────────────

async function printUCodeLabels(
  selected: SkuRow[],
  order: ProductionOrder,
  factoryCode: string,
): Promise<void> {
  const W = 70, H = 40;
  // 日期：纯数字 YYYYMMDD，不加任何汉字
  const today = new Date();
  const dateStr = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}`;

  const qrMap: Record<string, string> = {};
  for (const row of selected) {
    for (let i = 0; i < Math.max(1, row.printCount); i++) {
      const code = [order.styleNo, row.color, row.size].filter(Boolean).join('-') + `-${i + 1}`;
      if (!qrMap[code]) {
        try { qrMap[code] = await QRCode.toDataURL(code, { width: 84, margin: 1, errorCorrectionLevel: 'M' }); }
        catch { qrMap[code] = ''; }
      }
    }
  }

  const qrS = Math.min(H - 8, 84 * 0.28);
  const labelsHtml = selected.flatMap(row =>
    Array.from({ length: Math.max(1, row.printCount) }, (_, i) => {
      const uCode = [order.styleNo, row.color, row.size].filter(Boolean).join('-') + `-${i + 1}`;
      return `<div class="page"><div class="label">
        <div class="qr"><img src="${qrMap[uCode] || ''}" width="84" height="84"/></div>
        <div class="text">
          <div class="ucode">${uCode}</div>
          <div>${dateStr}</div>
          ${factoryCode ? `<div>GC: ${factoryCode}</div>` : ''}
        </div></div></div>`;
    })
  ).join('');

  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
@page{size:${W}mm ${H}mm;margin:0}*{margin:0;padding:0;box-sizing:border-box}
html,body{width:${W}mm;height:${H}mm;font-family:Arial,"Microsoft YaHei",sans-serif}
.page{width:${W}mm;height:${H}mm;page-break-after:always;display:flex;align-items:center;justify-content:center}
.page:last-child{page-break-after:auto}
.label{width:${W - 4}mm;height:${H - 4}mm;border:1px solid #000;display:flex;flex-direction:row;padding:1.5mm;gap:1.5mm}
.qr{flex:0 0 auto;display:flex;align-items:center}.qr img{width:${qrS}mm;height:${qrS}mm}
.text{flex:1;display:flex;flex-direction:column;justify-content:space-around;font-size:7pt;line-height:1.3}
.text>div{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ucode{font-weight:bold;font-size:7.5pt;letter-spacing:.5px}
</style></head><body>${labelsHtml}</body></html>`;

  const iframe = document.createElement('iframe');
  iframe.style.cssText = 'position:fixed;left:-9999px;top:-9999px;width:0;height:0;border:none;';
  document.body.appendChild(iframe);
  const doc = iframe.contentWindow?.document;
  if (doc) {
    doc.open(); doc.write(html); doc.close();
    const imgs = doc.querySelectorAll('img');
    await new Promise<void>(resolve => {
      const total = imgs.length;
      const doPrint = () => {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
        setTimeout(() => { try { document.body.removeChild(iframe); } catch { /**/ } }, 1000);
        resolve();
      };
      if (total === 0) { setTimeout(doPrint, 100); return; }
      let loaded = 0;
      const onDone = () => { loaded++; if (loaded >= total) doPrint(); };
      imgs.forEach(img => {
        if ((img as HTMLImageElement).complete) onDone();
        else { img.onload = onDone; img.onerror = onDone; }
      });
      setTimeout(() => { if (loaded < total) doPrint(); }, 5000);
    });
  }
}

// ─── 主组件 ──────────────────────────────────────────────────────────────────

export default function LabelPrintModal({ open, onClose, order, styleInfo }: Props) {
  const [orderFactoryCode, setOrderFactoryCode] = useState<string>('');

  useEffect(() => {
    if (!order?.factoryId) { setOrderFactoryCode(''); return; }
    void (api as any).get(`/system/factory/${order.factoryId}`)
      .then((res: any) => {
        const d = (res as any)?.data ?? res ?? {};
        setOrderFactoryCode(String(d.factoryCode || ''));
      })
      .catch(() => setOrderFactoryCode(''));
  }, [order?.factoryId]);

  const handleWashPrint = useCallback(
    (selected: SkuRow[], ord: ProductionOrder, si: LabelStyleInfo | null) =>
      printWashLabels(selected, ord, si),
    []
  );

  const handleUCodePrint = useCallback(
    (selected: SkuRow[], ord: ProductionOrder) => printUCodeLabels(selected, ord, orderFactoryCode),
    [orderFactoryCode]
  );

  return (
    <ResizableModal
      title={`打印标签 — ${order?.orderNo ?? ''}`}
      open={open}
      onCancel={onClose}
      width="50vw"
      footer={null}
      destroyOnClose
    >
      <Tabs
        defaultActiveKey="wash"
        items={[
          {
            key: 'wash', label: '打印洗水唛',
            children: (
              <SkuTable
                open={open} order={order} styleInfo={styleInfo}
                printColLabel="洗水唛打印数"
                onPrint={handleWashPrint}
                onClose={onClose}
              />
            ),
          },
          {
            key: 'ucode', label: '打印U编码',
            children: (
              <SkuTable
                open={open} order={order} styleInfo={styleInfo}
                printColLabel="sku打印数"
                onPrint={(sel, ord) => handleUCodePrint(sel, ord)}
                onClose={onClose}
              />
            ),
          },
        ]}
      />
    </ResizableModal>
  );
}
