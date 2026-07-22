// 库位网格 - 显示库位卡片
import React from 'react';
import { Empty, Spin, Tooltip, Checkbox } from 'antd';
import { InboxOutlined, DeleteOutlined } from '@ant-design/icons';
import { getLocationStatus, getStatusBg, getStatusBorder, getStatusColor } from './helpers';
import type { LocationItem } from './types';

interface Props {
  filteredLocations: LocationItem[];
  locationsLoading: boolean;
  locations: LocationItem[];
  selectMode: boolean;
  selectedLocationIds: Set<string>;
  onLocationClick: (location: LocationItem) => void;
  onToggleSelect: (locationId: string) => void;
  onCheckboxChange: (locationId: string, checked: boolean) => void;
  onDeleteLocation: (locationId: string, locationCode: string, usedCapacity: number, e?: React.MouseEvent) => void;
}

const WarehouseLocationGrid: React.FC<Props> = ({
  filteredLocations,
  locationsLoading,
  locations: _locations,
  selectMode,
  selectedLocationIds,
  onLocationClick,
  onToggleSelect,
  onCheckboxChange,
  onDeleteLocation,
}) => {
  return (
    <Spin spinning={locationsLoading}>
      {filteredLocations.length > 0 ? (
        <div className="wlm-location-grid">
          {filteredLocations.map(location => {
            const status = getLocationStatus(location);
            const isSelected = selectedLocationIds.has(location.id);
            return (
              <Tooltip
                key={location.id}
                title={
                  status === 'empty'
                    ? `${location.locationCode} - 空库位`
                    : `${location.locationCode} - 已用 ${location.usedCapacity}/${location.capacity || '∞'}`
                }
                placement="top"
              >
                <div
                  className={`wlm-location-card ${status} ${isSelected ? 'selected' : ''}`}
                  style={{
                    backgroundColor: getStatusBg(status),
                    borderColor: isSelected ? 'var(--color-primary)' : getStatusBorder(status),
                  }}
                  onClick={() => {
                    if (selectMode) {
                      onToggleSelect(location.id);
                    } else {
                      onLocationClick(location);
                    }
                  }}
                >
                  {selectMode && (
                    <Checkbox
                      className="wlm-location-checkbox"
                      checked={isSelected}
                      onChange={(e) => onCheckboxChange(location.id, e.target.checked)}
                    />
                  )}
                  <div className="wlm-location-code" style={{ color: getStatusColor(status) }}>
                    {location.locationCode}
                  </div>
                  <div className="wlm-location-qty">
                    {status === 'empty' ? (
                      <span className="wlm-empty-text">空闲</span>
                    ) : (
                      <>
                        <InboxOutlined style={{ fontSize: 12, marginRight: 2 }} />
                        {location.usedCapacity}
                      </>
                    )}
                  </div>
                  <div className="wlm-location-capacity">
                    {location.capacity ? `${location.usedCapacity}/${location.capacity}` : `${location.usedCapacity}`}
                  </div>
                  {!selectMode && (
                    <DeleteOutlined
                      className="wlm-location-delete-icon"
                      onClick={(e) => onDeleteLocation(location.id, location.locationCode, location.usedCapacity, e)}
                    />
                  )}
                </div>
              </Tooltip>
            );
          })}
        </div>
      ) : (
        <Empty
          description={locationsLoading ? '加载中...' : '该仓库暂无库位，请点击上方"新增库位"或"批量初始化"'}
          style={{ marginTop: 60 }}
        />
      )}
    </Spin>
  );
};

export default WarehouseLocationGrid;
