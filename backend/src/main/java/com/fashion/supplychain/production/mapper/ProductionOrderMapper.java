package com.fashion.supplychain.production.mapper;

import com.baomidou.mybatisplus.annotation.InterceptorIgnore;
import com.baomidou.mybatisplus.core.conditions.Wrapper;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.baomidou.mybatisplus.core.toolkit.Constants;
import com.fashion.supplychain.production.entity.ProductionOrder;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

import java.util.List;

/**
 * 生产订单Mapper接口
 */
@Mapper
public interface ProductionOrderMapper extends BaseMapper<ProductionOrder> {

    /**
     * 跨租户查询生产订单列表（绕过租户拦截器）。
     * 仅供 FinishedProductSettlementController.applyOrderScopeFilter 使用，禁止其他场景调用。
     * 租户隔离由调用方通过 orderWrapper.eq(tenantId) 在 WHERE 条件中自行保证。
     */
    @InterceptorIgnore(tenantLine = "true")
    @Select("SELECT id, factory_type, parent_org_unit_id, tenant_id, delete_flag "
            + "FROM t_production_order ${ew.customSqlSegment}")
    List<ProductionOrder> listForFinanceScope(@Param(Constants.WRAPPER) Wrapper<ProductionOrder> queryWrapper);
}
