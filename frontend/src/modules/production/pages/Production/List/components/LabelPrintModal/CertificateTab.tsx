/**
 * D-221：合格证标签页签（大货 打印标签 第三个 tab）
 * - 左侧配置面板：标题/每行勾选显隐 + 左右两列文字自由编辑 + 条码开关与码值模板 + 实时预览
 * - 右侧 SKU 表：勾选行 × 打印数量，逐页出证（底部 CODE128 条码可扫码）
 */
import { useMemo } from 'react';
import { Checkbox, Input, InputNumber, Radio, Space } from 'antd';
import type { ProductionOrder } from '@/types/production';
import SkuTable from './SkuTable';
import type { CertificateSectionState, LabelStyleInfo, SkuRow } from './types';
import { buildCertificatePreviewHtml } from '@/utils/certificateLabelPrintTemplate';

export interface CertificateTabProps {
  open: boolean;
  order: ProductionOrder | null;
  styleInfo: LabelStyleInfo | null;
  certW: number;
  setCertW: (v: number | null) => void;
  certH: number;
  setCertH: (v: number | null) => void;
  certSections: CertificateSectionState;
  setCertSections: (v: CertificateSectionState) => void;
  onClose: () => void;
  onPrint: (selected: SkuRow[], ord: ProductionOrder) => Promise<void>;
}

export default function CertificateTab({
  open, order,
  certW, setCertW, certH, setCertH,
  certSections, setCertSections,
  onClose, onPrint,
}: CertificateTabProps) {
  const w = certW;
  const h = certH;

  const previewHtml = useMemo(() => {
    try {
      return buildCertificatePreviewHtml(w, h, certSections, {
        styleNo: order?.styleNo || '',
        color: order?.color || '示例色',
        size: order?.size || 'M(165/80A)',
        seq: 1,
      });
    } catch {
      return '';
    }
  }, [w, h, certSections, order?.styleNo, order?.color, order?.size]);

  const updateRow = (key: string, patch: Partial<CertificateSectionState['rows'][number]>) => {
    setCertSections({
      ...certSections,
      rows: certSections.rows.map((r) => (r.key === key ? { ...r, ...patch } : r)),
    });
  };

  return (
    <>
      <div style={{ marginBottom: 12, display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <Space wrap align="center">
          <Radio.Group
            value={w <= h ? 'portrait' : 'landscape'}
            onChange={e => {
              if (e.target.value === 'portrait') { setCertW(70); setCertH(100); }
              else { setCertW(100); setCertH(70); }
            }}
            size="small"
          >
            <Radio.Button value="portrait">竖版</Radio.Button>
            <Radio.Button value="landscape">横版</Radio.Button>
          </Radio.Group>
          <span style={{ color: 'var(--color-text-secondary)', fontSize: 14 }}>宽</span>
          <InputNumber min={20} max={200} value={certW} onChange={v => setCertW(v)} suffix="mm" style={{ width: 100 }} />
          <span style={{ color: 'var(--color-text-secondary)', fontSize: 14 }}>高</span>
          <InputNumber min={30} max={400} value={certH} onChange={v => setCertH(v)} suffix="mm" style={{ width: 100 }} />
        </Space>
        <span style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>
          每行勾选才打印；左右文字均可编辑，规格/颜色可留空自动带；条码码值支持 {'{款号}'} {'{颜色}'} {'{码数}'} {'{序号}'}
        </span>
      </div>

      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', marginBottom: 16, flexWrap: 'wrap' }}>
        {/* 配置面板 */}
        <div style={{ flex: '1 1 420px', minWidth: 380 }}>
          <div style={{ marginBottom: 8, display: 'flex', gap: 8, alignItems: 'center' }}>
            <Checkbox
              checked={!!certSections.titleText}
              onChange={e => setCertSections({ ...certSections, titleText: e.target.checked ? (certSections.titleText || '合格证') : '' })}
            >
              标题
            </Checkbox>
            <Input
              size="small"
              style={{ width: 160 }}
              value={certSections.titleText}
              onChange={e => setCertSections({ ...certSections, titleText: e.target.value })}
              placeholder="合格证"
              maxLength={10}
            />
            <span style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginLeft: 8 }}>字号缩放</span>
            <InputNumber
              size="small" min={0.5} max={2} step={0.05}
              value={certSections.fontScale}
              onChange={v => setCertSections({ ...certSections, fontScale: Number(v) || 1 })}
              style={{ width: 76 }}
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {certSections.rows.map((row) => (
              <div key={row.key} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <Checkbox
                  checked={row.show}
                  onChange={e => updateRow(row.key, { show: e.target.checked })}
                />
                <Input
                  size="small"
                  value={row.labelText}
                  onChange={e => updateRow(row.key, { labelText: e.target.value })}
                  style={{ width: 96, flexShrink: 0 }}
                  maxLength={8}
                  placeholder="标签"
                />
                <Input
                  size="small"
                  value={row.valueText}
                  onChange={e => updateRow(row.key, { valueText: e.target.value, show: e.target.checked ? row.show : !!e.target.value.trim() })}
                  placeholder={row.key === 'guige' ? '留空自动带码数' : row.key === 'yanse' ? '留空自动带颜色' : '内容'}
                  maxLength={60}
                />
              </div>
            ))}
          </div>

          <div style={{ marginTop: 10, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <Checkbox
              checked={certSections.showBarcode}
              onChange={e => setCertSections({ ...certSections, showBarcode: e.target.checked })}
            >
              条形码（CODE128 可扫码）
            </Checkbox>
            <Input
              size="small"
              value={certSections.barcodeTemplate}
              onChange={e => setCertSections({ ...certSections, barcodeTemplate: e.target.value })}
              style={{ width: 240 }}
              placeholder="{'{款号}{颜色}{码数}'}"
              maxLength={40}
            />
            <Checkbox
              checked={certSections.showBarcodeText !== false}
              onChange={e => setCertSections({ ...certSections, showBarcodeText: e.target.checked })}
            >
              条码下方显示商品编码（自动带）
            </Checkbox>
          </div>
        </div>

        {/* 实时预览 */}
        <div style={{ flexShrink: 0 }}>
          <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)', marginBottom: 4 }}>预览（首件效果）</div>
          <iframe
            title="合格证预览"
            srcDoc={previewHtml}
            style={{
              width: Math.round(w * 3.6),
              height: Math.round(h * 3.6),
              border: '1px solid var(--color-border)',
              borderRadius: 6,
              background: '#fff',
            }}
          />
        </div>
      </div>

      <SkuTable
        open={open} order={order}
        styleInfo={null}
        printColLabel="合格证打印数"
        onPrint={(sel, ord) => onPrint(sel, ord)}
        onClose={onClose}
      />
    </>
  );
}
