import React, { useMemo, useState } from 'react';
import { App, Button, Card, Form, Input, InputNumber, Modal, Select, Space, Switch, Tabs, Tag, Tooltip } from 'antd';
import { UnifiedRangePicker } from '@/components/common/UnifiedDatePicker';
import PageLayout from '@/components/common/PageLayout';
import ResizableTable from '@/components/common/ResizableTable';
import ResizableModal from '@/components/common/ResizableModal';
import dayjs from 'dayjs';
import SmartErrorNotice from '@/smart/components/SmartErrorNotice';
import { getSummaryColumns, getDetailColumns } from './payrollOperatorColumns';
import WageSlipPrintModal from './WageSlipPrintModal';
import { PrinterOutlined, SearchOutlined, DownloadOutlined } from '@ant-design/icons';
import { readPageSize } from '@/utils/pageSizeStore';
import { usePayrollData, toNumberOrZero, toMoneyText, getDetailRowKey, getDetailApprovalId, isDetailAudited } from './usePayrollData';
import { statusMap } from '@/modules/finance/pages/FinanceCenter/useSettlementData';
import { usePayrollActions } from './usePayrollActions';
import WorkerEfficiencyTab from './WorkerEfficiencyTab';
import { isOrderFrozenByStatus } from '@/utils/api/production';
import { SCAN_TYPE_OPTIONS } from '@/components/common/ScanTypeBadge';
import { usePersistentSort } from '@/hooks/usePersistentSort';
import api from '@/utils/api';

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
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        totalQuantity, totalAmount, sortedRows, filteredRows, summaryRows,
        internalOrders, internalOrdersLoading, fetchInternalOrders,
        workerEffList, workerEffLoading, workerEffFetched, fetchWorkerEfficiency,
        doFetchData, fetchData, reset,
    } = usePayrollData();

    const { message } = App.useApp();

    const [paymentModalVisible, setPaymentModalVisible] = useState(false);
    const [deductionModalVisible, setDeductionModalVisible] = useState(false);
    const [activeRecord, setActiveRecord] = useState<Record<string, unknown> | null>(null);
    const [paymentForm] = Form.useForm();
    const [deductionForm] = Form.useForm();
    const [paymentLoading, setPaymentLoading] = useState(false);
    const [deductionLoading, setDeductionLoading] = useState(false);

    const handleRecordPayment = (record: Record<string, unknown>) => {
        setActiveRecord(record);
        paymentForm.resetFields();
        paymentForm.setFieldsValue({ amount: toNumberOrZero(record.remainingAmount) });
        setPaymentModalVisible(true);
    };

    const handleAddDeduction = (record: Record<string, unknown>) => {
        setActiveRecord(record);
        deductionForm.resetFields();
        setDeductionModalVisible(true);
    };

    const submitPayment = async () => {
        try {
            const values = await paymentForm.validateFields();
            if (!activeRecord?.id) { message.error('缺少结算记录ID'); return; }
            setPaymentLoading(true);
            await api.post(`/finance/payroll-settlement/${String(activeRecord.id)}/payment`, { amount: values.amount });
            message.success('打款记录已保存');
            setPaymentModalVisible(false);
            void fetchData();
        } catch (err: unknown) {
            if (err instanceof Error) message.error(err.message);
        } finally {
            setPaymentLoading(false);
        }
    };

    const submitDeduction = async () => {
        try {
            const values = await deductionForm.validateFields();
            if (!activeRecord?.id) { message.error('缺少结算记录ID'); return; }
            setDeductionLoading(true);
            await api.post(`/finance/payroll-settlement/${String(activeRecord.id)}/deduction`, {
                amount: values.amount,
                type: values.type,
                description: values.description,
            });
            message.success('扣款记录已保存');
            setDeductionModalVisible(false);
            void fetchData();
        } catch (err: unknown) {
            if (err instanceof Error) message.error(err.message);
        } finally {
            setDeductionLoading(false);
        }
    };

    const { sortField: summarySortField, sortOrder: summarySortOrder, handleSort: handleSummarySort } = usePersistentSort<string, 'asc' | 'desc'>({
        storageKey: 'payroll-operator-summary',
        defaultField: 'operatorName',
        defaultOrder: 'asc',
    });

    const internalOrderColumns = useMemo(() => [
        {
            title: '订单号',
            dataIndex: 'orderNo',
            key: 'orderNo',
            width: 150,
        },
        {
            title: '款号',
            dataIndex: 'styleNo',
            key: 'styleNo',
            width: 120,
        },
        {
            title: '工厂',
            dataIndex: 'factoryName',
            key: 'factoryName',
            width: 220,
            render: (_text: string, record: any) => (
                <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <Tag color="blue" style={{ margin: 0, fontSize: 10, padding: '0 4px', lineHeight: '16px', height: 16 }}>内</Tag>
                        <span>{record.factoryName || '-'}</span>
                    </div>
                    {(record.orgPath || record.parentOrgUnitName) &&
                     (record.orgPath || record.parentOrgUnitName) !== record.factoryName ? (
                        <div style={{ color: 'var(--neutral-text-secondary)', fontSize: 12 }}>
                            {record.orgPath || record.parentOrgUnitName}
                        </div>
                    ) : null}
                </div>
            ),
        },
        {
            title: '状态',
            dataIndex: 'status',
            key: 'status',
            width: 100,
            render: (status: string) => {
                const info = statusMap[status] || { text: '未知', color: 'var(--neutral-text-secondary)' };
                return (
                    <span style={{ padding: '2px 8px', fontSize: 12, backgroundColor: `${info.color}15`, color: info.color, fontWeight: 500 }}>
                        {info.text}
                    </span>
                );
            },
        },
        {
            title: '完成时间',
            dataIndex: 'completeTime',
            key: 'completeTime',
            width: 160,
            render: (val: string) => val ? val.replace('T', ' ').slice(0, 16) : '-',
        },
        {
            title: '颜色',
            dataIndex: 'colors',
            key: 'colors',
            width: 100,
            render: (val: string) => val || '-',
        },
        {
            title: '下单数',
            dataIndex: 'orderQuantity',
            key: 'orderQuantity',
            width: 100,
            align: 'right' as const,
            render: (val: number) => val?.toLocaleString() || '-',
        },
        {
            title: '入库数',
            dataIndex: 'warehousedQuantity',
            key: 'warehousedQuantity',
            width: 100,
            align: 'right' as const,
            render: (val: number) => val?.toLocaleString() || '-',
        },
        {
            title: '次品数',
            dataIndex: 'defectQuantity',
            key: 'defectQuantity',
            width: 100,
            align: 'right' as const,
            render: (val: number) => (
                <span style={{ color: val > 0 ? 'var(--color-danger)' : '#666' }}>
                    {val?.toLocaleString() || '-'}
                </span>
            ),
        },
        {
            title: (<Tooltip title="下单时锁定的加工单价"><span>下单锁定单价</span></Tooltip>),
            dataIndex: 'styleFinalPrice',
            key: 'styleFinalPrice',
            width: 150,
            align: 'right' as const,
            render: (val: number) => (
                <span style={{ fontWeight: 600, color: 'var(--primary-color)' }}>¥{val?.toFixed(2) || '0.00'}</span>
            ),
        },
        {
            title: (<Tooltip title="面辅料采购总成本（状态：已收货/已完成）"><span>面辅料成本</span></Tooltip>),
            dataIndex: 'materialCost',
            key: 'materialCost',
            width: 130,
            align: 'right' as const,
            render: (val: number) => `¥${val?.toFixed(2) || '0.00'}`,
        },
        {
            title: (<Tooltip title="生产过程中工序扫码成本总计"><span>生产成本</span></Tooltip>),
            dataIndex: 'productionCost',
            key: 'productionCost',
            width: 120,
            align: 'right' as const,
            render: (val: number) => `¥${val?.toFixed(2) || '0.00'}`,
        },
        {
            title: (<Tooltip title="次品报废损失 = 次品数 × 单件成本"><span>报废损失</span></Tooltip>),
            dataIndex: 'defectLoss',
            key: 'defectLoss',
            width: 120,
            align: 'right' as const,
            render: (val: number) => (
                <span style={{ color: val > 0 ? 'var(--color-danger)' : 'var(--neutral-text-secondary)' }}>
                    {val > 0 ? '-' : ''}¥{val?.toFixed(2) || '0.00'}
                </span>
            ),
        },
        {
            title: '总金额',
            dataIndex: 'totalAmount',
            key: 'totalAmount',
            width: 130,
            align: 'right' as const,
            render: (val: number) => (
                <span style={{ fontWeight: 600, color: 'var(--primary-color)' }}>¥{val?.toFixed(2) || '0.00'}</span>
            ),
        },
        {
            title: '利润',
            dataIndex: 'profit',
            key: 'profit',
            width: 130,
            align: 'right' as const,
            render: (val: number) => (
                <span style={{ fontWeight: 600, color: val >= 0 ? 'var(--color-success)' : 'var(--color-danger)' }}>
                    ¥{val?.toFixed(2) || '0.00'}
                </span>
            ),
        },
        {
            title: '利润率',
            dataIndex: 'profitMargin',
            key: 'profitMargin',
            width: 100,
            align: 'right' as const,
            render: (val: number) => (
                <span style={{ fontWeight: 600, color: val >= 0 ? 'var(--color-success)' : 'var(--color-danger)' }}>
                    {val !== null && val !== undefined ? `${val.toFixed(2)}%` : '-'}
                </span>
            ),
        },
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
        handleRecordPayment, handleAddDeduction,
    }), [summarySortField, summarySortOrder, handleSummarySort, toMoneyText, summaryRows, totalAmount, handleRejectOperator, handleFinalPush, handleRecordPayment, handleAddDeduction]);

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
                        <Card className="mb-sm">
                            <SmartErrorNotice error={smartError} onFix={() => { void doFetchData(); }} />
                        </Card>
                    ) : null
                }
            >
                <Card className="filter-card mb-sm">
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
                                <Card className="mb-sm">
                                    <Space wrap>
                                        <span style={{ color: 'var(--neutral-text-secondary)' }}>行数 {filteredRows.length}</span>
                                        <span style={{ color: 'var(--neutral-text-secondary)' }}>数量合计 {totalQuantity}</span>
                                        <span style={{ color: 'var(--neutral-text-secondary)' }}>金额合计 {totalAmount.toFixed(2)}</span>
                                        {dateRange?.[0] && dateRange?.[1] && (
                                            <span style={{ color: 'var(--neutral-text-secondary)' }}>
                                                统计周期：{dayjs(dateRange[0]).format('YYYY-MM-DD HH:mm')} ~ {dayjs(dateRange[1]).format('YYYY-MM-DD HH:mm')}
                                            </span>
                                        )}
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
                                <Card className="mb-sm">
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
                                <Card className="mb-sm">
                                    <Space wrap>
                                        <span style={{ color: 'var(--neutral-text-secondary)' }}>内部工厂订单 {internalOrders.length}</span>
                                        <Button onClick={fetchInternalOrders} loading={internalOrdersLoading}>刷新</Button>
                                    </Space>
                                </Card>
                                <ResizableTable
                                    storageKey="finance-payroll-internal-orders"
                                    rowKey={(r: any) => String(r.orderNo || r.orderId || '')}
                                    dataSource={internalOrders} columns={internalOrderColumns} loading={internalOrdersLoading}
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

            <ResizableModal
                title={`记录打款 — ${activeRecord?.operatorName || ''}`}
                open={paymentModalVisible}
                onCancel={() => setPaymentModalVisible(false)}
                onOk={submitPayment}
                confirmLoading={paymentLoading}
                width="30vw"
            >
                <Form form={paymentForm} layout="vertical">
                    <Form.Item label="剩余未付金额" style={{ color: 'var(--neutral-text-secondary)' }}>
                        <span style={{ fontWeight: 700, color: 'var(--color-danger)', fontSize: 16 }}>
                            ¥{toNumberOrZero(activeRecord?.remainingAmount).toFixed(2)}
                        </span>
                    </Form.Item>
                    <Form.Item name="amount" label="打款金额" rules={[{ required: true, message: '请输入打款金额' }]}>
                        <InputNumber
                            style={{ width: '100%' }}
                            min={0.01}
                            max={toNumberOrZero(activeRecord?.remainingAmount)}
                            precision={2}
                            prefix="¥"
                            placeholder="请输入打款金额"
                        />
                    </Form.Item>
                </Form>
            </ResizableModal>

            <ResizableModal
                title={`添加扣款 — ${activeRecord?.operatorName || ''}`}
                open={deductionModalVisible}
                onCancel={() => setDeductionModalVisible(false)}
                onOk={submitDeduction}
                confirmLoading={deductionLoading}
                width="40vw"
            >
                <Form form={deductionForm} layout="vertical">
                    <Form.Item name="type" label="扣款类型" rules={[{ required: true, message: '请选择扣款类型' }]}>
                        <Select placeholder="请选择扣款类型" options={[
                            { value: 'ADVANCE_DEDUCTION', label: '借支抵扣' },
                            { value: 'QUALITY_PENALTY', label: '质量罚款' },
                            { value: 'ATTENDANCE_DEDUCTION', label: '考勤扣款' },
                            { value: 'OTHER', label: '其他' },
                        ]} />
                    </Form.Item>
                    <Form.Item name="amount" label="扣款金额" rules={[{ required: true, message: '请输入扣款金额' }]}>
                        <InputNumber
                            style={{ width: '100%' }}
                            min={0.01}
                            precision={2}
                            prefix="¥"
                            placeholder="请输入扣款金额"
                        />
                    </Form.Item>
                    <Form.Item name="description" label="扣款说明">
                        <Input.TextArea rows={3} placeholder="请输入扣款说明" maxLength={200} showCount />
                    </Form.Item>
                </Form>
            </ResizableModal>
        </>
    );
};

export default PayrollOperatorSummary;
