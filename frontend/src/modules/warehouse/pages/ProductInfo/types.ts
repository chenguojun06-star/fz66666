export interface SkuRow {
  id: number;
  skuCode: string;
  color: string;
  skuColorImage?: string | null;
  size: string;
  costPrice?: number;
  salesPrice?: number;
  stockQuantity?: number;
  barcode?: string;
}
