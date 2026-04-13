import ExcelJS from 'exceljs';

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
