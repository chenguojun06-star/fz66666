import React, { useState, useEffect } from 'react';
import { Card, Table, Tag, Space, Tabs, Typography } from 'antd';
import ResizableModal from '@/components/common/ResizableModal';
import ResizableTable from '@/components/common/ResizableTable';
import { ProductionOrderHeader, StyleCoverThumb } from '@/components/StyleAssets';
import api, { toNumberSafe } from '@/utils/api';
import { getFullAuthedFileUrl } from '@/utils/fileUrl';
import { formatDateTime } from '@/utils/datetime';
import { ProductWarehousing as WarehousingType } from '@/types/production';
import { OrderLineWarehousingRow } from '../types';
import { useWarehousingData } from '../hooks/useWarehousingData';
import { getQualityStatusConfig, getDefectCategoryLabel, getDefectRemarkLabel } from '../utils';
import StyleSizeTab from '@/modules/basic/pages/StyleInfo/components/StyleSizeTab';

const { Title } = Typography;

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

  // Derive styleId/styleNo for production sheet and size chart tabs
  const styleId = orderDetail?.styleId || entryWarehousing?.styleId;
  const _styleNo = String(orderDetail?.styleNo || entryWarehousing?.styleNo || '').trim();
  const plateTypeKey = String((orderDetail as any)?.plateType || (entryWarehousing as any)?.plateType || '').trim().toUpperCase();
  const urgencyKey = String((orderDetail as any)?.urgencyLevel || (entryWarehousing as any)?.urgencyLevel || '').trim().toLowerCase();

  // Fetch style description (生产制单) from style info API
  const [styleDescription, setStyleDescription] = useState('');
  useEffect(() => {
    if (!styleId || !open) { setStyleDescription(''); return; }
    let cancelled = false;
    api.get<{ code: number; data: any }>(`/api/style/info/${styleId}`).then(res => {
      if (!cancelled && res?.data) {
        setStyleDescription(String(res.data.description || '').trim());
      }
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [styleId, open]);

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
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        <Tabs
          defaultActiveKey="inspection"
          style={{ flex: 1, minHeight: 0 }}
          items={[
            {
              key: 'inspection',
              label: '质检信息',
              children: (
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
                    <span>
                      订单号：{String(entryWarehousing?.orderNo || '').trim() || '-'}
                      {(plateTypeKey === 'FIRST') && <Tag color="blue" style={{ marginInlineStart: 6 }}>首</Tag>}
                      {(plateTypeKey === 'REORDER' || plateTypeKey === 'REPLATE') && <Tag color="purple" style={{ marginInlineStart: 6 }}>翻</Tag>}
                      {(urgencyKey === 'urgent') && <Tag color="red" style={{ marginInlineStart: 6 }}>急</Tag>}
                      {(urgencyKey === 'normal') && <Tag style={{ marginInlineStart: 6 }}>普</Tag>}
                    </span>
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
              <ResizableTable<OrderLineWarehousingRow>
                storageKey="independent-detail-main"
                size="small"
                rowKey="key"
                loading={orderDetailLoading}
                pagination={false}
                dataSource={orderLineWarehousingRows}
                sticky
                scroll={{ x: 1040 }}
                style={{ fontSize: 12 }}
                columns={[
                  { title: '订单号', dataIndex: 'orderNo', key: 'orderNo', width: 160 },
                  { title: '款号', dataIndex: 'styleNo', key: 'styleNo', width: 130, ellipsis: true },
                  { title: '颜色', dataIndex: 'color', key: 'color', width: 100 },
                  { title: '尺码', dataIndex: 'size', key: 'size', width: 80 },
                  { title: '下单数', dataIndex: 'quantity', key: 'quantity', width: 90, align: 'right' as const },
                  {
                    title: '已入库', dataIndex: 'warehousedQuantity', key: 'wh', width: 90, align: 'right' as const,
                    render: (v: number) => <span style={{ color: v > 0 ? 'var(--color-success)' : undefined }}>{v}</span>,
                  },
                  {
                    title: '不合格数', dataIndex: 'unqualifiedQuantity', key: 'uq', width: 90, align: 'right' as const,
                    render: (v: number) => v > 0 ? <span style={{ color: 'var(--color-danger)' }}>{v}</span> : <span>0</span>,
                  },
                  {
                    title: '待处理', dataIndex: 'unwarehousedQuantity', key: 'unwh', width: 90, align: 'right' as const,
                    render: (v: number) => <span style={{ color: v > 0 ? 'var(--color-warning)' : 'var(--color-success)' }}>{v}</span>,
                  },
                ]}
                summary={(pageData) => {
                  const totals = pageData.reduce(
                    (acc, r) => ({
                      quantity: acc.quantity + r.quantity,
                      warehousedQuantity: acc.warehousedQuantity + r.warehousedQuantity,
                      unqualifiedQuantity: acc.unqualifiedQuantity + (r.unqualifiedQuantity || 0),
                      unwarehousedQuantity: acc.unwarehousedQuantity + r.unwarehousedQuantity,
                    }),
                    { quantity: 0, warehousedQuantity: 0, unqualifiedQuantity: 0, unwarehousedQuantity: 0 },
                  );
                  return (
                    <Table.Summary>
                      <Table.Summary.Row>
                        <Table.Summary.Cell index={0}><strong>合计</strong></Table.Summary.Cell>
                        <Table.Summary.Cell index={1} />
                        <Table.Summary.Cell index={2} />
                        <Table.Summary.Cell index={3} />
                        <Table.Summary.Cell index={4} align="right"><strong>{totals.quantity}</strong></Table.Summary.Cell>
                        <Table.Summary.Cell index={5} align="right">
                          <strong style={{ color: 'var(--color-success)' }}>{totals.warehousedQuantity}</strong>
                        </Table.Summary.Cell>
                        <Table.Summary.Cell index={6} align="right">
                          <strong style={{ color: totals.unqualifiedQuantity > 0 ? 'var(--color-danger)' : undefined }}>
                            {totals.unqualifiedQuantity}
                          </strong>
                        </Table.Summary.Cell>
                        <Table.Summary.Cell index={7} align="right">
                          <strong style={{ color: totals.unwarehousedQuantity > 0 ? 'var(--color-warning)' : 'var(--color-success)' }}>
                            {totals.unwarehousedQuantity}
                          </strong>
                        </Table.Summary.Cell>
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
                      src={getFullAuthedFileUrl(url)}
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
              ),
            },
            {
              key: 'production-sheet',
              label: '生产制单',
              children: (
                <Card size="small" style={{ height: '100%' }}>
                  {(() => {
                    if (!styleDescription) {
                      return (
                        <div style={{ textAlign: 'center', padding: 40, color: 'rgba(0,0,0,0.45)' }}>
                          暂无生产制单数据
                        </div>
                      );
                    }
                    const rawLines = styleDescription.split(/\r?\n/).map(s => s.replace(/^\d+[.、\s]+/, '').trim()).filter(Boolean);
                    const fixedRows = Array.from({ length: Math.max(15, rawLines.length) }, (_, i) => ({
                      key: i, seq: i + 1, content: rawLines[i] || '',
                    }));
                    return (
                      <>
                        <Title level={5} style={{ marginBottom: 12 }}>生产要求</Title>
                        <ResizableTable
                          storageKey="independent-detail-requirements"
                          size="small" rowKey="key" pagination={false}
                          dataSource={fixedRows}
                          style={{ fontSize: 12 }}
                          columns={[
                            { title: '序号', dataIndex: 'seq', key: 'seq', width: 60, align: 'center' as const },
                            { title: '内容', dataIndex: 'content', key: 'content' },
                          ]}
                        />
                      </>
                    );
                  })()}
                </Card>
              ),
            },
            {
              key: 'size-chart',
              label: '📏 尺寸表',
              children: (
                <Card size="small" style={{ height: '100%' }}>
                  {styleId ? (
                    <StyleSizeTab styleId={styleId} readOnly simpleView />
                  ) : (
                    <div style={{ textAlign: 'center', padding: 40, color: 'rgba(0,0,0,0.45)' }}>
                      暂无尺寸表数据
                    </div>
                  )}
                </Card>
              ),
            },
          ]}
        />
      </div>
    </ResizableModalAny>
  );
};

export default IndependentDetailModal;
