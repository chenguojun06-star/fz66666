package com.fashion.supplychain.intelligence.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import lombok.Data;

/**
 * AI 可解释决策卡
 * <p>每条 AI 建议附带 数据依据 + 推理路径 + 不确定性，让用户敢信 AI。</p>
 */
@Data
@TableName("t_ai_decision_card")
public class AiDecisionCard {

    @TableId(type = IdType.AUTO)
    private Long id;

    private String cardUid;
    private Long tenantId;
    private String userId;
    private String sessionId;
    private Long planId;
    private String scene;

    private String question;
    private String recommendation;

    /** 数据依据 JSON：[{table,filter,sample}] */
    private String dataEvidenceJson;

    /** 推理路径 JSON：[{tool,input,conclusion}] */
    private String reasoningPathJson;

    /** 不确定性 JSON：[{assumption,confidence}] */
    private String uncertaintyJson;

    private BigDecimal confidence;

    /** LOW / MEDIUM / HIGH */
    private String riskLevel;

    private String traceId;

    /** 0=未处理 1=采纳 -1=拒绝 */
    private Integer adopted;
    private LocalDateTime adoptionTime;
    private String adoptionReason;
    private Integer feedbackScore;

    private LocalDateTime createTime;
    private LocalDateTime updateTime;
}
