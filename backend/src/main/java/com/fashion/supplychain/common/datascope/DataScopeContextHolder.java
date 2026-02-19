package com.fashion.supplychain.common.datascope;

/**
 * 数据权限上下文Holder（线程安全）
 * 存储在 ThreadLocal 中，MyBatis 拦截器读取后自动清理
 */
public class DataScopeContextHolder {

    private static final ThreadLocal<DataScopeContext> HOLDER = new ThreadLocal<>();

    public static void set(DataScopeContext context) {
        HOLDER.set(context);
    }

    public static DataScopeContext get() {
        return HOLDER.get();
    }

    public static void clear() {
        HOLDER.remove();
    }
}
