package com.fashion.supplychain.shop.orchestration;

import java.util.regex.Pattern;

/**
 * 生产工艺内容识别（D-781）
 *
 * <p><b>为什么需要</b>：用户明确要求「生产工艺说明不应该出现在电商页面」。
 * 线上实测款式 BR25CQ0573B 的 {@code description} 里存的是
 * 「大货工艺要求 / 裁剪工艺说明 / 缝纫工艺 / 印花 / 钉珠 / 包装工艺」，
 * 这些是给车间看的生产工序文档，出现在顾客端详情页既看不懂、也属内部资料外泄。
 *
 * <p><b>为什么不直接删数据</b>：这字段对生产是有用的（工厂、车间都要看），
 * 删掉等于毁掉生产资料。正确做法是<b>只对顾客端隐藏</b>，并明确告诉商家原因。
 *
 * <p><b>为什么不在前端做</b>：隐藏规则属于业务口径，必须服务端统一执行 ——
 * 否则哪天多一个入口就漏出去了，而这类资料外泄是**不可逆**的。
 */
public final class ProductionContentDetector {

    private ProductionContentDetector() {
    }

    /**
     * 生产工艺特征词。命中数达到阈值即判定为「生产资料」。
     *
     * <p>刻意只用**工序/工艺类**词，不碰「面料」「工艺」等可能出现在正常商品
     * 描述里的中性词 —— 宁可漏判（照常显示），也不要把正常商品描述误杀。
     */
    private static final String[] PROCESS_MARKERS = {
            "大货工艺", "工艺要求", "工艺说明", "裁剪", "缝纫", "制版", "打版", "放码",
            "裁床", "车缝", "钉珠", "绣花", "印花", "洗水", "整烫", "包装工艺",
            "工序", "生产线", "车位", "产线", "面辅料清单", "工艺单"
    };

    /**
     * 判定阈值：命中 ≥2 个特征词且占比达到要求，才判定为生产资料。
     *
     * <p>只用 1 个词容易误伤（例如描述里顺带提一句「印花」，可能真是卖点）；
     * 要求 2 个以上能让误判概率显著下降，而漏判的后果只是照常显示，可接受。
     */
    private static final int MIN_HITS = 2;

    /** 去掉 HTML 标签后的纯文本长度下限，太短的不判（避免拿「工艺」两个字就定罪） */
    private static final int MIN_LENGTH = 40;

    private static final Pattern TAG = Pattern.compile("<[^>]+>");

    /**
     * @param text 原始描述（可能是富文本 HTML）
     * @return true = 判定为生产工艺资料，顾客端应隐藏
     */
    public static boolean looksLikeProductionContent(String text) {
        if (text == null || text.isBlank()) {
            return false;
        }
        String plain = TAG.matcher(text).replaceAll(" ").replaceAll("\\s+", " ").trim();
        if (plain.length() < MIN_LENGTH) {
            return false;
        }
        int hits = 0;
        for (String marker : PROCESS_MARKERS) {
            if (plain.contains(marker)) {
                hits++;
            }
        }
        return hits >= MIN_HITS;
    }

    /** 给运营看的说明文案 */
    public static String hideReason() {
        return "该内容是生产工艺/工序资料，已自动对顾客端隐藏（车间与工厂内部仍可见）。"
                + "如需对顾客展示，请改写为商品卖点描述。";
    }
}