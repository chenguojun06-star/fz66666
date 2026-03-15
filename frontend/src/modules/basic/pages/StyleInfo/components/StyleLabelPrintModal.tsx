/**
 * 洗水唛 / 吊牌标签打印弹窗
 * 支持：
 *   - 洗水唛（Washing Care Label）：成分 + 洗涤说明 + 款号 + 码数
 *   - 吊牌（Hangtag）：品牌 + 款号 + 颜色 + 码数 + U编码 + QR码
 * 纸张规格：40×60mm（小水唛） / 50×80mm（标准吊牌） / 60×90mm（大吊牌）
 */
import React, { useState, useRef } from 'react';
import { Button, Radio, Space, Tag, Divider, Alert, Checkbox } from 'antd';
import { PrinterOutlined, TagOutlined } from '@ant-design/icons';
import ResizableModal from '@/components/common/ResizableModal';

interface StyleLabelInfo {
  styleNo?: string;
  styleName?: string;
  color?: string;
  size?: string;
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

// ─── 洗涤护理图标 SVG（ISO 3758，内联 SVG）────────────────────────────────────
function _tub(i: string) { return `<svg viewBox="0 0 20 20" width="20" height="20" xmlns="http://www.w3.org/2000/svg"><path d="M2,9 L2,17 Q2,19 4,19 L16,19 Q18,19 18,17 L18,9 Z" fill="none" stroke="#000" stroke-width="1.5" stroke-linejoin="round"/><line x1="1" y1="9" x2="19" y2="9" stroke="#000" stroke-width="1.5"/>${i}</svg>`; }
function _tri(i: string) { return `<svg viewBox="0 0 20 20" width="20" height="20" xmlns="http://www.w3.org/2000/svg"><polygon points="10,2 19,18 1,18" fill="none" stroke="#000" stroke-width="1.5"/>${i}</svg>`; }
function _sq(i: string)  { return `<svg viewBox="0 0 20 20" width="20" height="20" xmlns="http://www.w3.org/2000/svg"><rect x="2" y="2" width="16" height="16" fill="none" stroke="#000" stroke-width="1.5"/>${i}</svg>`; }
function _iron(dots: number, cross: boolean) {
  const ds = Array.from({ length: dots }, (_, k) => `<circle cx="${7 + k * 3.5}" cy="13" r="1" fill="#000"/>`).join('');
  const cx = cross ? '<line x1="5" y1="9" x2="17" y2="16" stroke="#000" stroke-width="1.5"/><line x1="17" y1="9" x2="5" y2="16" stroke="#000" stroke-width="1.5"/>' : '';
  return `<svg viewBox="0 0 24 20" width="24" height="20" xmlns="http://www.w3.org/2000/svg"><path d="M2,17 L20,17 L22,11 C20,7 15,7 10,7 L5,7 Q3,7 2,10 Z" fill="none" stroke="#000" stroke-width="1.5" stroke-linejoin="round"/>${ds}${cx}</svg>`;
}
function _circ(i: string) { return `<svg viewBox="0 0 20 20" width="20" height="20" xmlns="http://www.w3.org/2000/svg"><circle cx="10" cy="10" r="8" fill="none" stroke="#000" stroke-width="1.5"/>${i}</svg>`; }
const _X = '<line x1="5" y1="5" x2="15" y2="15" stroke="#000" stroke-width="1.5"/><line x1="15" y1="5" x2="5" y2="15" stroke="#000" stroke-width="1.5"/>';
const _n = (n: string) => `<text x="10" y="17" text-anchor="middle" font-size="6" fill="#000" font-family="Arial,sans-serif" font-weight="bold">${n}</text>`;
const CARE_SVG_MAP: Record<string, string> = {
  wash_W30: _tub(_n('30°')), wash_W40: _tub(_n('40°')), wash_W60: _tub(_n('60°')), wash_W95: _tub(_n('95°')),
  wash_HAND: _tub('<path d="M7,17 L7,12 L9.5,12 L9.5,10.5 L12,10.5 L12,12 L14,12 L14,15 Q14,17 12,17 Z" fill="none" stroke="#000" stroke-width="1"/>'),
  wash_NO: _tub('<line x1="5" y1="10" x2="15" y2="17" stroke="#000" stroke-width="1.5"/><line x1="15" y1="10" x2="5" y2="17" stroke="#000" stroke-width="1.5"/>'),
  bleach_ANY: _tri(''), bleach_NON_CHL: _tri('<line x1="7" y1="18" x2="11" y2="10" stroke="#000" stroke-width="1.5"/>'), bleach_NO: _tri(_X),
  dry_NORMAL: _sq('<circle cx="10" cy="10" r="5" fill="none" stroke="#000" stroke-width="1.2"/>'),
  dry_LOW: _sq('<circle cx="10" cy="10" r="5" fill="none" stroke="#000" stroke-width="1.2"/><circle cx="10" cy="10" r="1.5" fill="#000"/>'),
  dry_NO: _sq(_X),
  iron_LOW: _iron(1, false), iron_MED: _iron(2, false), iron_HIGH: _iron(3, false), iron_NO: _iron(0, true),
  dryclean_YES: _circ('<text x="10" y="14.5" text-anchor="middle" font-size="9" fill="#000" font-family="Arial,sans-serif" font-style="italic">A</text>'),
  dryclean_NO: _circ(_X),
};
function buildCareIconRow(info: StyleLabelInfo): string {
  const icons = [
    info.washTempCode  ? (CARE_SVG_MAP[`wash_${info.washTempCode}`] ?? '')      : '',
    info.bleachCode    ? (CARE_SVG_MAP[`bleach_${info.bleachCode}`] ?? '')      : '',
    info.tumbleDryCode ? (CARE_SVG_MAP[`dry_${info.tumbleDryCode}`] ?? '')      : '',
    info.ironCode      ? (CARE_SVG_MAP[`iron_${info.ironCode}`] ?? '')          : '',
    info.dryCleanCode  ? (CARE_SVG_MAP[`dryclean_${info.dryCleanCode}`] ?? '') : '',
  ].filter(Boolean);
  if (!icons.length) return '';
  return `<div class="care-icons">${icons.join('')}</div>`;
}

interface Props {
  open: boolean;
  onClose: () => void;
  style: StyleLabelInfo;
}

type PaperSize = '40x60' | '50x80' | '60x90';
type LabelType = 'wash' | 'hangtag' | 'both';

const PAPER_SIZES: Record<PaperSize, { w: number; h: number; label: string }> = {
  '40x60': { w: 40,  h: 60,  label: '40×60mm（小水唛）' },
  '50x80': { w: 50,  h: 80,  label: '50×80mm（标准吊牌）' },
  '60x90': { w: 60,  h: 90,  label: '60×90mm（大吊牌）' },
};

/**
 * 洗水唛打印内容（纯 HTML，注入 iframe 打印）
 */
function buildWashLabelHtml(info: StyleLabelInfo, size: PaperSize): string {
  const { w, h } = PAPER_SIZES[size];
  const comp   = info.fabricComposition  || '（未填写成分）';
  const wash   = info.washInstructions   || '（未填写洗涤说明）';
  const styleNo = info.styleNo || '-';
  const sizeStr = info.size   || '-';
  const color   = info.color  || '';
  const careIconRow = buildCareIconRow(info);

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>洗水唛打印</title>
<style>
  @page { size: ${w}mm ${h}mm; margin: 0; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'PingFang SC', 'Heiti SC', Arial, sans-serif; }
  .page {
    width: ${w}mm; height: ${h}mm;
    display: flex; flex-direction: column;
    align-items: center; justify-content: center;
    padding: 3mm;
    border: 0.5pt solid #333;
  }
  .title { font-size: ${w >= 50 ? 8 : 7}pt; font-weight: bold; margin-bottom: 2mm; text-align: center; }
  .line  { font-size: ${w >= 50 ? 7 : 6}pt; margin-bottom: 1.5mm; text-align: center; line-height: 1.4; }
  .comp  { font-size: ${w >= 50 ? 8 : 7}pt; font-weight: bold; text-align: center; margin: 2mm 0; line-height: 1.5; }
  .divider { border-top: 0.3pt solid #999; width: 90%; margin: 1.5mm auto; }
  .small { font-size: ${w >= 50 ? 6 : 5}pt; color: #555; text-align: center; }
  .care-icons { display: flex; gap: 2mm; justify-content: center; align-items: center; padding: 1mm 0; }
</style>
</head>
<body>
<div class="page">
  <div class="title">成分 / Composition</div>
  <div class="comp">${comp}</div>
  <div class="divider"></div>
  <div class="line">${wash}</div>
  ${careIconRow ? `<div class="divider"></div>${careIconRow}` : ''}
  <div class="divider"></div>
  <div class="small">款号：${styleNo}${color ? '  颜色：' + color : ''}  码数：${sizeStr}</div>
</div>
</body>
</html>`;
}

/**
 * 吊牌打印内容
 */
function buildHangtagHtml(info: StyleLabelInfo, size: PaperSize, qrDataUrl: string): string {
  const { w, h } = PAPER_SIZES[size];
  const styleNo = info.styleNo || '-';
  const name    = info.styleName || '';
  const color   = info.color || '-';
  const sizeStr = info.size  || '-';
  const uCode   = info.uCode || '';
  const qrSize  = Math.min(w - 10, h * 0.35, 28);

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>吊牌打印</title>
<style>
  @page { size: ${w}mm ${h}mm; margin: 0; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'PingFang SC', 'Heiti SC', Arial, sans-serif; }
  .page {
    width: ${w}mm; height: ${h}mm;
    display: flex; flex-direction: column;
    align-items: center; justify-content: center;
    padding: 3mm;
    border: 0.5pt solid #333;
  }
  .brand   { font-size: ${w >= 50 ? 10 : 8}pt; font-weight: bold; letter-spacing: 2px; margin-bottom: 2mm; }
  .styleno { font-size: ${w >= 50 ? 9 : 7}pt; font-weight: bold; margin-bottom: 1mm; }
  .name    { font-size: ${w >= 50 ? 7 : 6}pt; color: #555; margin-bottom: 2mm; }
  .row     { font-size: ${w >= 50 ? 7 : 6}pt; margin-bottom: 1mm; }
  .divider { border-top: 0.3pt solid #999; width: 90%; margin: 1.5mm auto; }
  .ucode   { font-size: ${w >= 50 ? 6 : 5}pt; color: #888; margin-top: 1.5mm; letter-spacing: 1px; }
  .qr      { margin-top: 2mm; }
</style>
</head>
<body>
<div class="page">
  <div class="brand">品牌名称</div>
  <div class="styleno">${styleNo}</div>
  ${name ? `<div class="name">${name}</div>` : ''}
  <div class="divider"></div>
  <div class="row">颜色：${color}　　码数：${sizeStr}</div>
  ${uCode ? `<div class="divider"></div><div class="ucode">U码：${uCode}</div>` : ''}
  ${qrDataUrl ? `<div class="qr"><img src="${qrDataUrl}" width="${qrSize}mm" height="${qrSize}mm"/></div>` : ''}
</div>
</body>
</html>`;
}

const StyleLabelPrintModal: React.FC<Props> = ({ open, onClose, style }) => {
  const [paperSize, setPaperSize] = useState<PaperSize>('50x80');
  const [labelType, setLabelType] = useState<LabelType>('both');
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const hasMissingData = !style.fabricComposition || !style.washInstructions;

  const handlePrint = async () => {
    // 生成 U码 QR DataURL（仅吊牌需要）
    let qrDataUrl = '';
    if ((labelType === 'hangtag' || labelType === 'both') && style.uCode) {
      try {
        const QRCode = await import('qrcode');
        qrDataUrl = await QRCode.toDataURL(style.uCode, {
          width: 180, margin: 1, errorCorrectionLevel: 'M',
        });
      } catch { /* ignore */ }
    }

    let html = '';
    if (labelType === 'wash') {
      html = buildWashLabelHtml(style, paperSize);
    } else if (labelType === 'hangtag') {
      html = buildHangtagHtml(style, paperSize, qrDataUrl);
    } else {
      // both：同一页面分两个标签
      const washHtml  = buildWashLabelHtml(style, paperSize);
      const tagHtml   = buildHangtagHtml(style, paperSize, qrDataUrl);
      // 把两个 .page 合并到一个文档
      const washBody  = washHtml.replace(/[\s\S]*<body>([\s\S]*)<\/body>[\s\S]*/, '$1').trim();
      const tagBody   = tagHtml.replace(/[\s\S]*<body>([\s\S]*)<\/body>[\s\S]*/, '$1').trim();
      const styleTag  = washHtml.replace(/[\s\S]*<style>([\s\S]*)<\/style>[\s\S]*/, '$1');
      const { w, h } = PAPER_SIZES[paperSize];
      html = `<!DOCTYPE html><html><head><meta charset="UTF-8">
<style>
@page { size: ${w}mm ${h}mm; margin: 0; }
* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: 'PingFang SC','Heiti SC',Arial,sans-serif; }
${styleTag}
</style></head><body>
${washBody}
${tagBody}
</body></html>`;
    }

    if (!iframeRef.current) return;
    const doc = iframeRef.current.contentDocument || iframeRef.current.contentWindow?.document;
    if (!doc) return;
    doc.open();
    doc.write(html);
    doc.close();
    setTimeout(() => {
      iframeRef.current?.contentWindow?.print();
    }, 400);
  };

  return (
    <ResizableModal
      open={open}
      title={<Space><TagOutlined />洗水唛 / 吊牌标签打印</Space>}
      onCancel={onClose}
      width="40vw"
      footer={
        <Space>
          <Button onClick={onClose}>取消</Button>
          <Button type="primary" icon={<PrinterOutlined />} onClick={handlePrint}>
            打印标签
          </Button>
        </Space>
      }
    >
      {hasMissingData && (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 16 }}
          message="面料成分或洗涤说明未填写，请先在基本信息中完善后再打印洗水唛"
          description="可先打印吊牌，洗水唛待信息完善后再打印"
        />
      )}

      {/* 款式信息预览 */}
      <div style={{
        background: '#f8f9fa', border: '1px solid #e8e8e8',
        borderRadius: 6, padding: '12px 16px', marginBottom: 16,
      }}>
        <div style={{ fontWeight: 600, marginBottom: 8 }}>款式信息</div>
        <Space wrap>
          <Tag>款号：{style.styleNo || '—'}</Tag>
          {style.color && <Tag>颜色：{style.color}</Tag>}
          {style.size  && <Tag>码数：{style.size}</Tag>}
          {style.uCode && <Tag color="blue">U码：{style.uCode}</Tag>}
        </Space>
        {style.fabricComposition && (
          <div style={{ marginTop: 8, fontSize: 13 }}>
            <span style={{ color: '#666' }}>成分：</span>{style.fabricComposition}
          </div>
        )}
        {style.washInstructions && (
          <div style={{ marginTop: 4, fontSize: 13 }}>
            <span style={{ color: '#666' }}>洗涤：</span>{style.washInstructions}
          </div>
        )}
      </div>

      <Divider style={{ margin: '12px 0' }} />

      {/* 打印配置 */}
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontWeight: 500, marginBottom: 8 }}>打印类型</div>
        <Radio.Group
          value={labelType}
          onChange={e => setLabelType(e.target.value)}
        >
          <Radio value="wash">仅洗水唛</Radio>
          <Radio value="hangtag">仅吊牌</Radio>
          <Radio value="both">洗水唛 + 吊牌</Radio>
        </Radio.Group>
      </div>

      <div>
        <div style={{ fontWeight: 500, marginBottom: 8 }}>纸张规格</div>
        <Radio.Group
          value={paperSize}
          onChange={e => setPaperSize(e.target.value)}
        >
          {(Object.keys(PAPER_SIZES) as PaperSize[]).map(key => (
            <Radio key={key} value={key}>{PAPER_SIZES[key].label}</Radio>
          ))}
        </Radio.Group>
      </div>

      <div style={{ marginTop: 12, color: '#888', fontSize: 12 }}>
        提示：建议使用专用标签打印机，或A4纸打印后裁剪。打印时选择"每页适合标签数量"以避免缩放。
      </div>

      {/* 隐藏的 iframe，用于打印 */}
      <iframe
        ref={iframeRef}
        style={{ display: 'none', width: 0, height: 0, border: 'none' }}
        title="label-print-frame"
      />
    </ResizableModal>
  );
};

export default StyleLabelPrintModal;
