package com.fashion.supplychain.crm.controller;

import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.crm.entity.Customer;
import com.fashion.supplychain.crm.orchestration.CustomerOrchestrator;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

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
}
