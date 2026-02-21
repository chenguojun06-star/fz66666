import { useState, useEffect } from 'react';
import { ProductionOrder } from '@/types/production';

/**
 * 打印弹窗流程状态管理
 */
export const usePrintFlow = () => {
  const [printingRecord, setPrintingRecord] = useState<ProductionOrder | null>(null);
  const [printModalVisible, setPrintModalVisible] = useState(false);

  useEffect(() => {
    if (printingRecord) {
      setPrintModalVisible(true);
    }
  }, [printingRecord]);

  const closePrintModal = () => {
    setPrintModalVisible(false);
    setPrintingRecord(null);
  };

  return { printingRecord, printModalVisible, setPrintingRecord, closePrintModal };
};
