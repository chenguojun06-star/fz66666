import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { App, Button, Card, Input, Progress, Select, Space, Switch, Tabs, Tag } from 'antd';
import { UnifiedRangePicker } from '@/components/common/UnifiedDatePicker';
import { useSearchParams } from 'react-router-dom';
import PageLayout from '@/components/common/PageLayout';
import ResizableTable from '@/components/common/ResizableTable';

import api, { unwrapApiData } from '@/utils/api';
import { isOrderFrozenByStatus } from '@/utils/api/production';
import type { PayrollOperatorProcessSummaryRow } from '@/types/finance';
import dayjs from 'dayjs';
import SmartErrorNotice from '@/smart/components/SmartErrorNotice';

import type { SmartErrorInfo } from '@/smart/core/types';
import { isSmartFeatureEnabled } from '@/smart/core/featureFlags';
import { getSummaryColumns, getDetailColumns, scanTypeText } from './payrollOperatorColumns';
import { ORDER_STATUS_LABEL, ORDER_STATUS_COLOR } from '@/constants/orderStatus';
import WageSlipPrintModal from './WageSlipPrintModal';
import { PrinterOutlined, SearchOutlined, DownloadOutlined } from '@ant-design/icons';
import { intelligenceApi } from '@/services/intelligence/intelligenceApi';
import type { WorkerEfficiencyItem } from '@/services/intelligence/intelligenceApi';
import { readPageSize } from '@/utils/pageSizeStore';
import { usePersistentSort } from '@/hooks/usePersistentSort';
import { usePersistentState } from '@/hooks/usePersistentState';

const PayrollOperatorSummary: React.FC = () => {
    const { message } = App.useApp();
    const [searchParams] = useSearchParams();
    const [activeTab, setActiveTab] = usePersistentState<string>('payroll-operator-active-tab', 'detail');
    const [keyword, setKeyword] = useState('');
    const [scanType, setScanType] = useState<string | undefined>(undefined);
    const [includeSettled, setIncludeSettled] = useState(true);
    const [dateRange, setDateRange] = useState<any>(null);

    const [rows, setRows] = useState<PayrollOperatorProcessSummaryRow[]>([]);
    const [loading, setLoading] = useState(false);
    const [smartError, setSmartError] = useState<SmartErrorInfo | null>(null);
    const hasAutoFetched = useRef(false);
    // Tab1 工序明细审核状态（已审核的 approvalId 集合）
    const [auditedDetailKeys, setAuditedDetailKeys] = useState<Set<string>>(new Set());
    // Tab1 已选中行（用于批量审核）
    const [detailSelectedKeys, setDetailSelectedKeys] = useState<string[]>([]);
    const [selectedRowKeys, setSelectedRowKeys] = useState<string[]>([]);
    const [printModalVisible, setPrintModalVisible] = useState(false);
    const [kingdeeExportFormat, setKingdeeExportFormat] = useState<string>('KINGDEE');
    const showSmartErrorNotice = useMemo(() => isSmartFeatureEnabled('smart.finance.explain.enabled'), []);

    // ── 内部工厂订单汇总 Tab 数据 ──────────────────────────────────────────
    const [internalOrders, setInternalOrders] = useState<any[]>([]);
    const [internalOrdersLoading, setInternalOrdersLoading] = useState(false);
    const [internalOrderAuditedKeys, setInternalOrderAuditedKeys] = useState<Set<string>>(new Set());
    const [internalOrderSelectedKeys, setInternalOrderSelectedKeys] = useState<string[]>([]);
    const internalOrderFetched = useRef(false);

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

    useEffect(() => {
        if (activeTab === 'internalOrders' && !internalOrderFetched.current) {
            internalOrderFetched.current = true;
            void fetchInternalOrders();
        }
    }, [activeTab, fetchInternalOrders]);

    const handleBatchAuditInternalOrders = () => {
        const keys = internalOrderSelectedKeys.filter(k => !internalOrderAuditedKeys.has(k));
        if (keys.length === 0) {
            message.warning('请选择未审核的订单');
            return;
        }
        setInternalOrderAuditedKeys(prev => new Set([...prev, ...keys]));
        setInternalOrderSelectedKeys([]);
        message.success(`已批量审核 ${keys.length} 个订单`);
    };

    const handleBatchFinalPushInternalOrders = async () => {
        if (internalOrderSelectedKeys.length === 0) {
            message.warning('请选择要终审的订单');
            return;
        }
        try {
            let pushedCount = 0;
            for (const key of internalOrderSelectedKeys) {
                const record = internalOrders.find((r: any) => String(r.orderNo || r.orderId || '') === key);
                if (!record || !internalOrderAuditedKeys.has(key)) continue;
                const orderStatus = String(record.status || '').toLowerCase();
                if (orderStatus !== 'completed' && orderStatus !== 'closed') {
                    continue;
                }
                try {
                    await api.post('/finance/wage-payment/create-payable', {
                        bizType: 'ORDER_SETTLEMENT',
                        bizId: record.orderId || record.orderNo,
                        payeeName: record.factoryName || '内部工厂',
                        amount: Number(record.totalAmount || 0),
                        description: `工厂订单结算：${record.orderNo || ''}`,
                    });
                    pushedCount++;
                } catch (err: unknown) {
                    const errMsg = err instanceof Error ? err.message : '推送失败';
                    console.warn(`订单 ${record.orderNo} 终审推送失败:`, errMsg);
                }
            }
            if (pushedCount > 0) {
                message.success(`已终审并推送 ${pushedCount} 个订单到收付款中心`);
            } else {
                message.warning('没有可推送的订单（可能订单未关单或属于内部工厂）');
            }
            setInternalOrderSelectedKeys([]);
        } catch (error: unknown) {
            message.error(error instanceof Error ? error.message : '批量终审失败');
        }
    };

    const internalOrderColumns = [
        { title: '订单号', dataIndex: 'orderNo', key: 'orderNo', width: 150, ellipsis: true },
        { title: '款号', dataIndex: 'styleNo', key: 'styleNo', width: 100, ellipsis: true },
        { title: '订单数量', dataIndex: 'orderQuantity', key: 'orderQuantity', width: 90, align: 'right' as const,
            render: (v: unknown) => Number(v || 0) },
        { title: '入库数量', dataIndex: 'warehousedQuantity', key: 'warehousedQuantity', width: 90, align: 'right' as const,
            render: (v: unknown) => Number(v || 0) },
        { title: '次品数', dataIndex: 'defectQuantity', key: 'defectQuantity', width: 70, align: 'right' as const,
            render: (v: unknown) => Number(v || 0) },
        { title: '开发单价', dataIndex: 'devCostPrice', key: 'devCostPrice', width: 100, align: 'right' as const,
            render: (v: unknown, _record: any) => {
                const price = Number(v || 0);
                if (price <= 0) return '-';
                return price.toFixed(2);
            }
        },
        { title: '开发总成本', key: 'devTotalCost', width: 110, align: 'right' as const,
            render: (_: unknown, record: any) => {
                const price = Number(record.devCostPrice || 0);
                const qty = Number(record.orderQuantity || 0);
                if (price <= 0 || qty <= 0) return '-';
                return (price * qty).toFixed(2);
            }
        },
        { title: '面辅料成本', dataIndex: 'materialCost', key: 'materialCost', width: 110, align: 'right' as const,
            render: (v: unknown) => Number(v || 0).toFixed(2) },
        { title: '生产成本', dataIndex: 'productionCost', key: 'productionCost', width: 100, align: 'right' as const,
            render: (v: unknown) => Number(v || 0).toFixed(2) },
        { title: '总金额', dataIndex: 'totalAmount', key: 'totalAmount', width: 110, align: 'right' as const,
            render: (v: unknown) => Number(v || 0).toFixed(2) },
        { title: '利润', dataIndex: 'profit', key: 'profit', width: 100, align: 'right' as const,
            render: (v: unknown) => {
                const n = Number(v || 0);
                return <span style={{ color: n >= 0 ? '#52c41a' : '#ff4d4f' }}>{n.toFixed(2)}</span>;
            }
        },
        { title: '利润率', dataIndex: 'profitMargin', key: 'profitMargin', width: 80, align: 'right' as const,
            render: (v: unknown) => {
                const n = Number(v || 0);
                return <span style={{ color: n >= 0 ? '#52c41a' : '#ff4d4f' }}>{n.toFixed(1)}%</span>;
            }
        },
        { title: '状态', dataIndex: 'status', key: 'status', width: 80, align: 'center' as const,
            render: (v: unknown) => {
                const s = String(v || '');
                const label = ORDER_STATUS_LABEL[s] || s;
                const color = ORDER_STATUS_COLOR[s] || 'default';
                return <Tag color={color}>{label}</Tag>;
            }
        },
        { title: '关单时间', dataIndex: 'completeTime', key: 'completeTime', width: 160, ellipsis: true,
            render: (v: unknown) => v ? dayjs(v as string).format('YYYY-MM-DD HH:mm') : '-',
        },
    ];

    // ── 效率排名 Tab 数据 ────────────────────────────────────────────────────
    const [workerEffList, setWorkerEffList] = useState<WorkerEfficiencyItem[]>([]);
    const [workerEffLoading, setWorkerEffLoading] = useState(false);
    const workerEffFetched = useRef(false);

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
        if (activeTab === 'efficiency') {
            void fetchWorkerEfficiency();
        }
    }, [activeTab, fetchWorkerEfficiency]);

    const reportSmartError = (title: string, reason?: string, code?: string) => {
        if (!showSmartErrorNotice) return;
        setSmartError({
            title,
            reason,
            code,
            actionText: '刷新重试',
        });
    };

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

    const toNumberOrZero = (v: unknown) => {
        const n = typeof v === 'number' ? v : Number(v);
        return Number.isFinite(n) ? n : 0;
    };

    // 明细行唯一key（与表格 rowKey 保持一致）
    const getDetailRowKey = (r: any): string =>
        [
            String(r?.orderNo || ''),
            String(r?.styleNo || ''),
            String(r?.operatorId || r?.operatorName || ''),
            String(r?.processName || ''),
            String(r?.scanType || ''),
            String(r?.color || ''),
            String(r?.size || ''),
        ].join('|');

    const getDetailApprovalId = (r: any): string => String(r?.approvalId || '').trim();

    const isDetailAudited = (r: any): boolean => {
        const approvalId = getDetailApprovalId(r);
        if (approvalId && auditedDetailKeys.has(approvalId)) {
            return true;
        }
        return String(r?.approvalStatus || '').toLowerCase() === 'approved';
    };

    const toMoneyText = (v: unknown) => {
        const n = typeof v === 'number' ? v : Number(v);
        return Number.isFinite(n) ? n.toFixed(2) : '-';
    };

    const totalQuantity = useMemo(() => rows.reduce((sum, r) => sum + toNumberOrZero((r as Record<string, unknown>)?.quantity), 0), [rows]);
    const totalAmount = useMemo(() => rows.reduce((sum, r) => sum + toNumberOrZero((r as Record<string, unknown>)?.totalAmount), 0), [rows]);

    // 排序后的明细数据
    const sortedRows = useMemo(() => {
        const sorted = [...rows];
        sorted.sort((a: any, b: any) => {
            const aVal = a[detailSortField];
            const bVal = b[detailSortField];

            // 处理时间字段
            if (detailSortField === 'startTime' || detailSortField === 'endTime') {
                const aTime = aVal ? new Date(aVal).getTime() : 0;
                const bTime = bVal ? new Date(bVal).getTime() : 0;
                return detailSortOrder === 'desc' ? bTime - aTime : aTime - bTime;
            }

            // 处理数值字段
            if (typeof aVal === 'number' && typeof bVal === 'number') {
                return detailSortOrder === 'desc' ? bVal - aVal : aVal - bVal;
            }

            // 处理字符串字段
            const aStr = String(aVal || '');
            const bStr = String(bVal || '');
            return detailSortOrder === 'desc'
                ? bStr.localeCompare(aStr, 'zh-CN')
                : aStr.localeCompare(bStr, 'zh-CN');
        });
        return sorted;
    }, [rows, detailSortField, detailSortOrder]);

    // 统一搜索关键词过滤（订单号 / 款号 / 人员 / 工序）
    const filteredRows = useMemo(() => {
        const kw = keyword.trim().toLowerCase();
        if (!kw) return sortedRows;
        return sortedRows.filter((r: any) =>
            String(r.orderNo || '').toLowerCase().includes(kw) ||
            String(r.styleNo || '').toLowerCase().includes(kw) ||
            String(r.operatorName || '').toLowerCase().includes(kw) ||
            String(r.processName || '').toLowerCase().includes(kw)
        );
    }, [sortedRows, keyword]);

    // 工资汇总数据：仅聚合已审核的明细行
    const summaryRows = useMemo(() => {
        // 只已审核的明细行才进入汇总
        const auditedRows = rows.filter(row => isDetailAudited(row));
        const grouped = auditedRows.reduce((acc, row) => {
            const name = String((row as Record<string, unknown>)?.operatorName || '').trim();
            if (!name) return acc;

            if (!acc[name]) {
                acc[name] = {
                    operatorName: name,
                    operatorId: String((row as Record<string, unknown>)?.operatorId || ''),
                    totalQuantity: 0,
                    totalAmount: 0,
                    recordCount: 0,
                    orderNos: new Set<string>(),
                    remark: '',
                    approvalTime: null,
                    paymentTime: null,
                };
            }

            acc[name].totalQuantity += toNumberOrZero((row as Record<string, unknown>)?.quantity);
            acc[name].totalAmount += toNumberOrZero((row as Record<string, unknown>)?.totalAmount);
            acc[name].recordCount += 1;

            const orderNo = String((row as Record<string, unknown>)?.orderNo || '').trim();
            if (orderNo) {
                acc[name].orderNos.add(orderNo);
            }

            return acc;
        }, {} as Record<string, any>);

        const result = Object.values(grouped).map((item: any) => ({
            operatorName: item.operatorName,
            operatorId: item.operatorId,
            totalQuantity: item.totalQuantity,
            totalAmount: item.totalAmount,
            recordCount: item.recordCount,
            orderCount: item.orderNos.size,
            remark: item.remark,
            approvalTime: item.approvalTime,
            paymentTime: item.paymentTime,
        }));

        // 按指定字段排序
        result.sort((a: any, b: any) => {
            const aVal = a[sortField];
            const bVal = b[sortField];

            // 处理时间字段
            if (sortField === 'approvalTime' || sortField === 'paymentTime') {
                const aTime = aVal ? new Date(aVal).getTime() : 0;
                const bTime = bVal ? new Date(bVal).getTime() : 0;
                return sortOrder === 'desc' ? bTime - aTime : aTime - bTime;
            }

            // 处理数值字段
            if (typeof aVal === 'number' && typeof bVal === 'number') {
                return sortOrder === 'desc' ? bVal - aVal : aVal - bVal;
            }

            // 处理字符串字段
            const aStr = String(aVal || '');
            const bStr = String(bVal || '');
            return sortOrder === 'desc'
                ? bStr.localeCompare(aStr, 'zh-CN')
                : aStr.localeCompare(bStr, 'zh-CN');
        });

        return result;
    }, [rows, sortField, sortOrder, auditedDetailKeys]);

    // 处理URL参数，自动填充筛选条件并查询
    useEffect(() => {
        const urlOrderNo = searchParams.get('orderNo');
        const urlProcessName = searchParams.get('processName');
        const urlScanType = searchParams.get('scanType');
        let timer: ReturnType<typeof setTimeout> | null = null;

        if (urlOrderNo && !hasAutoFetched.current) {
            hasAutoFetched.current = true;
            setKeyword(urlOrderNo);
            if (urlScanType) {
                setScanType(urlScanType);
            }
            timer = setTimeout(() => {
                const payload: any = {
                    orderNo: urlOrderNo,
                    styleNo: '',
                    operatorName: '',
                    processName: urlProcessName || '',
                    scanType: urlScanType || undefined,
                    includeSettled: true,
                };
                doFetchData(payload);
            }, 100);
        } else if (!hasAutoFetched.current) {
            hasAutoFetched.current = true;
            timer = setTimeout(() => {
                doFetchData();
            }, 100);
        }
        return () => { if (timer) clearTimeout(timer); };
    }, [searchParams]);

    // 当切换到工序明细tab时，若无数据则自动加载
    useEffect(() => {
        if (activeTab === 'detail' && rows.length === 0 && !loading) {
            doFetchData();
        }
    }, [activeTab]);

    const buildPayload = () => {
        const payload: Record<string, any> = {
            scanType: scanType ? String(scanType || '').trim() : undefined,
            includeSettled,
        };

        if (dateRange?.[0] && dateRange?.[1]) {
            payload.startTime = dayjs(dateRange[0]).format('YYYY-MM-DD HH:mm:ss');
            payload.endTime = dayjs(dateRange[1]).format('YYYY-MM-DD HH:mm:ss');
        }

        return payload;
    };

    // 核心查询函数，可以传入自定义 payload
    const doFetchData = async (customPayload?: unknown) => {
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
    };

    const fetchData = async () => {
        // 允许任意条件查询，不强制要求时间范围或订单号
        await doFetchData();
    };
    const reset = () => {
        setKeyword('');
        setScanType(undefined);
        setIncludeSettled(true);
        setDateRange(null);
        setRows([]);
        hasAutoFetched.current = false;
    };

    const exportToExcelFn = async () => {
        const { exportToExcel } = await import('@/utils/excelExport');
        if (activeTab === 'summary') {
            if (summaryRows.length === 0) {
                message.warning('无汇总数据可导出');
                return;
            }
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
            if (rows.length === 0) {
                message.warning('无明细数据可导出');
                return;
            }
            const formattedData = rows.map((r: any) => ({
                '订单号': String(r?.orderNo || ''),
                '款号': String(r?.styleNo || ''),
                '颜色': String(r?.color || ''),
                '尺码': String(r?.size || ''),
                '人员': String(r?.operatorName || ''),
                '工序': String(r?.processName || ''),
                '生产节点': scanTypeText(r?.scanType),
                '开始时间': r?.startTime ? dayjs(r.startTime).format('YYYY-MM-DD HH:mm:ss') : '-',
                '完成时间': r?.endTime ? dayjs(r.endTime).format('YYYY-MM-DD HH:mm:ss') : '-',
                '数量': toNumberOrZero(r?.quantity),
                '单价(元)': toNumberOrZero(r?.unitPrice),
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
        const token = localStorage.getItem('token') || '';
        const url = `/api/finance/tax-export/payroll-detail?${qs}&token=${encodeURIComponent(token)}`;
        const link = document.createElement('a');
        link.href = url;
        link.rel = 'noopener noreferrer';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        message.success('财税导出已开始下载');
    };

    // Tab1: 审核单条明细行（写库持久化）
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

    // Tab1: 批量审核已选明细行
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
            return Boolean(row && isDetailAudited(row));
        });
        const noApprovalIdRows = selectedRows.filter((row): row is PayrollOperatorProcessSummaryRow => {
            return Boolean(row && !getDetailApprovalId(row));
        });

        const eligibleRows = selectedRows.filter((row): row is PayrollOperatorProcessSummaryRow => {
            const approvalId = getDetailApprovalId(row);
            return Boolean(
                row &&
                approvalId &&
                isOrderFrozenByStatus({ status: String((row as any)?.orderStatus || '') }) &&
                !isDetailAudited(row)
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

                const approvedIds = eligibleRows
                    .map(row => getDetailApprovalId(row))
                    .filter(Boolean);

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

    // Tab2: 驳回——移除该人员所有明细的已审核标记，回流Tab1重新审核
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

    // Tab2: 终审推送单个人员工资到收付款中心
    const handleFinalPush = async (operatorName: string) => {
        const summary = summaryRows.find((r: any) => r.operatorName === operatorName);
        if (!summary) {
            message.error('未找到该人员汇总数据');
            return;
        }

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

    // Tab2: 批量终审推送到收付款中心

    const handlePrintWageSlips = () => {
        if (selectedRowKeys.length === 0) {
            message.warning('请选择需要打印工资条的人员');
            return;
        }
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
                details: details
            };
        });
    };

    const handleBatchFinalPush = async () => {
        if (selectedRowKeys.length === 0) {
            message.warning('请选择要终审推送的人员');
            return;
        }

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

    // 工资汇总表格列定义
    const summaryColumns = getSummaryColumns({
        sortField, sortOrder, handleSort, toNumberOrZero, toMoneyText,
        summaryRows, totalAmount, handleFinalPush, handleRejectOperator,
    });

    // 员工工序表格列定义
    const columns = getDetailColumns({
        detailSortField, detailSortOrder, handleDetailSort,
        toNumberOrZero, toMoneyText, auditedDetailKeys, isDetailAudited, handleAuditDetail,
    });

    return (
        <>
            <PageLayout
                title="工资结算"
                headerContent={
                    showSmartErrorNotice && smartError ? (
                        <Card size="small" className="mb-sm">
                            <SmartErrorNotice
                                error={smartError}
                                onFix={() => {
                                    void doFetchData();
                                }}
                            />
                        </Card>
                    ) : null
                }
            >

                <Card size="small" className="filter-card mb-sm">
                    <Space wrap>
                        <Input
                            placeholder="搜索订单号 / 款号 / 人员 / 工序"
                            style={{ width: 280 }}
                            allowClear
                            value={keyword}
                            onChange={(e) => setKeyword(e.target.value)}
                            prefix={<SearchOutlined style={{ color: '#bfbfbf' }} />}
                        />
                        <Select
                            placeholder="生产节点"
                            style={{ width: 140 }}
                            allowClear
                            value={scanType}
                            options={[
                                { value: 'production', label: '生产' },
                                { value: 'cutting', label: '裁剪' },
                                { value: 'procurement', label: '采购' },
                                { value: 'quality', label: '质检' },
                                { value: 'pressing', label: '大烫' },
                                { value: 'packaging', label: '包装' },
                                { value: 'warehousing', label: '入库' },
                            ]}
                            onChange={(v) => setScanType(v)}
                        />
                        <UnifiedRangePicker
                            showTime
                            value={dateRange as any}
                            onChange={(v) => setDateRange(v as any)}
                            style={{ width: 320 }}
                        />
                        <Space>
                            <span style={{ color: 'var(--neutral-text-secondary)' }}>包含已结算</span>
                            <Switch id="includeSettledSwitch" checked={includeSettled} onChange={setIncludeSettled} />
                        </Space>
                        <Button type="primary" onClick={fetchData} loading={loading}>
                            查询
                        </Button>
                        <Button onClick={reset} disabled={loading}>
                            重置
                        </Button>
                        <Button
                            onClick={exportToExcelFn}
                            disabled={loading || rows.length === 0}
                        >
                            导出Excel
                        </Button>
                        <Select
                            style={{ width: 120 }}
                            value={kingdeeExportFormat}
                            onChange={setKingdeeExportFormat}
                            options={[
                                { value: 'KINGDEE', label: '金蝶KIS' },
                                { value: 'UFIDA', label: '用友T3' },
                                { value: 'STANDARD', label: '标准格式' },
                            ]}
                        />
                        <Button
                            icon={<DownloadOutlined />}
                            onClick={handleKingdeeExport}
                            disabled={loading || rows.length === 0}
                        >
                            财税导出
                        </Button>
                    </Space>
                </Card>

                <Tabs
                    activeKey={activeTab}
                    onChange={setActiveTab}
                    items={[
                        {
                            key: 'detail',
                            label: '工序明细',
                            children: (
                                <>
                                    <Card size="small" className="mb-sm">
                                        <Space wrap>
                                            <span style={{ color: 'var(--neutral-text-secondary)' }}>行数 {rows.length}</span>
                                            <span style={{ color: 'var(--neutral-text-secondary)' }}>数量合计 {totalQuantity}</span>
                                            <span style={{ color: 'var(--neutral-text-secondary)' }}>金额合计 {totalAmount.toFixed(2)}</span>
                                            {dateRange?.[0] && dateRange?.[1] && (
                                                <span style={{ color: 'var(--neutral-text-secondary)' }}>
                                                    统计周期：{dayjs(dateRange[0]).format('YYYY-MM-DD HH:mm')} ~ {dayjs(dateRange[1]).format('YYYY-MM-DD HH:mm')}
                                                </span>
                                            )}
                                            <Button
                                                type="primary"
                                                disabled={detailSelectedKeys.length === 0}
                                                onClick={handleBatchAuditDetails}
                                            >
                                                批量审核 ({detailSelectedKeys.length})
                                            </Button>
                                        </Space>
                                    </Card>

                                    <ResizableTable
                                        storageKey="finance-payroll-operator-detail"
                                        rowKey={(r: Record<string, unknown>) =>
                                            [
                                                String(r?.orderNo || ''),
                                                String(r?.styleNo || ''),
                                                String(r?.operatorId || r?.operatorName || ''),
                                                String(r?.processName || ''),
                                                String(r?.scanType || ''),
                                                String(r?.color || ''),
                                                String(r?.size || ''),
                                            ].join('|')
                                        }
                                        rowSelection={{
                                            selectedRowKeys: detailSelectedKeys,
                                            onChange: (keys: React.Key[]) => setDetailSelectedKeys(keys as string[]),
                                            getCheckboxProps: (record: Record<string, unknown>) => ({
                                                disabled: isDetailAudited(record) || !isOrderFrozenByStatus({ status: String(record.orderStatus || '') }) || !getDetailApprovalId(record),
                                            }),
                                        }}
                                        columns={columns}
                                        dataSource={filteredRows as any}
                                        loading={loading}
                                        pagination={{
                                            showTotal: (total) => `共 ${total} 条`,
                                            showSizeChanger: true,
                                            pageSizeOptions: ['10', '20', '50', '100'],
                                            defaultPageSize: readPageSize(20),
                                        }}
                                        sticky
                                        scroll={{ x: 1600 }}
                                    />
                                </>
                            ),
                        },
                        {
                            key: 'summary',
                            label: '工资汇总',
                            children: (
                                <>
                                    <Card size="small" className="mb-sm">
                                        <Space wrap>
                                            <span style={{ color: 'var(--neutral-text-secondary)' }}>人员数 {summaryRows.length}</span>
                                            <span style={{ color: 'var(--neutral-text-secondary)' }}>总数量 {summaryRows.reduce((sum, r) => sum + toNumberOrZero(r.totalQuantity), 0)}</span>
                                            <span style={{ color: 'var(--neutral-text-secondary)' }}>总金额 {summaryRows.reduce((sum, r) => sum + toNumberOrZero(r.totalAmount), 0).toFixed(2)}</span>
                                            <Button
                                                type="primary"
                                                onClick={handleBatchFinalPush}
                                                disabled={selectedRowKeys.length === 0}
                                            >
                                                批量终审推送 ({selectedRowKeys.length})
                                            </Button>
                                            <Button
                                                icon={<PrinterOutlined />}
                                                onClick={handlePrintWageSlips}
                                                disabled={selectedRowKeys.length === 0}
                                            >
                                                打印工资条 ({selectedRowKeys.length})
                                            </Button>
                                        </Space>
                                    </Card>

                                    <ResizableTable
                                        storageKey="finance-payroll-operator-summary"
                                        rowKey={(r: Record<string, unknown>) => String(r?.operatorName || '')}
                                        rowSelection={{
                                            selectedRowKeys,
                                            onChange: (keys: React.Key[]) => setSelectedRowKeys(keys as string[]),
                                            getCheckboxProps: (record: Record<string, unknown>) => ({
                                                disabled: Boolean(record.approvalTime),
                                            }),
                                        }}
                                        columns={summaryColumns}
                                        dataSource={summaryRows as any}
                                        loading={loading}
                                        pagination={{
                                            showTotal: (total) => `共 ${total} 条`,
                                            showSizeChanger: true,
                                            pageSizeOptions: ['10', '20', '50', '100'],
                                            defaultPageSize: readPageSize(20),
                                        }}
                                        sticky
                                        scroll={{ x: 1300 }}
                                    />
                                </>
                            ),
                        },
                        {
                            key: 'internalOrders',
                            label: '订单汇总',
                            children: (
                                <>
                                    <Card size="small" className="mb-sm">
                                        <Space wrap>
                                            <span style={{ color: 'var(--neutral-text-secondary)' }}>内部工厂订单 {internalOrders.length}</span>
                                            <span style={{ color: 'var(--neutral-text-secondary)' }}>已审核 {internalOrderAuditedKeys.size}</span>
                                            <Button size="small" onClick={fetchInternalOrders} loading={internalOrdersLoading}>刷新</Button>
                                            <Button size="small" type="primary" onClick={handleBatchAuditInternalOrders}
                                                disabled={internalOrderSelectedKeys.length === 0}>批量审核</Button>
                                            <Button size="small" onClick={handleBatchFinalPushInternalOrders}
                                                disabled={internalOrderSelectedKeys.length === 0}>批量终审推送</Button>
                                        </Space>
                                    </Card>
                                    <ResizableTable
                                        storageKey="finance-payroll-internal-orders"
                                        rowKey={(r: any) => String(r.orderNo || r.orderId || '')}
                                        dataSource={internalOrders}
                                        columns={internalOrderColumns}
                                        loading={internalOrdersLoading}
                                        size="small"
                                        pagination={{ defaultPageSize: readPageSize(50), showSizeChanger: true, showTotal: (t: number) => `共 ${t} 条` }}
                                        rowSelection={{
                                            selectedRowKeys: internalOrderSelectedKeys,
                                            onChange: (keys: React.Key[]) => setInternalOrderSelectedKeys(keys as string[]),
                                            getCheckboxProps: (record: any) => ({
                                                disabled: internalOrderAuditedKeys.has(String(record.orderNo || record.orderId || '')),
                                            }),
                                        }}
                                        sticky
                                        scroll={{ x: 1700 }}
                                    />
                                </>
                            ),
                        },
                        {
                            key: 'efficiency',
                            label: '效率排名',
                            children: (
                                <WorkerEfficiencyTab
                                    list={workerEffList}
                                    loading={workerEffLoading}
                                    onRefresh={() => {
                                        workerEffFetched.current = false;
                                        void fetchWorkerEfficiency();
                                    }}
                                />
                            ),
                        },
                    ]}
                />

            </PageLayout>
                    <WageSlipPrintModal
                visible={printModalVisible}
                onClose={() => setPrintModalVisible(false)}
                workerData={getPrintData()}
                dateRange={dateRange?.[0] && dateRange?.[1] ? [dayjs(dateRange[0]).format('YYYY-MM-DD'), dayjs(dateRange[1]).format('YYYY-MM-DD')] : ['-', '-']}
            />
        </>
    );
};

export default PayrollOperatorSummary;

// ── 效率排名子组件（懒挂载，不影响主页面初始加载） ────────────────────────────────

const TREND_ICON: Record<string, { icon: string; color: string }> = {
    up:   { icon: '↑', color: '#52c41a' },
    down: { icon: '↓', color: '#ff4d4f' },
    flat: { icon: '→', color: '#8c8c8c' },
};

function ScoreCell({ value }: { value: number }) {
    const color = value >= 80 ? '#52c41a' : value >= 60 ? '#faad14' : '#ff4d4f';
    return (
        <span style={{ fontVariantNumeric: 'tabular-nums', color, fontWeight: 600 }}>
            {value}
        </span>
    );
}
function WorkerEfficiencyTab({
    list,
    loading,
    onRefresh,
}: {
    list: WorkerEfficiencyItem[];
    loading: boolean;
    onRefresh: () => void;
}) {
    const columns = [
        {
            title: '排名', key: 'rank', width: 60, align: 'center' as const,
            render: (_: unknown, __: unknown, idx: number) => {
                if (idx === 0) return <Tag color="gold"> 1</Tag>;
                if (idx === 1) return <Tag color="silver"> 2</Tag>;
                if (idx === 2) return <Tag color="orange"> 3</Tag>;
                return <span style={{ color: '#8c8c8c' }}>{idx + 1}</span>;
            },
        },
        {
            title: '姓名', dataIndex: 'workerName', key: 'name', width: 100, ellipsis: true,
        },
        {
            title: '综合得分', dataIndex: 'overallScore', key: 'overall', width: 160,
            render: (v: number) => (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Progress
                        percent={v ?? 0}
                        size="small"
                        strokeColor={v >= 80 ? '#52c41a' : v >= 60 ? '#faad14' : '#ff4d4f'}
                        format={() => <span style={{ fontSize: 11 }}>{v}</span>}
                        style={{ flex: 1, minWidth: 80 }}
                    />
                </div>
            ),
        },
        { title: '速度', dataIndex: 'speedScore',       key: 'speed',       width: 64, align: 'center' as const, render: (v: number) => <ScoreCell value={v ?? 0} /> },
        { title: '质量', dataIndex: 'qualityScore',     key: 'quality',     width: 64, align: 'center' as const, render: (v: number) => <ScoreCell value={v ?? 0} /> },
        { title: '稳定', dataIndex: 'stabilityScore',   key: 'stability',   width: 64, align: 'center' as const, render: (v: number) => <ScoreCell value={v ?? 0} /> },
        { title: '出勤', dataIndex: 'attendanceScore',  key: 'attendance',  width: 64, align: 'center' as const, render: (v: number) => <ScoreCell value={v ?? 0} /> },
        { title: '多面', dataIndex: 'versatilityScore', key: 'versatility', width: 64, align: 'center' as const, render: (v: number) => <ScoreCell value={v ?? 0} /> },
        {
            title: '最擅长工序', dataIndex: 'bestProcess', key: 'bestProcess', width: 120, ellipsis: true,
            render: (v: string) => v ? <Tag color="blue">{v}</Tag> : '-',
        },
        {
            title: '日均产量', dataIndex: 'dailyAvgOutput', key: 'output', width: 90, align: 'right' as const,
            render: (v: number) => v != null ? `${v.toFixed(1)} 件` : '-',
        },
        {
            title: '近7天', dataIndex: 'trend', key: 'trend', width: 70, align: 'center' as const,
            render: (v: string) => {
                const t = TREND_ICON[v] ?? TREND_ICON.flat;
                return <span style={{ color: t.color, fontWeight: 700, fontSize: 16 }}>{t.icon}</span>;
            },
        },
    ];

    return (
        <>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
                <Button size="small" onClick={onRefresh} loading={loading}>刷新</Button>
            </div>
            <ResizableTable
                storageKey="finance-worker-efficiency"
                rowKey={(r: Record<string, unknown>) => String(r?.workerId ?? r?.workerName ?? '')}
                columns={columns}
                dataSource={list as any}
                loading={loading}
                pagination={{ showTotal: (t) => `共 ${t} 人`, defaultPageSize: readPageSize(50), showSizeChanger: true }}
                scroll={{ x: 900 }}
                size="small"
            />
        </>
    );
}
