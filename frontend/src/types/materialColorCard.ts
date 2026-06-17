/** 物料色卡识别结果类型定义 */

export interface MaterialFieldValue {
  textValue?: string;
  numberValue?: number;
  confidence?: number;
  rawText?: string;
}

export interface MaterialColorCardRecognitionResult {
  success: boolean;
  errorMessage?: string;
  imageUrl?: string;
  overallConfidence?: number;
  aiHint?: string;

  materialName?: MaterialFieldValue;
  materialType?: MaterialFieldValue;
  color?: MaterialFieldValue;
  fabricWidth?: MaterialFieldValue;
  fabricWeight?: MaterialFieldValue;
  fabricComposition?: MaterialFieldValue;
  specifications?: MaterialFieldValue;
  unit?: MaterialFieldValue;
  supplierName?: MaterialFieldValue;
  unitPrice?: MaterialFieldValue;
  styleNo?: MaterialFieldValue;
  description?: MaterialFieldValue;
}

/** 前端内部使用：字段展示名 */
export const FIELD_DISPLAY: { key: keyof MaterialColorCardRecognitionResult; label: string; isTextField: boolean }[] = [
  { key: 'materialName', label: '物料名称', isTextField: true },
  { key: 'materialType', label: '物料类型', isTextField: true },
  { key: 'color', label: '颜色', isTextField: true },
  { key: 'fabricWidth', label: '幅宽', isTextField: true },
  { key: 'fabricWeight', label: '克重', isTextField: true },
  { key: 'fabricComposition', label: '成分', isTextField: true },
  { key: 'specifications', label: '规格', isTextField: true },
  { key: 'unit', label: '单位', isTextField: true },
  { key: 'supplierName', label: '供应商', isTextField: true },
  { key: 'unitPrice', label: '单价', isTextField: false },
  { key: 'styleNo', label: '款号', isTextField: true },
  { key: 'description', label: '备注', isTextField: true },
];
