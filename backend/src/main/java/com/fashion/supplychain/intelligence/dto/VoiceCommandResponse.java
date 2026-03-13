package com.fashion.supplychain.intelligence.dto;

import lombok.Data;

/** Stage10 语音指令响应 */
@Data
public class VoiceCommandResponse {

    /** 最终响应文字（可直接由前端 SpeechSynthesis 播报） */
    private String responseText;

    /** 响应类型：DATA_TABLE / ACTION_RESULT / CHAT */
    private String responseType;

    /** 已路由到的底层处理器：nl_query / execution_engine / ai_advisor */
    private String routedTo;

    /** 结构化数据（如 NlQuery 的 data 字段，可为 null） */
    private Object structuredData;

    /**
     * 播报优化文本（更适合语音输出，去掉表格、数字简化）
     * 例："本月逾期订单共12条，最严重的是PO20260313001，建议立即联系工厂"
     */
    private String speakableText;
}
