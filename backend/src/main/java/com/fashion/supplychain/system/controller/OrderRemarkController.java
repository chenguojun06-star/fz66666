package com.fashion.supplychain.system.controller;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.system.entity.OrderRemark;
import com.fashion.supplychain.system.service.OrderRemarkService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.util.StringUtils;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

/**
 * 通用备注 Controller
 * - 按订单号(大货)或款号(样衣开发)收集各节点人员的备注
 */
@RestController
@RequestMapping("/api/system/order-remark")
@PreAuthorize("isAuthenticated()")
public class OrderRemarkController {

    @Autowired
    private OrderRemarkService orderRemarkService;

    /**
     * 查询备注列表（按 targetType + targetNo）
     */
    @PostMapping("/list")
    public Result<List<OrderRemark>> list(@RequestBody Map<String, Object> params) {
        String targetType = (String) params.get("targetType");
        String targetNo = (String) params.get("targetNo");
        if (!StringUtils.hasText(targetType) || !StringUtils.hasText(targetNo)) {
            return Result.fail("targetType 和 targetNo 不能为空");
        }
        Long tenantId = UserContext.tenantId();
        LambdaQueryWrapper<OrderRemark> wrapper = new LambdaQueryWrapper<OrderRemark>()
                .eq(tenantId != null, OrderRemark::getTenantId, tenantId)
                .eq(OrderRemark::getTargetType, targetType)
                .eq(OrderRemark::getTargetNo, targetNo)
                .eq(OrderRemark::getDeleteFlag, 0)
                .orderByDesc(OrderRemark::getCreateTime);
        List<OrderRemark> list = orderRemarkService.list(wrapper);
        return Result.success(list);
    }

    /**
     * 新增备注
     */
    @PostMapping("/add")
    public Result<OrderRemark> add(@RequestBody OrderRemark remark) {
        if (!StringUtils.hasText(remark.getTargetType()) || !StringUtils.hasText(remark.getTargetNo())) {
            return Result.fail("targetType 和 targetNo 不能为空");
        }
        if (!StringUtils.hasText(remark.getContent())) {
            return Result.fail("备注内容不能为空");
        }

        UserContext ctx = UserContext.get();
        if (ctx != null) {
            remark.setAuthorId(ctx.getUserId());
            remark.setAuthorName(ctx.getUsername());
            if (!StringUtils.hasText(remark.getAuthorRole())) {
                remark.setAuthorRole(ctx.getRole());
            }
            remark.setTenantId(ctx.getTenantId());
        }
        remark.setCreateTime(LocalDateTime.now());
        remark.setDeleteFlag(0);

        orderRemarkService.save(remark);
        return Result.success(remark);
    }
}
