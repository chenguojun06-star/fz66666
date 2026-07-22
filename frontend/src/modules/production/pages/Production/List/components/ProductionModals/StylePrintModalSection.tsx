import React from 'react';
import StylePrintModal from '@/components/common/StylePrintModal';
import { ProductionOrder } from '@/types/production';
import { parseProductionOrderLines } from '@/utils/api';

interface StylePrintModalSectionProps {
  printModalVisible: boolean;
  setPrintModalVisible: (visible: boolean) => void;
  printingRecord: ProductionOrder | null;
  setPrintingRecord: (record: ProductionOrder | null) => void;
}

const StylePrintModalSection: React.FC<StylePrintModalSectionProps> = ({
  printModalVisible,
  setPrintModalVisible,
  printingRecord,
  setPrintingRecord,
}) => {
  return (
    <StylePrintModal
      visible={printModalVisible}
      onClose={() => { setPrintModalVisible(false); setPrintingRecord(null); }}
      styleId={printingRecord?.styleId}
      orderId={printingRecord?.id}
      orderNo={printingRecord?.orderNo}
      styleNo={printingRecord?.styleNo}
      styleName={printingRecord?.styleName}
      cover={printingRecord?.styleCover}
      color={printingRecord?.color}
      quantity={printingRecord?.orderQuantity}
      category={(printingRecord as any)?.category}
      mode="production"
      extraInfo={{
        '订单号': printingRecord?.orderNo,
        '订单数量': printingRecord?.orderQuantity,
        '加工厂': printingRecord?.factoryName,
        '跟单员': printingRecord?.merchandiser,
        '交期': printingRecord?.plannedEndDate,
      }}
      sizeDetails={printingRecord ? parseProductionOrderLines(printingRecord) : []}
    />
  );
};

export default StylePrintModalSection;
