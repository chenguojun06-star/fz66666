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

    private WorkerHintComposer() {}

    /**
     * 生成所有工人提示字段，放入 info map 中。
     * 若 styleInfo 为 null，保持 info 不变（不阻断扫码主流程）。
     *
     * <p>重要原则：所有提示必须来源于样衣开发阶段的人工数据，不做任何"基于面料推断针距/针号"的猜测。
     * 针号/工艺关键词来自 StyleInfo.description（样衣工艺备注，人工填写）。
     * imageInsight（视觉识别结果）作为参考提示，前端已标注为"系统提示"，工人以实际面料手感为准。</p>
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

        // —— 针号提示：仅从 description（人工填写的样衣工艺备注）中提取，绝不猜测 ——
        String desc = safeTrim(si.getDescription());
        String needleMatch = null;
        if (desc != null) {
            Matcher m = NEEDLE_PATTERN.matcher(desc);
            if (m.find()) {
                needleMatch = m.group(1);
                // 明确标注来源：来自样衣工艺备注，不是系统推断
                info.put("needleHint", needleMatch + "（样衣工艺备注）");
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
                "processHints", "needleHint", "description", "cover", "fabricCompositionParts"
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
}
