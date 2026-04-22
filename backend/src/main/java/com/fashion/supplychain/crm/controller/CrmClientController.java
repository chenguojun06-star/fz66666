package com.fashion.supplychain.crm.controller;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.crm.entity.Customer;
import com.fashion.supplychain.crm.entity.CustomerClientUser;
import com.fashion.supplychain.crm.entity.Receivable;
import com.fashion.supplychain.crm.entity.ReceivableReceiptLog;
import com.fashion.supplychain.crm.service.CustomerClientUserService;
import com.fashion.supplychain.crm.service.CustomerService;
import com.fashion.supplychain.crm.service.ReceivableReceiptLogService;
import com.fashion.supplychain.crm.service.ReceivableService;
import com.fashion.supplychain.production.entity.MaterialPurchase;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.service.MaterialPurchaseService;
import com.fashion.supplychain.production.service.ProductionOrderService;
import cn.hutool.crypto.SecureUtil;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.*;
import java.util.stream.Collectors;

@Slf4j
@RestController
@RequestMapping("/api/crm-client")
public class CrmClientController {

    @Autowired
    private CustomerService customerService;

    @Autowired
    private CustomerClientUserService customerClientUserService;

    @Autowired
    private ProductionOrderService productionOrderService;

    @Autowired
    private MaterialPurchaseService materialPurchaseService;

    @Autowired
    private ReceivableService receivableService;

    @Autowired
    private ReceivableReceiptLogService receivableReceiptLogService;

    @PostMapping("/login")
    public Result<Map<String, Object>> login(@RequestBody Map<String, String> request) {
        String username = request.get("username");
        String password = request.get("password");

        LambdaQueryWrapper<CustomerClientUser> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(CustomerClientUser::getUsername, username)
                .eq(CustomerClientUser::getDeleteFlag, 0)
                .eq(CustomerClientUser::getStatus, "ACTIVE");
        CustomerClientUser user = customerClientUserService.getOne(wrapper);

        if (user == null) {
            return Result.error("用户不存在或已禁用");
        }

        // 使用Hutool的密码验证
        boolean passwordMatch;
        try {
            passwordMatch = SecureUtil.bcryptCheck(password, user.getPasswordHash());
        } catch (Exception e) {
            // 如果BCrypt验证失败，尝试简单的SHA256验证（用于兼容旧数据）
            passwordMatch = user.getPasswordHash().equals(SecureUtil.sha256(password));
        }

        if (!passwordMatch) {
            return Result.error("密码错误");
        }

        user.setLastLoginTime(LocalDateTime.now());
        customerClientUserService.updateById(user);

        Customer customer = customerService.getById(user.getCustomerId());
        if (customer == null) {
            return Result.error("客户信息不存在");
        }

        Map<String, Object> result = new HashMap<>();
        result.put("token", generateToken(user));
        result.put("customerId", user.getCustomerId());
        result.put("tenantId", user.getTenantId());
        result.put("customer", customer);
        result.put("user", user);

        log.info("客户登录成功: {}, 租户ID: {}", username, user.getTenantId());
        return Result.success(result);
    }

    private String generateToken(CustomerClientUser user) {
        return Base64.getEncoder().encodeToString(
            (user.getId() + ":" + user.getCustomerId() + ":" + System.currentTimeMillis()).getBytes()
        );
    }

    @GetMapping("/dashboard/{customerId}")
    public Result<Map<String, Object>> getDashboard(@PathVariable String customerId) {
        Map<String, Object> result = new HashMap<>();

        Customer customer = customerService.getById(customerId);
        if (customer == null) {
            return Result.error("客户不存在");
        }

        LambdaQueryWrapper<ProductionOrder> orderWrapper = new LambdaQueryWrapper<>();
        orderWrapper.eq(ProductionOrder::getCustomerId, customerId)
                .eq(ProductionOrder::getDeleteFlag, 0)
                .orderByDesc(ProductionOrder::getCreateTime);
        List<ProductionOrder> orders = productionOrderService.list(orderWrapper);

        LambdaQueryWrapper<Receivable> receivableWrapper = new LambdaQueryWrapper<>();
        receivableWrapper.eq(Receivable::getCustomerId, customerId)
                .eq(Receivable::getDeleteFlag, 0);
        List<Receivable> receivables = receivableService.list(receivableWrapper);

        LambdaQueryWrapper<MaterialPurchase> purchaseWrapper = new LambdaQueryWrapper<>();
        purchaseWrapper.eq(MaterialPurchase::getTenantId, customer.getTenantId())
                .in(orders.stream().map(ProductionOrder::getId).collect(Collectors.toList()))
                .eq(MaterialPurchase::getDeleteFlag, 0);
        List<MaterialPurchase> purchases = materialPurchaseService.list(purchaseWrapper);

        BigDecimal totalReceivable = receivables.stream()
                .map(Receivable::getAmount)
                .filter(Objects::nonNull)
                .reduce(BigDecimal.ZERO, BigDecimal::add);

        BigDecimal totalReceived = receivables.stream()
                .map(Receivable::getReceivedAmount)
                .filter(Objects::nonNull)
                .reduce(BigDecimal.ZERO, BigDecimal::add);

        Map<String, Long> orderStats = orders.stream()
                .collect(Collectors.groupingBy(
                        ProductionOrder::getStatus,
                        Collectors.counting()
                ));

        result.put("customer", customer);
        result.put("totalOrders", orders.size());
        result.put("recentOrders", orders.stream().limit(5).collect(Collectors.toList()));
        result.put("orderStats", orderStats);
        result.put("totalReceivable", totalReceivable);
        result.put("totalReceived", totalReceived);
        result.put("outstandingAmount", totalReceivable.subtract(totalReceived));
        result.put("receivablesCount", receivables.size());
        result.put("totalPurchases", purchases.size());

        return Result.success(result);
    }

    @GetMapping("/orders/{customerId}")
    public Result<Map<String, Object>> getCustomerOrders(@PathVariable String customerId,
                                                          @RequestParam(required = false) String status,
                                                          @RequestParam(defaultValue = "1") int page,
                                                          @RequestParam(defaultValue = "20") int pageSize) {
        LambdaQueryWrapper<ProductionOrder> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(ProductionOrder::getCustomerId, customerId)
                .eq(ProductionOrder::getDeleteFlag, 0);
        if (status != null && !status.isEmpty()) {
            wrapper.eq(ProductionOrder::getStatus, status);
        }
        wrapper.orderByDesc(ProductionOrder::getCreateTime);

        List<ProductionOrder> orders = productionOrderService.list(wrapper);

        List<Map<String, Object>> result = orders.stream().map(order -> {
            Map<String, Object> map = new HashMap<>();
            map.put("id", order.getId());
            map.put("orderNo", order.getOrderNo());
            map.put("styleNo", order.getStyleNo());
            map.put("styleName", order.getStyleName());
            map.put("orderQuantity", order.getOrderQuantity());
            map.put("completedQuantity", order.getCompletedQuantity());
            map.put("productionProgress", order.getProductionProgress());
            map.put("status", order.getStatus());
            map.put("createTime", order.getCreateTime());
            map.put("plannedEndDate", order.getPlannedEndDate());
            map.put("expectedShipDate", order.getExpectedShipDate());
            map.put("factoryName", order.getFactoryName());
            map.put("urgencyLevel", order.getUrgencyLevel());
            return map;
        }).collect(Collectors.toList());

        Map<String, Object> pageResult = new HashMap<>();
        pageResult.put("list", result);
        pageResult.put("total", result.size());
        pageResult.put("page", page);
        pageResult.put("pageSize", pageSize);

        return Result.success(pageResult);
    }

    @GetMapping("/orders/{customerId}/{orderId}")
    public Result<Map<String, Object>> getOrderDetail(@PathVariable String customerId,
                                                       @PathVariable String orderId) {
        ProductionOrder order = productionOrderService.getById(orderId);
        if (order == null || !customerId.equals(order.getCustomerId())) {
            return Result.error("订单不存在");
        }

        Map<String, Object> result = new HashMap<>();
        result.put("order", order);

        LambdaQueryWrapper<MaterialPurchase> purchaseWrapper = new LambdaQueryWrapper<>();
        purchaseWrapper.eq(MaterialPurchase::getOrderId, orderId)
                .eq(MaterialPurchase::getDeleteFlag, 0);
        List<MaterialPurchase> purchases = materialPurchaseService.list(purchaseWrapper);
        result.put("purchases", purchases);

        LambdaQueryWrapper<Receivable> receivableWrapper = new LambdaQueryWrapper<>();
        receivableWrapper.eq(Receivable::getCustomerId, customerId)
                .eq(Receivable::getOrderId, orderId)
                .eq(Receivable::getDeleteFlag, 0);
        List<Receivable> receivables = receivableService.list(receivableWrapper);
        result.put("receivables", receivables);

        return Result.success(result);
    }

    @GetMapping("/purchases/{customerId}")
    public Result<Map<String, Object>> getPurchases(@PathVariable String customerId,
                                                     @RequestParam(required = false) String status) {
        Customer customer = customerService.getById(customerId);
        if (customer == null) {
            return Result.error("客户不存在");
        }

        LambdaQueryWrapper<ProductionOrder> orderWrapper = new LambdaQueryWrapper<>();
        orderWrapper.eq(ProductionOrder::getCustomerId, customerId)
                .eq(ProductionOrder::getDeleteFlag, 0);
        List<String> orderIds = productionOrderService.list(orderWrapper)
                .stream()
                .map(ProductionOrder::getId)
                .collect(Collectors.toList());

        LambdaQueryWrapper<MaterialPurchase> purchaseWrapper = new LambdaQueryWrapper<>();
        purchaseWrapper.in(MaterialPurchase::getOrderId, orderIds)
                .eq(MaterialPurchase::getDeleteFlag, 0);
        if (status != null && !status.isEmpty()) {
            purchaseWrapper.eq(MaterialPurchase::getStatus, status);
        }
        purchaseWrapper.orderByDesc(MaterialPurchase::getCreateTime);

        List<MaterialPurchase> purchases = materialPurchaseService.list(purchaseWrapper);

        List<Map<String, Object>> result = purchases.stream().map(purchase -> {
            Map<String, Object> map = new HashMap<>();
            map.put("id", purchase.getId());
            map.put("purchaseNo", purchase.getPurchaseNo());
            map.put("materialName", purchase.getMaterialName());
            map.put("materialCode", purchase.getMaterialCode());
            map.put("materialType", purchase.getMaterialType());
            map.put("specifications", purchase.getSpecifications());
            map.put("purchaseQuantity", purchase.getPurchaseQuantity());
            map.put("arrivedQuantity", purchase.getArrivedQuantity());
            map.put("unitPrice", purchase.getUnitPrice());
            map.put("totalAmount", purchase.getTotalAmount());
            map.put("supplierName", purchase.getSupplierName());
            map.put("status", purchase.getStatus());
            map.put("orderNo", purchase.getOrderNo());
            map.put("styleNo", purchase.getStyleNo());
            map.put("createTime", purchase.getCreateTime());
            map.put("expectedArrivalDate", purchase.getExpectedArrivalDate());
            map.put("actualArrivalDate", purchase.getActualArrivalDate());
            return map;
        }).collect(Collectors.toList());

        Map<String, Object> pageResult = new HashMap<>();
        pageResult.put("list", result);
        pageResult.put("total", result.size());

        return Result.success(pageResult);
    }

    @GetMapping("/purchases/{customerId}/{purchaseId}")
    public Result<Map<String, Object>> getPurchaseDetail(@PathVariable String customerId,
                                                          @PathVariable String purchaseId) {
        Customer customer = customerService.getById(customerId);
        if (customer == null) {
            return Result.error("客户不存在");
        }

        MaterialPurchase purchase = materialPurchaseService.getById(purchaseId);
        if (purchase == null) {
            return Result.error("采购单不存在");
        }

        Map<String, Object> result = new HashMap<>();
        result.put("purchase", purchase);

        if (purchase.getOrderId() != null) {
            ProductionOrder order = productionOrderService.getById(purchase.getOrderId());
            if (order != null && customerId.equals(order.getCustomerId())) {
                result.put("order", order);
            }
        }

        return Result.success(result);
    }

    @GetMapping("/receivables/{customerId}")
    public Result<Map<String, Object>> getReceivables(@PathVariable String customerId,
                                                       @RequestParam(required = false) String status) {
        LambdaQueryWrapper<Receivable> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(Receivable::getCustomerId, customerId)
                .eq(Receivable::getDeleteFlag, 0);
        if (status != null && !status.isEmpty()) {
            wrapper.eq(Receivable::getStatus, status);
        }
        wrapper.orderByDesc(Receivable::getCreateTime);

        List<Receivable> receivables = receivableService.list(wrapper);

        List<Map<String, Object>> result = receivables.stream().map(r -> {
            Map<String, Object> map = new HashMap<>();
            map.put("id", r.getId());
            map.put("receivableNo", r.getReceivableNo());
            map.put("amount", r.getAmount());
            map.put("receivedAmount", r.getReceivedAmount());
            map.put("outstandingAmount", r.getAmount() != null && r.getReceivedAmount() != null 
                ? r.getAmount().subtract(r.getReceivedAmount()) : r.getAmount());
            map.put("dueDate", r.getDueDate());
            map.put("status", r.getStatus());
            map.put("orderNo", r.getOrderNo());
            map.put("description", r.getDescription());
            map.put("createTime", r.getCreateTime());
            return map;
        }).collect(Collectors.toList());

        Map<String, Object> pageResult = new HashMap<>();
        pageResult.put("list", result);
        pageResult.put("total", result.size());

        return Result.success(pageResult);
    }

    @GetMapping("/receivables/{customerId}/{receivableId}")
    public Result<Map<String, Object>> getReceivableDetail(@PathVariable String customerId,
                                                            @PathVariable String receivableId) {
        Receivable receivable = receivableService.getById(receivableId);
        if (receivable == null || !customerId.equals(receivable.getCustomerId())) {
            return Result.error("账款不存在");
        }

        Map<String, Object> result = new HashMap<>();
        result.put("receivable", receivable);

        LambdaQueryWrapper<ReceivableReceiptLog> logWrapper = new LambdaQueryWrapper<>();
        logWrapper.eq(ReceivableReceiptLog::getReceivableId, receivableId)
                .orderByDesc(ReceivableReceiptLog::getReceivedTime);
        List<ReceivableReceiptLog> logs = receivableReceiptLogService.list(logWrapper);
        result.put("receiptLogs", logs);

        return Result.success(result);
    }

    @GetMapping("/profile/{customerId}")
    public Result<Customer> getProfile(@PathVariable String customerId) {
        Customer customer = customerService.getById(customerId);
        if (customer == null) {
            return Result.error("客户不存在");
        }
        return Result.success(customer);
    }
}
