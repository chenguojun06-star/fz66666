import type { ReactNode } from 'react';

export interface ProcessStats {
  totalProcessTypes: number;
  totalStyles: number;
  totalRecords: number;
}

export interface StyleProcessKnowledgeTabProps {
  keyword: string;
  onKeywordChange: (kw: string) => void;
  currentPage: number;
  pageSize: number;
  onPageChange: (page: number, size: number) => void;
  selectedKeys: React.Key[];
  onSelectionChange: (keys: React.Key[]) => void;
}
