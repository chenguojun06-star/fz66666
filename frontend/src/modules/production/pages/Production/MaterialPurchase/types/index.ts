import { MaterialDatabase } from '@/types/production';

export type MaterialPurchaseTabKey = 'purchase' | 'materialDatabase';

export type MaterialDatabaseModalData = MaterialDatabase & { mode: 'create' | 'edit' };

export const ACTIVE_TAB_STORAGE_KEY = 'MaterialPurchase.activeTabKey';
export const PURCHASE_QUERY_STORAGE_KEY = 'MaterialPurchase.purchaseQueryParams';
export const MATERIAL_DB_QUERY_STORAGE_KEY = 'MaterialPurchase.materialDatabaseQueryParams';
