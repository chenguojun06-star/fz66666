package com.fashion.supplychain.intelligence.service;

import lombok.Data;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Pattern;

@Slf4j
@Service
public class ProactiveRiskDetectionService {

    private static final Pattern OVERDUE_PATTERN = Pattern.compile("(逾期|超期|过期|延迟|延期|推迟)");
    private static final Pattern QUALITY_PATTERN = Pattern.compile("(次品|瑕疵|质量|返工|报废|不合格|退货)");
    private static final Pattern FINANCE_PATTERN = Pattern.compile("(结[算账]|付款|收款|扣款|罚款|赔[偿付])");
    private static final Pattern CAPACITY_PATTERN = Pattern.compile("(产能|来不及|做不完|不够用|[不没]够|饱和)");
    private static final Pattern FACTORY_SILENCE_PATTERN = Pattern.compile("(工厂.*[没无].*[回复应话动]|[没无].*[回复应话动].*工厂|沉默|失联)");

    @Data
    public static class RiskScanResult {
        private final List<DetectedRisk> risks;
        private final String overallRiskLevel;
        private final String recommendation;

        public RiskScanResult(List<DetectedRisk> risks) {
            this.risks = risks;
            this.overallRiskLevel = computeOverallLevel(risks);
            this.recommendation = buildRecommendation(risks);
        }

        public boolean hasRisks() {
            return risks != null && !risks.isEmpty();
        }

        private static String computeOverallLevel(List<DetectedRisk> risks) {
            if (risks.isEmpty()) return "safe";
            boolean hasCritical = risks.stream().anyMatch(r -> "critical".equals(r.level));
            boolean hasHigh = risks.stream().anyMatch(r -> "high".equals(r.level));
            if (hasCritical) return "critical";
            if (hasHigh) return "high";
            if (risks.size() >= 3) return "medium";
            return "low";
        }

        private static String buildRecommendation(List<DetectedRisk> risks) {
            if (risks.isEmpty()) return "当前无显著风险";
            if (risks.size() == 1) return risks.get(0).responseSuggestion;
            return "存在" + risks.size() + "类风险，请逐一核实";
        }

        public String toPromptInjection() {
            if (risks == null || risks.isEmpty()) return "";

            StringBuilder sb = new StringBuilder();
            sb.append("\n## ⚠️ 系统自动检测到的潜在风险\n");
            sb.append("在回答用户问题前，请注意以下风险：\n\n");

            for (DetectedRisk risk : risks) {
                sb.append(String.format("- %s **%s**: %s\n",
                        risk.getEmoji(), risk.category, risk.description));
            }

            sb.append("\n在回答中必须覆盖这些风险点，给用户明确的风险提示和应对建议。\n");
            return sb.toString();
        }
    }

    @Data
    public static class DetectedRisk {
        private String category;
        private String level;
        private String description;
        private String responseSuggestion;
        private String emoji;

        public DetectedRisk(String category, String level, String description,
                             String responseSuggestion) {
            this.category = category;
            this.level = level;
            this.description = description;
            this.responseSuggestion = responseSuggestion;
            this.emoji = "critical".equals(level) ? "🔴" : "high".equals(level) ? "🟠"
                    : "medium".equals(level) ? "🟡" : "🟢";
        }
    }

    public RiskScanResult scanUserMessage(String userMessage) {
        List<DetectedRisk> risks = new ArrayList<>();

        if (userMessage == null || userMessage.isBlank()) {
            return new RiskScanResult(risks);
        }

        if (OVERDUE_PATTERN.matcher(userMessage).find()) {
            risks.add(new DetectedRisk("交期风险", "high",
                    "用户问题涉及逾期/延迟相关话题",
                    "在回答时需要关注逾期订单的具体原因、责任人、预计恢复时间，并给出明确的跟进建议"));
        }

        if (QUALITY_PATTERN.matcher(userMessage).find()) {
            risks.add(new DetectedRisk("质量风险", "high",
                    "用户问题涉及质量问题",
                    "在回答时需要关注次品率、返工次数、质检记录，提醒用户确认质量标准"));
        }

        if (FINANCE_PATTERN.matcher(userMessage).find()) {
            risks.add(new DetectedRisk("财务风险", "critical",
                    "用户问题涉及结算/付款/罚款",
                    "在回答时需要核查结算金额准确性、审批状态、合同条款，建议用户复核后再操作"));
        }

        if (CAPACITY_PATTERN.matcher(userMessage).find()) {
            risks.add(new DetectedRisk("产能风险", "high",
                    "用户问题涉及产能不足/来不及",
                    "在回答时需要核查工厂当前在制订单数、产能利用率、历史准时率，给出产能评估"));
        }

        if (FACTORY_SILENCE_PATTERN.matcher(userMessage).find()) {
            risks.add(new DetectedRisk("沟通风险", "medium",
                    "用户问题涉及工厂沉默/失联",
                    "在回答时需要建议多种沟通渠道（电话/微信/企业微信），标注最近沟通时间"));
        }

        if (userMessage.contains("转厂") || userMessage.contains("换厂") || userMessage.contains("撤单")) {
            risks.add(new DetectedRisk("操作风险", "critical",
                    "用户可能要进行转厂/换厂/撤单等高风险操作",
                    "操作前必须确认：①新工厂产能 ②转厂对交期的影响 ③原合同的违约条款 ④是否需要审批"));
        }

        if (userMessage.contains("关闭订单") || userMessage.contains("关单") || userMessage.contains("报废")) {
            risks.add(new DetectedRisk("终态风险", "critical",
                    "用户要关闭或报废订单",
                    "请精确区分关闭=正常关单结算 和 报废=质量问题作废。操作不可逆，必须二次确认"));
        }

        return new RiskScanResult(risks);
    }

    public RiskScanResult scanAiResponse(String userMessage, String aiResponse) {
        List<DetectedRisk> risks = new ArrayList<>();

        if (aiResponse == null || aiResponse.isBlank()) {
            return new RiskScanResult(risks);
        }

        if (aiResponse.contains("可能") && !aiResponse.contains("数据")) {
            risks.add(new DetectedRisk("模糊表述", "low",
                    "AI回答使用了模糊词'可能'但无数据支撑",
                    "如无确切数据，建议明确说'需要查询确认'"));
        }

        if (aiResponse.contains("据我所知") || aiResponse.contains("我认为") || aiResponse.contains("我觉得")) {
            risks.add(new DetectedRisk("主观推测", "medium",
                    "AI回答包含主观推测表述",
                    "应改用'系统数据显示'或'根据查询结果'等有数据支撑的表述"));
        }

        Map<String, String> contradictions = detectContradictions(aiResponse);
        if (!contradictions.isEmpty()) {
            for (Map.Entry<String, String> entry : contradictions.entrySet()) {
                risks.add(new DetectedRisk("逻辑矛盾", "high",
                        entry.getKey() + " 和 " + entry.getValue() + " 可能矛盾",
                        "检查数据一致性，确保不出现自相矛盾的表述"));
            }
        }

        return new RiskScanResult(risks);
    }

    private Map<String, String> detectContradictions(String text) {
        Map<String, String> contradictions = new LinkedHashMap<>();

        if (text.contains("已经完成") && text.contains("还没")) {
            contradictions.put("已完成", "还未完成");
        }
        if (text.contains("全部") && (text.contains("部分") || text.contains("只有") || text.contains("仅"))) {
            contradictions.put("全部", "部分");
        }
        if (text.contains("正常") && text.contains("异常")) {
            contradictions.put("正常", "异常");
        }

        return contradictions;
    }
}