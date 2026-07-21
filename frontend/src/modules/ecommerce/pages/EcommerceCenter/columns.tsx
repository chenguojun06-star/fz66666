import React from 'react';
import { Tag, Tooltip } from 'antd';
import RowActions from '@/components/common/RowActions';
import type { ColumnsType } from 'antd/es/table';
import type { UniversalStock, StockAlert, PurchaseSuggestion, WarehouseAllocation, MergeGroup, GiftRule, LogisticsAnomaly, PlatformBill } from './useEcStock';
import {
  UrgencyColorMap,
  ANOMALY_TYPE_MAP,
  BILL_DIFF_TYPE_MAP,
  getConfidenceColor,
  getSeverityColor,
} from './helpers';

/** 列定义所需的上下文（来自 useSmartStockData） */
export interface ColumnContext {
  handleResolve: (id: number) => Promise<void>;
  generateSuggestions: () => void;
  handleApprove: (id: number) => Promise<void>;
  handleReject: (id: number) => Promise<void>;
  setSafeStockRecord: React.Dispatch<React.SetStateAction<UniversalStock | null>>;
  setSplitVisible: React.Dispatch<React.SetStateAction<boolean>>;
  setMergeGroup: React.Dispatch<React.SetStateAction<MergeGroup | null>>;
  setMergeModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setGiftRuleRecord: React.Dispatch<React.SetStateAction<GiftRule | null>>;
  setGiftRuleModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
  handleDeleteGiftRule: (id: number) => Promise<void>;
  handleHandleAnomaly: (id: number) => void;
  handleIgnoreAnomaly: (id: number) => Promise<void>;
  handleHandleBill: (id: number, status: number) => Promise<void>;
}

export function buildAlertCols(ctx: ColumnContext): ColumnsType<StockAlert> {
  return [
    { title: 'SKU编码', dataIndex: 'skuCode', width: 130 },
    { title: '预警类型', dataIndex: 'alertType', width: 100, render: (v: string) => <Tag color="red">{v}</Tag> },
    { title: '当前库存', dataIndex: 'currentStock', width: 90 },
    { title: '安全库存', dataIndex: 'safeStock', width: 90 },
    { title: '消息', dataIndex: 'message', ellipsis: true },
    { title: '操作', width: 180, render: (_: unknown, r: StockAlert) => (
      <RowActions actions={[
        { key: 'resolve', label: '处理预警', primary: true, onClick: () => ctx.handleResolve(r.id) },
        { key: 'purchase', label: '生成采购', onClick: () => ctx.generateSuggestions() },
      ]} />
    )},
  ];
}

export function buildSuggestionCols(ctx: ColumnContext): ColumnsType<PurchaseSuggestion> {
  return [
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
        { key: 'approve', label: '确认', primary: true, onClick: () => ctx.handleApprove(r.id) },
        { key: 'reject', label: '拒绝', danger: true, onClick: () => ctx.handleReject(r.id) },
      ]} />
    )},
  ];
}

export function buildStockCols(ctx: ColumnContext): ColumnsType<UniversalStock> {
  return [
    { title: 'SKU编码', dataIndex: 'skuId', width: 100 },
    { title: '仓库', dataIndex: 'warehouse', width: 100 },
    { title: '总入库', dataIndex: 'totalWarehoused', width: 80 },
    { title: '总出库', dataIndex: 'totalOutstock', width: 80 },
    { title: '待发货', dataIndex: 'pendingOrders', width: 80 },
    { title: '可售库存', dataIndex: 'availableStock', width: 90 },
    { title: '安全库存', dataIndex: 'safeStock', width: 90 },
    { title: '在途生产', dataIndex: 'onWayProduction', width: 90 },
    { title: '操作', width: 120, render: (_: unknown, r: UniversalStock) => (
      <RowActions actions={[{ key: 'safeStock', label: '设置安全库存', onClick: () => ctx.setSafeStockRecord(r) }]} />
    )},
  ];
}

export function buildAllocCols(ctx: ColumnContext): ColumnsType<WarehouseAllocation> {
  return [
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
      <RowActions actions={[{ key: 'detail', label: '查看详情', onClick: () => ctx.setSplitVisible(true) }]} />
    )},
  ];
}

export function buildMergeCols(ctx: ColumnContext): ColumnsType<MergeGroup> {
  return [
    { title: '收货人', dataIndex: 'receiverName', width: 100 },
    { title: '电话', dataIndex: 'receiverPhone', width: 130 },
    { title: '平台', dataIndex: 'platform', width: 100 },
    { title: '订单数', dataIndex: 'orderCount', width: 80 },
    { title: '总件数', dataIndex: 'totalQuantity', width: 80 },
    { title: '操作', width: 120, render: (_: unknown, r: MergeGroup) => (
      <RowActions actions={[{ key: 'merge', label: '合单发货', primary: true, onClick: () => { ctx.setMergeGroup(r); ctx.setMergeModalOpen(true); } }]} />
    )},
  ];
}

export function buildGiftRuleCols(ctx: ColumnContext): ColumnsType<GiftRule> {
  return [
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
        { key: 'edit', label: '编辑', onClick: () => { ctx.setGiftRuleRecord(r); ctx.setGiftRuleModalOpen(true); } },
        { key: 'delete', label: '删除', danger: true, onClick: () => ctx.handleDeleteGiftRule(r.id!) },
      ]} />
    )},
  ];
}

export function buildAnomalyCols(ctx: ColumnContext): ColumnsType<LogisticsAnomaly> {
  return [
    { title: '订单号', dataIndex: 'orderNo', width: 140 },
    { title: '快递单号', dataIndex: 'trackingNo', width: 140 },
    { title: '快递公司', dataIndex: 'expressCompany', width: 90 },
    {
      title: '异常类型', dataIndex: 'anomalyType', width: 110,
      render: (v: string) => {
        const m = ANOMALY_TYPE_MAP[v] ?? { color: 'default', label: v };
        return <Tag color={m.color}>{m.label}</Tag>;
      },
    },
    {
      title: '严重度', dataIndex: 'severity', width: 80,
      render: (v: string) => <Tag color={getSeverityColor(v)}>{v}</Tag>,
    },
    { title: '停滞天数', dataIndex: 'daysSinceUpdate', width: 80, render: (v?: number) => v ?? '-' },
    {
      title: '最后轨迹', dataIndex: 'lastTrackDesc', width: 200, ellipsis: true,
      render: (v?: string | null) => (
        <Tooltip title={v || '-'}><span>{v || '-'}</span></Tooltip>
      ),
    },
    {
      title: 'AI 建议', dataIndex: 'aiAdvice', width: 260, ellipsis: true,
      render: (v?: string | null, r?: LogisticsAnomaly) => {
        const text = v || '-';
        const conf = r?.aiConfidence;
        const color = getConfidenceColor(conf);
        return (
          <Tooltip title={text}>
            <span style={{ color }}>
              {conf != null && <span style={{ marginRight: 4 }}>[{conf}%]</span>}
              {text}
            </span>
          </Tooltip>
        );
      },
    },
    { title: '操作', width: 150, render: (_: unknown, r: LogisticsAnomaly) => (
      <RowActions actions={[
        { key: 'handle', label: '处理', primary: true, onClick: () => ctx.handleHandleAnomaly(r.id) },
        { key: 'ignore', label: '忽略', onClick: () => ctx.handleIgnoreAnomaly(r.id) },
      ]} />
    )},
  ];
}

export function buildBillCols(ctx: ColumnContext): ColumnsType<PlatformBill> {
  return [
    { title: '平台', dataIndex: 'platform', width: 100 },
    { title: '账期', dataIndex: 'billPeriod', width: 100 },
    { title: '平台订单号', dataIndex: 'platformOrderNo', width: 160 },
    {
      title: '差异类型', dataIndex: 'diffType', width: 120,
      render: (v: string) => {
        const m = BILL_DIFF_TYPE_MAP[v] ?? { color: 'default', label: v };
        return <Tag color={m.color}>{m.label}</Tag>;
      },
    },
    {
      title: '平台金额', dataIndex: 'platformAmount', width: 100, align: 'right' as const,
      render: (v: number) => `¥${v.toFixed(2)}`,
    },
    {
      title: '本地金额', dataIndex: 'localAmount', width: 100, align: 'right' as const,
      render: (v: number) => `¥${v.toFixed(2)}`,
    },
    {
      title: '差异金额', dataIndex: 'diffAmount', width: 100, align: 'right' as const,
      render: (v: number) => {
        const color = Math.abs(v) < 0.01 ? 'var(--color-success)' : v > 0 ? 'var(--color-error)' : 'var(--color-warning)';
        return <span style={{ color, fontWeight: 500 }}>{v > 0 ? '+' : ''}{v.toFixed(2)}</span>;
      },
    },
    {
      title: 'AI 分析', dataIndex: 'aiAnalysis', width: 260, ellipsis: true,
      render: (v?: string | null, r?: PlatformBill) => {
        const text = v || '-';
        const conf = r?.aiConfidence;
        const color = getConfidenceColor(conf);
        return (
          <Tooltip title={text}>
            <span style={{ color }}>
              {conf != null && <span style={{ marginRight: 4 }}>[{conf}%]</span>}
              {text}
            </span>
          </Tooltip>
        );
      },
    },
    { title: '操作', width: 180, render: (_: unknown, r: PlatformBill) => (
      <RowActions actions={[
        { key: 'confirm', label: '确认', primary: true, onClick: () => ctx.handleHandleBill(r.id, 1) },
        { key: 'appeal', label: '申诉', onClick: () => ctx.handleHandleBill(r.id, 2) },
        { key: 'ignore', label: '忽略', onClick: () => ctx.handleHandleBill(r.id, 3) },
      ]} />
    )},
  ];
}

export interface AllColumns {
  alertCols: ColumnsType<StockAlert>;
  suggestionCols: ColumnsType<PurchaseSuggestion>;
  stockCols: ColumnsType<UniversalStock>;
  allocCols: ColumnsType<WarehouseAllocation>;
  mergeCols: ColumnsType<MergeGroup>;
  giftRuleCols: ColumnsType<GiftRule>;
  anomalyCols: ColumnsType<LogisticsAnomaly>;
  billCols: ColumnsType<PlatformBill>;
}

/** 一次性构建所有列定义 */
export function buildAllColumns(ctx: ColumnContext): AllColumns {
  return {
    alertCols: buildAlertCols(ctx),
    suggestionCols: buildSuggestionCols(ctx),
    stockCols: buildStockCols(ctx),
    allocCols: buildAllocCols(ctx),
    mergeCols: buildMergeCols(ctx),
    giftRuleCols: buildGiftRuleCols(ctx),
    anomalyCols: buildAnomalyCols(ctx),
    billCols: buildBillCols(ctx),
  };
}
