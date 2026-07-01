package com.fashion.supplychain.intelligence.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.common.tenant.TenantAssert;
import com.fashion.supplychain.intelligence.dto.ProcessTemplateResponse;
import com.fashion.supplychain.intelligence.dto.ProcessTemplateResponse.ProcessTemplateItem;
import com.fashion.supplychain.production.entity.ScanRecord;
import com.fashion.supplychain.production.service.ProcessParentMappingService;
import com.fashion.supplychain.production.service.ScanRecordService;
import com.fashion.supplychain.style.entity.StyleInfo;
import com.fashion.supplychain.style.service.StyleInfoService;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;
import org.springframework.context.annotation.Lazy;

/**
 * 工序模板补全编排器
 *
 * 从扫码历史中聚合工序，为工厂提供智能工序补全建议。
 * 按 品类 + 难度级别 匹配，样本不足时自动降级到全品类。
 */
@Service
@Lazy
@Slf4j
public class ProcessTemplateOrchestrator {

    /** 单次最多返回工序数 */
    private static final int MAX_ITEMS = 20;

    /** 同难度样本最少需要多少个，不足则降级 */
    private static final int MIN_SAME_DIFFICULTY_STYLES = 3;

    @Autowired
    private StyleInfoService styleInfoService;

    @Autowired
    private ScanRecordService scanRecordService;

    @Autowired
    @org.springframework.context.annotation.Lazy
    private ProcessParentMappingService processParentMappingService;

    public ProcessTemplateResponse suggest(String category, Long styleId) {
        ProcessTemplateResponse resp = new ProcessTemplateResponse();
        resp.setCategory(category);
        resp.setDataSource("historical");
        return buildFromScanHistory(category, styleId, resp);
    }

    private ProcessTemplateResponse buildFromScanHistory(String category, Long styleId,
            ProcessTemplateResponse resp) {
        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();

        // ── 1. 获取当前款式的难度级别 ──────────────────────────────────────
        String currentDifficulty = null;
        String currentDifficultyLabel = null;
        if (styleId != null) {
            try {
                StyleInfo currentStyle = styleInfoService.getById(styleId);
                if (currentStyle != null) {
                    currentDifficulty = currentStyle.getDifficultyLevel();
                    currentDifficultyLabel = currentStyle.getDifficultyLabel();
                    // 如果当前款式没设置难度，用品类匹配
                    if (!StringUtils.hasText(currentDifficulty)) {
                        currentDifficulty = null;
                    }
                }
            } catch (Exception e) {
                log.warn("[工序模板] 获取款式难度失败: {}", e.getMessage());
            }
        }

        // ── 2. 找匹配品类的 styleNo 集合（按难度过滤） ────────────────────────
        QueryWrapper<StyleInfo> siQw = new QueryWrapper<StyleInfo>()
                .eq("tenant_id", tenantId)
                .select("style_no", "difficulty_level", "difficulty_label");
        if (StringUtils.hasText(category)) {
            siQw.eq("category", category);
        }
        List<StyleInfo> matchedStyles = styleInfoService.list(siQw);
        int totalStyleCount = matchedStyles.size();

        Set<String> targetStyleNos;
        String usedDifficulty = null;
        String usedDifficultyLabel = null;
        boolean isDifficultyFiltered = false;

        if (StringUtils.hasText(currentDifficulty) && StringUtils.hasText(category)) {
            final String diffLevel = currentDifficulty;
            // 先按 品类 + 同难度 过滤
            List<StyleInfo> sameDiffStyles = matchedStyles.stream()
                    .filter(s -> diffLevel.equals(s.getDifficultyLevel()))
                    .collect(Collectors.toList());

            if (sameDiffStyles.size() >= MIN_SAME_DIFFICULTY_STYLES) {
                targetStyleNos = sameDiffStyles.stream()
                        .map(s -> String.valueOf(s.getStyleNo()))
                        .filter(sn -> StringUtils.hasText(sn))
                        .collect(Collectors.toSet());
                usedDifficulty = currentDifficulty;
                usedDifficultyLabel = currentDifficultyLabel;
                isDifficultyFiltered = true;
                resp.setSampleStyleCount(sameDiffStyles.size());
            } else {
                // 同难度样本不足，降级到全品类
                targetStyleNos = matchedStyles.stream()
                        .map(s -> String.valueOf(s.getStyleNo()))
                        .filter(sn -> StringUtils.hasText(sn))
                        .collect(Collectors.toSet());
                resp.setSampleStyleCount(totalStyleCount);
            }
        } else if (matchedStyles != null && !matchedStyles.isEmpty()) {
            // 没有当前款式难度，或者没有品类，用全部匹配的
            targetStyleNos = matchedStyles.stream()
                    .map(s -> String.valueOf(s.getStyleNo()))
                    .filter(sn -> StringUtils.hasText(sn))
                    .collect(Collectors.toSet());
            resp.setSampleStyleCount(totalStyleCount);
        } else {
            targetStyleNos = null;
            resp.setSampleStyleCount(0);
        }

        // 记录匹配方式
        if (isDifficultyFiltered) {
            resp.setMatchType("category_difficulty");
            resp.setDifficultyLabel(usedDifficultyLabel);
        } else if (StringUtils.hasText(category)) {
            resp.setMatchType("category_only");
        } else {
            resp.setMatchType("all");
        }

        // ── 3. 查询扫码历史 ────────────────────────────────────────────────────
        QueryWrapper<ScanRecord> qw = new QueryWrapper<ScanRecord>()
                .eq("tenant_id", tenantId)
                .eq("scan_result", "success")
                .in("scan_type", "production", "pattern")
                .isNotNull("process_name")
                .ne("process_name", "");
        if (targetStyleNos != null && !targetStyleNos.isEmpty()) {
            qw.in("style_no", targetStyleNos);
        } else {
            qw.last("LIMIT 5000");
        }
        List<ScanRecord> allScans;
        try {
            allScans = scanRecordService.list(qw);
        } catch (Exception e) {
            log.warn("[工序模板] 查询扫码历史失败: {}", e.getMessage());
            resp.setProcesses(List.of());
            return resp;
        }

        if (!StringUtils.hasText(category) && targetStyleNos == null) {
            int styleCount = (int) allScans.stream()
                    .map(ScanRecord::getStyleNo).filter(sn -> StringUtils.hasText(sn))
                    .distinct().count();
            resp.setSampleStyleCount(styleCount);
        }

        // ── 4. 按工序名聚合：频率 + 均价 ──────────────────────────────
        Map<String, ProcessAgg> aggMap = new LinkedHashMap<>();
        for (ScanRecord s : allScans) {
            String name = StringUtils.hasText(s.getProcessName()) ? s.getProcessName().trim() : null;
            if (name == null) continue;

            ProcessAgg agg = aggMap.computeIfAbsent(name, k -> new ProcessAgg(
                    name,
                    StringUtils.hasText(s.getProgressStage()) ? s.getProgressStage().trim() : null
            ));
            agg.count++;
            if (s.getProcessUnitPrice() != null
                    && s.getProcessUnitPrice().compareTo(java.math.BigDecimal.ZERO) > 0) {
                agg.priceSum += s.getProcessUnitPrice().doubleValue();
                agg.priceCount++;
            } else if (s.getUnitPrice() != null
                    && s.getUnitPrice().compareTo(java.math.BigDecimal.ZERO) > 0) {
                agg.priceSum += s.getUnitPrice().doubleValue();
                agg.priceCount++;
            }
            if (!StringUtils.hasText(agg.progressStage) && StringUtils.hasText(s.getProgressStage())) {
                agg.progressStage = s.getProgressStage().trim();
            }
        }

        // ── 5. 转换并按频率排序截取 ──────────────────────────────────────────
        List<ProcessTemplateItem> items = aggMap.values().stream()
                .sorted(Comparator.comparingInt((ProcessAgg a) -> -a.count))
                .limit(MAX_ITEMS)
                .map(a -> {
                    double avgPrice = a.priceCount > 0 ? a.priceSum / a.priceCount : 0;
                    ProcessTemplateItem item = new ProcessTemplateItem();
                    item.setProcessName(a.name);
                    item.setProgressStage(
                            StringUtils.hasText(a.progressStage) ? a.progressStage : "车缝");
                    item.setFrequency(a.count);
                    double finalPrice = Math.round(avgPrice * 100.0) / 100.0;
                    item.setAvgPrice(finalPrice);
                    item.setSuggestedPrice(finalPrice);
                    return item;
                })
                .collect(Collectors.toList());

        resp.setProcesses(items);

        // ── 6. 按父节点分组 ──────────────────────────────────────────────────
        try {
            List<ProcessTemplateResponse.ProcessTemplateGroup> groups = groupByParent(items);
            resp.setGroupedProcesses(groups);
        } catch (Exception e) {
            log.warn("[工序模板] 按父节点分组失败: {}", e.getMessage());
        }

        return resp;
    }

    /**
     * 按父节点分组，保持父节点顺序：裁剪 → 车缝 → 尾部 → 入库 → 其他
     */
    private List<ProcessTemplateResponse.ProcessTemplateGroup> groupByParent(List<ProcessTemplateItem> items) {
        Map<String, List<ProcessTemplateItem>> groupMap = new LinkedHashMap<>();
        List<String> parentOrder = List.of("裁剪", "车缝", "尾部", "入库");

        for (ProcessTemplateItem item : items) {
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

        // 按预设顺序排序
        List<ProcessTemplateResponse.ProcessTemplateGroup> groups = new ArrayList<>();
        for (String parent : parentOrder) {
            if (groupMap.containsKey(parent)) {
                groups.add(new ProcessTemplateResponse.ProcessTemplateGroup(parent, groupMap.remove(parent)));
            }
        }
        // 剩余的追加到末尾
        for (Map.Entry<String, List<ProcessTemplateItem>> entry : groupMap.entrySet()) {
            groups.add(new ProcessTemplateResponse.ProcessTemplateGroup(entry.getKey(), entry.getValue()));
        }
        return groups;
    }

    /** 聚合辅助类 */
    private static class ProcessAgg {
        String name;
        String progressStage;
        int count;
        double priceSum;
        int priceCount;

        ProcessAgg(String name, String progressStage) {
            this.name = name;
            this.progressStage = progressStage;
        }
    }
}
