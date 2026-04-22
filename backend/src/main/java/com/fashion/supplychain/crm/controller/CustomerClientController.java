package com.fashion.supplychain.crm.controller;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.crm.entity.Customer;
import com.fashion.supplychain.crm.entity.Receivable;
import com.fashion.supplychain.crm.entity.ReceivableReceiptLog;
import com.fashion.supplychain.crm.service.CustomerService;
import com.fashion.supplychain.crm.service.ReceivableReceiptLogService;
import com.fashion.supplychain.crm.service.ReceivableService;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.service.ProductionOrderService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

import java.math.BigDecimal;
import java.util.*;
import java.util.stream.Collectors;

@Slf4j
@RestController
@RequestMapping("/api/crm-client")
public class CustomerClientController {

    @Autowired
    private CustomerService customerService;

    @Autowired
    private ProductionOrderService productionOrderService;

    @Autowired
    private ReceivableService receivableService;

    @Autowired
    private ReceivableReceiptLogService receivableReceiptLogService;

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

        return Result.success(result);
    }

    @GetMapping("/orders/{customerId}")
    public Result<List<Map<String, Object>>> getCustomerOrders(@PathVariable String customerId,
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
            map.put("quantity", order.getQuantity());
            map.put("status", order.getStatus());
            map.put("createTime", order.getCreateTime());
            map.put("deliveryDate", order.getDeliveryDate());
            map.put("factoryName", order.getFactoryName());
            return map;
        }).collect(Collectors.toList());

        return Result.success(result);
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

        LambdaQueryWrapper<Receivable> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(Receivable::getCustomerId, customerId)
                .eq(Receivable::getOrderId, orderId)
                .eq(Receivable::getDeleteFlag, 0);
        List<Receivable> receivables = receivableService.list(wrapper);
        result.put("receivables", receivables);

        return Result.success(result);
    }

    @GetMapping("/receivables/{customerId}")
    public Result<List<Map<String, Object>>> getReceivables(@PathVariable String customerId,
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
            map.put("dueDate", r.getDueDate());
            map.put("status", r.getStatus());
            map.put("orderNo", r.getOrderNo());
            map.put("description", r.getDescription());
            map.put("createTime", r.getCreateTime());
            return map;
        }).collect(Collectors.toList());

        return Result.success(result);
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
