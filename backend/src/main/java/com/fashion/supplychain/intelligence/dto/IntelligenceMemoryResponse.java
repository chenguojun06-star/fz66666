package com.fashion.supplychain.intelligence.dto;

import java.util.ArrayList;
import java.util.List;
import lombok.Data;

/**
 * 向量记忆操作响应 DTO
 *
 * <p>用于 {@code IntelligenceMemoryOrchestrator} 的记忆保存与召回接口。
 */
@Data
public class IntelligenceMemoryResponse {

    /** 操作是否成功 */
    private boolean success;

    /** 保存时返回的记忆 ID */
    private Long savedMemoryId;

    /** Qdrant 向量是否已同步 */
    private boolean vectorSynced;

    /** 召回的记忆列表 */
    private List<MemoryItem> recalled = new ArrayList<>();

    /** 召回总数 */
    private int recalledTotal;

    @Data
    public static class MemoryItem {
        private Long memoryId;
        private String memoryType;          // case / knowledge / preference
        private String businessDomain;
        private String title;
        private String content;
        private float similarityScore;      // Qdrant 相似度分数 0-1
        private int recallCount;
        private int adoptedCount;
    }
}
