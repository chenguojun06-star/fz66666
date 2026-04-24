package com.fashion.supplychain.intelligence.service;

import com.fashion.supplychain.common.UserContext;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.*;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@Slf4j
@Service
public class DataTruthGuard {

    private static final Pattern NUMBER_PATTERN = Pattern.compile("(\\d+(?:\\.\\d+)?)\\s*%?");
    private static final Set<String> FABRICATED_INDICATORS = Set.of(
            "模拟数据", "虚拟数据", "演示数据", "示例数据", "参考值如下",
            "默认值如下", "假设性数据", "编造", "虚构的"
    );

    public static class TruthCheckResult {
        private final boolean passed;
        private final String reason;
        private final String dataSource;

        public TruthCheckResult(boolean passed, String reason, String dataSource) {
            this.passed = passed;
            this.reason = reason;
            this.dataSource = dataSource;
        }

        public boolean isPassed() { return passed; }
        public String getReason() { return reason; }
        public String getDataSource() { return dataSource; }
    }

    public static class NumericConsistencyResult {
        private final boolean consistent;
        private final List<String> mismatches;

        public NumericConsistencyResult(boolean consistent, List<String> mismatches) {
            this.consistent = consistent;
            this.mismatches = mismatches;
        }

        public boolean isConsistent() { return consistent; }
        public List<String> getMismatches() { return mismatches; }
    }

    public TruthCheckResult checkTenantIntegrity() {
        Long tenantId = UserContext.tenantId();
        if (tenantId == null || tenantId <= 0) {
            return new TruthCheckResult(false, "租户ID缺失，数据无法归属", "unknown");
        }
        return new TruthCheckResult(true, null, "tenant_verified");
    }

    public TruthCheckResult checkAiOutputTruth(String aiContent, String toolEvidence) {
        if (aiContent == null || aiContent.isBlank()) {
            return new TruthCheckResult(false, "AI输出为空", "none");
        }

        boolean hasToolEvidence = toolEvidence != null && !toolEvidence.isBlank()
                && !toolEvidence.contains("\"error\"") && !toolEvidence.contains("未找到");

        long fabricatedCount = FABRICATED_INDICATORS.stream()
                .filter(indicator -> aiContent.contains(indicator))
                .count();

        if (!hasToolEvidence && fabricatedCount >= 2) {
            return new TruthCheckResult(false,
                    "AI输出含虚构指示词且无工具数据支撑", "ai_unverified");
        }

        if (hasToolEvidence && fabricatedCount >= 3) {
            return new TruthCheckResult(false,
                    "AI输出含多个虚构指示词，即使有部分工具数据也需审查", "ai_partial_unverified");
        }

        String dataSource = hasToolEvidence ? "ai_with_evidence" : "ai_no_evidence";
        return new TruthCheckResult(true, null, dataSource);
    }

    public NumericConsistencyResult checkNumericConsistency(String aiContent, String toolEvidence) {
        if (aiContent == null || toolEvidence == null || toolEvidence.isBlank()) {
            return new NumericConsistencyResult(true, Collections.emptyList());
        }

        Set<Double> toolNumbers = extractNumbers(toolEvidence);
        if (toolNumbers.isEmpty()) {
            return new NumericConsistencyResult(true, Collections.emptyList());
        }

        Set<Double> aiNumbers = extractNumbers(aiContent);
        List<String> mismatches = new ArrayList<>();

        for (Double aiNum : aiNumbers) {
            if (aiNum < 1) continue;
            boolean found = false;
            for (Double toolNum : toolNumbers) {
                double tolerance = Math.max(Math.abs(toolNum) * 0.05, 1.0);
                if (Math.abs(aiNum - toolNum) <= tolerance) {
                    found = true;
                    break;
                }
            }
            if (!found) {
                mismatches.add("AI输出数字 " + aiNum + " 在工具数据中无匹配");
            }
        }

        return new NumericConsistencyResult(mismatches.isEmpty(), mismatches);
    }

    private Set<Double> extractNumbers(String text) {
        Set<Double> numbers = new HashSet<>();
        if (text == null) return numbers;
        Matcher m = NUMBER_PATTERN.matcher(text);
        while (m.find()) {
            try {
                numbers.add(Double.parseDouble(m.group(1)));
            } catch (NumberFormatException e) { log.debug("数字解析失败: {}", e.getMessage()); }
        }
        return numbers;
    }

    public String tagDataSource(String content, String source) {
        if (content == null || source == null) return content;
        if (content.contains("[数据来源：")) return content;
        String tag = switch (source) {
            case "real" -> "[数据来源：真实业务记录]";
            case "ai_with_evidence" -> "[数据来源：AI分析+工具数据验证]";
            default -> null;
        };
        if (tag == null) return content;
        return tag + "\n\n" + content;
    }

    public Map<String, Object> validateNumericData(String field, Number value, Number min, Number max, String source) {
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("field", field);
        result.put("value", value);
        result.put("source", source != null ? source : "unknown");

        if (value == null) {
            result.put("valid", false);
            result.put("reason", "数值为空");
            return result;
        }
        if (min != null && value.doubleValue() < min.doubleValue()) {
            result.put("valid", false);
            result.put("reason", "数值低于合理下限 " + min);
            return result;
        }
        if (max != null && value.doubleValue() > max.doubleValue()) {
            result.put("valid", false);
            result.put("reason", "数值超过合理上限 " + max);
            return result;
        }
        result.put("valid", true);
        return result;
    }

    public boolean isMockModeActive() {
        return "mock".equalsIgnoreCase(System.getenv("SPRING_PROFILES_ACTIVE"))
                || Boolean.parseBoolean(System.getenv("MOCK_ENABLED"));
    }

    public Map<String, Object> auditDataTruth(String endpoint, Object responseData) {
        Map<String, Object> audit = new LinkedHashMap<>();
        audit.put("endpoint", endpoint);
        audit.put("timestamp", System.currentTimeMillis());
        audit.put("tenantId", UserContext.tenantId());
        audit.put("userId", UserContext.userId());
        audit.put("mockMode", isMockModeActive());
        if (responseData instanceof Map) {
            @SuppressWarnings("unchecked")
            Map<String, Object> map = (Map<String, Object>) responseData;
            audit.put("dataKeys", map.keySet());
            if (map.containsKey("dataSource")) {
                audit.put("dataSource", map.get("dataSource"));
            }
            if (map.containsKey("sampleStyleCount")) {
                audit.put("warning", "sampleStyleCount可能为虚假数据");
            }
        }
        return audit;
    }
}
