import React, { useRef, useState } from 'react';
import { Button, Radio, Checkbox } from 'antd';
import ResizableModal from '@/components/common/ResizableModal';
import { PrinterOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { safePrint } from '@/utils/safePrint';
import { formatMoney } from '@/utils/format';
import { useUser } from '@/utils/AuthContext';

interface WageSlipPrintModalProps {
    visible: boolean;
    onClose: () => void;
    workerData: {
        operatorName: string;
        totalAmount: number;
        totalQuantity: number;
        details: any[];
    }[];
    dateRange: [string, string];
}

const PRINT_STYLES = `
    body {
        font-family: "Microsoft YaHei", "PingFang SC", "Helvetica Neue", Arial, sans-serif;
        padding: 20px;
        color: #000;
        line-height: 1.6;
    }
    .slip-container {
        margin-bottom: 40px;
        page-break-inside: avoid;
    }
    .slip-table {
        width: 100%;
        border-collapse: collapse;
        font-size: 14px;
    }
    .slip-table th, .slip-table td {
        border: 1px solid #000;
        padding: 10px 12px;
    }
    .slip-table th {
        background-color: #eaeaea;
        font-weight: bold;
        text-align: center;
    }
    .row-title th {
        text-align: center;
        font-size: 22px;
        font-weight: bold;
        letter-spacing: 4px;
        padding: 16px 12px;
        background-color: #eaeaea;
    }
    .row-info td {
        font-size: 14px;
        padding: 10px 12px;
    }
    .row-info .label {
        font-weight: bold;
        background-color: #f5f5f5;
        text-align: right;
        width: 12%;
        white-space: nowrap;
    }
    .row-info .value {
        text-align: left;
        width: 25%;
    }
    .row-info .value-mid {
        text-align: left;
        width: 21%;
    }
    .data-table {
        width: 100%;
        border-collapse: collapse;
        font-size: 13px;
        margin: 0;
    }
    .data-table th, .data-table td {
        border: 1px solid #000;
        padding: 8px 6px;
        text-align: center;
    }
    .data-table th {
        background-color: #eaeaea;
        font-weight: bold;
    }
    .row-data-header th {
        background-color: #eaeaea;
        padding: 0;
    }
    .row-data-header th > table {
        border: none;
        margin: 0;
    }
    .row-data-header th > table th,
    .row-data-header th > table td {
        border-left: 1px solid #000;
        border-top: 0;
        border-bottom: 0;
        border-right: 0;
    }
    .row-data-header th > table th:first-child { border-left: 0; }
    .row-total td {
        font-size: 15px;
        font-weight: bold;
        background-color: #f5f5f5;
        text-align: right;
        padding: 12px;
    }
    .row-total .label {
        text-align: right;
        width: 50%;
    }
    .row-total .value {
        text-align: left;
        width: 50%;
    }
    .row-sign td {
        padding: 40px 12px 12px;
        font-size: 14px;
        text-align: left;
    }
    .row-sign .sign-line {
        display: inline-block;
        min-width: 200px;
        border-bottom: 1px solid #000;
        margin-left: 8px;
    }
    .row-empty td {
        padding: 0;
        border-left: 0;
        border-right: 0;
        height: 8px;
        background-color: #fff;
    }
    @media print {
        body { -webkit-print-color-adjust: exact; padding: 0; }
        @page { margin: 10mm; }
    }
`;

const WageSlipPrintModal: React.FC<WageSlipPrintModalProps> = ({
    visible,
    onClose,
    workerData,
    dateRange
}) => {
    const printRef = useRef<HTMLDivElement>(null);
    const [printVersion, setPrintVersion] = useState<'simple' | 'detail'>('detail');
    const [printLoading, setPrintLoading] = useState(false);
    const [selectedWorkerNames, setSelectedWorkerNames] = useState<string[]>([]);
    const { user } = useUser();

    React.useEffect(() => {
        if (visible && workerData.length > 0) {
            setSelectedWorkerNames(workerData.map(w => w.operatorName));
        }
    }, [visible, workerData]);

    const handlePrint = async () => {
        if (!printRef.current) return;
        setPrintLoading(true);
        try {
        const printContent = printRef.current.innerHTML;
        const htmlContent = `
            <html>
                <head>
                    <title>工资条打印</title>
                    <style>${PRINT_STYLES}</style>
                </head>
                <body>
                    ${printContent}
                </body>
            </html>
        `;
        safePrint(htmlContent);
        } finally { setPrintLoading(false); }
    };

    const handleWorkerCheck = (name: string, checked: boolean) => {
        setSelectedWorkerNames(prev =>
            checked ? [...prev, name] : prev.filter(n => n !== name)
        );
    };

    const handleSelectAll = (checked: boolean) => {
        setSelectedWorkerNames(checked ? workerData.map(w => w.operatorName) : []);
    };

    const selectedWorkers = workerData.filter(w => selectedWorkerNames.includes(w.operatorName));

    const renderDetailTable = (details: any[]) => (
        <table className="data-table">
            <thead>
                <tr>
                    <th>序号</th>
                    <th>订单号</th>
                    <th>款号</th>
                    <th>工序</th>
                    <th>完成时间</th>
                    <th>数量</th>
                    <th>单价(元)</th>
                    <th>金额(元)</th>
                </tr>
            </thead>
            <tbody>
                {details.map((detail, idx) => (
                    <tr key={idx}>
                        <td>{idx + 1}</td>
                        <td>{detail.orderNo || '-'}</td>
                        <td>{detail.styleNo || '-'}</td>
                        <td>{detail.processName || '-'}</td>
                        <td>{detail.endTime ? dayjs(detail.endTime).format('MM-DD') : '-'}</td>
                        <td>{detail.quantity || 0}</td>
                        <td>{detail.unitPrice ? Number(detail.unitPrice).toFixed(2) : '0.00'}</td>
                        <td>{detail.totalAmount ? Number(detail.totalAmount).toFixed(2) : '0.00'}</td>
                    </tr>
                ))}
            </tbody>
        </table>
    );

    const renderSimpleTable = (details: any[]) => {
        const uniqueOrderNos = new Set(details.map(d => d.orderNo).filter(Boolean));
        const uniqueStyleNos = new Set(details.map(d => d.styleNo).filter(Boolean));
        const totalQty = details.reduce((sum, d) => sum + (Number(d.quantity) || 0), 0);
        const totalAmt = details.reduce((sum, d) => sum + (Number(d.totalAmount) || 0), 0);
        return (
            <table className="data-table">
                <thead>
                    <tr>
                        <th>序号总数</th>
                        <th>订单号数</th>
                        <th>款式总数</th>
                        <th>总数量</th>
                        <th>总金额(元)</th>
                    </tr>
                </thead>
                <tbody>
                    <tr>
                        <td>{details.length}</td>
                        <td>{uniqueOrderNos.size}</td>
                        <td>{uniqueStyleNos.size}</td>
                        <td>{totalQty}</td>
                        <td>{totalAmt.toFixed(2)}</td>
                    </tr>
                </tbody>
            </table>
        );
    };

    return (
        <ResizableModal
            title="打印工资条"
            open={visible}
            onCancel={onClose}
            width="85vw"
            footer={[
                <Button key="cancel" onClick={onClose}>取消</Button>,
                <Button key="print" type="primary" icon={<PrinterOutlined />} onClick={() => void handlePrint()} loading={printLoading} disabled={selectedWorkerNames.length === 0}>
                    打印 ({selectedWorkerNames.length} 人)
                </Button>
            ]}
        >
            <div style={{ marginBottom: 16 }}>
                <div style={{ marginBottom: 12, display: 'flex', alignItems: 'center', gap: 16 }}>
                    <span style={{ fontWeight: 500 }}>打印版本：</span>
                    <Radio.Group value={printVersion} onChange={e => setPrintVersion(e.target.value)}>
                        <Radio.Button value="simple">简版</Radio.Button>
                        <Radio.Button value="detail">明细版</Radio.Button>
                    </Radio.Group>
                    <span style={{ color: 'var(--neutral-text-secondary)', fontSize: 14 }}>
                        {printVersion === 'simple' ? '仅含订单号、订单数量、总价格' : '含完整工序结算明细'}
                    </span>
                </div>
                {workerData.length > 1 && (
                    <div style={{ marginBottom: 8 }}>
                        <Checkbox
                            checked={selectedWorkerNames.length === workerData.length}
                            indeterminate={selectedWorkerNames.length > 0 && selectedWorkerNames.length < workerData.length}
                            onChange={e => handleSelectAll(e.target.checked)}
                        >
                            全选 ({workerData.length} 人)
                        </Checkbox>
                    </div>
                )}
                {workerData.length > 1 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
                        {workerData.map(worker => (
                            <Checkbox
                                key={worker.operatorName}
                                checked={selectedWorkerNames.includes(worker.operatorName)}
                                onChange={e => handleWorkerCheck(worker.operatorName, e.target.checked)}
                            >
                                {worker.operatorName}
                            </Checkbox>
                        ))}
                    </div>
                )}
            </div>
            <div ref={printRef} style={{ maxHeight: '55vh', overflowY: 'auto', paddingRight: 10 }}>
                {selectedWorkers.map((worker) => (
                    <div key={worker.operatorName} className="slip-container">
                        <table className="slip-table">
                            <tbody>
                                <tr className="row-title">
                                    <th colSpan={6}>
                                        {user?.tenantName ? `${user.tenantName} - ` : ''}员工计件工资条{printVersion === 'simple' ? '（简版）' : ''}
                                    </th>
                                </tr>
                                <tr className="row-info">
                                    <td className="label">姓名</td>
                                    <td className="value">{worker.operatorName}</td>
                                    <td className="label">结算周期</td>
                                    <td className="value-mid">{dateRange[0]} 至 {dateRange[1]}</td>
                                    <td className="label">打印时间</td>
                                    <td className="value-mid">{dayjs().format('YYYY-MM-DD HH:mm')}</td>
                                </tr>
                                <tr className="row-data-header">
                                    <th colSpan={6}>
                                        {printVersion === 'detail' ? renderDetailTable(worker.details) : renderSimpleTable(worker.details)}
                                    </th>
                                </tr>
                                <tr className="row-total">
                                    <td className="label">合计总件数</td>
                                    <td className="value">{worker.totalQuantity} 件</td>
                                    <td className="label">应发总计</td>
                                    <td className="value" colSpan={3}>{formatMoney(worker.totalAmount)}</td>
                                </tr>
                                <tr className="row-sign">
                                    <td colSpan={3}>核算人：<span className="sign-line">&nbsp;</span></td>
                                    <td colSpan={3}>员工签字：<span className="sign-line">&nbsp;</span></td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                ))}
                {selectedWorkers.length === 0 && (
                    <div style={{ textAlign: 'center', padding: 40, color: 'var(--color-text-tertiary)' }}>请先选择需要打印的人员</div>
                )}
            </div>
        </ResizableModal>
    );
};

export default WageSlipPrintModal;
