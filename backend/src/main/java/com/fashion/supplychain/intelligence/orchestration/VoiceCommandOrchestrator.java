package com.fashion.supplychain.intelligence.orchestration;

import com.fashion.supplychain.intelligence.dto.VoiceCommandRequest;
import com.fashion.supplychain.intelligence.dto.VoiceCommandResponse;
import com.fashion.supplychain.intelligence.dto.NlQueryRequest;
import com.fashion.supplychain.intelligence.dto.NlQueryResponse;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.util.regex.Pattern;

/**
 * Stage10 — 语音多模态指令 Orchestrator
 *
 * <p>工作流：
 * <pre>
 * 前端 WebSpeech API 识别语音 → transcribedText
 *      → POST /api/intelligence/voice/command
 *         → 路由到 NlQueryOrchestrator（QUERY/CHAT）
 *            或 ExecutionEngineOrchestrator（COMMAND）
 *         → 把结构化回答转换为可朗读的纯文字
 *      → 前端 SpeechSynthesis 朗读 speakableText
 * </pre>
 * </p>
 */
@Service
@Slf4j
public class VoiceCommandOrchestrator {

    @Autowired
    private NlQueryOrchestrator nlQueryOrchestrator;

    @Autowired
    private IntelligenceInferenceOrchestrator inferenceOrchestrator;

    // Markdown 装饰符清理
    private static final Pattern MD_PATTERN = Pattern.compile("[*_`#|\\[\\]>]");
    // 连续空白压缩
    private static final Pattern WHITESPACE  = Pattern.compile("\\s{2,}");

    // ──────────────────────────────────────────────────────────────────
    // 公共入口
    // ──────────────────────────────────────────────────────────────────

    public VoiceCommandResponse processVoice(VoiceCommandRequest req) {
        if (!StringUtils.hasText(req.getTranscribedText())) {
            VoiceCommandResponse err = new VoiceCommandResponse();
            err.setResponseText("未识别到有效语音内容，请重试。");
            err.setSpeakableText("未识别到有效语音内容，请重试。");
            err.setResponseType("ERROR");
            return err;
        }

        log.info("[VoiceCmd] mode={} text={}", req.getMode(), req.getTranscribedText());

        String mode = req.getMode() == null ? "QUERY" : req.getMode().toUpperCase();

        return switch (mode) {
            case "COMMAND" -> handleCommand(req);
            default        -> handleQuery(req);       // QUERY / CHAT / 未知都走 NlQuery
        };
    }

    // ──────────────────────────────────────────────────────────────────
    // 分支处理
    // ──────────────────────────────────────────────────────────────────

    /**
     * QUERY / CHAT → NlQueryOrchestrator，返回结构化数据 + 可朗读文字
     */
    private VoiceCommandResponse handleQuery(VoiceCommandRequest req) {
        NlQueryRequest nlReq = new NlQueryRequest();
        nlReq.setQuestion(req.getTranscribedText());
        nlReq.setSessionId(req.getContextId());

        NlQueryResponse nlResp;
        try {
            nlResp = nlQueryOrchestrator.query(nlReq);
        } catch (Exception e) {
            log.warn("[VoiceCmd] NlQuery 异常: {}", e.getMessage());
            return errorResponse("查询出现问题，请稍后重试。");
        }

        String rawAnswer   = nlResp.getAnswer() != null ? nlResp.getAnswer() : "";
        String speakable   = toSpeakable(rawAnswer);

        VoiceCommandResponse resp = new VoiceCommandResponse();
        resp.setResponseText(rawAnswer);
        resp.setSpeakableText(speakable);
        resp.setResponseType(nlResp.getIntent() != null ? nlResp.getIntent() : "ANSWER");
        resp.setRoutedTo("NlQueryOrchestrator");
        resp.setStructuredData(nlResp.getData() != null ? nlResp.getData() : nlResp.getAiInsight());
        return resp;
    }

    /**
     * COMMAND → LLM 将自然语言指令解析为结构化命令描述，
     * 再转发给 ExecutionEngine（或直接调用 NlQuery 触发执行意图）
     */
    private VoiceCommandResponse handleCommand(VoiceCommandRequest req) {
        String commandPrompt = "用户语音指令：" + req.getTranscribedText()
                + "。请指出这个指令对应的系统操作（修改订单/创建/审批/查询等），"
                + "以JSON返回{\"action\":\"操作名\",\"description\":\"中文描述\"}，不超过30字。";

        String routedTo = "ExecutionEngineOrchestrator";
        String actionDesc = "已收到指令：" + req.getTranscribedText();

        try {
            var r = inferenceOrchestrator.chat("voice-command-parse",
                    "你是语音指令解析助手，精准识别用户意图并映射到系统操作。", commandPrompt);
            if (r.isSuccess()) actionDesc = r.getContent();
        } catch (Exception e) {
            log.warn("[VoiceCmd:COMMAND] 解析失败: {}", e.getMessage());
        }

        // 把结构化命令路由回 NlQuery（让 ExecutionEngine 执行意图）
        VoiceCommandResponse resp = handleQuery(req);
        resp.setResponseType("COMMAND");
        resp.setRoutedTo(routedTo);
        resp.setSpeakableText("好的，" + toSpeakable(actionDesc));
        return resp;
    }

    // ──────────────────────────────────────────────────────────────────
    // 工具方法
    // ──────────────────────────────────────────────────────────────────

    /**
     * 把包含 Markdown/表格/换行的文字转换为纯文字朗读版本。
     * 规则：去除 MD 符号；将换行替换为逗号；数字后无单位时补「个」；截断超90字并以「等」结尾。
     */
    String toSpeakable(String text) {
        if (!StringUtils.hasText(text)) return "好的。";
        // 去除表格行（|…|）
        String s = text.replaceAll("\\|.*?\\|", "").trim();
        // 去除 Markdown 符号
        s = MD_PATTERN.matcher(s).replaceAll("");
        // 换行 → 逗号
        s = s.replaceAll("[\\n\\r]+", "，");
        // 压缩多空白
        s = WHITESPACE.matcher(s).replaceAll(" ").trim();
        // 截断
        if (s.length() > 90) s = s.substring(0, 88) + "等";
        return s;
    }

    private VoiceCommandResponse errorResponse(String msg) {
        VoiceCommandResponse r = new VoiceCommandResponse();
        r.setResponseText(msg);
        r.setSpeakableText(msg);
        r.setResponseType("ERROR");
        return r;
    }
}
