package com.fashion.supplychain.intelligence.scan.graph;

import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.common.tenant.TenantAssert;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

/**
 * 扫码状态机 REST 端点（P1-2 LangGraph State Graph + HITL）。
 *
 * <p>提供查询/转换/HITL 恢复三类端点，所有端点强制租户上下文校验。</p>
 *
 * <p>权限：登录用户 + 租户隔离（所有查询带 tenant_id，P0 铁律4）。</p>
 *
 * @author xiaoyun
 * @since 2026-07-22
 */
@Slf4j
@RestController
@RequestMapping("/api/intelligence/scan-state")
@RequiredArgsConstructor
@PreAuthorize("isAuthenticated()")
public class ScanStateGraphController {

    private final ScanStateGraph scanStateGraph;

    /** 查询指定菲号的当前状态 */
    @GetMapping("/{bundleId}/current")
    public Result<Map<String, Object>> getCurrentState(@PathVariable("bundleId") Long bundleId) {
        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();
        try {
            ScanState state = scanStateGraph.getCurrentState(tenantId, bundleId);
            return Result.success(Map.of(
                    "bundleId", bundleId,
                    "state", state.name(),
                    "description", state.getDescription(),
                    "nextStates", state.nextStates().stream().map(Enum::name).toList()
            ));
        } catch (Exception e) {
            log.warn("[ScanStateGraph] 查询当前状态失败: tenantId={}, bundleId={}, err={}",
                    tenantId, bundleId, e.getMessage());
            return Result.fail(e.getMessage());
        }
    }

    /** 执行状态转换 */
    @PostMapping("/{bundleId}/transition")
    public Result<ScanStateTransition> transition(@PathVariable("bundleId") Long bundleId,
                                                  @RequestBody Map<String, Object> body) {
        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();
        try {
            String targetStateStr = (String) body.get("targetState");
            String operator = body.get("operator") != null ? body.get("operator").toString() : null;
            String reason = body.get("reason") != null ? body.get("reason").toString() : null;
            if (targetStateStr == null || targetStateStr.isBlank()) {
                return Result.fail("targetState 不可为空");
            }
            ScanState target;
            try {
                target = ScanState.valueOf(targetStateStr);
            } catch (IllegalArgumentException e) {
                return Result.fail("非法 targetState: " + targetStateStr);
            }
            ScanStateTransition t = scanStateGraph.transition(tenantId, bundleId, target, operator, reason);
            return Result.success(t);
        } catch (IllegalStateException | IllegalArgumentException e) {
            return Result.fail(e.getMessage());
        } catch (Exception e) {
            log.warn("[ScanStateGraph] 状态转换失败: tenantId={}, bundleId={}, err={}",
                    tenantId, bundleId, e.getMessage());
            return Result.fail(e.getMessage());
        }
    }

    /** HITL 恢复（审批通过/拒绝） */
    @PostMapping("/{bundleId}/hitl/resume")
    public Result<ScanStateTransition> resumeFromHitl(@PathVariable("bundleId") Long bundleId,
                                                      @RequestBody Map<String, Object> body) {
        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();
        try {
            Object approvedObj = body.get("approved");
            if (approvedObj == null) {
                return Result.fail("approved 不可为空");
            }
            boolean approved = Boolean.parseBoolean(approvedObj.toString());
            String approver = body.get("approver") != null ? body.get("approver").toString() : null;
            ScanStateTransition t = scanStateGraph.resumeFromHITL(tenantId, bundleId, approved, approver);
            return Result.success(t);
        } catch (IllegalStateException | IllegalArgumentException e) {
            return Result.fail(e.getMessage());
        } catch (Exception e) {
            log.warn("[ScanStateGraph] HITL 恢复失败: tenantId={}, bundleId={}, err={}",
                    tenantId, bundleId, e.getMessage());
            return Result.fail(e.getMessage());
        }
    }
}
