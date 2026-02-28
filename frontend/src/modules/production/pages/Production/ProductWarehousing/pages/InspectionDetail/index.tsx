import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Card, Spin, Button, message, Tabs, Alert, Descriptions, Table, Tag,
  Image, List, Typography, Select, Space, Statistic, Row, Col,
  Form, InputNumber, Input, Modal,
} from 'antd';
import {
  ArrowLeftOutlined, CheckCircleOutlined, ExperimentOutlined,
  InboxOutlined, OrderedListOutlined,
} from '@ant-design/icons';
import Layout from '@/components/Layout';
import ResizableTable from '@/components/common/ResizableTable';
import api, { toNumberSafe, parseProductionOrderLines, fetchProductionOrderDetail } from '@/utils/api';
import { getFullAuthedFileUrl } from '@/utils/fileUrl';
import { formatDateTime } from '@/utils/datetime';
import { getMaterialTypeLabel } from '@/utils/materialType';
import { ProductWarehousing as WarehousingType, ProductionOrder } from '@/types/production';
import { OrderLineWarehousingRow, WarehousingDetailRecord, CuttingBundleRow, OrderLine, BatchSelectBundleRow } from '../../types';
import { getQualityStatusConfig, getDefectCategoryLabel, getDefectRemarkLabel, isBundleBlockedForWarehousing } from '../../utils';
import { DEFECT_CATEGORY_OPTIONS, DEFECT_REMARK_OPTIONS } from '../../constants';
import UnqualifiedUpload from '../../components/WarehousingModal/components/UnqualifiedUpload';
import { useWarehousingForm } from '../../components/WarehousingModal/hooks/useWarehousingForm';
import StyleSizeTab from '@/modules/basic/pages/StyleInfo/components/StyleSizeTab';

const { Title, Text } = Typography;
const { Option } = Select;

/* -------- 类型定义 -------- */
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
    sampleReviewStatus?: string;
    sampleReviewComment?: string;
    sampleReviewer?: string;
    sampleReviewTime?: string;
  };
  bom: Array<{
    id: string; materialCode: string; materialName: string;
    materialType: string; color: string; size: string;
    unit: string; usageAmount: number; lossRate: number;
  }>;
  qualityTips: string[];
}


/* ======================================================================
   统一质检入库页面
   合并了：质检操作 + 质检记录(详情) + 入库选仓 + 辅助信息
   ====================================================================== */
const InspectionDetail: React.FC = () => {
  const { orderId } = useParams<{ orderId: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const defaultTab = searchParams.get('tab') || 'records';
  const highlightWhNo = searchParams.get('warehousingNo') || '';

  /* ---- 基础状态 ---- */
  const [loading, setLoading] = useState(true);
  const [briefing, setBriefing] = useState<QualityBriefingData | null>(null);
  const [activeTab, setActiveTab] = useState(defaultTab);

  /* ---- 质检记录 ---- */
  const [recordsLoading, setRecordsLoading] = useState(false);
  const [qcRecords, setQcRecords] = useState<WarehousingDetailRecord[]>([]);
  const [orderDetail, setOrderDetail] = useState<ProductionOrder | null>(null);
  const [orderDetailLoading, setOrderDetailLoading] = useState(false);
  const [bundles, setBundles] = useState<CuttingBundleRow[]>([]);

  /* ---- 入库 ---- */
  const [warehouseValue, setWarehouseValue] = useState('');
  const [warehousingLoading, setWarehousingLoading] = useState(false);
  const [showWarehousingModal, setShowWarehousingModal] = useState(false);
  const [warehouseOptions, setWarehouseOptions] = useState<string[]>(['A仓', 'B仓', 'C仓', '成品仓', '面辅料仓', '次品仓']);

  // 动态加载字典中配置的仓库列表
  useEffect(() => {
    api.get<{ code: number; data: { records?: { dictLabel: string }[] } | { dictLabel: string }[] }>(
      '/system/dict/list', { params: { dictType: 'warehouse_location', page: 1, pageSize: 100 } }
    ).then(res => {
      if (res.code === 200) {
        const list = Array.isArray(res.data) ? res.data : (res.data as any)?.records || [];
        const labels = list.map((d: any) => String(d.dictLabel || '').trim()).filter(Boolean);
        if (labels.length) setWarehouseOptions(labels);
      }
    }).catch(() => { /* 静默失败，保留默认值 */ });
  }, []);

  /* ---- 内联质检表单 ---- */
  const formHook = useWarehousingForm(
    true, null,
    () => navigate('/production/warehousing'),
    () => { message.success('质检完成'); fetchBriefing(); fetchQcRecords(); },
    briefing?.order?.orderNo,
  );

  /* ---- 自动初始化订单（直接使用 URL orderId + orderDetail，避免 orderOptions 竞态条件） ---- */
  const autoInitRef = useRef(false);
  useEffect(() => {
    if (autoInitRef.current) return;
    if (!orderId || !orderDetail) return;
    if (formHook.form.getFieldValue('orderId')) { autoInitRef.current = true; return; }
    // 直接从 URL 参数设置 orderId，无需从下拉列表匹配
    formHook.form.setFieldValue('orderId', orderId);
    // 使用 orderDetail 作为 option.data，触发菲号/款式等关联数据加载
    void formHook.handleOrderChange(orderId, { data: orderDetail });
    autoInitRef.current = true;

  }, [orderId, orderDetail]);

  /* ==================== 数据获取 ==================== */
  const fetchBriefing = useCallback(async () => {
    if (!orderId) return;
    setLoading(true);
    try {
      const res = await api.get<{ code: number; data: QualityBriefingData }>(
        `/production/warehousing/quality-briefing/${orderId}`,
      );
      if (res.code === 200 && res.data) setBriefing(res.data);
      else message.error('获取质检简报失败');
    } catch (err: any) {
      message.error(`获取质检简报失败: ${err?.message || '请检查网络连接'}`);
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  const fetchQcRecords = useCallback(async () => {
    if (!orderId) return;
    setRecordsLoading(true);
    try {
      const res = await api.get<{
        code: number; data: { records: WarehousingType[]; total: number };
      }>('/production/warehousing/list', { params: { page: 1, pageSize: 10000, orderId } });
      if (res.code === 200) {
        setQcRecords((res.data?.records || []) as WarehousingDetailRecord[]);
      }
    } catch { /* ignore */ } finally { setRecordsLoading(false); }

    // 订单明细
    setOrderDetailLoading(true);
    try {
      const detail = await fetchProductionOrderDetail(orderId, { acceptAnyData: true });
      setOrderDetail((detail || null) as unknown as ProductionOrder | null);
    } catch { setOrderDetail(null); } finally { setOrderDetailLoading(false); }

    // 菲号裁剪
    try {
      const res = await api.get<{
        code: number; data: { records: CuttingBundleRow[]; total: number };
      }>('/production/cutting/list', { params: { page: 1, pageSize: 10000, orderId } });
      if (res.code === 200) setBundles((res.data?.records || []) as CuttingBundleRow[]);
    } catch { /* ignore */ }
  }, [orderId]);

  useEffect(() => { fetchBriefing(); }, [fetchBriefing]);
  useEffect(() => { fetchQcRecords(); }, [fetchQcRecords]);

  /* ==================== 派生计算 ==================== */
  const bundleByQr = useMemo(() => {
    const m = new Map<string, CuttingBundleRow>();
    for (const b of bundles) {
      const qr = String(b.qrCode || '').trim();
      if (qr && !m.has(qr)) m.set(qr, b);
    }
    return m;
  }, [bundles]);

  /** 下单明细 × 入库进度 */
  const orderLineWarehousingRows = useMemo<OrderLineWarehousingRow[]>(() => {
    const on = String(orderDetail?.orderNo || briefing?.order?.orderNo || '').trim();
    const sn = String(orderDetail?.styleNo || briefing?.order?.styleNo || '').trim();
    const lines = parseProductionOrderLines(orderDetail) as OrderLine[];
    if (!lines.length) return [];

    // 统计已入库的合格数量（只计算已分配仓库的合格品）
    const warehousedByKey = new Map<string, number>();
    // 统计不合格数量（包括所有不合格记录，无论是否已入库）
    const unqualifiedByKey = new Map<string, number>();

    for (const r of qcRecords) {
      if (!r) continue;
      const qr = String(r.cuttingBundleQrCode || (r as any).qrCode || '').trim();
      const b = qr ? bundleByQr.get(qr) : undefined;
      const color = String(b?.color || r.color || (r as any).colour || '').trim();
      const size = String(b?.size || r.size || '').trim();
      if (!color || !size) continue;
      const k = `${color}@@${size}`;

      // 统计合格已入库
      const qs = String(r.qualityStatus || '').trim().toLowerCase();
      if ((!qs || qs === 'qualified') && String(r.warehouse || '').trim()) {
        const q = toNumberSafe(r.qualifiedQuantity);
        if (q > 0) {
          warehousedByKey.set(k, (warehousedByKey.get(k) || 0) + q);
        }
      }

      // 统计不合格数量（所有不合格记录）
      const uq = toNumberSafe(r.unqualifiedQuantity);
      if (uq > 0) {
        unqualifiedByKey.set(k, (unqualifiedByKey.get(k) || 0) + uq);
      }
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
        warehousedQuantity: wq,
        unqualifiedQuantity: uq,
        unwarehousedQuantity: Math.max(0, quantity - wq - uq),
      };
    }).sort((a, b) => {
      const c = a.color.localeCompare(b.color, 'zh-Hans-CN', { numeric: true });
      return c !== 0 ? c : a.size.localeCompare(b.size, 'zh-Hans-CN', { numeric: true });
    });
  }, [bundleByQr, briefing, orderDetail, qcRecords]);

  /** 质检统计 */
  const qcStats = useMemo(() => {
    const total = qcRecords.reduce((s, r) => s + (Number(r.warehousingQuantity) || 0), 0);
    const qualified = qcRecords.reduce((s, r) => s + (Number(r.qualifiedQuantity) || 0), 0);
    const unqualified = qcRecords.reduce((s, r) => s + (Number(r.unqualifiedQuantity) || 0), 0);
    // 已入库：合格且已分配仓库的合格数量合计
    const warehoused = qcRecords
      .filter(r => {
        const qs = String(r.qualityStatus || '').trim().toLowerCase();
        return (qs === 'qualified' || (!qs && Number(r.qualifiedQuantity || 0) > 0)) && String(r.warehouse || '').trim();
      })
      .reduce((s, r) => s + (Number(r.qualifiedQuantity) || 0), 0);
    // 待入库：合格但未分配仓库的合格数量合计
    const pendingWarehouse = qcRecords
      .filter(r => {
        const qs = String(r.qualityStatus || '').trim().toLowerCase();
        return (qs === 'qualified' || (!qs && Number(r.qualifiedQuantity || 0) > 0)) && !String(r.warehouse || '').trim();
      })
      .reduce((s, r) => s + (Number(r.qualifiedQuantity) || 0), 0);
    return { total, qualified, unqualified, count: qcRecords.length, warehoused, pendingWarehouse };
  }, [qcRecords]);

  /* ==================== 入库提交 ==================== */
  const handleWarehouseSubmit = async () => {
    if (!warehouseValue) { message.error('请选择仓库'); return; }
    if (!orderId) return;
    setWarehousingLoading(true);
    try {
      const targets = qcRecords.filter(r => {
        const qs = String(r.qualityStatus || '').trim().toLowerCase();
        return (!qs || qs === 'qualified') && Number(r.qualifiedQuantity || 0) > 0 && !String(r.warehouse || '').trim();
      });
      if (!targets.length) { message.info('暂无可入库的合格质检记录'); setWarehousingLoading(false); return; }

      const concurrency = 5;
      const queue = targets.slice();
      const workers = Array.from({ length: Math.min(concurrency, queue.length) }).map(async () => {
        while (queue.length) {
          const r = queue.shift();
          if (!r) continue;
          await api.put<{ code: number; message: string; data: boolean }>(
            '/production/warehousing', { id: r.id, warehouse: warehouseValue },
          );
        }
      });
      await Promise.all(workers);
      message.success('入库完成');
      setWarehouseValue('');
      fetchQcRecords();
    } catch (e: any) {
      message.error(e.message || '入库失败');
    } finally {
      setWarehousingLoading(false);
    }
  };

  /* ==================== 渲染：下单明细（制单tab） ==================== */
  const renderOrderLines = () => (
    <div style={{ padding: '8px 0' }}>
      <ResizableTable<OrderLineWarehousingRow>
        storageKey="inspection-order-lines"
        size="small" rowKey="key" loading={orderDetailLoading}
        pagination={false} dataSource={orderLineWarehousingRows} scroll={{ x: 1040 }}
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
          const totals: {
            quantity: number;
            warehousedQuantity: number;
            unqualifiedQuantity: number;
            unwarehousedQuantity: number;
          } = pageData.reduce(
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
  );

  /* ==================== 渲染：质检记录 ==================== */
  const renderQcRecords = () => (
    <div>
      {/* 统计卡片 */}
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={4}><Statistic title="质检次数" value={qcStats.count} /></Col>
        <Col span={4}><Statistic title="质检总数" value={qcStats.total} /></Col>
        <Col span={4}><Statistic title="合格数" value={qcStats.qualified} styles={{ content: { color: 'var(--color-success)' } }} /></Col>
        <Col span={4}><Statistic title="不合格数" value={qcStats.unqualified} styles={{ content: { color: 'var(--color-danger)' } }} /></Col>
        <Col span={4}><Statistic title="已入库" value={qcStats.warehoused} styles={{ content: { color: 'var(--color-info)' } }} /></Col>
        <Col span={4}><Statistic title="待入库" value={qcStats.pendingWarehouse} styles={{ content: { color: 'var(--color-warning)' } }} /></Col>
      </Row>

      {/* 质检记录明细 */}
      <Card size="small" title="质检记录明细" loading={recordsLoading}>
        <ResizableTable<WarehousingDetailRecord>
          storageKey="inspection-qc-records"
          size="small" rowKey="id" pagination={false}
          dataSource={qcRecords} scroll={{ x: 1200 }}
          style={{ fontSize: 12 }}
          rowClassName={(record) =>
            highlightWhNo && record.warehousingNo === highlightWhNo ? 'ant-table-row-selected' : ''
          }
          columns={[
            {
              title: '质检入库号', dataIndex: 'warehousingNo', key: 'wn', width: 120,
              render: (v: string) => <Text strong={highlightWhNo === v}>{v || '-'}</Text>,
            },
            {
              title: '菲号', dataIndex: 'cuttingBundleQrCode', key: 'qr', width: 180, ellipsis: true,
              render: (v: unknown) => { const t = String(v || '').trim(); return t ? (t.split('|')[0] || t) : '-'; },
            },
            { title: '颜色', dataIndex: 'color', key: 'color', width: 80 },
            { title: '尺码', dataIndex: 'size', key: 'size', width: 70 },
            { title: '质检数', dataIndex: 'warehousingQuantity', key: 'wq', width: 80, align: 'right' as const },
            {
              title: '合格数', dataIndex: 'qualifiedQuantity', key: 'qq', width: 80, align: 'right' as const,
              render: (v: number) => <span style={{ color: 'var(--color-success)' }}>{v ?? 0}</span>,
            },
            {
              title: '不合格数', dataIndex: 'unqualifiedQuantity', key: 'uq', width: 80, align: 'right' as const,
              render: (v: number) => v ? <span style={{ color: 'var(--color-danger)' }}>{v}</span> : <span>0</span>,
            },
            {
              title: '质检状态', dataIndex: 'qualityStatus', key: 'qs', width: 90,
              render: (s: string) => { const c = getQualityStatusConfig(s); return <Tag color={c.color}>{c.text}</Tag>; },
            },
            {
              title: '仓库', dataIndex: 'warehouse', key: 'wh2', width: 80,
              render: (v: string) => v || <Tag color="warning">待入库</Tag>,
            },
            {
              title: '次品类别', key: 'dc', width: 100,
              render: (_: any, r: WarehousingDetailRecord) =>
                Number(r.unqualifiedQuantity || 0) > 0 ? getDefectCategoryLabel(r.defectCategory) : '-',
            },
            {
              title: '处理方式', key: 'dr', width: 100,
              render: (_: any, r: WarehousingDetailRecord) =>
                Number(r.unqualifiedQuantity || 0) > 0 ? getDefectRemarkLabel(r.defectRemark) : '-',
            },
            {
              title: '质检时间', dataIndex: 'createTime', key: 'ct', width: 150,
              render: (v: unknown) => formatDateTime(v),
            },
          ]}
        />
      </Card>
    </div>
  );

  /* ==================== 渲染：入库操作 ==================== */
  const renderWarehousingAction = () => {
    const pendingRecords = qcRecords.filter(r => {
      const qs = String(r.qualityStatus || '').trim().toLowerCase();
      return (!qs || qs === 'qualified') && Number(r.qualifiedQuantity || 0) > 0 && !String(r.warehouse || '').trim();
    });
    const pendingQty = pendingRecords.reduce((s, r) => s + (Number(r.qualifiedQuantity) || 0), 0);

    if (!pendingRecords.length) {
      return <Alert type="success" message="该订单所有合格质检记录均已入库完成！" showIcon />;
    }

    return (
      <>
        <Alert type="info" showIcon style={{ marginBottom: 16 }}
          message={`共 ${pendingRecords.length} 条合格记录待入库，合格数量合计 ${pendingQty} 件`} />

        <Card size="small" title="待入库记录" style={{ marginBottom: 16 }}>
          <ResizableTable<WarehousingDetailRecord>
            storageKey="inspection-pending-records"
            size="small" rowKey="id" pagination={false}
            dataSource={pendingRecords} scroll={{ x: 800 }}
            style={{ fontSize: 12 }}
            columns={[
              { title: '质检入库号', dataIndex: 'warehousingNo', key: 'wn', width: 120 },
              {
                title: '菲号', dataIndex: 'cuttingBundleQrCode', key: 'qr', width: 160, ellipsis: true,
                render: (v: unknown) => { const t = String(v || '').trim(); return t ? (t.split('|')[0] || t) : '-'; },
              },
              { title: '颜色', dataIndex: 'color', key: 'c', width: 80 },
              { title: '尺码', dataIndex: 'size', key: 's', width: 70 },
              { title: '合格数', dataIndex: 'qualifiedQuantity', key: 'qq', width: 80, align: 'right' as const },
            ]}
          />
        </Card>

        <Card size="small" title="选择仓库并确认入库">
          <Space orientation="vertical" style={{ width: '100%' }} size="middle">
            <div>
              <Text strong style={{ marginRight: 12 }}>入库仓库：</Text>
              <Select
                placeholder="请选择仓库"
                value={warehouseValue || undefined}
                onChange={(v) => setWarehouseValue(String(v || '').trim())}
                style={{ width: 200 }}
              >
                {warehouseOptions.map(w => <Option key={w} value={w}>{w}</Option>)}
              </Select>
            </div>
            <Button type="primary" size="large" icon={<InboxOutlined />}
              loading={warehousingLoading} onClick={handleWarehouseSubmit}
              disabled={!warehouseValue}>
              确认入库（{pendingRecords.length} 条记录）
            </Button>
          </Space>
        </Card>
      </>
    );
  };

  /* ==================== 渲染：质检操作（平铺菲号 + 内联表单） ==================== */
  const renderInspectForm = () => {
    const {
      form: qcForm, submitLoading,
      batchSelectRows, batchSelectedBundleQrs, batchSelectableQrs,
      batchQtyByQr, batchSelectedSummary, batchSelectedHasBlocked,
      singleSelectedBundle, isSingleSelectedBundleBlocked, singleSelectedBundleRepairStats,
      handleBatchSelectionChange, handleBatchSelectAll, handleBatchSelectInvert, handleBatchSelectClear,
      handleBatchQualifiedSubmit, handleSubmit: handleQcSubmit,
      uploadOneUnqualifiedImage, unqualifiedFileList, setUnqualifiedFileList,
      watchedWarehousingQty, watchedUnqualifiedQty,
      bundles: formBundles, orderOptionsLoading,
    } = formHook;

    const isMultiSelected = batchSelectedBundleQrs.length > 1;
    const isSingleSelected = batchSelectedBundleQrs.length === 1;
    const showQcForm = batchSelectedBundleQrs.length > 0;
    const unqQty = Number(watchedUnqualifiedQty || 0) || 0;
    const bundlesLoading = orderOptionsLoading || (!formBundles.length && !autoInitRef.current);

    return (
      <div>
        {/* 菲号列表 - 平铺显示 */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <Space>
              <Text strong style={{ fontSize: 14 }}>菲号列表</Text>
              <Tag color={batchSelectedBundleQrs.length ? 'blue' : 'default'}>
                已选 {batchSelectedBundleQrs.length}/{batchSelectRows.length}
              </Tag>
              {batchSelectedBundleQrs.length > 0 && (
                <Tag color="geekblue">合计 {batchSelectedSummary.totalQty} 件</Tag>
              )}
            </Space>
            <Space>
              <Button size="small" onClick={handleBatchSelectAll} disabled={!batchSelectableQrs.length}>全选</Button>
              <Button size="small" onClick={handleBatchSelectInvert} disabled={!batchSelectableQrs.length}>反选</Button>
              <Button size="small" onClick={handleBatchSelectClear} disabled={!batchSelectedBundleQrs.length}>清空</Button>
            </Space>
          </div>

          {batchSelectRows.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '32px 0', color: 'rgba(0,0,0,0.45)' }}>
              {bundlesLoading ? <Spin tip="正在加载菲号..." /> : '该订单暂无裁剪菲号'}
            </div>
          ) : (
            <ResizableTable<BatchSelectBundleRow>
              storageKey="inspection-batch-select"
              size="small" rowKey="qr" pagination={false}
              dataSource={batchSelectRows}
              scroll={{ y: 360 }}
              rowSelection={{
                selectedRowKeys: batchSelectedBundleQrs,
                onChange: (keys, rows) => handleBatchSelectionChange(keys, rows as BatchSelectBundleRow[]),
                getCheckboxProps: (record) => ({ disabled: !!record.disabled }),
              }}
              columns={[
                { title: '菲号', dataIndex: 'qr', width: 180, ellipsis: true },
                { title: '扎号', dataIndex: 'bundleNo', width: 70, render: (v: unknown) => v ? String(v) : '-' },
                { title: '颜色', dataIndex: 'color', width: 80, render: (v: unknown) => String(v || '') || '-' },
                { title: '码数', dataIndex: 'size', width: 70, render: (v: unknown) => String(v || '') || '-' },
                { title: '数量', dataIndex: 'quantity', width: 60, align: 'center' as const },
                {
                  title: '可质检', dataIndex: 'availableQty', width: 70, align: 'center' as const,
                  render: (v: number, record: BatchSelectBundleRow) => record.disabled ? <Text type="secondary">-</Text> : v,
                },
                {
                  title: '状态', dataIndex: 'statusText', width: 120,
                  render: (v: any, record: BatchSelectBundleRow) => {
                    if (record.disabled) return <Tag color="default">{v || '不可质检'}</Tag>;
                    if (isBundleBlockedForWarehousing(record.rawStatus)) return <Tag color="warning">{v}</Tag>;
                    return <Tag color="processing">{v || '可质检'}</Tag>;
                  },
                },
              ]}
            />
          )}
        </div>

        {/* 质检表单 - 选中菲号后显示 */}
        {showQcForm && (
          <Card size="small"
            title={isMultiSelected ? `批量质检（${batchSelectedBundleQrs.length} 个菲号）` : '质检操作'}
            style={{ marginTop: 8 }}>
            <Form form={qcForm} layout="vertical">
              {/* 隐藏字段 */}
              <Form.Item name="orderNo" hidden><Input /></Form.Item>
              <Form.Item name="orderId" hidden><Input /></Form.Item>
              <Form.Item name="styleId" hidden><Input /></Form.Item>
              <Form.Item name="styleNo" hidden><Input /></Form.Item>
              <Form.Item name="styleName" hidden><Input /></Form.Item>
              <Form.Item name="cuttingBundleId" hidden><Input /></Form.Item>
              <Form.Item name="cuttingBundleNo" hidden><Input /></Form.Item>
              <Form.Item name="cuttingBundleQrCode" hidden><Input /></Form.Item>
              <Form.Item name="qualityStatus" hidden><Input /></Form.Item>
              <Form.Item name="unqualifiedImageUrls" hidden><Input /></Form.Item>

              {/* 已选菲号摘要 */}
              {isSingleSelected && singleSelectedBundle && (
                <Alert type="info" showIcon style={{ marginBottom: 12 }}
                  message={`菲号: ${singleSelectedBundle.qrCode}  颜色: ${singleSelectedBundle.color || '-'}  码数: ${singleSelectedBundle.size || '-'}  质检数量: ${batchQtyByQr[String(singleSelectedBundle.qrCode || '').trim()] || singleSelectedBundle.quantity || 0}`}
                />
              )}
              {isMultiSelected && (
                <Alert type="info" showIcon style={{ marginBottom: 12 }}
                  message={`已选 ${batchSelectedBundleQrs.length} 个菲号，合计 ${batchSelectedSummary.totalQty} 件`} />
              )}

              {/* 返修统计（单选且次品待返修） */}
              {isSingleSelected && isSingleSelectedBundleBlocked && singleSelectedBundleRepairStats && (
                <Alert type="warning" style={{ marginBottom: 12 }}
                  message="该菲号为次品待返修"
                  description={`返修池: ${singleSelectedBundleRepairStats.repairPool}  已返修: ${singleSelectedBundleRepairStats.repairedOut}  可入库: ${singleSelectedBundleRepairStats.remaining}`}
                />
              )}

              {/* 批量模式：批量合格 */}
              {isMultiSelected && !batchSelectedHasBlocked && (
                <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
                  <Button type="primary" size="large" loading={submitLoading}
                    onClick={handleBatchQualifiedSubmit}>
                    批量合格质检（{batchSelectedSummary.totalQty} 件）
                  </Button>
                  <Button onClick={handleBatchSelectClear}>取消</Button>
                </div>
              )}
              {isMultiSelected && batchSelectedHasBlocked && (
                <Alert type="warning" showIcon style={{ marginBottom: 12 }}
                  message="选中包含次品待返修菲号，请逐个处理或取消选择后再批量操作" />
              )}

              {/* 单选模式：完整质检表单 */}
              {isSingleSelected && (
                <>
                  <Row gutter={16}>
                    <Col span={8}>
                      <Form.Item name="warehousingQuantity" label="质检数量">
                        <InputNumber style={{ width: '100%' }} disabled />
                      </Form.Item>
                    </Col>
                    <Col span={8}>
                      <Form.Item name="qualifiedQuantity" label="合格数量">
                        <InputNumber style={{ width: '100%' }} disabled />
                      </Form.Item>
                    </Col>
                    <Col span={8}>
                      <Form.Item name="unqualifiedQuantity" label="不合格数量">
                        <InputNumber
                          style={{ width: '100%' }}
                          min={0}
                          max={Number(watchedWarehousingQty || 0) || 0}
                          disabled={isSingleSelectedBundleBlocked}
                          onChange={(val) => {
                            const total = Number(watchedWarehousingQty || 0) || 0;
                            const unq = Math.max(0, Math.min(total, Number(val || 0) || 0));
                            qcForm.setFieldsValue({
                              unqualifiedQuantity: unq,
                              qualifiedQuantity: Math.max(0, total - unq),
                              qualityStatus: unq > 0 ? 'unqualified' : 'qualified',
                            });
                          }}
                        />
                      </Form.Item>
                    </Col>
                  </Row>

                  {unqQty > 0 && (
                    <>
                      <Row gutter={16}>
                        <Col span={12}>
                          <Form.Item name="defectCategory" label="次品类别"
                            rules={[{ required: true, message: '请选择次品类别' }]}>
                            <Select options={DEFECT_CATEGORY_OPTIONS} placeholder="请选择" allowClear />
                          </Form.Item>
                        </Col>
                        <Col span={12}>
                          <Form.Item name="defectRemark" label="处理方式"
                            rules={[{ required: true, message: '请选择处理方式' }]}>
                            <Select options={DEFECT_REMARK_OPTIONS} placeholder="请选择" allowClear />
                          </Form.Item>
                        </Col>
                      </Row>

                      <Form.Item label="不合格图片">
                        <UnqualifiedUpload
                          fileList={unqualifiedFileList}
                          disabled={submitLoading}
                          onUpload={uploadOneUnqualifiedImage}
                          onRemove={(file) => {
                            setUnqualifiedFileList((prev) => {
                              const next = prev.filter((f) => f.uid !== file.uid);
                              qcForm.setFieldsValue({
                                unqualifiedImageUrls: JSON.stringify(
                                  next.map((f: any) => String(f?.url || '').trim()).filter(Boolean)
                                ),
                              });
                              return next;
                            });
                          }}
                          onPreview={() => {}}
                        />
                      </Form.Item>

                      <Form.Item name="repairRemark" label="返修备注">
                        <Input.TextArea rows={2} placeholder="返修说明" />
                      </Form.Item>
                    </>
                  )}

                  <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
                    <Button type="primary" size="large" loading={submitLoading} onClick={handleQcSubmit}>
                      确定
                    </Button>
                    <Button onClick={handleBatchSelectClear}>取消选择</Button>
                  </div>
                </>
              )}
            </Form>
          </Card>
        )}

        {!showQcForm && batchSelectRows.length > 0 && (
          <Alert type="info" showIcon style={{ marginTop: 8 }}
            message="请勾选上方菲号，开始质检操作" />
        )}
      </div>
    );
  };

  /* ==================== 主渲染 ==================== */
  if (loading) {
    return (
      <Layout>
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 400 }}>
          <Spin size="large" tip="加载中..." />
        </div>
      </Layout>
    );
  }

  if (!briefing) {
    return (
      <Layout>
        <Card>
          <Alert type="error" message="无法加载质检简报数据" showIcon />
          <Button type="link" onClick={() => navigate('/production/warehousing')}>返回质检入库列表</Button>
        </Card>
      </Layout>
    );
  }

  const { order, style, bom, qualityTips } = briefing;
  const styleId = orderDetail?.styleId || (order as any)?.styleId;
  const plateTypeKey = String((order as any)?.plateType || '').trim().toUpperCase();
  const urgencyKey = String((order as any)?.urgencyLevel || '').trim().toLowerCase();

  return (
    <Layout>
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

        {/* 两栏布局：左侧信息 + 右侧（上方标签页 + 下方质检操作区） */}
        <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: 16, minHeight: 'calc(100vh - 200px)' }}>
          {/* ========== 左侧信息栏 ========== */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <Card size="small" title="款式信息">
              <div style={{ textAlign: 'center', marginBottom: 12 }}>
                {(style?.cover || order?.styleCover) ? (
                  <Image
                    src={getFullAuthedFileUrl(style?.cover || order?.styleCover)} alt={order.styleName}
                    width={200} height={240}
                    style={{ objectFit: 'cover', borderRadius: 8 }}
                    fallback="data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjI0MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjZjBmMGYwIi8+PHRleHQgeD0iNTAlIiB5PSI1MCUiIGRvbWluYW50LWJhc2VsaW5lPSJtaWRkbGUiIHRleHQtYW5jaG9yPSJtaWRkbGUiIGZpbGw9IiNjY2MiIGZvbnQtc2l6ZT0iMTQiPuaXoOWbvueJhzwvdGV4dD48L3N2Zz4="
                  />
                ) : (
                  <div style={{
                    width: 200, height: 240, background: '#f5f5f5', borderRadius: 8,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ccc', margin: '0 auto',
                  }}>
                    无图片
                  </div>
                )}
              </div>
              <Descriptions column={1} size="small">
                <Descriptions.Item label="款号">{order.styleNo}</Descriptions.Item>
                <Descriptions.Item label="款名">{order.styleName}</Descriptions.Item>
                <Descriptions.Item label="订单数量">{order.orderQuantity}</Descriptions.Item>
                <Descriptions.Item label="工厂">{order.factoryName || '-'}</Descriptions.Item>
                <Descriptions.Item label="跟单员">{order.merchandiser || '-'}</Descriptions.Item>
              </Descriptions>
            </Card>

            <Card size="small" title={<><ExperimentOutlined style={{ marginRight: 6 }} />质检注意事项</>}>
              <List
                size="small" dataSource={qualityTips}
                renderItem={(tip: string, idx: number) => (
                  <List.Item style={{
                    padding: '4px 0',
                    borderBottom: idx < qualityTips.length - 1 ? '1px dashed #f0f0f0' : 'none',
                  }}>
                    {tip.startsWith('\u26a0') ? (
                      <Text type="warning" strong>{tip}</Text>
                    ) : (
                      <Text><span style={{ color: '#999', marginRight: 6 }}>{idx + 1}.</span>{tip}</Text>
                    )}
                  </List.Item>
                )}
              />
            </Card>

            {order.remarks && (
              <Alert type="info" message="订单备注" description={order.remarks} showIcon />
            )}
          </div>

          {/* ========== 右侧：上方标签页 + 下方质检操作区 ========== */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* 上方：参考信息标签页（质检记录 / BOM物料 / 尺寸表）*/}
            <Card size="small" style={{ overflow: 'auto' }}>
              <Tabs
                activeKey={activeTab} onChange={setActiveTab}
                items={[
                  {
                    key: 'records',
                    label: <><OrderedListOutlined /> 质检记录 {qcStats.count > 0 ? `(${qcStats.count})` : ''}</>,
                    children: <div style={{ padding: '8px 0' }}>{renderQcRecords()}</div>,
                  },
                  {
                    key: 'orderLines',
                    label: '入库进度',
                    children: renderOrderLines(),
                  },
                  {
                    key: 'bom',
                    label: `BOM物料 (${bom.length})`,
                    children: (
                      <div style={{ padding: '8px 0' }}>
                        <ResizableTable
                          storageKey="inspection-bom"
                          rowKey="id" size="small" pagination={false} scroll={{ x: 'max-content' }}
                          dataSource={bom}
                          columns={[
                            { title: '物料编码', dataIndex: 'materialCode', key: 'mc', width: 100 },
                            { title: '物料名称', dataIndex: 'materialName', key: 'mn', width: 120, ellipsis: true },
                            { title: '类型', dataIndex: 'materialType', key: 'mt', width: 70,
                              render: (v: unknown) => getMaterialTypeLabel(v) },
                            { title: '颜色', dataIndex: 'color', key: 'c', width: 70 },
                            { title: '尺码', dataIndex: 'size', key: 's', width: 60 },
                            { title: '单位', dataIndex: 'unit', key: 'u', width: 50 },
                            { title: '用量', dataIndex: 'usageAmount', key: 'ua', width: 60, render: (v: number) => v?.toFixed(2) },
                            { title: '损耗率', dataIndex: 'lossRate', key: 'lr', width: 70, render: (v: number) => v ? `${(v * 100).toFixed(1)}%` : '-' },
                          ]}
                        />
                      </div>
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
                      <div style={{ padding: '8px 0' }}>
                        {(() => {
                          const desc = String(style?.description || '').trim();
                          if (!desc) {
                            return (
                              <div style={{ textAlign: 'center', padding: 40, color: 'rgba(0,0,0,0.45)' }}>
                                暂无生产制单数据
                              </div>
                            );
                          }
                          const reviewStatus = String(style?.sampleReviewStatus || '').trim().toUpperCase();
                          const reviewComment = String(style?.sampleReviewComment || '').trim();
                          const reviewBy = String(style?.sampleReviewer || '').trim();
                          const reviewTime = String(style?.sampleReviewTime || '').trim();
                          const reviewLabel =
                            reviewStatus === 'PASS' ? '通过'
                              : reviewStatus === 'REWORK' ? '需修改'
                                : reviewStatus === 'REJECT' ? '不通过'
                                  : reviewStatus === 'PENDING' ? '待审核'
                                    : '';
                          const rawLines = desc.split(/\r?\n/).map(s => s.replace(/^\d+[.、\s]+/, '').trim()).filter(Boolean);
                          const fixedRows = Array.from({ length: Math.max(15, rawLines.length) }, (_, i) => ({
                            key: i, seq: i + 1, content: rawLines[i] || '',
                          }));
                          return (
                            <>
                              {(reviewLabel || reviewComment || reviewBy || reviewTime) && (
                                <div style={{
                                  marginBottom: 12,
                                  padding: '10px 12px',
                                  border: '1px solid var(--neutral-border, #e8e8e8)',
                                  borderRadius: 6,
                                  background: 'var(--neutral-bg, #fafafa)',
                                  fontSize: 12,
                                  lineHeight: '20px',
                                }}>
                                  <div style={{ marginBottom: 4, fontWeight: 600 }}>样衣审核</div>
                                  <div>
                                    <span>审核状态：{reviewLabel || '-'}</span>
                                    <span style={{ marginLeft: 16 }}>审核人：{reviewBy || '-'}</span>
                                    <span style={{ marginLeft: 16 }}>审核时间：{reviewTime ? formatDateTime(reviewTime) : '-'}</span>
                                  </div>
                                  {reviewComment && <div style={{ marginTop: 4, whiteSpace: 'pre-wrap' }}>审核评语：{reviewComment}</div>}
                                </div>
                              )}
                              <Title level={5} style={{ marginBottom: 12 }}>生产要求</Title>
                              <ResizableTable
                                storageKey="inspection-requirements"
                                size="small" rowKey="key" pagination={false}
                                dataSource={fixedRows}
                                columns={[
                                  { title: '序号', dataIndex: 'seq', key: 'seq', width: 60, align: 'center' as const },
                                  { title: '内容', dataIndex: 'content', key: 'content' },
                                ]}
                              />
                            </>
                          );
                        })()}
                      </div>
                    ),
                  },
                ]}
              />
            </Card>

            {/* 下方：质检操作区（始终可见，平铺展示）*/}
            <Card
              size="small"
              title={<><CheckCircleOutlined style={{ marginRight: 6 }} />质检操作</>}
            >
              {renderInspectForm()}
            </Card>
          </div>
        </div>

        {/* ========== 入库弹窗 ========== */}
        <Modal
          title="入库操作"
          open={showWarehousingModal}
          onCancel={() => setShowWarehousingModal(false)}
          footer={null}
          width={800}
          destroyOnClose
        >
          {renderWarehousingAction()}
        </Modal>
    </Layout>
  );
};

export default InspectionDetail;
