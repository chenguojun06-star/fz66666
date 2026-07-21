import type { ReactNode } from 'react';

export type ImportType = 'style' | 'factory' | 'employee' | 'process';

export interface TabConfig {
  key: ImportType;
  label: string;
  icon: ReactNode;
  description: string;
  requiredFields: string;
  tips: string[];
}
