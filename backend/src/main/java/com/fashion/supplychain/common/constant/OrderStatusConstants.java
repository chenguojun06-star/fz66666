package com.fashion.supplychain.common.constant;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Set;

/**
 * 生产订单状态常量（与前端 ORDER_STATUS_LABEL / 小程序 orderStatusHelper.js 保持一致）
 *
 * <p>状态值统一为小写英文；中文显示文本仅用于后端日志/导出等本地场景。</p>
 */
public class OrderStatusConstants {
    private OrderStatusConstants() {}

    // === 活跃状态（可推进）===
    public static final String NOT_STARTED = "not_started";
    public static final String PENDING = "pending";
    public static final String PRODUCTION = "production";
    public static final String IN_PROGRESS = "in_progress";
    public static final String PAUSED = "paused";

    // === 工序阶段（与 OrderProcessQueryService.calculateCurrentProcess 对应）===
    public static final String PROCUREMENT = "procurement";
    public static final String CUTTING = "cutting";
    public static final String SEWING = "sewing";
    public static final String IRONING = "ironing";
    public static final String SECONDARY_PROCESS = "secondary_process";
    public static final String PACKAGING = "packaging";
    public static final String QUALITY_CHECK = "quality_check";
    public static final String WAREHOUSING = "warehousing";

    // === 终止/异常状态 ===
    public static final String COMPLETED = "completed";
    public static final String DELAYED = "delayed";
    public static final String SCRAPPED = "scrapped";
    public static final String CANCELLED = "cancelled";
    public static final String RETURNED = "returned";
    public static final String CLOSED = "closed";
    public static final String ARCHIVED = "archived";

    /** 终止状态集合 — 这些状态下订单不再推进工序 */
    public static final Set<String> TERMINAL_STATUSES = Set.of(
            COMPLETED, CANCELLED, SCRAPPED, ARCHIVED, CLOSED
    );

    public static boolean isTerminal(String status) {
        return status != null && TERMINAL_STATUSES.contains(status.trim().toLowerCase());
    }

    /**
     * 返回中文显示文本（与前端 ORDER_STATUS_LABEL 保持一致），未匹配返回原值。
     */
    public static String toChinese(String status) {
        if (status == null) return "";
        return LABEL_MAP.getOrDefault(status.trim().toLowerCase(), status.trim());
    }

    private static final Map<String, String> LABEL_MAP = new LinkedHashMap<>();
    static {
        LABEL_MAP.put(NOT_STARTED, "未开始");
        LABEL_MAP.put(PENDING, "待生产");
        LABEL_MAP.put(PRODUCTION, "生产中");
        LABEL_MAP.put(IN_PROGRESS, "生产中");
        LABEL_MAP.put(PAUSED, "已暂停");
        LABEL_MAP.put(PROCUREMENT, "物料采购");
        LABEL_MAP.put(CUTTING, "裁剪中");
        LABEL_MAP.put(SEWING, "车缝中");
        LABEL_MAP.put(IRONING, "大烫");
        LABEL_MAP.put(SECONDARY_PROCESS, "二次工艺");
        LABEL_MAP.put(PACKAGING, "包装");
        LABEL_MAP.put(QUALITY_CHECK, "质检中");
        LABEL_MAP.put(WAREHOUSING, "入库中");
        LABEL_MAP.put(COMPLETED, "已完成");
        LABEL_MAP.put(DELAYED, "已逾期");
        LABEL_MAP.put(SCRAPPED, "已报废");
        LABEL_MAP.put(CANCELLED, "已取消");
        LABEL_MAP.put(RETURNED, "已退回");
        LABEL_MAP.put(CLOSED, "已关单");
        LABEL_MAP.put(ARCHIVED, "已归档");
    }
}
