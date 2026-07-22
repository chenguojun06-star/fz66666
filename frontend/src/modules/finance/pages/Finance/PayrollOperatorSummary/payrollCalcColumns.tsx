import { formatMoney } from '@/utils/format';
import SortableColumnTitle from '@/components/common/SortableColumnTitle';
import WorkerPayrollAuditPopover from './WorkerPayrollAuditPopover';
import { createSortableNumberColumn } from './columnUtils';
import type { SummaryColumnDeps, DetailColumnDeps } from './columnUtils';

export function getSummaryPayrollColumns(deps: SummaryColumnDeps): any[] {
    const { sortField, sortOrder, handleSort, toNumberOrZero, toMoneyText, summaryRows, totalAmount } = deps;

    return [
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
                    ? <span style={{ marginLeft: 6, fontSize: 14, color: pct > 0 ? 'var(--color-success)' : 'var(--color-danger)' }}>
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
                    <span style={{ cursor: 'pointer', borderBottom: '1px dashed var(--color-border-antd)', whiteSpace: 'nowrap' }}>
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
                <span style={{ color: '#389e0d' }}>{formatMoney(toNumberOrZero(v))}</span>
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
                        {formatMoney(val)}
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
            render: (v: unknown) => formatMoney(toNumberOrZero(v)),
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
    ];
}

export function getDetailPayrollColumns(deps: DetailColumnDeps): any[] {
    const { toNumberOrZero, toMoneyText } = deps;

    return [
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
            title: '单价',
            dataIndex: 'unitPrice',
            key: 'unitPrice',
            width: 110,
            align: 'right' as const,
            render: (v: unknown) => toMoneyText(v),
        },
        {
            title: '金额',
            dataIndex: 'totalAmount',
            key: 'totalAmount',
            width: 120,
            align: 'right' as const,
            render: (v: unknown) => toMoneyText(v),
        },
    ];
}
