package com.fashion.supplychain.finance.controller;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.finance.entity.OrderReconciliationApproval;
import com.fashion.supplychain.finance.service.OrderReconciliationApprovalService;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.Map;

/**
 * 订单结算审批付款 Controller
 * 处理从订单结算审核过来的付款流程（按工厂汇总）
 */
@Slf4j
@RestController
@RequestMapping("/api/finance/order-reconciliation-approval")
public class OrderReconciliationApprovalController {

    @Autowired
    private OrderReconciliationApprovalService orderReconciliationApprovalService;

    /**
     * 获取审批付款列表
     */
    @GetMapping("/list")
    public Result<Map<String, Object>> list(
            @RequestParam(required = false) String factoryName,
            @RequestParam(required = false) String status,
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "10") int pageSize) {

        LambdaQueryWrapper<OrderReconciliationApproval> wrapper = new LambdaQueryWrapper<>();

        // 筛选条件
        if (factoryName != null && !factoryName.trim().isEmpty()) {
            wrapper.like(OrderReconciliationApproval::getFactoryName, factoryName.trim());
        }
        if (status != null && !status.trim().isEmpty()) {
            wrapper.eq(OrderReconciliationApproval::getStatus, status.trim());
        }

        // 排序：按创建时间倒序
        wrapper.orderByDesc(OrderReconciliationApproval::getCreateTime);

        IPage<OrderReconciliationApproval> iPage = orderReconciliationApprovalService.page(
            new Page<>(page, pageSize),
            wrapper
        );

        Map<String, Object> data = new HashMap<>();
        data.put("records", iPage.getRecords());
        data.put("total", iPage.getTotal());

        return Result.success(data);
    }

    /**
     * 核验（财务验证）
     */
    @PostMapping("/verify")
    public Result<Void> verify(@RequestBody UpdateStatusRequest request) {
        String id = request.getId();
        if (id == null || id.trim().isEmpty()) {
            return Result.fail("ID不能为空");
        }

        OrderReconciliationApproval approval = orderReconciliationApprovalService.getById(id);
        if (approval == null) {
            return Result.fail("记录不存在");
        }

        if (!"pending".equals(approval.getStatus())) {
            return Result.fail("只有待审核状态才能核验");
        }

        approval.setStatus("verified");
        approval.setUpdateTime(LocalDateTime.now());
        approval.setRemark(appendRemark(approval.getRemark(), "核验通过"));

        boolean success = orderReconciliationApprovalService.updateById(approval);
        return success ? Result.success() : Result.fail("核验失败");
    }

    /**
     * 批准（主管批准）
     */
    @PostMapping("/approve")
    public Result<Void> approve(@RequestBody UpdateStatusRequest request) {
        String id = request.getId();
        if (id == null || id.trim().isEmpty()) {
            return Result.fail("ID不能为空");
        }

        OrderReconciliationApproval approval = orderReconciliationApprovalService.getById(id);
        if (approval == null) {
            return Result.fail("记录不存在");
        }

        if (!"verified".equals(approval.getStatus())) {
            return Result.fail("只有已核验状态才能批准");
        }

        String userId = getCurrentUserId();
        approval.setStatus("approved");
        approval.setApprovalTime(LocalDateTime.now());
        approval.setApprovalBy(userId);
        approval.setUpdateTime(LocalDateTime.now());
        approval.setRemark(appendRemark(approval.getRemark(), "批准通过"));

        boolean success = orderReconciliationApprovalService.updateById(approval);
        return success ? Result.success() : Result.fail("批准失败");
    }

    /**
     * 付款（财务付款）
     */
    @PostMapping("/pay")
    public Result<Void> pay(@RequestBody PaymentRequest request) {
        String id = request.getId();
        String paymentMethod = request.getPaymentMethod();

        if (id == null || id.trim().isEmpty()) {
            return Result.fail("ID不能为空");
        }

        OrderReconciliationApproval approval = orderReconciliationApprovalService.getById(id);
        if (approval == null) {
            return Result.fail("记录不存在");
        }

        if (!"approved".equals(approval.getStatus())) {
            return Result.fail("只有已批准状态才能付款");
        }

        String userId = getCurrentUserId();
        approval.setStatus("paid");
        approval.setPaymentTime(LocalDateTime.now());
        approval.setPaymentBy(userId);
        approval.setPaymentMethod(paymentMethod != null ? paymentMethod : "银行转账");
        approval.setUpdateTime(LocalDateTime.now());
        approval.setRemark(appendRemark(approval.getRemark(), "已付款"));

        boolean success = orderReconciliationApprovalService.updateById(approval);
        return success ? Result.success() : Result.fail("付款失败");
    }

    /**
     * 退回（重审）
     */
    @PostMapping("/return")
    public Result<Void> returnToPrevious(@RequestBody ReturnRequest request) {
        String id = request.getId();
        String reason = request.getReason();

        if (id == null || id.trim().isEmpty()) {
            return Result.fail("ID不能为空");
        }

        OrderReconciliationApproval approval = orderReconciliationApprovalService.getById(id);
        if (approval == null) {
            return Result.fail("记录不存在");
        }

        if ("paid".equals(approval.getStatus())) {
            return Result.fail("已付款记录不能退回");
        }

        approval.setStatus("pending");
        approval.setReReviewTime(LocalDateTime.now());
        approval.setReReviewReason(reason);
        approval.setApprovalTime(null);
        approval.setUpdateTime(LocalDateTime.now());
        approval.setRemark(appendRemark(approval.getRemark(), "退回重审: " + reason));

        boolean success = orderReconciliationApprovalService.updateById(approval);
        return success ? Result.success() : Result.fail("退回失败");
    }

    // ========== 辅助方法 ==========

    private String getCurrentUserId() {
        try {
            UserContext ctx = UserContext.get();
            return ctx != null ? ctx.getUserId() : "system";
        } catch (Exception e) {
            return "system";
        }
    }

    private String appendRemark(String existingRemark, String newRemark) {
        String timestamp = LocalDateTime.now().toString();
        String line = "[" + timestamp + "] " + newRemark;
        if (existingRemark == null || existingRemark.trim().isEmpty()) {
            return line;
        }
        return existingRemark + "\n" + line;
    }

    // ========== Request DTOs ==========

    @Data
    public static class UpdateStatusRequest {
        private String id;
    }

    @Data
    public static class PaymentRequest {
        private String id;
        private String paymentMethod; // 银行转账/现金/微信/支付宝
    }

    @Data
    public static class ReturnRequest {
        private String id;
        private String reason;
    }
}
