import { useState, useCallback } from 'react';
import { Radio, InputNumber, Button, Space, App } from 'antd';
import { PrinterOutlined } from '@ant-design/icons';
import ResizableModal from '@/components/common/ResizableModal';
import { StyleInfo } from '@/types/style';
import QRCode from 'qrcode';

interface SampleLabelPrintModalProps {
  open: boolean;
  onClose: () => void;
  record: StyleInfo | null;
}

type LabelSize = '40x70' | '50x100';
const SIZE_MAP: Record<LabelSize, [number, number]> = {
  '40x70': [70, 40],
  '50x100': [100, 50],
};

async function printSampleLabels(
  record: StyleInfo,
  printCount: number,
  w: number,
  h: number,
): Promise<void> {
  const today = new Date();
  const dateStr = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}`;

  const styleNo = record.styleNo || '';
  const styleName = record.styleName || '';
  const color = record.color || '';
  const quantity = record.sampleQuantity ?? '';
  const qrMm = 26;
  const qrPx = 480;
  const fs = h >= 48 ? 6.2 : h >= 38 ? 5.4 : 4.9;

  const qrContent = [styleNo, color].filter(Boolean).join('-');
  const total = Math.max(1, printCount);

  // 批量生成 QR DataURL
  const BATCH_SIZE = 20;
  const qrUrls: string[] = new Array(total).fill('');
  for (let i = 0; i < total; i += BATCH_SIZE) {
    const batchSize = Math.min(BATCH_SIZE, total - i);
    const batchResults = await Promise.all(
      Array.from({ length: batchSize }, () =>
        QRCode.toDataURL(qrContent, { width: qrPx, margin: 0, errorCorrectionLevel: 'M' }).catch(() => '')
      )
    );
    batchResults.forEach((url, j) => { qrUrls[i + j] = url; });
  }

  const labelsHtml = Array.from({ length: total }, (_, idx) => {
    return `<div class="page">
      <div class="label">
        <div class="qr-col">
          <img src="${qrUrls[idx]}" style="width:${qrMm}mm;height:${qrMm}mm;display:block;"/>
        </div>
        <div class="info-col">
          <div class="ucode-row">${qrContent}</div>
          <div class="info-row"><span class="lbl">款号</span><span class="val">${styleNo}</span></div>
          ${styleName ? `<div class="info-row"><span class="lbl">款名</span><span class="val">${styleName}</span></div>` : ''}
          ${color ? `<div class="info-row"><span class="lbl">颜色</span><span class="val">${color}</span></div>` : ''}
          ${quantity !== '' ? `<div class="info-row"><span class="lbl">数量</span><span class="val">${quantity}</span></div>` : ''}
          <div class="info-row"><span class="lbl">类型</span><span class="val">样衣</span></div>
          <div class="info-row date-row">${dateStr}</div>
        </div>
      </div>
    </div>`;
  }).join('\n');

  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
@page { size: ${w}mm ${h}mm; margin: 0; }
* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: 'PingFang SC','Heiti SC',Arial,sans-serif; }
.page { width: ${w}mm; height: ${h}mm; display: flex; align-items: center; justify-content: center; page-break-after: always; }
.page:last-child { page-break-after: auto; }
.label { width: calc(${w}mm - 3mm); height: calc(${h}mm - 3mm); border: 0.8pt solid #333; display: flex; flex-direction: row; align-items: stretch; padding: 1.5mm 2.5mm 1.5mm 2.5mm; gap: 1.5mm; }
.qr-col { flex: 0 0 ${qrMm + 1}mm; display: flex; align-items: center; justify-content: center; }
.qr-col img { display: block; object-fit: contain; }
.info-col { flex: 1; display: flex; flex-direction: column; justify-content: center; min-width: 0; overflow: hidden; padding: 0 0 0 0.5mm; }
.ucode-row { font-size: ${fs + 0.9}pt; font-weight: bold; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; padding-bottom: 1mm; border-bottom: 0.8pt dashed #9a9a9a; margin-bottom: 1.1mm; }
.info-row { font-size: ${fs}pt; display: flex; align-items: baseline; flex-wrap: nowrap; min-width: 0; margin-bottom: 0.65mm; }
.lbl { color: #555; white-space: nowrap; }
.val { font-weight: 600; margin-left: 0.8mm; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; }
.date-row { color: #777; font-size: ${fs - 0.4}pt; margin-top: 2mm; padding-top: 0.4mm; }
</style></head><body>${labelsHtml}</body></html>`;

  const iframe = document.createElement('iframe');
  iframe.style.cssText = 'position:fixed;left:-9999px;top:-9999px;width:0;height:0;border:none;';
  document.body.appendChild(iframe);
  const doc = iframe.contentWindow?.document;
  if (doc) {
    doc.open(); doc.write(html); doc.close();
    const imgs = doc.querySelectorAll('img');
    await new Promise<void>(resolve => {
      const imgTotal = imgs.length;
      const doPrint = () => {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
        setTimeout(() => { try { document.body.removeChild(iframe); } catch { /**/ } }, 1000);
        resolve();
      };
      if (imgTotal === 0) { setTimeout(doPrint, 100); return; }
      let loaded = 0;
      const onDone = () => { loaded++; if (loaded >= imgTotal) doPrint(); };
      imgs.forEach(img => {
        if ((img as HTMLImageElement).complete) onDone();
        else { img.onload = onDone; img.onerror = onDone; }
      });
      setTimeout(() => { if (loaded < imgTotal) doPrint(); }, 5000);
    });
  }
}

export default function SampleLabelPrintModal({ open, onClose, record }: SampleLabelPrintModalProps) {
  const { message } = App.useApp();
  const [labelSize, setLabelSize] = useState<LabelSize>('40x70');
  const [printCount, setPrintCount] = useState<number>(1);
  const [printing, setPrinting] = useState(false);

  const handlePrint = useCallback(async () => {
    if (!record) return;
    setPrinting(true);
    try {
      const [w, h] = SIZE_MAP[labelSize];
      await printSampleLabels(record, printCount, w, h);
      message.success('标签已发送到打印机');
    } catch {
      message.error('打印失败，请重试');
    } finally {
      setPrinting(false);
    }
  }, [record, labelSize, printCount, message]);

  return (
    <ResizableModal
      title="样衣标签打印"
      open={open}
      onCancel={onClose}
      footer={null}
      width="30vw"
      destroyOnClose
    >
      <div style={{ padding: '16px 0' }}>
        <div style={{ marginBottom: 20 }}>
          <div style={{ marginBottom: 8, fontWeight: 500 }}>标签尺寸</div>
          <Radio.Group value={labelSize} onChange={e => setLabelSize(e.target.value)}>
            <Radio.Button value="40x70">4 × 7 cm</Radio.Button>
            <Radio.Button value="50x100">5 × 10 cm</Radio.Button>
          </Radio.Group>
        </div>

        <div style={{ marginBottom: 20 }}>
          <div style={{ marginBottom: 8, fontWeight: 500 }}>打印数量</div>
          <InputNumber
            min={1}
            max={200}
            value={printCount}
            onChange={v => setPrintCount(v ?? 1)}
            style={{ width: 120 }}
          />
          <span style={{ marginLeft: 8, color: '#888' }}>张</span>
        </div>

        {record && (
          <div style={{ marginBottom: 20, padding: 12, background: '#f8f9fa', borderRadius: 6 }}>
            <div style={{ fontSize: 13, marginBottom: 4 }}>
              <span style={{ color: '#888' }}>款号：</span>
              <strong>{record.styleNo}</strong>
            </div>
            {record.styleName && (
              <div style={{ fontSize: 13, marginBottom: 4 }}>
                <span style={{ color: '#888' }}>款名：</span>{record.styleName}
              </div>
            )}
            {record.color && (
              <div style={{ fontSize: 13, marginBottom: 4 }}>
                <span style={{ color: '#888' }}>颜色：</span>{record.color}
              </div>
            )}
            {record.sampleQuantity != null && (
              <div style={{ fontSize: 13 }}>
                <span style={{ color: '#888' }}>数量：</span>{record.sampleQuantity}
              </div>
            )}
          </div>
        )}

        <Space>
          <Button
            type="primary"
            icon={<PrinterOutlined />}
            onClick={handlePrint}
            loading={printing}
            disabled={!record}
          >
            打印标签
          </Button>
          <Button onClick={onClose}>关闭</Button>
        </Space>
      </div>
    </ResizableModal>
  );
}
