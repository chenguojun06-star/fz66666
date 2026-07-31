package com.fashion.supplychain.intelligence.dto;

import lombok.Data;
import java.util.List;

/**
 * APS 高级排产请求 DTO
 *
 * <p>请求参数：待排产订单列表 + 优先级策略 + 约束条件</p>
 *
 * @author xiaoyun
 * @since 2026-08-01
 */
@Data
public class ApsSchedulingRequest {

    /** 待排产订单ID列表（为空时自动查询 PENDING/DELAYED 订单） */
    private List<String> orderIds;

    /** 优先级策略：URGENT_FIRST（默认，按交期紧急度）/ FIFO（先入先出）/ QUANTITY_DESC（大批量优先） */
    private String priorityStrategy;

    /** 工厂ID白名单（为空时使用所有活跃工厂，UUID 字符串） */
    private List<String> factoryIds;

    /** 排产起始日期 yyyy-MM-dd（默认今天） */
    private String startDate;

    /** 是否跳过非工作日（默认 true） */
    private Boolean skipHolidays;

    /** 单工厂最大并发订单数（默认 30，对应 dailyCapacity×30 的负载上限） */
    private Integer maxConcurrentOrders;

    /** 是否允许部分分配（true=无法满足全部工序时仍返回部分方案） */
    private Boolean allowPartial;
}
