import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { Button, InputNumber, Space, Alert, Radio, Spin } from 'antd';
import { PrinterOutlined, QrcodeOutlined } from '@ant-design/icons';
import QRCode from 'qrcode';
import ResizableModal from '@/components/common/ResizableModal';
import { safePrint } from '@/utils/safePrint';

interface LocationItem {
  id: string;
  locationCode: string;
  locationName: string;
  zoneName: string;
  zoneCode: string;
  warehouseType: string;
  areaId: string;
  capacity: number;
  usedCapacity: number;
  status: string;
}

interface Props {
  open: boolean;
  locations: LocationItem[];
  areaName: string;
  onClose: () => void;
}

const PRESET_SIZES = [
  { label: '50×30mm', width: 50, height: 30 },
  { label: '80×50mm', width: 80, height: 50 },
  { label: '100×70mm', width: 100, height: 70 },
];

// A4 有效打印区域（考虑边距）
const A4_WIDTH = 190;
const A4_HEIGHT = 277;

const LocationLabelPrintModal: React.FC<Props> = ({
  open,
  locations,
  areaName,
  onClose,
}) => {
  const [width, setWidth] = useState(50);
  const [height, setHeight] = useState(30);
  const [loading, setLoading] = useState(false);
  const [previewQrUrl, setPreviewQrUrl] = useState<string>('');

  // 生成预览二维码
  useEffect(() => {
    if (open && locations.length > 0) {
      const firstLoc = locations[0];
      const qrContent = `LOC:${firstLoc.locationCode}`;
      const qrPx = 120;
      QRCode.toDataURL(qrContent, {
        width: qrPx,
        margin: 0,
        errorCorrectionLevel: 'M',
      })
        .then((url) => setPreviewQrUrl(url))
        .catch(() => setPreviewQrUrl(''));
    } else {
      setPreviewQrUrl('');
    }
  }, [open, locations]);

  const layout = useMemo(() => {
    const cols = Math.max(1, Math.floor(A4_WIDTH / width));
    const rows = Math.max(1, Math.floor(A4_HEIGHT / height));
    const perPage = cols * rows;
    const totalPages = Math.max(1, Math.ceil(locations.length / perPage));
    return { cols, rows, perPage, totalPages };
  }, [width, height, locations.length]);

  const handlePrint = useCallback(async () => {
    if (locations.length === 0) return;
    setLoading(true);

    try {
      // 生成二维码
      const qrMm = Math.min(width, height) * 0.35;
      const qrPx = Math.round(qrMm * 10); // 转换为像素（假设 10px/mm）

      const qrUrls: string[] = [];
      for (const loc of locations) {
        const qrContent = `LOC:${loc.locationCode}`;
        const url = await QRCode.toDataURL(qrContent, {
          width: qrPx,
          margin: 0,
          errorCorrectionLevel: 'M',
        });
        qrUrls.push(url);
      }

      // 构建打印 HTML
      const html = buildPrintHtml(locations, qrUrls, areaName, width, height, layout);
      safePrint(html);
    } catch (err) {
      console.error('[LocationLabelPrint] 打印失败:', err);
    } finally {
      setLoading(false);
    }
  }, [locations, areaName, width, height, layout]);

  return (
    <ResizableModal
      title="打印库位贴"
      open={open}
      onCancel={onClose}
      width="40vw"
      footer={[
        <Button key="close" onClick={onClose}>
          关闭
        </Button>,
        <Button
          key="print"
          type="primary"
          icon={<PrinterOutlined />}
          loading={loading}
          disabled={locations.length === 0}
          onClick={() => void handlePrint()}
        >
          确认打印
        </Button>,
      ]}
    >
      <div style={{ padding: '16px 0' }}>
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontWeight: 500, marginBottom: 8 }}>标签尺寸</div>
          <Space wrap align="center">
            <span style={{ color: 'var(--color-text-secondary)' }}>宽度</span>
            <InputNumber
              min={20}
              max={200}
              value={width}
              onChange={(v) => setWidth(v ?? 50)}
              suffix="mm"
              style={{ width: 100 }}
            />
            <span style={{ color: 'var(--color-text-secondary)' }}>高度</span>
            <InputNumber
              min={20}
              max={200}
              value={height}
              onChange={(v) => setHeight(v ?? 30)}
              suffix="mm"
              style={{ width: 100 }}
            />
          </Space>
          <div style={{ marginTop: 8 }}>
            <Radio.Group
              value={`${width}x${height}`}
              onChange={(e) => {
                const preset = PRESET_SIZES.find((p) => `${p.width}x${p.height}` === e.target.value);
                if (preset) {
                  setWidth(preset.width);
                  setHeight(preset.height);
                }
              }}
              size="small"
            >
              {PRESET_SIZES.map((p) => (
                <Radio.Button key={`${p.width}x${p.height}`} value={`${p.width}x${p.height}`}>
                  {p.label}
                </Radio.Button>
              ))}
            </Radio.Group>
          </div>
        </div>

        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
          message={
            <span>
              已选择 <strong>{locations.length}</strong> 个库位，
              每页可放 <strong>{layout.perPage}</strong> 张标签，
              共需 <strong>{layout.totalPages}</strong> 页
            </span>
          }
        />

        <div style={{ border: '1px solid var(--color-border)', borderRadius: 8, padding: 16, background: 'var(--color-bg-subtle)' }}>
          <div style={{ fontWeight: 500, marginBottom: 8 }}>预览效果</div>
          <div
            style={{
              width: `${width * 2}px`,
              minHeight: `${height * 2}px`,
              border: '1px solid #333',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '4px',
              background: 'var(--color-bg-base)',
              gap: 2,
            }}
          >
            <div style={{ fontSize: 10, fontWeight: 600 }}>{areaName}</div>
            <div style={{ fontSize: 9, color: '#666' }}>{locations[0]?.zoneName || '-'}</div>
            <div style={{ fontSize: 14, fontWeight: 700 }}>{locations[0]?.locationCode || '-'}</div>
            {previewQrUrl ? (
              <img src={previewQrUrl} alt="QR预览" style={{ width: 36, height: 36 }} />
            ) : (
              <Spin size="small">
                <div style={{ width: 36, height: 36, background: '#f0f0f0', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 8 }}>
                  <QrcodeOutlined />
                </div>
              </Spin>
            )}
          </div>
        </div>
      </div>
    </ResizableModal>
  );
};

function buildPrintHtml(
  locations: LocationItem[],
  qrUrls: string[],
  areaName: string,
  width: number,
  height: number,
  layout: { cols: number; rows: number; perPage: number; totalPages: number },
): string {
  const qrMm = Math.min(width, height) * 0.35;
  const fontSize = height >= 50 ? 12 : height >= 30 ? 10 : 8;

  // 按页面分组标签
  const pages: string[] = [];
  for (let pageIdx = 0; pageIdx < layout.totalPages; pageIdx++) {
    const start = pageIdx * layout.perPage;
    const end = Math.min(start + layout.perPage, locations.length);
    const pageLocations = locations.slice(start, end);

    const labelsHtml = pageLocations.map((loc, idx) => {
      const qrUrl = qrUrls[start + idx];
      return `
        <div class="label" style="width:${width}mm;height:${height}mm;">
          <div class="label-content">
            <div class="warehouse-name">${areaName}</div>
            <div class="zone-name">${loc.zoneName || '-'}</div>
            <div class="location-code">${loc.locationCode}</div>
            <div class="qr-container">
              <img src="${qrUrl}" style="width:${qrMm}mm;height:${qrMm}mm;" />
            </div>
          </div>
        </div>
      `;
    }).join('\n');

    pages.push(`
      <div class="page">
        ${labelsHtml}
      </div>
    `);
  }

  return `
    <!DOCTYPE html>
    <html lang="zh-CN">
    <head>
      <meta charset="UTF-8">
      <title>库位贴打印</title>
      <style>
        @page { size: A4; margin: 10mm; }
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: "PingFang SC", "Microsoft YaHei", "Noto Sans SC", system-ui, sans-serif; color: #000; background: #fff; }
        .page { width: 190mm; height: 277mm; display: grid; grid-template-columns: repeat(${layout.cols}, ${width}mm); grid-template-rows: repeat(${layout.rows}, ${height}mm); gap: 0; page-break-after: always; }
        .page:last-child { page-break-after: auto; }
        .label { border: 0.5pt solid #333; display: flex; align-items: center; justify-content: center; padding: 1mm; }
        .label-content { display: flex; flex-direction: column; align-items: center; justify-content: center; width: 100%; height: 100%; }
        .warehouse-name { font-size: ${fontSize - 2}pt; color: #666; margin-bottom: 0.5mm; }
        .zone-name { font-size: ${fontSize - 1}pt; color: #888; margin-bottom: 0.5mm; }
        .location-code { font-size: ${fontSize + 2}pt; font-weight: 700; margin-bottom: 1mm; }
        .qr-container { display: flex; align-items: center; justify-content: center; }
        @media print { body { background: #fff; } }
      </style>
    </head>
    <body>
      ${pages.join('\n')}
    </body>
    </html>
  `;
}

export default LocationLabelPrintModal;