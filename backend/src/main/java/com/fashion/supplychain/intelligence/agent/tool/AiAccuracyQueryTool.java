package com.fashion.supplychain.intelligence.agent.tool;

import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.intelligence.agent.AiTool;
import com.fashion.supplychain.intelligence.dto.AiAccuracyDashboardResponse;
import com.fashion.supplychain.intelligence.dto.AiAccuracyDashboardResponse.SceneAccuracyItem;
import com.fashion.supplychain.intelligence.orchestration.AiAccuracyOrchestrator;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * AI 准确率查询工具 — 让用户在小云弹窗对话中直接查看 AI 能力准确率数据。
 *
 * <p>典型对话触发：
 * <ul>
 *   <li>"AI准确率怎么样？"</li>
 *   <li>"交期预测命中率是多少？"</li>
 *   <li>"小云的建议采纳率有多高？"</li>
 *   <li>"AI能力怎么样，能说清楚几成准吗？"</li>
 * </ul>
 *
 * <p>返回三大核心指标（中文可读格式，直接输出到聊天气泡）：
 * <ol>
 *   <li>交期预测命中率（±N天容差）</li>
 *   <li>AI 建议采纳率</li>
 *   <li>平均偏差天数</li>
 * </ol>
 */
@Slf4j
@Component
public class AiAccuracyQueryTool extends AbstractAgentTool {

    @Autowired
    private AiAccuracyOrchestrator aiAccuracyOrchestrator;

    @Override
    public String getName() {
        return "tool_ai_accuracy_query";
    }

    @Override
    public ToolDomain getDomain() {
        return ToolDomain.ANALYSIS;
    }

    @Override
    public AiTool getToolDefinition() {
        Map<String, Object> properties = new LinkedHashMap<>();
        properties.put("toleranceDays", stringProp(
                "交期命中容差（天）：1=严格±1天、2=标准±2天（默认）、3=宽松±3天"));
        properties.put("recentDays", stringProp(
                "统计时间窗口（天），默认90天；可输入 30、60、90、180"));

        return buildToolDef(
                "查询 AI 能力准确率量化报告：交期预测命中率、建议采纳率、平均偏差天数。"
                + "当用户问[准确率/命中率/采纳率/几成准/AI效果]等时调用。",
                properties,
                List.of()   // 参数均可选
        );
    }

    @Override
    protected String doExecute(String argumentsJson) throws Exception {
        Long tenantId = UserContext.tenantId();
        Map<String, Object> args = parseArgs(argumentsJson);

        int toleranceDays = 2;
        int recentDays    = 90;
        Object t = args.get("toleranceDays");
        Object r = args.get("recentDays");
        if (t != null && !t.toString().isBlank()) {
            try { toleranceDays = Integer.parseInt(t.toString().trim()); } catch (NumberFormatException e) { log.debug("数字解析失败: {}", e.getMessage()); }
        }
        if (r != null && !r.toString().isBlank()) {
            try { recentDays = Integer.parseInt(r.toString().trim()); } catch (NumberFormatException e) { log.debug("数字解析失败: {}", e.getMessage()); }
        }

        AiAccuracyDashboardResponse data =
                aiAccuracyOrchestrator.computeDashboard(tenantId, toleranceDays, recentDays);

        return buildReadableReport(data);
    }

    // ─── 把 DTO 格式化为对话气泡友好的中文文本 ───────────────────────

    private String buildReadableReport(AiAccuracyDashboardResponse d) throws Exception {
        StringBuilder sb = new StringBuilder();

        // 标题
        sb.append("📊 **AI 能力准确率报告**（").append(d.getPeriodDesc()).append("）\n\n");

        // 核心三大指标
        sb.append("### 三大核心指标\n");

        // 1. 交期命中率
        int hitPct = (int) Math.round(d.getDeliveryHitRate() * 100);
        String hitEmoji = hitPct >= 80 ? "🟢" : hitPct >= 60 ? "🟡" : "🔴";
        sb.append(hitEmoji).append(" **交期预测命中率**：**").append(hitPct).append("%**");
        if (d.getTotalPredictions() > 0) {
            sb.append("（").append(d.getHitCount()).append("/")
              .append(d.getTotalPredictions()).append(" 次，容差 ")
              .append(d.getHitToleranceDesc()).append("）");
        } else {
            sb.append("（暂无足够样本数据）");
        }
        sb.append("\n");

        // 2. 建议采纳率
        int adoptPct = (int) Math.round(d.getAdoptionRate() * 100);
        String adoptEmoji = adoptPct >= 70 ? "🟢" : adoptPct >= 50 ? "🟡" : "🔴";
        sb.append(adoptEmoji).append(" **AI建议采纳率**：**").append(adoptPct).append("%**");
        if (d.getTotalAdoptionSamples() > 0) {
            sb.append("（").append(d.getTotalAdoptionSamples()).append(" 条有反馈记录）");
        } else {
            sb.append("（暂无反馈数据）");
        }
        sb.append("\n");

        // 3. 平均偏差
        String biasStr = String.format("%.1f", d.getAvgBiasDays());
        String biasEmoji = d.getAvgBiasDays() <= 1.5 ? "🟢" : d.getAvgBiasDays() <= 3.0 ? "🟡" : "🔴";
        sb.append(biasEmoji).append(" **平均预测偏差**：**").append(biasStr).append(" 天**\n\n");

        // 商业解读句
        sb.append("---\n");
        if (hitPct >= 75 && adoptPct >= 60) {
            sb.append("✅ 整体表现优秀，可作为供应链效率提升的有力佐证。\n");
        } else if (hitPct >= 60) {
            sb.append("⚡ 交期预测已达到可用水准，建议持续积累反馈样本提升采纳率。\n");
        } else {
            sb.append("📈 数据样本仍在积累中，随着更多订单周期完成，准确率将持续提升。\n");
        }

        // 场景细分（折叠展示）
        List<SceneAccuracyItem> scenes = d.getSceneBreakdown();
        if (scenes != null && !scenes.isEmpty()) {
            sb.append("\n**场景细分成功率**\n");
            for (SceneAccuracyItem item : scenes) {
                int pct = (int) Math.round(item.getSuccessRate() * 100);
                sb.append("- ").append(item.getScene())
                  .append("：").append(pct).append("%")
                  .append("（").append(item.getSuccessCount()).append("/")
                  .append(item.getTotalCalls()).append("）\n");
            }
        }

        return successJson(sb.toString(), Map.of(
                "deliveryHitRate",        d.getDeliveryHitRate(),
                "adoptionRate",           d.getAdoptionRate(),
                "avgBiasDays",            d.getAvgBiasDays(),
                "totalPredictions",       d.getTotalPredictions(),
                "totalAdoptionSamples",   d.getTotalAdoptionSamples()
        ));
    }
}
