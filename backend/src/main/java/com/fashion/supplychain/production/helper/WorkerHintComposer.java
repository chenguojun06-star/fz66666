package com.fashion.supplychain.production.helper;

import com.fashion.supplychain.common.util.TextUtils;
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
 * <p>针号/针距/注意点推荐优先级（D-590）：</p>
 * <ol>
 *   <li>人工备注（description）明确写了针号/针距（"11号针"、"针距：3cm14针"）→ 直接使用，标注"样衣工艺备注"</li>
 *   <li>实际面料成分（fabricComposition）解析类别 → 推荐针号+针具+注意点，标注"AI 推荐"</li>
 *   <li>AI 视觉识别（imageInsight + visionRaw）识别面料类型 → 同上兜底</li>
 *   <li>以上都没有 → 不展示针号（不猜测）</li>
 * </ol>
 * <p>⚠️ 历史教训：针号匹配只认"号"字形态或"针号/机针/用针"引导，否则贴进备注的工艺单
 * 行号（"5 针织面料"）会被误抓成"5 针"。</p>
 */
@Slf4j
public final class WorkerHintComposer {

    // ══════ 针号/针距提取（D-590 收紧版）══════
    // 历史教训：旧正则 [0-9]+号?针 会把贴进备注的大货工艺单"5 针织面料…"的行号+首字抓成"5 针"，
    // 也会把"针距：3cm14针"的针距当针号。针号必须带"号"字或由"针号/机针/用针"引导，否则不认。

    /** 明确号数形态：11号针 / 9号机针 / 九号针 */
    private static final Pattern NEEDLE_EXPLICIT = Pattern.compile(
            "([0-9]{1,2}|[一二三四五六七八九十]{1,3})\\s*号\\s*机?针");

    /** 引导词形态：针号：11 / 机针 12号 / 用针9# */
    private static final Pattern NEEDLE_PREFIXED = Pattern.compile(
            "(?:针号|机针|用针|针型)\\s*[:：是为]?\\s*([0-9]{1,2})\\s*[号#]?");

    /** 针距形态一：3cm14针 / 3厘米 14针 */
    private static final Pattern STITCH_CM_FIRST = Pattern.compile(
            "([0-9]{1,2}(?:\\.[0-9])?)\\s*(?:cm|CM|厘米)\\s*[-—~～至到]?\\s*([0-9]{1,2})\\s*针");

    /** 针距形态二：14针/3cm / 14针每厘米 */
    private static final Pattern STITCH_PER = Pattern.compile(
            "([0-9]{1,2})\\s*针\\s*[/每]\\s*([0-9]{1,2}(?:\\.[0-9])?)\\s*(?:cm|CM|厘米|寸|英寸)");

    /** 针距形态三：针距：14针 / 针距 12-14针 */
    private static final Pattern STITCH_PREFIXED = Pattern.compile(
            "针距[^0-9]{0,4}([0-9]{1,2}(?:\\s*[-~～]\\s*[0-9]{1,2})?)\\s*(?:cm|CM|厘米)?\\s*针");

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

    // ================== 面料→针号/针具/注意点推荐表（D-590 重构） ==================
    // 原则：一切以实际面料成分（人工填写）优先，AI 视觉识别兜底；文案用工人听得懂的大白话，
    // 只讲"可能出现什么问题 + 怎么防"，不堆工艺术语。

    /** 面料类型规则：关键词 → 针号 + 针具 + 注意点（specific 在前，匹配取第一个命中的类别） */
    private static final List<FabricRule> FABRIC_RULES = List.of(
            // —— 薄/娇贵面料（真丝雪纺类）：9号针 ——
            new FabricRule("9号针", "细针（针眼小不留印）", "薄/娇贵面料",
                    List.of("真丝", "丝绸", "桑蚕丝", "柞蚕丝", "缎面", "缎", "雪纺", "乔其", "欧根纱",
                            "重绉", "顺纡", "塔夫绸", "醋酸", "天丝", "铜氨", "里布", "薄纱", " lining", " silk", " chiffon"),
                    List.of("料子滑容易走位抽丝，车之前用夹子别乱戳，垫层薄纸车，车完撕掉",
                            "车速放慢、压脚压力调小，起皱了先调底线张力别硬拉",
                            "针要细（9号），针眼大真丝会留永久印子")),
            // —— 弹力/针织面料：11号针 + 球头针 ——
            new FabricRule("11号针", "球头针（圆头针尖）", "弹力/针织面料",
                    List.of("弹力", "氨纶", "莱卡", "spandex", "elastane", "lycra", "针织", "汗布", "罗纹",
                            "珠地", "毛圈", "卫衣", "棉毛", " stretch", " knit"),
                    List.of("尖针会把弹力丝戳断，洗几水就破洞——必须用球头针",
                            "车的时候让机器送料，别用手拽着拉，拉了会变形",
                            "容易跳针：先换球头针，再查底线松紧")),
            // —— 中等常规面料：12号针 ——
            new FabricRule("12号针", "通用针", "中等厚度面料",
                    List.of("棉", "涤纶", "polyester", "棉麻", "麻", "linen", "人棉", "粘胶", "莫代尔",
                            "modal", "府绸", "牛津纺", "灯芯绒", "精纺", "常规", "梭织", " cotton"),
                    List.of("全棉料先过水缩水再裁，成衣才不会缩号",
                            "针距打均匀（一般3厘米14针），太稀了穿着容易开线",
                            "深色料容易沾针迹油渍，换线色前先擦干净机头")),
            // —— 厚面料：14号针 + 粗线 ——
            new FabricRule("14号针", "粗针（配粗线）", "厚面料",
                    List.of("牛仔", "denim", "帆布", "canvas", "厚棉", "粗纺", "毛呢", "呢料", "法兰绒",
                            "大衣呢", "花呢", "羊毛", "wool", "woolen", "抓绒", "摇粒绒", "太空棉", "羽绒",
                            "夹克", "外衣", " fleece"),
                    List.of("厚料用细针必断针，断针头会崩出来——放慢车速注意护眼",
                            "拼缝叠厚的地方容易跳针，一段一段慢慢过",
                            "厚薄交接处垫块同厚度的碎布过渡，不起皱")),
            // —— 极厚/皮革：16号针 + 皮革专用针 ——
            new FabricRule("16号针", "皮革专用针", "皮革/极厚面料",
                    List.of("皮革", "leather", "人造革", "pu皮", "皮毛一体", "复合面料", "多层贴合", "极厚"),
                    List.of("皮革针眼一扎就是永久的——先在废料上试好针位再上车",
                            "皮革不能回针（倒针）固定，线头手工打结",
                            "普通针扎皮会发热粘胶，必须用皮革专用针"))
    );

    /** 面料成分关键词 → 类别厚度（用于 fabricComposition 文本解析，映射回上面的规则） */
    private static final List<CompositionRule> COMPOSITION_RULES = List.of(
            // 真丝/缎面类 → 薄
            new CompositionRule(List.of("真丝", "丝", "silk", "缎", "satin"), "薄", "真丝/缎面"),
            // 雪纺/乔其/天丝 → 薄
            new CompositionRule(List.of("雪纺", "乔其", "chiffon", "天丝", "铜氨", "醋酸"), "薄", "轻薄面料"),
            // 氨纶/莱卡 → 弹力
            new CompositionRule(List.of("氨纶", "莱卡", "spandex", "elastane"), "弹力", "弹力面料"),
            // 麻 → 中等
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
     * <p>重要原则：针号优先使用人工备注（description，只认明确"号针"形态），无备注时
     * 根据实际面料成分和 AI 视觉分析智能推荐针号+针具+注意点（大白话）。
     * 所有推荐均标注来源（"样衣工艺备注"或"AI 推荐·面料类型"），工人以实际面料手感为准。</p>
     */
    public static void composeInto(Map<String, Object> info, StyleInfo si, List<SecondaryProcess> secondaryProcesses) {
        if (si == null || info == null) return;

        // —— 基础字段（难度 / 面料 / 视觉摘要）——
        if (si.getDifficultyScore() != null) info.put("difficultyScore", si.getDifficultyScore());
        safePutText(info, "difficultyLevel", si.getDifficultyLevel());
        safePutText(info, "difficultyLabel", si.getDifficultyLabel());
        // D-112：AI 洞察是 LLM 生成文案，历史数据可能整段英文——非中文内容不下发到工人端
        if (TextUtils.isUsableChineseText(si.getImageInsight())) {
            safePutText(info, "imageInsight", si.getImageInsight());
        }
        if (TextUtils.isUsableChineseText(si.getVisionRaw())) {
            safePutText(info, "visionRaw", si.getVisionRaw());
        }
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

        // —— 针号/针距提示：人工备注明确写了才用，否则按实际面料智能推荐 ——
        String descPlain = stripHtml(safeTrim(si.getDescription()));

        // 针距：人工备注里写了"3cm14针"这类才展示（不猜测）
        String stitchHint = extractStitchHint(descPlain);
        if (stitchHint != null) {
            info.put("stitchHint", stitchHint + "（样衣工艺备注）");
        }

        // 针号：人工备注优先（只认"X号针/针号：X"明确形态），其次按实际面料成分+AI视觉推荐
        String needleMatch = extractNeedleHint(descPlain);
        if (needleMatch != null) {
            info.put("needleHint", needleMatch + "（样衣工艺备注）");
        } else {
            String imageInsight = safeTrim(si.getImageInsight());
            String visionRaw = safeTrim(si.getVisionRaw());
            String fabricComp = safeTrim(si.getFabricComposition());
            String category = safeTrim(si.getCategory());
            NeedleRecommendation rec = recommendNeedleSize(imageInsight, visionRaw, fabricComp, category);
            if (rec != null) {
                info.put("needleHint", rec.needleSize + "（AI 推荐·" + rec.fabricType + "）");
                info.put("needleTool", rec.needleTool);
                info.put("fabricTips", rec.tips);
                info.put("needleReason", rec.reason);
            }
        }

        // —— 工艺关键词：从 description 中提取（人工填写的，不是系统编造）——
        List<String> processHints = extractProcessKeywords(descPlain);
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
                "processHints", "needleHint", "needleTool", "stitchHint", "fabricTips", "needleReason",
                "description", "cover", "fabricCompositionParts"
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
     * 根据实际面料推荐针号+针具+注意点。
     *
     * <p>优先级（D-590 调整：实际面料成分 > AI 视觉识别 > 品类兜底）：</p>
     * <ol>
     *   <li>从 fabricComposition（人工填的实际用料成分）解析类别</li>
     *   <li>再从 imageInsight / visionRaw（AI 视觉识别）提取面料关键词</li>
     *   <li>品类辅助兜底（外套/大衣偏厚，T恤/衬衫偏薄）</li>
     * </ol>
     *
     * @return 推荐结果，null 表示无法判断
     */
    private static NeedleRecommendation recommendNeedleSize(
            String imageInsight, String visionRaw, String fabricComp, String category) {

        // 1. 实际面料成分优先（人工填的用料最准）
        if (fabricComp != null && !fabricComp.isBlank()) {
            String compLower = fabricComp.toLowerCase();
            for (CompositionRule rule : COMPOSITION_RULES) {
                for (String kw : rule.keywords) {
                    if (compLower.contains(kw.toLowerCase())) {
                        FabricRule fabricRule = findRuleByClass(rule.thickness);
                        if (fabricRule != null) {
                            return NeedleRecommendation.of(fabricRule,
                                    "按面料成分（" + rule.fabricLabel + "）判断");
                        }
                    }
                }
            }
        }

        // 2. AI 视觉识别文本（最准的视觉面料关键词）
        StringBuilder aiText = new StringBuilder();
        if (imageInsight != null) aiText.append(imageInsight);
        if (visionRaw != null) aiText.append(" ").append(visionRaw);
        String aiTextLower = aiText.toString().toLowerCase();
        for (FabricRule rule : FABRIC_RULES) {
            for (String kw : rule.keywords) {
                if (aiTextLower.contains(kw.toLowerCase())) {
                    return NeedleRecommendation.of(rule, "按AI视觉识别面料判断");
                }
            }
        }

        // 3. 品类辅助兜底
        if (category != null && !category.isBlank()) {
            String catLower = category.toLowerCase();
            if (containsAny(catLower, "外套", "大衣", "夹克", "西装", "棉衣", "羽绒服")) {
                FabricRule rule = findRuleByClass("厚");
                if (rule != null) {
                    return NeedleRecommendation.of(rule, "按品类（厚款）判断");
                }
            }
            if (containsAny(catLower, "t恤", "衬衫", "背心", "吊带", "罩衫")) {
                FabricRule rule = findRuleByClass("薄");
                if (rule != null) {
                    return NeedleRecommendation.of(rule, "按品类（薄款）判断");
                }
            }
        }

        // 无法判断
        return null;
    }

    /** 按类别标识（薄/弹力/中等/厚/极厚）找对应面料规则——fabricType 显示名以类别标识开头 */
    private static FabricRule findRuleByClass(String fabricClass) {
        for (FabricRule r : FABRIC_RULES) {
            if (r.fabricType.startsWith(fabricClass)) return r;
        }
        return null;
    }

    /**
     * 从剥掉 HTML 后的纯文本备注里提取针号提示。
     * 只认"11号针 / 9号机针 / 针号：11 / 用针9#"这类明确形态——
     * "5 针织面料"（行号+首字）、"针距：3cm14针"（针距）都不会误命中。
     * 返回归一化的"X号针"（中文数字转阿拉伯数字），没有则 null。
     */
    private static String extractNeedleHint(String descPlain) {
        if (descPlain == null || descPlain.isEmpty()) return null;
        Matcher m = NEEDLE_EXPLICIT.matcher(descPlain);
        if (m.find()) return normalizeChineseNumber(m.group(1)) + "号针";
        m = NEEDLE_PREFIXED.matcher(descPlain);
        if (m.find()) return m.group(1) + "号针";
        return null;
    }

    /** 中文针号归一："九"→9、"十一"→11、"十二"→12；已是数字则原样返回 */
    private static String normalizeChineseNumber(String num) {
        if (num.matches("[0-9]{1,2}")) return num;
        final String digits = "一二三四五六七八九";
        if (num.length() == 1) {
            if (num.equals("十")) return "10";
            int idx = digits.indexOf(num);
            return idx >= 0 ? String.valueOf(idx + 1) : num;
        }
        // 十一 / 二十 / 二十三 这类组合
        int result = 0;
        for (char c : num.toCharArray()) {
            if (c == '十') {
                result = result == 0 ? 10 : result * 10;
            } else {
                int idx = digits.indexOf(c);
                if (idx >= 0) result += idx + 1;
            }
        }
        return String.valueOf(result);
    }

    /** 从纯文本备注里提取针距提示（如"3cm14针"→"针距 3cm·14针"），没有则 null */
    private static String extractStitchHint(String descPlain) {
        if (descPlain == null || descPlain.isEmpty()) return null;
        Matcher m = STITCH_CM_FIRST.matcher(descPlain);
        if (m.find()) return "针距 " + m.group(1) + "cm·" + m.group(2) + "针";
        m = STITCH_PER.matcher(descPlain);
        if (m.find()) return "针距 " + m.group(2) + "cm·" + m.group(1) + "针";
        m = STITCH_PREFIXED.matcher(descPlain);
        if (m.find()) return "针距 " + m.group(1) + "针";
        return null;
    }

    /** 轻量剥 HTML：标签转空格、常见实体还原、压掉多余空白（备注常是贴进来的工艺单富文本） */
    private static String stripHtml(String raw) {
        if (raw == null) return null;
        return raw
                .replaceAll("(?is)<(script|style)[^>]*>.*?</\\s*\\1\\s*>", " ")
                .replaceAll("<[^>]+>", " ")
                .replace("&nbsp;", " ")
                .replace("&amp;", "&")
                .replace("&lt;", "<")
                .replace("&gt;", ">")
                .replaceAll("\\s+", " ")
                .trim();
    }

    private static boolean containsAny(String text, String... keywords) {
        for (String kw : keywords) {
            if (text.contains(kw.toLowerCase())) return true;
        }
        return false;
    }

    // ================== 推荐数据结构 ==================

    /** 面料类别规则：针号 + 针具 + 注意点（大白话） */
    private static final class FabricRule {
        final String needleSize;
        final String needleTool;
        final String fabricType;
        final List<String> keywords;
        final List<String> tips;

        FabricRule(String needleSize, String needleTool, String fabricType,
                   List<String> keywords, List<String> tips) {
            this.needleSize = needleSize;
            this.needleTool = needleTool;
            this.fabricType = fabricType;
            this.keywords = keywords;
            this.tips = tips;
        }
    }

    /** 面料成分→类别推断规则 */
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

    /** 针号推荐结果（带针具+注意点） */
    private static final class NeedleRecommendation {
        final String needleSize;
        final String needleTool;
        final String fabricType;
        final List<String> tips;
        final String reason;

        NeedleRecommendation(String needleSize, String needleTool, String fabricType,
                             List<String> tips, String reason) {
            this.needleSize = needleSize;
            this.needleTool = needleTool;
            this.fabricType = fabricType;
            this.tips = tips;
            this.reason = reason;
        }

        static NeedleRecommendation of(FabricRule rule, String reason) {
            return new NeedleRecommendation(rule.needleSize, rule.needleTool,
                    rule.fabricType, rule.tips, reason);
        }
    }
}
