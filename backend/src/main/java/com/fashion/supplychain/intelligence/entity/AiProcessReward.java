package com.fashion.supplychain.intelligence.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import java.time.LocalDateTime;
import lombok.Data;

/**
 * AI 过程奖励 PRM 评分
 * <p>用途：为每个工具调用打分，累积成 AgentTool 排行榜，让 AI 越用越准。</p>
 */
@Data
@TableName("t_ai_process_reward")
public class AiProcessReward {

    @TableId(type = IdType.AUTO)
    private Long id;

    private Long tenantId;
    private String sessionId;
    private Long planId;
    private Integer stepIndex;

    private String toolName;
    private String toolInput;
    private String toolOutputSummary;

    /** -2 ~ +2 */
    private Integer score;

    private String scoreReason;

    /** AUTO / CRITIC / USER / HEURISTIC */
    private String scoreSource;

    /** USEFUL / IRRELEVANT / ERROR / PARTIAL */
    private String outcome;

    private Integer durationMs;
    private Integer tokenCost;
    private String scene;

    private LocalDateTime createTime;
}
