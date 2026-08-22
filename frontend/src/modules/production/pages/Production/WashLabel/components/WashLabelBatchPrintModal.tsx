import React, { useState } from 'react';
import { Button, Divider, InputNumber, Radio, Space, Tag } from 'antd';
import { PrinterOutlined } from '@ant-design/icons';
import ResizableModal from '@/components/common/ResizableModal';
import { safePrint } from '@/utils/safePrint';
import {
  buildWashLabelMultiPageHtml,
  compositionFromSections,
  washTextFromInstructions,
} from '@/utils/washLabelPrintTemplate';
import { parseCareIconCodes } from '@/utils/careIcons';
import WashLabelSectionConfigPanel, {
  buildDefaultSections,
  type WashLabelSectionState,
} from '@/components/common/WashLabelSectionConfigPanel';

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
  const [sections, setSections] = useState<WashLabelSectionState>(() => buildDefaultSections({ topOffsetMm: 30 }));

  const first = items[0];
  const compositionText = first
    ? compositionFromSections(first.fabricCompositionParts, first.fabricComposition)
    : '';
  const washInstructionsText = first
    ? washTextFromInstructions(first.washInstructions, first.fabricCompositionParts)
    : '';
  const careIconCodeList = first ? parseCareIconCodes(first.careIconCodes) : [];

  // 以第一单的款式数据预填分区（批量同款场景），用户可自由改/关
  React.useEffect(() => {
    if (!open) return;
    setSections(buildDefaultSections({
      styleNoText: (first?.styleNo || '').trim(),
      compositionText,
      washText: washInstructionsText,
      careIconCodes: careIconCodeList,
      topOffsetMm: 30,
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, first?.orderNo, compositionText, washInstructionsText, careIconCodeList.length]);

  const handlePrint = async () => {
    if (!items.length) return;
    setPrintLoading(true);
    try {

    if (labelType === 'wash') {
      // 只打印用户输入的分区内容：关闭或清空的分区传空值（模板不渲染）
      const printDataList = items.map(() => ({
        width: washW,
        height: washH,
        sizeText: sections.showSize ? sections.sizeText : '',
        styleNo: sections.showStyleNo ? sections.styleNoText : '',
        compositionText: sections.showComposition ? sections.compositionText : '',
        washInstructionsText: sections.showWash ? sections.washText : '',
        careIconCodes: sections.showWash ? sections.careIconCodes : [],
        manufacturingText: sections.showManufacturing ? sections.manufacturingText : '',
        dateText: '',
        topOffsetMm: sections.topOffsetMm,
        fontScale: sections.fontScale,
        lineHeightScale: sections.lineHeightScale,
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
      const dateStr = `${new Date().getFullYear()}${String(new Date().getMonth() + 1).padStart(2, '0')}${String(new Date().getDate()).padStart(2, '0')}`;
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
body{font-family:"PingFang SC","Microsoft YaHei","Noto Sans SC",system-ui,sans-serif;color:var(--color-black);background:var(--color-bg-base);-webkit-font-smoothing:antialiased}
.label-page{position:relative;width:${w}mm;height:${h}mm;padding:2mm 2.2mm;page-break-after:always;display:flex;flex-direction:column;align-items:center;justify-content:center}
.label-page:last-child{page-break-after:auto}
.dash-sep{border:none;border-top:0.8pt dashed var(--color-zinc-600);width:calc(100% + 6mm);margin-left:-3mm;flex:0 0 auto}
.content-area{flex:1 1 0;overflow:hidden;min-height:0;width:100%;text-align:center;padding-top:2mm}
.sub{font-size:${fs}pt;color:var(--color-zinc-600);text-align:center}
.hr{border:none;border-top:0.3pt solid var(--color-text-quaternary);margin:1.2mm 0}
.ucode-val{font-size:${w >= 45 ? 9 : 7.5}pt;font-weight:700;text-align:center;letter-spacing:0.5mm;margin:1.5mm 0;word-break:break-all}
.qr{text-align:center;margin:1mm 0}
.small{font-size:${fs - 0.5}pt;color:var(--color-text-muted);text-align:center}
.date{margin-top:1mm;font-size:${fs - 0.5}pt;color:var(--color-zinc-500);text-align:center;letter-spacing:0.2mm}
</style></head><body>${pages}</body></html>`;
      safePrint(html);
    }
    } finally { setPrintLoading(false); }
  };

  return (
    <ResizableModal
      open={open}
      title={<Space><PrinterOutlined />批量打印（{items.length} 件）</Space>}
      onCancel={onClose}
      width="52vw"
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

            {/* 分区配置：码数/款号/面料成份/洗涤方法（图标上文字下）/制造区域 + 距剪口偏移 + 实时预览 */}
            <WashLabelSectionConfigPanel
              value={sections}
              onChange={setSections}
              width={washW}
              height={washH}
            />
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
                  <Tag style={{ fontSize: 14, color: 'var(--color-text-muted)' }}>U: {it.uCode}</Tag>
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
