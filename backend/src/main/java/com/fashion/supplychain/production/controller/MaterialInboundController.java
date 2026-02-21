package com.fashion.supplychain.production.controller;

import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.common.tenant.TenantAssert;
import com.fashion.supplychain.production.entity.MaterialInbound;
import com.fashion.supplychain.production.orchestration.MaterialInboundOrchestrator;
import com.fashion.supplychain.production.service.MaterialInboundService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

/**
 * 面辅料入库记录 Controller
 */
@Slf4j
@RestController
@RequestMapping("/api/production/material/inbound")
@PreAuthorize("isAuthenticated()")
public class MaterialInboundController {

    @Autowired
    private MaterialInboundService materialInboundService;

    @Autowired
    private MaterialInboundOrchestrator materialInboundOrchestrator;

    /**
     * 分页查询入库记录
     */
    @GetMapping("/list")
    public Result<?> list(
            @RequestParam(defaultValue = "1") Integer pageNum,
            @RequestParam(defaultValue = "10") Integer pageSize,
            @RequestParam(required = false) String materialCode,
            @RequestParam(required = false) String purchaseId) {

        Page<MaterialInbound> page = new Page<>(pageNum, pageSize);
        IPage<MaterialInbound> result = materialInboundService.queryPage(page, materialCode, purchaseId);

        return Result.success(result);
    }

    /**
     * 采购到货入库
     * 完整流程：采购到货 → 生成入库单 → 更新库存 → 关联采购单
     */
    @PostMapping("/confirm-arrival")
    public Result<?> confirmArrival(@RequestBody Map<String, Object> params) {
        try {
            String purchaseId = (String) params.get("purchaseId");
            Integer arrivedQuantity = (Integer) params.get("arrivedQuantity");
            String warehouseLocation = (String) params.get("warehouseLocation");
            String operatorId = (String) params.get("operatorId");
            String operatorName = (String) params.get("operatorName");
            String remark = (String) params.get("remark");

            Map<String, Object> result = materialInboundOrchestrator.confirmArrivalAndInbound(
                    purchaseId, arrivedQuantity, warehouseLocation,
                    operatorId, operatorName, remark);

            return Result.success(result);
        } catch (Exception e) {
            log.error("采购到货入库失败", e);
            return Result.fail(e.getMessage());
        }
    }

    /**
     * 手动入库（无采购单）
     * 用于：退货入库、其他来源入库
     */
    @PostMapping("/manual")
    public Result<?> manualInbound(@RequestBody Map<String, Object> params) {
        try {
            String materialCode = (String) params.get("materialCode");
            String materialName = (String) params.get("materialName");
            String materialType = (String) params.get("materialType");
            String color = (String) params.get("color");
            String size = (String) params.get("size");
            Integer quantity = (Integer) params.get("quantity");
            String warehouseLocation = (String) params.get("warehouseLocation");
            String supplierName = (String) params.get("supplierName");
            String operatorId = (String) params.get("operatorId");
            String operatorName = (String) params.get("operatorName");
            String remark = (String) params.get("remark");

            Map<String, Object> result = materialInboundOrchestrator.manualInbound(
                    materialCode, materialName, materialType, color, size,
                    quantity, warehouseLocation, supplierName,
                    operatorId, operatorName, remark);

            return Result.success(result);
        } catch (Exception e) {
            log.error("手动入库失败", e);
            return Result.fail(e.getMessage());
        }
    }

    /**
     * @deprecated 已废弃，请使用 GET /list?purchaseId=xxx
     * @since 2026-02-01 标记废弃，将在2026-05-01删除
     */
    @Deprecated
    @GetMapping("/by-purchase/{purchaseId}")
    public Result<?> listByPurchaseId(@PathVariable String purchaseId) {
        List<MaterialInbound> list = materialInboundService.listByPurchaseId(purchaseId);
        return Result.success(list);
    }

    /**
     * 查询入库记录详情
     */
    @GetMapping("/{id}")
    public Result<?> getById(@PathVariable String id) {
        MaterialInbound inbound = materialInboundService.getById(id);
        if (inbound == null) {
            return Result.fail("入库记录不存在");
        }
        TenantAssert.assertBelongsToCurrentTenant(inbound.getTenantId(), "入库记录");
        return Result.success(inbound);
    }

    /**
     * 生成入库单号（仅供测试）
     */
    @GetMapping("/generate-no")
    public Result<?> generateInboundNo() {
        String inboundNo = materialInboundService.generateInboundNo();
        return Result.success(Map.of("inboundNo", inboundNo));
    }
}
