package com.fashion.supplychain.intelligence.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import java.time.LocalDateTime;
import lombok.Data;

@Data
@TableName("t_scan_precheck_feedback")
public class ScanPrecheckFeedback {

    @TableId(type = IdType.AUTO)
    private Long id;

    private Long tenantId;

    private String orderNo;

    private String scanType;

    private String precheckIssues;

    private String userAction;

    private String userRemark;

    private Long operatorId;

    private String operatorName;

    private LocalDateTime createdAt;
}
