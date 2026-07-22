import { getSummaryBaseInfoColumns, getDetailBaseInfoColumns } from './baseInfoColumns';
import { getSummaryPayrollColumns, getDetailPayrollColumns } from './payrollCalcColumns';
import { getSummaryActionColumns, getDetailActionColumns } from './actionColumns';
import type { SummaryColumnDeps, DetailColumnDeps } from './columnUtils';
export { createSortableNumberColumn, createSortableTimeColumn, scanTypeText } from './columnUtils';
export type { SummaryColumnDeps, DetailColumnDeps } from './columnUtils';

export function getSummaryColumns(deps: SummaryColumnDeps): any[] {
    return [
        ...getSummaryBaseInfoColumns(deps).slice(0, 1),
        ...getSummaryPayrollColumns(deps),
        ...getSummaryBaseInfoColumns(deps).slice(1),
        ...getSummaryActionColumns(deps),
    ];
}

export function getDetailColumns(deps: DetailColumnDeps): any[] {
    const baseInfo = getDetailBaseInfoColumns(deps);
    const payroll = getDetailPayrollColumns(deps);
    const action = getDetailActionColumns(deps);

    const baseInfoWithoutOrderStatus = baseInfo.filter(col => col.key !== 'orderStatus');
    const orderStatusCol = baseInfo.find(col => col.key === 'orderStatus');

    return [
        ...baseInfoWithoutOrderStatus,
        ...payroll,
        ...(orderStatusCol ? [orderStatusCol] : []),
        ...action,
    ];
}
