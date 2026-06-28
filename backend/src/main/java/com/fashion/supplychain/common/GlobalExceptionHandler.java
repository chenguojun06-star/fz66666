package com.fashion.supplychain.common;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataAccessException;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.jdbc.BadSqlGrammarException;
import org.springframework.transaction.UnexpectedRollbackException;
import org.springframework.validation.BindException;
import org.springframework.validation.FieldError;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.HttpRequestMethodNotSupportedException;
import org.springframework.web.bind.MissingServletRequestParameterException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;
import org.springframework.web.multipart.MaxUploadSizeExceededException;
import org.springframework.web.multipart.MultipartException;
import org.springframework.web.servlet.NoHandlerFoundException;
import org.springframework.web.servlet.resource.NoResourceFoundException;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.LinkedHashMap;
import java.util.NoSuchElementException;
import java.util.Map;

/**
 * 全局异常处理器
 * 统一处理各种异常，返回标准化的错误响应
 */
@RestControllerAdvice
public class GlobalExceptionHandler {

        private static final Logger logger = LoggerFactory.getLogger(GlobalExceptionHandler.class);

        /**
         * 处理业务异常
         *
         * @param e 业务异常
         * @return 标准化错误响应
         */
        @ExceptionHandler(BusinessException.class)
        public ResponseEntity<Result<?>> handleBusinessException(BusinessException e, HttpServletRequest request) {
                logger.warn("业务异常: {} {} - {}", request == null ? "" : request.getMethod(),
                                request == null ? "" : request.getRequestURI(), e.getMessage());
                if (e.getData() != null) {
                        return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                                        .body(Result.fail(e.getCode(), e.getMessage(), e.getData()));
                }
                return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(Result.fail(e.getCode(), e.getMessage()));
        }

        /**
         * 处理参数校验异常（@Valid）
         *
         * @param e 参数校验异常
         * @return 标准化错误响应
         */
        @ExceptionHandler(MethodArgumentNotValidException.class)
        public ResponseEntity<Result<?>> handleValidationException(MethodArgumentNotValidException e,
                        HttpServletRequest request) {
                logger.warn("参数校验异常: {} {} - {}", request == null ? "" : request.getMethod(),
                                request == null ? "" : request.getRequestURI(), e.getMessage());

                Map<String, String> errors = new LinkedHashMap<>();
                for (FieldError error : e.getBindingResult().getFieldErrors()) {
                        errors.put(error.getField(), error.getDefaultMessage());
                }

                String message = e.getBindingResult().getFieldErrors().isEmpty() ? "参数错误"
                                : e.getBindingResult().getFieldErrors().get(0).getDefaultMessage();

                return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(Result.fail(400, message, errors));
        }

        /**
         * 处理参数绑定异常（@ModelAttribute）
         *
         * @param e 参数绑定异常
         * @return 标准化错误响应
         */
        @ExceptionHandler(BindException.class)
        public ResponseEntity<Result<?>> handleBindException(BindException e, HttpServletRequest request) {
                logger.warn("参数绑定异常: {} {} - {}", request == null ? "" : request.getMethod(),
                                request == null ? "" : request.getRequestURI(), e.getMessage());

                String message = e.getBindingResult().getFieldErrors().isEmpty() ? "参数错误"
                                : e.getBindingResult().getFieldErrors().get(0).getDefaultMessage();

                return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(Result.fail(400, message));
        }

        /**
         * 处理缺少请求参数异常
         */
        @ExceptionHandler(MissingServletRequestParameterException.class)
        public ResponseEntity<Result<?>> handleMissingServletRequestParameter(
                        MissingServletRequestParameterException e,
                        HttpServletRequest request) {
                logger.warn("缺少请求参数: {} {} - {}", request == null ? "" : request.getMethod(),
                                request == null ? "" : request.getRequestURI(), e.getMessage());
                return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                                .body(Result.fail(400, "缺少必填参数：" + e.getParameterName()));
        }

        @ExceptionHandler(MethodArgumentTypeMismatchException.class)
        public ResponseEntity<Result<?>> handleMethodArgumentTypeMismatch(
                        MethodArgumentTypeMismatchException e,
                        HttpServletRequest request) {
                String paramName = e.getName();
                String paramValue = e.getValue() != null ? e.getValue().toString() : "null";
                String requiredType = e.getRequiredType() != null ? e.getRequiredType().getSimpleName() : "未知";
                logger.warn("参数类型不匹配: {} {} - 参数 {} 的值 '{}' 无法转换为类型 {}",
                                request == null ? "" : request.getMethod(),
                                request == null ? "" : request.getRequestURI(),
                                paramName, paramValue, requiredType);
                return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                                .body(Result.fail(400, "参数 " + paramName + " 格式错误，期望类型：" + requiredType));
        }

        /**
         * 处理 multipart 上传格式异常
         */
        @ExceptionHandler(MultipartException.class)
        public ResponseEntity<Result<?>> handleMultipartException(MultipartException e, HttpServletRequest request) {
                logger.warn("上传请求格式异常: {} {} - {}", request == null ? "" : request.getMethod(),
                                request == null ? "" : request.getRequestURI(), e.getMessage());
                return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                                .body(Result.fail(400, "上传请求格式错误，请重新选择文件后再试"));
        }

        @ExceptionHandler(MaxUploadSizeExceededException.class)
        public ResponseEntity<Result<?>> handleMaxUploadSizeExceeded(MaxUploadSizeExceededException e,
                        HttpServletRequest request) {
                logger.warn("文件大小超限: {} {} - {}", request == null ? "" : request.getMethod(),
                                request == null ? "" : request.getRequestURI(), e.getMessage());
                return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                                .body(Result.fail(400, "文件大小超出限制，请压缩后重新上传"));
        }

        @ExceptionHandler(HttpRequestMethodNotSupportedException.class)
        public ResponseEntity<Result<?>> handleMethodNotSupported(HttpRequestMethodNotSupportedException e,
                        HttpServletRequest request) {
                logger.warn("请求方法不支持: {} {} - {}", request == null ? "" : request.getMethod(),
                                request == null ? "" : request.getRequestURI(), e.getMethod());
                return ResponseEntity.status(HttpStatus.METHOD_NOT_ALLOWED)
                                .body(Result.fail(405, "不支持的请求方法：" + e.getMethod()));
        }

        @ExceptionHandler(NullPointerException.class)
        public ResponseEntity<Result<?>> handleNullPointer(NullPointerException e, HttpServletRequest request) {
                String method = request == null ? "" : request.getMethod();
                String uri = request == null ? "" : request.getRequestURI();
                logger.error("空指针异常: {} {}", method, uri, e);
                return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                                .body(Result.fail(500, "服务器开小差了，请稍后重试，如问题持续请联系管理员"));
        }

        /**
         * 处理404异常
         *
         * @param e 404异常
         * @return 标准化错误响应
         */
        @ExceptionHandler(NoHandlerFoundException.class)
        public ResponseEntity<Result<?>> handleNoHandlerFoundException(NoHandlerFoundException e,
                        HttpServletRequest request) {
                logger.warn("404: {} {}", request == null ? "" : request.getMethod(),
                                request == null ? "" : request.getRequestURI());
                return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Result.fail(404, "请求的资源不存在"));
        }

        /**
         * 处理静态资源404（NoResourceFoundException，Spring 6.x 新增）。
         * 外部扫描器/爬虫探测 /v1、/swagger 等路径时触发，降级为 WARN 避免日志噪音。
         */
        @ExceptionHandler(NoResourceFoundException.class)
        public ResponseEntity<Result<?>> handleNoResourceFoundException(NoResourceFoundException e,
                        HttpServletRequest request) {
                logger.warn("404 static resource: {} {}", request == null ? "" : request.getMethod(),
                                request == null ? "" : request.getRequestURI());
                return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Result.fail(404, "请求的资源不存在"));
        }

        /**
         * 处理请求体解析失败（JSON 格式错误、日期格式不匹配等）。
         * 防止 Jackson 反序列化异常被兜底 Exception 处理器吃掉后返回 500。
         */
        @ExceptionHandler(HttpMessageNotReadableException.class)
        public ResponseEntity<Result<?>> handleHttpMessageNotReadable(HttpMessageNotReadableException e,
                        HttpServletRequest request) {
                String method = request == null ? "" : request.getMethod();
                String uri = request == null ? "" : request.getRequestURI();
                // 打印根因 cause，便于定位是哪个字段反序列化失败
                Throwable root = e;
                while (root.getCause() != null && root.getCause() != root) {
                        root = root.getCause();
                }
                String rootMsg = root == e ? e.getMessage() : root.getClass().getSimpleName() + ": " + root.getMessage();
                logger.warn("请求体解析失败: {} {} - 根因: {}", method, uri, rootMsg);
                // 向前端返回更具体的提示（包含根因关键字，便于前端开发者定位字段）
                String clientHint = "请求参数格式错误";
                if (rootMsg != null) {
                        if (rootMsg.contains("LocalDateTime") || rootMsg.contains("Date") || rootMsg.contains("deliveryDate")) {
                                clientHint = "日期字段格式错误，应为 yyyy-MM-dd HH:mm:ss";
                        } else if (rootMsg.contains("BigDecimal") || rootMsg.contains("Integer") || rootMsg.contains("Long")) {
                                clientHint = "数值字段格式错误：" + rootMsg;
                        } else if (rootMsg.contains("UnrecognizedPropertyException") || rootMsg.contains("Unrecognized field")) {
                                clientHint = "请求包含后端不识别的字段：" + rootMsg;
                        }
                }
                return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                                .body(Result.fail(400, clientHint));
        }

        /**
         * 处理参数错误/状态错误（业务层常用抛出方式）。
         */
        @ExceptionHandler({ IllegalArgumentException.class, IllegalStateException.class })
        public ResponseEntity<Result<?>> handleIllegalState(RuntimeException e, HttpServletRequest request) {
                logger.warn("请求处理失败: {} {} - {}", request == null ? "" : request.getMethod(),
                                request == null ? "" : request.getRequestURI(), e.getMessage());
                String safeMessage = sanitizeClientMessage(e.getMessage());
                return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(Result.fail(400, safeMessage));
        }

        /**
         * 处理数据不存在。
         */
        @ExceptionHandler(NoSuchElementException.class)
        public ResponseEntity<Result<?>> handleNoSuchElement(NoSuchElementException e, HttpServletRequest request) {
                logger.warn("资源不存在: {} {} - {}", request == null ? "" : request.getMethod(),
                                request == null ? "" : request.getRequestURI(), e.getMessage());
                String clientMessage = sanitizeClientMessage(e.getMessage());
                if (clientMessage == null || clientMessage.isEmpty()) {
                        clientMessage = "请求的资源不存在";
                }
                return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Result.fail(404, clientMessage));
        }

        /**
         * 处理权限不足（Spring Security）。
         */
        @ExceptionHandler(AccessDeniedException.class)
        public ResponseEntity<Result<?>> handleAccessDenied(AccessDeniedException e, HttpServletRequest request,
                        HttpServletResponse response) {
                logger.warn("权限不足: {} {} - {}", request == null ? "" : request.getMethod(),
                                request == null ? "" : request.getRequestURI(), e.getMessage());
                if (response != null && response.isCommitted()) {
                        return null;
                }
                return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Result.fail(403, sanitizeClientMessage(e.getMessage())));
        }

        /**
         * 处理 SecurityException（业务层用于租户隔离/权限拦截）。
         * 返回 403 + 中文提示，避免前端看到空白页或默认错误栈。
         * SSE 流已提交时静默返回 null，避免"response is already committed"错误日志刷屏。
         */
        @ExceptionHandler(SecurityException.class)
        public ResponseEntity<Result<?>> handleSecurityException(SecurityException e, HttpServletRequest request,
                        HttpServletResponse response) {
                logger.warn("安全检查未通过: {} {} - {}", request == null ? "" : request.getMethod(),
                                request == null ? "" : request.getRequestURI(), e.getMessage());
                if (response != null && response.isCommitted()) {
                        logger.debug("响应已提交（SSE/流场景），跳过异常响应写入");
                        return null;
                }
                String safeMessage = sanitizeClientMessage(e.getMessage());
                if (safeMessage == null || safeMessage.isEmpty()) {
                        safeMessage = "权限不足，请联系管理员";
                }
                return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Result.fail(403, safeMessage));
        }

        /**
         * 处理SQL语法异常（通常是DB列缺失，等待Flyway迁移自动修复）。
         * 返回200+空数据而非500，避免前端全面crash。
         */
        @ExceptionHandler(BadSqlGrammarException.class)
        public ResponseEntity<Result<?>> handleBadSqlGrammar(BadSqlGrammarException e, HttpServletRequest request) {
                String method = request == null ? "" : request.getMethod();
                String uri = request == null ? "" : request.getRequestURI();
                String rootMsg = e.getCause() != null ? e.getCause().getMessage() : e.getMessage();
                logger.error("SQL语法异常（DB列缺失）: {} {} - {}", method, uri, rootMsg, e);
                return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                                .body(Result.fail(500, "数据服务暂时不可用，请稍后重试，如问题持续请联系管理员"));
        }

        /**
         * 处理事务意外回滚（通常是内层@Transactional捕获异常后外层事务被标记rollback-only）。
         * 将堆栈信息暴露出来便于定位根本原因。
         */
        @ExceptionHandler(UnexpectedRollbackException.class)
        public ResponseEntity<Result<?>> handleUnexpectedRollback(UnexpectedRollbackException e, HttpServletRequest request) {
                String method = request == null ? "" : request.getMethod();
                String uri = request == null ? "" : request.getRequestURI();
                logger.error("事务意外回滚: {} {} - {}", method, uri, e.getMessage(), e);
                return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                                .body(Result.fail(500, "操作失败，请稍后重试"));
        }

        /**
         * 处理DB唯一键冲突（DuplicateKeyException）。
         * 不暴露原始MySQL错误，返回业务友好消息。
         */
        @ExceptionHandler(DuplicateKeyException.class)
        public ResponseEntity<Result<?>> handleDuplicateKey(DuplicateKeyException e, HttpServletRequest request) {
                String method = request == null ? "" : request.getMethod();
                String uri = request == null ? "" : request.getRequestURI();
                logger.warn("唯一键冲突: {} {} - {}", method, uri, e.getMessage());
                return ResponseEntity.status(HttpStatus.CONFLICT)
                                .body(Result.fail(409, "数据已存在，请勿重复提交"));
        }

        /**
         * 处理DB访问异常（BadSqlGrammarException/DuplicateKeyException已单独处理，此处捕获其余DataAccessException）。
         * 将错误信息暴露出来便于诊断列缺失/连接异常等问题。
         */
        @ExceptionHandler(DataAccessException.class)
        public ResponseEntity<Result<?>> handleDataAccess(DataAccessException e, HttpServletRequest request) {
                String method = request == null ? "" : request.getMethod();
                String uri = request == null ? "" : request.getRequestURI();
                logger.error("DB访问异常: {} {} - {}", method, uri, e.getMessage(), e);
                return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                                .body(Result.fail(500, "数据访问失败，请稍后重试，如问题持续请联系管理员"));
        }

        @ExceptionHandler(IOException.class)
        public ResponseEntity<Result<?>> handleIOException(IOException e, HttpServletRequest request) {
                String method = request == null ? "" : request.getMethod();
                String uri = request == null ? "" : request.getRequestURI();
                String msg = e.getMessage();
                if (msg != null && (msg.contains("Broken pipe")
                                || msg.contains("Connection reset")
                                || msg.contains("断开的管道")
                                || msg.contains("forcibly closed")
                                || msg.contains("An established connection was aborted")
                                || msg.contains("AsyncRequestNotUsableException"))) {
                        logger.debug("客户端断开连接: {} {}", method, uri);
                        return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).build();
                }
                logger.error("IO异常: {} {}", method, uri, e);
                return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                                .body(Result.fail(500, "服务器繁忙，请稍后重试，如问题持续请联系管理员"));
        }

        /**
         * 处理系统异常
         *
         * @param e 系统异常
         * @return 标准化错误响应
         */
        @ExceptionHandler(Exception.class)
        public ResponseEntity<Result<?>> handleSystemException(Exception e, HttpServletRequest request,
                        HttpServletResponse response) {
                String method = request == null ? "" : request.getMethod();
                String uri = request == null ? "" : request.getRequestURI();

                // SSE/流场景：响应已提交时降级为 debug 日志，避免"response is already committed"反复刷屏
                if (response != null && response.isCommitted()) {
                        logger.debug("响应已提交（SSE/流场景），异常: {} {} - {}", method, uri, e.getMessage());
                        return null;
                }

                logger.error("系统异常: {} {}", method, uri, e);
                return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                                .body(Result.fail(500, "服务器开小差了，请稍后重试，如问题持续请联系管理员"));
        }

        private String sanitizeClientMessage(String message) {
                if (message == null) return "请求处理失败";
                String sanitized = message
                                .replaceAll("(?i)(password|secret|token|key|credential)\\s*[:=]\\s*\\S+", "$1=***")
                                .replaceAll("(?i)(jdbc|mysql|redis)://\\S+", "$1://***")
                                .replaceAll("(?i)(table|column)\\s+['\"]?\\w+", "$1=***")
                                .replaceAll("(?i)SELECT\\s+.+?\\s+FROM", "SQL=***")
                                .replaceAll("(?i)INSERT\\s+.+?\\s+INTO", "SQL=***")
                                .replaceAll("(?i)UPDATE\\s+.+?\\s+SET", "SQL=***");
                if (sanitized.length() > 200) {
                        sanitized = sanitized.substring(0, 200) + "...";
                }
                return sanitized;
        }
}
