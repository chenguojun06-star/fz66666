import { useState } from 'react';
import { message } from '@/utils/antdStatic';
import { safePrint } from '@/utils/safePrint';
import { groupBundlesByOrder, buildPrintPageData } from './printDataTransform';
import { buildCuttingSheetPrintHtml } from './printTemplate';
import type { CuttingSheetPrintModalProps } from './types';

interface UseCuttingSheetPrintOptions
  extends Pick<CuttingSheetPrintModalProps, 'bundles' | 'styleImageUrl' | 'companyName' | 'cuttingTask' | 'printerName' | 'onCancel'> {}

function formatPrintTime(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

export function useCuttingSheetPrint(options: UseCuttingSheetPrintOptions) {
  const { bundles, styleImageUrl, companyName, cuttingTask, printerName, onCancel } = options;
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

      const printTime = formatPrintTime(new Date());

      const pagesData = orderKeys.map((orderNo) => {
        const orderBundles = groupedByOrder[orderNo];
        return buildPrintPageData(orderNo, orderBundles, { styleImageUrl, companyName, cuttingTask, printerName, printTime });
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
