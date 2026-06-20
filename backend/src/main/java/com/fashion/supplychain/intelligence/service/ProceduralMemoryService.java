package com.fashion.supplychain.intelligence.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fashion.supplychain.intelligence.entity.ProceduralMemory;
import com.fashion.supplychain.intelligence.mapper.ProceduralMemoryMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.annotation.Lazy;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

/**
 * L4 程序性记忆服务（SOP / 流程 / 技能）。
 *
 * <p>核心能力：
 * <ul>
 *   <li>{@link #findMatchedSops} — 按 trigger_keywords 匹配用户意图，返回 confidence≥60 的启用 SOP</li>
 *   <li>{@link #buildProceduralSopBlock} — 组装 SOP 上下文块（≤500 tokens），命中时调用 incrUsageCount</li>
 *   <li>{@link #promoteFromCrystallizedSkill} — 从结晶化技能升级为程序性记忆（source=crystallized）</li>
 * </ul>
 *
 * <p>设计原则：
 * <ul>
 *   <li>多租户隔离（P0 铁律 4）：所有查询带 tenant_id WHERE</li>
 *   <li>降级安全：本服务异常不影响主流程（AiAgentPromptHelper 用 try-catch 包裹）</li>
 *   <li>精确匹配优先：trigger_keywords LIKE 命中即返回，不走 LLM 推理</li>
 *   <li>置信度过滤：confidence < 60 的 SOP 不注入（避免低质量流程干扰）</li>
 * </ul>
 *
 * <p>与 {@link AiAgentMemoryHelper#buildProceduralMemoryBlock()} 的区别：
 * <ul>
 *   <li>AiAgentMemoryHelper 的程序记忆：自动学习的工具调用模式（few-shot，进程内 ConcurrentHashMap）</li>
 *   <li>本服务的程序记忆：人工编写的业务 SOP（结构化步骤，PostgreSQL 持久化）</li>
 * </ul>
 */
@Slf4j
@Service
@Lazy
@RequiredArgsConstructor
public class ProceduralMemoryService {

    private final ProceduralMemoryMapper proceduralMemoryMapper;

    /** 置信度阈值：低于此值的 SOP 不注入 */
    private static final double CONFIDENCE_THRESHOLD = 60.0;

    /** SOP 上下文块 token 预算（约 500 tokens ≈ 2000 字符） */
    private static final int SOP_BLOCK_MAX_CHARS = 2000;

    /** 单次最多注入的 SOP 条数 */
    private static final int MAX_INJECT_SOP_COUNT = 3;

    /**
     * 按用户消息匹配 SOP（多租户隔离）。
     *
     * <p>匹配策略：
     * <ol>
     *   <li>提取用户消息中的关键词（中文双字符滑动 + 单字符 + 英文词）</li>
     *   <li>对每个关键词调用 findByTriggerKeyword（LIKE 匹配）</li>
     *   <li>合并去重，按 confidence 降序，过滤 confidence &lt; 60</li>
     * </ol>
     *
     * @param tenantId    租户ID（必填，P0 铁律 4）
     * @param userMessage 用户消息
     * @return 匹配的 SOP 列表（可能为空，不返回 null）
     */
    public List<ProceduralMemory> findMatchedSops(Long tenantId, String userMessage) {
        if (tenantId == null || userMessage == null || userMessage.isBlank()) {
            return Collections.emptyList();
        }
        try {
            Set<String> keywords = extractKeywords(userMessage);
            if (keywords.isEmpty()) return Collections.emptyList();

            Set<Long> seenIds = new LinkedHashSet<>();
            List<ProceduralMemory> matched = new ArrayList<>();
            for (String kw : keywords) {
                if (kw.length() < 2) continue; // 单字符关键词噪声大，跳过
                List<ProceduralMemory> hits = proceduralMemoryMapper.findByTriggerKeyword(tenantId, kw);
                if (hits == null) continue;
                for (ProceduralMemory sop : hits) {
                    if (seenIds.add(sop.getId()) && sop.getConfidence() != null
                            && sop.getConfidence().doubleValue() >= CONFIDENCE_THRESHOLD) {
                        matched.add(sop);
                    }
                }
            }
            // 按 confidence 降序，限制条数
            matched.sort((a, b) -> {
                BigDecimal ca = a.getConfidence() == null ? BigDecimal.ZERO : a.getConfidence();
                BigDecimal cb = b.getConfidence() == null ? BigDecimal.ZERO : b.getConfidence();
                return cb.compareTo(ca);
            });
            if (matched.size() > MAX_INJECT_SOP_COUNT) {
                return matched.subList(0, MAX_INJECT_SOP_COUNT);
            }
            return matched;
        } catch (Exception e) {
            log.warn("[L4-PM] findMatchedSops 失败 tenantId={}: {}", tenantId, e.getMessage());
            return Collections.emptyList();
        }
    }

    /**
     * 组装 SOP 上下文块（≤500 tokens），命中时调用 incrUsageCount。
     *
     * <p>注入格式：
     * <pre>
     * 【L4 程序性记忆：业务 SOP】
     * 以下 SOP 与用户问题相关，请按步骤执行（实时数据仍需用工具查询）：
     *
     * ▸ SOP: 扫码流程（置信度 85%）
     *   前置: 操作员已登录且绑定工厂
     *   步骤:
     *     1. 扫工序码 → 调用 scan_operation 工具
     *     2. 校验工序归属 → expected: 工序属于当前生产单
     *     ...
     *   后置: 扫码记录写入 t_scan_record
     * </pre>
     *
     * @param tenantId    租户ID
     * @param userMessage 用户消息
     * @return SOP 上下文块字符串；无匹配返回空字符串
     */
    public String buildProceduralSopBlock(Long tenantId, String userMessage) {
        List<ProceduralMemory> sops = findMatchedSops(tenantId, userMessage);
        if (sops.isEmpty()) return "";

        StringBuilder sb = new StringBuilder();
        sb.append("\n【L4 程序性记忆：业务 SOP】\n");
        sb.append("以下 SOP 与用户问题相关，请按步骤执行（实时数据仍需用工具查询，SOP 仅提供流程框架）：\n\n");

        int totalChars = sb.length();
        for (ProceduralMemory sop : sops) {
            String block = formatSop(sop);
            if (totalChars + block.length() > SOP_BLOCK_MAX_CHARS) {
                sb.append("…（更多 SOP 已省略，避免超 token 预算）\n");
                break;
            }
            sb.append(block);
            totalChars += block.length();

            // 命中即计数（success 默认 false，由后续反馈机制更新 success_count）
            try {
                proceduralMemoryMapper.incrUsageCount(sop.getId());
            } catch (Exception e) {
                log.debug("[L4-PM] incrUsageCount 失败 sopId={}: {}", sop.getId(), e.getMessage());
            }
        }
        return sb.toString();
    }

    /**
     * 从结晶化技能升级为程序性记忆（source=crystallized）。
     *
     * <p>触发条件（由 SkillCrystallizationService 判断）：
     * success_count ≥ 10 且 avgRating ≥ 4.0 时升级。
     *
     * <p>幂等：同 tenantId + sopName 已存在则更新 steps_json/trigger_keywords/version+1。
     *
     * @param tenantId        租户ID
     * @param skillName       技能名称（作为 sop_name）
     * @param stepsJson       步骤 JSON
     * @param triggerKeywords 触发关键词（逗号分隔）
     */
    public void promoteFromCrystallizedSkill(Long tenantId, String skillName,
                                              String stepsJson, String triggerKeywords) {
        if (tenantId == null || skillName == null || skillName.isBlank()) return;
        try {
            ProceduralMemory existing = proceduralMemoryMapper.selectOne(
                    new LambdaQueryWrapper<ProceduralMemory>()
                            .eq(ProceduralMemory::getTenantId, tenantId)
                            .eq(ProceduralMemory::getSopName, skillName)
                            .last("LIMIT 1"));
            if (existing == null) {
                ProceduralMemory sop = new ProceduralMemory();
                sop.setTenantId(tenantId);
                sop.setSopName(skillName);
                sop.setSopType(inferSopType(skillName, triggerKeywords));
                sop.setStepsJson(stepsJson);
                sop.setTriggerKeywords(triggerKeywords);
                sop.setConfidence(new BigDecimal("0.85")); // 结晶化升级，置信度高于人工默认 0.80
                sop.setUsageCount(0);
                sop.setSuccessCount(0);
                sop.setVersion(1);
                sop.setSource("crystallized");
                sop.setEnabled(1);
                proceduralMemoryMapper.insert(sop);
                log.info("[L4-PM] 结晶化技能升级为程序性记忆 tenantId={} sopName={}", tenantId, skillName);
            } else {
                existing.setStepsJson(stepsJson);
                existing.setTriggerKeywords(triggerKeywords);
                existing.setVersion((existing.getVersion() == null ? 1 : existing.getVersion()) + 1);
                existing.setSource("crystallized");
                proceduralMemoryMapper.updateById(existing);
                log.info("[L4-PM] 结晶化技能更新程序性记忆 tenantId={} sopName={} version={}",
                        tenantId, skillName, existing.getVersion());
            }
        } catch (Exception e) {
            log.warn("[L4-PM] promoteFromCrystallizedSkill 失败 tenantId={} skillName={}: {}",
                    tenantId, skillName, e.getMessage());
        }
    }

    /**
     * 反馈机制：标记某次 SOP 调用是否成功（用于 success_count 累计）。
     */
    public void recordSopOutcome(Long sopId, boolean success) {
        if (sopId == null) return;
        try {
            if (success) {
                proceduralMemoryMapper.incrUsageAndSuccessCount(sopId);
            } else {
                proceduralMemoryMapper.incrUsageCount(sopId);
            }
        } catch (Exception e) {
            log.debug("[L4-PM] recordSopOutcome 失败 sopId={}: {}", sopId, e.getMessage());
        }
    }

    // ──────────────────────────────────────────────────────────────
    //  内部工具
    // ──────────────────────────────────────────────────────────────

    private String formatSop(ProceduralMemory sop) {
        StringBuilder sb = new StringBuilder();
        sb.append("▸ SOP: ").append(sop.getSopName());
        if (sop.getConfidence() != null) {
            sb.append("（置信度 ").append(sop.getConfidence()).append("%）");
        }
        sb.append("\n");
        if (sop.getPreconditions() != null && !sop.getPreconditions().isBlank()) {
            sb.append("  前置: ").append(sop.getPreconditions()).append("\n");
        }
        sb.append("  步骤:\n").append(formatSteps(sop.getStepsJson()));
        if (sop.getPostcheck() != null && !sop.getPostcheck().isBlank()) {
            sb.append("  后置: ").append(sop.getPostcheck()).append("\n");
        }
        sb.append("\n");
        return sb.toString();
    }

    /**
     * 格式化 steps_json 为可读文本。
     * steps_json 格式：[{"step":1,"action":"扫工序码","tool":"scan_operation","expected":"工序属于当前生产单"}]
     * 解析失败时直接返回原始 JSON。
     */
    private String formatSteps(String stepsJson) {
        if (stepsJson == null || stepsJson.isBlank()) return "  (无步骤定义)\n";
        try {
            com.fasterxml.jackson.databind.ObjectMapper mapper = new com.fasterxml.jackson.databind.ObjectMapper();
            com.fasterxml.jackson.databind.JsonNode arr = mapper.readTree(stepsJson);
            if (!arr.isArray() || arr.isEmpty()) return "  (无步骤定义)\n";
            StringBuilder sb = new StringBuilder();
            for (com.fasterxml.jackson.databind.JsonNode step : arr) {
                int idx = step.path("step").asInt(0);
                String action = step.path("action").asText("");
                String tool = step.path("tool").asText("");
                String expected = step.path("expected").asText("");
                sb.append("    ").append(idx).append(". ").append(action);
                if (!tool.isEmpty()) sb.append(" → 调用 ").append(tool).append(" 工具");
                sb.append("\n");
                if (!expected.isEmpty()) sb.append("       expected: ").append(expected).append("\n");
            }
            return sb.toString();
        } catch (Exception e) {
            // 解析失败，返回原始 JSON（截断防超长）
            return "  " + (stepsJson.length() > 300 ? stepsJson.substring(0, 300) + "…" : stepsJson) + "\n";
        }
    }

    /**
     * 从用户消息提取关键词（中文双字符滑动 + 单字符 + 英文词）。
     */
    private Set<String> extractKeywords(String message) {
        Set<String> keywords = new LinkedHashSet<>();
        if (message == null || message.isBlank()) return keywords;
        String trimmed = message.trim();
        // 英文分词
        String[] words = trimmed.split("[\\s,，。.!！?？;；:：、/\\\\()（）\\[\\]【】{}]+");
        for (String w : words) {
            if (w.length() >= 2) keywords.add(w.toLowerCase());
        }
        // 中文双字符滑动窗口
        for (int i = 0; i < trimmed.length() - 1; i++) {
            char c1 = trimmed.charAt(i);
            char c2 = trimmed.charAt(i + 1);
            if (isChineseChar(c1) && isChineseChar(c2)) {
                keywords.add("" + c1 + c2);
            }
        }
        return keywords;
    }

    private boolean isChineseChar(char c) {
        return c >= '\u4e00' && c <= '\u9fff';
    }

    /**
     * 根据技能名/关键词推断 SOP 类型。
     */
    private String inferSopType(String skillName, String triggerKeywords) {
        String combined = (skillName + " " + (triggerKeywords == null ? "" : triggerKeywords)).toLowerCase();
        if (combined.contains("扫码") || combined.contains("scan")) return "SCAN_WORKFLOW";
        if (combined.contains("工资") || combined.contains("结算") || combined.contains("wage")) return "WAGE_SETTLEMENT";
        if (combined.contains("交期") || combined.contains("delivery")) return "DELIVERY_FORECAST";
        if (combined.contains("供应商") || combined.contains("supplier")) return "SUPPLIER_EVAL";
        if (combined.contains("质检") || combined.contains("quality")) return "QUALITY_CHECK";
        return "GENERAL";
    }
}
