import React from 'react';
import { App } from 'antd';
import api from '@/utils/api';
import { isOrderFrozenByStatus } from '@/utils/api/production';
import type { PayrollOperatorProcessSummaryRow } from '@/types/finance';
import dayjs from 'dayjs';
import { scanTypeText } from './payrollOperatorColumns';
import {
  toNumberOrZero,
  getDetailRowKey,
  getDetailApprovalId,
  isDetailAudited,
} from './usePayrollData';

export interface PayrollActionDeps {
    rows: PayrollOperatorProcessSummaryRow[];
    setRows: React.Dispatch<React.SetStateAction<PayrollOperatorProcessSummaryRow[]>>;
    auditedDetailKeys: Set<string>;
    setAuditedDetailKeys: React.Dispatch<React.SetStateAction<Set<string>>>;
    detailSelectedKeys: string[];
    setDetailSelectedKeys: React.Dispatch<React.SetStateAction<string[]>>;
    selectedRowKeys: string[];
    setSelectedRowKeys: React.Dispatch<React.SetStateAction<string[]>>;
    summaryRows: any[];
    activeTab: string;
    dateRange: any;
    kingdeeExportFormat: string;
    setPrintModalVisible: React.Dispatch<React.SetStateAction<boolean>>;
    message: ReturnType<typeof App.useApp>['message'];
}

export function usePayrollActions(deps: PayrollActionDeps) {
    const {
        rows, setRows, auditedDetailKeys, setAuditedDetailKeys,
        detailSelectedKeys, setDetailSelectedKeys,
        selectedRowKeys, setSelectedRowKeys,
        summaryRows, activeTab, dateRange, kingdeeExportFormat,
        setPrintModalVisible, message,
    } = deps;

    const handleAuditDetail = async (row: any) => {
        if (!isOrderFrozenByStatus({ status: String(row?.orderStatus || '') })) {
            message.warning('该订单尚未关单，只有已关单的订单才能审核');
            return;
        }
        const approvalId = getDetailApprovalId(row);
        if (!approvalId) {
            message.error('审核失败：缺少审批标识');
            return;
        }
        try {
            await api.post(`/finance/payroll-settlement/detail-approval/${encodeURIComponent(approvalId)}/approve`, {});
            setAuditedDetailKeys(prev => new Set([...prev, approvalId]));
            setRows(prev => prev.map(item => {
                if (getDetailApprovalId(item) === approvalId) {
                    return { ...item, approvalStatus: 'approved' } as PayrollOperatorProcessSummaryRow;
                }
                return item;
            }));
            message.success(`已审核：${row.operatorName || ''} - ${row.processName || ''}`);
        } catch (error: unknown) {
            message.error(error instanceof Error ? error.message : '审核失败');
        }
    };

    const handleBatchAuditDetails = () => {
        const stripSuffix = (k: string) => k.replace(/\|@@\d+$/, '');
        const selectedRows = detailSelectedKeys.map(key => {
            const businessKey = stripSuffix(key);
            return rows.find(r => getDetailRowKey(r) === businessKey);
        }).filter(Boolean);

        const notFrozenRows = selectedRows.filter((row): row is PayrollOperatorProcessSummaryRow => {
            return Boolean(row && !isOrderFrozenByStatus({ status: String((row as any)?.orderStatus || '') }));
        });
        const alreadyAuditedRows = selectedRows.filter((row): row is PayrollOperatorProcessSummaryRow => {
            return Boolean(row && isDetailAudited(row, auditedDetailKeys));
        });
        const noApprovalIdRows = selectedRows.filter((row): row is PayrollOperatorProcessSummaryRow => {
            return Boolean(row && !getDetailApprovalId(row));
        });

        const eligibleRows = selectedRows.filter((row): row is PayrollOperatorProcessSummaryRow => {
            const approvalId = getDetailApprovalId(row);
            return Boolean(
                row && approvalId &&
                isOrderFrozenByStatus({ status: String((row as any)?.orderStatus || '') }) &&
                !isDetailAudited(row, auditedDetailKeys)
            );
        });

        if (eligibleRows.length === 0) {
            if (notFrozenRows.length > 0) {
                message.warning(`所选 ${notFrozenRows.length} 行的订单尚未关单，只有已关单的订单才能审核`);
            } else if (alreadyAuditedRows.length > 0) {
                message.warning('所选行已全部审核过，无需重复审核');
            } else if (noApprovalIdRows.length > 0) {
                message.warning('所选行缺少审批标识，无法审核');
            } else {
                message.warning('请先勾选需要审核的行');
            }
            return;
        }

        const doBatchApprove = async () => {
            try {
                for (const row of eligibleRows) {
                    const approvalId = getDetailApprovalId(row);
                    await api.post(`/finance/payroll-settlement/detail-approval/${encodeURIComponent(approvalId)}/approve`, {});
                }
                const approvedIds = eligibleRows.map(row => getDetailApprovalId(row)).filter(Boolean);
                setAuditedDetailKeys(prev => new Set([...prev, ...approvedIds]));
                setRows(prev => prev.map(item => {
                    if (approvedIds.includes(getDetailApprovalId(item))) {
                        return { ...item, approvalStatus: 'approved' } as PayrollOperatorProcessSummaryRow;
                    }
                    return item;
                }));
                setDetailSelectedKeys([]);
                message.success(`已批量审核 ${eligibleRows.length} 条记录`);
            } catch (error: unknown) {
                message.error(error instanceof Error ? error.message : '批量审核失败');
            }
        };
        void doBatchApprove();
    };

    const handleRejectOperator = (operName: string) => {
        const approvalIdsOfOperator = rows
            .filter(r => String((r as any)?.operatorName || '') === operName)
            .map(r => getDetailApprovalId(r))
            .filter(Boolean);
        setAuditedDetailKeys(prev => {
            const next = new Set(prev);
            approvalIdsOfOperator.forEach(k => next.delete(k));
            return next;
        });
        setRows(prev => prev.map(row => {
            if (String((row as any)?.operatorName || '') === operName) {
                return { ...row, approvalStatus: 'pending' } as PayrollOperatorProcessSummaryRow;
            }
            return row;
        }));
        message.success(`「${operName}」的明细已驳回，请回「工序明细」重新审核`);
    };

    const handleFinalPush = async (operatorName: string) => {
        const summary = summaryRows.find((r: any) => r.operatorName === operatorName);
        if (!summary) { message.error('未找到该人员汇总数据'); return; }
        try {
            await api.post('/finance/wage-payment/create-payable', {
                bizType: 'PAYROLL_SETTLEMENT',
                bizId: summary.operatorId || operatorName,
                payeeName: operatorName,
                amount: toNumberOrZero(summary.totalAmount),
                description: `工资结算：${summary.recordCount}次扫码，共${toNumberOrZero(summary.totalQuantity)}件`,
            });
            const now = dayjs().format('YYYY-MM-DD HH:mm:ss');
            setRows(prev => prev.map(row => {
                if ((row as Record<string, unknown>).operatorName === operatorName) {
                    return { ...row, approvalTime: now } as PayrollOperatorProcessSummaryRow;
                }
                return row;
            }));
            message.success(`已终审并推送 ${operatorName} 的工资到收付款中心`);
        } catch (error: unknown) {
            console.error('终审推送失败:', error);
            message.error(error instanceof Error ? error.message : '终审失败，请稍后重试');
        }
    };

    const handleBatchFinalPush = async () => {
        if (selectedRowKeys.length === 0) { message.warning('请选择要终审推送的人员'); return; }
        try {
            for (const key of selectedRowKeys) {
                const summary = summaryRows.find((r: any) => r.operatorName === key);
                if (!summary) continue;
                await api.post('/finance/wage-payment/create-payable', {
                    bizType: 'PAYROLL_SETTLEMENT',
                    bizId: summary.operatorId || String(key),
                    payeeName: String(key),
                    amount: toNumberOrZero(summary.totalAmount),
                    description: `工资结算：${summary.recordCount}次扫码，共${toNumberOrZero(summary.totalQuantity)}件`,
                });
            }
            const now = dayjs().format('YYYY-MM-DD HH:mm:ss');
            setRows(prev => prev.map(row => {
                if (selectedRowKeys.includes((row as Record<string, unknown>).operatorName as string)) {
                    return { ...row, approvalTime: now } as PayrollOperatorProcessSummaryRow;
                }
                return row;
            }));
            message.success(`已批量终审并推送 ${selectedRowKeys.length} 人到收付款中心`);
            setSelectedRowKeys([]);
        } catch (error: unknown) {
            console.error('批量终审失败:', error);
            message.error(error instanceof Error ? error.message : '批量终审失败，请稍后重试');
        }
    };

    const exportToExcelFn = async () => {
        const { exportToExcel } = await import('@/utils/excelExport');
        if (activeTab === 'summary') {
            if (summaryRows.length === 0) { message.warning('无汇总数据可导出'); return; }
            const formattedData = summaryRows.map((item: any) => ({
                '人员': item.operatorName || '-',
                '总数量': toNumberOrZero(item.totalQuantity),
                '总金额(元)': toNumberOrZero(item.totalAmount),
                '扫码次数': toNumberOrZero(item.recordCount),
                '订单数': toNumberOrZero(item.orderCount),
                '备注': String(item.remark || '').trim() || '-',
                '审核时间': item.approvalTime ? dayjs(item.approvalTime).format('YYYY-MM-DD HH:mm:ss') : '-',
                '付款时间': item.paymentTime ? dayjs(item.paymentTime).format('YYYY-MM-DD HH:mm:ss') : '-',
            }));
            const cols = ['人员','总数量','总金额(元)','扫码次数','订单数','备注','审核时间','付款时间'].map(h => ({ header: h, key: h }));
            await exportToExcel(formattedData, cols, `工资汇总_${dayjs().format('YYYYMMDDHHmmss')}.xlsx`);
            message.success('汇总导出成功');
        } else if (activeTab === 'detail') {
            if (rows.length === 0) { message.warning('无明细数据可导出'); return; }
            const formattedData = rows.map((r: any) => ({
                '订单号': String(r?.orderNo || ''), '款号': String(r?.styleNo || ''),
                '颜色': String(r?.color || ''), '尺码': String(r?.size || ''),
                '人员': String(r?.operatorName || ''), '工序': String(r?.processName || ''),
                '生产节点': scanTypeText(r?.scanType),
                '开始时间': r?.startTime ? dayjs(r.startTime).format('YYYY-MM-DD HH:mm:ss') : '-',
                '完成时间': r?.endTime ? dayjs(r.endTime).format('YYYY-MM-DD HH:mm:ss') : '-',
                '数量': toNumberOrZero(r?.quantity), '单价(元)': toNumberOrZero(r?.unitPrice),
                '金额(元)': toNumberOrZero(r?.totalAmount),
            }));
            const cols = ['订单号','款号','颜色','尺码','人员','工序','生产节点','开始时间','完成时间','数量','单价(元)','金额(元)'].map(h => ({ header: h, key: h }));
            await exportToExcel(formattedData, cols, `工资结算明细_${dayjs().format('YYYYMMDDHHmmss')}.xlsx`);
            message.success('明细导出成功');
        } else {
            message.warning('当前标签页不支持导出');
        }
    };

    const handleKingdeeExport = () => {
        const params: Record<string, string> = { format: kingdeeExportFormat };
        if (dateRange?.[0] && dateRange?.[1]) {
            params.startDate = dayjs(dateRange[0]).format('YYYY-MM-DD');
            params.endDate = dayjs(dateRange[1]).format('YYYY-MM-DD');
        }
        const qs = new URLSearchParams(params).toString();
        const token = localStorage.getItem('authToken') || localStorage.getItem('token') || '';
        fetch(`/api/finance/tax-export/payroll-detail?${qs}`, {
            method: 'GET',
            headers: { 'Authorization': `Bearer ${token}` },
        })
            .then(res => {
                if (!res.ok) throw new Error(`导出失败: ${res.status}`);
                const filename = res.headers.get('Content-Disposition')?.match(/filename\*?=(?:UTF-8'')?(.+)/)?.[1] || 'payroll-export.xlsx';
                return res.blob().then(blob => ({ blob, filename: decodeURIComponent(filename) }));
            })
            .then(({ blob, filename }) => {
                const url = URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.href = url;
                link.download = filename;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                URL.revokeObjectURL(url);
                message.success('财税导出已开始下载');
            })
            .catch(err => message.error(err.message || '导出失败'));
    };

    const handlePrintWageSlips = () => {
        if (selectedRowKeys.length === 0) { message.warning('请选择需要打印工资条的人员'); return; }
        setPrintModalVisible(true);
    };

    const getPrintData = () => {
        return selectedRowKeys.map(key => {
            const summary = summaryRows.find((r: any) => r.operatorName === key);
            const details = rows.filter(r => String((r as any)?.operatorName || '') === key);
            return {
                operatorName: key,
                totalAmount: summary ? toNumberOrZero(summary.totalAmount) : 0,
                totalQuantity: summary ? toNumberOrZero(summary.totalQuantity) : 0,
                details,
            };
        });
    };

    return {
        handleAuditDetail, handleBatchAuditDetails,
        handleRejectOperator, handleFinalPush, handleBatchFinalPush,
        exportToExcelFn, handleKingdeeExport,
        handlePrintWageSlips, getPrintData,
    };
}
