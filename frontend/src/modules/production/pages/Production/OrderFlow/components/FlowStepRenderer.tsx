import React, { useCallback, useEffect, useState } from 'react';
import { Alert, App, Button, Card, Space, Tabs, Tooltip, Timeline, Empty, Input, Image } from 'antd';
import { PlusOutlined, ThunderboltOutlined, EditOutlined, CheckOutlined, CloseOutlined, HistoryOutlined, UserOutlined } from '@ant-design/icons';
import ResizableTable from '@/components/common/ResizableTable';
import SupplierNameTooltip from '@/components/common/SupplierNameTooltip';
import { formatProcessDisplayName } from '@/utils/productionStage';
import { getMaterialTypeLabel } from '@/utils/materialType';
import StylePatternSimpleTab from './StylePatternSimpleTab';
import StyleQuotationTab from '@/modules/basic/pages/StyleInfo/components/StyleQuotationTab';
import StyleSecondaryProcessTab from '@/modules/basic/pages/StyleInfo/components/StyleSecondaryProcessTab';
import { formatReferenceKilograms } from '../../MaterialPurchase/utils';
import { toNumberSafe } from '@/utils/api';
import DisplayStatusTag from '@/components/common/DisplayStatusTag';
import { displayDate, displayAmount } from '@/utils/display';
import type { CuttingBundle, CuttingTask } from '@/types/production';
import api from '@/utils/api';
import { remarkApi, type OrderRemark } from '@/services/system/remarkApi';
import { getFullAuthedFileUrl } from '@/utils/fileUrl';

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
  cuttingBundles: CuttingBundle[];
  cuttingTasks: CuttingTask[];
  styleProcessDescriptionMap: Map<string, string>;
  secondaryProcessDescriptionMap: Map<string, string>;
  editing: boolean;
  onStartEdit: () => void;
  onFinishEdit: () => void;
  onCancelEdit: () => void;
  onRefresh?: () => void;
}

const FlowStepRenderer: React.FC<Props> = ({
  loading, data, isFactoryUser,
  enrichedStages, stageColumns, orderLines, orderLineColumns,
  cuttingSizeItems, cuttingBundles, cuttingTasks, styleProcessDescriptionMap, secondaryProcessDescriptionMap,
  editing, onStartEdit, onFinishEdit, onCancelEdit,
  onRefresh,
}) => {
  const { message, modal } = App.useApp();
  const bomList = data?.bomList || [];
  const materialPurchases = data?.materialPurchases || [];
  const orderId = data?.order?.id || '';
  const orderNo = data?.order?.orderNo || '';
  const [generating, setGenerating] = useState(false);
  const [remarks, setRemarks] = useState<OrderRemark[]>([]);
  const [remarksLoading, setRemarksLoading] = useState(false);
  const [newRemark, setNewRemark] = useState('');

  const fetchRemarks = useCallback(async () => {
    if (!orderNo) return;
    setRemarksLoading(true);
    try {
      const res = await remarkApi.list({ targetType: 'order', targetNo: orderNo });
      const list = (res as any)?.data || res || [];
      setRemarks(Array.isArray(list) ? list : []);
    } catch { setRemarks([]); }
    finally { setRemarksLoading(false); }
  }, [orderNo]);

  useEffect(() => { fetchRemarks(); }, [fetchRemarks]);

  const recordAction = useCallback(async (action: string, reason: string) => {
    if (!orderNo) return;
    try {
      await remarkApi.add({
        targetType: 'order',
        targetNo: orderNo,
        authorRole: action,
        content: reason,
      });
      fetchRemarks();
    } catch { /* ignore */ }
  }, [orderNo, fetchRemarks]);

  const showReasonModal = useCallback((title: string, actionLabel: string, onConfirm: (reason: string) => void) => {
    let reasonValue = '';
    modal.confirm({
      title,
      width: '40vw',
      content: (
        <div style={{ marginTop: 12 }}>
          <p style={{ marginBottom: 8, color: 'var(--color-text-secondary)' }}>请输入{actionLabel}原因（将记录到订单操作记录）：</p>
          <Input.TextArea
            id="action-reason-input"
            rows={3}
            maxLength={500}
            showCount
            placeholder={`请输入${actionLabel}原因...`}
            onChange={(e) => { reasonValue = e.target.value; }}
          />
        </div>
      ),
      okText: '确认',
      cancelText: '取消',
      onOk: () => {
        const reason = reasonValue?.trim();
        if (!reason) {
          message.warning('请输入操作原因');
          return Promise.reject();
        }
        onConfirm(reason);
      },
    });
  }, [modal, message]);

  const handleGenerateFromBom = async (reason: string) => {
    if (!orderId) { message.error('缺少订单ID'); return; }
    setGenerating(true);
    try {
      const res = await api.post('/production/material/demand/generate', { orderId });
      if (res?.code === 200 || res?.data) {
        await recordAction('从BOM生成采购', reason);
        message.success('已从BOM生成采购数据');
        onRefresh?.();
      } else {
        message.error(res?.message || '生成失败');
      }
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : '生成采购数据失败');
    } finally {
      setGenerating(false);
    }
  };

  const handleStartEdit = () => {
    onStartEdit();
  };

  const handleFinishEdit = async () => {
    onFinishEdit();
  };

  const handleCancelEdit = async () => {
    onCancelEdit();
  };

  const handleAddRemark = async () => {
    const content = newRemark.trim();
    if (!content) { message.warning('请输入备注内容'); return; }
    try {
      await remarkApi.add({ targetType: 'order', targetNo: orderNo, content });
      setNewRemark('');
      fetchRemarks();
      message.success('备注已添加');
    } catch { message.error('添加备注失败'); }
  };

  const taskReceiverName = cuttingTasks?.[0]?.receiverName || '';

  const bomColumns = [
    { title: '分组', dataIndex: 'groupName', key: 'groupName', width: 100, render: (v: any) => v || '-' },
    { title: '物料类型', dataIndex: 'materialType', key: 'materialType', width: 100, render: (v: any) => getMaterialTypeLabel(v) },
    { title: '物料编码', dataIndex: 'materialCode', key: 'materialCode', width: 120, render: (v: any) => v || '-' },
    { title: '物料名称', dataIndex: 'materialName', key: 'materialName', width: 180, ellipsis: true, render: (v: any) => v || '-' },
    { title: '规格/幅宽', dataIndex: 'specification', key: 'specification', width: 120, ellipsis: true, render: (v: any) => v || '-' },
    { title: '颜色', dataIndex: 'color', key: 'color', width: 80, render: (v: any) => v || '-' },
    { title: '尺码用量', key: 'sizeUsage', width: 220, render: (_: any, record: any) => {
      if (record.sizeUsageMap) {
        try {
          const map: Record<string, string> = JSON.parse(record.sizeUsageMap);
          const entries = Object.entries(map);
          if (entries.length > 0) return <div style={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>{entries.map(([sz, usage]) => <span key={sz} style={{ fontSize: 14, background: 'var(--color-border-light)', padding: '0 4px', borderRadius: 2 }}>{sz}: {Number(usage).toFixed(2)}{record.unit || ''}</span>)}</div>;
        } catch { /* ignore */ }
      }
      return <span style={{ color: 'var(--color-text-tertiary)' }}>{record.size || '-'}</span>;
    }},
    { title: '单件用量', dataIndex: 'usageAmount', key: 'usageAmount', width: 100, align: 'right' as const, render: (v: any, record: any) => v ? `${Number(v).toFixed(2)} ${record.unit || ''}` : '-' },
    { title: '损耗率', dataIndex: 'lossRate', key: 'lossRate', width: 80, align: 'right' as const, render: (v: any) => v ? `${Number(v)}%` : '-' },
    ...(!isFactoryUser ? [
      { title: '单价', dataIndex: 'unitPrice', key: 'unitPrice', width: 90, align: 'right' as const, render: (v: any) => v ? displayAmount(Number(v)) : '-' },
      { title: '总价', key: 'totalPrice', width: 100, align: 'right' as const, render: (_: any, record: any) => {
        const total = Number(record.totalPrice || 0) || (Number(record.usageAmount || 0) * Number(record.unitPrice || 0));
        return total > 0 ? <strong style={{ color: 'var(--color-primary)' }}>{displayAmount(total)}</strong> : '-';
      }},
    ] : []),
    { title: '供应商', dataIndex: 'supplier', key: 'supplier', width: 120, ellipsis: true, render: (v: any) => v || '-' },
    { title: '备注', dataIndex: 'remark', key: 'remark', width: 150, ellipsis: true, render: (v: any) => v || '-' },
  ];

  const remarkCount = remarks.length;

  return (
    <Card className="order-flow-tabs-card" style={{ marginTop: 8 }} loading={loading}
      extra={
        <Space>
          {editing ? (
            <>
              <Tooltip title="完成编辑并记录备注">
                <Button type="primary" size="small" icon={<CheckOutlined />} onClick={handleFinishEdit}>
                  完成编辑
                </Button>
              </Tooltip>
              <Button size="small" icon={<CloseOutlined />} onClick={handleCancelEdit}>取消</Button>
            </>
          ) : (
            <Button size="small" icon={<EditOutlined />} onClick={handleStartEdit}>编辑</Button>
          )}
        </Space>
      }
    >
      <Tabs
        items={[
          {
            key: 'overview',
            label: '概览',
            children: (
              <ResizableTable storageKey="order-flow-stages" size="small" columns={stageColumns}
                dataSource={enrichedStages} rowKey={(r: any) => r.processName} pagination={false} scroll={{ x: 980 }}
                emptyDescription="暂无阶段数据" />
            ),
          },
          {
            key: 'order',
            label: `下单明细${orderLines.length ? ` (${orderLines.length})` : ''}`,
            children: (
              <ResizableTable storageKey="order-flow-order-lines"
                columns={isFactoryUser ? orderLineColumns.filter((c: any) => c.key !== 'totalPrice') : orderLineColumns}
                dataSource={orderLines} rowKey={(r: any) => String((r as any)?.skuNo || `${r.color}-${r.size}`)}
                pagination={false} scroll={{ x: 1060 }}
                emptyDescription="暂无下单明细" />
            ),
          },
          ...(cuttingBundles && cuttingBundles.length > 0 ? [
            {
              key: 'cutting',
              label: `裁剪明细 (${cuttingBundles.length})`,
              children: (
                <div>
                  {cuttingTasks && cuttingTasks.length > 0 && (
                    <Card size="small" title="裁剪任务" style={{ marginBottom: 12 }}>
                      <ResizableTable storageKey="order-flow-cutting-tasks" size="small"
                        dataSource={cuttingTasks}
                        rowKey={(r: any) => r.id || `${r.bedNo || ''}-${r.createTime || ''}`}
                        emptyDescription="暂无裁剪任务"
                        columns={[
                          { title: '床号', dataIndex: 'bedNo', key: 'bedNo', width: 100, render: (v: any) => v ? `第${v}床` : '-' },
                          { title: '裁片数', dataIndex: 'cuttingQuantity', key: 'cuttingQuantity', width: 100, align: 'right' as const, render: (v: any) => toNumberSafe(v) },
                          { title: '扎数', dataIndex: 'cuttingBundleCount', key: 'cuttingBundleCount', width: 80, align: 'right' as const, render: (v: any) => toNumberSafe(v) },
                          { title: '操作人', dataIndex: 'receiverName', key: 'receiverName', width: 120, render: (v: any) => v || '-' },
                          { title: '完成时间', dataIndex: 'bundledTime', key: 'bundledTime', width: 170, render: (v: any, record: any) => displayDate(v ?? record?.createTime, 'datetime') },
                          { title: '状态', dataIndex: 'status', key: 'status', width: 100, render: (v: any) => <DisplayStatusTag status={v} variant="task" /> },
                        ]} pagination={false} scroll={{ x: 670 }} />
                    </Card>
                  )}
                  <ResizableTable storageKey="order-flow-cutting" size="small"
                    dataSource={cuttingBundles}
                    rowKey={(r: any) => r.id}
                    emptyDescription="暂无裁剪明细"
                    columns={[
                      { title: '床号', dataIndex: 'bedNo', key: 'bedNo', width: 90, render: (v: any, record: any) => {
                        if (!v) return '-';
                        const sub = record.bedSubNo;
                        return sub != null ? `${v}-${sub}` : String(v);
                      }},
                      { title: '扎号', dataIndex: 'bundleNo', key: 'bundleNo', width: 80 },
                      { title: '标签号', dataIndex: 'bundleLabel', key: 'bundleLabel', width: 120, render: (v: any) => v || '-' },
                      { title: '颜色', dataIndex: 'color', key: 'color', width: 100, render: (v: any) => String(v || '').trim() || '-' },
                      { title: '尺码', dataIndex: 'size', key: 'size', width: 80 },
                      { title: '数量', dataIndex: 'quantity', key: 'quantity', width: 80, align: 'right' as const, render: (v: any) => toNumberSafe(v) },
                      { title: '状态', dataIndex: 'status', key: 'status', width: 100, render: (v: any) => <DisplayStatusTag status={v} variant="bundle" /> },
                      { title: '创建时间', dataIndex: 'createTime', key: 'createTime', width: 170, render: (v: any) => displayDate(v, 'datetime') },
                      { title: '操作人', key: 'operatorDisplay', width: 120, render: (_: any, record: any) => {
                        const opName = record.operatorName || record.creatorName;
                        if (taskReceiverName && (!opName || opName === '系统管理员')) return taskReceiverName;
                        return opName || '-';
                      }},
                    ]} pagination={false} scroll={{ x: 1020 }} />
                </div>
              ),
            },
          ] : []),
          ...(cuttingSizeItems && cuttingSizeItems.length > 0 && cuttingBundles && cuttingBundles.length === 0 ? [{
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
                pagination={false} scroll={{ x: 360 }}
                emptyDescription="暂无裁剪明细" />
            ),
          }] : []),
          ...(data?.order?.styleId ? [
            {
              key: 'bom',
              label: `面辅料${materialPurchases.length ? ` (${materialPurchases.length})` : bomList.length ? ` (${bomList.length})` : ''}`,
              children: materialPurchases.length > 0 ? (
                <>
                  <div style={{ marginBottom: 12, display: 'flex', justifyContent: 'flex-end' }}>
                    <Space>
                      {bomList.length > 0 && (
                        <Button icon={<ThunderboltOutlined />} loading={generating}
                          onClick={() => showReasonModal('从BOM生成采购', '生成采购', (reason) => handleGenerateFromBom(reason))}
                        >
                          从BOM生成
                        </Button>
                      )}
                      <Button
                        type="primary"
                        icon={<PlusOutlined />}
                        onClick={() => showReasonModal('录入物料采购', '录入采购', (reason) => {
                          recordAction('录入采购', reason);
                          const url = orderId
                            ? `/production/material-purchase?orderId=${orderId}&orderNo=${encodeURIComponent(orderNo)}`
                            : '/production/material-purchase';
                          window.open(url, '_blank');
                        })}
                      >
                        录入采购
                      </Button>
                    </Space>
                  </div>
                  <ResizableTable storageKey="order-flow-bom" size="small"
                    dataSource={materialPurchases}
                    rowKey={(r: any) => r.id || `mp-${Math.random()}`}
                    showIndex
                    emptyDescription="暂无采购明细"
                    columns={[
                      { title: '物料类型', dataIndex: 'materialType', key: 'materialType', width: 100, render: (v: any) => getMaterialTypeLabel(v) },
                      { title: '物料编码', dataIndex: 'materialCode', key: 'materialCode', width: 120, render: (v: any) => v || '-' },
                      { title: '物料名称', dataIndex: 'materialName', key: 'materialName', width: 180, ellipsis: true, render: (v: any) => v || '-' },
                      { title: '规格/幅宽', dataIndex: 'specifications', key: 'specifications', width: 120, ellipsis: true, render: (v: any) => v || '-' },
                      { title: '颜色', dataIndex: 'color', key: 'color', width: 80, render: (v: any) => v || '-' },
                      { title: '尺码用量', key: 'sizeUsage', width: 220, render: (_: any, record: any) => {
                        if (record.sizeUsageMap) {
                          try {
                            const map: Record<string, string> = JSON.parse(record.sizeUsageMap);
                            const entries = Object.entries(map);
                            if (entries.length > 0) return <div style={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>{entries.map(([sz, usage]) => <span key={sz} style={{ fontSize: 12, background: 'var(--color-border-light)', padding: '0 4px', borderRadius: 2 }}>{sz}: {Number(usage).toFixed(2)}{record.unit || ''}</span>)}</div>;
                          } catch { /* ignore */ }
                        }
                        return <span style={{ color: 'var(--color-text-tertiary)' }}>{record.size || '-'}</span>;
                      }},
                      { title: '采购数量', dataIndex: 'purchaseQuantity', key: 'purchaseQuantity', width: 120, align: 'right' as const, render: (v: any, record: any) => `${Number(v || 0).toFixed(2)} ${record.unit || ''}` },
                      { title: '已到货', dataIndex: 'arrivedQuantity', key: 'arrivedQuantity', width: 120, align: 'right' as const, render: (v: any, record: any) => {
                        const val = Number(v || 0); const ordered = Number(record.purchaseQuantity || 0);
                        const color = val >= ordered && ordered > 0 ? 'var(--color-success)' : 'var(--color-warning)';
                        return <span style={{ color }}>{val.toFixed(2)} {record.unit || ''}</span>;
                      }},
                      ...(!isFactoryUser ? [
                        { title: '单价', dataIndex: 'unitPrice', key: 'unitPrice', width: 90, align: 'right' as const, render: (v: any) => v ? displayAmount(Number(v)) : '-' },
                        { title: '总价', key: 'totalPrice', width: 100, align: 'right' as const, render: (_: any, record: any) => {
                          const total = Number(record.totalAmount || 0) || (Number(record.purchaseQuantity || 0) * Number(record.unitPrice || 0));
                          return total > 0 ? <strong style={{ color: 'var(--color-primary)' }}>{displayAmount(total)}</strong> : '-';
                        }},
                      ] : []),
                      { title: '供应商', dataIndex: 'supplierName', key: 'supplierName', width: 120, ellipsis: true, render: (v: any) => v || '-' },
                      { title: '状态', dataIndex: 'status', key: 'status', width: 100, render: (v: any) => v || '-' },
                    ]}
                    pagination={false} bordered scroll={{ x: 'max-content' }} />
                </>
              ) : bomList.length > 0 ? (
                <>
                  <div style={{ marginBottom: 12, display: 'flex', justifyContent: 'flex-end' }}>
                    <Button type="primary" icon={<ThunderboltOutlined />} loading={generating}
                      onClick={() => showReasonModal('从BOM生成采购', '生成采购', (reason) => handleGenerateFromBom(reason))}
                    >
                      从BOM生成采购
                    </Button>
                  </div>
                  <ResizableTable storageKey="order-flow-bom" size="small"
                    dataSource={bomList}
                    rowKey={(r: any) => r.id || `bom-${Math.random()}`}
                    columns={bomColumns}
                    showIndex
                    emptyDescription="暂无BOM物料"
                    pagination={false} bordered scroll={{ x: 'max-content' }} />
                </>
              ) : <Alert title="暂无面辅料信息" description="此订单尚未录入采购物料，也关联的款号未录入BOM物料清单" type="info" showIcon />,
            },
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
                                  <p>工序数量: <strong>{workflowNodes.length}</strong> 个 | 工序总单价: <strong style={{ color: 'var(--color-primary)', fontSize: 'var(--font-size-lg)' }}>{displayAmount(totalPrice)}</strong></p>
                                </div>
                              } />
                          )}
                          <ResizableTable storageKey="order-flow-workflow" dataSource={workflowNodes}
                            rowKey={(record: any) => record.id || `${record.name}-${record.progressStage}`}
                            showIndex
                            emptyDescription="暂无工序数据"
                            columns={[
                              { title: '工序名称', dataIndex: 'name', key: 'name', width: 180, render: (v: any, record: any) => formatProcessDisplayName(record.id, v) },
                              { title: '阶段', dataIndex: 'progressStage', key: 'progressStage', width: 120, render: (v: any) => {
                                const m: Record<string, string> = { sample: '样衣', pre_production: '产前', production: '大货生产', procurement: '采购', cutting: '裁剪', carSewing: '车缝', secondaryProcess: '二次工艺', tailProcess: '尾部', warehousing: '入库' };
                                return m[v] ?? (v ? '未知' : '-'); }},
                              { title: '机器类型', dataIndex: 'machineType', key: 'machineType', width: 120, render: (v: any) => v || '-' },
                              { title: '标准工时(分钟)', dataIndex: 'standardTime', key: 'standardTime', width: 130, align: 'right' as const, render: (v: any) => Number(v || 0).toFixed(2) },
                              ...(!isFactoryUser ? [{ title: '单价', dataIndex: 'unitPrice', key: 'unitPrice', width: 120, align: 'right' as const, render: (v: any) => <strong style={{ color: 'var(--color-primary)' }}>{displayAmount(Number(v || 0))}</strong> }] : []),
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
              key: 'style-secondary',
              label: '二次工艺详情',
              children: data?.order?.styleId ? <StyleSecondaryProcessTab styleId={data.order.styleId} readOnly={!editing} simpleView={true} />
                : <Alert title="暂无二次工艺信息" description="此订单未关联款号，无法显示二次工艺详情" type="info" showIcon />,
            },
          ] : []),
          {
            key: 'operation-log',
            label: `操作记录${remarkCount ? ` (${remarkCount})` : ''}`,
            children: (
              <div>
                <div style={{ marginBottom: 16, display: 'flex', gap: 8 }}>
                  <Input.TextArea
                    value={newRemark}
                    onChange={(e) => setNewRemark(e.target.value)}
                    placeholder="添加备注..."
                    rows={2}
                    maxLength={500}
                    showCount
                    style={{ flex: 1 }}
                  />
                  <Button type="primary" onClick={handleAddRemark} disabled={!newRemark.trim()}>
                    添加
                  </Button>
                </div>
                {remarksLoading ? (
                  <div style={{ textAlign: 'center', padding: 24, color: 'var(--color-text-tertiary)' }}>加载中...</div>
                ) : remarks.length > 0 ? (
                  <Timeline
                    items={remarks.map((r) => {
                      const isSystem = r.authorRole && ['开始编辑', '完成编辑', '取消编辑', '从BOM生成采购', '录入采购'].includes(r.authorRole);
                      const images = r.imageUrls ? (() => {
                        try { return JSON.parse(r.imageUrls); } catch { return []; }
                      })() : [];
                      return {
                        color: isSystem ? 'blue' : 'green',
                        content: (
                          <div key={r.id} style={{ paddingBottom: 4 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                              {isSystem && <HistoryOutlined style={{ color: 'var(--color-primary)' }} />}
                              <strong>{r.authorRole || r.authorName || '系统'}</strong>
                              <span style={{ color: 'var(--color-text-tertiary)', fontSize: 12 }}>
                                {r.authorName && <><UserOutlined /> {r.authorName}</>}
                              </span>
                              <span style={{ color: 'var(--color-text-quaternary)', fontSize: 12 }}>
                                {displayDate(r.createTime, 'datetime')}
                              </span>
                            </div>
                            <div style={{ marginLeft: isSystem ? 20 : 0, color: isSystem ? 'var(--color-text-secondary)' : 'var(--color-text-primary)' }}>
                              {r.content}
                            </div>
                            {images.length > 0 && (
                              <div style={{ marginTop: 4, display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                                <Image.PreviewGroup>
                                  {images.map((url: string, idx: number) => (
                                    <Image key={idx} src={getFullAuthedFileUrl(url)}
                                      style={{ width: 80, height: 80, objectFit: 'cover', borderRadius: 4, cursor: 'pointer' }}
                                      preview={{ cover: '预览' }} />
                                  ))}
                                </Image.PreviewGroup>
                              </div>
                            )}
                          </div>
                        ),
                      };
                    })}
                  />
                ) : (
                  <Empty description="暂无操作记录" image={Empty.PRESENTED_IMAGE_SIMPLE} />
                )}
              </div>
            ),
          },
        ]}
      />
    </Card>
  );
};

export default FlowStepRenderer;
