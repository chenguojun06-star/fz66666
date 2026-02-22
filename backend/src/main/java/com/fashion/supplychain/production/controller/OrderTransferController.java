package com.fashion.supplychain.production.controller;

import com.baomidou.mybatisplus.core.metadata.IPage;
import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.production.entity.OrderTransfer;
import com.fashion.supplychain.production.orchestration.OrderTransferOrchestrator;
import com.fashion.supplychain.production.service.OrderTransferService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.util.StringUtils;
import org.springframework.web.bind.annotation.*;

import java.util.HashMap;
import java.util.Map;

/**
 * 订单转移Controller
 * <p>
 * 跨域用户搜索委托给 OrderTransferOrchestrator
 */
@Slf4j
@RestController
@RequestMapping("/api/production/order/transfer")
@PreAuthorize("isAuthenticated()")
public class OrderTransferController {

    @Autowired
    private OrderTransferService orderTransferService;

    @Autowired
    private OrderTransferOrchestrator orderTransferOrchestrator;

    /**
     * 【新版统一查询】查询转移记录
     * 支持参数：
     * - type=pending: 待处理的转移请求
     * - type=my-transfers: 我发起的转移记录
     * - type=received: 收到的转移请求
     *
     * @since 2026-02-01 优化版本
     */
    @PreAuthorize("isAuthenticated()")
    @GetMapping("/list")
    public Result<?> list(@RequestParam Map<String, Object> params) {
        String type = (String) params.get("type");

        try {
            if ("pending".equals(type)) {
                IPage<OrderTransfer> page = orderTransferService.queryPendingTransfers(params);
                return Result.success(page);
            } else if ("my-transfers".equals(type)) {
                IPage<OrderTransfer> page = orderTransferService.queryMyTransfers(params);
                return Result.success(page);
            } else if ("received".equals(type)) {
                IPage<OrderTransfer> page = orderTransferService.queryReceivedTransfers(params);
                return Result.success(page);
            } else {
                // 默认查询待处理
                IPage<OrderTransfer> page = orderTransferService.queryPendingTransfers(params);
                return Result.success(page);
            }
        } catch (Exception e) {
            log.error("查询转移记录失败", e);
            return Result.fail(e.getMessage());
        }
    }

    /**
     * 发起订单转移请求
     */
    @PostMapping("/create")
    public Result<?> createTransfer(@RequestBody Map<String, Object> params) {
        String orderId = (String) params.get("orderId");
        Long toUserId = params.get("toUserId") != null ?
                Long.parseLong(params.get("toUserId").toString()) : null;
        String message = (String) params.get("message");
        String bundleIds = (String) params.get("bundleIds");
        String processCodes = (String) params.get("processCodes");

        if (!StringUtils.hasText(orderId)) {
            return Result.fail("订单ID不能为空");
        }
        if (toUserId == null) {
            return Result.fail("接收人ID不能为空");
        }

        try {
            OrderTransfer transfer = orderTransferService.createTransfer(orderId, toUserId, message, bundleIds, processCodes);
            return Result.success(transfer);
        } catch (Exception e) {
            log.error("发起订单转移失败", e);
            return Result.fail(e.getMessage());
        }
    }

    /**
     * @deprecated 已废弃，请使用 GET /list?type=pending
     * @since 2026-02-01 标记废弃，将在2026-05-01删除
     */
    @Deprecated
    @GetMapping("/pending")
    public Result<?> queryPendingTransfers(@RequestParam Map<String, Object> params) {
        try {
            IPage<OrderTransfer> page = orderTransferService.queryPendingTransfers(params);
            return Result.success(page);
        } catch (Exception e) {
            log.error("查询待处理转移请求失败", e);
            return Result.fail(e.getMessage());
        }
    }

    /**
     * 接受转移请求
     */
    @PostMapping("/accept/{transferId}")
    public Result<?> acceptTransfer(@PathVariable Long transferId) {
        try {
            boolean success = orderTransferService.acceptTransfer(transferId);
            return success ? Result.success("接受成功") : Result.fail("接受失败");
        } catch (Exception e) {
            log.error("接受转移请求失败", e);
            return Result.fail(e.getMessage());
        }
    }

    /**
     * 拒绝转移请求
     */
    @PostMapping("/reject/{transferId}")
    public Result<?> rejectTransfer(@PathVariable Long transferId, @RequestBody Map<String, Object> params) {
        String rejectReason = (String) params.get("rejectReason");

        try {
            boolean success = orderTransferService.rejectTransfer(transferId, rejectReason);
            return success ? Result.success("拒绝成功") : Result.fail("拒绝失败");
        } catch (Exception e) {
            log.error("拒绝转移请求失败", e);
            return Result.fail(e.getMessage());
        }
    }

    /**
     * @deprecated 已废弃，请使用 GET /list?type=my-transfers
     * @since 2026-02-01 标记废弃，将在2026-05-01删除
     */
    @Deprecated
    @GetMapping("/my-transfers")
    public Result<?> queryMyTransfers(@RequestParam Map<String, Object> params) {
        try {
            IPage<OrderTransfer> page = orderTransferService.queryMyTransfers(params);
            return Result.success(page);
        } catch (Exception e) {
            log.error("查询我发起的转移记录失败", e);
            return Result.fail(e.getMessage());
        }
    }

    /**
     * @deprecated 已废弃，请使用 GET /list?type=received
     * @since 2026-02-01 标记废弃，将在2026-05-01删除
     */
    @Deprecated
    @GetMapping("/received")
    public Result<?> queryReceivedTransfers(@RequestParam Map<String, Object> params) {
        try {
            IPage<OrderTransfer> page = orderTransferService.queryReceivedTransfers(params);
            return Result.success(page);
        } catch (Exception e) {
            log.error("查询收到的转移请求失败", e);
            return Result.fail(e.getMessage());
        }
    }

    /**
     * 搜索用户（按名字或ID）
     */
    @GetMapping("/search-users")
    public Result<?> searchUsers(
            @RequestParam(required = false) String keyword,
            @RequestParam(defaultValue = "1") Long page,
            @RequestParam(defaultValue = "20") Long pageSize) {

        try {
            Map<String, Object> result = orderTransferOrchestrator.searchTransferableUsers(keyword, page, pageSize);
            return Result.success(result);
        } catch (Exception e) {
            log.error("搜索用户失败", e);
            return Result.fail(e.getMessage());
        }
    }

    /**
     * 获取待处理转移数量
     */
    @GetMapping("/pending-count")
    public Result<?> getPendingCount() {
        try {
            Map<String, Object> params = new HashMap<>();
            params.put("page", "1");
            params.put("pageSize", "1");
            IPage<OrderTransfer> page = orderTransferService.queryPendingTransfers(params);
            return Result.success(Map.of("count", page.getTotal()));
        } catch (Exception e) {
            log.error("获取待处理转移数量失败", e);
            return Result.fail(e.getMessage());
        }
    }

    /**
     * 搜索可转移工厂（仅限同租户系统内部工厂）
     */
    @GetMapping("/search-factories")
    public Result<?> searchFactories(
            @RequestParam(required = false) String keyword,
            @RequestParam(defaultValue = "1") Long page,
            @RequestParam(defaultValue = "20") Long pageSize) {
        try {
            Map<String, Object> result = orderTransferOrchestrator.searchTransferableFactories(keyword, page, pageSize);
            return Result.success(result);
        } catch (Exception e) {
            log.error("搜索工厂失败", e);
            return Result.fail(e.getMessage());
        }
    }

    /**
     * 创建转工厂请求（仅限同租户系统内部工厂）
     */
    @PostMapping("/create-to-factory")
    public Result<?> createTransferToFactory(@RequestBody Map<String, Object> params) {
        try {
            String orderId = (String) params.get("orderId");
            String toFactoryId = (String) params.get("toFactoryId");
            String message = (String) params.get("message");
            String bundleIds = (String) params.get("bundleIds");
            String processCodes = (String) params.get("processCodes");

            if (!StringUtils.hasText(orderId)) {
                return Result.fail("订单ID不能为空");
            }
            if (!StringUtils.hasText(toFactoryId)) {
                return Result.fail("目标工厂不能为空");
            }

            OrderTransfer transfer = orderTransferService.createTransferToFactory(
                    orderId, toFactoryId, message, bundleIds, processCodes);
            return Result.success(transfer);
        } catch (Exception e) {
            log.error("创建转工厂请求失败", e);
            return Result.fail(e.getMessage());
        }
    }
}
