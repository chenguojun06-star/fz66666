package com.fashion.supplychain.production.helper;

import com.fashion.supplychain.style.entity.SecondaryProcess;
import com.fashion.supplychain.style.entity.StyleInfo;
import lombok.extern.slf4j.Slf4j;

import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * 工人提示生成器 —— 把样衣开发阶段识别出的信息，组织成工人扫码时能看懂的结构化提示。
 *
 * <p>调用方只需 {@link #compose(StyleInfo, List)} 或 {@link #flattenInto(Map, StyleInfo, List)}。</p>
 *
 * <p>岗位差异化提示逻辑：</p>
 * <ul>
 *   <li>车缝工：关注面料厚薄、针号、工艺复杂度</li>
 *   <li>质检工：关注难度等级、二次工艺、AI 视觉摘要</li>
 *   <li>仓管：关注款式信息，减少漏发货</li>
 * </ul>
 *
 * <p>针号推荐优先级：</p>
 * <ol>
 *   <li>人工备注（description）中明确写了针号 → 直接使用，标注"样衣工艺备注"</li>
 *   <li>AI 视觉分析（imageInsight + visionRaw）识别面料类型 → 按面料厚度推荐，标注"AI 推荐"</li>
 *   <li>面料成分（fabricComposition）解析成分比例 → 按主导成分推荐，标注"AI 推荐"</li>
 *   <li>以上都没有 → 不展示针号（不猜测）</li>
 * </ol>
 */
@Slf4j
public final class WorkerHintComposer {

    /** 针号关键词：9号针、11号针、九号针 等 */
    private static final Pattern NEEDLE_PATTERN = Pattern.compile(
            "([0-9一二三四五六七八九十]+\\s*号?针)"
    );

    /** 常见工艺关键词（按优先级从高到低） */
    private static final List<String> PROCESS_KEYWORDS = new ArrayList<>(List.of(
            "开袋", "开袋", "锁眼", "钉扣", "打枣", "凤眼",
            "开叉", "袖开叉", "打褶", "压褶", "嵌线", "嵌条",
            "四合扣", "工字扣", "暗扣", "拉链", "隐形拉链",
            "粘衬", "烫衬", "拷边", "包缝", "锁边",
            "车缝", "平车", "双针", "绷缝", "冚车",
            "绣花", "印花", "烫印", "烫钻", "压胶",
            "抽绳", "穿绳", "滚边", "包边", "翻领",
            "领窝", "扣眼", "打线钉", "锁边"
    ));

    /** 难度等级 → 颜色映射（前端也会参考，但后端先给出难度等级文字，UI 用等级判断颜色） */
    private static final Map<String, String> DIFFICULTY_SEVERITY;
    static {
        Map<String, String> m = new LinkedHashMap<>();
        m.put("简单款", "LOW");
        m.put("中等难度", "MEDIUM");
        m.put("工艺复杂", "HIGH");
        m.put("高定级", "CRITICAL");
        DIFFICULTY_SEVERITY = Collections.unmodifiableMap(m);
    }

    /** 单次调用最大提取项数（防止 description 过长导致提示喧宾夺主） */
    private static final int MAX_PROCESS_HINTS = 5;

    // ================== 面料→针号推荐表 ==================

    /** 面料类型关键词 → 针号推荐（按厚度从薄到厚排列，匹配时取第一个命中的） */
    private static final List<FabricNeedleRule> FABRIC_NEEDLE_RULES = List.of(
            // —— 薄面料（9号针） ——
            new FabricNeedleRule("9号针", "薄面料",
                    List.of("真丝", "丝绸", "缎面", "缎", "雪纺", "乔其", "欧根纱", "里布", " lining", "薄纱"),
                    "面料轻薄细密，使用细针避免针眼和抽丝"),
            // —— 中薄面料（11号针） ——
            new FabricNeedleRule("11号针", "中薄面料",
                    List.of("雪棉", "薄棉", "府绸", "锦纶", "尼龙", "涤纶薄", "雪尼尔",
                            "蕾丝", "网纱", "薄纱", "弹力", "氨纶", "莱卡", " stretch"),
                    "中薄面料或含弹力成分，使用中等细针防止跳针"),
            // —— 中等面料（12号针） ——
            new FabricNeedleRule("12号针", "中等面料",
                    List.of("棉", "涤纶", "polyester", "棉麻", "麻", "linen", "人棉", "粘胶",
                            "莫代尔", "modal", "普通", "常规", "梭织", "针织", " fleece"),
                    "中等厚度面料，12号针为通用选择"),
            // —— 厚面料（14号针） ——
            new FabricNeedleRule("14号针", "厚面料",
                    List.of("牛仔", "denim", "帆布", "canvas", "厚棉", "粗纺", "毛呢", "呢料",
                            " wool", "woolen", "粗针", "粗线", "夹克", "外衣", "coat"),
                    "面料较厚，使用粗针避免断针和跳针"),
            // —— 极厚面料（16号针） ——
            new FabricNeedleRule("16号针", "极厚面料",
                    List.of("皮革", "leather", "人造革", "pu皮", "厚皮", "复合面料",
                            "多层贴合", "极厚"),
                    "极厚面料或皮革，需专用粗针")
    );

    /** 面料成分 → 面料类型推断（用于 fabricComposition 文本解析） */
    private static final List<CompositionRule> COMPOSITION_RULES = List.of(
            // 真丝/缎面类 → 薄
            new CompositionRule(List.of("真丝", "丝", "silk", "缎", "satin"), "薄", "真丝/缎面"),
            // 雪纺/乔其 → 薄
            new CompositionRule(List.of("雪纺", "乔其", "chiffon"), "薄", "雪纺类"),
            // 氨纶/莱卡 → 弹力
            new CompositionRule(List.of("氨纶", "莱卡", "spandex", "elastane"), "弹力", "弹力面料"),
            // 麻 → 中等偏厚
            new CompositionRule(List.of("麻", "linen"), "中等", "麻类"),
            // 羊毛/呢料 → 厚
            new CompositionRule(List.of("羊毛", "wool", "呢", "粗纺"), "厚", "毛呢类"),
            // 牛仔 → 厚
            new CompositionRule(List.of("牛仔", "denim"), "厚", "牛仔"),
            // 皮革 → 极厚
            new CompositionRule(List.of("皮革", "leather", "pu皮"), "极厚", "皮革"),
            // 涤纶/聚酯纤维 → 中等
            new CompositionRule(List.of("涤纶", "polyester", "聚酯"), "中等", "涤纶"),
            // 棉 → 中等（最常见，放后面）
            new CompositionRule(List.of("棉", "cotton"), "中等", "棉")
    );

    private WorkerHintComposer() {}

    /**
     * 生成所有工人提示字段，放入 info map 中。
     * 若 styleInfo 为 null，保持 info 不变（不阻断扫码主流程）。
     *
     * <p>重要原则：针号优先使用人工备注（description），无备注时根据 AI 视觉分析和面料成分智能推荐。
     * 所有推荐均标注来源（"样衣工艺备注"或"AI 推荐·面料类型"），工人以实际面料手感为准。</p>
     */
    public static void composeInto(Map<String, Object> info, StyleInfo si, List<SecondaryProcess> secondaryProcesses) {
        if (si == null || info == null) return;

        // —— 基础字段（难度 / 面料 / 视觉摘要）——
        if (si.getDifficultyScore() != null) info.put("difficultyScore", si.getDifficultyScore());
        safePutText(info, "difficultyLevel", si.getDifficultyLevel());
        safePutText(info, "difficultyLabel", si.getDifficultyLabel());
        safePutText(info, "imageInsight", si.getImageInsight());
        safePutText(info, "visionRaw", si.getVisionRaw());
        safePutText(info, "fabricComposition", si.getFabricComposition());
        safePutText(info, "fabricCompositionParts", si.getFabricCompositionParts());
        safePutText(info, "description", si.getDescription());
        safePutText(info, "cover", si.getCover());

        // 难度等级 severity：给前端用于决定颜色/图标
        String difficultyLabel = safeTrim(si.getDifficultyLabel());
        if (difficultyLabel != null) {
            String severity = DIFFICULTY_SEVERITY.getOrDefault(difficultyLabel, computeSeverityByScore(si.getDifficultyScore()));
            info.put("difficultySeverity", severity);
        } else if (si.getDifficultyScore() != null) {
            info.put("difficultySeverity", computeSeverityByScore(si.getDifficultyScore()));
        }

        // —— 针号提示：人工备注优先，AI 智能推荐兜底 ——
        String desc = safeTrim(si.getDescription());
        String needleMatch = null;
        if (desc != null) {
            Matcher m = NEEDLE_PATTERN.matcher(desc);
            if (m.find()) {
                needleMatch = m.group(1);
                // 人工备注优先级最高
                info.put("needleHint", needleMatch + "（样衣工艺备注）");
            }
        }

        // 人工没写针号 → 根据 AI 视觉分析 + 面料成分智能推荐
        if (needleMatch == null) {
            String imageInsight = safeTrim(si.getImageInsight());
            String visionRaw = safeTrim(si.getVisionRaw());
            String fabricComp = safeTrim(si.getFabricComposition());
            String category = safeTrim(si.getCategory());
            NeedleRecommendation rec = recommendNeedleSize(imageInsight, visionRaw, fabricComp, category);
            if (rec != null) {
                info.put("needleHint", rec.needleSize + "（AI 推荐·" + rec.fabricType + "）");
                info.put("needleReason", rec.reason);
            }
        }

        // —— 工艺关键词：从 description 中提取（人工填写的，不是系统编造）——
        List<String> processHints = extractProcessKeywords(desc);
        if (!processHints.isEmpty()) {
            info.put("processHints", processHints);
        }

        // —— 二次工艺列表 + 文本提示 ——
        if (secondaryProcesses != null && !secondaryProcesses.isEmpty()) {
            List<Map<String, String>> list = new ArrayList<>(secondaryProcesses.size());
            StringBuilder sb = new StringBuilder();
            for (SecondaryProcess p : secondaryProcesses) {
                String pn = safeTrim(p.getProcessName());
                if (pn == null) continue;
                Map<String, String> item = new LinkedHashMap<>();
                item.put("processName", pn);
                if (safeTrim(p.getDescription()) != null) item.put("description", safeTrim(p.getDescription()));
                list.add(item);
                if (sb.length() > 0) sb.append("、");
                sb.append(pn);
                if (item.get("description") != null) sb.append("（").append(item.get("description")).append("）");
            }
            if (!list.isEmpty()) {
                info.put("secondaryProcesses", list);
                info.put("secondaryProcessHint", sb.toString());
            }
        }

        // —— workerHint 兜底单行：只在上面各分行都没展示时才给出；不重复展示已分行的信息 ——
        // 注意：卡片已有难度/面料/针号/工艺分行展示，此处不重复拼接"【针号建议】"等字眼
        // workerHint 仅作为简单汇总提示，避免"系统假装专业"的观感
    }

    /** 同时把关键字段平铺到顶层（便于前端不进入 orderInfo 就能取到）。 */
    public static void flattenInto(Map<String, Object> result, StyleInfo si, List<SecondaryProcess> processes) {
        Map<String, Object> info = new LinkedHashMap<>();
        composeInto(info, si, processes);
        if (info.isEmpty()) return;
        String[] topKeys = {
                "difficultyLabel", "difficultyScore", "difficultyLevel", "difficultySeverity",
                "fabricComposition", "imageInsight", "visionRaw",
                "workerHint", "secondaryProcessHint", "secondaryProcesses",
                "processHints", "needleHint", "needleReason", "description", "cover", "fabricCompositionParts"
        };
        for (String k : topKeys) {
            if (info.get(k) != null) result.put(k, info.get(k));
        }
    }

    /** 独立入口：给定 style 和二次工艺，返回提示 map（也会自动 flatten 进去）。 */
    public static Map<String, Object> compose(StyleInfo si, List<SecondaryProcess> processes) {
        Map<String, Object> info = new LinkedHashMap<>();
        composeInto(info, si, processes);
        return info;
    }

    // ================== 内部工具 ==================

    private static String safeTrim(String s) {
        if (s == null) return null;
        String t = s.trim();
        return t.isEmpty() ? null : t;
    }

    private static void safePutText(Map<String, Object> info, String key, String value) {
        String v = safeTrim(value);
        if (v != null) info.put(key, v);
    }

    private static String computeSeverityByScore(Integer score) {
        if (score == null) return "LOW";
        int s = score;
        if (s <= 3) return "LOW";
        if (s <= 5) return "MEDIUM";
        if (s <= 7) return "HIGH";
        return "CRITICAL";
    }

    private static List<String> extractProcessKeywords(String desc) {
        if (desc == null || desc.isEmpty()) return Collections.emptyList();
        List<String> hits = new ArrayList<>();
        for (String kw : PROCESS_KEYWORDS) {
            if (desc.contains(kw) && !hits.contains(kw)) {
                hits.add(kw);
                if (hits.size() >= MAX_PROCESS_HINTS) break;
            }
        }
        return hits;
    }

    // ================== 针号智能推荐 ==================

    /**
     * 根据 AI 视觉分析 + 面料成分推荐针号。
     *
     * <p>推荐逻辑：</p>
     * <ol>
     *   <li>先从 imageInsight / visionRaw 中提取面料关键词（AI 视觉分析最准）</li>
     *   <li>再从 fabricComposition 中解析成分比例（人工填写的成分）</li>
     *   <li>品类辅助判断（西装/大衣偏厚，T恤/衬衫偏薄）</li>
     *   <li>综合判断面料厚度 → 返回对应针号推荐</li>
     * </ol>
     *
     * @param imageInsight AI 视觉分析摘要（自然语言，≤120字）
     * @param visionRaw    Agnes 视觉模型原始描述（自然语言，≤400字）
     * @param fabricComp   面料成分文本（如"70%棉 30%涤纶"）
     * @param category     品类（如"裤装"/"衬衫"/"外套"）
     * @return 针号推荐，null 表示无法判断
     */
    private static NeedleRecommendation recommendNeedleSize(
            String imageInsight, String visionRaw, String fabricComp, String category) {
        // 合并 AI 视觉分析文本（转小写做匹配）
        StringBuilder aiText = new StringBuilder();
        if (imageInsight != null) aiText.append(imageInsight);
        if (visionRaw != null) aiText.append(" ").append(visionRaw);
        String aiTextLower = aiText.toString().toLowerCase();

        // 1. 先从 AI 视觉文本中直接匹配面料关键词（最准）
        for (FabricNeedleRule rule : FABRIC_NEEDLE_RULES) {
            for (String kw : rule.keywords) {
                if (aiTextLower.contains(kw.toLowerCase())) {
                    return new NeedleRecommendation(
                            rule.needleSize, rule.fabricType, rule.reason);
                }
            }
        }

        // 2. 从面料成分中解析主导成分
        if (fabricComp != null && !fabricComp.isBlank()) {
            String compLower = fabricComp.toLowerCase();
            for (CompositionRule rule : COMPOSITION_RULES) {
                for (String kw : rule.keywords) {
                    if (compLower.contains(kw.toLowerCase())) {
                        // 按成分推断的厚度找针号
                        FabricNeedleRule needleRule = findRuleByThickness(rule.thickness);
                        if (needleRule != null) {
                            return new NeedleRecommendation(
                                    needleRule.needleSize, rule.fabricLabel, needleRule.reason);
                        }
                    }
                }
            }
        }

        // 3. 品类辅助判断（最后兜底）
        if (category != null && !category.isBlank()) {
            String catLower = category.toLowerCase();
            // 厚款品类
            if (containsAny(catLower, "外套", "大衣", "夹克", "西装", "棉衣", "羽绒服")) {
                FabricNeedleRule rule = findRuleByThickness("厚");
                if (rule != null) {
                    return new NeedleRecommendation(
                            rule.needleSize, "厚款品类", rule.reason);
                }
            }
            // 薄款品类
            if (containsAny(catLower, "t恤", "衬衫", "背心", "吊带")) {
                FabricNeedleRule rule = findRuleByThickness("薄");
                if (rule != null) {
                    return new NeedleRecommendation(
                            rule.needleSize, "薄款品类", rule.reason);
                }
            }
        }

        // 无法判断
        return null;
    }

    /** 按厚度标识查找对应的针号规则 */
    private static FabricNeedleRule findRuleByThickness(String thickness) {
        // 厚度映射：薄→9号, 弹力→11号, 中等→12号, 厚→14号, 极厚→16号
        switch (thickness) {
            case "薄": return findRule("9号针");
            case "弹力": return findRule("11号针");
            case "中等": return findRule("12号针");
            case "厚": return findRule("14号针");
            case "极厚": return findRule("16号针");
            default: return null;
        }
    }

    private static FabricNeedleRule findRule(String needleSize) {
        for (FabricNeedleRule r : FABRIC_NEEDLE_RULES) {
            if (r.needleSize.equals(needleSize)) return r;
        }
        return null;
    }

    private static boolean containsAny(String text, String... keywords) {
        for (String kw : keywords) {
            if (text.contains(kw.toLowerCase())) return true;
        }
        return false;
    }

    // ================== 推荐数据结构 ==================

    /** 面料→针号规则 */
    private static final class FabricNeedleRule {
        final String needleSize;
        final String fabricType;
        final List<String> keywords;
        final String reason;

        FabricNeedleRule(String needleSize, String fabricType, List<String> keywords, String reason) {
            this.needleSize = needleSize;
            this.fabricType = fabricType;
            this.keywords = keywords;
            this.reason = reason;
        }
    }

    /** 面料成分→厚度推断规则 */
    private static final class CompositionRule {
        final List<String> keywords;
        final String thickness;
        final String fabricLabel;

        CompositionRule(List<String> keywords, String thickness, String fabricLabel) {
            this.keywords = keywords;
            this.thickness = thickness;
            this.fabricLabel = fabricLabel;
        }
    }

    /** 针号推荐结果 */
    private static final class NeedleRecommendation {
        final String needleSize;
        final String fabricType;
        final String reason;

        NeedleRecommendation(String needleSize, String fabricType, String reason) {
            this.needleSize = needleSize;
            this.fabricType = fabricType;
            this.reason = reason;
        }
    }
}
