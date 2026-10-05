import type React from 'react';
import type {
  GlobalSearchOrderItem,
  GlobalSearchStyleItem,
  GlobalSearchWorkerItem,
} from '@/services/production/productionApi';

export type ResultItem =
  | { kind: 'order';  data: GlobalSearchOrderItem }
  | { kind: 'style';  data: GlobalSearchStyleItem }
  | { kind: 'worker'; data: GlobalSearchWorkerItem }
  | { kind: 'menu';   data: { label: string; path: string; section: string; icon?: React.ReactNode } }
  | { kind: 'imageStyle'; data: { id: number; styleNo: string; styleName: string; category: string; coverUrl: string; similarity?: number } };

export interface MenuEntry {
  label: string;
  path: string;
  section: string;
  icon?: React.ReactNode;
  keywords: string[];
  /** D-748：仅超级管理员可见的菜单项，命令面板需据此对非超管过滤 */
  superAdminOnly?: boolean;
}

export type SearchTab = 'all' | 'menu' | 'image';

export interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
}
