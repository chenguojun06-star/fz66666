package com.fashion.supplychain.intelligence.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.fashion.supplychain.intelligence.entity.AiCostTracking;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

@Mapper
public interface AiCostTrackingMapper extends BaseMapper<AiCostTracking> {

    @Select("SELECT COALESCE(SUM(total_tokens), 0) FROM t_ai_cost_tracking WHERE tenant_id = #{tenantId} AND created_at >= #{since}")
    long sumTokensSince(@Param("tenantId") Long tenantId, @Param("since") LocalDateTime since);

    /**
     * D-702 修：原查 {@code estimated_cost_usd}，但表里实际列名是 {@code estimated_cost}
     * （实体侧已用 {@code @TableField("estimated_cost")} 纠正）。
     * 两边不一致导致这个方法一被调用就报「未知列」，即 {@code getCostSummary} 接口必然 500。
     * 说明：{@code @Select} 是手写 SQL，不走实体映射，所以实体改了、这里没跟着改。
     */
    @Select("SELECT COALESCE(SUM(estimated_cost), 0) FROM t_ai_cost_tracking WHERE tenant_id = #{tenantId} AND created_at >= #{since}")
    BigDecimal sumCostSince(@Param("tenantId") Long tenantId, @Param("since") LocalDateTime since);

    /**
     * D-702：按天统计 Prompt 缓存命中情况。
     *
     * <p>调研确认 Prompt Caching 可使 LLM 成本降低 45–80%（arXiv 2601.06007），
     * DeepSeek 缓存命中价约为未命中的 1/10。要判断「是否值得优化 prompt 前缀稳定性」，
     * 前提是能长期看到命中率 —— 此前该数据只在内存 AtomicLong 里，重启清零、无法看趋势。
     *
     * <p>按 tenant_id 过滤，与 {@link #sumTokensSince} 保持同一数据边界；
     * 传 0 即取「系统桶」（后台定时任务），传具体租户则只看该租户。
     */
    @Select("""
            SELECT DATE(created_at) AS d,
                   COALESCE(SUM(prompt_cache_hit_tokens), 0)  AS hitTokens,
                   COALESCE(SUM(prompt_cache_miss_tokens), 0) AS missTokens,
                   COUNT(*) AS requests
            FROM t_ai_cost_tracking
            WHERE tenant_id = #{tenantId} AND created_at >= #{since}
            GROUP BY DATE(created_at)
            ORDER BY d
            """)
    List<Map<String, Object>> cacheHitTrendSince(@Param("tenantId") Long tenantId, @Param("since") LocalDateTime since);

    /**
     * D-702：按场景统计缓存命中，用于定位「哪类调用把缓存打崩了」。
     *
     * <p>前缀缓存只认稳定前缀：若某场景把变动内容（时间/租户/用户名）拼进 system prompt
     * 开头，该场景的命中率会显著低于其他场景 —— 这张表就是用来把它揪出来的。
     */
    @Select("""
            SELECT scene,
                   COALESCE(SUM(prompt_cache_hit_tokens), 0)  AS hitTokens,
                   COALESCE(SUM(prompt_cache_miss_tokens), 0) AS missTokens,
                   COUNT(*) AS requests
            FROM t_ai_cost_tracking
            WHERE tenant_id = #{tenantId} AND created_at >= #{since}
            GROUP BY scene
            ORDER BY (COALESCE(SUM(prompt_cache_miss_tokens),0)) DESC
            LIMIT 30
            """)
    List<Map<String, Object>> cacheHitBySceneSince(@Param("tenantId") Long tenantId, @Param("since") LocalDateTime since);
}