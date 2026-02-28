package com.fashion.supplychain.intelligence.dto;

/**
 * 工人效率画像请求 DTO
 */
public class WorkerProfileRequest {

    /** 工人姓名（必填） */
    private String operatorName;

    /** 统计起始日期（可选，默认近30天），格式 yyyy-MM-dd */
    private String dateFrom;

    /** 统计结束日期（可选），格式 yyyy-MM-dd */
    private String dateTo;

    public String getOperatorName() { return operatorName; }
    public void setOperatorName(String operatorName) { this.operatorName = operatorName; }

    public String getDateFrom() { return dateFrom; }
    public void setDateFrom(String dateFrom) { this.dateFrom = dateFrom; }

    public String getDateTo() { return dateTo; }
    public void setDateTo(String dateTo) { this.dateTo = dateTo; }
}
