package com.fashion.supplychain.production.controller;

import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.production.entity.MaterialPurchase;
import com.fashion.supplychain.production.entity.PurchaseOrderDoc;
import com.fashion.supplychain.production.orchestration.MaterialPurchaseDocOrchestrator;
import com.fashion.supplychain.production.orchestration.MaterialPurchaseOrchestrator;
import com.fashion.supplychain.production.service.PurchaseOrderDocService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.util.*;
import lombok.extern.slf4j.Slf4j;

@RestController
@RequestMapping({ "/api/production/purchase", "/api/production/material" })
@Slf4j
@PreAuthorize("isAuthenticated()")
public class MaterialPurchaseController {

    @Autowired
    private MaterialPurchaseOrchestrator materialPurchaseOrchestrator;

    @Autowired
    private MaterialPurchaseDocOrchestrator purchaseDocOrchestrator;

    @Autowired
    private PurchaseOrderDocService purchaseOrderDocService;

    /**
     * 查询指定订单的历史单据列表（按上传时间倒序）
     */
    @GetMapping("/docs")
    public Result<java.util.List<PurchaseOrderDoc>> listDocs(@RequestParam String orderNo) {
        Long tenantId = UserContext.tenantId();
        return Result.success(purchaseOrderDocService.listByOrderNo(tenantId, orderNo));
    }

    /**
     * 支持参数：
     * - scanCode: 扫码查询（需配合orderNo）
     * - myTasks: true表示查询当前用户的采购任务
     * - 其他筛选参数：orderId, styleNo, status等
     *
     * @since 2026-02-01 优化版本
     */
    @GetMapping("/list")
    public Result<?> list(@RequestParam Map<String, Object> params) {
        // 智能路由：扫码查询
        if (params.containsKey("scanCode")) {
            return Result.success(materialPurchaseOrchestrator.getByScanCode(params));
        }

        // 智能路由：我的任务
        if ("true".equals(String.valueOf(params.get("myTasks")))) {
            return Result.success(materialPurchaseOrchestrator.getMyTasks());
        }

        // 默认分页查询（含下单数量enrichment）
        return Result.success(materialPurchaseOrchestrator.listWithEnrichment(params));
    }

    /**
     * 获取采购任务状态统计（不受分页影响）
     * 支持按 materialType / sourceType / orderNo 筛选
     */
    @GetMapping("/stats")
    public Result<?> stats(@RequestParam Map<String, Object> params) {
        return Result.success(materialPurchaseOrchestrator.getStatusStats(params));
    }

    @GetMapping("/{id}")
    public Result<MaterialPurchase> getById(@PathVariable String id) {
        return Result.success(materialPurchaseOrchestrator.getById(id));
    }

    @PostMapping
    public Result<Boolean> save(@RequestBody MaterialPurchase materialPurchase) {
        return Result.success(materialPurchaseOrchestrator.save(materialPurchase));
    }

    @PutMapping
    public Result<Boolean> update(@RequestBody MaterialPurchase materialPurchase) {
        return Result.success(materialPurchaseOrchestrator.update(materialPurchase));
    }

    @PostMapping("/batch")
    public Result<Boolean> batch(@RequestBody List<MaterialPurchase> purchases) {
        return Result.success(materialPurchaseOrchestrator.batch(purchases));
    }

    @PostMapping("/update-arrived-quantity")
    public Result<Boolean> updateArrivedQuantity(@RequestBody Map<String, Object> params) {
        return Result.success(materialPurchaseOrchestrator.updateArrivedQuantity(params));
    }

    @PostMapping("/instruction")
    public Result<MaterialPurchase> createInstruction(@RequestBody Map<String, Object> params) {
        return Result.success(materialPurchaseOrchestrator.createInstruction(params));
    }

    @GetMapping("/demand/preview")
    public Result<?> previewDemand(@RequestParam String orderId) {
        return Result.success(materialPurchaseOrchestrator.previewDemand(orderId));
    }

    @PostMapping("/demand/generate")
    public Result<?> generateDemand(@RequestBody Map<String, Object> params) {
        return Result.success(materialPurchaseOrchestrator.generateDemand(params));
    }

    @PostMapping("/receive")
    public Result<?> receive(@RequestBody Map<String, Object> body) {
        return Result.success(materialPurchaseOrchestrator.receive(body));
    }

    /**
     * 检查当天是否有同款面辅料的可合并采购任务
     * 在领取前调用，提示用户是否合并采购一键领取
     */
    @GetMapping("/check-mergeable")
    public Result<?> checkMergeable(@RequestParam String purchaseId) {
        return Result.success(materialPurchaseOrchestrator.checkMergeable(purchaseId));
    }

    /**
     * 批量领取采购任务（合并采购一键领取）
     * 参数：purchaseIds(数组), receiverId, receiverName
     */
    @PostMapping("/batch-receive")
    public Result<?> batchReceive(@RequestBody Map<String, Object> body) {
        return Result.success(materialPurchaseOrchestrator.batchReceive(body));
    }

    /**
     * 智能一键领取全部（优先使用库存，不足时创建采购）
     * 参数：orderNo(订单号), receiverId, receiverName
     * 返回：{ outboundCount: 3, purchaseCount: 2, details: [...] }
     */
    @PostMapping("/smart-receive-all")
    public Result<?> smartReceiveAll(@RequestBody Map<String, Object> body) {
        return Result.success(materialPurchaseOrchestrator.smartReceiveAll(body));
    }

    /**
     * 确认退货
     */
    @PostMapping("/return-confirm")
    public Result<?> returnConfirm(@RequestBody Map<String, Object> body) {
        return Result.success(materialPurchaseOrchestrator.returnConfirm(body));
    }

    /**
     * 重置退货确认
     */
    @PostMapping("/return-confirm/reset")
    public Result<?> resetReturnConfirm(@RequestBody Map<String, Object> body) {
        return Result.success(materialPurchaseOrchestrator.resetReturnConfirm(body));
    }

    @DeleteMapping("/{id}")
    public Result<Boolean> delete(@PathVariable String id) {
        return Result.success(materialPurchaseOrchestrator.delete(id));
    }

    /**
     * 快速编辑物料采购（备注和预计出货日期）
     */
    @PutMapping("/quick-edit")
    public Result<?> quickEdit(@RequestBody Map<String, Object> payload) {
        String id = (String) payload.get("id");
        String remark = (String) payload.get("remark");
        String expectedShipDate = (String) payload.get("expectedShipDate");

        MaterialPurchase purchase = new MaterialPurchase();
        purchase.setId(id);
        purchase.setRemark(remark);
        if (expectedShipDate != null && !expectedShipDate.isEmpty()) {
            purchase.setExpectedShipDate(java.time.LocalDate.parse(expectedShipDate));
        }

        materialPurchaseOrchestrator.update(purchase);
        return Result.success();
    }

    /**
     * 智能领取预览（仅查询库存状态，不执行操作）
     * 返回每个待采购物料的需求数量、仓库可用数量、已有出库记录
     */
    @GetMapping("/smart-receive-preview")
    public Result<?> smartReceivePreview(@RequestParam String orderNo) {
        return Result.success(materialPurchaseOrchestrator.previewSmartReceive(orderNo));
    }

    /**
     * 仓库单项领取（从仓库出库指定物料指定数量）
     * 参数：{ purchaseId, pickQty, receiverId, receiverName }
     */
    @PostMapping("/warehouse-pick")
    public Result<?> warehousePick(@RequestBody Map<String, Object> body) {
        return Result.success(materialPurchaseOrchestrator.warehousePickSingle(body));
    }

    /**
     * 撤回采购领取/到货登记
     * 将采购单恢复为待处理状态，清空到货数量和领取人
     * 参数：{ purchaseId, reason }
     */
    @PostMapping("/cancel-receive")
    public Result<?> cancelReceive(@RequestBody Map<String, Object> body) {
        return Result.success(materialPurchaseOrchestrator.cancelReceive(body));
    }

    /**
     * 撤销出库单（主管以上权限）
     * 回退库存，恢复采购任务状态
     * 参数：{ pickingId, reason }
     */
    @PostMapping("/cancel-picking")
    public Result<?> cancelPicking(@RequestBody Map<String, Object> body) {
        return Result.success(materialPurchaseOrchestrator.cancelPicking(body));
    }

    /**
     * 上传采购单据图片，AI 自动识别物料信息并与采购任务匹配
     * 支持格式：jpg/png/webp/gif/pdf（≤10MB）
     * 参数：file（multipart）, orderNo（可选，用于精准匹配）
     * 返回：items（识别到的物料行，含 matched/purchaseId/quantity 等）
     */
    @PostMapping(value = "/recognize-doc", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public Result<?> recognizeDoc(
            @RequestParam("file") MultipartFile file,
            @RequestParam(value = "orderNo", required = false) String orderNo) {
        if (file == null || file.isEmpty()) {
            return Result.fail("请上传有效的图片文件");
        }
        long maxBytes = 10L * 1024 * 1024; // 10MB
        if (file.getSize() > maxBytes) {
            return Result.fail("文件大小不能超过 10MB");
        }
        return Result.success(purchaseDocOrchestrator.recognizeDoc(file, orderNo));
    }
}
