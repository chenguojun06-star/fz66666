package com.fashion.supplychain.intelligence.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fashion.supplychain.intelligence.entity.QuickAnswer;
import com.fashion.supplychain.intelligence.mapper.QuickAnswerMapper;
import lombok.Data;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Lazy;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * AI秒答缓存服务 - 三层秒答体系
 *
 * <p>三层架构：
 * <ol>
 *   <li><b>SNAPSHOT</b>：每30分钟的业务数据快照（数字卡片），用户问"现在订单状态"直接返回</li>
 *   <li><b>PREBUILT</b>：高频问题的完整回答（由PatrolAgent预构建）</li>
 *   <li><b>HOTSPOT</b>：用户正在查看的页面/操作相关的热点数据预取</li>
 * </ol>
 *
 * <p>命中优先级：PREBUILT(精确/关键词匹配) → SNAPSHOT(数字卡片) → 走完整Agent流程
 *
 * <p>多租户隔离（P0 铁律 4）：所有查询带 tenant_id WHERE。
 */
@Service
@Lazy
@Slf4j
public class QuickAnswerCacheService {

    @Autowired
    private QuickAnswerMapper quickAnswerMapper;

    @Autowired(required = false)
    private ObjectMapper objectMapper;

    @Value("${xiaoyun.quick-answer.snapshot-ttl-minutes:30}")
    private int ttlMinutes;

    @Value("${xiaoyun.quick-answer.enabled:true}")
    private boolean enabled;

    @Value("${xiaoyun.quick-answer.min-confidence:0.70}")
    private double confidenceThreshold;

    // ========================================================================
    // 命中查询接口（给AiAgentOrchestrator用）
    // ========================================================================

    /**
     * 尝试从秒答缓存中命中答案。
     * 这是小云回答用户问题时最先调用的接口。
     *
     * <p>重要的实时性保护：当用户提问包含"实时/最新/刚刚/当前/立刻"等词时，
     * 主动跳过缓存，强制走实时查询。这样避免用户看到的是30分钟前的旧数据。
     *
     * @return 命中结果（含可用的摘要和数据）；未命中返回null
     */
    public HitResult tryHit(Long tenantId, String userMessage) {
        if (!enabled || tenantId == null || userMessage == null) {
            return null;
        }
        try {
            // --- 实时性保护：用户明确要"最新/实时"时，跳过缓存 ---
            if (isRealtimeQuery(userMessage)) {
                log.info("[QuickAnswer] 识别为实时查询，跳过缓存: {}", truncate(userMessage, 30));
                return null;
            }

            // --- 第1级：PREBUILT精确/关键词匹配 ---
            HitResult prebuiltHit = tryHitPrebuilt(tenantId, userMessage);
            if (prebuiltHit != null) return prebuiltHit;

            // --- 第2级：SNAPSHOT业务快照 ---
            HitResult snapshotHit = tryHitSnapshot(tenantId, userMessage);
            if (snapshotHit != null) return snapshotHit;

            return null;
        } catch (Exception e) {
            log.warn("[QuickAnswer] 缓存命中查询异常: {}", e.getMessage());
            return null;
        }
    }

    /**
     * 识别用户是否在问"实时数据"。如果是，不应该走缓存。
     *
     * <p>触发场景示例：
     * <ul>
     *   <li>"给我看看最新的生产情况"</li>
     *   <li>"实时数据是怎样的？"</li>
     *   <li>"当前订单1234现在是什么状态"</li>
     *   <li>"刚才有没有新的质检不合格？"</li>
     * </ul>
     */
    private boolean isRealtimeQuery(String msg) {
        String[] realtimeKeywords = {
                "实时", "最新", "刚才", "刚刚", "当前", "立刻",
                "现在状态", "此时此刻", "马上看", "刚发生",
                "实时数据", "实时状态", "最新情况"
        };
        for (String kw : realtimeKeywords) {
            if (msg.contains(kw)) return true;
        }
        return false;
    }

    /** PREBUILT命中：用简单关键词匹配用户常用问题 */
    private HitResult tryHitPrebuilt(Long tenantId, String userMessage) {
        String msg = userMessage.trim();
        // 简化的问题模式识别（按关键词分组）
        String[] keywords;
        if (containsAny(msg, "延期", "延迟", "拖期", "慢了", "交期")) {
            keywords = new String[]{"延期", "延迟"};
        } else if (containsAny(msg, "订单", "状态", "生产", "进行")) {
            keywords = new String[]{"订单", "生产", "状态"};
        } else if (containsAny(msg, "物料", "材料", "短缺", "缺")) {
            keywords = new String[]{"物料", "材料"};
        } else if (containsAny(msg, "质检", "次品", "返工", "不合格")) {
            keywords = new String[]{"质检", "次品"};
        } else if (containsAny(msg, "工资", "结算", "工人", "计件")) {
            keywords = new String[]{"工资", "结算", "工人"};
        } else {
            return null;
        }
        // 单次查询多个关键词（OR条件），提高查询效率和准确性
        List<QuickAnswer> list = quickAnswerMapper.findPrebuiltByKeywords(tenantId, keywords);
        if (list != null && !list.isEmpty()) {
            QuickAnswer qa = list.get(0);
            if (qa.getConfidence() >= confidenceThreshold) {
                quickAnswerMapper.incrementHitCount(qa.getId());
                return toHitResult(qa);
            }
        }
        return null;
    }

    /** SNAPSHOT命中：用户问"现在状态如何/今日数据"时直接返回数字卡片 */
    private HitResult tryHitSnapshot(Long tenantId, String userMessage) {
        String msg = userMessage.trim();
        // 识别是否是"查看总体状态/数据概况"类问题
        boolean isOverviewQuery =
                containsAny(msg, "现在", "今天", "状态", "概况", "数据", "汇总", "统计",
                        "多少个", "多少", "整体", "总的");

        if (!isOverviewQuery) return null;

        QuickAnswer snapshot = quickAnswerMapper.findLatestSnapshot(tenantId);
        if (snapshot == null) return null;

        quickAnswerMapper.incrementHitCount(snapshot.getId());
        return toHitResult(snapshot);
    }

    // ========================================================================
    // 写入接口（给预取器用）
    // ========================================================================

    /** 写入业务快照（数字卡片）——每租户每类型只留1条有效快照，避免表无限变大 */
    @Transactional(rollbackFor = Exception.class)
    public void saveSnapshot(Long tenantId, Map<String, Object> snapshotData,
                              String summaryText, String evidenceJson) {
        if (tenantId == null) return;
        try {
            // 先把该租户旧的SNAPSHOT标记为已删除（每租户只留最新1条有效快照）
            quickAnswerMapper.softDeleteOldSnapshots(tenantId);

            QuickAnswer qa = new QuickAnswer();
            qa.setTenantId(tenantId);
            qa.setAnswerType("SNAPSHOT");
            qa.setAnswerSummary(summaryText);
            qa.setSnapshotData(toJson(snapshotData));
            qa.setRawEvidence(evidenceJson);
            qa.setConfidence(0.95);
            qa.setDataTimestamp(LocalDateTime.now());
            qa.setCacheSource("BusinessSnapshotPrefetcher");
            qa.setHitCount(0);
            qa.setDeleteFlag(0);
            qa.setExpireTime(LocalDateTime.now().plusMinutes(ttlMinutes));
            quickAnswerMapper.insert(qa);
            log.info("[QuickAnswer] 保存SNAPSHOT: tenantId={}, summary={}",
                    tenantId, truncate(summaryText, 60));
        } catch (Exception e) {
            log.warn("[QuickAnswer] 保存SNAPSHOT失败: {}", e.getMessage());
        }
    }

    /** 写入预构建答案（由PatrolAgent使用） */
    public void savePrebuilt(Long tenantId, String questionPattern,
                              String answerSummary, Map<String, Object> snapshotData,
                              double confidence, String source) {
        if (tenantId == null) return;
        try {
            QuickAnswer qa = new QuickAnswer();
            qa.setTenantId(tenantId);
            qa.setAnswerType("PREBUILT");
            qa.setQuestionPattern(questionPattern);
            qa.setAnswerSummary(answerSummary);
            qa.setSnapshotData(toJson(snapshotData));
            qa.setConfidence(confidence);
            qa.setDataTimestamp(LocalDateTime.now());
            qa.setCacheSource(source);
            qa.setHitCount(0);
            qa.setDeleteFlag(0);
            qa.setExpireTime(LocalDateTime.now().plusMinutes(ttlMinutes));
            quickAnswerMapper.insert(qa);
            log.info("[QuickAnswer] 保存PREBUILT: tenantId={}, pattern={}",
                    tenantId, questionPattern);
        } catch (Exception e) {
            log.warn("[QuickAnswer] 保存PREBUILT失败: {}", e.getMessage());
        }
    }

    /** 写入热点预取（用户正在查看的页面相关数据） */
    public void saveHotspot(Long tenantId, String pageKey,
                             Map<String, Object> data, String summary) {
        if (tenantId == null) return;
        try {
            QuickAnswer qa = new QuickAnswer();
            qa.setTenantId(tenantId);
            qa.setAnswerType("HOTSPOT");
            qa.setQuestionPattern(pageKey);
            qa.setAnswerSummary(summary);
            qa.setSnapshotData(toJson(data));
            qa.setConfidence(0.92);
            qa.setDataTimestamp(LocalDateTime.now());
            qa.setCacheSource("HotspotPrefetcher");
            qa.setHitCount(0);
            qa.setDeleteFlag(0);
            qa.setExpireTime(LocalDateTime.now().plusMinutes(15)); // 热点数据TTL短一些
            quickAnswerMapper.insert(qa);
            log.debug("[QuickAnswer] 保存HOTSPOT: tenantId={}, pageKey={}", tenantId, pageKey);
        } catch (Exception e) {
            log.warn("[QuickAnswer] 保存HOTSPOT失败: {}", e.getMessage());
        }
    }

    /** 清理过期缓存（被定时任务调用）：先软删过期行，再真正删除已软删1天以上的行 */
    public int cleanExpired() {
        try {
            // 第1步：软删除新过期的行（标记 delete_flag=1）
            int softCount = quickAnswerMapper.softDeleteExpired();
            // 第2步：真正从表中删除已经软删1天以上的行（防止表无限变大）
            int hardCount = quickAnswerMapper.hardDeleteSoftDeleted();
            if (softCount > 0 || hardCount > 0) {
                log.info("[QuickAnswer] 清理完成: 软删{}条, 真删{}条", softCount, hardCount);
            }
            return softCount + hardCount;
        } catch (Exception e) {
            log.warn("[QuickAnswer] 清理失败: {}", e.getMessage());
            return 0;
        }
    }

    /** 获取高频问题（用于分析哪些问题需要更多预构建） */
    public List<HitResult> getTopHits(Long tenantId, int limit) {
        List<QuickAnswer> list = quickAnswerMapper.findTopHits(
                tenantId, LocalDateTime.now().minusHours(24), limit);
        List<HitResult> result = new ArrayList<>();
        for (QuickAnswer qa : list) {
            result.add(toHitResult(qa));
        }
        return result;
    }

    public boolean isEnabled() {
        return enabled;
    }

    // ========================================================================
    // 辅助方法
    // ========================================================================

    private boolean containsAny(String msg, String... keywords) {
        for (String kw : keywords) {
            if (msg.contains(kw)) return true;
        }
        return false;
    }

    private HitResult toHitResult(QuickAnswer qa) {
        HitResult r = new HitResult();
        r.setType(qa.getAnswerType());
        r.setAnswerSummary(qa.getAnswerSummary());
        r.setConfidence(qa.getConfidence());
        r.setDataTimestamp(qa.getDataTimestamp());
        r.setHitCount(qa.getHitCount());
        // 解析JSON为Map
        if (qa.getSnapshotData() != null && !qa.getSnapshotData().isEmpty()) {
            try {
                r.setData(fromJson(qa.getSnapshotData()));
            } catch (Exception e) {
                r.setData(new LinkedHashMap<>());
            }
        } else {
            r.setData(new LinkedHashMap<>());
        }
        // 添加数据时间戳的醒目提示（重要：让用户知道这是预取数据，非实时）
        if (qa.getDataTimestamp() != null) {
            String timeText = qa.getDataTimestamp()
                    .format(DateTimeFormatter.ofPattern("MM-dd HH:mm"));
            String freshness;
            LocalDateTime now = LocalDateTime.now();
            long minutesDiff = java.time.Duration.between(qa.getDataTimestamp(), now).toMinutes();
            if (minutesDiff <= 5) freshness = "数据很新";
            else if (minutesDiff <= 15) freshness = "数据较新";
            else if (minutesDiff <= 30) freshness = "数据在30分钟内";
            else freshness = "数据已超过30分钟";
            r.setTimestampHint("\n── " + freshness + "，数据截至 " + timeText + "，可提问「最新情况」获取实时数据 ──");
        }
        return r;
    }

    private String toJson(Map<String, Object> data) {
        try {
            if (objectMapper != null) {
                return objectMapper.writeValueAsString(data);
            }
            return simpleJson(data);
        } catch (Exception e) {
            return simpleJson(data);
        }
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> fromJson(String json) {
        try {
            if (objectMapper != null) {
                return objectMapper.readValue(json, Map.class);
            }
            return new LinkedHashMap<>();
        } catch (Exception e) {
            return new LinkedHashMap<>();
        }
    }

    /** 不依赖Jackson的简化JSON生成（防止objectMapper未注入时的兜底） */
    private String simpleJson(Map<String, Object> data) {
        StringBuilder sb = new StringBuilder("{");
        boolean first = true;
        for (Map.Entry<String, Object> e : data.entrySet()) {
            if (!first) sb.append(",");
            sb.append("\"").append(e.getKey()).append("\":");
            Object v = e.getValue();
            if (v == null) sb.append("null");
            else if (v instanceof Number) sb.append(v);
            else sb.append("\"").append(String.valueOf(v).replace("\"", "\\\"")).append("\"");
            first = false;
        }
        sb.append("}");
        return sb.toString();
    }

    private String truncate(String s, int maxLen) {
        if (s == null) return "";
        return s.length() <= maxLen ? s : s.substring(0, maxLen) + "...";
    }

    // ========================================================================
    // 返回结果类
    // ========================================================================

    @Data
    public static class HitResult {
        private String type;                    // SNAPSHOT / PREBUILT / HOTSPOT
        private String answerSummary;           // 可直接显示给用户的答案
        private Map<String, Object> data;       // 结构化数据（数字卡片）
        private double confidence;              // 置信度
        private LocalDateTime dataTimestamp;    // 数据时间
        private int hitCount;                   // 命中次数
        private String timestampHint;           // 时间戳提示文本

        /** 生成完整回答文本（包含时间戳提示） */
        public String getFullAnswer() {
            StringBuilder sb = new StringBuilder();
            if (answerSummary != null) sb.append(answerSummary);
            if (timestampHint != null) sb.append("\n").append(timestampHint);
            return sb.toString();
        }

        /** 判断此命中是否置信度足够，可直接返回给用户 */
        public boolean isHighConfidence() {
            return confidence >= 0.85;
        }

        /** 判断此命中是否置信度一般，需要与其他结果结合使用 */
        public boolean isMediumConfidence() {
            return confidence >= 0.6 && confidence < 0.85;
        }
    }
}
