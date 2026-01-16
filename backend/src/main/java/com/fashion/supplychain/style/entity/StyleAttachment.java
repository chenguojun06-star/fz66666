package com.fashion.supplychain.style.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
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

    private String bizType;

    /**
     * 文件大小(KB)
     */
    private Long fileSize;

    private LocalDateTime createTime;
    
    private String uploader;
}
