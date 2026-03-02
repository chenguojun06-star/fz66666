package com.fashion.supplychain.production.entity;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableLogic;
import com.baomidou.mybatisplus.annotation.TableName;
import com.fasterxml.jackson.annotation.JsonFormat;
import java.time.LocalDateTime;
import lombok.Data;

/**
 * 面辅料出库日志实体
 * 每次手动出库/领料操作写一条记录，用于出入库历史查询
 */
@Data
@TableName("t_material_outbound_log")
public class MaterialOutboundLog {

    @TableId(value = "id", type = IdType.ASSIGN_UUID)
    private String id;

    /** 关联库存记录ID */
    private String stockId;

    /** 物料编码 */
    private String materialCode;

    /** 物料名称 */
    private String materialName;

    /** 出库数量 */
    private Integer quantity;

    /** 操作人ID */
    private String operatorId;

    /** 操作人姓名 */
    private String operatorName;

    /** 仓位 */
    private String warehouseLocation;

    /** 备注/出库原因 */
    private String remark;

    /** 出库时间 */
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss", timezone = "GMT+8")
    private LocalDateTime outboundTime;

    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss", timezone = "GMT+8")
    private LocalDateTime createTime;

    @TableLogic
    private Integer deleteFlag;

    @TableField(fill = FieldFill.INSERT)
    private Long tenantId;
}
