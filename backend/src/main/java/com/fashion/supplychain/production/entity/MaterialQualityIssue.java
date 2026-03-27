package com.fashion.supplychain.production.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableLogic;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;

@Data
@TableName("t_material_quality_issue")
public class MaterialQualityIssue {

    @TableId(type = IdType.ASSIGN_UUID)
    private String id;

    private String issueNo;

    private String purchaseId;

    private String purchaseNo;

    private String orderId;

    private String orderNo;

    private String styleId;

    private String styleNo;

    private String supplierId;

    private String supplierName;

    private String materialId;

    private String materialCode;

    private String materialName;

    private String materialType;

    private Integer issueQuantity;

    private String issueType;

    private String severity;

    private String disposition;

    private String status;

    private String evidenceImageUrls;

    private String remark;

    private String resolutionRemark;

    private String relatedPurchaseId;

    private String relatedPurchaseNo;

    private BigDecimal deductionAmount;

    private String reporterId;

    private String reporterName;

    private String resolverId;

    private String resolverName;

    private LocalDateTime resolvedTime;

    private Long tenantId;

    private LocalDateTime createTime;

    private LocalDateTime updateTime;

    @TableLogic
    private Integer deleteFlag;
}
