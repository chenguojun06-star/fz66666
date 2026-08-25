import { Button, Tag } from 'antd';
import RowActions from '@/components/common/RowActions';
import type { RowAction } from '@/components/common/RowActions';
import { isOrderFrozenByStatus } from '@/utils/api/production';
import type { SummaryColumnDeps, DetailColumnDeps } from './columnUtils';

export function getSummaryActionColumns(deps: SummaryColumnDeps): any[] {
    const { handleFinalPush } = deps;

    return [
        {
            title: '操作',
            key: 'action',
            width: 220,
            fixed: 'right' as const,
            render: (_: unknown, record: Record<string, unknown>) => {
                const approved = Boolean(record.approvalTime);
                // D-131：只保留「终审推送」——走后端统一入口（生成结算单→审核→确认账单派生应付款）。
                // 移除「记录打款/添加扣款」（汇总行无结算单ID，点击必失败）与「驳回」（纯前端假动作，从未落库）。
                const actions: RowAction[] = [
                    {
                        key: 'approve',
                        label: approved ? '已推送' : '终审推送',
                        disabled: approved,
                        primary: !approved,
                        onClick: () => handleFinalPush(String(record.operatorName))
                    },
                ];

                return <RowActions actions={actions} />;
            },
        },
    ];
}

export function getDetailActionColumns(deps: DetailColumnDeps): any[] {
    const { isDetailAudited, handleAuditDetail } = deps;

    return [
        {
            title: '审核',
            key: 'audit',
            width: 90,
            fixed: 'right' as const,
            render: (_: unknown, record: any) => {
                const isInternal = record.factoryType === 'INTERNAL';
                const canAudit = isInternal || isOrderFrozenByStatus({ status: record.orderStatus });
                const audited = isDetailAudited(record);
                if (audited) return <Tag color="processing">已审核</Tag>;
                if (!canAudit) return <span style={{ color: 'var(--neutral-text-disabled)', fontSize: 14 }}>未关单</span>;
                return (
                    <Button
                        type="primary"
                        onClick={() => handleAuditDetail(record)}
                    >
                        审核
                    </Button>
                );
            },
        },
    ];
}
