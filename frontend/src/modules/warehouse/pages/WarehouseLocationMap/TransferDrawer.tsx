// 库存转移抽屉
import React from 'react';
import { Drawer, Button, Alert, Form } from 'antd';
import WarehouseLocationAutoComplete from '@/components/common/WarehouseLocationAutoComplete';
import type { LocationItem } from './types';

interface Props {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  loading: boolean;
  selectedLocation: LocationItem | null;
  selectedAreaId: string;
  transferTargetLocation: string;
  onTargetLocationChange: (val: string) => void;
}

const TransferDrawer: React.FC<Props> = ({
  open,
  onClose,
  onConfirm,
  loading,
  selectedLocation,
  selectedAreaId,
  transferTargetLocation,
  onTargetLocationChange,
}) => {
  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="库存转移"
      styles={{ wrapper: { width: 420, zIndex: 2000 } }}
      destroyOnHidden
      extra={
        <Button type="primary" onClick={onConfirm} loading={loading} disabled={!transferTargetLocation}>
          确认转移
        </Button>
      }
    >
      <div style={{ padding: '8px 0' }}>
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
          title={
            <span>
              源库位：<strong>{selectedLocation?.locationCode}</strong>
              {selectedLocation?.locationName && `（${selectedLocation.locationName}）`}
              ，当前库存 <strong>{selectedLocation?.usedCapacity}</strong> 件
            </span>
          }
        />
        <Form layout="vertical">
          <Form.Item label="目标库位" required>
            <WarehouseLocationAutoComplete
              warehouseType={selectedLocation?.warehouseType}
              areaId={selectedAreaId}
              value={transferTargetLocation}
              onChange={onTargetLocationChange}
              placeholder="请选择目标库位"
              style={{ width: '100%' }}
            />
          </Form.Item>
        </Form>
      </div>
    </Drawer>
  );
};

export default TransferDrawer;
