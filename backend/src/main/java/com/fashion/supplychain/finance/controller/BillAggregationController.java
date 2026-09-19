package com.fashion.supplychain.finance.controller;

import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.finance.entity.BillAggregation;
import com.fashion.supplychain.finance.orchestration.BillAggregationOrchestrator;
import com.fashion.supplychain.finance.orchestration.BillAggregationOrchestrator.BillPushRequest;
import com.fashion.supplychain.finance.orchestration.BillAggregationOrchestrator.BillQueryRequest;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/finance/bill-aggregation")
@PreAuthorize("isAuthenticated()")
public class BillAggregationController {

    @Autowired
    private BillAggregationOrchestrator billAggregationOrchestrator;

    @Autowired(required = false)
    private org.springframework.data.redis.core.StringRedisTemplate stringRedisTemplate;

    /** 推送账单（各模块内部调用，也可手动触发） */
    @PreAuthorize("isAuthenticated()")
    @PostMapping("/push")
    public Result<BillAggregation> pushBill(@RequestBody BillPushRequest request) {
        return Result.success(billAggregationOrchestrator.pushBill(request));
    }

    /** 分页查询账单列表 */
    @PreAuthorize("isAuthenticated()")
    @PostMapping("/list")
    public Result<Page<BillAggregation>> listBills(@RequestBody BillQueryRequest query) {
        return Result.success(billAggregationOrchestrator.listBills(query));
    }

    /** 统计各状态汇总 */
    @PreAuthorize("isAuthenticated()")
    @GetMapping("/stats")
    public Result<Map<String, Object>> getStats(@RequestParam(required = false) String billType) {
        return Result.success(billAggregationOrchestrator.getStats(billType));
    }

    /** 确认账单 */
    @PreAuthorize("isAuthenticated()")
    @PostMapping("/{id}/confirm")
    public Result<Void> confirmBill(@PathVariable String id) {
        billAggregationOrchestrator.confirmBill(id);
        return Result.success(null);
    }

    /** 批量确认 */
    @PreAuthorize("isAuthenticated()")
    @PostMapping("/batch-confirm")
    public Result<Integer> batchConfirm(@RequestBody List<String> billIds) {
        return Result.success(billAggregationOrchestrator.batchConfirm(billIds));
    }

    /** 结清账单 */
    @PreAuthorize("isAuthenticated()")
    @PostMapping("/{id}/settle")
    public Result<Void> settleBill(@PathVariable String id,
                                   @RequestParam(required = false) BigDecimal settledAmount) {
        billAggregationOrchestrator.settleBill(id, settledAmount);
        return Result.success(null);
    }

    /** D-474：最近一次数据一致性自检结果（供页面展示，财务不翻日志也能看到自检状态） */
    @PreAuthorize("isAuthenticated()")
    @GetMapping("/consistency-status")
public Result<String> getConsistencyStatus() {
        if (stringRedisTemplate == null) {
            return Result.success(null);
        }
        try {
            // key 与 FinanceDataConsistencyJob.CONSISTENCY_LAST_KEY 一致；
            // 这里不引用 Job 类（架构规则禁止 Controller 依赖 Mapper，Job 依赖了 Mapper），
            // 也不在 Controller 里用 ObjectMapper（会被架构规则误判为 Mapper），
            // 直接把 JSON 字符串交给前端解析。
            return Result.success(stringRedisTemplate.opsForValue().get("finance:consistency:last"));
        } catch (Exception e) {
            return Result.success(null);
        }
    }

    /**
     * D-472 往来总账：按往来对象聚合账单（付款中心主列表"一行=一个对象"）。
     * 参数：billType(PAYABLE/RECEIVABLE，可空=全部) / settlementMonth(yyyy-MM，可空) / keyword(对象名模糊，可空)
     */
    @PreAuthorize("isAuthenticated()")
    @PostMapping("/group-by-counterparty")
    public Result<List<BillAggregationOrchestrator.CounterpartyGroupDTO>> listCounterpartyGroups(
            @RequestBody(required = false) Map<String, String> params) {
        String billType = params != null ? params.get("billType") : null;
        String settlementMonth = params != null ? params.get("settlementMonth") : null;
        String keyword = params != null ? params.get("keyword") : null;
        return Result.success(billAggregationOrchestrator.listCounterpartyGroups(billType, settlementMonth, keyword));
    }

    /** D-472 批量结清（详情页批量付款 / 整月合并付款），返回成功笔数 */
    @PreAuthorize("isAuthenticated()")
    @PostMapping("/batch-settle")
    public Result<Integer> batchSettle(@RequestBody List<String> billIds) {
        return Result.success(billAggregationOrchestrator.batchSettle(billIds));
    }

    /** D-472 批量驳回（取消账单），返回成功笔数 */
    @PreAuthorize("isAuthenticated()")
    @PostMapping("/batch-cancel")
    public Result<Integer> batchCancel(@RequestBody Map<String, Object> params) {
        @SuppressWarnings("unchecked")
        List<String> billIds = (List<String>) params.get("billIds");
        Object reason = params.get("reason");
        return Result.success(billAggregationOrchestrator.batchCancel(billIds, reason != null ? reason.toString() : null));
    }

    /** 取消账单 */
    @PreAuthorize("isAuthenticated()")
    @PostMapping("/{id}/cancel")
    public Result<Void> cancelBill(@PathVariable String id,
                                   @RequestParam(required = false) String reason) {
        billAggregationOrchestrator.cancelBill(id, reason);
        return Result.success(null);
    }
}
