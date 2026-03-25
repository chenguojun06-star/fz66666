package com.fashion.supplychain.production.dto;

import lombok.Data;

@Data
public class CuttingBundleSplitRollbackRequest {
    private String bundleId;
    private String qrCode;
    private String orderNo;
    private Integer bundleNo;
    private String reason;
}
