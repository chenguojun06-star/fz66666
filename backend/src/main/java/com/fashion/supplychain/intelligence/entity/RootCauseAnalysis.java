package com.fashion.supplychain.intelligence.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import java.time.LocalDateTime;
import lombok.Data;

@Data
@TableName("t_root_cause_analysis")
public class RootCauseAnalysis {

    @TableId(type = IdType.AUTO)
    private Long id;

    private Long tenantId;

    /** overdue|stagnant|quality_defect|cost_overrun|delivery_delay */
    private String triggerType;

    private String triggerDescription;

    private String linkedOrderIds;

    /** JSON数组: [{level,question,answer,confidence}] */
    private String whyChain;

    private String rootCause;

    /** material|labor|machine|method|environment|management */
    private String rootCauseCategory;

    /** JSON鱼骨图 */
    private String fishboneData;

    /** JSON跨域关联 */
    private String crossDomainLinks;

    /** JSON建议行动 */
    private String suggestedActions;

    /** low|medium|high|critical */
    private String severity;

    /** analyzing|concluded|action_taken|resolved */
    private String status;

    private String resolutionNote;

    private Integer deleteFlag;

    private LocalDateTime createTime;

    private LocalDateTime updateTime;
}
