import React, { useRef, useState, useEffect } from 'react';
import { Modal, Button, Spin, message, Radio, Checkbox } from 'antd';
import { PrinterOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import api from '@/utils/api';
import { safePrint } from '@/utils/safePrint';

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

const PRINT_STYLES = `
    body { font-family: system-ui, -apple-system, BlinkMacSystemFont, "'Segoe UI'", Roboto, "'Helvetica Neue'", Arial, "'Noto Sans'", "'Microsoft YaHei'", "'PingFang SC'", serif; padding: 20px; }
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
`;

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

const FactoryStatementPrintModal: React.FC<FactoryStatementPrintModalProps> = ({
    visible,
    onClose,
    factoryData,
    dateRange
}) => {
    const printRef = useRef<HTMLDivElement>(null);
    const [loading, setLoading] = useState(false);
    const [detailsMap, setDetailsMap] = useState<Record<string, any[]>>({});
    const [printVersion, setPrintVersion] = useState<'simple' | 'detail'>('detail');
    const [selectedFactoryIds, setSelectedFactoryIds] = useState<string[]>([]);

    useEffect(() => {
        if (visible && factoryData.length > 0) {
            setSelectedFactoryIds(factoryData.map(f => f.factoryId));
            fetchOrderDetails();
        }
    }, [visible, factoryData]);

    const fetchOrderDetails = async () => {
        setLoading(true);
        try {
            const newDetailsMap: Record<string, any[]> = {};
            for (const factory of factoryData) {
                if (!factory.orderNos || factory.orderNos.length === 0) {
                    newDetailsMap[factory.factoryId] = [];
                    continue;
                }
                const res = await api.get('/finance/finished-settlement/list', {
                    params: {
                        page: 1,
                        limit: 1000,
                        factoryId: factory.factoryId === "" ? undefined : factory.factoryId,
                        startDate: dateRange[0] !== '-' ? dateRange[0] : undefined,
                        endDate: dateRange[1] !== '-' ? dateRange[1] : undefined
                    }
                });
                if (res.data?.code === 200) {
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
        const htmlContent = `
            <html>
                <head>
                    <title>加工费对账单打印</title>
                    <style>${PRINT_STYLES}</style>
                </head>
                <body>
                    ${printContent}
                </body>
            </html>
        `;
        safePrint(htmlContent);
    };

    const handleFactoryCheck = (factoryId: string, checked: boolean) => {
        setSelectedFactoryIds(prev =>
            checked ? [...prev, factoryId] : prev.filter(id => id !== factoryId)
        );
    };

    const handleSelectAll = (checked: boolean) => {
        setSelectedFactoryIds(checked ? factoryData.map(f => f.factoryId) : []);
    };

    const selectedFactories = factoryData.filter(f => selectedFactoryIds.includes(f.factoryId));
    const getFactoryKey = (f: typeof factoryData[0]) => f.factoryId || f.factoryName;

    const renderDetailTable = (factory: typeof factoryData[0], details: any[]) => (
        <table>
            <thead>
                <tr>
                    <th>序号</th>
                    <th>生产单号</th>
                    <th>款号</th>
                    <th>交期</th>
                    <th>入库数</th>
                    <th>下单锁定单价(元)</th>
                    <th>金额(元)</th>
                </tr>
            </thead>
            <tbody>
                {details.length > 0 ? details.map((detail, idx) => (
                    <tr key={detail.orderNo || idx}>
                        <td>{idx + 1}</td>
                        <td>{detail.orderNo || '-'}</td>
                        <td>{detail.styleNo || '-'}</td>
                        <td>{(detail.warehousingEndTime || detail.deliveryDate || detail.createTime) ? dayjs(detail.warehousingEndTime || detail.deliveryDate || detail.createTime).format('MM-DD') : '-'}</td>
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
    );

    const renderSimpleTable = (factory: typeof factoryData[0], details: any[]) => {
        const uniqueOrderNos = new Set(details.map(d => d.orderNo).filter(Boolean));
        const uniqueStyleNos = new Set(details.map(d => d.styleNo).filter(Boolean));
        const totalQty = details.reduce((sum, d) => sum + (Number(d.warehousedQuantity) || 0), 0);
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
            title="打印工厂加工费对账单"
            open={visible}
            onCancel={onClose}
            width={900}
            footer={[
                <Button key="cancel" onClick={onClose}>取消</Button>,
                <Button key="print" type="primary" icon={<PrinterOutlined />} onClick={handlePrint} loading={loading} disabled={loading || selectedFactoryIds.length === 0}>
                    打印 ({selectedFactoryIds.length} 个工厂)
                </Button>
            ]}
        >
            <Spin spinning={loading} tip="正在生成对账单明细...">
                <div style={{ marginBottom: 16 }}>
                    <div style={{ marginBottom: 12, display: 'flex', alignItems: 'center', gap: 16 }}>
                        <span style={{ fontWeight: 500 }}>打印版本：</span>
                        <Radio.Group value={printVersion} onChange={e => setPrintVersion(e.target.value)}>
                            <Radio.Button value="simple">简版</Radio.Button>
                            <Radio.Button value="detail">明细版</Radio.Button>
                        </Radio.Group>
                        <span style={{ color: 'var(--neutral-text-secondary)', fontSize: 12 }}>
                            {printVersion === 'simple' ? '仅含订单号、订单数量、总价格' : '含完整结算明细信息'}
                        </span>
                    </div>
                    {factoryData.length > 1 && (
                        <div style={{ marginBottom: 8 }}>
                            <Checkbox
                                checked={selectedFactoryIds.length === factoryData.length}
                                indeterminate={selectedFactoryIds.length > 0 && selectedFactoryIds.length < factoryData.length}
                                onChange={e => handleSelectAll(e.target.checked)}
                            >
                                全选 ({factoryData.length} 个工厂)
                            </Checkbox>
                        </div>
                    )}
                    {factoryData.length > 1 && (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
                            {factoryData.map(factory => (
                                <Checkbox
                                    key={factory.factoryId || factory.factoryName}
                                    checked={selectedFactoryIds.includes(factory.factoryId)}
                                    onChange={e => handleFactoryCheck(factory.factoryId, e.target.checked)}
                                >
                                    {factory.factoryName}
                                </Checkbox>
                            ))}
                        </div>
                    )}
                </div>
                <div ref={printRef} style={{ maxHeight: '55vh', overflowY: 'auto', paddingRight: 10 }}>
                    {selectedFactories.map((factory) => {
                        const details = detailsMap[factory.factoryId] || [];
                        return (
                            <div key={getFactoryKey(factory)} className="slip-container">
                                <div className="header">{factory.factoryName}</div>
                                <div className="sub-header">加工费结算对账单{printVersion === 'simple' ? '（简版）' : ''}</div>
                                <div className="info-row">
                                    <span><strong>结算周期：</strong>{dateRange[0]} 至 {dateRange[1]}</span>
                                    <span><strong>打印时间：</strong>{dayjs().format('YYYY-MM-DD')}</span>
                                </div>
                                {printVersion === 'detail' ? renderDetailTable(factory, details) : renderSimpleTable(factory, details)}
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
                    {selectedFactories.length === 0 && (
                        <div style={{ textAlign: 'center', padding: 40, color: '#999' }}>请先选择需要打印的工厂</div>
                    )}
                </div>
            </Spin>
        </Modal>
    );
};

export default FactoryStatementPrintModal;
