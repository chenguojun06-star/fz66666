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
  // D-221：合格证字段透传（StyleInfo 已有）
  styleName?: string;
  salesPrice?: number | string;
  tagPrice?: number | string;
  executeStandard?: string;
  safetyCategory?: string;
  qualityGrade?: string;
  inspector?: string;
}

export const useLabelPrint = () => {
  const [labelPrintOpen, setLabelPrintOpen] = useState(false);
  const [labelPrintOrder, setLabelPrintOrder] = useState<ProductionOrder | null>(null);
  const [labelPrintStyle, setLabelPrintStyle] = useState<LabelPrintStyleInfo | null>(null);
  const [labelPrintLoading, setLabelPrintLoading] = useState(false);

  const handlePrintLabel = useCallback(async (record: ProductionOrder) => {
    setLabelPrintLoading(true);
    setLabelPrintOrder(record);
    setLabelPrintStyle(null);
    setLabelPrintOpen(true);
    try {
      if (record.styleId || record.styleNo) {
        const styleInfo = await getStyleInfoByRef(record.styleId, record.styleNo);
        const d: Partial<LabelPrintStyleInfo> = styleInfo ?? {};
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
          styleName: d.styleName,
          salesPrice: d.salesPrice,
          tagPrice: d.tagPrice,
          executeStandard: d.executeStandard,
          safetyCategory: d.safetyCategory,
          qualityGrade: d.qualityGrade,
          inspector: d.inspector,
        });
      }
    } finally {
      setLabelPrintLoading(false);
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
    labelPrintLoading,
    handlePrintLabel,
    closeLabelPrint,
  };
};
