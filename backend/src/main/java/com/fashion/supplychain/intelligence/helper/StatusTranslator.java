package com.fashion.supplychain.intelligence.helper;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.regex.Pattern;

/**
 * AI 输出中英文→中文统一翻译器。
 * <p>
 * 覆盖三类英文泄露：
 * <ol>
 *   <li>状态码枚举（IN_PROGRESS → 进行中）</li>
 *   <li>JSON 字段名（orderNo → 订单号）</li>
 *   <li>Java 类型名（java.time.LocalDateTime 等）</li>
 * </ol>
 *
 * @since 2026-07-20
 */
public final class StatusTranslator {

    private StatusTranslator() {}

    // ── 状态码翻译 ──
    private static final Map<String, String> STATUS_MAP = new LinkedHashMap<>();
    static {
        // 订单状态
        STATUS_MAP.put("IN_PROGRESS",        "进行中");
        STATUS_MAP.put("PENDING",            "待处理");
        STATUS_MAP.put("COMPLETED",          "已完成");
        STATUS_MAP.put("CANCELLED",          "已取消");
        STATUS_MAP.put("DRAFT",              "草稿");
        STATUS_MAP.put("SUBMITTED",          "已提交");
        STATUS_MAP.put("APPROVED",           "已审批");
        STATUS_MAP.put("REJECTED",           "已驳回");
        STATUS_MAP.put("SUSPENDED",          "已暂停");
        STATUS_MAP.put("CLOSED",             "已关闭");
        // 扫码相关
        STATUS_MAP.put("success",            "成功");
        STATUS_MAP.put("fail",               "失败");
        STATUS_MAP.put("PRODUCTION",         "生产");
        STATUS_MAP.put("QUALITY",            "质检");
        STATUS_MAP.put("WAREHOUSE",          "入库");
        // 结算相关
        STATUS_MAP.put("pending",            "待结算");
        STATUS_MAP.put("confirmed",          "已确认");
        STATUS_MAP.put("paid",               "已支付");
        STATUS_MAP.put("pending_repair",     "待返修");
        // 紧急度
        STATUS_MAP.put("urgent",             "紧急");
        STATUS_MAP.put("normal",             "普通");
        // 样板状态
        STATUS_MAP.put("pattern_pending",    "纸样待处理");
        STATUS_MAP.put("pattern_started",    "纸样制作中");
        STATUS_MAP.put("pattern_completed",  "纸样已完成");
        STATUS_MAP.put("sewing_started",     "车缝开始");
        STATUS_MAP.put("sewing_completed",   "车缝完成");
        STATUS_MAP.put("review_pending",     "待审核");
        STATUS_MAP.put("review_passed",      "审核通过");
    }

    // ── 常见 JSON 字段名翻译 ──
    private static final Map<String, String> FIELD_MAP = new LinkedHashMap<>();
    static {
        FIELD_MAP.put("orderNo",               "订单号");
        FIELD_MAP.put("orderId",               "订单ID");
        FIELD_MAP.put("styleNo",               "款号");
        FIELD_MAP.put("styleName",             "款名");
        FIELD_MAP.put("productCategory",       "产品类别");
        FIELD_MAP.put("orderQuantity",         "订单数量");
        FIELD_MAP.put("completedQuantity",     "已完成数量");
        FIELD_MAP.put("productionProgress",    "生产进度");
        FIELD_MAP.put("factoryName",           "工厂名称");
        FIELD_MAP.put("factoryId",             "工厂ID");
        FIELD_MAP.put("factoryType",           "工厂类型");
        FIELD_MAP.put("urgencyLevel",          "紧急程度");
        FIELD_MAP.put("status",                "状态");
        FIELD_MAP.put("deleteFlag",            "删除标记");
        FIELD_MAP.put("tenantId",              "租户ID");
        FIELD_MAP.put("createdAt",             "创建时间");
        FIELD_MAP.put("updatedAt",             "更新时间");
        FIELD_MAP.put("expectedShipDate",      "预期出货日");
        FIELD_MAP.put("plannedEndDate",        "计划完成日");
        FIELD_MAP.put("scanTime",              "扫码时间");
        FIELD_MAP.put("scanResult",            "扫码结果");
        FIELD_MAP.put("scanType",              "扫码类型");
        FIELD_MAP.put("processName",           "工序名称");
        FIELD_MAP.put("progressStage",         "进度阶段");
        FIELD_MAP.put("progressNodes",         "进度节点");
        FIELD_MAP.put("patternStatus",         "纸样状态");
        FIELD_MAP.put("operatorName",          "操作人");
        FIELD_MAP.put("operatorId",            "操作人ID");
        FIELD_MAP.put("quantity",              "数量");
        FIELD_MAP.put("qualifiedQuantity",     "合格数量");
        FIELD_MAP.put("unqualifiedQuantity",   "不合格数量");
        FIELD_MAP.put("totalAmount",           "总金额");
        FIELD_MAP.put("unitPrice",             "单价");
        FIELD_MAP.put("color",                 "颜色");
        FIELD_MAP.put("size",                  "尺码");
        FIELD_MAP.put("bundleNo",              "菲号");
        FIELD_MAP.put("cuttingQuantity",       "裁剪数量");
    }

    /** 清除 Java 类型名（java.time.LocalDateTime、java.util.List 等） */
    private static final Pattern JAVA_TYPE_PATTERN =
            Pattern.compile("\\bjava\\.[a-zA-Z.]+\\b");

    /** 清除连续的英文 camelCase 词（≥2个单词组合） */

    /**
     * 翻译状态码，未匹配返回原文。
     */
    public static String translateStatus(String raw) {
        if (raw == null) return null;
        return STATUS_MAP.getOrDefault(raw.trim(), raw);
    }

    /**
     * 翻译 JSON 字段名，未匹配返回原文。
     */
    public static String translateField(String raw) {
        if (raw == null) return null;
        return FIELD_MAP.getOrDefault(raw.trim(), raw);
    }

    /**
     * 对一段文本做全量清洗：
     * 1. 将所有已知状态码替换为中文
     * 2. 将 camelCase 字段名替换为中文（如果匹配）
     * 3. 移除 Java 类型名
     */
    public static String sanitize(String text) {
        if (text == null || text.isEmpty()) return text;
        String result = text;

        // 1. 替换 Java 类型名
        result = JAVA_TYPE_PATTERN.matcher(result).replaceAll("");

        // 2. 替换已知状态码（长词优先，避免 PENDING 误匹配 PENDING_REPAIR）
        for (Map.Entry<String, String> e : STATUS_MAP.entrySet()) {
            if (result.contains(e.getKey())) {
                result = result.replace(e.getKey(), e.getValue());
            }
        }

        // 3. 替换已知 camelCase 字段名
        for (Map.Entry<String, String> e : FIELD_MAP.entrySet()) {
            if (result.contains(e.getKey())) {
                result = result.replace(e.getKey(), e.getValue());
            }
        }

        return result.trim();
    }
}
