package com.fashion.supplychain.search.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.service.ProductionOrderService;
import com.fashion.supplychain.search.dto.GlobalSearchResult;
import com.fashion.supplychain.style.entity.StyleInfo;
import com.fashion.supplychain.style.service.StyleInfoService;
import com.fashion.supplychain.system.entity.User;
import com.fashion.supplychain.system.service.UserService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.util.List;
import java.util.Map;
import java.util.concurrent.CompletableFuture;
import java.util.stream.Collectors;

/**
 * ⌘K 全局搜索编排器（#58）
 * 并行搜索生产订单、款式、工人三张表，毫秒级响应
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class GlobalSearchOrchestrator {

    private final ProductionOrderService productionOrderService;
    private final StyleInfoService styleInfoService;
    private final UserService userService;

    /** 订单状态中文映射 */
    private static final Map<String, String> STATUS_LABELS = Map.of(
        "CREATED",    "待处理",
        "IN_PROGRESS","生产中",
        "COMPLETED",  "已完成",
        "CANCELLED",  "已取消",
        "PAUSED",     "已暂停"
    );

    /**
     * 全局搜索主入口
     * @param query     搜索词（最少2个字符）
     * @param tenantId  租户隔离
     */
    public GlobalSearchResult search(String query, Long tenantId) {
        if (!StringUtils.hasText(query) || query.trim().length() < 1) {
            return GlobalSearchResult.builder()
                    .query(query)
                    .orders(List.of())
                    .styles(List.of())
                    .workers(List.of())
                    .build();
        }

        String q = query.trim();
        log.debug("[GlobalSearch] query='{}' tenantId={}", q, tenantId);

        // 三路并行搜索，互不阻塞
        CompletableFuture<List<GlobalSearchResult.OrderItem>> orderFuture =
            CompletableFuture.supplyAsync(() -> searchOrders(q, tenantId));
        CompletableFuture<List<GlobalSearchResult.StyleItem>> styleFuture =
            CompletableFuture.supplyAsync(() -> searchStyles(q, tenantId));
        CompletableFuture<List<GlobalSearchResult.WorkerItem>> workerFuture =
            CompletableFuture.supplyAsync(() -> searchWorkers(q, tenantId));

        try {
            CompletableFuture.allOf(orderFuture, styleFuture, workerFuture).join();
            return GlobalSearchResult.builder()
                    .query(q)
                    .orders(orderFuture.get())
                    .styles(styleFuture.get())
                    .workers(workerFuture.get())
                    .build();
        } catch (Exception e) {
            log.error("[GlobalSearch] 搜索失败: query={}", q, e);
            return GlobalSearchResult.builder().query(q)
                    .orders(List.of()).styles(List.of()).workers(List.of()).build();
        }
    }

    // ─── 私有：搜索生产订单 ──────────────────────────────────

    private List<GlobalSearchResult.OrderItem> searchOrders(String q, Long tenantId) {
        try {
            LambdaQueryWrapper<ProductionOrder> wrapper = new LambdaQueryWrapper<ProductionOrder>()
                .eq(ProductionOrder::getDeleteFlag, 0)
                .eq(tenantId != null, ProductionOrder::getTenantId, tenantId)
                .and(w -> w
                    .like(ProductionOrder::getOrderNo, q)
                    .or().like(ProductionOrder::getStyleNo, q)
                    .or().like(ProductionOrder::getStyleName, q)
                    .or().like(ProductionOrder::getFactoryName, q)
                )
                .orderByDesc(ProductionOrder::getId)
                .last("LIMIT 10");

            return productionOrderService.list(wrapper).stream()
                .map(o -> GlobalSearchResult.OrderItem.builder()
                    .id(o.getId())
                    .orderNo(o.getOrderNo())
                    .styleName(o.getStyleName())
                    .styleNo(o.getStyleNo())
                    .factoryName(o.getFactoryName())
                    .status(o.getStatus())
                    .statusLabel(STATUS_LABELS.getOrDefault(o.getStatus(), o.getStatus()))
                    .progress(o.getProductionProgress())
                    .build())
                .collect(Collectors.toList());
        } catch (Exception e) {
            log.warn("[GlobalSearch] 订单搜索失败: {}", e.getMessage());
            return List.of();
        }
    }

    // ─── 私有：搜索款式 ──────────────────────────────────────

    private List<GlobalSearchResult.StyleItem> searchStyles(String q, Long tenantId) {
        try {
            LambdaQueryWrapper<StyleInfo> wrapper = new LambdaQueryWrapper<StyleInfo>()
                .eq(tenantId != null, StyleInfo::getTenantId, tenantId)
                .and(w -> w
                    .like(StyleInfo::getStyleNo, q)
                    .or().like(StyleInfo::getStyleName, q)
                )
                .orderByDesc(StyleInfo::getId)
                .last("LIMIT 8");

            return styleInfoService.list(wrapper).stream()
                .map(s -> GlobalSearchResult.StyleItem.builder()
                    .id(s.getId())
                    .styleNo(s.getStyleNo())
                    .styleName(s.getStyleName())
                    .category(s.getCategory())
                    .coverUrl(s.getCover())
                    .build())
                .collect(Collectors.toList());
        } catch (Exception e) {
            log.warn("[GlobalSearch] 款式搜索失败: {}", e.getMessage());
            return List.of();
        }
    }

    // ─── 私有：搜索工人 ──────────────────────────────────────

    private List<GlobalSearchResult.WorkerItem> searchWorkers(String q, Long tenantId) {
        try {
            LambdaQueryWrapper<User> wrapper = new LambdaQueryWrapper<User>()
                .eq(tenantId != null, User::getTenantId, tenantId)
                .ne(User::getStatus, "DISABLED")
                .and(w -> w
                    .like(User::getName, q)
                    .or().like(User::getPhone, q)
                )
                .orderByDesc(User::getId)
                .last("LIMIT 6");

            return userService.list(wrapper).stream()
                .map(u -> GlobalSearchResult.WorkerItem.builder()
                    .id(String.valueOf(u.getId()))
                    .name(u.getName())
                    .phone(u.getPhone())
                    .role(u.getRoleName())
                    .build())
                .collect(Collectors.toList());
        } catch (Exception e) {
            log.warn("[GlobalSearch] 工人搜索失败: {}", e.getMessage());
            return List.of();
        }
    }
}
