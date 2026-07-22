import SortableColumnTitle from '@/components/common/SortableColumnTitle';
import { formatDateTime } from '@/utils/datetime';
import { getScanTypeLabel } from '@/components/common/ScanTypeBadge';

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
    render: (v: unknown) => v ? formatDateTime(v) : '-',
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
