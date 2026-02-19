import React from 'react';
import { Tag, Space } from 'antd';

interface BatchSummaryProps {
    summary: {
        totalQty: number;
        nonBlockedQty: number;
        blockedCount: number;
        blockedQty: number;
        blockedRemainingSum: number;
        blockedMissing: number;
        repairPoolSum: number;
        repairedOutSum: number;
        statsMissing: number;
    };
    hasBlocked: boolean;
    selectedCount: number;
}

const BatchSummary: React.FC<BatchSummaryProps> = ({ summary, hasBlocked, selectedCount }) => {
    if (selectedCount === 0) return null;

    return (
        <div
            style={{
                border: '1px solid rgba(0,0,0,0.06)',

                padding: '8px 10px',
                background: 'rgba(0,0,0,0.02)',
            }}
        >
            <Space wrap size={6}>
                <Tag color="geekblue">合计数量 {summary.totalQty}</Tag>
                <Tag color="success">非返修数量 {summary.nonBlockedQty}</Tag>
                <Tag color={summary.blockedCount ? 'warning' : 'default'}>
                    次品待返修 {summary.blockedCount}
                </Tag>
                <Tag color={summary.blockedCount ? 'processing' : 'default'}>
                    次品已选数量 {summary.blockedQty}
                </Tag>
                <Tag color={summary.blockedCount ? 'cyan' : 'default'}>
                    次品剩余可入库合计 {summary.blockedRemainingSum}
                </Tag>
                {summary.blockedMissing ? (
                    <Tag color="default">返修统计计算中 {summary.blockedMissing}</Tag>
                ) : null}
                {summary.blockedCount && !summary.statsMissing ? (
                    <>
                        <Tag color="processing">返修池合计 {summary.repairPoolSum}</Tag>
                        <Tag color="geekblue">已返修入库合计 {summary.repairedOutSum}</Tag>
                    </>
                ) : null}
                {hasBlocked ? (
                    <Tag color="error">包含次品待返修，无法批量合格质检</Tag>
                ) : null}
            </Space>
        </div>
    );
};

export default BatchSummary;
