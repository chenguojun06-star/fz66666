import React, { useState } from 'react';
import { Alert, Button, Divider, InputNumber, Radio, Space, Tag, Typography } from 'antd';
import { PrinterOutlined } from '@ant-design/icons';
import ResizableModal from '@/components/common/ResizableModal';
import { safePrint } from '@/utils/safePrint';
import { CARE_ICONS, parseCareIconCodes } from '@/utils/careIcons';
import {
  buildWashLabelMultiPageHtml,
  getDefaultDateText,
  compositionFromSections,
  washTextFromInstructions,
  type WashLabelPrintData,
} from '@/utils/washLabelPrintTemplate';

export interface WashLabelItem {
  orderNo: string;
  styleNo?: string;
  styleName?: string;
  color?: string;
  size?: string;
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

type UCodeSize = '40x70' | '50x100';
type LabelType = 'wash' | 'ucode';

interface Props {
  open: boolean;
  onClose: () => void;
  items: WashLabelItem[];
  loading?: boolean;
}

const UCODE_SIZES: Record<UCodeSize, { w: number; h: number; label: string }> = {
  '40x70': { w: 40, h: 70, label: '4×7cm' },
  '50x100': { w: 50, h: 100, label: '5×10cm' },
};

const WashLabelBatchPrintModal: React.FC<Props> = ({ open, onClose, items, loading }) => {
  const [washW, setWashW] = useState<number>(30);
  const [washH, setWashH] = useState<number>(80);
  const [uCodeSize, setUCodeSize] = useState<UCodeSize>('40x70');
  const [labelType, setLabelType] = useState<LabelType>('wash');
  const [printLoading, setPrintLoading] = useState(false);

  const first = items[0];
  const compositionText = first
    ? compositionFromSections(first.fabricCompositionParts, first.fabricComposition)
    : '';
  const washInstructionsText = first
    ? washTextFromInstructions(first.washInstructions, first.fabricCompositionParts)
    : '';
  const resolvedCareIconCodes = first ? parseCareIconCodes(first.careIconCodes) : [];

  const handlePrint = async () => {
    if (!items.length) return;
    setPrintLoading(true);
    try {

    if (labelType === 'wash') {
      const printDataList: WashLabelPrintData[] = items.map(() => ({
        width: washW,
        height: washH,
        compositionText: compositionFromSections(first.fabricCompositionParts, first.fabricComposition),
        washInstructionsText: washTextFromInstructions(first.washInstructions, first.fabricCompositionParts),
        careIconCodes: parseCareIconCodes(first.careIconCodes),
        manufacturingText: 'MADE IN CHINA',
        dateText: getDefaultDateText(),
      }));
      const html = buildWashLabelMultiPageHtml(printDataList);
      safePrint(html);
    } else {
      const w = UCODE_SIZES[uCodeSize].w;
      const h = UCODE_SIZES[uCodeSize].h;
      const QRCode = await import('qrcode');
      const qrMap: Record<string, string> = {};
      await Promise.all(
        items.filter(it => it.uCode).map(async (it) => {
          try { qrMap[it.orderNo] = await QRCode.toDataURL(it.uCode!, { width: 180, margin: 1 }); }
          catch { /* ignore */ }
        })
      );
      const dateStr = getDefaultDateText();
      const fs = w >= 48 ? 6.5 : 5.5;
      const qrSize = Math.min(w - 8, 32);
      const pages = items.map(item => {
        const subLine = `款号：${item.styleNo || '-'}${item.color ? '&nbsp;&nbsp;颜色：' + item.color : ''}${item.size ? '&nbsp;&nbsp;码：' + item.size : ''}`;
        const qrHtml = qrMap[item.orderNo] ? `<div class="qr"><img src="${qrMap[item.orderNo]}" width="${qrSize}mm" height="${qrSize}mm"/></div>` : '';
        return `<div class="label-page">
  <div class="dash-sep"></div>
  <div class="content-area">
    <div class="sub">${subLine}</div>
    <div class="hr"></div>
    <div class="ucode-val">${item.uCode || '（U码未填写）'}</div>
    ${qrHtml}
    <div class="hr"></div>
    <div class="small">${item.orderNo}</div>
    <div class="date">${dateStr}</div>
  </div>
  <div class="dash-sep"></div>
</div>`;
      }).join('\n');

      const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
@page{size:${w}mm ${h}mm;margin:0}
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:${w}mm;min-height:${h}mm}
body{font-family:"PingFang SC","Microsoft YaHei","Noto Sans SC",system-ui,sans-serif;color:#000;background:var(--color-bg-base);-webkit-font-smoothing:antialiased}
.label-page{position:relative;width:${w}mm;height:${h}mm;padding:2mm 2.2mm;page-break-after:always;display:flex;flex-direction:column;align-items:center;justify-content:center}
.label-page:last-child{page-break-after:auto}
.dash-sep{border:none;border-top:0.8pt dashed #555;width:calc(100% + 6mm);margin-left:-3mm;flex:0 0 auto}
.content-area{flex:1 1 0;overflow:hidden;min-height:0;width:100%;text-align:center;padding-top:2mm}
.sub{font-size:${fs}pt;color:#555;text-align:center}
.hr{border:none;border-top:0.3pt solid #bbb;margin:1.2mm 0}
.ucode-val{font-size:${w >= 45 ? 9 : 7.5}pt;font-weight:700;text-align:center;letter-spacing:0.5mm;margin:1.5mm 0;word-break:break-all}
.qr{text-align:center;margin:1mm 0}
.small{font-size:${fs - 0.5}pt;color:#888;text-align:center}
.date{margin-top:1mm;font-size:${fs - 0.5}pt;color:#777;text-align:center;letter-spacing:0.2mm}
</style></head><body>${pages}</body></html>`;
      safePrint(html);
    }
    } finally { setPrintLoading(false); }
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
            loading={printLoading}
            disabled={!items.length || loading}
          >
            打印 {items.length} 张{labelType === 'ucode' ? '（U码）' : '（洗水唛）'}
          </Button>
        </Space>
      }
    >
      <Space orientation="vertical" style={{ width: '100%' }} size="middle">
        <div>
          <div style={{ marginBottom: 8, fontWeight: 500 }}>打印类型</div>
          <Radio.Group value={labelType} onChange={e => setLabelType(e.target.value as LabelType)} size="small">
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

        {labelType === 'wash' && (
          <>
            <div>
              <div style={{ marginBottom: 8, fontWeight: 500 }}>纸张规格（自定义）</div>
              <Space wrap>
                <span style={{ color: 'var(--color-text-secondary)' }}>宽</span>
                <InputNumber min={20} max={200} value={washW} onChange={v => setWashW(v ?? 30)} suffix="mm" style={{ width: 110 }} />
                <span style={{ color: 'var(--color-text-secondary)' }}>高</span>
                <InputNumber min={30} max={400} value={washH} onChange={v => setWashH(v ?? 80)} suffix="mm" style={{ width: 110 }} />
              </Space>
            </div>

            <div style={{ marginBottom: 4 }}>
              <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 4 }}>① 面料成分</div>
              <Typography.Text style={{ fontSize: 14, whiteSpace: 'pre-wrap' }}>
                {compositionText || '（未填写）'}
              </Typography.Text>
            </div>
            <div style={{ marginBottom: 4 }}>
              <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 4 }}>② 洗涤说明</div>
              <Typography.Text style={{ fontSize: 14, whiteSpace: 'pre-wrap' }}>
                {washInstructionsText || '（未填写）'}
              </Typography.Text>
            </div>
            <div style={{ marginBottom: 4 }}>
              <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 4 }}>③ 护理图标</div>
              {resolvedCareIconCodes.length > 0 ? (
                <Space wrap size={4}>
                  {resolvedCareIconCodes.map(code => {
                    const icon = CARE_ICONS[code];
                    return (
                      <div key={code} style={{
                        display: 'inline-flex', alignItems: 'center', gap: 2,
                        padding: '1px 5px', borderRadius: 3,
                        border: '1px solid var(--color-border-antd)', background: 'var(--color-bg-base)',
                      }}>
                        <span dangerouslySetInnerHTML={{ __html: icon?.svg || '' }} style={{ display: 'inline-block', width: 16, height: 16, flexShrink: 0 }} />
                        <span style={{ fontSize: 11, color: 'var(--color-text-secondary)', whiteSpace: 'nowrap' }}>{icon?.label || code}</span>
                      </div>
                    );
                  })}
                </Space>
              ) : (
                <Typography.Text type="secondary" style={{ fontSize: 14 }}>（未选择）</Typography.Text>
              )}
            </div>
            <div style={{ marginBottom: 4 }}>
              <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 4 }}>④ 生产制造</div>
              <Typography.Text style={{ fontSize: 14 }}>MADE IN CHINA</Typography.Text>
              <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)', marginTop: 2 }}>日期自动生成：{getDefaultDateText()}</div>
            </div>
          </>
        )}

        {labelType === 'ucode' && (
          <div>
            <div style={{ marginBottom: 8, fontWeight: 500 }}>U码规格</div>
            <Radio.Group value={uCodeSize} onChange={e => setUCodeSize(e.target.value as UCodeSize)} size="small">
              {(Object.entries(UCODE_SIZES) as [UCodeSize, { label: string }][]).map(([k, v]) => (
                <Radio.Button key={k} value={k}>{v.label}</Radio.Button>
              ))}
            </Radio.Group>
          </div>
        )}

        <Divider style={{ margin: '4px 0' }} />

        <div>
          <div style={{ marginBottom: 6, fontWeight: 500, fontSize: 14 }}>待打印订单（{items.length} 条）</div>
          <div style={{ maxHeight: 200, overflowY: 'auto' }}>
            {items.map(it => (
              <div key={it.orderNo} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '4px 0', borderBottom: '1px solid var(--color-border-light)' }}>
                <Tag color="blue" style={{ minWidth: 100, textAlign: 'center' }}>{it.orderNo}</Tag>
                <span style={{ fontSize: 14, color: 'var(--color-text-secondary)' }}>
                  {it.styleNo}{it.color ? ' / ' + it.color : ''}{it.size ? ' / ' + it.size : ''}
                </span>
                {labelType === 'ucode' && it.uCode && (
                  <Tag style={{ fontSize: 14, color: '#888' }}>U: {it.uCode}</Tag>
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
