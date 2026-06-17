package com.fashion.supplychain.system.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.common.tenant.TenantAssert;
import com.fashion.supplychain.system.entity.OrderRemark;
import com.fashion.supplychain.system.service.OrderRemarkService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.time.LocalDateTime;
import java.util.List;

/**
 * 订单备注编排器 — 统一负责 t_order_remark 的写操作，
 * 确保事务一致性与多租户上下文校验。
 *
 * 查询操作仍可直接由 Controller 调用 OrderRemarkService，
 * 但新增/修改必须走本编排器。
 */
@Slf4j
@Service
public class OrderRemarkOrchestrator {

    @Autowired
    private OrderRemarkService orderRemarkService;

    /**
     * 保存一条订单/款号备注。
     *
     * 自动注入作者信息（id / name / role）、租户ID、创建时间、
     * 以及软删除标记。保证所有写操作经过同一入口，便于后续扩展
     * （例如：多端同步推送、审计日志等）。
     *
     * @param remark 客户端提交的备注对象（targetType / targetNo / content 为必填）
     */
    @Transactional(rollbackFor = Exception.class)
    public OrderRemark save(OrderRemark remark) {
        TenantAssert.assertTenantContext();

        // 基本参数校验（Controller 侧已有，但编排器再做一次防御性校验）
        if (!StringUtils.hasText(remark.getTargetType())
                || !StringUtils.hasText(remark.getTargetNo())
                || !StringUtils.hasText(remark.getContent())) {
            throw new IllegalArgumentException("targetType / targetNo / content 不能为空");
        }

        // 从 UserContext 注入作者与租户信息
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

        log.info("[OrderRemark] 已保存备注 id={} targetType={} targetNo={} authorName={}",
                remark.getId(), remark.getTargetType(), remark.getTargetNo(), remark.getAuthorName());
        return remark;
    }

    /**
     * 按订单号查询该订单下所有备注（含订单内嵌备注与采购备注）。
     * 注意：本方法仅返回 t_order_remark 表中存储的记录，
     * 订单内嵌文本解析、采购单 remark 合并等逻辑仍由 Controller 完成。
     */
    public List<OrderRemark> queryByOrderId(String orderNo) {
        TenantAssert.assertTenantContext();
        if (!StringUtils.hasText(orderNo)) {
            return java.util.Collections.emptyList();
        }
        Long tenantId = UserContext.tenantId();
        return orderRemarkService.list(new LambdaQueryWrapper<OrderRemark>()
                .eq(OrderRemark::getTenantId, tenantId)
                .eq(OrderRemark::getTargetType, "order")
                .eq(OrderRemark::getTargetNo, orderNo)
                .eq(OrderRemark::getDeleteFlag, 0)
                .orderByDesc(OrderRemark::getCreateTime));
    }

    /**
     * 按目标类型与目标编号查询备注列表。
     * 例如：targetType="style", targetNo=款号；targetType="order", targetNo=订单号。
     */
    public List<OrderRemark> queryByTargetNo(String targetType, String targetNo) {
        TenantAssert.assertTenantContext();
        if (!StringUtils.hasText(targetType) || !StringUtils.hasText(targetNo)) {
            return java.util.Collections.emptyList();
        }
        Long tenantId = UserContext.tenantId();
        return orderRemarkService.list(new LambdaQueryWrapper<OrderRemark>()
                .eq(OrderRemark::getTenantId, tenantId)
                .eq(OrderRemark::getTargetType, targetType)
                .eq(OrderRemark::getTargetNo, targetNo)
                .eq(OrderRemark::getDeleteFlag, 0)
                .orderByDesc(OrderRemark::getCreateTime));
    }
}
