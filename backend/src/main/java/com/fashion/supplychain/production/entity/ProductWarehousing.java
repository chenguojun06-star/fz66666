package com.fashion.supplychain.production.entity;

import com.baomidou.mybatisplus.annotation.TableName;
import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import java.time.LocalDateTime;
import lombok.Data;

/**
 * 质检入库实体类（表：t_product_warehousing）
 */
@Data
@TableName("t_product_warehousing")
public class ProductWarehousing {

    @TableId(type = IdType.ASSIGN_UUID)
    private String id;

    private String warehousingNo;

    private String orderId;

    private String orderNo;

    private String styleId;

    private String styleNo;

    private String styleName;

    private Integer warehousingQuantity;

    private Integer qualifiedQuantity;

    private Integer unqualifiedQuantity;

    private String warehousingType;

    private String warehouse;

    private String qualityStatus;

    private String cuttingBundleId;

    private Integer cuttingBundleNo;

    private String cuttingBundleQrCode;

    private String unqualifiedImageUrls;

    private String repairRemark;

    private LocalDateTime createTime;

    private LocalDateTime updateTime;

    private Integer deleteFlag;
}
