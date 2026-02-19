package com.fashion.supplychain.common.utils;

import java.io.UnsupportedEncodingException;
import java.net.URLDecoder;
import java.net.URLEncoder;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ThreadLocalRandom;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * 字符串工具类
 * 提供常用的字符串处理方法
 */
public final class StringUtils {

    private StringUtils() {
        // 私有构造函数，防止实例化
    }

    /**
     * 判断字符串是否为空
     * 
     * @param str 字符串
     * @return 是否为空
     */
    public static boolean isEmpty(String str) {
        return str == null || str.length() == 0;
    }

    /**
     * 判断字符串是否不为空
     * 
     * @param str 字符串
     * @return 是否不为空
     */
    public static boolean isNotEmpty(String str) {
        return !isEmpty(str);
    }

    /**
     * 判断字符串是否为空白
     * 
     * @param str 字符串
     * @return 是否为空白
     */
    public static boolean isBlank(String str) {
        if (str == null) {
            return true;
        }
        for (int i = 0; i < str.length(); i++) {
            if (!Character.isWhitespace(str.charAt(i))) {
                return false;
            }
        }
        return true;
    }

    /**
     * 判断字符串是否不为空白
     * 
     * @param str 字符串
     * @return 是否不为空白
     */
    public static boolean isNotBlank(String str) {
        return !isBlank(str);
    }

    /**
     * 去除字符串两端的空白字符
     * 
     * @param str 字符串
     * @return 去除空白后的字符串
     */
    public static String trim(String str) {
        return str == null ? null : str.trim();
    }

    /**
     * 去除字符串两端的空白字符，如果结果为空则返回null
     * 
     * @param str 字符串
     * @return 处理后的字符串
     */
    public static String trimToNull(String str) {
        String result = trim(str);
        return isEmpty(result) ? null : result;
    }

    /**
     * 去除字符串两端的空白字符，如果结果为空则返回空字符串
     * 
     * @param str 字符串
     * @return 处理后的字符串
     */
    public static String trimToEmpty(String str) {
        return str == null ? "" : str.trim();
    }

    /**
     * 将字符串转换为小写
     * 
     * @param str 字符串
     * @return 小写字符串
     */
    public static String toLowerCase(String str) {
        return str == null ? null : str.toLowerCase();
    }

    /**
     * 将字符串转换为大写
     * 
     * @param str 字符串
     * @return 大写字符串
     */
    public static String toUpperCase(String str) {
        return str == null ? null : str.toUpperCase();
    }

    /**
     * 比较两个字符串是否相等，忽略大小写
     * 
     * @param str1 字符串1
     * @param str2 字符串2
     * @return 是否相等
     */
    public static boolean equalsIgnoreCase(String str1, String str2) {
        if (str1 == null) {
            return str2 == null;
        }
        return str1.equalsIgnoreCase(str2);
    }

    /**
     * 截取字符串的前n个字符
     * 
     * @param str    字符串
     * @param length 长度
     * @return 截取后的字符串
     */
    public static String substring(String str, int length) {
        if (str == null) {
            return null;
        }
        if (length < 0) {
            return str;
        }
        if (str.length() <= length) {
            return str;
        }
        return str.substring(0, length);
    }

    /**
     * 截取字符串的前n个字符，如果超过则添加省略号
     * 
     * @param str    字符串
     * @param length 长度
     * @return 截取后的字符串
     */
    public static String substringWithEllipsis(String str, int length) {
        if (str == null) {
            return null;
        }
        if (length < 0) {
            return str;
        }
        if (str.length() <= length) {
            return str;
        }
        return str.substring(0, length) + "...";
    }

    /**
     * 链接地址编码
     * 
     * @param str 字符串
     * @return 编码后的字符串
     */
    public static String urlEncode(String str) {
        if (str == null) {
            return null;
        }
        try {
            return URLEncoder.encode(str, "UTF-8");
        } catch (UnsupportedEncodingException e) {
            throw new RuntimeException(e);
        }
    }

    /**
     * 链接地址解码
     * 
     * @param str 字符串
     * @return 解码后的字符串
     */
    public static String urlDecode(String str) {
        if (str == null) {
            return null;
        }
        try {
            return URLDecoder.decode(str, "UTF-8");
        } catch (UnsupportedEncodingException e) {
            throw new RuntimeException(e);
        }
    }

    /**
     * 替换字符串中的所有匹配项
     * 
     * @param str    原始字符串
     * @param oldStr 要替换的字符串
     * @param newStr 替换后的字符串
     * @return 替换后的字符串
     */
    public static String replaceAll(String str, String oldStr, String newStr) {
        if (str == null) {
            return null;
        }
        if (oldStr == null || newStr == null) {
            return str;
        }
        return str.replaceAll(oldStr, newStr);
    }

    /**
     * 分割字符串
     * 
     * @param str       字符串
     * @param separator 分隔符
     * @return 分割后的字符串数组
     */
    public static String[] split(String str, String separator) {
        if (str == null) {
            return new String[0];
        }
        if (separator == null) {
            return new String[] { str };
        }
        return str.split(separator);
    }

    /**
     * 分割字符串为List
     * 
     * @param str       字符串
     * @param separator 分隔符
     * @return 分割后的List
     */
    public static List<String> splitToList(String str, String separator) {
        String[] array = split(str, separator);
        List<String> list = new ArrayList<>();
        for (String s : array) {
            if (isNotBlank(s)) {
                list.add(s.trim());
            }
        }
        return list;
    }

    /**
     * 拼接字符串
     * 
     * @param strings 字符串数组
     * @return 拼接后的字符串
     */
    public static String join(String... strings) {
        if (strings == null) {
            return null;
        }
        StringBuilder sb = new StringBuilder();
        for (String str : strings) {
            if (str != null) {
                sb.append(str);
            }
        }
        return sb.toString();
    }

    /**
     * 拼接字符串，使用分隔符
     * 
     * @param separator 分隔符
     * @param strings   字符串数组
     * @return 拼接后的字符串
     */
    public static String join(String separator, String... strings) {
        if (strings == null) {
            return null;
        }
        if (separator == null) {
            separator = "";
        }
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < strings.length; i++) {
            if (strings[i] != null) {
                if (i > 0) {
                    sb.append(separator);
                }
                sb.append(strings[i]);
            }
        }
        return sb.toString();
    }

    /**
     * 判断字符串是否为数字
     * 
     * @param str 字符串
     * @return 是否为数字
     */
    public static boolean isNumeric(String str) {
        if (str == null) {
            return false;
        }
        for (int i = 0; i < str.length(); i++) {
            if (!Character.isDigit(str.charAt(i))) {
                return false;
            }
        }
        return true;
    }

    /**
     * 判断字符串是否为手机号码
     * 
     * @param str 字符串
     * @return 是否为手机号码
     */
    public static boolean isPhoneNumber(String str) {
        if (str == null) {
            return false;
        }
        // 简单的手机号码正则表达式，匹配11位数字
        String regex = "^1[3-9]\\d{9}$";
        Pattern pattern = Pattern.compile(regex);
        Matcher matcher = pattern.matcher(str);
        return matcher.matches();
    }

    /**
     * 判断字符串是否为邮箱地址
     * 
     * @param str 字符串
     * @return 是否为邮箱地址
     */
    public static boolean isEmail(String str) {
        if (str == null) {
            return false;
        }
        // 简单的邮箱地址正则表达式
        String regex = "^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$";
        Pattern pattern = Pattern.compile(regex);
        Matcher matcher = pattern.matcher(str);
        return matcher.matches();
    }

    /**
     * 生成随机字符串
     * 
     * @param length 长度
     * @return 随机字符串
     */
    public static String randomString(int length) {
        if (length <= 0) {
            return "";
        }
        String chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
        StringBuilder sb = new StringBuilder(length);
        for (int i = 0; i < length; i++) {
            int index = (int) (ThreadLocalRandom.current().nextDouble() * chars.length());
            sb.append(chars.charAt(index));
        }
        return sb.toString();
    }
}
