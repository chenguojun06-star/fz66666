import React, { useRef, useState } from 'react';
import { Modal, Button, Radio, Checkbox } from 'antd';
import { PrinterOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { safePrint } from '@/utils/safePrint';

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
    body { font-family: system-ui, -apple-system, BlinkMacSystemFont, "'Segoe UI'", Roboto, "'Helvetica Neue'", Arial, "'Noto Sans'", "'Microsoft YaHei'", "'PingFang SC'", serif; padding: 20px; }
    .slip-container {
        border: 1px solid #000;
        margin-bottom: 30px;
        padding: 15px;
        page-break-inside: avoid;
    }
    .header { text-align: center; font-size: 18px; font-weight: bold; margin-bottom: 10px; border-bottom: 2px solid #000; padding-bottom: 10px; }
    .info-row { display: flex; justify-content: space-between; margin-bottom: 10px; font-size: 14px; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 10px; font-size: 12px; }
    th, td { border: 1px solid #000; padding: 6px; text-align: center; }
    th { background-color: #f0f0f0; }
    .footer { display: flex; justify-content: space-between; font-size: 14px; font-weight: bold; margin-top: 10px; }
    .sign-area { display: flex; justify-content: space-between; margin-top: 30px; font-size: 14px; }
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
    const [selectedWorkerNames, setSelectedWorkerNames] = useState<string[]>([]);

    React.useEffect(() => {
        if (visible && workerData.length > 0) {
            setSelectedWorkerNames(workerData.map(w => w.operatorName));
        }
    }, [visible, workerData]);

    const handlePrint = () => {
        if (!printRef.current) return;
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
        <table>
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
            <table>
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
        <Modal
            title="打印工资条"
            open={visible}
            onCancel={onClose}
            width={800}
            footer={[
                <Button key="cancel" onClick={onClose}>取消</Button>,
                <Button key="print" type="primary" icon={<PrinterOutlined />} onClick={handlePrint} disabled={selectedWorkerNames.length === 0}>
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
                    <span style={{ color: 'var(--neutral-text-secondary)', fontSize: 12 }}>
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
                        <div className="header">员工计件工资条{printVersion === 'simple' ? '（简版）' : ''}</div>
                        <div className="info-row">
                            <span><strong>姓名：</strong>{worker.operatorName}</span>
                            <span><strong>结算周期：</strong>{dateRange[0]} 至 {dateRange[1]}</span>
                            <span><strong>打印时间：</strong>{dayjs().format('YYYY-MM-DD HH:mm')}</span>
                        </div>
                        {printVersion === 'detail' ? renderDetailTable(worker.details) : renderSimpleTable(worker.details)}
                        <div className="footer">
                            <span>合计总件数：{worker.totalQuantity} 件</span>
                            <span>应发总计：¥{Number(worker.totalAmount).toFixed(2)}</span>
                        </div>
                        <div className="sign-area">
                            <span>核算人：_____________</span>
                            <span>员工签字：_____________</span>
                        </div>
                    </div>
                ))}
                {selectedWorkers.length === 0 && (
                    <div style={{ textAlign: 'center', padding: 40, color: '#999' }}>请先选择需要打印的人员</div>
                )}
            </div>
        </Modal>
    );
};

export default WageSlipPrintModal;
