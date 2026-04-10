import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { Card, Spin, Button, Tabs, Alert, Descriptions, Tag, Image, Typography, Space, Statistic, Row, Col, Form } from 'antd';
import ResizableModal from '@/components/common/ResizableModal';
import {
  ArrowLeftOutlined, CheckCircleOutlined,
  InboxOutlined, OrderedListOutlined,
} from '@ant-design/icons';
import Layout from '@/components/Layout';
import ResizableTable from '@/components/common/ResizableTable';
import api, { type ApiResult, toNumberSafe, parseProductionOrderLines, fetchProductionOrderDetail } from '@/utils/api';
import { getFullAuthedFileUrl } from '@/utils/fileUrl';
import { formatDateTime } from '@/utils/datetime';
import { getMaterialTypeLabel } from '@/utils/materialType';
import { ProductWarehousing as WarehousingType, ProductionOrder } from '@/types/production';
import { OrderLineWarehousingRow, WarehousingDetailRecord, CuttingBundleRow, OrderLine } from '../../types';
import { getQualityStatusConfig, getDefectCategoryLabel, getDefectRemarkLabel } from '../../utils';


import BatchUnqualifiedModal from '../../components/WarehousingModal/BatchUnqualifiedModal';
import { useWarehousingForm } from '../../components/WarehousingModal/hooks/useWarehousingForm';
import StyleSizeTab from '@/modules/basic/pages/StyleInfo/components/StyleSizeTab';
import { qualityAiApi } from '@/services/production/productionApi';
import type { QualityAiSuggestionResult } from '@/services/production/productionApi';
import { message } from '@/utils/antdStatic';
import DictAutoComplete from '@/components/common/DictAutoComplete';
import XiaoyunCloudAvatar from '@/components/common/XiaoyunCloudAvatar';
import InspectFormPanel from './InspectFormPanel';

const { Title, Text } = Typography;

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

  /* ---- AI质检意见 ---- */
  const [aiSuggestion, setAiSuggestion] = useState<QualityAiSuggestionResult | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [orderDetail, setOrderDetail] = useState<ProductionOrder | null>(null);
  const [orderDetailLoading, setOrderDetailLoading] = useState(false);
  const [bundles, setBundles] = useState<CuttingBundleRow[]>([]);

  /* ---- 入库 ---- */
  const [warehouseValue, setWarehouseValue] = useState('');
  const [warehousingLoading, setWarehousingLoading] = useState(false);
  const [showWarehousingModal, setShowWarehousingModal] = useState(false);
  const [markingRepairBundleId, setMarkingRepairBundleId] = useState<string | null>(null);

  /* ---- 批量不合格弹窗 ---- */
  const [batchUnqualifiedModalOpen, setBatchUnqualifiedModalOpen] = useState(false);
  const [_batchUnqualifiedForm] = Form.useForm();

  /* ---- 内联质检表单 ---- */
  const formHook = useWarehousingForm(
    true, null,
    () => navigate('/production/warehousing'),
    () => { message.success('质检完成'); fetchBriefing(); fetchQcRecords(); },
    briefing?.order?.orderNo,
  );

  // 从 formHook 提取需要在组件顶层使用的变量
  const {
    submitLoading,
    batchSelectedSummary,
    unqualifiedFileList,
    setUnqualifiedFileList,
    handleBatchUnqualifiedSubmit,
    uploadOneUnqualifiedImage,
  } = formHook;

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
    } catch (err: unknown) {
      message.error(`获取质检简报失败: ${err instanceof Error ? err.message : '请检查网络连接'}`);
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

  useEffect(() => {
    if (!orderId) return;
    setAiLoading(true);
    qualityAiApi.getSuggestion(orderId)
      .then((res: ApiResult) => { setAiSuggestion(res?.data ?? null); })
      .catch(() => {})
      .finally(() => setAiLoading(false));
  }, [orderId]);

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

  /** 本订单实际已发现的缺陷类别（用于高亮显示相关处理建议） */
  const actualDefectSet = useMemo(() => {
    const set = new Set<string>();
    for (const r of qcRecords) {
      if (r.defectCategory && Number(r.unqualifiedQuantity || 0) > 0) {
        set.add(r.defectCategory);
      }
    }
    return set;
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
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : '入库失败');
    } finally {
      setWarehousingLoading(false);
    }
  };

  /* ==================== 渲染：下单明细（制单tab） ==================== */
  const renderOrderLines = () => (
    <div style={{ padding: '8px 0' }}>
      <ResizableTable<OrderLineWarehousingRow>
        size="small" rowKey="key" loading={orderDetailLoading}
        pagination={false} dataSource={orderLineWarehousingRows}
        resizableColumns={false}
        scroll={undefined}
        style={{ fontSize: 12 }}
        columns={[
          { title: '订单号', dataIndex: 'orderNo', key: 'orderNo', width: 150, ellipsis: true },
          { title: '款号', dataIndex: 'styleNo', key: 'styleNo', width: 120, ellipsis: true },
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
            <ResizableTable.Summary>
              <ResizableTable.Summary.Row>
                <ResizableTable.Summary.Cell index={0}><strong>合计</strong></ResizableTable.Summary.Cell>
                <ResizableTable.Summary.Cell index={1} />
                <ResizableTable.Summary.Cell index={2} />
                <ResizableTable.Summary.Cell index={3} />
                <ResizableTable.Summary.Cell index={4} align="right"><strong>{totals.quantity}</strong></ResizableTable.Summary.Cell>
                <ResizableTable.Summary.Cell index={5} align="right">
                  <strong style={{ color: 'var(--color-success)' }}>{totals.warehousedQuantity}</strong>
                </ResizableTable.Summary.Cell>
                <ResizableTable.Summary.Cell index={6} align="right">
                  <strong style={{ color: totals.unqualifiedQuantity > 0 ? 'var(--color-danger)' : undefined }}>
                    {totals.unqualifiedQuantity}
                  </strong>
                </ResizableTable.Summary.Cell>
                <ResizableTable.Summary.Cell index={7} align="right">
                  <strong style={{ color: totals.unwarehousedQuantity > 0 ? 'var(--color-warning)' : 'var(--color-success)' }}>
                    {totals.unwarehousedQuantity}
                  </strong>
                </ResizableTable.Summary.Cell>
              </ResizableTable.Summary.Row>
            </ResizableTable.Summary>
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

      {/* 质检通过率异常警告 */}
      {qcStats.total > 0 && qcRecords.length > 0 && (() => {
        const passRate = Math.round(qcStats.qualified / qcStats.total * 100);
        if (passRate >= 80) return null;
        return (
          <Alert
            type="warning"
            showIcon
            style={{ marginBottom: 12 }}
            title={`批次质检通过率偏低：当前通过率 ${passRate}%（合格 ${qcStats.qualified} / 总计 ${qcStats.total}），低于警戒线 80%，请复核不合格原因。`}
          />
        );
      })()}

      {/* 质检记录明细 */}
      <Card size="small" title="质检记录明细" loading={recordsLoading}>
        <ResizableTable<WarehousingDetailRecord>
          size="small" rowKey="id" pagination={false}
          dataSource={qcRecords}
          resizableColumns={false}
          scroll={undefined}
          style={{ fontSize: 12 }}
          rowClassName={(record) =>
            highlightWhNo && record.warehousingNo === highlightWhNo ? 'ant-table-row-selected' : ''
          }
          columns={[
            {
              title: '质检入库号', dataIndex: 'warehousingNo', key: 'wn', width: 110,
              render: (v: string) => <Text strong={highlightWhNo === v}>{v || '-'}</Text>,
            },
            {
              title: '菲号', dataIndex: 'cuttingBundleQrCode', key: 'qr', width: 100, ellipsis: true,
              render: (v: unknown) => { const t = String(v || '').split('|')[0].trim(); if (!t) return '-'; const parts = t.split('-'); return parts.length > 3 ? parts.slice(-3).join('-') : t; },
            },
            { title: '颜色', dataIndex: 'color', key: 'color', width: 70 },
            { title: '尺码', dataIndex: 'size', key: 'size', width: 60 },
            { title: '质检数', dataIndex: 'warehousingQuantity', key: 'wq', width: 70, align: 'right' as const },
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
      return <Alert type="success" title="该订单所有合格质检记录均已入库完成！" showIcon />;
    }

    return (
      <>
        <Alert type="info" showIcon style={{ marginBottom: 16 }}
          title={`共 ${pendingRecords.length} 条合格记录待入库，合格数量合计 ${pendingQty} 件`} />

        <Card size="small" title="待入库记录" style={{ marginBottom: 16 }}>
          <ResizableTable<WarehousingDetailRecord>
            size="small" rowKey="id" pagination={false}
            dataSource={pendingRecords}
            resizableColumns={false}
            scroll={undefined}
            style={{ fontSize: 12 }}
            columns={[
              { title: '质检入库号', dataIndex: 'warehousingNo', key: 'wn', width: 110 },
              {
                title: '菲号', dataIndex: 'cuttingBundleQrCode', key: 'qr', width: 100, ellipsis: true,
                render: (v: unknown) => { const t = String(v || '').split('|')[0].trim(); if (!t) return '-'; const parts = t.split('-'); return parts.length > 3 ? parts.slice(-3).join('-') : t; },
              },
              { title: '颜色', dataIndex: 'color', key: 'c', width: 70 },
              { title: '尺码', dataIndex: 'size', key: 's', width: 60 },
              { title: '合格数', dataIndex: 'qualifiedQuantity', key: 'qq', width: 70, align: 'right' as const },
            ]}
          />
        </Card>

        <Card size="small" title="选择仓库并确认入库">
          <Space orientation="vertical" style={{ width: '100%' }} size="middle">
            <div>
              <Text strong style={{ marginRight: 12 }}>入库仓库：</Text>
              <DictAutoComplete
                dictType="warehouse_location"
                placeholder="请选择或输入仓库"
                value={warehouseValue || undefined}
                onChange={(v) => setWarehouseValue(String(v || '').trim())}
                style={{ width: 200 }}
              />
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

  /* ==================== 标记已返修 ==================== */
  const handleMarkRepaired = useCallback(async (bundleId: string) => {
    if (!bundleId) return;
    setMarkingRepairBundleId(bundleId);
    try {
      const res = await api.post<{ code: number; message?: string }>(
        '/production/warehousing/mark-bundle-repaired',
        { bundleId },
      );
      if (res.code === 200) {
        message.success('已标记为返修完成，可重新进行质检');
        // 刷新菲号列表（useWarehousingForm 内部菲号）
        const orderNo = briefing?.order?.orderNo;
        if (orderNo) await formHook.fetchBundlesByOrderNo(orderNo);
        // 刷新质检记录列表
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

  /* ==================== 主渲染 ==================== */
  if (loading) {
    return (
      <Layout>
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 400 }}>
          <Spin size="large" spinning tip="加载中..."><div /></Spin>
        </div>
      </Layout>
    );
  }

  if (!briefing) {
    return (
      <Layout>
        <Card>
          <Alert type="error" title="无法加载质检简报数据" showIcon />
          <Button type="link" onClick={() => navigate('/production/warehousing')}>返回质检入库列表</Button>
        </Card>
      </Layout>
    );
  }

  const { order, style, bom } = briefing;
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

            {/* 智能质检助手 */}
            <Card
              size="small"
              style={{ background: '#fff', border: '1px solid #d6e4ff' }}
              title={
                <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <XiaoyunCloudAvatar size={18} active />
                  <span style={{ fontWeight: 600, color: '#1677ff' }}>智能质检助手</span>
                  {aiSuggestion?.historicalDefectRate !== undefined && (
                    <span style={{
                      fontSize: 11, fontWeight: 400, padding: '1px 7px',
                      borderRadius: 10, background:
                        aiSuggestion.historicalDefectRate > 0.05 ? '#fff1f0'
                          : aiSuggestion.historicalDefectRate > 0.02 ? '#fff7e6' : '#f6ffed',
                      color: aiSuggestion.historicalDefectRate > 0.05 ? '#ff4d4f'
                        : aiSuggestion.historicalDefectRate > 0.02 ? '#fa8c16' : '#52c41a',
                    }}>
                      历史次品率 {(aiSuggestion.historicalDefectRate * 100).toFixed(1)}%
                    </span>
                  )}
                </span>
              }
              loading={aiLoading}
            >
              {!aiSuggestion && !aiLoading && (
                <div style={{ color: '#aaa', textAlign: 'center', padding: '16px 0', fontSize: 12 }}>
                  <div style={{ fontSize: 20, marginBottom: 6 }}></div>
                  AI正在分析订单数据，请稍后…
                </div>
              )}
              {aiSuggestion && (
                <div style={{ fontSize: 14, lineHeight: 1.8 }}>
                  {aiSuggestion.urgentTip && (
                    <div style={{
                      padding: '6px 12px', background: '#fff7e6',
                      border: '1px solid #ffd591', borderRadius: 6,
                      marginBottom: 10, color: '#d46b08', fontWeight: 600, fontSize: 14,
                    }}>
                       {aiSuggestion.urgentTip}
                    </div>
                  )}
                  <div style={{ fontWeight: 600, color: '#333', marginBottom: 8, fontSize: 14 }}>质检要点</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {aiSuggestion.checkpoints.map((cp, i) => {
                      const isRed = cp.startsWith('🔴');
                      const isYellow = cp.startsWith('🟡');
                      return (
                        <div key={i} style={{
                          padding: '6px 10px',
                          background: isRed ? '#fff1f0' : isYellow ? '#fffbe6' : '#f6ffed',
                          borderLeft: `3px solid ${isRed ? '#ff4d4f' : isYellow ? '#faad14' : '#52c41a'}`,
                          borderRadius: '0 4px 4px 0',
                          color: '#333', fontSize: 14,
                        }}>
                          {cp}
                        </div>
                      );
                    })}
                  </div>
                  {aiSuggestion.defectSuggestions && Object.keys(aiSuggestion.defectSuggestions).length > 0 && (
                    <>
                      <div style={{ fontWeight: 600, color: '#333', marginTop: 12, marginBottom: 8, fontSize: 14 }}>
                        缺陷处理建议
                        {actualDefectSet.size === 0 && (
                          <span style={{ fontWeight: 400, fontSize: 12, color: '#aaa', marginLeft: 6 }}>（本批暂无次品）</span>
                        )}
                        {actualDefectSet.size > 0 && (
                          <span style={{ fontWeight: 400, fontSize: 12, color: '#f5222d', marginLeft: 6 }}> 本批已发现 {actualDefectSet.size} 类缺陷</span>
                        )}
                      </div>
                      {Object.entries(aiSuggestion.defectSuggestions)
                        .sort(([aKey], [bKey]) => (actualDefectSet.has(bKey) ? 1 : 0) - (actualDefectSet.has(aKey) ? 1 : 0))
                        .map(([defect, advice]) => {
                          const isActual = actualDefectSet.has(defect);
                          return (
                            <div key={defect} style={{
                              marginBottom: 6, padding: '6px 10px',
                              background: isActual ? '#fff2f0' : '#fafafa',
                              borderLeft: `3px solid ${isActual ? '#ff4d4f' : '#e8e8e8'}`,
                              borderRadius: '0 4px 4px 0',
                            }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                                {isActual && (
                                  <span style={{ background: '#ff4d4f', color: '#fff', fontSize: 11, padding: '1px 5px', borderRadius: 2, flexShrink: 0 }}>本批已发现</span>
                                )}
                                <span style={{ fontWeight: 600, color: isActual ? '#cf1322' : '#595959', fontSize: 13 }}>
                                  {getDefectCategoryLabel(defect)}
                                </span>
                              </div>
                              <div style={{ color: '#555', fontSize: 13, lineHeight: 1.6 }}>{advice}</div>
                            </div>
                          );
                        })}
                    </>
                  )}
                </div>
              )}
            </Card>
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
                          rowKey="id" size="small" pagination={false}
                          resizableColumns={false}
                          scroll={undefined}
                          dataSource={bom}
                          columns={[
                            { title: '物料编码', dataIndex: 'materialCode', key: 'mc', width: 100 },
                            { title: '物料名称', dataIndex: 'materialName', key: 'mn', width: 120, ellipsis: true },
                            { title: '物料类型', dataIndex: 'materialType', key: 'mt', width: 70,
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
                                size="small" rowKey="key" pagination={false}
                                resizableColumns={false}
                                dataSource={fixedRows}
                                columns={[
                                  {
                                    title: '内容',
                                    dataIndex: 'content',
                                    key: 'content',
                                    align: 'left' as const,
                                    onHeaderCell: () => ({ style: { textAlign: 'left' as const } }),
                                    onCell: () => ({ style: { textAlign: 'left' as const } }),
                                    render: (text: string) => (
                                      <span style={{ whiteSpace: 'pre-wrap', display: 'block', textAlign: 'left' }}>{text}</span>
                                    ),
                                  },
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
              <InspectFormPanel
                formHook={formHook}
                handleMarkRepaired={handleMarkRepaired}
                markingRepairBundleId={markingRepairBundleId}
                onOpenBatchUnqualified={() => setBatchUnqualifiedModalOpen(true)}
                autoInitDone={autoInitRef.current}
              />
            </Card>
          </div>
        </div>

        {/* ========== 入库弹窗 ========== */}
        <ResizableModal
          title="入库操作"
          open={showWarehousingModal}
          onCancel={() => setShowWarehousingModal(false)}
          footer={null}
          width="60vw"
          initialHeight={Math.round(window.innerHeight * 0.82)}
          destroyOnHidden
        >
          {renderWarehousingAction()}
        </ResizableModal>

        {/* ========== 批量不合格质检弹窗 ========== */}
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
    </Layout>
  );
};

export default InspectionDetail;
