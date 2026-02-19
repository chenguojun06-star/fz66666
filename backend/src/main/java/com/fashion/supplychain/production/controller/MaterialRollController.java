package com.fashion.supplychain.production.controller;

import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.production.entity.MaterialRoll;
import com.fashion.supplychain.production.orchestration.MaterialRollOrchestrator;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

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
     * Body: { "inboundId": "xxx", "rollCount": 5, "quantityPerRoll": 30.5, "unit": "米" }
     */
    @PostMapping("/generate")
    @PreAuthorize("hasAuthority('material:inbound:create')")
    public Result<?> generateRolls(@RequestBody Map<String, Object> params) {
        try {
            String inboundId = (String) params.get("inboundId");
            int rollCount = ((Number) params.getOrDefault("rollCount", 1)).intValue();
            double quantityPerRoll = ((Number) params.getOrDefault("quantityPerRoll", 1.0)).doubleValue();
            String unit = (String) params.getOrDefault("unit", "件");

            List<Map<String, Object>> rolls = materialRollOrchestrator.generateRolls(
                    inboundId, rollCount, quantityPerRoll, unit);
            return Result.success(rolls);
        } catch (Exception e) {
            log.error("生成料卷标签失败", e);
            return Result.fail(e.getMessage());
        }
    }

    /**
     * 查询入库单下所有料卷
     */
    @GetMapping("/by-inbound/{inboundId}")
    @PreAuthorize("hasAuthority('material:inbound:query')")
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
