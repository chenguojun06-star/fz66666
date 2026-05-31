package com.fashion.supplychain.intelligence.service;

import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.intelligence.entity.IntelligenceFeedbackRecord;
import com.fashion.supplychain.intelligence.mapper.IntelligenceFeedbackRecordMapper;
import lombok.Getter;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.stream.Collectors;

@Slf4j
@Service
public class PromptEvolutionService {

    @Autowired
    private IntelligenceFeedbackRecordMapper feedbackMapper;

    @Autowired
    private JdbcTemplate jdbc;

    @Value("${xiaoyun.prompt-evolution.enabled:true}")
    private boolean evolutionEnabled;

    @Value("${xiaoyun.prompt-evolution.min-feedback-count:5}")
    private int minFeedbackCount;

    @Value("${xiaoyun.prompt-evolution.update-interval-hours:24}")
    private int updateIntervalHours;

    private final ConcurrentHashMap<Long, EvolvingPromptSegment> evolvingSegments = new ConcurrentHashMap<>();
    private long lastEvolutionTime = 0;

    @Getter
    public static class EvolvingPromptSegment {
        private String segmentName;
        private String currentContent;
        private String baseContent;
        private int iteration;
        private Map<String, Integer> improvements;
        private Map<String, Integer> failures;
        private long lastUpdated;

        public EvolvingPromptSegment(String name, String base) {
            this.segmentName = name;
            this.currentContent = base;
            this.baseContent = base;
            this.iteration = 0;
            this.improvements = new LinkedHashMap<>();
            this.failures = new LinkedHashMap<>();
            this.lastUpdated = System.currentTimeMillis();
        }
    }

    public EvolvingPromptSegment getSegment(String segmentName, String baseContent) {
        return evolvingSegments.computeIfAbsent(
                UserContext.tenantId() != null ? UserContext.tenantId() : 0L,
                k -> new EvolvingPromptSegment(segmentName, baseContent));
    }

    public String getEvolvedSystemPrompt(String segmentName, String baseContent) {
        if (!evolutionEnabled) return baseContent;

        EvolvingPromptSegment segment = getSegment(segmentName, baseContent);

        maybeEvolve(segment);

        if (segment.getImprovements().isEmpty()) return baseContent;

        StringBuilder evolved = new StringBuilder(baseContent);
        evolved.append("\n\n---\n## 自进化优化（第").append(segment.getIteration()).append("次）\n");

        List<Map.Entry<String, Integer>> sortedImprovements = segment.getImprovements().entrySet().stream()
                .sorted(Map.Entry.<String, Integer>comparingByValue().reversed())
                .limit(3)
                .collect(Collectors.toList());

        for (Map.Entry<String, Integer> entry : sortedImprovements) {
            if (entry.getValue() >= 2) {
                evolved.append("- 优化建议: ").append(entry.getKey()).append("\n");
            }
        }

        if (!segment.getFailures().isEmpty()) {
            List<Map.Entry<String, Integer>> sortedFailures = segment.getFailures().entrySet().stream()
                    .sorted(Map.Entry.<String, Integer>comparingByValue().reversed())
                    .limit(3)
                    .collect(Collectors.toList());

            evolved.append("\n近期常见问题（请避免）:\n");
            for (Map.Entry<String, Integer> entry : sortedFailures) {
                if (entry.getValue() >= 2) {
                    evolved.append("- ❌ ").append(entry.getKey()).append(" (发生").append(entry.getValue()).append("次)\n");
                }
            }
        }

        return evolved.toString();
    }

    public void recordFeedback(String sessionId, String userMessage, String aiResponse,
                                double score, String issues) {
        if (!evolutionEnabled) return;

        try {
            Long tenantId = UserContext.tenantId();
            EvolvingPromptSegment segment = evolvingSegments.get(tenantId != null ? tenantId : 0L);
            if (segment == null) return;

            if (score >= 85) {
                segment.improvements.merge("高质量回答模式: " + extractPattern(userMessage, aiResponse), 1, Integer::sum);
            }

            if (score < 60 && issues != null && !issues.isBlank()) {
                segment.failures.merge(issues.length() > 100 ? issues.substring(0, 100) : issues, 1, Integer::sum);
            }

            cleanOldFeedback(segment);

        } catch (Exception e) {
            log.debug("[PromptEvolution] 记录反馈失败: {}", e.getMessage());
        }
    }

    private void maybeEvolve(EvolvingPromptSegment segment) {
        long now = System.currentTimeMillis();
        if (now - lastEvolutionTime < updateIntervalHours * 3600_000L) return;

        int totalFeedback = segment.improvements.values().stream().mapToInt(Integer::intValue).sum()
                + segment.failures.values().stream().mapToInt(Integer::intValue).sum();

        if (totalFeedback < minFeedbackCount) return;

        segment.iteration++;
        segment.lastUpdated = now;
        lastEvolutionTime = now;

        log.info("[PromptEvolution] 第{}次进化: +{}条优化 / {}条失败",
                segment.getIteration(),
                segment.improvements.size(),
                segment.failures.size());
    }

    private void cleanOldFeedback(EvolvingPromptSegment segment) {
        if (segment.improvements.size() > 20) {
            segment.improvements.entrySet().removeIf(e -> e.getValue() <= 1);
        }
        if (segment.failures.size() > 20) {
            segment.failures.entrySet().removeIf(e -> e.getValue() <= 1);
        }
    }

    private String extractPattern(String userMessage, String aiResponse) {
        if (aiResponse == null || aiResponse.length() < 20) return "简短回答";

        if (aiResponse.contains("根据系统数据") || aiResponse.contains("查询结果显示")) {
            return "数据引用模式";
        }
        if (aiResponse.contains("行动建议") || aiResponse.contains("建议")) {
            return "行动建议模式";
        }
        if (aiResponse.contains("🔴") || aiResponse.contains("🟠") || aiResponse.contains("风险")) {
            return "风险预警模式";
        }
        if (aiResponse.contains("对比") || aiResponse.contains("vs") || aiResponse.contains("VS")) {
            return "对比分析模式";
        }

        return "通用回答模式";
    }

    public void analyzeFeedbackTrends(Long tenantId) {
        if (!evolutionEnabled || tenantId == null) return;

        try {
            LocalDateTime since = LocalDateTime.now().minusHours(updateIntervalHours);

            List<IntelligenceFeedbackRecord> recentFeedback = feedbackMapper.selectList(
                    new com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper<IntelligenceFeedbackRecord>()
                            .eq(IntelligenceFeedbackRecord::getTenantId, tenantId)
                            .ge(IntelligenceFeedbackRecord::getCreateTime, since)
                            .orderByDesc(IntelligenceFeedbackRecord::getCreateTime)
                            .last("LIMIT 50"));

            if (recentFeedback.isEmpty()) return;

            Map<String, Integer> issueFrequency = new LinkedHashMap<>();
            Map<String, Integer> successPatterns = new LinkedHashMap<>();

            for (IntelligenceFeedbackRecord fb : recentFeedback) {
                String reason = fb.getFeedbackReason();
                if (reason == null) continue;

                if (reason.contains("rejected") || reason.contains("低分") || reason.contains("问题")) {
                    String issue = extractIssueCategory(reason);
                    issueFrequency.merge(issue, 1, Integer::sum);
                } else {
                    String pattern = extractPattern(fb.getSuggestionContent(),
                            fb.getSuggestionContent() != null ? fb.getSuggestionContent() : "");
                    successPatterns.merge(pattern, 1, Integer::sum);
                }
            }

            EvolvingPromptSegment segment = evolvingSegments.computeIfAbsent(tenantId,
                    k -> new EvolvingPromptSegment("system", ""));

            issueFrequency.forEach((k, v) -> segment.failures.merge(k, v, Integer::sum));
            successPatterns.forEach((k, v) -> segment.improvements.merge(k, v, Integer::sum));

            log.info("[PromptEvolution] 趋势分析完成: tenant={} feedbacks={} issues={} patterns={}",
                    tenantId, recentFeedback.size(), issueFrequency.size(), successPatterns.size());

        } catch (Exception e) {
            log.debug("[PromptEvolution] 趋势分析跳过: {}", e.getMessage());
        }
    }

    private String extractIssueCategory(String reason) {
        if (reason == null) return "未知";
        if (reason.contains("数据") || reason.contains("数字") || reason.contains("真实性")) return "数据问题";
        if (reason.contains("工具") || reason.contains("查询")) return "工具使用";
        if (reason.contains("完整")) return "回答不完整";
        if (reason.contains("幻觉") || reason.contains("编造")) return "幻觉";
        if (reason.contains("上下文") || reason.contains("历史")) return "上下文利用";
        return "其他";
    }

    public List<Map<String, Object>> getPendingProposals() {
        try {
            return jdbc.queryForList(
                    "SELECT id, type, content, status, create_time FROM t_xiaoyun_evolution_log "
                            + "WHERE status IN ('PROPOSED','TESTED') ORDER BY create_time DESC LIMIT 50");
        } catch (Exception e) {
            log.debug("[PromptEvolution] 查询待处理提案失败: {}", e.getMessage());
            return new ArrayList<>();
        }
    }

    public List<Map<String, Object>> getEvolutionHistory(int days) {
        try {
            return jdbc.queryForList(
                    "SELECT id, type, content, status, create_time FROM t_xiaoyun_evolution_log "
                            + "WHERE create_time >= DATE_SUB(NOW(), INTERVAL ? DAY) "
                            + "ORDER BY create_time DESC LIMIT 200", days);
        } catch (Exception e) {
            log.debug("[PromptEvolution] 查询进化历史失败: {}", e.getMessage());
            return new ArrayList<>();
        }
    }

    public Map<String, String> getAllActiveOverrides() {
        try {
            List<Map<String, Object>> rows = jdbc.queryForList(
                    "SELECT content, status FROM t_xiaoyun_evolution_log "
                            + "WHERE type = 'PROMPT_OVERRIDE' AND status = 'DEPLOYED' "
                            + "ORDER BY create_time DESC LIMIT 20");
            Map<String, String> overrides = new LinkedHashMap<>();
            for (Map<String, Object> row : rows) {
                String content = String.valueOf(row.getOrDefault("content", ""));
                String status = String.valueOf(row.getOrDefault("status", ""));
                overrides.put(status, content);
            }
            return overrides;
        } catch (Exception e) {
            log.debug("[PromptEvolution] 查询活跃覆盖失败: {}", e.getMessage());
            return new LinkedHashMap<>();
        }
    }

    public boolean approveProposal(String proposalId) {
        try {
            int updated = jdbc.update(
                    "UPDATE t_xiaoyun_evolution_log SET status = 'APPROVED' WHERE id = ?", proposalId);
            return updated > 0;
        } catch (Exception e) {
            log.debug("[PromptEvolution] 审批提案失败: {}", e.getMessage());
            return false;
        }
    }

    public boolean rollbackProposal(String proposalId) {
        try {
            int updated = jdbc.update(
                    "UPDATE t_xiaoyun_evolution_log SET status = 'ROLLED_BACK' WHERE id = ?", proposalId);
            return updated > 0;
        } catch (Exception e) {
            log.debug("[PromptEvolution] 回滚提案失败: {}", e.getMessage());
            return false;
        }
    }
}