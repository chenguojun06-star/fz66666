import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Card, Space, Table, Tabs, Tag, message } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useLocation } from 'react-router-dom';
import Layout from '@/components/Layout';
import { ProductionOrderHeader } from '@/components/StyleAssets';
import api, { parseProductionOrderLines, toNumberSafe } from '@/utils/api';
import { formatDateTime } from '@/utils/datetime';
import type { CuttingBundle, ProductionOrder, ProductWarehousing } from '@/types/production';
import StylePatternSimpleTab from './components/StylePatternSimpleTab';
import StyleQuotationTab from '@/modules/basic/pages/StyleInfo/components/StyleQuotationTab';
import './styles.css';

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

  const fetchFlow = async () => {
    if (!query.orderId) return;
    setLoading(true);
    try {
      const res = await api.get<{ code: number; message: string; data: unknown }>(`/production/order/flow/${query.orderId}`);
      if (res.code === 200) {
        setData(res.data || null);
      } else {
        message.error(res.message || '获取订单全流程失败');
        setData(null);
      }
    } catch (e: unknown) {
      message.error(e?.message || '获取订单全流程失败');
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFlow();
  }, [query.orderId]);

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
      render: (v: unknown) => statusTag(String(v || 'not_started') as Record<string, unknown>),
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
  ];

  const order = data?.order;

  const orderLines = useMemo(() => {
    const lines = parseProductionOrderLines(order || null) as OrderLine[];
    const warehousings = (data?.warehousings || []) as ProductWarehousing[];
    const cuttingBundles = (data?.cuttingBundles || []) as CuttingBundle[];
    const styleQuotation = (data as any)?.styleQuotation;
    const unitPrice = styleQuotation?.totalPrice || 0;

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

      // 计算总单价 = 数量 × 单价
      const totalPrice = unitPrice > 0 ? line.quantity * unitPrice : 0;

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
    { title: '总单价', dataIndex: 'totalPrice', key: 'totalPrice', width: 110, align: 'right', render: (v: unknown) => {
      const val = toNumberSafe(v);
      return val > 0 ? `¥${val.toFixed(2)}` : '-';
    }},
    { title: '质检数', dataIndex: 'qualityQuantity', key: 'qualityQuantity', width: 90, align: 'right', render: (v: unknown) => {
      const val = toNumberSafe(v);
      return val > 0 ? <span style={{ color: '#1890ff' }}>{val}</span> : '-';
    }},
    { title: '次品数', dataIndex: 'defectiveQuantity', key: 'defectiveQuantity', width: 90, align: 'right', render: (v: unknown) => {
      const val = toNumberSafe(v);
      return val > 0 ? <span style={{ color: '#ff4d4f' }}>{val}</span> : '-';
    }},
    { title: '入库数', dataIndex: 'warehousingQuantity', key: 'warehousingQuantity', width: 90, align: 'right', render: (v: unknown) => {
      const val = toNumberSafe(v);
      return val > 0 ? <span style={{ color: '#52c41a' }}>{val}</span> : '-';
    }},
  ];

  // 计算入库统计
  const warehousingTotal = useMemo(
    () => (data?.warehousings || []).reduce((sum, w) => sum + toNumberSafe((w as Record<string, unknown>)?.warehousingQuantity), 0),
    [data?.warehousings],
  );
  const warehousingQualified = useMemo(
    () => (data?.warehousings || []).reduce((sum, w) => sum + toNumberSafe((w as Record<string, unknown>)?.qualifiedQuantity), 0),
    [data?.warehousings],
  );
  const warehousingUnqualified = useMemo(
    () => (data?.warehousings || []).reduce((sum, w) => sum + toNumberSafe((w as Record<string, unknown>)?.unqualifiedQuantity), 0),
    [data?.warehousings],
  );

  return (
    <Layout>
      <div className="production-list-page">
        <Card className="page-card">
          <div className="page-header">
            <h2 className="page-title">订单全流程记录</h2>
            <Space wrap>
              {query.orderNo ? <Tag>订单号：{query.orderNo}</Tag> : null}
              {query.styleNo ? <Tag>款号：{query.styleNo}</Tag> : null}
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

          <Card size="small" className="order-flow-detail" style={{ marginTop: 12 }} loading={loading}>
            <ProductionOrderHeader
              order={order}
              orderLines={orderLines}
              orderNo={String((order as Record<string, unknown>)?.orderNo || query.orderNo || '').trim()}
              styleNo={String((order as Record<string, unknown>)?.styleNo || query.styleNo || '').trim()}
              styleName={String((order as Record<string, unknown>)?.styleName || '').trim()}
              styleId={(order as Record<string, unknown>)?.styleId}
              styleCover={(order as Record<string, unknown>)?.styleCover || null}
              color={String((order as Record<string, unknown>)?.color || '').trim()}
              totalQuantity={toNumberSafe((order as Record<string, unknown>)?.orderQuantity)}
              coverSize={160}
              qrSize={120}
              extraFields={[
                { label: '加工厂', value: (order as Record<string, unknown>)?.factoryName || '-' },
                { label: '订单状态', value: orderStatusTag((order as Record<string, unknown>)?.status) },
                { label: '下单数', value: toNumberSafe((order as Record<string, unknown>)?.orderQuantity) },
                { label: '已完成', value: toNumberSafe((order as Record<string, unknown>)?.completedQuantity) },
                { label: '生产进度', value: `${toNumberSafe((order as Record<string, unknown>)?.productionProgress)}%` },
                { label: '当前环节', value: String((order as Record<string, unknown>)?.currentProcessName || '').trim() || '-' },
                { label: '扎数', value: toNumberSafe((order as Record<string, unknown>)?.cuttingBundleCount) },
                { label: '入库数', value: warehousingTotal },
                { label: '计划开始', value: (order as Record<string, unknown>)?.plannedStartDate ? formatDateTime((order as Record<string, unknown>)?.plannedStartDate) : '-' },
                { label: '计划交期', value: (order as Record<string, unknown>)?.plannedEndDate ? formatDateTime((order as Record<string, unknown>)?.plannedEndDate) : '-' },
                { label: '入库合格/不合格', value: `${warehousingQualified}/${warehousingUnqualified}` },
                { label: '下单时间', value: (order as Record<string, unknown>)?.createTime ? formatDateTime((order as Record<string, unknown>)?.createTime) : '-' },
                { label: '实际完成', value: (order as Record<string, unknown>)?.actualEndDate ? formatDateTime((order as Record<string, unknown>)?.actualEndDate) : '-' },
                { label: '更新时间', value: (order as Record<string, unknown>)?.updateTime ? formatDateTime((order as Record<string, unknown>)?.updateTime) : '-' },
              ]}
            />
          </Card>

          <Card size="small" className="order-flow-tabs-card" style={{ marginTop: 12 }} loading={loading}>
            <Tabs
              items={[
                {
                  key: 'overview',
                  label: '概览',
                  children: (
                    <div className="order-flow-module">
                      <div className="order-flow-module-title">环节汇总</div>
                      <Table
                        size="small"
                        columns={stageColumns}
                        dataSource={data?.stages || []}
                        rowKey={(r) => r.processName}
                        pagination={false}
                        scroll={{ x: 980 }}
                      />
                    </div>
                  ),
                },
                {
                  key: 'order',
                  label: `下单明细${orderLines.length ? ` (${orderLines.length})` : ''}`,
                  children: (
                    <div className="order-flow-module">
                      <div className="order-flow-module-title">订单明细-SKU</div>
                      <Table
                        size="small"
                        columns={orderLineColumns}
                        dataSource={orderLines}
                        rowKey={(r) => String((r as Record<string, unknown>)?.skuNo || `${r.color}-${r.size}`)}
                        pagination={false}
                        scroll={{ x: 1060 }}
                      />
                    </div>
                  ),
                },
                ...(data?.order?.styleId ? [
                  {
                    key: 'style-pattern',
                    label: '纸样详情',
                    children: (
                      <div className="order-flow-module">
                        <StylePatternSimpleTab
                          styleId={data.order.styleId}
                          styleNo={data.order.styleNo}
                        />
                      </div>
                    ),
                  },
                  {
                    key: 'style-cost',
                    label: '成本详情(含BOM+工序)',
                    children: (
                      <div className="order-flow-module">
                        {/* 如果订单有工序单价配置，显示来自单价维护的成本信息 */}
                        {data.order.progressNodeUnitPrices && Array.isArray(data.order.progressNodeUnitPrices) && data.order.progressNodeUnitPrices.length > 0 ? (
                          <Card>
                            <Alert
                              message="大货订单成本信息"
                              description={
                                <div>
                                  <p>此订单使用单价维护模块的工序单价配置</p>
                                  <p style={{ marginTop: 8 }}>工序总成本: ¥{
                                    data.order.progressNodeUnitPrices.reduce((sum: number, item: any) => {
                                      return sum + (Number(item.unitPrice) || 0);
                                    }, 0).toFixed(2)
                                  }</p>
                                </div>
                              }
                              type="info"
                              showIcon
                              style={{ marginBottom: 16 }}
                            />
                            <Table
                              dataSource={data.order.progressNodeUnitPrices}
                              rowKey={(record: any) => record.processName || record.id}
                              columns={[
                                { title: '工序名称', dataIndex: 'processName', key: 'processName', width: 200 },
                                { title: '单价', dataIndex: 'unitPrice', key: 'unitPrice', width: 120, align: 'right', render: (v: any) => `¥${Number(v || 0).toFixed(2)}` },
                                { title: '说明', dataIndex: 'remark', key: 'remark', ellipsis: true, render: (v: any) => v || '-' },
                              ]}
                              pagination={false}
                            />
                          </Card>
                        ) : (
                          // 样衣订单，从样衣开发模块获取成本信息
                          <StyleQuotationTab
                            styleId={data.order.styleId}
                            readOnly={true}
                            onSaved={() => {}}
                          />
                        )}
                      </div>
                    ),
                  },
                  {
                    key: 'style-secondary',
                    label: '二次工艺详情',
                    children: (
                      <div className="order-flow-module">
                        <Alert
                          message="二次工艺功能"
                          description="二次工艺功能开发中，敬请期待..."
                          type="info"
                          showIcon
                        />
                      </div>
                    ),
                  },
                ] : []),
              ]}
            />
          </Card>
        </Card>
      </div>
    </Layout>
  );
};

export default OrderFlow;
