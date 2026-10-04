package com.fashion.supplychain.intelligence.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import lombok.Data;

/**
 * AI 推理成本追踪（D-700）
 *
 * <p><b>为什么补这些 {@link TableField}（重要）</b>：本实体此前<b>一个注解都没有</b>，
 * 完全依赖 MyBatis-Plus 的「驼峰 → 下划线」默认推导，于是生成的是：
 * <pre>
 *   modelName        → model_name          ✗ 表里实际是 model
 *   estimatedCostUsd → estimated_cost_usd  ✗ 表里实际是 estimated_cost
 *   success          → success             ✗ 表里没有这列
 *   errorMessage     → error_message       ✗ 表里没有这两列
 * </pre>
 * INSERT 因「未知列」直接失败，而调用方
 * {@code AiCostTrackingOrchestrator#recordAsync} 用的是
 * {@code catch (Exception e) { log.debug(...) }} —— <b>失败被 debug 级别静默吞掉</b>。
 *
 * <p>后果：{@code t_ai_cost_tracking} 建表至今<b>0 行</b>，而线上真实支出已累计 ¥317。
 * 也就是说系统<b>完全没有成本归因能力</b>：数据库说今日 9.1 万 tokens，
 * DeepSeek 账单说 199 万 —— 22 倍盲区，无法回答「钱花在哪」。
 *
 * <p>对应表结构（以 t_ai_cost_tracking 实际列为准）：
 * <pre>
 *   id, tenant_id, scene, provider, model, prompt_tokens, completion_tokens,
 *   total_tokens, estimated_cost, latency_ms, user_id, trace_id, created_at
 * </pre>
 *
 * <p><b>关于 success / errorMessage</b>：表里没有这两列。失败信息在
 * {@code t_intelligence_metrics}（有 success / error_message）里已完整留存，
 * 此处标 {@code exist = false} 不再重复落库 —— <b>不新增 Flyway 迁移</b>，
 * 避免为成本统计引入不必要的表结构变更。成本分析只需要
 * 租户 + 场景 + 模型 + token + 金额 + 时间，这几列都在。
 */
@Data
@TableName("t_ai_cost_tracking")
public class AiCostTracking {

    @TableId(type = IdType.AUTO)
    private Long id;

    private Long tenantId;

    /** 表列名为 model（不是 model_name） */
    @TableField("model")
    private String modelName;

    private String scene;

    private Integer promptTokens;

    private Integer completionTokens;

    /**
     * D-702：Prompt 缓存命中 token。
     *
     * <p>调研确认 Prompt Caching 可使 LLM 成本降低 45–80%（arXiv 2601.06007），
     * DeepSeek 缓存命中价约为未命中的 1/10。此前该数据只累计在内存 AtomicLong，
     * 唯一出口被门控、且唯一日志行因 {@code ai.observability.enabled=false}
     * 永不执行 → 等于没有。故随每次推理落库，使命中率可查、可看趋势。
     */
    @TableField("prompt_cache_hit_tokens")
    private Integer promptCacheHitTokens;

    /** D-702：Prompt 缓存未命中 token。与上一列共同决定命中率。 */
    @TableField("prompt_cache_miss_tokens")
    private Integer promptCacheMissTokens;

    private Integer totalTokens;

    /** 表列名为 estimated_cost（不是 estimated_cost_usd） */
    @TableField("estimated_cost")
    private BigDecimal estimatedCostUsd;

    private Integer latencyMs;

    /** 表无此列，失败详情见 t_intelligence_metrics.success / error_message */
    @TableField(exist = false)
    private Boolean success;

    /** 表无此列，失败详情见 t_intelligence_metrics.success / error_message */
    @TableField(exist = false)
    private String errorMessage;

    private LocalDateTime createdAt;
}
