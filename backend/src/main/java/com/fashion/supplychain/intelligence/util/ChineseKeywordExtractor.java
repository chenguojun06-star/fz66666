package com.fashion.supplychain.intelligence.util;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * 轻量中文关键词提取器（纯 JDK 实现，不引入任何第三方分词依赖）。
 *
 * <p>用途：为 L4 程序性记忆（SOP）提供像样的中文关键词，替代原先
 * "13 个硬编码词 + 内容前 10 个字符" 的粗糙逻辑。用于两个方向：
 * <ul>
 *   <li><b>查询侧</b>：从用户问句提取候选关键词，去 {@code trigger_keywords LIKE '%kw%'} 匹配 SOP</li>
 *   <li><b>写入侧</b>：创建 SOP 时若未填 trigger_keywords，从 SOP 名称/步骤自动生成落库</li>
 * </ul>
 *
 * <p>算法：
 * <ol>
 *   <li><b>领域词典最长匹配</b>：扫描服装供应链业务术语（按长度降序，优先更具体的词，
 *       如"工序扫码"优先于"扫码"）。词典直接对齐库内已有 SOP 的 trigger_keywords，
 *       因此这是召回主力。命中的字符区间会被标记，避免同一片段被重复计分。</li>
 *   <li><b>2-gram 兜底</b>：仅在领域词典完全无命中时启用（词典未覆盖的租户自定义词）。
 *       只取 2 字滑窗并做重叠抑制 —— 3/4 字滑窗会大量产生"资发放情""衣上发现"
 *       这类跨词碎片，实测无召回价值，只会浪费 LIKE 查询。</li>
 *   <li><b>排序去重</b>：按分数降序取 top-N，抑制被高分候选覆盖的冗余片段。</li>
 * </ol>
 *
 * <p>失败语义：任何异常或空产出都返回空列表，由调用方降级到原有逻辑，
 * 保证不会比改造前更差。
 *
 * @author xiaoyun
 * @since 2026-09-13
 */
public final class ChineseKeywordExtractor {

    private ChineseKeywordExtractor() {
    }

    /** 默认返回的最大关键词个数 */
    public static final int DEFAULT_MAX_KEYWORDS = 5;

    /** 关键词最小长度：单字词检索价值极低，词典内也没有单字术语 */
    private static final int MIN_LEN = 2;

    /** 领域词典命中的基础分，远高于 2-gram，确保业务术语优先 */
    private static final double DOMAIN_BASE_SCORE = 100.0;

    // ══════════════════════════════════════════════════════════════════════════
    // 领域词典：服装供应链 / ERP 业务术语
    // 来源：ProceduralMemoryInitializer 与 V202707261000 种子数据里已有 SOP 的
    //       trigger_keywords，外加服装生产通用术语。与库内关键词天然对齐。
    // ══════════════════════════════════════════════════════════════════════════
    private static final List<String> DOMAIN_TERMS = List.of(
            // —— 扫码 / 报工 ——
            "扫码", "扫描", "扫菲", "重扫", "菲号", "菲票", "工票", "工序", "产量", "报工",
            "工序扫码", "质检扫码", "入库扫码", "产量扫码", "扫码记录", "扫码撤回", "扫工序码",
            // —— 工资 / 结算 ——
            "工资", "结算", "计件", "工价", "单价", "薪资", "外发", "垫付", "扣款",
            "工资单", "工资结算", "结算工资", "工资支付", "工资撤回", "计件工资",
            // —— 交期 / 排产 ——
            "交期", "货期", "交货", "延期", "逾期", "排产", "排程", "产能", "交付", "进度",
            "交付风险", "交期预测", "延期订单", "生产进度",
            // —— 供应商 ——
            "供应商", "评估", "评级", "考核", "寻源", "面料", "辅料",
            "供应商风险", "供应商评分", "供应商管理",
            // —— 质检 ——
            "质检", "检验", "次品", "疵点", "返工", "返修", "报废", "合格率", "首件",
            "巡检", "末件", "组检", "查货", "中期", "尾期", "入库质检", "让步接收",
            // —— 仓储 / 物料 ——
            "入库", "出库", "库存", "盘点", "发料", "领料", "对账", "采购", "物料",
            "补片", "换片",
            // —— 生产工艺 ——
            "裁剪", "车缝", "后道", "包装", "整烫", "洗水", "印花", "绣花", "裁床", "唛架",
            // —— 通用业务对象 ——
            "生产单", "订单", "款号", "款式", "尺码", "车间", "工厂", "流水线", "撤回",
            "裁片", "分包", "打菲", "中查", "尾查"
    );

    /** 按长度降序的领域词典，保证最长匹配优先 */
    private static final List<String> SORTED_DOMAIN_TERMS = DOMAIN_TERMS.stream()
            .distinct()
            .sorted(Comparator.comparingInt(String::length).reversed()
                    .thenComparing(Comparator.naturalOrder()))
            .collect(Collectors.toList());

    private static final Set<String> DOMAIN_TERM_SET = Set.copyOf(DOMAIN_TERMS);

    /**
     * 停用词（多字）。这些词在 SOP 场景下无区分度，且容易因为
     * {@code sop_name LIKE '%kw%'} 造成大量误命中（例如"流程"会匹配到所有 SOP）。
     */
    private static final Set<String> STOPWORDS = Set.of(
            // 疑问 / 指代
            "怎么", "怎样", "如何", "什么", "为什么", "哪里", "哪个", "哪些", "是否", "能否",
            "可以", "能不能", "请问", "麻烦", "帮我", "我想", "我要", "我们", "你们", "他们",
            "这个", "那个", "这些", "那些", "现在", "今天", "目前", "当前",
            // 通用动词（会污染 sop_name LIKE 匹配）
            "查询", "查看", "显示", "列出", "统计", "汇总", "分析", "生成", "计算", "处理",
            "操作", "执行", "使用", "进行", "开始", "完成", "结束", "知道", "告诉", "说明",
            "介绍", "需要", "应该", "应当", "一下", "一次", "一个",
            // 通用名词
            "情况", "问题", "状态", "数据", "信息", "内容", "结果", "方式", "方法", "流程",
            "步骤", "标准", "相关", "所有", "全部", "标准流程",
            // 连接 / 副词
            "以及", "然后", "如果", "因为", "所以", "但是", "而且", "还有", "没有", "已经",
            "正在", "将要", "按照", "根据", "通过", "关于", "对于"
    );

    /** 虚词单字：2-gram 命中即丢弃，避免出现"期的""个流"这类跨词垃圾片段 */
    private static final Set<Character> STOP_CHARS = Set.of(
            '的', '了', '着', '过', '吗', '呢', '啊', '吧', '呀', '嘛', '和', '与', '或',
            '是', '对', '给', '把', '被', '让', '从', '到', '等', '就', '都', '也', '还',
            '很', '太', '再', '又', '才', '最', '你', '我', '他', '她', '它', '这', '那',
            '个', '些', '么', '什', '怎', '如', '多', '几', '在', '有', '为', '以'
    );

    // ══════════════════════════════════════════════════════════════════════════
    // 对外方法
    // ══════════════════════════════════════════════════════════════════════════

    /**
     * 提取关键词（默认最多 {@value #DEFAULT_MAX_KEYWORDS} 个）。
     *
     * @param text 输入文本（用户问句 / SOP 名称 + 步骤）
     * @return 按相关度降序的关键词列表；无产出时返回空列表（绝不返回 null）
     */
    public static List<String> extract(String text) {
        return extract(text, DEFAULT_MAX_KEYWORDS);
    }

    /**
     * 提取关键词。
     *
     * @param text 输入文本
     * @param max  最多返回个数（会被裁剪到 [1, 10]）
     * @return 按相关度降序的关键词列表；无产出时返回空列表
     */
    public static List<String> extract(String text, int max) {
        if (text == null || text.isBlank()) {
            return List.of();
        }
        String norm = normalize(text);
        if (norm.length() < MIN_LEN) {
            return List.of();
        }

        Map<String, Double> scores = new HashMap<>();
        Map<String, Integer> firstPos = new HashMap<>();

        // ① 领域词典最长匹配（召回主力）
        matchDomainTerms(norm, scores, firstPos);

        // ② 领域词典完全没命中时，才用 2-gram 兜底
        if (scores.isEmpty()) {
            collectBigrams(norm, scores, firstPos);
        }

        if (scores.isEmpty()) {
            return List.of();
        }
        return rank(scores, firstPos, Math.max(1, Math.min(max, 10)));
    }

    /**
     * 提取关键词并拼成落库格式（英文逗号分隔，与库内既有 trigger_keywords 一致）。
     *
     * <p>用于创建 SOP 时自动生成触发关键词。任一段为 null 会自动跳过。
     *
     * @param parts 若干文本片段（SOP 名称、步骤 action、前置条件……）
     * @return 逗号分隔的关键词；无产出时返回空字符串
     */
    public static String extractForStorage(String... parts) {
        if (parts == null || parts.length == 0) {
            return "";
        }
        StringBuilder sb = new StringBuilder();
        for (String p : parts) {
            if (p != null && !p.isBlank()) {
                sb.append(p).append(' ');
            }
        }
        return String.join(",", extract(sb.toString(), DEFAULT_MAX_KEYWORDS));
    }

    // ══════════════════════════════════════════════════════════════════════════
    // 内部实现
    // ══════════════════════════════════════════════════════════════════════════

    /** 归一化：小写化 + 非中文/非字母数字统一替换为空格（保留位置，避免跨标点粘连） */
    private static String normalize(String text) {
        String lower = text.toLowerCase(Locale.ROOT);
        StringBuilder sb = new StringBuilder(lower.length());
        for (int i = 0; i < lower.length(); i++) {
            char c = lower.charAt(i);
            sb.append(isCjk(c) || Character.isLetterOrDigit(c) ? c : ' ');
        }
        return sb.toString();
    }

    private static boolean isCjk(char c) {
        Character.UnicodeBlock b = Character.UnicodeBlock.of(c);
        return b == Character.UnicodeBlock.CJK_UNIFIED_IDEOGRAPHS
                || b == Character.UnicodeBlock.CJK_UNIFIED_IDEOGRAPHS_EXTENSION_A
                || b == Character.UnicodeBlock.CJK_COMPATIBILITY_IDEOGRAPHS;
    }

    /**
     * 领域词典最长匹配：按长度降序扫描，已覆盖的字符不重复计分，
     * 因此"工序扫码"会吃掉"扫码"，不会同时产出两个重叠词。
     */
    private static void matchDomainTerms(String norm, Map<String, Double> scores,
                                         Map<String, Integer> firstPos) {
        boolean[] covered = new boolean[norm.length()];
        for (String term : SORTED_DOMAIN_TERMS) {
            int from = 0;
            int idx;
            while ((idx = norm.indexOf(term, from)) >= 0) {
                if (!isFullyCovered(covered, idx, term.length())) {
                    Arrays.fill(covered, idx, idx + term.length(), true);
                    double posBonus = Math.max(0, 20 - idx) * 0.1; // 越靠前权重越高
                    scores.merge(term,
                            DOMAIN_BASE_SCORE + term.length() * 3.0 + posBonus,
                            Double::sum);
                    firstPos.putIfAbsent(term, idx);
                }
                from = idx + 1;
            }
        }
    }

    /** 2-gram 滑窗兜底：仅在领域词典无命中时调用 */
    private static void collectBigrams(String norm, Map<String, Double> scores,
                                       Map<String, Integer> firstPos) {
        int segStart = -1;
        for (int i = 0; i <= norm.length(); i++) {
            boolean cjkChar = i < norm.length() && isCjk(norm.charAt(i));
            if (cjkChar && segStart < 0) {
                segStart = i;
            } else if (!cjkChar && segStart >= 0) {
                scoreBigrams(norm, scores, firstPos, segStart, i);
                segStart = -1;
            }
        }
        if (segStart >= 0) {
            scoreBigrams(norm, scores, firstPos, segStart, norm.length());
        }
    }

    private static void scoreBigrams(String norm, Map<String, Double> scores,
                                     Map<String, Integer> firstPos, int start, int end) {
        for (int i = start; i + MIN_LEN <= end; i++) {
            String gram = norm.substring(i, i + MIN_LEN);
            if (STOPWORDS.contains(gram) || isLowQuality(gram)) {
                continue;
            }
            // 词频累加 + 位置权重（靠前略高）
            scores.merge(gram, 1.0 + Math.max(0, 20 - i) * 0.01, Double::sum);
            firstPos.putIfAbsent(gram, i);
        }
    }

    private static boolean isFullyCovered(boolean[] covered, int from, int len) {
        for (int i = from; i < from + len; i++) {
            if (!covered[i]) {
                return false;
            }
        }
        return true;
    }

    /** 低质量片段过滤：纯数字、含虚词单字 */
    private static boolean isLowQuality(String gram) {
        boolean allDigit = true;
        for (int i = 0; i < gram.length(); i++) {
            char c = gram.charAt(i);
            if (Character.isDigit(c)) {
                continue;
            }
            allDigit = false;
            if (STOP_CHARS.contains(c)) {
                return true;
            }
        }
        return allDigit;
    }

    /**
     * 按分数降序取 top-N，并抑制与高分候选在原文本中重叠的碎片。
     *
     * <p>领域术语即使互相包含也保留（"扫码"与"工序扫码"可能命中不同 SOP，多试一次更稳），
     * 但 2-gram 碎片之间必须互不重叠。
     */
    private static List<String> rank(Map<String, Double> scores, Map<String, Integer> firstPos,
                                     int max) {
        List<Map.Entry<String, Double>> ranked = new ArrayList<>(scores.entrySet());
        ranked.sort((a, b) -> {
            int c = Double.compare(b.getValue(), a.getValue());
            return c != 0 ? c : Integer.compare(b.getKey().length(), a.getKey().length());
        });

        List<String> picked = new ArrayList<>(max);
        List<int[]> spans = new ArrayList<>();
        for (Map.Entry<String, Double> e : ranked) {
            String cand = e.getKey();
            Integer pos = firstPos.get(cand);
            if (pos == null) {
                continue;
            }
            if (!DOMAIN_TERM_SET.contains(cand)) {
                int[] span = {pos, pos + cand.length()};
                if (overlapsAny(spans, span)) {
                    continue; // 与已选词重叠 → 跨词碎片，丢弃
                }
                spans.add(span);
            }
            picked.add(cand);
            if (picked.size() >= max) {
                break;
            }
        }
        return picked;
    }

    private static boolean overlapsAny(List<int[]> spans, int[] span) {
        for (int[] s : spans) {
            if (span[0] < s[1] && s[0] < span[1]) {
                return true;
            }
        }
        return false;
    }
}
