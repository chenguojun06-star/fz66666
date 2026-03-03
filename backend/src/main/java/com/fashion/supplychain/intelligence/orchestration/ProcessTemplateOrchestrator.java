package com.fashion.supplychain.intelligence.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.intelligence.dto.ProcessTemplateResponse;
import com.fashion.supplychain.intelligence.dto.ProcessTemplateResponse.ProcessTemplateItem;
import com.fashion.supplychain.style.entity.StyleInfo;
import com.fashion.supplychain.style.entity.StyleProcess;
import com.fashion.supplychain.style.service.StyleInfoService;
import com.fashion.supplychain.style.service.StyleProcessService;
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

/**
 * 工序模板AI补全编排器
 * <p>
 * 根据款式品类，统计该租户历史工序清单，
 * 返回按频率排序的工序建议列表（含均价和均工时）。
 */
@Service
@Slf4j
public class ProcessTemplateOrchestrator {

    /** 单次最多返回工序数 */
    private static final int MAX_ITEMS = 20;

    @Autowired
    private StyleInfoService styleInfoService;

    @Autowired
    private StyleProcessService styleProcessService;

    public ProcessTemplateResponse suggest(String category) {
        ProcessTemplateResponse resp = new ProcessTemplateResponse();
        resp.setCategory(category);

        Long tenantId = UserContext.tenantId();

        // ── 1. 找匹配品类的 styleId 集合 ────────────────────────────────────
        Set<String> targetStyleIds = null;
        int sampleStyleCount = 0;

        if (StringUtils.hasText(category)) {
            QueryWrapper<StyleInfo> siQw = new QueryWrapper<StyleInfo>()
                    .eq("tenant_id", tenantId)
                    .eq("category", category)
                    .select("id");
            List<StyleInfo> matchedStyles = styleInfoService.list(siQw);
            sampleStyleCount = matchedStyles.size();

            if (!matchedStyles.isEmpty()) {
                targetStyleIds = matchedStyles.stream()
                        .map(s -> String.valueOf(s.getId()))
                        .collect(Collectors.toSet());
            }
        }

        // ── 2. 查工序记录 ────────────────────────────────────────────────────
        QueryWrapper<StyleProcess> qw = new QueryWrapper<StyleProcess>()
                .eq("tenant_id", tenantId)
                .isNotNull("process_name")
                .ne("process_name", "");
        if (targetStyleIds != null && !targetStyleIds.isEmpty()) {
            qw.in("style_id", targetStyleIds);
        } else {
            // 无品类过滤：取所有历史工序，但限制样本量
            qw.last("LIMIT 2000");
        }
        List<StyleProcess> allProcesses;
        try {
            allProcesses = styleProcessService.list(qw);
        } catch (Exception e) {
            log.warn("[工序模板] 查询失败: {}", e.getMessage());
            resp.setProcesses(new ArrayList<>());
            return resp;
        }

        if (sampleStyleCount == 0) {
            // 统计不同 styleId 数量
            sampleStyleCount = (int) allProcesses.stream()
                    .map(StyleProcess::getStyleId).filter(id -> id != null)
                    .distinct().count();
        }
        resp.setSampleStyleCount(sampleStyleCount);

        // ── 3. 按工序名聚合：频率 + 均价 + 均工时 ──────────────────────────
        // key: processName → 聚合数据
        Map<String, ProcessAgg> aggMap = new LinkedHashMap<>();
        for (StyleProcess p : allProcesses) {
            String name = StringUtils.hasText(p.getProcessName()) ? p.getProcessName().trim() : null;
            if (name == null) continue;

            ProcessAgg agg = aggMap.computeIfAbsent(name, k -> new ProcessAgg(
                    name,
                    StringUtils.hasText(p.getProgressStage()) ? p.getProgressStage().trim() : null
            ));
            agg.count++;
            if (p.getPrice() != null && p.getPrice().doubleValue() > 0) {
                agg.priceSum += p.getPrice().doubleValue();
                agg.priceCount++;
            }
            if (p.getStandardTime() != null && p.getStandardTime() > 0) {
                agg.timeSum += p.getStandardTime();
                agg.timeCount++;
            }
            // 如果 progressStage 有值，优先更新（防止首条为空）
            if (!StringUtils.hasText(agg.progressStage) && StringUtils.hasText(p.getProgressStage())) {
                agg.progressStage = p.getProgressStage().trim();
            }
        }

        // ── 4. 转换并排序 ────────────────────────────────────────────────────
        List<ProcessTemplateItem> items = aggMap.values().stream()
                .sorted(Comparator.comparingInt((ProcessAgg a) -> -a.count))
                .limit(MAX_ITEMS)
                .map(a -> {
                    double avgPrice = a.priceCount > 0 ? a.priceSum / a.priceCount : 0;
                    double avgTime  = a.timeCount  > 0 ? a.timeSum  / a.timeCount  : 0;
                    return new ProcessTemplateItem(
                            a.name,
                            a.progressStage,
                            a.count,
                            Math.round(avgPrice * 100.0) / 100.0,
                            Math.round(avgTime),
                            Math.round(avgPrice * 100.0) / 100.0
                    );
                })
                .collect(Collectors.toList());

        resp.setProcesses(items);
        return resp;
    }

    /** 聚合临时结构 */
    private static class ProcessAgg {
        String name;
        String progressStage;
        int count;
        double priceSum;
        int priceCount;
        double timeSum;
        int timeCount;

        ProcessAgg(String name, String progressStage) {
            this.name = name;
            this.progressStage = progressStage;
        }
    }
}
