package com.fashion.supplychain.finance.mapper;

import com.baomidou.mybatisplus.annotation.InterceptorIgnore;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.fashion.supplychain.finance.entity.FinishedProductSettlement;
import org.apache.ibatis.annotations.Mapper;

/**
 * 成品结算Mapper（映射视图 v_finished_product_settlement）。
 *
 * 类级别 @InterceptorIgnore(tenantLine="true") 绕过租户拦截器：
 * 租户隔离通过 Controller 中 applyOrderScopeFilter 的 IN(orderIds) 条件保证：
 *   - 普通租户：orderIds 已经过 WHERE tenant_id=X 过滤，天然隔离；
 *   - 超管：应查看所有租户数据，无需额外隔离。
 * 因此对拦截器的绕过是安全且正确的行为。
 *
 * ⚠️ 禁止在此接口中 @Override selectPage 等 BaseMapper 方法，
 *    否则 MyBatis-Plus 自动注入失效 → BindingException 500。
 */
@Mapper
@InterceptorIgnore(tenantLine = "true")
public interface FinishedProductSettlementMapper extends BaseMapper<FinishedProductSettlement> {
}
