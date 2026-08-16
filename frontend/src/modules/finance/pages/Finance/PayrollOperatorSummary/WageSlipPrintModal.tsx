import React, { useRef, useState } from 'react';
import { Modal, Button, Radio, Checkbox, Divider, message } from 'antd';
import { PrinterOutlined } from '@ant-design/icons';
import { useUser } from '@/utils/AuthContext';

interface WageDetail {
    key?: string;
    orderNo?: string;
    styleNo?: string;
    processName?: string;
    endTime?: string;
    quantity?: number | string;
    unitPrice?: number | string;
    totalAmount?: number | string;
}

interface WageSlipData {
    operatorName: string;
    totalAmount: number;
    totalQuantity: number;
    details: WageDetail[];
}

interface WageSlipPrintModalProps {
    visible: boolean;
    onClose: () => void;
    workerData: WageSlipData[];
    dateRange: [string, string];
}

/** 人民币金额大写转换 */
const CN_DIGITS = ['零', '壹', '贰', '叁', '肆', '伍', '陆', '柒', '捌', '玖'];

function sectionToChinese(section: number): string {
    const units = ['', '拾', '佰', '仟'];
    let str = '';
    let zeroPending = false;
    for (let i = 3; i >= 0; i--) {
        const d = Math.floor(section / Math.pow(10, i)) % 10;
        if (d === 0) {
            if (str) zeroPending = true;
        } else {
            if (zeroPending && str) str += '零';
            str += CN_DIGITS[d] + units[i];
            zeroPending = false;
        }
    }
    return str;
}

function toChineseAmount(amount: number): string {
    if (!isFinite(amount)) return '';
    const cents = Math.round(Math.abs(amount) * 100);
    if (cents === 0) return '零元整';
    let intPart = Math.floor(cents / 100);
    const jiao = Math.floor((cents % 100) / 10);
    const fen = cents % 10;
    const bigUnits = ['', '万', '亿', '万亿'];
    const sections: string[] = [];
    let si = 0;
    while (intPart > 0) {
        const sec = intPart % 10000;
        if (sec > 0) {
            let s = sectionToChinese(sec) + bigUnits[si];
            if (sections.length > 0 && sections[0] !== '零' && sec < 1000) s += '零';
            sections.unshift(s);
        } else if (sections.length > 0 && !sections[0].startsWith('零')) {
            sections.unshift('零');
        }
        intPart = Math.floor(intPart / 10000);
        si++;
    }
    let result = sections.join('') + '元';
    if (jiao === 0 && fen === 0) {
        result += '整';
    } else {
        if (jiao > 0) result += CN_DIGITS[jiao] + '角';
        else if (fen > 0) result += '零';
        if (fen > 0) result += CN_DIGITS[fen] + '分';
    }
    return result;
}

const formatMoney = (n: number | string | undefined): string => {
    const v = Number(n);
    if (!isFinite(v)) return '-';
    return v.toFixed(2);
};

const formatQty = (n: number | string | undefined): string => {
    const v = Number(n);
    if (!isFinite(v)) return '-';
    return String(Math.round(v * 100) / 100);
};

const formatDate = (dateStr?: string): string => {
    if (!dateStr) return '-';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
};

/** 简版：按订单号+款号聚合 */
interface GroupedRow {
    orderNo: string;
    styleNo: string;
    qty: number;
    amount: number;
}

function groupDetails(details: WageDetail[]): GroupedRow[] {
    const map = new Map<string, GroupedRow>();
    details.forEach(d => {
        const orderNo = d.orderNo || '-';
        const styleNo = d.styleNo || '-';
        const k = `${orderNo}||${styleNo}`;
        const qty = Number(d.quantity) || 0;
        const amount = Number(d.totalAmount) || 0;
        const exist = map.get(k);
        if (exist) {
            exist.qty += qty;
            exist.amount += amount;
        } else {
            map.set(k, { orderNo, styleNo, qty, amount });
        }
    });
    return Array.from(map.values());
}

const PRINT_STYLES = `
    .wage-slip-print-area {
        background: #fff;
    }
    .wage-slip {
        background: #fff;
        border: 1.5px solid #333;
        margin: 0 auto 24px auto;
        page-break-after: always;
        break-after: page;
    }
    .wage-slip:last-child {
        page-break-after: auto;
        break-after: auto;
        margin-bottom: 0;
    }
    .wage-slip table {
        width: 100%;
        border-collapse: collapse;
        table-layout: fixed;
    }
    /* P0 铁律：打印组件 font-family 必须以 serif 结尾 */
    .wage-slip, .wage-slip table, .wage-slip td, .wage-slip th {
        font-family: "Songti SC", "STSong", "SimSun", "Microsoft YaHei", serif;
        color: #111;
    }
    .wage-slip .slip-title {
        text-align: center;
        font-size: 17px;
        font-weight: 700;
        letter-spacing: 3px;
        padding: 12px 0 10px 0;
        border-bottom: 1.5px solid #333;
    }
    .wage-slip .slip-subtitle {
        text-align: center;
        font-size: 12px;
        color: #444;
        padding: 4px 0;
        border-bottom: 1px solid #999;
    }
    .wage-slip .slip-info td {
        border: none;
        border-bottom: 1px solid #333;
        font-size: 12px;
        padding: 7px 10px;
        background: #f7f7f7;
    }
    .wage-slip .slip-info .info-label {
        color: #555;
        margin-right: 4px;
    }
    .wage-slip .slip-info .info-value {
        font-weight: 600;
    }
    .wage-slip th.col-head {
        border: 1px solid #666;
        background: #eee;
        text-align: center;
        font-size: 12px;
        font-weight: 700;
        padding: 6px 4px;
        white-space: nowrap;
    }
    .wage-slip td.cell {
        border: 1px solid #666;
        font-size: 12px;
        padding: 5px 8px;
        word-break: break-all;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }
    .wage-slip td.num {
        text-align: right;
        font-variant-numeric: tabular-nums;
    }
    .wage-slip td.center {
        text-align: center;
    }
    .wage-slip tr.odd td.cell {
        background: #fbfbfb;
    }
    .wage-slip .slip-total td {
        border: 1px solid #666;
        border-top: 1.5px solid #333;
        font-size: 13px;
        font-weight: 700;
        padding: 8px 10px;
        background: #f2f2f2;
    }
    .wage-slip .slip-total .amount {
        color: #c0392b;
        font-size: 14px;
    }
    .wage-slip .slip-cn td {
        border: 1px solid #666;
        border-top: none;
        font-size: 11px;
        color: #333;
        padding: 4px 10px;
        background: #fafafa;
    }
    .wage-slip .slip-sign td {
        border: 1px solid #666;
        border-top: 1.5px solid #333;
        font-size: 12px;
        padding: 14px 10px 16px 10px;
        color: #111;
    }
    .wage-slip .slip-sign .sign-line {
        display: inline-block;
        min-width: 90px;
        border-bottom: 1px solid #333;
        margin: 0 6px;
    }
    .print-toolbar {
        padding: 12px 16px;
        background: var(--color-bg-container, #fafafa);
        border: 1px solid var(--color-border-secondary, #f0f0f0);
        border-radius: 8px;
        margin-bottom: 16px;
    }
    .print-toolbar .toolbar-row {
        display: flex;
        align-items: center;
        flex-wrap: wrap;
        gap: 8px;
    }
    .print-toolbar .toolbar-label {
        color: var(--color-text-secondary, #666);
        font-size: 13px;
    }
    .print-toolbar .toolbar-tip {
        font-size: 12px;
        color: var(--color-text-tertiary, #999);
        margin-top: 6px;
    }
    .wage-slip-preview {
        background: #fff;
        padding: 16px;
        border: 1px solid var(--color-border-secondary, #f0f0f0);
        border-radius: 8px;
        min-height: 200px;
        max-height: 60vh;
        overflow: auto;
    }
    @media print {
        body { -webkit-print-color-adjust: exact; print-color-adjust: exact; padding: 0; }
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
        if (visible) {
            setSelectedWorkerNames(workerData.map(w => w.operatorName));
        }
    }, [visible, workerData]);

    if (!visible) return null;

    const allWorkerNames = workerData.map(w => w.operatorName);
    const allSelected = selectedWorkerNames.length === allWorkerNames.length && allWorkerNames.length > 0;

    const companyName = user?.nickname
        ? `${user.nickname}`
        : '东方制衣厂';

    const periodText = (dateRange && dateRange[0] && dateRange[0] !== '-' && dateRange[1] && dateRange[1] !== '-')
        ? `${dateRange[0]} 至 ${dateRange[1]}`
        : '全部记录';

    const printTimeText = (() => {
        const now = new Date();
        const p = (n: number) => String(n).padStart(2, '0');
        return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())} ${p(now.getHours())}:${p(now.getMinutes())}`;
    })();

    const handlePrint = async () => {
        if (selectedWorkerNames.length === 0) {
            message.warning('请至少选择一位员工');
            return;
        }
        setPrintLoading(true);
        try {
            const printWindow = window.open('', '_blank', 'width=900,height=700');
            if (!printWindow) {
                message.error('无法打开打印窗口，请允许弹出窗口');
                return;
            }
            printWindow.document.write(`
                <html>
                    <head>
                        <title>员工计件工资条</title>
                        <style>${PRINT_STYLES}</style>
                    </head>
                    <body>
                        ${(printRef.current?.innerHTML) || ''}
                    </body>
                </html>
            `);
            printWindow.document.close();
            printWindow.focus();
            setTimeout(() => {
                printWindow.print();
            }, 300);
        } finally {
            setPrintLoading(false);
        }
    };

    /** 明细版工资条（单表结构） */
    const renderDetailSlip = (worker: WageSlipData) => {
        const rows = worker.details || [];
        return (
            <div className="wage-slip" key={`detail-${worker.operatorName}`}>
                <table>
                    <tbody>
                        <tr>
                            <td className="slip-title" colSpan={8}>{companyName} · 员工计件工资条</td>
                        </tr>
                        <tr className="slip-info">
                            <td colSpan={3}>
                                <span className="info-label">姓&nbsp;名：</span>
                                <span className="info-value">{worker.operatorName}</span>
                            </td>
                            <td colSpan={3}>
                                <span className="info-label">结算周期：</span>
                                <span className="info-value">{periodText}</span>
                            </td>
                            <td colSpan={2}>
                                <span className="info-label">打印时间：</span>
                                <span className="info-value">{printTimeText}</span>
                            </td>
                        </tr>
                        <tr>
                            <th className="col-head" style={{ width: '5%' }}>序号</th>
                            <th className="col-head" style={{ width: '20%' }}>订单号</th>
                            <th className="col-head" style={{ width: '13%' }}>款号</th>
                            <th className="col-head" style={{ width: '14%' }}>工序</th>
                            <th className="col-head" style={{ width: '12%' }}>完成日期</th>
                            <th className="col-head" style={{ width: '9%' }}>数量</th>
                            <th className="col-head" style={{ width: '12%' }}>单价(元)</th>
                            <th className="col-head" style={{ width: '15%' }}>金额(元)</th>
                        </tr>
                        {rows.length === 0 ? (
                            <tr><td className="cell center" colSpan={8} style={{ padding: '16px 0', color: '#999' }}>暂无计件记录</td></tr>
                        ) : rows.map((d, idx) => (
                            <tr key={d.key || idx} className={idx % 2 === 0 ? 'odd' : ''}>
                                <td className="cell center">{idx + 1}</td>
                                <td className="cell">{d.orderNo || '-'}</td>
                                <td className="cell">{d.styleNo || '-'}</td>
                                <td className="cell">{d.processName || '-'}</td>
                                <td className="cell center">{formatDate(d.endTime)}</td>
                                <td className="cell num">{formatQty(d.quantity)}</td>
                                <td className="cell num">{formatMoney(d.unitPrice)}</td>
                                <td className="cell num">{formatMoney(d.totalAmount)}</td>
                            </tr>
                        ))}
                        <tr className="slip-total">
                            <td colSpan={5}>
                                合计件数：<span className="amount">{formatQty(worker.totalQuantity)}</span> 件
                                <span style={{ marginLeft: 16 }}>共 <span className="amount">{rows.length}</span> 条计件记录</span>
                            </td>
                            <td colSpan={3}>
                                应发总计：<span className="amount">¥{formatMoney(worker.totalAmount)}</span>
                            </td>
                        </tr>
                        <tr className="slip-cn">
                            <td colSpan={8}>人民币大写：{toChineseAmount(worker.totalAmount)}</td>
                        </tr>
                        <tr className="slip-sign">
                            <td colSpan={4}>核算人：<span className="sign-line">&nbsp;</span></td>
                            <td colSpan={4}>员工签字：<span className="sign-line">&nbsp;</span></td>
                        </tr>
                    </tbody>
                </table>
            </div>
        );
    };

    /** 简版工资条：按订单号+款号汇总 */
    const renderSimpleSlip = (worker: WageSlipData) => {
        const grouped = groupDetails(worker.details || []);
        return (
            <div className="wage-slip" key={`simple-${worker.operatorName}`}>
                <table>
                    <tbody>
                        <tr>
                            <td className="slip-title" colSpan={5}>{companyName} · 员工计件工资条（汇总）</td>
                        </tr>
                        <tr className="slip-info">
                            <td colSpan={2}>
                                <span className="info-label">姓&nbsp;名：</span>
                                <span className="info-value">{worker.operatorName}</span>
                            </td>
                            <td colSpan={2}>
                                <span className="info-label">结算周期：</span>
                                <span className="info-value">{periodText}</span>
                            </td>
                            <td>
                                <span className="info-label">打印：</span>
                                <span className="info-value">{printTimeText}</span>
                            </td>
                        </tr>
                        <tr>
                            <th className="col-head" style={{ width: '6%' }}>序号</th>
                            <th className="col-head" style={{ width: '34%' }}>订单号</th>
                            <th className="col-head" style={{ width: '24%' }}>款号</th>
                            <th className="col-head" style={{ width: '16%' }}>完成件数</th>
                            <th className="col-head" style={{ width: '20%' }}>金额(元)</th>
                        </tr>
                        {grouped.length === 0 ? (
                            <tr><td className="cell center" colSpan={5} style={{ padding: '16px 0', color: '#999' }}>暂无计件记录</td></tr>
                        ) : grouped.map((g, idx) => (
                            <tr key={`${g.orderNo}-${g.styleNo}-${idx}`} className={idx % 2 === 0 ? 'odd' : ''}>
                                <td className="cell center">{idx + 1}</td>
                                <td className="cell">{g.orderNo}</td>
                                <td className="cell">{g.styleNo}</td>
                                <td className="cell num">{formatQty(g.qty)}</td>
                                <td className="cell num">{formatMoney(g.amount)}</td>
                            </tr>
                        ))}
                        <tr className="slip-total">
                            <td colSpan={3}>合计件数：<span className="amount">{formatQty(worker.totalQuantity)}</span> 件</td>
                            <td colSpan={2}>应发总计：<span className="amount">¥{formatMoney(worker.totalAmount)}</span></td>
                        </tr>
                        <tr className="slip-cn">
                            <td colSpan={5}>人民币大写：{toChineseAmount(worker.totalAmount)}</td>
                        </tr>
                        <tr className="slip-sign">
                            <td colSpan={5}>
                                <span style={{ marginRight: 24 }}>核算人：<span className="sign-line">&nbsp;</span></span>
                                员工签字：<span className="sign-line">&nbsp;</span>
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>
        );
    };

    const selectedWorkers = workerData.filter(w => selectedWorkerNames.includes(w.operatorName));

    return (
        <Modal
            title="打印员工计件工资条"
            open={visible}
            onCancel={onClose}
            width={1000}
            destroyOnClose
            footer={[
                <Button key="cancel" onClick={onClose}>关 闭</Button>,
                <Button key="print" type="primary" icon={<PrinterOutlined />} loading={printLoading} onClick={handlePrint}>
                    打 印
                </Button>,
            ]}
        >
            <style>{PRINT_STYLES}</style>

            {/* 打印设置工具栏 */}
            <div className="print-toolbar">
                <div className="toolbar-row">
                    <span className="toolbar-label">打印版本：</span>
                    <Radio.Group
                        size="small"
                        optionType="button"
                        buttonStyle="solid"
                        value={printVersion}
                        onChange={e => setPrintVersion(e.target.value)}
                        options={[
                            { label: '简版（订单汇总）', value: 'simple' },
                            { label: '明细版（工序明细）', value: 'detail' },
                        ]}
                    />
                    <Divider type="vertical" />
                    <span className="toolbar-label">打印人员（{selectedWorkerNames.length}/{allWorkerNames.length} 人）：</span>
                    {allWorkerNames.length > 1 && (
                        <Checkbox
                            checked={allSelected}
                            indeterminate={selectedWorkerNames.length > 0 && !allSelected}
                            onChange={e => setSelectedWorkerNames(e.target.checked ? [...allWorkerNames] : [])}
                        >
                            全选
                        </Checkbox>
                    )}
                    {allWorkerNames.map(name => (
                        <Checkbox
                            key={name}
                            checked={selectedWorkerNames.includes(name)}
                            onChange={e => {
                                setSelectedWorkerNames(prev =>
                                    e.target.checked ? [...prev, name] : prev.filter(n => n !== name)
                                );
                            }}
                        >
                            {name}
                        </Checkbox>
                    ))}
                </div>
                <div className="toolbar-tip">
                    {printVersion === 'simple'
                        ? '简版：按「订单号 + 款号」汇总计件数量与金额，一单一行，适合快速核对与张贴公示'
                        : '明细版：列出每一笔计件记录（订单、款号、工序、数量、单价、金额），适合与员工逐条对账'}
                </div>
            </div>

            {/* 打印预览（所见即所得） */}
            <div className="wage-slip-preview">
                <div ref={printRef} className="wage-slip-print-area">
                    {selectedWorkers.length === 0 ? (
                        <div style={{ textAlign: 'center', color: '#999', padding: '48px 0' }}>请选择需要打印的员工</div>
                    ) : (
                        selectedWorkers.map(worker =>
                            printVersion === 'simple' ? renderSimpleSlip(worker) : renderDetailSlip(worker)
                        )
                    )}
                </div>
            </div>
        </Modal>
    );
};

export default WageSlipPrintModal;
