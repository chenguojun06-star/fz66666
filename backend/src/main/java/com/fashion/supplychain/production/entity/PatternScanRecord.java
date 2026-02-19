package com.fashion.supplychain.production.entity;

import com.baomidou.mybatisplus.annotation.TableName;
import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.TableField;
import java.time.LocalDateTime;
import lombok.Data;

/**
 * 样板生产扫码记录实体类
 * 用于记录车板师、跟单员等对样板生产的扫码操作
 */
@Data
@TableName("t_pattern_scan_record")
public class PatternScanRecord {

    /**
     * 主键ID
     */
    @TableId(type = IdType.ASSIGN_UUID)
    private String id;

    /**
     * 样板生产ID
     */
    private String patternProductionId;

    /**
     * 款号ID
     */
    private String styleId;

    /**
     * 款号
     */
    private String styleNo;

    /**
     * 颜色
     */
    private String color;

    /**
     * 操作类型：RECEIVE(领取), PLATE(车板), FOLLOW_UP(跟单), COMPLETE(完成),
     * WAREHOUSE_IN(入库), WAREHOUSE_OUT(出库), WAREHOUSE_RETURN(归还)
     */
    private String operationType;

    /**
     * 操作员ID
     */
    private String operatorId;

    /**
     * 操作员名称
     */
    private String operatorName;

    /**
     * 操作员角色：PLATE_WORKER(车板师), MERCHANDISER(跟单员), WAREHOUSE(仓管)
     */
    private String operatorRole;

    /**
     * 扫码时间
     */
    private LocalDateTime scanTime;

    /**
     * 仓位编码（样衣入库/出库）
     */
    private String warehouseCode;

    /**
     * 备注
     */
    private String remark;

    /**
     * 创建时间
     */
    private LocalDateTime createTime;

    /**
     * 删除标记（0=未删除，1=已删除）
     */
    private Integer deleteFlag;

    @TableField(fill = FieldFill.INSERT)
    private Long tenantId;
}
