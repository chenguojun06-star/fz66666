package com.fashion.supplychain.common;

import jakarta.servlet.RequestDispatcher;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.web.servlet.error.ErrorController;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.RequestMapping;

/**
 * 自定义错误控制器（替代 Spring Boot 默认 BasicErrorController）。
 *
 * <p>解决两类已知噪音：
 * <ul>
 *   <li>SSE/流式接口 response 已提交后，Spring 仍尝试 forward /error 导致
 *       "Servlet.service() ... threw exception" 反复刷屏。</li>
 *   <li>ERROR dispatch 时 SecurityContext/UserContext 已被 Filter 清理，
 *       导致 AuditInterceptor 看到 tenant=null/user=null 的"幽灵"审计日志。</li>
 * </ul>
 *
 * <p>策略：
 * <ol>
 *   <li>response 已 committed：直接返回，不尝试写入（消除 Tomcat 层 ERROR）。</li>
 *   <li>SSE 请求（Accept: text/event-stream）：返回 200 + 空 SSE 事件，避免浏览器 EventSource 抛异常。</li>
 *   <li>其他请求：返回标准 JSON 格式（与 GlobalExceptionHandler 一致）。</li>
 * </ol>
 */
@Controller
public class CustomErrorController implements ErrorController {

    private static final Logger log = LoggerFactory.getLogger(CustomErrorController.class);

    /**
     * 处理所有未被 Controller 处理的错误请求（/error 路径）。
     *
     * <p>Spring 在 Controller 抛出未处理异常、response 已提交、404 等场景下，
     * 会 forward 到 /error 路径。我们在这里统一处理。
     */
    @RequestMapping("/error")
    public ResponseEntity<Result<Void>> handleError(HttpServletRequest request, HttpServletResponse response) {
        // 1. response 已提交（SSE/流式场景常见）：直接返回，不再尝试写入
        //    这是消除 Tomcat "Servlet.service() ... threw exception" 噪音的关键
        if (response.isCommitted()) {
            log.debug("ErrorController 收到已提交响应（SSE/流场景），跳过错误写入");
            return null;
        }

        // 2. 读取原始状态码和异常
        Object statusCodeAttr = request.getAttribute(RequestDispatcher.ERROR_STATUS_CODE);
        int status = statusCodeAttr instanceof Integer ? (Integer) statusCodeAttr : 500;
        HttpStatus httpStatus = HttpStatus.resolve(status);
        if (httpStatus == null) {
            httpStatus = HttpStatus.INTERNAL_SERVER_ERROR;
        }

        // 3. SSE 请求：返回 200 + 空 SSE 事件，避免 EventSource 抛 onerror
        //    SSE 的错误处理在 GlobalExceptionHandler 中已通过 emitter.send(error) 通知前端
        String accept = request.getHeader("Accept");
        if (accept != null && accept.contains(MediaType.TEXT_EVENT_STREAM_VALUE)) {
            log.debug("ErrorController 收到 SSE 请求错误，状态={}, 路径={}", status,
                    request.getAttribute(RequestDispatcher.ERROR_REQUEST_URI));
            return ResponseEntity.ok().build();
        }

        // 4. 4xx 错误：返回对应状态码 + 标准消息（不记录 ERROR 日志，避免噪音）
        if (httpStatus.is4xxClientError()) {
            String message = clientErrorMessage(httpStatus);
            return ResponseEntity.status(httpStatus).body(Result.fail(httpStatus.value(), message));
        }

        // 5. 5xx 错误：原始异常已在 GlobalExceptionHandler 或 Filter 中记录过，
        //    这里只负责返回标准化响应，不再重复打印堆栈
        Object originalUri = request.getAttribute(RequestDispatcher.ERROR_REQUEST_URI);
        log.warn("ErrorController 处理 5xx: status={}, uri={}, exception={}",
                status, originalUri,
                request.getAttribute(RequestDispatcher.ERROR_EXCEPTION));
        return ResponseEntity.status(httpStatus)
                .body(Result.fail(httpStatus.value(), "服务器开小差了，请稍后重试，如问题持续请联系管理员"));
    }

    private String clientErrorMessage(HttpStatus status) {
        return switch (status) {
            case UNAUTHORIZED -> "token已过期，请重新登录";
            case FORBIDDEN -> "权限不足，无法访问该资源";
            case NOT_FOUND -> "请求的资源不存在";
            case METHOD_NOT_ALLOWED -> "请求方法不支持";
            case TOO_MANY_REQUESTS -> "请求过于频繁，请稍后再试";
            default -> "请求处理失败";
        };
    }
}
