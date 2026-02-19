package com.fashion.supplychain.style.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.TableField;
import lombok.Data;
import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * 款号工序表实体类
 */
@Data
@TableName("t_style_process")
public class StyleProcess {

    @TableId(type = IdType.ASSIGN_UUID)
    private String id;

    /**
     * 关联款号ID
     */
    private Long styleId;

    /**
     * 工序编码
     */
    private String processCode;

    /**
     * 工序名称
     */
    private String processName;

    /**
     * 进度节点（采购/裁剪/车缝/尾部/入库）
     */
    private String progressStage;

    /**
     * 机器类型
     */
    private String machineType;

    /**
     * 标准工时(秒)
     */
    private Integer standardTime;

    /**
     * 工价(元)
     */
    private BigDecimal price;

    /**
     * 排序号
     */
    private Integer sortOrder;

    /**
     * 领取人
     */
    private String assignee;

    /**
     * 开始时间
     */
    private LocalDateTime startTime;

    /**
     * 完成时间
     */
    private LocalDateTime completedTime;

    private LocalDateTime createTime;
    private LocalDateTime updateTime;

    @TableField(fill = FieldFill.INSERT)
    private Long tenantId;
}
