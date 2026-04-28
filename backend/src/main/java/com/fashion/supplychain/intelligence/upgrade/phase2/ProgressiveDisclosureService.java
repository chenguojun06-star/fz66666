package com.fashion.supplychain.intelligence.upgrade.phase2;

import lombok.Data;
import org.springframework.stereotype.Service;

import java.util.*;

@Service
public class ProgressiveDisclosureService {

    public DisclosureResponse build(String summary, int confidence,
                                    Map<String, Object> data,
                                    String dataSource, String toolName,
                                    List<String> calculationSteps) {
        DisclosureResponse resp = new DisclosureResponse();
        resp.summary = summary;
        resp.confidence = confidence;
        resp.confidenceLevel = resolveLevel(confidence);

        if (data != null && !data.isEmpty()) {
            DetailLayer detail = new DetailLayer();
            detail.metrics = data;
            if (data.containsKey("quantity") && data.containsKey("unitPrice") && data.containsKey("totalAmount")) {
                detail.calculation = data.get("quantity") + " × " + data.get("unitPrice") + " = " + data.get("totalAmount");
            }
            if (data.containsKey("scanCount") && data.containsKey("orderCount")) {
                detail.trend = "扫码" + data.get("scanCount") + "次, 关联" + data.get("orderCount") + "个订单";
            }
            if (data.containsKey("percentage") || data.containsKey("progress")) {
                double pct = data.containsKey("percentage")
                        ? ((Number) data.get("percentage")).doubleValue()
                        : ((Number) data.get("progress")).doubleValue();
                detail.trend = String.format("进度: %.1f%%", pct * 100);
            }
            resp.detail = detail;
        }

        EvidenceLayer evidence = new EvidenceLayer();
        evidence.dataSource = dataSource != null ? dataSource : "工具计算结果";
        evidence.toolName = toolName;
        evidence.calculationSteps = calculationSteps != null ? calculationSteps : Collections.emptyList();
        if (data != null) {
            if (data.containsKey("items") && data.get("items") instanceof List) {
                evidence.recordCount = ((List<?>) data.get("items")).size();
            } else if (data.containsKey("count")) {
                evidence.recordCount = ((Number) data.get("count")).intValue();
            }
        }
        resp.evidence = evidence;
        return resp;
    }

    private String resolveLevel(int confidence) {
        if (confidence >= 80) return "high";
        if (confidence >= 50) return "medium";
        return "low";
    }

    @Data
    public static class DisclosureResponse {
        private String summary;
        private int confidence;
        private String confidenceLevel;
        private DetailLayer detail;
        private EvidenceLayer evidence;
    }

    @Data
    public static class DetailLayer {
        private Map<String, Object> metrics;
        private String calculation;
        private String trend;
    }

    @Data
    public static class EvidenceLayer {
        private String dataSource;
        private int recordCount;
        private String toolName;
        private List<String> calculationSteps;
    }
}
