import ExcelJS from 'exceljs';
import dayjs from 'dayjs';

export async function exportToExcel(
  data: Record<string, unknown>[],
  columns: { header: string; key: string; width?: number }[],
  fileName: string,
) {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Sheet1');

  worksheet.columns = columns.map((col) => ({
    header: col.header,
    key: col.key,
    width: col.width || 15,
  }));

  worksheet.addRows(data);

  worksheet.getRow(1).font = { bold: true };

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

export function mapColumns(
  headers: Record<string, string>,
): { header: string; key: string }[] {
  return Object.entries(headers).map(([key, header]) => ({ header, key }));
}

export function getExportFilename(prefix: string): string {
  return `${prefix}_${dayjs().format('YYYYMMDDHHmmss')}.xlsx`;
}

export async function exportTableToExcel(
  data: Record<string, unknown>[],
  columns: { title: string; dataIndex: string }[],
  filenamePrefix: string,
): Promise<void> {
  if (data.length === 0) return;
  const formattedData = data.map((item) => {
    const row: Record<string, unknown> = {};
    columns.forEach((col) => {
      row[col.title] = (item as Record<string, unknown>)[col.dataIndex] ?? '';
    });
    return row;
  });
  const cols = columns.map((col) => ({ header: col.title, key: col.title }));
  await exportToExcel(formattedData, cols, getExportFilename(filenamePrefix));
}
