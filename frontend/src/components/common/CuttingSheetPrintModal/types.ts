import type { CuttingBundleRow } from '@/modules/production/pages/Production/Cutting/hooks';

export interface CuttingSheetPrintModalProps {
  open: boolean;
  onCancel: () => void;
  bundles: CuttingBundleRow[];
  styleImageUrl?: string;
  /** 工厂/公司名称，用于打印单顶部显示（优先于默认值） */
  companyName?: string;
  /** 裁剪任务信息（用于打印操作人/创建人，优先级高于bundle自带字段） */
  cuttingTask?: {
    receiverName?: string;
    creatorName?: string;
    orderCreatorName?: string;
    expectedShipDate?: string;
  };
}

export interface OrderGroup {
  orderNo: string;
  bundles: CuttingBundleRow[];
}

export interface PrintPageData {
  orderNo: string;
  firstBundle: CuttingBundleRow;
  bedNoDisplay: string;
  operatorName: string;
  creatorName: string;
  expectedShipDate: string;
  imageUrl: string;
  sizes: string[];
  totalQuantity: number;
  sortedBundles: CuttingBundleRow[];
}
