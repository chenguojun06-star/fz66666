import React, { useEffect, useMemo, useRef, useState } from 'react';
import { App, Button, Card, Input, Select, Space, Switch, Tabs, Tag, Tooltip } from 'antd';
import { UnifiedRangePicker } from '@/components/common/UnifiedDatePicker';
import DictAutoComplete from '@/components/common/DictAutoComplete';
import { useSearchParams } from 'react-router-dom';
import Layout from '@/components/Layout';
import ResizableTable from '@/components/common/ResizableTable';
import RowActions from '@/components/common/RowActions';
import type { RowAction } from '@/components/common/RowActions';
import SortableColumnTitle from '@/components/common/SortableColumnTitle';
import api, { unwrapApiData } from '@/utils/api';
import type { PayrollOperatorProcessSummaryRow } from '@/types/finance';
import dayjs from 'dayjs';
import SmartErrorNotice from '@/smart/components/SmartErrorNotice';
import WorkerPerformanceBadge from '@/smart/components/WorkerPerformanceBadge';
import { isSmartFeatureEnabled } from '@/smart/core/featureFlags';
import type { SmartErrorInfo } from '@/smart/core/types';

// 工具函数：创建可排序的数字列配置
const createSortableNumberColumn = (
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
const createSortableTimeColumn = (
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
    render: (v: unknown) => v ? dayjs(v as string).format('YYYY-MM-DD HH:mm:ss') : '-',
});

const PayrollOperatorSummary: React.FC = () => {
    const { message } = App.useApp();
    const [searchParams] = useSearchParams();
    const [activeTab, setActiveTab] = useState('detail');
    const [orderNo, setOrderNo] = useState('');
    const [styleNo, setStyleNo] = useState('');
    const [operatorName, setOperatorName] = useState('');
    const [processName, setProcessName] = useState('');
    const [scanType, setScanType] = useState<string | undefined>(undefined);
    const [includeSettled, setIncludeSettled] = useState(true);
    const [dateRange, setDateRange] = useState<any>(null);

    const [rows, setRows] = useState<PayrollOperatorProcessSummaryRow[]>([]);
    const [loading, setLoading] = useState(false);
    const [smartError, setSmartError] = useState<SmartErrorInfo | null>(null);
    const hasAutoFetched = useRef(false);
    const [selectedRowKeys, setSelectedRowKeys] = useState<string[]>([]);
    const showSmartErrorNotice = useMemo(() => isSmartFeatureEnabled('smart.finance.explain.enabled'), []);

    const reportSmartError = (title: string, reason?: string, code?: string) => {
        if (!showSmartErrorNotice) return;
        setSmartError({
            title,
            reason,
            code,
            actionText: '刷新重试',
        });
    };

    const [sortField, setSortField] = useState<string>('totalAmount'); // 当前排序字段
    const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc'); // 排序方向
    const [detailSortField, setDetailSortField] = useState<string>('startTime'); // 明细表排序字段
    const [detailSortOrder, setDetailSortOrder] = useState<'asc' | 'desc'>('desc'); // 明细表排序方向

    const toNumberOrZero = (v: unknown) => {
        const n = typeof v === 'number' ? v : Number(v);
        return Number.isFinite(n) ? n : 0;
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

    // 工资汇总数据：按人员聚合
    const summaryRows = useMemo(() => {
        const grouped = rows.reduce((acc, row) => {
            const name = String((row as Record<string, unknown>)?.operatorName || '').trim();
            if (!name) return acc;

            if (!acc[name]) {
                acc[name] = {
                    operatorName: name,
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
    }, [rows, sortField, sortOrder]);

    // 处理URL参数，自动填充筛选条件并查询
    useEffect(() => {
        const urlOrderNo = searchParams.get('orderNo');
        const urlProcessName = searchParams.get('processName');
        const urlScanType = searchParams.get('scanType');

        if (urlOrderNo && !hasAutoFetched.current) {
            hasAutoFetched.current = true;
            setOrderNo(urlOrderNo);
            if (urlProcessName) {
                setProcessName(urlProcessName);
            }
            if (urlScanType) {
                setScanType(urlScanType);
            }
            // 延迟执行查询，确保状态已更新
            setTimeout(() => {
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
            // 首次加载：自动查询全部数据
            hasAutoFetched.current = true;

            // 延迟执行查询
            setTimeout(() => {
                doFetchData();
            }, 100);
        }
    }, [searchParams]);

    const scanTypeText = (raw: any) => {
        const v = String(raw || '').trim();
        if (!v) return '-';
        if (v === 'production') return '生产';
        if (v === 'cutting') return '裁剪';
        if (v === 'procurement') return '采购';
        if (v === 'quality') return '质检';
        if (v === 'pressing') return '大烫';
        if (v === 'packaging') return '包装';
        if (v === 'warehousing') return '入库';
        if (v === 'sewing' || v === 'carSewing') return '车缝';
        return v;
    };

    const buildPayload = () => {
        const payload: Record<string, any> = {
            orderNo: String(orderNo || '').trim(),
            styleNo: String(styleNo || '').trim(),
            operatorName: String(operatorName || '').trim(),
            processName: String(processName || '').trim(),
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
            setRows(Array.isArray(data) ? data : []);
            if (showSmartErrorNotice) setSmartError(null);
        } catch (e: any) {
            reportSmartError('工资结算数据加载失败', String(e?.message || '获取人员工序统计失败'), 'PAYROLL_OPERATOR_SUMMARY_LOAD_FAILED');
            message.error(String(e?.message || '获取人员工序统计失败'));
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
        setOrderNo('');
        setStyleNo('');
        setOperatorName('');
        setProcessName('');
        setScanType(undefined);
        setIncludeSettled(true);
        setDateRange(null);
        setRows([]);
        hasAutoFetched.current = false;
    };

    const exportToExcel = () => {
        if (rows.length === 0) {
            message.warning('无数据可导出');
            return;
        }

        const headers = ['订单号', '款号', '颜色', '尺码', '人员', '工序', '生产节点', '开始时间', '完成时间', '数量', '单价(元)', '金额(元)'];
        const csvRows = [headers.join(',')];

        rows.forEach((row) => {
            const r = row as any;
            const csvRow = [
                String(r?.orderNo || ''),
                String(r?.styleNo || ''),
                String(r?.color || ''),
                String(r?.size || ''),
                String(r?.operatorName || ''),
                String(r?.processName || ''),
                scanTypeText(r?.scanType),
                r?.startTime ? dayjs(r.startTime).format('YYYY-MM-DD HH:mm:ss') : '-',
                r?.endTime ? dayjs(r.endTime).format('YYYY-MM-DD HH:mm:ss') : '-',
                String(toNumberOrZero(r?.quantity)),
                toMoneyText(r?.unitPrice),
                toMoneyText(r?.totalAmount),
            ].map(escapeCsvCell);
            csvRows.push(csvRow.join(','));
        });

        // 添加合计行
        csvRows.push([
            '合计', '', '', '', '', '',
            String(totalQuantity),
            '',
            totalAmount.toFixed(2),
        ].map(escapeCsvCell).join(','));

        const csvContent = '\uFEFF' + csvRows.join('\n'); // UTF-8 的 BOM 头，避免中文乱码
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        const timestamp = dayjs().format('YYYYMMDDHHmmss');
        link.download = `工资结算_${timestamp}.csv`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        message.success('导出成功');
    };

    const escapeCsvCell = (value: unknown) => {
        const text = String(value ?? '');
        if (/[\r\n",]/.test(text)) {
            return `"${text.replace(/"/g, '""')}"`;
        }
        return text;
    };

    // 单条审核 → 推送到付款中心
    const handleApprove = async (operatorName: string) => {
        // 找到该人员的汇总数据
        const summary = summaryRows.find((r: any) => r.operatorName === operatorName);
        if (!summary) {
            message.error('未找到该人员汇总数据');
            return;
        }
        try {
            await api.post('/finance/wage-payment/create-payable', {
                bizType: 'PAYROLL_SETTLEMENT',
                bizId: operatorName,
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
            message.success(`已审核 ${operatorName} 的工资并推送到付款中心`);
        } catch (error: any) {
            console.error('工资审核失败:', error);
            message.error(error?.message || '审核失败，请稍后重试');
        }
    };

    // 批量审核 → 推送到付款中心
    const handleBatchApprove = async () => {
        if (selectedRowKeys.length === 0) {
            message.warning('请选择要审核的人员');
            return;
        }

        try {
            for (const key of selectedRowKeys) {
                const summary = summaryRows.find((r: any) => r.operatorName === key);
                if (!summary) continue;
                await api.post('/finance/wage-payment/create-payable', {
                    bizType: 'PAYROLL_SETTLEMENT',
                    bizId: String(key),
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
            message.success(`已批量审核 ${selectedRowKeys.length} 人并推送到付款中心`);
            setSelectedRowKeys([]);
        } catch (error: any) {
            console.error('批量审核失败:', error);
            message.error(error?.message || '批量审核失败，请稍后重试');
        }
    };

    // 排序回调函数
    const handleSort = (field: string, order: 'asc' | 'desc') => {
        setSortField(field);
        setSortOrder(order);
    };

    // 明细表排序回调函数
    const handleDetailSort = (field: string, order: 'asc' | 'desc') => {
        setDetailSortField(field);
        setDetailSortOrder(order);
    };

    // 工资汇总表格列定义
    const summaryColumns: any[] = [
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
        createSortableNumberColumn('总数量', 'totalQuantity', sortField, sortOrder, handleSort, 120, (v) => toNumberOrZero(v) || 0),
        createSortableNumberColumn('总金额(元)', 'totalAmount', sortField, sortOrder, handleSort, 140, toMoneyText),
        createSortableNumberColumn('扫码次数', 'recordCount', sortField, sortOrder, handleSort, 120, (v) => toNumberOrZero(v) || 0),
        createSortableNumberColumn('订单数', 'orderCount', sortField, sortOrder, handleSort, 100, (v) => toNumberOrZero(v) || 0),
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
            width: 150,
            fixed: 'right' as const,
            render: (_: unknown, record: Record<string, unknown>) => {
                const approved = Boolean(record.approvalTime);
                const actions: RowAction[] = [
                    {
                        key: 'approve',
                        label: approved ? '已审核' : '审核',
                        disabled: approved,
                        onClick: () => handleApprove(String(record.operatorName))
                    }
                ];

                return <RowActions actions={actions} />;
            },
        },
    ];

    // 员工工序表格列定义
    const columns: any[] = [
        { title: '订单号', dataIndex: 'orderNo', key: 'orderNo', width: 140, ellipsis: true },
        { title: '款号', dataIndex: 'styleNo', key: 'styleNo', width: 120, ellipsis: true },
        { title: '颜色', dataIndex: 'color', key: 'color', width: 100, ellipsis: true, render: (v: unknown) => String(v || '').trim() || '-' },
        { title: '尺码', dataIndex: 'size', key: 'size', width: 80, ellipsis: true, render: (v: unknown) => String(v || '').trim() || '-' },
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
            render: (v: unknown) => {
                const processName = String(v || '').trim();
                return processName ? (
                    <span style={{ fontWeight: 600, color: 'var(--neutral-text)' }}>{processName}</span>
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
            width: 160,
            ellipsis: true,
            render: (v: unknown) => v ? dayjs(v as string).format('YYYY-MM-DD HH:mm:ss') : '-',
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
            width: 160,
            ellipsis: true,
            render: (v: unknown) => v ? dayjs(v as string).format('YYYY-MM-DD HH:mm:ss') : '-',
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
    ];

    return (
        <Layout>
            <Card className="page-card">
                {showSmartErrorNotice && smartError ? (
                    <Card size="small" className="mb-sm">
                        <SmartErrorNotice
                            error={smartError}
                            onFix={() => {
                                void doFetchData();
                            }}
                        />
                    </Card>
                ) : null}

                <div className="page-header">
                    <h2 className="page-title">工资结算</h2>
                </div>

                <Card size="small" className="filter-card mb-sm">
                    <Space wrap>
                        <Input
                            placeholder="订单号"
                            style={{ width: 180 }}
                            allowClear
                            value={orderNo}
                            onChange={(e) => setOrderNo(e.target.value)}
                        />
                        <Input
                            placeholder="款号"
                            style={{ width: 160 }}
                            allowClear
                            value={styleNo}
                            onChange={(e) => setStyleNo(e.target.value)}
                        />
                        <Input
                            placeholder="人员"
                            style={{ width: 160 }}
                            allowClear
                            value={operatorName}
                            onChange={(e) => setOperatorName(e.target.value)}
                        />
                        <DictAutoComplete
                            dictType="process_name"
                            autoCollect={false}
                            placeholder="工序"
                            style={{ width: 160 }}
                            allowClear
                            value={processName}
                            onChange={(value) => setProcessName(String(value || ''))}
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
                            <Switch checked={includeSettled} onChange={setIncludeSettled} />
                        </Space>
                        <Button type="primary" onClick={fetchData} loading={loading}>
                            查询
                        </Button>
                        <Button onClick={reset} disabled={loading}>
                            重置
                        </Button>
                        <Button
                            onClick={exportToExcel}
                            disabled={loading || rows.length === 0}
                        >
                            导出Excel
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
                                                    统计周期：{dayjs(dateRange[0]).format('YYYY-MM-DD')} ~ {dayjs(dateRange[1]).format('YYYY-MM-DD')}
                                                </span>
                                            )}
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
                                            ].join('|')
                                        }
                                        columns={columns}
                                        dataSource={sortedRows as any}
                                        loading={loading}
                                        pagination={{
                                            showTotal: (total) => `共 ${total} 条`,
                                            showSizeChanger: true,
                                            pageSizeOptions: ['10', '20', '50', '100'],
                                            defaultPageSize: 20,
                                        }}
                                        scroll={{ x: 1400 }}
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
                                                onClick={handleBatchApprove}
                                                disabled={selectedRowKeys.length === 0}
                                            >
                                                批量审核 ({selectedRowKeys.length})
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
                                            defaultPageSize: 20,
                                        }}
                                        scroll={{ x: 1300 }}
                                    />
                                </>
                            ),
                        },
                    ]}
                />


            </Card>
        </Layout>
    );
};

export default PayrollOperatorSummary;
