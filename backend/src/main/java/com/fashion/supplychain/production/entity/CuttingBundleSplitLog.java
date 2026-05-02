package com.fashion.supplychain.production.entity;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import java.time.LocalDateTime;
import lombok.Data;

@Data
@TableName("t_cutting_bundle_split_log")
public class CuttingBundleSplitLog {

    @TableId(type = IdType.ASSIGN_UUID)
    private String id;

    private String rootBundleId;
    private String sourceBundleId;
    private Integer sourceBundleNo;
    private String sourceBundleLabel;
    private Integer sourceQuantity;
    private Integer completedQuantity;
    private Integer transferQuantity;
    private String currentProcessName;
    private String fromWorkerId;
    private String fromWorkerName;
    private String toWorkerId;
    private String toWorkerName;
    private String reason;
    private String splitStatus;
    private String completedBundleId;
    private String completedBundleLabel;
    private String transferBundleId;
    private String transferBundleLabel;
    private LocalDateTime rollbackTime;
    private String rollbackBy;
    private String rollbackReason;
    private LocalDateTime createTime;
    private LocalDateTime updateTime;
    private String creator;
    private String updater;

    @TableField(fill = FieldFill.INSERT)
    private Long tenantId;
}
