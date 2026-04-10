package com.fashion.supplychain.intelligence.dto;

import lombok.Data;
import java.util.List;

@Data
public class AiScanTipResponse {
    private String orderNo;
    private String processName;
    /** 当前阶段：采购/裁剪/车缝/尾部/质检/入库 */
    private String stage;
    /** 精简提示（≤2句话） */
    private String aiTip;
    /** 优先级：high/medium/low */
    private String priority;
    /** 关键词标签 */
    private List<String> keywords;
    /** 是否可关闭气泡 */
    private boolean dismissible = true;
}
