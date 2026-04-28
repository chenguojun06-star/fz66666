import React from 'react';
import { Alert, Card, Tabs } from 'antd';
import ResizableTable from '@/components/common/ResizableTable';
import SupplierNameTooltip from '@/components/common/SupplierNameTooltip';
import { formatProcessDisplayName } from '@/utils/productionStage';
import { getMaterialTypeLabel } from '@/utils/materialType';
import StylePatternSimpleTab from './StylePatternSimpleTab';
import StyleQuotationTab from '@/modules/basic/pages/StyleInfo/components/StyleQuotationTab';
import StyleSecondaryProcessTab from '@/modules/basic/pages/StyleInfo/components/StyleSecondaryProcessTab';
import { formatReferenceKilograms } from '../../MaterialPurchase/utils';

interface Props {
  loading: boolean;
  data: any;
  order: any;
  isFactoryUser: boolean;
  enrichedStages: any[];
  stageColumns: any[];
  orderLines: any[];
  orderLineColumns: any[];
  cuttingSizeItems: any[];
  styleProcessDescriptionMap: Map<string, string>;
  secondaryProcessDescriptionMap: Map<string, string>;
}

const FlowStepRenderer: React.FC<Props> = ({
  loading, data, isFactoryUser,
  enrichedStages, stageColumns, orderLines, orderLineColumns,
  cuttingSizeItems, styleProcessDescriptionMap, secondaryProcessDescriptionMap,
}) => {
  return (
    <Card size="small" className="order-flow-tabs-card" style={{ marginTop: 8 }} loading={loading}>
      <Tabs
        items={[
          {
            key: 'overview',
            label: '概览',
            children: (
              <ResizableTable storageKey="order-flow-stages" size="small" columns={stageColumns}
                dataSource={enrichedStages} rowKey={(r: any) => r.processName} pagination={false} scroll={{ x: 980 }} />
            ),
          },
          {
            key: 'order',
            label: `下单明细${orderLines.length ? ` (${orderLines.length})` : ''}`,
            children: (
              <ResizableTable storageKey="order-flow-order-lines" size="small"
                columns={isFactoryUser ? orderLineColumns.filter((c: any) => c.key !== 'totalPrice') : orderLineColumns}
                dataSource={orderLines} rowKey={(r: any) => String((r as any)?.skuNo || `${r.color}-${r.size}`)}
                pagination={false} scroll={{ x: 1060 }} />
            ),
          },
          ...(cuttingSizeItems && cuttingSizeItems.length > 0 ? [{
            key: 'cutting',
            label: `裁剪明细 (${cuttingSizeItems.reduce((s: number, i: any) => s + i.quantity, 0)})`,
            children: (
              <ResizableTable storageKey="order-flow-cutting" size="small"
                columns={[
                  { title: '颜色', dataIndex: 'color', key: 'color', width: 140, render: (v: any) => String(v || '').trim() || '-' },
                  { title: '尺码', dataIndex: 'size', key: 'size', width: 100 },
                  { title: '裁剪数量', dataIndex: 'quantity', key: 'quantity', width: 120, align: 'right' as const },
                ]}
                dataSource={cuttingSizeItems} rowKey={(r: any) => `${r.color || ''}-${r.size}`}
                pagination={false} scroll={{ x: 360 }} />
            ),
          }] : []),
          ...(data?.order?.styleId ? [
            {
              key: 'style-pattern',
              label: '资料详情',
              children: <StylePatternSimpleTab styleId={data.order.styleId} styleNo={data.order.styleNo} />,
            },
            {
              key: 'style-cost',
              label: '工序详细信息',
              children: (
                <>
                  {(() => {
                    let workflowNodes: any[] = [];
                    try {
                      if (data?.order?.progressWorkflowJson) {
                        const workflow = typeof data.order.progressWorkflowJson === 'string'
                          ? JSON.parse(data.order.progressWorkflowJson) : data.order.progressWorkflowJson;
                        const nodes = workflow?.nodes || [];
                        if (nodes.length > 0 && nodes[0]?.name) {
                          workflowNodes = nodes.map((item: any, idx: number) => ({
                            id: item.id || `proc_${idx}`, name: item.name || item.processName || '',
                            progressStage: item.progressStage || '', machineType: item.machineType || '',
                            standardTime: item.standardTime || 0, unitPrice: Number(item.unitPrice) || 0,
                            sortOrder: item.sortOrder ?? idx, description: item.description || item.remark || '',
                          }));
                        } else {
                          const processesByNode = workflow?.processesByNode || {};
                          const allProcesses: any[] = []; let sortIdx = 0;
                          for (const node of nodes) {
                            const nodeProcesses = processesByNode[node?.id || ''] || [];
                            for (const p of nodeProcesses) {
                              allProcesses.push({
                                id: p.id || `proc_${sortIdx}`, name: p.name || p.processName || '',
                                progressStage: p.progressStage || node?.progressStage || node?.name || '',
                                machineType: p.machineType || '', standardTime: p.standardTime || 0,
                                unitPrice: Number(p.unitPrice) || 0, sortOrder: sortIdx, description: p.description || p.remark || '',
                              }); sortIdx++;
                            }
                          }
                          workflowNodes = allProcesses;
                        }
                      }
                    } catch (e) { /* ignore */ }
                    if (workflowNodes.length === 0 && Array.isArray(data?.order?.progressNodeUnitPrices) && data.order.progressNodeUnitPrices.length > 0) {
                      workflowNodes = data.order.progressNodeUnitPrices.map((item: any, idx: number) => ({
                        id: item.id || item.processId || `node_${idx}`, name: item.name || item.processName || '',
                        progressStage: item.progressStage || '', machineType: item.machineType || '',
                        standardTime: item.standardTime || 0, unitPrice: Number(item.unitPrice) || Number(item.price) || 0,
                        sortOrder: item.sortOrder ?? idx, description: item.description || item.remark || '',
                      }));
                    }
                    if (workflowNodes.length > 0) {
                      workflowNodes = workflowNodes.map((item) => {
                        const processName = String(item?.name || '').trim();
                        const stageName = String(item?.progressStage || '').trim();
                        const isSecondary = stageName.includes('二次工艺') || processName.includes('二次工艺');
                        const description = String(item?.description || '').trim()
                          || (isSecondary ? secondaryProcessDescriptionMap.get(processName) : styleProcessDescriptionMap.get(processName)) || '';
                        return { ...item, description };
                      });
                      const totalPrice = workflowNodes.reduce((sum: number, item: any) => sum + (item.unitPrice || 0), 0);
                      return (
                        <>
                          {!isFactoryUser && (
                            <Alert title="工序单价信息" type="info" showIcon style={{ marginBottom: 16 }}
                              description={
                                <div>
                                  <p>工序数量: <strong>{workflowNodes.length}</strong> 个 | 工序总单价: <strong style={{ color: 'var(--primary-color)', fontSize: 'var(--font-size-lg)' }}>¥{totalPrice.toFixed(2)}</strong></p>
                                  <p style={{ marginTop: 8, color: 'var(--color-warning)' }}>提示：单价修改需要到"单价维护"模块中修改，修改后点击"刷新数据"按钮可更新单价</p>
                                </div>
                              } />
                          )}
                          <ResizableTable storageKey="order-flow-workflow" dataSource={workflowNodes}
                            rowKey={(record: any) => record.id || `${record.name}-${record.progressStage}`}
                            columns={[
                              { title: '序号', key: 'index', width: 70, align: 'center', render: (_: any, __: any, index: number) => index + 1 },
                              { title: '工序名称', dataIndex: 'name', key: 'name', width: 180, render: (v: any, record: any) => formatProcessDisplayName(record.id, v) },
                              { title: '阶段', dataIndex: 'progressStage', key: 'progressStage', width: 120, render: (v: any) => {
                                const m: Record<string, string> = { sample: '样衣', pre_production: '产前', production: '大货生产', procurement: '采购', cutting: '裁剪', carSewing: '车缝', secondaryProcess: '二次工艺', tailProcess: '尾部', warehousing: '入库' };
                                return m[v] || v || '-'; }},
                              { title: '机器类型', dataIndex: 'machineType', key: 'machineType', width: 120, render: (v: any) => v || '-' },
                              { title: '标准工时(分钟)', dataIndex: 'standardTime', key: 'standardTime', width: 130, align: 'right' as const, render: (v: any) => Number(v || 0).toFixed(2) },
                              ...(!isFactoryUser ? [{ title: '单价(元)', dataIndex: 'unitPrice', key: 'unitPrice', width: 120, align: 'right' as const, render: (v: any) => <strong style={{ color: 'var(--primary-color)' }}>¥{Number(v || 0).toFixed(2)}</strong> }] : []),
                              { title: '工序描述', dataIndex: 'description', key: 'description', ellipsis: true, render: (v: any) => v || '-' },
                            ]} pagination={false} bordered scroll={{ x: 'max-content' }} />
                        </>
                      );
                    }
                    if (data?.order?.styleId) {
                      return <StyleQuotationTab styleId={data.order.styleId} readOnly={true} onSaved={() => {}} />;
                    }
                    return <Alert title="暂无工序单价数据" description="此订单尚未配置工序单价信息" type="warning" showIcon />;
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
                    <ResizableTable storageKey="order-flow-materials" dataSource={data.materialPurchases}
                      rowKey={(record: any) => record.id || record.processCode || `row-${Math.random()}`}
                      columns={[
                        { title: '序号', key: 'index', width: 70, align: 'center' as const, render: (_: any, __: any, index: number) => index + 1 },
                        { title: '物料类型', dataIndex: 'materialType', key: 'materialType', width: 120, render: (v: any) => getMaterialTypeLabel(v) },
                        { title: '物料名称', dataIndex: 'materialName', key: 'materialName', width: 200, ellipsis: true, render: (v: any) => v || '-' },
                        { title: '规格/幅宽', dataIndex: 'specifications', key: 'specifications', width: 150, ellipsis: true, render: (v: any) => v || '-' },
                        { title: '颜色', dataIndex: 'color', key: 'color', width: 100, render: (v: any) => v || '-' },
                        { title: '尺码用量', key: 'sizeUsage', width: 220, render: (_: any, record: any) => {
                          if (record.sizeUsageMap) {
                            try {
                              const map: Record<string, string> = JSON.parse(record.sizeUsageMap);
                              const entries = Object.entries(map);
                              if (entries.length > 0) return <div style={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>{entries.map(([sz, usage]) => <span key={sz} style={{ margin: 0, fontSize: 11, background: '#f0f0f0', padding: '0 4px', borderRadius: 2 }}>{sz}: {Number(usage).toFixed(2)}{record.unit || ''}</span>)}</div>;
                            } catch { /* ignore */ }
                          }
                          return <span style={{ color: '#999' }}>{record.size || '-'}</span>;
                        }},
                        { title: '采购数量', dataIndex: 'purchaseQuantity', key: 'purchaseQuantity', width: 120, align: 'right' as const, render: (v: any, record: any) => `${Number(v || 0).toFixed(2)} ${record.unit || ''}` },
                        { title: '参考公斤数', key: 'referenceKilograms', width: 120, align: 'right' as const, render: (_: any, record: any) => formatReferenceKilograms(record.purchaseQuantity, record.conversionRate, record.unit) },
                        { title: '已到货', dataIndex: 'arrivedQuantity', key: 'arrivedQuantity', width: 120, align: 'right' as const, render: (v: any, record: any) => {
                          const val = Number(v || 0); const ordered = Number(record.purchaseQuantity || 0);
                          const color = val >= ordered && ordered > 0 ? 'var(--color-success)' : 'var(--color-warning)';
                          return <span style={{ color }}>{val.toFixed(2)} {record.unit || ''}</span>;
                        }},
                        ...(!isFactoryUser ? [{ title: '单价', dataIndex: 'unitPrice', key: 'unitPrice', width: 100, align: 'right' as const, render: (v: any) => v ? `¥${Number(v).toFixed(2)}` : '-' }] : []),
                        { title: '总价', key: 'totalAmount', width: 120, align: 'right' as const, render: (_: any, record: any) => {
                          const total = Number(record.totalAmount || 0) || (Number(record.purchasedQuantity || 0) * Number(record.unitPrice || 0));
                          return total > 0 ? <strong style={{ color: 'var(--primary-color)' }}>¥{total.toFixed(2)}</strong> : '-';
                        }},
                        { title: '供应商', dataIndex: 'supplierName', key: 'supplierName', width: 150, ellipsis: true, render: (_: any, record: any) => <SupplierNameTooltip name={record.supplierName} contactPerson={record.supplierContactPerson} contactPhone={record.supplierContactPhone} /> },
                        { title: '状态', dataIndex: 'status', key: 'status', width: 100, render: (v: any) => {
                          const m: Record<string, { text: string; color: string }> = { pending: { text: '待采购', color: 'default' }, received: { text: '已领取', color: 'processing' }, partial: { text: '部分到货', color: 'warning' }, partial_arrival: { text: '部分到货', color: 'warning' }, awaiting_confirm: { text: '待确认完成', color: 'cyan' }, completed: { text: '全部到货', color: 'success' }, cancelled: { text: '已取消', color: 'error' }, warehouse_pending: { text: '待仓库出库', color: 'blue' } };
                          const s = m[v] || { text: v || '未知', color: 'default' };
                          return <span style={{ padding: '1px 6px', borderRadius: 3, fontSize: 12, background: `var(--ant-${s.color}-1, #f0f0f0)`, color: `var(--ant-${s.color}-6, #333)` }}>{s.text}</span>;
                        }},
                        { title: '备注', dataIndex: 'remark', key: 'remark', ellipsis: true, render: (v: any) => v || '-' },
                      ]} pagination={false} bordered scroll={{ x: 'max-content' }} />
                  ) : <Alert title="暂无物料采购信息" description="此订单尚未录入物料采购数据" type="info" showIcon />}
                </>
              ),
            },
            {
              key: 'style-secondary',
              label: '二次工艺详情',
              children: data?.order?.styleId ? <StyleSecondaryProcessTab styleId={data.order.styleId} readOnly={true} simpleView={true} />
                : <Alert title="暂无二次工艺信息" description="此订单未关联款号，无法显示二次工艺详情" type="info" showIcon />,
            },
          ] : []),
        ]}
      />
    </Card>
  );
};

export default FlowStepRenderer;
