import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, Checkbox, InputNumber, Radio, Space, Spin, Tabs, Tag, Typography } from 'antd';
import { PrinterOutlined } from '@ant-design/icons';
import QRCode from 'qrcode';
import ResizableModal from '@/components/common/ResizableModal';
import type { ApiResult } from '@/utils/api';
import ResizableTable from '@/components/common/ResizableTable';
import api, { parseProductionOrderLines } from '@/utils/api';
import type { ProductionOrder } from '@/types/production';
import type { ColumnsType } from 'antd/es/table';
import { StyleCoverThumb } from '@/components/StyleAssets';
import { safePrint } from '@/utils/safePrint';
import { CARE_CATEGORIES, CARE_ICONS, parseCareIconCodes, DEFAULT_CARE_ICON_CODES } from '@/utils/careIcons';
import {
  buildWashLabelMultiPageHtml,
  getDefaultDateText,
  compositionFromSections,
  washTextFromInstructions,
  type WashLabelPrintData,
} from '@/utils/washLabelPrintTemplate';

export interface LabelStyleInfo {
  fabricComposition?: string;
  fabricCompositionParts?: string;
  washInstructions?: string;
  uCode?: string;
  washTempCode?: string;
  bleachCode?: string;
  tumbleDryCode?: string;
  ironCode?: string;
  dryCleanCode?: string;
  careIconCodes?: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  order: ProductionOrder | null;
  styleInfo: LabelStyleInfo | null;
}

interface SkuRow {
  key: string;
  color: string;
  size: string;
  quantity: number;
  printCount: number;
  sku: string;
  styleImageUrl?: string;
  styleId?: string;
  styleNo?: string;
}

async function loadSkuRows(order: ProductionOrder): Promise<SkuRow[]> {
  try {
    const res = await api.get(
      `/production/scan/sku/query?type=list&orderNo=${encodeURIComponent(order.orderNo || '')}`
    );
    const list: any[] = Array.isArray(res) ? res : (Array.isArray(res?.data) ? res.data : []);
    if (list.length > 0) {
      return list.map((item: any) => {
        const color = String(item.color ?? '');
        const size = String(item.size ?? '');
        const quantity = Number(item.quantity ?? 0);
        const sku = String(item.sku ?? item.skuCode ?? `${order.styleNo || ''}${color}${size}`);
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
        sku: String(item.skuNo || `${order.styleNo || ''}${color}${size}`),
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
    sku: `${order.styleNo || ''}${order.color || ''}${order.size || ''}`,
    styleImageUrl: order.styleCover || '',
    styleId: order.styleId || '',
    styleNo: order.styleNo || '',
  }];
}

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
  // eslint-disable-next-line react-hooks/exhaustive-deps
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
        <StyleCoverThumb src={r.styleImageUrl || null} styleId={r.styleId} styleNo={r.styleNo} color={r.color} size={48} borderRadius={4} />
      ),
    },
    {
      title: 'SKU', dataIndex: 'sku', key: 'sku', width: 160,
      render: (v: string) => <span style={{ fontSize: 14 }}>{v || '-'}</span>,
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
          min={0} max={99999} value={r.printCount} style={{ width: 110 }}
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
          bordered
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

async function printWashLabels(
  selected: SkuRow[],
  _order: ProductionOrder,
  styleInfo: LabelStyleInfo | null,
  w: number,
  h: number,
): Promise<void> {
  const compositionText = compositionFromSections(styleInfo?.fabricCompositionParts, styleInfo?.fabricComposition);
  const washInstructionsText = washTextFromInstructions(styleInfo?.washInstructions, styleInfo?.fabricCompositionParts);
  const codes = parseCareIconCodes(styleInfo?.careIconCodes);
  const careIconCodes = codes.length > 0 ? codes : [...DEFAULT_CARE_ICON_CODES];
  const manufacturingText = 'MADE IN CHINA';
  const dateText = getDefaultDateText();

  const printData: WashLabelPrintData = {
    width: w,
    height: h,
    compositionText,
    washInstructionsText,
    careIconCodes,
    manufacturingText,
    dateText,
  };

  const pages = selected.flatMap(row =>
    Array.from({ length: Math.max(1, row.printCount) }, () => printData)
  );

  const html = buildWashLabelMultiPageHtml(pages);
  safePrint(html);
}

async function printUCodeLabels(
  selected: SkuRow[],
  order: ProductionOrder,
  factoryCode: string,
  w: number,
  h: number,
): Promise<void> {
  const today = new Date();
  const dateStr = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}`;

  const styleNo = order.styleNo || '';
  const styleName = order.styleName || '';
  const qrMm = 26;
  const qrPx = 480;
  const fs = h >= 48 ? 6.2 : h >= 38 ? 5.4 : 4.9;

  type PieceEntry = { rowKey: string; color: string; size: string; seq: number; total: number; qrContent: string };
  const pieceList: PieceEntry[] = selected.flatMap(row => {
    const total = Math.max(1, row.printCount);
    return Array.from({ length: total }, (_, i) => ({
      rowKey: row.key,
      color: row.color,
      size: row.size,
      seq: i + 1,
      total,
      qrContent: [styleNo, row.color, row.size].filter(Boolean).join(''),
    }));
  });

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
        <div class="divider"></div>
        <div class="info-col">
          <div class="ucode-row">${entry.qrContent}</div>
          <div class="info-row"><span class="lbl">款号</span><span class="val">${styleNo}</span></div>
          ${styleName ? `<div class="info-row"><span class="lbl">款名</span><span class="val">${styleName}</span></div>` : ''}
          <div class="info-row"><span class="lbl">颜色</span><span class="val">${entry.color || '-'}</span></div>
          <div class="info-row"><span class="lbl">码数</span><span class="val">${entry.size || '-'}</span></div>
          ${factoryCode ? `<div class="info-row"><span class="lbl">GC</span><span class="val">${factoryCode}</span></div>` : ''}
          <div class="date-row">${dateStr}</div>
        </div>
      </div>
    </div>`;
  }).join('\n');

  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
@page { size: ${w}mm ${h}mm; margin: 0; }
* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: "PingFang SC", "Microsoft YaHei", "Noto Sans SC", system-ui, sans-serif; color: #000; background: var(--color-bg-base); -webkit-font-smoothing: antialiased; }
.page { width: ${w}mm; height: ${h}mm; display: flex; align-items: center; justify-content: center; page-break-after: always; }
.page:last-child { page-break-after: auto; }
.label { width: calc(${w}mm - 3mm); height: calc(${h}mm - 3mm); border: 0.8pt solid #333; display: flex; flex-direction: row; align-items: stretch; padding: 2mm 3mm; gap: 0; color: #000; }
.qr-col { flex: 0 0 ${qrMm + 1}mm; display: flex; align-items: center; justify-content: center; }
.qr-col img { display: block; object-fit: contain; }
.divider { width: 0; border-right: 0.4pt solid #bbb; margin: 2mm 2mm; flex-shrink: 0; }
.info-col { flex: 1; display: flex; flex-direction: column; justify-content: center; min-width: 0; overflow: hidden; padding: 0 0 0 0.5mm; }
.ucode-row { font-size: ${fs + 0.9}pt; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; padding-bottom: 1mm; border-bottom: 0.5pt solid #bbb; margin-bottom: 1.2mm; letter-spacing: 0.2mm; }
.info-row { font-size: ${fs}pt; display: flex; align-items: baseline; flex-wrap: nowrap; min-width: 0; margin-bottom: 0.7mm; }
.lbl { color: #888; white-space: nowrap; min-width: 8mm; }
.val { font-weight: 600; margin-left: 0.5mm; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; color: var(--color-text-primary); }
.date-row { color: #999; font-size: ${fs - 0.4}pt; margin-top: 1.5mm; letter-spacing: 0.2mm; }
</style></head><body>${labelsHtml}</body></html>`;

  safePrint(html);
}

export default function LabelPrintModal({ open, onClose, order, styleInfo }: Props) {
  const [orderFactoryCode, setOrderFactoryCode] = useState<string>('');
  const [washW, setWashW] = useState<number>(30);
  const [washH, setWashH] = useState<number>(80);
  const [uCodeSize, setUCodeSize] = useState<'40x70' | '50x100'>('40x70');
  const [suitPart, setSuitPart] = useState<string>('all');

  const compositionText = useMemo(
    () => compositionFromSections(styleInfo?.fabricCompositionParts, styleInfo?.fabricComposition),
    [styleInfo?.fabricCompositionParts, styleInfo?.fabricComposition],
  );

  const washInstructionsText = useMemo(
    () => washTextFromInstructions(styleInfo?.washInstructions, styleInfo?.fabricCompositionParts),
    [styleInfo?.washInstructions, styleInfo?.fabricCompositionParts],
  );

  const careIconCodes = useMemo(() => {
    const codes = parseCareIconCodes(styleInfo?.careIconCodes);
    return codes.length > 0 ? codes : [...DEFAULT_CARE_ICON_CODES];
  }, [styleInfo?.careIconCodes]);

  useEffect(() => {
    if (!open || !order?.factoryId) { setOrderFactoryCode(''); return; }
    void api.get(`/system/factory/${order.factoryId}`)
      .then((res: ApiResult<Record<string, any>>) => {
        const d = res?.data ?? res ?? {};
        setOrderFactoryCode(String(d.factoryCode || ''));
      })
      .catch((err) => { console.warn('[LabelPrint] 工厂编码查询失败:', err?.message || err); setOrderFactoryCode(''); });
  }, [open, order?.factoryId]);

  const handleWashPrint = useCallback(
    (selected: SkuRow[], ord: ProductionOrder, si: LabelStyleInfo | null) =>
      printWashLabels(selected, ord, si, washW, washH),
    [washW, washH],
  );

  const handleUCodePrint = useCallback(
    (selected: SkuRow[], ord: ProductionOrder) => {
      const [uw, uh] = uCodeSize === '40x70' ? [70, 40] : [100, 50];
      return printUCodeLabels(selected, ord, orderFactoryCode, uw, uh);
    },
    [orderFactoryCode, uCodeSize],
  );

  return (
    <ResizableModal
      title={`打印标签 — ${order?.orderNo ?? ''}`}
      open={open}
      onCancel={onClose}
      width="85vw"
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
                    <span style={{ color: 'var(--color-text-secondary)', fontSize: 14 }}>纸张宽</span>
                    <InputNumber
                      min={20} max={200} value={washW}
                      onChange={v => setWashW(v ?? 30)}
                      suffix="mm" style={{ width: 110 }}
                    />
                    <span style={{ color: 'var(--color-text-secondary)', fontSize: 14 }}>高</span>
                    <InputNumber
                      min={30} max={400} value={washH}
                      onChange={v => setWashH(v ?? 80)}
                      suffix="mm" style={{ width: 110 }}
                    />
                    {suitPart && (
                      <>
                        <span style={{ color: 'var(--color-text-secondary)', fontSize: 14, marginLeft: 4 }}>打印部位</span>
                        <Radio.Group
                          value={suitPart}
                          onChange={e => setSuitPart(e.target.value as string)}
                          size="small"
                        >
                          <Radio.Button value="all">全部</Radio.Button>
                        </Radio.Group>
                      </>
                    )}
                  </Space>
                  <div style={{ fontSize: 14, color: 'var(--color-text-tertiary)', marginTop: 4 }}>
                    上下虚线分割，内容距线 1.5cm；不含颜色/尺码，同款通用
                  </div>
                </div>

                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 4 }}>① 面料成分</div>
                  <Typography.Text style={{ fontSize: 14, whiteSpace: 'pre-wrap' }}>
                    {compositionText || '（未填写）'}
                  </Typography.Text>
                </div>

                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 4 }}>② 洗涤说明</div>
                  <Typography.Text style={{ fontSize: 14, whiteSpace: 'pre-wrap' }}>
                    {washInstructionsText || '（未填写）'}
                  </Typography.Text>
                </div>

                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 4 }}>③ 护理图标</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {CARE_CATEGORIES.map(cat => {
                      const selectedInCat = cat.codes.filter(code => careIconCodes.includes(code));
                      if (selectedInCat.length === 0) return null;
                      return (
                        <div key={cat.key}>
                          <div style={{ fontSize: 13, color: '#888', marginBottom: 3 }}>{cat.label}</div>
                          <Space orientation="vertical" wrap size={4}>
                            {selectedInCat.map(code => {
                              const icon = CARE_ICONS[code];
                              return (
                                <div
                                  key={code}
                                  style={{
                                    display: 'inline-flex', alignItems: 'center', gap: 3,
                                    padding: '2px 6px', borderRadius: 4,
                                    border: '1.5px solid var(--color-primary)',
                                    background: '#e6f4ff',
                                  }}
                                >
                                  <span dangerouslySetInnerHTML={{ __html: icon?.svg || '' }} style={{ display: 'inline-block', width: 18, height: 18, flexShrink: 0 }} />
                                  <span style={{ fontSize: 12, color: 'var(--color-primary)', whiteSpace: 'nowrap' }}>{icon?.label || code}</span>
                                </div>
                              );
                            })}
                          </Space>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 4 }}>④ 生产制造</div>
                  <Typography.Text style={{ fontSize: 14, fontWeight: 600, letterSpacing: '0.8mm' }}>
                    MADE IN CHINA
                  </Typography.Text>
                  <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)', marginTop: 2 }}>
                    日期自动生成：{getDefaultDateText()}
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
                    size="small"
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
