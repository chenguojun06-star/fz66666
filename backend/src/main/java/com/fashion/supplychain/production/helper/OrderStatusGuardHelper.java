package com.fashion.supplychain.production.helper;

import com.fashion.supplychain.common.constant.OrderStatusConstants;
import java.util.Arrays;
import java.util.Collections;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

/**
 * 订单状态机守卫 (P0-7)
 *
 * <p>规范订单状态流转，防止状态跳跃和非法回退。仅对实际入库的状态变更生效，
 * 不影响 OrderProgressFillHelper 等查询时内存填充逻辑。</p>
 *
 * <p>设计原则：</p>
 * <ul>
 *   <li>初始状态（null/空串）→ 任意活跃态：允许，不阻断订单创建</li>
 *   <li>同状态自环：允许（幂等更新）</li>
 *   <li>终态→活跃态：禁止（如需恢复走专用 reverse 接口）</li>
 *   <li>活跃态→活跃态回退：禁止（如 production→pending 走 pause/resume 专用接口）</li>
 *   <li>活跃态→终态：按白名单校验</li>
 * </ul>
 *
 * <p>使用方式（仅对用户直接触发的状态变更点接入）：</p>
 * <pre>
 * ProductionOrder order = ...;
 * String from = order.getStatus();
 * order.setStatus("scrapped");
 * orderStatusGuardHelper.guardTransition(from, "scrapped", "scrapOrder");
 * productionOrderService.updateById(order);
 * </pre>
 *
 * <p>注：AI 工具调用路径（CommandExecutorHelper/SmartRemarkAgent 等）暂不接入，
 * 以保留 AI 自动化辅助的灵活性。如需接入可通过 guardTransitionOrNull 宽松模式。</p>
 *
 * @author System
 * @since 2026-07-29
 * @see OrderStatusConstants
 */
@Component
@Slf4j
public class OrderStatusGuardHelper {

    /** 活跃状态集合（可继续推进工序） */
    private static final Set<String> ACTIVE_STATUSES = new HashSet<>(Arrays.asList(
            OrderStatusConstants.NOT_STARTED,
            OrderStatusConstants.PENDING,
            OrderStatusConstants.PRODUCTION,
            OrderStatusConstants.IN_PROGRESS,
            OrderStatusConstants.PAUSED,
            OrderStatusConstants.PROCUREMENT,
            OrderStatusConstants.CUTTING,
            OrderStatusConstants.SEWING,
            OrderStatusConstants.IRONING,
            OrderStatusConstants.SECONDARY_PROCESS,
            OrderStatusConstants.PACKAGING,
            OrderStatusConstants.QUALITY_CHECK,
            OrderStatusConstants.WAREHOUSING,
            OrderStatusConstants.DELAYED,
            OrderStatusConstants.RETURNED
    ));

    /** 终态集合 */
    private static final Set<String> TERMINAL_STATUSES = new HashSet<>(
            OrderStatusConstants.TERMINAL_STATUSES);

    /**
     * 允许的状态流转白名单（from → 允许的 to 列表）
     *
     * <p>规则：</p>
     * <ul>
     *   <li>not_started → pending / cancelled / scrapped</li>
     *   <li>pending → production / procurement / cutting / cancelled / scrapped / closed / returned</li>
     *   <li>production → quality_check / warehousing / paused / delayed / cancelled / scrapped / closed / completed / returned</li>
     *   <li>quality_check → warehousing / production / returned / cancelled / scrapped / closed</li>
     *   <li>warehousing → closed / completed / returned / cancelled</li>
     *   <li>paused → production / pending / cancelled / scrapped / closed</li>
     *   <li>delayed → production / pending / cancelled / scrapped / closed</li>
     *   <li>returned → pending / cancelled / scrapped / closed</li>
     * </ul>
     */
    private static final Map<String, List<String>> ALLOWED_TRANSITIONS = new HashMap<>();

    static {
        ALLOWED_TRANSITIONS.put(OrderStatusConstants.NOT_STARTED, Arrays.asList(
                OrderStatusConstants.PENDING,
                OrderStatusConstants.PROCUREMENT,
                OrderStatusConstants.CUTTING,
                OrderStatusConstants.CANCELLED,
                OrderStatusConstants.SCRAPPED
        ));
        ALLOWED_TRANSITIONS.put(OrderStatusConstants.PENDING, Arrays.asList(
                OrderStatusConstants.PRODUCTION,
                OrderStatusConstants.IN_PROGRESS,
                OrderStatusConstants.PROCUREMENT,
                OrderStatusConstants.CUTTING,
                OrderStatusConstants.PAUSED,
                OrderStatusConstants.DELAYED,
                OrderStatusConstants.RETURNED,
                OrderStatusConstants.CANCELLED,
                OrderStatusConstants.SCRAPPED,
                OrderStatusConstants.CLOSED
        ));
        ALLOWED_TRANSITIONS.put(OrderStatusConstants.PRODUCTION, Arrays.asList(
                OrderStatusConstants.PENDING,           // 工序回退到待生产（仅 OrderProgressFillHelper 内存场景，入库禁止）
                OrderStatusConstants.IN_PROGRESS,
                OrderStatusConstants.SEWING,
                OrderStatusConstants.IRONING,
                OrderStatusConstants.SECONDARY_PROCESS,
                OrderStatusConstants.PACKAGING,
                OrderStatusConstants.QUALITY_CHECK,
                OrderStatusConstants.WAREHOUSING,
                OrderStatusConstants.PAUSED,
                OrderStatusConstants.DELAYED,
                OrderStatusConstants.RETURNED,
                OrderStatusConstants.CANCELLED,
                OrderStatusConstants.SCRAPPED,
                OrderStatusConstants.CLOSED,
                OrderStatusConstants.COMPLETED
        ));
        ALLOWED_TRANSITIONS.put(OrderStatusConstants.IN_PROGRESS, ALLOWED_TRANSITIONS.get(OrderStatusConstants.PRODUCTION));
        ALLOWED_TRANSITIONS.put(OrderStatusConstants.PROCUREMENT, Arrays.asList(
                OrderStatusConstants.PENDING,
                OrderStatusConstants.PRODUCTION,
                OrderStatusConstants.CUTTING,
                OrderStatusConstants.PAUSED,
                OrderStatusConstants.DELAYED,
                OrderStatusConstants.RETURNED,
                OrderStatusConstants.CANCELLED,
                OrderStatusConstants.SCRAPPED,
                OrderStatusConstants.CLOSED
        ));
        ALLOWED_TRANSITIONS.put(OrderStatusConstants.CUTTING, Arrays.asList(
                OrderStatusConstants.PENDING,
                OrderStatusConstants.PRODUCTION,
                OrderStatusConstants.SEWING,
                OrderStatusConstants.PAUSED,
                OrderStatusConstants.DELAYED,
                OrderStatusConstants.RETURNED,
                OrderStatusConstants.CANCELLED,
                OrderStatusConstants.SCRAPPED,
                OrderStatusConstants.CLOSED
        ));
        ALLOWED_TRANSITIONS.put(OrderStatusConstants.SEWING, Arrays.asList(
                OrderStatusConstants.PRODUCTION,
                OrderStatusConstants.IRONING,
                OrderStatusConstants.SECONDARY_PROCESS,
                OrderStatusConstants.PAUSED,
                OrderStatusConstants.DELAYED,
                OrderStatusConstants.RETURNED,
                OrderStatusConstants.CANCELLED,
                OrderStatusConstants.SCRAPPED,
                OrderStatusConstants.CLOSED
        ));
        ALLOWED_TRANSITIONS.put(OrderStatusConstants.IRONING, ALLOWED_TRANSITIONS.get(OrderStatusConstants.SEWING));
        ALLOWED_TRANSITIONS.put(OrderStatusConstants.SECONDARY_PROCESS, Arrays.asList(
                OrderStatusConstants.PRODUCTION,
                OrderStatusConstants.PACKAGING,
                OrderStatusConstants.PAUSED,
                OrderStatusConstants.DELAYED,
                OrderStatusConstants.RETURNED,
                OrderStatusConstants.CANCELLED,
                OrderStatusConstants.SCRAPPED,
                OrderStatusConstants.CLOSED
        ));
        ALLOWED_TRANSITIONS.put(OrderStatusConstants.PACKAGING, Arrays.asList(
                OrderStatusConstants.PRODUCTION,
                OrderStatusConstants.QUALITY_CHECK,
                OrderStatusConstants.PAUSED,
                OrderStatusConstants.DELAYED,
                OrderStatusConstants.RETURNED,
                OrderStatusConstants.CANCELLED,
                OrderStatusConstants.SCRAPPED,
                OrderStatusConstants.CLOSED
        ));
        ALLOWED_TRANSITIONS.put(OrderStatusConstants.QUALITY_CHECK, Arrays.asList(
                OrderStatusConstants.WAREHOUSING,
                OrderStatusConstants.PRODUCTION,
                OrderStatusConstants.PAUSED,
                OrderStatusConstants.DELAYED,
                OrderStatusConstants.RETURNED,
                OrderStatusConstants.CANCELLED,
                OrderStatusConstants.SCRAPPED,
                OrderStatusConstants.CLOSED
        ));
        ALLOWED_TRANSITIONS.put(OrderStatusConstants.WAREHOUSING, Arrays.asList(
                OrderStatusConstants.CLOSED,
                OrderStatusConstants.COMPLETED,
                OrderStatusConstants.RETURNED,
                OrderStatusConstants.CANCELLED
        ));
        ALLOWED_TRANSITIONS.put(OrderStatusConstants.PAUSED, Arrays.asList(
                OrderStatusConstants.PRODUCTION,
                OrderStatusConstants.PENDING,
                OrderStatusConstants.CANCELLED,
                OrderStatusConstants.SCRAPPED,
                OrderStatusConstants.CLOSED
        ));
        ALLOWED_TRANSITIONS.put(OrderStatusConstants.DELAYED, Arrays.asList(
                OrderStatusConstants.PRODUCTION,
                OrderStatusConstants.PENDING,
                OrderStatusConstants.CANCELLED,
                OrderStatusConstants.SCRAPPED,
                OrderStatusConstants.CLOSED
        ));
        ALLOWED_TRANSITIONS.put(OrderStatusConstants.RETURNED, Arrays.asList(
                OrderStatusConstants.PENDING,
                OrderStatusConstants.CANCELLED,
                OrderStatusConstants.SCRAPPED,
                OrderStatusConstants.CLOSED
        ));
        // 终态：不再流转（除非专用 reverse 接口，不走 guardTransition）
        ALLOWED_TRANSITIONS.put(OrderStatusConstants.COMPLETED, Collections.emptyList());
        ALLOWED_TRANSITIONS.put(OrderStatusConstants.CLOSED, Collections.emptyList());
        ALLOWED_TRANSITIONS.put(OrderStatusConstants.SCRAPPED, Collections.emptyList());
        ALLOWED_TRANSITIONS.put(OrderStatusConstants.CANCELLED, Collections.emptyList());
        ALLOWED_TRANSITIONS.put(OrderStatusConstants.ARCHIVED, Collections.emptyList());
    }

    /**
     * 守卫状态流转（严格模式）。
     *
     * <p>调用时机：在 order.setStatus(newStatus) 之后、updateById 之前。</p>
     *
     * @param from        原状态（可为空，空表示新建）
     * @param to          目标状态
     * @param operation   操作场景名（用于异常信息和日志，如 "scrapOrder"）
     * @throws IllegalStateException 如果状态流转不合法
     */
    public void guardTransition(String from, String to, String operation) {
        if (!StringUtils.hasText(to)) {
            throw new IllegalStateException("[" + operation + "] 目标状态不能为空");
        }
        String toNorm = to.trim().toLowerCase();
        String fromNorm = (from == null) ? "" : from.trim().toLowerCase();

        // 1. 新建场景：from 为空，允许到任意活跃态（不包括终态，除非显式允许）
        if (fromNorm.isEmpty()) {
            if (TERMINAL_STATUSES.contains(toNorm) && !OrderStatusConstants.CANCELLED.equals(toNorm)) {
                // 新建直接进入终态不合理（cancel 除外，可用于初始化即取消）
                throw new IllegalStateException(
                        "[" + operation + "] 新建订单不能直接进入终态: " + to);
            }
            return;
        }

        // 2. 同状态自环：幂等更新，允许
        if (fromNorm.equals(toNorm)) {
            return;
        }

        // 3. 校验白名单
        if (!isAllowedStatusTransition(fromNorm, toNorm)) {
            if (isBackwardTransition(fromNorm, toNorm)) {
                throw new IllegalStateException(
                        "[" + operation + "] 不允许的状态回退: " + from + " → " + to
                                + "（如需恢复请使用专用退回/恢复接口）");
            }
            throw new IllegalStateException(
                    "[" + operation + "] 不允许的状态流转: " + from + " → " + to);
        }
    }

    /**
     * 判断状态流转是否允许（不抛异常）。
     */
    public boolean isAllowedStatusTransition(String from, String to) {
        if (!StringUtils.hasText(to)) return false;
        String toNorm = to.trim().toLowerCase();
        String fromNorm = (from == null) ? "" : from.trim().toLowerCase();
        if (fromNorm.isEmpty()) return ACTIVE_STATUSES.contains(toNorm)
                || OrderStatusConstants.CANCELLED.equals(toNorm);
        if (fromNorm.equals(toNorm)) return true;
        List<String> allowed = ALLOWED_TRANSITIONS.get(fromNorm);
        return allowed != null && allowed.contains(toNorm);
    }

    /**
     * 是否为回退流转（活跃态→更早的活跃态）。
     *
     * <p>注意：RETURNED 是合法的退回目标，不算回退违规。</p>
     */
    public boolean isBackwardTransition(String from, String to) {
        if (!StringUtils.hasText(from) || !StringUtils.hasText(to)) return false;
        String fromNorm = from.trim().toLowerCase();
        String toNorm = to.trim().toLowerCase();
        if (!ACTIVE_STATUSES.contains(fromNorm) || !ACTIVE_STATUSES.contains(toNorm)) {
            return false;
        }
        // 终态 → 活跃态：算回退
        if (TERMINAL_STATUSES.contains(fromNorm)) return true;

        // 简化的工序顺序：procurement < cutting < sewing < ironing < secondary_process < packaging < quality_check < warehousing
        int fromIdx = stageOrder(fromNorm);
        int toIdx = stageOrder(toNorm);
        if (fromIdx < 0 || toIdx < 0) return false;
        return toIdx < fromIdx;
    }

    private int stageOrder(String status) {
        switch (status) {
            case "not_started": return 0;
            case "pending": return 1;
            case "procurement": return 2;
            case "cutting": return 3;
            case "production":
            case "in_progress": return 4;
            case "sewing": return 5;
            case "ironing": return 6;
            case "secondary_process": return 7;
            case "packaging": return 8;
            case "quality_check": return 9;
            case "warehousing": return 10;
            case "paused":
            case "delayed": return 99;  // 暂停/逾期不算具体阶段
            default: return -1;
        }
    }

    /**
     * 宽松守卫：仅记录警告日志，不抛异常。
     *
     * <p>用于 AI 工具调用等不阻断场景。后续可逐步收紧为严格模式。</p>
     */
    public void warnIfIllegal(String from, String to, String operation) {
        if (!isAllowedStatusTransition(from, to)) {
            log.warn("[OrderStatusGuard] 非法状态流转被记录（未阻断） op={} from={} to={}",
                    operation, from, to);
        }
    }
}
