package com.fashion.supplychain.search.dto;

import lombok.Data;
import lombok.Builder;
import lombok.AllArgsConstructor;
import lombok.NoArgsConstructor;

import java.util.List;

/**
 * ⌘K 全局搜索结果
 * 按业务领域分组返回，前端按类型渲染分组标题
 */
@Data
@Builder
@AllArgsConstructor
@NoArgsConstructor
public class GlobalSearchResult {

    /** 搜索关键词（回显用） */
    private String query;

    /** 生产订单结果（最多10条） */
    private List<OrderItem> orders;

    /** 款式结果（最多8条） */
    private List<StyleItem> styles;

    /** 工人/员工结果（最多6条） */
    private List<WorkerItem> workers;

    // ─── 内部类 ──────────────────────────────────────────

    @Data
    @Builder
    @AllArgsConstructor
    @NoArgsConstructor
    public static class OrderItem {
        private String id;
        private String orderNo;
        private String styleName;
        private String styleNo;
        private String factoryName;
        private String status;
        /** 状态中文描述 */
        private String statusLabel;
        /** 进度 0-100 */
        private Integer progress;
    }

    @Data
    @Builder
    @AllArgsConstructor
    @NoArgsConstructor
    public static class StyleItem {
        private Long id;
        private String styleNo;
        private String styleName;
        private String category;
        private String coverUrl;
    }

    @Data
    @Builder
    @AllArgsConstructor
    @NoArgsConstructor
    public static class WorkerItem {
        private String id;
        private String name;
        private String phone;
        private String role;
        private String factoryName;
    }
}
