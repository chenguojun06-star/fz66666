package com.fashion.supplychain.production.controller;

import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.production.orchestration.CuttingBundleOrchestrator;
import com.fashion.supplychain.production.entity.CuttingBundle;
import com.baomidou.mybatisplus.core.metadata.IPage;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;
import java.util.Map;

@RestController
@RequestMapping("/api/production/cutting")
public class CuttingBundleController {

    @Autowired
    private CuttingBundleOrchestrator cuttingBundleOrchestrator;

    @GetMapping("/list")
    public Result<?> list(@RequestParam Map<String, Object> params) {
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

    @GetMapping("/by-code/{qrCode}")
    public Result<?> getByCode(@PathVariable String qrCode) {
        return Result.success(cuttingBundleOrchestrator.getByCode(qrCode));
    }

    @GetMapping("/by-no")
    public Result<?> getByBundleNo(@RequestParam String orderNo, @RequestParam Integer bundleNo) {
        return Result.success(cuttingBundleOrchestrator.getByBundleNo(orderNo, bundleNo));
    }
}
