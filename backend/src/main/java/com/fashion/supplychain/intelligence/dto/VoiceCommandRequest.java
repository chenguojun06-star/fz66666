package com.fashion.supplychain.intelligence.dto;

import lombok.Data;

/** Stage10 语音指令请求（前端 WebSpeech API 转写后发送） */
@Data
public class VoiceCommandRequest {

    /** 语音转写后的文字（由前端 WebSpeech API 完成转写） */
    private String transcribedText;

    /**
     * 交互模式：
     * QUERY   — 查询（路由到 NlQuery）
     * COMMAND — 执行操作（路由到 ExecutionEngine）
     * CHAT    — 普通对话（路由到 AiAdvisor）
     */
    private String mode;

    /** 上下文（可选，传入前一轮对话 ID） */
    private String contextId;
}
