package com.fashion.supplychain.production.controller;

import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.production.entity.MaterialPicking;
import com.fashion.supplychain.production.entity.MaterialPickingItem;
import com.fashion.supplychain.production.orchestration.MaterialPickingOrchestrator;
import com.fashion.supplychain.production.orchestration.MaterialPurchaseOrchestrator;
import lombok.Data;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import com.baomidou.mybatisplus.core.metadata.IPage;

import java.util.List;

/**
 * 领料单控制器
 *
 * <p>本类只做「参数校验 + 调 Orchestrator + 组装 Result」。领料单的创建/领取/分页查询/
 * 明细回填原先直接写在 Controller 里并注入 MaterialPickingService + ProductionOrderService
 * + MaterialPickingItemMapper（D-630 规则6 与「Controller 不得直接依赖 Mapper」双重违规），
 * 已全部下沉到 {@link MaterialPickingOrchestrator}。
 */
@Slf4j
@RestController
@RequestMapping("/api/production/picking")
@PreAuthorize("isAuthenticated()")
public class MaterialPickingController {

    @Autowired
    private MaterialPickingOrchestrator materialPickingOrchestrator;

    @Autowired
    private MaterialPurchaseOrchestrator materialPurchaseOrchestrator;

    @PostMapping
    public Result<String> create(@RequestBody PickingRequest request) {
        return Result.success(materialPickingOrchestrator.createPicking(request.getPicking(), request.getItems()));
    }

    /**
     * BOM 申请领取（D-099 重构）：
     * - INTERNAL 内部领料：领取即出库——同事务创建+确认出库（扣库存+写出库日志+记录操作人），
     *   不再产生待出库单和仓库通知（修复：无限领取/库存不扣减/通知挂着不消失）
     * - EXTERNAL 外发厂领用：保持两步流（pending + 通知 + 仓库确认），audit 含外发厂账单/应收联动
     */
    @PostMapping("/pending")
    public Result<String> createPending(@RequestBody PickingRequest request) {
        if (request == null || request.getPicking() == null) {
            throw new IllegalArgumentException("领料请求不能为空");
        }
        return materialPickingOrchestrator.createPending(request.getPicking(), request.getItems());
    }

    @GetMapping("/list")
    public Result<IPage<MaterialPicking>> page(
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "10") int pageSize,
            @RequestParam(required = false) String orderNo,
            @RequestParam(required = false) String styleNo,
            @RequestParam(required = false) String status,
            @RequestParam(required = false) String keyword,
            @RequestParam(required = false) String pickupType,
            @RequestParam(required = false) String usageType,
            @RequestParam(required = false) String startDate,
            @RequestParam(required = false) String endDate) {
        return materialPickingOrchestrator.pagePicking(page, pageSize, orderNo, styleNo, status,
                keyword, pickupType, usageType, startDate, endDate);
    }

    @GetMapping("/{id}/items")
    public Result<List<MaterialPickingItem>> getItems(@PathVariable String id) {
        return Result.success(materialPickingOrchestrator.getItems(id));
    }

    /**
     * 仓库确认出库（两步流第二步）
     * 实际扣减库存 + 状态改为 completed
     */
    @PostMapping("/{id}/confirm-outbound")
    public Result<Void> confirmOutbound(@PathVariable String id) {
        materialPurchaseOrchestrator.confirmPickingOutbound(id);
        return Result.success(null);
    }

    /**
     * 取消待出库领料单（仅 pending 状态可操作）
     * 回退已锁定的库存 + 恢复关联采购单状态
     */
    @PostMapping("/{id}/cancel-pending")
    public Result<Void> cancelPending(@PathVariable String id) {
        materialPickingOrchestrator.cancelPending(id);
        return Result.success(null);
    }

    @PostMapping("/{id}/audit")
    public Result<Void> audit(@PathVariable String id, @RequestBody java.util.Map<String, Object> body) {
        try {
            materialPickingOrchestrator.audit(id, body);
        } catch (Exception e) {
            return Result.fail(e.getMessage());
        }
        return Result.success(null);
    }

    @PostMapping("/batch-audit")
    public Result<java.util.Map<String, Object>> batchAudit(@RequestBody java.util.Map<String, Object> body) {
        @SuppressWarnings("unchecked")
        java.util.List<String> ids = (java.util.List<String>) body.get("ids");
        String action = body.get("action") == null ? "approve" : String.valueOf(body.get("action")).trim();
        String remark = body.get("remark") == null ? null : String.valueOf(body.get("remark")).trim();
        if (ids == null || ids.isEmpty()) throw new IllegalArgumentException("请选择要审核的领料单");
        int successCount = 0, failCount = 0;
        java.util.List<String> errors = new java.util.ArrayList<>();
        for (String id : ids) {
            try {
                java.util.Map<String, Object> singleBody = new java.util.LinkedHashMap<>();
                singleBody.put("action", action);
                singleBody.put("remark", remark);
                audit(id, singleBody);
                successCount++;
            } catch (Exception e) { failCount++; errors.add(id + ": " + e.getMessage()); }
        }
        java.util.Map<String, Object> result = new java.util.LinkedHashMap<>();
        result.put("successCount", successCount);
        result.put("failCount", failCount);
        result.put("errors", errors);
        return Result.success(result);
    }

    @Data
    public static class PickingRequest {
        private MaterialPicking picking;
        private List<MaterialPickingItem> items;
    }
}
