package com.fashion.supplychain.common.util;

import cn.hutool.extra.pinyin.PinyinUtil;
import lombok.experimental.UtilityClass;
import lombok.extern.slf4j.Slf4j;

/**
 * 拼音搜索工具类
 * 依赖：hutool-all + pinyin4j（pom.xml 已添加）
 * 用途：支持用户用拼音首字母或全拼搜索中文款式名、工厂名等
 */
@Slf4j
@UtilityClass
public class PinyinSearchUtils {

    /**
     * 判断是否为纯拼音查询（全英文小写字母）
     * 如："hlq" "honglianqun" 返回 true；"红色" "PO2024" 返回 false
     */
    public static boolean isPinyinQuery(String q) {
        return q != null && !q.isBlank() && q.matches("[a-z]+");
    }

    /**
     * 获取汉字首字母缩写，如 "红色连衣裙" → "hslqy"
     * 非中文字符返回原字符的小写
     */
    public static String toInitials(String text) {
        if (text == null || text.isBlank()) return "";
        try {
            return PinyinUtil.getFirstLetter(text, "").toLowerCase();
        } catch (Exception e) {
            log.trace("[PinyinSearch] toInitials 失败: text='{}' err={}", text, e.getMessage());
            return "";
        }
    }

    /**
     * 获取全拼，如 "红色" → "hongsè" → 去声调小写
     */
    public static String toFullPinyin(String text) {
        if (text == null || text.isBlank()) return "";
        try {
            return PinyinUtil.getPinyin(text, "").toLowerCase().replaceAll("[^a-z]", "");
        } catch (Exception e) {
            log.trace("[PinyinSearch] toFullPinyin 失败: text='{}' err={}", text, e.getMessage());
            return "";
        }
    }

    /**
     * 检查中文文本是否匹配拼音查询
     * 支持：首字母缩写匹配、全拼包含匹配
     * 例：query="hlqy" 匹配 "红色连衣裙"；query="honglian" 也匹配
     */
    public static boolean matchesPinyin(String chineseText, String pinyinQuery) {
        if (chineseText == null || pinyinQuery == null || pinyinQuery.isBlank()) return false;
        String q = pinyinQuery.toLowerCase().trim();
        String initials = toInitials(chineseText);
        String full = toFullPinyin(chineseText);
        return initials.contains(q) || full.contains(q);
    }
}
