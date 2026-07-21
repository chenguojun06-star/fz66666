import React from 'react';
import { Card, Statistic } from 'antd';
import { CheckCircleOutlined, ClockCircleOutlined, DollarOutlined, ShopOutlined } from '@ant-design/icons';
import { toNumberOrZero } from './usePayrollData';

export interface StatisticsCardsProps {
    activeTab: string;
    internalOrders: any[];
    rows: any[];
    totalAmount: number;
}

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
 */
const StatisticsCards: React.FC<StatisticsCardsProps> = ({ activeTab, internalOrders, rows, totalAmount }) => {
    if (activeTab === 'internalOrders') {
        return (
            <>
                <Card size="small" style={cardStyle} styles={{ body: bodyStyle }}>
                    <Statistic title={<span style={{ color: 'var(--color-text-tertiary)', fontSize: 12 }}><ShopOutlined style={{ marginRight: 4, fontSize: 12 }} />订单数</span>} value={internalOrders.length} suffix="条" valueStyle={{ color: 'var(--color-primary)', fontSize: 15, fontWeight: 600 }} />
                </Card>
                <Card size="small" style={cardStyle} styles={{ body: bodyStyle }}>
                    <Statistic title={<span style={{ color: 'var(--color-text-tertiary)', fontSize: 12 }}><ClockCircleOutlined style={{ marginRight: 4, fontSize: 12 }} />生产中</span>} value={internalOrders.filter((r: any) => r.status === 'production' || r.status === 'IN_PRODUCTION' || r.status === 'in_production').length} suffix="条" valueStyle={{ color: 'var(--color-warning)', fontSize: 15, fontWeight: 600 }} />
                </Card>
                <Card size="small" style={cardStyle} styles={{ body: bodyStyle }}>
                    <Statistic title={<span style={{ color: 'var(--color-text-tertiary)', fontSize: 12 }}><CheckCircleOutlined style={{ marginRight: 4, fontSize: 12 }} />已完成</span>} value={internalOrders.filter((r: any) => r.status === 'completed' || r.status === 'COMPLETED' || r.status === 'closed' || r.status === 'CLOSED').length} suffix="条" valueStyle={{ color: 'var(--color-success)', fontSize: 15, fontWeight: 600 }} />
                </Card>
                <Card size="small" style={cardStyle} styles={{ body: bodyStyle }}>
                    <Statistic title={<span style={{ color: 'var(--color-text-secondary)', fontSize: 12, fontWeight: 500 }}><DollarOutlined style={{ marginRight: 4, fontSize: 12 }} />合计金额</span>} value={internalOrders.reduce((s: number, r: any) => s + toNumberOrZero(r.totalAmount), 0)} prefix="¥" precision={2} valueStyle={{ color: 'var(--color-primary)', fontSize: 17, fontWeight: 700 }} />
                </Card>
            </>
        );
    }
    return (
        <>
            <Card size="small" style={cardStyle} styles={{ body: bodyStyle }}>
                <Statistic title={<span style={{ color: 'var(--color-text-tertiary)', fontSize: 12 }}><ClockCircleOutlined style={{ marginRight: 4, fontSize: 12 }} />待审批</span>} value={rows.filter((r: any) => !r.auditStatus || r.auditStatus === 'pending').length} suffix="条" valueStyle={{ color: 'var(--color-warning)', fontSize: 15, fontWeight: 600 }} />
            </Card>
            <Card size="small" style={cardStyle} styles={{ body: bodyStyle }}>
                <Statistic title={<span style={{ color: 'var(--color-text-tertiary)', fontSize: 12 }}><CheckCircleOutlined style={{ marginRight: 4, fontSize: 12 }} />已审批</span>} value={rows.filter((r: any) => r.auditStatus === 'approved' || r.auditStatus === 'audited').length} suffix="条" valueStyle={{ color: 'var(--color-primary)', fontSize: 15, fontWeight: 600 }} />
            </Card>
            <Card size="small" style={cardStyle} styles={{ body: bodyStyle }}>
                <Statistic title={<span style={{ color: 'var(--color-text-tertiary)', fontSize: 12 }}><DollarOutlined style={{ marginRight: 4, fontSize: 12 }} />已付款</span>} value={rows.filter((r: any) => r.paymentStatus === 'paid' || r.status === 'paid').length} suffix="条" valueStyle={{ color: 'var(--color-success)', fontSize: 15, fontWeight: 600 }} />
            </Card>
            <Card size="small" style={cardStyle} styles={{ body: bodyStyle }}>
                <Statistic title={<span style={{ color: 'var(--color-text-secondary)', fontSize: 12, fontWeight: 500 }}><DollarOutlined style={{ marginRight: 4, fontSize: 12 }} />合计金额</span>} value={totalAmount} prefix="¥" precision={2} valueStyle={{ color: 'var(--color-primary)', fontSize: 17, fontWeight: 700 }} />
            </Card>
        </>
    );
};

export default StatisticsCards;
