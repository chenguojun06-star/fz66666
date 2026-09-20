import React from 'react';
import { Card, Statistic } from 'antd';
import { CheckCircleOutlined, ClockCircleOutlined, DollarOutlined, ShopOutlined } from '@ant-design/icons';
import { toNumberOrZero } from './usePayrollData';

export interface StatisticsCardsProps {
    activeTab: string;
    internalOrders: any[];
    rows: any[];
    totalAmount: number;
    /** D-474：当前快捷筛选（待审批/已审批/已付款），null 表示不筛选 */
    activeFilter?: StatusFilter;
    /** D-474：点击统计卡切换筛选，传 null 表示取消筛选 */
    onFilterChange?: (f: StatusFilter) => void;
}

/** 快捷筛选：审批状态 / 付款状态 */
export type StatusFilter = 'pending' | 'approved' | 'paid' | null;

/**
 * D-474：状态判定统一口径（统计卡数字与点击筛选必须用同一套，否则对不上）。
 * 注意：已付款的记录通常没有 auditStatus 字段，早期写法 `!auditStatus` 会把它们
 * 误算成"待审批"（540 条里混着已付款的），所以待审批必须先排除已付款。
 */
export const isPaidRow = (r: any): boolean => r?.paymentStatus === 'paid' || r?.status === 'paid';
export const isApprovedRow = (r: any): boolean => r?.auditStatus === 'approved' || r?.auditStatus === 'audited';
export const isPendingRow = (r: any): boolean =>
  !isPaidRow(r) && (!r?.auditStatus || r?.auditStatus === 'pending');

const cardStyle: React.CSSProperties = {
    borderRadius: 6,
    border: '1px solid var(--color-border-secondary)',
    background: 'var(--color-fill-tertiary)',
};

const bodyStyle = { padding: '5px 10px' as const };

/**
 * 顶部统计卡片：根据 activeTab 切换两套指标
 * - internalOrders：订单数 / 生产中 / 已完成 / 合计金额
 * - 其他 tab：待审批 / 已审批 / 已付款 / 合计金额
 *
 * D-474：每张卡都可点击 —— 点了就按该状态筛选下方列表，再点一次取消，
 * 省得财务自己去筛选框里找状态（原来点了没反应）。
 */
const StatisticsCards: React.FC<StatisticsCardsProps> = ({
    activeTab,
    internalOrders,
    rows,
    totalAmount,
    activeFilter = null,
    onFilterChange,
}) => {
    /** 可点击卡片的公共属性：选中高亮 + 点击切换 */
    const clickable = (key: StatusFilter) => {
        if (!onFilterChange) return {};
        const active = activeFilter === key;
        return {
            onClick: () => onFilterChange(active ? null : key),
            style: {
                ...cardStyle,
                cursor: 'pointer',
                borderColor: active ? 'var(--color-primary)' : 'var(--color-border-secondary)',
                boxShadow: active ? '0 0 0 2px rgba(22,119,255,0.12)' : 'none',
            } as React.CSSProperties,
            hoverable: true,
        };
    };

    if (activeTab === 'internalOrders') {
        return (
            <>
                <Card size="small" style={cardStyle} styles={{ body: bodyStyle }}>
                    <Statistic title={<span className="u-fs-12" style={{ color: 'var(--color-text-tertiary)' }}><ShopOutlined style={{ marginRight: 4, fontSize: 12 }} />订单数</span>} value={internalOrders.length} suffix="条" valueStyle={{ color: 'var(--color-primary)', fontSize: 15, fontWeight: 600 }} />
                </Card>
                <Card size="small" style={cardStyle} styles={{ body: bodyStyle }}>
                    <Statistic title={<span className="u-fs-12" style={{ color: 'var(--color-text-tertiary)' }}><ClockCircleOutlined style={{ marginRight: 4, fontSize: 12 }} />生产中</span>} value={internalOrders.filter((r: any) => r.status === 'production' || r.status === 'IN_PRODUCTION' || r.status === 'in_production').length} suffix="条" valueStyle={{ color: 'var(--color-warning)', fontSize: 15, fontWeight: 600 }} />
                </Card>
                <Card size="small" style={cardStyle} styles={{ body: bodyStyle }}>
                    <Statistic title={<span className="u-fs-12" style={{ color: 'var(--color-text-tertiary)' }}><CheckCircleOutlined style={{ marginRight: 4, fontSize: 12 }} />已完成</span>} value={internalOrders.filter((r: any) => r.status === 'completed' || r.status === 'COMPLETED' || r.status === 'closed' || r.status === 'CLOSED').length} suffix="条" valueStyle={{ color: 'var(--color-success)', fontSize: 15, fontWeight: 600 }} />
                </Card>
                <Card size="small" style={cardStyle} styles={{ body: bodyStyle }}>
                    <Statistic title={<span className="u-fs-12 u-fw-500" style={{ color: 'var(--color-text-secondary)' }}><DollarOutlined style={{ marginRight: 4, fontSize: 12 }} />合计金额</span>} value={internalOrders.reduce((s: number, r: any) => s + toNumberOrZero(r.totalAmount), 0)} prefix="¥" precision={2} valueStyle={{ color: 'var(--color-primary)', fontSize: 17, fontWeight: 700 }} />
                </Card>
            </>
        );
    }
    return (
        <>
            <Card size="small" {...clickable('pending')} styles={{ body: bodyStyle }}>
                <Statistic title={<span className="u-fs-12" style={{ color: 'var(--color-text-tertiary)' }}><ClockCircleOutlined style={{ marginRight: 4, fontSize: 12 }} />待审批</span>} value={rows.filter(isPendingRow).length} suffix="条" valueStyle={{ color: 'var(--color-warning)', fontSize: 15, fontWeight: 600 }} />
            </Card>
            <Card size="small" {...clickable('approved')} styles={{ body: bodyStyle }}>
                <Statistic title={<span className="u-fs-12" style={{ color: 'var(--color-text-tertiary)' }}><CheckCircleOutlined style={{ marginRight: 4, fontSize: 12 }} />已审批</span>} value={rows.filter(isApprovedRow).length} suffix="条" valueStyle={{ color: 'var(--color-primary)', fontSize: 15, fontWeight: 600 }} />
            </Card>
            <Card size="small" {...clickable('paid')} styles={{ body: bodyStyle }}>
                <Statistic title={<span className="u-fs-12" style={{ color: 'var(--color-text-tertiary)' }}><DollarOutlined style={{ marginRight: 4, fontSize: 12 }} />已付款</span>} value={rows.filter(isPaidRow).length} suffix="条" valueStyle={{ color: 'var(--color-success)', fontSize: 15, fontWeight: 600 }} />
            </Card>
            <Card size="small" style={cardStyle} styles={{ body: bodyStyle }}>
                <Statistic title={<span className="u-fs-12 u-fw-500" style={{ color: 'var(--color-text-secondary)' }}><DollarOutlined style={{ marginRight: 4, fontSize: 12 }} />合计金额</span>} value={totalAmount} prefix="¥" precision={2} valueStyle={{ color: 'var(--color-primary)', fontSize: 17, fontWeight: 700 }} />
            </Card>
        </>
    );
};

/** D-474：按快捷筛选过滤行（与统计卡口径保持一致） */
export const filterRowsByStatus = (rows: any[], f: StatusFilter): any[] => {
    if (!f) return rows;
    if (f === 'pending') return rows.filter(isPendingRow);
    if (f === 'approved') return rows.filter(isApprovedRow);
    return rows.filter(isPaidRow);
};

export default StatisticsCards;
