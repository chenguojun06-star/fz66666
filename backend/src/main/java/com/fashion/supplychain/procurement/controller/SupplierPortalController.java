package com.fashion.supplychain.procurement.controller;

import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.procurement.orchestration.SupplierPortalOrchestrator;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.util.StringUtils;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

/**
 * 供应商自助门户（supplier-portal）接口层。
 *
 * <p><b>职责边界（D-632 重构）：</b>本类只做四件事 ——
 * <ol>
 *   <li>解析当前调用者（{@link #resolveSupplierId()}，读 {@code UserContext}）</li>
 *   <li>参数非空校验</li>
 *   <li>调用 {@link SupplierPortalOrchestrator}</li>
 *   <li>把结果包成 {@link Result}</li>
 * </ol>
 * 全部业务编排（采购单/库存/应付/对账查询、看板聚合、登录鉴权、发货回填）已下沉到 Orchestrator。
 *
 * <p><b>为什么之前不是这样：</b>本类曾直接注入 7 个 Service 并在 Controller 里写查询条件、
 * 拼装业务对象，属 D-630 规则6「Controller 不得直接依赖多个 Service」的典型存量违规
 * （同类还有 CrmClientController）。
 *
 * <p><b>为什么「非供应商账号」判定留在这里：</b>该分支需要返回 {@code Result.fail(403, ...)}
 * 的专属中文提示。若改为抛异常由全局处理器返回 HTTP 403，前端
 * {@code h5-web/src/services/http.js} 会把 message 覆盖成固定文案「无权限执行此操作」，
 * 用户看不到「供应商门户仅限供应商账号访问」。故这一 Web 层判定必须留在 Controller。
 */
@RestController
@RequestMapping("/api/supplier-portal")
public class SupplierPortalController {

    private static final String SUPPLIER_ROLE = "supplier";

    private static final String NOT_SUPPLIER_ACCOUNT = "供应商门户仅限供应商账号访问";

    @Autowired
    private SupplierPortalOrchestrator supplierPortalOrchestrator;

    @PostMapping("/login")
    public Result<Map<String, Object>> login(@RequestBody Map<String, String> request) {
        String username = request.get("username");
        String password = request.get("password");

        if (!StringUtils.hasText(username) || !StringUtils.hasText(password)) {
            return Result.fail("请输入用户名和密码");
        }

        return Result.success(supplierPortalOrchestrator.login(username, password));
    }

    @GetMapping("/dashboard")
    @PreAuthorize("isAuthenticated()")
    public Result<Map<String, Object>> getDashboard() {
        String supplierId = resolveSupplierId();
        Long tenantId = UserContext.tenantId();
        if (supplierId == null || tenantId == null) {
            return Result.fail(403, NOT_SUPPLIER_ACCOUNT);
        }
        return Result.success(supplierPortalOrchestrator.getDashboard(supplierId, tenantId));
    }

    @GetMapping("/purchases")
    @PreAuthorize("isAuthenticated()")
    public Result<Map<String, Object>> getPurchases(
            @RequestParam(required = false) String status,
            @RequestParam(required = false) String keyword,
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "20") int pageSize) {
        String supplierId = resolveSupplierId();
        Long tenantId = UserContext.tenantId();
        if (supplierId == null || tenantId == null) {
            return Result.fail(403, NOT_SUPPLIER_ACCOUNT);
        }
        return Result.success(supplierPortalOrchestrator.getPurchases(
                supplierId, tenantId, status, keyword, page, pageSize));
    }

    @GetMapping("/purchases/{purchaseId}")
    @PreAuthorize("isAuthenticated()")
    public Result<Map<String, Object>> getPurchaseDetail(@PathVariable String purchaseId) {
        String supplierId = resolveSupplierId();
        Long tenantId = UserContext.tenantId();
        if (supplierId == null || tenantId == null) {
            return Result.fail(403, NOT_SUPPLIER_ACCOUNT);
        }
        return Result.success(supplierPortalOrchestrator.getPurchaseDetail(supplierId, tenantId, purchaseId));
    }

    @PostMapping("/purchases/{purchaseId}/ship")
    @PreAuthorize("isAuthenticated()")
    public Result<Void> updateShipment(@PathVariable String purchaseId, @RequestBody Map<String, Object> request) {
        String supplierId = resolveSupplierId();
        Long tenantId = UserContext.tenantId();
        if (supplierId == null || tenantId == null) {
            return Result.fail(403, NOT_SUPPLIER_ACCOUNT);
        }

        String newStatus = (String) request.get("status");
        Integer shipQuantity = request.get("shipQuantity") != null
                ? Integer.parseInt(String.valueOf(request.get("shipQuantity"))) : null;
        String trackingNo = (String) request.get("trackingNo");
        String expressCompany = (String) request.get("expressCompany");
        String remark = (String) request.get("remark");

        supplierPortalOrchestrator.updateShipment(
                purchaseId, supplierId, tenantId, newStatus, shipQuantity, trackingNo, expressCompany, remark);
        return Result.success(null);
    }

    @GetMapping("/inventory")
    @PreAuthorize("isAuthenticated()")
    public Result<Map<String, Object>> getInventory(
            @RequestParam(required = false) String keyword,
            @RequestParam(required = false) String alert,
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "20") int pageSize) {
        String supplierId = resolveSupplierId();
        Long tenantId = UserContext.tenantId();
        if (supplierId == null || tenantId == null) {
            return Result.fail(403, NOT_SUPPLIER_ACCOUNT);
        }
        return Result.success(supplierPortalOrchestrator.getInventory(
                supplierId, tenantId, keyword, alert, page, pageSize));
    }

    @GetMapping("/payables")
    @PreAuthorize("isAuthenticated()")
    public Result<Map<String, Object>> getPayables(
            @RequestParam(required = false) String status,
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "20") int pageSize) {
        String supplierId = resolveSupplierId();
        Long tenantId = UserContext.tenantId();
        if (supplierId == null || tenantId == null) {
            return Result.fail(403, NOT_SUPPLIER_ACCOUNT);
        }
        return Result.success(supplierPortalOrchestrator.getPayables(supplierId, tenantId, status, page, pageSize));
    }

    @GetMapping("/reconciliations")
    @PreAuthorize("isAuthenticated()")
    public Result<Map<String, Object>> getReconciliations(
            @RequestParam(required = false) String status,
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "20") int pageSize) {
        String supplierId = resolveSupplierId();
        Long tenantId = UserContext.tenantId();
        if (supplierId == null || tenantId == null) {
            return Result.fail(403, NOT_SUPPLIER_ACCOUNT);
        }
        return Result.success(supplierPortalOrchestrator.getReconciliations(
                supplierId, tenantId, status, page, pageSize));
    }

    @GetMapping("/profile")
    @PreAuthorize("isAuthenticated()")
    public Result<Map<String, Object>> getProfile() {
        String supplierId = resolveSupplierId();
        Long tenantId = UserContext.tenantId();
        if (supplierId == null || tenantId == null) {
            return Result.fail(403, NOT_SUPPLIER_ACCOUNT);
        }
        return Result.success(supplierPortalOrchestrator.getProfile(supplierId));
    }

    /**
     * 从请求上下文解析供应商 id（即 token 里的 factoryId）。
     *
     * <p>只有 {@code supplier} 角色才返回；其余一律 null（→ 403）。
     * 供应商 id 只来自 token，不接受请求参数，避免越权读取其他供应商数据。
     */
    private String resolveSupplierId() {
        String factoryId = UserContext.factoryId();
        if (SUPPLIER_ROLE.equals(UserContext.role()) && factoryId != null) {
            return factoryId;
        }
        return null;
    }
}
