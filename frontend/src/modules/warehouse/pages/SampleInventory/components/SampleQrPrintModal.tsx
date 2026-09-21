/**
 * 样衣二维码标签打印（D-515）
 *
 * 样衣仓库行操作「打印二维码」：可调横版/竖版、标签尺寸（默认 4×7cm 竖版）、份数。
 *
 * 二维码可扫出入库的核实链（全部与现网已验证的样衣二维码同源）：
 * 1. 内容固定为 {"type":"pattern","id":"<样衣生产记录ID>"}——
 *    小程序 JSONCodeParser.handleOrderTypeJSON 识别 type:'pattern'（含 sample/pattern_production 等
 *    别名），取 id/patternId 为 scanCode → PatternScanProcessor.handlePatternScan 按工序执行（入库为
 *    工序链末环），与 StylePrintModal 标签打印、StyleStageDrawer 出的码完全一致。
 * 2. 库存行（t_sample_stock）没有 patternId，只有 styleId——打印前按
 *    /production/pattern/by-style/{styleId} 反查样衣生产记录，按颜色匹配该色码（同
 *    useStylePrintData 的用法，命中率 100%）。
 * 3. 打印参数与现网标签一致：qrcode 库 ECC 'M'、480px 位图、打印尺寸 ≥15mm，扫码可靠性不受影响。
 */
import React, { useCallback, useMemo, useState } from 'react';
import { Alert, Button, InputNumber, Modal, Radio, Space, Spin } from 'antd';
import { PrinterOutlined, SwapOutlined } from '@ant-design/icons';
import QRCodeLib from 'qrcode';

import api from '@/utils/api';
import { message } from '@/utils/antdStatic';
import { safePrint } from '@/utils/safePrint';
import { SampleStock, SampleTypeMap } from '../types';

interface SampleQrPrintModalProps {
  open: boolean;
  stocks: SampleStock[];
  onClose: () => void;
}

/** 尺寸预设（cm，短边×长边）；横版/竖版决定谁是宽谁是高 */
const SIZE_PRESETS: Array<{ key: string; label: string; short: number; long: number }> = [
  { key: '40x60', label: '4×6cm', short: 40, long: 60 },
  { key: '40x70', label: '4×7cm', short: 40, long: 70 },
  { key: '50x80', label: '5×8cm', short: 50, long: 80 },
  { key: '50x100', label: '5×10cm', short: 50, long: 100 },
];

function escHtml(v: unknown): string {
  return String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const SampleQrPrintModal: React.FC<SampleQrPrintModalProps> = ({ open, stocks, onClose }) => {
  const [orientation, setOrientation] = useState<'portrait' | 'landscape'>('portrait');
  const [widthMm, setWidthMm] = useState<number>(40);
  const [heightMm, setHeightMm] = useState<number>(70);
  const [copies, setCopies] = useState<number>(1);
  const [resolving, setResolving] = useState(false);
  const [printing, setPrinting] = useState(false);
  // stockId -> 样衣生产记录ID（patternId）；无生产记录的款式不在 Map 里
  const [patternIdMap, setPatternIdMap] = useState<Record<string, string>>({});

  // ── 打开时按 styleId 反查样衣生产记录（二维码必须携带 patternId 才能被小程序识别） ──
  React.useEffect(() => {
    if (!open || stocks.length === 0) return;
    let cancelled = false;
    setResolving(true);
    setPatternIdMap({});
    (async () => {
      const next: Record<string, string> = {};
      await Promise.all(
        stocks.slice(0, 100).map(async (stock) => {
          if (!stock.styleId) return;
          try {
            const res = await api.get(`/production/pattern/by-style/${encodeURIComponent(String(stock.styleId))}`);
            const data: any = res?.data;
            const list: any[] = Array.isArray(data) ? data : (data && typeof data === 'object' ? [data] : []);
            if (list.length === 0 || !list[0]?.id) return;
            // 同款多色码时优先按库存行颜色匹配，匹配不到取第一条
            const matched = list.find((r) => String(r.color || '').trim() === String(stock.color || '').trim()) || list[0];
            next[stock.id] = String(matched.id);
          } catch {
            /* 反查失败按无记录处理，下面统一提示 */
          }
        }),
      );
      if (!cancelled) {
        setPatternIdMap(next);
        setResolving(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, stocks]);

  const unresolvable = useMemo(
    () => stocks.filter((s) => !patternIdMap[s.id]).map((s) => s.styleNo),
    [stocks, patternIdMap],
  );
  const printableStocks = useMemo(
    () => stocks.filter((s) => !!patternIdMap[s.id]),
    [stocks, patternIdMap],
  );
  const totalLabels = printableStocks.length * Math.max(1, copies);

  // ── 横竖版切换 = 交换宽高；预设按方向落宽高 ──
  const applyOrientation = (dir: 'portrait' | 'landscape') => {
    setOrientation(dir);
    const w = widthMm;
    const h = heightMm;
    const isPortraitNow = h >= w;
    if (dir === 'portrait' && !isPortraitNow) {
      setWidthMm(h);
      setHeightMm(w);
    } else if (dir === 'landscape' && isPortraitNow) {
      setWidthMm(h);
      setHeightMm(w);
    }
  };
  const applyPreset = (key: string) => {
    const p = SIZE_PRESETS.find((x) => x.key === key);
    if (!p) return;
    if (orientation === 'portrait') {
      setWidthMm(p.short);
      setHeightMm(p.long);
    } else {
      setWidthMm(p.long);
      setHeightMm(p.short);
    }
  };

  // ── 生成单个标签 HTML（布局与现网标签打印同源，尺寸随宽高缩放） ──
  const buildLabelHtml = useCallback(
    async (stock: SampleStock, qrUrls: Record<string, string>): Promise<string> => {
      const w = Math.max(20, Math.min(150, widthMm));
      const h = Math.max(20, Math.min(150, heightMm));
      const qrMm = Math.max(15, Math.min(32, Math.min(w, h) * 0.62));
      const fs = h >= 48 ? 6.7 : h >= 38 ? 5.9 : 5.4;
      const displayText = [stock.styleNo, stock.color, stock.size].filter(Boolean).join(' - ');
      const today = new Date();
      const dateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
      const infoRow = (lbl: string, val: string) =>
        val ? `<div class="info-row"><span class="lbl">${lbl}</span><span class="val">${escHtml(val)}</span></div>` : '';
      return `<div class="page"><div class="label">
        <div class="qr-col"><img src="${qrUrls[stock.id] || ''}" style="width:${qrMm}mm;height:${qrMm}mm;display:block;"/></div>
        <div class="info-col">
          <div class="ucode-row">${escHtml(displayText)}</div>
          ${infoRow('款号', stock.styleNo || '')}
          ${infoRow('款名', stock.styleName || '')}
          ${infoRow('颜色', stock.color || '')}
          ${infoRow('码数', stock.size || '')}
          ${infoRow('类型', SampleTypeMap[stock.sampleType] || '样衣')}
          ${infoRow('库位', stock.location || '')}
          <div class="info-row date-row">${dateStr}</div>
        </div>
      </div></div>`;
    },
    [widthMm, heightMm],
  );

  const handlePrint = useCallback(async () => {
    if (printableStocks.length === 0) {
      message.warning('没有可打印的样衣（缺少样衣生产记录）');
      return;
    }
    setPrinting(true);
    try {
      const w = Math.max(20, Math.min(150, widthMm));
      const h = Math.max(20, Math.min(150, heightMm));
      const fs = h >= 48 ? 6.7 : h >= 38 ? 5.9 : 5.4;
      // 每个库存行一个二维码（内容 = 该色码样衣生产记录），×份数
      const qrUrls: Record<string, string> = {};
      await Promise.all(
        printableStocks.map(async (stock) => {
          const payload = JSON.stringify({ type: 'pattern', id: patternIdMap[stock.id] });
          qrUrls[stock.id] = await QRCodeLib.toDataURL(payload, { width: 480, margin: 0, errorCorrectionLevel: 'M' }).catch(() => '');
        }),
      );
      const labels: string[] = [];
      for (const stock of printableStocks) {
        const one = await buildLabelHtml(stock, qrUrls);
        for (let i = 0; i < Math.max(1, copies); i++) labels.push(one);
      }
      const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
@page{size:${w}mm ${h}mm;margin:0}*{margin:0;padding:0;box-sizing:border-box}
html,body{width:${w}mm;color:#000!important;background:#fff!important}
body{font-family:'Microsoft YaHei','微软雅黑','PingFang SC','Heiti SC',Arial,serif}
.page{width:${w}mm;height:${h}mm;display:flex;align-items:center;justify-content:center;page-break-after:always}
.page:last-child{page-break-after:auto}
.label{width:calc(${w}mm - 3mm);height:calc(${h}mm - 3mm);border:0.8pt solid #333;display:flex;flex-direction:row;align-items:stretch;padding:1.5mm 2.5mm;gap:1.5mm}
.qr-col{flex:0 0 auto;display:flex;align-items:center;justify-content:center}
.qr-col img{display:block;object-fit:contain}
.info-col{flex:1;display:flex;flex-direction:column;justify-content:center;min-width:0;overflow:hidden;padding-left:0.5mm}
.ucode-row{font-size:${fs + 0.9}pt;font-weight:bold;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;padding-bottom:1mm;border-bottom:0.8pt dashed #999;margin-bottom:1.1mm}
.info-row{font-size:${fs}pt;display:flex;align-items:baseline;flex-wrap:nowrap;min-width:0;margin-bottom:0.65mm}
.lbl{color:#555!important;white-space:nowrap}.val{font-weight:600;margin-left:0.8mm;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0}
.date-row{color:#777!important;font-size:${fs - 0.4}pt;margin-top:2mm;padding-top:0.4mm}
</style></head><body>${labels.join('\n')}</body></html>`;
      safePrint(html, `样衣二维码-${printableStocks[0]?.styleNo || ''}`);
      message.success(`已发送 ${totalLabels} 张标签到打印机`);
    } catch {
      message.error('标签打印失败，请重试');
    } finally {
      setPrinting(false);
    }
  }, [printableStocks, patternIdMap, widthMm, heightMm, copies, buildLabelHtml, totalLabels]);

  // ── 屏幕预览：按真实 mm 尺寸渲染第一张标签（二维码按相同内容实时生成） ──
  const first = printableStocks[0] || stocks[0];
  const [previewQr, setPreviewQr] = useState('');
  React.useEffect(() => {
    let cancelled = false;
    setPreviewQr('');
    if (!open || !first || !patternIdMap[first.id]) return;
    const payload = JSON.stringify({ type: 'pattern', id: patternIdMap[first.id] });
    QRCodeLib.toDataURL(payload, { width: 240, margin: 1, errorCorrectionLevel: 'M' })
      .then((url) => { if (!cancelled) setPreviewQr(url); })
      .catch(() => { /* 预览失败不影响打印 */ });
    return () => { cancelled = true; };
  }, [open, first, patternIdMap]);

  return (
    <Modal
      title="打印样衣二维码"
      open={open}
      onCancel={onClose}
      width={680}
      footer={[
        <Button key="cancel" onClick={onClose}>取消</Button>,
        <Button
          key="print"
          type="primary"
          icon={<PrinterOutlined />}
          loading={printing}
          disabled={resolving || printableStocks.length === 0}
          onClick={() => void handlePrint()}
        >
          打印{totalLabels > 0 ? ` (${totalLabels}张)` : ''}
        </Button>,
      ]}
    >
      <Spin spinning={resolving} tip="正在关联样衣生产记录...">
        <Space direction="vertical" style={{ width: '100%' }} size={12}>
          {unresolvable.length > 0 && (
            <Alert
              type="warning"
              showIcon
              message={`以下款没有样衣生产记录，无法生成可扫二维码：${unresolvable.join('、')}`}
            />
          )}
          <div>
            <div style={{ marginBottom: 6, fontWeight: 500 }}>标签方向：</div>
            <Radio.Group
              value={orientation}
              onChange={(e) => applyOrientation(e.target.value)}
              optionType="button"
              buttonStyle="solid"
              options={[
                { label: '竖版', value: 'portrait' },
                { label: '横版', value: 'landscape' },
              ]}
            />
          </div>
          <div>
            <div style={{ marginBottom: 6, fontWeight: 500 }}>标签尺寸：</div>
            <Space wrap>
              <Radio.Group
                value={SIZE_PRESETS.some((p) => (orientation === 'portrait' ? p.short === widthMm && p.long === heightMm : p.long === widthMm && p.short === heightMm))
                  ? SIZE_PRESETS.find((p) => (orientation === 'portrait' ? p.short === widthMm && p.long === heightMm : p.long === widthMm && p.short === heightMm))?.key
                  : 'custom'}
                onChange={(e) => applyPreset(e.target.value)}
                optionType="button"
              >
                {SIZE_PRESETS.map((p) => (
                  <Radio.Button key={p.key} value={p.key}>{p.label}</Radio.Button>
                ))}
                <Radio.Button value="custom">自定义</Radio.Button>
              </Radio.Group>
              <Space.Compact>
                <InputNumber min={20} max={150} value={widthMm} onChange={(v) => setWidthMm(v || 40)} addonAfter="宽mm" style={{ width: 130 }} />
                <InputNumber min={20} max={150} value={heightMm} onChange={(v) => setHeightMm(v || 70)} addonAfter="高mm" style={{ width: 130 }} />
                <Button icon={<SwapOutlined />} onClick={() => applyOrientation(orientation === 'portrait' ? 'landscape' : 'portrait')}>横竖互换</Button>
              </Space.Compact>
            </Space>
          </div>
          <div>
            <div style={{ marginBottom: 6, fontWeight: 500 }}>打印份数：</div>
            <InputNumber min={1} max={200} value={copies} onChange={(v) => setCopies(v || 1)} style={{ width: 120 }} />
            <span style={{ marginLeft: 12, color: 'var(--color-text-tertiary)', fontSize: 13 }}>
              共 {printableStocks.length} 款 × {copies} 份 = {totalLabels} 张
            </span>
          </div>
          {first && (
            <div>
              <div style={{ marginBottom: 6, fontWeight: 500 }}>预览（第一张，按实际尺寸）：二维码内容与现网样衣扫码格式一致，可直接扫出入库</div>
              <div
                style={{
                  width: `${widthMm}mm`,
                  height: `${heightMm}mm`,
                  border: '0.8pt solid #999',
                  display: 'flex',
                  alignItems: 'center',
                  padding: '1.5mm 2.5mm',
                  gap: '1.5mm',
                  background: '#fff',
                  overflow: 'hidden',
                }}
              >
                <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {previewQr
                    ? <img src={previewQr} alt="二维码" style={{ width: `${Math.max(15, Math.min(32, Math.min(widthMm, heightMm) * 0.62))}mm`, objectFit: 'contain', display: 'block' }} />
                    : <span style={{ fontSize: 12, color: '#999' }}>二维码</span>}
                </div>
                <div style={{ flex: 1, minWidth: 0, fontSize: 13, lineHeight: 1.7 }}>
                  <div style={{ fontWeight: 700, borderBottom: '1px dashed #bbb', paddingBottom: 4, marginBottom: 4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {[first.styleNo, first.color, first.size].filter(Boolean).join(' - ')}
                  </div>
                  <div>款号：{first.styleNo}</div>
                  {first.styleName && <div>款名：{first.styleName}</div>}
                  {first.color && <div>颜色：{first.color}</div>}
                  {first.size && <div>码数：{first.size}</div>}
                  <div>类型：{SampleTypeMap[first.sampleType] || '样衣'}</div>
                  {first.location && <div>库位：{first.location}</div>}
                </div>
              </div>
            </div>
          )}
        </Space>
      </Spin>
    </Modal>
  );
};

export default SampleQrPrintModal;
