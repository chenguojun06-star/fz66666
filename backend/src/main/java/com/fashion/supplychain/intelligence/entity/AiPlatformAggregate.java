package com.fashion.supplychain.intelligence.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import lombok.Data;

/**
 * AI 平台级聚合统计（仅超管/云裳智链可见）
 * <p>跨租户匿名聚合 工具命中率/采纳率/MTTR/工序基准 等，作为平台级护城河。
 * <br>普通租户接口禁止读取此表。</p>
 */
@Data
@TableName("t_ai_platform_aggregate")
public class AiPlatformAggregate {

    @TableId(type = IdType.AUTO)
    private Long id;

    /** tool.hit_rate / agent.adoption_rate / patrol.mttr / process.benchmark */
    private String metricKey;

    /** 维度，如 tool=tool_order_query */
    private String metricDim;

    /** DAY / WEEK / MONTH */
    private String period;

    private LocalDateTime periodStart;
    private LocalDateTime periodEnd;

    /** NULL = 跨租户聚合 */
    private Long tenantId;

    private BigDecimal metricValue;
    private Long metricCount;
    private BigDecimal metricMin;
    private BigDecimal metricMax;
    private BigDecimal metricP50;
    private BigDecimal metricP90;

    private String extraJson;

    private LocalDateTime createTime;
}
