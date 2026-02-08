import React from 'react';
import { Card, Table, Tag, Space } from 'antd';
import ResizableModal from '@/components/common/ResizableModal';
import { ProductionOrderHeader, StyleCoverThumb } from '@/components/StyleAssets';
import { toNumberSafe } from '@/utils/api';
import { formatDateTime } from '@/utils/datetime';
import { ProductWarehousing as WarehousingType } from '@/types/production';
import { OrderLineWarehousingRow } from '../types';
import { useWarehousingData } from '../hooks/useWarehousingData';
import { getQualityStatusConfig, getDefectCategoryLabel, getDefectRemarkLabel } from '../utils';

interface IndependentDetailModalProps {
  open: boolean;
  warehousingNo: string;
  summary: WarehousingType | null;
  onClose: () => void;
  openPreview: (url: string, title: string) => void;
}

const IndependentDetailModal: React.FC<IndependentDetailModalProps> = ({
  open,
  warehousingNo: propWarehousingNo,
  summary,
  onClose,
  openPreview,
}) => {
  const whNo = String(propWarehousingNo || '').trim();

  // Shared hook handles all data fetching and derived computations
  const {
    entryWarehousing,
    orderDetail,
    entryLoading,
    orderDetailLoading,
    orderLineWarehousingRows,
    imageUrls,
  } = useWarehousingData({
    warehousingNo: whNo,
    summary,
    enabled: open && Boolean(whNo),
    onError: onClose,
  });

  // Viewport logic replacement
  const detailPopupWidth = typeof window !== 'undefined' ? window.innerWidth * 0.9 : 1000;
  const detailPopupInitialHeight = typeof window !== 'undefined' ? window.innerHeight * 0.85 : 800;

  // Cast ResizableModal to any to avoid prop type errors
  const ResizableModalAny = ResizableModal as any;

  return (
    <ResizableModalAny
      title="质检入库详情"
      open={open}
      onCancel={onClose}
      footer={null}
      width={detailPopupWidth}
      initialHeight={detailPopupInitialHeight}
      scaleWithViewport
      destroyOnHidden
      styles={{
        body: {
          height: 'calc(100% - 56px)',
          display: 'flex',
          flexDirection: 'column',
        },
      }}
    >
      <div style={{ flex: 1, minHeight: 0 }}>
        <Card size="small" className="order-flow-detail" style={{ marginTop: 0, height: '100%' }} loading={entryLoading}>
          <div style={{ marginBottom: 12 }}>
            <ProductionOrderHeader
              order={orderDetail || entryWarehousing}
              orderNo={String(orderDetail?.orderNo || entryWarehousing?.orderNo || '').trim()}
              styleNo={String(orderDetail?.styleNo || entryWarehousing?.styleNo || '').trim()}
              styleName={String(orderDetail?.styleName || entryWarehousing?.styleName || '').trim()}
              styleId={orderDetail?.styleId || entryWarehousing?.styleId}
              styleCover={orderDetail?.styleCover || entryWarehousing?.styleCover || null}
              color={String(orderDetail?.color || entryWarehousing?.color || '').trim()}
              totalQuantity={toNumberSafe(orderDetail?.orderQuantity)}
              coverSize={160}
              qrSize={120}
            />
          </div>
          <div className="order-flow-section">
            <div className="order-flow-section-title">本次质检入库</div>
            <div className="order-flow-summary-top">
              <div className="order-flow-summary-left">
                <StyleCoverThumb
                  styleId={entryWarehousing?.styleId}
                  styleNo={entryWarehousing?.styleNo}
                  src={orderDetail?.styleCover || entryWarehousing?.styleCover || null}
                  size={84}
                  borderRadius={12}
                />
                <div className="order-flow-summary-meta">
                  <div className="order-flow-summary-title-row">
                    <div className="order-flow-summary-title">{String(entryWarehousing?.warehousingNo || whNo || '').trim() || '-'}</div>
                    {(() => {
                      const s = String(entryWarehousing?.qualityStatus || '').trim();
                      if (!s) return null;
                      const { text, color } = getQualityStatusConfig(s);
                      return <Tag color={color}>{text}</Tag>;
                    })()}
                  </div>
                  <div className="order-flow-summary-sub">
                    <span>订单号：{String(entryWarehousing?.orderNo || '').trim() || '-'}</span>
                    <span>仓库：{String(entryWarehousing?.warehouse || '').trim() || '-'}</span>
                    <span>质检时间：{String(entryWarehousing?.createTime || '').trim() ? formatDateTime(entryWarehousing?.createTime) : '-'}</span>
                    <span>完成时间：{String(entryWarehousing?.warehousingEndTime || '').trim() ? formatDateTime(entryWarehousing?.warehousingEndTime) : '-'}</span>
                  </div>
                </div>
              </div>

              <div className="order-flow-metrics">
                <div className="order-flow-metric">
                  <div className="order-flow-metric-label">质检数量</div>
                  <div className="order-flow-metric-value">{toNumberSafe(entryWarehousing?.warehousingQuantity)}</div>
                </div>
                <div className="order-flow-metric">
                  <div className="order-flow-metric-label">合格数量</div>
                  <div className="order-flow-metric-value">{toNumberSafe(entryWarehousing?.qualifiedQuantity)}</div>
                </div>
                <div className="order-flow-metric">
                  <div className="order-flow-metric-label">不合格数量</div>
                  <div className="order-flow-metric-value">{toNumberSafe(entryWarehousing?.unqualifiedQuantity)}</div>
                </div>
              </div>
            </div>
          </div>

          <div className="order-flow-section" style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            <div className="order-flow-section-title">下单详细信息</div>
            <div style={{ flex: 1, minHeight: 0 }}>
              <Table<OrderLineWarehousingRow>
                size="small"
                rowKey="key"
                loading={orderDetailLoading}
                pagination={false}
                dataSource={orderLineWarehousingRows}
                sticky
                scroll={{ x: 920 }}
                columns={[
                  { title: '订单号', dataIndex: 'orderNo', key: 'orderNo', width: 170, render: (v: string) => <span className="order-no-wrap">{v || '-'}</span> },
                  { title: '款号', dataIndex: 'styleNo', key: 'styleNo', width: 140, ellipsis: true },
                  { title: '颜色', dataIndex: 'color', key: 'color', width: 120, ellipsis: true },
                  { title: '数量', dataIndex: 'quantity', key: 'quantity', width: 90, align: 'right' as const },
                  { title: '码数', dataIndex: 'size', key: 'size', width: 120, ellipsis: true },
                  { title: '已入库数', dataIndex: 'warehousedQuantity', key: 'warehousedQuantity', width: 110, align: 'right' as const },
                  { title: '未入库数', dataIndex: 'unwarehousedQuantity', key: 'unwarehousedQuantity', width: 110, align: 'right' as const },
                ]}
                summary={(pageData) => {
                  const totals = pageData.reduce(
                    (acc, r) => {
                      acc.quantity += r.quantity;
                      acc.warehousedQuantity += r.warehousedQuantity;
                      acc.unwarehousedQuantity += r.unwarehousedQuantity;
                      return acc;
                    },
                    { quantity: 0, warehousedQuantity: 0, unwarehousedQuantity: 0 }
                  );
                  return (
                    <Table.Summary>
                      <Table.Summary.Row>
                        <Table.Summary.Cell index={0}>汇总</Table.Summary.Cell>
                        <Table.Summary.Cell index={1} />
                        <Table.Summary.Cell index={2} />
                        <Table.Summary.Cell index={3} align="right">{totals.quantity}</Table.Summary.Cell>
                        <Table.Summary.Cell index={4} />
                        <Table.Summary.Cell index={5} align="right">{totals.warehousedQuantity}</Table.Summary.Cell>
                        <Table.Summary.Cell index={6} align="right">{totals.unwarehousedQuantity}</Table.Summary.Cell>
                      </Table.Summary.Row>
                    </Table.Summary>
                  );
                }}
              />
            </div>
          </div>
          <div className="order-flow-section">
            <div className="order-flow-section-title">不合格信息</div>
            <div style={{ padding: 12 }}>
              <div className="order-flow-field" style={{ marginBottom: 10 }}>
                <div className="order-flow-field-label">次品类别</div>
                <div className="order-flow-field-value">{getDefectCategoryLabel(entryWarehousing?.defectCategory)}</div>
              </div>
              <div className="order-flow-field" style={{ marginBottom: 10 }}>
                <div className="order-flow-field-label">处理方式</div>
                <div className="order-flow-field-value">{getDefectRemarkLabel(entryWarehousing?.defectRemark)}</div>
              </div>
              <div className="order-flow-field" style={{ marginBottom: 10 }}>
                <div className="order-flow-field-label">返修备注</div>
                <div className="order-flow-field-value">{String(entryWarehousing?.repairRemark || '').trim() || '-'}</div>
              </div>

              {imageUrls.length ? (
                <Space wrap size={10}>
                  {imageUrls.map((url) => (
                    <img
                      key={url}
                      src={url}
                      alt=""
                      width={84}
                      height={84}
                      style={{ objectFit: 'cover', cursor: 'pointer' }}
                      onClick={() => openPreview(url, '图片预览')}
                    />
                  ))}
                </Space>
              ) : (
                <div style={{ color: 'rgba(0,0,0,0.45)' }}>-</div>
              )}
            </div>
          </div>
        </Card>
      </div>
    </ResizableModalAny>
  );
};

export default IndependentDetailModal;
