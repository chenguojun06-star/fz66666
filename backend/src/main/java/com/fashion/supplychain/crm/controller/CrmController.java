package com.fashion.supplychain.crm.controller;

import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.crm.entity.Customer;
import com.fashion.supplychain.crm.entity.Receivable;
import com.fashion.supplychain.crm.orchestration.CustomerOrchestrator;
import com.fashion.supplychain.crm.orchestration.ReceivableOrchestrator;
import com.fashion.supplychain.crm.orchestration.PortalTokenOrchestrator;
import com.fashion.supplychain.crm.entity.CustomerPortalToken;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.math.BigDecimal;
import java.util.Map;

/**
 * CRM 客户管理接口
 * 路由：/api/crm
 */
@Slf4j
@RestController
@RequestMapping("/api/crm")
@PreAuthorize("isAuthenticated()")
public class CrmController {

    @Autowired
    private CustomerOrchestrator customerOrchestrator;

    @Autowired
    private ReceivableOrchestrator receivableOrchestrator;

    @Autowired
    private PortalTokenOrchestrator portalTokenOrchestrator;

    /** 客户列表（分页+搜索） */
    @PostMapping("/customers/list")
    public Result<?> listCustomers(@RequestBody Map<String, Object> params) {
        return Result.success(customerOrchestrator.list(params));
    }

    /** 获取单个客户 */
    @GetMapping("/customers/{id}")
    public Result<Customer> getCustomer(@PathVariable String id) {
        return Result.success(customerOrchestrator.getById(id));
    }

    /** 新建客户 */
    @PostMapping("/customers")
    public Result<Customer> createCustomer(@RequestBody Customer customer) {
        return Result.success(customerOrchestrator.save(customer));
    }

    /** 更新客户 */
    @PutMapping("/customers/{id}")
    public Result<Void> updateCustomer(@PathVariable String id, @RequestBody Customer customer) {
        customer.setId(id);
        customerOrchestrator.update(customer);
        return Result.success(null);
    }

    /** 删除客户（软删除） */
    @DeleteMapping("/customers/{id}")
    public Result<Void> deleteCustomer(@PathVariable String id) {
        customerOrchestrator.delete(id);
        return Result.success(null);
    }

    /** 查询客户关联的历史生产订单 */
    @GetMapping("/customers/{id}/orders")
    public Result<?> getCustomerOrders(@PathVariable String id) {
        return Result.success(customerOrchestrator.getCustomerOrders(id));
    }

    /** 统计数据（总数/本月新增/VIP数量） */
    @GetMapping("/stats")
    public Result<?> getStats() {
        return Result.success(customerOrchestrator.getStats());
    }

    // ──────────────────────────────────────────────────────────────────────
    // 应收账款（AR / Receivable）
    // ──────────────────────────────────────────────────────────────────────

    /** 应收账款列表（分页+过滤） */
    @PostMapping("/receivables/list")
    public Result<?> listReceivables(@RequestBody Map<String, Object> params) {
        return Result.success(receivableOrchestrator.list(params));
    }

    /** 应收账款统计（待收合计/逾期合计/本月新增） */
    @GetMapping("/receivables/stats")
    public Result<?> getReceivableStats() {
        return Result.success(receivableOrchestrator.getStats());
    }

    /** 新建应收单 */
    @PostMapping("/receivables")
    public Result<Receivable> createReceivable(@RequestBody Receivable receivable) {
        return Result.success(receivableOrchestrator.create(receivable));
    }

    /**
     * 登记到账（部分/全额）
     * Body: { "amount": 5000.00 }
     */
    @PostMapping("/receivables/{id}/receive")
    public Result<Void> markReceived(@PathVariable String id,
                                     @RequestBody Map<String, Object> body) {
        Object rawAmount = body.get("amount");
        BigDecimal amount = rawAmount instanceof Number
                ? new BigDecimal(rawAmount.toString())
                : new BigDecimal((String) rawAmount);
        receivableOrchestrator.markReceived(id, amount);
        return Result.success(null);
    }

    /** 删除应收单（软删除） */
    @DeleteMapping("/receivables/{id}")
    public Result<Void> deleteReceivable(@PathVariable String id) {
        receivableOrchestrator.delete(id);
        return Result.success(null);
    }

    // ──────────────────────────────────────────────────────────────────────
    // 客户追踪门户（Portal Token）
    // ──────────────────────────────────────────────────────────────────────

    /**
     * 为指定客户+订单生成追踪链接令牌
     * Body: { "orderId": "xxx" }
     */
    @PostMapping("/customers/{customerId}/portal-link")
    public Result<CustomerPortalToken> generatePortalLink(
            @PathVariable String customerId,
            @RequestBody Map<String, String> body) {
        String orderId = body.get("orderId");
        CustomerPortalToken token = portalTokenOrchestrator.generateToken(customerId, orderId);
        return Result.success(token);
    }
}
