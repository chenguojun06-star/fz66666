import { useState } from 'react';
import { StyleInfo } from '@/types/style';

/**
 * 款式打印 Hook
 * 管理打印预览弹窗状态
 */
export const useStylePrint = () => {
  const [printModalVisible, setPrintModalVisible] = useState(false);
  const [printingRecord, setPrintingRecord] = useState<StyleInfo | null>(null);

  const handlePrintClick = (record: StyleInfo) => {
    setPrintingRecord(record);
    setPrintModalVisible(true);
  };

  const closePrintModal = () => {
    setPrintModalVisible(false);
    setPrintingRecord(null);
  };

  return {
    printModalVisible,
    printingRecord,
    handlePrintClick,
    closePrintModal,
  };
};
