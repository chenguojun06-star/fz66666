import { InputNumber, Space } from 'antd';
import WashLabelSectionConfigPanel, { type WashLabelSectionState } from '@/components/common/WashLabelSectionConfigPanel';
import type { LabelStyleInfo, SkuRow } from './types';
import type { ProductionOrder } from '@/types/production';
import SkuTable from './SkuTable';

export interface WashLabelTabProps {
  open: boolean;
  order: ProductionOrder | null;
  styleInfo: LabelStyleInfo | null;
  washW: number;
  setWashW: (v: number | null) => void;
  washH: number;
  setWashH: (v: number | null) => void;
  sections: WashLabelSectionState;
  setSections: (v: WashLabelSectionState) => void;
  onClose: () => void;
  onPrint: (selected: SkuRow[], ord: ProductionOrder, si: LabelStyleInfo | null) => Promise<void>;
}

export default function WashLabelTab({
  open, order, styleInfo,
  washW, setWashW, washH, setWashH,
  sections, setSections,
  onClose, onPrint,
}: WashLabelTabProps) {
  return (
    <>
      <div style={{ marginBottom: 12 }}>
        <Space wrap align="center">
          <span style={{ color: 'var(--color-text-secondary)', fontSize: 14 }}>纸张宽</span>
          <InputNumber
            min={20} max={200} value={washW}
            onChange={v => setWashW(v)}
            suffix="mm" style={{ width: 110 }}
          />
          <span style={{ color: 'var(--color-text-secondary)', fontSize: 14 }}>高</span>
          <InputNumber
            min={30} max={400} value={washH}
            onChange={v => setWashH(v)}
            suffix="mm" style={{ width: 110 }}
          />
        </Space>
        <div style={{ fontSize: 14, color: 'var(--color-text-tertiary)', marginTop: 4 }}>
          分区内容可自由开关与编辑；只打印你输入的内容，标准字体无加粗
        </div>
      </div>

      {/* 分区配置：码数/款号/面料成份/洗涤方法（图标上文字下）/制造区域 + 距剪口偏移 + 实时预览 */}
      <div style={{ marginBottom: 16 }}>
        <WashLabelSectionConfigPanel
          value={sections}
          onChange={setSections}
          width={washW}
          height={washH}
        />
      </div>

      <SkuTable
        open={open} order={order} styleInfo={styleInfo}
        printColLabel="洗水唛打印数"
        onPrint={onPrint}
        onClose={onClose}
      />
    </>
  );
}
