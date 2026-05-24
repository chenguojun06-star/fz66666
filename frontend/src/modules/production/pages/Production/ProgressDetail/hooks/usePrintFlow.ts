import { useCallback, useMemo, useState, useEffect } from 'react';
import { ProductionOrder } from '@/types/production';

export const usePrintFlow = () => {
  const [printingRecord, setPrintingRecord] = useState<ProductionOrder | null>(null);
  const [printModalVisible, setPrintModalVisible] = useState(false);

  useEffect(() => {
    if (printingRecord) {
      setPrintModalVisible(true);
    }
  }, [printingRecord]);

  const closePrintModal = useCallback(() => {
    setPrintModalVisible(false);
    setPrintingRecord(null);
  }, []);

  return useMemo(() => ({ printingRecord, printModalVisible, setPrintingRecord, closePrintModal }), [printingRecord, printModalVisible, setPrintingRecord, closePrintModal]);
};
