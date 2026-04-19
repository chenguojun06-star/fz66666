/**
 * 洗水唛批量打印弹窗
 * 打印方案：iframe HTML 注入（与 CuttingSheetPrintModal 相同模式）
 *
 * 布局规则：
 *   洗水唛 — 宽/高自由输入（mm），上下各一条虚线分割，内容距虚线 1.5cm
 *   U码标签 — 固定两档 4×7cm / 5×10cm
 */
import React, { useState } from 'react';
import { Alert, Button, Divider, InputNumber, Radio, Space, Tag } from 'antd';
import { PrinterOutlined } from '@ant-design/icons';
import ResizableModal from '@/components/common/ResizableModal';
import { buildWashLabelSections, getDisplayWashCareCodes } from '@/utils/washLabel';
import { safePrint } from '@/utils/safePrint';

export interface WashLabelItem {
  orderNo: string;
  styleNo?: string;
  styleName?: string;
  color?: string;
  size?: string;
  fabricComposition?: string;
  /** 多部位成分 JSON: [{part,materials}]，两件套/拼接款使用 */
  fabricCompositionParts?: string;
  washInstructions?: string;
  uCode?: string;
  washTempCode?: string;
  bleachCode?: string;
  tumbleDryCode?: string;
  ironCode?: string;
  dryCleanCode?: string;
}

/** U码固定两档规格 */
type UCodeSize = '40x70' | '50x100';
type LabelType = 'wash' | 'ucode';

interface Props {
  open: boolean;
  onClose: () => void;
  items: WashLabelItem[];
  loading?: boolean;
}

/** U码固定规格 */
const UCODE_SIZES: Record<UCodeSize, { w: number; h: number; label: string }> = {
  '40x70':  { w: 40, h: 70,  label: '4×7cm' },
  '50x100': { w: 50, h: 100, label: '5×10cm' },
};

// ─── ISO 3758 洗护图标 SVG（内联打印安全）────────────────────────────────────
function _tubSvg(inner: string): string {
  return `<svg viewBox="0 0 20 20" width="22" height="22" xmlns="http://www.w3.org/2000/svg"><path d="M2,9 L2,17 Q2,19 4,19 L16,19 Q18,19 18,17 L18,9 Z" fill="none" stroke="#000" stroke-width="1.5" stroke-linejoin="round"/><line x1="1" y1="9" x2="19" y2="9" stroke="#000" stroke-width="1.5"/>${inner}</svg>`;
}
function _triSvg(inner: string): string {
  return `<svg viewBox="0 0 20 20" width="22" height="22" xmlns="http://www.w3.org/2000/svg"><polygon points="10,2 19,18 1,18" fill="none" stroke="#000" stroke-width="1.5"/>${inner}</svg>`;
}
function _sqSvg(inner: string): string {
  return `<svg viewBox="0 0 20 20" width="22" height="22" xmlns="http://www.w3.org/2000/svg"><rect x="2" y="2" width="16" height="16" fill="none" stroke="#000" stroke-width="1.5"/>${inner}</svg>`;
}
function _ironSvg(dots: number, cross = false): string {
  const ds = Array.from({ length: dots }, (_, i) => `<circle cx="${7 + i * 3.5}" cy="13" r="1" fill="#000"/>`).join('');
  const cx = cross ? '<line x1="5" y1="9" x2="17" y2="16" stroke="#000" stroke-width="1.5"/><line x1="17" y1="9" x2="5" y2="16" stroke="#000" stroke-width="1.5"/>' : '';
  return `<svg viewBox="0 0 24 20" width="26" height="22" xmlns="http://www.w3.org/2000/svg"><path d="M2,17 L20,17 L22,11 C20,7 15,7 10,7 L5,7 Q3,7 2,10 Z" fill="none" stroke="#000" stroke-width="1.5" stroke-linejoin="round"/>${ds}${cx}</svg>`;
}
function _circSvg(inner: string): string {
  return `<svg viewBox="0 0 20 20" width="22" height="22" xmlns="http://www.w3.org/2000/svg"><circle cx="10" cy="10" r="8" fill="none" stroke="#000" stroke-width="1.5"/>${inner}</svg>`;
}
const _CARE_X = '<line x1="5" y1="5" x2="15" y2="15" stroke="#000" stroke-width="1.5"/><line x1="15" y1="5" x2="5" y2="15" stroke="#000" stroke-width="1.5"/>';
const _numTxt = (n: string) => `<text x="10" y="17" text-anchor="middle" font-size="6" fill="#000" font-family="Arial,sans-serif" font-weight="bold">${n}</text>`;
const CARE_SVGS: Record<string, string> = {
  wash_W30: _tubSvg(_numTxt('30°')), wash_W40: _tubSvg(_numTxt('40°')),
  wash_W60: _tubSvg(_numTxt('60°')), wash_W95: _tubSvg(_numTxt('95°')),
  wash_HAND: _tubSvg('<path d="M7,17 L7,12 L9.5,12 L9.5,10.5 L12,10.5 L12,12 L14,12 L14,15 Q14,17 12,17 Z" fill="none" stroke="#000" stroke-width="1"/>'),
  wash_NO: _tubSvg('<line x1="5" y1="10" x2="15" y2="17" stroke="#000" stroke-width="1.5"/><line x1="15" y1="10" x2="5" y2="17" stroke="#000" stroke-width="1.5"/>'),
  bleach_ANY: _triSvg(''),
  bleach_NON_CHL: _triSvg('<line x1="7" y1="18" x2="11" y2="10" stroke="#000" stroke-width="1.5"/>'),
  bleach_NO: _triSvg(_CARE_X),
  dry_NORMAL: _sqSvg('<circle cx="10" cy="10" r="5" fill="none" stroke="#000" stroke-width="1.2"/>'),
  dry_LOW: _sqSvg('<circle cx="10" cy="10" r="5" fill="none" stroke="#000" stroke-width="1.2"/><circle cx="10" cy="10" r="1.5" fill="#000"/>'),
  dry_NO: _sqSvg(_CARE_X),
  iron_LOW: _ironSvg(1), iron_MED: _ironSvg(2), iron_HIGH: _ironSvg(3), iron_NO: _ironSvg(0, true),
  dryclean_YES: _circSvg('<text x="10" y="14.5" text-anchor="middle" font-size="9" fill="#000" font-family="Arial,sans-serif" font-style="italic">A</text>'),
  dryclean_NO: _circSvg(_CARE_X),
};
function buildCareIconsHtml(item: WashLabelItem): string {
  const codes = getDisplayWashCareCodes(item, item.washInstructions);
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
function buildUCodeHtml(item: WashLabelItem, w: number, qrDataUrl: string): string {
  const qrSize = Math.min(w - 8, 32);
  const now = new Date();
  const dateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
  return `<div class="label-page">
    <div class="dash-sep"></div>
    <div class="content-area">
      <div class="sub">款号：${item.styleNo || '-'}${item.color ? '&nbsp;&nbsp;颜色：' + item.color : ''}${item.size ? '&nbsp;&nbsp;码：' + item.size : ''}</div>
      <div class="hr"></div>
      <div class="ucode-val">${item.uCode || '（U码未填写）'}</div>
      ${qrDataUrl ? `<div class="qr"><img src="${qrDataUrl}" width="${qrSize}mm" height="${qrSize}mm"/></div>` : ''}
      <div class="hr"></div>
      <div class="small">${item.orderNo}</div>
      <div class="date">${dateStr}</div>
    </div>
    <div class="dash-sep"></div>
  </div>`;
}

function buildWashHtml(item: WashLabelItem): string {
  // 多部位成分（套装上下装分段显示）
  const sections = buildWashLabelSections(item.fabricCompositionParts, item.fabricComposition);
  const showPartTitle = sections.length > 1;
  let compositionHtml = sections
    .map(section =>
      `<div class="comp-block">${showPartTitle && section.key !== 'other' ? `<span class="comp-name">${section.label}:</span>` : ''}` +
      `<div class="comp-mats">${section.items.join('<br/>')}</div></div>`
    ).join('');
  if (!compositionHtml) compositionHtml = '<div class="comp-mats">（成分未填写）</div>';
  // 洗护文字说明（从款式档案原文透传）
  const washText = (item.washInstructions || '').replace(/^洗涤说明[（(]水洗标专用[）)]\s*/u, '').trim();
  const washInstHtml = washText
    ? `<div class="care-wash">${washText.replace(/\n/g, '<br/>')}</div>`
    : '';
  // ISO 护理英文文字行
  // ISO 图标行
  const careIconRow = buildCareIconsHtml(item);
  const now = new Date();
  const dateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
  return `<div class="label-page">
    <div class="dash-sep"></div>
    <div class="top-block">
      <div class="style-no">款号：${item.styleNo || '-'}</div>
      <div class="style-name">款名：${item.styleName || '-'}</div>
    </div>
    <div class="content-block">
      ${compositionHtml}
      ${washInstHtml ? `<div class="wash-title">洗涤说明</div>${washInstHtml}` : ''}
    </div>
    <div class="bottom-block">
      ${careIconRow || ''}
      <div class="footer">MADE IN CHINA</div>
      <div class="date">${dateStr}</div>
    </div>
    <div class="dash-sep"></div>
  </div>`;
}


const WashLabelBatchPrintModal: React.FC<Props> = ({ open, onClose, items, loading }) => {
  /** 洗水唛自定义尺寸（mm） */
  const [washW, setWashW] = useState<number>(30);
  const [washH, setWashH] = useState<number>(80);
  /** U码固定规格 */
  const [uCodeSize, setUCodeSize] = useState<UCodeSize>('40x70');
  const [labelType, setLabelType] = useState<LabelType>('wash');

  const handlePrint = async () => {
    if (!items.length) return;
    const w = labelType === 'ucode' ? UCODE_SIZES[uCodeSize].w : washW;
    const h = labelType === 'ucode' ? UCODE_SIZES[uCodeSize].h : washH;
    const fs = w >= 48 ? 6.5 : 5.5;   // base font-size (pt)

    const sharedCss = `
@page { size: ${w}mm ${h}mm; margin: 0; }
* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: 'Microsoft YaHei', '微软雅黑', 'PingFang SC', 'Heiti SC', Arial, sans-serif; color: #000; background: #fff; }
/* ── 标签外框 ── */
.label-page {
  position: relative;
  width: ${w}mm; height: ${h}mm;
  padding: 0 2.2mm;
  page-break-after: always;
}
/* ── 上下虚线分割 ── */
.dash-sep {
  border: none;
  border-top: 0.8pt dashed #555;
  width: calc(100% + 6mm);
  margin-left: -3mm;
}
.top-block { position: absolute; left: 2.2mm; right: 2.2mm; top: 15mm; text-align: center; }
.style-no { font-size: ${w <= 30 ? fs - 0.1 : fs + 0.2}pt; font-weight: bold; line-height: 1.35; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.style-name { font-size: ${w <= 30 ? fs - 0.6 : fs - 0.2}pt; line-height: 1.35; margin-top: 0.8mm; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.content-block { position: absolute; left: 2.2mm; right: 2.2mm; top: 24mm; bottom: 24mm; overflow: hidden; }
.comp-block { margin: 0.3mm 0 1.1mm; }
.comp-name  { font-size: ${w <= 30 ? fs + 0.2 : fs}pt; font-weight: bold; display: block; margin-bottom: 0.6mm; }
.comp-mats  { font-size: ${w <= 30 ? fs + 1.7 : fs}pt; line-height: 1.55; white-space: pre-wrap; font-weight: bold; }
/* 洗涤说明原文 */
.wash-title { font-size: ${w <= 30 ? fs - 0.1 : fs}pt; color: #444; line-height: 1.5; margin-bottom: 0.6mm; }
.care-wash  { font-size: ${fs}pt; color: #444; line-height: 1.6; margin-top: 1.6mm; }
/* ISO 图标行 */
.bottom-block { position: absolute; left: 2.2mm; right: 2.2mm; bottom: 6.5mm; display: flex; flex-direction: column; align-items: center; }
.icons     { display: flex; gap: 0.45mm; align-items: center; justify-content: center; flex-wrap: nowrap; width: 100%; margin: 1.8mm auto 0; min-height: 6mm; }
.icon-cell { width: 4.8mm; height: 4.8mm; display: flex; align-items: center; justify-content: center; flex: 0 0 auto; }
.icons svg { width: 100%; height: 100%; }
.footer    { margin-top: 2.1mm; font-size: ${w <= 30 ? fs - 0.2 : fs}pt; font-weight: bold; letter-spacing: 0.6mm; line-height: 1.3; text-align: center; white-space: nowrap; }
.date      { margin-top: 2.2mm; font-size: ${fs - 0.5}pt; color: #777; text-align: center; }
/* U码专属 */
.ucode-val { font-size: ${w >= 45 ? 9 : 7.5}pt; font-weight: bold; text-align: center;
             letter-spacing: 0.5mm; margin: 1.5mm 0; word-break: break-all; }
.qr        { text-align: center; margin: 1mm 0; }
`;

    let allPages: string[];
    if (labelType === 'ucode') {
      const qrMap: Record<string, string> = {};
      await Promise.all(
        items.filter(it => it.uCode).map(async (it) => {
          try {
            const QRCode = await import('qrcode');
            qrMap[it.orderNo] = await QRCode.toDataURL(it.uCode!, { width: 180, margin: 1 });
          } catch { /* ignore */ }
        })
      );
      allPages = items.map(item => buildUCodeHtml(item, w, qrMap[item.orderNo] || ''));
    } else {
      allPages = items.map(item => buildWashHtml(item));
    }

    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>${sharedCss}</style></head><body>${allPages.join('\n')}</body></html>`;

    safePrint(html);
  };

  const missingDataCount = labelType === 'wash'
    ? items.filter(it => !it.fabricComposition && !it.fabricCompositionParts).length
    : items.filter(it => !it.uCode).length;

  return (
    <ResizableModal
      open={open}
      title={<Space><PrinterOutlined />批量打印（{items.length} 件）</Space>}
      onCancel={onClose}
      width="40vw"
      footer={
        <Space>
          <Button onClick={onClose}>取消</Button>
          <Button
            type="primary"
            icon={<PrinterOutlined />}
            onClick={handlePrint}
            disabled={!items.length || loading}
          >
            打印 {items.length} 张{labelType === 'ucode' ? '（U码）' : '（洗水唛）'}
          </Button>
        </Space>
      }
    >
      <Space orientation="vertical" style={{ width: '100%' }} size="middle">

        {/* 打印类型 */}
        <div>
          <div style={{ marginBottom: 8, fontWeight: 500 }}>打印类型</div>
          <Radio.Group value={labelType} onChange={e => setLabelType(e.target.value as LabelType)}>
            <Radio.Button value="wash">洗水唛</Radio.Button>
            <Radio.Button value="ucode">U码标签</Radio.Button>
          </Radio.Group>
        </div>

        {missingDataCount > 0 && (
          <Alert
            type="warning"
            showIcon
            title={labelType === 'wash'
              ? `${missingDataCount} 个订单的款式未填写面料成分，打印时将显示"成分未填写"`
              : `${missingDataCount} 个订单未填写 U 码，QR 码将留空`}
          />
        )}

        {/* 洗水唛：自定义宽高 */}
        {labelType === 'wash' && (
          <div>
            <div style={{ marginBottom: 8, fontWeight: 500 }}>纸张规格（自定义）</div>
            <Space wrap>
              <span style={{ color: '#555' }}>宽</span>
              <InputNumber
                min={20} max={200}
                value={washW}
                onChange={v => setWashW(v ?? 30)}
                suffix="mm"
                style={{ width: 110 }}
              />
              <span style={{ color: '#555' }}>高</span>
              <InputNumber
                min={30} max={400}
                value={washH}
                onChange={v => setWashH(v ?? 80)}
                suffix="mm"
                style={{ width: 110 }}
              />
            </Space>
            <div style={{ fontSize: 12, color: '#999', marginTop: 6 }}>
              上下各一条虚线分割，内容距分割线 1.5cm
            </div>
          </div>
        )}

        {/* U码：固定两档 */}
        {labelType === 'ucode' && (
          <div>
            <div style={{ marginBottom: 8, fontWeight: 500 }}>U码规格</div>
            <Radio.Group value={uCodeSize} onChange={e => setUCodeSize(e.target.value as UCodeSize)}>
              {(Object.entries(UCODE_SIZES) as [UCodeSize, { label: string }][]).map(([k, v]) => (
                <Radio.Button key={k} value={k}>{v.label}</Radio.Button>
              ))}
            </Radio.Group>
          </div>
        )}

        <Divider style={{ margin: '4px 0' }} />

        {/* 待打印订单预览列表 */}
        <div>
          <div style={{ marginBottom: 6, fontWeight: 500, fontSize: 13 }}>
            待打印订单（{items.length} 条）
          </div>
          <div style={{ maxHeight: 200, overflowY: 'auto' }}>
            {items.map(it => (
              <div
                key={it.orderNo}
                style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '4px 0', borderBottom: '1px solid #f0f0f0' }}
              >
                <Tag color="blue" style={{ minWidth: 100, textAlign: 'center' }}>{it.orderNo}</Tag>
                <span style={{ fontSize: 12, color: '#666' }}>
                  {it.styleNo}{it.color ? ' / ' + it.color : ''}{it.size ? ' / ' + it.size : ''}
                </span>
                {labelType === 'ucode' && it.uCode && (
                  <Tag style={{ fontSize: 11, color: '#888' }}>U: {it.uCode}</Tag>
                )}
              </div>
            ))}
          </div>
        </div>
      </Space>
    </ResizableModal>
  );
};

export default WashLabelBatchPrintModal;
