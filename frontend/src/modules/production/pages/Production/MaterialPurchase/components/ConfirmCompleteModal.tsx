import React, { useEffect, useMemo, useState } from 'react';
import { Input, InputNumber, Modal, Radio, Space, Typography } from 'antd';
import MaterialWarehouseLocationPicker from '@/components/common/purchase/MaterialWarehouseLocationPicker';
import type { MaterialPurchase } from '@/types/production';
import type { ConfirmCompleteOptions, MovementAction } from '../hooks/usePurchaseConfirmCompleteActions';

interface ConfirmCompleteModalProps {
  visible: boolean;
  targets: MaterialPurchase[];
  submitting: boolean;
  onCancel: () => void;
  onConfirm: (options: ConfirmCompleteOptions) => void;
}

const { Text } = Typography;

/**
 * D-321b: 确认完成时的物料去向选择弹窗。
 * 不新增操作列按钮——选择动作内嵌在既有"确认完成"流程里：
 *   入库到仓库 → 登记入库单+库存+出入库流水，之后领料出库再扣减；
 *   直接使用   → 不经过仓库，记一条采购直用流水，库存不变；
 *   暂不登记   → 仅确认完成，维持原有行为。
 */
const ConfirmCompleteModal: React.FC<ConfirmCompleteModalProps> = ({
  visible,
  targets,
  submitting,
  onCancel,
  onConfirm,
}) => {
  const [movementAction, setMovementAction] = useState<MovementAction>('inbound');
  const [warehouseLocation, setWarehouseLocation] = useState('');
  const [receiverName, setReceiverName] = useState('');
  const [quantity, setQuantity] = useState<number | null>(null);

  const singleTarget = targets.length === 1 ? targets[0] : null;

  // 弹窗每次打开时按目标采购单重置默认值
  const openKey = visible ? `${targets.length}-${targets[0]?.id || ''}` : '';
  useEffect(() => {
    if (!openKey) return;
    const first = targets[0];
    if (first) {
      const qty = Number(first.purchaseQuantity) || 0;
      setQuantity(qty > 0 ? qty : null);
      setReceiverName(String(first.receiverName || '').trim());
    }
    setMovementAction('inbound');
    setWarehouseLocation('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openKey]);

  const totalQuantity = useMemo(
    () => targets.reduce((sum, t) => sum + (Number(t.purchaseQuantity) || 0), 0),
    [targets],
  );

  const handleConfirm = () => {
    if (movementAction === 'inbound' && !warehouseLocation.trim()) {
      return; // 双保险：选择器空态按钮已禁用
    }
    onConfirm({
      movementAction,
      ...(movementAction !== 'none' && singleTarget && quantity ? { movementQuantity: quantity } : {}),
      ...(movementAction === 'inbound' && warehouseLocation.trim() ? { warehouseLocation: warehouseLocation.trim() } : {}),
      ...(movementAction === 'direct_use' && receiverName.trim() ? { receiverName: receiverName.trim() } : {}),
    });
  };

  return (
    <Modal
      open={visible}
      title={`确认完成（${targets.length}张采购单，共${totalQuantity}件）`}
      onCancel={onCancel}
      confirmLoading={submitting}
      onOk={handleConfirm}
      okButtonProps={{ disabled: movementAction === 'inbound' && !warehouseLocation.trim() }}
      okText="确认完成"
      cancelText="取消"
      width={640}
      destroyOnClose
    >
      <Space direction="vertical" size={12} style={{ width: '100%' }}>
        <div>
          <Text strong>物料去向</Text>
          <Radio.Group
            value={movementAction}
            onChange={(e) => setMovementAction(e.target.value)}
            style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}
          >
            <Radio value="inbound">
              <Text strong>入库到仓库</Text>
              <Text type="secondary" style={{ display: 'block', fontSize: 12, marginLeft: 22 }}>
                登记入库单并增加库存，之后领料出库时再扣减，出入库都有流水
              </Text>
            </Radio>
            <Radio value="direct_use">
              <Text strong>直接使用</Text>
              <Text type="secondary" style={{ display: 'block', fontSize: 12, marginLeft: 22 }}>
                到货即用不进仓库，记一条采购直用流水，库存不变
              </Text>
            </Radio>
            <Radio value="none">
              <Text strong>暂不登记</Text>
              <Text type="secondary" style={{ display: 'block', fontSize: 12, marginLeft: 22 }}>
                仅确认完成，不产生出入库记录
              </Text>
            </Radio>
          </Radio.Group>
        </div>

        {' '}
        {movementAction === 'inbound' && (
          <div>
            <Text type="secondary" style={{ display: 'block', marginBottom: 4 }}>入库仓库/库位（必选）</Text>
            <MaterialWarehouseLocationPicker value={warehouseLocation} onChange={(v) => setWarehouseLocation(v)} />
          </div>
        )}

        {movementAction === 'direct_use' && (
          <Space size={8} wrap>
            <Text type="secondary">领用人</Text>
            <Input
              value={receiverName}
              onChange={(e) => setReceiverName(e.target.value)}
              placeholder={singleTarget?.receiverName || '当前登录人'}
              style={{ width: 200 }}
            />
          </Space>
        )}

        {movementAction !== 'none' && singleTarget && (
          <Space size={8} wrap>
            <Text type="secondary">数量</Text>
            <InputNumber
              value={quantity}
              onChange={(v) => setQuantity(v)}
              min={1}
              precision={0}
              style={{ width: 140 }}
            />
            {singleTarget.purchaseQuantity != null && (
              <Text type="secondary">采购量 {singleTarget.purchaseQuantity}件</Text>
            )}
          </Space>
        )}

        {movementAction !== 'none' && targets.length > 1 && (
          <Text type="secondary" style={{ fontSize: 12 }}>
            多张采购单将按各自采购量全额登记，如需拆分请到单张采购单单独操作
          </Text>
        )}
      </Space>
    </Modal>
  );
};

export default ConfirmCompleteModal;
