import { Radio } from 'antd';
import type { LabelStyleInfo, SkuRow } from './types';
import type { ProductionOrder } from '@/types/production';
import type { UCodeSize } from './useLabelPrintData';
import SkuTable from './SkuTable';

export interface UCodeLabelTabProps {
  open: boolean;
  order: ProductionOrder | null;
  styleInfo: LabelStyleInfo | null;
  uCodeSize: UCodeSize;
  setUCodeSize: (v: UCodeSize) => void;
  onClose: () => void;
  onPrint: (selected: SkuRow[], ord: ProductionOrder) => Promise<void>;
}

export default function UCodeLabelTab({
  open, order, styleInfo,
  uCodeSize, setUCodeSize,
  onClose, onPrint,
}: UCodeLabelTabProps) {
  return (
    <>
      <div style={{ marginBottom: 12 }}>
        <Radio.Group
          value={uCodeSize}
          onChange={e => setUCodeSize(e.target.value as '40x70' | '50x100')}
          size="small"
        >
          <Radio.Button value="40x70">4×7cm</Radio.Button>
          <Radio.Button value="50x100">5×10cm</Radio.Button>
        </Radio.Group>
      </div>
      <SkuTable
        open={open} order={order} styleInfo={styleInfo}
        printColLabel="打印数量"
        onPrint={(sel, ord) => onPrint(sel, ord)}
        onClose={onClose}
      />
    </>
  );
}
