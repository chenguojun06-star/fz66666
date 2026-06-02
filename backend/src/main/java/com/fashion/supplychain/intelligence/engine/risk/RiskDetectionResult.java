package com.fashion.supplychain.intelligence.engine.risk;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class RiskDetectionResult {
    private Map<RiskType, List<RiskItem>> byType;
    private List<RiskItem> ranked;
    private List<RiskItem> deduped;
    private long durationMs;
    private int highCount;
    private int criticalCount;

    public static RiskDetectionResult build(Map<RiskType, List<RiskItem>> byType,
                                              List<RiskItem> ranked,
                                              List<RiskItem> deduped, long durationMs) {
        int high = 0, critical = 0;
        for (RiskItem item : deduped) {
            if (item.isCritical()) critical++;
            else if (item.isHigh()) high++;
        }
        return new RiskDetectionResult(byType, ranked, deduped, durationMs, high, critical);
    }

    public List<RiskItem> highAndAbove() {
        List<RiskItem> result = new ArrayList<>();
        for (RiskItem item : deduped) if (item.isHigh()) result.add(item);
        return result;
    }
}
