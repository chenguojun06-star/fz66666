package com.fashion.supplychain.intelligence.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import java.time.LocalDateTime;
import lombok.Data;

/**
 * AI 调用度量记录
 */
@Data
@TableName("t_intelligence_metrics")
public class IntelligenceMetrics {

    @TableId(type = IdType.AUTO)
    private Long id;

    private Long tenantId;

    /** 调用场景（nl_query / predict / anomaly 等） */
    private String scene;

    /** AI提供商 */
    private String provider;

    /** 模型名称 */
    private String model;

    /** 端到端追踪ID */
    private String traceId;

    /** 外部可跳转的观测链接 */
    private String traceUrl;

    private Boolean success;

    private Boolean fallbackUsed;

    /** 调用耗时（毫秒） */
    private Integer latencyMs;

    private Integer promptChars;

    private Integer responseChars;

    private Integer toolCallCount;

    /** 提示词 token 数（由 LLM 返回） */
    private Integer promptTokens;

    /** 生成 token 数（由 LLM 返回） */
    private Integer completionTokens;

    private String errorMessage;

    private String userId;

    private LocalDateTime createTime;

    private Integer deleteFlag;

    /** 用户反馈文本（feature D：RLHF 数据采集） */
    private String userFeedback;

    /** 反馈分数：+1 赞 / -1 踩 / 0 未评 */
    private Integer feedbackScore;

    /** 关联命令ID，用于反馈追溯 */
    private String commandId;
}
