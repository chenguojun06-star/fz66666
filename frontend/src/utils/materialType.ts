export type MaterialTypeCategory = 'fabric' | 'lining' | 'accessory';

export const normalizeMaterialType = <T extends string = string>(v: unknown): T => {
  const type = String(v || '').trim();
  if (!type || type === 'fabric') return 'fabricA' as T;
  if (type === 'lining') return 'liningA' as T;
  if (type === 'accessory') return 'accessoryA' as T;
  return type as T;
};

export const getMaterialTypeCategory = (v: unknown): MaterialTypeCategory => {
  const type = String(v || '').trim();
  if (!type || type === 'fabric' || type.startsWith('fabric')) return 'fabric';
  if (type === 'lining' || type.startsWith('lining')) return 'lining';
  if (type === 'accessory' || type.startsWith('accessory')) return 'accessory';
  return 'fabric';
};

export const getMaterialTypeLabel = (v: unknown): string => {
  const raw = String(v || '').trim();
  if (raw === 'fabric') return '面料';
  if (raw === 'lining') return '里料';
  if (raw === 'accessory') return '辅料';

  const type = String(normalizeMaterialType(raw)).trim();
  if (type === 'fabricA') return '面料A';
  if (type === 'fabricB') return '面料B';
  if (type === 'fabricC') return '面料C';
  if (type === 'fabricD') return '面料D';
  if (type === 'fabricE') return '面料E';
  if (type === 'liningA') return '里料A';
  if (type === 'liningB') return '里料B';
  if (type === 'liningC') return '里料C';
  if (type === 'liningD') return '里料D';
  if (type === 'liningE') return '里料E';
  if (type === 'accessoryA') return '辅料A';
  if (type === 'accessoryB') return '辅料B';
  if (type === 'accessoryC') return '辅料C';
  if (type === 'accessoryD') return '辅料D';
  if (type === 'accessoryE') return '辅料E';
  return raw ? raw : '-';
};

export const getMaterialTypeSortKey = (v: unknown): string => {
  const type = String(v || '').trim();
  const category = getMaterialTypeCategory(type);
  const catIdx = category === 'fabric' ? 0 : category === 'lining' ? 1 : 2;
  const m = type.match(/([A-E])$/);
  const letter = m?.[1] || '';
  const letterIdx = letter ? 'ABCDE'.indexOf(letter) : 99;
  return `${catIdx}-${String(letterIdx).padStart(2, '0')}-${type}`;
};

export const getMaterialSortWeight = (v: unknown): number => {
  const type = String(normalizeMaterialType(v)).trim();
  const lower = type.toLowerCase();

  let group = 9;
  if (lower.startsWith('fabric')) group = 0;
  else if (lower.startsWith('lining')) group = 1;
  else if (lower.startsWith('accessory')) group = 2;

  const m = type.match(/([A-E])$/i);
  const letter = m ? m[1].toUpperCase().charCodeAt(0) - 'A'.charCodeAt(0) : 99;

  return group * 100 + letter;
};
