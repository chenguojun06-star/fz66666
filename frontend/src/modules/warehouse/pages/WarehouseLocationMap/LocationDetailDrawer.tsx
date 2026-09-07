// 库位详情抽屉 - 显示库位信息和库存明细
import React from 'react';
import { Drawer, Empty, Spin, Tag, Row, Col, Button } from 'antd';
import { ImportOutlined, ExportOutlined, SwapOutlined } from '@ant-design/icons';
import { StyleCoverThumb } from '@/components/StyleAssets';
import type { LocationItem, LocationSkuItem } from './types';

/** D-228：三种库位明细表共用的图片单元格（无图时组件回退为款号/编码占位） */
const ItemThumb: React.FC<{ sku: LocationSkuItem }> = ({ sku }) => (
  <div className="wlm-detail-td wlm-detail-td--image">
    <StyleCoverThumb
      src={sku.imageUrl || null}
      styleNo={sku.styleNo || sku.materialCode}
      color={sku.color}
      size={40}
      borderRadius={4}
    />
  </div>
);

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
            {selectedLocation.warehouseType === 'MATERIAL' && (
              <Button
                type="primary"
                icon={<ImportOutlined />}
                onClick={onOpenInbound}
              >
                物料入库
              </Button>
            )}
            {selectedLocation.warehouseType === 'FINISHED' && selectedLocation.usedCapacity > 0 && (
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
            ) : selectedLocation.warehouseType === 'MATERIAL' ? (
              <div className="wlm-detail-table wlm-detail-table--material" style={{ marginTop: 16 }}>
                <div className="wlm-detail-table-header">
                  <div className="wlm-detail-th">图片</div>
                  <div className="wlm-detail-th">物料编码</div>
                  <div className="wlm-detail-th">物料名称</div>
                  <div className="wlm-detail-th">类型</div>
                  <div className="wlm-detail-th">规格</div>
                  <div className="wlm-detail-th" style={{ textAlign: 'right' }}>库存数量</div>
                </div>
                {locationItems.map((sku, idx) => (
                  <div key={idx} className="wlm-detail-tr">
                    <ItemThumb sku={sku} />
                    <div className="wlm-detail-td" title={sku.materialCode || '-'}>{sku.materialCode || '-'}</div>
                    <div className="wlm-detail-td" title={sku.materialName || '-'}>{sku.materialName || '-'}</div>
                    <div className="wlm-detail-td" title={sku.materialType || '-'}>{sku.materialType || '-'}</div>
                    <div className="wlm-detail-td" title={sku.specifications || '-'}>{sku.specifications || '-'}</div>
                    <div className="wlm-detail-td" style={{ textAlign: 'right', color: 'var(--color-success)', fontWeight: 500 }}>
                      {sku.stockQuantity ?? 0}{sku.unit ? ` ${sku.unit}` : ''}
                    </div>
                  </div>
                ))}
              </div>
            ) : selectedLocation.warehouseType === 'SAMPLE' ? (
              <div className="wlm-detail-table wlm-detail-table--sample" style={{ marginTop: 16 }}>
                <div className="wlm-detail-table-header">
                  <div className="wlm-detail-th">图片</div>
                  <div className="wlm-detail-th">款号</div>
                  <div className="wlm-detail-th">款式名称</div>
                  <div className="wlm-detail-th">颜色</div>
                  <div className="wlm-detail-th">尺码</div>
                  <div className="wlm-detail-th" style={{ textAlign: 'right' }}>库存数量</div>
                </div>
                {locationItems.map((sku, idx) => (
                  <div key={idx} className="wlm-detail-tr">
                    <ItemThumb sku={sku} />
                    <div className="wlm-detail-td" title={sku.styleNo || '-'}>{sku.styleNo || '-'}</div>
                    <div className="wlm-detail-td" title={sku.styleName || '-'}>{sku.styleName || '-'}</div>
                    <div className="wlm-detail-td">
                      <Tag color="blue">{sku.color || '-'}</Tag>
                    </div>
                    <div className="wlm-detail-td" title={sku.size || '-'}>
                      <Tag>{sku.size || '-'}</Tag>
                    </div>
                    <div className="wlm-detail-td" style={{ textAlign: 'right', color: 'var(--color-success)', fontWeight: 500 }}>
                      {sku.stockQuantity ?? 0}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="wlm-detail-table wlm-detail-table--finished" style={{ marginTop: 16 }}>
                <div className="wlm-detail-table-header">
                  <div className="wlm-detail-th">图片</div>
                  <div className="wlm-detail-th">款号</div>
                  <div className="wlm-detail-th">颜色</div>
                  <div className="wlm-detail-th">尺码</div>
                  <div className="wlm-detail-th">商品编码</div>
                  <div className="wlm-detail-th" style={{ textAlign: 'right' }}>库存数量</div>
                  <div className="wlm-detail-th" style={{ textAlign: 'right' }}>单价</div>
                </div>
                {locationItems.map((sku, idx) => (
                  <div key={idx} className="wlm-detail-tr">
                    <ItemThumb sku={sku} />
                    <div className="wlm-detail-td" title={sku.styleNo || '-'}>{sku.styleNo || '-'}</div>
                    <div className="wlm-detail-td">
                      <Tag color="blue">{sku.color || '-'}</Tag>
                    </div>
                    <div className="wlm-detail-td" title={sku.size || '-'}>
                      <Tag>{sku.size || '-'}</Tag>
                    </div>
                    <div className="wlm-detail-td" title={sku.skuCode} style={{ fontSize: 14, color: 'var(--color-text-secondary)' }}>
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
