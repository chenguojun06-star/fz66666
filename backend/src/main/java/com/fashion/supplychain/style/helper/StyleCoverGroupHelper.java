package com.fashion.supplychain.style.helper;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fashion.supplychain.style.entity.StyleInfo;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.util.StringUtils;

import java.util.ArrayList;
import java.util.List;

/**
 * D-801：款式主图组（{@code t_style_info.cover_group}）的**唯一**解析/序列化出口。
 *
 * <p><b>为什么要收口到一个类</b>：主图组有三个使用点 —— 写入同步
 * （{@code StyleInfoOrchestrator}）、顾客端下发（{@code ShopOrderOrchestrator}）、
 * 前端回退渲染。三处各写一份 JSON 解析，看上去只是几行，但必然出现「写入按 5 张
 * 上限过滤、下发却不过滤」这类不一致，而且症状是顾客端多图/少图，极难定位。
 *
 * <p><b>语义</b>：
 * <ul>
 *   <li>上限 5 张 —— 与淘宝/拼多多/天猫平台一致，多余的截断而不是报错
 *       （少图比报错体验好，且不会让运营白填一遍）</li>
 *   <li>空串/空白项/去首尾空格 —— 上传环节的脏数据在这里统一清掉</li>
 *   <li><b>解析失败或为空时回退到 {@code fallbackCover}</b> ——
 *       保证调用方永远拿得到至少一张图，历史数据（cover_group 为 NULL）
 *       与新字段的行为完全一致，不会因为新增字段导致老款式白图</li>
 * </ul>
 */
public final class StyleCoverGroupHelper {

    /** 平台主图上限：淘宝/拼多多/天猫均为 5 张，第 1 张作搜索结果展示图。 */
    public static final int MAX_COVER_GROUP_SIZE = 5;

    private static final Logger log = LoggerFactory.getLogger(StyleCoverGroupHelper.class);

    private static final ObjectMapper MAPPER = new ObjectMapper();

    private StyleCoverGroupHelper() {
    }

    /**
     * 解析主图组 JSON。
     *
     * @param coverGroupJson {@code t_style_info.cover_group} 原始值，可为 null
     * @param fallbackCover  回退用的单图（{@code t_style_info.cover}）
     * @return 最多 5 张的干净 URL 列表；解析失败或为空时返回 {@code [fallbackCover]}，
     *         两者都没有时返回空列表（调用方按「暂无图片」处理）
     */
    public static List<String> parse(String coverGroupJson, String fallbackCover) {
        if (StringUtils.hasText(coverGroupJson)) {
            try {
                List<String> raw = MAPPER.readValue(coverGroupJson, new TypeReference<List<String>>() { });
                List<String> cleaned = sanitize(raw);
                if (!cleaned.isEmpty()) {
                    return cleaned;
                }
            } catch (Exception ignored) {
                // 解析失败必须走回退而不是抛错：脏数据不该让顾客端整个详情页打不开。
                // 调用方（Orchestrator）会另行 log.error，这里保持静默以免噪音。
            }
        }
        return StringUtils.hasText(fallbackCover) ? List.of(fallbackCover.trim()) : List.of();
    }

    /**
     * 清洗 + 截断到 {@link #MAX_COVER_GROUP_SIZE} 张。
     *
     * <p>不做去重：同一张图被运营重复上传两次是他们的选择，
     * 静默去重会让「我明明传了 5 张却只显示 4 张」变成又一个查不到原因的问题。
     */
    public static List<String> sanitize(List<String> raw) {
        if (raw == null || raw.isEmpty()) {
            return List.of();
        }
        List<String> out = new ArrayList<>(Math.min(raw.size(), MAX_COVER_GROUP_SIZE));
        for (String item : raw) {
            if (StringUtils.hasText(item)) {
                out.add(item.trim());
            }
            if (out.size() == MAX_COVER_GROUP_SIZE) {
                break;
            }
        }
        return out;
    }

    /**
     * D-801：把主图组与 cover 对齐（<b>就地修改</b>传入的 StyleInfo）。
     *
     * <p><b>为什么要同步</b>：C端列表卡片、商品列表缩略图、款式图列工厂
     * （styleImageColumns）全都在读 {@code style.cover}，它们不会去解析 coverGroup。
     * 两边不同步就会出现「上传了 5 张主图，列表还是老图」这种查不到原因的错位。
     *
     * <p><b>规则</b>：
     * <ul>
     *   <li>传了 coverGroup → 以它为准，第 1 张回填 cover</li>
     *   <li>只传了 cover → 组内只有 1 张（兼容只改主图的老调用方）</li>
     *   <li>解析失败 → <b>原样保留并记 error，绝不静默清空</b>：
     *       清空等于把商家已上传的 5 张主图删掉，且用户毫无察觉</li>
     * </ul>
     */
    public static void syncWithCover(StyleInfo styleInfo) {
        String groupJson = styleInfo.getCoverGroup();
        if (!StringUtils.hasText(groupJson)) {
            // 只传了 cover（或都没传）→ cover 为主，组跟着单图走
            if (StringUtils.hasText(styleInfo.getCover())) {
                styleInfo.setCoverGroup(toJson(List.of(styleInfo.getCover())));
            }
            return;
        }
        try {
            List<String> cleaned = parse(groupJson, styleInfo.getCover());
            styleInfo.setCoverGroup(toJson(cleaned));
            styleInfo.setCover(cleaned.isEmpty() ? null : cleaned.get(0));
        } catch (Exception e) {
            log.error("[主图组] 处理失败，coverGroup 原样保留: {}", e.getMessage());
        }
    }

    /** 序列化为 JSON 数组（空列表返回 {@code "[]"}，不返回 null）。 */
    public static String toJson(List<String> covers) {
        try {
            return MAPPER.writeValueAsString(sanitize(covers));
        } catch (Exception e) {
            throw new IllegalStateException("主图组序列化失败: " + e.getMessage(), e);
        }
    }
}