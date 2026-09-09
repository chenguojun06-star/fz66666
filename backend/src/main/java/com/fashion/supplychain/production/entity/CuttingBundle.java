package com.fashion.supplychain.production.entity;

import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableName;
import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.TableField;
import java.time.LocalDateTime;
import lombok.Data;

@Data
@TableName("t_cutting_bundle")
public class CuttingBundle {

    @TableId(type = IdType.ASSIGN_UUID)
    private String id;

    private String rootBundleId;

    private String parentBundleId;

    private String sourceBundleId;

    private String productionOrderId;

    private String productionOrderNo;

    private String styleId;

    private String styleNo;

    /**
     * 款式名称（P1-6 数据链路：临时字段，查询时从 ProductionOrder.styleName 补齐）
     */
    @TableField(exist = false)
    private String styleName;

    /**
     * 款式封面图（P1-6 数据链路：临时字段，查询时从 ProductionOrder.styleCover 补齐）
     */
    @TableField(exist = false)
    private String styleCover;

    /**
     * 裁剪领取人（临时字段：查询时从 CuttingTask.receiverName 回填）。
     * 注意：operatorName 是自动填充的"最后操作人"（管理员编辑分扎会被覆盖），
     * 不是裁剪领取人，前端禁止把它当领取人展示。
     */
    @TableField(exist = false)
    private String receiverName;

    private String color;

    private String size;

    /**
     * 面料层数（手工编菲/一键生成时按下单颜色与尺码录入）
     */
    @TableField("layer_count")
    private Integer layerCount;

    private Integer bundleNo;

    private String bundleLabel;

    private Integer quantity;

    /**
     * 床号（裁剪批次编号，按租户递增，用于打印裁剪单）
     */
    private Integer bedNo;

    /**
     * 子床次编号（同一订单追加裁剪时递增：首次为 null，追加为 1、2…）
     * 显示格式：bedNo=16,bedSubNo=null → "16"；bedSubNo=1 → "16-1"
     */
    @TableField("bed_sub_no")
    private Integer bedSubNo;

    private String qrCode;

    private String status;

    private String splitStatus;

    private Integer splitSeq;

    private String splitProcessName;

    private Integer splitProcessOrder;

    private LocalDateTime createTime;

    private LocalDateTime updateTime;

    /**
     * 工厂ID（支持菲号级工厂隔离，转单时更新）
     */
    private String factoryId;

    /**
     * 委派工厂名称（工序委派冗余展示，委派时写入）
     */
    @TableField("factory_name")
    private String factoryName;

    /**
     * 委派人员ID（工序委派-人员）
     */
    @TableField("assignee_id")
    private String assigneeId;

    /**
     * 委派人员姓名（工序委派-人员）
     */
    @TableField("assignee_name")
    private String assigneeName;

    /**
     * 外发工序名（逗号分隔，如 "剪线,整烫"）；为空 = 整扎外发（兼容历史数据）
     * 按工序精细隔离：仅勾选的工序允许外发工厂扫码，未勾选工序仍由内部扫
     */
    @TableField("delegate_processes")
    private String delegateProcesses;

    private Boolean scanBlocked;

    // ==================== 操作人字段（自动填充）====================

    @TableField(fill = FieldFill.INSERT)
    private String creatorId;

    @TableField(fill = FieldFill.INSERT)
    private String creatorName;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private String operatorId;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private String operatorName;

    @TableField(fill = FieldFill.INSERT)
    private Long tenantId;
}
