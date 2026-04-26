package com.fashion.supplychain.intelligence.service;

import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.common.tenant.TenantAssert;
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
        TenantAssert.assertTenantContext();
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

    /** 实际构建逻辑（轻量摘要 + 工具指引，详细数据由 AI 按需通过工具查询） */
    private String doBuildSystemPrompt() {
        StringBuilder sb = new StringBuilder();
        String today = LocalDate.now().format(DateTimeFormatter.ofPattern("yyyy年MM月dd日"));

        sb.append("以下是截至").append(today).append("的系统状态概要。详细数据请通过工具按需查询，不要仅凭概要数字展开长篇分析。\n\n");

        try {
            Map<String, Object> brief = dailyBriefOrchestrator.getBrief();
            int overdueCount = ((Number) brief.getOrDefault("overdueOrderCount", 0)).intValue();
            int highRiskCount = ((Number) brief.getOrDefault("highRiskOrderCount", 0)).intValue();
            int todayScan = ((Number) brief.getOrDefault("todayScanCount", 0)).intValue();

            sb.append("【系统状态概要】\n");
            sb.append("- 今日扫码：").append(todayScan).append("次");
            sb.append("  逾期订单：").append(overdueCount).append("张");
            sb.append("  高风险订单：").append(highRiskCount).append("张\n");

            if (overdueCount > 0 || highRiskCount > 0) {
                sb.append("- 风险等级：").append(overdueCount >= 5 || highRiskCount >= 3 ? "🔴紧急" : overdueCount > 0 ? "🟡需关注" : "🟢正常").append("\n");
                sb.append("（用户询问订单/风险/交付相关问题时，请调用 tool_management_dashboard 或 tool_order_list 获取详细数据后再回答）\n");
            } else {
                sb.append("- 风险等级：🟢正常\n");
            }
            sb.append("\n");
        } catch (Exception e) {
            log.warn("[AiContext] 获取日报失败: {}", e.getMessage());
            sb.append("【系统状态概要】（数据暂时不可用，请通过工具查询）\n\n");
        }

        try {
            HealthIndexResponse health = healthIndexOrchestrator.calculate();
            sb.append("【健康指数】综合：").append(health.getHealthIndex()).append("/100（").append(health.getGrade()).append("）");
            if (health.getTopRisk() != null && !health.getTopRisk().isEmpty()) {
                sb.append("  首要风险：").append(health.getTopRisk());
            }
            sb.append("\n（用户询问经营/健康度相关问题时，请调用 tool_management_dashboard 获取5维度详细评分）\n\n");
        } catch (Exception e) {
            log.warn("[AiContext] 获取健康指数失败: {}", e.getMessage());
            sb.append("【健康指数】（数据暂时不可用，请通过工具查询）\n\n");
        }

        try {
            MaterialShortageResponse shortage = materialShortageOrchestrator.predict();
            if (shortage != null && shortage.getShortageItems() != null && !shortage.getShortageItems().isEmpty()) {
                sb.append("【面料预警】有").append(shortage.getShortageItems().size()).append("种物料存在缺口");
                int shown = 0;
                for (MaterialShortageResponse.ShortageItem item : shortage.getShortageItems()) {
                    if (shown++ >= 2) break;
                    sb.append("；").append(item.getMaterialName() != null ? item.getMaterialName() : item.getMaterialCode())
                      .append("缺").append(item.getShortageQuantity());
                }
                sb.append("\n（用户询问面料/采购/物料相关问题时，请调用工具获取完整缺口清单）\n\n");
            }
        } catch (Exception e) {
            log.warn("[AiContext] 获取面料缺口失败: {}", e.getMessage());
        }

        try {
            String tenantIntelligenceContext = aiChatContextOrchestrator.buildTenantIntelligenceContext();
            if (tenantIntelligenceContext != null && !tenantIntelligenceContext.isBlank()) {
                sb.append(tenantIntelligenceContext);
            }
        } catch (Exception e) {
            log.warn("[AiContext] 获取租户智能沉淀上下文失败: {}", e.getMessage());
        }

        sb.append("【回答要求】\n");
        sb.append("1. 先精准回答用户的问题，不要跑题。用户问A就答A，不要自顾自讲B\n");
        sb.append("2. 只有当用户的问题与运营/订单/风险/交付直接相关时，才结合上方概要数据补充说明\n");
        sb.append("3. 需要详细数据时，优先调用工具查询，不要凭概要数字推测细节\n");
        sb.append("4. 遇到纯查询类问题，先直接给答案，再补一小段依据，不要强行长篇展开\n");
        sb.append("5. 若问到系统没有的数据，如实说明缺什么数据，不要编造\n");
        sb.append("6. 优先结合租户经营目标、痛点、方案库、工厂能力和历史效果回流给建议\n");
        sb.append("7. 建议必须可落地，责任对象优先用：老板/跟单/生产主管/工厂/采购/财务 这些真实角色\n");
        sb.append("8. 回答语言保持中文口语化、直接，通常控制在 4~10 句内；日常对话可活泼一些，适当加 1~2 个 emoji；数字/分析/建议部分依然严谨精准\n");

        String result = sb.toString();
        log.debug("[AiContext] 构建完毕，prompt长度={}", result.length());
        return result;
    }
}
