package com.fashion.supplychain.intelligence.agent.resource;

import com.fasterxml.jackson.annotation.JsonInclude;
import lombok.Data;

/**
 * MCP 工具结构化错误（SERF — Structured Error Recovery Framework）。
 *
 * <p>背景：原工具失败直接抛异常，AI 无法自决策（重试 / 换工具 / 提示用户）。
 * 改为返回机器可读错误码，让 AI 根据错误码和 suggestedAction 决策下一步。
 *
 * <p>错误码体系：
 * <ul>
 *   <li>{@link #RESOURCE_NOT_FOUND} — 资源不存在，AI 应换 URI 或提示用户</li>
 *   <li>{@link #PERMISSION_DENIED} — 权限不足，AI 应提示用户联系管理员</li>
 *   <li>{@link #TENANT_MISMATCH} — 跨租户访问（P0 事故），AI 应立即停止</li>
 *   <li>{@link #RATE_LIMITED} — 限流/超时，AI 可等待后重试</li>
 *   <li>{@link #INTERNAL_ERROR} — 内部错误，AI 应降级并记录</li>
 * </ul>
 *
 * <p>JSON 序列化示例：
 * <pre>
 * {
 *   "errorCode": "RESOURCE_NOT_FOUND",
 *   "recoverable": false,
 *   "suggestedAction": "检查 URI 是否正确，或使用 resources/list 查看可用资源",
 *   "originalMessage": "无 Provider 支持该 URI：memory://unknown"
 * }
 * </pre>
 */
@Data
@JsonInclude(JsonInclude.Include.NON_NULL)
public class McpToolError {

    // ─────────────────────────────────────────────────────────────────────
    // 错误码常量
    // ─────────────────────────────────────────────────────────────────────

    /** 资源不存在 */
    public static final String RESOURCE_NOT_FOUND = "RESOURCE_NOT_FOUND";

    /** 权限不足 */
    public static final String PERMISSION_DENIED = "PERMISSION_DENIED";

    /** 跨租户访问（P0 事故） */
    public static final String TENANT_MISMATCH = "TENANT_MISMATCH";

    /** 限流或超时 */
    public static final String RATE_LIMITED = "RATE_LIMITED";

    /** 内部错误 */
    public static final String INTERNAL_ERROR = "INTERNAL_ERROR";

    // ─────────────────────────────────────────────────────────────────────
    // 字段
    // ─────────────────────────────────────────────────────────────────────

    /** 错误码（机器可读，见常量） */
    private String errorCode;

    /** 是否可恢复（AI 可据此决策是否重试） */
    private boolean recoverable;

    /** 建议动作（人类可读，指导 AI 下一步） */
    private String suggestedAction;

    /** 原始错误消息（用于调试） */
    private String originalMessage;

    // ─────────────────────────────────────────────────────────────────────
    // 静态工厂
    // ─────────────────────────────────────────────────────────────────────

    /**
     * 资源不存在错误。
     *
     * @param uri 请求的 URI
     */
    public static McpToolError notFound(String uri) {
        McpToolError e = new McpToolError();
        e.setErrorCode(RESOURCE_NOT_FOUND);
        e.setRecoverable(false);
        e.setSuggestedAction("检查 URI 是否正确，或使用 resources/list 查看可用资源");
        e.setOriginalMessage("资源不存在或无 Provider 支持：" + uri);
        return e;
    }

    /**
     * 权限不足错误。
     */
    public static McpToolError permissionDenied() {
        McpToolError e = new McpToolError();
        e.setErrorCode(PERMISSION_DENIED);
        e.setRecoverable(false);
        e.setSuggestedAction("提示用户当前权限不足，建议联系管理员授权");
        e.setOriginalMessage("权限不足，无法访问该资源");
        return e;
    }

    /**
     * 跨租户访问错误（P0 事故，必须立即停止）。
     */
    public static McpToolError tenantMismatch() {
        McpToolError e = new McpToolError();
        e.setErrorCode(TENANT_MISMATCH);
        e.setRecoverable(false);
        e.setSuggestedAction("立即停止操作，跨租户访问被拒绝；如需访问其他租户资源请联系平台管理员");
        e.setOriginalMessage("跨租户访问被拒绝（P0 安全策略）");
        return e;
    }

    /**
     * 限流/超时错误（可恢复，AI 可等待后重试）。
     */
    public static McpToolError rateLimited() {
        McpToolError e = new McpToolError();
        e.setErrorCode(RATE_LIMITED);
        e.setRecoverable(true);
        e.setSuggestedAction("等待几秒后重试，或减少请求频率");
        e.setOriginalMessage("请求被限流或超时");
        return e;
    }

    /**
     * 内部错误。
     *
     * @param msg 原始错误消息
     */
    public static McpToolError internal(String msg) {
        McpToolError e = new McpToolError();
        e.setErrorCode(INTERNAL_ERROR);
        e.setRecoverable(false);
        e.setSuggestedAction("降级处理，向用户说明服务暂时不可用；如持续出现请联系管理员");
        e.setOriginalMessage(msg);
        return e;
    }
}
