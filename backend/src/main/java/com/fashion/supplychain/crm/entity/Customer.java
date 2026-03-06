package com.fashion.supplychain.crm.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * CRM 客户档案实体
 */
@Data
@TableName("t_customer")
public class Customer {

    @TableId(type = IdType.ASSIGN_UUID)
    private String id;

    /** 客户编号（CRM + 时间戳，自动生成） */
    private String customerNo;

    /** 公司/品牌名称 */
    private String companyName;

    /** 主要联系人 */
    private String contactPerson;

    /** 联系电话 */
    private String contactPhone;

    /** 邮箱 */
    private String contactEmail;

    /** 地址 */
    private String address;

    /** 客户等级：VIP / NORMAL */
    private String customerLevel;

    /** 行业/品类 */
    private String industry;

    /** 来源 */
    private String source;

    /** 状态：ACTIVE / INACTIVE */
    private String status;

    /** 备注 */
    private String remark;

    private LocalDateTime createTime;
    private LocalDateTime updateTime;

    /** 软删除：0=正常 1=已删除 */
    private Integer deleteFlag;

    private String creatorId;
    private String creatorName;

    /** 租户 ID */
    private Long tenantId;
}
