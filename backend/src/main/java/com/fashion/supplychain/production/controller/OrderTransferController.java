package com.fashion.supplychain.production.controller;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.production.entity.OrderTransfer;
import com.fashion.supplychain.production.service.OrderTransferService;
import com.fashion.supplychain.system.entity.User;
import com.fashion.supplychain.system.service.UserService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.util.StringUtils;
import org.springframework.web.bind.annotation.*;

import java.util.HashMap;
import java.util.Map;

/**
 * 订单转移Controller
 */
@Slf4j
@RestController
@RequestMapping("/api/production/order/transfer")
public class OrderTransferController {

    @Autowired
    private OrderTransferService orderTransferService;

    @Autowired
    private UserService userService;

    /**
     * 发起订单转移请求
     */
    @PostMapping("/create")
    public Result<?> createTransfer(@RequestBody Map<String, Object> params) {
        String orderId = (String) params.get("orderId");
        Long toUserId = params.get("toUserId") != null ? 
                Long.parseLong(params.get("toUserId").toString()) : null;
        String message = (String) params.get("message");

        if (!StringUtils.hasText(orderId)) {
            return Result.fail("订单ID不能为空");
        }
        if (toUserId == null) {
            return Result.fail("接收人ID不能为空");
        }

        try {
            OrderTransfer transfer = orderTransferService.createTransfer(orderId, toUserId, message);
            return Result.success(transfer);
        } catch (Exception e) {
            log.error("发起订单转移失败", e);
            return Result.fail(e.getMessage());
        }
    }

    /**
     * 查询待处理的转移请求
     */
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
     * 查询我发起的转移记录
     */
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
     * 查询收到的转移请求
     */
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
            LambdaQueryWrapper<User> queryWrapper = new LambdaQueryWrapper<>();
            
            if (StringUtils.hasText(keyword)) {
                queryWrapper.and(wrapper -> wrapper
                        .like(User::getName, keyword)
                        .or()
                        .like(User::getUsername, keyword)
                        .or()
                        .eq(User::getId, keyword));
            }
            
            queryWrapper.eq(User::getStatus, 1) // 只查询启用的用户
                    .orderByAsc(User::getName);

            Page<User> userPage = userService.page(new Page<>(page, pageSize), queryWrapper);
            
            // 只返回必要的字段
            Map<String, Object> result = new HashMap<>();
            result.put("total", userPage.getTotal());
            result.put("records", userPage.getRecords().stream().map(user -> {
                Map<String, Object> userInfo = new HashMap<>();
                userInfo.put("id", user.getId());
                userInfo.put("name", user.getName());
                userInfo.put("username", user.getUsername());
                return userInfo;
            }).toList());
            
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
}
