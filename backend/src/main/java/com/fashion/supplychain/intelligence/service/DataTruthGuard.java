package com.fashion.supplychain.intelligence.service;

import com.fashion.supplychain.common.UserContext;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.*;

@Slf4j
@Service
public class DataTruthGuard {

    private static final Set<String> FABRICATED_INDICATORS = Set.of(
            "大约", "约", "估计", "估算", "可能", "推测", "假设", "假设性",
            "模拟", "虚拟", "演示", "示例", "参考值", "默认值"
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

        if (!hasToolEvidence) {
            long fabricatedCount = FABRICATED_INDICATORS.stream()
                    .filter(indicator -> aiContent.contains(indicator))
                    .count();
            if (fabricatedCount >= 2) {
                return new TruthCheckResult(false,
                        "AI输出含多个虚构指示词且无工具数据支撑", "ai_unverified");
            }
        }

        String dataSource = hasToolEvidence ? "ai_with_evidence" : "ai_no_evidence";
        return new TruthCheckResult(true, null, dataSource);
    }

    public String tagDataSource(String content, String source) {
        if (content == null || source == null) return content;
        String tag = switch (source) {
            case "real" -> "[数据来源：真实业务记录]";
            case "ai_with_evidence" -> "[数据来源：AI分析+工具数据验证]";
            case "ai_no_evidence" -> "[数据来源：AI推理，未经工具数据验证，仅供参考]";
            case "simulated" -> "[数据来源：模拟推演，非真实数据]";
            case "default_estimate" -> "[数据来源：系统默认估算，非实测数据]";
            default -> "[数据来源：" + source + "]";
        };
        if (content.contains("[数据来源：")) return content;
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
