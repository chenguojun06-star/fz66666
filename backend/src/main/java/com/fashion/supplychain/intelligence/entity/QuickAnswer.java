package com.fashion.supplychain.intelligence.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableLogic;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * AI秒答缓存 - 业务快照与预构建答案
 *
 * <p>三层秒答体系：
 * <ol>
 *   <li>SNAPSHOT：每30分钟的业务数据快照（数字卡片）</li>
 *   <li>PREBUILT：高频问题的完整回答（可直接引用）</li>
 *   <li>HOTSPOT：用户正在查看的页面预取</li>
 * </ol>
 *
 * <p>多租户隔离（P0 铁律 4）：所有查询必须带 tenant_id WHERE。
 */
@Data
@TableName("t_quick_answer")
public class QuickAnswer {

    @TableId(type = IdType.AUTO)
    private Long id;

    @TableField("tenant_id")
    private Long tenantId;

    /** 缓存类型：SNAPSHOT / PREBUILT / HOTSPOT */
    @TableField("answer_type")
    private String answerType;

    /** 匹配的问题模式（用于PREBUILT类型的命中判断） */
    @TableField("question_pattern")
    private String questionPattern;

    /** 答案摘要（可直接显示给用户的文本） */
    @TableField("answer_summary")
    private String answerSummary;

    /** 结构化快照数据JSON（订单数/物料/质检等） */
    @TableField("snapshot_data")
    private String snapshotData;

    /** 证据/查询来源记录JSON（供DataTruthGuard验证） */
    @TableField("raw_evidence")
    private String rawEvidence;

    /** 置信度0-100 */
    @TableField("confidence")
    private Double confidence;

    /** 数据时间戳（表示此答案反映的时间点，用于向用户展示"截至XX时间的数据"） */
    @TableField("data_timestamp")
    private LocalDateTime dataTimestamp;

    /** 来源：BusinessSnapshotPrefetcher / ProactivePatrolAgent 等 */
    @TableField("cache_source")
    private String cacheSource;

    /** 命中次数（帮助判断哪些问题是高频） */
    @TableField("hit_count")
    private Integer hitCount;

    /** 最后命中时间 */
    @TableField("last_hit_time")
    private LocalDateTime lastHitTime;

    @TableLogic
    @TableField("delete_flag")
    private Integer deleteFlag;

    @TableField("create_time")
    private LocalDateTime createTime;

    @TableField("update_time")
    private LocalDateTime updateTime;

    /** 过期时间（默认为30分钟后，与预取周期对齐） */
    @TableField("expire_time")
    private LocalDateTime expireTime;
}
