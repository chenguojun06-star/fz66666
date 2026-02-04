import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { Card, Table, Tag, message, Space } from 'antd';
import ResizableModal from '@/components/common/ResizableModal';
import { ProductionOrderHeader, StyleCoverThumb } from '@/components/StyleAssets';
import api, { fetchProductionOrderDetail, parseProductionOrderLines, toNumberSafe } from '@/utils/api';
import { formatDateTime } from '@/utils/datetime';
import { useModal } from '@/hooks/useModal';
import { ProductWarehousing as WarehousingType, ProductionOrder } from '@/types/production';
import { CuttingBundleRow, OrderLine } from '../types';
import { getQualityStatusConfig, getDefectCategoryLabel, getDefectRemarkLabel, parseUrlsValue } from '../utils';

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

  // 使用 useModal 管理主入库数据
  const entryModal = useModal<WarehousingType>();
  
  // 其他数据容器保持 useState（非模态状态）
  const [popupBundles, setPopupBundles] = useState<CuttingBundleRow[]>([]);
  const [popupOrderDetailLoading, setPopupOrderDetailLoading] = useState(false);
  const [popupOrderDetail, setPopupOrderDetail] = useState<ProductionOrder | null>(null);
  const [popupOrderWarehousingRecords, setPopupOrderWarehousingRecords] = useState<any[]>([]);

  // Viewport logic replacement
  const detailPopupWidth = typeof window !== 'undefined' ? window.innerWidth * 0.9 : 1000;
  const detailPopupInitialHeight = typeof window !== 'undefined' ? window.innerHeight * 0.85 : 800;

  const popupBundleByQr = useMemo(() => {
    const m = new Map<string, CuttingBundleRow>();
    for (const b of Array.isArray(popupBundles) ? popupBundles : []) {
      const qr = String(b.qrCode || '').trim();
      if (!qr) continue;
      if (!m.has(qr)) m.set(qr, b);
    }
    return m;
  }, [popupBundles]);

  const popupOrderLineWarehousingRows = useMemo(() => {
    const orderNo = String((popupOrderDetail as any)?.orderNo || (entryModal.data as any)?.orderNo || '').trim();
    const styleNo = String((popupOrderDetail as any)?.styleNo || (entryModal.data as any)?.styleNo || '').trim();
    const lines = parseProductionOrderLines(popupOrderDetail) as OrderLine[];
    if (!lines.length) return [] as Array<{
      key: string;
      orderNo: string;
      styleNo: string;
      color: string;
      size: string;
      quantity: number;
      warehousedQuantity: number;
      unwarehousedQuantity: number;
    }>;

    const warehousedByKey = new Map<string, number>();
    for (const r of Array.isArray(popupOrderWarehousingRecords) ? popupOrderWarehousingRecords : []) {
      if (!r) continue;
      const qs = String(r?.qualityStatus || '').trim().toLowerCase();
      if (qs && qs !== 'qualified') continue;
      const q = toNumberSafe(r?.qualifiedQuantity);
      if (q <= 0) continue;
      const hasWarehouse = Boolean(String(r?.warehouse || '').trim());
      if (!hasWarehouse) continue;

      const qr = String(r?.cuttingBundleQrCode || r?.qrCode || '').trim();
      const b = qr ? popupBundleByQr.get(qr) : undefined;
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
  }, [popupBundleByQr, entryModal.data, popupOrderDetail, popupOrderWarehousingRecords]);

  const fetchPopupBundlesByOrderNo = useCallback(async (orderNo: string) => {
    const on = String(orderNo || '').trim();
    if (!on) {
      setPopupBundles([]);
      return;
    }
    try {
      const res = await api.get<{ code: number; data: { records: CuttingBundleRow[]; total: number } }>('/production/cutting/list', {
        params: { page: 1, pageSize: 10000, orderNo: on },
      });
      if (res.code === 200) {
        setPopupBundles((res.data?.records || []) as CuttingBundleRow[]);
      } else {
        setPopupBundles([]);
      }
    } catch {
      setPopupBundles([]);
    }
  }, []);

  useEffect(() => {
    if (!open) {
      entryModal.close();
      setPopupBundles([]);
      setPopupOrderDetailLoading(false);
      setPopupOrderDetail(null);
      setPopupOrderWarehousingRecords([]);
      return;
    }
    if (!whNo) return;

    let cancelled = false;
    const run = async () => {
      entryModal.setLoading(true);
      setPopupOrderDetailLoading(false);
      try {
        const stateSummary = summary;
        if (stateSummary && String((stateSummary as any)?.warehousingNo || '').trim() === whNo) {
          entryModal.open(stateSummary);
        } else {
          entryModal.close();
        }

        const res = await api.get<{ code: number; data: { records: WarehousingType[]; total: number } }>('/production/warehousing/list', {
          params: {
            page: 1,
            pageSize: 10000,
            warehousingNo: whNo,
          },
        });
        if (res.code !== 200) {
          throw new Error((res as any).message || '获取质检入库详情失败');
        }
        const records = (res.data?.records || []) as WarehousingType[];
        if (!records.length) {
          throw new Error('未找到质检入库详情');
        }
        if (cancelled) return;

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
          qualityStatus: totals.hasUnqualified
            ? 'unqualified'
            : (String(base?.qualityStatus || '').trim() === 'unqualified' ? 'unqualified' : 'qualified'),
        } as WarehousingType;

        entryModal.open(merged);

        const resolvedOrderNo = String((merged as any)?.orderNo || '').trim() || String((records as any)?.[0]?.orderNo || '').trim();
        if (resolvedOrderNo) {
          await fetchPopupBundlesByOrderNo(resolvedOrderNo);
        } else {
          setPopupBundles([]);
        }

        const resolvedOrderId = String((merged as any)?.orderId || '').trim();
        if (resolvedOrderId) {
          setPopupOrderDetailLoading(true);
          try {
            const detail = await fetchProductionOrderDetail(resolvedOrderId, { acceptAnyData: true });
            if (!cancelled) {
              setPopupOrderDetail((detail || null) as unknown as ProductionOrder | null);
            }
          } catch {
            if (!cancelled) setPopupOrderDetail(null);
          } finally {
            if (!cancelled) setPopupOrderDetailLoading(false);
          }

          try {
            const whRes = await api.get<{ code: number; data: { records: WarehousingType[]; total: number } }>('/production/warehousing/list', {
              params: { page: 1, pageSize: 10000, orderId: resolvedOrderId },
            });
            if (!cancelled) {
              const list = (whRes?.data?.records || []) as any[];
              setPopupOrderWarehousingRecords(Array.isArray(list) ? list : []);
            }
          } catch {
            if (!cancelled) {
              setPopupOrderWarehousingRecords([]);
            }
          }
        } else {
          setPopupOrderDetailLoading(false);
          setPopupOrderDetail(null);
          setPopupOrderWarehousingRecords([]);
        }
      } catch (e: unknown) {
        if (!cancelled) {
          message.error((e as Error)?.message || '获取质检入库详情失败');
          entryModal.close();
          setPopupBundles([]);
          setPopupOrderDetail(null);
          setPopupOrderWarehousingRecords([]);
        }
      } finally {
        if (!cancelled) {
          entryModal.setLoading(false);
        }
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [fetchPopupBundlesByOrderNo, summary, open, whNo]);

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
        <Card size="small" className="order-flow-detail" style={{ marginTop: 0, height: '100%' }} loading={entryModal.loading}>
          <div style={{ marginBottom: 12 }}>
            <ProductionOrderHeader
              order={popupOrderDetail || (entryModal.data as any)}
              orderNo={String((popupOrderDetail as any)?.orderNo || (entryModal.data as any)?.orderNo || '').trim()}
              styleNo={String((popupOrderDetail as any)?.styleNo || (entryModal.data as any)?.styleNo || '').trim()}
              styleName={String((popupOrderDetail as any)?.styleName || (entryModal.data as any)?.styleName || '').trim()}
              styleId={(popupOrderDetail as any)?.styleId || (entryModal.data as any)?.styleId}
              styleCover={(popupOrderDetail as any)?.styleCover || (entryModal.data as any)?.styleCover || null}
              color={String((popupOrderDetail as any)?.color || (entryModal.data as any)?.color || '').trim()}
              totalQuantity={toNumberSafe((popupOrderDetail as any)?.orderQuantity)}
              coverSize={160}
              qrSize={120}
            />
          </div>
          <div className="order-flow-section">
            <div className="order-flow-section-title">本次质检入库</div>
            <div className="order-flow-summary-top">
              <div className="order-flow-summary-left">
                <StyleCoverThumb
                  styleId={(entryModal.data as any)?.styleId}
                  styleNo={(entryModal.data as any)?.styleNo}
                  src={(popupOrderDetail as any)?.styleCover || (entryModal.data as any)?.styleCover || null}
                  size={84}
                  borderRadius={12}
                />
                <div className="order-flow-summary-meta">
                  <div className="order-flow-summary-title-row">
                    <div className="order-flow-summary-title">{String((entryModal.data as any)?.warehousingNo || whNo || '').trim() || '-'}</div>
                    {(() => {
                      const s = String((entryModal.data as any)?.qualityStatus || '').trim();
                      if (!s) return null;
                      const { text, color } = getQualityStatusConfig(s as any);
                      return <Tag color={color}>{text}</Tag>;
                    })()}
                  </div>
                  <div className="order-flow-summary-sub">
                    <span>订单号：{String((entryModal.data as any)?.orderNo || '').trim() || '-'}</span>
                    <span>仓库：{String((entryModal.data as any)?.warehouse || '').trim() || '-'}</span>
                    <span>质检时间：{String((entryModal.data as any)?.createTime || '').trim() ? formatDateTime((entryModal.data as any)?.createTime) : '-'}</span>
                    <span>完成时间：{String((entryModal.data as any)?.warehousingEndTime || '').trim() ? formatDateTime((entryModal.data as any)?.warehousingEndTime) : '-'}</span>
                  </div>
                </div>
              </div>

              <div className="order-flow-metrics">
                <div className="order-flow-metric">
                  <div className="order-flow-metric-label">质检数量</div>
                  <div className="order-flow-metric-value">{toNumberSafe((entryModal.data as any)?.warehousingQuantity)}</div>
                </div>
                <div className="order-flow-metric">
                  <div className="order-flow-metric-label">合格数量</div>
                  <div className="order-flow-metric-value">{toNumberSafe((entryModal.data as any)?.qualifiedQuantity)}</div>
                </div>
                <div className="order-flow-metric">
                  <div className="order-flow-metric-label">不合格数量</div>
                  <div className="order-flow-metric-value">{toNumberSafe((entryModal.data as any)?.unqualifiedQuantity)}</div>
                </div>
              </div>
            </div>
          </div>

          <div className="order-flow-section" style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            <div className="order-flow-section-title">下单详细信息</div>
            <div style={{ flex: 1, minHeight: 0 }}>
              <Table
                size="small"
                rowKey="key"
                loading={popupOrderDetailLoading}
                pagination={false}
                dataSource={popupOrderLineWarehousingRows}
                sticky
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
          </div>
          <div className="order-flow-section">
            <div className="order-flow-section-title">不合格信息</div>
            <div style={{ padding: 12 }}>
              <div className="order-flow-field" style={{ marginBottom: 10 }}>
                <div className="order-flow-field-label">次品类别</div>
                <div className="order-flow-field-value">{getDefectCategoryLabel((entryModal.data as any)?.defectCategory)}</div>
              </div>
              <div className="order-flow-field" style={{ marginBottom: 10 }}>
                <div className="order-flow-field-label">处理方式</div>
                <div className="order-flow-field-value">{getDefectRemarkLabel((entryModal.data as any)?.defectRemark)}</div>
              </div>
              <div className="order-flow-field" style={{ marginBottom: 10 }}>
                <div className="order-flow-field-label">返修备注</div>
                <div className="order-flow-field-value">{String((entryModal.data as any)?.repairRemark || '').trim() || '-'}</div>
              </div>

              {(() => {
                const urls = parseUrlsValue((entryModal.data as any)?.unqualifiedImageUrls);
                if (!urls.length) return <div style={{ color: 'rgba(0,0,0,0.45)' }}>-</div>;
                return (
                  <Space wrap size={10}>
                    {urls.map((url) => (
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
                );
              })()}
            </div>
          </div>
        </Card>
      </div>
    </ResizableModalAny>
  );
};

export default IndependentDetailModal;
