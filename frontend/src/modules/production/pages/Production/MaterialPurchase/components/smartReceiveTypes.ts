export interface MaterialItem {
  purchaseId: string;
  materialCode: string;
  materialName: string;
  materialType: string;
  color: string;
  size: string;
  requiredQty: number;
  availableStock: number;
  canPickQty: number;
  needPurchaseQty: number;
  unit: string;
  purchaseStatus: string;
  arrivedQuantity: number;
  userPickQty?: number;
}

export interface PickingRecord {
  pickingId: string;
  pickingNo: string;
  status: string;
  pickerName: string;
  pickTime: string;
  remark: string;
  items: Array<{
    materialCode: string;
    materialName: string;
    quantity: number;
    unit: string;
    color?: string;
  }>;
}

export interface SmartReceiveModalProps {
  open: boolean;
  orderNo: string;
  onCancel: () => void;
  onSuccess: () => void;
  isSupervisorOrAbove: boolean;
  userId?: string;
  userName?: string;
}
