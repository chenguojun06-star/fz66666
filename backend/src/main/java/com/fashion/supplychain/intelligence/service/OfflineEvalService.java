package com.fashion.supplychain.intelligence.service;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.fashion.supplychain.intelligence.dto.EvalRunResult;
import com.fashion.supplychain.intelligence.entity.AiConversationMemory;
import com.fashion.supplychain.intelligence.entity.EvalDataset;
import com.fashion.supplychain.intelligence.entity.EvalItem;
import com.fashion.supplychain.intelligence.mapper.AiConversationMemoryMapper;
import com.fashion.supplychain.intelligence.mapper.EvalDatasetMapper;
import com.fashion.supplychain.intelligence.mapper.EvalItemMapper;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Pattern;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

/**
 * 离线评估服务（P1-4 Langfuse/Eval 框架方向）
 *
 * <p>用途：定时采样历史对话形成数据集，用评估器跑离线评分，
 * 追踪 AI 回答质量趋势、对比模型版本。</p>
 *
 * <p><b>事务边界（D-001）</b>：本服务不加 @Transactional，每条 insert/update 独立执行，
 * 异常 try-catch 吞掉仅 log.warn，不影响主流程。</p>
 *
 * <p><b>多租户（P0铁律4）</b>：所有查询带 tenant_id。</p>
 *
 * @author xiaoyun
 * @since 2026-07-22
 */
@Slf4j
@Service
public class OfflineEvalService {

    @Autowired
    private EvalDatasetMapper evalDatasetMapper;

    @Autowired
    private EvalItemMapper evalItemMapper;

    @Autowired
    private AiConversationMemoryMapper aiConversationMemoryMapper;

    private static final com.fasterxml.jackson.databind.ObjectMapper JSON =
            new com.fasterxml.jackson.databind.ObjectMapper();

    private static final Pattern CLICHE_PATTERN = Pattern.compile(
            "(建议关注|应注意|需注意|可能存在|值得关注|加强管理|持续优化|进一步提升|不断完善)");

    /**
     * 创建空数据集。
     *
     * @param tenantId    租户ID
     * @param name        数据集名称
     * @param description 描述（可空）
     * @param type        数据集类型：CONVERSATION/TOOL_CALL/SCAN_FLOW
     * @return 新建数据集ID
     */
    public Long createDataset(Long tenantId, String name, String description, String type) {
        try {
            EvalDataset ds = new EvalDataset();
            ds.setTenantId(tenantId);
            ds.setDatasetName(name);
            ds.setDescription(description);
            ds.setDatasetType(type);
            ds.setItemCount(0);
            evalDatasetMapper.insert(ds);
            log.info("[OfflineEval] 创建数据集 tenant={} id={} name={} type={}",
                    tenantId, ds.getId(), name, type);
            return ds.getId();
        } catch (Exception e) {
            log.warn("[OfflineEval] 创建数据集失败 tenant={} name={}: {}", tenantId, name, e.getMessage());
            return null;
        }
    }

    /**
     * 从 t_ai_conversation_memory 采样最近对话填入数据集。
     *
     * <p>采样源表实际列为 user_message / ai_response（无 session_id / assistant_message 列），
     * 故 sessionId 置空，actualAnswer 取 ai_response。</p>
     *
     * @param tenantId  租户ID
     * @param datasetId 数据集ID
     * @param sampleSize 采样条数
     * @return 实际采样并插入的条数
     */
    public int sampleConversations(Long tenantId, Long datasetId, int sampleSize) {
        try {
            QueryWrapper<AiConversationMemory> qw = new QueryWrapper<>();
            qw.eq("tenant_id", tenantId)
              .eq("delete_flag", 0)
              .orderByDesc("create_time")
              .last("LIMIT " + Math.max(1, sampleSize));
            List<AiConversationMemory> memories = aiConversationMemoryMapper.selectList(qw);
            if (memories == null || memories.isEmpty()) {
                log.info("[OfflineEval] 采样为空 tenant={} dataset={}", tenantId, datasetId);
                return 0;
            }

            int inserted = 0;
            for (AiConversationMemory m : memories) {
                try {
                    String userMessage = m.getUserMessage();
                    // t_eval_item.user_message NOT NULL，跳过空问题
                    if (userMessage == null || userMessage.isBlank()) {
                        continue;
                    }
                    EvalItem item = new EvalItem();
                    item.setTenantId(tenantId);
                    item.setDatasetId(datasetId);
                    item.setSessionId(null); // 源表无 session_id 列
                    item.setUserMessage(truncate(userMessage, 65000));
                    item.setActualAnswer(truncate(m.getAiResponse(), 65000));
                    item.setEvaluated(0);
                    evalItemMapper.insert(item);
                    inserted++;
                } catch (Exception ie) {
                    log.warn("[OfflineEval] 插入采样项失败 tenant={} dataset={}: {}",
                            tenantId, datasetId, ie.getMessage());
                }
            }

            // 刷新数据集 item_count
            try {
                evalItemMapper.refreshItemCount(datasetId);
            } catch (Exception re) {
                log.warn("[OfflineEval] 刷新item_count失败 dataset={}: {}", datasetId, re.getMessage());
            }

            log.info("[OfflineEval] 采样完成 tenant={} dataset={} 采样 {} / 插入 {} 条",
                    tenantId, datasetId, memories.size(), inserted);
            return inserted;
        } catch (Exception e) {
            log.warn("[OfflineEval] 采样对话失败 tenant={} dataset={}: {}",
                    tenantId, datasetId, e.getMessage());
            return 0;
        }
    }

    /**
     * 批量评估数据集中未评估的项。
     *
     * <p>评估器采用轻量规则评分（无副作用，不污染实时反馈/记忆/路由数据），
     * 维度：completeness / clarity / responsiveness。</p>
     *
     * @param tenantId      租户ID
     * @param datasetId     数据集ID
     * @param evaluatorName 评估器名称
     * @param batchSize     单批评估条数
     * @return 评估汇总结果
     */
    public EvalRunResult runEvaluation(Long tenantId, Long datasetId, String evaluatorName, int batchSize) {
        int totalItems = 0;
        int evaluated = 0;
        double scoreSum = 0.0;
        Map<String, Double> dimSum = new LinkedHashMap<>();
        dimSum.put("completeness", 0.0);
        dimSum.put("clarity", 0.0);
        dimSum.put("responsiveness", 0.0);

        try {
            int limit = Math.max(1, batchSize);
            List<EvalItem> items = evalItemMapper.findUnevaluated(tenantId, datasetId, limit);
            if (items == null || items.isEmpty()) {
                log.info("[OfflineEval] 无待评估项 tenant={} dataset={}", tenantId, datasetId);
                return EvalRunResult.builder()
                        .datasetId(datasetId)
                        .totalItems(0)
                        .evaluated(0)
                        .avgScore(0.0)
                        .dimensionScores(dimSum)
                        .build();
            }

            for (EvalItem item : items) {
                try {
                    double[] dims = ruleScore(item.getUserMessage(), item.getActualAnswer());
                    double completeness = dims[0];
                    double clarity = dims[1];
                    double responsiveness = dims[2];
                    double overall = completeness * 0.4 + clarity * 0.3 + responsiveness * 0.3;

                    Map<String, Double> dimMap = new LinkedHashMap<>();
                    dimMap.put("completeness", round1(completeness));
                    dimMap.put("clarity", round1(clarity));
                    dimMap.put("responsiveness", round1(responsiveness));

                    item.setScore(BigDecimal.valueOf(round1(overall)));
                    item.setScoreDimensions(JSON.writeValueAsString(dimMap));
                    item.setEvaluator(evaluatorName);
                    item.setEvaluated(1);
                    evalItemMapper.updateById(item);

                    evaluated++;
                    totalItems++;
                    scoreSum += overall;
                    dimSum.merge("completeness", completeness, Double::sum);
                    dimSum.merge("clarity", clarity, Double::sum);
                    dimSum.merge("responsiveness", responsiveness, Double::sum);
                } catch (Exception ie) {
                    log.warn("[OfflineEval] 评估单项失败 tenant={} itemId={}: {}",
                            tenantId, item.getId(), ie.getMessage());
                }
            }
        } catch (Exception e) {
            log.warn("[OfflineEval] 批量评估失败 tenant={} dataset={}: {}",
                    tenantId, datasetId, e.getMessage());
        }

        double avgScore = evaluated > 0 ? round1(scoreSum / evaluated) : 0.0;
        Map<String, Double> dimensionScores = new LinkedHashMap<>();
        for (Map.Entry<String, Double> e : dimSum.entrySet()) {
            dimensionScores.put(e.getKey(), evaluated > 0 ? round1(e.getValue() / evaluated) : 0.0);
        }

        log.info("[OfflineEval] 评估完成 tenant={} dataset={} evaluated={} avgScore={}",
                tenantId, datasetId, evaluated, avgScore);

        return EvalRunResult.builder()
                .datasetId(datasetId)
                .totalItems(totalItems)
                .evaluated(evaluated)
                .avgScore(avgScore)
                .dimensionScores(dimensionScores)
                .build();
    }

    /**
     * 列出数据集中的评估项（按 id 升序，带租户隔离）。
     */
    public List<EvalItem> listItems(Long tenantId, Long datasetId, int limit) {
        try {
            QueryWrapper<EvalItem> qw = new QueryWrapper<>();
            qw.eq("tenant_id", tenantId)
              .eq("dataset_id", datasetId)
              .orderByAsc("id")
              .last("LIMIT " + Math.max(1, limit));
            return evalItemMapper.selectList(qw);
        } catch (Exception e) {
            log.warn("[OfflineEval] 列表查询失败 tenant={} dataset={}: {}",
                    tenantId, datasetId, e.getMessage());
            return new ArrayList<>();
        }
    }

    // ──────────────────────────────────────────────────────────────
    // 轻量规则评估器（无副作用）
    // ──────────────────────────────────────────────────────────────

    /**
     * 规则评分：返回 [completeness, clarity, responsiveness]，各 0-100。
     */
    private double[] ruleScore(String userMessage, String aiResponse) {
        double completeness = scoreCompleteness(userMessage, aiResponse);
        double clarity = scoreClarity(aiResponse);
        double responsiveness = scoreResponsiveness(userMessage, aiResponse);
        return new double[]{completeness, clarity, responsiveness};
    }

    /** 完整性：用户问题关键词在回答中的覆盖率 */
    private double scoreCompleteness(String userMessage, String aiResponse) {
        if (aiResponse == null || aiResponse.isBlank()) return 0.0;
        if (userMessage == null || userMessage.isBlank()) return 70.0;
        List<String> entities = extractKeywords(userMessage);
        if (entities.isEmpty()) return 75.0;
        String lower = aiResponse.toLowerCase();
        int hit = 0;
        for (String kw : entities) {
            if (lower.contains(kw.toLowerCase())) hit++;
        }
        double ratio = (double) hit / entities.size();
        return Math.min(100, ratio * 100);
    }

    /** 清晰度：回答长度合理 + 无过多空话模板 */
    private double scoreClarity(String aiResponse) {
        if (aiResponse == null || aiResponse.isBlank()) return 0.0;
        double score = 65.0;
        int len = aiResponse.length();
        if (len < 30) score -= 20.0;
        else if (len >= 200 && len <= 800) score += 12.0;
        else if (len > 2000) score -= 5.0;
        if (CLICHE_PATTERN.matcher(aiResponse).find()) score -= 10.0;
        return Math.max(0, Math.min(100, score));
    }

    /** 响应度：回答与用户问题的字符重合度（简化） */
    private double scoreResponsiveness(String userMessage, String aiResponse) {
        if (aiResponse == null || aiResponse.isBlank()) return 0.0;
        if (userMessage == null || userMessage.isBlank()) return 70.0;
        String lowerResp = aiResponse.toLowerCase();
        String lowerUser = userMessage.toLowerCase();
        int checkLen = Math.min(lowerUser.length(), 10);
        int common = 0;
        for (int i = 0; i < checkLen; i++) {
            if (lowerResp.indexOf(lowerUser.charAt(i)) >= 0) common++;
        }
        return Math.min(100, common >= 3 ? 85.0 : (common >= 1 ? 60.0 : 40.0));
    }

    private List<String> extractKeywords(String message) {
        if (message == null) return List.of();
        String[] parts = message.split("[的了吗呢啊吧]|(怎么)|(什么)|(哪些)|(为什么)|(多少)");
        List<String> out = new ArrayList<>();
        for (String p : parts) {
            String t = p.trim();
            if (t.length() >= 2) out.add(t);
        }
        return out.stream().distinct().limit(5).toList();
    }

    private double round1(double v) {
        return BigDecimal.valueOf(v).setScale(1, RoundingMode.HALF_UP).doubleValue();
    }

    private String truncate(String value, int maxLen) {
        if (value == null) return null;
        return value.length() <= maxLen ? value : value.substring(0, maxLen);
    }
}
