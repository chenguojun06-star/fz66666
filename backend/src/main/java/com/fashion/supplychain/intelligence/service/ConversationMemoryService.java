package com.fashion.supplychain.intelligence.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.Data;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Lazy;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

/**
 * 对话记忆持久化与智能压缩服务
 *
 * <p>解决两个核心问题：
 * <ol>
 *   <li>对话记忆跨会话持久化 — 基于 Redis 存储，24h TTL 自动过期</li>
 *   <li>长对话上下文压缩 — 规则化提取实体和结论，不调用 LLM，避免额外 token 消耗</li>
 * </ol>
 *
 * <p>多租户隔离：Redis key 包含 tenantId，确保跨租户数据不可见。
 * 降级策略：Redis 不可用时静默降级，不影响主流程。
 */
@Slf4j
@Service
@Lazy
public class ConversationMemoryService {

    private static final ObjectMapper JSON_MAPPER = new ObjectMapper();

    private static final String CONVERSATION_PREFIX = "ai:conv:";
    private static final String SUMMARY_PREFIX = "ai:conv:summary:";

    /** 实体提取正则模式 — 与 LongTermMemoryOrchestrator 保持一致 */
    private static final Pattern ORDER_PATTERN = Pattern.compile("PO\\d{6,}");
    private static final Pattern AMOUNT_PATTERN = Pattern.compile("[¥￥]?\\d+(\\.\\d+)?[元块]");
    private static final Pattern DATE_PATTERN = Pattern.compile("\\d{4}-\\d{2}-\\d{2}|\\d{1,2}月\\d{1,2}日");
    private static final Pattern FACTORY_PATTERN = Pattern.compile("[\\u4e00-\\u9fa5]{2,6}工厂");
    private static final Pattern STYLE_PATTERN = Pattern.compile("[A-Za-z]+\\d{3,}");

    @Autowired(required = false)
    private StringRedisTemplate stringRedisTemplate;

    @Value("${xiaoyun.conversation-memory.enabled:true}")
    private boolean enabled;

    @Value("${xiaoyun.conversation-memory.max-turns:20}")
    private int maxTurns;

    @Value("${xiaoyun.conversation-memory.compress-threshold:10}")
    private int compressThreshold;

    @Value("${xiaoyun.conversation-memory.ttl-hours:24}")
    private int ttlHours;

    // ===== 对话轮次数据结构 =====

    @Data
    public static class ConversationTurn {
        private String role;
        private String content;
        private long timestamp;

        public ConversationTurn() {}

        public ConversationTurn(String role, String content) {
            this.role = role;
            this.content = content;
            this.timestamp = System.currentTimeMillis();
        }
    }

    @Data
    public static class ConversationSummary {
        private String summary;
        private List<String> entities;
        private List<String> conclusions;
        private int compressedTurns;
        private long createdAt;

        public ConversationSummary() {
            this.entities = new ArrayList<>();
            this.conclusions = new ArrayList<>();
            this.compressedTurns = 0;
            this.createdAt = System.currentTimeMillis();
        }
    }

    // ===== 核心操作 =====

    /**
     * 保存一轮对话到会话记忆
     *
     * @param tenantId     租户ID（多租户隔离）
     * @param sessionId    会话ID（用户维度，userId）
     * @param userMsg      用户消息
     * @param assistantMsg AI回复
     */
    public void saveTurn(Long tenantId, String sessionId, String userMsg, String assistantMsg) {
        if (!enabled || stringRedisTemplate == null) return;
        if (tenantId == null || sessionId == null) return;

        try {
            String convKey = buildConversationKey(tenantId, sessionId);

            ConversationTurn userTurn = new ConversationTurn("user", userMsg);
            ConversationTurn assistantTurn = new ConversationTurn("assistant", assistantMsg);

            String userJson = JSON_MAPPER.writeValueAsString(toMap(userTurn));
            String assistantJson = JSON_MAPPER.writeValueAsString(toMap(assistantTurn));

            stringRedisTemplate.opsForList().rightPush(convKey, userJson);
            stringRedisTemplate.opsForList().rightPush(convKey, assistantJson);
            stringRedisTemplate.expire(convKey, Duration.ofHours(ttlHours));

            long turnCount = stringRedisTemplate.opsForList().size(convKey) / 2;
            if (turnCount > compressThreshold) {
                compressOldTurns(tenantId, sessionId);
            }

            log.debug("[ConvMemory] 保存对话轮次: tenant={} session={} totalTurns={}",
                    tenantId, sessionId, turnCount);
        } catch (Exception e) {
            log.debug("[ConvMemory] 保存对话轮次失败（不影响主流程）: {}", e.getMessage());
        }
    }

    /**
     * 加载会话历史（压缩后的摘要 + 最近N轮完整对话）
     *
     * @param tenantId  租户ID
     * @param sessionId 会话ID
     * @return 拼接好的上下文字符串，可直接注入 system prompt
     */
    public String loadConversationContext(Long tenantId, String sessionId) {
        if (!enabled || stringRedisTemplate == null) return "";
        if (tenantId == null || sessionId == null) return "";

        try {
            StringBuilder context = new StringBuilder();

            // 1. 加载摘要（如果存在）
            String summaryKey = buildSummaryKey(tenantId, sessionId);
            String summaryJson = stringRedisTemplate.opsForValue().get(summaryKey);
            if (summaryJson != null && !summaryJson.isBlank()) {
                ConversationSummary summary = JSON_MAPPER.readValue(summaryJson, ConversationSummary.class);
                if (summary.getSummary() != null && !summary.getSummary().isBlank()) {
                    context.append("【历史对话摘要（").append(summary.getCompressedTurns())
                            .append("轮压缩）】\n").append(summary.getSummary());
                    if (summary.getEntities() != null && !summary.getEntities().isEmpty()) {
                        context.append("\n涉及实体：").append(String.join("、", summary.getEntities()));
                    }
                    if (summary.getConclusions() != null && !summary.getConclusions().isEmpty()) {
                        context.append("\n关键结论：");
                        for (String c : summary.getConclusions()) {
                            context.append("\n- ").append(c);
                        }
                    }
                    context.append("\n\n");
                }
            }

            // 2. 加载最近N轮完整对话
            String convKey = buildConversationKey(tenantId, sessionId);
            Long totalSize = stringRedisTemplate.opsForList().size(convKey);
            if (totalSize == null || totalSize == 0) {
                return context.toString();
            }

            int maxMessages = maxTurns * 2;
            long start = Math.max(0, totalSize - maxMessages);
            List<String> recentJsonList = stringRedisTemplate.opsForList().range(convKey, start, totalSize - 1);

            if (recentJsonList != null && !recentJsonList.isEmpty()) {
                if (context.length() > 0) {
                    context.append("【最近对话】\n");
                }
                for (String json : recentJsonList) {
                    try {
                        Map<String, Object> turnMap = JSON_MAPPER.readValue(json,
                                new TypeReference<LinkedHashMap<String, Object>>() {});
                        String role = String.valueOf(turnMap.getOrDefault("role", ""));
                        String content = String.valueOf(turnMap.getOrDefault("content", ""));
                        if (!role.isEmpty() && !content.isEmpty()) {
                            // 截断过长的单条消息，避免上下文膨胀
                            if (content.length() > 500) {
                                content = content.substring(0, 500) + "...";
                            }
                            context.append("[").append(role).append("] ")
                                    .append(content).append("\n");
                        }
                    } catch (Exception ignored) {}
                }
            }

            return context.toString();
        } catch (Exception e) {
            log.debug("[ConvMemory] 加载对话上下文失败（静默降级）: {}", e.getMessage());
            return "";
        }
    }

    /**
     * 压缩旧对话为摘要（规则化压缩，不调用 LLM）
     *
     * <p>压缩策略：
     * <ol>
     *   <li>提取每轮对话的关键实体（订单号、款号、金额、日期、工厂名）</li>
     *   <li>保留用户意图和AI结论</li>
     *   <li>丢弃中间推理过程</li>
     * </ol>
     *
     * @param tenantId  租户ID
     * @param sessionId 会话ID
     */
    public void compressOldTurns(Long tenantId, String sessionId) {
        if (!enabled || stringRedisTemplate == null) return;
        if (tenantId == null || sessionId == null) return;

        try {
            String convKey = buildConversationKey(tenantId, sessionId);
            Long totalSize = stringRedisTemplate.opsForList().size(convKey);
            if (totalSize == null || totalSize == 0) return;

            long totalTurns = totalSize / 2;
            if (totalTurns <= compressThreshold) return;

            // 保留最近 maxTurns 轮，压缩更早的
            long keepMessages = (long) maxTurns * 2;
            long compressMessages = totalSize - keepMessages;
            if (compressMessages <= 0) return;

            // 读取需要压缩的旧消息
            List<String> oldJsonList = stringRedisTemplate.opsForList().range(convKey, 0, compressMessages - 1);
            if (oldJsonList == null || oldJsonList.isEmpty()) return;

            // 规则化压缩
            ConversationSummary summary = ruleBasedCompress(oldJsonList);

            // 合并已有摘要（如果存在）
            String summaryKey = buildSummaryKey(tenantId, sessionId);
            String existingSummaryJson = stringRedisTemplate.opsForValue().get(summaryKey);
            if (existingSummaryJson != null && !existingSummaryJson.isBlank()) {
                ConversationSummary existing = JSON_MAPPER.readValue(existingSummaryJson, ConversationSummary.class);
                mergeSummary(existing, summary);
                summary = existing;
            }

            // 保存摘要
            String newSummaryJson = JSON_MAPPER.writeValueAsString(summary);
            stringRedisTemplate.opsForValue().set(summaryKey, newSummaryJson, Duration.ofHours(ttlHours));

            // 删除已压缩的旧消息（使用 LTRIM 保留最新部分）
            stringRedisTemplate.opsForList().trim(convKey, compressMessages, -1);
            stringRedisTemplate.expire(convKey, Duration.ofHours(ttlHours));

            log.info("[ConvMemory] 压缩完成: tenant={} session={} compressed={}turns entities={} conclusions={}",
                    tenantId, sessionId, summary.getCompressedTurns(),
                    summary.getEntities() != null ? summary.getEntities().size() : 0,
                    summary.getConclusions() != null ? summary.getConclusions().size() : 0);
        } catch (Exception e) {
            log.debug("[ConvMemory] 压缩旧对话失败（不影响主流程）: {}", e.getMessage());
        }
    }

    /**
     * 清除会话记忆
     */
    public void clearConversation(Long tenantId, String sessionId) {
        if (stringRedisTemplate == null || tenantId == null || sessionId == null) return;

        try {
            String convKey = buildConversationKey(tenantId, sessionId);
            String summaryKey = buildSummaryKey(tenantId, sessionId);
            stringRedisTemplate.delete(convKey);
            stringRedisTemplate.delete(summaryKey);
            log.debug("[ConvMemory] 清除会话记忆: tenant={} session={}", tenantId, sessionId);
        } catch (Exception e) {
            log.debug("[ConvMemory] 清除会话记忆失败: {}", e.getMessage());
        }
    }

    /**
     * 获取当前会话的对话轮次数
     */
    public int getTurnCount(Long tenantId, String sessionId) {
        if (!enabled || stringRedisTemplate == null || tenantId == null || sessionId == null) return 0;
        try {
            String convKey = buildConversationKey(tenantId, sessionId);
            Long size = stringRedisTemplate.opsForList().size(convKey);
            return size != null ? (int) (size / 2) : 0;
        } catch (Exception e) {
            return 0;
        }
    }

    // ===== 规则化压缩（不调用 LLM） =====

    /**
     * 基于规则的对话压缩：提取实体、意图和结论
     */
    private ConversationSummary ruleBasedCompress(List<String> oldJsonList) {
        ConversationSummary summary = new ConversationSummary();
        StringBuilder summaryText = new StringBuilder();
        List<String> allEntities = new ArrayList<>();
        List<String> conclusions = new ArrayList<>();

        for (int i = 0; i < oldJsonList.size(); i += 2) {
            String userJson = oldJsonList.get(i);
            String assistantJson = (i + 1 < oldJsonList.size()) ? oldJsonList.get(i + 1) : null;

            String userContent = extractContent(userJson);
            String assistantContent = assistantJson != null ? extractContent(assistantJson) : "";

            if (userContent.isEmpty()) continue;

            // 提取实体
            List<String> entities = extractEntities(userContent + " " + assistantContent);
            allEntities.addAll(entities);

            // 提取用户意图（取前50字）
            String intent = userContent.length() > 50
                    ? userContent.substring(0, 50) + "..."
                    : userContent;

            // 提取AI结论（取assistant回复的首段，通常是结论）
            String conclusion = extractConclusion(assistantContent);
            if (!conclusion.isEmpty()) {
                conclusions.add(conclusion);
            }

            summaryText.append("用户问：").append(intent);
            if (!conclusion.isEmpty()) {
                summaryText.append(" → 结论：").append(conclusion);
            }
            summaryText.append("; ");
        }

        // 去重实体
        List<String> uniqueEntities = allEntities.stream()
                .distinct()
                .limit(20)
                .collect(Collectors.toList());

        // 去重结论
        List<String> uniqueConclusions = conclusions.stream()
                .distinct()
                .limit(10)
                .collect(Collectors.toList());

        // 限制摘要长度
        String summaryStr = summaryText.toString();
        if (summaryStr.length() > 800) {
            summaryStr = summaryStr.substring(0, 800) + "...";
        }

        summary.setSummary(summaryStr);
        summary.setEntities(uniqueEntities);
        summary.setConclusions(uniqueConclusions);
        summary.setCompressedTurns(oldJsonList.size() / 2);
        return summary;
    }

    /**
     * 从 assistant 回复中提取结论（首段非空文本，截断至100字）
     */
    private String extractConclusion(String assistantContent) {
        if (assistantContent == null || assistantContent.isBlank()) return "";
        // 取第一段
        String[] paragraphs = assistantContent.split("\n\n+");
        for (String p : paragraphs) {
            String trimmed = p.trim();
            // 跳过标题行、列表标记等
            if (trimmed.startsWith("#") || trimmed.startsWith(">") || trimmed.startsWith("⚠️")) continue;
            if (trimmed.length() < 5) continue;
            return trimmed.length() > 100 ? trimmed.substring(0, 100) + "..." : trimmed;
        }
        return "";
    }

    /**
     * 从文本中提取关键实体（订单号、金额、日期、工厂名、款号）
     * 与 LongTermMemoryOrchestrator.extractEntities 保持一致的提取规则
     */
    private List<String> extractEntities(String text) {
        List<String> entities = new ArrayList<>();
        if (text == null || text.isBlank()) return entities;

        Matcher m1 = ORDER_PATTERN.matcher(text);
        while (m1.find()) entities.add(m1.group());

        Matcher m2 = AMOUNT_PATTERN.matcher(text);
        while (m2.find()) entities.add(m2.group());

        Matcher m3 = DATE_PATTERN.matcher(text);
        while (m3.find()) entities.add(m3.group());

        Matcher m4 = FACTORY_PATTERN.matcher(text);
        while (m4.find()) entities.add(m4.group());

        Matcher m5 = STYLE_PATTERN.matcher(text);
        while (m5.find()) {
            if (m5.group().length() >= 5) entities.add(m5.group());
        }

        return entities;
    }

    /**
     * 合并新旧摘要
     */
    private void mergeSummary(ConversationSummary existing, ConversationSummary newSummary) {
        // 合并摘要文本
        String merged = existing.getSummary();
        if (merged == null) merged = "";
        if (newSummary.getSummary() != null && !newSummary.getSummary().isBlank()) {
            merged = merged.isEmpty() ? newSummary.getSummary() : merged + " " + newSummary.getSummary();
        }
        // 限制合并后长度
        if (merged.length() > 1000) {
            merged = merged.substring(merged.length() - 1000);
        }
        existing.setSummary(merged);

        // 合并实体
        if (newSummary.getEntities() != null) {
            List<String> mergedEntities = new ArrayList<>();
            if (existing.getEntities() != null) mergedEntities.addAll(existing.getEntities());
            mergedEntities.addAll(newSummary.getEntities());
            existing.setEntities(mergedEntities.stream().distinct().limit(20).collect(Collectors.toList()));
        }

        // 合并结论
        if (newSummary.getConclusions() != null) {
            List<String> mergedConclusions = new ArrayList<>();
            if (existing.getConclusions() != null) mergedConclusions.addAll(existing.getConclusions());
            mergedConclusions.addAll(newSummary.getConclusions());
            existing.setConclusions(mergedConclusions.stream().distinct().limit(10).collect(Collectors.toList()));
        }

        // 累加压缩轮次
        existing.setCompressedTurns(
                existing.getCompressedTurns() + newSummary.getCompressedTurns());
    }

    // ===== 工具方法 =====

    private String buildConversationKey(Long tenantId, String sessionId) {
        return CONVERSATION_PREFIX + tenantId + ":" + sessionId;
    }

    private String buildSummaryKey(Long tenantId, String sessionId) {
        return SUMMARY_PREFIX + tenantId + ":" + sessionId;
    }

    private Map<String, Object> toMap(ConversationTurn turn) {
        Map<String, Object> map = new LinkedHashMap<>();
        map.put("role", turn.getRole());
        map.put("content", turn.getContent());
        map.put("timestamp", turn.getTimestamp());
        return map;
    }

    private String extractContent(String json) {
        if (json == null || json.isBlank()) return "";
        try {
            Map<String, Object> map = JSON_MAPPER.readValue(json,
                    new TypeReference<LinkedHashMap<String, Object>>() {});
            Object content = map.get("content");
            return content != null ? String.valueOf(content) : "";
        } catch (Exception e) {
            return "";
        }
    }
}
