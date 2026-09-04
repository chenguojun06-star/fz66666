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
  /** 打印人（当前登录用户） */
  printerName?: string;
}

/** 颜色数量矩阵：行为颜色、列为码数 */
export interface ColorSizeMatrix {
  colors: string[];
  sizes: string[];
  /** 各颜色×码数的数量 { color: { size: qty } } */
  data: Record<string, Record<string, number>>;
  colorTotals: Record<string, number>;
  sizeTotals: Record<string, number>;
  total: number;
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
  /** 打印人 */
  printerName: string;
  /** 打印时间（格式：YYYY-MM-DD HH:mm:ss） */
  printTime: string;
  /** 下单颜色数量矩阵 */
  colorSizeMatrix: ColorSizeMatrix;
}
