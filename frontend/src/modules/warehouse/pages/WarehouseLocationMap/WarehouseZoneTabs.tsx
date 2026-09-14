// 库区标签 + 批量操作按钮
import React from 'react';
import { Badge, Button } from 'antd';
import { AppstoreOutlined, PlusOutlined, CheckSquareOutlined, PrinterOutlined } from '@ant-design/icons';
import type { FormInstance } from 'antd';
import type { LocationItem } from './types';

interface ZoneItem {
  name: string;
  code: string;
}

interface Props {
  zones: ZoneItem[];
  locations: LocationItem[];
  selectedZoneName: string;
  onSelectZone: (name: string) => void;
  selectMode: boolean;
  selectedLocationIds: Set<string>;
  filteredLocations: LocationItem[];
  onToggleSelectMode: () => void;
  onToggleSelectAll: () => void;
  onOpenPrint: () => void;
  onCreateLocation: () => void;
  onOpenBatchInit: (form: FormInstance) => void;
  batchInitForm: FormInstance;
}

const WarehouseZoneTabs: React.FC<Props> = ({
  zones,
  locations,
  selectedZoneName,
  onSelectZone,
  selectMode,
  selectedLocationIds,
  filteredLocations,
  onToggleSelectMode,
  onToggleSelectAll,
  onOpenPrint,
  onCreateLocation,
  onOpenBatchInit,
  batchInitForm,
}) => {
  const allSelected = filteredLocations.length > 0 && filteredLocations.every(l => selectedLocationIds.has(l.id));
  return (
    <div className="wlm-zone-tabs">
      {zones.map(zone => (
        <div
          key={zone.name}
          className={`wlm-zone-tab ${selectedZoneName === zone.name ? 'active' : ''}`}
          onClick={() => onSelectZone(zone.name)}
        >
          <AppstoreOutlined style={{ marginRight: 4 }} />
          {zone.name}
          <Badge
            count={locations.filter(l => l.zoneName === zone.name && l.usedCapacity > 0).length}
            style={{ marginLeft: 6, backgroundColor: 'var(--color-primary)' }}
          />
        </div>
      ))}
      <div className="wlm-zone-tab-actions">
        <Button
          type="link"
          size="small"
          icon={<AppstoreOutlined />}
          onClick={onToggleSelectMode}
        >
          {selectMode ? '取消勾选' : '批量勾选'}
        </Button>
        {selectMode && (
          <>
            <Button
              type="link"
              size="small"
              icon={<CheckSquareOutlined />}
              onClick={onToggleSelectAll}
            >
              {allSelected ? '取消全选' : '全选'}
            </Button>
            {selectedLocationIds.size > 0 && (
              <Button
                type="primary"
                size="small"
                icon={<PrinterOutlined />}
                onClick={onOpenPrint}
              >
                打印库位贴 ({selectedLocationIds.size})
              </Button>
            )}
          </>
        )}
        {!selectMode && (
          <>
            <Button
              type="link"
              size="small"
              icon={<PlusOutlined />}
              onClick={onCreateLocation}
            >
              新增库位
            </Button>
            <Button
              type="link"
              size="small"
              icon={<AppstoreOutlined />}
              onClick={() => onOpenBatchInit(batchInitForm)}
            >
              批量初始化
            </Button>
          </>
        )}
      </div>
    </div>
  );
};

export default WarehouseZoneTabs;
