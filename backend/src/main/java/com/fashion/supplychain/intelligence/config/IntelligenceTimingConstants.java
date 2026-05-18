package com.fashion.supplychain.intelligence.config;

import java.util.concurrent.TimeUnit;

/**
 * 智能模块统一超时常量
 *
 * 覆盖原 intelligence 模块中 14 处硬编码 timeout/sleep 值，
 * 后续新增超时统一走此处，运维调优改一处即可。
 */
public final class IntelligenceTimingConstants {

    private IntelligenceTimingConstants() {}

    /** Prompt 并行构建，每个 Future 的超时 */
    public static final long PROMPT_BUILD_FUTURE_TIMEOUT_SEC = 5;
    public static final TimeUnit PROMPT_BUILD_FUTURE_TIMEOUT_UNIT = TimeUnit.SECONDS;

    /** DAG/Swarm 引擎整体超时 */
    public static final long DAG_EXECUTION_TIMEOUT_SEC = 120;
    public static final TimeUnit DAG_EXECUTION_TIMEOUT_UNIT = TimeUnit.SECONDS;

    /** Self-Consistency 验证并行超时 */
    public static final long CONSISTENCY_VERIFY_TIMEOUT_SEC = 30;
    public static final TimeUnit CONSISTENCY_VERIFY_TIMEOUT_UNIT = TimeUnit.SECONDS;

    /** Graph-of-Thoughts 节点推理超时 */
    public static final long GOT_INFERENCE_TIMEOUT_SEC = 30;
    public static final TimeUnit GOT_INFERENCE_TIMEOUT_UNIT = TimeUnit.SECONDS;

    /** 数字孪生构建超时 */
    public static final long DIGITAL_TWIN_BUILD_TIMEOUT_SEC = 8;
    public static final TimeUnit DIGITAL_TWIN_BUILD_TIMEOUT_UNIT = TimeUnit.SECONDS;

    /** Agent Tool 注解默认超时 (3个ExpertTool) */
    public static final long AGENT_TOOL_DEFAULT_TIMEOUT_MS = 15000;

    /** 重试退避间隔 */
    public static final long RETRY_BACKOFF_MIN_MS = 300;
    public static final long RETRY_BACKOFF_RANDOM_MS = 200;
    public static final long INFERENCE_RETRY_BACKOFF_MIN_MS = 1000;
    public static final long INFERENCE_RETRY_BACKOFF_RANDOM_MS = 500;

    /** 进化安全守卫暂停 */
    public static final long EVOLUTION_SAFETY_PAUSE_MS = 100;

    /** GitHub 研究延迟 */
    public static final long GITHUB_RESEARCH_DELAY_SEC = 3;
}