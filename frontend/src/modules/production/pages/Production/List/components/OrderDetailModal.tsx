/**
 * OrderDetailModal - 订单详情弹窗（简化版）
 * 功能：显示订单基本信息、SKU表格、生产进度
 */
import React, { useMemo } from 'react';
import { Table } from 'antd';
import ResizableModal from '@/components/common/ResizableModal';
import QRCodeBox from '@/components/common/QRCodeBox';
import { StyleCoverThumb } from '@/components/StyleAssets';
import { ProductionOrder } from '@/types/production';
import { formatDateTime } from '@/utils/datetime';
import { parseProductionOrderLines, toNumberSafe } from '@/utils/api';

interface OrderDetailModalProps {
  visible: boolean;
  order: ProductionOrder | null;
  onClose: () => void;
  isMobile?: boolean;
}

const safeString = (value: any, defaultValue: string = '-') => {
  const str = String(value || '').trim();
  return str || defaultValue;
};

const OrderDetailModal: React.FC<OrderDetailModalProps> = ({
  visible,
  order,
  onClose,
  isMobile = false,
}) => {
  // 解析SKU数据
  const { skuRows, totalOrder, totalWarehoused, colors, sizes } = useMemo(() => {
    if (!order) return { skuRows: [], totalOrder: 0, totalWarehoused: 0, colors: '', sizes: '' };

    const lines = parseProductionOrderLines(order, { includeWarehousedQuantity: true });
    const map = new Map();

    lines.forEach(line => {
      const color = safeString(line?.color, '');
      const size = safeString(line?.size, '');
      if (!color || !size) return;

      const key = `${color}|||${size}`;
      const prev = map.get(key);
      map.set(key, {
        color,
        size,
        orderQuantity: (prev?.orderQuantity || 0) + (Number(line?.quantity) || 0),
        warehousedQuantity: (prev?.warehousedQuantity || 0) + (Number(line?.warehousedQuantity) || 0),
      });
    });

    const rows = Array.from(map.values()).map(r => ({
      key: `${r.color}|||${r.size}`,
      sku: `${r.color}-${r.size}`,
      ...r,
    }));

    const totalOrder = rows.reduce((acc, r) => acc + r.orderQuantity, 0);
    const totalWarehoused = rows.reduce((acc, r) => acc + r.warehousedQuantity, 0);

    const colorSet = new Set(rows.map(r => r.color));
    const sizeSet = new Set(rows.map(r => r.size));

    return {
      skuRows: rows,
      totalOrder,
      totalWarehoused,
      colors: Array.from(colorSet).join('、'),
      sizes: Array.from(sizeSet).join('、'),
    };
  }, [order]);

  if (!order) return null;

  return (
    <ResizableModal
      title="生产订单详情"
      visible={visible}
      onCancel={onClose}
      footer={null}
      defaultWidth={isMobile ? '95vw' : '60vw'}
      defaultHeight={isMobile ? '90vh' : '70vh'}
    >
      <div style={{ display: 'flex', gap: 16, marginBottom: 16 }}>
        {/* 左侧：图片和二维码 */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
          <StyleCoverThumb
            styleNo={order.styleNo}
            size={isMobile ? 120 : 160}
            borderRadius={6}
          />
          {order.qrCode && (
            <QRCodeBox
              value={order.qrCode}
              label="订单扫码"
              variant="primary"
              size={isMobile ? 100 : 120}
            />
          )}
        </div>

        {/* 右侧：订单信息 */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>
              {order.orderNo}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8, fontSize: 13 }}>
              <div><span style={{ color: 'var(--neutral-text-secondary)' }}>款号：</span>{order.styleNo}</div>
              <div><span style={{ color: 'var(--neutral-text-secondary)' }}>款名：</span>{order.styleName}</div>
              <div><span style={{ color: 'var(--neutral-text-secondary)' }}>加工厂：</span>{order.factoryName || '-'}</div>
              <div><span style={{ color: 'var(--neutral-text-secondary)' }}>颜色：</span>{colors}</div>
              <div><span style={{ color: 'var(--neutral-text-secondary)' }}>尺码：</span>{sizes}</div>
              <div><span style={{ color: 'var(--neutral-text-secondary)' }}>订单数量：</span>{order.orderQuantity}</div>
              <div><span style={{ color: 'var(--neutral-text-secondary)' }}>入库数量：</span>{totalWarehoused}</div>
              <div><span style={{ color: 'var(--neutral-text-secondary)' }}>生产进度：</span>{order.productionProgress}%</div>
              <div><span style={{ color: 'var(--neutral-text-secondary)' }}>创建时间：</span>{formatDateTime(order.createTime)}</div>
              <div><span style={{ color: 'var(--neutral-text-secondary)' }}>预计出货：</span>{formatDateTime(order.expectedShipDate)}</div>
            </div>
          </div>

          {/* 备注 */}
          {order.remarks && (
            <div style={{
              padding: 8,
              background: '#f5f5f5',
              borderRadius: 4,
              fontSize: 12,
              marginTop: 8
            }}>
              <div style={{ color: 'var(--neutral-text-secondary)', marginBottom: 4 }}>备注：</div>
              <div>{order.remarks}</div>
            </div>
          )}
        </div>
      </div>

      {/* SKU表格 */}
      {skuRows.length > 0 && (
        <div>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>SKU明细</div>
          <Table
            dataSource={skuRows}
            rowKey="key"
            size="small"
            pagination={false}
            scroll={{ y: 300 }}
            columns={[
              { title: 'SKU', dataIndex: 'sku', key: 'sku', width: 120 },
              { title: '颜色', dataIndex: 'color', key: 'color', width: 80 },
              { title: '尺码', dataIndex: 'size', key: 'size', width: 60 },
              { title: '订单量', dataIndex: 'orderQuantity', key: 'orderQuantity', width: 80, align: 'right' },
              { title: '入库量', dataIndex: 'warehousedQuantity', key: 'warehousedQuantity', width: 80, align: 'right' },
            ]}
            summary={() => (
              <Table.Summary fixed>
                <Table.Summary.Row>
                  <Table.Summary.Cell index={0} colSpan={3}>
                    <strong>合计</strong>
                  </Table.Summary.Cell>
                  <Table.Summary.Cell index={1} align="right">
                    <strong>{totalOrder}</strong>
                  </Table.Summary.Cell>
                  <Table.Summary.Cell index={2} align="right">
                    <strong>{totalWarehoused}</strong>
                  </Table.Summary.Cell>
                </Table.Summary.Row>
              </Table.Summary>
            )}
          />
        </div>
      )}
    </ResizableModal>
  );
};

export default OrderDetailModal;
