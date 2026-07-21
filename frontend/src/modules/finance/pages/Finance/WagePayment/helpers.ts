import dayjs from 'dayjs';

export const exportToExcelFile = async (data: any[], columns: any[], filename: string) => {
    const { exportToExcel } = await import('@/utils/excelExport');
    const formattedData = data.map(item => {
        const row: any = {};
        columns.forEach((col: any) => {
            row[col.title] = item[col.dataIndex] || '';
        });
        return row;
    });
    const cols = columns.map((col: any) => ({ header: col.title, key: col.title }));
    await exportToExcel(formattedData, cols, `${filename}_${dayjs().format('YYYYMMDDHHmmss')}.xlsx`);
};
