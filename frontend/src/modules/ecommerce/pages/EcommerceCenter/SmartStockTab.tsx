import React, { useState, useEffect, useCallback } from 'react';
import { Button, Space, Tabs, Tag, Tooltip, Form, InputNumber, Input, Select, App } from 'antd';
import { WarningOutlined, ShoppingCartOutlined, InboxOutlined, SwapOutlined, ThunderboltOutlined, RobotOutlined, MergeCellsOutlined, GiftOutlined, PlusOutlined, DeleteOutlined } from '@ant-design/icons';
import ResizableTable from '@/components/common/ResizableTable';
import ResizableModal from '@/components/common/ResizableModal';
import RowActions from '@/components/common/RowActions';
import { useEcStock } from './useEcStock';
import type { ColumnsType } from 'antd/es/table';
import type { UniversalStock, StockAlert, PurchaseSuggestion, WarehouseAllocation, MergeGroup, GiftRule } from './useEcStock';

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

/** 合单发货弹窗 */
const MergeOutboundModal: React.FC<{
  open: boolean;
  group: MergeGroup | null;
  onClose: () => void;
  onOk: (orderIds: number[], trackingNo: string, expressCompany: string) => Promise<void>;
}> = ({ open, group, onClose, onOk }) => {
  const [form] = Form.useForm<{ trackingNo: string; expressCompany: string }>();
  const [submitting, setSubmitting] = useState(false);
  const handleOk = useCallback(async () => {
    const val = await form.validateFields();
    if (!group) return;
    setSubmitting(true);
    try {
      await onOk(group.orders.map(o => o.orderId), val.trackingNo, val.expressCompany);
      onClose();
    } finally { setSubmitting(false); }
  }, [form, group, onOk, onClose]);
  return (
    <ResizableModal title="合单发货" open={open} onCancel={onClose} onOk={handleOk} confirmLoading={submitting} width="40vw">
      {group && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ color: 'var(--color-text-secondary)', fontSize: 13, marginBottom: 8 }}>
            收货人：{group.receiverName} | {group.receiverPhone} | 平台：{group.platform}
          </div>
          <div style={{ color: 'var(--color-text-secondary)', fontSize: 13, marginBottom: 8 }}>
            共 {group.orderCount} 笔订单，{group.totalQuantity} 件商品
          </div>
        </div>
      )}
      <Form form={form} layout="vertical">
        <Form.Item label="快递单号" name="trackingNo" rules={[{ required: true, message: '请输入快递单号' }]}>
          <Input placeholder="请输入快递单号" />
        </Form.Item>
        <Form.Item label="快递公司" name="expressCompany" rules={[{ required: true, message: '请选择快递公司' }]}>
          <Select placeholder="请选择快递公司" options={[
            { label: '顺丰', value: 'SF' },
            { label: '中通', value: 'ZTO' },
            { label: '圆通', value: 'YTO' },
            { label: '韵达', value: 'YD' },
            { label: '申通', value: 'STO' },
            { label: '极兔', value: 'JT' },
            { label: '邮政', value: 'EMS' },
            { label: '京东', value: 'JD' },
          ]} />
        </Form.Item>
      </Form>
    </ResizableModal>
  );
};

/** 赠品规则编辑弹窗 */
const GiftRuleModal: React.FC<{
  open: boolean;
  record: GiftRule | null;
  onClose: () => void;
  onOk: (rule: GiftRule) => Promise<void>;
}> = ({ open, record, onClose, onOk }) => {
  const [form] = Form.useForm<GiftRule>();
  const [submitting, setSubmitting] = useState(false);
  useEffect(() => {
    if (open) {
      form.setFieldsValue(record ?? { triggerType: 'AMOUNT', giftQuantity: 1, enabled: 1 });
    }
  }, [open, record, form]);
  const handleOk = useCallback(async () => {
    const val = await form.validateFields();
    setSubmitting(true);
    try {
      await onOk({ ...record, ...val });
      onClose();
    } finally { setSubmitting(false); }
  }, [form, record, onOk, onClose]);
  return (
    <ResizableModal title={record?.id ? '编辑赠品规则' : '新增赠品规则'} open={open} onCancel={onClose} onOk={handleOk} confirmLoading={submitting} width="40vw">
      <Form form={form} layout="vertical">
        <Form.Item label="规则名称" name="ruleName" rules={[{ required: true, message: '请输入规则名称' }]}>
          <Input placeholder="如：满99送袜子" />
        </Form.Item>
        <Form.Item label="赠品SKU编码" name="giftSkuCode" rules={[{ required: true, message: '请输入赠品SKU编码' }]}>
          <Input placeholder="赠品SKU编码" />
        </Form.Item>
        <Form.Item label="赠品数量" name="giftQuantity" rules={[{ required: true, message: '请输入赠品数量' }]}>
          <InputNumber min={1} precision={0} style={{ width: '100%' }} />
        </Form.Item>
        <Form.Item label="触发类型" name="triggerType" rules={[{ required: true }]}>
          <Select options={[
            { label: '按订单金额（≥阈值赠送）', value: 'AMOUNT' },
            { label: '按订单数量（≥阈值赠送）', value: 'QUANTITY' },
            { label: '按平台（指定平台赠送）', value: 'PLATFORM' },
          ]} />
        </Form.Item>
        <Form.Item shouldUpdate noStyle>
          {({ getFieldValue }) => {
            const type = getFieldValue('triggerType');
            if (type === 'AMOUNT' || type === 'QUANTITY') {
              return (
                <Form.Item label={type === 'AMOUNT' ? '触发金额（元）' : '触发数量（件）'} name="triggerValue" rules={[{ required: true, message: '请输入触发阈值' }]}>
                  <InputNumber min={0} precision={type === 'AMOUNT' ? 2 : 0} style={{ width: '100%' }} />
                </Form.Item>
              );
            }
            if (type === 'PLATFORM') {
              return (
                <Form.Item label="触发平台" name="triggerPlatform" rules={[{ required: true, message: '请选择平台' }]}>
                  <Select options={[
                    { label: '淘宝', value: 'TAOBAO' },
                    { label: '天猫', value: 'TMALL' },
                    { label: '京东', value: 'JD' },
                    { label: '抖音', value: 'DOUYIN' },
                    { label: '拼多多', value: 'PINDUODUO' },
                    { label: '小红书', value: 'XIAOHONGSHU' },
                  ]} />
                </Form.Item>
              );
            }
            return null;
          }}
        </Form.Item>
        <Form.Item label="是否启用" name="enabled">
          <Select options={[{ label: '启用', value: 1 }, { label: '禁用', value: 0 }]} />
        </Form.Item>
      </Form>
    </ResizableModal>
  );
};

const SmartStockTab: React.FC = () => {
  const { message } = App.useApp();
  const st = useEcStock();
  const [safeStockRecord, setSafeStockRecord] = useState<UniversalStock | null>(null);
  const [splitVisible, setSplitVisible] = useState(false);
  const [mergeGroup, setMergeGroup] = useState<MergeGroup | null>(null);
  const [mergeModalOpen, setMergeModalOpen] = useState(false);
  const [giftRuleRecord, setGiftRuleRecord] = useState<GiftRule | null>(null);
  const [giftRuleModalOpen, setGiftRuleModalOpen] = useState(false);

  useEffect(() => {
    st.fetchAlerts(); st.fetchSuggestions(); st.fetchStock(); st.fetchAllocations();
    st.fetchMergeCandidates(); st.fetchGiftRules();
  }, [st]);

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

  // Phase 2: 合单发货
  const handleMergeOutbound = useCallback(async (orderIds: number[], trackingNo: string, expressCompany: string) => {
    try {
      const res = await st.mergeOutbound(orderIds, trackingNo, expressCompany);
      if (res?.failedOrderIds.length) {
        message.warning(`合单完成：成功 ${res.successCount} 笔，失败 ${res.failedOrderIds.length} 笔`);
      } else {
        message.success(`合单发货成功，共 ${res?.successCount} 笔订单`);
      }
    } catch {
      message.error('合单发货失败');
    }
  }, [st, message]);

  // Phase 2: 赠品规则保存/删除
  const handleSaveGiftRule = useCallback(async (rule: GiftRule) => {
    await st.saveGiftRule(rule);
    message.success(rule.id ? '规则已更新' : '规则已新增');
  }, [st, message]);

  const handleDeleteGiftRule = useCallback(async (id: number) => {
    await st.deleteGiftRule(id); message.success('已删除');
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
    {
      title: '分配得分', dataIndex: 'score', width: 100,
      render: (v?: number | null) => {
        if (v == null) return <Tag>未评分</Tag>;
        const color = v >= 80 ? 'success' : v >= 60 ? 'warning' : 'error';
        return <Tag color={color}>{v}</Tag>;
      },
    },
    {
      title: '预估时效', dataIndex: 'estimatedDays', width: 90,
      render: (v?: number | null) => v != null ? `${v}天` : '-',
    },
    {
      title: '分配原因', dataIndex: 'reason', width: 220, ellipsis: true,
      render: (v?: string | null) => (
        <Tooltip title={v || '-'}>
          <span style={{ color: v ? 'var(--color-text-primary)' : 'var(--color-text-quaternary)' }}>
            {v || '-'}
          </span>
        </Tooltip>
      ),
    },
    { title: '分配类型', dataIndex: 'allocationType', width: 100 },
    { title: '操作', width: 100, render: () => (
      <RowActions actions={[{ key: 'detail', label: '查看详情', onClick: () => setSplitVisible(true) }]} />
    )},
  ];

  // Phase 2: 合单候选组列
  const mergeCols: ColumnsType<MergeGroup> = [
    { title: '收货人', dataIndex: 'receiverName', width: 100 },
    { title: '电话', dataIndex: 'receiverPhone', width: 130 },
    { title: '平台', dataIndex: 'platform', width: 100 },
    { title: '订单数', dataIndex: 'orderCount', width: 80 },
    { title: '总件数', dataIndex: 'totalQuantity', width: 80 },
    { title: '操作', width: 120, render: (_: unknown, r: MergeGroup) => (
      <RowActions actions={[{ key: 'merge', label: '合单发货', primary: true, onClick: () => { setMergeGroup(r); setMergeModalOpen(true); } }]} />
    )},
  ];

  // Phase 2: 赠品规则列
  const giftRuleCols: ColumnsType<GiftRule> = [
    { title: '规则名称', dataIndex: 'ruleName', width: 140 },
    { title: '赠品SKU', dataIndex: 'giftSkuCode', width: 130 },
    { title: '赠品数量', dataIndex: 'giftQuantity', width: 80 },
    {
      title: '触发类型', dataIndex: 'triggerType', width: 120,
      render: (v: string, r?: GiftRule) => {
        const label = v === 'AMOUNT' ? `满${r?.triggerValue}元` : v === 'QUANTITY' ? `满${r?.triggerValue}件` : v === 'PLATFORM' ? r?.triggerPlatform : v;
        return <Tag color="blue">{label}</Tag>;
      },
    },
    {
      title: '状态', dataIndex: 'enabled', width: 80,
      render: (v: number) => <Tag color={v === 1 ? 'success' : 'default'}>{v === 1 ? '启用' : '禁用'}</Tag>,
    },
    { title: '操作', width: 150, render: (_: unknown, r: GiftRule) => (
      <RowActions actions={[
        { key: 'edit', label: '编辑', onClick: () => { setGiftRuleRecord(r); setGiftRuleModalOpen(true); } },
        { key: 'delete', label: '删除', danger: true, onClick: () => handleDeleteGiftRule(r.id!) },
      ]} />
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
    {
      key: 'merge',
      label: <span><MergeCellsOutlined /> 合单管理</span>,
      children: (
        <div>
          <div style={{ color: 'var(--color-text-secondary)', fontSize: 13, marginBottom: 12 }}>
            系统自动扫描同收货人+同平台的多笔待发货订单，合并成一个包裹发货可节省运费
          </div>
          <ResizableTable<MergeGroup> dataSource={st.mergeGroups} columns={mergeCols} rowKey={(r) => `${r.receiverPhone}_${r.platform}`} size="small" loading={st.loading} />
        </div>
      ),
    },
    {
      key: 'gift',
      label: <span><GiftOutlined /> 赠品规则</span>,
      children: (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <span style={{ color: 'var(--color-text-secondary)', fontSize: 13 }}>
              按订单金额/数量/平台自动匹配赠品规则
            </span>
            <Button icon={<PlusOutlined />} type="primary" onClick={() => { setGiftRuleRecord(null); setGiftRuleModalOpen(true); }}>新增规则</Button>
          </div>
          <ResizableTable<GiftRule> dataSource={st.giftRules} columns={giftRuleCols} rowKey="id" size="small" loading={st.loading} />
        </div>
      ),
    },
  ];

  return (
    <>
      <Tabs items={tabItems} />
      <SafeStockModal open={!!safeStockRecord} record={safeStockRecord} onClose={() => setSafeStockRecord(null)} onOk={handleSafeStock} />
      <SplitDetailModal open={splitVisible} splits={[]} onClose={() => setSplitVisible(false)} />
      <MergeOutboundModal open={mergeModalOpen} group={mergeGroup} onClose={() => setMergeModalOpen(false)} onOk={handleMergeOutbound} />
      <GiftRuleModal open={giftRuleModalOpen} record={giftRuleRecord} onClose={() => setGiftRuleModalOpen(false)} onOk={handleSaveGiftRule} />
    </>
  );
};

export default SmartStockTab;
