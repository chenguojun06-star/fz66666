import React from 'react';
import { Button, Card, Collapse, Space, Tag } from 'antd';

import ResizableTable from '@/components/common/ResizableTable';
import { ProductionOrderHeader } from '@/components/StyleAssets';
import { MaterialPurchase as MaterialPurchaseType, ProductionOrder } from '@/types/production';
import { getMaterialTypeCategory, getMaterialTypeLabel } from '@/utils/materialType';
import { formatDateTime } from '@/utils/datetime';
import { MATERIAL_PURCHASE_STATUS } from '@/constants/business';
import { getStatusConfig, buildColorSummary, getOrderQtyTotal } from '../../utils';

// 已回料确认行的样式
const confirmedRowStyle = `
  .row-confirmed-disabled {
    background-color: #f5f5f5 !important;
    color: #999 !important;
  }
  .row-confirmed-disabled:hover {
    background-color: #e8e8e8 !important;
  }
  .row-confirmed-disabled .ant-tag {
    opacity: 0.6;
  }
  .row-confirmed-disabled .ant-btn-link {
    color: #999 !important;
  }
`;

interface PurchaseDetailViewProps {
  currentPurchase: MaterialPurchaseType | null;
  detailOrder: ProductionOrder | null;
  detailOrderLines: Array<{ color: string; size: string; quantity: number }>;
  detailPurchases: MaterialPurchaseType[];
  detailLoading: boolean;
  detailSizePairs: Array<{ size: string; quantity: number }>;
  detailFrozen: boolean;
  isMobile: boolean;
  isSupervisorOrAbove: boolean;
  sortField: string;
  sortOrder: 'asc' | 'desc';
  onSort: (field: string, order: 'asc' | 'desc') => void;
  onReceive: (record: MaterialPurchaseType) => void;
  onConfirmReturn: (record: MaterialPurchaseType) => void;
  onReturnReset: (record: MaterialPurchaseType) => void;
  onReceiveAll: () => void;
  onBatchReturn: () => void;
  isOrderFrozenForRecord: (record?: Record<string, unknown> | null) => boolean;
}

const PurchaseDetailView: React.FC<PurchaseDetailViewProps> = ({
  currentPurchase,
  detailOrder,
  detailOrderLines,
  detailPurchases,
  detailLoading,
  detailSizePairs,
  detailFrozen,
  isMobile,
  isSupervisorOrAbove,
  sortField: _sortField,
  sortOrder: _sortOrder,
  onSort: _onSort,
  onReceive,
  onConfirmReturn,
  onReturnReset,
  onReceiveAll,
  onBatchReturn,
  isOrderFrozenForRecord,
}) => {
  const normalizeStatus = (status?: MaterialPurchaseType['status'] | string) => String(status || '').trim().toLowerCase();

  return (
    <div className="purchase-detail-view">
      <style>{confirmedRowStyle}</style>
      <ProductionOrderHeader
        orderNo={currentPurchase?.orderNo}
        styleNo={currentPurchase?.styleNo}
        styleName={currentPurchase?.styleName}
        styleId={currentPurchase?.styleId}
        styleCover={currentPurchase?.styleCover}
        color={String(detailOrder?.color || currentPurchase?.color || '').trim() || buildColorSummary(detailOrderLines) || ''}
        sizeItems={detailSizePairs.map((x) => ({ size: x.size, quantity: x.quantity }))}
        totalQuantity={getOrderQtyTotal(detailOrderLines)}
        coverSize={160}
      />

      <Card
        size="small"
        title="需要采购的面辅料（只读）"
        loading={detailLoading}
        extra={
          <Space>
            <Button
              size="small"
              type="primary"
              disabled={detailFrozen || !detailPurchases.some((p) => normalizeStatus(p.status) === MATERIAL_PURCHASE_STATUS.PENDING)}
              onClick={onReceiveAll}
            >
              一键领取全部
            </Button>
            <Button
              size="small"
              disabled={detailFrozen || !detailPurchases.some((p) => {
                const status = normalizeStatus(p.status);
                return status === MATERIAL_PURCHASE_STATUS.RECEIVED
                  || status === MATERIAL_PURCHASE_STATUS.PARTIAL
                  || status === MATERIAL_PURCHASE_STATUS.COMPLETED;
              })}
              onClick={onBatchReturn}
            >
              批量回料确认
            </Button>
          </Space>
        }
      >
        {(() => {
          const sections = ([
            { key: 'fabric', title: '面料' },
            { key: 'lining', title: '里料' },
            { key: 'accessory', title: '辅料' },
          ] as const)
            .map((sec) => {
              const data = detailPurchases.filter((p) => getMaterialTypeCategory(p.materialType) === sec.key);
              return { ...sec, data };
            })
            .filter((x) => x.data.length > 0);

          const items = sections.map((sec) => ({
            key: sec.key,
            label: `${sec.title}（${sec.data.length}）`,
            children: (
              <ResizableTable<MaterialPurchaseType>
                rowKey={(r: MaterialPurchaseType) => String(r.id || `${r.purchaseNo}-${r.materialType}-${r.materialCode}`)}
                dataSource={sec.data}
                pagination={false}
                size={isMobile ? 'small' : 'middle'}
                scroll={{ x: 'max-content' }}
                rowClassName={(record: MaterialPurchaseType) => {
                  // 已回料确认的行显示为灰色
                  const isConfirmed = Number(record?.returnConfirmed || 0) === 1;
                  return isConfirmed ? 'row-confirmed-disabled' : '';
                }}
                columns={[
                  {
                    title: '类型',
                    dataIndex: 'materialType',
                    key: 'materialType',
                    width: 110,
                    render: (v: unknown) => {
                      const type = String(v || '').trim();
                      const category = getMaterialTypeCategory(type);
                      const text = getMaterialTypeLabel(type);
                      const color = category === 'accessory' ? 'purple' : category === 'lining' ? 'cyan' : 'geekblue';
                      return <Tag color={color}>{text}</Tag>;
                    },
                  },
                  { title: '物料编码', dataIndex: 'materialCode', key: 'materialCode', width: 120, render: (v: unknown) => v || '-' },
                  { title: '物料名称', dataIndex: 'materialName', key: 'materialName', width: 180, ellipsis: true, render: (v: unknown) => v || '-' },
                  { title: '规格', dataIndex: 'specifications', key: 'specifications', width: 140, ellipsis: true, render: (v: unknown) => v || '-' },
                  { title: '单位', dataIndex: 'unit', key: 'unit', width: 80, render: (v: unknown) => v || '-' },
                  { title: '采购数量', dataIndex: 'purchaseQuantity', key: 'purchaseQuantity', width: 110, align: 'right' as const, render: (v: unknown) => Number(v) || 0 },
                  { title: '到货数量', dataIndex: 'arrivedQuantity', key: 'arrivedQuantity', width: 110, align: 'right' as const, render: (v: unknown) => Number(v) || 0 },
                  {
                    title: '单价(元)',
                    dataIndex: 'unitPrice',
                    key: 'unitPrice',
                    width: 110,
                    align: 'right' as const,
                    render: (v: unknown) => {
                      const n = Number(v);
                      return Number.isFinite(n) ? n.toFixed(2) : '-';
                    },
                  },
                  {
                    title: '金额(元)',
                    dataIndex: 'totalAmount',
                    key: 'totalAmount',
                    width: 120,
                    align: 'right' as const,
                    render: (v: any, r: any) => {
                      const qty = Number(r?.arrivedQuantity ?? 0);
                      const price = Number(r?.unitPrice);
                      if (Number.isFinite(qty) && Number.isFinite(price)) return (qty * price).toFixed(2);
                      const n = Number(v);
                      return Number.isFinite(n) ? n.toFixed(2) : '-';
                    },
                  },
                  { title: '供应商', dataIndex: 'supplierName', key: 'supplierName', width: 140, ellipsis: true, render: (v: unknown) => v || '-' },
                  {
                    title: '状态',
                    dataIndex: 'status',
                    key: 'status',
                    width: 100,
                    render: (status: MaterialPurchaseType['status']) => {
                      const { text, color } = getStatusConfig(status);
                      return <Tag color={color}>{text}</Tag>;
                    },
                  },
                  {
                    title: '回料时间',
                    dataIndex: 'returnConfirmTime',
                    key: 'returnConfirmTime',
                    width: 160,
                    render: (v: any, r: any) => (Number(r?.returnConfirmed || 0) === 1 ? (formatDateTime(v) || '-') : '-'),
                  },
                  { title: '备注', dataIndex: 'remark', key: 'remark', width: 220, ellipsis: true, render: (v: unknown) => v || '-' },
                  {
                    title: '确认',
                    key: 'confirm',
                    width: 140,
                    render: (_: any, record: MaterialPurchaseType) => {
                      const frozen = isOrderFrozenForRecord(record);
                      const status = normalizeStatus(record.status);
                      return (
                        <Space size={4}>
                          <Button
                            type="link"
                            size="small"
                            disabled={frozen || status !== MATERIAL_PURCHASE_STATUS.PENDING}
                            onClick={() => onReceive(record)}
                          >
                            领取
                          </Button>
                          <Button
                            type="link"
                            size="small"
                            disabled={
                              frozen
                              || !(status === MATERIAL_PURCHASE_STATUS.RECEIVED || status === MATERIAL_PURCHASE_STATUS.PARTIAL || status === MATERIAL_PURCHASE_STATUS.COMPLETED)
                              || Number(record?.returnConfirmed || 0) === 1
                            }
                            onClick={() => onConfirmReturn(record)}
                          >
                            {Number(record?.returnConfirmed || 0) === 1 ? '已回料' : '回料确认'}
                          </Button>
                          {Number(record?.returnConfirmed || 0) === 1 && (
                            <Button
                              type="link"
                              size="small"
                              disabled={frozen || !isSupervisorOrAbove}
                              onClick={() => onReturnReset(record)}
                            >
                              退回
                            </Button>
                          )}
                        </Space>
                      );
                    },
                  },
                ]}
              />
            ),
          }));

          if (!items.length) return null;

          return (
            <Collapse
              size="small"
              collapsible="icon"
              items={items}
            />
          );
        })()}
      </Card>
    </div>
  );
};

export default PurchaseDetailView;
