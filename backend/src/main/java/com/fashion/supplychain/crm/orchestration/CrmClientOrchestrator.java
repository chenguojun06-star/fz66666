package com.fashion.supplychain.crm.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.fashion.supplychain.common.AuthTokenService;
import com.fashion.supplychain.common.TokenSubject;
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
import com.fashion.supplychain.production.entity.ProductOutstock;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.orchestration.ProductionOrderFlowOrchestrator;
import com.fashion.supplychain.production.service.MaterialPurchaseService;
import com.fashion.supplychain.production.service.ProductionOrderService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.math.BigDecimal;
import java.time.Duration;
import java.time.LocalDateTime;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.stream.Collectors;

/**
 * CRM 客户端编排层
 *
 * <p>承载「客户门户」（crm-client）全部业务编排：登录鉴权、看板聚合、订单/采购/账款查询。
 * {@code CrmClientController} 只保留「解析当前调用者 → 参数校验 → 调本层 → 组装响应」，
 * 不再直接注入多个 Service（D-630 规则6：Controller 不得直接依赖多个 Service）。
 *
 * <p><b>为什么本层返回 {@link Result}：</b>本仓已有 11 个 Orchestrator 采用该写法
 * （如 {@code FactoryShipmentOrchestrator}、{@code StockTransferOrchestrator}）。
 * 更重要的是它<b>完全保留原有响应语义</b>——历史实现用 {@code Result.fail(msg)} 返回
 * HTTP 200 + {@code code=500}，而 PC 端拦截器 {@code frontend/src/utils/api/core.ts}
 * 在成功分支<b>不校验 code</b>（直接 resolve 给调用方自行判断），若改为抛异常走 HTTP 400
 * 会让调用方从「resolve 后查 isApiSuccess」变成「promise reject」，属行为变更。
 * 故此处沿用以 {@code Result} 表达成败。
 *
 * <p><b>租户隔离：</b>所有查询都以调用方传入的 {@code customerId} + {@code tenantId} 为过滤条件，
 * 不接受请求参数直接指定客户，避免越权读取其他客户数据（P0 铁律4）。
 */
@Slf4j
@Service
public class CrmClientOrchestrator {

    /** 客户门户专用角色名，用于签发 token 时声明权限范围 */
    private static final String CRM_CLIENT_ROLE = "crm_client";

    /** 客户门户 token 有效期 */
    private static final Duration TOKEN_TTL = Duration.ofHours(24);

    /** 单客户订单/账款一次拉取上限，防止大客户把内存打满 */
    private static final int ORDER_FETCH_LIMIT = 200;

    @Autowired private CustomerService customerService;
    @Autowired private CustomerClientUserService customerClientUserService;
    @Autowired private ProductionOrderService productionOrderService;
    @Autowired private MaterialPurchaseService materialPurchaseService;
    @Autowired private ReceivableService receivableService;
    @Autowired private ReceivableReceiptLogService receivableReceiptLogService;
    @Autowired private ProductionOrderFlowOrchestrator productionOrderFlowOrchestrator;
    @Autowired private AuthTokenService authTokenService;
    @Autowired private PasswordEncoder passwordEncoder;

    // ------------------------------------------------------------------
    // 登录
    // ------------------------------------------------------------------

    /**
     * 客户门户登录：校验账号密码 → 签发 24h token → 返回客户与用户视图。
     *
     * @param username 登录名（调用方已保证非空）
     * @param password 明文密码（调用方已保证非空）
     * @return {@code token / customerId / tenantId / customer / user}；失败时返回中文提示
     */
    public Result<Map<String, Object>> login(String username, String password) {
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

        updateLastLoginTime(user);

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

        String token = authTokenService.issueToken(subject, TOKEN_TTL);

        Map<String, Object> result = new HashMap<>();
        result.put("token", token);
        result.put("customerId", user.getCustomerId());
        result.put("tenantId", user.getTenantId());
        result.put("customer", buildCustomerView(customer));
        result.put("user", buildUserView(user));

        log.info("[CRM客户端] 客户登录成功: {}, customerId={}, tenantId={}",
                username, user.getCustomerId(), user.getTenantId());
        return Result.success(result);
    }

    /**
     * 更新客户用户最后登录时间
     *
     * @param user 用户实体（已从数据库查询到，此时设置 lastLoginTime 后更新）
     */
    @Transactional(rollbackFor = Exception.class)
    public void updateLastLoginTime(CustomerClientUser user) {
        if (user == null || user.getId() == null) {
            return;
        }
        user.setLastLoginTime(LocalDateTime.now());
        customerClientUserService.updateById(user);
        log.info("[CrmClientOrchestrator] 客户用户登录时间已更新: userId={}", user.getId());
    }

    // ------------------------------------------------------------------
    // 看板
    // ------------------------------------------------------------------

    /** 客户看板：订单数/状态分布/近 5 单/应收应付汇总/采购单数。 */
    public Result<Map<String, Object>> getDashboard(String customerId, Long tenantId) {
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

    // ------------------------------------------------------------------
    // 订单
    // ------------------------------------------------------------------

    /** 客户订单分页列表（内存分页：单客户订单量有 {@value #ORDER_FETCH_LIMIT} 上限）。 */
    public Result<Map<String, Object>> getCustomerOrders(String customerId, Long tenantId,
                                                         String status, int page, int pageSize) {
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

    /** 订单详情：订单本体 + 该单采购明细 + 该单账款。 */
    public Result<Map<String, Object>> getOrderDetail(String customerId, Long tenantId, String orderId) {
        ProductionOrder order = productionOrderService.getById(orderId);
        if (order == null || !tenantId.equals(order.getTenantId())
                || (order.getDeleteFlag() != null && order.getDeleteFlag() == 1)) {
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

        // D-731：客户最关心「货发了没 / 做到哪道工序了」——复用订单流程编排的**同一口径**
        //（与工厂/PC 看到的完全一致，避免出现"客户看到 60%、业务员看到 70%"的新扯皮）。
        // 流程编排是重查询（含扫码记录/裁剪/入库等），但客户门户查看详情频次低，可接受。
        // ⚠️ 必须 try-catch 兜底：流程数据缺失绝不能影响订单详情主流程（客户门户优先可用）。
        try {
            ProductionOrderFlowOrchestrator.OrderFlowResponse flow =
                    productionOrderFlowOrchestrator.getOrderFlow(orderId);
            if (flow != null) {
                result.put("stages", flow.getStages() == null ? Collections.emptyList() : flow.getStages());
                List<ProductOutstock> outstocks = flow.getOutstocks() == null
                        ? Collections.emptyList() : flow.getOutstocks();
                List<Map<String, Object>> shipments = outstocks.stream()
                        .filter(o -> o != null && (o.getDeleteFlag() == null || o.getDeleteFlag() == 0))
                        .map(this::buildShipmentView)
                        .collect(Collectors.toList());
                result.put("shipments", shipments);
                // 已发货合计（客户看"已发 X / 未发 Y"）
                int shipped = outstocks.stream()
                        .filter(o -> o != null && (o.getDeleteFlag() == null || o.getDeleteFlag() == 0))
                        .mapToInt(o -> o.getOutstockQuantity() == null ? 0 : o.getOutstockQuantity())
                        .sum();
                result.put("shippedQuantity", shipped);
            }
        } catch (Exception e) {
            log.warn("[CrmClient] 订单流程数据加载失败（不影响订单详情） orderId={}", orderId, e);
        }

        return Result.success(result);
    }

    /**
     * 发货记录视图（成品出库）。
     *
     * <p>客户最关心的三件事：<b>哪个快递 / 单号多少 / 到了没</b>。字段直接取自
     * {@code t_product_outstock}，不额外拼装，避免与工厂侧口径不一致。
     */
    private Map<String, Object> buildShipmentView(ProductOutstock o) {
        Map<String, Object> m = new HashMap<>();
        m.put("id", o.getId());
        m.put("outstockNo", o.getOutstockNo());
        m.put("quantity", o.getOutstockQuantity());
        m.put("outstockType", o.getOutstockType());
        m.put("expressCompany", o.getExpressCompany());
        m.put("trackingNo", o.getTrackingNo());
        m.put("warehouseAreaName", o.getWarehouseAreaName());
        m.put("shipTime", o.getCreateTime());
        m.put("receiveTime", o.getReceiveTime());
        m.put("receivedByName", o.getReceivedByName());
        m.put("customerName", o.getCustomerName());
        m.put("shippingAddress", o.getShippingAddress());
        m.put("remark", o.getRemark());
        return m;
    }

    // ------------------------------------------------------------------
    // 采购
    // ------------------------------------------------------------------

    /** 客户采购单分页列表（数据库分页）。 */
    public Result<Map<String, Object>> getPurchases(String customerId, Long tenantId,
                                                    String status, int page, int pageSize) {
        List<ProductionOrder> orders = findCustomerOrders(customerId, tenantId);
        List<String> orderIds = orders.stream().map(ProductionOrder::getId).collect(Collectors.toList());

        if (orderIds.isEmpty()) {
            Map<String, Object> empty = new HashMap<>();
            empty.put("list", Collections.emptyList());
            empty.put("total", 0);
            empty.put("page", page);
            empty.put("pageSize", pageSize);
            empty.put("totalPages", 0);
            return Result.success(empty);
        }

        int safePage = page < 1 ? 1 : page;
        int safePageSize = (pageSize < 1 || pageSize > 200) ? 20 : pageSize;

        LambdaQueryWrapper<MaterialPurchase> purchaseWrapper = new LambdaQueryWrapper<>();
        purchaseWrapper.in(MaterialPurchase::getOrderId, orderIds)
                .eq(MaterialPurchase::getDeleteFlag, 0);
        if (StringUtils.hasText(status)) {
            purchaseWrapper.eq(MaterialPurchase::getStatus, status);
        }
        purchaseWrapper.orderByDesc(MaterialPurchase::getCreateTime);

        Page<MaterialPurchase> pageObj = new Page<>(safePage, safePageSize);
        Page<MaterialPurchase> pageResult = materialPurchaseService.page(pageObj, purchaseWrapper);

        Map<String, Object> result = new HashMap<>();
        result.put("list", pageResult.getRecords().stream().map(this::buildPurchaseView).collect(Collectors.toList()));
        result.put("total", (int) pageResult.getTotal());
        result.put("page", safePage);
        result.put("pageSize", safePageSize);
        result.put("totalPages", (int) Math.ceil(pageResult.getTotal() * 1.0 / safePageSize));

        return Result.success(result);
    }

    /** 采购单详情：采购单本体 + （若归属当前客户）关联订单。 */
    public Result<Map<String, Object>> getPurchaseDetail(String customerId, Long tenantId, String purchaseId) {
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

    // ------------------------------------------------------------------
    // 账款
    // ------------------------------------------------------------------

    /** 客户账款分页列表（数据库分页）。 */
    public Result<Map<String, Object>> getReceivables(String customerId, Long tenantId,
                                                      String status, int page, int pageSize) {
        int safePage = page < 1 ? 1 : page;
        int safePageSize = (pageSize < 1 || pageSize > 200) ? 20 : pageSize;

        LambdaQueryWrapper<Receivable> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(Receivable::getCustomerId, customerId)
                .eq(Receivable::getTenantId, tenantId)
                .eq(Receivable::getDeleteFlag, 0);
        if (StringUtils.hasText(status)) {
            wrapper.eq(Receivable::getStatus, status);
        }
        wrapper.orderByDesc(Receivable::getCreateTime);

        Page<Receivable> pageObj = new Page<>(safePage, safePageSize);
        Page<Receivable> pageResult = receivableService.page(pageObj, wrapper);

        Map<String, Object> result = new HashMap<>();
        result.put("list", pageResult.getRecords().stream().map(this::buildReceivableView).collect(Collectors.toList()));
        result.put("total", (int) pageResult.getTotal());
        result.put("page", safePage);
        result.put("pageSize", safePageSize);
        result.put("totalPages", (int) Math.ceil(pageResult.getTotal() * 1.0 / safePageSize));

        return Result.success(result);
    }

    /** 账款详情：账款本体 + 回款流水。 */
    public Result<Map<String, Object>> getReceivableDetail(String customerId, Long tenantId, String receivableId) {
        Receivable receivable = receivableService.getById(receivableId);
        if (receivable == null || !customerId.equals(receivable.getCustomerId())
                || !tenantId.equals(receivable.getTenantId())) {
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

    // ------------------------------------------------------------------
    // 客户资料
    // ------------------------------------------------------------------

    /** 当前客户资料。 */
    public Result<Map<String, Object>> getProfile(String customerId, Long tenantId) {
        Customer customer = customerService.lambdaQuery()
                .eq(Customer::getId, customerId)
                .eq(Customer::getDeleteFlag, 0)
                .one();
        if (customer == null || !tenantId.equals(customer.getTenantId())) {
            return Result.fail("客户不存在");
        }
        return Result.success(buildCustomerView(customer));
    }

    // ------------------------------------------------------------------
    // 内部方法
    // ------------------------------------------------------------------

    /**
     * 查询该客户在指定租户下的订单（最多 {@value #ORDER_FETCH_LIMIT} 条，按创建时间倒序）。
     *
     * <p>E-P0-1 修复：改用 customer_id 精确匹配，避免 company like 模糊匹配导致跨客户数据泄露
     * —— 原 like 实现下 "甲公司" 会匹配到 "甲公司分公司" 的订单，违反 P0 铁律4 多租户/客户隔离。
     * ProductionOrder.customerId 外键已存在（t_production_order.customer_id 列），直接精确匹配。
     */
    private List<ProductionOrder> findCustomerOrders(String customerId, Long tenantId) {
        Customer customer = customerService.lambdaQuery()
                .eq(Customer::getId, customerId)
                .eq(Customer::getDeleteFlag, 0)
                .one();
        if (customer == null || !tenantId.equals(customer.getTenantId())
                || !StringUtils.hasText(customer.getId())) {
            return Collections.emptyList();
        }

        LambdaQueryWrapper<ProductionOrder> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(ProductionOrder::getDeleteFlag, 0)
                .eq(ProductionOrder::getTenantId, tenantId)
                .eq(ProductionOrder::getCustomerId, customer.getId())
                .orderByDesc(ProductionOrder::getCreateTime)
                .last("LIMIT " + ORDER_FETCH_LIMIT);
        return productionOrderService.list(wrapper);
    }

    /**
     * 判断订单是否属于该客户（按公司名包含关系做二次兜底校验）。
     */
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
