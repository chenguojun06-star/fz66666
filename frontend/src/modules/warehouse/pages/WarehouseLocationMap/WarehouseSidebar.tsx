// 仓库侧边栏 - 仓库列表
import React from 'react';
import { Switch, Empty, Tag, Spin, Button } from 'antd';
import { ShopOutlined, PlusOutlined, DeleteOutlined } from '@ant-design/icons';
import { WAREHOUSE_TYPE_MAP } from './types';
import type { WarehouseAreaItem } from './types';

interface Props {
  areas: WarehouseAreaItem[];
  areasLoading: boolean;
  selectedAreaId: string;
  onSelectArea: (areaId: string) => void;
  onToggleArea: (areaId: string, checked: boolean) => void;
  onDeleteArea: (areaId: string, areaName: string, e?: React.MouseEvent) => void;
  onCreateArea: () => void;
}

const WarehouseSidebar: React.FC<Props> = ({
  areas,
  areasLoading,
  selectedAreaId,
  onSelectArea,
  onToggleArea,
  onDeleteArea,
  onCreateArea,
}) => {
  return (
    <div className="wlm-sidebar">
      <div className="wlm-sidebar-header">
        <ShopOutlined className="wlm-sidebar-icon" />
        <span className="wlm-sidebar-title">仓库仓位管理</span>
        <Button
          type="primary"
          size="small"
          icon={<PlusOutlined />}
          onClick={onCreateArea}
        >
          新建仓库
        </Button>
      </div>
      <div className="wlm-warehouse-list">
        <Spin spinning={areasLoading}>
          {areas.length === 0 && !areasLoading ? (
            <Empty description="暂无仓库，点击上方新建" image={Empty.PRESENTED_IMAGE_SIMPLE} />
          ) : (
            areas.map(area => (
              <div
                key={area.id}
                className={`wlm-warehouse-item ${selectedAreaId === area.id ? 'active' : ''}`}
                onClick={() => onSelectArea(area.id)}
              >
                <div className="wlm-warehouse-info">
                  <div className="wlm-warehouse-name">
                    {area.areaName}
                    <Tag
                      color={area.warehouseType === 'FINISHED' ? 'blue' : area.warehouseType === 'MATERIAL' ? 'green' : 'orange'}
                      style={{ marginLeft: 6, fontSize: 10, lineHeight: '16px', padding: '0 4px' }}
                    >
                      {WAREHOUSE_TYPE_MAP[area.warehouseType] ?? '未知'}
                    </Tag>
                  </div>
                  <div className="wlm-warehouse-meta">
                    <span>编码: {area.areaCode}</span>
                    {area.address && <span>地址: {area.address}</span>}
                  </div>
                </div>
                <div className="wlm-warehouse-actions" onClick={e => e.stopPropagation()}>
                  <DeleteOutlined
                    className="wlm-action-icon"
                    style={{ color: 'var(--color-danger)', marginRight: 6 }}
                    onClick={(e) => onDeleteArea(area.id, area.areaName, e)}
                  />
                  <Switch
                    size="small"
                    checked={area.status === 'ACTIVE'}
                    onChange={checked => onToggleArea(area.id, checked)}
                  />
                </div>
              </div>
            ))
          )}
        </Spin>
      </div>
    </div>
  );
};

export default WarehouseSidebar;
