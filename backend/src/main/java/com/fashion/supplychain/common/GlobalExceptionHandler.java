package com.fashion.supplychain.common;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataAccessException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.BadSqlGrammarException;
import org.springframework.transaction.UnexpectedRollbackException;
import org.springframework.validation.BindException;
import org.springframework.validation.FieldError;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.servlet.NoHandlerFoundException;

import javax.servlet.http.HttpServletRequest;
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
         * 处理参数错误/状态错误（业务层常用抛出方式）。
         */
        @ExceptionHandler({ IllegalArgumentException.class, IllegalStateException.class })
        public ResponseEntity<Result<?>> handleIllegalState(RuntimeException e, HttpServletRequest request) {
                logger.warn("请求处理失败: {} {} - {}", request == null ? "" : request.getMethod(),
                                request == null ? "" : request.getRequestURI(), e.getMessage());
                return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(Result.fail(400, e.getMessage()));
        }

        /**
         * 处理数据不存在。
         */
        @ExceptionHandler(NoSuchElementException.class)
        public ResponseEntity<Result<?>> handleNoSuchElement(NoSuchElementException e, HttpServletRequest request) {
                logger.warn("资源不存在: {} {} - {}", request == null ? "" : request.getMethod(),
                                request == null ? "" : request.getRequestURI(), e.getMessage());
                return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Result.fail(404, e.getMessage()));
        }

        /**
         * 处理权限不足。
         */
        @ExceptionHandler(AccessDeniedException.class)
        public ResponseEntity<Result<?>> handleAccessDenied(AccessDeniedException e, HttpServletRequest request) {
                logger.warn("权限不足: {} {} - {}", request == null ? "" : request.getMethod(),
                                request == null ? "" : request.getRequestURI(), e.getMessage());
                return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Result.fail(403, e.getMessage()));
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
                                .body(Result.fail(500, "数据库结构不一致: " + rootMsg));
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
                                .body(Result.fail(500, "操作失败（事务回滚）：" + e.getMessage()));
        }

        /**
         * 处理DB访问异常（BadSqlGrammarException已单独处理，此处捕获其余DataAccessException）。
         * 将错误信息暴露出来便于诊断列缺失/连接异常等问题。
         */
        @ExceptionHandler(DataAccessException.class)
        public ResponseEntity<Result<?>> handleDataAccess(DataAccessException e, HttpServletRequest request) {
                String method = request == null ? "" : request.getMethod();
                String uri = request == null ? "" : request.getRequestURI();
                logger.error("DB访问异常: {} {} - {}", method, uri, e.getMessage(), e);
                return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                                .body(Result.fail(500, "数据库操作失败：" + e.getMessage()));
        }

        /**
         * 处理系统异常
         *
         * @param e 系统异常
         * @return 标准化错误响应
         */
        @ExceptionHandler(Exception.class)
        public ResponseEntity<Result<?>> handleSystemException(Exception e, HttpServletRequest request) {
                String method = request == null ? "" : request.getMethod();
                String uri = request == null ? "" : request.getRequestURI();
                logger.error("系统异常: {} {}", method, uri, e);
                return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                                .body(Result.fail(500, "系统内部错误，请联系管理员"));
        }
}
