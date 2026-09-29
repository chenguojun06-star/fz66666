package com.fashion.supplychain.intelligence.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fashion.supplychain.intelligence.entity.AiPatrolAction;
import com.fashion.supplychain.production.entity.PatternProduction;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.service.PatternProductionService;
import com.fashion.supplychain.production.service.ProductionOrderService;
import com.fashion.supplychain.style.entity.StyleInfo;
import com.fashion.supplychain.style.service.StyleInfoService;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

/**
 * 巡检工单目标可读化（D-626）。
 *
 * 背景：t_ai_patrol_action.target_id 对订单存的是订单 UUID（32位hex）、对样衣存的是
 * t_pattern_production 雪花 ID——工单中心/顶部预警面板直接显示
 * 「订单: 3d0bc48c...」「pattern: 2099753194172108802」，用户完全看不懂。
 *
 * 这里批量把 target_id 翻译成可读标签回填到瞬态字段 targetLabel：
 *   order   → 订单号（targetId 本身已是 PO/CUT 单号时原样使用）
 *   pattern → 样衣款号（t_pattern_production.style_no）
 *   style   → 款号（t_style_info.style_no）
 * 其余类型（factory/material/worker…）detectedIssue 文案里已带名称，不富化，前端原样兜底。
 * 查询失败静默降级（targetLabel 为空时前端回落显示原始 ID），绝不影响工单列表本身。
 */
@Slf4j
@Component
public class PatrolTargetLabelEnricher {

    /** 32位无连字符hex = ProductionOrder 的 ASSIGN_UUID 主键形态 */
    private static final String HEX32_PATTERN = "^[0-9a-fA-F]{32}$";

    @Autowired(required = false)
    private ProductionOrderService productionOrderService;
    @Autowired(required = false)
    private PatternProductionService patternProductionService;
    @Autowired(required = false)
    private StyleInfoService styleInfoService;

    public void enrich(List<AiPatrolAction> actions) {
        if (actions == null || actions.isEmpty()) return;
        try {
            enrichOrderTargets(actions);
            enrichPatternTargets(actions);
            enrichStyleTargets(actions);
        } catch (Exception e) {
            log.warn("[PatrolEnrich] 目标标签富化失败（降级为原始ID展示）: {}", e.getMessage());
        }
    }

    /** order 目标：32位hex按 id 查订单号；其余（PO.../CUT...等）视为已是单号原样展示 */
    private void enrichOrderTargets(List<AiPatrolAction> actions) {
        Set<String> ids = new HashSet<>();
        for (AiPatrolAction a : actions) {
            if (!isType(a, "order")) continue;
            String tid = safeId(a);
            if (tid.matches(HEX32_PATTERN)) ids.add(tid);
            else a.setTargetLabel(tid);
        }
        if (ids.isEmpty() || productionOrderService == null) return;
        Map<String, String> idToOrderNo = new HashMap<>();
        for (List<String> batch : partition(ids, 200)) {
            List<ProductionOrder> rows = productionOrderService.list(
                    new LambdaQueryWrapper<ProductionOrder>()
                            .in(ProductionOrder::getId, batch)
                            .select(ProductionOrder::getId, ProductionOrder::getOrderNo));
            for (ProductionOrder o : rows) {
                if (o.getId() != null && o.getOrderNo() != null) idToOrderNo.put(o.getId(), o.getOrderNo());
            }
        }
        for (AiPatrolAction a : actions) {
            if (!isType(a, "order")) continue;
            String tid = safeId(a);
            String label = idToOrderNo.get(tid);
            if (label != null && !label.isBlank()) a.setTargetLabel(label);
        }
    }

    /** pattern 目标：t_pattern_production.id → styleNo */
    private void enrichPatternTargets(List<AiPatrolAction> actions) {
        Set<String> ids = new HashSet<>();
        for (AiPatrolAction a : actions) {
            if (isType(a, "pattern") || isType(a, "patternTask")) ids.add(safeId(a));
        }
        if (ids.isEmpty() || patternProductionService == null) return;
        Map<String, String> idToStyleNo = new HashMap<>();
        for (List<String> batch : partition(ids, 200)) {
            List<PatternProduction> rows = patternProductionService.list(
                    new LambdaQueryWrapper<PatternProduction>()
                            .in(PatternProduction::getId, batch)
                            .select(PatternProduction::getId, PatternProduction::getStyleNo));
            for (PatternProduction p : rows) {
                if (p.getId() != null && p.getStyleNo() != null) idToStyleNo.put(p.getId(), p.getStyleNo());
            }
        }
        for (AiPatrolAction a : actions) {
            if (!isType(a, "pattern") && !isType(a, "patternTask")) continue;
            String label = idToStyleNo.get(safeId(a));
            if (label != null && !label.isBlank()) a.setTargetLabel(label);
        }
    }

    /** style 目标：t_style_info.id → styleNo */
    private void enrichStyleTargets(List<AiPatrolAction> actions) {
        Set<String> ids = new HashSet<>();
        for (AiPatrolAction a : actions) {
            if (isType(a, "style")) ids.add(safeId(a));
        }
        if (ids.isEmpty() || styleInfoService == null) return;
        Map<String, String> idToStyleNo = new HashMap<>();
        for (List<String> batch : partition(ids, 200)) {
            List<StyleInfo> rows = styleInfoService.list(
                    new LambdaQueryWrapper<StyleInfo>()
                            .in(StyleInfo::getId, batch)
                            .select(StyleInfo::getId, StyleInfo::getStyleNo));
            for (StyleInfo s : rows) {
                if (s.getId() != null && s.getStyleNo() != null) idToStyleNo.put(String.valueOf(s.getId()), s.getStyleNo());
            }
        }
        for (AiPatrolAction a : actions) {
            if (!isType(a, "style")) continue;
            String label = idToStyleNo.get(safeId(a));
            if (label != null && !label.isBlank()) a.setTargetLabel(label);
        }
    }

    private boolean isType(AiPatrolAction a, String type) {
        return a != null && type != null && type.equalsIgnoreCase(a.getTargetType());
    }

    private String safeId(AiPatrolAction a) {
        return a.getTargetId() == null ? "" : a.getTargetId().trim();
    }

    private List<List<String>> partition(Set<String> set, int size) {
        List<String> all = new ArrayList<>(set);
        List<List<String>> out = new ArrayList<>();
        for (int i = 0; i < all.size(); i += size) {
            out.add(all.subList(i, Math.min(i + size, all.size())));
        }
        return out;
    }
}
