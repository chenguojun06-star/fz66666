import { useState, useEffect, useMemo } from 'react';
import { Button, Radio, Spin } from 'antd';
import { PrinterOutlined } from '@ant-design/icons';
import ResizableModal from '@/components/common/ResizableModal';
import type { ProductionOrder } from '@/types/production';
import { getStyleInfoByRef } from '@/services/style/styleApi';
import { safePrint } from '@/utils/safePrint';
import { parseCareIconCodes } from '@/utils/careIcons';
import {
  buildWashLabelPrintHtml,
  compositionFromSections,
  washTextFromInstructions,
} from '@/utils/washLabelPrintTemplate';
import WashLabelSectionConfigPanel, {
  buildDefaultSections,
  type WashLabelSectionState,
} from '@/components/common/WashLabelSectionConfigPanel';

type PaperSize = '30x80' | '40x60' | '50x80' | '60x90';

const PAPER_OPTS: { value: PaperSize; label: string; w: number; h: number }[] = [
  { value: '30x80', label: '30×80mm（默认水唛）', w: 30, h: 80 },
  { value: '40x60', label: '40×60mm（小水唛）', w: 40, h: 60 },
  { value: '50x80', label: '50×80mm（标准水唛）', w: 50, h: 80 },
  { value: '60x90', label: '60×90mm（大水唛）', w: 60, h: 90 },
];

interface StyleData {
  fabricComposition?: string;
  fabricCompositionParts?: string;
  washInstructions?: string;
  careIconCodes?: string;
}
interface Props { open: boolean; onCancel: () => void; order: ProductionOrder | null; }

export default function WashCareLabelModal({ open, onCancel, order }: Props) {
  const [loading, setLoading] = useState(false);
  const [styleData, setStyleData] = useState<StyleData>({});
  const [paperSize, setPaperSize] = useState<PaperSize>('30x80');
  const [printing, setPrinting] = useState(false);
  const [sections, setSections] = useState<WashLabelSectionState>(() => buildDefaultSections({ topOffsetMm: 30 }));

  const styleId = (order as any)?.styleId as string | undefined;

  const compositionText = useMemo(
    () => compositionFromSections(styleData.fabricCompositionParts, styleData.fabricComposition),
    [styleData.fabricCompositionParts, styleData.fabricComposition],
  );

  const washInstructionsText = useMemo(
    () => washTextFromInstructions(styleData.washInstructions, styleData.fabricCompositionParts),
    [styleData.washInstructions, styleData.fabricCompositionParts],
  );

  const careIconCodeList = useMemo(
    () => parseCareIconCodes(styleData.careIconCodes),
    [styleData.careIconCodes],
  );

  // 弹窗打开时用款式数据预填分区（款号取订单款号），用户可自由改/关
  useEffect(() => {
    if (!open) { setStyleData({}); return; }
    setStyleData({});
    setLoading(true);
    getStyleInfoByRef(styleId, order?.styleNo)
      .then((styleInfo: any) => {
        const d = styleInfo ?? {};
        setStyleData({
          fabricComposition: d.fabricComposition,
          fabricCompositionParts: d.fabricCompositionParts,
          washInstructions: d.washInstructions,
          careIconCodes: d.careIconCodes,
        });
      })
      .catch((err) => { console.warn('[WashCare] 款式数据加载失败:', err?.message || err); setStyleData({}); })
      .finally(() => setLoading(false));
  }, [open, order?.styleNo, styleId]);

  useEffect(() => {
    if (!open) return;
    setSections(buildDefaultSections({
      styleNoText: (order?.styleNo || '').trim(),
      compositionText,
      washText: washInstructionsText,
      careIconCodes: careIconCodeList,
      topOffsetMm: 30,
    }));
  }, [open, order?.styleNo, compositionText, washInstructionsText, careIconCodeList]);

  const paper = PAPER_OPTS.find(p => p.value === paperSize)!;

  const handlePrint = () => {
    if (!order) return;
    setPrinting(true);
    // 只打印用户输入的分区内容：关闭或清空的分区传空值（模板不渲染）
    const html = buildWashLabelPrintHtml({
      width: paper.w,
      height: paper.h,
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
    });
    safePrint(html);
    setPrinting(false);
  };

  return (
    <ResizableModal title="打印洗水唛" open={open} onCancel={onCancel} width="46vw" footer={null} destroyOnHidden>
      <Spin spinning={loading}>
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 14, marginBottom: 8 }}>纸张规格</div>
          <Radio.Group value={paperSize} onChange={e => setPaperSize(e.target.value as PaperSize)}>
            {PAPER_OPTS.map(p => <Radio key={p.value} value={p.value}>{p.label}</Radio>)}
          </Radio.Group>
        </div>

        {/* 分区配置：码数/款号/面料成份/洗涤方法（图标上文字下）/制造区域 + 距剪口偏移 + 实时预览 */}
        <WashLabelSectionConfigPanel
          value={sections}
          onChange={setSections}
          width={paper.w}
          height={paper.h}
        />
      </Spin>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
        <Button onClick={onCancel}>取消</Button>
        <Button type="primary" icon={<PrinterOutlined />} loading={printing} onClick={handlePrint}>
          打印标签
        </Button>
      </div>
    </ResizableModal>
  );
}
