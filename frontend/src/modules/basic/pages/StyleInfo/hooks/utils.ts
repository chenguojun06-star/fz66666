import { formatDateTimeSecond } from '@/utils/datetime';
import type { FieldConfigItem } from '@/hooks/useFieldConfig';
import { collectExtValues } from '@/components/common/SchemaForm/ExtFieldsSection';
import { normalizeCategoryQuery, normalizeSeasonQuery } from '@/utils/styleCategory';
import dayjs from 'dayjs';

type SizeColorMatrixRow = {
  color: string;
  quantities: number[];
  imageUrl?: string;
};

type PendingColorImage = {
  color: string;
  file: File;
};

const LONG_TYPE_FIELDS = new Set([
  'tenantId', 'factoryId', 'orderId', 'styleId', 'id',
]);

const COLOR_IMAGE_BIZ_TYPE_PREFIX = 'color_image::';

const isSameFile = (left: File, right: File) => (
  left.name === right.name
  && left.size === right.size
  && left.lastModified === right.lastModified
);

const parseColorImageBizType = (bizType: unknown): string | null => {
  const value = String(bizType || '').trim();
  if (!value.startsWith(COLOR_IMAGE_BIZ_TYPE_PREFIX)) {
    return null;
  }
  const rawColor = value.slice(COLOR_IMAGE_BIZ_TYPE_PREFIX.length);
  if (!rawColor) {
    return '';
  }
  try {
    return decodeURIComponent(rawColor);
  } catch {
    return rawColor;
  }
};

const buildColorImageBizType = (color: string) => `${COLOR_IMAGE_BIZ_TYPE_PREFIX}${String(color || '').trim()}`;

const normalizePayload = (obj: Record<string, any>): Record<string, any> => {
  const result: Record<string, any> = {};
  const isDateLike = (v: any): boolean =>
    v !== null && v !== undefined && (
      v instanceof Date ||
      (typeof v === 'object' && typeof v.toDate === 'function') ||
      (typeof v === 'object' && v.$d instanceof Date)
    );

  for (const key of Object.keys(obj)) {
    const raw = obj[key];
    if (raw === undefined) continue;

    if (isDateLike(raw)) {
      try {
        result[key] = formatDateTimeSecond(raw);
      } catch {
        result[key] = null;
      }
      continue;
    }

    if (typeof raw === 'string' && raw.trim() === '') {
      result[key] = null;
      continue;
    }

    if (typeof raw === 'string' && LONG_TYPE_FIELDS.has(key)) {
      const trimmed = raw.trim();
      if (!/^\d+$/.test(trimmed)) {
        result[key] = null;
        continue;
      }
      result[key] = Number(trimmed);
      continue;
    }

    if (raw !== null && typeof raw === 'object' && !(raw instanceof File) && !(raw instanceof Blob)) {
      if (Array.isArray(raw)) {
        result[key] = raw.map((item) =>
          item !== null && typeof item === 'object' ? normalizePayload(item as Record<string, any>) : item
        );
      } else {
        result[key] = normalizePayload(raw);
      }
      continue;
    }

    result[key] = raw;
  }
  return result;
};

const normalizeStringList = (items: unknown[]): string[] => {
  return items.map((item) => String(item || '').trim()).filter(Boolean);
};

export interface SizeColorConfigLike {
  sizes: string[];
  colors: string[];
  quantities: number[];
  matrixRows?: SizeColorMatrixRow[];
  commonSizes: string[];
  commonColors: string[];
}

const parseSizeColorConfig = (jsonStr: string): {
  sizes: string[];
  colors: string[];
  quantities: number[];
  matrixRows: SizeColorMatrixRow[];
  commonSizes?: string[];
  commonColors?: string[];
} => {
  const config = JSON.parse(jsonStr);
  const sizes = normalizeStringList(config.sizes || []);
  const colors = normalizeStringList(config.colors || []);
  const quantities = Array.isArray(config.quantities)
    ? config.quantities.map((q: any) => Number(q || 0))
    : [];
  const matrixRows: SizeColorMatrixRow[] = Array.isArray(config.matrixRows)
    ? config.matrixRows.map((row: any) => ({
        color: String(row?.color || ''),
        quantities: Array.isArray(row?.quantities)
          ? row.quantities.map((qty: any) => Number(qty || 0))
          : [],
        imageUrl: row?.imageUrl || undefined,
      }))
    : [];
  return {
    sizes,
    colors,
    quantities,
    matrixRows,
    commonSizes: config.commonSizes,
    commonColors: config.commonColors,
  };
};

const buildImageMapFromRows = (rows: SizeColorMatrixRow[]): Record<string, string> => {
  const map: Record<string, string> = {};
  rows.forEach((row) => {
    if (row.color && row.imageUrl) {
      map[row.color] = row.imageUrl;
    }
  });
  return map;
};

const calculateTotalMatrixQty = (rows: SizeColorMatrixRow[]): number => {
  return rows.reduce(
    (sum, row) => sum + row.quantities.reduce((subtotal, qty) => subtotal + Number(qty || 0), 0),
    0
  );
};

const buildSizeColorConfig = (
  matrixSizes: string[],
  matrixColors: string[],
  sizeColorMatrixRows: SizeColorMatrixRow[],
  commonSizes: string[],
  commonColors: string[],
  colorImageMap: Record<string, string>
): SizeColorConfigLike & { matrixRows: SizeColorMatrixRow[] } => {
  return {
    sizes: matrixSizes,
    colors: matrixColors,
    quantities: sizeColorMatrixRows.map((row) =>
      row.quantities.reduce((sum, qty) => sum + Number(qty || 0), 0)
    ),
    commonSizes,
    commonColors,
    matrixRows: sizeColorMatrixRows.map((row) => {
      const serverImgUrl = colorImageMap[row.color]
        || (row.imageUrl && !row.imageUrl.startsWith('data:') ? row.imageUrl : undefined);
      return {
        color: row.color,
        quantities: row.quantities,
        ...(serverImgUrl ? { imageUrl: serverImgUrl } : {}),
      };
    }),
  };
};

const calculateTotalQuantity = (sizeColorConfig: SizeColorConfigLike): number => {
  return sizeColorConfig.matrixRows?.length
    ? sizeColorConfig.matrixRows.reduce((sum, row) => sum + (row.quantities || []).reduce((subtotal, qty) => subtotal + Number(qty || 0), 0), 0)
    : sizeColorConfig.quantities.reduce((sum, qty) => sum + (qty || 0), 0);
};

const extractFirstColor = (sizeColorConfig: SizeColorConfigLike): string | undefined => {
  const fromMatrix = sizeColorConfig.matrixRows?.find((row) => row.color && row.color.trim())?.color;
  if (fromMatrix) return fromMatrix.trim();
  const fromColors = sizeColorConfig.colors.find(c => c && c.trim());
  return fromColors?.trim();
};

const buildSizeString = (sizes: string[]): string | undefined => {
  const selected = normalizeStringList(sizes);
  return selected.length ? selected.join('/') : undefined;
};

interface BuildNormalizedValuesOptions {
  values: Record<string, any>;
  sizeColorConfig: SizeColorConfigLike;
  customFields: FieldConfigItem[];
  form: any;
  currentStyleExtJson?: string | Record<string, unknown> | null;
}

const buildNormalizedValues = ({
  values,
  sizeColorConfig,
  customFields,
  form,
  currentStyleExtJson,
}: BuildNormalizedValuesOptions): Record<string, any> => {
  const normalizedValues: Record<string, any> = { ...values };

  delete normalizedValues.createTime;
  delete normalizedValues.completedTime;
  delete normalizedValues.pushedToOrder;
  delete normalizedValues.pushedToOrderTime;
  delete normalizedValues.remark;
  delete normalizedValues.customer;

  const dd = normalizedValues.deliveryDate;
  if (dd) {
    const formatted = formatDateTimeSecond(dd);
    if (formatted && formatted !== '-') {
      normalizedValues.deliveryDate = formatted;
    }
  }

  normalizedValues.sizeColorConfig = JSON.stringify(sizeColorConfig);
  if (!String(normalizedValues.patternNo || '').trim()) {
    normalizedValues.patternNo = `ZYH${dayjs().format('YYYYMMDDHHmmss')}`;
  }
  normalizedValues.category = normalizeCategoryQuery(normalizedValues.category);
  normalizedValues.season = normalizeSeasonQuery(normalizedValues.season);

  const firstColor = extractFirstColor(sizeColorConfig);
  if (firstColor) {
    normalizedValues.color = firstColor;
  }
  const sizeStr = buildSizeString(sizeColorConfig.sizes);
  if (sizeStr) {
    normalizedValues.size = sizeStr;
  }

  normalizedValues.sampleQuantity = calculateTotalQuantity(sizeColorConfig);
  normalizedValues.extJson = collectExtValues(form, customFields, { extJson: currentStyleExtJson });

  return normalizedValues;
};

interface StandaloneImagesResult {
  standaloneImages: File[];
  colorUploads: PendingColorImage[];
}

const separateStandaloneAndColorImages = (
  pendingImages: File[],
  pendingColorImages: PendingColorImage[]
): StandaloneImagesResult => {
  const standaloneImages = pendingImages.filter((file) =>
    !pendingColorImages.some((item) => isSameFile(item.file, file))
  );
  return { standaloneImages, colorUploads: pendingColorImages };
};

export type { SizeColorMatrixRow, PendingColorImage };

export {
  LONG_TYPE_FIELDS,
  COLOR_IMAGE_BIZ_TYPE_PREFIX,
  isSameFile,
  parseColorImageBizType,
  buildColorImageBizType,
  normalizePayload,
  normalizeStringList,
  parseSizeColorConfig,
  buildImageMapFromRows,
  calculateTotalMatrixQty,
  buildSizeColorConfig,
  calculateTotalQuantity,
  extractFirstColor,
  buildSizeString,
  buildNormalizedValues,
  separateStandaloneAndColorImages,
};
