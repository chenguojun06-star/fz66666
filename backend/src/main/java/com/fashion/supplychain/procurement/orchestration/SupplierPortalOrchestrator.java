package com.fashion.supplychain.procurement.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.fashion.supplychain.auth.AuthTokenService;
import com.fashion.supplychain.auth.TokenSubject;
import com.fashion.supplychain.finance.entity.MaterialReconciliation;
import com.fashion.supplychain.finance.entity.Payable;
import com.fashion.supplychain.finance.service.MaterialReconciliationService;
import com.fashion.supplychain.finance.service.PayableService;
import com.fashion.supplychain.production.entity.MaterialPurchase;
import com.fashion.supplychain.production.entity.MaterialStock;
import com.fashion.supplychain.production.orchestration.MaterialPurchaseOrchestrator;
import com.fashion.supplychain.production.service.MaterialPurchaseService;
import com.fashion.supplychain.production.service.MaterialStockService;
import com.fashion.supplychain.procurement.entity.SupplierUser;
import com.fashion.supplychain.procurement.service.SupplierUserService;
import com.fashion.supplychain.system.entity.Factory;
import com.fashion.supplychain.system.service.FactoryService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.math.BigDecimal;
import java.time.Duration;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * 供应商门户（supplier-portal）编排层
 *
 * <p>承载供应商自助门户的全部业务编排：登录鉴权、看板聚合、采购单/库存/应付/对账单查询与发货回填。
 * {@code SupplierPortalController} 只保留「解析当前供应商 → 参数校验 → 调本层 → 组装 Result」，
 * 不再直接注入 7 个 Service（D-630 规则6：Controller 不得直接依赖多个 Service）。
 *
 * <p><b>错误约定：</b>域内失败统一抛 {@link IllegalArgumentException}，由
 * {@code GlobalExceptionHandler} 转成 HTTP 400 + {@code Result.fail(400, msg)}。
 * 唯一例外是「非供应商账号访问」的 403 判定 —— 它留在 Controller，因为前端
 * {@code h5-web/src/services/http.js} 对 HTTP 403 会返回固定文案「无权限执行此操作」，
 * 抛出会丢掉后端的中文提示。
 *
 * <p><b>租户/供应商隔离：</b>所有查询都以调用方传入的 {@code supplierId} + {@code tenantId}
 * 为过滤条件，供应商 id 只来自 token，不接受请求参数，避免越权读取其他供应商数据（P0 铁律4）。
 */
@Slf4j
@Service
public class SupplierPortalOrchestrator {

    /** 供应商门户专用角色名 */
    private static final String SUPPLIER_ROLE = "supplier";

    /** 门户 token 有效期 */
    private static final Duration TOKEN_TTL = Duration.ofHours(24);

    /** 看板一次性拉取的采购单/应付单上限，防止大供应商把内存打满 */
    private static final int DASHBOARD_FETCH_LIMIT = 200;

    @Autowired private SupplierUserService supplierUserService;
    @Autowired private SupplierUserOrchestrator supplierUserOrchestrator;
    @Autowired private FactoryService factoryService;
    @Autowired private MaterialPurchaseService materialPurchaseService;
    @Autowired private MaterialPurchaseOrchestrator materialPurchaseOrchestrator;
    @Autowired private MaterialStockService materialStockService;
    @Autowired private PayableService payableService;
    @Autowired private MaterialReconciliationService materialReconciliationService;
    @Autowired private AuthTokenService authTokenService;
    @Autowired private PasswordEncoder passwordEncoder;

    // ------------------------------------------------------------------
    // 登录
    // ------------------------------------------------------------------

    /**
     * 供应商门户登录：校验账号密码 → 校验供应商资质 → 签发 24h token。
     *
     * @param username 登录名（调用方已保证非空）
     * @param password 明文密码（调用方已保证非空）
     * @return {@code token / supplierId / tenantId / supplier / user}
     * @throws IllegalArgumentException 账号不存在、已禁用、密码错误、供应商资质不符或租户信息缺失
     */
    public Map<String, Object> login(String username, String password) {
        LambdaQueryWrapper<SupplierUser> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(SupplierUser::getUsername, username)
                .eq(SupplierUser::getDeleteFlag, 0)
                .eq(SupplierUser::getStatus, "ACTIVE");
        SupplierUser user = supplierUserService.getOne(wrapper);

        if (user == null) {
            throw new IllegalArgumentException("用户不存在或已禁用");
        }

        boolean passwordMatch;
        try {
            passwordMatch = passwordEncoder.matches(password, user.getPasswordHash());
        } catch (Exception e) {
            log.warn("[供应商门户] 密码校验异常: {}", e.getMessage());
            passwordMatch = false;
        }

        if (!passwordMatch) {
            throw new IllegalArgumentException("密码错误");
        }

        Factory supplier = factoryService.getById(user.getSupplierId());
        if (supplier == null || (supplier.getDeleteFlag() != null && supplier.getDeleteFlag() == 1)
                || !isAllowedSupplierType(supplier.getSupplierType())) {
            throw new IllegalArgumentException("供应商信息不存在");
        }

        if (user.getTenantId() == null) {
            throw new IllegalArgumentException("用户租户信息缺失，请联系管理员");
        }

        supplierUserOrchestrator.updateLastLoginTime(user.getId());

        TokenSubject subject = new TokenSubject();
        subject.setUserId(user.getId());
        subject.setUsername(user.getUsername());
        subject.setRoleName(SUPPLIER_ROLE);
        subject.setTenantId(user.getTenantId());
        subject.setTenantOwner(false);
        subject.setSuperAdmin(false);
        subject.setPermissionRange("own");
        subject.setPwdVersion(0L);
        subject.setFactoryId(user.getSupplierId());

        String token = authTokenService.issueToken(subject, TOKEN_TTL);

        Map<String, Object> result = new HashMap<>();
        result.put("token", token);
        result.put("supplierId", user.getSupplierId());
        result.put("tenantId", user.getTenantId());
        result.put("supplier", buildSupplierView(supplier));
        result.put("user", buildUserView(user));

        log.info("[供应商门户] 登录成功: {}, supplierId={}, tenantId={}",
                username, user.getSupplierId(), user.getTenantId());
        return result;
    }

    // ------------------------------------------------------------------
    // 看板
    // ------------------------------------------------------------------

    /**
     * 供应商看板：采购单状态分布 / 应付应付汇总 / 待对账数 / 最近 5 单。
     *
     * @throws IllegalArgumentException 供应商不存在
     */
    public Map<String, Object> getDashboard(String supplierId, Long tenantId) {
        Factory supplier = requireSupplier(supplierId);

        LambdaQueryWrapper<MaterialPurchase> purchaseWrapper = new LambdaQueryWrapper<>();
        purchaseWrapper.eq(MaterialPurchase::getSupplierId, supplierId)
                .eq(MaterialPurchase::getTenantId, tenantId)
                .eq(MaterialPurchase::getDeleteFlag, 0)
                .last("LIMIT " + DASHBOARD_FETCH_LIMIT);
        List<MaterialPurchase> purchases = materialPurchaseService.list(purchaseWrapper);

        long pendingCount = purchases.stream().filter(p -> "pending".equals(p.getStatus())).count();
        long partialCount = purchases.stream()
                .filter(p -> "partial_arrival".equals(p.getStatus()) || "partial".equals(p.getStatus())).count();
        long completedCount = purchases.stream().filter(p -> "completed".equals(p.getStatus())).count();

        LambdaQueryWrapper<Payable> payableWrapper = new LambdaQueryWrapper<>();
        payableWrapper.eq(Payable::getSupplierId, supplierId)
                .eq(Payable::getTenantId, tenantId)
                .eq(Payable::getDeleteFlag, 0)
                .last("LIMIT " + DASHBOARD_FETCH_LIMIT);
        List<Payable> payables = payableService.list(payableWrapper);

        BigDecimal totalPayable = payables.stream().map(Payable::getAmount)
                .filter(Objects::nonNull).reduce(BigDecimal.ZERO, BigDecimal::add);
        BigDecimal totalPaid = payables.stream().map(Payable::getPaidAmount)
                .filter(Objects::nonNull).reduce(BigDecimal.ZERO, BigDecimal::add);

        LambdaQueryWrapper<MaterialReconciliation> reconWrapper = new LambdaQueryWrapper<>();
        reconWrapper.eq(MaterialReconciliation::getSupplierId, supplierId)
                .eq(MaterialReconciliation::getTenantId, tenantId)
                .eq(MaterialReconciliation::getDeleteFlag, 0);
        long pendingReconCount = materialReconciliationService.count(reconWrapper);

        Map<String, Object> result = new HashMap<>();
        result.put("supplier", buildSupplierView(supplier));
        result.put("totalPurchases", purchases.size());
        result.put("pendingPurchases", pendingCount);
        result.put("partialPurchases", partialCount);
        result.put("completedPurchases", completedCount);
        result.put("totalPayable", totalPayable);
        result.put("totalPaid", totalPaid);
        result.put("outstandingPayable", totalPayable.subtract(totalPaid));
        result.put("payablesCount", payables.size());
        result.put("pendingReconciliationCount", pendingReconCount);
        result.put("recentPurchases", purchases.stream()
                .sorted(Comparator.comparing(MaterialPurchase::getCreateTime,
                        Comparator.nullsLast(Comparator.reverseOrder())))
                .limit(5)
                .map(this::buildPurchaseView)
                .collect(Collectors.toList()));

        return result;
    }

    // ------------------------------------------------------------------
    // 采购单
    // ------------------------------------------------------------------

    /**
     * 采购单分页列表（数据库分页，支持状态 + 关键字）。
     */
    public Map<String, Object> getPurchases(String supplierId, Long tenantId,
                                            String status, String keyword, int page, int pageSize) {
        int safePage = page < 1 ? 1 : page;
        int safePageSize = (pageSize < 1 || pageSize > 200) ? 20 : pageSize;

        LambdaQueryWrapper<MaterialPurchase> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(MaterialPurchase::getSupplierId, supplierId)
                .eq(MaterialPurchase::getTenantId, tenantId)
                .eq(MaterialPurchase::getDeleteFlag, 0);
        if (StringUtils.hasText(status)) {
            wrapper.eq(MaterialPurchase::getStatus, status);
        }
        if (StringUtils.hasText(keyword)) {
            wrapper.and(w -> w.like(MaterialPurchase::getMaterialName, keyword)
                    .or().like(MaterialPurchase::getPurchaseNo, keyword)
                    .or().like(MaterialPurchase::getOrderNo, keyword));
        }
        wrapper.orderByDesc(MaterialPurchase::getCreateTime);

        Page<MaterialPurchase> pageObj = new Page<>(safePage, safePageSize);
        Page<MaterialPurchase> pageResult = materialPurchaseService.page(pageObj, wrapper);

        Map<String, Object> result = new HashMap<>();
        result.put("list", pageResult.getRecords().stream()
                .map(this::buildPurchaseView).collect(Collectors.toList()));
        result.put("total", (int) pageResult.getTotal());
        result.put("page", safePage);
        result.put("pageSize", safePageSize);
        result.put("totalPages", (int) Math.ceil(pageResult.getTotal() * 1.0 / safePageSize));
        return result;
    }

    /**
     * 采购单详情（必须归属当前供应商 + 租户）。
     *
     * @throws IllegalArgumentException 采购单不存在或不属于当前供应商
     */
    public Map<String, Object> getPurchaseDetail(String supplierId, Long tenantId, String purchaseId) {
        MaterialPurchase purchase = materialPurchaseService.getById(purchaseId);
        if (purchase == null || !supplierId.equals(purchase.getSupplierId())
                || !tenantId.equals(purchase.getTenantId())) {
            throw new IllegalArgumentException("采购单不存在");
        }

        Map<String, Object> result = new HashMap<>();
        result.put("purchase", buildPurchaseView(purchase));
        return result;
    }

    /**
     * 供应商回填发货信息（状态 / 发货数量 / 物流单号）。
     *
     * @throws IllegalArgumentException 采购单不存在或状态不允许发货（由 MaterialPurchaseOrchestrator 判定）
     */
    public void updateShipment(String purchaseId, String supplierId, Long tenantId,
                               String newStatus, Integer shipQuantity,
                               String trackingNo, String expressCompany, String remark) {
        materialPurchaseOrchestrator.updateShipmentBySupplier(
                purchaseId, supplierId, tenantId, newStatus, shipQuantity,
                trackingNo, expressCompany, remark);
    }

    // ------------------------------------------------------------------
    // 库存
    // ------------------------------------------------------------------

    /**
     * 供应商库存分页列表（支持关键字与低库存告警筛选）。
     */
    public Map<String, Object> getInventory(String supplierId, Long tenantId,
                                            String keyword, String alert, int page, int pageSize) {
        int safePage = page < 1 ? 1 : page;
        int safePageSize = (pageSize < 1 || pageSize > 200) ? 20 : pageSize;

        LambdaQueryWrapper<MaterialStock> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(MaterialStock::getSupplierId, supplierId)
                .eq(MaterialStock::getTenantId, tenantId)
                .eq(MaterialStock::getDeleteFlag, 0);
        if (StringUtils.hasText(keyword)) {
            wrapper.and(w -> w.like(MaterialStock::getMaterialName, keyword)
                    .or().like(MaterialStock::getMaterialCode, keyword));
        }
        if ("low".equals(alert)) {
            wrapper.apply("quantity <= safety_stock");
        }
        wrapper.orderByDesc(MaterialStock::getUpdateTime);

        Page<MaterialStock> pageObj = new Page<>(safePage, safePageSize);
        Page<MaterialStock> pageResult = materialStockService.page(pageObj, wrapper);

        Map<String, Object> result = new HashMap<>();
        result.put("list", pageResult.getRecords().stream()
                .map(this::buildStockView).collect(Collectors.toList()));
        result.put("total", (int) pageResult.getTotal());
        result.put("page", safePage);
        result.put("pageSize", safePageSize);
        result.put("totalPages", (int) Math.ceil(pageResult.getTotal() * 1.0 / safePageSize));
        return result;
    }

    // ------------------------------------------------------------------
    // 应付账款
    // ------------------------------------------------------------------

    /**
     * 供应商应付账款分页列表。
     */
    public Map<String, Object> getPayables(String supplierId, Long tenantId,
                                           String status, int page, int pageSize) {
        int safePage = page < 1 ? 1 : page;
        int safePageSize = (pageSize < 1 || pageSize > 200) ? 20 : pageSize;

        LambdaQueryWrapper<Payable> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(Payable::getSupplierId, supplierId)
                .eq(Payable::getTenantId, tenantId)
                .eq(Payable::getDeleteFlag, 0);
        if (StringUtils.hasText(status)) {
            wrapper.eq(Payable::getStatus, status);
        }
        wrapper.orderByDesc(Payable::getCreateTime);

        Page<Payable> pageObj = new Page<>(safePage, safePageSize);
        Page<Payable> pageResult = payableService.page(pageObj, wrapper);

        Map<String, Object> result = new HashMap<>();
        result.put("list", pageResult.getRecords().stream()
                .map(this::buildPayableView).collect(Collectors.toList()));
        result.put("total", (int) pageResult.getTotal());
        result.put("page", safePage);
        result.put("pageSize", safePageSize);
        result.put("totalPages", (int) Math.ceil(pageResult.getTotal() * 1.0 / safePageSize));
        return result;
    }

    // ------------------------------------------------------------------
    // 对账单
    // ------------------------------------------------------------------

    /**
     * 供应商对账单分页列表。
     */
    public Map<String, Object> getReconciliations(String supplierId, Long tenantId,
                                                  String status, int page, int pageSize) {
        int safePage = page < 1 ? 1 : page;
        int safePageSize = (pageSize < 1 || pageSize > 200) ? 20 : pageSize;

        LambdaQueryWrapper<MaterialReconciliation> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(MaterialReconciliation::getSupplierId, supplierId)
                .eq(MaterialReconciliation::getTenantId, tenantId)
                .eq(MaterialReconciliation::getDeleteFlag, 0);
        if (StringUtils.hasText(status)) {
            wrapper.eq(MaterialReconciliation::getStatus, status);
        }
        wrapper.orderByDesc(MaterialReconciliation::getCreateTime);

        Page<MaterialReconciliation> pageObj = new Page<>(safePage, safePageSize);
        Page<MaterialReconciliation> pageResult = materialReconciliationService.page(pageObj, wrapper);

        Map<String, Object> result = new HashMap<>();
        result.put("list", pageResult.getRecords().stream()
                .map(this::buildReconView).collect(Collectors.toList()));
        result.put("total", (int) pageResult.getTotal());
        result.put("page", safePage);
        result.put("pageSize", safePageSize);
        result.put("totalPages", (int) Math.ceil(pageResult.getTotal() * 1.0 / safePageSize));
        return result;
    }

    // ------------------------------------------------------------------
    // 供应商资料
    // ------------------------------------------------------------------

    /**
     * 当前供应商资料。
     *
     * @throws IllegalArgumentException 供应商不存在或已删除
     */
    public Map<String, Object> getProfile(String supplierId) {
        return buildSupplierView(requireSupplier(supplierId));
    }

    // ------------------------------------------------------------------
    // 内部方法
    // ------------------------------------------------------------------

    /** 按 id 加载未删除的供应商，失败即抛异常。 */
    private Factory requireSupplier(String supplierId) {
        Factory supplier = factoryService.getById(supplierId);
        if (supplier == null || (supplier.getDeleteFlag() != null && supplier.getDeleteFlag() == 1)) {
            throw new IllegalArgumentException("供应商不存在");
        }
        return supplier;
    }

    /**
     * S-P0-1 修复：放宽供应商门户登录的 supplierType 校验。
     *
     * <p>原实现仅允许 MATERIAL（物料供应商）登录，导致 CMT 外发工厂无法登录查看采购单/对账单。
     * 现允许 MATERIAL（物料）、CMT（外发加工）、BOTH（混合）三种类型登录；
     * supplierType 为空时默认允许（兼容历史数据，未设置类型的供应商仍可登录）。
     */
    private boolean isAllowedSupplierType(String supplierType) {
        if (!StringUtils.hasText(supplierType)) {
            return true;
        }
        return Set.of("MATERIAL", "CMT", "BOTH").contains(supplierType);
    }

    private Map<String, Object> buildSupplierView(Factory f) {
        Map<String, Object> m = new HashMap<>();
        m.put("id", f.getId());
        m.put("factoryCode", f.getFactoryCode());
        m.put("factoryName", f.getFactoryName());
        m.put("contactPerson", f.getContactPerson());
        m.put("contactPhone", f.getContactPhone());
        m.put("address", f.getAddress());
        m.put("supplierType", f.getSupplierType());
        m.put("status", f.getStatus());
        return m;
    }

    private Map<String, Object> buildUserView(SupplierUser u) {
        Map<String, Object> m = new HashMap<>();
        m.put("id", u.getId());
        m.put("username", u.getUsername());
        m.put("contactPerson", u.getContactPerson());
        m.put("contactPhone", u.getContactPhone());
        m.put("status", u.getStatus());
        m.put("lastLoginTime", u.getLastLoginTime());
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
        m.put("unit", p.getUnit());
        m.put("purchaseQuantity", p.getPurchaseQuantity());
        m.put("arrivedQuantity", p.getArrivedQuantity());
        m.put("unitPrice", p.getUnitPrice());
        m.put("totalAmount", p.getTotalAmount());
        m.put("status", p.getStatus());
        m.put("orderNo", p.getOrderNo());
        m.put("styleNo", p.getStyleNo());
        m.put("styleName", p.getStyleName());
        m.put("color", p.getColor());
        m.put("createTime", p.getCreateTime());
        m.put("expectedArrivalDate", p.getExpectedArrivalDate());
        m.put("actualArrivalDate", p.getActualArrivalDate());
        m.put("expectedShipDate", p.getExpectedShipDate());
        m.put("remark", p.getRemark());
        m.put("auditStatus", p.getAuditStatus());
        return m;
    }

    private Map<String, Object> buildStockView(MaterialStock s) {
        Map<String, Object> m = new HashMap<>();
        m.put("id", s.getId());
        m.put("materialName", s.getMaterialName());
        m.put("materialCode", s.getMaterialCode());
        m.put("materialType", s.getMaterialType());
        m.put("specifications", s.getSpecifications());
        m.put("unit", s.getUnit());
        m.put("color", s.getColor());
        m.put("quantity", s.getQuantity());
        m.put("lockedQuantity", s.getLockedQuantity());
        m.put("safetyStock", s.getSafetyStock());
        m.put("unitPrice", s.getUnitPrice());
        m.put("totalValue", s.getTotalValue());
        m.put("location", s.getLocation());
        m.put("lastInboundDate", s.getLastInboundDate());
        m.put("lastOutboundDate", s.getLastOutboundDate());
        m.put("isLowStock", s.getQuantity() != null && s.getSafetyStock() != null
                && s.getQuantity().compareTo(BigDecimal.valueOf(s.getSafetyStock())) <= 0);
        return m;
    }

    private Map<String, Object> buildPayableView(Payable p) {
        Map<String, Object> m = new HashMap<>();
        m.put("id", p.getId());
        m.put("payableNo", p.getPayableNo());
        m.put("amount", p.getAmount());
        m.put("paidAmount", p.getPaidAmount());
        m.put("outstandingAmount", p.getAmount() != null && p.getPaidAmount() != null
                ? p.getAmount().subtract(p.getPaidAmount()) : p.getAmount());
        m.put("dueDate", p.getDueDate());
        m.put("status", p.getStatus());
        m.put("orderNo", p.getOrderNo());
        m.put("description", p.getDescription());
        m.put("createTime", p.getCreateTime());
        return m;
    }

    private Map<String, Object> buildReconView(MaterialReconciliation r) {
        Map<String, Object> m = new HashMap<>();
        m.put("id", r.getId());
        m.put("reconciliationNo", r.getReconciliationNo());
        m.put("materialName", r.getMaterialName());
        m.put("quantity", r.getQuantity());
        m.put("unitPrice", r.getUnitPrice());
        m.put("totalAmount", r.getTotalAmount());
        m.put("deductionAmount", r.getDeductionAmount());
        m.put("finalAmount", r.getFinalAmount());
        m.put("status", r.getStatus());
        m.put("purchaseNo", r.getPurchaseNo());
        m.put("orderNo", r.getOrderNo());
        m.put("reconciliationDate", r.getReconciliationDate());
        m.put("createTime", r.getCreateTime());
        return m;
    }
}
