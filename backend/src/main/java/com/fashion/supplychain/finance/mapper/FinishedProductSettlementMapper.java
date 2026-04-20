package com.fashion.supplychain.finance.mapper;

import com.baomidou.mybatisplus.annotation.InterceptorIgnore;
import com.baomidou.mybatisplus.core.conditions.Wrapper;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.core.toolkit.Constants;
import com.fashion.supplychain.finance.entity.FinishedProductSettlement;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

/**
 * 成品结算Mapper（映射视图 v_finished_product_settlement）
 */
@Mapper
public interface FinishedProductSettlementMapper extends BaseMapper<FinishedProductSettlement> {

    /**
     * 分页查询成品结算（绕过租户拦截器）。
     * 租户隔离通过 applyOrderScopeFilter 的 IN(orderIds) 条件保证：
     *   - 普通租户：orderIds 已经过 WHERE tenant_id=X 过滤，天然隔离；
     *   - 超管：应查看所有租户数据，无需额外隔离。
     * 因此本方法对拦截器的绕过是安全且正确的行为。
     */
    @Override
    @InterceptorIgnore(tenantLine = "true")
    <E extends IPage<FinishedProductSettlement>> E selectPage(E page,
            @Param(Constants.WRAPPER) Wrapper<FinishedProductSettlement> queryWrapper);
}
