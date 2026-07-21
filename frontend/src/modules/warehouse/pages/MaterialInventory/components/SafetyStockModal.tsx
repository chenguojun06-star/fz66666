import React from 'react';
import {
  Card,
  Button,
  Tag,
  InputNumber,
} from 'antd';
import { getBaseMaterialTypeLabel, getMaterialTypeCategory } from '@/utils/materialType';
import SmallModal from '@/components/common/SmallModal';

import type { useMaterialInventoryData } from '../hooks/useMaterialInventoryData';

type InventoryData = ReturnType<typeof useMaterialInventoryData>;

export interface SafetyStockModalProps {
  safetyStockVisible: InventoryData['safetyStockVisible'];
  setSafetyStockVisible: InventoryData['setSafetyStockVisible'];
  safetyStockSubmitting: InventoryData['safetyStockSubmitting'];
  handleSafetyStockSave: InventoryData['handleSafetyStockSave'];
  safetyStockTarget: InventoryData['safetyStockTarget'];
  safetyStockValue: InventoryData['safetyStockValue'];
  setSafetyStockValue: InventoryData['setSafetyStockValue'];
}

const SafetyStockModal: React.FC<SafetyStockModalProps> = ({
  safetyStockVisible,
  setSafetyStockVisible,
  safetyStockSubmitting,
  handleSafetyStockSave,
  safetyStockTarget,
  safetyStockValue,
  setSafetyStockValue,
}) => {
  return (
    <SmallModal
      title="设置安全库存"
      open={safetyStockVisible}
      onCancel={() => setSafetyStockVisible(false)}
      footer={[
        <Button key="cancel" onClick={() => setSafetyStockVisible(false)}>取消</Button>,
        <Button key="save" type="primary" loading={safetyStockSubmitting} onClick={handleSafetyStockSave}>
          保存
        </Button>,
      ]}
    >
      {safetyStockTarget && (
        <div>
          <Card style={{ marginBottom: 16, background: 'var(--color-bg-subtle)' }}>
            <div><strong>{safetyStockTarget.materialCode}</strong> <Tag color={getMaterialTypeCategory(safetyStockTarget.materialType) === 'fabric' ? 'blue' : getMaterialTypeCategory(safetyStockTarget.materialType) === 'lining' ? 'cyan' : 'green'}>{getBaseMaterialTypeLabel(safetyStockTarget.materialType)}</Tag></div>
            <div style={{ fontSize: "var(--font-size-sm)", color: 'var(--neutral-text-secondary)', marginTop: 4 }}>{safetyStockTarget.materialName}</div>
            <div style={{ fontSize: "var(--font-size-sm)", marginTop: 4 }}>
              当前库存: <strong>{safetyStockTarget.quantity ?? 0}</strong> {safetyStockTarget.unit}
            </div>
          </Card>
          <div style={{ marginBottom: 8 }}>安全库存（低于此值将触发预警）</div>
          <InputNumber
            style={{ width: '100%' }}
            min={0}
            max={999999}
            value={safetyStockValue}
            onChange={(v) => setSafetyStockValue(v ?? 0)}
            suffix={safetyStockTarget.unit || '件'}
            placeholder="请输入安全库存"
          />
          <div style={{ fontSize: "var(--font-size-sm)", color: 'var(--neutral-text-disabled)', marginTop: 8 }}>
            当库存低于安全库存时，系统将在仓库看板和面辅料预警中显示该物料
          </div>
        </div>
      )}
    </SmallModal>
  );
};

export default SafetyStockModal;
