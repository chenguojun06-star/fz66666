// P1-3: 小云主动洞察 — 对应后端 ProactiveInsightService.InsightItem
export interface ProactiveInsightItem {
  id: string;
  type: string;          // delay_risk / combo_risk / ...
  title: string;
  content: string;
  severity: string;      // high / medium / low
  createdAt: number;     // epoch millis
}
