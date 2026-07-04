package com.fashion.supplychain.crm.controller;

import com.baomidou.mybatisplus.core.metadata.IPage;
import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.crm.dto.ApproveSalesReturnRequest;
import com.fashion.supplychain.crm.dto.CreateSalesReturnRequest;
import com.fashion.supplychain.crm.entity.SalesReturn;
import com.fashion.supplychain.crm.entity.SalesReturnItem;
import com.fashion.supplychain.crm.orchestration.SalesReturnOrchestrator;
import jakarta.validation.Valid;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * 销售退货单Controller（P0铁律：≤100行）
 */
@Slf4j
@RestController
@RequestMapping("/api/crm/sales-return")
@PreAuthorize("isAuthenticated()")
public class SalesReturnController {

    @Autowired
    private SalesReturnOrchestrator salesReturnOrchestrator;

    /** 创建退货单 */
    @PostMapping("/create")
    public Result<Long> create(@Valid @RequestBody CreateSalesReturnRequest request) {
        Long returnId = salesReturnOrchestrator.createSalesReturn(request);
        return Result.success(returnId);
    }

    /** 查询退货单列表 */
    @GetMapping("/list")
    public Result<IPage<SalesReturn>> list(@RequestParam Map<String, Object> params) {
        return Result.success(salesReturnOrchestrator.queryPage(params));
    }

    /** 查询退货单详情 */
    @GetMapping("/{id}")
    public Result<Map<String, Object>> getDetail(@PathVariable Long id) {
        Map<String, Object> detail = salesReturnOrchestrator.getDetailById(id);
        return Result.success(detail);
    }

    /** 审核退货单 */
    @PostMapping("/{id}/approve")
    public Result<Void> approve(@PathVariable Long id, @RequestBody ApproveSalesReturnRequest request) {
        request.setReturnId(id);
        salesReturnOrchestrator.approveSalesReturn(request);
        return Result.success();
    }

    /** 拒绝退货单 */
    @PostMapping("/{id}/reject")
    public Result<Void> reject(@PathVariable Long id, @RequestParam String reason) {
        salesReturnOrchestrator.rejectSalesReturn(id, reason);
        return Result.success();
    }

    /** 标记退款完成 */
    @PostMapping("/{id}/refund")
    public Result<Void> markRefunded(@PathVariable Long id) {
        salesReturnOrchestrator.markRefunded(id);
        return Result.success();
    }
}