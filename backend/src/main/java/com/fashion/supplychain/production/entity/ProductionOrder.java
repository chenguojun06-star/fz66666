package com.fashion.supplychain.production.entity;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.baomidou.mybatisplus.annotation.Version;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import lombok.Data;

/**
 * 生产订单实体类
 */
@Data
@TableName("t_production_order")
public class ProductionOrder {

    /**
     * 主键ID
     */
    @TableId(type = IdType.ASSIGN_UUID)
    private String id;

    /**
     * 订单号
     */
    private String orderNo;

    private String qrCode;

    private String color;

    private String size;

    @TableField("order_details")
    private String orderDetails;

    @TableField(exist = false)
    private String operationRemark;

    @TableField("progress_workflow_json")
    private String progressWorkflowJson;

    @TableField("progress_workflow_locked")
    private Integer progressWorkflowLocked;

    @TableField("progress_workflow_locked_at")
    private LocalDateTime progressWorkflowLockedAt;

    @TableField("progress_workflow_locked_by")
    private String progressWorkflowLockedBy;

    @TableField("progress_workflow_locked_by_name")
    private String progressWorkflowLockedByName;

    /**
     * 款号ID
     */
    private String styleId;

    /**
     * 款号
     */
    private String styleNo;

    /**
     * 款名
     */
    private String styleName;

    /**
     * 加工厂ID
     */
    private String factoryId;

    /**
     * 加工厂名称
     */
    private String factoryName;

    /**
     * 加工厂联系人
     */
    private String factoryContactPerson;

    /**
     * 加工厂联系电话
     */
    private String factoryContactPhone;

    /**
     * 跟单员（从样衣开发带入，可修改）
     */
    @TableField("merchandiser")
    private String merchandiser;

    /**
     * 公司/客户（从样衣开发带入，可修改）
     */
    @TableField("company")
    private String company;

    /**
     * 品类（从样衣开发带入，可修改）
     */
    @TableField("product_category")
    private String productCategory;

    /**
     * 纸样师（从样衣开发带入，可修改）
     */
    @TableField("pattern_maker")
    private String patternMaker;

    /**
     * 订单数量
     */
    private Integer orderQuantity;

    /**
     * 完成数量
     */
    private Integer completedQuantity;

    /**
     * 物料到位率(%)
     */
    @TableField("material_arrival_rate")
    private Integer materialArrivalRate;

    /**
     * 采购人工确认完成(0=未确认, 1=已确认)
     * 用于物料到货率≥50%但<100%时，人为确认采购完成
     */
    @TableField("procurement_manually_completed")
    private Integer procurementManuallyCompleted;

    /**
     * 采购确认人ID
     */
    @TableField("procurement_confirmed_by")
    private String procurementConfirmedBy;

    /**
     * 采购确认人姓名
     */
    @TableField("procurement_confirmed_by_name")
    private String procurementConfirmedByName;

    /**
     * 采购确认时间
     */
    @TableField("procurement_confirmed_at")
    private LocalDateTime procurementConfirmedAt;

    /**
     * 采购确认备注（说明为什么物料未到齐就确认）
     */
    @TableField("procurement_confirm_remark")
    private String procurementConfirmRemark;

    /**
     * 生产进度(%)
     */
    @TableField("production_progress")
    private Integer productionProgress;

    /**
     * 状态(pending:待生产, production:生产中, completed:已完成, delayed:已逾期)
     */
    private String status;

    /**
     * 计划开始日期
     */
    private LocalDateTime plannedStartDate;

    /**
     * 计划完成日期
     */
    private LocalDateTime plannedEndDate;

    /**
     * 实际开始日期
     */
    private LocalDateTime actualStartDate;

    /**
     * 实际完成日期
     */
    private LocalDateTime actualEndDate;

    /**
     * 创建时间
     */
    private LocalDateTime createTime;

    /**
     * 更新时间
     */
    private LocalDateTime updateTime;

    /**
     * 删除标志(0:正常,1:删除)
     */
    private Integer deleteFlag;

    @TableField(exist = false)
    private String styleCover;

    @TableField(exist = false)
    private Integer cuttingQuantity;

    @TableField(exist = false)
    private Integer cuttingBundleCount;

    /**
     * 裁剪任务详情（用于判断裁剪是否真正完成）
     * 包含 receivedTime, bundledTime, status 等字段
     */
    @TableField(exist = false)
    private CuttingTask cuttingTask;

    @TableField(exist = false)
    private String currentProcessName;

    @TableField(exist = false)
    private Integer warehousingQualifiedQuantity;

    @TableField(exist = false)
    private Integer outstockQuantity;

    @TableField(exist = false)
    private Integer inStockQuantity;

    @TableField(exist = false)
    private BigDecimal factoryUnitPrice;

    @TableField(exist = false)
    private BigDecimal quotationUnitPrice;

    @TableField(exist = false)
    private LocalDateTime orderStartTime;

    @TableField(exist = false)
    private LocalDateTime orderEndTime;

    /**
     * 创建人ID（数据库字段）
     */
    private String createdById;

    /**
     * 创建人姓名（数据库字段）
     */
    private String createdByName;

    @TableField(exist = false)
    private String orderOperatorName;

    @TableField(exist = false)
    private Integer orderCompletionRate;

    @TableField(exist = false)
    private LocalDateTime procurementStartTime;

    @TableField(exist = false)
    private LocalDateTime procurementEndTime;

    @TableField(exist = false)
    private String procurementOperatorName;

    @TableField(exist = false)
    private Integer procurementCompletionRate;

    @TableField(exist = false)
    private LocalDateTime cuttingStartTime;

    @TableField(exist = false)
    private LocalDateTime cuttingEndTime;

    @TableField(exist = false)
    private String cuttingOperatorName;

    @TableField(exist = false)
    private Integer cuttingCompletionRate;

    @TableField(exist = false)
    private LocalDateTime sewingStartTime;

    @TableField(exist = false)
    private LocalDateTime sewingEndTime;

    @TableField(exist = false)
    private String sewingOperatorName;

    @TableField(exist = false)
    private Integer sewingCompletionRate;

    @TableField(exist = false)
    private LocalDateTime qualityStartTime;

    @TableField(exist = false)
    private LocalDateTime qualityEndTime;

    @TableField(exist = false)
    private String qualityOperatorName;

    @TableField(exist = false)
    private Integer qualityCompletionRate;

    @TableField(exist = false)
    private LocalDateTime warehousingStartTime;

    @TableField(exist = false)
    private LocalDateTime warehousingEndTime;

    @TableField(exist = false)
    private String warehousingOperatorName;

    @TableField(exist = false)
    private Integer warehousingCompletionRate;

    // ==================== 车缝环节字段（新增）====================

    /**
     * 车缝开始时间
     */
    @TableField(exist = false)
    private LocalDateTime carSewingStartTime;

    /**
     * 车缝完成时间
     */
    @TableField(exist = false)
    private LocalDateTime carSewingEndTime;

    /**
     * 车缝员姓名
     */
    @TableField(exist = false)
    private String carSewingOperatorName;

    /**
     * 车缝完成率(%)
     */
    @TableField(exist = false)
    private Integer carSewingCompletionRate;

    // ==================== 大烫环节字段（新增）====================

    /**
     * 大烫开始时间
     */
    @TableField(exist = false)
    private LocalDateTime ironingStartTime;

    /**
     * 大烫完成时间
     */
    @TableField(exist = false)
    private LocalDateTime ironingEndTime;

    /**
     * 大烫员姓名
     */
    @TableField(exist = false)
    private String ironingOperatorName;

    /**
     * 大烫完成率(%)
     */
    @TableField(exist = false)
    private Integer ironingCompletionRate;

    // ==================== 二次工艺环节字段（新增）====================

    /**
     * 二次工艺开始时间
     */
    @TableField(exist = false)
    private LocalDateTime secondaryProcessStartTime;

    /**
     * 二次工艺完成时间
     */
    @TableField(exist = false)
    private LocalDateTime secondaryProcessEndTime;

    /**
     * 二次工艺操作员姓名
     */
    @TableField(exist = false)
    private String secondaryProcessOperatorName;

    /**
     * 二次工艺完成率(%)
     */
    @TableField(exist = false)
    private Integer secondaryProcessCompletionRate;

    /**
     * 二次工艺完成率别名（前端列表页使用 secondaryProcessRate）
     */
    @TableField(exist = false)
    private Integer secondaryProcessRate;

    /**
     * 尾部工序完成率(%，如剪线，前端列表页使用 tailProcessRate）
     */
    @TableField(exist = false)
    private Integer tailProcessRate;

    /**
     * 款式是否配置了二次工艺（用于前端判断是否显示二次工艺进度列）
     */
    @TableField(exist = false)
    private Boolean hasSecondaryProcess;

    // ==================== 包装环节字段（新增）====================

    /**
     * 包装开始时间
     */
    @TableField(exist = false)
    private LocalDateTime packagingStartTime;

    /**
     * 包装完成时间
     */
    @TableField(exist = false)
    private LocalDateTime packagingEndTime;

    /**
     * 包装员姓名
     */
    @TableField(exist = false)
    private String packagingOperatorName;

    /**
     * 包装完成率(%)
     */
    @TableField(exist = false)
    private Integer packagingCompletionRate;

    // ==================== 质量统计字段（新增）====================

    /**
     * 次品数量
     */
    @TableField(exist = false)
    private Integer unqualifiedQuantity;

    /**
     * 返修数量
     */
    @TableField(exist = false)
    private Integer repairQuantity;

    /**
     * 备注
     */
    private String remarks;

    /**
     * 节点操作记录(委派工厂/指定负责人/备注等)
     * JSON格式存储各节点的操作信息
     */
    @TableField("node_operations")
    private String nodeOperations;

    /**
     * 预计出货日期
     */
    private java.time.LocalDate expectedShipDate;

    /**
     * SKU 明细列表（用于扫码场景）
     * 从 orderDetails JSON 字段解析而来
     */
    @TableField(exist = false)
    private List<Map<String, Object>> items;

    /**
     * 工序节点单价列表（虚拟字段，从 progressWorkflowJson.nodes 解析而来）
     * 格式：[{"id":"07","name":"裁剪","unitPrice":0.5,...}, ...]
     */
    @TableField(exist = false)
    private List<Object> progressNodeUnitPrices;

    /**
     * 乐观锁版本号（并发状态更新防覆盖）
     */
    @Version
    private Integer version;

    @TableField(fill = FieldFill.INSERT)
    private Long tenantId;
}
