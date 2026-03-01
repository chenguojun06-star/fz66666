package com.fashion.supplychain.intelligence.dto;

import java.util.List;
import lombok.Data;

/**
 * 实时生产脉搏 — 全工厂心跳数据
 */
@Data
public class LivePulseResponse {
    /** 当前正在扫码的工厂数 */
    private int activeFactories;
    /** 当前活跃操作员数（最近30分钟有扫码） */
    private int activeWorkers;
    /** 今日扫码总件数 */
    private long todayScanQty;
    /** 实时扫码速率（件/小时） */
    private double scanRatePerHour;
    /** 过去2小时扫码密度时序（每10分钟一个点，共12个点） */
    private List<PulsePoint> timeline;
    /** 停滞工厂（>30分钟无扫码） */
    private List<StagnantFactory> stagnantFactories;

    @Data
    public static class PulsePoint {
        private String time;    // HH:mm
        private long quantity;  // 该时段扫码件数
        private int workers;    // 该时段活跃人数
    }

    @Data
    public static class StagnantFactory {
        private String factoryName;
        private long minutesSilent;
        private long lastScanQty;
        private String lastScanTime;
    }
}
