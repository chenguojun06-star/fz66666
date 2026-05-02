package com.fashion.supplychain.production.dto;

import java.util.ArrayList;
import java.util.List;
import lombok.Data;

@Data
public class CuttingBundleSplitTransferResponse {
    private boolean success;
    private String action;
    private String message;
    private String rootBundleId;
    private String rootBundleLabel;
    private String orderNo;
    private String sourceBundleId;
    private String sourceBundleLabel;
    private String currentProcessName;
    private String reason;
    private String splitLogId;
    private List<BundleNode> bundles = new ArrayList<>();

    @Data
    public static class BundleNode {
        private String bundleId;
        private String bundleLabel;
        private Integer bundleNo;
        private Integer quantity;
        private String qrCode;
        private String splitStatus;
        private String operatorId;
        private String operatorName;
    }
}
