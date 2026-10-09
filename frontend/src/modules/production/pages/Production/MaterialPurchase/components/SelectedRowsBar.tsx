import React from 'react';
import { Button, Dropdown, Space } from 'antd';
import type { MenuProps } from 'antd';
import { ShoppingCartOutlined, DownOutlined } from '@ant-design/icons';
import { PURCHASE_ACTION_LABELS } from '@/components/common/purchase/PurchaseActionBar';
import { MATERIAL_PURCHASE_STATUS } from '@/constants/business';
import { MaterialPurchase as MaterialPurchaseType } from '@/types/production';

interface SelectedRowsBarProps {
  selectedRows: MaterialPurchaseType[];
  onClear: () => void;
  onBatchAddToCart?: (records: MaterialPurchaseType[]) => void;
  onBatchReceive?: (records: MaterialPurchaseType[]) => void;
  onBatchReturn?: (records: MaterialPurchaseType[]) => void;
  onBatchComplete?: (records: MaterialPurchaseType[]) => void;
}

const normalize = (s?: string) => String(s || '').trim().toLowerCase();

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
  selectedRows, onClear, onBatchAddToCart, onBatchReceive, onBatchReturn, onBatchComplete,
}) => {
  if (selectedRows.length === 0) return null;

  // 禁用口径与采购节点弹窗（InlinePurchasePanel）一致：
  //   领取 = 有待领取(pending)行；回料 = D-368 业务事实（非取消、未回料确认、到货数量>0）；完成 = 有 awaiting_confirm 行
  const receiveDisabled = !selectedRows.some((r) => String(r.id || '').trim() && normalize(r.status) === MATERIAL_PURCHASE_STATUS.PENDING);
  const returnDisabled = !selectedRows.some((r) =>
    normalize(r.status) !== MATERIAL_PURCHASE_STATUS.CANCELLED
    && Number(r.returnConfirmed || 0) !== 1
    && Number(r.arrivedQuantity || 0) > 0);
  const completeDisabled = !selectedRows.some((r) => String(r.id || '').trim() && normalize(r.status) === MATERIAL_PURCHASE_STATUS.AWAITING_CONFIRM);

  const batchMenuItems: MenuProps['items'] = [
    {
      key: 'receive',
      label: withDisabledReason(PURCHASE_ACTION_LABELS.batchReceive, receiveDisabled, '没有待领取的物料'),
      disabled: receiveDisabled,
      onClick: () => onBatchReceive?.(selectedRows),
    },
    {
      key: 'batch-return',
      label: withDisabledReason(PURCHASE_ACTION_LABELS.batchReturn, returnDisabled, '需先登记到货（到货数量＞0）'),
      disabled: returnDisabled,
      onClick: () => onBatchReturn?.(selectedRows),
    },
    {
      key: 'confirm-complete',
      label: withDisabledReason(PURCHASE_ACTION_LABELS.confirmComplete, completeDisabled, '没有待确认完成的物料'),
      disabled: completeDisabled,
      onClick: () => onBatchComplete?.(selectedRows),
    },
  ];

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
            disabled={receiveDisabled}
            title={receiveDisabled ? '没有待领取的物料' : undefined}
            onClick={() => onBatchReceive?.(selectedRows)}
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
