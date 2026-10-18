import { useEffect, useState } from 'react';
import { Button, Grid, Modal } from 'antd';
import { DeleteOutlined } from '@ant-design/icons';
import { formatMoney } from '@/utils/format';

const { useBreakpoint } = Grid;

interface Props {
  open: boolean;
  /** 应收金额 */
  due: number;
  onCancel: () => void;
  onConfirm: (received: number) => void;
}

/**
 * 键位与硬件 POS 键盘一致：1-9 / 00 / 0 / 清除。
 *
 * <p>采用「**按一次左移两位**」模型（1 → 0.01，12 → 0.12，1200 → 12.00），
 * 和真实收银机的键盘行为一致：收银员闭着眼睛按，**不需要再按小数点**。
 * 小数点键只会让人多一次操作、多一次点错的余地。
 */
const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '00', '0', 'C'];

/**
 * 现金收款数字键盘。
 *
 * <p>专业收银的现金收款都是**大按键盲打**：收银员看着顾客/钱夹，
 * 不看键盘。普通 InputNumber 在触屏上键小、又要点两次才唤起数字键盘，
 * 高峰期输错一个数字就是一次对账事故，所以这里自带键盘。
 *
 * <p>金额一律按**分**做整数运算：浮点累加会出现 0.1+0.2=0.30000000000000004
 * 这种值，找零就会差 1 分，收银员和顾客都会觉得系统在坑人。
 */
const CashNumpad: React.FC<Props> = ({ open, due, onCancel, onConfirm }) => {
  /** 只存按下的数字串（未按过时为空串），金额 = 数字串 / 100 */
  const [raw, setRaw] = useState('');
  const screens = useBreakpoint();
  const wide = !!screens.lg;

  useEffect(() => {
    if (open) setRaw('');
  }, [open]);

  const amount = raw === '' ? null : Number(raw) / 100;
  const change = amount == null ? null : Math.round((amount - due) * 100) / 100;
  const short = change != null && change < 0;

  const press = (k: string) => {
    if (k === 'C') {
      setRaw('');
      return;
    }
    setRaw((prev) => {
      const next = prev + k;
      // 封顶 999999.99：再长就是误按连击，不能让它变成天文数字
      return next.length > 8 ? prev : next;
    });
  };

  return (
    <Modal
      open={open}
      title="现金收款"
      onCancel={onCancel}
      width={wide ? 400 : '92vw'}
      footer={[
        <Button key="cancel" onClick={onCancel} block size="large">
          取消
        </Button>,
        <Button
          key="ok"
          type="primary"
          size="large"
          block
          disabled={amount == null || short}
          onClick={() => amount != null && onConfirm(amount)}
        >
          确认收款
        </Button>,
      ]}
      styles={{ footer: { display: 'flex', gap: 12 } }}
    >
      <div className="pos-numpad__display">
        {amount == null ? '¥0.00' : formatMoney(amount)}
      </div>
      <div className="pos-numpad__change">
        应收 {formatMoney(due)}
        {change == null ? (
          ' · 请输入实收金额'
        ) : short ? (
          ` · 还差 ${formatMoney(-change)}`
        ) : (
          ` · 找零 ${formatMoney(change)}`
        )}
      </div>

      <div className="pos-numpad">
        {KEYS.map((k) => (
          <Button
            key={k}
            className="pos-numpad__key"
            size="large"
            danger={k === 'C'}
            aria-label={k === 'C' ? '清除' : k}
            onClick={() => press(k)}
          >
            {k === 'C' ? <DeleteOutlined /> : k}
          </Button>
        ))}
      </div>

    </Modal>
  );
};

export default CashNumpad;
