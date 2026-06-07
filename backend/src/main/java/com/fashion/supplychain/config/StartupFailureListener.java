package com.fashion.supplychain.config;

import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.context.event.ApplicationFailedEvent;
import org.springframework.context.ApplicationListener;
import org.springframework.stereotype.Component;

/**
 * 全局启动失败监听器 — 确保完整异常堆栈不被截断。
 * 云端日志系统可能只展示最后几行，此监听器强制输出完整根因。
 */
@Slf4j
@Component
public class StartupFailureListener implements ApplicationListener<ApplicationFailedEvent> {

    @Override
    public void onApplicationEvent(ApplicationFailedEvent event) {
        Throwable exception = event.getException();
        if (exception == null) {
            log.error("[StartupFailure] 启动失败，但未捕获到异常对象");
            return;
        }

        log.error("[StartupFailure] ========================================");
        log.error("[StartupFailure] 应用启动失败，完整异常链如下：");
        log.error("[StartupFailure] ========================================");

        Throwable current = exception;
        int depth = 0;
        while (current != null && depth < 20) {
            log.error("[StartupFailure] 异常[{}]: {} - {}",
                    depth,
                    current.getClass().getName(),
                    current.getMessage());
            // 打印堆栈前5行（关键信息）
            StackTraceElement[] stack = current.getStackTrace();
            int limit = Math.min(stack.length, 8);
            for (int i = 0; i < limit; i++) {
                log.error("[StartupFailure]    at {}", stack[i]);
            }
            if (stack.length > limit) {
                log.error("[StartupFailure]    ... {} more frames", stack.length - limit);
            }
            current = current.getCause();
            depth++;
        }

        log.error("[StartupFailure] ========================================");
        log.error("[StartupFailure] 完整异常（含堆栈）:", exception);
    }
}