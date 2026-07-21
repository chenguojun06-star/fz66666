export interface MaterialColorCardItem {
  id?: string;
  materialColorCardId?: string;
  materialId?: string;
  materialCode?: string;
  materialName: string;
  materialType?: string;
  color?: string;
  fabricWidth?: string;
  fabricWeight?: string;
  fabricComposition?: string;
  specifications?: string;
  unit?: string;
  unitPrice?: number;
  image?: string;
  remark?: string;
  sortOrder?: number;
}

export interface MaterialColorCard {
  id: string;
  cardCode: string;
  cardName: string;
  supplierId?: string;
  supplierName?: string;
  supplierContactPerson?: string;
  supplierContactPhone?: string;
  materialType?: string;
  fabricWidth?: string;
  specifications?: string;
  fabricWeight?: string;
  fabricComposition?: string;
  unit?: string;
  coverImage?: string;
  remark?: string;
  status?: string;
  materialCount?: number;
  createTime?: string;
}

export const MATERIAL_TYPE_OPTIONS = [
  { label: '面料', value: 'fabric' },
  { label: '里料', value: 'lining' },
  { label: '辅料', value: 'accessory' },
];
