import React, { useMemo, useEffect } from 'react';
import { Button, Card, Space, Table, Tag, message } from 'antd';
import { ColumnsType } from 'antd/es/table';
import Layout from '@/components/Layout';
import { ProductionOrderHeader, StyleCoverThumb } from '@/components/StyleAssets';
import { formatDateTime } from '@/utils/datetime';
import api, { toNumberSafe, parseProductionOrderLines, fetchProductionOrderDetail } from '@/utils/api';
import { paths } from '@/routeConfig';
import { useNavigate, useLocation } from 'react-router-dom';
import { useProductWarehousing } from '../hooks/useProductWarehousing';
import { ProductWarehousing as WarehousingType, ProductionOrder } from '@/types/production';
import { OrderLine, CuttingBundleRow } from '../types';
import { getQualityStatusConfig, getDefectCategoryLabel, getDefectRemarkLabel, parseUrlsValue, toUploadFileList } from '../utils';
import ResizableModal from '@/components/common/ResizableModal';

interface WarehousingDetailProps {
  hook: ReturnType<typeof useProductWarehousing>;
}

const WarehousingDetail: React.FC<WarehousingDetailProps> = ({ hook }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const {
    entryWarehousing,
    setEntryWarehousing,
    entryLoading,
    setEntryLoading,
    detailWarehousingItems,
    setDetailWarehousingItems,
    detailLoading,
    setDetailLoading,
    orderDetail,
    setOrderDetail,
    orderDetailLoading,
    setOrderDetailLoading,
    orderWarehousingRecords,
    setOrderWarehousingRecords,
    routeWarehousingNo,
    bundles,
    setBundles,
    fetchBundlesByOrderNo,
    previewOpen,
    previewUrl,
    previewTitle,
    setPreviewOpen,
    setPreviewUrl,
    setPreviewTitle,
  } = hook;

  // Fetch Logic
  useEffect(() => {
    let cancelled = false;
    const whNo = String(routeWarehousingNo || '').trim();
    if (!whNo) return;

    const run = async () => {
      setEntryLoading(true);
      setDetailLoading(true);
      setOrderDetailLoading(false);
      try {
        const stateSummary = (location.state as any)?.warehousingSummary as WarehousingType | undefined;
        if (stateSummary && String((stateSummary as any)?.warehousingNo || '').trim() === whNo) {
          setEntryWarehousing(stateSummary);
        } else {
          setEntryWarehousing(null);
        }

        const res = await api.get<{ code: number; data: { records: WarehousingType[]; total: number }; message?: string }>('/production/warehousing/list', {
          params: {
            page: 1,
            pageSize: 10000,
            warehousingNo: whNo,
          },
        });
        if (res.code !== 200) {
          throw new Error(res.message || '获取质检入库详情失败');
        }
        const records = (res.data?.records || []) as WarehousingType[];
        if (!records.length) {
          throw new Error('未找到质检入库详情');
        }

        if (cancelled) return;
        setDetailWarehousingItems(records);

        const totals = records.reduce(
          (acc, r: any) => {
            acc.warehousingQuantity += Number(r?.warehousingQuantity || 0) || 0;
            acc.qualifiedQuantity += Number(r?.qualifiedQuantity || 0) || 0;
            acc.unqualifiedQuantity += Number(r?.unqualifiedQuantity || 0) || 0;
            if (String(r?.qualityStatus || '').trim() === 'unqualified') acc.hasUnqualified = true;
            return acc;
          },
          {
            warehousingQuantity: 0,
            qualifiedQuantity: 0,
            unqualifiedQuantity: 0,
            hasUnqualified: false,
          }
        );

        const base = (records[0] || {}) as any;
        const merged = {
          ...(stateSummary && String((stateSummary as any)?.warehousingNo || '').trim() === whNo ? (stateSummary as any) : {}),
          ...base,
          warehousingNo: whNo,
          warehousingQuantity: Math.max(0, totals.warehousingQuantity),
          qualifiedQuantity: Math.max(0, totals.qualifiedQuantity),
          unqualifiedQuantity: Math.max(0, totals.unqualifiedQuantity),
          qualityStatus: totals.hasUnqualified ? 'unqualified' : (String(base?.qualityStatus || '').trim() === 'unqualified' ? 'unqualified' : 'qualified'),
        } as WarehousingType;

        setEntryWarehousing(merged);

        const resolvedOrderNo = String((merged as any)?.orderNo || '').trim() || String((records as any)?.[0]?.orderNo || '').trim();
        if (resolvedOrderNo) {
          await fetchBundlesByOrderNo(resolvedOrderNo);
        } else {
          setBundles([]);
        }

        const resolvedOrderId = String((merged as any)?.orderId || '').trim();
        if (resolvedOrderId) {
          setOrderDetailLoading(true);
          try {
            const detail = await fetchProductionOrderDetail(resolvedOrderId, { acceptAnyData: true });
            if (!cancelled) {
              setOrderDetail((detail || null) as unknown as ProductionOrder | null);
            }
          } catch {
            if (!cancelled) setOrderDetail(null);
          } finally {
            if (!cancelled) setOrderDetailLoading(false);
          }

          try {
            const whRes = await api.get<{ code: number; data: { records: WarehousingType[]; total: number } }>('/production/warehousing/list', {
              params: { page: 1, pageSize: 10000, orderId: resolvedOrderId },
            });
            if (!cancelled) {
              const list = (whRes?.data?.records || []) as any[];
              setOrderWarehousingRecords(Array.isArray(list) ? list : []);
            }
          } catch {
            if (!cancelled) {
              setOrderWarehousingRecords([]);
            }
          }
        } else {
          setOrderDetailLoading(false);
          setOrderDetail(null);
          setOrderWarehousingRecords([]);
        }
      } catch (e: any) {
        if (!cancelled) {
          message.error(e?.message || '获取质检入库详情失败');
          navigate(paths.warehousing, { replace: true });
        }
      } finally {
        if (!cancelled) {
          setEntryLoading(false);
          setDetailLoading(false);
        }
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [routeWarehousingNo]); // Dependency on route param

  // Derived Logic for Detail Page
  const bundleByQrForSummary = useMemo(() => {
    const m = new Map<string, CuttingBundleRow>();
    for (const b of bundles) {
      const qr = String(b.qrCode || '').trim();
      if (!qr) continue;
      m.set(qr, b);
    }
    return m;
  }, [bundles]);

  const orderLineWarehousingRows = useMemo(() => {
    const orderNo = String((orderDetail as any)?.orderNo || (entryWarehousing as any)?.orderNo || '').trim();
    const styleNo = String((orderDetail as any)?.styleNo || (entryWarehousing as any)?.styleNo || '').trim();
    const lines = parseProductionOrderLines(orderDetail) as OrderLine[];
    if (!lines.length) return [];

    const warehousedByKey = new Map<string, number>();
    for (const r of Array.isArray(orderWarehousingRecords) ? orderWarehousingRecords : []) {
      if (!r) continue;
      const qs = String(r?.qualityStatus || '').trim().toLowerCase();
      if (qs && qs !== 'qualified') continue;
      const q = toNumberSafe(r?.qualifiedQuantity);
      if (q <= 0) continue;
      const hasWarehouse = Boolean(String(r?.warehouse || '').trim());
      if (!hasWarehouse) continue;

      const qr = String(r?.cuttingBundleQrCode || r?.qrCode || '').trim();
      const b = qr ? bundleByQrForSummary.get(qr) : undefined;
      const color = String(b?.color || r?.color || r?.colour || '').trim();
      const size = String(b?.size || r?.size || '').trim();
      if (!color || !size) continue;

      const k = `${color}@@${size}`;
      warehousedByKey.set(k, (warehousedByKey.get(k) || 0) + q);
    }

    return lines
      .map((l, idx) => {
        const color = String(l?.color || '').trim();
        const size = String(l?.size || '').trim();
        const quantity = Math.max(0, toNumberSafe(l?.quantity));
        const k = `${color}@@${size}`;
        const warehousedQuantity = Math.max(0, toNumberSafe(warehousedByKey.get(k) || 0));
        const unwarehousedQuantity = Math.max(0, quantity - warehousedQuantity);
        return {
          key: `${idx}-${k}`,
          orderNo: orderNo || '-',
          styleNo: styleNo || '-',
          color: color || '-',
          size: size || '-',
          quantity,
          warehousedQuantity,
          unwarehousedQuantity,
        };
      })
      .sort((a, b) => {
        const byColor = a.color.localeCompare(b.color, 'zh-Hans-CN', { numeric: true });
        if (byColor !== 0) return byColor;
        return a.size.localeCompare(b.size, 'zh-Hans-CN', { numeric: true });
      });
  }, [bundleByQrForSummary, entryWarehousing, orderDetail, orderWarehousingRecords]);

  const warehousingDetailColumns: ColumnsType<WarehousingType> = [
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
      render: (status: any) => {
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

  const imageUrls = useMemo(() => {
    return parseUrlsValue((entryWarehousing as any)?.unqualifiedImageUrls);
  }, [entryWarehousing]);

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
                order={orderDetail || (entryWarehousing as any)}
                orderNo={String((orderDetail as any)?.orderNo || (entryWarehousing as any)?.orderNo || '').trim()}
                styleNo={String((orderDetail as any)?.styleNo || (entryWarehousing as any)?.styleNo || '').trim()}
                styleName={String((orderDetail as any)?.styleName || (entryWarehousing as any)?.styleName || '').trim()}
                styleId={(orderDetail as any)?.styleId || (entryWarehousing as any)?.styleId}
                styleCover={(orderDetail as any)?.styleCover || (entryWarehousing as any)?.styleCover || null}
                color={String((orderDetail as any)?.color || (entryWarehousing as any)?.color || '').trim()}
                totalQuantity={toNumberSafe((orderDetail as any)?.orderQuantity)}
                coverSize={160}
                qrSize={120}
              />
            </div>
            <div className="order-flow-section">
              <div className="order-flow-section-title">本次质检入库</div>
              <div className="order-flow-summary-top">
                <div className="order-flow-summary-left">
                  <StyleCoverThumb
                    styleId={(entryWarehousing as any)?.styleId}
                    styleNo={(entryWarehousing as any)?.styleNo}
                    src={(orderDetail as any)?.styleCover || (entryWarehousing as any)?.styleCover || null}
                    size={84}
                    borderRadius={12}
                  />
                  <div className="order-flow-summary-meta">
                    <div className="order-flow-summary-title-row">
                      <div className="order-flow-summary-title">{String((entryWarehousing as any)?.warehousingNo || routeWarehousingNo || '').trim() || '-'}</div>
                      {(() => {
                        const s = String((entryWarehousing as any)?.qualityStatus || '').trim();
                        if (!s) return null;
                        const { text, color } = getQualityStatusConfig(s);
                        return <Tag color={color}>{text}</Tag>;
                      })()}
                    </div>
                    <div className="order-flow-summary-sub">
                      <span>订单号：{String((entryWarehousing as any)?.orderNo || '').trim() || '-'}</span>
                      <span>仓库：{String((entryWarehousing as any)?.warehouse || '').trim() || '-'}</span>
                      <span>质检时间：{String((entryWarehousing as any)?.createTime || '').trim() ? formatDateTime((entryWarehousing as any)?.createTime) : '-'}</span>
                      <span>完成时间：{String((entryWarehousing as any)?.warehousingEndTime || '').trim() ? formatDateTime((entryWarehousing as any)?.warehousingEndTime) : '-'}</span>
                    </div>
                  </div>
                </div>

                <div className="order-flow-metrics">
                  <div className="order-flow-metric">
                    <div className="order-flow-metric-label">质检数量</div>
                    <div className="order-flow-metric-value">{toNumberSafe((entryWarehousing as any)?.warehousingQuantity)}</div>
                  </div>
                  <div className="order-flow-metric">
                    <div className="order-flow-metric-label">合格数量</div>
                    <div className="order-flow-metric-value">{toNumberSafe((entryWarehousing as any)?.qualifiedQuantity)}</div>
                  </div>
                  <div className="order-flow-metric">
                    <div className="order-flow-metric-label">不合格数量</div>
                    <div className="order-flow-metric-value">{toNumberSafe((entryWarehousing as any)?.unqualifiedQuantity)}</div>
                  </div>
                </div>
              </div>
            </div>

            <div className="order-flow-section">
              <div className="order-flow-section-title">下单详细信息</div>
              <Table
                size="small"
                rowKey="key"
                loading={orderDetailLoading}
                pagination={false}
                dataSource={orderLineWarehousingRows}
                scroll={{ x: 920 }}
                columns={[
                  { title: '订单号', dataIndex: 'orderNo', key: 'orderNo', width: 170, render: (v: unknown) => <span className="order-no-wrap">{String(v || '').trim() || '-'}</span> },
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
                      acc.quantity += toNumberSafe((r as any)?.quantity);
                      acc.warehousedQuantity += toNumberSafe((r as any)?.warehousedQuantity);
                      acc.unwarehousedQuantity += toNumberSafe((r as any)?.unwarehousedQuantity);
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
                <Table
                  size="small"
                  rowKey={(r) => String((r as any)?.id || `${(r as any)?.cuttingBundleQrCode || ''}-${(r as any)?.size || ''}-${(r as any)?.createTime || ''}`)}
                  columns={warehousingDetailColumns}
                  dataSource={detailWarehousingItems}
                  pagination={{ pageSize: 20, showTotal: (total) => `共 ${total} 条`, showSizeChanger: true, pageSizeOptions: ['10', '20', '50', '100'], simple: true }}
                  scroll={{ x: 1520 }}
                />
              </div>

              <div className="order-flow-module">
                <div className="order-flow-module-title">不合格图片</div>
                <div style={{ padding: 12 }}>
                  <div className="order-flow-field" style={{ marginBottom: 10 }}>
                    <div className="order-flow-field-label">次品类别</div>
                    <div className="order-flow-field-value">{getDefectCategoryLabel((entryWarehousing as any)?.defectCategory)}</div>
                  </div>
                  <div className="order-flow-field" style={{ marginBottom: 10 }}>
                    <div className="order-flow-field-label">处理方式</div>
                    <div className="order-flow-field-value">{getDefectRemarkLabel((entryWarehousing as any)?.defectRemark)}</div>
                  </div>
                  <div className="order-flow-field" style={{ marginBottom: 10 }}>
                    <div className="order-flow-field-label">返修备注</div>
                    <div className="order-flow-field-value">{String((entryWarehousing as any)?.repairRemark || '').trim() || '-'}</div>
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
                          style={{ objectFit: 'cover', borderRadius: 10, cursor: 'pointer' }}
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

      <ResizableModal
        open={previewOpen}
        title={previewTitle}
        footer={
          <div className="modal-footer-actions">
            <Button
              onClick={() => {
                setPreviewOpen(false);
                setPreviewUrl('');
                setPreviewTitle('');
              }}
            >
              关闭
            </Button>
          </div>
        }
        onCancel={() => {
          setPreviewOpen(false);
          setPreviewUrl('');
          setPreviewTitle('');
        }}
        width={600}
        minWidth={600}
        minHeight={600}
        initialHeight={600}
      >
        {previewUrl ? (
          <div
            style={{
              width: '100%',
              height: '100%',
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
            }}
          >
            <img
              src={previewUrl}
              alt=""
              style={{
                maxWidth: '100%',
                maxHeight: '100%',
                objectFit: 'contain',
              }}
            />
          </div>
        ) : null}
      </ResizableModal>
    </Layout>
  );
};

export default WarehousingDetail;
