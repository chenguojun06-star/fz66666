import { useState, useEffect, useMemo } from 'react';
import { Alert, Button, Radio, Space, Spin, Typography } from 'antd';
import { PrinterOutlined } from '@ant-design/icons';
import ResizableModal from '@/components/common/ResizableModal';
import type { ProductionOrder } from '@/types/production';
import { getStyleInfoByRef } from '@/services/style/styleApi';
import { safePrint } from '@/utils/safePrint';
import { CARE_ICONS, parseCareIconCodes } from '@/utils/careIcons';
import {
  buildWashLabelPrintHtml,
  getDefaultDateText,
  compositionFromSections,
  washTextFromInstructions,
  type WashLabelPrintData,
} from '@/utils/washLabelPrintTemplate';

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
  washTempCode?: string;
  bleachCode?: string;
  tumbleDryCode?: string;
  ironCode?: string;
  dryCleanCode?: string;
  careIconCodes?: string;
}
interface Props { open: boolean; onCancel: () => void; order: ProductionOrder | null; }

export default function WashCareLabelModal({ open, onCancel, order }: Props) {
  const [loading, setLoading] = useState(false);
  const [styleData, setStyleData] = useState<StyleData>({});
  const [paperSize, setPaperSize] = useState<PaperSize>('30x80');
  const [printing, setPrinting] = useState(false);

  const styleId = (order as any)?.styleId as string | undefined;

  useEffect(() => {
    if (!open || !styleId) { setStyleData({}); return; }
    setLoading(true);
    getStyleInfoByRef(styleId, order?.styleNo)
      .then((styleInfo: any) => {
        const d = styleInfo ?? {};
        setStyleData({
          fabricComposition: d.fabricComposition,
          fabricCompositionParts: d.fabricCompositionParts,
          washInstructions: d.washInstructions,
          washTempCode: d.washTempCode,
          bleachCode: d.bleachCode,
          tumbleDryCode: d.tumbleDryCode,
          ironCode: d.ironCode,
          dryCleanCode: d.dryCleanCode,
          careIconCodes: d.careIconCodes,
        });
      })
      .catch((err) => { console.warn('[WashCare] 款式数据加载失败:', err?.message || err); setStyleData({}); })
      .finally(() => setLoading(false));
  }, [open, order?.styleNo, styleId]);

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

  const noInfo = !styleData.fabricComposition && !styleData.fabricCompositionParts && !styleData.washInstructions;
  const paper = PAPER_OPTS.find(p => p.value === paperSize)!;

  const handlePrint = () => {
    if (!order) return;
    setPrinting(true);
    const printData: WashLabelPrintData = {
      width: paper.w,
      height: paper.h,
      compositionText,
      washInstructionsText,
      careIconCodes: careIconCodeList,
      manufacturingText: 'MADE IN CHINA',
      dateText: getDefaultDateText(),
    };
    const html = buildWashLabelPrintHtml(printData);
    safePrint(html);
    setPrinting(false);
  };

  return (
    <ResizableModal title="打印洗水唛" open={open} onCancel={onCancel} width="40vw" footer={null} destroyOnHidden>
      <Spin spinning={loading}>
        {noInfo && !loading && (
          <Alert
            title="面料成分或洗涤说明未填写"
            description="请先在款式基本信息中完善面料成分和洗涤说明后再打印洗水唛"
            type="warning" showIcon style={{ marginBottom: 16 }}
          />
        )}

        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 8 }}>纸张规格</div>
          <Radio.Group value={paperSize} onChange={e => setPaperSize(e.target.value as PaperSize)}>
            {PAPER_OPTS.map(p => <Radio key={p.value} value={p.value}>{p.label}</Radio>)}
          </Radio.Group>
        </div>

        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 4 }}>① 面料成分</div>
          <Typography.Text style={{ fontSize: 14, whiteSpace: 'pre-wrap' }}>
            {compositionText || '（未填写）'}
          </Typography.Text>
        </div>

        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 4 }}>② 洗涤说明</div>
          <Typography.Text style={{ fontSize: 14, whiteSpace: 'pre-wrap' }}>
            {washInstructionsText || '（未填写）'}
          </Typography.Text>
        </div>

        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 4 }}>③ 护理图标</div>
          {careIconCodeList.length > 0 ? (
            <Space wrap size={4}>
              {careIconCodeList.map(code => {
                const icon = CARE_ICONS[code];
                return (
                  <div
                    key={code}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 3,
                      padding: '2px 6px', borderRadius: 4,
                      border: '1.5px solid var(--color-primary)',
                      background: '#e6f4ff',
                    }}
                  >
                    <span dangerouslySetInnerHTML={{ __html: icon?.svg || '' }} style={{ display: 'inline-block', width: 18, height: 18, flexShrink: 0 }} />
                    <span style={{ fontSize: 12, color: 'var(--color-primary)', whiteSpace: 'nowrap' }}>{icon?.label || code}</span>
                  </div>
                );
              })}
            </Space>
          ) : (
            <Typography.Text type="secondary" style={{ fontSize: 14 }}>（未选择）</Typography.Text>
          )}
        </div>

        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 4 }}>④ 生产制造</div>
          <Typography.Text style={{ fontSize: 14 }}>MADE IN CHINA</Typography.Text>
          <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)', marginTop: 2 }}>
            日期自动生成：{getDefaultDateText()}
          </div>
        </div>

        <div style={{ fontSize: 14, color: 'var(--color-text-tertiary)', marginBottom: 16 }}>
          提示：建议使用专用标签打印机，或A4纸打印后沿顶部虚线剪断。
        </div>
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
