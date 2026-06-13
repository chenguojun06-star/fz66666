export interface WhatIfParams {
  orderIds: string;
  scenarios: { type: string; value: number; factoryId?: string }[];
}

export interface ScenarioResult {
  scenarioKey: string;
  description: string;
  finishDateDeltaDays: number;
  costDelta: number;
  overdueRiskDelta: number;
  score: number;
  action: string;
  rationale?: string;
  targetFactoryName?: string;
}

export interface WhatIfResult {
  baseline: ScenarioResult;
  scenarios: ScenarioResult[];
  recommendedScenario: string;
  summary: string;
}

export interface ForecastRequest {
  forecastType: 'COST' | 'MATERIAL' | 'DEMAND';
  subjectId: string;
  horizon?: string;
}

export interface ForecastResult {
  forecastType: string;
  predictedValue: number;
  confidence: number;
  optimisticLow: number;
  pessimisticHigh: number;
  algorithm: string;
  rationale?: string;
}

export interface VisualAIRequest {
  imageUrl: string;
  taskType: 'DEFECT_DETECT' | 'STYLE_IDENTIFY' | 'COLOR_CHECK';
  styleNo?: string;
  colorCode?: string;
}

export interface VisualDefect {
  type: string;
  description: string;
  level: 'LOW' | 'MEDIUM' | 'HIGH';
  location?: string;
}

export interface VisualAIResponse {
  taskType: string;
  success: boolean;
  severity?: 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  confidence: number;
  defects?: VisualDefect[];
  styleFeatures?: Record<string, string>;
  colorAssessment?: string;
  summary: string;
  suggestion?: string;
  logId?: number;
  errorMessage?: string;
}

/** 样衣图片结构化字段识别结果 — 用于自动填充表单 */
export interface StyleFieldParseResult {
  imageUrl: string;
  available: boolean;
  errorMessage?: string;
  overallConfidence: number;
  styleConfidence: number;
  colorConfidence: number;
  needManualReview: boolean;
  reviewHint?: string;
  styleName?: string;
  colors: string[];
  category?: string;
  season?: string;
  pattern?: string;
  fabric?: string;
  sleeveType?: string;
  neckline?: string;
  version?: string;
  summary?: string;
}
