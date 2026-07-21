import type React from 'react';
import type { NavigateFunction } from 'react-router-dom';
import type { ProductionOrder } from '@/types/production';
import type { DeliveryRiskItem } from '@/services/intelligence/intelligenceApi';

export interface UseProductionColumnsProps {
  sortField: string;
  sortOrder: 'asc' | 'desc';
  handleSort: (field: string, order: 'asc' | 'desc') => void;
  handleCloseOrder: (record: ProductionOrder) => void;
  handleScrapOrder: (record: ProductionOrder) => void;
  handleCopyOrder?: (record: ProductionOrder) => void;
  navigate: NavigateFunction;
  openProcessDetail: (record: ProductionOrder, type: string) => void;
  openNodeDetail?: (record: ProductionOrder, nodeType: string, nodeName: string, stats?: { done: number; total: number; percent: number; remaining: number }, unitPrice?: number, processList?: { name: string; unitPrice?: number; processCode?: string }[]) => void;
  syncProcessFromTemplate: (record: ProductionOrder) => void;
  setPrintModalVisible: (v: boolean) => void;
  setPrintingRecord: (r: ProductionOrder | null) => void;
  setRemarkPopoverId?: (id: string | null) => void;
  setRemarkText?: (text: string) => void;
  quickEditModal: { open: (r: ProductionOrder) => void };
  isSupervisorOrAbove: boolean;
  renderCompletionTimeTag: (record: ProductionOrder, stage: string, rate: number, position?: string) => React.ReactNode;
  deliveryRiskMap?: Map<string, DeliveryRiskItem>;
  stagnantOrderIds?: Map<string, number>;
  handleShareOrder: (record: ProductionOrder) => void;
  handlePrintLabel?: (record: ProductionOrder) => void;
  canManageOrderLifecycle?: boolean;
  openSubProcessRemap?: (record: ProductionOrder) => void;
  isFactoryAccount?: boolean;
  onOpenRemark?: (record: ProductionOrder, defaultRole?: string) => void;
  openWorkflowEditor?: (styleNo?: string) => void;
  getStageCompletionTime?: (record: ProductionOrder, stageKeyword: string, rate?: number) => string;
  onOpenInspectDrawer?: (orderId: string) => void;
  onOpenSmartReceive?: (orderNo: string) => void;
}

export type ColumnGroupBuilder = (props: UseProductionColumnsProps) => any[];
