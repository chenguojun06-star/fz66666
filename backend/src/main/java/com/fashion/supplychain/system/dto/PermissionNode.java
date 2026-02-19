package com.fashion.supplychain.system.dto;

import lombok.Data;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

@Data
public class PermissionNode {
    private Long id;
    private String permissionName;
    private String permissionCode;
    private Long parentId;
    private String parentName;
    private String permissionType;
    private String path;
    private String component;
    private String icon;
    private Integer sort;
    private String status;
    private LocalDateTime createTime;
    private LocalDateTime updateTime;
    private List<PermissionNode> children = new ArrayList<>();
}
