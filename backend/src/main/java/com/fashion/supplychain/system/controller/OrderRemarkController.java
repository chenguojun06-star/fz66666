package com.fashion.supplychain.system.controller;

import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.system.entity.OrderRemark;
import com.fashion.supplychain.system.orchestration.OrderRemarkOrchestrator;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.util.StringUtils;
import org.springframework.web.bind.annotation.*;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

import lombok.extern.slf4j.Slf4j;

/**
 * 订单/款号/样衣备注 Controller。
 *
 * <p>D-641：原先本类直接注入了 OrderRemarkService / ProductionOrderService /
 * StyleInfoService / StyleOperationLogService / MaterialPurchaseService /
 * PatternProductionService 共 6 个 Service，备注时间线聚合（订单 remarks 拆行、
 * 采购备注合并、款式操作日志 + 三种退回评语、样衣 remarks 拆行）全部写在最外层，
 * 属「Controller 依赖多个 Service」。聚合逻辑已整体下沉到
 * {@link OrderRemarkOrchestrator}，本类只保留端点声明与参数校验。
 */
@Slf4j
@RestController
@RequestMapping("/api/system/order-remark")
@PreAuthorize("isAuthenticated()")
public class OrderRemarkController {

    @Autowired
    private OrderRemarkOrchestrator orderRemarkOrchestrator;

    @PostMapping("/list")
    public Result<List<OrderRemark>> list(@RequestBody Map<String, Object> params) {
        String targetType = (String) params.get("targetType");
        String targetNo = (String) params.get("targetNo");
        if (!StringUtils.hasText(targetType) || !StringUtils.hasText(targetNo)) {
            return Result.fail("targetType 和 targetNo 不能为空");
        }
        return Result.success(orderRemarkOrchestrator.listRemarks(targetType, targetNo));
    }

    @PostMapping("/add")
    public Result<OrderRemark> add(@RequestBody OrderRemark remark) {
        if (!StringUtils.hasText(remark.getTargetType()) || !StringUtils.hasText(remark.getTargetNo())) {
            return Result.fail("targetType 和 targetNo 不能为空");
        }
        if (!StringUtils.hasText(remark.getContent())) {
            return Result.fail("备注内容不能为空");
        }

        // 写操作统一走 Orchestrator，确保事务一致性与多租户上下文校验
        OrderRemark saved = orderRemarkOrchestrator.save(remark);
        return Result.success(saved);
    }

    @PostMapping("/batch-latest")
    public Result<Map<String, String>> batchLatest(@RequestBody Map<String, Object> params) {
        String targetType = (String) params.get("targetType");
        @SuppressWarnings("unchecked")
        List<String> targetNos = (List<String>) params.get("targetNos");
        if (!StringUtils.hasText(targetType) || targetNos == null || targetNos.isEmpty()) {
            return Result.success(new HashMap<>());
        }
        return Result.success(orderRemarkOrchestrator.batchLatest(targetType, targetNos));
    }
}
