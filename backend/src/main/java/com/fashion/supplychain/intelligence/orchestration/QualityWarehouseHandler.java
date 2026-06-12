package com.fashion.supplychain.intelligence.orchestration;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fashion.supplychain.intelligence.dto.MaterialShortageResponse;
import com.fashion.supplychain.intelligence.dto.NlQueryResponse;
import com.fashion.supplychain.intelligence.service.AiAdvisorService;
import com.fashion.supplychain.dashboard.service.DashboardQueryService;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.*;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;
import org.springframework.context.annotation.Lazy;

/**
 * 质量/入库/物料缺口查询处理器
 */
@Component
@Lazy
@Slf4j
public class QualityWarehouseHandler {

    @Autowired private DashboardQueryService dashboardQueryService;
    @Autowired private AiAdvisorService aiAdvisorService;
    @Autowired private MaterialShortageOrchestrator materialShortageOrchestrator;

    public NlQueryResponse handleQualityQuery(java.util.function.BiConsumer<NlQueryResponse, Long> insightFn,
                                               Long tenantId) {
        NlQueryResponse resp = new NlQueryResponse();
        resp.setIntent("quality");

        long qualified = dashboardQueryService.sumTotalQualifiedQuantity();
        long unqualified = dashboardQueryService.sumTotalUnqualifiedQuantity();
        long total = qualified + unqualified;

        if (total > 0) {
            double rate = Math.round(qualified * 1000.0 / total) / 10.0;
            resp.setAnswer(String.format("📊 质检数据：\n• 合格率：%.1f%%\n• 合格：%d 件 / 不合格：%d 件\n• 累计质检：%d 件",
                    rate, qualified, unqualified, total));
            resp.setConfidence(85);
            Map<String, Object> data = new LinkedHashMap<>();
            data.put("qualifiedRate", rate);
            data.put("qualified", qualified);
            data.put("unqualified", unqualified);
            resp.setData(data);
        } else {
            resp.setAnswer("暂无质检数据记录");
            resp.setConfidence(70);
        }
        insightFn.accept(resp, tenantId);
        resp.setSuggestions(Arrays.asList("今日产量多少？", "有延期订单吗？", "整体情况怎么样？"));
        return resp;
    }

    public NlQueryResponse handleWarehousingQuery() {
        NlQueryResponse resp = new NlQueryResponse();
        resp.setIntent("warehousing");

        LocalDateTime todayStart = LocalDateTime.of(LocalDate.now(), LocalTime.MIN);
        LocalDateTime todayEnd = LocalDateTime.of(LocalDate.now(), LocalTime.MAX);
        long todayCount = dashboardQueryService.countWarehousingBetween(todayStart, todayEnd);
        long totalCount = dashboardQueryService.countTotalWarehousing();

        resp.setAnswer(String.format("📦 入库数据：\n• 今日入库：%d 单\n• 历史累计入库：%d 单", todayCount, totalCount));
        resp.setConfidence(85);
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("todayWarehousing", todayCount);
        data.put("totalWarehousing", totalCount);
        resp.setData(data);
        resp.setSuggestions(Arrays.asList("今日产量多少？", "有延期订单吗？", "和昨天比怎么样？"));
        return resp;
    }

    public NlQueryResponse handleMaterialGapQuery(Long tenantId) {
        NlQueryResponse resp = new NlQueryResponse();
        resp.setIntent("material_gap");
        resp.setComponentName("MaterialGapCard");
        try {
            MaterialShortageResponse result = materialShortageOrchestrator.predict();

            if (result == null || result.getShortageItems().isEmpty()) {
                resp.setAnswer("✅ 当前物料库存充足，未发现缺口");
                resp.setConfidence(90);
                return resp;
            }

            List<MaterialShortageResponse.ShortageItem> items = result.getShortageItems();
            StringBuilder sb = new StringBuilder("📦 面料缺口预警：\n");
            sb.append(String.format("• 总计 %d 种物料存在缺口（其中 %d 种高风险）\n",
                    items.size(),
                    items.stream().filter(i -> "HIGH".equals(i.getRiskLevel())).count()));

            int showLimit = Math.min(items.size(), 8);
            sb.append("\n📋 缺口明细（按严重程度排序）：\n");
            for (int i = 0; i < showLimit; i++) {
                MaterialShortageResponse.ShortageItem item = items.get(i);
                String riskTag = switch (item.getRiskLevel()) {
                    case "HIGH" -> "🔴";
                    case "MEDIUM" -> "🟠";
                    default -> "🟡";
                };
                sb.append(String.format("  %d. %s %s %s | 需%d | 库存%d | 缺%d\n",
                        i + 1, riskTag,
                        item.getMaterialName(),
                        item.getSpec() != null ? item.getSpec() : "",
                        item.getDemandQuantity(), item.getCurrentStock(), item.getShortageQuantity()));
            }
            if (items.size() > showLimit) {
                sb.append(String.format("  ... 还有 %d 种物料缺口\n", items.size() - showLimit));
            }

            sb.append("\n💡 建议：高风险物料请尽快联系供应商补货，避免生产中断");

            resp.setAnswer(sb.toString().trim());
            resp.setConfidence(85);

            Map<String, Object> data = new LinkedHashMap<>();
            data.put("totalGaps", items.size());
            data.put("highRisk", items.stream().filter(i -> "HIGH".equals(i.getRiskLevel())).count());
            resp.setData(data);
            resp.setSuggestions(Arrays.asList("采购面料", "查看BOM表", "库存盘点"));
        } catch (Exception e) {
            String traceId = UUID.randomUUID().toString().replace("-", "").substring(0, 8);
            log.warn("[NlQuery] 物料缺口查询失败 traceId={}: {}", traceId, e.getMessage());
            resp.setErrorTraceId(traceId);
            resp.setAnswer("面料缺口数据查询失败（追踪ID: " + traceId + "），请稍后重试");
            resp.setConfidence(20);
        }
        return resp;
    }
}