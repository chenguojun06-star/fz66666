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

    private String nodeType;

    private String ownerType;

    private String factoryId;

    private Integer sortOrder;

    private String status;

    private String pathIds;

    private String pathNames;

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
