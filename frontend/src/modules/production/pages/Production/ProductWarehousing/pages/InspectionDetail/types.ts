export interface QualityBriefingData {
  order: {
    orderNo: string; styleNo: string; styleName: string;
    orderQuantity: number; color: string; size: string;
    factoryName: string; merchandiser: string; remarks: string;
    orderDetails: string; progressWorkflowJson: string; styleCover: string;
  };
  style: {
    cover: string; sizeColorConfig: string; category: string;
    styleNo: string; styleName: string; description: string;
    sampleReviewStatus?: string; sampleReviewComment?: string;
    sampleReviewer?: string; sampleReviewTime?: string;
  };
  bom: Array<{
    id: string; materialCode: string; materialName: string;
    materialType: string; color: string; size: string;
    unit: string; usageAmount: number; lossRate: number;
  }>;
  qualityTips: string[];
}

export interface InspectionDetailProps {
  orderId?: string;
  defaultTab?: string;
  embedded?: boolean;
  onClose?: () => void;
  /** 只读模式：仅展示入库进度/质检记录，隐藏质检与入库操作（入库已独立至成品仓模块） */
  readOnly?: boolean;
}
