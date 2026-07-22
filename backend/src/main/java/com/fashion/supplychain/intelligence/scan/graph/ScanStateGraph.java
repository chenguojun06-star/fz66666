package com.fashion.supplychain.intelligence.scan.graph;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.annotation.Lazy;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import java.sql.Timestamp;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * 扫码状态机管理组件（P1-2 LangGraph State Graph + HITL）。
 *
 * <p>用途：以显式状态机方式管理扫码全流程的状态转换与 HITL 中断/恢复，
 * 替代散落在 Service/Orchestrator 中的命令式状态变更。</p>
 *
 * <p>设计原则：</p>
 * <ul>
 *   <li>独立模块，不修改任何现有 ScanRecordOrchestrator/ScanRecordService 代码</li>
 *   <li>所有数据库操作异常 try-catch 吞掉仅 log.warn，状态机失败不影响现有扫码主流程</li>
 *   <li>所有查询强制带 tenant_id（P0 铁律4：多租户隔离）</li>
 *   <li>不加 @Transactional（P0 铁律2：事务边界仅在 Orchestrator 层）</li>
 * </ul>
 *
 * @author xiaoyun
 * @since 2026-07-22
 */
@Component
@Lazy
@Slf4j
@RequiredArgsConstructor
public class ScanStateGraph {

    private final JdbcTemplate jdbcTemplate;

    /**
     * 查询指定菲号当前的状态（最新一条日志的 to_state）。
     *
     * @param tenantId 租户 ID（必填，P0 铁律4）
     * @param bundleId 裁剪菲号 ID
     * @return 当前状态；无记录时返回 {@link ScanState#INIT}
     */
    public ScanState getCurrentState(Long tenantId, Long bundleId) {
        if (tenantId == null || bundleId == null) {
            return ScanState.INIT;
        }
        try {
            List<Map<String, Object>> rows = jdbcTemplate.queryForList(
                    "SELECT to_state FROM t_scan_state_log " +
                    "WHERE tenant_id = ? AND bundle_id = ? " +
                    "ORDER BY id DESC LIMIT 1",
                    tenantId, bundleId);
            if (rows.isEmpty()) {
                return ScanState.INIT;
            }
            String stateName = (String) rows.get(0).get("to_state");
            try {
                return ScanState.valueOf(stateName);
            } catch (IllegalArgumentException e) {
                log.warn("[ScanStateGraph] 未知状态值，回退为 INIT: tenantId={}, bundleId={}, state={}",
                        tenantId, bundleId, stateName);
                return ScanState.INIT;
            }
        } catch (Exception e) {
            log.warn("[ScanStateGraph] 查询当前状态失败，回退为 INIT: tenantId={}, bundleId={}, err={}",
                    tenantId, bundleId, e.getMessage());
            return ScanState.INIT;
        }
    }

    /**
     * 执行状态转换。
     *
     * <p>校验当前状态 → target 的合法性；不合法抛 {@link IllegalStateException}；
     * 合法则写入 t_scan_state_log 并返回转换记录。</p>
     *
     * @param tenantId 租户 ID（必填）
     * @param bundleId 裲剪菲号 ID
     * @param target   目标状态
     * @param operator 操作人（可为 null）
     * @param reason   转换原因（可为 null）
     * @return 转换记录
     * @throws IllegalStateException 当状态转换不合法时
     */
    public ScanStateTransition transition(Long tenantId, Long bundleId,
                                          ScanState target, String operator, String reason) {
        try {
            if (tenantId == null || bundleId == null || target == null) {
                throw new IllegalArgumentException("tenantId/bundleId/target 不可为空");
            }
            ScanState current = getCurrentState(tenantId, bundleId);
            if (!current.canTransitionTo(target)) {
                throw new IllegalStateException(
                        "非法状态转换: " + current + " → " + target +
                        " (tenantId=" + tenantId + ", bundleId=" + bundleId + ")");
            }
            Timestamp now = Timestamp.valueOf(LocalDateTime.now());
            jdbcTemplate.update(
                    "INSERT INTO t_scan_state_log " +
                    "(tenant_id, bundle_id, from_state, to_state, operator, reason, approved, create_time) " +
                    "VALUES (?, ?, ?, ?, ?, ?, NULL, ?)",
                    tenantId, bundleId, current.name(), target.name(), operator, reason, now);

            Long id = jdbcTemplate.queryForObject(
                    "SELECT LAST_INSERT_ID()", Long.class);

            return ScanStateTransition.builder()
                    .id(id)
                    .tenantId(tenantId)
                    .bundleId(bundleId)
                    .fromState(current)
                    .toState(target)
                    .operator(operator)
                    .reason(reason)
                    .timestamp(now.toLocalDateTime())
                    .approved(null)
                    .build();
        } catch (IllegalStateException | IllegalArgumentException e) {
            throw e;
        } catch (Exception e) {
            log.warn("[ScanStateGraph] 状态转换失败: tenantId={}, bundleId={}, target={}, err={}",
                    tenantId, bundleId, target, e.getMessage());
            throw new IllegalStateException("状态转换失败: " + e.getMessage(), e);
        }
    }

    /**
     * HITL 中断：将状态转换为 UNDO_PENDING（撤回审批中断点）。
     *
     * <p>仅当当前状态允许进入 UNDO_PENDING 时才能中断；否则返回 empty。</p>
     *
     * @param tenantId   租户 ID
     * @param bundleId   菲号 ID
     * @param hitlReason 中断原因
     * @return 中断点信息；不可中断时返回 empty
     */
    public Optional<ScanStateTransition> suspendAtHITL(Long tenantId, Long bundleId, String hitlReason) {
        try {
            ScanState current = getCurrentState(tenantId, bundleId);
            if (!current.canTransitionTo(ScanState.UNDO_PENDING)) {
                log.info("[ScanStateGraph] 当前状态不可中断为 HITL: tenantId={}, bundleId={}, current={}",
                        tenantId, bundleId, current);
                return Optional.empty();
            }
            ScanStateTransition t = transition(tenantId, bundleId, ScanState.UNDO_PENDING,
                    "HITL_SYSTEM", hitlReason);
            return Optional.of(t);
        } catch (Exception e) {
            log.warn("[ScanStateGraph] HITL 中断失败: tenantId={}, bundleId={}, err={}",
                    tenantId, bundleId, e.getMessage());
            return Optional.empty();
        }
    }

    /**
     * HITL 恢复：根据审批结果继续或回退。
     *
     * <p>审批通过（approved=true）：状态从 UNDO_PENDING 转为 UNDONE（撤回完成）。</p>
     * <p>审批拒绝（approved=false）：状态从 UNDO_PENDING 回退到中断前的状态。
     * 中断前状态从 t_scan_state_log 倒数第二条记录的 from_state 推断。</p>
     *
     * @param tenantId 租户 ID
     * @param bundleId 菲号 ID
     * @param approved 审批结果
     * @param approver 审批人
     * @return 恢复后的转换记录
     */
    public ScanStateTransition resumeFromHITL(Long tenantId, Long bundleId,
                                              boolean approved, String approver) {
        try {
            ScanState current = getCurrentState(tenantId, bundleId);
            if (current != ScanState.UNDO_PENDING) {
                throw new IllegalStateException(
                        "当前状态非 UNDO_PENDING，无法恢复 HITL: current=" + current);
            }
            ScanState target;
            String reason;
            if (approved) {
                target = ScanState.UNDONE;
                reason = "HITL 审批通过，撤回完成";
            } else {
                // 回退到中断前的状态（取倒数第二条记录的 from_state）
                target = findPreviousState(tenantId, bundleId);
                reason = "HITL 审批拒绝，回退到 " + target;
            }

            Timestamp now = Timestamp.valueOf(LocalDateTime.now());
            jdbcTemplate.update(
                    "INSERT INTO t_scan_state_log " +
                    "(tenant_id, bundle_id, from_state, to_state, operator, reason, approved, create_time) " +
                    "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                    tenantId, bundleId, current.name(), target.name(),
                    approver, reason, approved ? 1 : 0, now);

            Long id = jdbcTemplate.queryForObject(
                    "SELECT LAST_INSERT_ID()", Long.class);

            return ScanStateTransition.builder()
                    .id(id)
                    .tenantId(tenantId)
                    .bundleId(bundleId)
                    .fromState(current)
                    .toState(target)
                    .operator(approver)
                    .reason(reason)
                    .timestamp(now.toLocalDateTime())
                    .approved(approved)
                    .build();
        } catch (Exception e) {
            log.warn("[ScanStateGraph] HITL 恢复失败: tenantId={}, bundleId={}, approved={}, err={}",
                    tenantId, bundleId, approved, e.getMessage());
            throw new IllegalStateException("HITL 恢复失败: " + e.getMessage(), e);
        }
    }

    /**
     * 查询中断前的状态（倒数第二条日志的 from_state；找不到则返回 INIT）。
     */
    private ScanState findPreviousState(Long tenantId, Long bundleId) {
        try {
            List<Map<String, Object>> rows = jdbcTemplate.queryForList(
                    "SELECT from_state FROM t_scan_state_log " +
                    "WHERE tenant_id = ? AND bundle_id = ? " +
                    "ORDER BY id DESC LIMIT 2",
                    tenantId, bundleId);
            // rows[0] 是当前 UNDO_PENDING 记录，rows[1] 是中断前记录
            if (rows.size() >= 2) {
                Object fromState = rows.get(1).get("from_state");
                if (fromState != null) {
                    return ScanState.valueOf(fromState.toString());
                }
            }
            // 找不到则回退到 INIT
            return ScanState.INIT;
        } catch (Exception e) {
            log.warn("[ScanStateGraph] 查找前序状态失败，回退 INIT: tenantId={}, bundleId={}, err={}",
                    tenantId, bundleId, e.getMessage());
            return ScanState.INIT;
        }
    }
}
