import React, { useState, useEffect, useCallback } from 'react';
import { Button, Card, Collapse, Space, Tag, Image, Spin, Tooltip, Upload } from 'antd';
import { FileImageOutlined, PlusOutlined, LoadingOutlined, DeleteOutlined } from '@ant-design/icons';
import type { RcFile } from 'antd/es/upload/interface';
import api from '@/utils/api';

import MaterialTypeTag from '@/components/common/MaterialTypeTag';
import ResizableTable from '@/components/common/ResizableTable';
import SupplierNameTooltip from '@/components/common/SupplierNameTooltip';
import { ProductionOrderHeader } from '@/components/StyleAssets';
import { MaterialPurchase as MaterialPurchaseType, ProductionOrder } from '@/types/production';
import { formatMaterialSpecWidth, getMaterialTypeCategory } from '@/utils/materialType';
import { formatDateTime } from '@/utils/datetime';
import { getFullAuthedFileUrl } from '@/utils/fileUrl';
import { MATERIAL_PURCHASE_STATUS } from '@/constants/business';
import { getStatusConfig, buildColorSummary, getOrderQtyTotal, formatMaterialQuantity, formatReferenceKilograms } from '../../utils';

interface PurchaseDocRecord {
  id: string;
  imageUrl: string;
  uploaderName: string;
  createTime: string;
  matchCount: number;
  totalRecognized: number;
}

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
  onQualityIssue: (record: MaterialPurchaseType) => void;
  onReceiveAll: () => void;
  onBatchReturn: () => void;
  isSamplePurchase: boolean;
  isOrderFrozenForRecord: (record?: Record<string, unknown> | null) => boolean;
  onWarehousePick?: (record: MaterialPurchaseType, pickQty: number) => void;
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
  onQualityIssue,
  onReceiveAll,
  onBatchReturn,
  isSamplePurchase,
  isOrderFrozenForRecord,
  onWarehousePick,
}) => {
  const normalizeStatus = (status?: MaterialPurchaseType['status'] | string) => String(status || '').trim().toLowerCase();
  const [docList, setDocList] = useState<PurchaseDocRecord[]>([]);
  const [docsLoading, setDocsLoading] = useState(false);

  // ── 发票/单据上传（复用 PurchaseCreateForm 同款上传逻辑） ──
  // invoiceUrls 从 currentPurchase.invoiceUrls（JSON字符串）解析，本地维护可编辑副本
  const parseInvoiceUrls = (raw?: string | null): string[] => {
    if (!raw) return [];
    try { return JSON.parse(raw) as string[]; }
    catch { return raw.split(',').map((s) => s.trim()).filter(Boolean); }
  };

  const [invoiceUrls, setInvoiceUrls] = useState<string[]>(() =>
    parseInvoiceUrls((currentPurchase as any)?.invoiceUrls)
  );
  const [invoiceUploading, setInvoiceUploading] = useState(false);
  const [stockMap, setStockMap] = useState<Record<string, number>>({});

  // currentPurchase 切换时同步解析
  useEffect(() => {
    setInvoiceUrls(parseInvoiceUrls((currentPurchase as any)?.invoiceUrls));
  }, [currentPurchase?.id]);

  const beforeInvoiceUpload = (file: RcFile) => {
    const ok = ['image/jpeg', 'image/jpg', 'image/png'].includes(file.type);
    if (!ok) { void import('@/utils/antdStatic').then(({ message }) => message.error('只能上传 JPG/PNG 图片')); return false; }
    const lt5m = file.size / 1024 / 1024 < 5;
    if (!lt5m) { void import('@/utils/antdStatic').then(({ message }) => message.error('图片不能超过 5MB')); return false; }
    return true;
  };

  const handleInvoiceUpload = async (options: any) => {
    const { file, onSuccess, onError } = options;
    setInvoiceUploading(true);
    const formData = new FormData();
    formData.append('file', file);
    try {
      const res = await api.post('/common/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      }) as any;
      if (res?.code === 200 && res?.data) {
        const url: string = typeof res.data === 'string' ? res.data : (res.data?.url ?? '');
        const next = [...invoiceUrls, url];
        setInvoiceUrls(next);
        // 持久化保存到后端
        await api.post('/production/purchase/update-invoice-urls', {
          purchaseId: currentPurchase?.id,
          invoiceUrls: JSON.stringify(next),
        }).catch(() => { /* 非致命，本地已更新 */ });
        onSuccess(res);
      } else {
        onError(new Error(res?.message || '上传失败'));
      }
    } catch (err) {
      onError(err);
    } finally {
      setInvoiceUploading(false);
    }
  };

  const handleInvoiceDelete = async (url: string) => {
    const next = invoiceUrls.filter((u) => u !== url);
    setInvoiceUrls(next);
    await api.post('/production/purchase/update-invoice-urls', {
      purchaseId: currentPurchase?.id,
      invoiceUrls: JSON.stringify(next),
    }).catch(() => { /* 非致命 */ });
  };

  const loadDocs = useCallback(async () => {
    if (!currentPurchase?.orderNo) return;
    setDocsLoading(true);
    try {
      const res = await api.get<PurchaseDocRecord[]>(
        `/production/purchase/docs?orderNo=${encodeURIComponent(currentPurchase.orderNo)}`
      );
      setDocList(Array.isArray(res) ? res : []);
    } catch (_e) {
      // silent
    } finally {
      setDocsLoading(false);
    }
  }, [currentPurchase?.orderNo]);

  useEffect(() => {
    loadDocs();
  }, [loadDocs]);

  useEffect(() => {
    const orderNo = String(currentPurchase?.orderNo || '').trim();
    const styleNo = String(currentPurchase?.styleNo || '').trim();
    if (orderNo && orderNo !== '-') {
      api.get<any>('/production/purchase/smart-receive-preview', { params: { orderNo } })
        .then((res: any) => {
          const materials: any[] = res?.data?.materials || res?.materials || [];
          const map: Record<string, number> = {};
          materials.forEach((m: any) => { if (m.purchaseId != null) map[String(m.purchaseId)] = Number(m.availableStock ?? 0); });
          setStockMap(map);
        })
        .catch(() => setStockMap({}));
      return;
    }
    if (styleNo && styleNo !== '-') {
      api.get<any>('/production/purchase/smart-receive-preview', { params: { styleNo } })
        .then((res: any) => {
          const materials: any[] = res?.data?.materials || res?.materials || [];
          const map: Record<string, number> = {};
          materials.forEach((m: any) => { if (m.purchaseId != null) map[String(m.purchaseId)] = Number(m.availableStock ?? 0); });
          setStockMap(map);
        })
        .catch(() => setStockMap({}));
      return;
    }
    setStockMap({});
  }, [currentPurchase?.orderNo, currentPurchase?.styleNo]);

  return (
    <div className="purchase-detail-view">
      <style>{confirmedRowStyle}</style>
      <ProductionOrderHeader
        order={detailOrder}
        orderLines={detailOrderLines}
        orderNo={currentPurchase?.orderNo}
        styleNo={currentPurchase?.styleNo}
        styleName={currentPurchase?.styleName}
        styleId={currentPurchase?.styleId}
        styleCover={currentPurchase?.styleCover}
        color={String(detailOrder?.color || currentPurchase?.color || '').trim() || buildColorSummary(detailOrderLines) || ''}
        sizeItems={detailSizePairs.map((x) => ({ size: x.size, quantity: x.quantity }))}
        totalQuantity={getOrderQtyTotal(detailOrderLines)}
        showOrderNo={!isSamplePurchase}
        hideEmptyColor={isSamplePurchase}
        hideSizeBlockWhenNoRealSize={isSamplePurchase}
        coverSize={80}
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
              采购全部
            </Button>
            <Button
              size="small"
              disabled={detailFrozen || !detailPurchases.some((p) => {
                const status = normalizeStatus(p.status);
                return (status === MATERIAL_PURCHASE_STATUS.RECEIVED
                  || status === MATERIAL_PURCHASE_STATUS.PARTIAL
                  || status === MATERIAL_PURCHASE_STATUS.COMPLETED)
                  && Number(p?.returnConfirmed || 0) !== 1;
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
                    title: '物料类型',
                    dataIndex: 'materialType',
                    key: 'materialType',
                    width: 110,
                    render: (v: unknown) => <MaterialTypeTag value={v} />,
                  },
                  { title: '物料编码', dataIndex: 'materialCode', key: 'materialCode', width: 120, render: (v: unknown) => v || '-' },
                  { title: '物料名称', dataIndex: 'materialName', key: 'materialName', width: 180, ellipsis: true, render: (v: unknown) => v || '-' },
                  { title: '规格/幅宽', key: 'specWidth', width: 140, ellipsis: true, render: (_: unknown, r: MaterialPurchaseType) => formatMaterialSpecWidth(r.specifications, r.fabricWidth) },
                  { title: '单位', dataIndex: 'unit', key: 'unit', width: 80, render: (v: unknown) => v || '-' },
                  { title: '采购数量', dataIndex: 'purchaseQuantity', key: 'purchaseQuantity', width: 110, align: 'right' as const, render: (v: unknown) => formatMaterialQuantity(v) },
                  { title: '参考公斤数', key: 'referenceKilograms', width: 120, align: 'right' as const, render: (_: unknown, r: MaterialPurchaseType) => formatReferenceKilograms(r.purchaseQuantity, r.conversionRate, r.unit) },
                  { title: '到货数量', dataIndex: 'arrivedQuantity', key: 'arrivedQuantity', width: 110, align: 'right' as const,
                    render: (v: unknown, r: MaterialPurchaseType) => {
                      const qty = Number(v ?? 0);
                      const purchased = Number(r.purchaseQuantity ?? 0);
                      const canReceive = purchased > qty;
                      return (
                        <span
                          style={{
                            color: canReceive ? '#1890ff' : undefined,
                            cursor: canReceive ? 'pointer' : undefined,
                            textDecoration: canReceive ? 'underline' : undefined,
                          }}
                          title={canReceive ? '点击到货入库' : undefined}
                          onClick={() => { if (canReceive) onReceive(r); }}
                        >
                          {formatMaterialQuantity(v)}
                        </span>
                      );
                    },
                  },
                  {
                    title: '仓库库存',
                    key: 'warehouseStock',
                    width: 90,
                    align: 'right' as const,
                    render: (_: unknown, r: MaterialPurchaseType) => {
                      const stock = stockMap[String(r.id)];
                      if (stock == null) return <span style={{ color: '#bbb' }}>-</span>;
                      const hasStock = stock > 0;
                      return (
                        <span
                          style={{
                            color: hasStock ? '#1890ff' : '#bbb',
                            cursor: hasStock ? 'pointer' : undefined,
                            textDecoration: hasStock ? 'underline' : undefined,
                          }}
                          title={hasStock ? '点击出库领取' : undefined}
                          onClick={() => {
                            if (hasStock && onWarehousePick) {
                              const pickQty = Math.min(stock, Number(r.purchaseQuantity || 0));
                              onWarehousePick(r, pickQty);
                            }
                          }}
                        >
                          {stock}{r.unit ? ` ${r.unit}` : ''}
                        </span>
                      );
                    },
                  },
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
                  {
                    title: '供应商',
                    dataIndex: 'supplierName',
                    key: 'supplierName',
                    width: 140,
                    ellipsis: true,
                    render: (_: unknown, record: MaterialPurchaseType) => (
                      <SupplierNameTooltip
                        name={record.supplierName}
                        contactPerson={(record as any).supplierContactPerson}
                        contactPhone={(record as any).supplierContactPhone}
                      />
                    ),
                  },
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
                    title: '操作',
                    key: 'confirm',
                    width: 220,
                    render: (_: any, record: MaterialPurchaseType) => {
                      const frozen = isOrderFrozenForRecord(record);
                      const status = normalizeStatus(record.status);
                      const stock = stockMap[String(record.id)];
                      const hasStock = stock != null && stock > 0;
                      const isWarehousePending = status === MATERIAL_PURCHASE_STATUS.WAREHOUSE_PENDING;
                      return (
                        <Space size={4}>
                          {isWarehousePending ? (
                            <Tag color="blue">待仓库出库</Tag>
                          ) : (
                            <Button
                              type="link"
                              size="small"
                              disabled={frozen || status !== MATERIAL_PURCHASE_STATUS.PENDING}
                              onClick={() => {
                                if (hasStock && onWarehousePick) {
                                  const pickQty = Math.min(stock, Number(record.purchaseQuantity || 0));
                                  onWarehousePick(record, pickQty);
                                } else {
                                  onReceive(record);
                                }
                              }}
                            >
                              {hasStock ? '出库领取' : '采购'}
                            </Button>
                          )}
                          <Button
                            type="link"
                            size="small"
                            disabled={frozen || !(status === MATERIAL_PURCHASE_STATUS.RECEIVED || status === MATERIAL_PURCHASE_STATUS.PARTIAL || status === MATERIAL_PURCHASE_STATUS.COMPLETED)}
                            onClick={() => onQualityIssue(record)}
                          >
                            品质异常
                          </Button>
                          <Button
                            type="link"
                            size="small"
                            disabled={
                              frozen
                              || !(status === MATERIAL_PURCHASE_STATUS.RECEIVED || status === MATERIAL_PURCHASE_STATUS.PARTIAL || status === MATERIAL_PURCHASE_STATUS.COMPLETED)
                            }
                            onClick={() => onConfirmReturn(record)}
                          >
                            {Number(record?.returnConfirmed || 0) === 1 ? '追加回料' : '回料确认'}
                          </Button>
                          {(Number(record?.returnConfirmed || 0) === 1 || status === MATERIAL_PURCHASE_STATUS.COMPLETED) && (
                            <Button
                              type="link"
                              size="small"
                              disabled={!isSupervisorOrAbove}
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
              defaultActiveKey={sections.map(s => s.key)}
              items={items}
            />
          );
        })()}
      </Card>

      {(docList.length > 0 || docsLoading) && (
        <Card
          size="small"
          style={{ marginTop: 12 }}
          title={
            <Space>
              <FileImageOutlined />
              <span>历史上传单据</span>
              <span style={{ color: '#999', fontWeight: 'normal' }}>（{docList.length}张）</span>
            </Space>
          }
        >
          <Spin spinning={docsLoading}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
              {docList.map((doc) => (
                <div
                  key={doc.id}
                  style={{
                    width: 160,
                    border: '1px solid #f0f0f0',
                    borderRadius: 6,
                    padding: 8,
                    background: '#fafafa',
                  }}
                >
                  <Image
                    src={getFullAuthedFileUrl(doc.imageUrl)}
                    width={144}
                    height={100}
                    style={{ objectFit: 'cover', borderRadius: 4 }}
                    preview={{ mask: '预览' }}
                  />
                  <div style={{ marginTop: 6, fontSize: 12, color: '#555' }}>
                    <Tooltip title={doc.uploaderName}>
                      <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {doc.uploaderName || '未知'}
                      </div>
                    </Tooltip>
                    <div style={{ color: '#999', marginTop: 2 }}>
                      {doc.createTime ? doc.createTime.slice(0, 16).replace('T', ' ') : ''}
                    </div>
                    <div style={{ color: '#666', marginTop: 2 }}>
                      识别{doc.totalRecognized}条 · 匹配{doc.matchCount}条
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </Spin>
        </Card>
      )}

      {/* ── 发票/单据上传（财务留底） ── */}
      <Card
        size="small"
        style={{ marginTop: 12 }}
        title={
          <Space>
            <FileImageOutlined />
            <span>发票/单据</span>
            <span style={{ color: '#999', fontWeight: 'normal' }}>（{invoiceUrls.length}张，点击可预览放大）</span>
          </Space>
        }
        extra={
          <Upload
            accept="image/jpeg,image/jpg,image/png"
            showUploadList={false}
            beforeUpload={beforeInvoiceUpload}
            customRequest={handleInvoiceUpload}
            disabled={!currentPurchase?.id}
          >
            <Button size="small" icon={invoiceUploading ? <LoadingOutlined /> : <PlusOutlined />} disabled={invoiceUploading || !currentPurchase?.id}>
              上传图片
            </Button>
          </Upload>
        }
      >
        {invoiceUrls.length === 0 && !invoiceUploading ? (
          <div style={{ color: '#bbb', fontSize: 13, textAlign: 'center', padding: '12px 0' }}>
            暂无发票/单据，点击右上角「上传图片」添加
          </div>
        ) : (
          <Image.PreviewGroup>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
              {invoiceUrls.map((url, idx) => (
                <div
                  key={url + idx}
                  style={{ position: 'relative', width: 64, height: 64 }}
                >
                  <Image
                    src={getFullAuthedFileUrl(url)}
                    width={64}
                    height={64}
                    style={{ objectFit: 'cover', borderRadius: 4, border: '1px solid #f0f0f0' }}
                    preview={{ mask: '预览' }}
                  />
                  <Button
                    type="text"
                    danger
                    size="small"
                    icon={<DeleteOutlined />}
                    style={{
                      position: 'absolute',
                      top: 2,
                      right: 2,
                      background: 'rgba(255,255,255,0.85)',
                      padding: '0 4px',
                      minWidth: 0,
                    }}
                    onClick={() => void handleInvoiceDelete(url)}
                  />
                </div>
              ))}
              {invoiceUploading && (
                <div style={{ width: 120, height: 90, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px dashed #d9d9d9', borderRadius: 4 }}>
                  <LoadingOutlined style={{ fontSize: 24, color: '#1677ff' }} />
                </div>
              )}
            </div>
          </Image.PreviewGroup>
        )}
      </Card>

    </div>
  );
};

export default PurchaseDetailView;
