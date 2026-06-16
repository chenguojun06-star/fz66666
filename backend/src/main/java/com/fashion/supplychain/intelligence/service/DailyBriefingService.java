package com.fashion.supplychain.intelligence.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.intelligence.entity.DailyBriefing;
import com.fashion.supplychain.intelligence.mapper.DailyBriefingMapper;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.service.ProductionOrderService;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.List;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

@Slf4j
@Service
public class DailyBriefingService {

    @Autowired
    private DailyBriefingMapper mapper;

    @Autowired
    private ProductionOrderService productionOrderService;

    public DailyBriefing getToday(Long tenantId) {
        if (tenantId == null) {
            return null;
        }
        return mapper.selectOne(
                new LambdaQueryWrapper<DailyBriefing>()
                        .eq(DailyBriefing::getTenantId, tenantId)
                        .eq(DailyBriefing::getBriefingDate, LocalDate.now())
                        .orderByDesc(DailyBriefing::getId)
                        .last("LIMIT 1")
        );
    }

    public DailyBriefing generate(Long tenantId) {
        if (tenantId == null) {
            log.warn("[DailyBriefing] tenantId 为空，跳过生成");
            return null;
        }

        DailyBriefing b = new DailyBriefing();
        b.setTenantId(tenantId);
        b.setBriefingDate(LocalDate.now());
        b.setGeneratedAt(LocalDateTime.now());

        try {
            fillRealData(b, tenantId);
        } catch (Exception e) {
            log.error("[DailyBriefing] 填充真实数据失败，使用默认值: {}", e.getMessage());
            setDefaults(b);
        }

        DailyBriefing existing = mapper.selectOne(
                new LambdaQueryWrapper<DailyBriefing>()
                        .eq(DailyBriefing::getTenantId, tenantId)
                        .eq(DailyBriefing::getBriefingDate, LocalDate.now())
                        .orderByDesc(DailyBriefing::getId)
                        .last("LIMIT 1")
        );

        if (existing != null) {
            mapper.update(b, new LambdaUpdateWrapper<DailyBriefing>()
                    .eq(DailyBriefing::getId, existing.getId()));
            b.setId(existing.getId());
            return b;
        }

        mapper.insert(b);
        return b;
    }

    private void fillRealData(DailyBriefing b, Long tenantId) {
        String factoryId = UserContext.factoryId();

        // 查询所有未删除的生产订单（根据权限过滤工厂）
        LambdaQueryWrapper<ProductionOrder> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(ProductionOrder::getTenantId, tenantId)
                .eq(ProductionOrder::getDeleteFlag, 0);
        // 如果有工厂限制，只查询本工厂数据
        if (factoryId != null && !factoryId.isBlank()) {
            wrapper.eq(ProductionOrder::getFactoryId, factoryId);
        }
        wrapper.select(ProductionOrder::getId, ProductionOrder::getOrderNo,
                        ProductionOrder::getStatus, ProductionOrder::getProductionProgress,
                        ProductionOrder::getPlannedEndDate, ProductionOrder::getFactoryId)
                .last("LIMIT 5000");

        List<ProductionOrder> allOrders = productionOrderService.list(wrapper);

        int totalOrders = allOrders.size();

        // 待处理订单：状态为 pending/confirmed/in_progress
        long pendingOrders = allOrders.stream()
                .filter(o -> "pending".equals(o.getStatus()) || "confirmed".equals(o.getStatus()))
                .count();

        // 风险订单：未完成 + 已过交期
        LocalDateTime now = LocalDateTime.now();
        long atRiskOrders = allOrders.stream()
                .filter(o -> !isTerminalStatus(o.getStatus()))
                .filter(o -> o.getPlannedEndDate() != null && o.getPlannedEndDate().isBefore(now))
                .count();

        // 整体生产进度：非终态订单的平均进度
        double avgProgress = allOrders.stream()
                .filter(o -> !isTerminalStatus(o.getStatus()))
                .mapToInt(o -> o.getProductionProgress() != null ? o.getProductionProgress() : 0)
                .average()
                .orElse(0.0);

        // 延款式数：未完成 + 已过交期的不同款号数（用订单数近似）
        long delayedStyleCount = atRiskOrders;

        // 低库存物料：暂用0，后续可接入 MaterialStock 统计
        int lowStockItems = 0;

        b.setTotalOrders(totalOrders);
        b.setPendingOrders((int) pendingOrders);
        b.setAtRiskOrders((int) atRiskOrders);
        b.setTotalProductionProgress(avgProgress);
        b.setDelayedStyleCount((int) delayedStyleCount);
        b.setLowStockItems(lowStockItems);
        b.setWagePendingAmount(null);

        // AI 摘要
        b.setSummary(buildSummary(b));
    }

    private void setDefaults(DailyBriefing b) {
        b.setTotalOrders(0);
        b.setPendingOrders(0);
        b.setAtRiskOrders(0);
        b.setTotalProductionProgress(0.0);
        b.setDelayedStyleCount(0);
        b.setLowStockItems(0);
        b.setWagePendingAmount(null);
        b.setSummary("数据加载异常，请稍后刷新");
    }

    private boolean isTerminalStatus(String status) {
        return "completed".equals(status) || "cancelled".equals(status)
                || "scrapped".equals(status) || "closed".equals(status)
                || "archived".equals(status);
    }

    private String buildSummary(DailyBriefing b) {
        StringBuilder sb = new StringBuilder("今日简报，");
        if (b.getAtRiskOrders() != null && b.getAtRiskOrders() > 0) {
            sb.append("有 ").append(b.getAtRiskOrders()).append(" 个风险订单需关注，");
        }
        if (b.getPendingOrders() != null && b.getPendingOrders() > 0) {
            sb.append(b.getPendingOrders()).append(" 个订单待处理，");
        }
        if (b.getTotalProductionProgress() != null && b.getTotalProductionProgress() > 0) {
            sb.append("整体进度 ").append(String.format("%.1f", b.getTotalProductionProgress())).append("%，");
        }
        if (b.getDelayedStyleCount() != null && b.getDelayedStyleCount() > 0) {
            sb.append(b.getDelayedStyleCount()).append(" 款延期，");
        }
        // 去掉末尾逗号
        String s = sb.toString();
        if (s.endsWith("，")) {
            s = s.substring(0, s.length() - 1);
        }
        if (s.endsWith("今日简报，")) {
            s = "今日简报，系统健康";
        }
        return s;
    }
}
