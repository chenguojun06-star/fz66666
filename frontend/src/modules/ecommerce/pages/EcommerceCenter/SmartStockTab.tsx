import React, { useState, useEffect, useCallback } from 'react';
import { Button, Space, Tabs, Tag, Tooltip, Form, InputNumber, App } from 'antd';
import { WarningOutlined, ShoppingCartOutlined, InboxOutlined, SwapOutlined, ThunderboltOutlined, RobotOutlined } from '@ant-design/icons';
import ResizableTable from '@/components/common/ResizableTable';
import ResizableModal from '@/components/common/ResizableModal';
import RowActions from '@/components/common/RowActions';
import { useEcStock } from './useEcStock';
import type { ColumnsType } from 'antd/es/table';
import type { UniversalStock, StockAlert, PurchaseSuggestion, WarehouseAllocation } from './useEcStock';

const UrgencyColorMap: Record<string, string> = {
  urgent: 'red', high: 'orange', medium: 'blue', low: 'default',
};

const SafeStockModal: React.FC<{ open: boolean; record: UniversalStock | null; onClose: () => void; onOk: (skuId: number, val: number) => void }> = ({ open, record, onClose, onOk }) => {
  const [form] = Form.useForm<{ safeStock: number }>();
  const [submitting, setSubmitting] = useState(false);
  const handleOk = useCallback(async () => {
    const val = await form.validateFields();
    if (!record) return;
    setSubmitting(true);
    try { await onOk(record.skuId, val.safeStock); onClose(); }
    finally { setSubmitting(false); }
  }, [form, record, onOk, onClose]);
  return (
    <ResizableModal title="设置安全库存" open={open} onCancel={onClose} onOk={handleOk} confirmLoading={submitting} width="30vw">
      <Form form={form} layout="vertical" initialValues={{ safeStock: record?.safeStock ?? 0 }}>
        <Form.Item label="安全库存" name="safeStock" rules={[{ required: true, message: '请输入安全库存' }]}>
          <InputNumber min={0} precision={0} style={{ width: '100%' }} />
        </Form.Item>
      </Form>
    </ResizableModal>
  );
};

const SplitDetailModal: React.FC<{ open: boolean; splits: { orderNo: string; skuCode: string; warehouse: string; qty: number; reason: string }[]; onClose: () => void }> = ({ open, splits, onClose }) => (
  <ResizableModal title="拆单记录" open={open} onCancel={onClose} footer={null} width="40vw">
    <ResizableTable<NonNullable<typeof splits>[0]> dataSource={splits} rowKey="orderNo" size="small" pagination={false}
      columns={[
        { title: '拆单号', dataIndex: 'orderNo' },
        { title: 'SKU编码', dataIndex: 'skuCode' },
        { title: '仓库', dataIndex: 'warehouse' },
        { title: '数量', dataIndex: 'qty' },
        { title: '原因', dataIndex: 'reason' },
      ]}
    />
  </ResizableModal>
);

const SmartStockTab: React.FC = () => {
  const { message } = App.useApp();
  const st = useEcStock();
  const [safeStockRecord, setSafeStockRecord] = useState<UniversalStock | null>(null);
  const [splitVisible, setSplitVisible] = useState(false);

  useEffect(() => { st.fetchAlerts(); st.fetchSuggestions(); st.fetchStock(); st.fetchAllocations(); }, [st]);

  const handleResolve = useCallback(async (id: number) => {
    await st.resolveAlert(id); message.success('已处理');
  }, [st, message]);

  const handleApprove = useCallback(async (id: number) => {
    const res = await st.approveSuggestion(id);
    message.success(res?.message || '已审批');
  }, [st, message]);

  const handleReject = useCallback(async (id: number) => {
    await st.rejectSuggestion(id); message.info('已拒绝');
  }, [st, message]);

  const [aiScanning, setAiScanning] = useState(false);
  const handleAiScan = useCallback(async () => {
    setAiScanning(true);
    try {
      const created = await st.aiScanSuggestions();
      if (created > 0) {
        message.success(`AI 补货顾问已生成 ${created} 条建议`);
      } else {
        message.info('暂无新的缺货预警需要处理');
      }
    } catch {
      message.error('AI 扫描失败，请稍后重试');
    } finally {
      setAiScanning(false);
    }
  }, [st, message]);

  const handleSafeStock = useCallback(async (skuId: number, val: number) => {
    await st.updateSafeStock(skuId, val); message.success('已更新');
  }, [st, message]);

  const alertCols: ColumnsType<StockAlert> = [
    { title: 'SKU编码', dataIndex: 'skuCode', width: 130 },
    { title: '预警类型', dataIndex: 'alertType', width: 100, render: (v: string) => <Tag color="red">{v}</Tag> },
    { title: '当前库存', dataIndex: 'currentStock', width: 90 },
    { title: '安全库存', dataIndex: 'safeStock', width: 90 },
    { title: '消息', dataIndex: 'message', ellipsis: true },
    { title: '操作', width: 180, render: (_: unknown, r: StockAlert) => (
      <RowActions actions={[
        { key: 'resolve', label: '处理预警', primary: true, onClick: () => handleResolve(r.id) },
        { key: 'purchase', label: '生成采购', onClick: () => st.generateSuggestions() },
      ]} />
    )},
  ];

  const suggestionCols: ColumnsType<PurchaseSuggestion> = [
    { title: 'SKU编码', dataIndex: 'skuCode', width: 130 },
    {
      title: '建议类型', dataIndex: 'suggestionType', width: 100,
      render: (v?: string) => {
        if (v === 'PRODUCTION') return <Tag color="processing">转生产</Tag>;
        if (v === 'PURCHASE') return <Tag color="warning">转采购</Tag>;
        return <Tag>采购</Tag>;
      },
    },
    { title: '建议数量', dataIndex: 'suggestQuantity', width: 90 },
    {
      title: 'AI 置信度', dataIndex: 'aiConfidence', width: 110,
      render: (v?: number | null) => {
        if (v == null) return <Tag>规则</Tag>;
        const color = v >= 70 ? 'success' : v >= 50 ? 'warning' : 'error';
        const label = v >= 70 ? `${v}%` : v >= 50 ? `${v}% 需确认` : `${v}% 低置信`;
        return <Tooltip title={v >= 70 ? 'AI 高置信度，可放心确认' : 'AI 置信度偏低，请仔细核对'}><Tag color={color}>{label}</Tag></Tooltip>;
      },
    },
    { title: '紧急程度', dataIndex: 'urgencyLevel', width: 90, render: (v: string) => <Tag color={UrgencyColorMap[v] ?? 'default'}>{v}</Tag> },
    {
      title: 'AI 推理依据', dataIndex: 'aiReason', width: 220, ellipsis: true,
      render: (v?: string | null, r?: PurchaseSuggestion) => (
        <Tooltip title={v || r?.reason || '-'}>
          <span style={{ color: v ? 'var(--color-text-primary)' : 'var(--color-text-quaternary)' }}>
            {v || r?.reason || '-'}
          </span>
        </Tooltip>
      ),
    },
    { title: '操作', width: 150, render: (_: unknown, r: PurchaseSuggestion) => (
      <RowActions actions={[
        { key: 'approve', label: '确认', primary: true, onClick: () => handleApprove(r.id) },
        { key: 'reject', label: '拒绝', danger: true, onClick: () => handleReject(r.id) },
      ]} />
    )},
  ];

  const stockCols: ColumnsType<UniversalStock> = [
    { title: 'SKU编码', dataIndex: 'skuId', width: 100 },
    { title: '仓库', dataIndex: 'warehouse', width: 100 },
    { title: '总入库', dataIndex: 'totalWarehoused', width: 80 },
    { title: '总出库', dataIndex: 'totalOutstock', width: 80 },
    { title: '待发货', dataIndex: 'pendingOrders', width: 80 },
    { title: '可售库存', dataIndex: 'availableStock', width: 90 },
    { title: '安全库存', dataIndex: 'safeStock', width: 90 },
    { title: '在途生产', dataIndex: 'onWayProduction', width: 90 },
    { title: '操作', width: 120, render: (_: unknown, r: UniversalStock) => (
      <RowActions actions={[{ key: 'safeStock', label: '设置安全库存', onClick: () => setSafeStockRecord(r) }]} />
    )},
  ];

  const allocCols: ColumnsType<WarehouseAllocation> = [
    { title: '订单号', dataIndex: 'orderNo', width: 140 },
    { title: 'SKU编码', dataIndex: 'skuCode', width: 130 },
    { title: '仓库', dataIndex: 'warehouse', width: 100 },
    { title: '分配数量', dataIndex: 'allocatedQuantity', width: 90 },
    { title: '分配类型', dataIndex: 'allocationType', width: 100 },
    { title: '操作', width: 100, render: () => (
      <RowActions actions={[{ key: 'detail', label: '查看详情', onClick: () => setSplitVisible(true) }]} />
    )},
  ];

  const tabItems = [
    { key: 'alerts', label: <span><WarningOutlined /> 预警列表</span>, children: <ResizableTable<StockAlert> dataSource={st.alerts} columns={alertCols} rowKey="id" size="small" loading={st.loading} /> },
    {
      key: 'suggestions',
      label: <span><ShoppingCartOutlined /> 补货建议</span>,
      children: (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <span style={{ color: 'var(--color-text-secondary)', fontSize: 13 }}>
              <RobotOutlined style={{ marginRight: 4, color: 'var(--color-primary)' }} />
              AI 补货顾问根据租户类型与款式 BOM 自动判断走采购还是生产，置信度低于 70% 时请仔细核对
            </span>
            <Space>
              <Button icon={<ThunderboltOutlined />} loading={aiScanning} onClick={handleAiScan}>AI 扫描生成建议</Button>
            </Space>
          </div>
          <ResizableTable<PurchaseSuggestion> dataSource={st.suggestions} columns={suggestionCols} rowKey="id" size="small" loading={st.loading} />
        </div>
      ),
    },
    { key: 'stock', label: <span><InboxOutlined /> 库存明细</span>, children: <ResizableTable<UniversalStock> dataSource={st.stockList} columns={stockCols} rowKey="id" size="small" loading={st.loading} /> },
    { key: 'allocations', label: <span><SwapOutlined /> 分配记录</span>, children: <ResizableTable<WarehouseAllocation> dataSource={st.allocations} columns={allocCols} rowKey="id" size="small" loading={st.loading} /> },
  ];

  return (
    <>
      <Tabs items={tabItems} />
      <SafeStockModal open={!!safeStockRecord} record={safeStockRecord} onClose={() => setSafeStockRecord(null)} onOk={handleSafeStock} />
      <SplitDetailModal open={splitVisible} splits={[]} onClose={() => setSplitVisible(false)} />
    </>
  );
};

export default SmartStockTab;
