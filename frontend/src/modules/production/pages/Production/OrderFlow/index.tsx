import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Button, Card, Col, Row, Space, Tabs, Tag } from 'antd';

import type { ColumnsType } from 'antd/es/table';
import { useLocation } from 'react-router-dom';
import Layout from '@/components/Layout';
import ResizableTable from '@/components/common/ResizableTable';
import SupplierNameTooltip from '@/components/common/SupplierNameTooltip';
import api, { parseProductionOrderLines, toNumberSafe } from '@/utils/api';
import { useAuth } from '@/utils/AuthContext';
import { formatDateTime } from '@/utils/datetime';
import { getMaterialTypeLabel } from '@/utils/materialType';

import type { CuttingBundle, ProductionOrder, ProductWarehousing } from '@/types/production';
import { StyleCoverThumb } from '@/components/StyleAssets';
import StylePatternSimpleTab from './components/StylePatternSimpleTab';
import StyleQuotationTab from '@/modules/basic/pages/StyleInfo/components/StyleQuotationTab';
import StyleSecondaryProcessTab from '@/modules/basic/pages/StyleInfo/components/StyleSecondaryProcessTab';
import SmartErrorNotice from '@/smart/components/SmartErrorNotice';
import { isSmartFeatureEnabled } from '@/smart/core/featureFlags';
import type { SmartErrorInfo } from '@/smart/core/types';
import '../../../styles.css';
import { message } from '@/utils/antdStatic';
import { formatReferenceKilograms } from '../MaterialPurchase/utils';

type FlowStage = {
  processName: string;
  status: 'not_started' | 'in_progress' | 'completed';
  totalQuantity?: number;
  startTime?: string;
  startOperatorId?: string;
  startOperatorName?: string;
  completeTime?: string;
  completeOperatorId?: string;
  completeOperatorName?: string;
  lastTime?: string;
  lastOperatorId?: string;
  lastOperatorName?: string;
};

type OrderFlowResponse = {
  order: ProductionOrder;
  stages: FlowStage[];
  warehousings?: ProductWarehousing[];
  cuttingBundles?: CuttingBundle[];
  materialPurchases?: any[]; // 物料采购信息
};

type OrderLine = {
  color: string;
  size: string;
  quantity: number;
  skuNo?: string;
  // 统计字段
  totalPrice?: number;
  qualityQuantity?: number;
  defectiveQuantity?: number;
  warehousingQuantity?: number;
};

const orderStatusTag = (status: any) => {
  const s = String(status || '').trim();
  const map: Record<string, { color: string; label: string }> = {
    pending: { color: 'default', label: '待开始' },
    production: { color: 'success', label: '生产中' },
    completed: { color: 'default', label: '已完成' },
    delayed: { color: 'warning', label: '已逾期' },
  };
  const t = map[s] || { color: 'default', label: '未知' };
  return <Tag color={t.color}>{t.label}</Tag>;
};


const statusTag = (status: FlowStage['status']) => {
  if (status === 'completed') return <Tag color="default">已完成</Tag>;
  if (status === 'in_progress') return <Tag color="success">进行中</Tag>;
  return <Tag>未开始</Tag>;
};


const OrderFlow: React.FC = () => {
  const location = useLocation();
  const { user } = useAuth();
  const isFactoryUser = !!(user as any)?.factoryId;

  const query = useMemo(() => {
    const params = new URLSearchParams(location.search);
    return {
      orderId: String(params.get('orderId') || '').trim(),
      orderNo: String(params.get('orderNo') || '').trim(),
      styleNo: String(params.get('styleNo') || '').trim(),
    };
  }, [location.search]);

  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<OrderFlowResponse | null>(null);
  const [smartError, setSmartError] = useState<SmartErrorInfo | null>(null);
  const [styleProcessDescriptionMap, setStyleProcessDescriptionMap] = useState<Map<string, string>>(new Map());
  const [secondaryProcessDescriptionMap, setSecondaryProcessDescriptionMap] = useState<Map<string, string>>(new Map());
  const showSmartErrorNotice = useMemo(() => isSmartFeatureEnabled('smart.production.precheck.enabled'), []);

  const reportSmartError = (title: string, reason?: string, code?: string) => {
    if (!showSmartErrorNotice) return;
    setSmartError({ title, reason, code });
  };

  const fetchFlow = async () => {
    if (!query.orderId) return;
    setLoading(true);
    try {
      const res = await api.get<{ code: number; message: string; data: any }>(`/production/order/flow/${query.orderId}`);
      if (res.code === 200) {
        const flowData = res.data as OrderFlowResponse;
        setData(flowData || null);
        if (showSmartErrorNotice) setSmartError(null);
      } else {
        reportSmartError('订单全流程加载失败', res.message || '服务返回异常，请稍后重试', 'ORDER_FLOW_LOAD_FAILED');
        message.error(res.message || '获取订单全流程失败');
        setData(null);
      }
    } catch (e: any) {
      reportSmartError('订单全流程加载失败', e?.message || '网络异常或服务不可用，请稍后重试', 'ORDER_FLOW_LOAD_EXCEPTION');
      message.error(e?.message || '获取订单全流程失败');
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFlow();
  }, [query.orderId]);

  useEffect(() => {
    const styleId = String(data?.order?.styleId || '').trim();
    if (!styleId) {
      setStyleProcessDescriptionMap(new Map());
      setSecondaryProcessDescriptionMap(new Map());
      return;
    }
    (async () => {
      try {
        const [processRes, secondaryRes] = await Promise.all([
          api.get(`/style/process/list?styleId=${styleId}`),
          api.get(`/style/secondary-process/list?styleId=${styleId}`),
        ]);
        const processRows = Array.isArray((processRes as any)?.data) ? (processRes as any).data : [];
        const secondaryRows = Array.isArray((secondaryRes as any)?.data) ? (secondaryRes as any).data : [];
        const nextProcessMap = new Map<string, string>();
        const nextSecondaryMap = new Map<string, string>();
        processRows.forEach((item: any) => {
          const name = String(item?.processName || item?.name || '').trim();
          const description = String(item?.description || '').trim();
          if (name && description) nextProcessMap.set(name, description);
        });
        secondaryRows.forEach((item: any) => {
          const name = String(item?.processName || item?.name || '').trim();
          const description = String(item?.description || '').trim();
          if (name && description) nextSecondaryMap.set(name, description);
        });
        setStyleProcessDescriptionMap(nextProcessMap);
        setSecondaryProcessDescriptionMap(nextSecondaryMap);
      } catch {
        setStyleProcessDescriptionMap(new Map());
        setSecondaryProcessDescriptionMap(new Map());
      }
    })();
  }, [data?.order?.styleId]);

  // 合并采购信息到stages
  const enrichedStages = useMemo(() => {
    const stages = data?.stages || [];
    const materialPurchases = data?.materialPurchases || [];
    const order = data?.order;

    // 如果有物料采购记录，添加采购节点
    if (materialPurchases.length > 0 || (order?.materialArrivalRate !== undefined && order?.materialArrivalRate !== null)) {
      const purchaseStage: FlowStage = {
        processName: '采购',
        status: 'not_started',
        totalQuantity: 0,
      };

      // 计算采购状态
      const materialArrivalRate = order?.materialArrivalRate || 0;
      if (materialArrivalRate >= 100) {
        purchaseStage.status = 'completed';
      } else if (materialArrivalRate > 0) {
        purchaseStage.status = 'in_progress';
      }

      // 从物料采购记录中获取时间信息
      if (materialPurchases.length > 0) {
        const sortedPurchases = [...materialPurchases].sort((a: any, b: any) => {
          const timeA = a.createTime ? new Date(a.createTime).getTime() : 0;
          const timeB = b.createTime ? new Date(b.createTime).getTime() : 0;
          return timeA - timeB;
        });

        const firstPurchase = sortedPurchases[0] as any;
        const lastPurchase = sortedPurchases[sortedPurchases.length - 1] as any;

        purchaseStage.startTime = firstPurchase?.createTime;
        purchaseStage.startOperatorName = firstPurchase?.creatorName || firstPurchase?.receiverName || '未记录';

        if (purchaseStage.status === 'completed') {
          purchaseStage.completeTime = lastPurchase?.updateTime || lastPurchase?.createTime;
          purchaseStage.completeOperatorName = lastPurchase?.updaterName || lastPurchase?.receiverName || '未记录';
        }

        // 计算总数量
        purchaseStage.totalQuantity = materialPurchases.length;
      }

      // 将采购节点插入到stages的开头（在下单之后）
      const existingPurchaseIndex = stages.findIndex((s: FlowStage) => s.processName === '采购');
      if (existingPurchaseIndex >= 0) {
        // 替换已有的采购节点
        return [...stages.slice(0, existingPurchaseIndex), purchaseStage, ...stages.slice(existingPurchaseIndex + 1)];
      } else {
        // 在第一个节点之后插入采购节点
        return [stages[0], purchaseStage, ...stages.slice(1)].filter(Boolean);
      }
    }

    return stages;
  }, [data]);

  const stageColumns: ColumnsType<FlowStage> = [
    {
      title: '环节',
      dataIndex: 'processName',
      key: 'processName',
      width: 160,
      render: (v: unknown) => String(v || '').trim() || '-',
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 110,
      render: (v: unknown) => statusTag(String(v || 'not_started') as any),
    },
    {
      title: '累计数量',
      dataIndex: 'totalQuantity',
      key: 'totalQuantity',
      width: 110,
      align: 'right',
      render: (v: unknown) => Number(v ?? 0) || 0,
    },
    {
      title: '开始时间',
      dataIndex: 'startTime',
      key: 'startTime',
      width: 170,
      render: (v: unknown) => (String(v || '').trim() ? formatDateTime(v) : '-'),
    },
    {
      title: '开始操作人',
      dataIndex: 'startOperatorName',
      key: 'startOperatorName',
      width: 120,
      render: (v: unknown) => String(v || '').trim() || '-',
    },
    {
      title: '完成时间',
      dataIndex: 'completeTime',
      key: 'completeTime',
      width: 170,
      render: (v: unknown) => (String(v || '').trim() ? formatDateTime(v) : '-'),
    },
    {
      title: '完成操作人',
      dataIndex: 'completeOperatorName',
      key: 'completeOperatorName',
      width: 120,
      render: (v: unknown) => String(v || '').trim() || '-',
    },
    {
      title: '耗时',
      key: 'duration',
      width: 120,
      render: (_: unknown, record: FlowStage) => {
        const start = record.startTime ? new Date(record.startTime).getTime() : 0;
        if (!start) return <span style={{ color: '#bfbfbf' }}>-</span>;
        const end = record.completeTime
          ? new Date(record.completeTime).getTime()
          : record.status === 'in_progress' ? Date.now() : 0;
        if (!end) return <span style={{ color: '#bfbfbf' }}>-</span>;
        const hours = Math.round((end - start) / 3600000);
        if (hours <= 0) return <span style={{ color: '#bfbfbf' }}>-</span>;
        const days = Math.floor(hours / 24);
        const remainHours = hours % 24;
        const label = days > 0 ? `${days}天${remainHours}小时` : `${hours}小时`;
        // 超过7天标橙色，超过14天标红色
        const color = hours > 336 ? '#cf1322' : hours > 168 ? '#fa8c16' : '#595959';
        return (
          <span style={{ color, fontSize: 12, fontWeight: hours > 168 ? 600 : 400 }}>
            {record.status === 'in_progress' ? `⏳${label}` : label}
          </span>
        );
      },
    },
  ];

  const order = data?.order;

  const orderLines = useMemo(() => {
    const lines = parseProductionOrderLines(order || null) as OrderLine[];
    const warehousings = (data?.warehousings || []) as ProductWarehousing[];
    const cuttingBundles = (data?.cuttingBundles || []) as CuttingBundle[];
    // 优先用订单级 factoryUnitPrice，回退到 styleQuotation.totalPrice
    const unitPrice =
      Number(order?.factoryUnitPrice) ||
      Number((data as any)?.styleQuotation?.totalPrice) ||
      0;

    // 为每个SKU计算统计数据
    return lines.map(line => {
      // 找到对应颜色和尺码的裁剪扎
      const matchedBundles = cuttingBundles.filter(b =>
        b.color === line.color && b.size === line.size
      );
      const bundleIds = matchedBundles.map(b => b.id);

      // 根据裁剪扎ID找到对应的入库记录
      const matchedWarehousings = warehousings.filter(w =>
        bundleIds.includes(w.cuttingBundleId || '')
      );

      // 统计质检数量、次品数、入库数
      const qualityQuantity = matchedWarehousings.reduce((sum, w) =>
        sum + (w.qualifiedQuantity || 0) + (w.unqualifiedQuantity || 0), 0);
      const defectiveQuantity = matchedWarehousings.reduce((sum, w) =>
        sum + (w.unqualifiedQuantity || 0), 0);
      const warehousingQuantity = matchedWarehousings.reduce((sum, w) =>
        sum + (w.warehousingQuantity || 0), 0);

      // totalPrice = 每件单价（factoryUnitPrice，对所有尺码行相同）
      const totalPrice = unitPrice > 0 ? unitPrice : 0;

      return {
        ...line,
        totalPrice,
        qualityQuantity,
        defectiveQuantity,
        warehousingQuantity,
      };
    });
  }, [order, data?.warehousings, data?.cuttingBundles, (data as any)?.styleQuotation]);

  const orderLineColumns: ColumnsType<OrderLine> = [
    { title: 'SKU号', dataIndex: 'skuNo', key: 'skuNo', width: 240, ellipsis: true, render: (v: unknown) => String(v || '').trim() || '-' },
    { title: '颜色', dataIndex: 'color', key: 'color', width: 140, render: (v: unknown) => String(v || '').trim() || '-' },
    { title: '尺码', dataIndex: 'size', key: 'size', width: 100, render: (v: unknown) => String(v || '').trim() || '-' },
    { title: '数量', dataIndex: 'quantity', key: 'quantity', width: 90, align: 'right', render: (v: unknown) => toNumberSafe(v) },
    { title: '单价', dataIndex: 'totalPrice', key: 'totalPrice', width: 110, align: 'right', render: (v: unknown) => {
      const val = toNumberSafe(v);
      return val > 0 ? `¥${val.toFixed(2)}` : '-';
    }},
    { title: '质检数', dataIndex: 'qualityQuantity', key: 'qualityQuantity', width: 90, align: 'right', render: (v: unknown) => {
      const val = toNumberSafe(v);
      return val > 0 ? <span style={{ color: 'var(--primary-color)' }}>{val}</span> : '-';
    }},
    { title: '次品数', dataIndex: 'defectiveQuantity', key: 'defectiveQuantity', width: 90, align: 'right', render: (v: unknown) => {
      const val = toNumberSafe(v);
      return val > 0 ? <span style={{ color: 'var(--color-danger)' }}>{val}</span> : '-';
    }},
    { title: '入库数', dataIndex: 'warehousingQuantity', key: 'warehousingQuantity', width: 90, align: 'right', render: (v: unknown) => {
      const val = toNumberSafe(v);
      return val > 0 ? <span style={{ color: 'var(--color-success)' }}>{val}</span> : '-';
    }},
  ];

  // 计算入库统计
  const warehousingTotal = useMemo(
    () => (data?.warehousings || []).reduce((sum, w) => sum + toNumberSafe((w as any)?.warehousingQuantity), 0),
    [data?.warehousings],
  );
  const warehousingQualified = useMemo(
    () => (data?.warehousings || []).reduce((sum, w) => sum + toNumberSafe((w as any)?.qualifiedQuantity), 0),
    [data?.warehousings],
  );
  const warehousingUnqualified = useMemo(
    () => (data?.warehousings || []).reduce((sum, w) => sum + toNumberSafe((w as any)?.unqualifiedQuantity), 0),
    [data?.warehousings],
  );

  const cuttingSizeItems = useMemo(() => {
    const bundles = (data?.cuttingBundles || []) as CuttingBundle[];
    if (bundles.length === 0) return undefined;
    const map = new Map<string, { color?: string; size: string; quantity: number }>();
    bundles.forEach(bundle => {
      const color = String(bundle.color || '').trim();
      const size = String(bundle.size || '').trim();
      const qty = toNumberSafe(bundle.quantity);
      if (size && qty > 0) {
        const key = `${color}__${size}`;
        const cur = map.get(key);
        if (cur) { cur.quantity += qty; }
        else { map.set(key, { color: color || undefined, size, quantity: qty }); }
      }
    });
    return Array.from(map.values());
  }, [data?.cuttingBundles]);

  return (
    <Layout>
        <Card className="page-card">
          {showSmartErrorNotice && smartError ? (
            <div style={{ marginBottom: 12 }}>
              <SmartErrorNotice error={smartError} onFix={fetchFlow} />
            </div>
          ) : null}
          <div className="page-header">
            <h2 className="page-title">订单全流程记录</h2>
            <Space wrap>
              {query.orderNo ? <Tag>订单号：{query.orderNo}</Tag> : null}
              {query.styleNo ? <Tag>款号：{query.styleNo}</Tag> : null}
              <Button
                onClick={fetchFlow}
                loading={loading}
              >
                刷新数据
              </Button>
            </Space>
          </div>

          {!query.orderId ? (
            <Alert
              type="warning"
              showIcon
              title="缺少订单ID，无法打开全流程记录"
              description="请从我的订单列表点击订单号进入。"
            />
          ) : null}

          <Card size="small" className="order-flow-detail" style={{ marginTop: 8 }} loading={loading}>
            <Row gutter={0} align="top" wrap={false}>
              {/* 封面图 */}
              <Col flex="none" style={{ paddingRight: 20, flexShrink: 0, paddingTop: 2 }}>
                <StyleCoverThumb
                  src={(order as any)?.styleCover}
                  styleId={(order as any)?.styleId}
                  size={80}
                  borderRadius={8}
                />
              </Col>

              {/* 基本信息 */}
              <Col flex="1" style={{ minWidth: 180, padding: '0 20px', borderLeft: '1px solid rgba(0,0,0,0.08)' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#bbb', marginBottom: 8, letterSpacing: 1 }}>基本信息</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', rowGap: 4, columnGap: 12 }}>
                  <span style={{ color: '#999', fontSize: 12, lineHeight: '22px' }}>订单号</span>
                  <span style={{ fontSize: 13, fontWeight: 600, lineHeight: '22px' }}>{(order as any)?.orderNo || '-'}</span>
                  <span style={{ color: '#999', fontSize: 12, lineHeight: '22px' }}>款号</span>
                  <span style={{ fontSize: 13, lineHeight: '22px' }}>{(order as any)?.styleNo || '-'}</span>
                  <span style={{ color: '#999', fontSize: 12, lineHeight: '22px' }}>款名</span>
                  <span style={{ fontSize: 13, lineHeight: '22px' }}>{(order as any)?.styleName || '-'}</span>
                  <span style={{ color: '#999', fontSize: 12, lineHeight: '22px' }}>颜色</span>
                  <span style={{ fontSize: 13, lineHeight: '22px' }}>{(order as any)?.color || '-'}</span>
                  <span style={{ color: '#999', fontSize: 12, lineHeight: '22px' }}>加工厂</span>
                  <span style={{ fontSize: 13, lineHeight: '22px' }}>{String((order as any)?.factoryName || '-').trim()}</span>
                  <span style={{ color: '#999', fontSize: 12, lineHeight: '22px' }}>状态</span>
                  <span style={{ fontSize: 13, lineHeight: '22px' }}>{orderStatusTag((order as any)?.status)}</span>
                  <span style={{ color: '#999', fontSize: 12, lineHeight: '22px' }}>当前环节</span>
                  <span style={{ fontSize: 13, lineHeight: '22px' }}>{String((order as any)?.currentProcessName || '-').trim()}</span>
                </div>
              </Col>

              {/* 生产统计 */}
              <Col flex="1" style={{ minWidth: 200, paddingLeft: 20, borderLeft: '1px solid rgba(0,0,0,0.08)' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#bbb', marginBottom: 8, letterSpacing: 1 }}>生产统计</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', rowGap: 4, columnGap: 12 }}>
                  <span style={{ color: '#999', fontSize: 12, lineHeight: '22px' }}>下单数</span>
                  <span style={{ fontSize: 13, lineHeight: '22px' }}>{toNumberSafe((order as any)?.orderQuantity)}</span>
                  <span style={{ color: '#999', fontSize: 12, lineHeight: '22px' }}>已完成</span>
                  <span style={{ fontSize: 13, lineHeight: '22px' }}>{toNumberSafe((order as any)?.completedQuantity)}</span>
                  <span style={{ color: '#999', fontSize: 12, lineHeight: '22px' }}>生产进度</span>
                  <span style={{ fontSize: 13, fontWeight: 600, lineHeight: '22px' }}>{`${toNumberSafe((order as any)?.productionProgress)}%`}</span>
                  <span style={{ color: '#999', fontSize: 12, lineHeight: '22px' }}>扎数</span>
                  <span style={{ fontSize: 13, lineHeight: '22px' }}>{toNumberSafe((order as any)?.cuttingBundleCount)}</span>
                  <span style={{ color: '#999', fontSize: 12, lineHeight: '22px' }}>入库数</span>
                  <span style={{ fontSize: 13, lineHeight: '22px' }}>{warehousingTotal}</span>
                  <span style={{ color: '#999', fontSize: 12, lineHeight: '22px' }}>合格/不合格</span>
                  <span style={{ fontSize: 13, lineHeight: '22px' }}>{`${warehousingQualified} / ${warehousingUnqualified}`}</span>
                  <span style={{ color: '#999', fontSize: 12, lineHeight: '22px' }}>计划开始</span>
                  <span style={{ fontSize: 13, lineHeight: '22px' }}>{(order as any)?.plannedStartDate ? formatDateTime((order as any)?.plannedStartDate) : '-'}</span>
                  <span style={{ color: '#999', fontSize: 12, lineHeight: '22px' }}>计划交期</span>
                  <span style={{ fontSize: 13, lineHeight: '22px' }}>{(order as any)?.plannedEndDate ? formatDateTime((order as any)?.plannedEndDate) : '-'}</span>
                  <span style={{ color: '#999', fontSize: 12, lineHeight: '22px' }}>下单时间</span>
                  <span style={{ fontSize: 13, lineHeight: '22px' }}>{(order as any)?.createTime ? formatDateTime((order as any)?.createTime) : '-'}</span>
                  <span style={{ color: '#999', fontSize: 12, lineHeight: '22px' }}>实际完成</span>
                  <span style={{ fontSize: 13, lineHeight: '22px' }}>{(order as any)?.actualEndDate ? formatDateTime((order as any)?.actualEndDate) : '-'}</span>
                  <span style={{ color: '#999', fontSize: 12, lineHeight: '22px' }}>更新时间</span>
                  <span style={{ fontSize: 13, lineHeight: '22px' }}>{(order as any)?.updateTime ? formatDateTime((order as any)?.updateTime) : '-'}</span>
                </div>
              </Col>
            </Row>
          </Card>

          <Card size="small" className="order-flow-tabs-card" style={{ marginTop: 8 }} loading={loading}>
            <Tabs
              items={[
                {
                  key: 'overview',
                  label: '概览',
                  children: (
                    <ResizableTable
                      storageKey="order-flow-stages"
                      size="small"
                      columns={stageColumns}
                      dataSource={enrichedStages}
                      rowKey={(r) => r.processName}
                      pagination={false}
                      scroll={{ x: 980 }}
                    />
                  ),
                },
                {
                  key: 'order',
                  label: `下单明细${orderLines.length ? ` (${orderLines.length})` : ''}`,
                  children: (
                    <ResizableTable
                      storageKey="order-flow-order-lines"
                      size="small"
                      columns={isFactoryUser ? orderLineColumns.filter(c => c.key !== 'totalPrice') : orderLineColumns}
                      dataSource={orderLines}
                      rowKey={(r) => String((r as any)?.skuNo || `${r.color}-${r.size}`)}
                      pagination={false}
                      scroll={{ x: 1060 }}
                    />
                  ),
                },
                ...(cuttingSizeItems && cuttingSizeItems.length > 0 ? [{
                  key: 'cutting',
                  label: `裁剪明细 (${cuttingSizeItems.reduce((s, i) => s + i.quantity, 0)})`,
                  children: (
                    <ResizableTable
                      storageKey="order-flow-cutting"
                      size="small"
                      columns={[
                        { title: '颜色', dataIndex: 'color', key: 'color', width: 140, render: (v: any) => String(v || '').trim() || '-' },
                        { title: '尺码', dataIndex: 'size', key: 'size', width: 100 },
                        { title: '裁剪数量', dataIndex: 'quantity', key: 'quantity', width: 120, align: 'right' as const },
                      ]}
                      dataSource={cuttingSizeItems}
                      rowKey={(r: any) => `${r.color || ''}-${r.size}`}
                      pagination={false}
                      scroll={{ x: 360 }}
                    />
                  ),
                }] : []),
                ...(data?.order?.styleId ? [
                  {
                    key: 'style-pattern',
                    label: '纸样详情',
                    children: (
                      <StylePatternSimpleTab
                        styleId={data.order.styleId}
                        styleNo={data.order.styleNo}
                      />
                    ),
                  },
                  {
                    key: 'style-cost',
                    label: '工序详细信息',
                    children: (
                      <>
                        {/* 解析工序数据：优先使用 progressWorkflowJson，备选 progressNodeUnitPrices */}
                        {(() => {
                          let workflowNodes: any[] = [];

                          // 1. 尝试从 progressWorkflowJson 解析
                          try {
                            if (data?.order?.progressWorkflowJson) {
                              const workflow = typeof data.order.progressWorkflowJson === 'string'
                                ? JSON.parse(data.order.progressWorkflowJson)
                                : data.order.progressWorkflowJson;

                              const nodes = workflow?.nodes || [];
                              if (nodes.length > 0 && nodes[0]?.name) {
                                // 新格式：nodes 直接包含所有工序的完整信息
                                workflowNodes = nodes.map((item: any, idx: number) => ({
                                  id: item.id || `proc_${idx}`,
                                  name: item.name || item.processName || '',
                                  progressStage: item.progressStage || '',
                                  machineType: item.machineType || '',
                                  standardTime: item.standardTime || 0,
                                  unitPrice: Number(item.unitPrice) || 0,
                                  sortOrder: item.sortOrder ?? idx,
                                  description: item.description || item.remark || '',
                                }));
                              } else {
                                // 旧格式：从 processesByNode 读取
                                const processesByNode = workflow?.processesByNode || {};
                                const allProcesses: any[] = [];
                                let sortIdx = 0;

                                for (const node of nodes) {
                                  const nodeId = node?.id || '';
                                  const nodeProcesses = processesByNode[nodeId] || [];
                                  for (const p of nodeProcesses) {
                                    allProcesses.push({
                                      id: p.id || `proc_${sortIdx}`,
                                      name: p.name || p.processName || '',
                                      progressStage: p.progressStage || node?.progressStage || node?.name || '',
                                      machineType: p.machineType || '',
                                      standardTime: p.standardTime || 0,
                                      unitPrice: Number(p.unitPrice) || 0,
                                      sortOrder: sortIdx,
                                      description: p.description || p.remark || '',
                                    });
                                    sortIdx++;
                                  }
                                }
                                workflowNodes = allProcesses;
                              }
                            }
                          } catch (e) {
                            console.error('[订单全流程] 解析 progressWorkflowJson 失败:', e);
                          }

                          // 2. 如果没有数据，从 progressNodeUnitPrices 读取
                          if (workflowNodes.length === 0 && Array.isArray(data?.order?.progressNodeUnitPrices) && data.order.progressNodeUnitPrices.length > 0) {
                            workflowNodes = data.order.progressNodeUnitPrices.map((item: any, idx: number) => ({
                              id: item.id || item.processId || `node_${idx}`,
                              name: item.name || item.processName || '',
                              progressStage: item.progressStage || '',
                              machineType: item.machineType || '',
                              standardTime: item.standardTime || 0,
                              unitPrice: Number(item.unitPrice) || Number(item.price) || 0,
                              sortOrder: item.sortOrder ?? idx,
                              description: item.description || item.remark || '',
                            }));
                          }

                          // 如果有工序数据，显示表格
                          if (workflowNodes.length > 0) {
                            workflowNodes = workflowNodes.map((item) => {
                              const processName = String(item?.name || '').trim();
                              const stageName = String(item?.progressStage || '').trim();
                              const isSecondary = stageName.includes('二次工艺') || processName.includes('二次工艺');
                              const description = String(item?.description || '').trim()
                                || (isSecondary ? secondaryProcessDescriptionMap.get(processName) : styleProcessDescriptionMap.get(processName))
                                || '';
                              return {
                                ...item,
                                description,
                              };
                            });
                            const totalPrice = workflowNodes.reduce((sum, item) => sum + (item.unitPrice || 0), 0);

                            return (
                              <>
                                {!isFactoryUser && (
                                <Alert
                                  title="工序单价信息"
                                  description={
                                    <div>
                                      <p>工序数量: <strong>{workflowNodes.length}</strong> 个 |
                                         工序总单价: <strong style={{ color: 'var(--primary-color)', fontSize: "var(--font-size-lg)" }}>¥{totalPrice.toFixed(2)}</strong>
                                      </p>
                                      <p style={{ marginTop: 8, color: 'var(--color-warning)' }}>
                                         提示：单价修改需要到"单价维护"模块中修改，修改后点击"刷新数据"按钮可更新单价
                                      </p>
                                    </div>
                                  }
                                  type="info"
                                  showIcon
                                  style={{ marginBottom: 16 }}
                                />
                                )}
                                <ResizableTable
                                  storageKey="order-flow-workflow"
                                  dataSource={workflowNodes}
                                  rowKey={(record: any) => record.id || `${record.name}-${record.progressStage}`}
                                  columns={[
                                    {
                                      title: '序号',
                                      key: 'index',
                                      width: 70,
                                      align: 'center',
                                      render: (_: any, __: any, index: number) => index + 1
                                    },
                                    {
                                      title: '工序名称',
                                      dataIndex: 'name',
                                      key: 'name',
                                      width: 180,
                                      render: (v: any) => v || '-'
                                    },
                                    {
                                      title: '阶段',
                                      dataIndex: 'progressStage',
                                      key: 'progressStage',
                                      width: 120,
                                      render: (v: any) => {
                                        const stageMap: Record<string, string> = {
                                          'sample': '样衣',
                                          'pre_production': '产前',
                                          'production': '大货生产',
                                          'procurement': '采购',
                                          'cutting': '裁剪',
                                          'carSewing': '车缝',
                                          'secondaryProcess': '二次工艺',
                                          'tailProcess': '尾部',
                                          'warehousing': '入库'
                                        };
                                        return stageMap[v] || v || '-';
                                      }
                                    },
                                    {
                                      title: '机器类型',
                                      dataIndex: 'machineType',
                                      key: 'machineType',
                                      width: 120,
                                      render: (v: any) => v || '-'
                                    },
                                    {
                                      title: '标准工时(分钟)',
                                      dataIndex: 'standardTime',
                                      key: 'standardTime',
                                      width: 130,
                                      align: 'right',
                                      render: (v: any) => Number(v || 0).toFixed(2)
                                    },
                                    ...(!isFactoryUser ? [{
                                      title: '单价(元)',
                                      dataIndex: 'unitPrice',
                                      key: 'unitPrice',
                                      width: 120,
                                      align: 'right' as const,
                                      render: (v: any) => <strong style={{ color: 'var(--primary-color)' }}>¥{Number(v || 0).toFixed(2)}</strong>
                                    }] : []),
                                    {
                                      title: '工序描述',
                                      dataIndex: 'description',
                                      key: 'description',
                                      ellipsis: true,
                                      render: (v: any) => v || '-'
                                    },
                                  ]}
                                  pagination={false}
                                  bordered
                                  scroll={{ x: 'max-content' }}
                                />
                              </>
                            );
                          }

                          // 如果是样衣订单，显示样衣成本
                          if (data?.order?.styleId) {
                            return (
                              <StyleQuotationTab
                                styleId={data.order.styleId}
                                readOnly={true}
                                onSaved={() => {}}
                              />
                            );
                          }

                          // 没有任何数据
                          return (
                            <Alert
                              title="暂无工序单价数据"
                              description="此订单尚未配置工序单价信息"
                              type="warning"
                              showIcon
                            />
                          );
                        })()}
                      </>
                    ),
                  },
                  {
                    key: 'material-purchases',
                    label: `物料信息${data?.materialPurchases?.length ? ` (${data.materialPurchases.length})` : ''}`,

                    children: (
                      <>
                        {data?.materialPurchases && data.materialPurchases.length > 0 ? (
                          <ResizableTable
                            storageKey="order-flow-materials"
                            dataSource={data.materialPurchases}
                            rowKey={(record: any) => record.id || record.processCode || `row-${Math.random()}`}
                            columns={[
                              {
                                title: '序号',
                                key: 'index',
                                width: 70,
                                align: 'center',
                                render: (_: any, __: any, index: number) => index + 1
                              },
                              {
                                title: '物料类型',
                                dataIndex: 'materialType',
                                key: 'materialType',
                                width: 120,
                                render: (v: any) => getMaterialTypeLabel(v)
                              },
                              {
                                title: '物料名称',
                                dataIndex: 'materialName',
                                key: 'materialName',
                                width: 200,
                                ellipsis: true,
                                render: (v: any) => v || '-'
                              },
                              {
                                title: '规格/幅宽',
                                dataIndex: 'specifications',
                                key: 'specifications',
                                width: 150,
                                ellipsis: true,
                                render: (v: any) => v || '-'
                              },
                              {
                                title: '颜色',
                                dataIndex: 'color',
                                key: 'color',
                                width: 100,
                                render: (v: any) => v || '-'
                              },
                              {
                                title: '尺码用量',
                                key: 'sizeUsage',
                                width: 220,
                                render: (_: any, record: any) => {
                                  if (record.sizeUsageMap) {
                                    try {
                                      const map: Record<string, string> = JSON.parse(record.sizeUsageMap);
                                      const entries = Object.entries(map);
                                      if (entries.length > 0) {
                                        return (
                                          <Space wrap size={2}>
                                            {entries.map(([sz, usage]) => (
                                              <Tag key={sz} style={{ margin: 0, fontSize: 11 }}>
                                                {sz}: {Number(usage).toFixed(2)}{record.unit || ''}
                                              </Tag>
                                            ))}
                                          </Space>
                                        );
                                      }
                                    } catch {
                                      // 兜底显示原始尺寸字符串
                                    }
                                  }
                                  return <span style={{ color: '#999' }}>{record.size || '-'}</span>;
                                }
                              },
                              {
                                title: '采购数量',
                                dataIndex: 'purchaseQuantity',
                                key: 'purchaseQuantity',
                                width: 120,
                                align: 'right',
                                render: (v: any, record: any) => `${Number(v || 0).toFixed(2)} ${record.unit || ''}`
                              },
                              {
                                title: '参考公斤数',
                                key: 'referenceKilograms',
                                width: 120,
                                align: 'right',
                                render: (_: any, record: any) =>
                                  formatReferenceKilograms(record.purchaseQuantity, record.conversionRate, record.unit)
                              },
                              {
                                title: '已到货',
                                dataIndex: 'arrivedQuantity',
                                key: 'arrivedQuantity',
                                width: 120,
                                align: 'right',
                                render: (v: any, record: any) => {
                                  const val = Number(v || 0);
                                  const ordered = Number(record.purchaseQuantity || 0);
                                  const color = val >= ordered && ordered > 0 ? 'var(--color-success)' : 'var(--color-warning)';
                                  return <span style={{ color }}>{val.toFixed(2)} {record.unit || ''}</span>;
                                }
                              },
                              ...(!isFactoryUser ? [{
                                title: '单价',
                                dataIndex: 'unitPrice',
                                key: 'unitPrice',
                                width: 100,
                                align: 'right' as const,
                                render: (v: any) => v ? `¥${Number(v).toFixed(2)}` : '-'
                              }] : []),
                              {
                                title: '总价',
                                dataIndex: 'totalAmount',
                                key: 'totalAmount',
                                width: 120,
                                align: 'right',
                                render: (v: any, record: any) => {
                                  const total = Number(v || 0) || (Number(record.purchasedQuantity || 0) * Number(record.unitPrice || 0));
                                  return total > 0 ? <strong style={{ color: 'var(--primary-color)' }}>¥{total.toFixed(2)}</strong> : '-';
                                }
                              },
                              {
                                title: '供应商',
                                dataIndex: 'supplierName',
                                key: 'supplierName',
                                width: 150,
                                ellipsis: true,
                                render: (_: any, record: any) => (
                                  <SupplierNameTooltip
                                    name={record.supplierName}
                                    contactPerson={record.supplierContactPerson}
                                    contactPhone={record.supplierContactPhone}
                                  />
                                )
                              },
                              {
                                title: '状态',
                                dataIndex: 'status',
                                key: 'status',
                                width: 100,
                                render: (v: any) => {
                                  const statusMap: Record<string, { text: string; color: string }> = {
                                    'pending': { text: '待采购', color: 'default' },
                                    'ordering': { text: '订购中', color: 'processing' },
                                    'received': { text: '已到货', color: 'success' },
                                    'partial': { text: '部分到货', color: 'warning' }
                                  };
                                  const status = statusMap[v] || { text: v || '未知', color: 'default' };
                                  return <Tag color={status.color}>{status.text}</Tag>;
                                }
                              },
                              {
                                title: '备注',
                                dataIndex: 'remark',
                                key: 'remark',
                                ellipsis: true,
                                render: (v: any) => v || '-'
                              },
                            ]}
                            pagination={false}
                            bordered
                            scroll={{ x: 'max-content' }}
                            summary={(pageData) => {
                              const totalAmount = pageData.reduce((sum, record: any) => {
                                const amount = Number(record.totalAmount || 0) || (Number(record.arrivedQuantity || 0) * Number(record.unitPrice || 0));
                                return sum + amount;
                              }, 0);

                              return totalAmount > 0 ? (
                                <ResizableTable.Summary.Row style={{ background: '#fafafa' }}>
                                  <ResizableTable.Summary.Cell index={0} colSpan={9} align="right">
                                    <strong>合计：</strong>
                                  </ResizableTable.Summary.Cell>
                                  <ResizableTable.Summary.Cell index={1} align="right">
                                    <strong style={{ color: 'var(--primary-color)', fontSize: "var(--font-size-lg)" }}>¥{totalAmount.toFixed(2)}</strong>
                                  </ResizableTable.Summary.Cell>
                                  <ResizableTable.Summary.Cell index={2} colSpan={3} />
                                </ResizableTable.Summary.Row>
                              ) : null;
                            }}
                          />
                        ) : (
                          <Alert
                            title="暂无物料采购信息"
                            description="此订单尚未录入物料采购数据"
                            type="info"
                            showIcon
                          />
                        )}
                      </>
                    ),
                  },
                  {
                    key: 'style-secondary',
                    label: '二次工艺详情',
                    children: (
                      <>
                        {data?.order?.styleId ? (
                          <StyleSecondaryProcessTab
                            styleId={data.order.styleId}
                            readOnly={true}
                            simpleView={true}
                          />
                        ) : (
                          <Alert
                            title="暂无二次工艺信息"
                            description="此订单未关联款号，无法显示二次工艺详情"
                            type="info"
                            showIcon
                          />
                        )}
                      </>
                    ),
                  },
                ] : []),
              ]}
            />
          </Card>
        </Card>
    </Layout>
  );
};

export default OrderFlow;
