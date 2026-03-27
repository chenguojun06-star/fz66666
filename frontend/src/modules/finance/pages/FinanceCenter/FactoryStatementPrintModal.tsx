import React, { useRef, useState, useEffect } from 'react';
import { Modal, Button, Spin, message } from 'antd';
import { PrinterOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import api from '@/utils/api';

interface FactoryStatementPrintModalProps {
    visible: boolean;
    onClose: () => void;
    factoryData: {
        factoryId: string;
        factoryName: string;
        totalAmount: number;
        totalOrderQuantity: number;
        orderCount: number;
        orderNos: string[];
    }[];
    dateRange: [string, string];
}

const FactoryStatementPrintModal: React.FC<FactoryStatementPrintModalProps> = ({
    visible,
    onClose,
    factoryData,
    dateRange
}) => {
    const printRef = useRef<HTMLDivElement>(null);
    const [loading, setLoading] = useState(false);
    const [detailsMap, setDetailsMap] = useState<Record<string, any[]>>({});

    useEffect(() => {
        if (visible && factoryData.length > 0) {
            fetchOrderDetails();
        }
    }, [visible, factoryData]);

    const fetchOrderDetails = async () => {
        setLoading(true);
        try {
            const newDetailsMap: Record<string, any[]> = {};
            // 获取所有工厂涉及的订单详情
            for (const factory of factoryData) {
                if (!factory.orderNos || factory.orderNos.length === 0) {
                    newDetailsMap[factory.factoryId] = [];
                    continue;
                }
                // 这里可以通过 /api/finance/finished-settlement/list 查，为了简单我们可以传 orderNo 过滤
                // 如果订单很多，这里最好后端给个接口。这里我们简单循环取前几个或用列表查
                const res = await api.get('/api/finance/finished-settlement/list', {
                    params: {
                        page: 1,
                        limit: 1000,
                        factoryId: factory.factoryId === "" ? undefined : factory.factoryId,
                        startDate: dateRange[0] !== '-' ? dateRange[0] : undefined,
                        endDate: dateRange[1] !== '-' ? dateRange[1] : undefined
                    }
                });
                if (res.data?.code === 200) {
                    // 过滤出属于这个工厂且在 orderNos 中的订单
                    const records = res.data.data.records || [];
                    newDetailsMap[factory.factoryId] = records.filter((r: any) => factory.orderNos.includes(r.orderNo));
                } else {
                    newDetailsMap[factory.factoryId] = [];
                }
            }
            setDetailsMap(newDetailsMap);
        } catch (error) {
            console.error('获取订单详情失败', error);
            message.error('获取对账明细失败');
        } finally {
            setLoading(false);
        }
    };

    const handlePrint = () => {
        if (!printRef.current) return;
        const printContent = printRef.current.innerHTML;
        const printWindow = window.open('', '_blank');
        if (!printWindow) return;

        printWindow.document.write(`
            <html>
                <head>
                    <title>加工费对账单打印</title>
                    <style>
                        body { font-family: 'PingFang SC', 'Microsoft YaHei', sans-serif; padding: 20px; }
                        .slip-container { 
                            border: 1px solid #000; 
                            margin-bottom: 40px; 
                            padding: 20px;
                            page-break-after: always;
                        }
                        .slip-container:last-child {
                            page-break-after: auto;
                        }
                        .header { text-align: center; font-size: 22px; font-weight: bold; margin-bottom: 5px; }
                        .sub-header { text-align: center; font-size: 14px; margin-bottom: 20px; border-bottom: 2px solid #000; padding-bottom: 15px; }
                        .info-row { display: flex; justify-content: space-between; margin-bottom: 15px; font-size: 14px; }
                        table { width: 100%; border-collapse: collapse; margin-bottom: 15px; font-size: 13px; }
                        th, td { border: 1px solid #000; padding: 8px; text-align: center; }
                        th { background-color: #f0f0f0; }
                        .footer { display: flex; justify-content: space-between; font-size: 16px; font-weight: bold; margin-top: 15px; }
                        .amount-words { margin-top: 10px; font-size: 14px; }
                        .sign-area { display: flex; justify-content: space-between; margin-top: 50px; font-size: 14px; }
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
        `);
        printWindow.document.close();
        printWindow.focus();
        setTimeout(() => {
            printWindow.print();
            printWindow.close();
        }, 250);
    };

    // 金额转大写
    const digitUppercase = (n: number) => {
        const fraction = ['角', '分'];
        const digit = ['零', '壹', '贰', '叁', '肆', '伍', '陆', '柒', '捌', '玖'];
        const unit = [['元', '万', '亿'], ['', '拾', '佰', '仟']];
        const head = n < 0 ? '欠' : '';
        n = Math.abs(n);
        let s = '';
        for (let i = 0; i < fraction.length; i++) {
            s += (digit[Math.floor(n * 10 * Math.pow(10, i)) % 10] + fraction[i]).replace(/零./, '');
        }
        s = s || '整';
        n = Math.floor(n);
        for (let i = 0; i < unit[0].length && n > 0; i++) {
            let p = '';
            for (let j = 0; j < unit[1].length && n > 0; j++) {
                p = digit[n % 10] + unit[1][j] + p;
                n = Math.floor(n / 10);
            }
            s = p.replace(/(零.)*零$/, '').replace(/^$/, '零') + unit[0][i] + s;
        }
        return head + s.replace(/(零.)*零元/, '元').replace(/(零.)+/g, '零').replace(/^整$/, '零元整');
    };

    return (
        <Modal
            title="打印工厂加工费对账单"
            open={visible}
            onCancel={onClose}
            width={900}
            footer={[
                <Button key="cancel" onClick={onClose}>取消</Button>,
                <Button key="print" type="primary" icon={<PrinterOutlined />} onClick={handlePrint} loading={loading} disabled={loading}>
                    打印
                </Button>
            ]}
        >
            <Spin spinning={loading} tip="正在生成对账单明细...">
                <div ref={printRef} style={{ maxHeight: '65vh', overflowY: 'auto', paddingRight: 10 }}>
                    {factoryData.map((factory, index) => {
                        const details = detailsMap[factory.factoryId] || [];
                        return (
                            <div key={index} className="slip-container">
                                <div className="header">{factory.factoryName}</div>
                                <div className="sub-header">加工费结算对账单</div>
                                <div className="info-row">
                                    <span><strong>结算周期：</strong>{dateRange[0]} 至 {dateRange[1]}</span>
                                    <span><strong>打印时间：</strong>{dayjs().format('YYYY-MM-DD')}</span>
                                </div>
                                <table>
                                    <thead>
                                        <tr>
                                            <th>序号</th>
                                            <th>生产单号</th>
                                            <th>款号</th>
                                            <th>交货日期</th>
                                            <th>入库数</th>
                                            <th>下单锁定单价(元)</th>
                                            <th>金额(元)</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {details.length > 0 ? details.map((detail, idx) => (
                                            <tr key={idx}>
                                                <td>{idx + 1}</td>
                                                <td>{detail.orderNo || '-'}</td>
                                                <td>{detail.styleNo || '-'}</td>
                                                <td>{detail.createTime ? dayjs(detail.createTime).format('MM-DD') : '-'}</td>
                                                <td>{detail.warehousedQuantity || 0}</td>
                                                <td>{detail.styleFinalPrice ? Number(detail.styleFinalPrice).toFixed(2) : '0.00'}</td>
                                                <td>{detail.totalAmount ? Number(detail.totalAmount).toFixed(2) : '0.00'}</td>
                                            </tr>
                                        )) : (
                                            <tr>
                                                <td colSpan={7}>暂无明细数据（汇总金额为 ¥{Number(factory.totalAmount).toFixed(2)}）</td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                                <div className="footer">
                                    <span>合计单数：{factory.orderCount} 单</span>
                                    <span>合计入库数：{factory.totalOrderQuantity} 件</span>
                                    <span>总金额：¥{Number(factory.totalAmount).toFixed(2)}</span>
                                </div>
                                <div className="amount-words">
                                    <strong>大写金额：</strong>{digitUppercase(factory.totalAmount)}
                                </div>
                                <div className="sign-area">
                                    <span>发包方（签字盖章）：_____________</span>
                                    <span>承包方（签字盖章）：_____________</span>
                                </div>
                            </div>
                        );
                    })}
                    {factoryData.length === 0 && (
                        <div style={{ textAlign: 'center', padding: 40, color: '#999' }}>请先选择需要打印的工厂</div>
                    )}
                </div>
            </Spin>
        </Modal>
    );
};

export default FactoryStatementPrintModal;
