package com.fashion.supplychain.production.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 采购单据上传记录实体
 * 对应表 t_purchase_order_doc
 * 记录每次上传的供应商发货单图片 + AI识别摘要，永久展示在采购单详情页
 */
@Data
@TableName("t_purchase_order_doc")
public class PurchaseOrderDoc {

    @TableId(type = IdType.ASSIGN_UUID)
    private String id;

    private Long tenantId;

    private String orderNo;

    private String imageUrl;

    private String rawText;

    private Integer matchCount;

    private Integer totalRecognized;

    private String uploaderId;

    private String uploaderName;

    private LocalDateTime createTime;

    private Integer deleteFlag;
}
