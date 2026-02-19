package com.fashion.supplychain.stock.entity;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.baomidou.mybatisplus.annotation.Version;
import com.fasterxml.jackson.annotation.JsonFormat;
import lombok.Data;

import java.io.Serializable;
import java.time.LocalDateTime;

/**
 * 样衣库存实体
 */
@Data
@TableName("t_sample_stock")
public class SampleStock implements Serializable {

    private static final long serialVersionUID = 1L;

    @TableId
    private String id;

    /**
     * 关联款式ID
     */
    private String styleId;

    /**
     * 款号
     */
    private String styleNo;

    /**
     * 款式名称
     */
    private String styleName;

    /**
     * 样衣类型: development(开发样), pre_production(产前样), shipment(大货样), sales(销售样)
     */
    private String sampleType;

    /**
     * 颜色
     */
    private String color;

    /**
     * 尺码
     */
    private String size;

    /**
     * 库存总数
     */
    private Integer quantity;

    /**
     * 借出数量
     */
    private Integer loanedQuantity;

    /**
     * 存放位置
     */
    private String location;

    /**
     * 样衣图片
     */
    private String imageUrl;

    /**
     * 备注
     */
    private String remark;

    /**
     * 创建时间
     */
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime createTime;

    /**
     * 更新时间
     */
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime updateTime;

    /**
     * 删除标记
     */
    private Integer deleteFlag;

    /**
     * 租户ID（多租户隔离）
     */
    @TableField(fill = FieldFill.INSERT)
    private Long tenantId;

    /**
     * 乐观锁版本号（并发库存操作防覆盖）
     */
    @Version
    private Integer version;
}
