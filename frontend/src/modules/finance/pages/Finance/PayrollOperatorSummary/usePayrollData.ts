import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { App } from 'antd';
import { useSearchParams } from 'react-router-dom';
import { useDebouncedValue } from '@/hooks/usePerformance';
import api, { unwrapApiData } from '@/utils/api';
import type { PayrollOperatorProcessSummaryRow } from '@/types/finance';
import dayjs from 'dayjs';
import type { SmartErrorInfo } from '@/smart/core/types';
import { isSmartFeatureEnabled } from '@/smart/core/featureFlags';
import { intelligenceApi } from '@/services/intelligence/intelligenceApi';
import type { WorkerEfficiencyItem } from '@/services/intelligence/intelligenceApi';
import { usePersistentSort } from '@/hooks/usePersistentSort';
import { usePersistentState } from '@/hooks/usePersistentState';

export const toNumberOrZero = (v: unknown) => {
    const n = typeof v === 'number' ? v : Number(v);
    return Number.isFinite(n) ? n : 0;
};

export const toMoneyText = (v: unknown) => {
    const n = typeof v === 'number' ? v : Number(v);
    return Number.isFinite(n) ? n.toFixed(2) : '-';
};

export const getDetailRowKey = (r: any): string =>
    [
        String(r?.orderNo || ''),
        String(r?.styleNo || ''),
        String(r?.operatorId || r?.operatorName || ''),
        String(r?.processName || ''),
        String(r?.scanType || ''),
        String(r?.color || ''),
        String(r?.size || ''),
        String(r?.cuttingBundleNo ?? ''),
    ].join('|');

export const getDetailApprovalId = (r: any): string => String(r?.approvalId || '').trim();

export const isDetailAudited = (r: any, auditedDetailKeys: Set<string>): boolean => {
    const approvalId = getDetailApprovalId(r);
    if (approvalId && auditedDetailKeys.has(approvalId)) {
        return true;
    }
    return String(r?.approvalStatus || '').toLowerCase() === 'approved';
};

export function usePayrollData() {
    const { message } = App.useApp();
    const [searchParams] = useSearchParams();

    const [activeTab, setActiveTab] = usePersistentState<string>('payroll-operator-active-tab', 'detail');
    const [keyword, setKeyword] = useState('');
    const debouncedKeyword = useDebouncedValue(keyword, 200);
    const [scanType, setScanType] = useState<string | undefined>(undefined);
    const [includeSettled, setIncludeSettled] = useState(true);
    const [dateRange, setDateRange] = useState<any>(null);
    const [approvalFilter, setApprovalFilter] = useState<'all' | 'pending' | 'approved'>('all');

    const [rows, setRows] = useState<PayrollOperatorProcessSummaryRow[]>([]);
    const [loading, setLoading] = useState(false);
    const [smartError, setSmartError] = useState<SmartErrorInfo | null>(null);
    const hasAutoFetched = useRef(false);

    const [auditedDetailKeys, setAuditedDetailKeys] = useState<Set<string>>(new Set());
    const [detailSelectedKeys, setDetailSelectedKeys] = useState<string[]>([]);
    const [selectedRowKeys, setSelectedRowKeys] = useState<string[]>([]);
    const [printModalVisible, setPrintModalVisible] = useState(false);
    const [kingdeeExportFormat, setKingdeeExportFormat] = useState<string>('KINGDEE');
    const showSmartErrorNotice = useMemo(() => isSmartFeatureEnabled('smart.finance.explain.enabled'), []);

    const [internalOrders, setInternalOrders] = useState<any[]>([]);
    const [internalOrdersLoading, setInternalOrdersLoading] = useState(false);
    const internalOrderFetched = useRef(false);

    const [workerEffList, setWorkerEffList] = useState<WorkerEfficiencyItem[]>([]);
    const [workerEffLoading, setWorkerEffLoading] = useState(false);
    const workerEffFetched = useRef(false);

    const { sortField, sortOrder, handleSort } = usePersistentSort<string, 'asc' | 'desc'>({
        storageKey: 'payroll-operator-summary',
        defaultField: 'totalAmount',
        defaultOrder: 'desc',
    });
    const {
        sortField: detailSortField,
        sortOrder: detailSortOrder,
        handleSort: handleDetailSort,
    } = usePersistentSort<string, 'asc' | 'desc'>({
        storageKey: 'payroll-operator-detail',
        defaultField: 'startTime',
        defaultOrder: 'desc',
    });

    const reportSmartError = useCallback((title: string, reason?: string, code?: string) => {
        if (!showSmartErrorNotice) return;
        setSmartError({ title, reason, code, actionText: '刷新重试' });
    }, [showSmartErrorNotice]);

    const fetchInternalOrders = useCallback(async () => {
        setInternalOrdersLoading(true);
        try {
            const res = await api.get('/finance/finished-settlement/list', {
                params: { factoryType: 'INTERNAL', page: 1, pageSize: 200 },
            });
            const data = unwrapApiData<any>(res, '获取内部工厂订单失败');
            const records = data?.records ?? data ?? [];
            setInternalOrders(Array.isArray(records) ? records : []);
        } catch {
            message.error('获取内部工厂订单失败');
            setInternalOrders([]);
        } finally {
            setInternalOrdersLoading(false);
        }
    }, [message]);

    const fetchWorkerEfficiency = useCallback(async () => {
        if (workerEffFetched.current) return;
        workerEffFetched.current = true;
        setWorkerEffLoading(true);
        try {
            const res = await intelligenceApi.getWorkerEfficiency() as any;
            const list: WorkerEfficiencyItem[] = res?.data?.workers ?? res?.workers ?? [];
            setWorkerEffList([...list].sort((a, b) => (b.overallScore ?? 0) - (a.overallScore ?? 0)));
        } catch (err) {
            console.warn('[WorkerEfficiency] 加载工人效率数据失败:', err);
        } finally {
            setWorkerEffLoading(false);
        }
    }, []);

    useEffect(() => {
        if (activeTab === 'internalOrders' && !internalOrderFetched.current) {
            internalOrderFetched.current = true;
            void fetchInternalOrders();
        }
    }, [activeTab, fetchInternalOrders]);

    useEffect(() => {
        if (activeTab === 'efficiency') {
            void fetchWorkerEfficiency();
        }
    }, [activeTab, fetchWorkerEfficiency]);

    const totalQuantity = useMemo(() => rows.reduce((sum, r) => sum + toNumberOrZero((r as Record<string, unknown>)?.quantity), 0), [rows]);
    const totalAmount = useMemo(() => rows.reduce((sum, r) => sum + toNumberOrZero((r as Record<string, unknown>)?.totalAmount), 0), [rows]);

    const sortedRows = useMemo(() => {
        const sorted = [...rows];
        sorted.sort((a: any, b: any) => {
            const aVal = a[detailSortField];
            const bVal = b[detailSortField];
            if (detailSortField === 'startTime' || detailSortField === 'endTime') {
                const aTime = aVal ? new Date(aVal).getTime() : 0;
                const bTime = bVal ? new Date(bVal).getTime() : 0;
                return detailSortOrder === 'desc' ? bTime - aTime : aTime - bTime;
            }
            if (typeof aVal === 'number' && typeof bVal === 'number') {
                return detailSortOrder === 'desc' ? bVal - aVal : aVal - bVal;
            }
            const aStr = String(aVal || '');
            const bStr = String(bVal || '');
            return detailSortOrder === 'desc'
                ? bStr.localeCompare(aStr, 'zh-CN')
                : aStr.localeCompare(bStr, 'zh-CN');
        });
        return sorted;
    }, [rows, detailSortField, detailSortOrder]);

    const filteredRows = useMemo(() => {
        const kw = debouncedKeyword.trim().toLowerCase();
        let result = sortedRows;
        if (approvalFilter === 'pending') {
            result = result.filter((r: any) => !isDetailAudited(r, auditedDetailKeys));
        } else if (approvalFilter === 'approved') {
            result = result.filter((r: any) => isDetailAudited(r, auditedDetailKeys));
        }
        if (!kw) return result;
        return result.filter((r: any) =>
            String(r.orderNo || '').toLowerCase().includes(kw) ||
            String(r.styleNo || '').toLowerCase().includes(kw) ||
            String(r.operatorName || '').toLowerCase().includes(kw) ||
            String(r.processName || '').toLowerCase().includes(kw)
        );
    }, [sortedRows, debouncedKeyword, approvalFilter, auditedDetailKeys]);

    const summaryRows = useMemo(() => {
        const auditedRows = rows.filter(row => isDetailAudited(row, auditedDetailKeys));
        const grouped = auditedRows.reduce((acc, row) => {
            const name = String((row as Record<string, unknown>)?.operatorName || '').trim();
            if (!name) return acc;
            if (!acc[name]) {
                acc[name] = {
                    operatorName: name,
                    operatorId: String((row as Record<string, unknown>)?.operatorId || ''),
                    totalQuantity: 0, totalAmount: 0, recordCount: 0,
                    orderNos: new Set<string>(), remark: '',
                    approvalTime: null, paymentTime: null,
                };
            }
            acc[name].totalQuantity += toNumberOrZero((row as Record<string, unknown>)?.quantity);
            acc[name].totalAmount += toNumberOrZero((row as Record<string, unknown>)?.totalAmount);
            acc[name].recordCount += 1;
            const orderNo = String((row as Record<string, unknown>)?.orderNo || '').trim();
            if (orderNo) acc[name].orderNos.add(orderNo);
            return acc;
        }, {} as Record<string, any>);

        const result = Object.values(grouped).map((item: any) => ({
            operatorName: item.operatorName, operatorId: item.operatorId,
            totalQuantity: item.totalQuantity, totalAmount: item.totalAmount,
            recordCount: item.recordCount, orderCount: item.orderNos.size,
            remark: item.remark, approvalTime: item.approvalTime, paymentTime: item.paymentTime,
        }));

        result.sort((a: any, b: any) => {
            const aVal = a[sortField]; const bVal = b[sortField];
            if (sortField === 'approvalTime' || sortField === 'paymentTime') {
                const aTime = aVal ? new Date(aVal).getTime() : 0;
                const bTime = bVal ? new Date(bVal).getTime() : 0;
                return sortOrder === 'desc' ? bTime - aTime : aTime - bTime;
            }
            if (typeof aVal === 'number' && typeof bVal === 'number') {
                return sortOrder === 'desc' ? bVal - aVal : aVal - bVal;
            }
            const aStr = String(aVal || ''); const bStr = String(bVal || '');
            return sortOrder === 'desc' ? bStr.localeCompare(aStr, 'zh-CN') : aStr.localeCompare(bStr, 'zh-CN');
        });
        return result;
    }, [rows, sortField, sortOrder, auditedDetailKeys]);

    const buildPayload = useCallback(() => {
        const payload: Record<string, any> = {
            scanType: scanType ? String(scanType || '').trim() : undefined,
            includeSettled,
        };
        if (dateRange?.[0] && dateRange?.[1]) {
            payload.startTime = dayjs(dateRange[0]).format('YYYY-MM-DD HH:mm:ss');
            payload.endTime = dayjs(dateRange[1]).format('YYYY-MM-DD HH:mm:ss');
        }
        return payload;
    }, [scanType, includeSettled, dateRange]);

    const doFetchData = useCallback(async (customPayload?: unknown) => {
        const payload = customPayload || buildPayload();
        setLoading(true);
        try {
            const res = await api.post<{ code: number; message: string; data: PayrollOperatorProcessSummaryRow[] }>('/finance/payroll-settlement/operator-summary', payload);
            const data = unwrapApiData<PayrollOperatorProcessSummaryRow[]>(res, '获取人员工序统计失败');
            const nextRows = Array.isArray(data) ? data : [];
            setRows(nextRows);
            const persistedAuditedIds = nextRows
                .filter(row => String(row?.approvalStatus || '').toLowerCase() === 'approved')
                .map(row => getDetailApprovalId(row))
                .filter(Boolean);
            setAuditedDetailKeys(new Set(persistedAuditedIds));
            if (showSmartErrorNotice) setSmartError(null);
        } catch (e: unknown) {
            const errMsg = e instanceof Error ? e.message : '获取人员工序统计失败';
            reportSmartError('工资结算数据加载失败', errMsg, 'PAYROLL_OPERATOR_SUMMARY_LOAD_FAILED');
            message.error(errMsg);
            setRows([]);
        } finally {
            setLoading(false);
        }
    }, [buildPayload, showSmartErrorNotice, reportSmartError, message]);

    const fetchData = useCallback(async () => {
        await doFetchData();
    }, [doFetchData]);

    const reset = useCallback(() => {
        setKeyword('');
        setScanType(undefined);
        setIncludeSettled(true);
        setDateRange(null);
        setRows([]);
        hasAutoFetched.current = false;
    }, []);

    useEffect(() => {
        const urlOrderNo = searchParams.get('orderNo');
        const urlProcessName = searchParams.get('processName');
        const urlScanType = searchParams.get('scanType');
        let timer: ReturnType<typeof setTimeout> | null = null;
        if (urlOrderNo && !hasAutoFetched.current) {
            hasAutoFetched.current = true;
            setKeyword(urlOrderNo);
            if (urlScanType) setScanType(urlScanType);
            timer = setTimeout(() => {
                const payload: any = {
                    orderNo: urlOrderNo, styleNo: '', operatorName: '',
                    processName: urlProcessName || '', scanType: urlScanType || undefined,
                    includeSettled: true,
                };
                doFetchData(payload);
            }, 100);
        } else if (!hasAutoFetched.current) {
            hasAutoFetched.current = true;
            timer = setTimeout(() => { doFetchData(); }, 100);
        }
        return () => { if (timer) clearTimeout(timer); };
    }, [searchParams, doFetchData]);

    useEffect(() => {
        if (activeTab === 'detail' && rows.length === 0 && !loading) {
            doFetchData();
        }
    }, [activeTab, rows.length, loading, doFetchData]);

    return {
        activeTab, setActiveTab,
        keyword, setKeyword, debouncedKeyword,
        scanType, setScanType,
        includeSettled, setIncludeSettled,
        dateRange, setDateRange,
        approvalFilter, setApprovalFilter,
        rows, setRows,
        loading, smartError, setSmartError,
        auditedDetailKeys, setAuditedDetailKeys,
        detailSelectedKeys, setDetailSelectedKeys,
        selectedRowKeys, setSelectedRowKeys,
        printModalVisible, setPrintModalVisible,
        kingdeeExportFormat, setKingdeeExportFormat,
        showSmartErrorNotice, reportSmartError,
        internalOrders, internalOrdersLoading, fetchInternalOrders,
        workerEffList, workerEffLoading, workerEffFetched, fetchWorkerEfficiency,
        sortField, sortOrder, handleSort,
        detailSortField, detailSortOrder, handleDetailSort,
        totalQuantity, totalAmount,
        sortedRows, filteredRows, summaryRows,
        doFetchData, fetchData, reset, buildPayload,
        message,
    };
}
