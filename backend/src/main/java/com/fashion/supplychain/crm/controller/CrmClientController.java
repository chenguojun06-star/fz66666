package com.fashion.supplychain.crm.controller;

import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.crm.orchestration.CrmClientOrchestrator;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.util.StringUtils;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

/**
 * 客户门户（crm-client）接口层。
 *
 * <p><b>职责边界（D-632 重构）：</b>本类只做四件事 ——
 * <ol>
 *   <li>解析当前调用者（{@link #resolveCustomerId()}，读 {@code UserContext}）</li>
 *   <li>参数非空校验</li>
 *   <li>调用 {@link CrmClientOrchestrator}</li>
 *   <li>把结果包成 {@link Result}</li>
 * </ol>
 * 全部业务编排（订单/采购/账款查询、看板聚合、登录鉴权）已下沉到 Orchestrator。
 *
 * <p><b>为什么之前不是这样：</b>本类曾直接注入 7 个 Service 并在 Controller 里写 SQL 条件、
 * 拼装业务对象，属 D-630 规则6「Controller 不得直接依赖多个 Service」的典型存量违规
 * （同类还有 SupplierPortalController）。跨服务编排放在最外层会让事务边界与权限校验失控。
 *
 * <p><b>错误响应：</b>域内失败由 Orchestrator 抛 {@code IllegalArgumentException}，
 * 经 {@code GlobalExceptionHandler} 统一转成 HTTP 400 + {@code Result.fail(400, msg)}；
 * 本类只保留「未登录」这一 Web 层判定，返回 {@code Result.fail("请先登录")}（HTTP 200 + code 500）。
 */
@RestController
@RequestMapping("/api/crm-client")
public class CrmClientController {

    private static final String CRM_CLIENT_ROLE = "crm_client";

    @Autowired
    private CrmClientOrchestrator crmClientOrchestrator;

    @PostMapping("/login")
    public Result<Map<String, Object>> login(@RequestBody Map<String, String> request) {
        String username = request.get("username");
        String password = request.get("password");

        if (!StringUtils.hasText(username) || !StringUtils.hasText(password)) {
            return Result.fail("请输入用户名和密码");
        }

        return Result.success(crmClientOrchestrator.login(username, password));
    }

    @GetMapping("/dashboard")
    @PreAuthorize("isAuthenticated()")
    public Result<Map<String, Object>> getDashboard() {
        String customerId = resolveCustomerId();
        Long tenantId = UserContext.tenantId();
        if (customerId == null || tenantId == null) {
            return Result.fail("请先登录");
        }
        return Result.success(crmClientOrchestrator.getDashboard(customerId, tenantId));
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
        return Result.success(crmClientOrchestrator.getCustomerOrders(customerId, tenantId, status, page, pageSize));
    }

    @GetMapping("/orders/{orderId}")
    @PreAuthorize("isAuthenticated()")
    public Result<Map<String, Object>> getOrderDetail(@PathVariable String orderId) {
        String customerId = resolveCustomerId();
        Long tenantId = UserContext.tenantId();
        if (customerId == null || tenantId == null) {
            return Result.fail("请先登录");
        }
        return Result.success(crmClientOrchestrator.getOrderDetail(customerId, tenantId, orderId));
    }

    @GetMapping("/purchases")
    @PreAuthorize("isAuthenticated()")
    public Result<Map<String, Object>> getPurchases(
            @RequestParam(required = false) String status,
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "20") int pageSize) {
        String customerId = resolveCustomerId();
        Long tenantId = UserContext.tenantId();
        if (customerId == null || tenantId == null) {
            return Result.fail("请先登录");
        }
        return Result.success(crmClientOrchestrator.getPurchases(customerId, tenantId, status, page, pageSize));
    }

    @GetMapping("/purchases/{purchaseId}")
    @PreAuthorize("isAuthenticated()")
    public Result<Map<String, Object>> getPurchaseDetail(@PathVariable String purchaseId) {
        String customerId = resolveCustomerId();
        Long tenantId = UserContext.tenantId();
        if (customerId == null || tenantId == null) {
            return Result.fail("请先登录");
        }
        return Result.success(crmClientOrchestrator.getPurchaseDetail(customerId, tenantId, purchaseId));
    }

    @GetMapping("/receivables")
    @PreAuthorize("isAuthenticated()")
    public Result<Map<String, Object>> getReceivables(
            @RequestParam(required = false) String status,
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "20") int pageSize) {
        String customerId = resolveCustomerId();
        Long tenantId = UserContext.tenantId();
        if (customerId == null || tenantId == null) {
            return Result.fail("请先登录");
        }
        return Result.success(crmClientOrchestrator.getReceivables(customerId, tenantId, status, page, pageSize));
    }

    @GetMapping("/receivables/{receivableId}")
    @PreAuthorize("isAuthenticated()")
    public Result<Map<String, Object>> getReceivableDetail(@PathVariable String receivableId) {
        String customerId = resolveCustomerId();
        Long tenantId = UserContext.tenantId();
        if (customerId == null || tenantId == null) {
            return Result.fail("请先登录");
        }
        return Result.success(crmClientOrchestrator.getReceivableDetail(customerId, tenantId, receivableId));
    }

    @GetMapping("/profile")
    @PreAuthorize("isAuthenticated()")
    public Result<Map<String, Object>> getProfile() {
        String customerId = resolveCustomerId();
        Long tenantId = UserContext.tenantId();
        if (customerId == null || tenantId == null) {
            return Result.fail("请先登录");
        }
        return Result.success(crmClientOrchestrator.getProfile(customerId, tenantId));
    }

    /**
     * 从请求上下文解析客户 id。
     *
     * <p>只有 {@code crm_client} 角色且 token 里带 factoryId 才返回；其余一律 null（→ 未登录）。
     * 客户 id 只来自 token，不接受请求参数，避免越权读取其他客户数据。
     */
    private String resolveCustomerId() {
        String factoryId = UserContext.factoryId();
        if (CRM_CLIENT_ROLE.equals(UserContext.role()) && factoryId != null) {
            return factoryId;
        }
        return null;
    }
}
