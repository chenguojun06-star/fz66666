import React, { useRef } from 'react';
import { Modal, Button } from 'antd';
import { PrinterOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';

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

const WageSlipPrintModal: React.FC<WageSlipPrintModalProps> = ({
    visible,
    onClose,
    workerData,
    dateRange
}) => {
    const printRef = useRef<HTMLDivElement>(null);

    const handlePrint = () => {
        if (!printRef.current) return;
        const printContent = printRef.current.innerHTML;
        const htmlContent = `
            <html>
                <head>
                    <title>工资条打印</title>
                    <style>
                        body { font-family: 'Microsoft YaHei', '微软雅黑', 'PingFang SC', 'Heiti SC', Arial, sans-serif; padding: 20px; }
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
                    </style>
                </head>
                <body>
                    ${printContent}
                </body>
            </html>
        `;
        const iframe = document.createElement('iframe');
        iframe.style.cssText = 'position:fixed;width:0;height:0;border:none;left:-9999px;top:-9999px';
        document.body.appendChild(iframe);
        const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
        if (iframeDoc) {
            iframeDoc.open('text/html', 'replace');
            iframeDoc.write(htmlContent);
            iframeDoc.close();
            setTimeout(() => {
                iframe.contentWindow?.focus();
                iframe.contentWindow?.print();
                setTimeout(() => { try { document.body.removeChild(iframe); } catch {} }, 1000);
            }, 500);
        }
    };

    return (
        <Modal
            title="打印工资条"
            open={visible}
            onCancel={onClose}
            width={800}
            footer={[
                <Button key="cancel" onClick={onClose}>取消</Button>,
                <Button key="print" type="primary" icon={<PrinterOutlined />} onClick={handlePrint}>
                    打印
                </Button>
            ]}
        >
            <div ref={printRef} style={{ maxHeight: '60vh', overflowY: 'auto', paddingRight: 10 }}>
                {workerData.map((worker, index) => (
                    <div key={index} className="slip-container">
                        <div className="header">员工计件工资条</div>
                        <div className="info-row">
                            <span><strong>姓名：</strong>{worker.operatorName}</span>
                            <span><strong>结算周期：</strong>{dateRange[0]} 至 {dateRange[1]}</span>
                            <span><strong>打印时间：</strong>{dayjs().format('YYYY-MM-DD HH:mm')}</span>
                        </div>
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
                                {worker.details.map((detail, idx) => (
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
                {workerData.length === 0 && (
                    <div style={{ textAlign: 'center', padding: 40, color: '#999' }}>请先选择需要打印的人员</div>
                )}
            </div>
        </Modal>
    );
};

export default WageSlipPrintModal;
