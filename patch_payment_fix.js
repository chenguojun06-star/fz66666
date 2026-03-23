const fs = require('fs');
const path = './frontend/src/modules/finance/pages/Finance/WagePayment/index.tsx';
let content = fs.readFileSync(path, 'utf8');

// fix export utility path
content = content.replace("import { exportToExcel } from '@/utils/exportExcel';", "");

const newExport = `import * as XLSX from 'xlsx';

export const exportToExcel = (data: any[], columns: any[], filename: string) => {
    const formattedData = data.map(item => {
        const row: any = {};
        columns.forEach(col => {
            row[col.title] = item[col.dataIndex] || '';
        });
        return row;
    });
    const worksheet = XLSX.utils.json_to_sheet(formattedData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Sheet1');
    XLSX.writeFile(workbook, \`\${filename}_\${dayjs().format('YYYYMMDDHHmmss')}.xlsx\`);
};
`;

if (!content.includes('import * as XLSX from')) {
    content = content.replace("const { RangePicker } = DatePicker;", `const { RangePicker } = DatePicker;\n${newExport}`);
}

// fix TS errors
content = content.replace(/payableYearMonth/g, "payableDateRange[0]");
content = content.replace(/setPayableDateRange\[0\]/g, "setPayableDateRange");

fs.writeFileSync(path, content);
console.log('Fixed TS errors');