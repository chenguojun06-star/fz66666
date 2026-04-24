package com.fashion.supplychain.intelligence.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.common.tenant.TenantAssert;
import com.fashion.supplychain.intelligence.dto.ProcessPriceHintResponse;
import com.fashion.supplychain.intelligence.dto.ProcessPriceHintResponse.RecentRecord;
import com.fashion.supplychain.style.entity.StyleInfo;
import com.fashion.supplychain.style.entity.StyleProcess;
import com.fashion.supplychain.style.service.StyleInfoService;
import com.fashion.supplychain.style.service.StyleProcessService;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.*;
import java.util.stream.Collectors;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

/**
 * 工序单价 AI 提示编排器
 *
 * <p>当用户在工序表格中输入工序名称时，自动检索同租户历史记录，
 * 返回价格区间与智能建议，帮助定价更准确、更一致。
 *
 * <p>算法：
 * <ol>
 *   <li>查询同租户所有款式的该工序历史单价</li>
 *   <li>计算 min / max / avg；加权平均（最近记录权重 × 2）得出建议价</li>
 *   <li>根据标准工时差异提供调整说明</li>
 * </ol>
 */
@Service
@Slf4j
public class ProcessPriceHintOrchestrator {

    @Autowired
    private StyleProcessService styleProcessService;

    @Autowired
    private StyleInfoService styleInfoService;

    /**
     * 查询工序单价提示
     *
     * @param processName  工序名称（如"剪线"、"锁边"）
     * @param standardTime 当前填写的标准工时（秒），用于判断是否需要价格调整提示，可为 null
     * @return 价格提示响应
     */
    public ProcessPriceHintResponse hint(String processName, Integer standardTime) {
        ProcessPriceHintResponse resp = new ProcessPriceHintResponse();
        resp.setProcessName(processName);
        resp.setRecentRecords(Collections.emptyList());

        if (!StringUtils.hasText(processName)) {
            resp.setReasoning("请先输入工序名称");
            return resp;
        }

        try {
            TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();

            // 1. 获取当前租户的所有款式 ID → Map<styleId, styleNo>
            Map<Long, String> styleIdToNo = fetchStyleIdToNoMap(tenantId);
            if (styleIdToNo.isEmpty()) {
                resp.setReasoning("暂无历史数据");
                return resp;
            }

            // 2. 查询同名工序的历史记录（按 styleId 范围过滤实现租户隔离）
            QueryWrapper<StyleProcess> qw = new QueryWrapper<>();
            qw.in("style_id", styleIdToNo.keySet())
              .eq("process_name", processName.trim())
              .isNotNull("price")
              .gt("price", BigDecimal.ZERO)
              .orderByDesc("id"); // 近似按创建时间倒序（UUID 排序）
            List<StyleProcess> allRecords = styleProcessService.list(qw);

            if (allRecords.isEmpty()) {
                resp.setReasoning("该工序名称暂无历史定价记录，建议参考同类工序");
                return resp;
            }

            resp.setUsageCount(allRecords.size());

            // 3. 统计 min / max / avg
            List<BigDecimal> prices = allRecords.stream()
                    .map(StyleProcess::getPrice)
                    .filter(Objects::nonNull)
                    .collect(Collectors.toList());

            BigDecimal minPrice = prices.stream().min(BigDecimal::compareTo).orElse(BigDecimal.ZERO);
            BigDecimal maxPrice = prices.stream().max(BigDecimal::compareTo).orElse(BigDecimal.ZERO);
            BigDecimal sum = prices.stream().reduce(BigDecimal.ZERO, BigDecimal::add);
            BigDecimal avgPrice = sum.divide(BigDecimal.valueOf(prices.size()), 4, RoundingMode.HALF_UP);

            resp.setMinPrice(minPrice.setScale(2, RoundingMode.HALF_UP));
            resp.setMaxPrice(maxPrice.setScale(2, RoundingMode.HALF_UP));
            resp.setAvgPrice(avgPrice.setScale(2, RoundingMode.HALF_UP));
            resp.setLastPrice(allRecords.get(0).getPrice().setScale(2, RoundingMode.HALF_UP));

            // 4. 加权建议价：最近 3 条记录权重 × 2，其余权重 × 1
            BigDecimal suggestedPrice = calcWeightedSuggestion(allRecords);
            resp.setSuggestedPrice(suggestedPrice.setScale(2, RoundingMode.HALF_UP));

            // 5. 最近 5 条明细
            List<RecentRecord> recentList = allRecords.stream()
                    .limit(5)
                    .map(sp -> {
                        RecentRecord rr = new RecentRecord();
                        rr.setStyleNo(styleIdToNo.getOrDefault(sp.getStyleId(), "-"));
                        rr.setPrice(sp.getPrice().setScale(2, RoundingMode.HALF_UP));
                        rr.setMachineType(sp.getMachineType());
                        rr.setStandardTime(sp.getStandardTime());
                        return rr;
                    })
                    .collect(Collectors.toList());
            resp.setRecentRecords(recentList);

            // 6. 生成建议文案
            resp.setReasoning(buildReasoning(resp, standardTime, allRecords.get(0)));

        } catch (Exception e) {
            log.error("[工序单价提示] processName={} 异常: {}", processName, e.getMessage(), e);
            resp.setReasoning("数据加载异常，请稍后重试");
        }

        return resp;
    }

    // ─── 私有方法 ──────────────────────────────────────────────────────────────

    private Map<Long, String> fetchStyleIdToNoMap(Long tenantId) {
        QueryWrapper<StyleInfo> sqw = new QueryWrapper<>();
        sqw.eq("tenant_id", tenantId)
           .select("id", "style_no");
        List<StyleInfo> styles = styleInfoService.list(sqw);
        return styles.stream()
                .filter(s -> s.getId() != null)
                .collect(Collectors.toMap(
                        StyleInfo::getId,
                        s -> s.getStyleNo() != null ? s.getStyleNo() : "-",
                        (a, b) -> a));
    }

    /**
     * 加权建议价：最近 3 条权重 2，其余权重 1
     * 公式：(sum(recent3 × 2) + sum(rest × 1)) / (3×2 + rest×1)
     */
    private BigDecimal calcWeightedSuggestion(List<StyleProcess> records) {
        BigDecimal weightedSum = BigDecimal.ZERO;
        int totalWeight = 0;
        for (int i = 0; i < records.size(); i++) {
            BigDecimal p = records.get(i).getPrice();
            if (p == null) continue;
            int w = (i < 3) ? 2 : 1;
            weightedSum = weightedSum.add(p.multiply(BigDecimal.valueOf(w)));
            totalWeight += w;
        }
        if (totalWeight == 0) return BigDecimal.ZERO;
        return weightedSum.divide(BigDecimal.valueOf(totalWeight), 4, RoundingMode.HALF_UP);
    }

    private String buildReasoning(ProcessPriceHintResponse resp,
                                  Integer currentStandardTime,
                                  StyleProcess latestRecord) {
        StringBuilder sb = new StringBuilder();
        int count = resp.getUsageCount();
        sb.append(String.format("\u5171 %d \u4e2a\u6b3e\u5f0f\u4f7f\u7528\u8fc7\"%s\"\u5de5\u5e8f\u3002", count, resp.getProcessName()));
        sb.append(String.format("上次单价 ¥%.2f，", resp.getLastPrice().doubleValue()));
        sb.append(String.format("历史均价 ¥%.2f（¥%.2f ~ ¥%.2f）。",
                resp.getAvgPrice().doubleValue(),
                resp.getMinPrice().doubleValue(),
                resp.getMaxPrice().doubleValue()));

        // 工时差异提示
        if (currentStandardTime != null && latestRecord.getStandardTime() != null
                && latestRecord.getStandardTime() > 0) {
            int prevTime = latestRecord.getStandardTime();
            int diff = currentStandardTime - prevTime;
            if (Math.abs(diff) > 5) {
                String direction = diff > 0 ? "增加" : "减少";
                sb.append(String.format("当前工时比上次%s %d 秒，建议相应%s单价。",
                        direction, Math.abs(diff), direction));
            }
        }

        sb.append(String.format("建议定价 ¥%.2f。", resp.getSuggestedPrice().doubleValue()));
        return sb.toString();
    }
}
