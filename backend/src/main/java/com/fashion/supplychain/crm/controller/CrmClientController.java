package com.fashion.supplychain.crm.controller;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fashion.supplychain.auth.AuthTokenService;
import com.fashion.supplychain.auth.TokenSubject;
import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.common.UserContext;
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
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.util.StringUtils;
import org.springframework.web.bind.annotation.*;

import java.math.BigDecimal;
import java.time.Duration;
import java.time.LocalDateTime;
import java.util.*;
import java.util.stream.Collectors;

@Slf4j
@RestController
@RequestMapping("/api/crm-client")
public class CrmClientController {

    private static final String CRM_CLIENT_ROLE = "crm_client";

    @Autowired private CustomerService customerService;
    @Autowired private CustomerClientUserService customerClientUserService;
    @Autowired private ProductionOrderService productionOrderService;
    @Autowired private MaterialPurchaseService materialPurchaseService;
    @Autowired private ReceivableService receivableService;
    @Autowired private ReceivableReceiptLogService receivableReceiptLogService;
    @Autowired private AuthTokenService authTokenService;
    @Autowired private PasswordEncoder passwordEncoder;

    @PostMapping("/login")
    public Result<Map<String, Object>> login(@RequestBody Map<String, String> request) {
        String username = request.get("username");
        String password = request.get("password");

        if (!StringUtils.hasText(username) || !StringUtils.hasText(password)) {
            return Result.fail("请输入用户名和密码");
        }

        LambdaQueryWrapper<CustomerClientUser> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(CustomerClientUser::getUsername, username)
                .eq(CustomerClientUser::getDeleteFlag, 0)
                .eq(CustomerClientUser::getStatus, "ACTIVE");
        CustomerClientUser user = customerClientUserService.getOne(wrapper);

        if (user == null) {
            return Result.fail("用户不存在或已禁用");
        }

        boolean passwordMatch;
        try {
            passwordMatch = passwordEncoder.matches(password, user.getPasswordHash());
        } catch (Exception e) {
            log.warn("[CRM客户端] 密码校验异常: {}", e.getMessage());
            passwordMatch = false;
        }

        if (!passwordMatch) {
            return Result.fail("密码错误");
        }

        Customer customer = customerService.lambdaQuery()
                .eq(Customer::getId, user.getCustomerId())
                .eq(Customer::getDeleteFlag, 0)
                .one();
        if (customer == null) {
            return Result.fail("客户信息不存在");
        }

        user.setLastLoginTime(LocalDateTime.now());
        customerClientUserService.updateById(user);

        TokenSubject subject = new TokenSubject();
        subject.setUserId(user.getId());
        subject.setUsername(user.getUsername());
        subject.setRoleName(CRM_CLIENT_ROLE);
        subject.setTenantId(user.getTenantId() != null ? user.getTenantId() : 0L);
        subject.setTenantOwner(false);
        subject.setSuperAdmin(false);
        subject.setPermissionRange("own");
        subject.setPwdVersion(0L);
        subject.setFactoryId(user.getCustomerId());

        String token = authTokenService.issueToken(subject, Duration.ofHours(24));

        Map<String, Object> result = new HashMap<>();
        result.put("token", token);
        result.put("customerId", user.getCustomerId());
        result.put("tenantId", user.getTenantId());
        result.put("customer", buildCustomerView(customer));
        result.put("user", buildUserView(user));

        log.info("[CRM客户端] 客户登录成功: {}, customerId={}, tenantId={}", username, user.getCustomerId(), user.getTenantId());
        return Result.success(result);
    }

    @GetMapping("/dashboard")
    @PreAuthorize("isAuthenticated()")
    public Result<Map<String, Object>> getDashboard() {
        String customerId = resolveCustomerId();
        Long tenantId = UserContext.tenantId();
        if (customerId == null || tenantId == null) {
            return Result.fail("请先登录");
        }

        Customer customer = customerService.lambdaQuery()
                .eq(Customer::getId, customerId)
                .eq(Customer::getDeleteFlag, 0)
                .one();
        if (customer == null || !tenantId.equals(customer.getTenantId())) {
            return Result.fail("客户信息不存在");
        }

        List<ProductionOrder> orders = findCustomerOrders(customerId, tenantId);

        LambdaQueryWrapper<Receivable> receivableWrapper = new LambdaQueryWrapper<>();
        receivableWrapper.eq(Receivable::getCustomerId, customerId)
                .eq(Receivable::getTenantId, tenantId)
                .eq(Receivable::getDeleteFlag, 0);
        List<Receivable> receivables = receivableService.list(receivableWrapper);

        List<String> orderIds = orders.stream().map(ProductionOrder::getId).collect(Collectors.toList());
        int totalPurchases = 0;
        if (!orderIds.isEmpty()) {
            LambdaQueryWrapper<MaterialPurchase> purchaseWrapper = new LambdaQueryWrapper<>();
            purchaseWrapper.in(MaterialPurchase::getOrderId, orderIds)
                    .eq(MaterialPurchase::getDeleteFlag, 0);
            totalPurchases = (int) materialPurchaseService.count(purchaseWrapper);
        }

        BigDecimal totalReceivable = receivables.stream()
                .map(Receivable::getAmount).filter(Objects::nonNull)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
        BigDecimal totalReceived = receivables.stream()
                .map(Receivable::getReceivedAmount).filter(Objects::nonNull)
                .reduce(BigDecimal.ZERO, BigDecimal::add);

        Map<String, Long> orderStats = orders.stream()
                .collect(Collectors.groupingBy(ProductionOrder::getStatus, Collectors.counting()));

        Map<String, Object> result = new HashMap<>();
        result.put("customer", buildCustomerView(customer));
        result.put("totalOrders", orders.size());
        result.put("recentOrders", orders.stream().limit(5).map(this::buildOrderView).collect(Collectors.toList()));
        result.put("orderStats", orderStats);
        result.put("totalReceivable", totalReceivable);
        result.put("totalReceived", totalReceived);
        result.put("outstandingAmount", totalReceivable.subtract(totalReceived));
        result.put("receivablesCount", receivables.size());
        result.put("totalPurchases", totalPurchases);

        return Result.success(result);
    }

    @GetMapping("/orders")
    @PreAuthorize("isAuthenticated()")
    public Result<Map<String, Object>> getCustomerOrders(
            @RequestParam(required = false) String status,
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "20") int pageSize) {
        String customerId = resolveCustomerId();
        Long tenantId = UserContext.tenantId();
        if (customerId == null || tenantId == null) {
            return Result.fail("请先登录");
        }

        Customer customer = customerService.lambdaQuery()
                .eq(Customer::getId, customerId)
                .eq(Customer::getDeleteFlag, 0)
                .one();
        if (customer == null) {
            return Result.fail("客户不存在");
        }

        List<ProductionOrder> orders = findCustomerOrders(customerId, tenantId);

        if (StringUtils.hasText(status)) {
            orders = orders.stream().filter(o -> status.equals(o.getStatus())).collect(Collectors.toList());
        }

        int total = orders.size();
        int fromIndex = Math.min((page - 1) * pageSize, total);
        int toIndex = Math.min(fromIndex + pageSize, total);
        List<ProductionOrder> paged = orders.subList(fromIndex, toIndex);

        Map<String, Object> pageResult = new HashMap<>();
        pageResult.put("list", paged.stream().map(this::buildOrderView).collect(Collectors.toList()));
        pageResult.put("total", total);
        pageResult.put("page", page);
        pageResult.put("pageSize", pageSize);

        return Result.success(pageResult);
    }

    @GetMapping("/orders/{orderId}")
    @PreAuthorize("isAuthenticated()")
    public Result<Map<String, Object>> getOrderDetail(@PathVariable String orderId) {
        String customerId = resolveCustomerId();
        Long tenantId = UserContext.tenantId();
        if (customerId == null || tenantId == null) {
            return Result.fail("请先登录");
        }

        ProductionOrder order = productionOrderService.getById(orderId);
        if (order == null || !tenantId.equals(order.getTenantId()) || (order.getDeleteFlag() != null && order.getDeleteFlag() == 1)) {
            return Result.fail("订单不存在");
        }

        if (!isOrderBelongsToCustomer(order, customerId)) {
            return Result.fail("订单不存在");
        }

        Map<String, Object> result = new HashMap<>();
        result.put("order", buildOrderView(order));

        LambdaQueryWrapper<MaterialPurchase> purchaseWrapper = new LambdaQueryWrapper<>();
        purchaseWrapper.eq(MaterialPurchase::getOrderId, orderId)
                .eq(MaterialPurchase::getDeleteFlag, 0);
        List<MaterialPurchase> purchases = materialPurchaseService.list(purchaseWrapper);
        result.put("purchases", purchases.stream().map(this::buildPurchaseView).collect(Collectors.toList()));

        LambdaQueryWrapper<Receivable> receivableWrapper = new LambdaQueryWrapper<>();
        receivableWrapper.eq(Receivable::getCustomerId, customerId)
                .eq(Receivable::getOrderId, orderId)
                .eq(Receivable::getDeleteFlag, 0);
        List<Receivable> receivables = receivableService.list(receivableWrapper);
        result.put("receivables", receivables.stream().map(this::buildReceivableView).collect(Collectors.toList()));

        return Result.success(result);
    }

    @GetMapping("/purchases")
    @PreAuthorize("isAuthenticated()")
    public Result<Map<String, Object>> getPurchases(@RequestParam(required = false) String status) {
        String customerId = resolveCustomerId();
        Long tenantId = UserContext.tenantId();
        if (customerId == null || tenantId == null) {
            return Result.fail("请先登录");
        }

        List<ProductionOrder> orders = findCustomerOrders(customerId, tenantId);
        List<String> orderIds = orders.stream().map(ProductionOrder::getId).collect(Collectors.toList());

        if (orderIds.isEmpty()) {
            Map<String, Object> empty = new HashMap<>();
            empty.put("list", Collections.emptyList());
            empty.put("total", 0);
            return Result.success(empty);
        }

        LambdaQueryWrapper<MaterialPurchase> purchaseWrapper = new LambdaQueryWrapper<>();
        purchaseWrapper.in(MaterialPurchase::getOrderId, orderIds)
                .eq(MaterialPurchase::getDeleteFlag, 0);
        if (StringUtils.hasText(status)) {
            purchaseWrapper.eq(MaterialPurchase::getStatus, status);
        }
        purchaseWrapper.orderByDesc(MaterialPurchase::getCreateTime);
        purchaseWrapper.last("LIMIT 500");
        List<MaterialPurchase> purchases = materialPurchaseService.list(purchaseWrapper);

        Map<String, Object> pageResult = new HashMap<>();
        pageResult.put("list", purchases.stream().map(this::buildPurchaseView).collect(Collectors.toList()));
        pageResult.put("total", purchases.size());

        return Result.success(pageResult);
    }

    @GetMapping("/purchases/{purchaseId}")
    @PreAuthorize("isAuthenticated()")
    public Result<Map<String, Object>> getPurchaseDetail(@PathVariable String purchaseId) {
        String customerId = resolveCustomerId();
        Long tenantId = UserContext.tenantId();
        if (customerId == null || tenantId == null) {
            return Result.fail("请先登录");
        }

        MaterialPurchase purchase = materialPurchaseService.getById(purchaseId);
        if (purchase == null || !tenantId.equals(purchase.getTenantId())) {
            return Result.fail("采购单不存在");
        }

        Map<String, Object> result = new HashMap<>();
        result.put("purchase", buildPurchaseView(purchase));

        if (purchase.getOrderId() != null) {
            ProductionOrder order = productionOrderService.getById(purchase.getOrderId());
            if (order != null && isOrderBelongsToCustomer(order, customerId)) {
                result.put("order", buildOrderView(order));
            }
        }

        return Result.success(result);
    }

    @GetMapping("/receivables")
    @PreAuthorize("isAuthenticated()")
    public Result<Map<String, Object>> getReceivables(@RequestParam(required = false) String status) {
        String customerId = resolveCustomerId();
        Long tenantId = UserContext.tenantId();
        if (customerId == null || tenantId == null) {
            return Result.fail("请先登录");
        }

        LambdaQueryWrapper<Receivable> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(Receivable::getCustomerId, customerId)
                .eq(Receivable::getTenantId, tenantId)
                .eq(Receivable::getDeleteFlag, 0);
        if (StringUtils.hasText(status)) {
            wrapper.eq(Receivable::getStatus, status);
        }
        wrapper.orderByDesc(Receivable::getCreateTime);
        wrapper.last("LIMIT 500");
        List<Receivable> receivables = receivableService.list(wrapper);

        Map<String, Object> pageResult = new HashMap<>();
        pageResult.put("list", receivables.stream().map(this::buildReceivableView).collect(Collectors.toList()));
        pageResult.put("total", receivables.size());

        return Result.success(pageResult);
    }

    @GetMapping("/receivables/{receivableId}")
    @PreAuthorize("isAuthenticated()")
    public Result<Map<String, Object>> getReceivableDetail(@PathVariable String receivableId) {
        String customerId = resolveCustomerId();
        Long tenantId = UserContext.tenantId();
        if (customerId == null || tenantId == null) {
            return Result.fail("请先登录");
        }

        Receivable receivable = receivableService.getById(receivableId);
        if (receivable == null || !customerId.equals(receivable.getCustomerId()) || !tenantId.equals(receivable.getTenantId())) {
            return Result.fail("账款不存在");
        }

        Map<String, Object> result = new HashMap<>();
        result.put("receivable", buildReceivableView(receivable));

        LambdaQueryWrapper<ReceivableReceiptLog> logWrapper = new LambdaQueryWrapper<>();
        logWrapper.eq(ReceivableReceiptLog::getReceivableId, receivableId)
                .orderByDesc(ReceivableReceiptLog::getReceivedTime);
        List<ReceivableReceiptLog> logs = receivableReceiptLogService.list(logWrapper);
        result.put("receiptLogs", logs);

        return Result.success(result);
    }

    @GetMapping("/profile")
    @PreAuthorize("isAuthenticated()")
    public Result<Map<String, Object>> getProfile() {
        String customerId = resolveCustomerId();
        Long tenantId = UserContext.tenantId();
        if (customerId == null || tenantId == null) {
            return Result.fail("请先登录");
        }

        Customer customer = customerService.lambdaQuery()
                .eq(Customer::getId, customerId)
                .eq(Customer::getDeleteFlag, 0)
                .one();
        if (customer == null || !tenantId.equals(customer.getTenantId())) {
            return Result.fail("客户不存在");
        }
        return Result.success(buildCustomerView(customer));
    }

    private String resolveCustomerId() {
        String factoryId = UserContext.factoryId();
        if (CRM_CLIENT_ROLE.equals(UserContext.role()) && factoryId != null) {
            return factoryId;
        }
        return null;
    }

    private List<ProductionOrder> findCustomerOrders(String customerId, Long tenantId) {
        Customer customer = customerService.lambdaQuery()
                .eq(Customer::getId, customerId)
                .eq(Customer::getDeleteFlag, 0)
                .one();
        if (customer == null || !tenantId.equals(customer.getTenantId())) {
            return Collections.emptyList();
        }

        LambdaQueryWrapper<ProductionOrder> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(ProductionOrder::getDeleteFlag, 0)
                .eq(ProductionOrder::getTenantId, tenantId);

        if (StringUtils.hasText(customer.getCompanyName())) {
            wrapper.like(ProductionOrder::getCompany, customer.getCompanyName());
        } else {
            return Collections.emptyList();
        }

        wrapper.orderByDesc(ProductionOrder::getCreateTime);
        wrapper.last("LIMIT 200");
        return productionOrderService.list(wrapper);
    }

    private boolean isOrderBelongsToCustomer(ProductionOrder order, String customerId) {
        Customer customer = customerService.lambdaQuery()
                .eq(Customer::getId, customerId)
                .eq(Customer::getDeleteFlag, 0)
                .one();
        if (customer == null || !StringUtils.hasText(customer.getCompanyName())) {
            return false;
        }
        String company = order.getCompany();
        return company != null && company.contains(customer.getCompanyName());
    }

    private Map<String, Object> buildCustomerView(Customer c) {
        Map<String, Object> m = new HashMap<>();
        m.put("id", c.getId());
        m.put("customerNo", c.getCustomerNo());
        m.put("companyName", c.getCompanyName());
        m.put("contactPerson", c.getContactPerson());
        m.put("contactPhone", c.getContactPhone());
        m.put("contactEmail", c.getContactEmail());
        m.put("address", c.getAddress());
        m.put("customerLevel", c.getCustomerLevel());
        m.put("industry", c.getIndustry());
        m.put("status", c.getStatus());
        m.put("remark", c.getRemark());
        return m;
    }

    private Map<String, Object> buildUserView(CustomerClientUser u) {
        Map<String, Object> m = new HashMap<>();
        m.put("id", u.getId());
        m.put("username", u.getUsername());
        m.put("contactPerson", u.getContactPerson());
        m.put("contactPhone", u.getContactPhone());
        m.put("contactEmail", u.getContactEmail());
        m.put("status", u.getStatus());
        m.put("lastLoginTime", u.getLastLoginTime());
        return m;
    }

    private Map<String, Object> buildOrderView(ProductionOrder o) {
        Map<String, Object> m = new HashMap<>();
        m.put("id", o.getId());
        m.put("orderNo", o.getOrderNo());
        m.put("styleNo", o.getStyleNo());
        m.put("styleName", o.getStyleName());
        m.put("orderQuantity", o.getOrderQuantity());
        m.put("completedQuantity", o.getCompletedQuantity());
        m.put("productionProgress", o.getProductionProgress());
        m.put("status", o.getStatus());
        m.put("color", o.getColor());
        m.put("size", o.getSize());
        m.put("createTime", o.getCreateTime());
        m.put("plannedEndDate", o.getPlannedEndDate());
        m.put("expectedShipDate", o.getExpectedShipDate());
        m.put("factoryName", o.getFactoryName());
        m.put("urgencyLevel", o.getUrgencyLevel());
        m.put("company", o.getCompany());
        return m;
    }

    private Map<String, Object> buildPurchaseView(MaterialPurchase p) {
        Map<String, Object> m = new HashMap<>();
        m.put("id", p.getId());
        m.put("purchaseNo", p.getPurchaseNo());
        m.put("materialName", p.getMaterialName());
        m.put("materialCode", p.getMaterialCode());
        m.put("materialType", p.getMaterialType());
        m.put("specifications", p.getSpecifications());
        m.put("purchaseQuantity", p.getPurchaseQuantity());
        m.put("arrivedQuantity", p.getArrivedQuantity());
        m.put("unitPrice", p.getUnitPrice());
        m.put("totalAmount", p.getTotalAmount());
        m.put("supplierName", p.getSupplierName());
        m.put("status", p.getStatus());
        m.put("orderNo", p.getOrderNo());
        m.put("styleNo", p.getStyleNo());
        m.put("createTime", p.getCreateTime());
        m.put("expectedArrivalDate", p.getExpectedArrivalDate());
        m.put("actualArrivalDate", p.getActualArrivalDate());
        return m;
    }

    private Map<String, Object> buildReceivableView(Receivable r) {
        Map<String, Object> m = new HashMap<>();
        m.put("id", r.getId());
        m.put("receivableNo", r.getReceivableNo());
        m.put("amount", r.getAmount());
        m.put("receivedAmount", r.getReceivedAmount());
        m.put("outstandingAmount", r.getAmount() != null && r.getReceivedAmount() != null
                ? r.getAmount().subtract(r.getReceivedAmount()) : r.getAmount());
        m.put("dueDate", r.getDueDate());
        m.put("status", r.getStatus());
        m.put("orderNo", r.getOrderNo());
        m.put("description", r.getDescription());
        m.put("createTime", r.getCreateTime());
        return m;
    }
}
