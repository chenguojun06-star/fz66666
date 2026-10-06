package com.fashion.supplychain.production.controller;

import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.production.entity.MaterialRoll;
import com.fashion.supplychain.production.orchestration.MaterialRollOrchestrator;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;

/**
 * 面辅料料卷 Controller
 *
 * 提供：
 *  1. 为入库单生成料卷 QR 标签
 *  2. 查询入库单下所有料卷
 *  3. 扫码处理（发料/退回/查询）- 供小程序调用
 */
@Slf4j
@RestController
@RequestMapping("/api/production/material/roll")
@PreAuthorize("isAuthenticated()")
public class MaterialRollController {

    @Autowired
    private MaterialRollOrchestrator materialRollOrchestrator;

    /**
     * 为入库单批量生成料卷 QR 标签
     *
     * <p>两种入参模式，二选一：</p>
     * <ul>
     *   <li>逐卷明细（推荐，各卷数量可不同）：
     *       { "inboundId":"xxx", "rolls":[{"quantity":50},{"quantity":48.5},{"quantity":52}], "unit":"米" }</li>
     *   <li>快捷平均（所有卷数量相同）：
     *       { "inboundId":"xxx", "rollCount":5, "quantityPerRoll":30.5, "unit":"米" }</li>
     * </ul>
     */
    @PostMapping("/generate")
    public Result<?> generateRolls(@RequestBody Map<String, Object> params) {
        try {
            String inboundId = (String) params.get("inboundId");
            String unit = (String) params.getOrDefault("unit", "件");

            List<BigDecimal> rollQuantities = parseRollQuantities(params.get("rolls"));
            List<Map<String, Object>> rolls;
            if (rollQuantities != null && !rollQuantities.isEmpty()) {
                // 逐卷明细模式
                rolls = materialRollOrchestrator.generateRollsDetailed(inboundId, rollQuantities, unit);
            } else {
                // 快捷平均模式（向后兼容）
                int rollCount = ((Number) params.getOrDefault("rollCount", 1)).intValue();
                double quantityPerRoll = ((Number) params.getOrDefault("quantityPerRoll", 1.0)).doubleValue();
                rolls = materialRollOrchestrator.generateRolls(inboundId, rollCount, quantityPerRoll, unit);
            }
            return Result.success(rolls);
        } catch (Exception e) {
            log.error("生成料卷标签失败", e);
            return Result.fail(e.getMessage());
        }
    }

    /** 解析逐卷明细入参：[{quantity:50},{quantity:48.5}] → [50, 48.5] */
    private List<BigDecimal> parseRollQuantities(Object rollsObj) {
        if (!(rollsObj instanceof List)) {
            return null;
        }
        List<BigDecimal> quantities = new java.util.ArrayList<>();
        for (Object item : (List<?>) rollsObj) {
            BigDecimal qty = null;
            if (item instanceof Map) {
                Object q = ((Map<?, ?>) item).get("quantity");
                if (q != null) {
                    qty = new BigDecimal(String.valueOf(q));
                }
            } else if (item != null) {
                qty = new BigDecimal(String.valueOf(item));
            }
            quantities.add(qty);
        }
        return quantities;
    }

    /**
     * 查询入库单下所有料卷
     * POST /api/production/material/roll/list  body: { "inboundId": "xxx" }
     */
    @PostMapping("/list")
    public Result<?> listByInboundPost(@RequestBody Map<String, String> params) {
        String inboundId = params != null ? params.get("inboundId") : null;
        if (inboundId == null || inboundId.isBlank()) {
            return Result.fail("inboundId不能为空");
        }
        List<MaterialRoll> rolls = materialRollOrchestrator.listRollsByInbound(inboundId);
        return Result.success(rolls);
    }

    /** @deprecated 使用 POST /list 替代 */
    @Deprecated // 计划于 2026-08-10 移除，请使用新端点替代
    @GetMapping("/by-inbound/{inboundId}")
    public Result<?> listByInbound(@PathVariable String inboundId) {
        List<MaterialRoll> rolls = materialRollOrchestrator.listRollsByInbound(inboundId);
        return Result.success(rolls);
    }

    /**
     * 扫码处理（小程序↔PC 通用）
     *
     * Body: {
     *   "rollCode":      "MR202602190001",   // 二维码扫描结果
     *   "action":        "issue",            // issue=发料 | return=退回 | query=仅查询
     *   "cuttingOrderNo": "CO20260219001",   // 可选，发料时填
     *   "operatorId":    "xxx",
     *   "operatorName":  "王仓管"
     * }
     */
    @PostMapping("/scan")
    @PreAuthorize("isAuthenticated()")   // 仓管/工人角色均可扫码，无需专项权限
    public Result<?> scan(@RequestBody Map<String, Object> params) {
        try {
            String rollCode = (String) params.get("rollCode");
            String action = (String) params.getOrDefault("action", "query");
            String cuttingOrderNo = (String) params.get("cuttingOrderNo");
            String operatorId = (String) params.get("operatorId");
            String operatorName = (String) params.get("operatorName");

            Map<String, Object> result = materialRollOrchestrator.scanRoll(
                    rollCode, action, cuttingOrderNo, operatorId, operatorName);
            return Result.success(result);
        } catch (Exception e) {
            log.error("料卷扫码处理失败", e);
            return Result.fail(e.getMessage());
        }
    }
}
