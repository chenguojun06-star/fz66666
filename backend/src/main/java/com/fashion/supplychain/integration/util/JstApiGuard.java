package com.fashion.supplychain.integration.util;

import java.util.concurrent.atomic.AtomicInteger;
import lombok.extern.slf4j.Slf4j;

/**
 * 聚水潭 OpenAPI 进程级熔断器
 *
 * 背景：云托管出网链路异常时，对端 ALB 持续返回 400（明文HTTP打到HTTPS端口），
 * 定时任务（订单同步/库存同步/重试）会以分钟级频率反复轰炸对端，既刷屏日志又可能触发对端风控。
 *
 * 语义：连续 3 次调用失败后熔断 30 分钟（期间所有 JST 定时调用直接跳过）；
 * 任意一次成功即复位；用户手动「测试连接」前应调用 {@link #reset()} 以获取真实结果。
 */
@Slf4j
public final class JstApiGuard {

    private static final int FAILURE_THRESHOLD = 3;
    private static final long OPEN_MILLIS = 30 * 60 * 1000L;

    private static final AtomicInteger CONSECUTIVE_FAILURES = new AtomicInteger();
    private static volatile long openUntil = 0L;

    private JstApiGuard() {
    }

    /** 熔断是否处于打开状态（打开=true，调用方应跳过请求） */
    public static boolean isOpen() {
        return System.currentTimeMillis() < openUntil;
    }

    /** 记录一次成功：清零失败计数并关闭熔断 */
    public static void recordSuccess() {
        CONSECUTIVE_FAILURES.set(0);
        openUntil = 0L;
    }

    /** 记录一次失败：连续达到阈值时打开熔断（固定30分钟，不因后续失败续期） */
    public static void recordFailure() {
        if (CONSECUTIVE_FAILURES.incrementAndGet() == FAILURE_THRESHOLD) {
            openUntil = System.currentTimeMillis() + OPEN_MILLIS;
            log.error("[聚水潭API] 连续 {} 次调用失败，已熔断 30 分钟（期间定时任务自动跳过；手动「测试连接」不受影响）。"
                    + "若持续失败请排查云托管出网代理/凭证配置", FAILURE_THRESHOLD);
        }
    }

    /** 手动测试连接前复位熔断，确保拿到真实结果 */
    public static void reset() {
        recordSuccess();
    }
}
