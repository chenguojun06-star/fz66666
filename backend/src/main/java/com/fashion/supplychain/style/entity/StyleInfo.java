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
     * SKC统编号
     */
    private String skc;

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
     * AI视觉图像分析摘要（豆包Vision识别结果，用于持久化缓存，避免重复调用AI）
     */
    @TableField("image_insight")
    private String imageInsight;

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

    /**
     * 最后维护人
     */
    @TableField("update_by")
    private String updateBy;

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
    private LocalDateTime sampleStartTime;

    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime sampleCompletedTime;

    /** 样衣审核状态：PASS / REWORK / REJECT，null 表示未审核 */
    private String sampleReviewStatus;

    /** 样衣审核评语（选填） */
    private String sampleReviewComment;

    /** 样衣审核人 */
    private String sampleReviewer;

    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime sampleReviewTime;

    /** 开发来源类型：SELF_DEVELOPED / SELECTION_CENTER */
    private String developmentSourceType;

    /** 开发来源明细：自主开发 / 外部市场 / 供应商 / 客户定制 / 内部选品 */
    private String developmentSourceDetail;

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
    private String latestPatternStatus;

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
     * 下单总件数
     */
    @TableField(exist = false)
    private Integer totalOrderQuantity;

    /**
     * 最近下单人
     */
    @TableField(exist = false)
    private String latestOrderCreator;

    /**
     * 报废数量（来自入库质检报废记录聚合）
     */
    @TableField(exist = false)
    private Integer scrapQuantity;

    /**
     * 入库总数量（来自 t_product_warehousing.qualified_quantity 聚合）
     */
    @TableField(exist = false)
    private Integer totalWarehousedQuantity;

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
     * 是否已推送到下单管理：0-未推送，1-已推送
     */
    private Integer pushedToOrder;

    /**
     * 推送到下单管理时间
     */
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime pushedToOrderTime;

    /**
     * 推送人姓名
     */
    private String pushedByName;

    /**
     * 客户
     */
    private String customer;

    /**
     * 订单号（关联的最新订单号）
     */
    private String orderNo;

    /**
     * 面料成分（洗水唛标签专用）
     * 如：70%棉 30%涤纶
     */
    private String fabricComposition;

    /**
     * 洗涤说明（洗水唛标签专用）
     * 如：30°C水洗，不可漂白，低温烘干
     */
    private String washInstructions;

    /**
     * U编码（品质追溯码）
     * 用于吊牌/洗水唛的品质追溯唯一编码
     */
    private String uCode;

    /**
     * 洗涤温度代码（洗水唛图标）
     * 枚举：W30/W40/W60/W95/HAND/NO
     */
    @TableField("wash_temp_code")
    private String washTempCode;

    /**
     * 漂白代码（洗水唛图标）
     * 枚举：ANY/NON_CHL/NO
     */
    @TableField("bleach_code")
    private String bleachCode;

    /**
     * 烘干代码（洗水唛图标）
     * 枚举：NORMAL/LOW/NO
     */
    @TableField("tumble_dry_code")
    private String tumbleDryCode;

    /**
     * 熨烫代码（洗水唛图标）
     * 枚举：LOW/MED/HIGH/NO
     */
    @TableField("iron_code")
    private String ironCode;

    /**
     * 干洗代码（洗水唛图标）
     * 枚举：YES/NO
     */
    @TableField("dry_clean_code")
    private String dryCleanCode;

    /**
     * 多部位面料成分（JSON字符串）
     * 格式：[{"part":"Lower","materials":"91.00% Polyester\n9.00% Spandex"},...]
     * 用于两件套/拼接款分部位标注成分，对应洗水唛打印
     */
    @TableField("fabric_composition_parts")
    private String fabricCompositionParts;

    /**
     * 租户ID（多租户隔离，自动填充）
     */
    @TableField(fill = FieldFill.INSERT)
    private Long tenantId;

    // ==================== 生产制单编辑锁定字段 ====================

    /** 生产制单内容是否锁定：1=锁定（默认），0=已退回可编辑 */
    @TableField("description_locked")
    private Integer descriptionLocked;

    /** 生产制单退回备注 */
    @TableField("description_return_comment")
    private String descriptionReturnComment;

    /** 生产制单退回人 */
    @TableField("description_return_by")
    private String descriptionReturnBy;

    /** 生产制单退回时间 */
    @TableField("description_return_time")
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime descriptionReturnTime;

    // ==================== 纸样修改编辑锁定字段 ====================

    /** 纸样修改是否锁定：1=锁定（默认），0=已退回可编辑 */
    @TableField("pattern_rev_locked")
    private Integer patternRevLocked;

    /** 纸样修改退回备注 */
    @TableField("pattern_rev_return_comment")
    private String patternRevReturnComment;

    /** 纸样修改退回人 */
    @TableField("pattern_rev_return_by")
    private String patternRevReturnBy;

    /** 纸样修改退回时间 */
    @TableField("pattern_rev_return_time")
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime patternRevReturnTime;
}
