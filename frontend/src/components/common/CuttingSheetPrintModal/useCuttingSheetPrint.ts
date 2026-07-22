import { useState } from 'react';
import { message } from '@/utils/antdStatic';
import { safePrint } from '@/utils/safePrint';
import { groupBundlesByOrder, buildPrintPageData } from './printDataTransform';
import { buildCuttingSheetPrintHtml } from './printTemplate';
import type { CuttingSheetPrintModalProps } from './types';

interface UseCuttingSheetPrintOptions
  extends Pick<CuttingSheetPrintModalProps, 'bundles' | 'styleImageUrl' | 'companyName' | 'cuttingTask' | 'onCancel'> {}

export function useCuttingSheetPrint(options: UseCuttingSheetPrintOptions) {
  const { bundles, styleImageUrl, companyName, cuttingTask, onCancel } = options;
  const [orientation, setOrientation] = useState<'portrait' | 'landscape'>('portrait');
  const [printLoading, setPrintLoading] = useState(false);

  const handlePrint = async () => {
    setPrintLoading(true);
    try {
      if (!bundles.length) {
        message.warning('没有可打印的裁剪单');
        return;
      }

      const groupedByOrder = groupBundlesByOrder(bundles);
      const orderKeys = Object.keys(groupedByOrder);

      if (!orderKeys.length) {
        message.warning('没有有效的订单数据');
        return;
      }

      const pagesData = orderKeys.map((orderNo) => {
        const orderBundles = groupedByOrder[orderNo];
        return buildPrintPageData(orderNo, orderBundles, { styleImageUrl, companyName, cuttingTask });
      });

      const printHtml = buildCuttingSheetPrintHtml(pagesData, companyName || '', orientation);

      safePrint(printHtml);
      onCancel();
    } finally {
      setPrintLoading(false);
    }
  };

  return {
    orientation,
    setOrientation,
    printLoading,
    handlePrint,
  };
}
