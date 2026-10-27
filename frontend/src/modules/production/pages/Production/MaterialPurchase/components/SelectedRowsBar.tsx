import React from 'react';
import { Button, Space } from 'antd';
import { ShoppingCartOutlined } from '@ant-design/icons';
import PurchaseActionBar, {
  getBatchActionDisabledReason,
  type PurchaseActionButtonState,
} from '@/components/common/purchase/PurchaseActionBar';
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
 * 选中行操作条：只负责「已选计数 + 清空 + 加入购物车」，
 * 批量动作（批量领取 / 登记到货 / 回料确认 / 确认完成）一律复用全站统一按钮
 * PurchaseActionBar（D-360），与物料详情页 / 采购节点弹窗 / 采购弹窗详情同一套实现。
 *
 * 这里以前自己抄了一份下拉菜单，与统一按钮是两套实现、会各自漂移
 * （"批量领取后没有后续动作"就同时存在于两套里）——已删除，只留统一入口。
 * 当 selectedRows 为空时返回 null。
 */
const SelectedRowsBar: React.FC<SelectedRowsBarProps> = ({
  selectedRows, onClear, onBatchAddToCart, onBatchReceive, onBatchArrival, onBatchReturn, onBatchComplete,
}) => {
  if (selectedRows.length === 0) return null;

  // D-664b：禁用口径与原因全入口统一（getBatchActionDisabledReason，D-368 业务事实）
  const mk = (
    reason: string | undefined,
    handler?: (records: MaterialPurchaseType[]) => void,
  ): PurchaseActionButtonState | undefined =>
    (handler ? {
      disabled: !!reason,
      title: reason,
      onClick: () => handler(selectedRows),
    } : undefined);

  const receive = mk(getBatchActionDisabledReason(selectedRows, 'receive'), onBatchReceive);
  const arrivalRegister = mk(getBatchActionDisabledReason(selectedRows, 'arrivalRegister'), onBatchArrival);
  const batchReturn = mk(getBatchActionDisabledReason(selectedRows, 'batchReturn'), onBatchReturn);
  const confirmComplete = mk(getBatchActionDisabledReason(selectedRows, 'confirmComplete'), onBatchComplete);

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
        <PurchaseActionBar
          size="small"
          receive={receive}
          arrivalRegister={arrivalRegister}
          batchReturn={batchReturn}
          confirmComplete={confirmComplete}
        />
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
