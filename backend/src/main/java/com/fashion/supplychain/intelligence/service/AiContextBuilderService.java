package com.fashion.supplychain.intelligence.service;

import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.dashboard.orchestration.DailyBriefOrchestrator;
import com.fashion.supplychain.intelligence.dto.HealthIndexResponse;
import com.fashion.supplychain.intelligence.dto.MaterialShortageResponse;
import com.fashion.supplychain.intelligence.orchestration.AiChatContextOrchestrator;
import com.fashion.supplychain.intelligence.orchestration.HealthIndexOrchestrator;
import com.fashion.supplychain.intelligence.orchestration.MaterialShortageOrchestrator;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * AI 上下文构建服务
 *
 * <p>每次 AI 对话前，实时抓取系统全量快照，注入 DeepSeek System Prompt，
 * 让 AI 基于真实数据作答，而不是泛泛而谈。
 *
 * <p>数据来源：
 * <ul>
 *   <li>DailyBriefOrchestrator  — 今日运营摘要（扫码/入库/逾期/高风险）</li>
 *   <li>HealthIndexOrchestrator — 供应链健康指数（5维度评分）</li>
 *   <li>MaterialShortageOrchestrator — 面料缺口预警</li>
 * </ul>
 */
@Service
@Slf4j
@RequiredArgsConstructor
public class AiContextBuilderService {

    private final DailyBriefOrchestrator dailyBriefOrchestrator;
    private final HealthIndexOrchestrator healthIndexOrchestrator;
    private final MaterialShortageOrchestrator materialShortageOrchestrator;
    private final AiChatContextOrchestrator aiChatContextOrchestrator;

    /** 租户级上下文缓存，TTL 60 秒（避免同一租户连续对话反复查 4 个 Orchestrator） */
    private static final long CONTEXT_CACHE_TTL_MS = 60_000;
    private final ConcurrentHashMap<Long, CachedContext> contextCache = new ConcurrentHashMap<>();

    private record CachedContext(String prompt, long expiresAt) {
        boolean isExpired() { return System.currentTimeMillis() > expiresAt; }
    }

    /**
     * 构建完整系统上下文，作为 System Prompt 传给 AI。
     * 同一租户 60 秒内复用缓存，避免重复调用 4 个数据编排器。
     */
    public String buildSystemPrompt() {
        Long tenantId = UserContext.tenantId();
        if (tenantId != null) {
            CachedContext cached = contextCache.get(tenantId);
            if (cached != null && !cached.isExpired()) {
                log.debug("[AiContext] 命中缓存 tenantId={}, 剩余{}ms", tenantId, cached.expiresAt - System.currentTimeMillis());
                return cached.prompt;
            }
        }
        String prompt = doBuildSystemPrompt();
        if (tenantId != null) {
            contextCache.put(tenantId, new CachedContext(prompt, System.currentTimeMillis() + CONTEXT_CACHE_TTL_MS));
            // 防止缓存无限膨胀：超过 200 个租户时清理过期条目
            if (contextCache.size() > 200) {
                contextCache.entrySet().removeIf(e -> e.getValue().isExpired());
            }
        }
        return prompt;
    }

    /** 主动失效指定租户的上下文缓存（数据变更时调用） */
    public void invalidateCache(Long tenantId) {
        if (tenantId != null) {
            contextCache.remove(tenantId);
        }
    }

    /** 实际构建逻辑（从 4 个 Orchestrator 拉取实时数据） */
    private String doBuildSystemPrompt() {
        StringBuilder sb = new StringBuilder();
        String today = LocalDate.now().format(DateTimeFormatter.ofPattern("yyyy年MM月dd日"));

        sb.append("你是一名专业的服装供应链管理AI顾问，正在服务一家服装生产企业。\n");
        sb.append("以下是截至").append(today).append("的系统实时数据，请严格基于这些数据回答问题，给出具体可执行的建议。\n\n");

        // ── 今日运营摘要 ──
        try {
            Map<String, Object> brief = dailyBriefOrchestrator.getBrief();
            sb.append("【今日运营摘要】\n");
            sb.append("- 今日扫码次数：").append(brief.getOrDefault("todayScanCount", 0)).append("\n");
            sb.append("- 近7天扫码：").append(brief.getOrDefault("weekScanCount", 0)).append("次\n");
            sb.append("- 昨日入库：").append(brief.getOrDefault("yesterdayWarehousingCount", 0))
              .append("单 / ").append(brief.getOrDefault("yesterdayWarehousingQuantity", 0)).append("件\n");
            sb.append("- 近7天入库：").append(brief.getOrDefault("weekWarehousingCount", 0)).append("单\n");
            sb.append("- 逾期订单：").append(brief.getOrDefault("overdueOrderCount", 0)).append("张\n");
            sb.append("- 高风险订单（7天内到期且进度<50%）：").append(brief.getOrDefault("highRiskOrderCount", 0)).append("张\n");

            // 首要关注订单
            Object topOrder = brief.get("topPriorityOrder");
            if (topOrder instanceof Map) {
                @SuppressWarnings("unchecked")
                Map<String, Object> top = (Map<String, Object>) topOrder;
                sb.append("- 首要关注订单：").append(top.get("orderNo"))
                  .append("（款号：").append(top.get("styleNo"))
                  .append("，工厂：").append(top.get("factoryName"))
                  .append("，进度：").append(top.get("progress")).append("%")
                  .append("，剩余：").append(top.get("daysLeft")).append("天）\n");
            }

            // 系统建议
            Object suggestions = brief.get("suggestions");
            if (suggestions instanceof List) {
                sb.append("- 系统预警：");
                @SuppressWarnings("unchecked")
                List<String> sugg = (List<String>) suggestions;
                sb.append(String.join("；", sugg)).append("\n");
            }
            sb.append("\n");
        } catch (Exception e) {
            log.warn("[AiContext] 获取日报失败: {}", e.getMessage());
            sb.append("【今日运营摘要】（数据暂时不可用）\n\n");
        }

        // ── 供应链健康指数 ──
        try {
            HealthIndexResponse health = healthIndexOrchestrator.calculate();
            sb.append("【供应链健康指数】\n");
            sb.append("- 综合评分：").append(health.getHealthIndex()).append("/100（评级：").append(health.getGrade()).append("）\n");
            sb.append("- 生产执行：").append(health.getProductionScore()).append("分")
              .append("  交期达成：").append(health.getDeliveryScore()).append("分")
              .append("  质量合格：").append(health.getQualityScore()).append("分")
              .append("  库存：").append(health.getInventoryScore()).append("分")
              .append("  财务：").append(health.getFinanceScore()).append("分\n");
            if (health.getTopRisk() != null && !health.getTopRisk().isEmpty()) {
                sb.append("- 首要风险：").append(health.getTopRisk()).append("\n");
            }
            if (health.getSuggestion() != null && !health.getSuggestion().isEmpty()) {
                sb.append("- 健康建议：").append(health.getSuggestion()).append("\n");
            }
            sb.append("\n");
        } catch (Exception e) {
            log.warn("[AiContext] 获取健康指数失败: {}", e.getMessage());
        }

        // ── 面料缺口预警 ──
        try {
            MaterialShortageResponse shortage = materialShortageOrchestrator.predict();
            if (shortage != null && shortage.getShortageItems() != null && !shortage.getShortageItems().isEmpty()) {
                sb.append("【面料缺口预警】（共").append(shortage.getShortageItems().size()).append("种物料缺货）\n");
                int shown = 0;
                for (MaterialShortageResponse.ShortageItem item : shortage.getShortageItems()) {
                    if (shown++ >= 5) break; // 最多展示5条避免 Prompt 过长
                    sb.append("- [").append(item.getRiskLevel()).append("] ")
                      .append(item.getMaterialName() != null ? item.getMaterialName() : item.getMaterialCode())
                      .append("（").append(item.getMaterialCode()).append("）")
                      .append(" 库存:").append(item.getCurrentStock())
                      .append(" 需求:").append(item.getDemandQuantity())
                      .append(" 缺口:").append(item.getShortageQuantity());
                    if (item.getSupplierName() != null) {
                        sb.append(" 供应商:").append(item.getSupplierName());
                    }
                    sb.append("\n");
                }
                sb.append("- 库存充足物料：").append(shortage.getSufficientCount()).append("种\n\n");
            } else {
                sb.append("【面料缺口预警】当前无面料缺口风险\n\n");
            }
        } catch (Exception e) {
            log.warn("[AiContext] 获取面料缺口失败: {}", e.getMessage());
        }

        // ── 租户智能沉淀上下文（仅供 AI 聊天使用） ──
        try {
            String tenantIntelligenceContext = aiChatContextOrchestrator.buildTenantIntelligenceContext();
            if (tenantIntelligenceContext != null && !tenantIntelligenceContext.isBlank()) {
                sb.append(tenantIntelligenceContext);
            }
        } catch (Exception e) {
            log.warn("[AiContext] 获取租户智能沉淀上下文失败: {}", e.getMessage());
        }

        sb.append("【回答要求】\n");
        sb.append("1. 不要空话，不要讲概念，不要泛泛而谈，优先回答怎么解决问题\n");
        sb.append("2. 必须优先引用上方真实数据、真实表里已有结论，不允许脱离数据瞎推测\n");
        sb.append("3. 遇到诊断类、建议类、经营分析类问题时，尽量按以下结构输出：\n");
        sb.append("   【结论】先直接说最关键判断\n");
        sb.append("   【依据】列2~4条数据依据，必须带数字/对象/风险点\n");
        sb.append("   【动作】明确谁去做什么，最多3条\n");
        sb.append("   【预期效果】说明处理后预计改善什么\n");
        sb.append("4. 遇到纯查询类问题，先直接给答案，再补一小段依据，不要强行长篇展开\n");
        sb.append("5. 若问到系统没有的数据，如实说明缺什么数据，不要编造\n");
        sb.append("6. 优先结合租户经营目标、最近反馈原因、痛点、方案库、工厂能力和历史效果回流给建议\n");
        sb.append("7. 建议必须可落地，责任对象优先用：老板/跟单/生产主管/工厂/采购/财务 这些真实角色\n");
        sb.append("8. 回答语言保持中文口语化、直接，通常控制在 4~10 句内；日常对话可活泼一些，适当加 1~2 个 emoji，末尾可带语气词；数字/分析/建议部分依然严谨精准\n");

        String result = sb.toString();
        log.debug("[AiContext] 构建完毕，prompt长度={}", result.length());
        return result;
    }
}
