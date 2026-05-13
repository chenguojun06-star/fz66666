import { Button, Tag, Tooltip } from 'antd';
import dayjs from 'dayjs';
import { formatProcessDisplayName } from '@/utils/productionStage';
import SortableColumnTitle from '@/components/common/SortableColumnTitle';
import RowActions from '@/components/common/RowActions';
import type { RowAction } from '@/components/common/RowActions';
import WorkerPerformanceBadge from '@/smart/components/WorkerPerformanceBadge';
import { isSmartFeatureEnabled } from '@/smart/core/featureFlags';
import WorkerPayrollAuditPopover from './WorkerPayrollAuditPopover';
import { isOrderFrozenByStatus } from '@/utils/api/production';
import { ORDER_STATUS_LABEL, ORDER_STATUS_COLOR } from '@/constants/orderStatus';
import { getScanTypeLabel } from '@/components/common/ScanTypeBadge';

// 工具函数：创建可排序的数字列配置
export const createSortableNumberColumn = (
    title: string,
    dataIndex: string,
    sortField: string,
    sortOrder: 'asc' | 'desc',
    onSort: (field: string, order: 'asc' | 'desc') => void,
    width: number,
    renderFn: (v: unknown) => string | number
) => ({
    title: <SortableColumnTitle
        title={title}
        sortField={sortField}
        fieldName={dataIndex}
        sortOrder={sortOrder}
        onSort={onSort}
    />,
    dataIndex,
    key: dataIndex,
    width,
    align: 'right' as const,
    render: renderFn,
});

// 工具函数：创建可排序的时间列配置
export const createSortableTimeColumn = (
    title: string,
    dataIndex: string,
    sortField: string,
    sortOrder: 'asc' | 'desc',
    onSort: (field: string, order: 'asc' | 'desc') => void,
    width: number
) => ({
    title: <SortableColumnTitle
        title={title}
        sortField={sortField}
        fieldName={dataIndex}
        sortOrder={sortOrder}
        onSort={onSort}
        align="left"
    />,
    dataIndex,
    key: dataIndex,
    width,
    ellipsis: true,
    render: (v: unknown) => v ? dayjs(v as string).format('YYYY-MM-DD HH:mm') : '-',
});

export const scanTypeText = (raw: any) => getScanTypeLabel(raw);

export interface SummaryColumnDeps {
    sortField: string;
    sortOrder: 'asc' | 'desc';
    handleSort: (field: string, order: 'asc' | 'desc') => void;
    toNumberOrZero: (v: unknown) => number;
    toMoneyText: (v: unknown) => string;
    summaryRows: any[];
    totalAmount: number;
    handleFinalPush: (operatorName: string) => void;
    handleRejectOperator: (operatorName: string) => void;
    handleRecordPayment: (record: Record<string, unknown>) => void;
    handleAddDeduction: (record: Record<string, unknown>) => void;
}

export function getSummaryColumns(deps: SummaryColumnDeps): any[] {
    const { sortField, sortOrder, handleSort, toNumberOrZero, toMoneyText, summaryRows, totalAmount, handleFinalPush, handleRejectOperator, handleRecordPayment, handleAddDeduction } = deps;

    const paymentStatusMap: Record<string, { text: string; color: string }> = {
        unpaid: { text: '未付', color: 'red' },
        partially_paid: { text: '部分已付', color: 'orange' },
        fully_paid: { text: '已付清', color: 'green' },
    };

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
            title: <SortableColumnTitle title="总数量" fieldName="totalQuantity" sortField={sortField} sortOrder={sortOrder} onSort={handleSort} />,
            dataIndex: 'totalQuantity',
            key: 'totalQuantity',
            width: 140,
            render: (v: unknown) => {
                const qty = toNumberOrZero(v);
                const avgQty = summaryRows.length > 0
                    ? summaryRows.reduce((s, r) => s + toNumberOrZero((r as Record<string, unknown>).totalQuantity), 0) / summaryRows.length
                    : 0;
                const pct = avgQty > 0 ? Math.round((qty - avgQty) / avgQty * 100) : 0;
                const trendEl = summaryRows.length > 1 && Math.abs(pct) > 5
                    ? <span style={{ marginLeft: 6, fontSize: 11, color: pct > 0 ? '#52c41a' : '#ff4d4f' }}>
                        {pct > 0 ? `↑${pct}%` : `↓${Math.abs(pct)}%`}
                      </span>
                    : null;
                return <span>{qty.toLocaleString()}{trendEl}</span>;
            },
        },
        {
            title: <SortableColumnTitle title="总金额(元)" fieldName="totalAmount" sortField={sortField} sortOrder={sortOrder} onSort={handleSort} />,
            dataIndex: 'totalAmount',
            key: 'totalAmount',
            width: 160,
            render: (v: unknown, record: Record<string, unknown>) => (
                <WorkerPayrollAuditPopover
                    record={record as any}
                    grandTotal={totalAmount}
                    workerCount={summaryRows.length}
                >
                    <span style={{ cursor: 'pointer', borderBottom: '1px dashed #d9d9d9', whiteSpace: 'nowrap' }}>
                        {toMoneyText(v)}
                    </span>
                </WorkerPayrollAuditPopover>
            ),
        },
        createSortableNumberColumn('扫码次数', 'recordCount', sortField, sortOrder, handleSort, 120, (v) => toNumberOrZero(v) || 0),
        createSortableNumberColumn('订单数', 'orderCount', sortField, sortOrder, handleSort, 100, (v) => toNumberOrZero(v) || 0),
        {
            title: <SortableColumnTitle title="已付金额" fieldName="paidAmount" sortField={sortField} sortOrder={sortOrder} onSort={handleSort} />,
            dataIndex: 'paidAmount',
            key: 'paidAmount',
            width: 130,
            align: 'right' as const,
            render: (v: unknown) => (
                <span style={{ color: '#389e0d' }}>¥{toNumberOrZero(v).toFixed(2)}</span>
            ),
        },
        {
            title: <SortableColumnTitle title="扣款金额" fieldName="deductionAmount" sortField={sortField} sortOrder={sortOrder} onSort={handleSort} />,
            dataIndex: 'deductionAmount',
            key: 'deductionAmount',
            width: 130,
            align: 'right' as const,
            render: (v: unknown) => {
                const val = toNumberOrZero(v);
                return (
                    <span style={{ color: val > 0 ? 'var(--color-danger)' : 'var(--neutral-text-secondary)' }}>
                        ¥{val.toFixed(2)}
                    </span>
                );
            },
        },
        {
            title: <SortableColumnTitle title="借支抵扣" fieldName="advanceAmount" sortField={sortField} sortOrder={sortOrder} onSort={handleSort} />,
            dataIndex: 'advanceAmount',
            key: 'advanceAmount',
            width: 130,
            align: 'right' as const,
            render: (v: unknown) => `¥${toNumberOrZero(v).toFixed(2)}`,
        },
        {
            title: <SortableColumnTitle title="剩余未付" fieldName="remainingAmount" sortField={sortField} sortOrder={sortOrder} onSort={handleSort} />,
            dataIndex: 'remainingAmount',
            key: 'remainingAmount',
            width: 130,
            align: 'right' as const,
            render: (v: unknown) => {
                const val = toNumberOrZero(v);
                return (
                    <span style={{ fontWeight: val > 0 ? 700 : 400, color: val > 0 ? 'var(--color-danger)' : 'var(--neutral-text-secondary)' }}>
                        ¥{val.toFixed(2)}
                    </span>
                );
            },
        },
        {
            title: '付款状态',
            dataIndex: 'paymentStatus',
            key: 'paymentStatus',
            width: 110,
            align: 'center' as const,
            render: (v: unknown) => {
                const status = String(v || '');
                const info = paymentStatusMap[status];
                return info ? <Tag color={info.color}>{info.text}</Tag> : <Tag>未知</Tag>;
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

export interface DetailColumnDeps {
    detailSortField: string;
    detailSortOrder: 'asc' | 'desc';
    handleDetailSort: (field: string, order: 'asc' | 'desc') => void;
    toNumberOrZero: (v: unknown) => number;
    toMoneyText: (v: unknown) => string;
    auditedDetailKeys: Set<string>;
    isDetailAudited: (record: any) => boolean;
    handleAuditDetail: (record: any) => void;
}

export function getDetailColumns(deps: DetailColumnDeps): any[] {
    const { detailSortField, detailSortOrder, handleDetailSort, toNumberOrZero, toMoneyText, isDetailAudited, handleAuditDetail } = deps;
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
                            <Tag color="blue">内部指派</Tag>
                        </Tooltip>
                    );
                }

                if (type === 'external') {
                    return (
                        <Tooltip title={actualOperator ? `由 ${actualOperator} 代为录入` : undefined}>
                            <Tag color="orange">外发工厂</Tag>
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
            render: (v: unknown) => v ? dayjs(v as string).format('YYYY-MM-DD HH:mm') : '-',
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
            render: (v: unknown) => v ? dayjs(v as string).format('YYYY-MM-DD HH:mm') : '-',
        },
        {
            title: '数量',
            dataIndex: 'quantity',
            key: 'quantity',
            width: 90,
            align: 'right' as const,
            render: (v: unknown) => {
                const n = toNumberOrZero(v);
                return n ? String(n) : '0';
            },
        },
        {
            title: '单价(元)',
            dataIndex: 'unitPrice',
            key: 'unitPrice',
            width: 110,
            align: 'right' as const,
            render: (v: unknown) => toMoneyText(v),
        },
        {
            title: '金额(元)',
            dataIndex: 'totalAmount',
            key: 'totalAmount',
            width: 120,
            align: 'right' as const,
            render: (v: unknown) => toMoneyText(v),
        },
        {
            title: '订单状态',
            dataIndex: 'orderStatus',
            key: 'orderStatus',
            width: 110,
            fixed: 'right' as const,
            render: (v: unknown) => {
                const status = String(v || '').toLowerCase();
                if (status === 'completed') return <Tag color="green">已完成·可审核</Tag>;
                if (status === 'closed') return <Tag color="blue">已关单·可审核</Tag>;
                if (!status) return <span style={{ color: 'var(--neutral-text-disabled)' }}>-</span>;
                const label = ORDER_STATUS_LABEL[status];
                return <Tag color={ORDER_STATUS_COLOR[status] ?? 'default'}>{label ?? '未知'}</Tag>;
            },
        },
        {
            title: '审核',
            key: 'audit',
            width: 90,
            fixed: 'right' as const,
            render: (_: unknown, record: any) => {
                const canAudit = isOrderFrozenByStatus({ status: record.orderStatus });
                const audited = isDetailAudited(record);
                if (audited) return <Tag color="cyan">已审核</Tag>;
                if (!canAudit) return <span style={{ color: 'var(--neutral-text-disabled)', fontSize: 12 }}>未关单</span>;
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
