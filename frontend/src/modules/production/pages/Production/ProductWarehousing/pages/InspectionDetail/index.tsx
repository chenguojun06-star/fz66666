import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { Card, Spin, Button, Tabs, Alert, Descriptions, Tag, Image, Typography, Form } from 'antd';
import ResizableTable from '@/components/common/ResizableTable';
import { ArrowLeftOutlined, CheckCircleOutlined, InboxOutlined } from '@ant-design/icons';
import ResizableModal from '@/components/common/ResizableModal';
import api, { type ApiResult, toNumberSafe, parseProductionOrderLines, fetchProductionOrderDetail } from '@/utils/api';
import { getFullAuthedFileUrl } from '@/utils/fileUrl';
import { getMaterialTypeLabel } from '@/utils/materialType';
import { message } from '@/utils/antdStatic';
import { ProductWarehousing as WarehousingType, ProductionOrder } from '@/types/production';
import { OrderLineWarehousingRow, WarehousingDetailRecord, CuttingBundleRow, OrderLine } from '../../types';
import BatchUnqualifiedModal from '../../components/WarehousingModal/BatchUnqualifiedModal';
import { useWarehousingForm } from '../../components/WarehousingModal/hooks/useWarehousingForm';
import StyleSizeTab from '@/modules/basic/pages/StyleInfo/components/StyleSizeTab';
import { qualityAiApi } from '@/services/production/productionApi';
import type { QualityAiSuggestionResult } from '@/services/production/productionApi';
import InspectFormPanel from './InspectFormPanel';
import AiQualityHelperCard from './AiQualityHelperCard';
import OrderLinesTable from './OrderLinesTable';
import QcRecordsPanel from './QcRecordsPanel';
import WarehousingActionPanel from './WarehousingActionPanel';
import ProductionSheetPanel from './ProductionSheetPanel';

const { Title } = Typography;

const BOM_COLUMNS = [
  { title: '物料编码', dataIndex: 'materialCode', key: 'mc', width: 100 },
  { title: '物料名称', dataIndex: 'materialName', key: 'mn', width: 120, ellipsis: true },
  { title: '物料类型', dataIndex: 'materialType', key: 'mt', width: 70, render: (v: unknown) => getMaterialTypeLabel(v) },
  { title: '颜色', dataIndex: 'color', key: 'c', width: 70 },
  { title: '尺码', dataIndex: 'size', key: 's', width: 60 },
  { title: '单位', dataIndex: 'unit', key: 'u', width: 50 },
  { title: '用量', dataIndex: 'usageAmount', key: 'ua', width: 60, render: (v: number) => v?.toFixed(2) },
  { title: '损耗率(%)', dataIndex: 'lossRate', key: 'lr', width: 70, render: (v: number) => v != null ? `${v.toFixed(1)}%` : '-' },
];

interface QualityBriefingData {
  order: {
    orderNo: string; styleNo: string; styleName: string;
    orderQuantity: number; color: string; size: string;
    factoryName: string; merchandiser: string; remarks: string;
    orderDetails: string; progressWorkflowJson: string; styleCover: string;
  };
  style: {
    cover: string; sizeColorConfig: string; category: string;
    styleNo: string; styleName: string; description: string;
    sampleReviewStatus?: string; sampleReviewComment?: string;
    sampleReviewer?: string; sampleReviewTime?: string;
  };
  bom: Array<{
    id: string; materialCode: string; materialName: string;
    materialType: string; color: string; size: string;
    unit: string; usageAmount: number; lossRate: number;
  }>;
  qualityTips: string[];
}

const InspectionDetail: React.FC = () => {
  const { orderId } = useParams<{ orderId: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const defaultTab = searchParams.get('tab') || 'records';
  const highlightWhNo = searchParams.get('warehousingNo') || '';
  const [loading, setLoading] = useState(true);
  const [briefing, setBriefing] = useState<QualityBriefingData | null>(null);
  const [activeTab, setActiveTab] = useState(defaultTab);
  const [recordsLoading, setRecordsLoading] = useState(false);
  const [qcRecords, setQcRecords] = useState<WarehousingDetailRecord[]>([]);
  const [aiSuggestion, setAiSuggestion] = useState<QualityAiSuggestionResult | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [orderDetail, setOrderDetail] = useState<ProductionOrder | null>(null);
  const [orderDetailLoading, setOrderDetailLoading] = useState(false);
  const [bundles, setBundles] = useState<CuttingBundleRow[]>([]);
  const [warehouseValue, setWarehouseValue] = useState('');
  const [warehouseType, setWarehouseType] = useState('成品仓');
  const [warehousingLoading, setWarehousingLoading] = useState(false);
  const [showWarehousingModal, setShowWarehousingModal] = useState(false);
  const [markingRepairBundleId, setMarkingRepairBundleId] = useState<string | null>(null);
  const [batchUnqualifiedModalOpen, setBatchUnqualifiedModalOpen] = useState(false);
  const [_batchUnqualifiedForm] = Form.useForm();

  const formHook = useWarehousingForm(
    true, null,
    () => navigate('/production/warehousing'),
    () => { message.success('质检完成'); fetchBriefing(); fetchQcRecords(); },
    briefing?.order?.orderNo,
  );

  const {
    submitLoading, batchSelectedSummary, unqualifiedFileList,
    setUnqualifiedFileList, handleBatchUnqualifiedSubmit, uploadOneUnqualifiedImage,
  } = formHook;

  const autoInitRef = useRef(false);
  useEffect(() => {
    if (autoInitRef.current) return;
    if (!orderId) return;
    if (formHook.form.getFieldValue('orderId')) { autoInitRef.current = true; return; }
    formHook.form.setFieldValue('orderId', orderId);
    if (orderDetail) {
      void formHook.handleOrderChange(orderId, { data: orderDetail });
    } else {
      fetchProductionOrderDetail(orderId, { acceptAnyData: true })
        .then((detail) => {
          if (detail) void formHook.handleOrderChange(orderId, { data: detail });
        })
        .catch(() => {});
    }
    autoInitRef.current = true;
  }, [orderId, orderDetail]);

  const fetchBriefing = useCallback(async () => {
    if (!orderId) return;
    setLoading(true);
    try {
      const res = await api.get<{ code: number; data: QualityBriefingData }>(`/production/warehousing/quality-briefing/${orderId}`);
      if (res.code === 200 && res.data) setBriefing(res.data);
      else message.error('获取质检简报失败');
    } catch (err: unknown) {
      message.error(`获取质检简报失败: ${err instanceof Error ? err.message : '请检查网络连接'}`);
    } finally { setLoading(false); }
  }, [orderId]);

  const fetchQcRecords = useCallback(async () => {
    if (!orderId) return;
    setRecordsLoading(true);
    try {
      const res = await api.get<{ code: number; data: { records: WarehousingType[]; total: number } }>(
        '/production/warehousing/list', { params: { page: 1, pageSize: 500, orderId } },
      );
      if (res.code === 200) setQcRecords((res.data?.records || []) as WarehousingDetailRecord[]);
    } catch { message.warning('质检记录加载失败'); } finally { setRecordsLoading(false); }

    setOrderDetailLoading(true);
    try {
      const detail = await fetchProductionOrderDetail(orderId, { acceptAnyData: true });
      setOrderDetail((detail || null) as unknown as ProductionOrder | null);
    } catch { setOrderDetail(null); message.warning('订单详情加载失败'); } finally { setOrderDetailLoading(false); }

    try {
      const res = await api.get<{ code: number; data: { records: CuttingBundleRow[]; total: number } }>(
        '/production/cutting/list', { params: { page: 1, pageSize: 500, orderId } },
      );
      if (res.code === 200) setBundles((res.data?.records || []) as CuttingBundleRow[]);
    } catch { message.warning('裁剪数据加载失败'); }
  }, [orderId]);

  useEffect(() => { fetchBriefing(); }, [fetchBriefing]);
  useEffect(() => { fetchQcRecords(); }, [fetchQcRecords]);

  useEffect(() => {
    if (!orderId) return;
    setAiLoading(true);
    qualityAiApi.getSuggestion(orderId)
      .then((res: ApiResult) => { setAiSuggestion((res?.data ?? null) as QualityAiSuggestionResult | null); })
      .catch(() => { message.warning('AI质检建议加载失败'); })
      .finally(() => setAiLoading(false));
  }, [orderId]);

  const bundleByQr = useMemo(() => {
    const m = new Map<string, CuttingBundleRow>();
    for (const b of bundles) {
      const qr = String(b.qrCode || '').trim();
      if (qr && !m.has(qr)) m.set(qr, b);
    }
    return m;
  }, [bundles]);

  const orderLineWarehousingRows = useMemo<OrderLineWarehousingRow[]>(() => {
    const on = String(orderDetail?.orderNo || briefing?.order?.orderNo || '').trim();
    const sn = String(orderDetail?.styleNo || briefing?.order?.styleNo || '').trim();
    const lines = parseProductionOrderLines(orderDetail) as OrderLine[];
    if (!lines.length) return [];

    const warehousedByKey = new Map<string, number>();
    const unqualifiedByKey = new Map<string, number>();

    for (const r of qcRecords) {
      if (!r) continue;
      const qr = String(r.cuttingBundleQrCode || (r as any).qrCode || '').trim();
      const b = qr ? bundleByQr.get(qr) : undefined;
      const color = String(b?.color || r.color || (r as any).colour || '').trim();
      const size = String(b?.size || r.size || '').trim();
      if (!color || !size) continue;
      const k = `${color}@@${size}`;

      const qs = String(r.qualityStatus || '').trim().toLowerCase();
      if ((!qs || qs === 'qualified') && String(r.warehouse || '').trim()) {
        const q = toNumberSafe(r.qualifiedQuantity);
        if (q > 0) warehousedByKey.set(k, (warehousedByKey.get(k) || 0) + q);
      }
      const uq = toNumberSafe(r.unqualifiedQuantity);
      if (uq > 0) unqualifiedByKey.set(k, (unqualifiedByKey.get(k) || 0) + uq);
    }

    return lines.map((l, idx) => {
      const color = String(l?.color || '').trim();
      const size = String(l?.size || '').trim();
      const quantity = Math.max(0, toNumberSafe(l?.quantity));
      const k = `${color}@@${size}`;
      const wq = Math.max(0, toNumberSafe(warehousedByKey.get(k) || 0));
      const uq = Math.max(0, toNumberSafe(unqualifiedByKey.get(k) || 0));
      return {
        key: `${idx}-${k}`, orderNo: on || '-', styleNo: sn || '-',
        color: color || '-', size: size || '-', quantity,
        warehousedQuantity: wq, unqualifiedQuantity: uq,
        unwarehousedQuantity: Math.max(0, quantity - wq - uq),
      };
    }).sort((a, b) => {
      const c = a.color.localeCompare(b.color, 'zh-Hans-CN', { numeric: true });
      return c !== 0 ? c : a.size.localeCompare(b.size, 'zh-Hans-CN', { numeric: true });
    });
  }, [bundleByQr, briefing, orderDetail, qcRecords]);

  const qcStats = useMemo(() => {
    const total = qcRecords.reduce((s, r) => s + (Number(r.warehousingQuantity) || 0), 0);
    const qualified = qcRecords.reduce((s, r) => s + (Number(r.qualifiedQuantity) || 0), 0);
    const unqualified = qcRecords.reduce((s, r) => s + (Number(r.unqualifiedQuantity) || 0), 0);
    const warehoused = qcRecords
      .filter(r => {
        const qs = String(r.qualityStatus || '').trim().toLowerCase();
        return (qs === 'qualified' || (!qs && Number(r.qualifiedQuantity || 0) > 0)) && String(r.warehouse || '').trim();
      })
      .reduce((s, r) => s + (Number(r.qualifiedQuantity) || 0), 0);
    const pendingWarehouse = qcRecords
      .filter(r => {
        const qs = String(r.qualityStatus || '').trim().toLowerCase();
        return (qs === 'qualified' || (!qs && Number(r.qualifiedQuantity || 0) > 0)) && !String(r.warehouse || '').trim();
      })
      .reduce((s, r) => s + (Number(r.qualifiedQuantity) || 0), 0);
    return { total, qualified, unqualified, count: qcRecords.length, warehoused, pendingWarehouse };
  }, [qcRecords]);

  const actualDefectSet = useMemo(() => {
    const set = new Set<string>();
    for (const r of qcRecords) {
      if (r.defectCategory && Number(r.unqualifiedQuantity || 0) > 0) set.add(r.defectCategory);
    }
    return set;
  }, [qcRecords]);

  const handleWarehouseSubmit = async () => {
    if (!warehouseValue) { message.error('请选择仓库'); return; }
    if (!orderId) return;
    setWarehousingLoading(true);
    try {
      const targets = qcRecords.filter(r => {
        const qs = String(r.qualityStatus || '').trim().toLowerCase();
        const wt = String((r as any)?.warehousingType || '').trim();
        const wh = String(r.warehouse || '').trim();
        if (wt === 'quality_scan_scrap' || wt === 'repair_return') return false;
        if (wh && wh !== '待分配') return false;
        return (!qs || qs === 'qualified') && Number(r.qualifiedQuantity || 0) > 0;
      });
      if (!targets.length) { message.info('暂无可入库的合格质检记录'); setWarehousingLoading(false); return; }

      const queue = targets.slice();
      let failCount = 0;
      const failMessages: string[] = [];
      const workers = Array.from({ length: Math.min(5, queue.length) }).map(async () => {
        while (queue.length) {
          const r = queue.shift();
          if (!r) continue;
          try {
            const res = await api.put<{ code: number; message: string; data: boolean }>(
              '/production/warehousing', { id: r.id, warehouse: warehouseValue },
            );
            if (res.code !== 200) {
              failCount++;
              const msg = res.message || '入库失败';
              if (!failMessages.includes(msg)) failMessages.push(msg);
            }
          } catch (e: unknown) {
            failCount++;
            const msg = e instanceof Error ? e.message : '入库失败';
            if (!failMessages.includes(msg)) failMessages.push(msg);
          }
        }
      });
      await Promise.all(workers);
      if (failCount === 0) message.success('入库完成');
      else if (failCount < targets.length) message.warning(`部分入库成功（${targets.length - failCount}/${targets.length}），失败原因：${failMessages.join('；')}`);
      else message.error(`入库失败：${failMessages.join('；')}`);
      setWarehouseValue('');
      fetchQcRecords();
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : '入库失败');
    } finally {
      setWarehousingLoading(false);
    }
  };

  const handleMarkRepaired = useCallback(async (bundleId: string) => {
    if (!bundleId) return;
    setMarkingRepairBundleId(bundleId);
    try {
      const res = await api.post<{ code: number; message?: string }>(
        '/production/warehousing/mark-bundle-repaired', { bundleId },
      );
      if (res.code === 200) {
        message.success('已标记为返修完成，可重新进行质检');
        const orderNo = briefing?.order?.orderNo;
        if (orderNo) await formHook.fetchBundlesByOrderNo(orderNo);
        fetchQcRecords();
      } else {
        message.error(res.message || '标记失败');
      }
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : '操作失败');
    } finally {
      setMarkingRepairBundleId(null);
    }
  }, [briefing, formHook, fetchQcRecords]);

  if (loading) return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 400 }}>
      <Spin size="large" spinning tip="加载中..."><div /></Spin>
    </div>
  );
  if (!briefing) return (
    <Card>
      <Alert type="error" title="无法加载质检简报数据" showIcon />
      <Button type="link" onClick={() => navigate('/production/warehousing')}>返回质检入库列表</Button>
    </Card>
  );

  const { order, style, bom } = briefing;
  const styleId = orderDetail?.styleId || (order as any)?.styleId;
  const plateTypeKey = String((order as any)?.plateType || '').trim().toUpperCase();
  const urgencyKey = String((order as any)?.urgencyLevel || '').trim().toLowerCase();

  return (
    <>
      {/* 顶部导航栏 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/production/warehousing')}>返回</Button>
        <Title level={4} style={{ margin: 0 }}>质检入库 - {order.orderNo}</Title>
        {(plateTypeKey === 'FIRST') && <Tag color="blue">首</Tag>}
        {(plateTypeKey === 'REORDER' || plateTypeKey === 'REPLATE') && <Tag color="purple">翻</Tag>}
        {(urgencyKey === 'urgent') && <Tag color="red">急</Tag>}
        {(urgencyKey === 'normal') && <Tag>普</Tag>}
        <Tag color="blue">{order.styleNo}</Tag>
        <Tag color="green">{order.styleName}</Tag>
        {qcStats.count > 0 && <Tag color="cyan">已质检 {qcStats.count} 次</Tag>}
        <div style={{ flex: 1 }} />
        <Button
          type="primary"
          icon={<InboxOutlined />}
          disabled={qcStats.pendingWarehouse === 0}
          onClick={() => setShowWarehousingModal(true)}
        >
          入库{qcStats.pendingWarehouse > 0 ? `（${qcStats.pendingWarehouse}条待入库）` : ''}
        </Button>
      </div>

      {/* 两栏布局 */}
      <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: 16, minHeight: 'calc(100vh - 200px)' }}>
        {/* 左侧 */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Card title="款式信息">
            <div style={{ textAlign: 'center', marginBottom: 12 }}>
              {(style?.cover || order?.styleCover) ? (
                <Image src={getFullAuthedFileUrl(style?.cover || order?.styleCover)} alt={order.styleName}
                  width={200} height={240} style={{ objectFit: 'cover', borderRadius: 8 }}
                  fallback="data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjI0MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjZjBmMGYwIi8+PHRleHQgeD0iNTAlIiB5PSI1MCUiIGRvbWluYW50LWJhc2VsaW5lPSJtaWRkbGUiIHRleHQtYW5jaG9yPSJtaWRkbGUiIGZpbGw9IiNjY2MiIGZvbnQtc2l6ZT0iMTQiPuaXoOWbvueJhzwvdGV4dD48L3N2Zz4=" />
              ) : (
                <div style={{ width: 200, height: 240, background: '#f5f5f5', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ccc', margin: '0 auto' }}>无图片</div>
              )}
            </div>
            <Descriptions column={1}>
              <Descriptions.Item label="款号">{order.styleNo}</Descriptions.Item>
              <Descriptions.Item label="款名">{order.styleName}</Descriptions.Item>
              <Descriptions.Item label="订单数量">{order.orderQuantity}</Descriptions.Item>
              <Descriptions.Item label="工厂">{order.factoryName || '-'}</Descriptions.Item>
              <Descriptions.Item label="跟单员">{order.merchandiser || '-'}</Descriptions.Item>
            </Descriptions>
          </Card>

          <AiQualityHelperCard
            aiSuggestion={aiSuggestion}
            aiLoading={aiLoading}
            actualDefectSet={actualDefectSet}
          />
        </div>

        {/* 右侧 */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, overflow: 'auto', maxWidth: '100%' }}>
          <Card style={{ overflow: 'hidden' }}>
            <Tabs
              activeKey={activeTab} onChange={setActiveTab}
             
              style={{ width: '100%' }}
              items={[
                {
                  key: 'records',
                  label: '质检记录',
                  children: (
                    <QcRecordsPanel
                      qcRecords={qcRecords}
                      qcStats={qcStats}
                      recordsLoading={recordsLoading}
                      highlightWhNo={highlightWhNo}
                    />
                  ),
                },
                {
                  key: 'orderLines',
                  label: '入库进度',
                  children: <OrderLinesTable rows={orderLineWarehousingRows} loading={orderDetailLoading} />,
                },
                {
                  key: 'bom',
                  label: 'BOM物料',
                  children: (
                    <ResizableTable
                      storageKey="inspection-bom-table"
                      rowKey="id" pagination={false}
                      scroll={{ x: 650 }} dataSource={bom}
                      columns={BOM_COLUMNS}
                    />
                  ),
                },
                {
                  key: 'sizeChart',
                  label: '尺寸表',
                  children: (
                    <div style={{ padding: '8px 0' }}>
                      {styleId ? (
                        <StyleSizeTab styleId={styleId} readOnly simpleView />
                      ) : (
                        <div style={{ textAlign: 'center', padding: 40, color: 'rgba(0,0,0,0.45)' }}>
                          暂无尺寸表数据
                        </div>
                      )}
                    </div>
                  ),
                },
                {
                  key: 'productionSheet',
                  label: '生产制单',
                  children: (
                    <ProductionSheetPanel
                      description={style?.description || ''}
                      reviewStatus={style?.sampleReviewStatus}
                      reviewComment={style?.sampleReviewComment}
                      reviewer={style?.sampleReviewer}
                      reviewTime={style?.sampleReviewTime}
                    />
                  ),
                },
              ]}
            />
          </Card>

          <Card title={<><CheckCircleOutlined style={{ marginRight: 6 }} />质检操作</>}>
            {formHook.batchSelectRows.length > 0 && formHook.batchSelectableQrs.length === 0 && qcStats.pendingWarehouse === 0 && qcStats.count > 0 ? (
              <Alert type="success" showIcon
                title="该订单所有菲号已完成质检入库，无需再操作"
                description="如需返修重检，请在质检记录中标记返修后重新操作" />
            ) : (
              <InspectFormPanel
                formHook={formHook}
                handleMarkRepaired={handleMarkRepaired}
                markingRepairBundleId={markingRepairBundleId}
                onOpenBatchUnqualified={() => setBatchUnqualifiedModalOpen(true)}
                autoInitDone={autoInitRef.current}
              />
            )}
          </Card>
        </div>
      </div>

      <ResizableModal
        title="入库操作"
        open={showWarehousingModal}
        onCancel={() => setShowWarehousingModal(false)}
        footer={null}
        width="60vw"
        initialHeight={Math.round(window.innerHeight * 0.82)}
        destroyOnHidden
      >
        <WarehousingActionPanel
          qcRecords={qcRecords}
          warehouseValue={warehouseValue}
          setWarehouseValue={setWarehouseValue}
          warehouseType={warehouseType}
          setWarehouseType={setWarehouseType}
          warehousingLoading={warehousingLoading}
          onSubmit={handleWarehouseSubmit}
        />
      </ResizableModal>

      <BatchUnqualifiedModal
        open={batchUnqualifiedModalOpen}
        totalQty={batchSelectedSummary?.totalQty || 0}
        submitLoading={submitLoading}
        unqualifiedFileList={unqualifiedFileList}
        onCancel={() => setBatchUnqualifiedModalOpen(false)}
        onOk={handleBatchUnqualifiedSubmit}
        onUploadImage={uploadOneUnqualifiedImage}
        onRemoveImage={(file) => setUnqualifiedFileList((prev) => prev.filter((f) => f.uid !== file.uid))}
        onFileListChange={setUnqualifiedFileList}
      />
    </>
  );
};

export default InspectionDetail;
