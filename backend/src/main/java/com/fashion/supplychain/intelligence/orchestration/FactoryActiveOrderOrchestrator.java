package com.fashion.supplychain.intelligence.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.common.constant.OrderStatusConstants;
import com.fashion.supplychain.common.tenant.TenantAssert;
import com.fashion.supplychain.intelligence.dto.FactoryActiveOrderDTO;
import com.fashion.supplychain.intelligence.helper.OrderWorkloadHelper;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.service.ProductionOrderService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.time.temporal.ChronoUnit;
import java.util.Comparator;
import java.util.List;
import java.util.stream.Collectors;

/**
 * 工厂在产订单明细编排器
 *
 * <p>用途：下单页"查看工厂详情"抽屉中展示该工厂当前所有在产订单，
 * 帮助下单人员评估工厂负载和排队情况。
 *
 * <p>风险等级判定：
 * <ul>
 *   <li>danger：已逾期 或 距交期≤7天且进度<70%</li>
 *   <li>warning：距交期≤15天且进度<50%</li>
 *   <li>safe：其他</li>
 * </ul>
 */
@Service
@Slf4j
@RequiredArgsConstructor
public class FactoryActiveOrderOrchestrator {

    private static final DateTimeFormatter DATE_FMT = DateTimeFormatter.ofPattern("yyyy-MM-dd");
    private static final int AT_RISK_DAYS = 7;
    private static final int AT_RISK_PROGRESS = 70;
    private static final int WARNING_DAYS = 15;
    private static final int WARNING_PROGRESS = 50;

    private final ProductionOrderService productionOrderService;

    public List<FactoryActiveOrderDTO> getActiveOrdersByFactory(String factoryName) {
        TenantAssert.assertTenantContext();
        if (factoryName == null || factoryName.isBlank()) {
            return List.of();
        }

        QueryWrapper<ProductionOrder> qw = new QueryWrapper<>();
        qw.eq("tenant_id", UserContext.tenantId())
          .eq("factory_name", factoryName.trim())
          .eq("delete_flag", 0)
          .notIn("status", OrderStatusConstants.TERMINAL_STATUSES)
          .orderByDesc("planned_end_date");
        List<ProductionOrder> orders = productionOrderService.list(qw);

        LocalDate today = LocalDate.now();
        return orders.stream()
                .map(o -> toDTO(o, today))
                .sorted(Comparator
                        .comparingInt((FactoryActiveOrderDTO d) -> "danger".equals(d.getRiskLevel()) ? 0
                                : "warning".equals(d.getRiskLevel()) ? 1 : 2)
                        .thenComparingInt(FactoryActiveOrderDTO::getDaysToDeadline))
                .collect(Collectors.toList());
    }

    private FactoryActiveOrderDTO toDTO(ProductionOrder o, LocalDate today) {
        FactoryActiveOrderDTO dto = new FactoryActiveOrderDTO();
        dto.setOrderId(String.valueOf(o.getId()));
        dto.setOrderNo(o.getOrderNo());
        dto.setStyleNo(o.getStyleNo());
        dto.setStyleName(o.getStyleName());
        dto.setCustomerName(o.getCustomerName());
        dto.setOrderQuantity(o.getOrderQuantity());
        dto.setCompletedQuantity(o.getCompletedQuantity());
        // 2026-10-09 口径修复：剩余量按 progress 推算（completed_quantity 与进度不同步，progress=80% 时 completed 可能为 0）
        dto.setRemainingQuantity(OrderWorkloadHelper.remainingQuantity(o));
        dto.setProductionProgress(o.getProductionProgress());
        dto.setStatus(o.getStatus());
        dto.setUrgencyLevel(o.getUrgencyLevel());
        dto.setMerchandiser(o.getMerchandiser());
        // "已完成待关单"（progress=100% 但状态未流转）：不再按逾期判高危
        boolean completedPendingClosure = OrderWorkloadHelper.isCompletedPendingClosure(o);
        dto.setCompletedPendingClosure(completedPendingClosure);

        if (o.getPlannedEndDate() != null) {
            dto.setPlannedEndDate(o.getPlannedEndDate().format(DATE_FMT));
            int days = (int) ChronoUnit.DAYS.between(today, o.getPlannedEndDate().toLocalDate());
            dto.setDaysToDeadline(days);
            dto.setRiskLevel(completedPendingClosure ? "safe" : classifyRisk(days, o.getProductionProgress()));
        } else {
            dto.setRiskLevel(completedPendingClosure ? "safe" : classifyRisk(30, o.getProductionProgress()));
        }
        return dto;
    }

    private String classifyRisk(int daysToDeadline, Integer progress) {
        int prog = progress != null ? progress : 0;
        if (daysToDeadline < 0) return "danger";
        if (daysToDeadline <= AT_RISK_DAYS && prog < AT_RISK_PROGRESS) return "danger";
        if (daysToDeadline <= WARNING_DAYS && prog < WARNING_PROGRESS) return "warning";
        return "safe";
    }
}
