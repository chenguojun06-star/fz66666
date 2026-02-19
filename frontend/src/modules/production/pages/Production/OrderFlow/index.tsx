import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Button, Card, Space, Table, Tabs, Tag, message } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { useLocation } from 'react-router-dom';
import Layout from '@/components/Layout';
import ResizableTable from '@/components/common/ResizableTable';
import { ProductionOrderHeader } from '@/components/StyleAssets';
import api, { parseProductionOrderLines, toNumberSafe } from '@/utils/api';
import { formatDateTime } from '@/utils/datetime';
import { getMaterialTypeLabel } from '@/utils/materialType';
import { generateRowKey } from '@/utils/idGenerator';
import type { CuttingBundle, ProductionOrder, ProductWarehousing } from '@/types/production';
import StylePatternSimpleTab from './components/StylePatternSimpleTab';
import StyleQuotationTab from '@/modules/basic/pages/StyleInfo/components/StyleQuotationTab';
import StyleSecondaryProcessTab from '@/modules/basic/pages/StyleInfo/components/StyleSecondaryProcessTab';
import '../../../styles.css';

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
      const res = await api.get<{ code: number; message: string; data: any }>(`/production/order/flow/${query.orderId}`);
      if (res.code === 200) {
        const flowData = res.data as OrderFlowResponse;
        setData(flowData || null);
      } else {
        message.error(res.message || '获取订单全流程失败');
        setData(null);
      }
    } catch (e: any) {
      message.error(e?.message || '获取订单全流程失败');
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFlow();
  }, [query.orderId]);

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

  // 计算裁剪数量（按尺码聚合）
  const cuttingSizeItems = useMemo(() => {
    const cuttingBundles = (data?.cuttingBundles || []) as CuttingBundle[];
    if (cuttingBundles.length === 0) return undefined;

    // 按尺码聚合裁剪数量
    const sizeMap = new Map<string, number>();
    cuttingBundles.forEach(bundle => {
      const size = String(bundle.size || '').trim();
      const quantity = toNumberSafe(bundle.quantity);
      if (size && quantity > 0) {
        sizeMap.set(size, (sizeMap.get(size) || 0) + quantity);
      }
    });

    // 转换为数组格式
    return Array.from(sizeMap.entries()).map(([size, quantity]) => ({
      size,
      quantity,
    }));
  }, [data?.cuttingBundles]);

  return (
    <Layout>
      <div className="production-list-page">
        <Card className="page-card">
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

          <Card size="small" className="order-flow-detail" style={{ marginTop: 12 }} loading={loading}>
            <ProductionOrderHeader
              order={order}
              orderLines={orderLines}
              cuttingSizeItems={cuttingSizeItems}
              orderNo={String((order as any)?.orderNo || query.orderNo || '').trim()}
              styleNo={String((order as any)?.styleNo || query.styleNo || '').trim()}
              styleName={String((order as any)?.styleName || '').trim()}
              styleId={(order as any)?.styleId}
              styleCover={(order as any)?.styleCover || null}
              color={String((order as any)?.color || '').trim()}
              totalQuantity={toNumberSafe((order as any)?.orderQuantity)}
              coverSize={160}
              extraFields={[
                { label: '加工厂', value: (order as any)?.factoryName || '-' },
                { label: '订单状态', value: orderStatusTag((order as any)?.status) },
                { label: '下单数', value: toNumberSafe((order as any)?.orderQuantity) },
                { label: '已完成', value: toNumberSafe((order as any)?.completedQuantity) },
                { label: '生产进度', value: `${toNumberSafe((order as any)?.productionProgress)}%` },
                { label: '当前环节', value: String((order as any)?.currentProcessName || '').trim() || '-' },
                { label: '扎数', value: toNumberSafe((order as any)?.cuttingBundleCount) },
                { label: '入库数', value: warehousingTotal },
                { label: '计划开始', value: (order as any)?.plannedStartDate ? formatDateTime((order as any)?.plannedStartDate) : '-' },
                { label: '计划交期', value: (order as any)?.plannedEndDate ? formatDateTime((order as any)?.plannedEndDate) : '-' },
                { label: '入库合格/不合格', value: `${warehousingQualified}/${warehousingUnqualified}` },
                { label: '下单时间', value: (order as any)?.createTime ? formatDateTime((order as any)?.createTime) : '-' },
                { label: '实际完成', value: (order as any)?.actualEndDate ? formatDateTime((order as any)?.actualEndDate) : '-' },
                { label: '更新时间', value: (order as any)?.updateTime ? formatDateTime((order as any)?.updateTime) : '-' },
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
                      <ResizableTable
                        storageKey="order-flow-stages"
                        size="small"
                        columns={stageColumns}
                        dataSource={enrichedStages}
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
                      <ResizableTable
                        storageKey="order-flow-order-lines"
                        size="small"
                        columns={orderLineColumns}
                        dataSource={orderLines}
                        rowKey={(r) => String((r as any)?.skuNo || `${r.color}-${r.size}`)}
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
                    label: '工序详细信息',
                    children: (
                      <div className="order-flow-module">
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
                                  remark: item.remark || '',
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
                                      remark: p.remark || '',
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
                              remark: item.remark || '',
                            }));
                          }

                          // 如果有工序数据，显示表格
                          if (workflowNodes.length > 0) {
                            const totalPrice = workflowNodes.reduce((sum, item) => sum + (item.unitPrice || 0), 0);

                            return (
                              <Card>
                                <Alert
                                  title="工序单价信息"
                                  description={
                                    <div>
                                      <p>工序数量: <strong>{workflowNodes.length}</strong> 个 |
                                         工序总单价: <strong style={{ color: 'var(--primary-color)', fontSize: "var(--font-size-lg)" }}>¥{totalPrice.toFixed(2)}</strong>
                                      </p>
                                      <p style={{ marginTop: 8, color: 'var(--color-warning)' }}>
                                        💡 提示：单价修改需要到"单价维护"模块中修改，修改后点击"刷新数据"按钮可更新单价
                                      </p>
                                    </div>
                                  }
                                  type="info"
                                  showIcon
                                  style={{ marginBottom: 16 }}
                                />
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
                                    {
                                      title: '单价(元)',
                                      dataIndex: 'unitPrice',
                                      key: 'unitPrice',
                                      width: 120,
                                      align: 'right',
                                      render: (v: any) => <strong style={{ color: 'var(--primary-color)' }}>¥{Number(v || 0).toFixed(2)}</strong>
                                    },
                                    {
                                      title: '说明',
                                      dataIndex: 'remark',
                                      key: 'remark',
                                      ellipsis: true,
                                      render: (v: any) => v || '-'
                                    },
                                  ]}
                                  pagination={false}
                                  bordered
                                  scroll={{ x: 'max-content' }}
                                />
                              </Card>
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
                      </div>
                    ),
                  },
                  {
                    key: 'material-purchases',
                    label: `面辅料信息${data?.materialPurchases?.length ? ` (${data.materialPurchases.length})` : ''}`,
                    children: (
                      <div className="order-flow-module">
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
                                title: '规格',
                                dataIndex: 'specification',
                                key: 'specification',
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
                                title: '尺寸',
                                dataIndex: 'size',
                                key: 'size',
                                width: 100,
                                render: (v: any) => v || '-'
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
                              {
                                title: '单价',
                                dataIndex: 'unitPrice',
                                key: 'unitPrice',
                                width: 100,
                                align: 'right',
                                render: (v: any) => v ? `¥${Number(v).toFixed(2)}` : '-'
                              },
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
                                render: (v: any) => v || '-'
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
                                <Table.Summary.Row style={{ background: '#fafafa' }}>
                                  <Table.Summary.Cell index={0} colSpan={9} align="right">
                                    <strong>合计：</strong>
                                  </Table.Summary.Cell>
                                  <Table.Summary.Cell index={1} align="right">
                                    <strong style={{ color: 'var(--primary-color)', fontSize: "var(--font-size-lg)" }}>¥{totalAmount.toFixed(2)}</strong>
                                  </Table.Summary.Cell>
                                  <Table.Summary.Cell index={2} colSpan={3} />
                                </Table.Summary.Row>
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
                      </div>
                    ),
                  },
                  {
                    key: 'style-secondary',
                    label: '二次工艺详情',
                    children: (
                      <div className="order-flow-module">
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
