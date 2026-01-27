package com.fashion.supplychain.dashboard.dto;

/**
 * 顶部4个核心统计看板的响应数据
 */
public class TopStatsResponse {
    private int sampleDevelopmentCount;  // 样衣开发数量
    private int bulkOrderCount;          // 大货下单数量
    private int cuttingCount;            // 裁剪数量
    private int warehousingCount;        // 出入库数量

    public int getSampleDevelopmentCount() {
        return sampleDevelopmentCount;
    }

    public void setSampleDevelopmentCount(int sampleDevelopmentCount) {
        this.sampleDevelopmentCount = sampleDevelopmentCount;
    }

    public int getBulkOrderCount() {
        return bulkOrderCount;
    }

    public void setBulkOrderCount(int bulkOrderCount) {
        this.bulkOrderCount = bulkOrderCount;
    }

    public int getCuttingCount() {
        return cuttingCount;
    }

    public void setCuttingCount(int cuttingCount) {
        this.cuttingCount = cuttingCount;
    }

    public int getWarehousingCount() {
        return warehousingCount;
    }

    public void setWarehousingCount(int warehousingCount) {
        this.warehousingCount = warehousingCount;
    }
}
