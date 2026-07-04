import ExcelJS from 'exceljs';
import type { ColumnType } from 'antd/es/table';

/**
 * 从 ReactNode 中递归提取纯文本（用于 Excel 导出时获取 render 渲染后的可见文本）
 * 支持：string/number/boolean/Array/ReactElement（含 Tag、Tooltip、嵌套 children）
 */
function extractTextFromReactNode(node: any): string {
  if (node === null || node === undefined) return '';
  if (typeof node === 'boolean') return '';
  if (typeof node === 'string') return node;
  if (typeof node === 'number') return String(node);
  if (Array.isArray(node)) {
    return node.map(extractTextFromReactNode).join('');
  }
  if (typeof node === 'object' && node !== null && node.props) {
    // ReactElement：递归提取 props.children
    return extractTextFromReactNode(node.props.children);
  }
  return String(node);
}

/**
 * 导出表格数据到Excel
 * @param dataSource 表格数据
 * @param columns 列配置
 * @param filename 文件名
 * @param selectedColumns 可选：导出哪些列（默认全部导出）
 */
export async function exportTableToExcel<T extends object>(
  dataSource: T[],
  columns: ColumnType<T>[],
  filename: string = '导出数据.xlsx',
  selectedColumns?: string[]
): Promise<void> {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Sheet1');

  // 过滤列（序号列和操作列不导出）
  const exportColumns = columns.filter(col => {
    const key = col.key || col.dataIndex;
    if (typeof key === 'string') {
      // 排除序号列和操作列
      if (key === '__index__' || key.toLowerCase().includes('action') || key.toLowerCase().includes('操作')) {
        return false;
      }
      // 如果指定了selectedColumns，只导出选中的列
      if (selectedColumns && selectedColumns.length > 0) {
        return selectedColumns.includes(key);
      }
    }
    return true;
  });

  // 设置列头
  worksheet.columns = exportColumns.map(col => ({
    header: typeof col.title === 'string' ? col.title : String(col.title || ''),
    key: String(col.key || col.dataIndex || ''),
    width: col.width && typeof col.width === 'number' ? col.width / 8 : 15,
  }));

  // 设置表头样式
  worksheet.getRow(1).font = { bold: true, size: 12 };
  worksheet.getRow(1).alignment = { vertical: 'middle', horizontal: 'center' };
  worksheet.getRow(1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFE0E0E0' },
  };

  // 填充数据
  dataSource.forEach((record, rowIndex) => {
    const rowData: Record<string, any> = {};
    exportColumns.forEach(col => {
      const key = String(col.key || col.dataIndex || '');
      let value: any;

      // 提取字段原始值
      const dataIndex = col.dataIndex;
      if (typeof dataIndex === 'string') {
        value = (record as any)[dataIndex];
      } else if (Array.isArray(dataIndex)) {
        value = (dataIndex as string[]).reduce((obj: any, k: string) => obj && obj[k], record);
      } else {
        value = undefined;
      }

      // P2#9: 有 render 函数时，调用 render 取渲染后值，保证导出与界面显示一致
      if (col.render && typeof col.render === 'function') {
        try {
          const rendered = col.render(value, record, rowIndex);
          const text = extractTextFromReactNode(rendered);
          if (text !== '') {
            value = text;
          }
          // text 为空（如 render 返回 null/空）则保留原始值
        } catch {
          // render 调用失败，保留原始值
        }
      }

      // 格式化值
      if (value === null || value === undefined) {
        value = '';
      } else if (typeof value === 'number') {
        // 数字保持原样
      } else if (typeof value === 'boolean') {
        value = value ? '是' : '否';
      } else if (Array.isArray(value)) {
        value = value.join(', ');
      } else {
        value = String(value);
      }

      rowData[key] = value;
    });
    worksheet.addRow(rowData);
  });

  // 设置数据行样式
  worksheet.eachRow((row, rowNum) => {
    if (rowNum > 1) {
      row.alignment = { vertical: 'middle', horizontal: 'left' };
      row.border = {
        top: { style: 'thin', color: { argb: 'FFD0D0D0' } },
        left: { style: 'thin', color: { argb: 'FFD0D0D0' } },
        bottom: { style: 'thin', color: { argb: 'FFD0D0D0' } },
        right: { style: 'thin', color: { argb: 'FFD0D0D0' } },
      };
    }
  });

  // 导出文件
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}