package com.fashion.supplychain.system.dto;

/**
 * 前端上报的 JS 异常记录
 * 独立 DTO，仅用于 FrontendErrorController / FrontendErrorStore
 */
public class FrontendErrorDTO {

    /** 错误类型：error / unhandledrejection / react */
    private String type;

    /** 错误消息（Error.message） */
    private String message;

    /** 调用栈（Error.stack，截断到 2000 字符） */
    private String stack;

    /** 发生错误时的页面 URL（location.href） */
    private String url;

    /** 前端记录的 ISO 时间字符串 */
    private String occurredAt;

    public String getType() { return type; }
    public void setType(String type) { this.type = type; }

    public String getMessage() { return message; }
    public void setMessage(String message) { this.message = message; }

    public String getStack() { return stack; }
    public void setStack(String stack) { this.stack = stack; }

    public String getUrl() { return url; }
    public void setUrl(String url) { this.url = url; }

    public String getOccurredAt() { return occurredAt; }
    public void setOccurredAt(String occurredAt) { this.occurredAt = occurredAt; }
}
