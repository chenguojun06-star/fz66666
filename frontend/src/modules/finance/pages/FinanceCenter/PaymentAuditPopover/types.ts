export interface CheckItem {
  label: string;
  status: 'ok' | 'warn' | 'danger';
  detail: string;
}

export interface AnalysisResult {
  risk: string;
  suggestion: string;
  suggestionText: string;
  checks: CheckItem[];
  breakdown: { label: string; value: string }[];
}
