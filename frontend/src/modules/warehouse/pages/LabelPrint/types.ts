export interface OrderInfo {
  orderId: string;
  orderNo: string;
  styleId: string;
  styleNo: string;
  styleName: string;
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
