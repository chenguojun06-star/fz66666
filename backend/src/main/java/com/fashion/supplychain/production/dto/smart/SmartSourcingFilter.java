package com.fashion.supplychain.production.dto.smart;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.Arrays;
import java.util.List;

/**
 * 智能采购订单筛选条件（所有字段可选，前端可自由调整）
 *
 * <p>默认值设计：排除终态订单 + 物料到位率 < 80% + 近60天创建
 * <p>多租户隔离：tenantId 从 UserContext 取，不允许前端传入
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class SmartSourcingFilter {

    /** 物料到位率阈值（< 此值才返回），默认 80；传 100 = 全部订单 */
    @Builder.Default
    private Integer arrivalRateLessThan = 80;

    /** 要排除的订单状态（终态），默认 completed/scrapped/cancelled/closed/archived */
    @Builder.Default
    private List<String> excludeStatuses = Arrays.asList(
            "completed", "scrapped", "cancelled", "closed", "archived"
    );

    /** 创建时间范围（N天内），默认 60；传 null = 不限 */
    @Builder.Default
    private Integer createdWithinDays = 60;

    /** 订单号/款号模糊搜索 */
    private String searchKeyword;

    /** 只看某些状态（优先级高于 excludeStatuses），传 null = 用 excludeStatuses */
    private List<String> statuses;

    /** 是否只看急单（urgencyLevel = 'urgent'） */
    @Builder.Default
    private Boolean onlyUrgent = false;

    /** 分页页码（从1开始） */
    @Builder.Default
    private Integer page = 1;

    /** 每页条数，默认 20，最大 clamp 50 */
    @Builder.Default
    private Integer pageSize = 20;

    /** 排序字段：createTime / plannedEndDate / materialArrivalRate / orderQuantity */
    @Builder.Default
    private String sortBy = "createTime";

    /** 排序方向：asc / desc */
    @Builder.Default
    private String sortDir = "desc";
}
