package com.fashion.supplychain.intelligence.dto;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import lombok.Data;

/**
 * 学习循环执行响应 DTO
 *
 * <p>由 {@code LearningLoopOrchestrator.runLoop()} 返回。
 */
@Data
public class LearningLoopResponse {

    private LocalDateTime runAt = LocalDateTime.now();

    /** 分析的反馈记录数 */
    private int analyzedFeedbacks;

    /** AI 生成反馈分析条数 */
    private int aiAnalyzedCount;

    /** 写入记忆库条数 */
    private int learnedToMemory;

    /** 此次学习循环是否有有效学习 */
    private boolean hasNewLearning;

    /** 摘要说明 */
    private String summary;

    /** 本轮分析的模式列表（摘要） */
    private List<String> discoveredPatterns = new ArrayList<>();
}
