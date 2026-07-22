import { MATERIAL_PURCHASE_STATUS } from '@/constants/business';
import { MaterialPurchase as MaterialPurchaseType, ProductionOrder } from '@/types/production';
import { REQUIRED_FIELDS } from './PurchaseDetailView.helpers';

interface OrderLine {
  color: string;
  size: string;
  quantity: number;
}

export const createPurchaseRow = (
  currentPurchase: MaterialPurchaseType | null,
  detailOrder: ProductionOrder | null,
  color?: string
): MaterialPurchaseType => {
  const orderNo = currentPurchase?.orderNo || detailOrder?.orderNo || '';
  const styleNo = currentPurchase?.styleNo || detailOrder?.styleNo || '';
  const styleName = currentPurchase?.styleName || detailOrder?.styleName || '';
  const styleId = currentPurchase?.styleId || detailOrder?.styleId || '';
  const suffix = color ? `_${color}` : '';
  return {
    id: `tmp_${Date.now()}${suffix}`,
    purchaseNo: '',
    supplierId: '',
    orderNo,
    styleNo,
    styleName,
    styleId,
    materialType: 'fabricA',
    materialCode: '',
    materialName: '',
    unit: '',
    color: color || '',
    size: '',
    specifications: '',
    fabricComposition: '',
    fabricWeight: '',
    purchaseQuantity: 0,
    arrivedQuantity: 0,
    unitPrice: 0,
    totalAmount: 0,
    supplierName: '',
    status: MATERIAL_PURCHASE_STATUS.PENDING,
  } as MaterialPurchaseType;
};

export const computeOrderColors = (detailOrderLines: OrderLine[]): string[] => {
  const colors = new Set<string>();
  detailOrderLines.forEach((line) => {
    const c = String(line?.color || '').trim();
    if (c && c !== '-') colors.add(c);
  });
  return Array.from(colors);
};

export const computeMissingColors = (
  orderColors: string[],
  detailPurchases: MaterialPurchaseType[],
  isMultiColor: boolean
): string[] => {
  if (!isMultiColor) return [];
  if (detailPurchases.length === 0) return orderColors;
  const coveredColors = new Set(
    detailPurchases
      .map((item) => String(item.color || '').trim())
      .filter(Boolean)
  );
  return orderColors.filter((c) => !coveredColors.has(c));
};

export const computeBomIncomplete = (detailPurchases: MaterialPurchaseType[]): boolean => {
  if (detailPurchases.length === 0) return true;
  return detailPurchases.some((item) =>
    REQUIRED_FIELDS.some((field) => {
      const val = item[field];
      return val === undefined || val === null || String(val).trim() === '';
    })
  );
};

export const calculateTotalAmount = (
  purchaseQuantity: number | undefined,
  unitPrice: number | undefined
): number => {
  const qty = Number(purchaseQuantity || 0);
  const price = Number(unitPrice || 0);
  return Number.isFinite(qty) && Number.isFinite(price)
    ? Number((qty * price).toFixed(2))
    : 0;
};

export const buildStockMap = (materials: any[]): Record<string, number> => {
  const map: Record<string, number> = {};
  materials.forEach((m: any) => {
    if (m.purchaseId != null) {
      map[String(m.purchaseId)] = Number(m.availableStock ?? 0);
    }
  });
  return map;
};

export const extractMaterialsFromResponse = (res: any): any[] => {
  return res?.data?.materials || res?.materials || [];
};

export const fillRowFromMaterialData = (
  row: MaterialPurchaseType,
  record: Record<string, unknown>
): MaterialPurchaseType => {
  return {
    ...row,
    materialCode: String(record.materialCode || row.materialCode || ''),
    materialName: String(record.materialName || row.materialName || ''),
    materialType: String(record.materialType || row.materialType || 'accessoryA') as MaterialPurchaseType['materialType'],
    fabricComposition: String(record.fabricComposition || row.fabricComposition || ''),
    fabricWeight: String(record.fabricWeight || row.fabricWeight || ''),
    color: String(record.color || row.color || ''),
    specifications: String(record.specifications || row.specifications || ''),
    unit: String(record.unit || row.unit || ''),
    unitPrice: Number(record.unitPrice || row.unitPrice || 0),
    supplierName: String(record.supplierName || row.supplierName || ''),
    supplierId: String(record.supplierId || row.supplierId || ''),
  };
};

export interface ValidationResult {
  valid: boolean;
  warning?: string;
}

export const validatePurchaseRows = (
  rows: MaterialPurchaseType[],
  isMultiColor: boolean
): ValidationResult => {
  const validRows = rows.filter((r) => r.materialCode || r.materialName);
  if (validRows.length === 0) {
    return { valid: false, warning: '请至少添加一行面辅料信息' };
  }
  const incomplete = validRows.find((r) =>
    REQUIRED_FIELDS.some((f) => {
      const val = (r as any)[f];
      return val === undefined || val === null || String(val).trim() === '';
    })
  );
  if (incomplete) {
    return {
      valid: false,
      warning: '请完善所有面辅料的必填信息（物料类型、编码、名称、单位、供应商）',
    };
  }
  if (isMultiColor) {
    const noColor = validRows.find((r) => !String(r.color || '').trim());
    if (noColor) {
      return { valid: false, warning: '多颜色订单中，每项面辅料都必须指定颜色' };
    }
  }
  return { valid: true };
};

export const buildSavePayload = (
  row: MaterialPurchaseType,
  currentPurchase: MaterialPurchaseType | null,
  detailOrder: ProductionOrder | null
): any => {
  const orderNo = currentPurchase?.orderNo || detailOrder?.orderNo || '';
  const styleNo = currentPurchase?.styleNo || detailOrder?.styleNo || '';
  const ctxSourceType = String((currentPurchase as any)?.sourceType || '').trim();
  const fallbackSourceType = ctxSourceType || 'order';
  const totalAmount = calculateTotalAmount(row.purchaseQuantity, row.unitPrice);
  const rowSourceType = String((row as any).sourceType || '').trim();
  return {
    ...row,
    totalAmount,
    status: row.status || MATERIAL_PURCHASE_STATUS.PENDING,
    sourceType: rowSourceType || fallbackSourceType,
    orderNo: row.orderNo || orderNo,
    styleNo: row.styleNo || styleNo,
  };
};

export const isTempRow = (row: MaterialPurchaseType): boolean => {
  return !row.id || String(row.id).startsWith('tmp_');
};

export const computeDeletedIds = (
  originalPurchases: MaterialPurchaseType[],
  validRows: MaterialPurchaseType[]
): string[] => {
  const originalIds = new Set(
    originalPurchases.map((p) => p.id).filter(Boolean) as string[]
  );
  const keptIds = new Set(
    validRows.filter((r) => r.id && !String(r.id).startsWith('tmp_')).map((r) => r.id as string)
  );
  return [...originalIds].filter((id): id is string => !keptIds.has(id) && !!id);
};
