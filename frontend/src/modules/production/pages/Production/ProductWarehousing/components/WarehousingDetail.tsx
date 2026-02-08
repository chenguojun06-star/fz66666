import React from 'react';
import { Button, Card, Space, Table, Tag } from 'antd';
import { ColumnsType } from 'antd/es/table';
import Layout from '@/components/Layout';
import { ProductionOrderHeader, StyleCoverThumb } from '@/components/StyleAssets';
import { formatDateTime } from '@/utils/datetime';
import { toNumberSafe } from '@/utils/api';
import { paths } from '@/routeConfig';
import { useNavigate, useLocation } from 'react-router-dom';
import { useProductWarehousing } from '../hooks/useProductWarehousing';
import { useWarehousingData } from '../hooks/useWarehousingData';
import { ProductWarehousing as WarehousingType } from '@/types/production';
import { WarehousingDetailRecord, OrderLineWarehousingRow } from '../types';
import { getQualityStatusConfig, getDefectCategoryLabel, getDefectRemarkLabel } from '../utils';
import ImagePreviewModal from '@/components/common/ImagePreviewModal';

interface WarehousingDetailProps {
  hook: ReturnType<typeof useProductWarehousing>;
}

const WarehousingDetail: React.FC<WarehousingDetailProps> = ({ hook }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const {
    routeWarehousingNo,
    previewOpen,
    previewUrl,
    previewTitle,
    setPreviewOpen,
    setPreviewUrl,
    setPreviewTitle,
  } = hook;

  // Get summary from navigation state
  const locationSummary = (location.state as Record<string, unknown>)?.warehousingSummary as WarehousingType | undefined;

  // Shared hook handles all data fetching and derived computations
  const {
    entryWarehousing,
    detailItems,
    orderDetail,
    entryLoading,
    detailLoading,
    orderDetailLoading,
    orderLineWarehousingRows,
    imageUrls,
  } = useWarehousingData({
    warehousingNo: routeWarehousingNo,
    summary: locationSummary || null,
    enabled: Boolean(routeWarehousingNo),
    onError: () => navigate(paths.warehousing, { replace: true }),
  });

  const warehousingDetailColumns: ColumnsType<WarehousingDetailRecord> = [
    { title: '菲号', dataIndex: 'cuttingBundleQrCode', key: 'cuttingBundleQrCode', width: 260, ellipsis: true, render: (v: unknown) => String(v || '').trim() || '-' },
    { title: '扎号', dataIndex: 'cuttingBundleNo', key: 'cuttingBundleNo', width: 90, align: 'right', render: (v: unknown) => toNumberSafe(v) || '-' },
    { title: '尺码', dataIndex: 'size', key: 'size', width: 110, render: (v: unknown) => String(v || '').trim() || '-' },
    { title: '质检数量', dataIndex: 'warehousingQuantity', key: 'warehousingQuantity', width: 110, align: 'right', render: (v: unknown) => toNumberSafe(v) },
    { title: '合格', dataIndex: 'qualifiedQuantity', key: 'qualifiedQuantity', width: 90, align: 'right', render: (v: unknown) => toNumberSafe(v) },
    { title: '不合格', dataIndex: 'unqualifiedQuantity', key: 'unqualifiedQuantity', width: 90, align: 'right', render: (v: unknown) => toNumberSafe(v) },
    {
      title: '质检',
      dataIndex: 'qualityStatus',
      key: 'qualityStatus',
      width: 110,
      render: (status: unknown) => {
        const s = String(status || '').trim();
        if (!s) return '-';
        const { text, color } = getQualityStatusConfig(s);
        return <Tag color={color}>{text}</Tag>;
      },
    },
    { title: '仓库', dataIndex: 'warehouse', key: 'warehouse', width: 120, render: (v: unknown) => String(v || '').trim() || '-' },
    { title: '入库人员', dataIndex: 'warehousingOperatorName', key: 'warehousingOperatorName', width: 120, render: (v: unknown) => String(v || '').trim() || '-' },
    { title: '入库开始', dataIndex: 'warehousingStartTime', key: 'warehousingStartTime', width: 170, render: (v: unknown) => (String(v || '').trim() ? formatDateTime(v) : '-') },
    { title: '入库完成', dataIndex: 'warehousingEndTime', key: 'warehousingEndTime', width: 170, render: (v: unknown) => (String(v || '').trim() ? formatDateTime(v) : '-') },
    { title: '质检时间', dataIndex: 'createTime', key: 'createTime', width: 170, render: (v: unknown) => (String(v || '').trim() ? formatDateTime(v) : '-') },
    { title: '次品类别', dataIndex: 'defectCategory', key: 'defectCategory', width: 150, ellipsis: true, render: (v: unknown) => getDefectCategoryLabel(v) },
    { title: '处理方式', dataIndex: 'defectRemark', key: 'defectRemark', width: 110, ellipsis: true, render: (v: unknown) => getDefectRemarkLabel(v) },
    { title: '返修备注', dataIndex: 'repairRemark', key: 'repairRemark', ellipsis: true, render: (v: unknown) => String(v || '').trim() || '-' },
  ];

  return (
    <Layout>
      <div className="production-list-page">
        <Card className="page-card">
          <div className="page-header">
            <h2 className="page-title">质检入库详情</h2>
            <Space wrap>
              <Button type="primary" onClick={() => navigate(paths.warehousing, { replace: true })}>
                返回
              </Button>
            </Space>
          </div>

          <Card size="small" className="order-flow-detail" style={{ marginTop: 12 }} loading={entryLoading}>
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
                      <div className="order-flow-summary-title">{String(entryWarehousing?.warehousingNo || routeWarehousingNo || '').trim() || '-'}</div>
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

            <div className="order-flow-section">
              <div className="order-flow-section-title">下单详细信息</div>
              <Table<OrderLineWarehousingRow>
                size="small"
                rowKey="key"
                loading={orderDetailLoading}
                pagination={false}
                dataSource={orderLineWarehousingRows}
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
          </Card>

          <Card size="small" className="order-flow-tabs-card" style={{ marginTop: 12 }} loading={entryLoading || detailLoading}>
            <div className="order-flow-module-stack">
              <div className="order-flow-module">
                <div className="order-flow-module-title">明细记录</div>
                <Table<WarehousingDetailRecord>
                  size="small"
                  rowKey={(r) => String(r.id || `${r.cuttingBundleQrCode || ''}-${r.size || ''}-${r.createTime || ''}`)}
                  columns={warehousingDetailColumns}
                  dataSource={detailItems}
                  pagination={{ pageSize: 20, showTotal: (total) => `共 ${total} 条`, showSizeChanger: true, pageSizeOptions: ['10', '20', '50', '100'], simple: true }}
                  scroll={{ x: 1520 }}
                />
              </div>

              <div className="order-flow-module">
                <div className="order-flow-module-title">不合格图片</div>
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
                          onClick={() => {
                            setPreviewUrl(url);
                            setPreviewTitle('图片预览');
                            setPreviewOpen(true);
                          }}
                        />
                      ))}
                    </Space>
                  ) : (
                    <div style={{ color: 'rgba(0,0,0,0.45)' }}>-</div>
                  )}
                </div>
              </div>
            </div>
          </Card>
        </Card>
      </div>

      <ImagePreviewModal
        open={previewOpen}
        imageUrl={previewUrl}
        title={previewTitle}
        onClose={() => {
          setPreviewOpen(false);
          setPreviewUrl('');
          setPreviewTitle('');
        }}
      />
    </Layout>
  );
};

export default WarehousingDetail;
