package com.fashion.supplychain.production.controller;

import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.production.orchestration.CuttingBundleOrchestrator;
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
        // 智能路由：二维码查询
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

    /**
     * @deprecated 已废弃，请使用 GET /list?qrCode=xxx
     * @since 2026-02-01 标记废弃，将在2026-05-01删除
     */
    @Deprecated
    @GetMapping("/by-code/{qrCode}")
    public Result<?> getByCode(@PathVariable String qrCode) {
        return Result.success(cuttingBundleOrchestrator.getByCode(qrCode));
    }

    /**
     * @deprecated 已废弃，请使用 GET /list?orderNo=xxx&bundleNo=xxx
     * @since 2026-02-01 标记废弃，将在2026-05-01删除
     */
    @Deprecated
    @GetMapping("/by-no")
    public Result<?> getByBundleNo(@RequestParam String orderNo, @RequestParam String bundleNo) {
        try {
            Integer bundleNoInt = Integer.parseInt(bundleNo);
            return Result.success(cuttingBundleOrchestrator.getByBundleNo(orderNo, bundleNoInt));
        } catch (NumberFormatException e) {
            return Result.fail("菲号格式错误，必须为数字");
        }
    }
}
