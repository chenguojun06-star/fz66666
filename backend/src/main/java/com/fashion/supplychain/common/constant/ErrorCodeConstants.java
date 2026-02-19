package com.fashion.supplychain.common.constant;

/**
 * 错误码常量类
 * <p>
 * 统一定义系统中使用的错误码，便于错误追踪和国际化处理
 * </p>
 */
public final class ErrorCodeConstants {

    private ErrorCodeConstants() {
        // 私有构造方法，防止实例化
    }

    // ==================== 通用错误码 ====================

    /**
     * 成功
     */
    public static final String SUCCESS = "SUCCESS";

    /**
     * 系统错误
     */
    public static final String SYSTEM_ERROR = "SYSTEM_ERROR";

    /**
     * 业务错误
     */
    public static final String BUSINESS_ERROR = "BUSINESS_ERROR";

    /**
     * 参数错误
     */
    public static final String PARAM_ERROR = "PARAM_ERROR";

    /**
     * 参数缺失
     */
    public static final String PARAM_MISSING = "PARAM_MISSING";

    /**
     * 参数格式错误
     */
    public static final String PARAM_FORMAT_ERROR = "PARAM_FORMAT_ERROR";

    // ==================== 数据相关错误码 ====================

    /**
     * 数据不存在
     */
    public static final String NOT_FOUND = "NOT_FOUND";

    /**
     * 数据已存在
     */
    public static final String ALREADY_EXISTS = "ALREADY_EXISTS";

    /**
     * 数据已被删除
     */
    public static final String ALREADY_DELETED = "ALREADY_DELETED";

    /**
     * 数据状态不正确
     */
    public static final String STATUS_ERROR = "STATUS_ERROR";

    /**
     * 数据关联错误
     */
    public static final String DATA_RELATION_ERROR = "DATA_RELATION_ERROR";

    // ==================== 权限相关错误码 ====================

    /**
     * 未登录
     */
    public static final String NOT_LOGIN = "NOT_LOGIN";

    /**
     * 登录已过期
     */
    public static final String TOKEN_EXPIRED = "TOKEN_EXPIRED";

    /**
     * 权限不足
     */
    public static final String NO_PERMISSION = "NO_PERMISSION";

    /**
     * 访问被拒绝
     */
    public static final String ACCESS_DENIED = "ACCESS_DENIED";

    // ==================== 业务操作错误码 ====================

    /**
     * 操作不允许
     */
    public static final String OPERATION_NOT_ALLOWED = "OPERATION_NOT_ALLOWED";

    /**
     * 操作频繁
     */
    public static final String OPERATION_TOO_FREQUENT = "OPERATION_TOO_FREQUENT";

    /**
     * 操作超时
     */
    public static final String OPERATION_TIMEOUT = "OPERATION_TIMEOUT";

    // ==================== 文件相关错误码 ====================

    /**
     * 文件上传失败
     */
    public static final String FILE_UPLOAD_ERROR = "FILE_UPLOAD_ERROR";

    /**
     * 文件下载失败
     */
    public static final String FILE_DOWNLOAD_ERROR = "FILE_DOWNLOAD_ERROR";

    /**
     * 文件格式不支持
     */
    public static final String FILE_FORMAT_NOT_SUPPORT = "FILE_FORMAT_NOT_SUPPORT";

    /**
     * 文件大小超出限制
     */
    public static final String FILE_SIZE_EXCEED = "FILE_SIZE_EXCEED";

    // ==================== 生产订单相关错误码 ====================

    /**
     * 生产订单不存在
     */
    public static final String ORDER_NOT_FOUND = "ORDER_NOT_FOUND";

    /**
     * 生产订单状态不正确
     */
    public static final String ORDER_STATUS_ERROR = "ORDER_STATUS_ERROR";

    /**
     * 生产订单已关闭
     */
    public static final String ORDER_ALREADY_CLOSED = "ORDER_ALREADY_CLOSED";

    /**
     * 生产订单已完成
     */
    public static final String ORDER_ALREADY_COMPLETED = "ORDER_ALREADY_COMPLETED";

    // ==================== 款式相关错误码 ====================

    /**
     * 款式不存在
     */
    public static final String STYLE_NOT_FOUND = "STYLE_NOT_FOUND";

    /**
     * 款式编号已存在
     */
    public static final String STYLE_NO_ALREADY_EXISTS = "STYLE_NO_ALREADY_EXISTS";

    // ==================== 用户相关错误码 ====================

    /**
     * 用户不存在
     */
    public static final String USER_NOT_FOUND = "USER_NOT_FOUND";

    /**
     * 用户名或密码错误
     */
    public static final String USERNAME_OR_PASSWORD_ERROR = "USERNAME_OR_PASSWORD_ERROR";

    /**
     * 用户已被禁用
     */
    public static final String USER_DISABLED = "USER_DISABLED";

    /**
     * 用户已被锁定
     */
    public static final String USER_LOCKED = "USER_LOCKED";
}
