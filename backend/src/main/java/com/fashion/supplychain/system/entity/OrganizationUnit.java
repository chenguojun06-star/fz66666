package com.fashion.supplychain.system.entity;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import java.time.LocalDateTime;
import java.util.List;
import lombok.Data;

@Data
@TableName("t_organization_unit")
public class OrganizationUnit {

    @TableId(type = IdType.ASSIGN_UUID)
    private String id;

    private String parentId;

    private String nodeName;

    /** 部门类别/分类 */
    private String category;

    private String nodeType;

    private String ownerType;

    private String factoryId;

    private Integer sortOrder;

    private String status;

    private String pathIds;

    private String pathNames;

    /** 该节点的审批负责人userId（重要操作需此人审批） */
    private String managerUserId;

    /** 审批负责人姓名（冗余，避免二次查询） */
    private String managerUserName;

    private LocalDateTime createTime;

    private LocalDateTime updateTime;

    private Integer deleteFlag;

    @TableField(fill = FieldFill.INSERT)
    private Long tenantId;

    @TableField(exist = false)
    private List<OrganizationUnit> children;

    @TableField(exist = false)
    private String operationRemark;
}
