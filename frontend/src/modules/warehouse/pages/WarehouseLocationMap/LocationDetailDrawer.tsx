// 库位详情抽屉 - 显示库位信息和库存明细
import React from 'react';
import { Drawer, Empty, Spin, Tag, Row, Col, Button } from 'antd';
import { ImportOutlined, ExportOutlined, SwapOutlined } from '@ant-design/icons';
import type { LocationItem, LocationSkuItem } from './types';

interface Props {
  open: boolean;
  onClose: () => void;
  selectedLocation: LocationItem | null;
  locationItems: LocationSkuItem[];
  locationItemsLoading: boolean;
  onOpenInbound: () => void;
  onOpenOutbound: () => void;
  onOpenTransfer: () => void;
}

const LocationDetailDrawer: React.FC<Props> = ({
  open,
  onClose,
  selectedLocation,
  locationItems,
  locationItemsLoading,
  onOpenInbound,
  onOpenOutbound,
  onOpenTransfer,
}) => {
  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={selectedLocation ? `库位 ${selectedLocation.locationCode} - 库存详情` : '库存详情'}
      size="large"
      styles={{ wrapper: { width: '85%' } }}
      destroyOnHidden
    >
      {selectedLocation && (
        <div className="wlm-detail-content">
          <Row gutter={16} style={{ marginBottom: 16 }}>
            <Col span={6}>
              <div className="wlm-detail-label">库位编码</div>
              <div className="wlm-detail-value">{selectedLocation.locationCode}</div>
            </Col>
            <Col span={6}>
              <div className="wlm-detail-label">库位名称</div>
              <div className="wlm-detail-value">{selectedLocation.locationName || '-'}</div>
            </Col>
            <Col span={6}>
              <div className="wlm-detail-label">库区</div>
              <div className="wlm-detail-value">{selectedLocation.zoneName || '-'}</div>
            </Col>
            <Col span={6}>
              <div className="wlm-detail-label">容量</div>
              <div className="wlm-detail-value" style={{ color: 'var(--color-primary)', fontWeight: 600 }}>
                {selectedLocation.usedCapacity}/{selectedLocation.capacity || '∞'}
              </div>
            </Col>
          </Row>

          <div style={{ marginBottom: 16, display: 'flex', gap: 8 }}>
            <Button
              type="primary"
              icon={<ImportOutlined />}
              onClick={onOpenInbound}
            >
              入库
            </Button>
            {selectedLocation.usedCapacity > 0 && (
              <Button
                type="default"
                icon={<ExportOutlined />}
                onClick={onOpenOutbound}
              >
                出库
              </Button>
            )}
            {selectedLocation.usedCapacity > 0 && (
              <Button
                icon={<SwapOutlined />}
                onClick={onOpenTransfer}
              >
                转移库存
              </Button>
            )}
          </div>

          <Spin spinning={locationItemsLoading}>
            {locationItems.length === 0 && !locationItemsLoading ? (
              <Empty description="该库位暂无库存" />
            ) : (
              <div className="wlm-detail-table" style={{ marginTop: 16 }}>
                <div className="wlm-detail-table-header">
                  <div className="wlm-detail-th">款号</div>
                  <div className="wlm-detail-th">颜色</div>
                  <div className="wlm-detail-th">尺码</div>
                  <div className="wlm-detail-th">SKU编码</div>
                  <div className="wlm-detail-th" style={{ textAlign: 'right' }}>库存数量</div>
                  <div className="wlm-detail-th" style={{ textAlign: 'right' }}>单价</div>
                </div>
                {locationItems.map((sku, idx) => (
                  <div key={idx} className="wlm-detail-tr">
                    <div className="wlm-detail-td">{sku.styleNo || '-'}</div>
                    <div className="wlm-detail-td">
                      <Tag color="blue">{sku.color || '-'}</Tag>
                    </div>
                    <div className="wlm-detail-td">
                      <Tag>{sku.size || '-'}</Tag>
                    </div>
                    <div className="wlm-detail-td" style={{ fontSize: 14, color: 'var(--color-text-secondary)' }}>
                      {sku.skuCode}
                    </div>
                    <div className="wlm-detail-td" style={{ textAlign: 'right', color: 'var(--color-success)', fontWeight: 500 }}>
                      {sku.stockQuantity}
                    </div>
                    <div className="wlm-detail-td" style={{ textAlign: 'right', fontWeight: 500 }}>
                      ¥{sku.salesPrice?.toFixed(2) || sku.costPrice?.toFixed(2) || '-'}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Spin>
        </div>
      )}
    </Drawer>
  );
};

export default LocationDetailDrawer;
