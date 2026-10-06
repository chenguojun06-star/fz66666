import type { ReactNode } from 'react';

export type ImportType =
  | 'style'
  | 'factory'
  | 'employee'
  | 'process'
  | 'customer'
  | 'material'
  | 'material-stock'
  | 'product-stock';

export interface FailedColumn {
  title: string;
  dataIndex: string;
  width?: number;
}

export interface TabConfig {
  key: ImportType;
  label: string;
  icon: ReactNode;
  description: string;
  requiredFields: string;
  tips: string[];
  /** 失败明细表格的定位列（如款号/物料编码），缺省用通用「行号+错误原因」 */
  failedColumns?: FailedColumn[];
}
