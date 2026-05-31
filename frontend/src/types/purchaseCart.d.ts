export type CartStatus = 'DRAFT' | 'CONFIRMED' | 'CANCELLED';

export type MaterialType = 'FABRIC' | 'LINING' | 'ACCESSORY';

export type SourceType = 'ORDER' | 'SAMPLE' | 'BATCH';

export interface PurchaseCart {
  id: string;
  status: CartStatus;
  totalItems: number;
  totalAmount: number;
  remark?: string;
  items: PurchaseCartItem[];
  createdTime: string;
  updatedTime: string;
}

export interface PurchaseCartItem {
  id: string;
  materialCode: string;
  materialName: string;
  materialType: MaterialType;
  specifications?: string;
  unit: string;
  quantity: number;
  supplierId?: string;
  supplierName?: string;
  unitPrice?: number;
  totalAmount?: number;
  sourceType: SourceType;
  sourceId?: string;
  sourceNo?: string;
  sourceQuantity?: number;
  color?: string;
  fabricComposition?: string;
  fabricWidth?: string;
  fabricWeight?: string;
  mergeGroupId?: string;
  remark?: string;
}

export interface AddCartItemRequest {
  materialCode: string;
  materialName: string;
  materialType: MaterialType;
  specifications?: string;
  unit: string;
  quantity: number;
  supplierId?: string;
  supplierName?: string;
  unitPrice?: number;
  sourceType: SourceType;
  sourceId?: string;
  sourceNo?: string;
  sourceQuantity?: number;
  color?: string;
  fabricComposition?: string;
  fabricWidth?: string;
  fabricWeight?: string;
  remark?: string;
}

export interface UpdateCartItemRequest {
  quantity?: number;
  supplierId?: string;
  supplierName?: string;
  unitPrice?: number;
  remark?: string;
}

export interface MergeRequest {
  itemIds: string[];
  targetQuantity?: number;
  targetSupplierId?: string;
  targetSupplierName?: string;
}

export interface SplitRequest {
  itemId: string;
  splitQuantity: number;
}

export interface MergeableItem {
  id: string;
  supplierName?: string;
  quantity: number;
}

export interface MergeSuggestion {
  materialCode: string;
  materialName: string;
  specifications?: string;
  items: MergeableItem[];
  suggestion: string;
}

export interface SourceItem {
  sourceType: SourceType;
  sourceNo?: string;
  quantity: number;
}

export interface PurchaseGroup {
  groupKey: string;
  materialCode: string;
  materialName: string;
  specifications?: string;
  supplierId?: string;
  supplierName?: string;
  totalQuantity: number;
  unitPrice?: number;
  totalAmount?: number;
  sourceItems: SourceItem[];
}

export interface PreviewSummary {
  totalGroups: number;
  totalItems: number;
  totalAmount: number;
}

export interface CartPreview {
  purchaseGroups: PurchaseGroup[];
  summary: PreviewSummary;
}

export interface AddItemResult {
  itemId: string;
  mergeSuggestion?: MergeSuggestion;
}

export interface ConfirmResult {
  purchaseIds: string[];
  purchaseNos: string[];
}

export interface PurchaseCartDrawerProps {
  open: boolean;
  onClose: () => void;
  onConfirmSuccess?: (purchaseIds: string[]) => void;
}
