package com.fashion.supplychain.common.util;

import org.springframework.util.StringUtils;

import java.text.Normalizer;
import java.util.regex.Pattern;

/**
 * 文本工具类
 * 统一处理文本相关操作
 */
public class TextUtils {

    private static final Pattern WHITESPACE_PATTERN = Pattern.compile("\\s+");

    /**
     * 规范化字符串：去除首尾空格、合并多个空格为一个
     *
     * @param input 输入字符串
     * @return 规范化后的字符串
     */
    public static String normalize(String input) {
        if (!StringUtils.hasText(input)) {
            return "";
        }
        // 去除首尾空格，合并多个空格为一个
        String normalized = WHITESPACE_PATTERN.matcher(input.trim()).replaceAll(" ");
        // 统一转为小写（可选，根据业务需求）
        return normalized.toLowerCase();
    }

    /**
     * 安全获取字符串，处理null值
     *
     * @param obj 输入对象
     * @return 字符串，null返回空字符串
     */
    public static String safeText(Object obj) {
        if (obj == null) {
            return "";
        }
        return obj.toString().trim();
    }

    /**
     * 安全获取字符串，处理null值，可指定默认值
     *
     * @param obj          输入对象
     * @param defaultValue 默认值
     * @return 字符串
     */
    public static String safeText(Object obj, String defaultValue) {
        if (obj == null) {
            return defaultValue;
        }
        String text = obj.toString().trim();
        return text.isEmpty() ? defaultValue : text;
    }

    /**
     * 去除字符串中的特殊字符，只保留字母、数字和中文
     *
     * @param input 输入字符串
     * @return 处理后的字符串
     */
    public static String removeSpecialChars(String input) {
        if (!StringUtils.hasText(input)) {
            return "";
        }
        return input.replaceAll("[^a-zA-Z0-9\\u4e00-\\u9fa5]", "");
    }

    /**
     * 规范化Unicode字符（如全角转半角）
     *
     * @param input 输入字符串
     * @return 规范化后的字符串
     */
    public static String normalizeUnicode(String input) {
        if (!StringUtils.hasText(input)) {
            return "";
        }
        return Normalizer.normalize(input, Normalizer.Form.NFKC);
    }

    /**
     * 截断字符串，超过指定长度添加省略号
     *
     * @param input  输入字符串
     * @param maxLen 最大长度
     * @return 截断后的字符串
     */
    public static String truncate(String input, int maxLen) {
        if (!StringUtils.hasText(input) || input.length() <= maxLen) {
            return input;
        }
        return input.substring(0, maxLen) + "...";
    }

    /**
     * 判断字符串是否为空或空白
     *
     * @param str 输入字符串
     * @return true为空或空白
     */
    public static boolean isEmpty(String str) {
        return !StringUtils.hasText(str);
    }

    /**
     * 判断字符串是否不为空且不为空白
     *
     * @param str 输入字符串
     * @return true不为空
     */
    public static boolean isNotEmpty(String str) {
        return StringUtils.hasText(str);
    }

    /**
     * 计算字符串中的简体中文字符占比（0.0~1.0）。
     * 用于校验 LLM 输出文案是否为中文——第三方 flash 级模型对中文指令遵循不稳，
     * 英文输出一旦原样持久化会长期展示给用户（D-112 教训）。
     *
     * @param input 输入字符串
     * @return 中文字符数 / 总字符数；空白输入返回 0
     */
    public static double chineseRatio(String input) {
        if (!StringUtils.hasText(input)) {
            return 0d;
        }
        String text = input.trim();
        long chineseCount = text.chars().filter(c -> c >= 0x4E00 && c <= 0x9FFF).count();
        return (double) chineseCount / text.length();
    }

    /**
     * 判断 LLM 生成的用户可见文案是否可视为合格中文输出。
     * 阈值 0.25：正常中文句子远高于此值，纯英文/代码文本接近 0；
     * 容忍少量英文术语、款号、数字混杂。
     */
    public static boolean isUsableChineseText(String input) {
        return StringUtils.hasText(input) && chineseRatio(input) >= 0.25d;
    }
}
