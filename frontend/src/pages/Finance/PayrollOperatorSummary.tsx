import React, { useMemo, useState } from 'react';
import { Button, Card, DatePicker, Input, Select, Space, Switch, message } from 'antd';
import Layout from '../../components/Layout';
import ResizableTable from '../../components/common/ResizableTable';
import api, { unwrapApiData } from '../../utils/api';
import type { PayrollOperatorProcessSummaryRow } from '../../types/finance';
import dayjs from 'dayjs';

const { RangePicker } = DatePicker;

const PayrollOperatorSummary: React.FC = () => {
    const [orderNo, setOrderNo] = useState('');
    const [styleNo, setStyleNo] = useState('');
    const [operatorName, setOperatorName] = useState('');
    const [processName, setProcessName] = useState('');
    const [scanType, setScanType] = useState<string | undefined>(undefined);
    const [includeSettled, setIncludeSettled] = useState(true);
    const [dateRange, setDateRange] = useState<any>(null);

    const [rows, setRows] = useState<PayrollOperatorProcessSummaryRow[]>([]);
    const [loading, setLoading] = useState(false);

    const toNumberOrZero = (v: any) => {
        const n = typeof v === 'number' ? v : Number(v);
        return Number.isFinite(n) ? n : 0;
    };

    const toMoneyText = (v: any) => {
        const n = typeof v === 'number' ? v : Number(v);
        return Number.isFinite(n) ? n.toFixed(2) : '-';
    };

    const totalQuantity = useMemo(() => rows.reduce((sum, r) => sum + toNumberOrZero((r as any)?.quantity), 0), [rows]);
    const totalAmount = useMemo(() => rows.reduce((sum, r) => sum + toNumberOrZero((r as any)?.totalAmount), 0), [rows]);

    const scanTypeText = (raw: any) => {
        const v = String(raw || '').trim();
        if (!v) return '-';
        if (v === 'production') return '生产';
        if (v === 'cutting') return '裁剪';
        return v;
    };

    const buildPayload = () => {
        const payload: any = {
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

    const fetchData = async () => {
        const hasOrderNo = Boolean(String(orderNo || '').trim());
        const hasRange = Boolean(dateRange?.[0] && dateRange?.[1]);
        if (!hasOrderNo && !hasRange) {
            message.warning('请至少选择时间范围或填写订单号');
            return;
        }

        setLoading(true);
        try {
            const res = await api.post<any>('/finance/payroll-settlement/operator-summary', buildPayload());
            const data = unwrapApiData<PayrollOperatorProcessSummaryRow[]>(res, '获取人员工序统计失败');
            setRows(Array.isArray(data) ? data : []);
        } catch (e: any) {
            message.error(String(e?.message || '获取人员工序统计失败'));
            setRows([]);
        } finally {
            setLoading(false);
        }
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
    };

    const columns: any[] = [
        { title: '订单号', dataIndex: 'orderNo', key: 'orderNo', width: 140, ellipsis: true },
        { title: '款号', dataIndex: 'styleNo', key: 'styleNo', width: 120, ellipsis: true },
        { title: '人员', dataIndex: 'operatorName', key: 'operatorName', width: 140, ellipsis: true },
        { title: '工序', dataIndex: 'processName', key: 'processName', width: 160, ellipsis: true },
        { title: '类型', dataIndex: 'scanType', key: 'scanType', width: 90, render: (v: any) => scanTypeText(v) },
        {
            title: '数量',
            dataIndex: 'quantity',
            key: 'quantity',
            width: 90,
            align: 'right' as const,
            render: (v: any) => {
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
            render: (v: any) => toMoneyText(v),
        },
        {
            title: '金额(元)',
            dataIndex: 'totalAmount',
            key: 'totalAmount',
            width: 120,
            align: 'right' as const,
            render: (v: any) => toMoneyText(v),
        },
    ];

    return (
        <Layout>
            <Card className="page-card">
                <div className="page-header">
                    <h2 className="page-title">人员工序统计</h2>
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
                        <Input
                            placeholder="工序"
                            style={{ width: 160 }}
                            allowClear
                            value={processName}
                            onChange={(e) => setProcessName(e.target.value)}
                        />
                        <Select
                            placeholder="类型"
                            style={{ width: 140 }}
                            allowClear
                            value={scanType}
                            options={[
                                { value: 'production', label: '生产' },
                                { value: 'cutting', label: '裁剪' },
                            ]}
                            onChange={(v) => setScanType(v)}
                        />
                        <RangePicker
                            showTime
                            value={dateRange}
                            onChange={(v) => setDateRange(v as any)}
                            style={{ width: 320 }}
                        />
                        <Space>
                            <span style={{ color: '#6b7280' }}>包含已结算</span>
                            <Switch checked={includeSettled} onChange={setIncludeSettled} />
                        </Space>
                        <Button type="primary" onClick={fetchData} loading={loading}>
                            查询
                        </Button>
                        <Button onClick={reset} disabled={loading}>
                            重置
                        </Button>
                    </Space>
                </Card>

                <Card size="small" className="mb-sm">
                    <Space wrap>
                        <span style={{ color: '#6b7280' }}>行数 {rows.length}</span>
                        <span style={{ color: '#6b7280' }}>数量合计 {totalQuantity}</span>
                        <span style={{ color: '#6b7280' }}>金额合计 {totalAmount.toFixed(2)}</span>
                    </Space>
                </Card>

                <ResizableTable
                    storageKey="finance-payroll-operator-summary"
                    rowKey={(r: any) =>
                        [
                            String(r?.orderNo || ''),
                            String(r?.styleNo || ''),
                            String(r?.operatorId || r?.operatorName || ''),
                            String(r?.processName || ''),
                            String(r?.scanType || ''),
                        ].join('|')
                    }
                    columns={columns}
                    dataSource={rows as any}
                    loading={loading}
                    pagination={{
                        showSizeChanger: true,
                        pageSizeOptions: ['10', '20', '50', '100'],
                        defaultPageSize: 20,
                    }}
                    scroll={{ x: 1050 }}
                />
            </Card>
        </Layout>
    );
};

export default PayrollOperatorSummary;

