import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Input, InputNumber, Modal, Typography } from 'antd';
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

/** 记住用户上一次在弹窗里选的去向（D-894：不再每次从「入库」重新开始选） */
const LAST_ACTION_KEY = 'purchase.c…tion';

const OPTIONS: Array<{ value: MovementAction; title: string; desc: string }> = [
  { value: 'inbound', title: '入库到仓库', desc: '登记入库单并增加库存，领料出库时再扣减' },
  { value: 'direct_use', title: '直接使用', desc: '到货即用不进仓库，记一条采购直用流水' },
  { value: 'none', title: '暂不登记', desc: '仅确认完成，不产生出入库记录' },
];

const sectionStyle: React.CSSProperties = {
  border: '1px solid var(--color-border-light)',
  borderRadius: 8,
  padding: '12px 14px',
};

/**
 * D-321b: 确认完成时的物料去向选择弹窗。
 * D-894 重做：
 * 1) 去向不再写死「入库」——到货登记时已入过库的行默认「暂不登记」（货和库存都已记好，
 *    只差把状态点完成）；其余情况默认沿用用户上一次选的去向。
 * 2) 布局重排：去向改成三张可点卡片，条件字段收进独立分区，去掉大段灰字。
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

  // 全部选中行都已在「登记到货」时入库（inboundRecordId 已回写）→ 无需再登记去向
  const allAlreadyInbounded = useMemo(
    () => targets.length > 0 && targets.every((t) => !!(t as { inboundRecordId?: string }).inboundRecordId),
    [targets],
  );

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
    const last = (localStorage.getItem(LAST_ACTION_KEY) || '') as MovementAction | '';
    setMovementAction(allAlreadyInbounded ? 'none' : (last || 'inbound'));
    setWarehouseLocation('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openKey, allAlreadyInbounded]);

  const totalQuantity = useMemo(
    () => targets.reduce((sum, t) => sum + (Number(t.purchaseQuantity) || 0), 0),
    [targets],
  );

  const handleConfirm = () => {
    if (movementAction === 'inbound' && !warehouseLocation.trim()) {
      return; // 双保险：选择器空态按钮已禁用
    }
    localStorage.setItem(LAST_ACTION_KEY, movementAction);
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
      // D-376：物料采购单位可能是 米/公斤/个，硬编码「件」会误导；
      // 多张采购单单位可能不同，这里不显示单位，明细处按各自 unit 展示
      title={`确认完成（${targets.length}张采购单，共 ${totalQuantity}）`}
      onCancel={onCancel}
      confirmLoading={submitting}
      onOk={handleConfirm}
      okButtonProps={{ disabled: movementAction === 'inbound' && !warehouseLocation.trim() }}
      okText="确认完成"
      cancelText="取消"
      width={680}
      destroyOnClose
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {allAlreadyInbounded && (
          <Alert
            type="success"
            showIcon
            message="所选采购单在「登记到货」时已入库，库存已更新。确认完成只结束状态即可，无需重复登记去向。"
          />
        )}

        <div>
          <Text strong style={{ display: 'block', marginBottom: 8 }}>物料去向</Text>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {OPTIONS.map((opt) => {
              const selected = movementAction === opt.value;
              return (
                <div
                  key={opt.value}
                  role="button"
                  tabIndex={0}
                  onClick={() => setMovementAction(opt.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') setMovementAction(opt.value); }}
                  style={{
                    ...sectionStyle,
                    cursor: 'pointer',
                    borderColor: selected ? 'var(--color-primary)' : 'var(--color-border-light)',
                    background: selected ? 'var(--color-primary-bg, #e6f4ff)' : 'transparent',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                    <Text strong>{opt.title}</Text>
                    <Text type="secondary" style={{ fontSize: 12 }}>{opt.desc}</Text>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {movementAction === 'inbound' && (
          <div style={sectionStyle}>
            <Text type="secondary" style={{ display: 'block', marginBottom: 8 }}>入库仓库/库位（必选）</Text>
            <MaterialWarehouseLocationPicker value={warehouseLocation} onChange={(v) => setWarehouseLocation(v)} />
          </div>
        )}

        {movementAction === 'direct_use' && (
          <div style={{ ...sectionStyle, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <Text type="secondary">领用人</Text>
            <Input
              value={receiverName}
              onChange={(e) => setReceiverName(e.target.value)}
              placeholder={singleTarget?.receiverName || '当前登录人'}
              style={{ width: 180 }}
            />
          </div>
        )}

        {movementAction !== 'none' && singleTarget && (
          <div style={{ ...sectionStyle, display: 'flex', alignItems: 'center', gap: 12 }}>
            <Text type="secondary">数量</Text>
            {/* D-410 收尾：放开小数（面料按米计量）；单位不再写死「件」 */}
            <InputNumber
              value={quantity}
              onChange={(v) => setQuantity(v)}
              min={0.01}
              step={0.01}
              precision={2}
              style={{ width: 140 }}
            />
            <Text type="secondary" style={{ fontSize: 12 }}>
              采购量 {singleTarget.purchaseQuantity}{singleTarget.unit || ''}
            </Text>
          </div>
        )}

        {movementAction !== 'none' && targets.length > 1 && (
          <Text type="secondary" style={{ fontSize: 12 }}>
            多张采购单将按各自采购量全额登记，如需拆分请到单张采购单单独操作
          </Text>
        )}

        <Text type="secondary" style={{ fontSize: 12 }}>
          对账说明：「入库到仓库」走物料仓库出入库流水；「直接使用 / 暂不登记」的采购款在物料对账页核销。
        </Text>
      </div>
    </Modal>
  );
};

export default ConfirmCompleteModal;
