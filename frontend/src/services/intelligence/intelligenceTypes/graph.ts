export interface MetricsSceneStat {
  scene: string;
  total_calls: number;
  success_count: number;
  avg_latency_ms: number;
  fallback_count: number;
}

export interface ABSceneStat {
  scene: string;
  totalRuns: number;
  successCount: number;
  avgLatencyMs: number;
  avgConfidence: number;
  feedbackCount: number;
  avgFeedback: number;
}
