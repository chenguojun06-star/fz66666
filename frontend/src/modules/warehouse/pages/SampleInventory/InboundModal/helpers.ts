import type { InboundPlanRow, SizeColorMatrixRow, StyleSnapshot } from './types';

export const normalizeText = (value: unknown) => String(value || '').trim();

export const uniqueValues = (values: unknown[]) => {
  const seen = new Set<string>();
  return values
    .map((item) => normalizeText(item))
    .filter((item) => {
      if (!item || seen.has(item)) return false;
      seen.add(item);
      return true;
    });
};

export const splitCandidateValues = (value: unknown) => uniqueValues(
  normalizeText(value)
    .split(/[/,，\s]+/)
    .map((item) => item.trim())
    .filter(Boolean)
);

export const parseSizeColorConfig = (raw: unknown) => {
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw || '{}') : (raw || {});
    const sizes = Array.isArray((parsed as any)?.sizes)
      ? (parsed as any).sizes.map((item: unknown) => normalizeText(item)).filter(Boolean)
      : [];
    const colors = Array.isArray((parsed as any)?.colors)
      ? (parsed as any).colors.map((item: unknown) => normalizeText(item)).filter(Boolean)
      : [];
    const quantities = Array.isArray((parsed as any)?.quantities)
      ? (parsed as any).quantities.map((item: unknown) => Number(item || 0))
      : [];
    const matrixRows = Array.isArray((parsed as any)?.matrixRows) ? (parsed as any).matrixRows : [];
    return { sizes, colors, quantities, matrixRows };
  } catch {
    return { sizes: [] as string[], colors: [] as string[], quantities: [] as number[], matrixRows: [] as SizeColorMatrixRow[] };
  }
};

export const buildInboundPlanRows = (detail?: Record<string, any> | null): InboundPlanRow[] => {
  if (!detail) return [];
  const config = parseSizeColorConfig(detail?.sizeColorConfig);
  const matrixRows = config.matrixRows
    .map((row: SizeColorMatrixRow) => ({
      color: normalizeText(row?.color),
      quantities: Array.isArray(row?.quantities) ? row.quantities.map((qty: number) => Number(qty || 0)) : [],
    }))
    .filter((row: { color: string; quantities: number[] }) => row.color);

  const rowsFromMatrix = matrixRows.flatMap((row: { color: string; quantities: number[] }) =>
    row.quantities
      .map((qty: number, index: number) => ({
        key: `${row.color}-${normalizeText(config.sizes[index])}`,
        color: row.color,
        size: normalizeText(config.sizes[index]),
        quantity: Number(qty || 0),
      }))
      .filter((item: InboundPlanRow) => item.color && item.size && item.quantity > 0)
  );
  if (rowsFromMatrix.length) {
    return rowsFromMatrix;
  }

  const directColor = normalizeText(detail?.color) || (config.colors.length === 1 ? config.colors[0] : '');
  const normalizedTopLevelRows = config.sizes
    .map((size: string, index: number) => ({
      key: `${directColor}-${size}`,
      color: directColor,
      size,
      quantity: Number(config.quantities[index] || 0),
    }))
    .filter((item: InboundPlanRow) => item.color && item.size && item.quantity > 0);
  if (normalizedTopLevelRows.length) {
    return normalizedTopLevelRows;
  }

  const directColorFallback = normalizeText(detail?.color);
  const directSize = normalizeText(detail?.size);
  const directQuantity = Number(detail?.sampleQuantity || detail?.quantity || 0);
  if (directColorFallback && directSize && directQuantity > 0 && splitCandidateValues(detail?.size).length <= 1 && splitCandidateValues(detail?.color).length <= 1) {
    return [{ key: `${directColorFallback}-${directSize}`, color: directColorFallback, size: directSize, quantity: directQuantity }];
  }
  return [];
};

export const buildInboundSeedFromStyle = (detail: Record<string, any>) => {
  const planRows = buildInboundPlanRows(detail);
  const colorCandidates = uniqueValues([
    ...planRows.map((row) => row.color),
  ]);
  const sizeCandidates = uniqueValues([
    ...planRows.map((row) => row.size),
  ]);
  const color = colorCandidates.length === 1 ? colorCandidates[0] : '';
  const size = sizeCandidates.length === 1 ? sizeCandidates[0] : '';

  return {
    styleId: normalizeText(detail?.id),
    styleNo: normalizeText(detail?.styleNo),
    styleName: normalizeText(detail?.styleName),
    sampleType: normalizeText(detail?.sampleType) || 'development',
    color,
    size,
  };
};

export const buildStyleSnapshot = (detail?: Record<string, any> | null): StyleSnapshot | null => {
  if (!detail) return null;
  const config = parseSizeColorConfig(detail?.sizeColorConfig);
  const matrixRows = config.matrixRows as Array<SizeColorMatrixRow & { imageUrl?: string }>;
  const cover = normalizeText(detail?.cover)
    || matrixRows
      .map((row) => normalizeText(row?.imageUrl))
      .find(Boolean)
    || '';
  return {
    styleId: normalizeText(detail?.id),
    styleNo: normalizeText(detail?.styleNo),
    styleName: normalizeText(detail?.styleName),
    patternNo: normalizeText(detail?.patternNo),
    sampleCompletedTime: normalizeText(detail?.sampleCompletedTime || detail?.completedTime),
    cover,
    colors: uniqueValues(buildInboundPlanRows(detail).map((row) => row.color)),
    sizes: uniqueValues(buildInboundPlanRows(detail).map((row) => row.size)),
    planRows: buildInboundPlanRows(detail),
  };
};

export const isNotFoundError = (error: unknown) => {
  const status = Number((error as { response?: { status?: number } })?.response?.status || 0);
  return status === 404;
};
