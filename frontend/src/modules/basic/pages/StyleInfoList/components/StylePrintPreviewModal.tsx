import React from 'react';
import StylePrintModal from '@/components/common/StylePrintModal';
import { StyleInfo } from '@/types/style';
import { getStyleCardSizeText, getStyleCardColorText, getStyleCardQuantityText } from '@/utils/cardSizeQuantity';

interface StylePrintPreviewModalProps {
  visible: boolean;
  record: StyleInfo | null;
  onClose: () => void;
}

/**
 * 款式打印预览弹窗
 * 包装 StylePrintModal，处理 record → 打印参数的转换
 */
const StylePrintPreviewModal: React.FC<StylePrintPreviewModalProps> = ({
  visible,
  record,
  onClose,
}) => {
  return (
    <StylePrintModal
      visible={visible}
      onClose={onClose}
      styleId={record?.id}
      styleNo={record?.styleNo}
      styleName={record?.styleName}
      cover={record?.cover}
      color={record ? getStyleCardColorText(record) : undefined}
      sizes={record ? getStyleCardSizeText(record) : undefined}
      quantity={record ? Number(getStyleCardQuantityText(record) || '0') || undefined : undefined}
      category={record?.category}
      season={record?.season}
      sizeColorConfig={(record as any)?.sizeColorConfig}
    />
  );
};

export default StylePrintPreviewModal;
