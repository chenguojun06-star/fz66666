package com.fashion.supplychain.warehouse.controller;

import com.baomidou.mybatisplus.core.metadata.IPage;
import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.production.entity.ProductOutstock;
import com.fashion.supplychain.warehouse.dto.FinishedInventoryDTO;
import com.fashion.supplychain.production.orchestration.OrderShareOrchestrator;
import com.fashion.supplychain.warehouse.orchestration.FinishedInventoryOrchestrator;
import lombok.RequiredArgsConstructor;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.math.BigDecimal;

import java.util.List;
import java.util.Map;

/**
 * 成品库存管理Controller
 */
@RestController
@RequestMapping("/api/warehouse/finished-inventory")
@RequiredArgsConstructor
@PreAuthorize("isAuthenticated()")
public class FinishedInventoryController {

    private final FinishedInventoryOrchestrator finishedInventoryOrchestrator;
    private final OrderShareOrchestrator orderShareOrchestrator;

    /**
     * 分页查询成品库存
     *
     * @param params 查询参数
     * @return 分页结果
     */
    @PostMapping("/list")
    public Result<IPage<FinishedInventoryDTO>> list(@RequestBody Map<String, Object> params) {
        IPage<FinishedInventoryDTO> page = finishedInventoryOrchestrator.getFinishedInventoryPage(params);
        return Result.success(page);
    }

    /**
     * 兼容GET方式的查询（适配标准列表组件）
     */
    @GetMapping("/list")
    public Result<IPage<FinishedInventoryDTO>> listGet(@RequestParam Map<String, Object> params) {
        IPage<FinishedInventoryDTO> page = finishedInventoryOrchestrator.getFinishedInventoryPage(params);
        return Result.success(page);
    }

    /**
     * 成品出库：扣减SKU库存
     *
     * @param params 包含 items（[{sku, quantity}]）
     */
    @PostMapping("/outbound")
    public Result<Void> outbound(@RequestBody Map<String, Object> params) {
        finishedInventoryOrchestrator.outbound(params);
        return Result.success(null);
    }

    /**
     * QR码扫码批量出库：传入 items 列表（每项含 qrCode 和 quantity），自动剥离序号映射到 skuCode 后出库。
     * 支持分批出库、可填写自定义数量。
     *
     * @param body 包含 items（[{qrCode: "款号-颜色-尺码-序号", quantity: 2}]）
     */
    @PostMapping("/qrcode-outbound")
    public Result<Void> qrcodeOutbound(@RequestBody Map<String, Object> body) {
        finishedInventoryOrchestrator.qrcodeOutbound(body);
        return Result.success(null);
    }

    /**
     * 分页查询出库记录
     */
    @PostMapping("/outstock-records")
    public Result<IPage<ProductOutstock>> outstockRecords(@RequestBody Map<String, Object> params) {
        IPage<ProductOutstock> page = finishedInventoryOrchestrator.listOutstockRecords(params);
        return Result.success(page);
    }

    /**
     * 确认收款
     */
    @PostMapping("/confirm-payment")
    public Result<Void> confirmPayment(@RequestBody Map<String, Object> params) {
        String id = (String) params.get("id");
        Object amountObj = params.get("paidAmount");
        BigDecimal paidAmount = amountObj instanceof Number
                ? BigDecimal.valueOf(((Number) amountObj).doubleValue())
                : new BigDecimal(String.valueOf(amountObj));
        finishedInventoryOrchestrator.confirmPayment(id, paidAmount);
        return Result.success(null);
    }

    /**
     * 生成出库记录分享令牌（按客户名称汇总）
     */
    @PostMapping("/outstock/share-token")
    public Result<Map<String, String>> generateOutstockShareToken(@RequestBody Map<String, String> params) {
        String customerName = params.get("customerName");
        String token = orderShareOrchestrator.generateOutstockShareToken(customerName);
        return Result.success(Map.of("token", token, "shareUrl", "/share/outstock/" + token));
    }
}
