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
