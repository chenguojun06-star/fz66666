package com.fashion.supplychain.system.entity;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableName;
import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import java.time.LocalDateTime;
import lombok.Data;

/**
 * 供应商实体类（包括加工厂和面辅料供应商）
 */
@Data
@TableName("t_factory")
public class Factory {

    @TableId(type = IdType.ASSIGN_UUID)
    private String id;

    /** 供应商编码 */
    private String factoryCode;

    /** 供应商名称 */
    private String factoryName;

    /** 联系人 */
    private String contactPerson;

    /** 联系电话 */
    private String contactPhone;

    /** 地址 */
    private String address;

    /** 状态：active-启用，inactive-停用 */
    private String status;

    /** 营业执照图片URL */
    private String businessLicense;

    @TableField(exist = false)
    private String operationRemark;

    private LocalDateTime createTime;

    private LocalDateTime updateTime;

    private Integer deleteFlag;

    @TableField(fill = FieldFill.INSERT)
    private Long tenantId;
}
