package com.fashion.supplychain.intelligence.orchestration;

import com.baomidou.mybatisplus.core.metadata.IPage;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.common.tenant.TenantAssert;
import com.fashion.supplychain.intelligence.dto.PendingTaskDTO;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.helper.MaterialPurchaseQueryHelper;
import com.fashion.supplychain.production.helper.ScanRecordQueryHelper;
import com.fashion.supplychain.production.orchestration.CuttingTaskOrchestrator;
import com.fashion.supplychain.production.orchestration.ProductWarehousingOrchestrator;
import com.fashion.supplychain.production.service.ProductionOrderService;
import com.fashion.supplychain.system.service.UserService;
import java.util.*;
import java.util.stream.Collectors;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;
import org.springframework.context.annotation.Lazy;

/**
 * 生产域待办采集 — 裁剪/质检/返修/采购到货
 */
@Component
@Lazy
@Slf4j
public class ProductionPendingCollector {

    private static final int MAX_PER_CATEGORY = 10;

    @Autowired private CuttingTaskOrchestrator cuttingTaskOrchestrator;
    @Autowired private ScanRecordQueryHelper scanRecordQueryHelper;
    @Autowired private ProductWarehousingOrchestrator warehousingOrchestrator;
    @Autowired private MaterialPurchaseQueryHelper materialPurchaseQueryHelper;
    @Autowired private ProductionOrderService productionOrderService;
    @Autowired private UserService userService;

    public PendingTaskDTO mapCuttingTask(com.fashion.supplychain.production.entity.CuttingTask t) {
        PendingTaskDTO dto = new PendingTaskDTO();
        dto.setId("CUT_" + t.getId());
        dto.setTaskType("CUTTING_TASK");
        dto.setModule("production");
        dto.setTitle("裁剪任务 " + safe(t.getProductionOrderNo()));
        dto.setDescription(safe(t.getStyleNo()) + " " + t.getOrderQuantity() + "件待裁剪");
        dto.setOrderNo(t.getProductionOrderNo());
        dto.setStyleNo(t.getStyleNo());
        dto.setDeepLinkPath("/production/cutting");
        dto.setPriority("medium");
        dto.setCreatedAt(t.getReceivedTime());
        dto.setQuantity(t.getOrderQuantity());
        if (t.getReceivedTime() != null) dto.setStartTime(t.getReceivedTime().toString());
        if (t.getExpectedShipDate() != null) dto.setEndTime(t.getExpectedShipDate().toString());
        dto.setAssigneeName(t.getReceiverName());
        dto.setAssigneeId(t.getReceiverId());
        dto.setTaskStatus("pending");
        dto.setAssigneeRole("裁剪员");
        PendingTaskOrchestrator.fillCategoryMeta(dto);
        return dto;
    }

    public List<PendingTaskDTO> collectCuttingTasks() {
        return cuttingTaskOrchestrator.getMyTasks().stream().limit(MAX_PER_CATEGORY)
                .map(this::mapCuttingTask).collect(Collectors.toList());
    }

    public List<PendingTaskDTO> collectQualityTasks() {
        return scanRecordQueryHelper.getMyQualityTasks().stream().limit(MAX_PER_CATEGORY).map(r -> {
            PendingTaskDTO dto = new PendingTaskDTO();
            dto.setId("QC_" + r.getId());
            dto.setTaskType("QUALITY_INSPECT");
            dto.setModule("production");
            dto.setTitle("质检待处理 " + safe(r.getOrderNo()));
            dto.setDescription(safe(r.getProcessName()) + " " + r.getQuantity() + "件");
            dto.setOrderNo(r.getOrderNo());
            dto.setStyleNo(r.getStyleNo());
            dto.setDeepLinkPath("/production/warehousing");
            dto.setPriority("medium");
            dto.setCreatedAt(r.getScanTime());
            dto.setTaskStatus("pending");
            dto.setAssigneeId(r.getOperatorId());
            dto.setAssigneeName(r.getOperatorName());
            dto.setAssigneeRole("质检员");
            PendingTaskOrchestrator.fillCategoryMeta(dto);
            return dto;
        }).collect(Collectors.toList());
    }

    public List<PendingTaskDTO> collectRepairTasks() {
        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();
        List<Map<String, Object>> repairs = warehousingOrchestrator.listPendingRepairTasks(tenantId);
        if (repairs.isEmpty()) return List.of();
        List<String> orderNos = repairs.stream()
                .map(m -> safeObj(m.get("orderNo"))).filter(StringUtils::hasText)
                .distinct().collect(Collectors.toList());
        Map<String, ProductionOrder> orderMap = batchLoadOrders(tenantId, orderNos);
        return repairs.stream().limit(MAX_PER_CATEGORY).map(m -> {
            PendingTaskDTO dto = new PendingTaskDTO();
            dto.setId("RPR_" + safeObj(m.get("bundleId")));
            dto.setTaskType("REPAIR");
            dto.setModule("production");
            String orderNo = safeObj(m.get("orderNo"));
            dto.setTitle("返修 " + orderNo);
            dto.setDescription(toInt(m.get("defectQty")) + "件次品待返修");
            dto.setOrderNo(orderNo);
            dto.setStyleNo(safeObj(m.get("styleNo")));
            dto.setDeepLinkPath("/production/warehousing");
            dto.setPriority("high");
            dto.setTaskStatus("pending");
            dto.setAssigneeRole("跟单员");
            ProductionOrder order = orderMap.get(orderNo);
            if (order != null) {
                if (StringUtils.hasText(order.getMerchandiser())) dto.setAssigneeName(order.getMerchandiser());
                else if (StringUtils.hasText(order.getFactoryName())) {
                    dto.setAssigneeName(order.getFactoryName()); dto.setAssigneeRole("工厂");
                }
            }
            if (!StringUtils.hasText(dto.getAssigneeName())) {
                String ownerName = resolveTenantOwnerName(tenantId);
                if (StringUtils.hasText(ownerName)) { dto.setAssigneeName(ownerName); dto.setAssigneeRole("租户老板"); }
            }
            PendingTaskOrchestrator.fillCategoryMeta(dto);
            return dto;
        }).collect(Collectors.toList());
    }

    public List<PendingTaskDTO> collectMaterialTasks() {
        return materialPurchaseQueryHelper.getMyTasks().stream().limit(MAX_PER_CATEGORY).map(p -> {
            PendingTaskDTO dto = new PendingTaskDTO();
            dto.setId("MAT_" + p.getId());
            dto.setTaskType("MATERIAL_PURCHASE");
            dto.setModule("production");
            dto.setTitle("采购待收货 " + safe(p.getPurchaseNo()));
            int purchased = p.getPurchaseQuantity() != null ? p.getPurchaseQuantity().intValue() : 0;
            int arrived = p.getArrivedQuantity() != null ? p.getArrivedQuantity() : 0;
            dto.setDescription(safe(p.getMaterialName()) + " 已到" + arrived + "/" + purchased);
            dto.setOrderNo(p.getOrderNo());
            dto.setStyleNo(p.getStyleNo());
            dto.setDeepLinkPath("/production/material");
            dto.setPriority("medium");
            dto.setCreatedAt(p.getCreateTime());
            dto.setTaskStatus("pending");
            dto.setAssigneeId(p.getReceiverId());
            dto.setAssigneeName(p.getReceiverName());
            dto.setAssigneeRole("采购员");
            PendingTaskOrchestrator.fillCategoryMeta(dto);
            return dto;
        }).collect(Collectors.toList());
    }

    Map<String, ProductionOrder> batchLoadOrders(Long tenantId, List<String> orderNos) {
        if (orderNos == null || orderNos.isEmpty()) return Map.of();
        return productionOrderService.lambdaQuery()
                .select(ProductionOrder::getOrderNo, ProductionOrder::getMerchandiser,
                        ProductionOrder::getFactoryName, ProductionOrder::getStyleNo)
                .eq(ProductionOrder::getTenantId, tenantId)
                .eq(ProductionOrder::getDeleteFlag, 0)
                .in(ProductionOrder::getOrderNo, orderNos).list()
                .stream().collect(Collectors.toMap(ProductionOrder::getOrderNo, o -> o, (a, b) -> a));
    }

    String resolveTenantOwnerName(Long tenantId) {
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

    static String safe(String s) { return s != null ? s : ""; }
    static String safeObj(Object o) { return o != null ? String.valueOf(o) : ""; }
    static int toInt(Object o) { if (o instanceof Number n) return n.intValue(); return 0; }
}