/**
 * D-134/D-136：工厂终审推送确认内容——加工费/扣补明细 + 抵扣清单勾选 + 金额联动
 * 独立成 .tsx 组件：useFactorySummaryData.ts 是 .ts 文件无法内联 JSX
 * 勾选逻辑：默认全部勾选；取消勾选的扣款不纳入本次抵扣（自动滚存下期）
 */
import { InputNumber } from 'antd';
import { useState } from 'react';

export interface DeductionCheckItem {
  id: string;
  deductionType?: string;
  description?: string;
  amount: number;
  isSupplement?: boolean;
  orderNo?: string;
  /** 上期结转（订单已结算支付，扣款未抵完滚存到本期） */
  carryOver?: boolean;
}

export interface FactorySettleConfirmContentProps {
  factoryName: string;
  orderCount: number;
  gross: number;
  items: DeductionCheckItem[];
  defaultAmount: number;
  onAmountChange: (v: number) => void;
  onCheckedChange: (ids: string[]) => void;
}

const typeLabel: Record<string, string> = {
  QUALITY_DEFECT: '次品扣款',
  PRODUCT_SCRAP: '报废扣款',
  MATERIAL_PICKUP: '面料扣款',
  SUPPLEMENT: '补款',
  MANUAL: '手工扣款',
};

const FactorySettleConfirmContent: React.FC<FactorySettleConfirmContentProps> = ({
  factoryName, orderCount, gross, items, defaultAmount, onAmountChange, onCheckedChange,
}) => {
  const [checkedIds, setCheckedIds] = useState<string[]>(items.map(i => i.id));
  const [amount, setAmount] = useState<number>(defaultAmount);

  const recompute = (nextChecked: string[]) => {
    const checkedSet = new Set(nextChecked);
    let next = gross;
    items.forEach(it => {
      if (checkedSet.has(it.id)) {
        next += it.isSupplement ? Number(it.amount || 0) : -Number(it.amount || 0);
      }
    });
    const rounded = Math.max(0, Number(next.toFixed(2)));
    setAmount(rounded);
    onAmountChange(rounded);
    onCheckedChange(nextChecked);
  };

  const toggle = (id: string) => {
    const next = checkedIds.includes(id) ? checkedIds.filter(x => x !== id) : [...checkedIds, id];
    setCheckedIds(next);
    recompute(next);
  };

  return (
    <div>
      <div className="u-mb-8">
        工厂「{factoryName}」· {orderCount} 个已审核订单 · 加工费 <b>¥{gross.toFixed(2)}</b>
      </div>
      {items.length > 0 && (
        <div className="u-br-6 u-p-6px10px u-mb-8" style={{ border: '1px solid var(--color-border-antd, #f0f0f0)', maxHeight: 180, overflowY: 'auto' }}>
          <div className="u-fs-12 u-mb-4" style={{ color: 'var(--color-text-tertiary)' }}>
            扣款/补款清单（取消勾选 = 本期不抵扣，自动滚存下期）：
          </div>
          {items.map(it => (
            <label key={it.id} className="u-d-flex u-ai-start u-gap-6 u-cur-pointer u-fs-13" style={{ padding: '3px 0' }}>
              <input
                type="checkbox"
                checked={checkedIds.includes(it.id)}
                onChange={() => toggle(it.id)}
                style={{ marginTop: 3 }}
              />
              <span className="u-flex-1">
                {it.carryOver && <span className="u-mr-4" style={{ color: 'var(--color-warning, #faad14)' }}>[上期结转]</span>}
                {typeLabel[it.deductionType || ''] || it.deductionType || '扣款'}
                {it.orderNo ? ` · ${it.orderNo}` : ''}
                {it.description ? <span className="u-fs-12" style={{ color: 'var(--color-text-tertiary)' }}> · {it.description}</span> : null}
              </span>
              <span style={{ color: it.isSupplement ? 'var(--color-success, #52c41a)' : 'var(--color-danger, #cf1322)', whiteSpace: 'nowrap' }}>
                {it.isSupplement ? '+' : '−'}¥{Number(it.amount || 0).toFixed(2)}
              </span>
            </label>
          ))}
        </div>
      )}
      <div className="u-mb-4">本次结算金额：</div>
      <InputNumber
        style={{ width: '100%' }}
        value={amount}
        min={0}
        precision={2}
        onChange={(v) => {
          const nv = Number(v || 0);
          setAmount(nv);
          onAmountChange(nv);
        }}
      />
      <div className="u-fs-12 u-mt-4" style={{ color: 'var(--color-text-tertiary)' }}>
        默认 = 加工费 − 勾选扣款 + 补款；可手动微调
      </div>
    </div>
  );
};

export default FactorySettleConfirmContent;
