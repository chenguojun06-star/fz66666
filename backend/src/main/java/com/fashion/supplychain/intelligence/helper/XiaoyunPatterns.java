package com.fashion.supplychain.intelligence.helper;

import java.util.regex.Pattern;

public final class XiaoyunPatterns {

    private XiaoyunPatterns() {
    }

    public enum IntentType {
        SMALL_TALK,
        KNOWLEDGE_ASK,
        SIMPLE_QUERY,
        COMPLEX_ANALYSIS,
        ACTION_COMMAND
    }

    // ── 核心模式 ──────────────────────────────────────────

    public static final Pattern GREETING = Pattern.compile(
            "(?s).*(你好|hi|hello|谢谢|再见|你是谁|在吗|辛苦了|好的|收到|明白|知道了|了解).*"
    );

    public static final Pattern COMPLEX_TRIGGER = Pattern.compile(
            "(?s).*(入库|建单|创建订单|审批|结算|撤回扫码|分配|派单|新建|快速建单|帮我.*做|去做|执行.*操作|对比|排名|趋势|分析|汇总|所有|每个|各个|评估|预测|方案|为什么|怎么办|如何优化|哪些.*风险|哪些.*问题|什么问题|什么情况|什么原因|看一下|查一下|帮我查|告诉我).*"
    );

    public static final Pattern BUSINESS_KEYWORD = Pattern.compile(
            "(?s).*(订单|进度|逾期|异常|风险|工厂|工资|库存|物料|裁剪|扫码|入库|出货|对账|结算|款式|样衣|采购|催单|备注|紧急|延期|交期|产能|成本|利润|质量|次品|领料|盘点|发票|税务|报价|BOM|模板|工序|菲号|转厂|撤回|审批|通知|跟单|客户|供应商|成品|面辅|面料|辅料|报价单|生产|完成率|准时率|逾期率|在制|待处理|待审批|待质检|待入库).*"
    );

    public static final Pattern IDENTITY_QUERY = Pattern.compile(
            "(?s).*(我是谁|你知道我|我是什么角色|我有什么权限|我的权限|我的角色).*"
    );

    // ── 意图分类器 ────────────────────────────────────────

    private static final Pattern KNOWLEDGE_PATTERN = Pattern.compile(
            "(?s).*(怎么|如何|怎样|教程|指南|流程|步骤|方法|技巧|攻略|说明).*");

    private static final Pattern COMPLEX_OP_PATTERN = Pattern.compile(
            "(?s).*(入库|建单|创建订单|审批|结算|撤回扫码|分配|派单|新建|快速建单|帮我.*做|去做|执行.*操作).*");

    private static final Pattern COMPLEX_ANALYSIS_PATTERN = Pattern.compile(
            "(?s).*(对比|排名|趋势|分析|汇总|所有|每个|各个|评估|预测|方案|为什么|怎么办|如何优化|哪些.*风险|哪些.*问题|什么问题|什么情况|什么原因|看一下|查一下|帮我查|告诉我).*");

    /**
     * D-702 P0：问「怎么做」而不是问「是多少」的数据请求词。
     *
     * <p>业务关键词闸门（{@link #BUSINESS_KEYWORD}）会把「扫码」「入库」这类词一并拦下，
     * 但「扫码流程是怎样的」是<b>知识问</b>，RAG 能答，并不需要查生产表；一刀切拦截会让
     * 大量纯文档类提问白白多跑一次工具循环（更慢、更多 token）。
     *
     * <p>而「查一下 BR24001 的进度」同样含业务关键词，却<b>必须</b>查库。
     * 两者只能靠「问法」区分：要数据 = 出现数据请求词；要知识 = 只问方法步骤。
     */
    private static final Pattern DATA_REQUEST_PATTERN = Pattern.compile(
            "(?s).*(查一下|帮我查|看一下|告诉我|多少|几个|排名|对比|趋势|汇总|统计|查询|查下|查查|"
            + "哪些|哪个|列出|有哪些|有没有|是不是|能否|可以吗|当前|现在|今天|本月|本周|最近).*");

    /**
     * 纯知识问法：只问方法/步骤/含义，答案在文档与知识库里。
     *
     * <p><b>刻意不含「怎么/如何/怎样/怎么样」这类模糊问法</b>：
     * 「订单进度<em>怎么样</em>」里的"怎么"其实是在问<b>数据值</b>，
     * 若算作知识问法就会被快路径放行，回到「不查库靠推测」的老毛病。
     * 只保留「流程/步骤/方法/教程/指南/说明/含义」等明确的<b>知识名词</b>：
     * 「扫码<em>流程</em>是怎样的」→ 知识问；「订单进度怎么样」→ 数据问。
     */
    private static final Pattern KNOWLEDGE_ONLY_PATTERN = Pattern.compile(
            "(?s).*(流程|步骤|方法|教程|指南|技巧|攻略|说明|含义|区别|是什么|怎么用|如何用).*");

    /**
     * D-702 P0：判断一个问题是否<b>只是问方法</b>（无需查业务数据）。
     *
     * <p>规则：命中知识问法，且不含任何数据请求词。
     * 「扫码流程是怎样的」→ 知识问法 ✓、无数据请求词 ✓ → 不需要查库。
     * 「查一下BR24001的进度」→ 命中「查一下」→ 需要查库。
     */
    public static boolean isKnowledgeOnlyQuestion(String msg) {
        if (msg == null) return false;
        if (DATA_REQUEST_PATTERN.matcher(msg).matches()) return false;
        return KNOWLEDGE_ONLY_PATTERN.matcher(msg).matches();
    }

    public static IntentType estimateIntent(String msg) {
        if (msg == null) return IntentType.SMALL_TALK;
        if (isGreeting(msg)) return IntentType.SMALL_TALK;
        if (COMPLEX_OP_PATTERN.matcher(msg).matches()) return IntentType.ACTION_COMMAND;
        if (COMPLEX_ANALYSIS_PATTERN.matcher(msg).matches()) return IntentType.COMPLEX_ANALYSIS;
        if (KNOWLEDGE_PATTERN.matcher(msg).matches() && !isBusinessKeyword(msg))
            return IntentType.KNOWLEDGE_ASK;
        return IntentType.SIMPLE_QUERY;
    }

    // ── 公共判断方法 ──────────────────────────────────────

    public static boolean isGreeting(String msg) {
        return msg != null && GREETING.matcher(msg).matches();
    }

    public static boolean isComplexTrigger(String msg) {
        return msg != null && COMPLEX_TRIGGER.matcher(msg).matches();
    }

    public static boolean isBusinessKeyword(String msg) {
        return msg != null && BUSINESS_KEYWORD.matcher(msg).matches();
    }

    public static boolean shouldSkipCritic(String msg, int totalToolCalls, int answerLength) {
        if (msg != null && msg.length() < 15 && isGreeting(msg)) {
            return true;
        }
        if (totalToolCalls <= 1 && answerLength < 300) {
            return true;
        }
        return false;
    }

    public static int estimateMaxIterations(String msg) {
        if (msg == null || msg.length() < 8) return 2;
        String trimmed = msg.trim();
        // 问候/身份类：1轮（直接回复，不走工具循环）
        if (trimmed.length() < 25 && isGreeting(trimmed)) return 1;
        if (IDENTITY_QUERY.matcher(trimmed).matches()) return 1;
        // 复杂操作/分析：保持较高轮次
        if (COMPLEX_OP_PATTERN.matcher(trimmed).matches()) return 6;
        if (COMPLEX_ANALYSIS_PATTERN.matcher(trimmed).matches()) return 4;
        // 默认：3轮（原5轮，响应慢根因TOP1优化）
        return 3;
    }
}
