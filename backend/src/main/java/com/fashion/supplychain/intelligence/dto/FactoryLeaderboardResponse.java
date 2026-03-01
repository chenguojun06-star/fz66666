package com.fashion.supplychain.intelligence.dto;

import java.util.List;
import lombok.Data;

/**
 * 工厂绩效排行榜响应 — 金银铜排名 + 四维评分
 */
@Data
public class FactoryLeaderboardResponse {
    private List<FactoryRank> rankings;
    private int totalFactories;

    @Data
    public static class FactoryRank {
        private String factoryId;
        private String factoryName;
        /** 综合得分 0-100 */
        private int totalScore;
        /** 排名 1,2,3... */
        private int rank;
        /** 奖牌 gold/silver/bronze/none */
        private String medal;
        /** 产能维度分（已完成件数/产能基准） */
        private int capacityScore;
        /** 交期维度分（按期率） */
        private int deliveryScore;
        /** 质量维度分（质检通过率） */
        private int qualityScore;
        /** 效率维度分（件均工时） */
        private int efficiencyScore;
        /** 进行中订单数 */
        private int activeOrders;
        /** 已完成订单数(近30天) */
        private int completedOrders;
        /** 较上月变化 up / down / same */
        private String trend;
    }
}
