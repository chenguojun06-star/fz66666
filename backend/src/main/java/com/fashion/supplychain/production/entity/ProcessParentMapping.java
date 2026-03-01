package com.fashion.supplychain.production.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 工序→父进度节点动态映射
 * <p>
 * 替代后端/前端所有硬编码的工序名关键词列表。
 * 管理员可通过接口或数据库直接新增映射，无需改代码。
 * </p>
 */
@Data
@TableName("t_process_parent_mapping")
public class ProcessParentMapping {

    @TableId(type = IdType.AUTO)
    private Long id;

    /** 子工序关键词（用于 contains 匹配） */
    private String processKeyword;

    /** 父进度节点（6个之一：采购/裁剪/二次工艺/车缝/尾部/入库） */
    private String parentNode;

    /** 租户ID，NULL 表示全局通用 */
    private Long tenantId;

    private LocalDateTime createTime;
}
