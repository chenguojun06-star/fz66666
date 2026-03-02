package com.fashion.supplychain.intelligence.service;

import com.fashion.supplychain.dashboard.orchestration.DailyBriefOrchestrator;
import com.fashion.supplychain.intelligence.dto.HealthIndexResponse;
import com.fashion.supplychain.intelligence.dto.MaterialShortageResponse;
import com.fashion.supplychain.intelligence.orchestration.HealthIndexOrchestrator;
import com.fashion.supplychain.intelligence.orchestration.MaterialShortageOrchestrator;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.Map;

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

    /**
     * 构建完整系统上下文，作为 System Prompt 传给 AI
     */
    public String buildSystemPrompt() {
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

        sb.append("【回答要求】\n");
        sb.append("1. 直接引用上方具体数字，不说废话\n");
        sb.append("2. 建议要具体可执行（谁去做什么）\n");
        sb.append("3. 用中文简洁回答，通常3~8句话\n");
        sb.append("4. 若问到系统没有的数据，如实说明\n");

        String result = sb.toString();
        log.debug("[AiContext] 构建完毕，prompt长度={}", result.length());
        return result;
    }
}
