package com.fashion.supplychain.common;

import lombok.extern.slf4j.Slf4j;
import org.slf4j.MDC;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.core.AuthenticationException;
import org.springframework.validation.FieldError;
import org.springframework.web.HttpRequestMethodNotSupportedException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;

import javax.validation.ConstraintViolationException;
import java.util.List;
import java.util.NoSuchElementException;

@RestControllerAdvice
@Slf4j
public class GlobalExceptionHandler {

    private static String requestId() {
        String rid = MDC.get("requestId");
        return rid == null || rid.isBlank() ? null : rid;
    }

    private static <T> Result<T> fail(int code, String message) {
        Result<T> r = Result.fail(code, message);
        String rid = requestId();
        if (rid != null) {
            r.setRequestId(rid);
        }
        return r;
    }

    private static String rootMessage(Throwable t) {
        if (t == null) {
            return null;
        }
        Throwable cur = t;
        Throwable next;
        while ((next = cur.getCause()) != null && next != cur) {
            cur = next;
        }
        String msg = cur.getMessage();
        return msg == null || msg.isBlank() ? null : msg;
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public Result<?> handleMethodArgumentNotValid(MethodArgumentNotValidException e) {
        log.debug("Handled exception requestId={} type={} message={}", requestId(),
                e == null ? null : e.getClass().getSimpleName(), e == null ? null : e.getMessage());
        if (e == null) {
            return fail(400, "参数校验失败");
        }
        List<FieldError> errors = e.getBindingResult().getFieldErrors();
        if (errors != null && !errors.isEmpty()) {
            FieldError first = errors.get(0);
            String message = first.getDefaultMessage();
            if (message == null || message.isEmpty()) {
                message = "参数校验失败";
            }
            return fail(400, message);
        }
        return fail(400, "参数校验失败");
    }

    @ExceptionHandler(ConstraintViolationException.class)
    public Result<?> handleConstraintViolation(ConstraintViolationException e) {
        log.debug("Handled exception requestId={} type={} message={}", requestId(),
                e == null ? null : e.getClass().getSimpleName(), e == null ? null : e.getMessage());
        String message = "参数校验失败";
        if (e != null && e.getConstraintViolations() != null && !e.getConstraintViolations().isEmpty()) {
            String m = e.getConstraintViolations().iterator().next().getMessage();
            if (m != null && !m.isBlank()) {
                message = m;
            }
        }
        return fail(400, message);
    }

    @ExceptionHandler(MethodArgumentTypeMismatchException.class)
    public Result<?> handleMethodArgumentTypeMismatch(MethodArgumentTypeMismatchException e) {
        log.debug("Handled exception requestId={} type={} message={}", requestId(),
                e == null ? null : e.getClass().getSimpleName(), e == null ? null : e.getMessage());
        return fail(400, "参数类型错误");
    }

    @ExceptionHandler(HttpMessageNotReadableException.class)
    public Result<?> handleHttpMessageNotReadable(HttpMessageNotReadableException e) {
        log.debug("Handled exception requestId={} type={} message={}", requestId(),
                e == null ? null : e.getClass().getSimpleName(), e == null ? null : e.getMessage());
        return fail(400, "请求体格式错误");
    }

    @ExceptionHandler(HttpRequestMethodNotSupportedException.class)
    public Result<?> handleMethodNotSupported(HttpRequestMethodNotSupportedException e) {
        log.info("Handled exception requestId={} type={} message={}", requestId(),
                e == null ? null : e.getClass().getSimpleName(), e == null ? null : e.getMessage());
        return fail(405, "请求方法不支持");
    }

    @ExceptionHandler(AccessDeniedException.class)
    public Result<?> handleAccessDenied(AccessDeniedException e) {
        log.warn("Handled exception requestId={} type={} message={}", requestId(),
                e == null ? null : e.getClass().getSimpleName(), e == null ? null : e.getMessage());
        String message = e == null ? null : e.getMessage();
        return fail(403, message == null || message.isBlank() ? "无权限操作" : message);
    }

    @ExceptionHandler(NoSuchElementException.class)
    public Result<?> handleNoSuchElement(NoSuchElementException e) {
        log.info("Handled exception requestId={} type={} message={}", requestId(),
                e == null ? null : e.getClass().getSimpleName(), e == null ? null : e.getMessage());
        String message = e == null ? null : e.getMessage();
        return fail(404, message == null || message.isBlank() ? "资源不存在" : message);
    }

    @ExceptionHandler(AuthenticationException.class)
    public Result<?> handleAuthentication(AuthenticationException e) {
        log.warn("Handled exception requestId={} type={} message={}", requestId(),
                e == null ? null : e.getClass().getSimpleName(), e == null ? null : e.getMessage());
        return fail(401, "未登录或登录已过期");
    }

    @ExceptionHandler(IllegalArgumentException.class)
    public Result<?> handleIllegalArgument(IllegalArgumentException e) {
        log.warn("Handled exception requestId={} type={} message={}", requestId(),
                e == null ? null : e.getClass().getSimpleName(), e == null ? null : e.getMessage());
        String message = e == null ? null : e.getMessage();
        return fail(400, message == null || message.isBlank() ? "参数错误" : message);
    }

    @ExceptionHandler(IllegalStateException.class)
    public Result<?> handleIllegalState(IllegalStateException e) {
        log.warn("Handled exception requestId={} type={} message={}", requestId(),
                e == null ? null : e.getClass().getSimpleName(), e == null ? null : e.getMessage());
        String message = e == null ? null : e.getMessage();
        return fail(400, message == null || message.isBlank() ? "操作不允许" : message);
    }

    @ExceptionHandler(DuplicateKeyException.class)
    public Result<?> handleDuplicateKey(DuplicateKeyException e) {
        log.warn("Handled exception requestId={} type={} message={}", requestId(),
                e == null ? null : e.getClass().getSimpleName(), e == null ? null : e.getMessage());
        return fail(409, "数据已存在或重复提交");
    }

    @ExceptionHandler(DataIntegrityViolationException.class)
    public Result<?> handleDataIntegrityViolation(DataIntegrityViolationException e) {
        log.warn("Handled exception requestId={} type={} message={}", requestId(),
                e == null ? null : e.getClass().getSimpleName(), e == null ? null : e.getMessage());
        String root = rootMessage(e);
        if (root != null) {
            String lower = root.toLowerCase();
            if (lower.contains("data too long") && lower.contains("remark")) {
                return fail(400, "备注过长（最多255字符）");
            }
            if (lower.contains("data too long") && (lower.contains("scan_code") || lower.contains("scan code"))) {
                return fail(400, "扫码内容过长，请检查二维码内容");
            }
            if (lower.contains("data too long") && lower.contains("cutting_bundle_qr_code")) {
                return fail(400, "裁剪扎号二维码内容过长，请检查二维码内容");
            }
            if (lower.contains("cannot be null")) {
                return fail(400, "必填字段缺失");
            }
        }
        return fail(400, "数据保存失败，请检查输入");
    }

    @ExceptionHandler(Exception.class)
    public Result<?> handleException(Exception e) {
        String rid = requestId();
        log.error("Unhandled exception requestId={}", rid, e);
        return fail(500, "系统异常");
    }
}
