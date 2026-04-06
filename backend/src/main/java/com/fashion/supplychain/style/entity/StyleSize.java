package com.fashion.supplychain.style.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.TableField;
import lombok.Data;
import java.math.BigDecimal;
import java.time.LocalDateTime;


/**
 * 款号尺寸表实体类
 */
@Data
@TableName("t_style_size")
public class StyleSize {

    @TableId(type = IdType.ASSIGN_UUID)
    private String id;

    /**
     * 关联款号ID
     */
    private Long styleId;

    /**
     * 尺码名称 (S, M, L, XL...)
     */
    private String sizeName;

    /**
     * 部位名称 (胸围, 衣长, 肩宽...)
     */
    private String partName;

    /**
     * 尺寸分组名（如：上装区 / 下装区 / 马甲区）
     */
    private String groupName;

    private String measureMethod;

    /**
     * 基准码/样衣码
     */
    private String baseSize;

    /**
     * 标准数值
     */
    private BigDecimal standardValue;

    /**
     * 公差 (+/-) 支持任意文字如"正负5"或数值如"0.5"
     */
    private String tolerance;

    /**
     * 排序
     */
    private Integer sort;

    /**
     * 领取人
     */
    private String assignee;

    /**
     * 开始时间
     */
    private LocalDateTime startTime;

    /**
     * 完成时间
     */
    private LocalDateTime completedTime;

    private LocalDateTime createTime;
    private LocalDateTime updateTime;

    /**
     * 部位参考图片URLs（JSON数组字符串，每个部位行可上传多张图）
     */
    private String imageUrls;

    /**
     * 跳码规则JSON
     */
    private String gradingRule;

    @TableField(fill = FieldFill.INSERT)
    private Long tenantId;
}
