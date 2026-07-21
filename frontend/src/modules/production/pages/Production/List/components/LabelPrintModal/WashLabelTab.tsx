import { InputNumber, Radio, Space, Typography } from 'antd';
import { CARE_CATEGORIES, CARE_ICONS } from '@/utils/careIcons';
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
  suitPart: string;
  setSuitPart: (v: string) => void;
  compositionText: string;
  washInstructionsText: string;
  careIconCodes: string[];
  defaultDateText: string;
  onClose: () => void;
  onPrint: (selected: SkuRow[], ord: ProductionOrder, si: LabelStyleInfo | null) => Promise<void>;
}

export default function WashLabelTab({
  open, order, styleInfo,
  washW, setWashW, washH, setWashH,
  suitPart, setSuitPart,
  compositionText, washInstructionsText, careIconCodes, defaultDateText,
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
          {suitPart && (
            <>
              <span style={{ color: 'var(--color-text-secondary)', fontSize: 14, marginLeft: 4 }}>打印部位</span>
              <Radio.Group
                value={suitPart}
                onChange={e => setSuitPart(e.target.value as string)}
                size="small"
              >
                <Radio.Button value="all">全部</Radio.Button>
              </Radio.Group>
            </>
          )}
        </Space>
        <div style={{ fontSize: 14, color: 'var(--color-text-tertiary)', marginTop: 4 }}>
          上下虚线分割，内容距线 1.5cm；不含颜色/尺码，同款通用
        </div>
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
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {CARE_CATEGORIES.map(cat => {
            const selectedInCat = cat.codes.filter(code => careIconCodes.includes(code));
            if (selectedInCat.length === 0) return null;
            return (
              <div key={cat.key}>
                <div style={{ fontSize: 13, color: '#888', marginBottom: 3 }}>{cat.label}</div>
                <Space orientation="vertical" wrap size={4}>
                  {selectedInCat.map(code => {
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
              </div>
            );
          })}
        </div>
      </div>

      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 4 }}>④ 生产制造</div>
        <Typography.Text style={{ fontSize: 14, fontWeight: 600, letterSpacing: '0.8mm' }}>
          MADE IN CHINA
        </Typography.Text>
        <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)', marginTop: 2 }}>
          日期自动生成：{defaultDateText}
        </div>
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
