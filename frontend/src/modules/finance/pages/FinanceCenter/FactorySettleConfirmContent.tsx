/**
 * D-134：工厂终审推送确认内容——加工费/扣款/补款明细 + 本次结算金额可编辑
 * 独立成 .tsx 组件：useFactorySummaryData.ts 是 .ts 文件无法内联 JSX
 */
import { InputNumber } from 'antd';

export interface FactorySettleConfirmContentProps {
  factoryName: string;
  orderCount: number;
  gross: number;
  deduction: number;
  supplement: number;
  defaultAmount: number;
  onAmountChange: (v: number) => void;
}

const FactorySettleConfirmContent: React.FC<FactorySettleConfirmContentProps> = ({
  factoryName, orderCount, gross, deduction, supplement, defaultAmount, onAmountChange,
}) => (
  <div>
    <div style={{ marginBottom: 8 }}>
      工厂「{factoryName}」· {orderCount} 个已审核订单
    </div>
    <div style={{ lineHeight: 1.9, marginBottom: 8 }}>
      <div>加工费：<b>¥{gross.toFixed(2)}</b></div>
      {deduction > 0 && <div style={{ color: 'var(--color-danger, #cf1322)' }}>扣款：−¥{deduction.toFixed(2)}</div>}
      {supplement > 0 && <div style={{ color: 'var(--color-success, #52c41a)' }}>补款：+¥{supplement.toFixed(2)}</div>}
    </div>
    <div style={{ marginBottom: 4 }}>本次结算金额（可修改）：</div>
    <InputNumber
      style={{ width: '100%' }}
      defaultValue={defaultAmount}
      min={0}
      precision={2}
      onChange={(v) => onAmountChange(Number(v || 0))}
    />
    <div style={{ color: 'var(--color-text-tertiary)', fontSize: 12, marginTop: 4 }}>
      默认 = 加工费 − 扣款 + 补款；如本月暂不扣款，可手动改回加工费金额
    </div>
  </div>
);

export default FactorySettleConfirmContent;
