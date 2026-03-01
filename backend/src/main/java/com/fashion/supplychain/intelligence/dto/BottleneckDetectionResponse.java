package com.fashion.supplychain.intelligence.dto;

import java.util.ArrayList;
import java.util.List;
import lombok.Data;

/**
 * 瓶颈检测响应 DTO
 */
@Data
public class BottleneckDetectionResponse {
    /** 瓶颈工序列表（按严重程度降序） */
    private List<BottleneckItem> bottlenecks = new ArrayList<>();
    /** 是否存在瓶颈 */
    private boolean hasBottleneck;
    /** 一句话摘要 */
    private String summary;

    @Data
    public static class BottleneckItem {
        /** 瓶颈工序名称 */
        private String stageName;
        /** 前道已完成件数 */
        private int upstreamDone;
        /** 本道已完成件数 */
        private int currentDone;
        /** 积压件数（前道-本道） */
        private int backlog;
        /** 严重等级：critical / warning / normal */
        private String severity;
        /** 建议 */
        private String suggestion;
    }
}
