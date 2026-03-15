/**
 * 洗水唛 / 吊牌批量打印弹窗
 * 支持一次打印多个订单的洗水唛 + 吊牌
 * 打印方案：iframe HTML 注入（与 CuttingSheetPrintModal 相同模式）
 */
import React, { useRef, useState } from 'react';
import { Alert, Button, Divider, Radio, Space, Tag } from 'antd';
import { PrinterOutlined } from '@ant-design/icons';
import ResizableModal from '@/components/common/ResizableModal';

export interface WashLabelItem {
  orderNo: string;
  styleNo?: string;
  styleName?: string;
  color?: string;
  size?: string;
  fabricComposition?: string;
  washInstructions?: string;
  uCode?: string;
}

type PaperSize = '40x60' | '50x80' | '60x90';
type LabelType = 'wash' | 'hangtag' | 'both';

interface Props {
  open: boolean;
  onClose: () => void;
  items: WashLabelItem[];
  loading?: boolean;
}

const PAPER_SIZES: Record<PaperSize, { w: number; h: number; label: string }> = {
  '40x60': { w: 40, h: 60, label: '40×60mm（小水唛）' },
  '50x80': { w: 50, h: 80, label: '50×80mm（标准吊牌）' },
  '60x90': { w: 60, h: 90, label: '60×90mm（大吊牌）' },
};

function buildWashHtml(item: WashLabelItem, size: PaperSize): string {
  const comp = item.fabricComposition || '（成分未填写）';
  const wash = item.washInstructions || '（洗涤说明未填写）';
  return `<div class="label-page">
    <div class="title">成分 / Composition</div>
    <div class="comp">${comp}</div>
    <div class="divider-line"></div>
    <div class="line">${wash}</div>
    <div class="divider-line"></div>
    <div class="small">款号：${item.styleNo || '-'}${item.color ? '  颜色：' + item.color : ''}  码数：${item.size || '-'}</div>
  </div>`;
}

function buildTagHtml(item: WashLabelItem, size: PaperSize, qrDataUrl: string): string {
  const uCode = item.uCode || '';
  const qrSize = Math.min(PAPER_SIZES[size].w - 10, 28);
  return `<div class="label-page">
    <div class="brand">品牌名称</div>
    <div class="styleno">${item.styleNo || '-'}</div>
    ${item.styleName ? `<div class="name">${item.styleName}</div>` : ''}
    <div class="divider-line"></div>
    <div class="row">颜色：${item.color || '-'}　&nbsp;码数：${item.size || '-'}</div>
    <div class="row">订单：${item.orderNo}</div>
    ${uCode ? `<div class="divider-line"></div><div class="ucode">U码：${uCode}</div>` : ''}
    ${qrDataUrl ? `<div class="qr"><img src="${qrDataUrl}" width="${qrSize}mm" height="${qrSize}mm"/></div>` : ''}
  </div>`;
}

const WashLabelBatchPrintModal: React.FC<Props> = ({ open, onClose, items, loading }) => {
  const [paperSize, setPaperSize] = useState<PaperSize>('50x80');
  const [labelType, setLabelType] = useState<LabelType>('both');
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const handlePrint = async () => {
    if (!items.length) return;
    const { w, h } = PAPER_SIZES[paperSize];

    // 生成需要 QR 码的吊牌数据
    const qrMap: Record<string, string> = {};
    if (labelType !== 'wash') {
      await Promise.all(
        items.filter(it => it.uCode).map(async (it) => {
          try {
            const QRCode = await import('qrcode');
            qrMap[it.orderNo] = await QRCode.toDataURL(it.uCode!, { width: 180, margin: 1 });
          } catch { /* ignore */ }
        })
      );
    }

    const sharedCss = `
@page { size: ${w}mm ${h}mm; margin: 0; }
* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: 'PingFang SC','Heiti SC',Arial,sans-serif; }
.label-page {
  width: ${w}mm; min-height: ${h}mm;
  display: flex; flex-direction: column;
  align-items: center; justify-content: center;
  padding: 3mm; border: 0.5pt solid #333;
  page-break-after: always;
}
.title    { font-size: ${w >= 50 ? 8 : 7}pt; font-weight: bold; margin-bottom: 2mm; text-align: center; }
.comp     { font-size: ${w >= 50 ? 8 : 7}pt; font-weight: bold; text-align: center; margin: 1.5mm 0; line-height: 1.5; }
.line     { font-size: ${w >= 50 ? 7 : 6}pt; margin-bottom: 1.5mm; text-align: center; line-height: 1.4; }
.divider-line { border-top: 0.3pt solid #999; width: 90%; margin: 1.5mm auto; }
.small    { font-size: ${w >= 50 ? 6 : 5}pt; color: #555; text-align: center; }
.brand    { font-size: ${w >= 50 ? 10 : 8}pt; font-weight: bold; letter-spacing: 2px; margin-bottom: 2mm; }
.styleno  { font-size: ${w >= 50 ? 9 : 7}pt; font-weight: bold; margin-bottom: 1mm; }
.name     { font-size: ${w >= 50 ? 7 : 6}pt; color: #555; margin-bottom: 2mm; }
.row      { font-size: ${w >= 50 ? 7 : 6}pt; margin-bottom: 1mm; }
.ucode    { font-size: ${w >= 50 ? 6 : 5}pt; color: #888; margin-top: 1.5mm; letter-spacing: 1px; }
.qr       { margin-top: 2mm; }
`;

    const allPages = items.flatMap(item => {
      const pages: string[] = [];
      if (labelType === 'wash' || labelType === 'both') {
        pages.push(buildWashHtml(item, paperSize));
      }
      if (labelType === 'hangtag' || labelType === 'both') {
        pages.push(buildTagHtml(item, paperSize, qrMap[item.orderNo] || ''));
      }
      return pages;
    });

    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>${sharedCss}</style></head><body>${allPages.join('\n')}</body></html>`;

    if (!iframeRef.current) return;
    const doc = iframeRef.current.contentDocument || iframeRef.current.contentWindow?.document;
    if (!doc) return;
    doc.open(); doc.write(html); doc.close();
    setTimeout(() => iframeRef.current?.contentWindow?.print(), 400);
  };

  const missingDataCount = items.filter(
    it => labelType !== 'hangtag' && (!it.fabricComposition || !it.washInstructions)
  ).length;

  return (
    <ResizableModal
      open={open}
      title={<Space><PrinterOutlined />批量打印洗水唛 / 吊牌（{items.length} 件）</Space>}
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
            打印 {items.length} 张
          </Button>
        </Space>
      }
    >
      <Space direction="vertical" style={{ width: '100%' }} size="middle">
        {missingDataCount > 0 && (
          <Alert
            type="warning"
            showIcon
            message={`${missingDataCount} 个订单的款式未填写洗水唛信息，打印时将显示"未填写"`}
          />
        )}

        <div>
          <div style={{ marginBottom: 8, fontWeight: 500 }}>纸张规格</div>
          <Radio.Group value={paperSize} onChange={e => setPaperSize(e.target.value as PaperSize)}>
            {(Object.entries(PAPER_SIZES) as [PaperSize, { label: string }][]).map(([k, v]) => (
              <Radio.Button key={k} value={k}>{v.label}</Radio.Button>
            ))}
          </Radio.Group>
        </div>

        <div>
          <div style={{ marginBottom: 8, fontWeight: 500 }}>打印内容</div>
          <Radio.Group value={labelType} onChange={e => setLabelType(e.target.value as LabelType)}>
            <Radio.Button value="wash">仅洗水唛</Radio.Button>
            <Radio.Button value="hangtag">仅吊牌</Radio.Button>
            <Radio.Button value="both">洗水唛 + 吊牌</Radio.Button>
          </Radio.Group>
        </div>

        <Divider style={{ margin: '4px 0' }} />

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
                {it.uCode && (
                  <Tag style={{ fontSize: 11, color: '#888' }}>U码: {it.uCode}</Tag>
                )}
              </div>
            ))}
          </div>
        </div>
      </Space>
      <iframe ref={iframeRef} style={{ display: 'none' }} title="wash-label-print" />
    </ResizableModal>
  );
};

export default WashLabelBatchPrintModal;
