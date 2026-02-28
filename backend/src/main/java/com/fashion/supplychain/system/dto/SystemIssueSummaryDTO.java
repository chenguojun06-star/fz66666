package com.fashion.supplychain.system.dto;

import java.time.LocalDateTime;
import java.util.List;

/**
 * 系统问题汇总 DTO（超管看板数据）
 */
public class SystemIssueSummaryDTO {

    private int errorCount;
    private int warnCount;
    private int infoCount;
    private int totalCount;
    private LocalDateTime checkedAt;
    private List<SystemIssueItemDTO> issues;

    public SystemIssueSummaryDTO() {}

    public SystemIssueSummaryDTO(int errorCount, int warnCount, int infoCount,
                                  List<SystemIssueItemDTO> issues, LocalDateTime checkedAt) {
        this.errorCount = errorCount;
        this.warnCount = warnCount;
        this.infoCount = infoCount;
        this.totalCount = errorCount + warnCount + infoCount;
        this.issues = issues;
        this.checkedAt = checkedAt;
    }

    public int getErrorCount() { return errorCount; }
    public int getWarnCount() { return warnCount; }
    public int getInfoCount() { return infoCount; }
    public int getTotalCount() { return totalCount; }
    public LocalDateTime getCheckedAt() { return checkedAt; }
    public List<SystemIssueItemDTO> getIssues() { return issues; }
}
