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
import { isOrderFrozenByStatus } from '@/utils/api/production';
import { SCAN_TYPE_OPTIONS } from '@/components/common/ScanTypeBadge';
import { usePersistentSort } from '@/hooks/usePersistentSort';
import { internalOrderColumns } from './internalOrderColumns';
import { usePaymentAndDeduction } from './usePaymentAndDeduction';
import PaymentModal from './PaymentModal';
import DeductionModal from './DeductionModal';
import StatisticsCards from './StatisticsCards';

const PayrollOperatorSummary: React.FC = () => {
    const {
        activeTab, setActiveTab, keyword, setKeyword, scanType, setScanType,
        dateRange, setDateRange, includeSettled, setIncludeSettled,
        approvalFilter, setApprovalFilter,
        kingdeeExportFormat, setKingdeeExportFormat,
        rows, setRows, loading, smartError, showSmartErrorNotice,
        detailSortField, detailSortOrder, handleDetailSort,
        auditedDetailKeys, setAuditedDetailKeys,
        detailSelectedKeys, setDetailSelectedKeys,
        selectedRowKeys, setSelectedRowKeys,
        printModalVisible, setPrintModalVisible,
        totalAmount, filteredRows, summaryRows,
        internalOrders, internalOrdersLoading, fetchInternalOrders,
        doFetchData, fetchData, reset,
    } = usePayrollData();

    const { message } = App.useApp();

    const {
        paymentModalVisible, setPaymentModalVisible,
        deductionModalVisible, setDeductionModalVisible,
        activeRecord,
        paymentForm, deductionForm,
        paymentLoading, deductionLoading,
        handleRecordPayment, handleAddDeduction,
        submitPayment, submitDeduction,
    } = usePaymentAndDeduction({ fetchData, message });

    const { sortField: summarySortField, sortOrder: summarySortOrder, handleSort: handleSummarySort } = usePersistentSort<string, 'asc' | 'desc'>({
        storageKey: 'payroll-operator-summary',
        defaultField: 'operatorName',
        defaultOrder: 'asc',
    });

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
        handleRecordPayment, handleAddDeduction,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }), [summarySortField, summarySortOrder, handleSummarySort, toMoneyText, summaryRows, totalAmount, handleRejectOperator, handleFinalPush, handleRecordPayment, handleAddDeduction]);

    const columns = useMemo(() => getDetailColumns({
        detailSortField, detailSortOrder, handleDetailSort,
        toNumberOrZero, toMoneyText, auditedDetailKeys,
        isDetailAudited: (record: any) => isDetailAudited(record, auditedDetailKeys),
        handleAuditDetail,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }), [detailSortField, detailSortOrder, handleDetailSort, toMoneyText, auditedDetailKeys, handleAuditDetail]);

    return (
        <>
            <PageLayout
                title="工资结算"
                headerContent={
                    showSmartErrorNotice && smartError ? (
                        <Card className="mb-sm">
                            <SmartErrorNotice error={smartError} onFix={() => { void doFetchData(); }} />
                        </Card>
                    ) : null
                }
            >
                {/* ===== 统一统计卡片 ===== */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 12 }}>
                    <StatisticsCards
                        activeTab={activeTab}
                        internalOrders={internalOrders}
                        rows={rows}
                        totalAmount={totalAmount}
                    />
                </div>

                {activeTab !== 'internalOrders' && (
                <Card className="filter-card mb-sm">
                    <Space wrap>
                        <Input placeholder="搜索订单号 / 款号 / 人员" style={{ width: 240 }} allowClear value={keyword}
                            onChange={(e) => setKeyword(e.target.value)} prefix={<SearchOutlined style={{ color: 'var(--color-text-quaternary)' }} />} />
                        <Select placeholder="生产节点" style={{ width: 140 }} allowClear value={scanType}
                            options={SCAN_TYPE_OPTIONS}
                            onChange={(v) => setScanType(v)} />
                        <UnifiedRangePicker showTime value={dateRange as any} onChange={(v) => setDateRange(v as any)} style={{ width: 280 }} />
                        <Space>
                            <span style={{ color: 'var(--neutral-text-secondary)' }}>含已结算</span>
                            <Switch id="includeSettledSwitch" checked={includeSettled} onChange={setIncludeSettled} />
                        </Space>
                        <Button type="primary" ghost onClick={fetchData} loading={loading}>查询</Button>
                        <Button ghost onClick={reset} disabled={loading}>重置</Button>
                        <Button ghost onClick={exportToExcelFn} disabled={loading || rows.length === 0}>导出</Button>
                    </Space>
                </Card>
                )}

                <Tabs activeKey={activeTab} onChange={setActiveTab} items={[
                    {
                        key: 'detail', label: '工序明细',
                        children: (
                            <>
                                <Card className="mb-sm">
                                    <Space wrap>
                                        <span style={{ color: 'var(--neutral-text-secondary)' }}>行数 {filteredRows.length}</span>
                                        <span style={{ color: 'var(--neutral-text-secondary)' }}>金额合计 {totalAmount.toFixed(2)}</span>
                                        <Select
                                            style={{ width: 120 }}
                                            value={approvalFilter}
                                            onChange={setApprovalFilter}
                                            options={[
                                                { value: 'all', label: '全部' },
                                                { value: 'pending', label: '待审核' },
                                                { value: 'approved', label: '已审核' },
                                            ]}
                                        />
                                        <Button type="primary" ghost disabled={detailSelectedKeys.length === 0} onClick={handleBatchAuditDetails}>
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
                                        getCheckboxProps: (record: Record<string, unknown>) => {
                                            const isInternal = record.factoryType === 'INTERNAL';
                                            return {
                                                disabled: isDetailAudited(record, auditedDetailKeys) || (!isInternal && !isOrderFrozenByStatus({ status: String(record.orderStatus || '') })) || !getDetailApprovalId(record),
                                            };
                                        },
                                    }}
                                    columns={columns} dataSource={filteredRows as any} loading={loading}
                                    pagination={{ showTotal: (total) => `共 ${total} 条`, showSizeChanger: true, pageSizeOptions: ['20', '50', '100', '200'], defaultPageSize: readPageSize(20) }}
                                    sticky scroll={{ x: 1600 }}
                                    emptyDescription="暂无工序数据"
                                    emptyActionText="去扫码录入"
                                    onEmptyAction={() => { window.location.href = '/production/scan'; }}
                                    showExport={true}
                                    exportFilename="工资结算-工序明细.xlsx"
                                />
                            </>
                        ),
                    },
                    {
                        key: 'summary', label: '工资汇总',
                        children: (
                            <>
                                <Card className="mb-sm">
                                    <Space wrap>
                                        <span style={{ color: 'var(--neutral-text-secondary)' }}>人员数 {summaryRows.length}</span>
                                        <span style={{ color: 'var(--neutral-text-secondary)' }}>总金额 {summaryRows.reduce((sum, r) => sum + toNumberOrZero(r.totalAmount), 0).toFixed(2)}</span>
                                        <Button type="primary" ghost onClick={handleBatchFinalPush} disabled={selectedRowKeys.length === 0}>
                                            批量终审 ({selectedRowKeys.length})
                                        </Button>
                                        <Button ghost icon={<PrinterOutlined />} onClick={handlePrintWageSlips} disabled={selectedRowKeys.length === 0}>
                                            打印工资条
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
                                    pagination={{ showTotal: (total) => `共 ${total} 条`, showSizeChanger: true, pageSizeOptions: ['20', '50', '100', '200'], defaultPageSize: readPageSize(20) }}
                                    sticky scroll={{ x: 1300 }}
                                    emptyDescription="暂无工资汇总数据"
                                    emptyActionText="去扫码录入"
                                    onEmptyAction={() => { window.location.href = '/production/scan'; }}
                                    showExport={true}
                                    exportFilename="工资结算-工资汇总.xlsx"
                                />
                            </>
                        ),
                    },
                    {
                        key: 'internalOrders', label: '内部工厂订单',
                        children: (
                            <>
                                <Card className="mb-sm">
                                    <Space wrap>
                                        <span style={{ color: 'var(--neutral-text-secondary)' }}>订单数 {internalOrders.length}</span>
                                        <Button ghost onClick={fetchInternalOrders} disabled={internalOrdersLoading}>刷新</Button>
                                    </Space>
                                </Card>
                                <ResizableTable
                                    storageKey="finance-payroll-internal-orders"
                                    rowKey={(r: Record<string, unknown>) => String(r?.orderId || r?.orderNo || '')}
                                    columns={internalOrderColumns as any}
                                    dataSource={internalOrders as any} loading={internalOrdersLoading} emptyDescription="暂无工资数据"
                                    pagination={{ showTotal: (total) => `共 ${total} 条`, showSizeChanger: true, pageSizeOptions: ['20', '50', '100', '200'], defaultPageSize: readPageSize(20) }}
                                    sticky scroll={{ x: 1800 }}
                                    showExport={true}
                                    exportFilename="工资结算-内部工厂订单.xlsx"
                                />
                            </>
                        ),
                    },
                ]} />
            </PageLayout>
            <WageSlipPrintModal
                visible={printModalVisible}
                onClose={() => setPrintModalVisible(false)}
                workerData={getPrintData()}
                dateRange={dateRange?.[0] && dateRange?.[1] ? [dayjs(dateRange[0]).format('YYYY-MM-DD'), dayjs(dateRange[1]).format('YYYY-MM-DD')] : ['-', '-']} />

            <PaymentModal
                visible={paymentModalVisible}
                record={activeRecord}
                form={paymentForm}
                loading={paymentLoading}
                onClose={() => setPaymentModalVisible(false)}
                onOk={submitPayment}
            />

            <DeductionModal
                visible={deductionModalVisible}
                record={activeRecord}
                form={deductionForm}
                loading={deductionLoading}
                onClose={() => setDeductionModalVisible(false)}
                onOk={submitDeduction}
            />
        </>
    );
};

export default PayrollOperatorSummary;
