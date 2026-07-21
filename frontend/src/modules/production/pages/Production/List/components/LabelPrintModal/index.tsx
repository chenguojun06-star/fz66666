import { Tabs } from 'antd';
import ResizableModal from '@/components/common/ResizableModal';
import type { LabelPrintModalProps } from './types';
import { useLabelPrintData } from './useLabelPrintData';
import WashLabelTab from './WashLabelTab';
import UCodeLabelTab from './UCodeLabelTab';

export type { LabelStyleInfo } from './types';

export default function LabelPrintModal({ open, onClose, order, styleInfo }: LabelPrintModalProps) {
  const {
    washW, setWashW, washH, setWashH,
    uCodeSize, setUCodeSize, suitPart, setSuitPart,
    compositionText, washInstructionsText, careIconCodes, defaultDateText,
    handleWashPrint, handleUCodePrint,
  } = useLabelPrintData({ open, order, styleInfo });

  return (
    <ResizableModal
      title={`打印标签 — ${order?.orderNo ?? ''}`}
      open={open}
      onCancel={onClose}
      width="85vw"
      footer={null}
      destroyOnHidden
    >
      <Tabs
        defaultActiveKey="wash"
        items={[
          {
            key: 'wash', label: '打印洗水唛',
            children: (
              <WashLabelTab
                open={open} order={order} styleInfo={styleInfo}
                washW={washW} setWashW={setWashW}
                washH={washH} setWashH={setWashH}
                suitPart={suitPart} setSuitPart={setSuitPart}
                compositionText={compositionText}
                washInstructionsText={washInstructionsText}
                careIconCodes={careIconCodes}
                defaultDateText={defaultDateText}
                onClose={onClose}
                onPrint={handleWashPrint}
              />
            ),
          },
          {
            key: 'ucode', label: '打印U编码',
            children: (
              <UCodeLabelTab
                open={open} order={order} styleInfo={styleInfo}
                uCodeSize={uCodeSize} setUCodeSize={setUCodeSize}
                onClose={onClose}
                onPrint={handleUCodePrint}
              />
            ),
          },
        ]}
      />
    </ResizableModal>
  );
}
