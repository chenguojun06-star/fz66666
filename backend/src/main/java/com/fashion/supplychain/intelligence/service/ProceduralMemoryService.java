package com.fashion.supplychain.intelligence.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fashion.supplychain.intelligence.entity.ProceduralMemory;
import com.fashion.supplychain.intelligence.mapper.ProceduralMemoryMapper;
import lombok.Data;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Lazy;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * L4 程序性记忆服务 - SOP/流程/技能管理
 * 
 * <p>设计原则：
 * <ol>
 *   <li>精确匹配优先：按 trigger_keywords 精确匹配用户意图</li>
 *   <li>语义搜索兜底：关键词匹配不到时走向量搜索</li>
 *   <li>置信度过滤：confidence >= 60 才注入</li>
 *   <li>多租户隔离：所有查询带 tenant_id WHERE（P0铁律4）</li>
 * </ol>
 */
@Service
@Lazy
@Slf4j
public class ProceduralMemoryService {

    @Autowired
    private ProceduralMemoryMapper proceduralMemoryMapper;

    @Autowired(required = false)
    private ObjectMapper objectMapper;

    private static final double CONFIDENCE_THRESHOLD = 0.60;

    /**
     * 根据用户消息匹配SOP
     * 
     * @param tenantId 租户ID
     * @param userMessage 用户消息
     * @return 匹配的SOP（置信度足够时），否则返回null
     */
    public MatchedSOP matchSOP(Long tenantId, String userMessage) {
        if (tenantId == null || userMessage == null || userMessage.isBlank()) {
            return null;
        }

        // 步骤1：精确关键词匹配（优先）
        List<ProceduralMemory> matches = findByKeyword(tenantId, userMessage);
        if (!matches.isEmpty()) {
            ProceduralMemory bestMatch = matches.get(0);
            if (bestMatch.getConfidence() >= CONFIDENCE_THRESHOLD) {
                // 记录使用次数
                incrementUsageCount(bestMatch.getId());
                return toMatchedSOP(bestMatch);
            }
        }

        // 步骤2：SOP类型匹配（兜底）
        String detectedType = detectSOPType(userMessage);
        if (detectedType != null) {
            List<ProceduralMemory> typeMatches = findBySopType(tenantId, detectedType);
            if (!typeMatches.isEmpty() && typeMatches.get(0).getConfidence() >= CONFIDENCE_THRESHOLD) {
                incrementUsageCount(typeMatches.get(0).getId());
                return toMatchedSOP(typeMatches.get(0));
            }
        }

        return null;
    }

    /**
     * 根据关键词查找SOP
     */
    public List<ProceduralMemory> findByKeyword(Long tenantId, String keyword) {
        if (tenantId == null || keyword == null) {
            return new ArrayList<>();
        }
        try {
            // 拆分关键词，分别查询
            String[] keywords = keyword.split("[，,。.、\\s]+");
            List<ProceduralMemory> results = new ArrayList<>();
            for (String kw : keywords) {
                if (kw.length() >= 2) {
                    List<ProceduralMemory> matches = proceduralMemoryMapper.findByKeyword(tenantId, kw.trim());
                    for (ProceduralMemory m : matches) {
                        if (!results.contains(m)) {
                            results.add(m);
                        }
                    }
                }
            }
            // 按置信度排序
            results.sort((a, b) -> Double.compare(b.getConfidence(), a.getConfidence()));
            return results;
        } catch (Exception e) {
            log.warn("[ProceduralMemory] 关键词查询失败: {}", e.getMessage());
            return new ArrayList<>();
        }
    }

    /**
     * 根据类型查找SOP
     */
    public List<ProceduralMemory> findBySopType(Long tenantId, String sopType) {
        if (tenantId == null || sopType == null) {
            return new ArrayList<>();
        }
        try {
            return proceduralMemoryMapper.findBySopType(tenantId, sopType);
        } catch (Exception e) {
            log.warn("[ProceduralMemory] 类型查询失败: {}", e.getMessage());
            return new ArrayList<>();
        }
    }

    /**
     * 获取高频使用的SOP
     */
    public List<ProceduralMemory> getTopUsed(Long tenantId) {
        if (tenantId == null) {
            return new ArrayList<>();
        }
        try {
            return proceduralMemoryMapper.findTopUsed(tenantId);
        } catch (Exception e) {
            log.warn("[ProceduralMemory] 获取高频SOP失败: {}", e.getMessage());
            return new ArrayList<>();
        }
    }

    /**
     * 记录成功调用
     */
    public void recordSuccess(Long memoryId) {
        if (memoryId != null) {
            try {
                proceduralMemoryMapper.incrementSuccessCount(memoryId);
            } catch (Exception e) {
                log.warn("[ProceduralMemory] 记录成功失败: {}", e.getMessage());
            }
        }
    }

    /**
     * 检测用户消息对应的SOP类型
     */
    private String detectSOPType(String message) {
        if (message.contains("扫码") || message.contains("扫描") || message.contains("工序")) {
            return "SCAN_WORKFLOW";
        }
        if (message.contains("工资") || message.contains("结算") || message.contains("计件")) {
            return "WAGE_SETTLEMENT";
        }
        if (message.contains("质检") || message.contains("检验") || message.contains("次品") || message.contains("不合格")) {
            return "QUALITY_CHECK";
        }
        if (message.contains("交期") || message.contains("延期") || message.contains("排产")) {
            return "DELIVERY_FORECAST";
        }
        if (message.contains("供应商") || message.contains("评估") || message.contains("评级")) {
            return "SUPPLIER_EVAL";
        }
        return null;
    }

    private void incrementUsageCount(Long id) {
        try {
            proceduralMemoryMapper.incrementUsageCount(id);
        } catch (Exception e) {
            log.debug("[ProceduralMemory] 记录使用次数失败: {}", e.getMessage());
        }
    }

    private MatchedSOP toMatchedSOP(ProceduralMemory memory) {
        MatchedSOP sop = new MatchedSOP();
        sop.setId(memory.getId());
        sop.setSopName(memory.getSopName());
        sop.setSopType(memory.getSopType());
        sop.setConfidence(memory.getConfidence());
        sop.setSteps(parseSteps(memory.getStepsJson()));
        return sop;
    }

    private List<Step> parseSteps(String stepsJson) {
        if (stepsJson == null || stepsJson.isBlank()) {
            return new ArrayList<>();
        }
        try {
            if (objectMapper != null) {
                return objectMapper.readValue(stepsJson, new TypeReference<List<Step>>() {});
            }
        } catch (Exception e) {
            log.warn("[ProceduralMemory] 解析步骤JSON失败: {}", e.getMessage());
        }
        return new ArrayList<>();
    }

    /**
     * 匹配的SOP结果
     */
    @Data
    public static class MatchedSOP {
        private Long id;
        private String sopName;
        private String sopType;
        private Double confidence;
        private List<Step> steps;

        /**
         * 生成可读的步骤描述
         */
        public String formatSteps() {
            if (steps == null || steps.isEmpty()) {
                return "";
            }
            StringBuilder sb = new StringBuilder();
            sb.append("【").append(sopName).append("】\n");
            for (Step step : steps) {
                sb.append(step.getStep()).append(". ").append(step.getAction());
                if (step.getExpected() != null && !step.getExpected().isBlank()) {
                    sb.append("（预期：").append(step.getExpected()).append("）");
                }
                sb.append("\n");
            }
            return sb.toString();
        }
    }

    /**
     * SOP步骤
     */
    @Data
    public static class Step {
        private Integer step;
        private String action;
        private String tool;
        private String expected;
    }
}
