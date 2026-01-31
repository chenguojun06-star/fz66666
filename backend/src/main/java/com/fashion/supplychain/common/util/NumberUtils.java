package com.fashion.supplychain.common.util;

import org.springframework.util.StringUtils;

import java.math.BigDecimal;

/**
 * 数字工具类
 * 统一处理数字转换相关操作
 */
public class NumberUtils {

    /**
     * 安全转换为int，失败返回默认值
     *
     * @param obj          输入对象
     * @param defaultValue 默认值
     * @return int值
     */
    public static int toInt(Object obj, int defaultValue) {
        if (obj == null) {
            return defaultValue;
        }
        if (obj instanceof Number) {
            return ((Number) obj).intValue();
        }
        try {
            String str = obj.toString().trim();
            if (!StringUtils.hasText(str)) {
                return defaultValue;
            }
            return Integer.parseInt(str);
        } catch (NumberFormatException e) {
            return defaultValue;
        }
    }

    /**
     * 安全转换为int，失败返回0
     *
     * @param obj 输入对象
     * @return int值
     */
    public static int toInt(Object obj) {
        return toInt(obj, 0);
    }

    /**
     * 安全转换为long，失败返回默认值
     *
     * @param obj          输入对象
     * @param defaultValue 默认值
     * @return long值
     */
    public static long toLong(Object obj, long defaultValue) {
        if (obj == null) {
            return defaultValue;
        }
        if (obj instanceof Number) {
            return ((Number) obj).longValue();
        }
        try {
            String str = obj.toString().trim();
            if (!StringUtils.hasText(str)) {
                return defaultValue;
            }
            return Long.parseLong(str);
        } catch (NumberFormatException e) {
            return defaultValue;
        }
    }

    /**
     * 安全转换为long，失败返回0
     *
     * @param obj 输入对象
     * @return long值
     */
    public static long toLong(Object obj) {
        return toLong(obj, 0L);
    }

    /**
     * 安全转换为BigDecimal，失败返回默认值
     *
     * @param obj          输入对象
     * @param defaultValue 默认值
     * @return BigDecimal值
     */
    public static BigDecimal toBigDecimal(Object obj, BigDecimal defaultValue) {
        if (obj == null) {
            return defaultValue;
        }
        if (obj instanceof BigDecimal) {
            return (BigDecimal) obj;
        }
        if (obj instanceof Number) {
            return BigDecimal.valueOf(((Number) obj).doubleValue());
        }
        try {
            String str = obj.toString().trim();
            if (!StringUtils.hasText(str)) {
                return defaultValue;
            }
            return new BigDecimal(str);
        } catch (NumberFormatException e) {
            return defaultValue;
        }
    }

    /**
     * 安全转换为BigDecimal，失败返回0
     *
     * @param obj 输入对象
     * @return BigDecimal值
     */
    public static BigDecimal toBigDecimal(Object obj) {
        return toBigDecimal(obj, BigDecimal.ZERO);
    }

    /**
     * 安全转换为double，失败返回默认值
     *
     * @param obj          输入对象
     * @param defaultValue 默认值
     * @return double值
     */
    public static double toDouble(Object obj, double defaultValue) {
        if (obj == null) {
            return defaultValue;
        }
        if (obj instanceof Number) {
            return ((Number) obj).doubleValue();
        }
        try {
            String str = obj.toString().trim();
            if (!StringUtils.hasText(str)) {
                return defaultValue;
            }
            return Double.parseDouble(str);
        } catch (NumberFormatException e) {
            return defaultValue;
        }
    }

    /**
     * 安全转换为double，失败返回0.0
     *
     * @param obj 输入对象
     * @return double值
     */
    public static double toDouble(Object obj) {
        return toDouble(obj, 0.0);
    }

    /**
     * 判断是否为正数
     *
     * @param num 数字
     * @return true为正数
     */
    public static boolean isPositive(Number num) {
        return num != null && num.doubleValue() > 0;
    }

    /**
     * 判断是否为非负数
     *
     * @param num 数字
     * @return true为非负数
     */
    public static boolean isNonNegative(Number num) {
        return num != null && num.doubleValue() >= 0;
    }

    /**
     * 获取两个数中的较大值
     *
     * @param a 第一个数
     * @param b 第二个数
     * @return 较大值
     */
    public static int max(int a, int b) {
        return Math.max(a, b);
    }

    /**
     * 获取两个数中的较小值
     *
     * @param a 第一个数
     * @param b 第二个数
     * @return 较小值
     */
    public static int min(int a, int b) {
        return Math.min(a, b);
    }
}
