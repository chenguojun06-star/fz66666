package com.fashion.supplychain.selection.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.service.ProductionOrderService;
import com.fashion.supplychain.selection.dto.StyleHistoryAnalysisDTO;
import com.fashion.supplychain.selection.entity.SelectionCandidate;
import com.fashion.supplychain.selection.service.SelectionCandidateService;
import com.fashion.supplychain.style.entity.StyleInfo;
import com.fashion.supplychain.style.service.StyleInfoService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.*;
import java.util.stream.Collectors;

/**
 * 选品审批通过 → 自动创建款式 编排器
 * 同时提供历史款式分析（内部数据聚合）
 */
@Service
@Slf4j
public class SelectionApprovalOrchestrator {

    @Autowired
    private SelectionCandidateService candidateService;

    @Autowired
    private StyleInfoService styleInfoService;

    @Autowired
    private ProductionOrderService productionOrderService;

    /**
     * 选品通过后自动创建正式款式（t_style_info）
     * 同时把候选款与新款式关联
     */
    @Transactional(rollbackFor = Exception.class)
    public StyleInfo approveAndCreateStyle(Long candidateId) {
        Long tenantId = UserContext.tenantId();
        SelectionCandidate candidate = candidateService.getById(candidateId);
        if (candidate == null || !candidate.getTenantId().equals(tenantId)) {
            throw new RuntimeException("候选款不存在");
        }
        if (!"APPROVED".equals(candidate.getStatus())) {
            throw new RuntimeException("仅已通过状态的候选款可生成正式款式");
        }
        if (candidate.getCreatedStyleId() != null) {
            throw new RuntimeException("该候选款已生成款式: " + candidate.getCreatedStyleNo());
        }

        // 生成款号：SEL + 年月 + 序号
        String styleNo = "SEL" + java.time.LocalDate.now().format(
                java.time.format.DateTimeFormatter.ofPattern("yyMM"))
                + String.format("%04d", (int) (Math.random() * 9000) + 1000);

        StyleInfo style = new StyleInfo();
        style.setStyleNo(styleNo);
        style.setStyleName(candidate.getStyleName());
        style.setCategory(candidate.getCategory());
        style.setColor(candidate.getColorFamily());
        style.setPrice(candidate.getTargetPrice());
        style.setSeason(candidate.getSeasonTags());
        style.setDescription("由选品候选款 " + candidate.getCandidateNo() + " 自动生成");
        style.setStatus("ENABLED");
        style.setYear(java.time.LocalDate.now().getYear());
        style.setMonth(java.time.LocalDate.now().getMonthValue());

        styleInfoService.saveOrUpdateStyle(style);
        log.info("[Selection] 候选款 {} → 款式 {} 创建成功", candidate.getCandidateNo(), styleNo);

        // 回写关联
        candidate.setCreatedStyleId(style.getId());
        candidate.setCreatedStyleNo(styleNo);
        candidateService.updateById(candidate);

        return style;
    }

    /**
     * 历史款式分析 — 基于内部生产订单+财务结算数据
     * 返回所有款号的历史战绩，按下单总量倒序
     */
    public List<StyleHistoryAnalysisDTO> analyzeHistory(Map<String, Object> filters) {
        Long tenantId = UserContext.tenantId();

        // 拉取该租户所有非草稿生产订单
        LambdaQueryWrapper<ProductionOrder> wrapper = new LambdaQueryWrapper<ProductionOrder>()
                .eq(ProductionOrder::getTenantId, tenantId)
                .isNotNull(ProductionOrder::getStyleNo)
                .ne(ProductionOrder::getStatus, "DRAFT")
                .orderByDesc(ProductionOrder::getCreateTime);

        String category = (String) filters.get("category");
        if (category != null && !category.isEmpty()) {
            wrapper.eq(ProductionOrder::getProductCategory, category);
        }

        List<ProductionOrder> orders = productionOrderService.list(wrapper);
        if (orders.isEmpty()) return Collections.emptyList();

        // 按款号聚合
        Map<String, List<ProductionOrder>> byStyle = orders.stream()
                .filter(o -> o.getStyleNo() != null)
                .collect(Collectors.groupingBy(ProductionOrder::getStyleNo));

        List<StyleHistoryAnalysisDTO> result = new ArrayList<>();
        for (Map.Entry<String, List<ProductionOrder>> entry : byStyle.entrySet()) {
            String styleNo = entry.getKey();
            List<ProductionOrder> styleOrders = entry.getValue();

            StyleHistoryAnalysisDTO dto = new StyleHistoryAnalysisDTO();
            dto.setStyleNo(styleNo);
            dto.setStyleName(styleOrders.get(0).getStyleName());
            dto.setCategory(styleOrders.get(0).getProductCategory());
            dto.setOrderCount(styleOrders.size());

            int totalQty = styleOrders.stream()
                    .mapToInt(o -> o.getOrderQuantity() != null ? o.getOrderQuantity() : 0)
                    .sum();
            dto.setTotalOrderQty(totalQty);

            int totalWarehoused = styleOrders.stream()
                    .mapToInt(o -> o.getWarehousingQualifiedQuantity() != null ? o.getWarehousingQualifiedQuantity() : 0)
                    .sum();
            dto.setTotalWarehousedQty(totalWarehoused);

            // 合格率
            if (totalQty > 0) {
                BigDecimal rate = new BigDecimal(totalWarehoused)
                        .divide(new BigDecimal(totalQty), 4, RoundingMode.HALF_UP)
                        .multiply(new BigDecimal("100")).setScale(2, RoundingMode.HALF_UP);
                dto.setAvgQualifiedRate(rate);
            }

            // 返单次数（同款下单>1次）
            dto.setRepeatOrderCount(styleOrders.size() > 1 ? styleOrders.size() - 1 : 0);
            dto.setHighPotential(styleOrders.size() >= 2);

            // 时间
            styleOrders.stream().map(ProductionOrder::getCreateTime)
                    .filter(Objects::nonNull).min(Comparator.naturalOrder())
                    .ifPresent(t -> dto.setFirstOrderTime(t.toString()));
            styleOrders.stream().map(ProductionOrder::getCreateTime)
                    .filter(Objects::nonNull).max(Comparator.naturalOrder())
                    .ifPresent(t -> dto.setLastOrderTime(t.toString()));

            // 客户列表
            List<String> customers = styleOrders.stream()
                    .map(ProductionOrder::getCompany)
                    .filter(Objects::nonNull).distinct().collect(Collectors.toList());
            dto.setCustomers(customers);

            result.add(dto);
        }

        // 按下单总量倒序
        result.sort((a, b) -> Integer.compare(b.getTotalOrderQty(), a.getTotalOrderQty()));

        // 限制返回数量
        Object limitObj = filters.get("limit");
        int limit = limitObj != null ? Integer.parseInt(limitObj.toString()) : 50;
        return result.stream().limit(limit).collect(Collectors.toList());
    }

    /** 获取畅销款TOP N（快速接口） */
    public List<StyleHistoryAnalysisDTO> getTopStyles(int top) {
        Map<String, Object> filters = new HashMap<>();
        filters.put("limit", top);
        return analyzeHistory(filters);
    }
}
