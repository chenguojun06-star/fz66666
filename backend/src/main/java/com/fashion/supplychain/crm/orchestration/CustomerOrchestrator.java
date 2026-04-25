package com.fashion.supplychain.crm.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.common.tenant.TenantAssert;
import com.fashion.supplychain.crm.entity.Customer;
import com.fashion.supplychain.crm.service.CustomerService;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.service.ProductionOrderService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * CRM 客户管理编排层
 * 负责客户档案 CRUD + 关联订单查询 + 统计数据
 */
@Slf4j
@Service
public class CustomerOrchestrator {

    @Autowired
    private CustomerService customerService;

    @Autowired
    private ProductionOrderService productionOrderService;

    // ─── 查询 ───────────────────────────────────────────────────────────────

    public IPage<Customer> list(Map<String, Object> params) {
        int page     = parseInt(params.get("page"), 1);
        int pageSize = parseInt(params.get("pageSize"), 20);
        String keyword       = (String) params.get("keyword");
        String status        = (String) params.get("status");
        String customerLevel = (String) params.get("customerLevel");

        Long tenantId = currentTenantId();

        LambdaQueryWrapper<Customer> wrapper = new LambdaQueryWrapper<Customer>()
                .eq(Customer::getDeleteFlag, 0)
                .eq(Customer::getTenantId, tenantId)
                .and(StringUtils.hasText(keyword), w -> w
                        .like(Customer::getCompanyName, keyword)
                        .or().like(Customer::getContactPerson, keyword)
                        .or().like(Customer::getContactPhone, keyword))
                .eq(StringUtils.hasText(status), Customer::getStatus, status)
                .eq(StringUtils.hasText(customerLevel), Customer::getCustomerLevel, customerLevel)
                .orderByDesc(Customer::getCreateTime);

        return customerService.page(new Page<>(page, pageSize), wrapper);
    }

    public Customer getById(String id) {
        Long tenantId = currentTenantId();
        return customerService.lambdaQuery()
                .eq(Customer::getId, id)
                .eq(Customer::getTenantId, tenantId)
                .eq(Customer::getDeleteFlag, 0)
                .one();
    }

    /**
     * 查询该客户关联的生产订单
     * 优先按 customer_id 精确匹配，兜底按 company 字段模糊匹配
     */
    public List<ProductionOrder> getCustomerOrders(String customerId) {
        Long tenantId = currentTenantId();
        Customer customer = customerService.lambdaQuery()
                .eq(Customer::getId, customerId)
                .eq(Customer::getTenantId, tenantId)
                .eq(Customer::getDeleteFlag, 0)
                .one();
        if (customer == null) {
            return Collections.emptyList();
        }

        List<ProductionOrder> orders = productionOrderService.list(
                new LambdaQueryWrapper<ProductionOrder>()
                        .eq(ProductionOrder::getDeleteFlag, 0)
                        .eq(ProductionOrder::getTenantId, tenantId)
                        .eq(ProductionOrder::getCustomerId, customerId)
                        .orderByDesc(ProductionOrder::getCreateTime)
                        .last("LIMIT 100"));

        if (orders.isEmpty() && StringUtils.hasText(customer.getCompanyName())) {
            orders = productionOrderService.list(
                    new LambdaQueryWrapper<ProductionOrder>()
                            .eq(ProductionOrder::getDeleteFlag, 0)
                            .eq(ProductionOrder::getTenantId, tenantId)
                            .like(ProductionOrder::getCompany, customer.getCompanyName())
                            .orderByDesc(ProductionOrder::getCreateTime)
                            .last("LIMIT 100"));
        }
        return orders;
    }

    public Map<String, Object> getStats() {
        Long tenantId = currentTenantId();
        LambdaQueryWrapper<Customer> base = new LambdaQueryWrapper<Customer>()
                .eq(Customer::getDeleteFlag, 0)
                .eq(Customer::getTenantId, tenantId);

        long total = customerService.count(base);

        LocalDateTime startOfMonth = LocalDateTime.now()
                .withDayOfMonth(1).withHour(0).withMinute(0).withSecond(0).withNano(0);
        long newThisMonth = customerService.count(
                new LambdaQueryWrapper<Customer>()
                        .eq(Customer::getDeleteFlag, 0)
                        .eq(Customer::getTenantId, tenantId)
                        .ge(Customer::getCreateTime, startOfMonth));

        long vip = customerService.count(
                new LambdaQueryWrapper<Customer>()
                        .eq(Customer::getDeleteFlag, 0)
                        .eq(Customer::getCustomerLevel, "VIP")
                        .eq(Customer::getTenantId, tenantId));

        long activeCount = customerService.count(
                new LambdaQueryWrapper<Customer>()
                        .eq(Customer::getDeleteFlag, 0)
                        .eq(Customer::getStatus, "ACTIVE")
                        .eq(Customer::getTenantId, tenantId));

        long linkedOrderCount = productionOrderService.count(
                new LambdaQueryWrapper<ProductionOrder>()
                        .eq(ProductionOrder::getDeleteFlag, 0)
                        .eq(ProductionOrder::getTenantId, tenantId)
                        .isNotNull(ProductionOrder::getCustomerId));

        Map<String, Object> result = new HashMap<>();
        result.put("total", total);
        result.put("newThisMonth", newThisMonth);
        result.put("vip", vip);
        result.put("activeCount", activeCount);
        result.put("linkedOrderCount", linkedOrderCount);
        return result;
    }

    public List<Customer> listActive() {
        Long tenantId = currentTenantId();
        return customerService.lambdaQuery()
                .eq(Customer::getDeleteFlag, 0)
                .eq(Customer::getTenantId, tenantId)
                .eq(Customer::getStatus, "ACTIVE")
                .orderByDesc(Customer::getCreateTime)
                .last("LIMIT 500")
                .list();
    }

    // ─── 写入 ───────────────────────────────────────────────────────────────

    @Transactional(rollbackFor = Exception.class)
    public Customer save(Customer customer) {
        if (!StringUtils.hasText(customer.getCompanyName())) {
            throw new IllegalArgumentException("公司名称不能为空");
        }
        Long tenantId = currentTenantId();
        UserContext ctx = UserContext.get();
        LocalDateTime now = LocalDateTime.now();
        customer.setCreateTime(now);
        customer.setUpdateTime(now);
        customer.setDeleteFlag(0);
        customer.setTenantId(tenantId);
        if (!StringUtils.hasText(customer.getStatus())) {
            customer.setStatus("ACTIVE");
        }
        if (!StringUtils.hasText(customer.getCustomerLevel())) {
            customer.setCustomerLevel("NORMAL");
        }
        if (!StringUtils.hasText(customer.getCustomerNo())) {
            customer.setCustomerNo("CRM" + DateTimeFormatter.ofPattern("yyyyMMddHHmmssSSS").format(now));
        }
        if (ctx != null) {
            customer.setCreatorId(ctx.getUserId());
            customer.setCreatorName(ctx.getUsername());
        }
        customerService.save(customer);
        log.info("[CRM] 新建客户: id={} company={}", customer.getId(), customer.getCompanyName());
        return customer;
    }

    @Transactional(rollbackFor = Exception.class)
    public void update(Customer customer) {
        if (!StringUtils.hasText(customer.getId())) {
            throw new IllegalArgumentException("客户ID不能为空");
        }
        Long tenantId = currentTenantId();
        Customer existing = customerService.lambdaQuery()
                .eq(Customer::getId, customer.getId())
                .eq(Customer::getTenantId, tenantId)
                .eq(Customer::getDeleteFlag, 0)
                .one();
        if (existing == null) {
            throw new IllegalArgumentException("客户不存在或无权操作");
        }
        customer.setTenantId(tenantId);
        customer.setUpdateTime(LocalDateTime.now());
        customerService.updateById(customer);
        log.info("[CRM] 更新客户: id={}", customer.getId());
    }

    @Transactional(rollbackFor = Exception.class)
    public void delete(String id) {
        if (!StringUtils.hasText(id)) {
            throw new IllegalArgumentException("客户ID不能为空");
        }
        Long tenantId = currentTenantId();
        Customer existing = customerService.lambdaQuery()
                .eq(Customer::getId, id)
                .eq(Customer::getTenantId, tenantId)
                .eq(Customer::getDeleteFlag, 0)
                .one();
        if (existing == null) {
            throw new IllegalArgumentException("客户不存在或无权操作");
        }
        existing.setDeleteFlag(1);
        existing.setUpdateTime(LocalDateTime.now());
        customerService.updateById(existing);
        log.info("[CRM] 删除客户: id={}", id);
    }

    // ─── 工具 ───────────────────────────────────────────────────────────────

    private Long currentTenantId() {
        return TenantAssert.requireTenantId();
    }

    private int parseInt(Object val, int def) {
        if (val == null) return def;
        try { return Integer.parseInt(val.toString()); } catch (NumberFormatException e) { return def; }
    }
}
