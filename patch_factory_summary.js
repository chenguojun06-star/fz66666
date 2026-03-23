const fs = require('fs');
const path = './frontend/src/modules/finance/pages/FinanceCenter/FactorySummaryContent.tsx';

let content = fs.readFileSync(path, 'utf8');

// 1. Add imports
if (!content.includes('FactoryStatementPrintModal')) {
    content = content.replace(
        "import ResizableTable from '@/components/common/ResizableTable';",
        "import ResizableTable from '@/components/common/ResizableTable';\nimport FactoryStatementPrintModal from './FactoryStatementPrintModal';\nimport { PrinterOutlined } from '@ant-design/icons';\nimport dayjs from 'dayjs';"
    );
}

// 2. Add State and method
if (!content.includes('printModalVisible')) {
    const insertAfter = "const [lbCollapsed, setLbCollapsed] = useState(false);";
    const insertState = `
  const [printModalVisible, setPrintModalVisible] = useState(false);

  const handlePrintStatement = () => {
    if (selectedRowKeys.length === 0) {
      return;
    }
    setPrintModalVisible(true);
  };

  const getPrintData = () => {
    return selectedRowKeys.map(key => {
      const summary = data.find((r: any) => r.factoryId === key);
      if (!summary) return null;
      return {
        factoryId: summary.factoryId,
        factoryName: summary.factoryName,
        totalAmount: summary.totalAmount,
        totalOrderQuantity: summary.totalOrderQuantity,
        orderCount: summary.orderCount,
        orderNos: summary.orderNos
      };
    }).filter(Boolean) as any[];
  };

  const getDateRange = (): [string, string] => {
    const values = form.getFieldsValue();
    if (values.dateRange && values.dateRange.length === 2) {
      return [values.dateRange[0].format('YYYY-MM-DD'), values.dateRange[1].format('YYYY-MM-DD')];
    }
    return ['-', '-'];
  };
`;
    content = content.replace(insertAfter, insertAfter + insertState);
}

// 3. Add Button
if (!content.includes('onClick={handlePrintStatement}')) {
    const btnSearchStr = `<Button
              type="primary"
              icon={<CheckCircleOutlined />}
              disabled={selectedRowKeys.length === 0}
              onClick={handleBatchApprove}
            >
              批量终审推送 ({selectedRowKeys.length})
            </Button>`;
    const btnReplaceStr = btnSearchStr + `
            <Button
              icon={<PrinterOutlined />}
              disabled={selectedRowKeys.length === 0}
              onClick={handlePrintStatement}
            >
              打印对账单 ({selectedRowKeys.length})
            </Button>`;
    content = content.replace(btnSearchStr, btnReplaceStr);
}

// 4. Add Modal
if (!content.includes('<FactoryStatementPrintModal')) {
    const modalSearchStr = "</Card>\n    </div>";
    const modalReplaceStr = `
      <FactoryStatementPrintModal
        visible={printModalVisible}
        onClose={() => setPrintModalVisible(false)}
        factoryData={getPrintData()}
        dateRange={getDateRange()}
      />
    </Card>
    </div>`;
    content = content.replace(modalSearchStr, modalReplaceStr);
}

fs.writeFileSync(path, content);
console.log('Patched FactorySummaryContent');