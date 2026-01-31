package com.fashion.supplychain.common;

/**
 * 缓存常量类
 * 定义系统中使用的缓存名称和key前缀
 */
public class CacheConstants {

    /**
     * 缓存名称
     */
    public static final String CACHE_USER = "user";
    public static final String CACHE_DICT = "dict";
    public static final String CACHE_STYLE = "style";
    public static final String CACHE_ORDER = "order";
    public static final String CACHE_PERMISSION = "permission";
    public static final String CACHE_FACTORY = "factory";
    public static final String CACHE_MATERIAL = "material";

    /**
     * 缓存key前缀
     */
    public static final String KEY_PREFIX_USER = "user:";
    public static final String KEY_PREFIX_DICT = "dict:";
    public static final String KEY_PREFIX_STYLE = "style:";
    public static final String KEY_PREFIX_ORDER = "order:";
    public static final String KEY_PREFIX_PERMISSION = "permission:";
    public static final String KEY_PREFIX_FACTORY = "factory:";
    public static final String KEY_PREFIX_MATERIAL = "material:";

    /**
     * 缓存key - 用户信息
     */
    public static String userKey(Long userId) {
        return KEY_PREFIX_USER + userId;
    }

    /**
     * 缓存key - 用户权限
     */
    public static String userPermissionKey(Long userId) {
        return KEY_PREFIX_PERMISSION + "user:" + userId;
    }

    /**
     * 缓存key - 字典类型
     */
    public static String dictTypeKey(String dictType) {
        return KEY_PREFIX_DICT + "type:" + dictType;
    }

    /**
     * 缓存key - 款式信息
     */
    public static String styleKey(Long styleId) {
        return KEY_PREFIX_STYLE + styleId;
    }

    /**
     * 缓存key - 订单信息
     */
    public static String orderKey(String orderNo) {
        return KEY_PREFIX_ORDER + orderNo;
    }

    /**
     * 缓存key - 工厂信息
     */
    public static String factoryKey(Long factoryId) {
        return KEY_PREFIX_FACTORY + factoryId;
    }

    /**
     * 缓存key - 物料信息
     */
    public static String materialKey(Long materialId) {
        return KEY_PREFIX_MATERIAL + materialId;
    }
}
