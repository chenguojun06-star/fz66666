package com.fashion.supplychain.intelligence.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.intelligence.dto.ProcessKnowledgeResponse;
import com.fashion.supplychain.intelligence.dto.ProcessKnowledgeResponse.ProcessKnowledgeItem;
import com.fashion.supplychain.intelligence.dto.ProcessKnowledgeResponse.StylePriceRecord;
import com.fashion.supplychain.style.entity.StyleInfo;
import com.fashion.supplychain.style.entity.StyleProcess;
import com.fashion.supplychain.style.service.StyleInfoService;
import com.fashion.supplychain.style.service.StyleProcessService;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.format.DateTimeFormatter;
import java.util.*;
import java.util.stream.Collectors;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

/**
 * 工序知识库编排器
 *
 * <p>从租户所有款式的工序历史数据（t_style_process）进行跨款聚合，
 * 形成按工序名分组的知识库视图，供前端展示与 AI 定价参考使用。
 *
 * <p>数据不落库，实时聚合查询，无副作用。
 */
@Service
@Slf4j
public class ProcessKnowledgeOrchestrator {

    private static final DateTimeFormatter DISPLAY_FMT =
            DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm");

    @Autowired
    private StyleProcessService styleProcessService;

    @Autowired
    private StyleInfoService styleInfoService;

    /**
     * 获取工序知识库全量汇总
     *
     * @param keyword 可选：工序名关键字过滤（模糊匹配）
     * @return 聚合响应
     */
    public ProcessKnowledgeResponse list(String keyword) {
        ProcessKnowledgeResponse resp = new ProcessKnowledgeResponse();

        try {
            Long tenantId = UserContext.tenantId();

            // 1. 获取当前租户所有款式 ID → styleNo 映射
            Map<Long, String> styleIdToNo = fetchStyleIdToNoMap(tenantId);
            if (styleIdToNo.isEmpty()) {
                resp.setItems(Collections.emptyList());
                resp.setTotalProcessTypes(0);
                resp.setTotalStyles(0);
                resp.setTotalRecords(0);
                return resp;
            }

            // 2. 查询所有工序记录（含未定价，process_name 非空即可）
            QueryWrapper<StyleProcess> qw = new QueryWrapper<>();
            qw.in("style_id", styleIdToNo.keySet())
              .isNotNull("process_name")
              .ne("process_name", "")
              .orderByDesc("id");

            if (StringUtils.hasText(keyword)) {
                qw.like("process_name", keyword.trim());
            }

            List<StyleProcess> allRecords = styleProcessService.list(qw);
            if (allRecords.isEmpty()) {
                resp.setItems(Collections.emptyList());
                resp.setTotalProcessTypes(0);
                resp.setTotalStyles(styleIdToNo.size());
                resp.setTotalRecords(0);
                return resp;
            }

            // 3. 按工序名分组
            Map<String, List<StyleProcess>> grouped = allRecords.stream()
                    .collect(Collectors.groupingBy(
                            sp -> sp.getProcessName().trim(),
                            LinkedHashMap::new,
                            Collectors.toList()));

            // 4. 聚合每个工序
            List<ProcessKnowledgeItem> items = new ArrayList<>();
            Set<Long> involvedStyleIds = new HashSet<>();

            for (Map.Entry<String, List<StyleProcess>> entry : grouped.entrySet()) {
                String processName = entry.getKey();
                List<StyleProcess> records = entry.getValue();

                ProcessKnowledgeItem item = buildItem(processName, records, styleIdToNo);
                items.add(item);

                records.forEach(r -> involvedStyleIds.add(r.getStyleId()));
            }

            // 5. 按使用频次（usageCount）降序排列
            items.sort(Comparator.comparingInt(ProcessKnowledgeItem::getUsageCount).reversed());

            resp.setItems(items);
            resp.setTotalProcessTypes(items.size());
            resp.setTotalStyles(involvedStyleIds.size());
            resp.setTotalRecords(allRecords.size());

        } catch (Exception e) {
            log.error("[工序知识库] 查询异常: {}", e.getMessage(), e);
            resp.setItems(Collections.emptyList());
        }

        return resp;
    }

    // ─── 私有方法 ─────────────────────────────────────────────────────────────

    private ProcessKnowledgeItem buildItem(String processName,
                                           List<StyleProcess> records,
                                           Map<Long, String> styleIdToNo) {
        ProcessKnowledgeItem item = new ProcessKnowledgeItem();
        item.setProcessName(processName);

        // progressStage：取出现次数最多的那个
        item.setProgressStage(mostFrequent(records.stream()
                .map(StyleProcess::getProgressStage)
                .filter(Objects::nonNull)
                .collect(Collectors.toList())));

        // machineType：同上
        item.setMachineType(mostFrequent(records.stream()
                .map(StyleProcess::getMachineType)
                .filter(Objects::nonNull)
                .collect(Collectors.toList())));

        // 用款数（去重 styleId）
        long usageCount = records.stream().map(StyleProcess::getStyleId).distinct().count();
        item.setUsageCount((int) usageCount);

        // 价格统计（仅统计 price > 0 的记录，0/null 视为未定价不参与计算）
        List<BigDecimal> prices = records.stream()
                .map(StyleProcess::getPrice)
                .filter(p -> p != null && p.compareTo(BigDecimal.ZERO) > 0)
                .collect(Collectors.toList());

        if (!prices.isEmpty()) {
            item.setMinPrice(prices.stream().min(BigDecimal::compareTo)
                    .orElse(BigDecimal.ZERO).setScale(2, RoundingMode.HALF_UP));
            item.setMaxPrice(prices.stream().max(BigDecimal::compareTo)
                    .orElse(BigDecimal.ZERO).setScale(2, RoundingMode.HALF_UP));
            BigDecimal sum = prices.stream().reduce(BigDecimal.ZERO, BigDecimal::add);
            item.setAvgPrice(sum.divide(BigDecimal.valueOf(prices.size()), 4, RoundingMode.HALF_UP)
                    .setScale(2, RoundingMode.HALF_UP));

            // AI 加权建议价：最近 3 条权重 ×2
            item.setSuggestedPrice(calcWeightedSuggestion(records)
                    .setScale(2, RoundingMode.HALF_UP));

            // 价格趋势：取有价格的最新与最旧记录比较
            List<StyleProcess> pricedRecords = records.stream()
                    .filter(r -> r.getPrice() != null && r.getPrice().compareTo(BigDecimal.ZERO) > 0)
                    .collect(Collectors.toList());
            if (pricedRecords.size() >= 2) {
                BigDecimal first = pricedRecords.get(pricedRecords.size() - 1).getPrice();
                BigDecimal last  = pricedRecords.get(0).getPrice();
                if (last.compareTo(first) > 0) {
                    item.setPriceTrend("UP");
                } else if (last.compareTo(first) < 0) {
                    item.setPriceTrend("DOWN");
                } else {
                    item.setPriceTrend("STABLE");
                }
            }
        }

        // 平均工时
        OptionalDouble avgTime = records.stream()
                .map(StyleProcess::getStandardTime)
                .filter(Objects::nonNull)
                .mapToInt(Integer::intValue)
                .average();
        if (avgTime.isPresent()) {
            item.setAvgStandardTime((int) Math.round(avgTime.getAsDouble()));
        }

        // 最近使用时间
        records.stream()
                .filter(r -> r.getCreateTime() != null)
                .max(Comparator.comparing(StyleProcess::getCreateTime))
                .ifPresent(r -> item.setLastUsedTime(r.getCreateTime().format(DISPLAY_FMT)));

        // 最近 5 个款的明细
        List<StylePriceRecord> recentStyles = records.stream()
                .limit(5)
                .map(sp -> {
                    StylePriceRecord sr = new StylePriceRecord();
                    sr.setStyleNo(styleIdToNo.getOrDefault(sp.getStyleId(), "-"));
                    sr.setPrice(sp.getPrice() != null
                            ? sp.getPrice().setScale(2, RoundingMode.HALF_UP)
                            : null);
                    sr.setMachineType(sp.getMachineType());
                    sr.setStandardTime(sp.getStandardTime());
                    if (sp.getCreateTime() != null) {
                        sr.setCreateTime(sp.getCreateTime().format(DISPLAY_FMT));
                    }
                    return sr;
                })
                .collect(Collectors.toList());
        item.setRecentStyles(recentStyles);

        return item;
    }

    /** 加权建议价：最近 3 条（price > 0）权重 ×2，其余 ×1 */
    private BigDecimal calcWeightedSuggestion(List<StyleProcess> records) {
        BigDecimal weightedSum = BigDecimal.ZERO;
        int totalWeight = 0;
        int pricedIdx = 0;
        for (StyleProcess sp : records) {
            BigDecimal p = sp.getPrice();
            if (p == null || p.compareTo(BigDecimal.ZERO) <= 0) continue;
            int w = (pricedIdx < 3) ? 2 : 1;
            weightedSum = weightedSum.add(p.multiply(BigDecimal.valueOf(w)));
            totalWeight += w;
            pricedIdx++;
        }
        if (totalWeight == 0) return BigDecimal.ZERO;
        return weightedSum.divide(BigDecimal.valueOf(totalWeight), 4, RoundingMode.HALF_UP);
    }

    /** 返回列表中出现次数最多的元素，列表为空或全 null 返回 null */
    private String mostFrequent(List<String> list) {
        if (list == null || list.isEmpty()) return null;
        return list.stream()
                .filter(s -> s != null && !s.isBlank())
                .collect(Collectors.groupingBy(s -> s, Collectors.counting()))
                .entrySet().stream()
                .max(Map.Entry.comparingByValue())
                .map(Map.Entry::getKey)
                .orElse(null);
    }

    private Map<Long, String> fetchStyleIdToNoMap(Long tenantId) {
        QueryWrapper<StyleInfo> sqw = new QueryWrapper<>();
        sqw.eq(tenantId != null, "tenant_id", tenantId)
           .select("id", "style_no");
        List<StyleInfo> styles = styleInfoService.list(sqw);
        return styles.stream()
                .filter(s -> s.getId() != null)
                .collect(Collectors.toMap(
                        StyleInfo::getId,
                        s -> s.getStyleNo() != null ? s.getStyleNo() : "-",
                        (a, b) -> a));
    }
}
