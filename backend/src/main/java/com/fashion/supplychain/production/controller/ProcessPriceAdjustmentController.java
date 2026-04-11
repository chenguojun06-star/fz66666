package com.fashion.supplychain.production.controller;

import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.production.entity.ProcessPriceAdjustment;
import com.fashion.supplychain.production.orchestration.ProcessPriceAdjustmentOrchestrator;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;

/**
 * 工序单价调整接口
 *
 * 供小程序「拆菲号」页面的「单价调整」面板使用。
 * 仅管理员可执行调整操作，查询接口对已认证用户开放。
 */
@RestController
@RequestMapping("/api/production/process-price")
@PreAuthorize("isAuthenticated()")
public class ProcessPriceAdjustmentController {

    @Autowired
    private ProcessPriceAdjustmentOrchestrator orchestrator;

    /**
     * 查询订单所有工序及当前单价
     */
    @GetMapping("/processes")
    public Result<List<Map<String, Object>>> queryProcesses(@RequestParam String orderNo) {
        return Result.success(orchestrator.queryProcessesForOrder(orderNo));
    }

    /**
     * 执行工序单价调整（仅管理员）
     */
    @PostMapping("/adjust")
    public Result<Map<String, Object>> adjustPrice(@RequestBody Map<String, Object> body) {
        String orderNo = (String) body.get("orderNo");
        String processName = (String) body.get("processName");
        BigDecimal newPrice = new BigDecimal(String.valueOf(body.get("newPrice")));
        String reason = (String) body.get("reason");

        return Result.success(orchestrator.adjustPrice(orderNo, processName, newPrice, reason));
    }

    /**
     * 查询调整历史记录
     */
    @GetMapping("/history")
    public Result<List<ProcessPriceAdjustment>> queryHistory(@RequestParam String orderNo) {
        return Result.success(orchestrator.queryAdjustmentHistory(orderNo));
    }
}
