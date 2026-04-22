package com.fashion.supplychain.procurement.controller;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fashion.supplychain.auth.AuthTokenService;
import com.fashion.supplychain.auth.TokenSubject;
import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.finance.entity.MaterialReconciliation;
import com.fashion.supplychain.finance.entity.Payable;
import com.fashion.supplychain.finance.service.MaterialReconciliationService;
import com.fashion.supplychain.finance.service.PayableService;
import com.fashion.supplychain.production.entity.MaterialPurchase;
import com.fashion.supplychain.production.entity.MaterialStock;
import com.fashion.supplychain.production.service.MaterialPurchaseService;
import com.fashion.supplychain.production.service.MaterialStockService;
import com.fashion.supplychain.procurement.entity.SupplierUser;
import com.fashion.supplychain.procurement.service.SupplierUserService;
import com.fashion.supplychain.system.entity.Factory;
import com.fashion.supplychain.system.service.FactoryService;
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
@RequestMapping("/api/supplier-portal")
public class SupplierPortalController {

    private static final String SUPPLIER_ROLE = "supplier";

    @Autowired private SupplierUserService supplierUserService;
    @Autowired private FactoryService factoryService;
    @Autowired private MaterialPurchaseService materialPurchaseService;
    @Autowired private MaterialStockService materialStockService;
    @Autowired private PayableService payableService;
    @Autowired private MaterialReconciliationService materialReconciliationService;
    @Autowired private AuthTokenService authTokenService;
    @Autowired private PasswordEncoder passwordEncoder;

    @PostMapping("/login")
    public Result<Map<String, Object>> login(@RequestBody Map<String, String> request) {
        String username = request.get("username");
        String password = request.get("password");

        if (!StringUtils.hasText(username) || !StringUtils.hasText(password)) {
            return Result.fail("请输入用户名和密码");
        }

        LambdaQueryWrapper<SupplierUser> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(SupplierUser::getUsername, username)
                .eq(SupplierUser::getDeleteFlag, 0)
                .eq(SupplierUser::getStatus, "ACTIVE");
        SupplierUser user = supplierUserService.getOne(wrapper);

        if (user == null) {
            return Result.fail("用户不存在或已禁用");
        }

        boolean passwordMatch;
        try {
            passwordMatch = passwordEncoder.matches(password, user.getPasswordHash());
        } catch (Exception e) {
            log.warn("[供应商门户] 密码校验异常: {}", e.getMessage());
            passwordMatch = false;
        }

        if (!passwordMatch) {
            return Result.fail("密码错误");
        }

        Factory supplier = factoryService.getById(user.getSupplierId());
        if (supplier == null || !"MATERIAL".equals(supplier.getSupplierType())) {
            return Result.fail("供应商信息不存在");
        }

        user.setLastLoginTime(LocalDateTime.now());
        supplierUserService.updateById(user);

        TokenSubject subject = new TokenSubject();
        subject.setUserId(user.getId());
        subject.setUsername(user.getUsername());
        subject.setRoleName(SUPPLIER_ROLE);
        subject.setTenantId(user.getTenantId() != null ? user.getTenantId() : 0L);
        subject.setTenantOwner(false);
        subject.setSuperAdmin(false);
        subject.setPermissionRange("own");
        subject.setPwdVersion(0L);
        subject.setFactoryId(user.getSupplierId());

        String token = authTokenService.issueToken(subject, Duration.ofHours(24));

        Map<String, Object> result = new HashMap<>();
        result.put("token", token);
        result.put("supplierId", user.getSupplierId());
        result.put("tenantId", user.getTenantId());
        result.put("supplier", buildSupplierView(supplier));
        result.put("user", buildUserView(user));

        log.info("[供应商门户] 登录成功: {}, supplierId={}, tenantId={}", username, user.getSupplierId(), user.getTenantId());
        return Result.success(result);
    }

    @GetMapping("/dashboard")
    @PreAuthorize("isAuthenticated()")
    public Result<Map<String, Object>> getDashboard() {
        String supplierId = resolveSupplierId();
        Long tenantId = UserContext.tenantId();
        if (supplierId == null || tenantId == null) {
            return Result.fail("请先登录");
        }

        Factory supplier = factoryService.getById(supplierId);
        if (supplier == null) {
            return Result.fail("供应商不存在");
        }

        LambdaQueryWrapper<MaterialPurchase> purchaseWrapper = new LambdaQueryWrapper<>();
        purchaseWrapper.eq(MaterialPurchase::getSupplierId, supplierId)
                .eq(MaterialPurchase::getTenantId, tenantId)
                .eq(MaterialPurchase::getDeleteFlag, 0);
        List<MaterialPurchase> purchases = materialPurchaseService.list(purchaseWrapper);

        long pendingCount = purchases.stream().filter(p -> "pending".equals(p.getStatus())).count();
        long partialCount = purchases.stream().filter(p -> "partial_arrival".equals(p.getStatus()) || "partial".equals(p.getStatus())).count();
        long completedCount = purchases.stream().filter(p -> "completed".equals(p.getStatus())).count();

        LambdaQueryWrapper<Payable> payableWrapper = new LambdaQueryWrapper<>();
        payableWrapper.eq(Payable::getSupplierId, supplierId)
                .eq(Payable::getTenantId, tenantId)
                .eq(Payable::getDeleteFlag, 0);
        List<Payable> payables = payableService.list(payableWrapper);

        BigDecimal totalPayable = payables.stream().map(Payable::getAmount).filter(Objects::nonNull).reduce(BigDecimal.ZERO, BigDecimal::add);
        BigDecimal totalPaid = payables.stream().map(Payable::getPaidAmount).filter(Objects::nonNull).reduce(BigDecimal.ZERO, BigDecimal::add);

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
                .sorted(Comparator.comparing(MaterialPurchase::getCreateTime, Comparator.nullsLast(Comparator.reverseOrder())))
                .limit(5)
                .map(this::buildPurchaseView)
                .collect(Collectors.toList()));

        return Result.success(result);
    }

    @GetMapping("/purchases")
    @PreAuthorize("isAuthenticated()")
    public Result<Map<String, Object>> getPurchases(
            @RequestParam(required = false) String status,
            @RequestParam(required = false) String keyword) {
        String supplierId = resolveSupplierId();
        Long tenantId = UserContext.tenantId();
        if (supplierId == null || tenantId == null) {
            return Result.fail("请先登录");
        }

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
        wrapper.last("LIMIT 500");
        List<MaterialPurchase> purchases = materialPurchaseService.list(wrapper);

        Map<String, Object> result = new HashMap<>();
        result.put("list", purchases.stream().map(this::buildPurchaseView).collect(Collectors.toList()));
        result.put("total", purchases.size());
        return Result.success(result);
    }

    @GetMapping("/purchases/{purchaseId}")
    @PreAuthorize("isAuthenticated()")
    public Result<Map<String, Object>> getPurchaseDetail(@PathVariable String purchaseId) {
        String supplierId = resolveSupplierId();
        Long tenantId = UserContext.tenantId();
        if (supplierId == null || tenantId == null) {
            return Result.fail("请先登录");
        }

        MaterialPurchase purchase = materialPurchaseService.getById(purchaseId);
        if (purchase == null || !supplierId.equals(purchase.getSupplierId()) || !tenantId.equals(purchase.getTenantId())) {
            return Result.fail("采购单不存在");
        }

        Map<String, Object> result = new HashMap<>();
        result.put("purchase", buildPurchaseView(purchase));
        return Result.success(result);
    }

    @PostMapping("/purchases/{purchaseId}/ship")
    @PreAuthorize("isAuthenticated()")
    public Result<Void> updateShipment(@PathVariable String purchaseId, @RequestBody Map<String, Object> request) {
        String supplierId = resolveSupplierId();
        Long tenantId = UserContext.tenantId();
        if (supplierId == null || tenantId == null) {
            return Result.fail("请先登录");
        }

        MaterialPurchase purchase = materialPurchaseService.getById(purchaseId);
        if (purchase == null || !supplierId.equals(purchase.getSupplierId()) || !tenantId.equals(purchase.getTenantId())) {
            return Result.fail("采购单不存在");
        }

        String newStatus = (String) request.get("status");
        Integer shipQuantity = request.get("shipQuantity") != null ? Integer.parseInt(String.valueOf(request.get("shipQuantity"))) : null;
        String trackingNo = (String) request.get("trackingNo");
        String expressCompany = (String) request.get("expressCompany");
        String remark = (String) request.get("remark");

        if (StringUtils.hasText(newStatus)) {
            if ("partial_arrival".equals(newStatus) || "shipped".equals(newStatus)) {
                purchase.setStatus("partial_arrival");
            } else if ("completed".equals(newStatus)) {
                purchase.setStatus("completed");
                purchase.setActualArrivalDate(LocalDateTime.now());
            }
        }

        if (shipQuantity != null) {
            int currentArrived = purchase.getArrivedQuantity() != null ? purchase.getArrivedQuantity() : 0;
            purchase.setArrivedQuantity(currentArrived + shipQuantity);
        }

        if (StringUtils.hasText(remark)) {
            String existingRemark = purchase.getRemark() != null ? purchase.getRemark() : "";
            purchase.setRemark(existingRemark + "\n[供应商发货] " + remark);
        }

        materialPurchaseService.updateById(purchase);

        log.info("[供应商门户] 发货更新: purchaseId={}, supplierId={}, status={}", purchaseId, supplierId, purchase.getStatus());
        return Result.success(null);
    }

    @GetMapping("/inventory")
    @PreAuthorize("isAuthenticated()")
    public Result<Map<String, Object>> getInventory(
            @RequestParam(required = false) String keyword,
            @RequestParam(required = false) String alert) {
        String supplierId = resolveSupplierId();
        Long tenantId = UserContext.tenantId();
        if (supplierId == null || tenantId == null) {
            return Result.fail("请先登录");
        }

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
        wrapper.last("LIMIT 500");
        List<MaterialStock> stocks = materialStockService.list(wrapper);

        Map<String, Object> result = new HashMap<>();
        result.put("list", stocks.stream().map(this::buildStockView).collect(Collectors.toList()));
        result.put("total", stocks.size());
        return Result.success(result);
    }

    @GetMapping("/payables")
    @PreAuthorize("isAuthenticated()")
    public Result<Map<String, Object>> getPayables(@RequestParam(required = false) String status) {
        String supplierId = resolveSupplierId();
        Long tenantId = UserContext.tenantId();
        if (supplierId == null || tenantId == null) {
            return Result.fail("请先登录");
        }

        LambdaQueryWrapper<Payable> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(Payable::getSupplierId, supplierId)
                .eq(Payable::getTenantId, tenantId)
                .eq(Payable::getDeleteFlag, 0);
        if (StringUtils.hasText(status)) {
            wrapper.eq(Payable::getStatus, status);
        }
        wrapper.orderByDesc(Payable::getCreateTime);
        wrapper.last("LIMIT 500");
        List<Payable> payables = payableService.list(wrapper);

        Map<String, Object> result = new HashMap<>();
        result.put("list", payables.stream().map(this::buildPayableView).collect(Collectors.toList()));
        result.put("total", payables.size());
        return Result.success(result);
    }

    @GetMapping("/reconciliations")
    @PreAuthorize("isAuthenticated()")
    public Result<Map<String, Object>> getReconciliations(@RequestParam(required = false) String status) {
        String supplierId = resolveSupplierId();
        Long tenantId = UserContext.tenantId();
        if (supplierId == null || tenantId == null) {
            return Result.fail("请先登录");
        }

        LambdaQueryWrapper<MaterialReconciliation> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(MaterialReconciliation::getSupplierId, supplierId)
                .eq(MaterialReconciliation::getTenantId, tenantId)
                .eq(MaterialReconciliation::getDeleteFlag, 0);
        if (StringUtils.hasText(status)) {
            wrapper.eq(MaterialReconciliation::getStatus, status);
        }
        wrapper.orderByDesc(MaterialReconciliation::getCreateTime);
        wrapper.last("LIMIT 500");
        List<MaterialReconciliation> recons = materialReconciliationService.list(wrapper);

        Map<String, Object> result = new HashMap<>();
        result.put("list", recons.stream().map(this::buildReconView).collect(Collectors.toList()));
        result.put("total", recons.size());
        return Result.success(result);
    }

    @GetMapping("/profile")
    @PreAuthorize("isAuthenticated()")
    public Result<Map<String, Object>> getProfile() {
        String supplierId = resolveSupplierId();
        Long tenantId = UserContext.tenantId();
        if (supplierId == null || tenantId == null) {
            return Result.fail("请先登录");
        }

        Factory supplier = factoryService.getById(supplierId);
        if (supplier == null) {
            return Result.fail("供应商不存在");
        }
        return Result.success(buildSupplierView(supplier));
    }

    private String resolveSupplierId() {
        String factoryId = UserContext.factoryId();
        if (SUPPLIER_ROLE.equals(UserContext.role()) && factoryId != null) {
            return factoryId;
        }
        return null;
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
        m.put("isLowStock", s.getQuantity() != null && s.getSafetyStock() != null && s.getQuantity() <= s.getSafetyStock());
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
