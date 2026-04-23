package com.fashion.supplychain.config;

import com.fashion.supplychain.common.UserContext;
import lombok.extern.slf4j.Slf4j;
import org.springframework.aop.interceptor.AsyncUncaughtExceptionHandler;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.task.TaskDecorator;
import org.springframework.scheduling.annotation.AsyncConfigurer;
import org.springframework.scheduling.annotation.EnableAsync;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;
import org.slf4j.MDC;

import java.lang.reflect.Method;
import java.util.Map;
import java.util.concurrent.Executor;
import java.util.concurrent.ThreadPoolExecutor;

/**
 * 异步线程池配置
 * 避免默认 SimpleAsyncTaskExecutor 无限创建线程导致 OOM
 */
@Slf4j
@Configuration
@EnableAsync
public class AsyncConfig implements AsyncConfigurer {

    @Override
    @Bean("taskExecutor")
    public Executor getAsyncExecutor() {
        ThreadPoolTaskExecutor executor = new ThreadPoolTaskExecutor();
        executor.setCorePoolSize(20);
        executor.setMaxPoolSize(50);
        executor.setQueueCapacity(2000);
        executor.setKeepAliveSeconds(60);
        executor.setThreadNamePrefix("fashion-async-");
        executor.setTaskDecorator(contextCopyingDecorator());
        // 队列满时，调用线程执行（降级策略，不丢失任务）
        executor.setRejectedExecutionHandler(new ThreadPoolExecutor.CallerRunsPolicy());
        executor.setWaitForTasksToCompleteOnShutdown(true);
        executor.setAwaitTerminationSeconds(30);
        executor.initialize();
        log.info("Async thread pool initialized: core={}, max={}, queue={}",
                executor.getCorePoolSize(), executor.getMaxPoolSize(), 2000);
        return executor;
    }

    @Override
    public AsyncUncaughtExceptionHandler getAsyncUncaughtExceptionHandler() {
        return (Throwable ex, Method method, Object... params) -> {
            log.error("Async method [{}] threw exception: {}", method.getName(), ex.getMessage(), ex);
        };
    }

    private TaskDecorator contextCopyingDecorator() {
        return runnable -> {
            UserContext userContextSnapshot = copyUserContext(UserContext.get());
            Map<String, String> mdcSnapshot = MDC.getCopyOfContextMap();
            return () -> {
                UserContext previousUserContext = UserContext.get();
                Map<String, String> previousMdc = MDC.getCopyOfContextMap();
                try {
                    if (userContextSnapshot != null) {
                        UserContext.set(userContextSnapshot);
                    } else {
                        UserContext.clear();
                    }
                    if (mdcSnapshot != null && !mdcSnapshot.isEmpty()) {
                        MDC.setContextMap(mdcSnapshot);
                    } else {
                        MDC.clear();
                    }
                    runnable.run();
                } finally {
                    if (previousUserContext != null) {
                        UserContext.set(previousUserContext);
                    } else {
                        UserContext.clear();
                    }
                    if (previousMdc != null && !previousMdc.isEmpty()) {
                        MDC.setContextMap(previousMdc);
                    } else {
                        MDC.clear();
                    }
                }
            };
        };
    }

    private UserContext copyUserContext(UserContext source) {
        if (source == null) {
            return null;
        }
        UserContext copy = new UserContext();
        copy.setUserId(source.getUserId());
        copy.setUsername(source.getUsername());
        copy.setRole(source.getRole());
        copy.setPermissionRange(source.getPermissionRange());
        copy.setTeamId(source.getTeamId());
        copy.setTenantId(source.getTenantId());
        copy.setTenantOwner(source.getTenantOwner());
        copy.setSuperAdmin(source.getSuperAdmin());
        copy.setFactoryId(source.getFactoryId());
        return copy;
    }
}
