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
        if (!enabled || tenantId == null) {
            return "";
        }
        List<InsightItem> insights = getUnreadInsights(tenantId);
        if (insights.isEmpty()) {
            return "";
        }

        StringBuilder sb = new StringBuilder();
        sb.append("\n## \uD83D\uDCA1 系统主动洞察（巡检发现的问题，请在回答中主动提及）\n");

        // 按严重程度分组
        long criticalCount = insights.stream().filter(i -> "critical".equals(i.getSeverity())).count();
        long warningCount = insights.stream().filter(i -> "warning".equals(i.getSeverity())).count();
        long infoCount = insights.stream().filter(i -> "info".equals(i.getSeverity())).count();

        sb.append(String.format("当前有 %d 条未读洞察（%d 严重 / %d 警告 / %d 提示）：\n\n",
                insights.size(), criticalCount, warningCount, infoCount));

        // 最多展示前10条（避免prompt过长）
        int limit = Math.min(insights.size(), 10);
        for (int i = 0; i < limit; i++) {
            InsightItem item = insights.get(i);
            String emoji = "critical".equals(item.getSeverity()) ? "\uD83D\uDD34"
                    : "warning".equals(item.getSeverity()) ? "\uD83D\uDFE1" : "\uD83D\uDFE2";
            sb.append(String.format("%d. %s **%s** [%s]: %s\n",
                    i + 1, emoji, item.getTitle(), item.getType(), item.getContent()));
        }

        if (insights.size() > limit) {
            sb.append(String.format("... 还有 %d 条洞察未展示\n", insights.size() - limit));
        }

        sb.append("\n如果用户的问题与以上洞察相关，请主动提醒用户关注这些风险。\n");
        return sb.toString();
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
