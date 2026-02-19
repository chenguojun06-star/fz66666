package com.fashion.supplychain.common.constant;

/**
 * 业务常量类
 * <p>
 * 定义系统中使用的业务相关常量，包括：
 * - 业务类型
 * - 操作类型
 * - 数据来源
 * - 关闭来源
 * </p>
 */
public final class BusinessConstants {

    private BusinessConstants() {
        // 私有构造方法，防止实例化
    }

    // ==================== 业务类型 ====================

    /**
     * 业务类型：生产订单
     */
    public static final String BIZ_TYPE_PRODUCTION_ORDER = "production";

    /**
     * 业务类型：物料采购
     */
    public static final String BIZ_TYPE_MATERIAL_PURCHASE = "material_purchase";

    /**
     * 业务类型：裁剪任务
     */
    public static final String BIZ_TYPE_CUTTING_TASK = "cutting_task";

    /**
     * 业务类型：入库
     */
    public static final String BIZ_TYPE_WAREHOUSING = "warehousing";

    /**
     * 业务类型：出库
     */
    public static final String BIZ_TYPE_OUTSTOCK = "outstock";

    /**
     * 业务类型：工资结算
     */
    public static final String BIZ_TYPE_PAYROLL = "payroll";

    /**
     * 业务类型：用户
     */
    public static final String BIZ_TYPE_USER = "user";

    /**
     * 业务类型：角色
     */
    public static final String BIZ_TYPE_ROLE = "role";

    /**
     * 业务类型：工厂
     */
    public static final String BIZ_TYPE_FACTORY = "factory";

    // ==================== 操作类型 ====================

    /**
     * 操作类型：创建
     */
    public static final String ACTION_CREATE = "CREATE";

    /**
     * 操作类型：更新
     */
    public static final String ACTION_UPDATE = "UPDATE";

    /**
     * 操作类型：删除
     */
    public static final String ACTION_DELETE = "DELETE";

    /**
     * 操作类型：查询
     */
    public static final String ACTION_QUERY = "QUERY";

    /**
     * 操作类型：导出
     */
    public static final String ACTION_EXPORT = "EXPORT";

    /**
     * 操作类型：导入
     */
    public static final String ACTION_IMPORT = "IMPORT";

    /**
     * 操作类型：审核
     */
    public static final String ACTION_AUDIT = "AUDIT";

    /**
     * 操作类型：取消
     */
    public static final String ACTION_CANCEL = "CANCEL";

    /**
     * 操作类型：关闭
     */
    public static final String ACTION_CLOSE = "CLOSE";

    /**
     * 操作类型：权限更新
     */
    public static final String ACTION_PERMISSION_UPDATE = "PERMISSION_UPDATE";

    // ==================== 关闭来源 ====================

    /**
     * 关闭来源：我的订单
     */
    public static final String CLOSE_SOURCE_MY_ORDERS = "myOrders";

    /**
     * 关闭来源：生产进度
     */
    public static final String CLOSE_SOURCE_PRODUCTION_PROGRESS = "productionProgress";

    /**
     * 关闭来源：订单列表
     */
    public static final String CLOSE_SOURCE_ORDER_LIST = "orderList";

    /**
     * 关闭来源：系统定时任务
     */
    public static final String CLOSE_SOURCE_SYSTEM_SCHEDULER = "systemScheduler";

    // ==================== 数据来源 ====================

    /**
     * 数据来源：PC端
     */
    public static final String DATA_SOURCE_PC = "PC";

    /**
     * 数据来源：移动端
     */
    public static final String DATA_SOURCE_MOBILE = "MOBILE";

    /**
     * 数据来源：小程序
     */
    public static final String DATA_SOURCE_MINI_PROGRAM = "MINI_PROGRAM";

    /**
     * 数据来源：导入
     */
    public static final String DATA_SOURCE_IMPORT = "IMPORT";

    /**
     * 数据来源：系统
     */
    public static final String DATA_SOURCE_SYSTEM = "SYSTEM";

    // ==================== 删除标志 ====================

    /**
     * 未删除
     */
    public static final Integer DELETE_FLAG_NO = 0;

    /**
     * 已删除
     */
    public static final Integer DELETE_FLAG_YES = 1;

    // ==================== 启用标志 ====================

    /**
     * 禁用
     */
    public static final Integer STATUS_DISABLED = 0;

    /**
     * 启用
     */
    public static final Integer STATUS_ENABLED = 1;

    // ==================== 是/否标志 ====================

    /**
     * 否
     */
    public static final Integer NO = 0;

    /**
     * 是
     */
    public static final Integer YES = 1;

    // ==================== 默认分页参数 ====================

    /**
     * 默认页码
     */
    public static final Integer DEFAULT_PAGE = 1;

    /**
     * 默认每页条数
     */
    public static final Integer DEFAULT_PAGE_SIZE = 10;

    /**
     * 最大每页条数
     */
    public static final Integer MAX_PAGE_SIZE = 1000;
}
