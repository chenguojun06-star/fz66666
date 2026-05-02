package com.fashion.supplychain.production.controller;

import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.production.dto.CuttingBundleSplitRollbackRequest;
import com.fashion.supplychain.production.dto.CuttingBundleSplitTransferRequest;
import com.fashion.supplychain.production.orchestration.CuttingBundleOrchestrator;
import com.fashion.supplychain.production.orchestration.CuttingBundleSplitTransferOrchestrator;
import com.fashion.supplychain.production.entity.CuttingBundle;
import com.baomidou.mybatisplus.core.metadata.IPage;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;
import java.util.Map;

@RestController
@RequestMapping("/api/production/cutting")
@PreAuthorize("isAuthenticated()")
public class CuttingBundleController {

    @Autowired
    private CuttingBundleOrchestrator cuttingBundleOrchestrator;

    @Autowired
    private CuttingBundleSplitTransferOrchestrator cuttingBundleSplitTransferOrchestrator;

    /**
     * 【新版统一查询】分页查询菲号列表
     * 支持参数：
     * - qrCode: 二维码查询
     * - bundleNo: 菲号查询（需配合orderNo）
     * - 其他筛选参数：orderId, taskId等
     *
     * @since 2026-02-01 优化版本
     */
    @GetMapping("/list")
    public Result<?> list(@RequestParam Map<String, Object> params) {
        // 工厂账号数据隔离：CuttingBundleOrchestrator.doList() 已内部处理 factoryId 过滤，无需重复添加
        if (params.containsKey("qrCode")) {
            String qrCode = String.valueOf(params.get("qrCode"));
            return Result.success(cuttingBundleOrchestrator.getByCode(qrCode));
        }

        // 智能路由：菲号查询
        if (params.containsKey("bundleNo") && params.containsKey("orderNo")) {
            String orderNo = String.valueOf(params.get("orderNo"));
            String bundleNo = String.valueOf(params.get("bundleNo"));
            try {
                Integer bundleNoInt = Integer.parseInt(bundleNo);
                return Result.success(cuttingBundleOrchestrator.getByBundleNo(orderNo, bundleNoInt));
            } catch (NumberFormatException e) {
                return Result.fail("菲号格式错误，必须为数字");
            }
        }

        IPage<CuttingBundle> page = cuttingBundleOrchestrator.list(params);
        return Result.success(page);
    }

    @GetMapping("/summary")
    public Result<?> summary(@RequestParam(required = false) String orderNo,
            @RequestParam(required = false) String orderId) {
        return Result.success(cuttingBundleOrchestrator.summary(orderNo, orderId));
    }

    @PostMapping("/generate")
    public Result<?> generate(@RequestBody Map<String, Object> body) {
        return Result.success(cuttingBundleOrchestrator.generate(body));
    }

    @PostMapping("/receive")
    public Result<?> receive(@RequestBody Map<String, Object> body) {
        return Result.success(cuttingBundleOrchestrator.receive(body));
    }

    @PostMapping("/split-transfer")
    public Result<?> splitTransfer(@RequestBody CuttingBundleSplitTransferRequest request) {
        return Result.success(cuttingBundleSplitTransferOrchestrator.splitAndTransfer(request));
    }

    @PostMapping("/split-rollback")
    public Result<?> splitRollback(@RequestBody CuttingBundleSplitRollbackRequest request) {
        return Result.success(cuttingBundleSplitTransferOrchestrator.rollbackSplit(request));
    }

    @PostMapping("/by-code")
    public Result<?> getByCode(@RequestBody Map<String, String> body) {
        String qrCode = body != null ? body.get("qrCode") : null;
        if (qrCode == null || qrCode.isEmpty()) {
            return Result.fail("qrCode 不能为空");
        }
        return Result.success(cuttingBundleOrchestrator.getByCode(qrCode));
    }

    @GetMapping("/family/{bundleId}")
    public Result<?> family(@PathVariable String bundleId) {
        return Result.success(cuttingBundleSplitTransferOrchestrator.queryFamily(bundleId));
    }

}
