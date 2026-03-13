package com.fashion.supplychain.intelligence.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import java.time.LocalDateTime;
import lombok.Data;

@Data
@TableName("t_agent_meeting")
public class AgentMeeting {

    @TableId(type = IdType.AUTO)
    private Long id;

    private Long tenantId;

    /** daily_standup|risk_review|decision_debate|retrospective */
    private String meetingType;

    private String topic;

    /** JSON参与Agent列表 */
    private String participants;

    /** JSON议程 */
    private String agenda;

    /** JSON辩论轮次 */
    private String debateRounds;

    private String consensus;

    private String dissent;

    /** JSON行动项 */
    private String actionItems;

    private Integer confidenceScore;

    private String linkedDecisionIds;

    private String linkedRcaIds;

    private Long durationMs;

    /** in_progress|concluded|actions_pending|all_done */
    private String status;

    private Integer deleteFlag;

    private LocalDateTime createTime;
}
