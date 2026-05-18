package com.fashion.supplychain.intelligence.orchestration;

import com.baomidou.mybatisplus.core.metadata.IPage;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.common.tenant.TenantAssert;
import com.fashion.supplychain.intelligence.dto.PendingTaskDTO;
import com.fashion.supplychain.production.entity.ProductionExceptionReport;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.service.ProductionExceptionReportService;
import com.fashion.supplychain.production.service.ProductionOrderService;
import com.fashion.supplychain.style.entity.StyleInfo;
import com.fashion.supplychain.style.service.StyleInfoService;
import com.fashion.supplychain.system.service.UserService;
import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;
import java.util.*;
import java.util.stream.Collectors;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

/**
 * 订单/异常/样衣 域待办采集
 */
@Component
@Slf4j
public class OrderPendingCollector {

    private static final int MAX_PER_CATEGORY = 10;
    private static final Set<String> TERMINAL_STATUSES = Set.of("completed", "cancelled", "scrapped", "archived", "closed");

    @Autowired private ProductionOrderService productionOrderService;
    @Autowired private ProductionExceptionReportService exceptionReportService;
    @Autowired private StyleInfoService styleInfoService;
    @Autowired private UserService userService;

    public List<PendingTaskDTO> collectOverdueOrders(ProductionPendingCollector prodCollector) {
        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();
        String factoryId = UserContext.factoryId();
        LocalDateTime now = LocalDateTime.now();
        List<ProductionOrder> orders = productionOrderService.lambdaQuery()
                .select(ProductionOrder::getId, ProductionOrder::getOrderNo,
                        ProductionOrder::getStyleNo, ProductionOrder::getPlannedEndDate,
                        ProductionOrder::getProductionProgress, ProductionOrder::getMerchandiser,
                        ProductionOrder::getFactoryId, ProductionOrder::getFactoryName)
                .eq(ProductionOrder::getTenantId, tenantId)
                .eq(ProductionOrder::getDeleteFlag, 0)
                .eq(StringUtils.hasText(factoryId), ProductionOrder::getFactoryId, factoryId)
                .notIn(ProductionOrder::getStatus, TERMINAL_STATUSES)
                .isNotNull(ProductionOrder::getPlannedEndDate)
                .lt(ProductionOrder::getPlannedEndDate, now)
                .orderByAsc(ProductionOrder::getPlannedEndDate)
                .last("LIMIT 50").list();
        return orders.stream().map(o -> {
            PendingTaskDTO dto = new PendingTaskDTO();
            dto.setId("OVD_" + o.getId());
            dto.setTaskType("OVERDUE_ORDER");
            dto.setModule("production");
            long days = ChronoUnit.DAYS.between(o.getPlannedEndDate(), now);
            dto.setTitle("订单逾期 " + ProductionPendingCollector.safe(o.getOrderNo()));
            int prog = o.getProductionProgress() != null ? o.getProductionProgress() : 0;
            dto.setDescription("逾期" + days + "天，进度" + prog + "%");
            dto.setOrderNo(o.getOrderNo());
            dto.setStyleNo(o.getStyleNo());
            dto.setDeepLinkPath("/production");
            dto.setPriority("high");
            dto.setCreatedAt(o.getPlannedEndDate());
            dto.setTaskStatus("pending");
            dto.setAssigneeName(o.getMerchandiser());
            dto.setAssigneeRole("跟单员");
            if (!StringUtils.hasText(o.getMerchandiser())) {
                String ownerName = resolveTenantOwnerName(tenantId);
                if (StringUtils.hasText(ownerName)) { dto.setAssigneeName(ownerName); dto.setAssigneeRole("租户老板"); }
            }
            PendingTaskOrchestrator.fillCategoryMeta(dto);
            return dto;
        }).collect(Collectors.toList());
    }

    public List<PendingTaskDTO> collectExceptionReports(ProductionPendingCollector prodCollector) {
        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();
        List<ProductionExceptionReport> reports = exceptionReportService.lambdaQuery()
                .select(ProductionExceptionReport::getId, ProductionExceptionReport::getOrderNo,
                        ProductionExceptionReport::getExceptionType,
                        ProductionExceptionReport::getDescription,
                        ProductionExceptionReport::getCreateTime)
                .eq(ProductionExceptionReport::getTenantId, tenantId)
                .eq(ProductionExceptionReport::getStatus, "PENDING")
                .last("LIMIT " + MAX_PER_CATEGORY).list();
        if (reports.isEmpty()) return List.of();
        List<String> orderNos = reports.stream().map(ProductionExceptionReport::getOrderNo)
                .filter(StringUtils::hasText).distinct().collect(Collectors.toList());
        Map<String, ProductionOrder> orderMap = prodCollector.batchLoadOrders(tenantId, orderNos);
        return reports.stream().map(r -> {
            PendingTaskDTO dto = new PendingTaskDTO();
            dto.setId("EXC_" + r.getId());
            dto.setTaskType("EXCEPTION_REPORT");
            dto.setModule("production");
            dto.setTitle("异常待处理 " + ProductionPendingCollector.safe(r.getOrderNo()));
            dto.setDescription(ProductionPendingCollector.safe(r.getExceptionType()) + " " + ProductionPendingCollector.safe(r.getDescription()));
            dto.setOrderNo(r.getOrderNo());
            dto.setDeepLinkPath("/production");
            dto.setPriority("high");
            dto.setCreatedAt(r.getCreateTime());
            dto.setTaskStatus("pending");
            dto.setAssigneeRole("跟单员");
            ProductionOrder order = orderMap.get(r.getOrderNo());
            if (order != null && StringUtils.hasText(order.getMerchandiser())) dto.setAssigneeName(order.getMerchandiser());
            else {
                String ownerName = resolveTenantOwnerName(tenantId);
                if (StringUtils.hasText(ownerName)) { dto.setAssigneeName(ownerName); dto.setAssigneeRole("租户老板"); }
            }
            PendingTaskOrchestrator.fillCategoryMeta(dto);
            return dto;
        }).collect(Collectors.toList());
    }

    public List<PendingTaskDTO> collectStyleDevelopmentTasks() {
        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();
        Map<String, Object> params = new HashMap<>();
        params.put("tenantId", tenantId);
        params.put("excludeScrapped", Boolean.TRUE);
        params.put("excludePushedToOrder", Boolean.TRUE);
        List<String> devNodes = List.of("未开始", "纸样开发中", "样衣制作中");
        List<StyleInfo> styles = new ArrayList<>();
        for (String node : devNodes) {
            params.put("progressNode", node);
            IPage<StyleInfo> page = styleInfoService.queryPage(params);
            if (page != null && page.getRecords() != null) styles.addAll(page.getRecords());
            if (styles.size() >= MAX_PER_CATEGORY) break;
        }
        Set<Long> seenIds = new LinkedHashSet<>();
        List<StyleInfo> uniqueStyles = styles.stream()
                .filter(s -> s.getId() != null && seenIds.add(s.getId()))
                .filter(s -> {
                    String pn = s.getProgressNode();
                    return pn != null && !pn.equals("开发样报废") && !pn.equals("样衣完成") && !pn.equals("纸样完成");
                }).collect(Collectors.toList());
        return uniqueStyles.stream().limit(MAX_PER_CATEGORY).map(s -> {
            PendingTaskDTO dto = new PendingTaskDTO();
            dto.setId("STY_" + s.getId());
            dto.setTaskType("STYLE_DEVELOPMENT");
            dto.setModule("style");
            dto.setTitle("样衣开发 " + ProductionPendingCollector.safe(s.getStyleNo()));
            String node = s.getProgressNode() != null ? s.getProgressNode() : "进行中";
            dto.setDescription(ProductionPendingCollector.safe(s.getStyleName()) + " " + node);
            dto.setStyleNo(s.getStyleNo());
            dto.setDeepLinkPath("/style-info");
            dto.setPriority("medium");
            dto.setTaskStatus("pending");
            dto.setAssigneeRole("样衣开发");
            dto.setQuantity(s.getSampleQuantity());
            if (s.getDeliveryDate() != null) dto.setEndTime(s.getDeliveryDate().toString());
            if ("纸样开发中".equals(node)) {
                dto.setAssigneeName(s.getPatternAssignee());
                if (s.getPatternStartTime() != null) dto.setStartTime(s.getPatternStartTime().toString());
            } else if ("样衣制作中".equals(node)) {
                dto.setAssigneeName(s.getProductionAssignee());
                if (s.getProductionStartTime() != null) dto.setStartTime(s.getProductionStartTime().toString());
            } else {
                dto.setAssigneeName(StringUtils.hasText(s.getPatternAssignee()) ? s.getPatternAssignee() : s.getProductionAssignee());
                if (s.getCreateTime() != null) dto.setStartTime(s.getCreateTime().toString());
            }
            PendingTaskOrchestrator.fillCategoryMeta(dto);
            return dto;
        }).collect(Collectors.toList());
    }

    private String resolveTenantOwnerName(Long tenantId) {
        if (tenantId == null) return null;
        try {
            com.fashion.supplychain.system.entity.User owner = userService.lambdaQuery()
                    .eq(com.fashion.supplychain.system.entity.User::getTenantId, tenantId)
                    .eq(com.fashion.supplychain.system.entity.User::getIsTenantOwner, true)
                    .eq(com.fashion.supplychain.system.entity.User::getStatus, "active")
                    .select(com.fashion.supplychain.system.entity.User::getName)
                    .last("LIMIT 1").one();
            return owner != null ? owner.getName() : null;
        } catch (Exception e) { log.warn("[PendingCollector] 查询租户老板失败: {}", e.getMessage()); return null; }
    }
}