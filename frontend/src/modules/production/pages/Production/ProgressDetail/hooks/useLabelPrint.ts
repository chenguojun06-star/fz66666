import { useState, useCallback } from 'react';
import { getStyleInfoByRef } from '@/services/style/styleApi';
import { ProductionOrder } from '@/types/production';

export interface LabelPrintStyleInfo {
  fabricComposition?: string;
  fabricCompositionParts?: string;
  washInstructions?: string;
  uCode?: string;
  washTempCode?: string;
  bleachCode?: string;
  tumbleDryCode?: string;
  ironCode?: string;
  dryCleanCode?: string;
}

export const useLabelPrint = () => {
  const [labelPrintOpen, setLabelPrintOpen] = useState(false);
  const [labelPrintOrder, setLabelPrintOrder] = useState<ProductionOrder | null>(null);
  const [labelPrintStyle, setLabelPrintStyle] = useState<LabelPrintStyleInfo | null>(null);

  const handlePrintLabel = useCallback(async (record: ProductionOrder) => {
    setLabelPrintOrder(record);
    setLabelPrintStyle(null);
    setLabelPrintOpen(true);
    if (record.styleId || record.styleNo) {
      const styleInfo = await getStyleInfoByRef(record.styleId, record.styleNo);
      const d = styleInfo ?? {};
      setLabelPrintStyle({
        fabricComposition: d.fabricComposition,
        fabricCompositionParts: d.fabricCompositionParts,
        washInstructions: d.washInstructions,
        uCode: d.uCode,
        washTempCode: d.washTempCode,
        bleachCode: d.bleachCode,
        tumbleDryCode: d.tumbleDryCode,
        ironCode: d.ironCode,
        dryCleanCode: d.dryCleanCode,
      });
    }
  }, []);

  const closeLabelPrint = useCallback(() => {
    setLabelPrintOpen(false);
    setLabelPrintOrder(null);
    setLabelPrintStyle(null);
  }, []);

  return {
    labelPrintOpen,
    labelPrintOrder,
    labelPrintStyle,
    handlePrintLabel,
    closeLabelPrint,
  };
};
