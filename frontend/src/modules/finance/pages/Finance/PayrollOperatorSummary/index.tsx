import React, { useMemo } from 'react';
import { App, Button, Card, Input, Select, Space, Switch, Tabs } from 'antd';
import { UnifiedRangePicker } from '@/components/common/UnifiedDatePicker';
import PageLayout from '@/components/common/PageLayout';
import ResizableTable from '@/components/common/ResizableTable';
import dayjs from 'dayjs';
import SmartErrorNotice from '@/smart/components/SmartErrorNotice';
import { getSummaryColumns, getDetailColumns } from './payrollOperatorColumns';
import WageSlipPrintModal from './WageSlipPrintModal';
import { PrinterOutlined, SearchOutlined, DownloadOutlined } from '@ant-design/icons';
import { readPageSize } from '@/utils/pageSizeStore';
import { usePayrollData, toNumberOrZero, toMoneyText, getDetailRowKey, getDetailApprovalId, isDetailAudited } from './usePayrollData';
import { usePayrollActions } from './usePayrollActions';
import WorkerEfficiencyTab from './WorkerEfficiencyTab';
import { isOrderFrozenByStatus } from '@/utils/api/production';
import { SCAN_TYPE_OPTIONS } from '@/components/common/ScanTypeBadge';
import { usePersistentSort } from '@/hooks/usePersistentSort';

const PayrollOperatorSummary: React.FC = () => {
    const {
        activeTab, setActiveTab, keyword, setKeyword, scanType, setScanType,
        dateRange, setDateRange, includeSettled, setIncludeSettled,
        kingdeeExportFormat, setKingdeeExportFormat,
        rows, setRows, loading, smartError, showSmartErrorNotice,
        detailSortField, detailSortOrder, handleDetailSort,
        auditedDetailKeys, setAuditedDetailKeys,
        detailSelectedKeys, setDetailSelectedKeys,
        selectedRowKeys, setSelectedRowKeys,
        printModalVisible, setPrintModalVisible,
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        totalQuantity, totalAmount, sortedRows, filteredRows, summaryRows,
        internalOrders, internalOrdersLoading, fetchInternalOrders,
        workerEffList, workerEffLoading, workerEffFetched, fetchWorkerEfficiency,
        doFetchData, fetchData, reset,
    } = usePayrollData();

    const { message } = App.useApp();

    const { sortField: summarySortField, sortOrder: summarySortOrder, handleSort: handleSummarySort } = usePersistentSort<string, 'asc' | 'desc'>({
        storageKey: 'payroll-operator-summary',
        defaultField: 'operatorName',
        defaultOrder: 'asc',
    });

    const internalOrderColumns = useMemo(() => [
        { title: '订单号', dataIndex: 'orderNo', key: 'orderNo', width: 160 },
        { title: '款号', dataIndex: 'styleNo', key: 'styleNo', width: 120 },
        { title: '工厂', dataIndex: 'factoryName', key: 'factoryName', width: 140 },
        { title: '总数量', dataIndex: 'totalQuantity', key: 'totalQuantity', width: 100, align: 'right' as const },
        { title: '总金额', dataIndex: 'totalAmount', key: 'totalAmount', width: 120, align: 'right' as const, render: (v: number) => toNumberOrZero(v).toFixed(2) },
        { title: '状态', dataIndex: 'status', key: 'status', width: 100 },
    ], []);

    const {
        handleAuditDetail, handleBatchAuditDetails, handleRejectOperator,
        handleFinalPush, handleBatchFinalPush,
        exportToExcelFn, handleKingdeeExport,
        handlePrintWageSlips, getPrintData,
    } = usePayrollActions({
        rows, setRows, auditedDetailKeys, setAuditedDetailKeys,
        detailSelectedKeys, setDetailSelectedKeys,
        selectedRowKeys, setSelectedRowKeys,
        summaryRows, activeTab, dateRange, kingdeeExportFormat,
        setPrintModalVisible, message,
    });

    const summaryColumns = useMemo(() => getSummaryColumns({
        sortField: summarySortField, sortOrder: summarySortOrder, handleSort: handleSummarySort,
        toNumberOrZero, toMoneyText, summaryRows, totalAmount, handleRejectOperator, handleFinalPush,
    }), [summarySortField, summarySortOrder, handleSummarySort, toMoneyText, summaryRows, totalAmount, handleRejectOperator, handleFinalPush]);

    const columns = useMemo(() => getDetailColumns({
        detailSortField, detailSortOrder, handleDetailSort,
        toNumberOrZero, toMoneyText, auditedDetailKeys,
        isDetailAudited: (record: any) => isDetailAudited(record, auditedDetailKeys),
        handleAuditDetail,
    }), [detailSortField, detailSortOrder, handleDetailSort, toMoneyText, auditedDetailKeys, handleAuditDetail]);

    return (
        <>
            <PageLayout
                title="工资结算"
                headerContent={
                    showSmartErrorNotice && smartError ? (
                        <Card size="small" className="mb-sm">
                            <SmartErrorNotice error={smartError} onFix={() => { void doFetchData(); }} />
                        </Card>
                    ) : null
                }
            >
                <Card size="small" className="filter-card mb-sm">
                    <Space wrap>
                        <Input placeholder="搜索订单号 / 款号 / 人员 / 工序" style={{ width: 280 }} allowClear value={keyword}
                            onChange={(e) => setKeyword(e.target.value)} prefix={<SearchOutlined style={{ color: '#bfbfbf' }} />} />
                        <Select placeholder="生产节点" style={{ width: 140 }} allowClear value={scanType}
                            options={SCAN_TYPE_OPTIONS}
                            onChange={(v) => setScanType(v)} />
                        <UnifiedRangePicker showTime value={dateRange as any} onChange={(v) => setDateRange(v as any)} style={{ width: 320 }} />
                        <Space>
                            <span style={{ color: 'var(--neutral-text-secondary)' }}>包含已结算</span>
                            <Switch id="includeSettledSwitch" checked={includeSettled} onChange={setIncludeSettled} />
                        </Space>
                        <Button type="primary" onClick={fetchData} loading={loading}>查询</Button>
                        <Button onClick={reset} disabled={loading}>重置</Button>
                        <Button onClick={exportToExcelFn} disabled={loading || rows.length === 0}>导出Excel</Button>
                        <Select style={{ width: 120 }} value={kingdeeExportFormat} onChange={setKingdeeExportFormat}
                            options={[{ value: 'KINGDEE', label: '金蝶KIS' }, { value: 'UFIDA', label: '用友T3' }, { value: 'STANDARD', label: '标准格式' }]} />
                        <Button icon={<DownloadOutlined />} onClick={handleKingdeeExport} disabled={loading || rows.length === 0}>财税导出</Button>
                    </Space>
                </Card>

                <Tabs activeKey={activeTab} onChange={setActiveTab} items={[
                    {
                        key: 'detail', label: '工序明细',
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
                                        <Button type="primary" disabled={detailSelectedKeys.length === 0} onClick={handleBatchAuditDetails}>
                                            批量审核 ({detailSelectedKeys.length})
                                        </Button>
                                    </Space>
                                </Card>
                                <ResizableTable
                                    storageKey="finance-payroll-operator-detail"
                                    rowKey={getDetailRowKey}
                                    rowSelection={{
                                        selectedRowKeys: detailSelectedKeys,
                                        onChange: (keys: React.Key[]) => setDetailSelectedKeys(keys as string[]),
                                        getCheckboxProps: (record: Record<string, unknown>) => ({
                                            disabled: isDetailAudited(record, auditedDetailKeys) || !isOrderFrozenByStatus({ status: String(record.orderStatus || '') }) || !getDetailApprovalId(record),
                                        }),
                                    }}
                                    columns={columns} dataSource={filteredRows as any} loading={loading}
                                    pagination={{ showTotal: (total) => `共 ${total} 条`, showSizeChanger: true, pageSizeOptions: ['10', '20', '50', '100'], defaultPageSize: readPageSize(20) }}
                                    sticky scroll={{ x: 1600 }} />
                            </>
                        ),
                    },
                    {
                        key: 'summary', label: '工资汇总',
                        children: (
                            <>
                                <Card size="small" className="mb-sm">
                                    <Space wrap>
                                        <span style={{ color: 'var(--neutral-text-secondary)' }}>人员数 {summaryRows.length}</span>
                                        <span style={{ color: 'var(--neutral-text-secondary)' }}>总数量 {summaryRows.reduce((sum, r) => sum + toNumberOrZero(r.totalQuantity), 0)}</span>
                                        <span style={{ color: 'var(--neutral-text-secondary)' }}>总金额 {summaryRows.reduce((sum, r) => sum + toNumberOrZero(r.totalAmount), 0).toFixed(2)}</span>
                                        <Button type="primary" onClick={handleBatchFinalPush} disabled={selectedRowKeys.length === 0}>
                                            批量终审推送 ({selectedRowKeys.length})
                                        </Button>
                                        <Button icon={<PrinterOutlined />} onClick={handlePrintWageSlips} disabled={selectedRowKeys.length === 0}>
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
                                        getCheckboxProps: (record: Record<string, unknown>) => ({ disabled: Boolean(record.approvalTime) }),
                                    }}
                                    columns={summaryColumns} dataSource={summaryRows as any} loading={loading}
                                    pagination={{ showTotal: (total) => `共 ${total} 条`, showSizeChanger: true, pageSizeOptions: ['10', '20', '50', '100'], defaultPageSize: readPageSize(20) }}
                                    sticky scroll={{ x: 1300 }} />
                            </>
                        ),
                    },
                    {
                        key: 'internalOrders', label: '订单汇总',
                        children: (
                            <>
                                <Card size="small" className="mb-sm">
                                    <Space wrap>
                                        <span style={{ color: 'var(--neutral-text-secondary)' }}>内部工厂订单 {internalOrders.length}</span>
                                        <Button size="small" onClick={fetchInternalOrders} loading={internalOrdersLoading}>刷新</Button>
                                    </Space>
                                </Card>
                                <ResizableTable
                                    storageKey="finance-payroll-internal-orders"
                                    rowKey={(r: any) => String(r.orderNo || r.orderId || '')}
                                    dataSource={internalOrders} columns={internalOrderColumns} loading={internalOrdersLoading} size="small"
                                    pagination={{ defaultPageSize: readPageSize(50), showSizeChanger: true, showTotal: (t: number) => `共 ${t} 条` }}
                                    sticky scroll={{ x: 1700 }} />
                            </>
                        ),
                    },
                    {
                        key: 'efficiency', label: '效率排名',
                        children: (
                            <WorkerEfficiencyTab
                                list={workerEffList}
                                loading={workerEffLoading}
                                onRefresh={() => { workerEffFetched.current = false; void fetchWorkerEfficiency(); }} />
                        ),
                    },
                ]} />
            </PageLayout>
            <WageSlipPrintModal
                visible={printModalVisible}
                onClose={() => setPrintModalVisible(false)}
                workerData={getPrintData()}
                dateRange={dateRange?.[0] && dateRange?.[1] ? [dayjs(dateRange[0]).format('YYYY-MM-DD'), dayjs(dateRange[1]).format('YYYY-MM-DD')] : ['-', '-']} />
        </>
    );
};

export default PayrollOperatorSummary;
