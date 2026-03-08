package com.fashion.supplychain.intelligence.dto;

import lombok.Data;
import java.util.List;

@Data
public class AiScanTipResponse {
    private String orderNo;
    private String processName;
    private String aiTip;
    private List<String> keywords;
}
