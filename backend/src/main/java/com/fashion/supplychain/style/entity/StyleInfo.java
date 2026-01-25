package com.fashion.supplychain.style.entity;

import com.baomidou.mybatisplus.annotation.TableName;
import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableField;
import com.fasterxml.jackson.annotation.JsonFormat;
import java.time.LocalDateTime;
import java.math.BigDecimal;
import lombok.Data;

/**
 * 款号资料实体类
 */
@Data
@TableName("t_style_info")
public class StyleInfo {

    /**
     * 主键ID
     */
    @TableId(type = IdType.AUTO)
    private Long id;

    /**
     * 款号
     */
    private String styleNo;

    /**
     * 款名
     */
    private String styleName;

    /**
     * 品类
     */
    private String category;

    /**
     * 单价
     */
    private BigDecimal price;

    /**
     * 生产周期(天)
     */
    private Integer cycle;

    /**
     * 描述
     */
    private String description;

    /**
     * 年份
     */
    private Integer year;

    /**
     * 月份
     */
    private Integer month;

    /**
     * 季节
     */
    private String season;

    /**
     * 颜色
     */
    private String color;

    /**
     * 码数
     */
    private String size;

    /**
     * 封面图片
     */
    private String cover;

    /**
     * 状态：ENABLED-启用，DISABLED-禁用
     */
    private String status;

    /**
     * 创建时间
     */
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime createTime;

    /**
     * 更新时间
     */
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime updateTime;

    private String patternStatus;

    @TableField(exist = false)
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime patternStartTime;

    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime patternCompletedTime;

    private String sampleStatus;

    private Integer sampleProgress;

    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime sampleCompletedTime;

    @TableField(exist = false)
    private String progressNode;

    @TableField(exist = false)
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime completedTime;

    @TableField(exist = false)
    private String latestOrderNo;

    @TableField(exist = false)
    private String latestOrderStatus;

    @TableField(exist = false)
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime latestOrderTime;

    @TableField(exist = false)
    private Integer latestProductionProgress;

    @TableField(exist = false)
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime maintenanceTime;

    @TableField(exist = false)
    private String maintenanceRemark;

    @TableField(exist = false)
    private Integer orderCount;
}
