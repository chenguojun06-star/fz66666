package com.fashion.supplychain.style.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.TableField;
import lombok.Data;
import java.time.LocalDateTime;

/**
 * 款号附件实体类
 */
@Data
@TableName("t_style_attachment")
public class StyleAttachment {

    @TableId(type = IdType.ASSIGN_UUID)
    private String id;

    /**
     * 关联款号ID
     */
    private String styleId;

    /**
     * 文件名
     */
    private String fileName;

    /**
     * 文件URL
     */
    private String fileUrl;

    /**
     * 文件类型 (Image, PDF, Excel...)
     */
    private String fileType;

    /**
     * 业务类型: general/pattern/pattern_grading/pattern_final/workorder
     */
    private String bizType;

    /**
     * 版本号
     */
    private Integer version;

    /**
     * 版本说明
     */
    private String versionRemark;

    /**
     * 状态: active/archived
     */
    private String status;

    /**
     * 文件大小(KB)
     */
    private Long fileSize;

    private LocalDateTime createTime;

    private String uploader;

    /**
     * 父版本ID (用于版本链追溯)
     */
    private String parentId;

    @TableField(fill = FieldFill.INSERT)
    private Long tenantId;
}
