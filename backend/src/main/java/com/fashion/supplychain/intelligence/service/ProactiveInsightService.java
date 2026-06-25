package com.fashion.supplychain.intelligence.service;

import com.fashion.supplychain.service.RedisService;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.Data;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Lazy;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.TimeUnit;

/**
 * 主动洞察推送服务
 * <p>
 * 将巡检Job发现的风险/异常记录为"洞察"，存入Redis供前端轮询获取，
 * 并在AI对话时注入到system prompt中，让AI主动提及相关洞察。
 * </p>
 * <p>Redis不可用时静默降级，不影响主流程。</p>
 */
@Service
@Lazy
@Slf4j
public class ProactiveInsightService {

    private static final String INSIGHT_PREFIX = "ai:insight:";
    private static final ObjectMapper OBJECT_MAPPER = new ObjectMapper();

    @Autowired(required = false)
    private RedisService redisService;

    @Value("${xiaoyun.proactive-insight.enabled:${XIAOYUN_PROACTIVE_INSIGHT_ENABLED:true}}")
    private boolean enabled;

    @Value("${xiaoyun.proactive-insight.max-unread:${XIAOYUN_PROACTIVE_INSIGHT_MAX_UNREAD:50}}")
    private int maxUnread;

    @Value("${xiaoyun.proactive-insight.ttl-hours:${XIAOYUN_PROACTIVE_INSIGHT_TTL_HOURS:4}}")
    private int ttlHours;

    /**
     * 生成并存储主动洞察
     * 在巡检Job发现异常时调用，将洞察存入Redis
     *
     * @param tenantId    租户ID
     * @param insightType 洞察类型（delay_risk/quality_alert/cost_anomaly/inventory_warning/combo_risk/stagnant_order）
     * @param title       洞察标题
     * @param content     洞察内容
     * @param severity    严重程度（info/warning/critical）
     */
    public void recordInsight(Long tenantId, String insightType,
                              String title, String content, String severity) {
        if (!enabled || redisService == null || tenantId == null) {
            return;
        }
        try {
            InsightItem item = new InsightItem();
            item.setId(UUID.randomUUID().toString().replace("-", "").substring(0, 12));
            item.setType(insightType);
            item.setTitle(title);
            item.setContent(content);
            item.setSeverity(severity);
            item.setCreatedAt(System.currentTimeMillis());

            String key = INSIGHT_PREFIX + tenantId;
            String json = OBJECT_MAPPER.writeValueAsString(item);
            redisService.set(key + ":" + item.getId(), json, ttlHours, TimeUnit.HOURS);

            // 维护洞察ID列表（用于遍历和限制数量）
            String indexKey = key + ":index";
            String indexValue = (String) redisService.get(indexKey);
            List<String> ids;
            if (indexValue != null && !indexValue.isBlank()) {
                ids = new ArrayList<>(List.of(indexValue.split(",")));
            } else {
                ids = new ArrayList<>();
            }
            ids.add(item.getId());

            // 限制未读洞察数量，移除最旧的
            while (ids.size() > maxUnread) {
                String oldestId = ids.remove(0);
                redisService.delete(key + ":" + oldestId);
            }

            redisService.set(indexKey, String.join(",", ids), ttlHours, TimeUnit.HOURS);
            log.debug("[ProactiveInsight] 记录洞察: tenant={} type={} severity={} title={}",
                    tenantId, insightType, severity, title);
        } catch (Exception e) {
            log.warn("[ProactiveInsight] 记录洞察失败（静默降级）: tenant={} err={}", tenantId, e.getMessage());
        }
    }

    /**
     * 获取未读洞察（用户打开AI助手时调用）
     *
     * @param tenantId 租户ID
     * @return 未读洞察列表
     */
    public List<InsightItem> getUnreadInsights(Long tenantId) {
        if (!enabled || redisService == null || tenantId == null) {
            return Collections.emptyList();
        }
        try {
            String key = INSIGHT_PREFIX + tenantId;
            String indexKey = key + ":index";
            String indexValue = (String) redisService.get(indexKey);
            if (indexValue == null || indexValue.isBlank()) {
                return Collections.emptyList();
            }

            List<InsightItem> items = new ArrayList<>();
            for (String id : indexValue.split(",")) {
                if (id.isBlank()) continue;
                String json = (String) redisService.get(key + ":" + id);
                if (json != null && !json.isBlank()) {
                    try {
                        items.add(OBJECT_MAPPER.readValue(json, InsightItem.class));
                    } catch (JsonProcessingException e) {
                        log.debug("[ProactiveInsight] 反序列化洞察失败: id={} err={}", id, e.getMessage());
                    }
                }
            }
            // 按时间倒序（最新的在前）
            items.sort((a, b) -> Long.compare(b.getCreatedAt(), a.getCreatedAt()));
            return items;
        } catch (Exception e) {
            log.warn("[ProactiveInsight] 获取未读洞察失败（静默降级）: tenant={} err={}", tenantId, e.getMessage());
            return Collections.emptyList();
        }
    }

    /**
     * 标记洞察已读
     *
     * @param tenantId  租户ID
     * @param insightId 洞察ID
     */
    public void markAsRead(Long tenantId, String insightId) {
        if (redisService == null || tenantId == null || insightId == null) {
            return;
        }
        try {
            String key = INSIGHT_PREFIX + tenantId;
            redisService.delete(key + ":" + insightId);

            // 从索引中移除
            String indexKey = key + ":index";
            String indexValue = (String) redisService.get(indexKey);
            if (indexValue != null && !indexValue.isBlank()) {
                List<String> ids = new ArrayList<>(List.of(indexValue.split(",")));
                ids.remove(insightId);
                if (ids.isEmpty()) {
                    redisService.delete(indexKey);
                } else {
                    redisService.set(indexKey, String.join(",", ids), ttlHours, TimeUnit.HOURS);
                }
            }
            log.debug("[ProactiveInsight] 标记已读: tenant={} insightId={}", tenantId, insightId);
        } catch (Exception e) {
            log.warn("[ProactiveInsight] 标记已读失败（静默降级）: tenant={} err={}", tenantId, e.getMessage());
        }
    }

    /**
     * 构建主动洞察注入文本（注入到AI system prompt中）
     * 让AI在回答时主动提及相关洞察
     *
     * @param tenantId 租户ID
     * @return 注入文本，无洞察时返回空字符串
     */
    public String buildInsightInjection(Long tenantId) {
        return buildRelevantInsightInjection(tenantId, null);
    }

    /**
     * 构建与用户问题相关的主动洞察注入文本（推荐使用）。
     * <p>根据用户消息智能过滤和排序相关洞察，减少token浪费。
     *
     * @param tenantId    租户ID
     * @param userMessage 用户消息（用于相关性匹配，为空则返回全部洞察）
     * @return 注入文本，无相关洞察时返回空字符串
     */
    public String buildRelevantInsightInjection(Long tenantId, String userMessage) {
        if (!enabled || tenantId == null) {
            return "";
        }
        List<InsightItem> insights = getUnreadInsights(tenantId);
        if (insights.isEmpty()) {
            return "";
        }

        // 如果有用户消息，做相关性过滤和排序
        List<InsightItem> relevantInsights = insights;
        if (userMessage != null && !userMessage.isBlank()) {
            relevantInsights = filterAndRankByRelevance(insights, userMessage);
        }

        if (relevantInsights.isEmpty()) {
            return "";
        }

        StringBuilder sb = new StringBuilder();
        sb.append("\n## \uD83D\uDCA1 系统主动洞察（巡检发现的问题，请在回答中主动提及）\n");

        // 按严重程度分组统计
        long criticalCount = relevantInsights.stream().filter(i -> "critical".equals(i.getSeverity())).count();
        long warningCount = relevantInsights.stream().filter(i -> "warning".equals(i.getSeverity())).count();
        long infoCount = relevantInsights.stream().filter(i -> "info".equals(i.getSeverity())).count();

        if (userMessage != null && !userMessage.isBlank()) {
            sb.append(String.format("找到 %d 条与您问题相关的洞察（%d 严重 / %d 警告 / %d 提示）：\n\n",
                    relevantInsights.size(), criticalCount, warningCount, infoCount));
        } else {
            sb.append(String.format("当前有 %d 条未读洞察（%d 严重 / %d 警告 / %d 提示）：\n\n",
                    relevantInsights.size(), criticalCount, warningCount, infoCount));
        }

        // 最多展示前8条（避免prompt过长）
        int limit = Math.min(relevantInsights.size(), 8);
        for (int i = 0; i < limit; i++) {
            InsightItem item = relevantInsights.get(i);
            String emoji = "critical".equals(item.getSeverity()) ? "\uD83D\uDD34"
                    : "warning".equals(item.getSeverity()) ? "\uD83D\uDFE1" : "\uD83D\uDFE2";
            sb.append(String.format("%d. %s **%s** [%s]: %s\n",
                    i + 1, emoji, item.getTitle(), item.getType(), item.getContent()));
        }

        if (relevantInsights.size() > limit) {
            sb.append(String.format("... 还有 %d 条相关洞察未展示\n", relevantInsights.size() - limit));
        }

        sb.append("\n如果用户的问题与以上洞察相关，请主动提醒用户关注这些风险。\n");
        return sb.toString();
    }

    /**
     * 根据用户消息过滤和排序洞察。
     * <p>排序规则：严重程度 > 相关性 > 时间
     */
    private List<InsightItem> filterAndRankByRelevance(List<InsightItem> insights, String userMessage) {
        if (insights == null || insights.isEmpty()) {
            return List.of();
        }

        String msg = userMessage.toLowerCase();

        // 计算每个洞察的相关性得分
        List<ScoredInsight> scored = new ArrayList<>();
        for (InsightItem insight : insights) {
            double score = calculateRelevanceScore(insight, msg);
            if (score > 0) {  // 只保留有相关性的
                scored.add(new ScoredInsight(insight, score));
            }
        }

        // 如果没有相关的，返回前3条最严重的（保底）
        if (scored.isEmpty()) {
            return insights.stream()
                    .sorted((a, b) -> {
                        int sevCompare = severityWeight(b.getSeverity()) - severityWeight(a.getSeverity());
                        if (sevCompare != 0) return sevCompare;
                        return Long.compare(b.getCreatedAt(), a.getCreatedAt());
                    })
                    .limit(3)
                    .toList();
        }

        // 排序：严重程度 > 相关性得分 > 时间
        scored.sort((a, b) -> {
            int sevCompare = severityWeight(b.insight.getSeverity()) - severityWeight(a.insight.getSeverity());
            if (sevCompare != 0) return sevCompare;
            int scoreCompare = Double.compare(b.score, a.score);
            if (scoreCompare != 0) return scoreCompare;
            return Long.compare(b.insight.getCreatedAt(), a.insight.getCreatedAt());
        });

        return scored.stream().map(s -> s.insight).toList();
    }

    /**
     * 计算洞察与用户消息的相关性得分。
     * <p>基于关键词匹配、类型匹配、实体匹配等多维度。
     */
    private double calculateRelevanceScore(InsightItem insight, String msg) {
        double score = 0;

        String title = insight.getTitle() != null ? insight.getTitle().toLowerCase() : "";
        String content = insight.getContent() != null ? insight.getContent().toLowerCase() : "";
        String type = insight.getType() != null ? insight.getType().toLowerCase() : "";

        // 维度1：标题关键词匹配（权重高）
        String[] msgWords = msg.split("[，。！？、\\s]+");
        for (String word : msgWords) {
            if (word.length() < 2) continue;
            if (title.contains(word)) score += 3.0;
            if (content.contains(word)) score += 1.0;
        }

        // 维度2：类型匹配
        if (type.contains("delay") && msg.matches(".*(延期|逾期|超期|交期|延迟).*")) score += 5.0;
        if (type.contains("quality") && msg.matches(".*(质量|次品|返工|报废|不良|质检).*")) score += 5.0;
        if (type.contains("cost") && msg.matches(".*(成本|费用|利润|价格|工资|结算).*")) score += 5.0;
        if (type.contains("inventory") && msg.matches(".*(库存|缺货|缺料|面料|物料|入库).*")) score += 5.0;
        if (type.contains("combo") && msg.matches(".*(组合|复合|多维度|综合).*")) score += 3.0;
        if (type.contains("stagnant") && msg.matches(".*(停滞|卡住|不动|没进展).*")) score += 4.0;

        return score;
    }

    private int severityWeight(String severity) {
        if (severity == null) return 0;
        return switch (severity) {
            case "critical" -> 3;
            case "warning" -> 2;
            case "info" -> 1;
            default -> 0;
        };
    }

    @lombok.Data
    @lombok.AllArgsConstructor
    private static class ScoredInsight {
        private InsightItem insight;
        private double score;
    }

    @Data
    public static class InsightItem {
        private String id;
        private String type;
        private String title;
        private String content;
        private String severity;
        private long createdAt;
    }
}
