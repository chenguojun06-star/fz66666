import React from 'react';
import { Button, Dropdown, Space } from 'antd';
import type { MenuProps } from 'antd';
import { ShoppingCartOutlined, DownOutlined } from '@ant-design/icons';
import { PURCHASE_ACTION_LABELS, getBatchActionDisabledReason } from '@/components/common/purchase/PurchaseActionBar';
import { MaterialPurchase as MaterialPurchaseType } from '@/types/production';

interface SelectedRowsBarProps {
  selectedRows: MaterialPurchaseType[];
  onClear: () => void;
  onBatchAddToCart?: (records: MaterialPurchaseType[]) => void;
  onBatchReceive?: (records: MaterialPurchaseType[]) => void;
  onBatchArrival?: (records: MaterialPurchaseType[]) => void;
  onBatchReturn?: (records: MaterialPurchaseType[]) => void;
  onBatchComplete?: (records: MaterialPurchaseType[]) => void;
}

/**
 * D-664：禁用菜单项的不可用原因渲染进标签（antd 禁用项悬停 tooltip 不生效）。
 */
const withDisabledReason = (label: string, disabled: boolean, reason?: string): React.ReactNode => {
  if (disabled && reason) {
    return (
      <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 8 }}>
        <span>{label}</span>
        <span style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>{reason}</span>
      </span>
    );
  }
  return label;
};

/**
 * 选中行批量操作栏（清空 + 批量领取▾ + 加入购物车）。
 * 批量动作与采购节点弹窗/详情弹窗/样衣节点同一套统一按钮（D-360）：
 * 主按钮直点=批量领取，悬停出菜单：批量领取 / 回料确认 / 确认完成。
 * 当 selectedRows 为空时返回 null。
 */
const SelectedRowsBar: React.FC<SelectedRowsBarProps> = ({
  selectedRows, onClear, onBatchAddToCart, onBatchReceive, onBatchArrival, onBatchReturn, onBatchComplete,
}) => {
  if (selectedRows.length === 0) return null;

  // D-664b：禁用口径与原因全入口统一（getBatchActionDisabledReason，D-368 业务事实），
  // 禁用时按真实状态动态生成原因（已全部回料确认 / 已全部到货完成 / 需先登记到货…），不写死误导文案
  const receiveReason = getBatchActionDisabledReason(selectedRows, 'receive');
  const arrivalReason = getBatchActionDisabledReason(selectedRows, 'arrivalRegister');
  const returnReason = getBatchActionDisabledReason(selectedRows, 'batchReturn');
  const completeReason = getBatchActionDisabledReason(selectedRows, 'confirmComplete');
  const receiveDisabled = !!receiveReason;
  const arrivalDisabled = !!arrivalReason;
  const returnDisabled = !!returnReason;
  const completeDisabled = !!completeReason;

  const batchMenuItems: MenuProps['items'] = [
    {
      key: 'receive',
      label: withDisabledReason(PURCHASE_ACTION_LABELS.batchReceive, receiveDisabled, receiveReason),
      disabled: receiveDisabled,
      onClick: () => onBatchReceive?.(selectedRows),
    },
    {
      key: 'arrival-register',
      label: withDisabledReason(PURCHASE_ACTION_LABELS.arrivalRegister, arrivalDisabled, arrivalReason),
      disabled: arrivalDisabled,
      onClick: () => onBatchArrival?.(selectedRows),
    },
    {
      key: 'batch-return',
      label: withDisabledReason(PURCHASE_ACTION_LABELS.batchReturn, returnDisabled, returnReason),
      disabled: returnDisabled,
      onClick: () => onBatchReturn?.(selectedRows),
    },
    {
      key: 'confirm-complete',
      label: withDisabledReason(PURCHASE_ACTION_LABELS.confirmComplete, completeDisabled, completeReason),
      disabled: completeDisabled,
      onClick: () => onBatchComplete?.(selectedRows),
    },
  ];

  // 与 PurchaseActionBar 同口径：批量领取后 receive 必然禁用，
  // 主按钮若跟着禁用，Dropdown 触发器失效 → 打不开下拉 → 看不出还有登记到货/回料/确认完成。
  const canReceive = !receiveDisabled;
  const hasOtherAction = (!!onBatchArrival && !arrivalDisabled)
    || (!!onBatchReturn && !returnDisabled)
    || (!!onBatchComplete && !completeDisabled);
  const mainDisabled = !canReceive && !hasOtherAction;
  const mainTitle = canReceive
    ? receiveReason
    : hasOtherAction
      ? `批量领取不可用：${receiveReason || '所选记录无需领取'}，可从下拉选择其他批量操作`
      : receiveReason;

  return (
    <div style={{
      padding: '8px 16px',
      marginBottom: 8,
      background: 'var(--color-bg-highlight)',
      borderRadius: 6,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
    }}>
      <Space>
        <span>已选择 <strong>{selectedRows.length}</strong> 项</span>
        <Button size="small" onClick={onClear}>清空</Button>
      </Space>
      <Space>
        <Dropdown menu={{ items: batchMenuItems }} trigger={['hover']}>
          <Button
            type="primary"
            size="small"
            disabled={mainDisabled}
            title={mainTitle}
            onClick={canReceive ? () => onBatchReceive?.(selectedRows) : undefined}
          >
            {PURCHASE_ACTION_LABELS.batchReceive} <DownOutlined />
          </Button>
        </Dropdown>
        <Button
          icon={<ShoppingCartOutlined />}
          size="small"
          onClick={() => onBatchAddToCart?.(selectedRows)}
        >
          加入购物车
        </Button>
      </Space>
    </div>
  );
};

export default SelectedRowsBar;
