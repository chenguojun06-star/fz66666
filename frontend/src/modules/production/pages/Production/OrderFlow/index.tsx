import React from 'react';
import { Alert, Button, Card, Col, Row, Space, Tabs, Tag } from 'antd';
import Layout from '@/components/Layout';
import PageLayout from '@/components/common/PageLayout';
import { formatProcessDisplayName } from '@/utils/productionStage';
import ResizableTable from '@/components/common/ResizableTable';
import SupplierNameTooltip from '@/components/common/SupplierNameTooltip';
import { toNumberSafe } from '@/utils/api';
import { formatDateTime } from '@/utils/datetime';
import { calcOrderProgress } from '@/modules/production/utils/calcOrderProgress';
import { getMaterialTypeLabel } from '@/utils/materialType';
import { StyleCoverThumb } from '@/components/StyleAssets';
import StylePatternSimpleTab from './components/StylePatternSimpleTab';
import StyleQuotationTab from '@/modules/basic/pages/StyleInfo/components/StyleQuotationTab';
import StyleSecondaryProcessTab from '@/modules/basic/pages/StyleInfo/components/StyleSecondaryProcessTab';
import SmartErrorNotice from '@/smart/components/SmartErrorNotice';
import '../../../styles.css';
import { formatReferenceKilograms } from '../MaterialPurchase/utils';
import { useOrderFlowData, orderStatusTag } from './useOrderFlowData';

const OrderFlow: React.FC = () => {
  const {
    query, loading, data, order, isFactoryUser,
    smartError, showSmartErrorNotice, fetchFlow,
    enrichedStages, stageColumns, orderLines, orderLineColumns,
    warehousingTotal, warehousingQualified, warehousingUnqualified,
    cuttingSizeItems, styleProcessDescriptionMap, secondaryProcessDescriptionMap,
  } = useOrderFlowData();

  return (
    <Layout>
        <PageLayout
          title="订单全流程记录"
          titleExtra={
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
          }
          headerContent={
            <>
              {showSmartErrorNotice && smartError ? (
                <div style={{ marginBottom: 12 }}>
                  <SmartErrorNotice error={smartError} onFix={fetchFlow} />
                </div>
              ) : null}
              {!query.orderId ? (
                <Alert
                  type="warning"
                  showIcon
                  title="缺少订单ID，无法打开全流程记录"
                  description="请从我的订单列表点击订单号进入。"
                />
              ) : null}
            </>
          }
        >

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
                  <span style={{ fontSize: 13, fontWeight: 600, lineHeight: '22px' }}>{`${calcOrderProgress(order as any)}%`}</span>
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
                    label: '资料详情',
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
                                      render: (v: any, record: any) => formatProcessDisplayName(record.id, v)
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
                                      align: 'right' as const,
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
                                align: 'center' as const,
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
                                align: 'right' as const,
                                render: (v: any, record: any) => `${Number(v || 0).toFixed(2)} ${record.unit || ''}`
                              },
                              {
                                title: '参考公斤数',
                                key: 'referenceKilograms',
                                width: 120,
                                align: 'right' as const,
                                render: (_: any, record: any) =>
                                  formatReferenceKilograms(record.purchaseQuantity, record.conversionRate, record.unit)
                              },
                              {
                                title: '已到货',
                                dataIndex: 'arrivedQuantity',
                                key: 'arrivedQuantity',
                                width: 120,
                                align: 'right' as const,
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
                                align: 'right' as const,
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
                                    'received': { text: '已领取', color: 'processing' },
                                    'partial': { text: '部分到货', color: 'warning' },
                                    'partial_arrival': { text: '部分到货', color: 'warning' },
                                    'awaiting_confirm': { text: '待确认完成', color: 'cyan' },
                                    'completed': { text: '全部到货', color: 'success' },
                                    'cancelled': { text: '已取消', color: 'error' },
                                    'warehouse_pending': { text: '待仓库出库', color: 'blue' },
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
        </PageLayout>
    </Layout>
  );
};

export default OrderFlow;
