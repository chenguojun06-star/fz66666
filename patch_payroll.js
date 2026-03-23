const fs = require('fs');
const path = './frontend/src/modules/finance/pages/Finance/PayrollOperatorSummary/index.tsx';

let content = fs.readFileSync(path, 'utf8');

// 1. Add import
if (!content.includes('WageSlipPrintModal')) {
    content = content.replace("import WorkerPayrollAuditPopover from './WorkerPayrollAuditPopover';", "import WorkerPayrollAuditPopover from './WorkerPayrollAuditPopover';\nimport WageSlipPrintModal from './WageSlipPrintModal';\nimport { PrinterOutlined } from '@ant-design/icons';");
}

// 2. Add state
if (!content.includes('printModalVisible')) {
    const stateHookStr = "const [selectedRowKeys, setSelectedRowKeys] = useState<string[]>([]);";
    content = content.replace(stateHookStr, `${stateHookStr}\n    const [printModalVisible, setPrintModalVisible] = useState(false);`);
}

// 3. Add handlePrint method
if (!content.includes('handlePrintWageSlips')) {
    const insertAfter = "const handleBatchFinalPush = async () => {";
    const newMethod = `
    const handlePrintWageSlips = () => {
        if (selectedRowKeys.length === 0) {
            message.warning('请选择需要打印工资条的人员');
            return;
        }
        setPrintModalVisible(true);
    };

    const getPrintData = () => {
        return selectedRowKeys.map(key => {
            const summary = summaryRows.find((r: any) => r.operatorName === key);
            const details = rows.filter(r => String((r as any)?.operatorName || '') === key);
            return {
                operatorName: key,
                totalAmount: summary ? toNumberOrZero(summary.totalAmount) : 0,
                totalQuantity: summary ? toNumberOrZero(summary.totalQuantity) : 0,
                details: details
            };
        });
    };

    `;
    content = content.replace(insertAfter, newMethod + insertAfter);
}

// 4. Add Button and Modal
if (!content.includes('onClick={handlePrintWageSlips}')) {
    const btnInsertStr = `<Button
                                                type="primary"
                                                onClick={handleBatchFinalPush}
                                                disabled={selectedRowKeys.length === 0}
                                            >
                                                批量终审推送 ({selectedRowKeys.length})
                                            </Button>`;
    const btnNewStr = btnInsertStr + `
                                            <Button
                                                icon={<PrinterOutlined />}
                                                onClick={handlePrintWageSlips}
                                                disabled={selectedRowKeys.length === 0}
                                            >
                                                打印工资条 ({selectedRowKeys.length})
                                            </Button>`;
    content = content.replace(btnInsertStr, btnNewStr);
}

if (!content.includes('<WageSlipPrintModal')) {
    const modalInsertStr = "</Layout>";
    const modalNewStr = `            <WageSlipPrintModal
                visible={printModalVisible}
                onClose={() => setPrintModalVisible(false)}
                workerData={getPrintData()}
                dateRange={[startDate, endDate]}
            />
        </Layout>`;
    content = content.replace(modalInsertStr, modalNewStr);
}

fs.writeFileSync(path, content);
console.log('Patched PayrollOperatorSummary');
