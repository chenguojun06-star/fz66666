// 主区域头部 - 仓库信息 + 统计卡片
import React from 'react';
import { Tag, Statistic, Row, Col } from 'antd';
import { EnvironmentOutlined } from '@ant-design/icons';
import { WAREHOUSE_TYPE_MAP } from './types';
import type { WarehouseAreaItem, LocationItem } from './types';

interface Props {
  selectedArea: WarehouseAreaItem | undefined;
  areaOverview: any;
  overviewLoading: boolean;
  locations: LocationItem[];
}

const WarehouseStats: React.FC<Props> = ({
  selectedArea,
  areaOverview,
  overviewLoading,
  locations,
}) => {
  if (!selectedArea) return null;
  return (
    <div className="wlm-main-header">
      <div className="wlm-header-left">
        <div className="wlm-header-title">
          <EnvironmentOutlined style={{ color: 'var(--color-primary)', marginRight: 8 }} />
          {selectedArea.areaName}
          <Tag color={selectedArea.warehouseType === 'FINISHED' ? 'blue' : selectedArea.warehouseType === 'MATERIAL' ? 'green' : 'orange'} style={{ marginLeft: 8 }}>
            {WAREHOUSE_TYPE_MAP[selectedArea.warehouseType] ?? '未知'}
          </Tag>
        </div>
        <div className="wlm-header-subtitle">
          {selectedArea.address || '实际库存数，用于店铺售卖的库存，订单发货后扣减'}
        </div>
      </div>
      <div className="wlm-header-stats">
        <Row gutter={24}>
          <Col>
            <Statistic
              title="总库位"
              value={areaOverview?.totalLocations || locations.length}
              suffix="个"
              styles={{ content: { color: 'var(--color-primary)', fontSize: 15, fontWeight: 600 } }}
              loading={overviewLoading}
            />
          </Col>
          <Col>
            <Statistic
              title="已使用"
              value={areaOverview?.usedLocations || locations.filter(l => l.usedCapacity > 0).length}
              suffix="个"
              styles={{ content: { color: 'var(--color-success)', fontSize: 15, fontWeight: 600 } }}
              loading={overviewLoading}
            />
          </Col>
        </Row>
      </div>
    </div>
  );
};

export default WarehouseStats;
