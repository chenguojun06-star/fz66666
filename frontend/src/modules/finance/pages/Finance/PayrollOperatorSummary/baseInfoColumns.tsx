import { Tag, Tooltip } from 'antd';
import { formatDateTime } from '@/utils/datetime';
import { formatProcessDisplayName } from '@/utils/productionStage';
import SortableColumnTitle from '@/components/common/SortableColumnTitle';
import WorkerPerformanceBadge from '@/smart/components/WorkerPerformanceBadge';
import { isSmartFeatureEnabled } from '@/smart/core/featureFlags';
import { ORDER_STATUS_LABEL, ORDER_STATUS_COLOR } from '@/constants/orderStatus';
import StatusTag from '@/components/common/StatusTag';
import { PAYROLL_PAYMENT_STATUS_MAP } from '@/constants/statusMaps';
import { createSortableTimeColumn, scanTypeText } from './columnUtils';
import type { SummaryColumnDeps, DetailColumnDeps } from './columnUtils';

export function getSummaryBaseInfoColumns(deps: SummaryColumnDeps): any[] {
    const { sortField, sortOrder, handleSort } = deps;

    return [
        {
            title: '人员', dataIndex: 'operatorName', key: 'operatorName', width: 140, ellipsis: true,
            render: (name: string) => (
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span>{name || '-'}</span>
                    {isSmartFeatureEnabled('smart.worker-profile.enabled') && name
                        ? <WorkerPerformanceBadge operatorName={name} />
                        : null}
                </div>
            ),
        },
        {
            title: '付款状态',
            dataIndex: 'paymentStatus',
            key: 'paymentStatus',
            width: 110,
            align: 'center' as const,
            render: (v: unknown) => {
                const status = String(v || '');
                return <StatusTag status={status} statusMap={PAYROLL_PAYMENT_STATUS_MAP} />;
            },
        },
        {
            title: '备注',
            dataIndex: 'remark',
            key: 'remark',
            width: 200,
            ellipsis: true,
            render: (v: unknown) => String(v || '').trim() || '-',
        },
        createSortableTimeColumn('审核时间', 'approvalTime', sortField, sortOrder, handleSort, 160),
        createSortableTimeColumn('付款时间', 'paymentTime', sortField, sortOrder, handleSort, 160),
    ];
}

export function getDetailBaseInfoColumns(deps: DetailColumnDeps): any[] {
    const { detailSortField, detailSortOrder, handleDetailSort } = deps;

    return [
        { title: '订单号', dataIndex: 'orderNo', key: 'orderNo', width: 140, ellipsis: true },
        { title: '款号', dataIndex: 'styleNo', key: 'styleNo', width: 120, ellipsis: true },
        { title: '颜色', dataIndex: 'color', key: 'color', width: 100, ellipsis: true, render: (v: unknown) => String(v || '').trim() || '-' },
        { title: '尺码', dataIndex: 'size', key: 'size', width: 80, ellipsis: true, render: (v: unknown) => String(v || '').trim() || '-' },
        {
            title: '菲号',
            dataIndex: 'cuttingBundleNo',
            key: 'cuttingBundleNo',
            width: 90,
            align: 'center' as const,
            render: (v: unknown) => {
                const no = v != null ? Number(v) : null;
                return no != null && Number.isFinite(no) ? String(no) : '-';
            },
        },
        {
            title: '人员', dataIndex: 'operatorName', key: 'operatorName', width: 120, ellipsis: true,
            render: (name: string) => (
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span>{name || '-'}</span>
                    {isSmartFeatureEnabled('smart.worker-profile.enabled') && name
                        ? <WorkerPerformanceBadge operatorName={name} />
                        : null}
                </div>
            ),
        },
        {
            title: '结算类型',
            dataIndex: 'delegateTargetType',
            key: 'delegateTargetType',
            width: 130,
            ellipsis: true,
            render: (_: unknown, record: any) => {
                const type = record.delegateTargetType;
                const targetName = record.delegateTargetName;
                const actualOperator = record.actualOperatorName;

                if (!type || type === 'none') {
                    return <Tag color="default">自己完成</Tag>;
                }

                if (type === 'internal') {
                    return (
                        <Tooltip title={actualOperator && actualOperator !== targetName ? `由 ${actualOperator} 代为操作` : undefined}>
                            <Tag color="processing">内部指派</Tag>
                        </Tooltip>
                    );
                }

                if (type === 'external') {
                    return (
                        <Tooltip title={actualOperator ? `由 ${actualOperator} 代为录入` : undefined}>
                            <Tag color="warning">外发工厂</Tag>
                        </Tooltip>
                    );
                }

                return <Tag color="default">-</Tag>;
            },
        },
        {
            title: '指派对象',
            dataIndex: 'delegateTargetName',
            key: 'delegateTargetName',
            width: 120,
            ellipsis: true,
            render: (v: unknown, record: any) => {
                const type = record.delegateTargetType;
                const name = String(v || '').trim();

                if (!type || type === 'none' || !name) {
                    return <span style={{ color: 'var(--neutral-text-disabled)' }}>-</span>;
                }

                if (type === 'external') {
                    return <span style={{ color: 'var(--color-warning)', fontWeight: 600 }}>{name}</span>;
                }

                return <span style={{ color: 'var(--primary-color)', fontWeight: 600 }}>{name}</span>;
            },
        },
        {
            title: '工序名称',
            dataIndex: 'processName',
            key: 'processName',
            width: 140,
            ellipsis: true,
            render: (v: unknown, record: any) => {
                const displayName = formatProcessDisplayName(record?.processCode, String(v || '').trim());
                return displayName && displayName !== '-' ? (
                    <span style={{ fontWeight: 600, color: 'var(--neutral-text)' }}>{displayName}</span>
                ) : (
                    <span style={{ color: 'var(--neutral-text-disabled)' }}>未记录</span>
                );
            }
        },
        { title: '生产节点', dataIndex: 'scanType', key: 'scanType', width: 100, render: (v: unknown) => scanTypeText(v) },
        {
            title: <SortableColumnTitle
                title="开始时间"
                sortField={detailSortField}
                fieldName="startTime"
                sortOrder={detailSortOrder}
                onSort={handleDetailSort}
                align="left"
            />,
            dataIndex: 'startTime',
            key: 'startTime',
            width: 130,
            ellipsis: true,
            render: (v: unknown) => v ? formatDateTime(v) : '-',
        },
        {
            title: <SortableColumnTitle
                title="完成时间"
                sortField={detailSortField}
                fieldName="endTime"
                sortOrder={detailSortOrder}
                onSort={handleDetailSort}
                align="left"
            />,
            dataIndex: 'endTime',
            key: 'endTime',
            width: 130,
            ellipsis: true,
            render: (v: unknown) => v ? formatDateTime(v) : '-',
        },
        {
            title: '订单状态',
            dataIndex: 'orderStatus',
            key: 'orderStatus',
            width: 110,
            fixed: 'right' as const,
            render: (v: unknown) => {
                const status = String(v || '').toLowerCase();
                if (status === 'completed') return <Tag color="success">已完成·可审核</Tag>;
                if (status === 'closed') return <Tag color="processing">已关单·可审核</Tag>;
                if (!status) return <span style={{ color: 'var(--neutral-text-disabled)' }}>-</span>;
                const label = ORDER_STATUS_LABEL[status];
                return <Tag color={ORDER_STATUS_COLOR[status] ?? 'default'}>{label ?? '未知'}</Tag>;
            },
        },
    ];
}
