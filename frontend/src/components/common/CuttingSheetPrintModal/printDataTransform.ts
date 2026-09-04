import type { CuttingBundleRow } from '@/modules/production/pages/Production/Cutting/hooks';
import { getFullAuthedFileUrl } from '@/utils/fileUrl';
import type { ColorSizeMatrix, CuttingSheetPrintModalProps, PrintPageData } from './types';

export function groupBundlesByOrder(bundles: CuttingBundleRow[]): Record<string, CuttingBundleRow[]> {
  return bundles.reduce((acc, bundle) => {
    const orderNo = bundle.productionOrderNo || '';
    if (!acc[orderNo]) {
      acc[orderNo] = [];
    }
    acc[orderNo].push(bundle);
    return acc;
  }, {} as Record<string, CuttingBundleRow[]>);
}

export function getBedNoDisplay(bundles: CuttingBundleRow[]): string {
  const bedNos = bundles
    .map(b => b.bedNo)
    .filter((no): no is number => no !== null && no !== undefined)
    .sort((a, b) => a - b);
  return bedNos.length > 0 ? String(bedNos[0]) : '-';
}

/** 构建下单颜色数量矩阵：行为颜色，列为码数 */
export function buildColorSizeMatrix(bundles: CuttingBundleRow[]): ColorSizeMatrix {
  // 保留颜色与码数的自然出现顺序（按 bundle 先后），便于排版阅读
  const colors: string[] = [];
  const sizes: string[] = [];
  const seenColor = new Set<string>();
  const seenSize = new Set<string>();
  const data: Record<string, Record<string, number>> = {};
  const colorTotals: Record<string, number> = {};
  const sizeTotals: Record<string, number> = {};
  let total = 0;

  for (const b of bundles) {
    const color = (b.color || '').trim();
    const size = (b.size || '').trim();
    if (!color || !size) continue;
    if (!seenColor.has(color)) {
      seenColor.add(color);
      colors.push(color);
    }
    if (!seenSize.has(size)) {
      seenSize.add(size);
      sizes.push(size);
    }
    if (!data[color]) data[color] = {};
    data[color][size] = (data[color][size] || 0) + (b.quantity || 0);
    colorTotals[color] = (colorTotals[color] || 0) + (b.quantity || 0);
    sizeTotals[size] = (sizeTotals[size] || 0) + (b.quantity || 0);
    total += b.quantity || 0;
  }

  return { colors, sizes, data, colorTotals, sizeTotals, total };
}

interface BuildOptions extends Pick<CuttingSheetPrintModalProps, 'styleImageUrl' | 'companyName' | 'cuttingTask' | 'printerName'> {
  printTime?: string;
}

export function buildPrintPageData(
  orderNo: string,
  orderBundles: CuttingBundleRow[],
  options: BuildOptions
): PrintPageData {
  const firstBundle = orderBundles[0];

  const bedNoDisplay = getBedNoDisplay(orderBundles);

  const operatorName = options.cuttingTask?.receiverName || firstBundle.operatorName || firstBundle.creatorName || '-';
  const creatorName = options.cuttingTask?.orderCreatorName || options.cuttingTask?.creatorName || firstBundle.creatorName || '-';
  const expectedShipDate = options.cuttingTask?.expectedShipDate || (firstBundle as any).expectedShipDate || '';

  const imageUrl = options.styleImageUrl ? getFullAuthedFileUrl(options.styleImageUrl) : '';

  const sizes = [...new Set(orderBundles.map(b => b.size).filter(Boolean))];
  const totalQuantity = orderBundles.reduce((sum, b) => sum + (b.quantity || 0), 0);
  const colorSizeMatrix = buildColorSizeMatrix(orderBundles);

  const sortedBundles = [...orderBundles].sort((a, b) => Number(a.bundleNo) - Number(b.bundleNo));

  return {
    orderNo,
    firstBundle,
    bedNoDisplay,
    operatorName,
    creatorName,
    expectedShipDate,
    imageUrl,
    sizes,
    totalQuantity,
    sortedBundles,
    printerName: options.printerName || '-',
    printTime: options.printTime || '',
    colorSizeMatrix,
  };
}
