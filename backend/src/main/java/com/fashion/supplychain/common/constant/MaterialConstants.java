package com.fashion.supplychain.common.constant;

/**
 * 物料与采购相关常量
 */
public class MaterialConstants {
    private MaterialConstants() {}

    // ==================== 状态常量 ====================
    public static final String STATUS_PENDING = "pending";
    public static final String STATUS_CANCELLED = "cancelled";
    public static final String STATUS_COMPLETED = "completed";
    public static final String STATUS_PARTIAL = "partial";
    public static final String STATUS_RECEIVED = "received";

    // ==================== 物料类型常量 ====================
    public static final String TYPE_FABRIC = "fabric";
    public static final String TYPE_LINING = "lining";
    public static final String TYPE_ACCESSORY = "accessory";
    public static final String TYPE_FABRIC_CN = "面料";
    public static final String TYPE_LINING_CN = "里料";
    public static final String TYPE_ACCESSORY_CN = "辅料";

    // ==================== 业务规则常量 ====================
    public static final int DATE_LENGTH_FULL = 19;
    public static final int DATE_LENGTH_MINUTE = 16;
    
    /**
     * 到货率阈值（百分比），低于此值需要填写备注
     */
    public static final int ARRIVAL_RATE_THRESHOLD_REMARK = 70;
    
    // ==================== 编号前缀 ====================
    public static final String PURCHASE_NO_PREFIX = "PUR";

    // ==================== 日期格式 ====================
    public static final String DATE_FORMAT_FULL = "yyyy-MM-dd HH:mm:ss";
    public static final String DATE_FORMAT_MINUTE = "yyyy-MM-dd HH:mm";
}
