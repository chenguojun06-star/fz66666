package com.fashion.supplychain.intelligence.service;

import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.intelligence.dto.IntelligenceInferenceResult;
import com.fashion.supplychain.intelligence.entity.IntelligenceFeedbackRecord;
import com.fashion.supplychain.intelligence.mapper.IntelligenceFeedbackRecordMapper;
import com.fashion.supplychain.intelligence.orchestration.IntelligenceInferenceOrchestrator;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.context.annotation.Lazy;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.regex.Pattern;

/**
 * P1升级: Golden Test Dataset + 持续在线评估。
 * 内置标准问答对，用于回归测试小云AI质量。
 * 前端可通过 /api/intelligence/golden-eval 触发评估。
 */
@Service
@Lazy
@Slf4j
public class GoldenEvalService {

    /** 在线评估采样率：10%生产流量 */
    static final double ONLINE_EVAL_SAMPLE_RATE = 0.10;

    private final List<GoldenQA> goldenQAs = new ArrayList<>();

    @Autowired(required = false)
    private IntelligenceInferenceOrchestrator inferenceOrchestrator;
    @Autowired(required = false)
    private IntelligenceFeedbackRecordMapper feedbackMapper;

    public GoldenEvalService() {
        initGoldenQAs();
    }

    private void initGoldenQAs() {
        goldenQAs.add(new GoldenQA("订单进度",
                "帮我查一下PO20250101000001的订单进度",
                ".*(生产|备料|裁剪|质检|入库|已完成|当前状态).*", 70));
        goldenQAs.add(new GoldenQA("延期查询",
                "最近有哪些延期订单？",
                ".*(延期|逾期|超时|订单).*", 65));
        goldenQAs.add(new GoldenQA("产量统计",
                "今天产量是多少？",
                ".*(件|套|产量|统计|扫码).*", 60));
        goldenQAs.add(new GoldenQA("工厂状态",
                "哪些工厂最近比较沉默？",
                ".*(工厂|沉默|活跃|沟通|最近).*", 65));
        goldenQAs.add(new GoldenQA("库存查询",
                "帮我查一下仓库库存",
                ".*(库存|仓库|入库|出库|数量).*", 60));
        goldenQAs.add(new GoldenQA("风险分析",
                "帮我分析一下当前订单风险",
                ".*(风险|异常|预警|分析|订单).*", 65));
        goldenQAs.add(new GoldenQA("简单问候",
                "你好",
                ".*(你好|帮助|什么|可以帮你).*", 80));
        goldenQAs.add(new GoldenQA("帮助请求",
                "你能帮我做什么？",
                ".*(订单|进度|扫码|工资|库存|帮助).*", 75));
        goldenQAs.add(new GoldenQA("工资查询",
                "我这个月工资什么时候结算？",
                ".*(工资|结算|时间段|明细).*", 65));
        goldenQAs.add(new GoldenQA("数据分析",
                "帮我分析一下上个月的订单趋势",
                ".*(订单|趋势|统计|分析|数据).*", 60));
    }

    /** 在线评估：对10%的生产流量做LLM-as-Judge */
    public void maybeOnlineEvaluate(String userMessage, String aiResponse, double selfScore) {
        if (Math.random() > ONLINE_EVAL_SAMPLE_RATE) return;
        if (inferenceOrchestrator == null || !inferenceOrchestrator.isAnyModelEnabled()) return;
        try {
            String evalPrompt = "你是AI质量评估员。对以下AI回答打分（0-100），严格按JSON输出：\n"
                    + "{\"accuracy\":85,\"helpfulness\":80,\"clarity\":90,\"conciseness\":75,\"overall\":82}\n"
                    + "用户问题：" + (userMessage.length() > 200 ? userMessage.substring(0, 200) : userMessage) + "\n"
                    + "AI回答：" + (aiResponse.length() > 500 ? aiResponse.substring(0, 500) : aiResponse);
            IntelligenceInferenceResult evalResult = inferenceOrchestrator.chat("golden_eval", evalPrompt, "");
            if (evalResult.isSuccess()) {
                double onlineScore = parseOnlineScore(evalResult.getContent());
                saveEvalResult(userMessage, selfScore, onlineScore, "online");
                log.info("[GoldenEval] 在线评估: selfScore={} onlineScore={}", String.format("%.0f", selfScore), String.format("%.0f", onlineScore));
            }
        } catch (Exception e) {
            log.debug("[GoldenEval] 在线评估跳过: {}", e.getMessage());
        }
    }

    /** 回归测试：用Golden QA对验证当前模型质量 */
    public String runGoldenEval() {
        if (inferenceOrchestrator == null || !inferenceOrchestrator.isAnyModelEnabled()) {
            return "{\"status\":\"skipped\",\"reason\":\"模型未启用\"}";
        }
        int passed = 0, total = goldenQAs.size();
        double totalScore = 0;
        StringBuilder results = new StringBuilder("{\"status\":\"ok\",\"total\":" + total + ",\"results\":[");

        for (int i = 0; i < goldenQAs.size(); i++) {
            GoldenQA qa = goldenQAs.get(i);
            try {
                IntelligenceInferenceResult result = inferenceOrchestrator.chat("golden_eval",
                        "你是小云——服装供应链AI助手。请简洁回答以下问题（不超过200字）：\n\n" + qa.question,
                        "");
                boolean match = result.isSuccess() && Pattern.compile(qa.expectPattern, Pattern.DOTALL)
                        .matcher(result.getContent()).find();
                int score = match ? 100 : 50;
                totalScore += score;
                if (match) passed++;
                results.append("{\"name\":\"").append(qa.name)
                        .append("\",\"question\":\"").append(escapeJson(qa.question))
                        .append("\",\"passed\":").append(match)
                        .append(",\"score\":").append(score)
                        .append(",\"answer\":\"").append(escapeJson(result.isSuccess() ? truncate(result.getContent(), 200) : "error"))
                        .append("\"}");
                if (i < total - 1) results.append(",");
                saveEvalResult(qa.name, score, score, "golden");
            } catch (Exception e) {
                results.append("{\"name\":\"").append(qa.name).append("\",\"passed\":false,\"error\":\"").append(e.getMessage()).append("\"}");
                if (i < total - 1) results.append(",");
            }
        }
        results.append("],\"passed\":" + passed + ",\"avgScore\":" + String.format("%.1f", totalScore / total) + "}");
        log.info("[GoldenEval] 回归测试完成: {}/{} 通过, 平均分{}", passed, total, String.format("%.1f", totalScore / total));
        return results.toString();
    }

    private double parseOnlineScore(String content) {
        try {
            int start = content.indexOf('{'), end = content.lastIndexOf('}');
            if (start < 0 || end < 0) return 75;
            var node = new com.fasterxml.jackson.databind.ObjectMapper().readTree(content.substring(start, end + 1));
            return node.path("overall").asDouble(75);
        } catch (Exception e) { return 75; }
    }

    private void saveEvalResult(String query, double selfScore, double onlineScore, String type) {
        if (feedbackMapper == null) return;
        try {
            IntelligenceFeedbackRecord f = new IntelligenceFeedbackRecord();
            f.setTenantId(UserContext.tenantId() != null ? UserContext.tenantId() : 0L);
            f.setPredictionId(type + "_" + System.currentTimeMillis());
            f.setSuggestionType(type);
            f.setSuggestionContent(query);
            f.setFeedbackResult(onlineScore >= 70 ? "accepted" : "rejected");
            f.setFeedbackReason(String.format("SelfScore=%.0f OnlineScore=%.0f", selfScore, onlineScore));
            f.setDeviationMinutes((long) Math.abs(onlineScore - selfScore));
            f.setCreateTime(LocalDateTime.now());
            f.setUpdateTime(LocalDateTime.now());
            feedbackMapper.insert(f);
        } catch (Exception e) { log.debug("[GoldenEval] 保存评估结果跳过: {}", e.getMessage()); }
    }

    private String escapeJson(String s) {
        return s == null ? "" : s.replace("\\", "\\\\").replace("\"", "\\\"")
                .replace("\n", "\\n").replace("\r", "\\r").replace("\t", "\\t");
    }

    private String truncate(String s, int max) {
        return s != null && s.length() > max ? s.substring(0, max) + "…" : s;
    }

    static class GoldenQA {
        String name, question, expectPattern;
        int minScore;
        GoldenQA(String name, String question, String expectPattern, int minScore) {
            this.name = name; this.question = question; this.expectPattern = expectPattern; this.minScore = minScore;
        }
    }
}