export interface OrderInfo {
  orderId: string;
  orderNo: string;
  styleId: string;
  styleNo: string;
  styleName: string;
  /** D-440：商品品牌（t_style_info.theme，吊牌打印行用） */
  brand: string;
  /** D-440：市场|吊牌价 */
  tagPrice?: number;
  colors: string[];
  sizes: string[];
  cover: string;
  fabricComposition: string;
  fabricCompositionParts: string;
  washInstructions: string;
  uCode: string;
  washTempCode: string;
  bleachCode: string;
  tumbleDryCode: string;
  ironCode: string;
  dryCleanCode: string;
  careIconCodes: string;
  price: number;
  qualityGrade: string;
  executeStandard: string;
  safetyCategory: string;
  inspector: string;
  inspectionDate: string;
}

export type PrintType = 'hangtag' | 'barcode' | 'washlabel';
