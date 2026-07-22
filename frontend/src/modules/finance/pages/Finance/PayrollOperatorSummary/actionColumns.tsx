import { Button, Tag } from 'antd';
import RowActions from '@/components/common/RowActions';
import type { RowAction } from '@/components/common/RowActions';
import { isOrderFrozenByStatus } from '@/utils/api/production';
import type { SummaryColumnDeps, DetailColumnDeps } from './columnUtils';

export function getSummaryActionColumns(deps: SummaryColumnDeps): any[] {
    const { handleFinalPush, handleRejectOperator, handleRecordPayment, handleAddDeduction } = deps;

    return [
        {
            title: '操作',
            key: 'action',
            width: 220,
            fixed: 'right' as const,
            render: (_: unknown, record: Record<string, unknown>) => {
                const approved = Boolean(record.approvalTime);
                const fullyPaid = String(record.paymentStatus || '') === 'fully_paid';
                const actions: RowAction[] = [
                    {
                        key: 'approve',
                        label: approved ? '已推送' : '终审推送',
                        disabled: approved,
                        primary: !approved,
                        onClick: () => handleFinalPush(String(record.operatorName))
                    },
                    {
                        key: 'payment',
                        label: '记录打款',
                        disabled: !approved || fullyPaid,
                        onClick: () => handleRecordPayment(record),
                    },
                    {
                        key: 'deduction',
                        label: '添加扣款',
                        disabled: !approved || fullyPaid,
                        onClick: () => handleAddDeduction(record),
                    },
                    {
                        key: 'reject',
                        label: '驳回',
                        danger: true,
                        disabled: approved,
                        onClick: () => handleRejectOperator(String(record.operatorName))
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
