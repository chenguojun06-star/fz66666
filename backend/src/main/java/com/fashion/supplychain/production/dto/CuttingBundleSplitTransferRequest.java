package com.fashion.supplychain.production.dto;

import lombok.Data;

@Data
public class CuttingBundleSplitTransferRequest {
    private String bundleId;
    private String qrCode;
    private String orderNo;
    private Integer bundleNo;
    private String currentProcessName;
    private Integer completedQuantity;
    private Integer transferQuantity;
    private String toWorkerId;
    private String toWorkerName;
    private String reason;
}
