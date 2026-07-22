package com.fashion.supplychain.intelligence.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * 离线记忆巩固结果 DTO（P1-5 Cognee 离线巩固方向）。
 *
 * <p>封装 {@code MemoryConsolidationService.consolidateForTenant} 的执行结果，
 * 供 {@code MemoryConsolidationJob} 汇总日志使用。</p>
 *
 * @author xiaoyun
 * @since 2026-07-22
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ConsolidationResult {

    /** 租户 ID */
    private Long tenantId;

    /** 本次扫描的记忆总数 */
    private int totalScanned;

    /** 处理的相似分组数 */
    private int groupsProcessed;

    /** 实际合并（被标记失效）的记忆条数 */
    private int memoriesMerged;
}
