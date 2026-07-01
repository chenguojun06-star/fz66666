package com.fashion.supplychain.intelligence.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.common.tenant.TenantAssert;
import com.fashion.supplychain.intelligence.dto.ProcessKnowledgeResponse;
import com.fashion.supplychain.intelligence.dto.ProcessKnowledgeResponse.ProcessKnowledgeItem;
import com.fashion.supplychain.intelligence.dto.ProcessKnowledgeResponse.StylePriceRecord;
import com.fashion.supplychain.production.entity.ScanRecord;
import com.fashion.supplychain.production.service.ProcessParentMappingService;
import com.fashion.supplychain.production.service.ScanRecordService;
import com.fashion.supplychain.style.entity.StyleInfo;
import com.fashion.supplychain.style.service.StyleInfoService;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.format.DateTimeFormatter;
import java.util.*;
import java.util.stream.Collectors;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;
import org.springframework.context.annotation.Lazy;

/**
 * 工序知识库编排器
 *
 * <p>从租户扫码历史（t_scan_record）聚合工序数据，
 * 按工序名分组统计，形成真实的工序知识库视图。
 *
 * <p>数据不落库，实时聚合查询，全部真实数据，无虚构。
 */
@Service
@Lazy
@Slf4j
public class ProcessKnowledgeOrchestrator {

    private static final DateTimeFormatter DISPLAY_FMT =
            DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm");

    @Autowired
    private ScanRecordService scanRecordService;

    @Autowired
    private StyleInfoService styleInfoService;

    @Autowired
    @Lazy
    private ProcessParentMappingService processParentMappingService;

    /**
     * 获取工序知识库全量汇总
     *
     * @param keyword 可选：工序名关键字过滤（模糊匹配）
     * @param category 可选：品类过滤
     * @param difficultyLevel 可选：难度级别过滤
     * @return 聚合响应
     */
    public ProcessKnowledgeResponse list(String keyword, String category, String difficultyLevel) {
        ProcessKnowledgeResponse resp = new ProcessKnowledgeResponse();

        try {
            TenantAssert.assertTenantContext();
            Long tenantId = UserContext.tenantId();

            // 1. 先找出匹配品类+难度的款号集合
            Set<String> targetStyleNos = null;
            if (StringUtils.hasText(category) || StringUtils.hasText(difficultyLevel)) {
                QueryWrapper<StyleInfo> styleQw = new QueryWrapper<StyleInfo>()
                        .eq("tenant_id", tenantId)
                        .select("style_no");
                if (StringUtils.hasText(category)) {
                    styleQw.eq("category", category);
                }
                if (StringUtils.hasText(difficultyLevel)) {
                    styleQw.eq("difficulty_level", difficultyLevel);
                }
                List<StyleInfo> matchedStyles = styleInfoService.list(styleQw);
                targetStyleNos = matchedStyles.stream()
                        .map(StyleInfo::getStyleNo)
                        .filter(sn -> StringUtils.hasText(sn))
                        .collect(Collectors.toSet());

                // 没有匹配的款号，直接返回空
                if (targetStyleNos.isEmpty()) {
                    resp.setItems(Collections.emptyList());
                    resp.setTotalProcessTypes(0);
                    resp.setTotalStyles(0);
                    resp.setTotalRecords(0);
                    return resp;
                }
            }

            // 2. 查询所有成功的扫码记录（生产扫码 + 样衣扫码）
            QueryWrapper<ScanRecord> qw = new QueryWrapper<ScanRecord>()
                    .eq("tenant_id", tenantId)
                    .eq("scan_result", "success")
                    .in("scan_type", "production", "pattern")
                    .isNotNull("process_name")
                    .ne("process_name", "")
                    .orderByDesc("id");

            if (targetStyleNos != null && !targetStyleNos.isEmpty()) {
                qw.in("style_no", targetStyleNos);
            }
            if (StringUtils.hasText(keyword)) {
                qw.like("process_name", keyword.trim());
            }

            List<ScanRecord> allRecords = scanRecordService.list(qw);
            int totalRecordsCount = allRecords.size();

            if (allRecords.isEmpty()) {
                resp.setItems(Collections.emptyList());
                resp.setTotalProcessTypes(0);
                resp.setTotalStyles(0);
                resp.setTotalRecords(0);
                return resp;
            }

            // 3. 按工序名分组
            Map<String, List<ScanRecord>> grouped = allRecords.stream()
                    .filter(sr -> StringUtils.hasText(sr.getProcessName()))
                    .collect(Collectors.groupingBy(
                            sr -> sr.getProcessName().trim(),
                            LinkedHashMap::new,
                            Collectors.toList()));

            // 4. 统计涉及的款号数（去重）
            Set<String> involvedStyleNos = allRecords.stream()
                    .map(ScanRecord::getStyleNo)
                    .filter(sn -> StringUtils.hasText(sn))
                    .collect(Collectors.toSet());

            // 5. 聚合每个工序
            List<ProcessKnowledgeItem> items = new ArrayList<>();
            for (Map.Entry<String, List<ScanRecord>> entry : grouped.entrySet()) {
                String processName = entry.getKey();
                List<ScanRecord> records = entry.getValue();

                ProcessKnowledgeItem item = buildItem(processName, records);
                items.add(item);
            }

            // 6. 按使用频次（usageCount）降序排列
            items.sort(Comparator.comparingInt(ProcessKnowledgeItem::getUsageCount).reversed());

            resp.setItems(items);
            resp.setTotalProcessTypes(items.size());
            resp.setTotalStyles(involvedStyleNos.size());
            resp.setTotalRecords(totalRecordsCount);

            // 6.1 按父节点分组
            try {
                List<ProcessKnowledgeResponse.ProcessKnowledgeGroup> groups = groupItemsByParent(items);
                resp.setGroupedItems(groups);
            } catch (Exception e) {
                log.warn("[工序知识库] 按父节点分组失败: {}", e.getMessage());
            }

            // 7. 加载可用的品类和难度选项（从款式表取，用于筛选）
            loadFilterOptions(tenantId, resp);

        } catch (Exception e) {
            log.error("[工序知识库] 查询异常: {}", e.getMessage(), e);
            resp.setItems(Collections.emptyList());
        }

        return resp;
    }

    /**
     * 加载筛选选项：品类列表 + 难度级别列表
     */
    private void loadFilterOptions(Long tenantId, ProcessKnowledgeResponse resp) {
        try {
            // 品类选项：从有扫码记录的款号对应品类取
            QueryWrapper<StyleInfo> qw = new QueryWrapper<StyleInfo>()
                    .eq("tenant_id", tenantId)
                    .isNotNull("category")
                    .ne("category", "")
                    .select("category")
                    .groupBy("category");
            List<StyleInfo> styles = styleInfoService.list(qw);
            List<String> categories = styles.stream()
                    .map(StyleInfo::getCategory)
                    .filter(c -> StringUtils.hasText(c))
                    .sorted()
                    .collect(Collectors.toList());
            resp.setCategoryOptions(categories);

            // 难度级别选项：固定4级
            List<ProcessKnowledgeResponse.DifficultyOption> difficulties = Arrays.asList(
                    new ProcessKnowledgeResponse.DifficultyOption("SIMPLE", "简单款"),
                    new ProcessKnowledgeResponse.DifficultyOption("MEDIUM", "中等难度"),
                    new ProcessKnowledgeResponse.DifficultyOption("COMPLEX", "工艺复杂"),
                    new ProcessKnowledgeResponse.DifficultyOption("HIGH_END", "高定级")
            );
            resp.setDifficultyOptions(difficulties);
        } catch (Exception e) {
            log.warn("[工序知识库] 加载筛选选项失败: {}", e.getMessage());
        }
    }

    /**
     * 按父节点分组，保持父节点顺序：裁剪 → 车缝 → 尾部 → 入库 → 采购 → 其他
     */
    private List<ProcessKnowledgeResponse.ProcessKnowledgeGroup> groupItemsByParent(
            List<ProcessKnowledgeResponse.ProcessKnowledgeItem> items) {
        Map<String, List<ProcessKnowledgeResponse.ProcessKnowledgeItem>> groupMap = new LinkedHashMap<>();
        List<String> parentOrder = List.of("裁剪", "车缝", "尾部", "入库", "采购");

        for (ProcessKnowledgeResponse.ProcessKnowledgeItem item : items) {
            String parentNode = null;
            try {
                parentNode = processParentMappingService.resolveParentNode(item.getProcessName());
            } catch (Exception e) {
                // 解析失败用 progressStage 兜底
            }
            if (!StringUtils.hasText(parentNode)) {
                parentNode = StringUtils.hasText(item.getProgressStage()) ? item.getProgressStage() : "其他";
            }
            groupMap.computeIfAbsent(parentNode, k -> new ArrayList<>()).add(item);
        }

        List<ProcessKnowledgeResponse.ProcessKnowledgeGroup> groups = new ArrayList<>();
        for (String parent : parentOrder) {
            if (groupMap.containsKey(parent)) {
                ProcessKnowledgeResponse.ProcessKnowledgeGroup g = new ProcessKnowledgeResponse.ProcessKnowledgeGroup();
                g.setParentNode(parent);
                g.setItems(groupMap.remove(parent));
                groups.add(g);
            }
        }
        for (Map.Entry<String, List<ProcessKnowledgeResponse.ProcessKnowledgeItem>> entry : groupMap.entrySet()) {
            ProcessKnowledgeResponse.ProcessKnowledgeGroup g = new ProcessKnowledgeResponse.ProcessKnowledgeGroup();
            g.setParentNode(entry.getKey());
            g.setItems(entry.getValue());
            groups.add(g);
        }
        return groups;
    }

    // ─── 私有方法 ─────────────────────────────────────────────────────────────

    private ProcessKnowledgeItem buildItem(String processName, List<ScanRecord> records) {
        ProcessKnowledgeItem item = new ProcessKnowledgeItem();
        item.setProcessName(processName);

        // progressStage：取出现次数最多的那个
        item.setProgressStage(mostFrequent(records.stream()
                .map(ScanRecord::getProgressStage)
                .filter(Objects::nonNull)
                .collect(Collectors.toList())));

        // 用款数（去重 styleNo）
        long usageCount = records.stream()
                .map(ScanRecord::getStyleNo)
                .filter(sn -> StringUtils.hasText(sn))
                .distinct()
                .count();
        item.setUsageCount((int) usageCount);

        // 价格统计（仅统计 price > 0 的记录，0/null 不参与计算）
        List<BigDecimal> prices = records.stream()
                .map(sr -> {
                    if (sr.getProcessUnitPrice() != null
                            && sr.getProcessUnitPrice().compareTo(BigDecimal.ZERO) > 0) {
                        return sr.getProcessUnitPrice();
                    }
                    if (sr.getUnitPrice() != null
                            && sr.getUnitPrice().compareTo(BigDecimal.ZERO) > 0) {
                        return sr.getUnitPrice();
                    }
                    return null;
                })
                .filter(Objects::nonNull)
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
            List<ScanRecord> pricedRecords = records.stream()
                    .filter(r -> {
                        if (r.getProcessUnitPrice() != null
                                && r.getProcessUnitPrice().compareTo(BigDecimal.ZERO) > 0) {
                            return true;
                        }
                        if (r.getUnitPrice() != null
                                && r.getUnitPrice().compareTo(BigDecimal.ZERO) > 0) {
                            return true;
                        }
                        return false;
                    })
                    .collect(Collectors.toList());
            if (pricedRecords.size() >= 2) {
                BigDecimal first = getRecordPrice(pricedRecords.get(pricedRecords.size() - 1));
                BigDecimal last = getRecordPrice(pricedRecords.get(0));
                if (last.compareTo(first) > 0) {
                    item.setPriceTrend("UP");
                } else if (last.compareTo(first) < 0) {
                    item.setPriceTrend("DOWN");
                } else {
                    item.setPriceTrend("STABLE");
                }
            }
        }

        // 最近使用时间
        records.stream()
                .filter(r -> r.getCreateTime() != null)
                .max(Comparator.comparing(ScanRecord::getCreateTime))
                .ifPresent(r -> item.setLastUsedTime(r.getCreateTime().format(DISPLAY_FMT)));

        // 最近 5 个款的明细（按款号去重，取最近的）
        Map<String, ScanRecord> latestByStyle = new LinkedHashMap<>();
        for (ScanRecord sr : records) {
            String sn = sr.getStyleNo();
            if (!StringUtils.hasText(sn)) continue;
            if (!latestByStyle.containsKey(sn)) {
                latestByStyle.put(sn, sr);
                if (latestByStyle.size() >= 5) break;
            }
        }

        BigDecimal avgPrice = item.getAvgPrice();
        int abnormalCount = 0;
        List<StylePriceRecord> recentStyles = latestByStyle.values().stream()
                .map(sr -> {
                    StylePriceRecord spr = new StylePriceRecord();
                    spr.setStyleNo(sr.getStyleNo());
                    BigDecimal price = getRecordPrice(sr);
                    spr.setPrice(price != null ? price.setScale(2, RoundingMode.HALF_UP) : null);
                    if (sr.getCreateTime() != null) {
                        spr.setCreateTime(sr.getCreateTime().format(DISPLAY_FMT));
                    }

                    // 异常价格检测：偏离均价 ±30%
                    if (price != null && avgPrice != null && avgPrice.compareTo(BigDecimal.ZERO) > 0) {
                        BigDecimal deviation = price.subtract(avgPrice).abs().divide(avgPrice, 4, RoundingMode.HALF_UP);
                        if (deviation.compareTo(new BigDecimal("0.30")) > 0) {
                            spr.setAbnormal(true);
                            spr.setAbnormalType(price.compareTo(avgPrice) > 0 ? "HIGH" : "LOW");
                        }
                    }
                    return spr;
                })
                .collect(Collectors.toList());

        // 统计所有记录中的异常价格数
        for (ScanRecord sr : records) {
            BigDecimal p = getRecordPrice(sr);
            if (p == null || avgPrice == null || avgPrice.compareTo(BigDecimal.ZERO) <= 0) continue;
            BigDecimal deviation = p.subtract(avgPrice).abs().divide(avgPrice, 4, RoundingMode.HALF_UP);
            if (deviation.compareTo(new BigDecimal("0.30")) > 0) {
                abnormalCount++;
            }
        }
        item.setAbnormalCount(abnormalCount);
        item.setRecentStyles(recentStyles);

        return item;
    }

    private BigDecimal getRecordPrice(ScanRecord sr) {
        if (sr.getProcessUnitPrice() != null
                && sr.getProcessUnitPrice().compareTo(BigDecimal.ZERO) > 0) {
            return sr.getProcessUnitPrice();
        }
        if (sr.getUnitPrice() != null
                && sr.getUnitPrice().compareTo(BigDecimal.ZERO) > 0) {
            return sr.getUnitPrice();
        }
        return null;
    }

    /** 加权建议价：最近 3 条（price > 0）权重 ×2，其余 ×1 */
    private BigDecimal calcWeightedSuggestion(List<ScanRecord> records) {
        BigDecimal weightedSum = BigDecimal.ZERO;
        int totalWeight = 0;
        int pricedIdx = 0;
        for (ScanRecord sr : records) {
            BigDecimal p = getRecordPrice(sr);
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
}
