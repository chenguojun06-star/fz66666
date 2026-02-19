package com.fashion.supplychain.style.entity;

import com.baomidou.mybatisplus.annotation.TableName;
import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.FieldFill;
import com.fasterxml.jackson.annotation.JsonFormat;
import com.fasterxml.jackson.annotation.JsonAlias;
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
     * 支持多种字段名别名
     */
    @JsonAlias({"style_no", "styleCode"})
    private String styleNo;

    /**
     * 款名
     * 支持多种前端字段名: styleName, styleNameCN, style_name
     */
    @JsonAlias({"styleNameCN", "style_name", "name"})
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
     * 样板数
     */
    private Integer sampleQuantity;

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
     * 交板日期
     */
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime deliveryDate;

    /**
     * 更新时间
     */
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime updateTime;

    private String patternStatus;

    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime patternStartTime;

    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime patternCompletedTime;

    /**
     * 纸样领取人
     */
    private String patternAssignee;

    /**
     * BOM领取人
     */
    private String bomAssignee;

    /**
     * BOM开始时间
     */
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime bomStartTime;

    /**
     * BOM完成时间
     */
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime bomCompletedTime;

    /**
     * 尺码领取人
     */
    private String sizeAssignee;

    /**
     * 尺码开始时间
     */
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime sizeStartTime;

    /**
     * 尺码完成时间
     */
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime sizeCompletedTime;

    /**
     * 工序领取人
     */
    private String processAssignee;

    /**
     * 工序开始时间
     */
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime processStartTime;

    /**
     * 工序完成时间
     */
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime processCompletedTime;

    /**
     * 生产制单领取人
     */
    private String productionAssignee;

    /**
     * 生产制单开始时间
     */
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime productionStartTime;

    /**
     * 生产制单完成时间
     */
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime productionCompletedTime;

    /**
     * 二次工艺领取人
     */
    private String secondaryAssignee;

    /**
     * 二次工艺开始时间
     */
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime secondaryStartTime;

    /**
     * 二次工艺完成时间
     */
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime secondaryCompletedTime;

    /**
     * 码数单价配置人
     */
    private String sizePriceAssignee;

    /**
     * 码数单价开始时间
     */
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime sizePriceStartTime;

    /**
     * 码数单价完成时间
     */
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime sizePriceCompletedTime;

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
    private String maintenanceMan;

    @TableField(exist = false)
    private String maintenanceRemark;

    @TableField(exist = false)
    private Integer orderCount;

    /**
     * 最近下单人
     */
    @TableField(exist = false)
    private String latestOrderCreator;

    /**
     * 码数颜色配置（JSON格式）
     * 存储样板的尺码、颜色、数量配置信息
     */
    private String sizeColorConfig;

    /**
     * 设计师（复用sampleNo字段）
     */
    private String sampleNo;

    /**
     * 设计号（复用vehicleSupplier字段）
     */
    private String vehicleSupplier;

    /**
     * 纸样师（复用sampleSupplier字段）
     */
    private String sampleSupplier;

    /**
     * 纸样号
     */
    private String patternNo;

    /**
     * 车板师
     */
    private String plateWorker;

    /**
     * 板类（首单/复板/公司版等）
     */
    private String plateType;

    /**
     * 跟单员（复用orderType字段）
     */
    private String orderType;

    /**
     * 客户
     */
    private String customer;

    /**
     * 订单号（关联的最新订单号）
     */
    private String orderNo;

    /**
     * 租户ID（多租户隔离，自动填充）
     */
    @TableField(fill = FieldFill.INSERT)
    private Long tenantId;
}
