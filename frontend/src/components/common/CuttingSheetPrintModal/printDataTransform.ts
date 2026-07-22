import type { CuttingBundleRow } from '@/modules/production/pages/Production/Cutting/hooks';
import { getFullAuthedFileUrl } from '@/utils/fileUrl';
import type { CuttingSheetPrintModalProps, PrintPageData } from './types';

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

export function buildPrintPageData(
  orderNo: string,
  orderBundles: CuttingBundleRow[],
  options: Pick<CuttingSheetPrintModalProps, 'styleImageUrl' | 'companyName' | 'cuttingTask'>
): PrintPageData {
  const firstBundle = orderBundles[0];

  const bedNoDisplay = getBedNoDisplay(orderBundles);

  const operatorName = options.cuttingTask?.receiverName || firstBundle.operatorName || firstBundle.creatorName || '-';
  const creatorName = options.cuttingTask?.orderCreatorName || options.cuttingTask?.creatorName || firstBundle.creatorName || '-';
  const expectedShipDate = options.cuttingTask?.expectedShipDate || (firstBundle as any).expectedShipDate || '';

  const imageUrl = options.styleImageUrl ? getFullAuthedFileUrl(options.styleImageUrl) : '';

  const sizes = [...new Set(orderBundles.map(b => b.size).filter(Boolean))];
  const totalQuantity = orderBundles.reduce((sum, b) => sum + (b.quantity || 0), 0);

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
  };
}
